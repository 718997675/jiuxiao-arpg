/* ============================================================
 * S1 装备系统验证（node 直跑，不依赖浏览器）
 *
 *   node dev/test-items.js
 *
 * 覆盖：
 *   1. 210 件基底是否都真的能被滚出来（不是写了没人用）
 *   2. 64 条词缀是否都能出现，且同一件装备不重复
 *   3. 每件装备的固有属性是否都指向真实属性 key
 *   4. computePlayerStats 是否无 NaN / 无负值
 *   5. 数值曲线是否随 ilvl 单调（防止表写歪导致 40 级不如 20 级）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const { loadData } = require('./_load');
const ctx = loadData();

const pick = name => vm.runInContext(name, ctx);
const STATS = pick('STATS');
const AFFIXES = pick('AFFIXES');
const ARMOR_BASES = pick('ARMOR_BASES');
const WEAPON_BASES = pick('WEAPON_BASES');
const OFFHAND_BASES = pick('OFFHAND_BASES');
const rollItem = pick('rollItem');
const computePlayerStats = pick('computePlayerStats');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + msg + (extra ? '  →  ' + extra : '')); }
};

/* ---------------- 1. 滚 1 万件 ---------------- */
const N = 20000;   /* 20000：最稀的词缀（tier3 / 部位限定）也能稳定出现，1 万时会有抽样噪声 */
const names = new Map();          // baseName -> 次数
const affixHit = new Map();       // affix key -> 次数
const implicitHit = new Map();    // 固有 key -> 次数
let dupAffix = 0, badImplicit = 0, badAffix = 0, nanItem = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const ilvl = 1 + Math.floor(Math.random() * 40);
  const it = rollItem(ilvl, { magicFind: Math.random() * 200 });
  names.set(it.slot + '|' + it.baseName, (names.get(it.slot + '|' + it.baseName) || 0) + 1);
  if (it.implicit) {
    if (!STATS[it.implicit.key]) badImplicit++;
    implicitHit.set(it.implicit.key, (implicitHit.get(it.implicit.key) || 0) + 1);
  }
  const seen = new Set();
  for (const a of it.affixes) {
    if (!STATS[a.key]) badAffix++;
    if (seen.has(a.key)) dupAffix++;
    seen.add(a.key);
    affixHit.set(a.key, (affixHit.get(a.key) || 0) + 1);
    if (!isFinite(a.val) || a.val <= 0) nanItem++;
  }
  if (!isFinite(it.value) || !isFinite(it.ilvl)) nanItem++;
}
const ms = Date.now() - t0;

/* 理论基底总数 */
let totalBases = 0;
for (const s in ARMOR_BASES) for (const tier of ARMOR_BASES[s]) totalBases += tier.length;
for (const c in WEAPON_BASES) for (const tier of WEAPON_BASES[c]) totalBases += tier.length;
for (const c in OFFHAND_BASES) for (const tier of OFFHAND_BASES[c]) totalBases += tier.length;

console.log(`\n滚装 ${N} 次，耗时 ${ms}ms（${(N / (ms / 1000) / 1000).toFixed(1)} 万件/秒）\n`);
console.log('基底覆盖', names.size, '/', totalBases, '（多出的是传世 / 法器，它们不走基底表）');
console.log('词缀覆盖', affixHit.size, '/', AFFIXES.length);
console.log('固有属性覆盖', implicitHit.size);

ok(nanItem === 0, '装备数值出现 NaN/负值', 'count=' + nanItem);
ok(dupAffix === 0, '同一件装备出现重复词缀', 'count=' + dupAffix);
ok(badAffix === 0, '词缀引用了不存在的属性 key', 'count=' + badAffix);
ok(badImplicit === 0, '固有属性引用了不存在的属性 key', 'count=' + badImplicit);

/* 覆盖率的判断：1 万件里，任何一种基底的期望出现次数都远大于 1，
 * 所以只要表里有这件，就必然出现过。没出现的就是「写了但滚不到」。 */
const missingBase = [];
for (const s in ARMOR_BASES) {
  for (const tier of ARMOR_BASES[s]) for (const v of tier) if (!names.has(s + '|' + v[0])) missingBase.push(s + ':' + v[0]);
}
for (const c in WEAPON_BASES) {
  for (const tier of WEAPON_BASES[c]) for (const v of tier) if (!names.has('weapon|' + v.name)) missingBase.push(c + ':' + v.name);
}
for (const c in OFFHAND_BASES) {
  for (const tier of OFFHAND_BASES[c]) for (const v of tier) if (!names.has('offhand|' + v[0])) missingBase.push('off:' + c + ':' + v[0]);
}
/* 只比「表里有的都滚出来了」，不比总数：传世 / 法器有自己的命名，会额外占 names */
ok(missingBase.length === 0, '有基底滚不出来', missingBase.slice(0, 8).join(', '));

const missingAffix = AFFIXES.filter(a => !affixHit.has(a.key)).map(a => a.key);
ok(missingAffix.length === 0, '有词缀永远滚不到', missingAffix.join(', '));

