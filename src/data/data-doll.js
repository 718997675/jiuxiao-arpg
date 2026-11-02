/* ============================================================
 * 数据层 · 装备模组（纸娃娃零件表）
 *
 * **纯数据 + 纯函数，不碰 THREE。** 与 data-vfx.js 同构：
 * 这里是「素材」本身，几何怎么合、颜色怎么算由 doll.js 负责。
 *
 * 一句话：每件装备 = 模组键（槽位 × 造型族 × LOD 段）→ 一串原语。
 * 造型族直接取已有的 `item.baseVar`（0 均衡 / 1 重防 / 2 轻灵），
 * 所以 **零新增存档字段、零迁移**，384 件基底天然分成 10 槽 × 3 族。
 *
 * ---------------------------- 坐标约定 ----------------------------
 * 所有 `p` 都是**相对所属挂点原点**的局部坐标（米），Y 向上、角色朝 +Z。
 * 基准尺寸（charforge 的身体，战士 build=1.06）：
 *   脚底 0 / 髋 0.92 / 胸 1.27 / 肩线 1.40 / 肩关节 1.44 / 颈 1.51
 *   头球心 1.685（半径 0.128*1.1）/ 头顶 1.826
 *   膝 0.46 / 踝 0.05 / 肘 1.085 / 手 0.785
 * 挂点局部原点（世界 Y）：
 *   helmG 1.745(头顶上 0.08) / shoulderL,R 1.465,±0.284 / capeG 1.44,-0.17
 *   torsoG 0.92(髋) / skirtG 0.92 / elbowL,R 1.085 / kneeL,R 0.46
 *
 * ---------------------------- 零件字段 ----------------------------
 *   i   id（同族内唯一，LOD 增量件不允许重名）
 *   g   原语：box / cyl / cone / sph / dome / torus / disc
 *       cyl  s=[上半径, 下半径, 高, 边数]
 *       box  s=[宽, 高, 厚]
 *       cone s=[底半径, 高, 边数]      sph  s=[半径, 边数]
 *       dome s=[半径, 经段, 纬段, 弧度]  torus s=[半径, 管径, 段, 边]
 *       disc s=[半径, 厚, 边数]
 *   p   位置 [x,y,z]（相对挂点）
 *   r   旋转 [rx,ry,rz]（弧度，可省）
 *   sc  缩放 [sx,sy,sz]（可省）
 *   m   通道：main / sub / trim / accent
 *       main   板/布/皮主面 —— 阶材质 × 职业基色
 *       sub    内衬/绑带/暗部 —— 阶材质暗色 × 0.8
 *       trim   金饰/边沿/扣 —— 阶金属色偏金 + 职业 trim
 *       accent 品质小件 —— 品质辉光（单独材质，不吃顶点色）
 *   a   挂点（省略则用族级 anchor）
 *   mx  1 = x 与 rz 随左右镜像（用于肩/手/靴这类成对件）
 *   c   明度偏移（-0.2~0.2，乘算，用来在同通道里拉开层次）
 *
 * ---------------------------- 命名与查重 ----------------------------
 * `DOLL_` / `doll*` 前缀写之前已全局 grep，src/ 内未占用。
 * 加新族前必须再查一次 —— 历史上同名覆盖踩过一次（SKILL_INDEX）。
 * ============================================================ */

/* 三族语义：A 均衡 / B 重防 / C 轻灵。**族是体块语言，不是职业** ——
 * 数据的 C 变体在头盔/项链上偏「法力/暴击」，在甲/肩上偏「闪避/移速」，
 * 但视觉上一律读作「轻、薄、外扩、带飘」。职业只改材质与纹样，不改轮廓。 */
const DOLL_FAM_NAME = ['A', 'B', 'C'];
const DOLL_FAM_LABEL = { A: '均衡', B: '重防', C: '轻灵' };
const DOLL_LOD_LABEL = ['简', '中', '繁'];

/* 挂点 → 父节点路径（台子与游戏共用同一份，避免两处各写一遍）。
 * 全部是 charforge 里已有的空 Group，除了新增的 torsoG / skirtG / footG。 */
const DOLL_ANCHORS = {
  helmG:     'headG',
  shoulderL: 'torso',  shoulderR: 'torso',
  armL:      'armL',   armR:    'armR',       // 袖子：上臂段
  capeG:     'torso',
  torsoG:    'torso',
  skirtG:    'skirt',
  elbowL:    'elbowL',  elbowR: 'elbowR',     // 护手/戒指：前臂段
  kneeL:     'kneeL',   kneeR:  'kneeR',      // 靴：小腿段（**不许挂 leg，腿会变橡皮**）
  relicG:    'torso',
  footG:     'root'                            // 命格：脚下
};

/* 挂点的世界坐标（战士 build=1.06）。**只给剪影判据与文档用**，
 * 运行时一律走真实节点树 —— 这张表算错不影响画面，只会让验收数字骗人，
 * 所以 dev/test-doll.js 会拿 charforge 的比例反算一遍。 */
const DOLL_ANCHOR_WORLD = {
  helmG:     [0, 1.745, 0],
  shoulderL: [-0.284, 1.465, 0], shoulderR: [0.284, 1.465, 0],
  armL:      [-0.305, 1.440, 0], armR:      [0.305, 1.440, 0],
  capeG:     [0, 1.440, -0.170],
  torsoG:    [0, 0.920, 0],      skirtG:    [0, 0.920, 0],
  elbowL:    [-0.305, 1.085, 0], elbowR:    [0.305, 1.085, 0],
  kneeL:     [-0.154, 0.460, 0], kneeR:     [0.154, 0.460, 0],
  relicG:    [0.190, 0.990, 0.060],
  footG:     [0, 0, 0]
};

/* ============================================================
 * 27 个建模族（9 槽 × 3 族）
 * ============================================================ */
