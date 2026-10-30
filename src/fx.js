/* ============================================================
 * 表现层：粒子 / 投射物 / 地面预警 / 伤害数字 / 屏幕震动 / 音效门面
 * ============================================================ */

/* ---------------- 音效门面（S16 起转调 AudioSys） ----------------
 *
 * 这一层保留 SFX.xxx 的名字，是因为全仓有 181 处调用点，
 * 但它们现在只是「音色名」，真正发声的是 audio.js 的 AudioSys：
 * 它管总线（音效 / 环境 / 音乐三条）、距离衰减、左右定位、声部预算。
 *
 * SFX.init() 以前只 new AudioContext 不 resume()，于是浏览器把上下文
 * 一直挂在 suspended 上、currentTime 恒为 0 —— 表现为「整局没有一点声音，
 * 但代码全对」。现在 init() 就是 AudioSys.unlock()，必须由用户手势调用。
 */
const SFX = {
  on: true,

  init() {
    if (typeof AudioSys === 'undefined') return null;
    AudioSys.on = this.on;
    AudioSys.unlock();
    return AudioSys.ctx;
  },

  tone(freq, dur, type = 'sine', gain = 0.2, slideTo) {
    if (!this.on || typeof AudioSys === 'undefined') return;
    AudioSys.tone(freq, dur, type, gain, slideTo);
  },

  noise(dur = 0.15, gain = 0.2, freq = 1200, q = 1) {
    if (!this.on || typeof AudioSys === 'undefined') return;
    AudioSys.noise(dur, gain, freq, q);
  },

  /* ---------------- 打击与施法 ---------------- */

  /* 素材优先。这些音效的**合成版本全部保留**，素材只是插在前面的快路径：
   * 录音缺失 / 还没加载完 / 解码失败时 _clip 返回 false，下面几行照旧合成。
   * 好处是换真录音只改 data-fauna.js 的 AUDIO_CLIPS，这里一行都不用动。 */
  _clip(name, opts) {
    if (!this.on || typeof AudioSys === 'undefined') return false;
    return AudioSys.clip(name, opts);
  },

  swing() { if (this._clip('swing')) return; this.noise(0.13, 0.2, 2600, 1.6); this.tone(430, 0.09, 'triangle', 0.07, 170); },
  hit() { if (this._clip('hit')) return; this.noise(0.1, 0.3, 700, 0.9); this.tone(118, 0.12, 'square', 0.16, 58); },
  crit() {
    /* 暴击没有独立素材：拿命中素材变调升高 + 加音量当「更重的一下」，
     * 比再合成一条更统一（同一件武器的皮，只是打得更狠） */
    if (this._clip('hit', { rate: 1.14, gain: 1 })) { this.tone(1320, 0.1, 'triangle', 0.05, 880); return; }
    this.noise(0.16, 0.36, 900, 0.7);
    this.tone(220, 0.16, 'sawtooth', 0.18, 58);
    this.tone(900, 0.12, 'triangle', 0.1, 320);
  },
  cast() { if (this._clip('cast')) return; this.tone(520, 0.3, 'sine', 0.11, 900); this.noise(0.22, 0.07, 3000, 2); },
  fire() { this.noise(0.3, 0.18, 480, 0.6); this.tone(170, 0.32, 'sawtooth', 0.11, 66); },
  ice() { this.tone(1250, 0.3, 'sine', 0.09, 600); this.noise(0.26, 0.1, 4200, 3); },
  thunder() { this.noise(0.3, 0.34, 2200, 0.5); this.tone(88, 0.26, 'square', 0.14, 38); },
  explode() { if (this._clip('explode')) return; this.noise(0.5, 0.42, 300, 0.5); this.tone(68, 0.55, 'sine', 0.26, 28); },
  heal() { if (this._clip('heal')) return; this.tone(660, 0.2, 'sine', 0.12, 990); this.tone(990, 0.32, 'sine', 0.07, 1320); },
  die() { this.tone(200, 0.45, 'sawtooth', 0.12, 48); this.noise(0.45, 0.18, 380, 0.6); },
  coin() { if (this._clip('coin')) return; this.tone(980, 0.08, 'square', 0.09); setTimeout(() => this.tone(1460, 0.1, 'square', 0.07), 60); },
  levelup() { if (this._clip('levelup')) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.14), i * 90)); },
  ui() { if (this._clip('ui')) return; this.tone(760, 0.05, 'square', 0.05); },
  boss() { this.tone(60, 1.4, 'sawtooth', 0.2, 40); this.noise(1.2, 0.14, 210, 0.4); },
  loot(r) {
    /* 稀有掉落必须保留五音上行 —— 那是玩家判断「掉了什么」的听觉依据，
     * 用同一段拾取素材顶掉会让 unique 和普通白装听起来一样。 */
    if (r === 'unique') { [659, 784, 988, 1318, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.12), i * 90)); return; }
    if (r === 'legendary' || r === 'set') { [784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.11), i * 100)); return; }
    this._clip('loot');
  },

  /* ---------------- 技能释放层（S16 新增） ----------------
   * 技能自己的「命中 / 爆发」音在各技能代码里，这里补的是**起手**：
   * 每发技能都有，音量压得低（0.05~0.07）、时长短（0.1~0.2 秒），
   * 作用是让「按下技能键」有即时反馈，同时不抢命中音。
   * 元素优先读 SKILLS[id].elem，没有就按名字与描述里的字猜 —— 这样
   * 新增技能不写 elem 也有合理音色，写了就以此为准。 */
  skillElem(sk) {
    if (!sk) return 'phys';
    if (sk.elem) return sk.elem;
    const t = (sk.name || '') + (sk.desc || '');
    if (/火|炎|焰|焚|燃/.test(t)) return 'fire';
    if (/冰|寒|霜|雪|冻/.test(t)) return 'ice';
    if (/雷|电|霆|霹雳/.test(t)) return 'lightning';
    if (/毒|腐|瘟|蚀/.test(t)) return 'poison';
    if (/血|魂|煞/.test(t)) return 'blood';
    if (/风|影|疾/.test(t)) return 'wind';
    return 'phys';
  },

  skill(sk) {
    if (!this.on || !sk) return;
    const type = sk.type || 'melee';
    if (type === 'buff' || type === 'shield') { this.tone(300, 0.26, 'triangle', 0.07, 620); return; }
    if (type === 'heal') { this.tone(700, 0.22, 'sine', 0.06, 1050); return; }
    if (type === 'summon') { this.tone(220, 0.3, 'sine', 0.07, 440); this.noise(0.28, 0.05, 900, 1.4); return; }
    if (type === 'dash') { this.noise(0.18, 0.11, 1400, 0.9); this.tone(300, 0.16, 'sawtooth', 0.06, 640); return; }
    if (type === 'ultimate' || type === 'meteor' || type === 'rain') { this.noise(0.3, 0.1, 700, 0.7); return; }
    switch (this.skillElem(sk)) {
      case 'fire': this.noise(0.2, 0.09, 620, 0.8); break;
      case 'ice': this.tone(1500, 0.14, 'sine', 0.05, 2100); break;
      case 'lightning': this.noise(0.12, 0.09, 3200, 1.4); break;
      case 'poison': this.tone(320, 0.16, 'sine', 0.05, 520); break;
      case 'blood': this.tone(150, 0.2, 'sawtooth', 0.06, 96); break;
      case 'wind': this.noise(0.16, 0.07, 2200, 1.2); break;
      default: this.noise(0.12, 0.06, 1800, 1.1); break;
    }
  },

  /* ---------------- 转调 AudioSys（怪物 / 环境 / 音乐） ----------------
   * game.js 那边也直接调 AudioSys，这几个别名只是为了让「音效相关」
   * 有一个统一入口，测试里 stub SFX 时不用再去找第二个对象。 */
  mob(e, ev) { if (typeof AudioSys !== 'undefined') return AudioSys.mob(e, ev); return false; },
  voice(fam, size, ev, o) { if (typeof AudioSys !== 'undefined') return AudioSys.voice(fam, size, ev, o); return 0; },
  ambient(id) { if (typeof AudioSys !== 'undefined') AudioSys.ambient(id); },
  bgm(m) { if (typeof AudioSys !== 'undefined') AudioSys.bgm(m); }
};

