/* ============================================================
 * 装备系统：随机词缀 / 稀有度 / 套装 / 属性汇总 / 提示框
 * ============================================================ */

let ITEM_UID = 1;

/* ---------------- 唯一装备（传世） ----------------
 * 目录与特性定义在 src/data/data-uniques.js，这里只做查询与生成。
 * 一次性建索引；目录是静态数据，不需要每次掉落都线性扫。
 */
const UNIQUE_BY_ID = new Map(UNIQUE_ITEMS.map(u => [u.id, u]));
const UNIQUE_SLOT_INDEX = {};
for (const u of UNIQUE_ITEMS) (UNIQUE_SLOT_INDEX[u.slot] || (UNIQUE_SLOT_INDEX[u.slot] = [])).push(u);

/* 某等级 / 职业能掉落的唯一装备池；slot 不传表示全部位 */
function uniquePool(ilvl, cls, slot) {
  let list = slot ? (UNIQUE_SLOT_INDEX[slot] || []) : UNIQUE_ITEMS;
  return list.filter(u => u.ilvl <= ilvl && (!u.cls || u.cls === cls));
}

/* 固定词条区间 → 实例数值；超出设计等级后按每级 2% 缓慢成长 */
function rollUniqueStats(def, ilvl) {
  const out = {};
  if (!def || !def.stats) return out;
  const grow = 1 + Math.max(0, ilvl - def.ilvl) * 0.02;
  for (const k in def.stats) {
    if (!STATS[k]) continue;
    const r = def.stats[k];
    const lo = Array.isArray(r) ? r[0] : r;
    const hi = Array.isArray(r) ? r[1] : r;
    out[k] = Math.max(1, Math.round(RND(lo, hi) * grow));
  }
  return out;
}

const RUNE_WORD_MAP = new Map(RUNE_WORDS.map(w => [w.runes.join('|'), w]));

/* ---------------- 符文 / 孔位（S2） ---------------- */
function runeIcon(id, size = 24, cls = '') {
  const rune = RUNES[id];
  if (!rune) return '';
  const tier = RUNE_TIERS[rune.tier] || RUNE_TIERS[1];
  return iconSvg('rune_' + id, { size, cls, style: `color:${tier.color}` });
}

function socketCount(item) {
  return item && item.sockets ? item.sockets : 0;
}

function itemRunes(item) {
  if (!item) return [];
  if (!Array.isArray(item.runes)) item.runes = new Array(socketCount(item)).fill(null);
  return item.runes;
}

function runeWordOf(item) {
  const n = socketCount(item);
  if (!n) return null;
  const rs = itemRunes(item);
  if (rs.length !== n || rs.some(r => !r)) return null;
  return RUNE_WORD_MAP.get(rs.join('|')) || null;
}

/* 当前孔数下「还差哪些符文」——用于炼器台的半成品提示 */
function runeWordCandidates(item) {
  const n = socketCount(item);
  if (!n) return [];
  const rs = itemRunes(item);
  return RUNE_WORDS.filter(w => {
    if (w.runes.length !== n) return false;
    for (let i = 0; i < n; i++) if (rs[i] && rs[i] !== w.runes[i]) return false;
    return true;
  });
}

function insertRune(item, index, runeId) {
  if (!item || !RUNES[runeId]) return false;
  const n = socketCount(item);
  if (index < 0 || index >= n) return false;
  const rs = itemRunes(item);
  if (rs[index]) return false;
  rs[index] = runeId;
  return true;
}

function removeRuneAt(item, index) {
  if (!item || !Array.isArray(item.runes)) return null;
  if (index < 0 || index >= item.runes.length) return null;
  const id = item.runes[index];
  if (!id) return null;
  item.runes[index] = null;
  return id;
}

/* 孔数按稀有度滚；戒指 / 项链不出孔（避免首饰位被符文之语垄断） */
function rollSocketCount(slot, rarity) {
  if (slot === 'ring' || slot === 'amulet') return 0;
  const r = Math.random();
  switch (rarity) {
    case 'common': return r < 0.08 ? 1 : 0;
    case 'magic': return r < 0.08 ? 2 : (r < 0.33 ? 1 : 0);
    case 'rare': return r < 0.05 ? 3 : (r < 0.23 ? 2 : (r < 0.48 ? 1 : 0));
    case 'legendary': return r < 0.08 ? 4 : (r < 0.38 ? 3 : (r < 0.68 ? 2 : (r < 0.83 ? 1 : 0)));
    case 'unique': return r < 0.03 ? 4 : (r < 0.23 ? 3 : (r < 0.58 ? 2 : (r < 0.83 ? 1 : 0)));
    case 'set': return r < 0.08 ? 4 : (r < 0.33 ? 3 : (r < 0.63 ? 2 : (r < 0.83 ? 1 : 0)));
  }
  return 0;
}

/* 符文掉落：按 ilvl 限制最高 tier，再按 tier 权重抽 */
function rollRune(ilvl) {
  const maxTier = ilvl >= 28 ? 4 : (ilvl >= 18 ? 3 : (ilvl >= 8 ? 2 : 1));
  const pool = Object.values(RUNES).filter(r => r.tier <= maxTier);
  let total = 0;
  for (const r of pool) total += RUNE_TIERS[r.tier].weight;
  let x = Math.random() * total;
  for (const r of pool) {
    x -= RUNE_TIERS[r.tier].weight;
    if (x < 0) return r.id;
  }
  return pool[pool.length - 1].id;
}

function runeStatsText(rune) {
  const parts = [];
  for (const k in rune.stats) {
    const s = STATS[k];
    if (s) parts.push('+' + rune.stats[k] + (s.pct ? '%' : '') + ' ' + s.label);
  }
  return parts.join('，');
}

function runeWordStatsText(word) {
  const parts = [];
  for (const k in word.stats) {
    const s = STATS[k];
    if (s) parts.push('+' + word.stats[k] + (s.pct ? '%' : '') + ' ' + s.label);
  }
  return parts.join('，');
}

/* ---------------- 洗练（S2） ---------------- */
function reforgeCost(item) {
  if (!item) return 0;
  const base = FORGE.reforgeCost[item.rarity] || 10;
  return Math.round(base * (1 + (item.reforges || 0) * FORGE.reforgeStep));
}

/* 打孔价：按「当前已有孔数」递增，越往后越贵；戒指/项链永不出孔，也不给打 */
function drillCost(item) {
  if (!item) return 0;
  if (item.slot === 'ring' || item.slot === 'amulet') return 0;
  const n = CLAMP(socketCount(item), 0, FORGE.drillMax);
  if (n >= FORGE.drillMax) return 0;
  return FORGE.drillCost[n] || Math.round(14 * Math.pow(1.4, n));
}

/* 戒指 / 项链不可打孔（与自然掉落规则一致，避免首饰被符文之语垄断） */
function canDrill(item) {
  return !!item && item.slot !== 'ring' && item.slot !== 'amulet' && socketCount(item) < FORGE.drillMax;
}

/* 打一个孔：sockets +1，runes 补一个空位。返回新孔数，失败返回 0 */
function drillSocket(item) {
  if (!canDrill(item)) return 0;
  item.sockets = socketCount(item) + 1;
  if (!Array.isArray(item.runes)) item.runes = [];
  item.runes.length = item.sockets;
  for (let i = 0; i < item.sockets; i++) if (item.runes[i] === undefined) item.runes[i] = null;
  return item.sockets;
}

/* ---------------- 套装打造（v1.1.2） ----------------
 * 把一件属性满意的装备打造成指定套装的对应部位：
 * 保留原有词缀 / 孔位 / 已镶符文 / 强化次数，基底按套装档位系数重算，
 * 词缀不足 3 条时补足。传世（unique）与已是套装的装备不可打造。 */
function setCraftCost(item) {
  if (!item) return { crystal: [0, 0, 0, 0], gold: 0 };
  return {
    crystal: FORGE.setCraft.crystal.slice(),
    gold: FORGE.setCraft.goldBase + (item.ilvl || 1) * FORGE.setCraft.goldPerIlvl
  };
}

/* 这件装备能打进哪些套装（按部位 + 职业匹配；v1.1.9 起套装按职业锁定） */
function setCraftTargets(item) {
  if (!item || item.setId || item.rarity === 'unique') return [];
  const cls = item.affixCls || item.cls;
  return Object.values(SETS).filter(s => s.slots.indexOf(item.slot) >= 0 && (!s.cls || s.cls === cls));
}

/* 打造成指定套装。成功返回 { setId, setName, piece, pieceIndex }，失败返回 null */
function craftSetItem(item, setId) {
  if (!item || item.setId || item.rarity === 'unique') return null;
  const set = SETS[setId];
  if (!set) return null;
  const idx = set.slots.indexOf(item.slot);
  if (idx < 0) return null;                       // 该套装没有这个部位
  /* v1.1.9：职业套装只能由对应职业打造，避免战士打出穿不上的法师套 */
  if (set.cls && set.cls !== (item.affixCls || item.cls)) return null;
  /* 基底按套装系数重算（套装基底比原品质更厚） */
  const k = RARITY.set.mul / (RARITY[item.rarity] ? RARITY[item.rarity].mul : 1);
  if (Array.isArray(item.baseDmg)) {
    item.baseDmg = [Math.round(item.baseDmg[0] * k), Math.round(item.baseDmg[1] * k)];
  }
  if (item.baseArmor) item.baseArmor = Math.round(item.baseArmor * k);
  /* 套装备份：稀有度 / 套装标识 / 名字 / 职业限制 */
  const oldName = item.name;
  item.rarity = 'set';
  item.setId = set.id;
  item.setName = set.name;
  item.name = set.pieces[idx] || set.pieces[0];
  item.cls = set.cls || null;
  /* 套装档位的固定词条数可能比原品质多，补到应有的条数 */
  fillFixedAffixes(item);
  /* 词缀全保留（玩家投入的洗练/强化不白费），不足 3 条补足 */
  const used = new Set();
  (item.affixes || []).forEach(a => { if (a && a.key) used.add(a.key); });
  for (const fa of (item.fixed || [])) if (fa && fa.key) used.add(fa.key);
  /* v1.1.9：套装件保底一条职业标志词条（v1.2.2：优先用本套的 sig 取向）。
   * 只洗出来不足 3 条时才补，且第一条补齐优先给专属词条；原本就够 3 条的老装备一条不动。
   * 注意：标志词条必须按「部位词条池」过滤——武器不出防御词条、
   * 首饰不出近战/持续词条，本套 sig 在该部位全被禁时回落到职业取向。 */
  const sigPool = (typeof affixPool === 'function') ? affixPool(item.affixCls || item.cls, item.slot) : AFFIXES;
  const legalSig = ks => ks.filter(k => sigPool.some(a => a.key === k));
  const sigKeys = legalSig(set.sig || []).length
    ? legalSig(set.sig || []).concat(legalSig(SET_SIG[set.cls] || []))
    : legalSig(SET_SIG[set.cls] || []);
  const hasSig = (item.affixes || []).some(a => sigKeys.indexOf(a.key) >= 0)
    || (item.fixed || []).some(a => sigKeys.indexOf(a.key) >= 0);
  const sigFree = sigKeys.filter(k => !used.has(k));
  let filled = 0;
  while ((item.affixes || []).length < 3) {
    const a = makeAffix(item.ilvl || 1, used, item.affixCls || item.cls, item.slot,
      null, (filled === 0 && !hasSig && sigFree.length) ? PICK(sigFree) : null);
    if (!a) break;
    item.affixes.push(a);
    used.add(a.key);
    filled++;
  }
  return { setId: set.id, setName: set.name, piece: item.name, pieceIndex: idx, oldName };
}

/* 重 roll 指定词缀：稀有度 / 词缀数量不变，新词缀一定换 key，同时重 roll 品质 */
function reforgeAffix(item, index) {
  if (!item || !Array.isArray(item.affixes)) return null;
  if (index < 0 || index >= item.affixes.length) return null;
  const used = new Set();
  /* 固定词条洗不动，但它们的 key 已被占用，新词条不能重复 */
  for (const fa of (item.fixed || [])) if (fa && fa.key) used.add(fa.key);
  item.affixes.forEach((a, i) => {
    if (i === index) return;
    if (a && a.key) used.add(a.key);
  });
  const old = item.affixes[index];
  if (old && old.key) used.add(old.key);
  const a = makeAffix(item.ilvl || 1, used, item.affixCls || item.cls, item.slot);
  item.affixes[index] = a;
  item.reforges = (item.reforges || 0) + 1;
  return a;
}