const DOLL_PARTS = {

/* ───────────────────────── helm ─────────────────────────
 * 三轴：A 横包裹+垂带向下 / B 前包上突+双角 / C 竖向拉高+横簪 */
helm: {
  A: {
    name: '巾帻', axis: '贴头横裹 · 后垂带',
    anchor: 'helmG',
    parts: [
      { i: 'band',  g: 'cyl',  s: [0.150, 0.154, 0.078, 10], p: [0, 0.005, 0], m: 'main' },
      { i: 'cap',   g: 'dome', s: [0.152, 10, 8, 1.32],      p: [0, 0.018, 0], sc: [1, 0.62, 1], m: 'main' },
      { i: 'knot',  g: 'box',  s: [0.054, 0.050, 0.030],     p: [0, 0.038, 0.146], m: 'trim' },
      { i: 'tailA', g: 'box',  s: [0.030, 0.330, 0.012],     p: [0.045, -0.155, -0.128], r: [0.16, 0, 0.05], m: 'sub' },
      { i: 'tailB', g: 'box',  s: [0.024, 0.280, 0.012],     p: [-0.040, -0.130, -0.132], r: [0.14, 0, -0.04], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'seam', g: 'cyl', s: [0.157, 0.157, 0.010, 10], p: [0, 0.046, 0], m: 'trim' }],
      [{ i: 'pin',  g: 'cyl', s: [0.008, 0.008, 0.320, 6],  p: [0, 0.052, 0], r: [0, 0, Math.PI / 2], m: 'trim' }]
    ]
  },
  B: {
    name: '兽面甲', axis: '覆面前包 · 双角上突',
    anchor: 'helmG',
    parts: [
      { i: 'dome',  g: 'dome', s: [0.168, 10, 8, 1.60],     p: [0, 0.006, 0], sc: [1, 0.92, 1], m: 'main' },
      { i: 'face',  g: 'box',  s: [0.203, 0.105, 0.096],    p: [0, -0.105, 0.078], m: 'main' },
      { i: 'mouth', g: 'cone', s: [0.072, 0.098, 4],        p: [0, -0.140, 0.150], r: [Math.PI / 2, 0, 0], m: 'trim' },
      { i: 'neck',  g: 'box',  s: [0.235, 0.170, 0.022],    p: [0, -0.068, -0.118], r: [0.34, 0, 0], m: 'sub' },
      { i: 'brow',  g: 'box',  s: [0.190, 0.030, 0.032],    p: [0, 0.046, 0.132], m: 'trim' },
      { i: 'hornL', g: 'cone', s: [0.030, 0.175, 5],        p: [-0.105, 0.145, -0.012], r: [0, 0, 0.55], m: 'trim', mx: 1 },
      { i: 'hornR', g: 'cone', s: [0.030, 0.175, 5],        p: [0.105, 0.145, -0.012], r: [0, 0, -0.55], m: 'trim', mx: 1 }
    ],
    lod: [
      [],
      [{ i: 'rivet', g: 'box', s: [0.020, 0.020, 0.014], p: [-0.055, -0.040, 0.130], m: 'trim' },
       { i: 'rivet2', g: 'box', s: [0.020, 0.020, 0.014], p: [0.055, -0.040, 0.130], m: 'trim' }],
      [{ i: 'crest', g: 'box', s: [0.030, 0.090, 0.150], p: [0, 0.115, 0.010], m: 'sub' }]
    ]
  },
  C: {
    name: '立冠', axis: '竖向拉高 · 双簪横穿',
    anchor: 'helmG',
    parts: [
      { i: 'crown', g: 'cyl',  s: [0.105, 0.122, 0.238, 8], p: [0, 0.175, 0], m: 'main' },
      { i: 'cap',   g: 'box',  s: [0.158, 0.034, 0.118],    p: [0, 0.300, 0], m: 'main' },
      { i: 'pin',   g: 'cyl',  s: [0.008, 0.008, 0.378, 6], p: [0, 0.208, 0], r: [0, 0, Math.PI / 2], m: 'trim' },
      { i: 'jade',  g: 'box',  s: [0.052, 0.072, 0.016],    p: [0, 0.052, 0.140], m: 'trim' },
      { i: 'wingL', g: 'box',  s: [0.024, 0.118, 0.088],    p: [-0.130, 0.190, 0], r: [0, 0, -0.12], m: 'sub' },
      { i: 'wingR', g: 'box',  s: [0.024, 0.118, 0.088],    p: [0.130, 0.190, 0], r: [0, 0, 0.12], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'bead', g: 'sph', s: [0.032, 6], p: [0, 0.322, 0], m: 'trim' }],
      [{ i: 'ribbon', g: 'box', s: [0.022, 0.240, 0.010], p: [0, -0.010, -0.138], r: [0.20, 0, 0], m: 'sub' }]
    ]
  }
},

/* ───────────────────────── chest ─────────────────────────
 * 三轴：A 软摆宽袖（宽 0.60）/ B 方厚札甲（宽 0.52 厚 0.32）/ C 贴身斜线（宽 0.40）
 * 下摆挂 skirtG —— 借用现成的摆动曲线，硬裙甲不做（屈膝会插进大腿） */
chest: {
  A: {
    name: '交领战袍', axis: '软摆宽袖 · 交领束腰',
    anchor: 'torsoG',
    parts: [
      { i: 'chest', g: 'cyl', s: [0.232, 0.198, 0.325, 8], p: [0, 0.345, 0], m: 'main' },
      { i: 'belly', g: 'cyl', s: [0.196, 0.218, 0.225, 8], p: [0, 0.105, 0], m: 'main' },
      { i: 'lapL',  g: 'box', s: [0.050, 0.285, 0.024],    p: [-0.066, 0.360, 0.178], r: [0, 0, 0.46], m: 'sub' },
      { i: 'lapR',  g: 'box', s: [0.050, 0.285, 0.024],    p: [0.066, 0.360, 0.178], r: [0, 0, -0.46], m: 'sub' },
      { i: 'sash',  g: 'cyl', s: [0.212, 0.220, 0.064, 8], p: [0, 0.018, 0], m: 'sub' },
      { i: 'hem',   g: 'cyl', s: [0.220, 0.300, 0.470, 8], p: [0, -0.240, 0], a: 'skirtG', m: 'main' },
      { i: 'hemE',  g: 'cyl', s: [0.302, 0.302, 0.026, 8], p: [0, -0.472, 0], a: 'skirtG', m: 'trim' },
      { i: 'slvL',  g: 'cyl', s: [0.092, 0.150, 0.330, 8], p: [0, -0.170, 0], a: 'armL', sc: [1, 1, 0.9], m: 'main' },
      { i: 'slvR',  g: 'cyl', s: [0.092, 0.150, 0.330, 8], p: [0, -0.170, 0], a: 'armR', sc: [1, 1, 0.9], m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'cuffL', g: 'cyl', s: [0.152, 0.152, 0.024, 8], p: [0, -0.338, 0], a: 'armL', sc: [1, 1, 0.9], m: 'trim' },
       { i: 'cuffR', g: 'cyl', s: [0.152, 0.152, 0.024, 8], p: [0, -0.338, 0], a: 'armR', sc: [1, 1, 0.9], m: 'trim' }],
      [{ i: 'slit',  g: 'box', s: [0.120, 0.400, 0.014], p: [-0.078, -0.330, 0.222], r: [0.10, 0, 0.05], a: 'skirtG', m: 'sub' },
       { i: 'slitR', g: 'box', s: [0.120, 0.400, 0.014], p: [0.078, -0.330, 0.222], r: [0.10, 0, -0.05], a: 'skirtG', m: 'sub' }]
    ]
  },
  B: {
    name: '札甲', axis: '方厚胸板 · 三排甲片',
    anchor: 'torsoG',
    parts: [
      { i: 'plate',  g: 'box', s: [0.520, 0.345, 0.315], p: [0, 0.360, 0], m: 'main' },
      { i: 'course', g: 'box', s: [0.480, 0.048, 0.300], p: [0, 0.212, 0], m: 'sub' },
      { i: 'course2', g: 'box', s: [0.500, 0.048, 0.312], p: [0, 0.162, 0], m: 'sub' },
      { i: 'course3', g: 'box', s: [0.520, 0.048, 0.322], p: [0, 0.112, 0], m: 'sub' },
      { i: 'mirror', g: 'cyl', s: [0.088, 0.088, 0.034, 10], p: [0, 0.365, 0.170], r: [Math.PI / 2, 0, 0], m: 'trim' },
      { i: 'strapL', g: 'box', s: [0.062, 0.300, 0.032], p: [-0.152, 0.430, 0.150], r: [0, 0, 0.16], m: 'sub' },
      { i: 'strapR', g: 'box', s: [0.062, 0.300, 0.032], p: [0.152, 0.430, 0.150], r: [0, 0, -0.16], m: 'sub' },
      { i: 'hem',    g: 'box', s: [0.500, 0.300, 0.235], p: [0, -0.195, 0], a: 'skirtG', m: 'main' },
      { i: 'hemE',   g: 'box', s: [0.512, 0.030, 0.245], p: [0, -0.342, 0], a: 'skirtG', m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'rivet', g: 'sph', s: [0.018, 5], p: [-0.170, 0.480, 0.150], m: 'trim' },
       { i: 'rivet2', g: 'sph', s: [0.018, 5], p: [0.170, 0.480, 0.150], m: 'trim' }],
      [{ i: 'tassel', g: 'box', s: [0.090, 0.190, 0.026], p: [0.070, -0.400, 0.130], a: 'skirtG', m: 'sub' },
       { i: 'tassel2', g: 'box', s: [0.070, 0.150, 0.022], p: [-0.090, -0.385, 0.120], a: 'skirtG', m: 'sub' }]
    ]
  },
  C: {
    name: '轻裘', axis: '贴身斜挂 · 短摆',
    anchor: 'torsoG',
    parts: [
      { i: 'vest',  g: 'cyl', s: [0.226, 0.192, 0.300, 8], p: [0, 0.350, 0], m: 'main' },
      { i: 'strap', g: 'box', s: [0.115, 0.445, 0.026],    p: [0.062, 0.360, 0.174], r: [0, 0, 0.56], m: 'sub' },
      { i: 'buck',  g: 'box', s: [0.042, 0.042, 0.022],    p: [0.104, 0.238, 0.198], m: 'trim' },
      { i: 'hem',   g: 'cyl', s: [0.216, 0.252, 0.220, 8], p: [0, -0.108, 0], a: 'skirtG', m: 'main' },
      { i: 'pouch', g: 'box', s: [0.095, 0.105, 0.066],    p: [0.168, 0.010, 0.142], m: 'sub' },
      { i: 'slvL',  g: 'cyl', s: [0.078, 0.090, 0.230, 8], p: [0, -0.150, 0], a: 'armL', m: 'main' },
      { i: 'slvR',  g: 'cyl', s: [0.078, 0.090, 0.230, 8], p: [0, -0.150, 0], a: 'armR', m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'cord', g: 'box', s: [0.016, 0.380, 0.014], p: [0.062, 0.360, 0.192], r: [0, 0, 0.56], m: 'trim' }],
      [{ i: 'clasp', g: 'box', s: [0.036, 0.070, 0.020], p: [-0.120, 0.300, 0.170], r: [0, 0, -0.18], m: 'trim' }]
    ]
  }
},

