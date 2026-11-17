/* ============================================================
 * 玩家设置：画质档位 / 渲染倍率 / 阴影 / 粒子 / 同屏怪数 / 帧数显示 / 拾取
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
    mobCap: 'auto',      // 'auto' | 12 | 20 | 28 | 36 | 48
    /* 镜头（v2.x）：视角预设 + 震动强度。和画质分开，低配机器也能用高视角。
     *   view  classic 默认（俯视 43°）/ torch 火炬之光（更远更高、无推镜、跟随更硬）
     *         diablo 暗黑4（接近俯视 64°）/ fp 第一人称
     *   shake off | weak | std | strong —— 打击震屏的倍率，off 完全不晃 */
    view: 'torch',
    shake: 'weak',
    /* 音频四条滑杆（0–100）+ 一键静音。和画质分开存同一个 key，
     * 换角色不重设；曲线在 AudioSys.gainOf（1.6 次幂，线性滑杆听感太哑） */
    mute: false,
    volMaster: 80,
    volSfx: 80,
    volAmb: 55,
    volMusic: 45,
    /* 拾取（P04）：一个总开关 + 一个品质门槛 + 三类非装备掉落开关。
     * 语义是「**自动**拾取」而不是「拾取」——关掉任何一项都不会让东西捡不起来，
     * 只是回到「走到脚边（grabR）才捡」的老行为。这样任何一个开关都不会变成
     * 「钱永远捡不到」这种死局。 */
    autoPickup: true,
    pickupMinRarity: 'magic',   // 低于此品质的装备不自动捡（仍留在地上可手动捡）
    pickupGold: true,           // 金币 + 玄晶
    pickupMat: true,            // 匠材
    pickupRune: true            // 符文
  },

  /* 品质门槛的可选值。**故意写死在这里，不从 RARITY 生成** ——
   * settings.js 比 data-core.js 先加载，normalize() 可能在数据表就位前被调用。 */
  RARITY_OPTS: ['common', 'magic', 'rare', 'legendary', 'set'],

  /* 画质相关键：动到这些才算「自定义档位」，音量不算 */
  PERF_KEYS: ['scale', 'shadow', 'fx', 'mobCap'],

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
    /* 镜头：老存档没有这两项 → 落默认（火炬之光视角 / 弱震动），
     * 也就是「默认就给一个更舒服、不晃的镜头」。 */
    d.view = this._pick(o.view, ['classic', 'torch', 'diablo', 'fp'], this.DEFAULTS.view);
    d.shake = this._pick(o.shake, ['off', 'weak', 'std', 'strong'], this.DEFAULTS.shake);
    /* 音量：夹到 0–100 的整数。旧存档没有这几项 → 落默认值，不会静音 */
    d.mute = !!o.mute;
    d.volMaster = this._vol(o.volMaster, this.DEFAULTS.volMaster);
    d.volSfx = this._vol(o.volSfx, this.DEFAULTS.volSfx);
    d.volAmb = this._vol(o.volAmb, this.DEFAULTS.volAmb);
    d.volMusic = this._vol(o.volMusic, this.DEFAULTS.volMusic);
    /* 拾取：旧存档没有这几项 → 全落默认（自动开 / 灵品以上 / 三类掉落都捡）。
     * 布尔用「=== false 才关」而不是 !!o.x —— 老存档里字段缺失时 !!undefined 也是 false，
     * 会把「默认开」写成「关」，玩家会以为新版本把自动拾取弄丢了。 */
    d.autoPickup = (o.autoPickup === undefined || o.autoPickup === null) ? this.DEFAULTS.autoPickup : !!o.autoPickup;
    d.pickupMinRarity = this._pick(o.pickupMinRarity, this.RARITY_OPTS, this.DEFAULTS.pickupMinRarity);
    d.pickupGold = (o.pickupGold === undefined || o.pickupGold === null) ? this.DEFAULTS.pickupGold : !!o.pickupGold;
    d.pickupMat = (o.pickupMat === undefined || o.pickupMat === null) ? this.DEFAULTS.pickupMat : !!o.pickupMat;
    d.pickupRune = (o.pickupRune === undefined || o.pickupRune === null) ? this.DEFAULTS.pickupRune : !!o.pickupRune;
    return d;
  },

  _vol(v, def) {
    const n = Number(v);
    if (v === undefined || v === null || isNaN(n)) return def;
    return Math.max(0, Math.min(100, Math.round(n)));
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
      /* 音量 / 静音不参与画质档位判定：调个音量不该把「自动降画质」关掉 */
      if (this.PERF_KEYS.indexOf(k) >= 0) this.d.preset = 'custom';
      /* 布尔项一律收成真正的布尔。UI 传下来的是 '0'/'1' 字符串，
       * 直接存会让 `d.autoPickup ? …` 恒为真（'0' 也是真值），
       * 表现就是「关掉了但还是在自动捡」。 */
      if (typeof this.DEFAULTS[k] === 'boolean') this.d[k] = (v === '0' || v === 0 || v === false) ? false : !!v;
      else this.d[k] = v;
    }
    this.save();
    this.apply(k);
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

  /* ---------------- 生效 ----------------
   * changed = 刚被改的键。**音频键不重绘设置面板** ——
   * 滑杆靠 input 事件连续改值，一重绘就把正在拖的那个 input 从 DOM 里换掉，
   * 手指底下的节点一换，后续 input 事件再也冒泡不到委托监听上，
   * 表现就是「拖到某个位置之后怎么拖都不动了」。
   * 数字标签由 UI.onSettingsSlide 自己更新，不需要整页重绘。 */
  apply(changed) {
    /* 音量立刻生效（还没解锁音频时只是把增益值写好，解锁后自然对） */
    if (typeof AudioSys !== 'undefined') AudioSys.applyVolumes();
    /* 镜头：视角 / 震动。放在 renderer 守卫之前 —— 标题界面也允许先调好视角 */
    if (typeof Game !== 'undefined' && Game.applyCamView) {
      try { Game.applyCamView(changed); } catch (e) { console.error('[镜头] 应用失败', e); }
    }
    if (typeof Game === 'undefined' || !Game.renderer) return;
    /* 手动档位不参与自动升降：把等级钉在 0，避免下一次 tickPerf 又改回去 */
    if (!this.autoAdjust()) Game.perf.level = 0;
    Game.applyPerfLevel();
    if (typeof UI !== 'undefined') {
      const audioKey = (changed === 'mute' || String(changed).indexOf('vol') === 0);
      if (!audioKey && UI.renderSettings) UI.renderSettings();
      if (UI.syncFps) UI.syncFps();
    }
  }
};
