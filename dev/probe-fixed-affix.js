/* ============================================================
 * v1.1.6 固定初始词条 / 可洗练词条 拆分验证（node 直跑）
 *
 *   node dev/probe-fixed-affix.js
 *
 * 需求：装备词条拆为【固定初始词条】与【可洗练词条】两类，二者相互独立；
 *       品质决定固定词条条数，品质越高越多。
 *
 * 覆盖的不变量：
 *   1. 各品质固定条数 = RARITY[x].fixed（凡 0 / 灵 1 / 玄 2 / 神兵 3 / 套装 2 / 传世 0）
 *   2. 固定词条与可洗词条 key 不重复
 *   3. 固定词条数值按 FORGE.fixedMul 打折，不会反超同等级可洗词条
 *   4. 洗练 / 强化 / 单条升级 都不改动 fixed 数组
 *   5. 洗练永远不会洗出与固定词条重复的 key
 *   6. 属性汇总、评分、战力都计入固定词条
 *   7. 旧存档（无 fixed 字段）读档后按品质补齐
 *   8. 品质提升后固定条数同步增加
 *   9. 存档 JSON 往返后 fixed 完整保留
 *  10. 传世不叠加 fixed（固定属性走 uniqueStats，避免双重计算）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Set, Map, JSON };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-items.js');
load('data/data-uniques.js');   // items.js 顶部要建 UNIQUE_BY_ID 索引
load('items.js');

const pick = n => vm.runInContext(n, ctx);
const RARITY = pick('RARITY');
const FORGE = pick('FORGE');
const STATS = pick('STATS');
const rollItem = pick('rollItem');
const normalizeItem = pick('normalizeItem');
const sumItemStats = pick('sumItemStats');
const emptyStats = pick('emptyStats');
const itemStatMap = pick('itemStatMap');
const itemScore = pick('itemScore');
const itemPower = pick('itemPower');
const reforgeAffix = pick('reforgeAffix');
const upgradeAffix = pick('upgradeAffix');
const enhanceItem = pick('enhanceItem');
const reforgeTargets = pick('reforgeTargets');
const fillFixedAffixes = pick('fillFixedAffixes');
const fixedAffixCount = pick('fixedAffixCount');
const itemTooltip = pick('itemTooltip');
const makeStarterSet = pick('makeStarterSet');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }
const keysOf = list => (list || []).map(a => a.key).sort().join(',');
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------- 1. 条数由品质决定 ---------------- */
section('1. 固定词条条数由品质决定');
const EXPECT = { common: 0, magic: 1, rare: 2, legendary: 3, set: 2, unique: 0 };
for (const rar of Object.keys(EXPECT)) {
  let bad = 0, sample = 0;
  for (let i = 0; i < 120; i++) {
    const it = rollItem(20 + (i % 20), { rarity: rar, cls: 'warrior' });
    if (it.rarity !== rar) continue;         // 传世池不足时会降级，跳过
    sample++;
    if ((it.fixed || []).length !== EXPECT[rar]) bad++;
  }
  ok(bad === 0 && sample > 0, `${rar} 固定 ${EXPECT[rar]} 条`,
    `样本 ${sample}，异常 ${bad}`);
}
ok(RARITY.rare.fixed > RARITY.magic.fixed && RARITY.legendary.fixed > RARITY.rare.fixed,
  '品质越高固定条数越多（灵 < 玄 < 神兵）');

/* ---------------- 2. 两类词条 key 不重复 ---------------- */
section('2. 固定与可洗练词条相互独立、key 不重复');
let dup = 0, sampleB = 0;
for (let i = 0; i < 400; i++) {
  const it = rollItem(1 + (i % 40), { rarity: ['magic', 'rare', 'legendary', 'set'][i % 4] });
  sampleB++;
  const fk = new Set((it.fixed || []).map(a => a.key));
  if ((it.affixes || []).some(a => fk.has(a.key))) dup++;
}
ok(dup === 0, '400 件装备无重复 key', `异常 ${dup}/${sampleB}`);

/* ---------------- 3. 数值打折 ---------------- */
section('3. 固定词条数值按 fixedMul 打折');
ok(FORGE.fixedMul > 0 && FORGE.fixedMul < 1, `FORGE.fixedMul = ${FORGE.fixedMul}（应 < 1）`);
{
  /* 同 ilvl 下，固定词条应明显低于可洗词条的平均值 */
  let fSum = 0, fN = 0, aSum = 0, aN = 0;
  for (let i = 0; i < 200; i++) {
    const it = rollItem(30, { rarity: 'legendary' });
    for (const a of it.fixed || []) { fSum += a.val; fN++; }
    for (const a of it.affixes || []) { aSum += a.val; aN++; }
  }
  const fAvg = fN ? fSum / fN : 0, aAvg = aN ? aSum / aN : 0;
  ok(fAvg > 0 && fAvg < aAvg * 0.85,
    `固定均值 ${fAvg.toFixed(1)} < 可洗均值 ${aAvg.toFixed(1)} × 0.85`);
}

