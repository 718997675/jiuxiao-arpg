/* ============================================================
 * 数据层 · 地下城（M5）
 * ------------------------------------------------------------
 * 计划书 §8。一句话：**5 阶钥匙 × 5 类地下城 × 3 层 + 词缀 + 25 条图鉴**。
 *
 * 三条口径（都在 §8 里定死，改之前先读那三节）：
 *
 *  1. **一阶对一卷**：`keyTier = part`，玩家永远知道「我在第几卷，打几阶钥匙」。
 *     钥匙**只分阶不分类型** —— 拿到三阶钥匙进位面后自选 5 类之一。
 *     （带类型的话玩家会攒一堆不想打的，背包变垃圾场）
 *
 *  2. **怪物等级贴玩家等级**：`clamp(玩家等级 + 2, 该阶下限, 该阶上限)`。
 *     高等级进去割草、低等级进去送死，都是这一条要避免的。
 *
 *  3. **地下城首领不是世界首领**。它们是关卡守卫（`dungeon: true`），
 *     不进 `MAPS[*].bosses`、不进图鉴的野外条目、不计入「世界首领」口径。
 *     血量按「同阶小怪均血 × 14」在运行时反解（见 dungeon.js），
 *     因为同一个首领要在 5 个阶里出现，写死绝对值没法跟着阶走。
 * ============================================================ */

/* ---------------- 钥匙 5 阶 ---------------- */
/* price 是货郎价（金币）。价格随卷走，作用只有一个：「刷不动了就买一把」的兜底，
 * 不是主要供给。主要供给在本卷小怪 0.6% / 精英 10% / 首领必掉（见 BALANCE.keyDrop.mob/elite）。 */
const KEY_TIERS = [
  { tier: 1, name: '朽骨钥', part: 1, lvFrom: 1, lvTo: 18, affixN: 0, price: 400, color: '#9aa8b8', desc: '一具不知名的指骨磨成的钥匙，插进地缝里会自己转。' },
  { tier: 2, name: '青铜钥', part: 2, lvFrom: 19, lvTo: 30, affixN: 1, price: 1200, color: '#c08a5a', desc: '铸着看不见面孔的青铜牙，咬合时像有人在低声数数。' },
  { tier: 3, name: '玄铁钥', part: 3, lvFrom: 31, lvTo: 40, affixN: 2, price: 3000, color: '#8a95a8', desc: '玄铁在阴河里浸过，摸上去是凉的，一整天都暖不回来。' },
  { tier: 4, name: '赤金钥', part: 4, lvFrom: 41, lvTo: 50, affixN: 3, price: 7000, color: '#e0a04a', desc: '赤金本就是天阙的残料，握久了掌心会烫出一道印。' },
  { tier: 5, name: '九霄钥', part: 5, lvFrom: 51, lvTo: 60, affixN: 4, price: 15000, color: '#b98cff', desc: '没有齿，插进去地脉自己会开。九霄的门从不认钥匙，只认来的人。' }
];

/* ---------------- 三层结构（5 类共用） ---------------- */
/* 层 = 一张独立小图。为什么不是「一张图三个区」：
 *   每层要自己的骨架（入口岔路 / 主厅侧室 / 首领场），一张图只能有一种骨架；
 *   而且层间走地脉门是一次 re-loadMap，成本 120ms，跟试炼换波次一个量级。
 * `total` 是**本层**刷怪总数，直接写死不跟 suggestSpawnTotal 走 ——
 *   那套公式的下限是 40 只（世界图口径），地下城是走廊推进，20 只就到顶了。 */
const DUNGEON_LAYERS = [
  { no: 1, name: '入口厅', size: 150, total: 20, need: 0.70, gate: '地脉门' },
  { no: 2, name: '主厅', size: 140, total: 18, need: 0.80, gate: '地脉门' },
  { no: 3, name: '首领场', size: 130, total: 0, need: 1.00, gate: '' }
];

/* ---------------- 5 类地下城 ---------------- */
/* `kinds` 是**本类的怪池**：从现有 76 只里按 §8.2 的族群配比挑出来的，
 * 再各挂 1 只地下城专属怪（M5 新增 4 只，第 5 类「坠天」用现有妖灵池就够）。
 * `boss` 指向 BOSSES 里的关卡守卫 id（dungeon:true）。 */
