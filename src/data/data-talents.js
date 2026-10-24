/* ============================================================
 * 数据层 · 天赋树（S3 / v1.2.0）
 * 120 个节点 = 三职业各 3 系 × 10（7 小 + 2 中 + 1 大）+ 通用 30
 *
 * 节点类型：
 *   tier 1 小节点：加属性，可点 5 级（stats 为每级数值）
 *   tier 2 中节点：改机制，1 级（skillMods / flag / special）
 *   tier 3 大节点：质变，1 级，需本系已投入 5 点（reqPts）
 *
 * 载体与套装完全同构：
 *   stats     → 面板属性（aggregate 汇总）
 *   skillMods → 技能修正（dmg/cd/cost/radius/count/dur，'*' 为全技能）
 *   flag      → game.js 里的开关（如 novaFreeze / echo）
 *   special   → game.js 里的钩子（如 wolfPack / talismanPierce）
 *
 * 坐标 pos 为 0-100 的相对坐标，Canvas UI 按面板尺寸映射。
 * 前置：req 为节点 id 数组（全部点亮才可点）；reqPts 为本系已投入点数。
 * ============================================================ */

/* 每系内部结构（10 节点）：
 *        L（大节点，reqPts 5）
 *      m1   m2（中节点）
 *   s1 s2 s3 s4 s5（小节点 5 级）
 *      s6  s7
 * 边：s1→{s2,s3}，s2→s4，s3→s5，s4→s6，s5→s7，s6→m1，s7→m2
 */

