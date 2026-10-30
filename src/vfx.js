/* ============================================================
 * 特效解释器（V0 · 配方 DSL v2 的执行端）
 *
 *   data-vfx.js（形 + 色，纯数据） → 本文件（时，播放）
 *
 * 只有这一处认识「配方里的 `t` 到底是什么」。技能代码永远只说
 * `VFX.playFor('whirl', { pos, dir })`，不再各自 new 一堆环和粒子 ——
 * 以前那种写法改一次手感要翻 15 个 case，还必然漏几个。
 *
 * ---------------- 三条纪律（和 fx-kit 同源，这里再钉一遍） ----------------
 * 1. **只读坐标**：`ctx.pos` / `ctx.dir` 只读不写。特效层改位置 = 判定和画面对不上。
 * 2. **不碰伤害**：这里没有 `dmg` 这个词。要伤害去 game.js。
 * 3. **全屏闪白禁止**：`flash` 的半径一律夹在 `ctx.radius` 内（§5 明写）。
 *    暗色国风场景里全屏闪一次会让玩家眨眼，而且和受伤红晕的 `#vignette` 打架。
 *
 * ---------------- 为什么 `play` 不做成动画状态机 ----------------
 * 三段式的「时」其实只有两个时间点：现在（cast / loop 的第一拍）和
 * `delay` 之后（impact）。真做成逐帧状态机，就得每帧判一次「这一拍播过没有」，
 * 而特效本来就是一次性的 —— 用定时器反而更准，也更好在探针里量。
 * 唯一的代价是定时器要能被换图作废，所以统一记 `gen`（见 `_later`）。
 * ============================================================ */
'use strict';

const _vfxV = new THREE.Vector3();
const _vfxV2 = new THREE.Vector3();