/* ---------------- 怪物血条 ---------------- */
let _hpBarTex = null;
function hpBarTexture() {
  if (_hpBarTex) return _hpBarTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 20;
  const g = c.getContext('2d');
  const r = 9, w = c.width, h = c.height;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r);
  g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
  g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r);
  g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
  g.closePath(); g.fill();
  _hpBarTex = new THREE.CanvasTexture(c);
  _hpBarTex.minFilter = THREE.LinearFilter;
  _hpBarTex.generateMipmaps = false;
  markShared(_hpBarTex);   // 所有血条共用一个纹理，永不 dispose
  return _hpBarTex;
}

const HPBAR_W = 1.2, HPBAR_H = 0.19;

/**
 * 模型静止姿态的顶端高度（取包围盒，武器/翅膀摆动不做修正）
 */
function modelTopY(host) {
  host.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(host);
  return bb.max.y;
}

/**
 * 在怪物集团下挂一条血条（两张 Sprite：底槽 + 填充）
 * @param {THREE.Group} host 目标模型 group（会被读取缩放）
 */
function makeHpBar(host, opts = {}) {
  const s = host.scale.x || 1;
  const topLocal = modelTopY(host) / s;

  const g = new THREE.Group();
  g.scale.setScalar(1 / s);
  g.position.y = topLocal + (opts.gap || 0.36) / s;
  g.renderOrder = 20;

  const tex = hpBarTexture();
  const bgMat = new THREE.SpriteMaterial({
    map: tex, color: 0x0a0809, transparent: true, opacity: 0.82,
    depthTest: false, depthWrite: false
  });
  const bg = new THREE.Sprite(bgMat);
  bg.scale.set(HPBAR_W + 0.06, HPBAR_H + 0.06, 1);
  bg.renderOrder = 20;
  g.add(bg);

  const fillMat = new THREE.SpriteMaterial({
    map: tex, color: 0x46c651, transparent: true, opacity: 0.96,
    depthTest: false, depthWrite: false
  });
  const fill = new THREE.Sprite(fillMat);
  fill.center.set(0, 0.5);
  fill.scale.set(HPBAR_W, HPBAR_H, 1);
  fill.position.x = -HPBAR_W / 2;
  fill.renderOrder = 21;
  g.add(fill);

  // 精英：底槽换成暗金边，填充条转金色（[S5] 一眼分出精英与普通怪）
  if (opts.elite) {
    bgMat.color.setHex(0x2a1c08);
    fillMat.color.setHex(0xd8b25a);
  }

  host.add(g);
  return { group: g, fill, bg, w: HPBAR_W, s };
}

/* 复用的四元数，避免每帧为每条血条 new 对象 */
const _qBarParent = new THREE.Quaternion();

/**
 * 把血条组校正到「世界空间正对相机」。
 *
 * 血条由「底槽 + 填充」两张 Sprite 组成，填充用 position.x=-W/2 左对齐。
 * Sprite 的朝向恒面向相机，但位置会被父级矩阵变换——怪物转身时那个 -W/2 偏移
 * 就在世界空间里绕着血条中心画圆，于是填充条和底槽被甩开，看起来是「两条分开的横条」。
 * 反向旋转后，血条组的局部 X 轴恒等于屏幕右方向，偏移只发生在屏幕平面内，两者不会再错位。
 *
 * 注意：必须用「本帧最终的相机姿态」调用（见 game.js animate 里的 faceHpBars），
 * 在相机更新之前调用会差一帧，留下可见偏差。
 */
function faceHpBar(bar, camera) {
  if (!bar || !bar.group || !camera) return;
  const parent = bar.group.parent;
  if (parent) {
    parent.getWorldQuaternion(_qBarParent);   // 父级世界朝向
    _qBarParent.invert();
    _qBarParent.multiply(camera.quaternion);  // local = inv(parentWorld) * camera
    bar.group.quaternion.copy(_qBarParent);
  } else {
    bar.group.quaternion.copy(camera.quaternion);
  }
}

/**
 * 刷新血条：长度按血量比例，尺寸按屏幕像素恒定（手机上也看得清）
 * @param {object} bar makeHpBar 的返回值
 * @param {number} ratio 剩余血量比例
 * @param {number} [dist] 血条到相机的距离，传入则同步尺寸
 * @param {THREE.Camera} [camera] 传入则顺带校正朝向（每帧的最终校正走 faceHpBars）
 */
function updateHpBar(bar, ratio, dist, camera) {
  const r = CLAMP(ratio, 0, 1);
  bar.fill.scale.x = Math.max(0.001, bar.w * r);
  bar.fill.visible = r > 0.002;
  const col = r > 0.6 ? 0x46c651 : (r > 0.28 ? 0xd8b13a : 0xd2402f);
  if (bar.fill.material.color.getHex() !== col) bar.fill.material.color.setHex(col);

  if (camera) faceHpBar(bar, camera);

  // 屏幕上高度恒定：大屏 9px、小屏 7px，远近一致
  if (dist > 0.1) {
    const H = window.innerHeight || 900;
    const px = H >= 600 ? 9 : 7;
    // fov 46° → 全屏高度对应 2·d·tan23° ≈ 0.849d
    const h = CLAMP(px / H * 0.849 * dist, 0.08, 0.85);
    bar.group.scale.setScalar(h / HPBAR_H / bar.s);
  }
}

/* ---------------- 特效几何体缓存 ---------------- *
 * 这些形状参数固定，但数量大（每次技能都要一个环/一个圆）。
 * 以前每次都 new RingGeometry 且不 dispose，等于每放一次技能泄漏一块显存。
 * 现在全部缓存复用，方向用 mesh.rotation.z 表达，不再把角度编进几何体。
 */
const FX_GEO = {};
function _fxGeo(key, make) {
  const hit = FX_GEO[key];
  if (hit) return hit;
  const g = make();
  markShared(g);
  return (FX_GEO[key] = g);
}
const fxRing = (inner, outer, seg, len) =>
  _fxGeo(`r${inner}_${outer}_${seg}_${len.toFixed(3)}`, () => new THREE.RingGeometry(inner, outer, seg, 1, 0, len));
const fxCircle = (seg) => _fxGeo(`c${seg}`, () => new THREE.CircleGeometry(1, seg));
const fxRingThin = (inner, outer, seg) =>
  _fxGeo(`t${inner}_${outer}_${seg}`, () => new THREE.RingGeometry(inner, outer, seg));

