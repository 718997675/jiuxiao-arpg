/* ============================================================
 * 世界 Boss · 运行时（M18.2）
 * ------------------------------------------------------------
 * 这套状态机只做四件事，别往里加第五件：
 *
 *   1. **保证「此刻该有哪一只」永远能算出来**（`ensure`）
 *      —— 记录缺字段 / 到点 / 被击杀后冷却结束，都归它管。
 *   2. **让场上的实体跟记录一致**（`sync`，幂等）
 *      —— 该有的没有就刷，不该有的就清。换图 / 复活 / 读档
 *        走的都是同一条路，不需要三个入口各写一遍。
 *   3. **每秒一次心跳**（`tick`）—— 只做「到点换人 + 刷界面文字」。
 *   4. **击杀记账**（`onKill`）—— 记时间戳，不记倒计时。
 *
 * ------------------------------------------------------------
 * 三条设计决定，改之前先看：
 *
 * 【一】存时间戳，不存倒计时。
 *   存 `{ until: 1761... }` 而不是 `{ left: 1234 }`：关页面、切后台、
 *   换设备、改系统时间之外的一切情况，回来都是对的。
 *   倒计时只要有一帧没跑（手机切后台必然发生）就开始漂，
 *   而且**越玩越短**，玩家会以为被坑了。
 *   时间一律 `Date.now()` 比对，**不要累加 dt** —— 理由同上。
 *
 * 【二】不写进 `MAPS[mapId].bosses`。
 *   那张表是「常驻首领」，`spawnBosses()` 每次读档都会按它重生一遍。
 *   世界 Boss 是临时挂上去的，写进去会变成「每次进图都有」，
 *   30 分钟轮转直接失效。
 *
 * 【三】「到点换人」和「击杀后冷却」走同一条出口。
 *   两种情况下 `until` 都是「下一只出现的时刻」，区别只有 `killed`：
 *     · 无人击杀：`until = spawnAt + cycle`，到点**立刻**换下一只（不空窗）
 *     · 被击杀：  `until = killAt  + cycle`，这 30 分钟里地图上什么都没有
 *   统一成一个判断（`now >= until` → `rollNext`）之后，
 *   状态机只有「有记录 / 没记录」两态，不用维护第三个布尔。
 *
 * ------------------------------------------------------------
 * 与八部天龙的关系：**只借生命周期，不借战斗**。
 *   八部的 8 只魔将写在 `MAPS[*].bosses` 里（常驻、要印才进），
 *   抗性一个洞 + 四条墙、配 `stagger` 破绽窗口。
 *   世界 Boss 抗性全平（答案在 `domain`），三阶段 + 领域。
 *   两边唯一的共同点是「都是 boss」，连刷新方式都不一样 ——
 *   这是刻意的，见 `data-worldboss.js` 文件头第二版说明。
 * ============================================================ */

