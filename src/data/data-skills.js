/* ============================================================
 * 数据层 · 技能（S4 / v1.2.0）
 * 36 个主动技能（3 职业 × 12，每系 4 个）+ 每技能 3 个变体（108）
 *
 * 变体是纯数据：mods 只走 skillMods 已六个通道
 * （dmg / cd / cost / radius / count / dur），castSkill 统一消费，
 * 新增变体不需要改战斗代码。
 *
 * type: melee / aoe / proj / dash / buff / heal / summon / zone / rain / nova / ultimate / bolt / chain / meteor / shield / swordrain
 * tree: 所属系（与天赋树同名，供技能面板分组）
 * ============================================================ */

/* ---------------- 技能 ---------------- */
const SKILLS = {
  /* ==================== 战士 · 狂战 ==================== */
  whirl: {
    id: 'whirl', name: '旋风斩', cls: 'warrior', tree: '狂战', glyph: '旋', unlock: 1, cd: 2.6, cost: 12,
    type: 'aoe', mult: 1.5, radius: 4.2, anim: 'spin', cast: 'self', castRange: 0,
    desc: '挥刀横斩，对身周所有敌人造成 {dmg} 点伤害。命中回复怒气。',
    variants: [
      { name: '疾风', desc: '冷却 -25%，伤害 -20%', mods: { cd: 25, dmg: -20 } },
      { name: '裂魂', desc: '伤害 +30%，消耗 +20%', mods: { dmg: 30, cost: 20 } },
      { name: '巨灵', desc: '范围 +40%，伤害 -10%', mods: { radius: 40, dmg: -10 } }
    ]
  },
  thrust: {
    id: 'thrust', name: '烈焰突刺', cls: 'warrior', tree: '狂战', glyph: '突', unlock: 4, cd: 6, cost: 18,
    type: 'dash', mult: 2.6, radius: 2.6, range: 11, anim: 'thrust', cast: 'dir', castRange: 11,
    desc: '化作烈焰向前突进，沿途撞飞敌人并造成 {dmg} 点火焰伤害。',
    variants: [
      { name: '连环', desc: '冷却 -20%，伤害 -10%', mods: { cd: 20, dmg: -10 } },
      { name: '焚野', desc: '伤害 +35%', mods: { dmg: 35 } },
      { name: '穿透', desc: '消耗 -25%，范围 +20%', mods: { cost: 25, radius: 20 } }
    ]
  },
  bloodrage: {
    id: 'bloodrage', name: '血怒', cls: 'warrior', tree: '狂战', glyph: '血', unlock: 18, cd: 24, cost: 15,
    type: 'buff', buff: { crit: 25, critDmg: 60, moveSpd: 15, dur: 10 }, anim: 'roar', cast: 'self', castRange: 0,
    desc: '10 秒内暴击率 +25%、暴击伤害 +60%、移速 +15%。',
    variants: [
      { name: '嗜血', desc: '增益效果 +40%', mods: { dmg: 40 } },
      { name: '长怒', desc: '持续 +5 秒', mods: { dur: 5 } },
      { name: '省怒', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  execute: {
    id: 'execute', name: '斩杀', cls: 'warrior', tree: '狂战', glyph: '斩', unlock: 22, cd: 8, cost: 20,
    type: 'melee', mult: 5.0, radius: 3.2, anim: 'swing', cast: 'enemy', castRange: 3.6,
    desc: '倾力斩向目标，造成 {dmg} 点伤害；目标生命低于 30% 时伤害翻倍。',
    variants: [
      { name: '处决', desc: '伤害 +30%', mods: { dmg: 30 } },
      { name: '补刀', desc: '消耗 -25%', mods: { cost: 25 } },
      { name: '夺命', desc: '冷却 -20%', mods: { cd: 20 } }
    ]
  },
  /* ==================== 战士 · 守护 ==================== */
  warcry: {
    id: 'warcry', name: '战意咆哮', cls: 'warrior', tree: '守护', glyph: '吼', unlock: 8, cd: 16, cost: 20,
    type: 'buff', buff: { atkPct: 30, aspd: 20, lifesteal: 8, dur: 8 }, anim: 'roar', cast: 'self', castRange: 0,
    desc: '8 秒内攻击力 +30%、攻速 +20%、生命偷取 +8%。',
    variants: [
      { name: '持久', desc: '持续 +4 秒', mods: { dur: 4 } },
      { name: '狂乱', desc: '增益效果 +30%', mods: { dmg: 30 } },
      { name: '省力', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  shieldwall: {
    id: 'shieldwall', name: '盾墙', cls: 'warrior', tree: '守护', glyph: '盾', unlock: 18, cd: 24, cost: 20,
    type: 'buff', buff: { def: 60, dmgReduce: 15, block: 20, dur: 10 }, anim: 'cast', cast: 'self', castRange: 0,
    desc: '10 秒内护甲 +60%、伤害减免 +15%、格挡率 +20%。',
    variants: [
      { name: '铁壁', desc: '增益效果 +30%', mods: { dmg: 30 } },
      { name: '持久', desc: '持续 +4 秒', mods: { dur: 4 } },
      { name: '省力', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  riposte: {
    id: 'riposte', name: '反击', cls: 'warrior', tree: '守护', glyph: '反', unlock: 30, cd: 20, cost: 22,
    type: 'buff', buff: { block: 40, thorns: 50, dur: 8 }, anim: 'cast', cast: 'self', castRange: 0,
    desc: '8 秒内格挡率 +40%，并把承受伤害的 50% 反弹给攻击者。',
    variants: [
      { name: '荆棘', desc: '增益效果 +30%', mods: { dmg: 30 } },
      { name: '持久', desc: '持续 +3 秒', mods: { dur: 3 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  /* ==================== 战士 · 破军 ==================== */
  quake: {
    id: 'quake', name: '裂地震击', cls: 'warrior', tree: '破军', glyph: '裂', unlock: 12, cd: 9, cost: 24,
    type: 'aoe', mult: 3.2, radius: 5.6, stun: 1.6, anim: 'slam', cast: 'ground', castRange: 10,
    desc: '重击指定位置的大地，对该处敌人造成 {dmg} 点伤害并击晕 1.6 秒。',
    variants: [
      { name: '震荡', desc: '范围 +25%，消耗 +10%', mods: { radius: 25, cost: 10 } },
      { name: '崩山', desc: '伤害 +30%', mods: { dmg: 30 } },
      { name: '速震', desc: '冷却 -25%', mods: { cd: 25 } }
    ]
  },
  leap: {
    id: 'leap', name: '跃击', cls: 'warrior', tree: '破军', glyph: '跃', unlock: 14, cd: 10, cost: 16,
    type: 'dash', mult: 2.2, radius: 4.5, range: 10, anim: 'thrust', cast: 'dir', castRange: 10,
    desc: '跃向指定方向，落地时震击周围敌人，造成 {dmg} 点伤害并击退。',
    variants: [
      { name: '飞跃', desc: '冷却 -20%', mods: { cd: 20 } },
      { name: '重踏', desc: '伤害 +30%，范围 +15%', mods: { dmg: 30, radius: 15 } },
      { name: '轻身', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  avatar: {
    id: 'avatar', name: '剑神降世', cls: 'warrior', tree: '破军', glyph: '神', unlock: 26, cd: 60, cost: 40,
    type: 'ultimate', mult: 6.5, radius: 9, buff: { atkPct: 60, aspd: 40, dur: 12 }, anim: 'slam', cast: 'self', castRange: 0,
    desc: '召唤剑神附体，造成 {dmg} 点范围巨伤，12 秒内攻击力 +60%、攻速 +40%。',
    variants: [
      { name: '剑域', desc: '范围 +25%', mods: { radius: 25 } },
      { name: '斩神', desc: '伤害 +35%', mods: { dmg: 35 } },
      { name: '连斩', desc: '冷却 -20%', mods: { cd: 20 } }
    ]
  },
  swordarray: {
    id: 'swordarray', name: '剑阵', cls: 'warrior', tree: '破军', glyph: '阵', unlock: 34, cd: 30, cost: 30,
    type: 'buff', mult: 0.9, radius: 3.6, dur: 8, anim: 'cast', cast: 'self', castRange: 0,
    desc: '8 秒内周身剑鸣，每 0.6 秒对身边敌人造成 {dmg} 点伤害。',
    variants: [
      { name: '密雨', desc: '每次剑鸣伤害 +25%', mods: { dmg: 25 } },
      { name: '持久', desc: '持续 +3 秒', mods: { dur: 3 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  skysfall: {
    id: 'skysfall', name: '天崩', cls: 'warrior', tree: '破军', glyph: '崩', unlock: 40, cd: 40, cost: 40,
    type: 'aoe', mult: 2.4, radius: 5, anim: 'slam', cast: 'ground', castRange: 12,
    desc: '连续三次震击指定位置，每次造成 {dmg} 点范围伤害。',
    variants: [
      { name: '灭天', desc: '伤害 +30%', mods: { dmg: 30 } },
      { name: '速降', desc: '冷却 -20%', mods: { cd: 20 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },

  /* ==================== 法师 · 烈火 ==================== */
  fireball: {
    id: 'fireball', name: '火球术', cls: 'mage', tree: '烈火', glyph: '火', unlock: 1, cd: 1.4, cost: 10,
    type: 'proj', mult: 1.9, speed: 22, radius: 2.4, elem: 'fire', anim: 'cast', cast: 'dir', castRange: 16,
    desc: '掷出爆裂火球，命中后爆炸造成 {dmg} 点火焰伤害。',
    variants: [
      { name: '连环', desc: '3 连发，单发伤害 -40%', mods: { count: 2, dmg: -40 } },
      { name: '爆炎', desc: '伤害 +25%，爆炸范围 +15%', mods: { dmg: 25, radius: 15 } },
      { name: '省力', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  meteor: {
    id: 'meteor', name: '炎爆术', cls: 'mage', tree: '烈火', glyph: '爆', unlock: 12, cd: 10, cost: 30,
    type: 'meteor', mult: 4.2, radius: 5.5, delay: 0.9, elem: 'fire', anim: 'cast', cast: 'ground', castRange: 16,
    desc: '在指定位置召下陨火，1 秒后爆炸造成 {dmg} 点火焰伤害。',
    variants: [
      { name: '巨爆', desc: '范围 +25%，伤害 -10%', mods: { radius: 25, dmg: -10 } },
      { name: '连陨', desc: '冷却 -20%', mods: { cd: 20 } },
      { name: '速降', desc: '伤害 +25%，消耗 +15%', mods: { dmg: 25, cost: 15 } }
    ]
  },
  firewall: {
    id: 'firewall', name: '火墙', cls: 'mage', tree: '烈火', glyph: '墙', unlock: 18, cd: 14, cost: 26,
    type: 'zone', mult: 0.55, radius: 3, dur: 4, tick: 0.5, elem: 'fire', anim: 'cast', cast: 'dir', castRange: 12,
    desc: '在指定方向升起火墙，4 秒内持续灼烧其中敌人，每 0.5 秒 {dmg} 点火焰伤害。',
    variants: [
      { name: '长墙', desc: '持续 +2 秒', mods: { dur: 2 } },
      { name: '烈焰', desc: '每次灼烧伤害 +25%', mods: { dmg: 25 } },
      { name: '宽墙', desc: '范围 +25%', mods: { radius: 25 } }
    ]
  },
  pyroclasm: {
    id: 'pyroclasm', name: '焚天', cls: 'mage', tree: '烈火', glyph: '焚', unlock: 34, cd: 26, cost: 38,
    type: 'nova', mult: 3.6, radius: 7, elem: 'fire', anim: 'cast', cast: 'self', castRange: 0,
    desc: '以自身为中心引爆烈焰，对周围敌人造成 {dmg} 点火焰伤害并点燃。',
    variants: [
      { name: '燎原', desc: '范围 +25%', mods: { radius: 25 } },
      { name: '怒焰', desc: '伤害 +30%', mods: { dmg: 30 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  /* ==================== 法师 · 寒冰 ==================== */
  frostnova: {
    id: 'frostnova', name: '冰霜新星', cls: 'mage', tree: '寒冰', glyph: '冰', unlock: 4, cd: 7, cost: 20,
    type: 'nova', mult: 2.2, radius: 6, slow: 0.45, slowDur: 3.5, elem: 'ice', anim: 'cast', cast: 'ground', castRange: 9,
    desc: '在指定位置引爆寒气，造成 {dmg} 点冰霜伤害并减速 45%，持续 3.5 秒。',
    variants: [
      { name: '双重', desc: '额外 1 片新星，伤害 -20%', mods: { count: 1, dmg: -20 } },
      { name: '深寒', desc: '减速持续 +2 秒，伤害 +10%', mods: { dur: 2, dmg: 10 } },
      { name: '广冰', desc: '范围 +30%', mods: { radius: 30 } }
    ]
  },
  iceshard: {
    id: 'iceshard', name: '冰锥', cls: 'mage', tree: '寒冰', glyph: '锥', unlock: 14, cd: 3.2, cost: 14,
    type: 'proj', mult: 1.2, speed: 26, radius: 2, elem: 'ice', anim: 'cast', cast: 'dir', castRange: 14,
    desc: '扇形射出三枚冰锥，每枚造成 {dmg} 点冰霜伤害并减速。',
    variants: [
      { name: '三叉', desc: '冰锥 +2 枚，单枚 -25%', mods: { count: 2, dmg: -25 } },
      { name: '锋冰', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  iceshield: {
    id: 'iceshield', name: '玄冰护盾', cls: 'mage', tree: '寒冰', glyph: '玄', unlock: 18, cd: 18, cost: 18,
    type: 'shield', absorb: 0.35, dur: 10, anim: 'cast', cast: 'self', castRange: 0,
    desc: '凝结冰盾，10 秒内吸收相当于生命上限 35% 的伤害。',
    variants: [
      { name: '厚盾', desc: '吸收量 +30%', mods: { dmg: 30 } },
      { name: '持久', desc: '持续 +3 秒', mods: { dur: 3 } },
      { name: '省力', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  blizzard: {
    id: 'blizzard', name: '暴雪', cls: 'mage', tree: '寒冰', glyph: '雪', unlock: 22, cd: 18, cost: 32,
    type: 'zone', mult: 0.6, radius: 6, dur: 5, tick: 0.7, elem: 'ice', anim: 'cast', cast: 'ground', castRange: 12,
    desc: '召唤暴雪笼罩指定区域，5 秒内每 0.7 秒造成 {dmg} 点冰霜伤害并减速。',
    variants: [
      { name: '久雪', desc: '持续 +2 秒', mods: { dur: 2 } },
      { name: '暴雪', desc: '每次伤害 +25%', mods: { dmg: 25 } },
      { name: '广雪', desc: '范围 +25%', mods: { radius: 25 } }
    ]
  },
  /* ==================== 法师 · 雷霆 ==================== */
  chain: {
    id: 'chain', name: '雷弧链', cls: 'mage', tree: '雷霆', glyph: '雷', unlock: 8, cd: 6, cost: 22,
    type: 'chain', mult: 1.7, jumps: 5, range: 10, elem: 'lightning', anim: 'cast', cast: 'enemy', castRange: 12,
    desc: '放出连环雷弧，在最多 5 名敌人间跳跃，每次造成 {dmg} 点雷电伤害。',
    variants: [
      { name: '多跳', desc: '跳跃 +2', mods: { count: 2 } },
      { name: '强电', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  starfall: {
    id: 'starfall', name: '陨星天火', cls: 'mage', tree: '雷霆', glyph: '星', unlock: 26, cd: 55, cost: 50,
    type: 'rain', mult: 1.6, radius: 10, count: 16, dur: 4, elem: 'fire', anim: 'cast', cast: 'ground', castRange: 18,
    desc: '天穹崩裂，4 秒内降下 16 颗陨星，每颗造成 {dmg} 点火焰伤害。',
    variants: [
      { name: '星雨', desc: '陨星 +6 颗', mods: { count: 6 } },
      { name: '灼星', desc: '每颗伤害 +20%', mods: { dmg: 20 } },
      { name: '省力', desc: '消耗 -20%', mods: { cost: 20 } }
    ]
  },
  thundercloud: {
    id: 'thundercloud', name: '雷云', cls: 'mage', tree: '雷霆', glyph: '云', unlock: 30, cd: 22, cost: 34,
    type: 'zone', mult: 1.1, radius: 7, dur: 6, tick: 1, elem: 'lightning', anim: 'cast', cast: 'ground', castRange: 14,
    desc: '召来雷云笼罩指定区域，6 秒内每秒随机落雷击中最多 3 名敌人，每道 {dmg} 点雷电伤害。',
    variants: [
      { name: '久云', desc: '持续 +2 秒', mods: { dur: 2 } },
      { name: '怒雷', desc: '每道伤害 +25%', mods: { dmg: 25 } },
      { name: '广云', desc: '范围 +20%', mods: { radius: 20 } }
    ]
  },
  judgement: {
    id: 'judgement', name: '雷罚', cls: 'mage', tree: '雷霆', glyph: '罚', unlock: 40, cd: 45, cost: 48,
    type: 'bolt', mult: 8.5, radius: 3, elem: 'lightning', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '对目标降下天罚巨雷，造成 {dmg} 点雷电伤害；对首领额外 +30%。',
    variants: [
      { name: '天威', desc: '伤害 +30%', mods: { dmg: 30 } },
      { name: '速罚', desc: '冷却 -20%', mods: { cd: 20 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },

  /* ==================== 道士 · 符箓 ==================== */
  talisman: {
    id: 'talisman', name: '五雷符', cls: 'taoist', tree: '符箓', glyph: '符', unlock: 1, cd: 1.2, cost: 8,
    type: 'bolt', mult: 1.7, range: 16, elem: 'lightning', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '掷出雷符，召下天雷击中目标，造成 {dmg} 点雷电伤害。',
    variants: [
      { name: '双符', desc: '额外 1 张，单张 -30%', mods: { count: 1, dmg: -30 } },
      { name: '强符', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  talismanarrow: {
    id: 'talismanarrow', name: '符箭', cls: 'taoist', tree: '符箓', glyph: '箭', unlock: 14, cd: 2.6, cost: 12,
    type: 'bolt', mult: 1.0, range: 16, elem: 'none', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '一次射出三张追踪符，每张造成 {dmg} 点伤害。',
    variants: [
      { name: '连珠', desc: '符箭 +2，单发 -25%', mods: { count: 2, dmg: -25 } },
      { name: '强矢', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  swordrain: {
    id: 'swordrain', name: '万剑归宗', cls: 'taoist', tree: '符箓', glyph: '剑', unlock: 26, cd: 50, cost: 45,
    type: 'swordrain', mult: 1.15, radius: 12, count: 22, dur: 3.5, elem: 'none', anim: 'cast', cast: 'ground', castRange: 18,
    desc: '万道符剑自天而降，3.5 秒内对范围内敌人造成 22 次 {dmg} 点伤害。',
    variants: [
      { name: '万剑', desc: '符剑 +6 道', mods: { count: 6 } },
      { name: '利剑', desc: '每道伤害 +20%', mods: { dmg: 20 } },
      { name: '省灵', desc: '消耗 -20%', mods: { cost: 20 } }
    ]
  },
  mastersigil: {
    id: 'mastersigil', name: '天师符', cls: 'taoist', tree: '符箓', glyph: '师', unlock: 30, cd: 20, cost: 30,
    type: 'zone', mult: 1.0, radius: 6, dur: 6, tick: 0.9, elem: 'lightning', anim: 'cast', cast: 'ground', castRange: 14,
    desc: '布下天师符阵，6 秒内每 0.9 秒对阵中敌人落雷，每次 {dmg} 点雷电伤害。',
    variants: [
      { name: '久阵', desc: '持续 +2 秒', mods: { dur: 2 } },
      { name: '天雷', desc: '每次伤害 +25%', mods: { dmg: 25 } },
      { name: '广阵', desc: '范围 +20%', mods: { radius: 20 } }
    ]
  },
  /* ==================== 道士 · 召唤 ==================== */
  summon: {
    id: 'summon', name: '召灵兽', cls: 'taoist', tree: '召唤', glyph: '兽', unlock: 4, cd: 20, cost: 25,
    type: 'summon', dur: 25, anim: 'cast', cast: 'self', castRange: 0,
    desc: '召出一头灵狼为你作战 25 秒，灵狼继承你 60% 的攻击力。',
    variants: [
      { name: '猛兽', desc: '灵狼伤害 +15%', mods: { dmg: 15 } },
      { name: '久召', desc: '持续 +6 秒', mods: { dur: 6 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  whitetiger: {
    id: 'whitetiger', name: '白虎', cls: 'taoist', tree: '召唤', glyph: '虎', unlock: 22, cd: 26, cost: 30,
    type: 'summon', dur: 20, anim: 'cast', cast: 'self', castRange: 0,
    desc: '召出白虎助战 20 秒，继承 70% 攻击力，出手更快。',
    variants: [
      { name: '猛虎', desc: '白虎伤害 +15%', mods: { dmg: 15 } },
      { name: '久伴', desc: '持续 +5 秒', mods: { dur: 5 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  azuredragon: {
    id: 'azuredragon', name: '青龙', cls: 'taoist', tree: '召唤', glyph: '龙', unlock: 38, cd: 45, cost: 45,
    type: 'summon', dur: 18, anim: 'cast', cast: 'self', castRange: 0,
    desc: '召出青龙助战 18 秒，继承 80% 攻击力，攻击为范围伤害。',
    variants: [
      { name: '神龙', desc: '青龙伤害 +20%', mods: { dmg: 20 } },
      { name: '久伴', desc: '持续 +4 秒', mods: { dur: 4 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  /* ==================== 道士 · 丹道 ==================== */
  heal: {
    id: 'heal', name: '回春咒', cls: 'taoist', tree: '丹道', glyph: '愈', unlock: 8, cd: 12, cost: 22,
    type: 'heal', healPct: 0.28, hot: 0.12, anim: 'cast', cast: 'self', castRange: 0,
    desc: '立刻回复 {heal} 点生命，并在 4 秒内再回复 12% 生命上限。',
    variants: [
      { name: '大治疗', desc: '治疗量 +30%', mods: { dmg: 30 } },
      { name: '久春', desc: '持续回复 +2 秒', mods: { dur: 2 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  poison: {
    id: 'poison', name: '蚀骨毒雾', cls: 'taoist', tree: '丹道', glyph: '毒', unlock: 12, cd: 8, cost: 24,
    type: 'zone', mult: 0.75, radius: 5, dur: 6, tick: 0.8, elem: 'poison', anim: 'cast', cast: 'ground', castRange: 14,
    desc: '布下毒雾，6 秒内持续腐蚀其中敌人，每 0.8 秒造成 {dmg} 点毒素伤害。',
    variants: [
      { name: '久毒', desc: '持续 +2 秒', mods: { dur: 2 } },
      { name: '剧毒', desc: '每次伤害 +25%', mods: { dmg: 25 } },
      { name: '广毒', desc: '范围 +25%', mods: { radius: 25 } }
    ]
  },
  taiji: {
    id: 'taiji', name: '太极玄阵', cls: 'taoist', tree: '丹道', glyph: '极', unlock: 18, cd: 20, cost: 24,
    type: 'buff', buff: { def: 40, allRes: 30, mpReg: 6, dur: 12 }, anim: 'cast', cast: 'self', castRange: 0,
    desc: '12 秒内护甲 +40%、全抗 +30%、灵力回复 +6/秒。',
    variants: [
      { name: '厚势', desc: '增益效果 +30%', mods: { dmg: 30 } },
      { name: '久阵', desc: '持续 +4 秒', mods: { dur: 4 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  antidote: {
    id: 'antidote', name: '解毒', cls: 'taoist', tree: '丹道', glyph: '解', unlock: 18, cd: 22, cost: 18,
    type: 'buff', buff: { allRes: 25, ccResist: 40, mpReg: 6, dur: 12 }, anim: 'cast', cast: 'self', castRange: 0,
    desc: '12 秒内全抗 +25%、控制抗性 +40%、灵力回复 +6/秒，并立即清除身上中毒与减速。',
    variants: [
      { name: '强效', desc: '增益效果 +30%', mods: { dmg: 30 } },
      { name: '持久', desc: '持续 +4 秒', mods: { dur: 4 } },
      { name: '省灵', desc: '消耗 -30%', mods: { cost: 30 } }
    ]
  },
  revive: {
    id: 'revive', name: '还魂', cls: 'taoist', tree: '丹道', glyph: '魂', unlock: 40, cd: 60, cost: 35,
    type: 'buff', dur: 25, anim: 'cast', cast: 'self', castRange: 0,
    desc: '25 秒内若受到致命伤，以 35% 生命原地存活（不消耗死亡次数）。',
    variants: [
      { name: '坚魂', desc: '持续 +8 秒', mods: { dur: 8 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } },
      { name: '速凝', desc: '冷却 -20%', mods: { cd: 20 } }
    ]
  }
};

/* 技能栏顺序（按解锁等级排列，前 8 个上动作条第一页） */
const SKILL_ORDER = {
  warrior: ['whirl', 'thrust', 'warcry', 'quake', 'leap', 'shieldwall', 'bloodrage', 'execute', 'avatar', 'riposte', 'swordarray', 'skysfall'],
  mage: ['fireball', 'frostnova', 'chain', 'meteor', 'iceshard', 'firewall', 'iceshield', 'blizzard', 'starfall', 'thundercloud', 'pyroclasm', 'judgement'],
  taoist: ['talisman', 'summon', 'heal', 'poison', 'talismanarrow', 'antidote', 'taiji', 'whitetiger', 'swordrain', 'mastersigil', 'azuredragon', 'revive']
};

/* 技能条槽位数：8 格（V2 计划「技能栏 6 → 8」）。
 * 玩家在术法面板（K）里手动把已领悟技能放上去；PC 键 1-8，手机 4×2 宫格。 */
const SKILL_BAR_SLOTS = 8;
/* 快捷栏套数：2 套（甲 / 乙）。
 * 一套打 boss、一套刷图是 ARPG 的常规需求，8 格已经够宽，
 * 但「换 BD 要重排技能条」很烦，所以再给一套整栏。
 * 切换键：Shift（默认）/ 反引号 / V。
 * 原来只绑了反引号——中文输入法与部分键盘布局下它根本不触发，
 * 玩家等于没有换栏键；现在 Shift 是主键，反引号与 V 保底。见 game.js bindInput。 */
const SKILL_BAR_SETS = 2;
const SKILL_BAR_SET_KEY = 'shift';          // 默认换栏键（与 e.key.toLowerCase() 比较）
const SKILL_BAR_SET_LABEL = 'Shift';        // 界面上显示的名字
const SKILL_BAR_SET_KEY_ALT = '` / V';      // 备用键（部分键盘 / 输入法下 Shift 手感差）
/* 两套快捷栏的显示：图标（剑 / 盾）而不是「甲 / 乙」文字，
 * 图标一眼能看出「这是两套可切的栏」，也不用读字。 */
const SKILL_BAR_SET_ICON = ['bar_atk', 'bar_def'];
const SKILL_BAR_SET_NAME = ['第一套', '第二套'];   // 仅提示 / 无障碍文本用
/* 取某一套的图标 SVG；size 为边长像素 */
function barSetIcon(i, size) {
  const key = SKILL_BAR_SET_ICON[i] || SKILL_BAR_SET_ICON[0];
  return (typeof skillIconSvg === 'function') ? skillIconSvg(key, size || 16) : '';
}

/* 技能等级：每级 +8% 伤害（也放大治疗 / 护盾 / 召唤伤害） */
const SKILL_LV_STEP = 0.08;
const SKILL_LV_MAX = 10;

/* 变体修正合并（与套装 / 天赋的 skillMods 同通道相加） */
function variantMods(sk, v) {
  if (!sk || !sk.variants || !sk.variants[v]) return null;
  return sk.variants[v].mods || null;
}

function mergeSkillMods() {
  let out = null;
  for (const src of arguments) {
    if (!src) continue;
    if (!out) out = {};
    for (const k in src) out[k] = (out[k] || 0) + src[k];
  }
  return out;
}

/* ============================================================
 * [C1] 机制型变体（v1.8.0）
 *
 * 原来 108 个变体全是数值修正（dmg / cd / cost / radius / count / dur），
 * 换个变体只是数字变大变小，打法和手感完全一样 —— 构筑之间没有区别。
 *
 * 现在每个技能的变体 Ⅲ 换成「改机制」：数据里只写一个 special id，
 * 真正的效果由 game.js 的 applySkillSpecial() 统一消费。
 * 好处是新增机制只改这两处，不用碰 castSkill 里那 36 个 case。
 * ============================================================ */

/* 机制登记表：castSkill 只认这里出现过的 id。
 * 数据里写错的 special 会被 variantSpecial() 静默丢弃（技能照常施放、只是没附加效果），
 * 不会出现「变体选中了但技能变空放」这种难查的故障。 */
const SKILL_SPECIALS = {
  bleed:       { name: '流血',   desc: '命中敌人后 3 秒内每秒受 25% 技能伤害' },
  burn:        { name: '灼烧',   desc: '命中敌人后 3 秒内每秒受 30% 火焰伤害' },
  slow:        { name: '冰缓',   desc: '命中敌人减速 40%，持续 3 秒' },
  freeze:      { name: '冻结',   desc: '命中敌人定身 1.2 秒（首领 0.4 秒）' },
  stun:        { name: '麻痹',   desc: '命中敌人眩晕 0.8 秒（首领 0.3 秒）' },
  explode:     { name: '爆裂',   desc: '落点 2.5m 内追加 60% 范围伤害' },
  chain:       { name: '连锁',   desc: '向周围 3 名敌人连锁 60% 伤害' },
  pull:        { name: '聚拢',   desc: '把 5m 内敌人拉向中心并短暂失衡' },
  echo:        { name: '回响',   desc: '0.45 秒后在原地再打一次 60% 伤害' },
  endBurst:    { name: '终爆',   desc: '1.5 秒后原地爆发 90% 伤害' },
  auraField:   { name: '领域',   desc: '8 秒内每秒对范围内敌人造成 40% 伤害' },
  slowField:   { name: '寒域',   desc: '6 秒内范围内敌人持续减速 35%' },
  extraSummon: { name: '兽群',   desc: '额外召出一头灵狼助战' },
  healBurst:   { name: '济世',   desc: '治疗同时对周围敌人造成 60% 治疗量伤害' },
  cleanse:     { name: '净化',   desc: '清除所有负面状态并回复 10% 生命上限' },
  shockwave:   { name: '震荡',   desc: '周围 4.5m 敌人受 60% 伤害并被击退' },
  regenField:  { name: '回春',   desc: '6 秒内每秒回复 2% 生命上限' }
};

/* 36 个技能的变体 Ⅲ 覆盖项。
 * 不写 mods 就沿用原变体的数值修正；写了 mods 就整体替换 ——
 * 机制型变体一般要「削一点数值换一个机制」，所以大多数都给了负修正。 */
const SKILL_SPECIAL_VARIANTS = {
  /* ---------------- 战士 · 狂战 ---------------- */
  whirl:        { name: '血旋',   special: 'bleed',      mods: { dmg: -10 }, desc: '命中附加流血：3 秒内每秒受 25% 伤害' },
  thrust:       { name: '焚野',   special: 'burn',       mods: { dmg: -5 },  desc: '突进沿途点燃敌人：3 秒内每秒 30% 火焰伤害' },
  bloodrage:    { name: '血偿',   special: 'regenField', mods: { dur: -2 },  desc: '增益期间每秒回复 2% 生命上限' },
  execute:      { name: '斩魂',   special: 'explode',    mods: { dmg: -10 }, desc: '斩击落点 2.5m 爆裂，追加 60% 范围伤害' },
  /* ---------------- 战士 · 守护 ---------------- */
  warcry:       { name: '战吼',   special: 'shockwave',  mods: { dur: -2 },  desc: '咆哮震退 4.5m 内敌人并造成 60% 伤害' },
  shieldwall:   { name: '铁壁回春', special: 'regenField', mods: { dur: -2 }, desc: '举盾期间每秒回复 2% 生命上限' },
  riposte:      { name: '震甲',   special: 'shockwave',  mods: { dur: -1 },  desc: '架式展开时震退周围敌人并造成 60% 伤害' },
  /* ---------------- 战士 · 破军 ---------------- */
  quake:        { name: '裂地',   special: 'endBurst',   mods: { dmg: -10 }, desc: '1.5 秒后大地二次崩裂，90% 范围伤害' },
  leap:         { name: '坠地',   special: 'pull',       mods: { dmg: -10 }, desc: '落地把 5m 内敌人拉向落点' },
  avatar:       { name: '剑域',   special: 'auraField',  mods: { dmg: -20 }, desc: '剑神领域 8 秒，每秒对周围造成 40% 伤害' },
  swordarray:   { name: '剑狱',   special: 'auraField',  mods: { dmg: -15 }, desc: '剑阵化为领域，8 秒内每秒 40% 伤害' },
  skysfall:     { name: '天罚',   special: 'stun',       mods: { dmg: -10 }, desc: '三次震击附带麻痹 0.8 秒' },
  /* ---------------- 法师 · 烈火 ---------------- */
  fireball:     { name: '炎爆',   special: 'explode',    mods: { dmg: -5 },  desc: '命中后原地爆裂，2.5m 内追加 60% 伤害' },
  meteor:       { name: '流星',   special: 'echo',       mods: { dmg: -15 }, desc: '0.45 秒后落点再砸一颗小陨石（60%）' },
  firewall:     { name: '燃野',   special: 'burn',       mods: { dur: -1 },  desc: '被火墙灼烧的敌人额外点燃 3 秒' },
  pyroclasm:    { name: '焚尽',   special: 'burn',       mods: { dmg: -10 }, desc: '引爆后敌人持续燃烧 3 秒（每秒 30%）' },
  /* ---------------- 法师 · 寒冰 ---------------- */
  frostnova:    { name: '冰封',   special: 'freeze',     mods: { dmg: -15 }, desc: '命中敌人定身 1.2 秒（首领 0.4 秒）' },
  iceshard:     { name: '霜透',   special: 'slow',       mods: { dmg: -5 },  desc: '冰锥命中减速 40%，持续 3 秒' },
  iceshield:    { name: '霜域',   special: 'slowField',  mods: { dmg: -10 }, desc: '护盾期间周身寒气，6 秒内附近敌人减速 35%' },
  blizzard:     { name: '雪崩',   special: 'endBurst',   mods: { dmg: -10 }, desc: '暴雪结束时爆发一次 90% 冰霜伤害' },
  /* ---------------- 法师 · 雷霆 ---------------- */
  chain:        { name: '雷回',   special: 'echo',       mods: { dmg: -10 }, desc: '0.45 秒后雷弧再跳一轮（60%）' },
  starfall:     { name: '星陨',   special: 'burn',       mods: { dmg: -10 }, desc: '每颗陨星点燃落点敌人 3 秒' },
  thundercloud: { name: '雷暴',   special: 'stun',       mods: { dmg: -10 }, desc: '落雷附带麻痹 0.8 秒' },
  judgement:    { name: '天罚连锁', special: 'chain',    mods: { dmg: -20 }, desc: '天罚同时向周围 3 名敌人连锁 60% 伤害' },
  /* ---------------- 道士 · 符箓 ---------------- */
  talisman:     { name: '引雷',   special: 'explode',    mods: { dmg: -10 }, desc: '目标周围 2.5m 感电爆裂，追加 60% 伤害' },
  talismanarrow:{ name: '追魂',   special: 'echo',       mods: { dmg: -10 }, desc: '0.45 秒后追射一轮（60%）' },
  swordrain:    { name: '剑冢',   special: 'endBurst',   mods: { dmg: -10 }, desc: '符剑落尽时巨剑砸落，90% 范围伤害' },
  mastersigil:  { name: '符雷阵', special: 'chain',      mods: { dmg: -10 }, desc: '符阵落雷向周围 3 名敌人连锁 60%' },
  /* ---------------- 道士 · 召唤 ---------------- */
  summon:       { name: '兽群',   special: 'extraSummon', mods: { dmg: -10 }, desc: '额外召出一头灵狼（共两头）' },
  whitetiger:   { name: '虎啸',   special: 'shockwave',  mods: { dmg: -10 }, desc: '白虎出场震退 4.5m 内敌人并造成 60% 伤害' },
  azuredragon:  { name: '龙威',   special: 'shockwave',  mods: { dmg: -10 }, desc: '青龙出场震退 4.5m 内敌人并造成 60% 伤害' },
  /* ---------------- 道士 · 丹道 ---------------- */
  heal:         { name: '济世',   special: 'healBurst',  mods: { dmg: -15 }, desc: '治疗同时对周围敌人造成 60% 治疗量伤害' },
  poison:       { name: '腐骨',   special: 'slowField',  mods: { dur: -1 },  desc: '毒雾内敌人持续减速 35%' },
  taiji:        { name: '玄阵',   special: 'regenField', mods: { dur: -2 },  desc: '阵中每秒回复 2% 生命上限' },
  antidote:     { name: '净化',   special: 'cleanse',    mods: { dur: -2 },  desc: '清除所有负面状态并回复 10% 生命上限' },
  revive:       { name: '魂护',   special: 'regenField', mods: { dur: -4 },  desc: '还魂期间每秒回复 2% 生命上限' }
};

/* 把机制变体合并进 variants[2]。
 * 合并发生在加载期一次，之后 UI / 施法 / 存档都直接读 SKILLS，
 * 不需要到处判断「这条变体是不是机制型的」。 */
(function mergeSpecialVariants() {
  for (const id in SKILL_SPECIAL_VARIANTS) {
    const sk = SKILLS[id];
    if (!sk || !sk.variants || !sk.variants[2]) continue;
    sk.variants[2] = Object.assign({}, sk.variants[2], SKILL_SPECIAL_VARIANTS[id]);
  }
})();

/* 取某个变体的机制 id；没登记过的一律当「纯数值变体」返回 null */
function variantSpecial(sk, v) {
  if (!sk || !sk.variants || !sk.variants[v]) return null;
  const sp = sk.variants[v].special;
  return sp && SKILL_SPECIALS[sp] ? sp : null;
}

/* 机制型变体统计（回归脚本 / 面板提示共用） */
function specialVariantCount() {
  let n = 0;
  for (const id in SKILLS) {
    const sk = SKILLS[id];
    if (!sk.variants) continue;
    for (let i = 0; i < sk.variants.length; i++) if (variantSpecial(sk, i)) n++;
  }
  return n;
}
