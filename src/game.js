/* ============================================================
 * 主逻辑：渲染 / 输入 / 战斗 / 敌人AI / Boss / 掉落 / 任务 / 存档
 * ============================================================ */

/* 铁匠铺免费刷新周期：5 分钟（v1.0.4） */
const SHOP_REFRESH_MS = 5 * 60 * 1000;

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

const BOSS_POS = {
  treeking: [28, -26], batking: [-30, -22],  chief: [34, 26], golemking: [-36, 24], snakequeen: [0, -36],
  ghostlord: [30, 30], firegeneral: [-32, 28], icequeen: [0, -34],
  spidermother: [30, 30], ferryman: [-32, 30], swordlord: [0, -32],
  chaos: [0, -30]
};

const Game = {
  /* three */
  renderer: null, scene: null, camera: null, clock: null, sun: null, hemi: null,
  camYaw: 0, camDist: 11.6, camHeight: 12.2, camPunch: 0,

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
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      showFatal('WebGL 上下文丢失（显卡驱动或内存不足）。\n请刷新页面，或关闭其他占用显卡的标签页。');
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
    try {
      UI.setHelp('<b>WASD</b> 移动 · <b>左键</b> 攻击 · <b>1-6</b> 技能 · <b>空格</b> 翻滚 · <b>F</b> 交互<br><b>Q/E</b> 转视角 · <b>滚轮</b> 缩放 · <b>R</b> 炼器 · <b>I</b> 背包 · <b>C</b> 属性 · <b>L</b> 任务 · <b>P</b> 存档 · <b>O</b> 设置');
    } catch (e) { }

    window.addEventListener('resize', () => this.updateViewport());
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
      if (k >= '1' && k <= '6') {
        const id = SKILL_ORDER[this.state ? this.state.cls : 'warrior'][parseInt(k) - 1];
        if (id) this.castSkill(id);
      }
      if (k === '7') this.usePotion('hp');
      if (k === '8') this.usePotion('mp');
      if (k === '9') this.useTeleportStone();
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
        'Digit7': '7', 'Digit8': '8'
      };
      const mapped = codeMap[e.code];
      if (mapped) this.keys[mapped] = false;
    });
    /* [FIX-BUG1] 窗口失焦时清除所有按键状态，防止按键"卡住" */
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });

    const cv = this.renderer.domElement;
    cv.addEventListener('mousedown', e => {
      if (IS_TOUCH) return;   // 触屏由虚拟按键接管
      if (e.button === 0) { this.mouseDown = true; SFX.init(); }
      if (e.button === 2) { const id = SKILL_ORDER[this.state.cls][0]; this.castSkill(id); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (IS_TOUCH) return;   // 触屏走自动瞄准
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.updateAim();
    });
    cv.addEventListener('wheel', e => {
      this.camDist = CLAMP(this.camDist + e.deltaY * 0.012, 11.6, 32);
      this.camHeight = 12.2 + (this.camDist - 11.6) * 0.42;
      e.preventDefault();
    }, { passive: false });

    document.getElementById('death').addEventListener('click', e => e.stopPropagation());
  },

  updateAim() {
    if (IS_TOUCH) return this.updateAutoAim();
    if (!this.camera) return;
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
      cls, name, level: 1, xp: 0, xpNext: 120, gold: 120,
      difficulty: diff,
      potions: { hp: 4, mp: 3 },
      teleportStones: 0,
      hp: 100, mp: 50,
      equipment: { helm: null, chest: eq.chest, shoulders: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, weapon: eq.weapon, offhand: null },
      inventory: [], maxInv: 40,
      stash: { items: [], mats: {} },
      quests: { active: [], done: [], next: 'q1', announced: {} },
      mapId: 'village', playerPos: { x: 0, z: 10 },
      bossKilled: {}, playTime: 0,
      shop: null          // { at, items, rolls } —— 由 ensureShop/genShop 填充
    };
    return s;
  },

  /* 当前难度的配置。旧档没有 difficulty 字段时回落到普通，不报错。 */
  diff() {
    return getDiff(this.state && this.state.difficulty);
  },

  /* ---------------- 材料（S2：玄晶 / 符文） ----------------
   * 统一放在 state.stash.mats，和 S6 的账号仓库材料仓同一处；
   * 键：xuanjing、rune_<id>。旧档没有 stash 时在这里补。 */
  mats() {
    const s = this.state;
    if (!s) return {};
    if (!s.stash || typeof s.stash !== 'object') s.stash = { items: [], mats: {} };
    if (!s.stash.mats || typeof s.stash.mats !== 'object') s.stash.mats = {};
    return s.stash.mats;
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

  /* 读档 / 导入后统一整形：旧物品补 sockets=0，非法符文清空 */
  normalizePlayerItems(s) {
    if (!s) return;
    if (!s.stash || typeof s.stash !== 'object') s.stash = { items: [], mats: {} };
    if (!s.stash.mats || typeof s.stash.mats !== 'object') s.stash.mats = {};
    if (!Array.isArray(s.stash.items)) s.stash.items = [];
    const eq = s.equipment || (s.equipment = {});
    for (const k in eq) if (eq[k]) eq[k] = normalizeItem(eq[k]);
    if (Array.isArray(s.inventory)) s.inventory = s.inventory.map(normalizeItem).filter(Boolean);
    s.stash.items = s.stash.items.map(normalizeItem).filter(Boolean);
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
    const a = buildHumanoid({
      color: cls.color, cloth: cls.cloth, skin: 0xe8c8a8,
      legColor: cls.cloth, bootColor: 0x2a2018, sleeve: cls.color, glove: cls.cloth
    });
    a.group.scale.setScalar(1.12);
    this.actor = a;
    const foot = new THREE.Mesh(ringGeo(0.5, 0.62, 20), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    foot.rotation.x = -Math.PI / 2; foot.position.y = 0.04;
    a.group.add(foot);
    this.playerGroup = a.group;
    this.scene.add(a.group);
    this.aimDir.set(0, 0, -1);
    this.aimPoint.set(this.playerGroup.position.x, 0, this.playerGroup.position.z - 6);
    this.applyDoll();
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

    this.buffs = []; this.shield = 0; this.shieldT = 0; this.regen = 0; this.poisonT = 0; this.playerSlow = 0; this.playerSlowT = 0;
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
    // 出生点
    const p = mapId === 'village' ? { x: 0, z: 6 } : { x: 0, z: 6 };
    s.playerPos = { x: p.x, z: p.z };
    this.playerGroup.position.set(p.x, 0, p.z);
    this.playerGroup.rotation.y = Math.PI;

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
    document.getElementById('death').style.display = 'none';
    this.save();
  },

  spawnNPCs() {
    const pos = { elder: [-7, 2], smith: [7, 7], herbalist: [-10, 14], monk: [9, 15], alchemist: [2, 18] };
    for (const id of MAPS.village.npcs) {
      const a = buildNPC(id);
      const [x, z] = pos[id];
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
    const count = m.spawnCount || 14;
    /* [DIFF] 精英出现概率由难度决定：新手 3%，普通 8%，困难 16%，极难 26% */
    const D = this.diff();
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
    let hp = isBoss ? cfg.hp : cfg.hp * (1 + lvl * 0.48);
    if (elite) hp *= 2.1;
    hp *= D.mobHp;

    /* [DIFF] 极难：给原本没有元素属性的怪随机附一个元素，
     * 让「火/冰/毒抗」这三条冷门属性真正有用。Boss 自带的元素不覆盖。 */
    let ecfg = cfg;
    if (D.elem && !isBoss && !cfg.fire && !cfg.ice && !cfg.poison) {
      const el = PICK(['fire', 'ice', 'poison']);
      ecfg = Object.assign({}, cfg, { [el]: true, elemBoost: el });
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
      level: lvl, hp, maxHp: hp,
      dmg: (cfg.atk || 10) * (1 + lvl * (isBoss ? 0.09 : 0.18)) * (elite ? 1.3 : 1) * D.mobDmg,
      spd: (cfg.spd || 3) * D.mobSpd,
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
      stun: 0, slow: 0, slowT: 0, poisonT: 0, poisonDmg: 0,
      phase: 0, patternCd: 3, tag: kind, facing: new THREE.Vector3(0, 0, 1),
      spawnPos: new THREE.Vector3(x, 0, z), active: !isBoss, hitT: 0
    };
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
      }
    }
  },

  /* 用本帧最终相机姿态校正所有血条朝向（详见 animate 里的说明） */
  faceHpBars() {
    if (!this.camera || typeof faceHpBar !== 'function') return;
    for (const e of this.enemies) {
      if (e.bar && e.bar.group.visible) faceHpBar(e.bar, this.camera);
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

  updateCamera(raw) {
    const p = this.playerGroup.position;
    // 出手瞬间轻微推镜，放大挥砍动作
    if (this.camPunch > 0.0005) this.camPunch *= Math.pow(0.015, raw); else this.camPunch = 0;
    // 竖屏时横向视野窄，把镜头拉远一点，避免角色占满屏幕
    const dist = this.camDist * (this.camZoomMul || 1) * (1 - (this.camPunch || 0));
    const targetX = p.x + Math.sin(this.camYaw) * dist;
    const targetZ = p.z + Math.cos(this.camYaw) * dist;
    const k = 1 - Math.pow(0.0018, raw);
    this.camera.position.x = LERP(this.camera.position.x, targetX, k);
    this.camera.position.z = LERP(this.camera.position.z, targetZ, k);
    this.camera.position.y = LERP(this.camera.position.y, p.y + this.camHeight * (this.camZoomMul || 1), k);
    if (this.shake > 0.001) {
      this.camera.position.x += RND(-1, 1) * this.shake;
      this.camera.position.y += RND(-0.6, 0.6) * this.shake;
      this.camera.position.z += RND(-1, 1) * this.shake;
      this.shake *= Math.pow(0.0025, raw);
    } else this.shake = 0;
    this.camera.lookAt(p.x, p.y + 1.3, p.z);
    this.occT = (this.occT || 0) + raw;
    if (this.occT > 0.08) { this.occT = 0; this.updateOccluders(); }
    this.sun.position.set(p.x + 24, 38, p.z + 18);
    this.sun.target.position.set(p.x, 0, p.z);
  },

  /* 遮挡淡化：挡在镜头与角色之间的道具变半透明 */
  updateOccluders() {
    if (!this.world || !this.world.occluders) return;
    const cam = this.camera.position, p = this.playerGroup.position;
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
      const t = ((pos.x - cam.x) * dx + (pos.z - cam.z) * dz) / len2;
      let hide = false;
      if (t > 0.05 && t < 1.0) {
        const px = cam.x + dx * t, pz = cam.z + dz * t;
        hide = Math.hypot(pos.x - px, pos.z - pz) < o.r + 0.4;
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
    this.updateBuffs(dt);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateAllies(dt);
    this.updateProjectiles(dt);
    this.updateLoot(dt);
    this.updateSpawner(dt);
    this.updateWorldAnims(dt);
    this.updateInteract();
    this.autoSave(raw);
    if (this.state.hp <= 0) this.die();
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
      const spd = st.moveSpd * analog * (this.dashT > 0 ? 4.6 : 1) * (1 - (this.playerSlow || 0));
      pg.position.x += mx * spd * dt;
      pg.position.z += mz * spd * dt;
      this.lastMoveDir = { x: mx, z: mz };
      if (this.dashT <= 0) {
        const targetRot = Math.atan2(mx, mz);
        pg.rotation.y = this.lerpAngle(pg.rotation.y, targetRot, 1 - Math.pow(0.0001, dt));
      }
    }
    this.collideWorld(pg.position, 0.55);

    if (this.dashT > 0) {
      this.dashT -= dt;
      const d = this.lastMoveDir || { x: Math.sin(pg.rotation.y), z: Math.cos(pg.rotation.y) };
      pg.position.x += d.x * 30 * dt;
      pg.position.z += d.z * 30 * dt;
      if (Math.random() < 0.6) FX.burst(new THREE.Vector3(pg.position.x, 0.6, pg.position.z), 0xaaccff, 2, { speed: 1, size: 0.14, life: 0.3, gravity: 0, additive: true });
      this.collideWorld(pg.position, 0.55);
    }

    // 面向瞄准（攻击时）
    this.actor.moving = moving;
    this.actor.time = this.actor.time || 0;
    if (this.mouseDown && this.atkCd <= 0) this.doBasicAttack();

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

    this.playerFace.set(Math.sin(pg.rotation.y), 0, Math.cos(pg.rotation.y));
    updateActorAnim(this.actor, dt);
  },

  lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },

  collideWorld(pos, r) {
    if (!this.world) return;
    for (const c of this.world.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 0.0001) {
        pos.x = c.x + dx / d * min;
        pos.z = c.z + dz / d * min;
      }
    }
    const lim = MAPS[this.state.mapId].size * 0.47;
    const dd = Math.hypot(pos.x, pos.z);
    if (dd > lim) { pos.x *= lim / dd; pos.z *= lim / dd; }
  },

  /* ---------------- 普攻 ---------------- */
  doBasicAttack() {
    const s = this.state, st = s.stats;
    const wp = s.equipment.weapon;
    const wpSpeed = wp && wp.speed ? wp.speed : 1;
    /* [S1] 暴击后攻速：暴击命中后 2.5 秒内攻速加成 */
    const aspdK = this.aspdCritT > 0 ? 1 + (st.aspdOnCrit || 0) / 100 : 1;
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

    if (cls === 'warrior' || cls === 'taoist') {
      this._tag = 'melee';
      this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.5;
      const ang = Math.atan2(dir.x, dir.z);
      const arc = 1.9;
      FX.slash(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), ang - Math.PI / 2 - arc / 2, cls === 'warrior' ? 0xffd8a0 : 0xa8ffd0, 2.9, arc);
      const hits = this.enemiesInArc(origin, 3.4, dir, Math.PI * 0.62);
      for (const e of hits) {
        const { dmg, crit } = this.rollDamage(st.atk * 1.0);
        this.damageEnemy(e, dmg, crit, { knock: 0.6 });
        if (cls === 'warrior') { s.mp = Math.min(st.mpMax, s.mp + 4); this.combatRecently = 5; }
      }
      this.hitstop = 35;
      this.shake = Math.max(this.shake, 0.12);
      if (this.state.stats.flags.thunder && CHANCE(0.18)) this.procThunder(hits[0] || null);
    } else {
      this._tag = null;   // 投射物的 tag 靠 p.tag 传递，不走全局标记
      this.actor.atkAnim = 1; this.actor.atkType = 'cast'; this.actor.atkSpeed = 2.4;
      const color = cls === 'mage' ? 0x8ad0ff : 0xffd070;
      FX.projectile({
        pos: new THREE.Vector3(origin.x + dir.x * 0.7, 1.1, origin.z + dir.z * 0.7),
        dir, speed: 24, color, radius: 0.22, hitRadius: 0.5, team: 'player',
        dmg: st.atk * 0.85, life: 1.4, elem: cls === 'mage' ? 'ice' : 'none',
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
    const color = sk.cls === 'warrior' ? 0xffb070 : (sk.cls === 'mage' ? 0x8ad8ff : 0x9affd0);
    FX.beam(new THREE.Vector3(pp.x, 0.16, pp.z), new THREE.Vector3(end.x, 0.16, end.z), color, 0.18, 0.6);
    FX.ring(end, 0.7, color, 0.24, 0.18);
  },
  castSkill(id) {
    const s = this.state;
    if (!s || this.dead || !this.running) return;
    const sk = SKILLS[id];
    if (!sk) return;
    if (s.level < sk.unlock && !this.skillFlags[id]) { UI.log('尚未领悟「' + sk.name + '」'); SFX.ui(); return; }
    if ((this.cooldowns[id] || 0) > 0.02) return;
    const smod = this.skillMod(id);
    const spow = smod ? 1 + (smod.dmg || 0) / 100 : 1;
    const srad = smod ? 1 + (smod.radius || 0) / 100 : 1;
    const sextra = smod ? (smod.count || 0) : 0;
    /* [S1] 技能消耗降低；传世还能再减该技能的消耗 */
    const cost = Math.max(1, Math.round(this.skillCost(sk) * (1 - (smod && smod.cost ? smod.cost : 0) / 100)));
    if (s.mp < cost) { UI.log(s.cls === 'warrior' ? '怒气不足' : '灵力不足'); SFX.ui(); return; }
    s.mp -= cost;
    const st = s.stats;
    /* [S2] 回响之语 / 紫府套：15% 概率不进入冷却 */
    if (st.flags.echo && CHANCE(0.15)) {
      this.cooldowns[id] = 0;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.8, this.playerGroup.position.z), '回响', 'info', { life: 0.8 });
    } else {
      this.cooldowns[id] = Math.max(0.5, this.skillCd(sk) * (1 - (smod && smod.cd ? smod.cd : 0) / 100));
    }
    this.attacking = 0.35;
    this.camPunch = 0.16;
    this.combatRecently = 5;
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
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < rad + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * mult * spow);
          this.damageEnemy(e, dmg, crit, { knock: 1.2 });
        }
        FX.ring(pp, rad, 0xffd8a0, 0.4);
        FX.spark(new THREE.Vector3(pp.x, 1, pp.z), 0xffd8a0, 18);
        this.shake = 0.25; this.hitstop = 60;
        s.mp = Math.min(st.mpMax, s.mp + 8);
        if (hits.length > 1) UI.log(`旋风斩命中 ${hits.length} 名敌人`, 'good');
        break;
      }
      case 'thrust': {
        this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.9;
        this.dashT = 0.22; this.invuln = 0.3; this.lastMoveDir = { x: dir.x, z: dir.z };
        SFX.fire(); SFX.swing();
        this.shake = 0.3;
        const start = pp.clone();
        setTimeout(() => {
          if (this.dead) return;
          const p2 = this.playerGroup.position;
          const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, p2) < 3.4 + e.radius);
          for (const e of hits) {
            const { dmg, crit } = this.rollDamage(st.atk * 2.6);
            this.damageEnemy(e, dmg, crit, { knock: 2.2 });
          }
          FX.flashCircle(p2, 3.4, 0xff7a30, 0.3);
          FX.burst(new THREE.Vector3(p2.x, 1, p2.z), 0xff7a30, 22, { speed: 8, size: 0.12, life: 0.5, additive: true });
          FX.burst(new THREE.Vector3(start.x, 0.6, start.z), 0xffaa50, 16, { speed: 5, size: 0.1, life: 0.45, additive: true });
          SFX.explode();
        }, 200);
        break;
      }
      case 'warcry': case 'bloodrage': case 'taiji': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        const buff = Object.assign({}, sk.buff);
        /* 传世技能效果：增益类技能按 spow 放大（持续时间不变） */
        if (spow !== 1) for (const k in buff) {
          if (typeof buff[k] === 'number' && k !== 'dur') buff[k] = Math.round(buff[k] * spow);
        }
        this.addBuff(sk.name, buff, id === 'taiji' ? 0x88ffd0 : (id === 'warcry' ? 0xff8a4a : 0xff4a4a), { type: 'buff', icon: sk.glyph, key: 'skill:' + id, refresh: true });
        FX.ring(pp, 5, id === 'taiji' ? 0x88ffd0 : 0xff8a4a, 0.7, 0.25);
        FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), id === 'taiji' ? 0x88ffd0 : 0xff8a4a, 26, { speed: 3, size: 0.12, life: 0.8, gravity: -2, additive: true });
        SFX.cast();
        UI.toast(sk.name);
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
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < 9 + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 6.5);
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
        const p = FX.projectile({
          pos: new THREE.Vector3(pp.x + dir.x * 0.8, 1.4, pp.z + dir.z * 0.8),
          dir, speed: 21, color: 0xff7a30, radius: 0.32, hitRadius: 0.62, team: 'player',
          dmg: st.atk * 1.9 * spow, life: 1.6, elem: 'fire', trail: true,
          onHit: (e, proj) => {
            this.explodeAt(proj.pos.clone(), radius, st.atk * 1.9 * spow, 0xff7a30);
            if (st.flags.firetrail) this.createFirePatch(proj.pos.clone(), radius);
          }
        });
        break;
      }
      case 'frostnova': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        const cp = aim.clone();
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, cp) < 6 * srad + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 2.2 * spow);
          this.damageEnemy(e, dmg, crit, {});
          e.slow = 0.45; e.slowT = 3.5;
        }
        FX.ring(cp, 6 * srad, 0x8ad8ff, 0.7, 0.3);
        FX.flashCircle(cp, 6 * srad, 0x8ad8ff, 0.45);
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * 7, r = RND(1, 6);
          FX.burst(new THREE.Vector3(cp.x + Math.cos(ang) * r, RND(0.1, 1), cp.z + Math.sin(ang) * r), 0xaae8ff, 2, { speed: 2, size: 0.12, life: 0.8, gravity: -1, additive: true });
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
          const { dmg, crit } = this.rollDamage(st.atk * 1.7 * spow * Math.pow(0.85, jumps));
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
        FX.telegraph(target, 5.5 * srad, 0.9, () => {
          this.explodeAt(target, 5.5 * srad, st.atk * 4.2 * spow, 0xff5522, true);
          SFX.explode(); this.shake = 0.6;
          for (let i = 0; i < 4; i++) setTimeout(() => {
            FX.burst(new THREE.Vector3(target.x + RND(-4, 4), 0.3, target.z + RND(-4, 4)), 0xff7a20, 14, { speed: 9, size: 0.16, life: 0.8, gravity: -3, additive: true });
          }, i * 60);
        });
        // 落下的陨石视觉
        const rock = new THREE.Mesh(sphGeo(0.8, 6), new THREE.MeshBasicMaterial({ color: 0xff5522 }));
        rock.position.set(target.x, 18, target.z);
        this.scene.add(rock);
        const fall = { t: 0 };
        const fallFn = () => {
          fall.t += 0.016;
          rock.position.y -= 20 * 0.05;
          if (fall.t < 0.95) requestAnimationFrame(fallFn); else { this.scene.remove(rock); }
        };
        fallFn();
        break;
      }
      case 'iceshield': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        this.shield = st.hpMax * 0.35 * (1 + (st.shieldBonus || 0) / 100) * spow;   // [S1] 护盾强度，传世可再强化
        this.shieldT = 10;
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
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          n++;
          const off = new THREE.Vector3(RND(-9, 9), 0, RND(-9, 9));
          const t = center.clone().add(off);
          this.explodeAt(t, 3.2, st.atk * 1.6, 0xff7a30, false, true);
          if (n > 16) clearInterval(iv);
        }, 220);
        break;
      }
      /* 道士 */
      case 'talisman': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        const target = this.nearestEnemy(aim, 16) || this.nearestEnemy(pp, 16);
        /* v1.0.4：从「瞬间一道雷光」改成「一道符飞过去」。
         * 原实现是一条 beam，同一帧生成又消失，画面上只闪一下，
         * 玩家根本看不出技能放没放出去，也没有飞行时间带来的节奏感。
         * 现在是一枚会拐弯追踪的符咒，命中瞬间才落雷。 */
        const start = new THREE.Vector3(pp.x, 1.5, pp.z);
        const tdir = target
          ? new THREE.Vector3(target.pos.x - pp.x, 0, target.pos.z - pp.z).normalize()
          : new THREE.Vector3(dir.x, 0, dir.z).normalize();
        FX.projectile({
          pos: start, dir: tdir, speed: 17, color: 0xffd24a, radius: 0.3, hitRadius: 0.45,
          team: 'player', style: 'talisman', life: 2.0, trail: true, tag: 'proj',
          homing: target ? target.pos : null, homeTurn: 9,
          onHit: (e, proj) => {
            const { dmg, crit } = this.rollDamage(st.atk * 1.7 * spow);
            this.damageEnemy(e, dmg, crit, { tag: 'proj' });
            // 符纸炸开 → 天雷落地
            FX.beam(new THREE.Vector3(e.pos.x, 4.2, e.pos.z), new THREE.Vector3(e.pos.x, 0.9, e.pos.z), 0x9affd0, 0.16);
            FX.flashCircle(e.pos, 1.9, 0x9affd0, 0.26);
            FX.burst(new THREE.Vector3(e.pos.x, 1.2, e.pos.z), 0x9affd0, 12, { speed: 4, size: 0.1, life: 0.4, additive: true });
            SFX.thunder();
            this.shake = Math.max(this.shake, 0.12);
          }
        });
        // 出手瞬间手边亮一下，抬手动作才有落点
        FX.flashCircle(new THREE.Vector3(pp.x + tdir.x * 0.9, 0.08, pp.z + tdir.z * 0.9), 1.1, 0xffd24a, 0.18);
        break;
      }
      case 'summon': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal();
        this.summonWolf();
        FX.flashCircle(pp, 2.4, 0x9affd0, 0.5);
        break;
      }
      case 'heal': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.heal();
        const amount = st.hpMax * 0.28 * spow;
        this.healPlayer(amount);
        this.regen = (this.regen || 0) + st.hpMax * 0.03 * spow;
        setTimeout(() => { this.regen = Math.max(0, (this.regen || 0) - st.hpMax * 0.03 * spow); }, 4000);
        FX.ring(pp, 2.2, 0x8affb0, 0.6);
        for (let i = 0; i < 14; i++) FX.burst(new THREE.Vector3(pp.x + RND(-1, 1), RND(0.3, 2.2), pp.z + RND(-1, 1)), 0x8affb0, 2, { speed: 1.5, size: 0.1, life: 0.9, gravity: -3, additive: true });
        if (st.flags.groupheal) this.shield = Math.max(this.shield, st.hpMax * 0.2 * (1 + (st.shieldBonus || 0) / 100));   // [S1]
        break;
      }
      case 'poison': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.cast();
        const c = aim.clone();
        FX.area(c, 5, 0x2f9a3c, 6, { opacity: 0.3 });
        let ticks = 0;
        const gen = this.mapGen;
        const iv = setInterval(() => {
          if (this.mapGen !== gen) { clearInterval(iv); return; }
          ticks++;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (DIST2D(e.pos, c) < 5 + e.radius) {
              const { dmg } = this.rollDamage(st.atk * 0.75 * spow);
              this.damageEnemy(e, dmg, false, { silent: true, elem: 'poison' });
            }
          }
          FX.burst(new THREE.Vector3(c.x + RND(-4, 4), 0.3, c.z + RND(-4, 4)), 0x7fbf5a, 4, { speed: 1.4, size: 0.16, life: 1.2, gravity: -0.5 });
          if (ticks > 7) clearInterval(iv);
        }, 800);
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
    this._tag = null;      // [S1] 技能结算完毕，标记归零，避免污染普攻
    UI.renderHUD();
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

  recalc() {
    const s = this.state;
    s.stats = computePlayerStats(s);
    const st = s.stats;
    for (const b of this.buffs) {
      const bs = b.stats;
      if (bs.atkPct) st.atk *= 1 + bs.atkPct / 100;
      if (bs.aspd) st.aspd *= 1 + bs.aspd / 100;
      if (bs.crit) st.crit += bs.crit;
      if (bs.critDmg) st.critDmg += bs.critDmg;
      if (bs.moveSpd) st.moveSpd *= 1 + bs.moveSpd / 100;
      if (bs.def) st.def *= 1 + bs.def / 100;
      if (bs.allRes) st.allRes += bs.allRes;
      if (bs.lifesteal) st.lifesteal += bs.lifesteal;
      if (bs.mpReg) st.mpReg += bs.mpReg;
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
    const effArmor = Math.max(0, armor * (1 - Math.min(0.8, (st.armorPen || 0) / 100)));
    final *= 100 / (100 + effArmor);

    if (e.cfg.all) final *= 0.85;
    if (st.flags.bossSlayer && e.boss) final *= 1.4;

    /* [S1] 按目标状态增伤：精英 / 首领 / 残血处决 / 满血先手 */
    if (st.eliteDmg && (e.elite || e.boss)) final *= 1 + st.eliteDmg / 100;
    if (st.bossDmg && e.boss) final *= 1 + st.bossDmg / 100;
    if (st.executeDmg && e.maxHp && e.hp / e.maxHp < 0.3) final *= 1 + st.executeDmg / 100;
    if (st.firstStrike && e.maxHp && e.hp >= e.maxHp - 1) final *= 1 + st.firstStrike / 100;

    e.hp -= final;
    if (e.hp < 0) e.overkill = -e.hp;      // [S1] 记下溢出量，击杀时可能转成护盾
    if (crit && st.aspdOnCrit) this.aspdCritT = 2.5;   // [S1] 暴击后攻速
    /* 传世特性·裂魂：暴击时小概率引发小范围爆炸（爆炸伤害不再连锁触发） */
    if (crit && !opts.silent && !this._critbursting && st.specials && st.specials.critburst && CHANCE(0.2)) {
      this._critbursting = true;
      this.explodeAt(e.pos.clone(), 2.4, final * 0.35, 0xffb040, false, true);
      this._critbursting = false;
    }
    e.hitFlash = 1;
    e.actor.flash = opts.silent ? 0.08 : 0.22;
    e.actor.flashWas = true;

    const p = new THREE.Vector3(e.pos.x, e.boss ? 3.4 : 1.5, e.pos.z);
    FX.text(p, Math.round(final).toString(), crit ? 'crit' : 'dmg');
    FX.spark(new THREE.Vector3(e.pos.x, e.boss ? 2 : 1.1, e.pos.z), crit ? 0xffb040 : 0xffe0b0, crit ? 14 : 7);
    if (!opts.silent) SFX[crit ? 'crit' : 'hit']();

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
        e.slow = 1; e.slowT = Math.max(e.slowT || 0, 1.2);
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
    if (e.hp <= 0) this.onEnemyDeath(e);
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

  damagePlayer(amount, source) {
    if (this.dead || this.invuln > 0) return;
    const s = this.state, st = s.stats;

    /* [S1] 闪避：完全免伤。给 0.2 秒无敌，避免一次群体攻击连续闪出十几条文字 */
    if (st.dodge && CHANCE(st.dodge / 100)) {
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.2, this.playerGroup.position.z), '闪避', 'info');
      this.invuln = 0.2;
      return;
    }

    const reduce = Math.min(0.75, st.def / (st.def + 320 + this.state.level * 22));
    /* [DIFF] 玩家承受伤害系数：放在减伤之后，保证「护甲收益」在四档难度里一致，
     * 难度只放大最终结果，不扭曲装备词条的价值。 */
    let dmg = amount * (1 - reduce) * this.diff().taken;

    /* [S1] 格挡：伤害减半（先于抗性结算） */
    if (st.block && CHANCE(st.block / 100)) {
      dmg *= 0.5;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.5, this.playerGroup.position.z), '格挡', 'info');
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

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.4, this.playerGroup.position.z), '吸收 ' + Math.round(absorbed), 'info');
      if (this.shield <= 0) { this.shield = 0; UI.log('护盾破碎'); }
    }
    if (dmg <= 0) return;
    s.hp -= dmg;
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
    this.shake = Math.max(this.shake, Math.min(0.5, 0.12 + dmg / 180));
    this.hitstop = 40;
    FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.2, this.playerGroup.position.z), '-' + Math.round(dmg), 'player');
    FX.blood(new THREE.Vector3(this.playerGroup.position.x, 1.2, this.playerGroup.position.z), 0xcc2222, 8);
    this.actor.flash = 0.45; this.actor.flashWas = true;
    SFX.hit();
    if (st.thorns > 0 && source && !source.dead) this.damageEnemy(source, dmg * st.thorns / 100, false, { silent: true });
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
    if (s.hp <= 0) this.die();
  },

  die() {
    if (this.dead) return;
    this.dead = true;
    this.actor.anim = 'die';
    this.actor.group.rotation.z = 0;
    SFX.die();
    this.shake = 0.8;
    UI.closeAll(); UI.showDeath('你的道，还未走完。');
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
    this.buffs = [];
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

      if (e.stun > 0) { e.stun -= dt; a.moving = false; updateActorAnim(a, dt); continue; }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonTick = (e.poisonTick || 0) - dt;
        if (e.poisonTick <= 0) { e.poisonTick = 0.9; this.damageEnemy(e, e.poisonDmg, false, { silent: true }); }
      }

      const d = DIST2D(e.pos, pp);
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
        continue;
      }
      if (e.boss) { this.updateBossAI(e, dt, d, pp); }      else {
        // 普怪 AI（[DIFF] 索敌半径按难度缩放，极难更远，容易被围）
        if (d < 26 * this.diff().aggro || e.aggro) {
          e.aggro = true;
          if (e.cfg.ranged) {
            if (d > e.range * 0.85) this.moveEnemy(e, pp, spd, dt);
            else if (d < e.range * 0.45) this.moveEnemy(e, pp, -spd * 0.6, dt);
            else {
              a.moving = false;
              if (e.atkCd <= 0) this.enemyRangedAttack(e);
            }
          } else {
            if (d > e.reach * 0.85) this.moveEnemy(e, pp, spd, dt);
            else {
              a.moving = false;
              if (e.windup > 0) {
                e.windup -= dt;
                if (e.windup <= 0) {
                  if (DIST2D(e.pos, pp) < e.reach + 1.4) {
                    this.damagePlayer(e.dmg * RND(0.9, 1.1), e);
                    if (e.cfg.poison) { this.playerPoison(e.dmg * 0.15); }
                  }
                }
              } else if (e.atkCd <= 0) {
                e.atkCd = e.cfg.atkCd || 1.8;
                e.windup = 0.34;
                a.atkAnim = 1; a.atkType = 'swing'; a.atkSpeed = 2.8;
                SFX.swing();
              }
            }
          }
          // 面向玩家
          const ang = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
          a.group.rotation.y = this.lerpAngle(a.group.rotation.y, ang, 1 - Math.pow(0.001, dt));
        } else a.moving = false;
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
      this.collideWorld(e.pos, e.radius * 0.7);

      e.atkCd = Math.max(0, e.atkCd - dt);
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
  },

  moveEnemy(e, target, spd, dt) {
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    e.pos.x += dx / d * spd * dt;
    e.pos.z += dz / d * spd * dt;
    e.actor.moving = true;
  },

  enemyRangedAttack(e) {
    e.atkCd = e.cfg.atkCd || 2;
    e.actor.atkAnim = 1; e.actor.atkType = 'cast';
    SFX.cast();
    const from = new THREE.Vector3(e.pos.x, 1.3, e.pos.z);
    const to = new THREE.Vector3(this.playerGroup.position.x, 1.1, this.playerGroup.position.z);
    const dir = to.clone().sub(from).normalize();
    const proj = e.cfg.proj || { color: 0xcccccc, speed: 14 };
    FX.projectile({
      pos: from, dir, speed: proj.speed, color: proj.color, radius: 0.24, team: 'enemy',
      dmg: e.dmg, life: 2.4, elem: e.cfg.poison ? 'poison' : null,
      onHit: (target, p) => {
        this.damagePlayer(p.dmg, e);
        FX.burst(p.pos.clone(), proj.color, 8, { speed: 4, size: 0.08, life: 0.3, additive: true });
        if (e.cfg.poison) this.playerPoison(e.dmg * 0.12);
      }
    });
  },

  playerPoison(dps) {
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
      this.moveEnemy(e, pp, e.spd * (1 + e.phase * 0.12), dt);
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
          this.playerSlow = 0.5;
          this.playerSlowT = 2.5 * (1 - CLAMP(this.state.stats.ccResist || 0, 0, 60) / 100);
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
          this.playerSlow = 0.45;
          this.playerSlowT = 3 * (1 - CLAMP(this.state.stats.ccResist || 0, 0, 60) / 100);
          FX.beam(new THREE.Vector3(e.pos.x, 2, e.pos.z), new THREE.Vector3(this.playerGroup.position.x, 1.4, this.playerGroup.position.z), 0xaa66ff, 0.4);
          UI.log('你被邪咒缠绕，身法迟滞！', 'bad');
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
  summonWolf() {
    const st = this.state.stats;
    const a = buildMonster('beast', { scale: 0.9, color: 0x8affc0, cloth: 0x3a6a50 });
    a.group.position.copy(this.playerGroup.position);
    this.scene.add(a.group);
    this.allies.push({
      actor: a, pos: a.group.position.clone(), life: 25, atkCd: 0,
      dmg: st.atk * 0.6 * (1 + st.summonDmg / 100)
    });
    UI.log('灵狼应召而来');
  },

  updateAllies(dt) {
    const st = this.state.stats;
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const al = this.allies[i];
      al.life -= dt;
      if (al.life <= 0) { this.scene.remove(al.actor.group); this.allies.splice(i, 1); continue; }
      let target = null, bd = 24;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = DIST2D(e.pos, al.pos);
        if (d < bd) { bd = d; target = e; }
      }
      al.atkCd = Math.max(0, al.atkCd - dt);
      if (target) {
        if (bd > 2.2) {
          const dx = target.pos.x - al.pos.x, dz = target.pos.z - al.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          al.pos.x += dx / d * 7 * dt;
          al.pos.z += dz / d * 7 * dt;
          al.actor.moving = true;
          al.actor.group.rotation.y = Math.atan2(dx, dz);
        } else {
          al.actor.moving = false;
          if (al.atkCd <= 0) {
            al.atkCd = 1.1;
            al.actor.atkAnim = 1; al.actor.atkType = 'swing';
            const dmg = al.dmg * RND(0.9, 1.1);
            this.damageEnemy(target, dmg, false, {});
            FX.spark(new THREE.Vector3(target.pos.x, 1.2, target.pos.z), 0x8affc0, 6);
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
          } else if (l.item) {
            if (this.state.inventory.length >= this.state.maxInv) {
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
  onEnemyDeath(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.actor.anim = 'die';
    e.actor.moving = false;
    e.deadT = 0;
    if (e.bar) e.bar.group.visible = false;
    const p = e.pos.clone();
    SFX.die();
    FX.blood(new THREE.Vector3(p.x, 1, p.z), 0x992222, e.boss ? 40 : 16);
    this.hitstop = e.boss ? 140 : 30;
    this.shake = Math.max(this.shake, e.boss ? 0.7 : 0.14);

    // 经验（[DIFF] 难度越高给得越多，作为硬核的正反馈）
    const D = this.diff();
    const baseXp = e.boss ? (e.cfg.level * 45) : (e.cfg.xp || 12) * (1 + e.level * 0.18);
    const xp = Math.round(baseXp * (e.elite ? 2 : 1) * D.xp);
    this.gainXp(xp);

    // 金币
    const goldBase = e.boss ? RND(300, 600) : (e.elite ? RND(30, 60) : RND(6, 18));
    this.spawnLoot(p, null, Math.round(goldBase * (1 + e.level * 0.05) * D.gold));

    // 装备
    const sto = this.state.stats;
    const ilvl = Math.max(1, e.level + (e.boss ? 2 : 0));
    let dropChance = e.boss ? 1 : (e.elite ? 0.85 : 0.3);
    /* [DIFF] 掉落率随难度提高（打得更难，回报也更高） */
    dropChance = Math.min(1, dropChance * D.drop);
    /* [S1] 掉落数量：按一半概率额外多掉一件，封顶 60% */
    let drops = e.boss ? 3 : 1;
    if (sto.dropRate && CHANCE(Math.min(0.6, sto.dropRate / 200))) drops += 1;
    for (let i = 0; i < drops; i++) {
      if (i > 0 && !CHANCE(0.55)) continue;
      if (Math.random() > dropChance) continue;
      let opts = { cls: CHANCE(0.78) ? this.state.cls : PICK(['warrior', 'mage', 'taoist']), magicFind: this.state.stats.magicFind };
      if (e.boss) {
        const r = Math.random();
        /* 首领必掉，且有 8% 直接掉传世；传世池不够时 rollItem 会自动退化为神兵 */
        opts.rarity = r < 0.08 ? 'unique' : (r < 0.24 ? 'set' : (r < 0.48 ? 'legendary' : 'rare'));
      } else if (e.elite) {
        opts.rarity = CHANCE(0.05) ? 'unique' : (CHANCE(0.35) ? 'rare' : 'magic');
      }
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

    // 击杀回复
    if (sto.killHeal) this.healPlayer(sto.killHeal, true);
    if (sto.mpOnKill) this.state.mp = Math.min(sto.mpMax, this.state.mp + sto.mpOnKill);
    /* [S2] 血怒：击杀后攻速/移速提升 4 秒，重复触发只刷新时间不叠加 */
    if (sto.flags.bloodRush) {
      const cur = this.buffs.find(b => b.name === '血怒');
      if (cur) { cur.dur = 4; }
      else this.addBuff('血怒', { aspd: 25, moveSpd: 20, dur: 4 }, '#ff6b4a');
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
    if (e.boss) {
      this.state.bossKilled[e.kind] = (this.state.bossKilled[e.kind] || 0) + 1;
      this.onBossKill(e);
      if (this.boss === e) { this.boss = null; UI.updateBoss(null); }
      UI.toast('击败 ' + e.cfg.name, 'lv');
      this.save();
      // 首领重生
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
  },

  gainXp(amount) {
    const s = this.state;
    /* [S1] 经验获取加成 */
    amount = Math.round(amount * (1 + (s.stats.expGain || 0) / 100));
    s.xp += amount;
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.level++;
      s.xpNext = Math.round(120 * Math.pow(s.level, 1.55));
      this.recalc();
      s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
      UI.toast('境界提升 · ' + s.level + ' 级', 'lv');
      SFX.levelup();
      FX.ring(new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z), 5, 0xffd166, 1.0, 0.3);
      for (let i = 0; i < 30; i++) {
        FX.burst(new THREE.Vector3(this.playerGroup.position.x + RND(-1, 1), RND(0, 2.5), this.playerGroup.position.z + RND(-1, 1)), 0xffd166, 1, { speed: 2, size: 0.12, life: 1.2, gravity: -4, additive: true });
      }
      UI.log('境界提升！生命与灵力已恢复。', 'good');
      const un = SKILL_ORDER[s.cls].filter(id => SKILLS[id].unlock === s.level);
      un.forEach(id => {
        UI.toast('领悟 · ' + SKILLS[id].name, 'lv');
        UI.log('领悟新术：' + SKILLS[id].name, 'good');
        setTimeout(() => SFX.levelup(), 300);
      });
    }
  },

  /* 刷怪：维持地图怪物密度 */
  updateSpawner(dt) {
    const m = MAPS[this.state.mapId];
    if (m.safe || !m.spawns) return;
    this.mobTimer = (this.mobTimer || 0) + dt;
    /* 先判时间再数怪：原来每帧都 filter 一遍，怪多的时候等于每帧白扔一个数组 */
    if (this.mobTimer <= 14) return;
    this.mobTimer = 0;      // 不论这次刷没刷成功都重新计时，避免满员后每帧都数一遍
    let alive = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss) alive++;
    const cap = m.spawnCount || 14;
    if (alive < cap * 0.7) {
      const n = Math.min(3, cap - alive);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * 6.28, r = RND(22, m.size * 0.44);
        /* [DIFF] 刷新怪同样按难度滚精英 */
        const e = this.spawnEnemy(PICK(m.spawns), Math.cos(ang) * r, Math.sin(ang) * r, CHANCE(this.diff().elite));
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
    else if (t.type === 'portal') UI.openTravel();
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
    if (this.state.inventory.length >= this.state.maxInv) {
      UI.log('行囊已满，物品散落在地。', 'bad');
      return false;
    }
    this.state.inventory.push(item);
    UI.renderInventory();
    return true;
  },

  canEquip(item) {
    const s = this.state;
    if (item.cls && item.cls !== s.cls) { UI.log('此物唯有' + CLASSES[item.cls].name + '可用。', 'bad'); return false; }
    if (item.reqLv > s.level) { UI.log('境界不足，需 ' + item.reqLv + ' 级。', 'bad'); return false; }
    return true;
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

  equipFromInv(idx) {
    const s = this.state;
    const item = s.inventory[idx];
    if (!item) return;
    if (!this.canEquip(item)) return;
    const slot = item.slot === 'ring' ? (s.equipment.ring1 ? (s.equipment.ring2 ? 'ring1' : 'ring2') : 'ring1') : item.slot;
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
    if (s.inventory.length >= s.maxInv) { UI.log('行囊已满。', 'bad'); return; }
    s.equipment[slot] = null;
    s.inventory.push(item);
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

  /* [S3] 分解装备 → 玄晶分级材料 */
  previewDecompose(item) {
    if (!item) return null;
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
    const out = base.map(n => Math.max(0, Math.round(n * mul)));
    const txt = out.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、') || '无';
    return { yields: out, text: txt };
  },

  decomposeItem(item) {
    if (!item) return { ok: false, msg: '没有可分解的装备。' };
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
    const out = base.map(n => Math.max(0, Math.round(n * mul)));
    for (let i = 0; i < 4; i++) this.addCrystalTier(i + 1, out[i]);
    const txt = out.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、');
    SFX.cast();
    UI.log('分解 ' + item.name + ' 获得 ' + txt, 'good');
    this.save();
    return { ok: true, yields: out, text: txt };
  },

  /* [S3] 升级装备品质：common→magic→rare→legendary */
  upgradeItemQuality(item) {
    if (!item) return { ok: false, msg: '没有可升级的装备。' };
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
    // 升级稀有度，补齐词缀数量
    const oldRarity = item.rarity;
    item.rarity = target;
    const wantAffixes = RARITY[target].affixes;
    const used = new Set(item.affixes.map(a => a.key));
    while (item.affixes.length < wantAffixes) {
      item.affixes.push(makeAffix(item.ilvl || 1, used));
    }
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
        cls: CHANCE(0.8) ? s.cls : PICK(['warrior', 'mage', 'taoist']),
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
    this.invuln = 0.3;
    SFX.swing();
    const d = this.lastMoveDir || { x: Math.sin(this.playerGroup.rotation.y), z: Math.cos(this.playerGroup.rotation.y) };
    this.lastMoveDir = d;
  },

  travelTo(mapId) {
    if (!MAPS[mapId]) return;
    const m = MAPS[mapId];
    if (this.state.level < (m.unlock || 1)) { UI.log('境界不足。', 'bad'); return; }
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
    let ok = true;
    try {
      if (typeof SaveManager !== 'undefined') {
        ok = SaveManager.save(this.state, this.savedSlot || SaveManager.activeSlot());
      } else {
        Store.set(JSON.stringify(this.state));
      }
    } catch (e) { ok = false; }
    this.lastSave = this.time;
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
    this.normalizePlayerItems(this.state);
    this.state.quests = this.state.quests || { active: [], done: [], next: 'q1', announced: {} };
    this.state.quests.announced = this.state.quests.announced || {};
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