/* 词缀数值理论上限：品质拉满（q4 → affixValue 的 mul 1.30）时的最高取值。
 * 定向升级用它判断「还能不能升」，避免在分布尾巴上无限重掷。 */
function affixValueCap(def, ilvl) {
  if (!def) return 0;
  return Math.max(1, Math.round(def.max * (1 + (ilvl || 1) * 0.055) * 1.30));
}

/* ---------------- 定向洗炼（v1.2）：单条词条升级 ----------------
 * 每次只动选中的那 1 条：词条 key 不变，新数值严格大于旧值，
 * 永远不产生「洗练后数值下降」的结果。
 * 接近上限时正常 roll 掷不出更高值，退化 +1 保底；封顶后返回 null。 */
function upgradeAffix(item, index) {
  if (!item || !Array.isArray(item.affixes)) return null;
  const idx = Number(index);
  if (!(idx >= 0 && idx < item.affixes.length)) return null;
  const old = item.affixes[idx];
  if (!old || !old.key) return null;
  const def = AFFIXES.find(a => a.key === old.key);
  if (!def) return null;
  const ilvl = item.ilvl || 1;
  const cap = affixValueCap(def, ilvl);
  const prev = Math.round(Number(old.val) || 0);
  if (prev >= cap) return null;                 // 已封顶，升不动
  let a = null, forced = false;
  for (let i = 0; i < 240; i++) {
    const q = rollAffixQuality();
    const val = affixValue(def, ilvl, q);
    if (val > prev) {
      a = { key: def.key, val, pre: def.pre, suf: def.suf, tier: def.tier, q };
      break;
    }
  }
  if (!a) {
    /* 旧值已贴到分布尾部：保底 +1，仍然严格上升且不越上限 */
    a = { key: def.key, val: Math.min(cap, prev + 1), pre: def.pre, suf: def.suf, tier: def.tier, q: old.q || 1 };
    forced = true;
  }
  item.affixes[idx] = a;
  item.reforges = (item.reforges || 0) + 1;
  return { affix: a, prev, cap, gain: a.val - prev, forced };
}

/* ---------------- 定向洗炼（v1.1.3）· 换成指定词条 ----------------
 * 候选词条 = 全部 AFFIXES 去掉「其他词缀位已占用」的 key
 * （makeAffix 的 used 规则决定：同装备不会出重复词条）。
 * 当前位已有的 key 允许再中——那等于已经达标。 */
function reforgeTargets(item, index) {
  if (!item || !Array.isArray(item.affixes) || index < 0 || index >= item.affixes.length) return [];
  const usedElsewhere = new Set();
  /* 固定词条同样占 key：不能把目标洗成和固定词条重复的属性 */
  for (const fa of (item.fixed || [])) if (fa && fa.key) usedElsewhere.add(fa.key);
  item.affixes.forEach((a, i) => { if (i !== index && a && a.key) usedElsewhere.add(a.key); });
  return AFFIXES.filter(a => !usedElsewhere.has(a.key));
}

/* 预估：单次 roll 出目标词条的概率 → 期望次数 → 考虑 +35% 递增后的总花费。
 * 只作心理预期展示，不参与实际扣费。 */
function estimateTargetedReforge(item, index, affixDef) {
  if (!item || !affixDef) return { attempts: 0, cost: 0 };
  const targets = reforgeTargets(item, index);
  const avail = new Set(targets.map(a => a.key));
  const tierW = { 1: 0, 2: 0, 3: 0 };
  for (const a of targets) tierW[a.tier] += (a.weight || 1);
  const pWant = { 1: 0.62, 2: 0.28, 3: 0.10 };
  let p = 0;
  for (const t of [1, 2, 3]) {
    if (!tierW[t] || !avail.has(affixDef.key) || affixDef.tier !== t) continue;
    p += pWant[t] * ((affixDef.weight || 1) / tierW[t]);
  }
  if (p <= 0) return { attempts: 0, cost: 0 };
  const n = Math.max(1, Math.ceil(1 / p));
  let cost = 0;
  for (let k = 0; k < n; k++) cost += Math.round((FORGE.reforgeCost[item.rarity] || 10) * (1 + ((item.reforges || 0) + k) * FORGE.reforgeStep));
  return { attempts: n, cost };
}

/* 旧档 / 导入档的物品整形：孔位、符文、词缀、固有属性都要能被信任 */
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  /* v1.1.7：词条职业倾向，旧档没有就留空（走中性池） */
  if (item.affixCls && typeof CLASSES !== 'undefined' && !CLASSES[item.affixCls]) item.affixCls = null;
  /* v1.1.9：套装目录收敛为职业套装。旧档里的其它套装件
   * （青龙 / 朱雀 / 九幽 / 天罡 / 山海 …）已退出目录：卸掉套装标识、
   * 稀有度降为玄品；装备本身的词条 / 孔位 / 符文全部保留，不销毁玩家资产。 */
  if (item.setId && !SETS[item.setId]) {
    item.setId = null;
    item.setName = null;
    if (item.rarity === 'set') item.rarity = 'rare';
  }
  /* v1.2.2：套装的部位构成变了（6 件 → 3/4/5 件，且不再含套装武器）。
   * 旧档里「套装部位已不在该套目录内」的部件同样剥掉套装标识，避免
   * 出现「穿一件武器也计入 5 件套」的错乱。 */
  if (item.setId) {
    const set = SETS[item.setId];
    const slot = item.slot === 'ring' ? 'ring' : item.slot;
    if (set.slots.indexOf(slot) < 0) {
      item.setId = null;
      item.setName = null;
      if (item.rarity === 'set') item.rarity = 'rare';
    }
  }
  /* v1.3.0：兵器握持。旧档武器没有 hand，按外形兜底；
   * 非武器身上残留的 hand 一律清掉，避免出现「副手也能双持」的脏数据。 */
  if (item.slot === 'weapon') {
    if (item.hand !== 'one' && item.hand !== 'dual' && item.hand !== 'two') item.hand = weaponHandFallback(item.shape);
  } else if (item.hand) item.hand = null;
  if (!Array.isArray(item.affixes)) item.affixes = [];
  item.affixes = item.affixes.filter(a => a && typeof a.key === 'string' && STATS[a.key] && isFinite(a.val));
  // 旧档词缀没有 q，补齐为 1
  for (const a of item.affixes) { if (!a.q) a.q = 1; }
  /* 固定初始词条：校验 + 旧档按品质补齐。
   * v1.1.6 之前的存档压根没有 fixed 字段，这里补上，
   * 让「品质决定固定词条数」的规则对老装备同样成立。 */
  if (!Array.isArray(item.fixed)) item.fixed = [];
  item.fixed = item.fixed.filter(a => a && typeof a.key === 'string' && STATS[a.key] && isFinite(a.val));
  for (const a of item.fixed) { if (!a.q) a.q = 1; a.fixed = true; }
  fillFixedAffixes(item);
  let n = CLAMP(Math.round(Number(item.sockets) || 0), 0, FORGE.drillMax);
  if (item.slot === 'ring' || item.slot === 'amulet') n = 0;
  item.sockets = n;
  const src = Array.isArray(item.runes) ? item.runes : [];
  item.runes = [];
  for (let i = 0; i < n; i++) {
    const id = src[i];
    item.runes.push(typeof id === 'string' && RUNES[id] ? id : null);
  }
  if (item.implicit && (!STATS[item.implicit.key] || !isFinite(item.implicit.val))) item.implicit = null;
  if (item.uniqueStats && typeof item.uniqueStats === 'object') {
    for (const k in item.uniqueStats) {
      if (!STATS[k] || !isFinite(item.uniqueStats[k])) delete item.uniqueStats[k];
    }
  }
  /* 唯一装备：目录 id / 特性 / 技能效果都要能被信任，损坏的字段直接清掉 */
  if (item.rarity === 'unique') {
    if (typeof item.uniqueId !== 'string' || !UNIQUE_BY_ID.has(item.uniqueId)) item.uniqueId = null;
    if (!Array.isArray(item.traits)) item.traits = [];
    item.traits = item.traits.filter(t => typeof t === 'string' && UNIQUE_TRAITS[t]);
    /* [UNIQUE-2] skill 允许「只有 grant 没有 id」（纯解锁型），旧档 / 脏数据也按这个放行 */
    if (item.uniqueSkill && (typeof item.uniqueSkill !== 'object'
      || (typeof item.uniqueSkill.id !== 'string' && typeof item.uniqueSkill.grant !== 'string'))) {
      item.uniqueSkill = null;
    }
    if (typeof item.lore !== 'string') item.lore = '';
    /* [UNIQUE-1] 传世不进八阶体系；旧档里的传世也补上标记 */
    item.tierless = true;
  } else if (item.tierless) {
    item.tierless = false;
  }
  if (!isFinite(item.reforges) || item.reforges < 0) item.reforges = 0;
  if (!isFinite(item.enhances) || item.enhances < 0) item.enhances = 0;
  /* [B5] 基底阶 / 变体：旧档没有就按 ilvl 反推（升阶后 baseTier 与 ilvl 会脱钩，
   * 所以这里不能每次都覆盖，只在缺失或越界时补） */
  if (!isFinite(item.baseTier) || item.baseTier < 0 || item.baseTier > BASE_TIERS - 1) {
    item.baseTier = tierIndex(item.ilvl || 1);
  }
  item.baseTier = Math.round(item.baseTier);
  if (!isFinite(item.baseVar) || item.baseVar < 0) item.baseVar = 0;
  item.baseVar = Math.round(item.baseVar);
  if (!isFinite(item.tierUps) || item.tierUps < 0) item.tierUps = 0;
  return item;
}

/* [M1] 基底 5 档 → 8 档：每 5 级一换皮（ilvl 1-40 → 0..7）。
 * 顶档数值与旧版顶档一致（不抬上限），只是中间多垫了地煞 / 天罡 / 仙品三层，
 * 让中期每 5 级都有「换一层皮」的期待。 */
const BASE_TIERS = 8;
const TIER_LEVELS = 5;
function tierIndex(ilvl) {
  return CLAMP(Math.floor((ilvl - 1) / TIER_LEVELS), 0, BASE_TIERS - 1);
}

function itemPower(item) {
  let s = 0;
  if (item.implicit) s += item.implicit.val * (STATS[item.implicit.key].pct ? 1.6 : 0.6);
  for (const a of (item.fixed || [])) s += a.val * (STATS[a.key].pct ? 1.6 : 0.5);
  for (const a of item.affixes) s += a.val * (STATS[a.key].pct ? 1.6 : 0.5);
  if (item.baseDmg) s += (item.baseDmg[0] + item.baseDmg[1]) * 1.4;
  if (item.baseArmor) s += item.baseArmor * 0.9;
  return Math.round(s + item.ilvl * 4);
}

function itemValue(item) {
  const r = { common: 1, magic: 1.8, rare: 3, legendary: 6, set: 5, unique: 10 }[item.rarity];
  const n = (item.affixes ? item.affixes.length : 0) + (item.fixed ? item.fixed.length : 0);
  return Math.round((12 + item.ilvl * 8) * r * (1 + n * 0.15));
}

function affixValue(a, ilvl, q) {
  const quality = q || 1;
  const mul = quality === 4 ? 1.30 : quality === 3 ? 1.18 : quality === 2 ? 1.08 : 1.0;
  const v = RND(a.min, a.max) * (1 + ilvl * 0.055) * mul;
  return Math.max(1, Math.round(v));
}

/* 词缀品质 roll：1-4，权重递减 */
function rollAffixQuality() {
  const r = Math.random();
  return r < 0.58 ? 1 : (r < 0.85 ? 2 : (r < 0.96 ? 3 : 4));
}

