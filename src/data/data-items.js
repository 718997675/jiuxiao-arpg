/* ============================================================
 * 数据层 · 装备
 * 槽位 / 护甲基底 / 武器基底 / 副手基底 / 随机词缀 / 套装
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

/* ---------------- 装备基底 ---------------- */
const SLOTS = {
  helm: { name: '头盔', glyph: '盔' },
  chest: { name: '战甲', glyph: '甲' },
  shoulders: { name: '护肩', glyph: '肩' },
  gloves: { name: '护手', glyph: '手' },
  boots: { name: '战靴', glyph: '靴' },
  belt: { name: '腰带', glyph: '带' },
  amulet: { name: '项链', glyph: '链' },
  ring: { name: '戒指', glyph: '戒' },
  weapon: { name: '武器', glyph: '武' },
  offhand: { name: '副手', glyph: '副' }
};
const SLOT_ORDER = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];

const ARMOR_BASES = {
  helm: [['布巾', 3], ['皮盔', 7], ['铁盔', 14], ['玄铁盔', 24], ['龙鳞盔', 38]],
  chest: [['布衣', 5], ['皮甲', 11], ['锁子甲', 22], ['玄铁重铠', 36], ['龙鳞战甲', 54]],
  shoulders: [['布肩', 2], ['皮护肩', 5], ['铁护肩', 10], ['玄铁护肩', 17], ['龙鳞护肩', 27]],
  gloves: [['布手', 2], ['皮护手', 4], ['铁护手', 8], ['玄铁护手', 14], ['龙鳞护手', 22]],
  boots: [['草鞋', 2], ['皮靴', 4], ['铁靴', 8], ['玄铁战靴', 14], ['踏云靴', 22]],
  belt: [['布带', 1], ['皮带', 3], ['铁腰带', 6], ['玄铁腰带', 10], ['蟠龙带', 16]],
  amulet: [['木牌', 0], ['玉坠', 0], ['灵玉项链', 0], ['九幽魂链', 0], ['太初神链', 0]],
  ring: [['铜戒', 0], ['银戒', 0], ['灵玉戒', 0], ['九幽魔戒', 0], ['太初神戒', 0]],
  offhand: [['木盾', 4], ['铁盾', 9], ['灵木盾', 16], ['玄铁塔盾', 26], ['龙鳞盾', 40]],
  weapon: [['凡兵', 0]]
};

const WEAPON_BASES = {
  warrior: [
    { name: '铁剑', shape: 'sword', dmg: [7, 12], speed: 1.0 },
    { name: '斩马刀', shape: 'saber', dmg: [11, 18], speed: 0.95 },
    { name: '开山巨斧', shape: 'axe', dmg: [16, 26], speed: 0.82 },
    { name: '偃月刀', shape: 'glaive', dmg: [22, 34], speed: 0.88 },
    { name: '龙纹战刃', shape: 'glaive', dmg: [30, 46], speed: 0.92 }
  ],
  mage: [
    { name: '桃木杖', shape: 'staff', dmg: [6, 10], speed: 1.0 },
    { name: '青玉法杖', shape: 'staff', dmg: [10, 16], speed: 1.0 },
    { name: '玄冰法杖', shape: 'staff', dmg: [15, 24], speed: 1.0 },
    { name: '焚天杖', shape: 'staff', dmg: [22, 33], speed: 1.0 },
    { name: '太初法杖', shape: 'staff', dmg: [30, 45], speed: 1.05 }
  ],
  taoist: [
    { name: '桃木剑', shape: 'taojian', dmg: [6, 11], speed: 1.05 },
    { name: '符文剑', shape: 'sword', dmg: [10, 17], speed: 1.05 },
    { name: '七星剑', shape: 'sword', dmg: [15, 25], speed: 1.05 },
    { name: '雷符剑', shape: 'sword', dmg: [22, 34], speed: 1.05 },
    { name: '天罡剑', shape: 'sword', dmg: [30, 46], speed: 1.1 }
  ]
};

