/* ============================================================
 * 《九霄·山海录》 数据层
 * 职业 / 技能 / 装备基底 / 随机词缀 / 套装 / 怪物 / Boss / 地图 / 任务
 * ============================================================ */

const RND = (a, b) => a + Math.random() * (b - a);
const RNDI = (a, b) => Math.floor(RND(a, b + 1));
const PICK = arr => arr[Math.floor(Math.random() * arr.length)];
const CHANCE = p => Math.random() < p;
const CLAMP = (v, a, b) => Math.max(a, Math.min(b, v));
const LERP = (a, b, t) => a + (b - a) * t;
const DIST2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = RNDI(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; }
function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toString(); }
function pct(n) { return Math.round(n) + '%'; }

/* ---------------- 存档：localStorage 不可用时的内存兜底 ----------------
 * 沙箱 iframe、隐私模式、部分浏览器的 file:// 下，访问 localStorage 会直接抛异常。
 * 以前这一步没兜住，会让 init() 中断 —— 表现就是「界面还在、3D 全黑」。
 */
const Store = {
  key: 'jiuxiao_save_v1',
  mem: null,
  get() {
    try { return localStorage.getItem(this.key); } catch (e) { return this.mem; }
  },
  set(v) {
    this.mem = v;
    try { localStorage.setItem(this.key, v); } catch (e) { /* 落到内存里，本局照样能存 */ }
  },
  has() { return !!this.get(); }
};

/* ---------------- 崩溃兜底：出错时给出可见提示，而不是一片黑 ------------- */
let __fatalShown = false;
function showFatal(msg) {
  if (__fatalShown) return;
  __fatalShown = true;
  try {
    const box = document.getElementById('fatal');
    const pre = document.getElementById('fatalMsg');
    if (!box || !pre) return;
    pre.textContent = String(msg || '未知错误').slice(0, 600);
    box.style.display = 'flex';
    console.error('[九霄] 运行出错：', msg);
  } catch (e) { /* 兜底失败就算了 */ }
}
window.addEventListener('error', e => {
  if (e && e.message) showFatal(e.message + (e.filename ? '\n' + e.filename + ':' + e.lineno : ''));
});
window.addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  showFatal((r && (r.stack || r.message)) || r || 'Promise rejection');
});


/* ---------------- 稀有度 ---------------- */
const RARITY = {
  common: { key: 'common', name: '凡品', color: '#cfcfd6', mul: 1.0, affixes: 0, weight: 46 },
  magic: { key: 'magic', name: '灵品', color: '#67a9ff', mul: 1.12, affixes: 2, weight: 30 },
  rare: { key: 'rare', name: '玄品', color: '#ffc857', mul: 1.28, affixes: 3, weight: 15 },
  legendary: { key: 'legendary', name: '神兵', color: '#ff7a3c', mul: 1.55, affixes: 4, weight: 6 },
  set: { key: 'set', name: '套装', color: '#5ce08a', mul: 1.42, affixes: 3, weight: 3 }
};

/* ---------------- 属性定义 ---------------- */
const STATS = {
  atk: { label: '攻击力', pct: false },
  atkPct: { label: '攻击力', pct: true },
  def: { label: '护甲', pct: false },
  hp: { label: '生命上限', pct: false },
  hpPct: { label: '生命上限', pct: true },
  mp: { label: '灵力上限', pct: false },
  mpReg: { label: '灵力回复/秒', pct: false },
  str: { label: '力量', pct: false },
  agi: { label: '敏捷', pct: false },
  vit: { label: '体质', pct: false },
  int: { label: '灵力', pct: false },
  crit: { label: '暴击率', pct: true },
  critDmg: { label: '暴击伤害', pct: true },
  aspd: { label: '攻击速度', pct: true },
  moveSpd: { label: '移动速度', pct: true },
  lifesteal: { label: '生命偷取', pct: true },
  skillDmg: { label: '技能伤害', pct: true },
  cdr: { label: '冷却缩减', pct: true },
  goldFind: { label: '金币获取', pct: true },
  magicFind: { label: '奇遇机缘', pct: true },
  allRes: { label: '全元素抗性', pct: true },
  thorns: { label: '伤害反弹', pct: false },
  killHeal: { label: '击杀回复生命', pct: false },
  summonDmg: { label: '召唤物伤害', pct: true }
};

