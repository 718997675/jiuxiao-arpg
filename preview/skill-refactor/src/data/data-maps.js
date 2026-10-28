/* ============================================================
 * data-maps.js —— 地图区域化数据（M12）
 *
 * 起因：6 张图原本都是「圆形竞技场」—— 边界是 40 块石头围一圈，
 * 移动限制是径向钳制（size × 0.47），往任何方向跑撞到的都是同一个圆。
 * 场景道具按极坐标随机撒点，没有房间、走廊、区域的概念；
 * 刷怪在整图随机取点。结论：不是「地图太小」，是「地图没有结构」。
 *
 * 本文件把每张图拆成若干 zone（矩形房间 / 圆形场地）+ 连接走廊，
 * 可走区域 = 所有 zone 的并集。相邻 zone 必须**重叠**（不是相切），
 * 否则玩家会卡在两个区域的接缝上。
 *
 *   type: 'rect'    矩形，x/z 是中心，w/h 是宽高
 *   type: 'circle'  圆形，x/z 是中心，r 是半径
 *   kind: entry 入口 / path 主路 / hall 主厅 / wing 侧翼 / link 走廊 / boss 首领场
 *
 * 校验：node dev/zone-check.js（连通性 / 越界 / 传送阵与首领落点）
 * 纯数据 + 纯函数，不碰 THREE / DOM，可以在 node 里直接跑。
 * ============================================================ */

const MAP_ZONES = {
  /* ---------------- 桃源村 ----------------
   * 安全区，保持原来的圆形村落 —— NPC / 房屋 / 牌坊的坐标都是按老布局排的，
   * 改成矩形会让村长、铁匠、试炼使者全挪位，得不偿失。 */
  village: {
    entry: 'plaza',
    zones: [
      { id: 'plaza', name: '村中广场', type: 'circle', x: 0, z: 0, r: 31, kind: 'hall' }
    ]
  },

  /* ---------------- 幽篁林 ----------------
   * 入口在南（+z），一路向北：竹径 → 林中空地 → 东西两坡 → 妖王祭坛 */
  forest: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '林口', type: 'rect', x: 0, z: 40.6, w: 37.7, h: 26.1, kind: 'entry' },
      { id: 'path', name: '竹径', type: 'rect', x: 0, z: 17.4, w: 15.9, h: 23.2, kind: 'path',
        spawns: { kinds: ['bat', 'hornet'], count: 2 } },
      { id: 'hall', name: '林中空地', type: 'rect', x: 0, z: -11.6, w: 43.5, h: 37.7, kind: 'hall',
        spawns: { kinds: ['halfork', 'wolf', 'skelarch'], count: 4 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -21.8, z: -11.6, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'west', name: '西坡', type: 'rect', x: -39.1, z: -11.6, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['bamboo', 'fox'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 21.8, z: -11.6, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'east', name: '东坡', type: 'rect', x: 39.1, z: -11.6, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['shigandang', 'hornet'], count: 2 } },
      { id: 'sanctum', name: '妖王祭坛', type: 'circle', x: 0, z: -40.6, r: 18.8, kind: 'boss' }
    ]
  },

  /* ---------------- 血月沼泽 ---------------- */
  swamp: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '沼泽渡口', type: 'rect', x: 0, z: 46.4, w: 40.6, h: 26.1, kind: 'entry' },
      { id: 'path', name: '泥沼栈道', type: 'rect', x: 0, z: 20.3, w: 17.4, h: 29, kind: 'path',
        spawns: { kinds: ['spider', 'wasp'], count: 2 } },
      { id: 'hall', name: '血月滩', type: 'rect', x: 0, z: -13, w: 46.4, h: 43.5, kind: 'hall',
        spawns: { kinds: ['boar', 'snake', 'zombie'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -24.6, z: -13, w: 17.4, h: 13, kind: 'link' },
      { id: 'west', name: '枯林西泽', type: 'rect', x: -43.5, z: -13, w: 26.1, h: 31.9, kind: 'wing',
        spawns: { kinds: ['drowned', 'bogwitch'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 24.6, z: -13, w: 17.4, h: 13, kind: 'link' },
      { id: 'east', name: '毒潭东岸', type: 'rect', x: 43.5, z: -13, w: 26.1, h: 31.9, kind: 'wing',
        spawns: { kinds: ['scorpion', 'brood'], count: 2 } },
      { id: 'sanctum', name: '酋长祭坛', type: 'circle', x: 0, z: -43.5, r: 18.8, kind: 'boss' }
    ]
  },

  /* ---------------- 玄铁矿洞 ---------------- */
  mine: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '矿口', type: 'rect', x: 0, z: 43.5, w: 37.7, h: 23.2, kind: 'entry' },
      { id: 'path', name: '主巷道', type: 'rect', x: 0, z: 17.4, w: 15.9, h: 31.9, kind: 'path',
        spawns: { kinds: ['ironbeetle', 'ghostfire'], count: 2 } },
      { id: 'hall', name: '采掘大厅', type: 'rect', x: 0, z: -14.5, w: 43.5, h: 37.7, kind: 'hall',
        spawns: { kinds: ['golem', 'yaoguai', 'statue'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'west', name: '废矿西坑', type: 'rect', x: -39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['minerghost', 'magma'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'east', name: '熔脉东窟', type: 'rect', x: 39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['magma', 'runesmith'], count: 2 } },
      { id: 'sanctum', name: '幽魂祭坛', type: 'circle', x: 0, z: -40.6, r: 18.8, kind: 'boss' }
    ]
  },

  /* ---------------- 九幽地宫 ---------------- */
  abyss: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '地宫甬道', type: 'rect', x: 0, z: 44.9, w: 37.7, h: 23.2, kind: 'entry' },
      { id: 'path', name: '引魂廊', type: 'rect', x: 0, z: 18.8, w: 15.9, h: 31.9, kind: 'path',
        spawns: { kinds: ['shade', 'crane'], count: 2 } },
      { id: 'hall', name: '白骨大殿', type: 'rect', x: 0, z: -14.5, w: 43.5, h: 37.7, kind: 'hall',
        spawns: { kinds: ['golem', 'yaoguai', 'headless'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'west', name: '西侧耳室', type: 'rect', x: -39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['bonewright', 'bloodlord'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'east', name: '东侧耳室', type: 'rect', x: 39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['ironmaiden', 'ghostfire'], count: 3 } },
      { id: 'sanctum', name: '忘川祭坛', type: 'circle', x: 0, z: -42, r: 19.6, kind: 'boss' }
    ]
  },

  /* ---------------- 天阙残境 ---------------- */
  heaven: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '南天门', type: 'rect', x: 0, z: 44.9, w: 37.7, h: 23.2, kind: 'entry' },
      { id: 'path', name: '云阶', type: 'rect', x: 0, z: 18.8, w: 15.9, h: 31.9, kind: 'path',
        spawns: { kinds: ['fallen', 'swordwraith'], count: 2 } },
      { id: 'hall', name: '残阙广场', type: 'rect', x: 0, z: -14.5, w: 43.5, h: 37.7, kind: 'hall',
        spawns: { kinds: ['golem', 'yaoguai', 'voidbeast'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'west', name: '西偏殿', type: 'rect', x: -39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['jadeguard', 'bloodlord'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'east', name: '东偏殿', type: 'rect', x: 39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['swordwraith', 'thunderbird'], count: 3 } },
      { id: 'sanctum', name: '九霄之巅', type: 'circle', x: 0, z: -42, r: 19.6, kind: 'boss' }
    ]
  }
};