/* ───────────────────────── shoulders ─────────────────────────
 * 三轴：A 弧面贴肩（薄盘）/ B 三层叠片（厚塔）/ C 骨刺外扩上扬
 * 全部标 mx:1 —— 左右镜像，x 与 rz 取反 */
shoulders: {
  A: {
    name: '云肩', axis: '弧面贴肩 · 边缘滚边',
    anchor: 'shoulderL',
    parts: [
      { i: 'disc', g: 'cyl', s: [0.158, 0.198, 0.048, 8], p: [0.055, 0.010, 0], r: [0, 0, 0.20], m: 'main', mx: 1 },
      { i: 'rim',  g: 'cyl', s: [0.200, 0.200, 0.014, 8], p: [0.055, -0.016, 0], r: [0, 0, 0.20], m: 'trim', mx: 1 },
      { i: 'drop', g: 'box', s: [0.032, 0.125, 0.014],    p: [0.118, -0.078, 0.020], r: [0, 0, 0.08], m: 'sub', mx: 1 }
    ],
    lod: [
      [],
      [{ i: 'cloud', g: 'cyl', s: [0.026, 0.026, 0.010, 6], p: [0.100, 0.040, 0.090], m: 'trim', mx: 1 }],
      [{ i: 'drop2', g: 'box', s: [0.026, 0.095, 0.012], p: [0.150, -0.055, -0.040], r: [0, 0, 0.16], m: 'sub', mx: 1 }]
    ]
  },
  B: {
    name: '板甲肩', axis: '三层叠片 · 厚塔下压',
    anchor: 'shoulderL',
    parts: [
      { i: 't1', g: 'cyl', s: [0.132, 0.170, 0.080, 7], p: [0.030, 0.072, 0], r: [0, 0, 0.16], m: 'main', mx: 1 },
      { i: 't2', g: 'cyl', s: [0.170, 0.206, 0.080, 7], p: [0.046, -0.004, 0], r: [0, 0, 0.16], m: 'main', mx: 1 },
      { i: 't3', g: 'cyl', s: [0.206, 0.230, 0.074, 7], p: [0.062, -0.080, 0], r: [0, 0, 0.16], m: 'main', mx: 1 },
      { i: 'edge', g: 'cyl', s: [0.232, 0.232, 0.016, 7], p: [0.066, -0.116, 0], r: [0, 0, 0.16], m: 'trim', mx: 1 },
      { i: 'spike', g: 'cone', s: [0.046, 0.130, 5],      p: [0.072, 0.150, 0], r: [0, 0, 0.34], m: 'trim', mx: 1 }
    ],
    lod: [
      [],
      [{ i: 'rivet', g: 'sph', s: [0.016, 5], p: [0.150, 0.020, 0.045], m: 'trim', mx: 1 },
       { i: 'rivet2', g: 'sph', s: [0.016, 5], p: [0.150, 0.020, -0.055], m: 'trim', mx: 1 }],
      [{ i: 't4', g: 'cyl', s: [0.230, 0.250, 0.056, 7], p: [0.078, -0.150, 0], r: [0, 0, 0.16], m: 'main', mx: 1 }]
    ]
  },
  C: {
    name: '羽肩', axis: '骨刺外扩上扬',
    anchor: 'shoulderL',
    parts: [
      { i: 'base', g: 'sph',  s: [0.105, 7],       p: [0.015, 0.015, 0], sc: [1.15, 0.85, 1], m: 'sub', mx: 1 },
      { i: 'sp1',  g: 'cone', s: [0.034, 0.300, 5], p: [0.098, 0.158, 0], r: [0, 0, 0.62], m: 'main', mx: 1 },
      { i: 'sp2',  g: 'cone', s: [0.028, 0.250, 5], p: [0.046, 0.148, 0.062], r: [0.18, 0, 0.30], m: 'main', mx: 1 },
      { i: 'sp3',  g: 'cone', s: [0.026, 0.215, 5], p: [0.046, 0.140, -0.068], r: [-0.20, 0, 0.34], m: 'main', mx: 1 }
    ],
    lod: [
      [],
      [{ i: 'sp4', g: 'cone', s: [0.022, 0.170, 5], p: [0.130, 0.120, 0.030], r: [0.10, 0, 0.88], m: 'main', mx: 1 }],
      [{ i: 'sp5', g: 'cone', s: [0.020, 0.145, 5], p: [0.120, 0.110, -0.060], r: [-0.14, 0, 0.92], m: 'main', mx: 1 },
       { i: 'tip', g: 'sph',  s: [0.024, 5], p: [0.196, 0.242, 0], m: 'trim', mx: 1 }]
    ]
  }
},

/* ───────────────────────── cloak ─────────────────────────
 * 披风是从背后看的：辨识度给「长度 + 下摆宽度 + 飘动幅度」，不给细节件数。
 * 挂 capeG（update 会按 walkAmp 摆 rotation.x），零件坐标相对它。 */