/* ---------------- 职业 ---------------- */
const CLASSES = {
  warrior: {
    key: 'warrior', name: '战士', title: '刀客', res: '怒气', resColor: '#ffa53a',
    color: 0xc0392b, cloth: 0x8e2f24, accent: 0xe6b04a,
    icon: '刀', desc: '近身缠斗，以血肉之躯开山裂石。攻击积攒怒气，愈战愈勇。',
    base: { str: 14, agi: 6, vit: 13, int: 3 },
    growth: { str: 2.4, agi: 0.9, vit: 2.2, int: 0.3 },
    mainStat: 'str', statMul: 1.15, hpPerVit: 14, mpPerInt: 3,
    baseAtk: 9, baseHp: 170, baseMp: 40,
    startWeapon: 'warrior0'
  },
  mage: {
    key: 'mage', name: '法师', title: '术士', res: '灵力', resColor: '#63b3ff',
    color: 0x3b6fd4, cloth: 0x2a4a9e, accent: 0x8fd6ff,
    icon: '法', desc: '引动五行雷火，以毁天灭地之术焚尽群敌。灵力为源，攻守皆远。',
    base: { str: 4, agi: 6, vit: 9, int: 15 },
    growth: { str: 0.4, agi: 0.9, vit: 1.6, int: 2.7 },
    mainStat: 'int', statMul: 1.5, hpPerVit: 11, mpPerInt: 6,
    baseAtk: 7, baseHp: 135, baseMp: 90,
    startWeapon: 'mage0'
  },
  taoist: {
    key: 'taoist', name: '道士', title: '符师', res: '道力', resColor: '#7ee0a0',
    color: 0x2f8f6a, cloth: 0x1f6b50, accent: 0xe8e0a0,
    icon: '道', desc: '驱符役兽，以毒雾与雷符消磨强敌，亦能自愈续命。持久战的王者。',
    base: { str: 6, agi: 9, vit: 12, int: 12 },
    growth: { str: 0.9, agi: 1.4, vit: 2.0, int: 2.2 },
    mainStat: 'int', statMul: 1.3, hpPerVit: 12, mpPerInt: 5,
    baseAtk: 8, baseHp: 150, baseMp: 70,
    startWeapon: 'taoist0'
  }
};