/* ---------------- 4. 洗练 / 强化 / 升级都不动 fixed ---------------- */
section('4. 锻造操作不触碰固定词条');
{
  const it = rollItem(32, { rarity: 'legendary', cls: 'taoist' });
  const before = JSON.stringify(it.fixed);

  for (let i = 0; i < 30; i++) reforgeAffix(it, i % it.affixes.length);
  ok(JSON.stringify(it.fixed) === before, '洗练 30 次后 fixed 数组逐字节不变');

  for (let i = 0; i < 3; i++) enhanceItem(it);
  ok(JSON.stringify(it.fixed) === before, '强化 3 次后 fixed 不变');

  const r = upgradeAffix(it, 0);
  ok(!!r && JSON.stringify(it.fixed) === before, '单条升级后 fixed 不变');
}

/* ---------------- 5. 洗练不产出与固定词条重复的 key ---------------- */
section('5. 洗练不会洗出与固定词条重复的 key');
{
  let clash = 0, rounds = 0;
  for (let t = 0; t < 60; t++) {
    const it = rollItem(28, { rarity: 'rare' });
    const fk = new Set((it.fixed || []).map(a => a.key));
    for (let i = 0; i < 12; i++) {
      const a = reforgeAffix(it, i % it.affixes.length);
      rounds++;
      if (a && fk.has(a.key)) clash++;
    }
  }
  ok(clash === 0, `${rounds} 次洗练无重复 key`, `冲突 ${clash}`);
}
{
  const it = rollItem(28, { rarity: 'rare' });
  const fk = new Set((it.fixed || []).map(a => a.key));
  const targets = reforgeTargets(it, 0);
  ok(!targets.some(a => fk.has(a.key)), '候选词条池已排除固定词条占用的 key');
}

/* ---------------- 6. 属性 / 评分 / 战力计入固定词条 ---------------- */
section('6. 固定词条真实生效');
{
  const it = rollItem(30, { rarity: 'legendary' });
  const st = emptyStats();
  sumItemStats(it, st);
  let expect = 0;
  for (const a of it.fixed) expect += a.val;
  let expectKeySum = 0;
  for (const a of it.affixes) expectKeySum += a.val;
  /* 逐 key 对齐：固定 + 可洗 + 固有 + 基底，这里只核对词条部分 */
  let got = 0;
  for (const a of it.fixed) got += st[a.key];
  ok(got >= expect, `sumItemStats 已计入固定词条（${got} ≥ ${expect}）`);

  const m = itemStatMap(it);
  let mapHit = 0;
  for (const a of it.fixed) if ((m[a.key] || 0) > 0) mapHit++;
  ok(mapHit === it.fixed.length, 'itemStatMap 全部固定词条都在评分表里', `${mapHit}/${it.fixed.length}`);

  const bare = clone(it); bare.fixed = [];
  ok(itemScore(it) > itemScore(bare), `评分含固定词条（${itemScore(it)} > ${itemScore(bare)}）`);
  ok(itemPower(it) > itemPower(bare), '战力含固定词条');
}

/* ---------------- 7. 旧档迁移 ---------------- */
section('7. 旧存档（无 fixed 字段）自动补齐');
{
  for (const [rar, want] of Object.entries(EXPECT)) {
    if (rar === 'unique') continue;
    const it = rollItem(24, { rarity: rar, cls: 'warrior' });
    delete it.fixed;                       // 模拟 v1.1.5 及更早的存档
    normalizeItem(it);
    ok(Array.isArray(it.fixed) && it.fixed.length === want,
      `${rar} 旧档读入后补到 ${want} 条`, `实际 ${(it.fixed || []).length}`);
  }
  /* 补齐后仍不能与已有可洗词条撞 key */
  let clash = 0;
  for (let i = 0; i < 60; i++) {
    const it = rollItem(30, { rarity: 'legendary' });
    delete it.fixed;
    normalizeItem(it);
    const fk = new Set(it.fixed.map(a => a.key));
    if (it.affixes.some(a => fk.has(a.key))) clash++;
  }
  ok(clash === 0, '旧档补齐后不与可洗词条重复', `冲突 ${clash}`);
}
{
  /* 已损坏的 fixed（非法 key / 非数字）应被清掉再补 */
  const it = rollItem(30, { rarity: 'rare' });
  it.fixed = [{ key: 'not_a_stat', val: 5 }, { key: 'str', val: 'x' }];
  normalizeItem(it);
  ok(it.fixed.every(a => STATS[a.key] && isFinite(a.val)), '非法固定词条被清洗');
  ok(it.fixed.length === EXPECT.rare, '清洗后重新补齐到应有条数', `实际 ${it.fixed.length}`);
}

