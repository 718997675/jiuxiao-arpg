/* ============================================================
 * 装备系统：随机词缀 / 稀有度 / 套装 / 属性汇总 / 提示框
 * ============================================================ */

let ITEM_UID = 1;

const UNIQUES = {
  weapon: [
    { name: '斩月·霜寒', power: 'frost', desc: '攻击有 25% 几率使敌人减速 40%，持续 2 秒。', stats: { crit: 6, critDmg: 25 }, cls: 'warrior' },
    { name: '焚天·赤霄', power: 'explode', desc: '击杀敌人时引发一次火焰爆炸。', stats: { atkPct: 12, skillDmg: 15 }, cls: 'mage' },
    { name: '太初·无相', power: 'thunder', desc: '攻击有 18% 几率召下连锁天雷。', stats: { int: 12, cdr: 8 }, cls: 'taoist' }
  ],
  helm: [{ name: '九幽面纱', power: 'vampire', desc: '生命偷取额外 +5%。', stats: { hp: 60, crit: 4 } }],
  chest: [{ name: '玄冥战衣', power: 'thorns', desc: '受到攻击时反弹 30% 伤害。', stats: { def: 40, hp: 100 } }],
  boots: [{ name: '踏云履', power: 'speed', desc: '移动速度额外 +8%。', stats: { moveSpd: 8 } }],
  ring: [{ name: '轮回之戒', power: 'lifesteal', desc: '所有伤害的 6% 转化为生命。', stats: { lifesteal: 6, crit: 4 } }],
  amulet: [{ name: '天机玉珏', power: 'magicfind', desc: '奇遇机缘 +30%。', stats: { magicFind: 30 } }]
};

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

/* 重 roll 指定词缀：稀有度 / 词缀数量不变，新词缀一定换 key */
function reforgeAffix(item, index) {
  if (!item || !Array.isArray(item.affixes)) return null;
  if (index < 0 || index >= item.affixes.length) return null;
  const used = new Set();
  item.affixes.forEach((a, i) => {
    if (i === index) return;
    if (a && a.key) used.add(a.key);
  });
  const old = item.affixes[index];
  if (old && old.key) used.add(old.key);
  const a = makeAffix(item.ilvl || 1, used);
  item.affixes[index] = a;
  item.reforges = (item.reforges || 0) + 1;
  return a;
}

/* 旧档 / 导入档的物品整形：孔位、符文、词缀、固有属性都要能被信任 */
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (!Array.isArray(item.affixes)) item.affixes = [];
  item.affixes = item.affixes.filter(a => a && typeof a.key === 'string' && STATS[a.key] && isFinite(a.val));
  let n = CLAMP(Math.round(Number(item.sockets) || 0), 0, 4);
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
  if (!isFinite(item.reforges) || item.reforges < 0) item.reforges = 0;
  return item;
}

function tierIndex(ilvl) { return CLAMP(Math.floor((ilvl - 1) / 8), 0, 4); }

function itemPower(item) {
  let s = 0;
  if (item.implicit) s += item.implicit.val * (STATS[item.implicit.key].pct ? 1.6 : 0.6);
  for (const a of item.affixes) s += a.val * (STATS[a.key].pct ? 1.6 : 0.5);
  if (item.baseDmg) s += (item.baseDmg[0] + item.baseDmg[1]) * 1.4;
  if (item.baseArmor) s += item.baseArmor * 0.9;
  return Math.round(s + item.ilvl * 4);
}

function itemValue(item) {
  const r = { common: 1, magic: 1.8, rare: 3, legendary: 6, set: 5 }[item.rarity];
  return Math.round((12 + item.ilvl * 8) * r * (1 + item.affixes.length * 0.15));
}

function affixValue(a, ilvl) {
  const v = RND(a.min, a.max) * (1 + ilvl * 0.055);
  return Math.max(1, Math.round(v));
}

function makeAffix(ilvl, used) {
  let pool = AFFIXES.filter(a => !used.has(a.key));
  const roll = Math.random();
  const tierWant = roll < 0.62 ? 1 : (roll < 0.9 ? 2 : 3);
  let cand = pool.filter(a => a.tier === tierWant);
  if (!cand.length) cand = pool;
  const a = PICK(cand);
  used.add(a.key);
  return { key: a.key, val: affixValue(a, ilvl), pre: a.pre, suf: a.suf, tier: a.tier };
}

