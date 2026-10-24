/* ============================================================
 * 数据层 · 锻造（v1.6.0）
 *
 * 一套「匠材 → 胚装 → 成品」的循环，补上装备链的入口：
 *   1. 妖兽 / 精英 / 首领掉落九种匠材（不占行囊格，与玄晶、符文同放 stash.mats）
 *   2. 行囊里的凡品（白装）与灵品（蓝装）可以投进炉里当「胚」
 *   3. 胚的品质决定成品品质：白装 → 灵品；蓝装 → 玄品 / 神兵 / 套装
 *   4. 胚的部位与职业原样保留，等级也保留 —— 锻造只提升品质，不替代刷装
 *
 * 为什么用白装 / 蓝装当胚：
 *   这两档掉落最多、最快变成垃圾。让它们有去处，行囊才不会一直爆满，
 *   玩家也不必把每一件蓝装都捡回来看半天。品质越高的胚越省料（见
 *   CRAFT_QUALITY_DISCOUNT），所以「留着好胚再锻」也是一个取舍。
 *
 * 数值口径：
 *   需求按 5 档（每档 8 级）递增，越往上越吃高阶匠材；
 *   凡品胚按全价，灵品胚打 6 折（不足 1 记 1，不能白送）；
 *   兵刃（武器 / 副手）另加玄鳞与陨星铁 —— 甲可以省，刃不能省。
 * ============================================================ */

/* ---------------- 匠材 ----------------
 * tier 1 小怪就掉 / 2 精英为主 / 3 首领专属（精英偶见）
 * from 只写来源，不给概率，概率在 game.js 的 onEnemyDeath 里统一维护
 */
const CRAFT_MATS = {
  ore: {
    id: 'ore', name: '玄铁锭', tier: 1, color: '#b9c2cc', icon: 'ore',
    from: '妖兽 · 山石间', desc: '熔过的粗铁，凡兵之骨。万件兵甲皆自此始。'
  },
  hide: {
    id: 'hide', name: '妖兽皮', tier: 1, color: '#c08a5a', icon: 'hide',
    from: '妖兽 · 野兽', desc: '剥下即用的生皮，韧而不断，护甲的里子。'
  },
  bone: {
    id: 'bone', name: '妖骨', tier: 1, color: '#d8cfa8', icon: 'bone',
    from: '妖兽 · 洞窟', desc: '妖物死后不化的硬骨，磨成粉掺进铁里最吃火。'
  },
  silk: {
    id: 'silk', name: '灵蚕丝', tier: 2, color: '#b0e0c8', icon: 'silk',
    from: '精英 · 林间', desc: '灵蚕吐的丝，遇刃不断，能引灵气温养兵刃。'
  },
  ember: {
    id: 'ember', name: '赤炎砂', tier: 2, color: '#ff8a4a', icon: 'ember',
    from: '精英 · 火属妖物', desc: '地火凝成的砂粒，撒进炉里火色立时转白。'
  },
  frost: {
    id: 'frost', name: '寒玉髓', tier: 2, color: '#8fd8ff', icon: 'frost',
    from: '精英 · 深潭寒地', desc: '万年寒玉里的一线髓，淬火用，刃口能留住寒气。'
  },
  scale: {
    id: 'scale', name: '玄鳞', tier: 3, color: '#6ab0d8', icon: 'scale',
    from: '首领 · 蛟属妖物', desc: '蛟龙额下的一片逆鳞，寻常刀斧碰不出一道白痕。'
  },
  meteor: {
    id: 'meteor', name: '陨星铁', tier: 3, color: '#c9a0ff', icon: 'meteor',
    from: '首领 · 天外坠处', desc: '自天外落下的一块死铁，不熔于凡火，只认匠人。'
  },
  soul: {
    id: 'soul', name: '妖丹', tier: 3, color: '#ff6a8a', icon: 'soul',
    from: '首领 · 大妖', desc: '大妖千年修出的一枚内丹，炉火一触便散作灵雾。'
  }
};
const CRAFT_MAT_ORDER = ['ore', 'hide', 'bone', 'silk', 'ember', 'frost', 'scale', 'meteor', 'soul'];
const CRAFT_TIER_NAME = { 1: '凡料', 2: '灵料', 3: '神料' };

/* 匠材在 state.stash.mats 里的键前缀（与 xuanjing / crystal1 / rune_xx 同一处） */
const CRAFT_MAT_PREFIX = 'craft_';
function craftMatKey(id) { return CRAFT_MAT_PREFIX + id; }

/* ---------------- 配方 ----------------
 * ilvl 区间与 ARMOR_BASES / WEAPON_BASES 的档位一致（每 8 级一档），
 * 于是「这个胚属于第几档」和「它能出什么基底」天然对齐。
 */