const OFFHAND_BASES = {
  warrior: [['木盾', 4], ['铁盾', 9], ['灵木盾', 16], ['玄铁塔盾', 26], ['龙鳞盾', 40]],
  mage: [['木珠', 2], ['灵珠', 6], ['碧水珠', 11], ['焚天珠', 18], ['太初珠', 28]],
  taoist: [['纸符', 2], ['桃符', 6], ['八卦镜', 11], ['镇魂铃', 18], ['太初令', 28]]
};

/* ---------------- 词缀池 ---------------- */
/* tier: 1 普通 2 强 3 极 */
const AFFIXES = [
  { key: 'atk', pre: ['锋锐的', '嗜血的', '裂石的'], suf: ['· 锋刃', '· 破军'], min: 3, max: 9, tier: 1 },
  { key: 'atkPct', pre: ['狂暴的', '无双的'], suf: ['· 战意', '· 屠戮'], min: 4, max: 12, tier: 2 },
  { key: 'str', pre: ['蛮力的', '巨力的'], suf: ['· 蛮力', '· 山岳'], min: 2, max: 7, tier: 1 },
  { key: 'agi', pre: ['迅捷的', '轻灵的'], suf: ['· 疾风', '· 流云'], min: 2, max: 7, tier: 1 },
  { key: 'vit', pre: ['坚韧的', '厚土的'], suf: ['· 磐石', '· 长生'], min: 2, max: 8, tier: 1 },
  { key: 'int', pre: ['通灵的', '悟道的'], suf: ['· 灵台', '· 玄机'], min: 2, max: 8, tier: 1 },
  { key: 'hp', pre: ['壮硕的', '不息的'], suf: ['· 命血', '· 生息'], min: 12, max: 34, tier: 1 },
  { key: 'hpPct', pre: ['不朽的', '万寿的'], suf: ['· 不朽', '· 玄龟'], min: 5, max: 12, tier: 2 },
  { key: 'mp', pre: ['灵泉的', '盈溢的'], suf: ['· 灵泉', '· 潮生'], min: 8, max: 22, tier: 1 },
  { key: 'def', pre: ['坚固的', '厚重的'], suf: ['· 铁壁', '· 金刚'], min: 3, max: 10, tier: 1 },
  { key: 'crit', pre: ['精准的', '夺命的'], suf: ['· 洞察', '· 断魂'], min: 2, max: 6, tier: 2 },
  { key: 'critDmg', pre: ['残虐的', '灭杀的'], suf: ['· 戮心', '· 裂魂'], min: 8, max: 24, tier: 2 },
  { key: 'aspd', pre: ['疾风的', '疾影的'], suf: ['· 疾影', '· 迅雷'], min: 3, max: 8, tier: 2 },
  { key: 'moveSpd', pre: ['踏云的', '逐日的'], suf: ['· 踏云', '· 追风'], min: 3, max: 7, tier: 1 },
  { key: 'lifesteal', pre: ['饮血的', '噬魂的'], suf: ['· 饮血', '· 噬魂'], min: 1, max: 4, tier: 3 },
  { key: 'skillDmg', pre: ['通玄的', '奥妙的'], suf: ['· 通玄', '· 法界'], min: 5, max: 14, tier: 2 },
  { key: 'cdr', pre: ['流转的', '天机的'], suf: ['· 流转', '· 天机'], min: 2, max: 7, tier: 3 },
  { key: 'goldFind', pre: ['富贵的', '聚宝的'], suf: ['· 聚宝', '· 财源'], min: 6, max: 18, tier: 1 },
  { key: 'magicFind', pre: ['奇遇的', '天缘的'], suf: ['· 奇遇', '· 天缘'], min: 5, max: 15, tier: 2 },
  { key: 'allRes', pre: ['避劫的', '五行不侵的'], suf: ['· 五行', '· 避劫'], min: 3, max: 9, tier: 2 },
  { key: 'thorns', pre: ['棘刺的', '反噬的'], suf: ['· 棘刺', '· 反噬'], min: 3, max: 10, tier: 1 },
  { key: 'killHeal', pre: ['贪婪的', '嗜杀的'], suf: ['· 汲取', '· 归元'], min: 4, max: 14, tier: 2 },
  { key: 'mpReg', pre: ['凝神的', '静心的'], suf: ['· 凝神', '· 静心'], min: 1, max: 3, tier: 1 },
  { key: 'summonDmg', pre: ['御兽的', '通灵的'], suf: ['· 御兽', '· 妖契'], min: 6, max: 16, tier: 2 }
];

