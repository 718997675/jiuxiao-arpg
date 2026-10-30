/* ============================================================
 * 数据层 · 无尽试炼
 * ------------------------------------------------------------
 * 试炼模式是「无限波数」的挑战场：一波清完立刻下一波，每波结束三选一
 * 强化（基础数值 / 装备效果 / 技能效果），每 5 波首领、每 10 波大首领。
 * 本文件只放**纯数据与纯函数**（不碰 THREE、不碰 DOM），
 * 运行时状态机在 src/trial.js，面板在 src/ui.js。
 *
 * 为什么怪物等级要「跟着玩家走」：
 *   本体的怪物血量是 1 + lv×0.55 + lv²×0.01 —— 平方项在高等级非常陡。
 *   如果试炼把怪物等级写成固定曲线，30 级玩家和 8 级玩家面对的 TTK 会差
 *   三四倍：要么高手一路平推，要么新手第 8 波就卡死。所以这里让怪物等级
 *   贴着玩家等级走（+1 级 + 每波 0.12），**难度全部交给 hpMul / dmgMul
 *   两个乘区**，这样任何人进来，第一波的体感都是「能打」，之后靠波数变难。
 *   验算见 dev/trial-balance.js。
 * ============================================================ */

const TRIAL_CFG = {
  /* ---- 波次 ---- */
  blessCards: 3,          // 每波结束给几张卡
  prepTime: 3.0,          // 开波前的读秒
  firstPrep: 2.2,         // 第 1 波读秒（短一点，别让人等）
  clearDelay: 1.15,       // 清场到翻牌的停顿
  nextDelay: 0.9,         // 选完卡到下一波的停顿

  /* ---- 怪物等级：贴玩家等级 ---- */
  lvOffset: 1,            // 比玩家高 1 级
  lvPerWave: 0.12,        // 每波再抬一点
  lvMax: 70,

  /* ---- 数量与精英 ---- */
  countBase: 5,
  countPerWave: 0.68,
  countMax: 22,
  eliteBase: 0.05,
  elitePerWave: 0.011,
  eliteMax: 0.42,

  /* ---- 首领 ----
   * 首领的血量**不用数据表里的 cfg.hp**，而是以「本波小怪的平均血量」为锚点乘倍数。
   * 原因：本体首领血量是给固定等级写的（混沌天魔 42000），再叠上试炼的血量乘区
   * 会直接爆到几百万，一场首领战要打十分钟。以本波小怪为锚点，首领战长度就恒等于
   * 「小怪 TTK × 倍数」。
   *
   * 倍数随波数**衰减**（bossEquivDecay）：后期小怪 TTK 本来就在变长，
   * 如果倍数不降，第 40 波的首领要打两分钟。衰减后整场的首领战稳定在 25~35 秒，
   * 大首领 45~60 秒。 */
  bossEvery: 5,           // 每 5 波一个首领
  bossBigEvery: 10,       // 每 10 波是大首领
  bossHpEquiv: 16,        // 首领血量 = 本波小怪均血 × 16 / (1 + 波数×衰减)
  bossBigHpEquiv: 28,     // 大首领 = × 28 / 同衰减
  bossEquivDecay: 0.075,
  bossAtkEquiv: 1.9,      // 首领攻击 = 本波小怪均攻 × 1.9
  bossBigAtkEquiv: 2.4,
  bossGuardElite: 2,      // 大首领身边带几只精英护卫

  /* ---- 清场经验：按「当前升级所需」的比例给，自动适配任何等级 ---- */
  xpWaveRatio: 0.34,      // 普通波
  xpWaveRatioBoss: 0.72,  // 首领波
  xpWaveRatioBig: 1.05,   // 大首领波

  /* ---- 经验随波数衰减（P12） ----
   * 比例制解决了「固定经验在高等级变零头」，但同时开了另一个口子：
   * **收益完全不随等级衰减**，于是「低波数 × 高等级」= 零风险高收益，
   * 玩家不需要往高波打，只需要反复重开第 1~10 波。
   *
   * pace = (wave / (level × xpPaceLevelMul)) ^ xpPacePow，上限 1
   *   xpPaceLevelMul 0.6：40 级要打到第 24 波才满额，60 级要第 36 波
   *   xpPacePow      3  ：**低波数几乎不给经验**，这才是止住刷级的关键
   *
   * 为什么不是线性（计划书原稿的写法）：线性实测 40 级打 10 波仍给 115%
   * 升级所需，远达不到「< 15%」的验收线 —— 10 波本身只要几分钟。
   * 三次方后 40 级 10 波 ≈ 10%，而满额波数不变（仍是第 24 波）。
   * 见 dev/trial-check.js 的「经验衰减」段。 */
  xpPaceLevelMul: 0.6,
  xpPacePow: 3,

  /* ---- 等级难度乘区（P12） ----
   * 用户方案：「动态根据人物等级调整试炼场的怪物难度，升级了难度也增加」。
   * 原来的难度乘区只跟波数有关，40 级玩家打第 1 波，怪还是按 8 级调的
   * 0.54 系数 —— 装备成型后一路平推，这就是「试炼升级太快」的另一半原因。
   *
   * lvMul = 1 + max(0, level − lvMulFrom) × lvMulPer
   *   10 级 ×1.00（刚解锁、装备没成型，不加压）
   *   30 级 ×1.70 · 60 级 ×2.75
   * 从 10 级起算：unlockLevel 是 6，6~10 级是「刚进来、装备没凑齐」的窗口；
   * 10 级后进卷二，装备开始滚雪球，才需要压。
   * 系数 0.035 是初值，用 dev/trial-check.js 的「各等级最远波数」校准，
   * 目标是 10/20/30/40/50/60 级的最远波数都落在 25~40 波。 */
  lvMulFrom: 10,
  lvMulPer: 0.035,

  /* ---- 传世掉落（P12） ----
   * 用户方案：「试炼只有高级层数才有极小概率掉落传世」。
   * 终局产出挂在高波，不挂在「反复重开」上。
   *
   * 概率 = min(cap, base + (wave − minWave) × perWave)，首领波 ×bossMul
   *   30 波 0.3% / 40 波 0.7% / 50 波 1.1% / 60 波 1.5% / 70+ 1.9%（封顶）
   *   首领波再 ×3 → 0.9% / 2.1% / 3.3% / 4.5% / 5.7%
   * 只掉 ilvl ≥ ilvlMin 的传世，且玩家 < minLevel 级不掉 ——
   * 传世 reqLv = ilvl，39 级才穿得上 40 级装，早掉只会变成「捡到但穿不上」的挫败。 */
  unique: { minWave: 30, base: 0.003, perWave: 0.0004, cap: 0.019, bossMul: 3, ilvlMin: 40, minLevel: 39 },

  /* ---- 清场掉落 ---- */
  dropGoldBase: 40,       // 金币 = base × 波数 × 难度系数
  dropWaves: [1, 3, 6, 10, 15, 20, 26, 33, 41, 50],  // 这些波次额外掉装备
  dropIlvlGap: 1,         // 装备等级 = 玩家等级 + gap（保证穿得上）

  /* ---- 记录 ---- */
  unlockLevel: 6          // 6 级开启（够玩家摸完前两图，有基础装备）
};