/* ---------------- 2. 词缀概率分布 ---------------- */
const tierWant = { 1: 0, 2: 0, 3: 0 };
for (const a of AFFIXES) {
  const n = affixHit.get(a.key) || 0;
  tierWant[a.tier] = (tierWant[a.tier] || 0) + n;
}
const totalAffix = Object.values(tierWant).reduce((a, b) => a + b, 0);
console.log('\ntier 实际占比',
  Object.entries(tierWant).map(([t, n]) => `${t}:${(n / totalAffix * 100).toFixed(1)}%`).join('  '),
  '（设定 62 / 28 / 10）');

/* ---------------- 3. 属性汇总无 NaN ---------------- */
const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon', 'offhand'];
let statNaN = 0, statNeg = 0;
const clsList = ['warrior', 'mage', 'taoist'];
for (let i = 0; i < 500; i++) {
  const cls = clsList[i % 3];
  const eq = {};
  for (const s of slots) eq[s] = rollItem(1 + Math.floor(Math.random() * 40), { cls, rarity: 'legendary' });
  const p = { cls, level: 1 + Math.floor(Math.random() * 40), equipment: eq };
  const st = computePlayerStats(p);
  for (const k in st) {
    const v = st[k];
    if (typeof v !== 'number') continue;
    if (!isFinite(v)) { statNaN++; if (statNaN < 4) console.log('   NaN 属性:', k, v); }
    if (v < 0) { statNeg++; if (statNeg < 4) console.log('   负值属性:', k, v); }
  }
  if (!(st.hpMax > 0) || !(st.mpMax > 0) || !(st.atk > 0)) statNaN++;
}
ok(statNaN === 0, '属性汇总出现 NaN / 非正值');
ok(statNeg === 0, '属性汇总出现负值');

/* ---------------- 4. 数值曲线 ---------------- */
const median = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('\nilvl 曲线（白装中位数）');
console.log('ilvl   武器DPS   战甲护甲   头盔护甲');
const curve = {};
for (const lv of [1, 10, 20, 30, 40]) {
  const dps = [], arm = [], hlm = [];
  for (let i = 0; i < 400; i++) {
    const w = rollItem(lv, { slot: 'weapon', cls: 'warrior', rarity: 'common' });
    dps.push((w.baseDmg[0] + w.baseDmg[1]) / 2 / w.speed);
    arm.push(rollItem(lv, { slot: 'chest', rarity: 'common' }).baseArmor);
    hlm.push(rollItem(lv, { slot: 'helm', rarity: 'common' }).baseArmor);
  }
  curve[lv] = { dps: median(dps), arm: median(arm), hlm: median(hlm) };
  console.log(
    String(lv).padEnd(6),
    curve[lv].dps.toFixed(1).padEnd(10),
    String(curve[lv].arm).padEnd(11),
    curve[lv].hlm
  );
}
const lvs = [1, 10, 20, 30, 40];
const mono = k => lvs.every((lv, i) => i === 0 || curve[lv][k] > curve[lvs[i - 1]][k]);
ok(mono('dps'), '武器 DPS 不是随 ilvl 单调递增');
ok(mono('arm'), '战甲护甲不是随 ilvl 单调递增');
ok(mono('hlm'), '头盔护甲不是随 ilvl 单调递增');

/* 涨幅要「前陡后缓」：低等级换装快，低档涨幅大是正常的；但每档都必须递增、
 * 单档不超过 3.5 倍，且 1→40 级总成长在 12~35 倍（ARPG 装备驱动就是这个量级）。 */
const jump = (a, b) => b / a;
const ratios = [];
for (let i = 1; i < lvs.length; i++) {
  const r = jump(curve[lvs[i - 1]].dps, curve[lvs[i]].dps);
  ratios.push(r);
  ok(r > 1.05 && r < 3.5, `武器 DPS 在 ilvl ${lvs[i - 1]}→${lvs[i]} 涨幅异常`, r.toFixed(2));
}
ok(ratios[0] >= ratios[ratios.length - 1], '武器 DPS 涨幅不是前陡后缓', ratios.map(r => r.toFixed(2)).join(' → '));
const totalDps = curve[40].dps / curve[1].dps;
ok(totalDps > 12 && totalDps < 35, '武器 1→40 级总成长倍率超出合理区间', totalDps.toFixed(1) + 'x');
console.log('武器涨幅', ratios.map(r => r.toFixed(2) + 'x').join(' → '), ` 总计 ${totalDps.toFixed(1)}x`);

/* ---------------- 5. 词缀数值量级 ---------------- */
console.log('\n词缀量级抽检（ilvl 40）');
const sample = ['dmgAll', 'crit', 'dodge', 'executeDmg', 'hp', 'pickupRadius', 'cdrFlat', 'block'];
for (const key of sample) {
  const a = AFFIXES.find(x => x.key === key);
  if (!a) continue;
  const vals = [];
  for (let i = 0; i < 200; i++) {
    const it = rollItem(40, { slot: 'chest', rarity: 'legendary' });
    const hit = it.affixes.find(x => x.key === key);
    if (hit) vals.push(hit.val);
  }
  if (!vals.length) { console.log(`  ${key}: 未出现（池子太大，正常）`); continue; }
  const s = STATS[key];
  console.log(`  ${s.label.padEnd(12)} ${median(vals)}${s.pct ? '%' : ''}  (${Math.min(...vals)}~${Math.max(...vals)})`);
}

console.log(`\n${fail === 0 ? '✓ 全部通过' : '✗ 有失败项'}  ${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
