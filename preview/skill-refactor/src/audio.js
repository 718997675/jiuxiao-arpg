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
  _bgmEl: null,       // { explore, combat, boss } → { el, src, trim, ok, bad }
  _bgmLive: null,     // 此刻真的在放素材的那一层（null = 走实时合成）
  _preloaded: false,  // 音效素材预热是否已排入队列
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
    this.preload();
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

  /* 切后台：Context 挂起能静掉合成音，但 MediaElement 自己还在走时间轴，
   * 所以素材 BGM 要显式 pause，回来再续（否则回来时曲子已经跑了几分钟） */
  _bgmPauseAll() {
    const B = this._bgmEl;
    if (!B) return;
    for (const k in B) {
      const st = B[k];
      if (st.el.paused) continue;
      try { st.el.pause(); } catch (e) {}
      st.offAt = this.ctx ? this.ctx.currentTime : 0;
    }
    this._bgmLive = null;
  },

  suspend() { this._bgmPauseAll(); try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} },
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {} this._bgmSync(); },

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

  /* 通用素材加载：key 唯一，url 为空就什么都不做（保持合成）。
   * 失败也记进 _sampleTried，避免每次调用都重发请求。 */
  _loadInto(key, url) {
    if (this._sampleTried[key]) return;
    this._sampleTried[key] = true;
    if (!url || !this.ctx || typeof fetch !== 'function') return;
    /* file:// 直开（双击 index.html）时 fetch 的 origin 是 null，会被 CORS 拒，
     * 控制台刷一屏红字 —— 而回退合成照样有声。所以干脆不发这个请求：
     * 玩家看到的是「安静地走合成」，不是九条报错。http 部署下素材正常生效。
     * 注意只拦 fetch：底乐用 <audio src>，媒体元素允许跨源，file:// 照样能放。 */
    if (typeof location !== 'undefined' && location.protocol === 'file:') return;
    /* fire-and-forget：没解码完的那几次照常合成，解码好了之后自动接管 */
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('miss'); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => {
        try { this.ctx.decodeAudioData(ab, res, rej); } catch (e) { rej(e); }
      }))
      .then(b => { if (b && b.duration > 0) this._samples[key] = b; })
      .catch(() => { /* 缺文件 / 解码失败：保持合成，不打扰任何人 */ });
  },

  /**
   * 播一条**玩家 / UI 音效素材**（清单 AUDIO_CLIPS，键是 SFX 门面的方法名）。
   * @returns {boolean} 素材可用且已排入播放返回 true；否则 false，调用方回退合成。
   *   这个「先试素材、false 就走原来的合成」写法，让 181 处调用点一行都不用改。
   */
  clip(name, opts = {}) {
    const c = this.ctx;
    if (!c || !this.on || !this._running()) return false;
    const key = 'clip:' + name;
    const buf = this._samples[key];
    if (!buf) {
      const T = (typeof AUDIO_CLIPS !== 'undefined') ? AUDIO_CLIPS : null;
      this._loadInto(key, T ? T[name] : null);
      return false;
    }
    const t = c.currentTime + (opts.delay || 0);
    const s = c.createBufferSource();
    s.buffer = buf;
    if (opts.rate) s.playbackRate.value = opts.rate;
    const g = c.createGain();
    g.gain.value = (opts.gain == null ? 1 : opts.gain);
    s.connect(g);
    g.connect(opts.dest || this.bus.sfx);
    s.start(t);
    return true;
  },

  /* 预热：解锁之后把清单里所有音效排进队列慢慢取，
   * 否则「第一次挥砍」永远是合成音、第二次才变素材，听起来像 bug。
   *
   * 两个细节都是被线上实测逼出来的（GitHub Pages + 国内网络，5 秒只到位 3 条）：
   *   · **按热度排序**：界面 / 命中 / 挥砍最先进队列。原来按声明顺序先取 levelup，
   *     结果玩家砍了十刀，最该有素材的命中音还在排队。
   *   · **两个一批**：纯串行会白白空等 RTT；并发太多又会和地图 / 模型的加载抢带宽。
   */
  preload() {
    if (this._preloaded) return;
    this._preloaded = true;
    const T = (typeof AUDIO_CLIPS !== 'undefined') ? AUDIO_CLIPS : null;
    if (!T) return;
    const HOT = ['ui', 'hit', 'swing', 'coin', 'loot', 'explode', 'cast', 'heal', 'levelup'];
    const keys = HOT.filter(k => T[k])
      .concat(Object.keys(T).filter(k => HOT.indexOf(k) < 0));
    let i = 0;
    const step = () => {
      for (let n = 0; n < 2 && i < keys.length; n++) {
        const k = keys[i++];
        this._loadInto('clip:' + k, T[k]);
      }
      if (i < keys.length) setTimeout(step, 90);
    };
    setTimeout(step, 120);
  },

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
    const url = (typeof AUDIO_SFX !== 'undefined') ? AUDIO_SFX[key] : null;
    this._loadInto(key, url);
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

  /* ---------------- BGM 素材（三层各一首成品曲） ----------------
   * 为什么用 HTMLAudioElement 而不是 decodeAudioData：
   *   53 秒立体声解码后约 18MB/首，三首同时驻留要 55MB —— 手机直接崩。
   *   MediaElementSource 让浏览器自己流式解码，内存只有几十 KB。
   *
   * 为什么每条都常驻、而不是切层时新建：
   *   createMediaElementSource 对同一个元素只能建一次，反复 new 会漏节点；
   *   而且换层的淡变（1.1 秒）需要旧轨还在响，不能一上来就 stop。
   *
   * 播放控制：
   *   · 进某层 → 该层元素 play()（首次从头，8 秒内回来的从暂停处续）
   *   · 出某层 → 等淡变（1.25 秒）结束再 pause()，不然淡出变成硬切
   *   · 元素被浏览器中断（切后台、iOS 来电）→ bgm() 每 0.25 秒会顺手救回来
   */
  BGM_TRIM: 0.4,        // 成品曲比合成音响得多，整体压到 40% 才不盖音效

  _bgmMount() {
    if (this._bgmEl || !this.ctx || !this._layers) return;
    if (typeof Audio === 'undefined') return;
    const T = (typeof AUDIO_BGM !== 'undefined') ? AUDIO_BGM : null;
    if (!T) return;
    const c = this.ctx;
    this._bgmEl = {};
    for (const k in this._layers) {
      const url = T[k];
      if (!url) continue;
      const el = new Audio();
      el.src = url;
      el.loop = true;
      el.preload = 'auto';
      let src = null;
      try { src = c.createMediaElementSource(el); } catch (e) { src = null; }
      if (!src) continue;
      const trim = c.createGain();
      trim.gain.value = this.BGM_TRIM;
      src.connect(trim);
      trim.connect(this._layers[k]);
      const st = { el, src, trim, ok: false, bad: false, _t: 0, offAt: -1 };
      /* canplay 而不是 canplaythrough：m4a 的 canplaythrough 要等整首缓冲，
       * 太慢；canplay 就足够起播了 */
      el.addEventListener('canplay', () => { st.ok = true; this._bgmSync(); });
      el.addEventListener('error', () => { st.bad = true; this._bgmSync(); });
      this._bgmEl[k] = st;
    }
  },

  /* 让「当前层」的素材在播、其它层停。可以每帧调，内部只在状态真的不对时才动手。 */
  _bgmSync() {
    const B = this._bgmEl;
    if (!B) return;
    const mode = this._bgmMode || 'explore';
    const cur = B[mode];
    /* 这一层没有素材 / 还没加载好 / 加载失败 → 交给 _musicTick 实时合成 */
    if (!cur || cur.bad || !cur.ok) {
      if (this._bgmLive) {
        /* 原来在放素材，现在回不去了（比如切到没素材的层）：停掉，别叠着合成音 */
        const old = B[this._bgmLive];
        if (old && !old.el.paused) { try { old.el.pause(); } catch (e) {} }
      }
      this._bgmLive = null;
      return;
    }
    if (cur.el.paused) {
      /* 这层刚从「等待暂停」状态被切回来：把上次排的暂停撤掉 */
      cur._pend = false;
      clearTimeout(cur._t);
      /* 8 秒内从这层切走过 → 续播；否则从头。
       * 探索↔战斗反复横跳时，每次都从曲头开始是很难听的。 */
      const now = this.ctx ? this.ctx.currentTime : 0;
      const recent = cur.offAt >= 0 && (now - cur.offAt) < 8;
      if (!recent) { try { cur.el.currentTime = 0; } catch (e) {} }
      cur.offAt = -1;
      const p = cur.el.play();
      if (p && p.catch) p.catch(() => {});   // 自动播放被拒：合成层会顶上
    }
    /* 只有在**真的能出声**时才算「素材接管」：
     * play() 一调 el.paused 就变 false，但此时可能还在缓冲。
     * 若这时就把 _bgmLive 设成 mode，_musicTick 会立刻停手 →
     * 缓冲那几百毫秒里一片死寂。所以要求 readyState >= 3（HAVE_FUTURE_DATA）。
     * bgm() 每 0.25 秒会再进来一次，缓冲够了就自动接上。 */
    this._bgmLive = (cur.el.paused || cur.el.readyState < 3) ? null : mode;
    for (const k in B) {
      if (k === mode) continue;
      const st = B[k];
      if (st.el.paused || st._pend) continue;   // 已经排好暂停就别重排（见下）
      /* 这个函数每 0.25 秒会被 bgm() 调一次。如果每次都 clearTimeout + 重设，
       * 暂停永远不会发生 —— 元素一直被 layer gain 压成 0 在后台空跑，
       * 白白耗电、白占一个解码通道。所以排一次就打个标记。 */
      st._pend = true;
      clearTimeout(st._t);
      st._t = setTimeout(() => {
        st._pend = false;
        if (this._bgmMode === k) return;      // 这期间又切回来了，不能停
        try { st.el.pause(); } catch (e) {}
        st.offAt = this.ctx ? this.ctx.currentTime : 0;
      }, 1250);
    }
  },

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
    this._bgmMount();
    const lay = this._layers && this._layers[mode];
    if (!lay) return;                       // 未知层名：不静默改成别的层
    /* 已经在目标层且增益到位：只需顺手维持素材播放（这行每 0.25 秒会被调一次，
     * 元素被浏览器中断时靠它救回来） */
    if (this._bgmMode === mode && lay.gain.value > 0.4) { this._bgmSync(); return; }
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
    this._bgmSync();
  },

  _note(freq, dur, gain, type, dest) { this.tone(freq, dur, type, gain, null, dest); },

  /* 一拍一次：探索是稀疏的和弦垫，战斗是五声音阶跑动 + 底鼓，首领加重低音与鼓点。
   * 不做完整编曲 —— 这层只是「有呼吸」，别抢技能音效的频段。 */
  _musicTick(dt) {
    const mode = this._bgmMode || 'explore';
    /* 素材层正在放这首，就别再叠实时合成的音符了 ——
     * 两层音乐同时响不是「更丰富」，是跑调 */
    if (this._bgmLive === mode) return;
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
    const T = (typeof AUDIO_CLIPS !== 'undefined') ? AUDIO_CLIPS : {};
    const B = (typeof AUDIO_BGM !== 'undefined') ? AUDIO_BGM : {};
    const clipKeys = Object.keys(T);
    return {
      on: this.on,
      state: this.ctx ? this.ctx.state : 'none',
      unlocked: this.unlocked,
      voices: this._slots.length,
      samples: Object.keys(this._samples).length,
      clips: clipKeys.length,
      clipsReady: clipKeys.filter(k => !!this._samples['clip:' + k]).length,
      bgmTracks: Object.keys(B).length,
      bgmLive: this._bgmLive,
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
