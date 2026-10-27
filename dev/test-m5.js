/* ============================================================
 * dev/test-m5.js —— M5 地下城（地脉裂隙）专项回归
 *
 * 覆盖（对应 docs/ACT-EXPANSION-PLAN.md §8 与台账 M5 验收口径）：
 *   1. 钥匙 5 阶：一阶对一卷、等级段无空洞、词缀数随阶递增、价格递增
 *   2. 三层：层数 / 尺寸 / 刷怪总数 / 开门阈值
 *   3. 5 类地下城：怪池引用完整、专属怪归属对、守卫首领不进野外
 *   4. 词缀：10 条、随阶解锁、抽取不重复不越界
 *   5. 地脉异闻：25 条、加成键落在真属性键上、单类/全清结算正确
 *   6. 纯函数：keyTierDef 钳制、dungeonMobLevel clamp、dungeonCodexId
 *   7. 存档层：keys / dungeon 往返、脏数据收敛、老档默认值
 *   8. 数据接线：BALANCE 旋钮、营地 NPC、守卫不进 MAPS.bosses
 *
 * 用法：node dev/test-m5.js（纯 node + vm，不启浏览器）
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./_load');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
};
const eq = (label, got, want) => ok(label, got === want, { got, want });
const section = t => console.log('\n' + t);

/* ---------------- 最小宿主环境 ----------------
 * data/*.js 是纯数据，但 core/store.js 与 core/save.js 一加载就摸
 * window.localStorage —— 给一份假的就够，不需要真的浏览器。 */
