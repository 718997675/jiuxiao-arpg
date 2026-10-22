/* ============================================================
 * 数据层 · 基础
 * 随机/数学工具、稀有度、属性定义、三职业
 * （从 data.js 原样搬迁，数值与逻辑未改）
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
