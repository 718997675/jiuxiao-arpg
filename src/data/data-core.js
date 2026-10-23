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

/* ---------------- 稀有度 ----------------
 * affixes = 可洗练词条数（洗练 / 强化 / 换词条都作用在这一组）
 * fixed   = 固定初始词条数（品质越高越多，任何锻造操作都不会改动它）
 * 两者相互独立，数值汇总时才合并。
 */
const RARITY = {
  common: { key: 'common', name: '凡品', color: '#cfcfd6', mul: 1.0, affixes: 0, fixed: 0, weight: 46 },
  magic: { key: 'magic', name: '灵品', color: '#67a9ff', mul: 1.12, affixes: 2, fixed: 1, weight: 30 },
  rare: { key: 'rare', name: '玄品', color: '#ffc857', mul: 1.28, affixes: 3, fixed: 2, weight: 15 },
  legendary: { key: 'legendary', name: '神兵', color: '#ff7a3c', mul: 1.55, affixes: 4, fixed: 3, weight: 6 },
  set: { key: 'set', name: '套装', color: '#5ce08a', mul: 1.42, affixes: 3, fixed: 2, weight: 3 },
  /* 传世：固定名字 + 固定词条 + 特性 + 技能效果，可重复掉落
   * 传世的「固定词条」走 uniqueStats，不再叠加 fixed，避免双重计算 */
  unique: { key: 'unique', name: '传世', color: '#d9a441', mul: 1.7, affixes: 0, fixed: 0, weight: 2 }
};

/* ---------------- 属性定义 ----------------
 * V2 S1：24 → 64 个 key。
 * 硬规矩：**每个 key 都必须有真实生效点**，不许有「面板上好看、战斗里没用」的假属性。
 *         生效位置见 game.js 里标了 [S1] 的几处（rollDamage / damageEnemy / damagePlayer /
 *         update / gainXp / healPlayer / 拾取判定）。
 * makeAffix() 是按 key 去重的，所以 64 个词缀必须对应 64 个不同的 key。
 */
const STATS = {
  /* ---- 三围与主属性 ---- */
  atk: { label: '攻击力', pct: false },
  atkPct: { label: '攻击力', pct: true },
  def: { label: '护甲', pct: false },
  hp: { label: '生命上限', pct: false },
  hpPct: { label: '生命上限', pct: true },
  mp: { label: '灵力上限', pct: false },
  mpPct: { label: '灵力上限', pct: true },
  mpReg: { label: '灵力回复/秒', pct: false },
  str: { label: '力量', pct: false },
  agi: { label: '敏捷', pct: false },
  vit: { label: '体质', pct: false },
  int: { label: '灵力', pct: false },

  /* ---- 暴击与攻速 ---- */
  crit: { label: '暴击率', pct: true },
  critDmg: { label: '暴击伤害', pct: true },
  aspd: { label: '攻击速度', pct: true },
  aspdOnCrit: { label: '暴击后攻速', pct: true },

  /* ---- 抗性 ---- */
  allRes: { label: '全元素抗性', pct: true },
  physRes: { label: '物理抗性', pct: true },
  fireRes: { label: '火焰抗性', pct: true },
  iceRes: { label: '冰霜抗性', pct: true },
  poisonRes: { label: '毒性抗性', pct: true },

  /* ---- 防御 ---- */
  armorPct: { label: '护甲', pct: true },
  dodge: { label: '闪避率', pct: true },
  block: { label: '格挡率', pct: true },
  dmgReduce: { label: '伤害减免', pct: true },
  ccResist: { label: '控制抗性', pct: true },
  thorns: { label: '伤害反弹', pct: true },

  /* ---- 伤害加成 ---- */
  dmgAll: { label: '伤害加成', pct: true },
  meleeDmg: { label: '近战伤害', pct: true },
  projDmg: { label: '投射物伤害', pct: true },
  aoeDmg: { label: '范围伤害', pct: true },
  dotDmg: { label: '持续伤害', pct: true },
  eliteDmg: { label: '对精英伤害', pct: true },
  bossDmg: { label: '对首领伤害', pct: true },
  executeDmg: { label: '处决伤害', pct: true },
  firstStrike: { label: '先手伤害', pct: true },
  armorPen: { label: '护甲穿透', pct: true },
  minDmg: { label: '伤害下限', pct: true },
  skillDmg: { label: '技能伤害', pct: true },
  summonDmg: { label: '召唤物伤害', pct: true },

  /* ---- 命中附加 ---- */
  stunChance: { label: '眩晕几率', pct: true },
  slowChance: { label: '减速几率', pct: true },
  freezeChance: { label: '冻结几率', pct: true },
  burnChance: { label: '点燃几率', pct: true },
  knockback: { label: '击退强度', pct: false },
  mpOnHit: { label: '命中回复灵力', pct: false },
  hpOnHit: { label: '命中回复生命', pct: false },

  /* ---- 续航 ---- */
  hpRegen: { label: '每秒回复生命', pct: false },
  lifesteal: { label: '生命偷取', pct: true },
  killHeal: { label: '击杀回复生命', pct: false },
  mpOnKill: { label: '击杀回复灵力', pct: false },
  healBonus: { label: '治疗效果', pct: true },
  shieldBonus: { label: '护盾强度', pct: true },
  overkillShield: { label: '溢出伤害转护盾', pct: true },

  /* ---- 功能 ---- */
  moveSpd: { label: '移动速度', pct: true },
  moveSpdFlat: { label: '移动速度', pct: false },
  cdr: { label: '冷却缩减', pct: true },
  cdrFlat: { label: '冷却缩减', pct: false },
  costReduce: { label: '技能消耗降低', pct: true },
  goldFind: { label: '金币获取', pct: true },
  magicFind: { label: '奇遇机缘', pct: true },
  expGain: { label: '经验获取', pct: true },
  dropRate: { label: '掉落数量', pct: true },
  pickupRadius: { label: '拾取范围', pct: false }
};