/* ---------------- 技能 ---------------- */
/* type: melee / aoe / proj / dash / buff / heal / summon / zone / rain / nova / ultimate */
const SKILLS = {
  /* 战士 */
  whirl: {
    id: 'whirl', name: '旋风斩', cls: 'warrior', glyph: '旋', unlock: 1, cd: 2.6, cost: 12,
    type: 'aoe', mult: 1.5, radius: 4.2, anim: 'spin',
    desc: '挥刀横斩，对身周所有敌人造成 {dmg} 点伤害。命中回复怒气。'
  },
  thrust: {
    id: 'thrust', name: '烈焰突刺', cls: 'warrior', glyph: '突', unlock: 4, cd: 6, cost: 18,
    type: 'dash', mult: 2.6, radius: 2.6, range: 11, anim: 'thrust',
    desc: '化作烈焰向前突进，沿途撞飞敌人并造成 {dmg} 点火焰伤害。'
  },
  warcry: {
    id: 'warcry', name: '战意咆哮', cls: 'warrior', glyph: '吼', unlock: 8, cd: 16, cost: 20,
    type: 'buff', buff: { atkPct: 30, aspd: 20, lifesteal: 8, dur: 8 }, anim: 'roar',
    desc: '8 秒内攻击力 +30%、攻速 +20%、生命偷取 +8%。'
  },
  quake: {
    id: 'quake', name: '裂地震击', cls: 'warrior', glyph: '裂', unlock: 12, cd: 9, cost: 24,
    type: 'aoe', mult: 3.2, radius: 5.6, stun: 1.6, anim: 'slam',
    desc: '重击大地，对周围敌人造成 {dmg} 点伤害并击晕 1.6 秒。'
  },
  bloodrage: {
    id: 'bloodrage', name: '血怒', cls: 'warrior', glyph: '血', unlock: 18, cd: 24, cost: 15,
    type: 'buff', buff: { crit: 25, critDmg: 60, moveSpd: 15, dur: 10 }, anim: 'roar',
    desc: '10 秒内暴击率 +25%、暴击伤害 +60%、移速 +15%。'
  },
  avatar: {
    id: 'avatar', name: '剑神降世', cls: 'warrior', glyph: '神', unlock: 26, cd: 60, cost: 40,
    type: 'ultimate', mult: 6.5, radius: 9, buff: { atkPct: 60, aspd: 40, dur: 12 }, anim: 'slam',
    desc: '召唤剑神附体，造成 {dmg} 点范围巨伤，12 秒内攻击力 +60%、攻速 +40%。'
  },
  /* 法师 */
  fireball: {
    id: 'fireball', name: '火球术', cls: 'mage', glyph: '火', unlock: 1, cd: 1.4, cost: 10,
    type: 'proj', mult: 1.9, speed: 22, radius: 2.4, elem: 'fire', anim: 'cast',
    desc: '掷出爆裂火球，命中后爆炸造成 {dmg} 点火焰伤害。'
  },
  frostnova: {
    id: 'frostnova', name: '冰霜新星', cls: 'mage', glyph: '冰', unlock: 4, cd: 7, cost: 20,
    type: 'nova', mult: 2.2, radius: 6, slow: 0.45, slowDur: 3.5, elem: 'ice', anim: 'cast',
    desc: '寒气自足下炸开，造成 {dmg} 点冰霜伤害并减速 45%，持续 3.5 秒。'
  },
  chain: {
    id: 'chain', name: '雷弧链', cls: 'mage', glyph: '雷', unlock: 8, cd: 6, cost: 22,
    type: 'chain', mult: 1.7, jumps: 5, range: 10, elem: 'lightning', anim: 'cast',
    desc: '放出连环雷弧，在最多 5 名敌人间跳跃，每次造成 {dmg} 点雷电伤害。'
  },
  meteor: {
    id: 'meteor', name: '炎爆术', cls: 'mage', glyph: '爆', unlock: 12, cd: 10, cost: 30,
    type: 'meteor', mult: 4.2, radius: 5.5, delay: 0.9, elem: 'fire', anim: 'cast',
    desc: '在指定位置召下陨火，1 秒后爆炸造成 {dmg} 点火焰伤害。'
  },
  iceshield: {
    id: 'iceshield', name: '玄冰护盾', cls: 'mage', glyph: '盾', unlock: 18, cd: 18, cost: 18,
    type: 'shield', absorb: 0.35, dur: 10, anim: 'cast',
    desc: '凝结冰盾，10 秒内吸收相当于生命上限 35% 的伤害。'
  },
  starfall: {
    id: 'starfall', name: '陨星天火', cls: 'mage', glyph: '星', unlock: 26, cd: 55, cost: 50,
    type: 'rain', mult: 1.6, radius: 10, count: 16, dur: 4, elem: 'fire', anim: 'cast',
    desc: '天穹崩裂，4 秒内降下 16 颗陨星，每颗造成 {dmg} 点火焰伤害。'
  },
  /* 道士 */
  talisman: {
    id: 'talisman', name: '五雷符', cls: 'taoist', glyph: '符', unlock: 1, cd: 1.2, cost: 8,
    type: 'bolt', mult: 1.7, range: 16, elem: 'lightning', anim: 'cast',
    desc: '掷出雷符，召下天雷击中目标，造成 {dmg} 点雷电伤害。'
  },
  summon: {
    id: 'summon', name: '召灵兽', cls: 'taoist', glyph: '兽', unlock: 4, cd: 20, cost: 25,
    type: 'summon', dur: 25, anim: 'cast',
    desc: '召出一头灵狼为你作战 25 秒，灵狼继承你 60% 的攻击力。'
  },
  heal: {
    id: 'heal', name: '回春咒', cls: 'taoist', glyph: '愈', unlock: 8, cd: 12, cost: 22,
    type: 'heal', healPct: 0.28, hot: 0.12, anim: 'cast',
    desc: '立刻回复 {heal} 点生命，并在 4 秒内再回复 12% 生命上限。'
  },
  poison: {
    id: 'poison', name: '蚀骨毒雾', cls: 'taoist', glyph: '毒', unlock: 12, cd: 8, cost: 24,
    type: 'zone', mult: 0.75, radius: 5, dur: 6, tick: 0.8, elem: 'poison', anim: 'cast',
    desc: '布下毒雾，6 秒内持续腐蚀其中敌人，每 0.8 秒造成 {dmg} 点毒素伤害。'
  },
  taiji: {
    id: 'taiji', name: '太极玄阵', cls: 'taoist', glyph: '极', unlock: 18, cd: 20, cost: 24,
    type: 'buff', buff: { def: 40, allRes: 30, mpReg: 6, dur: 12 }, anim: 'cast',
    desc: '12 秒内护甲 +40%、全抗 +30%、灵力回复 +6/秒。'
  },
  swordrain: {
    id: 'swordrain', name: '万剑归宗', cls: 'taoist', glyph: '剑', unlock: 26, cd: 50, cost: 45,
    type: 'swordrain', mult: 1.15, radius: 12, count: 22, dur: 3.5, elem: 'none', anim: 'cast',
    desc: '万道符剑自天而降，3.5 秒内对范围内敌人造成 22 次 {dmg} 点伤害。'
  }
};