/* ---------------- 8. 品质提升 ---------------- */
section('8. 品质提升时固定条数同步增加');
{
  /* 模拟品质链 common → magic：fixed 应 0 → 1 */
  const it = rollItem(10, { rarity: 'common', cls: 'mage' });
  ok(it.fixed.length === 0, '凡品初始 0 条固定');
  it.rarity = 'magic';
  fillFixedAffixes(it);
  ok(it.fixed.length === 1, '升到灵品后补到 1 条', `实际 ${it.fixed.length}`);
  it.rarity = 'rare';
  fillFixedAffixes(it);
  ok(it.fixed.length === 2, '升到玄品后补到 2 条', `实际 ${it.fixed.length}`);
  /* 再调用一次不应重复补 */
  const n = fillFixedAffixes(it);
  ok(n === 0 && it.fixed.length === 2, '已达标时 fillFixedAffixes 不重复补');
}

/* ---------------- 9. 存档往返 ---------------- */
section('9. 存档 JSON 往返');
{
  const it = rollItem(35, { rarity: 'legendary' });
  const before = JSON.stringify(it.fixed);
  const round = normalizeItem(JSON.parse(JSON.stringify(it)));
  ok(JSON.stringify(round.fixed) === before, 'fixed 原样保留');
  ok(round.fixed.every(a => a.fixed === true), '固定词条带 fixed 标记');
  ok(keysOf(round.fixed) === keysOf(it.fixed), 'key 顺序与数量一致');
}

/* ---------------- 10. 传世不叠加 ---------------- */
section('10. 传世不叠加 fixed');
{
  const fake = { rarity: 'unique', fixed: [] };
  ok(fixedAffixCount(fake) === 0, 'fixedAffixCount(传世) = 0');
  let hasFixed = 0, n = 0;
  for (let i = 0; i < 120; i++) {
    const it = rollItem(40, { rarity: 'unique' });
    if (it.rarity !== 'unique') continue;
    n++;
    if ((it.fixed || []).length) hasFixed++;
  }
  ok(n > 0 ? hasFixed === 0 : true, `真传世样本 ${n} 件，全部无 fixed`, `含 fixed ${hasFixed}`);

  /* 传世的固定属性必须仍然生效（走 uniqueStats） */
  let withStats = 0;
  for (let i = 0; i < 120; i++) {
    const it = rollItem(40, { rarity: 'unique' });
    if (it.rarity === 'unique' && it.uniqueStats && Object.keys(it.uniqueStats).length) withStats++;
  }
  ok(withStats > 0, '传世的 uniqueStats 未被影响', `样本 ${withStats} 件带固定属性`);
}

/* ---------------- 11. 渲染 ---------------- */
section('11. 提示框与洗练面板渲染');
{
  /* itemTooltip 里会读 Game.state.setCount，给个空壳即可 */
  ctx.Game = { state: { setCount: {} } };
  const it = rollItem(30, { rarity: 'legendary' });
  let html = '';
  try { html = itemTooltip(it); } catch (e) { html = ''; console.log('    (渲染异常: ' + e.message + ')'); }
  ok(html.indexOf('tt-faff') >= 0, '提示框含固定词条区块');
  ok((html.match(/tt-faff-tag/g) || []).length === it.fixed.length,
    `固定标签数量 = ${it.fixed.length}`);

  const plain = rollItem(1, { rarity: 'common', cls: 'warrior' });
  plain.fixed = [];
  let html2 = '';
  try { html2 = itemTooltip(plain); } catch (e) { }
  ok(html2.indexOf('tt-faff') < 0, '凡品（0 条固定）不输出空区块');
}
{
  const starter = makeStarterSet('warrior');
  ok(starter.weapon && Array.isArray(starter.weapon.fixed), '初始武器结构正常');
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + '─'.repeat(46));
console.log(`  通过 ${pass} / ${pass + fail}` + (fail ? `　失败 ${fail}` : '　全部通过'));
process.exit(fail ? 1 : 0);