/* ---------------- 套装 ---------------- */
const SETS = {
  qinglong: {
    id: 'qinglong', name: '青龙偃月', cls: 'warrior', color: '#5ce08a',
    pieces: ['青龙盔', '青龙战甲', '青龙护肩', '青龙护手', '青龙战靴'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '攻击力 +15%', stats: { atkPct: 15 } },
      { need: 3, text: '攻速 +12%，生命偷取 +4%', stats: { aspd: 12, lifesteal: 4 } },
      { need: 5, text: '旋风斩伤害 +120%，攻击附带雷霆', stats: { skillDmg: 20 }, flag: 'thunder' }
    ]
  },
  zhuque: {
    id: 'zhuque', name: '朱雀焚天', cls: 'mage', color: '#ff8a5c',
    pieces: ['朱雀冠', '朱雀法袍', '朱雀云肩', '朱雀手衣', '朱雀云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '技能伤害 +20%', stats: { skillDmg: 20 } },
      { need: 3, text: '冷却缩减 +15%，灵力上限 +15%', stats: { cdr: 15 } },
      { need: 5, text: '火球爆炸范围 +60%，并留下火海', stats: { atkPct: 10 }, flag: 'firetrail' }
    ]
  },
  xuanwu: {
    id: 'xuanwu', name: '玄武镇魂', cls: 'taoist', color: '#7ec8ff',
    pieces: ['玄武巾', '玄武道袍', '玄武云肩', '玄武手衣', '玄武云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '生命上限 +25%', stats: { hpPct: 25 } },
      { need: 3, text: '召唤物伤害 +60%，护甲 +30', stats: { summonDmg: 60, def: 30 } },
      { need: 5, text: '回春咒变为群体治疗并附加护盾', stats: { skillDmg: 15 }, flag: 'groupheal' }
    ]
  },
  jiuyou: {
    id: 'jiuyou', name: '九幽', cls: null, color: '#b98cff',
    pieces: ['九幽魂链', '九幽魔戒', '九幽腰带', '九幽令'],
    slots: ['amulet', 'ring', 'belt', 'offhand'],
    bonuses: [
      { need: 2, text: '移动速度 +10%', stats: { moveSpd: 10 } },
      { need: 3, text: '暴击伤害 +30%，击杀回复 +15', stats: { critDmg: 30, killHeal: 15 } },
      { need: 4, text: '全属性 +15，暴击率 +10%', stats: { str: 15, agi: 15, vit: 15, int: 15, crit: 10 } }
    ]
  },
  tiangang: {
    id: 'tiangang', name: '天罡', cls: null, color: '#ffd166',
    pieces: ['天罡战盔', '天罡战甲', '天罡护肩', '天罡战靴', '天罡之刃'],
    slots: ['helm', 'chest', 'shoulders', 'boots', 'weapon'],
    bonuses: [
      { need: 2, text: '攻击力 +20%，暴击率 +8%', stats: { atkPct: 20, crit: 8 } },
      { need: 3, text: '技能伤害 +30%，冷却缩减 +12%', stats: { skillDmg: 30, cdr: 12 } },
      { need: 5, text: '对首领伤害 +40%，全属性 +25', stats: { str: 25, agi: 25, vit: 25, int: 25 }, flag: 'bossSlayer' }
    ]
  }
};
