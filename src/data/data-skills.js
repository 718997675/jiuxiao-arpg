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
    type: 'bolt', mult: 1.7, range: 16, elem: 'sigil', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '掷出雷符，召下天雷击中目标，造成 {dmg} 点符法伤害。',
    variants: [
      { name: '双符', desc: '额外 1 张，单张 -30%', mods: { count: 1, dmg: -30 } },
      { name: '强符', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省力', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  talismanarrow: {
    id: 'talismanarrow', name: '符箭', cls: 'taoist', tree: '符箓', glyph: '箭', unlock: 14, cd: 2.6, cost: 12,
    type: 'bolt', mult: 1.0, range: 16, elem: 'sigil', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '一次射出三张追踪符，每张造成 {dmg} 点符法伤害。',
    variants: [
      { name: '连珠', desc: '符箭 +2，单发 -25%', mods: { count: 2, dmg: -25 } },
      { name: '强矢', desc: '伤害 +25%', mods: { dmg: 25 } },
      { name: '省灵', desc: '消耗 -25%', mods: { cost: 25 } }
    ]
  },
  swordrain: {
    id: 'swordrain', name: '万剑归宗', cls: 'taoist', tree: '符箓', glyph: '剑', unlock: 26, cd: 50, cost: 45,
    type: 'swordrain', mult: 1.15, radius: 12, count: 22, dur: 3.5, elem: 'sigil', anim: 'cast', cast: 'ground', castRange: 18,
    desc: '万道符剑自天而降，3.5 秒内对范围内敌人造成 22 次 {dmg} 点伤害。',
    variants: [
      { name: '万剑', desc: '符剑 +6 道', mods: { count: 6 } },
      { name: '利剑', desc: '每道伤害 +20%', mods: { dmg: 20 } },
      { name: '省灵', desc: '消耗 -20%', mods: { cost: 20 } }
    ]
  },
  mastersigil: {
    id: 'mastersigil', name: '天师符', cls: 'taoist', tree: '符箓', glyph: '师', unlock: 30, cd: 20, cost: 30,
    type: 'zone', mult: 1.0, radius: 6, dur: 6, tick: 0.9, elem: 'sigil', anim: 'cast', cast: 'ground', castRange: 14,
    desc: '布下天师符阵，6 秒内每 0.9 秒对阵中敌人落雷，每次 {dmg} 点符法伤害。',
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
    desc: '召出一头灵狼协同作战 25 秒，灵狼继承施法者 60% 攻击力。',
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

/* 技能条槽位数：5 格（P1 从 8 收敛，见 SKILL_ARCHETYPE）。
 *
 * 8 格 × 2 套 = 16 格 > 12 个技能，等于没有取舍，点也被摊薄；
 * 收敛到 5 格（左键 + 1~4）之后每个位只养一个技能，才养得起来。
 *
 * 格的语义不再是「随便放」：第 i 格对应 SKILL_ARCHETYPE 的第 i 个功能位，
 * 只能放本位继承的技能（见 skillBarMigrate / Game.assignSkillBar）。
 * 传世授予的跨职业秘技没有功能位，允许放任意空格（见 skillArchSlotOf 返回 0）。 */
const SKILL_BAR_SLOTS = 5;
/* 每格的键位（只用于界面文案与探针断言；真正的绑定在 game.js bindInput） */
const SKILL_BAR_KEYS = ['左键', '1', '2', '3', '4'];
/* 快捷栏套数：2 套（甲 / 乙）。
 * 一套打 boss、一套刷图是 ARPG 的常规需求 —— 5 格固定位之后两套仍然有意义：
 * 同一个位可以放本位里的不同技能（例：② 号位刷图用裂地震击、打 boss 用斩杀）。 */
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

/* 技能等级上限：10（点出来的那一档）。
 *
 * 曾经 10 → 压到 5 → [P2] 回到 10。压到 5 的理由是「8 格动作条摊薄了点数，
 * 1→10 要吃掉 9 点，分枝就没得点了」；现在动作条收到 5 格（左键 + 1~4）、
 * 点数集中（见 SKILL_POINT_RATE），单个技能养到 10 级才是「这是我的主输出」。
 *
 * 数值成长**不在这个文件里写死**：唯一口径是 skillLvMul(lv)（分段曲线，
 * 1~10 每级 8%、11~15 每级 4%、16~20 每级 2% → 20 级 2.02 倍）。
 * 战斗（castSkill）与面板预览读同一个函数，SKILL_LV_STEP 已随 P2 删除。
 *
 * 老档 lv 6~10 曾经在 normalizeProgress 里被压到 5，压掉的那些级数补不回来
 * （点也没留下）；从现在起 clamp 的上界直接读这里，不再写死数字。 */
const SKILL_LV_MAX = 10;

/* 技能点供给：角色等级 × 1.5（40 级 60 点）。
 *
 * 为什么必须和「上限 10」同时改：5 个技能位全部点到 10 级要 45 点、
 * 加上每条取向 / 变体各 1 点共 55 点；如果还是「1 级 1 点」的 40 点，
 * 改完只会从「每个都弱」变成「一个都养不起」。
 *
 * 60 点 vs 点满整棵树（12 主动 × 9 + 21 点被动 = 129 点）≈ 46%，
 * 所以取舍还在，只是取舍从「点哪条线」变成了「点多少」。
 * 方案 §8 建议「技能点 / 天赋点拆成两套」，这里**没有拆**：
 * 天赋点已有独立系统（Game.talentPoints），再拆一次总和会到 130 点
 * ≈ 点满全树，取舍直接消失。 */
const SKILL_POINT_RATE = 1.5;

/* 某角色等级能拿到的技能点总数（不含已投，扣减在 Game.skillPoints 里） */
function skillPointPool(level) {
  const n = Math.max(1, Math.round(Number(level) || 1));
  return Math.floor(n * SKILL_POINT_RATE);
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
 * 旧「机制型变体」层已退役（P3 收尾）
 *
 * v1.8.0 时变体 Ⅲ 靠 special id + applySkillSpecial() 改机制；
 * P3 把 36 只技能整体切到 SKILL_TREE.branches[*].form 之后，
 * 这一层的结算入口（castSkill 里的 vsp 分支）永远走不到了 ——
 * 留着就是「数据看着有用、改了没反应」的陷阱，所以整块删掉。
 *
 * 现在变体走两条路：
 *   · 数据：SKILL_TREE.branches[id].form（三条，含 beh / mods）
 *   · 结算：skill-beh.js 的 SKILL_BEH + Game.effSkillMods(id)
 * 旧 SKILLS[id].variants 只作为「老档 e.v 索引的含义」保留，
 * 不再参与任何数值或机制结算（见 skillFormIdx 的回落）。
 * ============================================================ */

/* ============================================================
 * 技能位（P0 · 5 个功能位 × 三职业独立内容）
 *
 * 这一层只描述「一个职业拿哪 5 个技能、每个技能长到几级会变成什么样」，
 * 不参与任何结算 —— P0 阶段战斗与存档行为与之前完全一致
 * （castSkill 仍按 SKILL_ORDER + 动作条走；[P1] 动作条已收敛到 5 格）。
 *
 * 为什么要有它：
 *   8 格 × 2 套 = 16 格 > 12 技能，等于没有取舍；第 6 个之后左手按不到。
 *   收敛到 5 格（左键 + 1~4）之后点数集中，每个技能才养得起来。
 *
 * 字段：
 *   slots[].elem = 该位能不能注入元素。④ 是增益槽，注入「火/冰」没有语义，
 *                 所以 ④ 恒为 false，只选增益类型（进攻 / 防御 / 治疗）。
 *   classes[cls].slots[].inherit = 从现有 SKILLS 里继承哪些 id（P1 收敛时对账用）
 *   classes[cls].slots[].tiers   = 1→10 的可见台阶文案，键只有 1/3/5/7/9/10
 *                                  （2/4/6/8 是纯数值，没有专属文案）
 *
 * 与方案的一处偏差（有意）：docs/SKILL-REDESIGN-PLAN.md §3.2 把 `talisman`
 * 列进了法师 ① 号位，但 `talisman`（五雷符）是道士技能 —— 法师 ① 收
 * `fireball` / `iceshard`，「符」整个留给道士。
 *
 * P1 对账纪律：现有 12 个技能必须**每一个都有位接**（`skillArchOrphans(cls)` 为空）。
 * 收进来的 5 个孤儿按「机制去哪」而不是「名字像谁」安置：
 *   execute 斩杀 / skysfall 天崩 → 刀客 ②（高伤桶；天崩本就是 ② 的「三连震」台阶）
 *   chain 雷弧链              → 法师 ①（填充·小范围；跳 5 目标 = ① 的「自动索敌」台阶）
 *   starfall 陨星天火          → 法师 ②（就是 ② 的「陨石雨」台阶）
 *   revive 还魂               → 道士 ④（防御类增益）
 * ============================================================ */
const SKILL_ARCHETYPE = {
  /* 槽位元数据：键位、定位、冷却量级、元素开关 */
  slots: [
    { no: 1, key: 'basic', name: '基础攻击', glyph: '壹', keybind: '左键', role: '填充 · 单体/小范围', cdMin: 0, cdMax: 2, elem: true },
    { no: 2, key: 'burst', name: '中程爆发', glyph: '贰', keybind: '1', role: '高伤 · 突进 · 指定位置', cdMin: 6, cdMax: 12, elem: true },
    { no: 3, key: 'guard', name: '护身清场', glyph: '叁', keybind: '2', role: '贴身范围 · 控场', cdMin: 4, cdMax: 10, elem: true },
    { no: 4, key: 'buff', name: '自身增益', glyph: '肆', keybind: '3', role: '爆发窗口 · 防御 · 治疗', cdMin: 16, cdMax: 30, elem: false },
    { no: 5, key: 'core', name: '职业核心', glyph: '伍', keybind: '4', role: '职业 identity', cdMin: 20, cdMax: 45, elem: true }
  ],
  /* ④ 号位不带元素，改为选增益类型（拍板 #2） */
  buffKinds: [
    { key: 'atk', name: '进攻', desc: '伤害 / 攻速 / 暴击窗口' },
    { key: 'def', name: '防御', desc: '减伤 / 护盾 / 格挡' },
    { key: 'heal', name: '治疗', desc: '回血 / 驱散 / 续航' }
  ],
  classes: {
    /* ============ 刀客 · 近战 / 怒气 / 兵形 ============ */
    warrior: {
      name: '刀客', elem: 'phys', resource: '怒气',
      slots: [
        {
          no: 1, title: '连斩', inherit: ['whirl'],
          tiers: {
            /* 5 / 9 / 10 的文案与 SKILL_TIER_EVO.whirl 的 label 逐字一致（契约对账）。
               原稿写「可移动」是空话 —— 这个引擎本来就没有施法锁定。 */
            1: '单发横扫', 3: '双发', 5: '横扫后原地余震 2 秒', 7: '三连斩',
            9: '横扫撕裂 · 命中目标受伤 +15%', 10: '命中回怒翻倍，可常驻'
          }
        },
        {
          /* P1 对账：`skysfall`（天崩·三连震）本就是本位的「三连震」台阶，
             `execute`（斩杀）是单体高伤，归「高伤」桶。原来这两个是孤儿。 */
          no: 2, title: '裂地震击', inherit: ['quake', 'leap', 'thrust', 'execute', 'skysfall'],
          tiers: {
            /* 10 原稿「眩晕 1.5 秒」是倒退：1 级就晕 1.6 秒。
               改成二次崩塌 —— 与 SKILL_TIER_EVO.quake 的 label 逐字一致。 */
            1: '单体震击', 3: '溅射', 5: '余震钉住敌人', 7: '三连震',
            9: '地裂范围扩大', 10: '地裂二次崩塌'
          }
        },
        {
          no: 3, title: '剑阵', inherit: ['swordarray', 'riposte'],
          tiers: {
            /* 5 原稿「剑阵跟随移动」是现状不是台阶（本来就跟随），改成减速；
               5/9/10 与 SKILL_TIER_EVO.swordarray 的 label 逐字一致。
               3 / 7 的「双圈 / 三圈」还没接数量轴（swordarray 不在
               SKILL_COUNT_BASE 里），面板照旧标「待」。 */
            1: '单圈剑鸣', 3: '双圈', 5: '剑阵内敌人减速', 7: '三圈',
            9: '剑阵内减伤', 10: '剑阵内自动反击'
          }
        },
        {
          no: 4, title: '血怒', inherit: ['bloodrage', 'warcry', 'shieldwall'],
          tiers: {
            /* 原稿 Lv3「队友共享」/ Lv7「范围扩大」在这个游戏里是空话：
               三只增益全是 cast:'self'、单人局没有队友 —— 写了也是假话。
               改成施法瞬回 + 延长，两只手都数得出来的实际变化。 */
            1: '单体增益', 3: '施法瞬间回复 12% 生命', 5: '增益期间吸血', 7: '增益持续 +3 秒',
            9: '击杀延长', 10: '增益期间免疫控制'
          }
        },
        {
          no: 5, title: '兵形', inherit: ['avatar'], unit: false,
          /* 刀客 ⑤ 不产生任何独立单位（拍板 #6）：只有刀式与终结技 */
          forms: [
            { name: '斩锋式', desc: '伤害 +15%、攻速 +10%' },
            { name: '镇岳式', desc: '减伤 20%、格挡 +15%' },
            { name: '摧城式', desc: '无视 30% 护甲，对护甲目标 +20%' }
          ],
          finisher: { name: '断岳斩', desc: '前 4 个技能命中积「刃势」，满层释放高伤破甲' },
          ultimate: { name: '剑神降世', desc: '12 秒全强化状态（改造自 avatar，不召唤单位）' },
          tiers: {
            1: '斩锋式', 3: '解锁镇岳式', 5: '刃势满层 · 断岳斩', 7: '解锁摧城式',
            9: '切换刀式保留刃势', 10: '剑神降世（12 秒全强化）'
          }
        }
      ]
    },

    /* ============ 法师 · 远程 / 元素 / 法相 ============ */
    mage: {
      name: '法师', elem: 'fire', resource: '灵力',
      slots: [
        {
          /* P1 对账：`chain`（雷弧链·自动跳 5 目标）归「填充 · 小范围」，
             正好是 ① 的 9/10 台阶「环绕 / 自动索敌」要的机制。 */
          no: 1, title: '元素飞弹', inherit: ['fireball', 'iceshard', 'chain'],
          tiers: {
            /* 5 原本写「火球命中爆炸」—— 那是 1 级就有的现状，不是台阶。
               改成爆炸更大 + 附带灼烧，才是这一级真正多出来的东西。 */
            1: '单发火球', 3: '双发', 5: '爆炸范围 +50%，爆炸处留火海', 7: '三连发',
            9: '环绕火球', 10: '飞弹自动索敌'
          }
        },
        {
          /* P1 对账：`starfall`（陨星天火）就是本位 9/10 台阶的「陨石雨」。 */
          no: 2, title: '陨石', inherit: ['meteor', 'judgement', 'blizzard', 'starfall'],
          tiers: {
            1: '单体陨石', 3: '溅射', 5: '双陨', 7: '三连落',
            9: '陨石雨', 10: '陨石雨持续 8 秒'
          }
        },
        {
          no: 3, title: '火墙', inherit: ['firewall', 'frostnova', 'thundercloud'],
          tiers: {
            1: '单段火墙', 3: '双段', 5: '持续火环', 7: '三段',
            9: '火墙跟随', 10: '火墙结束爆炸'
          }
        },
        {
          no: 4, title: '护盾', inherit: ['iceshield', 'pyroclasm'],
          tiers: {
            1: '单体护盾', 3: '队友共享', 5: '护盾反伤', 7: '护盾强化',
            9: '护盾爆发', 10: '护盾破碎时冰冻周围'
          }
        },
        {
          no: 5, title: '元素法相', inherit: [], unit: false, isNew: true,
          /* 只强化主元素（默认口径）：全场技能附带主元素效果，不是召唤物 */
          aura: { durMin: 10, durMax: 15, mainElemOnly: true },
          tiers: {
            1: '火法相', 3: '元素切换', 5: '法相期间全技能灼烧', 7: '法相延长',
            9: '法相结束新星', 10: '法相期间免疫打断'
          }
        }
      ]
    },

    /* ============ 道士 · 持续伤害 / 增益 / 召唤 ============ */
    taoist: {
      name: '道士', elem: 'sigil', resource: '灵力',
      slots: [
        {
          no: 1, title: '符箓', inherit: ['talisman'],
          tiers: {
            1: '单张雷符', 3: '双符', 5: '雷符连锁', 7: '三符',
            9: '雷符阵', 10: '雷符自动追踪'
          }
        },
        {
          no: 2, title: '毒雾', inherit: ['talismanarrow', 'swordrain', 'poison'],
          tiers: {
            1: '单团毒雾', 3: '双团', 5: '毒雾蔓延', 7: '三团',
            9: '雾内敌人减速', 10: '毒雾内敌人死亡爆毒'
          }
        },
        {
          no: 3, title: '太极', inherit: ['taiji', 'mastersigil'],
          tiers: {
            1: '单圈太极', 3: '双圈', 5: '太极推开敌人', 7: '三圈',
            9: '太极内减伤', 10: '太极内每秒回血'
          }
        },
        {
          /* P1 对账：`revive`（还魂·免死一次）是防御类增益，归「回春」。 */
          no: 4, title: '回春', inherit: ['heal', 'antidote', 'revive'],
          tiers: {
            1: '单体治疗', 3: '队友共享', 5: '治疗持续回复增强', 7: '范围扩大',
            9: '瞬间驱散', 10: '低于 30% 生命自动触发'
          }
        },
        {
          no: 5, title: '召灵兽', inherit: ['summon', 'whitetiger', 'azuredragon'], unit: true,
          /* 技能产物：限时、随技能等级变化，不是宠物（本仓库没有宠物系统） */
          note: '限时召唤物，属技能产物；宠物系统未实现，不在本计划内',
          tiers: {
            1: '灵狼', 3: '双狼', 5: '白虎（范围攻击）', 7: '虎 + 狼',
            9: '青龙（范围 + 光环）', 10: '四象召唤（三兽同场）'
          }
        }
      ]
    }
  }
};

/* ============================================================
 * 等级台阶（P0 · 基础 1→10，词条推到 20）
 *
 * 每两级必须有一次「看得见」的变化（数量 / 形态），纯数值等级不超过 2 级。
 * 11~20 是**精通层**：只做数值与光效，不再新增形态台阶（内容量会爆炸）。
 *
 * 曲线是分段的（拍板 #3）：1~10 每级 8%、11~15 每级 4%、16~20 每级 2%
 * → 20 级约 2.02 倍。原来单一 SKILL_LV_STEP=0.08 全程 8% 会到 2.52 倍，
 * 再乘数量轴 DPS 会到 7~12 倍。
 *
 * 【P2 已接线】：`castSkill` 与面板预览都调 `skillLvMul()`，
 * 不再有第二套「每级 +N%」的算式（原来的 SKILL_LV_STEP 已删）。
 * ============================================================ */
const SKILL_TIERS = {
  baseMax: 10,     // 玩家投入能到的等级
  cap: 20,         // 加上词条/套装后的有效等级上限
  masteryAt: 15,   // 精通层的小质变点
  /* 基础 10 级的台阶；kind: base / num / count / evo1 / evo2 / final */
  steps: [
    { lv: 1, kind: 'base', name: '基础形态', note: '学会' },
    { lv: 2, kind: 'num', name: '数值 +', note: '过渡' },
    { lv: 3, kind: 'count', name: '数量 +1', note: '1 发 → 2 发' },
    { lv: 4, kind: 'num', name: '数值 +', note: '过渡' },
    { lv: 5, kind: 'evo1', name: '进化 Ⅰ', note: '改变一个核心行为' },
    { lv: 6, kind: 'num', name: '数值 +', note: '过渡' },
    { lv: 7, kind: 'count', name: '数量 +1', note: '2 → 3 发' },
    { lv: 8, kind: 'num', name: '数值 +', note: '过渡' },
    { lv: 9, kind: 'evo2', name: '进化 Ⅱ', note: '形态再次变化' },
    { lv: 10, kind: 'final', name: '终极形态', note: '解锁常驻被动 / 新行为' }
  ],
  /* 有专属文案的台阶（其余是纯数值） */
  visible: [1, 3, 5, 7, 9, 10],
  curve: [
    { from: 1, to: 10, pct: 8 },
    { from: 11, to: 15, pct: 4 },
    { from: 16, to: 20, pct: 2 }
  ],
  /* UI 标签：1~10 圆满，11~20 精进 */
  labels: { base: '圆满', mastery: '精进', masteryTip: '来自装备 / 词缀，不占技能点' }
};

/* 某等级的总伤害倍率（1 级 = 1.0）。战斗与面板共用同一个函数（P2 接线）。 */
function skillLvMul(lv) {
  const T = SKILL_TIERS;
  const n = Math.max(1, Math.min(T.cap, Math.round(Number(lv) || 1)));
  let mul = 1;
  for (const seg of T.curve) {
    /* 升级增量发生在「超过 1 级」的每一级上：1 级本身不加成 */
    const lo = Math.max(seg.from, 2);
    const hi = Math.min(n, seg.to);
    if (hi >= lo) mul += (hi - lo + 1) * seg.pct / 100;
  }
  return Math.round(mul * 10000) / 10000;
}

/* 某等级对应的台阶（1~10 返回台阶对象；11+ 返回 null，属精通层） */
function skillTierStep(lv) {
  const n = Math.round(Number(lv) || 0);
  return SKILL_TIERS.steps.find(s => s.lv === n) || null;
}

/* ============================================================
 * 数量台阶（P2b · Lv3 / Lv7 各 +1 发）
 *
 * 方案 §5.1 写着「Lv3 1 发→2 发、Lv7 2 发→3 发」。通道是现成的 ——
 * `smod.count` 早就被 castSkill 里那些「连发 / 多片 / 多落点 / 多数符」的
 * case 消费掉了，所以这一层**只负责「几级给几发」与「多发怎么不失控」**，
 * 不新增任何战斗机制。
 *
 * ⚠ 只给「真的会读 count 通道」的技能：不读通道的近战 / 增益 / 召唤
 * 挂上 +1 也只是一句空话。所以先列能力表，`dev/test-skill-p2b.js`
 * 会拿它和 game.js 的 case 块逐条对账，两边不一致就变红。
 * ============================================================ */

/* 等级 → 额外发数。1 / 3 / 7 是台阶，2 / 4 / 6 是纯数值，不进这张表 */
const SKILL_TIER_COUNT = { 3: 1, 7: 1 };

/* 额外发数上限（方案 §13：「count 总量上限 8」）。
 * 台阶 + 装备 + 天赋 + 变体四个来源在 castSkill 里相加后统一截断，
 * 不截的话「星阙 +8 颗」再叠台阶会变成一整屏陨石。 */
const SKILL_COUNT_CAP = 8;

/* 每个消费 count 通道的技能「原本几发」。这些数字**必须**与 game.js 里
 * `N + sextra` 的字面量一致（契约逐条比），不在这里凭空发明。 */
const SKILL_COUNT_BASE = {
  whirl: 1,          // 一次横扫；台阶让它变成 2 段 / 3 段
  fireball: 1,
  frostnova: 1,
  chain: 5,          // 基础 5 跳
  iceshard: 3,       // 三枚扇形
  starfall: 16,      // 一场雨 16 颗
  talisman: 1,       // 一张符（先打最近目标，多余的分配给别的怪）
  talismanarrow: 3,
  poison: 1,         // 一团毒雾；台阶让它变成 2 团 / 3 团（围着落点散开）
  swordrain: 22      // 万剑 22 道
};

/* 多发递减系数：第 n 发 ×0.85^n（方案 §13）。
 * 3 发直接三倍伤害是「数量轴」最容易炸的地方；乘上系数后
 * 1→2→3 发的总伤是 1.85 / 2.57 倍，而不是 2 / 3 倍。 */
const SKILL_COUNT_DECAY = 0.85;

function skillCountBase(id) {
  return SKILL_COUNT_BASE[id] || 0;
}

/* 基数上限的读取口（战斗与契约共用；数据表缺失时按 8 兜底） */
function skillCountCap() {
  return SKILL_COUNT_CAP;
}

/* 这个技能会不会读 count 通道（false 的技能不配拿数量台阶） */
function skillCountCapable(id) {
  return skillCountBase(id) > 0;
}

/* 台阶给多少发（只看技能等级，不看装备 / 天赋 / 变体 ——
 * 装备那部分照旧走 stats.skillMods → smod.count，两条来源在 castSkill 相加） */
function skillTierCount(id, lv) {
  if (!skillCountCapable(id)) return 0;
  const n = Math.round(Number(lv) || 1);
  let extra = 0;
  for (const k in SKILL_TIER_COUNT) if (n >= Number(k)) extra += SKILL_TIER_COUNT[k];
  return Math.min(extra, SKILL_COUNT_CAP);
}

/* 多发折算成「单发伤害修正（%）」。
 *
 * 为什么不按发序逐发递减：castSkill 里消费 count 的 case 各自循环，
 * 逐发递减要改七八处（而 starfall / swordrain 的弹道甚至不走 spow），
 * 改漏一处就是「面板说减了、打出来没减」。
 * 这里把 Σ0.85^i 折成整轮统一的单发系数 —— **总伤与逐发递减完全相等**，
 * 只用一个 dmg 修正表达，而 dmg 修正本来就是面板预览 / 装备 / 战斗共用的口径。
 *
 * 基础发数越大，这个修正越接近 0（万剑 22 道 +2 道只 −1.8%），
 * 所以「本来就是弹幕」的技能不会被这条规则误伤。 */
function skillCountDmgPct(id, extra) {
  const base = skillCountBase(id);
  const k = Math.max(0, Math.round(Number(extra) || 0));
  if (!base || !k) return 0;
  let total = base;
  for (let i = 1; i <= k; i++) total += Math.pow(SKILL_COUNT_DECAY, i);
  const per = total / (base + k);
  return Math.round((per - 1) * 1000) / 10;
}

/* ============================================================
 * 进化台阶（P2b 第二批 · Lv5 / Lv9 / Lv10）
 *
 * 数量台阶只改「几发」，进化台阶改「这一发是什么样」。所以它必须
 * 挂在**具体技能 id** 上，不能挂技能位 —— 刀客 ② 里躺着 quake / leap /
 * thrust / execute / skysfall 五个技能，而「地裂持续 2 秒」只该长在 quake 上。
 *
 * 字段：
 *   label  = 面板台阶文案的「回读」（契约拿它跟 slot.tiers 对账，不许各说各话）
 *   mods   = 六通道修正，与装备 / 分支 / 变体走同一个 merge（game.js effSkillMods）
 *   beh    = 行为键，走 skill-beh.js 的同一套 handler（登记了才允许投点/生效）
 *
 * 合并顺序在 Game.branchBeh 里：**台阶最前**，精研 / 取向 / 变体依次覆盖同名键。
 * 台阶是「等级送的」，玩家主动选的东西应该盖过它 —— 反过来的话，选「疾风」
 * 变体的玩家会发现台阶把 rotate 参数换回了默认值，等于选项被吃了。
 *
 * 只登记「真的接进战斗」的条目：没实现的台阶保持不登记，面板照旧标「待」。
 * ============================================================ */
const SKILL_TIER_EVO = {
  /* ---------------- 刀客 ① 连斩（旋风斩） ---------------- */
  whirl: {
    /* 不用 move：变体 Ⅰ「疾风」本来就带 move，而它是**默认变体**（没选过也是 0 号）。
       台阶再用同一个键，玩家在默认配置下永远看不到区别 —— 等于没做。
       改用余震：横扫之后原地再震 2 秒，与多段、吸怪都不抢键。 */
    5: { label: '横扫后原地余震 2 秒', beh: { aftershock: 2, aftershockPct: 30 } },
    /* Lv9 原写「横扫吸怪」（gather 3.4）—— 变体「聚怪」用的就是 gather 这一族键，
       选过聚怪的玩家这一级会被整条覆盖（点了毫无反应），没选的则等于白拿了变体。
       改成「撕裂」：命中的敌人 4 秒内受伤 +15%，与余震 / 回怒都不抢键。 */
    9: { label: '横扫撕裂 · 命中目标受伤 +15%', beh: { vuln: 15 } },
    /* 回怒翻倍：whirl case 那一发固定回 8 点（Lv10 前就是这么写的），
       这里给它乘 2 —— 用 rageMul 而不是再塞一个 ragePerHit，避免和「回流」重复计。 */
    10: { label: '命中回怒翻倍，可常驻', beh: { rageMul: 2, passive: 1 } }
  },

  /* ---------------- 法师 ① 元素飞弹（火球） ---------------- */
  fireball: {
    /* 火球 Lv1 本来就命中爆炸，「爆炸」不是台阶 —— 台阶给的是更大的爆炸
       和爆炸处留下的火海。为什么不用 burnPct：精研「燎原」已经占了 burnPct
       25，同名键按「分支覆盖台阶」的规则会把 35 顶回去，等于白写。
       用 case 消费的 firePatch：命中点真的生成一片火，看得见也打得到。 */
    5: { label: '爆炸范围 +50%，爆炸处留火海',
      mods: { radius: 50 }, beh: { firePatch: 1 } },
    9: { label: '环绕火球', beh: { orbit: 5 } },
    10: { label: '飞弹自动索敌', beh: { autoTarget: 12 } }
  },

  /* ---------------- 道士 ① 符箓（五雷符） ----------------
   * 符箓是「飞出去再炸」的技能，所以三条台阶全部落在**落雷点**：
   *   Lv5 连锁 / Lv9 符阵 走 hook（chainHit / zoneHit），不走通用 hit 通道 ——
   *       通用通道以「落点（准星）」为圆心，而符会追到怪身上，两者恒不重合，
   *       拿准星当圆心等于在半空里劈雷。
   *   Lv10 改追：命中后再锁下一个目标，符肉眼可见地拐弯（seek）。
   * 三个键都由 talisman case 的 onHit 消费，见 game.js。 */
  talisman: {
    5: { label: '雷符连锁', beh: { chainHit: 2, chainHitPct: 60 } },
    9: { label: '雷符阵', beh: { zoneHit: 2, zonePct: 10 } },
    10: { label: '雷符自动追踪', beh: { seek: 2, seekPct: 70 } }
  },

  /* ---------------- 道士 ② 毒雾（蚀骨毒雾） ----------------
   * 这一位三条台阶都能用现成通道，只有一个坑：Lv10「死亡爆毒」和变体「尸毒」
   * 是同一个机制 —— 原样照抄的话，选过尸毒的玩家点到 Lv10 会「毫无反应」。
   * 所以台阶额外给 spreadRad（4.2 码 vs 变体的 3.2），已经拿了尸毒的仍然变强。 */
  poison: {
    5: { label: '毒雾蔓延', beh: { grow: 60 } },
    /* Lv9 原写「毒雾跟随」—— 变体「追随」用的就是 follow 键，整级被覆盖。
       改成「雾内敌人减速」：与剑阵共用 slowField（每跳刷新的持续场），
       毒雾的每一跳里刷新一次。粘滞的雾自带减速，读起来也顺。 */
    9: { label: '雾内敌人减速', beh: { slowField: 40, slowFieldDur: 0.9 } },
    10: { label: '毒雾内敌人死亡爆毒', beh: { spread: 1, spreadRad: 4.2 } }
  },

  /* ---------------- 刀客 ② 裂地震击（地裂） ----------------
   * 三条都走现成通道，且都是「落点为中心」的地面技能 —— 通用 hit 相位正好
   * 用对了地方（符箓那边必须绕开它，地裂这边反过来可以直用）。
   *
   * 原稿两条是假话，都改了：
   *   Lv5 「地裂持续 2 秒」—— 精研「余震」3 级就自动给，玩家早就有了。
   *        改成「余震钉住敌人」：余震从纯掉血变成带控。
   *   Lv10「眩晕 1.5 秒」—— 1 级就晕 1.6 秒，写了等于倒扣 0.1 秒。
   *        改成「二次崩塌」（echo 80%），才配得上「终极形态」。 */
  quake: {
    5: { label: '余震钉住敌人', beh: { aftershockStun: 0.5 } },
    9: { label: '地裂范围扩大', mods: { radius: 35 } },
    10: { label: '地裂二次崩塌', beh: { echo: 80 } }
  },

  /* ---------------- 刀客 ③ 剑阵（护身清场） ----------------
   * 原稿 Lv5「剑阵跟随移动」是假台阶：剑阵**本来就**跟着人走
   * （`pinOn ? aim : playerGroup.position`），写它等于没写。
   * 改成「阵内敌人减速」—— 这个位在方案里的定位是「贴身范围 · 控场」，
   * 而 Lv9 减伤 / Lv10 反击都偏防御，减速才是把「控场」补上的那一环。
   *
   * 三条台阶的共同点：都要判「阵在哪、人还在不在阵里」。钉阵变体下
   * 玩家能走出去 —— 无条件常驻就把这个选择吃掉了。所以三条全部由
   * swordarray case 铺一份 Game.swordField，由 damagePlayer 消费。 */
  swordarray: {
    5: { label: '剑阵内敌人减速', beh: { slowField: 45, slowFieldDur: 0.9 } },
    9: { label: '剑阵内减伤', beh: { arrayGuard: 20 } },
    /* 不和 counter（格挡反击）撞键：那个只在「挡下来」时走、要过格挡判定、
       数值乘盾墙；这个不要求格挡、有 0.4 秒内置冷却、口径独立。 */
    10: { label: '剑阵内自动反击', beh: { arrayCounter: 120 } }
  },

  /* ---------------- 刀客 ④ 血怒（增益位） ----------------
   * 这一位躺着 bloodrage / warcry / shieldwall 三只增益，而**一个格位只放一只** ——
   * 三条台阶必须三只都接，否则玩家把 warcry 放进 ④ 号位时看到的就是假话。
   *
   * 两条原稿撞了既有分支，都绕开了（撞键 = 点了没反应）：
   *   Lv9 「击杀延长」= warcry 精研「战鼓」的 `killExtend`。战鼓是**精研**（3 级自动给），
   *        台阶用同键一定被它覆盖，warcry 玩家永远看不到这一级。
   *        改用 `killProlong`：另一条延长通道，各记各的账，与战鼓的 +1 叠加。
   *   Lv10「免疫控制」不能用 `immune`（那是**无敌帧**，血怒变体「无我」和 avatar 精研在用的
   *        就是它，语义完全不同），也不能用 `noSlow`（它给 ccResist 100，
   *        而 ccResist 在 game.js 里被 CLAMP 到 60 —— 只减时长，不免疫）。
   *        新增 `ccImmune`：增益期间**根本不再被挂上**减速 / 中毒，施法瞬间还清掉已有的。
   *
   * Lv5 吸血看着也撞（warcry 自带 lifesteal 8%），但它是**叠加**不是覆盖：
   * 台阶 +10% 之后 warcry 是 18%，血怒 / 盾墙从 0 变 10% —— 三只都真的变强。
   *
   * Lv3 / Lv7 原稿是「队友共享」「范围扩大」，这个游戏里两件都是空话
   * （cast:'self' + 单人局），已换成瞬回与延长：三只增益都吃，且不与变体
   * 「持久」（sdur）撞键 —— 那条加在 sdur 上，这条加在 tierDur 上，叠加。 */
  bloodrage: {
    3: { label: '施法瞬间回复 12% 生命', beh: { healOnCast: 12 } },
    5: { label: '增益期间吸血', beh: { lifesteal: 10 } },
    7: { label: '增益持续 +3 秒', beh: { tierDur: 3 } },
    9: { label: '击杀延长', beh: { killProlong: 2, killProlongMax: 6 } },
    10: { label: '增益期间免疫控制', beh: { ccImmune: 1 } }
  },
  warcry: {
    3: { label: '施法瞬间回复 12% 生命', beh: { healOnCast: 12 } },
    5: { label: '增益期间吸血', beh: { lifesteal: 10 } },
    7: { label: '增益持续 +3 秒', beh: { tierDur: 3 } },
    9: { label: '击杀延长', beh: { killProlong: 2, killProlongMax: 6 } },
    10: { label: '增益期间免疫控制', beh: { ccImmune: 1 } }
  },
  shieldwall: {
    3: { label: '施法瞬间回复 12% 生命', beh: { healOnCast: 12 } },
    5: { label: '增益期间吸血', beh: { lifesteal: 10 } },
    7: { label: '增益持续 +3 秒', beh: { tierDur: 3 } },
    9: { label: '击杀延长', beh: { killProlong: 2, killProlongMax: 6 } },
    10: { label: '增益期间免疫控制', beh: { ccImmune: 1 } }
  }
};

/* 该技能在 lv 级累积解锁的台阶等级（Lv10 同时拥有 5 / 9 / 10 三层 ——
 * 文案是递进的：「剑阵内减伤」到 10 级当然还在，只是又多了自动反击）。 */
function skillTierEvoList(id, lv) {
  const pack = SKILL_TIER_EVO[id];
  if (!pack) return [];
  const n = Math.round(Number(lv) || 1);
  return Object.keys(pack).map(Number).filter(k => n >= k).sort((a, z) => a - z);
}

/* 累积后的 mods / beh；什么都没给返回 null（不是空对象，调用方靠 null 短路） */
function skillTierEvo(id, lv) {
  const pack = SKILL_TIER_EVO[id];
  if (!pack) return null;
  const out = { mods: null, beh: null, lvs: [] };
  for (const k of skillTierEvoList(id, lv)) {
    const e = pack[k];
    if (!e) continue;
    out.lvs.push(k);
    if (e.mods) {
      out.mods = out.mods || {};
      for (const ch in e.mods) out.mods[ch] = (out.mods[ch] || 0) + e.mods[ch];
    }
    if (e.beh) {
      out.beh = out.beh || {};
      for (const key in e.beh) out.beh[key] = e.beh[key];
    }
  }
  return (out.mods || out.beh) ? out : null;
}

/* 只取行为层（Game.branchBeh 合并用） */
function skillTierBeh(id, lv) {
  const e = skillTierEvo(id, lv);
  return (e && e.beh) ? e.beh : null;
}

/* 台阶修正（与 branchMods / formMods 同类的六通道修正）。
 * 3 / 7 级给「几发」，5 / 9 / 10 级看 SKILL_TIER_EVO 登记了什么。 */
function skillTierMods(id, lv) {
  const out = {};
  const extra = skillTierCount(id, lv);
  if (extra) {
    out.count = extra;
    out.dmg = skillCountDmgPct(id, extra);
  }
  const evo = skillTierEvo(id, lv);
  if (evo && evo.mods) {
    for (const ch in evo.mods) out[ch] = (out[ch] || 0) + evo.mods[ch];
  }
  return Object.keys(out).length ? out : null;
}

/* 一个职业的 5 个技能位（含槽位元数据）；未知职业返回 [] */
function skillArchList(cls) {
  const pack = SKILL_ARCHETYPE.classes[cls];
  if (!pack) return [];
  return pack.slots.map(s => {
    const meta = SKILL_ARCHETYPE.slots.find(m => m.no === s.no) || {};
    return Object.assign({ cls: cls, clsName: pack.name }, meta, s);
  });
}

/* 单个技能位；越界返回 null */
function skillArchSlot(cls, no) {
  return skillArchList(cls).find(s => s.no === no) || null;
}

/* 台阶实装状态：面板据此把台阶标成「已生效 / 待实装」，别让文案自己吹。
 *
 * 判据不是手写清单，而是「这个位里真有技能走得到那条通道」：
 *   Lv1              —— 基础形态，永远成立
 *   Lv3 / Lv7        —— 位内至少一个技能真的消费 count 通道（否则「双发」只是文案）
 *   Lv5 / Lv9 / Lv10 —— 位内至少一个技能在 SKILL_TIER_EVO 里登记了这一级
 *
 * 改文案时不用动这里：文案说「双发」而位里没有 count 技能、或说「环绕」
 * 而 evo 表里没这一级，契约会直接红。 */
/* 某一级台阶「实装了没有」（面板据此标「待」角标）。
 *
 * 判据两路：数量台阶走 skillCountCapable，形态台阶走 SKILL_TIER_EVO。
 * **3 / 7 不再无条件当数量级** —— 血怒位（刀客 ④）的 Lv3 / Lv7 是「施法瞬回」
 * 与「持续 +3 秒」，没有发数可言；先判数量、再落回 EVO 才是对的。
 * 反过来，某个位若把 Lv3 写成发数却没登记在 SKILL_COUNT_BASE 里，这里会返回
 * false → 面板标「待」，正好暴露「写了没接」。 */
function skillSlotTierDone(cls, no, lv) {
  const slot = skillArchSlot(cls, no);
  if (!slot) return false;
  const n = Math.round(Number(lv) || 0);
  if (n === 1) return true;
  const own = slot.inherit || [];
  if ((n === 3 || n === 7) && own.some(id => skillCountCapable(id))) return true;
  return own.some(id => {
    const pack = SKILL_TIER_EVO[id];
    return !!(pack && pack[n]);
  });
}

/* 某职业 5 个位继承的全部现有技能 id（去重）—— P1 收敛时用它核对覆盖率 */
function skillArchInherit(cls) {
  const out = [];
  for (const s of skillArchList(cls)) {
    for (const id of (s.inherit || [])) if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

/* 反向查：现有技能 id 落在哪个位（0 = 没有位接它，即「孤儿」；同职业内唯一，
 * 因为一个技能只能占一个位，见 test-skill-p0 的「不能重复占用」） */
function skillArchSlotOf(cls, id) {
  for (const s of skillArchList(cls)) {
    if ((s.inherit || []).indexOf(id) >= 0) return s.no;
  }
  return 0;
}

/* 孤儿技能：树上还在、但 5 个功能位里没有任何一个接它。
 * 这类技能 P1 收敛后会「在树上、动作条放不上」，必须在收敛前清零。 */
function skillArchOrphans(cls) {
  const owned = skillArchInherit(cls);
  return (SKILL_ORDER[cls] || []).filter(id => owned.indexOf(id) < 0);
}

/* 老技能条 → 5 格技能条（P1 存档迁移的唯一口径，纯函数、node 可测）。
 *
 * 老档是 8 格随便放，新档是「第 i 格 = 第 i 个功能位」。迁移规则：
 *   1. 本职业技能按 skillArchSlotOf 归位（quake 一律进 1 号位 = ② 号位…）；
 *      同一格撞了两个技能时**保留老数组里靠前的那个**，后面的丢弃
 *      （反正新口径下它本来也上不了场，留着是死数据）。
 *   2. 传世授予的跨职业秘技没有功能位（返回 0），第二遍按先后顺序塞进剩余空格，
 *      一件都不丢。
 *   3. 幂等：把 5 格合法数组再迁一次，结果不变。
 *
 * 空位保持 null —— 自动补技能是 Game.skillBar(true) 的事，迁移不越权。
 */
function skillBarMigrate(arr, cls) {
  const out = new Array(SKILL_BAR_SLOTS).fill(null);
  if (!Array.isArray(arr) || !arr.length) return out;
  const spare = [];
  for (const raw of arr) {
    const id = (typeof raw === 'string' && raw) ? raw : null;
    if (!id || !SKILLS[id]) continue;
    const no = skillArchSlotOf(cls, id);
    if (!no) { spare.push(id); continue; }          // 秘技 / 未登记：第二遍处理
    const at = no - 1;
    if (out[at] === null) out[at] = id;             // 同格冲突：先到先得
  }
  for (const id of spare) {
    const at = out.indexOf(null);
    if (at < 0) break;
    out[at] = id;
  }
  return out;
}