/* ---------------- 难度曲线 ----------------
 * 两个乘区都是「线性 + 平方」的复合曲线：前期线性、后期加速，
 * 但平方系数压得很低，避免第 40 波直接变成血牛。
 * 目标：普通玩家 25~35 波，成型 BD 45+，极限 60+。
 *
 * [v1.11.0] 前面挂的 0.54 / 0.62 是「主线怪物曲线重做」的补偿系数。
 * 主线把血量公式从 1+0.55L+0.010L² 提到 5+0.45L+0.032L²、伤害从
 * 1+0.20L 提到 1+0.34L 之后，试炼的怪凭空强了 1.5~2 倍 ——
 * 32 级进场的崩盘点从 29 波掉到 21 波。试炼是独立玩法，不该被主线调参
 * 顺手打死，所以在这里按比例收回，保持设计难度不变。
 * 以后主线再调 mob 曲线，记得同步改这两个系数（dev/trial-balance.js 可验算）。
 *
 * [P12] 两个乘区各再乘一个**等级乘区** `trialLevelMul(level)`。
 * 不传 level 时按「不加压」处理（×1.00），保证老调用点 / dev 脚本不传参也不会静默变难。 */
function trialHpMul(wave, level) {
  const w = Math.max(0, wave || 0);
  return 0.54 * (1 + 0.100 * w + 0.0045 * w * w) * trialLevelMul(level);
}
function trialDmgMul(wave, level) {
  const w = Math.max(0, wave || 0);
  return 0.56 * (1 + 0.045 * w + 0.0010 * w * w) * trialLevelMul(level);
}