function makeAffix(ilvl, used, cls, slot, tierForce, keyForce) {
  /* v1.1.7：先按职业 / 部位收窄词条池，再排除已占用的 key */
  const base = (typeof affixPool === 'function' && (cls || slot)) ? affixPool(cls, slot) : AFFIXES;
  let pool = base.filter(a => !used.has(a.key));
  if (!pool.length) pool = base;   // 本池被占满时退回本池，避免 PICK 空数组
  /* v1.1.9：keyForce 指定词条（套装专属保底用）。指定词条不可用时
   * 自动退化为常规随机，绝不影响词条产出数量。 */
  let a = keyForce ? pool.find(x => x.key === keyForce) : null;
  if (!a) {
    const roll = Math.random();
    const tierWant = tierForce || (roll < 0.62 ? 1 : (roll < 0.9 ? 2 : 3));
    let cand = pool.filter(x => x.tier === tierWant);
    if (!cand.length && tierForce) cand = pool.filter(x => x.tier >= 2);
    if (!cand.length) cand = pool;
    const weighted = [];
    for (const c of cand) for (let i = 0; i < (c.weight || 1); i++) weighted.push(c);
    a = PICK(weighted);
  }
  used.add(a.key);
  const q = rollAffixQuality();
  return { key: a.key, val: affixValue(a, ilvl, q), pre: a.pre, suf: a.suf, tier: a.tier, q };
}

/* ---------------- 固定初始词条（v1.1.6） ----------------
 * 每件装备按品质自带若干条「固定词条」（条数见 RARITY[x].fixed）：
 * 洗练 / 强化 / 改为指定词条都碰不到它们，是这件装备的底子。
 * 与可洗练词条（item.affixes）分两个独立数组存放，只在属性汇总时合并。
 * 传世（unique）不参与：它的固定词条走 uniqueStats，避免双重计算。 */
/* 等级成长（v1.1.8）：同一品质下，装备等级越高词条越多。
 * 低等级保持原样，高等级逐档递进 —— 打高级图能拿到词条更多的装备。 */
function affixLevelBonus(ilvl) {
  const l = Math.max(1, Math.round(ilvl || 1));
  return {
    fixed: l >= 30 ? 2 : (l >= 12 ? 1 : 0),
    wash: l >= 32 ? 2 : (l >= 16 ? 1 : 0)
  };
}

function fixedAffixCount(item) {
  if (!item) return 0;
  const r = RARITY[item.rarity];
  if (!r) return 0;
  return (r.fixed || 0) + affixLevelBonus(item.ilvl).fixed;
}

function itemFixed(item) {
  if (!item) return [];
  if (!Array.isArray(item.fixed)) item.fixed = [];
  return item.fixed;
}

/* 生成一条固定词条：走和随机词条同一套池子，但数值打 FORGE.fixedMul 折 */
function makeFixedAffix(ilvl, used, cls, slot) {
  const a = makeAffix(ilvl, used, cls, slot);
  if (!a) return null;
  const mul = (typeof FORGE !== 'undefined' && FORGE.fixedMul) || 0.6;
  a.val = Math.max(1, Math.round(a.val * mul));
  a.fixed = true;
  return a;
}

/* 把固定词条补到品质应有的条数。
 * 旧存档迁移与品质提升共用，返回补了几条。 */
function fillFixedAffixes(item) {
  if (!item) return 0;
  if (item.slot === 'relic') return 0;   // 法器属性由 RELICS 写死，不吃品质补全
  const want = fixedAffixCount(item);
  const list = itemFixed(item);
  if (list.length >= want) return 0;
  const used = new Set();
  for (const a of (item.affixes || [])) if (a && a.key) used.add(a.key);
  for (const a of list) if (a && a.key) used.add(a.key);
  let added = 0;
  while (list.length < want) {
    const a = makeFixedAffix(item.ilvl || 1, used, item.affixCls || item.cls, item.slot);
    if (!a) break;
    list.push(a);
    added++;
  }
  return added;
}

/* 强化：给装备直接扩充一条新词缀（上限 FORGE.enhanceMax） */
function enhanceItem(item) {
  if (!item || !Array.isArray(item.affixes)) return null;
  const maxBase = (RARITY[item.rarity].affixes || 0) + affixLevelBonus(item.ilvl).wash;
  /* 稀有词条是掉落时额外送的，不占强化名额 */
  const extra = item.affixes.filter(a => a && !a.rare).length - maxBase;
  if (extra >= FORGE.enhanceMax) return null;
  const used = new Set(item.affixes.map(a => a && a.key).filter(Boolean));
  for (const fa of (item.fixed || [])) if (fa && fa.key) used.add(fa.key);
  const a = makeAffix(item.ilvl || 1, used, item.affixCls || item.cls, item.slot);
  item.affixes.push(a);
  item.enhances = (item.enhances || 0) + 1;
  return a;
}

function enhanceCost(item) {
  if (!item) return 0;
  const base = FORGE.enhanceCostBase[item.rarity] || 15;
  return Math.round(base * (1 + (item.enhances || 0) * FORGE.enhanceStep));
}

function affixText(a) {
  const s = STATS[a.key];
  const color = AFFIX_QUALITY_COLOR[a.q] || AFFIX_QUALITY_COLOR[1];
  return `<span style="color:${color}">+${a.val}${s.pct ? '%' : ''} ${s.label}</span>`;
}

function baseTierFor(slot, ilvl) {
  const ti = tierIndex(ilvl);
  if (slot === 'weapon') return ti;
  return ti;
}

/* ---------------- [M1/B5] 基底阶：查询与升阶 ----------------
 * 计划要求「装备升品阶（+1 基底阶，消耗同名装备）」，
 * 与已有的「品质提升（凡品→灵品→玄品→传世）」是两条线：
 *   品质 = 词条条数与倍率；基底阶 = 这一件「是什么材料打的」（护甲/伤害/固有）。
 * 升阶不动品质、不动词条、不动等级，只把基底换成下一档的同变体，
 * 于是数值曲线天然是连续的（下一档 A 变体 vs 这一档 A 变体）。
 *
 * baseTier / baseVar 在 rollItem 时落库；旧档没有这两个字段时按 ilvl 反推。 */
const BASE_TIER_NAME = ['凡兵', '精铁', '玄铁', '地煞', '天罡', '仙品', '神兵', '太初'];

function itemBaseList(item) {
  if (!item) return null;
  if (item.slot === 'weapon') return WEAPON_BASES[item.cls] || null;
  if (item.slot === 'offhand') return OFFHAND_BASES[item.cls] || null;
  if (item.slot === 'relic') return null;          // 法器是目录固定件，没有基底阶
  return ARMOR_BASES[item.slot] || null;
}

function itemBaseTier(item) {
  if (!item) return 0;
  if (typeof item.baseTier === 'number' && item.baseTier >= 0) {
    return CLAMP(item.baseTier, 0, BASE_TIERS - 1);
  }
  return tierIndex(item.ilvl || 1);
}

function itemTierName(item) {
  return BASE_TIER_NAME[itemBaseTier(item)] || BASE_TIER_NAME[0];
}

/* [UNIQUE-1] 阶名展示：传世没有阶，别硬算一个数字出来糊弄玩家 */
function itemTierLabel(item) {
  if (!item) return '';
  if (item.tierless || item.rarity === 'unique') return '传世';
  return itemTierName(item);
}

/* 能不能升：顶阶 / 法器 / 认不出部位都给出明确理由 */
function upgradeTierInfo(item) {
  if (!item) return { ok: false, msg: '没有这件装备。' };
  /* [UNIQUE-1] 传世不在八阶体系里，给它留一条独立说明，
   * 否则玩家会以为「打到了好东西却升不了」是 bug */
  if (item.tierless || item.rarity === 'unique') {
    return { ok: false, msg: '传世装备不属于八阶基底体系，不参与升阶 —— 它的强度来自固定词条、独有特性与专属技能。' };
  }
  const list = itemBaseList(item);
  if (!list || !list.length) return { ok: false, msg: '这件装备没有基底阶（法器不能升阶）。' };
  const tier = itemBaseTier(item);
  const last = list.length - 1;
  if (tier >= last) return { ok: false, msg: '已是顶阶「' + BASE_TIER_NAME[last] + '」，无法再升。' };
  return { ok: true, tier, next: tier + 1, from: BASE_TIER_NAME[tier], to: BASE_TIER_NAME[tier + 1] };
}

/* 升阶价：越往上越贵，品质越高越贵（好底子本来就该更贵） */
function upgradeTierCost(item) {
  const info = upgradeTierInfo(item);
  if (!info.ok) return null;
  const mul = ({ common: 1, magic: 1.4, rare: 1.9, legendary: 2.6, set: 2.2, unique: 3 })[item.rarity] || 1;
  return {
    gold: Math.round((400 + info.next * 900) * mul),
    crystal: Math.round((2 + info.next * 1.6) * mul)
  };
}

/* 真的升一阶：换基底、按原公式重算护甲/伤害、换固有属性。
 * 名字只在不属于套装/传世时才跟着基底走（套装件名是固定的）。 */
function upgradeItemBaseTier(item) {
  const info = upgradeTierInfo(item);
  if (!info.ok) return null;
  const list = itemBaseList(item);
  const tierList = list[info.next];
  const vi = CLAMP(item.baseVar || 0, 0, tierList.length - 1);
  const oldName = item.baseName || item.name;
  const rm = RARITY[item.rarity].mul;

  if (item.slot === 'weapon') {
    const base = tierList[vi];
    item.baseName = base.name;
    item.baseDmg = [
      Math.round(base.dmg[0] * (1 + item.ilvl * 0.100) * rm),
      Math.round(base.dmg[1] * (1 + item.ilvl * 0.100) * rm)
    ];
    item.speed = base.speed;
    item.shape = base.shape || item.shape;
    item.hand = weaponHandAt(item.cls, info.next, vi);
  } else {
    const [bn, barm, ik, iv] = tierList[vi];
    item.baseName = bn;
    item.baseArmor = Math.round(barm * (1 + item.ilvl * (item.slot === 'offhand' ? 0.1 : 0.13)) * rm);
    item.implicit = ik ? { key: ik, val: iv } : null;
  }
  if (!item.setId && item.rarity !== 'unique') item.name = item.baseName;
  item.baseTier = info.next;
  item.baseVar = vi;
  item.tierUps = (item.tierUps || 0) + 1;
  return { from: info.from, to: info.to, oldName, newName: item.baseName, tier: info.next };
}


