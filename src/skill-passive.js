/* ============================================================
 * skill-passive.js —— 被动 / 关键被动（P2 第三批）
 *
 * 数据在 data-skill-tree.js 的 SKILL_TREE.passives（27 条：每职业 9 条，
 * 每系末尾固定 1 个关键被动限 1 点）。本文件做三件事：
 *   1) passiveBonusStats：数值型被动折成属性，由 items.js 的
 *      computePlayerStats 走图鉴同一条并加通道 —— 封顶 / 透传 /
 *      面板显示全部自动生效，不用另开管线
 *   2) Game 投点接口：passiveState / passiveLv / passiveSpent /
 *      passiveUnlocked / levelUpPassive / levelDownPassive
 *      （每点花 1 技能点，计入 skillPoints 账本）
 *   3) 战斗钩子：条件增伤 / 受伤减免 / dot 与连锁与冻结改写 /
 *      周期触发（tickPassives，帧循环里 tickBeh 旁边一行）
 *
 * 纪律与 BEH_PENDING 相同：没实现的被动登记进 PASSIVE_PENDING，
 * 接口层拒投、UI 标「待接」、测试当红线 —— 新加没实现的键会当场失败。
 * ============================================================ */

/* 有意待接的被动（点了不给投）。
 * 现在一条都不剩：最后一条 t_beast（兽契，原「万兽」）随着
 * 「场上灵兽上限」规则一起接上（见 game.js 的 allyCap / trimAllies）。
 * 表留着 —— 下一批加新被动时照旧先登记、后实现，别让玩家点到空点。 */
const PASSIVE_PENDING = [];

/* 数值型被动：级数 → 属性增量。全部走 computePlayerStats 标准管线，
 * 所以键必须是真属性键（目前只有 cdr 吃 100% 封顶，其余属性已不设上限）。 */
const PASSIVE_STATS = {
  /* 刀客 */
  w_fero:    lv => ({ critDmg: 12 * lv }),            // 狂怒：暴击伤害
  w_iron:    lv => ({ armorPct: 10 * lv }),           // 铁骨：护甲
  w_bastion: lv => ({ dmgReduce: 25, moveSpd: -10 * lv }), // 不动如山（关键，1 级）
  w_heavy:   lv => ({ aoeDmg: 8 * lv }),              // 重击：范围伤害
  w_sunder:  lv => ({ armorPen: 6 * lv }),            // 破甲：无视护甲
  w_ruin:    lv => ({ executeDmg: 12 * lv }),         // 摧枯：对 <30% 血目标（同处决乘区）
  /* 术士 */
  m_focus:   lv => ({ cdr: 6 * lv }),                 // 专注：冷却缩减（吃 100% 封顶）
  m_volt:    lv => ({ lightningDmg: 10 * lv }),       // 高压：雷电伤害
  /* 符师 */
  t_sigil:   lv => ({ sigilDmg: 9 * lv }),            // 符力：符法伤害（符箓系专属元素）
  t_quick:   lv => ({ aspd: 10 * lv }),               // 急咒：出手速度
  t_bond:    lv => ({ summonDmg: 10 * lv }),          // 通灵：灵兽伤害（summonBeast 已消费）
  t_merid:   lv => ({ healBonus: 10 * lv }),          // 脉络：治疗效果
  t_toxin:   lv => ({ poisonDmg: 12 * lv })           // 毒经：毒伤害
};

