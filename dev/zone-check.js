/* ============================================================
 * dev/zone-check.js —— M12 区域数据体检（离线，node 直跑）
 *
 * 区域化的数据一旦有错，玩家就会卡在墙里、走不到首领、或者刷怪刷到墙外。
 * 这些错误在浏览器里很难一眼看出来，但在这里全是确定性的检查：
 *
 *   1. 越界：每个 zone 是否都在地图范围内（旧逻辑的 lim = size × 0.47）
 *   2. 连通：从入口出发 BFS，所有 zone 是否可达
 *   3. 重叠：相邻 zone 必须是「有面积的重叠」，不能只是相切
 *   4. 落点：传送阵在入口 zone 内、首领在 sanctum 内、NPC 在村庄内
 *   5. 刷怪：每张图的刷怪总数、每个 zone 的怪种是否存在于该图
 *
 * 用法：node dev/zone-check.js
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

const MAPS = g('MAPS'), ZONES = g('MAP_ZONES'), BOSSES = g('BOSSES'), NPCS = g('NPCS');
const MAP_BOSS_POS = g('MAP_BOSS_POS');
const zoneContains = g('zoneContains'), mapZones = g('mapZones');

let bad = 0, warn = 0;
const fail = (m) => { console.log('  ✗ ' + m); bad++; };
const soft = (m) => { console.log('  ! ' + m); warn++; };

/* 两个 zone 的重叠面积（矩形-矩形精确；含圆时用采样估计） */
function overlapArea(a, b) {
  if (a.type === 'rect' && b.type === 'rect') {
    const w = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const h = Math.min(a.z + a.h / 2, b.z + b.h / 2) - Math.max(a.z - a.h / 2, b.z - b.h / 2);
    return (w > 0 && h > 0) ? w * h : 0;
  }
  /* 采样法：在两者包围盒交集内撒点，数同时在两个 zone 内的比例 */
  const bb = (z) => z.type === 'circle'
    ? { x0: z.x - z.r, x1: z.x + z.r, z0: z.z - z.r, z1: z.z + z.r }
    : { x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.h / 2, z1: z.z + z.h / 2 };
  const A = bb(a), B = bb(b);
  const x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1);
  const z0 = Math.max(A.z0, B.z0), z1 = Math.min(A.z1, B.z1);
  if (x1 <= x0 || z1 <= z0) return 0;
  const N = 40;
  let hit = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / N;
      const z = z0 + (z1 - z0) * (j + 0.5) / N;
      if (zoneContains(a, x, z) && zoneContains(b, x, z)) hit++;
    }
  }
  return (hit / (N * N)) * (x1 - x0) * (z1 - z0);
}

for (const mapId in ZONES) {
  const cfg = MAPS[mapId];
  if (!cfg) { fail(mapId + '：MAPS 里没有这张图'); continue; }
  const zones = ZONES[mapId].zones;
  const lim = cfg.size * 0.47;
  console.log('\n【' + cfg.name + '】size ' + cfg.size + '  可走半径上限 ' + lim.toFixed(1) + '  ' + zones.length + ' 个区域');

  /* 1. 越界 */
  for (const z of zones) {
    const rr = z.type === 'circle'
      ? Math.hypot(z.x, z.z) + z.r
      : Math.hypot(Math.abs(z.x) + z.w / 2, Math.abs(z.z) + z.h / 2);
    if (rr > lim + 0.01) fail(z.id + ' 越界：最远点 ' + rr.toFixed(1) + ' > ' + lim.toFixed(1));
  }

  /* 2. 连通（重叠面积 > 4 ㎡ 才算连通） */
  const entry = ZONES[mapId].entry;
  const start = zones.find(z => z.id === entry);
  if (!start) { fail('入口 zone「' + entry + '」不存在'); continue; }
  const seen = new Set([start.id]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const z of zones) {
      if (seen.has(z.id)) continue;
      if (overlapArea(cur, z) > 4) { seen.add(z.id); queue.push(z); }
    }
  }
  for (const z of zones) {
    if (!seen.has(z.id)) fail(z.id + ' 从入口不可达（没有面积足够的重叠）');
  }

  /* 3. 相切检查：可达但重叠面积很小 → 玩家可能卡缝 */
  for (const z of zones) {
    if (z.id === start.id) continue;
    let best = 0, bestId = '';
    for (const o of zones) {
      if (o.id === z.id) continue;
      const a = overlapArea(o, z);
      if (a > best) { best = a; bestId = o.id; }
    }
    if (best > 0 && best < 8) soft(z.id + ' 与 ' + bestId + ' 只有 ' + best.toFixed(1) + ' ㎡ 重叠，接缝可能卡人');
  }

  /* 4. 传送阵在入口 zone 内 */
  if (cfg.portal) {
    if (!zoneContains(start, cfg.portal.x, cfg.portal.z)) {
      fail('传送阵 (' + cfg.portal.x + ',' + cfg.portal.z + ') 不在入口 zone「' + entry + '」内');
    }
  }

  /* 5. 首领在 sanctum 内 */
  const sanctum = zones.find(z => z.kind === 'boss');
  if (cfg.bosses && cfg.bosses.length) {
    if (!sanctum) fail('有 ' + cfg.bosses.length + ' 个首领但没有 sanctum 区域');
    else {
      for (const bid of cfg.bosses) {
        const p = MAP_BOSS_POS[bid];
        if (!p) { fail('首领 ' + bid + ' 没有落点'); continue; }
        if (!zoneContains(sanctum, p[0], p[1])) fail('首领 ' + bid + ' 落点 (' + p[0] + ',' + p[1] + ') 在 sanctum 外');
      }
    }
  }

  /* 6. 刷怪：怪种必须属于这张图 */
  const pool = cfg.spawns || [];
  let total = 0;
  for (const z of zones) {
    if (!z.spawns) continue;
    total += z.spawns.count || 0;
    for (const k of (z.spawns.kinds || [])) {
      if (pool.indexOf(k) < 0) fail(z.id + ' 刷的怪「' + k + '」不在本图 spawns 里');
    }
  }
  if (!cfg.safe) {
    if (total === 0) fail('没有任何区域配了刷怪');
    else console.log('  刷怪合计 ' + total + ' 只（旧 spawnCount ' + (cfg.spawnCount || '-') + '）');
    if (total < (cfg.spawnCount || 14) * 0.8) soft('刷怪数比旧值少 20% 以上，地图会显得空');
  }

  /* 7. 村庄：NPC 必须在可走区域内 */
  if (cfg.npcs) {
    for (const id of cfg.npcs) {
      const n = NPCS[id];
      if (!n || !n.pos) continue;
      if (!zoneContains(start, n.pos[0], n.pos[1])) {
        fail('NPC ' + id + ' 位置 (' + n.pos[0] + ',' + n.pos[1] + ') 在区域外');
      }
    }
  }
}

/* 8. 每张图的 zone 数量符合设计（4~9：房间 + 走廊） */
console.log('');
for (const mapId in ZONES) {
  const n = ZONES[mapId].zones.length;
  const rooms = ZONES[mapId].zones.filter(z => z.kind !== 'link').length;
  if (rooms < 4) soft(mapId + ' 只有 ' + rooms + ' 个房间，区域化意义不大');
  if (n > 12) soft(mapId + ' 有 ' + n + ' 个 zone，渲染与小地图会偏挤');
}

console.log('\n' + (bad ? '❌ ' + bad + ' 项失败' : '✅ 全部通过') + (warn ? '（' + warn + ' 项提醒）' : ''));
process.exit(bad ? 1 : 0);