/* ---------------- 粒子 ---------------- */
/* 符纸贴图（v1.0.4）：程序化画一张竖长黄符，朱砂字 + 朱印。
 * 只生成一次并复用 —— 道士普攻/技能会连续出符，每次新建 CanvasTexture 会
 * 直接把显存和上传带宽吃满（和当初投射物挂 PointLight 是同一类问题）。 */
let _talismanTex = null;
function talismanTexture() {
  if (_talismanTex) return _talismanTex;
  const W = 96, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 纸
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#f6e8b4');
  grd.addColorStop(0.5, '#e8d190');
  grd.addColorStop(1, '#c8a860');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // 朱砂边
  g.strokeStyle = 'rgba(190,48,30,.9)';
  g.lineWidth = 4;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.strokeStyle = 'rgba(190,48,30,.42)';
  g.lineWidth = 1.5;
  g.strokeRect(11, 11, W - 22, H - 22);
  // 符头「敕令」
  g.fillStyle = '#b02818';
  g.font = 'bold 26px "STKaiti","KaiTi",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('敕', W / 2 - 17, 34);
  g.fillText('令', W / 2 + 17, 34);
  // 符胆：竖笔 + 折笔，模拟朱砂符文
  g.strokeStyle = '#a8241a';
  g.lineWidth = 4.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(W / 2, 54); g.lineTo(W / 2, 118);
  g.stroke();
  g.lineWidth = 3.5;
  const bars = [[30, 66, 66], [30, 80, 66], [34, 94, 62], [38, 108, 58]];
  for (const [x1, y, x2] of bars) {
    g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
  }
  // 两侧勾
  g.beginPath();
  g.moveTo(24, 58); g.lineTo(24, 88); g.lineTo(34, 96);
  g.moveTo(W - 24, 58); g.lineTo(W - 24, 88); g.lineTo(W - 34, 96);
  g.stroke();
  // 朱印
  g.fillStyle = 'rgba(178,32,24,.86)';
  g.fillRect(W / 2 - 15, 124, 30, 24);
  g.fillStyle = 'rgba(246,232,180,.9)';
  g.font = 'bold 15px "STKaiti","KaiTi",serif';
  g.fillText('雷', W / 2, 137);
  // 外发光，暗场景里更抓眼
  g.globalCompositeOperation = 'lighter';
  g.shadowColor = 'rgba(255,214,120,.95)';
  g.shadowBlur = 14;
  g.strokeStyle = 'rgba(255,226,150,.5)';
  g.lineWidth = 2;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.globalCompositeOperation = 'source-over';

  _talismanTex = new THREE.CanvasTexture(c);
  _talismanTex.needsUpdate = true;
  return _talismanTex;
}
const fxPlane = (w, h) => _fxGeo(`p${w}_${h}`, () => new THREE.PlaneGeometry(w, h));

/* ---------------- 领域贴图（程序化，仍然零素材） ----------------
 * 五张图一次生成、全局共用：sigil（法阵纹）/ taiji（双鱼）/ beam（竖直光柱）/
 * smoke（雾团）/ blade（剑身）。与 talismanTexture 同一套做法 —— 本仓库不引入
 * 任何图片素材，贴图全靠 Canvas 现画。
 *
 * 约定：**白 = 全亮，透明 = 不画**。加色混合下黑色与透明等价，
 * 所以"暗部"用低 alpha 画，不要用黑色（黑色在 NormalBlending 的雾里会变脏）。
 * 纹理只生成一次：每次 new CanvasTexture 都会重传一遍显存，
 * 技能连放时会直接把上传带宽吃满（与当初投射物挂 PointLight 是同一类问题）。 */