const SKILL_ORDER = {
  warrior: ['whirl', 'thrust', 'warcry', 'quake', 'bloodrage', 'avatar'],
  mage: ['fireball', 'frostnova', 'chain', 'meteor', 'iceshield', 'starfall'],
  taoist: ['talisman', 'summon', 'heal', 'poison', 'taiji', 'swordrain']
};

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

/* ---------------- 怪物 ---------------- */
const MONSTERS = {
  halfork: { name: '半兽人战士', model: 'humanoid', hp: 62, atk: 9, spd: 3.3, scale: 1.0, color: 0x8e6a45, cloth: 0x5c4426, xp: 14, melee: true, range: 2.2, atkCd: 1.5 },
  skelarch: { name: '骷髅弓手', model: 'skeleton', hp: 46, atk: 11, spd: 2.6, scale: 0.95, color: 0xd8d2bd, cloth: 0x555555, xp: 16, ranged: true, range: 14, atkCd: 2.1, proj: { color: 0xd8e0ff, speed: 16 } },
  bat: { name: '血蝠', model: 'bat', hp: 34, atk: 7, spd: 5.2, scale: 0.8, color: 0x6b1f28, cloth: 0x3d1116, xp: 11, melee: true, range: 2.0, atkCd: 1.1, fly: true },
  spider: { name: '毒蛛', model: 'spider', hp: 70, atk: 10, spd: 3.0, scale: 1.0, color: 0x3f2f4f, cloth: 0x241a2e, xp: 18, melee: true, range: 2.4, atkCd: 1.7, poison: true },
  boar: { name: '獠牙猪卫', model: 'beast', hp: 96, atk: 13, spd: 3.6, scale: 1.15, color: 0x6d5340, cloth: 0x40301f, xp: 22, melee: true, range: 2.6, atkCd: 1.9, charge: true },
  ghost: { name: '幽魂道士', model: 'ghost', hp: 58, atk: 15, spd: 2.3, scale: 1.0, color: 0x7fd6c0, cloth: 0x2c4a45, xp: 24, ranged: true, range: 15, atkCd: 2.4, proj: { color: 0x8affd8, speed: 13 } },
  scorpion: { name: '赤尾蝎', model: 'spider', hp: 84, atk: 16, spd: 3.4, scale: 1.05, color: 0x8a3a2a, cloth: 0x4a1d14, xp: 26, melee: true, range: 2.4, atkCd: 1.6, poison: true },
  snake: { name: '蛇妖', model: 'snake', hp: 78, atk: 17, spd: 3.0, scale: 1.0, color: 0x2f7f5f, cloth: 0x1d4a38, xp: 28, ranged: true, range: 13, atkCd: 2.2, proj: { color: 0x9dff8a, speed: 15 }, poison: true },
  golem: { name: '石魔', model: 'golem', hp: 190, atk: 22, spd: 1.8, scale: 1.35, color: 0x77706a, cloth: 0x4c4741, xp: 40, melee: true, range: 3.0, atkCd: 2.4 },
  yaoguai: { name: '妖僧', model: 'humanoid', hp: 120, atk: 24, spd: 3.2, scale: 1.05, color: 0x8a5fb0, cloth: 0x4a2f66, xp: 44, melee: true, range: 2.4, atkCd: 1.5, lifesteal: true },
  ghostfire: { name: '鬼火', model: 'bat', hp: 66, atk: 26, spd: 4.6, scale: 0.85, color: 0x66ccff, cloth: 0x2a6b8a, xp: 42, ranged: true, range: 12, atkCd: 1.8, proj: { color: 0x88e0ff, speed: 14 } },
  bloodlord: { name: '血尸', model: 'humanoid', hp: 240, atk: 30, spd: 2.9, scale: 1.2, color: 0x992b2b, cloth: 0x5a1414, xp: 60, melee: true, range: 2.8, atkCd: 1.8 }
};