/* 生成一件装备 */
function rollItem(ilvl, opts = {}) {
  ilvl = CLAMP(Math.round(ilvl), 1, 40);
  let slot = opts.slot || PICK(['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon', 'offhand']);
  /* 默认职业池读注册表：写死三个职业的话，新加的职业永远掉不到自己用的武器 */
  let cls = opts.cls || PICK((typeof classPackIds === 'function') ? classPackIds() : ['warrior', 'mage', 'taoist']);
  /* v1.3.0：法器另有 6% 的掉落入口。挂在部位池之外，原有掉率分布不动。
   * 只在「完全随机」时溢出：指定了部位或品质的调用（任务奖励 / 定向刷装 / 统计）
   * 一律按调用方要求出，不会被法器顶掉。 */
  /* [v1.10.0] 法器掉率 6% → 2%：法器是目录固定件、品质恒为「神品」（橙色边框），
   * 6% 的入口加上小怪 30% 的掉率，等于每 50 只小怪就有一件橙 —— 这正是
   * 玩家反馈「小怪掉橙几率也不小」的主要来源。降到 2% 后入口仍保留，
   * 但不再把橙色稀释成常见色。 */
  if (!opts.slot && !opts.rarity && !opts.noRelic && CHANCE(0.02)) slot = 'relic';
  if (slot === 'relic') return makeRelic(PICK(relicPool(cls, ilvl)), cls);
  /* [M1] 命格：和法器同理，走独立的低概率入口（4%）。
   * 它只有一格、且只吃机制型词条，掉率高了会把护具挤掉。
   * 注意这里**不受 noRelic 影响**：noRelic 的语义是「别出目录固定件（法器）」，
   * 而命格是正常基底 + 正常词条，属于普通装备统计的一部分。 */
  if (!opts.slot && !opts.rarity && CHANCE(0.02)) slot = 'fate';
  let rarity = opts.rarity;
  if (!rarity) {
    const mf = (opts.magicFind || 0) * ((typeof BALANCE !== 'undefined' && BALANCE.drop) ? BALANCE.drop.mfScale : 0.5);
    /* v1.10.0：调用方可以指定品质池（opts.pool），掉落按怪物层级分池 ——
     * 小怪的池里根本没有神品以上，于是「小怪掉橙」从机制上不可能。
     * 不传 pool 时沿用全局权重（商店 / 任务 / 打造等入口不变）。 */
    const w = opts.pool
      ? opts.pool.map(([k, v]) => [k, v + (k === 'common' ? 0 : mf * (k === 'magic' ? 0.16 : k === 'rare' ? 0.1 : k === 'legendary' ? 0.05 : k === 'set' ? 0.04 : 0.03))])
      : [
        ['common', RARITY.common.weight],
        ['magic', RARITY.magic.weight + mf * 0.16],
        ['rare', RARITY.rare.weight + mf * 0.1],
        ['legendary', RARITY.legendary.weight + mf * 0.05],
        ['set', RARITY.set.weight + mf * 0.04],
        ['unique', RARITY.unique.weight + mf * 0.03]
      ];
    let total = w.reduce((s, x) => s + x[1], 0), r = Math.random() * total;
    for (const [k, v] of w) { if (r < v) { rarity = k; break; } r -= v; }
    if (!rarity) rarity = 'common';
  }

  /* ---- 唯一装备：先定目录条目，再由它决定部位与职业 ----
   * 掉不出对应部位的传世就退化成神品，保证不会生成空壳物品。 */
  let uniqueDef = null;
  if (rarity === 'unique') {
    const pool = uniquePool(ilvl, cls, opts.slot);
    if (pool.length) {
      uniqueDef = PICK(pool);
      slot = uniqueDef.slot;
      cls = uniqueDef.cls || cls;
    } else {
      rarity = 'legendary';
    }
  }

  const isRing = slot === 'ring';
  const item = {
    uid: ITEM_UID++, slot, ilvl, rarity, cls: null,
    /* v1.1.7：记录生成时的职业倾向。防具基底本身通用（不限制穿戴），
     * 但词条池要贴合掉落者的职业，所以单独存 affixCls。
     * 武器 / 副手本来就有 item.cls，两者取其一即可。 */
    affixCls: cls, affixes: [],
    implicit: null, sockets: 0, runes: [], reforges: 0,
    setId: null, setName: null, power: null, powerDesc: null, reqLv: Math.max(1, ilvl - 1)
  };

  /* ---- 基底 ----
   * 每个档位有 3 个流派变体，随机取一个；变体若带固有属性就记进 item.implicit。
   * 固有属性和词缀一样走 sumItemStats 汇总，所以是真实生效的，不是摆设。
   */
  if (slot === 'weapon') {
    /* 兜底：职业包没带武器基底时借用已有职业的，别让一次掉落把游戏打崩。
     * 真出现这种情况，classPackValidate 会报「WEAPON_BASES 里没有该职业的武器基底」。 */
    const list = WEAPON_BASES[cls] || WEAPON_BASES[Object.keys(WEAPON_BASES)[0]];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const bi = Math.floor(Math.random() * list[tier].length);
    const base = list[tier][bi];
    /* [B5] 记住基底阶与变体：升阶要换「同变体的下一档」，而不是随机换一个 */
    item.baseTier = tier; item.baseVar = bi;
    const rm = RARITY[rarity].mul;
    const lo = base.dmg[0] * (1 + ilvl * 0.100) * rm;
    const hi = base.dmg[1] * (1 + ilvl * 0.100) * rm;
    item.baseName = base.name;
    item.shape = base.shape;
    /* v1.3.0 握持：同档三变体按均伤排（最轻双持 / 居中单手 / 最重双手） */
    item.hand = weaponHandAt(cls, tier, bi);
    item.baseDmg = [Math.round(lo), Math.round(hi)];
    item.speed = base.speed;
    item.cls = cls;
    item.name = base.name;
    item.kind = '武器';
  } else if (slot === 'offhand') {
    const list = OFFHAND_BASES[cls] || OFFHAND_BASES[Object.keys(OFFHAND_BASES)[0]];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const vi = Math.floor(Math.random() * list[tier].length);
    const [bn, barm, ik, iv] = list[tier][vi];
    item.baseTier = tier; item.baseVar = vi;
    item.baseName = bn;
    item.baseArmor = Math.round(barm * (1 + ilvl * 0.088) * RARITY[rarity].mul);
    item.cls = cls;
    item.name = bn;
    item.kind = '副手';
    item.shape = (CLASSES[cls] && CLASSES[cls].offhandShape) || 'charm';
    if (ik) item.implicit = { key: ik, val: iv };
  } else {
    const list = ARMOR_BASES[slot];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const vi = Math.floor(Math.random() * list[tier].length);
    const [bn, barm, ik, iv] = list[tier][vi];
    item.baseTier = tier; item.baseVar = vi;
    item.baseName = bn;
    item.baseArmor = Math.round(barm * (1 + ilvl * 0.112) * RARITY[rarity].mul);
    item.name = bn;
    item.kind = SLOTS[slot].name;
    if (ik) item.implicit = { key: ik, val: iv };
  }
  if (isRing) { item.slot = 'ring'; }

  /* ---- 套装（v1.2.2：9 套职业套装，部位精确匹配） ---- */
  if (rarity === 'set') {
    const cands = Object.values(SETS).filter(s => s.slots.indexOf(slot) >= 0 && (!s.cls || s.cls === cls));
    if (cands.length) {
      const set = PICK(cands);
      const idx = set.slots.indexOf(slot);
      item.setId = set.id;
      item.setName = set.name;
      item.name = set.pieces[idx];
      item.rarity = 'set';
      item.cls = set.cls || null;
    } else rarity = item.rarity = 'rare';   // 该部位没有任何本职业套装时降级为玄品（例如戒指）
  }

  /* ---- 唯一装备（传世） ----
   * 固定名字 / 固定词条区间 / 特性 / 技能效果；每次掉落重新 roll 数值，
   * 所以同一件传世也能反复刷、反复比较。 */
  if (uniqueDef) {
    item.rarity = 'unique';
    item.uniqueId = uniqueDef.id;
    item.name = uniqueDef.name;
    /* [UNIQUE-1] 传世不属于八阶基底体系。
     * 八阶是「同一件装备往上换一层皮」的成长线，而传世是固定名字、固定特性、
     * 带专属技能的独立装备 —— 让它也显示「太初」会让两套体系混在一起。
     * tierless 标记后：界面不显示阶名、炼器台不允许升阶、词缀数值照样吃 ilvl。 */
    item.tierless = true;
    item.lore = uniqueDef.lore || '';
    item.traits = (uniqueDef.traits || []).slice();
    item.uniqueSkill = uniqueDef.skill ? Object.assign({}, uniqueDef.skill) : null;
    item.uniqueStats = rollUniqueStats(uniqueDef, ilvl);
    item.reqLv = Math.max(1, uniqueDef.ilvl);
    if (uniqueDef.shape) item.shape = uniqueDef.shape;
    if (uniqueDef.baseName) item.baseName = uniqueDef.baseName;
    if (uniqueDef.cls) item.cls = uniqueDef.cls;
    /* 传世自带外形（剑 / 杖 / 符剑），握持按外形重算，别沿用随机基底那一件 */
    if (slot === 'weapon') item.hand = uniqueDef.hand || weaponHandFallback(item.shape);
  }

  /* ---- 孔位（S2）：1-4 孔，戒指/项链不出孔 ---- */
  item.sockets = rollSocketCount(slot, item.rarity);
  item.runes = item.sockets ? new Array(item.sockets).fill(null) : [];

  /* ---- 词缀 ----
   * 先生成固定初始词条（条数由品质决定），再生成可洗练词条。
   * 两者共用一个 used 集合，所以同一件装备不会出现重复 key。 */
  const lvBonus = affixLevelBonus(ilvl);
  let count = (RARITY[item.rarity].affixes || 0) + lvBonus.wash;
  if (item.rarity === 'rare' && CHANCE(0.5)) count += 1;
  if (item.rarity === 'set' && CHANCE(0.4)) count += 1;
  const used = new Set();
  item.fixed = [];
  /* v1.1.9：套装件保底一条职业标志词条。v1.2.2 起优先用本套 sig，
   * 让「龙骧偏攻击、磐石偏防御」在词条层面也成立。
   * 先在池子里挑一个合法 key 并「预留」（加进 used，固定词条就抢不走它），
   * 第 1 条可洗词条定向生成，保底 100% 生效。 */
  let sigKey = null;
  if (item.setId) {
    const pool = (typeof affixPool === 'function') ? affixPool(cls, slot) : AFFIXES;
    const sigList = SETS[item.setId].sig || SET_SIG[cls] || [];
    const sig = sigList.filter(k => pool.some(a => a.key === k) && !used.has(k));
    if (sig.length) { sigKey = PICK(sig); used.add(sigKey); }
  }
  const fixedCount = (RARITY[item.rarity].fixed || 0) + lvBonus.fixed;
  for (let i = 0; i < fixedCount; i++) {
    const fa = makeFixedAffix(ilvl, used, cls, slot);
    if (fa) item.fixed.push(fa);
  }
  for (let i = 0; i < count; i++) {
    let a;
    if (i === 0 && sigKey) { used.delete(sigKey); a = makeAffix(ilvl, used, cls, slot, null, sigKey); }
    else a = makeAffix(ilvl, used, cls, slot);
    if (a) item.affixes.push(a);
  }
  /* 稀有词条惊喜（v1.1.8）：任何品质都可能额外附带一条 tier 3 稀有词条。
   * 不占常规名额、与品质无关，凡品也能爆 —— 「翻垃圾翻出宝」的钩子。 */
  const rareP = (typeof FORGE !== 'undefined' && FORGE.rareAffixChance) || 0.12;
  if (CHANCE(rareP)) {
    const ra = makeAffix(ilvl, used, cls, slot, 3);
    if (ra) { ra.rare = true; item.affixes.push(ra); }
  }

  /* ---- 命名 ---- */
  if (!item.setId && !item.power && !item.uniqueId) {
    if (item.rarity === 'magic') {
      const a = item.affixes[0];
      item.name = (CHANCE(0.5) ? PICK(a.pre) : '') + item.baseName + (CHANCE(0.35) ? PICK(a.suf).replace(/^·\s*/, '·') : '');
    } else if (item.rarity === 'rare') {
      const p = item.affixes[0], s = item.affixes[1] || p;
      item.name = PICK(p.pre) + item.baseName + PICK(s.suf).replace(/^·\s*/, '·');
    } else if (item.rarity === 'legendary') {
      item.name = PICK(['灭世', '焚寂', '太虚', '九幽', '斩龙', '无相']) + '·' + item.baseName;
    }
  }
  item.value = itemValue(item);
  return item;
}

/* 初始装备 */
function makeStarterSet(cls) {
  const w = rollItem(1, { slot: 'weapon', cls, rarity: 'common' });
  /* 开局武器名由职业包提供：加新职业时在 pack.start.weaponName 写一句就行 */
  w.name = (typeof classPackStarterWeaponName === 'function')
    ? classPackStarterWeaponName(cls)
    : ({ warrior: '新兵铁剑', mage: '旧桃木杖', taoist: '师父的桃木剑' }[cls] || '铁剑');
  w.affixes = [{ key: 'atk', val: 3, pre: [], suf: [], tier: 1 }];
  return { weapon: w, chest: rollItem(1, { slot: 'chest', cls, rarity: 'common' }) };
}

/* ---------------- 属性汇总 ---------------- */
function emptyStats() {
  const o = {};
  for (const k in STATS) o[k] = 0;
  return o;
}

function sumItemStats(item, out) {
  if (item.baseDmg) out.atk += (item.baseDmg[0] + item.baseDmg[1]) / 2;
  if (item.baseArmor) out.def += item.baseArmor;
  /* 基底固有属性：S1 新增，全槽通用 */
  if (item.implicit) out[item.implicit.key] = (out[item.implicit.key] || 0) + item.implicit.val;
  /* 固定初始词条与可洗练词条分开存放，只在汇总时合并 */
  for (const a of (item.fixed || [])) out[a.key] = (out[a.key] || 0) + a.val;
  for (const a of item.affixes) out[a.key] = (out[a.key] || 0) + a.val;
  /* S2 符文：单个符文的属性 */
  for (const rid of itemRunes(item)) {
    const r = RUNES[rid];
    if (!r) continue;
    for (const k in r.stats) out[k] = (out[k] || 0) + r.stats[k];
  }
  /* S2 符文之语：在符文属性之上再叠一层 */
  const rw = runeWordOf(item);
  if (rw) for (const k in rw.stats) out[k] = (out[k] || 0) + rw.stats[k];
  if (item.uniqueStats) for (const k in item.uniqueStats) out[k] = (out[k] || 0) + item.uniqueStats[k];
  /* 传世特性：只吃 stats 那部分，flags / special 在 aggregate 里处理 */
  for (const tid of (item.traits || [])) {
    const t = UNIQUE_TRAITS[tid];
    if (!t || !t.stats) continue;
    for (const k in t.stats) out[k] = (out[k] || 0) + t.stats[k];
  }
  if (item.power === 'vampire') out.lifesteal += 5;
  if (item.power === 'speed') out.moveSpd += 8;
  if (item.power === 'thorns') out.thorns += 30;
  if (item.power === 'lifesteal') out.lifesteal += 6;
  if (item.power === 'magicfind') out.magicFind += 30;
}

