/* ============================================================
 * 技能树 · 分支行为层（P2 · 第一批）
 *
 * 为什么单独一个文件：
 *   分支的效果分两种。mods 是旧的六通道（dmg/cd/cost/radius/count/dur），
 *   castSkill 早就认了；beh 是「行为级改写」—— 减速、流血、位移、回资源……
 *   老代码不认识。把这些 handler 全塞进 game.js 会让那个 6000 行的文件
 *   再长一截，而且 dev-v3 还在同文件里改怪物 AI，合并时必撞。
 *   所以行为层独立成文件，用 Object.assign(Game, {...}) 挂回同一个对象，
 *   game.js 里只留两个调用点（合 mods、结算后跑一次 beh）。
 *
 * 相位（phase）：
 *   hit   给本次技能打到的敌人挂状态 / 追加伤害
 *   self  给玩家上临时增益
 *   eco   资源与消耗（回怒气、扣血）
 *
 * 判定口径：以技能落点为圆心、半径吃 srad 加成。这是一个近似 ——
 * 投射物真正命中谁要到飞行时才知道，但整个行为层只用这一套近似，
 * 玩家不会感到「同一发技能两套算法」。
 *
 * 加一个新行为 = 往 SKILL_BEH 里加一行。没登记过的键会被
 * skillBranchPendingBeh() 报出来，UI 上显示「待接」且不许投点，
 * 不会出现「点了分支但什么都没发生」。
 * ============================================================ */

/* 行为表：键 → { ph 相位, label 中文名, run(ctx, 值, 整份 beh) }
 * ctx 见 makeBehCtx()。 */
