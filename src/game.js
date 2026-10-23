/* ============================================================
 * 主逻辑：渲染 / 输入 / 战斗 / 敌人AI / Boss / 掉落 / 任务 / 存档
 * ============================================================ */

const BOSS_POS = {
  treeking: [28, -26], batking: [-30, -22],
  chief: [34, 26], golemking: [-36, 24], snakequeen: [0, -36],
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 130;
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
      UI.setHelp('<b>WASD</b> 移动 · <b>左键</b> 攻击 · <b>1-6</b> 技能 · <b>空格</b> 翻滚 · <b>F</b> 交互<br><b>Q/E</b> 转视角 · <b>滚轮</b> 缩放 · <b>R</b> 炼器 · <b>I</b> 背包 · <b>C</b> 属性 · <b>L</b> 任务 · <b>P</b> 存档');
    } catch (e) { }

    window.addEventListener('resize', () => this.updateViewport());
    this.updateViewport();

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
  newState(cls, name) {
    const eq = makeStarterSet(cls);
    const s = {
      cls, name, level: 1, xp: 0, xpNext: 120, gold: 120,
      potions: { hp: 4, mp: 3 },
      hp: 100, mp: 50,
      equipment: { helm: null, chest: eq.chest, shoulders: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, weapon: eq.weapon, offhand: null },
      inventory: [], maxInv: 40,
      stash: { items: [], mats: {} },
      quests: { active: [], done: [], next: 'q1', announced: {} },
      mapId: 'village', playerPos: { x: 0, z: 10 },
      bossKilled: {}, playTime: 0
    };
    return s;
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

  startNew(cls, name, slot) {
    SFX.init();
    // 已有进度先落盘，避免切档丢东西
    if (this.running && this.state) this.save();
    let target = slot || 0;
    if (typeof SaveManager !== 'undefined') {
      const r = SaveManager.createCharacter(cls, name, target);
      if (!r.ok) { UI.toast(r.error || '建档失败', 'bad'); return false; }
      target = r.slot;
    }
    this.state = this.newState(cls, name);
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
    UI.toast('踏入山海 · ' + CLASSES[cls].name, 'lv');
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

    this.buffs = []; this.shield = 0; this.regen = 0; this.poisonT = 0; this.playerSlow = 0;
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
    UI.renderHUD();
    UI.renderActionBar && UI.buildActionBar();
    UI.log('【' + m.name + '】' + (m.safe ? '炊烟与犬吠，难得的安宁。' : '妖气弥漫，小心脚下。'), m.safe ? 'good' : 'bad');
    document.getElementById('death').style.display = 'none';
    this.save();
  },

  spawnNPCs() {
    const pos = { elder: [-7, 2], smith: [7, 7], herbalist: [-10, 14], monk: [9, 15] };
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
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = RND(16, m.size * 0.46);
      const kind = PICK(m.spawns);
      this.spawnEnemy(kind, Math.cos(ang) * r, Math.sin(ang) * r);
    }
  },

  spawnEnemy(kind, x, z, elite, levelOverride, bossId) {
    const cfg = bossId ? BOSSES[bossId] : MONSTERS[kind];
    if (!cfg) return null;
    const mapLv = MAPS[this.state.mapId].level;
    const lvl = levelOverride || (mapLv + RNDI(-1, 2));
    const isBoss = !!bossId;
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

    let hp = isBoss ? cfg.hp : cfg.hp * (1 + lvl * 0.48);
    if (elite) hp *= 2.1;
    const e = {
      id: 'e' + Math.random().toString(36).slice(2),
      kind: bossId || kind, cfg, actor: a, boss: isBoss, elite: !!elite,
      level: lvl, hp, maxHp: hp,
      dmg: (cfg.atk || 10) * (1 + lvl * (isBoss ? 0.09 : 0.18)) * (elite ? 1.3 : 1),
      spd: cfg.spd || 3, range: cfg.range || 2.2,
      radius: (isBoss ? 1.4 : 0.7) * (scale > 1.5 ? 1.5 : 1),
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
      const label = makeLabelSprite(cfg.name, '#ffd8b0', 44);
      label.position.y = 4.2 * (scale / 1.8);
      a.group.add(label);
      e.label = label;
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

  /* ======================================================= */
  animate() {
    requestAnimationFrame(() => this.animate());
    const raw = Math.min(this.clock.getDelta(), 0.06);
    let dt = raw;
    if (this.hitstop > 0) { this.hitstop -= raw * 1000; dt = raw * 0.1; }
    this.time += dt;
    if (this.running && this.state && !this.dead) this.update(dt, raw);
    if (this.running && this.state) {
      this.updateCamera(raw);
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
    this.tickPerf(raw);
  },

  /* ---------------- 自适应画质 ---------------- *
   * 不猜用户的机器，直接量：每 2 秒统计一次实际帧率，掉了就降一档。
   * 降档顺序是「性价比」顺序——先降分辨率（几乎无感），再降阴影质量，
   * 最后才关阴影（观感损失最大，但集显上往往是唯一能把帧率拉回来的手段）。
   * 降档要连续两次采样都低才执行，避免一次过场卡顿就误判；
   * 升档要求连续 5 次采样都很稳，否则会在阈值附近反复横跳、反复重编译 shader。
   */
  tickPerf(raw) {
    const p = this.perf;
    if (!p) return;
    p.acc += raw; p.frames++;
    if (p.acc < 2) return;
    const fps = p.frames / p.acc;
    p.fps = Math.round(fps);
    p.acc = 0; p.frames = 0;
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

  applyPerfLevel() {
    const p = this.perf, lv = p.level, r = this.renderer;
    const dprMax = [1.5, 1.25, 1.0][lv];
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    if (Math.abs(dpr - r.getPixelRatio()) > 0.01) {
      r.setPixelRatio(dpr);
      r.setSize(window.innerWidth, window.innerHeight);
    }
    const wantShadow = lv < 2;
    const size = lv === 0 ? 1536 : 1024;
    if (r.shadowMap.enabled !== wantShadow) {
      r.shadowMap.enabled = wantShadow;
      this.dirtyShadows();
    }
    // 注意别写成 else if：从 L2 回升到 L0 时「重新开阴影」和「调回 1536」要同时发生
    if (wantShadow && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    p.dpr = dpr;
    p.shadow = wantShadow ? size : 0;
    if (typeof FX !== 'undefined') FX.q = [1, 0.7, 0.5][lv];
    console.log('[画质] L' + lv + ' · dpr=' + dpr.toFixed(2) + ' · 阴影=' + (p.shadow || '关') + ' · ' + p.fps + 'fps');
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
        dir, speed: 24, color, radius: 0.22, team: 'player',
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

  castSkill(id) {
    const s = this.state;
    if (!s || this.dead || !this.running) return;
    const sk = SKILLS[id];
    if (!sk) return;
    if (s.level < sk.unlock) { UI.log('尚未领悟「' + sk.name + '」'); SFX.ui(); return; }
    if ((this.cooldowns[id] || 0) > 0.02) return;
    /* [S1] 技能消耗降低 */
    const cost = this.skillCost(sk);
    if (s.mp < cost) { UI.log(s.cls === 'warrior' ? '怒气不足' : '灵力不足'); SFX.ui(); return; }
    s.mp -= cost;
    const st = s.stats;
    /* [S2] 回响之语 / 紫府套：15% 概率不进入冷却 */
    if (st.flags.echo && CHANCE(0.15)) {
      this.cooldowns[id] = 0;
      FX.text(new THREE.Vector3(this.playerGroup.position.x, 2.8, this.playerGroup.position.z), '回响', 'info', { life: 0.8 });
    } else {
      this.cooldowns[id] = this.skillCd(sk);
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
    const aim = this.aimPoint.clone();
    const dir = this.aimDir.clone();
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
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < 4.3 + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * mult);
          this.damageEnemy(e, dmg, crit, { knock: 1.2 });
        }
        FX.ring(pp, 4.3, 0xffd8a0, 0.4);
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
        this.addBuff(sk.name, buff, id === 'taiji' ? 0x88ffd0 : (id === 'warcry' ? 0xff8a4a : 0xff4a4a));
        FX.ring(pp, 5, id === 'taiji' ? 0x88ffd0 : 0xff8a4a, 0.7, 0.25);
        FX.burst(new THREE.Vector3(pp.x, 1.2, pp.z), id === 'taiji' ? 0x88ffd0 : 0xff8a4a, 26, { speed: 3, size: 0.12, life: 0.8, gravity: -2, additive: true });
        SFX.cast();
        UI.toast(sk.name);
        break;
      }
      case 'quake': {
        this.actor.atkAnim = 1; this.actor.atkType = 'slam'; this.actor.atkSpeed = 2.0;
        SFX.explode(); this.shake = 0.55; this.hitstop = 90;
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < 5.8 + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 3.2);
          this.damageEnemy(e, dmg, crit, { knock: 1.6 });
          e.stun = Math.max(e.stun, 1.6);
        }
        FX.ring(pp, 6, 0xffaa60, 0.6, 0.3);
        FX.flashCircle(pp, 5.8, 0xffcc88, 0.35);
        for (let i = 0; i < 3; i++) setTimeout(() => {
          FX.burst(new THREE.Vector3(pp.x + RND(-4, 4), 0.2, pp.z + RND(-4, 4)), 0xaa8866, 12, { speed: 6, size: 0.14, life: 0.7, gravity: 16 });
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
        this.addBuff(sk.name, Object.assign({}, sk.buff), 0xffd166);
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
        const radius = 2.4 * (st.flags.firetrail ? 1.6 : 1);
        const p = FX.projectile({
          pos: new THREE.Vector3(pp.x + dir.x * 0.8, 1.4, pp.z + dir.z * 0.8),
          dir, speed: 21, color: 0xff7a30, radius: 0.32, team: 'player',
          dmg: st.atk * 1.9, life: 1.6, elem: 'fire', trail: true,
          onHit: (e, proj) => {
            this.explodeAt(proj.pos.clone(), radius, st.atk * 1.9, 0xff7a30);
            if (st.flags.firetrail) this.createFirePatch(proj.pos.clone(), radius);
          }
        });
        break;
      }
      case 'frostnova': {
        this.actor.atkAnim = 1; this.actor.atkType = 'cast';
        SFX.ice();
        const hits = this.enemies.filter(e => !e.dead && DIST2D(e.pos, pp) < 6 + e.radius);
        for (const e of hits) {
          const { dmg, crit } = this.rollDamage(st.atk * 2.2);
          this.damageEnemy(e, dmg, crit, {});
          e.slow = 0.45; e.slowT = 3.5;
        }
        FX.ring(pp, 6, 0x8ad8ff, 0.7, 0.3);
        FX.flashCircle(pp, 6, 0x8ad8ff, 0.45);
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * 7, r = RND(1, 6);
          FX.burst(new THREE.Vector3(pp.x + Math.cos(ang) * r, RND(0.1, 1), pp.z + Math.sin(ang) * r), 0xaae8ff, 2, { speed: 2, size: 0.12, life: 0.8, gravity: -1, additive: true });
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
        while (cur && jumps < 5 && !hitSet.has(cur)) {
          hitSet.add(cur);
          const to = new THREE.Vector3(cur.pos.x, 1.2, cur.pos.z);
          FX.beam(from, to, 0x88ddff, 0.2);
          const { dmg, crit } = this.rollDamage(st.atk * 1.7 * Math.pow(0.85, jumps));
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
        FX.telegraph(target, 5.5, 0.9, () => {
          this.explodeAt(target, 5.5, st.atk * 4.2, 0xff5522, true);
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
        this.shield = st.hpMax * 0.35 * (1 + (st.shieldBonus || 0) / 100);   // [S1] 护盾强度
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
        SFX.thunder();
        const target = this.nearestEnemy(aim, 16) || this.nearestEnemy(pp, 16);
        if (target) {
          const from = new THREE.Vector3(pp.x, 3.4, pp.z);
          const to = new THREE.Vector3(target.pos.x, 1.2, target.pos.z);
          FX.beam(from, to, 0x9affd0, 0.18);
          FX.flashCircle(target.pos, 1.8, 0x9affd0, 0.25);
          const { dmg, crit } = this.rollDamage(st.atk * 1.7);
          this.damageEnemy(target, dmg, crit, {});
          this.shake = 0.12;
        } else {
          const from = new THREE.Vector3(pp.x, 3.2, pp.z);
          const to = new THREE.Vector3(aim.x, 0.2, aim.z);
          FX.beam(from, to, 0x9affd0, 0.2);
        }
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
        const amount = st.hpMax * 0.28;
        this.healPlayer(amount);
        this.regen = (this.regen || 0) + st.hpMax * 0.03;
        setTimeout(() => { this.regen = Math.max(0, (this.regen || 0) - st.hpMax * 0.03); }, 4000);
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
              const { dmg } = this.rollDamage(st.atk * 0.75);
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
              this.explodeAt(t, 2.6, st.atk * sk.mult, 0x9affd0, false, true);
            }
          };
          anim();
          if (n >= 22) clearInterval(iv);
        }, 150);
        break;
      }
    }
    this._tag = null;      // [S1] 技能结算完毕，标记归零，避免污染普攻
    UI.renderHUD();
  },

  addBuff(name, stats, color) {
    this.buffs.push({ name, stats, dur: stats.dur || 8, color });
    this.recalc();
    this.buffFx(color);
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
    let dmg = amount * (1 - reduce);

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
    const lost = Math.floor(this.state.gold * 0.1);
    this.state.gold -= lost;
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
        updateHpBar(e.bar, e.hp / e.maxHp, bd);
      }

      if (e.stun > 0) { e.stun -= dt; a.moving = false; updateActorAnim(a, dt); continue; }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonTick = (e.poisonTick || 0) - dt;
        if (e.poisonTick <= 0) { e.poisonTick = 0.9; this.damageEnemy(e, e.poisonDmg, false, { silent: true }); }
      }

      const d = DIST2D(e.pos, pp);
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
        // 普怪 AI
        if (d < 26 || e.aggro) {
          e.aggro = true;
          if (e.cfg.ranged) {
            if (d > e.range * 0.85) this.moveEnemy(e, pp, spd, dt);
            else if (d < e.range * 0.45) this.moveEnemy(e, pp, -spd * 0.6, dt);
            else {
              a.moving = false;
              if (e.atkCd <= 0) this.enemyRangedAttack(e);
            }
          } else {
            if (d > e.range * 0.85) this.moveEnemy(e, pp, spd, dt);
            else {
              a.moving = false;
              if (e.windup > 0) {
                e.windup -= dt;
                if (e.windup <= 0) {
                  if (DIST2D(e.pos, pp) < e.range + 1.4) {
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
    const newPhase = hpRatio < 0.3 ? 2 : (hpRatio < 0.6 ? 1 : 0);
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
        if (DIST2D(e.pos, pp) < e.range + 2.2) this.damagePlayer(e.dmg * RND(0.9, 1.2), e);
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
    } else if (d > e.range * 0.8) {
      this.moveEnemy(e, pp, e.spd * (1 + e.phase * 0.12), dt);
    } else {
      a.moving = false;
    }

    // 普攻
    if (e.atkCd <= 0 && d < e.range + 1.6 && e.windup <= 0 && e.charging <= 0) {
      e.atkCd = e.cfg.atkCd || 2;
      e.windup = 0.45;
      e.pendingMelee = true;
      a.atkAnim = 1; a.atkType = 'swing'; a.atkSpeed = 2.6;
      SFX.swing();
      FX.slash(new THREE.Vector3(e.pos.x, 0, e.pos.z), Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z) - Math.PI / 2 - 0.9, 0xff8844, e.range + 1.5, 1.8);
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
  updateProjectiles(dt) {
    for (let i = FX.projectiles.length - 1; i >= 0; i--) {
      const p = FX.projectiles[i];
      if (p.team === 'player') {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (p.pos.distanceTo(new THREE.Vector3(e.pos.x, 1, e.pos.z)) < e.radius + p.radius + 0.35) {
            if (p.onHit) p.onHit(e, p);
            if (!p.pierce) { FX.removeProjectile(i); break; }
          }
        }
      } else {
        const pp = new THREE.Vector3(this.playerGroup.position.x, 1.1, this.playerGroup.position.z);
        if (p.pos.distanceTo(pp) < 0.85 + p.radius) {
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

    // 经验
    const baseXp = e.boss ? (e.cfg.level * 45) : (e.cfg.xp || 12) * (1 + e.level * 0.18);
    const xp = Math.round(baseXp * (e.elite ? 2 : 1));
    this.gainXp(xp);

    // 金币
    const goldBase = e.boss ? RND(300, 600) : (e.elite ? RND(30, 60) : RND(6, 18));
    this.spawnLoot(p, null, Math.round(goldBase * (1 + e.level * 0.05)));

    // 装备
    const sto = this.state.stats;
    const ilvl = Math.max(1, e.level + (e.boss ? 2 : 0));
    let dropChance = e.boss ? 1 : (e.elite ? 0.85 : 0.3);
    /* [S1] 掉落数量：按一半概率额外多掉一件，封顶 60% */
    let drops = e.boss ? 3 : 1;
    if (sto.dropRate && CHANCE(Math.min(0.6, sto.dropRate / 200))) drops += 1;
    for (let i = 0; i < drops; i++) {
      if (i > 0 && !CHANCE(0.55)) continue;
      if (Math.random() > dropChance) continue;
      let opts = { cls: CHANCE(0.78) ? this.state.cls : PICK(['warrior', 'mage', 'taoist']), magicFind: this.state.stats.magicFind };
      if (e.boss) {
        const r = Math.random();
        opts.rarity = r < 0.18 ? 'set' : (r < 0.42 ? 'legendary' : 'rare');
      } else if (e.elite) {
        opts.rarity = CHANCE(0.35) ? 'rare' : 'magic';
      }
      const it = rollItem(ilvl, opts);
      this.spawnLoot(p, it, 0);
    }

    /* [S2] 符文 / 玄晶：材料直接进 state.stash.mats，不占背包格。
     * seeker（山海套）提高符文与玄晶的出率、数量。 */
    const seeker = !!sto.flags.seeker;
    const runeChance = e.boss ? 1 : (e.elite ? (seeker ? 0.3 : 0.18) : (seeker ? 0.05 : 0.025));
    if (CHANCE(runeChance)) {
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
    const alive = this.enemies.filter(e => !e.dead && !e.boss).length;
    const cap = m.spawnCount || 14;
    if (this.mobTimer > 14 && alive < cap * 0.7) {
      this.mobTimer = 0;
      const n = Math.min(3, cap - alive);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * 6.28, r = RND(22, m.size * 0.44);
        const e = this.spawnEnemy(PICK(m.spawns), Math.cos(ang) * r, Math.sin(ang) * r);
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
      this.genShop();
      UI.showDialog(npc.name, PICK(npc.lines), [
        { label: '看看货（购买）', action: () => UI.openShop(this.shopItems, '铁匠铺') },
        { label: '借用炼器台', action: () => UI.openForge() },
        { label: '出售凡品（Shift+左键可单卖）', action: () => { this.sellJunk(); UI.showDialog(npc.name, '凡品已经收走了，银货两讫。', [{ label: '告辞', action: () => UI.closeAll() }]); } },
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

  sellItem(idx) {
    const s = this.state;
    const item = s.inventory[idx];
    if (!item) return;
    s.gold += item.value;
    s.inventory.splice(idx, 1);
    SFX.coin();
    UI.log('售出 ' + item.name + '，+' + item.value + ' 金');
    UI.renderInventory(); UI.renderHUD(); UI.tooltipEl.style.display = 'none';
    this.save();
  },

  sellJunk() {
    const s = this.state;
    let gold = 0, n = 0;
    s.inventory = s.inventory.filter(it => {
      if (it.rarity === 'common') { gold += it.value; n++; return false; }
      return true;
    });
    s.gold += gold;
    UI.log(n ? `售出 ${n} 件凡品，+${gold} 金` : '没有可出售的凡品。', n ? 'good' : '');
    UI.renderInventory(); UI.renderHUD();
    if (document.getElementById('shopPanel').classList.contains('open')) UI.openShop(this.shopItems, '铁匠铺');
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

  genShop() {
    const lv = this.state.level;
    const items = [];
    for (let i = 0; i < 6; i++) {
      const it = rollItem(Math.max(1, lv + RNDI(0, 3)), {
        cls: CHANCE(0.8) ? this.state.cls : PICK(['warrior', 'mage', 'taoist']),
        rarity: i === 0 ? 'rare' : (CHANCE(0.55) ? 'magic' : 'common')
      });
      items.push({ item: it, price: Math.round(it.value * 3.2) });
    }
    this.shopItems = items;
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
    this.normalizePlayerItems(this.state);
    this.state.quests = this.state.quests || { active: [], done: [], next: 'q1', announced: {} };
    this.state.quests.announced = this.state.quests.announced || {};
    this.savedSlot = n;
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