const DUNGEON_TYPES = [
  {
    id: 'tomb', name: '尸冢', glyph: '冢', arch: 'ring', ground: 'bone',
    subtitle: '亡灵 60 · 兽 25 · 石 15',
    kinds: ['skelarch', 'bonewright', 'headless', 'soulgaoler', 'zombie', 'drowned', 'shrouded',
      'bat', 'statue'],
    boss: 'dgb_tomb', bossName: '骨将·白起',
    mechanic: { id: 'tide', name: '尸潮', desc: '每 90 秒全图涌出 6 只，越拖越难' },
    hint: '骨头砌的环形墓道，绕一圈才回到中心。别在里面耗太久。'
  },
  {
    id: 'well', name: '塌井', glyph: '井', arch: 'spiral', ground: 'rock',
    subtitle: '石 50 · 兽 30 · 人形 20',
    kinds: ['golem', 'statue', 'cinderhand', 'magmaworm', 'ironbeetle', 'pitworm',
      'runesmith', 'halfork'],
    boss: 'dgb_well', bossName: '矿主·塌',
    mechanic: { id: 'rockfall', name: '落石', desc: '地面亮起预警圈，1.2 秒后砸落' },
    hint: '矿脉塌了一半的竖井，螺旋往下。头顶一直有东西在掉。'
  },
  {
    id: 'den', name: '兽窟', glyph: '窟', arch: 'isles', ground: 'swamp',
    subtitle: '兽 65 · 草木 20 · 妖灵 15',
    kinds: ['wolf', 'boar', 'spider', 'hornet', 'scorpion', 'cliffram',
      'bamboo', 'brood', 'broodmatron', 'foxfire', 'lantern'],
    boss: 'dgb_den', bossName: '獠王',
    mechanic: { id: 'warDrum', name: '兽群', desc: '角落有鼓，鼓不砸就一直来人' },
    hint: '泡烂的兽巢，四面都是水。鼓声一起，四面八方都会过来。'
  },
  {
    id: 'gaol', name: '沉狱', glyph: '狱', arch: 'twin', ground: 'flood',
    subtitle: '亡灵 45 · 妖灵 35 · 人形 20',
    kinds: ['drowned', 'zombie', 'tidewretch', 'mirehorror', 'chainbound',
      'ghost', 'ghostfire', 'wraithlord', 'bogwitch'],
    boss: 'dgb_gaol', bossName: '狱卒长·枷',
    mechanic: { id: 'flood', name: '水位', desc: '每 60 秒涨一层，涨满即失败' },
    hint: '东西双塔的水牢，水面在涨。打得慢了，就没地方站了。'
  },
  {
    id: 'fall', name: '坠天', glyph: '坠', arch: 'radial', ground: 'void',
    subtitle: '妖灵 55 · 石 25 · 兽 20',
    kinds: ['ghost', 'ghostfire', 'voidbeast', 'bladewisp', 'mirrortwin', 'voidmoth',
      'starfaller', 'statue', 'thunderdrum', 'thunderbird'],
    boss: 'dgb_fall', bossName: '堕天者',
    mechanic: { id: 'wind', name: '风压', desc: '持续把人往崖边推' },
    hint: '从天上掉下来的一截废墟，没有边。风一直在往外推。'
  }
];

/* ---------------- 词缀（随阶递增，0~4 条） ---------------- */
/* `mob` 是乘到怪物身上的系数（spawnEnemy 之后由 dungeon.js 统一乘），
 * `player` 是直接压玩家的（走 buff 通道，debuff 用负值）。
 * `minTier` 是允许出现的最高要求 —— 词缀本身「随阶解锁」。 */
const DUNGEON_AFFIXES = [
  { id: 'greed', name: '贪狼', minTier: 2, desc: '掉落 +40%，怪物生命 +20%', mob: { hpMul: 1.20 }, loot: 0.40 },
  { id: 'bloodrage', name: '血怒', minTier: 2, desc: '怪物攻速 +25%，你受伤 +10%', mob: { aspdMul: 1.25 }, player: { dmgTakenPct: 10 } },
  { id: 'claustro', name: '幽闭', minTier: 2, desc: '雾距 −35%，怪物索敌 +30%', fog: 0.65, mob: { aggroMul: 1.30 } },
  { id: 'echo', name: '回响', minTier: 3, desc: '精英出现率 ×2.5，精英必掉钥匙碎片', mob: { eliteMul: 2.50 } },
  { id: 'wither', name: '枯竭', minTier: 3, desc: '治疗效果 −40%，怪物不掉血瓶', healPct: -40 },
  { id: 'gale', name: '疾风', minTier: 3, desc: '怪物移速 +25%', mob: { spdMul: 1.25 } },
  { id: 'bulwark', name: '铁壁', minTier: 4, desc: '怪物护甲 +50%', mob: { armorMul: 1.50 } },
  { id: 'sacrifice', name: '献祭', minTier: 4, desc: '每死一只怪，其余怪伤害 +2%（上限 +60%）', ramp: 2 },
  { id: 'chaos', name: '无常', minTier: 5, desc: '每 60 秒随机传送你一次', teleport: 60 },
  { id: 'treasure', name: '宝藏', minTier: 5, desc: '宝箱 +3，但不再有精英', chests: 3, noElite: true }
];

