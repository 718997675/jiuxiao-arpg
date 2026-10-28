/* ============================================================
 * 数据层 · 技能树（v2.0 · P0）
 *
 * 这一版是「数据与骨架」：只加数据、不改玩法。
 * 所有内容挂在一个 SKILL_TREE 命名空间下，不动 SKILL_LV_MAX / variants
 * 等既有全局量 —— P0 期间战斗与存档行为与改之前完全一致。
 *
 * 结构：
 *   SKILL_TREE.tags       36 个技能的三类标签（元素 / 形态 / 效果）
 *   SKILL_TREE.branches   每个技能三条分支：精研(core) / 取向(pick×2) / 变体(form×3)
 *   SKILL_TREE.passives   被动与关键被动（每系 1 个关键被动，限 1 点）
 *   SKILL_TREE.layout     每职业的树骨架：主干(spine) + 岔口(forks)
 *   SKILL_TREE.icons      分支与关键被动的通用纹样（不出现汉字）
 *
 * 坐标不手写：由 layout 推出来（系序号 → 列，岔口序号 → 行），
 * 靠规则保证不重叠，加职业时不需要再画一遍坐标。
 *
 * 两种行为字段分开放：
 *   mods = 旧有的六通道（dmg / cd / cost / radius / count / dur），castSkill 直接消费
 *   beh  = 新的行为级改写（位移 / 资源 / 牵引…），P2 才接，P0 阶段不会被读到
 * 这样老代码读 mods 永远不会拿到不认识的东西。
 * ============================================================ */

