/* ============================================================
 * [U4 / V6] 元素反应专属视觉层 —— 10 组反应各一套视觉语言
 *
 * 本文件是**源码**，不是生成物（对比 sfx.js / fx2.js / data-bosskits.js）。
 *
 * 为什么要单开一个文件：10 组反应的**数值**逻辑在 game.js 的 applyElemReaction，
 * 而视觉要换成 FXK 五原语（spr / trail / bolt / shock / decal）。两边混在一起，
 * 那个 switch 会涨到 300 行、以后没人敢动。数值与视觉分开，改一边不碰另一边。
 *
 * 为什么不改 fx-kit.js：五原语已经够用（贴图 14 格），不需要新原语。
 * 新增原语 = 新增一份材质缓存与降级分支，收益不抵成本。
 *
 * ---------------- 三条铁律 ----------------
 * 1. **只画，不结算**。不碰 e.pos / e.hp / 任何字段，不改任何数值。
 * 2. **不另设 ICD**。视觉画在 applyElemReaction 里 = 只在反应真触发时画，
 *    0.5s 全局 / 2s 同目标那两道冷却由反应机制自己记（_reactCd / e._reactAt）。
 *    再设一套就是两套冷却打架。
 * 3. **降级交给 FXK**。FX.q 的分档由原语内部读，这里不抄第二份倍率。
 *
 * 「画了什么」由 stats().lastDraw[key].parts 记录 —— 探针逐条判，不靠肉眼。
 * ============================================================ */
