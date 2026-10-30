/* ============================================================
 * worldboss-fight.js —— 世界 Boss 的战斗层（M18.7）
 * ------------------------------------------------------------
 * 只做三件事，别往里加第四件：
 *
 *   1. **阶段**：按血量 1.00 / 0.66 / 0.33 分三段，切换时播名字、
 *      跑 `enter` 效果、重置出手节奏。
 *   2. **出手**：从「当前阶段可用技能」里挑一个能打的（cd 好了、
 *      距离够得着、夜间限定满足），按 `warn` 秒预警再结算。
 *   3. **场地**：相柳 P3 的毒沼、九尾狐 P3 的狐火，持续区域伤害。
 *
 * ------------------------------------------------------------
 * 为什么单独一个文件，而不是塞进 worldboss.js：
 *   worldboss.js 是「刷新 / 存档 / 通知 / 领域」——没有一处需要 THREE 的
 *   几何与 FX 特效。战斗层满屏都是 `FX.telegraph / burst / beam`，
 *   混在一起会让那个文件里「状态机」和「特效」互相打岔。
 *
 * ------------------------------------------------------------
 * 与常驻首领（八部天龙）的关系：**只借通道，不借招式**。
 *   常驻首领走 `Game.bossPattern()` + `cfg.patterns`（slam / roots / ringshot…），
 *   那是 8 只共用的招式池。世界 Boss 走自己的 `cfg.skills` 18 条，
 *   七种 shape 全在这里实现。**不要**把 world boss 写进 `patterns`，
 *   `dev/check-worldboss.js` 第十一节会红。
 *
 * ------------------------------------------------------------
 * 判定口径（改之前先看，这三条决定了「玩家觉不觉得公平」）：
 *
 *   【一】预警画在哪，判定就按哪。shape 的几何在**施放瞬间**定下来
 *      （角度、落点、方向都锁死），结算时才拿玩家的**当时**位置去测。
 *      这样玩家看到「预警圈在左边，我跑到右边」就一定安全 ——
 *      如果结算时还追着玩家重新算几何，预警就变成装饰了。
 *
 *   【二】所有判定都留 0.7 米的宽容。玩家的碰撞半径是 0.55，
 *      贴边站的时候视觉上「还在圈里」但判定已经出圈，玩家会觉得被坑。
 *
 *   【三】伤害 = `e.dmg × sk.mul`。`e.dmg` 里已经含了阶段加成
 *      （`dmgMul` / `stance`），所以这里**不要再乘一次**阶段系数。
 * ============================================================ */

