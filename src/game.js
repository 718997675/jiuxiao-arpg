/* ============================================================
 * 主逻辑：渲染 / 输入 / 战斗 / 敌人AI / Boss / 掉落 / 任务 / 存档
 * ============================================================ */

/* 铁匠铺免费刷新周期：5 分钟（v1.0.4） */
const SHOP_REFRESH_MS = 5 * 60 * 1000;

/* 场上灵兽上限。
 *
 * [P2b·兽群] 从 3 抬到 8（手机 6），并且**不再顶掉老的**。
 * 原来的 3 是按「灵兽没有血条、只能靠时间自然退场」定的：那时多招一只就得
 * 踢掉一只，否则永远不减少。现在灵兽有血、会被怪打死，寿命有了天然的终点，
 * 数量就该放开 —— 召唤流本来就是「以量取胜」，一边召一边消失是反直觉的。
 *
 * 上限仍然存在，因为每只灵兽 = 一个 actor + 每帧一次寻敌/移动/攻击，
 * 是实打实的 draw call。超限时**新召唤失败并提示**，不静默顶掉在场的。
 * 关键被动「兽契」照旧 +1。
 *
 * 注意：这里**不能**用 IS_TOUCH 求值 —— index.html 先加载 game.js 再加载
 * mobile.js，顶层读它会在 TDZ 里抛 ReferenceError。平台差异放在 allyCap() 里。 */
const ALLY_CAP_BASE = 8;
const ALLY_CAP_TOUCH = 6;

/* 灵兽血条：颜色与怪物血条区分开（灵兽是队友，不能看成一只要打的怪）。 */
const ALLY_BAR_COLOR = 0x6ad0ff;

/* 灵兽三型的固定参数。以前白虎/青龙的参数写在 castSkill 的 case 里，
 * 台阶「四象同场」需要凭空补召另外两种，就得把同一份数字抄第二遍 ——
 * 抄一遍就有一遍漂移的机会，所以收敛成一张表。 */
const BEAST_PRESET = {
  wolf: { skill: 'summon', scale: 0.9, color: 0x8affc0, cloth: 0x3a6a50, inherit: 0.6, atkRate: 1.1, name: '灵狼', hpPct: 0.30 },
  tiger: { skill: 'whitetiger', scale: 1.25, color: 0xffe0b0, cloth: 0xc8a060, inherit: 0.7, atkRate: 0.75, name: '白虎', hpPct: 0.45 },
  dragon: { skill: 'azuredragon', scale: 1.6, color: 0x6ac8ff, cloth: 0x2a5a8a, inherit: 0.8, atkRate: 1.3, aoe: true, name: '青龙', hpPct: 0.55 }
};

/**
 * 线段 a→b 与圆 (cx,cz,r) 的首次相交参数 t ∈ [0,1]，不相交返回 -1。
 *
 * 只在 XZ 平面算：怪物模型站在地面上，判定按脚下的圆来，和玩家眼睛看到的
 * 「模型在哪」完全一致。把 y 算进来反而会出问题——施法起点在 1.1~1.4 高，
 * 朝地面瞄准时 dir.y 是负的，飞远了会从怪物脚边擦过去，表现就是「法球穿模」。
 */
function segCircleT(a, b, cx, cz, r) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - cx, fz = a.z - cz;
  const C = fx * fx + fz * fz - r * r;
  if (C <= 0) return 0;                 // 起点已经在圈内（贴脸放技能）
  const A = dx * dx + dz * dz;
  if (A < 1e-9) return -1;              // 本帧没动
  const B = 2 * (fx * dx + fz * dz);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return (t >= 0 && t <= 1) ? t : -1;
}

/* ---------------- 同屏怪物上限（v1.0.5） ----------------
 *
 * 实测（dev/stress-mobs.js，1280×800）：
 *   0 只 218 calls / 30 只 719 / 60 只 1194 / 100 只 2008 / 160 只 3209
 * 每只怪约 17~19 个 draw call，而几何体与纹理数量全程不变（175 / 10）——
 * 说明**不是显存泄漏，是 draw call 顶穿**。手机 GPU 上三千多个 call 再加阴影 pass，
 * 足以让驱动重置上下文，表现就是「怪物一多就闪退」。
 *
 * 所以数量本身必须封顶：普通地图只刷 14~18 只，上限留足余量；触屏再压一档。
 * Boss 不受限（一场只有一只），但它召唤的杂兵单独封顶。
 */
const MOB_CAP_PC = 36;
const MOB_CAP_TOUCH = 28;
const SUMMON_CAP = 8;
/* 超出这个距离的怪只跑 AI、不参与渲染（draw call 是唯一瓶颈，AI 很便宜） */
const MOB_CULL_DIST = 62;
/* 超出这个距离的怪不再往 shadow map 里画。影子本身已经小到看不见，
 * 但省下的是「每只怪 22 个部件各一个 draw call」的整条阴影通道。 */
const MOB_SHADOW_DIST = 20;

/* [v1.12.1] 仇恨 / 脱战参数（旋钮在 BALANCE.aggro，这里只是取出来省得每帧查表）。
 * 索敌半径 13 米 ≈ 玩家视野半径；脱战 34 米 ≈ 跑出一个房间才会脱战。 */
const AGGRO_R = (BALANCE.aggro && BALANCE.aggro.aggroR) || 13;
const DEAGGRO_R = (BALANCE.aggro && BALANCE.aggro.deaggroR) || 34;
const DEAGGRO_T = (BALANCE.aggro && BALANCE.aggro.deaggroT) || 4;
const HOME_WALK = (BALANCE.aggro && BALANCE.aggro.homeWalk) || 0.55;
/* 刷怪 / 补怪时离玩家至少这么远，避免怪直接刷在脸上 */
const SPAWN_SAFE = 20;

/* [M12] 首领落点改由 data-maps.js 的 MAP_BOSS_POS 提供（必须落在 sanctum 圆内）。
 * 这里保留 BOSS_POS 这个名字，调用方不用改；缺表时退回一组安全默认值。 */
const BOSS_POS = (typeof MAP_BOSS_POS !== 'undefined') ? MAP_BOSS_POS : {
  treeking: [0, -28], batking: [7, -24], chief: [0, -30], golemking: [-7, -26], snakequeen: [7, -26],
  ghostlord: [0, -28], firegeneral: [-7, -24], icequeen: [7, -24],
  spidermother: [0, -29], ferryman: [-7, -25], swordlord: [7, -25], chaos: [0, -29]
};

/* 技能账本一项的更新：保留没被这次操作改到的字段。
 * s.skills[id] 现在有三个字段（lv 等级 / v 变体 / p 取向），
 * 而升级、降级、换变体三处都习惯「重建对象」—— 每处都手写一遍
 * 保留逻辑，漏一处就让玩家的取向无声消失。统一走这里。 */
function keepPick(prev, next) {
  if (prev && prev.p !== undefined) next.p = prev.p;
  return next;
}

/* [v1.11.0] 冲刺速度表：突进 / 跃击 / 闪避各自的冲刺速度（m/s）。
 * 与基础移速解耦，改 BALANCE.move.base 不会再连带改掉技能位移距离。
 * 缺表时用同一组默认值，单文件测试也能跑。 */
const DASH_SPD = (typeof BALANCE !== 'undefined' && BALANCE.move && BALANCE.move.dash)
  ? BALANCE.move.dash : { thrust: 50, leap: 28, dodge: 20 };

/* ============================================================
 * 镜头预设（v2.x）—— 设置面板「镜头 → 视角」直接映射到这张表
 *
 * 之前只有一套写死的机位（dist 11.6 / height 12.2，俯角约 43°），
 * 加上出手推镜（camPunch）和打击震屏，长时间刷图有人会晕。
 * 现在拆成四个可选机位，机位参数全部集中在这里：
 *
 *   dist    水平半径（米）；height 机位高度（米）→ 两者共同决定俯角
 *   pitchK  滚轮拉远时额外抬高的系数（0.42 ≈ 原版手感）
 *   fov     竖直视野角。机位越高越该收窄，否则边缘畸变明显
 *   punch   出手推镜倍率（0 = 完全不推镜）
 *   smooth  跟随平滑基数，越小越「硬」。火炬之光调到 2e-6 是为了消除
 *           跑动时角色在屏幕里来回漂移的滞后感
 *   lookY   视线焦点高度：越高越平视，越低越俯视
 *   fp      第一人称：机位贴到眼睛高度，人物模型隐藏
 * ============================================================ */
const CAM_VIEWS = {
  /* 原版机位，留给习惯老视角的玩家 */
  classic: { name: '默认俯视', dist: 11.6, height: 12.2, pitchK: 0.42, fov: 46, punch: 1,    smooth: 0.0018,   lookY: 1.3, fp: false },
  /* 火炬之光：机位比默认再高一点（约 49°）、视野稍宽、跟随更硬、出手不推镜 —— 默认档。
   * 距离刻意只比默认远 14%：拉太远人物会小成一个色块（实测 dist 15 时只有 25px 高）。 */
  torch:   { name: '火炬之光', dist: 12.4, height: 15.4, pitchK: 0.42, fov: 45, punch: 0,    smooth: 0.000002, lookY: 1.2, fp: false },
  /* 暗黑4：接近俯视（约 62°），保留一点推镜让打击有分量 */
  diablo:  { name: '暗黑4',   dist: 10.0, height: 20.0, pitchK: 0.50, fov: 45, punch: 0.35, smooth: 0.0004,   lookY: 0.7, fp: false },
  /* 第一人称：贴眼机位，宽视野；人物隐藏，鼠标转身 */
  fp:      { name: '第一人称', dist: 0,    height: 0,    pitchK: 0,    fov: 74, punch: 0,    smooth: 0,        lookY: 1.58, fp: true }
};

/* 震屏强度倍率：设置面板「镜头震动」*/
const SHAKE_MUL = { off: 0, weak: 0.35, std: 1, strong: 1.8 };

const Game = {
  /* three */
  renderer: null, scene: null, camera: null, clock: null, sun: null, hemi: null,
  camYaw: 0, camDist: 11.6, camHeight: 12.2, camPunch: 0,
  /* 镜头（v2.x）：view = CAM_VIEWS 的键；camZoom = 滚轮/捏合的拉近拉远倍率 */
  camView: 'torch', camZoom: 1, shakeMul: SHAKE_MUL.weak, fpPitch: -0.13, pl: false,

  /* 数据 */
  state: null, actor: null, playerGroup: null,
  enemies: [], allies: [], loot: [], npcs: {}, world: null,
  cooldowns: {}, buffs: [], shield: 0,
  keys: {}, mouseDown: false, aimPoint: new THREE.Vector3(0, 0, 10),
  aimDir: new THREE.Vector3(0, 0, 1), playerFace: new THREE.Vector3(0, 0, 1),
  running: false, dead: false, time: 0,
  hitstop: 0, shake: 0, atkCd: 0, dashT: 0, dashCd: 0, invuln: 0,
  boss: null, interactTarget: null, lastSave: 0, minimapT: 0,
  shopItems: [], skillFlags: {}, savedSlot: 0,
  particleT: 0,

  /* ======================================================= */
  init() {
    const canvas = document.getElementById('gl');
    // WebGL 上下文丢失时给出提示，避免只剩一个黑画布
    /* [CTX-LOST] 但别一丢就判死刑。Safari 弹分享面板、切到别的 App、
     * 生成「添加到主屏幕」的快照时，经常丢一次上下文，面板一关它自己就回来了。
     * three.js 内部已经接管了丢失/恢复（丢失期间 render() 直接返回），
     * 所以这里只需要：先等一下，4 秒还不回来才算真出事。 */
    let ctxLostT = 0;
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();          // 不 preventDefault 就拿不到 restored
      if (ctxLostT) return;
      ctxLostT = setTimeout(() => {
        ctxLostT = 0;
        showFatal('WebGL 上下文丢失（显卡驱动或内存不足）。\n请刷新页面，或关闭其他占用显卡的标签页。', '', true);
      }, 4000);
      try { if (typeof UI !== 'undefined' && UI.toast) UI.toast('画面暂时中断，正在恢复…'); } catch (err) { }
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (ctxLostT) { clearTimeout(ctxLostT); ctxLostT = 0; }
      /* 已经弹出错误页的话收回去，并把「只报一次」的闸门放开 */
      const box = document.getElementById('fatal');
      if (box) box.style.display = 'none';
      __fatalShown = false;
      try { if (typeof UI !== 'undefined' && UI.toast) UI.toast('画面已恢复'); } catch (err) { }
    });
    /* 高分屏（Windows 125%/150% 缩放）本身就在做降采样，再叠 MSAA 等于付两次钱，
     * 视觉上几乎看不出差别，帧率却能掉一截。所以只在 dpr≈1 时才开抗锯齿。 */
    const dpr0 = window.devicePixelRatio || 1;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr0 <= 1.25, powerPreference: 'high-performance' });
    } catch (e) {
      showFatal('这台设备无法创建 WebGL 上下文：\n' + (e.message || e) + '\n\n请确认浏览器已开启硬件加速。');
      return;
    }
    /* Windows 上系统缩放 125% / 150% 很常见，devicePixelRatio=1.5 意味着
     * 渲染像素是 CSS 像素的 2.25 倍——1920×1080 实际要画 2880×1620。
     * 这是「Chrome 里特别卡」的常见原因，所以上限压到 1.5，并按帧率自动再降。 */
    this.perf = { level: 0, warm: 0, low: 0, good: 0, acc: 0, frames: 0, fps: 60, dpr: 1, shadow: 0 };
    /* 玩家设置必须在第一次 applyPerfLevel 之前读进来，否则会先按默认值
     * 建一次 dpr/阴影，再被覆盖——两次 setSize 就是两次重排，白卡一下。 */
    try {
      if (typeof Settings !== 'undefined') Settings.load();
    } catch (e) { console.error('[设置] 读取失败', e); }
    /* [M6] 仓库是独立 key，跨角色共享。必须在任何一次 mats() 调用之前读进来，
     * 否则第一次 matCount 会拿到空对象，材料角标先闪一下 0 再跳回来。 */
    try {
      if (typeof StashStore !== 'undefined') StashStore.load();
    } catch (e) { console.error('[仓库] 读取失败', e); }
    this.mobCap = (typeof Settings !== 'undefined' && Settings.d)
      ? Settings.resolve(0).mobCap
      : (IS_TOUCH ? MOB_CAP_TOUCH : MOB_CAP_PC);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    /* 自己数 draw call。renderer.info.render.calls 在 r128 里会被中途 reset，
     * 读数不可信；renderBufferDirect 是唯一必经的最底层绘制入口，
     * 包一层就能拿到「本帧真正提交了多少次绘制」（主通道 + 阴影通道合计）。 */
    this._calls = 0;
    try {
      const r = this.renderer, rd = r.renderBufferDirect.bind(r);
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        Game._calls++;
        return rd(camera, scene, geometry, material, object, group);
      };
    } catch (e) { /* 数不出来不影响玩 */ }
    // 使用线性输出，保证手调色值所见即所得
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 600);
    /* 镜头预设（视角 / 震动）在这里第一次落地：FOV 必须在建相机之后、
     * 第一次渲染之前写好，否则会先按 46° 画一帧再跳变 */
    try { this.applyCamView(); } catch (e) { console.error('[镜头] 初始化失败', e); }
    this.clock = new THREE.Clock();

    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 0.62);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.05);
    this.sun.position.set(22, 36, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);   // 2048 在集显上 shadow pass 成本过高
    /* 阴影相机包住的范围直接决定 shadow pass 的 draw call 数：
     * three.js 在渲染阴影时按这个正交框做视锥剔除，框外的物件根本不进阴影队列。
     * 原来 ±42（84×84 格）几乎等于整张图，30 只怪时 shadow pass 占了 render 的 ~57%。
     * 收到 ±26 后：远处的怪自动不投阴影（屏幕上本来就一两个像素），
     * 同时同样 1536 的贴图铺在更小的范围上，近处阴影反而更清晰——两头都赚。 */
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 96;
    this.sun.shadow.bias = -0.0012;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.1));

    FX.init(this.scene, this.camera, document.getElementById('fxLayer'));
    // 存档地基：先做 V1→V2 迁移，再让 UI 判断有没有档可读
    try {
      if (typeof SaveManager !== 'undefined') {
        SaveManager.init();
        this.savedSlot = SaveManager.activeSlot();
      }
    } catch (e) { console.error('[存档] 初始化失败', e); }
    // UI 出错不应该拖垮画面，单独兜住
    try { UI.init(); } catch (e) { showFatal('界面初始化失败：' + (e.stack || e.message)); }
    try { if (typeof Mobile !== 'undefined') Mobile.init(); } catch (e) { console.error(e); }
    this.bindInput();
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    try { this.buildTitleScene(); } catch (e) { showFatal('标题场景构建失败：' + (e.stack || e.message)); }
    /* 键位说明不再贴在 HUD 左下角（挡视野、还和拾取提示抢位置），
     * 全部收进「说明」页第一节，按 H 随时可查。 */

    window.addEventListener('resize', () => this.updateViewport());
    /* 进出全屏（含用户按 Esc / 手势退出）都要重排一次：画布尺寸、触屏键位、设置面板的高亮 */
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
      this.updateViewport();
      if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.queueLayout(80);
      if (typeof UI !== 'undefined' && UI.renderSettings) UI.renderSettings();
    }));
    this.updateViewport();

    /* 存档里的设置在这里第一次落地（分辨率 / 阴影 / 粒子 / 怪数上限）。
     * 放在 animate 之前，避免先按默认值渲染几帧再跳变。 */
    try { this.applyPerfLevel(); } catch (e) { console.error('[画质] 初始化失败', e); }
    /* 帧数面板要立刻反映「上次开着的状态」，不能等第一次采样——
     * 低帧率下第一次采样可能要好几秒才凑够 1 秒窗口 */
    try { if (typeof UI !== 'undefined' && UI.syncFps) UI.syncFps(); } catch (e) { }

    // 标题界面背景动画（无论如何都要跑起来）
    this.animate();
  },

  updateViewport() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // 竖屏视野窄：镜头按宽高比拉远（PC 横屏恒为 1）
    this.camZoomMul = this.camera.aspect >= 1 ? 1 : Math.min(1.62, Math.pow(1 / this.camera.aspect, 0.55));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  },

  /* ======================================================= */
  /* ---------------- 全屏 ----------------
   * 能力差异很大，只能按「有没有 API」分三档：
   *   桌面 / 安卓 Chrome  requestFullscreen() —— 真全屏，地址栏消失
   *   iPad Safari         webkitRequestFullscreen() 存在，但只对部分元素生效
   *   iPhone Safari       **没有网页全屏**（只有 video 能全屏），只能引导「添加到主屏幕」
   * 所以这里不承诺一定成功：拿不到 API 就给出能走通的那条路。 */
  fullscreenEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  },

  isFullscreen() { return !!this.fullscreenEl(); },

  enterFullscreen() {
    if (this.isFullscreen()) return true;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req) {
      try {
        UI.toast('这个浏览器不支持网页全屏。iPhone 上请点「分享 → 添加到主屏幕」，从图标启动就没有地址栏', 'bad');
      } catch (e) { }
      return false;
    }
    try {
      const r = req.call(el, { navigationUI: 'hide' });
      if (r && typeof r.catch === 'function') {
        r.catch(() => {
          try { UI.toast('浏览器拒绝了全屏请求，先点一下画面再试', 'bad'); } catch (e) { }
        });
      }
    } catch (e) {
      try { UI.toast('全屏失败：' + (e.message || e), 'bad'); } catch (e2) { }
      return false;
    }
    /* 进出全屏都会改可视区尺寸，下一帧重新排一次键位与画布 */
    setTimeout(() => { this.updateViewport(); if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.queueLayout(80); }, 120);
    return true;
  },

  exitFullscreen() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (ex && this.isFullscreen()) {
      try { ex.call(document); } catch (e) { /* 忽略 */ }
    }
    setTimeout(() => { this.updateViewport(); if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.queueLayout(80); }, 120);
  },

  toggleFullscreen() {
    if (this.isFullscreen()) { this.exitFullscreen(); return false; }
    return this.enterFullscreen();
  },

  /* ======================================================= */
  bindInput() {
    /* [FIX-BUG1] keydown repeat 问题：
     * Windows 上按住任意键时 keydown 会持续触发（e.repeat=true），
     * 如果用户开着中文输入法或某些系统热键软件，按住 WASD 移动时
     * 可能额外触发空格 keydown → tryDash() 被反复调用（"回馈"）。
     * 修复：repeat 的 keydown 不执行任何动作逻辑，只更新 keys 状态。 */
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      /* 输入框聚焦时不拦截游戏按键 */
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      /* repeat 的 keydown 不触发翻滚/技能/药水等动作，避免持续触发 */
    if (e.repeat) return;
      if (k === ' ') { this.tryDash(); e.preventDefault(); return; }
      /* [试炼] 翻牌阶段：数字键 1-3 直接选卡。必须放在技能条之前拦下来，
       * 否则按 1 会先放掉快捷栏第一个技能。 */
      if (typeof Trial !== 'undefined' && Trial.run && Trial.run.phase === 'choose'
        && k >= '1' && k <= String(TRIAL_CFG.blessCards)) {
        UI.pickTrialByIndex(parseInt(k) - 1);
        e.preventDefault();
        return;
      }
      /* [P1] 技能条 5 格：① 号位 = 左键（按住连发），键 1~4 = ②③④⑤。
       * 注意索引：键 1 对应 bar[1]（② 号位），不再是 bar[0]。 */
      if (k >= '1' && k <= String(SKILL_BAR_SLOTS - 1)) {
        const bar = this.skillBar();
        const id = bar[parseInt(k, 10)];
        if (id) this.castSkill(id);
      }
      /* [M1] 两套快捷栏切换：默认 Shift，另有反引号与 V 保底。
       * Shift 同时是「背包出售」「天赋洗点」的修饰键 —— 面板开着时不换栏，
       * 否则 Shift+左键卖一件东西会顺手把技能栏也翻了。
       * e.code 兜底：中文输入法激活时反引号的 e.key 会变成 'Process'。 */
      if (k === SKILL_BAR_SET_KEY || k === '`' || k === 'v' || e.code === 'Backquote') {
        const panelOpen = !!(typeof UI !== 'undefined' && UI.menuIsOpen && UI.menuIsOpen());
        if (!(k === SKILL_BAR_SET_KEY && panelOpen)) {
          this.switchBarSet();
          e.preventDefault();
        }
      }
      if (k === '9') this.useTeleportStone();
      if (k === 'z') this.usePotion('hp');
      if (k === 'x') this.usePotion('mp');
      if (k === 'f') this.interact();
    });
    /* [FIX-BUG1] keyup 兜底：中文输入法激活时 keyup 的 e.key 可能返回
     * 'process' 或 'unidentified'，导致 keys['w'] 等永远无法清除。
     * 修复：keyup 时同时用 e.code（物理键位）做兜底清除。 */
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
      /* 用 code 兜底：KeyW → w, KeyA → a, Space → space */
      const codeMap = {
        'KeyW': 'w', 'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd',
        'Space': ' ', 'ArrowUp': 'arrowup', 'ArrowDown': 'arrowdown',
        'ArrowLeft': 'arrowleft', 'ArrowRight': 'arrowright',
        'KeyQ': 'q', 'KeyE': 'e', 'KeyF': 'f',
        'Digit1': '1', 'Digit2': '2', 'Digit3': '3',
        'Digit4': '4', 'Digit5': '5', 'Digit6': '6',
        'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
        'KeyZ': 'z', 'KeyX': 'x', 'KeyT': 't', 'KeyK': 'k'
      };
      const mapped = codeMap[e.code];
      if (mapped) this.keys[mapped] = false;
    });
    /* [FIX-BUG1] 窗口失焦时清除所有按键状态，防止按键"卡住" */
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });

    const cv = this.renderer.domElement;
    cv.addEventListener('mousedown', e => {
      if (IS_TOUCH) return;   // 触屏由虚拟按键接管
      /* 第一人称：点画面锁鼠标（浏览器要求用户手势才允许 pointer lock） */
      if (this.isFP() && !this.pl) {
        try { cv.requestPointerLock && cv.requestPointerLock(); } catch (err) { /* 被 iframe 权限挡掉就用普通鼠标移动 */ }
      }
      if (e.button === 0) { this.mouseDown = true; SFX.init(); }
      /* [P1] 右键与左键同义（都是 ① 号位 / 普攻）：5 格之后没有「右键放 1 号技能」
       * 这一层了，保留右键攻击是为了照顾老习惯 */
      if (e.button === 2) this.primaryAttack();
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (IS_TOUCH) return;   // 触屏走自动瞄准
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      /* 第一人称：相对位移转身 + 俯仰。
       * 只在「已锁定鼠标」或「鼠标在画布上」时转 —— 否则去点 HUD 上的按钮
       * 也会把镜头甩走。指针锁定在 Chrome 里需要一次用户手势（点画布）。 */
      if (this.isFP()) {
        const onCanvas = (e.target === cv);
        if (this.pl || onCanvas) {
          const dx = e.movementX || 0, dy = e.movementY || 0;
          if (dx) this.camYaw -= dx * 0.0026;
          if (dy) this.fpPitch = CLAMP((this.fpPitch || 0) - dy * 0.0018, -0.7, 0.35);
        }
      }
      this.updateAim();
    });
    /* 指针锁定状态（第一人称用）：Esc 或切视角时浏览器会自己退出 */
    document.addEventListener('pointerlockchange', () => {
      this.pl = (document.pointerLockElement === cv);
    });
    cv.addEventListener('wheel', e => {
      /* 滚轮改成「倍率」而不是绝对距离：换视角后仍按该机位的比例拉近拉远 */
      if (this.isFP()) { e.preventDefault(); return; }
      const f = Math.exp((e.deltaY || 0) * 0.0012);
      this.camZoom = CLAMP((this.camZoom || 1) * f, 0.7, 2.4);
      e.preventDefault();
    }, { passive: false });

    document.getElementById('death').addEventListener('click', e => e.stopPropagation());
  },

  updateAim() {
    if (IS_TOUCH) return this.updateAutoAim();
    if (!this.camera) return;
    if (this.isFP()) return this.updateFpAim();
    const v = new THREE.Vector2(
      (this.mouseX / window.innerWidth) * 2 - 1,
      -(this.mouseY / window.innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, p)) {
      this.aimPoint.copy(p);
      if (this.playerGroup) {
        const d = p.clone().sub(this.playerGroup.position); d.y = 0;
        if (d.lengthSq() > 0.01) this.aimDir.copy(d.normalize());
      }
    }
  },

  /* 第一人称瞄准：视线方向即准心，再加一层「正前方吸附」。
   * 地面射线在平视时几乎打不到平面（射线平行于地面），所以不能沿用
   * 俯视那套 setFromCamera → intersectPlane，直接拿 camYaw 的前向量。 */
  updateFpAim() {
    const pg = this.playerGroup;
    if (!pg) return;
    const p = pg.position;
    const dx = -Math.sin(this.camYaw), dz = -Math.cos(this.camYaw);
    /* 吸附：26 米内、偏离视线 30° 以内最近的敌人。第一人称没有鼠标指哪打哪，
     * 纯靠视线对准小目标太苛刻，近战尤其容易砍空。 */
    let best = null, bd = 26;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.pos.x - p.x, ez = e.pos.z - p.z;
      const d = Math.hypot(ex, ez);
      if (d < 1.2 || d > bd) continue;
      if ((ex * dx + ez * dz) / d < 0.87) continue;   // ≈30° 锥角
      bd = d; best = e;
    }
    if (best) {
      this.aimDir.set(best.pos.x - p.x, 0, best.pos.z - p.z).normalize();
      this.aimPoint.set(best.pos.x, 0, best.pos.z);
    } else {
      this.aimDir.set(dx, 0, dz);
      this.aimPoint.set(p.x + dx * 9, 0, p.z + dz * 9);
    }
  },

  /* 触屏自动瞄准：优先最近的敌人，其次朝摇杆方向，最后保持原朝向 */
  updateAutoAim() {
    const p = this.playerGroup.position;
    let best = null, bd = 15;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      this.aimDir.set(best.pos.x - p.x, 0, best.pos.z - p.z).normalize();
      this.aimPoint.set(best.pos.x, 0, best.pos.z);
    } else if (this.lastMoveDir && this.movingNow) {
      this.aimDir.set(this.lastMoveDir.x, 0, this.lastMoveDir.z).normalize();
      this.aimPoint.set(p.x + this.aimDir.x * 8, 0, p.z + this.aimDir.z * 8);
    } else {
      this.aimPoint.set(p.x + this.aimDir.x * 8, 0, p.z + this.aimDir.z * 8);
    }
  },

  /* ======================================================= */
  newState(cls, name, difficulty) {
    const eq = makeStarterSet(cls);
    const diff = DIFFS[difficulty] ? difficulty : (this.pendingDifficulty || DEFAULT_DIFF);
    const s = {
      cls, name, level: 1, xp: 0, xpNext: (typeof xpToNext === 'function' ? xpToNext(1) : 180), gold: 120,
      difficulty: diff,
      potions: { hp: 4, mp: 3 },
      teleportStones: 0,
      hp: 100, mp: 50,
      equipment: { helm: null, chest: eq.chest, shoulders: null, cloak: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, weapon: eq.weapon, offhand: null, relic: null, fate: null },
      inventory: [], maxInv: BAG_BASE_CAP,
      stash: { items: [], mats: {} },
      /* [试炼] 无尽试炼的永久记录（跨轮保留）：最高波数 / 总轮数 / 达成时间 */
      trial: { best: 0, runs: 0, bestAt: 0 },
      quests: { active: [], done: [], next: 'q1', announced: {} },
      mapId: 'village', playerPos: { x: 0, z: 10 },
      bossKilled: {}, playTime: 0,
      /* [S3] 天赋：spent = { 节点id: 级数 }；presets 三套预设（存 spent 快照） */
      talents: { spent: {}, presets: [null, null, null], respecCount: 0 },
      /* [M1] 任务奖励的天赋点（主线四段共 +10，满级 60 → 70） */
      talentBonus: 0,
      /* [v1.8.5] 根基加点：四项手动分配的点数（职业基础 / 等级成长之外的那一份） */
      attrAlloc: { str: 0, agi: 0, vit: 0, int: 0 },
      /* [S4] 技能：{ 技能id: { lv: 1-10, v: 0-2 变体 } } */
      skills: {},
      /* [S4] 技能条：5 格 × 2 套手动配置（技能 id 或 null），新档只放已领悟的。
       * [P1] 格位 = 功能位（第 i 格只能放第 i 个位的技能），所以用迁移函数归位，
       * 不能像以前那样「按表顺序截前 5 个」—— 那样会出现「② 号位的技能占了 ① 格」。 */
      skillbar: skillBarMigrate((SKILL_ORDER[cls] || []).filter(id => SKILLS[id] && SKILLS[id].unlock <= 1), cls),
      skillbar2: [],
      barSet: 0,
      shop: null          // { at, items, rolls } —— 由 ensureShop/genShop 填充
    };
    return s;
  },

  /* 当前难度的配置。旧档没有 difficulty 字段时回落到普通，不报错。 */
  diff() {
    return getDiff(this.state && this.state.difficulty);
  },

  /* ---------------- 材料（S2：玄晶 / 符文） ----------------
   * [M6] 材料仓已提升为**跨角色共享**：存在 StashStore（独立 key），
   * 不再挂 state.stash。所有材料读写都过这一个入口，所以换存储时
   * 调用方一行都不用改。
   * 键：xuanjing / crystal1~4 / rune_<id> / craft_<id>。 */
  mats() {
    if (typeof StashStore === 'undefined') return {};
    return StashStore.get().mats;
  },

  matCount(key) {
    const v = Math.round(Number(this.mats()[key]) || 0);
    return Math.max(0, v);
  },

  addMat(key, n) {
    const m = this.mats();
    m[key] = Math.max(0, Math.round((Number(m[key]) || 0) + n));
    return m[key];
  },

  crystalCount() { return this.matCount('xuanjing'); },

  runeCount(id) { return this.matCount('rune_' + id); },

  addRune(id, n = 1) {
    if (!RUNES[id]) return 0;
    return this.addMat('rune_' + id, n);
  },

  addCrystal(n) { return this.addMat('xuanjing', n); },

  /* [S3] 玄晶分级：凡晶 / 灵晶 / 玄晶 / 神晶 */
  crystalTierCount(tier) { return this.matCount('crystal' + tier); },
  addCrystalTier(tier, n) { return this.addMat('crystal' + tier, n); },
  totalCrystalValue() {
    return this.crystalTierCount(1) * 1 + this.crystalTierCount(2) * 3 +
           this.crystalTierCount(3) * 10 + this.crystalTierCount(4) * 30;
  },

  /* ---------------- 匠材（v1.6.0） ----------------
   * 与玄晶 / 符文同放 state.stash.mats，键 craft_<id>，不占行囊格。
   * 掉落、锻造、UI、探针都走这三个方法，别各自拼键名。 */
  craftMatCount(id) { return this.matCount(craftMatKey(id)); },
  addCraftMat(id, n) {
    if (!CRAFT_MATS[id]) return 0;
    return this.addMat(craftMatKey(id), n);
  },
  /* 匠材总持有数（材料栏角标与徽章用） */
  craftMatTotal() {
    let n = 0;
    for (const id of CRAFT_MAT_ORDER) n += this.craftMatCount(id);
    return n;
  },

  /* ======================================================= */
  /* 行囊扩容（v1.4.0）                                       */
  /* ======================================================= */
  /* 当前容量。旧档没有 maxInv 时按基础 40 算。 */
  bagCap() {
    const s = this.state;
    return Math.max(BAG_BASE_CAP, Math.round(Number(s && s.maxInv) || BAG_BASE_CAP));
  },

  /* 扩容面板要的全部读数：当前档位 / 下一档 / 缺什么 / 能不能扩。
   * 面板与探针都读这里，别各算一份，否则消耗表和按钮状态会不一致。 */
  bagUpgradeInfo() {
    const cap = this.bagCap();
    const tier = bagTierOf(cap);
    const maxTier = BAG_UPGRADES.length;
    const next = bagNextUpgrade(cap);
    if (!next) return { cap, tier, maxTier, next: null, can: false, lack: [], cost: null };
    const cost = next.crystal.map((n, i) => ({
      tier: i + 1, name: CRYSTAL_TIERS[i].name, color: CRYSTAL_TIERS[i].color,
      need: n || 0, have: this.crystalTierCount(i + 1)
    })).filter(c => c.need > 0);
    const lack = cost.filter(c => c.have < c.need).map(c => c.name);
    if ((this.state.gold || 0) < next.gold) lack.push('铜钱');
    return { cap, tier, maxTier, next, cost, can: lack.length === 0, lack };
  },

  /* 扩容一次。返回 { ok, msg?, cap?, tier? }；材料由 addMat 扣减（自带下界保护）。 */
  upgradeBag() {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const info = this.bagUpgradeInfo();
    if (!info.next) return { ok: false, msg: `行囊已扩至极限（${info.cap} 格）。` };
    if (!info.can) return { ok: false, msg: '扩容所需不足：还差 ' + info.lack.join('、') + '。' };
    const n = info.next;
    for (let i = 0; i < 4; i++) if (n.crystal[i]) this.addMat('crystal' + (i + 1), -n.crystal[i]);
    s.gold = Math.max(0, (s.gold || 0) - n.gold);
    s.maxInv = n.cap;
    const msg = `行囊扩容至 ${n.cap} 格（第 ${info.tier + 1} / ${info.maxTier} 次）。`;
    if (typeof UI !== 'undefined' && UI.log) UI.log(msg, 'good');
    return { ok: true, msg, cap: n.cap, tier: info.tier + 1 };
  },

  /* ======================================================= */
  /* [M6] 仓库（储物箱）—— 跨角色共享                          */
  /* ======================================================= */
  /* 数据全在 StashStore（独立 key），这里只做业务规则：
   * 容量校验、排序、扩容扣费、套装登记。UI 只调这几个方法，
   * 不直接碰 StashStore，免得两处各写一套容量判断。 */

  stashData() {
    return (typeof StashStore !== 'undefined') ? StashStore.get() : { items: [], mats: {}, sets: {}, cap: 60 };
  },

  stashItems() { return this.stashData().items || []; },

  stashCap() {
    const d = this.stashData();
    const base = (typeof STASH_BASE_CAP === 'number') ? STASH_BASE_CAP : 60;
    return Math.max(base, Math.round(Number(d.cap) || base));
  },

  stashCount() { return this.stashItems().length; },

  stashFree() { return Math.max(0, this.stashCap() - this.stashCount()); },

  /* 存入：行囊第 idx 格 → 仓库。
   * 仓库满了就**拒绝**，不静默丢弃 —— 玩家点了没反应比丢东西好。 */
  stashPut(idx) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const it = s.inventory[idx];
    if (!it) return { ok: false, msg: '这一格没有东西。' };
    if (this.stashFree() <= 0) return { ok: false, msg: `仓库已满（${this.stashCap()} 格），先扩容。` };
    s.inventory.splice(idx, 1);
    this.stashItems().push(it);
    StashStore.save();
    return { ok: true, msg: `${it.name || '装备'} 已存入仓库。` };
  },

  /* 取回：仓库第 idx 件 → 行囊。行囊满则拒绝。 */
  stashTake(idx) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const d = this.stashData();
    const it = d.items[idx];
    if (!it) return { ok: false, msg: '仓库这一格是空的。' };
    if (s.inventory.length >= this.bagCap()) return { ok: false, msg: `行囊已满（${this.bagCap()} 格），先腾地方。` };
    d.items.splice(idx, 1);
    s.inventory.push(it);
    StashStore.save();
    return { ok: true, msg: `${it.name || '装备'} 已取回行囊。` };
  },

  /* 一键整理：部位 → 稀有度（高在前）→ 物品等级（高在前）。
   * 同部位同品质再按评分兜底，保证「点两次结果一样」，玩家不会觉得按钮坏了。 */
  stashSort() {
    const d = this.stashData();
    const rk = Object.keys(RARITY);
    const slotIdx = (it) => {
      const i = SLOT_ORDER.indexOf(it.slot === 'ring' ? 'ring1' : it.slot);
      return i < 0 ? 99 : i;
    };
    const score = (it) => (typeof itemScore === 'function' ? itemScore(it) : 0);
    d.items.sort((a, b) => {
      const sa = slotIdx(a), sb = slotIdx(b);
      if (sa !== sb) return sa - sb;
      const ra = rk.indexOf(a.rarity), rb = rk.indexOf(b.rarity);
      if (ra !== rb) return rb - ra;
      const la = Number(a.ilvl) || 0, lb = Number(b.ilvl) || 0;
      if (la !== lb) return lb - la;
      return score(b) - score(a);
    });
    StashStore.save();
    return { ok: true, count: d.items.length };
  },

  /* 扩容读数：与 bagUpgradeInfo 同形状，UI 可以共用一套渲染 */
  stashUpgradeInfo() {
    const cap = this.stashCap();
    const tier = (typeof stashTierOf === 'function') ? stashTierOf(cap) : 0;
    const maxTier = (typeof STASH_UPGRADES !== 'undefined') ? STASH_UPGRADES.length : 0;
    const next = (typeof stashNextUpgrade === 'function') ? stashNextUpgrade(cap) : null;
    const gold = (this.state && this.state.gold) || 0;
    const lack = [];
    if (next && gold < next.gold) lack.push(`${next.gold - gold} 金`);
    return {
      cap, tier, maxTier, next, gold,
      can: !!next && lack.length === 0,
      lack,
      /* 已满时给一句人话，UI 直接显示，不用自己拼 */
      full: !next
    };
  },

  /* 仓库扩容：只吃金币。仓库是跨角色资产，用金币计价更好规划；
   * 行囊那套「玄晶 + 金币」是随身空间，两者定位不同。 */
  upgradeStash() {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const info = this.stashUpgradeInfo();
    if (!info.next) return { ok: false, msg: `仓库已扩至极限（${info.cap} 格）。` };
    if (!info.can) return { ok: false, msg: '金币不足：还差 ' + info.lack.join('、') + '。' };
    const n = info.next;
    s.gold = Math.max(0, (s.gold || 0) - n.gold);
    this.stashData().cap = n.cap;
    StashStore.save();
    const msg = `仓库扩容至 ${n.cap} 格（第 ${info.tier + 1} / ${info.maxTier} 次）。`;
    if (typeof UI !== 'undefined' && UI.log) UI.log(msg, 'good');
    return { ok: true, msg, cap: n.cap, tier: info.tier + 1 };
  },

  /* ---------------- 套装收藏柜 ----------------
   * 「集齐了就登记，随时能取出来，不占格子」。
   * 判定用的是「行囊 + 仓库」里的实物，不含身上穿着的 ——
   * 正穿着的那套应该继续穿着，不该被收藏柜抽走。
   * 登记后实物整体搬进 sets[id].pieces，词条/孔位/符文原样保留，
   * 取出时逐件放回行囊，不是重新生成一件（否则洗过的词缀会丢）。 */

  /* 某套装当前集齐情况：{ setId, have:[slot...], miss:[slot...], ok, inUse } */
  setCollectInfo(setId) {
    const set = SETS[setId];
    if (!set) return null;
    const s = this.state;
    const pool = [];
    if (s) {
      (s.inventory || []).forEach(it => pool.push(it));
      /* 身上穿的单独记：用来提示「这套你正穿着」 */
      for (const k in (s.equipment || {})) if (s.equipment[k]) pool.push(s.equipment[k]);
    }
    this.stashItems().forEach(it => pool.push(it));

    const have = [], miss = [];
    for (const slot of set.slots) {
      const hit = pool.some(it => it && it.setId === setId && it.slot === slot);
      (hit ? have : miss).push(slot);
    }
    /* 已登记过的不能再登记 */
    const registered = !!(this.stashData().sets && this.stashData().sets[setId]);
    return {
      setId, name: set.name, color: set.color, total: set.slots.length,
      have, miss, ok: miss.length === 0, registered
    };
  },

  /* 全部套装的收集状态（UI 列表用） */
  setCollectList() {
    const out = [];
    for (const id in SETS) {
      const info = this.setCollectInfo(id);
      if (info) out.push(info);
    }
    return out;
  },

  /* 登记：把该套装的全部实物从行囊/仓库移进收藏柜 */
  setRegister(setId) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const info = this.setCollectInfo(setId);
    if (!info) return { ok: false, msg: '没有这套。' };
    if (info.registered) return { ok: false, msg: `${info.name} 已经登记过了。` };
    if (!info.ok) {
      const missName = info.miss.map(sl => (SLOTS[sl] || {}).name || sl).join('、');
      return { ok: false, msg: `还差 ${missName}，集齐才能登记。` };
    }
    const set = SETS[setId];
    const pieces = [];
    /* 先从仓库抽，再从行囊抽 —— 顺序无所谓，但必须两边都抽干净，
     * 否则会出现「登记了但行囊里还剩一件」的重复资产。 */
    const d = this.stashData();
    for (const slot of set.slots) {
      let taken = null;
      let i = d.items.findIndex(it => it && it.setId === setId && it.slot === slot);
      if (i >= 0) { taken = d.items.splice(i, 1)[0]; }
      if (!taken) {
        i = s.inventory.findIndex(it => it && it.setId === setId && it.slot === slot);
        if (i >= 0) taken = s.inventory.splice(i, 1)[0];
      }
      if (taken) pieces.push(taken);
    }
    if (!pieces.length) return { ok: false, msg: '没有可登记的部件（可能都穿在身上）。' };
    d.sets = d.sets || {};
    d.sets[setId] = { at: Date.now(), pieces };
    StashStore.save();
    const msg = `【${set.name}】已登记进收藏柜（${pieces.length} 件），随时可取。`;
    if (typeof UI !== 'undefined' && UI.log) UI.log(msg, 'good');
    return { ok: true, msg, count: pieces.length };
  },

  /* 取出：收藏柜 → 行囊。行囊空位不够就拒绝并说明差几格。 */
  setWithdraw(setId) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const d = this.stashData();
    const rec = d.sets && d.sets[setId];
    if (!rec || !rec.pieces || !rec.pieces.length) return { ok: false, msg: '收藏柜里没有这一套。' };
    const free = this.bagCap() - s.inventory.length;
    if (free < rec.pieces.length) {
      return { ok: false, msg: `行囊还差 ${rec.pieces.length - free} 格，先腾地方再取。` };
    }
    for (const it of rec.pieces) s.inventory.push(it);
    const n = rec.pieces.length;
    delete d.sets[setId];
    StashStore.save();
    const set = SETS[setId];
    const msg = `【${set ? set.name : setId}】${n} 件已取回行囊。`;
    if (typeof UI !== 'undefined' && UI.log) UI.log(msg, 'good');
    return { ok: true, msg, count: n };
  },

  /* 读档 / 导入后统一整形：旧物品补 sockets=0，非法符文清空 */
  normalizePlayerItems(s) {
    if (!s) return;
    const eq = s.equipment || (s.equipment = {});
    for (const k in eq) if (eq[k]) eq[k] = normalizeItem(eq[k]);
    if (Array.isArray(s.inventory)) s.inventory = s.inventory.map(normalizeItem).filter(Boolean);
    /* [M6] 仓库已提升为跨角色共享（StashStore 独立 key）。
     * 老档里遗留的 state.stash 在这里一次性搬进仓库，搬完清空 ——
     * 不搬的话老玩家会发现材料与仓库存货全没了；
     * 不清空的话每读一次档就重复计一遍。 */
    if (typeof StashStore !== 'undefined') StashStore.absorb(s.stash);
    s.stash = { items: [], mats: {} };
    /* [v1.8.5] 旧档没有加点字段：补一份全零，可分配点数按等级自动补算 */
    if (!s.attrAlloc || typeof s.attrAlloc !== 'object') s.attrAlloc = { str: 0, agi: 0, vit: 0, int: 0 };
    for (const k of ATTR_KEYS) s.attrAlloc[k] = Math.max(0, Math.round(Number(s.attrAlloc[k]) || 0));
  },

  /* ======================================================= */
  /* [v1.8.5] 根基加点                                        */
  /* ======================================================= */
  attrState() {
    const s = this.state;
    const blank = { str: 0, agi: 0, vit: 0, int: 0 };
    if (!s) return blank;
    if (!s.attrAlloc || typeof s.attrAlloc !== 'object') s.attrAlloc = blank;
    for (const k of ATTR_KEYS) {
      const v = Math.round(Number(s.attrAlloc[k]) || 0);
      s.attrAlloc[k] = v > 0 ? v : 0;
    }
    return s.attrAlloc;
  },

  /* 已花掉的点数 / 总共可用的点数（按等级补算：旧档升过的级一样有点可加） */
  attrSpent() {
    return attrSpentOf(this.attrState());
  },
  attrTotal() {
    return attrTotalAt((this.state && this.state.level) || 1);
  },
  attrPoints() {
    return attrLeft((this.state && this.state.level) || 1, this.attrState());
  },

  /* 加点后立刻重算：攻击 / 生命 / 护甲都是实时看根基的 */
  allocAttr(key, n, silent) {
    if (ATTR_KEYS.indexOf(key) < 0) return false;
    n = Math.max(1, Math.round(n || 1));
    const left = this.attrPoints();
    if (left <= 0) { UI.log('没有可分配的根基点了。', 'bad'); return false; }
    const a = this.attrState();
    a[key] = (a[key] || 0) + Math.min(n, left);
    this.recalc();
    /* silent：草稿批量落库时用，逐点 save 会写上百次存档 */
    if (!silent) { SFX.ui(); this.save(); }
    return true;
  },

  /* 退根基点：只退「已投进去的点」，基础成长值不动。
   * 与「洗点」的区别：洗点是整项清空并收钱，这个是免费的单点撤销，
   * 因为在草稿里点错了不应该付钱。 */
  refundAttr(key, n, silent) {
    if (ATTR_KEYS.indexOf(key) < 0) return false;
    n = Math.max(1, Math.round(n || 1));
    const a = this.attrState();
    const cur = a[key] || 0;
    if (cur <= 0) return false;
    a[key] = Math.max(0, cur - n);
    if (!a[key]) delete a[key];
    this.recalc();
    if (!silent) { SFX.ui(); this.save(); }
    return true;
  },

  /* 洗点：退光全部加点，按境界收钱。装备只在穿戴时校验需求，
   * 所以洗点不会把身上的东西扒下来（说明页里也写明这条）。
   * 注意别叫 respecCost —— 天赋洗点已经占了这个名字（同名会被后面的键覆盖）。 */
  attrRespecFee() {
    return attrRespecCost(this.state ? this.state.level : 1);
  },
  resetAttrs() {
    const s = this.state;
    if (!s) return false;
    const spent = this.attrSpent();
    if (!spent) { UI.log('尚未分配技能点。', 'bad'); return false; }
    const cost = this.attrRespecFee();
    if (s.gold < cost) { UI.log(`洗点需 ${cost} 金，当前 ${s.gold}。`, 'bad'); return false; }
    s.gold -= cost;
    const a = this.attrState();
    for (const k of ATTR_KEYS) a[k] = 0;
    this.recalc();
    UI.log(`已洗去 ${spent} 点根基（-${cost} 金）。`, 'good');
    SFX.ui();
    this.save();
    return true;
  },

  /* 面板上「这一点加下去会变成什么」：给加点面板做预览用 */
  attrGain(key) {
    const c = CLASSES[this.state.cls];
    const w = (c.weights || {})[key] || {};
    return w;
  },

  /* ======================================================= */
  /* [S3] 天赋系统：点数 / 加点 / 洗点 / 预设                  */
  /* ======================================================= */
  talentState() {
    const s = this.state;
    if (!s) return { spent: {}, presets: [null, null, null], respecCount: 0 };
    if (!s.talents || typeof s.talents !== 'object') s.talents = { spent: {}, presets: [null, null, null], respecCount: 0 };
    if (!s.talents.spent || typeof s.talents.spent !== 'object') s.talents.spent = {};
    if (!Array.isArray(s.talents.presets) || s.talents.presets.length !== 3) s.talents.presets = [null, null, null];
    return s.talents;
  },

  /* 可用天赋点：每级 1 点 + 任务奖励点（[M1] 满级 60 + 主线 10 = 70） */
  talentPoints() {
    const s = this.state;
    const sp = this.talentState().spent;
    let spent = 0;
    for (const id in sp) spent += sp[id] || 0;
    return Math.max(0, (s ? s.level : 1) + (s ? (s.talentBonus || 0) : 0) - spent);
  },

  /* 某一系已投入的点数（大节点 reqPts 用） */
  talentTreePoints(treeId) {
    const sp = this.talentState().spent;
    let n = 0;
    if (typeof TALENT_NODES === 'undefined') return 0;
    for (const id in sp) {
      const e = TALENT_NODES[id];
      if (e && e.tree === treeId) n += sp[id] || 0;
    }
    return n;
  },

  talentNodeOf(id) {
    return (typeof TALENT_NODES !== 'undefined') ? TALENT_NODES[id] : null;
  },

  /* [M1/B4] 协同节点是否已「显形」。
   * 条件只认「当前装备算出来的东西」：套装件数 / 符文之语 / 套装 flag / special / 面板属性。
   * 全部走 state.stats（recalc 后已汇总），所以换装备会立刻反映到轮盘上。 */
  synergyUnlocked(id) {
    const e = this.talentNodeOf(id);
    if (!e) return false;
    const c = e.node && e.node.cond;
    if (!c) return true;                     // 非协同节点恒为真
    const st = (this.state && this.state.stats) || {};
    if (c.set) return ((st.setCount || {})[c.set] || 0) >= (c.need || 1);
    if (c.runeWord) {
      const eq = (this.state && this.state.equipment) || {};
      for (const k in eq) {
        const it = eq[k];
        if (!it || typeof runeWordOf !== 'function') continue;
        const rw = runeWordOf(it);
        if (rw && rw.id === c.runeWord) return true;
      }
      return false;
    }
    if (c.flag) return !!(st.flags && st.flags[c.flag]);
    if (c.special) return !!(st.specials && st.specials[c.special]);
    if (c.stat) return (Number(st[c.stat]) || 0) >= (c.need || 1);
    return true;
  },

  /* 已显形的协同节点 id 列表（UI 画轮盘、回归断言共用） */
  synergyOpen() {
    const out = [];
    if (typeof TALENT_NODES === 'undefined') return out;
    for (const id in TALENT_NODES) {
      if (!TALENT_NODES[id].hidden) continue;
      if (this.synergyUnlocked(id)) out.push(id);
    }
    return out;
  },

  canAllocTalent(id) {
    if (!this.state) return false;
    const e = this.talentNodeOf(id);
    if (!e) return false;
    const n = e.node;
    /* 协同节点：没显形就点不动（隐藏节点不给「盲点」的机会） */
    if (n.cond && !this.synergyUnlocked(id)) return false;
    const sp = this.talentState().spent;
    if ((sp[id] || 0) >= n.max) return false;
    if (this.talentPoints() <= 0) return false;
    /* 解锁等级：天赋与技能一样随等级逐步开放 */
    if ((this.state.level || 1) < (e.unlock || 1)) return false;
    for (const r of (n.req || [])) if (!(sp[r] > 0)) return false;
    if (n.reqPts && this.talentTreePoints(e.tree) < n.reqPts) return false;
    return true;
  },

  allocTalent(id) {
    if (!this.canAllocTalent(id)) return false;
    const sp = this.talentState().spent;
    sp[id] = (sp[id] || 0) + 1;
    this.recalc();
    if (typeof UI !== 'undefined' && UI.onTalentChanged) UI.onTalentChanged();
    return true;
  },

  /* 反加点：已被其它已点节点依赖时拒绝（避免出现「前置没了后置还在」） */
  refundTalent(id) {
    const sp = this.talentState().spent;
    if (!(sp[id] > 0)) return false;
    if (typeof TALENT_NODES !== 'undefined') {
      for (const oid in sp) {
        if (!sp[oid]) continue;
        const oe = TALENT_NODES[oid];
        if (oe && (oe.node.req || []).indexOf(id) >= 0) return false;
      }
    }
    sp[id]--;
    if (sp[id] <= 0) delete sp[id];
    this.recalc();
    if (typeof UI !== 'undefined' && UI.onTalentChanged) UI.onTalentChanged();
    return true;
  },

  /* 洗点费用递增：1k / 5k / 20k / 50k，之后每次 50k */
  respecCost() {
    const c = Math.min(3, this.talentState().respecCount || 0);
    return [1000, 5000, 20000, 50000][c];
  },

  respecTalents() {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局' };
    const cost = this.respecCost();
    if (s.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + '）' };
    s.gold -= cost;
    this.talentState().spent = {};
    this.talentState().respecCount = (this.talentState().respecCount || 0) + 1;
    this.recalc();
    if (typeof UI !== 'undefined' && UI.onTalentChanged) UI.onTalentChanged();
    return { ok: true, msg: '已重置天赋，扣除 ' + cost + ' 金币' };
  },

  saveTalentPreset(i) {
    if (i < 0 || i > 2) return false;
    const t = this.talentState();
    t.presets[i] = JSON.parse(JSON.stringify(t.spent));
    return true;
  },

  loadTalentPreset(i) {
    if (i < 0 || i > 2) return { ok: false, msg: '预设位不存在' };
    const t = this.talentState();
    const p = t.presets[i];
    if (!p) return { ok: false, msg: '该预设为空' };
    /* 预设里的点数可能超过当前等级上限：超出的部分截断（按节点表顺序） */
    const budget = this.talentPoints() + this._spentTotal();
    let used = 0;
    const out = {};
    for (const id in p) {
      const e = this.talentNodeOf(id);
      if (!e) continue;
      /* 未解锁的节点不还原（低等级读高等级预设，不该凭空吃到深层天赋） */
      if ((this.state.level || 1) < (e.unlock || 1)) continue;
      /* 协同节点：预设里存着、但现在装备不满足条件 → 不还原（否则等于白嫖隐藏节点） */
      if (e.node.cond && !this.synergyUnlocked(id)) continue;
      const want = Math.min(p[id] || 0, e.node.max);      // 上限保护
      const take = Math.min(want, budget - used);
      if (take > 0) { out[id] = take; used += take; }
    }
    t.spent = out;
    this.recalc();
    if (typeof UI !== 'undefined' && UI.onTalentChanged) UI.onTalentChanged();
    return { ok: true, msg: '已切换到预设 ' + (i + 1) };
  },

  _spentTotal() {
    const sp = this.talentState().spent;
    let n = 0;
    for (const id in sp) n += sp[id] || 0;
    return n;
  },

  /* ======================================================= */
  /* [S4] 技能系统：等级 / 变体 / 技能点                       */
  /* ======================================================= */
  skillState() {
    const s = this.state;
    if (!s) return {};
    if (!s.skills || typeof s.skills !== 'object') s.skills = {};
    return s.skills;
  },

  skillLevel(id) {
    const sk = this.skillState()[id];
    const base = (sk && sk.lv) || 1;
    /* [M1] 词缀「+N 技能等级」：装备加成叠在已投等级之上。
     * 上限 20 —— 自己点满 5 级，装备再抬 15 级也够用，防止无限堆叠。
     * 注意不能写回 s.skills[id].lv：那是「已投技能点」的账本，
     * 写回去会让 skillPoints() 算错、洗点也洗不掉。 */
    const bonus = (this.state && this.state.stats) ? (this.state.stats.skillLv || 0) : 0;
    /* [UNIQUE-2] 传世的「技能等级 +N」：只抬指定技能，与全技能词缀分开算，
     * 这样一件传世能把一个技能从 10 级顶到 12 级，而不影响别的技能。 */
    const rank = (this.state && this.state.stats && this.state.stats.skillRank)
      ? (this.state.stats.skillRank[id] || 0) : 0;
    return Math.min(20, base + bonus + rank);
  },

  /* [UNIQUE-2] 技能是否已领悟。四条来源任一成立即可：
   *   1. 等级到了
   *   2. 任务奖励解锁（skillFlags）
   *   3. 法器授予（relicGrants）
   *   4. 传世授予（grantedSkills）
   * 以前 UI 和施法各写一套 `s.level < sk.unlock`，加了传世之后两处必然对不上 ——
   * 面板显示「未领悟」但技能能放，或者反过来。统一收口到这一个入口。 */
  skillUnlocked(id) {
    const sk = SKILLS[id];
    const s = this.state;
    if (!sk || !s) return false;
    if (s.level >= sk.unlock) return true;
    if (this.skillFlags && this.skillFlags[id]) return true;
    if (typeof this.relicGrants === 'function' && this.relicGrants(id)) return true;
    if (s.stats && s.stats.grantedSkills && s.stats.grantedSkills[id]) return true;
    return false;
  },

  /* [UNIQUE-3] 技能条能放哪些技能：本职业技能（SKILL_ORDER）+ 传世授予的秘技。
   * 传世可以跨职业授予（穿上九幽面纱，战士也能放蚀骨毒雾），
   * 所以「读档清洗 / 放上技能条 / 技能条读取」三处必须共用这一个判定，
   * 各写一套必然出现「面板里有、放不上条」或者「条上留着、放不出来」。 */
  barSkillOk(id) {
    const s = this.state;
    if (!s || !SKILLS[id]) return false;
    if ((SKILL_ORDER[s.cls] || []).indexOf(id) >= 0) return true;
    const g = s.stats && s.stats.grantedSkills;
    return !!(g && g[id]);
  },

  /* 当前变体索引。语义与通道无关：这个技能现在是第几条变体。
   * 新存档读 e.f，老档没有 f 就回落 e.v（skillFormIdx 里做的）。
   * UI / 技能条 / 手机端全都读这一个入口 —— 以前有几处直接读 e.v，
   * 玩家切了变体之后技能条角标不跟着变，就是这个原因。 */
  skillVariant(id) {
    if (typeof skillFormIdx === 'function') return skillFormIdx(this.skillState(), id);
    const sk = this.skillState()[id];
    return (sk && sk.v) || 0;
  },

  /* 可用技能点：总供给 = 等级 × 1.5（skillPointPool），再扣掉三笔已投：
   *   · 主动技能等级（每级 1 点，1→10 共 9 点）
   *   · 取向 / 变体（各 1 点）
   *   · 被动与关键被动（每级 1 点）
   * [P2] 供给从「等级 × 1」抬到 ×1.5 是配合上限 10 级的：不抬的话
   * 5 个技能位拉满要 45 点，40 级根本分不出来，只会从「都弱」变成「养不起」。
   * 只留一个池子（不按方案 §8 拆技能点 / 天赋点）：天赋点已有独立系统，
   * 再拆一次总和会到 130 点，正好能点满全树 —— 取舍就没了。 */
  skillPoints() {
    const s = this.state;
    let spent = 0;
    const sk = this.skillState();
    for (const id in sk) spent += Math.max(0, (sk[id].lv || 1) - 1);
    if (typeof this.branchSpent === 'function') spent += this.branchSpent();
    /* [P2] 被动 / 关键被动：每级 1 点，一并从可用池里扣 */
    if (typeof this.passiveSpent === 'function') spent += this.passiveSpent();
    const pool = (typeof skillPointPool === 'function')
      ? skillPointPool(s ? s.level : 1)
      : (s ? s.level : 1);
    return Math.max(0, pool - spent);
  },

  /* ======================================================= */
  /* [P1c] 三线并行：等级门 + 线内软前置                       */
  /*                                                        */
  /* 旧模型是「第 3 个岔口起 主动 ↔ 被动 二选一」，点错一条线  */
  /* 构筑就锁死。现在改成暗黑 4 式：                          */
  /*   · 三条线同时开放，没有必点主干                        */
  /*   · 每个节点只看「角色等级」（reqLv）                    */
  /*   · 关键被动额外要「该线已投入 ≥ N 点」（needPts，软前置）*/
  /*   · 同岔口的主动与被动可以都点，不再互斥                 */
  /* 唯一稀缺的是技能点，取舍变成「点多少」而不是「点哪条」。 */
  /* ======================================================= */

  /* 某条线已投入的点数（主动 lv-1 + 被动 lv） */
  lineSpent(lineName) {
    const s = this.state;
    if (!s || typeof skillLineSpent !== 'function') return 0;
    return skillLineSpent(s.cls, lineName, skillSpentMap(this.skillState(), s.passives || {}));
  },

  /* 节点门槛：{ reqLv, needPts, level, linePts, levelOK, ptsOK, ok }；
   * 不在树上的节点返回 null（传世秘技等，它们本来就不受树约束）。 */
  skillGate(id) {
    const s = this.state;
    if (!s || typeof skillNodeGate !== 'function') return null;
    const info = (typeof skillLineNodeInfo === 'function') ? skillLineNodeInfo(id) : null;
    if (!info) return null;
    return skillNodeGate(id, { level: s.level, linePts: this.lineSpent(info.line) });
  },

  /* ======================================================= */
  /* [P2] 技能树洗点：一键退光等级 / 取向 / 被动，阶梯收金币      */
  /* ======================================================= */
  /* 当前这一洗要多少金币（每洗一次往后走一档，3.5 万封顶） */
  treeRespecFee() {
    const c = this.state ? (this.state.treeRespecCount || 0) : 0;
    return (typeof skillTreeRespecFee === 'function') ? skillTreeRespecFee(c) : 35000;
  },

  respecTree() {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局' };
    if (typeof skillTreeRespecApply !== 'function') return { ok: false, msg: '洗点还没接入' };
    if (!s.passives || typeof s.passives !== 'object') s.passives = {};
    /* 账目核心在数据层纯函数里（node 可测）：退光账本、算费用 */
    const r = skillTreeRespecApply(this.skillState(), s.passives, s.gold, s.treeRespecCount || 0);
    if (!r.ok) return r;
    s.gold = (s.gold || 0) - r.cost;
    s.treeRespecCount = (s.treeRespecCount || 0) + 1;
    this.behStack = {}; this._drainOn = null; this._follows = null;
    this._recharge = null; this._dragonT = 0; this._autoReviveCd = 0; this._pasT = 0;
    this.recalc();
    if (typeof UI !== 'undefined' && UI.log) {
      UI.log('已洗去 ' + r.cleaned + ' 点技能树投入（-' + r.cost + ' 金）。', 'good');
    }
    if (typeof this.save === 'function') this.save();
    return r;
  },

  levelUpSkill(id) {
    const s = this.state;
    if (!s || !SKILLS[id]) return { ok: false, msg: '技能不存在' };
    if (!this.skillUnlocked(id)) return { ok: false, msg: '尚未领悟' };
    /* [P1c] 三线并行：原来的「第 3 个岔口起主动 ↔ 被动二选一」已删除。
     * 现在只剩等级门（reqLv 默认取技能领悟等级，layout 可覆盖成更高）。 */
    const gate = this.skillGate(id);
    if (gate && !gate.levelOK) {
      return { ok: false, msg: '「' + SKILLS[id].name + '」需 ' + gate.reqLv + ' 级（当前 ' + gate.level + ' 级）' };
    }
    const sk = this.skillState();
    const cur = (sk[id] && sk[id].lv) || 1;
    if (cur >= SKILL_LV_MAX) return { ok: false, msg: '已满级' };
    if (this.skillPoints() <= 0) return { ok: false, msg: '技能点不足' };
    /* 保留取向：这里是「重建对象」，漏掉 p 会让玩家的取向无声消失 */
    sk[id] = keepPick(sk[id], { lv: cur + 1, v: (sk[id] && sk[id].v) || 0 });
    this.recalc();
    return { ok: true, msg: SKILLS[id].name + ' 升至 ' + (cur + 1) + ' 级' };
  },

  levelDownSkill(id) {
    const s = this.state;
    if (!s || !SKILLS[id]) return { ok: false, msg: '技能不存在' };
    const sk = this.skillState();
    const cur = (sk[id] && sk[id].lv) || 1;
    if (cur <= 1) return { ok: false, msg: '已是 1 级，无法再降' };
    /* 降级降到门槛以下时，取向自动作废（点数随之回到可用池里，
     * skillPoints 里的 branchSpent 只统计「有效」的取向）。
     * 这里显式删掉，避免存着一个「等级不够却还在」的僵尸取向。 */
    const next = keepPick(sk[id], { lv: cur - 1, v: (sk[id] && sk[id].v) || 0 });
    if (typeof skillBranchPickValid === 'function' && next.p !== undefined
      && !skillBranchPickValid(next.lv, next.p)) delete next.p;
    sk[id] = next;
    this.recalc();
    return { ok: true, msg: SKILLS[id].name + ' 降至 ' + (cur - 1) + ' 级' };
  },

  setSkillVariant(id, v) {
    if (!SKILLS[id] || v < 0 || v > 2) return false;
    const sk = this.skillState();
    sk[id] = keepPick(sk[id], { lv: (sk[id] && sk[id].lv) || 1, v });
    return true;
  },

  /* ======================================================= */
  /* [S4][P1] 技能条：5 格 × 2 套手动配置（格位 = 功能位）        */
  /* ======================================================= */
  /* 当前生效的那一套（0 / 1） */
  barSet() {
    const s = this.state;
    if (!s) return 0;
    const n = Math.round(Number(s.barSet));
    return (isFinite(n) && n >= 0 && n < SKILL_BAR_SETS) ? n : 0;
  },
  /* 取当前技能条（长度恒为 SKILL_BAR_SLOTS，空位为 null）。
   * fill = true 时用「已领悟且不在条上」的技能按顺序补空位——
   * 只在新档 / 读档时调用；玩家手动腾出的空位不会被偷偷填回。 */
  skillBar(fill) {
    const s = this.state;
    if (!s) return [];
    const set = this.barSet();
    const key = set === 1 ? 'skillbar2' : 'skillbar';
    const order = SKILL_ORDER[s.cls] || [];
    const src = Array.isArray(s[key]) ? s[key] : [];
    /* 清洗：逐格校验（保留空位位置——不能用 filter，否则位置会被挤掉） */
    const seen = {};
    const out = [];
    for (let i = 0; i < SKILL_BAR_SLOTS; i++) {
      const id = src[i];
      if (!id || !SKILLS[id] || !this.barSkillOk(id) || seen[id]) {
        out.push(null);
        continue;
      }
      seen[id] = true;
      out.push(id);
    }
    if (fill) this.fillBarByRole(out, s);
    s[key] = out;
    return s[key];
  },

  /* [P1] 按功能位补空位：第 i 格只收第 i 个位的技能。
   * 老逻辑是「按表顺序填任意空位」，5 格固定位之后那样会填错位
   * （把 ② 的震击塞进 ① 的连斩格），所以补位也必须认位次。
   * 只补 null 格 —— 玩家手动腾出的空位（5 格档）不会被偷偷填回。 */
  fillBarByRole(out, s) {
    s = s || this.state;
    if (!s || !Array.isArray(out)) return out;
    const order = SKILL_ORDER[s.cls] || [];
    for (const id of order) {
      if (out.indexOf(null) < 0) break;              // 满格
      if (out.includes(id)) continue;
      if (s.level < SKILLS[id].unlock) continue;
      if (!this.skillUnlocked(id)) continue;
      const no = skillArchSlotOf(s.cls, id);
      if (!no || out[no - 1] !== null) continue;     // 无位可归 / 本位已占
      out[no - 1] = id;
    }
    return out;
  },

  /* 切换快捷栏（0 / 1）。两套各自独立，互不覆盖。 */
  switchBarSet(n) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局' };
    const want = (n === undefined || n === null)
      ? (this.barSet() + 1) % SKILL_BAR_SETS
      : Math.round(Number(n));
    if (!(want >= 0 && want < SKILL_BAR_SETS)) return { ok: false, msg: '快捷栏不存在' };
    s.barSet = want;
    if (typeof UI !== 'undefined' && UI.onSkillBarChanged) UI.onSkillBarChanged();
    const msg = '快捷栏 · 第 ' + (want + 1) + ' 套';
    if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg);
    return { ok: true, msg };
  },

  /* 把技能放到第 slot 格（0~4）。已在条上时从原位移走（换位）。
   * [P1] 格位 = 功能位：本职业技能只能进自己那个位（② 的震击只能进 1 键），
   * 传世授予的跨职业秘技没有功能位，可以放任意空格。 */
  assignSkillBar(slot, id) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局' };
    if (!(slot >= 0 && slot < SKILL_BAR_SLOTS)) return { ok: false, msg: '技能条位不存在' };
    if (!id) return this.unassignSkillBar(slot);
    const sk = SKILLS[id];
    if (!sk || !this.barSkillOk(id)) return { ok: false, msg: '本职业没有这个技能，也没有传世授予它' };
    if (!this.skillUnlocked(id)) return { ok: false, msg: '尚未领悟「' + sk.name + '」（' + sk.unlock + ' 级）' };
    const no = skillArchSlotOf(s.cls, id);
    if (no && no - 1 !== slot) {
      const meta = skillArchSlot(s.cls, no) || {};
      return { ok: false, msg: '「' + sk.name + '」是 ' + meta.glyph + ' 号位技能，只能放在 ' + (meta.keybind || no) + ' 键' };
    }
    const bar = this.skillBar();
    const from = bar.indexOf(id);
    if (from >= 0 && from !== slot) bar[from] = null;   // 换位：原格腾空
    bar[slot] = id;
    if (typeof UI !== 'undefined' && UI.onSkillBarChanged) UI.onSkillBarChanged();
    return { ok: true, msg: '「' + sk.name + '」已放到技能条 ' + (slot + 1) };
  },

  /* 腾空第 slot 格 */
  unassignSkillBar(slot) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局' };
    if (!(slot >= 0 && slot < SKILL_BAR_SLOTS)) return { ok: false, msg: '技能条位不存在' };
    this.skillBar()[slot] = null;
    if (typeof UI !== 'undefined' && UI.onSkillBarChanged) UI.onSkillBarChanged();
    return { ok: true, msg: '技能条 ' + (slot + 1) + ' 已腾空' };
  },

  /* 读档 / 导入后补新字段（S3 天赋、S4 技能） */
  normalizeProgress(s) {
    if (!s) return;
    /* [试炼] 记录整形：旧档没有这一段，缺省补零；脏值收敛成非负整数 */
    if (!s.trial || typeof s.trial !== 'object') s.trial = { best: 0, runs: 0, bestAt: 0 };
    s.trial.best = Math.max(0, Math.round(Number(s.trial.best) || 0));
    s.trial.runs = Math.max(0, Math.round(Number(s.trial.runs) || 0));
    s.trial.bestAt = Math.max(0, Number(s.trial.bestAt) || 0);
    if (!s.talents || typeof s.talents !== 'object') s.talents = { spent: {}, presets: [null, null, null], respecCount: 0 };
    if (!s.talents.spent || typeof s.talents.spent !== 'object') s.talents.spent = {};
    if (!Array.isArray(s.talents.presets) || s.talents.presets.length !== 3) s.talents.presets = [null, null, null];
    if (!s.skills || typeof s.skills !== 'object') s.skills = {};
    /* 技能条：两套各自归位到 5 格（[P1] 老档 8 格 → 5 格，按功能位重排）。
     * skillBarMigrate 是纯函数（数据层，node 可测）：本职业技能按位归，
     * 同格冲突先到先得，传世秘技第二遍塞剩余空格，幂等。 */
    const cleanBar = arr => {
      if (!Array.isArray(arr)) return null;
      return skillBarMigrate(arr, s.cls);
    };
    s.skillbar = cleanBar(s.skillbar);
    s.skillbar2 = cleanBar(s.skillbar2);
    /* 旧档只有一套栏（skillbar），第二套留空由玩家自己配 */
    if (!s.skillbar2) s.skillbar2 = new Array(SKILL_BAR_SLOTS).fill(null);
    /* [P1] 老 8 格档：收敛到 5 格之后，本位还有已领悟技能的空格补上
     * （与建档同一个补位口径）。只对 P1 之前写的档做一次 ——
     * 5 格档里玩家手动腾空的格子不会被填回，barVer 落盘后就不再走这里。 */
    if (s.barVer !== 2) {
      s.barVer = 2;
      if (Array.isArray(s.skillbar)) this.fillBarByRole(s.skillbar, s);
    }
    s.barSet = (s.barSet === 1) ? 1 : 0;
    /* 已退出数据表的技能 / 天赋节点清掉，防存档里留死 id */
    for (const id in s.skills) if (!SKILLS[id]) delete s.skills[id];
    /* 技能等级 / 变体整形：脏值不许把面板算崩。
     * [P3 收尾] 等级上限从 10 降到 5，老档 6~10 级在这里压到 5 ——
     * 「多出的点」不用单独记账：skillPoints() = 角色等级 − 已投，
     * lv 一变小，可投点数自然涨回来。变体（v / f）原样保留。 */
    for (const id in s.skills) {
      const e = s.skills[id];
      if (!e || typeof e !== 'object') { delete s.skills[id]; continue; }
      e.lv = CLAMP(Math.round(Number(e.lv) || 1), 1, SKILL_LV_MAX);
      e.v = CLAMP(Math.round(Number(e.v) || 0), 0, 2);
      if (e.bk !== undefined) delete e.bk;   // 已废弃字段（技能书方案取消）
    }
    if (typeof TALENT_NODES !== 'undefined') {
      for (const id in s.talents.spent) if (!TALENT_NODES[id]) delete s.talents.spent[id];
      s.talents.presets = s.talents.presets.map(p => {
        if (!p) return null;
        const out = {};
        for (const id in p) if (TALENT_NODES[id]) out[id] = p[id];
        return out;
      });
    }
    /* [P1] 8 格 → 5 格的一次性迁移（拍板 #4）：全退技能点，免费重投。
     * 只跑一次（s.skillReset = 1 写进存档），之后读档不再动。
     * 变体保留 —— 它不花点，是玩法选择不是投资。 */
    if (s.skillReset !== 1 && typeof skillRefundAll === 'function') {
      if (!s.passives || typeof s.passives !== 'object') s.passives = {};
      const r = skillRefundAll(s.skills, s.passives);
      s.skillReset = 1;
      s.skillResetRefund = Math.max(0, r.refunded | 0);
      if (r.refunded > 0) s.skillResetNote = '技能重构：已退回 ' + r.refunded + ' 点技能点，免费重投';
      this.behStack = {}; this._drainOn = null; this._follows = null;
    }
  },

  startNew(cls, name, slot, difficulty) {
    SFX.init();
    // 已有进度先落盘，避免切档丢东西
    if (this.running && this.state) this.save();
    /* 难度在开档时定死，中途不可改（避免打不过就切新手刷收益） */
    this.pendingDifficulty = DIFFS[difficulty] ? difficulty : (this.pendingDifficulty || DEFAULT_DIFF);
    let target = slot || 0;
    if (typeof SaveManager !== 'undefined') {
      const r = SaveManager.createCharacter(cls, name, target);
      if (!r.ok) { UI.toast(r.error || '建档失败', 'bad'); return false; }
      target = r.slot;
    }
    this.state = this.newState(cls, name);
    this.skillFlags = {};            // 新角色不继承上个角色的技能领悟
    if (typeof UI !== 'undefined') UI.snaps = null;   // 换角色：上一个人的加点草稿作废
    this.savedSlot = target || 1;
    this.recalc();
    this.state.hp = this.state.stats.hpMax;
    this.state.mp = this.state.stats.mpMax;
    this.setupPlayer();
    this.loadMap('village');
    UI.hideStart();
    if (this.titleGroup) this.titleGroup.visible = false;
    UI.buildActionBar();
    UI.renderHUD();
    this.running = true;
    this.dead = false;
    this.save();
    UI.toast('踏入山海 · ' + CLASSES[cls].name + ' · ' + this.diff().name, 'lv');
    setTimeout(() => UI.log('【桃源村】村口的老者似乎在等你。', 'good'), 600);
    return true;
  },

  setupPlayer() {
    const cls = CLASSES[this.state.cls];
    if (this.actor) { this.scene.remove(this.actor.group); }
    /* 古风角色优先；任何异常都退回盒子人，保证一定能进游戏 */
    const a = (typeof CharForge !== 'undefined' && CharForge.has(this.state.cls))
      ? CharForge.build(this.state.cls)
      : buildHumanoid({
        color: cls.color, cloth: cls.cloth, skin: 0xe8c8a8,
        legColor: cls.cloth, bootColor: 0x2a2018, sleeve: cls.color, glove: cls.cloth
      });
    a.group.scale.setScalar(a.cf ? 1.0 : 1.12);
    this.actor = a;
    const foot = new THREE.Mesh(ringGeo(0.5, 0.62, 20), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    foot.rotation.x = -Math.PI / 2; foot.position.y = 0.04;
    a.group.add(foot);
    this.playerGroup = a.group;
    this.scene.add(a.group);
    this.aimDir.set(0, 0, -1);
    this.aimPoint.set(this.playerGroup.position.x, 0, this.playerGroup.position.z - 6);
    this.applyDoll();
    /* 新人物建好后重新落地一次镜头设置：第一人称要藏人、FOV 要对 */
    try { this.applyCamView(); } catch (e) { /* 不影响开局 */ }
  },

  applyDoll() {
    applyPaperDoll({
      actor: this.actor, cls: this.state.cls,
      equipment: this.state.equipment, stats: this.state.stats
    });
  },

  /* ======================================================= */
  loadMap(mapId) {
    const s = this.state;
    s.mapId = mapId;
    this.mapGen = (this.mapGen || 0) + 1;
    this.mobTimer = 0;
    // 清场：必须真正释放 GPU 资源。只 scene.remove 不 dispose 的话，
    // 每换一次图就泄漏一整张地图的几何体+材质，几分钟后显存耗尽、上下文丢失。
    for (const e of this.enemies) disposeTree(e.actor.group);
    this.enemies = [];
    for (const a of this.allies) disposeTree(a.actor.group);
    this.allies = [];
    for (const l of this.loot) disposeTree(l.obj);
    this.loot = [];
    for (const id in this.npcs) disposeTree(this.npcs[id].group);
    this.npcs = {};
    if (this.world) disposeTree(this.world.root);
    this.boss = null; UI.updateBoss(null);
    FX.clear();

    this.buffs = []; this.shield = 0; this.shieldT = 0; this.regen = 0; this.poisonT = 0; this.playerSlow = 0; this.playerSlowT = 0; this.reviveT = 0;
    /* 技能树分支叠层（stack）：换图 / 重开都归零 */
    this.behStack = {}; this._drainOn = null; this._follows = null;
    this._recharge = null; this._dragonT = 0; this._autoReviveCd = 0; this._pasT = 0;
    /* [P2] 剑魄的资源记账跟着换图清零；被动计时器归位 */
    this.state.rageSpent = 0;
    this.undyingCd = 0; this.stormT = 6; this.talismanT = 10; this.elixirT = 60; this.phoenixKeyT = 0;
    this.talismanCharges = 0;
    /* [S4] 套装运行时状态：狂怒层数 / 格挡反击与过载天雷的内置冷却 */
    this.frenzy = { n: 0, t: 4 }; this.riposteCd = 0; this.overchargeCd = 0;
    /* [P2b] 剑阵场地（swordarray case 铺，damagePlayer 消费）与阵内反击内置冷却 */
    this.swordField = null; this.swordCounterCd = 0;
    this.cooldowns = {};

    const m = MAPS[mapId];
    this.scene.background = new THREE.Color(m.sky);
    this.scene.fog = new THREE.Fog(m.fog, m.fogNear, m.fogFar);
    this.hemi.color.setHex(m.ambient);
    this.hemi.groundColor.setHex(0x221a12);
    this.hemi.intensity = m.safe ? 0.42 : 0.32;
    this.sun.color.setHex(m.sun);
    this.sun.intensity = m.sunI * 0.82;

    this.world = buildMap(mapId);
    this.scene.add(this.world.root);
    /* [M12] 出生点取入口区域靠内的位置：从传送阵往地图里挪 6 米，
     * 玩家一进图就站在「门口」，而不是凭空出现在地图中央。
     * [v1.12.1] 区域放大后固定 6 米太靠墙（入口区进深已到 26 米），
     * 改成按入口区进深的 3 成偏移，永远落在房间中段靠后的位置。 */
    let p = { x: 0, z: 6 };
    if (typeof mapEntryZone === 'function') {
      const ez = mapEntryZone(mapId);
      if (ez && ez.kind === 'entry') {
        const back = ez.h ? ez.h * 0.30 : 8;
        p = { x: ez.x, z: ez.z - back };
        if (typeof zonesContain === 'function' && !zonesContain(mapId, p.x, p.z)) p = { x: ez.x, z: ez.z };
      }
    }
    s.playerPos = { x: p.x, z: p.z };
    this.playerGroup.position.set(p.x, 0, p.z);
    this.playerGroup.rotation.y = Math.PI;
    /* [v1.12.1] 落地保护：进图头几秒不索敌，先让玩家看清地形 */
    this.aggroGrace = (BALANCE.aggro && BALANCE.aggro.grace) || 3;

    if (mapId === 'village') this.spawnNPCs();
    this.spawnEnemies();
    this.spawnBosses();
    this.recalc();
    this.applyDoll();
    /* [FIX-TOWN] 回城满血：踏入安全区（桃源村）即回满生命与灵力。
     *
     * 换图时上面已经清空了 buff / 中毒 / 减速 / 护盾，但血蓝是原样带过来的，
     * 于是「残血回城 → 站在村里慢慢回蓝 → 再出门」成了固定动作；
     * 更糟的是回城落点就在村口，残血玩家经常刚落地就被门口刷的怪补掉。
     * 这里把回城补满，顺带把上一张图残留的负面状态一并收尾。 */
    if (m.safe) {
      const st = this.state.stats;
      const wasHurt = this.state.hp < st.hpMax - 0.5 || this.state.mp < st.mpMax - 0.5;
      this.state.hp = st.hpMax;
      this.state.mp = st.mpMax;
      this.shield = 0;
      this.poisonT = 0; this.playerSlow = 0; this.playerSlowT = 0; this.shieldT = 0;
      if (wasHurt) {
        const pp = new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z);
        FX.ring(pp, 3.2, 0x8ce0a8, 0.8, 0.3);
        for (let i = 0; i < 26; i++) {
          FX.burst(new THREE.Vector3(pp.x + RND(-1.2, 1.2), RND(0.1, 2.2), pp.z + RND(-1.2, 1.2)),
            0x9affc8, 1, { speed: 1.6, size: 0.1, life: 1.1, gravity: -3, additive: true });
        }
        UI.toast('气血尽复', 'lv');
      }
    }
    UI.renderHUD();
    UI.renderActionBar && UI.buildActionBar();
    UI.log('【' + m.name + '】' + (m.safe ? '炊烟与犬吠，难得的安宁。' : '妖气弥漫，小心脚下。'), m.safe ? 'good' : 'bad');
    /* [S16] 换图换环境音与调式。ambient 内部做 1.2 秒交叉淡出，
     * 不会出现「上一张图的风声硬切断」；BGM 层不重启，只换音符来源。 */
    if (typeof AudioSys !== 'undefined') {
      AudioSys.ambient(mapId);
      AudioSys.bgm('explore');
      /* 换图清掉上半场的战斗音乐残留：新图第一秒就该是探索层，
       * 不能因为上一张图刚打死怪而带着 4 秒战斗尾巴进来 */
      this._combatHold = 0;
      this._audDt = 0;
      this._audT = 0;
    }
    document.getElementById('death').style.display = 'none';
    this.save();
  },

  spawnNPCs() {
    /* [M6] 仓管放在村尾右侧（与左侧的试炼使者一左一右），
     * 新人从传送阵一路走过来会先见到铁匠药师，最后才见到仓库 —— 顺序合理。 */
    const pos = { elder: [-7, 2], smith: [7, 7], herbalist: [-10, 14], monk: [9, 15], alchemist: [2, 18], warden: [-6, 20], steward: [9, 22] };
    for (const id of MAPS.village.npcs) {
      const a = buildNPC(id);
      /* 位置表漏写就退回原点，别让整张图的 NPC 因为一个坐标缺失全部不生成 */
      const p2 = pos[id] || [0, 0];
      const x = p2[0], z = p2[1];
      a.group.position.set(x, 0, z);
      a.group.rotation.y = Math.atan2(-x, -(z - 6));
      this.scene.add(a.group);
      this.npcs[id] = { id, actor: a, group: a.group, pos: new THREE.Vector3(x, 0, z), basesY: 0 };
      if (id === 'elder') {
        const ex = makeLabelSprite('!', '#ffd166', 175, 2.4, 1.2);
        ex.position.y = 4.1;
        a.group.add(ex);
        const qm = makeLabelSprite('?', '#8ae08a', 175, 2.4, 1.2);
        qm.position.y = 4.1; qm.visible = false;
        a.group.add(qm);
        this.npcs[id].markEx = ex;
        this.npcs[id].markQ = qm;
      }
    }
    this.updateQuestMarker();
  },

  updateQuestMarker() {
    const n = this.npcs.elder;
    if (!n || !this.state) return;
    const active = this.state.quests.active;
    const ready = active.some(a => this.questReady(a));
    const avail = active.length === 0 && !!QUESTS[this.state.quests.next];
    if (n.markEx) n.markEx.visible = avail;
    if (n.markQ) n.markQ.visible = ready;
  },

  spawnEnemies() {
    const m = MAPS[this.state.mapId];
    if (m.safe || !m.spawns) return;
    const D = this.diff();
    /* [M12] 按区域刷：每个 zone 有自己的怪种与数量，主厅最多、走廊不刷。
     * 这样「走进西坡」和「走进主厅」遇到的怪不一样，地图才有分区感。 */
    const zs = (typeof zoneSpawners === 'function') ? zoneSpawners(this.state.mapId) : null;
    if (zs && zs.length) {
      const sp = this.playerGroup.position;
      for (const z of zs) {
        const n = z.spawns.count || 0;
        for (let i = 0; i < n; i++) {
          const kind = zonePickKind(z, m.spawns);
          if (!kind) continue;
          /* [v1.12.1] 别刷在出生点附近。走廊上端与入口区是重叠的，
           * 只把入口区的刷怪数量清零不够 —— 走廊刷出来的怪照样站在玩家脸上。
           * 连试 8 次都找不到远处的位置就跳过这只（宁可少刷也不刷脸）。 */
          let p = null;
          for (let k = 0; k < 8; k++) {
            const q = randomPointInZone(z, 2.6);
            if (Math.hypot(q.x - sp.x, q.z - sp.z) >= SPAWN_SAFE) { p = q; break; }
          }
          if (!p) continue;
          this.spawnEnemy(kind, p.x, p.z, CHANCE(D.elite));
        }
      }
      return;
    }
    const count = m.spawnCount || 14;
    /* [DIFF] 精英出现概率由难度决定：新手 3%，普通 8%，困难 16%，极难 26% */
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = RND(16, m.size * 0.46);
      const kind = PICK(m.spawns);
      this.spawnEnemy(kind, Math.cos(ang) * r, Math.sin(ang) * r, CHANCE(D.elite));
    }
  },

  spawnEnemy(kind, x, z, elite, levelOverride, bossId) {
    const cfg = bossId ? BOSSES[bossId] : MONSTERS[kind];
    if (!cfg) return null;
    const isBoss = !!bossId;
    /* [v1.0.5] 同屏普通怪硬上限：超过就不再生成（调用方都已处理 null）。
     * 不做这个检查的话，Boss 的 summon 会每几秒往场上塞 2~4 只且永不回收，
     * 一场持久战下来能堆到一百多只，draw call 直接顶穿手机 GPU。 */
    if (!isBoss) {
      /* 上限可在设置里调（低配机器调到 12~20 能立竿见影）；
       * this.mobCap 由 applyPerfLevel 写入，没初始化时退回常量 */
      const cap = this.mobCap || (IS_TOUCH ? MOB_CAP_TOUCH : MOB_CAP_PC);
      let alive = 0;
      for (const e of this.enemies) if (!e.dead && !e.boss) alive++;
      if (alive >= cap) return null;
    }
    const mapLv = MAPS[this.state.mapId].level;
    const lvl = levelOverride || (mapLv + RNDI(-1, 2));
    const scale = cfg.scale || 1;
    const a = buildMonster(cfg.model || 'humanoid', {
      scale: scale * (elite ? 1.12 : 1) * (isBoss ? 1 : 1.0),
      color: cfg.color, cloth: cfg.cloth, skin: cfg.skin
    });
    a.group.position.set(x, 0, z);
    a.group.rotation.y = Math.random() * 6.28;
    a.baseY = 0;
    a.fly = !!cfg.fly;
    this.scene.add(a.group);

    /* [DIFF] 难度系数在这里一次性乘进怪物基础属性。
     * 之后所有战斗计算（伤害、掉落、经验）都按已放大的数值走，不用到处再判难度。 */
    const D = this.diff();
    /* [v1.10.0] 血量成长由 BALANCE 决定：普通怪 1 + lv·hpLv + lv²·hpLv2（超线性），
     * 首领在固定 cfg.hp 基础上按自身等级放大约 12 倍 —— 老版首领血量写死，
     * 玩家伤害涨了十几倍之后首领就成了沙包。 */
    const MB = (typeof BALANCE !== 'undefined' ? BALANCE.mob : { hpLv: 0.55, hpLv2: 0.010, eliteHp: 2.4 });
    const BB = (typeof BALANCE !== 'undefined' ? BALANCE.boss : { hpMul: 4.5, dmgLv: 0.28 });
    /* [v1.11.0] 玩家整体降速后，怪物移速同步缩放（见 BALANCE.move） */
    const MV = (typeof BALANCE !== 'undefined' && BALANCE.move) ? BALANCE.move : { mobScale: 1 };
    let hp = isBoss
      ? cfg.hp * (typeof bossHpScale === 'function' ? bossHpScale(lvl) : 1)
      : cfg.hp * ((MB.hpBase || 1) + lvl * MB.hpLv + lvl * lvl * MB.hpLv2);
    if (elite) hp *= MB.eliteHp;
    hp *= D.mobHp;

    /* [DIFF] 极难：给原本没有元素属性的怪随机附一个元素，
     * 让「火/冰/毒抗」这三条冷门属性真正有用。Boss 自带的元素不覆盖。 */
    let ecfg = cfg;
    if (D.elem && !isBoss && !cfg.fire && !cfg.ice && !cfg.poison) {
      const el = PICK(['fire', 'ice', 'poison']);
      ecfg = Object.assign({}, cfg, { [el]: true, elemBoost: el });
    }

    /* [S5] 精英词缀：按难度抽 1~3 条。
     * 词缀在生成时一次性落到 e 上（dmg/spd/atkCd/resist），
     * 战斗里只做读取，不在每帧重新判断，省得 40 只怪同屏时反复开关分支。 */
    const affixes = elite ? rollEliteAffixes(eliteAffixCount(D.key)) : [];
    const aff = {};
    for (const id of affixes) aff[id] = ELITE_AFFIXES[id] || {};
    /* [S5] 族群抗性：正数减伤、负数增伤；元素免疫在此覆盖对应一项 */
    const fam = MON_FAMILIES[cfg.family] || MON_FAMILIES.humanoid;
    const resist = Object.assign({}, fam.resist);
    let wardElem = null;
    if (aff.warded) {
      wardElem = PICK(ELITE_WARD_ELEMS);
      resist[wardElem] = Math.max(resist[wardElem] || 0, aff.warded.cut);
    }

    /* [FOOT2] 在模型与缩放开全后重测真实碰撞半径。
     * setFootR 在 builder 阶段就跑了，复杂 Boss（带翅膀/巨兵器）往往在 setFootR 之后
     * 才把大体量部件挂上去，导致 a.footR 严重偏小（如 firegeneral a.footR≈0.69，但真实
     * 顶点到原点达 4.04）。若按 a.footR*scale 算 radius，玩家会直接走进 Boss 身体（穿模）。
     * 这里重新量「已组装完、且带 group.scale」的真实模型，取顶点到 group 原点的最大水平距。 */
    const measureFootR = (group) => {
      group.updateMatrixWorld(true);
      const gPos = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
      const v = new THREE.Vector3();
      let mx = 0;
      group.traverse(o => {
        if (o.isSprite || o.renderOrder >= 900) return;
        if (!o.isMesh || !o.geometry) return;
        const gt = o.geometry.type || '';
        if (gt.indexOf('Ring') >= 0) return;            // 排除光环/精英环
        const pos = o.geometry.attributes.position;
        if (!pos) return;
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const d = Math.hypot(v.x - gPos.x, v.z - gPos.z);
          if (d > mx) mx = d;
        }
      });
      return Math.max(0.3, mx);
    };

    const e = {
      id: 'e' + Math.random().toString(36).slice(2),
      kind: bossId || kind, cfg: ecfg, actor: a, boss: isBoss, elite: !!elite,
      /* [v1.12.1] 出生点：脱战后走回这里，避免怪被追着跑之后全堆在入口 */
      home: { x, z },
      level: lvl, hp, maxHp: hp,
      dmg: (cfg.atk || 10) * (1 + lvl * (isBoss ? BB.dmgLv : MB.dmgLv)) * (elite ? MB.eliteDmg : 1) * D.mobDmg,
      spd: (cfg.spd || 3) * D.mobSpd * MV.mobScale,
      /* range 只表示「数据设定的攻击距离」（远程怪用来卡位）。
       * 近战另算 reach：贴到「碰撞半径 + 余量」就该出手。
       * 否则蜘蛛这种 radius 1.55 的大体积怪，被分离逻辑卡在 2.10 外，
       * 而 AI 要求 d < range*0.85 = 2.04 才挥爪 —— 结果永远撞不进去也永远打不到。
       * 系数 1.26 是反解出来的：d 的下限 = radius + 0.55，AI 阈值 = reach * 0.8。 */
      range: cfg.range || 2.2,
      reach: cfg.range || 2.2,                            // 占位，下方统一 patch
      radius: a.footR || 0.75,                            // 占位，下方统一 patch
      pos: new THREE.Vector3(x, 0, z), dead: false,
      atkCd: RND(0.3, 1.4), windup: 0, anim: 0, hitFlash: 0,
      stun: 0, slow: 0, slowT: 0, poisonT: 0, poisonDmg: 0, venomT: 0,
      dotT: 0, dotTick: 0, dotDmg: 0, dotElem: null, dotLabel: '',
      phase: 0, patternCd: 3, tag: kind, facing: new THREE.Vector3(0, 0, 1),
      spawnPos: new THREE.Vector3(x, 0, z), active: !isBoss, hitT: 0,
      /* [S5] 精英词缀与族群抗性 */
      affixes, aff, resist, wardElem,
      family: cfg.family || 'humanoid',
      /* [S16] 发声用的体型：audio.js 按 1/size^0.55 降调。
       * 精英 +12%、首领再 ×1.35，Boss 一吼就该比小怪沉一个八度。 */
      size: scale * (elite ? 1.12 : 1) * (isBoss ? 1.35 : 1),
      name: elite ? eliteDisplayName(cfg.name, affixes) : cfg.name,
      shield: 0, shieldCd: 0, summonStep: 0, splitChild: false,
      /* [C2] 行为原型状态机。kind 来自数据表（MOB_AI_KINDS），
       * 不写则按 ranged 退化成最基础的 melee / ranged。
       * 其余字段都是各原型的私有状态，统一放这里免得每只怪长一堆散字段。 */
      ai: {
        kind: ecfg.ai || (ecfg.ranged ? 'ranged' : 'melee'),
        state: 'idle',      // idle / chase / fuse / cast / flee
        t: 0,               // 当前状态已持续时间
        cd: 0,              // 主动技能冷却（治疗 / 召唤 / 逃逸共用）
        slotAng: null,      // 包夹方位（aggro 时分配，之后固定）
        orbitDir: 0,        // 风筝绕行方向（±1）
        pauseT: 0,          // 风筝的射击站定
        fuseT: 0,           // 自爆引信
        castT: 0,           // 施法（治疗 / 召唤）
        fleeT: 0,           // 逃跑剩余时间
        target: null,       // 治疗 / 召唤的目标 id
        exploded: false     // 自爆只炸一次
      }
    };
    /* [S5] 迅捷：移速与攻速在生成时一次性乘进去 */
    if (aff.swift) {
      e.spd *= 1 + aff.swift.spd / 100;
      e.atkCdBase = (cfg.atkCd || 1.8) / (1 + aff.swift.aspd / 100);
    }
    if (elite) {
      const ring = new THREE.Mesh(ringGeo(0.9, 1.15, 20), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      a.group.add(ring);
      e.eliteRing = ring;
    }
    if (isBoss) {
      /* [FIX-BOSSLABEL] 名字牌必须放在「不被 group.scale 二次放大」的容器里。
       *
       * 旧写法：label.position.y = 4.2 * (scale / 1.8)，直接把精灵挂在 a.group 下。
       * a.group.scale = scale（首领 1.9~3.0），于是：
       *   实际世界高度 = 4.2 * (scale/1.8) * scale   → 混沌天魔(3.0) 得到 21 单位，
       *   精灵自身 6×1.5 也被放大成 18×4.5 世界单位。
       * 名字牌飘在离本体二十米的高空，斜俯视镜头下透视投影会把它甩到屏幕另一侧，
       * 看起来就是「BOSS 显示位置和实际坐标对不上」。
       *
       * 现在改用和血条同一套做法：先量模型真实头顶（modelTopY），
       * 再把容器缩放取倒数抵消，位置与字号都按世界单位算。 */
      const gs = a.group.scale.x || 1;
      const topWorld = modelTopY(a.group);          // 世界空间头顶高度（group 在 y=0，等价于 local*gs）
      const labelG = new THREE.Group();
      labelG.scale.setScalar(1 / gs);
      labelG.position.y = (topWorld + 0.55) / gs;   // 抵消缩放后正好落在头顶上方 0.55
      labelG.renderOrder = 999;
      const label = makeLabelSprite(cfg.name, '#ffd8b0', 44);
      label.position.set(0, 0, 0);
      labelG.add(label);
      a.group.add(labelG);
      e.label = label;
      e.labelG = labelG;
      // 专属武器
      const shapes = { brute: 'axe', golem: 'axe', humanoid: 'glaive', demon: 'glaive', ghost: 'staff', snake: 'staff' };
      const shape = shapes[cfg.model];
      if (shape && a.parts.weaponHand) {
        const glow = cfg.fire ? 0xff5522 : (cfg.ice ? 0x88ddff : 0xff9a44);
        const w = buildWeapon(shape, 0x8a9098, glow, 1.15);
        w.rotation.set(-0.1, 0, -0.9);
        a.parts.weaponHand.add(w);
      }
      const aura = new THREE.Mesh(ringGeo(1.15, 1.45, 26), new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      aura.rotation.x = -Math.PI / 2; aura.position.y = 0.06;
      a.group.add(aura);
      e.bossAura = aura;
    }
    // 头顶血条（首领用顶部大血条，不重复显示）
    if (!isBoss) e.bar = makeHpBar(a.group, { elite: !!elite, gap: 0.22 });
    /* [S5] 精英名字牌：没有它，40 只怪同屏时「哪只是冰霜、哪只是荆棘」全靠猜。
     * 做法与 Boss 牌一致——容器缩放取倒数，位置按世界单位算，避免被 group.scale 二次放大。 */
    if (elite && !isBoss) {
      const gs = a.group.scale.x || 1;
      const topWorld = modelTopY(a.group);
      const lg = new THREE.Group();
      lg.scale.setScalar(1 / gs);
      lg.position.y = (topWorld + 0.34) / gs;
      lg.renderOrder = 998;
      const first = ELITE_AFFIXES[affixes[0]] || { color: '#ffd166' };
      const lb = makeLabelSprite(e.name, first.color, 34, 3.4, 0.85);
      lg.add(lb);
      a.group.add(lg);
      e.label = lb; e.labelG = lg;
    }

    /* [FOOT2] 此时 Boss 的专属武器/光环、精英环都已挂上，重新量真实水平包围，
     * 取「顶点到 group 原点的最大水平距」，回填碰撞半径与触及距离。
     * 这一步必须放在最后：早一步（builder 里的 setFootR 或 spawnEnemy 开头）量到的都是
     * 没带武器的半成品模型，radius 会严重偏小，玩家直接走进 Boss 身体（穿模）。 */
    const _fr = measureFootR(a.group);
    const _br = Math.max(0.5, _fr + 0.2);                 // +0.2 冗余，避免贴边穿模
    e.radius = _br;
    e.reach = Math.max(cfg.range || 2.2, _br * 1.26 + 0.75);

    this.enemies.push(e);
    return e;
  },

  spawnBosses() {
    const m = MAPS[this.state.mapId];
    if (!m.bosses || !m.bosses.length) return;
    for (const bid of m.bosses) {
      const pos = BOSS_POS[bid] || [0, -30];
      const b = this.spawnEnemy(null, pos[0], pos[1], false, BOSSES[bid].level, bid);
      if (b) {
        b.dmg = BOSSES[bid].atk * (1 + BOSSES[bid].level * 0.09);
        b.patternCd = RND(2.5, 4.5);
        /* [M12] 拴绳锚点：玩家跑出祭坛之后首领要回位，
         * 而不是顶着祭坛的硬墙原地抖（区域化之前圆环是软的，看不出来）。 */
        b.anchor = { x: pos[0], z: pos[1] };
      }
    }
  },

  /* 用本帧最终相机姿态校正所有血条朝向（详见 animate 里的说明） */
  faceHpBars() {
    if (!this.camera || typeof faceHpBar !== 'function') return;
    for (const e of this.enemies) {
      if (e.bar && e.bar.group.visible) faceHpBar(e.bar, this.camera);
    }
    /* [P2b·兽群] 灵兽也有血条了，同一帧一起校正 —— 漏掉的话它们的血条
     * 会随模型转身被甩开（就是怪物血条当年那个 bug）。 */
    for (const al of (this.allies || [])) {
      if (al.bar && al.bar.group.visible) faceHpBar(al.bar, this.camera);
    }
  },

  /* ======================================================= */
  animate() {
    requestAnimationFrame(() => this.animate());
    /* [v1.0.5] 单帧异常兜底。
     * 以前 update() 里抛一次异常，后面的 renderer.render 就不会执行：
     * 画面定格在上一帧、HUD 不再变化，玩家看到的就是「卡死 / 闪退」，
     * 而且每帧都在同一个地方抛，永远恢复不了。
     * 现在把整帧包起来，异常限频上报，并且仍然尝试把上一帧的画面渲染出来。 */
    try {
      this.tickFrame();
    } catch (err) {
      this.onFrameError(err);
      try { this.renderer.render(this.scene, this.camera); } catch (e) { /* 场景已损坏，下一帧再试 */ }
    }
  },

  tickFrame() {
    /* real 是真实墙钟间隔，raw 是被夹到 60ms 的逻辑步长。
     * 帧率统计必须用 real：用夹过的 raw 在低帧率下会算出严重偏高的 FPS
     * （4fps 会被报成 16fps），那样帧数面板等于骗人，自动降档也会误判。 */
    const real = this.clock.getDelta();
    const raw = Math.min(real, 0.06);
    this._calls = 0;
    let dt = raw;
    if (this.hitstop > 0) { this.hitstop -= raw * 1000; dt = raw * 0.1; }
    this.time += dt;
    if (this.running && this.state && !this.dead) this.update(dt, raw);
    if (this.running && this.state) {
      this.updateCamera(raw);
      /* [FIX-HPBAR] 血条朝向必须在相机更新「之后」再校正一次。
       * updateEnemies 里那次校正用的是上一帧的相机朝向，而 updateCamera 随后又会改相机，
       * 两者差一帧就会残留可见偏差（实测 dot≈0.955，约 34°）。放在这里等于用本帧
       * 最终相机姿态对齐，怪物转身与镜头移动都不会再让血条错位。 */
      this.faceHpBars();
      FX.update(dt);
      this.drawMinimapThrottled(raw);
      UI.updateSkillbar();
      this.updateHUDThrottled(raw);
    } else if (!this.running) {
      // 标题界面：缓慢旋转的远景
      FX.update(dt);
      this.menuCamera();
    }
    this.renderer.render(this.scene, this.camera);
    this.tickPerf(real);
  },

  /* 限频上报：同一个错误每 5 秒最多提示一次，否则控制台会被刷爆 */
  onFrameError(err) {
    const now = Date.now();
    this._errCount = (this._errCount || 0) + 1;
    if (!this._errAt || now - this._errAt > 5000) {
      this._errAt = now;
      console.error('[帧异常 x' + this._errCount + ']', err);
      try { UI.toast('运行异常已捕获，游戏继续', 'bad'); } catch (e) { /* UI 还没初始化 */ }
    }
  },

  /* ---------------- 自适应画质 ---------------- *
   * 不猜用户的机器，直接量：每秒统计一次实际帧率，掉了就降一档。
   * 降档顺序是「性价比」顺序——先降分辨率（几乎无感），再降阴影质量，
   * 最后才关阴影（观感损失最大，但集显上往往是唯一能把帧率拉回来的手段）。
   * 降档要连续两次采样都低才执行，避免一次过场卡顿就误判；
   * 升档要求连续 5 次采样都很稳，否则会在阈值附近反复横跳、反复重编译 shader。
   *
   * 注意：这段只在设置里选了「自动」档时才跑。用户手动钉了档位还继续自动改，
   * 会让人觉得「设置不生效」，那是最糟的体验。
   */
  tickPerf(raw) {
    const p = this.perf;
    if (!p) return;
    /* 单帧间隔上限夹到 0.25s：只为挡住「切后台再切回来」那种几秒的大跳，
     * 不夹会瞬间算出 1fps 直接把画质打到底。0.25s 意味着最低可测到 4fps，
     * 再低已经没法玩了，读数不准也无所谓。 */
    p.acc += Math.min(raw, 0.25); p.frames++;
    if (p.acc < 1) return;
    const fps = p.frames / p.acc;
    p.fps = Math.round(fps);
    p.acc = 0; p.frames = 0;
    /* 帧数面板和自动降档共用这次采样，所以放在 early-return 之前 */
    this.updateFpsHud(fps);
    if (typeof Settings !== 'undefined' && Settings.d && !Settings.autoAdjust()) return;
    // 启动前几秒在编译 shader、上传贴图，帧率天然难看，不作数
    if (p.warm < 3) { p.warm++; return; }

    if (fps < 42) {
      p.low++; p.good = 0;
      if (p.low >= 2 && p.level < 2) { p.level++; p.low = 0; this.applyPerfLevel(); }
    } else if (fps > 57) {
      p.good++; p.low = 0;
      if (p.good >= 5 && p.level > 0) { p.level--; p.good = 0; this.applyPerfLevel(); }
    } else {
      p.low = 0; p.good = 0;
    }
  },

  /* 把「自动等级 + 玩家设置」合成一组实际参数。
   * 没有 Settings（老存档 / 单测环境）时退回原来的纯自动逻辑。 */
  perfCfg() {
    const lv = this.perf.level;
    if (typeof Settings !== 'undefined' && Settings.resolve) return Settings.resolve(lv);
    return {
      dpr: Math.min(window.devicePixelRatio || 1, [1.5, 1.25, 1.0][lv] || 1),
      shadow: lv < 2,
      shadowSize: lv === 0 ? 1536 : 1024,
      fx: [1, 0.7, 0.5][lv] || 0.5,
      mobCap: IS_TOUCH ? MOB_CAP_TOUCH : MOB_CAP_PC,
      forceShadow: false
    };
  },

  applyPerfLevel() {
    const p = this.perf, r = this.renderer;
    if (!r) return;
    const cfg = this.perfCfg();
    const lv = p.level;

    if (Math.abs(cfg.dpr - r.getPixelRatio()) > 0.01) {
      r.setPixelRatio(cfg.dpr);
      r.setSize(window.innerWidth, window.innerHeight);
    }
    if (r.shadowMap.enabled !== cfg.shadow) {
      r.shadowMap.enabled = cfg.shadow;
      this.dirtyShadows();
    }
    // 注意别写成 else if：从 L2 回升到 L0 时「重新开阴影」和「调回 1536」要同时发生
    if (cfg.shadow && this.sun.shadow.mapSize.x !== cfg.shadowSize) {
      this.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    p.dpr = cfg.dpr;
    p.shadow = cfg.shadow ? cfg.shadowSize : 0;
    if (typeof FX !== 'undefined') FX.q = cfg.fx;
    /* 同屏怪数上限也归这里管：低配机器上这是最直接的 draw call 开关 */
    this.mobCap = cfg.mobCap;
    console.log('[画质] L' + lv + ' · dpr=' + cfg.dpr.toFixed(2) + ' · 阴影=' + (p.shadow || '关')
      + ' · 粒子=' + cfg.fx + ' · 怪≤' + cfg.mobCap + ' · ' + p.fps + 'fps');
  },

  /* 帧数面板：1 秒刷新一次，只写文本，不重建 DOM */
  updateFpsHud(fps) {
    if (typeof UI === 'undefined' || !UI.setFps) return;
    if (typeof Settings !== 'undefined' && Settings.d && !Settings.d.fps) { UI.setFps(0, null); return; }
    UI.setFps(fps, {
      calls: this._calls || 0,
      dpr: this.renderer ? this.renderer.getPixelRatio() : 1,
      shadow: this.renderer ? this.renderer.shadowMap.enabled : false,
      cap: this.mobCap,
      level: this.perf.level
    });
  },

  /* 开关阴影会改变材质编译时的 defines，必须让所有材质重新编译一次，
   * 否则画面上会出现「阴影还在/阴影错乱」的残影。只在下调画质时触发一次。 */
  dirtyShadows() {
    if (!this.scene) return;
    this.scene.traverse(o => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach(x => { if (x) x.needsUpdate = true; });
      else m.needsUpdate = true;
    });
  },

  menuCamera() {
    const t = this.time * 0.1;
    /* 标题镜头固定用 46°：如果玩家把视角设成第一人称（74°），
     * 退回标题界面时会看到一张畸变的远景，看着像坏了 */
    if (this.camera.fov !== 46) { this.camera.fov = 46; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(Math.sin(t) * 25, 6.2, Math.cos(t) * 25);
    this.camera.lookAt(0, 5.2, 0);
    // 萤火浮动
    if (this.titleFly) {
      for (const f of this.titleFly) {
        f.m.position.y = f.base + Math.sin(this.time * f.sp + f.ph) * 0.45;
        f.m.position.x += Math.sin(this.time * 0.6 + f.ph) * 0.0015;
      }
    }
  },

  buildTitleScene() {
    // 标题界面：夜空下的孤峰松林
    this.titleGroup = new THREE.Group();
    this.scene.add(this.titleGroup);
    this.scene.background = new THREE.Color(0x161d2b);
    this.scene.fog = new THREE.Fog(0x161d2b, 44, 135);

    // 孤峰岩体 + 山顶薄土
    const rock = M(0x4c5464, { rough: 1 });
    const isl = mesh(new THREE.CylinderGeometry(17, 7, 8, 9), rock, 0, -4, 0, this.titleGroup);
    isl.receiveShadow = true;
    mesh(new THREE.CylinderGeometry(17.3, 17.1, 0.9, 9), M(0x3f4b3a, { rough: 1 }), 0, -0.45, 0, this.titleGroup);
    // 侧壁碎岩，打散柱体轮廓
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 6.28 + RND(-0.2, 0.2);
      const r = RND(8, 16);
      const rk = mesh(new THREE.DodecahedronGeometry(RND(1, 2.6), 0), rock,
        Math.cos(a) * r, RND(-3.4, -0.6), Math.sin(a) * r, this.titleGroup);
      rk.rotation.set(RND(0, 3), RND(0, 3), RND(0, 3));
    }

    // 松林
    for (let i = 0; i < 9; i++) {
      const t = makeTree(RND(0.85, 1.5), 'pine');
      const a = i / 9 * 6.28 + RND(-0.35, 0.35);
      t.position.set(Math.cos(a) * RND(3, 14), 0, Math.sin(a) * RND(3, 14));
      t.rotation.y = RND(0, 3);
      this.titleGroup.add(t);
    }

    // 山巅灯火
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * 6.28 + 0.6;
      const x = Math.cos(a) * RND(6, 10), z = Math.sin(a) * RND(6, 10);
      mesh(sphGeo(0.16, 6), M(0xffd9a0, { emissive: 0xffb454, ei: 3 }), x, RND(1.6, 2.6), z, this.titleGroup);
      const l = new THREE.PointLight(0xffb461, 2.4, 20, 2);
      l.position.set(x, 2.2, z);
      this.titleGroup.add(l);
    }

    // 一轮明月（挂相机上，任何视角都在画面里）
    const mc = document.createElement('canvas');
    mc.width = mc.height = 128;
    const mg = mc.getContext('2d');
    const grd = mg.createRadialGradient(64, 64, 5, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,250,232,0.95)');
    grd.addColorStop(0.18, 'rgba(255,243,205,0.62)');
    grd.addColorStop(0.5, 'rgba(240,226,180,0.16)');
    grd.addColorStop(1, 'rgba(230,215,170,0)');
    mg.fillStyle = grd; mg.fillRect(0, 0, 128, 128);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    moon.scale.setScalar(34);
    moon.position.set(-30, 20, -70);
    this.scene.add(this.camera);
    this.camera.add(moon);

    // 萤火
    this.titleFly = [];
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, r = RND(2, 15);
      const f = mesh(sphGeo(0.07, 4), M(0xffe9a8, { emissive: 0xffcf6a, ei: 2.6 }),
        Math.cos(a) * r, RND(0.6, 4.5), Math.sin(a) * r, this.titleGroup);
      this.titleFly.push({ m: f, base: f.position.y, sp: RND(0.5, 1.2), ph: RND(0, 6.28) });
    }

    // 顶部补光，避免山体全黑
    const fill = new THREE.PointLight(0xa8c4ff, 1.6, 70, 2);
    fill.position.set(0, 18, 14);
    this.titleGroup.add(fill);
  },

  updateHUDThrottled(raw) {
    this.hudT = (this.hudT || 0) + raw;
    if (this.hudT > 0.1) { this.hudT = 0; UI.renderHUD(); this.state.playerPos.x = this.playerGroup.position.x; this.state.playerPos.z = this.playerGroup.position.z; }
  },

  drawMinimapThrottled(raw) {
    this.minimapT += raw;
    if (this.minimapT > 0.1) { this.minimapT = 0; UI.drawMinimap(); }
  },

  /* ---------------- 镜头预设 ---------------- */

  viewDef() { return CAM_VIEWS[this.camView] || CAM_VIEWS.classic; },
  isFP() { return !!this.viewDef().fp; },

  /* 释放第一人称的鼠标锁定。打开菜单 / 退出第一人称时必须调 ——
   * 锁定状态下光标是隐藏的，不释放就点不到面板上的按钮。 */
  exitLook() {
    if (!this.pl) return;
    this.pl = false;
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* 忽略 */ }
  },

  /* 读设置 → 落地到相机。设置面板改视角/震动时由 Settings.apply 调过来；
   * 开局（setupPlayer）也会调一次，保证人物显隐与 FOV 跟着视角走。 */
  applyCamView(changed) {
    const d = (typeof Settings !== 'undefined' && Settings.d) ? Settings.d : null;
    const view = (d && CAM_VIEWS[d.view]) ? d.view : 'classic';
    const changedView = (view !== this.camView);
    this.camView = view;
    this.shakeMul = (d && SHAKE_MUL[d.shake] !== undefined) ? SHAKE_MUL[d.shake] : 1;
    const v = this.viewDef();

    /* 换视角时把滚轮缩放归位，否则从「暗黑4 拉到最远」切到「第一人称」会残留倍率 */
    if (changedView) { this.camZoom = 1; this.camPunch = 0; this.fpPitch = -0.13; }

    if (this.camera) {
      this.camera.fov = v.fov;
      this.camera.updateProjectionMatrix();
    }
    /* 第一人称必须藏掉人物，否则镜头卡在后脑勺里 */
    if (this.playerGroup) this.playerGroup.visible = !v.fp;
    /* 退出第一人称时释放鼠标锁，不然光标一直藏着 */
    if (!v.fp) this.exitLook();
    /* 机位立刻贴到位，避免切换瞬间镜头从旧位置飞过来 */
    this.camDist = v.dist * (this.camZoom || 1);
    this.camHeight = v.height + (this.camDist - v.dist) * v.pitchK;
    if (changed === 'view' && v.fp) {
      try { UI.toast('第一人称：点一下画面锁定鼠标，移动鼠标转身，Esc 解锁', 'info'); } catch (e) { }
    }
  },

  updateCamera(raw) {
    const p = this.playerGroup.position;
    const v = this.viewDef();

    /* ---------- 第一人称 ---------- */
    if (v.fp) {
      this.camPunch = 0;
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      const eyeY = p.y + v.lookY;
      /* 机位直接吸附（不做插值）：第一人称任何跟随滞后都会晕 */
      this.camera.position.set(p.x, eyeY, p.z);
      if (this.shake > 0.001) {
        const s = this.shake * this.shakeMul;
        if (s > 0.001) {
          this.camera.position.x += RND(-1, 1) * s * 0.5;
          this.camera.position.y += RND(-0.6, 0.6) * s * 0.5;
          this.camera.position.z += RND(-1, 1) * s * 0.5;
        }
        this.shake *= Math.pow(0.0025, raw);
      } else this.shake = 0;
      const pitch = CLAMP(this.fpPitch || 0, -0.7, 0.35);
      this.camera.lookAt(p.x + fx * 12, eyeY + Math.tan(pitch) * 12, p.z + fz * 12);
      /* 贴脸道具淡出（竹林 / 柱子），否则第一人称会被一片叶子糊住 */
      this.occT = (this.occT || 0) + raw;
      if (this.occT > 0.08) { this.occT = 0; this.updateOccluders(); }
      this.sun.position.set(p.x + 24, 38, p.z + 18);
      this.sun.target.position.set(p.x, 0, p.z);
      return;
    }

    /* ---------- 俯视 / 斜俯视 ---------- */
    // 出手瞬间轻微推镜，放大挥砍动作（视角预设可关掉）
    if (this.camPunch > 0.0005) this.camPunch *= Math.pow(0.015, raw); else this.camPunch = 0;
    const zoom = this.camZoom || 1;
    this.camDist = v.dist * zoom;
    this.camHeight = v.height + (this.camDist - v.dist) * v.pitchK;
    // 竖屏时横向视野窄，把镜头拉远一点，避免角色占满屏幕
    const zm = this.camZoomMul || 1;
    const punch = (this.camPunch || 0) * (v.punch === undefined ? 1 : v.punch);
    const dist = this.camDist * zm * (1 - punch);
    const targetX = p.x + Math.sin(this.camYaw) * dist;
    const targetZ = p.z + Math.cos(this.camYaw) * dist;
    const k = 1 - Math.pow(v.smooth, raw);
    this.camera.position.x = LERP(this.camera.position.x, targetX, k);
    this.camera.position.z = LERP(this.camera.position.z, targetZ, k);
    this.camera.position.y = LERP(this.camera.position.y, p.y + this.camHeight * zm, k);
    if (this.shake > 0.001) {
      const s = this.shake * this.shakeMul;
      if (s > 0.001) {
        this.camera.position.x += RND(-1, 1) * s;
        this.camera.position.y += RND(-0.6, 0.6) * s;
        this.camera.position.z += RND(-1, 1) * s;
      }
      this.shake *= Math.pow(0.0025, raw);
    } else this.shake = 0;
    this.camera.lookAt(p.x, p.y + v.lookY, p.z);
    this.occT = (this.occT || 0) + raw;
    if (this.occT > 0.08) { this.occT = 0; this.updateOccluders(); }
    this.sun.position.set(p.x + 24, 38, p.z + 18);
    this.sun.target.position.set(p.x, 0, p.z);
  },

  /* 遮挡淡化：挡在镜头与角色之间的道具变半透明 */
  updateOccluders() {
    if (!this.world || !this.world.occluders) return;
    const cam = this.camera.position, p = this.playerGroup.position;
    const fp = this.isFP();
    const dx = p.x - cam.x, dz = p.z - cam.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const o of this.world.occluders) {
      if (!o.mats) {
        o.mats = [];
        o.obj.traverse(n => {
          if (n.isMesh && n.material && n.material.opacity !== undefined) {
            o.mats.push({ m: n.material, op: n.material.opacity, tr: n.material.transparent });
          }
        });
      }
      const pos = o.obj.position;
      let hide = false;
      if (fp) {
        /* 第一人称：镜头就贴在人物身上，「镜头到人物之间」这条线没有意义。
         * 改成两件事：① 贴脸 / 身体已经在道具里的直接淡出；
         * ② 正前方 5 米、±40° 内的道具也淡出 —— 否则站在竹林里会被竹竿糊满屏幕。 */
        const ox = pos.x - cam.x, oz = pos.z - cam.z;
        const od = Math.hypot(ox, oz);
        if (od < o.r + 0.6) hide = true;
        else if (od < 5.5 && od > 0.001) {
          const fwx = -Math.sin(this.camYaw), fwz = -Math.cos(this.camYaw);
          if ((ox * fwx + oz * fwz) / od > 0.77) hide = true;
        }
      } else {
        const t = ((pos.x - cam.x) * dx + (pos.z - cam.z) * dz) / len2;
        if (t > 0.05 && t < 1.0) {
          const px = cam.x + dx * t, pz = cam.z + dz * t;
          hide = Math.hypot(pos.x - px, pos.z - pz) < o.r + 0.4;
        }
      }
      const target = hide ? 0.09 : 1;
      if (o.cur === undefined) o.cur = 1;
      if (Math.abs(o.cur - target) > 0.02) {
        o.cur = LERP(o.cur, target, 0.5);
        for (const x of o.mats) {
          if (o.cur < 0.98) {
            x.m.transparent = true;
            x.m.opacity = x.op * o.cur;
            x.m.depthWrite = false;
          } else {
            x.m.transparent = x.tr;
            x.m.opacity = x.op;
            x.m.depthWrite = true;
          }
        }
      }
    }
  },

  /* ======================================================= */
  update(dt, raw) {
    this.state.playTime += dt;
    if (this.dead) { FX.update(dt); return; }

    // 冷却 / BUFF
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.frostBurstCd = Math.max(0, (this.frostBurstCd || 0) - dt);
    if (this.state) this.state.phoenixCd = Math.max(0, (this.state.phoenixCd || 0) - dt);
    if (this.state) this.state.deathWardCd = Math.max(0, (this.state.deathWardCd || 0) - dt);
    this.lootRushT = Math.max(0, (this.lootRushT || 0) - dt);
    /* [v1.12.1] 落地保护倒计时：进图头几秒不索敌 */
    if (this.aggroGrace > 0) this.aggroGrace = Math.max(0, this.aggroGrace - dt);
    this.updateBuffs(dt);
    this.updatePlayer(dt);
    /* [P3] 跟随变体：区域锚点 / 特效跟着玩家走（必须在 updatePlayer 之后） */
    this.tickFollow(dt);
    /* [M12] 换区提示：进入新区域时报一次名，让「区域 + 走廊」结构被玩家看见 */
    this.tickZone(dt);
    this.updateAuras(dt);
    this.updateEnemies(dt);
    this.updateAllies(dt);
    /* [P2] 被动的周期触发（战意不灭 / 雷神 / 天师 / 九转还丹 / 涅槃火球） */
    if (typeof this.tickPassives === 'function') this.tickPassives(dt);
    /* [P2] 分支行为的帧级钩子（变身自动旋斩等） */
    if (typeof this.tickBeh === 'function') this.tickBeh(dt);
    this.updateProjectiles(dt);
    this.updateLoot(dt);
    this.updateSpawner(dt);
    /* [试炼] 波次状态机：读秒 / 清场判定 / 天雷与嗜血狂潮两条机制祝福。
     * 放在 updateSpawner 之后 —— 试炼场的 spawns 为空，那边会直接返回。 */
    if (typeof Trial !== 'undefined' && Trial.active) Trial.tick(dt);
    this.updateWorldAnims(dt);
    this.updateInteract();
    this.tickAudio(dt);
    this.autoSave(raw);
    if (this.state.hp <= 0) this.die();
  },

  /* ---------------- 音频心跳（S16） ----------------
   * 每帧要做且必须便宜的只有三件：听者跟随相机、环境点缀、BGM 换层。
   * 「现在该放哪一层」需要遍历敌人找仇恨目标，所以做 0.25 秒节流 ——
   * 每帧扫 40 只怪纯属浪费，而音乐晚 0.25 秒进战斗没人听得出来。 */
  tickAudio(dt) {
    if (typeof AudioSys === 'undefined' || !AudioSys.ctx) return;
    AudioSys.tick(dt, this.camera);
    this._audDt = (this._audDt || 0) + dt;
    this._audT = (this._audT || 0) - dt;
    if (this._audT > 0) return;
    const step = this._audDt;
    this._audDt = 0;
    this._audT = 0.25;

    let mode = 'explore';
    if (this.boss && this.boss.active && !this.boss.dead) mode = 'boss';
    else {
      /* 交火半径 16 米：近战 2~3 米、远程怪在 10~12 米开火，
       * 取 16 米能把「正在打你」的全包住，又不至于走到隔壁房间就进战斗曲。 */
      const pp = this.playerGroup.position;
      let near = false;
      for (const e of this.enemies) {
        if (e.dead || !e.aggro) continue;
        if (DIST2D(e.pos, pp) < 16) { near = true; break; }
      }
      /* 脱战要等 4 秒才淡回探索层：否则打死一只、下一只还没贴上来的空档
       * 音乐会来回抽两次，比不切还出戏 */
      if (near) this._combatHold = 4;
      else this._combatHold = Math.max(0, (this._combatHold || 0) - Math.max(0.1, step));
      if (this._combatHold > 0) mode = 'combat';
    }
    AudioSys.bgm(mode);
  },

  /* [M1/C5] 光环结算：装备词缀给的「以自身为中心」常驻范围效果。
   * 每帧刷减速（0.25 秒续期，走出范围自然失效），灼烧每 0.8 秒跳一次。
   * 视觉上给一圈地面光环，半径随 auraRange 变——否则玩家完全看不出
   * 自己的光环有多大、怪是不是已经在圈里。 */
  updateAuras(dt) {
    const st = this.state && this.state.stats;
    if (!st) return;
    const slow = st.auraSlow || 0;
    const burn = st.auraBurn || 0;
    const R = 4.2 + (st.auraRange || 0);
    const on = (slow > 0 || burn > 0);
    if (!on) {
      if (this.auraRing) this.auraRing.visible = false;
      return;
    }
    /* 地面光环：单位半径，靠 scale 适配实际范围 */
    if (!this.auraRing && this.playerGroup) {
      const mat = new THREE.MeshBasicMaterial({
        color: burn > 0 ? 0xff8a4a : 0x8fd0ff, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false
      });
      const m = new THREE.Mesh(ringGeo(0.93, 1, 44), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      this.auraRing = m;
      this.playerGroup.add(m);
    }
    if (this.auraRing) {
      this.auraRing.visible = true;
      this.auraRing.scale.set(R, R, 1);
      this.auraRing.material.opacity = 0.14 + Math.sin(this.time * 2.2) * 0.05;
    }
    const pp = this.playerGroup.position;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (DIST2D(e.pos, pp) > R + e.radius) continue;
      if (slow > 0) {
        e.slow = Math.max(e.slow || 0, Math.min(0.7, slow / 100));
        e.slowT = Math.max(e.slowT || 0, 0.3);
      }
      if (burn > 0) {
        e.auraBurnT = (e.auraBurnT || 0) - dt;
        if (e.auraBurnT <= 0) {
          e.auraBurnT = 0.8;
          this.damageEnemy(e, burn * 0.8, false, { elem: 'fire', silent: true });
        }
      }
    }
  },

  updateBuffs(dt) {
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.dur -= dt;
      if (b.dur <= 0) { this.buffs.splice(i, 1); changed = true; }
    }
    if (changed) { this.recalc(); }
    this.combatRecently = Math.max(0, (this.combatRecently || 0) - dt);
    // 灵力/怒气回复：脱战后回复更快，站着不动不会掉蓝
    const st = this.state.stats;
    const mpRate = st.mpReg * (this.combatRecently > 0 ? 1 : 1.9);
    this.state.mp = Math.min(st.mpMax, this.state.mp + mpRate * dt);
    this.state.hp = Math.min(st.hpMax, this.state.hp + (this.regen || 0) * dt);
    /* [S1] 装备的每秒回血，和药水的 regen 分开累加（战斗中也生效） */
    if (st.hpRegen) this.state.hp = Math.min(st.hpMax, this.state.hp + st.hpRegen * dt);
    /* [S1] 暴击后攻速加成计时 */
    if (this.aspdCritT > 0) this.aspdCritT = Math.max(0, this.aspdCritT - dt);
    /* [S4] 血怒套·狂怒：4 秒内没有新的暴击就掉 1 层 */
    if (this.frenzy && this.frenzy.n > 0) {
      this.frenzy.t -= dt;
      if (this.frenzy.t <= 0) { this.frenzy.n--; this.frenzy.t = 4; }
    }
    /* [S4] 套装内置冷却：磐石格挡反击 / 雷殛过载天雷 */
    this.riposteCd = Math.max(0, (this.riposteCd || 0) - dt);
    this.overchargeCd = Math.max(0, (this.overchargeCd || 0) - dt);
    /* [P2b] 剑阵场地计时 + 阵内反击冷却。setInterval 只管「每一跳打谁」，
     * 「阵还在不在」由这里管 —— 两条时间线不共用，改一个不会影响另一个。 */
    this.swordCounterCd = Math.max(0, (this.swordCounterCd || 0) - dt);
    if (this.swordField) {
      this.swordField.t -= dt;
      if (this.swordField.t <= 0) this.swordField = null;
    }
    /* [S4] 还魂持续时间衰减 */
    if (this.reviveT > 0) this.reviveT = Math.max(0, this.reviveT - dt);

    // 减速
    if (this.playerSlowT > 0) {
      this.playerSlowT -= dt;
      if (this.playerSlowT <= 0) this.playerSlow = 0;
    }
    // 中毒
    if (this.poisonT > 0) {
      this.poisonT -= dt;
      this.poisonTick = (this.poisonTick || 0) - dt;
      if (this.poisonTick <= 0) {
        this.poisonTick = 0.9;
        this.damagePlayer(this.poisonDps || 0, null);
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.4, this.playerGroup.position.z), '毒', 'info');
      }
    }
    // 护盾计时
    if (this.shield > 0) {
      this.shieldT = (this.shieldT || 0) - dt;
      if (this.shieldT <= 0) { this.shield = 0; UI.log('玄冰护盾消散'); }
    }
    if (typeof UI !== 'undefined') UI.renderBuffs();
  },

  updatePlayer(dt) {
    const st = this.state.stats;
    const pg = this.playerGroup;
    this.updateAim();

    // Q/E 转视角
    if (this.keys['q']) this.camYaw += dt * 1.8;
    if (this.keys['e']) this.camYaw -= dt * 1.8;

    let ix = 0, iz = 0;
    if (IS_TOUCH) {
      // 摇杆：屏幕空间方向（上为负），与键盘 W/S 同向
      ix = Mobile.mx; iz = Mobile.my;
    } else {
      if (this.keys['w'] || this.keys['arrowup']) iz -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) iz += 1;
      if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
      if (this.keys['d'] || this.keys['arrowright']) ix += 1;
    }

    // 相机朝向基向量
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * (-iz) + rx * ix;
    let mz = fz * (-iz) + rz * ix;
    const ml = Math.hypot(mx, mz);
    let moving = false;
    this.movingNow = false;
    if (ml > 0.01) {
      const analog = Math.min(1, ml);   // 摇杆推杆幅度 → 速度
      mx /= ml; mz /= ml; moving = true;
      this.movingNow = true;
      /* [M1] 行脚套·疾行：击杀后 3 秒移速 +30% */
      const rush = this.lootRushT > 0 ? 1.3 : 1;
      /* 冲刺期间的速度由 dashSpd 单独决定（见下方 dashT 分支），
       * 这里不再叠 ×4.6 —— 原来按着方向键冲刺比松开冲刺快一截。 */
      const spd = st.moveSpd * analog * (1 - (this.playerSlow || 0)) * rush;
      pg.position.x += mx * spd * dt;
      pg.position.z += mz * spd * dt;
      this.lastMoveDir = { x: mx, z: mz };
      if (this.dashT <= 0) {
        const targetRot = Math.atan2(mx, mz);
        pg.rotation.y = this.lerpAngle(pg.rotation.y, targetRot, 1 - Math.pow(0.0001, dt));
      }
    }
    this.collideWorld(pg.position, 0.55, this.movingNow ? this.lastMoveDir : null);

    if (this.dashT > 0) {
      this.dashT -= dt;
      const d = this.lastMoveDir || { x: Math.sin(pg.rotation.y), z: Math.cos(pg.rotation.y) };
      /* [v1.11.0] 冲刺速度与基础移速解耦：各技能按「标称距离 ÷ 时长」定值，
       * 以后调 BALANCE.move.base 不会再连带改掉技能位移距离。 */
      const dspd = this.dashSpd || 30;
      pg.position.x += d.x * dspd * dt;
      pg.position.z += d.z * dspd * dt;
      if (Math.random() < 0.6) FX.burst(new THREE.Vector3(pg.position.x, 0.6, pg.position.z), 0xaaccff, 2, { speed: 1, size: 0.14, life: 0.3, gravity: 0, additive: true });
      this.collideWorld(pg.position, 0.55, d);
    }

    // 面向瞄准（攻击时）
    this.actor.moving = moving;
    this.actor.time = this.actor.time || 0;
    if (this.mouseDown && this.atkCd <= 0) this.primaryAttack();

    // 攻击时朝向鼠标
    if (this.attacking > 0) {
      this.attacking -= dt;
      const r = Math.atan2(this.aimDir.x, this.aimDir.z);
      pg.rotation.y = this.lerpAngle(pg.rotation.y, r, 1 - Math.pow(0.00002, dt));
    } else if (!moving && this.aimDir) {
      // 站立时缓慢朝向鼠标
      const r = Math.atan2(this.aimDir.x, this.aimDir.z);
      pg.rotation.y = this.lerpAngle(pg.rotation.y, r, 1 - Math.pow(0.08, dt));
    }

    /* 第一人称：角色永远面朝视线（人物本身隐藏，但挥砍弧、弹道起点要跟着视线） */
    if (this.isFP()) pg.rotation.y = Math.atan2(-Math.sin(this.camYaw), -Math.cos(this.camYaw));

    this.playerFace.set(Math.sin(pg.rotation.y), 0, Math.cos(pg.rotation.y));
    updateActorAnim(this.actor, dt);
  },

  lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },

  /* [M12] slide：本帧的移动方向（可选）。
   * 只做「推出圆外」的话，「正对障碍物走」会变成一个稳定的死点 ——
   * 每帧往前挪 0.05 米、每帧被原样推回，位置一个像素都不动，
   * 看起来就是怪顶着树原地抖。这里按穿透深度沿切线补一段，
   * 任何非零切向分量都能滑出去，玩家贴墙走也不会再被卡住。
   *
   * noProps：只受区域边界约束、不吃装饰物碰撞。**怪物一律传 true**。
   * 原因是随机撒的石头/树会两两重叠，重叠处形成一个凹槽：两边的径向
   * 推出互相抵消，切线分量也抵消，任何半径的圆都会被楔在里面出不来。
   * 这不是「怪太笨」，是几何上就没有出口 —— 没有 navmesh 的前提下，
   * 让怪穿过装饰物（视觉上只是蹭一下灌木）远好过让它原地抖一辈子。
   * 玩家仍然吃道具碰撞：人有判断力，往旁边挪一步就出来了。 */
  collideWorld(pos, r, slide, noProps) {
    if (!this.world) return;
    if (!noProps) {
      for (const c of this.world.colliders) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 0.0001) {
          const nx = dx / d, nz = dz / d;
          pos.x = c.x + nx * min;
          pos.z = c.z + nz * min;
          if (slide) {
            const tx = -nz, tz = nx;
            const s = slide.x * tx + slide.z * tz;
            const pen = min - d;
            const sign = s < 0 ? -1 : 1;
            pos.x += tx * sign * pen;
            pos.z += tz * sign * pen;
          }
        }
      }
    }
    /* [M12] 边界：区域化地图用「所有 zone 的并集」判定，出界时推回最近的
     * 区域边界点。每帧位移很小，所以这个推回等于「沿墙滑动」，
     * 不会出现被瞬移回房间中央的生硬感。
     * 没有区域配置的图（试炼擂台）仍用旧的径向钳制。 */
    const mid = this.state.mapId;
    if (typeof zonesContain === 'function' && typeof mapZones === 'function' && mapZones(mid)) {
      if (!zonesContain(mid, pos.x, pos.z)) {
        const p = closestZonePoint(mid, pos.x, pos.z);
        if (p) { pos.x = p.x; pos.z = p.z; }
      }
      return;
    }
    const lim = MAPS[mid].size * 0.47;
    const dd = Math.hypot(pos.x, pos.z);
    if (dd > lim) { pos.x *= lim / dd; pos.z *= lim / dd; }
  },

  /* ---------------- 普攻 ---------------- */
  doBasicAttack() {
    const s = this.state, st = s.stats;
    const wp = s.equipment.weapon;
    const wpSpeed = wp && wp.speed ? wp.speed : 1;
    /* [S1] 暴击后攻速：暴击命中后 2.5 秒内攻速加成
     * [S4] 血怒套·狂怒：每层 +4% 攻速（层数由 crit 累积，最多 5 层） */
    const aspdK = (this.aspdCritT > 0 ? 1 + (st.aspdOnCrit || 0) / 100 : 1)
      * (1 + 0.04 * ((this.frenzy && this.frenzy.n) || 0))
      /* [M1] 行脚套·疾行：击杀后 3 秒攻速 +15% */
      * (this.lootRushT > 0 ? 1.15 : 1);
    const cdBase = 0.72 / (st.aspd * wpSpeed * aspdK);
    this.atkCd = cdBase;
    this.attacking = 0.32;
    SFX.swing();
    /* 连击计数：间隔超过 1.1 秒重新起手；偶数段走反手斜劈，形成左右交替 */
    const nowT = performance.now();
    this.actor.combo = (nowT - (this.actor.comboAt || 0) > 1100) ? 1 : (this.actor.combo || 0) + 1;
    this.actor.comboAt = nowT;
    this.camPunch = 0.13;   // 出手推镜
    const cls = s.cls;
    const origin = new THREE.Vector3(this.playerGroup.position.x, 1.1, this.playerGroup.position.z);
    const dir = this.aimDir.clone();

    /* 普通攻击形态读职业表：melee 挥砍 / ranged 弹道。
     * 职业表现（挥砍色、弹道色与元素、命中回资源）都在 CLASSES 里，新职业不用改这里 */
    const cc = CLASSES[cls] || {};
    if ((cc.attack || 'melee') === 'melee') {
      this._tag = 'melee';
      this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.5;
      const ang = Math.atan2(dir.x, dir.z);
      const arc = 1.9;
      FX.slash(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), ang - Math.PI / 2 - arc / 2, cc.slashColor || 0xffd8a0, 2.9, arc);
      const hits = this.enemiesInArc(origin, 3.4, dir, Math.PI * 0.62);
      for (const e of hits) {
        const { dmg, crit } = this.rollDamage(st.atk * 1.0);
        this.damageEnemy(e, dmg, crit, { knock: 0.6 });
        if (cc.gainResOnHit) { s.mp = Math.min(st.mpMax, s.mp + cc.gainResOnHit); this.combatRecently = 5; }
      }
      this.hitstop = 35;
      this.shake = Math.max(this.shake, 0.12);
      if (this.state.stats.flags.thunder && CHANCE(0.18)) this.procThunder(hits[0] || null);
    } else {
      this._tag = null;   // 投射物的 tag 靠 p.tag 传递，不走全局标记
      this.actor.atkAnim = 1; this.actor.atkType = 'cast'; this.actor.atkSpeed = 2.4;
      const color = cc.projColor || 0xffd070;
      FX.projectile({
        pos: new THREE.Vector3(origin.x + dir.x * 0.7, 1.1, origin.z + dir.z * 0.7),
        dir, speed: 24, color, radius: 0.22, hitRadius: 0.5, team: 'player',
        dmg: st.atk * 0.85, life: 1.4, elem: cc.projElem || 'none',
        tag: 'proj',
        onHit: (e, p) => {
          const { dmg, crit } = this.rollDamage(p.dmg);
          this.damageEnemy(e, dmg, crit, { tag: p.tag });
          FX.burst(p.pos.clone(), color, 8, { speed: 5, size: 0.08, life: 0.3, additive: true });
          this.state.mp = Math.min(st.mpMax, this.state.mp + 1.5);
        }
      });
    }
  },

  /* ---------------- [P1] 左键：① 号位 ----------------
   * 5 格之后左键是「① 基础攻击」这个位：位上有技能就按冷却放，放不了就退化成
   * 普通挥砍 / 弹道。这样不会出现「没蓝了左键变哑火」——按住连发的手感一直在。
   *
   * castable() 的三道闸门必须与 castSkill 的前三道**同口径**
   * （领悟 / 冷却含连跃额度 / 资源含 cost 削减），否则会出现「能放却被跳过」
   * 或者「判定能放、进去被打回」。dev/test-skill-p1.js 里钉了这条一致性。 */
  castable(id) {
    const s = this.state;
    if (!s || this.dead || !this.running) return false;
    const sk = SKILLS[id];
    if (!sk) return false;
    if (!this.skillUnlocked(id)) return false;
    const rc0 = this._recharge && this._recharge[id];
    if ((this.cooldowns[id] || 0) > 0.02 && !(rc0 && rc0.n > 0)) return false;
    if (this._autoCast) return true;          // 常驻变体不收资源，castSkill 也不收
    const smod = (typeof this.effSkillMods === 'function') ? this.effSkillMods(id) : null;
    const cost = Math.max(1, Math.round(this.skillCost(sk) * (1 - (smod && smod.cost ? smod.cost : 0) / 100)));
    return s.mp >= cost;
  },

  primaryAttack() {
    const bar = this.skillBar();
    const id = bar[0];
    if (id && this.castable(id)) {
      this.castSkill(id);
      /* 施法本身有自己的冷却，这里再压一个短间隔，避免按住左键时
       * 「技能刚放完、普攻立刻接上」看起来像双击 */
      this.atkCd = Math.max(this.atkCd, 0.3);
      return;
    }
    this.doBasicAttack();
  },

  enemiesInArc(origin, range, dir, arc) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      const dot = (dx / (d || 1)) * dir.x + (dz / (d || 1)) * dir.z;
      if (dot > Math.cos(arc / 2) || d < 1.6) out.push(e);
    }
    return out;
  },

  /* ---------------- 技能 ---------------- */
  /* [S1] 技能实际消耗（装备的 costReduce 生效后）。技能栏显示与施放判定共用这一个入口，
   * 否则会出现「按钮显示 12，实际扣 10」或者「明明够蓝却提示灵力不足」。 */
  skillCost(sk) {
    const st = this.state && this.state.stats;
    if (!st) return sk.cost;      // 开始界面构建技能栏时还没有 state
    return Math.max(1, Math.round(sk.cost * (1 - (st.costReduce || 0) / 100)));
  },

  /* [S1] cdrFlat 是固定秒数缩减，优先级高于百分比；冷却不低于 0.5 秒防止无限连 */
  skillCd(sk) {
    const st = this.state.stats;
    return Math.max(0.5, sk.cd * (1 - st.cdr / 100) - (st.cdrFlat || 0));
  },

  /* 传世技能效果：把「通用(*) / 指定技能」两种修正合并成一个对象 */
  skillMod(id) {
    const st = this.state && this.state.stats;
    if (!st || !st.skillMods) return null;
    const a = st.skillMods[id], b = st.skillMods['*'];
    if (!a && !b) return null;
    const out = {};
    for (const src of [b, a]) {
      if (!src) continue;
      for (const k in src) out[k] = (out[k] || 0) + src[k];
    }
    return out;
  },

  /* ---------------- [P3] 跟随 / 钉阵（区域类变体） ----------------
   * 区域技能默认钉在落点。选了「跟随」变体，就把区域的**判定锚点**和
   * **特效网格**一起挂到玩家身上 —— 只挪特效不挪判定就是骗人，
   * 两边必须读同一份坐标（anchors 里就是伤害循环真正在用的那几个 Vector3）。 */
  attachFollow(anchors, meshes, dur) {
    if (!this.playerGroup) return;
    if (!this._follows) this._follows = [];
    const pp = this.playerGroup.position;
    this._follows.push({
      anchors: anchors || [], meshes: meshes || [],
      ox: pp.x, oz: pp.z, t: Math.max(0.5, dur || 5)
    });
  },

  tickFollow(dt) {
    const list = this._follows;
    if (!list || !list.length || !this.playerGroup) return;
    const pp = this.playerGroup.position;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t -= dt;
      if (f.t <= 0) { list.splice(i, 1); continue; }
      const dx = pp.x - f.ox, dz = pp.z - f.oz;
      if (!dx && !dz) continue;
      for (const a of f.anchors) { a.x += dx; a.z += dz; }
      for (const m of f.meshes) {
        if (!m || !m.position) continue;
        m.position.x += dx; m.position.z += dz;
      }
      f.ox = pp.x; f.oz = pp.z;
    }
  },

  /* ---------------- [M12] 换区提示 ----------------
   * 地图从「一个大圆圈」变成「区域 + 走廊」之后，最大的体验风险是玩家
   * 根本意识不到自己在不同区域里走动 —— 走廊看起来只是地面变窄了一截。
   * 所以每进一个新区域就报一次名，把结构「说出来」。
   * 节流 0.2 秒：zoneAt 只是 8 次矩形/圆判定，但没必要每帧算。
   * 单区地图（桃源村）和试炼场（没有 zones）直接不提示，免得刷屏。 */
  tickZone(dt) {
    if (typeof zoneAt !== 'function' || typeof mapZones !== 'function') return;
    const mid = this.state.mapId;
    if (mid !== this._zoneMap) {
      this._zoneMap = mid;
      this._zoneId = null;
      /* 切图瞬间先让地图名横幅播完，再报区域名 */
      this._zoneT = 1.2;
    }
    const zs = mapZones(mid);
    if (!zs || zs.length < 2) return;
    this._zoneT = (this._zoneT || 0) - dt;
    if (this._zoneT > 0) return;
    this._zoneT = 0.2;

    const pp = this.playerGroup && this.playerGroup.position;
    if (!pp) return;
    const z = zoneAt(mid, pp.x, pp.z);
    if (!z || z.id === this._zoneId) return;
    this._zoneId = z.id;
    if (typeof UI === 'undefined' || !UI.toast) return;
    /* 首领区加个前缀，让「再往前就是 boss」这件事有预告感 */
    if (z.kind === 'boss') UI.toast('⚔ ' + z.name, 'bad');
    else UI.toast(z.name);
  },

  /* 这发技能真正生效的六通道修正（装备 + 等级加点 + 精研 + 取向 + 变体）。
   * 唯一口径：castSkill 直接调它，面板预览与回归测试也调它 ——
   * 三处各算一套的话，玩家会遇到「面板说 +30% 打出来没变」这种鬼故事。 */
  effSkillMods(id) {
    const sk = SKILLS[id];
    if (!sk) return null;
    /* [P2b] 台阶修正：数量台阶（Lv3 / Lv7 各 +1 发）与它的单发递减。
     * 与装备 / 分支 / 变体走同一个 merge —— 面板预览读的也是这个函数，
     * 所以不会出现「卡上写三发、打出来一发」。 */
    const tierMods = (typeof skillTierMods === 'function')
      ? skillTierMods(id, this.skillLevel(id)) : null;
    return mergeSkillMods(this.skillMod(id),
      (typeof this.branchMods === 'function' ? this.branchMods(id) : null),
      (typeof this.formMods === 'function' ? this.formMods(id) : null),
      tierMods);
  },

  /* 技能落点：ground / enemy 自动夹在施法距离内，dir 用当前朝向，self 以自身为中心 */
  resolveCast(sk, pp, aim, dir) {
    const out = aim.clone();
    out.y = 0;
    const range = sk.castRange || 0;
    const to = out.clone().sub(pp); to.y = 0;
    const dist = to.length();
    if (sk.cast === 'self') { out.copy(pp); return out; }
    if (sk.cast === 'dir') {
      out.copy(pp).addScaledVector(dir, range || Math.max(6, dist));
      out.y = 0;
      return out;
    }
    if (sk.cast === 'enemy') {
      const maxR = range || 99;
      let target = this.nearestEnemy(aim, maxR);
      if (target && DIST2D(target.pos, pp) > maxR) target = null;
      if (!target) target = this.nearestEnemy(pp, maxR);
      if (target) { out.set(target.pos.x, 0, target.pos.z); return out; }
    }
    if (range > 0 && dist > range) out.copy(pp).addScaledVector(to.normalize(), range);
    else if (dist < 0.6) out.copy(pp);
    out.y = 0;
    return out;
  },

  /* 施法瞬间在地上画一条方向线 + 落点圈，让玩家看清本次判定的方向和最远距离 */
  showCastGuide(sk, pp, point, dir) {
    if (sk.cast === 'self') return;
    const end = sk.cast === 'dir'
      ? pp.clone().addScaledVector(dir, sk.castRange || 6)
      : point.clone();
    end.y = 0;
    const c0 = CLASSES[sk.cls] || {};
    const color = c0.fxColor || 0xffb070;
    FX.beam(new THREE.Vector3(pp.x, 0.16, pp.z), new THREE.Vector3(end.x, 0.16, end.z), color, 0.18, 0.6);
    FX.ring(end, 0.7, color, 0.24, 0.18);
  },
  castSkill(id) {
    const s = this.state;
    if (!s || this.dead || !this.running) return;
    const sk = SKILLS[id];
    if (!sk) return;
    /* [UNIQUE-2] 传世可以直接解锁技能：等级没到、也没做过任务，穿上就能放 */
    if (!this.skillUnlocked(id)) { UI.log('尚未领悟「' + sk.name + '」'); SFX.ui(); return; }
    /* [P3] 连跃（变体）：手上有「免冷却」额度时，冷却中也能再放一次。
     * 只认额度、不认白给 —— 额度用完（n=0）就恢复正常的冷却拦截 */
    const rc0 = this._recharge && this._recharge[id];
    if ((this.cooldowns[id] || 0) > 0.02 && !(rc0 && rc0.n > 0)) return;
    /* [S4] 装备 / 套装 / 传世 / 天赋的 skillMods + 当前变体修正合并消费；
     * [P2] 再加上技能树的分支修正（精研 + 取向）。
     * 技能等级每级 +8%（也放大治疗 / 护盾 / 召唤） */
    /* [P3] 变体（三层里的第三层）：整只技能切到新通道后，旧的 variants 修正
     * 与旧机制变体都不再参与 —— 两套并存会互相叠乘，数值直接失控。
     * 口径收敛在 effSkillMods 里，面板预览与测试都读同一个函数。 */
    const smod = this.effSkillMods(id);
    /* [P2] 等级倍率：唯一口径 skillLvMul（1~10 每级 8% / 11~15 4% / 16~20 2%）。
     * 以前这里是「1 + 每级固定 8%」，20 级会到 2.52 倍；
     * 面板预览与这里必须读同一个函数，否则「卡上 2.02 倍、打出来 2.52 倍」。 */
    const lvMul = (typeof skillLvMul === 'function')
      ? skillLvMul(this.skillLevel(id))
      : 1;
    /* 常驻（变体）：自动施放的那一次按半数值结算 —— 「不用按」的代价就在这里，
     * 否则等于白送一倍强度。 */
    const autoCast = !!this._autoCast;
    let spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * lvMul * (autoCast ? 0.5 : 1);
    const srad = smod ? 1 + (smod.radius || 0) / 100 : 1;
    /* [P2b] 数量来源汇总（台阶 + 装备 + 天赋 + 取向 + 变体），上限读 skillCountCap()。
     * 负数要留着：取向「聚雷」就是 count −1（少跳一次换伤害），
     * 所以只截上界，不夹到 0。 */
    const cntCap = (typeof skillCountCap === 'function') ? skillCountCap() : 8;
    const sextra = smod ? Math.min(cntCap, smod.count || 0) : 0;
    /* v1.1.9：技能持续时长修正（青符 4 件：毒雾 +3 秒） */
    const sdur = smod ? (smod.dur || 0) : 0;
    /* [S1] 技能消耗降低；传世还能再减该技能的消耗。
     * [P3] 常驻（变体）自动施放不收资源 —— 它已经用「数值减半」付过账了，
     * 再扣资源会变成背包里的隐形扣血。 */
    const cost = (autoCast || this._freeCast) ? 0
      : Math.max(1, Math.round(this.skillCost(sk) * (1 - (smod && smod.cost ? smod.cost : 0) / 100)));
    /* 资源名读职业表：刀客怒气 / 术士灵力 / 符师道力。写死「灵力」会让符师的提示说错 */
    if (s.mp < cost) { UI.log(((CLASSES[s.cls] || {}).res || '资源') + '不足'); SFX.ui(); return; }
    s.mp -= cost;
    /* [P2] 剑魄（关键被动）记账：本张地图累计消耗的资源（换图 / 复活清零） */
    if (typeof this.onMpSpent === 'function') this.onMpSpent(cost);
    /* [P2] 本发技能的分支行为。hook 相位的键在这里就地消费（穿透 / 蔓延 /
     * 蓄电 / 吐息都改写施法本身），其余由下面各钩子点结算。
     * _castSkill 是击杀来源标记：从这行到函数结尾没有提前 return，
     * 一定会走到收尾清零 —— 补刀（resetOnKill）只认「这发技能同步打死的」，
     * 毒 / 火的延迟跳伤发生时标记已经清掉，不会误触发。 */
    const bBeh = (typeof this.branchBeh === 'function') ? this.branchBeh(id) : null;
    this._castSkill = id;
    const st = s.stats;
    /* [S2] 回响之语 / 紫府套：15% 概率不进入冷却
     * [P3] 不竭（变体）：本技能不进冷却，只留 0.2 秒硬直 ——
     * 硬直是必须的，否则按住不放会一帧连发十几次，资源瞬间见底。 */
    const drainOn = !!(this._drainOn && this._drainOn[id]);
    /* [P3] 连跃（变体）：上一次施法留下了一次「免冷却」额度，这一发直接吃掉。
     * 只在窗口内有效（tickBeh 倒数 3 秒），过期作废。 */
    const rc = this._recharge && this._recharge[id];
    if (drainOn) {
      this.cooldowns[id] = 0.2;
    } else if (rc && rc.n > 0) {
      rc.n--;
      this.cooldowns[id] = 0.12;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.9, this.playerGroup.position.z),
        '连跃', 'info', { life: 0.8 });
    } else if (st.flags.echo && CHANCE(0.15)) {
      this.cooldowns[id] = 0;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.8, this.playerGroup.position.z), '回响', 'info', { life: 0.8 });
    } else {
      this.cooldowns[id] = Math.max(0.5, this.skillCd(sk) * (1 - (smod && smod.cd ? smod.cd : 0) / 100));
    }
    this.attacking = 0.35;
    this.camPunch = 0.16;
    this.combatRecently = 5;
    /* [S16] 技能起手层：36 个技能各自按元素有一声短起手，
     * 命中/爆发的音效仍在各技能代码里，两者叠着听才是「有手感」 */
    SFX.skill(sk);
    /* [S1] 技能类型 → 伤害乘区标记。
     * 同步结算的技能直接读 this._tag；投射物 / 地板等异步伤害在 opts 里显式传 tag。 */
    const TAG_OF = {
      melee: 'melee', dash: 'melee', aoe: 'aoe', nova: 'aoe', ultimate: 'aoe',
      zone: 'aoe', rain: 'aoe', proj: 'proj', summon: 'dot'
    };
    this._tag = TAG_OF[sk.type] || 'melee';
    const pp = new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z);
    let aim = this.aimPoint.clone();
    const dir = this.aimDir.clone();
    aim = this.resolveCast(sk, pp, aim, dir);
    /* [P3] selfCast（变体）：落点强制改到脚下。
     * 追地（裂地）/ 冰环（霜星）/ 定向（炎爆）共用这一处 ——
     * 各技能 case 不用各自判断，也不会漏掉某一处 aim 引用。 */
    if (bBeh && bBeh.selfCast) aim = pp.clone();
    /* [P2b] 自动索敌（台阶）：不瞄准也能打 —— 把落点强制指向最近的敌人。
     * 必须在 switch 之前定死：各技能 case 都直接读 aim，handler 阶段已经晚了。
     * 自身施法类不需要索敌（落点已经钉在脚下）。 */
    if (bBeh && bBeh.autoTarget && !bBeh.selfCast) {
      const tgt = this.nearestEnemy(aim, bBeh.autoTarget) || this.nearestEnemy(pp, bBeh.autoTarget);
      if (tgt) {
        aim = new THREE.Vector3(tgt.pos.x, 0, tgt.pos.z);
        /* 投射物类技能读的是 dir 而不是 aim（火球 / 符都用 dir 出手）——
         * 只挪落点的话，弹道还是朝原来那个方向飞，玩家一点区别都看不到。 */
        const nd = new THREE.Vector3(aim.x - pp.x, 0, aim.z - pp.z);
        if (nd.lengthSq() > 1e-4) dir.copy(nd.normalize());
      }
    }
    this.showCastGuide(sk, pp, aim, dir);
    const dmgOf = mult => {
      const { dmg, crit } = this.rollDamage(st.atk * mult);
      return { dmg, crit };
    };

    switch (id) {
      /* 战士 */
      case 'whirl': {
        this.actor.atkAnim = 1; this.actor.atkType = 'spin'; this.actor.atkSpeed = 3.2;
        SFX.swing(); SFX.hit();
        const mult = 1.5 * (st.flags.thunder ? 2.2 : 1);
        const rad = 4.3 * srad;
        /* [P3] 聚怪变体：旋风斩本来带 1.2 码击退，等于把刚聚起来的怪又推开 ——
         * 选了聚怪就把击退去掉，否则这个变体自己打自己。 */
        const formOptW = (typeof this.formOpt === 'function') ? this.formOpt(id) : null;
        const knockW = (formOptW && formOptW.beh && formOptW.beh.gather) ? 0 : 1.2;
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < rad + e.radius);
        /* [P2b] 数量台阶：Lv3「双发」/ Lv7「三连斩」= 一次施法扫 passes 段。
         * 段与段之间不隔帧（隔帧要挂定时器，还得判怪是否已死），
         * 单发递减已经折进 spow（skillCountDmgPct），所以每段用同一个 spow ——
         * 总伤与「第 n 段 ×0.85^n」完全相等。
         * 多段时每段画一圈略大的光环，「打了两下」在画面上要看得出来。 */
        const passes = 1 + Math.max(0, sextra);
        /* [P2b] 台阶 Lv9「横扫撕裂」：命中的敌人 4 秒内受伤 +15%。
         * 走 e.vuln / e.vulnT —— damageEnemy 里真在用的字段（同一个键在
         * SKILL_BEH.vuln 里也有实现，但那条走通用 hit 通道，而旋风斩是
         * 自己遍历 hits 直接结算的，压根不经过那个通道）。
         * 先结算伤害再挂易伤：这一下不吃自己的加成，后续多段与队友的才吃。 */
        const vulnPct = Math.max(0, (bBeh && bBeh.vuln) || 0);
        for (let ps = 0; ps < passes; ps++) {
          for (const e of hits) {
            const { dmg, crit } = this.rollDamage(st.atk * mult * spow);
            this.damageEnemy(e, dmg, crit, { knock: knockW });
            if (vulnPct) {
              e.vuln = Math.max(e.vuln || 0, vulnPct);
              e.vulnT = Math.max(e.vulnT || 0, 4);
            }
          }
          if (passes > 1) FX.ring(pp, rad * (1 + 0.07 * ps), 0xffd8a0, 0.3, 0.1 + 0.05 * ps);
        }
        FX.ring(pp, rad, 0xffd8a0, 0.4);
        FX.spark(new THREE.Vector3(pp.x, 1, pp.z), 0xffd8a0, 18);
        this.shake = 0.25; this.hitstop = 60;
        /* [P2b] 台阶 Lv10「命中回怒翻倍」：基数 8 点乘 rageMul。
         * 用倍率而不是再加一条 ragePerHit —— 后者是「每命中一个 +N」，
         * 与「回流」双重计时会变成回怒三四倍。 */
        s.mp = Math.min(st.mpMax, s.mp + 8 * ((bBeh && bBeh.rageMul) || 1));
        if (hits.length > 1) UI.log(`旋风斩命中 ${hits.length} 名敌人`, 'good');
        break;
      }
      case 'thrust': {
        this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.9;
        /* 龙骧 4 件：突进距离 +30%（冲刺时长等比延长） */
        this.dashT = 0.22 * (st.flags.longDash ? 1.3 : 1); this.invuln = 0.3; this.lastMoveDir = { x: dir.x, z: dir.z };
        this.dashSpd = DASH_SPD.thrust;
        SFX.fire(); SFX.swing();
        this.shake = 0.3;
        const start = pp.clone();
        setTimeout(() => {
          if (this.dead) return;
          const p2 = this.playerGroup.position;
          const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, p2) < 3.4 + e.radius);
          for (const e of hits) {
            const { dmg, crit } = this.rollDamage(st.atk * 2.6 * spow);
            this.damageEnemy(e, dmg, crit, { knock: 2.2 });
          }
          /* [P2] 穿透（取向）：不再被敌人挡下 → 冲刺路径上的敌人同样吃伤害。
           * 终点那一圈照旧结算，这里补的是「路上擦过」的：点到线段距离 < 2 码 */
          if (bBeh && bBeh.pierce) {
            const vx = p2.x - start.x, vz = p2.z - start.z;
            const L2 = vx * vx + vz * vz || 1;
            for (const e of this.enemies) {
              if (e.dead || hits.indexOf(e) >= 0) continue;
              let t = ((e.pos.x - start.x) * vx + (e.pos.z - start.z) * vz) / L2;
              t = Math.max(0, Math.min(1, t));
              const d = Math.hypot(e.pos.x - (start.x + vx * t), e.pos.z - (start.z + vz * t));
              if (d > 2 + (e.radius || 0)) continue;
              const { dmg: pd, crit: pc } = this.rollDamage(st.atk * 2.6 * spow);
              this.damageEnemy(e, pd, pc, { knock: 1.4 });
              FX.spark(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), 0xffaa50, 8);
            }
          }
          /* 龙骧 5 件：突进命中 3 名敌人立刻刷新突进冷却 —— 冲撞连招的核心 */
          if (hits.length >= 3 && st.specials && st.specials.chargeReset) {
            this.cooldowns.thrust = 0;
            FX.text(new THREE.Vector3(p2.x, 2.6, p2.z), '冲撞重置', 'info', { life: 0.9 });
          }
          FX.flashCircle(p2, 3.4, 0xff7a30, 0.3);
          FX.burst(new THREE.Vector3(p2.x, 1, p2.z), 0xff7a30, 22, { speed: 8, size: 0.12, life: 0.5, additive: true });
          FX.burst(new THREE.Vector3(start.x, 0.6, start.z), 0xffaa50, 16, { speed: 5, size: 0.1, life: 0.45, additive: true });
          SFX.explode();
        }, 200);
        break;
      }
      case 'warcry': case 'bloodrage': case 'taiji': case 'shieldwall': case 'riposte': case 'antidote': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        const buff = Object.assign({}, sk.buff);
        /* 传世技能效果：增益类技能按 spow 放大（持续时间不变） */
        if (spow !== 1) for (const k in buff) {
          if (typeof buff[k] === 'number' && k !== 'dur') buff[k] = Math.round(buff[k] * spow);
        }
        /* [S4] 变体可以延长增益持续时间 */
        if (sdur) buff.dur = (buff.dur || 8) + sdur;
        /* [P2b] 台阶 Lv7「增益持续 +3 秒」：与变体「持久」的 sdur 分开记、
         * 直接叠加 —— 同用一个键的话，带持久的变体一选这一级就没了。 */
        if (bBeh && bBeh.tierDur) buff.dur = (buff.dur || 8) + bBeh.tierDur;
        /* [P2b] 台阶 Lv5「增益期间吸血」：折进增益本体，不另开 buff。
         * 另开一个 buff 时长就对不上「增益期间」—— 增益结束了吸血还在，
         * 或者吸血先结束。放在 spow 放大**之后**，避免「传世技能」把它再乘一遍。
         * warcry 自带 8%，这里是 +10%（叠加，不是覆盖）。 */
        if (bBeh && bBeh.lifesteal) buff.lifesteal = (buff.lifesteal || 0) + bBeh.lifesteal;
        /* 常驻（变体）：持续拉满到下次冷却 —— 数值已经减半，合起来才是
         * 「常驻的一半」；只减半不拉满会变成「按键少了但还得盯时间」的怪东西 */
        if (autoCast) buff.dur = Math.max(buff.dur || 0, this.skillCd(sk) + 0.4);
        const bc = id === 'taiji' || id === 'antidote' ? 0x88ffd0
          : (id === 'riposte' ? 0xd8b25a : (id === 'shieldwall' ? 0x8ab0ff : (id === 'warcry' ? 0xff8a4a : 0xff4a4a)));
        this.addBuff(sk.name, buff, bc, { type: 'buff', icon: sk.glyph, key: 'skill:' + id, refresh: true });
        /* [P2] hook 相位的分支行为折进增益本体：
         * 嗜血（critHeal）由 damageEnemy 的暴击钩子消费，
         * 战鼓（killExtend + maxExtend）由 onBehKill 的击杀钩子消费。
         * 重施（refresh）会重置延长计数 —— 每一层增益独立记账。 */
        if (bBeh && (bBeh.critHeal || bBeh.killExtend || bBeh.killProlong || bBeh.ccImmune)) {
          const cb = this.buffs.find(x => x.key === 'skill:' + id);
          if (cb) {
            if (bBeh.critHeal) cb.critHeal = bBeh.critHeal;
            if (bBeh.killExtend) cb.killExtend = { per: bBeh.killExtend, max: bBeh.maxExtend || 4, got: 0 };
            /* [P2b] 台阶的击杀延长：与 killExtend 并行记账，两条各算各的上限。
             * 重施（refresh）会重置计数 —— 每一层增益独立记账。 */
            if (bBeh.killProlong) cb.killProlong = { per: bBeh.killProlong, max: bBeh.killProlongMax || 4, got: 0 };
            /* [P2b] 台阶 Lv10 免控：标记在增益本体上，判定口 ccImmuneNow()。
             * 施法瞬间顺手清掉身上已有的减速 / 中毒 —— 否则「免疫控制」在
             * 已经被控住的时候按下去是没用的，玩家会以为这一级没生效。 */
            if (bBeh.ccImmune) {
              cb.ccImmune = true;
              if ((this.playerSlowT || 0) > 0 || (this.poisonT || 0) > 0) {
                this.playerSlowT = 0; this.playerSlow = 0; this.poisonT = 0;
                FX.text(new THREE.Vector3(pp.x, 2.7, pp.z), '免控', 'info', { life: 0.8 });
              }
            }
          }
        }
        /* [P3] 舍身（变体）：标记在增益本体上 —— damagePlayer 的格挡分支
         * 靠它决定这一下不再减半（格挡照挡，只是不换减伤了） */
        if (bBeh && bBeh.noDR) {
          const cb2 = this.buffs.find(x => x.key === 'skill:' + id);
          if (cb2) cb2.noDR = true;
        }
        FX.ring(pp, 5, bc, 0.7, 0.25);
        FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), bc, 26, { speed: 3, size: 0.12, life: 0.8, gravity: -2, additive: true });
        SFX.cast();
        UI.toast(sk.name);
        /* [S4] 解毒：立即清除自身中毒与减速 */
        if (id === 'antidote') {
          this.playerSlowT = 0; this.playerSlow = 0; this.poisonT = 0;
          FX.text(new THREE.Vector3(pp.x, 2.6, pp.z), '毒解', 'info', { life: 0.8 });
        }
        break;
      }
      /* [S4] 还魂：持续内受到致命伤以 35% 生命存活 */
      case 'revive': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast(); SFX.heal();
        this.reviveT = 25 + sdur;
        FX.ring(pp, 2.6, 0xffd166, 0.8, 0.3);
        FX.burst(new THREE.Vector3(pp.x, 1.4, pp.z), 0xffd166, 22, { speed: 3, size: 0.12, life: 1, gravity: -2, additive: true });
        UI.toast('还魂 · ' + this.reviveT + ' 秒');
        break;
      }
      /* [S4] 斩杀：单体重伤，低血目标伤害翻倍 */
      case 'execute': {
        this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.2;
        SFX.swing(); SFX.hit();
        const cp = aim.clone();
        const target = this.nearestEnemy(cp, 3.6) || this.nearestEnemy(pp, 3.6);
        this.shake = 0.3; this.hitstop = 80;
        if (target) {
          const lowHp = target.hp < target.maxHp * 0.3;
          const { dmg, crit } = this.rollDamage(st.atk * 5.0 * (lowHp ? 2 : 1) * spow);
          this.damageEnemy(target, dmg, crit, { knock: 1.4 });
          FX.flashCircle(target.pos, 2.2, lowHp ? 0xff3b3b : 0xffaa50, 0.3);
          FX.burst(new THREE.Vector3(target.pos.x, 1.2, target.pos.z), lowHp ? 0xff3b3b : 0xffaa50, 20, { speed: 6, size: 0.12, life: 0.5, additive: true });
          if (lowHp) FX.text(new THREE.Vector3(target.pos.x, 2.4, target.pos.z), '处决', 'lv', { life: 0.8 });
        } else {
          FX.flashCircle(cp, 2.2, 0xffaa50, 0.25);
        }
        break;
      }
      /* [S4] 跃击：跳向指定方向，落地震击 */
      case 'leap': {
        this.actor.atkAnim = 1; this.actor.atkType = 'thrust'; this.actor.atkSpeed = 2.6;
        const dist = Math.min(10, DIST2D(aim, pp));
        /* [P3] 泰山（变体）：原地重砸 —— selfCast 把落点收到脚下，这里连冲刺一起
         * 关掉，否则「原地」还会往前窜 6 码 */
        const inPlace = !!(bBeh && bBeh.selfCast) || dist < 0.8;
        this.dashT = inPlace ? 0 : 0.2 + (dist / 10) * 0.16;
        this.dashSpd = DASH_SPD.leap;
        this.invuln = inPlace ? 0.15 : 0.3;
        if (!inPlace) this.lastMoveDir = { x: dir.x, z: dir.z };
        SFX.fire(); SFX.swing();
        this.shake = 0.3;
        setTimeout(() => {
          if (this.dead) return;
          const p2 = this.playerGroup.position;
          const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, p2) < 4.5 * srad + e.radius);
          for (const e of hits) {
            const { dmg, crit } = this.rollDamage(st.atk * 2.2 * spow);
            this.damageEnemy(e, dmg, crit, { knock: 2.4 });
          }
          FX.flashCircle(p2, 4.5 * srad, 0xffb060, 0.35);
          FX.ring(p2, 4.5 * srad, 0xffb060, 0.5, 0.25);
          FX.burst(new THREE.Vector3(p2.x, 0.8, p2.z), 0xffb060, 24, { speed: 7, size: 0.13, life: 0.5, additive: true });
          SFX.explode();
        }, 200);
        break;
      }
      /* [S4] 剑阵：持续内周身剑鸣，周期伤害 */
      case 'swordarray': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast(); SFX.thunder();
        const dur = 8 + sdur;
        const rad = 3.6 * srad;
        let pulses = 0;
        const gen = this.mapGen;
        /* [P3] 钉阵（变体）：基础剑阵本来就跟着人走，所以变体给的是**反过来**的
         * 选择 —— 钉在落点，换更大的范围与更高的每跳伤害 */
        const pinOn = !!(bBeh && bBeh.pin);
        /* [P2b] 三条进化台阶。阵心抽成一个函数：钉阵时它是落点（和上面画环用的
         * 是同一个表达式，不能各算一套），跟随态时就是玩家 —— damagePlayer 那边
         * 也要用同一份判定，才不会出现「环画在这儿、减伤算在那儿」。 */
        const fieldCtr = () => (pinOn ? aim : this.playerGroup.position);
        const slowPct = CLAMP((bBeh && bBeh.slowField) || 0, 0, 60);
        const slowDur = Math.max(0.2, (bBeh && bBeh.slowFieldDur) || 0.9);
        const drPct = CLAMP((bBeh && bBeh.arrayGuard) || 0, 0, 50);
        const counterPct = Math.max(0, (bBeh && bBeh.arrayCounter) || 0);
        /* 只有带台阶时才铺这份运行时状态；没台阶就是空，damagePlayer 里两个
         * 消费点自然短路（不给没点台阶的玩家白送减伤） */
        this.swordField = (drPct || counterPct)
          ? { rad: rad, dr: drPct, counter: counterPct, ctr: fieldCtr, t: dur, gen: gen }
          : null;
        const iv = setInterval(() => {
          if (this.mapGen !== gen || this.dead) { clearInterval(iv); return; }
          pulses++;
          const pp2 = fieldCtr();
          FX.ring(new THREE.Vector3(pp2.x, 0.2, pp2.z), rad, 0xd8ffe0, 0.4, 0.18);
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (DIST2D(e.pos, pp2) >= rad + e.radius) continue;
            /* Lv5 减速：每跳刷新一次，出阵后 slowFieldDur 秒解除 ——
             * 是「站在阵里会被黏住」而不是「中一次减速走三步」 */
            if (slowPct) {
              e.slow = Math.max(e.slow || 0, Math.min(0.7, (e.boss ? slowPct * 0.5 : slowPct) / 100));
              e.slowT = Math.max(e.slowT || 0, slowDur);
              e.slowLabel = e.slowLabel || '剑阵';
            }
            const { dmg, crit } = this.rollDamage(st.atk * 0.9 * spow);
            this.damageEnemy(e, dmg, crit, { tag: 'aoe', silent: true });
          }
          if (pulses >= Math.ceil(dur / 0.6)) clearInterval(iv);
        }, 600);
        UI.toast('剑阵 · ' + dur + ' 秒');
        break;
      }
      /* [S4] 天崩：三次延迟震击 */
      case 'skysfall': {
        this.actor.atkAnim = 1; this.actor.atkType = 'slam';
        SFX.explode();
        const cp = aim.clone();
        const gen = this.mapGen;
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            if (this.dead || this.mapGen !== gen) return;
            const t = new THREE.Vector3(cp.x + RND(-2, 2), 0, cp.z + RND(-2, 2));
            this.explodeAt(t, 5 * srad, st.atk * 2.4 * spow, 0xffaa60, true);
            SFX.explode();
          }, 300 + i * 450);
        }
        FX.telegraph(cp, 6 * srad, 1.4, () => {}, 0xffaa60);
        this.shake = 0.6;
        break;
      }
      case 'quake': {
        this.actor.atkAnim = 1; this.actor.atkType = 'slam'; this.actor.atkSpeed = 2.0;
        SFX.explode(); this.shake = 0.55; this.hitstop = 90;
        const cp = aim.clone();
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, cp) < 5.8 * srad + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 3.2 * spow);
          this.damageEnemy(e, dmg, crit, { knock: 1.6 });
          e.stun = Math.max(e.stun, 1.6);
        }
        FX.ring(cp, 6 * srad, 0xffaa60, 0.6, 0.3);
        FX.flashCircle(cp, 5.8 * srad, 0xffcc88, 0.35);
        for (let i = 0; i < 3; i++) setTimeout(() => {
          FX.burst(new THREE.Vector3(cp.x + RND(-4, 4), 0.2, cp.z + RND(-4, 4)), 0xaa8866, 12, { speed: 6, size: 0.14, life: 0.7, gravity: 16 });
        }, i * 70);
        break;
      }
      case 'avatar': {
        this.actor.atkAnim = 1; this.actor.atkType = 'slam';
        SFX.boss(); this.shake = 0.8; this.hitstop = 120;
        /* [S3] 破军系大节点·剑神：释放时立刻刷新烈焰突刺冷却 */
        if (st.specials && st.specials.avatarResetThrust) {
          this.cooldowns.thrust = 0;
          FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '突刺已续', 'info', { life: 0.9 });
        }
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < 9 + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 6.5 * spow);
          this.damageEnemy(e, dmg, crit, { knock: 3 });
        }
        this.addBuff(sk.name, Object.assign({}, sk.buff), 0xffd166, { type: 'buff', icon: sk.glyph, key: 'skill:avatar', refresh: true });
        FX.ring(pp, 9, 0xffd166, 0.9, 0.4);
        FX.flashCircle(pp, 9, 0xffe0a0, 0.5);
        for (let i = 0; i < 40; i++) FX.burst(new THREE.Vector3(pp.x + RND(-6, 6), RND(0, 3), pp.z + RND(-6, 6)), 0xffd166, 2, { speed: 4, size: 0.14, life: 0.9, gravity: -4, additive: true });
        UI.toast('剑 神 降 世', 'lv');
        break;
      }
      /* 法师 */
      case 'fireball': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.fire();
        const radius = 2.4 * (st.flags.firetrail ? 1.6 : 1) * srad;
        /* [S4] 连环变体：1 + sextra 连发，扇形展开 */
        const n = 1 + Math.max(0, sextra);
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.16;
          const d2 = dir.clone().applyAxisAngle(up, a);
          FX.projectile({
            pos: new THREE.Vector3(pp.x + d2.x * 0.8, 1.4, pp.z + d2.z * 0.8),
            dir: d2, speed: 21, color: 0xff7a30, radius: 0.32, hitRadius: 0.62, team: 'player',
            dmg: st.atk * 1.9 * spow, life: 1.6, elem: 'fire', trail: true,
            /* [P2] 集束（取向）：贯穿弹，不再被第一个敌人挡下 */
            pierce: !!(bBeh && bBeh.pierce),
            onHit: (e, proj) => {
              this.explodeAt(proj.pos.clone(), radius, st.atk * 1.9 * spow, 0xff7a30);
              if (st.flags.firetrail) this.createFirePatch(proj.pos.clone(), radius);
              /* [P2b] 台阶 Lv5「爆炸处留火海」：必须写在命中点。
               * 行为层的 c.center 是「落点」，而 dir 施法的落点恒在射程尽头，
               * 拿它点火等于在 16 码外的空气里烧 —— 玩家什么都看不到。 */
              if (bBeh && bBeh.firePatch) this.createFirePatch(proj.pos.clone(), radius);
            }
          });
        }
        break;
      }
      case 'frostnova': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        const cp = aim.clone();
        /* [S4] 双重变体：1 + sextra 片新星，副新星在主轴附近随机偏移 */
        const n = 1 + Math.max(0, sextra);
        /* [P2b] 台阶 Lv9 易伤 / Lv5 持续伤害。新星是瞬发，所以直接挂在命中上 ——
         * 元素用冰（'霜蚀'），不能借通用 hit 通道的 burnPct（那个写死火焰灼烧）。 */
        const fnVuln = Math.max(0, (bBeh && bBeh.vuln) || 0);
        const fnDot = Math.max(0, (bBeh && bBeh.tierDot) || 0);
        const fnGen = this.mapGen;
        const novaAt = c2 => {
          const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, c2) < 6 * srad + e.radius);
          for (const e of hits) {
            const { dmg, crit } = this.rollDamage(st.atk * 2.2 * spow);
            this.damageEnemy(e, dmg, crit, {});
            e.slow = 0.45; e.slowT = 3.5 + sdur;
            /* 寒冰系大节点 / 星阙旧档：冰霜新星命中的敌人被冻结 */
            if (st.flags.novaFreeze) { e.slow = 1; e.slowT = Math.max(e.slowT, 1.2); }
            if (fnVuln) {
              e.vuln = Math.max(e.vuln || 0, fnVuln);
              e.vulnT = Math.max(e.vulnT || 0, 4);
            }
            if (fnDot && !e.dead && (e.dotT || 0) < 0.75) {
              this.applySkillDot(e, st.atk * fnDot / 100 * spow, 3, 'ice', '霜蚀');
            }
          }
          FX.ring(c2, 6 * srad, 0x8ad8ff, 0.7, 0.3);
          FX.flashCircle(c2, 6 * srad, 0x8ad8ff, 0.45);
          for (let i = 0; i < 30; i++) {
            const ang = Math.random() * 7, r = RND(1, 6);
            FX.burst(new THREE.Vector3(c2.x + Math.cos(ang) * r, RND(0.1, 1), c2.z + Math.sin(ang) * r), 0xaae8ff, 2, { speed: 2, size: 0.12, life: 0.8, gravity: -1, additive: true });
          }
          /* [P2b] 台阶 Lv10「收尾爆燃」：新星没有「结束」这一说，所以落点
           * 0.6 秒后再炸一发 —— 与变体「霜爆」的 aftershock 是同族观感，
           * 但走的是 endBurst 这个键，两条会叠加而不是互相顶掉。 */
          if (bBeh && bBeh.endBurst) {
            setTimeout(() => {
              if (this.mapGen !== fnGen || this.dead) return;
              this.explodeAt(c2.clone(), 6 * srad * 0.9,
                st.atk * (bBeh.endBurst / 100) * spow, 0x8ad8ff, false, true, 'aoe');
            }, 600);
          }
        };
        for (let i = 0; i < n; i++) {
          novaAt(i === 0 ? cp : new THREE.Vector3(cp.x + RND(-2.6, 2.6), 0, cp.z + RND(-2.6, 2.6)));
        }
        this.shake = 0.3;
        break;
      }
      case 'chain': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.thunder();
        let cur = this.nearestEnemy(aim, 12) || this.nearestEnemy(pp, 12);
        const hitSet = new Set();
        let from = new THREE.Vector3(pp.x, 1.5, pp.z);
        let jumps = 0;
        while (cur && jumps < 5 + sextra && !hitSet.has(cur)) {
          hitSet.add(cur);
          const to = new THREE.Vector3(cur.pos.x, 1.2, cur.pos.z);
          FX.beam(from, to, 0x88ddff, 0.2);
          const { dmg, crit } = this.rollDamage(st.atk * 1.7 * spow * Math.pow(0.85, jumps) * (typeof this.chainMul === 'function' ? this.chainMul() : 1));
          this.damageEnemy(cur, dmg, crit, {});
          from = to; jumps++;
          let next = null, bd = 9;
          for (const e of this.enemies) {
            if (e.dead || hitSet.has(e)) continue;
            const d = DIST2D(e.pos, cur.pos);
            if (d < bd) { bd = d; next = e; }
          }
          cur = next;
        }
        if (jumps) this.shake = 0.2;
        break;
      }
      case 'meteor': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        const target = aim.clone();
        const mRad = 5.5 * srad;
        /* [P2b] 双陨 / 三连落：1 + sextra 颗（这个位的发数台阶在 Lv5 / Lv7，
         * 3 级是「溅射」—— 见 SKILL_COUNT_TIER）。
         * 偏移取 0.55 倍半径：数量轴的折算按「每颗都打中同一只」算，偏出半径
         * 就是「升一级反而更弱」（火墙位踩过）。留出的余量是为了让几颗石头
         * 看得见是几颗，而不是全叠成一个点。 */
        const mCnt = 1 + Math.max(0, sextra);
        /* [P2b] Lv9 / Lv10「落点留火海」：每颗自己的落点各留一块。
         * 半径取 0.75 倍爆炸半径 —— 火海比爆炸小一圈，玩家才看得出「炸点」
         * 与「烧着的地」是两层；等大会让范围读数虚高。 */
        const mField = Math.max(0, (bBeh && bBeh.tierField) || 0);
        const mFieldDur = Math.max(1, (bBeh && bBeh.tierFieldDur) || 4);
        for (let k = 0; k < mCnt; k++) {
          const a = k * Math.PI * 2 / Math.max(1, mCnt - 1);
          const off = k === 0 ? 0 : mRad * 0.55;
          const c = new THREE.Vector3(target.x + Math.cos(a) * off, 0, target.z + Math.sin(a) * off);
          FX.telegraph(c, mRad, 0.9 + k * 0.12, () => {
            this.explodeAt(c, mRad, st.atk * 4.2 * spow, 0xff5522, true);
            if (mField) this.spawnTierField(c, mRad * 0.75, mField, mFieldDur, 0xff5522);
            SFX.explode(); this.shake = 0.6;
            for (let i = 0; i < 4; i++) setTimeout(() => {
              FX.burst(new THREE.Vector3(c.x + RND(-4, 4), 0.3, c.z + RND(-4, 4)), 0xff7a20, 14, { speed: 9, size: 0.16, life: 0.8, gravity: -3, additive: true });
            }, i * 60);
          });
          // 落下的陨石视觉
          const rock = new THREE.Mesh(sphGeo(0.8, 6), new THREE.MeshBasicMaterial({ color: 0xff5522 }));
          rock.position.set(c.x, 18, c.z);
          this.scene.add(rock);
          const fall = { t: 0 };
          const fallFn = () => {
            fall.t += 0.016;
            rock.position.y -= 20 * 0.05;
            if (fall.t < 0.95) requestAnimationFrame(fallFn); else { this.scene.remove(rock); }
          };
          fallFn();
        }
        break;
      }
      case 'iceshield': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        this.shield = st.hpMax * 0.35 * (1 + (st.shieldBonus || 0) / 100) * spow;   // [S1] 护盾强度，传世可再强化
        /* [P2b] 时长必须带 sdur：变体「永冻」的 mods {dur:6} 就是「持续 +6 秒」，
         * 原来这里写死 10，那一整条变体一个字都没生效（面板还写着 +6 秒）。 */
        this.shieldT = 10 + sdur;
        FX.ring(pp, 2, 0x9ae0ff, 0.6, 0.2);
        UI.toast('玄冰护盾 ' + Math.round(this.shield));
        break;
      }
      case 'starfall': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast(); SFX.boss();
        const center = aim.clone();
        let n = 0;
        const gen = this.mapGen;
        /* [P2b] Lv9 / Lv10「落点留火海」：每颗陨星的落点各留一块。
         * 一场雨落 16~18 颗，所以 `spawnTierField` 那边有「同时最多 4 块」的
         * 预算 —— 不然 18 块 3 码的地会把整片战场糊死。留下的 4 块是**最后
         * 落下的那 4 颗**，观感正好是「雨停了，地上还在烧」。 */
        const sfField = Math.max(0, (bBeh && bBeh.tierField) || 0);
        const sfFieldDur = Math.max(1, (bBeh && bBeh.tierFieldDur) || 4);
        /* [P3] 星移（变体）：改成一段「跟着人走」的引导 —— 4 秒内每 0.35 秒
         * 在你**当前**位置砸一颗，所以边跑边下陨星。原口径是「围着落点砸 16 颗」，
         * 换的是「能不能挪窝」，不是数字 */
        const ch = (bBeh && bBeh.channel) ? Math.max(1, bBeh.channel) : 0;
        if (ch) {
          let ct = 0;
          const ivc = setInterval(() => {
            if (this.mapGen !== gen || this.dead) { clearInterval(ivc); return; }
            ct++;
            const ppc = this.playerGroup.position;
            const t = new THREE.Vector3(ppc.x + RND(-2.4, 2.4), 0, ppc.z + RND(-2.4, 2.4));
            this.explodeAt(t, 3.0 * srad, st.atk * 1.5, 0xff7a30, false, true);
            if (sfField) this.spawnTierField(t, 3.0 * srad * 0.75, sfField, sfFieldDur, 0xff7a30);
            if (ct >= Math.ceil(ch / 0.35)) clearInterval(ivc);
          }, 350);
          UI.toast('星移 · 引导 ' + ch + ' 秒');
          break;
        }
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          n++;
          const off = new THREE.Vector3(RND(-9, 9), 0, RND(-9, 9));
          const t = center.clone().add(off);
          this.explodeAt(t, 3.2 * srad, st.atk * 1.6, 0xff7a30, false, true);
          if (sfField) this.spawnTierField(t, 3.2 * srad * 0.75, sfField, sfFieldDur, 0xff7a30);
          /* 星阙 5 件：陨星 +8 颗（count 修正）。
           * [P2b] 基数 16 = SKILL_COUNT_BASE.starfall；这个位的发数台阶在
           * Lv5 / Lv7（Lv3 是「溅射」，只改落点半径），所以 sextra 在这里
           * 只来自 5 / 7 级 + 装备，不再有 3 级那一发。 */
          if (n > 16 + sextra) clearInterval(iv);
        }, 220);
        break;
      }
      /* [S4] 冰锥：三枚扇形冰锥，命中减速 */
      case 'iceshard': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        const n = 3 + Math.max(0, sextra);
        /* [P3] 环刺（变体）：改成绕自身八向齐射，不再朝一个扇面 */
        const ringOn = (bBeh && bBeh.ring) ? Math.max(3, Math.round(bBeh.ring)) : 0;
        const cnt = ringOn || n;
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < cnt; i++) {
          const a = ringOn
            ? (i / cnt) * Math.PI * 2
            : (i - (cnt - 1) / 2) * 0.14;
          const d2 = dir.clone().applyAxisAngle(up, a);
          FX.projectile({
            pos: new THREE.Vector3(pp.x + d2.x * 0.8, 1.4, pp.z + d2.z * 0.8),
            dir: d2, speed: 26, color: 0x9ae0ff, radius: 0.26, hitRadius: 0.5, team: 'player',
            dmg: st.atk * 1.2 * spow, life: 1.2, elem: 'ice', trail: true, tag: 'proj',
            /* [P2] 冰枪（变体）：贯穿冰枪。变体走旧 variants 不进 branchBeh，
             * 这里一并读一下，等变体接进行为层时这条自动生效 */
            pierce: !!(bBeh && bBeh.pierce),
            onHit: (e, proj) => {
              this.damageEnemy(e, proj.dmg, false, { tag: 'proj', elem: 'ice' });
              e.slow = Math.max(e.slow || 0, 0.4); e.slowT = Math.max(e.slowT || 0, 2);
              FX.flashCircle(proj.pos, 1.6, 0x9ae0ff, 0.25);
              FX.burst(new THREE.Vector3(proj.pos.x, 1, proj.pos.z), 0x9ae0ff, 8, { speed: 3, size: 0.1, life: 0.4, additive: true });
            }
          });
        }
        break;
      }
      /* [S4] 暴雪：区域持续冰伤 + 减速 */
      case 'blizzard': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        const core = aim.clone();
        const rad = 6 * srad;
        const dur = 5 + sdur;
        /* [P2b] 多片暴雪（这个位的发数台阶在 Lv5 / Lv7）：1 + sextra 片，围着落点散开。
         * 偏移必须 < 半径 —— 数量轴的折算按「每片都盖住同一只」算，偏出去就等于
         * 高一级反而更弱（火墙位踩过这个坑）。 */
        const zCnt = 1 + Math.max(0, sextra);
        const cs = [], zfx = [];
        for (let k = 0; k < zCnt; k++) {
          const a = k * Math.PI * 2 / Math.max(1, zCnt - 1);
          const off = k === 0 ? 0 : rad * 0.55;
          const ck = new THREE.Vector3(core.x + Math.cos(a) * off, 0, core.z + Math.sin(a) * off);
          cs.push(ck);
          zfx.push(FX.area(ck, rad, 0x9ad8ff, dur, { opacity: 0.26 }));
        }
        /* [P3] 暴风（变体）：区域跟着人走。锚点是伤害循环真正在读的那些对象，
         * 网格一并挪，判定与观感才不会分家 */
        if (bBeh && bBeh.follow) this.attachFollow(cs, zfx, dur);
        /* [P2b] Lv9 / Lv10「落点留领域」：暴雪是持续 5 秒的区域，所以这一块
         * **要等它停了才铺**，否则只是在同一片地上叠一层，没有「留」的意思。
         * 锚点读的是 cs —— 「暴风」变体会把区域带着走，玩家看到的是
         * 「冰暴最后停在哪」，不是「最初瞄准哪」。 */
        const zField = Math.max(0, (bBeh && bBeh.tierField) || 0);
        const zFieldDur = Math.max(1, (bBeh && bBeh.tierFieldDur) || 4);
        if (zField) {
          const zGen = this.mapGen;
          setTimeout(() => {
            if (this.mapGen !== zGen || this.dead || !this.state) return;
            for (const ck of cs) this.spawnTierField(ck, rad * 0.7, zField, zFieldDur, 0x9ad8ff);
          }, dur * 1000);
        }
        let ticks = 0;
        const gen = this.mapGen;
        /* [P3] 冰封（变体）：每隔 N 秒把区域里的人钉住 1 秒。
         * 间隔按秒数换算成跳数（每跳 0.7 秒），不另开定时器 —— 两个定时器
         * 一起改写 e.stun 会互相打架，也说不清谁先谁后。 */
        const fe = (bBeh && bBeh.freezeEvery) ? Math.max(1, Math.round(bBeh.freezeEvery / 0.7)) : 0;
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          ticks++;
          const freezeNow = fe > 0 && ticks % fe === 0;
          for (const e of this.enemies) {
            if (e.dead) continue;
            let hitAny = false;
            for (const c of cs) {
              if (e.dead) break;
              if (DIST2D(e.pos, c) >= rad + e.radius) continue;
              hitAny = true;
              const { dmg } = this.rollDamage(st.atk * 0.6 * spow);
              this.damageEnemy(e, dmg, false, { silent: true, elem: 'ice' });
            }
            if (!hitAny) continue;
            e.slow = Math.max(e.slow || 0, 0.45); e.slowT = Math.max(e.slowT || 0, 1.5);
            if (freezeNow) {
              e.stun = Math.max(e.stun || 0, e.boss ? 0.3 : 1);
              e.slow = 1; e.slowLabel = '冻结';
              FX.burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), 0x9ae8ff, 7, { speed: 3, size: 0.1, life: 0.5, additive: true });
            }
          }
          FX.burst(new THREE.Vector3(core.x + RND(-rad + 1, rad - 1), 2.2, core.z + RND(-rad + 1, rad - 1)), 0xcfe8ff, 3, { speed: 1.2, size: 0.14, life: 1.4, gravity: -0.4 });
          if (ticks >= Math.ceil(dur / 0.7)) clearInterval(iv);
        }, 700);
        break;
      }
      /* [S4] 火墙：沿施法方向的持续火带 */
      case 'firewall': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.fire();
        const dur = 4 + sdur;
        const rad = 3 * srad;
        const segs = [], wfx = [];
        /* [P2b] 数量台阶「双段 / 三段」：1 + sextra 道火墙，沿垂直于施法方向的
         * 一条线并排铺开。间距取 0.95 倍半径 —— 这个数不是拍脑袋：
         * 数量轴的伤害折算（skillCountDmgPct）是按「每段都打得中同一个目标」算的，
         * 间距一旦大过半径，站中间的目标只吃到一道，却要背单发 -7.5% 的惩罚，
         * 三段的实际伤害反而比一段低。0.95 保证中间的目标吃到全部 N 道，
         * 总伤正好是 Σ0.85^n（1.85 / 2.57 倍）。 */
        const walls = 1 + Math.max(0, sextra);
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        /* 第 w 道火墙的起点（围火变体用它外层数，普通形态用它做横向偏移） */
        const wallOff = w => (w - (walls - 1) / 2) * rad * 0.95;
        /* [P3] 围火（变体）：不再是朝前的火带，改成绕自己一圈的火墙 ——
         * 防守向的用法，怪一贴身就在烧。多道时是同心环（半径逐层外扩），
         * 因为绕着人一圈的墙往旁边平移没有意义。 */
        const ringFire = !!(bBeh && bBeh.ring);
        if (ringFire) {
          const nSeg = 6;
          for (let w = 0; w < walls; w++) {
            const rr = Math.max(2.4, rad * 1.2) * (1 + w * 0.6);
            for (let i = 0; i < nSeg; i++) {
              const a = (i / nSeg) * Math.PI * 2;
              const c = new THREE.Vector3(pp.x + Math.cos(a) * rr, 0, pp.z + Math.sin(a) * rr);
              segs.push(c);
              wfx.push(FX.area(c, rad, 0xff5522, dur, { opacity: 0.22 }));
            }
          }
        } else {
          for (let w = 0; w < walls; w++) {
            const off = wallOff(w);
            const o0 = new THREE.Vector3(aim.x + perp.x * off, 0, aim.z + perp.z * off);
            for (let i = 0; i < 4; i++) {
              const c = new THREE.Vector3(o0.x + dir.x * i * 2.6, 0, o0.z + dir.z * i * 2.6);
              segs.push(c);
              wfx.push(FX.area(c, rad, 0xff5522, dur, { opacity: 0.22 }));
            }
          }
        }
        /* [P2b] 台阶 Lv9 场内易伤 / Lv5 命中挂持续伤害。
         * 领域类技能不能靠通用 hit 通道：那个只在施法瞬间、以准星为圆心结算一次，
         * 而怪是**后来走进火里**的。所以两条都在每一跳上结算。
         * 持续伤害只在快烧完时补一次（dotT < 0.75）—— 每跳都调 applySkillDot
         * 会每 0.5 秒刷一行飘字，看着像卡了。 */
        const fwVuln = Math.max(0, (bBeh && bBeh.vuln) || 0);
        const fwDot = Math.max(0, (bBeh && bBeh.tierDot) || 0);
        /* [P3] 追随（变体）：整条火带跟着人走（四段锚点 + 四块网格一起挪） */
        if (bBeh && bBeh.follow) this.attachFollow(segs, wfx, dur);
        let ticks = 0;
        const gen = this.mapGen;
        /* [P2] 蔓延（精研）：每秒向施法点两侧各延长 1 码，最多 +N 码。
         * 新段与旧段共用 segs 数组 —— 伤害循环节点 iterates 同一份，自动跟上 */
        if (bBeh && bBeh.grow) {
          const growMax = Math.max(1, Math.round(bBeh.grow));
          let grown = 0;
          const growIv = setInterval(() => {
            if (this.mapGen !== gen || grown >= growMax) { clearInterval(growIv); return; }
            grown++;
            for (const sgn of [1, -1]) {
              const c = new THREE.Vector3(
                aim.x + perp.x * grown * sgn, 0, aim.z + perp.z * grown * sgn);
              segs.push(c);
              FX.area(c, rad, 0xff5522, Math.max(0.5, dur - grown), { opacity: 0.22 });
            }
            FX.text(new THREE.Vector3(aim.x, 2.4, aim.z), '蔓延 +' + grown, 'info', { life: 0.6 });
          }, 1000);
        }
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          ticks++;
          for (const c of segs) {
            for (const e of this.enemies) {
              if (e.dead) continue;
              if (DIST2D(e.pos, c) < rad + e.radius) {
                const { dmg } = this.rollDamage(st.atk * 0.55 * spow);
                this.damageEnemy(e, dmg, false, { silent: true, elem: 'fire' });
                if (fwVuln) {
                  e.vuln = Math.max(e.vuln || 0, fwVuln);
                  e.vulnT = Math.max(e.vulnT || 0, 4);
                }
                if (fwDot && (e.dotT || 0) < 0.75) {
                  this.applySkillDot(e, st.atk * fwDot / 100 * spow, 3, 'fire', '灼烧');
                }
              }
            }
          }
          if (ticks >= Math.ceil(dur / 0.5)) {
            clearInterval(iv);
            /* [P3] 爆燃（变体）/ [P2b] 台阶 Lv10「收尾爆燃」：火墙烧完在每段原地炸一发。
             * 放在收尾而不是另开定时器 —— 时段必须跟火墙本体对得上。
             * 台阶用 `+endBurst` 叠加：选了爆燃变体是 120 + 60，没选的是 60。 */
            if (bBeh && bBeh.endBurst) {
              const burst = st.atk * (bBeh.endBurst / 100) * spow;
              for (const c of segs) this.explodeAt(c.clone(), rad * 1.1, burst, 0xff7a30, false, true, 'aoe');
              FX.text(new THREE.Vector3(aim.x, 2.6, aim.z), '爆燃', 'lv', { life: 0.9 });
              this.shake = Math.max(this.shake, 0.3);
            }
          }
        }, 500);
        break;
      }
      /* [S4] 焚天：以自身为中心的烈焰新星 */
      case 'pyroclasm': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.fire(); SFX.explode();
        const rad = 7 * srad;
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < rad + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 3.6 * spow);
          this.damageEnemy(e, dmg, crit, { knock: 1.2, elem: 'fire' });
        }
        FX.ring(pp, rad, 0xff7a30, 0.9, 0.4);
        FX.flashCircle(pp, rad, 0xff9040, 0.5);
        for (let i = 0; i < 36; i++) {
          const ang = (i / 36) * 6.2832, r = RND(1, rad);
          FX.burst(new THREE.Vector3(pp.x + Math.cos(ang) * r, RND(0.2, 1.6), pp.z + Math.sin(ang) * r), 0xff9040, 2, { speed: 5, size: 0.13, life: 0.7, gravity: -2, additive: true });
        }
        this.shake = 0.55; this.hitstop = 90;
        /* [P2b] 台阶 Lv10「爆发时定身」：焚天没有护盾，走的是「爆发」这个入口 ——
         * 结算与破盾侧共用 behTierNova，两个入口的数值不会漂。 */
        if (bBeh && bBeh.tierNova) this.behTierNova('pyroclasm', pp);
        break;
      }
      /* [S4] 雷云：区域持续随机落雷 */
      case 'thundercloud': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.thunder();
        const rad = 7 * srad;
        const dur = 6 + sdur;
        /* [P2b] 数量台阶「双段 / 三段」：1 + sextra 朵雷云，围着落点散开。
         * 偏移取 0.55 倍半径：完全叠在一起看不出是两朵（白给），散太开又变成
         * 三个谁也罩不住怪的小云。这与毒雾多团用的是同一个比例。
         * 每朵各自维护 ticks / rampN / 定时器 —— 共用一个会让三朵同步跳、
         * 蓄电也互相串味。 */
        const clouds = 1 + Math.max(0, sextra);
        /* [P2b] 台阶 Lv9 易伤 / Lv5 持续伤害：领域类靠每一跳结算，
         * 不走通用 hit 通道（那个只在施法瞬间、以准星为圆心结算一次）。 */
        const tcVuln = Math.max(0, (bBeh && bBeh.vuln) || 0);
        const tcDot = Math.max(0, (bBeh && bBeh.tierDot) || 0);
        const gen = this.mapGen;
        for (let ci = 0; ci < clouds; ci++) {
          const ang = (ci / clouds) * Math.PI * 2;
          const off = clouds === 1 ? 0 : rad * 0.55;
          const c = new THREE.Vector3(aim.x + Math.cos(ang) * off, 0, aim.z + Math.sin(ang) * off);
          const zona = FX.area(c, rad, 0x8a7aff, dur, { opacity: 0.2 });
          /* [P3] 随身（变体）：雷云跟着人走 */
          if (bBeh && bBeh.follow) this.attachFollow([c], [zona], dur);
          let ticks = 0;
          /* [P2] 蓄电（精研）：玩家停在云里每 1 秒，落雷频率 +15%。
           * 「频率」落成每跳多劈几道（3 道 × 15% × 驻留秒数），上限 +6 道，
           * 走出云就清零 —— 换来的增频只在站桩引导时成立 */
          let rampN = 0;
          const iv = setInterval(() => {
            if (this.mapGen !== gen) { clearInterval(iv); return; }
            ticks++;
            const inZone = this.enemies.filter(e => !e.dead && DIST2D(e.pos, c) < rad + e.radius);
            if (bBeh && bBeh.ramp) {
              const pg = this.playerGroup.position;
              rampN = DIST2D(pg, c) < rad + 2 ? Math.min(rampN + 1, 20) : 0;
            }
            const extra = (bBeh && bBeh.ramp) ? Math.min(6, Math.floor(rampN * 3 * 0.15)) : 0;
            const bolts = Math.min(inZone.length, Math.min(3, inZone.length) + extra);
            for (let i = 0; i < bolts; i++) {
              const e = inZone[Math.floor(Math.random() * inZone.length)];
              if (!e || e.dead) continue;
              FX.beam(new THREE.Vector3(e.pos.x, 7, e.pos.z), new THREE.Vector3(e.pos.x, 1, e.pos.z), 0xa9c8ff, 0.18);
              const { dmg, crit } = this.rollDamage(st.atk * 1.1 * spow);
              this.damageEnemy(e, dmg, crit, { elem: 'lightning', silent: true });
              if (tcVuln) {
                e.vuln = Math.max(e.vuln || 0, tcVuln);
                e.vulnT = Math.max(e.vulnT || 0, 4);
              }
              if (tcDot && !e.dead && (e.dotT || 0) < 0.75) {
                this.applySkillDot(e, st.atk * tcDot / 100 * spow, 3, 'lightning', '雷灼');
              }
            }
            if (ticks >= Math.ceil(dur / 1)) {
              clearInterval(iv);
              /* [P2b] 台阶 Lv10「收尾爆燃」：云散的时候在云心炸一发。
               * 雷云本来没有收尾，这一级给它一个「云散了还要挨一下」。
               * 与火墙共用 endBurst 键（都走 `+` 叠加，不吃变体）。 */
              if (bBeh && bBeh.endBurst) {
                this.explodeAt(c.clone(), rad * 0.9,
                  st.atk * (bBeh.endBurst / 100) * spow, 0xa9c8ff, false, true, 'aoe');
                if (ci === 0) FX.text(new THREE.Vector3(c.x, 2.8, c.z), '雷爆', 'lv', { life: 0.9 });
                this.shake = Math.max(this.shake, 0.24);
              }
            }
          }, 1000);
        }
        break;
      }
      /* [S4] 雷罚：单体天罚巨雷，对首领 +30% */
      case 'judgement': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.thunder(); SFX.boss();
        const target = this.nearestEnemy(aim, 16) || this.nearestEnemy(pp, 16);
        /* [P3] 雷柱（变体）：把一发巨雷改成 3 秒的持续雷柱，每 0.4 秒劈一次。
         * 总伤害略高于单发（要站着挨完），换取「怪不敢进这块地」 */
        const chJ = (bBeh && bBeh.channel) ? Math.max(1, bBeh.channel) : 0;
        if (chJ) {
          const cj = (target ? target.pos.clone() : aim.clone());
          cj.y = 0;
          let jt = 0;
          const genJ = this.mapGen;
          UI.toast('雷柱 · 引导 ' + chJ + ' 秒');
          const ivJ = setInterval(() => {
            if (this.mapGen !== genJ || this.dead) { clearInterval(ivJ); return; }
            jt++;
            FX.beam(new THREE.Vector3(cj.x, 10, cj.z), new THREE.Vector3(cj.x, 1, cj.z), 0xd8e8ff, 0.26);
            FX.flashCircle(cj, 3.4, 0xd8e8ff, 0.3);
            for (const e of this.enemies) {
              if (e.dead || DIST2D(e.pos, cj) >= 3.4 * srad + e.radius) continue;
              const { dmg, crit } = this.rollDamage(st.atk * 2.6 * spow);
              this.damageEnemy(e, dmg, crit, { elem: 'lightning', knock: 0.4 });
            }
            this.shake = Math.max(this.shake, 0.3);
            if (jt >= Math.ceil(chJ / 0.4)) clearInterval(ivJ);
          }, 400);
          break;
        }
        /* [P2b] 双陨 / 三连落在天罚这里 = 多劈几个目标（它本来就是单体巨雷）。
         * 目标不够就把多出来的雷补在主目标身上 —— 数量轴的折算（skillCountDmgPct）
         * 是按「每一发都打中同一只」算的，补打同一只是这套折算唯一自洽的读法。
         * 也不做「多段分摊到同一只时每段减伤」：递减已经由 spow 统一折过了。 */
        const jCnt = 1 + Math.max(0, sextra);
        const jTgts = [];
        if (target) {
          jTgts.push(target);
          const others = this.enemies
            .filter(e => !e.dead && e !== target && DIST2D(e.pos, aim) < 16)
            .sort((a, b) => DIST2D(a.pos, aim) - DIST2D(b.pos, aim));
          for (const e of others) { if (jTgts.length >= jCnt) break; jTgts.push(e); }
          while (jTgts.length < jCnt) jTgts.push(target);
        }
        /* [P2b] Lv3「溅射」：天罚是单体判定，靠这一段打到落点周围一圈。
         * 键来自 SKILL_TIER_EVO.judgement（splash），同位的另外三只是范围
         * 判定，溅射就是半径变大（mods.radius），不需要这个键。 */
        const jSplash = Math.max(0, (bBeh && bBeh.splash) || 0);
        /* [P2b] Lv9 / Lv10「落点留领域」：雷罚的落点是被劈中的那只脚下，
         * 不是准星 —— 落雷会追到怪身上，两者恒不重合（符箓那边踩过）。 */
        const jField = Math.max(0, (bBeh && bBeh.tierField) || 0);
        const jFieldDur = Math.max(1, (bBeh && bBeh.tierFieldDur) || 4);
        for (let k = 0; k < jTgts.length; k++) {
          const tgt = jTgts[k];
          const bossMul = tgt.boss ? 1.3 : 1;
          FX.telegraph(tgt.pos.clone(), 3.2 * srad, 0.7 + k * 0.1, () => {
            FX.beam(new THREE.Vector3(tgt.pos.x, 10, tgt.pos.z), new THREE.Vector3(tgt.pos.x, 1, tgt.pos.z), 0xd8e8ff, 0.3);
            const { dmg, crit } = this.rollDamage(st.atk * 8.5 * spow * bossMul);
            this.damageEnemy(tgt, dmg, crit, { elem: 'lightning', knock: 1 });
            FX.flashCircle(tgt.pos, 3.4 * srad, 0xd8e8ff, 0.4);
            if (jField) this.spawnTierField(tgt.pos, 3.2 * srad * 0.75, jField, jFieldDur, 0xd8e8ff);
            if (jSplash) {
              for (const e of this.enemies) {
                if (e.dead || e === tgt) continue;
                if (DIST2D(e.pos, tgt.pos) >= 3.4 * srad + e.radius) continue;
                const s2 = this.rollDamage(st.atk * 8.5 * spow * bossMul * jSplash / 100);
                this.damageEnemy(e, s2.dmg, s2.crit, { elem: 'lightning' });
              }
            }
            this.shake = 0.6; this.hitstop = 110;
          }, 0xd8e8ff);
        }
        break;
      }
      /* 道士 */
      case 'talisman': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        /* [S4] 双符变体：1 + sextra 张，分别追踪不同目标 */
        const tgts = [];
        const primary = this.nearestEnemy(aim, 16) || this.nearestEnemy(pp, 16);
        if (primary) tgts.push(primary);
        const usedIds = new Set(tgts.map(t => t.id));
        for (let i = 0; i < Math.max(0, sextra); i++) {
          let best = null, bd = 16;
          for (const e of this.enemies) {
            if (e.dead || usedIds.has(e.id)) continue;
            const d = DIST2D(e.pos, pp);
            if (d < bd) { bd = d; best = e; }
          }
          if (!best) break;
          tgts.push(best); usedIds.add(best.id);
        }
        /* v1.0.4：从「瞬间一道雷光」改成「一道符飞过去」。
         * 原实现是一条 beam，同一帧生成又消失，画面上只闪一下，
         * 玩家根本看不出技能放没放出去，也没有飞行时间带来的节奏感。
         * 现在是一枚会拐弯追踪的符咒，命中瞬间才落雷。 */
        /* [P2b] 台阶（Lv5 连锁 / Lv9 符阵 / Lv10 改追）全部在**落雷点**结算，
         * 所以在这里一次取出、交给下面的 onHit —— 三个键在 skill-beh.js 里
         * 登记成 hook（ph:'hook'），通用 hit 通道不会碰它们。
         * 为什么不能走通用通道：那条以「落点（准星）」为圆心，而符会追到怪
         * 身上，两者恒不重合 —— 拿准星当圆心等于在半空里劈雷。 */
        const talChain = Math.max(0, Math.round((bBeh && bBeh.chainHit) || 0));
        const talChainPct = ((bBeh && bBeh.chainHitPct) || 60) / 100;
        const talZone = Math.max(0, Math.round((bBeh && bBeh.zoneHit) || 0));
        const talZonePct = ((bBeh && bBeh.zonePct) || 15) / 100;
        const talSeek = Math.max(0, Math.round((bBeh && bBeh.seek) || 0));
        const talSeekPct = ((bBeh && bBeh.seekPct) || 70) / 100;
        for (const target of tgts) {
          const start = new THREE.Vector3(pp.x + RND(-0.3, 0.3), 1.5, pp.z + RND(-0.3, 0.3));
          const tdir = target
            ? new THREE.Vector3(target.pos.x - pp.x, 0, target.pos.z - pp.z).normalize()
            : new THREE.Vector3(dir.x, 0, dir.z).normalize();
          FX.projectile({
            pos: start, dir: tdir, speed: 17, color: 0xffd24a, radius: 0.3, hitRadius: 0.45,
            team: 'player', style: 'talisman', life: 2.0, trail: true, tag: 'proj',
            homing: target ? target.pos : null, homeTurn: 9,
            onHit: (e, proj) => {
              /* [P2b] 改追（Lv10）打出去的那一发按 seekPct 结算 —— 白送一次
               * 全额的话，「追 2 次」等于 +140% 伤害，比 Lv5 / Lv9 加起来还猛。 */
              const seekMul = (proj && proj.seekUsed) ? talSeekPct : 1;
              const { dmg, crit } = this.rollDamage(st.atk * 1.7 * spow * seekMul);
              this.damageEnemy(e, dmg, crit, { tag: 'proj' });
              // 符纸炸开 → 天雷落地
              FX.beam(new THREE.Vector3(e.pos.x, 4.2, e.pos.z), new THREE.Vector3(e.pos.x, 0.9, e.pos.z), 0x9affd0, 0.16);
              FX.flashCircle(e.pos, 1.9, 0x9affd0, 0.26);
              FX.burst(new THREE.Vector3(e.pos.x, 1.2, e.pos.z), 0x9affd0, 12, { speed: 4, size: 0.1, life: 0.4, additive: true });
              SFX.thunder();
              this.shake = Math.max(this.shake, 0.12);
              /* [P2b] Lv5 雷符连锁：从落雷点继续跳，最多 talChain 个。
               * 伤害按 0.85^n 递减 —— 与数量台阶同一个口径，
               * 不递减的话「连锁 2 个」等于白送 120% 伤害。 */
              if (talChain) {
                const done = new Set([e.id]);
                let from = new THREE.Vector3(e.pos.x, 1.2, e.pos.z);
                let cur = e;
                for (let j = 0; j < talChain; j++) {
                  let nxt = null, bd = 7;
                  for (const o of this.enemies) {
                    if (o.dead || done.has(o.id)) continue;
                    const d = DIST2D(o.pos, cur.pos);
                    if (d < bd) { bd = d; nxt = o; }
                  }
                  if (!nxt) break;
                  done.add(nxt.id);
                  const to = new THREE.Vector3(nxt.pos.x, 1.2, nxt.pos.z);
                  FX.beam(from, to, 0x9affd0, 0.18, 0.9);
                  FX.flashCircle(to, 1.2, 0x9affd0, 0.18);
                  const r2 = this.rollDamage(st.atk * 1.7 * spow * talChainPct * Math.pow(0.85, j));
                  this.damageEnemy(nxt, r2.dmg, r2.crit, { tag: 'proj' });
                  from = to; cur = nxt;
                }
              }
              /* [P2b] Lv9 雷符阵：在落雷点铺一片会跳电的符阵（不是准星） */
              if (talZone) {
                this.createSigilField(new THREE.Vector3(e.pos.x, 0, e.pos.z),
                  3.4 * srad, st.atk * 1.7 * spow * talZonePct, talZone);
              }
              /* [P2b] Lv10 改追：命中后自动锁下一个目标，最多 talSeek 次。
               * 用 proj.seekUsed 记账 —— 不记账的话每次命中都会再追一次，
               * 一符清场（「穿透」那个 special 没有上限，这里必须有）。 */
              if (talSeek && proj && (proj.seekUsed || 0) < talSeek) {
                let nxt = null, bd = 10;
                for (const o of this.enemies) {
                  if (o.dead || o === e) continue;
                  if (proj.hitSet && proj.hitSet.has(o.id)) continue;
                  const d = DIST2D(o.pos, e.pos);
                  if (d < bd) { bd = d; nxt = o; }
                }
                if (nxt) {
                  proj.seekUsed = (proj.seekUsed || 0) + 1;
                  proj.pierce = true;
                  proj.homing = nxt.pos;
                  FX.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), '追符', 'info', { life: 0.6 });
                }
              }
              /* [S3] 符箓系大节点·天师：五雷符穿透，命中后飞向附近下一个目标 */
              if (st.specials && st.specials.talismanPierce) {
                let next = null, bd = 14;
                for (const o of this.enemies) {
                  if (o.dead || o === e) continue;
                  if (proj.hitSet && proj.hitSet.has(o.id)) continue;
                  const d = DIST2D(o.pos, e.pos);
                  if (d < bd) { bd = d; next = o; }
                }
                if (next) {
                  proj.pierce = true;
                  proj.homing = next.pos;
                  FX.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), '穿透', 'info', { life: 0.6 });
                }
              }
            }
          });
        }
        // 出手瞬间手边亮一下，抬手动作才有落点
        FX.flashCircle(new THREE.Vector3(pp.x + dir.x * 0.9, 0.08, pp.z + dir.z * 0.9), 1.1, 0xffd24a, 0.18);
        break;
      }
      /* [S4] 符箭：三张追踪符 */
      case 'talismanarrow': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        /* [P3] 符雨（变体）：不再三张追踪，改成往落点砸一片符 ——
         * 单发低、覆盖面大，清群用；单体杀伤交给另外两条 */
        if (bBeh && bBeh.rain) {
          const c = aim.clone();
          const spread = 7 * srad;
          const genR = this.mapGen;
          let rn = 0;
          UI.toast('符雨');
          const rIv = setInterval(() => {
            if (this.mapGen !== genR || this.dead) { clearInterval(rIv); return; }
            rn++;
            const t = new THREE.Vector3(c.x + RND(-spread, spread), 0, c.z + RND(-spread, spread));
            FX.beam(new THREE.Vector3(t.x, 9, t.z), new THREE.Vector3(t.x, 0.5, t.z), 0xd8f0a0, 0.2);
            FX.flashCircle(t, 1.9, 0xd8f0a0, 0.22);
            for (const e of this.enemies) {
              if (e.dead || DIST2D(e.pos, t) >= 1.9 + e.radius) continue;
              const { dmg, crit } = this.rollDamage(st.atk * 0.7 * spow);
              this.damageEnemy(e, dmg, crit, { tag: 'aoe' });
            }
            if (rn >= 12) clearInterval(rIv);
          }, 130);
          break;
        }
        const n = 3 + Math.max(0, sextra);
        const usedIds2 = new Set();
        for (let i = 0; i < n; i++) {
          let target = null, bd = 16;
          for (const e of this.enemies) {
            if (e.dead || usedIds2.has(e.id)) continue;
            const d = DIST2D(e.pos, pp);
            if (d < bd) { bd = d; target = e; }
          }
          if (target) usedIds2.add(target.id);
          const start = new THREE.Vector3(pp.x + RND(-0.4, 0.4), 1.4, pp.z + RND(-0.4, 0.4));
          const tdir = target
            ? new THREE.Vector3(target.pos.x - pp.x, 0, target.pos.z - pp.z).normalize()
            : dir.clone();
          FX.projectile({
            pos: start, dir: tdir, speed: 19, color: 0xd8f0a0, radius: 0.24, hitRadius: 0.45,
            team: 'player', style: 'talisman', life: 2.0, trail: true, tag: 'proj',
            homing: target ? target.pos : null, homeTurn: 7,
            onHit: (e, proj) => {
              const { dmg, crit } = this.rollDamage(st.atk * 1.0 * spow);
              this.damageEnemy(e, dmg, crit, { tag: 'proj' });
              FX.burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), 0xd8f0a0, 8, { speed: 3, size: 0.1, life: 0.4, additive: true });
            }
          });
        }
        break;
      }
      /* [S4] 天师符：区域符阵持续落雷 */
      case 'mastersigil': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        const c = aim.clone();
        const rad = 6 * srad;
        /* [P2b] 台阶 Lv7「阵法持续 +3 秒」。这一位躺着太极（增益）与天师符（符阵）
         * 两只 —— 只给增益加时长的话，把天师符放进 ③ 号位的玩家这一级就是假话。 */
        const dur = 6 + sdur + ((bBeh && bBeh.tierDur) || 0);
        const zona = FX.area(c, rad, 0xffd24a, dur, { opacity: 0.22 });
        /* [P3] 贴身印（变体）：符印贴在身上跟着走 */
        if (bBeh && bBeh.follow) this.attachFollow([c], [zona], dur);
        let ticks = 0;
        const gen = this.mapGen;
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          ticks++;
          let hit = 0;
          for (const e of this.enemies) {
            if (e.dead || hit >= 3) continue;
            if (DIST2D(e.pos, c) < rad + e.radius) {
              hit++;
              FX.beam(new THREE.Vector3(e.pos.x, 6, e.pos.z), new THREE.Vector3(e.pos.x, 1, e.pos.z), 0xffd24a, 0.16);
              const { dmg } = this.rollDamage(st.atk * 1.0 * spow);
              this.damageEnemy(e, dmg, false, { silent: true, elem: 'lightning' });
            }
          }
          if (ticks >= Math.ceil(dur / 0.9)) clearInterval(iv);
        }, 900);
        break;
      }
      case 'summon': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal();
        this.summonWolf();
        FX.flashCircle(pp, 2.4, 0x9affd0, 0.5);
        break;
      }
      /* [S4] 白虎：高攻速近战召唤 */
      case 'whitetiger': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal(); SFX.boss();
        /* 参数统一读 BEAST_PRESET（台阶「四象同场」要凭空补召同一只，
         * 数字抄第二遍就多一处漂移的机会） */
        this.summonBeast({ kind: 'tiger' });
        FX.flashCircle(pp, 3, 0xffe0b0, 0.5);
        break;
      }
      /* [S4] 青龙：范围攻击召唤 */
      case 'azuredragon': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal(); SFX.boss();
        /* [P3] 化龙（变体）：不召唤了，自己变成龙 —— 5 秒内每 0.6 秒吐一口
         * 4 码范围伤害（结算在 tickBeh，因为要跟着人走） */
        if (bBeh && bBeh.transform) {
          this._dragonT = Math.max(1, bBeh.transform);
          this._dragonTickT = 0;
          this._dragonMul = spow;
          FX.flashCircle(pp, 4.2, 0x6ac8ff, 0.55);
          FX.ring(pp, 4.6, 0x6ac8ff, 0.7, 0.3);
          FX.text(new THREE.Vector3(pp.x, 2.9, pp.z), '化龙', 'lv', { life: 1.1 });
          UI.toast('化龙 · ' + Math.round(this._dragonT) + ' 秒');
          break;
        }
        this.summonBeast({ kind: 'dragon' });
        /* [P2] 龙息（取向）：青龙在场时每 N 秒喷吐一次范围伤害。
         * 标记在召唤物身上，updateAllies 里逐帧倒数 */
        if (bBeh && bBeh.breath && this.allies.length) {
          const al = this.allies[this.allies.length - 1];
          al.breath = { every: Math.max(2, bBeh.breath), t: Math.max(2, bBeh.breath) };
        }
        FX.flashCircle(pp, 3.6, 0x6ac8ff, 0.55);
        break;
      }
      case 'heal': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal();
        const amount = st.hpMax * 0.28 * spow;
        /* [S4] 久春变体：持续回复时长 +sdur 秒 */
        const hotDur = (4000 + sdur * 1000) / 1000;
        this.healPlayer(amount);
        this.regen = (this.regen || 0) + st.hpMax * 0.03 * spow;
        setTimeout(() => { this.regen = Math.max(0, (this.regen || 0) - st.hpMax * 0.03 * spow); }, hotDur * 1000);
        FX.ring(pp, 2.2, 0x8affb0, 0.6);
        for (let i = 0; i < 14; i++) FX.burst(new THREE.Vector3(pp.x + RND(-1, 1), RND(0.3, 2.2), pp.z + RND(-1, 1)), 0x8affb0, 2, { speed: 1.5, size: 0.1, life: 0.9, gravity: -3, additive: true });
        if (st.flags.groupheal) this.shield = Math.max(this.shield, st.hpMax * 0.2 * (1 + (st.shieldBonus || 0) / 100));   // [S1]
        break;
      }
      case 'poison': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        /* 青符 4 件：蚀骨毒雾范围 +30%、持续 +3 秒 */
        const prad = 5 * srad;
        const pdur = 6 + sdur;
        /* [P2b] 蔓延（台阶 Lv5）：雾随时间长大，最多 +grow%。
         * 判定半径 radNow 与特效 scale 必须同步 —— 只放大特效是「看着罩住了、
         * 伤害没到」，只放大判定是「看不见的雾在毒人」，两种玩家都会骂。 */
        const grow = Math.max(0, (bBeh && bBeh.grow) || 0);
        /* [P2b] 雾内减速（台阶 Lv9）：与剑阵共用 slowField —— 它是「每跳刷新一次」
         * 的持续场，不是施法瞬间的一次性减速，所以要挂在雾的每一跳上。
         * 原稿「毒雾跟随」撞了变体「追随」的 follow 键，选过追随的玩家毫无反应。 */
        const slowPct = Math.min(0.7, CLAMP((bBeh && bBeh.slowField) || 0, 0, 60) / 100);
        const slowDur = Math.max(0.2, (bBeh && bBeh.slowFieldDur) || 0.9);
        const gen = this.mapGen;
        /* [P2b] 数量台阶「双团 / 三团」：1 + sextra 团，围着落点散开。
         * 以前这一位是「一团吃到底」—— 面板写着双团、实际只铺一团，
         * 判据还被同位的符箭 / 万剑顶成「已实装」，属于自欺。
         * 每团各自维护半径与定时器：共用一个 radNow 会让三团胀成一团大的。 */
        const patches = 1 + Math.max(0, sextra);
        for (let pi = 0; pi < patches; pi++) {
          const ang = (pi / patches) * Math.PI * 2;
          const off = patches === 1 ? 0 : prad * 0.55;
          const c = new THREE.Vector3(aim.x + Math.cos(ang) * off, 0, aim.z + Math.sin(ang) * off);
          const zona = FX.area(c, prad, 0x2f9a3c, pdur, { opacity: 0.3 });
          /* [P3] 追随（变体）：毒雾跟着人走 */
          if (bBeh && bBeh.follow) this.attachFollow([c], [zona], pdur);
          let radNow = prad;
          let ticks = 0;
          const iv = setInterval(() => {
            if (this.mapGen !== gen) { clearInterval(iv); return; }
            ticks++;
            if (grow) {
              const k = Math.min(1, ticks * 0.8 / Math.max(1, pdur));
              radNow = prad * (1 + (grow / 100) * k);
              if (zona && zona.scale) zona.scale.setScalar(radNow);
            }
            for (const e of this.enemies) {
              if (e.dead) continue;
              if (DIST2D(e.pos, c) < radNow + e.radius) {
                const { dmg } = this.rollDamage(st.atk * 0.75 * spow);
                this.damageEnemy(e, dmg, false, { silent: true, elem: 'poison' });
                /* [S4] 蚀骨印记：天师套「打中毒目标增伤」靠它判定 */
                e.venomT = Math.max(e.venomT || 0, 2.5);
                /* 雾内减速：每跳刷新，出雾后 slowDur 秒解除。
                 * 首领砍半 —— 与剑阵同口径，否则一坨雾能把首领黏在原地 5 秒。 */
                if (slowPct) {
                  e.slow = Math.max(e.slow || 0, e.boss ? slowPct * 0.5 : slowPct);
                  e.slowT = Math.max(e.slowT || 0, slowDur);
                  e.slowLabel = e.slowLabel || '毒雾';
                }
                /* [S4] 丹鼎套·毒爆：每跳 25% 概率在目标脚下爆裂 */
                if (st.specials && st.specials.plagueburst && CHANCE(0.25)) {
                  this.explodeAt(e.pos.clone(), 3, st.atk * 0.8 * spow, 0x7fbf5a, false, true, 'dot');
                }
              }
            }
            FX.burst(new THREE.Vector3(c.x + RND(-prad + 1, prad - 1), 0.3, c.z + RND(-prad + 1, prad - 1)), 0x7fbf5a, 4, { speed: 1.4, size: 0.16, life: 1.2, gravity: -0.5 });
            if (ticks >= Math.ceil(pdur / 0.8)) clearInterval(iv);
          }, 800);
        }
        break;
      }
      case 'swordrain': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast(); SFX.thunder();
        const c = aim.clone();
        let n = 0;
        const gen = this.mapGen;
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          n++;
          const t = new THREE.Vector3(c.x + RND(-10, 10), 0, c.z + RND(-10, 10));
          const sword = new THREE.Mesh(boxGeo(0.1, 1.5, 0.04), new THREE.MeshBasicMaterial({ color: 0xd8ffe0, transparent: true, opacity: 0.9 }));
          sword.position.set(t.x, 9, t.z);
          this.scene.add(sword);
          const start = performance.now();
          const anim = () => {
            const k = (performance.now() - start) / 260;
            sword.position.y = 9 - k * 9;
            if (k < 1) requestAnimationFrame(anim);
            else {
              this.scene.remove(sword);
              this.explodeAt(t, 2.6, st.atk * sk.mult * spow, 0x9affd0, false, true);
            }
          };
          anim();
          if (n >= 22 + sextra) clearInterval(iv);
        }, 150);
        break;
      }
    }
    /* [P4] 变体专属特效：纯表现，放在行为层之前 —— 先让玩家看见「这一发不一样」，
     * 再谈它多打了什么。两者互不依赖，顺序只影响同一帧里的观感。 */
    if (typeof this.castFormFx === 'function') {
      this.castFormFx(id, { pp, aim, dir, spow, srad });
    }
    /* [P2b] 台阶「施法瞬间回复 N% 生命」：**通用**，放在 switch 之后 ——
     * 原来写在增益 case 里，结果 heal / revive 这类非增益技能永远吃不到
     * （面板写着「瞬回 8%」，血条纹丝不动）。走 healPlayer：治疗加成、
     * 血条钳制、弹字全在那一处。 */
    if (bBeh && bBeh.healOnCast) this.healPlayer(st.hpMax * bBeh.healOnCast / 100);
    /* [P2] 技能树分支的行为层（减速 / 破甲 / 余震 / 回资源…）。
     * 同样放在 switch 之后：它只追加效果，不参与本发技能自己的伤害结算，
     * 所以「这发技能吃不到自己挂的易伤」—— 否则易伤等于当场双倍。 */
    if (typeof this.applySkillBeh === 'function') {
      this.applySkillBeh(id, { pp, aim, dir, spow, srad, base: st.atk * (sk.mult || 1) * spow });
    }
    /* [P3] 不竭是「本次施放才开闸」的：上面的冷却赋值发生在行为层之前，
     * 所以这里补一刀 —— 否则开启的那一下还要等满冷却，手感像没生效。 */
    if (this._drainOn && this._drainOn[id]) this.cooldowns[id] = 0.2;
    this._tag = null;      // [S1] 技能结算完毕，标记归零，避免污染普攻
    this._castSkill = null;   // [P2] 击杀来源标记同步清零（见施法入口的注释）
    UI.renderHUD();
  },

  /* [C1] 通用持续伤害（流血 / 灼烧）：走独立通道，不覆盖中毒
   * —— 中毒有它自己的 0.9 秒节拍和蚀骨印记，混用会让天师套增伤判定错乱。 */
  applySkillDot(e, dmgPerTick, dur, elem, label) {
    if (!e || e.dead) return;
    /* [P2] 燃烬（被动）：灼烧类 dot 每跳 +10%/级 */
    if (elem === 'fire' && typeof this.passiveEmberMul === 'function') dmgPerTick *= this.passiveEmberMul();
    e.dotT = Math.max(e.dotT || 0, dur);
    e.dotDur = e.dotT;
    e.dotDmg = Math.max(e.dotDmg || 0, dmgPerTick);
    e.dotElem = elem || null;
    e.dotLabel = label || '流血';
    e.dotTick = 1;
    FX.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), label || '流血', 'info', { life: 0.7 });
  },

  addBuff(name, stats, color, opts = {}) {
    const dur = stats.dur || 8;
    const entry = {
      name, stats, dur, color,
      key: opts.key || null,
      type: opts.type || 'buff',
      icon: opts.icon || (name ? name.slice(0, 1) : '益'),
      desc: opts.desc || ''
    };
    const cur = opts.refresh && opts.key ? this.buffs.find(b => b.key === opts.key) : null;
    if (cur) Object.assign(cur, entry);
    else this.buffs.push(entry);
    this.recalc();
    this.buffFx(color);
    if (typeof UI !== 'undefined') UI.renderBuffs();
  },

  /* 玩家身上的减益 / 护盾，统一给 buffbar 渲染 */
  statusBuffs() {
    const out = [];
    /* [S4] 还魂激活中 */
    if (this.reviveT > 0) out.push({ name: '还魂', dur: this.reviveT, color: '#ffd166', type: 'buff', icon: '魂', desc: '受到致命伤时以 35% 生命存活' });
    if (this.playerSlowT > 0) out.push({ name: '迟滞', dur: this.playerSlowT, color: '#6ab8ff', type: 'debuff', icon: '缓', desc: '移动速度降低 ' + Math.round((this.playerSlow || 0) * 100) + '%' });
    if (this.poisonT > 0) out.push({ name: '中毒', dur: this.poisonT, color: '#7fbf5a', type: 'debuff', icon: '毒', desc: '每 0.9 秒受到 ' + Math.round(this.poisonDps || 0) + ' 点毒素伤害' });
    if (this.shield > 0 && this.shieldT > 0) out.push({ name: '玄冰护盾', dur: this.shieldT, color: '#9ae0ff', type: 'buff', icon: '盾', desc: '吸收 ' + Math.round(this.shield) + ' 点伤害' });
    return out;
  },

  buffFx(color) {
    const pp = this.playerGroup.position;
    for (let i = 0; i < 18; i++) {
      FX.burst(new THREE.Vector3(pp.x + RND(-0.8, 0.8), RND(0.2, 2.2), pp.z + RND(-0.8, 0.8)), color, 1, { speed: 1.6, size: 0.1, life: 0.8, gravity: -2, additive: true });
    }
  },

  /* 读档 / 换装后的兜底修正（v1.3.0）：
   * 老存档或异常数据里可能出现「双手兵器 + 副手同时存在」、
   * 「副手塞了非双持的兵器」这类非法组合，这里统一纠正，
   * 被顶掉的副手退回行囊（行囊满就留在手上，宁可状态怪也不吞装备）。 */
  repairHands() {
    const s = this.state;
    if (!s || !s.equipment) return;
    if (!Array.isArray(s.inventory)) s.inventory = [];
    const eq = s.equipment;
    const two = this.handOf(eq.weapon) === 'two';
    if (two && eq.offhand) {
      if (s.inventory.length < this.bagCap()) { s.inventory.push(eq.offhand); eq.offhand = null; }
    }
    if (eq.offhand && !this.fitsSlot(eq.offhand, 'offhand')) {
      if (s.inventory.length < this.bagCap()) { s.inventory.push(eq.offhand); eq.offhand = null; }
    }
  },

  recalc() {
    const s = this.state;
    this.repairHands();
    s.stats = computePlayerStats(s);
    const st = s.stats;
    /* [S4] 增益结算走 BUFF_MUL / BUFF_ADD 两张表（items.js），
     * 新增增益属性只需要往表里加 key，不用再改这里。 */
    for (const b of this.buffs) {
      const bs = b.stats;
      if (!bs) continue;
      for (const k in bs) {
        if (k === 'dur') continue;
        const v = bs[k];
        if (typeof v !== 'number') continue;
        if (BUFF_MUL[k]) st[BUFF_MUL[k]] *= 1 + v / 100;
        else if (BUFF_ADD.indexOf(k) >= 0) st[k] = (st[k] || 0) + v;
      }
    }
    s.setCount = st.setCount;
    if (s.hp > st.hpMax) s.hp = st.hpMax;
    if (s.mp > st.mpMax) s.mp = st.mpMax;
  },

  /* ---------------- 伤害 ---------------- */
  rollDamage(base) {
    const st = this.state.stats;
    const crit = Math.random() * 100 < st.crit;
    /* [S1] minDmg 抬高伤害下限（封顶 0.2，否则波动区间会翻过来）；
     *      dmgAll 是所有伤害的通用乘区 */
    const lo = 0.9 + Math.min(0.2, (st.minDmg || 0) / 100);
    let dmg = base * RND(lo, 1.12) * (1 + (st.dmgAll || 0) / 100);
    if (crit) dmg *= st.critDmg / 100;
    return { dmg, crit };
  },

  /* [S1] 技能类型 → 对应伤害加成乘区。
   * 技能持续伤害（火海等地板）走 dot，投射物走 proj，其余按 aoe/melee 分。 */
  tagBonus(tag) {
    const st = this.state.stats;
    if (tag === 'aoe') return st.aoeDmg || 0;
    if (tag === 'proj') return st.projDmg || 0;
    if (tag === 'dot') return st.dotDmg || 0;
    return st.meleeDmg || 0;
  },

  damageEnemy(e, dmg, crit, opts = {}) {
    if (e.dead) return;
    const st = this.state.stats;
    const tag = opts.tag || this._tag || 'melee';
    let final = dmg * (1 + st.skillDmg / 100 * 0.5) * (1 + this.tagBonus(tag) / 100);

    /* [S1] 护甲穿透：按比例削减目标有效护甲，最多穿掉 80% */
    const armor = e.level * 3 + (e.cfg.armorHigh ? e.level * 6 : 0);
    /* [P2] 破甲（技能树分支挂上的 debuff）：先按穿透削，再按破甲削 */
    const shred = (e.shredT > 0) ? Math.min(80, e.shred || 0) / 100 : 0;
    const effArmor = Math.max(0, armor * (1 - Math.min(0.8, (st.armorPen || 0) / 100)) * (1 - shred));
    final *= 100 / (100 + effArmor);

    /* [S5] 族群抗性：按本次伤害的元素结算（opts.elem 缺省按物理）。
     * 正数减伤、负数增伤；元素免疫（85%）也走这一条，不另开分支。
     * 上限 +85 / 下限 -60：既能逼玩家换武器，又不至于让某个流派完全打不动。 */
    const elem = opts.elem || 'phys';
    const res = e.resist ? (e.resist[elem] || 0) : 0;
    if (res) final *= 1 - CLAMP(res, -60, 85) / 100;

    /* [M1] 元素伤害词缀：按本次伤害的元素取对应加成键。
     * 放在抗性之后、暴击之外，保证「堆火伤打亡灵」和「堆错元素打石魔」
     * 的体感差别立刻能看出来。 */
    const ELEM_DMG = { fire: 'fireDmg', ice: 'iceDmg', lightning: 'lightningDmg', poison: 'poisonDmg', sigil: 'sigilDmg' };
    const edk = ELEM_DMG[elem];
    if (edk && st[edk]) final *= 1 + st[edk] / 100;

    /* [M1] 游侠套·锐意：攻击满血目标必定暴击 */
    if (st.specials && st.specials.deadeye && !crit && e.hp >= e.maxHp * 0.999) {
      crit = true;
      final *= st.critDmg / 100;
    }

    if (e.cfg.all) final *= 0.85;
    /* [P2] 易伤（技能树分支）：目标受到的所有伤害 +N%。
     * 放在抗性 / 元素之后、暴击之前，纯粹是一个独立乘区，
     * 不会和已有的增伤词缀互相挤占。 */
    if (e.vulnT > 0 && e.vuln) final *= 1 + e.vuln / 100;
    if (st.flags.bossSlayer && e.boss) final *= 1.4;
    /* [S3] 狂战系·浴血：生命低于 50% 时造成的伤害 +25% */
    if (st.flags.lowHpFury && this.state.hp < st.hpMax * 0.5) final *= 1.25;
    /* [S4] 血怒套·狂怒层数：每层 +5% 伤害 */
    if (this.frenzy && this.frenzy.n) final *= 1 + 0.05 * this.frenzy.n;
    /* [S4] 玄冰套：被减速 / 冻结的目标受到伤害 +25% */
    if (st.flags.deepfreeze && ((e.slow || 0) > 0 || (e.slowT || 0) > 0)) final *= 1.25;
    /* [S4] 天师套：对中毒 / 燃烧 / 蚀骨的目标伤害 +40% */
    if (st.flags.runeburn && ((e.poisonT || 0) > 0 || (e.venomT || 0) > 0)) final *= 1.4;

    /* [S1] 按目标状态增伤：精英 / 首领 / 残血处决 / 满血先手 */
    if (st.eliteDmg && (e.elite || e.boss)) final *= 1 + st.eliteDmg / 100;
    if (st.bossDmg && e.boss) final *= 1 + st.bossDmg / 100;
    if (st.executeDmg && e.maxHp && e.hp / e.maxHp < 0.3) final *= 1 + st.executeDmg / 100;
    if (st.firstStrike && e.maxHp && e.hp >= e.maxHp - 1) final *= 1 + st.firstStrike / 100;
    /* [P2] 被动的条件增伤（血性 / 绝对零度 / 剑魄）：独立乘区 */
    if (typeof this.passiveDmgMul === 'function') final *= 1 + this.passiveDmgMul(e, opts) / 100;

    /* [S5] 精英护盾：先吃伤害再扣血。护盾不吃「溢出转护盾」那套，
     * 否则玩家打死护盾怪会白拿一层盾。 */
    if (e.shield > 0) {
      const ab = Math.min(e.shield, final);
      e.shield -= ab; final -= ab;
      FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '吸收 ' + Math.round(ab), 'info', { life: 0.5 });
      if (final <= 0) return;
    }
    e.hp -= final;
    if (e.hp < 0) e.overkill = -e.hp;      // [S1] 记下溢出量，击杀时可能转成护盾
    if (crit && st.aspdOnCrit) this.aspdCritT = 2.5;   // [S1] 暴击后攻速
    /* 传世特性·裂魂：暴击时小概率引发小范围爆炸（爆炸伤害不再连锁触发） */
    if (crit && !opts.silent && !this._critbursting && st.specials && st.specials.critburst && CHANCE(0.2)) {
      this._critbursting = true;
      this.explodeAt(e.pos.clone(), 2.4, final * 0.35, 0xffb040, false, true);
      this._critbursting = false;
    }
    /* [S4] 血怒套·狂怒：暴击叠层（最多 5 层，4 秒未暴击掉 1 层） */
    if (crit && !opts.silent && st.specials && st.specials.frenzyStack) {
      const prev = (this.frenzy && this.frenzy.n) || 0;
      const n = Math.min(5, prev + 1);
      this.frenzy = { n, t: 4 };
      if (n === 5 && prev < 5) {
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.9, this.playerGroup.position.z), '狂怒 MAX', 'info', { life: 0.9 });
      }
    }
    /* [S4] 雷殛套·过载：技能暴击时向周围追加一道 60% 伤害的天雷（0.4 秒内置冷却） */
    if (crit && !opts.silent && st.specials && st.specials.overcharge && (this.overchargeCd || 0) <= 0) {
      this.overchargeCd = 0.4;
      const oz = e.pos.clone();
      FX.beam(new THREE.Vector3(oz.x, 7, oz.z), new THREE.Vector3(oz.x, 0.8, oz.z), 0x9ad8ff, 0.2);
      this.explodeAt(oz, 3.2, final * 0.6, 0x9ad8ff, false, true);
    }
    /* [P2] 嗜血（bloodrage 精研）：增益期间暴击回复 1.5% 生命。
     * silent 的持续伤害不触发 —— 要不然挂一次 dot 每跳都在「暴击回血」 */
    if (crit && !opts.silent && typeof this.onBehCrit === 'function') this.onBehCrit();
    e.hitFlash = 1;
    e.actor.flash = opts.silent ? 0.08 : 0.22;
    e.actor.flashWas = true;

    const p = new THREE.Vector3(e.pos.x, e.boss ? 3.4 : 1.5, e.pos.z);
    FX.text(p, Math.round(final).toString(), crit ? 'crit' : 'dmg');
    FX.spark(new THREE.Vector3(e.pos.x, e.boss ? 2 : 1.1, e.pos.z), crit ? 0xffb040 : 0xffe0b0, crit ? 14 : 7);
    if (!opts.silent) {
      SFX[crit ? 'crit' : 'hit']();
      /* [S16] 受击闷哼：同一只怪 0.3 秒内只叫一次，
       * 否则高频攻击（旋风斩、连射）会把它变成电钻 */
      if (typeof AudioSys !== 'undefined' && AudioSys.ctx) {
        const now = AudioSys.ctx.currentTime;
        if (!e._hurtAt || now - e._hurtAt > 0.3) { e._hurtAt = now; AudioSys.mob(e, 'hurt'); }
      }
    }

    // 生命偷取
    if (st.lifesteal > 0 && !opts.elem) this.healPlayer(final * st.lifesteal / 100, true);
    // 减速/雷击等特效
    if (st.flags.frost && CHANCE(0.25)) { e.slow = 0.4; e.slowT = 2; }
    if (st.flags.thunder && CHANCE(0.18)) this.procThunder(e);

    /* [S1] 命中附加：眩晕 / 减速 / 冻结 / 点燃 / 回灵回血。
     * 只在「有感」的命中上触发（silent 的持续伤害不重复触发，否则一跳一堆特效）。 */
    if (!opts.silent) {
      if (st.stunChance && !e.boss && CHANCE(st.stunChance / 100)) e.stun = Math.max(e.stun || 0, 0.8);
      if (st.slowChance && CHANCE(st.slowChance / 100)) {
        e.slow = Math.max(e.slow || 0, 0.35); e.slowT = Math.max(e.slowT || 0, 2);
      }
      if (st.freezeChance && !e.boss && CHANCE(st.freezeChance / 100)) {
        /* [P2] 霜寒（被动）：冻结持续时间 +15%/级 */
        const frMul = (typeof this.freezeMul === 'function') ? this.freezeMul() : 1;
        e.slow = 1; e.slowT = Math.max(e.slowT || 0, 1.2 * frMul);
      }
      if (st.burnChance && CHANCE(st.burnChance / 100)) {
        e.poisonT = Math.max(e.poisonT || 0, 3);
        e.poisonDmg = Math.max(e.poisonDmg || 0, st.atk * 0.12);
      }
      if (st.mpOnHit) this.state.mp = Math.min(st.mpMax, this.state.mp + st.mpOnHit);
      if (st.hpOnHit) this.healPlayer(st.hpOnHit, true);
    }

    // 击退（技能自带 + 装备击退强度）
    const kb = (opts.knock || 0) + (st.knockback || 0) * 0.35;
    if (kb > 0 && !e.boss) {
      const dx = e.pos.x - this.playerGroup.position.x, dz = e.pos.z - this.playerGroup.position.z;
      const d = Math.hypot(dx, dz) || 1;
      e.pos.x += dx / d * kb * 0.5; e.pos.z += dz / d * kb * 0.5;
    }
    if (e.hp <= 0) {
      /* [P2] 击杀来源标记：只在施法同步窗口内写（_castSkill 非空），
       * 延迟伤害 / dot 跳伤发生时标记已清零 → lastHitBy 保持原值。
       * 补刀（resetOnKill）靠它区分「处决亲手杀的」和「烧死的」 */
      if (this._castSkill) e.lastHitBy = this._castSkill;
      this.onEnemyDeath(e); return;
    }

    /* [S5] 召唤：生命每降 25% 召 2 只同族。
     * 用「理论档位 vs 已触发档位」比对，一次大伤害跨两档也不会漏召。 */
    if (e.aff && e.aff.summoner && !e.boss) {
      const step = Math.floor((1 - e.hp / e.maxHp) / e.aff.summoner.step);
      if (step > e.summonStep) {
        e.summonStep = step;
        this.summonMinions(e, e.aff.summoner.count);
      }
    }
    /* [S5] 荆棘：近战打它会被反弹。只在「有感」的命中上触发，
     * 否则持续伤害（毒/火）每跳都弹一次，玩家会被莫名其妙磨死。 */
    if (e.aff && e.aff.thorns && tag === 'melee' && !opts.silent && !this.dead) {
      this.damagePlayer(final * e.aff.thorns.pct / 100, e);
    }
  },

  /* [S5] 召唤同族小怪：只召普通怪，数量与位置都做了夹取，
   * 避免「召唤词缀 + 40 只同屏」把手机端 draw call 顶穿。 */
  summonMinions(e, n) {
    const kind = e.tag;
    if (!kind || !MONSTERS[kind]) return;
    const alive = this.enemies.filter(x => !x.dead && !x.boss).length;
    if (alive >= (this.mobCap || (IS_TOUCH ? MOB_CAP_TOUCH : MOB_CAP_PC))) return;
    FX.ring(e.pos, 3.2, 0x7fd44a, 0.6, 0.28);
    FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '召唤', 'info', { life: 0.8 });
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const m = this.spawnEnemy(kind, e.pos.x + Math.cos(ang) * 1.8, e.pos.z + Math.sin(ang) * 1.8, false, e.level);
      if (m) {
        m.hp = m.maxHp = Math.max(1, Math.round(e.maxHp * 0.16));
        m.summoned = true;
        m.aggro = true;
      }
    }
  },

  procThunder(target) {
    if (!target) return;
    const from = new THREE.Vector3(target.pos.x, 8, target.pos.z);
    const to = new THREE.Vector3(target.pos.x, 1, target.pos.z);
    FX.beam(from, to, 0x9ad8ff, 0.22);
    const { dmg } = this.rollDamage(this.state.stats.atk * 0.8);
    const d = { ...target };
    this.damageEnemy(target, dmg, false, { silent: true });
  },

  /* [S1] 爆炸一律算范围伤害（tag='aoe'），不管是谁触发的爆炸 */
  explodeAt(pos, radius, baseDmg, color, big, silent, tag = 'aoe') {
    if (!silent) { SFX.explode(); this.shake = Math.max(this.shake, big ? 0.5 : 0.25); this.hitstop = 50; }
    FX.flashCircle(pos, radius, color, 0.35);
    FX.ring(pos, radius * 1.2, color, 0.45, 0.2);
    FX.burst(new THREE.Vector3(pos.x, 0.6, pos.z), color, big ? 30 : 16, { speed: 9, size: 0.14, life: 0.6, gravity: 2, additive: true });
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (DIST2D(e.pos, pos) < radius + e.radius) {
        const { dmg, crit } = this.rollDamage(baseDmg);
        this.damageEnemy(e, dmg, crit, { knock: 0.5, tag });
      }
    }
  },

  createFirePatch(pos, radius) {
    FX.area(pos, radius, 0xff5522, 3.5, { opacity: 0.2 });
    let ticks = 0;
    const gen = this.mapGen;
    const iv = setInterval(() => {
      if (this.mapGen !== gen) { clearInterval(iv); return; }
      ticks++;
      for (const e of this.enemies) {
        if (!e.dead && DIST2D(e.pos, pos) < radius) {
          const { dmg } = this.rollDamage(this.state.stats.atk * 0.45);
          this.damageEnemy(e, dmg, false, { silent: true, tag: 'dot' });
        }
      }
      if (ticks > 3) clearInterval(iv);
    }, 900);
  },

  /* [P2b] 雷符阵（符箓 Lv9）：落雷点留一片每 0.5 秒跳一次电的符阵。
   *
   * 为什么不复用 createFirePatch：那个是「火」，每跳 0.45 倍攻击、0.9 秒
   * 一跳、带灼烧语义；符阵是「雷」，跳得密（0.5 秒）但每跳更轻。
   * 两者合一个函数只会变成「加一堆 if 的火」，以后改火就误伤雷。
   *
   * dmg 是**每跳**伤害（调用方已经乘好百分比），dur 是秒。 */
  createSigilField(pos, rad, dmg, dur) {
    if (!this.state || typeof FX === 'undefined') return;
    const gen = this.mapGen;
    FX.area(pos, rad, 0x9affd0, dur, { opacity: 0.16 });
    FX.ring(pos, rad * 1.05, 0x9affd0, dur, 0.22);
    let ticks = 0;
    const step = 500;
    const iv = setInterval(() => {
      if (this.mapGen !== gen || this.dead) { clearInterval(iv); return; }
      ticks++;
      FX.ring(pos, rad, 0x9affd0, 0.3, 0.16);
      for (const e of this.enemies) {
        if (e.dead || DIST2D(e.pos, pos) >= rad + e.radius) continue;
        const { dmg: d, crit } = this.rollDamage(dmg);
        this.damageEnemy(e, d, crit, { silent: true, tag: 'dot' });
      }
      if (ticks >= Math.round(dur * 1000 / step)) clearInterval(iv);
    }, step);
  },

  /* [P2b] 台阶落点领域（法师 ② 的 Lv9 / Lv10「落点留火海」）。
   *
   * 四只技能共用这一个消费点：炎爆 / 陨星天火是火，雷罚是雷，暴雪是冰 ——
   * 机制同一个（站进去就掉血），只是颜色不同。之所以不各写一份：四份几乎
   * 一样的定时器，改一次平衡要改四处（`createFirePatch` / `createSigilField`
   * 已经是两处了，别再添）。
   *
   * pct 是**每跳伤害占攻击力 %**，dur 是秒，每秒一跳。
   *
   * 同时最多 MAX 块：陨星天火一次落 16~18 颗，不记账就是 18 块地糊满屏，
   * 帧率和伤害都会爆。超出时顶掉最老的一块（跟音频「近的顶掉远的」同一思路）。
   * 顶掉只清定时器 + 收掉网格，`zones` 里那条记录留着让它自己到期 ——
   * 提前删数组会让 FX 的 tick 拿到空洞。 */
  spawnTierField(pos, rad, pct, dur, color) {
    if (!this.state || typeof FX === 'undefined') return;
    const MAX = 4;
    const gen = this.mapGen;
    this._tierFields = this._tierFields || [];
    while (this._tierFields.length >= MAX) {
      const old = this._tierFields.shift();
      if (!old) continue;
      clearInterval(old.iv);
      if (old.vis) { old.vis.visible = false; if (old.vis.parent) old.vis.parent.remove(old.vis); }
    }
    const p = pos.clone(); p.y = 0;
    const vis = FX.area(p, rad, color, dur, { opacity: 0.18 });
    FX.ring(p, rad * 1.05, color, dur, 0.2);
    const rec = { iv: 0, vis };
    this._tierFields.push(rec);
    let ticks = 0;
    const total = Math.max(1, Math.round(dur));
    rec.iv = setInterval(() => {
      if (this.mapGen !== gen) { clearInterval(rec.iv); return; }
      ticks++;
      for (const e of this.enemies) {
        if (e.dead || DIST2D(e.pos, p) >= rad + e.radius) continue;
        const { dmg, crit } = this.rollDamage(this.state.stats.atk * pct / 100);
        this.damageEnemy(e, dmg, crit, { silent: true, tag: 'dot' });
      }
      if (ticks >= total) clearInterval(rec.iv);
    }, 1000);
  },

  nearestEnemy(pos, range) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = DIST2D(e.pos, pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  healPlayer(amount, silent) {
    const s = this.state;
    /* [S1] 治疗效果加成（回春咒、药水、击杀回复、生命偷取全都吃） */
    amount *= 1 + (s.stats.healBonus || 0) / 100;
    const before = s.hp;
    s.hp = Math.min(s.stats.hpMax, s.hp + amount);
    const gained = s.hp - before;
    if (gained > 0.5) {
      /* silent 的回复（生命偷取、每秒回血、击杀回复）不弹字，否则一屏都是 +N */
      if (!silent) {
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.6, this.playerGroup.position.z), '+' + Math.round(gained), 'heal');
        SFX.heal();
      }
    }
  },

  /* [P2b] 剑阵这块「地」的存活判定。
   * 三个条件缺一不可：还在持续、还在同一张图、人还在阵里（由调用方算距离）。
   * 换图要作废 —— setInterval 那条已经按 mapGen 自清了，状态不跟着清就会
   * 「上一张图的剑阵还在给你减伤」。 */
  swordFieldLive() {
    const f = this.swordField;
    if (!f || this.dead) return null;
    if (f.gen !== this.mapGen) return null;
    if ((f.t || 0) <= 0) return null;
    return f;
  },

  damagePlayer(amount, source) {
    if (this.dead || this.invuln > 0) return;
    const s = this.state, st = s.stats;

    /* [S1] 闪避：完全免伤。给 0.2 秒无敌，避免一次群体攻击连续闪出十几条文字 */
    if (st.dodge && CHANCE(st.dodge / 100)) {
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.2, this.playerGroup.position.z), '闪避', 'info');
      this.invuln = 0.2;
      return;
    }

    /* [P2] 关键被动·天师：护身符完全抵挡一次伤害（tickPassives 每 10 秒聚一张） */
    if ((this.talismanCharges || 0) > 0) {
      this.talismanCharges--;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.5, this.playerGroup.position.z), '护身符', 'info', { life: 0.9 });
      FX.burst(new THREE.Vector3(this.playerGroup.position.x, 1.4, this.playerGroup.position.z), 0xc9a0ff, 12, { speed: 2.4, size: 0.1, life: 0.6, gravity: -1, additive: true });
      this.invuln = Math.max(this.invuln || 0, 0.2);
      return;
    }

    /* [v1.11.0] 护甲收益收紧：分母 320+22L → 380+28L，上限 75% → 70%。
     * 旧曲线下 35 级玩家 def 1800 就能拿到 62% 减伤、40 级 69%，
     * 叠上回血就是「站着不动也打不死」，怪再强也没用。
     * 现在同档装备的减伤约降 4~6 个百分点，承伤多一成左右。 */
    const reduce = Math.min(0.70, st.def / (st.def + 380 + this.state.level * 28));
    /* [DIFF] 玩家承受伤害系数：放在减伤之后，保证「护甲收益」在四档难度里一致，
     * 难度只放大最终结果，不扭曲装备词条的价值。 */
    let dmg = amount * (1 - reduce) * this.diff().taken;

    /* [S1] 格挡：伤害减半（先于抗性结算） */
    if (st.block && CHANCE(st.block / 100)) {
      /* [P3] 舍身（反击变体）：格挡照挡，但这一下不再减半 ——
       * 换的是格挡后 3 秒的伤害加成（onBehCounter 里给） */
      const noDR = !!(this.buffs && this.buffs.some(b => b.noDR));
      if (!noDR) dmg *= 0.5;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.5, this.playerGroup.position.z),
        noDR ? '格挡 · 舍身' : '格挡', 'info');
      /* [S4] 磐石套·格挡反击：挡下的瞬间反打（盾墙期间翻倍） */
      if (st.specials && st.specials.riposteGuard && source && !source.dead && (this.riposteCd || 0) <= 0) {
        this.riposteCd = 0.5;
        const wall = this.buffs.some(b => b.key === 'skill:shieldwall');
        const counter = (st.def * 1.5 + st.atk * 0.8) * (wall ? 2 : 1);
        const pp = this.playerGroup.position;
        FX.beam(new THREE.Vector3(pp.x, 1.2, pp.z), new THREE.Vector3(source.pos.x, 1.2, source.pos.z), 0xffe0a0, 0.16);
        FX.text(new THREE.Vector3(pp.x, 2.7, pp.z), wall ? '反击 ×2' : '反击', 'info', { life: 0.7 });
        this.damageEnemy(source, counter, false, { knock: 2.2, tag: 'melee' });
      }
      /* [P2] 反斩（riposte 取向）：格挡后立刻回击 80% 攻击力。
       * 放在套装备案之外：两个来源可以同时触发，数值口径不同 */
      if (typeof this.onBehCounter === 'function') this.onBehCounter(source);
    }

    dmg *= (1 - CLAMP(st.allRes, 0, 60) / 200);
    /* [S1] 单元素抗性：按来源怪物的元素标记取，无标记按物理 */
    const cfg = source && source.cfg;
    const oneRes = cfg
      ? (cfg.fire ? st.fireRes : cfg.ice ? st.iceRes : cfg.poison ? st.poisonRes : st.physRes)
      : st.physRes;
    dmg *= (1 - CLAMP(oneRes || 0, 0, 60) / 200);
    /* [S1] 固定伤害减免 */
    dmg *= (1 - CLAMP(st.dmgReduce || 0, 0, 40) / 100);
    /* [P2b] 剑阵 Lv9：阵内减伤。位置判定而不是「持续期间常驻」——
     * 钉阵变体下玩家能自己走出去，写死成常驻就把这个选择吃掉了。
     * 放在抗性后面：它是一层独立的场地减伤，不该被「先乘谁」放大或缩小。 */
    const sf = (typeof this.swordFieldLive === 'function') ? this.swordFieldLive() : null;
    const inSword = !!(sf && DIST2D(this.playerGroup.position, sf.ctr()) <= sf.rad + 0.8);
    if (inSword && sf.dr > 0) dmg *= (1 - sf.dr / 100);
    /* [P2] 被动的受伤侧改写（霜甲：贴身来源减伤；不动如山走 dmgReduce 通道） */
    if (typeof this.passiveTakenMul === 'function') dmg *= this.passiveTakenMul(source);
    /* [P2b·兽群] 召灵兽 Lv9：灵兽在场时护主减伤。取场上最大值（多只不叠加）；
     * 灵兽死光自然失效 —— 这条不需要「持续几秒」的账，它的条件就是「有没有灵兽」。 */
    let allyGuard = 0;
    for (const al of (this.allies || [])) {
      if (al.hp > 0 && (al.guard || 0) > allyGuard) allyGuard = al.guard;
    }
    if (allyGuard > 0) dmg *= (1 - CLAMP(allyGuard, 0, 40) / 100);

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.4, this.playerGroup.position.z), '吸收 ' + Math.round(absorbed), 'info');
      if (this.shield <= 0) {
        this.shield = 0; UI.log('护盾破碎');
        /* [P2] 冰刺（iceshield 取向）：破盾瞬间向四周射出冰锥 */
        if (typeof this.onBehShieldBreak === 'function') this.onBehShieldBreak();
      }
    }
    if (dmg <= 0) return;
    s.hp -= dmg;
    /* [S4] 还魂：持续内受到致命伤，以 35% 生命原地存活 */
    if (s.hp <= 0 && (this.reviveT || 0) > 0) {
      this.reviveT = 0;
      this.invuln = Math.max(this.invuln || 0, 1.5);
      s.hp = Math.max(1, Math.round(st.hpMax * 0.35));
      const pp = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 6, 0xffd166, 0.8, 0.35);
      FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '还魂', 'info', { life: 1.1 });
      FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), 0xffd166, 30, { speed: 4, size: 0.13, life: 1, gravity: -2, additive: true });
      UI.log('还魂重生！', 'good');
      SFX.levelup();
      this.shake = Math.max(this.shake, 0.4);
      return;
    }
    /* [P3] 替身（还魂变体）：不用预施放，致命伤当场自动救一次，
     * 内置 60 秒冷却。和上面「主动还魂」分开记账 —— 主动那条打得开，
     * 这条要是不分开，两个一起触发就等于两次免死。 */
    if (s.hp <= 0 && (this._autoReviveCd || 0) <= 0) {
      const rb = (typeof this.branchBeh === 'function') ? this.branchBeh('revive') : null;
      /* 必须真的「这个职业有还魂」—— skillUnlocked 只按等级判，
       * 60 级的战士也会被算成「会还魂」，那就变成全职业白捡一次免死。
       * barSkillOk 才是「这个职业的技能表里有它」。 */
      if (rb && rb.autoTrigger && this.barSkillOk('revive')) {
        this._autoReviveCd = 60;
        this.invuln = Math.max(this.invuln || 0, 1.5);
        s.hp = Math.max(1, Math.round(st.hpMax * 0.35));
        const ppa = this.playerGroup.position;
        FX.ring(new THREE.Vector3(ppa.x, 0.2, ppa.z), 6, 0xffd166, 0.8, 0.35);
        FX.text(new THREE.Vector3(ppa.x, 2.8, ppa.z), '替身', 'info', { life: 1.1 });
        FX.burst(new THREE.Vector3(ppa.x, 1.2, ppa.z), 0xffd166, 26, { speed: 4, size: 0.13, life: 1, gravity: -2, additive: true });
        UI.log('替身挡下一击！', 'good');
        SFX.levelup();
        this.shake = Math.max(this.shake, 0.4);
        return;
      }
    }
    /* 传世特性·涅槃：致命伤时以 35% 生命复活（60 秒内置冷却） */
    if (s.hp <= 0 && st.specials && st.specials.phoenix && (s.phoenixCd || 0) <= 0) {
      s.phoenixCd = 60;
      this.invuln = Math.max(this.invuln || 0, 1.5);
      s.hp = Math.max(1, Math.round(st.hpMax * 0.35));
      const pp = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 6, 0xffd166, 0.8, 0.35);
      FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '涅槃', 'info', { life: 1.1 });
      FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), 0xffd166, 30, { speed: 4, size: 0.13, life: 1, gravity: -2, additive: true });
      UI.log('涅槃重生！', 'good');
      SFX.levelup();
    }
    /* [M1] 濒死免疫（词缀 / 隐修套）：致命伤时保留 1 点生命并回复 N%，
     * 独立 60 秒冷却。与「还魂」（技能）和「涅槃」（传世）互不覆盖：
     * 三者任意一个触发都会 return，所以同一次致命伤只会吃到一个。 */
    if (s.hp <= 0 && (st.deathWard || 0) > 0 && (s.deathWardCd || 0) <= 0) {
      s.deathWardCd = 60;
      this.invuln = Math.max(this.invuln || 0, 1.5);
      s.hp = Math.max(1, Math.round(st.hpMax * CLAMP(st.deathWard, 1, 90) / 100));
      const pp = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 5.5, 0xc08aff, 0.8, 0.35);
      FX.text(new THREE.Vector3(pp.x, 2.8, pp.z), '濒死免疫', 'info', { life: 1.1 });
      FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), 0xc08aff, 26, { speed: 3.6, size: 0.12, life: 0.9, gravity: -2, additive: true });
      UI.log('濒死免疫触发，回魂 ' + Math.round(st.deathWard) + '%', 'good');
      SFX.levelup();
      this.shake = Math.max(this.shake, 0.35);
      return;
    }
    /* [P2] 关键被动·涅槃：致命伤化为火球，2 秒后复活并炸开（120 秒内置冷却）。
     * 火球期间 damagePlayer 开头不拦（靠 invuln 2.2 秒护住），复活结算在 tickPassives。 */
    if (s.hp <= 0 && typeof this.passiveLv === 'function' && this.passiveLv('m_phoenix') > 0 && (s.passPhoenixCd || 0) <= 0) {
      s.passPhoenixCd = 120;
      s.hp = 1;
      this.phoenixKeyT = 2;
      this.invuln = Math.max(this.invuln || 0, 2.2);
      const pp3 = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp3.x, 0.2, pp3.z), 4, 0xffa040, 0.7, 0.35);
      FX.text(new THREE.Vector3(pp3.x, 2.8, pp3.z), '涅槃', 'info', { life: 1.2 });
      UI.log('化作火球 —— 涅槃！', 'good');
      SFX.levelup();
      this.shake = Math.max(this.shake, 0.4);
      return;
    }
    this.shake = Math.max(this.shake, Math.min(0.5, 0.12 + dmg / 180));
    this.hitstop = 40;
    FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.2, this.playerGroup.position.z), '-' + Math.round(dmg), 'player');
    FX.blood(new THREE.Vector3(this.playerGroup.position.x, 1.2, this.playerGroup.position.z), 0xcc2222, 8);
    this.actor.flash = 0.45; this.actor.flashWas = true;
    SFX.hit();
    if (st.thorns > 0 && source && !source.dead) this.damageEnemy(source, dmg * st.thorns / 100, false, { silent: true });
    /* [P2b] 剑阵 Lv10：阵内自动反击。三个约束缺一不可 ——
     *   ① 人还在阵里（inSword，同上：钉阵变体能走出去）；
     *   ② 0.4 秒内置冷却（swordCounterCd）：不记账的话一群怪同时抡你就是
     *      几十次反击，等于白送一个群体秒杀；
     *   ③ 不复用 counter / onBehCounter：那条是「格挡后回击」，要过格挡判定、
     *      数值要乘盾墙。这条不要求格挡，口径独立，混用会变成双倍反击。 */
    if (inSword && sf.counter > 0 && source && !source.dead && (this.swordCounterCd || 0) <= 0) {
      this.swordCounterCd = 0.4;
      const ppc = this.playerGroup.position;
      FX.beam(new THREE.Vector3(ppc.x, 1.2, ppc.z),
        new THREE.Vector3(source.pos.x, 1.2, source.pos.z), 0xd8ffe0, 0.14);
      FX.text(new THREE.Vector3(ppc.x, 2.7, ppc.z), '剑阵反击', 'info', { life: 0.6 });
      this.damageEnemy(source, st.atk * sf.counter / 100, false, { knock: 1.2, tag: 'melee' });
    }
    /* [S2] 玄冰套 / 玄冰之语：受击时释放冰环冻结周围敌人（4 秒内置冷却） */
    if (st.flags.frostBurst && (this.frostBurstCd || 0) <= 0) {
      this.frostBurstCd = 4;
      const pp = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 5, 0x8ad8ff, 0.5, 0.28);
      for (const e of this.enemies) {
        if (e.dead || DIST2D(e.pos, pp) > 5.2) continue;
        e.slow = e.boss ? 0.45 : 1;
        e.slowT = Math.max(e.slowT || 0, e.boss ? 1 : 1.4);
        FX.burst(new THREE.Vector3(e.pos.x, 1, e.pos.z), 0x8ad8ff, 5, { speed: 2, size: 0.09, life: 0.5, additive: true });
      }
    }
    /* [S5] 精英命中附带效果。
     * 放在「伤害已经结算完」之后：控制/回血/追加伤害都不该改变本次这一击的数值，
     * 否则玩家会觉得「同一只怪伤害忽高忽低」。
     * _eliteProc 是防递归闸门：闪电的追加伤害还会走回这里，不挡会连锁到死。 */
    if (source && source.aff && !this._eliteProc && !this.dead) {
      this._eliteProc = true;
      const A = source.aff;
      if (A.frost) {
        if (this.applyPlayerSlow(A.frost.slow / 100, A.frost.slowDur)) {
          FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.7, this.playerGroup.position.z), '冰缓', 'info', { life: 0.7 });
        }
      }
      if (A.venom) this.playerPoison(source.dmg * (A.venom.dpsPct || 12) / 100);
      if (A.vampiric) {
        const heal = dmg * A.vampiric.leech / 100;
        if (heal > 1 && !source.dead) {
          source.hp = Math.min(source.maxHp, source.hp + heal);
          FX.text(new THREE.Vector3(source.pos.x, 2.2, source.pos.z), '+' + Math.round(heal), 'heal', { life: 0.6 });
        }
      }
      if (A.lightning && CHANCE(A.lightning.proc)) {
        const pp2 = this.playerGroup.position;
        FX.beam(new THREE.Vector3(pp2.x, 8, pp2.z), new THREE.Vector3(pp2.x, 0.6, pp2.z), 0xb98cff, 0.2);
        this.shake = Math.max(this.shake, 0.3);
        this.damagePlayer(source.dmg * A.lightning.mult, source);
      }
      this._eliteProc = false;
    }
    if (s.hp <= 0) this.die();
  },

  die() {
    if (this.dead) return;
    this.dead = true;
    this.actor.anim = 'die';
    this.actor.group.rotation.z = 0;
    SFX.die();
    this.shake = 0.8;
    /* 第一人称：死了要能点「复活 / 回城」，先把鼠标放出来 */
    this.exitLook();
    UI.closeAll();
    /* 试炼里死亡不弹「身陨」框，改弹本轮结算 —— 玩家要看到的是「打到第几波」，
     * 而不是一句「你的道还未走完」。惩罚照旧按难度扣金币。 */
    const inTrial = (typeof Trial !== 'undefined' && Trial.active);
    if (inTrial) Trial.onPlayerDeath();
    else UI.showDeath('你的道，还未走完。');
    /* [DIFF] 死亡惩罚按难度：新手 0%，普通 10%，困难 15%，极难 25% */
    const rate = this.diff().deathPenalty;
    const lost = Math.floor(this.state.gold * rate);
    if (lost > 0) {
      this.state.gold -= lost;
      UI.log('身陨 · 失落 ' + fmt(lost) + ' 金币', 'bad');
    }
    this.state.hp = 0;
  },

  respawn() {
    const s = this.state;
    s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
    this.dead = false;
    this.actor.anim = null;
    this.actor.group.rotation.z = 0;
    this.actor.group.position.y = 0;
    UI.hideDeath();
    UI.hideTrialEnd && UI.hideTrialEnd();
    this.buffs = [];
    /* 分支叠层（技能树 stack）跟着 buff 一起清：复活后不该留着满层战意 */
    this.behStack = {}; this._drainOn = null; this._follows = null;
    this._recharge = null; this._dragonT = 0; this._autoReviveCd = 0; this._pasT = 0;
    /* [P2] 被动的战场状态同样清零（剑魄记账 / 计时器 / 护身符） */
    s.rageSpent = 0;
    this.undyingCd = 0; this.stormT = 6; this.talismanT = 10; this.elixirT = 60; this.phoenixKeyT = 0;
    this.talismanCharges = 0;
    this.recalc();
    this.loadMap('village');
    UI.toast('于桃源村重生');
    this.save();
  },

  /* ---------------- 敌人 ---------------- */
  updateEnemies(dt) {
    const pp = new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z);
    let aggroBoss = null;
    for (const e of this.enemies) {
      if (e.dead) {
        e.deadT = (e.deadT || 0) + dt;
        updateActorAnim(e.actor, dt);
        e.actor.group.position.x = e.pos.x;
        e.actor.group.position.z = e.pos.z;
        continue;
      }
      const a = e.actor;
      a.time = (a.time || 0) + dt;

      if (e.bar) {
        const cp = this.camera.position;
        const bd = Math.hypot(a.group.position.x - cp.x, a.group.position.y + 2 - cp.y, a.group.position.z - cp.z);
        e.bar.group.visible = bd < 36;
        // 传入相机：血条组需要每帧校正到世界空间正对相机，否则怪物转身会把填充条甩开
        updateHpBar(e.bar, e.hp / e.maxHp, bd, this.camera);
      }

      /* [v1.12.1] 眩晕 / 未激活的首领会 continue 跳过循环末尾的 collideWorld，
       * 万一前一帧被推到边界外就再也夹不回来了（越界计数会一直涨）。
       * 这两个早退分支各补一次边界夹取。 */
      if (e.stun > 0) {
        e.stun -= dt; a.moving = false; updateActorAnim(a, dt);
        this.collideWorld(e.pos, e.radius * 0.7, null, true);
        continue;
      }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      /* [P2] 技能树分支挂上的 debuff 计时：易伤 / 破甲 / 禁疗 */
      if (e.vulnT > 0) e.vulnT = Math.max(0, e.vulnT - dt);
      if (e.shredT > 0) e.shredT = Math.max(0, e.shredT - dt);
      if (e.antiHealT > 0) e.antiHealT = Math.max(0, e.antiHealT - dt);
      /* [S4] 蚀骨印记（毒雾留下的增伤窗口） */
      if (e.venomT > 0) e.venomT = Math.max(0, e.venomT - dt);
      /* [P3] 三个「动 AI」的状态（结算在下面的普怪 AI 段）：
       *   aspdT / aspdMul  攻速压制：atkCd 倒数放慢
       *   fearT            恐惧：掉头逃、不挥刀
       *   tauntT / tauntPt 嘲讽：改打灵兽（这几秒玩家不挨打） */
      if (e.aspdT > 0) { e.aspdT = Math.max(0, e.aspdT - dt); if (e.aspdT <= 0) e.aspdMul = 0; }
      if (e.fearT > 0) e.fearT = Math.max(0, e.fearT - dt);
      if (e.tauntT > 0) {
        e.tauntT = Math.max(0, e.tauntT - dt);
        if (e.tauntT <= 0) { e.tauntPt = null; e.tauntAlly = null; }
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonTick = (e.poisonTick || 0) - dt;
        if (e.poisonTick <= 0) { e.poisonTick = 0.9; this.damageEnemy(e, e.poisonDmg, false, { silent: true }); }
      }
      /* [C1] 技能变体留下的流血 / 灼烧：每秒一跳，与中毒分开结算 */
      if (e.dotT > 0) {
        e.dotT -= dt;
        e.dotTick = (e.dotTick || 0) - dt;
        if (e.dotTick <= 0) {
          e.dotTick = 1;
          this.damageEnemy(e, e.dotDmg, false, { silent: true, elem: e.dotElem || undefined, tag: 'dot' });
        }
        if (e.dotT <= 0) { e.dotT = 0; e.dotDmg = 0; e.dotElem = null; }
      }

      const d = DIST2D(e.pos, pp);
      /* [S16] 没仇恨的怪偶尔叫一声（每只 6~12 秒一次，15 米内才发）。
       * 这是「地图有生气」的主要来源 —— 走过林子能听见东西在动。 */
      if (!e.aggro && !e.boss && typeof AudioSys !== 'undefined') AudioSys.mobIdle(e, dt);
      /* [v1.0.5] 远处的怪只跑 AI、不参与渲染。
       * 一只怪 17~19 个 draw call（模型 + 武器 + 血条 + 阴影），
       * 隐掉二十只等于白捡三百多个 call，而 AI 本身几乎不花钱。 */
      const culled = d > MOB_CULL_DIST;
      if (culled !== !!e.culled) {
        e.culled = culled;
        a.group.visible = !culled;
      }
      /* [v1.0.6] 阴影投影距离裁剪。
       * 实测 36 只怪时 shadow pass 是 1099 个 draw call，其中 792 个来自怪物自身的
       * 22 个部件——也就是说「怪物投不投影」比「怪物画不画」还贵。
       * 但 20 格外的怪影子在屏幕上只有几个像素，去掉完全看不出来。
       * 只在跨越阈值的那一帧遍历一次，平时零成本（不要每帧 traverse）。 */
      const wantShadow = e.boss ? true : (d < MOB_SHADOW_DIST);
      /* 注意这里必须显式判 undefined：写成 `wantShadow !== !!e.shadowOn` 的话，
       * 新怪 shadowOn 是 undefined，!!undefined === false，而 wantShadow 恰好也是 false，
       * 条件不成立 → 遍历永不执行 → 远处的怪一直开着投影（这个 bug 就是这么来的）。 */
      if (e.shadowOn === undefined || e.shadowOn !== wantShadow) {
        e.shadowOn = wantShadow;
        a.group.traverse(o => { if (o.isMesh) o.castShadow = wantShadow; });
      }
      const spd = e.spd * (1 - e.slow) * (e.boss ? (1 + e.phase * 0.12) : 1);

      if (e.boss && !e.active) {
        if (d < 17) {
          e.active = true;
          this.boss = e;
          UI.updateBoss(e);
          UI.toast(e.cfg.name + '　' + (e.cfg.title || ''), 'lv');
          SFX.boss();
          this.shake = 0.5;
          UI.log('【' + e.cfg.name + '】' + PICK(e.cfg.lines || ['……']), 'bad');
        }
      }

      if (e.boss && !e.active) {
        a.moving = false;
        updateActorAnim(a, dt);
        this.collideWorld(e.pos, e.radius * 0.7, null, true);
        continue;
      }
      /* [P3] 被嘲讽的怪改打灵兽：目标点换成嘲讽点，其它逻辑原样走。
       * [P2b·兽群] 灵兽有血之后，这一刀会真的扣在它身上（见 mobMeleeSwing）——
       * 以前只是「玩家这几秒不掉血」，现在是「它替你挨」。 */
      const tg = (e.tauntT > 0 && e.tauntPt) ? e.tauntPt : pp;
      const dtg = DIST2D(e.pos, tg);
      if (e.boss) { this.updateBossAI(e, dt, d, pp); }
      else if (e.fearT > 0) {
        /* [P3] 恐惧：往远离玩家的方向跑，这几帧不挥刀也不放技能。
         * 不做寻路 —— 恐惧只有 1 秒，绕地形反而会卡在墙角原地抖。 */
        const fx = e.pos.x - pp.x, fz = e.pos.z - pp.z;
        const fd = Math.hypot(fx, fz) || 1;
        this.moveEnemy(e, { x: e.pos.x + fx / fd * 6, z: e.pos.z + fz / fd * 6 }, spd * 1.25, dt);
        a.group.rotation.y = Math.atan2(fx, fz);
        if (e.ai) e.ai.cd = Math.max(e.ai.cd || 0, 0.3);
      }      else {
        // 普怪 AI（[DIFF] 索敌半径按难度缩放，极难更远，容易被围）
        if (e.tauntT > 0) e.aggro = true;
        /* [v1.12.1] 索敌：半径从写死的 26 米收到 BALANCE.aggro.aggroR（13 米），
         * 再乘难度倍率；落地保护期内完全不索敌。
         * 原来 26 米 = 玩家视野的两倍，传送一落地四周的怪全冲过来。 */
        if (e.aggro || (this.aggroGrace <= 0 && dtg < AGGRO_R * this.diff().aggro)) {
          if (!e.aggro) {
            /* [C2] 刚被惊动的这一帧：主动技能错开冷却，否则同一批怪会同时开技能 */
            e.aggro = true;
            if (e.ai) e.ai.cd = RND(0.5, 2.2);
            /* [S16] 进战叫声。同族 80ms 去重，所以狼群围上来听起来是一声，不是四声 */
            if (typeof AudioSys !== 'undefined') AudioSys.mob(e, 'aggro');
          }
          /* [C2] 先跑行为原型。返回 true 表示这一帧归原型管；
           * 返回 false（近战 / 远程 / 逃逸的常态）就落回下面的基础逻辑。 */
          /* [M12] 跨区寻路：怪和玩家不在同一块区域时，直线过去只会撞墙。
           * steer 换成「通往下一区域的那道门」，跨过去之后 zoneAt 变了就自动重规划。
           * 攻击判定仍然用 dtg（到真实目标的距离），所以隔着门不会隔墙砍人。 */
          const door = (typeof zoneSteer === 'function' && !e.boss)
            ? zoneSteer(this.state.mapId, e.pos.x, e.pos.z, tg.x, tg.z) : null;
          const steer = door || tg;
          const took = this.mobAI(e, dt, dtg, steer, spd);
          if (!took) {
            if (e.cfg.ranged) {
              /* door 非空 = 隔着墙，这一帧只走路不射击（远程怪隔着墙点人比卡墙更离谱） */
              if (door || dtg > e.range * 0.85) this.moveEnemy(e, steer, spd, dt);
              else if (dtg < e.range * 0.45) this.moveEnemy(e, steer, -spd * 0.6, dt);
              else {
                a.moving = false;
                if (e.atkCd <= 0) this.enemyRangedAttack(e);
              }
            } else {
              if (door || dtg > e.reach * 0.85) this.moveEnemy(e, steer, spd, dt);
              else {
                a.moving = false;
                this.mobMeleeSwing(e, dt, tg);
              }
            }
          }
          // 面向目标（被嘲讽时面向灵兽；跨区时面向门）
          const fa = door || tg;
          const ang = Math.atan2(fa.x - e.pos.x, fa.z - e.pos.z);
          a.group.rotation.y = this.lerpAngle(a.group.rotation.y, ang, 1 - Math.pow(0.001, dt));
        } else {
          /* [v1.12.1] 未仇恨：慢慢走回自己的出生点。
           * 不这么做的话，玩家绕一圈回来会发现怪全堆在入口 —— 因为旧的
           * 26 米索敌半径会让半张图的怪一起追过来，脱战后它们就原地待着。 */
          let walked = false;
          if (e.home && !e.boss) {
            const hd = Math.hypot(e.home.x - e.pos.x, e.home.z - e.pos.z);
            if (hd > 2.5) { this.moveEnemy(e, e.home, spd * HOME_WALK, dt); walked = true; }
          }
          if (!walked) a.moving = false;
        }
      }

      /* [v1.12.1] 脱战：离得太远且持续一段时间就放弃追击。
       * 判定放在 AI 之后、分离之前 —— 这一帧先按「已仇恨」跑完，下一帧才真正脱战，
       * 避免刚越过阈值就来回横跳。 */
      if (e.aggro && !e.boss) {
        if (d > DEAGGRO_R) {
          e.deaggroT = (e.deaggroT || 0) + dt;
          if (e.deaggroT >= DEAGGRO_T) { e.aggro = false; e.deaggroT = 0; }
        } else e.deaggroT = 0;
      }

      // 分离
      for (const o of this.enemies) {
        if (o === e || o.dead) continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
        const dd = Math.hypot(dx, dz), min = e.radius + o.radius;
        if (dd < min && dd > 0.001) {
          e.pos.x += dx / dd * (min - dd) * 0.5;
          e.pos.z += dz / dd * (min - dd) * 0.5;
        }
      }
      // 与玩家分离
      const dxp = e.pos.x - pp.x, dzp = e.pos.z - pp.z;
      const dp = Math.hypot(dxp, dzp), minp = e.radius + 0.55;
      if (dp < minp && dp > 0.001) {
        e.pos.x = pp.x + dxp / dp * minp;
        e.pos.z = pp.z + dzp / dp * minp;
      }
      this.collideWorld(e.pos, e.radius * 0.7, (e.actor.moving && e._mv) ? e._mv : null, true);

      /* [P3] 攻速压制：atkCd 倒数按倍率放慢 ≡ 攻速 −N%。
       * 写在这里而不是改 atkCdBase，是因为 atkCdBase 会被狂暴词缀写回，
       * 两边各乘一次就会叠加成「压两次」。 */
      e.atkCd = Math.max(0, e.atkCd - dt * (e.aspdT > 0 ? 1 - (e.aspdMul || 0) : 1));
      /* [S5] 精英词缀的每帧维护：护盾回充 + 狂暴触发。
       * 只对有词缀的怪跑，普通怪连这个 if 都不会进。 */
      if (e.aff) {
        if (e.aff.shield) {
          e.shieldCd = Math.max(0, (e.shieldCd || 0) - dt);
          if (e.shieldCd <= 0 && (e.shield || 0) <= 0) {
            e.shield = e.maxHp * e.aff.shield.pct / 100;
            e.shieldCd = e.aff.shield.cd;
            FX.ring(e.pos, 1.7, 0x8fd0ff, 0.5, 0.2);
          }
        }
        if (e.aff.berserk && !e.berserkOn && e.hp / e.maxHp < e.aff.berserk.hpLine) {
          e.berserkOn = true;
          e.dmg *= e.aff.berserk.dmgMul;
          e.atkCdBase = (e.atkCdBase || e.cfg.atkCd || 1.8) * e.aff.berserk.cdMul;
          FX.ring(e.pos, 2.6, 0xff4a3a, 0.6, 0.26);
          FX.text(new THREE.Vector3(e.pos.x, 2.4, e.pos.z), '狂暴', 'info', { life: 0.9 });
        }
      }
      a.group.position.x = e.pos.x;
      a.group.position.z = e.pos.z;
      if (!a.fly) a.group.position.y = 0;
      if (e.eliteRing) e.eliteRing.rotation.z += dt;
      if (e.bossAura) { e.bossAura.rotation.z += dt * 0.8; e.bossAura.material.opacity = 0.28 + Math.sin(this.time * 3) * 0.12; }
      updateActorAnim(a, dt);
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
    }
    this.enemies = this.enemies.filter(e => {
      if (e.dead && (e.deadT || 0) >= 3) {
        // 整棵子树（模型 + 武器 + 血条）一起释放，共享缓存的几何体由 disposeTree 自动跳过
        disposeTree(e.actor.group);
        if (e.bar) { e.bar.fill.material.dispose(); e.bar.bg.material.dispose(); }
        return false;
      }
      return true;
    });
    /* [S5] 分裂幼体在帧末统一生成（见 onEnemyDeath 里的说明） */
    this.flushSplit();
  },

  /* [S5] 把「分裂」队列落地。幼体不带词缀（splitChild 标记），
   * 否则一只分裂怪能滚成雪球，几秒就铺满整张图。 */
  flushSplit() {
    const q = this._splitQ;
    if (!q || !q.length) return;
    this._splitQ = [];
    for (const s of q) {
      const m = this.spawnEnemy(s.kind, s.x, s.z, false, s.level);
      if (!m) continue;
      m.splitChild = true;
      m.hp = m.maxHp = s.hp;
      m.aggro = true;
      m.dmg *= 0.7;
    }
  },

  /* ============================================================
   * [C2] 怪物 AI 状态机
   *
   * 分工：
   *   本方法只负责「这一帧由谁驱动」的分派；
   *   每个原型一个 aiXxx 方法，返回 true = 本帧已接管，false = 落回基础逻辑。
   *   基础逻辑（贴脸砍 / 站桩射）仍留在 updateEnemies 里，这样 melee / ranged
   *   走的是原来那条被 40 只怪验证过的路径，不会因为加状态机而全体变味。
   *
   * 状态机本身很薄：state + t + cd 三个数。刻意不做行为树 / 黑板那一套 ——
   * 怪物只需要「现在该干什么」，复杂状态机在 60fps × 40 只下只会多出 bug。
   * ============================================================ */
  mobAI(e, dt, d, pp, spd) {
    const ai = e.ai;
    if (!ai) return false;
    ai.t += dt;
    switch (ai.kind) {
      case 'flank': return this.aiFlank(e, dt, d, pp, spd);
      case 'kite': return this.aiKite(e, dt, d, pp, spd);
      case 'bomber': return this.aiBomber(e, dt, d, pp);
      case 'healer': return this.aiHealer(e, dt, d, pp);
      case 'summoner': return this.aiSummoner(e, dt, d, pp);
      case 'coward': return this.aiCoward(e, dt, d, pp, spd);
      default: return false;
    }
  },

  /* 近战抬手 + 命中判定。
   * 从原来的内联代码抽出来：包夹 / 逃逸 / 自爆被打断后都要能正常挥刀。 */
  mobMeleeSwing(e, dt, pp) {
    const a = e.actor;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0 && DIST2D(e.pos, pp) < e.reach + 1.4) {
        /* [P2b·兽群] 被嘲讽的怪这一刀落在灵兽身上 —— 现在是**真的扣血**。
         * 以前灵兽没有血，这里只放一簇火花，于是「群嘲」等于「怪白打几秒」；
         * 现在灵兽会替你把这一刀吃下去，也可能因此死掉。 */
        if (e.tauntT > 0 && e.tauntPt) {
          const al = e.tauntAlly || this.allyNear(e.tauntPt, 6);
          if (al) this.damageAlly(al, e.dmg * RND(0.9, 1.1), e);
          else FX.spark(new THREE.Vector3(e.tauntPt.x, 1.2, e.tauntPt.z), 0xffd8a0, 7);
        } else {
          this.damagePlayer(e.dmg * RND(0.9, 1.1), e);
          if (e.cfg.poison) this.playerPoison(e.dmg * 0.15);
        }
      }
    } else if (e.atkCd <= 0) {
      e.atkCd = e.atkCdBase || e.cfg.atkCd || 1.8;
      e.windup = 0.34;
      a.atkAnim = 1; a.atkType = 'swing'; a.atkSpeed = 2.8;
      /* [S16] 换成该族自己的挥击声（以前所有怪共用一声 SFX.swing） */
      if (typeof AudioSys !== 'undefined') AudioSys.mob(e, 'attack'); else SFX.swing();
    }
  },

  /* ---------------- 包夹（flank） ----------------
   * 每只分配到玩家周围的一个方位角，朝「自己那个方位上的点」走，
   * 于是狼群不会挤成一条线，而是从四面合拢。
   * 方位角只在第一次 aggro 时算一次（见 pickFlankAngle），之后不再变 ——
   * 每帧重算会让它们在玩家身周抖成一团。 */
  aiFlank(e, dt, d, pp, spd) {
    const T = MOB_AI_TUNE.flank;
    const ai = e.ai;
    if (ai.slotAng == null) ai.slotAng = this.pickFlankAngle(e);
    /* 已经贴到身上：正常挥刀 */
    if (d <= e.reach * 1.02) {
      e.actor.moving = false;
      this.mobMeleeSwing(e, dt, pp);
      return true;
    }
    const tx = pp.x + Math.cos(ai.slotAng) * e.reach * T.slotR;
    const tz = pp.z + Math.sin(ai.slotAng) * e.reach * T.slotR;
    const toSlot = Math.hypot(tx - e.pos.x, tz - e.pos.z);
    /* 卡住检测：包夹怪被地形挡住时放弃绕位，直接压上去。
     * 绕不到侧面只是战术退化，站在树后发呆才是真的坏掉。 */
    if (ai.px !== undefined) {
      const moved = Math.hypot(e.pos.x - ai.px, e.pos.z - ai.pz);
      if (spd * dt > 0.0005 && moved < spd * dt * 0.28) ai.stuck = (ai.stuck || 0) + dt;
      else ai.stuck = 0;
    }
    ai.px = e.pos.x; ai.pz = e.pos.z;
    if (ai.stuck > 0.8) {
      ai.stuck = 0;
      this.moveEnemy(e, pp, spd, dt);
      return true;
    }
    if (toSlot > T.arrive) {
      /* 走位途中掺一点横向分量：看起来像在绕侧翼，而不是笔直冲 */
      const base = Math.atan2(tz - e.pos.z, tx - e.pos.x);
      const wob = Math.sin((ai.t + e.pos.x) * 1.7) * T.lateral;
      this.moveEnemy(e,
        { x: e.pos.x + Math.cos(base + wob) * 4, z: e.pos.z + Math.sin(base + wob) * 4 },
        spd, dt);
    } else {
      /* 到位了但玩家跑开了：不再绕，直接追 */
      this.moveEnemy(e, pp, spd, dt);
    }
    return true;
  },

  /* 给包夹怪挑一个方位角：优先选「离已有包夹位最远」的方向。
   * 8 个候选里取间隙最大的那个，5 只狼就能自然散成扇形。 */
  pickFlankAngle(e) {
    const taken = [];
    for (const o of this.enemies) {
      if (o === e || o.dead || !o.ai || o.ai.kind !== 'flank') continue;
      if (o.ai.slotAng == null) continue;
      taken.push(o.ai.slotAng);
    }
    if (!taken.length) return Math.random() * Math.PI * 2;
    let best = 0, bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const cand = i / 8 * Math.PI * 2;
      let gap = 99;
      for (const t of taken) {
        /* 环形角差：把差值折到 [-π, π] 再取绝对值 */
        const df = Math.abs(((cand - t + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (df < gap) gap = df;
      }
      if (gap > bestGap) { bestGap = gap; best = cand; }
    }
    /* 加一点抖动，同角度的两只不会完全重叠（±0.12，不破坏 0.785 的候选间隔） */
    return best + RND(-0.12, 0.12);
  },

  /* ---------------- 风筝（kite） ----------------
   * 三条距离带：太近后退、太远前进、刚好就沿切线绕圈。
   * 绕圈是关键 —— 只后退不绕的远程怪，玩家走直线就能贴上去；
   * 横移让它一直在你侧面，必须用位移技或者把它逼到墙角。 */
  aiKite(e, dt, d, pp, spd) {
    const T = MOB_AI_TUNE.kite;
    const ai = e.ai;
    if (!ai.orbitDir) ai.orbitDir = Math.random() < 0.5 ? -1 : 1;
    /* 撞地形检测：切向绕行被树 / 石头挡住时立刻反向。
     * 没有这段，远程怪会贴着一棵树磨上十几秒 —— 玩家看来就是「AI 卡住了」。
     * 判据是「上一帧想走多远 vs 实际走了多远」，碰撞修正发生在 AI 之后，
     * 所以下一帧读到的位移已经含了 collideWorld 的结果。 */
    if (ai.px !== undefined) {
      const moved = Math.hypot(e.pos.x - ai.px, e.pos.z - ai.pz);
      const want = spd * T.orbit * dt;
      if (want > 0.0005 && moved < want * 0.28) ai.stuck = (ai.stuck || 0) + dt;
      else ai.stuck = 0;
      if (ai.stuck > 0.5) {
        ai.orbitDir = -ai.orbitDir;
        ai.stuck = 0;
        ai.pauseT = 0;
      }
    }
    ai.px = e.pos.x; ai.pz = e.pos.z;
    /* 射击前的站定：一边跑一边射会显得没有威胁感，也给玩家一个「它要开火了」的信号 */
    if (ai.pauseT > 0) {
      ai.pauseT -= dt;
      e.actor.moving = false;
      if (ai.pauseT <= 0 && e.atkCd <= 0) this.enemyRangedAttack(e);
      return true;
    }
    if (d < e.range * T.near) {
      this.moveEnemy(e, pp, -spd * 0.85, dt);           // 太近：后撤
    } else if (d > e.range * T.far) {
      this.moveEnemy(e, pp, spd, dt);                    // 太远：压上
    } else {
      const ang = Math.atan2(e.pos.z - pp.z, e.pos.x - pp.x);
      const tang = ang + ai.orbitDir * Math.PI / 2;
      this.moveEnemy(e,
        { x: e.pos.x + Math.cos(tang) * 4, z: e.pos.z + Math.sin(tang) * 4 },
        spd * T.orbit, dt);
    }
    if (d <= e.range && e.atkCd <= 0) ai.pauseT = T.pause;
    return true;
  },

  /* ---------------- 自爆（bomber） ----------------
   * chase → fuse（1 秒引信，身上闪红）→ boom。
   * 引信期间玩家跑出 breakAway 就取消，给「后撤就能化解」的解法。
   * 被打死也会炸，但只有 70% 威力（见 onEnemyDeath）—— 惩罚拖延，不惩罚补刀。 */
  aiBomber(e, dt, d, pp) {
    const T = MOB_AI_TUNE.bomber;
    const ai = e.ai;
    if (ai.state === 'fuse') {
      ai.fuseT -= dt;
      e.actor.moving = false;
      /* 引信闪烁：hitFlash 是既有的受击闪白通道，这里借它当警戒灯 */
      e.hitFlash = Math.max(e.hitFlash, 0.9);
      if (d > T.breakAway) {
        ai.state = 'chase'; ai.fuseT = 0;
        FX.ring(e.pos, 1.4, 0xffaa66, 0.3, 0.15);
      } else if (ai.fuseT <= 0) {
        this.mobExplode(e, true);
      }
      return true;
    }
    if (d < T.radius * 0.85) {
      ai.state = 'fuse'; ai.fuseT = T.fuse;
      FX.ring(e.pos, T.radius, 0xff5522, T.fuse, 0.28);
      FX.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), '引爆', 'bad', { life: 0.9 });
      SFX.cast();
      return true;
    }
    /* 冲锋：比常态快三成，逼玩家必须主动处理 */
    this.moveEnemy(e, pp, e.spd * T.rushMul, dt);
    return true;
  },

  /* 实际爆炸。kill=false 表示是被打死的副爆炸（威力打折） */
  mobExplode(e, byFuse) {
    const T = MOB_AI_TUNE.bomber;
    const ai = e.ai;
    if (ai.exploded) return;
    ai.exploded = true;
    const mul = byFuse ? T.dmgMul : T.deathDmgMul;
    const R = byFuse ? T.radius : T.radius * 0.8;
    const pp = new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z);
    FX.flashCircle(e.pos, R, 0xff6633, 0.4);
    FX.burst(new THREE.Vector3(e.pos.x, 0.6, e.pos.z), 0xff8844, byFuse ? 26 : 16,
      { speed: byFuse ? 9 : 6, size: 0.18, life: 0.55, gravity: 3, additive: true });
    FX.ring(e.pos, R, 0xff5522, 0.5, 0.3);
    SFX.explode();
    this.shake = Math.max(this.shake, byFuse ? 0.45 : 0.25);
    if (DIST2D(e.pos, pp) < R) this.damagePlayer(e.dmg * mul, e);
    if (!e.dead) this.onEnemyDeath(e);
  },

  /* ---------------- 治疗（healer） ----------------
   * 6.5 秒一次，先找血量最低的同伴；自己跌破 45% 时优先治自己。
   * 施法 0.5 秒站着不动 —— 这是给玩家的窗口：看到绿圈就知道该转火。 */
  aiHealer(e, dt, d, pp) {
    const T = MOB_AI_TUNE.healer;
    const ai = e.ai;
    if (ai.state === 'cast') {
      ai.castT -= dt;
      e.actor.moving = false;
      if (ai.castT <= 0) {
        ai.state = 'idle';
        this.mobHeal(e);
        ai.cd = T.cd;
      }
      return true;
    }
    ai.cd = Math.max(0, ai.cd - dt);
    if (ai.cd <= 0) {
      const tgt = this.findHealTarget(e);
      if (tgt) {
        ai.state = 'cast'; ai.castT = T.cast; ai.target = tgt.id;
        FX.ring(e.pos, 3, 0x66d08a, T.cast, 0.2);
        return true;
      }
      ai.cd = 1.5;      // 场上没人受伤，1.5 秒后再看
    }
    /* 不治疗的时候照旧远程输出（治疗者本身也都是远程怪） */
    if (e.cfg.ranged) {
      if (d > e.range * 0.85) this.moveEnemy(e, pp, e.spd, dt);
      else { e.actor.moving = false; if (e.atkCd <= 0) this.enemyRangedAttack(e); }
      return true;
    }
    return false;
  },

  /* 挑治疗目标：满血的不治；自己血少时优先自己 */
  findHealTarget(e) {
    const T = MOB_AI_TUNE.healer;
    const selfHpr = e.hp / e.maxHp;
    if (selfHpr < T.selfAt) return e;
    let best = null, bestHpr = 0.75;
    for (const o of this.enemies) {
      if (o.dead || o === e) continue;
      if (DIST2D(o.pos, e.pos) > T.radius) continue;
      const h = o.hp / o.maxHp;
      if (h < bestHpr) { bestHpr = h; best = o; }
    }
    return best;
  },

  mobHeal(e) {
    const T = MOB_AI_TUNE.healer;
    let tgt = null;
    if (e.ai.target === e.id) tgt = e;
    else {
      for (const o of this.enemies) if (!o.dead && o.id === e.ai.target) { tgt = o; break; }
    }
    if (!tgt || tgt.dead) return;
    const amt = Math.round(tgt.maxHp * T.healPct / 100);
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
    FX.ring(tgt.pos, 1.7, 0x66d08a, 0.5, 0.18);
    FX.text(new THREE.Vector3(tgt.pos.x, 2.1, tgt.pos.z), '+' + amt, 'info', { life: 0.8 });
  },

  /* ---------------- 召唤（summoner） ----------------
   * 9.5 秒一次，身边 15 格内普通怪不到 SUMMON_CAP 才唤。
   * 本体不追人（蛛巢就是杵在原地的卵囊），但会照常近战反击。
   * 复用 SUMMON_CAP：Boss 召唤早就在用这道闸，否则持久战能把场景塞满。 */
  aiSummoner(e, dt, d, pp) {
    const T = MOB_AI_TUNE.summoner;
    const ai = e.ai;
    if (ai.state === 'cast') {
      ai.castT -= dt;
      e.actor.moving = false;
      if (ai.castT <= 0) {
        ai.state = 'idle';
        this.mobSummon(e);
        ai.cd = T.cd;
      }
      return true;
    }
    ai.cd = Math.max(0, ai.cd - dt);
    if (ai.cd <= 0) {
      let near = 0;
      for (const o of this.enemies) {
        if (o.dead || o.boss || o === e) continue;
        if (DIST2D(o.pos, e.pos) < T.near) near++;
      }
      if (near < SUMMON_CAP) {
        ai.state = 'cast'; ai.castT = T.cast;
        FX.ring(e.pos, 2.6, 0xc08ad8, T.cast, 0.24);
        return true;
      }
      ai.cd = 3;
    }
    /* 本体不动，但玩家走进攻击距离还是要挨打 */
    e.actor.moving = false;
    if (d <= e.reach * 1.05) this.mobMeleeSwing(e, dt, pp);
    return true;
  },

  mobSummon(e) {
    const T = MOB_AI_TUNE.summoner;
    const pool = (MAPS[this.state.mapId] && MAPS[this.state.mapId].spawns) || [];
    /* 安全区没有怪池（spawns 为空），退回血蝠兜底 —— 否则 PICK 返回 undefined，
     * spawnEnemy 拿到 undefined kind 直接 null，召唤者会空转 */
    const kind = pool.length ? PICK(pool) : 'bat';
    let made = 0;
    for (let i = 0; i < T.count; i++) {
      const ang = Math.random() * 6.28, r = 2.2 + Math.random() * 1.4;
      const m = this.spawnEnemy(kind, e.pos.x + Math.cos(ang) * r, e.pos.z + Math.sin(ang) * r,
        false, Math.max(1, e.level - T.levelDrop));
      if (m) { FX.flashCircle(m.pos, 1.5, 0xc08ad8, 0.35); m.aggro = true; made++; }
    }
    FX.ring(e.pos, 3.4, 0xc08ad8, 0.5, 0.22);
    if (!made) { e.ai.cd = 4; return; }
  },

  /* ---------------- 逃逸（coward） ----------------
   * 血量跌破三成 → 后撤 4 秒，期间每秒回 4.5%，回到 55% 或者时间到就回来。
   * 只对「赢不了但能耗」的怪有意义：狐狸、鹤妖、玉傀。
   * 刻意让它跑不快（1.2 倍速）—— 追不上玩家就没法补刀，那是挫败感不是挑战。 */
  aiCoward(e, dt, d, pp, spd) {
    const T = MOB_AI_TUNE.coward;
    const ai = e.ai;
    const hpr = e.hp / e.maxHp;
    if (ai.state === 'flee') {
      ai.fleeT -= dt;
      this.moveEnemy(e, pp, -spd * T.spdMul, dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * T.regenPct / 100 * dt);
      if (Math.random() < dt * 2.5) {
        FX.text(new THREE.Vector3(e.pos.x, 1.9, e.pos.z), '+', 'info', { life: 0.5 });
      }
      if (ai.fleeT <= 0 || hpr >= T.back) {
        ai.state = 'idle';
        ai.cd = T.cd;
        FX.ring(e.pos, 1.6, 0xd8c060, 0.35, 0.16);
      }
      return true;
    }
    ai.cd = Math.max(0, ai.cd - dt);
    if (ai.cd <= 0 && hpr < T.at) {
      ai.state = 'flee'; ai.fleeT = T.fleeT;
      FX.ring(e.pos, 2.2, 0xd8c060, 0.4, 0.2);
      FX.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), '遁走', 'info', { life: 0.9 });
      return true;
    }
    return false;   // 常态照旧走基础近战 / 远程
  },

  moveEnemy(e, target, spd, dt) {
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    e.pos.x += dx / d * spd * dt;
    e.pos.z += dz / d * spd * dt;
    e.actor.moving = true;
    /* [M12] 记下这一帧的移动方向，给 collideWorld 的切线滑动用 */
    e._mv = { x: dx / d, z: dz / d };
  },

  enemyRangedAttack(e) {
    e.atkCd = e.cfg.atkCd || 2;
    e.actor.atkAnim = 1; e.actor.atkType = 'cast';
    if (typeof AudioSys !== 'undefined') AudioSys.mob(e, 'attack'); else SFX.cast();
    const taunted = (e.tauntT > 0 && e.tauntPt);
    const from = new THREE.Vector3(e.pos.x, 1.3, e.pos.z);
    const to = taunted
      ? new THREE.Vector3(e.tauntPt.x, 1.1, e.tauntPt.z)
      : new THREE.Vector3(this.playerGroup.position.x, 1.1, this.playerGroup.position.z);
    const dir = to.clone().sub(from).normalize();
    const proj = e.cfg.proj || { color: 0xcccccc, speed: 14 };
    FX.projectile({
      pos: from, dir, speed: proj.speed, color: proj.color, radius: 0.24, team: 'enemy',
      dmg: e.dmg, life: 2.4, elem: e.cfg.poison ? 'poison' : null,
      onHit: (target, p) => {
        /* [P3] 被嘲讽时这一发是射向灵兽的：即便飞行途中扫到玩家判定圈，
         * 也不结算到玩家身上。
         * [P2b·兽群] 但它现在会真的扣灵兽的血 —— 以前是「直接 return」，
         * 那等于嘲讽让这一箭凭空消失。 */
        FX.burst(p.pos.clone(), proj.color, 8, { speed: 4, size: 0.08, life: 0.3, additive: true });
        if (taunted) {
          const al = e.tauntAlly || this.allyNear(e.tauntPt, 5);
          if (al) this.damageAlly(al, p.dmg, e);
          return;
        }
        this.damagePlayer(p.dmg, e);
        if (e.cfg.poison) this.playerPoison(e.dmg * 0.12);
      }
    });
  },

  /* [P2b] 免控判定：身上有没有带 ccImmune 标记的增益（血怒位 Lv10 台阶）。
   * 与 ccResist 是两回事 —— ccResist 只把时长按 CLAMP(60) 缩短，
   * 打到身上还是会中；这个是**根本挂不上**。 */
  ccImmuneNow() {
    if (!this.buffs) return false;
    for (const b of this.buffs) if (b.ccImmune) return true;
    return false;
  },

  /* [P2b] 玩家侧减速的唯一施加口。三处 boss / 精英技能原本各写各的
   * （0.5 / 2.5 秒等字面量），免控要拦就得三处都改 —— 收成一个口，
   * 漏一处的代价是「免控在冰霜面前无效」，而这恰好是最常见的那一种控制。 */
  applyPlayerSlow(amount, dur) {
    if (this.ccImmuneNow()) {
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.7, this.playerGroup.position.z),
        '免疫', 'info', { life: 0.7 });
      return false;
    }
    /* [S1] 控制抗性同时缩短减速持续时间 */
    const k = 1 - CLAMP(this.state.stats.ccResist || 0, 0, 60) / 100;
    this.playerSlow = Math.max(this.playerSlow || 0, amount);
    this.playerSlowT = Math.max(this.playerSlowT || 0, dur * k);
    return true;
  },

  playerPoison(dps) {
    if (this.ccImmuneNow()) {
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.7, this.playerGroup.position.z),
        '免疫', 'info', { life: 0.7 });
      return;
    }
    /* [S1] 控制抗性同时缩短中毒持续时间 */
    this.poisonT = 4 * (1 - CLAMP(this.state.stats.ccResist || 0, 0, 60) / 100);
    this.poisonDps = dps;
  },

  updateBossAI(e, dt, d, pp) {
    if (e.dead) return;
    const a = e.actor;
    const hpRatio = e.hp / e.maxHp;
    /* [DIFF] 困难/极难：Boss 提前进阶段（75% / 45%），压迫感更强 */
    const rush = this.diff().bossRush;
    const newPhase = rush
      ? (hpRatio < 0.45 ? 2 : (hpRatio < 0.75 ? 1 : 0))
      : (hpRatio < 0.3 ? 2 : (hpRatio < 0.6 ? 1 : 0));
    if (newPhase > e.phase) {
      e.phase = newPhase;
      UI.toast(e.cfg.name + ' 狂怒', 'lv');
      SFX.boss(); this.shake = 0.6;
      if (typeof AudioSys !== 'undefined') AudioSys.mob(e, 'bossPhase');
      FX.ring(e.pos, 6, 0xff5522, 0.8, 0.3);
      e.dmg *= 1.15;
    }

    e.patternCd -= dt;
    e.atkCd = Math.max(0, e.atkCd - dt);

    // 移动
    if (e.windup > 0) {
      e.windup -= dt;
      a.moving = false;
      if (e.windup <= 0 && e.pendingMelee) {
        e.pendingMelee = false;
        if (DIST2D(e.pos, pp) < e.reach + 2.2) this.damagePlayer(e.dmg * RND(0.9, 1.2), e);
      }
    } else if (e.charging > 0) {
      e.charging -= dt;
      const dir = e.chargeDir;
      e.pos.x += dir.x * 22 * dt; e.pos.z += dir.z * 22 * dt;
      a.moving = true;
      if (DIST2D(e.pos, pp) < e.radius + 1.6 && !e.chargeHit) {
        e.chargeHit = true;
        this.damagePlayer(e.dmg * 1.3, e);
        this.shake = 0.5;
      }
      FX.burst(new THREE.Vector3(e.pos.x, 0.6, e.pos.z), 0xaa8866, 4, { speed: 3, size: 0.14, life: 0.4, gravity: 4 });
    } else if (d > e.reach * 0.8) {
      /* [M12] 拴绳：玩家不在首领所在的区域时，首领走回自己的锚点。
       * 不这么做的话它会一直朝玩家直线走，撞在祭坛的墙上磨 —— 区域化之后
       * 边界是硬墙，而老的大圆圈只有一层径向钳制，看不出这个毛病。 */
      let leashed = false;
      if (e.anchor && typeof zoneAt === 'function') {
        const bz = zoneAt(this.state.mapId, e.pos.x, e.pos.z);
        const pz = zoneAt(this.state.mapId, pp.x, pp.z);
        if (bz && pz && bz.id !== pz.id) {
          leashed = true;
          const ad = Math.hypot(e.anchor.x - e.pos.x, e.anchor.z - e.pos.z);
          if (ad > 1.2) this.moveEnemy(e, e.anchor, e.spd * 0.85, dt);
          else a.moving = false;
        }
      }
      if (!leashed) this.moveEnemy(e, pp, e.spd * (1 + e.phase * 0.12), dt);
    } else {
      a.moving = false;
    }

    // 普攻
    if (e.atkCd <= 0 && d < e.reach + 1.6 && e.windup <= 0 && e.charging <= 0) {
      e.atkCd = e.cfg.atkCd || 2;
      e.windup = 0.45;
      e.pendingMelee = true;
      a.atkAnim = 1; a.atkType = 'swing'; a.atkSpeed = 2.6;
      SFX.swing();
      FX.slash(new THREE.Vector3(e.pos.x, 0, e.pos.z), Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z) - Math.PI / 2 - 0.9, 0xff8844, e.reach + 1.5, 1.8);
    }

    // 技能
    if (e.patternCd <= 0) {
      e.patternCd = RND(4.5, 7.5) * (1 - e.phase * 0.12);
      this.bossPattern(e, pp);
    }

    // 面向
    const ang = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    a.group.rotation.y = this.lerpAngle(a.group.rotation.y, ang, 1 - Math.pow(0.002, dt));
    if (this.boss === e) UI.updateBoss(e);
  },

  bossPattern(e, pp) {
    const pat = PICK(e.cfg.patterns || ['slam']);
    const st = e.dmg;
    const self = e;
    SFX.boss();
    this.shake = Math.max(this.shake, 0.3);
    switch (pat) {
      case 'slam': {
        const target = new THREE.Vector3(pp.x, 0, pp.z);
        FX.telegraph(target, 4.6, 0.85, () => {
          if (this.dead) return;
          FX.flashCircle(target, 4.6, 0xff5522, 0.4);
          FX.burst(new THREE.Vector3(target.x, 0.5, target.z), 0xff7744, 24, { speed: 8, size: 0.16, life: 0.6, gravity: 4, additive: true });
          SFX.explode(); this.shake = 0.6;
          if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), target) < 4.6) this.damagePlayer(st * 1.5, self);
        }, 0xff4422);
        break;
      }
      case 'roots': {
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Vector3(pp.x + RND(-5, 5), 0, pp.z + RND(-5, 5));
          FX.telegraph(t, 2.6, 0.7 + i * 0.18, () => {
            FX.burst(new THREE.Vector3(t.x, 0.3, t.z), 0x6aa04a, 18, { speed: 4, size: 0.16, life: 0.8, gravity: -3 });
            if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), t) < 2.6) this.damagePlayer(st * 1.1, self);
          }, 0x66aa44);
        }
        break;
      }
      case 'ringshot': {
        const n = 12 + e.phase * 4;
        const off = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          const ang = off + i / n * Math.PI * 2;
          const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          FX.projectile({
            pos: new THREE.Vector3(e.pos.x + dir.x * 1.5, 1.5, e.pos.z + dir.z * 1.5),
            dir, speed: 12, color: 0xff6666, radius: 0.3, team: 'enemy',
            dmg: st * 0.8, life: 3, elem: 'fire',
            onHit: (tgt, p) => { this.damagePlayer(p.dmg, self); }
          });
        }
        FX.ring(e.pos, 3, 0xff6666, 0.4);
        break;
      }
      case 'charge': {
        e.charging = 0.55; e.chargeHit = false;
        const dir = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z).normalize();
        e.chargeDir = { x: dir.x, z: dir.z };
        e.lorder = 0;
        FX.ring(e.pos, 2.4, 0xffaa44, 0.35);
        UI.log(e.cfg.name + ' 蓄力冲撞！', 'bad');
        break;
      }
      case 'summon': {
        /* [v1.0.5] 召唤物按「身边已有多少」封顶。
         * 全局 MOB_CAP 只保证不炸机，但 Boss 每 3 秒往身边塞 3~4 只，
         * 十几秒就能把场地挤满，玩家除了跑没别的选择。 */
        let near = 0;
        for (const o of this.enemies) {
          if (o.dead || o.boss) continue;
          if (DIST2D(o.pos, e.pos) < 16) near++;
        }
        if (near >= SUMMON_CAP) break;
        const kind = PICK(MAPS[this.state.mapId].spawns || ['bat']);
        for (let i = 0; i < 2 + e.phase; i++) {
          const ang = Math.random() * 6.28, r = 4;
          const m = this.spawnEnemy(kind, e.pos.x + Math.cos(ang) * r, e.pos.z + Math.sin(ang) * r, false, Math.max(1, e.level - 2));
          if (m) { FX.flashCircle(m.pos, 1.6, 0xaa66ff, 0.4); m.aggro = true; }
        }
        FX.ring(e.pos, 5, 0xaa66ff, 0.6);
        break;
      }
      case 'rocks': {
        for (let i = 0; i < 5; i++) {
          const t = new THREE.Vector3(pp.x + RND(-8, 8), 0, pp.z + RND(-8, 8));
          FX.telegraph(t, 2.2, 0.9 + i * 0.12, () => {
            FX.burst(new THREE.Vector3(t.x, 0.4, t.z), 0x998877, 14, { speed: 6, size: 0.18, life: 0.7, gravity: 12 });
            if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), t) < 2.2) this.damagePlayer(st * 1.2, self);
          }, 0xaa9977);
        }
        break;
      }
      case 'quake': {
        FX.ring(e.pos, 9, 0xffaa66, 0.9, 0.4);
        FX.flashCircle(e.pos, 8, 0xffbb77, 0.5);
        this.shake = 0.8;
        SFX.explode();
        if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), e.pos) < 8.5) this.damagePlayer(st * 1.6, self);
        break;
      }
      case 'poisonnova': {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            const c = new THREE.Vector3(e.pos.x, 0, e.pos.z);
            FX.area(c, 4 + i * 2.6, 0x2f9a3c, 4, { opacity: 0.28 });
            const c2 = c.clone();
            let ticks = 0;
            const gen2 = this.mapGen;
            const iv = setInterval(() => {
              if (this.mapGen !== gen2) { clearInterval(iv); return; }
              ticks++;
              if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), c2) < 4 + i * 2.6) {
                this.damagePlayer(st * 0.4, self);
                this.playerPoison(st * 0.2);
              }
              if (ticks > 4) clearInterval(iv);
            }, 900);
          }, i * 380);
        }
        break;
      }
      case 'frostnova': {
        const c = new THREE.Vector3(e.pos.x, 0, e.pos.z);
        FX.flashCircle(c, 7, 0x8ad8ff, 0.5);
        FX.ring(c, 7, 0x8ad8ff, 0.7);
        SFX.ice();
        if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), c) < 7) {
          this.damagePlayer(st * 1.1, self);
          this.applyPlayerSlow(0.5, 2.5);
        }
        break;
      }
      case 'fireline': {
        const dir = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z).normalize();
        for (let i = 0; i < 6; i++) {
          const t = new THREE.Vector3(e.pos.x + dir.x * i * 3, 0, e.pos.z + dir.z * i * 3);
          setTimeout(() => {
            FX.flashCircle(t, 2.2, 0xff5522, 0.35);
            FX.burst(new THREE.Vector3(t.x, 0.6, t.z), 0xff7722, 10, { speed: 5, size: 0.16, life: 0.5, gravity: -2, additive: true });
            if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), t) < 2.2) this.damagePlayer(st * 0.9, self);
          }, i * 110);
        }
        break;
      }
      case 'curse': {
        if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), e.pos) < 14) {
          this.damagePlayer(st * 0.6, self);
          const slowed = this.applyPlayerSlow(0.45, 3);
          FX.beam(new THREE.Vector3(e.pos.x, 2, e.pos.z), new THREE.Vector3(this.playerGroup.position.x, 1.4, this.playerGroup.position.z), 0xaa66ff, 0.4);
          UI.log(slowed ? '你被邪咒缠绕，身法迟滞！' : '免控生效，邪咒缠不上身！',
            slowed ? 'bad' : 'good');
        }
        break;
      }
      case 'meteor': {
        for (let i = 0; i < 4; i++) {
          const t = new THREE.Vector3(pp.x + RND(-7, 7), 0, pp.z + RND(-7, 7));
          FX.telegraph(t, 3.4, 1.1, () => {
            FX.flashCircle(t, 3.4, 0xff5522, 0.4);
            this.shake = 0.4;
            if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), t) < 3.4) this.damagePlayer(st * 1.4, self);
          }, 0xff4422);
        }
        break;
      }
      case 'swordrain': {
        for (let i = 0; i < 10; i++) {
          const t = new THREE.Vector3(pp.x + RND(-10, 10), 0, pp.z + RND(-10, 10));
          FX.telegraph(t, 2.4, 0.8 + i * 0.1, () => {
            FX.burst(new THREE.Vector3(t.x, 0.4, t.z), 0xffe0a0, 10, { speed: 6, size: 0.12, life: 0.5, gravity: 2, additive: true });
            if (DIST2D(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), t) < 2.4) this.damagePlayer(st * 0.9, self);
          }, 0xffd166);
        }
        break;
      }
    }
  },

  /* ---------------- 召唤物 ---------------- */
  /* [S4] 变体 / 天赋对召唤的修正：skillMods[技能id] 的 dmg → 伤害，dur → 存活 */
  /* [P2b·兽群] 必须读 effSkillMods 而不是 skillMod。
   *
   * skillMod 只含**装备词条**，精研 / 取向 / 变体的 mods 全漏在外面 ——
   * 于是「凶兽 +30%」「虎威 +30%」「真龙 +30%」「兽王 +50%」「龙神 +60%」
   * 这些写进数据的加成，打出来一个都没生效（召唤流弱的真正原因）。
   * 换成 effSkillMods 之后，分支与台阶的 mods 一并进来；
   * 台阶「召唤数量 +1」也走同一条路（见 SKILL_TIER_EVO[summon].3.mods.count）。
   *
   * lifeAdd 现在没有消费点了（灵兽不再靠倒计时退场），保留字段只为
   * 不破坏还写着 dur 的分支数据 —— 它们改由 allyEmpower 折算成回血。 */
  _summonMods(skillId) {
    const sm = this.effSkillMods(skillId) || {};
    return {
      dmgMul: 1 + (sm.dmg || 0) / 100,
      lifeAdd: sm.dur || 0,
      count: Math.max(0, Math.round(sm.count || 0))
    };
  },

  /* force = 强制只召 N 只（万兽的「死亡重召」用，不再按天赋翻倍，
   * 否则死一只补两只，上限就永远压不住） */
  summonWolf(force) {
    const st = this.state.stats;
    const mod = this._summonMods('summon');
    /* [S3] 召唤系：中节点灵狼继承 75%；青符 5 件 90% */
    const inherit = (st.specials && st.specials.wolfPrime) ? 0.9
      : ((st.specials && st.specials.wolfStrong) ? 0.75 : 0.6);
    /* [S3] 召唤系大节点·万兽：一次召出 2 头。
     * [P2b·兽群] 台阶 / 变体 / 装备的 count 叠加在天赋之上 ——
     * 「双生」那条变体写了一年多的 mods.count，但从来没有消费点，
     * 选了它还是只召 1 只；现在真的多一只。 */
    const base = (st.specials && st.specials.wolfPack) ? 2 : 1;
    const count = (typeof force === 'number') ? Math.max(1, force) : base + mod.count;
    const made = this._spawnAlly(BEAST_PRESET.wolf, { count, inherit, dmgMul: mod.dmgMul, kind: 'wolf' });
    if (made > 0) {
      UI.log(inherit > 0.6
        ? '灵狼应召而来（继承 ' + Math.round(inherit * 100) + '% 攻击力' + (made > 1 ? ' ×' + made : '') + '）'
        : '灵狼应召而来' + (made > 1 ? ' ×' + made : ''));
    }
    return made;
  },

  /* 灵兽上限的判定已挪进 _spawnAlly（撞上限就少召一只并给提示），
   * 「顶掉最老的」这条规则整条删除 —— 见 trimAllies 的注释。 */

  /* [P2b·兽群] 上限从 3 抬到 8（手机 6）：灵兽有了血、会被怪打死，
   * 寿命有了天然终点，数量就该放开。这里仍要按平台分档 ——
   * 每只灵兽是一个 actor + 每帧寻敌/移动/攻击，是真实开销。 */
  allyCap() {
    let cap = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) ? ALLY_CAP_TOUCH : ALLY_CAP_BASE;
    /* 关键被动「兽契」：灵兽上限 +1 */
    if (typeof this.passiveLv === 'function' && this.passiveLv('t_beast') > 0) cap += 1;
    return cap;
  },

  /* 收缩到当前上限。**只在「上限变小」时需要**（洗点退掉兽契、换平台）——
   * 召唤时由 _spawnAlly 直接判 cap，不会再走这里顶掉刚召的那只。 */
  trimAllies() {
    const cap = this.allyCap();
    while (this.allies.length > cap) {
      const old = this.allies.shift();
      if (old && old.actor && old.actor.group) this.scene.remove(old.actor.group);
      FX.text(new THREE.Vector3(old.pos.x, 2.2, old.pos.z), '灵兽消散', 'info', { life: 0.9 });
    }
  },

  presetOf(kind) {
    return BEAST_PRESET[kind] || BEAST_PRESET.wolf;
  },

  /* 造灵兽的唯一入口：三型共用，血条 / 血量 / 偏移 / 上限判定只写一遍。
   *
   * 两条与旧实现的关键差别：
   *   1. 伤害存**系数**（coef）而不是绝对值 —— 召唤之后换装备、加点、
   *      吃增益，灵兽的每一刀都要跟着变，而不是永远停在召唤那一刻。
   *   2. 每只都带 hp / maxHp / 血条。以前灵兽没有血，只能靠 life 倒计时退场，
   *      于是「多召一只」就必须顶掉一只；现在它会被怪打死，倒计时就不再需要。
   *
   * 返回真正召出来的只数（撞上限时小于 count，不再静默替换在场的）。 */
  _spawnAlly(preset, opt) {
    const o = Object.assign({}, preset, opt || {});
    const st = this.state.stats;
    const dmgMul = (opt && opt.dmgMul) || 1;
    const inherit = (opt && typeof opt.inherit === 'number') ? opt.inherit : (preset.inherit || 0.6);
    const coef = inherit * (1 + (st.summonDmg || 0) / 100) * dmgMul;
    const maxHp = Math.max(1, Math.round((st.hpMax || 100) * (preset.hpPct || 0.3)));
    const count = Math.max(1, Math.round(o.count || 1));
    const cap = this.allyCap();
    const pp = this.playerGroup.position;
    let made = 0;
    for (let i = 0; i < count; i++) {
      if (this.allies.length >= cap) break;
      const a = buildMonster('beast', { scale: o.scale, color: o.color, cloth: o.cloth });
      const off = count > 1 ? (i - (count - 1) / 2) * 1.5 : 0;
      a.group.position.set(pp.x + off, 0, pp.z + 0.8);
      this.scene.add(a.group);
      const bar = (typeof makeHpBar === 'function') ? makeHpBar(a.group, { gap: 0.42 }) : null;
      if (bar) {
        /* 队友的血条不该长得像怪的：蓝底蓝条，一眼分得开 */
        bar.fill.material.color.setHex(ALLY_BAR_COLOR);
        bar.bg.material.color.setHex(0x0a1a22);
      }
      this.allies.push({
        actor: a, pos: a.group.position.clone(),
        kind: o.kind || 'wolf', skill: o.skill || 'summon',
        hp: maxHp, maxHp, bar,
        coef, dmgMul,
        atkRate: o.atkRate || 1.1, aoe: !!o.aoe,
        atkCd: 0,
        revive: { kind: o.kind || 'wolf' }
      });
      made++;
    }
    if (made < count) {
      UI.log('灵兽已满 ' + cap + ' 只，' + (o.name || '这一只') + '没能应召');
    }
    return made;
  },

  /* 灵兽受伤。以前这只角色不存在（灵兽没有血），现在怪会真打到它身上 ——
   * 于是「群嘲」终于有了代价：它替你挨的每一刀都会真的扣在它身上。 */
  damageAlly(al, amount, source) {
    if (!al || al.hp <= 0) return;
    const dmg = Math.max(1, amount);
    al.hp -= dmg;
    FX.text(new THREE.Vector3(al.pos.x, 2.0, al.pos.z), '-' + Math.round(dmg), 'bad', { life: 0.55 });
    FX.burst(new THREE.Vector3(al.pos.x, 1.1, al.pos.z), 0xffd0a0, 6, { speed: 3, size: 0.09, life: 0.3, additive: true });
    if (al.actor) al.actor.flash = 0.12;
    /* 死亡不在这里处理：统一由 updateAllies 收尸（那里才有 splice 与重召队列），
     * 否则一发 AOE 会同时触发两次重召判定。 */
  },

  /* 找一只离某点最近的活着的灵兽（嘲讽 / 远程弹道落地时用） */
  allyNear(pt, range) {
    let best = null, bd = range || 8;
    for (const al of this.allies) {
      if (!al || al.hp <= 0) continue;
      const d = DIST2D(al.pos, pt);
      if (d < bd) { bd = d; best = al; }
    }
    return best;
  },

  /* [P2b·兽群] 台阶 Lv5「灵兽攻击附带范围伤害」。
   * 直接给 al.aoe / al.aoeR —— 那是青龙原本就在用的那套字段，不另开一条判定。
   * 两套溅射写在不同地方，迟早出现「青龙能溅射、白虎不能」这种半成品。 */
  grantAllyAoe(rad) {
    const R = Math.max(1, rad || 2.6);
    let n = 0;
    for (const al of this.allies) {
      if (!al || al.hp <= 0) continue;
      al.aoe = true;
      al.aoeR = Math.max(al.aoeR || 0, R);
      n++;
    }
    return n;
  },

  /* [P2b·兽群] 台阶 Lv9「灵兽在场时自身受伤 -N%」。
   * 减伤记在**灵兽身上**、damagePlayer 取最大值 —— 记在玩家身上就要再管
   * 「持续多久」，而这条的语义本来就是「有灵兽替你扛着」，灵兽死光就该没有。 */
  grantAllyGuard(pct) {
    const v = CLAMP(pct || 10, 0, 40);
    let n = 0;
    for (const al of this.allies) {
      if (!al || al.hp <= 0) continue;
      al.guard = Math.max(al.guard || 0, v);
      n++;
    }
    return n;
  },

  /* [P2b·兽群] 台阶 Lv10「四象同场」：按一次，场上凑齐三种灵兽。
   * 缺哪只补哪只；每种只补 1 只，不按 count 翻倍 ——
   * 否则「四象同场」会变成「六只狼 + 一只虎」，恰恰看不到三种。 */
  summonFour() {
    const have = {};
    for (const al of this.allies) if (al && al.hp > 0) have[al.kind] = (have[al.kind] || 0) + 1;
    let made = 0;
    for (const kind of ['wolf', 'tiger', 'dragon']) {
      if (have[kind]) continue;
      made += (kind === 'wolf')
        ? this._spawnAlly(BEAST_PRESET.wolf, { count: 1, kind })
        : this.summonBeast({ kind });
    }
    if (made) {
      const pp = this.playerGroup.position;
      FX.ring(new THREE.Vector3(pp.x, 0.2, pp.z), 5.5, 0x9ad8ff, 0.6, 0.3);
      FX.text(new THREE.Vector3(pp.x, 3.0, pp.z), '四象同场', 'lv', { life: 1.2 });
    }
    return made;
  },

  /* [S4] 白虎 / 青龙：同框架不同参数（攻速 / 群攻）。
   * `allyPair`（青龙变体「双龙」）也走这里，参数是按「同门小弟」给的覆盖值 ——
   * 所以这里的 preset 合并顺序是「三型默认 → 调用方覆盖」。 */
  summonBeast(o) {
    const kind = o.kind || (o.skill === 'whitetiger' ? 'tiger'
      : (o.skill === 'azuredragon' ? 'dragon' : 'wolf'));
    const preset = Object.assign({}, this.presetOf(kind), o);
    /* 分支 / 装备修正按**合并后的** skill 查：只传 { kind } 调用的那些地方
     * （case 与「四象同场」）没有 o.skill，用 o.skill 会把加成整条丢掉。 */
    const mod = this._summonMods(preset.skill);
    /* [P2b·兽群] 数量 = 1 + 台阶/变体/装备的 count（「双虎」「双龙」终于生效） */
    const made = this._spawnAlly(preset, { count: 1 + mod.count, dmgMul: mod.dmgMul, kind });
    if (made > 0) {
      UI.log((o.name || preset.name) + '应召而来' + (made > 1 ? ' ×' + made : ''));
    }
    return made;
  },

  updateAllies(dt) {
    const st = this.state.stats;
    /* 万兽重召的配方先攒着，循环结束后再召 —— 召唤会走 trimAllies（shift 最老的），
     * 在倒序遍历里做位移会让后面几只灵兽被跳过一帧。 */
    let reviveQ = null;
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const al = this.allies[i];
      /* [P3] 灵兽增益（allyBuff）：伤害 / 出手间隔 / 存续流失三样。
       * [P2b·兽群] 灵兽现在有血了 —— 「drain」从「烧寿命」改成「持续掉血」，
       * 描述里的「持续流失」才有了字面意思。 */
      if (al.emp && al.emp.t > 0) {
        al.emp.t -= dt;
        if (al.emp.t <= 0) { al.emp.dmg = 1; al.emp.atk = 1; al.emp.drain = 1; }
      }
      const emp = al.emp || null;
      if (emp && emp.drain && emp.drain !== 1) al.hp -= dt * al.maxHp * (emp.drain - 1) * 0.05;
      /* 死亡只有一个条件：血被打空。倒计时已经删掉 —— 那本来只是
       * 「灵兽不会被打死」时期的替代品，两套生命周期并存玩家会看不懂。 */
      if (al.hp <= 0) {
        this.scene.remove(al.actor.group);
        FX.burst(new THREE.Vector3(al.pos.x, 1.0, al.pos.z), 0x9ad8ff, 14, { speed: 3, size: 0.1, life: 0.6, additive: true });
        /* [P2] 护主（取向）：灵兽死亡时为主人回复生命 */
        if (typeof this.onBehAllyDeath === 'function') this.onBehAllyDeath();
        /* [P3] 兽契（关键被动）：30% 概率当场照配方重召一只。
         * 概率写在数据描述里（30%），这里不另加隐藏系数。 */
        if (al.revive && typeof this.passiveLv === 'function' && this.passiveLv('t_beast') > 0
          && Math.random() < 0.3) {
          (reviveQ || (reviveQ = [])).push(al.revive);
        }
        this.allies.splice(i, 1); continue;
      }
      /* 血条：和怪物血条同一套（面向相机 / 屏幕上尺寸恒定），只是颜色不同 */
      if (al.bar && this.camera) {
        const cp = this.camera.position;
        const bd2 = Math.hypot(al.pos.x - cp.x, 1.2 - cp.y, al.pos.z - cp.z);
        al.bar.group.visible = bd2 < 36;
        updateHpBar(al.bar, al.hp / al.maxHp, bd2, this.camera);
      }
      /* [P2] 龙息（取向）：灵兽自己的周期性吐息（只有青龙带 breath 标记） */
      if (al.breath) {
        al.breath.t -= dt;
        if (al.breath.t <= 0) {
          al.breath.t = al.breath.every;
          const R = 4.2;
          FX.ring(new THREE.Vector3(al.pos.x, 0, al.pos.z), R, 0x6ac8ff, 0.5, 0.25);
          FX.flashCircle(new THREE.Vector3(al.pos.x, 0.2, al.pos.z), R, 0x6ac8ff, 0.3);
          SFX.fire();
          for (const e of this.enemies) {
            if (e.dead || DIST2D(e.pos, al.pos) >= R + e.radius) continue;
            const t = this.rollDamage(st.atk * al.coef * 2.4);
            this.damageEnemy(e, t.dmg, t.crit, { silent: true, tag: 'aoe', elem: 'lightning' });
          }
        }
      }
      let target = null, bd = 24;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = DIST2D(e.pos, al.pos);
        if (d < bd) { bd = d; target = e; }
      }
      al.atkCd = Math.max(0, al.atkCd - dt);
      if (target) {
        if (bd > (al.reach || 2.2)) {
          const dx = target.pos.x - al.pos.x, dz = target.pos.z - al.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          al.pos.x += dx / d * 7 * dt;
          al.pos.z += dz / d * 7 * dt;
          al.actor.moving = true;
          al.actor.group.rotation.y = Math.atan2(dx, dz);
        } else {
          al.actor.moving = false;
          if (al.atkCd <= 0) {
            /* [S4] 各召唤物攻速不同（白虎快 / 青龙慢）；[P3] 灵兽增益里的
             * atk 是「出手更快」的倍率，除在间隔上 */
            al.atkCd = (al.atkRate || 1.1) / (emp && emp.atk ? emp.atk : 1);
            al.actor.atkAnim = 1; al.actor.atkType = 'swing';
            /* [P2b·兽群] 灵兽的每一刀都走玩家的 rollDamage：
             * 暴击率 / 暴击伤害 / 通用增伤（dmgAll）从此全部继承。
             * 之前固定传 `false`，等于召唤物天生不会暴击 —— 堆暴击的召唤流
             * 把一半词条白扔了。基础值现算（st.atk × al.coef），换装备立刻生效。 */
            const { dmg, crit } = this.rollDamage(st.atk * al.coef * (emp && emp.dmg ? emp.dmg : 1));
            this.damageEnemy(target, dmg, crit, {});
            FX.spark(new THREE.Vector3(target.pos.x, 1.2, target.pos.z), 0x8affc0, 6);
            /* [P3] 恐惧：这只灵兽所属技能带 fear 时，每次出手按概率吓退目标。
             * 走「出手」而不是「施法」，数据描述写的就是「每次攻击 N%」。 */
            if (al.skill && typeof this.branchBeh === 'function' && !target.dead && !target.boss) {
              const ab = this.branchBeh(al.skill);
              if (ab && ab.fear && Math.random() < ab.fear / 100) {
                target.fearT = Math.max(target.fearT || 0, 1);
                FX.text(new THREE.Vector3(target.pos.x, 2.3, target.pos.z), '恐惧', 'info', { life: 0.8 });
              }
            }
            /* [S4] 青龙：范围攻击，命中目标周围 2.8m 内所有敌人 */
            if (al.aoe) {
              const ar = al.aoeR || 2.8;
              for (const e of this.enemies) {
                if (e.dead || e === target) continue;
                if (DIST2D(e.pos, target.pos) < ar + e.radius) {
                  this.damageEnemy(e, dmg * 0.8, false, { silent: true, tag: 'aoe' });
                }
              }
              FX.ring(target.pos, ar, 0x6ac8ff, 0.4, 0.2);
            }
          }
        }
      } else {
        // 跟随玩家
        const pp = this.playerGroup.position;
        const d = DIST2D(al.pos, pp);
        if (d > 3) {
          const dx = pp.x - al.pos.x, dz = pp.z - al.pos.z;
          al.pos.x += dx / d * 5 * dt; al.pos.z += dz / d * 5 * dt;
          al.actor.moving = true;
          al.actor.group.rotation.y = Math.atan2(dx, dz);
        } else al.actor.moving = false;
      }
      al.actor.group.position.set(al.pos.x, 0, al.pos.z);
      updateActorAnim(al.actor, dt);
    }
    if (reviveQ) {
      for (const r of reviveQ) {
        /* 兽契重召：只按种类补一只（不再按 count 翻倍，否则死一只补三只） */
        this._spawnAlly(this.presetOf(r.kind), { count: 1, kind: r.kind });
        FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.9, this.playerGroup.position.z),
          '兽契·重召', 'good', { life: 1 });
      }
    }
  },

  /* ---------------- 投射物碰撞 ---------------- */
  /* v1.0.4：点判定 → 扫掠（线段）判定
   *
   * 旧写法是每帧拿投射物当前坐标去比 distanceTo(怪物)，只要一帧走过的距离
   * 超过「怪物半径 + 投射物半径」，判定点就会从怪物前面直接跳到后面，永远踩不到——
   * 这就是「法师法球有时候直接穿过怪物模型」。
   * 法球速度 21~24，60fps 下每帧 0.35~0.4，本来勉强够；但掉到 30fps 就是 0.7~0.8，
   * 手机上一场群怪立刻就能复现。
   *
   * 现在改成拿「上一帧位置 → 当前帧位置」这条线段去和怪物的圆求交，
   * 无论帧率多低、速度多快都不会漏；顺带解决了瞄准落点在地面导致的上下偏差。
   */
  updateProjectiles(dt) {
    for (let i = FX.projectiles.length - 1; i >= 0; i--) {
      const p = FX.projectiles[i];
      const prev = p.prevPos || p.pos;
      if (p.team === 'player') {
        let best = null, bestT = 2;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (p.hitSet && p.hitSet.has(e.id)) continue;    // 穿透弹不重复打同一只
          const t = segCircleT(prev, p.pos, e.pos.x, e.pos.z, e.radius + p.hitRadius + 0.25);
          if (t >= 0 && t < bestT) { bestT = t; best = e; }
        }
        if (best) {
          /* 命中点：把投射物挪到线段与圆的交点，爆炸/特效就落在模型表面而不是穿到身后 */
          if (!p.pierce) p.pos.lerpVectors(prev, p.pos, bestT);
          if (p.onHit) p.onHit(best, p);
          if (!p.pierce) { FX.removeProjectile(i); continue; }
          (p.hitSet || (p.hitSet = new Set())).add(best.id);
        }
      } else {
        const pg = this.playerGroup.position;
        const t = segCircleT(prev, p.pos, pg.x, pg.z, 0.85 + p.hitRadius);
        if (t >= 0) {
          if (!p.pierce) p.pos.lerpVectors(prev, p.pos, t);
          if (p.onHit) p.onHit(null, p);
          FX.removeProjectile(i);
        }
      }
    }
  },

  /* ---------------- 掉落与拾取 ---------------- */
  spawnLoot(pos, item, gold, extra) {
    const g = new THREE.Group();
    g.position.set(pos.x + RND(-0.6, 0.6), 0, pos.z + RND(-0.6, 0.6));
    if (extra && extra.rune) {
      const rune = RUNES[extra.rune];
      const c = new THREE.Color(RUNE_TIERS[rune.tier].color);
      const box = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.25 }));
      box.position.y = 0.7;
      g.add(box);
      const beam = new THREE.Mesh(cylGeo(0.12, 0.24, 5, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2.5;
      g.add(beam);
      this.loot.push({ obj: g, pos: g.position.clone(), item: null, gold: 0, rune: extra.rune, box, t: 0 });
    } else if (extra && extra.crystal) {
      const c = new THREE.Color(0xb98cff);
      const box = new THREE.Mesh(new THREE.TetrahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.0, metalness: 0.7, roughness: 0.2 }));
      box.position.y = 0.55;
      g.add(box);
      const beam = new THREE.Mesh(cylGeo(0.1, 0.2, 4, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2;
      g.add(beam);
      this.loot.push({ obj: g, pos: g.position.clone(), item: null, gold: 0, crystal: extra.crystal, box, t: 0 });
    } else if (extra && extra.mat) {
      /* v1.6.0 匠材：八面体 + 材料本色，与符文（菱形）/ 玄晶（四面体）区分开 */
      const md = CRAFT_MATS[extra.mat.id] || { color: '#b9c2cc' };
      const c = new THREE.Color(md.color);
      const box = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.55, roughness: 0.35, flatShading: true }));
      box.position.y = 0.6;
      g.add(box);
      const beam = new THREE.Mesh(cylGeo(0.1, 0.22, 4, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2;
      g.add(beam);
      this.loot.push({ obj: g, pos: g.position.clone(), item: null, gold: 0, mat: extra.mat, box, t: 0 });
    } else if (item) {
      const col = RARITY[item.rarity].color;
      const c = new THREE.Color(col);
      const box = new THREE.Mesh(boxGeo(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3 }));
      box.position.y = 0.6;
      g.add(box);
      const beam = new THREE.Mesh(cylGeo(0.16, 0.3, 5, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2.5;
      g.add(beam);
      const ring = new THREE.Mesh(ringGeo(0.5, 0.62, 18), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      g.add(ring);
      this.loot.push({ obj: g, pos: g.position.clone(), item, gold: 0, box, t: 0 });
    } else {
      const coin = new THREE.Mesh(boxGeo(0.26, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xaa7700, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 }));
      coin.position.y = 0.4;
      g.add(coin);
      this.loot.push({ obj: g, pos: g.position.clone(), item: null, gold, box: coin, t: 0 });
    }
    this.scene.add(g);
  },

  updateLoot(dt) {
    const pp = this.playerGroup.position;
    /* [S1] 拾取范围：装备上的 pickupRadius 同时放大吸附圈与拾取圈 */
    const pr = this.state.stats.pickupRadius || 0;
    const pullR = 2.4 + pr * 0.55;
    const grabR = 1.3 + pr * 0.3;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt;
      l.obj.position.y = Math.sin(l.t * 3) * 0.1;
      l.box.rotation.y += dt * 2;
      const d = Math.hypot(pp.x - l.pos.x, pp.z - l.pos.z);
      if (d < pullR) {
        // 吸附
        l.pos.x += (pp.x - l.pos.x) * dt * 6;
        l.pos.z += (pp.z - l.pos.z) * dt * 6;
        l.obj.position.x = l.pos.x; l.obj.position.z = l.pos.z;
        if (d < grabR) {
          if (l.rune) {
            const rd = RUNES[l.rune];
            const tier = RUNE_TIERS[rd.tier];
            this.addRune(l.rune, 1);
            SFX.loot('rare');
            FX.text(new THREE.Vector3(l.pos.x, 1.4, l.pos.z), '+ ' + rd.name + '（' + tier.name + '）', 'info', { life: 1.1 });
            UI.log('获得符文 · ' + rd.name + '（' + tier.name + '）', rd.tier >= 3 ? 'good' : '');
            UI.toast('符文 · ' + rd.name, 'item');
            disposeTree(l.obj);
            this.loot.splice(i, 1);
          } else if (l.crystal) {
            this.addCrystal(l.crystal);
            SFX.coin();
            FX.text(new THREE.Vector3(l.pos.x, 1.4, l.pos.z), '+' + l.crystal + ' 玄晶', 'info', { life: 0.9 });
            UI.log('获得 玄晶 ×' + l.crystal, 'good');
            disposeTree(l.obj);
            this.loot.splice(i, 1);
          } else if (l.mat) {
            const md = CRAFT_MATS[l.mat.id];
            const n = Math.max(1, Math.round(l.mat.n || 1));
            this.addCraftMat(l.mat.id, n);
            SFX.loot('rare');
            FX.text(new THREE.Vector3(l.pos.x, 1.4, l.pos.z), '+' + n + ' ' + (md ? md.name : '匠材'), 'info', { life: 1.0 });
            UI.log('获得 ' + (md ? md.name : '匠材') + ' ×' + n, md && md.tier >= 3 ? 'good' : '');
            disposeTree(l.obj);
            this.loot.splice(i, 1);
          } else if (l.item) {
            if (this.state.inventory.length >= this.bagCap()) {
              if (!l.warned) { l.warned = true; UI.log('行囊已满，先清理背包。', 'bad'); }
            } else if (this.addItem(l.item)) {
              SFX.loot(l.item.rarity);
              const col = RARITY[l.item.rarity].color;
              UI.log('获得 ' + l.item.name, l.item.rarity === 'common' ? '' : 'good');
              UI.toast(l.item.name, 'item');
              this.pickupFx(l.pos, l.item);
              disposeTree(l.obj);          // 光柱/环/模型一起还回
              this.loot.splice(i, 1);
            }
          } else {
            const g = Math.round(l.gold * (1 + this.state.stats.goldFind / 100));
            this.state.gold += g;
            FX.text(new THREE.Vector3(l.pos.x, 1.4, l.pos.z), '+' + g + ' 金', 'info', { life: 0.8 });
            SFX.coin();
            disposeTree(l.obj);
            this.loot.splice(i, 1);
          }
        }
      }
      if (l.t > 180) { disposeTree(l.obj); this.loot.splice(i, 1); }
    }
  },

  pickupFx(pos, item) {
    const c = new THREE.Color(RARITY[item.rarity].color);
    for (let i = 0; i < 8; i++) {
      FX.burst(new THREE.Vector3(pos.x, RND(0.3, 1.5), pos.z), c.getHex(), 1, { speed: 2, size: 0.11, life: 0.8, gravity: -3, additive: true });
    }
  },

  /* ---------------- 击杀 ---------------- */
  /* 这一只怪掉哪些匠材。返回 [{ id, n }]，同种已合并。
   * 概率与数量都在这里，掉落逻辑只负责把它们变成光柱。 */
  rollCraftMats(kind, dropMul, seeker) {
    if (typeof CRAFT_MATS === 'undefined') return [];
    const T1 = ['ore', 'hide', 'bone'];
    const T2 = ['silk', 'ember', 'frost'];
    const T3 = ['scale', 'meteor', 'soul'];
    const mul = seeker ? 1.5 : 1;
    const out = {};
    const push = (id, n) => { out[id] = (out[id] || 0) + Math.max(1, Math.round(n * mul)); };
    if (kind === 'boss') {
      push(PICK(T3), RND(1, 2));
      push(PICK(T2), RND(2, 4));
      push(PICK(T1), RND(3, 6));
      if (CHANCE(0.5)) push(PICK(T2.concat(T3)), RND(1, 2));
    } else if (kind === 'elite') {
      push(CHANCE(0.62) ? PICK(T2) : PICK(T1), RND(1, 3));
      if (CHANCE(0.45)) push(PICK(T1), RND(1, 2));
    } else {
      if (!CHANCE(0.3 * (dropMul || 1))) return [];
      push(PICK(T1), RND(1, 2));
    }
    return Object.keys(out).map(id => ({ id, n: out[id] }));
  },

  /* ======================================================= */
  /* [S5] 异兽志（怪物图鉴）                                    */
  /* ======================================================= */
  /* 存档结构：state.codex = { mon: { <kind>: {kills, at} }, regions: { <id>: true } }
   * S0 的 schema 里早就预留了 codex 字段，这里只往里填，不动结构。 */
  codex() {
    const s = this.state;
    if (!s) return { mon: {}, regions: {} };
    if (!s.codex || typeof s.codex !== 'object') s.codex = { mon: {}, regions: {} };
    if (!s.codex.mon || typeof s.codex.mon !== 'object') s.codex.mon = {};
    if (!s.codex.regions || typeof s.codex.regions !== 'object') s.codex.regions = {};
    return s.codex;
  },

  codexEntry(kind) {
    return this.codex().mon[kind] || null;
  },

  /* [M1] 图鉴「掉落」行。
   * 直接从 spawnLoot 的真实规则算，不另写一份说明文案——
   * 否则以后调了掉率，图鉴就成了骗人的东西。
   * 图鉴只收普通怪，所以这里走「普通怪档」。 */
  codexDrops(kind, lv) {
    if (!kind || typeof MONSTERS === 'undefined' || !MONSTERS[kind]) return '';
    const D = (this.diff ? this.diff() : null) || { rune: 1, drop: 1 };
    const runePct = Math.round(2.5 * (D.rune || 1) * 10) / 10;
    const crysPct = Math.round(10 * (D.rune || 1) * 10) / 10;
    const mats = (typeof CRAFT_MATS !== 'undefined')
      ? ['ore', 'hide', 'bone'].map(id => CRAFT_MATS[id] && CRAFT_MATS[id].name).filter(Boolean).join('/')
      : '匠材';
    return `装备 Lv.${lv} · 符文 ${runePct}% · 玄晶 ${crysPct}% · 匠材 ${mats}`;
  },

  /* 击杀解锁：首次收录打日志并检查区域全录，之后只累加击杀数 */
  unlockCodex(kind) {
    if (!kind || !MONSTERS[kind]) return null;
    const c = this.codex();
    const first = !c.mon[kind];
    if (first) c.mon[kind] = { kills: 0, at: Date.now() };
    const e = c.mon[kind];
    e.kills = (e.kills || 0) + 1;
    if (first) {
      UI.log('异兽志 · 收录《' + MONSTERS[kind].name + '》', 'good');
      const region = this.codexRegionOf(kind);
      if (region) this.checkCodexRegion(region);
    }
    return e;
  },

  /* 一只怪归哪个区：按 MAPS 的声明顺序取第一个刷它的图。
   * 这样 golem / ghostfire 这类跨区怪只归一个区，不会让两个区都集不齐。 */
  codexRegionOf(kind) {
    for (const id in MAPS) {
      const m = MAPS[id];
      if (m.spawns && m.spawns.indexOf(kind) >= 0) return id;
    }
    return null;
  },

  codexRegionKinds(regionId) {
    const m = MAPS[regionId];
    if (!m || !m.spawns) return [];
    return m.spawns.filter(k => this.codexRegionOf(k) === regionId);
  },

  checkCodexRegion(regionId) {
    const c = this.codex();
    if (c.regions[regionId]) return false;
    const kinds = this.codexRegionKinds(regionId);
    if (!kinds.length || kinds.some(k => !c.mon[k])) return false;
    c.regions[regionId] = true;
    const def = CODEX_REGIONS.find(r => r.id === regionId);
    this.recalc();
    UI.toast('异兽志 · ' + (def ? def.name : regionId) + ' 全录', 'lv');
    if (def) UI.log('【' + def.name + '】异兽尽录：' + def.bonusDesc, 'good');
    return true;
  },

  /* 区域全录的永久加成（computePlayerStats 会合并进面板属性） */
  codexBonus() {
    const c = this.codex();
    const out = {};
    for (const def of CODEX_REGIONS) {
      if (!c.regions[def.id]) continue;
      for (const k in def.bonus) out[k] = (out[k] || 0) + def.bonus[k];
    }
    return out;
  },

  onEnemyDeath(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    /* [P2] 击杀钩子（战鼓延长 / 补刀重置 / 血旋引爆）。
     * 放在 dead 标记之后：引爆再炸死人会递归进这里，dead 挡住回头路 */
    if (typeof this.onBehKill === 'function') this.onBehKill(e);
    e.actor.anim = 'die';
    e.actor.moving = false;
    e.deadT = 0;
    if (e.bar) e.bar.group.visible = false;
    const p = e.pos.clone();
    /* [S16] 怪的死声按族与体型合成；精英换成带尾音的那一版（一听就知道杀了什么） */
    if (typeof AudioSys !== 'undefined') AudioSys.mob(e, e.elite && !e.boss ? 'elite' : 'death');
    else SFX.die();
    if (e.boss) SFX.boss();
    FX.blood(new THREE.Vector3(p.x, 1, p.z), 0x992222, e.boss ? 40 : 16);
    this.hitstop = e.boss ? 140 : 30;
    this.shake = Math.max(this.shake, e.boss ? 0.7 : 0.14);

    /* [C2] 自爆怪被提前打死也会炸，只是威力打个折（70%）。
     * 用意：玩家「先手秒掉它」仍然要付一点走位成本，但远小于等它贴脸引爆。
     * exploded 标记保证只会炸一次 —— mobExplode 自己也会走本方法。 */
    if (e.ai && e.ai.kind === 'bomber' && !e.ai.exploded) this.mobExplode(e, false);

    /* [S5] 图鉴收录：只收普通怪（Boss 走 bossKilled，另算） */
    if (!e.boss) this.unlockCodex(e.kind);

    /* [M1] 行脚套·疾行：击杀后 3 秒移速 / 攻速加成。
     * 只对「非召唤物、非分裂幼体」计，否则一波小怪会把窗口无限续上。 */
    const pst = this.state && this.state.stats;
    if (pst && pst.specials && pst.specials.lootRush && !e.summoned && !e.splitChild) {
      this.lootRushT = 3;
    }

    /* [S5] 亡语：死亡时原地爆炸，4 米内对玩家造成伤害 */
    if (e.aff && e.aff.deathwish && !e.boss) {
      const dw = e.aff.deathwish;
      FX.ring(p, dw.radius, 0xc08aff, 0.7, 0.3);
      FX.flashCircle(p, dw.radius, 0xc08aff, 0.28);
      if (DIST2D(this.playerGroup.position, p) < dw.radius) {
        this.damagePlayer(e.dmg * dw.mult, e);
      }
    }
    /* [S5] 分裂：死亡时裂成 2 只 40% 血的幼体。
     * 不直接 spawnEnemy —— onEnemyDeath 可能在 updateEnemies 的 for..of 里被调用
     * （毒伤跳死），边遍历边 push 会把新怪也塞进本轮循环。先入队，帧末统一处理。 */
    if (e.aff && e.aff.split && !e.splitChild) {
      const sp = e.aff.split;
      if (!this._splitQ) this._splitQ = [];
      for (let i = 0; i < sp.count; i++) {
        const ang = Math.random() * Math.PI * 2;
        this._splitQ.push({
          kind: e.tag, level: e.level,
          x: p.x + Math.cos(ang) * 1.4, z: p.z + Math.sin(ang) * 1.4,
          hp: Math.max(1, Math.round(e.maxHp * sp.hpPct))
        });
      }
      FX.text(new THREE.Vector3(p.x, 2.2, p.z), '分裂', 'info', { life: 0.8 });
    }

    // 经验（[DIFF] 难度越高给得越多，作为硬核的正反馈）
    const D = this.diff();
    /* [v1.10.0] 经验成长系数收进 BALANCE：老版 1 + lv·0.18 + 首领 lv·45，
     * 高档图的怪一只给几百点，一小时能从 1 级推到通关。 */
    const XB = (typeof BALANCE !== 'undefined' ? BALANCE.xp : { mobLv: 0.12, bossLv: 30 });
    const baseXp = e.boss ? (e.cfg.level * XB.bossLv) : (e.cfg.xp || 12) * (1 + e.level * XB.mobLv);
    const xp = Math.round(baseXp * (e.elite ? 2 : 1) * D.xp);
    this.gainXp(xp);

    // 金币
    const goldBase = e.boss ? RND(300, 600) : (e.elite ? RND(30, 60) : RND(6, 18));
    this.spawnLoot(p, null, Math.round(goldBase * (1 + e.level * 0.05) * D.gold));

    // 装备
    const sto = this.state.stats;
    const ilvl = Math.max(1, e.level + (e.boss ? 2 : 0));
    /* [v1.10.0] 掉落改为「按层级分池」：
     *   小怪池 = 凡/灵/玄（掉不出神品以上，从机制上堵住「小怪掉橙」）
     *   精英池 = 灵/玄/神/套装（不出传世）
     *   首领池 = 玄/神/套装/传世（传世 4%）
     * 概率与件数全部来自 BALANCE.drop；magicFind 只在池内加权，且按 mfScale 缩水。 */
    const DB = (typeof BALANCE !== 'undefined' ? BALANCE.drop
      : { normal: { chance: 0.16, extra: 0.35, pool: [['common', 76], ['magic', 21], ['rare', 3]] }, elite: { chance: 0.62, extra: 0.5, pool: [['magic', 54], ['rare', 38], ['legendary', 7], ['set', 1]] }, boss: { count: 2, extra: 0.5, pool: [['rare', 58], ['legendary', 26], ['set', 12], ['unique', 4]] } });
    const tier = e.boss ? DB.boss : (e.elite ? DB.elite : DB.normal);
    let dropChance = Math.min(1, (tier.chance === undefined ? 0.16 : tier.chance) * D.drop);
    let drops = e.boss ? (tier.count || 2) : 1;
    /* [S1] 「掉落数量」词条：额外多掉一件，概率按 mfScale 缩水后封顶 40% */
    if (sto.dropRate && CHANCE(Math.min(0.4, sto.dropRate / 200 * DB.mfScale))) drops += 1;
    for (let i = 0; i < drops; i++) {
      if (i > 0 && !CHANCE(tier.extra === undefined ? 0.5 : tier.extra)) continue;
      if (Math.random() > dropChance) continue;
      let opts = {
        cls: CHANCE(0.78) ? this.state.cls : PICK((typeof classPackIds === 'function' ? classPackIds() : ['warrior', 'mage', 'taoist'])),
        magicFind: this.state.stats.magicFind,
        pool: tier.pool
      };
      const it = rollItem(ilvl, opts);
      this.spawnLoot(p, it, 0);
    }

    /* [S2] 符文 / 玄晶：材料直接进 state.stash.mats，不占背包格。
     * seeker（山海套）提高符文与玄晶的出率、数量。 */
    const seeker = !!sto.flags.seeker;
    const runeChance = e.boss ? 1 : (e.elite ? (seeker ? 0.3 : 0.18) : (seeker ? 0.05 : 0.025));
    /* [DIFF] 符文/玄晶出率同步按难度提升 */
    const runeRoll = Math.min(1, runeChance * D.rune);
    if (CHANCE(runeRoll)) {
      const n = e.boss ? (seeker ? 3 : 2) : 1;
      for (let i = 0; i < n; i++) this.spawnLoot(p, null, 0, { rune: rollRune(ilvl) });
    }
    const crystalChance = e.boss ? 1 : (e.elite ? (seeker ? 0.9 : 0.7) : (seeker ? 0.2 : 0.1));
    if (CHANCE(crystalChance)) {
      const base = e.boss ? RND(8, 14) : (e.elite ? RND(2, 4) : 1);
      this.spawnLoot(p, null, 0, { crystal: Math.round(base * (seeker ? 1.5 : 1)) });
    }

    /* [v1.6.0] 匠材：锻造的原料。低阶遍地、高阶只出在精英与首领身上，
     * 于是「想锻一把好刃」这件事天然被推去打硬仗，而不是刷小怪。 */
    for (const cm of this.rollCraftMats(e.boss ? 'boss' : (e.elite ? 'elite' : 'normal'), D.drop, seeker)) {
      this.spawnLoot(p, null, 0, { mat: cm });
    }

    // 击杀回复
    if (sto.killHeal) this.healPlayer(sto.killHeal, true);
    if (sto.mpOnKill) this.state.mp = Math.min(sto.mpMax, this.state.mp + sto.mpOnKill);
    /* [S2] 血怒：击杀后攻速/移速提升 4 秒，重复触发只刷新时间不叠加 */
    if (sto.flags.bloodRush) {
      const cur = this.buffs.find(b => b.name === '血怒');
      if (cur) { cur.dur = 4; }
      else this.addBuff('血怒', { aspd: 25, moveSpd: 20, dur: 4 }, '#ff6b4a');
    }
    /* [S3] 狂战系大节点·狂怒：血怒期间每次击杀刷新其持续时间 */
    if (sto.specials && sto.specials.frenzyRefresh) {
      const cur = this.buffs.find(b => b.key === 'skill:bloodrage');
      if (cur) {
        cur.dur = 10;
        FX.text(new THREE.Vector3(p.x, 2.6, p.z), '狂怒', 'info', { life: 0.7 });
      }
    }
    /* 传世特性：收魂（击杀回血）/ 狂战（击杀后短时攻速） */
    if (sto.specials) {
      if (sto.specials.soulharvest) this.healPlayer(sto.hpMax * 0.03, true);
      if (sto.specials.berserk) {
        const cur = this.buffs.find(b => b.name === '狂战');
        if (cur) cur.dur = 3;
        else this.addBuff('狂战', { aspd: 25, dur: 3 }, '#ff9a4a');
      }
    }
    /* [S1] 溢出伤害转护盾：把超过致死的那部分按比例变成护盾，上限 30% 生命 */
    if (sto.overkillShield && e.overkill > 0) {
      const add = Math.min(sto.hpMax * 0.1, e.overkill * sto.overkillShield / 100);
      if (add > 1) {
        this.shield = Math.min(sto.hpMax * 0.3, Math.max(this.shield || 0, 0) + add);
        FX.text(new THREE.Vector3(p.x, 2.6, p.z), '+' + Math.round(add) + ' 护盾', 'info');
      }
    }
    // 爆炸特效
    if (this.state.stats.flags.explode) this.explodeAt(p, 3.2, this.state.stats.atk * 0.8, 0xff7a30, false, true);

    this.onKill(e);
    /* [试炼] 击杀计数（结算面板用） */
    if (typeof Trial !== 'undefined' && Trial.run) Trial.run.kills++;
    if (e.boss) {
      this.state.bossKilled[e.kind] = (this.state.bossKilled[e.kind] || 0) + 1;
      this.onBossKill(e);
      if (this.boss === e) { this.boss = null; UI.updateBoss(null); }
      UI.toast('击败 ' + e.cfg.name, 'lv');
      this.save();
      /* [试炼] 试炼场的首领不重生：一来「每 5 波一个首领」已经管够，
       * 二来 BOSS_POS 是按大地图坐标写的，重生点会落在擂台的错误位置。
       * 混沌天魔在试炼里也不触发通关结算（那是主线终章的演出）。 */
      const inTrial = (typeof Trial !== 'undefined' && Trial.active);
      if (inTrial) {
        if (e.kind === 'chaos') UI.log('混沌之影散去，台上又起新的杀机。', 'good');
      } else {
        const bid = e.kind, gen = this.mapGen;
        setTimeout(() => {
          if (this.mapGen !== gen || this.dead || !this.state) return;
          const pos = BOSS_POS[bid] || [0, -30];
          const nb = this.spawnEnemy(null, pos[0], pos[1], false, BOSSES[bid].level, bid);
          if (nb) {
            nb.dmg = BOSSES[bid].atk * (1 + BOSSES[bid].level * 0.09);
            FX.flashCircle(nb.pos, 3, 0xff5522, 0.8);
            UI.log('妖气再聚，' + e.cfg.name + ' 重返此地。', 'bad');
          }
        }, 75000);
        if (bid === 'chaos') this.victory();
      }
    }
  },

  gainXp(amount) {
    const s = this.state;
    /* [S1] 经验获取加成 */
    amount = Math.round(amount * (1 + (s.stats.expGain || 0) / 100));
    s.xp += amount;
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.level++;
      /* [v1.10.0] 曲线收进 BALANCE（base × L^pow），升级点与新建角色同一口径 */
      s.xpNext = (typeof xpToNext === 'function') ? xpToNext(s.level) : Math.round(180 * Math.pow(s.level, 1.70));
      this.recalc();
      /* 升级回满血蓝。试炼里改成「至少回一半」——
       * 试炼大约每 3 波升一级，如果每级都满血，续航压力会被彻底抹平，
       * 药水与「血泉」祝福也就失去意义了。 */
      const inTrial = (typeof Trial !== 'undefined' && Trial.active);
      if (inTrial) {
        s.hp = Math.max(s.hp, Math.round(s.stats.hpMax * 0.5));
        s.mp = Math.max(s.mp, Math.round(s.stats.mpMax * 0.5));
      } else {
        s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
      }
      UI.toast('境界提升 · ' + s.level + ' 级', 'lv');
      SFX.levelup();
      FX.ring(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), 5, 0xffd166, 1.0, 0.3);
      for (let i = 0; i < 30; i++) {
        FX.burst(new THREE.Vector3(this.playerGroup.position.x + RND(-1, 1), RND(0, 2.5), this.playerGroup.position.z + RND(-1, 1)), 0xffd166, 1, { speed: 2, size: 0.12, life: 1.2, gravity: -4, additive: true });
      }
      UI.log('境界提升！生命与灵力已恢复。', 'good');
      /* [v1.8.5] 根基点数每级同步发放，提示一句（不然玩家不知道有新点可加） */
      UI.log(`根基点 +${ATTR_POINTS_PER_LEVEL}（按 C 打开道途分配）`, 'good');
      const un = SKILL_ORDER[s.cls].filter(id => SKILLS[id].unlock === s.level);
      un.forEach(id => {
        UI.toast('领悟 · ' + SKILLS[id].name, 'lv');
        UI.log('领悟新术：' + SKILLS[id].name + '（按 K 打开术法，可放到技能条）', 'good');
        setTimeout(() => SFX.levelup(), 300);
      });
      /* 天赋按级解锁的提示：到点才看得到对应节点 */
      if (typeof TALENT_NODES !== 'undefined') {
        const tl = Object.keys(TALENT_NODES).filter(id => {
          const e = TALENT_NODES[id];
          return e.unlock === s.level && (!e.cls || e.cls === s.cls);
        });
        if (tl.length) {
          UI.log('天赋解锁 ' + tl.length + ' 个新节点（按 T 查看）', 'good');
        }
      }
    }
  },

  /* 刷怪：维持地图怪物密度 */
  updateSpawner(dt) {
    const m = MAPS[this.state.mapId];
    if (m.safe || !m.spawns) return;
    this.mobTimer = (this.mobTimer || 0) + dt;
    /* 先判时间再数怪：原来每帧都 filter 一遍，怪多的时候等于每帧白扔一个数组 */
    if (this.mobTimer <= 18) return;
    this.mobTimer = 0;      // 不论这次刷没刷成功都重新计时，避免满员后每帧都数一遍
    let alive = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss) alive++;
    const cap = m.spawnCount || 14;
    if (alive < cap * 0.6) {
      const n = Math.min(3, cap - alive);
      const pp = this.playerGroup.position;
      /* [M12] 按区域补怪：随机挑一个有刷怪配置的区域，在它内部刷 */
      const zs = (typeof zoneSpawners === 'function') ? zoneSpawners(this.state.mapId) : null;
      for (let i = 0; i < n; i++) {
        let kind = null, p = null;
        if (zs && zs.length) {
          const z = zs[Math.floor(Math.random() * zs.length)];
          kind = zonePickKind(z, m.spawns);
          /* [v1.12.1] 别刷在玩家脸上：连试 6 次，实在找不到远处的位置就这次不刷 */
          for (let k = 0; k < 6; k++) {
            const q = randomPointInZone(z, 2.8);
            if (Math.hypot(q.x - pp.x, q.z - pp.z) >= SPAWN_SAFE) { p = q; break; }
          }
          if (!p) continue;
        } else {
          const ang = Math.random() * 6.28, r = RND(22, m.size * 0.44);
          kind = PICK(m.spawns);
          p = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
        }
        if (!kind) continue;
        /* [DIFF] 刷新怪同样按难度滚精英 */
        const e = this.spawnEnemy(kind, p.x, p.z, CHANCE(this.diff().elite));
        if (e) FX.flashCircle(e.pos, 1.2, 0x9a66ff, 0.5);
      }
    }
  },

  /* ---------------- 世界动画 ---------------- */
  updateWorldAnims(dt) {
    if (!this.world) return;
    for (const fn of this.world.anims) fn(this.time);
    const pp = this.playerGroup.position;
    for (const id in this.npcs) {
      const n = this.npcs[id];
      const d = Math.hypot(pp.x - n.pos.x, pp.z - n.pos.z);
      if (d < 8) {
        // 面向玩家
        const ang = Math.atan2(pp.x - n.pos.x, pp.z - n.pos.z);
        n.group.rotation.y = this.lerpAngle(n.group.rotation.y, ang, 1 - Math.pow(0.02, dt));
      }
      n.group.position.y = Math.sin(this.time * 1.5 + n.pos.x) * 0.02;
      updateActorAnim(n.actor, dt);
    }
  },

  updateInteract() {
    const pp = this.playerGroup.position;
    let target = null, txt = '';
    for (const id in this.npcs) {
      const n = this.npcs[id];
      const d = Math.hypot(pp.x - n.pos.x, pp.z - n.pos.z);
      if (d < 3.4) { target = { type: 'npc', id }; txt = `与 ${NPCS[id].name} 交谈`; break; }
    }
    if (!target && this.world) {
      const p = this.world.portal;
      if (Math.hypot(pp.x - p.x, pp.z - p.z) < 5) { target = { type: 'portal' }; txt = '使用传送阵'; }
    }
    this.interactTarget = target;
    const el = document.getElementById('interact');
    if (target) { el.style.display = 'block'; el.innerHTML = `<b>F</b>${txt}`; }
    else el.style.display = 'none';
  },

  interact() {
    const t = this.interactTarget;
    if (!t) return;
    if (t.type === 'npc') this.openNPC(t.id);
    else if (t.type === 'portal') {
      /* 试炼场里的传送阵就是「退场门」：先确认再走，别让人误触丢进度 */
      if (typeof Trial !== 'undefined' && Trial.active) Trial.quit();
      else UI.openTravel();
    }
  },

  /* ---------------- NPC 交互 ---------------- */
  openNPC(id) {
    const npc = NPCS[id];
    const s = this.state;
    if (id === 'elder') {
      this.openElder();
    } else if (id === 'smith') {
      /* 进货走 ensureShop：5 分钟窗口内反复说话不会换货 */
      this.ensureShop();
      UI.showDialog(npc.name, PICK(npc.lines), [
        { label: '看看货（购买）', action: () => UI.openShop(this.shopItems, '铁匠铺') },
        { label: '借用炼器台', action: () => UI.openForge() },
        { label: '出售凡品', action: () => { this.sellJunk(); UI.showDialog(npc.name, '凡品已经收走了，银货两讫。', [{ label: '告辞', action: () => UI.closeAll() }]); } },
        { label: '筛选出售…', action: () => UI.openSellFilter() },
        { label: '离开', action: () => UI.closeAll() }
      ]);
    } else if (id === 'herbalist') {
      UI.showDialog(npc.name, PICK(npc.lines), [
        { label: `买红药 x5（120 金）`, action: () => this.buyPotion('hp', 5, 120) },
        { label: `买蓝药 x5（120 金）`, action: () => this.buyPotion('mp', 5, 120) },
        { label: '离开', action: () => UI.closeAll() }
      ]);
    } else if (id === 'monk') {
      UI.showDialog(npc.name, PICK(npc.lines), [
        { label: '请为我指路（传送）', action: () => UI.openTravel() },
        { label: '购买传送石（200 金）', action: () => this.buyTeleportStone() },
        { label: '离开', action: () => UI.closeAll() }
      ]);
    } else if (id === 'alchemist') {
      UI.showDialog(npc.name, PICK(npc.lines), [
        { label: '分解装备', action: () => UI.openDecompose() },
        { label: '升级品质', action: () => UI.openUpgradeQuality() },
        { label: '套装打造', action: () => UI.openSetCraft() },
        { label: '离开', action: () => UI.closeAll() }
      ]);
    } else if (id === 'warden') {
      UI.openTrialPanel();
    } else if (id === 'stash' || id === 'steward') {
      /* [M6] 仓库：直接开面板，不套一层对话。
       * 存取是高频动作，每次都要点「打开库房」会烦；台词放在面板顶部一行。 */
      UI.openStash();
    }
  },

  openElder() {
    const s = this.state;
    const elder = NPCS.elder;
    // 有可复命的任务
    const ready = s.quests.active.find(a => this.questReady(a));
    if (ready) {
      const q = QUESTS[ready.id];
      UI.showDialog(elder.name, `「${q.name}」已了。你的手段，比我想的干净。`, [
        {
          label: '复命领赏', primary: true, action: () => {
            this.turnInQuest(ready);
            const next = q.next ? QUESTS[q.next] : null;
            if (next) {
              UI.showDialog(elder.name, next.brief, [
                { label: '接下「' + next.name + '」', primary: true, action: () => { this.acceptQuest(next.id); UI.closeAll(); } },
                { label: '稍后再说', action: () => UI.closeAll() }
              ]);
            } else {
              UI.showDialog(elder.name, '九霄已定，山海重归清明。你已是这方天地最后的传说。', [{ label: '（沉默）', action: () => UI.closeAll() }]);
            }
          }
        },
        { label: '稍后', action: () => UI.closeAll() }
      ]);
      return;
    }
    // 进行中
    if (s.quests.active.length) {
      const a = s.quests.active[0];
      const q = QUESTS[a.id];
      UI.showDialog(elder.name, `「${q.name}」还未了结。\n\n${q.brief}`, [
        { label: '知道了', action: () => UI.closeAll() }
      ]);
      return;
    }
    // 新任务
    const next = QUESTS[s.quests.next];
    if (next) {
      const lines = ['妖气又重了。年轻人，可愿听我一言？', '九霄将倾，总有人要站出来。', '你身上有山海的影子。'];
      UI.showDialog(elder.name, PICK(lines) + '\n\n' + next.brief, [
        { label: '接下「' + next.name + '」', primary: true, action: () => { this.acceptQuest(next.id); UI.closeAll(); } },
        { label: '容我想想', action: () => UI.closeAll() }
      ]);
    } else {
      UI.showDialog(elder.name, '去吧，山海的尽头，自有答案。', [{ label: '告辞', action: () => UI.closeAll() }]);
    }
  },

  /* ---------------- 任务逻辑 ---------------- */
  acceptQuest(id) {
    const q = QUESTS[id];
    this.state.quests.active.push({ id, progress: q.objectives.map(() => 0) });
    this.state.quests.next = q.next || null;
    UI.toast('新委托 · ' + q.name);
    UI.log('【委托】' + q.brief, 'good');
    SFX.ui();
    UI.renderQuests(); UI.updateQuestTrack();
    this.updateQuestMarker();
    this.save();
  },

  questReady(a) {
    const q = QUESTS[a.id];
    return q.objectives.every((o, i) => (a.progress[i] || 0) >= o.count);
  },

  turnInQuest(a) {
    const q = QUESTS[a.id];
    this.state.gold += q.rewards.gold;
    this.gainXp(q.rewards.xp);
    const it = rollItem(q.rewards.ilvl, { cls: this.state.cls, rarity: q.rewards.rarity, magicFind: this.state.stats.magicFind });
    if (this.addItem(it)) UI.log('获得 ' + it.name, 'good');
    // [S3] 任务奖励技能书：解锁指定技能（或下一级未解锁技能）
    if (q.rewards.skill) {
      const sk = SKILLS[q.rewards.skill];
      if (sk && !this.skillFlags[q.rewards.skill]) {
        this.skillFlags[q.rewards.skill] = true;
        UI.log('获得技能书《' + sk.name + '》，已领悟！', 'lv');
        SFX.levelup();
      }
    }
    /* [M1] 任务奖励天赋点：主线四段共 +10，满级天赋点 60 → 70 */
    if (q.rewards.talent) {
      this.state.talentBonus = (this.state.talentBonus || 0) + q.rewards.talent;
      UI.log('获得天赋点 +' + q.rewards.talent, 'lv');
      SFX.levelup();
    }
    this.state.quests.active = this.state.quests.active.filter(x => x !== a);
    this.state.quests.done.push(a.id);
    UI.toast('委托完成 · ' + q.name, 'lv');
    UI.log(`【委托完成】${q.name}　+${q.rewards.gold} 金`, 'good');
    SFX.levelup();
    UI.renderQuests(); UI.updateQuestTrack();
    this.updateQuestMarker();
    this.save();
  },

  onKill(e) {
    const s = this.state;
    for (const a of s.quests.active) {
      const q = QUESTS[a.id];
      q.objectives.forEach((o, i) => {
        if (o.type === 'kill' && o.target === e.tag) a.progress[i] = (a.progress[i] || 0) + 1;
        if (o.type === 'killAny') a.progress[i] = (a.progress[i] || 0) + 1;
        if (o.type === 'boss' && o.target === e.kind) a.progress[i] = (a.progress[i] || 0) + 1;
      });
      if (this.questReady(a) && !s.quests.announced[a.id]) {
        s.quests.announced[a.id] = true;
        UI.toast('委托目标达成 · 回村复命', 'lv');
        UI.log('【委托】目标达成，回桃源村找村长复命。', 'good');
      }
    }
    UI.updateQuestTrack();
    this.updateQuestMarker();
  },

  onBossKill(e) {
    // 已包含在 onKill 中
  },

  victory() {
    this.state.victory = true;
    UI.toast('九 霄 已 定', 'lv');
    UI.log('混沌消散，山海重归清明。', 'good');
    SFX.levelup();
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (this.playerGroup) FX.ring(this.playerGroup.position, 9, 0xffd166, 1.1, 0.4);
      }, i * 240);
    }
    setTimeout(() => {
      UI.showDialog('九霄', '天魔既灭，云开见月。\n\n你回望来路：竹林的雨、沼泽的骨、地宫的灯，都成了传说的一部分。\n\n山海依旧，而你已不再是初入此间的那个人。', [
        { label: '继续行走山海', primary: true, action: () => UI.closeAll() }
      ]);
      this.save();
    }, 1400);
  },

  /* ---------------- 物品操作 ---------------- */
  addItem(item) {
    if (this.state.inventory.length >= this.bagCap()) {
      UI.log('行囊已满，物品散落在地。', 'bad');
      return false;
    }
    this.state.inventory.push(item);
    UI.renderInventory();
    return true;
  },

  /* [v1.8.5] 穿戴需求：等级 + 根基属性。
   * meetsReq 是「静默判断」（背包灰显用），canEquip 会写一行日志。 */
  reqGap(item) {
    const s = this.state;
    if (!s || !item) return [];
    return itemReqGap(item, s.stats, s.cls);
  },
  meetsReq(item) {
    const s = this.state;
    if (!s || !item) return false;
    if (item.cls && item.cls !== s.cls) return false;
    if ((item.reqLv || 1) > s.level) return false;
    return this.reqGap(item).length === 0;
  },
  canEquip(item) {
    const s = this.state;
    if (item.cls && item.cls !== s.cls) { UI.log('此物唯有' + CLASSES[item.cls].name + '可用。', 'bad'); return false; }
    if (item.reqLv > s.level) { UI.log('境界不足，需 ' + item.reqLv + ' 级。', 'bad'); return false; }
    const gap = this.reqGap(item);
    if (gap.length) {
      const txt = gap.map(g => `${ATTR_NAME[g.key]} ${g.need}（现 ${Math.round(g.have)}）`).join(' · ');
      UI.log('属性不足：' + txt + ' —— 按 C 打开道途加点。', 'bad');
      return false;
    }
    return true;
  },

  /* ---------------- 兵器握持与槽位（v1.3.0） ----------------
   * one 单手 / dual 双持 / two 双手。
   * 双手武器占用副手位：装上时自动卸下副手，之后副手也拒绝穿戴。
   * 双持武器可以进副手（主副各一把），副手装备（盾/珠/符）照旧进副手。 */
  handOf(item) {
    return (item && item.slot === 'weapon') ? (item.hand || 'one') : null;
  },
  twoHanded() {
    return this.handOf(this.state && this.state.equipment.weapon) === 'two';
  },
  /* 法器附带术法（v1.3.0）：戴上就能放，卸下即失效 */
  relicGrants(id) {
    const eq = this.state && this.state.equipment;
    const r = eq && eq.relic;
    return !!(r && r.relicGrant === id);
  },
  /* 这件物品能否放进该槽 */
  fitsSlot(item, slot) {
    if (!item) return false;
    if (slot === 'weapon') return item.slot === 'weapon';
    if (slot === 'offhand') return item.slot === 'offhand' || (item.slot === 'weapon' && this.handOf(item) === 'dual');
    if (slot === 'ring1' || slot === 'ring2') return item.slot === 'ring';
    return item.slot === slot;
  },
  /* 点行囊里的装备时，默认落哪个槽 */
  slotForItem(item) {
    const s = this.state;
    if (item.slot === 'ring') return s.equipment.ring1 ? (s.equipment.ring2 ? 'ring1' : 'ring2') : 'ring1';
    /* 双持武器：主手已有兵器、副手空着 → 直接补到副手，省一次拖拽 */
    if (item.slot === 'weapon' && s.equipment.weapon && !s.equipment.offhand && this.handOf(item) === 'dual') return 'offhand';
    return item.slot;
  },

  /* 背包排序（v1.0.4）
   * mode: score 评分 / rarity 品质 / slot 部位 / level 等级
   * 直接重排 state.inventory —— 物品的 data-ref 是下标，视图与数组必须同源。 */
  sortInventory(mode) {
    const s = this.state;
    if (!s || !Array.isArray(s.inventory)) return 0;
    const RANK = { unique: 6, set: 5, legendary: 4, rare: 3, magic: 2, common: 1 };
    const slotIdx = k => {
      const key = (k === 'ring') ? 'ring1' : k;      // item.slot 只有 ring，SLOT_ORDER 里是 ring1/ring2
      const i = (typeof SLOT_ORDER !== 'undefined') ? SLOT_ORDER.indexOf(key) : -1;
      return i < 0 ? 99 : i;
    };
    const byScore = (a, b) => itemScore(b) - itemScore(a);
    const cmp = {
      score: (a, b) => byScore(a, b) || (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0),
      rarity: (a, b) => ((RANK[b.rarity] || 0) - (RANK[a.rarity] || 0)) || byScore(a, b),
      slot: (a, b) => (slotIdx(a.slot) - slotIdx(b.slot)) || byScore(a, b),
      level: (a, b) => ((b.reqLv || 0) - (a.reqLv || 0)) || byScore(a, b)
    }[mode] || byScore;
    s.inventory.sort(cmp);
    UI.renderInventory();
    return s.inventory.length;
  },

  equipFromInv(idx, toSlot) {
    const s = this.state;
    const item = s.inventory[idx];
    if (!item) return;
    if (!this.canEquip(item)) return;
    const slot = toSlot || this.slotForItem(item);
    if (!this.fitsSlot(item, slot)) {
      UI.log(item.slot === 'weapon' ? '此兵器无法放在该手。' : '此物不能装备在这个部位。', 'bad');
      return;
    }
    /* 主手已是双手兵器：副手位被占死，任何副手都不许穿 */
    if (slot === 'offhand' && this.twoHanded()) {
      UI.log('主手为双手兵器，需先换下单手兵器才能使用副手。', 'bad');
      return;
    }
    /* 换双手兵器：副手必须空出来，自动卸回行囊（行囊满则拒绝，避免吞装备） */
    if (slot === 'weapon' && this.handOf(item) === 'two' && s.equipment.offhand) {
      if (s.inventory.length >= this.bagCap()) { UI.log('行囊已满，无法卸下副手。', 'bad'); return; }
      const off = s.equipment.offhand;
      s.equipment.offhand = null;
      s.inventory.push(off);
      UI.log(`双手兵器占用副手位，已卸下${off.name}。`, 'warn');
    }
    const old = s.equipment[slot];
    s.equipment[slot] = item;
    s.inventory.splice(idx, 1);
    if (old) s.inventory.push(old);
    SFX.ui();
    this.recalc();
    this.applyDoll();
    UI.renderInventory();
    UI.renderHUD();
    UI.tooltipEl.style.display = 'none';
    this.checkSetChange();
    this.save();
  },

  unequip(slot) {
    const s = this.state;
    const item = s.equipment[slot];
    if (!item) return;
    /* 副手那把双持兵器依附于主手：主手卸下时一并收回，避免「空手却握着副手刀」 */
    const also = (slot === 'weapon' && s.equipment.offhand && s.equipment.offhand.slot === 'weapon') ? s.equipment.offhand : null;
    const need = also ? 2 : 1;
    if (s.inventory.length + need > this.bagCap()) { UI.log('行囊已满。', 'bad'); return; }
    s.equipment[slot] = null;
    s.inventory.push(item);
    if (also) { s.equipment.offhand = null; s.inventory.push(also); }
    this.recalc();
    this.applyDoll();
    UI.renderInventory();
    UI.renderHUD();
    UI.tooltipEl.style.display = 'none';
    this.checkSetChange();
    this.save();
  },

  checkSetChange() {
    const s = this.state;
    const sets = Object.keys(s.stats.setCount).filter(k => s.stats.setCount[k] >= 2);
    const key = sets.map(k => k + s.stats.setCount[k]).join(',');
    if (key !== this._lastSetKey) {
      this._lastSetKey = key;
      if (sets.length) {
        for (const id of sets) {
          const set = SETS[id];
          const n = s.stats.setCount[id];
          const b = set.bonuses.filter(x => n >= x.need).pop();
          if (b) UI.log(`【${set.name}】${b.text}`, 'good');
        }
        UI.toast('套装之力觉醒', 'lv');
      }
    }
  },

  /* [S3] 出售前自动卸下符文 */
  _unsocketAll(item) {
    if (!item || !item.runes) return;
    for (let i = item.runes.length - 1; i >= 0; i--) {
      const id = item.runes[i];
      if (id) {
        item.runes[i] = null;
        if (FORGE.socketRuneReturn) this.addRune(id, 1);
      }
    }
  },

  sellItem(idx) {
    const s = this.state;
    const item = s.inventory[idx];
    if (!item) return;
    this._unsocketAll(item);
    s.gold += item.value;
    s.inventory.splice(idx, 1);
    SFX.coin();
    UI.log('售出 ' + item.name + '，+' + item.value + ' 金');
    UI.renderInventory(); UI.renderHUD(); UI.tooltipEl.style.display = 'none';
    this.save();
  },

  sellJunk(filterRarities) {
    const s = this.state;
    let gold = 0, n = 0;
    const targets = filterRarities || ['common'];
    s.inventory = s.inventory.filter(it => {
      if (targets.includes(it.rarity)) {
        this._unsocketAll(it);
        gold += it.value; n++; return false;
      }
      return true;
    });
    s.gold += gold;
    UI.log(n ? `售出 ${n} 件，+${gold} 金` : '没有可出售的物品。', n ? 'good' : '');
    UI.renderInventory(); UI.renderHUD();
    if (document.getElementById('shopPanel').classList.contains('open')) UI.openShop(this.shopItems, '铁匠铺');
    this.save();
  },

  /* ---------------- 炼器台（S2） ---------------- */
  socketRune(item, index, runeId) {
    if (!item || !RUNES[runeId]) return { ok: false, msg: '没有这个符文。' };
    if (this.runeCount(runeId) <= 0) return { ok: false, msg: '符文不足。' };
    if (index < 0 || index >= socketCount(item)) return { ok: false, msg: '没有这个孔位。' };
    if (itemRunes(item)[index]) return { ok: false, msg: '该孔已有符文。' };
    if (!insertRune(item, index, runeId)) return { ok: false, msg: '无法镶嵌。' };
    this.addRune(runeId, -1);
    this.recalc();
    SFX.cast();
    const rd = RUNES[runeId];
    UI.log('镶嵌 ' + rd.name + ' · ' + item.name, 'good');
    const w = runeWordOf(item);
    if (w) {
      UI.log('符文之语成形 · ' + w.name, 'good');
      UI.toast(w.name, 'lv');
      SFX.levelup();
      FX.burst(new THREE.Vector3(this.playerGroup.position.x, 1.4, this.playerGroup.position.z), new THREE.Color(w.color).getHex(), 24, { speed: 3, size: 0.12, life: 1, gravity: -2, additive: true });
    }
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true };
  },

  unsocketRune(item, index) {
    const id = removeRuneAt(item, index);
    if (!id) return { ok: false, msg: '这个孔是空的。' };
    if (FORGE.socketRuneReturn) this.addRune(id, 1);
    this.recalc();
    SFX.ui();
    UI.log('取下 ' + RUNES[id].name + (FORGE.socketRuneReturn ? '，已放回符文袋' : ''), 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, rune: id };
  },

  reforgeItem(item, index) {
    if (!item || !Array.isArray(item.affixes) || index < 0 || index >= item.affixes.length) {
      return { ok: false, msg: '没有这条词缀。' };
    }
    const cost = reforgeCost(item);
    if (this.crystalCount() < cost) return { ok: false, msg: '玄晶不足，需要 ' + cost + ' 枚。' };
    this.addCrystal(-cost);
    const a = reforgeAffix(item, index);
    if (!a) return { ok: false, msg: '洗练失败。' };
    this.recalc();
    SFX.cast();
    UI.log('洗练 ' + item.name + '：' + affixText(a), 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, affix: a, cost };
  },

  /* ---------------- [M1/B5] 装备升阶：+1 基底阶，消耗一件同名装备 ----------------
   * 与「品质」升级（锻造）分开：锻造改的是词条条数，升阶改的是「这件装备是什么料」。
   * 材料必须是**同名基底**（baseName 相同、同部位），所以要么留着同名散件，
   * 要么专门去刷同一档的同名底子——这正是计划里「消耗同名装备」的意思。 */
  tierUpMaterial(item) {
    const inv = (this.state && this.state.inventory) || [];
    for (let i = 0; i < inv.length; i++) {
      const it = inv[i];
      if (!it || it === item) continue;
      if (it.slot !== item.slot) continue;
      if (it.baseName && item.baseName && it.baseName === item.baseName) return { index: i, item: it };
    }
    return null;
  },

  tierUpPreview(item) {
    const info = upgradeTierInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const cost = upgradeTierCost(item);
    const mat = this.tierUpMaterial(item);
    return {
      ok: true, info, cost, mat,
      gold: this.state.gold || 0, crystal: this.crystalCount(),
      can: !!mat && (this.state.gold || 0) >= cost.gold && this.crystalCount() >= cost.crystal
    };
  },

  upgradeItemTier(item) {
    if (!item) return { ok: false, msg: '没有这件装备。' };
    const info = upgradeTierInfo(item);
    if (!info.ok) return { ok: false, msg: info.msg };
    const cost = upgradeTierCost(item);
    const mat = this.tierUpMaterial(item);
    if (!mat) return { ok: false, msg: '需要一件同名装备「' + (item.baseName || item.name) + '」作引。' };
    if ((this.state.gold || 0) < cost.gold) return { ok: false, msg: '金币不足，需要 ' + cost.gold + '。' };
    if (this.crystalCount() < cost.crystal) return { ok: false, msg: '玄晶不足，需要 ' + cost.crystal + ' 枚。' };
    /* 校验全过才动东西 */
    this.state.gold -= cost.gold;
    this.addCrystal(-cost.crystal);
    this.state.inventory.splice(mat.index, 1);
    const r = upgradeItemBaseTier(item);
    if (!r) return { ok: false, msg: '升阶失败。' };
    this.recalc();
    SFX.levelup();
    UI.log('升阶 ' + r.oldName + ' → ' + r.newName + '（' + r.from + ' → ' + r.to + '）', 'lv');
    UI.toast(r.to + ' · ' + (item.setId ? item.name : r.newName), 'lv');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, from: r.from, to: r.to, name: r.newName, cost };
  },

  enhanceItem(item) {
    if (!item || !Array.isArray(item.affixes)) return { ok: false, msg: '无法强化该物品。' };
    const maxBase = RARITY[item.rarity].affixes || 0;
    const extra = item.affixes.length - maxBase;
    if (extra >= FORGE.enhanceMax) return { ok: false, msg: '该装备已达到强化上限。' };
    const cost = enhanceCost(item);
    if (this.crystalCount() < cost) return { ok: false, msg: '玄晶不足，需要 ' + cost + ' 枚。' };
    this.addCrystal(-cost);
    const a = enhanceItem(item);
    if (!a) return { ok: false, msg: '强化失败。' };
    this.recalc();
    SFX.cast();
    UI.log('强化 ' + item.name + '：新增 ' + affixText(a), 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, affix: a, cost };
  },

  /* ---------------- 打孔（v1.1.1）：消耗玄晶给装备开孔，上限 FORGE.drillMax ---------------- */
  drillSocketItem(item) {
    if (!item) return { ok: false, msg: '没有这件装备。' };
    if (item.slot === 'ring' || item.slot === 'amulet') return { ok: false, msg: '戒指与项链不可打孔。' };
    if (socketCount(item) >= FORGE.drillMax) return { ok: false, msg: '该装备已达到孔数上限（' + FORGE.drillMax + ' 孔）。' };
    const cost = drillCost(item);
    if (this.crystalCount() < cost) return { ok: false, msg: '玄晶不足，需要 ' + cost + ' 枚。' };
    this.addCrystal(-cost);
    const n = drillSocket(item);
    if (!n) return { ok: false, msg: '打孔失败。' };
    this.recalc();
    SFX.cast();
    UI.log('打孔 ' + item.name + '：第 ' + n + ' 孔（上限 ' + FORGE.drillMax + '）', 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, sockets: n, cost };
  },

  /* ---------------- 套装打造（v1.1.2）：把装备打造成指定套装件 ---------------- */
  craftSetItem(item, setId) {
    if (!item) return { ok: false, msg: '没有这件装备。' };
    if (item.setId) return { ok: false, msg: '该装备已是套装（' + (item.setName || '') + '）。' };
    if (item.rarity === 'unique') return { ok: false, msg: '传世装备无法打造为套装。' };
    const targets = setCraftTargets(item);
    if (!targets.some(s => s.id === setId)) return { ok: false, msg: '该套装没有这个部位，打造不了。' };
    const cost = setCraftCost(item);
    if (this.state.gold < cost.gold) return { ok: false, msg: '金币不足，需要 ' + cost.gold + '。' };
    for (let i = 0; i < 4; i++) {
      if (this.crystalTierCount(i + 1) < cost.crystal[i]) {
        return { ok: false, msg: CRYSTAL_TIERS[i].name + '不足，需要 ' + cost.crystal[i] + ' 枚。' };
      }
    }
    this.state.gold -= cost.gold;
    for (let i = 0; i < 4; i++) this.addCrystalTier(i + 1, -cost.crystal[i]);
    const r = craftSetItem(item, setId);
    if (!r) return { ok: false, msg: '打造失败。' };
    this.recalc();
    SFX.levelup();
    UI.log('套装打造 · ' + r.oldName + ' → ' + r.setName + '「' + r.piece + '」', 'lv');
    UI.toast(r.setName + ' · ' + r.piece, 'lv');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, setName: r.setName, piece: r.piece, cost };
  },

  /* ---------------- 锻造（v1.6.0）：匠材 + 凡品/灵品胚 → 更高品质 ----------------
   * 与「套装打造」（把属性好的装备改成套装件）不同，锻造是**入口**：
   *   白装 / 蓝装这些必被淘汰的底子，掺上匠材重铸一次，
   *   部位、职业、等级都不变，品质往上抬一档到两档。
   * 于是行囊里的垃圾有了去处，也不必为了「刷出更好的词条」去反复刷同一只怪。
   *
   * 结算顺序：先算配方 → 校验 → 扣料 → rollItem → 原地替换。
   * 任何一步失败都不动材料（扣料在全部校验之后）。
   */
  craftPreview(index) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const item = s.inventory && s.inventory[index];
    if (!craftableItem(item)) return { ok: false, msg: '只有凡品或灵品的装备能作为胚。' };
    const info = craftInfo(item);
    if (!info) return { ok: false, msg: '这件装备没有可用的锻造配方。' };
    const table = CRAFT_OUTCOME[item.rarity] || [];
    return { ok: true, item, info, table, tier: info.tier };
  },

  craftItem(index) {
    const s = this.state;
    if (!s) return { ok: false, msg: '尚未开局。' };
    const item = s.inventory && s.inventory[index];
    if (!craftableItem(item)) return { ok: false, msg: '只有凡品或灵品的装备能作为胚。' };
    const info = craftInfo(item);
    if (!info) return { ok: false, msg: '这件装备没有可用的锻造配方。' };
    if (!info.can) return { ok: false, msg: '锻造材料不足：还差 ' + info.lack.join('、') + '。' };

    /* 全部校验通过才动材料：任何一环失败都不该扣东西 */
    for (const m of info.mats) if (m.need > 0) this.addCraftMat(m.id, -m.need);
    s.gold = Math.max(0, (s.gold || 0) - info.gold);

    const cls = item.cls || item.affixCls || s.cls;
    const rarity = craftOutcomeRarity(item.rarity);
    const out = rollItem(item.ilvl, { slot: item.slot, cls, rarity, noRelic: true });
    if (!out) {
      /* 兜底退款：理论上走不到，但材料是玩家辛苦刷的，宁可退 */
      for (const m of info.mats) if (m.need > 0) this.addCraftMat(m.id, m.need);
      s.gold += info.gold;
      return { ok: false, msg: '锻造失败，材料已退回。' };
    }
    const baseName = item.name;
    out.craftedFrom = baseName;
    s.inventory[index] = normalizeItem(out);

    SFX.levelup();
    UI.log('锻造 · ' + baseName + ' → ' + out.name + '（' + RARITY[out.rarity].name + '）', 'lv');
    UI.toast('锻造成功 · ' + RARITY[out.rarity].name, 'lv');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, item: s.inventory[index], rarity: out.rarity, from: baseName, cost: info };
  },

  /* ---------------- 定向洗炼（v1.2）：锁定单条词条，数值只升不降 ----------------
   * 每次只动选中的那 1 条，词条不变，新数值必定 > 洗练前数值。
   * 封顶后不再扣费，提示换更高 ilvl 的装备。 */
  upgradeAffixItem(item, index) {
    if (!item || !Array.isArray(item.affixes) || index < 0 || index >= item.affixes.length) {
      return { ok: false, msg: '没有这条词缀。' };
    }
    const cur = item.affixes[index];
    if (!cur || !cur.key || !STATS[cur.key]) return { ok: false, msg: '这条词缀不可升级。' };
    const def = AFFIXES.find(a => a.key === cur.key);
    if (!def) return { ok: false, msg: '词条数据异常。' };
    const label = STATS[cur.key].label;
    const cap = affixValueCap(def, item.ilvl || 1);
    if (cur.val >= cap) {
      return { ok: false, capped: true, msg: '「' + label + '」已达本装备等级上限 +' + cur.val + '，升不动了。' };
    }
    const cost = reforgeCost(item);
    if (this.crystalCount() < cost) return { ok: false, msg: '玄晶不足，需要 ' + cost + ' 枚。' };
    this.addCrystal(-cost);
    const r = upgradeAffix(item, index);
    if (!r) { this.addCrystal(cost); return { ok: false, msg: '升级失败，玄晶已退回。' }; }   // 兜底退款
    this.recalc();
    SFX.cast();
    UI.log('定向洗炼 · ' + item.name + '：' + label + ' +' + r.prev + ' → +' + r.affix.val +
      '（+' + r.gain + ' 点' + (r.affix.val >= r.cap ? '，已封顶 ' + r.cap : '') + '）', 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, affix: r.affix, prev: r.prev, gain: r.gain, cap: r.cap, cost, forced: r.forced };
  },

  /* ---------------- 定向洗炼（v1.1.3）：自动洗到指定词条才停 ---------------- */
  targetedReforge(item, index, targetKey) {
    if (!item || !Array.isArray(item.affixes) || index < 0 || index >= item.affixes.length) {
      return { ok: false, msg: '没有这条词缀。' };
    }
    const def = AFFIXES.find(a => a.key === targetKey);
    if (!def) return { ok: false, msg: '没有这个词条。' };
    const label = (STATS[targetKey] || {}).label || targetKey;
    const cur = item.affixes[index];
    if (cur && cur.key === targetKey) return { ok: false, msg: '这条词缀已经是「' + label + '」了。', already: true };
    /* 同装备不会出重复词条：其他位与固定词条已占用同一 key 时永远洗不出来 */
    const clash = item.affixes.some((a, i) => i !== index && a && a.key === targetKey)
      || (item.fixed || []).some(a => a && a.key === targetKey);
    if (clash) return { ok: false, msg: '其他词缀位已有「' + label + '」，同装备不重复，换个目标吧。' };

    const MAX_TRY = 500;   // 安全阀：费用逐次 +35%，正常会先被玄晶耗尽拦住
    let attempts = 0, spent = 0;
    while (attempts < MAX_TRY) {
      const cost = reforgeCost(item);
      if (this.crystalCount() < cost) {
        this.recalc(); SFX.ui();
        UI.renderInventory(); UI.renderHUD(); this.save();
        return { ok: false, msg: '玄晶不足，定向洗炼中断（已洗 ' + attempts + ' 次，消耗 ' + spent + ' 玄晶）。', attempts, spent };
      }
      this.addCrystal(-cost);
      spent += cost;
      const a = reforgeAffix(item, index);
      attempts++;
      if (a && a.key === targetKey) {
        this.recalc();
        SFX.levelup();
        UI.log('定向洗炼成功 · ' + item.name + ' 第 ' + (index + 1) + ' 条 → ' + affixText(a) +
          '（' + attempts + ' 次 / ' + spent + ' 玄晶）', 'lv');
        UI.toast('洗出 ' + label + ' · ' + attempts + ' 次', 'lv');
        UI.renderInventory(); UI.renderHUD(); this.save();
        return { ok: true, affix: a, attempts, spent };
      }
    }
    this.recalc(); SFX.ui();
    UI.renderInventory(); UI.renderHUD(); this.save();
    return { ok: false, msg: '已洗 ' + MAX_TRY + ' 次仍未洗出「' + label + '」，建议换个目标或攒够玄晶再来。', attempts, spent };
  },

  /* [S3] 分解装备 → 玄晶分级材料 */
  /* 分解产出表（稀有度 + ilvl 折算），preview / 单个 / 一键分解共用 */
  _decomposeYield(item) {
    const yields = {
      common:   [3, 0, 0, 0],
      magic:    [2, 1, 0, 0],
      rare:     [0, 2, 1, 0],
      legendary:[0, 0, 2, 1],
      set:      [0, 3, 1, 0],
      unique:   [0, 0, 3, 2]
    };
    const base = yields[item.rarity] || [1, 0, 0, 0];
    const mul = 1 + (item.ilvl || 1) * 0.06;
    return base.map(n => Math.max(0, Math.round(n * mul)));
  },

  previewDecompose(item) {
    if (!item) return null;
    const out = this._decomposeYield(item);
    const txt = out.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、') || '无';
    return { yields: out, text: txt };
  },

  decomposeItem(item) {
    if (!item) return { ok: false, msg: '没有可分解的装备。' };
    const out = this._decomposeYield(item);
    for (let i = 0; i < 4; i++) this.addCrystalTier(i + 1, out[i]);
    const txt = out.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、');
    SFX.cast();
    UI.log('分解 ' + item.name + ' 获得 ' + txt, 'good');
    this.save();
    return { ok: true, yields: out, text: txt };
  },

  /* ---------------- 一键分解（v1.1.4 起；v1.9.2 改为品质阈值） ----------------
   * 老版只有一个「连带法器」勾选框，而它认的其实是 rarity==='magic'（灵品），
   * 名字叫法器、行囊里却按品质一刀切 —— 玩家按了以为只清白装，一整排灵品
   * 跟着没了。现在改成<b>品质阈值</b>：选到哪一档，就把该档及以下的装备一起分
   * （凡 → 灵 → 玄 → 神），选档即预览，产出实时更新。
   *
   * 两条永不参与：
   *   1. 套装 / 传世 是「类型」不是品质档，不在 JUNK_TIERS 链上，任何档都碰不到；
   *   2. 身上穿着的（含老档里「穿戴品同时留在行囊」的脏数据，按 uid + 对象身份双查）。
   * 带镶嵌的装备先自动卸下符文（全额返还）再分解，符文不会被吞。 */
  JUNK_TIERS: ['common', 'magic', 'rare', 'legendary'],

  /* 阈值归一化：接受档位键 / 下标 / 老版布尔（true = 连带灵品，false = 只分凡品） */
  junkTierKey(tier) {
    const T = this.JUNK_TIERS;
    if (typeof tier === 'boolean') return tier ? 'magic' : 'common';
    if (typeof tier === 'number') return T[Math.max(0, Math.min(T.length - 1, Math.round(tier)))] || 'common';
    return T.includes(tier) ? tier : 'common';
  },

  /* 待分清单：品质 ≤ 阈值，且不在身上 */
  junkList(tier) {
    const s = this.state;
    const max = this.junkTierKey(tier);
    const allow = this.JUNK_TIERS.slice(0, this.JUNK_TIERS.indexOf(max) + 1);
    const worn = new Set(), wornUid = new Set();
    const eq = (s && s.equipment) || {};
    for (const k in eq) {
      const it = eq[k];
      if (!it) continue;
      worn.add(it);
      if (typeof it.uid === 'number') wornUid.add(it.uid);
    }
    return ((s && s.inventory) || []).filter(it =>
      it && allow.includes(it.rarity) &&
      !worn.has(it) && !(typeof it.uid === 'number' && wornUid.has(it.uid)));
  },

  previewDecomposeJunk(tier) {
    const max = this.junkTierKey(tier);
    const list = this.junkList(max);
    const total = [0, 0, 0, 0];
    const byRarity = {};
    for (const it of list) {
      const y = this._decomposeYield(it);
      for (let i = 0; i < 4; i++) total[i] += y[i];
      byRarity[it.rarity] = (byRarity[it.rarity] || 0) + 1;
    }
    /* 行囊里「各档各有多少件」：按钮上的数字用这个，玩家才能一眼看出
     * 「再往上抬一档会多毁掉几件」，而不是被范围内的累计数绕晕。 */
    const bagByRarity = {};
    for (const k of this.JUNK_TIERS) bagByRarity[k] = 0;
    for (const it of this.junkList('legendary')) bagByRarity[it.rarity] = (bagByRarity[it.rarity] || 0) + 1;
    return {
      tier: max,
      tierName: (RARITY[max] || {}).name || max,
      tiers: this.JUNK_TIERS.map(k => ({ key: k, name: (RARITY[k] || {}).name || k, color: (RARITY[k] || {}).color || '#cfcfd6' })),
      count: list.length,
      magicCount: byRarity.magic || 0,
      byRarity,
      bagByRarity,
      yields: total,
      text: total.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、') || '无'
    };
  },

  decomposeJunk(tier) {
    const s = this.state;
    const max = this.junkTierKey(tier);
    const tierName = (RARITY[max] || {}).name || max;
    const targets = this.junkList(max);
    if (!targets.length) {
      return { ok: false, msg: '没有可分解的' + tierName + '及以下装备。' };
    }
    const total = [0, 0, 0, 0];
    for (const it of targets) {
      this._unsocketAll(it);
      const y = this._decomposeYield(it);
      for (let i = 0; i < 4; i++) total[i] += y[i];
    }
    /* 按对象身份剔除：uid 可能重复（老档脏数据），身份不会 */
    const gone = new Set(targets);
    s.inventory = s.inventory.filter(it => !(it && gone.has(it)));
    for (let i = 0; i < 4; i++) this.addCrystalTier(i + 1, total[i]);
    const txt = total.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、');
    SFX.levelup();
    UI.log('一键分解 ' + targets.length + ' 件「' + tierName + '及以下」装备，获得 ' + txt, 'lv');
    UI.toast('分解 ' + targets.length + ' 件 · ' + txt, 'lv');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, count: targets.length, tier: max, tierName, yields: total };
  },

  /* [S3] 升级装备品质：common→magic→rare→legendary */
  upgradeItemQuality(item) {
    if (!item) return { ok: false, msg: '没有可升级的装备。' };
    /* 传世是最终装备，套装由打造产出，两者都不走品质升级链 */
    if (item.rarity === 'unique') return { ok: false, msg: '传世是最终装备，已是装备链终点，无法再提升品质。' };
    if (item.rarity === 'set') return { ok: false, msg: '套装由打造产出，不走品质升级。' };
    const chain = ['common', 'magic', 'rare', 'legendary'];
    const idx = chain.indexOf(item.rarity);
    if (idx < 0 || idx >= chain.length - 1) return { ok: false, msg: '该装备已是最高品质，无法继续升级。' };
    const target = chain[idx + 1];
    const costs = { common: [10, 0, 0, 0], magic: [0, 15, 0, 0], rare: [0, 0, 25, 0] };
    const cost = costs[item.rarity] || [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      if (this.crystalTierCount(i + 1) < cost[i]) {
        return { ok: false, msg: CRYSTAL_TIERS[i].name + '不足，需要 ' + cost[i] + ' 枚。' };
      }
    }
    for (let i = 0; i < 4; i++) this.addCrystalTier(i + 1, -cost[i]);
    // 升级稀有度，补齐可洗练词条数量，并按新品质补齐固定词条
    const oldRarity = item.rarity;
    item.rarity = target;
    const wantAffixes = (RARITY[target].affixes || 0) + affixLevelBonus(item.ilvl).wash;
    const used = new Set(item.affixes.map(a => a.key));
    for (const fa of (item.fixed || [])) if (fa && fa.key) used.add(fa.key);
    while (item.affixes.filter(a => a && !a.rare).length < wantAffixes) {
      item.affixes.push(makeAffix(item.ilvl || 1, used, item.affixCls || item.cls, item.slot));
    }
    fillFixedAffixes(item);
    // 重新 roll 基底数值
    if (item.baseArmor) {
      const mul = RARITY[target].mul / RARITY[oldRarity].mul;
      item.baseArmor = Math.round(item.baseArmor * mul);
    }
    if (item.baseDmg) {
      const mul = RARITY[target].mul / RARITY[oldRarity].mul;
      item.baseDmg[0] = Math.round(item.baseDmg[0] * mul);
      item.baseDmg[1] = Math.round(item.baseDmg[1] * mul);
    }
    this.recalc();
    SFX.levelup();
    UI.log(item.name + ' 品质提升至 ' + RARITY[target].name + '！', 'good');
    UI.renderInventory();
    UI.renderHUD();
    this.save();
    return { ok: true, rarity: target, cost };
  },

  /* ---------------- 商店（v1.0.4） ----------------
   *
   * 规则：
   *   · 每 5 分钟免费换一批货；
   *   · 等不及可以花金币立刻刷新，同一窗口内连续刷新价格递增（1.8 倍，最多算 4 次）；
   *   · 刷新状态写进存档，刷新页面 / 重开游戏都不会白嫖到新货。
   *
   * 旧版是「每次跟铁匠说话就 genShop()」，等于无限免费刷新，
   * 5 分钟刷新的意义会被完全绕开，所以进货统一走 ensureShop()。 */
  ensureShop() {
    const s = this.state;
    if (!s) return false;
    const sh = s.shop;
    const expired = !sh || !Array.isArray(sh.items) || !sh.items.length ||
      !sh.at || (Date.now() - sh.at) >= SHOP_REFRESH_MS;
    if (expired) { this.genShop(0); return true; }
    this.shopItems = sh.items;
    return false;
  },

  shopRemainMs() {
    const sh = this.state && this.state.shop;
    if (!sh || !sh.at) return 0;
    return Math.max(0, SHOP_REFRESH_MS - (Date.now() - sh.at));
  },

  /* 金币刷新价格：随境界线性上涨，同一窗口内每次 ×1.8（最多按 4 次计） */
  shopRefreshCost() {
    const s = this.state;
    if (!s) return 0;
    const rolls = (s.shop && s.shop.rolls) || 0;
    const base = 80 + s.level * 12;
    const raw = base * Math.pow(1.8, Math.min(rolls, 4));
    return Math.round(raw / 10) * 10;
  },

  refreshShopPaid() {
    const s = this.state;
    if (!s) return { ok: false };
    const cost = this.shopRefreshCost();
    if (s.gold < cost) { UI.log('金币不足，刷新需 ' + cost + ' 金。', 'bad'); return { ok: false, cost }; }
    s.gold -= cost;
    this.genShop(((s.shop && s.shop.rolls) || 0) + 1);
    SFX.coin();
    UI.log('铁匠铺换了新货（-' + cost + ' 金）。', 'good');
    UI.renderHUD();
    this.save();
    return { ok: true, cost };
  },

  genShop(rolls) {
    const s = this.state;
    const lv = s.level;
    const items = [];
    for (let i = 0; i < 6; i++) {
      const it = rollItem(Math.max(1, lv + RNDI(0, 3)), {
        cls: CHANCE(0.8) ? s.cls : PICK((typeof classPackIds === 'function') ? classPackIds() : ['warrior', 'mage', 'taoist']),
        rarity: i === 0 ? 'rare' : (CHANCE(0.55) ? 'magic' : 'common')
      });
      items.push({ item: it, price: Math.round(it.value * 3.2) });
    }
    this.shopItems = items;
    s.shop = { at: Date.now(), items: items, rolls: rolls || 0 };
  },

  buyShopItem(idx) {
    const entry = this.shopItems[idx];
    if (!entry) return;
    if (this.state.gold < entry.price) { UI.log('金币不足。', 'bad'); return; }
    this.state.gold -= entry.price;
    if (!this.addItem(entry.item)) { this.state.gold += entry.price; return; }
    SFX.coin();
    UI.log('购入 ' + entry.item.name, 'good');
    this.shopItems.splice(idx, 1);
    /* shopItems 与 state.shop.items 是同一个数组引用，卖掉的货要同步消失，
     * 否则关掉面板再打开会「复活」，等于无限买同一件 */
    UI.openShop(this.shopItems, '铁匠铺');
    UI.renderHUD();
    this.save();
  },

  buyPotion(type, n, price) {
    if (this.state.gold < price) { UI.log('金币不足。', 'bad'); return; }
    this.state.gold -= price;
    this.state.potions[type] += n;
    SFX.coin();
    UI.log(`购得${type === 'hp' ? '红药' : '蓝药'} x${n}`, 'good');
    UI.renderHUD();
    UI.closeAll();
    this.save();
  },

  usePotion(type) {
    const s = this.state;
    if (this.dead) return;
    if (s.potions[type] <= 0) { UI.log('药已用尽。', 'bad'); return; }
    if (type === 'hp') {
      if (s.hp >= s.stats.hpMax) return;
      s.potions.hp--;
      this.healPlayer(s.stats.hpMax * 0.45);
      FX.ring(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), 2, 0xff6a5a, 0.5);
    } else {
      if (s.mp >= s.stats.mpMax) return;
      s.potions.mp--;
      s.mp = Math.min(s.stats.mpMax, s.mp + s.stats.mpMax * 0.55);
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.4, this.playerGroup.position.z), '+' + Math.round(s.stats.mpMax * 0.55) + ' 灵力', 'info');
      SFX.cast();
    }
    UI.renderHUD();
  },

  buyTeleportStone() {
    const price = 200;
    if (this.state.gold < price) { UI.log('金币不足。', 'bad'); return; }
    this.state.gold -= price;
    this.state.teleportStones = (this.state.teleportStones || 0) + 1;
    SFX.coin();
    UI.log('购得传送石 ×1', 'good');
    UI.renderHUD();
    this.save();
  },

  useTeleportStone() {
    const s = this.state;
    if (this.dead) return;
    if ((s.teleportStones || 0) <= 0) { UI.log('没有传送石。', 'bad'); return; }
    s.teleportStones--;
    UI.openTravel();
    UI.renderHUD();
  },

  tryDash() {
    if (!this.state || this.dead || this.dashCd > 0) return;
    this.dashCd = 1.3;
    this.dashT = 0.18;
    this.dashSpd = DASH_SPD.dodge;
    this.invuln = 0.3;
    SFX.swing();
    const d = this.lastMoveDir || { x: Math.sin(this.playerGroup.rotation.y), z: Math.cos(this.playerGroup.rotation.y) };
    this.lastMoveDir = d;
  },

  travelTo(mapId) {
    if (!MAPS[mapId]) return;
    const m = MAPS[mapId];
    if (this.state.level < (m.unlock || 1)) { UI.log('境界不足。', 'bad'); return; }
    /* 试炼中不允许直接传送：先把本轮结算掉，否则祝福会跟着人跑到别的地图上 */
    if (typeof Trial !== 'undefined' && Trial.active) {
      Trial.end('quit');
      if (mapId === 'trial') return;
    }
    FX.flashCircle(this.playerGroup.position, 3, 0x88bbff, 0.6);
    SFX.cast();
    setTimeout(() => {
      this.loadMap(mapId);
      UI.toast(m.name, 'lv');
    }, 120);
  },

  /* ---------------- 存档 ---------------- */
  save() {
    if (!this.state) return false;
    /* 技能领悟标记挂在本体上，落盘前并回 state，pack 才会带走 */
    if (this.skillFlags) this.state.skillFlags = this.skillFlags;
    /* [C3] 未确认的加点不落盘。
     * 草稿是「直接改真实状态、不写盘」，所以任何一次存档（20 秒自动存档、
     * 捡东西、交任务）都会顺手把草稿定格成永久改动 —— 那「确认才生效」
     * 就只剩个样子了，关掉网页再进来点位已经花掉。
     * 做法是在序列化的这一瞬间把三项临时换回快照值，写完立刻换回来：
     * 只影响这一次写盘，不改变运行中的状态，也不需要各条存档路径配合。 */
    const hold = (typeof UI !== 'undefined' && UI.snapHold) ? UI.snapHold() : null;
    let undo = null;
    if (hold) {
      const s = this.state;
      const clone = o => JSON.parse(JSON.stringify(o || {}));
      const a0 = s.attrAlloc, t0 = this.talentState().spent, k0 = s.skills;
      if (hold.attr) s.attrAlloc = clone(hold.attr);
      if (hold.talent) this.talentState().spent = clone(hold.talent);
      if (hold.skill) s.skills = clone(hold.skill);
      undo = () => { s.attrAlloc = a0; this.talentState().spent = t0; s.skills = k0; };
    }
    let ok = true;
    try {
      if (typeof SaveManager !== 'undefined') {
        ok = SaveManager.save(this.state, this.savedSlot || SaveManager.activeSlot());
      } else {
        Store.set(JSON.stringify(this.state));
      }
    } catch (e) { ok = false; }
    finally { if (undo) undo(); }
    this.lastSave = this.time;
    /* [M6] 仓库是独立 key，必须和角色档一起落盘。
     * 漏了这一步的表现是：材料捡了、东西存了，重开网页全没了 —— 而角色等级还在。 */
    if (typeof StashStore !== 'undefined') {
      try { StashStore.save(); } catch (e) { ok = false; }
    }
    if (!ok) {
      UI.log('存档写入失败（可能空间不足），请导出备份。', 'bad');
      if (typeof SaveManager !== 'undefined') console.warn('[存档]', SaveManager.lastError);
    }
    return ok;
  },

  autoSave() {
    if (this.time - this.lastSave > 20) this.save();
  },

  /* 从角色位进入游戏（开始界面 / 存档面板共用） */
  loadGame(slot) { return this.loadSlot(slot); },

  loadSlot(slot) {
    if (typeof SaveManager === 'undefined') return false;
    const n = SaveManager.validSlot(slot || SaveManager.activeSlot());
    const flat = SaveManager.load(n);
    if (!flat) { UI.log('该角色位没有存档。', 'bad'); return false; }
    this.state = flat;
    this.skillFlags = this.state.skillFlags || {};   // 技能领悟标记随档走
    if (typeof UI !== 'undefined') UI.snaps = null;   // 读档：上一份加点草稿作废
    this.normalizePlayerItems(this.state);
    /* 技能条：旧档没有整条配置时才按「已领悟」补空位；
     * 玩家存过的配置（含手动腾空的格）原样沿用 */
    const barMissing = !Array.isArray(this.state.skillbar);
    this.normalizeProgress(this.state);
    this.skillBar(barMissing);
    this.state.quests = this.state.quests || { active: [], done: [], next: 'q1', announced: {} };
    this.state.quests.announced = this.state.quests.announced || {};
    /* [试炼] 存档里的 mapId 可能是 trial（在台上被关掉页面）。
     * 试炼的波次进度不落盘（这是 roguelite 的规矩：中途退出即作废），
     * 所以这里把玩家送回村，而不是让他站在一个没有波次的空擂台上。 */
    if (this.state.mapId === 'trial' || !MAPS[this.state.mapId]) {
      this.state.mapId = 'village';
      this.state.playerPos = { x: 0, z: 10 };
    }
    this.savedSlot = n;
    /* 读档后把商店货架接回来（存档里带 { at, items, rolls }）。
     * 过期或结构不对就重新进货，避免面板打开时是空的。 */
    this.shopItems = (this.state.shop && Array.isArray(this.state.shop.items)) ? this.state.shop.items : [];
    this.ensureShop();
    this.recalc();
    this.setupPlayer();
    this.loadMap(this.state.mapId || 'village');
    UI.hideStart();
    if (this.titleGroup) this.titleGroup.visible = false;
    UI.buildActionBar();
    UI.renderHUD();
    this.running = true;
    this.dead = false;
    UI.toast('继 续 前 世 · 位 ' + n, 'lv');
    this.save();
    UI.log(`【角色位 ${n}】${this.state.name} · ${CLASSES[this.state.cls].name} ${this.state.level} 级。`, 'good');
    return true;
  },

  deleteSlot(slot) {
    if (typeof SaveManager === 'undefined') return false;
    return SaveManager.deleteSlot(slot);
  }
};

window.addEventListener('load', () => {
  Game.init();
  document.getElementById('nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('startBtn').click();
    e.stopPropagation();
  });
  // 切后台 / 关页面前强制存一次（手机端尤其重要，Safari 会直接杀标签）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.running && Game.state) Game.save();
  });
  window.addEventListener('pagehide', () => { if (Game.running && Game.state) Game.save(); });
  window.addEventListener('beforeunload', () => { if (Game.running && Game.state) Game.save(); });
});