cloak: {
  A: {
    name: '短氅', axis: '及膝直摆',
    anchor: 'capeG',
    parts: [
      { i: 'cloth', g: 'box', s: [0.440, 0.620, 0.028], p: [0, -0.310, -0.020], m: 'main' },
      { i: 'yoke',  g: 'box', s: [0.400, 0.052, 0.048], p: [0, 0.010, 0.000], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'edge', g: 'box', s: [0.452, 0.030, 0.034], p: [0, -0.618, -0.020], m: 'trim' }],
      [{ i: 'fold', g: 'box', s: [0.030, 0.560, 0.016], p: [0.130, -0.310, -0.040], m: 'sub' },
       { i: 'fold2', g: 'box', s: [0.030, 0.560, 0.016], p: [-0.130, -0.310, -0.040], m: 'sub' }]
    ]
  },
  B: {
    name: '重氅', axis: '及踝加厚 · 毛领',
    anchor: 'capeG',
    parts: [
      { i: 'cloth', g: 'box', s: [0.580, 1.120, 0.052], p: [0, -0.560, -0.030], m: 'main' },
      { i: 'fur',   g: 'cyl', s: [0.212, 0.236, 0.105, 10], p: [0, 0.030, 0], m: 'sub' },
      { i: 'yoke',  g: 'box', s: [0.520, 0.070, 0.062], p: [0, -0.010, 0], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'edge', g: 'box', s: [0.594, 0.038, 0.060], p: [0, -1.108, -0.030], m: 'trim' }],
      [{ i: 'inner', g: 'box', s: [0.520, 1.040, 0.030], p: [0, -0.545, -0.062], m: 'sub' }]
    ]
  },
  C: {
    name: '纱氅', axis: '双层轻飘',
    anchor: 'capeG',
    parts: [
      { i: 'cloth',  g: 'box', s: [0.480, 1.240, 0.014], p: [0, -0.620, 0.000], m: 'main' },
      { i: 'cloth2', g: 'box', s: [0.400, 1.100, 0.012], p: [0, -0.550, -0.052], m: 'sub' },
      { i: 'yoke',   g: 'box', s: [0.420, 0.044, 0.040], p: [0, 0.008, 0], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'ribbon', g: 'box', s: [0.026, 0.900, 0.010], p: [0.190, -0.520, 0.020], r: [0, 0, 0.06], m: 'trim' }],
      [{ i: 'ribbon2', g: 'box', s: [0.022, 0.820, 0.010], p: [-0.190, -0.480, 0.020], r: [0, 0, -0.06], m: 'trim' }]
    ]
  }
},

/* ───────────────────────── gloves ─────────────────────────
 * 挂肘关节（前臂从 0 到 -0.30）。**护手不许再染手部皮肤材质** ——
 * 那是 handMat，染了等于两只手变铁色（现状 bug）。 */
gloves: {
  A: {
    name: '布手', axis: '袖口翻边',
    anchor: 'elbowL',
    parts: [
      { i: 'cuff', g: 'cyl', s: [0.066, 0.074, 0.150, 7], p: [0, -0.205, 0], m: 'main' },
      { i: 'fold', g: 'cyl', s: [0.080, 0.080, 0.030, 7], p: [0, -0.286, 0], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'seam', g: 'cyl', s: [0.070, 0.070, 0.008, 7], p: [0, -0.252, 0], m: 'trim' }],
      [{ i: 'tie', g: 'box', s: [0.012, 0.090, 0.012], p: [0.052, -0.230, 0.040], r: [0, 0, 0.4], m: 'trim' }]
    ]
  },
  B: {
    name: '臂甲', axis: '硬筒 · 肘尖',
    anchor: 'elbowL',
    parts: [
      { i: 'vamb',  g: 'cyl',  s: [0.080, 0.070, 0.240, 7], p: [0, -0.155, 0], m: 'main' },
      { i: 'point', g: 'cone', s: [0.042, 0.105, 4],        p: [0, 0.008, -0.060], r: [-0.38, 0, 0], m: 'trim' },
      { i: 'knuck', g: 'box',  s: [0.080, 0.022, 0.064],    p: [0, -0.322, 0], m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'band', g: 'cyl', s: [0.083, 0.083, 0.014, 7], p: [0, -0.235, 0], m: 'trim' }],
      [{ i: 'knuck2', g: 'box', s: [0.076, 0.018, 0.060], p: [0, -0.352, 0], m: 'trim' }]
    ]
  },
  C: {
    name: '缠绳', axis: '交叉绑带 · 露指',
    anchor: 'elbowL',
    parts: [
      { i: 'wrap', g: 'box', s: [0.016, 0.190, 0.016], p: [0.050, -0.170, 0.048], r: [0, 0, 0.55], m: 'sub' },
      { i: 'wrap2', g: 'box', s: [0.016, 0.190, 0.016], p: [-0.050, -0.170, 0.048], r: [0, 0, -0.55], m: 'sub' },
      { i: 'wrap3', g: 'box', s: [0.016, 0.180, 0.016], p: [0.048, -0.175, -0.050], r: [0, 0, -0.50], m: 'sub' },
      { i: 'wrap4', g: 'box', s: [0.016, 0.180, 0.016], p: [-0.048, -0.175, -0.050], r: [0, 0, 0.50], m: 'sub' },
      { i: 'palm', g: 'box', s: [0.072, 0.050, 0.022], p: [0, -0.300, 0.044], m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'brace', g: 'cyl', s: [0.064, 0.064, 0.012, 7], p: [0, -0.250, 0], m: 'trim' }],
      [{ i: 'knot', g: 'sph', s: [0.020, 5], p: [0.056, -0.245, 0.040], m: 'trim' }]
    ]
  }
},

/* ───────────────────────── boots ─────────────────────────
 * 挂膝关节（小腿）。**绝不挂 leg** —— leg 是髋关节，走路时会把腿拉成橡皮。 */
boots: {
  A: {
    name: '布履', axis: '薄底 · 绑腿布',
    anchor: 'kneeL',
    parts: [
      { i: 'wrap', g: 'cyl', s: [0.098, 0.106, 0.200, 7], p: [0, -0.245, 0], m: 'main' },
      { i: 'sole', g: 'box', s: [0.152, 0.055, 0.272], p: [0, -0.405, 0.045], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'band', g: 'cyl', s: [0.101, 0.101, 0.014, 7], p: [0, -0.300, 0], m: 'trim' }],
      [{ i: 'strap', g: 'box', s: [0.150, 0.016, 0.060], p: [0, -0.360, 0.100], m: 'trim' }]
    ]
  },
  B: {
    name: '战靴', axis: '高筒 · 胫甲 · 铁头',
    anchor: 'kneeL',
    parts: [
      { i: 'shaft', g: 'cyl', s: [0.118, 0.108, 0.290, 7], p: [0, -0.225, 0], m: 'main' },
      { i: 'shin',  g: 'box', s: [0.142, 0.255, 0.064],    p: [0, -0.245, 0.098], m: 'main' },
      { i: 'toe',   g: 'box', s: [0.152, 0.082, 0.122],    p: [0, -0.375, 0.128], m: 'trim' },
      { i: 'sole',  g: 'box', s: [0.160, 0.048, 0.290],    p: [0, -0.412, 0.050], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'buck', g: 'box', s: [0.040, 0.030, 0.026], p: [0, -0.135, 0.108], m: 'trim' },
       { i: 'buck2', g: 'box', s: [0.040, 0.030, 0.026], p: [0, -0.320, 0.112], m: 'trim' }],
      [{ i: 'plate', g: 'box', s: [0.132, 0.088, 0.030], p: [0, -0.052, 0.108], m: 'trim' }]
    ]
  },
  C: {
    name: '轻履', axis: '露趾 · 交叉带 · 铃',
    anchor: 'kneeL',
    parts: [
      { i: 'sole', g: 'box', s: [0.142, 0.042, 0.205], p: [0, -0.412, 0.030], m: 'sub' },
      { i: 'band', g: 'box', s: [0.150, 0.020, 0.086], p: [0, -0.300, 0.020], r: [0.55, 0, 0], m: 'main' },
      { i: 'band2', g: 'box', s: [0.150, 0.020, 0.086], p: [0, -0.348, 0.040], r: [-0.55, 0, 0], m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'bell', g: 'sph', s: [0.022, 6], p: [0.062, -0.300, 0.062], m: 'trim' }],
      [{ i: 'cord', g: 'box', s: [0.010, 0.120, 0.010], p: [-0.058, -0.355, 0.055], r: [0, 0, 0.10], m: 'trim' }]
    ]
  }
},