const WBFight = {
  /* 元素 → 预警色。和 FX 里技能配色同一套口径 */
  ELEM_COLOR: {
    phys: 0xffb070, fire: 0xff6a3a, ice: 0x7ad0ff,
    lightning: 0xffe066, poison: 0x7ad06a
  },

  /* 判定宽容（米）：玩家碰撞半径 0.55 + 一点余量 */
  SLACK: 0.7,

  /* 常驻场地效果（相柳 P3 毒沼 / 九尾狐 P3 狐火）
   * 每项 { x, z, r, dmg, every, t, life, label, mesh } */
  _hazards: [],

  /* ============================================================
   * 一、每帧心跳（只管场地，不管技能）
   * ============================================================ */

  tick(dt) {
    if (!this._hazards.length) return;
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!g || !g.playerGroup) return;
    const p = g.playerGroup.position;
    for (let i = this._hazards.length - 1; i >= 0; i--) {
      const h = this._hazards[i];
      h.life -= dt;
      if (h.life <= 0) { this._dropFx(h); this._hazards.splice(i, 1); continue; }
      if (g.dead || (g.state.hp || 0) <= 0) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) > h.r) continue;
      h.t -= dt;
      if (h.t > 0) continue;
      h.t = h.every;
      /* 场地伤害走 pierce：和领域 DoT 同一个口径 ——
       * 「每秒扣多少」是对玩家的一句承诺，不该被护甲吃掉 */
      g.damagePlayer(h.dmg, null, { pierce: true });
      if (typeof FX !== 'undefined') {
        /* 'player' 是红色（扣自己的血），和领域毒沼同一口径 */
        FX.text(new THREE.Vector3(p.x, 2.2, p.z), h.label || '侵蚀', 'player', { life: 0.6 });
      }
    }
  },

  /* 清场。实体被清 / 换图 / 击杀 / 到点换人 都走这里 */
  clear() {
    for (const h of this._hazards) this._dropFx(h);
    this._hazards.length = 0;
  },

  /* 把一条场地效果的可视圆从 `FX.zones` 里摘掉。
   * 场地是 `life: 999` 铺的（要一直亮着），所以 FX 自己不会回收它 ——
   * 不手动摘的话，打一次相柳就在场景里留一个半径 26 米的半透明圆，
   * 换三张图之后地面会糊成一片。 */
  _dropFx(h) {
    if (!h || !h.mesh || typeof FX === 'undefined' || !FX.zones) return;
    for (let i = FX.zones.length - 1; i >= 0; i--) {
      const z = FX.zones[i];
      if (z.mesh !== h.mesh) continue;
      if (z.mesh.parent) z.mesh.parent.remove(z.mesh);
      z.mat.dispose();
      FX.zones.splice(i, 1);
      break;
    }
    h.mesh = null;
  },

  /* ============================================================
   * 二、阶段
   * ============================================================ */

  /* 当前阶段下标（0/1/2）。读血量比例，和领域机制的 `enter.sight` 同源 */
  phaseOf(e) {
    const cfg = e && e.cfg;
    if (!cfg || !cfg.phases || !cfg.phases.length) return 0;
    if (typeof worldBossPhaseAt !== 'function') return 0;
    return worldBossPhaseAt(cfg, e.hp / Math.max(1, e.maxHp));
  },

  /* 是不是「夜」。昼夜领域的三阶段里，P1 是白天、P2/P3 是夜里；
   * P3 带 `dayNightCycle` 时每 N 毫秒来回切 —— 这时读实体的计时器。
   * 领域机制（sight）与 `nightOnly` 技能都读这一个函数，
   * 否则会出现「视野已经黑了但暗潮还放不出来」。 */
  nightOf(e) {
    const ph = e && e.cfg && e.cfg.phases && e.cfg.phases[e.wbPhase || 0];
    if (!ph) return false;
    const en = ph.enter || {};
    if (typeof en.dayNightCycle === 'number' && en.dayNightCycle > 0) {
      return !!e.wbNight;
    }
    /* 没有显式周期时按视野判断：压到 10 米以内就是夜 */
    return typeof en.sight === 'number' && en.sight <= 10;
  },

  /* 每帧由 `Game.updateBossAI` 调。**不要**在别处再调一次。 */
  ai(e, dt, pp) {
    if (!e || !e.wb || e.dead) return;
    const cfg = e.cfg;
    if (!cfg || !cfg.phases || !cfg.phases.length) return;

    const idx = this.phaseOf(e);
    if (idx !== e.wbPhase) this._enterPhase(e, idx);

    /* 昼夜交替（烛九阴 P3）：每 dayNightCycle 毫秒翻一次 */
    const cur = cfg.phases[e.wbPhase] || {};
    const en = cur.enter || {};
    if (typeof en.dayNightCycle === 'number' && en.dayNightCycle > 0) {
      e.wbNightT = (e.wbNightT || 0) + dt * 1000;
      if (e.wbNightT >= en.dayNightCycle) {
        e.wbNightT -= en.dayNightCycle;
        e.wbNight = !e.wbNight;
        if (typeof FX !== 'undefined') FX.ring(e.pos, 12, e.wbNight ? 0x223355 : 0xffcf6a, 0.8, 0.25);
      }
    }

    /* 真身现身（九尾狐 P3）：**每帧推进**，和昼夜交替同一个位置 */
    this._revealTick(e, dt);

    /* 每只技能独立冷却。共用一个大会让「cd 短的永远抢不到出手」 */
    const cds = e.wbCd || (e.wbCd = {});
    for (const k in cds) if (cds[k] > 0) cds[k] -= dt;
    e.wbGcd = Math.max(0, (e.wbGcd || 0) - dt);

    /* 战吼（刑天 P3）的加速是**临时**的，到期必须自己掉回去。
     * 每帧在这里结算，而不是在 `cast` 里 setTimeout —— 换图 / 击杀 /
     * 暂停时 setTimeout 还在跑，会把下一只 boss 的攻速也带快。 */
    if (e.wbHasteT > 0) {
      e.wbHasteT -= dt;
      if (e.wbHasteT <= 0) { e.wbHasteT = 0; e.wbHaste = 1; }
    }
    this._syncAtkCd(e);

    if (e.wbGcd > 0) return;

    const dist = Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z);
    const ready = [];
    for (const id of (cur.skills || [])) {
      const sk = cfg.skills && cfg.skills[id];
      if (!sk) continue;
      if ((cds[id] || 0) > 0) continue;
      if (sk.nightOnly && !this.nightOf(e)) continue;
      /* 距离门槛：够不着的技能不放 —— 否则玩家只看到一堆打不到的空预警，
       * 会以为 Boss 在乱放技能 */
      if (sk.shape !== 'self' && sk.range && dist > sk.range * 1.05) continue;
      ready.push(sk);
    }
    if (!ready.length) return;

    const sk = ready[Math.floor(Math.random() * ready.length)];
    cds[sk.id] = sk.cd || 6;
    e.wbGcd = RND(0.9, 1.7);
    this.cast(e, sk, pp);
  },

  _enterPhase(e, idx) {
    const cfg = e.cfg;
    const ph = cfg.phases[idx] || {};
    e.wbPhase = idx;
    /* 通用 AI 的移速缩放读 `e.phase`（`1 + phase*0.12`），跟着一起走 */
    e.phase = idx;

    /* 先把「随阶段变」的战斗参数打回基线，再按本阶段重算。
     * 不重置的话 P3 会带着 P2 的正面格挡 —— 玩家绕到背后也没用。 */
    this._resetCombat(e);
    this._applyEnter(e, ph.enter || {}, idx);

    if (typeof UI !== 'undefined') {
      /* **不要**用「狂怒」——那是常驻首领的词。世界 Boss 的阶段有自己的名字 */
      if (UI.toast) UI.toast(ph.name || ('第 ' + (idx + 1) + ' 阶段'), 'lv');
      if (UI.log) UI.log('【' + cfg.name + '】' + (ph.name || '') + ' —— ' + (ph.desc || ''), 'bad');
    }
    if (typeof SFX !== 'undefined' && SFX.boss) SFX.boss();
    if (typeof Game !== 'undefined') Game.shake = Math.max(Game.shake || 0, 0.6);
    if (typeof FX !== 'undefined') {
      const col = (cfg.domain && cfg.domain.color) ? new THREE.Color(cfg.domain.color).getHex() : 0xff8844;
      FX.ring(e.pos, 8, col, 1.0, 0.35);
      FX.flashCircle(e.pos, 5, col, 0.5);
    }
    /* 换阶段立刻给一次出手，让新技能马上能被看见 */
    e.wbGcd = 0.7;
    e.wbCd = {};
  },

  /* 把随阶段变的字段打回基线。**只碰这几个字段**，
   * 别去动 hp / 位置 / 技能表 —— 那些不是阶段的职责。 */
  _resetCombat(e) {
    if (typeof e.wbBaseDmg !== 'number') e.wbBaseDmg = e.dmg;
    if (typeof e.wbBaseSpd !== 'number') e.wbBaseSpd = e.spd;
    if (typeof e.wbBaseAtkCd !== 'number') e.wbBaseAtkCd = e.cfg.atkCd || 2;
    e.wbHeads = 1;
    e.wbRoot = 0;
    e.wbBlockFront = false;
    e.wbMorph = null;
    e.wbStance = null;
    e.wbAspdMul = 1;
    e.wbHaste = 1;
    e.wbHasteT = 0;
    /* 九尾狐 P2/P3 的两个状态也归零：P3 进 P2 时（理论上不会，但重进阶段会）
     * 尾巴要收回去、影子态要还原，否则会出现「已经不在 P3 了还在半透明」。 */
    e.wbTailsOut = false;
    e.wbReveal = null;
    e.wbVulnMul = 1;
    e.dmg = e.wbBaseDmg;
    e.spd = e.wbBaseSpd;
    this._syncAtkCd(e);
    /* [M18.6] 形态也打回鲲。不打回的话「先打到 P2 变鹏 → 死亡重进 P1」
     * 会看到一条长着翅膀的鱼，而且没有代码负责再切回来。 */
    if (e.actor && typeof WBModels !== 'undefined') {
      WBModels.setMorph(e.actor, 'kun');
      WBModels.setTails(e.actor, 0);
      WBModels.setGhost(e.actor, false);
    }
  },

  /* 普攻间隔 = 基线 / (阶段攻速 × 战吼加速)。
   *
   * **每帧算，不在进阶段时算一次。** 战吼是临时 buff，到期要能自己掉回去；
   * 写成「进阶段时算一次」的话，8 秒后没有任何人负责还原，
   * 刑天会一直保持 1.5 倍攻速到下一个阶段 —— 玩家会以为「战吼是永久的」。
   *
   * 也**不要**借用 `e.aspdT / e.aspdMul`：那一对是**压制**通道
   * （`game.js` 里 `atkCd -= dt * (1 - aspdMul)`），写 0.34 是「慢 34%」，
   * 用它来表达「快 50%」会变成正好相反的效果。 */
  _syncAtkCd(e) {
    const mul = (e.wbAspdMul || 1) * (e.wbHaste || 1);
    const base = (typeof e.wbBaseAtkCd === 'number') ? e.wbBaseAtkCd : (e.cfg.atkCd || 2);
    e.atkCdBase = base / (mul > 0 ? mul : 1);
  },

  /* `enter` 分派。键表在 `dev/check-worldboss.js` 的 ENTER_KEYS，
   * 加键之前先加进词表，否则脚本会红。 */
  _applyEnter(e, en, idx) {
    const cfg = e.cfg;

    /* ---- 数值类 ---- */
    if (typeof en.aspdMul === 'number') e.wbAspdMul = en.aspdMul;
    if (typeof en.heads === 'number') e.wbHeads = Math.max(1, Math.min(9, en.heads));
    if (typeof en.rootOnHit === 'number') e.wbRoot = en.rootOnHit;
    if (en.blockFront) e.wbBlockFront = true;
    /* `en.regurgitate` **不需要落字段**：P2 的「反刍」就是技能表里多了
     * `wb_regurgitate` 这一条（scatter 12 颗）。数据里保留这个键是为了
     * 让人读阶段表时一眼看出「这一段的主题是反刍」，不是给代码用的。
     * 写一个没人读的 `e.wbRegurgitate` 只会让以后的人以为有什么没接上。 */

    /* ---- 姿态（刑天）：持斧伤害高、持盾伤害低但挡正面 ---- */
    if (en.stance) {
      e.wbStance = en.stance;
      const k = en.stance === 'axe' ? 1.2 : (en.stance === 'shield' ? 0.85 : 1.1);
      e.dmg = e.wbBaseDmg * k * (typeof en.dmgMul === 'number' ? en.dmgMul : 1);
    } else if (typeof en.dmgMul === 'number') {
      e.dmg = e.wbBaseDmg * en.dmgMul;
    }

    /* ---- 形态（鲲鹏）：鲲慢而重、鹏快而轻 ---- */
    if (en.morph) {
      e.wbMorph = en.morph;
      const m = en.morph === 'kun' ? 0.8 : (en.morph === 'peng' ? 1.5 : 1.2);
      e.spd = e.wbBaseSpd * m;
      /* 鲲的撞击距离更远、鹏更短 —— 用 reach 表达「体型」 */
      e.reach = (e.cfg.range || 2.2) * (en.morph === 'kun' ? 1.3 : (en.morph === 'peng' ? 0.8 : 1.0));
      /* [M18.6] 真模型切换。之前只有 spd / reach 的代偿 ——
       * 那是数值，玩家看不到「它化鹏了」，只会觉得「它忽然变快了」。
       * 三档：kun 鱼 / peng 鸟 / both 鱼身长翅膀（P3「鲲鹏同体」）。 */
      if (e.actor && typeof WBModels !== 'undefined') WBModels.setMorph(e.actor, en.morph);
    }

    /* ---- 攻速：改的是「普攻间隔」，不改全局 cd ---- */
    this._syncAtkCd(e);

    /* ---- 场地类：只铺一次，重复进阶段不叠 ----
     * 用 `e.wbSpawned` 记账，而不是「每次进阶段都铺」——
     * 不然打到 P3 再来回切阶段，地上会堆十几层毒沼，帧率直接崩。 */
    e.wbSpawned = e.wbSpawned || {};
    const rad = (cfg.domain && cfg.domain.radius) ? cfg.domain.radius : 26;
    if (en.mire && !e.wbSpawned.mire) {
      e.wbSpawned.mire = true;
      this._addHazard(e, rad, e.dmg * 0.22, 1.2, 999, '毒沼');
      if (typeof UI !== 'undefined' && UI.log) UI.log('【' + cfg.name + '】脚下化为毒沼，站在圈里会持续中毒。', 'bad');
    }
    if (en.foxfireField && !e.wbSpawned.foxfire) {
      e.wbSpawned.foxfire = true;
      this._addHazard(e, rad * 0.8, e.dmg * 0.3, 1.5, 999, '狐火');
      if (typeof UI !== 'undefined' && UI.log) UI.log('【' + cfg.name + '】狐火铺开，别站在火里。', 'bad');
    }

    /* ---- 分身（九尾狐 P1）----
     * 用 `spawnEnemy(..., e.wbId)` 生出来，**这样模型和本尊一模一样** ——
     * 分身的谜题前提就是「看不出哪个是真的」，换一只别的怪当分身，
     * 玩家一眼就能认出狐狸，谜题等于没有。
     *
     * 代价是 spawnEnemy 会走 `isBoss` 分支（顶栏血条、名字牌、红色光环、
     * 首领级血量），所以下面必须逐项拆干净：
     *   - `boss: false` —— 否则 `onKill` 的 boss 分支会去读
     *     `BOSSES[bid].level` / `BOSS_POS[bid]`，世界 Boss 两样都没有，直接抛异常
     *   - `wb: false`   —— 否则 `WorldBoss.live()` 会把它当成「本尊还活着」
     *   - `active: true` —— `spawnEnemy` 给首领设的是 `active: false`（等玩家进区域），
     *     分身必须一出生就会追人
     *   - 血量压到 6%，一击碎；伤害压到 25%，不打不行、但也不是致命威胁 */
    if (en.clones && !e.wbSpawned.clones && typeof Game !== 'undefined' && Game.spawnEnemy) {
      e.wbSpawned.clones = true;
      const n = Math.max(1, Math.min(3, en.clones));
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n + RND(-0.3, 0.3);
        const r = 7;
        const c = Game.spawnEnemy(null, e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r,
          false, e.level, e.wbId);
        if (!c) continue;
        c.boss = false;
        c.wb = false;
        c.wbClone = true;
        c.active = true;
        c.aggro = true;
        c.maxHp = Math.max(1, Math.round(e.maxHp * 0.06));
        c.hp = c.maxHp;
        c.dmg = e.dmg * 0.25;
        c.name = cfg.name + '（幻影）';
        /* 名字牌与红环保持不透明：它们和本尊长得一样才是谜题。
         * 真身靠顶栏大血条认（`UI.updateBoss` 只喂 `Game.boss`）。 */
      }
    }

    /* ---- 骨架类（M18.7b：M18.6 的骨架就位后接上）---- */
    if (en.tails) {
      /* 九尾狐 P2「九尾缚」：九条尾全部展开。
       * `en.tails` 的值是尾巴数量（数据 9），**不是强度** —— 模型本来就是
       * 九条，这个键的语义是「展开」。展开后 `wb_tailbind` 那道环扫才有
       * 视觉依据：不然技能名写「九尾环扫」，屏幕上只有一只普通狐狸转身。 */
      if (e.actor && typeof WBModels !== 'undefined') WBModels.setTails(e.actor, 1);
      e.wbTailsOut = true;
      if (typeof FX !== 'undefined') FX.ring(e.pos, 9, 0xffb0e0, 0.9, 0.3);
      if (typeof UI !== 'undefined' && UI.log) UI.log('【' + cfg.name + '】九尾尽数展开。', 'bad');
    }
    if (en.revealVuln) {
      /* 九尾狐 P3「狐火焚天」：真身周期性从狐火里现身。
       * 计时器放在 `ai` 里每帧推进（`_revealTick`），不用 setTimeout ——
       * 换图 / 击杀 / 暂停时 setTimeout 还在跑，会把倍率带到下一只 boss 身上。 */
      e.wbReveal = {
        mul: en.revealVuln, every: this.REVEAL_EVERY, dur: this.REVEAL_DUR,
        t: 5, on: false
      };
      /* 进 P3 当场就是「藏起来」的状态，必须立刻转半透明 ——
       * 只写字段不调 setGhost 的话，头 5 秒里模型还是实心的，
       * 玩家会以为「它明明站在那，为什么打不动」。 */
      this._setRevealState(e, false);
    }
  },

  /* ============================================================
   * 真身现身（九尾狐 P3）
   * ============================================================
   * 节奏：藏 REVEAL_EVERY 秒 → 现身 REVEAL_DUR 秒 → 再藏。
   *
   * 为什么藏的时候不是「无敌」：175000 血的 boss 如果只在 5 秒窗口里可打，
   * 一场要打十几分钟，玩家会以为卡住了。0.6 倍 + 半透明是「打得到但很亏」，
   * 玩家自己会挑窗口爆发 —— 这才是设计里「真身现身受伤 ×2」的意思。 */
  REVEAL_EVERY: 9,
  REVEAL_DUR: 5,
  REVEAL_HIDE_MUL: 0.6,

  _revealTick(e, dt) {
    const rv = e.wbReveal;
    if (!rv) return;
    rv.t -= dt;
    if (rv.t > 0) return;
    rv.on = !rv.on;
    rv.t = rv.on ? rv.dur : rv.every;
    this._setRevealState(e, rv.on);
  },

  /* 「藏起来 / 现身」的唯一落点：倍率 + 骨架透明度 + 播报。
   * 进阶段和每 9 秒的翻转都走这里 —— 两条路各写一份必然漏掉一处
   * （第一版就是进阶段只写了倍率，没调 setGhost）。 */
  _setRevealState(e, on) {
    const rv = e.wbReveal;
    const mul = rv ? rv.mul : 2;
    const dur = rv ? rv.dur : this.REVEAL_DUR;
    e.wbVulnMul = on ? mul : this.REVEAL_HIDE_MUL;
    if (e.actor && typeof WBModels !== 'undefined') WBModels.setGhost(e.actor, !on);
    if (typeof FX !== 'undefined') {
      if (on) {
        FX.ring(e.pos, 6, 0xffe6a0, 0.8, 0.3);
        FX.text(new THREE.Vector3(e.pos.x, 7, e.pos.z), '真身现身 · 受伤 ×' + mul, 'crit', { life: 1.2 });
      } else {
        FX.ring(e.pos, 6, 0x6a5aa0, 0.6, 0.25);
      }
    }
    if (typeof UI !== 'undefined' && UI.log) {
      UI.log(on
        ? '【' + e.cfg.name + '】真身从狐火里走出来 —— ' + dur + ' 秒内吃满伤害。'
        : '【' + e.cfg.name + '】真身藏进狐火，打中的只是影子。', on ? 'good' : 'bad');
    }
  },

  _addHazard(e, r, dmg, every, life, label) {
    /* `t` 的初值是 `every` 而不是 0：踩上去要**先等一个间隔**才掉第一口血。
     * 这和领域 DoT（`worldboss.js` 的 `_dotT` 累加器）同一个口径 ——
     * 两套「每秒扣多少」在同一场战斗里出现时，节拍必须一致，
     * 否则玩家会发现「领域要等一秒，毒沼一踩就掉」，觉得有一边是 bug。
     * 反过来说，如果初值给 0，第一帧 `t -= dt` 就 ≤ 0，进圈瞬间白挨一下。 */
    const h = { x: e.pos.x, z: e.pos.z, r, dmg, every, t: every, life, label, mesh: null };
    this._hazards.push(h);
    if (typeof FX !== 'undefined' && FX.area) {
      h.mesh = FX.area(new THREE.Vector3(e.pos.x, 0, e.pos.z), r,
        label === '狐火' ? 0x66ccff : 0x2f9a3c, life, { opacity: 0.1 });
    }
    return h;
  },

  /* ============================================================
   * 三、出手：18 个技能 / 7 种 shape
   * ============================================================ */

  cast(e, sk, pp) {
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!g || !pp) return;
    const color = this.ELEM_COLOR[sk.elem] || 0xffb070;
    const ang = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    const dmg = Math.max(0, (sk.mul || 0) * e.dmg);
    const warn = Math.max(0.3, sk.warn || 0.8);
    const self = e;
    const SL = this.SLACK;

    if (typeof SFX !== 'undefined' && SFX.cast) SFX.cast();
    if (typeof UI !== 'undefined' && UI.log && sk.name) {
      /* 只报「有预警价值」的：短预警不刷日志，否则聊天框全是技能名 */
      if (warn >= 1.2) UI.log('【' + e.cfg.name + '】' + sk.name, 'bad');
    }

    /* 定身时长：技能自带 `root`（尾缚 2.5 秒）与阶段 `enter.rootOnHit`
     * （九尾狐 P2 之后连普攻都定身）取大者。两个来源并存是设计如此 ——
     * P2 的压迫感来自「被缠住就再起不来」，不是「有个技能会定身」。 */
    const rootDur = Math.max(sk.root || 0, e.wbRoot || 0);

    /* 命中后的统一结算。`extra` 是技能自带的附加效果（拽 / 定身） */
    const applyHit = (extra) => {
      if (g.dead) return;
      if (dmg > 0) g.damagePlayer(dmg, self);
      if (extra) extra();
      /* 命中后的位移（饕餮「锥形巨口」`pull: 6`）。
       * 直接改坐标而不是给一个持续速度：拽一下要「立刻到位」，
       * 拖着走会让玩家以为自己还能挣脱，实际是被黏住了。 */
      if (sk.pull > 0 && g.playerGroup) {
        const p = g.playerGroup.position;
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len > 1.5) {
          const move = Math.min(sk.pull, len - 1.5);   // 不把人塞进模型里
          p.x += dx / len * move;
          p.z += dz / len * move;
          if (g.collideWorld) g.collideWorld(p, 0.55, { x: dx / len, z: dz / len });
        }
      }
      if (dmg > 0 && rootDur > 0) {
        /* 写 `Game.rootT`（玩家的定身计时器），**不要**去拉 `playerSlow` ——
         * 减速封顶 0.85，拉满还能走 15%，那不是「定住」。 */
        g.rootT = Math.max(g.rootT || 0, rootDur);
        if (typeof FX !== 'undefined' && g.playerGroup) {
          const pl = g.playerGroup.position;
          FX.text(new THREE.Vector3(pl.x, 2.9, pl.z), '定身', 'info', { life: 0.8 });
        }
      }
    };

    /* 多头齐射：相柳的 `heads` 用来加「齐射轮数」。
     * 9 个头 = 3 轮，每轮错开一点角度 —— 数据里没有「每头一发」的字段，
     * 这是能把 `heads` 变成玩家感受得到的东西的最简做法。 */
    const volley = () => Math.max(1, Math.min(3, Math.ceil((e.wbHeads || 1) / 3)));

    switch (sk.shape) {
      /* ---------- 线：长条，穿透 ---------- */
      case 'line': {
        const len = sk.range || 20, halfW = Math.max(1, (sk.width || 3) / 2);
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const a = new THREE.Vector3(e.pos.x, 0, e.pos.z);
        const b = new THREE.Vector3(e.pos.x + dx * len, 0, e.pos.z + dz * len);
        /* 预警：沿走廊铺一串圆，读起来就是「一条线」。
         * 不用矩形网格是因为 FX 只有圆形预警，硬造矩形要新增几何体，
         * 而 7 个圆在这个尺寸下已经看不出是圆了。 */
        const steps = 7;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const p = new THREE.Vector3(a.x + dx * len * t, 0, a.z + dz * len * t);
          const last = i === steps;
          FX.telegraph(p, halfW, warn, last ? () => {
            FX.beam(a.clone().setY(1.2), b.clone().setY(1.2), color, 0.3, 2);
            FX.burst(new THREE.Vector3(pp.x, 1, pp.z), color, 16, { speed: 6, size: 0.16, life: 0.5, gravity: 2, additive: true });
            SFX.cast && SFX.cast();
            const pl = g.playerGroup.position;
            if (this._segDist(pl.x, pl.z, a.x, a.z, b.x, b.z) <= halfW + SL) applyHit();
          } : null, color);
        }
        break;
      }

      /* ---------- 圆：以 boss 为心 或 以玩家落点为心 ---------- */
      case 'circle': {
        const r = sk.range || 16;
        const atSelf = sk.at !== 'target';
        const c = atSelf ? new THREE.Vector3(e.pos.x, 0, e.pos.z) : new THREE.Vector3(pp.x, 0, pp.z);
        FX.telegraph(c, r, warn, () => {
          FX.flashCircle(c, r, color, 0.45);
          FX.ring(c, r, color, 0.5, 0.2);
          FX.burst(new THREE.Vector3(c.x, 0.6, c.z), color, 26, { speed: 9, size: 0.18, life: 0.6, gravity: 3, additive: true });
          if (typeof SFX !== 'undefined' && SFX.explode) SFX.explode();
          if (g.shake !== undefined) g.shake = Math.max(g.shake, 0.45);
          const pl = g.playerGroup.position;
          if (Math.hypot(pl.x - c.x, pl.z - c.z) <= r + SL) applyHit();
        }, color);
        break;
      }

      /* ---------- 扇 / 锥：扇形，`arc` 是总张角（度） ---------- */
      case 'fan':
      case 'cone': {
        const r = sk.range || 14;
        const halfArc = (sk.arc || 120) * Math.PI / 360;
        const n = volley();
        for (let v = 0; v < n; v++) {
          /* 齐射：每轮错开 ±，让「九首」看得出来是多头一起喷 */
          const off = n === 1 ? 0 : (v - (n - 1) / 2) * (halfArc * 0.5);
          const ca = ang + off;
          /* 预警：沿弧线铺 5 个圆，从 0.45r 到 0.95r 各一层，
           * 让它看起来是「一片扇形」而不是「一条弧」 */
          for (let k = 0; k < 5; k++) {
            const t = 0.45 + 0.5 * (k / 4);
            const p = new THREE.Vector3(e.pos.x + Math.sin(ca) * r * t, 0, e.pos.z + Math.cos(ca) * r * t);
            FX.telegraph(p, r * 0.26, warn, k === 4 ? () => {
              FX.slash(new THREE.Vector3(e.pos.x, 0, e.pos.z), ca, color, r, halfArc * 2);
              if (typeof SFX !== 'undefined' && SFX.swing) SFX.swing();
              const pl = g.playerGroup.position;
              const dd = Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z);
              if (dd > r + SL) return;
              /* 角度差要绕回 [-π, π]，否则朝正后方时会被算成「在扇形里」 */
              let da = Math.atan2(pl.x - e.pos.x, pl.z - e.pos.z) - ca;
              while (da > Math.PI) da -= Math.PI * 2;
              while (da < -Math.PI) da += Math.PI * 2;
              if (Math.abs(da) <= halfArc) applyHit();
            } : null, color);
          }
        }
        break;
      }

      /* ---------- 散射：落点周围撒 N 颗 ---------- */
      case 'scatter': {
        const r = sk.range || 16;
        const cnt = Math.max(3, Math.min(16, sk.count || 10));
        const base = new THREE.Vector3(pp.x, 0, pp.z);
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * r;
          const p = new THREE.Vector3(base.x + Math.cos(a) * rr, 0, base.z + Math.sin(a) * rr);
          FX.telegraph(p, 2.6, warn + Math.random() * 0.25, () => {
            FX.burst(new THREE.Vector3(p.x, 0.4, p.z), color, 12, { speed: 5, size: 0.16, life: 0.6, gravity: 10 });
            const pl = g.playerGroup.position;
            if (Math.hypot(pl.x - p.x, pl.z - p.z) <= 2.6 + SL) applyHit();
          }, color);
        }
        break;
      }

      /* ---------- 环：以 boss 为心的一圈，内圈安全 ---------- */
      case 'ring': {
        const r = sk.range || 20;
        const inner = r * 0.55;
        FX.telegraph(new THREE.Vector3(e.pos.x, 0, e.pos.z), r, warn, () => {
          FX.ring(new THREE.Vector3(e.pos.x, 0, e.pos.z), r, color, 0.55, 0.3);
          const pl = g.playerGroup.position;
          const dd = Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z);
          if (dd <= r + SL && dd >= inner - SL) applyHit();
        }, color);
        /* 内圈画一个「安全区」提示：绿色，不做判定 */
        FX.telegraph(new THREE.Vector3(e.pos.x, 0, e.pos.z), inner - 0.4, warn, null, 0x66cc88);
        break;
      }

      /* ---------- 自身：给自己上状态（战吼） ---------- */
      case 'self':
      default: {
        FX.ring(e.pos, 6, color, warn, 0.3);
        FX.telegraph(new THREE.Vector3(e.pos.x, 0, e.pos.z), 6, warn, () => {
          FX.flashCircle(e.pos, 6, color, 0.4);
          if (typeof SFX !== 'undefined' && SFX.boss) SFX.boss();
          /* 战吼：攻速 +50% 持续 8 秒。走 `wbHaste / wbHasteT`，
           * 由 `ai()` 每帧结算、到期自动归位（见 `_syncAtkCd` 的注释：
           * 不能借 `aspdMul`，那是压制通道，方向相反）。 */
          if (sk.id === 'wb_warcry') {
            e.wbHaste = 1.5;
            e.wbHasteT = 8;
            this._syncAtkCd(e);
            if (typeof UI !== 'undefined' && UI.log) UI.log('【' + e.cfg.name + '】战吼：攻速大涨。', 'bad');
          }
        }, color);
        break;
      }
    }
  },

  /* 点到线段距离（2D）。线形技能的判定核心 */
  _segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const wx = px - ax, wz = pz - az;
    const len2 = vx * vx + vz * vz;
    if (len2 < 1e-6) return Math.hypot(wx, wz);
    let t = (wx * vx + wz * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }
};