/* [S3] 天赋加成汇总：传入 state.talents（{ spent, presets }）或直接传 spent map。
 * 载体与套装 / 传世完全同构：stats / skillMods / flag / special。
 * TALENT_NODES 未加载（node 探针只读 items.js）时安全跳过。 */
function applyTalents(talentsState, st, flags, specials, skillMods) {
  if (!talentsState || typeof TALENT_NODES === 'undefined') return;
  const spent = talentsState.spent || talentsState;
  for (const id in spent) {
    const rank = spent[id];
    if (!rank) continue;
    const entry = TALENT_NODES[id];
    if (!entry) continue;               // 已退出目录的节点（旧档）直接忽略
    const n = entry.node;
    if (n.stats) for (const k in n.stats) st[k] = (st[k] || 0) + n.stats[k] * rank;
    if (n.skillMods) {
      for (const skid in n.skillMods) {
        const m = skillMods[skid] || (skillMods[skid] = { dmg: 0, cd: 0, cost: 0, radius: 0, count: 0, dur: 0 });
        for (const k in n.skillMods[skid]) m[k] = (m[k] || 0) + n.skillMods[skid][k] * rank;
      }
    }
    if (n.flag) flags[n.flag] = true;
    if (n.special) specials[n.special] = true;
  }
}

function aggregate(equipped, talents) {
  const st = emptyStats();
  const setCount = {};
  const flags = {};
  const skillMods = {};
  const specials = {};
  /* [UNIQUE-2] 传世的两类「技能级」效果：
   *   grantedSkills —— 装备后直接领悟某个技能（本来等级没到也能放）
   *   skillRank     —— 装备后某个技能等级 +N（升级已有技能的效果）
   * 它们不进 skillMods：skillMods 改的是倍率，这两个改的是「有没有」和「几级」。 */
  const grantedSkills = {};
  const skillRank = {};
  for (const slot in equipped) {
    const it = equipped[slot];
    if (!it) continue;
    sumItemStats(it, st);
    if (it.setId) setCount[it.setId] = (setCount[it.setId] || 0) + 1;
    if (it.power) flags[it.power] = true;
    const rw = runeWordOf(it);
    if (rw && rw.flag) flags[rw.flag] = true;
    /* 传世特性：flags → 战斗判定；special → game.js 里的钩子 */
    for (const tid of (it.traits || [])) {
      const t = UNIQUE_TRAITS[tid];
      if (!t) continue;
      if (t.flags) for (const f of t.flags) flags[f] = true;
      if (t.special) specials[t.special] = true;
    }
    /* 传世技能效果：'*' 是所有技能的通用修正，具体技能进入 skillMods；
     * grant / rank 是另一条通道（解锁技能 / 抬技能等级），见上面注释 */
    const us = it.uniqueSkill;
    if (us && us.id) {
      const m = skillMods[us.id] || (skillMods[us.id] = { dmg: 0, cd: 0, cost: 0, radius: 0, count: 0, dur: 0 });
      for (const k of ['dmg', 'cd', 'cost', 'radius', 'count', 'dur']) if (us[k]) m[k] += us[k];
    }
    if (us && us.grant && SKILLS[us.grant]) grantedSkills[us.grant] = true;
    if (us && us.rank && us.id && us.id !== '*' && SKILLS[us.id]) {
      skillRank[us.id] = (skillRank[us.id] || 0) + us.rank;
    }
  }
  const setBonuses = [];
  for (const sid in setCount) {
    const set = SETS[sid];
    if (!set) continue;               // 旧档里已被移除的套装（v1.1.9 迁移见 normalizeItem）
    for (const b of set.bonuses) {
      if (setCount[sid] >= b.need) {
        setBonuses.push({ setId: sid, name: set.name, text: b.text, need: b.need });
        if (b.stats) for (const k in b.stats) st[k] = (st[k] || 0) + b.stats[k];
        if (b.flag) flags[b.flag] = true;
        if (b.special) specials[b.special] = true;
        /* v1.2.2：一个档位一次登记多个 special（青符 5 件：灵狼质变 + 双狼同开） */
        if (Array.isArray(b.specials)) for (const sp of b.specials) specials[sp] = true;
        if (Array.isArray(b.flags)) for (const f of b.flags) flags[f] = true;
        /* v1.1.9：套装可以直接修正具体技能，与传世的 uniqueSkill
         * 走同一条 skillMods 通道（dmg / radius / count / dur / cost / cd） */
        if (b.skillMods) {
          for (const skid in b.skillMods) {
            const m = skillMods[skid] || (skillMods[skid] = { dmg: 0, cd: 0, cost: 0, radius: 0, count: 0, dur: 0 });
            for (const k in b.skillMods[skid]) m[k] = (m[k] || 0) + b.skillMods[skid][k];
          }
        }
      }
    }
  }
  /* [S3] 天赋（与套装同通道汇总，保证「套装 + 天赋」双重构筑） */
  if (talents) applyTalents(talents, st, flags, specials, skillMods);
  return { stats: st, setCount, setBonuses, flags, skillMods, specials, grantedSkills, skillRank };
}

/* [S1] 概率 / 倍率类属性的硬上限。
 * 词缀数值本身会随 ilvl 放大（×(1+ilvl×0.055)，40 级约 3.2 倍），单件 6% 闪避到 40 级
 * 就是 19%，十件叠起来能到 90%——不封顶的话后期玩家会直接无敌。
 * 这里既是安全阀，也是策划的「可堆叠天花板」：调平衡改这张表即可。 */
/* [v2.x] 上限口径调整（按需求）：
 *   只有「百分比到 100% 就到顶」的两项保留封顶 —— 暴击率 100%（必定暴击）、
 *   冷却缩减 100%（技能无冷却，但 skillCd 里仍有 0.5 秒硬下限防无限连）。
 *   其余属性（闪避 / 减伤 / 增伤 / 爆伤 / 吸血 / 破甲 …）**全部不设上限**，
 *   靠词缀数值与掉落曲线自然收敛；这张表以后只放「必须封顶」的键。 */
const STAT_CAPS = {
  crit: 100,
  cdr: 100
};

/* [S4] 增益（buff）结算表：recalc 按这两张表把 buff.stats 应用到最终属性。
 * BUFF_MUL 是乘区（buff 值 = 百分比）；BUFF_ADD 是加值（buff 值 = 点数）。 */
const BUFF_MUL = { atkPct: 'atk', aspd: 'aspd', moveSpd: 'moveSpd', def: 'def', armorPct: 'def' };
const BUFF_ADD = ['crit', 'critDmg', 'allRes', 'fireRes', 'iceRes', 'poisonRes', 'physRes',
  'lifesteal', 'mpReg', 'mpOnHit', 'hpOnHit', 'killHeal', 'hpRegen',
  'dmgReduce', 'block', 'dodge', 'ccResist', 'thorns',
  'healBonus', 'shieldBonus', 'overkillShield',
  'dmgAll', 'meleeDmg', 'projDmg', 'aoeDmg', 'dotDmg', 'skillDmg', 'summonDmg',
  'eliteDmg', 'bossDmg', 'executeDmg', 'firstStrike', 'armorPen', 'minDmg',
  'stunChance', 'slowChance', 'freezeChance', 'burnChance', 'moveSpdFlat'];

/* 计算玩家最终属性。p.talents 为 { 节点id: 级数 }（S3 天赋投入）。 */
/* [S5] 异兽志区域全录的永久加成。
 * 单独抽成函数而不是塞进 aggregate：图鉴不属于装备，也不该被
 * 「卸下装备重算」影响，放在 computePlayerStats 里合并最稳。 */
function codexBonusStats(codex) {
  const out = {};
  if (!codex || !codex.regions) return out;
  if (typeof CODEX_REGIONS === 'undefined') return out;
  for (const def of CODEX_REGIONS) {
    if (!codex.regions[def.id]) continue;
    for (const k in def.bonus) out[k] = (out[k] || 0) + def.bonus[k];
  }
  return out;
}

function computePlayerStats(p) {
  const agg = aggregate(p.equipment, p.talents);
  const st = agg.stats;
  /* [S5] 图鉴加成并进 st 之后，后面的面板属性、STAT_CAPS 封顶、透传全部自动生效 */
  const cdb = codexBonusStats(p.codex);
  for (const k in cdb) st[k] = (st[k] || 0) + cdb[k];
  /* [P2] 被动 / 关键被动：与图鉴同一条并加通道 —— 封顶、透传、面板显示自动生效 */
  const pdb = (typeof passiveBonusStats === 'function') ? passiveBonusStats(p) : {};
  for (const k in pdb) st[k] = (st[k] || 0) + pdb[k];
  /* [试炼] 无尽试炼的祝福：走同一条并加通道。
   * 必须并在这里（而不是 recalc 之后往 stats 上叠），否则 atkPct / hpPct
   * 这类乘区词条会被已经算完的 atk 直接吃掉，变成「面板好看、实际没效果」。 */
  const tdb = (typeof trialBonusStats === 'function') ? trialBonusStats(p) : {};
  for (const k in tdb) st[k] = (st[k] || 0) + tdb[k];
  const c = CLASSES[p.cls];
  const lv = p.level;
  /* [v1.8.5] 玩家自己分配的点数：四项根基的第四来源（职业基础 + 等级成长 + 装备词条 + 加点） */
  const al = p.attrAlloc || {};
  const str = c.base.str + c.growth.str * (lv - 1) + st.str + (al.str || 0);
  const agi = c.base.agi + c.growth.agi * (lv - 1) + st.agi + (al.agi || 0);
  const vit = c.base.vit + c.growth.vit * (lv - 1) + st.vit + (al.vit || 0);
  const int = c.base.int + c.growth.int * (lv - 1) + st.int + (al.int || 0);
  /* 根基 → 进阶：换算表在职业数据里，刀客的力量和术士的力量不是一回事 */
  const d = deriveFromAttrs(p.cls, { str, agi, vit, int });

  const atk = (c.baseAtk + st.atk + d.atk) * (1 + st.atkPct / 100);
  const hpMax = (c.baseHp + lv * 16 + d.hpMax + st.hp) * (1 + st.hpPct / 100);
  const mpMax = (c.baseMp + lv * 4 + d.mpMax + st.mp) * (1 + st.mpPct / 100);
  /* 暴击起点读平衡表（v1.10.0）：老版写死 5 / 150，1 级裸装就 150% 爆伤，
   * 玩家反馈「这不合理」。缺表时退回同一组默认值，单文件测试也能跑。 */
  const BC = (typeof BALANCE !== 'undefined' && BALANCE.crit) ? BALANCE.crit : { base: 3, dmg: 125, dmgCap: 500 };
  /* [v2.x] 暴击率封顶 100%（必定暴击）；暴击伤害不再设上限 */
  const crit = CLAMP(BC.base + d.crit + st.crit, 0, 100);
  const critDmg = BC.dmg + d.critDmg + st.critDmg;
  const aspd = (1 + st.aspd / 100) * (1 + d.aspd / 100);
  /* 基础移速读平衡表（v1.11.0）：原写死 7.2，配合小地图跑图过快。
   * 缺表时退回同一组默认值，单文件测试也能跑。 */
  const MV = (typeof BALANCE !== 'undefined' && BALANCE.move) ? BALANCE.move : { base: 4.5 };
  const moveSpd = (MV.base + d.moveSpd) * (1 + st.moveSpd / 100) + st.moveSpdFlat;
  const def = (st.def + d.def) * (1 + st.armorPct / 100);
  /* [v2.x] 冷却缩减封顶 100%（与 STAT_CAPS.cdr 同口径） */
  const cdr = CLAMP(st.cdr + d.cdr, 0, 100);

  const out = {
    str, agi, vit, int, atk, hpMax: Math.round(hpMax), mpMax: Math.round(mpMax),
    crit, critDmg, aspd, moveSpd, def, cdr,
    mpReg: 3 + st.mpReg + d.mpReg,
    /* 面板 / 提示框要显示「根基贡献了多少」，存一份免得两处各算一遍 */
    attrDerived: d,
    setBonuses: agg.setBonuses, setCount: agg.setCount, flags: agg.flags,
    skillMods: agg.skillMods, specials: agg.specials, raw: st,
    grantedSkills: agg.grantedSkills, skillRank: agg.skillRank
  };
  /* 其余属性一律透传。
   * S1 新增的 40 个属性（dodge/block/dmgAll/armorPen/...) 全走这条路，
   * 以后再加属性也不会因为忘了写 return 而变成「面板上没有、战斗里没有」。 */
  for (const k in st) if (!(k in out)) out[k] = st[k];
  /* [S1] 概率 / 倍率类属性封顶，防止后期无敌 */
  for (const k in STAT_CAPS) {
    if (typeof out[k] === 'number' && out[k] > STAT_CAPS[k]) out[k] = STAT_CAPS[k];
  }
  return out;
}