/* ───────────────────────── belt ─────────────────────────
 * 三轴：宽平 / 厚垂 / 细 */
belt: {
  A: {
    name: '腰封', axis: '宽布 · 玉扣',
    anchor: 'torsoG',
    parts: [
      { i: 'band', g: 'cyl', s: [0.214, 0.220, 0.105, 8], p: [0, 0.010, 0], m: 'main' },
      { i: 'jade', g: 'box', s: [0.086, 0.086, 0.028],    p: [0, 0.010, 0.208], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'edge', g: 'cyl', s: [0.222, 0.222, 0.012, 8], p: [0, 0.062, 0], m: 'trim' }],
      [{ i: 'knot', g: 'box', s: [0.050, 0.050, 0.020], p: [0, 0.010, 0.222], r: [0, 0, Math.PI / 4], m: 'sub' }]
    ]
  },
  B: {
    name: '铜钉带', axis: '厚带 · 三排钉 · 垂片',
    anchor: 'torsoG',
    parts: [
      { i: 'band', g: 'cyl', s: [0.218, 0.226, 0.082, 8], p: [0, 0.005, 0], m: 'main' },
      { i: 'buck', g: 'box', s: [0.078, 0.070, 0.030],    p: [0, 0.005, 0.212], m: 'trim' },
      { i: 'horn', g: 'box', s: [0.096, 0.235, 0.024],    p: [0.055, -0.118, 0.202], r: [0.06, 0, 0], m: 'main' }
    ],
    lod: [
      [],
      [{ i: 'stud', g: 'sph', s: [0.015, 5], p: [-0.120, 0.040, 0.182], m: 'trim' },
       { i: 'stud2', g: 'sph', s: [0.015, 5], p: [-0.170, 0.020, 0.130], m: 'trim' }],
      [{ i: 'stud3', g: 'sph', s: [0.015, 5], p: [0.120, 0.040, 0.182], m: 'trim' },
       { i: 'stud4', g: 'sph', s: [0.015, 5], p: [0.170, 0.020, 0.130], m: 'trim' }]
    ]
  },
  C: {
    name: '细带', axis: '双绳 · 玉坠',
    anchor: 'torsoG',
    parts: [
      { i: 'cord', g: 'cyl', s: [0.216, 0.216, 0.022, 10], p: [0, 0.032, 0], m: 'sub' },
      { i: 'cord2', g: 'cyl', s: [0.216, 0.216, 0.018, 10], p: [0, -0.012, 0], m: 'sub' },
      { i: 'drop', g: 'box', s: [0.040, 0.115, 0.018],     p: [0.030, -0.080, 0.206], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'bead', g: 'sph', s: [0.018, 5], p: [-0.030, -0.070, 0.204], m: 'trim' }],
      [{ i: 'bead2', g: 'sph', s: [0.016, 5], p: [-0.070, -0.050, 0.196], m: 'trim' }]
    ]
  }
},

/* ───────────────────────── amulet ─────────────────────────
 * 三轴：单点 / 多点下垂 / 侧挂 */
amulet: {
  A: {
    name: '玉牌', axis: '颈环 + 单坠',
    anchor: 'torsoG',
    parts: [
      { i: 'ring', g: 'cyl', s: [0.080, 0.080, 0.016, 10], p: [0, 0.012, 0], m: 'sub' },
      { i: 'cordL', g: 'box', s: [0.010, 0.170, 0.010], p: [-0.030, 0.040, 0.078], r: [0.42, 0, 0.14], m: 'sub' },
      { i: 'cordR', g: 'box', s: [0.010, 0.170, 0.010], p: [0.030, 0.040, 0.078], r: [0.42, 0, -0.14], m: 'sub' },
      { i: 'plate', g: 'box', s: [0.046, 0.064, 0.014], p: [0, -0.056, 0.148], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'frame', g: 'box', s: [0.058, 0.078, 0.010], p: [0, -0.056, 0.142], m: 'main' }],
      [{ i: 'tassel', g: 'box', s: [0.014, 0.080, 0.010], p: [0, -0.126, 0.146], m: 'sub' }]
    ]
  },
  B: {
    name: '珠串', axis: '多珠下垂',
    anchor: 'torsoG',
    parts: [
      { i: 'ring', g: 'cyl', s: [0.082, 0.082, 0.016, 10], p: [0, 0.012, 0], m: 'sub' },
      /* 9 颗沿 U 形弧：角度从 -1.15 到 1.15，半径 0.115，下垂 -0.04 */
      { i: 'b0', g: 'sph', s: [0.017, 5], p: [-0.104, 0.001, 0.049], m: 'trim' },
      { i: 'b1', g: 'sph', s: [0.017, 5], p: [-0.079, -0.026, 0.083], m: 'trim' },
      { i: 'b2', g: 'sph', s: [0.017, 5], p: [-0.043, -0.042, 0.107], m: 'trim' },
      { i: 'b3', g: 'sph', s: [0.017, 5], p: [0.000, -0.048, 0.115], m: 'trim' },
      { i: 'b4', g: 'sph', s: [0.017, 5], p: [0.043, -0.042, 0.107], m: 'trim' },
      { i: 'b5', g: 'sph', s: [0.017, 5], p: [0.079, -0.026, 0.083], m: 'trim' },
      { i: 'b6', g: 'sph', s: [0.017, 5], p: [0.104, 0.001, 0.049], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'b7', g: 'sph', s: [0.015, 5], p: [-0.020, -0.075, 0.112], m: 'trim' },
       { i: 'b8', g: 'sph', s: [0.015, 5], p: [0.020, -0.075, 0.112], m: 'trim' }],
      [{ i: 'pend', g: 'box', s: [0.022, 0.070, 0.012], p: [0, -0.115, 0.108], m: 'main' }]
    ]
  },
  C: {
    name: '铃', axis: '金属铃 · 侧挂',
    anchor: 'torsoG',
    parts: [
      { i: 'ring', g: 'cyl', s: [0.080, 0.080, 0.014, 10], p: [0, 0.012, 0], m: 'sub' },
      { i: 'cord', g: 'box', s: [0.010, 0.140, 0.010], p: [0.062, -0.020, 0.096], r: [0.20, 0, -0.45], m: 'sub' },
      { i: 'bell', g: 'cone', s: [0.030, 0.052, 5], p: [0.088, -0.092, 0.098], m: 'trim' },
      { i: 'clap', g: 'sph', s: [0.014, 5], p: [0.088, -0.120, 0.098], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'bell2', g: 'cone', s: [0.022, 0.040, 5], p: [0.100, -0.060, 0.070], m: 'trim' }],
      [{ i: 'cord2', g: 'box', s: [0.008, 0.090, 0.008], p: [0.098, -0.030, 0.082], r: [0.1, 0, -0.55], m: 'sub' }]
    ]
  }
},