function affixText(a) {
  const s = STATS[a.key];
  return '+' + a.val + (s.pct ? '%' : '') + ' ' + s.label;
}

function baseTierFor(slot, ilvl) {
  const ti = tierIndex(ilvl);
  if (slot === 'weapon') return ti;
  return ti;
}

/* 生成一件装备 */
function rollItem(ilvl, opts = {}) {
  ilvl = CLAMP(Math.round(ilvl), 1, 40);
  const slot = opts.slot || PICK(['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon', 'offhand']);
  const cls = opts.cls || PICK(['warrior', 'mage', 'taoist']);
  let rarity = opts.rarity;
  if (!rarity) {
    const mf = opts.magicFind || 0;
    const w = [
      ['common', RARITY.common.weight],
      ['magic', RARITY.magic.weight + mf * 0.16],
      ['rare', RARITY.rare.weight + mf * 0.1],
      ['legendary', RARITY.legendary.weight + mf * 0.05],
      ['set', RARITY.set.weight + mf * 0.04]
    ];
    let total = w.reduce((s, x) => s + x[1], 0), r = Math.random() * total;
    for (const [k, v] of w) { if (r < v) { rarity = k; break; } r -= v; }
    if (!rarity) rarity = 'common';
  }
  const isRing = slot === 'ring';
  const item = {
    uid: ITEM_UID++, slot, ilvl, rarity, cls: null, affixes: [],
    implicit: null, sockets: 0, runes: [], reforges: 0,
    setId: null, setName: null, power: null, powerDesc: null, reqLv: Math.max(1, ilvl - 1)
  };

  /* ---- 基底 ----
   * 每个档位有 3 个流派变体，随机取一个；变体若带固有属性就记进 item.implicit。
   * 固有属性和词缀一样走 sumItemStats 汇总，所以是真实生效的，不是摆设。
   */
  if (slot === 'weapon') {
    const list = WEAPON_BASES[cls];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const base = PICK(list[tier]);
    const rm = RARITY[rarity].mul;
    const lo = base.dmg[0] * (1 + ilvl * 0.115) * rm;
    const hi = base.dmg[1] * (1 + ilvl * 0.115) * rm;
    item.baseName = base.name;
    item.shape = base.shape;
    item.baseDmg = [Math.round(lo), Math.round(hi)];
    item.speed = base.speed;
    item.cls = cls;
    item.name = base.name;
    item.kind = '武器';
  } else if (slot === 'offhand') {
    const list = OFFHAND_BASES[cls];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const [bn, barm, ik, iv] = PICK(list[tier]);
    item.baseName = bn;
    item.baseArmor = Math.round(barm * (1 + ilvl * 0.1) * RARITY[rarity].mul);
    item.cls = cls;
    item.name = bn;
    item.kind = '副手';
    item.shape = cls === 'warrior' ? 'shield' : (cls === 'mage' ? 'orb' : 'charm');
    if (ik) item.implicit = { key: ik, val: iv };
  } else {
    const list = ARMOR_BASES[slot];
    const tier = CLAMP(tierIndex(ilvl), 0, list.length - 1);
    const [bn, barm, ik, iv] = PICK(list[tier]);
    item.baseName = bn;
    item.baseArmor = Math.round(barm * (1 + ilvl * 0.13) * RARITY[rarity].mul);
    item.name = bn;
    item.kind = SLOTS[slot].name;
    if (ik) item.implicit = { key: ik, val: iv };
  }
  if (isRing) { item.slot = 'ring'; }

  /* ---- 套装 ---- */
  if (rarity === 'set') {
    const cands = Object.values(SETS).filter(s =>
      (!s.cls || s.cls === cls) &&
      s.slots.some(sl => sl === slot || (sl === 'ring' && slot === 'ring'))
    );
    if (cands.length) {
      const set = PICK(cands);
      const idx = set.slots.findIndex(sl => sl === slot);
      const pieceIndex = idx >= 0 ? idx : set.slots.findIndex(sl => sl === 'ring');
      item.setId = set.id;
      item.setName = set.name;
      item.name = set.pieces[pieceIndex] || set.pieces[0];
      item.rarity = 'set';
      item.cls = set.cls || null;
    } else rarity = item.rarity = 'rare';
  }

  /* ---- 唯一神兵 ---- */
  if (item.rarity === 'legendary' && !item.setId && CHANCE(0.55)) {
    const pool = (UNIQUES[slot] || []).filter(u => !u.cls || u.cls === cls);
    if (pool.length) {
      const u = PICK(pool);
      item.name = u.name;
      item.power = u.power;
      item.powerDesc = u.desc;
      item.uniqueStats = u.stats || {};
      item.cls = cls;
    }
  }

  /* ---- 孔位（S2）：1-4 孔，戒指/项链不出孔 ---- */
  item.sockets = rollSocketCount(slot, item.rarity);
  item.runes = item.sockets ? new Array(item.sockets).fill(null) : [];

  /* ---- 词缀 ---- */
  let count = RARITY[item.rarity].affixes;
  if (item.rarity === 'rare' && CHANCE(0.5)) count = 4;
  if (item.rarity === 'set') count = 3 + (CHANCE(0.4) ? 1 : 0);
  const used = new Set();
  for (let i = 0; i < count; i++) item.affixes.push(makeAffix(ilvl, used));

  /* ---- 命名 ---- */
  if (!item.setId && !item.power) {
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
  w.name = { warrior: '新兵铁剑', mage: '旧桃木杖', taoist: '师父的桃木剑' }[cls];
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
  if (item.power === 'vampire') out.lifesteal += 5;
  if (item.power === 'speed') out.moveSpd += 8;
  if (item.power === 'thorns') out.thorns += 30;
  if (item.power === 'lifesteal') out.lifesteal += 6;
  if (item.power === 'magicfind') out.magicFind += 30;
}

function aggregate(equipped) {
  const st = emptyStats();
  const setCount = {};
  const flags = {};
  for (const slot in equipped) {
    const it = equipped[slot];
    if (!it) continue;
    sumItemStats(it, st);
    if (it.setId) setCount[it.setId] = (setCount[it.setId] || 0) + 1;
    if (it.power) flags[it.power] = true;
    const rw = runeWordOf(it);
    if (rw && rw.flag) flags[rw.flag] = true;
  }
  const setBonuses = [];
  for (const sid in setCount) {
    const set = SETS[sid];
    for (const b of set.bonuses) {
      if (setCount[sid] >= b.need) {
        setBonuses.push({ setId: sid, name: set.name, text: b.text, need: b.need });
        if (b.stats) for (const k in b.stats) st[k] = (st[k] || 0) + b.stats[k];
        if (b.flag) flags[b.flag] = true;
      }
    }
  }
  return { stats: st, setCount, setBonuses, flags };
}

/* [S1] 概率 / 倍率类属性的硬上限。
 * 词缀数值本身会随 ilvl 放大（×(1+ilvl×0.055)，40 级约 3.2 倍），单件 6% 闪避到 40 级
 * 就是 19%，十件叠起来能到 90%——不封顶的话后期玩家会直接无敌。
 * 这里既是安全阀，也是策划的「可堆叠天花板」：调平衡改这张表即可。 */
const STAT_CAPS = {
  dodge: 25, block: 25, dmgReduce: 30, ccResist: 70,
  stunChance: 30, slowChance: 40, freezeChance: 25, burnChance: 40,
  armorPen: 60, crit: 75, critDmg: 400,
  executeDmg: 120, firstStrike: 100, eliteDmg: 120, bossDmg: 140,
  dmgAll: 80, meleeDmg: 120, projDmg: 120, aoeDmg: 120, dotDmg: 150,
  skillDmg: 150, summonDmg: 150, lifesteal: 30, thorns: 120,
  healBonus: 100, shieldBonus: 100, overkillShield: 60,
  costReduce: 50, cdr: 45
};

/* 计算玩家最终属性 */
function computePlayerStats(p) {
  const agg = aggregate(p.equipment);
  const st = agg.stats;
  const c = CLASSES[p.cls];
  const lv = p.level;
  const str = c.base.str + c.growth.str * (lv - 1) + st.str;
  const agi = c.base.agi + c.growth.agi * (lv - 1) + st.agi;
  const vit = c.base.vit + c.growth.vit * (lv - 1) + st.vit;
  const int = c.base.int + c.growth.int * (lv - 1) + st.int;
  const main = { str, agi, vit, int }[c.mainStat];

  const atk = (c.baseAtk + st.atk + main * c.statMul) * (1 + st.atkPct / 100);
  const hpMax = (c.baseHp + lv * 16 + vit * c.hpPerVit + st.hp) * (1 + st.hpPct / 100);
  const mpMax = (c.baseMp + lv * 4 + int * c.mpPerInt + st.mp) * (1 + st.mpPct / 100);
  const crit = CLAMP(5 + agi * 0.18 + st.crit, 0, 75);
  const critDmg = 150 + st.critDmg;
  const aspd = (1 + st.aspd / 100) * (1 + agi * 0.004);
  const moveSpd = (7.2 + agi * 0.015) * (1 + st.moveSpd / 100) + st.moveSpdFlat;
  const def = (st.def + vit * 0.6) * (1 + st.armorPct / 100);
  const cdr = CLAMP(st.cdr, 0, 45);

  const out = {
    str, agi, vit, int, atk, hpMax: Math.round(hpMax), mpMax: Math.round(mpMax),
    crit, critDmg, aspd, moveSpd, def, cdr,
    mpReg: 3 + st.mpReg,
    setBonuses: agg.setBonuses, setCount: agg.setCount, flags: agg.flags, raw: st
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

/* ---------------- 装备图标（程序化内联 SVG，viewBox 32x32） ----------------
 * 颜色一律用 currentColor，由外层按稀有度着色；深色镂空用 ICON_HOLE */
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
    <path d="M16 5.8 18.2 9.4 16 13 13.8 9.4Z" fill="${ICON_HOLE}" opacity=".38"/>`
};

function itemIconKey(item) {
  if (!item) return 'chest';
  const k = (item.slot === 'weapon' || item.slot === 'offhand') ? (item.shape || 'sword') : item.slot;
  return ITEM_ICONS[k] ? k : (ITEM_ICONS[item.slot] ? item.slot : 'chest');
}

/* 生成图标 HTML；尺寸交给 CSS（.it-ico） */
function itemIcon(item, opts = {}) {
  if (!item) return '';
  const r = RARITY[item.rarity] || RARITY.common;
  const key = itemIconKey(item);
  const glow = item.rarity === 'legendary' || item.rarity === 'set';
  const style = `color:${r.color}${glow ? `;filter:drop-shadow(0 0 3px ${r.color}bb)` : ''}`;
  return `<svg class="it-ico${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 32 32" fill="currentColor" style="${style}" aria-hidden="true">${ITEM_ICONS[key]}</svg>`;
}

/* ---------------- 提示框 ---------------- */
const SLOT_NAME = { helm: '头盔', chest: '战甲', shoulders: '护肩', gloves: '护手', boots: '战靴', belt: '腰带', amulet: '项链', ring: '戒指', ring1: '戒指', ring2: '戒指', weapon: '武器', offhand: '副手' };

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
  for (const a of (item.affixes || [])) m[a.key] = (m[a.key] || 0) + a.val;
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
  /* 稀有度只做很小的修正：同词缀下神兵略优于凡品，但不能盖过属性差 */
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
  h += `</div></div>`;
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
  for (const a of item.affixes) {
    h += `<div class="tt-aff">${affixText(a)}</div>`;
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
  if (item.powerDesc) h += `<div class="tt-power">神兵特效：${item.powerDesc}</div>`;
  if (item.setId) {
    const set = SETS[item.setId];
    const have = (Game.state ? (Game.state.setCount[item.setId] || 0) : 0);
    h += `<div class="tt-set"><div class="tt-set-t" style="color:${set.color}">${set.name}（${have}/${set.pieces.length}）</div>`;
    for (const b of set.bonuses) {
      const on = have >= b.need;
      h += `<div class="tt-set-b ${on ? 'on' : 'off'}">(${b.need}) ${b.text}</div>`;
    }
    h += `</div>`;
  }
  h += `<div class="tt-req">需求等级 ${item.reqLv}${item.cls ? ' · ' + CLASSES[item.cls].name : ''}</div>`;
  h += `<div class="tt-val">售价 ${item.value} 金</div>`;
  /* 对比放在最后：先看词条，再看「换了之后强多少」，符合阅读顺序 */
  if (opts.compareTo) h += itemCompareHTML(item, opts.compareTo);
  else h += `<div class="tt-score">综合评分 <b>${itemScore(item)}</b></div>`;
  if (opts.hint) h += `<div class="tt-hint">${opts.hint}</div>`;
  h += `</div>`;
  return h;
}