const VFX = {
  /* 播放账：探针用它验「这一发到底发了几条指令」 */
  played: 0,
  unknown: [],       // 不认识的指令（打错字 / 配方没跟上），只记不炸
  lastBudget: null,

  /* 把「方向关键字」翻成向量。**不返回新对象**，写进调用方给的复用向量里 ——
   * 每发技能都 new 一个 Vector3 在连招里就是每秒几十次分配。 */
  _dirOf(name, ctx, out) {
    switch (name) {
      case 'up': out.set(0, 1, 0); break;
      case 'down': out.set(0, -1, 0); break;
      case 'fwd': {
        const d = ctx.dir;
        if (d) out.set(d.x, 0, d.z);
        else out.set(0, 0, 1);
        if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
        out.normalize();
        break;
      }
      case 'out': out.set(1, 0, 0); break;   // 各向同性，交给 spr 自己散
      default: out.set(0, 0, 0);
    }
    return out;
  },

  /* 主入口：播一条已经染好色的配方 */
  play(recipe, ctx) {
    if (!recipe || !ctx || !ctx.pos) return 0;
    const c = this._ctx(ctx);
    let n = 0;
    for (const op of (recipe.cast || [])) n += this._op(op, c) ? 1 : 0;
    for (const op of (recipe.loop || [])) n += this._op(op, c) ? 1 : 0;
    /* 命中段延后：`delay` 是「起手 → 命中」的那段前摇（陨石 0.9 秒是真的
     * 从天上掉下来，不能和起手同一帧出） */
    const delay = ctx.delay === undefined ? 0 : ctx.delay;
    const impact = recipe.impact || [];
    if (impact.length) {
      if (delay > 0) {
        this._later(() => {
          for (const op of impact) this._op(op, c);
        }, delay * 1000);
      } else {
        for (const op of impact) n += this._op(op, c) ? 1 : 0;
      }
    }
    this.played += n;
    this.lastBudget = (typeof vfxBudget === 'function') ? vfxBudget(recipe) : null;
    return n;
  },

  /* 按技能 id 播：自动取「这一发是几级、什么元素」，调用方只给位置和朝向。
   * `Game.skillLevel` 是**有效等级**（含装备词缀）—— 台阶 patch 认它，
   * 和 P2b/P2c 的口径一致：玩家堆出来的 9 级也该看到 9 级的特效。 */
  playFor(id, ctx) {
    if (typeof vfxRecipe !== 'function') return 0;
    const lv = (typeof Game !== 'undefined' && Game && typeof Game.skillLevel === 'function')
      ? Game.skillLevel(id) : 1;
    const recipe = vfxRecipe(id, lv);
    if (!recipe) return 0;
    /* 元素：技能本体 > 注入 > 物理。**注入不改剪影只换色**（§3），
     * 所以这里只换 elem，不动 recipe 的 cast/loop/impact。 */
    let elem = recipe.elem;
    if (elem === 'elem') {
      const sk = (typeof SKILLS !== 'undefined') ? SKILLS[id] : null;
      elem = (sk && sk.elem) || 'phys';
      if (typeof Game !== 'undefined' && Game && Game._elem && Game._elem.main) elem = Game._elem.main;
    }
    const tinted = vfxTint(recipe, elem);
    return this.play(tinted, ctx);
  },

  /* ctx 归一化：半径 / 颜色 / 贴图 / 残留 一次算清，后面每个指令直接用 */
  _ctx(ctx) {
    const r = Number(ctx.radius);
    const radius = (isFinite(r) && r > 0) ? r : 3;
    const p = ctx.profile || (typeof ELEM_PROFILE === 'object' ? ELEM_PROFILE[ctx.elem] : null) || ELEM_PROFILE.phys;
    return {
      pos: ctx.pos,
      aim: ctx.aim || ctx.pos,
      dir: ctx.dir || null,
      radius: radius,
      color: ctx.color === undefined ? p.color : ctx.color,
      tex: ctx.tex || p.tex,
      decal: ctx.decal === undefined ? p.decal : ctx.decal,
      profile: p,
      gen: (typeof Game !== 'undefined' && Game) ? Game.mapGen : 0
    };
  },

  /* 换图就作废的定时器：不加这个，陨石的命中段会在换图后砸到新地图上 */
  _later(fn, ms) {
    const gen = (typeof Game !== 'undefined' && Game) ? Game.mapGen : 0;
    setTimeout(() => {
      const now = (typeof Game !== 'undefined' && Game) ? Game.mapGen : 0;
      if (now !== gen) return;
      try { fn(); } catch (e) { /* 特效不该把主循环带崩 */ }
    }, ms);
  },

  /* ============================================================
   * 指令分发：一条 op → 一次原语调用
   * 返回 true = 认识并播了；false = 不认识（记进 unknown，不抛错）
   * ============================================================ */
  _op(op, c) {
    if (!op || !op.t) return false;
    const R = c.radius;
    const p = c.profile;
    const k = (op.r === undefined ? 1 : op.r) * R;   // 半径倍率 → 米
    switch (op.t) {
      /* ---------- 纯原语 ---------- */
      case 'spr': {
        const dir = this._dirOf(op.dir, c, _vfxV).clone();
        return !!FXK.spr(c.pos, {
          n: op.n || 10,
          tex: op.tex || c.tex,
          color: op.color === undefined ? c.color : op.color,
          size: (op.size || p.size) * (0.8 + R * 0.06),
          life: op.dur || 0.6,
          speed: op.speed === undefined ? Math.max(1.2, R * 1.1) : op.speed,
          spread: op.spread === undefined ? Math.max(0.2, R * 0.12) : op.spread * R * 0.3,
          dir: (op.dir === 'out' || !op.dir) ? null : dir,
          up: op.up === undefined ? p.up : op.up,
          grav: op.grav === undefined ? p.grav : op.grav,
          drag: p.drag,
          y: op.h === undefined ? c.pos.y : c.pos.y + op.h * 0.3,
          additive: op.additive
        });
      }
      case 'shock':
        return !!FXK.shock(c.aim, Math.max(0.5, k), {
          color: op.color === undefined ? c.color : op.color,
          dust: op.dust === undefined ? 1 : op.dust
        });
      case 'decal': {
        if (!c.decal && !op.tex) return false;
        const tex = op.tex || c.decal;
        const color = op.color === undefined ? this._decalColor(c) : op.color;
        const size = Math.max(1, k * 1.6);
        const life = op.dur || 4;
        /* `line > 1` = 沿施法方向横向排开几块（火墙留下的焦带是**一条**，
         * 不是脚下一块圆斑）。排布口径与 cone 的 `line` 一致，改一处两边都动。 */
        const rows = Math.max(1, op.line || 1);
        if (rows === 1) return !!FXK.decal(c.aim, { tex, color, size, life });
        const dir = this._dirOf('fwd', c, _vfxV).clone();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        for (let row = 0; row < rows; row++) {
          const off = (row - (rows - 1) / 2) * R * 0.95;
          FXK.decal(new THREE.Vector3(c.aim.x + perp.x * off, c.aim.y, c.aim.z + perp.z * off),
            { tex, color, size, life });
        }
        return true;
      }
      case 'bolt': {
        /* `r === 0` 表示「从天上打到落点」（符箓 / 落雷的默认形态）；
         * 给了 r 就是从落点旁边再分一道 —— 分叉的视觉 */
        const from = _vfxV2.set(c.aim.x + (op.r ? k * 0.6 : 0), c.aim.y + 4.5, c.aim.z);
        return !!FXK.bolt(from, c.aim, {
          color: op.color === undefined ? c.color : op.color,
          depth: 4, life: 0.18
        });
      }
      case 'trail': {
        /* 绕身的椭圆轨道：12 个点连成一条带子。y 给一点起伏，
         * 平铺在地面上读起来会像「一圈光圈」而不是「剑轨」 */
        const pts = [];
        const n = op.n || 12;
        const h = (op.h === undefined ? 1.2 : op.h);
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          pts.push(new THREE.Vector3(
            c.pos.x + Math.cos(a) * k,
            c.pos.y + h + Math.sin(a * 2) * 0.15,
            c.pos.z + Math.sin(a) * k * 0.72
          ));
        }
        return !!FXK.trail(pts, {
          color: op.color === undefined ? c.color : op.color,
          width: Math.max(0.25, R * 0.1),
          life: op.dur || 0.4
        });
      }
      case 'ring':
        FX.ring(c.pos, Math.max(0.6, k), op.color === undefined ? c.color : op.color,
          op.dur || 0.45, 0.16);
        return true;
      case 'flash':
        /* **半径必须夹在技能半径内**：这是 §5 那条「禁止全屏白闪」的落地。
         * 谁想画一个半径 30 的白闪，到这儿会被夹回 R*1.2。 */
        FX.flashCircle(c.aim, Math.min(Math.max(0.4, k), R * 1.2),
          op.color === undefined ? c.color : op.color, op.dur || 0.12);
        return true;
      case 'beam': {
        const a = new THREE.Vector3(c.aim.x, c.aim.y + (op.h || 12), c.aim.z);
        FX.beam(a, c.aim, op.color === undefined ? c.color : op.color, op.dur || 0.6,
          Math.max(0.6, R * 0.25));
        return true;
      }

      /* ---------- 复合（几个原语拼一个语义） ---------- */
      case 'arc': {
        /* 立体刀光：n 道斜着的月牙，绕身一圈等分。倾斜靠 FX.slash 的 arc 参数，
         * 不自己做几何 —— 那个扇面几何是缓存的，这里 new 一份就白缓存了 */
        const n = Math.max(1, op.n || 1);
        const tilt = op.tilt || 0.35;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + (c.dir ? Math.atan2(c.dir.x, c.dir.z) : 0);
          FX.slash(c.pos, ang, op.color === undefined ? c.color : op.color,
            Math.max(1, k), Math.PI * tilt * 2);
        }
        return true;
      }
      case 'vortex': {
        /* 螺旋上升：**每圈一簇**（不是每颗一簇）。
         * 「转」是靠多层同心环 + 高度差读出来的，而环内粒子由 `ring` 开关
         * 等分到圆周上、给切向初速 —— 一个 Points 就是一圈，2 圈 = 2 次绘制。
         * 早期版本是每颗粒子各调一次 spr，3 圈 × 8 颗 = 24 次绘制，
         * 单技能直接把预算打穿（实测 whirl 14 次）。 */
        const turns = op.helix || 1;
        for (let t = 0; t < turns; t++) {
          const rr = k * (0.75 + t * 0.18);
          FXK.spr(new THREE.Vector3(c.pos.x, c.pos.y + 0.2 + t * 0.5, c.pos.z), {
            n: op.n || 8, tex: c.tex, color: c.color, size: p.size * 0.9,
            life: op.dur || 0.6, speed: 1.6, grav: -3.2, drag: 0.8,
            up: 1.6 + t * 0.5, spread: 0.08, additive: true,
            ring: rr, phase: t * 0.6
          });
        }
        return true;
      }
      case 'cone': {
        /* 扇形喷射：沿 dir 铺开，`line` 表示「铺几排」——
         * 火墙就是 4 排沿一条线排开的竖直火舌，不是一朵火。
         * 每排一簇（`ring` 关掉、用大 spread 沿横向摊开），4 排 = 4 次绘制。 */
        const dir = this._dirOf('fwd', c, _vfxV).clone();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const rows = Math.max(1, op.line || 1);
        const n = op.n || 10;
        for (let row = 0; row < rows; row++) {
          const off = (row - (rows - 1) / 2) * R * 0.95;
          FXK.spr(new THREE.Vector3(c.aim.x + perp.x * off, c.aim.y + 0.1, c.aim.z + perp.z * off), {
            n: n, tex: c.tex, color: c.color,
            size: (op.size || p.size) * 1.1,
            life: op.dur || 0.5,
            speed: 0.6, spread: R * 0.3,
            up: (op.h || 1.4) * 0.9, grav: -2.2, drag: 1.1,
            additive: true
          });
        }
        return true;
      }
      case 'geyser': {
        /* 地面喷发柱：往上（或往下）的粒子柱 + 底部一圈小冲击。
         * `shock:false` 让调用方跳过那圈冲击 —— 已经带了 `shock` 指令的技能
         * 再加一圈就是白花 3 次绘制（shock 自己就是环 + 气浪 + 尘三件套）。 */
        const dir = this._dirOf(op.dir || 'up', c, _vfxV).clone();
        FXK.spr(c.aim, {
          n: op.n || 14, tex: c.tex, color: c.color,
          size: (op.size || p.size) * 1.2,
          life: op.dur || 0.6,
          speed: Math.max(2, R * 1.4),
          spread: op.spread === undefined ? R * 0.18 : op.spread * R,
          dir: dir, up: 0, grav: dir.y > 0 ? -1.2 : 6, drag: 0.9,
          additive: true
        });
        if (op.shock !== false) {
          FXK.shock(c.aim, Math.max(0.4, R * 0.35), { color: c.color, dust: 0.6 });
        }
        return true;
      }
      default:
        if (this.unknown.indexOf(op.t) < 0) this.unknown.push(op.t);
        return false;
    }
  },

  /* 残留贴花的颜色：贴图是白色的 alpha 形状，颜色得由元素给。
   * 焦痕 / 裂痕要压暗（不然是「地上多了一块亮斑」），霜 / 酸斑要淡。 */
  _decalColor(c) {
    const p = c.profile;
    if (!p) return 0x2a1a10;
    if (c.decal === 'scorch' || c.decal === 'crack') {
      _vfxV.set(0, 0, 0);
      const col = new THREE.Color(p.color);
      /* 压到 18% 亮度：焦痕是「被打过的痕迹」，不是发光体 */
      col.multiplyScalar(0.18);
      return col.getHex();
    }
    return p.color;
  },

  reset() {
    this.played = 0;
    this.unknown.length = 0;
    this.lastBudget = null;
  }
};
