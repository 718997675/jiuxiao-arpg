/* ============================================================
 * 玩家设置：画质档位 / 渲染倍率 / 阴影 / 粒子 / 同屏怪数 / 帧数显示
 *
 * 和角色存档分开存（换角色不用重设），单独一个 localStorage key。
 * 所有值都过 normalize()，脏数据/旧版本字段一律回落默认值，
 * 不能让一个坏掉的设置把游戏卡死或渲染成全黑。
 *
 * 设计原则：只有一个「自动」档会跟帧率联动，其余档位都是写死的。
 * 否则用户手动调了 0.8 倍分辨率，自适应又偷偷改回去，会显得「设置不生效」。
 * ============================================================ */

const Settings = {
  KEY: 'jiuxiao_settings_v1',

  /* 预设档位：选中它就把下面四项一起写死 */
  PRESETS: {
    auto:  { scale: 'auto', shadow: 'auto', fx: 'auto',  mobCap: 'auto' },
    ultra: { scale: 1.25,   shadow: 'on',   fx: 'high',  mobCap: 48 },
    high:  { scale: 1.0,    shadow: 'on',   fx: 'high',  mobCap: 36 },
    mid:   { scale: 0.8,    shadow: 'on',   fx: 'mid',   mobCap: 28 },
    low:   { scale: 0.65,   shadow: 'off',  fx: 'low',   mobCap: 20 },
    min:   { scale: 0.5,    shadow: 'off',  fx: 'low',   mobCap: 12 }
  },

  DEFAULTS: {
    fps: false,          // 显示帧数
    preset: 'auto',      // auto | ultra | high | mid | low | min | custom
    scale: 'auto',       // 'auto' | 0.5 | 0.65 | 0.8 | 1.0 | 1.25
    shadow: 'auto',      // 'auto' | 'on' | 'off'
    fx: 'auto',          // 'auto' | 'high' | 'mid' | 'low'
    mobCap: 'auto'       // 'auto' | 12 | 20 | 28 | 36 | 48
  },

  d: null,

  /* ---------------- 读写 ---------------- */

  load() {
    let raw = null;
    try { raw = (typeof Store !== 'undefined') ? Store.getKey(this.KEY) : null; } catch (e) { raw = null; }
    let o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    this.d = this.normalize(o);
    return this.d;
  },

  save() {
    try {
      if (typeof Store !== 'undefined') Store.setKey(this.KEY, JSON.stringify(this.d));
    } catch (e) { /* 存不下也不影响本局 */ }
  },

  normalize(o) {
    const d = Object.assign({}, this.DEFAULTS);
    if (!o || typeof o !== 'object') return d;
    d.fps = !!o.fps;
    d.preset = this.PRESETS[o.preset] ? o.preset : (o.preset === 'custom' ? 'custom' : 'auto');
    d.scale = this._pick(o.scale, ['auto', 1.25, 1.0, 0.8, 0.65, 0.5], 'auto');
    d.shadow = this._pick(o.shadow, ['auto', 'on', 'off'], 'auto');
    d.fx = this._pick(o.fx, ['auto', 'high', 'mid', 'low'], 'auto');
    d.mobCap = this._pick(o.mobCap, ['auto', 12, 20, 28, 36, 48], 'auto');
    return d;
  },

  _pick(v, list, def) {
    for (const x of list) {
      if (x === 'auto') { if (v === 'auto' || v === undefined || v === null) return 'auto'; continue; }
      if (typeof x === 'number') { if (Number(v) === x) return x; }
      else if (v === x) return x;
    }
    return def;
  },

  /* ---------------- 修改 ---------------- */

  set(k, v) {
    if (!this.d) this.load();
    if (k === 'preset') {
      const p = this.PRESETS[v];
      if (!p) return;
      this.d.preset = v;
      Object.assign(this.d, p);
    } else {
      if (!(k in this.DEFAULTS)) return;
      this.d[k] = v;
      /* 动了任何一项就不再是预设档了，标成 custom，
       * 同时关掉自动降画质——不然自适应会把用户刚调的值又改回去 */
      if (k !== 'fps') this.d.preset = 'custom';
    }
    this.save();
    this.apply();
  },

  reset() {
    this.d = Object.assign({}, this.DEFAULTS);
    this.save();
    this.apply();
  },

  /* 自动降画质是否启用（只有「自动」档才跟帧率联动） */
  autoAdjust() { return !this.d || this.d.preset === 'auto'; },

  /* ---------------- 合成实际参数 ----------------
   * lv = 自动降画质的等级 0~2，只有 autoAdjust() 为真时才会变化。
   * 返回给 Game.applyPerfLevel 直接用。 */
  resolve(lv) {
    const d = this.d || this.DEFAULTS;
    const touch = (typeof IS_TOUCH !== 'undefined') && IS_TOUCH;

    const autoDprCap = [1.5, 1.25, 1.0][lv] || 1.0;
    const scale = d.scale === 'auto' ? 1 : Number(d.scale) || 1;
    let dpr = Math.min(window.devicePixelRatio || 1, autoDprCap) * scale;
    /* 上下都夹住：低于 0.4 会糊到看不清字，高于 2 在 4K 屏上等于自杀 */
    dpr = Math.max(0.4, Math.min(2, dpr));

    let shadow;
    if (d.shadow === 'off') shadow = false;
    else if (d.shadow === 'on') shadow = true;
    else shadow = lv < 2;

    const fx = d.fx === 'auto'
      ? ([1, 0.7, 0.5][lv] || 0.5)
      : ({ high: 1, mid: 0.7, low: 0.5 }[d.fx] || 0.7);

    const mobCap = d.mobCap === 'auto' ? (touch ? 28 : 36) : (Number(d.mobCap) || 36);

    return {
      dpr,
      shadow,
      shadowSize: lv === 0 ? 1536 : 1024,
      fx,
      mobCap,
      /* 手动把阴影开回来时，就算自动档已经降到 L2，也别用 1024 的小贴图 */
      forceShadow: d.shadow === 'on'
    };
  },

  /* ---------------- 生效 ---------------- */

  apply() {
    if (typeof Game === 'undefined' || !Game.renderer) return;
    /* 手动档位不参与自动升降：把等级钉在 0，避免下一次 tickPerf 又改回去 */
    if (!this.autoAdjust()) Game.perf.level = 0;
    Game.applyPerfLevel();
    if (typeof UI !== 'undefined') {
      if (UI.renderSettings) UI.renderSettings();
      if (UI.syncFps) UI.syncFps();
    }
  }
};
