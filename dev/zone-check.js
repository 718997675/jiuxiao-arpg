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
const MAP_SPECS = g('MAP_SPECS');
const zoneContains = g('zoneContains'), mapZones = g('mapZones');
const zonesOfMap = g('zonesOfMap'), bossPosOf = g('bossPosOf');

/* [M3] 要校验的图 = 手写 MAP_ZONES + 骨架展开 MAP_SPECS。
 * 以前只遍历 MAP_ZONES，所以骨架图（4 张新图，将来 25 张）一张都验不到 ——
 * 校验器看不见的图等于没有校验。 */
const ALL_MAPS = Object.keys(ZONES);
for (const id in MAP_SPECS) if (ALL_MAPS.indexOf(id) < 0) ALL_MAPS.push(id);

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

for (const mapId of ALL_MAPS) {
  const cfg = MAPS[mapId];
  if (!cfg) { fail(mapId + '：MAPS 里没有这张图'); continue; }
  const built = zonesOfMap(mapId);
  if (!built) { fail(mapId + '：zonesOfMap 返回 null'); continue; }
  const zones = built.zones;
  const lim = cfg.size * 0.47;
  const src = ZONES[mapId] ? '手写' : ('骨架 ' + MAP_SPECS[mapId].archetype);
  console.log('\n【' + cfg.name + '】size ' + cfg.size + '  可走半径上限 ' + lim.toFixed(1) + '  ' + zones.length + ' 个区域  [' + src + ']');

  /* 1. 越界 */
  for (const z of zones) {
    const rr = z.type === 'circle'
      ? Math.hypot(z.x, z.z) + z.r
      : Math.hypot(Math.abs(z.x) + z.w / 2, Math.abs(z.z) + z.h / 2);
    if (rr > lim + 0.01) fail(z.id + ' 越界：最远点 ' + rr.toFixed(1) + ' > ' + lim.toFixed(1));
  }

  /* 2. 连通（重叠面积 > 4 ㎡ 才算连通） */
  const entry = built.entry;
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

  /* 5. 首领在 sanctum 内 —— [M3] 落点一律走 bossPosOf，不再直读 MAP_BOSS_POS。
   * 原因：同一只首领可能出现在多张图上（新图的 sanctum 位置不同），
   * 老表的坐标只对老图成立。bossPosOf 会先试老坐标、不在 sanctum 内就按圆心推导。 */
  const sanctum = zones.find(z => z.kind === 'boss');
  if (cfg.bosses && cfg.bosses.length) {
    if (!sanctum) fail('有 ' + cfg.bosses.length + ' 个首领但没有 sanctum 区域');
    else {
      cfg.bosses.forEach((bid, idx) => {
        if (!BOSSES[bid]) { fail('首领 ' + bid + ' 在 BOSSES 里不存在'); return; }
        const p = bossPosOf(mapId, bid, idx);
        if (!p) { fail('首领 ' + bid + ' 没有落点'); return; }
        if (!zoneContains(sanctum, p[0], p[1])) fail('首领 ' + bid + ' 落点 (' + p[0] + ',' + p[1] + ') 在 sanctum 外');
      });
    }
  }

  /* 6. 刷怪：怪种必须属于这张图 + 走廊/入口/首领场必须为 0 */
  const pool = cfg.spawns || [];
  let total = 0, zmax = 0, zmin = Infinity;
  for (const z of zones) {
    if (!z.spawns) continue;
    const c = z.spawns.count || 0;
    total += c;
    for (const k of (z.spawns.kinds || [])) {
      if (pool.indexOf(k) < 0) fail(z.id + ' 刷的怪「' + k + '」不在本图 spawns 里');
    }
    /* [M3] 硬指标：走廊(link) / 入口(entry) / 首领场(boss) 不刷怪。
     * 走廊刷怪 = 玩家一进图就贴脸；首领场刷怪 = 打首领时被杂兵推死。 */
    if (c > 0 && (z.kind === 'link' || z.kind === 'entry' || z.kind === 'boss')) {
      fail(z.id + '（' + z.kind + '）不该刷怪，却配了 ' + c + ' 只');
    }
    if (c > 0) { zmax = Math.max(zmax, c); zmin = Math.min(zmin, c); }
  }
  if (!cfg.safe) {
    /* [M7] boss 场（无相天）没有小怪：`arena: true` 单独豁免。
     * 它和「安全区」不是一回事 —— 安全区是进得去出得来的地方，
     * boss 场是进去就开打的地方，只是不打杂兵。 */
    if (total === 0 && !cfg.arena) fail('没有任何区域配了刷怪');
    else if (total > 0) {
      /* 骨架图的刷怪数是推导出来的，必须与 MAPS.spawnCount 完全一致；
       * 手写图是手工填的，只做「别比旧值少太多」的软提醒。 */
      if (MAP_SPECS[mapId]) {
        if (total !== cfg.spawnCount) fail('刷怪合计 ' + total + ' ≠ MAPS.spawnCount ' + cfg.spawnCount);
        else console.log('  刷怪合计 ' + total + ' 只');
      } else {
        console.log('  刷怪合计 ' + total + ' 只（旧 spawnCount ' + (cfg.spawnCount || '-') + '）');
      }
    }
    if (total < (cfg.spawnCount || 14) * 0.8) soft('刷怪数比旧值少 20% 以上，地图会显得空');
    /* [M3] 台账硬指标：每图每区 max/min ≤ 1.6（走廊入口为 0，不参与比值）。
     *
     * 只对骨架图（40~56 只）硬性要求：老图整图才 12 只，摊到 5 个刷怪区
     * 必然是 5/2 或 4/2，比值天生 2.0~2.5 —— 这个指标是给「大图会不会
     * 中间空、边上挤」设计的，12 只的图上没有统计意义，硬判等于逼着
     * 为了凑比值去打乱老图手感。所以老图只给提醒，不判失败。
     *
     * [M7] 副本图同理豁免：12 只摊 6 个区，本来就是 2/2/2/2/2/2 或 3/2/2/2/2/1，
     * 差一只比值就跳，硬判只会逼着把刷怪数往上加 —— 而副本要的就是「少而精」。 */
    if (zmin < Infinity && zmax / zmin > 1.6) {
      const msg = '区内刷怪 max/min = ' + (zmax / zmin).toFixed(2) + '（' + zmax + '/' + zmin + '）> 1.6';
      if (MAP_SPECS[mapId] && !cfg.raid) fail(msg + '，密度不均');
      else soft(msg + '，怪少（副本 / 老图）可接受');
    }
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

/* 8. 每张图的 zone 数量符合设计 */
console.log('');
for (const mapId of ALL_MAPS) {
  const built = zonesOfMap(mapId);
  if (!built) continue;
  const n = built.zones.length;
  const rooms = built.zones.filter(z => z.kind !== 'link').length;
  if (rooms < 4) soft(mapId + ' 只有 ' + rooms + ' 个房间，区域化意义不大');
  /* [M3] §5.1 目标 12~16 区；超过 16 个 zone 小地图会糊成一团 */
  if (n > 16) soft(mapId + ' 有 ' + n + ' 个 zone，小地图会偏挤');
}

console.log('\n' + (bad ? '❌ ' + bad + ' 项失败' : '✅ 全部通过') + (warn ? '（' + warn + ' 项提醒）' : ''));
process.exit(bad ? 1 : 0);