const _fieldTex = {};
function fieldTexture(kind) {
  if (_fieldTex[kind]) return _fieldTex[kind];
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const W = (kind === 'beam' || kind === 'blade') ? 64 : (kind === 'smoke' ? 128 : 512);
  const H = (kind === 'beam' || kind === 'blade') ? 256 : W;
  c.width = W; c.height = H;

  if (kind === 'sigil') {
    /* 法阵纹：双环 + 24 道刻度 + 8 根辐条 + 中心符胆。
     * 不画汉字 —— 512 的图铺到 7 码半径上，笔画会糊成一团黑。 */
    const cx = W / 2, cy = H / 2;
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, W * 0.46, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, W * 0.385, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, W * 0.235, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.6)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = W * 0.385, r2 = i % 3 === 0 ? W * 0.46 : W * 0.425;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.42)';
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * W * 0.235, cy + Math.sin(a) * W * 0.235);
      g.lineTo(cx + Math.cos(a) * W * 0.385, cy + Math.sin(a) * W * 0.385);
      g.stroke();
    }
    /* 中心符胆：一个小六边 + 内点 */
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * W * 0.115, y = cy + Math.sin(a) * W * 0.115;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(cx, cy, W * 0.032, 0, Math.PI * 2); g.fill();
  } else if (kind === 'taiji') {
    /* 双鱼：整盘压暗（0.30），再把「阳鱼」那一半提亮到 0.85 ——
     * 加色混合下这正好是「一边亮一边暗」，灰度截图里 S 分界线就是剪影。 */
    const cx = W / 2, cy = H / 2, R = W * 0.46;
    g.fillStyle = 'rgba(255,255,255,.34)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);          // 右半大圆
    g.arc(cx, cy + R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); // 下小鱼
    g.arc(cx, cy - R / 2, R / 2, Math.PI / 2, -Math.PI / 2, false); // 上小鱼
    g.closePath(); g.fill();
    /* 鱼眼：一亮一暗（暗的用低 alpha，加色下等于"少加一点"） */
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(cx, cy - R / 2, R * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.arc(cx, cy + R / 2, R * 0.13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  } else if (kind === 'beam') {
    /* 竖直光柱：底亮顶透。**不做横向渐变** —— 圆柱 UV 横向是环绕的，
     * 横向渐变会在接缝处留一道竖线，转起来像根栅栏。 */
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,.35)');
    grd.addColorStop(1, 'rgba(255,255,255,.95)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  } else if (kind === 'smoke') {
    /* 雾团：几团重叠的径向柔光。**不用纯圆** —— 纯圆的雾看起来是绿饼。 */
    for (let i = 0; i < 9; i++) {
      const x = W * (0.3 + Math.random() * 0.4);
      const y = H * (0.3 + Math.random() * 0.4);
      const r = W * (0.18 + Math.random() * 0.22);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,.72)');
      grd.addColorStop(0.6, 'rgba(255,255,255,.34)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    /* 外圈柔化：方图直接贴上去会看见四条直边 */
    const mask = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.5);
    mask.addColorStop(0, 'rgba(255,255,255,1)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = mask;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'blade') {
    /* 剑身：细长多边形 + 中脊亮线。贴地画弧会跟旋风斩的刀气撞，
     * 所以剑必须是"立着的剑" —— 靠 plane + 朝相机来立起来。 */
    const cx = W / 2;
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath();
    g.moveTo(cx, H * 0.04);
    g.lineTo(cx + W * 0.20, H * 0.30);
    g.lineTo(cx + W * 0.15, H * 0.86);
    g.lineTo(cx + W * 0.26, H * 0.90);
    g.lineTo(cx + W * 0.26, H * 0.96);
    g.lineTo(cx - W * 0.26, H * 0.96);
    g.lineTo(cx - W * 0.26, H * 0.90);
    g.lineTo(cx - W * 0.15, H * 0.86);
    g.lineTo(cx - W * 0.20, H * 0.30);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, H * 0.06); g.lineTo(cx, H * 0.88); g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  _fieldTex[kind] = t;
  return t;
}

/* 追踪用的临时向量：每帧每个投射物都 new 一个 Vector3 会造成 GC 抖动 */
const _vHome = new THREE.Vector3();
/* 领域脉冲环用的临时向量（每 2 秒一次，但纪律一样：逐帧路径不 new） */
const _vField = new THREE.Vector3();
/* 亮度调色的临时色（避免每个原语都 new 一个 Color） */
const _cLit = new THREE.Color();
const _cWhite = new THREE.Color(1, 1, 1);

const FX = {
  scene: null, cam: null, layer: null,
  parts: [], projectiles: [], zones: [], texts: [], beams: [],
  maxTexts: 60,
  /* 粒子倍率：由 Game.applyPerfLevel 按帧率下调。集显上粒子是最贵的
   * 「每帧重建光栅化状态」的来源之一，砍半几乎看不出，帧率能回来不少。 */
  q: 1,

  /* ============================================================
   * [P2c] 光效强度：技能有效等级 → 亮度倍率（1 ~ 1.22）
   *
   * `castSkill` 按技能有效等级调一次 `setAmp(skillFxAmp(lv))`，之后由 `update`
   * 倒数 `ampHold` 秒自动回落 1。为什么不是「设完立刻还原」：技能的特效有一部分
   * 是延后出的（陨石砸地 0.9~1.1 秒、火墙四段、崩击三段），只认同步那一帧的话，
   * 玩家花词条堆到 20 级的技能，**主视觉**反而还是基础亮度。
   *
   * 硬约束（写进契约）：**只乘亮度 / 不透明度 / 粒子数，不乘半径、角度、射程。**
   * 那些是判定的视觉契约 —— 光效圈画大一圈，玩家就会以为打得到更远的地方。
   * ============================================================ */
  amp: 1,
  ampHold: 0,
  ampMax: 1.25,

  setAmp(v, hold = 1.2) {
    const n = Number(v);
    this.amp = (isFinite(n) && n > 1) ? Math.min(this.ampMax, n) : 1;
    this.ampHold = this.amp > 1 ? Math.max(0, Number(hold) || 0) : 0;
    return this.amp;
  },

  /* 亮度：把颜色往白里拉一点（加色混合下就是「更亮」）。
   * amp = 1 时**原样返回** —— 不给没变亮的特效多算一次，也不引入任何误差。 */
  lit(color) {
    if (this.amp <= 1.0001) return color;
    _cLit.set(color).lerp(_cWhite, Math.min(0.45, (this.amp - 1) * 1.8));
    return _cLit.getHex();
  },

  /* [P3d] 元素注入的视觉标记：主元素 70% / 副元素 30% 的粒子数。
   *
   * 为什么不给整块光效换色：`FX` 是全局的，同一帧敌人放的技能、命中喷的血
   * 都会跟着变色 —— 那不是「这一下带火」，那是整块屏幕在说谎。而且技能本体
   * 的颜色是它的身份（火球就是橙的），元素注入是**附魔层**，不是转换。
   * 所以只加一簇「这一发带了什么」的火星，技能本体一个像素都不动。
   *
   * 也不画圈：圈是判定的视觉契约，画多大就得打多大，而注入不改范围。 */
  elemSpark(pos, colorMain, colorSub) {
    if (!pos || !colorMain) return;
    const n = 12;
    const wMain = (typeof SKILL_INJECT === 'object' && SKILL_INJECT && SKILL_INJECT.split)
      ? SKILL_INJECT.split.main : 70;
    const nMain = colorSub ? Math.max(1, Math.round(n * wMain / 100)) : n;
    this.burst(pos, colorMain, nMain, { speed: 3.2, size: 0.13, life: 0.55, additive: true, gravity: 6 });
    if (colorSub) this.burst(pos, colorSub, n - nMain, { speed: 2.4, size: 0.11, life: 0.5, additive: true, gravity: 6 });
  },

  init(scene, cam, layer) { this.scene = scene; this.cam = cam; this.layer = layer; },

  burst(pos, color, count = 10, opts = {}) {
    /* 每组粒子是「count 个独立 Mesh」= count 次 draw call，同时堆几十组会把
     * 绘制批次顶上去。超过上限就直接不出新粒子——画面上少一簇火星没人看得出来，
     * 但 draw call 从 700 掉回 300 是实打实的手感差别。 */
    if (this.parts.length >= 40) return;
    /* [P2c] 光效随等级变亮：火星**更多更亮**，但速度 / 大小不动 ——
     * 大小会让「这一簇火有多大」变味，而那正好是玩家判断范围的东西。 */
    if (this.amp > 1) {
      count = Math.max(1, Math.round(count * this.amp));
      color = this.lit(color);
    }
    // 低画质时按倍率削减粒子数，但至少保留 3 颗，否则打击感会整个消失
    if (this.q < 1) count = Math.max(3, Math.round(count * this.q));
    const speed = opts.speed || 6;
    const size = opts.size || 0.1;
    const life = opts.life || 0.5;

    /* [v1.0.6] 一次爆发 = 一个 THREE.Points = 一次 draw call。
     *
     * 旧实现是 count 个独立 Mesh（各自挂在一个 Group 下），也就是 count 次 draw call。
     * Boss 死亡/爆血一次就是 40 颗，同时堆满 40 组 = 最多 1600 次绘制，
     * 光粒子就能把浏览器主线程压死 —— 这是「Boss 战特别卡」的头号原因。
     * 现在整组共用一个 BufferGeometry，位置在 CPU 端逐帧更新，
     * 一簇粒子从 count 次绘制降到 1 次，视觉上只是方块变方点，小尺寸下看不出差别。
     */
    const n3 = count * 3;
    const arr = new Float32Array(n3);
    const vel = new Float32Array(n3);
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      arr[k] = pos.x + RND(-0.2, 0.2);
      arr[k + 1] = pos.y + RND(-0.1, 0.3);
      arr[k + 2] = pos.z + RND(-0.2, 0.2);
      const ang = Math.random() * Math.PI * 2, el = RND(0.1, 0.9);
      vel[k] = Math.cos(ang) * speed * RND(0.4, 1);
      vel[k + 1] = el * speed * RND(0.5, 1.1);
      vel[k + 2] = Math.sin(ang) * speed * RND(0.4, 1);
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.dynamic = true;
    geo.setAttribute('position', attr);
    const mat = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;      // 顶点每帧在动，包围盒不更新，交给它自己判断反而会误剔
    this.scene.add(pts);
    this.parts.push({
      obj: pts, geo, mat, attr, arr, vel, n: count,
      life, max: life,
      gravity: opts.gravity !== undefined ? opts.gravity : 14,
      drag: opts.drag || 2.6
    });
  },

  spark(pos, color = 0xffe0a0, count = 8) { this.burst(pos, color, count, { speed: 8, size: 0.07, life: 0.28, additive: true, gravity: 6 }); },

  blood(pos, color = 0xcc2222, count = 10) { this.burst(pos, color, count, { speed: 6, size: 0.09, life: 0.5, gravity: 18 }); },

  ring(pos, radius, color = 0xffffff, dur = 0.45, thickness = 0.16) {
    const geo = fxRing(0.9, 1.0, 32, Math.PI * 2);
    /* [P2c] 变亮只走「颜色 + 不透明度」，radius 一个字节都不动 ——
     * 这个环画多大，就是这一发真的能打到多大。 */
    const op0 = Math.min(1, 0.9 * this.amp);
    const mat = new THREE.MeshBasicMaterial({ color: this.lit(color), transparent: true, opacity: op0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.08, pos.z);
    m.scale.setScalar(radius * 0.25);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'ring', radius, t: 0, op0 });
  },

  flashCircle(pos, radius, color = 0xffffff, dur = 0.4) {
    const geo = fxCircle(28);
    const op0 = Math.min(1, 0.55 * this.amp);
    const mat = new THREE.MeshBasicMaterial({ color: this.lit(color), transparent: true, opacity: op0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.07, pos.z);
    m.scale.setScalar(radius);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'flash', op0 });
  },

  /* 地面预警（Boss 技能） */
  telegraph(pos, radius, dur, cb, color = 0xff3333) {
    const geo = fxCircle(40);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.06, pos.z); m.scale.setScalar(radius);
    this.scene.add(m);
    const ringGeo = fxRingThin(0.94, 1, 40);
    const rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    rm.rotation.x = -Math.PI / 2; rm.position.y = 0.01; m.add(rm);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'tele', cb, radius });
  },

  /* 持续区域（毒雾/火海） */
  area(pos, radius, color, dur, opts = {}) {
    const geo = fxCircle(32);
    // 亮色技能降低不透明度，避免在亮地面上糊成一块
    const cc = new THREE.Color(color);
    const lum = 0.299 * cc.r + 0.587 * cc.g + 0.114 * cc.b;
    /* [P2c] 光效变亮：面积不放大（那是判定范围），只抬不透明度 + 调亮颜色。
     * 上限 0.75 是 SKILL-VFX-PLAN §亮度预算：5 个技能同屏时不许糊住 Boss 的预警圈。 */
    const baseOp = Math.min(0.75, (opts.opacity || Math.max(0.07, 0.3 - lum * 0.22)) * this.amp);
    const mat = new THREE.MeshBasicMaterial({ color: this.lit(color), transparent: true, opacity: baseOp, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.05, pos.z); m.scale.setScalar(radius);
    this.scene.add(m);
    /* 边沿亮圈，避免大色块显得扁平。
     * `opts.rim === false` 时不要 —— 毒雾这种「边界本来就看不见」的领域，
     * 一圈亮边会把它重新画成一个圆，与 `FX.field('mist')` 自相矛盾。 */
    if (opts.rim !== false) {
      const rim = new THREE.Mesh(fxRingThin(0.93, 1, 40),
        new THREE.MeshBasicMaterial({ color: this.lit(color), transparent: true, opacity: Math.min(0.7, baseOp + 0.32), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      rim.rotation.x = -Math.PI / 2; rim.position.y = 0.012; m.add(rim);
    }
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'area', radius, color, baseOp });
    return m;
  },

  /* ============================================================
   * [VFX·移植] 领域：**四种剪影，不是四种颜色**
   *
   * 以前所有领域共用同一副骨架（地面圆盘 + 边沿亮圈），换的只是颜色与半径。
   * 灰度截图里太极 / 毒雾 / 剑阵 / 法阵读起来是同一个东西 —— 玩家分不出
   * 「我站在什么阵里」，技能的身份就没了。这里按 kind 分开：
   *
   *   sigil   法阵：地纹 + 中央光柱 + 双层环墙 + 2 秒脉冲
   *   taiji   太极：双鱼地纹 + 两根气旋柱（长在鱼眼上、跟着双鱼一起转）
   *   mist    雾  ：没有地纹、没有边界，只有翻滚的雾团
   *   blades  剑阵：淡地纹 + 立着环绕的剑影（椭圆轨道）
   *
   * 外轮廓分别是「圆 + 柱」「双螺旋」「不规则的团」「轨道」，遮住颜色也分得开。
   *
   * 三条硬约束（写在这里，防止以后加东西时忘掉）：
   *   ① **半径由调用方按判定半径传进来**，这里绝不自己放大 ——
   *      领域圈就是判定的视觉契约，画大一圈就是向玩家谎报范围。
   *   ② **不挂 PointLight**、**不在 update 里 new 对象** —— 与其它原语同一套纪律。
   *   ③ 低画质档（`FX.q < 0.7`）去掉环墙与剑影数量，只留地纹 ——
   *      手机端同屏两三个领域是常事。
   * ============================================================ */
  field(pos, opts = {}) {
    const kind = opts.kind || 'sigil';
    const R = Math.max(0.6, opts.r || 3.2);
    const life = Math.max(0.4, opts.life || 4.5);
    const color = opts.color != null ? opts.color : 0x9fe8c8;
    const op = Math.min(0.9, opts.opacity != null ? opts.opacity : 0.85);
    const spin = opts.spin != null ? opts.spin : 0.22;
    const grp = new THREE.Group();
    grp.position.set(pos.x, 0, pos.z);
    this.scene.add(grp);

    const mats = [];
    const mkMat = (extra) => {
      const m = new THREE.MeshBasicMaterial(Object.assign({
        color: this.lit(color), transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      }, extra || {}));
      mats.push(m);
      return m;
    };

    /* 地纹：雾**不画**。带着一圈清晰圆边的"雾"读起来是一张绿饼，
     * 而雾的身份恰恰是「没有边界」。剑阵压到 0.26 —— 它的主体是剑影。 */
    let sig = null, sigOp = 0;
    if (kind !== 'mist') {
      const tex = fieldTexture(kind === 'taiji' ? 'taiji' : 'sigil');
      sigOp = kind === 'taiji' ? op * 0.62 : kind === 'blades' ? op * 0.26 : op;
      const mat = mkMat({ map: tex });
      sig = new THREE.Mesh(fxPlane(1, 1), mat);
      sig.rotation.x = -Math.PI / 2;
      sig.position.y = 0.03;
      sig.scale.setScalar(R * 2);
      grp.add(sig);
    }

    /* 柱与环墙只属于法阵。太极换成气旋柱，雾什么都不长。 */
    let colMesh = null, walls = [];
    if (kind === 'sigil') {
      const cGeo = _fxGeo('fxcol' + R.toFixed(2), () =>
        new THREE.CylinderGeometry(R * 0.92, R * 0.92, 2.6, 28, 1, true));
      colMesh = new THREE.Mesh(cGeo, mkMat({ map: fieldTexture('beam'), side: THREE.DoubleSide }));
      colMesh.position.y = 1.3;
      grp.add(colMesh);

      const wGeo = _fxGeo('fxwall' + R.toFixed(2), () =>
        new THREE.CylinderGeometry(R, R, 1.5, 36, 1, true));
      /* 低画质只留一层墙：两层墙是 2 次 draw call，手机上是纯浪费 */
      const wallN = this.q < 0.7 ? 1 : 2;
      for (let i = 0; i < wallN; i++) {
        const m = new THREE.Mesh(wGeo, mkMat({ map: fieldTexture('beam'), side: THREE.DoubleSide }));
        m.position.y = 0.55;
        m.userData.s = i ? -1 : 1;
        grp.add(m);
        walls.push(m);
      }
    }

    /* 太极的体积感：两根气旋柱，长在两个鱼眼上、跟双鱼图同速公转。
     * 只靠撒粒子做螺旋，在 51° 俯角下会投影成中心一坨白雾 ——
     * 而"两根柱"是实打实的竖直物体，俯视时最占屏幕的正是竖直方向。 */
    const cols = [];
    if (kind === 'taiji') {
      for (let i = 0; i < 2; i++) {
        const g = _fxGeo('fxtj' + R.toFixed(2), () =>
          new THREE.CylinderGeometry(R * 0.30, R * 0.18, 2.9, 16, 1, true));
        const m = new THREE.Mesh(g, mkMat({ map: fieldTexture('beam'), side: THREE.DoubleSide }));
        m.position.y = 1.45;
        grp.add(m);
        cols.push(m);
      }
    }

    /* 雾片：**NormalBlending**。加色混合的雾会变成一团荧光绿，反而更像光效。 */
    const puffs = [];
    if (kind === 'mist') {
      const n = this.q < 0.7 ? 5 : 9;
      const tex = fieldTexture('smoke');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + RND(-0.3, 0.3);
        const rr = Math.sqrt(RND(0.05, 1)) * R * 0.78;
        const s0 = R * RND(0.75, 1.25);
        const mat = new THREE.MeshBasicMaterial({
          map: tex, color: this.lit(color), transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.NormalBlending, fog: false
        });
        mats.push(mat);
        const m = new THREE.Mesh(fxPlane(1, 1), mat);
        m.scale.set(s0, s0 * 0.78, 1);
        /* 雾片是**竖着的 billboard**，中心得抬到自身高度的一半以上，
         * 否则下半片会插进地面、被地面裁出一条直边（看起来像贴了张方纸）。 */
        const oy = 0.28 + s0 * 0.42;
        m.position.set(Math.cos(a) * rr, oy, Math.sin(a) * rr);
        m.renderOrder = 6;
        m.userData = { s0, oy, ph: RND(0, 7), ox: Math.cos(a) * rr, oz: Math.sin(a) * rr, ry: RND(0, 7) };
        grp.add(m);
        puffs.push(m);
      }
    }

    /* 剑影：得是**立着的剑**，不是贴地的弧 —— 贴地弧就是刀气，会跟旋风斩撞。 */
    const swords = [];
    if (kind === 'blades') {
      const n = this.q < 0.7 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: fieldTexture('blade'), color: this.lit(color), transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
        });
        mats.push(mat);
        const m = new THREE.Mesh(fxPlane(1, 1), mat);
        m.renderOrder = 5;
        grp.add(m);
        swords.push({ m, a: (i / n) * Math.PI * 2, r: R * 0.74 + (i % 2) * 0.3 });
      }
    }

    const z = {
      mesh: grp, mat: mats[0], mats, life, max: life, type: 'field',
      kind, R, op, spin, t: 0, sig, sigOp, colMesh, walls, cols, puffs, swords,
      pulseT: 0, follow: opts.follow || null, color
    };
    this.zones.push(z);
    return grp;
  },

  /* 领域逐帧：入场缓出 → 稳定 → 收尾淡出（时间轴三段式，SKILL-VFX-PLAN §5）。
   * 单独一个方法而不是塞进 update 的 if-else：领域有 4 种 kind、7 类部件，
   * 塞进去会把那个 switch 撑成一屏。 */
  _fieldTick(z, dt) {
    z.t += dt;
    const t = z.t;
    const k = Math.min(1, t / z.max);
    const e = 1 - Math.pow(1 - Math.min(1, t / 0.35), 3);   // 入场缓出
    const outK = k > 0.85 ? Math.max(0, 1 - (k - 0.85) / 0.15) : 1;
    const f = e * outK;
    /* 跟随：剑阵的「跟随」变体与毒雾的「追随」都要跟着人走。
     * 传函数而不是传坐标 —— 阵心每帧都在变，传快照就会「阵留在了原地」。 */
    if (z.follow) {
      const p = z.follow();
      if (p) z.mesh.position.set(p.x, 0, p.z);
    }
    const camQ = this.cam ? this.cam.quaternion : null;

    if (z.sig) {
      z.sig.rotation.z += dt * z.spin;
      z.sig.material.opacity = z.sigOp * f;
      z.sig.scale.setScalar(z.R * 2 * (0.55 + e * 0.45));
    }
    if (z.colMesh) {
      z.colMesh.material.opacity = 0.10 * f * (0.8 + 0.2 * Math.sin(t * 3));
      z.colMesh.rotation.y += dt * 0.35;
    }
    for (const w of z.walls) {
      w.material.opacity = 0.28 * f * (0.75 + 0.25 * Math.sin(t * 5 + w.userData.s));
      w.rotation.y += dt * 0.55 * w.userData.s;
    }
    /* 法阵每 2 秒一次脉冲环：领域"活着"的读数。半径仍取 R（判定口径） */
    if (z.kind === 'sigil') {
      z.pulseT += dt;
      if (z.pulseT >= 2) {
        z.pulseT = 0;
        this.ring(_vField.set(z.mesh.position.x, 0.15, z.mesh.position.z),
          z.R, z.color, 0.5, 0.14);
      }
    }
    if (z.kind === 'taiji') {
      const eyeA = z.sig ? z.sig.rotation.z : t * z.spin;
      z.cols.forEach((m, i) => {
        const a = eyeA + i * Math.PI;
        m.position.x = Math.cos(a) * z.R * 0.50;
        m.position.z = Math.sin(a) * z.R * 0.50;
        m.rotation.y += dt * (i ? -2.2 : 2.2);
        m.material.opacity = (i ? 0.36 : 0.46) * f * (0.8 + 0.2 * Math.sin(t * 4 + i * 2));
      });
    }
    if (z.kind === 'mist') {
      for (const m of z.puffs) {
        const ud = m.userData;
        ud.ry += dt * 0.3;
        if (camQ) m.quaternion.copy(camQ);
        m.rotateZ(ud.ry);
        const br = 1 + Math.sin(t * 0.9 + ud.ph) * 0.10;
        m.scale.set(ud.s0 * br, ud.s0 * 0.78 * br, 1);
        m.position.x = ud.ox + Math.sin(t * 0.5 + ud.ph) * 0.22;
        m.position.z = ud.oz + Math.cos(t * 0.43 + ud.ph) * 0.22;
        m.position.y = ud.oy + Math.sin(t * 0.6 + ud.ph) * 0.10;
        m.material.opacity = 0.50 * f * (0.72 + 0.28 * Math.sin(t * 1.3 + ud.ph));
      }
    }
    if (z.kind === 'blades') {
      z.swords.forEach((s, i) => {
        s.a += dt * 2.2;
        const x = Math.cos(s.a) * s.r;
        const zz = Math.sin(s.a) * s.r * 0.78;
        const y = 0.95 + Math.sin(s.a * 2 + i) * 0.22;
        s.m.position.set(x, y, zz);
        if (camQ) s.m.quaternion.copy(camQ);
        s.m.rotateZ(-s.a + Math.PI / 2);
        s.m.scale.set(0.55, 1.55, 1);
        s.m.material.opacity = 0.85 * outK;
      });
    }
  },

  beam(a, b, color = 0x88ddff, dur = 0.16, width = 1) {
    const pts = [];
    const seg = 8;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < seg) { p.x += RND(-0.35, 0.35); p.z += RND(-0.35, 0.35); p.y += RND(-0.2, 0.2); }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.lit(color), transparent: true, opacity: Math.min(1, 0.95 * this.amp), linewidth: width }));
    this.scene.add(line);
    this.beams.push({ line, life: dur, max: dur });
    this.burst(b, color, 8, { speed: 5, size: 0.08, life: 0.3, additive: true, gravity: 0 });
  },

  /* 剑光 */
  slash(pos, angle, color = 0xffffff, radius = 2.2, arc = 2.2) {
    // 几何体只按半径/弧度缓存，朝向交给 rotation.z（等价于原来的 thetaStart）
    const geo = fxRing(radius * 0.55, radius, 24, arc);
    /* [P2c] 刀光变亮：颜色 + 不透明度。radius / arc 不动 —— 剑光的弧度
     * 就是这一刀扫过的角度，画大了等于骗玩家「这一下能扫到背后」。 */
    const op0 = Math.min(1, 0.85 * this.amp);
    const mat = new THREE.MeshBasicMaterial({ color: this.lit(color), transparent: true, opacity: op0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = angle - arc / 2;
    m.position.set(pos.x, 0.6, pos.z);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: 0.2, max: 0.2, type: 'slash', op0 });
  },

  /**
   * 生成一枚投射物。
   * style: 'orb'（默认，法球）| 'talisman'（符咒）
   * hitRadius: 命中判定半径，和视觉半径分开 —— 法球看起来只有 0.3，
   *            但判定给 0.6 才不会「擦着模型飞过去」。
   * homing: 一个 Vector3 引用（通常直接传 enemy.pos），有值就自动追踪。
   */
  projectile(opts) {
    const r = opts.radius || 0.3;
    const col = opts.color || 0xffaa44;
    /* [P2c] 光效随等级变亮：**只调亮球体 / 光晕的颜色**，半径一个字节不动 ——
     * 法球的视觉半径和 hitRadius 本来就是分开的两个数（见上面注释），
     * 把视觉半径放大等于向玩家谎报判定范围。
     * `p.color` 仍存原色：拖尾交给 burst 去调亮，存调亮后的值会被调两次。 */
    const colLit = this.lit(col);
    const style = opts.style || 'orb';
    let m, mat, haloMat = null, haloMat2 = null;

    if (style === 'talisman') {
      /* 符咒：一张竖长符纸 + 背后一层加色光晕。
       * 符纸始终朝向相机（billboard），旋转量只有绕视线的一点摆动，
       * 这样无论从哪个角度看都能看清「这是一道符」，不会缩成一条线。
       *
       * 尺寸按角色身高反推：主角约 1.8 单位高，符纸取 0.64 高（约三分之一身）。
       * 原先是 1.03 高，飞起来像举着一面幡，挡视野也挡怪物。 */
      const scl = opts.scale || 1;
      mat = new THREE.MeshBasicMaterial({
        map: talismanTexture(), transparent: true, opacity: 1,
        depthWrite: false, side: THREE.DoubleSide
      });
      m = new THREE.Mesh(fxPlane(0.40 * scl, 0.64 * scl), mat);
      haloMat = new THREE.MeshBasicMaterial({
        color: colLit, transparent: true, opacity: Math.min(1, 0.42 * this.amp),
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const glow = new THREE.Mesh(fxPlane(0.72 * scl, 0.98 * scl), haloMat);
      glow.position.z = -0.01;
      m.add(glow);
    } else {
      mat = new THREE.MeshBasicMaterial({ color: colLit, transparent: true, opacity: Math.min(1, 0.95 * this.amp) });
      m = new THREE.Mesh(sphGeo(r, 7), mat);
      /* 不再给投射物挂 PointLight。
       * 场景里光源数量一变，three 就会把所有材质的 shader 重新编译一次，
       * 战斗中不停发射/消失 → 每帧几百次重编译 → 这是「非常卡」的头号原因。
       * 改用两层叠加光晕，视觉上几乎等价，成本只是两个精灵。
       */
      haloMat = new THREE.MeshBasicMaterial({ color: colLit, transparent: true, opacity: Math.min(1, 0.34 * this.amp), blending: THREE.AdditiveBlending, depthWrite: false });
      m.add(new THREE.Mesh(sphGeo(r * 1.9, 6), haloMat));
      haloMat2 = new THREE.MeshBasicMaterial({ color: colLit, transparent: true, opacity: Math.min(1, 0.13 * this.amp), blending: THREE.AdditiveBlending, depthWrite: false });
      m.add(new THREE.Mesh(sphGeo(r * 3.4, 6), haloMat2));
      if (opts.scale) m.scale.setScalar(opts.scale);
    }
    m.position.copy(opts.pos);
    this.scene.add(m);
    const p = {
      mesh: m, mat, haloMat, haloMat2, trailT: 0, pos: m.position,
      /* prevPos 是「上一帧的位置」，扫掠碰撞要用它和 pos 连成线段。
       * 只在 update 里推进位置，碰撞判定在 Game.updateProjectiles 里做。 */
      prevPos: m.position.clone(),
      vel: opts.dir.clone().multiplyScalar(opts.speed || 18),
      speed: opts.speed || 18,
      radius: r, hitRadius: opts.hitRadius || r,
      life: opts.life || 2.4, team: opts.team || 'player',
      dmg: opts.dmg || 10, onHit: opts.onHit, pierce: opts.pierce || false,
      trail: opts.trail !== false, color: opts.color || 0xffaa44, elem: opts.elem,
      knock: opts.knock || 0,
      style, spin: Math.random() * 6.28, spinSpd: opts.spinSpd || 3.2,
      homing: opts.homing || null, homeTurn: opts.homeTurn || 6,
      hitSet: null,
      tag: opts.tag,           // [S1] 伤害乘区标记，命中时由调用方取回
      /* [P3b] 元素注入跟着投射物走：飞出去时施法窗口早就关了，
       * 创建那一刻把 `{key, amt}` 复制过来，命中时由 Game.curInject 取回 */
      inj: opts.inj || null
    };
    this.projectiles.push(p);
    return p;
  },

  text(pos, str, cls = 'dmg', opts = {}) {
    if (!this.layer) return;
    if (this.texts.length > this.maxTexts) { const old = this.texts.shift(); if (old.el.parentNode) old.el.remove(); }
    const el = document.createElement('div');
    el.className = 'dmg-text ' + cls;
    el.textContent = str;
    if (opts.color) el.style.color = opts.color;
    el.style.left = '0px'; el.style.top = '0px';
    this.layer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), life: opts.life || 1.0, max: opts.life || 1.0, vy: opts.vy || 1.2, vx: RND(-0.35, 0.35) });
  },

  update(dt) {
    /* [P2c] 施法尾窗：castSkill 设完 amp 后在这里倒数。
     * 技能的延后特效（陨石砸地 / 火墙四段 / 崩击三段）都在 0.4~1.2 秒后出，
     * 尾窗就是为它们留的 —— 到点回落 1，不会一路亮到下一次施法。 */
    if (this.ampHold > 0) {
      this.ampHold -= dt;
      if (this.ampHold <= 0) { this.ampHold = 0; this.amp = 1; }
    }
    // 粒子（THREE.Points：整组一个 draw call，位置在这里逐帧刷新）
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.mat.opacity = Math.max(0, p.life / p.max);
      const arr = p.arr, vel = p.vel, n = p.n;
      const damp = Math.max(0, 1 - p.drag * dt);
      const g = p.gravity * dt;
      for (let k = 0; k < n * 3; k += 3) {
        vel[k + 1] -= g;
        vel[k] *= damp; vel[k + 1] *= damp; vel[k + 2] *= damp;
        arr[k] += vel[k] * dt;
        arr[k + 1] += vel[k + 1] * dt;
        arr[k + 2] += vel[k + 2] * dt;
      }
      p.attr.needsUpdate = true;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        p.geo.dispose();
        p.mat.dispose();
        this.parts.splice(i, 1);
      }
    }
    // 区域类
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      const k = 1 - z.life / z.max;
      if (z.type === 'ring') {
        z.mesh.scale.setScalar(z.radius * (0.25 + k * 0.9));
        z.mat.opacity = Math.max(0, (z.op0 || 0.9) * (1 - k));
      } else if (z.type === 'flash') {
        z.mat.opacity = Math.max(0, (z.op0 || 0.55) * (1 - k));
        z.mesh.scale.setScalar(z.mesh.scale.x * (1 + dt * 0.6));
      } else if (z.type === 'tele') {
        z.mat.opacity = 0.18 + Math.sin(k * 26) * 0.12 + k * 0.25;
        if (z.life <= 0 && z.cb) { z.cb(); z.cb = null; }
      } else if (z.type === 'area') {
        z.mat.opacity = Math.max(0, (z.baseOp || 0.18) * (0.85 + Math.sin(k * 14) * 0.2)) * Math.min(1, z.life * 2);
        z.mesh.scale.setScalar(z.radius * (0.94 + Math.sin(k * 6) * 0.03));
      } else if (z.type === 'slash') {
        z.mat.opacity = Math.max(0, (z.op0 || 0.85) * (1 - k));
        z.mesh.rotation.z += dt * 2;
      } else if (z.type === 'field') {
        this._fieldTick(z, dt);
      }
      if (z.life <= 0) {
        this.scene.remove(z.mesh);
        /* 领域是一整个 Group、材质有好几份（地纹 / 柱 / 墙 / 剑影各自一份），
         * 只 dispose 一个 `z.mat` 会漏掉其余材质 —— 连放技能就是一路涨显存。
         * 几何体走 `_fxGeo` 的共享缓存，不在这里释放。 */
        if (z.mats) { for (const m of z.mats) m.dispose(); }
        else if (z.mat) z.mat.dispose();
        this.zones.splice(i, 1);
      }
    }
    // 光束
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.beams.splice(i, 1); }
    }
    // 文字
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.pos.y += t.vy * dt;
      t.pos.x += t.vx * dt;
      t.vy = Math.max(0.1, t.vy - dt * 2.2);
      if (t.life <= 0) { t.el.remove(); this.texts.splice(i, 1); continue; }
      const v = t.pos.clone().project(this.cam);
      if (v.z > 1) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'block';
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      t.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${1 + Math.max(0, 0.3 - (t.max - t.life)) * 0.9})`;
      t.el.style.opacity = Math.min(1, t.life * 2.5);
    }
    // 投射物（仅视觉推进，碰撞在 Game 中）
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      /* 记录推进前的位置：Game 的扫掠碰撞用它和 pos 连成线段，
       * 否则高速投射物一帧跨过整只怪，判定点永远踩空。 */
      p.prevPos.copy(p.pos);
      if (p.homing) {
        _vHome.set(p.homing.x - p.pos.x, 1.0 - p.pos.y, p.homing.z - p.pos.z);
        if (_vHome.lengthSq() > 1e-6) {
          _vHome.normalize().multiplyScalar(p.speed);
          p.vel.lerp(_vHome, Math.min(1, p.homeTurn * dt));
        }
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.style === 'talisman' && this.cam) {
        /* 符纸永远正对镜头，只绕视线轴做小幅摆动，任何角度都能看清是张符 */
        p.mesh.quaternion.copy(this.cam.quaternion);
        p.spin += dt * p.spinSpd;
        p.mesh.rotateZ(Math.sin(p.spin) * 0.34);
      }
      // 拖尾按时间节流：原来每帧 70% 概率新建一组粒子，战斗中每秒几十次分配
      p.trailT = (p.trailT || 0) - dt;
      if (p.trail && p.trailT <= 0) {
        p.trailT = 0.055;
        this.burst(p.pos, p.color, 1, { speed: 0.6, size: 0.09, life: 0.22, gravity: 0, additive: true });
      }
      if (p.life <= 0) { this.removeProjectile(i); }
    }
    /* [V0] 原语层（src/fx-kit.js）：贴图粒子 / 拖尾 / 闪电 / 冲击波 / 贴花。
     * 单独一个 update 而不是塞进上面几条循环 —— 它的对象形状和生命周期都不一样，
     * 混进来会让这个函数更难读，而且它可能根本不存在（低画质档整层关掉）。 */
    if (typeof FXK !== 'undefined' && FXK && typeof FXK.update === 'function') FXK.update(dt);
  },

  removeProjectile(i) {
    const p = this.projectiles[i];
    if (!p) return;
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    p.mat.dispose();
    if (p.haloMat) p.haloMat.dispose();
    if (p.haloMat2) p.haloMat2.dispose();
    this.projectiles.splice(i, 1);
  },

  /* 换图 / 重开时彻底清空所有特效，并把材质还回去 */
  clear() {
    for (const p of this.projectiles) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mat.dispose();
      if (p.haloMat) p.haloMat.dispose();
      if (p.haloMat2) p.haloMat2.dispose();
    }
    this.projectiles.length = 0;
    for (const z of this.zones) {
      if (z.mesh.parent) z.mesh.parent.remove(z.mesh);
      z.mat.dispose();
      z.mesh.traverse(o => { if (o.material && o.material !== z.mat) o.material.dispose(); });
    }
    this.zones.length = 0;
    for (const pa of this.parts) {
      if (pa.obj.parent) pa.obj.parent.remove(pa.obj);
      pa.geo.dispose();
      pa.mat.dispose();
    }
    this.parts.length = 0;
    for (const b of this.beams) {
      if (b.line.parent) b.line.parent.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    }
    this.beams.length = 0;
    for (const t of this.texts) { if (t.el.parentNode) t.el.remove(); }
    this.texts.length = 0;
    /* 换图 / 重开时把光效强度也还原：否则上一张图末尾那次 20 级技能的亮度
     * 会跟着尾窗带进新图（新图起手第一发就莫名偏亮） */
    this.amp = 1;
    this.ampHold = 0;
    /* [V0] 原语层（贴图粒子 / 拖尾 / 闪电 / 冲击波 / 贴花）跟着一起清。
     * 不接这一句的话，换图时贴花池会留在旧地图坐标上，闪电 / 拖尾的
     * 半透明面片也会挂在新场景里 —— 表现为「进新图先闪一下旧图的东西」。 */
    if (typeof FXK !== 'undefined' && FXK && typeof FXK.clear === 'function') FXK.clear();
  }
};