/* ---------------- 穿戴需求（v1.8.5） ----------------
 * 以前只有「需求等级」，升到级就能穿，根基属性除了加伤害没有别的用处。
 * 现在每件装备额外要「根基属性」，需求值按**穿戴者职业**的成长曲线推算：
 *   需求 = 系数(部位) × 品质系数 × 该职业该属性在 reqLv 时的自然成长值
 * 用穿戴者职业来算（而不是掉落者），因为防具是通用的：
 * 同一件胸甲，刀客看到「体质 55」，术士看到「体质 43」—— 各自按自家成长曲线折算。
 * 武器 / 饰品额外要主属性（刀客力量、术士灵力），护甲只看体质。
 * 门槛只在**穿戴那一刻**校验：属性后来变化（洗点 / 换装备）不会把身上的东西扒下来。
 */
const REQ_SLOT_KIND = {
  weapon: 'weapon', offhand: 'offhand',
  helm: 'armor', chest: 'armor', shoulders: 'armor', gloves: 'armor',
  boots: 'armor', belt: 'armor', cloak: 'armor',
  amulet: 'acc', ring: 'acc', relic: 'acc', fate: 'acc'
};
const REQ_RULE = {
  weapon: { main: 1.1, vit: 0 },
  offhand: { main: 1.0, vit: 0.5 },
  /* 护甲只看体质：若再叠一条主属性，法系要同时堆灵力和体质才能穿衣服，双重卡人 */
  armor: { main: 0, vit: 1.0 },
  acc: { main: 0.7, vit: 0.5 }
};
/* 品质越高越挑人：凡品几乎不设卡，神品 / 传世要你真往里投点。
 * 传世原本 1.18，实测 60 级刀客的传世武器要补 45 点（总点数 182 的 25%），
 * 比神品的 30 点多出一半，穿不上名器反而更像惩罚。用户反馈放宽后降到 1.11，
 * 与神品只差 3%（约 4~6 点），「唯一特性 + 多一条敏捷」已经足够体现名器门槛。 */
const REQ_RARITY_MUL = { common: 0.86, magic: 0.93, rare: 1.0, legendary: 1.08, set: 1.02, unique: 1.11 };
const REQ_MIN_LV = 4;      // 1-3 级的新手装备不设属性门槛，免得脱下来就穿不回去
/* 传世专属的第三条需求（敏捷）：系数刻意取 0.9 —— 低于自然成长，
 * 所以它永远显示为「已满足」，只作为名器的第三道印记。
 * 不取 1.0 以上是试过的：敏捷基数低，多 1 点就会变成「就差 1 点穿不上」的膈应。 */
const REQ_UNIQUE_AGI = 0.9;

/* 返回 [{ key, need }]，按「主属性 → 体质 → 其它」排好序 */
function reqAttrOf(item, cls) {
  if (!item || typeof CLASSES === 'undefined') return [];
  const c = CLASSES[cls] || CLASSES.warrior;
  if (!c || !c.weights) return [];
  const lv = Math.max(1, item.reqLv || item.ilvl || 1);
  if (lv < REQ_MIN_LV) return [];
  const kind = REQ_SLOT_KIND[item.slot] || 'armor';
  const rule = REQ_RULE[kind];
  const mul = (REQ_RARITY_MUL[item.rarity] || 1);
  const expOf = k => (c.base[k] || 0) + (c.growth[k] || 0) * (lv - 1);
  const round5 = v => Math.max(5, Math.round(v / 5) * 5);
  /* 敏捷印记用向下取整：低等级敏捷基数只有个位数，四舍五入会把它抬到自然值之上 */
  const round5down = v => Math.max(5, Math.floor(v / 5) * 5);
  const out = [];
  const main = c.mainStat;
  /* 主属性需求只有在该职业确实吃这门属性时才设（术士的力量需求会低到没有意义） */
  const mainNeed = rule.main * mul * expOf(main);
  if (mainNeed >= 8) out.push({ key: main, need: round5(mainNeed) });
  if (rule.vit) {
    const vitNeed = rule.vit * mul * expOf('vit');
    if (vitNeed >= 8) out.push({ key: 'vit', need: round5(vitNeed) });
  }
  /* 传世：再加一条「敏捷」需求 —— 名器认人，光有主属性不够。
   * 系数 0.9 低于自然成长，等于「你自然长出来的敏捷就够」，
   * 提示框里会多一行绿色的敏捷，但不额外消耗加点 */
  if (item.rarity === 'unique') {
    const agiNeed = REQ_UNIQUE_AGI * expOf('agi');
    if (agiNeed >= 10) out.push({ key: 'agi', need: round5down(agiNeed) });
  }
  return out;
}

/* 当前属性是否满足这件装备的需求；stats 传面板算好的那一份 */
function meetsItemReq(item, stats, cls) {
  const reqs = reqAttrOf(item, cls);
  if (!reqs.length) return true;
  const st = stats || {};
  for (const r of reqs) if ((Number(st[r.key]) || 0) < r.need) return false;
  return true;
}

/* 差在哪：给提示框和穿戴失败提示用 */
function itemReqGap(item, stats, cls) {
  const st = stats || {};
  return reqAttrOf(item, cls)
    .filter(r => (Number(st[r.key]) || 0) < r.need)
    .map(r => ({ key: r.key, need: r.need, have: Number(st[r.key]) || 0 }));
}

/* 提示框里那一段「需求」：等级 + 每项根基，够的标亮、差的标红并写出当前值 */
function reqBlockHTML(item) {
  const hasGame = (typeof Game !== 'undefined' && Game.state);
  const cls = hasGame ? Game.state.cls : null;
  const pst = hasGame ? (Game.state.stats || {}) : {};
  const lv = hasGame ? (Game.state.level || 1) : 0;
  const lvOk = !hasGame || item.reqLv <= lv;
  const reqs = cls ? reqAttrOf(item, cls) : [];
  let h = `<div class="tt-req"><i class="rq-h">需求</i>`;
  h += `<span class="rq ${lvOk ? 'ok' : 'bad'}">境界 ${item.reqLv}${lvOk ? '' : '（现 ' + lv + '）'}</span>`;
  for (const r of reqs) {
    const have = Math.round(Number(pst[r.key]) || 0);
    const ok = have >= r.need;
    h += `<span class="rq ${ok ? 'ok' : 'bad'}">${ATTR_NAME[r.key]} ${r.need}${ok ? '' : '（现 ' + have + '）'}</span>`;
  }
  if (item.cls) h += `<span class="rq cls">${CLASSES[item.cls].name}专属</span>`;
  h += `</div>`;
  return h;
}

/* ---------------- 装备图标（程序化内联 SVG，viewBox 32x32） ----------------
 * 颜色一律用 currentColor，由外层按稀有度着色；深色镂空用 ICON_HOLE
 */