const SKILL_TREE = {
  /* [P2] 等级上限 5 → 10，与 SKILL_LV_MAX 同源（两处写死必然有一处忘记改：
   * 面板写 5、接口放 10，玩家点不到满级还以为卡了）。
   * `lvStep` 已删 —— 每级加多少只有 skillLvMul() 一个口径。 */
  lvMax: (typeof SKILL_LV_MAX === 'number' ? SKILL_LV_MAX : 10),
  /* 分支解锁门槛与点数 */
  pickAt: 3,      // 精研到 3 级自动给；取向需技能 3 级
  formAt: 5,      // 变体需技能 5 级
  branchCost: { pick: 1, form: 1 },
  /* 变体（form）提前上线的打样名单：这些技能的 form 只要有一条能跑就先开，
   * 用来在铺满 36 技能之前把玩法（聚怪 / 不竭）跑通。
   * 【已清空】2026-10-25 P3 铺完 36 技能，全部三条都已接上 ——
   * 「有一条能用就开」这个后门从此不该再有人用，留着空数组是给判定留个位置。 */
  formEarly: [],
  /* 岔口锁（2026-10-25 拍板）：第 1、2 个岔口两边都能投；
   * 从第 3 个起主动 ↔ 被动二选一 —— 先退掉对面才能投这一边。
   * 只在「新的投点」上拦：老档两边都投了的不清洗（洗点 UI 落地后自然能理顺）。
   * 「投入」= 花过点：主动 lv > 1（领悟送的 1 级不算）、被动 lv > 0。 */
  forkLockAt: 3,
  /* 技能树洗点阶梯价（拍板）：800 → 2400 → 6000 → 1.5 万 → 3.5 万封顶。
   * 每洗一次往后走一档，超过表长按最后一档。 */
  respecFees: [800, 2400, 6000, 15000, 35000],

  /* ---------------------------------------------------------- */
  /* 三线并行（P0 新增，P1 才切面板）                             */
  /*                                                             */
  /* 旧模型是「spine 必点 + forks 主动/被动二选一」：早期点错一条   */
  /* 线整条构筑就锁死。新模型三条线同时开放，只有两种门：          */
  /*   · reqLv   角色等级门槛（到级就亮，不要求先点同线任何节点）   */
  /*   · needPts 该线已投入点数（只给关键被动用，软前置，5 点）     */
  /*                                                             */
  /* 数值不手写：reqLv 默认取同节点主动技能的 unlock（单一事实来源  */
  /* 还是 SKILLS），需要特殊门槛时在 layout 条目上写 reqLv 覆盖。   */
  /* 这样加技能不用同步改两处，也不会出现「面板写 Lv15、实际 Lv14」。*/
  /* ---------------------------------------------------------- */
  lineMeta: {
    softNeedPts: 5,          // 关键被动的软前置：该线已投 ≥5 点
    reqLvFrom: 'skill.unlock' // reqLv 的默认来源
  },

  /* ---------------------------------------------------------- */
  /* 一、标签（装备词缀按标签生效，BD 的另一半）                  */
  /* ---------------------------------------------------------- */
  tagKinds: {
    elem: { name: '元素', list: ['phys', 'fire', 'ice', 'thunder', 'poison', 'holy'] },
    form: { name: '形态', list: ['melee', 'ranged', 'aoe', 'dash', 'channel', 'summon', 'dot', 'buff', 'heal', 'shield'] },
    fx: { name: '效果', list: ['bleed', 'burn', 'freeze', 'chain', 'stun', 'pull', 'crit', 'resource'] }
  },

  tagName: {
    phys: '物理', fire: '火', ice: '冰', thunder: '雷', poison: '毒', holy: '圣',
    melee: '近战', ranged: '远程', aoe: '范围', dash: '位移', channel: '持续',
    summon: '召唤', dot: '持续伤害', buff: '增益', heal: '治疗', shield: '护盾',
    bleed: '流血', burn: '燃烧', freeze: '冻结', chain: '连锁', stun: '眩晕',
    pull: '聚怪', crit: '暴击', resource: '回资源'
  },

  tags: {
    /* ---- 刀客 ---- */
    whirl: ['phys', 'melee', 'aoe', 'resource'],
    thrust: ['fire', 'melee', 'dash', 'burn'],
    warcry: ['phys', 'buff', 'crit'],
    quake: ['phys', 'melee', 'aoe', 'stun'],
    leap: ['phys', 'melee', 'dash'],
    shieldwall: ['phys', 'buff', 'shield'],
    bloodrage: ['phys', 'buff', 'crit'],
    execute: ['phys', 'melee', 'crit'],
    avatar: ['phys', 'melee', 'aoe'],
    riposte: ['phys', 'buff', 'shield'],
    swordarray: ['phys', 'melee', 'aoe'],
    skysfall: ['phys', 'aoe', 'stun'],
    /* ---- 术士 ---- */
    fireball: ['fire', 'ranged', 'aoe', 'burn'],
    frostnova: ['ice', 'aoe', 'freeze'],
    chain: ['thunder', 'ranged', 'chain'],
    meteor: ['fire', 'ranged', 'aoe', 'burn'],
    iceshard: ['ice', 'ranged', 'freeze'],
    firewall: ['fire', 'aoe', 'dot', 'burn'],
    iceshield: ['ice', 'buff', 'shield'],
    blizzard: ['ice', 'aoe', 'dot', 'freeze'],
    starfall: ['thunder', 'aoe', 'dot'],
    thundercloud: ['thunder', 'aoe', 'dot', 'chain'],
    pyroclasm: ['fire', 'aoe', 'burn'],
    judgement: ['thunder', 'ranged', 'crit'],
    /* ---- 符师 ---- */
    talisman: ['thunder', 'ranged', 'chain'],
    summon: ['phys', 'summon'],
    heal: ['holy', 'heal', 'buff'],
    poison: ['poison', 'aoe', 'dot'],
    talismanarrow: ['phys', 'ranged', 'crit'],
    antidote: ['holy', 'buff', 'heal'],
    taiji: ['holy', 'buff', 'shield'],
    whitetiger: ['phys', 'summon', 'crit'],
    swordrain: ['phys', 'aoe', 'dot'],
    mastersigil: ['holy', 'aoe', 'dot'],
    azuredragon: ['thunder', 'summon', 'aoe'],
    revive: ['holy', 'heal', 'buff']
  },

  /* mods 只允许这六个通道（castSkill 的老通道） */
  modKeys: ['dmg', 'cd', 'cost', 'radius', 'count', 'dur'],

  /* beh 允许的键：P2 才消费，这里先列白名单防止写错名字静默失效。
   * 这张表是手写的、不是从 branches 反推出来的 —— 反推的话写错名字就查不出来了。
   * 新增行为时必须同时加到这里，测试会拦住漏加。 */
  behKeys: [
    'afterBuff', 'afterDebuff', 'aftershock', 'aftershockPct', 'allyBuff',
    'antiHeal', 'armorPct', 'aspd', 'aspdDown', 'aura',
    'autoTrigger', 'autoWhirl', 'bash', 'bounce', 'bouncePct',
    'breakNova', 'breath', 'burnDur', 'burnPct', 'cdCancel',
    'cdr', 'chain', 'chainPct', 'channel', 'chill',
    'cleanse', 'corpseBlast', 'counter', 'crit', 'critDmg',
    'critDur', 'critHeal', 'deathHeal', 'detonate', 'drPct',
    'drain', 'dur', 'echo', 'endBurst', 'endHpCost', 'exec',
    'execCrit', 'fear', 'follow', 'freeze', 'freezeEvery',
    'freezeSelf', 'gather', 'gatherDur', 'gatherEvery', 'grow', 'hot', 'hotPct', 'hpCost',
    'immune', 'immuneDur', 'killExtend', 'killHeal', 'knock',
    'maxExtend', 'mine', 'minePct', 'move', 'moveDur', 'moveEvery', 'movePct', 'moveSpd',
    'noDR', 'noSlow', 'orbit', 'pairTiger', 'passive', 'pin',
    'pierce', 'pull', 'rageBonus3', 'ragePerHit', 'rain',
    'ramp', 'recharge', 'reflect', 'regen', 'repeat',
    'resetOnKill', 'ring', 'root', 'selfCast', 'shieldMul',
    'shred', 'shredArmor', 'shredMax', 'size', 'slow',
    'slowDur', 'spread', 'stack', 'stackMax', 'stun',
    'tagAdd', 'taunt', 'tick', 'ticks', 'trail',
    'trailPct', 'transform', 'vsBoss', 'vsFrozen', 'vuln',
    'zone'
  ],

  /* ---------------------------------------------------------- */
  /* 二、三条分支                                                */
  /*   core = [名, 说明, 效果]           技能 3 级自动给，不花点   */
  /*   pick = [[名, 说明, 效果], …(2)]   二选一，各 1 点           */
  /*   form = [[名, 说明, 效果], …(3)]   三选一，1 点              */
  /* 效果 = { mods?: 六通道, beh?: 行为, cond?: 解锁前提 }         */
  /* ---------------------------------------------------------- */
  branches: {
    /* ==================== 刀客 ==================== */
    whirl: {
      core: ['回流', '每命中一个敌人回复 1 点怒气；一次命中 3 人以上额外 +1', { beh: { ragePerHit: 1, rageBonus3: 1 } }],
      pick: [
        ['破浪', '伤害 +30%，消耗 +20%', { mods: { dmg: 30, cost: 20 } }],
        ['饮血', '附加流血；流血目标死亡时引爆其剩余伤害的 30%', { mods: { dmg: 10 }, beh: { tagAdd: 'bleed', detonate: 30 } }]
      ],
      form: [
        ['疾风', '改为一发变一段：旋转 2 秒，每 0.5 秒对身边补 35% 伤害，期间可移动；移速 −20%，伤害 −15%',
          { mods: { dmg: -15 }, beh: { move: true, moveDur: 2, moveEvery: 0.5, movePct: 35, moveSpd: -20 } }],
        ['不竭', '取消冷却，改为每秒消耗 6 点怒气；怒气上限 ≥80 才解锁', { beh: { cdCancel: true, drain: 6 }, cond: { rageMax: 80 } }],
        ['聚怪', '每 0.5 秒把 4 码内敌人拉近；伤害 −25%', { mods: { dmg: -25 }, beh: { gather: 4, gatherDur: 2, gatherEvery: 0.5 } }]
      ]
    },
    thrust: {
      core: ['余焰', '突进路径留下 2 秒火焰，每秒 30% 伤害', { beh: { trail: 2, trailPct: 30 } }],
      pick: [
        ['烈锋', '伤害 +35%', { mods: { dmg: 35 } }],
        ['穿透', '不再被敌人挡下，可穿过多批目标；范围 +20%', { mods: { radius: 20 }, beh: { pierce: true } }]
      ],
      form: [
        ['连环', '冷却 −45%，伤害 −35%', { mods: { cd: 45, dmg: -35 } }],
        ['冲锋', '距离 +40%，撞飞并击退 6 码', { mods: { radius: 40 }, beh: { knock: 6 } }],
        ['炎爆', '到达终点时爆炸，并点燃敌人 3 秒（每秒 30% 火焰伤害）；范围 +50%、伤害 +20%', { mods: { radius: 50, dmg: 20 }, beh: { burnPct: 30, burnDur: 3 } }]
      ]
    },
    warcry: {
      core: ['战鼓', '增益期间每次击杀延长 1 秒，最多 +4 秒', { beh: { killExtend: 1, maxExtend: 4 } }],
      pick: [
        ['狂怒', '增益效果 +40%', { mods: { dmg: 40 } }],
        ['坚壁', '改为护甲 +50%、受到伤害 −15%', { beh: { armorPct: 50, drPct: 15 } }]
      ],
      form: [
        ['长啸', '持续 +6 秒，冷却 +20%', { mods: { dur: 6, cd: -20 } }],
        ['疾风', '期间移速 +25%，攻速再 +25%', { beh: { moveSpd: 25, aspd: 25 } }],
        ['死战', '期间受到伤害 −25%，移速 −15%', { beh: { drPct: 25, moveSpd: -15, dur: 8 } }]
      ]
    },
    quake: {
      core: ['余震', '落点留下 2 秒地裂，每秒造成 40% 伤害', { beh: { aftershock: 2, aftershockPct: 40 } }],
      pick: [
        ['镇岳', '伤害 +35%，范围 −10%', { mods: { dmg: 35, radius: -10 } }],
        ['陷地', '击晕延长至 2.6 秒；被击晕的目标受到伤害 +15%', { beh: { stun: 2.6, vuln: 15 } }]
      ],
      form: [
        ['三连震', '改为三段快速震击，每段 45% 伤害', { mods: { dmg: -55 }, beh: { repeat: 3 } }],
        ['追地', '改为在脚下爆发，范围 +40%、冷却 −25%', { mods: { radius: 40, cd: 25 }, beh: { selfCast: true } }],
        ['地心', '冷却 +40%，伤害 +80%、范围 +25%', { mods: { cd: -40, dmg: 80, radius: 25 } }]
      ]
    },
    leap: {
      core: ['落地冲击', '落点 3 码内敌人被击退 2 码', { beh: { knock: 2 } }],
      pick: [
        ['崩山', '伤害 +30%', { mods: { dmg: 30 } }],
        ['余震', '落点留下 2 秒裂地，每秒 35% 伤害', { beh: { aftershock: 2, aftershockPct: 35 } }]
      ],
      form: [
        ['连跃', '3 秒内可再跃一次，伤害 −25%', { mods: { dmg: -25 }, beh: { recharge: 2 } }],
        ['高跃', '距离 +60%，冷却 +15%', { mods: { radius: 60, cd: -15 } }],
        ['泰山', '改为原地重砸（不再突进），震晕 1 秒；范围 +45%、伤害 +40%', { mods: { radius: 45, dmg: 40 }, beh: { selfCast: true, stun: 1 } }]
      ]
    },
    shieldwall: {
      core: ['铁壁', '期间受到伤害额外 −10%', { beh: { drPct: 10 } }],
      pick: [
        ['反震', '格挡时对攻击者反弹 60% 伤害', { beh: { reflect: 60 } }],
        ['厚甲', '护盾值 +45%', { mods: { dmg: 45 } }]
      ],
      form: [
        ['不动', '期间无法移动，但护甲再 +80%', { beh: { root: true, armorPct: 80, dur: 10 } }],
        ['冲撞', '期间可撞飞接触到的敌人', { beh: { bash: true } }],
        ['坚壁', '格挡后立刻反打 80% 攻击力', { beh: { counter: 80 } }]
      ]
    },
    bloodrage: {
      core: ['嗜血', '期间暴击回复 1.5% 生命', { beh: { critHeal: 15 } }],
      pick: [
        ['久战', '持续 +5 秒', { mods: { dur: 5 } }],
        ['狂血', '暴击率再 +15%，暴击伤害 −20%', { beh: { crit: 15, critDmg: -20 } }]
      ],
      form: [
        ['血偿', '消耗改为 12% 当前生命，增益 +60%', { mods: { dmg: 60 }, beh: { hpCost: 12 } }],
        ['无我', '期间免疫控制，冷却 +25%', { mods: { cd: -25 }, beh: { immune: true } }],
        ['战意', '改为常驻 +8%，最多叠 5 层，死亡清空', { beh: { stack: 8, stackMax: 5 } }]
      ]
    },
    execute: {
      core: ['处决', '目标生命低于 30% 时必定暴击', { beh: { execCrit: true } }],
      pick: [
        ['断首', '击杀后立即重置冷却', { beh: { resetOnKill: true } }],
        ['夺命', '伤害 +28%', { mods: { dmg: 28 } }]
      ],
      form: [
        ['重斩', '冷却 +60%，伤害 +110%；对 30% 血以下目标追加 60% 伤害', { mods: { cd: -60, dmg: 110 }, beh: { exec: 60 } }],
        ['连斩', '改为三段，每段 40% 伤害', { mods: { dmg: -60 }, beh: { repeat: 3 } }],
        ['闪斩', '改为短距突进斩杀，范围 +100%', { mods: { radius: 100 } }]
      ]
    },
    avatar: {
      core: ['神临', '变身期间免疫控制', { beh: { immune: true } }],
      pick: [
        ['斩天', '伤害 +35%', { mods: { dmg: 35 } }],
        ['剑牢', '变身期间每 2 秒自动释放一次旋风斩', { beh: { autoWhirl: 2 } }]
      ],
      form: [
        ['久临', '持续 +8 秒，冷却 +30%', { mods: { dur: 8, cd: -30 } }],
        ['双剑', '攻速 +40%，单次伤害 −25%', { mods: { dmg: -25 }, beh: { aspd: 40 } }],
        ['献祭', '结束时扣 30% 生命，伤害 +90%', { mods: { dmg: 90 }, beh: { endHpCost: 30 } }]
      ]
    },
    riposte: {
      core: ['蓄势', '每次格挡叠 1 层，每层伤害 +4%', { beh: { stack: 4, stackMax: 5 } }],
      pick: [
        ['铁壁', '期间受到伤害 −20%', { beh: { drPct: 20 } }],
        ['反斩', '格挡后立刻回击 80% 攻击力', { beh: { counter: 80 } }]
      ],
      form: [
        ['常驻', '改为被动常驻，效果减半', { beh: { passive: true } }],
        ['狂反', '格挡后 3 秒内暴击率 +30%', { beh: { crit: 30, critDur: 3 } }],
        ['舍身', '不再减伤，格挡后伤害 +150%', { beh: { noDR: true } }]
      ]
    },
    swordarray: {
      core: ['剑鸣', '阵内敌人每秒受到 20% 伤害', { beh: { tick: 20 } }],
      pick: [
        ['扩阵', '范围 +40%', { mods: { radius: 40 } }],
        ['凝剑', '伤害 +35%，范围 −15%', { mods: { dmg: 35, radius: -15 } }]
      ],
      form: [
        ['钉阵', '基础剑阵随施法者移动；此变体固定于落点，范围 +45%、每跳伤害 +35%',
          { mods: { radius: 45, dmg: 35 }, beh: { pin: true } }],
        ['雷阵', '附加雷击，每次连锁 2 个目标', { beh: { chain: 2, tagAdd: 'thunder' } }],
        ['血阵', '阵内敌人持续流血', { beh: { tagAdd: 'bleed' } }]
      ]
    },
    skysfall: {
      core: ['天威', '命中后 3 秒内敌人受到伤害 +12%', { beh: { vuln: 12 } }],
      pick: [
        ['裂空', '范围 +35%', { mods: { radius: 35 } }],
        ['崩山', '伤害 +40%', { mods: { dmg: 40 } }]
      ],
      form: [
        ['陨石雨', '改为 5 枚小陨石，每枚 45% 伤害', { mods: { count: 4, dmg: -55 } }],
        ['天罚', '冷却 +50%，伤害 +120%；每次震击附带麻痹 0.8 秒', { mods: { cd: -50, dmg: 120 }, beh: { stun: 0.8 } }],
        ['引雷', '落点持续 4 秒落雷', { beh: { zone: 4, tagAdd: 'thunder' } }]
      ]
    },

    /* ==================== 术士 ==================== */
    fireball: {
      core: ['爆燃', '命中后 2 秒内每秒额外造成 25% 伤害', { beh: { burnPct: 25, burnDur: 2 } }],
      pick: [
        ['连锁', '爆炸会弹向 2 码内最近的另一个敌人，造成 50% 伤害', { beh: { bounce: 1, bouncePct: 50 } }],
        ['集束', '改为贯穿弹，直线穿透所有敌人，伤害 −20%', { mods: { dmg: -20 }, beh: { pierce: true } }]
      ],
      form: [
        ['三连', '一次掷出 3 枚，单枚 55% 伤害', { mods: { count: 2, dmg: -45 } }],
        ['大炎', '冷却 +30%，伤害 +90%、爆炸范围 +30%；命中后燃烧 3 秒（每秒 35% 火焰伤害）', { mods: { cd: -30, dmg: 90, radius: 30 }, beh: { burnPct: 35, burnDur: 3 } }],
        ['省力', '取消灵力消耗，改为每次扣 1.2% 最大生命', { beh: { hpCost: 1.2 } }]
      ]
    },
    frostnova: {
      core: ['霜结', '命中者减速 35%，持续 2 秒', { beh: { slow: 35, slowDur: 2 } }],
      pick: [
        ['冻原', '范围 +30%', { mods: { radius: 30 } }],
        ['极寒', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['冰环', '改为自身周围爆发，范围 +50%、冷却 +25%', { mods: { radius: 50, cd: -25 }, beh: { selfCast: true } }],
        ['碎冰', '对被冻结目标伤害 +70%', { beh: { vsFrozen: 70 } }],
        ['霜爆', '1.5 秒后原地再爆一次，造成 55% 伤害', { beh: { aftershock: 1.5, aftershockPct: 55 } }]
      ]
    },
    chain: {
      core: ['传导', '每多跳一个目标，伤害 +8%', { beh: { chainPct: 8 } }],
      pick: [
        ['多链', '跳跃数 +2', { mods: { count: 2 } }],
        ['聚雷', '伤害 +30%，跳跃数 −1', { mods: { dmg: 30, count: -1 } }]
      ],
      form: [
        ['雷网', '改为在目标处展开 3 秒雷网，持续伤害', { beh: { zone: 3, tagAdd: 'dot' } }],
        ['引电', '对被冻结的目标跳跃数 +3', { beh: { chain: 3 } }],
        ['天罚', '改为单体落雷，伤害 +180%、冷却 +50%', { mods: { dmg: 180, cd: -50 } }]
      ]
    },
    meteor: {
      core: ['灼地', '落点燃烧 3 秒，每秒 30% 伤害', { beh: { burnPct: 30, burnDur: 3 } }],
      pick: [
        ['巨陨', '范围 +35%', { mods: { radius: 35 } }],
        ['陨核', '伤害 +35%', { mods: { dmg: 35 } }]
      ],
      form: [
        ['陨雨', '改为 4 枚小陨石，每枚 45% 伤害', { mods: { count: 3, dmg: -55 } }],
        ['定向', '取消落地延迟，伤害 −20%', { mods: { dmg: -20 }, beh: { selfCast: true } }],
        ['熔心', '冷却 +60%，伤害 +130%；落点留下火坑，燃烧 3 秒（每秒 40% 火焰伤害）', { mods: { cd: -60, dmg: 130 }, beh: { burnPct: 40, burnDur: 3 } }]
      ]
    },
    iceshard: {
      core: ['寒意', '命中叠 1 层寒意，满 3 层冻结 1.2 秒', { beh: { chill: 3, freeze: 1.2 } }],
      pick: [
        ['霜刃', '伤害 +28%', { mods: { dmg: 28 } }],
        ['碎冰', '对被冻结目标伤害 +45%，不再减速', { beh: { vsFrozen: 45, noSlow: true } }]
      ],
      form: [
        ['扇射', '改为 7 枚扇形，单枚 45% 伤害', { mods: { count: 4, dmg: -55 } }],
        ['冰枪', '改为单枚贯穿冰枪，伤害 +60%、冷却 +20%', { mods: { dmg: 60, cd: -20 }, beh: { pierce: true } }],
        ['环刺', '改为环绕自身八向发射', { mods: { count: 5, dmg: -40 }, beh: { ring: 8 } }]
      ]
    },
    firewall: {
      core: ['蔓延', '火墙每秒向两侧各延长 1 码，最多 +4 码', { beh: { grow: 4 } }],
      pick: [
        ['延垣', '长度 +40%', { mods: { radius: 40 } }],
        ['烈墙', '伤害 +35%', { mods: { dmg: 35 } }]
      ],
      form: [
        ['围火', '改为环绕自身的火圈', { mods: { radius: 30 }, beh: { ring: 6 } }],
        ['追随', '火墙跟随自身移动', { beh: { follow: true } }],
        ['爆燃', '结束时爆炸，造成 120% 伤害', { beh: { endBurst: 120 } }]
      ]
    },
    iceshield: {
      core: ['霜甲', '被近战攻击时对攻击者反伤 40% 并减速', { beh: { reflect: 40, slow: 30 } }],
      pick: [
        ['厚冰', '护盾值 +40%', { mods: { dmg: 40 } }],
        ['冰刺', '破盾时向四周射出 6 枚冰锥', { beh: { breakNova: 6 } }]
      ],
      form: [
        ['冰牢', '改为冰封自身 1.5 秒免疫伤害，冷却 −40%', { mods: { cd: 40 }, beh: { freezeSelf: 1.5 } }],
        ['冰甲', '护盾期间把承受伤害的 60% 反弹给攻击者', { beh: { reflect: 60, dur: 10 } }],
        ['永冻', '持续 +6 秒，护盾值 −25%', { mods: { dur: 6, dmg: -25 } }]
      ]
    },
    blizzard: {
      core: ['深寒', '区域内敌人移速 −30%、攻速 −20%', { beh: { slow: 30, aspdDown: 20 } }],
      pick: [
        ['广域', '范围 +35%', { mods: { radius: 35 } }],
        ['冰雹', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['暴风', '暴雪跟随自身移动', { beh: { follow: true } }],
        ['冰封', '区域内每 3 秒冻结 1 秒', { beh: { freeze: 1, freezeEvery: 3 } }],
        ['极寒', '冷却 +50%，范围 +70%、伤害 +60%', { mods: { cd: -50, radius: 70, dmg: 60 } }]
      ]
    },
    starfall: {
      core: ['星痕', '每颗陨星落点留下 2 秒光圈，每秒 25% 伤害', { beh: { zone: 2 } }],
      pick: [
        ['流火', '陨星数 +4', { mods: { count: 4 } }],
        ['巨星', '伤害 +35%', { mods: { dmg: 35 } }]
      ],
      form: [
        ['星陨', '改为单颗巨型陨星，伤害 +200%、冷却 +40%', { mods: { dmg: 200, cd: -40, count: -4 } }],
        ['星移', '改为可引导 4 秒的移动陨星', { beh: { channel: 4 } }],
        ['星缚', '命中冻结 1.5 秒', { beh: { freeze: 1.5 } }]
      ]
    },
    thundercloud: {
      core: ['蓄电', '每停留 1 秒，落雷频率 +15%', { beh: { ramp: 15 } }],
      pick: [
        ['广云', '范围 +35%', { mods: { radius: 35 } }],
        ['炸雷', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['随身', '雷云跟随自身移动', { beh: { follow: true } }],
        ['引雷', '优先劈向被冻结目标，对其伤害 +80%', { beh: { vsFrozen: 80 } }],
        ['静电场', '改为给自身附加雷电增伤光环', { beh: { aura: 20, tagAdd: 'thunder' } }]
      ]
    },
    pyroclasm: {
      core: ['余烬', '命中区域燃烧 4 秒，每秒 20% 伤害', { beh: { burnPct: 20, burnDur: 4 } }],
      pick: [
        ['炽焰', '范围 +30%', { mods: { radius: 30 } }],
        ['熔岩', '伤害 +35%', { mods: { dmg: 35 } }]
      ],
      form: [
        ['火焰新星', '改为三段连续爆发，每段 40% 伤害', { mods: { dmg: -60 }, beh: { repeat: 3 } }],
        ['献祭', '消耗改为 20% 生命，伤害 +80%', { mods: { dmg: 80 }, beh: { hpCost: 20 } }],
        ['燎原', '击杀时在尸体处再爆一次', { beh: { corpseBlast: true } }]
      ]
    },
    judgement: {
      core: ['判罪', '目标生命越低伤害越高，最多 +80%', { beh: { exec: 80 } }],
      pick: [
        ['天罚', '伤害 +35%', { mods: { dmg: 35 } }],
        ['疾罚', '冷却 −25%', { mods: { cd: 25 } }]
      ],
      form: [
        ['雷柱', '改为可引导 3 秒的雷柱', { beh: { channel: 3 } }],
        ['连锁罚', '命中后向 2 个目标跳跃，造成 60% 伤害', { beh: { chain: 2, chainPct: 60 } }],
        ['终审', '冷却 +50%，伤害 +150%，对首领再 +50%', { mods: { cd: -50, dmg: 150 }, beh: { vsBoss: 50 } }]
      ]
    },

    /* ==================== 符师 ==================== */
    talisman: {
      core: ['符引', '命中后下一次该技能伤害 +20%，最多叠 3 层', { beh: { stack: 20, stackMax: 3 } }],
      pick: [
        ['连符', '跳跃数 +1', { mods: { count: 1 } }],
        ['天雷', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['符阵', '改为在目标脚下布置 3 秒雷符阵', { beh: { zone: 3 } }],
        ['三符齐发', '一次 3 张，每张 55% 伤害', { mods: { count: 2, dmg: -45 } }],
        ['引雷入体', '消耗改为 8% 生命，伤害 +90%', { mods: { dmg: 90 }, beh: { hpCost: 8 } }]
      ]
    },
    summon: {
      core: ['同心', '灵兽每 8 秒嘲讽一次周围敌人', { beh: { taunt: 8 } }],
      pick: [
        ['凶兽', '灵兽伤害 +30%', { mods: { dmg: 30 } }],
        ['护主', '灵兽死亡时回复自身 12% 生命', { beh: { deathHeal: 12 } }]
      ],
      form: [
        ['双生', '同时召唤 2 只，每只 65% 伤害', { mods: { count: 1, dmg: -35 } }],
        ['兽王', '体型与伤害 +50%，持续 +8 秒', { mods: { dmg: 50, dur: 8 }, beh: { size: 50 } }],
        ['血饲', '召唤时消耗 15% 生命，灵兽伤害 +90%', { mods: { dmg: 90 }, beh: { hpCost: 15 } }]
      ]
    },
    heal: {
      core: ['余春', '治疗后 4 秒内每秒再回复 25%', { beh: { hot: 4, hotPct: 25 } }],
      pick: [
        ['广济', '同时治疗灵兽与队友', { beh: { allyBuff: true } }],
        ['厚生', '治疗量 +35%', { mods: { dmg: 35 } }]
      ],
      form: [
        ['春霖', '改为地面 4 秒治疗区域', { beh: { zone: 4 } }],
        ['血偿', '治疗量 +80%，消耗改为 12% 生命', { mods: { dmg: 80 }, beh: { hpCost: 12 } }],
        ['回春诀', '冷却 −40%，治疗量 −25%', { mods: { cd: 40, dmg: -25 } }]
      ]
    },
    poison: {
      core: ['蚀甲', '雾内敌人护甲 −20%', { beh: { shredArmor: 20 } }],
      pick: [
        ['广毒', '范围 +35%', { mods: { radius: 35 } }],
        ['毒海', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['尸毒', '雾内敌人死亡时留下一片新毒雾', { beh: { spread: true } }],
        ['追随', '毒雾跟随自身移动', { beh: { follow: true } }],
        ['化脓', '冷却 +40%，伤害 +90%', { mods: { cd: -40, dmg: 90 } }]
      ]
    },
    talismanarrow: {
      core: ['追魂', '符箭追踪目标，命中后 25% 概率再生成一枚', { beh: { echo: 25 } }],
      pick: [
        ['贯日', '伤害 +25%', { mods: { dmg: 25 } }],
        ['破法', '命中降低目标抗性 10%，最多叠 3 层', { beh: { shred: 10, shredMax: 3 } }]
      ],
      form: [
        ['符雨', '改为向天上射出，落下 10 枚随机符', { mods: { dmg: -30 }, beh: { rain: 10 } }],
        ['二连射', '改为两次齐射，每次 60% 伤害', { mods: { count: 3, dmg: -40 } }],
        ['引雷', '落地后留下雷印，2 秒后炸裂 80% 伤害', { beh: { mine: 2, minePct: 80 } }]
      ]
    },
    antidote: {
      core: ['净心', '清除所有负面，并在 3 秒内免疫', { beh: { cleanse: true, immuneDur: 3 } }],
      pick: [
        ['固元', '期间受到伤害 −15%', { beh: { drPct: 15 } }],
        ['养神', '期间回灵速度 +50%', { beh: { regen: 50 } }]
      ],
      form: [
        ['静心', '改为每 20 秒自动触发的常驻被动', { mods: { cd: -20 }, beh: { passive: true } }],
        ['舍身', '药力全部转移给灵兽：灵兽伤害 +80%、回复 8% 生命；施法者损失 8% 生命', { beh: { allyBuff: { dmg: 80, life: 8 }, hpCost: 8 } }],
        ['灵台', '期间技能冷却 −20%', { beh: { cdr: 20 } }]
      ]
    },
    taiji: {
      core: ['阴阳', '阵内敌人受到伤害 +10%，自身受到伤害 −10%', { beh: { vuln: 10, drPct: 10 } }],
      pick: [
        ['扩阵', '范围 +35%', { mods: { radius: 35 } }],
        ['太极', '减伤再 +15%', { beh: { drPct: 15 } }]
      ],
      form: [
        ['绵劲', '基础减伤之上，期间受到伤害再减 20%、移速 +20%', { beh: { drPct: 20, moveSpd: 20 } }],
        ['两仪', '阵内敌人被持续推开', { beh: { knock: 3 } }],
        ['无极', '冷却 +50%，持续 +8 秒、减伤再 +20%', { mods: { cd: -50, dur: 8 }, beh: { drPct: 20 } }]
      ]
    },
    whitetiger: {
      core: ['虎啸', '每次攻击 25% 概率使目标恐惧 1 秒', { beh: { fear: 25 } }],
      pick: [
        ['虎威', '白虎伤害 +30%', { mods: { dmg: 30 } }],
        ['护主', '白虎死亡时回复自身 15% 生命', { beh: { deathHeal: 15 } }]
      ],
      form: [
        ['双虎', '同时 2 只，每只 65% 伤害', { mods: { count: 1, dmg: -35 } }],
        ['虎王', '体型与伤害 +50%，持续 +8 秒', { mods: { dmg: 50, dur: 8 }, beh: { size: 50 } }],
        ['噬魂', '每次击杀回复自身 4% 生命', { beh: { killHeal: 4 } }]
      ]
    },
    swordrain: {
      core: ['剑意', '每柄剑命中叠 1 层剑意，每层伤害 +3%', { beh: { stack: 3, stackMax: 10 } }],
      pick: [
        ['千锋', '剑数 +6', { mods: { count: 6 } }],
        ['独尊', '伤害 +40%', { mods: { dmg: 40 } }]
      ],
      form: [
        ['剑雨', '改为从天空落下，范围 +50%', { mods: { radius: 50 } }],
        ['御剑', '改为环绕自身 5 秒的剑阵', { beh: { orbit: 5 } }],
        ['剑心', '冷却 +50%，伤害 +110%；落剑期间自身暴击率 +25%（4 秒）', { mods: { cd: -50, dmg: 110 }, beh: { crit: 25, dur: 4 } }]
      ]
    },
    mastersigil: {
      core: ['镇魂', '阵内敌人受到的治疗 −50%', { beh: { antiHeal: 50 } }],
      pick: [
        ['广印', '范围 +35%', { mods: { radius: 35 } }],
        ['法威', '伤害 +30%', { mods: { dmg: 30 } }]
      ],
      form: [
        ['贴身印', '改为贴在目标身上并跟随', { beh: { follow: true } }],
        ['五雷印', '附加雷击，每秒落一次', { beh: { ticks: 1, tagAdd: 'thunder' } }],
        ['天师敕令', '冷却 +60%，伤害 +120%、范围 +40%', { mods: { cd: -60, dmg: 120, radius: 40 } }]
      ]
    },
    azuredragon: {
      core: ['龙威', '青龙在场时自身伤害 +10%', { beh: { aura: 10 } }],
      pick: [
        ['真龙', '青龙伤害 +30%', { mods: { dmg: 30 } }],
        ['龙息', '每 6 秒喷吐一次范围伤害', { beh: { breath: 6 } }]
      ],
      form: [
        ['双龙', '青龙与白虎同时在场，各 −25% 伤害', { mods: { dmg: -25 }, beh: { pairTiger: true } }],
        ['龙神', '体型与伤害 +60%，持续 +10 秒', { mods: { dmg: 60, dur: 10 } }],
        ['化龙', '改为自身化龙 5 秒，近战范围伤害', { beh: { transform: 5 } }]
      ]
    },
    revive: {
      core: ['回魂', '复活后 3 秒内免疫伤害', { beh: { immuneDur: 3 } }],
      pick: [
        ['厚魂', '复活回复生命 +30%', { mods: { dmg: 30 } }],
        ['速魂', '冷却 −35%', { mods: { cd: 35 } }]
      ],
      form: [
        ['替身', '改为受到致命伤时自动触发，冷却 +100%', { mods: { cd: -100 }, beh: { autoTrigger: true } }],
        ['收魂', '复活时灵兽回复 8% 生命、伤害 +20%', { beh: { allyBuff: { life: 8, dmg: 20 } } }],
        ['逆命', '复活后 8 秒内伤害 +60%，之后 5 秒 −20%', { beh: { afterBuff: 60, afterDebuff: 20 } }]
      ]
    }
  },

  /* ---------------------------------------------------------- */
  /* 三、被动与关键被动                                          */
  /*   key: true 表示关键被动（每系限 1 个，最多 1 点）            */
  /* ---------------------------------------------------------- */
  passives: {
    /* 刀客 · 狂战 */
    w_bloodlust: { name: '血性', desc: '生命低于 50% 时伤害 +8%/级', max: 3, icon: 'passive' },
    w_fero: { name: '狂怒', desc: '暴击伤害 +12%/级', max: 3, icon: 'passive' },
    w_undying: { name: '战意不灭', desc: '生命低于 30% 时伤害 +40%、减伤 20%，持续 6 秒（每 90 秒一次）', max: 1, key: true, icon: 'key' },
    /* 刀客 · 守护 */
    w_iron: { name: '铁骨', desc: '护甲 +10%/级', max: 3, icon: 'passive' },
    w_bastion: { name: '不动如山', desc: '受到伤害 −25%，但移速 −10%', max: 1, key: true, icon: 'key' },
    /* 刀客 · 破军 */
    w_heavy: { name: '重击', desc: '范围伤害 +8%/级', max: 3, icon: 'passive' },
    w_sunder: { name: '破甲', desc: '攻击无视 6% 护甲/级', max: 3, icon: 'passive' },
    w_ruin: { name: '摧枯', desc: '对生命低于 30% 的目标伤害 +12%/级', max: 3, icon: 'passive' },
    w_titan: { name: '剑魄', desc: '每消耗 1 点怒气伤害 +0.4%，上限 +30%', max: 1, key: true, icon: 'key' },
    /* 术士 · 烈火 */
    m_ember: { name: '燃烬', desc: '燃烧伤害 +10%/级', max: 3, icon: 'passive' },
    m_focus: { name: '专注', desc: '冷却 −6%/级，施法不被打断', max: 3, icon: 'passive' },
    m_phoenix: { name: '涅槃', desc: '受到致命伤时化为火球，2 秒后复活并造成范围伤害（每 120 秒）', max: 1, key: true, icon: 'key' },
    /* 术士 · 寒冰 */
    m_chill: { name: '霜寒', desc: '冻结持续时间 +15%/级', max: 3, icon: 'passive' },
    m_ward: { name: '霜甲', desc: '受到近战伤害 −8%/级', max: 3, icon: 'passive' },
    m_absolute: { name: '绝对零度', desc: '对冻结目标伤害 +35%，且冻结结束不再碎冰', max: 1, key: true, icon: 'key' },
    /* 术士 · 雷霆 */
    m_volt: { name: '高压', desc: '雷电伤害 +10%/级', max: 3, icon: 'passive' },
    m_conduct: { name: '导电', desc: '连锁伤害 +12%/级', max: 3, icon: 'passive' },
    m_stormlord: { name: '雷神', desc: '每 6 秒自动对最近的敌人落雷，造成 200% 伤害', max: 1, key: true, icon: 'key' },
    /* 符师 · 符箓 */
    t_sigil: { name: '符力', desc: '符法伤害 +9%/级', max: 3, icon: 'passive' },
    t_quick: { name: '急咒', desc: '施法速度 +10%/级', max: 3, icon: 'passive' },
    t_heaven: { name: '天师', desc: '每 10 秒获得一张护身符，抵挡一次伤害', max: 1, key: true, icon: 'key' },
    /* 符师 · 召唤 */
    t_bond: { name: '通灵', desc: '灵兽伤害 +10%/级', max: 3, icon: 'passive' },
    /* 名字不能叫「万兽」：召唤系天赋里已经有一个「万兽」节点（一次召 2 头），
     * 同名两个不同效果，玩家会以为点了天赋就该有这个被动。改叫兽契。 */
    t_beast: { name: '兽契', desc: '场上灵兽上限 +1；灵兽阵亡时 30% 概率当场重召', max: 1, key: true, icon: 'key' },
    /* 符师 · 丹道 */
    t_merid: { name: '脉络', desc: '治疗量 +10%/级', max: 3, icon: 'passive' },
    t_toxin: { name: '毒经', desc: '毒伤害 +12%/级', max: 3, icon: 'passive' },
    t_serene: { name: '静心', desc: '负面状态持续时间 −20%/级', max: 3, icon: 'passive' },
    t_elixir: { name: '九转还丹', desc: '每 60 秒自动服丹，回复 30% 生命并清除负面', max: 1, key: true, icon: 'key' }
  },

  /* ---------------------------------------------------------- */
  /* 四、树骨架                                                   */
  /*   spine = 该系的入门主动（必点，不参与岔口）                  */
  /*   forks = 其余主动，每个与一个被动/关键被动二选一             */
  /*   forks 的被动侧最后一个固定是关键被动                       */
  /* ---------------------------------------------------------- */
  layout: {
    warrior: [
      { name: '狂战', spine: 'whirl', forks: [
        { active: 'thrust', passive: 'w_bloodlust' },
        { active: 'bloodrage', passive: 'w_fero' },
        { active: 'execute', passive: 'w_undying' }
      ] },
      { name: '守护', spine: 'warcry', forks: [
        { active: 'shieldwall', passive: 'w_iron' },
        { active: 'riposte', passive: 'w_bastion' }
      ] },
      { name: '破军', spine: 'quake', forks: [
        { active: 'leap', passive: 'w_heavy' },
        { active: 'avatar', passive: 'w_sunder' },
        { active: 'swordarray', passive: 'w_ruin' },
        { active: 'skysfall', passive: 'w_titan' }
      ] }
    ],
    mage: [
      { name: '烈火', spine: 'fireball', forks: [
        { active: 'meteor', passive: 'm_ember' },
        { active: 'firewall', passive: 'm_focus' },
        { active: 'pyroclasm', passive: 'm_phoenix' }
      ] },
      { name: '寒冰', spine: 'frostnova', forks: [
        { active: 'iceshard', passive: 'm_chill' },
        { active: 'iceshield', passive: 'm_ward' },
        { active: 'blizzard', passive: 'm_absolute' }
      ] },
      { name: '雷霆', spine: 'chain', forks: [
        { active: 'starfall', passive: 'm_volt' },
        { active: 'thundercloud', passive: 'm_conduct' },
        { active: 'judgement', passive: 'm_stormlord' }
      ] }
    ],
    taoist: [
      { name: '符箓', spine: 'talisman', forks: [
        { active: 'talismanarrow', passive: 't_sigil' },
        { active: 'swordrain', passive: 't_quick' },
        { active: 'mastersigil', passive: 't_heaven' }
      ] },
      { name: '召唤', spine: 'summon', forks: [
        { active: 'whitetiger', passive: 't_bond' },
        { active: 'azuredragon', passive: 't_beast' }
      ] },
      { name: '丹道', spine: 'heal', forks: [
        { active: 'poison', passive: 't_merid' },
        { active: 'antidote', passive: 't_toxin' },
        { active: 'taiji', passive: 't_serene' },
        { active: 'revive', passive: 't_elixir' }
      ] }
    ]
  },

  /* ---------------------------------------------------------- */
  /* 五、分支与关键被动的通用纹样（24×24 线性，不含汉字）          */
  /* ---------------------------------------------------------- */
  icons: {
    /* 取向 · 进攻 */
    off: '<path d="M6 18L18 6"/><path d="M18 6h-5"/><path d="M18 6v5"/><path d="M4 20l2-2"/>',
    /* 取向 · 守势 */
    def: '<path d="M12 3l7 2.5v6c0 4.6-3 7.6-7 9.6-4-2-7-5-7-9.6v-6z"/>',
    /* 变体 · 位移 */
    form1: '<path d="M3 12h13"/><path d="M12 7l5 5-5 5"/><path d="M3 7h5"/><path d="M3 17h5"/>',
    /* 变体 · 持续 / 资源 */
    form2: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/>',
    /* 变体 · 控场 */
    form3: '<path d="M12 4a8 8 0 0 1 0 16"/><path d="M12 20a8 8 0 0 1 0-16"/><path d="M12 4c3 3 5 5.5 5 8s-2 5-5 5"/>',
    /* 普通被动 */
    passive: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
    /* 关键被动 */
    key: '<path d="M12 2.6l8.2 4.7v9.4L12 21.4 3.8 16.7V7.3z"/><path d="M12 7.6l1.7 3.5 3.7.4-2.8 2.5.8 3.7-3.4-2-3.4 2 .8-3.7-2.8-2.5 3.7-.4z"/>'
  }
};

/* ============================================================
 * 读取接口（全部是纯函数，不碰存档）
 * ============================================================ */

/* 把紧凑数组还原成对象；非法写法返回 null，由测试兜住 */
function skillBranchNorm(id, kind, idx, row) {
  if (!row || !row[0]) return null;
  const opt = row[2] || {};
  return {
    skill: id,
    kind: kind,
    idx: idx,
    id: id + ':' + kind + ':' + idx,
    name: row[0],
    desc: row[1] || '',
    mods: opt.mods || null,
    beh: opt.beh || null,
    cond: opt.cond || null,
    /* [P4] 变体专属特效：'frost' 或 { key, color }。
     * 不写则按 beh 键从 FORM_FX_RULES 推 —— 归一化时必须带出来，
     * 否则「数据里指定了特效」会被这一步静默吃掉。 */
    fx: opt.fx || null
  };
}

/* 某技能的三条分支（已归一化）。core 为单条，pick/form 为数组 */
function skillBranches(id) {
  const raw = SKILL_TREE.branches[id];
  if (!raw) return null;
  return {
    core: skillBranchNorm(id, 'core', 0, raw.core),
    pick: (raw.pick || []).map((r, i) => skillBranchNorm(id, 'pick', i, r)).filter(Boolean),
    form: (raw.form || []).map((r, i) => skillBranchNorm(id, 'form', i, r)).filter(Boolean)
  };
}

/* 某技能的标签 */
function skillTags(id) {
  return (SKILL_TREE.tags[id] || []).slice();
}

/* 标签的分类归属：elem / form / fx；找不到返回 null */
function skillTagKind(tag) {
  const k = SKILL_TREE.tagKinds;
  for (const kind in k) if (k[kind].list.indexOf(tag) >= 0) return kind;
  return null;
}

/* 某职业的树节点列表（含推算坐标）
 * 列：系序号 ×2 = 主动侧，×2+1 = 被动侧；行：0 = 入门主动，k = 第 k 个岔口 */
function skillTreeNodes(cls) {
  const lay = SKILL_TREE.layout[cls];
  if (!lay) return [];
  const out = [];
  lay.forEach((tree, ti) => {
    const sp = SKILLS[tree.spine];
    out.push({
      id: tree.spine, kind: 'active', tree: tree.name, col: ti * 2, row: 0,
      unlock: sp ? sp.unlock : 1, max: SKILL_TREE.lvMax, name: sp ? sp.name : tree.spine
    });
    tree.forks.forEach((f, fi) => {
      const k = fi + 1;
      const act = SKILLS[f.active];
      const pas = SKILL_TREE.passives[f.passive] || {};
      out.push({
        id: f.active, kind: 'active', tree: tree.name, col: ti * 2, row: k,
        unlock: act ? act.unlock : 1, max: SKILL_TREE.lvMax, name: act ? act.name : f.active
      });
      out.push({
        id: f.passive, kind: pas.key ? 'key' : 'passive', tree: tree.name,
        col: ti * 2 + 1, row: k, unlock: act ? act.unlock : 1,
        max: pas.max || 1, name: pas.name || f.passive
      });
    });
  });
  return out;
}

/* 某职业的岔口清单：每个岔口 = 主动侧节点 / 被动侧节点，二选一 */
function skillTreeForks(cls) {
  const lay = SKILL_TREE.layout[cls];
  if (!lay) return [];
  const out = [];
  lay.forEach((tree, ti) => {
    tree.forks.forEach((f, fi) => {
      out.push({
        id: tree.name + ':' + (fi + 1),
        tree: tree.name, row: fi + 1,
        active: f.active, passive: f.passive,
        activeCol: ti * 2, passiveCol: ti * 2 + 1
      });
    });
  });
  return out;
}

/* 节点（主动或被动）所在岔口的信息。不在任何岔口上（如 spine / 无主被动）返回 null。
 * lock = 该岔口是否互斥：岔口序号 ≥ forkLockAt（默认第 3 个起）二选一。
 * side = 'active' | 'passive'；other = 对面的节点 id。 */
function skillForkOf(id) {
  for (const cls in SKILL_TREE.layout) {
    for (const tree of SKILL_TREE.layout[cls]) {
      for (let fi = 0; fi < tree.forks.length; fi++) {
        const f = tree.forks[fi];
        if (f.active === id || f.passive === id) {
          const side = f.active === id ? 'active' : 'passive';
          return {
            cls, tree: tree.name, no: fi + 1,
            lock: (fi + 1) >= (SKILL_TREE.forkLockAt || 3),
            active: f.active, passive: f.passive,
            side, other: side === 'active' ? f.passive : f.active
          };
        }
      }
    }
  }
  return null;
}

/* 被动条目 → 树上的位置。解锁等级 = 同岔口主动的领悟等级；
 * 关键被动的 key 标记也从定义表带出来。不在任何树上的返回 null。 */
function skillPassiveInfo(id) {
  for (const cls in SKILL_TREE.layout) {
    for (const tree of SKILL_TREE.layout[cls]) {
      for (const f of tree.forks) {
        if (f.passive === id) {
          const act = SKILLS[f.active];
          const def = SKILL_TREE.passives[id] || {};
          return {
            def, cls, tree: tree.name, active: f.active,
            unlock: act ? act.unlock : 1,
            key: !!def.key, max: def.max || 1
          };
        }
      }
    }
  }
  return null;
}

/* ============================================================
 * 三线并行读取（P0）
 *
 * 和下面的旧接口并存，互不影响：
 *   skillTreeNodes / skillForkOf  → 旧「串行 + 二选一」，战斗与面板还在用
 *   skillLines / skillNodeGate    → 新「三线并行 + 等级门」，P1 才切面板
 *
 * 新接口**故意不返回**「上一个节点是谁」：并行模型里没有硬前置，
 * 只有 reqLv（角色等级）与 needPts（该线已投入点数）两种门。
 * ============================================================ */

/* 一个节点（第 ti 条线的第 row 行）的完整信息 */
function skillLineNodes(cls, ti) {
  const lay = SKILL_TREE.layout[cls];
  if (!lay || !lay[ti]) return [];
  const tree = lay[ti];
  const soft = (SKILL_TREE.lineMeta && SKILL_TREE.lineMeta.softNeedPts) || 5;
  const out = [];

  const push = (entry, id, kind, row, col, fallbackLv) => {
    const sp = SKILLS[id] || {};
    const def = kind === 'active' ? {} : (SKILL_TREE.passives[id] || {});
    const isKey = kind === 'key';
    const auto = kind === 'active' ? sp.unlock : fallbackLv;
    const reqLv = (entry && Number(entry.reqLv)) || Number(auto) || 1;
    const needPts = (entry && typeof entry.needPts === 'number')
      ? entry.needPts
      : (isKey ? soft : 0);
    out.push({
      id: id, cls: cls, line: tree.name, lineIdx: ti, kind: kind,
      name: kind === 'active' ? (sp.name || id) : (def.name || id),
      reqLv: reqLv, needPts: needPts, col: col, row: row,
      max: kind === 'active' ? SKILL_TREE.lvMax : (def.max || 1)
    });
  };

  /* 旧 spine 保留成「该线第 0 行的节点」，但不再必点 */
  if (tree.spine) {
    push({ reqLv: tree.spineReqLv }, tree.spine, 'active', 0, ti * 2, 1);
  }
  tree.forks.forEach((f, fi) => {
    const act = SKILLS[f.active] || {};
    push(f, f.active, 'active', fi + 1, ti * 2, act.unlock);
    const kind = (SKILL_TREE.passives[f.passive] || {}).key ? 'key' : 'passive';
    push(f, f.passive, kind, fi + 1, ti * 2 + 1, act.unlock);
  });
  return out;
}

/* 某职业的三条线（每条 = { name, idx, nodes }） */
function skillLines(cls) {
  const lay = SKILL_TREE.layout[cls];
  if (!lay) return [];
  return lay.map((tree, ti) => ({
    name: tree.name,
    idx: ti,
    nodes: skillLineNodes(cls, ti)
  }));
}

/* 任意节点 id（主动 / 被动 / 关键被动）→ 它在哪条线的第几行；找不到返回 null */
function skillLineNodeInfo(id) {
  for (const cls in SKILL_TREE.layout) {
    const lay = SKILL_TREE.layout[cls];
    for (let ti = 0; ti < lay.length; ti++) {
      const hit = skillLineNodes(cls, ti).find(n => n.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

/* 某条线已投入的点数。spent = { 节点id: 已投点数 }（主动的 lv-1 与被动 lv 都由调用方折算好） */
function skillLineSpent(cls, lineName, spent) {
  const line = skillLines(cls).find(l => l.name === lineName);
  if (!line || !spent) return 0;
  let n = 0;
  for (const node of line.nodes) n += Math.max(0, Number(spent[node.id]) || 0);
  return n;
}

/* 把存档账本折算成 skillLineSpent 要的 spent 形状。
 *
 *   主动：lv - 1（领悟白送的 1 级不算「投入」，与旧岔口锁的口径一致）
 *   被动：lv 本身（被动没有白送等级）
 *
 * 为什么不在 skillLineSpent 里直接读存档：那一层是纯函数，node 里能单测，
 * 不该知道 s.skills / s.passives 长什么样。
 */
function skillSpentMap(skillsState, passiveState) {
  const out = {};
  for (const id in (skillsState || {})) {
    out[id] = Math.max(0, Number(((skillsState[id] || {}).lv) || 1) - 1);
  }
  for (const id in (passiveState || {})) {
    const v = Math.max(0, Number(passiveState[id]) || 0);
    /* 同一 id 不会既是主动又是被动；真撞了取大的，别互相覆盖成 0 */
    out[id] = Math.max(out[id] || 0, v);
  }
  return out;
}

/* 门槛判定：只看「角色等级」与「该线已投入点数」，没有任何硬前置 */
function skillNodeGate(id, opts) {
  const info = skillLineNodeInfo(id);
  if (!info) return null;
  const o = opts || {};
  const level = Math.max(1, Math.round(Number(o.level) || 1));
  const linePts = Math.max(0, Number(o.linePts) || 0);
  const levelOK = level >= info.reqLv;
  const ptsOK = linePts >= info.needPts;
  return {
    id: id, reqLv: info.reqLv, needPts: info.needPts,
    level: level, linePts: linePts,
    levelOK: levelOK, ptsOK: ptsOK, ok: levelOK && ptsOK
  };
}

/* 把某个技能的「满配花费」算出来：[P2] 等级 9 点 + 取向 1 + 变体 1 = 11。
 * 别再写死 6 —— 上限改过一次（5→10），写死的数字会让面板上的「还需 N 点」全部错位。 */
function skillFullCost() {
  return (SKILL_TREE.lvMax - 1) + SKILL_TREE.branchCost.pick + SKILL_TREE.branchCost.form;
}

/* ============================================================
 * 分支投点的纯逻辑（不碰 Game，node 里能直接测）
 *
 * 存档形状：s.skills[id] = { lv, v, p }
 *   lv = 已投等级（不含装备加成，账本只认自己点的）
 *   v  = 变体 Ⅰ/Ⅱ/Ⅲ（旧字段，一直是「免费改机制」）
 *   p  = 取向 0/1（新字段，二选一，花 1 点）
 *
 * 为什么门槛只看「已投等级」而不看 skillLevel()：
 *   后者含装备 / 传世的 +N 级。若拿它当门槛，玩家脱下装备就会凭空多出
 *   一个已选分支（点数账本对不上），或者反过来白掉一点。账本必须与
 *   装备解耦，只看自己真正投进去的等级。
 * ============================================================ */

/* 取向选择是否有效：索引合法 且 已投等级到门槛 */
function skillBranchPickValid(investedLv, p) {
  if (p !== 0 && p !== 1) return false;
  return (investedLv || 1) >= SKILL_TREE.pickAt;
}

/* 精研是否自动生效：只要等级到门槛就给（不花点、不用选） */
function skillBranchCoreOn(investedLv) {
  return (investedLv || 1) >= SKILL_TREE.pickAt;
}

/* 一整份技能账本里，分支一共花掉了多少点 */
function skillBranchSpent(skillsState) {
  if (!skillsState) return 0;
  let n = 0;
  for (const id in skillsState) {
    const e = skillsState[id] || {};
    if (skillBranchPickValid(e.lv || 1, e.p)) n += SKILL_TREE.branchCost.pick;
  }
  return n;
}

/* 某一项分支选项要投几个 beh 键（UI 用它说明「还差多少没接」） */
function skillBranchPendingBeh(opt) {
  if (!opt || !opt.beh) return [];
  const done = (typeof SKILL_BEH !== 'undefined') ? SKILL_BEH : {};
  return Object.keys(opt.beh).filter(k => !done[k]);
}

/* ============================================================
 * 变体（form）：三层分支里的第三层
 *
 * 存档字段是 e.f（0/1/2）。老档只有 e.v（上一代变体的索引），
 * 设计拍板过「旧的变体选择原样保留成变体分支」，所以 f 缺省时直接读 v。
 * 变体不花点、随时可换 —— 换的是打法，不是点数。
 * ============================================================ */

/* 当前变体索引（读存档，纯函数） */
function skillFormIdx(skillsState, id) {
  const e = skillsState && skillsState[id];
  if (!e) return 0;
  const f = (typeof e.f === 'number') ? e.f : e.v;
  return (f === 0 || f === 1 || f === 2) ? f : 0;
}

/* 变体名字。技能条 / 手机端的悬停提示要显示「当前装的是哪一版」——
 * 名字必须和面板、技能树上写的一致，所以统一从这里取，
 * 不再读旧 SKILLS[id].variants（那一层已不参与结算，名字也可能是旧的）。 */
function skillFormName(id, idx) {
  const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
  const o = br && br.form[idx];
  if (o && o.name) return o.name;
  const sk = (typeof SKILLS !== 'undefined') ? SKILLS[id] : null;
  return (sk && sk.variants && sk.variants[idx] && sk.variants[idx].name) || '';
}

/* 单条变体是否已实现完（行为键齐不齐）。cond 是「属性前提」，另算 */
function skillFormPending(opt) {
  return skillBranchPendingBeh(opt);
}

/* 前提条件是否满足：目前只有 { rageMax: 80 } 一种（怒气上限门槛） */
function skillFormCondOk(opt, stats) {
  if (!opt || !opt.cond) return true;
  const c = opt.cond;
  if (typeof c.rageMax === 'number') return ((stats && stats.mpMax) || 0) >= c.rageMax;
  return true;
}

/* 这个技能该不该整只切到新变体通道？
 * 全部三条都能用才切 —— 否则玩家会从 3 条旧变体掉到 1 条可选，是倒退。
 * 打样技能（SKILL_TREE.formEarly）只要有一条能用就提前开，用来先跑通玩法。 */
function skillFormReady(id) {
  const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
  if (!br || !br.form.length) return false;
  const okN = br.form.filter(o => skillFormPending(o).length === 0).length;
  if (!okN) return false;
  const early = (SKILL_TREE.formEarly || []).indexOf(id) >= 0;
  return early ? true : okN === br.form.length;
}

/* 技能树洗点费用：count = 已洗次数，阶梯走 SKILL_TREE.respecFees，
 * 超过表长按最后一档（封顶）。纯函数，node 里可直接测。 */
function skillTreeRespecFee(count) {
  const fees = SKILL_TREE.respecFees || [800, 2400, 6000, 15000, 35000];
  return fees[Math.min(Math.max(0, count | 0), fees.length - 1)];
}

/* 技能树洗点的账目核心（纯函数，game.js 的 respecTree 是薄壳）：
 * 退光技能等级与取向（变体不花点、保留）、清空被动账本。
 * 直接改写传入的两个账本对象；金币与次数的落账由调用方做。
 * 返回 { ok, msg, cost, cleaned }。 */
/* [P1] 8 格 → 5 格的一次性迁移：全退技能点（拍板 #4「已投点数一分不少」）。
 *
 * 与洗点的区别：**不收金币**。玩家没有主动要求重投，是规则改了；
 * 收钱等于罚老玩家。返还是「lv 归 1 + 取向清空 + 被动清空」，
 * 点数不用记账 —— `skillPoints()` 是派生的（等级 − 已投），
 * lv 一回来，可用点自然涨回去。
 *
 * 变体（v / f）**保留**：它不花点，是玩法选择不是投资。
 */
function skillRefundAll(skillsState, passivesState) {
  const sk = skillsState || {};
  let refunded = 0;
  for (const id in sk) {
    const e = sk[id] || {};
    refunded += Math.max(0, (e.lv || 1) - 1);
    const keep = { lv: 1, v: e.v || 0 };
    if (typeof e.f === 'number') keep.f = e.f;
    sk[id] = keep;
  }
  const pas = passivesState || {};
  for (const id in pas) { refunded += pas[id] || 0; delete pas[id]; }
  return { refunded: refunded };
}

function skillTreeRespecApply(skillsState, passivesState, gold, count) {
  const sk = skillsState || {};
  let lvSpent = 0, picks = 0;
  for (const id in sk) {
    lvSpent += Math.max(0, (sk[id].lv || 1) - 1);
    if (skillBranchPickValid(sk[id].lv || 1, sk[id].p)) picks++;
  }
  let pasSpent = 0;
  const pas = passivesState || {};
  for (const id in pas) pasSpent += pas[id] || 0;
  if (!lvSpent && !picks && !pasSpent) return { ok: false, msg: '尚未分配技能点，无需重置' };
  const cost = skillTreeRespecFee(count);
  if ((gold || 0) < cost) return { ok: false, msg: '洗点需 ' + cost + ' 金，当前 ' + (gold || 0) };
  /* 变体不花点，洗点保留：旧通道 v 与新通道 f 都原样带回来 */
  for (const id in sk) {
    const e = sk[id] || {};
    const keep = { lv: 1, v: e.v || 0 };
    if (typeof e.f === 'number') keep.f = e.f;
    sk[id] = keep;
  }
  for (const id in pas) delete pas[id];
  return { ok: true, msg: '已重置技能树，扣除 ' + cost + ' 金币', cost, cleaned: lvSpent + picks + pasSpent };
}
