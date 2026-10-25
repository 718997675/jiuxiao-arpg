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
  /* 品质最高档叫「神品」而不是「神兵」：八阶基底里已经有一个「神兵」阶，
   * 同名会让「升品」和「升阶」混成一件事（用户 2026-10-25 拍板改名）。 */
  legendary: { key: 'legendary', name: '神品', color: '#ff7a3c', mul: 1.55, affixes: 4, fixed: 3, weight: 6 },
  set: { key: 'set', name: '套装', color: '#5ce08a', mul: 1.42, affixes: 3, fixed: 2, weight: 3 },
  /* 传世：**最终装备**，红色标识。固定名字 + 固定词条 + 特性 + 技能效果，可重复掉落。
   * v1.1.8 起词条数量全品质最多（固定 4 / 可洗 4，叠加等级成长后 40 级可达 12 条），
   * 与 uniqueStats 的固有属性并存：词条是通用属性，uniqueStats + 特性才是传世的灵魂。
   * 定位上是装备链的终点：不在品质升级链内。 */
  unique: { key: 'unique', name: '传世', color: '#ff3b3b', mul: 1.7, affixes: 4, fixed: 4, weight: 2 }
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

  /* ---- [M1] 元素伤害加成（词缀族：火/冰/雷/毒） ----
   * 与「抗性」相反：这是玩家打出去的加成，按本次伤害的 elem 取用，
   * 结算见 game.js damageEnemy。 */
  fireDmg: { label: '火焰伤害', pct: true },
  iceDmg: { label: '冰霜伤害', pct: true },
  lightningDmg: { label: '雷电伤害', pct: true },
  poisonDmg: { label: '毒性伤害', pct: true },
  /* [P2] 符法伤害：符箓系（符箓 / 符箭 / 剑雨 / 天师符）的专属元素，
   * 来源目前只有被动「符力」—— 词缀池刻意不放，留作流派纵深 */
  sigilDmg: { label: '符法伤害', pct: true },

  /* ---- [M1] 全技能等级（词缀 +N 技能等级）----
   * 不占技能点，直接叠在已投等级之上，见 game.js skillLevel()。 */
  skillLv: { label: '全技能等级', pct: false },
  /* ---- [M1] 濒死免疫：致命伤时保留 1 点生命并回复 N% 生命（60 秒冷却）---- */
  deathWard: { label: '濒死免疫回复', pct: true },

  /* ---- [M1/C5] 光环：以自身为中心常驻的范围效果 ----
   * auraSlow  身边敌人移速 -N%
   * auraBurn  身边敌人每秒受 N 点火焰伤害（吃火伤加成）
   * auraRange 光环半径 +N（基础 4.2） */
  auraSlow: { label: '光环减速', pct: true },
  auraBurn: { label: '光环灼烧', pct: false },
  auraRange: { label: '光环范围', pct: false },

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
    /* [v1.10.0] 经验 1.80 → 1.50：极难要「更久」，不是「同样久但更痛」。
     * 怪血量 2.4 倍本来就把杀怪速度压到 42%，再给 1.8 倍经验等于白送 ——
     * 现在折成 1.5，通关时长约为普通的 1.6 倍。 */
    xp: 1.50, gold: 1.50, drop: 1.45, rune: 1.45,
    elite: 0.26, aggro: 1.45, elem: true, deathPenalty: 0.25, bossRush: true,
    desc: '怪物附带火/冰/毒元素，精英成群，死亡损 25% 金币。收益 +50% 经验。'
  }
};
const DIFF_ORDER = ['novice', 'normal', 'hard', 'nightmare'];
const DEFAULT_DIFF = 'normal';
/* 兼容旧档：没有 difficulty 字段一律按普通处理 */
function getDiff(key) { return DIFFS[key] || DIFFS[DEFAULT_DIFF]; }

/* ---------------- 根基属性（v1.8.5） ----------------
 * 四项根基：力量 / 敏捷 / 体质 / 灵力。
 * **跨职业同名不同效**：每职业自己一张 weights 表，1 点根基换成什么由这张表决定 ——
 * 刀客的力量加攻击，术士的力量只撑甲；术士的灵力才是攻击。
 * 键名对应 computePlayerStats 里的派生量：
 *   atk 攻击力 / hpMax 生命上限 / mpMax 灵力上限 / def 护甲
 *   crit 暴击率(%) / critDmg 暴击伤害(%) / aspd 攻速(%) / moveSpd 移速
 *   cdr 冷却缩减(%) / mpReg 回灵/s / hpRegen 回血/s
 */