const ICON_HOLE = '#0b0d10';
const ITEM_ICONS = {
  /* 武器 */
  sword: `<path d="M16 1.3 19.4 8.4 19.4 20.6 16 24.2 12.6 20.6 12.6 8.4Z" opacity=".95"/>
    <path d="M7.4 20.3 24.6 20.3 24.6 23.1 7.4 23.1Z" opacity=".62"/>
    <path d="M14.4 23.3 17.6 23.3 17.6 28.2 14.4 28.2Z" opacity=".8"/>
    <circle cx="16" cy="29.3" r="1.9" opacity=".6"/>`,
  saber: `<path d="M12.2 22.4C12.2 12.2 17.8 5.2 28.8 3.4 25 10.6 21.4 17.4 16.2 23.4Z" opacity=".95"/>
    <path d="M11.6 22.6 15.4 26 12.2 29.2 8.6 25.8Z" opacity=".66"/>
    <path d="M9.8 26.6 6.4 30 4.6 28.2 8 24.8Z" opacity=".55"/>`,
  axe: `<path d="M10.8 30.8 16.4 5 18.6 5.4 13 31.2Z" opacity=".8"/>
    <path d="M17.8 5.4C24.4 2.6 30.2 6.6 29.2 14.6 28.8 17.2 26.4 17.6 25 15.4 22.4 11.2 20 7.8 17.8 5.4Z" opacity=".97"/>
    <path d="M19.4 8.4C22.8 8 26 9.6 27.4 12.4 24.8 11.4 22 10 19.4 8.4Z" fill="${ICON_HOLE}" opacity=".45"/>`,
  glaive: `<path d="M20.4 31.4 12.2 10 14.3 9.2 22.6 30.8Z" opacity=".8"/>
    <path d="M13 10.4C8.4 5.6 2.4 6 1.4 10.8 1.6 15.6 5.6 18.8 11 19.2 9.8 16 10.8 12.8 13 10.4Z" opacity=".97"/>
    <path d="M12.2 12.4C9.4 9.4 6 9.2 4.6 11.2 4 12.2 4.6 13.8 6.2 15.2 7.4 16.2 9 16.8 10.6 16.8 11.4 15.2 11.8 13.8 12.2 12.4Z" fill="${ICON_HOLE}" opacity=".42"/>`,
  staff: `<path d="M14.6 31 15.5 11.4 17.3 11.6 16.4 31.2Z" opacity=".8"/>
    <path d="M15.6 12.4C15.6 6.6 18.6 3.2 23.2 4.2" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".95"/>
    <circle cx="24.2" cy="7.4" r="3.1" opacity=".97"/>
    <circle cx="23.2" cy="6.4" r="1" fill="#fff" opacity=".5"/>
    <path d="M13.6 20 17.4 20" stroke="${ICON_HOLE}" stroke-width="1.6" opacity=".45"/>`,
  taojian: `<path d="M16 4.4 18.6 9.6 18.6 19.2 16 22.6 13.4 19.2 13.4 9.6Z" opacity=".93"/>
    <path d="M10 19.4 22 19.4 22 21.5 10 21.5Z" opacity=".6"/>
    <path d="M14.6 21.5 17.4 21.5 17.4 25.8 14.6 25.8Z" opacity=".8"/>
    <path d="M16 26.2c2.4 1.8 2.4 4.2 0 5.4-2.4-1.2-2.4-3.6 0-5.4Z" opacity=".5"/>`,
  /* 副手 */
  shield: `<path d="M16 2.4 27.4 6.6 27.4 15.4C27.4 22.8 21.8 28.4 16 30.4 10.2 28.4 4.6 22.8 4.6 15.4V6.6Z" opacity=".92"/>
    <path d="M16 6.2 22.4 8.4 22.4 15.6C22.4 20.6 19.4 24.6 16 26.4 12.6 24.6 9.6 20.6 9.6 15.6V8.4Z" fill="${ICON_HOLE}" opacity=".42"/>
    <path d="M16 10.4 16 22.6" stroke="currentColor" stroke-width="1.6" opacity=".8"/>`,
  orb: `<circle cx="16" cy="16" r="7.4" opacity=".95"/>
    <circle cx="13.2" cy="13" r="2.5" fill="#fff" opacity=".45"/>
    <ellipse cx="16" cy="16" rx="11.4" ry="4.3" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".45" transform="rotate(-24 16 16)"/>`,
  charm: `<circle cx="16" cy="4" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".85"/>
    <path d="M10.4 8.2 21.6 8.2 21.6 23.4 16 29 10.4 23.4Z" opacity=".95"/>
    <path d="M12.8 11.4 19.2 11.4 19.2 13 12.8 13Z" fill="${ICON_HOLE}" opacity=".55"/>
    <path d="M12.8 15.4 19.2 15.4 19.2 17 12.8 17Z" fill="${ICON_HOLE}" opacity=".55"/>
    <path d="M14.4 19.4 17.6 19.4 17.6 21 14.4 21Z" fill="${ICON_HOLE}" opacity=".55"/>`,
  /* 护甲 */
  helm: `<path d="M16 5.2C21.8 5.2 25.6 9.6 25.6 15.4V17.4H6.4V15.4C6.4 9.6 10.2 5.2 16 5.2Z" opacity=".95"/>
    <path d="M3.4 17.4 28.6 17.4 28.6 20.8 3.4 20.8Z" opacity=".97"/>
    <path d="M8.2 20.8 23.8 20.8 23.8 23.8C23.8 25.8 20.4 27.2 16 27.2 11.6 27.2 8.2 25.8 8.2 23.8Z" opacity=".82"/>
    <path d="M10.6 13 21.4 13 21.4 15.8 10.6 15.8Z" fill="${ICON_HOLE}" opacity=".7"/>
    <path d="M16 5.2 16 12.6" stroke="${ICON_HOLE}" stroke-width="1.3" opacity=".38"/>`,
  chest: `<path d="M11.4 5 5.4 7.4 3.2 13.4 7.4 15.4 8.2 12.8 8.2 20.6C8.2 25.2 11.6 27.8 16 28.6 20.4 27.8 23.8 25.2 23.8 20.6V12.8L24.6 15.4 28.8 13.4 26.6 7.4 20.6 5 16 7.4Z" opacity=".95"/>
    <path d="M16 7.8 16 28.2" stroke="${ICON_HOLE}" stroke-width="1.4" opacity=".5"/>
    <path d="M9.4 7.4 13.4 6.2M22.6 7.4 18.6 6.2" stroke="${ICON_HOLE}" stroke-width="1.2" opacity=".35"/>`,
  shoulders: `<path d="M16 6.2 20.6 9.2 28.2 14.4 26 19.8 19 15.6 19 11.4Z" opacity=".96"/>
    <path d="M16 6.2 11.4 9.2 3.8 14.4 6 19.8 13 15.6 13 11.4Z" opacity=".96"/>
    <path d="M16 6.6 16 12.4" stroke="${ICON_HOLE}" stroke-width="1.4" opacity=".4"/>`,
  gloves: `<path d="M10.8 12.8C10.8 10.6 12.4 9.4 14.2 9.4 15.4 9.4 16.2 10 16.6 11 17 9.6 18 8.8 19.4 8.8 21 8.8 22.2 10 22.2 11.8V19.4C22.2 24.6 19.6 28 16 28 12.4 28 9.8 24.6 9.8 19.4Z" opacity=".95"/>
    <path d="M6.6 13.6C4.4 13 4 15.4 5.8 16.8L9.8 19.2 9.8 14.6Z" opacity=".72"/>
    <path d="M10.4 23.4 21.6 23.4" stroke="${ICON_HOLE}" stroke-width="1.3" opacity=".45"/>`,
  boots: `<path d="M9.6 3.6 15.4 3.6 15.4 16.2C20.2 17.2 25.2 20.2 25.2 23.8 25.2 26.4 23.4 28 20.4 28H9.6Z" opacity=".95"/>
    <path d="M9.6 14 15.4 14" stroke="${ICON_HOLE}" stroke-width="1.2" opacity=".42"/>
    <path d="M9.6 24.4 24.8 24.4" stroke="${ICON_HOLE}" stroke-width="1.5" opacity=".5"/>`,
  belt: `<path d="M3.6 12.2 28.4 12.2 28.4 19.8 3.6 19.8Z" opacity=".9"/>
    <path d="M12.4 9.8 19.6 9.8 19.6 22.2 12.4 22.2Z" opacity=".96"/>
    <path d="M14.8 12.2 17.2 12.2 17.2 19.8 14.8 19.8Z" fill="${ICON_HOLE}" opacity=".6"/>
    <path d="M3.6 15.4 28.4 15.4" stroke="${ICON_HOLE}" stroke-width="1" opacity=".3"/>`,
  amulet: `<path d="M7.2 4.6C7.2 15.6 24.8 15.6 24.8 4.6" fill="none" stroke="currentColor" stroke-width="2.1" opacity=".8"/>
    <path d="M16 15.4 20.8 21 16 27.8 11.2 21Z" opacity=".96"/>
    <path d="M16 18.4 18.4 21 16 24.6 13.6 21Z" fill="${ICON_HOLE}" opacity=".5"/>`,
  ring: `<circle cx="16" cy="20" r="7.6" fill="none" stroke="currentColor" stroke-width="2.9" opacity=".9"/>
    <path d="M16 3.2 20.6 9.4 16 14.6 11.4 9.4Z" opacity=".96"/>
    <path d="M16 5.8 18.2 9.4 16 13 13.8 9.4Z" fill="${ICON_HOLE}" opacity=".38"/>`,
  /* [M1] 披风：领口 + 左右展开的布面 + 下摆开衩 */
  cloak: `<path d="M16 4.6 22.6 7 28.4 27.4 21.4 29.6 16 12.8 10.6 29.6 3.6 27.4 9.4 7Z" opacity=".95"/>
    <path d="M16 12.8 13.4 22.6 18.6 22.6Z" fill="${ICON_HOLE}" opacity=".55"/>
    <path d="M12.2 7.8 16 4.6 19.8 7.8 16 11Z" opacity=".8"/>
    <path d="M8.2 20.4 12.6 21.6M23.8 20.4 19.4 21.6" stroke="${ICON_HOLE}" stroke-width="1.2" opacity=".4"/>`,
  /* [M1] 命格：外圈命盘 + 六芒星（不是器物，是一张图） */
  fate: `<circle cx="16" cy="16" r="12.4" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".62"/>
    <path d="M16 4.2 26.2 22 5.8 22Z" opacity=".9"/>
    <path d="M16 27.8 5.8 10 26.2 10Z" fill="${ICON_HOLE}" opacity=".42"/>
    <circle cx="16" cy="16" r="3.1" opacity=".96"/>
    <circle cx="16" cy="16" r="1.2" fill="${ICON_HOLE}" opacity=".8"/>`
};

function itemIconKey(item) {
  if (!item) return 'chest';
  const k = (item.slot === 'weapon' || item.slot === 'offhand') ? (item.shape || 'sword') : item.slot;
  return ITEM_ICONS[k] ? k : (ITEM_ICONS[item.slot] ? item.slot : 'chest');
}

/* ---------------- 法器（v1.3.0） ----------------
 * 法器不是随机词条装备：它由目录固定生成，属性与术法修正都写在 RELICS 里。
 * 不走品质词条逻辑（fixed / affixes 恒为空），所以永远不会被洗练或强化。
 */
function makeRelic(id, cls) {
  const d = RELICS[id];
  if (!d) return null;
  const it = normalizeItem({
    uid: ITEM_UID++, slot: 'relic', ilvl: d.ilvl, rarity: 'legendary',
    cls: d.cls, name: d.name, baseName: d.name, relicId: id, glyph: d.glyph,
    affixes: [], fixed: [], sockets: 0, runes: [], implicit: null,
    /* 属性与术法修正复用既有通道：uniqueStats / uniqueSkill，
     * 聚合、对比、提示框都不必为法器另写一套。 */
    uniqueStats: d.stats ? Object.assign({}, d.stats) : null,
    uniqueSkill: d.skill ? Object.assign({}, d.skill) : null,
    relicGrant: d.grant || null, lore: d.lore || '', relicIntro: d.intro || '',
    reqLv: Math.max(1, d.ilvl - 2), reforges: 0
  });
  it.fixed = []; it.affixes = [];
  it.value = itemValue(it);   // 法器可卖出，也免得价值统计里出现 undefined
  return it;
}

/* 把 { atk: 8 } 这类统计表压成一行文字，材料栏的符文说明用得上 */
function statLine(st) {
  const out = [];
  for (const k in st) {
    const s = STATS[k];
    if (!s) continue;
    out.push('+' + st[k] + (s.pct ? '%' : '') + ' ' + s.label);
  }
  return out.join(' · ');
}

/* 生成图标 HTML；尺寸交给 CSS（.it-ico） */
function itemIcon(item, opts = {}) {
  if (!item) return '';
  const r = RARITY[item.rarity] || RARITY.common;
  /* 法器用专属器物图标 + 法阵外圈（v1.3.0）：比普通装备多一层圆环与芒刺，
   * 一眼就能从一堆刀甲里认出来 */
  if (item.slot === 'relic') {
    const shape = (typeof RELIC_ICONS !== 'undefined' && RELIC_ICONS[item.relicId]) || '';
    const aura = (typeof RELIC_AURA !== 'undefined') ? RELIC_AURA : '';
    return `<svg class="it-ico it-relic${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 32 32" fill="currentColor"
      style="color:${r.color};filter:drop-shadow(0 0 3px ${r.color}cc)" aria-hidden="true">${aura}${shape}</svg>`;
  }
  const key = itemIconKey(item);
  const glow = item.rarity === 'legendary' || item.rarity === 'set' || item.rarity === 'unique';
  const style = `color:${r.color}${glow ? `;filter:drop-shadow(0 0 3px ${r.color}bb)` : ''}`;
  return `<svg class="it-ico${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 32 32" fill="currentColor" style="${style}" aria-hidden="true">${ITEM_ICONS[key]}</svg>`;
}

/* ---------------- 提示框 ---------------- */
const SLOT_NAME = { helm: '头盔', chest: '战甲', shoulders: '护肩', cloak: '披风', gloves: '护手', boots: '战靴', belt: '腰带', amulet: '项链', ring: '戒指', ring1: '戒指', ring2: '戒指', weapon: '武器', offhand: '副手', relic: '法器', fate: '命格' };

/* ---------------- 装备评分 / 对比（v1.0.4） ----------------
 *
 * 目的只有两个：
 *   1. 背包与商店里能「一眼看出这件比身上的强还是弱」；
 *   2. 排序有个稳定的依据，不用按名字或内存顺序乱排。
 *
 * 权重不是精确的 DPS 换算（那需要把 64 条属性全塞进战斗公式里重算一遍），
 * 而是按「同类装备横向比较时的相对价值」定的一组经验系数。
 * 只要同一部位的两件装备用同一套系数算，比较结果就是有效的。
 */
const SCORE_W = {
  /* 直接增伤 */
  atk: 4.0, atkPct: 3.2, dmgAll: 4.0, skillDmg: 2.6, meleeDmg: 2.6, projDmg: 2.6,
  aoeDmg: 2.6, dotDmg: 2.4, eliteDmg: 2.0, bossDmg: 2.0, executeDmg: 1.6,
  firstStrike: 1.4, armorPen: 2.2, summonDmg: 1.6,
  /* 暴击攻速 */
  crit: 3.0, critDmg: 0.7, aspd: 3.0, aspdOnCrit: 1.4,
  /* 生存 */
  hp: 0.35, hpPct: 2.4, mp: 0.16, mpPct: 0.9, mpReg: 2.4,
  def: 1.2, armorPct: 1.8, dodge: 2.4, block: 1.8, dmgReduce: 2.6, ccResist: 1.4, thorns: 1.0,
  /* 抗性 */
  allRes: 1.7, physRes: 1.1, fireRes: 1.1, iceRes: 1.1, poisonRes: 1.1,
  /* 三围 */
  str: 1.7, agi: 1.7, vit: 1.7, int: 1.7
};

/* 把一件装备的所有加成汇总成 { statKey: 数值 }，主属性用 _dps / _armor 两个虚拟键 */
function itemStatMap(item) {
  const m = {};
  if (!item) return m;
  if (item.baseDmg) {
    const avg = (item.baseDmg[0] + item.baseDmg[1]) / 2;
    m._dps = avg / (item.speed || 1);
  }
  if (item.baseArmor) m._armor = item.baseArmor;
  if (item.implicit) m[item.implicit.key] = (m[item.implicit.key] || 0) + item.implicit.val;
  /* 固定词条同样参与评分，否则带固定词条的装备会被算低 */
  for (const a of (item.fixed || [])) m[a.key] = (m[a.key] || 0) + a.val;
  for (const a of (item.affixes || [])) m[a.key] = (m[a.key] || 0) + a.val;
  /* 传世固定词条与特性也要参与评分，否则传世会被算得比同数值的玄品还低 */
  if (item.uniqueStats) for (const k in item.uniqueStats) m[k] = (m[k] || 0) + item.uniqueStats[k];
  for (const tid of (item.traits || [])) {
    const t = UNIQUE_TRAITS[tid];
    if (!t || !t.stats) continue;
    for (const k in t.stats) m[k] = (m[k] || 0) + t.stats[k];
  }
  /* 已成的符文之语也算进去，否则镶好符文的装备评分反而比裸装低 */
  const rw = (typeof runeWordOf === 'function') ? runeWordOf(item) : null;
  if (rw && rw.stats) for (const k in rw.stats) m[k] = (m[k] || 0) + rw.stats[k];
  return m;
}