const SKILL_BEH = {
  /* ---------------- hit：状态类 ---------------- */
  slow: { ph: 'hit', label: '减速', run(c, v, b) {
    const p = Math.min(0.7, v / 100), d = behDur(b, 3);
    for (const e of c.hits()) {
      e.slow = Math.max(e.slow || 0, p);
      e.slowT = Math.max(e.slowT || 0, d);
      e.slowLabel = '冰缓';
    }
    c.GFX.flashCircle(c.center, c.rad, 0x8ad8ff, 0.28);
  } },

  /* 冰缓：减速幅度固定 25%，但额外给冰霜标签（装备词缀按标签吃） */
  chill: { ph: 'hit', label: '冰缓', run(c, v, b) {
    const d = behDur(b, 3);
    for (const e of c.hits()) {
      e.slow = Math.max(e.slow || 0, 0.25);
      e.slowT = Math.max(e.slowT || 0, d);
      e.slowLabel = '冰缓';
    }
    c.GFX.flashCircle(c.center, c.rad, 0x9ae8ff, 0.3);
  } },

  freeze: { ph: 'hit', label: '冻结', run(c, v, b) {
    const d = behDur(b, 1.2);
    for (const e of c.hits()) {
      const t = e.boss ? Math.min(0.4, d) : d;
      e.stun = Math.max(e.stun || 0, t);
      e.slow = 1; e.slowT = Math.max(e.slowT || 0, t);
      e.slowLabel = '冻结';
      c.GFX.burst(new THREE.Vector3(e.pos.x, 1, e.pos.z), 0x9ae8ff, 8,
        { speed: 3, size: 0.1, life: 0.5, additive: true });
    }
    c.GFX.flashCircle(c.center, c.rad, 0x9ae8ff, 0.34);
  } },

  stun: { ph: 'hit', label: '眩晕', run(c, v, b) {
    const d = behDur(b, v);
    for (const e of c.hits()) {
      e.stun = Math.max(e.stun || 0, e.boss ? Math.min(0.35, d) : d);
      c.GFX.burst(new THREE.Vector3(e.pos.x, 1.4, e.pos.z), 0xffe066, 6,
        { speed: 4, size: 0.08, life: 0.35, additive: true });
    }
  } },

  /* 易伤：目标受到的所有伤害 +N%。真正的结算在 damageEnemy 里 */
  vuln: { ph: 'hit', label: '易伤', run(c, v, b) {
    const d = behDur(b, 4);
    for (const e of c.hits()) {
      e.vuln = Math.max(e.vuln || 0, v);
      e.vulnT = Math.max(e.vulnT || 0, d);
    }
    c.GFX.text(new THREE.Vector3(c.center.x, 2.4, c.center.z), '易伤 ' + v + '%', 'info', { life: 0.8 });
  } },

  /* 破甲：目标护甲 −N%（上限 80%），结算同样在 damageEnemy */
  shredArmor: { ph: 'hit', label: '破甲', run(c, v, b) {
    const d = behDur(b, 5), cap = b.shredMax || 80;
    for (const e of c.hits()) {
      e.shred = Math.min(cap, Math.max(e.shred || 0, v));
      e.shredT = Math.max(e.shredT || 0, d);
    }
    c.GFX.text(new THREE.Vector3(c.center.x, 2.4, c.center.z), '破甲 ' + v + '%', 'info', { life: 0.8 });
  } },

  shred: { ph: 'hit', label: '破甲', run(c, v, b) {
    SKILL_BEH.shredArmor.run(c, v, b);
  } },

  antiHeal: { ph: 'hit', label: '禁疗', run(c, v, b) {
    const d = behDur(b, 3);
    for (const e of c.hits()) e.antiHealT = Math.max(e.antiHealT || 0, d);
    c.GFX.text(new THREE.Vector3(c.center.x, 2.4, c.center.z), '禁疗', 'info', { life: 0.8 });
  } },

  /* ---------------- hit：位移类 ---------------- */
  knock: { ph: 'hit', label: '击退', run(c, v) {
    for (const e of c.hits()) {
      if (e.boss) continue;
      const dx = e.pos.x - c.center.x, dz = e.pos.z - c.center.z;
      const d = Math.hypot(dx, dz) || 1;
      e.pos.x += dx / d * v; e.pos.z += dz / d * v;
    }
    c.GFX.ring(c.center, Math.max(1.6, c.rad * 0.8), 0xffb070, 0.3, 0.2);
  } },

  pull: { ph: 'hit', label: '牵引', run(c, v) {
    for (const e of c.hits()) {
      if (e.boss) continue;
      const dx = c.center.x - e.pos.x, dz = c.center.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d, v);
      e.pos.x += dx / d * step; e.pos.z += dz / d * step;
      e.stun = Math.max(e.stun || 0, 0.25);
    }
    c.GFX.ring(c.center, Math.max(1.6, c.rad * 0.8), 0xc8a060, 0.35, 0.25);
  } },

  /* 聚怪（变体专用）：把 N 码内的敌人周期性拉向自己。
   * 与 pull 的区别：pull 是「这一发把命中的敌人拽 v 码」，
   * gather 是「一段时间里每 0.5 秒把范围内所有人往中心收」——
   * 前者是一次位移，后者是控场。首领免疫位移。 */
  gather: { ph: 'hit', label: '聚怪', run(c, v, b) {
    const rad = Math.max(1, v || 4);
    const every = Math.max(0.2, b.gatherEvery || 0.5);
    const dur = Math.max(0, b.gatherDur || 0);
    const G = c.G;
    const pullOne = () => {
      if (!G.playerGroup) return;
      const pp = G.playerGroup.position;
      for (const e of G.enemies) {
        if (!e || e.dead || e.boss) continue;
        const d = DIST2D(e.pos, pp);
        if (d > rad || d < 1.1) continue;
        const step = Math.min(rad * 0.3, d - 1);
        e.pos.x += (pp.x - e.pos.x) / d * step;
        e.pos.z += (pp.z - e.pos.z) / d * step;
      }
      c.GFX.ring(new THREE.Vector3(pp.x, 0, pp.z), rad, 0xc8a060, 0.3, 0.2);
    };
    pullOne();
    if (dur > 0) {
      const n = Math.max(1, Math.round(dur / every));
      for (let i = 1; i <= n; i++) c.later(i * every * 1000, pullOne);
      c.GFX.area(c.center, rad, 0xc8a060, dur, { opacity: 0.1 });
    }
  } },

  gatherDur: { ph: 'hit', label: '聚怪时长', run() { /* 由 gather 一并消费 */ } },
  gatherEvery: { ph: 'hit', label: '聚怪间隔', run() { /* 由 gather 一并消费 */ } },

  /* 移动施放（变体专用）：旋风斩的「疾风」。
   * 这个引擎没有施法锁定 —— 站着放和跑着放本来没区别，所以 move 不能
   * 做成「解除锁定」，那是一枚空键，玩家会当它没用。这里的口径是换打法：
   *   一发 → 一段。主伤害照旧结算，之后 moveDur 秒内每 moveEvery 秒
   *   绕「当前的自己」补一次 movePct% 伤害，期间自由移动
   *   （代价移速 −20%，由同一条数据里的 moveSpd 消费）。
   * 用 c.later 而不是 c.tick：tick 是 1 秒一跳，这里要 0.5 秒。
   * 每一跳现取玩家位置 —— 跟着人走才叫移动施放，钉在原点就成了区域技。 */
  move: { ph: 'self', label: '移动施放', run(c, v, b) {
    if (!v || !c.G.playerGroup) return;
    const every = Math.max(0.2, b.moveEvery || 0.5);
    const dur = Math.max(0, b.moveDur || 2);
    const pct = Math.max(0, b.movePct || 35) / 100;
    const rad = Math.max(1.4, c.rad);
    const spin = () => {
      const pp = c.G.playerGroup.position;
      for (const e of c.G.enemies) {
        if (!e || e.dead) continue;
        if (DIST2D(e.pos, pp) > rad + (e.radius || 0)) continue;
        /* 不击退：转起来把怪推开，跟「边跑边转」的玩法互相打架 */
        c.strike(e, pct, { knock: 0 });
      }
      c.GFX.ring(new THREE.Vector3(pp.x, 0, pp.z), rad, 0xffd8a0, 0.25, 0.16);
    };
    const n = Math.max(1, Math.round(dur / every));
    for (let i = 1; i <= n; i++) c.later(i * every * 1000, spin);
  } },

  moveDur: { ph: 'self', label: '旋转时长', run() { /* 由 move 一并消费 */ } },
  moveEvery: { ph: 'self', label: '旋转间隔', run() { /* 由 move 一并消费 */ } },
  movePct: { ph: 'self', label: '旋转伤害', run() { /* 由 move 一并消费 */ } },

  /* ---------------- P3 变体族 1：多段 / 环绕 / 雷印 ---------------- */

  /* 多段（变体专用）：这套引擎的「三段」不做伪动画，而是**真的再放两次**。
   * 数据里配着 dmg −55/−60 这种修正，所以每段确实是 40~45% 伤害。
   * 冷却与资源都还原 —— 段数是打法，不是白拿三倍资源。
   * `_rep` 是重入闩：补的那几发同样会走 applySkillBeh，不闩住会指数递归。 */
  repeat: { ph: 'self', label: '多段', run(c, v) {
    const n = Math.max(1, Math.round(v || 2));
    const G = c.G;
    if (n < 2 || G._rep) return;
    G._rep = true;
    for (let i = 1; i < n; i++) {
      c.later(i * 180, () => {
        const cd = G.cooldowns[c.id], mp = G.state.mp;
        G.cooldowns[c.id] = 0;
        try { G.castSkill(c.id); } catch (e) { }
        G.cooldowns[c.id] = cd;
        G.state.mp = mp;
      });
    }
    c.later(n * 180 + 80, () => { G._rep = false; });
  } },

  /* 落地雷印（变体专用）：先落一个印记，N 秒后炸。
   * 「引雷」跟「余震」的区别：余震是技能自己附带的第二段，
   * 雷印是**延迟到几乎忘了**的第三次结算，逼玩家算提前量。 */
  mine: { ph: 'hit', label: '雷印', run(c, v, b) {
    const sec = Math.max(0.5, v || 2);
    const pct = Math.max(0, (b && b.minePct) || 100) / 100;
    const at = c.center.clone();
    const r = Math.max(1.8, c.rad * 0.8);
    c.GFX.area(at, r, 0xffcc66, sec, { opacity: 0.12 });
    c.later(sec * 1000, () => {
      c.G.explodeAt(at, r, (c.base || 0) * pct, 0xffcc66, false, false, c.G._tag || 'aoe');
      c.GFX.ring(at, r, 0xffcc66, 0.45, 0.22);
    });
  } },
  minePct: { ph: 'hit', label: '雷印伤害', run() { /* 由 mine 一并消费 */ } },

  /* 环绕剑阵（变体专用）：N 秒里每 0.5 秒绕「当前的自己」打一圈。
   * 跟 move（旋风斩疾风）同一套跟人逻辑，区别是这里**没有主伤害**，
   * 全部输出都在这 10 跳里，所以单跳只给 22%。 */
  orbit: { ph: 'self', label: '环绕', run(c, v) {
    const dur = Math.max(1, v || 5);
    const G = c.G;
    const every = 0.5, n = Math.round(dur / every);
    const rad = Math.max(2.2, c.rad * 0.9);
    for (let i = 1; i <= n; i++) {
      c.later(i * every * 1000, () => {
        if (!G.playerGroup) return;
        const pp = G.playerGroup.position;
        for (const e of G.enemies) {
          if (!e || e.dead) continue;
          if (DIST2D(e.pos, pp) > rad + (e.radius || 0)) continue;
          c.strike(e, 0.22, { knock: 0 });
        }
        c.GFX.ring(new THREE.Vector3(pp.x, 0, pp.z), rad, 0xbcd8ff, 0.25, 0.14);
      });
    }
  } },

  /* 冲撞（变体专用）：盾墙期间把贴身的东西撞开。
   * 每 0.4 秒扫一次，不做「真的碰撞体」——这个引擎没有刚体，
   * 周期性推开在观感上和撞飞一样，还不会把敌人卡进墙里。 */
  bash: { ph: 'self', label: '冲撞', run(c, v, b) {
    const G = c.G;
    const dur = behDur(b, 4);
    const n = Math.round(dur / 0.4);
    for (let i = 1; i <= n; i++) {
      c.later(i * 400, () => {
        if (!G.playerGroup) return;
        const pp = G.playerGroup.position;
        let hit = 0;
        for (const e of G.enemies) {
          if (!e || e.dead || e.boss) continue;
          const d = DIST2D(e.pos, pp);
          if (d > 2.6 + (e.radius || 0) || d < 0.05) continue;
          const k = Math.min(4, 2.6 - d + 1.8);
          e.pos.x += (e.pos.x - pp.x) / d * k;
          e.pos.z += (e.pos.z - pp.z) / d * k;
          e.stun = Math.max(e.stun || 0, 0.35);
          hit++;
        }
        if (hit) c.GFX.ring(new THREE.Vector3(pp.x, 0, pp.z), 2.6, 0x9ad8ff, 0.22, 0.14);
      });
    }
  } },

  /* ---------------- P3 变体族 2：自身状态改写 ---------------- */

  /* 冰封自身（变体专用）：把「护盾」换成「无敌但动不了」。
   * 走 invuln + 移速 −100，比新写一套冻结状态机安全 —— 冻结是给怪用的，
   * 套到玩家身上会和受击 / 被控 / 死亡三处判断打架。 */
  freezeSelf: { ph: 'self', label: '冰封自身', run(c, v) {
    const sec = Math.max(0.3, v || 1.5);
    const G = c.G;
    G.invuln = Math.max(G.invuln || 0, sec);
    c.buff('冰封', { moveSpd: -100 }, 0x9ae0ff, { dur: sec });
    if (G.playerGroup) c.GFX.ring(G.playerGroup.position, 2.2, 0x9ae0ff, 0.5, 0.3);
  } },

  /* 定身（变体专用）：盾墙「不动」—— 护盾翻倍的代价是钉在原地。
   * 用移速 −100 而不是新加 rooted 标记：移动结算只有一处乘区，改那里风险最小。 */
  root: { ph: 'self', label: '定身', run(c, v, b) {
    if (!v) return;
    c.buff('定身', { moveSpd: -100 }, 0xff8866, b);
  } },

  /* 冷却缩减（变体专用）：挂在增益本体上，由 skillCd 的 st.cdr 乘区消费 */
  cdr: { ph: 'self', label: '冷却缩减', run(c, v, b) {
    c.buff('灵台', { cdr: v }, 0x9ad8ff, b);
  } },

  /* 结束扣血（变体专用）：剑神「献祭」—— 天下没有白拿的伤害。
   * 至少留 1 点：这玩意儿不该直接把人打死（复活 / 还魂各有自己的触发条件）。 */
  endHpCost: { ph: 'self', label: '结束扣血', run(c, v, b) {
    const pct = Math.max(0, v || 0) / 100;
    if (!pct) return;
    const dur = behDur(b, 8);
    c.later(dur * 1000, () => {
      const s = c.G.state;
      if (!s || c.G.dead) return;
      const loss = Math.round(s.stats.hpMax * pct);
      s.hp = Math.max(1, s.hp - loss);
      c.GFX.text(new THREE.Vector3(c.G.playerGroup.position.x, 2.6, c.G.playerGroup.position.z),
        '献祭 −' + loss, 'bad', { life: 0.9 });
    });
  } },

  /* 复活后增幅 / 之后反噬（变体专用）：先给 8 秒 +60%，到点换成 5 秒 −20%。
   * 两段分开写在数据里（afterBuff / afterDebuff），时间写死在 handler —— 
   * 它是「还魂逆命」这一条的节奏，不是一个可调参数。 */
  afterBuff: { ph: 'self', label: '之后增幅', run(c, v, b) {
    const pct = v || 0;
    if (!pct) return;
    const dur = behDur(b, 8);
    c.buff('逆命', { dmgAll: pct }, 0xffd166, { dur: dur });
    const deb = b && b.afterDebuff;
    if (deb) {
      c.later(dur * 1000, () => {
        c.buff('逆命·反噬', { dmgAll: -Math.abs(deb) }, 0x8899aa, { dur: 5 });
      });
    }
  } },
  afterDebuff: { ph: 'self', label: '之后削弱', run() { /* 由 afterBuff 一并消费 */ } },

  /* [P2b] 命中点火海（台阶专用）：在**命中点**留一片火，而不是在「落点」。
   * 火球是 dir 施法，落点恒在射程尽头（16 码），行为层那套「以落点为圆心」
   * 的近似对它等于永远打空 —— 所以这一条由 fireball case 的 onHit 消费。 */
  firePatch: { ph: 'hook', label: '命中火海', run() { /* 由 fireball case 的 onHit 消费 */ } },

  /* [P2b] 台阶落点领域（法师 ② 的 Lv9 / Lv10）：技能落点留一块持续掉血的地。
   * 值 = **每跳伤害占攻击力 %**，时长默认 4 秒，`tierFieldDur` 可拉到 8 秒。
   * 四只技能（炎爆 / 雷罚 / 暴雪 / 陨星天火）共用，颜色按元素走。
   * 不复用 firePatch：那个写死火焰色 + 0.45 倍（火球的 Lv5），
   * 而这里要跟元素上色、且伤害占比是台阶自己的数。 */
  tierField: { ph: 'hook', label: '落点领域（台阶）', run() { /* 由四只技能的 case 消费 */ } },
  tierFieldDur: { ph: 'hook', label: '落点领域时长（台阶）', run() { /* 同上 */ } },

  /* [P2b] 回怒倍率（台阶专用）：whirl case 那一发固定回 8 点，这里给倍数。
   * 不复用 ragePerHit —— 那是「每命中一个 +N」，两套口径叠在一起会重复计。 */
  rageMul: { ph: 'hit', label: '回怒倍率', run() { /* 由 whirl case 消费 */ } },

  /* [P2b] 自动索敌（台阶专用）：不瞄准也能打。
   * castSkill 在 resolveCast 之后消费：值 = 搜索半径，范围内找最近的敌人
   * 把 aim 挪过去。放在 castSkill 而不是 handler 里，是因为落点必须在
   * 进入 switch 之前定死（各技能 case 都读 aim），handler 阶段已经晚了。 */
  autoTarget: { ph: 'hook', label: '自动索敌', run() { /* 由 castSkill 消费 */ } },

  /* [P2b] 命中点连锁（台阶专用）：符箓这类**飞出去再炸**的技能，连锁必须从
   * 落雷点起跳。走 hit 通道会在施法那一瞬间就结算 —— 符还在飞、闪电先到了，
   * 画面上是「凭空劈了三下」，而且伤害还吃不到「符打中了谁」。
   * 所以做成 hook：由 talisman case 的 onHit 消费，值 = 跳几个目标。 */
  chainHit: { ph: 'hook', label: '命中连锁', run() { /* 由 talisman case 的 onHit 消费 */ } },

  /* [P2b] 命中点符阵（台阶专用）：同上，阵落在落雷点而不是准星。
   * 由 talisman case 调 Game.createSigilField 铺，值 = 持续秒数。 */
  zoneHit: { ph: 'hook', label: '命中符阵', run() { /* 由 talisman case 消费 */ } },

  /* [P2b] 命中后改追（台阶专用）：符咒打完一个目标自动锁下一个，
   * 最多改追 N 次（proj.seekUsed 计数，防止无限连）。
   * 为什么不复用 autoTarget：那个改的是「出手时瞄谁」，这个是「打完还追谁」。 */
  seek: { ph: 'hook', label: '命中追击', run() { /* 由 talisman case 消费 */ } },

  /* 落点改自身：在 castSkill 里、switch 之前就消费掉了（`aim = pp`），
   * 这里只做登记 —— 技能 case 不用各自判断 */
  selfCast: { ph: 'self', label: '自身施法', run() { /* 由 castSkill 消费 */ } },

  /* 跟随 / 钉阵：区域类技能在自己的 case 里自查 bBeh.follow / bBeh.pin，
   * 把「判定锚点 + 特效网格」交给 Game.attachFollow / 或改用落点。
   * 为什么不在 handler 里统一做：每个技能的伤害循环读的是自己那个局部变量
   * （c / segs / pp2），外面拿不到，硬挪只会变成「特效动了、判定没动」。 */
  follow: { ph: 'self', label: '区域跟随', run() { /* 由各技能 case 消费 */ } },
  pin: { ph: 'self', label: '钉阵', run() { /* 由剑阵 case 消费 */ } },

  /* [P2b] 剑阵三条进化台阶（刀客 ③）：全部登记成 hook，由 swordarray case
   * 铺一份 Game.swordField（阵心 / 半径 / 剩余时间），damagePlayer 消费。
   * 为什么不在 handler 里直接改敌人：
   *   slowField 是「每跳刷新一次」的持续场，不是施法瞬间的一次性减速 ——
   *   走 hit 通道只会在施法那一瞬间给一次，600ms 后就没了；
   *   arrayGuard / arrayCounter 的触发点在**玩家挨打**上，跟施法完全无关。
   * 值 = 百分比：slowField 是减速幅度，arrayGuard 是阵内减伤，
   * arrayCounter 是反击的攻击力百分比；slowFieldDur = 减速残留秒数。 */
  /* 持续场减速：由**领域类技能自己的每一跳**消费（剑阵 case / 毒雾 case），
   * 不是施法瞬间的一次性 slow —— 领域会活好几秒，怪随时可能走进来。 */
  slowField: { ph: 'hook', label: '场内减速', run() { /* 由 swordarray / poison case 消费 */ } },
  slowFieldDur: { ph: 'hook', label: '减速残留', run() { /* 由 slowField 一并消费 */ } },
  arrayGuard: { ph: 'hook', label: '阵内减伤', run() { /* 由 damagePlayer 消费 */ } },
  arrayCounter: { ph: 'hook', label: '阵内反击', run() { /* 由 damagePlayer 消费 */ } },

  /* 击杀类变体：两者都由 onBehKill 钩子消费（噬魂回血 / 燎原尸体再爆） */
  killHeal: { ph: 'self', label: '击杀回血', run() { /* 由 onBehKill 消费 */ } },
  corpseBlast: { ph: 'self', label: '尸体爆炸', run() { /* 由 onBehKill 消费 */ } },



  /* 破甲上限：与 shredArmor 一并消费，单独出现没有意义 */
  shredMax: { ph: 'hit', label: '破甲上限', run() { } },

  /* 减速时长：与 slow / chill 一并消费 */
  slowDur: { ph: 'hit', label: '减速时长', run() { } },

  /* 余震伤害：与 aftershock 一并消费 */
  aftershockPct: { ph: 'hit', label: '余震伤害', run() { } },

  /* [P2b] 余震钉人（台阶 Lv5）：与 aftershock 一并消费。
   * 精研「余震」3 级就自动给了，所以台阶不能也写「地裂持续 2 秒」——
   * 那是玩家早就有的东西，写了等于没写。台阶给的是「余震也能控」。 */
  aftershockStun: { ph: 'hit', label: '余震眩晕', run() { } },

  /* [P2b] 命中连锁 / 命中符阵 / 命中追击 的数值参数：
   * 与 chainHit / zoneHit / seek 一并消费，单独出现没有意义。
   * 连锁伤害**不能**复用 chainPct —— 那个 handler 一出现就会拿 aim 当圆心
   * 跑一遍通用连锁，等于把「命中点连锁」偷偷换回去了。 */
  chainHitPct: { ph: 'hit', label: '命中连锁伤害', run() { /* 由 talisman case 消费 */ } },
  zonePct: { ph: 'hit', label: '符阵伤害', run() { /* 由 talisman case 消费 */ } },
  seekPct: { ph: 'hit', label: '追击伤害', run() { /* 由 talisman case 消费 */ } },

  /* 标签：让这发技能在装备词缀眼里算某个标签（例如「算作雷系」）。
   * 目前只记录在施法上下文里，词缀系统还没按它分流；
   * 允许投点是因为这些选项本身都带着 zone / 伤害等真实效果。 */
  tagAdd: { ph: 'hit', label: '标签', run(c, v) { c.tagAdd = v; } },

  /* 持续区域：落点留一片 N 秒的伤害区，每秒 30% 伤害。
   * 数值口径与 [C1] 的 auraField 一致（40% / 秒），这里略低一点，
   * 因为它不吃「范围 +%」以外的任何加成。 */
  zone: { ph: 'hit', label: '持续区域', run(c, v) {
    const sec = Math.max(1, Math.round(v));
    c.GFX.area(c.center, c.rad, c.elemColor || 0xffd166, sec, { opacity: 0.16 });
    c.tick(sec, () => {
      c.GFX.ring(c.center, c.rad, c.elemColor || 0xffd166, 0.26, 0.16);
      for (const e of c.hits()) c.strike(e, 0.3);
    });
    c.GFX.text(new THREE.Vector3(c.center.x, 2.4, c.center.z), '领域 ' + sec + 's', 'info', { life: 0.8 });
  } },

  /* 每秒跳伤：区域持续 N 秒，每秒 v% 伤害（不写时长就按 3 秒） */
  tick: { ph: 'hit', label: '每秒伤害', run(c, v, b) {
    const sec = Math.max(1, Math.round(b.ticks || 3));
    c.tick(sec, () => {
      for (const e of c.hits()) c.strike(e, v / 100);
    });
  } },

  ticks: { ph: 'hit', label: '跳数', run() { } },

  /* 叠层：每次施放叠 1 层，每层 +v% 伤害，上限 stackMax。
   * 层数记在 this.behStack[id] 上，死亡 / 换图时随 buff 一起清空。 */
  stack: { ph: 'self', label: '叠层', run(c, v, b) {
    const max = Math.max(1, Math.round(b.stackMax || 5));
    if (!c.G.behStack) c.G.behStack = {};
    const n = Math.min(max, (c.G.behStack[c.id] || 0) + 1);
    c.G.behStack[c.id] = n;
    const key = 'beh:stack:' + c.id;
    const cur = c.G.buffs.find(x => x.key === key);
    const stats = { dmgAll: v * n, dur: 8 };
    if (cur) { Object.assign(cur, { stats, dur: 8 }); c.G.recalc(); }
    else c.G.addBuff('战意 ×' + n, stats, 0xffd166, { key });
    if (n >= max) {
      c.GFX.text(new THREE.Vector3(c.G.playerGroup.position.x, 2.9, c.G.playerGroup.position.z),
        '满层 ' + max, 'info', { life: 0.9 });
    }
  } },

  stackMax: { ph: 'self', label: '叠层上限', run() { } },

  /* 常驻光环：施放后一段时间内自身增伤（每次施放刷新） */
  aura: { ph: 'self', label: '光环', run(c, v, b) {
    c.buff('威压', { dmgAll: v }, 0xffd166, b);
  } },

  /* ---------------- hit：追加伤害类 ---------------- */
  aftershock: { ph: 'hit', label: '余震', run(c, v, b) {
    const pct = (b.aftershockPct || 30) / 100;
    const ticks = Math.max(1, Math.round(behDur(b, v)));
    /* [P2b] 台阶 Lv5「余震钉住敌人」：余震本来只掉血，现在每跳顺手钉一下。
     * 为什么做成余震的参数而不是另开一套：能钉人的机制只有一个 ——
     * e.stun。再写一套只会和怪的眩晕衰减打架。 */
    const pin = Math.max(0, b.aftershockStun || 0);
    c.tick(v, () => {
      c.GFX.ring(c.center, c.rad, 0xffb070, 0.3, 0.25);
      for (const e of c.hits()) {
        c.strike(e, pct, { knock: 0.4 });
        if (pin && !e.dead) e.stun = Math.max(e.stun || 0, e.boss ? Math.min(0.35, pin) : pin);
      }
    });
    c.GFX.text(new THREE.Vector3(c.center.x, 2.4, c.center.z),
      '余震 ' + Math.round(behDur(b, v)) + 's', 'info', { life: 0.8 });
  } },

  burnPct: { ph: 'hit', label: '灼烧', run(c, v, b) {
    const d = behDur(b, b.burnDur || 3);
    for (const e of c.hits()) c.G.applySkillDot(e, c.base * v / 100, d, 'fire', '灼烧');
    c.GFX.flashCircle(c.center, c.rad, 0xff7a30, 0.3);
  } },

  burnDur: { ph: 'hit', label: '灼烧延长', run(c, v, b) {
    for (const e of c.hits()) {
      if ((e.dotT || 0) <= 0) continue;
      e.dotT = Math.max(e.dotT, v);
      e.dotDur = e.dotT;
    }
  } },

  /* 连锁：向落点周围 N 名敌人追加 pct 伤害（不含本次已命中的那个） */
  chain: { ph: 'hit', label: '连锁', run(c, v, b) {
    const pct = (b.chainPct || 60) / 100;
    const n = Math.round(v) || 3;
    const pool = c.hits().sort((a, z) => DIST2D(a.pos, c.center) - DIST2D(z.pos, c.center));
    let hit = 0;
    for (const e of pool) {
      if (hit >= n) break;
      c.strike(e, pct);
      c.GFX.beam(new THREE.Vector3(c.center.x, 1, c.center.z),
        new THREE.Vector3(e.pos.x, 1, e.pos.z), 0x9ad0ff, 0.16, 0.3);
      hit++;
    }
  } },

  chainPct: { ph: 'hit', label: '连锁伤害', run(c, v, b) {
    SKILL_BEH.chain.run(c, b.chain || 3, { chainPct: v });
  } },

  /* 弹射：同 chain，但只跳 1 个目标，用于单体技能 */
  bounce: { ph: 'hit', label: '弹射', run(c, v, b) {
    const pct = (b.bouncePct || 50) / 100;
    const n = Math.round(v) || 1;
    const pool = c.hits().sort((a, z) => DIST2D(a.pos, c.center) - DIST2D(z.pos, c.center));
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const e = pool[i];
      c.strike(e, pct);
      c.GFX.beam(new THREE.Vector3(c.center.x, 1, c.center.z),
        new THREE.Vector3(e.pos.x, 1, e.pos.z), 0xb090ff, 0.16, 0.3);
    }
  } },

  bouncePct: { ph: 'hit', label: '弹射伤害', run(c, v, b) {
    SKILL_BEH.bounce.run(c, b.bounce || 1, { bouncePct: v });
  } },

  /* 回响：延迟 0.45 秒在原地再打一次（伤害按 pct，默认 60%） */
  echo: { ph: 'hit', label: '回响', run(c, v, b) {
    const pct = typeof v === 'number' && v > 0 && v <= 100 ? v / 100 : 0.6;
    c.later(450, () => {
      c.GFX.ring(c.center, c.rad, 0xb090ff, 0.35, 0.3);
      for (const e of c.hits()) c.strike(e, pct);
    });
  } },

  /* 余焰 / 轨迹：沿施法路径留一串火焰，每秒 pct 伤害 */
  trail: { ph: 'hit', label: '轨迹灼烧', run(c, v, b) {
    const pct = (b.trailPct || 30) / 100;
    const ticks = Math.max(1, Math.round(behDur(b, v)));
    const from = c.pp.clone();
    const to = c.aim.clone();
    const N = 4;
    const pts = [];
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t, 0, from.z + (to.z - from.z) * t));
    }
    for (const p of pts) c.GFX.area(p, 2.2, 0xff5522, ticks, { opacity: 0.16 });
    c.tick(ticks, () => {
      for (const p of pts) {
        for (const e of c.G.enemies) {
          if (e.dead || DIST2D(e.pos, p) > 2.2 + (e.radius || 0)) continue;
          const { dmg, crit } = c.G.rollDamage(c.base * pct);
          c.G.damageEnemy(e, dmg, crit, { silent: true, elem: 'fire', tag: 'dot' });
        }
      }
    });
  } },

  trailPct: { ph: 'hit', label: '轨迹伤害', run() { /* 由 trail 一并消费 */ } },

  /* ---------------- hit：条件增伤类 ---------------- */
  exec: { ph: 'hit', label: '处决', run(c, v, b) {
    const below = (b.execHp || 30) / 100;
    for (const e of c.hits()) {
      if (e.maxHp && e.hp / e.maxHp < below) c.strike(e, v / 100);
    }
  } },

  execCrit: { ph: 'hit', label: '处决暴击', run(c, v, b) {
    const below = (b.execHp || 30) / 100;
    for (const e of c.hits()) {
      if (e.maxHp && e.hp / e.maxHp < below) c.strike(e, v / 100, { forceCrit: true });
    }
  } },

  vsFrozen: { ph: 'hit', label: '对冻结增伤', run(c, v) {
    for (const e of c.hits()) {
      if ((e.slow || 0) > 0 || (e.slowT || 0) > 0) c.strike(e, v / 100);
    }
  } },

  vsBoss: { ph: 'hit', label: '对首领增伤', run(c, v) {
    for (const e of c.hits()) if (e.boss) c.strike(e, v / 100);
  } },

  /* ---------------- self：持续状态类（P3 变体） ---------------- */
  /* 不竭：本技能不再进冷却，代价是每秒持续吃资源，见底自动中断。
   * 状态挂在 G._drainOn[id] 上，由 tickBeh 每帧结算。
   * 冷却判定在 castSkill（只留 0.2 秒硬直），这里只负责开闸。 */
  cdCancel: { ph: 'self', label: '免冷却', run(c, v, b) {
    const cost = Math.max(1, b.drain || 6);
    if (!c.G._drainOn) c.G._drainOn = {};
    c.G._drainOn[c.id] = { cost: cost, acc: 0 };
    c.GFX.text(new THREE.Vector3(c.G.playerGroup.position.x, 2.9, c.G.playerGroup.position.z),
      '不竭 · 每秒 −' + cost, 'info', { life: 0.9 });
  } },

  drain: { ph: 'self', label: '持续消耗', run() { /* 由 cdCancel 一并消费 */ } },

  /* ---------------- self：临时增益 ---------------- */
  drPct: { ph: 'self', label: '减伤', run(c, v, b) {
    c.buff('减伤', { dmgReduce: v }, 0x8affb0, b);
  } },

  armorPct: { ph: 'self', label: '护甲', run(c, v, b) {
    c.buff('坚壁', { armorPct: v }, 0xc8b48a, b);
  } },

  crit: { ph: 'self', label: '暴击', run(c, v, b) {
    /* critDur 只改「锐意」的时长，不改数值 —— 狂反（反击变体）要的是
     * 「格挡后 3 秒内暴击 +30%」，不是永久 +30% */
    const bb = (b && b.critDur) ? Object.assign({}, b, { dur: b.critDur }) : b;
    c.buff('锐意', { crit: v }, 0xffd166, bb);
  } },

  critDur: { ph: 'self', label: '暴击时长', run() { /* 由 crit 一并消费 */ } },

  critDmg: { ph: 'self', label: '暴击伤害', run(c, v, b) {
    c.buff('锋锐', { critDmg: v }, 0xffb070, b);
  } },

  regen: { ph: 'self', label: '回复', run(c, v, b) {
    c.buff('回春', { hpRegen: v }, 0x8affb0, b);
  } },

  hot: { ph: 'self', label: '持续回复', run(c, v, b) {
    SKILL_BEH.hotPct.run(c, v, b);
  } },

  hotPct: { ph: 'self', label: '持续回复', run(c, v, b) {
    const pct = (typeof v === 'number' && v > 0 && v < 1) ? v : 0.02;
    c.tick(Math.max(1, Math.round(behDur(b, 6))), () => {
      c.G.healPlayer(c.G.state.stats.hpMax * pct, true);
    });
  } },

  moveSpd: { ph: 'self', label: '移速', run(c, v, b) {
    c.buff('疾行', { moveSpd: v }, 0x9ad8ff, b);
  } },

  aspd: { ph: 'self', label: '攻速', run(c, v, b) {
    c.buff('急攻', { aspd: v }, 0xffd166, b);
  } },

  noSlow: { ph: 'self', label: '免疫减速', run(c, v, b) {
    c.buff('定身', { ccResist: 100 }, 0xffe9a8, b);
  } },

  /* 无敌帧：直接抬 this.invuln（那边本来就是「无敌计时器」） */
  immune: { ph: 'self', label: '无敌', run(c, v, b) {
    const d = typeof v === 'number' && v > 0 ? v : behDur(b, 1.2);
    c.G.invuln = Math.max(c.G.invuln || 0, d);
    c.GFX.ring(c.G.playerGroup.position, 1.6, 0xffe9a8, 0.5, 0.3);
  } },

  immuneDur: { ph: 'self', label: '无敌时长', run() { /* 由 immune 一并消费 */ } },

  cleanse: { ph: 'self', label: '净化', run(c, v, b) {
    c.G.buffs = c.G.buffs.filter(x => x.type !== 'debuff');
    c.G.poisonT = 0; c.G.playerSlowT = 0; c.G.playerSlow = 0;
    c.GFX.text(new THREE.Vector3(c.G.playerGroup.position.x, 2.8, c.G.playerGroup.position.z),
      '净化', 'good', { life: 0.9 });
    if (b.cleanseHeal) c.G.healPlayer(c.G.state.stats.hpMax * b.cleanseHeal / 100, true);
  } },

  /* 反震：走 thorns（受到伤害时反弹） */
  reflect: { ph: 'self', label: '反震', run(c, v, b) {
    c.buff('反震', { thorns: v }, 0xffb070, b);
  } },

  /* ---------------- eco：资源 ---------------- */
  ragePerHit: { ph: 'eco', label: '命中回资源', run(c, v, b) {
    const n = c.touched().length;
    if (!n) return;
    const gain = v * n + (n >= 3 ? (b.rageBonus3 || 0) : 0);
    c.G.state.mp = Math.min(c.G.state.stats.mpMax, c.G.state.mp + gain);
  } },

  rageBonus3: { ph: 'eco', label: '多目标额外回资源', run() { /* 由 ragePerHit 一并消费 */ } },

  /* 生命消耗：数据里写的是「百分比」（血饲 15%、舍身 8%），
   * 一开始按绝对值扣过，结果「消耗 15% 生命」在 3000 血的档位只扣了 15 点。
   * 现在统一按最大生命的百分比算，说明页怎么写就怎么扣。 */
  hpCost: { ph: 'eco', label: '生命消耗', run(c, v) {
    const st = c.G.state.stats;
    c.G.state.hp = Math.max(1, c.G.state.hp - st.hpMax * (v / 100));
  } },

  /* ---------------- hook：由 game.js 的钩子点触发 ----------------
   * 施法瞬间的 ORDER（hit / self / eco）不会跑这一相 —— 这些效果挂在
   * 「击杀 / 暴击 / 格挡 / 破盾 / 灵兽消散 / 帧循环」上，不属于任何一发技能。
   * run() 只是占位说明；真正的结算在 Game 上的 *Beh 系列方法里
   * （见本文件底部 Object.assign(Game, {…}) 的「P2 第二批」一段）。 */
  pierce: { ph: 'hook', label: '穿透', run() {
    /* 施法时由 castSkill 消费：投射物带 pierce / 突进沿路径结算 */
  } },

  resetOnKill: { ph: 'hook', label: '击杀重置冷却', run() {
    /* 由 Game.onBehKill 消费：execute 同步击杀 → 冷却归零 */
  } },

  killExtend: { ph: 'hook', label: '击杀延长增益', run() {
    /* 由 Game.onBehKill 消费：增益期间击杀，dur 延长 */
  } },

  maxExtend: { ph: 'hook', label: '击杀延长上限', run() {
    /* 与 killExtend 一并消费（castSkill 把它折进 buff.killExtend.max） */
  } },

  /* [P2b] 击杀延长（台阶 Lv9）：**故意不复用 killExtend** —— 那条是
   * warcry 精研「战鼓」的键，而精研覆盖台阶（合并顺序），warcry 玩家会完全看不到这一级。
   * 所以另开一条通道，两条各记各的账：战鼓 +1/次 与它 +2/次 叠加。 */
  killProlong: { ph: 'hook', label: '击杀延长（台阶）', run() {
    /* 由 Game.onBehKill 消费：与 killExtend 并行，各自有自己的 got/max */
  } },

  killProlongMax: { ph: 'hook', label: '击杀延长上限（台阶）', run() {
    /* 与 killProlong 一并消费 */
  } },

  /* [P2b] 增益期间吸血（台阶 Lv5）：折进**增益本体**，不另开 buff ——
   * 另开一个 buff 时长就对不上「增益期间」（增益结束了吸血还在，或者反过来先没）。
   * warcry 自带 8%，台阶再 +10% 是叠加，三只增益都真的变强。 */
  lifesteal: { ph: 'hook', label: '增益吸血', run() {
    /* 由 castSkill 的增益 case 折进 buff.lifesteal */
  } },

  /* [P2b] 免控（台阶 Lv10）：**不是** immune（无敌帧）也不是 noSlow（只减时长）。
   * 真免控 = 增益期间根本挂不上减速 / 中毒，施法瞬间还清掉身上已有的。
   * 判定口 Game.ccImmuneNow()，施加口 Game.applyPlayerSlow / playerPoison。 */
  ccImmune: { ph: 'hook', label: '免疫控制', run() {
    /* 由 castSkill 的增益 case 标记在 buff.ccImmune 上 */
  } },

  /* [P2b] 施法瞬回（血怒位 Lv3）：值 = 最大生命的百分比。
   * 走 healPlayer —— 治疗加成 / 血条钳制 / 弹字全在那一处，别自己加 hp。 */
  healOnCast: { ph: 'hook', label: '施法瞬回', run() {
    /* 由 castSkill 的增益 case 消费 */
  } },

  /* [P2b] 增益延长（血怒位 Lv7）：与变体「持久」给 sdur 的延长**各记各的**，
   * 两条叠加。撞键的话，带持久的变体一选，这一级就没了。 */
  tierDur: { ph: 'hook', label: '增益延长（台阶）', run() {
    /* 由 castSkill 的增益 case 消费：buff.dur += tierDur */
  } },

  /* [P2b] 低血自动施放（回春位 Lv10）：值 = 生命百分比阈值。
   * 消费点在 tickBeh（帧级），**不是** autoTrigger —— 那是 revive 变体「替身」
   * 的键（致命伤时自动触发），语义是「死了才救」；这一条是「快死了先救」。 */
  lowHpCast: { ph: 'hook', label: '低血自动施放', run() {
    /* 由 tickBeh 消费：扫动作条，低于阈值的带这个键的技能替玩家放一次 */
  } },

  /* [P2b] 持续回复（回春位 Lv5）：值 = 每秒回复的最大生命百分比，共 6 跳。
   * **不复用 hotPct** —— 那是 heal 精研「余春」的键，而且它的值是「治疗量的百分比」，
   * 与本条的口径（最大生命的百分比）根本不是一个东西，硬加会算错。
   * 另开一个键，两条各按各的口径回血。 */
  tierHot: { ph: 'self', label: '持续回复（台阶）', run(c, v, b) {
    const pct = Math.max(0, Number(v) || 0) / 100;
    if (!pct) return;
    c.tick(Math.max(1, Math.round(behDur(b, 6))), () => {
      c.G.healPlayer(c.G.state.stats.hpMax * pct, true);
    });
  } },

  /* [P2b] 命中挂持续伤害（火墙位 Lv5）：值 = 每秒的攻击力百分比，共 3 秒。
   * **不复用 burnPct**：那是通用 hit 通道的键 —— 圆心是准星、元素写死火、
   * 而且只在施法瞬间给一次。这一位躺着火墙 / 冰霜新星 / 雷云三只，
   * 冰新星挂一层「灼烧」既错元素又错时机（领域类的怪是后来才走进来的）。
   * 所以由三只各自的 case 在**每一次命中**上按自己的元素调用 applySkillDot。 */
  tierDot: { ph: 'hook', label: '持续伤害（台阶）', run() {
    /* 由 firewall / frostnova / thundercloud 的 case 消费 */
  } },

  /* [P2b] 破盾 / 爆发补偿（护盾位 Lv10）：值 = 攻击力百分比。
   * 触发口有两处，但结算只有一份（`Game.behTierNova`）：
   *   · iceshield —— 护盾被打空时（onBehShieldBreak，和冰刺共用那个钩子）
   *   · pyroclasm —— 属于「爆发」侧，没有护盾可破，所以在自己的 case 里调
   * 这一位两只技能只有一只有护盾，写死成「破盾时」对焚天就是空话，
   * 所以文案与实现都按「破盾 / 爆发」两个入口来。 */
  tierNova: { ph: 'hook', label: '破盾 / 爆发定身（台阶）', run() {
    /* 由 Game.behTierNova 消费 */
  } },

  /* 落点溅射（法师 ② Lv3 台阶）：**单体**技能（天罚）的落点也打到周围一圈。
   * 同位的另外三只是范围判定，溅射就是半径变大（mods.radius），不需要这个键。
   * 由 castSkill 的 judgement 结算消费 —— 它不走通用 hit 通道（那条以准星为
   * 圆心，而天罚的落点锁在目标身上，两者恒不重合）。 */
  splash: { ph: 'hook', label: '落点溅射（台阶）', run() {
    /* 由 Game.castSkill 的 judgement case 消费 */
  } },

  detonate: { ph: 'hook', label: '引爆剩余伤害', run() {
    /* 由 Game.onBehKill 消费：带持续伤害的目标死亡时原地引爆 */
  } },

  critHeal: { ph: 'hook', label: '暴击回复', run() {
    /* 由 Game.onBehCrit 消费：增益期间暴击回血 */
  } },

  counter: { ph: 'hook', label: '格挡反击', run() {
    /* 由 Game.onBehCounter 消费：格挡后立刻回击 */
  } },

  deathHeal: { ph: 'hook', label: '灵兽护主', run() {
    /* 由 Game.onBehAllyDeath 消费：灵兽消散时回血 */
  } },

  breakNova: { ph: 'hook', label: '破盾冰刺', run() {
    /* 由 Game.onBehShieldBreak 消费：护盾被打空时向四周射冰锥 */
  } },

  autoWhirl: { ph: 'hook', label: '变身自动旋斩', run() {
    /* 由 Game.tickBeh（帧循环）消费：变身期间每 N 秒自动旋风斩 */
  } },

  /* 区域蔓延（毒雾台阶 Lv5 / 火墙共用）：**只登记一次** —— 这个文件里原来写了两遍，
     后一遍静默覆盖前一遍，等哪天给火墙写实现时会白写。两个消费者都写在这儿。 */
  grow: { ph: 'hook', label: '区域蔓延', run() {
    /* 施法时由 castSkill 消费：火墙每秒向两侧延伸 / 毒雾半径随时间长大 */
  } },

  ramp: { ph: 'hook', label: '驻留增频', run() {
    /* 施法时由 castSkill 消费：玩家停在区域里落雷变密 */
  } },

  breath: { ph: 'hook', label: '灵兽吐息', run() {
    /* 由 updateAllies 消费：灵兽每 N 秒喷吐一次范围伤害 */
  } },

  /* ============================================================
   * P3 第三批：还剩的机制族
   * ============================================================ */

  /* 时长：不是独立效果，是给同一份 beh 里其它键共用的参数（behDur 读它）。
   * 单独登记是因为数据白名单按「键」校验：带了 dur 就等于带了一个没实现的键，
   * 那会让整条变体被判成「待接」—— 明明是配好时长反而不能选。 */
  /* ---------------- AI 状态类（第三批收尾）：动怪物「接下来怎么行动」 ----------------
   * 与前面那些「挂个数字」的键不同，这三个的结算点在 game.js 的
   * updateEnemies / mobMeleeSwing / enemyRangedAttack —— 也就是怪物 AI 本身。
   * 数据里只写一个数字，真正的行为由 AI 读状态位。 */
  aspdDown: { ph: 'hit', label: '攻速压制', run(c, v, b) {
    const p = Math.min(0.6, Math.max(0, (v || 0) / 100)), d = behDur(b, 4);
    for (const e of c.hits()) {
      e.aspdMul = Math.max(e.aspdMul || 0, p);
      e.aspdT = Math.max(e.aspdT || 0, d);
    }
    c.GFX.flashCircle(c.center, c.rad, 0xffd166, 0.22);
  } },

  /* 恐惧：灵兽每次攻击 N% 概率让目标掉头逃 1 秒。
   * 是「每次攻击」不是「每次施法」，所以挂 hook —— 施法那一瞬间
   * 灵兽打的是谁还没发生，跑在这里只会变成「一施法全场恐惧」。 */
  fear: { ph: 'hook', label: '恐惧', run() { /* 由 updateAllies 的灵兽出手消费 */ } },

  /* 嘲讽：灵兽每 N 秒把周围敌人拉到自己身上一次。
   * 灵兽没有血条，所以嘲讽的真实收益是「这几秒里怪不来打你」，
   * 而不是「灵兽扛伤」—— 说成扛伤就是假机制。 */
  taunt: { ph: 'hook', label: '嘲讽', run() { /* 由 tickBeh 的灵兽节拍消费 */ } },

  dur: { ph: 'self', label: '时长', run() { /* 由 behDur(b) 读取，各 handler 自己消费 */ } },

  /* 灵兽同享：灵兽没有血条，只有「伤害 / 出手间隔 / 存在时间」三样 ——
   * 所以「加攻 / 上盾 / 回血」一律翻译成这三样，不假装它有血条。
   * v = { dmg: %, atk: %, life: 秒, drain: 流失倍率, dur: 秒 } */
  allyBuff: { ph: 'self', label: '灵兽同享', run(c, v, b) {
    if (typeof c.G.allyEmpower === 'function') c.G.allyEmpower(v || {}, b);
  } },

  /* 常驻：不用按，冷却一好就自动开一次（数值减半、持续拉满到下次冷却）。
   * 由 Game.tickBeh 每 0.4 秒扫一遍带这个键的技能 */
  passive: { ph: 'hook', label: '被动常驻', run() {
    /* 由 Game.tickPassiveSkills 消费 */
  } },

  /* 舍身：格挡照挡，但不再减伤，换成格挡后 3 秒伤害 +N%。
   * 由 damagePlayer（决定减不减半）与 onBehCounter（加伤）一起消费 */
  noDR: { ph: 'hook', label: '舍身', run() {
    /* 由 damagePlayer / onBehCounter 消费 */
  } },

  /* 连跃：让冷却只留一点点，还能再用 n 次（Game._recharge，t 秒内有效） */
  recharge: { ph: 'self', label: '连跃', run(c, v) {
    const cfg = (typeof v === 'number') ? { n: Math.max(1, v - 1), t: 3 } : (v || {});
    if (typeof c.G.setRecharge === 'function') c.G.setRecharge(c.id, cfg);
  } },

  /* 体型：召唤物放大（伤害已走 mods.dmg，这里管体型 / 出手距离 / 群攻半径） */
  size: { ph: 'self', label: '灵兽体型', run(c, v) {
    if (typeof c.G.allyGrow === 'function') c.G.allyGrow(v);
  } },

  /* 环绕形态：由 iceshard（八向环射）/ firewall（绕身火圈）的 case 读 bBeh.ring */
  ring: { ph: 'self', label: '环绕形态', run() {
    /* 由 castSkill 的 iceshard / firewall 分支消费 */
  } },

  /* 尸毒：毒雾里死掉的敌人，尸体上再留一片小毒雾（onBehKill 消费） */
  spread: { ph: 'hook', label: '尸毒扩散', run() {
    /* 由 Game.onBehKill 消费 */
  } },

  /* [P2b] 尸毒半径（台阶 Lv10）：与 spread 一并消费。
   * 尸毒这个机制本来就是**变体**给的，台阶再给一次等于「点了没反应」——
   * 所以台阶给的是更大的那片雾（4.2 码 vs 变体的 3.2），
   * 已经选了「尸毒」变体的玩家也还能拿到提升。 */
  spreadRad: { ph: 'hit', label: '尸毒半径', run() { } },

  /* [P2b] 蔓延的毒雾侧细节见上面那条唯一的 grow 登记；这里只补一句：
   * 判定半径与特效网格必须一起放大 —— 只放大特效就是「看着罩住了、伤害没到」，
   * 只放大判定就是「看不见的雾在毒人」。 */

  /* 每 N 秒冻结一次：由 blizzard 的伤害循环读，命中时顺手钉住 */
  freezeEvery: { ph: 'hook', label: '周期冻结', run() {
    /* 由 blizzard case 消费 */
  } },

  /* 区域结束爆炸：firewall 的循环收尾时炸最后一发 */
  endBurst: { ph: 'hook', label: '结束爆炸', run() {
    /* 由 firewall case 消费 */
  } },

  /* 引导：持续 N 秒、每 0.4 秒落一次（starfall / judgement 的变体形态） */
  channel: { ph: 'hook', label: '引导', run() {
    /* 由 castSkill 的 starfall / judgement 分支消费 */
  } },

  /* 箭雨：符箭改成从天砸下来，先定落点再落（talismanarrow case 消费） */
  rain: { ph: 'hook', label: '箭雨', run() {
    /* 由 talismanarrow case 消费 */
  } },

  /* 双生：另一只召唤物一起出来（Game.allyPair 消费） */
  pairTiger: { ph: 'self', label: '双生', run(c, v) {
    if (typeof c.G.allyPair === 'function') c.G.allyPair(v);
  } },

  /* 化龙：不再召唤，改自己变成龙 N 秒（Game.tickBeh 消费） */
  transform: { ph: 'hook', label: '化龙', run() {
    /* 由 Game.tickBeh 消费 */
  } },

  /* 替身：不用预先施放，吃致命伤的瞬间自动触发（damagePlayer 消费） */
  autoTrigger: { ph: 'hook', label: '致命自动触发', run() {
    /* 由 damagePlayer 消费 */
  } }
};

