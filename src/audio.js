/* ============================================================
 * 音频总线（S16）
 *
 * 为什么要独立一层，而不是继续往 fx.js 的 SFX 里塞：
 *   · SFX 是「音效名 → 一段合成音」的扁平表，181 处调用点，
 *     它没有总线、没有空间感、没有预算，也没有「谁在发声」的概念。
 *   · 怪物声需要三样它给不了的东西：**距离衰减**、**左右定位**、
 *     **同时发声数上限**（40 只怪一起叫会糊成一团噪音，比没声音更糟）。
 *
 * 结构：
 *   master(总音量 × 静音) → 压缩器 → destination
 *     ├── bus.sfx    技能 / 打击 / UI
 *     ├── bus.amb    环境底噪与点缀
 *     └── bus.music  三层 BGM（探索 / 战斗 / 首领，淡入淡出）
 *
 * 两条硬规矩（踩过，别改回去）：
 *   1. **AudioContext 必须显式 resume()**。只 new 不 resume 的话，
 *      在 Chrome 的自动播放策略下它会一直 suspended、currentTime 恒为 0，
 *      于是「所有音效都不响」但代码看起来毫无问题 —— 这个 bug 真发生过，
 *      整局游戏一点声音都没有，而 SFX.on 还是 true。
 *   2. **音频只能由用户手势解锁**。不要试图在 load / setTimeout 里自动播放，
 *      Chrome 与 iOS Safari 都会静默失败；这里挂在 pointerdown / touchstart /
 *      keydown 上，并且把「用户想要的环境音 / BGM」记下来（_wantAmb / _wantBgm），
 *      等解锁那一刻再补上。
 *
 * 零资产：所有声音都是振荡器 + 噪声 + 滤波器实时合成。
 * 若以后有了真录音，命名成 audio/sfx/<family>_<event>.mp3 就会被优先使用，
 * 调用方（game.js）一行不改。
 * ============================================================ */