/* ───────────────────────── relic（法器）─────────────────────────
 * 三轴：点 / 面 / 串 —— 都在腰侧或背后，不占轮廓中心 */
relic: {
  A: {
    name: '浮珠', axis: '单点 · 腰间绕行',
    anchor: 'relicG',
    parts: [
      { i: 'orb', g: 'sph', s: [0.038, 8], p: [0, 0, 0], m: 'trim' },
      { i: 'halo', g: 'torus', s: [0.058, 0.008, 4, 10], p: [0, 0, 0], r: [0.55, 0, 0], m: 'sub' }
    ],
    lod: [
      [],
      [{ i: 'spark', g: 'sph', s: [0.016, 5], p: [0.040, 0.048, 0.010], m: 'accent' }],
      [{ i: 'spark2', g: 'sph', s: [0.013, 5], p: [-0.046, -0.030, 0.024], m: 'accent' }]
    ]
  },
  B: {
    name: '符板', axis: '背后三竖符',
    anchor: 'relicG',
    parts: [
      { i: 'f1', g: 'box', s: [0.054, 0.185, 0.008], p: [-0.076, 0, 0], m: 'main' },
      { i: 'f2', g: 'box', s: [0.054, 0.185, 0.008], p: [0, 0.014, 0], m: 'main' },
      { i: 'f3', g: 'box', s: [0.054, 0.185, 0.008], p: [0.076, 0, 0], m: 'main' },
      { i: 'bar', g: 'box', s: [0.230, 0.014, 0.012], p: [0, 0.098, 0], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'ink', g: 'box', s: [0.030, 0.012, 0.004], p: [0, 0.060, 0.006], m: 'trim' }],
      [{ i: 'ink2', g: 'box', s: [0.012, 0.090, 0.004], p: [-0.076, -0.010, 0.006], m: 'trim' }]
    ]
  },
  C: {
    name: '铃铎', axis: '腰侧三铃',
    anchor: 'relicG',
    parts: [
      { i: 'arm', g: 'box', s: [0.010, 0.130, 0.010], p: [0, 0.060, 0], m: 'sub' },
      { i: 'b1', g: 'cone', s: [0.032, 0.056, 5], p: [0, -0.020, 0], m: 'trim' },
      { i: 'b2', g: 'cone', s: [0.026, 0.046, 5], p: [-0.048, 0.006, 0.018], m: 'trim' },
      { i: 'b3', g: 'cone', s: [0.026, 0.046, 5], p: [0.048, 0.006, 0.018], m: 'trim' }
    ],
    lod: [
      [],
      [{ i: 'cord', g: 'box', s: [0.008, 0.050, 0.008], p: [-0.048, 0.048, 0.018], m: 'sub' }],
      [{ i: 'clap', g: 'sph', s: [0.012, 5], p: [0, -0.056, 0], m: 'accent' }]
    ]
  }
},

/* ───────────────────────── ring（只做光点）─────────────────────────
 * 直径 2 厘米的环在正常镜头下不到 2 像素。方案 §4.3 已经决定：不做环，做手上的
 * 元素光点 + 命中一闪。挂肘关节（手的局部位置）。 */
ring: {
  A: {
    name: '素环', axis: '一点微光',
    anchor: 'elbowL',
    parts: [
      { i: 'p', g: 'sph', s: [0.013, 5], p: [0.046, -0.318, 0.022], m: 'accent' }
    ],
    lod: [[], [], [{ i: 'p2', g: 'sph', s: [0.009, 5], p: [0.054, -0.300, -0.010], m: 'accent' }]]
  },
  B: {
    name: '镶石戒', axis: '宽点 + 元素石',
    anchor: 'elbowL',
    parts: [
      { i: 'p', g: 'sph', s: [0.018, 6], p: [0.048, -0.320, 0.024], m: 'accent' },
      { i: 'ring', g: 'cyl', s: [0.020, 0.020, 0.012, 8], p: [0.048, -0.320, 0.024], r: [1.57, 0, 0], m: 'trim' }
    ],
    lod: [[], [{ i: 'p2', g: 'sph', s: [0.011, 5], p: [-0.048, -0.318, 0.020], m: 'accent' }], []]
  },
  C: {
    name: '双环', axis: '两点 + 短链',
    anchor: 'elbowL',
    parts: [
      { i: 'p', g: 'sph', s: [0.014, 5], p: [0.046, -0.316, 0.022], m: 'accent' },
      { i: 'p2', g: 'sph', s: [0.014, 5], p: [-0.044, -0.316, 0.020], m: 'accent' },
      { i: 'link', g: 'box', s: [0.008, 0.012, 0.008], p: [0.030, -0.334, 0.018], m: 'trim' }
    ],
    lod: [[], [], [{ i: 'link2', g: 'box', s: [0.008, 0.012, 0.008], p: [-0.028, -0.334, 0.016], m: 'trim' }]]
  }
},

/* ───────────────────────── fate（命格）─────────────────────────
 * 机制位：脚下符纹环（静态）/ 背后命盘（旋转）/ 双肩命火。 */
fate: {
  A: {
    name: '符纹环', axis: '脚下静态圆',
    anchor: 'footG',
    parts: [
      { i: 'ring', g: 'torus', s: [0.440, 0.010, 4, 24], p: [0, 0.020, 0], r: [Math.PI / 2, 0, 0], m: 'accent' },
      { i: 'inner', g: 'torus', s: [0.310, 0.007, 4, 20], p: [0, 0.020, 0], r: [Math.PI / 2, 0, 0], m: 'accent' }
    ],
    lod: [[], [{ i: 'tick', g: 'box', s: [0.014, 0.006, 0.080], p: [0, 0.020, 0.400], m: 'accent' }], []]
  },
  B: {
    name: '命盘', axis: '背后立盘 · 半透明',
    anchor: 'footG',
    parts: [
      { i: 'disc', g: 'disc', s: [0.300, 0.008, 16], p: [0, 1.320, -0.330], r: [Math.PI / 2, 0, 0], m: 'accent' },
      { i: 'rim', g: 'torus', s: [0.310, 0.010, 4, 20], p: [0, 1.320, -0.330], m: 'trim' },
      { i: 'spoke', g: 'box', s: [0.014, 0.560, 0.008], p: [0, 1.320, -0.336], m: 'trim' }
    ],
    lod: [[], [{ i: 'spoke2', g: 'box', s: [0.560, 0.014, 0.008], p: [0, 1.320, -0.336], m: 'trim' }], []]
  },
  C: {
    name: '命火', axis: '双肩火点',
    anchor: 'footG',
    parts: [
      { i: 'fl', g: 'sph', s: [0.045, 6], p: [-0.300, 1.640, -0.020], m: 'accent' },
      { i: 'fr', g: 'sph', s: [0.045, 6], p: [0.300, 1.640, -0.020], m: 'accent' }
    ],
    lod: [[], [{ i: 'core', g: 'sph', s: [0.022, 5], p: [-0.300, 1.640, -0.020], m: 'trim' },
                { i: 'core2', g: 'sph', s: [0.022, 5], p: [0.300, 1.640, -0.020], m: 'trim' }], []]
  }
}

};