/* beh 里的时长约定：优先读 beh.dur，其次读处理器给的默认值 */
function behDur(b, d) {
  if (b && typeof b.dur === 'number') return b.dur;
  return d;
}

/* 一次施法的上下文。hits() 缓存一份，多个 handler 共用同一批目标。 */
function makeBehCtx(G, id, o) {
  const center = (o.sk.cast === 'self' ? o.pp : o.aim).clone();
  center.y = 0;
  const rad = Math.max(1.4, (o.sk.radius || 3) * (o.srad || 1));
  let cache = null, cache2 = null;
  const gen = G.mapGen;
  const near = e => DIST2D(e.pos, center) < rad + (e.radius || 0);
  const ctx = {
    G, GFX: (typeof FX !== 'undefined' ? FX : null), id, sk: o.sk,
    pp: o.pp, aim: o.aim, dir: o.dir, spow: o.spow || 1, srad: o.srad || 1,
    base: o.base, center, rad, dur: 0,
    /* 活着的目标：状态、追加伤害都打这些 */
    hits() {
      if (!cache) cache = G.enemies.filter(e => !e.dead && near(e));
      return cache;
    },
    /* 算「打到了几个」时用这个：刚被这发技能打死的也算命中。
     * 回流这类回资源的分支如果只数活口，一套 AoE 清场反而一点资源都回不来 ——
     * 那正是最需要回的时候。deadT 是死亡动画计时，0.35 秒内算「刚死」。 */
    touched() {
      if (!cache2) cache2 = G.enemies.filter(e => (!e.dead || (e.deadT || 0) < 0.35) && near(e));
      return cache2;
    },
    /* 追加一次技能伤害；mul 是相对 base 的倍率 */
    strike(e, mul, opts) {
      if (!e || e.dead) return;
      const { dmg, crit } = G.rollDamage(ctx.base * mul);
      G.damageEnemy(e, dmg, opts && opts.forceCrit ? true : crit,
        Object.assign({ elem: (o.sk.elem && o.sk.elem !== 'none') ? o.sk.elem : undefined }, opts || {}));
    },
    /* 延迟执行：换图 / 死亡就作废，避免「下一张图被上一张图的余震打死」 */
    later(ms, fn) {
      setTimeout(() => { if (G.mapGen === gen && !G.dead) fn(); }, ms);
    },
    /* 每秒跳一次，共 n 跳 */
    tick(n, fn) {
      for (let i = 1; i <= n; i++) ctx.later(i * 1000, fn);
    },
    buff(name, stats, color, b) {
      const dur = behDur(b, 4);
      G.addBuff(name, Object.assign({ dur }, stats), color, { key: 'beh:' + name });
    }
  };
  return ctx;
}