const CRAFT_RECIPES = [
  { tier: 1, from: 1, to: 8, gold: 400, mats: { ore: 6, hide: 4 } },
  { tier: 2, from: 9, to: 16, gold: 1200, mats: { ore: 10, hide: 6, bone: 4, silk: 2 } },
  { tier: 3, from: 17, to: 24, gold: 2600, mats: { ore: 16, hide: 8, silk: 5, ember: 4, scale: 1 } },
  { tier: 4, from: 25, to: 32, gold: 4800, mats: { ore: 24, bone: 12, silk: 8, ember: 7, frost: 5, scale: 2 } },
  { tier: 5, from: 33, to: 40, gold: 8000, mats: { ore: 34, silk: 12, ember: 10, frost: 9, scale: 3, meteor: 2 } }
];

/* 兵刃加料：甲可以省，刃不能省 */
const CRAFT_WEAPON_EXTRA = {
  1: { scale: 1 },
  2: { scale: 1 },
  3: { scale: 1, meteor: 1 },
  4: { scale: 2, meteor: 1 },
  5: { scale: 2, meteor: 2 }
};

/* 只有凡品 / 灵品能当胚。品质越高越省料（底子已经好，匠人省力） */
const CRAFT_BASE_RARITY = ['common', 'magic'];
const CRAFT_QUALITY_DISCOUNT = { common: 1, magic: 0.6 };

/* 成品品质表：白装胚必出灵品；蓝装胚有 12% 直接出套装件（部位无套装时 rollItem 会自动退成玄品） */
const CRAFT_OUTCOME = {
  common: [['magic', 1]],
  magic: [['rare', 0.62], ['legendary', 0.26], ['set', 0.12]]
};

function craftTierOf(ilvl) {
  const lv = Math.max(1, Math.min(40, Math.round(Number(ilvl) || 1)));
  for (const r of CRAFT_RECIPES) if (lv >= r.from && lv <= r.to) return r.tier;
  return CRAFT_RECIPES[CRAFT_RECIPES.length - 1].tier;
}
function craftRecipeOf(ilvl) {
  const t = craftTierOf(ilvl);
  return CRAFT_RECIPES.find(r => r.tier === t) || CRAFT_RECIPES[0];
}
/* 这件胚能不能锻 */
function craftableItem(item) {
  return !!(item && item.slot && item.slot !== 'relic' && CRAFT_BASE_RARITY.indexOf(item.rarity) >= 0);
}

/* 纯函数：给定胚，返回 { tier, weapon, mats:{id:need}, gold }
 * 同一件胚永远得到同一份配方，探针与 UI 都读它，别各算一份。 */
function craftRecipeFor(item) {
  if (!craftableItem(item)) return null;
  const rec = craftRecipeOf(item.ilvl);
  const discount = CRAFT_QUALITY_DISCOUNT[item.rarity] || 1;
  const weapon = item.slot === 'weapon' || item.slot === 'offhand';
  const mats = {};
  for (const id in rec.mats) {
    /* 折扣后不足 1 记 1：不能让灵品胚白吃一个配方位 */
    mats[id] = Math.max(1, Math.round(rec.mats[id] * discount));
  }
  if (weapon) {
    const ex = CRAFT_WEAPON_EXTRA[rec.tier] || {};
    for (const id in ex) mats[id] = (mats[id] || 0) + Math.max(1, Math.round(ex[id] * (discount === 1 ? 1 : 0.8)));
  }
  return { tier: rec.tier, weapon, mats, gold: Math.round(rec.gold * discount) };
}

/* 成品品质：按胚的品质抽一次 */
function craftOutcomeRarity(baseRarity) {
  const table = CRAFT_OUTCOME[baseRarity] || CRAFT_OUTCOME.common;
  let r = Math.random(), acc = 0;
  for (const [key, w] of table) { acc += w; if (r < acc) return key; }
  return table[table.length - 1][0];
}

/* 读 Game 的展示层数据：需求 / 持有 / 缺口 / 能否开工。
 * UI 与探针都调这里，避免按钮亮了却扣不动料。 */
function craftInfo(item) {
  const rec = craftRecipeFor(item);
  if (!rec) return null;
  const mats = Object.keys(rec.mats).map(id => {
    const d = CRAFT_MATS[id] || { name: id, color: '#aaa', tier: 1 };
    const need = rec.mats[id];
    const have = (typeof Game !== 'undefined' && Game.craftMatCount) ? Game.craftMatCount(id) : 0;
    return { id, name: d.name, color: d.color, tier: d.tier, need, have, ok: have >= need };
  });
  const goldHave = (typeof Game !== 'undefined' && Game.state) ? Math.round(Game.state.gold || 0) : 0;
  const lack = mats.filter(m => !m.ok).map(m => m.name);
  if (goldHave < rec.gold) lack.push('铜钱');
  return {
    tier: rec.tier, weapon: rec.weapon,
    mats, gold: rec.gold, goldHave,
    can: lack.length === 0, lack
  };
}