/* ---------------- 首领落点 ----------------
 * 必须落在各自地图的 sanctum 圆内，否则玩家打到一半会发现首领在墙外。
 * 多个首领的图在圆内分散摆开，避免叠在一起。
 * 校验：node dev/zone-check.js 会逐条检查。 */
const MAP_BOSS_POS = {
  treeking: [0, -40.6], batking: [10.2, -34.8],
  chief: [0, -43.5], golemking: [-10.2, -37.7], snakequeen: [10.2, -37.7],
  ghostlord: [0, -40.6], firegeneral: [-10.2, -34.8], icequeen: [10.2, -34.8],
  spidermother: [0, -42], ferryman: [-10.2, -36.2], swordlord: [10.2, -36.2],
  chaos: [0, -42]
};

/* ---------------- 纯函数 ---------------- */

/* 某张图的区域列表；没有配置时返回 null（调用方回退到旧的圆形逻辑） */
function mapZones(mapId) {
  const m = MAP_ZONES[mapId];
  return m && m.zones && m.zones.length ? m.zones : null;
}
function mapEntryZone(mapId) {
  const m = MAP_ZONES[mapId];
  if (!m) return null;
  for (const z of m.zones) if (z.id === m.entry) return z;
  return m.zones[0] || null;
}
function zoneById(mapId, id) {
  const zs = mapZones(mapId);
  if (!zs) return null;
  for (const z of zs) if (z.id === id) return z;
  return null;
}

/* 点是否在 zone 内 */
/* 点在区域内判定。留 2 厘米宽容：区域边界都是「中心 ± 半宽」算出来的，
 * 玩家/怪走到边界上时 5.800000000000001 > 5.8 这种浮点误差会让判定翻脸 ——
 * 更糟的是 clampToZone 那边认为「已经在里面不用动」，两边打架，怪就永远
 * 卡在越界状态（地宫 westLink 的上下边各 5.8 米，正好踩这个坑）。
 * 2 厘米对玩法没有影响，但把两套判定的口径对齐了。 */