const AudioSys = {
  ctx: null,
  on: true,            // 全局开关（合成失败 / 浏览器不支持时置 false）
  unlocked: false,     // 是否已经由用户手势解除自动播放限制
  master: null,
  comp: null,
  bus: null,
  noiseBuf: null,

  /* 声部预算：40 只怪同时叫会糊，这几条是「不糊」的全部秘密 */
  LIMITS: {
    voices: 6,        // 同时最多 6 路怪声（首领 / 阶段转换不受限）
    dedupe: 0.08,     // 同族同事件 80ms 内只发一次（狼群齐咬听起来是一声）
    far: 24,          // 超过 24 米不发声（听不见，也省预算）
    idleFar: 15,      // 闲态叫声只给 15 米内
    idleMin: 6,       // 同一只怪两次闲态的最短间隔
    idleMax: 12,
    steal: 0.7        // 预算满时，新声要比最远那条近 30% 以上才顶掉它
  },

  _slots: [],         // [{ end, d }] 当前占用中的怪声（d 用于「近的挤掉远的」）
  _last: {},          // 'family:event' → 上次发声时刻
  _samples: {},       // 'family_event' → 已解码的真录音
  _sampleTried: {},   // 已经尝试过的键（失败也记，避免每帧重试）
  _amb: null,         // { id, spec, gain, nodes }
  _wantAmb: null,
  _layers: null,      // { explore, combat, boss } 三个 GainNode
  _bgmMode: 'explore',
  _wantBgm: 'explore',
  _beat: 0,
  _step: 0,
  _decoT: 0,
  _fwd: null,
  _hooked: false,
  _hidden: false,

  /* ---------------- 初始化 ---------------- */

  init() {
    if (this.ctx) return this.ctx;
    if (!this.on) return null;
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) { this.on = false; return null; }
    try {
      const c = new AC();
      this.ctx = c;

      this.master = c.createGain();
      this.master.gain.value = 0.8;

      /* 压缩器参数：动作游戏峰值密集，阈值压低 + 快启动，
       * 40 只怪同叫也不会削波；释放 0.18s 让爆炸听起来还有尾巴 */
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      this.comp = comp;

      this.master.connect(comp);
      comp.connect(c.destination);

      const mk = () => { const g = c.createGain(); g.gain.value = 1; g.connect(this.master); return g; };
      this.bus = { sfx: mk(), amb: mk(), music: mk() };

      /* 1 秒白噪声，所有噪声类音色共用（重复 new 会白占内存） */
      const len = Math.floor(c.sampleRate * 1.0);
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.applyVolumes();
      this._hookEnv();
      return c;
    } catch (e) {
      this.on = false;
      this.ctx = null;
      return null;
    }
  },

  /* 用户手势解锁。可以反复调用，已经在跑就什么都不做。 */
  unlock() {
    const c = this.init();
    if (!c) return false;
    try {
      if (c.state === 'suspended') c.resume();
    } catch (e) { /* 某些浏览器在没有手势时直接抛，忽略即可 */ }
    /* resume() 是异步的：调用后这一瞬间 state 仍是 'suspended'，
     * 真正变成 'running' 是在之后的微任务里。只听一次 statechange，
     * 才能保证「用户想要的环境音 / BGM」在那之后补齐。 */
    if (!this._watching && c.addEventListener) {
      this._watching = true;
      c.addEventListener('statechange', () => { if (c.state === 'running') this._onRunning(); });
    }
    if (c.state === 'running') this._onRunning();
    return c.state === 'running';
  },

  /* 解除限制之后补上「用户本来应该听到的东西」 */
  _onRunning() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this._wantAmb) this.ambient(this._wantAmb);
    if (this._wantBgm) this.bgm(this._wantBgm);
  },

  _hookEnv() {
    if (this._hooked || typeof window === 'undefined') return;
    this._hooked = true;
    const un = () => this.unlock();
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
      window.addEventListener(ev, un, { capture: true, passive: true }));
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this._hidden = true; this.suspend(); }
        else if (this._hidden) { this._hidden = false; this.resume(); }
      });
    }
  },

  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} },
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {} },

  /* ---------------- 音量 ---------------- */

  /* 感知曲线：线性滑杆听感上「前半段没声音」，所以取 1.6 次幂 */
  gainOf(v) {
    const x = Math.max(0, Math.min(100, Number(v) == null || isNaN(v) ? 0 : Number(v))) / 100;
    return Math.pow(x, 1.6);
  },

  _vol(k, def) {
    if (typeof Settings === 'undefined' || !Settings.d) return def;
    const v = Settings.d[k];
    return (v == null || isNaN(v)) ? def : Number(v);
  },

  applyVolumes() {
    if (!this.master || !this.bus) return;
    const mute = (typeof Settings !== 'undefined' && Settings.d) ? !!Settings.d.mute : false;
    this.master.gain.value = mute ? 0 : this.gainOf(this._vol('volMaster', 80));
    this.bus.sfx.gain.value = this.gainOf(this._vol('volSfx', 80));
    this.bus.amb.gain.value = this.gainOf(this._vol('volAmb', 55));
    this.bus.music.gain.value = this.gainOf(this._vol('volMusic', 45));
  },

  /* ---------------- 基础发声 ---------------- */

  _running() { return !!(this.ctx && this.ctx.state === 'running'); },

  tone(freq, dur, type = 'sine', gain = 0.2, slideTo, dest) {
    const c = this.ctx;
    if (!c || !this._running()) return;
    const t = c.currentTime;
    const out = dest || this.bus.sfx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(16, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(16, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur = 0.15, gain = 0.2, freq = 1200, q = 1, dest) {
    const c = this.ctx;
    if (!c || !this._running() || !this.noiseBuf) return;
    const t = c.currentTime;
    const out = dest || this.bus.sfx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  },

  /* ---------------- 空间化 ---------------- */

  _panner(pos, dist) {
    const c = this.ctx;
    if (!c || !pos) return null;
    const pn = c.createPanner();
    pn.panningModel = 'HRTF';       // 能听出左右与前后，动作游戏是刚需
    pn.distanceModel = 'inverse';
    pn.refDistance = 4;
    pn.maxDistance = this.LIMITS.far;
    pn.rolloffFactor = 1.25;
    const y = (pos.y == null) ? 1 : pos.y;
    if (pn.positionX) {
      pn.positionX.value = pos.x; pn.positionY.value = y; pn.positionZ.value = pos.z;
    } else if (pn.setPosition) pn.setPosition(pos.x, y, pos.z);
    return pn;
  },

  /* 每帧把听者摆到相机上。用缓存向量，避免每帧 new Vector3。 */
  listener(cam) {
    const c = this.ctx;
    if (!c || !cam || !this._running()) return;
    const L = c.listener, p = cam.position;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      if (!this._fwd && typeof THREE !== 'undefined') this._fwd = new THREE.Vector3();
      if (this._fwd && cam.getWorldDirection) {
        cam.getWorldDirection(this._fwd);
        L.forwardX.value = this._fwd.x; L.forwardY.value = this._fwd.y; L.forwardZ.value = this._fwd.z;
      }
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y, p.z);
    }
  },

  /* ---------------- 素材回退 ----------------
   * 合成是默认路径，真录音是**可选加速**：
   *   data-fauna.js 的 AUDIO_SFX 里写一行 'beast_attack': 'audio/sfx/beast_attack.mp3'，
   *   那条声音就改用素材；没写、写了但文件不存在、解码失败，全部静默回退合成。
   *
   * 为什么用清单而不是「按路径猜文件在不在」：
   * 猜路径得对每个「族 × 事件」发一次请求，缺文件时控制台会刷 404，
   * 而 404 在真机探针里算「页面报错」—— 一条装饰性的回退功能不该污染错误日志。
   * 清单默认是空的，所以不带任何请求，删掉整个 audio/sfx/ 目录也照跑。
   */

  _key(fam, ev) { return fam + '_' + ev; },

  _sample(family, ev, out, gainScale) {
    const key = this._key(family, ev);
    const buf = this._samples[key];
    if (!buf) { this._tryLoad(key); return 0; }
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = (gainScale == null ? 1 : gainScale);
    s.connect(g); g.connect(out);
    s.start(t);
    return buf.duration;
  },

  _tryLoad(key) {
    if (this._sampleTried[key]) return;
    this._sampleTried[key] = true;
    const url = (typeof AUDIO_SFX !== 'undefined') ? AUDIO_SFX[key] : null;
    if (!url || !this.ctx || typeof fetch !== 'function') return;
    /* fire-and-forget：没解码完的那几次照常合成，解码好了之后自动接管 */
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('miss'); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => {
        try { this.ctx.decodeAudioData(ab, res, rej); } catch (e) { rej(e); }
      }))
      .then(b => { if (b && b.duration > 0) this._samples[key] = b; })
      .catch(() => { /* 缺文件 / 解码失败：保持合成，不打扰任何人 */ });
  },

  /* ---------------- 族音色合成 ---------------- */

  /**
   * 合成一次「族发声」。返回时长（秒），不发声时返回 0。
   * @param {object} fam  FAMILY_TONES 里的一条
   * @param {object} mod  VOICE_EVENTS 里的一条
   * @param {number} size 体型倍数（>1 越大越低沉）
   * @param {AudioNode} out 输出节点（可能是 PannerNode）
   * @param {number} gainScale 额外音量系数
   */
  _synthVoice(fam, mod, size, out, gainScale) {
    const c = this.ctx;
    if (!c || !fam || !out) return 0;
    const t0 = c.currentTime + 0.004;

    /* 体型 → 音高：1/size^0.55。取 0.55 而不是 1，是因为按体积等比降调
     * 会让 Boss 掉到 20Hz 以下（听不见，只剩噪声）；0.55 保留「大」的感觉又不糊。 */
    const sizePitch = Math.pow(1 / Math.max(0.55, size || 1), 0.55);
    const jitter = 0.94 + Math.random() * 0.12;       // 每次不一样，避免机关枪感
    const pitch = Math.max(18, fam.base * mod.pitch * sizePitch * jitter);
    const dur = Math.max(0.05, fam.dur * mod.dur);
    const peak = fam.gain * mod.gain * (gainScale == null ? 1 : gainScale);

    /* 主低通：所有层都从这里过，保证「同一只怪的音色统一」 */
    const flt = c.createBiquadFilter();
    flt.type = fam.filter.type;
    flt.frequency.value = Math.max(80, fam.filter.freq * (mod.bright || 1) * (0.85 + Math.random() * 0.3));
    flt.Q.value = fam.filter.q;
    flt.connect(out);

    const g = c.createGain();
    const atk = Math.min(0.02, dur * 0.25);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0005, peak), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(flt);

    /* 主振荡器 */
    const o = c.createOscillator();
    o.type = fam.osc;
    o.frequency.setValueAtTime(pitch, t0);
    const endPitch = Math.max(16, pitch * (fam.rise && mod.pitch > 1 ? fam.rise : mod.slide));
    o.frequency.exponentialRampToValueAtTime(endPitch, t0 + dur * 0.92);
    o.connect(g);
    o.start(t0); o.stop(t0 + dur + 0.05);

    /* 第二层：次谐波（体量感）或泛音（质感） */
    if (fam.osc2) {
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.linearRampToValueAtTime(Math.max(0.0005, peak * fam.osc2.gain), t0 + atk);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.9);
      g2.connect(flt);
      const o2 = c.createOscillator();
      o2.type = fam.osc2.type;
      o2.frequency.setValueAtTime(Math.max(16, pitch * fam.osc2.mul), t0);
      o2.frequency.exponentialRampToValueAtTime(Math.max(16, endPitch * fam.osc2.mul), t0 + dur * 0.92);
      o2.connect(g2);
      o2.start(t0); o2.stop(t0 + dur + 0.05);
    }

    /* 颤音：兽的喉音、虫的嗡鸣、妖灵的飘，全靠这一层 */
    if (fam.vib) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = fam.vib.rate;
      lg.gain.value = fam.vib.depth * sizePitch;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }

    /* 噪声层：气声 / 摩擦 / 沙石。亡灵几乎全靠它，人形只作点缀 */
    if (fam.noise && fam.noise.gain > 0 && this.noiseBuf) {
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      const nf = c.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = Math.max(60, fam.noise.freq * (mod.bright || 1));
      nf.Q.value = fam.noise.q;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.linearRampToValueAtTime(Math.max(0.0005, peak * fam.noise.gain), t0 + 0.012);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
      ns.connect(nf); nf.connect(ng); ng.connect(flt);
      ns.start(t0); ns.stop(t0 + dur + 0.05);
    }

    return dur;
  },

  /**
   * 直接发声（不过声部预算）。首领 / 阶段转换 / 剧情演出走这里。
   */
  voice(family, size, ev, opts = {}) {
    const c = this.ctx;
    if (!c || !this._running() || !this.on) return 0;
    /* 数据表缺失时安静返回 0，不要 ReferenceError：
     * 「`typeof X !== 'undefined' && X[k] || X.def`」这个写法本身会在 X 不存在时崩
     * （短路后仍然去读 X.def），所以必须先落成 null 再取默认 */
    const FT = (typeof FAMILY_TONES !== 'undefined') ? FAMILY_TONES : null;
    const VE = (typeof VOICE_EVENTS !== 'undefined') ? VOICE_EVENTS : null;
    const fam = (FT && (FT[family] || FT.humanoid)) || null;
    const mod = (VE && (VE[ev] || VE.attack)) || null;
    if (!fam || !mod) return 0;
    let out = this.bus.sfx;
    let pn = null;
    if (opts.pos) {
      pn = this._panner(opts.pos, opts.dist);
      if (pn) { pn.connect(out); out = pn; }
    }
    /* 真录音优先（清单里有才会去取）。取到就整段播，不再叠合成层 ——
     * 素材本来就是成品，再叠尾音只会脏 */
    const real = this._sample(family, ev, out, opts.gain);
    if (real > 0) return real;
    const dur = this._synthVoice(fam, mod, size, out, opts.gain);
    /* 尾音与次低频另起一条，接在同一个空间节点上，保证它们一起衰减 */
    if (mod.tail) this.tone(fam.base * 2.2, 0.55, 'triangle', 0.05, fam.base * 1.1, out);
    if (mod.sub) this.tone(46, 1.6, 'sine', 0.22, 28, out);
    return dur;
  },

  _prune() {
    if (!this._slots.length) return;
    const now = this.ctx ? this.ctx.currentTime : 0;
    this._slots = this._slots.filter(s => s.end > now);
  },

  /* 在相机背后吗？只用来排优先级，不用来「一律不播」——
   * 设计稿写的是「屏幕外只播 aggro / death / bossPhase」，但真按那个做，
   * 背后砍你的怪会一点声音都没有，而空间化存在的意义正是听声辨位。
   * 折中：预算没满时背后照播（玩家知道有人摸过来了），
   * 预算满了才让位给视野内的 —— 不糊，也不瞎。 */
  _behind(pos) {
    if (!pos || !this._fwd) return false;
    const L = this.ctx && this.ctx.listener;
    if (!L || !L.positionX) return false;
    const dx = pos.x - L.positionX.value, dz = pos.z - L.positionZ.value;
    return (dx * this._fwd.x + dz * this._fwd.z) < 0;
  },

  /**
   * 怪物发声（带距离、去重、预算）。game.js 只调这一个。
   * @param {object} e 敌人对象，需要 pos / family / size
   * @param {string} ev attack | hurt | death | aggro | idle | elite | bossPhase
   * @returns {boolean} 真的发声了没有（测试与调试用）
   */
  mob(e, ev) {
    const c = this.ctx;
    if (!c || !this._running() || !this.on) return false;
    if (!e || !e.pos) return false;

    const cam = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.position : null;
    const py = (e.pos.y || 0) + 1;
    const d = cam ? Math.sqrt((e.pos.x - cam.x) ** 2 + (py - cam.y) ** 2 + (e.pos.z - cam.z) ** 2) : 0;

    const far = ev === 'idle' ? this.LIMITS.idleFar : this.LIMITS.far;
    if (d > far) return false;
    if (ev === 'idle' && e.aggro) return false;

    const key = (e.family || 'humanoid') + ':' + ev;
    const now = c.currentTime;
    const big = ev === 'elite' || ev === 'bossPhase' || !!e.boss;
    /* 死亡 / 精英 / 阶段不做去重 —— 那几种「一声」本身就是信息 */
    if (!big && now - (this._last[key] || -9) < this.LIMITS.dedupe) return false;

    this._prune();
    /* 预算满了不是「一律丢弃」，而是比远近：
     * 新来的比占着名额里最远的那条还要近 30% 以上，就顶掉它。
     * 从前到后先到先得，结果是一只贴脸狼的咬击被远处三只怪的闲叫占掉名额。 */
    if (!big && this._slots.length >= this.LIMITS.voices) {
      if (this._behind(e.pos)) return false;
      let worst = -1, wd = -1;
      this._slots.forEach((s, i) => { if (!s.big && s.d > wd) { wd = s.d; worst = i; } });
      if (worst < 0 || d > wd * this.LIMITS.steal) return false;
      this._slots.splice(worst, 1);
    }

    this._last[key] = now;
    const size = e.size || (e.actor && e.actor.group && e.actor.group.scale.x) || 1;
    const dur = this.voice(e.family, size, ev, { pos: e.pos, dist: d });
    if (dur > 0) this._slots.push({ end: now + dur, d, big });
    return dur > 0;
  },

  /* 闲态叫声的计时由这里管：每只怪一个随机 6~12 秒的倒计时。
   * 放在 tick 之外单独调，是为了让「没仇恨的怪」也能发出一点动静。 */
  mobIdle(e, dt) {
    if (!this.on || !e || e.dead || e.aggro) return;
    if (e._sndT == null) e._sndT = this.LIMITS.idleMin + Math.random() * (this.LIMITS.idleMax - this.LIMITS.idleMin);
    e._sndT -= dt;
    if (e._sndT > 0) return;
    e._sndT = this.LIMITS.idleMin + Math.random() * (this.LIMITS.idleMax - this.LIMITS.idleMin);
    this.mob(e, 'idle');
  },

  /* ---------------- 环境音 ---------------- */

  ambient(mapId) {
    this._wantAmb = mapId;
    const c = this.init();
    if (!c || !this._running()) return;
    if (this._amb && this._amb.id === mapId) return;
    const AMB = (typeof MAP_AMB !== 'undefined') ? MAP_AMB : null;
    const spec = (AMB && (AMB[mapId] || AMB.village)) || null;
    if (!spec) return;
    /* BGM 的调式跟着地图走（主音 / 音阶 / 速度都在 MAP_AMB 里），
     * 所以换图时音乐不用重启，只是换了音符来源 —— 听觉上是「同一个世界」。 */
    this._ambId = spec.id;
    this.stopAmbient(1.2);

    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(spec.gain, t + 1.4);
    g.connect(this.bus.amb);

    const nodes = [];
    /* 底噪：一声白噪声 → 滤波 → 慢速起伏。风、水、地脉的区别只在滤波与 LFO */
    const ns = c.createBufferSource();
    ns.buffer = this.noiseBuf; ns.loop = true;
    const f = c.createBiquadFilter();
    const dark = spec.kind === 'cave' || spec.kind === 'void' || spec.kind === 'swamp';
    f.type = dark ? 'lowpass' : 'bandpass';
    f.frequency.value = spec.filter.freq;
    f.Q.value = spec.filter.q;
    const ng = c.createGain();
    ng.gain.value = spec.noiseGain;
    ns.connect(f); f.connect(ng); ng.connect(g);
    ns.start(t);
    nodes.push(ns);

    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = spec.lfo.rate;
    lg.gain.value = spec.lfo.depth * 0.5;
    lfo.connect(lg); lg.connect(ng.gain);
    lfo.start(t);
    nodes.push(lfo);

    if (spec.drone) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = spec.drone;
      og.gain.value = 0.05;
      o.connect(og); og.connect(g);
      o.start(t);
      nodes.push(o);
    }

    this._amb = { id: mapId, spec, gain: g, nodes };
    this._decoT = 1.2 + Math.random() * 2.5;
  },

  stopAmbient(fade = 0.8) {
    const a = this._amb;
    if (!a) return;
    this._amb = null;
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    try {
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(Math.max(0.0001, a.gain.gain.value), t);
      a.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* 已经断开就忽略 */ }
    setTimeout(() => {
      for (const n of a.nodes) { try { n.stop(); } catch (e) {} }
      try { a.gain.disconnect(); } catch (e) {}
    }, (fade + 0.2) * 1000);
  },

  /* 随机点缀：鸟叫 / 虫鸣 / 滴水 / 气泡 / 远处钟声。
   * 这些是「地图有生气」的九成来源，成本却只是几个振荡器。 */
  _deco() {
    const a = this._amb;
    if (!a || !this._running()) return;
    const list = a.spec.deco || [];
    if (!list.length) return;
    const kind = list[Math.floor(Math.random() * list.length)];
    const out = this.bus.amb;

    const ping = (freq, to, dur, gain, type) => this.tone(freq, dur, type || 'sine', gain, to, out);

    switch (kind) {
      case 'bird': {
        /* 两声短鸣，第二声更高更轻 */
        ping(1750 + Math.random() * 500, 2350, 0.075, 0.055);
        setTimeout(() => ping(2100 + Math.random() * 600, 2700, 0.06, 0.04), 110);
        break;
      }
      case 'cricket': {
        for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.035, 0.03, 4200, 4, out), i * 70);
        break;
      }
      case 'creak': {
        ping(96, 68, 0.42, 0.035, 'sawtooth');
        break;
      }
      case 'bubble': {
        ping(280 + Math.random() * 120, 900, 0.13, 0.05);
        break;
      }
      case 'frog': {
        ping(182, 150, 0.09, 0.05, 'square');
        setTimeout(() => ping(170, 140, 0.08, 0.04, 'square'), 130);
        break;
      }
      case 'drip': {
        ping(1500 + Math.random() * 400, 820, 0.2, 0.05);
        break;
      }
      case 'rock': {
        this.noise(0.16, 0.05, 200, 0.9, out);
        break;
      }
      case 'whisper': {
        this.noise(0.6, 0.035, 1250, 3.2, out);
        break;
      }
      case 'chime': {
        ping(1320, 1320, 1.1, 0.035);
        setTimeout(() => ping(1980, 1980, 0.9, 0.022), 40);
        break;
      }
      case 'bell': {
        ping(520, 512, 1.6, 0.045);
        setTimeout(() => ping(780, 772, 1.2, 0.025), 60);
        break;
      }
      default: break;
    }
  },

  /* ---------------- BGM 三层 ---------------- */

  _mkLayers() {
    if (this._layers || !this.ctx) return;
    const c = this.ctx;
    this._layers = {};
    for (const k of ['explore', 'combat', 'boss']) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.bus.music);
      this._layers[k] = g;
    }
  },

  /**
   * 切 BGM 层。可以每帧调，内部只在真正换层时才做淡变。
   * @param {'explore'|'combat'|'boss'} mode
   */
  bgm(mode) {
    if (!this.on) return;
    this._wantBgm = mode;
    const c = this.init();
    if (!c || !this._running()) return;
    this._mkLayers();
    const lay = this._layers && this._layers[mode];
    if (!lay) return;                       // 未知层名：不静默改成别的层
    if (this._bgmMode === mode && lay.gain.value > 0.4) return;
    this._bgmMode = mode;
    const t = c.currentTime;
    for (const k in this._layers) {
      const g = this._layers[k];
      const target = k === mode ? 1 : 0;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(target, t + 1.1);
      } catch (e) { g.gain.value = target; }
    }
    this._beat = Math.min(this._beat, 0.05);
  },

  _note(freq, dur, gain, type, dest) { this.tone(freq, dur, type, gain, null, dest); },

  /* 一拍一次：探索是稀疏的和弦垫，战斗是五声音阶跑动 + 底鼓，首领加重低音与鼓点。
   * 不做完整编曲 —— 这层只是「有呼吸」，别抢技能音效的频段。 */
  _musicTick(dt) {
    const mode = this._bgmMode || 'explore';
    /* 先看有没有这一层的增益节点：bgm() 还没被调过时（没进过图、或者音频没解锁），
     * 这里不该推进节拍 —— 否则解锁那一刻会「补播」一串积压的音符 */
    const g = this._layers && this._layers[mode];
    if (!g) return;
    const AMB = (typeof MAP_AMB !== 'undefined') ? MAP_AMB : null;
    const BGM = (typeof BGM_MODES !== 'undefined') ? BGM_MODES : null;
    const spec = (AMB && (AMB[this._ambId] || AMB.village)) || null;
    const cfg = (BGM && (BGM[mode] || BGM.explore)) || null;
    if (!spec || !cfg) return;
    const bpm = spec.bpm * cfg.bpmMul;
    const beat = 60 / Math.max(30, bpm);
    this._beat -= dt;
    if (this._beat > 0) return;
    this._beat += beat;
    if (this._beat <= 0) this._beat = beat;
    this._step = (this._step || 0) + 1;

    const sc = spec.scale, root = spec.root, i = this._step;
    const semi = n => root * Math.pow(2, n / 12);

    if (mode === 'explore') {
      if (i % 4 === 0) {
        this._note(root * 0.5, beat * 3.4, 0.05 * cfg.gain, 'sine', g);
        this._note(semi(sc[2]) * 0.5, beat * 3.4, 0.03 * cfg.gain, 'sine', g);
      }
      if (i % 8 === 5) this._note(semi(sc[i % sc.length]) * 2, beat * 1.6, 0.035 * cfg.gain, 'triangle', g);
    } else if (mode === 'combat') {
      this._note(semi(sc[i % sc.length]), beat * 0.85, 0.05 * cfg.gain, 'triangle', g);
      if (i % 2 === 0) this.noise(0.05, 0.05 * cfg.perc, 220, 1.2, g);
      if (i % 4 === 0) this._note(root * 0.5, beat * 1.8, 0.07 * cfg.gain, 'sawtooth', g);
    } else {
      if (i % 2 === 0) this._note(root * 0.5, beat * 2.2, 0.08 * cfg.gain, 'sawtooth', g);
      this._note(semi(sc[i % sc.length]), beat * 1.1, 0.045 * cfg.gain, 'square', g);
      if (i % 2 === 0) this.noise(0.1, 0.09 * cfg.perc, 150, 0.8, g);
      if (i % 8 === 0) this._note(root * 0.25, beat * 4, 0.07, 'sine', g);
    }
  },

  /* ---------------- 每帧 ----------------
   * 只做三件便宜的事：听者跟随相机、环境点缀、BGM 节拍。
   * 没初始化 / 被挂起时立刻返回（游戏刚开场还没点过鼠标就是这种状态）。 */
  tick(dt, cam) {
    if (!this._running()) return;
    if (!this.unlocked) this._onRunning();
    this.listener(cam);
    if (this._amb) {
      this._decoT -= dt;
      if (this._decoT <= 0) {
        this._decoT = 2 + Math.random() * 4;
        this._deco();
      }
    }
    this._musicTick(dt);
  },

  /* ---------------- 调试 / 测试 ---------------- */

  stats() {
    this._prune();
    return {
      on: this.on,
      state: this.ctx ? this.ctx.state : 'none',
      unlocked: this.unlocked,
      voices: this._slots.length,
      samples: Object.keys(this._samples).length,
      mode: this._bgmMode,
      amb: this._amb ? this._amb.id : null,
      master: this.master ? +this.master.gain.value.toFixed(3) : null,
      sfx: this.bus ? +this.bus.sfx.gain.value.toFixed(3) : null,
      ambGain: this.bus ? +this.bus.amb.gain.value.toFixed(3) : null,
      music: this.bus ? +this.bus.music.gain.value.toFixed(3) : null
    };
  }
};

if (typeof window !== 'undefined') window.AudioSys = AudioSys;
