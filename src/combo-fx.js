/* ============================================================
 * [U3 / V5] 组合特效层 —— 技能之间互相给对方上视觉
 *
 * 本文件是**源码**，不是生成物（对比 sfx.js / fx2.js / data-bosskits.js）。
 * 试验台 docs/vfx-playground.html 的 comboApply / COMBOS 落在被 build-skillvfx.js
 * 明确排除的 §11 演示外壳里，状态口径也和游戏对不上（5 层刃势 / 8s 法相 /
 * 全局毒窗）；这里按游戏真实状态重写，只画、不改数值。
 *
 * 挂点（src/game.js）：
 *   · ComboFX.onCast(id, ctx)  castSkill 尾部 —— 2 条连携 + 聚怪开窗
 *   · ComboFX.onHit(e, ctx)    damageEnemy 命中口 —— 4 组技能内组合 + 符毒绿符钉
 *   · ComboFX.reset()          换图 —— 清窗口与 ICD
 *
 * 三条铁律：
 *   1. 只读坐标与状态，绝不写 e.pos / dmg / 敌人状态字段（PLAN §14）。
 *   2. 延时二段走 VFX._later（自带 Game.mapGen 换图作废），不用裸 setTimeout。
 *   3. 低画质降级由 FXK 原语内部读 FX.q，这里不抄第二份倍率。
 *
 * 「画了什么」由 stats().lastDraw[key].parts 记录 —— 探针逐条判，不靠肉眼。
 * ============================================================ */