const ZONE_EPS = 0.02;
function zoneContains(z, x, zz) {
  if (z.type === 'circle') {
    const dx = x - z.x, dz = zz - z.z;
    const rr = z.r + ZONE_EPS;
    return dx * dx + dz * dz <= rr * rr;
  }
  return Math.abs(x - z.x) <= z.w * 0.5 + ZONE_EPS && Math.abs(zz - z.z) <= z.h * 0.5 + ZONE_EPS;
}

/* 把点夹到 zone 内（最近点） */
function clampToZone(z, x, zz) {
  if (z.type === 'circle') {
    const dx = x - z.x, dz = zz - z.z;
    const d = Math.hypot(dx, dz);
    if (d <= z.r || d < 0.0001) return { x, z: zz };
    /* 留 1 厘米余量：k = r/d 算出来的点正好落在圆周上，浮点误差可能让它
     * 差一丝跑到圆外，于是 collideWorld 每帧把怪夹到同一个「越界」的点，
     * 越界计数每帧 +1（地宫 320 帧次就是这么来的）。 */
    const k = Math.max(0, z.r - 0.01) / d;
    return { x: z.x + dx * k, z: z.z + dz * k };
  }
  const hw = z.w * 0.5, hh = z.h * 0.5;
  return {
    x: Math.max(z.x - hw, Math.min(z.x + hw, x)),
    z: Math.max(z.z - hh, Math.min(z.z + hh, zz))
  };
}

/* 点是否在某张图的可走区域内（所有 zone 的并集） */
function zonesContain(mapId, x, zz) {
  const zs = mapZones(mapId);
  if (!zs) return true;               // 没配置 = 不限制，走旧逻辑
  for (const z of zs) if (zoneContains(z, x, zz)) return true;
  return false;
}

