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

  /* ---------------- 寒潭水牢（卷二 · M2 前置） ----------------
   * 8 区骨架照抄九幽地宫：入口 → 主廊 → 大厅 → 东西两翼 → 首领场。
   * 骨架先复用，M3 再按 §5.2 的 8 种拓扑重做；现在要的是「任务有地方落」。 */
  frost: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '水牢铁门', type: 'rect', x: 0, z: 44.9, w: 37.7, h: 23.2, kind: 'entry' },
      { id: 'path', name: '沉骨囚廊', type: 'rect', x: 0, z: 18.8, w: 15.9, h: 31.9, kind: 'path',
        spawns: { kinds: ['drowned', 'toad'], count: 2 } },
      { id: 'hall', name: '寒潭大厅', type: 'rect', x: 0, z: -14.5, w: 43.5, h: 37.7, kind: 'hall',
        spawns: { kinds: ['drowned', 'bogwitch', 'zombie'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'west', name: '西侧水牢', type: 'rect', x: -39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['ghost', 'snake'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 21.8, z: -14.5, w: 14.5, h: 11.6, kind: 'link' },
      { id: 'east', name: '东侧水牢', type: 'rect', x: 39.1, z: -14.5, w: 24.6, h: 29, kind: 'wing',
        spawns: { kinds: ['bogwitch', 'ghost'], count: 3 } },
      /* r 收到 19.0：size 130 的可走上限是 61.1，19.6 会让最远点 61.6 越界 */
      { id: 'sanctum', name: '冰魄祭坛', type: 'circle', x: 0, z: -42, r: 19.0, kind: 'boss' }
    ]
  },

  /* ---------------- 冰魄湖 ---------------- */
  icelake: {
    entry: 'gate',
    zones: [
      { id: 'gate', name: '湖岸渡口', type: 'rect', x: 0, z: 46.4, w: 40.6, h: 26.1, kind: 'entry' },
      { id: 'path', name: '冰上栈道', type: 'rect', x: 0, z: 20.3, w: 17.4, h: 29, kind: 'path',
        spawns: { kinds: ['wasp', 'spider'], count: 2 } },
      { id: 'hall', name: '冰湖中心', type: 'rect', x: 0, z: -13, w: 46.4, h: 43.5, kind: 'hall',
        spawns: { kinds: ['drowned', 'brood', 'bogwitch'], count: 5 } },
      { id: 'westLink', name: '西廊', type: 'rect', x: -24.6, z: -13, w: 17.4, h: 13, kind: 'link' },
      { id: 'west', name: '西岸残林', type: 'rect', x: -43.5, z: -13, w: 26.1, h: 31.9, kind: 'wing',
        spawns: { kinds: ['toad', 'spider'], count: 2 } },
      { id: 'eastLink', name: '东廊', type: 'rect', x: 24.6, z: -13, w: 17.4, h: 13, kind: 'link' },
      { id: 'east', name: '东岸冰窟', type: 'rect', x: 43.5, z: -13, w: 26.1, h: 31.9, kind: 'wing',
        spawns: { kinds: ['brood', 'drowned'], count: 3 } },
      { id: 'sanctum', name: '冰魄神殿', type: 'circle', x: 0, z: -43.5, r: 18.8, kind: 'boss' }
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
 * 校验：node dev/zone-check.js 会逐条检查。
 *
 * [M3] 这张表是**老图的坐标**，不是「首领的坐标」。
 * 骨架化之后同一只首领可能出现在两张图上（sanctum 位置不同），
 * 所以真正的落点一律走 bossPosOf()，它按「先老表、后推导」的顺序取。 */
const MAP_BOSS_POS = {
  treeking: [0, -40.6], batking: [10.2, -34.8],
  chief: [0, -43.5], golemking: [-10.2, -37.7], snakequeen: [10.2, -37.7],
  ghostlord: [0, -40.6], firegeneral: [-10.2, -34.8], icequeen: [10.2, -34.8],
  spidermother: [0, -42], ferryman: [-10.2, -36.2], swordlord: [10.2, -36.2],
  chaos: [0, -42]
};

/* 按图覆盖（只有「老表里的坐标不在本图 sanctum 内」时才需要写） */
const MAP_BOSS_AT = {};

/* 首领落点：老图保持原坐标不变（手感不能改），新图按 sanctum 推导。
 *   idx 是这只首领在本图 bosses 数组里的序号 —— 多首领时沿小圆环散开。 */
function bossPosOf(mapId, bossId, idx) {
  const at = MAP_BOSS_AT[mapId];
  if (at && at[bossId]) return at[bossId];
  const zs = mapZones(mapId);
  const sanctum = zs ? zs.find(z => z.kind === 'boss') : null;
  const legacy = MAP_BOSS_POS[bossId];
  /* 老表坐标落在本图 sanctum 内 → 原样用（现有 6 张图走这条，一个像素都不变） */
  if (sanctum && legacy && zoneContains(sanctum, legacy[0], legacy[1])) return legacy;
  if (!sanctum) return legacy || [0, -30];
  /* 推导：单首领放圆心；多首领沿 0.5r 的圆环按 120° 散开 */
  const i = idx || 0;
  if (!i) return [sanctum.x, sanctum.z];
  const rad = sanctum.type === 'circle' ? sanctum.r : Math.min(sanctum.w, sanctum.h) * 0.5;
  const ang = -Math.PI / 2 + i * (Math.PI * 2 / 3);
  return [
    +(sanctum.x + Math.cos(ang) * rad * 0.5).toFixed(2),
    +(sanctum.z + Math.sin(ang) * rad * 0.5).toFixed(2)
  ];
}

/* ============================================================
 * [M3] 骨架系统 —— 25 张新图不再手写 zone 坐标
 *
 * 手写一张 12~16 区的图 = 手写 350 个矩形坐标，25 张就是 8750 个数字，
 * 而且每改一次尺寸就要全部重算。所以这里把「形状」抽象成 8 种骨架，
 * 一张图只声明 `{ archetype, size, kinds }`，展开由 buildZones 负责。
 *
 * 坐标一律用 **R 为单位**（R = size × 0.47，即 zone-check 的可走上限）。
 * 骨架函数返回 [{x,z,w,h}] 或 [{x,z,r}]，最后由 buildZones 乘 R 落地 ——
 * 这样换 size 不用改骨架，也不会出现「改了 size 就有一半区越界」。
 *
 * 约定：入口在南（+z），首领场在北（−z），与现有 6 张图一致。
 * 每个骨架都要满足 zone-check 的四条：① 每个区最远点 ≤ R
 * ② 从入口 BFS 全连通 ③ 相邻区必须有面积重叠（≥0.6 米，不是相切）
 * ④ 有且只有一个 boss 区。
 * ============================================================ */

const ZONE_ARCHETYPES = {

  /* ---------------- cross：十字主轴 + 双翼 ----------------
   * 现有 5 张图都是这个形状。这里参数化之后，新图也能用同一套。 */
  cross: () => ([
    { id: 'gate', name: '入口', type: 'rect', x: 0, z: 0.50, w: 0.60, h: 0.24, kind: 'entry' },
    { id: 'path', name: '主路', type: 'rect', x: 0, z: 0.28, w: 0.24, h: 0.32, kind: 'path' },
    { id: 'hall', name: '主厅', type: 'rect', x: 0, z: -0.04, w: 0.66, h: 0.40, kind: 'hall' },
    { id: 'westLink', name: '西廊', type: 'rect', x: -0.34, z: -0.04, w: 0.16, h: 0.16, kind: 'link' },
    { id: 'west', name: '西翼', type: 'rect', x: -0.50, z: -0.04, w: 0.22, h: 0.34, kind: 'wing' },
    { id: 'eastLink', name: '东廊', type: 'rect', x: 0.34, z: -0.04, w: 0.16, h: 0.16, kind: 'link' },
    { id: 'east', name: '东翼', type: 'rect', x: 0.50, z: -0.04, w: 0.22, h: 0.34, kind: 'wing' },
    { id: 'nwLink', name: '西北廊', type: 'rect', x: -0.30, z: -0.26, w: 0.18, h: 0.18, kind: 'link' },
    { id: 'nw', name: '西北角', type: 'rect', x: -0.46, z: -0.34, w: 0.24, h: 0.26, kind: 'wing' },
    { id: 'neLink', name: '东北廊', type: 'rect', x: 0.30, z: -0.26, w: 0.18, h: 0.18, kind: 'link' },
    { id: 'ne', name: '东北角', type: 'rect', x: 0.46, z: -0.34, w: 0.24, h: 0.26, kind: 'wing' },
    { id: 'nave', name: '后殿道', type: 'rect', x: 0, z: -0.34, w: 0.24, h: 0.30, kind: 'path' },
    { id: 'sanctum', name: '首领场', type: 'circle', x: 0, z: -0.56, r: 0.20, kind: 'boss' }
  ]),

  /* ---------------- spiral：螺旋下沉，逐层收窄 ----------------
   * 矿坑 / 深井。一条 S 形回廊，越往里越窄 —— 走进去有「往下」的感觉。 */
  spiral: () => ([
    { id: 'gate', name: '井口', type: 'rect', x: 0, z: 0.52, w: 0.56, h: 0.22, kind: 'entry' },
    { id: 's0', name: '井台', type: 'rect', x: -0.24, z: 0.36, w: 0.26, h: 0.22, kind: 'wing' },
    { id: 's1', name: '上层回廊', type: 'rect', x: 0.30, z: 0.30, w: 0.34, h: 0.30, kind: 'path' },
    { id: 's2', name: '东转井', type: 'rect', x: 0.30, z: 0.02, w: 0.30, h: 0.30, kind: 'hall' },
    { id: 'e2', name: '东岔洞', type: 'rect', x: 0.52, z: 0.02, w: 0.18, h: 0.24, kind: 'wing' },
    { id: 's3', name: '中段窄道', type: 'rect', x: -0.02, z: -0.10, w: 0.36, h: 0.26, kind: 'path' },
    { id: 's4', name: '西转井', type: 'rect', x: -0.32, z: 0.02, w: 0.30, h: 0.30, kind: 'hall' },
    { id: 'w2', name: '西岔洞', type: 'rect', x: -0.52, z: 0.02, w: 0.18, h: 0.24, kind: 'wing' },
    { id: 's5', name: '下层回廊', type: 'rect', x: -0.32, z: -0.24, w: 0.28, h: 0.26, kind: 'path' },
    { id: 'nw', name: '塌方角', type: 'rect', x: -0.52, z: -0.30, w: 0.18, h: 0.22, kind: 'wing' },
    { id: 'hub', name: '井底大厅', type: 'rect', x: -0.06, z: -0.30, w: 0.36, h: 0.24, kind: 'hall' },
    { id: 'sanctum', name: '深井祭坛', type: 'circle', x: 0, z: -0.56, r: 0.20, kind: 'boss' }
  ]),

  /* ---------------- canyon：长条峡谷 + 两侧洞窟 ----------------
   * 火原 / 荒原。一条南北贯通的沟，两侧挂洞 —— 视野被夹住，压迫感来自「窄」。
   *
   * 侧洞的**内沿必须扎进主谷 0.06R 以上**（x 从 −0.45 到 −0.09）。
   * 第一版把侧洞内沿放在主谷边界上（−0.13 vs −0.13），
   * 探针立刻报「w2/e2 不可达」—— 相切不算连通，玩家会撞在看不见的墙上。 */
  canyon: () => ([
    { id: 'gate', name: '谷口', type: 'rect', x: 0, z: 0.56, w: 0.50, h: 0.24, kind: 'entry' },
    { id: 'c1', name: '下谷', type: 'rect', x: 0, z: 0.32, w: 0.34, h: 0.30, kind: 'path' },
    { id: 'c2', name: '中谷', type: 'rect', x: 0, z: 0.06, w: 0.30, h: 0.30, kind: 'hall' },
    { id: 'c3', name: '上谷', type: 'rect', x: 0, z: -0.18, w: 0.30, h: 0.30, kind: 'path' },
    { id: 'c4', name: '谷底', type: 'rect', x: 0, z: -0.43, w: 0.34, h: 0.30, kind: 'hall' },
    { id: 'w1', name: '西侧洞一', type: 'rect', x: -0.27, z: 0.06, w: 0.36, h: 0.22, kind: 'wing' },
    { id: 'e1', name: '东侧洞一', type: 'rect', x: 0.27, z: 0.06, w: 0.36, h: 0.22, kind: 'wing' },
    { id: 'w2', name: '西侧洞二', type: 'rect', x: -0.27, z: -0.18, w: 0.36, h: 0.22, kind: 'wing' },
    { id: 'e2', name: '东侧洞二', type: 'rect', x: 0.27, z: -0.18, w: 0.36, h: 0.22, kind: 'wing' },
    { id: 'w3', name: '西侧洞三', type: 'rect', x: -0.27, z: -0.43, w: 0.32, h: 0.20, kind: 'wing' },
    { id: 'e3', name: '东侧洞三', type: 'rect', x: 0.27, z: -0.43, w: 0.32, h: 0.20, kind: 'wing' },
    { id: 'sanctum', name: '谷底祭坛', type: 'circle', x: 0, z: -0.62, r: 0.15, kind: 'boss' }
  ]),

  /* ---------------- radial：中庭放射 5 翼 ----------------
   * 天阙 / 神殿。中央广场向四周伸出翼廊，走哪边都是「回得去」的。 */
  radial: () => ([
    { id: 'hub', name: '中庭', type: 'circle', x: 0, z: 0, r: 0.26, kind: 'hall' },
    { id: 'gate', name: '山门', type: 'rect', x: 0, z: 0.40, w: 0.34, h: 0.32, kind: 'entry' },
    { id: 'wingW', name: '西翼', type: 'rect', x: -0.36, z: 0, w: 0.28, h: 0.30, kind: 'wing' },
    { id: 'wingE', name: '东翼', type: 'rect', x: 0.36, z: 0, w: 0.28, h: 0.30, kind: 'wing' },
    { id: 'outW', name: '西偏殿', type: 'rect', x: -0.56, z: 0, w: 0.20, h: 0.24, kind: 'wing' },
    { id: 'outE', name: '东偏殿', type: 'rect', x: 0.56, z: 0, w: 0.20, h: 0.24, kind: 'wing' },
    { id: 'wingNW', name: '西北廊', type: 'rect', x: -0.26, z: -0.22, w: 0.26, h: 0.22, kind: 'path' },
    { id: 'wingNE', name: '东北廊', type: 'rect', x: 0.26, z: -0.22, w: 0.26, h: 0.22, kind: 'path' },
    { id: 'outNW', name: '西北塔', type: 'rect', x: -0.46, z: -0.36, w: 0.22, h: 0.20, kind: 'wing' },
    { id: 'outNE', name: '东北塔', type: 'rect', x: 0.46, z: -0.36, w: 0.22, h: 0.20, kind: 'wing' },
    { id: 'nave', name: '神道', type: 'rect', x: 0, z: -0.34, w: 0.22, h: 0.22, kind: 'path' },
    { id: 'sanctum', name: '神殿', type: 'circle', x: 0, z: -0.52, r: 0.20, kind: 'boss' }
  ]),

  /* ---------------- ring：环形回廊 + 中央大厅 ----------------
   * 地宫 / 墓。绕一圈能回到原地，中间是主厅。
   *
   * 第一版的四条回廊是「正好首尾相接」摆的（x 到 ±0.26，z 到 ±0.26），
   * 四个角只有一条线相交 —— 探针报 ringE 不可达。现在南北回廊拉长到
   * x ±0.30、东西回廊拉长到 z ±0.30，四个角各有 0.11R × 0.18R 的实心重叠。 */
  ring: () => ([
    { id: 'gate', name: '墓道口', type: 'rect', x: 0, z: 0.56, w: 0.34, h: 0.22, kind: 'entry' },
    { id: 'inlet', name: '前甬道', type: 'rect', x: 0, z: 0.36, w: 0.20, h: 0.26, kind: 'path' },
    { id: 'hall', name: '中央大殿', type: 'circle', x: 0, z: 0, r: 0.26, kind: 'hall' },
    { id: 'ringS', name: '南回廊', type: 'rect', x: 0, z: 0.19, w: 0.60, h: 0.18, kind: 'path' },
    { id: 'ringE', name: '东回廊', type: 'rect', x: 0.28, z: 0, w: 0.18, h: 0.60, kind: 'path' },
    { id: 'ringN', name: '北回廊', type: 'rect', x: 0, z: -0.19, w: 0.60, h: 0.20, kind: 'path' },
    { id: 'ringW', name: '西回廊', type: 'rect', x: -0.28, z: 0, w: 0.18, h: 0.60, kind: 'path' },
    { id: 'se', name: '东南墓室', type: 'rect', x: 0.44, z: 0.30, w: 0.22, h: 0.22, kind: 'wing' },
    { id: 'ne', name: '东北墓室', type: 'rect', x: 0.44, z: -0.30, w: 0.22, h: 0.22, kind: 'wing' },
    { id: 'nw', name: '西北墓室', type: 'rect', x: -0.44, z: -0.30, w: 0.22, h: 0.22, kind: 'wing' },
    { id: 'sw', name: '西南墓室', type: 'rect', x: -0.44, z: 0.30, w: 0.22, h: 0.22, kind: 'wing' },
    { id: 'nave', name: '后殿道', type: 'rect', x: 0, z: -0.38, w: 0.20, h: 0.24, kind: 'path' },
    { id: 'sanctum', name: '主墓室', type: 'circle', x: 0, z: -0.62, r: 0.16, kind: 'boss' }
  ]),

  /* ---------------- twin：双厅并联 + 中间窄桥 ----------------
   * 水牢 / 监牢。两座大厅，中间一条窄桥 —— 掉下去就是另一回事了。
   * 牢门 z=0.50 h=0.28（0.36~0.64）压进西大牢的 0.40 上沿，
   * 原来 h=0.20 只到 0.44，与 0.40 之间空 0.04R，整张图从入口就断了。 */
  twin: () => ([
    { id: 'gate', name: '牢门', type: 'rect', x: -0.26, z: 0.50, w: 0.34, h: 0.28, kind: 'entry' },
    { id: 'westHall', name: '西大牢', type: 'rect', x: -0.26, z: 0.18, w: 0.40, h: 0.44, kind: 'hall' },
    { id: 'wCell', name: '西侧囚室', type: 'rect', x: -0.54, z: 0.18, w: 0.20, h: 0.26, kind: 'wing' },
    { id: 'wLow', name: '西下囚室', type: 'rect', x: -0.26, z: -0.10, w: 0.30, h: 0.18, kind: 'wing' },
    { id: 'bridge', name: '窄桥', type: 'rect', x: 0, z: 0.18, w: 0.22, h: 0.16, kind: 'path' },
    { id: 'eastHall', name: '东大牢', type: 'rect', x: 0.26, z: 0.18, w: 0.40, h: 0.44, kind: 'hall' },
    { id: 'eCell', name: '东侧囚室', type: 'rect', x: 0.54, z: 0.18, w: 0.20, h: 0.26, kind: 'wing' },
    { id: 'eLow', name: '东下囚室', type: 'rect', x: 0.26, z: -0.10, w: 0.30, h: 0.18, kind: 'wing' },
    { id: 'nave', name: '水牢甬道', type: 'rect', x: 0.26, z: -0.28, w: 0.24, h: 0.24, kind: 'path' },
    { id: 'sanctum', name: '刑房', type: 'circle', x: 0.26, z: -0.52, r: 0.18, kind: 'boss' }
  ]),

  /* ---------------- isles：多圆岛 + 窄桥 ----------------
   * 沼泽 / 兽窟。几块陆地用桥串起来，桥窄，怪多。 */
  isles: () => ([
    { id: 'gate', name: '渡口', type: 'circle', x: 0, z: 0.52, r: 0.18, kind: 'entry' },
    { id: 'b1', name: '南桥', type: 'rect', x: 0, z: 0.36, w: 0.12, h: 0.20, kind: 'link' },
    { id: 'isleS', name: '南岛', type: 'circle', x: 0, z: 0.16, r: 0.20, kind: 'hall' },
    { id: 'b2', name: '西桥', type: 'rect', x: -0.22, z: 0.16, w: 0.18, h: 0.10, kind: 'link' },
    { id: 'isleW', name: '西岛', type: 'circle', x: -0.42, z: 0.16, r: 0.18, kind: 'wing' },
    { id: 'b3', name: '东桥', type: 'rect', x: 0.22, z: 0.16, w: 0.18, h: 0.10, kind: 'link' },
    { id: 'isleE', name: '东岛', type: 'circle', x: 0.42, z: 0.16, r: 0.18, kind: 'wing' },
    { id: 'b4', name: '北桥', type: 'rect', x: 0, z: -0.06, w: 0.12, h: 0.20, kind: 'link' },
    { id: 'isleN', name: '北岛', type: 'circle', x: 0, z: -0.26, r: 0.20, kind: 'hall' },
    { id: 'b5', name: '西北桥', type: 'rect', x: -0.20, z: -0.34, w: 0.18, h: 0.10, kind: 'link' },
    { id: 'isleNW', name: '西北岛', type: 'circle', x: -0.38, z: -0.42, r: 0.16, kind: 'wing' },
    { id: 'b6', name: '东北桥', type: 'rect', x: 0.20, z: -0.34, w: 0.18, h: 0.10, kind: 'link' },
    { id: 'isleNE', name: '东北岛', type: 'circle', x: 0.38, z: -0.42, r: 0.16, kind: 'wing' },
    { id: 'nave', name: '祭岛', type: 'circle', x: 0, z: -0.52, r: 0.16, kind: 'boss' }
  ]),

  /* ---------------- terrace：三层台地 + 坡道 ----------------
   * 山道 / 断桥。越往上越窄，每层有侧台 —— 打不过还能往回退一层。
   *
   * 侧台同理：内沿要压进主台地 0.08R（主台地半宽 0.29 / 0.22），
   * 所以侧台写成 x=−0.39 w=0.38 这种「大半截在主台地里」的形状，
   * 而不是贴在台地边上。贴边 = 相切 = 上不去。 */
  terrace: () => ([
    { id: 'gate', name: '山脚', type: 'rect', x: 0, z: 0.55, w: 0.62, h: 0.24, kind: 'entry' },
    { id: 't1', name: '下层台地', type: 'rect', x: 0, z: 0.32, w: 0.58, h: 0.32, kind: 'hall' },
    { id: 't1w', name: '下层西台', type: 'rect', x: -0.39, z: 0.32, w: 0.38, h: 0.22, kind: 'wing' },
    { id: 't1e', name: '下层东台', type: 'rect', x: 0.39, z: 0.32, w: 0.38, h: 0.22, kind: 'wing' },
    { id: 'r1', name: '第一坡道', type: 'rect', x: 0, z: 0.10, w: 0.22, h: 0.18, kind: 'path' },
    { id: 't2', name: '中层台地', type: 'rect', x: 0, z: -0.06, w: 0.44, h: 0.28, kind: 'hall' },
    { id: 't2w', name: '中层西台', type: 'rect', x: -0.32, z: -0.06, w: 0.36, h: 0.20, kind: 'wing' },
    { id: 't2e', name: '中层东台', type: 'rect', x: 0.32, z: -0.06, w: 0.36, h: 0.20, kind: 'wing' },
    { id: 'r2', name: '第二坡道', type: 'rect', x: 0, z: -0.26, w: 0.20, h: 0.18, kind: 'path' },
    { id: 't3', name: '上层台地', type: 'rect', x: 0, z: -0.40, w: 0.32, h: 0.20, kind: 'hall' },
    { id: 'nave', name: '绝顶石阶', type: 'rect', x: 0, z: -0.55, w: 0.18, h: 0.20, kind: 'path' },
    { id: 'sanctum', name: '绝顶', type: 'circle', x: 0, z: -0.68, r: 0.14, kind: 'boss' }
  ])
};

/* 每种骨架的默认名字（骨架只给形状，名字按图覆盖） */
/* 刷怪权重：走廊(link) / 入口(entry) / 首领场(boss) 恒为 0。
 *
 * 三档的比值上限由验收指标决定 ——「每图每区 max/min ≤ 1.6」。
 * 第一版写的是 1.7 / 1.2 / 0.9（比值 1.89），再叠加零头全给主厅，
 * 实测 max/min 到 2.0，直接超标。改成 1.15 / 1.0 / 0.85（比值 1.35），
 * 零头又改成「补给最少的区」，实测收敛到 1.17~1.33。
 * 主厅的「压迫感」靠 zone 面积和怪种强度做，不靠堆数量。 */
const ARCHETYPE_SPAWN_WEIGHT = { hall: 1.15, wing: 1.0, path: 0.85, entry: 0, link: 0, boss: 0 };

/* 每种骨架的**可走覆盖率**：可走面积 ÷ 可走方框面积（2R）²。
 * 骨架坐标是 R 归一化的，所以这个比例与 size 无关，换尺寸不用重测。
 *
 * 为什么需要它：刷怪数手填一定会错。twin 只有 10 个区、覆盖率 19.6%，
 * 同样的 size=300 下它比 cross 少 3000㎡；如果两张图都填 47 只，
 * twin 就是 332㎡/只（偏密）、cross 是 397㎡/只（达标）。
 * 所以刷怪数改成 suggestSpawnTotal() 从面积反推，§5.1 的 380~450 才有保障。
 * 数值由 dev/zone-density.js 采样实测得出。 */
const ARCHETYPE_COVERAGE = {
  cross: 0.2346, spiral: 0.2157, canyon: 0.2165, radial: 0.2183,
  ring: 0.2116, twin: 0.1963, isles: 0.2012, terrace: 0.2126
};

/* 目标密度：§5.1 的 380~450 取中值 400㎡/只 */
const TARGET_AREA_PER_MOB = 400;

function suggestSpawnTotal(archetype, size, perMob) {
  const cov = ARCHETYPE_COVERAGE[archetype];
  if (!cov) return 40;
  const box = 2 * (size || 240) * 0.47;
  const area = cov * box * box;
  /* §5.1：单图 40~56 只。低于 40 图会显得空，高于 56 手机端扛不住 */
  return Math.max(40, Math.min(56, Math.round(area / (perMob || TARGET_AREA_PER_MOB))));
}

/* 地图规格：一张新图 = 一行。刷怪数不写，由 suggestSpawnTotal() 从面积反推；
 * 想特调再补 spawnTotal 覆盖（会偏离 400㎡/只，zone-density 会报出来）。
 *
 * size 为什么是 290~300 而不是 §5.1 下限的 240：
 * 骨架只覆盖可走方框的 20~21%，size 240 实际可走面积只有 ~11,000㎡，
 * 达不到 §5.1 的 16,000~24,000㎡ 目标；反过来 44 只怪摊在 11,000㎡ 上是
 * 250㎡/只，比 380~450 的目标**密得多**（走两步就贴脸）。
 * 290~300 才是「面积达标 + 密度达标」的唯一区间，探针已逐档验过。 */
const MAP_SPECS = {
  /* ---------------- 卷二 2-2 / 2-3（M3 第一批，把卷二打通） ---------------- */
  magmagully: {
    archetype: 'spiral', size: 290, ground: 'rock',
    kinds: ['magma', 'ironbeetle', 'golem', 'runesmith', 'ghostfire'],
    names: { gate: '熔脉井口', s0: '矿工井台', s1: '上层回廊', s2: '东转井', e2: '东岔洞', s3: '中段窄道', s4: '西转井', w2: '西岔洞', s5: '下层回廊', nw: '塌方角', hub: '井底大厅', sanctum: '熔心祭坛' }
  },
  ashfield: {
    archetype: 'canyon', size: 295, ground: 'ash',
    kinds: ['magma', 'ghostfire', 'ironbeetle', 'runesmith', 'golem'],
    names: { gate: '荒原谷口', c1: '下谷灰道', c2: '中谷', c3: '上谷', c4: '谷底', w1: '西侧焦洞', e1: '东侧焦洞', w2: '西侧灰窟', e2: '东侧灰窟', w3: '西侧塌洞', e3: '东侧塌洞', sanctum: '灰烬祭坛' }
  },
  flamecanyon: {
    archetype: 'canyon', size: 300, ground: 'ash',
    kinds: ['magma', 'ghostfire', 'runesmith', 'golem', 'statue'],
    names: { gate: '峡谷隘口', c1: '赤岩下谷', c2: '赤岩中谷', c3: '赤岩上谷', c4: '焚风谷底', w1: '西侧火窟', e1: '东侧火窟', w2: '西侧熔洞', e2: '东侧熔洞', w3: '西侧焦穴', e3: '东侧焦穴', sanctum: '焚风祭坛' }
  },
  flamealtar: {
    archetype: 'radial', size: 295, ground: 'ash',
    kinds: ['magma', 'ghostfire', 'statue', 'runesmith', 'golem'],
    names: { hub: '焚天中庭', gate: '祭坛山门', wingW: '西配殿', wingE: '东配殿', outW: '西火殿', outE: '东火殿', wingNW: '西北廊', wingNE: '东北廊', outNW: '西北火塔', outNE: '东北火塔', nave: '焚天神道', sanctum: '焚天祭坛' }
  }
};

/* ---------------- 骨架展开 ----------------
 * spec = { archetype, size, spawnTotal, kinds, names }
 * 返回 { entry, zones }，zones 已乘 R、已挂好 spawns。 */
function buildZones(mapId, spec) {
  const fn = ZONE_ARCHETYPES[spec.archetype];
  if (!fn) return null;
  const R = (spec.size || 240) * 0.47;
  const defs = fn(spec);
  const names = spec.names || {};
  const zones = defs.map(d => {
    const z = {
      id: d.id,
      name: names[d.id] || d.name,
      type: d.type,
      x: +(d.x * R).toFixed(2),
      z: +(d.z * R).toFixed(2),
      kind: d.kind
    };
    if (d.type === 'circle') z.r = +(d.r * R).toFixed(2);
    else { z.w = +(d.w * R).toFixed(2); z.h = +(d.h * R).toFixed(2); }
    return z;
  });

  /* 刷怪分配：按 kind 权重摊 spawnTotal，走廊与入口为 0（§5.2 硬指标）。
   * 摊不匀的零头补给权重最大的区，保证总数精确等于 spawnTotal ——
   * zone-density 校验的就是这个数，不能「大约 44」。 */
  const pool = spec.kinds || [];
  const total = spec.spawnTotal || suggestSpawnTotal(spec.archetype, spec.size);
  const weightSum = zones.reduce((a, z) => a + (ARCHETYPE_SPAWN_WEIGHT[z.kind] || 0), 0);
  let used = 0;
  zones.forEach((z, i) => {
    const w = ARCHETYPE_SPAWN_WEIGHT[z.kind] || 0;
    if (!w || !pool.length) return;
    let n = Math.floor(total * w / weightSum);
    /* 怪种：按区序号错开取 2~3 种，同一张图里各区不完全一样 */
    const k = pool.length >= 3 ? 3 : pool.length;
    const kinds = [];
    for (let j = 0; j < k; j++) kinds.push(pool[(i + j) % pool.length]);
    z.spawns = { kinds: kinds, count: n };
    used += n;
  });
  /* 零头补给**最少**的区 —— 不是最多的区。
   * 分给最多的区会让 max/min 越拉越大（实测能到 2.0，超 §5.1 的 1.6），
   * 分给最少的区则把各区数量往中间挤，顺带满足「每图每区 max/min ≤ 1.6」。 */
  let rest = total - used;
  for (let guard = 0; rest > 0 && guard < total * 4; guard++) {
    let low = null;
    for (const z of zones) {
      if (!z.spawns || z.spawns.count <= 0) continue;
      if (!low || z.spawns.count < low.spawns.count) low = z;
    }
    if (!low) break;
    low.spawns.count++; rest--;
  }

  return { entry: 'gate', zones: zones };
}

/* 骨架图按需展开并缓存：MAP_ZONES 里手写的老图优先，没有就走 MAP_SPECS */
const _builtZones = {};
function zonesOfMap(mapId) {
  if (MAP_ZONES[mapId] && MAP_ZONES[mapId].zones) return MAP_ZONES[mapId];
  if (_builtZones[mapId]) return _builtZones[mapId];
  const spec = MAP_SPECS[mapId];
  if (!spec) return null;
  const built = buildZones(mapId, spec);
  if (built) _builtZones[mapId] = built;
  return built;
}

/* ---------------- 纯函数 ---------------- */

/* 某张图的区域列表；没有配置时返回 null（调用方回退到旧的圆形逻辑） */
function mapZones(mapId) {
  const m = zonesOfMap(mapId);
  return m && m.zones && m.zones.length ? m.zones : null;
}
function mapEntryZone(mapId) {
  const m = zonesOfMap(mapId);
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

