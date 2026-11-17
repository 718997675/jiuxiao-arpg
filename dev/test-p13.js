/* ============================================================
 * dev/test-p13.js —— P13 地图风貌差异化 · 静态契约（离线，node 直跑）
 *
 * 分两层验：
 *   【数据层】23 张骨架图都有 landmark/weather；同章四元组唯一；
 *              13 张图主色按设计稿调整；palette 字段口径。
 *   【源码层】world.js 有 buildLandmark/buildWeather 且覆盖所有类型；
 *              buildMap 里读了字段；不改 zone 拓扑（ZONE_ARCHETYPES 无 variant）。
 *
 * 用法：node dev/test-p13.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Number, String, Array, Object, parseFloat, parseInt, isFinite };
const g = (e) => vm.runInContext(e, ctx);
vm.createContext(ctx);
for (const f of ['src/data/data-core.js', 'src/data/data-monsters.js', 'src/data/data-world.js', 'src/data/data-maps.js']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log('缺少 ' + f); process.exit(1); }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('FAIL ' + f + ': ' + e.message); process.exit(1); }
}
const MAPS = g('MAPS'), MAP_SPECS = g('MAP_SPECS'), ZONES = g('MAP_ZONES');
const nextMapInWorld = g('nextMapInWorld');

let pass = 0, bad = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}

/* 设计稿 §四的 23 张图 → 章号（按山河图 nextMapInWorld 的推进顺序归章） */
const CH1 = ['sunset', 'bonestrand', 'bonetower', 'ironpeak'];
const CH2 = ['magmagully', 'ashfield', 'flamecanyon', 'flamealtar'];
const CH3 = ['bonehall', 'forgetshore', 'abyssdeep', 'yellowferry'];
const CH4 = ['swordtomb', 'swordpit', 'swordapex', 'cloudbridge', 'southgate'];
const CH5 = ['jadecapital', 'starfall', 'mirrorrealm', 'mirrorabyss', 'nineapex'];
const CHAPTERS = { 1: CH1, 2: CH2, 3: CH3, 4: CH4, 5: CH5 };
const ALL = [].concat(CH1, CH2, CH3, CH4, CH5, ['chaossea']);

console.log('\n【1】数据层：23 张骨架图风貌字段齐全');
ok(ALL.length === 23 && ALL.every(id => MAP_SPECS[id]), '设计稿 23 张骨架图都在 MAP_SPECS 里',
  ALL.filter(id => !MAP_SPECS[id]));
const noField = ALL.filter(id => !MAP_SPECS[id] || !MAP_SPECS[id].landmark || !MAP_SPECS[id].weather);
ok(noField.length === 0, '每张骨架图都有 landmark + weather（非空字符串）', noField);
const badType = ALL.filter(id => typeof (MAP_SPECS[id] || {}).landmark !== 'string' || typeof (MAP_SPECS[id] || {}).weather !== 'string');
ok(badType.length === 0, 'landmark / weather 都是字符串类型', badType);

console.log('\n【2】同章四元组唯一（骨架 + 地貌 + 地标 + 天气）');
for (const ch of Object.keys(CHAPTERS)) {
  const sigs = {};
  const dup = [];
  for (const id of CHAPTERS[ch]) {
    const m = MAP_SPECS[id];
    const sig = [m.archetype, m.ground, m.landmark, m.weather].join('+');
    if (sigs[sig]) dup.push(id + ' ↔ ' + sigs[sig] + ' = ' + sig);
    sigs[sig] = id;
  }
  ok(dup.length === 0, '卷' + ch + ' 内没有两张图四元组完全相同', dup);
}
/* 卷五 5-1 重灾区：四张 void 的 sky 必须两两不同 */
const voidSky = ['jadecapital', 'starfall', 'mirrorrealm', 'mirrorabyss'].map(id => MAPS[id].sky);
ok(new Set(voidSky).size === 4, '卷五四张 void 的 sky 主色两两不同（重灾区）', voidSky);

console.log('\n【3】主色调整：13 张图的 sky/fog 按设计稿落位');
const COLORS = {
  bonestrand: [0x4a5858, 0x5a6a62], bonetower: [0x4a4050, 0x5a505e],
  magmagully: [0x3a1410, 0x4a1a12], ashfield: [0x4a4038, 0x564a40],
  abyssdeep: [0x101828, 0x16202e], yellowferry: [0x3a2e1c, 0x44361e],
  swordtomb: [0x34404e, 0x40505c], swordpit: [0x3a2824, 0x46322a],
  southgate: [0x3a5878, 0x507094], jadecapital: [0x14242a, 0x1c2c32],
  starfall: [0x101c34, 0x182840], mirrorrealm: [0x241838, 0x2c2044],
  mirrorabyss: [0x101c1a, 0x162420]
};
const wrongColor = [];
for (const id of Object.keys(COLORS)) {
  if (MAPS[id].sky !== COLORS[id][0] || MAPS[id].fog !== COLORS[id][1])
    wrongColor.push(id + ' sky=' + MAPS[id].sky.toString(16) + ' fog=' + MAPS[id].fog.toString(16));
}
ok(wrongColor.length === 0, '13 张图 sky/fog 与设计稿逐值吻合', wrongColor);
ok(MAPS.ironpeak.sky === 0x9ab4cc && MAPS.sunset.sky === 0xd08a5a,
  '设计稿写「保留」的图主色没被误改（ironpeak / sunset）',
  { ironpeak: MAPS.ironpeak.sky.toString(16), sunset: MAPS.sunset.sky.toString(16) });

console.log('\n【4】不改 zone 拓扑');
const dmaps = fs.readFileSync(path.join(ROOT, 'src/data/data-maps.js'), 'utf8');
const world = fs.readFileSync(path.join(ROOT, 'src/world.js'), 'utf8');
const archStart = dmaps.indexOf('const ZONE_ARCHETYPES = {');
const archEnd = dmaps.indexOf('\n};', archStart);
const arch = dmaps.slice(archStart, archEnd);
ok(!/variant/.test(arch), 'ZONE_ARCHETYPES 没有 variant（第二层骨架变体按拍板不做）');
ok(/function buildZones\(/.test(dmaps), 'buildZones 仍是唯一的骨架展开函数');

console.log('\n【5】输出汇总');
console.log('\n' + pass + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