const ATTR_KEYS = ['str', 'agi', 'vit', 'int'];
const ATTR_NAME = { str: '力量', agi: '敏捷', vit: '体质', int: '灵力' };
/* 每级可分配点数（1 级另给 5 点，开局就能上手；旧档按等级补算，不缺不欠） */
const ATTR_POINTS_PER_LEVEL = 3;
const ATTR_START_POINTS = 5;
/* 加点预算三件套：纯函数，node 测试与 Game 共用同一份口径 */
function attrTotalAt(level) {
  return ATTR_START_POINTS + Math.max(0, (Math.max(1, Math.round(level || 1)) - 1) * ATTR_POINTS_PER_LEVEL);
}
function attrSpentOf(alloc) {
  let n = 0;
  for (const k of ATTR_KEYS) n += Math.max(0, Math.round(Number((alloc || {})[k]) || 0));
  return n;
}
function attrLeft(level, alloc) {
  return Math.max(0, attrTotalAt(level) - attrSpentOf(alloc));
}
/* 洗点价：物价随境界走，前期也洗得起 */
function attrRespecCost(level) { return Math.round(60 * Math.max(1, level || 1)); }

/* ---------------- 职业 ---------------- */
const CLASSES = {
  warrior: {
    key: 'warrior', name: '战士', title: '刀客', res: '怒气', resColor: '#ffa53a',
    color: 0xc0392b, cloth: 0x8e2f24, accent: 0xe6b04a,
    icon: '刀', desc: '近身缠斗，以血肉之躯开山裂石。攻击积攒怒气，愈战愈勇。',
    base: { str: 14, agi: 6, vit: 13, int: 3 },
    growth: { str: 2.4, agi: 0.9, vit: 2.2, int: 0.3 },
    mainStat: 'str', atkName: '攻击力',
    /* 刀客：力量 = 攻击（近战），体质 = 血厚甲硬，灵力近乎无用 */
    weights: {
      str: { atk: 1.15, critDmg: 0.2 },
      agi: { crit: 0.18, aspd: 0.4, moveSpd: 0.015 },
      vit: { hpMax: 14, def: 0.8 },
      int: { mpMax: 3 }
    },
    baseAtk: 9, baseHp: 170, baseMp: 40,
    startWeapon: 'warrior0',
    /* 战斗表现（P0 收进本表）：普通攻击形态 / 挥砍色 / 技能特效色 / 副手模型 / 命中回资源 */
    attack: 'melee', slashColor: 0xffd8a0, fxColor: 0xffb070, offhandShape: 'shield', gainResOnHit: 4
  },
  mage: {
    key: 'mage', name: '法师', title: '术士', res: '灵力', resColor: '#63b3ff',
    color: 0x3b6fd4, cloth: 0x2a4a9e, accent: 0x8fd6ff,
    icon: '法', desc: '引动五行雷火，以毁天灭地之术焚尽群敌。灵力为源，攻守皆远。',
    base: { str: 4, agi: 6, vit: 9, int: 15 },
    growth: { str: 0.4, agi: 0.9, vit: 1.6, int: 2.7 },
    mainStat: 'int', atkName: '术法攻击',
    /* 术士：灵力 = 术法攻击 + 灵力上限 + 冷却，力量只撑甲（穿重甲用） */
    weights: {
      str: { def: 0.9, hpMax: 1.5 },
      agi: { crit: 0.15, aspd: 0.35, moveSpd: 0.015 },
      vit: { hpMax: 11, def: 0.4 },
      int: { atk: 1.5, mpMax: 6, cdr: 0.06 }
    },
    baseAtk: 7, baseHp: 135, baseMp: 90,
    startWeapon: 'mage0',
    attack: 'ranged', projColor: 0x8ad0ff, projElem: 'ice', fxColor: 0x8ad8ff, offhandShape: 'orb'
  },
  taoist: {
    key: 'taoist', name: '道士', title: '符师', res: '道力', resColor: '#7ee0a0',
    color: 0x2f8f6a, cloth: 0x1f6b50, accent: 0xe8e0a0,
    icon: '道', desc: '驱符役兽，以毒雾与雷符消磨强敌，亦能自愈续命。持久战的王者。',
    base: { str: 6, agi: 9, vit: 12, int: 12 },
    growth: { str: 0.9, agi: 1.4, vit: 2.0, int: 2.2 },
    mainStat: 'int', atkName: '术法攻击',
    /* 符师：灵力 = 术法攻击 + 回灵回血，四项都不废，典型吃加成的均衡职业 */
    weights: {
      str: { def: 0.6, hpMax: 2 },
      agi: { crit: 0.16, aspd: 0.36, moveSpd: 0.02 },
      vit: { hpMax: 12, def: 0.5 },
      int: { atk: 1.3, mpMax: 5, mpReg: 0.06, hpRegen: 0.05 }
    },
    baseAtk: 8, baseHp: 150, baseMp: 70,
    startWeapon: 'taoist0',
    attack: 'melee', slashColor: 0xa8ffd0, fxColor: 0x9affd0, offhandShape: 'charm'
  }
};

/* 把四项根基按职业 weights 换算成派生属性。
 * 返回的键与 weights 里写的一致；UI 也用同一个函数算「当前贡献」，
 * 因此提示框里的数字和面板不会对不上。 */