const ElemFX = (function () {
  'use strict';

  const _counts = Object.create(null);    /* key → 触发次数 */
  const _draws = Object.create(null);     /* key → 真的画了几次 */
  const _links = Object.create(null);     /* key → 链式电弧画了几段 */
  const _lastDraw = Object.create(null);  /* key → 最后一次的原语清单与坐标 */
  const _errors = [];

  function V(x, y, z) {
    return new THREE.Vector3(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  }
  function fxk() {
    return (typeof FXK !== 'undefined' && FXK && FXK.enabled) ? FXK : null;
  }
  function mark(parts, name) { parts.push(name); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------------- 10 套配方 ----------------
   * 每套只用 FXK 现有五原语。parts 里记的是「这一套画了什么」，
   * 探针拿它比 10 组之间**形状**互不重样（配色不算形状）。 */
  const DRAW = {
    /* 1 蒸汽爆裂：白色汽浪。先扩出去一圈，再从四周**向内**翻卷 ——
     * 汽浪不是往外喷的，是卷回来盖住目标的。 */
    steam(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const R = c.radius || 2.6;
      K.shock(p, R * 1.15, { color: c.color });
      mark(parts, 'shock');
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        const from = V(p.x + Math.cos(a) * R, 0.5 + rnd(0, 1.1), p.z + Math.sin(a) * R);
        K.spr(from, {
          n: 7, tex: 'smoke', color: c.color2 || c.color, size: 0.55,
          life: 0.85, speed: 5.0, spread: 0.2, dir: V(-Math.cos(a), 0.4, -Math.sin(a)),
          additive: false
        });
      }
      mark(parts, 'spr:smoke:inward×4');
      K.decal(p, { tex: 'frost', color: c.color2 || 0xbfe6ff, size: R * 1.3, life: 1.6, opacity: 0.65 });
      mark(parts, 'decal:frost');
      return parts;
    },

    /* 2 等离子：紫白电弧球。球形闪电 —— 电弧从球面随机点跳到中心。 */
    plasma(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const R = c.radius || 2.2;
      const ctr = V(p.x, 1.15, p.z);
      K.spr(ctr, { n: 14, tex: 'star', color: c.color, size: 0.5, life: 0.45, speed: 2.2, additive: true });
      mark(parts, 'spr:star');
      for (let i = 0; i < 3; i++) {
        const a = rnd(0, Math.PI * 2), el = rnd(-0.35, 0.85);
        const rr = R * rnd(0.7, 1.15);
        const from = V(ctr.x + Math.cos(a) * rr, 1.15 + el * 0.9, ctr.z + Math.sin(a) * rr);
        K.bolt(from, ctr, { depth: 3, jitter: 0.16, life: 0.18, branch: 0.5 });
      }
      mark(parts, 'bolt:surface×3');
      K.shock(p, R, { color: c.color2 || 0xffffff });
      mark(parts, 'shock');
      return parts;
    },

    /* 3 焚毒：绿火包橙芯，缓慢上卷。两层 ember —— 外面慢、里面快而小。 */
    burnpoison(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      K.spr(V(p.x, 0.45, p.z), {
        n: 12, tex: 'ember', color: c.color, size: 0.55, life: 1.0,
        speed: 1.3, grav: -1.5, up: 1.3, spread: 0.5, additive: true
      });
      mark(parts, 'spr:ember:outer');
      K.spr(V(p.x, 0.6, p.z), {
        n: 7, tex: 'ember', color: c.color2 || 0xff7a30, size: 0.34, life: 0.8,
        speed: 1.0, grav: -2.0, up: 1.6, spread: 0.35, additive: true
      });
      mark(parts, 'spr:ember:core');
      K.decal(p, { tex: 'acid', color: c.color, size: 1.9, life: 2.0, opacity: 0.5 });
      mark(parts, 'decal:acid');
      return parts;
    },

    /* 4 感电冻结：晶体。环形排布的碎片拼成六边壳（spr 的 ring 开关正好干这个），
     * 壳里面三条电弧往上爬 —— 「裂纹发光」而不是「球在闪」。 */
    frozele(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const R = c.radius || 2.0;
      K.spr(V(p.x, 1.0, p.z), {
        n: 6, tex: 'shard', color: c.color, size: 0.42, life: 0.6,
        speed: 1.6, ring: 1.15, up: 0.25, spread: 0.06, additive: true
      });
      mark(parts, 'spr:shard:hex-shell');
      for (let i = 0; i < 3; i++) {
        const a = rnd(0, Math.PI * 2);
        K.bolt(V(p.x + Math.cos(a) * 0.9, 0.35, p.z + Math.sin(a) * 0.9),
          V(p.x, 1.75, p.z), { depth: 3, jitter: 0.2, life: 0.16, branch: 0.6 });
      }
      mark(parts, 'bolt:crack×3');
      K.shock(p, R, { color: c.color2 || 0xffffff });
      mark(parts, 'shock');
      return parts;
    },

    /* 5 腐霜：霜面腐蚀。两张贴花叠 —— 白霜打底、绿斑晕在上面，
     * 再撒一点往下掉的尘。这是 10 组里唯一「没有冲击波」的一组。 */
    frostrot(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      K.decal(p, { tex: 'frost', color: c.color, size: 2.1, life: 3.0, opacity: 0.6 });
      mark(parts, 'decal:frost');
      K.decal(p, { tex: 'acid', color: c.color2 || 0x9adf60, size: 1.5, life: 3.0, opacity: 0.5, y: 0.07 });
      mark(parts, 'decal:acid');
      K.spr(V(p.x, 0.5, p.z), {
        n: 8, tex: 'dust', color: c.color2 || 0x9adf60, size: 0.26,
        life: 1.1, speed: 1.6, grav: 4, up: 0.4, spread: 0.7, additive: false
      });
      mark(parts, 'spr:dust');
      return parts;
    },

    /* 6 腐蚀链：链式绿电弧。**链段由 link() 单独画**（见下），
     * 这里画的是起点的那一发绿弧 —— 与别的组区分开的形状是「向外甩的三叉」。 */
    corrochain(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const ctr = V(p.x, 1.1, p.z);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + rnd(-0.3, 0.3);
        K.bolt(ctr, V(p.x + Math.cos(a) * 2.4, 0.6, p.z + Math.sin(a) * 2.4),
          { depth: 3, jitter: 0.18, life: 0.2, branch: 0.7 });
      }
      mark(parts, 'bolt:trident×3');
      K.spr(ctr, { n: 10, tex: 'spark', color: c.color, size: 0.28, life: 0.4, speed: 4.5, additive: true });
      mark(parts, 'spr:spark');
      K.decal(p, { tex: 'acid', color: c.color2 || 0x9ad8ff, size: 1.5, life: 1.6, opacity: 0.4 });
      mark(parts, 'decal:acid');
      return parts;
    },

    /* 7 净化烈焰：金火。外金内橙，整体**向上抽成柱** ——
     * 与「往下砸」的那几组方向相反，一眼能分出来。 */
    purify(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      K.spr(V(p.x, 0.3, p.z), {
        n: 16, tex: 'ember', color: c.color, size: 0.5, life: 1.0,
        speed: 1.0, grav: -2.2, up: 3.2, spread: 0.45, additive: true
      });
      mark(parts, 'spr:ember:column');
      K.spr(V(p.x, 0.5, p.z), {
        n: 9, tex: 'ember', color: c.color2 || 0xff7a30, size: 0.3, life: 0.85,
        speed: 0.8, grav: -2.6, up: 3.6, spread: 0.28, additive: true
      });
      mark(parts, 'spr:ember:core');
      K.shock(p, 2.0, { color: c.color });
      mark(parts, 'shock');
      return parts;
    },

    /* 8 圣霜：金光 + 冰本体叠层。收益给玩家（护盾），所以金光**朝玩家收** ——
     * 站在敌人旁边的玩家会看见一道金线从敌人身上飞回自己身上。 */
    holyfrost(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const pg = c.playerPos || p;
      K.decal(p, { tex: 'frost', color: c.color, size: 2.2, life: 2.4, opacity: 0.65 });
      mark(parts, 'decal:frost');
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + 0.6;
        const from = V(p.x + Math.cos(a) * 1.2, 1.1, p.z + Math.sin(a) * 1.2);
        K.trail([from,
          V((from.x + pg.x) * 0.5, 1.7, (from.z + pg.z) * 0.5),
          V(pg.x, 1.1, pg.z)],
          { color: c.color2 || 0xfff2b0, width: 0.16, life: 0.5, additive: true, taper: true });
      }
      mark(parts, 'trail:gold×2');
      K.spr(V(pg.x, 1.2, pg.z), {
        n: 10, tex: 'star', color: c.color2 || 0xfff2b0, size: 0.3, life: 0.6, speed: 1.8, additive: true
      });
      mark(parts, 'spr:star:player');
      return parts;
    },

    /* 9 天罚：唯一「从天上下来」的一组 —— 竖直光柱 + 一道雷 + 落地冲击。 */
    judgment(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push(V(p.x, 9 - (i / 8) * 8.6, p.z));
      K.trail(pts, { color: c.color, width: 0.7, life: 0.45, additive: true, taper: false });
      mark(parts, 'trail:column');
      K.bolt(V(p.x + 0.4, 8.2, p.z), V(p.x, 0.8, p.z),
        { depth: 4, jitter: 0.24, life: 0.2, branch: 0.6 });
      mark(parts, 'bolt');
      K.shock(p, 2.2, { color: c.color2 || 0x9ad8ff });
      mark(parts, 'shock');
      K.spr(V(p.x, 0.7, p.z), {
        n: 14, tex: 'spark', color: c.color2 || 0x9ad8ff, size: 0.3, life: 0.45, speed: 5, additive: true
      });
      mark(parts, 'spr:spark');
      return parts;
    },

    /* 10 解毒雾：金光 + 毒本体叠层。雾**跟着玩家走**（回血雾的中心在人身上，
     * 敌人踩进来不该回血），所以贴花与粒子都画在玩家脚下。 */
    cleansmist(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const pg = c.playerPos || p;
      K.spr(V(pg.x, 0.4, pg.z), {
        n: 14, tex: 'smoke', color: c.color2 || 0xfff2b0, size: 0.6, life: 1.6,
        speed: 0.9, grav: -0.8, up: 0.9, spread: 1.6, additive: false
      });
      mark(parts, 'spr:smoke:gold');
      K.spr(V(pg.x, 0.5, pg.z), {
        n: 8, tex: 'smoke', color: c.color, size: 0.45, life: 1.9,
        speed: 0.7, grav: -0.6, up: 0.7, spread: 1.3, additive: false
      });
      mark(parts, 'spr:smoke:green');
      K.decal(V(pg.x, 0, pg.z), { tex: 'acid', color: c.color, size: 5.2, life: 5.0, opacity: 0.28 });
      mark(parts, 'decal:acid:5s');
      return parts;
    }
  };

  /* 链式电弧的一段：腐蚀链 / 感电冻结共用这个形状，只有颜色不同。
   * 折线 + 拖尾各一个 mesh —— 比逐段再画一条 bolt 便宜。 */
  function link(a, b, color, key) {
    const K = fxk();
    if (!K || !a || !b) return false;
    try {
      K.bolt(a, b, { depth: 3, jitter: 0.2, life: 0.22, branch: 0.7 });
      K.trail([a, b], { color: color, width: 0.14, life: 0.32, additive: true, taper: true });
      _links[key || ''] = (_links[key || ''] || 0) + 1;
      return true;
    } catch (err) {
      _errors.push('link: ' + (err && (err.message || err)));
      return false;
    }
  }

  /* 画一组反应的主视觉。ctx: { color, color2, radius, playerPos } */
  function play(key, e, ctx) {
    const c = ctx || {};
    _counts[key] = (_counts[key] || 0) + 1;
    const fn = DRAW[key];
    if (!fn) { _errors.push('unknown reaction: ' + key); return false; }
    const pos = c.pos || (e && e.pos) || { x: 0, y: 0, z: 0 };
    const p = V(pos.x, 0.2, pos.z);
    try {
      const parts = fn(p, c);
      if (!parts) return false;            /* FXK 没加载 / 被关掉：不画也不报错 */
      _draws[key] = (_draws[key] || 0) + 1;
      _lastDraw[key] = {
        parts: parts.slice(),
        x: Math.round((p.x || 0) * 100) / 100,
        z: Math.round((p.z || 0) * 100) / 100
      };
      return true;
    } catch (err) {
      _errors.push(key + ': ' + (err && (err.message || err)));
      return false;
    }
  }

  function reset() {
    for (const k in _counts) delete _counts[k];
    for (const k in _draws) delete _draws[k];
    for (const k in _links) delete _links[k];
    for (const k in _lastDraw) delete _lastDraw[k];
    _errors.length = 0;
  }

  function stats() {
    return {
      recipes: Object.keys(DRAW),
      counts: Object.assign({}, _counts),
      draws: Object.assign({}, _draws),
      links: Object.assign({}, _links),
      lastDraw: JSON.parse(JSON.stringify(_lastDraw)),
      errors: _errors.slice()
    };
  }

  return {
    play, link, reset, stats,
    recipes: DRAW
  };
})();