const mem = new Map();
const localStorage = {
  get length() { return mem.size; },
  key(i) { return Array.from(mem.keys())[i] ?? null; },
  getItem(k) { return mem.has(k) ? mem.get(k) : null; },
  setItem(k, v) { mem.set(k, String(v)); },
  removeItem(k) { mem.delete(k); },
  clear() { mem.clear(); }
};
const win = {
  addEventListener() { }, removeEventListener() { },
  localStorage, innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  navigator: { maxTouchPoints: 0 }
};
const sandbox = {
  console, window: win, document: { addEventListener() { }, getElementById: () => null },
  localStorage, navigator: win.navigator,
  Math, JSON, Date, Number, String, Array, Object, Set, Map, Promise,
  isFinite, parseInt, parseFloat, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* 文件顺序从 index.html 里读（dev/_load.js 的白名单），与线上一致。
 * 手动补 dungeon.js：它不在 src/data 下，但顶层只定义常量，没有副作用。 */
const SAFE = f => f.startsWith('src/data/') || f === 'src/items.js'
  || f === 'src/core/store.js' || f === 'src/core/save.js';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [];
{
  const re = /<script\s+src="(src\/[^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) if (SAFE(m[1])) files.push(m[1]);
}
if (!files.includes('src/data/data-dungeon.js')) {
  console.log('✗ index.html 没有引入 src/data/data-dungeon.js —— M5 的地脉数据根本没上网页');
  process.exit(1);
}
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
/* dungeon.js 单独装：确认它只定义不执行（否则这一行就会抛） */
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/dungeon.js'), 'utf8'), sandbox, { filename: 'src/dungeon.js' });

vm.runInContext(`
globalThis.__m5 = {
  KEY_TIERS, DUNGEON_LAYERS, DUNGEON_TYPES, DUNGEON_AFFIXES, DUNGEON_CODEX,
  DUNGEON_TYPE_BONUS, DUNGEON_ALL_BONUS, DUNGEON_ATMOS,
  keyTierDef, dungeonTypeById, dungeonMobLevel, dungeonAffixCount,
  rollDungeonAffixes, dungeonCodexId, dungeonBonusStats, dungeonCodexProgress,
  MONSTERS, BOSSES, MAPS, MAP_ZONES, PARTS,
  BUFF_ADD, BUFF_MUL, BALANCE, ZONE_ARCHETYPES, Dungeon, dungeonMapId
};
`, sandbox);
const D = sandbox.__m5;
const {
  KEY_TIERS, DUNGEON_LAYERS, DUNGEON_TYPES, DUNGEON_AFFIXES, DUNGEON_CODEX,
  DUNGEON_TYPE_BONUS, DUNGEON_ALL_BONUS, MONSTERS, BOSSES, MAPS, BALANCE
} = D;

/* ============================================================ */
section('【1】钥匙 5 阶');
eq('KEY_TIERS 5 阶', KEY_TIERS.length, 5);
ok('tier 与下标对齐', KEY_TIERS.every((t, i) => t.tier === i + 1));
ok('一阶对一卷（part === tier）', KEY_TIERS.every(t => t.part === t.tier),
  KEY_TIERS.map(t => t.part));
eq('等级段从 1 起', KEY_TIERS[0].lvFrom, 1);
const gap = KEY_TIERS.filter((t, i) => i > 0 && t.lvFrom !== KEY_TIERS[i - 1].lvTo + 1);
ok('等级段连续无空洞（否则有等级段打不到钥匙）', gap.length === 0,
  gap.map(t => t.name + '@' + t.lvFrom));
ok('词缀数随阶递增（affixN === tier − 1）', KEY_TIERS.every(t => t.affixN === t.tier - 1),
  KEY_TIERS.map(t => t.affixN));
ok('价格递增', KEY_TIERS.every((t, i) => i === 0 || t.price > KEY_TIERS[i - 1].price));
ok('每阶都有名/色/描述', KEY_TIERS.every(t => t.name && t.color && t.desc));
eq('keyTierDef(0) 钳到一阶', D.keyTierDef(0).tier, 1);
eq('keyTierDef(99) 钳到五阶', D.keyTierDef(99).tier, 5);
ok('dungeonAffixCount 等于 affixN', KEY_TIERS.every(t => D.dungeonAffixCount(t.tier) === t.affixN));

section('【2】三层结构');
eq('3 层', DUNGEON_LAYERS.length, 3);
ok('no 依次 1/2/3', DUNGEON_LAYERS.every((l, i) => l.no === i + 1));
ok('尺寸逐层收小', DUNGEON_LAYERS.every((l, i) => i === 0 || l.size <= DUNGEON_LAYERS[i - 1].size),
  DUNGEON_LAYERS.map(l => l.size));
ok('尺寸不低于骨架下限 130', DUNGEON_LAYERS.every(l => l.size >= 130), DUNGEON_LAYERS.map(l => l.size));
ok('刷怪总数递减', DUNGEON_LAYERS.every((l, i) => i === 0 || l.total <= DUNGEON_LAYERS[i - 1].total),
  DUNGEON_LAYERS.map(l => l.total));
eq('第 3 层只放首领（total 0）', DUNGEON_LAYERS[2].total, 0);
ok('开门阈值前两层 <1、末层 =1',
  DUNGEON_LAYERS[0].need > 0 && DUNGEON_LAYERS[0].need < 1
  && DUNGEON_LAYERS[1].need > DUNGEON_LAYERS[0].need && DUNGEON_LAYERS[1].need < 1
  && DUNGEON_LAYERS[2].need === 1, DUNGEON_LAYERS.map(l => l.need));
ok('前两层有门名、末层没有', DUNGEON_LAYERS[0].gate && DUNGEON_LAYERS[1].gate && !DUNGEON_LAYERS[2].gate);

section('【3】5 类地下城');
eq('5 类', DUNGEON_TYPES.length, 5);
eq('id 唯一', new Set(DUNGEON_TYPES.map(t => t.id)).size, 5);
ok('每类都有单字纹/骨架/地貌/副标/提示',
  DUNGEON_TYPES.every(t => t.glyph && t.glyph.length === 1 && t.arch && t.ground && t.subtitle && t.hint));
ok('骨架都存在于 ZONE_ARCHETYPES',
  DUNGEON_TYPES.every(t => D.ZONE_ARCHETYPES && D.ZONE_ARCHETYPES[t.arch]),
  DUNGEON_TYPES.filter(t => !D.ZONE_ARCHETYPES || !D.ZONE_ARCHETYPES[t.arch]).map(t => t.arch));
ok('地貌都定义了氛围参数（否则进图是一片黑）',
  DUNGEON_TYPES.every(t => D.DUNGEON_ATMOS[t.ground]),
  DUNGEON_TYPES.filter(t => !D.DUNGEON_ATMOS[t.ground]).map(t => t.ground));

const badKind = [];
for (const t of DUNGEON_TYPES) for (const k of t.kinds) if (!MONSTERS[k]) badKind.push(t.id + ':' + k);
ok('怪池引用的怪全部存在', badKind.length === 0, badKind);
ok('每类怪池 ≥8 只（够铺 20 只不重复感）', DUNGEON_TYPES.every(t => t.kinds.length >= 8),
  DUNGEON_TYPES.map(t => t.kinds.length));
eq('怪池内无重复', DUNGEON_TYPES.filter(t => new Set(t.kinds).size !== t.kinds.length).length, 0);

/* 专属怪：dungeon 字段必须指向一个真实的类别，且该类怪池里确实有它 */
const dgMob = Object.keys(MONSTERS).filter(k => MONSTERS[k].dungeon);
eq('地下城专属怪 4 只', dgMob.length, 4);
const badDg = dgMob.filter(k => {
  const t = D.dungeonTypeById(MONSTERS[k].dungeon);
  return !t || t.kinds.indexOf(k) < 0;
});
ok('专属怪的 dungeon 字段都指向本类且在本类怪池里', badDg.length === 0, badDg);
const noOwn = DUNGEON_TYPES.filter(t => !t.kinds.some(k => MONSTERS[k] && MONSTERS[k].dungeon === t.id));
ok('至少 4 类各带 1 只专属怪', noOwn.length <= 1, noOwn.map(t => t.id));

/* 守卫首领 */
const badBoss = DUNGEON_TYPES.filter(t => !BOSSES[t.boss]);
ok('每类守卫首领都在 BOSSES 里', badBoss.length === 0, badBoss.map(t => t.boss));
ok('守卫都带 dungeon: true', DUNGEON_TYPES.every(t => BOSSES[t.boss] && BOSSES[t.boss].dungeon === true));
ok('守卫的 id 前缀是 dgb_（和世界首领区分）', DUNGEON_TYPES.every(t => /^dgb_/.test(t.boss)));
const bossNameSync = DUNGEON_TYPES.filter(t => BOSSES[t.boss].name !== t.bossName);
ok('bossName 与 BOSSES 里的名字一致', bossNameSync.length === 0,
  bossNameSync.map(t => t.id + ':' + t.bossName + '≠' + BOSSES[t.boss].name));
const leaked = [];
for (const id in MAPS) for (const b of (MAPS[id].bosses || [])) if (BOSSES[b] && BOSSES[b].dungeon) leaked.push(id + ':' + b);
ok('守卫没有漏进任何野外图的 bosses（野外不会刷出来）', leaked.length === 0, leaked);
ok('不存在的守卫不会被 MAPS 引用', Object.values(BOSSES).filter(b => b.dungeon).every(b => !Object.keys(MAPS).some(id => (MAPS[id].bosses || []).includes(b.id))));

/* 族群配比：subtitle 里的百分数必须和为 100，否则文案在骗人 */
const badPct = DUNGEON_TYPES.filter(t => {
  const ns = (t.subtitle.match(/\d+/g) || []).map(Number);
  return ns.length !== 3 || ns.reduce((a, b) => a + b, 0) !== 100;
});
ok('subtitle 族群配比都是三个数且和为 100', badPct.length === 0, badPct.map(t => t.subtitle));
ok('每类都有机制说明', DUNGEON_TYPES.every(t => t.mechanic && t.mechanic.name && t.mechanic.desc));

section('【4】词缀');
eq('10 条词缀', DUNGEON_AFFIXES.length, 10);
eq('id 唯一', new Set(DUNGEON_AFFIXES.map(a => a.id)).size, 10);
ok('minTier 落在 2~5', DUNGEON_AFFIXES.every(a => a.minTier >= 2 && a.minTier <= 5),
  DUNGEON_AFFIXES.map(a => a.minTier));
ok('每条都有名/描述', DUNGEON_AFFIXES.every(a => a.name && a.desc));
ok('每条至少挂一种效果',
  DUNGEON_AFFIXES.every(a => a.mob || a.player || a.loot || a.fog || a.healPct || a.ramp || a.teleport || a.chests),
  DUNGEON_AFFIXES.filter(a => !(a.mob || a.player || a.loot || a.fog || a.healPct || a.ramp || a.teleport || a.chests)).map(a => a.id));
ok('一阶不抽词缀（affixN 0）', D.rollDungeonAffixes(1, 0).length === 0);
let rollBad = 0, overTier = 0;
for (let i = 0; i < 200; i++) {
  for (const tier of [2, 3, 4, 5]) {
    const got = D.rollDungeonAffixes(tier, D.dungeonAffixCount(tier));
    if (new Set(got.map(a => a.id)).size !== got.length) rollBad++;
    if (got.some(a => a.minTier > tier)) overTier++;
  }
}
eq('200 轮 × 2~5 阶抽取无重复', rollBad, 0);
eq('200 轮 × 2~5 阶抽取都不越阶', overTier, 0);
ok('抽满也不超池（五阶 4 条 ≤ 可用池）',
  D.rollDungeonAffixes(5, 99).length <= DUNGEON_AFFIXES.length);

section('【5】地脉异闻（图鉴）');
eq('5 类 × 5 阶 = 25 条', DUNGEON_CODEX.length, 25);
eq('id 唯一', new Set(DUNGEON_CODEX.map(e => e.id)).size, 25);
ok('id === dungeonCodexId(类型, 阶)',
  DUNGEON_CODEX.every(e => e.id === D.dungeonCodexId(e.type, e.tier)));
ok('每条都能查到所属类别', DUNGEON_CODEX.every(e => !!D.dungeonTypeById(e.type)));
ok('每条名字是「类型 · 钥匙」', DUNGEON_CODEX.every(e => {
  const t = D.dungeonTypeById(e.type), k = D.keyTierDef(e.tier);
  return e.name === t.name + ' · ' + k.name;
}));

/* 加成键必须是真属性键：写错的键在 items.js 里会被静默丢弃，
 * 面板看不见、战斗也不生效 —— 这是最典型的一类「改了没反应」。 */
const REAL = new Set([...D.BUFF_ADD, ...Object.keys(D.BUFF_MUL)]);
const REAL_EXTRA = new Set(['atk', 'def', 'hpPct', 'atkPct', 'armorPct']);   // computePlayerStats 里参与换算的派生键
const badKey = [];
for (const tid in DUNGEON_TYPE_BONUS) for (const k in DUNGEON_TYPE_BONUS[tid].bonus) {
  if (!REAL.has(k) && !REAL_EXTRA.has(k)) badKey.push(tid + ':' + k);
}
for (const k in DUNGEON_ALL_BONUS.bonus) if (!REAL.has(k) && !REAL_EXTRA.has(k)) badKey.push('all:' + k);
ok('所有加成键都是真属性键（不是拼错的静默死键）', badKey.length === 0, badKey);

eq('空进度 → 无加成', Object.keys(D.dungeonBonusStats({})).length, 0);
eq('未通关 → 无加成', Object.keys(D.dungeonBonusStats({ cleared: {} })).length, 0);

const oneTypeAll = {};
for (const k of KEY_TIERS) oneTypeAll[D.dungeonCodexId('tomb', k.tier)] = true;
const one = D.dungeonBonusStats({ cleared: oneTypeAll });
ok('单类 5 阶全清 → 恰好给该类加成',
  one.eliteDmg === DUNGEON_TYPE_BONUS.tomb.bonus.eliteDmg && Object.keys(one).length === 1, one);

const fourOfFive = {};
for (const k of KEY_TIERS.slice(0, 4)) fourOfFive[D.dungeonCodexId('tomb', k.tier)] = true;
eq('差一阶不给加成', Object.keys(D.dungeonBonusStats({ cleared: fourOfFive })).length, 0);

const allC = {};
for (const e of DUNGEON_CODEX) allC[e.id] = true;
const allb = D.dungeonBonusStats({ cleared: allC });
ok('25 条全清 → 含终局加成 dmgAll',
  allb.dmgAll === DUNGEON_ALL_BONUS.bonus.dmgAll, allb);
eq('25 条全清 → 五类加成也都在',
  Object.keys(allb).length, 5 + Object.keys(DUNGEON_ALL_BONUS.bonus).length);
eq('进度统计 25/25', D.dungeonCodexProgress({ cleared: allC }).done, 25);
eq('空进度 0/25', D.dungeonCodexProgress({}).done, 0);

section('【6】纯函数');
ok('dungeonMobLevel 下钳到该阶 lvFrom', D.dungeonMobLevel(1, 3) === KEY_TIERS[2].lvFrom,
  D.dungeonMobLevel(1, 3));
ok('dungeonMobLevel 上钳到该阶 lvTo', D.dungeonMobLevel(99, 2) === KEY_TIERS[1].lvTo,
  D.dungeonMobLevel(99, 2));
eq('dungeonMobLevel 中间段是玩家 +2', D.dungeonMobLevel(35, 3), 37);
ok('dungeonMobLevel 玩家低于该阶下限时仍按下限算', D.dungeonMobLevel(25, 3) === KEY_TIERS[2].lvFrom);
ok('dungeonTypeById 未知 id → null', D.dungeonTypeById('nope') === null);
eq('dungeonMapId 拼法稳定', D.dungeonMapId('tomb', 2), 'dgn_tomb_2');
ok('Dungeon.QUIT/enter 等入口都在',
  ['keys', 'addKey', 'spendKey', 'openRift', 'pickType', 'preview', 'enter', 'loadLayer',
    'spawnBoss', 'onKill', 'onBossDown', 'progress', 'usePortal', 'finish', 'grantLoot',
    'onPlayerDeath', 'onRespawn', 'quit', 'update', 'renderHud']
    .every(m => typeof D.Dungeon[m] === 'function'),
  Object.keys(D.Dungeon));

section('【7】存档层');
const SM = vm.runInContext('SaveManager', sandbox);
eq('_keys 定长 5', SM._keys([3]).length, 5);
eq('_keys 缺项补 0', JSON.stringify(SM._keys([3])), JSON.stringify([3, 0, 0, 0, 0]));
eq('_keys 负数收敛到 0', SM._keys([-3, 0, 0, 0, 0])[0], 0);
eq('_keys 超上限收敛到 99', SM._keys([999, 0, 0, 0, 0])[0], 99);
eq('_keys 非数组 → 全 0', JSON.stringify(SM._keys('bad')), JSON.stringify([0, 0, 0, 0, 0]));
eq('_keys NaN 收敛到 0', SM._keys([NaN, 0, 0, 0, 0])[0], 0);
eq('_keys 浮点按四舍五入收敛（_int 口径）', SM._keys([2.7, 0, 0, 0, 0])[0], 3);

const rec = SM._dungeonRec({ cleared: { tomb1: true, well2: 0 }, runs: -5, wins: 3.9 });
eq('_dungeonRec 只留真值条目', Object.keys(rec.cleared).join(','), 'tomb1');
eq('_dungeonRec runs 负数收敛 0', rec.runs, 0);
eq('_dungeonRec wins 取整', rec.wins, 4);
eq('_dungeonRec 缺省安全', JSON.stringify(SM._dungeonRec(null)), JSON.stringify({ cleared: {}, runs: 0, wins: 0 }));

/* 走一遍真 pack/unpack：只带这两个字段的往返 */
const st0 = SM._fallbackState('warrior', 'M5 测试');
st0.keys = [2, 0, 1, 0, 0];
st0.dungeon = { cleared: { tomb1: true, den3: true }, runs: 7, wins: 2 };
const back = SM.unpack(SM.pack(st0));
eq('pack/unpack 往返 keys', JSON.stringify(back.keys), JSON.stringify([2, 0, 1, 0, 0]));
eq('pack/unpack 往返 cleared', Object.keys(back.dungeon.cleared).sort().join(','), 'den3,tomb1');
eq('pack/unpack 往返 runs/wins', back.dungeon.runs + '/' + back.dungeon.wins, '7/2');
const oldDoc = SM.pack(SM._fallbackState('mage', '老档'));
delete oldDoc.keys; delete oldDoc.dungeon;
const oldBack = SM.unpack(oldDoc);
eq('老档无 keys → 5 个 0', JSON.stringify(oldBack.keys), JSON.stringify([0, 0, 0, 0, 0]));
eq('老档无 dungeon → 空进度', JSON.stringify(oldBack.dungeon), JSON.stringify({ cleared: {}, runs: 0, wins: 0 }));

section('【8】数据接线');
ok('BALANCE.keyDrop 四档齐',
  BALANCE.keyDrop && BALANCE.keyDrop.actBoss === 0.08 && BALANCE.keyDrop.actBossFinal === 0.15
  && BALANCE.keyDrop.mob === 0.006 && BALANCE.keyDrop.elite === 0.10, BALANCE.keyDrop);
ok('小怪出率远小于精英', BALANCE.keyDrop.mob * 10 < BALANCE.keyDrop.elite);
/* 营地 NPC */
const npcSrc = fs.readFileSync(path.join(ROOT, 'src/data/data-world.js'), 'utf8');
ok('地脉守 rift 已定义', /rift:\s*\{[^}]*role:\s*'dungeon'/.test(npcSrc));
const campHits = (npcSrc.match(/npcs:\s*\[[^\]]*'rift'/g) || []).length;
eq('5 座营地都挂了地脉守', campHits, 5);
const worldSrc = fs.readFileSync(path.join(ROOT, 'src/world.js'), 'utf8');
ok('world.js 有 dungeon 角色配色', /dungeon:\s*\{\s*color:/.test(worldSrc));

console.log(fail ? `\n❌ ${fail} 项失败（${pass} 通过）` : `\n✅ 全部通过（${pass} 项）`);
process.exit(fail ? 1 : 0);
