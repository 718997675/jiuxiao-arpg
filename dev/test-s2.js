/* ============================================================
 * S2 符文 / 炼器验证（node 直跑，不依赖浏览器）
 *
 *   node dev/test-s2.js
 *
 * 覆盖：
 *   1. 24 符文 / 12 符文之语 / 10 条图标 path / 9 套职业套装（3 职业 × 3 类型）的数据完整性
 *   2. 孔位滚动、符文镶嵌 / 取下、符文之语「孔数 + 顺序 + 填满」判定
 *   3. 符文与符文之语属性、flag 是否正确进入 computePlayerStats
 *   4. 洗练只换目标词缀、必换 key、费用递增
 *   5. 旧档物品归一化（孔位越界、非法符文、戒指/项链无孔）
 *   6. tooltip 是否渲染孔位与符文之语
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Set, Map, JSON, Object };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-icons.js');
load('data/data-items.js');
load('data/data-uniques.js');   // items.js 顶部会建 UNIQUE_BY_ID 索引，必须先加载
load('data/data-skills.js');    // 套装 skillMods 指向的技能要真实存在
load('items.js');

const pick = name => vm.runInContext(name, ctx);
const STATS = pick('STATS');
const RUNES = pick('RUNES');
const RUNE_TIERS = pick('RUNE_TIERS');
const RUNE_WORDS = pick('RUNE_WORDS');
const RUNE_ICON_ORDER = pick('RUNE_ICON_ORDER');
const ICON_PATHS = pick('ICON_PATHS');
const SETS = pick('SETS');
const SKILLS = pick('SKILLS');
const CLASSES = pick('CLASSES');
const FORGE = pick('FORGE');
const rollItem = pick('rollItem');
const ARMOR_BASES = pick('ARMOR_BASES');
const WEAPON_BASES = pick('WEAPON_BASES');
const OFFHAND_BASES = pick('OFFHAND_BASES');
const rollRune = pick('rollRune');
const socketCount = pick('socketCount');
const itemRunes = pick('itemRunes');
const runeWordOf = pick('runeWordOf');
const runeWordCandidates = pick('runeWordCandidates');
const insertRune = pick('insertRune');
const removeRuneAt = pick('removeRuneAt');
const reforgeCost = pick('reforgeCost');
const reforgeAffix = pick('reforgeAffix');
const normalizeItem = pick('normalizeItem');
const iconSvg = pick('iconSvg');
const itemTooltip = pick('itemTooltip');
const sumItemStats = pick('sumItemStats');
const aggregate = pick('aggregate');
const emptyStats = pick('emptyStats');
const computePlayerStats = pick('computePlayerStats');
const affixText = pick('affixText');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra ? '  →  ' + extra : '')); }
};

/* ---------------- 1. 数据完整性 ---------------- */
console.log('\n一、数据完整性');
{
  const ids = Object.keys(RUNES);
  ok(ids.length === 24, '符文数量应为 24', 'got ' + ids.length);
  ok(new Set(ids).size === 24, '符文 id 有重复');
  ok(RUNE_ICON_ORDER.length === 24, '图标顺序应为 24 条', 'got ' + RUNE_ICON_ORDER.length);
  ok(RUNE_ICON_ORDER.every(id => RUNES[id]), '图标顺序里出现了不存在的符文');
  ok(new Set(RUNE_ICON_ORDER).size === 24, '图标顺序有重复');

  let badTier = 0, badStat = 0, badName = 0;
  for (const id in RUNES) {
    const r = RUNES[id];
    if (!RUNE_TIERS[r.tier]) badTier++;
    if (r.id !== id) badName++;
    for (const k in r.stats) if (!STATS[k] || !isFinite(r.stats[k])) badStat++;
  }
  ok(badTier === 0, '符文引用了不存在的 tier', 'count=' + badTier);
  ok(badStat === 0, '符文属性引用了不存在的 key', 'count=' + badStat);
  ok(badName === 0, '符文 id 与 key 不一致', 'count=' + badName);

  ok(RUNE_WORDS.length === 12, '符文之语数量应为 12', 'got ' + RUNE_WORDS.length);
  const seqs = new Set(), wids = new Set();
  let badWord = 0;
  for (const w of RUNE_WORDS) {
    if (wids.has(w.id)) badWord++;
    wids.add(w.id);
    const seq = w.runes.join('|');
    if (seqs.has(seq)) badWord++;
    seqs.add(seq);
    if (w.runes.length < 2 || w.runes.length > 4) badWord++;
    if (!w.runes.every(id => RUNES[id])) badWord++;
    if (!w.name || !w.desc || !/^#[0-9a-f]{6}$/i.test(w.color || '')) badWord++;
    for (const k in w.stats) if (!STATS[k] || !isFinite(w.stats[k])) badWord++;
  }
  ok(badWord === 0, '符文之语存在非法数据', 'count=' + badWord);

  const flags = new Set();
  for (const s of Object.values(SETS)) for (const b of s.bonuses) {
    if (b.flag) flags.add(b.flag);
    if (Array.isArray(b.flags)) b.flags.forEach(f => flags.add(f));
  }
  for (const w of RUNE_WORDS) if (w.flag) {
    if (!flags.has(w.flag)) flags.add(w.flag);
  }
  const KNOWN = new Set(['thunder', 'firetrail', 'groupheal', 'bossSlayer', 'explode', 'bloodRush',
    'frostBurst', 'echo', 'seeker', 'longDash', 'novaFreeze', 'deepfreeze', 'runeburn']);
  const badFlag = [...flags].filter(f => !KNOWN.has(f));
  ok(badFlag.length === 0, '出现了未接入战斗逻辑的 flag', badFlag.join(','));
  /* 套装 special 也必须全部落地（game.js specials 钩子） */
  const specials = new Set();
  for (const s of Object.values(SETS)) for (const b of s.bonuses) {
    if (b.special) specials.add(b.special);
    if (Array.isArray(b.specials)) b.specials.forEach(sp => specials.add(sp));
  }
  const KNOWN_SP = new Set(['phoenix', 'soulharvest', 'berserk', 'critburst', 'chargeReset',
    'wolfPrime', 'wolfPack', 'wolfStrong', 'frenzyRefresh', 'avatarResetThrust', 'talismanPierce',
    'riposteGuard', 'frenzyStack', 'overcharge', 'plagueburst']);
  const badSp = [...specials].filter(f => !KNOWN_SP.has(f));
  ok(badSp.length === 0, '出现了未接入战斗逻辑的套装 special', badSp.join(','));

  ok(RUNE_ICON_ORDER.every(id => ICON_PATHS['rune_' + id]), '有符文缺少图标 path');
  let badIcon = 0;
  for (const id of RUNE_ICON_ORDER) {
    const d = ICON_PATHS['rune_' + id];
    if (!/^M/.test(d) || /<(?!\/?path)/.test(d)) badIcon++;
    const svg = iconSvg('rune_' + id, { size: 20 });
    if (!svg.includes('viewBox="0 0 32 32"') || !svg.includes('<path d="') || !svg.includes('fill="currentColor"')) badIcon++;
  }
  ok(badIcon === 0, '符文图标不符合 M11 规范', 'count=' + badIcon);

  const setIds = Object.keys(SETS);
  ok(setIds.length === 9, '套装数量应为 9（3 职业 × 3 类型）', 'got ' + setIds.length);
  const pieceNames = new Set();
  /* 技能 id 直接从 data-skills.js 取（36 个），套装 skillMods 必须指向真实技能 */
  const SKILL_IDS = new Set(Object.keys(SKILLS));
  const SKILLMOD_KEYS = new Set(['dmg', 'cd', 'cost', 'radius', 'count', 'dur']);
  let badSet = 0;
  for (const id of setIds) {
    const s = SETS[id];
    if (s.pieces.length !== s.slots.length) badSet++;
    if (s.pieces.length < 2 || s.pieces.length > 5) badSet++;
    if (!CLASSES[s.cls]) badSet++;
    for (const p of s.pieces) {
      if (pieceNames.has(p)) badSet++;
      pieceNames.add(p);
    }
    for (const b of s.bonuses) {
      if (b.need < 2 || b.need > s.pieces.length) badSet++;
      for (const k in (b.stats || {})) if (!STATS[k]) badSet++;
      for (const sid2 in (b.skillMods || {})) {
        if (!SKILL_IDS.has(sid2)) badSet++;
        for (const k in b.skillMods[sid2]) if (!SKILLMOD_KEYS.has(k)) badSet++;
      }
    }
  }
  ok(badSet === 0, '套装 pieces/slots/词条/技能修正不匹配或部件重名', 'count=' + badSet);
  console.log(`  符文 ${ids.length} · 符文之语 ${RUNE_WORDS.length} · 图标 ${Object.keys(ICON_PATHS).length} · 套装 ${setIds.length}`);
}

/* ---------------- 2. 孔位与符文之语 ---------------- */
console.log('\n二、孔位与符文之语');
{
  const N = 6000;
  let sockets = [0, 0, 0, 0, 0], ringHole = 0, lenBad = 0, dirty = 0;
  for (let i = 0; i < N; i++) {
    const it = rollItem(1 + Math.floor(Math.random() * 40));
    const n = socketCount(it);
    if (n < 0 || n > 4) {} else sockets[n]++;
    if (it.slot === 'ring' || it.slot === 'amulet') { if (n) ringHole++; }
    if (!Array.isArray(it.runes) || it.runes.length !== n) lenBad++;
    if (it.runes.some(r => r !== null)) dirty++;
  }
  ok(sockets.slice(0, 5).every(v => v > 0), '0-4 孔都应能被滚出', sockets.join('/'));
  ok(ringHole === 0, '戒指/项链不应有孔');
  ok(lenBad === 0, 'runes 数组长度应等于孔数', 'count=' + lenBad);
  ok(dirty === 0, '新装备的符文槽应为空', 'count=' + dirty);
  console.log('  孔位分布 0/1/2/3/4 = ' + sockets.join(' / '));

  const it = rollItem(30, { rarity: 'legendary', slot: 'chest', cls: 'warrior' });
  it.sockets = 3; it.runes = [null, null, null];

  ok(insertRune(it, 0, 'el') === true, '应能镶入空孔');
  ok(insertRune(it, 0, 'sol') === false, '已占用孔不能再镶');
  ok(runeWordOf(it) === null, '未填满时不应成形');
  ok(runeWordCandidates(it).some(w => w.id === 'thunder'), '半成品应能提示雷霆之语');

  insertRune(it, 1, 'sol');
  insertRune(it, 2, 'tal');
  const w = runeWordOf(it);
  ok(!!w && w.id === 'thunder', 'el-sol-tal 应形成雷霆之语', w && w.id);
  ok(runeWordCandidates(it).every(x => x.id === 'thunder'), '成形后候选只剩已成形的那一条');

  const wrong = rollItem(30, { rarity: 'legendary', slot: 'chest', cls: 'warrior' });
  wrong.sockets = 3; wrong.runes = ['sol', 'el', 'tal'];
  ok(runeWordOf(wrong) === null, '顺序错误不应成形');

  const two = rollItem(30, { rarity: 'rare', slot: 'chest', cls: 'warrior' });
  two.sockets = 2; two.runes = ['amn', 'nef'];
  ok((runeWordOf(two) || {}).id === 'bloodthirst', '两孔 amn-nef 应形成饮血之语');

  const back = removeRuneAt(two, 1);
  ok(back === 'nef' && two.runes[1] === null, '取下符文应返回 id 并清空孔位');

  const plain = { slot: 'chest', rarity: 'rare', affixes: [], sockets: 2, runes: ['amn', 'nef'] };
  const st = emptyStats();
  sumItemStats(plain, st);
  ok(st.def === RUNES.nef.stats.def, 'nef 的护甲应生效', 'def=' + st.def);
  ok(st.lifesteal === RUNES.amn.stats.lifesteal + 5, '饮血之语应叠加吸血', 'ls=' + st.lifesteal);
  ok(st.killHeal === 10, '饮血之语应提供击杀回复', 'killHeal=' + st.killHeal);

  removeRuneAt(plain, 1);
  const st2 = emptyStats();
  sumItemStats(plain, st2);
  ok(st2.lifesteal === RUNES.amn.stats.lifesteal, '符文之语破坏后不该再有额外吸血', 'ls=' + st2.lifesteal);

  sumItemStats(it, st);
  ok(st.atkPct >= 10, '雷霆之语应提供 10% 攻击加成', 'atkPct=' + st.atkPct);
  const agg = aggregate({ chest: it });
  ok(agg.flags.thunder === true, '雷霆之语应点亮 thunder flag');

  const rage = rollItem(30, { rarity: 'rare', slot: 'chest', cls: 'warrior' });
  rage.sockets = 3; rage.runes = ['amn', 'ith', 'mal'];
  const agg2 = aggregate({ chest: rage });
  ok(agg2.flags.bloodRush === true, '血怒之语应点亮 bloodRush flag');
  const ps = computePlayerStats({ cls: 'warrior', level: 30, equipment: { chest: rage } });
  ok(ps.flags.bloodRush === true, 'flag 应进入 computePlayerStats');
  ok(ps.critDmg >= 150 + 20 + RUNES.ith.stats.critDmg, '符文之语爆伤应进入最终属性');
}

/* ---------------- 3. 掉落 tier 上限 ---------------- */
console.log('\n三、符文掉落');
{
  const maxTierFor = ilvl => ilvl >= 28 ? 4 : ilvl >= 18 ? 3 : ilvl >= 8 ? 2 : 1;
  let bad = 0;
  const tiers = new Set();
  for (const ilvl of [1, 5, 10, 20, 30, 40]) {
    for (let i = 0; i < 300; i++) {
      const r = RUNES[rollRune(ilvl)];
      if (!r || r.tier > maxTierFor(ilvl)) bad++;
      tiers.add(r.tier);
    }
  }
  ok(bad === 0, '符文掉落超出了 ilvl 允许的 tier', 'count=' + bad);
  ok(tiers.size === 4, '低到高 ilvl 应覆盖全部 4 个 tier', [...tiers].join(','));
}

/* ---------------- 4. 洗练 ---------------- */
console.log('\n四、洗练');
{
  const it = rollItem(40, { rarity: 'legendary', slot: 'chest', cls: 'warrior', magicFind: 200 });
  const rarity = it.rarity, count = it.affixes.length, value = it.value;
  const c0 = reforgeCost(it);
  let switched = 0, dup = 0, badKey = 0;
  for (let k = 0; k < 60; k++) {
    const oldKey = it.affixes[0].key;
    const a = reforgeAffix(it, 0);
    if (!a) { badKey++; break; }
    if (a.key === oldKey) switched++;
    if (!STATS[a.key] || !isFinite(a.val) || a.val <= 0) badKey++;
    const seen = new Set();
    for (const x of it.affixes) {
      if (seen.has(x.key)) dup++;
      seen.add(x.key);
    }
  }
  ok(switched === 0, '洗练必须换一条不同 key 的词缀', 'same=' + switched);
  ok(dup === 0, '洗练后出现重复词缀', 'dup=' + dup);
  ok(badKey === 0, '洗练产出了非法词缀', 'bad=' + badKey);
  ok(it.rarity === rarity, '洗练不应改变稀有度');
  ok(it.affixes.length === count, '洗练不应改变词缀数量');
  ok(it.value === value, '洗练不应改变售价（词缀数量未变）');
  ok(it.reforges === 60, '洗练次数应累加', 'got ' + it.reforges);
  ok(reforgeCost(it) > c0, '洗练费用应随次数递增', c0 + ' → ' + reforgeCost(it));

  let badCost = 0;
  for (const r of ['common', 'magic', 'rare', 'legendary', 'set']) {
    const x = rollItem(20, { rarity: r, slot: 'chest', cls: 'warrior' });
    if (reforgeCost(x) !== FORGE.reforgeCost[r]) badCost++;
  }
  ok(badCost === 0, '基础洗练费用与 FORGE 表不一致');
}

/* ---------------- 5. 归一化 ---------------- */
console.log('\n五、旧档 / 脏数据归一化');
{
  const a = normalizeItem({ slot: 'chest', rarity: 'rare', affixes: [], sockets: 9, runes: ['el', 'nope', 3] });
  ok(a.sockets === FORGE.drillMax, '孔数应被夹到 drillMax=' + FORGE.drillMax, 'got ' + a.sockets);
  ok(a.runes.length === FORGE.drillMax && a.runes[0] === 'el', '合法符文保留，数组补足');
  ok(a.runes.slice(1).every(r => r === null), '非法符文应置空');

  const b = normalizeItem({ slot: 'ring', rarity: 'rare', affixes: [], sockets: 3, runes: ['el', 'sol', 'tal'] });
  ok(b.sockets === 0 && b.runes.length === 0, '戒指应强制无孔');

  const c = normalizeItem({
    slot: 'helm', rarity: 'magic', sockets: 1, runes: [],
    affixes: [{ key: 'atk', val: 5 }, { key: 'no_such', val: 1 }, { key: 'crit', val: NaN }]
  });
  ok(c.affixes.length === 1 && c.affixes[0].key === 'atk', '非法词缀应被剔除');
  ok(c.runes.length === 1 && c.runes[0] === null, '缺失的符文槽应补 null');
  ok(normalizeItem(null) === null, 'null 物品应返回 null');
}

/* ---------------- 6. tooltip ---------------- */
console.log('\n六、提示框');
{
  const it = rollItem(20, { rarity: 'rare', slot: 'chest', cls: 'warrior' });
  it.sockets = 3; it.runes = ['el', 'sol', 'tal'];
  const h = itemTooltip(it);
  ok(h.includes('tt-socks'), 'tooltip 应包含孔位区');
  ok(h.includes('符文之语 · 雷霆之语'), 'tooltip 应显示成形的符文之语');
  ok(h.includes('雷霆'), 'tooltip 应显示符文之语属性');
  const empty = rollItem(20, { rarity: 'rare', slot: 'chest', cls: 'warrior' });
  empty.sockets = 2; empty.runes = [null, null];
  ok(!itemTooltip(empty).includes('tt-rw'), '空孔不应误报符文之语');
}

/* ---------------- 7. 套装生成 ---------------- */
console.log('\n七、套装生成');
{
  const baseNames = new Set();
  for (const s in ARMOR_BASES) for (const tier of ARMOR_BASES[s]) for (const v of tier) baseNames.add(v[0]);
  for (const c in WEAPON_BASES) for (const tier of WEAPON_BASES[c]) for (const v of tier) baseNames.add(v.name);
  for (const c in OFFHAND_BASES) for (const tier of OFFHAND_BASES[c]) for (const v of tier) baseNames.add(v[0]);

  const setIds = Object.keys(SETS);
  const hitSets = new Set(), hitPieces = new Set();
  let miss = 0, wrongName = 0, wrongRarity = 0, baseClash = 0;
  for (const sid of setIds) {
    const set = SETS[sid];
    const classList = set.cls ? [set.cls] : ['warrior', 'mage', 'taoist'];
    set.slots.forEach((slot, idx) => {
      const want = set.pieces[idx];
      let got = null;
      for (let i = 0; i < 300 && !got; i++) {
        const cls = classList[i % classList.length];
        const it = rollItem(40, { rarity: 'set', slot, cls });
        if (it.setId === sid) got = it;
      }
      if (!got) { miss++; console.log('    ✗ 滚不出套装部件 ' + sid + ' · ' + want); return; }
      hitSets.add(sid);
      hitPieces.add(got.name);
      if (got.name !== want) { wrongName++; console.log('    ✗ 部件名错位 ' + sid + ' ' + slot + ' → ' + got.name); }
      if (got.rarity !== 'set' || got.setName !== set.name) wrongRarity++;
      if (baseNames.has(got.name)) { baseClash++; console.log('    ✗ 部件名与基底重名：' + got.name); }
    });
  }
  const allPieces = setIds.flatMap(id => SETS[id].pieces);
  ok(miss === 0, '有套装部件滚不出来', 'miss=' + miss);
  ok(hitSets.size === 9, '9 套职业套装都应能被滚出', 'hit=' + hitSets.size);
  ok(hitPieces.size === allPieces.length, '每个套装部件都应能被滚出', hitPieces.size + '/' + allPieces.length);
  ok(wrongName === 0, '部件名与 set.pieces 错位', 'count=' + wrongName);
  ok(wrongRarity === 0, '套装稀有度 / 套装名未正确写入', 'count=' + wrongRarity);
  ok(baseClash === 0, '套装部件名与基底名冲突', 'count=' + baseClash);
}

console.log('\n====================================================');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('====================================================');
process.exit(fail ? 1 : 0);