/* ============================================================
 * 武器 / 副手模具骨架
 *
 * 武器不走零件表，但**也不许只做缩放**（缩放 = 换皮，剪影几乎重合）。
 * 这里按「三层」写：
 *
 *   契约层  `len` / `grip` —— 总长与握点。**长度锁死，只有形制能改，装饰不能改。**
 *           刀 1.24 米是 charforge 的 WPN 曲线与镜头容差算出来的：1.40 米举刀顶出画面、
 *           劈砍扎穿地面（charforge.js:107 的注释）。所以 B 族做「更宽」而不是「更长」。
 *   形制层  `w` / `t` —— **只作用于 x（宽）与 z（厚），y 恒为 1**。这是「扩大小」的正确做法：
 *           非等比缩放不改变到指尖的距离，挥砍手感与判定观感不受影响。
 *   装饰层  `trim[]` —— 形制件，挂固定锚点（刃根 / 柄尾 / 刃尖）。LOD 与品质只往这里加。
 *
 * 挂点坐标与 WeaponForge 一致：握点在 y=0，刃向 +y，柄向 −y，厚度朝 z。
 * ============================================================ */
const DOLL_WEAPON_RIG = {
  /* 单刃厚背大刀（战士） */
  saber: {
    len: 1.24, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '标准厚背', trim: [] },
      B: { w: 1.42, t: 1.34, tag: '阔刃重刀', trim: ['spine', 'guardBig'] },
      C: { w: 0.78, t: 0.74, tag: '细身弧刀', trim: ['tassel'] }
    }
  },
  /* 双刃剑 */
  sword: {
    len: 1.02, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '直刃', trim: [] },
      B: { w: 1.34, t: 1.26, tag: '阔剑', trim: ['spine', 'guardBig'] },
      C: { w: 0.76, t: 0.70, tag: '刺剑', trim: ['tassel', 'ringGuard'] }
    }
  },
  /* 桃木剑（道士） */
  taojian: {
    len: 0.96, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '常制', trim: [] },
      B: { w: 1.30, t: 1.24, tag: '镇坛厚剑', trim: ['spine', 'guardBig'] },
      C: { w: 0.80, t: 0.78, tag: '轻身细剑', trim: ['tassel', 'ribbon'] }
    }
  },
  /* 云头法杖（法师） */
  staff: {
    len: 1.56, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '云头', trim: [] },
      B: { w: 1.26, t: 1.22, tag: '镇山重杖', trim: ['spine', 'ringGuard'] },
      C: { w: 0.82, t: 0.80, tag: '轻杖', trim: ['tassel', 'ribbon'] }
    }
  },
  /* 长杆刀 / 巨斧：同样锁长度，只改宽厚 */
  glaive: {
    len: 1.70, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '常制长刀', trim: [] },
      B: { w: 1.40, t: 1.30, tag: '阔刃长刀', trim: ['spine'] },
      C: { w: 0.78, t: 0.76, tag: '轻杆长刀', trim: ['tassel', 'ribbon'] }
    }
  },
  axe: {
    len: 1.36, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '常制战斧', trim: [] },
      B: { w: 1.38, t: 1.32, tag: '巨斧', trim: ['spine'] },
      C: { w: 0.80, t: 0.78, tag: '轻斧', trim: ['tassel'] }
    }
  },
  /* 副手：盾 / 珠 / 符 —— 三个形状本身就是三种形制，族只改尺寸与装饰 */
  shield: {
    len: 0.60, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '圆盾', trim: [] },
      B: { w: 1.24, t: 1.30, tag: '重盾', trim: ['spine', 'ringGuard'] },
      C: { w: 0.82, t: 0.78, tag: '轻盾', trim: ['tassel'] }
    }
  },
  orb: {
    len: 0.46, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '法珠', trim: [] },
      B: { w: 1.22, t: 1.22, tag: '重珠', trim: ['ringGuard'] },
      C: { w: 0.84, t: 0.84, tag: '轻珠', trim: ['tassel'] }
    }
  },
  charm: {
    len: 0.44, grip: 0,
    fam: {
      A: { w: 1.00, t: 1.00, tag: '符板', trim: [] },
      B: { w: 1.26, t: 1.20, tag: '镇符', trim: ['guardBig'] },
      C: { w: 0.84, t: 0.82, tag: '轻符', trim: ['tassel', 'ribbon'] }
    }
  }
};

/* 装饰件：id → 原语 + 锚点（锚点是刃根的 y=0 / 柄尾 / 刃尖，由 doll.js 按 len 换算）。
 * 和防具零件同一套字段，只是坐标轴换成「沿刃」的 y。 */
const DOLL_WEAPON_TRIM = {
  spine:     { g: 'box', s: [0.022, 0.500, 0.034], p: [-0.040, 0.400, 0], m: 'trim' },
  guardBig:  { g: 'box', s: [0.240, 0.034, 0.052], p: [0, 0.048, 0], m: 'trim' },
  ringGuard: { g: 'torus', s: [0.062, 0.010, 4, 10], p: [0, 0.052, 0], r: [Math.PI / 2, 0, 0], m: 'trim' },
  tassel:    { g: 'box', s: [0.016, 0.240, 0.014], p: [0.034, -0.300, 0.020], r: [0, 0, 0.12], m: 'sub' },
  ribbon:    { g: 'box', s: [0.012, 0.320, 0.010], p: [-0.030, -0.330, -0.016], r: [0.10, 0, -0.16], m: 'sub' }
};

/* ============================================================
 * 唯一派生入口 —— 任何地方都不许自己拼 key
 * ============================================================ */

/* 槽位 → 是否有零件表（武器/副手走另一条路） */
function dollHasParts(slot) { return !!DOLL_PARTS[slot]; }

/* 变体下标 → 族。越界一律兜底 A（按索引取数组必须兜底，这条是拿线上白屏换的） */
function dollFamily(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 'A';
  return ['A', 'B', 'C'][Math.round(n) % 3] || 'A';
}

/* 基底阶 → LOD 段：0~2 简 / 3~5 中 / 6~7 繁。只加件不换件。 */
function dollLod(tier) {
  const t = Math.round(Number(tier) || 0);
  if (t <= 2) return 0;
  if (t <= 5) return 1;
  return 2;
}

/* 物品 → 模组键。baseVar 缺失的老档按 baseName 反查基底表定位变体下标。 */
function dollKeyOf(item) {
  if (!item) return null;
  const slot = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  let fam = dollFamily(item.baseVar);
  if ((item.baseVar === undefined || item.baseVar === null) && typeof itemBaseList === 'function') {
    /* 老档兜底：在基底表里按名字找变体下标 */
    const list = itemBaseList(item);
    const tierList = list && list[itemBaseTier ? itemBaseTier(item) : 0];
    if (tierList) {
      for (let i = 0; i < tierList.length; i++) {
        const e = tierList[i];
        const nm = Array.isArray(e) ? e[0] : (e && e.name);
        if (nm && item.baseName && nm === item.baseName) { fam = dollFamily(i); break; }
      }
    }
  }
  const tier = typeof itemBaseTier === 'function' ? itemBaseTier(item) : (item.baseTier || 0);
  return { slot, fam, lod: dollLod(tier), tier, sig: item.uniqueId || item.setId || null };
}