/* ---------------- 战士 ---------------- */
const TALENTS_WARRIOR = [
  {
    id: 'rage', name: '狂战', color: '#e0424a',
    desc: '刀刀见血的狂暴之道：伤害、暴击与嗜血。',
    nodes: [
      { id: 'rage_s1', name: '膂力', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级力量 +3', stats: { str: 3 } },
      { id: 'rage_s2', name: '凶蛮', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级暴击伤害 +8%', stats: { critDmg: 8 }, req: ['rage_s1'] },
      { id: 'rage_s3', name: '迅捷', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级攻击速度 +3%', stats: { aspd: 3 }, req: ['rage_s1'] },
      { id: 'rage_s4', name: '暴虐', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级暴击率 +2%', stats: { crit: 2 }, req: ['rage_s2'] },
      { id: 'rage_s5', name: '割裂', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级近战伤害 +4%', stats: { meleeDmg: 4 }, req: ['rage_s3'] },
      { id: 'rage_s6', name: '汲血', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级生命偷取 +1.5%', stats: { lifesteal: 1.5 }, req: ['rage_s4'] },
      { id: 'rage_s7', name: '怒意', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级攻击力 +3%', stats: { atkPct: 3 }, req: ['rage_s5'] },
      { id: 'rage_m1', name: '战斗本能', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '旋风斩伤害 +12%、范围 +15%', skillMods: { whirl: { dmg: 12, radius: 15 } }, req: ['rage_s6'] },
      { id: 'rage_m2', name: '浴血', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '生命低于 50% 时，造成的伤害 +25%', flag: 'lowHpFury', req: ['rage_s7'] },
      { id: 'rage_L', name: '狂怒', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '血怒增益 +50%；血怒期间每次击杀刷新其持续时间', skillMods: { bloodrage: { dmg: 50 } }, special: 'frenzyRefresh', reqPts: 5 }
    ]
  },
  {
    id: 'guard', name: '守护', color: '#d8b25a',
    desc: '站得住才有输出：护甲、格挡与不倒之躯。',
    nodes: [
      { id: 'guard_s1', name: '坚韧', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级体质 +3', stats: { vit: 3 } },
      { id: 'guard_s2', name: '铁骨', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级护甲 +6', stats: { def: 6 }, req: ['guard_s1'] },
      { id: 'guard_s3', name: '厚甲', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级护甲 +4%', stats: { armorPct: 4 }, req: ['guard_s1'] },
      { id: 'guard_s4', name: '沉稳', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级伤害减免 +2%', stats: { dmgReduce: 2 }, req: ['guard_s2'] },
      { id: 'guard_s5', name: '格挡', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级格挡率 +3%', stats: { block: 3 }, req: ['guard_s3'] },
      { id: 'guard_s6', name: '抗性', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级全元素抗性 +3%', stats: { allRes: 3 }, req: ['guard_s4'] },
      { id: 'guard_s7', name: '回春', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级每秒回复生命 +2', stats: { hpRegen: 2 }, req: ['guard_s5'] },
      { id: 'guard_m1', name: '援护', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '战意咆哮的增益效果 +30%', skillMods: { warcry: { dmg: 30 } }, req: ['guard_s6'] },
      { id: 'guard_m2', name: '荆棘', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '伤害反弹 +25%', stats: { thorns: 25 }, req: ['guard_s7'] },
      { id: 'guard_L', name: '不灭', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '受到致命伤时以 30% 生命存活（60 秒冷却）', special: 'phoenix', reqPts: 5 }
    ]
  },
  {
    id: 'assault', name: '破军', color: '#ff8c42',
    desc: '撕裂防线的冲锋之道：突进、贯穿与处决。',
    nodes: [
      { id: 'assault_s1', name: '锋芒', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级攻击力 +3%', stats: { atkPct: 3 } },
      { id: 'assault_s2', name: '穿透', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级护甲穿透 +3%', stats: { armorPen: 3 }, req: ['assault_s1'] },
      { id: 'assault_s3', name: '震慑', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级眩晕几率 +3%', stats: { stunChance: 3 }, req: ['assault_s1'] },
      { id: 'assault_s4', name: '追击', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级移动速度 +2%', stats: { moveSpd: 2 }, req: ['assault_s2'] },
      { id: 'assault_s5', name: '破敌', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级对精英伤害 +5%', stats: { eliteDmg: 5 }, req: ['assault_s3'] },
      { id: 'assault_s6', name: '斩杀', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级处决伤害 +5%', stats: { executeDmg: 5 }, req: ['assault_s4'] },
      { id: 'assault_s7', name: '战意', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级技能伤害 +3%', stats: { skillDmg: 3 }, req: ['assault_s5'] },
      { id: 'assault_m1', name: '跃击', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '烈焰突刺伤害 +15%、冷却 -10%', skillMods: { thrust: { dmg: 15, cd: 10 } }, req: ['assault_s6'] },
      { id: 'assault_m2', name: '天崩', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '裂地震击伤害 +20%、范围 +15%', skillMods: { quake: { dmg: 20, radius: 15 } }, req: ['assault_s7'] },
      { id: 'assault_L', name: '剑神', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '剑神降世伤害 +40%；释放时立刻刷新烈焰突刺冷却', skillMods: { avatar: { dmg: 40 } }, special: 'avatarResetThrust', reqPts: 5 }
    ]
  }
];

/* ---------------- 法师 ---------------- */
const TALENTS_MAGE = [
  {
    id: 'frost', name: '寒冰', color: '#5fc7ff',
    desc: '冻结万物的霜寒之道：控制、持续与自保。',
    nodes: [
      { id: 'frost_s1', name: '凝霜', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级灵力 +3', stats: { int: 3 } },
      { id: 'frost_s2', name: '冰抗', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级冰霜抗性 +4%', stats: { iceRes: 4 }, req: ['frost_s1'] },
      { id: 'frost_s3', name: '寒智', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级技能伤害 +3%', stats: { skillDmg: 3 }, req: ['frost_s1'] },
      { id: 'frost_s4', name: '冷却', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级冷却缩减 +2%', stats: { cdr: 2 }, req: ['frost_s2'] },
      { id: 'frost_s5', name: '省灵', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级技能消耗 -2%', stats: { costReduce: 2 }, req: ['frost_s3'] },
      { id: 'frost_s6', name: '霜冻', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级冻结几率 +2%', stats: { freezeChance: 2 }, req: ['frost_s4'] },
      { id: 'frost_s7', name: '迟滞', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级减速几率 +3%', stats: { slowChance: 3 }, req: ['frost_s5'] },
      { id: 'frost_m1', name: '冰霜新星', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '冰霜新星伤害 +20%、减速持续 +1 秒', skillMods: { frostnova: { dmg: 20, dur: 1 } }, req: ['frost_s6'] },
      { id: 'frost_m2', name: '玄冰护盾', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '玄冰护盾吸收量 +25%', skillMods: { iceshield: { dmg: 25 } }, req: ['frost_s7'] },
      { id: 'frost_L', name: '绝对零度', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '冰霜新星命中的敌人被冻结 1.2 秒', flag: 'novaFreeze', reqPts: 5 }
    ]
  },
  {
    id: 'flame', name: '烈火', color: '#ff6b35',
    desc: '焚尽八荒的爆炎之道：范围与点燃。',
    nodes: [
      { id: 'flame_s1', name: '灼魂', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级灵力 +3', stats: { int: 3 } },
      { id: 'flame_s2', name: '火抗', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级火焰抗性 +4%', stats: { fireRes: 4 }, req: ['flame_s1'] },
      { id: 'flame_s3', name: '爆炎', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级范围伤害 +4%', stats: { aoeDmg: 4 }, req: ['flame_s1'] },
      { id: 'flame_s4', name: '燃烧', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级点燃几率 +3%', stats: { burnChance: 3 }, req: ['flame_s2'] },
      { id: 'flame_s5', name: '暴击', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级暴击率 +2%', stats: { crit: 2 }, req: ['flame_s3'] },
      { id: 'flame_s6', name: '暴伤', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级暴击伤害 +8%', stats: { critDmg: 8 }, req: ['flame_s4'] },
      { id: 'flame_s7', name: '灵力', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级灵力上限 +4%', stats: { mpPct: 4 }, req: ['flame_s5'] },
      { id: 'flame_m1', name: '火球术', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '火球术伤害 +20%、爆炸范围 +10%', skillMods: { fireball: { dmg: 20, radius: 10 } }, req: ['flame_s6'] },
      { id: 'flame_m2', name: '炎爆术', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '炎爆术伤害 +20%、冷却 -10%', skillMods: { meteor: { dmg: 20, cd: 10 } }, req: ['flame_s7'] },
      { id: 'flame_L', name: '焚天', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '火球术爆炸留下火海，且火球术伤害 +25%', flag: 'firetrail', skillMods: { fireball: { dmg: 25 } }, reqPts: 5 }
    ]
  },
  {
    id: 'thunder', name: '雷霆', color: '#b98cff',
    desc: '追踪必中的天雷之道：连锁、连射与回响。',
    nodes: [
      { id: 'thunder_s1', name: '雷敏', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级敏捷 +3', stats: { agi: 3 } },
      { id: 'thunder_s2', name: '移速', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级移动速度 +2%', stats: { moveSpd: 2 }, req: ['thunder_s1'] },
      { id: 'thunder_s3', name: '技能伤', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级技能伤害 +3%', stats: { skillDmg: 3 }, req: ['thunder_s1'] },
      { id: 'thunder_s4', name: '暴击', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级暴击率 +2%', stats: { crit: 2 }, req: ['thunder_s2'] },
      { id: 'thunder_s5', name: '回复', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级灵力回复 +1.5/秒', stats: { mpReg: 1.5 }, req: ['thunder_s3'] },
      { id: 'thunder_s6', name: '击杀回灵', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级击杀回复灵力 +2', stats: { mpOnKill: 2 }, req: ['thunder_s4'] },
      { id: 'thunder_s7', name: '投射', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级投射物伤害 +4%', stats: { projDmg: 4 }, req: ['thunder_s5'] },
      { id: 'thunder_m1', name: '雷弧链', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '雷弧链跳跃 +2、伤害 +15%', skillMods: { chain: { count: 2, dmg: 15 } }, req: ['thunder_s6'] },
      { id: 'thunder_m2', name: '陨星天火', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '陨星天火的陨星 +4 颗', skillMods: { starfall: { count: 4 } }, req: ['thunder_s7'] },
      { id: 'thunder_L', name: '天罚', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '技能有 15% 概率不进入冷却', flag: 'echo', reqPts: 5 }
    ]
  }
];

/* ---------------- 道士 ---------------- */
const TALENTS_TAOIST = [
  {
    id: 'talisman', name: '符箓', color: '#5ce0b0',
    desc: '万剑归宗的符箓之道：飞剑、天雷与穿透。',
    nodes: [
      { id: 'talisman_s1', name: '灵力', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级灵力 +3', stats: { int: 3 } },
      { id: 'talisman_s2', name: '符伤', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级技能伤害 +3%', stats: { skillDmg: 3 }, req: ['talisman_s1'] },
      { id: 'talisman_s3', name: '投射', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级投射物伤害 +4%', stats: { projDmg: 4 }, req: ['talisman_s1'] },
      { id: 'talisman_s4', name: '暴击', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级暴击率 +2%', stats: { crit: 2 }, req: ['talisman_s2'] },
      { id: 'talisman_s5', name: '省灵', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级技能消耗 -2%', stats: { costReduce: 2 }, req: ['talisman_s3'] },
      { id: 'talisman_s6', name: '回复', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级灵力回复 +1.5/秒', stats: { mpReg: 1.5 }, req: ['talisman_s4'] },
      { id: 'talisman_s7', name: '冷却', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级冷却缩减 +2%', stats: { cdr: 2 }, req: ['talisman_s5'] },
      { id: 'talisman_m1', name: '五雷符', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '五雷符伤害 +20%', skillMods: { talisman: { dmg: 20 } }, req: ['talisman_s6'] },
      { id: 'talisman_m2', name: '万剑归宗', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '万剑归宗的符剑 +4 道', skillMods: { swordrain: { count: 4 } }, req: ['talisman_s7'] },
      { id: 'talisman_L', name: '天师', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '五雷符变为穿透：命中后自动飞向附近下一个目标', special: 'talismanPierce', reqPts: 5 }
    ]
  },
  {
    id: 'summon', name: '召唤', color: '#7fd44a',
    desc: '万灵之长的驭兽之道：更多、更强的召唤物。',
    nodes: [
      { id: 'summon_s1', name: '灵智', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级灵力 +3', stats: { int: 3 } },
      { id: 'summon_s2', name: '召唤伤', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级召唤物伤害 +5%', stats: { summonDmg: 5 }, req: ['summon_s1'] },
      { id: 'summon_s3', name: '生命', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级生命上限 +3%', stats: { hpPct: 3 }, req: ['summon_s1'] },
      { id: 'summon_s4', name: '防御', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级护甲 +5', stats: { def: 5 }, req: ['summon_s2'] },
      { id: 'summon_s5', name: '击杀回灵', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级击杀回复灵力 +2', stats: { mpOnKill: 2 }, req: ['summon_s3'] },
      { id: 'summon_s6', name: '经验', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级经验获取 +3%', stats: { expGain: 3 }, req: ['summon_s4'] },
      { id: 'summon_s7', name: '拾取', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级拾取范围 +0.4', stats: { pickupRadius: 0.4 }, req: ['summon_s5'] },
      { id: 'summon_m1', name: '召灵兽', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '灵狼继承攻击力 60% → 75%', special: 'wolfStrong', req: ['summon_s6'] },
      { id: 'summon_m2', name: '回春咒', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '回春咒治疗量 +25%', skillMods: { heal: { dmg: 25 } }, req: ['summon_s7'] },
      { id: 'summon_L', name: '万兽', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '召灵兽一次召出 2 头灵狼', special: 'wolfPack', reqPts: 5 }
    ]
  },
  {
    id: 'elixir', name: '丹道', color: '#ffd479',
    desc: '生生不息的养生之道：治疗、护盾与还魂。',
    nodes: [
      { id: 'elixir_s1', name: '体健', tier: 1, max: 5, pos: { x: 12, y: 54 }, desc: '每级体质 +3', stats: { vit: 3 } },
      { id: 'elixir_s2', name: '生命', tier: 1, max: 5, pos: { x: 32, y: 54 }, desc: '每级生命上限 +3%', stats: { hpPct: 3 }, req: ['elixir_s1'] },
      { id: 'elixir_s3', name: '回复', tier: 1, max: 5, pos: { x: 52, y: 54 }, desc: '每级每秒回复生命 +2', stats: { hpRegen: 2 }, req: ['elixir_s1'] },
      { id: 'elixir_s4', name: '治疗', tier: 1, max: 5, pos: { x: 72, y: 54 }, desc: '每级治疗效果 +4%', stats: { healBonus: 4 }, req: ['elixir_s2'] },
      { id: 'elixir_s5', name: '抗性', tier: 1, max: 5, pos: { x: 90, y: 54 }, desc: '每级全元素抗性 +3%', stats: { allRes: 3 }, req: ['elixir_s3'] },
      { id: 'elixir_s6', name: '护盾', tier: 1, max: 5, pos: { x: 22, y: 84 }, desc: '每级护盾强度 +4%', stats: { shieldBonus: 4 }, req: ['elixir_s4'] },
      { id: 'elixir_s7', name: '毒抗', tier: 1, max: 5, pos: { x: 52, y: 84 }, desc: '每级毒性抗性 +4%', stats: { poisonRes: 4 }, req: ['elixir_s5'] },
      { id: 'elixir_m1', name: '太极玄阵', tier: 2, max: 1, pos: { x: 24, y: 30 }, desc: '太极玄阵持续 +4 秒', skillMods: { taiji: { dur: 4 } }, req: ['elixir_s6'] },
      { id: 'elixir_m2', name: '蚀骨毒雾', tier: 2, max: 1, pos: { x: 62, y: 30 }, desc: '蚀骨毒雾持续 +2 秒、范围 +10%', skillMods: { poison: { dur: 2, radius: 10 } }, req: ['elixir_s7'] },
      { id: 'elixir_L', name: '还魂', tier: 3, max: 1, pos: { x: 50, y: 8 }, desc: '受到致命伤时以 35% 生命存活（60 秒冷却）', special: 'phoenix', reqPts: 5 }
    ]
  }
];

/* ---------------- 通用（全职业） ----------------
 * 30 节点：27 小 + 3 中，蛇形链式前置（点亮前一个才可点后一个），
 * 中节点另需通用系已投入 8 / 16 / 24 点。 */
const UNIVERSAL_NODES = [
  { key: 'str', name: '力量', desc: '每级力量 +3', stats: { str: 3 } },
  { key: 'agi', name: '敏捷', desc: '每级敏捷 +3', stats: { agi: 3 } },
  { key: 'vit', name: '体质', desc: '每级体质 +3', stats: { vit: 3 } },
  { key: 'int', name: '灵力', desc: '每级灵力 +3', stats: { int: 3 } },
  { key: 'hpPct', name: '体魄', desc: '每级生命上限 +3%', stats: { hpPct: 3 } },
  { key: 'atkPct', name: '锋锐', desc: '每级攻击力 +3%', stats: { atkPct: 3 } },
  { key: 'def', name: '护甲', desc: '每级护甲 +6', stats: { def: 6 } },
  { key: 'crit', name: '准头', desc: '每级暴击率 +2%', stats: { crit: 2 } },
  { key: 'critDmg', name: '狠辣', desc: '每级暴击伤害 +8%', stats: { critDmg: 8 } },
  { key: 'aspd', name: '快手', desc: '每级攻击速度 +3%', stats: { aspd: 3 } },
  /* —— 中节点 1：游历（第 10 个，需通用 8 点） —— */
  { key: 'm1', name: '游历', tier: 2, max: 1, desc: '经验获取 +10%', stats: { expGain: 10 }, reqPts: 8 },
  { key: 'moveSpd', name: '疾风', desc: '每级移动速度 +2%', stats: { moveSpd: 2 } },
  { key: 'allRes', name: '抗性', desc: '每级全元素抗性 +3%', stats: { allRes: 3 } },
  { key: 'cdr', name: '冷却', desc: '每级冷却缩减 +2%', stats: { cdr: 2 } },
  { key: 'costReduce', name: '省灵', desc: '每级技能消耗 -2%', stats: { costReduce: 2 } },
  { key: 'mpOnHit', name: '命中回灵', desc: '每级命中回复灵力 +1', stats: { mpOnHit: 1 } },
  { key: 'goldFind', name: '招财', desc: '每级金币获取 +5%', stats: { goldFind: 5 } },
  { key: 'expGain', name: '悟性', desc: '每级经验获取 +3%', stats: { expGain: 3 } },
  { key: 'magicFind', name: '机缘', desc: '每级奇遇机缘 +3%', stats: { magicFind: 3 } },
  /* —— 中节点 2：寻宝（第 20 个，需通用 16 点） —— */
  { key: 'm2', name: '寻宝', tier: 2, max: 1, desc: '奇遇机缘 +8%、金币获取 +8%', stats: { magicFind: 8, goldFind: 8 }, reqPts: 16 },
  { key: 'pickupRadius', name: '拾取', desc: '每级拾取范围 +0.4', stats: { pickupRadius: 0.4 } },
  { key: 'killHeal', name: '诛灭', desc: '每级击杀回复生命 +2', stats: { killHeal: 2 } },
  { key: 'hpRegen', name: '回春', desc: '每级每秒回复生命 +2', stats: { hpRegen: 2 } },
  { key: 'mpReg', name: '灵泉', desc: '每级灵力回复 +1.5/秒', stats: { mpReg: 1.5 } },
  { key: 'dodge', name: '闪避', desc: '每级闪避率 +1%', stats: { dodge: 1 } },
  { key: 'block', name: '格挡', desc: '每级格挡率 +2%', stats: { block: 2 } },
  { key: 'armorPen', name: '穿透', desc: '每级护甲穿透 +2%', stats: { armorPen: 2 } },
  { key: 'firstStrike', name: '先手', desc: '每级先手伤害 +4%', stats: { firstStrike: 4 } },
  { key: 'dotDmg', name: '侵蚀', desc: '每级持续伤害 +4%', stats: { dotDmg: 4 } },
  /* —— 中节点 3：共鸣（第 30 个，需通用 24 点） —— */
  { key: 'm3', name: '共鸣', tier: 2, max: 1, desc: '全技能伤害 +8%', skillMods: { '*': { dmg: 8 } }, reqPts: 24 }
];

const TALENTS_UNIVERSAL = (() => {
  /* 蛇形排布：5 行 × 6 列，行内左→右，偶数行右→左，视觉上是一条龙 */
  const nodes = [];
  UNIVERSAL_NODES.forEach((n, i) => {
    const row = Math.floor(i / 6), col = i % 6;
    const x = (row % 2 === 0 ? col : 5 - col) * 17 + 8;
    const y = 90 - row * 22;
    const prev = i > 0 ? nodes[i - 1].id : null;
    nodes.push(Object.assign({}, n, {
      id: 'uni_' + n.key,
      tier: n.tier || 1,
      max: n.max || 5,
      pos: { x, y },
      req: prev ? [prev] : []
    }));
  });
  return { id: 'universal', name: '通达', color: '#c8b8a0', desc: '放之万法而皆通：全职业皆可修的根基。', nodes };
})();

/* 汇总表：TALENTS[cls] = 三系数组；TALENTS.universal = 通用系 */
const TALENTS = {
  warrior: TALENTS_WARRIOR,
  mage: TALENTS_MAGE,
  taoist: TALENTS_TAOIST,
  universal: [TALENTS_UNIVERSAL]
};

/* 全部节点扁平表（id → node + 所属 tree），供 UI / 校验 / 汇总共用 */
const TALENT_NODES = (() => {
  const out = {};
  for (const cls in TALENTS) {
    for (const tree of TALENTS[cls]) {
      for (const n of tree.nodes) {
        out[n.id] = { node: n, tree: tree.id, treeName: tree.name, color: tree.color, cls: cls === 'universal' ? null : cls };
      }
    }
  }
  return out;
})();

/* 某个职业可用的全部系（含通用） */
function talentTrees(cls) {
  return (TALENTS[cls] || []).concat(TALENTS.universal);
}