function deriveFromAttrs(cls, attrs) {
  const out = { atk: 0, hpMax: 0, mpMax: 0, def: 0, crit: 0, critDmg: 0, aspd: 0, moveSpd: 0, cdr: 0, mpReg: 0, hpRegen: 0 };
  const c = CLASSES[cls];
  if (!c || !c.weights) return out;
  for (const k of ATTR_KEYS) {
    const v = Number(attrs[k]) || 0;
    const w = c.weights[k];
    if (!w) continue;
    for (const dk in w) out[dk] = (out[dk] || 0) + w[dk] * v;
  }
  return out;
}

/* ============================================================
 * BALANCE —— 平衡旋钮（v1.10.0）
 * ------------------------------------------------------------
 * 起因（用户试玩反馈）：小怪随手掉橙、首领几乎必掉红；1 级暴击伤害就 150%；
 * 一小时通关，装备来得太容易、升级太快，没挑战。
 * 根因有三条，全部收在这张表里，以后调平衡只改这里，不再满仓库找魔数：
 *
 *   1. 掉落只看全局权重（神品 5.9% / 套装 2.9% / 传世 2.0%），小怪也一样；
 *   2. 暴击基础值写死在 computePlayerStats 里（5 / 150），无成长曲线；
 *   3. 首领血量是写死的固定值（1800 → 42000），而玩家伤害随等级与装备
 *      涨了十几二十倍 —— 于是首领越到后期越好打。
 *
 * 各字段含义见行内注释。drop.pools 的权重是「相对值」，不必凑成 100。
 * ============================================================ */
const BALANCE = {
  /* 暴击：裸装起点。1 级 3% / 125%，靠根基、装备、天赋往上堆 */
  crit: { base: 3, dmg: 125, dmgCap: 500 },

  /* 经验：境界 = xpNext(L) = base × L^pow；
   *      普通怪 = cfg.xp × (1 + 怪物等级 × mobLv)；首领 = 等级 × bossLv */
  /* base/pow 是按「普通难度通关 ≈ 10 小时」反解出来的：
   * dev/balance-report.js 的第六节会用同一套公式复算，调完跑一遍就知道差多少 */
  xp: { base: 200, pow: 1.80, mobLv: 0.12, bossLv: 30 },

  /* 掉落：按怪物层级分池。低层级池里根本没有高档品质，
   * 于是「小怪掉橙」从机制上不可能，而不是靠低概率碰运气。 */
  drop: {
    /* 掉落数量 / 符文 / 玄晶的加成（源自「掉落数量」词条）按这个系数缩水 */
    mfScale: 0.5,
    normal: {
      chance: 0.16,                 // 单件掉落概率
      extra: 0.35,                  // 额外再掉一件的概率
      pool: [['common', 76], ['magic', 21], ['rare', 3]]
    },
    elite: {
      chance: 0.62,
      extra: 0.5,
      pool: [['magic', 54], ['rare', 38], ['legendary', 7], ['set', 1]]
    },
    boss: {
      count: 2,                     // 必掉件数
      extra: 0.5,                   // 额外第三件的概率
      pool: [['rare', 58], ['legendary', 26], ['set', 12], ['unique', 4]]
    }
  },

  /* 怪物强度：血量随等级超线性，伤害线性；精英额外倍血 */
  mob: { hpLv: 0.55, hpLv2: 0.010, dmgLv: 0.20, eliteHp: 2.4, eliteDmg: 1.3 },

  /* 首领：血量按「自身等级 / refLv」的 pow 次方放大到 hpMul 倍，
   * 前期几乎不变（1.0 倍），终盘约 12 倍 —— 首领不会再被越级碾平 */
  boss: { hpMul: 12, hpMulPow: 2, refLv: 38, dmgLv: 0.09 }
};

/* 首领血量倍率：Lv.refLv 时 = 1 + (lv/refLv)^pow × (hpMul - 1) */
function bossHpScale(lv) {
  const b = BALANCE.boss;
  const t = Math.max(0, Math.min(1.2, (lv || 1) / b.refLv));
  return 1 + Math.pow(t, b.hpMulPow) * (b.hpMul - 1);
}
/* 按权重池抽一个品质；池里没有的档永远不会出现 */
function pickFromPool(pool) {
  let total = 0;
  for (const p of pool) total += p[1];
  let r = Math.random() * total;
  for (const p of pool) { if (r < p[1]) return p[0]; r -= p[1]; }
  return pool[0][0];
}

/* 升到下一境界所需经验：base × L^pow（BALANCE.xp）。唯一口径，
 * 升级、新建角色、读档整形三处都调它，别各写一遍。 */
function xpToNext(level) {
  const x = (typeof BALANCE !== 'undefined' && BALANCE.xp) ? BALANCE.xp : { base: 180, pow: 1.70 };
  return Math.max(1, Math.round(x.base * Math.pow(Math.max(1, level || 1), x.pow)));
}