/* ---------------- Boss ---------------- */
const BOSSES = {
  treeking: {
    id: 'treeking', name: '巨木妖王', title: '幽篁林之主', map: 'forest', level: 6, scale: 2.1,
    hp: 1800, atk: 20, spd: 2.6, color: 0x3f5a30, cloth: 0x2c3f22, model: 'treant', scale: 1.85,
    melee: true, range: 4.2, atkCd: 2.2,
    patterns: ['slam', 'roots', 'summon'],
    lines: ['这片竹林……是我的坟场。', '凡人的血，最养竹。']
  },
  batking: {
    id: 'batking', name: '血蝠魔君', title: '嗜血长翼', map: 'forest', level: 8, scale: 1.9,
    hp: 2400, atk: 24, spd: 4.6, color: 0x7a1f2e, cloth: 0x3d0c13, model: 'batking', scale: 1.65,
    melee: true, range: 3.6, atkCd: 1.5, fly: true,
    patterns: ['ringshot', 'charge', 'summon'],
    lines: ['血……都是我的血！', '你闻起来很香甜。']
  },
  chief: {
    id: 'chief', name: '半兽人酋长·碎骨', title: '血腥部族之首', map: 'swamp', level: 12, scale: 2.3,
    hp: 4200, atk: 34, spd: 3.2, color: 0x7a5a38, cloth: 0x4a2414, model: 'brute', scale: 1.85, skin: 0x9a7a5a,
    melee: true, range: 4.6, atkCd: 2.0,
    patterns: ['slam', 'charge', 'summon'],
    lines: ['碎骨！我要把你碎成骨！', '部族的勇士，都死在你的手里？']
  },
  golemking: {
    id: 'golemking', name: '石甲巨魔', title: '玄铁山的守望者', map: 'swamp', level: 15, scale: 2.5,
    hp: 6200, atk: 40, spd: 2.0, color: 0x6f675f, cloth: 0x3f3a34, model: 'golem', scale: 1.9,
    melee: true, range: 5.0, atkCd: 2.6, armorHigh: true,
    patterns: ['slam', 'rocks', 'quake'],
    lines: ['石头……不会痛。', '你也会变成石头。']
  },
  snakequeen: {
    id: 'snakequeen', name: '蛇姬·青鳞', title: '沼泽毒后', map: 'swamp', level: 16, scale: 2.0,
    hp: 5200, atk: 38, spd: 3.6, color: 0x2f7f5f, cloth: 0x1d3f30, model: 'snake',
    melee: false, ranged: true, range: 14, atkCd: 1.9,
    patterns: ['poisonnova', 'ringshot', 'summon'],
    lines: ['来，让我看看你的骨头。', '毒会先吃掉你的眼睛。']
  },
  ghostlord: {
    id: 'ghostlord', name: '幽魂道尊', title: '九幽的引路人', map: 'mine', level: 20, scale: 2.2,
    hp: 7800, atk: 46, spd: 3.0, color: 0x7fd6c0, cloth: 0x1f3a38, model: 'ghost',
    melee: false, ranged: true, range: 16, atkCd: 2.0,
    patterns: ['ringshot', 'curse', 'summon'],
    lines: ['生者，为何踏入死地？', '你的魂魄，我收下了。']
  },
  firegeneral: {
    id: 'firegeneral', name: '赤炎魔将', title: '焚天军先锋', map: 'mine', level: 23, scale: 2.3,
    hp: 9600, atk: 54, spd: 3.4, color: 0xa82c20, cloth: 0x551008, model: 'brute', scale: 1.9,
    melee: true, range: 4.6, atkCd: 1.8, fire: true,
    patterns: ['slam', 'fireline', 'charge'],
    lines: ['焚尽！焚尽一切！', '你的血肉，会为我燃起。']
  },
  icequeen: {
    id: 'icequeen', name: '冰魄妖后', title: '寒潭之底', map: 'mine', level: 24, scale: 2.1,
    hp: 8800, atk: 58, spd: 3.2, color: 0x7fb8e0, cloth: 0x2a4f6b, model: 'ghost', scale: 1.85,
    melee: false, ranged: true, range: 15, atkCd: 1.9, ice: true,
    patterns: ['frostnova', 'ringshot', 'summon'],
    lines: ['冷么？很快就感觉不到了。', '冰封，是最好的棺。']
  },
  spidermother: {
    id: 'spidermother', name: '万毒蛛母', title: '百子之巢', map: 'abyss', level: 28, scale: 2.6,
    hp: 13500, atk: 62, spd: 3.0, color: 0x6b4278, cloth: 0x2e1a35, model: 'spider', scale: 2.15,
    melee: true, range: 4.4, atkCd: 1.7, poison: true,
    patterns: ['summon', 'poisonnova', 'charge'],
    lines: ['我的孩子们……饿了。', '别踩坏我的卵。']
  },
  ferryman: {
    id: 'ferryman', name: '冥河渡者', title: '忘川摆渡人', map: 'abyss', level: 30, scale: 2.3,
    hp: 15500, atk: 70, spd: 2.8, color: 0x5b6b8a, cloth: 0x2a3244, model: 'golem', scale: 1.95,
    melee: true, range: 5.2, atkCd: 2.3, armorHigh: true,
    patterns: ['quake', 'ringshot', 'curse'],
    lines: ['上船吧，船票是命。', '忘川水凉，别回头。']
  },
  swordlord: {
    id: 'swordlord', name: '天罡剑魂', title: '万剑之主', map: 'abyss', level: 32, scale: 2.2,
    hp: 18000, atk: 78, spd: 4.0, color: 0xb0a480, cloth: 0x50441f, model: 'humanoid',
    melee: true, range: 3.8, atkCd: 1.3,
    patterns: ['swordrain', 'charge', 'slam'],
    lines: ['剑，即是道。', '接我这一剑。']
  },
  chaos: {
    id: 'chaos', name: '混沌·无相天魔', title: '九霄终焉', map: 'heaven', level: 38, scale: 3.0,
    hp: 42000, atk: 105, spd: 3.4, color: 0x5a2478, cloth: 0x220c30, model: 'demon', scale: 2.1, skin: 0x6a3a7a,
    melee: true, range: 5.6, atkCd: 1.9, all: true,
    patterns: ['slam', 'ringshot', 'charge', 'meteor', 'summon', 'curse'],
    lines: ['九霄之上，本无神佛。', '你不过是又一个妄念。', '来吧，让我看看你的道。']
  }
};