/* 所有 zone 里离该点最近的落点（用于把越界的玩家/怪推回边界） */
function closestZonePoint(mapId, x, zz) {
  const zs = mapZones(mapId);
  if (!zs) return null;
  let best = null, bestD = Infinity;
  for (const z of zs) {
    const p = clampToZone(z, x, zz);
    const d = (p.x - x) * (p.x - x) + (p.z - zz) * (p.z - zz);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/* 点落在哪个 zone（走廊优先级最低：站在房间与走廊重叠处算房间） */
function zoneAt(mapId, x, zz) {
  const zs = mapZones(mapId);
  if (!zs) return null;
  let link = null;
  for (const z of zs) {
    if (!zoneContains(z, x, zz)) continue;
    if (z.kind === 'link') { link = link || z; continue; }
    return z;
  }
  return link;
}

/* 在 zone 内取一个随机点，pad 是离边缘的安全距离 */
function randomPointInZone(z, pad) {
  pad = Math.max(0, pad || 0);
  if (z.type === 'circle') {
    const rr = Math.max(0.5, z.r - pad);
    /* sqrt 让点在圆内均匀分布，否则会全挤在圆心 */
    const d = Math.sqrt(Math.random()) * rr;
    const a = Math.random() * Math.PI * 2;
    return { x: z.x + Math.cos(a) * d, z: z.z + Math.sin(a) * d };
  }
  const hw = Math.max(0.5, z.w * 0.5 - pad);
  const hh = Math.max(0.5, z.h * 0.5 - pad);
  return { x: z.x + (Math.random() * 2 - 1) * hw, z: z.z + (Math.random() * 2 - 1) * hh };
}

/* 可刷怪的区域（有 spawns 且不是首领场） */
function zoneSpawners(mapId) {
  const zs = mapZones(mapId);
  if (!zs) return [];
  return zs.filter(z => z.spawns && z.spawns.count > 0 && z.kind !== 'boss');
}

/* 该图的区域总刷怪数（替代旧的 spawnCount） */
function zoneSpawnTotal(mapId) {
  let n = 0;
  for (const z of zoneSpawners(mapId)) n += z.spawns.count || 0;
  return n;
}

/* 从 spawns.kinds 里随机取一种；kinds 缺失时回退到图级 spawns */
function zonePickKind(z, fallback) {
  const ks = (z && z.spawns && z.spawns.kinds) || fallback || [];
  return ks.length ? ks[Math.floor(Math.random() * ks.length)] : null;
}

/* =========================================================
 * [M12] 区域图与跨区寻路
 *
 * 「区域 + 走廊」结构上线后暴露出一个新问题：怪物原本是直线朝玩家走，
 * 一旦它和玩家不在同一块区域里，直线就会撞到区域边界上 —— collideWorld
 * 把它推回边界，它下一帧继续朝玩家走，又撞上去。看起来就是「怪贴着墙抖」。
 * 老的大圆圈没有这个问题，因为圆圈里根本没有墙。
 *
 * 解法不复杂：房间图是一棵很小的树（8 个节点），直接 BFS 求下一跳，
 * 把「朝向玩家」换成「先朝当前区域与下一区域之间的门走」。
 * 一旦跨过去，zoneAt 变了，下一帧自然重新规划，不需要维护状态机。
 * ========================================================= */

const _zoneGraphCache = {};

function zoneBounds(z) {
  if (z.type === 'circle') return { x0: z.x - z.r, x1: z.x + z.r, z0: z.z - z.r, z1: z.z + z.r };
  return { x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.h / 2, z1: z.z + z.h / 2 };
}

/* 两区域的交集中心 = 「门」的位置。相切（重叠 < 0.6 米）不算连通 ——
 * 相切的两块地砖在视觉上是接的，但走不过去，必须留出真实的重叠带。 */
function zoneOverlap(a, b) {
  const A = zoneBounds(a), B = zoneBounds(b);
  const x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1);
  const z0 = Math.max(A.z0, B.z0), z1 = Math.min(A.z1, B.z1);
  if (x1 - x0 < 0.6 || z1 - z0 < 0.6) return null;
  /* 1 米网格采样求交集质心：8 个区域 × 最多 28 对，只算一次，够便宜 */
  let sx = 0, sz = 0, n = 0;
  for (let x = x0 + 0.5; x < x1; x += 1) {
    for (let zz = z0 + 0.5; zz < z1; zz += 1) {
      if (zoneContains(a, x, zz) && zoneContains(b, x, zz)) { sx += x; sz += zz; n++; }
    }
  }
  if (!n) return null;
  return { x: sx / n, z: sz / n, area: (x1 - x0) * (z1 - z0) };
}

/* 邻接表 + 门坐标 + 下一跳缓存，按地图懒构建 */
function zoneGraph(mapId) {
  if (_zoneGraphCache[mapId]) return _zoneGraphCache[mapId];
  const g = { adj: {}, door: {}, hop: {} };
  const zs = mapZones(mapId);
  if (zs) {
    for (const z of zs) g.adj[z.id] = [];
    for (let i = 0; i < zs.length; i++) {
      for (let j = i + 1; j < zs.length; j++) {
        const o = zoneOverlap(zs[i], zs[j]);
        if (!o) continue;
        g.adj[zs[i].id].push(zs[j].id);
        g.adj[zs[j].id].push(zs[i].id);
        g.door[zs[i].id + '|' + zs[j].id] = o;
        g.door[zs[j].id + '|' + zs[i].id] = o;
      }
    }
  }
  _zoneGraphCache[mapId] = g;
  return g;
}

/* 从 fromId 到 toId 的下一跳区域 id（BFS，8 个节点，顺手缓存） */
function zoneNextHop(mapId, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return null;
  const g = zoneGraph(mapId);
  const key = fromId + '|' + toId;
  if (key in g.hop) return g.hop[key];
  const q = [fromId], prev = { };
  prev[fromId] = null;
  let found = false;
  while (q.length) {
    const cur = q.shift();
    if (cur === toId) { found = true; break; }
    for (const nb of (g.adj[cur] || [])) {
      if (nb in prev) continue;
      prev[nb] = cur;
      q.push(nb);
    }
  }
  let hop = null;
  if (found) {
    let node = toId;
    while (prev[node] && prev[node] !== fromId) node = prev[node];
    hop = (prev[node] === fromId) ? node : null;
  }
  g.hop[key] = hop;
  return hop;
}

/* 门的位置：两个相邻区域交集的中点。没有交集就返回 null */
function zoneDoor(mapId, aId, bId) {
  const g = zoneGraph(mapId);
  return g.door[aId + '|' + bId] || null;
}

/* 给怪物算一个「这一帧该朝哪走」的点。
 * 同区 → 直接朝目标（返回 null，调用方用真实目标）；
 * 跨区 → 朝下一跳区域的**中心**。
 *
 * 为什么不是朝门的质心：门落在两块区域的重叠带里，而 zoneAt 在重叠带
 * 里总是返回数组里靠前的那一块 —— 怪走到门心之后 zoneAt 仍然是出发区，
 * 下一帧还是同一道门，于是它站在门口原地抖。往门后再推 3.5 米也只是
 * 把抖动挪到门内侧，边界上照样来回切。
 * 直接瞄区域中心是单调的：一路走进下一区，zoneAt 变了就自然改成直扑目标。 */
function zoneSteer(mapId, ex, ez, tx, tz) {
  const za = zoneAt(mapId, ex, ez);
  if (!za) return null;
  const zb = zoneAt(mapId, tx, tz);
  if (!zb || zb.id === za.id) return null;
  const hop = zoneNextHop(mapId, za.id, zb.id);
  if (!hop) return null;
  const hz = zoneById(mapId, hop);
  if (!hz) return null;
  return { x: hz.x, z: hz.z };
}