/* 等级难度乘区（P12）。
 * 为什么只给「血量 + 伤害」加、不给怪物等级加：怪物等级本来就贴玩家
 * （trialEnemyLevel），再加一次等于把 lv² 的平方项又放大一遍，高等级会直接爆表。
 * 这里加的是**同等级下的强度**，语义是「你变强了，试炼的怪也跟着变强」。 */
function trialLevelMul(level) {
  const L = Math.max(1, level || 1);
  return 1 + Math.max(0, L - TRIAL_CFG.lvMulFrom) * TRIAL_CFG.lvMulPer;
}

/* 经验衰减系数（P12）。wave 越高越接近 1；等级越高，需要打得更深才满额。
 * 见 TRIAL_CFG.xpPaceLevelMul / xpPacePow 的说明。 */
function trialXpPace(wave, level) {
  const need = Math.max(1, (level || 1) * TRIAL_CFG.xpPaceLevelMul);
  const p = Math.min(1, Math.max(0, wave || 0) / need);
  return Math.pow(p, TRIAL_CFG.xpPacePow);
}

/* 传世掉落概率（P12）。非首领波 / 首领波分别返回，0 表示这一波不掉。 */
function trialUniqueChance(wave, isBoss) {
  const U = TRIAL_CFG.unique;
  const w = Math.max(0, wave || 0);
  if (w < U.minWave) return 0;
  let c = Math.min(U.cap, U.base + (w - U.minWave) * U.perWave);
  if (isBoss) c = Math.min(U.cap * U.bossMul, c * U.bossMul);
  return c;
}

/* 每波怪物数量 */
function trialWaveCount(wave) {
  const w = Math.max(1, wave || 1);
  return Math.min(TRIAL_CFG.countMax, Math.round(TRIAL_CFG.countBase + TRIAL_CFG.countPerWave * (w - 1)));
}
/* 精英概率 */
function trialEliteChance(wave) {
  const w = Math.max(1, wave || 1);
  return Math.min(TRIAL_CFG.eliteMax, TRIAL_CFG.eliteBase + TRIAL_CFG.elitePerWave * (w - 1));
}
/* 是否首领波 / 大首领波 */
function trialIsBossWave(wave) {
  return (wave % TRIAL_CFG.bossEvery) === 0;
}
function trialIsBigBossWave(wave) {
  return (wave % TRIAL_CFG.bossBigEvery) === 0;
}
/* 怪物等级：贴玩家等级 */
function trialEnemyLevel(wave, playerLevel) {
  const lv = (playerLevel || 1) + TRIAL_CFG.lvOffset + Math.max(0, (wave || 1) - 1) * TRIAL_CFG.lvPerWave;
  return CLAMP(Math.round(lv), 1, TRIAL_CFG.lvMax);
}

/* 首领血量 = 本波小怪均血 × 本函数返回值。
 * 波数越高倍数越低 —— 抵消「小怪 TTK 随波数变长」，让首领战长度稳定。 */