/* ---------------- 地图 ---------------- */
const MAPS = {
  village: {
    id: 'village', name: '桃源村', safe: true, level: 1,
    ground: 'dirt', sky: 0x9fc7d9, fog: 0xa8c8d8, fogNear: 45, fogFar: 120,
    size: 70, ambient: 0xbfd9e6, sun: 0xffe6b8, sunI: 1.05, props: 'village',
    npcs: ['elder', 'smith', 'herbalist', 'monk'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }, music: 'calm'
  },
  forest: {
    id: 'forest', name: '幽篁林', safe: false, level: 4,
    ground: 'bamboo', sky: 0x7fae8f, fog: 0x93b89c, fogNear: 30, fogFar: 95,
    size: 90, ambient: 0xa8d0b0, sun: 0xd8f0c0, sunI: 0.95, props: 'bamboo',
    spawns: ['halfork', 'bat', 'skelarch'], spawnCount: 14, bosses: ['treeking', 'batking'],
    portal: { x: 0, z: 34 }, unlock: 1
  },
  swamp: {
    id: 'swamp', name: '血月沼泽', safe: false, level: 12,
    ground: 'swamp', sky: 0x5a3a3a, fog: 0x6b3f3f, fogNear: 28, fogFar: 90,
    size: 96, ambient: 0x8a6a6a, sun: 0xff9a7a, sunI: 0.8, props: 'swamp',
    spawns: ['spider', 'boar', 'snake', 'scorpion'], spawnCount: 16,
    bosses: ['chief', 'golemking', 'snakequeen'], portal: { x: 0, z: 38 }, unlock: 8
  },
  mine: {
    id: 'mine', name: '玄铁矿洞', safe: false, level: 20,
    ground: 'rock', sky: 0x2a2a33, fog: 0x2e2a2a, fogNear: 22, fogFar: 75,
    size: 90, ambient: 0x6a6a78, sun: 0xffbb66, sunI: 0.7, props: 'mine',
    spawns: ['golem', 'ghost', 'yaoguai', 'ghostfire'], spawnCount: 16,
    bosses: ['ghostlord', 'firegeneral', 'icequeen'], portal: { x: 0, z: 36 }, unlock: 16
  },
  abyss: {
    id: 'abyss', name: '九幽地宫', safe: false, level: 28,
    ground: 'abyss', sky: 0x1a1420, fog: 0x1e1626, fogNear: 20, fogFar: 70,
    size: 92, ambient: 0x6a5a7a, sun: 0x9a6aff, sunI: 0.65, props: 'abyss',
    spawns: ['ghostfire', 'bloodlord', 'yaoguai', 'golem'], spawnCount: 17,
    bosses: ['spidermother', 'ferryman', 'swordlord'], portal: { x: 0, z: 37 }, unlock: 24
  },
  heaven: {
    id: 'heaven', name: '天阙残境', safe: false, level: 35,
    ground: 'heaven', sky: 0x2a3a5a, fog: 0x40527a, fogNear: 26, fogFar: 85,
    size: 92, ambient: 0x9ab0e0, sun: 0xffe0a0, sunI: 0.95, props: 'heaven',
    spawns: ['bloodlord', 'ghostfire', 'golem', 'yaoguai'], spawnCount: 18,
    bosses: ['chaos'], portal: { x: 0, z: 37 }, unlock: 32
  }
};