/* ---------------- 难度 ----------------
 * 四档难度：数值系数 + 玩法机制都不同，不是单纯加血。
 *
 * 数值（系数）：
 *   mobHp   怪物生命      mobDmg  怪物伤害      mobSpd  怪物移速
 *   taken   玩家受到伤害  xp      经验获取      gold    金币获取
 *   drop    装备掉落率    rune    符文/玄晶出率
 * 机制（开关/概率）：
 *   elite       精英怪出现概率（精英 2.1 倍血、1.3 倍伤、掉落更好）
 *   aggro       怪物索敌半径倍率（越大越容易被围攻）
 *   elem        怪物附带随机元素（火/冰/毒），逼玩家堆对应抗性
 *   deathPenalty 死亡损失金币比例
 *   bossRush    Boss 阶段切换更早（60%/30% → 75%/45%）
 */
const DIFFS = {
  novice: {
    key: 'novice', name: '新手', color: '#5ce08a', tag: '轻松体验',
    mobHp: 0.65, mobDmg: 0.55, mobSpd: 0.90, taken: 0.70,
    xp: 0.85, gold: 0.90, drop: 0.90, rune: 0.90,
    elite: 0.03, aggro: 0.80, elem: false, deathPenalty: 0, bossRush: false,
    desc: '怪物更弱更慢，索敌范围小；死亡不掉金币。适合熟悉操作与剧情。'
  },
  normal: {
    key: 'normal', name: '普通', color: '#d8b25a', tag: '标准历练',
    mobHp: 1.00, mobDmg: 1.00, mobSpd: 1.00, taken: 1.00,
    xp: 1.00, gold: 1.00, drop: 1.00, rune: 1.00,
    elite: 0.08, aggro: 1.00, elem: false, deathPenalty: 0.10, bossRush: false,
    desc: '原始数值，标准山海历练。死亡损失 10% 金币。'
  },
  hard: {
    key: 'hard', name: '困难', color: '#ff9a44', tag: '硬核挑战',
    mobHp: 1.60, mobDmg: 1.45, mobSpd: 1.10, taken: 1.35,
    xp: 1.35, gold: 1.25, drop: 1.20, rune: 1.20,
    elite: 0.16, aggro: 1.25, elem: false, deathPenalty: 0.15, bossRush: true,
    desc: '怪物更硬更凶，精英频出，索敌更远；Boss 提前进阶段。收益 +35% 经验。'
  },
  nightmare: {
    key: 'nightmare', name: '极难', color: '#e8564a', tag: '九幽炼狱',
    mobHp: 2.40, mobDmg: 1.95, mobSpd: 1.20, taken: 1.70,
    xp: 1.80, gold: 1.50, drop: 1.45, rune: 1.45,
    elite: 0.26, aggro: 1.45, elem: true, deathPenalty: 0.25, bossRush: true,
    desc: '怪物附带火/冰/毒元素，精英成群，死亡损 25% 金币。收益 +80% 经验。'
  }
};
const DIFF_ORDER = ['novice', 'normal', 'hard', 'nightmare'];
const DEFAULT_DIFF = 'normal';
/* 兼容旧档：没有 difficulty 字段一律按普通处理 */
function getDiff(key) { return DIFFS[key] || DIFFS[DEFAULT_DIFF]; }

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
