'use strict';
/* ============================================================
 * BossTwist —— 「每只首领自己的四拍」的变形层
 * ------------------------------------------------------------
 * 数据在 `src/data/data-bosstwist.js`（BOSS_TWIST），这里只做三件事：
 *
 *   1. **播报**：出招时把「这一只自己的叫法 + 它逼你做什么」送到 UI；
 *   2. **变形**：命中那一拍执行数据里写的 ops（多出来的那一层）；
 *   3. **兜底**：没写数据的首领原样不动 —— 没有这一层游戏照样能跑。
 *
 * 三条纪律（都是踩过的）：
 *
 *   - **整个文件包在 IIFE 里**。顶层 `const BFX` / `const V3` 会和
 *     boss-cast.js 的同名顶层 const 撞成 SyntaxError —— 症状是整页白屏，
 *     报错指在第二个文件上，跟真正写错的那行没关系。
 *   - **ops 只认传进来的 `e`**，不读全局 `CUR` / `BOSS`。`delay` 回来的
 *     时候 CUR 可能已经切到另一只怪身上（两只同时放招），读全局就会
 *     把伤害算到别人头上。延时里要用到的位置一律**放招那一刻**取好。
 *   - **一次施法一个 token**（`e._castTok`）。延时回调先比 token：
 *     换图 / 重新出招之后，上一发没跑完的回调必须自己退场，
 *     否则会在新坐标上继续炸。
 * ============================================================ */
