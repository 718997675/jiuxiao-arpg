/* ============================================================
 * dev/zone-density.js —— M3 面积 / 密度专项体检（离线，node 直跑）
 *
 * 为什么单独一个文件、而不是塞进 zone-check：
 *   zone-check 管的是「走不走得通」（越界 / 连通 / 接缝 / 落点），
 *   这里管的是「好不好玩」（多大、多密、匀不匀）。
 *   两者改动的动机完全不同：修连通性是改坐标，调密度是改 size / 刷怪权重。
 *   混在一起的话，调一次密度会淹在 11 张图的连通性日志里。
 *
 * 校验的是 docs/ACT-EXPANSION-PLAN.md §5.1 的三条硬指标：
 *   1. 可走面积        16,000 ~ 24,000 ㎡
 *   2. 刷怪密度        380 ~ 450 ㎡/只
 *   3. 单图刷怪        40 ~ 56 只
 * 外加台账要求的「每图每区 max/min ≤ 1.6」。
 *
 * 只对骨架图（MAP_SPECS）硬性判定：老图 size 130~140、整图 10~12 只，
 * 三条指标一条都不适用 —— 它们就是 M3 要替换掉的东西，不该拿新尺子量。
 *
 * 用法：
 *   node dev/zone-density.js            只看报告 + 判定
 *   node dev/zone-density.js --advise 270 295 300
 *                                       给每种骨架在指定 size 下算一遍建议值，
 *                                       用来给剩下 21 张图选尺寸
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Number, String, Array, Object, parseFloat, parseInt, isFinite };
vm.createContext(ctx);
const g = (e) => vm.runInContext(e, ctx);

for (const f of ['src/data/data-core.js', 'src/data/data-monsters.js', 'src/data/data-world.js', 'src/data/data-maps.js']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log('缺少 ' + f); process.exit(1); }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('FAIL ' + f + ': ' + e.message); process.exit(1); }
}

const MAPS = g('MAPS'), MAP_ZONES = g('MAP_ZONES'), MAP_SPECS = g('MAP_SPECS');
const zonesOfMap = g('zonesOfMap'), zoneContains = g('zoneContains');
const suggestSpawnTotal = g('suggestSpawnTotal'), ARCHETYPE_COVERAGE = g('ARCHETYPE_COVERAGE');

/* §5.1 目标区间 */
const T = {
  areaMin: 16000, areaMax: 24000,
  perMobMin: 380, perMobMax: 450,
  mobMin: 40, mobMax: 56,
  zoneMin: 12, zoneMax: 16,
  ratioMax: 1.6
};

/* 可走面积：在可走方框（±size×0.47）里撒点，数落在任一 zone 内的比例。
 * 用 120×120 = 14,400 个采样点，误差 < 1%，跑 11 张图约 30ms。 */
function walkableArea(zones, size, N) {
  const lim = size * 0.47;
  const n = N || 120;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const x = -lim + (2 * lim) * (i + 0.5) / n;
    for (let j = 0; j < n; j++) {
      const z = -lim + (2 * lim) * (j + 0.5) / n;
      for (let k = 0; k < zones.length; k++) {
        if (zoneContains(zones[k], x, z)) { hit++; break; }
      }
    }
  }
  return hit / (n * n) * (2 * lim) * (2 * lim);
}

/* 一张图的全部指标 */
function measure(mapId) {
  const cfg = MAPS[mapId];
  const built = zonesOfMap(mapId);
  if (!cfg || !built) return null;
  const zones = built.zones;
  const area = walkableArea(zones, cfg.size);
  let total = 0, zmax = 0, zmin = Infinity, zero = 0, rooms = 0;
  for (const z of zones) {
    const c = z.spawns ? (z.spawns.count || 0) : 0;
    total += c;
    if (c > 0) { zmax = Math.max(zmax, c); zmin = Math.min(zmin, c); }
    else zero++;
    if (z.kind !== 'link') rooms++;
  }
  const spec = MAP_SPECS[mapId];
  return {
    id: mapId, name: cfg.name, size: cfg.size, archetype: spec ? spec.archetype : '手写',
    zones: zones.length, rooms: rooms, zeroZones: zero,
    area: area, total: total,
    perMob: total ? area / total : 0,
    ratio: zmin < Infinity ? zmax / zmin : 0,
    coverage: area / Math.pow(2 * cfg.size * 0.47, 2)
  };
}