function trialBossEquiv(wave, big) {
  const base = big ? TRIAL_CFG.bossBigHpEquiv : TRIAL_CFG.bossHpEquiv;
  return base / (1 + Math.max(0, wave || 1) * TRIAL_CFG.bossEquivDecay);
}

/* 祝福带来的「综合战力乘区」——只给 dev 验算脚本用，
 * 运行时是逐条加到 stats 上的（见 Trial.applyStats），这里是一个拟合值。 */
function trialBlessingPower(wave) {
  const picks = Math.max(0, (wave || 1) - 1);
  /* 每条祝福平均让战力涨 9%，但同类是加法叠加（收益递减），
   * 折成 1 + 0.085 × picks / (1 + picks / 55) 这条饱和曲线 */
  return 1 + 0.085 * picks / (1 + picks / 55);
}

/* ---------------- 怪物池 ----------------
 * 按波数逐段解锁：前期只有幽篁林的小怪，往后把后面几张图的怪并进来。
 * 同一波里混编不同族群的怪，逼玩家在「火/冰/毒抗」之间取舍。 */
const TRIAL_MOB_TIERS = [
  { at: 1, pool: ['halfork', 'bat', 'skelarch', 'wolf', 'hornet', 'fox', 'bamboo', 'shigandang', 'lantern'] },
  { at: 5, pool: ['spider', 'boar', 'snake', 'scorpion', 'zombie', 'drowned', 'brood', 'wasp', 'toad', 'bogwitch'] },
  { at: 11, pool: ['golem', 'ghost', 'yaoguai', 'ghostfire', 'statue', 'scorpking', 'minerghost', 'magma', 'ironbeetle', 'runesmith'] },
  { at: 19, pool: ['bloodlord', 'headless', 'crane', 'bonewright', 'shade', 'ironmaiden'] },
  { at: 27, pool: ['fallen', 'voidbeast', 'swordwraith', 'thunderbird', 'jadeguard'] }
];

function trialMobPool(wave) {
  const out = [];
  for (const t of TRIAL_MOB_TIERS) if (wave >= t.at) out.push.apply(out, t.pool);
  return out.length ? out : TRIAL_MOB_TIERS[0].pool;
}

/* 首领出场表：按波数推进，越往后越凶。
 * 每 5 波取当前段位里的一只；每 10 波（大首领）取段位末位那只。 */
const TRIAL_BOSS_TIERS = [
  { at: 5, list: ['treeking', 'batking'] },
  { at: 10, list: ['chief', 'golemking'] },
  { at: 15, list: ['snakequeen', 'ghostlord'] },
  { at: 20, list: ['firegeneral', 'icequeen'] },
  { at: 25, list: ['spidermother', 'ferryman'] },
  { at: 30, list: ['swordlord'] },
  { at: 35, list: ['chaos'] }
];

function trialBossFor(wave) {
  const big = trialIsBigBossWave(wave);
  let list = TRIAL_BOSS_TIERS[0].list;
  for (const t of TRIAL_BOSS_TIERS) if (wave >= t.at) list = t.list;
  /* 大首领：优先取当前段位最后一只（通常是段位里最强的） */
  if (big) return list[list.length - 1];
  return PICK(list);
}

/* ============================================================
 * 祝福池
 * ------------------------------------------------------------
 * 三类（用户指定）：基础数值 / 装备效果 / 技能效果。
 * 每条祝福只做一件事：往 stats 上叠一个已有 key 的数值（所以**必然生效**，
 * 不会出现「面板好看但战斗里没用」的假词条），外加两条机制型（见 special）。
 *
 * tier：1 普通（权重高）/ 2 稀有 / 3 传说（权重低、强度高）
 * max ：最多叠几层；到顶后不再进池
 * val ：每层数值
 * stats：{ key: 每层数值 }
 * ============================================================ */