const WorldBoss = {
  /* tick 节流累计（秒）。1 秒一次：倒计时只显示到秒，跑更快没意义 */
  _acc: 0,
  /* 上一次播报过的 spawnAt。用来区分「换人了」和「还是那只」 */
  _seenSpawnAt: 0,
  /* 当前场上那只的 enemy id（调试用；判断活着与否以 Game.enemies 为准） */
  _liveId: null,

  /* ============================================================
   * 一、存档记录
   * ============================================================ */

  /* 取记录。**不做修补** —— 修补在 ensure 里做，
   * 因为这里每帧都可能被 UI 调到，不该有副作用。 */
  rec() {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const r = Game.state.worldBoss;
    return (r && typeof r === 'object') ? r : null;
  },

  /* 记录是否可用。存档被手改 / 版本回退 / 图被删掉时都要当成「没有」，
   * 而不是带着一个 id 找不到的 boss 跑下去（那会在 spawn 里静默 null）。 */
  _valid(r) {
    if (!r || typeof r !== 'object') return false;
    if (!worldBossById(r.id)) return false;
    if (!r.mapId || !MAPS[r.mapId]) return false;
    if (!isFinite(r.x) || !isFinite(r.z)) return false;
    if (!isFinite(r.spawnAt) || !isFinite(r.until)) return false;
    return true;
  },

  /* ============================================================
   * 二、状态推进
   * ============================================================ */

  /* 保证「此刻该有哪一只」有答案。返回记录（或 null = 还没到等级）。
   *
   * 为什么等级不够时把记录清掉而不是留着：
   * 留着的表现是「39 级时档里有一只 60 级 Boss 的坐标，40 级一到
   * 它就凭空出现在你旁边」。清掉之后，40 级第一次 tick 会正常 roll 一只，
   * 并且走横幅播报 —— 升级那一刻看见「世界 Boss 现世」是好事。 */
  ensure() {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const s = Game.state;
    if ((s.level || 1) < WORLD_BOSS_CFG.minLevel) {
      if (s.worldBoss) s.worldBoss = null;
      return null;
    }
    let r = this.rec();
    if (r && !this._valid(r)) { s.worldBoss = null; r = null; }
    if (!r) return this.rollNext();
    if (Date.now() >= (r.until || 0)) return this.rollNext();
    return r;
  },

  /* 滚下一只。规则三条：
   *   · 不取上一只（连续两次同一只 = 玩家以为没刷新）
   *   · 候选图优先取玩家**已经去过**的（刷在没解锁的图上，横幅点了是灰的）
   *   · 落点走 `bossPosOf`，和常驻首领同一套口径（老图坐标 / sanctum 推导） */
  rollNext() {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const s = Game.state;
    if ((s.level || 1) < WORLD_BOSS_CFG.minLevel) return null;

    const prev = this.rec();
    const prevId = prev ? prev.id : null;
    /* 用 ORDER 而不是 Object.keys：顺序固定，压缩/改写后也不会乱 */
    const pool = WORLD_BOSS_ORDER.filter(id => id !== prevId);
    const id = pool[Math.floor(Math.random() * pool.length)] || WORLD_BOSS_ORDER[0];
    const cfg = worldBossById(id);
    if (!cfg) return null;

    const seen = Array.isArray(s.mapsSeen) ? s.mapsSeen : [];
    const opened = (cfg.homeMaps || []).filter(m => MAPS[m] && seen.indexOf(m) >= 0);
    const cand = opened.length ? opened : (cfg.homeMaps || []);
    const mapId = cand[Math.floor(Math.random() * cand.length)] || cfg.map;

    const pos = (typeof bossPosOf === 'function')
      ? bossPosOf(mapId, id, 0)
      : [0, -30];
    const now = Date.now();
    s.worldBoss = {
      id: id,
      mapId: mapId,
      x: pos[0], z: pos[1],
      spawnAt: now,
      until: now + WORLD_BOSS_CFG.cycle,
      killed: false,
      /* 图鉴（M18.9）要用「上一只死在哪」做「已讨伐」记录，
       * 但那是另一个字段的事，这里只留击杀时间给 UI 算冷却 */
      killAt: 0
    };
    this._liveId = null;
    return s.worldBoss;
  },

  /* ============================================================
   * 三、实体同步
   * ============================================================ */

  /* 场上活着的那只（可能不在当前图 —— 换图后 enemies 会被清空） */
  live() {
    if (typeof Game === 'undefined' || !Game.enemies) return null;
    for (const e of Game.enemies) if (e.wb && !e.dead) return e;
    return null;
  },

  /* 幂等同步：该有的没有就刷，不该有的就清。
   * 读档 / 换图 / 复活 / 到点换人 全走这里，不各写一遍。 */
  sync() {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const s = Game.state;
    const r = this.rec();
    const now = Date.now();
    const should = !!r && !r.killed && now < r.until && r.mapId === s.mapId;
    if (!should) { this.despawn(); return null; }
    if (this.live()) return this.live();
    return this.spawn();
  },

  spawn() {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const r = this.rec();
    if (!r) return null;
    const cfg = worldBossById(r.id);
    if (!cfg) return null;
    if (Game.state.mapId !== r.mapId) return null;
    if (this.live()) return null;
    /* 走 spawnEnemy 而不是自己拼一只：血量成长、护甲、抗性、精英词缀、
     * 名字牌、碰撞半径全都已经在那里算好了，复制一份必然漂移。 */
    const e = Game.spawnEnemy(null, r.x, r.z, false, WORLD_BOSS_CFG.level, r.id);
    if (!e) return null;
    e.wb = true;
    e.wbId = r.id;
    this._liveId = e.id;
    this.makeAura(e, cfg);
    return e;
  },

  /* 清场。只清 `e.wb` 的，别碰常驻首领。 */
  despawn() {
    if (typeof Game === 'undefined' || !Game.enemies) return;
    const g = Game;
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (!e.wb) continue;
      if (g.boss === e) { g.boss = null; if (typeof UI !== 'undefined') UI.updateBoss(null); }
      if (e.actor && e.actor.group && typeof disposeTree === 'function') disposeTree(e.actor.group);
      g.enemies.splice(i, 1);
    }
    this._liveId = null;
    this.dropAura();
  },

  /* ============================================================
   * 四、领域光环（M18.4）
   *
   * 为什么挂在 scene 上而不是 boss 的 group 下：
   *   boss 的 `group.scale` 是 4.6~5.6。挂进去的环会被同倍放大，
   *   30 米的领域会变成 160 米，一眼就看得出「圈是假的」。
   *   所以光环是**世界坐标**里的独立物体，跟着 boss 的位置走，
   *   不吃缩放。
   *
   * 为什么用两圈而不是一圈：
   *   外圈（实线细环）是「边界」—— 玩家要能一眼看出踩没踩进去；
   *   内圈（虚线 + 缓慢反向旋转）是「它还活着」—— 静态圈看起来像
   *   贴图，会被人当成地面装饰。旋转速度故意很慢（0.12 rad/s，
   *   一圈 52 秒），快一点就像洗衣机。
   * ============================================================ */

  makeAura(e, cfg) {
    this.dropAura();
    if (typeof THREE === 'undefined' || typeof Game === 'undefined' || !Game.scene) return;
    const dom = (typeof worldBossDomain === 'function') ? worldBossDomain(cfg) : (cfg && cfg.domain);
    if (!dom || !dom.radius) return;
    const col = new THREE.Color(dom.color || '#e0895a');
    const grp = new THREE.Group();
    grp.position.set(e.pos.x, 0, e.pos.z);

    const mkMat = (op) => new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    /* 外圈：边界。宽度 3.5% 半径，远看是一条亮线，近看不糊成一片 */
    const edgeMat = mkMat();
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(dom.radius * 0.965, dom.radius, 96), edgeMat);
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.07;
    grp.add(edge);

    /* 内圈：符文环（这里用虚线环代替真符文 —— 零素材底线，
     * 真符文要贴图；等 M18.6 有骨架了再换成实例化的小方块） */
    const runeMat = mkMat();
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(dom.radius * 0.80, dom.radius * 0.835, 64, 1), runeMat);
    rune.rotation.x = -Math.PI / 2; rune.position.y = 0.05;
    grp.add(rune);

    /* 地面染色：一块很淡的圆盘，让「领域内」和「领域外」的地面
     * 在余光里就不一样。透明度压到 0.06 —— 再高会盖掉地貌贴图。 */
    const fillMat = mkMat();
    fillMat.blending = THREE.NormalBlending;
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(dom.radius * 0.96, 64), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.03;
    grp.add(fill);

    Game.scene.add(grp);
    this._aura = {
      grp, edge, rune, fill,
      edgeMat, runeMat, fillMat,
      t: 0,
      fade: WORLD_BOSS_CFG.domainFade || 1.5,
      maxEdge: 0.55, maxRune: 0.32, maxFill: 0.06
    };
  },

  dropAura() {
    const a = this._aura;
    if (!a) return;
    this._aura = null;
    if (typeof Game !== 'undefined' && Game.scene && a.grp) Game.scene.remove(a.grp);
    if (typeof disposeTree === 'function' && a.grp) { try { disposeTree(a.grp); } catch (e) {} }
  },

  /* 每帧调（不是每秒）—— 淡入 1.5 秒 + 旋转，节流到 1 秒会一顿一顿的。
   * 没有光环时是**一次判空就返回**，代价可以忽略。 */
  anim(dt) {
    const a = this._aura;
    if (!a) return;
    a.t += (dt || 0);
    const k = Math.min(1, a.t / a.fade);
    const ease = k * k * (3 - 2 * k);          // smoothstep：起止都不生硬
    a.edgeMat.opacity = a.maxEdge * ease;
    a.runeMat.opacity = a.maxRune * ease * (0.82 + 0.18 * Math.sin(a.t * 1.7));
    a.fillMat.opacity = a.maxFill * ease;
    a.rune.rotation.z -= (dt || 0) * 0.12;      // 一圈约 52 秒
    a.edge.rotation.z += (dt || 0) * 0.03;
  },

  /* ============================================================
   * 五、心跳
   * ============================================================ */

  /* 每秒一次。**只做两件事**：到点换人、刷倒计时文字。
   * 战斗、领域、阶段全在别处 —— 这里多写一行，就会变成
   * 「帧率和世界 Boss 的倒计时耦合」这种没人查得动的 bug。 */
  tick(dt) {
    if (typeof Game === 'undefined' || !Game.state) return;
    this._acc += (dt || 0);
    if (this._acc < 1) return;
    this._acc = 0;

    const before = this.rec();
    const prevSpawnAt = before ? before.spawnAt : 0;
    const r = this.ensure();
    if (!r) { this.despawn(); return; }

    /* 换人了就播报一次。用 spawnAt 判定而不是 id：
     * 同一只被清掉再刷（比如换图回来）不该再播一遍横幅。 */
    if (r.spawnAt !== prevSpawnAt && r.spawnAt !== this._seenSpawnAt) {
      this._seenSpawnAt = r.spawnAt;
      this.announce(r);
    }
    this.sync();
    if (typeof UI !== 'undefined' && UI.renderWorldBoss) UI.renderWorldBoss(this);
  },

  /* 换图 / 读档 / 复活 后调用：先对齐记录，再同步实体。
   * **不要**在这里播横幅 —— 进图时「它本来就在那儿」，
   * 再播一次会让人以为刚刚刷的。 */
  onMapEnter() {
    this._acc = 0;
    this._liveId = null;
    const r = this.ensure();
    this._seenSpawnAt = r ? r.spawnAt : 0;
    this.sync();
    if (typeof UI !== 'undefined' && UI.renderWorldBoss) UI.renderWorldBoss(this);
    /* 进图时如果它就在这张图上，给一条日志（不是横幅）——
     * 玩家需要知道「这图里有个大家伙」，但不需要被吓一跳 */
    if (r && !r.killed && r.mapId === (Game.state || {}).mapId) {
      const cfg = worldBossById(r.id);
      if (cfg) UI.log('【世界 Boss】' + cfg.name + ' 在此地图 ' + this.timeText() + ' 后离去。', 'bad');
    }
  },

  /* 击杀记账。由 game.js 的 onKill 转发（不要在那里直接改 state）。 */
  onKill(e) {
    if (!e || !e.wb) return false;
    const r = this.rec();
    const now = Date.now();
    if (r) {
      r.killed = true;
      r.killAt = now;
      /* 击杀后整整一个周期不再刷 —— 这是「打卡」节奏：
       * 打完这一只，接下来半小时该去干别的。 */
      r.until = now + WORLD_BOSS_CFG.cycle;
    }
    this._liveId = null;
    this._seenSpawnAt = 0;
    /* 尸体留在场上做死亡动画，但领域圈要立刻撤 ——
     * 圈还在 = 玩家会以为领域效果还在生效（毒沼 / 吸力）。 */
    this.dropAura();
    const cfg = worldBossById(e.wbId);
    if (typeof UI !== 'undefined') {
      UI.log('【世界 Boss】' + (cfg ? cfg.name : '巨兽') + ' 已被讨伐。' +
        Math.round(WORLD_BOSS_CFG.cycle / 60000) + ' 分钟后山海间另起一只。', 'good');
      if (UI.renderWorldBoss) UI.renderWorldBoss(this);
    }
    if (typeof SFX !== 'undefined' && SFX.levelup) SFX.levelup();
    return true;
  },

  /* ============================================================
   * 六、给 UI 读的纯查询
   * ============================================================ */

  /* 剩余毫秒。已击杀时是「距离下一只出现」。
   *
   * 封顶在 `cycle`：正常情况永远不会超（until 只可能是 spawnAt/killAt + cycle），
   * 唯一的例外是**系统时钟往回跳**。不封顶的话玩家会看到「61:20 后离去」
   * 这种明显不对的数字，封顶之后最坏情况只是「显示满 30 分钟」。 */
  remaining() {
    const r = this.rec();
    if (!r) return 0;
    const left = (r.until || 0) - Date.now();
    if (left <= 0) return 0;
    return Math.min(left, WORLD_BOSS_CFG.cycle);
  },

  /* mm:ss。倒计时文本三处（横幅 / 山海志 / 追踪行）必须同一份，
   * 各写一个 format 迟早出现「一处 12:34 一处 12:35」。 */
  timeText() {
    const s = Math.ceil(this.remaining() / 1000);
    const mm = Math.floor(s / 60), ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  },

  /* 当前那只的配置（被击杀后仍然返回，图鉴要显示「刚才那只」） */
  cur() {
    const r = this.rec();
    return r ? worldBossById(r.id) : null;
  },

  /* 是否活着站在场上（不是「记录存在」—— 被击杀后记录还在） */
  alive() {
    const r = this.rec();
    return !!r && !r.killed && Date.now() < r.until;
  },

  /* 追踪行 / 山海志卡片的正文 */
  statusText() {
    const r = this.rec();
    const cfg = worldBossById(r && r.id);
    if (!r || !cfg) return '';
    const map = MAPS[r.mapId] || {};
    return '世界 Boss · ' + cfg.name + ' · ' + (map.name || r.mapId) + ' · ' +
      this.timeText() + (r.killed ? ' 后再现' : ' 后离去');
  },

  /* 播报：横幅 + 号角 + 日志。等级不够的人不该看到这个 ——
   * 他打不了，只会以为游戏坏了。 */
  announce(r) {
    const cfg = worldBossById(r && r.id);
    if (!cfg) return;
    const s = (typeof Game !== 'undefined') ? Game.state : null;
    if (!s || (s.level || 1) < WORLD_BOSS_CFG.minLevel) return;
    const map = MAPS[r.mapId] || {};
    if (typeof UI !== 'undefined') {
      if (UI.showWorldBossBanner) UI.showWorldBossBanner(cfg, map.name || r.mapId);
      UI.log('【世界 Boss】' + cfg.name + ' 现世于 ' + (map.name || r.mapId) +
        '，' + this.timeText() + ' 后离去。', 'bad');
    }
    if (typeof SFX !== 'undefined' && SFX.boss) SFX.boss();
  }
};