/* ============================================================
 * 挂在 Game 上：分支的账本 / 修正 / 行为结算
 * ============================================================ */
Object.assign(Game, {
  /* 已选的取向索引；没选或门槛不够返回 -1 */
  branchPick(id) {
    const e = this.skillState()[id];
    if (!e) return -1;
    return skillBranchPickValid(e.lv || 1, e.p) ? e.p : -1;
  },

  /* 分支一共花掉多少点（skillPoints 会减掉这一项） */
  branchSpent() {
    return skillBranchSpent(this.skillState());
  },

  /* ---------------- 变体（第三层） ----------------
   * 存档字段 e.f；老档没有 f，skillFormIdx 会回落到旧 e.v ——
   * 设计拍板「旧的变体选择原样保留成变体分支」，所以不写迁移脚本。 */
  skillForm(id) {
    return (typeof skillFormIdx === 'function') ? skillFormIdx(this.skillState(), id) : 0;
  },

  /* 这个技能是否已经整只切到新变体通道（否则仍用旧 variants） */
  hasSkillForm(id) {
    return (typeof skillFormReady === 'function') && skillFormReady(id);
  },

  /* 当前生效的变体条目；旧通道返回 null */
  formOpt(id) {
    if (!this.hasSkillForm(id)) return null;
    const br = skillBranches(id);
    if (!br || !br.form.length) return null;
    return br.form[this.skillForm(id)] || null;
  },

  /* 变体带来的六通道修正 */
  formMods(id) {
    const opt = this.formOpt(id);
    return opt ? opt.mods : null;
  },

  /* ---------------- BD 推荐（P4） ----------------
   * 按「当前存档」算三套最省事的流派，不是强度榜（见 data-builds.js 头部）。
   * 全部输入都来自现有系统：技能等级 / 取向 / 变体 / 被动 / 属性 / 技能标签。
   * 没有随机数、没有隐藏系数 —— 同一个存档永远同一个顺序，玩家不会觉得「面板在乱跳」。
   */
  recommendBuilds(n) {
    if (typeof BUILDS === 'undefined' || typeof buildFit !== 'function') return [];
    const s = this.state;
    if (!s) return [];
    const skills = this.skillState();
    /* 标签分布：只数「真投过点」的技能（lv ≥ 2）。领悟送的那 1 级不算 ——
     * 否则 60 级角色所有技能都算「在用」，标签契合度就永远满分。 */
    const tagCount = {};
    for (const id in skills) {
      const e = skills[id];
      if (!e || (e.lv || 1) < 2) continue;
      const tags = (typeof skillTags === 'function') ? skillTags(id) : [];
      for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    const ctx = {
      cls: s.cls, skills, passives: s.passives || {}, stats: s.stats || {}, tagCount
    };
    const list = buildList(s.cls).map(b => {
      const f = buildFit(b, ctx);
      return { build: b, fit: f.fit, parts: f.parts, missing: f.missing };
    });
    /* 同分时按 id 排，保证顺序稳定（否则浮点比较在不同浏览器上可能抖） */
    list.sort((a, b) => (b.fit - a.fit) || (a.build.id < b.build.id ? -1 : 1));
    return list.slice(0, n || 3);
  },

  /* 照一套 BD 把变体切过去。只改变体 —— 那是免费的。
   * 加点和被动要花技能点，自动花点等于替玩家做决定（还可能点错没法退），
   * 所以这里只切变体，剩下的步骤由面板列成清单让人自己点。 */
  applyBuildForm(buildId) {
    const b = (typeof buildOf === 'function') ? buildOf(buildId) : null;
    if (!b) return { ok: false, msg: '流派不存在' };
    if (!this.state || b.cls !== this.state.cls) return { ok: false, msg: '该流派不属于当前职业' };
    const e = this.skillState()[b.skill];
    if (!e || (e.lv || 1) < (SKILL_TREE.formAt || 5)) {
      return { ok: false, msg: '「' + (SKILLS[b.skill] ? SKILLS[b.skill].name : b.skill) + '」需达到 ' + (SKILL_TREE.formAt || 5) + ' 级方可改变体' };
    }
    return this.setSkillForm(b.skill, b.form);
  },

  /* 换变体：免费、随时、不花技能点。前提不满足或行为层没接则拒绝 */
  setSkillForm(id, idx) {
    if (!SKILLS[id]) return { ok: false, msg: '技能不存在' };
    if (idx !== 0 && idx !== 1 && idx !== 2) return { ok: false, msg: '变体不存在' };
    if (!this.hasSkillForm(id)) return { ok: false, msg: '「' + SKILLS[id].name + '」的变体尚未实现' };
    const br = skillBranches(id);
    const opt = br && br.form[idx];
    if (!opt) return { ok: false, msg: '变体不存在' };
    const pend = (typeof skillFormPending === 'function') ? skillFormPending(opt) : [];
    if (pend.length) {
      return { ok: false, msg: '「' + opt.name + '」尚未实现（' + pend.join(' / ') + '）' };
    }
    const st = this.state && this.state.stats;
    if (typeof skillFormCondOk === 'function' && !skillFormCondOk(opt, st)) {
      const need = opt.cond && opt.cond.rageMax ? '怒气上限 ' + opt.cond.rageMax : '前提';
      return { ok: false, msg: '「' + opt.name + '」需要' + need };
    }
    const sk = this.skillState();
    const e = sk[id] || (sk[id] = { lv: 1, v: 0 });
    e.f = idx;
    if (typeof this.recalc === 'function') this.recalc();
    return { ok: true, msg: '变体 · ' + opt.name };
  },

  /* 选 / 换 / 退取向。idx = 0 / 1 选取，-1 退掉。
   * 换向不额外收费（只在第一次选时扣 1 点），退掉返还 1 点。 */
  setBranchPick(id, idx) {
    const s = this.state;
    if (!s || !SKILLS[id]) return { ok: false, msg: '技能不存在' };
    if (!this.skillUnlocked(id)) return { ok: false, msg: '尚未领悟' };
    const sk = this.skillState();
    const e = sk[id] || (sk[id] = { lv: 1, v: 0 });
    const lv = e.lv || 1;
    if (!skillBranchCoreOn(lv)) {
      /* 说清是「已投」几级：等阶里可能含装备 / 命格的 +等级，
       * 只写「到 3 级才能选」会让显示 3 级的玩家以为这个判断坏了。
       * TOAST-INVESTED-PATCH */
      const total = (typeof this.skillLevel === 'function') ? this.skillLevel(id) : lv;
      const extra = total > lv ? '（当前等阶 ' + total + '，其中 ' + (total - lv) + ' 级来自装备加成，不计入投入等级）' : '';
      return {
        ok: false,
        msg: '「' + SKILLS[id].name + '」投入等级 ' + lv + '，需达到 ' + SKILL_TREE.pickAt + ' 级方可选取向' + extra
      };
    }
    const cur = this.branchPick(id);
    if (idx === -1 || idx === cur) {
      if (cur < 0) return { ok: false, msg: '尚未选取向' };
      delete e.p;
      this.recalc();
      return { ok: true, msg: '已退回取向（' + SKILL_TREE.branchCost.pick + ' 点已返还）' };
    }
    if (idx !== 0 && idx !== 1) return { ok: false, msg: '取向不存在' };
    const br = skillBranches(id);
    const opt = br && br.pick[idx];
    if (!opt) return { ok: false, msg: '取向不存在' };
    /* 行为层还没接的选项不许投点 —— 花了点却什么都没发生，比不让点更糟 */
    const pend = skillBranchPendingBeh(opt);
    if (pend.length) {
      return { ok: false, msg: '「' + opt.name + '」尚未实现（' + pend.join(' / ') + '），请改选另一条' };
    }
    if (cur < 0 && this.skillPoints() < SKILL_TREE.branchCost.pick) {
      return { ok: false, msg: '技能点不足' };
    }
    e.p = idx;
    this.recalc();
    return { ok: true, msg: '取向 · ' + opt.name + (cur >= 0 ? '（换向）' : '（−' + SKILL_TREE.branchCost.pick + ' 点）') };
  },

  /* 分支带来的六通道修正：精研（自动）+ 取向（已选） */
  branchMods(id) {
    const e = this.skillState()[id];
    const lv = (e && e.lv) || 1;
    const br = skillBranches(id);
    if (!br) return null;
    const parts = [];
    if (skillBranchCoreOn(lv) && br.core) parts.push(br.core.mods);
    const p = this.branchPick(id);
    if (p >= 0 && br.pick[p]) parts.push(br.pick[p].mods);
    if (!parts.length) return null;
    return mergeSkillMods.apply(null, parts);
  },

  /* 分支带来的行为修正：台阶（等级送）+ 精研 + 取向 + 变体（第三层） */
  branchBeh(id) {
    const e = this.skillState()[id];
    const lv = (e && e.lv) || 1;
    const br = skillBranches(id);
    const parts = [];
    /* [P2b] 台阶行为排最前：它是等级白送的「基底形态」，
     * 精研 / 取向 / 变体会依次覆盖同名键 —— 玩家花点选的东西必须盖过它。
     * 反过来（台阶放后面）就是「选了疾风变体，参数被台阶换回默认值」，
     * 选项被吃掉，比没做还糟。 */
    const tbh = (typeof skillTierBeh === 'function')
      ? skillTierBeh(id, (typeof this.skillLevel === 'function') ? this.skillLevel(id) : lv)
      : null;
    if (tbh) parts.push(tbh);
    if (br) {
      if (skillBranchCoreOn(lv) && br.core) parts.push(br.core.beh);
      const p = this.branchPick(id);
      if (p >= 0 && br.pick[p]) parts.push(br.pick[p].beh);
      /* 变体只在整只技能切到 form 通道时才叠（否则仍走旧 variants） */
      if (this.hasSkillForm(id) && br.form.length) {
        const fo = br.form[this.skillForm(id)];
        if (fo) parts.push(fo.beh);
      }
    }
    const out = {};
    let any = false;
    for (const src of parts) {
      if (!src) continue;
      for (const k in src) {
        /* 台阶的叠加键不落进 out（它不是真键名），下面单独算 */
        if (src === tbh && k.charAt(0) === '+') continue;
        out[k] = src[k]; any = true;
      }
    }
    /* [P2b] 「+键」= **叠加通道**（台阶专用）。
     * 同名键撞上分支时，玩家期望的是「等级白送的 + 花点选的两份都拿到」，
     * 而不是花点那份把等级那份顶掉 —— 顶掉就等于这一级对选过分支的人不存在。
     * 但形态类键（`move` / `follow` / `ring`…）必须保持「分支覆盖台阶」，
     * 所以不能全局改成相加。折中：台阶里写 `'+hotPct': 0.02` 的键在合并**之后**
     * 再加一遍，其余键行为一字不变。 */
    if (tbh) {
      for (const k in tbh) {
        if (k.charAt(0) !== '+') continue;
        const base = k.slice(1);
        const v = tbh[k];
        const cur = out[base];
        if (typeof v === 'number' && typeof cur === 'number') out[base] = cur + v;
        else if (cur === undefined) out[base] = v;
        any = true;
      }
    }
    return any ? out : null;
  },

  /* 某技能的分支就绪度：精研能否生效、两条取向能否投
   * （UI 用它决定按钮是「可选」还是「待接」） */
  branchReady(id) {
    const br = skillBranches(id);
    if (!br) return null;
    const okOpt = o => !o || !o.beh || skillBranchPendingBeh(o).length === 0;
    return {
      core: okOpt(br.core),
      pick: br.pick.map(okOpt),
      pending: br.pick.map(o => (o ? skillBranchPendingBeh(o) : []))
    };
  },

  /* ============================================================
   * P2 第二批：钩子点结算
   * 由 game.js 的既有事件点调用：击杀（onEnemyDeath）、暴击与伤害
   * （damageEnemy）、格挡与破盾（damagePlayer）、灵兽消散与吐息
   * （updateAllies）、帧循环（update → tickBeh）。
   * 每个方法自己去读「哪个技能的分支带了对应键」，没带就静默返回
   * —— 钩子点一行不判断技能，判断全部收在这里，game.js 只加一行调用。
   * ============================================================ */

  /* 帧循环：变身期间自动旋斩（avatar 取向「剑域」）。
   * 伤害口径与旋风斩主体一致（150% / 4.3 码），但不吃 whirl 的分支 ——
   * 这是 avatar 自己的分支效果，不该再叠一层。 */
  tickBeh(dt) {
    if (!this.state || this.dead) return;
    /* 不竭（变体）：每秒吃资源，见底自动中断。要在最早处结算 ——
     * 下面的自动旋斩会提前 return，扣资源不能跟着一起被跳过。 */
    if (this._drainOn) {
      const mpMax = this.state.stats ? this.state.stats.mpMax : 0;
      for (const id in this._drainOn) {
        const d = this._drainOn[id];
        d.acc = (d.acc || 0) + dt * d.cost;
        while (d.acc >= 1) {
          d.acc -= 1;
          if ((this.state.mp || 0) <= 0) {
            delete this._drainOn[id];
            const pp = this.playerGroup.position;
            FX.text(new THREE.Vector3(pp.x, 2.9, pp.z), '不竭 中断', 'info', { life: 0.9 });
            break;
          }
          this.state.mp = Math.max(0, this.state.mp - 1);
        }
        /* 上限被装备换低时兜一下，避免长期负数累计 */
        if (this.state.mp > mpMax) this.state.mp = mpMax;
      }
    }
    /* 连跃（变体）的窗口：3 秒内不进冷却，用掉次数才作废 */
    if (this._recharge) {
      for (const id in this._recharge) {
        const r = this._recharge[id];
        r.t -= dt;
        if (r.t <= 0 || r.n <= 0) delete this._recharge[id];
      }
    }
    /* 替身（还魂变体）内置冷却 */
    if ((this._autoReviveCd || 0) > 0) this._autoReviveCd -= dt;

    /* [P2b] 回春位 Lv10「生命低于 N% 时自动施放」。
     * 扫**动作条**而不是写死技能：这一位躺着治疗 / 解毒 / 还魂三只，
     * 玩家放哪只就该自动放哪只（阈值也读各自的 beh，不写死 30）。
     * 放的是哪只都不收资源 —— 救命技能卡在「蓝不够」上等于这一级没做。
     * 冷却照走（castSkill 自己会置），所以不会刷屏。
     * 0.25 秒节流：branchBeh 每次要合并三份 beh，每帧扫满 5 格纯属浪费。 */
    this._lowHpT = (this._lowHpT || 0) - dt;
    if (this._lowHpT <= 0 && this.state.stats && typeof this.skillBar === 'function') {
      this._lowHpT = 0.25;
      const st0 = this.state.stats;
      const pct = st0.hpMax > 0 ? (this.state.hp / st0.hpMax) * 100 : 100;
      for (const sid of this.skillBar()) {
        if (!sid || (this.cooldowns[sid] || 0) > 0.02) continue;
        const lb = this.branchBeh(sid);
        if (!lb || !lb.lowHpCast) continue;
        if (pct > lb.lowHpCast) continue;
        this._freeCast = true;
        try { this.castSkill(sid); } finally { this._freeCast = false; }
        const nm = (typeof SKILLS !== 'undefined' && SKILLS[sid]) ? SKILLS[sid].name : sid;
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 3.1, this.playerGroup.position.z),
          '自动施放 · ' + nm, 'good', { life: 1.1 });
        break;                       // 一帧只救一次，别把三只救命技能一起倒出来
      }
    }
    /* 化龙（青龙变体）：变身期间每 0.6 秒对身边喷一口 */
    if ((this._dragonT || 0) > 0) {
      this._dragonT -= dt;
      this._dragonTickT = Math.max(0, (this._dragonTickT || 0) - dt);
      if (this._dragonTickT <= 0 && this.state.stats) {
        this._dragonTickT = 0.6;
        const st2 = this.state.stats;
        const pp2 = this.playerGroup.position;
        const R2 = 4.0;
        let hit2 = 0;
        for (const e of this.enemies) {
          if (e.dead || DIST2D(e.pos, pp2) >= R2 + e.radius) continue;
          hit2++;
          const { dmg, crit } = this.rollDamage(st2.atk * 1.2 * (this._dragonMul || 1));
          this.damageEnemy(e, dmg, crit, { tag: 'aoe', elem: 'lightning' });
        }
        FX.ring(new THREE.Vector3(pp2.x, 0.2, pp2.z), R2, 0x6ac8ff, 0.3, 0.2);
        if (hit2) SFX.hit();
      }
      if (this._dragonT <= 0) {
        delete this._dragonMul;
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 3, this.playerGroup.position.z), '化龙结束', 'info', { life: 0.9 });
      }
    }
    /* 灵兽节拍（嘲讽）：每只带 taunt 的灵兽各自计时，到点把 6 码内的怪拉过来。
     * 嘲讽时长的口径是「间隔的 40%，最多 3 秒」—— 间隔 8 秒配 3 秒嘲讽，
     * 玩家能明显感到「有 3 秒可以放心输出」。 */
    if (this.allies && this.allies.length) {
      for (const al of this.allies) {
        if (!al.skill || typeof this.branchBeh !== 'function') continue;
        const ab = this.branchBeh(al.skill);
        if (!ab || !ab.taunt) continue;
        if (al.tauntCd == null) al.tauntCd = ab.taunt;
        al.tauntCd -= dt;
        if (al.tauntCd > 0) continue;
        al.tauntCd = Math.max(1, ab.taunt);
        const R = 6.5, dur = Math.min(3, Math.max(1.2, ab.taunt * 0.4));
        let n = 0;
        for (const e of this.enemies) {
          if (!e || e.dead || e.boss) continue;
          if (DIST2D(e.pos, al.pos) >= R + (e.radius || 0)) continue;
          e.tauntT = Math.max(e.tauntT || 0, dur);
          e.tauntPt = { x: al.pos.x, z: al.pos.z };
          n++;
        }
        if (n) {
          FX.ring(new THREE.Vector3(al.pos.x, 0.2, al.pos.z), R, 0xffd8a0, 0.35, 0.25);
          FX.text(new THREE.Vector3(al.pos.x, 2.6, al.pos.z), '嘲讽 ' + n, 'info', { life: 0.9 });
        }
      }
    }
    /* 常驻（变体）：每 0.4 秒扫一眼，冷却好了就自己开 —— 玩家不用按 */
    this._pasT = (this._pasT || 0) + dt;
    if (this._pasT >= 0.4) {
      this._pasT = 0;
      if (typeof this.tickPassiveSkills === 'function') this.tickPassiveSkills();
    }
    if (!this.buffs) return;
    const beh = this.branchBeh('avatar');
    if (!beh || !beh.autoWhirl) return;
    if (!this.buffs.some(b => b.key === 'skill:avatar')) return;
    this._autoWhirlT = Math.max(0, (this._autoWhirlT || 0) - dt);
    if (this._autoWhirlT > 0) return;
    this._autoWhirlT = Math.max(0.5, beh.autoWhirl);
    const st = this.state.stats;
    const pp = this.playerGroup.position;
    const rad = 4.3;
    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead || DIST2D(e.pos, pp) >= rad + e.radius) continue;
      hit++;
      const { dmg, crit } = this.rollDamage(st.atk * 1.5);
      this.damageEnemy(e, dmg, crit, { knock: 1.2, tag: 'aoe' });
    }
    FX.ring(new THREE.Vector3(pp.x, 0, pp.z), rad, 0xffd8a0, 0.35, 0.2);
    if (hit) { SFX.swing(); SFX.hit(); }
  },

  /* ============================================================
   * 灵兽三件套（第三批）：增益 / 体型 / 双生
   *
   * 灵兽没有血条，所以「上盾」「回血」这类写法在这套引擎里没有落点。
   * 它真正能变的三样是：伤害、出手间隔、还能存在多久 —— 全部翻译成
   * 这三样，玩家看到的差别才是真的。没有灵兽时明确说一声「场上没有灵兽」，
   * 不静默吞掉。
   * ============================================================ */
  allyEmpower(cfg, b) {
    const c = cfg || {};
    const allies = this.allies || [];
    const pp = this.playerGroup.position;
    if (!allies.length) {
      FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '场上没有灵兽', 'info', { life: 1 });
      return 0;
    }
    const dur = (typeof c.dur === 'number') ? c.dur
      : (b && typeof b.dur === 'number' ? b.dur : 0);
    for (const al of allies) {
      const e = al.emp || (al.emp = { dmg: 1, atk: 1, drain: 1, t: 0 });
      if (c.dmg) e.dmg = Math.max(e.dmg, 1 + c.dmg / 100);
      if (c.atk) e.atk = Math.max(e.atk, 1 + c.atk / 100);
      if (c.drain) e.drain = Math.min(e.drain, c.drain);
      if (dur > 0) e.t = Math.max(e.t, dur);
      /* life 是「续命秒数」：灵兽只有存在时间，回血就等于是这个 */
      if (c.life) al.life += c.life;
    }
    FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 4, 0x9ad8ff, 0.5, 0.25);
    FX.text(new THREE.Vector3(pp.x, 2.9, pp.z), '灵兽同享', 'good', { life: 1 });
    return allies.length;
  },

  /* 体型：放大模型与出手距离（伤害由 mods.dmg 走另一条路，不在这里重复乘） */
  allyGrow(pct) {
    const allies = this.allies || [];
    if (!allies.length) return 0;
    const m = 1 + (pct || 0) / 100;
    for (const al of allies) {
      if (al.actor && al.actor.group) al.actor.group.scale.multiplyScalar(m);
      al.reach = (al.reach || 2.2) * m;
      if (al.aoe) al.aoeR = (al.aoeR || 2.8) * m;
    }
    return allies.length;
  },

  /* 双生：主召唤物之外再拉一只（参数按「同门小弟」给，弱一档） */
  allyPair(cfg) {
    const c = (cfg && typeof cfg === 'object') ? cfg : {};
    if (typeof this.summonBeast !== 'function') return 0;
    this.summonBeast({
      skill: c.skill || 'azuredragon', scale: c.scale || 1.05,
      color: c.color || 0xffe0b0, cloth: c.cloth || 0xc8a060,
      inherit: c.inherit || 0.55, life: c.life || 14,
      atkRate: c.atkRate || 0.95, name: c.name || '白虎'
    });
    return 1;
  },

  /* 连跃：抬冷却用（castSkill 的冷却分支读这张表）。
   * 窗口期内不再重新装弹 —— 每次施法都会重跑一遍 beh，若每次都装一发，
   * 连跃就变成「无限跃」了。窗口过期后下一次施法才重新装。 */
  setRecharge(id, cfg) {
    if (!id) return;
    this._recharge = this._recharge || {};
    const cur = this._recharge[id];
    if (cur && cur.t > 0) return;
    const n = Math.max(1, (cfg && cfg.n) || 1);
    const t = Math.max(1, (cfg && cfg.t) || 3);
    this._recharge[id] = { n, t, t0: t };
  },

  /* 常驻（变体）：带 passive 的技能不用按，冷却到就自动施放。
   * 数值减半、持续拉满到下次冷却 —— 所以它真的是「常驻的一半」，
   * 不是「少了按键但还得盯着」。资源也不收，否则纯亏。 */
  tickPassiveSkills() {
    const s = this.state;
    if (!s || this.dead || !this.running) return;
    const order = (typeof SKILL_ORDER !== 'undefined' && SKILL_ORDER[s.cls]) || [];
    for (const id of order) {
      if ((this.cooldowns[id] || 0) > 0.02) continue;
      if (typeof this.skillUnlocked === 'function' && !this.skillUnlocked(id)) continue;
      const beh = this.branchBeh(id);
      if (!beh || !beh.passive) continue;
      this._autoCast = true;
      try { this.castSkill(id); } catch (err) { /* 自动施放失败不该打断帧循环 */ }
      this._autoCast = false;
    }
  },

  /* 击杀钩子（onEnemyDeath 开头调用）。三件事：
   * 战鼓（killExtend）击杀延长增益、补刀（resetOnKill）重置冷却、
   * 血旋（detonate）引爆带持续伤害的尸体。 */
  onBehKill(e) {
    if (!this.state || !this.buffs) return;
    /* 战鼓：增益期间每次击杀延长 1 秒，最多 +max 秒。
     * 标记在增益本体上（castSkill 时折进 b.killExtend），只延长还活着的增益。 */
    for (const b of this.buffs) {
      /* [P2b] 两条延长通道各记各的账：killExtend 是精研「战鼓」给的，
       * killProlong 是等级台阶给的。同一只增益可以同时吃到两条。 */
      const chans = [];
      if (b.killExtend) chans.push({ k: b.killExtend, tag: '战鼓' });
      if (b.killProlong) chans.push({ k: b.killProlong, tag: '延寿' });
      for (const ch of chans) {
        const kx = ch.k;
        if ((kx.got || 0) >= kx.max) continue;
        kx.got = (kx.got || 0) + (kx.per || 1);
        b.dur += kx.per || 1;
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.9, this.playerGroup.position.z),
          ch.tag + ' +' + (kx.per || 1) + 's', 'info', { life: 0.8 });
      }
    }
    if (!e) return;
    /* 补刀：用处决同步击杀 → 立即重置冷却。
     * lastHitBy 由 damageEnemy 在击杀瞬间写入，且只在施法同步窗口内写
     * —— 毒 / 火的延迟跳伤不带来源标记，不会误触发。 */
    const ex = this.branchBeh('execute');
    if (ex && ex.resetOnKill && e.lastHitBy === 'execute') {
      this.cooldowns.execute = 0;
      FX.text(new THREE.Vector3(e.pos.x, 2.6, e.pos.z), '补刀', 'good', { life: 0.9 });
    }
    /* 血旋：带持续伤害的目标死亡时，把剩余伤害的 N% 在原地引爆。
     * 剩余比例 = dotT / dotDur（刚挂上就死 ≈ 全额，快烧完才死 ≈ 没多少）。 */
    const wh = this.branchBeh('whirl');
    if (wh && wh.detonate && (e.dotT || 0) > 0 && e.dotDmg) {
      const remain = Math.max(0, Math.min(1, (e.dotT || 0) / Math.max(0.1, e.dotDur || 1)));
      const base = e.dotDmg * remain * (wh.detonate / 100);
      this.explodeAt(new THREE.Vector3(e.pos.x, 0, e.pos.z), 2.8, base, 0xff6a5a, false, true);
      FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '引爆', 'info', { life: 0.8 });
    }
    /* 噬魂（白虎变体）：每次击杀回一口血。按最大生命百分比，
     * 与嗜血（暴击回血）走不同触发条件，两个可以同时存在 */
    const wt = this.branchBeh('whitetiger');
    if (wt && wt.killHeal) {
      this.healPlayer(this.state.stats.hpMax * wt.killHeal / 100, true);
      FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '噬魂 +' + wt.killHeal + '%', 'good', { life: 0.8 });
    }
    /* 燎原（焚天变体）：击杀时在尸体处再爆一次。
     * 用攻击力的 120% 而不是「死者最大生命的 x%」—— 精英血量高，
     * 按血量算会变成「越强的怪炸得越狠」，一圈连锁直接把地图清空 */
    const py = this.branchBeh('pyroclasm');
    if (py && py.corpseBlast && this.state) {
      this.explodeAt(new THREE.Vector3(e.pos.x, 0, e.pos.z), 3.2,
        this.state.stats.atk * 1.2, 0xff8a3a, false, true, 'aoe');
    }
    /* 尸毒（蚀骨毒雾变体）：中毒死掉的敌人，尸体上再冒一小片毒雾。
     * 判定用 venomT（毒雾给的毒印记）或 dotT（其它来源的持续伤害）——
     * 只认「带毒死了」的，不认随便什么死法，否则整张图会铺满毒。 */
    const pz = this.branchBeh('poison');
    if (pz && pz.spread && this.barSkillOk('poison')
      && ((e.venomT || 0) > 0 || (e.dotT || 0) > 0)) {
      const atk = this.state.stats ? this.state.stats.atk : 0;
      /* [P2b] 台阶 Lv10 给的是更大的那片（spreadRad），变体没写就按 3.2 */
      const pr = Math.max(1.5, pz.spreadRad || 3.2);
      this.spawnPoisonPatch(new THREE.Vector3(e.pos.x, 0, e.pos.z), pr,
        Math.max(0.6, (e.dotDmg || 0) * 0.6, atk * 0.5), 3);
      FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '尸毒', 'info', { life: 0.8 });
    }
  },

  /* 一小片毒雾（尸毒用）：不放进技能 case，因为触发点是「谁死在哪」。 */
  spawnPoisonPatch(c, rad, dmg, dur) {
    if (!this.state || typeof FX === 'undefined') return;
    const gen = this.mapGen;
    FX.area(c, rad, 0x2f9a3c, dur, { opacity: 0.26 });
    let ticks = 0;
    const iv = setInterval(() => {
      if (this.mapGen !== gen || this.dead) { clearInterval(iv); return; }
      ticks++;
      for (const e of this.enemies) {
        if (e.dead || DIST2D(e.pos, c) >= rad + e.radius) continue;
        this.damageEnemy(e, dmg, false, { silent: true, tag: 'dot', elem: 'poison' });
        e.dotT = Math.max(e.dotT || 0, 1); e.dotDur = Math.max(e.dotDur || 0, 1);
        e.dotDmg = Math.max(e.dotDmg || 0, dmg * 0.5);
      }
      if (ticks >= Math.round(dur / 0.8)) clearInterval(iv);
    }, 800);
  },

  /* 暴击钩子（damageEnemy 在确认 crit 时调用）：嗜血回复。
   * critHeal 的数值口径是「千分比」：15 → 1.5% 最大生命。 */
  onBehCrit() {
    if (!this.state || !this.buffs) return;
    let heal = 0;
    for (const b of this.buffs) {
      if (b.critHeal) { heal = Math.max(heal, b.critHeal); break; }
    }
    if (!heal) return;
    this.healPlayer(this.state.stats.hpMax * heal / 1000, true);
  },

  /* 格挡钩子（damagePlayer 的格挡分支里调用）：反斩。
   * 与磐石套的「格挡反击」并存 —— 套装是 def+atk 的混合伤害，
   * 这里是纯攻击力的 80%，两个都触发也不算重复（数值来源不同）。 */
  onBehCounter(source) {
    if (this.dead || !this.state) return;
    /* 两种来源要分开判：
     *  · 取向「反斩」是**永久被动**（P2 定的语义：选了就随时能用）
     *  · 变体「舍身 / 坚壁」只在对应技能开着的时候才算数 ——
     *    你选的是「这面盾的形状」，盾没举起来就不该有它
     * branchBeh 会把三层合在一起，分不出来源，所以取向直接查 pick 表。 */
    const buffOn = k => !!this.buffs && this.buffs.some(b => b.key === 'skill:' + k);
    const beh = this.branchBeh('riposte');
    if (beh && beh.noDR && buffOn('riposte')) {
      if (typeof this.addBuff === 'function') {
        this.addBuff('舍身', { dmgAll: 150, dur: 3 }, 0xff6a5a,
          { key: 'beh:noDR', type: 'buff', icon: '舍' });
      }
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 3, this.playerGroup.position.z),
        '舍身 +150%', 'lv', { life: 0.9 });
    }
    let pct = 0;
    const br = skillBranches('riposte');
    const pi = this.branchPick('riposte');
    const po = (pi >= 0 && br) ? br.pick[pi] : null;
    if (po && po.beh && po.beh.counter) pct = po.beh.counter;
    if (buffOn('shieldwall')) {
      const sw = this.branchBeh('shieldwall');
      if (sw && sw.counter) pct = Math.max(pct, sw.counter);
    }
    if (!pct || !source || source.dead) return;
    const st = this.state.stats;
    const { dmg, crit } = this.rollDamage(st.atk * pct / 100);
    const pp = this.playerGroup.position;
    FX.beam(new THREE.Vector3(pp.x, 1.2, pp.z),
      new THREE.Vector3(source.pos.x, 1.2, source.pos.z), 0xffe0a0, 0.16);
    FX.text(new THREE.Vector3(pp.x, 2.7, pp.z), '反斩', 'info', { life: 0.7 });
    this.damageEnemy(source, dmg, crit, { knock: 1.4, tag: 'melee' });
  },

  /* 破盾钩子（damagePlayer 护盾被打空时调用）：冰刺。
   * 只认「被打破」，不认「到期消散」—— 描述写的是破盾。 */
  onBehShieldBreak() {
    /* [P2b] 这个钩子现在服务两条互相独立的分支效果：
     *   ① 取向「冰刺」的 breakNova（原有）
     *   ② 台阶 Lv10 的 tierNova（新）
     * 所以**不能**再在开头按 breakNova 早退 —— 只登记了台阶、没选冰刺的玩家
     * 会连破盾爆发一起吞掉。 */
    const beh = this.branchBeh('iceshield');
    if (!this.state || this.dead || !this.running) return;
    if (beh && beh.breakNova) {
      const st = this.state.stats;
      const pp = this.playerGroup.position;
      const n = Math.max(2, Math.round(beh.breakNova) || 6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d2 = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        FX.projectile({
          pos: new THREE.Vector3(pp.x + d2.x * 0.6, 1.3, pp.z + d2.z * 0.6),
          dir: d2, speed: 18, color: 0x9ae0ff, radius: 0.24, hitRadius: 0.55, team: 'player',
          dmg: st.atk * 1.2, life: 0.9, elem: 'ice', tag: 'proj', trail: true,
          onHit: (e, p) => {
            if (!e) return;
            this.damageEnemy(e, p.dmg, false, { tag: 'proj', elem: 'ice' });
            e.slow = Math.max(e.slow || 0, 0.35);
            e.slowT = Math.max(e.slowT || 0, 2);
          }
        });
      }
      FX.ring(new THREE.Vector3(pp.x, 0, pp.z), 3, 0x9ae0ff, 0.5, 0.25);
      FX.text(new THREE.Vector3(pp.x, 2.7, pp.z), '冰刺', 'info', { life: 0.8 });
    }
    /* 台阶 Lv10：破盾补一发范围伤害 + 定身。走同一个结算口 ——
     * 焚天那边（爆发侧）调的也是这个方法，两处数值不会漂。 */
    if (typeof this.behTierNova === 'function') this.behTierNova('iceshield');
  },

  /* [P2b] 台阶 Lv10「护盾破碎 / 爆发时对周围敌人造成伤害并定身」。
   * 值 = 攻击力百分比。两个入口共用这一份结算：
   *   · iceshield —— onBehShieldBreak（护盾被打空）
   *   · pyroclasm —— 自己的 case（它没有护盾，「爆发」就是它本身）
   * 元素按技能分：冰盾是冰爆，焚天是爆燃 —— 用同一套蓝光会把火系技能做成冰的。 */
  behTierNova(id, at) {
    const beh = (typeof this.branchBeh === 'function') ? this.branchBeh(id) : null;
    const pct = beh && beh.tierNova;
    if (!pct || !this.state || this.dead) return;
    const st = this.state.stats;
    const c = at || this.playerGroup.position;
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const rad = 4.5;
    const warm = (id === 'pyroclasm');
    const col = warm ? 0xff9040 : 0x9ae0ff;
    this.explodeAt(pos.clone(), rad, st.atk * pct / 100, col, false, true, 'aoe');
    /* 定身 = slow 1.0：war3 式的「完全不动」，比 freeze 轻一档（能被打、能被推） */
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (DIST2D(e.pos, pos) > rad + e.radius) continue;
      e.slow = Math.max(e.slow || 0, 1);
      e.slowT = Math.max(e.slowT || 0, 1.5);
    }
    FX.ring(pos, rad, col, 0.6, 0.3);
    FX.text(new THREE.Vector3(pos.x, 2.6, pos.z), warm ? '爆燃定身' : '冰爆定身', 'info', { life: 0.9 });
  },

  /* 灵兽消散钩子（updateAllies 到期移除时调用）：护主。
   * summon（灵狼）与 whitetiger（白虎）两条分支都叫「护主」，取数值大的那条。 */
  onBehAllyDeath() {
    if (!this.state) return;
    let pct = 0;
    for (const id of ['summon', 'whitetiger']) {
      const beh = this.branchBeh(id);
      if (beh && beh.deathHeal) pct = Math.max(pct, beh.deathHeal);
    }
    if (!pct) return;
    this.healPlayer(this.state.stats.hpMax * pct / 100, true);
    FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.8, this.playerGroup.position.z),
      '护主 +' + pct + '%', 'good', { life: 1 });
  },

  /* 变体专属特效（P4）：施法瞬间画一次，纯表现层。
   *
   * 为什么不在 SKILL_BEH 里画：那是「改了打法」的结算点，纯数值变体
   * （只有 mods）根本进不去 —— 而「这条变体长什么样」跟「它改了什么」
   * 是两件事。放在 castSkill 的公共出口，两条通道都能吃到。
   *
   * 也不碰命中判定：这里只读坐标，不筛敌人、不加伤害。
   * 关掉它（FORM_FX 全清空）玩家打出来的数字一模一样。
   */
  castFormFx(id, o) {
    if (typeof skillFormFx !== 'function' || typeof FX === 'undefined' || !this.playerGroup) return;
    const sk = SKILLS[id];
    if (!sk) return;
    const fx = skillFormFx(id, this.skillVariant(id));
    const recipe = fx && fx.style && fx.style.cast;
    if (!recipe || !recipe.length) return;

    const pp = (o && o.pp) || this.playerGroup.position;
    const aim = (o && o.aim) || pp;
    /* 自身技能没有落点：落点就是脚下。否则「原地重砸」的特效会飘在原地
     * 而「指定位置」的技能会画在瞄准圈里 —— 两种都得对。 */
    const at = (sk.cast === 'self' || !o || !o.aim) ? pp : aim;
    const R = Math.max(1.6, (sk.radius || 3) * ((o && o.srad) || 1) * 0.9);
    const col = fx.color;

    for (const pr of recipe) {
      const base = (pr.at === 'self') ? pp : at;
      if (!base || typeof base.x !== 'number') continue;
      const y = (pr.y != null) ? pr.y : 0.9;
      try {
        if (pr.t === 'ring') {
          FX.ring(new THREE.Vector3(base.x, 0.08, base.z), R * (pr.r || 1), col,
            pr.dur || 0.45, pr.th || 0.16);
        } else if (pr.t === 'flash') {
          FX.flashCircle(new THREE.Vector3(base.x, 0.07, base.z), R * (pr.r || 1), col, pr.dur || 0.35);
        } else if (pr.t === 'burst') {
          FX.burst(new THREE.Vector3(base.x, y, base.z), col, pr.n || 12, {
            speed: pr.sp || 5, size: pr.size || 0.1, life: pr.life || 0.5,
            additive: pr.add !== false, gravity: pr.gravity
          });
        } else if (pr.t === 'blood') {
          FX.blood(new THREE.Vector3(base.x, y, base.z), col, pr.n || 12);
        } else if (pr.t === 'area') {
          FX.area(new THREE.Vector3(base.x, 0.05, base.z), R * (pr.r || 1), col,
            pr.dur || 0.6, { opacity: pr.opacity || 0.12 });
        } else if (pr.t === 'beam') {
          FX.beam(new THREE.Vector3(base.x, 6, base.z), new THREE.Vector3(base.x, 0.2, base.z),
            col, pr.dur || 0.18, pr.width || 1);
        }
      } catch (err) { /* 表现层出错不许影响这发技能 */ }
    }
  },

  /* 施法后结算分支行为。ctx 由 castSkill 传进来（pp / aim / dir / spow / srad） */
  applySkillBeh(id, o) {
    const beh = this.branchBeh(id);
    const sk = SKILLS[id];
    if (!beh || !o || !sk) return;
    let c;
    try {
      c = makeBehCtx(this, id, Object.assign({ sk }, o));
    } catch (err) {
      return;   // 上下文都建不起来（例如没在战斗里）→ 静默略过，不影响这发技能
    }
    /* 固定顺序：先状态（让后面的伤害吃到易伤 / 破甲），再追加伤害，最后自身增益。
     * 顺序写死而不是按数据里的键序 —— 数据是给人读的，顺序不该影响结果。 */
    const ORDER = ['hit', 'self', 'eco'];
    for (const ph of ORDER) {
      for (const k in beh) {
        const d = SKILL_BEH[k];
        if (!d || d.ph !== ph) continue;
        try { d.run(c, beh[k], beh); } catch (err) {
          /* 单个 handler 出错不该让整发技能哑掉：记一条日志继续 */
          if (typeof UI !== 'undefined' && UI.log) UI.log('分支行为 ' + k + ' 出错：' + err.message, 'bad');
        }
      }
    }
  }
});