const TRIAL_BLESSINGS = [
  /* ---------- 基础数值 ---------- */
  { id: 'atk', name: '锋锐', cat: 'stat', tier: 1, max: 12, icon: '刃', val: 12, stats: { atkPct: 12 }, desc: '攻击力 +12%' },
  { id: 'hp', name: '厚土', cat: 'stat', tier: 1, max: 12, icon: '岳', val: 14, stats: { hpPct: 14 }, desc: '生命上限 +14%' },
  { id: 'def', name: '铁壁', cat: 'stat', tier: 1, max: 10, icon: '壁', val: 15, stats: { armorPct: 15 }, desc: '护甲 +15%' },
  { id: 'crit', name: '锐眼', cat: 'stat', tier: 1, max: 10, icon: '目', val: 4, stats: { crit: 4 }, desc: '暴击率 +4%' },
  { id: 'critdmg', name: '裂心', cat: 'stat', tier: 1, max: 10, icon: '心', val: 18, stats: { critDmg: 18 }, desc: '暴击伤害 +18%' },
  { id: 'aspd', name: '疾风', cat: 'stat', tier: 1, max: 8, icon: '风', val: 7, stats: { aspd: 7 }, desc: '攻击速度 +7%' },
  { id: 'movespd', name: '踏云', cat: 'stat', tier: 1, max: 6, icon: '云', val: 6, stats: { moveSpd: 6 }, desc: '移动速度 +6%' },
  { id: 'hpregen', name: '生生不息', cat: 'stat', tier: 1, max: 8, icon: '生', val: 9, stats: { hpRegen: 9 }, desc: '每秒回复生命 +9' },
  { id: 'mpreg', name: '灵泉', cat: 'stat', tier: 1, max: 6, icon: '泉', val: 3, stats: { mpReg: 3 }, desc: '灵力回复/秒 +3' },
  { id: 'res', name: '五行护体', cat: 'stat', tier: 2, max: 8, icon: '御', val: 7, stats: { allRes: 7 }, desc: '全元素抗性 +7%' },
  { id: 'reduce', name: '玄甲', cat: 'stat', tier: 2, max: 6, icon: '甲', val: 4, stats: { dmgReduce: 4 }, desc: '受到伤害减免 +4%' },
  { id: 'str', name: '力拔山', cat: 'stat', tier: 2, max: 8, icon: '力', val: 14, stats: { str: 14 }, desc: '力量 +14' },
  { id: 'agi', name: '身法', cat: 'stat', tier: 2, max: 8, icon: '身', val: 14, stats: { agi: 14 }, desc: '敏捷 +14' },
  { id: 'vit', name: '金刚体', cat: 'stat', tier: 2, max: 8, icon: '刚', val: 14, stats: { vit: 14 }, desc: '体质 +14' },
  { id: 'int', name: '灵台清明', cat: 'stat', tier: 2, max: 8, icon: '台', val: 14, stats: { int: 14 }, desc: '灵力 +14' },

  /* ---------- 装备效果（把装备词条里最值钱的那几条做成可叠祝福） ---------- */
  { id: 'lifesteal', name: '饮血', cat: 'equip', tier: 2, max: 6, icon: '饮', val: 3, stats: { lifesteal: 3 }, desc: '生命偷取 +3%' },
  { id: 'thorns', name: '荆棘', cat: 'equip', tier: 2, max: 6, icon: '棘', val: 16, stats: { thorns: 16 }, desc: '伤害反弹 +16%' },
  { id: 'dodge', name: '虚步', cat: 'equip', tier: 2, max: 6, icon: '虚', val: 4, stats: { dodge: 4 }, desc: '闪避率 +4%' },
  { id: 'block', name: '铁壁格挡', cat: 'equip', tier: 2, max: 6, icon: '挡', val: 5, stats: { block: 5 }, desc: '格挡率 +5%' },
  { id: 'overkill', name: '余劲', cat: 'equip', tier: 2, max: 5, icon: '余', val: 9, stats: { overkillShield: 9 }, desc: '溢出伤害转护盾 +9%' },
  { id: 'killheal', name: '屠戮回春', cat: 'equip', tier: 1, max: 8, icon: '屠', val: 10, stats: { killHeal: 10 }, desc: '击杀回复生命 +10' },
  { id: 'magicfind', name: '天缘', cat: 'equip', tier: 1, max: 6, icon: '缘', val: 28, stats: { magicFind: 28 }, desc: '奇遇机缘 +28%（掉落品质更好）' },
  { id: 'goldfind', name: '聚宝', cat: 'equip', tier: 1, max: 6, icon: '宝', val: 40, stats: { goldFind: 40 }, desc: '金币获取 +40%' },
  { id: 'droprate', name: '满载', cat: 'equip', tier: 1, max: 6, icon: '载', val: 40, stats: { dropRate: 40 }, desc: '掉落数量 +40%' },
  { id: 'elitedmg', name: '屠魔', cat: 'equip', tier: 2, max: 6, icon: '魔', val: 22, stats: { eliteDmg: 22 }, desc: '对精英伤害 +22%' },
  { id: 'bossdmg', name: '斩王', cat: 'equip', tier: 2, max: 6, icon: '王', val: 22, stats: { bossDmg: 22 }, desc: '对首领伤害 +22%' },
  { id: 'armorpen', name: '破甲', cat: 'equip', tier: 2, max: 6, icon: '破', val: 11, stats: { armorPen: 11 }, desc: '护甲穿透 +11%' },
  { id: 'stun', name: '震岳', cat: 'equip', tier: 2, max: 5, icon: '震', val: 5, stats: { stunChance: 5 }, desc: '眩晕几率 +5%' },
  { id: 'burn', name: '燎原', cat: 'equip', tier: 1, max: 6, icon: '燎', val: 9, stats: { burnChance: 9 }, desc: '点燃几率 +9%' },
  { id: 'pickup', name: '纳物', cat: 'equip', tier: 1, max: 4, icon: '纳', val: 2, stats: { pickupRadius: 2 }, desc: '拾取范围 +2' },

  /* ---------- 技能效果 ---------- */
  { id: 'skilldmg', name: '术法精研', cat: 'skill', tier: 1, max: 10, icon: '术', val: 13, stats: { skillDmg: 13 }, desc: '技能伤害 +13%' },
  { id: 'cdr', name: '通玄', cat: 'skill', tier: 1, max: 8, icon: '玄', val: 5, stats: { cdr: 5 }, desc: '冷却缩减 +5%' },
  { id: 'aoe', name: '荡涤', cat: 'skill', tier: 1, max: 8, icon: '荡', val: 15, stats: { aoeDmg: 15 }, desc: '范围伤害 +15%' },
  { id: 'proj', name: '穿云', cat: 'skill', tier: 1, max: 8, icon: '云', val: 15, stats: { projDmg: 15 }, desc: '投射物伤害 +15%' },
  { id: 'dot', name: '蚀骨', cat: 'skill', tier: 1, max: 8, icon: '蚀', val: 17, stats: { dotDmg: 17 }, desc: '持续伤害 +17%' },
  { id: 'melee', name: '刀意', cat: 'skill', tier: 1, max: 8, icon: '刀', val: 15, stats: { meleeDmg: 15 }, desc: '近战伤害 +15%' },
  { id: 'summon', name: '驭兽', cat: 'skill', tier: 2, max: 6, icon: '驭', val: 18, stats: { summonDmg: 18 }, desc: '召唤物伤害 +18%' },
  { id: 'cost', name: '蓄灵', cat: 'skill', tier: 2, max: 6, icon: '蓄', val: 7, stats: { costReduce: 7 }, desc: '技能消耗降低 +7%' },
  { id: 'elem', name: '五行归一', cat: 'skill', tier: 3, max: 4, icon: '归', val: 14, stats: { fireDmg: 14, iceDmg: 14, lightningDmg: 14, poisonDmg: 14 }, desc: '全元素伤害 +14%' },
  { id: 'skilllv', name: '悟道', cat: 'skill', tier: 3, max: 3, icon: '悟', val: 1, stats: { skillLv: 1 }, desc: '全技能等级 +1' },

  /* ---------- 传说（机制型） ---------- */
  {
    id: 'waveheal', name: '血泉', cat: 'equip', tier: 3, max: 4, icon: '泉', val: 18,
    special: 'waveHeal', desc: '每波结束时回复 18% 生命'
  },
  {
    id: 'thunder', name: '天雷引', cat: 'skill', tier: 3, max: 4, icon: '雷', val: 1,
    special: 'thunder', desc: '每 5 秒引落天雷，对最近的敌人造成 260% 攻击伤害'
  },
  {
    id: 'bloodlust', name: '嗜血狂潮', cat: 'equip', tier: 3, max: 3, icon: '嗜', val: 1,
    special: 'bloodlust', desc: '生命低于 40% 时，攻击力 +25%（每层 +25%）'
  },
  {
    id: 'fortune', name: '天赐机缘', cat: 'equip', tier: 3, max: 3, icon: '赐', val: 1,
    special: 'fortune', desc: '首领必掉 1 件额外装备，且装备等级 +2（每层）'
  }
];