/* ---------------- --advise：给未来 21 张图选尺寸 ---------------- */
if (process.argv.indexOf('--advise') > 0) {
  const sizes = process.argv.slice(process.argv.indexOf('--advise') + 1)
    .map(Number).filter(n => n > 0);
  const list = sizes.length ? sizes : [270, 280, 290, 300];
  console.log('\n各骨架在不同 size 下的建议刷怪数（目标 400㎡/只）');
  console.log('（面积按 ARCHETYPE_COVERAGE 常数估算，不是采样，所以是「规划值」）\n');
  const head = ['骨架'.padEnd(9), '覆盖率'].concat(list.map(s => ('size ' + s).padStart(13)));
  console.log(head.join('  '));
  console.log('-'.repeat(head.join('  ').length));
  for (const arch in ARCHETYPE_COVERAGE) {
    const cov = ARCHETYPE_COVERAGE[arch];
    const row = [arch.padEnd(9), (cov * 100).toFixed(1).padStart(5) + '%'];
    for (const size of list) {
      const box = 2 * size * 0.47;
      const area = cov * box * box;
      const n = suggestSpawnTotal(arch, size);
      const perMob = area / n;
      /* 打勾条件：面积与密度同时达标 */
      const ok = area >= T.areaMin && area <= T.areaMax && perMob >= T.perMobMin && perMob <= T.perMobMax;
      row.push((n + '只/' + perMob.toFixed(0) + (ok ? '✓' : ' ')).padStart(13));
    }
    console.log(row.join('  '));
  }
  console.log('\n✓ = 面积 ' + T.areaMin + '~' + T.areaMax + '㎡ 且密度 ' + T.perMobMin + '~' + T.perMobMax + '㎡/只 同时达标');
  console.log('size < 285 时两个条件数学上互斥（覆盖率只有 ~21%），别用。\n');
  process.exit(0);
}

/* ---------------- 主报告 ---------------- */
let bad = 0, warn = 0;
const fail = (m) => { console.log('  ✗ ' + m); bad++; };
const soft = (m) => { console.log('  ! ' + m); warn++; };

const rows = [];
for (const mapId in MAPS) {
  const r = measure(mapId);
  if (!r || !r.zones) continue;
  rows.push(r);
}

console.log('\n图名            骨架     size  区数  面积㎡   怪  密度㎡/只  max/min');
console.log('-'.repeat(74));
for (const r of rows) {
  const spec = MAP_SPECS[r.id];
  const flag = spec ? '' : ' (老图)';
  console.log(
    (r.name + flag).padEnd(16) +
    String(r.archetype).padEnd(8) +
    String(r.size).padStart(4) +
    String(r.zones).padStart(6) +
    r.area.toFixed(0).padStart(9) +
    String(r.total).padStart(5) +
    (r.total ? r.perMob.toFixed(0) : '-').padStart(9) +
    (r.ratio ? r.ratio.toFixed(2) : '-').padStart(9)
  );
}

/* 只判定骨架图 */
console.log('\n【骨架图硬指标】§5.1：面积 16000~24000㎡ · 密度 380~450㎡/只 · 刷怪 40~56 · 区数 12~16');
for (const r of rows) {
  if (!MAP_SPECS[r.id]) continue;
  const errs = [];
  if (r.area < T.areaMin) errs.push('面积 ' + r.area.toFixed(0) + ' < ' + T.areaMin);
  if (r.area > T.areaMax) errs.push('面积 ' + r.area.toFixed(0) + ' > ' + T.areaMax);
  if (r.perMob < T.perMobMin) errs.push('密度 ' + r.perMob.toFixed(0) + ' 太密（<' + T.perMobMin + '）');
  if (r.perMob > T.perMobMax) errs.push('密度 ' + r.perMob.toFixed(0) + ' 太稀（>' + T.perMobMax + '）');
  if (r.total < T.mobMin) errs.push('刷怪 ' + r.total + ' < ' + T.mobMin);
  if (r.total > T.mobMax) errs.push('刷怪 ' + r.total + ' > ' + T.mobMax);
  if (r.zones < T.zoneMin) errs.push('区数 ' + r.zones + ' < ' + T.zoneMin);
  if (r.zones > T.zoneMax) errs.push('区数 ' + r.zones + ' > ' + T.zoneMax);
  if (r.ratio > T.ratioMax) errs.push('max/min ' + r.ratio.toFixed(2) + ' > ' + T.ratioMax);
  if (errs.length) { fail(r.name + '：' + errs.join('；')); }
  else console.log('  ✓ ' + r.name + '  面积 ' + r.area.toFixed(0) + '㎡ · ' + r.total + ' 只 · ' +
    r.perMob.toFixed(0) + '㎡/只 · max/min ' + r.ratio.toFixed(2));
}

/* 老图只做体检提醒，不判失败 */
console.log('\n【老图参考】M3 之后要被骨架图替换，这里只看不改');
for (const r of rows) {
  if (MAP_SPECS[r.id] || !r.total) continue;
  if (r.area < T.areaMin) soft(r.name + ' 面积 ' + r.area.toFixed(0) + '㎡，只有目标下限的 ' +
    (r.area / T.areaMin * 100).toFixed(0) + '%');
}

console.log('\n' + (bad ? '❌ ' + bad + ' 张图不达标' : '✅ 骨架图全部达标') +
  (warn ? '（' + warn + ' 项参考提醒）' : ''));
process.exit(bad ? 1 : 0);