/* ---------------- 图鉴：5 类 × 5 阶 = 25 条 ---------------- */
/* 与 CODEX_REGIONS 同构：清空某一条就记一条；集齐某类 5 条给该类专属属性，
 * 集齐 25 条给终局加成。加成键必须是真属性键（见 items.js 的 BUFF_ADD / BUFF_MUL）。 */
const DUNGEON_CODEX = (function () {
  const out = [];
  for (const t of DUNGEON_TYPES) {
    for (const k of KEY_TIERS) {
      out.push({
        id: t.id + k.tier,
        type: t.id, tier: k.tier,
        name: t.name + ' · ' + k.name,
        bonus: null
      });
    }
  }
  return out;
})();

/* 每类的「5 阶全清」加成。为什么是这些键：
 * 都是 items.js 里真实存在、且在 computePlayerStats 之前并进 st 的键，
 * 写成不存在的键会静默无效（面板看不见、战斗也不生效）。 */
const DUNGEON_TYPE_BONUS = {
  tomb: { bonus: { eliteDmg: 8 }, desc: '对精英与首领伤害 +8%' },
  well: { bonus: { armorPen: 8 }, desc: '护甲穿透 +8%' },
  den: { bonus: { aspd: 6 }, desc: '攻击速度 +6%' },
  gaol: { bonus: { dmgReduce: 4 }, desc: '伤害减免 +4%' },
  fall: { bonus: { skillDmg: 6 }, desc: '技能伤害 +6%' }
};

/* 25 条全清的终局加成 */
const DUNGEON_ALL_BONUS = { bonus: { dmgAll: 3, crit: 3, hpPct: 5 }, desc: '全伤 +3% · 暴击率 +3% · 生命 +5%' };

/* ============================================================
 * 纯函数
 * ============================================================ */

function keyTierDef(tier) {
  return KEY_TIERS[Math.max(0, Math.min(KEY_TIERS.length - 1, (tier || 1) - 1))];
}

function dungeonTypeById(id) {
  for (const t of DUNGEON_TYPES) if (t.id === id) return t;
  return null;
}

/* 玩家等级 → 本次地下城的怪物等级。
 * `+2` 让地下城始终比同级野外图紧一点（它是「刻意去打的硬仗」）。
 * 上下限卡在该阶的等级段里：一阶钥匙不能带人进 40 级的怪。 */
function dungeonMobLevel(playerLevel, tier) {
  const kt = keyTierDef(tier);
  return Math.max(kt.lvFrom, Math.min(kt.lvTo, (playerLevel || 1) + 2));
}

/* 该阶该抽几条词缀 */
function dungeonAffixCount(tier) {
  return keyTierDef(tier).affixN || 0;
}

/* 从允许的词缀池里抽 n 条（不重复）。
 * 抽的时候就过滤掉 minTier 更高的 —— 二阶段永远抽不到「无常」。 */
function rollDungeonAffixes(tier, n) {
  const pool = DUNGEON_AFFIXES.filter(a => a.minTier <= (tier || 1));
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/* 图鉴 id（类型 × 阶） */
function dungeonCodexId(tid, tier) {
  return '' + tid + tier;
}

/* 地下城图鉴的永久加成：按 state.dungeon.cleared 汇总。
 * 由 items.js 的 computePlayerStats 调用（和 codexBonusStats 同一条并加通道）。 */
function dungeonBonusStats(dungeonState) {
  const out = {};
  if (!dungeonState || !dungeonState.cleared) return out;
  const cleared = dungeonState.cleared;
  let all = 0;
  for (const t of DUNGEON_TYPES) {
    let n = 0;
    for (const k of KEY_TIERS) if (cleared[dungeonCodexId(t.id, k.tier)]) n++;
    if (n >= KEY_TIERS.length) {
      const b = DUNGEON_TYPE_BONUS[t.id];
      if (b) for (const key in b.bonus) out[key] = (out[key] || 0) + b.bonus[key];
    }
    all += n;
  }
  if (all >= DUNGEON_CODEX.length) {
    for (const key in DUNGEON_ALL_BONUS.bonus) out[key] = (out[key] || 0) + DUNGEON_ALL_BONUS.bonus[key];
  }
  return out;
}

/* 通关某个 (类型 × 阶) 的图鉴条目数 / 总条目数（面板用） */
function dungeonCodexProgress(dungeonState) {
  const cleared = (dungeonState && dungeonState.cleared) || {};
  let n = 0;
  for (const e of DUNGEON_CODEX) if (cleared[e.id]) n++;
  return { done: n, total: DUNGEON_CODEX.length };
}