/* ---------------- NPC ---------------- */
const NPCS = {
  elder: { id: 'elder', name: '桃源村长', glyph: '村', color: 0xd8c8a0, role: 'quest', lines: ['九霄震动，妖气冲天。年轻人，你来得正是时候。', '村外的幽篁林，已经不太平了。'] },
  smith: { id: 'smith', name: '铁匠·石九', glyph: '铁', color: 0x9a7a5a, role: 'shop', lines: ['好钢要千锤百炼，人也一样。', '看看这些家什，都是好货。'] },
  herbalist: { id: 'herbalist', name: '药师·青娘', glyph: '药', color: 0x7fb08a, role: 'potion', lines: ['伤药苦口，但能救命。', '血月一出，草药都染了邪气。'] },
  monk: { id: 'monk', name: '云游道人', glyph: '道', color: 0xc0b090, role: 'travel', lines: ['天地为炉，众生为薪。', '想去何处？贫道为你开一道口子。'] }
};

/* ---------------- 任务链 ---------------- */
const QUESTS = {
  q1: {
    id: 'q1', name: '竹林异动', giver: 'elder', map: 'village',
    brief: '村外幽篁林妖气渐浓，半兽人已经下山掠村。去幽篁林斩杀 8 只半兽人。',
    objectives: [{ type: 'kill', target: 'halfork', count: 8, label: '斩杀半兽人战士' }],
    rewards: { xp: 260, gold: 180, ilvl: 5, rarity: 'magic' }, next: 'q2'
  },
  q2: {
    id: 'q2', name: '血翼之夜', giver: 'elder', map: 'village',
    brief: '血蝠成群，夜里连牲口都被吸干了血。去幽篁林讨伐 10 只血蝠。',
    objectives: [{ type: 'kill', target: 'bat', count: 10, label: '猎杀血蝠' }],
    rewards: { xp: 420, gold: 260, ilvl: 7, rarity: 'magic' }, next: 'q3'
  },
  q3: {
    id: 'q3', name: '巨木妖王', giver: 'elder', map: 'village',
    brief: '幽篁林深处，千年妖木已成王。斩了它，竹林才能安息。',
    objectives: [{ type: 'boss', target: 'treeking', count: 1, label: '击败巨木妖王' }],
    rewards: { xp: 900, gold: 500, ilvl: 9, rarity: 'rare' }, next: 'q4'
  },
  q4: {
    id: 'q4', name: '嗜血长翼', giver: 'elder', map: 'village',
    brief: '血蝠魔君以人血养翼，若不除之，血月将临。',
    objectives: [{ type: 'boss', target: 'batking', count: 1, label: '击败血蝠魔君' }],
    rewards: { xp: 1200, gold: 650, ilvl: 11, rarity: 'rare' }, next: 'q5'
  },
  q5: {
    id: 'q5', name: '沼泽的骨堆', giver: 'elder', map: 'village',
    brief: '血月沼泽的半兽人部族正在堆骨为塔。去沼泽斩杀 12 只怪物，遏止它们的血祭。',
    objectives: [{ type: 'killAny', count: 12, label: '肃清血月沼泽的妖物' }],
    rewards: { xp: 1600, gold: 800, ilvl: 13, rarity: 'rare' }, next: 'q6'
  },
  q6: {
    id: 'q6', name: '碎骨酋长', giver: 'elder', map: 'village',
    brief: '半兽人酋长·碎骨以活人祭旗，此獠不除，沼泽永无宁日。',
    objectives: [{ type: 'boss', target: 'chief', count: 1, label: '击败半兽人酋长·碎骨' }],
    rewards: { xp: 2400, gold: 1100, ilvl: 15, rarity: 'set' }, next: 'q7'
  },
  q7: {
    id: 'q7', name: '石甲与毒鳞', giver: 'elder', map: 'village',
    brief: '石甲巨魔与蛇姬·青鳞盘踞沼泽深处，二者皆除，方解此患。',
    objectives: [
      { type: 'boss', target: 'golemking', count: 1, label: '击败石甲巨魔' },
      { type: 'boss', target: 'snakequeen', count: 1, label: '击败蛇姬·青鳞' }
    ],
    rewards: { xp: 3600, gold: 1500, ilvl: 17, rarity: 'set' }, next: 'q8'
  },
  q8: {
    id: 'q8', name: '矿洞的低语', giver: 'elder', map: 'village',
    brief: '玄铁矿洞传出诵经声，幽魂道尊正在收割矿工的魂魄。',
    objectives: [{ type: 'boss', target: 'ghostlord', count: 1, label: '击败幽魂道尊' }],
    rewards: { xp: 5200, gold: 2000, ilvl: 21, rarity: 'set' }, next: 'q9'
  },
  q9: {
    id: 'q9', name: '冰火双魔', giver: 'elder', map: 'village',
    brief: '赤炎魔将与冰魄妖后同源于一处天火，一焚一冻。斩其一，另一必至。',
    objectives: [
      { type: 'boss', target: 'firegeneral', count: 1, label: '击败赤炎魔将' },
      { type: 'boss', target: 'icequeen', count: 1, label: '击败冰魄妖后' }
    ],
    rewards: { xp: 7600, gold: 2800, ilvl: 25, rarity: 'legendary' }, next: 'q10'
  },
  q10: {
    id: 'q10', name: '九幽之门', giver: 'elder', map: 'village',
    brief: '九幽地宫的门开了。蛛母、渡者、剑魂，都在门的另一侧等你。',
    objectives: [
      { type: 'boss', target: 'spidermother', count: 1, label: '击败万毒蛛母' },
      { type: 'boss', target: 'ferryman', count: 1, label: '击败冥河渡者' },
      { type: 'boss', target: 'swordlord', count: 1, label: '击败天罡剑魂' }
    ],
    rewards: { xp: 12000, gold: 4200, ilvl: 30, rarity: 'legendary' }, next: 'q11'
  },
  q11: {
    id: 'q11', name: '九霄终焉', giver: 'elder', map: 'village',
    brief: '混沌无相天魔吞尽九霄灵气，天阙已残。此战，为苍生，也为你自己。',
    objectives: [{ type: 'boss', target: 'chaos', count: 1, label: '击败混沌·无相天魔' }],
    rewards: { xp: 30000, gold: 12000, ilvl: 40, rarity: 'legendary' }, next: null
  }
};