const TRIAL_BLESS_BY_ID = {};
for (const b of TRIAL_BLESSINGS) TRIAL_BLESS_BY_ID[b.id] = b;

const TRIAL_CAT_NAME = { stat: '基础数值', equip: '装备效果', skill: '技能效果' };
const TRIAL_CAT_COLOR = { stat: '#ffc857', equip: '#5ce08a', skill: '#67a9ff' };

/* 抽卡：按 tier 权重 + 「同类不出三张」+ 已叠满的剔除。
 * owned = { id: 层数 } */
const TRIAL_TIER_WEIGHT = { 1: 100, 2: 42, 3: 13 };

function trialRollBlessings(n, wave, owned) {
  owned = owned || {};
  const pool = TRIAL_BLESSINGS.filter(b => (owned[b.id] || 0) < b.max);
  const out = [];
  const cats = [];
  /* 尽量三张卡分属三类：先每类各抽一张，抽不满再用剩下的补 */
  const byCat = { stat: [], equip: [], skill: [] };
  for (const b of pool) (byCat[b.cat] || (byCat[b.cat] = [])).push(b);

  const pickOne = (list) => {
    if (!list || !list.length) return null;
    let total = 0;
    for (const b of list) total += TRIAL_TIER_WEIGHT[b.tier] || 10;
    let r = Math.random() * total;
    for (const b of list) {
      const w = TRIAL_TIER_WEIGHT[b.tier] || 10;
      if (r < w) return b;
      r -= w;
    }
    return list[list.length - 1];
  };

  const catOrder = shuffle(['stat', 'equip', 'skill']);
  for (const c of catOrder) {
    if (out.length >= n) break;
    const b = pickOne(byCat[c]);
    if (b) { out.push(b); cats.push(c); }
  }
  /* 补足：从全部池子里抽（不重复） */
  let guard = 0;
  while (out.length < n && guard++ < 60) {
    const rest = pool.filter(b => out.indexOf(b) < 0);
    if (!rest.length) break;
    const b = pickOne(rest);
    if (b) out.push(b);
  }
  return out;
}

/* 波次奖励装备的等级：保证「穿得上」——玩家的等级门槛是 reqLv = ilvl - 1。
 * [M6] 上限跟 ILVL_MAX 走（等级上限 60 后试炼也要能出 60 级装）。 */
function trialDropIlvl(playerLevel, fortuneStacks) {
  const cap = (typeof ILVL_MAX === 'number') ? ILVL_MAX : 60;
  return CLAMP(Math.round((playerLevel || 1) + TRIAL_CFG.dropIlvlGap + (fortuneStacks || 0) * 2), 1, cap);
}