/* 有战斗钩子的被动（覆盖率红线用：不在 PASSIVE_STATS 也不在钩子表的才算缺） */
const PASSIVE_HOOKED = [
  'w_bloodlust',   // 血性：passiveDmgMul（生命 <50% 增伤）
  'w_undying',     // 战意不灭：tickPassives（<30% 触发增益，90 秒）
  'w_titan',       // 剑魄：onMpSpent 记账 + passiveDmgMul
  'm_ember',       // 燃烬：applySkillDot 灼烧跳伤
  'm_phoenix',     // 涅槃：damagePlayer 致命伤改写
  'm_chill',       // 霜寒：freezeMul 冻结时长
  'm_absolute',    // 绝对零度：passiveDmgMul（对冻结目标）
  'm_ward',        // 霜甲：passiveTakenMul（贴身来源减伤）
  'm_stormlord',   // 雷神：tickPassives（6 秒自动落雷）
  'm_conduct',     // 导电：chainMul 连锁增伤
  't_heaven',      // 天师：tickPassives 攒护身符 + damagePlayer 抵挡
  't_serene',      // 静心：debuffDurOf（迟滞 / 中毒时长）
  't_elixir',      // 九转还丹：tickPassives（60 秒自动服丹 + 清负面）
  't_beast'        // 兽契：allyCap（灵兽上限 +1）+ updateAllies（消散 30% 重召）
];

/* 传给 computePlayerStats 的并加函数（与 codexBonusStats 同型）：
 * p.passives = { 被动id: 已投级数 } */
function passiveBonusStats(p) {
  const out = {};
  const ps = p && p.passives;
  if (!ps || typeof ps !== 'object') return out;
  for (const id in ps) {
    const fn = PASSIVE_STATS[id];
    const lv = Math.max(0, ps[id] | 0);
    if (!fn || lv <= 0) continue;
    const add = fn(lv);
    for (const k in add) out[k] = (out[k] || 0) + add[k];
  }
  return out;
}