const ComboFX = (function () {
  'use strict';

  const ICD_GLOBAL = 500;      /* 每种组合的全局最小间隔 */
  const ICD_TARGET = 2000;     /* 同一目标上同组合的最小间隔 */
  const GATHER_WINDOW = 2000;  /* 聚怪 → 范围技窗口 */

  const HIT_KEYS = ['freeze', 'burn', 'exec', 'gather', 'poisonpin'];
  const CAST_KEYS = ['giant', 'palm'];

  const _last = Object.create(null);      /* key → 上次触发时刻（全局 ICD） */
  let _tmap = new WeakMap();              /* e → { key: 时刻 }（同目标 ICD） */
  const _counts = Object.create(null);    /* key → 命中规则次数 */
  const _draws = Object.create(null);     /* key → 真的画了几次 */
  const _laters = Object.create(null);    /* key → 二段演出执行了几次 */
  const _lastDraw = Object.create(null);  /* key → 最后一次的原语清单与坐标 */
  const _errors = [];
  const _gather = { until: -1e9, id: '' };
  let _clock = () => (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();

  function V(x, y, z) {
    return new THREE.Vector3(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  }
  function posOf(e) {
    const p = (e && e.pos) || {};
    return V(p.x, 0.75, p.z);
  }
  function yawOf(c) {
    const d = c && c.dir;
    return d ? Math.atan2(Number(d.x) || 0, Number(d.z) || 0) : 0;
  }
  /* 带毒：蚀骨层数 / 毒雾印记 / 中毒计时 / 毒 dot 任一成立。
   * 试验台用一个全局 poisonUntil，游戏里毒是**目标身上**的状态。 */
  function poisoned(e) {
    return Number(e.venomT) > 0 || Number(e.poisonT) > 0 ||
      e.dotElem === 'poison' || Number(e.poisonN) > 0;
  }
  function fxk() {
    return (typeof FXK !== 'undefined' && FXK && FXK.enabled) ? FXK : null;
  }
  function later(key, fn, ms) {
    const run = () => {
      _laters[key] = (_laters[key] || 0) + 1;
      try { fn(); } catch (err) { _errors.push(key + '/later: ' + (err && (err.message || err))); }
    };
    if (typeof VFX !== 'undefined' && VFX && typeof VFX._later === 'function') VFX._later(run, ms);
    else { try { run(); } catch (err) { _errors.push(key + '/later: ' + (err && (err.message || err))); } }
  }
  const mark = (parts, name) => { parts.push(name); };

  /* ---------------- 7 套视觉（全部一次性，无常驻 mesh / updater） ----------------
   * 巨刀 / 符钉在试验台靠实验室私有 billMesh + addUpdate 逐帧驱动，游戏侧没有
   * 等价公开原语；这里用 FXK.trail（竖直带 = 立起来的刀）与 FXK.spr（speed:0
   * 悬浮的 rune = 插着的符钉）复刻语义，不新建材质、不进主循环。 */
  const DRAW = {
    freeze(p) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      K.spr(V(p.x, 0.7, p.z), { n: 34, tex: 'shard', color: 0x9ae8ff, size: 0.38,
        life: 0.7, speed: 4.2, grav: 2.2, up: 0.4, additive: true });
      mark(parts, 'spr:shard');
      K.decal(p, { tex: 'frost', color: 0x9ae8ff, size: 2.2, life: 1.4 });
      mark(parts, 'decal:frost');
      K.shock(p, 1.6, { color: 0xdff4ff });
      mark(parts, 'shock');
      return parts;
    },
    burn(p) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      /* 绿焰包着橙芯，两层都往上卷（grav 负值 = 上飘，见 FXK.spr 注释） */
      K.spr(V(p.x, 0.5, p.z), { n: 18, tex: 'ember', color: 0x7fdd6a, size: 0.5,
        life: 0.85, speed: 1.4, grav: -1.6, up: 1.2, additive: true });
      K.spr(V(p.x, 0.6, p.z), { n: 14, tex: 'ember', color: 0xff9a3a, size: 0.34,
        life: 0.7, speed: 1.1, grav: -2.0, up: 1.4, additive: true });
      mark(parts, 'spr:ember×2');
      K.decal(p, { tex: 'acid', color: 0x5aa83a, size: 2.0, life: 1.6 });
      mark(parts, 'decal:acid');
      return parts;
    },
    exec(p) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      K.decal(p, { tex: 'crack', color: 0x8a2418, size: 1.8, life: 1.2, opacity: 0.9 });
      mark(parts, 'decal:crack');
      /* 只闪目标：一大颗短命 soft，不画全屏闪白 */
      K.spr(V(p.x, 1.1, p.z), { n: 10, tex: 'soft', color: 0xff3b30, size: 1.0,
        life: 0.18, speed: 0.2, additive: true });
      mark(parts, 'spr:soft:target-only');
      K.spr(V(p.x, 0.9, p.z), { n: 8, tex: 'slash', color: 0xff6a4a, size: 0.55,
        life: 0.3, speed: 2.4 });
      mark(parts, 'spr:slash');
      return parts;
    },
    gather(p) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      /* 向心吸入：四个外圈点各朝圆心喷一簇，dir 是 FXK.spr 的主方向 */
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const from = V(p.x + Math.cos(a) * 3, 0.6, p.z + Math.sin(a) * 3);
        const dir = V(-Math.cos(a), 0, -Math.sin(a));
        K.spr(from, { n: 6, tex: 'dust', color: 0xd8c090, size: 0.4,
          life: 0.5, speed: 5.5, dir, spread: 0.12 });
      }
      mark(parts, 'spr:inward×4');
      later('gather', () => {
        K.shock(p, 3.6, { color: 0xffd080 });
        K.spr(V(p.x, 0.5, p.z), { n: 24, tex: 'dust', color: 0xffd080,
          size: 0.45, life: 0.6, speed: 5 });
      }, 550);
      mark(parts, 'later:shock+spr');
      return parts;
    },
    giant(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const yaw = yawOf(c);
      const x = (p.x || 0) + Math.sin(yaw) * 2.4;
      const z = (p.z || 0) + Math.cos(yaw) * 2.4;
      /* 4 道刀纹合成一柄立起来的巨刀：一条从上劈到地的竖直宽带。
       * 台阶 Lv5「断岳斩」已有自己那道刀气，这里只补「虚影」，不再造第二个落地环。 */
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        pts.push(V(x, 5.2 - k * 4.7, z));
      }
      K.trail(pts, { color: 0xfff0c0, width: 1.15, life: 0.5, additive: true, taper: true });
      mark(parts, 'trail:vertical-blade');
      const at = V(x, 0.12, z);
      later('giant', () => {
        K.decal(at, { tex: 'crack', color: 0x2a1e14, size: 4.2, life: 2 });
        K.shock(at, 4.6, { color: 0xfff0c0 });
        K.spr(at, { n: 30, tex: 'shard', color: 0xfff0c0, size: 0.4, life: 0.6, speed: 5 });
      }, 240);
      mark(parts, 'later:shock+crack+shard');
      return parts;
    },
    palm(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      const yaw = yawOf(c);
      /* 起点在**背后**：从正面飞就成了「自己施法」，画不出「法相在帮你施法」 */
      const from = V((p.x || 0) - Math.sin(yaw) * 0.9, 1.7, (p.z || 0) - Math.cos(yaw) * 0.9);
      const a = c.aim || p;
      const to = V(a.x, 0.9, a.z);
      const col = c.color || 0x9ad8ff;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        pts.push(V(from.x + (to.x - from.x) * k,
          1.7 + Math.sin(k * Math.PI) * 0.9,
          from.z + (to.z - from.z) * k));
      }
      K.trail(pts, { color: col, width: 0.18, life: 0.45, additive: true, taper: false });
      mark(parts, 'trail:palm-arc');
      later('palm', () => {
        K.spr(to, { n: 10, tex: 'spark', color: col, size: 0.22, life: 0.4, speed: 3, additive: true });
      }, 380);
      mark(parts, 'later:spr:spark');
      return parts;
    },
    poisonpin(p, c) {
      const K = fxk(); if (!K) return null;
      const parts = [];
      /* 绿烟：符纸烧尽那一下必须绿，橙烟会被读成「纸烧着了」 */
      K.spr(V(p.x, 0.6, p.z), { n: 16, tex: 'smoke', color: 0x7fe0a0, size: 0.36,
        life: 0.7, speed: 3.6, up: 0.9, grav: -0.5, additive: false });
      mark(parts, 'spr:smoke');
      /* 蚀骨层数 = 绿色符钉数量（POISON_RULES 上限 5）；speed:0 / grav:0 = 插着不动 */
      const n = Math.max(1, Math.min(5, Number(c.stacks) || 1));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        K.spr(V(p.x + Math.cos(a) * 0.55, 0.95, p.z + Math.sin(a) * 0.55),
          { n: 1, tex: 'rune', color: 0x7fe0a0, size: 0.30, life: 2.6,
            speed: 0, grav: 0, additive: false });
      }
      mark(parts, 'spr:rune×' + n);
      K.decal(p, { tex: 'acid', color: 0x4faa62, size: 1.6, life: 2 });
      mark(parts, 'decal:acid');
      return parts;
    }
  };

  /* ---------------- 规则表：test 只判据，draw 只画 ---------------- */
  const RULES = {
    freeze: {
      name: '冻结 → 碎裂', lane: 'hit',
      test(e, c) { return Number(e.slow) >= 1 && Number(e.slowT) > 0 && c.elem === 'phys'; }
    },
    burn: {
      name: '中毒 → 焚毒', lane: 'hit',
      test(e, c) { return poisoned(e) && c.elem === 'fire'; }
    },
    exec: {
      name: '破甲 → 处决', lane: 'hit',
      test(e, c) {
        const mx = Number(e.hpMax || e.maxHp || 0);
        return Number(e.shredT) > 0 && Number(e.shred) > 0 && mx > 0 && Number(e.hp) <= mx * 0.3;
      }
    },
    gather: {
      name: '聚怪 → 塌陷冲击', lane: 'hit',
      test(e, c) {
        const who = c.id || c.tag || '';
        return _clock() < _gather.until && !!who && who !== _gather.id;
      }
    },
    poisonpin: {
      name: '符毒 · 绿符钉', lane: 'hit',
      /* 道士符箓全是 sigil；延迟命中的投射物 _castSkill 已清空，故也认 tag */
      test(e, c) {
        return poisoned(e) && (c.elem === 'sigil' ||
          /talisman/i.test((c.id || '') + ' ' + (c.tag || '')));
      }
    },
    giant: {
      name: '刃势满层 · 巨刀虚影', lane: 'cast',
      /* edgeFull 由 castSkill 在 case 'avatar' 清 mask **之前**算好传进来 */
      test(c) { return c.edgeFull === true; }
    },
    palm: {
      name: '法相 · 手掌光点', lane: 'cast',
      test(c) {
        const slot = Number(c.slot) || 0;
        return c.cls === 'mage' && slot >= 1 && slot <= 3 && c.auraOn === true;
      }
    }
  };

  function _allow(key, e) {
    const t = _clock();
    if (t - (_last[key] || -1e9) < ICD_GLOBAL) return false;
    if (e && typeof e === 'object') {
      let m = _tmap.get(e);
      if (!m) { m = Object.create(null); _tmap.set(e, m); }
      if (t - (m[key] || -1e9) < ICD_TARGET) return false;
      m[key] = t;
    }
    _last[key] = t;
    return true;
  }

  function _fire(key, p, c) {
    _counts[key] = (_counts[key] || 0) + 1;
    try {
      const parts = DRAW[key](p, c || {});
      if (!parts) return false;             /* FXK 没加载 / 被关掉：不画也不报错 */
      _draws[key] = (_draws[key] || 0) + 1;
      _lastDraw[key] = {
        parts: parts.slice(),
        x: Math.round((p.x || 0) * 100) / 100,
        z: Math.round((p.z || 0) * 100) / 100,
        at: _clock(),
        ctx: { elem: c.elem || '', id: c.id || '', stacks: Number(c.stacks) || 0 }
      };
      return true;
    } catch (err) {
      _errors.push(key + ': ' + (err && (err.message || err)));
      return false;
    }
  }

  /* 施法口：2 条连携 + 聚怪开窗 */
  function onCast(id, ctx) {
    const c = ctx || {};
    const G = (typeof Game !== 'undefined' && Game) ? Game : null;
    const cls = c.cls || (G && G.state && G.state.cls) || '';
    const slot = c.slot != null ? Number(c.slot)
      : (typeof skillArchSlotOf === 'function' ? skillArchSlotOf(cls, id) : 0);
    const auraOn = c.auraOn != null ? !!c.auraOn : !!(G && G.elemAuraOn && G.elemAuraOn());
    const edgeFull = c.edgeFull != null ? !!c.edgeFull
      : !!(G && G.bladeFinisherOn && G.bladeFinisherOn() && G.bladeEdge && G.bladeEdgeMax &&
        G.bladeEdge() >= G.bladeEdgeMax());
    const pp = c.pos || (G && G.playerGroup && G.playerGroup.position) || null;
    const cc = Object.assign({}, c, {
      id, cls, slot, auraOn, edgeFull, pos: pp,
      aim: c.aim || pp, dir: c.dir || (G && G.lastMoveDir) || null
    });

    if (c.gather) { _gather.until = _clock() + GATHER_WINDOW; _gather.id = id; }

    const p = pp ? V(pp.x, 0, pp.z) : V(0, 0, 0);
    let n = 0;
    for (const k of CAST_KEYS) {
      if (!RULES[k].test(cc)) continue;
      if (!_allow(k, null)) continue;
      if (_fire(k, p, cc)) n++;
    }
    return n;
  }

  /* 命中口：4 组技能内组合 + 符毒绿符钉 */
  function onHit(e, ctx) {
    if (!e || e.dead) return 0;
    const c = ctx || {};
    /* dot 每跳 / 反应追加伤害都会进 damageEnemy，不过滤会变成常驻烟花 */
    if (c.silent || c.react) return 0;
    const cc = Object.assign({}, c, {
      stacks: Math.max(1, Math.min(5, Number(e.poisonN) || 1))
    });
    const p = posOf(e);
    let n = 0;
    for (const k of HIT_KEYS) {
      if (!RULES[k].test(e, cc)) continue;
      if (!_allow(k, e)) continue;
      if (_fire(k, p, cc)) {
        n++;
        if (k === 'gather') _gather.until = -1e9;   /* 一次性窗口，放了就收 */
      }
    }
    return n;
  }

  /* 换图：窗口与 ICD 一起作废，别把「上一张图的聚怪」带进村里 */
  function reset() {
    _gather.until = -1e9;
    _gather.id = '';
    for (const k in _last) delete _last[k];
    _tmap = new WeakMap();
  }

  function stats() {
    return {
      rules: Object.keys(RULES),
      hitKeys: HIT_KEYS.slice(), castKeys: CAST_KEYS.slice(),
      counts: Object.assign({}, _counts),
      draws: Object.assign({}, _draws),
      laters: Object.assign({}, _laters),
      lastDraw: JSON.parse(JSON.stringify(_lastDraw)),
      errors: _errors.slice(),
      gather: { until: _gather.until, id: _gather.id },
      icd: { global: ICD_GLOBAL, target: ICD_TARGET }
    };
  }

  /* 探针用：注入时钟 + 清空记账，逐条隔离，不被 ICD 串扰 */
  function setClock(fn) {
    _clock = typeof fn === 'function' ? fn
      : () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function clearStats() {
    for (const k in _counts) delete _counts[k];
    for (const k in _draws) delete _draws[k];
    for (const k in _laters) delete _laters[k];
    for (const k in _lastDraw) delete _lastDraw[k];
    for (const k in _last) delete _last[k];
    _errors.length = 0;
    _tmap = new WeakMap();
    reset();
  }

  return {
    onCast, onHit, reset, stats, setClock, clearStats,
    rules: RULES, fire: _fire,
    get ICD() { return { global: ICD_GLOBAL, target: ICD_TARGET }; }
  };
})();
