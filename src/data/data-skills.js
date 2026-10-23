/* ============================================================
 * 数据层 · 技能
 * 18 个主动技能（3 职业 × 6）+ 技能栏顺序
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

/* ---------------- 技能 ---------------- */
/* type: melee / aoe / proj / dash / buff / heal / summon / zone / rain / nova / ultimate */
const SKILLS = {
  /* 战士 */
  whirl: {
    id: 'whirl', name: '旋风斩', cls: 'warrior', glyph: '旋', unlock: 1, cd: 2.6, cost: 12,
    type: 'aoe', mult: 1.5, radius: 4.2, anim: 'spin', cast: 'self', castRange: 0,
    desc: '挥刀横斩，对身周所有敌人造成 {dmg} 点伤害。命中回复怒气。'
  },
  thrust: {
    id: 'thrust', name: '烈焰突刺', cls: 'warrior', glyph: '突', unlock: 4, cd: 6, cost: 18,
    type: 'dash', mult: 2.6, radius: 2.6, range: 11, anim: 'thrust', cast: 'dir', castRange: 11,
    desc: '化作烈焰向前突进，沿途撞飞敌人并造成 {dmg} 点火焰伤害。'
  },
  warcry: {
    id: 'warcry', name: '战意咆哮', cls: 'warrior', glyph: '吼', unlock: 8, cd: 16, cost: 20,
    type: 'buff', buff: { atkPct: 30, aspd: 20, lifesteal: 8, dur: 8 }, anim: 'roar', cast: 'self', castRange: 0,
    desc: '8 秒内攻击力 +30%、攻速 +20%、生命偷取 +8%。'
  },
  quake: {
    id: 'quake', name: '裂地震击', cls: 'warrior', glyph: '裂', unlock: 12, cd: 9, cost: 24,
    type: 'aoe', mult: 3.2, radius: 5.6, stun: 1.6, anim: 'slam', cast: 'ground', castRange: 10,
    desc: '重击指定位置的大地，对该处敌人造成 {dmg} 点伤害并击晕 1.6 秒。'
  },
  bloodrage: {
    id: 'bloodrage', name: '血怒', cls: 'warrior', glyph: '血', unlock: 18, cd: 24, cost: 15,
    type: 'buff', buff: { crit: 25, critDmg: 60, moveSpd: 15, dur: 10 }, anim: 'roar', cast: 'self', castRange: 0,
    desc: '10 秒内暴击率 +25%、暴击伤害 +60%、移速 +15%。'
  },
  avatar: {
    id: 'avatar', name: '剑神降世', cls: 'warrior', glyph: '神', unlock: 26, cd: 60, cost: 40,
    type: 'ultimate', mult: 6.5, radius: 9, buff: { atkPct: 60, aspd: 40, dur: 12 }, anim: 'slam', cast: 'self', castRange: 0,
    desc: '召唤剑神附体，造成 {dmg} 点范围巨伤，12 秒内攻击力 +60%、攻速 +40%。'
  },
  /* 法师 */
  fireball: {
    id: 'fireball', name: '火球术', cls: 'mage', glyph: '火', unlock: 1, cd: 1.4, cost: 10,
    type: 'proj', mult: 1.9, speed: 22, radius: 2.4, elem: 'fire', anim: 'cast', cast: 'dir', castRange: 16,
    desc: '掷出爆裂火球，命中后爆炸造成 {dmg} 点火焰伤害。'
  },
  frostnova: {
    id: 'frostnova', name: '冰霜新星', cls: 'mage', glyph: '冰', unlock: 4, cd: 7, cost: 20,
    type: 'nova', mult: 2.2, radius: 6, slow: 0.45, slowDur: 3.5, elem: 'ice', anim: 'cast', cast: 'ground', castRange: 9,
    desc: '在指定位置引爆寒气，造成 {dmg} 点冰霜伤害并减速 45%，持续 3.5 秒。'
  },
  chain: {
    id: 'chain', name: '雷弧链', cls: 'mage', glyph: '雷', unlock: 8, cd: 6, cost: 22,
    type: 'chain', mult: 1.7, jumps: 5, range: 10, elem: 'lightning', anim: 'cast', cast: 'enemy', castRange: 12,
    desc: '放出连环雷弧，在最多 5 名敌人间跳跃，每次造成 {dmg} 点雷电伤害。'
  },
  meteor: {
    id: 'meteor', name: '炎爆术', cls: 'mage', glyph: '爆', unlock: 12, cd: 10, cost: 30,
    type: 'meteor', mult: 4.2, radius: 5.5, delay: 0.9, elem: 'fire', anim: 'cast', cast: 'ground', castRange: 16,
    desc: '在指定位置召下陨火，1 秒后爆炸造成 {dmg} 点火焰伤害。'
  },
  iceshield: {
    id: 'iceshield', name: '玄冰护盾', cls: 'mage', glyph: '盾', unlock: 18, cd: 18, cost: 18,
    type: 'shield', absorb: 0.35, dur: 10, anim: 'cast', cast: 'self', castRange: 0,
    desc: '凝结冰盾，10 秒内吸收相当于生命上限 35% 的伤害。'
  },
  starfall: {
    id: 'starfall', name: '陨星天火', cls: 'mage', glyph: '星', unlock: 26, cd: 55, cost: 50,
    type: 'rain', mult: 1.6, radius: 10, count: 16, dur: 4, elem: 'fire', anim: 'cast', cast: 'ground', castRange: 18,
    desc: '天穹崩裂，4 秒内降下 16 颗陨星，每颗造成 {dmg} 点火焰伤害。'
  },
  /* 道士 */
  talisman: {
    id: 'talisman', name: '五雷符', cls: 'taoist', glyph: '符', unlock: 1, cd: 1.2, cost: 8,
    type: 'bolt', mult: 1.7, range: 16, elem: 'lightning', anim: 'cast', cast: 'enemy', castRange: 16,
    desc: '掷出雷符，召下天雷击中目标，造成 {dmg} 点雷电伤害。'
  },
  summon: {
    id: 'summon', name: '召灵兽', cls: 'taoist', glyph: '兽', unlock: 4, cd: 20, cost: 25,
    type: 'summon', dur: 25, anim: 'cast', cast: 'self', castRange: 0,
    desc: '召出一头灵狼为你作战 25 秒，灵狼继承你 60% 的攻击力。'
  },
  heal: {
    id: 'heal', name: '回春咒', cls: 'taoist', glyph: '愈', unlock: 8, cd: 12, cost: 22,
    type: 'heal', healPct: 0.28, hot: 0.12, anim: 'cast', cast: 'self', castRange: 0,
    desc: '立刻回复 {heal} 点生命，并在 4 秒内再回复 12% 生命上限。'
  },
  poison: {
    id: 'poison', name: '蚀骨毒雾', cls: 'taoist', glyph: '毒', unlock: 12, cd: 8, cost: 24,
    type: 'zone', mult: 0.75, radius: 5, dur: 6, tick: 0.8, elem: 'poison', anim: 'cast', cast: 'ground', castRange: 14,
    desc: '布下毒雾，6 秒内持续腐蚀其中敌人，每 0.8 秒造成 {dmg} 点毒素伤害。'
  },
  taiji: {
    id: 'taiji', name: '太极玄阵', cls: 'taoist', glyph: '极', unlock: 18, cd: 20, cost: 24,
    type: 'buff', buff: { def: 40, allRes: 30, mpReg: 6, dur: 12 }, anim: 'cast', cast: 'self', castRange: 0,
    desc: '12 秒内护甲 +40%、全抗 +30%、灵力回复 +6/秒。'
  },
  swordrain: {
    id: 'swordrain', name: '万剑归宗', cls: 'taoist', glyph: '剑', unlock: 26, cd: 50, cost: 45,
    type: 'swordrain', mult: 1.15, radius: 12, count: 22, dur: 3.5, elem: 'none', anim: 'cast', cast: 'ground', castRange: 18,
    desc: '万道符剑自天而降，3.5 秒内对范围内敌人造成 22 次 {dmg} 点伤害。'
  }
};

const SKILL_ORDER = {
  warrior: ['whirl', 'thrust', 'warcry', 'quake', 'bloodrage', 'avatar'],
  mage: ['fireball', 'frostnova', 'chain', 'meteor', 'iceshield', 'starfall'],
  taoist: ['talisman', 'summon', 'heal', 'poison', 'taiji', 'swordrain']
};