/* 取某族定义（含兜底） */
function dollFamDef(slot, fam) {
  const s = DOLL_PARTS[slot];
  if (!s) return null;
  return s[fam] || s.A || s[Object.keys(s)[0]] || null;
}

/* 展开成最终零件表：base parts + 前 N 段 LOD 增量。**纯函数**，装配器与文档共用。 */
function dollPartsOf(slot, fam, lod) {
  const def = dollFamDef(slot, fam);
  if (!def) return null;
  const out = (def.parts || []).slice();
  const adds = def.lod || [];
  for (let i = 1; i <= lod && i < adds.length; i++) {
    for (const p of (adds[i] || [])) out.push(p);
  }
  return out;
}

/* 族总数 / 零件总数 —— 说明页与测试断言都读这里，别在别处数 */
function dollStats() {
  let fams = 0, parts = 0, lods = 0;
  for (const slot in DOLL_PARTS) {
    for (const fam in DOLL_PARTS[slot]) {
      fams++;
      parts += (DOLL_PARTS[slot][fam].parts || []).length;
      lods += (DOLL_PARTS[slot][fam].lod || []).reduce((s, a) => s + (a ? a.length : 0), 0);
    }
  }
  return { slots: Object.keys(DOLL_PARTS).length, fams, parts, lodParts: lods };
}

/* ============================================================
 * 剪影判据（纯函数，不碰 THREE）
 *
 * 方案 §2 的验收第 1 条：「同一槽位三族，纯黑剪影 IoU < 0.85」。
 * 这里用**零件投影的并集**近似剪影：圆柱/球 → 椭圆，方体 → 矩形。
 * 不是渲染级精确（忽略旋转、不做遮挡），但足以拦住「两族几乎一样」——
 * 真正的像素剪影在工作台的对比模式里用 GPU 读像素算，两边数字应当同向。
 *
 * 用法：
 *   const box = dollSilBox('helm');           // 三族联合包围盒
 *   const a = dollSilhouette('helm','A',0,box);
 *   const b = dollSilhouette('helm','B',0,box);
 *   dollIou(a,b)                              // < 0.85 才算可辨
 * ============================================================ */
function _dollRadius(pt) {
  const s = pt.s || [0.1];
  switch (pt.g) {
    case 'box':   return [s[0] / 2, s[1] / 2];
    case 'cyl':   return [Math.max(s[0], s[1]), s[2] / 2];
    case 'disc':  return [s[0], s[1] / 2];
    case 'cone':  return [s[0], s[1] / 2];
    case 'torus': return [s[0] + s[1], s[0] + s[1]];
    case 'sph':
    case 'dome':  return [s[0], s[0]];
    default:      return [0.05, 0.05];
  }
}

/* 展开某族为「世界坐标下的投影椭圆/矩形」列表 */
function _dollPieces(slot, fam, lod) {
  const def = dollFamDef(slot, fam);
  const list = dollPartsOf(slot, fam, lod);
  if (!def || !list) return [];
  const out = [];
  for (const pt of list) {
    const an = pt.a || def.anchor || 'torsoG';
    const aw = DOLL_ANCHOR_WORLD[an] || [0, 0, 0];
    const pair = /L$/.test(an) || /R$/.test(an);
    const sides = pair ? [-1, 1] : [1];
    const [rx, ry] = _dollRadius(pt);
    const sc = pt.sc || [1, 1, 1];
    for (const side of sides) {
      const sgn = pt.mx ? side : 1;
      const cx = (pair ? Math.abs(aw[0]) * side : aw[0]) + (pt.p ? pt.p[0] * sgn : 0);
      const cy = aw[1] + (pt.p ? pt.p[1] : 0);
      out.push({ cx, cy, rx: rx * sc[0], ry: ry * sc[1], box: pt.g === 'box' });
    }
  }
  return out;
}

/* 三族联合包围盒（留 4% 边），用来把栅格对齐 —— 否则空白区域会主导 IoU */
function dollSilBox(slot, lod) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const fam of ['A', 'B', 'C']) {
    for (const p of _dollPieces(slot, fam, lod || 0)) {
      x0 = Math.min(x0, p.cx - p.rx); x1 = Math.max(x1, p.cx + p.rx);
      y0 = Math.min(y0, p.cy - p.ry); y1 = Math.max(y1, p.cy + p.ry);
    }
  }
  if (x0 > x1) return [-0.5, 0.5, 0, 2];
  const px = (x1 - x0) * 0.04 + 0.01, py = (y1 - y0) * 0.04 + 0.01;
  return [x0 - px, x1 + px, y0 - py, y1 + py];
}

/* 栅格化：返回 { w, h, bits: Uint8Array, box } */
function dollSilhouette(slot, fam, lod, box, opt) {
  opt = opt || {};
  const W = opt.w || 56, H = opt.h || 76;
  const b = box || dollSilBox(slot, lod);
  const pieces = _dollPieces(slot, fam, lod);
  const bits = new Uint8Array(W * H);
  const sx = W / (b[1] - b[0]);
  const sy = H / (b[3] - b[2]);
  for (const p of pieces) {
    if (p.rx <= 0 || p.ry <= 0) continue;
    const ix0 = Math.max(0, Math.floor((p.cx - p.rx - b[0]) * sx));
    const ix1 = Math.min(W - 1, Math.ceil((p.cx + p.rx - b[0]) * sx));
    /* 栅格 y 向上，数组 y 向下 */
    const iy0 = Math.max(0, Math.floor((b[3] - (p.cy + p.ry)) * sy));
    const iy1 = Math.min(H - 1, Math.ceil((b[3] - (p.cy - p.ry)) * sy));
    for (let iy = iy0; iy <= iy1; iy++) {
      const wy = b[3] - (iy + 0.5) / sy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = b[0] + (ix + 0.5) / sx;
        let inside;
        if (p.box) {
          inside = Math.abs(wx - p.cx) <= p.rx && Math.abs(wy - p.cy) <= p.ry;
        } else {
          const dx = (wx - p.cx) / p.rx, dy = (wy - p.cy) / p.ry;
          inside = dx * dx + dy * dy <= 1;
        }
        if (inside) bits[iy * W + ix] = 1;
      }
    }
  }
  return { w: W, h: H, bits, box: b };
}

function dollIou(a, b) {
  if (!a || !b || a.bits.length !== b.bits.length) return 1;
  let inter = 0, union = 0;
  for (let i = 0; i < a.bits.length; i++) {
    const x = a.bits[i], y = b.bits[i];
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/* 某槽位三族的两两 IoU（跑验收/文档时直接读这个） */
function dollFamIou(slot, lod) {
  const box = dollSilBox(slot, lod);
  const s = {
    A: dollSilhouette(slot, 'A', lod, box),
    B: dollSilhouette(slot, 'B', lod, box),
    C: dollSilhouette(slot, 'C', lod, box)
  };
  return { AB: dollIou(s.A, s.B), AC: dollIou(s.A, s.C), BC: dollIou(s.B, s.C) };
}