var BossTwist = (function () {

  const T = (typeof FX2 !== 'undefined' && FX2.tools) ? FX2.tools : {};
  const V3 = T.V3 || function (x, y, z) { return new THREE.Vector3(x, y, z); };
  /* 定时一律走 fx2 的**按帧**定时器，不用 setTimeout：
   * 切图要能把没跑完的那一发取消掉，setTimeout 取消不了 ——
   * 回城之后它会在新图坐标上继续炸一次。没有它就整层不工作，别拿
   * 「立即执行」兜底，那等于让所有延时变形在放招瞬间全部炸出来。 */
  const delay = (typeof T.delay === 'function') ? T.delay : null;
  const BFX = (typeof FX2 !== 'undefined') ? FX2 : null;

  /* 十六进制颜色 → Domains 要的 CSS 串（它按 parseInt(hex,16) 解，给数字会错色） */
  function hexc(n) {
    const v = (typeof n === 'number' && n >= 0) ? n : 0xff8a4c;
    return '#' + v.toString(16).padStart(6, '0');
  }

  function G() { return (typeof Game !== 'undefined') ? Game : null; }

  function playerPos() {
    const g = G();
    const pg = g && g.playerGroup;
    return pg ? pg.position : { x: 0, z: 0 };
  }

  /* 这一次施法还算不算数 */
  function alive(c) {
    return !!(c && c.e && !c.e.dead && c.e._castTok === c.tk);
  }

  /* 伤害落点：只有一个口 —— 和画出来的圈用同一个半径 */
  function hurt(c, mul, x, z, r) {
    const g = G();
    if (!g || typeof g.damagePlayer !== 'function') return false;
    const p = playerPos();
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r) return false;
    try { g.damagePlayer((c.e.dmg || 1) * mul, c.e); } catch (err) { /* 玩家已倒地 */ }
    return true;
  }

  /* 取一个点：'boss' 首领脚下 / 'player' 玩家脚下 / 默认 = 这一招的判定中心 */
  function at(c, which) {
    const e = c.e, hit = c.at;
    if (which === 'boss' && e && e.pos) return { x: e.pos.x, z: e.pos.z };
    if (which === 'player') { const p = playerPos(); return { x: p.x, z: p.z }; }
    if (hit && hit.x != null && hit.z != null) return { x: hit.x, z: hit.z };
    if (which === 'boss' && e && e.pos) return { x: e.pos.x, z: e.pos.z };
    const p = playerPos();
    return { x: p.x, z: p.z };
  }

  /* ---------------- ops ----------------
   * 每个 op 都对应**一种不同的应对**。加新 op 前先问：
   * 「它逼玩家做的动作，和现有这几种不一样吗？」一样就别加。 */
  const OPS = {

    /* 留一块持续区域（毒 / 减速 / 拖拽 / 攻速）。走 `Domains` 而不是自己
     * 每帧判 —— 那边已经处理了 ttl 按帧递减、主人死了跟着散、换图清场。 */
    domain(c) {
      if (typeof Domains === 'undefined' || !Domains.add) return;
      const p = c.p, pt = at(c, p.at);
      Domains.add({
        preset: p.preset || 'poison',
        x: pt.x, z: pt.z,
        r: p.r || 3, ttl: p.ttl || 5,
        owner: c.e,
        color: p.color || hexc(c.tw.c),
        name: (c.tw.n || '') + '·' + (p.preset || 'domain')
      });
    },

    /* 一次性拖拽：把人往首领那边拽一段。冲刺能挣脱（`dragPlayer` 本来就这样）。 */
    pull(c) {
      const g = G();
      if (!g || typeof g.dragPlayer !== 'function') return;
      const e = c.e, p = playerPos();
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const f = Math.min(0.85, Math.max(0.1, c.p.frac != null ? c.p.frac : 0.5));
      const tx = p.x + dx * f, tz = p.z + dz * f;
      g.dragPlayer(tx, tz, c.p.dur || 0.5);
      /* 拉的时候得有一条看得见的线，否则玩家只感到「位置突然变了」 */
      if (BFX && BFX.beam) {
        BFX.beam({
          a: () => ({ x: c.e.pos.x, z: c.e.pos.z }),
          b: () => ({ x: playerPos().x, z: playerPos().z }),
          color: c.tw.c, w: 0.26, life: c.p.dur || 0.5, y: 0.9
        });
      }
    },

    /* 落点外圈长刺：**内圈安全**。和 primary hit（通常是圆）互补 ——
     * 站在圆心不吃这一层，贴着边走就吃。 */
    spikes(c) {
      if (!BFX || !BFX.spikes) return;
      const p = c.p, pt = at(c, p.at || 'hit');
      const r = p.r || 4;
      BFX.spikes({
        x: pt.x, z: pt.z, r: r * 1.06, n: p.n || 8, h: 1.9,
        color: 0x2a241f, glow: c.tw.c, dur: 1.6
      });
      const pl = playerPos();
      const d = Math.hypot(pl.x - pt.x, pl.z - pt.z);
      if (d > r * 0.55 && d <= r * 1.25) hurt(c, p.mul || 0.6, pt.x, pt.z, r * 1.3);
    },

    /* 追着炸：**每一发都读实时位置**。站着不动必中，一直跑能甩掉。 */
    volley(c) {
      if (!BFX || !BFX.zone) return;
      const p = c.p, n = p.n || 2, r = p.r || 2;
      let i = 0;
      const fire = () => {
        if (!alive(c)) return;
        const pl = playerPos();
        const x = pl.x + (Math.random() - .5) * 0.9;
        const z = pl.z + (Math.random() - .5) * 0.9;
        BFX.zone({ shape: 'circle', x: x, z: z, r: r, dur: 0.44, color: c.tw.c });
        delay(0.46, () => {
          if (!alive(c)) return;
          BFX.shock(V3(x, 0, z), r * 1.3, { color: c.tw.c, dur: .4, a0: .85 });
          hurt(c, p.mul || 0.45, x, z, r);
        });
        if (++i < n) delay(p.gap || 0.4, fire);
      };
      fire();
    },

    /* 同点再炸：**位置不变**。躲开第一下之后别急着回到原位。 */
    echo(c) {
      if (!BFX || !BFX.shock) return;
      const p = c.p, pt = at(c, 'hit');
      const r = p.r || (c.at && c.at.r ? c.at.r : 3);
      for (let i = 1; i <= (p.n || 1); i++) {
        delay((p.gap || 0.45) * i, () => {
          if (!alive(c)) return;
          BFX.zone({ shape: 'circle', x: pt.x, z: pt.z, r: r, dur: 0.44, color: c.tw.c });
          delay(0.46, () => {
            if (!alive(c)) return;
            BFX.shock(V3(pt.x, 0, pt.z), r * 1.2, { color: c.tw.c, dur: .5, a0: .9 });
            hurt(c, p.mul || 0.5, pt.x, pt.z, r);
          });
        });
      }
    },

    /* 锁在脚下：标记落在**你此刻站的地方**，倒计时到就炸。
     * 它的意思不是「跑远」，是「马上就得动」。 */
    mark(c) {
      if (!BFX || !BFX.zone) return;
      const p = c.p, pl = playerPos();
      const x = pl.x, z = pl.z, r = p.r || 2, dur = p.dur || 1.1;
      BFX.zone({ shape: 'circle', x: x, z: z, r: r, dur: dur, color: c.tw.c });
      delay(dur, () => {
        if (!alive(c)) return;
        BFX.shock(V3(x, 0, z), r * 1.4, { color: c.tw.c, dur: .4, a0: .9 });
        hurt(c, p.mul || 0.8, x, z, r);
      });
    },

    /* 正面格挡：打正面几乎不掉血，**绕背**才正常。
     * 用完必须摘掉 —— 不摘的话这只怪从此永久免疫正面，整场变成绕圈。 */
    guard(c) {
      const g = G();
      if (!g || typeof g.setGuardFront !== 'function') return;
      const p = c.p, e = c.e;
      g.setGuardFront(e, {
        arc: p.arc || 120,
        mul: p.mul != null ? p.mul : 0.2,
        turn: p.turn || 1.2
      });
      delay(p.dur || 4, () => {
        if (!e || e.dead) return;
        try { g.setGuardFront(e, null); } catch (err) { /* 换图了 */ }
      });
    }
  };

  /* ---------------- 播报 ---------------- */
  function banner(e, sk, slot) {
    if (typeof UI === 'undefined' || !UI || typeof UI.castBanner !== 'function') return;
    const native = !!(sk && sk.native);
    let info;
    if (slot) info = { n: slot.n || sk.name, a: slot.a || '', native: false };
    else if (native) info = { n: sk.name, a: sk.answer || '', native: true };
    else info = { n: sk.name || '？', a: '', native: false };
    info.boss = (e.cfg && e.cfg.name) || '';
    try { UI.castBanner(info); } catch (err) { /* UI 不在也不影响出招 */ }
  }

  return {
    /* 由 boss-cast.js 的 tryCast 在 run() 之后同步调一次。
     * 这里出错绝不能让「这一招」跟着失败 —— 每一段都自己兜住。 */
    apply(e, sk, id) {
      if (!e || !sk) return;
      const bank = (typeof BOSS_TWIST !== 'undefined') ? BOSS_TWIST : null;
      const tw = bank && e.cfg ? bank[e.cfg.id] : null;
      const slot = (tw && tw.s && tw.s[id]) ? tw.s[id] : null;

      e._castTok = (e._castTok || 0) + 1;

      banner(e, sk, slot);
      if (!slot || !slot.ops || !slot.ops.length) return;
      if (typeof delay !== 'function') return;

      /* 判定中心在**放招这一刻**取：此后玩家会动，但预警圈不会跟着动。 */
      let hit = null;
      try { hit = (typeof sk.hit === 'function') ? sk.hit() : null; } catch (err) { hit = null; }

      const ph = (e.phase || 0) + 1;
      const warm = (sk.warm != null ? sk.warm : 0.7) * (ph >= 2 ? 0.85 : 1);
      const c = { e: e, sk: sk, at: hit, tw: tw, tk: e._castTok, p: null };

      delay(warm, () => {
        if (!alive(c)) return;
        for (let i = 0; i < slot.ops.length; i++) {
          const row = slot.ops[i];
          const fn = OPS[row[0]];
          if (!fn) { console.warn('[BossTwist] 没这个 op：' + row[0]); continue; }
          c.p = row[1] || {};
          try { fn(c); } catch (err) { console.warn('[BossTwist] ' + row[0] + ' 失败', err); }
        }
      });
    },

    /* 调试 / 探针：这一只这一格会变成什么 */
    peek(bossId, id) {
      const bank = (typeof BOSS_TWIST !== 'undefined') ? BOSS_TWIST : null;
      const tw = bank && bank[bossId];
      return (tw && tw.s && tw.s[id]) ? tw.s[id] : null;
    },
    OPS: OPS
  };
})();

if (typeof window !== 'undefined') window.BossTwist = BossTwist;