Object.assign(Game, {
  /* ---------------- 投点接口 ---------------- */
  passiveState() {
    const s = this.state;
    if (!s) return {};
    if (!s.passives || typeof s.passives !== 'object') s.passives = {};
    return s.passives;
  },

  passiveLv(id) {
    return this.passiveState()[id] || 0;
  },

  /* 已投总点数：skillPoints() 会扣这一笔（每级 1 点） */
  passiveSpent() {
    let n = 0;
    const ps = this.passiveState();
    for (const id in ps) n += Math.max(0, ps[id] || 0);
    return n;
  },

  /* 解锁等级 = 同岔口主动的领悟等级（数据层 skillPassiveInfo 推算） */
  passiveUnlocked(id) {
    const s = this.state;
    if (!s) return false;
    const info = (typeof skillPassiveInfo === 'function') ? skillPassiveInfo(id) : null;
    return s.level >= (info ? info.unlock : 1);
  },

  passiveUnlockLv(id) {
    const info = (typeof skillPassiveInfo === 'function') ? skillPassiveInfo(id) : null;
    return info ? info.unlock : 1;
  },

  passiveImplemented(id) {
    return PASSIVE_PENDING.indexOf(id) < 0;
  },

  levelUpPassive(id) {
    const def = SKILL_TREE.passives[id];
    if (!def) return { ok: false, msg: '被动不存在' };
    if (!this.passiveImplemented(id)) return { ok: false, msg: '「' + def.name + '」的增益尚未接入' };
    if (!this.passiveUnlocked(id)) return { ok: false, msg: def.name + ' 需 ' + this.passiveUnlockLv(id) + ' 级' };
    /* [P2] 岔口锁：第 3 个岔口起主动 ↔ 被动二选一，对面投过点就拦
     *（主动「投入」= 花过点 lv > 1，领悟送的 1 级不算） */
    if (typeof skillForkOf === 'function') {
      const fk = skillForkOf(id);
      if (fk && fk.lock && fk.side === 'passive'
        && ((this.skillState()[fk.active] || {}).lv || 1) > 1) {
        const nm = (SKILLS[fk.active] || {}).name || fk.active;
        return { ok: false, msg: '该岔口为二选一：「' + nm + '」已分配点数，需先退还' };
      }
    }
    const ps = this.passiveState();
    const cur = ps[id] || 0;
    const max = def.max || 1;
    if (cur >= max) return { ok: false, msg: def.name + ' 已满级' };
    if (this.skillPoints() <= 0) return { ok: false, msg: '技能点不足' };
    ps[id] = cur + 1;
    this.recalc();
    return { ok: true, msg: def.name + ' 升至 ' + (cur + 1) + ' 级' };
  },

  levelDownPassive(id) {
    const def = SKILL_TREE.passives[id];
    if (!def) return { ok: false, msg: '被动不存在' };
    const ps = this.passiveState();
    const cur = ps[id] || 0;
    if (cur <= 0) return { ok: false, msg: def.name + ' 尚未投点' };
    if (cur - 1 <= 0) delete ps[id];
    else ps[id] = cur - 1;
    this.recalc();
    return { ok: true, msg: def.name + ' 退至 ' + (cur - 1) + ' 级' };
  },

  /* ---------------- 战斗钩子（game.js 各一行调用） ---------------- */

  /* 条件增伤：damageEnemy 内的独立乘区，返回百分比（可为 0）。
   * 血性（自己 <50% 血）/ 绝对零度（目标被冻结）/ 剑魄（本图累计耗资源）。 */
  passiveDmgMul(e, opts) {
    const ps = this.passiveState();
    const s = this.state;
    let mul = 0;
    const bl = ps.w_bloodlust || 0;
    if (bl && s.hp > 0 && s.hp < s.stats.hpMax * 0.5) mul += 8 * bl;
    const ab = ps.m_absolute || 0;
    if (ab && ((e.slow || 0) > 0 || (e.slowT || 0) > 0)) mul += 35;
    const tt = ps.w_titan || 0;
    if (tt) mul += Math.min(30, (s.rageSpent || 0) * 0.4);
    return mul;
  },

  /* 受伤侧改写：damagePlayer 内乘上去，返回系数。
   * 霜甲只减「贴身来源」的伤害 —— 近战的判定就是打得着你的距离。 */
  passiveTakenMul(source) {
    const lv = this.passiveState().m_ward || 0;
    if (!lv || !source || !source.pos) return 1;
    const pp = this.playerGroup.position;
    if (DIST2D(source.pos, pp) >= 3.4) return 1;
    return 1 - 0.08 * lv;
  },

  /* 玩家负面状态时长（静心）：迟滞 / 中毒在施加点折算，−20%/级 */
  debuffDurOf(base) {
    const lv = this.passiveState().t_serene || 0;
    return base * (1 - 0.2 * lv);
  },

  passiveEmberMul() { return 1 + 0.1 * (this.passiveState().m_ember || 0); },   // 燃烬
  chainMul() { return 1 + 0.12 * (this.passiveState().m_conduct || 0); },       // 导电
  freezeMul() { return 1 + 0.15 * (this.passiveState().m_chill || 0); },        // 霜寒

  /* 剑魄记账：castSkill 每次扣资源都进来；换图 / 复活清零（rageSpent 在 state 上） */
  onMpSpent(cost) {
    const s = this.state;
    if (!s) return;
    s.rageSpent = (s.rageSpent || 0) + Math.max(0, cost || 0);
  },

  /* 周期触发：update() 帧循环里 tickBeh 旁边调用 */
  tickPassives(dt) {
    const s = this.state;
    if (!s || this.dead) return;
    const ps = this.passiveState();
    const pp = this.playerGroup.position;
    if ((this.undyingCd || 0) > 0) this.undyingCd -= dt;
    if ((s.passPhoenixCd || 0) > 0) s.passPhoenixCd -= dt;
    if (this.stormT === undefined) this.stormT = 6;
    if (this.talismanT === undefined) this.talismanT = 10;
    if (this.elixirT === undefined) this.elixirT = 60;

    /* 战意不灭：生命低于 30% 触发（增益本体走标准 buff 通道，90 秒内置冷却） */
    if ((ps.w_undying || 0) > 0 && (this.undyingCd || 0) <= 0
      && s.hp > 0 && s.hp < s.stats.hpMax * 0.3
      && !this.buffs.some(b => b.key === 'passive:w_undying')) {
      this.undyingCd = 90;
      this.addBuff('战意不灭', { dmgAll: 40, dmgReduce: 20, dur: 6 }, 0xff7a4a,
        { type: 'buff', icon: '怒', key: 'passive:w_undying', refresh: true, desc: '生命低于 30% 触发' });
      FX.text(new THREE.Vector3(pp.x, 2.9, pp.z), '战意不灭', 'info', { life: 1.1 });
      UI.log('战意不灭！伤害 +40%、减伤 20%', 'good');
      SFX.levelup();
      this.shake = Math.max(this.shake || 0, 0.35);
    }

    /* 雷神：每 6 秒对最近的敌人自动落雷（200% 攻击力） */
    if (ps.m_stormlord) {
      this.stormT -= dt;
      if (this.stormT <= 0) {
        this.stormT = 6;
        const e = this.nearestEnemy(new THREE.Vector3(pp.x, 0, pp.z), 14);
        if (e) {
          FX.beam(new THREE.Vector3(e.pos.x, 7, e.pos.z), new THREE.Vector3(e.pos.x, 0.8, e.pos.z), 0xb98cff, 0.2);
          const { dmg } = this.rollDamage(s.stats.atk * 2.0);
          this.damageEnemy(e, dmg, false, { tag: 'aoe', elem: 'lightning' });
          FX.text(new THREE.Vector3(e.pos.x, 2.6, e.pos.z), '雷神', 'info', { life: 0.7 });
          SFX.thunder();
        }
      }
    }

    /* 天师：每 10 秒聚一张护身符（最多存 1 张），抵挡一次伤害 */
    if (ps.t_heaven) {
      this.talismanT -= dt;
      if (this.talismanT <= 0) {
        this.talismanT = 10;
        if ((this.talismanCharges || 0) < 1) {
          this.talismanCharges = 1;
          UI.log('护身符已成（可挡一次伤害）');
          SFX.ui();
        }
      }
    }

    /* 九转还丹：每 60 秒自动服丹 —— 回 30% 生命并清除负面（迟滞 / 中毒） */
    if (ps.t_elixir) {
      this.elixirT -= dt;
      if (this.elixirT <= 0) {
        this.elixirT = 60;
        const hadDebuff = (this.playerSlowT || 0) > 0 || (this.poisonT || 0) > 0;
        if (s.hp < s.stats.hpMax || hadDebuff) {
          this.playerSlowT = 0; this.playerSlow = 0; this.poisonT = 0;
          this.healPlayer(s.stats.hpMax * 0.3);
          FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 3.2, 0x8affb0, 0.6, 0.3);
          FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '九转还丹', 'heal', { life: 1 });
          UI.log('九转还丹 · 自动服丹', 'good');
          SFX.heal();
        }
      }
    }

    /* 涅槃火球倒计时：2 秒后满血一半复活并向四周炸开 */
    if ((this.phoenixKeyT || 0) > 0) {
      this.phoenixKeyT -= dt;
      if (this.phoenixKeyT <= 0) {
        this.phoenixKeyT = 0;
        s.hp = Math.max(1, Math.round(s.stats.hpMax * 0.5));
        const c = new THREE.Vector3(pp.x, 0.2, pp.z);
        FX.ring(c, 5, 0xffa040, 0.8, 0.4);
        FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), 0xffa040, 34, { speed: 4.4, size: 0.14, life: 1, gravity: -2, additive: true });
        UI.log('涅槃 · 浴火重生！', 'good');
        SFX.levelup();
        this.shake = Math.max(this.shake || 0, 0.5);
        this.explodeAt(c, 4.5, s.stats.atk * 3, 0xffa040, false, true);
      }
    }
  }
});