function itemScore(item) {
  if (!item) return 0;
  const m = itemStatMap(item);
  let sc = 0;
  for (const k in m) {
    if (k === '_dps') sc += m[k] * 6.0;
    else if (k === '_armor') sc += m[k] * 1.1;
    else sc += m[k] * (SCORE_W[k] || 1.2);
  }
  /* 稀有度只做很小的修正：同词缀下神品略优于凡品，但不能盖过属性差 */
  const r = RARITY[item.rarity];
  if (r) sc += (r.mul - 1) * 18;
  return Math.round(sc);
}

/**
 * 新装备 vs 已穿装备的逐条差值
 * @returns {{rows:Array<{label:string,delta:number,pct:boolean,base:boolean}>, gain:number, scoreA:number, scoreB:number}}
 */
function itemCompare(item, equipped) {
  const ma = itemStatMap(item), mb = itemStatMap(equipped);
  const keys = Object.keys(ma);
  for (const k of Object.keys(mb)) if (keys.indexOf(k) < 0) keys.push(k);
  const rows = [];
  for (const k of keys) {
    const va = ma[k] || 0, vb = mb[k] || 0;
    const d = va - vb;
    if (Math.abs(d) < 1e-6) continue;
    let label, pctv = false, base = false;
    if (k === '_dps') { label = 'DPS'; base = true; }
    else if (k === '_armor') { label = '护甲'; base = true; }
    else { const s = STATS[k] || { label: k }; label = s.label; pctv = !!s.pct; }
    rows.push({ label, delta: d, pct: pctv, base });
  }
  /* 主属性排最前，其余按影响绝对值降序 —— 玩家最先想知道的就是「伤害高了还是低了」 */
  rows.sort((x, y) => {
    if (x.base !== y.base) return x.base ? -1 : 1;
    return Math.abs(y.delta * (SCORE_W[y.label] || 1)) - Math.abs(x.delta * (SCORE_W[x.label] || 1));
  });
  const scoreA = itemScore(item), scoreB = itemScore(equipped);
  return { rows, gain: scoreA - scoreB, scoreA, scoreB };
}

/* 对比区块 HTML：绿↑ 红↓ */
function itemCompareHTML(item, equipped) {
  if (!item) return '';
  const c = itemCompare(item, equipped);
  const sign = v => (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  /* 0 差值不该染成红色（会被误读成「变差了」） */
  const cls = v => (v > 0 ? 'up' : (v < 0 ? 'down' : 'flat'));
  let h = `<div class="tt-cmp">`;
  h += `<div class="tt-cmp-t">对比当前<span class="dim">${SLOT_NAME[equipped.slot] || ''}</span></div>`;
  if (!c.rows.length) {
    h += `<div class="tt-cmp-none">属性完全一致</div>`;
  } else {
    for (const r of c.rows.slice(0, 8)) {
      h += `<div class="tt-cmp-r"><span>${r.label}</span><b class="${cls(r.delta)}">${sign(r.delta)}${r.pct ? '%' : ''}</b></div>`;
    }
    if (c.rows.length > 8) h += `<div class="tt-cmp-none">…另有 ${c.rows.length - 8} 条差异</div>`;
  }
  h += `<div class="tt-cmp-s">评分 ${c.scoreB} → <b>${c.scoreA}</b> <b class="${cls(c.gain)}">(${sign(c.gain)})</b></div>`;
  h += `</div>`;
  return h;
}

function itemTooltip(item, opts = {}) {
  if (!item) return '';
  const r = RARITY[item.rarity];
  let h = `<div class="tt" style="--rc:${r.color}">`;
  h += `<div class="tt-head"><div class="tt-ico" style="border-color:${r.color}44;background:radial-gradient(circle at 50% 35%,${r.color}22,rgba(0,0,0,.5))">${itemIcon(item)}</div><div class="tt-htx">`;
  h += `<div class="tt-name" style="color:${r.color}">${item.name}</div>`;
  h += `<div class="tt-sub">${r.name} · ${SLOT_NAME[item.slot] || item.kind}${item.setName ? ' · ' + item.setName + '套装' : ''}</div>`;
  /* [UNIQUE-1] 传世不在八阶体系里：明确写一行，免得玩家拿它去炼器台找不到「升阶」 */
  if (item.rarity === 'unique' || item.tierless) {
    h += `<div class="tt-tierless">传世名器 · 不入八阶 · 不可升阶</div>`;
  }
  h += `</div></div>`;
  /* v1.3.0：兵器握持标签。双手会白纸黑字写清楚「占用副手位」，
   * 免得玩家装上以后发现副手灰掉以为出 bug。 */
  if (item.slot === 'weapon') {
    const hand = item.hand || 'one';
    h += `<div class="tt-hand h-${hand}"><span class="tt-hand-tag">${WEAPON_HAND_NAME[hand] || '单手'}</span>${WEAPON_HAND_DESC[hand] || ''}</div>`;
  }
  if (item.lore) h += `<div class="tt-lore">${item.lore}</div>`;
  if (item.baseDmg) {
    const dps = ((item.baseDmg[0] + item.baseDmg[1]) / 2 / (item.speed || 1)).toFixed(1);
    h += `<div class="tt-main">攻击 ${item.baseDmg[0]} - ${item.baseDmg[1]}　<span class="dim">速度 ${(item.speed || 1).toFixed(2)}　DPS ${dps}</span></div>`;
  }
  if (item.baseArmor) h += `<div class="tt-main">护甲 ${item.baseArmor}</div>`;
  if (!item.baseDmg && !item.baseArmor) h += `<div class="tt-main dim">饰品</div>`;
  /* 基底固有：S1 起每件装备的「流派标记」，排在词缀上方单独一行 */
  if (item.implicit) {
    const s = STATS[item.implicit.key];
    h += `<div class="tt-imp">固有　+${item.implicit.val}${s.pct ? '%' : ''} ${s.label}</div>`;
  }
  /* 传世固定词条：与随机词缀分开着色，方便一眼区分「这件传世自带什么」 */
  if (item.uniqueStats) {
    for (const k in item.uniqueStats) {
      const s = STATS[k];
      if (!s) continue;
      h += `<div class="tt-uaff">+${item.uniqueStats[k]}${s.pct ? '%' : ''} ${s.label}</div>`;
    }
  }
  /* 固定初始词条：洗练 / 强化都改不动，单独一段并打「固定」标记 */
  if (item.fixed && item.fixed.length) {
    for (const a of item.fixed) {
      h += `<div class="tt-faff"><span class="tt-faff-tag">固定</span>${affixText(a)}</div>`;
    }
    if (item.affixes && item.affixes.length) h += `<div class="tt-aff-sep"></div>`;
  }
  /* 可洗练词条。rare = 掉落时额外赠送的稀有词条，单独打「稀有」标记 */
  for (const a of item.affixes) {
    h += a.rare
      ? `<div class="tt-aff tt-raff"><span class="tt-raff-tag">稀有</span>${affixText(a)}</div>`
      : `<div class="tt-aff">${affixText(a)}</div>`;
  }
  /* S2 孔位与符文之语 */
  if (item.sockets) {
    h += `<div class="tt-socks">`;
    for (let i = 0; i < item.sockets; i++) {
      const rid = item.runes && item.runes[i];
      h += rid
        ? `<span class="tsock on" title="${RUNES[rid].name}">${runeIcon(rid, 22)}</span>`
        : `<span class="tsock">◇</span>`;
    }
    h += `</div>`;
    const rw = runeWordOf(item);
    if (rw) {
      h += `<div class="tt-rw" style="--rwc:${rw.color}">
        <div class="tt-rw-t">符文之语 · ${rw.name}</div>
        <div class="tt-rw-s">${runeWordStatsText(rw)}</div>
        <div class="tt-rw-d">${rw.desc}</div></div>`;
    } else {
      const cands = runeWordCandidates(item);
      if (cands.length && itemRunes(item).some(Boolean)) {
        h += `<div class="tt-rw-hint">符文之语未成：${cands.slice(0, 2).map(w => w.name).join(' / ')}</div>`;
      }
    }
  }
  if (item.powerDesc) h += `<div class="tt-power">阶位特效：${item.powerDesc}</div>`;
  /* 传世特性 / 技能效果：都来自 data-uniques.js，提示框文字与实战判定同源 */
  if (item.traits && item.traits.length) {
    h += `<div class="tt-unq">`;
    for (const tid of item.traits) {
      const t = UNIQUE_TRAITS[tid];
      if (t) h += `<div class="tt-trait"><b>${t.name}</b><span>${t.desc}</span></div>`;
    }
    h += `</div>`;
  }
  if (item.uniqueSkill) {
    const us = item.uniqueSkill;
    /* [UNIQUE-3] 授予类写「秘技」，强化类写「强化」——一眼看出这条是加技能还是加数值 */
    let tag = '强化';
    if (us.grant) tag = '秘技';
    else if (us.rank) tag = '精研';
    else if (us.id === '*') tag = '通玄';
    const tgt = us.grant && SKILLS[us.grant] ? `（${SKILLS[us.grant].name}）` : '';
    if (us.desc || us.name) {
      h += `<div class="tt-skill"><b><i class="tt-skill-tag">${tag}</i>${us.name || '技能效果'}${tgt}</b><span>${us.desc || ''}</span></div>`;
    }
  }
  /* 法器（v1.3.0）：介绍 → 术法联动 → 附带术法 */
  if (item.relicId && RELICS[item.relicId]) {
    const d = RELICS[item.relicId];
    if (d.intro) h += `<div class="tt-relic-intro">「${d.intro}」</div>`;
    if (d.skill && d.skill.id && SKILLS[d.skill.id]) {
      const mods = [];
      const LAB = { dmg: '伤害', cd: '冷却', cost: '消耗', radius: '范围', count: '数量', dur: '持续' };
      for (const k in d.skill) {
        if (k === 'id' || !d.skill[k]) continue;
        const unit = (k === 'cd' || k === 'cost' || k === 'radius' || k === 'dmg') ? '%' : '';
        const sign = (k === 'cd' || k === 'cost') ? '-' : '+';
        mods.push(LAB[k] + ' ' + sign + Math.abs(d.skill[k]) + unit);
      }
      h += `<div class="tt-skill"><b>${SKILLS[d.skill.id].name}</b><span>${mods.join(' · ')}</span></div>`;
    }
    if (d.grant && SKILLS[d.grant]) {
      h += `<div class="tt-grant">附带术法　<b>${SKILLS[d.grant].name}</b>　未领悟亦可施放</div>`;
    }
  }
  if (item.setId) {
    const set = SETS[item.setId];
    const raw = (Game.state ? (Game.state.setCount[item.setId] || 0) : 0);
    const have = Math.min(raw, set.pieces.length);
    h += `<div class="tt-set"><div class="tt-set-t" style="color:${set.color}">${set.name}${set.tag ? '·' + set.tag : ''}（${have}/${set.pieces.length}）</div>`;
    for (const b of set.bonuses) {
      const on = have >= b.need;
      h += `<div class="tt-set-b ${on ? 'on' : 'off'}">(${b.need}) ${b.text}</div>`;
    }
    h += `</div>`;
  }
  /* [v1.8.5] 需求：等级 + 根基属性，逐条标「够 / 差多少」。
   * 差的那条标红，玩家一眼知道该往哪项加点。 */
  h += reqBlockHTML(item);
  h += `<div class="tt-val">售价 ${item.value} 金</div>`;
  /* 对比放在最后：先看词条，再看「换了之后强多少」，符合阅读顺序 */
  if (opts.compareTo) h += itemCompareHTML(item, opts.compareTo);
  else h += `<div class="tt-score">综合评分 <b>${itemScore(item)}</b></div>`;
  if (opts.hint) h += `<div class="tt-hint">${opts.hint}</div>`;
  h += `</div>`;
  return h;
}
