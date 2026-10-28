/* ============================================================
 * 世界 Boss · 运行时（M18.2 ~ M18.5）
 * ------------------------------------------------------------
 * 这套状态机只做五件事，别往里加第六件：
 *
 *   1. **保证「此刻该有哪一只」永远能算出来**（`ensure`）
 *      —— 记录缺字段 / 到点 / 被击杀后冷却结束，都归它管。
 *   2. **让场上的实体跟记录一致**（`sync`，幂等）
 *      —— 该有的没有就刷，不该有的就清。换图 / 复活 / 读档
 *        走的都是同一条路，不需要三个入口各写一遍。
 *   3. **每秒一次心跳**（`tick`）—— 只做「到点换人 + 刷界面文字」。
 *   4. **击杀记账**（`onKill`）—— 记时间戳，不记倒计时。
 *   5. **领域机制**（`domainTick`，M18.5）—— 玩家踩进圈里之后的
 *      六种压制效果。**这是唯一每帧都要跑的一段**，因为它包含位移（吸力）。
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
    /* [M18.7] 到点换人 / 换图：场地效果一起撤 */
    if (typeof WBFight !== 'undefined') WBFight.clear();
    /* [M18.5] 实体被清掉，领域自然失效 —— 主动归位，
     * 不等下一帧 `domainTick` 发现「记录与实体对不上」 */
    this._domainClear();
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
    /* [M18.5] 换图时 `scene.fog` 已经被 `loadMap` 换成了新对象，
     * 缓存的原值（`_fogBase`）指向旧雾，拿它还原会把新图的雾写成旧图的。
     * 所以先丢掉原值，再归位 —— 归位那一步就只会清玩家侧字段。 */
    this._fogBase = null;
    this._domainClear();
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

  /* ============================================================
   * 掉落（M18.8）
   *
   * 必掉 1~3 件传世 + 材料 + 符文，全部走 `Game.spawnLoot` ——
   * **不要直接写 `state.inventory` / `addCraftMat`**。地上那堆东西还要经过
   * 拾取吸附、拾取半径词条、自动拾取（P04）与 `UI.log` 提示；
   * 绕过它，玩家看不到「打出来了什么」，词条也白拿。
   *
   * 三条坑，改之前先看：
   *
   * 【一】传世用 `opts.rarity = 'unique'`，**不要**用 `pool: [['unique', 1]]`。
   *   `rollItem` 在选品质之前还有两个独立入口：2% 法器、2% 命格，
   *   它们只看 `!opts.rarity`。传 `pool` 时那两掷照样发生，
   *   一旦命中就直接 return 一件法器 —— 「必掉传世」当场断掉。
   *
   * 【二】落点必须挪到**尸体边缘**。烛九阴盘起来 14 米、鲲鹏翼展 60 米，
   *   掉在 `e.pos` 就是掉在模型里面：玩家撞不进模型，眼睁睁看着光柱捡不到。
   *
   * 【三】`e.wbLooted` 记账。击杀链路在 `onEnemyDeath` 里，
   *   重入一次就发两遍奖 —— 世界 Boss 是全作唯一稳定产出传世的入口，
   *   发重了等于半个赛季的产出作废。
   * ============================================================ */
  grantLoot(e) {
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!e || !g || !g.spawnLoot) return null;
    if (e.wbLooted) return null;
    const cfg = worldBossById(e.wbId);
    const L = cfg && cfg.loot;
    if (!L) return null;
    e.wbLooted = true;

    const ilvl = (typeof WORLD_BOSS_CFG !== 'undefined' && WORLD_BOSS_CFG.ilvl) || 62;
    const diffKey = (g.state && g.state.difficulty) || 'normal';
    const out = { unique: 0, mats: 0, runes: 0, names: [] };

    /* 尸体边缘的落点：从中心朝玩家方向推出 `radius + 1.5` 米 */
    const base = this._lootAnchor(e, g);

    /* ---- 传世：必掉 1~3 件（难度加成走 diffBonus） ---- */
    const cnt = (typeof worldBossUniqueCount === 'function')
      ? worldBossUniqueCount(cfg, diffKey)
      : { min: L.uniqueMin || 1, max: L.uniqueMax || 3 };
    const n = RNDI(cnt.min, Math.max(cnt.min, cnt.max));
    const classes = (typeof classPackIds === 'function') ? classPackIds() : ['warrior', 'mage', 'taoist'];
    for (let i = 0; i < n; i++) {
      /* 职业随机，不按玩家职业过滤：世界 Boss 是全职业共享的打卡点，
       * 按职业发等于「换个职业就得重打一次 40 级」。 */
      const it = rollItem(ilvl, { rarity: 'unique', cls: PICK(classes) });
      if (!it) continue;
      g.spawnLoot(this._scatter(base, i, 2.4), it, 0);
      out.unique++;
      out.names.push(it.name);
    }

    /* ---- 材料：三种，含世界魂与玄晶 ----
     * 玄晶走 `crystal` 通道（进 `stash.mats.xuanjing`），
     * 其余走 `mat` 通道（进 `craft_<id>`）—— 两条通道的拾取分支不一样，
     * 混着发会变成「捡了但背包没涨」。 */
    let k = 0;
    for (const m of (L.mats || [])) {
      const num = RNDI(m.min, Math.max(m.min, m.max));
      if (m.key === 'xuanjing') {
        g.spawnLoot(this._scatter(base, k++, 2.0), null, 0, { crystal: num });
      } else if (m.key.indexOf('craft_') === 0) {
        g.spawnLoot(this._scatter(base, k++, 2.0), null, 0, { mat: { id: m.key.slice(6), n: num } });
      } else {
        continue;
      }
      out.mats++;
    }

    /* ---- 符文 2~4 个 ---- */
    const rn = L.rune ? RNDI(L.rune.min, Math.max(L.rune.min, L.rune.max)) : 0;
    for (let i = 0; i < rn; i++) {
      g.spawnLoot(this._scatter(base, k++, 2.0), null, 0, { rune: rollRune(ilvl) });
      out.runes++;
    }

    if (typeof UI !== 'undefined' && UI.log) {
      UI.log('【世界 Boss】' + (cfg.name || '巨兽') + ' 遗落：传世 ×' + out.unique +
        ' · 材料 ×' + out.mats + ' · 符文 ×' + out.runes + '。', 'good');
    }
    if (typeof FX !== 'undefined' && FX.flashCircle) {
      FX.flashCircle(new THREE.Vector3(base.x, 0, base.z), 6, 0xffe6a0, 0.6);
    }
    return out;
  },

  /* 掉落落点：尸体中心 → 朝玩家方向推到模型边缘外 1.5 米。
   * 拿不到玩家位置时退回中心（总比不发强）。 */
  _lootAnchor(e, g) {
    const p = e.pos || { x: 0, z: 0 };
    const pl = g.playerGroup && g.playerGroup.position;
    if (!pl) return { x: p.x, z: p.z };
    const dx = pl.x - p.x, dz = pl.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return { x: p.x, z: p.z };
    const rad = (e.cfg && e.cfg.body && e.cfg.body.radius) || e.radius || 3;
    const push = Math.min(d, rad + 1.5);
    return { x: p.x + dx / d * push, z: p.z + dz / d * push };
  },

  /* 一堆掉落别叠在同一个点上：按序号在半径 `r` 的圈上散开 */
  _scatter(base, i, r) {
    const a = i * 2.399963;           // 黄金角，序号连续时也不会排成一条线
    const rr = r * Math.sqrt((i % 7 + 1) / 7);
    return { x: base.x + Math.cos(a) * rr, z: base.z + Math.sin(a) * rr };
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
     * 圈还在 = 玩家会以为领域效果还在生效（毒沼 / 吸力）。
     * [M18.5] 玩家侧效果同理，`domainTick` 下一次就会归位，
     * 但这里主动清一次：击杀的那一帧到下一帧之间还有一次 UI 刷新。 */
    this.dropAura();
    this._domainClear();
    /* [M18.7] 场地效果（毒沼 / 狐火）跟着撤。
     * 本尊倒地了地上还在掉血，玩家会以为「打赢了还在扣血是 bug」。 */
    if (typeof WBFight !== 'undefined') WBFight.clear();
    const cfg = worldBossById(e.wbId);
    /* [M18.8] 掉落。放在播报之后：先「已被讨伐」，再「遗落：…」，
     * 聊天框的顺序和玩家看到的顺序一致（先死，再掉）。 */
    const loot = this.grantLoot(e);
    if (typeof UI !== 'undefined') {
      UI.log('【世界 Boss】' + (cfg ? cfg.name : '巨兽') + ' 已被讨伐。' +
        Math.round(WORLD_BOSS_CFG.cycle / 60000) + ' 分钟后山海间另起一只。', 'good');
      if (UI.renderWorldBoss) UI.renderWorldBoss(this);
    }
    if (typeof SFX !== 'undefined' && SFX.levelup) SFX.levelup();
    return true;
  },

  /* ============================================================
   * 六、领域机制（M18.5）
   *
   * 六只各有一套「站在圈里就不舒服」的规则。数据早在 M18.1 就写进
   * `domain.player` 了，这一段只负责**读它并生效**。
   *
   * 三条硬规矩，改之前先看：
   *
   * 【一】「在不在圈里」用 `rec()` 的 (x,z) + `domain.radius`，
   *   不用实体坐标。实体被击退 / 追击时会跑，圈跟着飘的话，
   *   玩家会看到「明明站在圈里却没中毒」，从此认为圈是假的。
   *   圈是**地点**的属性，不是**怪物**的属性。
   *
   * 【二】每种效果写进自己的字段（`domSlow` / `domAspd` / `domSight`…），
   *   不并进 `playerSlow` / `poisonT`。
   *   并进去的话出圈时要「减掉多少」是算不清的：
   *   减多了会顺手抹掉敌人刚给的冰霜减速，减少了会留下永久残留 ——
   *   也就是「打完 Boss 移速永远慢 20%」这种没人查得动的 bug。
   *   独立字段 + `_domainClear()` 一次性归零，代价是多两个字段。
   *
   * 【三】视觉类（视野 / 小地图）也必须能归位。
   *   视野要先记原值（`_fogBase`）再改，出圈写回去；
   *   **不要**拿 `MAPS[mapId].fogFar` 当原值 —— `dungeon.js` 会就地
   *   乘 0.65，那张表早被改过了，拿它还原会越还原越短。
   *
   * 与阶段的关系：视野取 `phases[i].enter.sight`（M18.7 才有真正的
   * 阶段切换，这里先按当前血量算阶段，所以 P2 一进入视野就压到 8 米，
   * 不用等 M18.7 落地 —— 昼夜领域的「闭眼」本来就是这个意思）。
   * ============================================================ */

  /* 领域效果的文案：名字 / 图标 / 一句话。buff 条与日志共用一份，
   * 别在两处各写一遍，否则改数值时必有一处忘掉。 */
  DOMAIN_TEXT: {
    daynight: { icon: '夜', text: (pl, sight) => '视野压缩到 ' + sight + ' 米' },
    poison: { icon: '毒', text: (pl) => '每秒失去 ' + pl.dotPct + '% 最大生命' },
    tide: { icon: '水', text: (pl) => '移动速度 −' + pl.slow + '%' },
    devour: { icon: '噬', text: (pl) => '每秒被拉近 ' + pl.pull + ' 米' },
    warcry: { icon: '战', text: (pl) => '攻击速度 ' + (pl.aspd > 0 ? '+' : '') + pl.aspd + '%' },
    illusion: { icon: '幻', text: () => '小地图被迷雾遮蔽' }
  },

  /* 当前领域状态。每帧一次，也给 UI / 小地图复用。
   * 返回 null 表示「没有可生效的领域」：没记录 / 已讨伐 / 不在本图 / 数据缺半径。 */
  domainState() {
    if (typeof Game === 'undefined' || !Game.state || !Game.playerGroup) return null;
    const r = this.rec();
    if (!r || r.killed) return null;
    const s = Game.state;
    if (s.mapId !== r.mapId) return null;
    const cfg = worldBossById(r.id);
    if (!cfg) return null;
    const dom = (typeof worldBossDomain === 'function') ? worldBossDomain(cfg) : cfg.domain;
    if (!dom || !dom.radius) return null;
    const p = Game.playerGroup.position;
    const dist = Math.hypot(p.x - r.x, p.z - r.z);
    return { r, cfg, dom, dist, inside: dist <= dom.radius };
  },

  /* 每帧结算。`Game.update` 里在 `anim` 之后、死亡判定之前调。 */
  domainTick(dt) {
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!g || !g.state) return;
    const d = this.domainState();
    /* 死亡 / 离图 / 已讨伐 / 出圈 → 一律归位。归位必须幂等：
     * 站在圈外时这个分支每帧都会走一次。 */
    if (!d || !d.inside || g.dead || (g.state.hp || 0) <= 0) {
      this._domainClear();
      return;
    }

    const dom = d.dom;
    const pl = dom.player || {};
    const kind = dom.kind || dom.id || '';
    /* 单帧步长夹在 0.1 秒内：切后台回来 dt 可能是 3 秒，
     * 不夹的话「吸力」会把人一次拉进模型里、「毒」会一次结算 3 跳。 */
    const step = Math.max(0, Math.min(0.1, dt || 0));

    /* 当前阶段（M18.7 之前先按血量算，见文件头说明） */
    const e = this.live();
    const frac = (e && e.maxHp) ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 1;
    const phases = d.cfg.phases || [];
    const phase = phases.length && typeof worldBossPhaseAt === 'function'
      ? phases[worldBossPhaseAt(d.cfg, frac)] : null;
    const enter = (phase && phase.enter) || {};

    /* ---- 视野（昼夜领域）---- */
    let sight = 0;
    if (typeof pl.sightDay === 'number' || typeof pl.sightNight === 'number') {
      sight = (typeof pl.sightDay === 'number') ? pl.sightDay : pl.sightNight;
      if (typeof enter.sight === 'number') sight = enter.sight;   // 阶段覆盖
      /* [M18.7] 昼夜交替（烛九阴 P3）：`enter.sight` 写的是**夜**那一档，
       * 天亮时要回到领域自己的 `sightDay`。
       *
       * 谁在管「现在是昼还是夜」？`WBFight.nightOf(e)` —— 它读 `e.wbNight`，
       * 由 `WBFight.ai()` 按 `dayNightCycle` 每 N 毫秒翻一次。
       * **这里不要自己再跑一个计时器**：两套计时器一定会漂，
       * 漂了的表现是「视野亮了但暗潮还放得出来」（或反过来），
       * 而且玩家会觉得领域坏了，而不是觉得 BOSS 在切昼夜。 */
      if (typeof enter.dayNightCycle === 'number' && enter.dayNightCycle > 0 && e &&
          typeof WBFight !== 'undefined' && !WBFight.nightOf(e)) {
        sight = (typeof pl.sightDay === 'number') ? pl.sightDay : 26;
      }
    }
    this._applySight(sight);

    /* ---- 持续伤害（毒沼领域）---- */
    if (typeof pl.dotPct === 'number' && pl.dotPct > 0) {
      const iv = Math.max(0.25, pl.dotInterval || 1);
      this._dotT = (this._dotT || 0) + step;
      /* while 而不是 if：一帧最多补 1 跳（step 已夹到 0.1 秒，
       * iv 最小 0.25，所以理论上进不来第二跳；写成 while 是防以后调小 iv）。
       * `+1e-6` 是浮点补偿：0.1 累加 10 次得到 0.9999999999999999，
       * 严格比 1 小，会白等一帧才结算 —— 秒级节拍上这一帧的抖动很明显。 */
      let guard = 0;
      while (this._dotT + 1e-6 >= iv && guard++ < 4) {
        this._dotT -= iv;
        const dmg = Math.max(1, (g.state.stats.hpMax || 100) * pl.dotPct / 100);
        /* pierce：环境伤害不吃护甲 / 抗性 / 难度，否则「0.6% 最大生命」
         * 在满装身上只剩 0.2%，堆防御就等于免疫领域 */
        g.damagePlayer(dmg, null, { pierce: true });
        if (typeof FX !== 'undefined' && g.playerGroup) {
          const p = g.playerGroup.position;
          FX.text(new THREE.Vector3(p.x, 2.3, p.z), '毒沼', 'player', { life: 0.7 });
        }
      }
    } else this._dotT = 0;

    /* ---- 减速 / 攻速（水天 / 战意）---- */
    g.domSlow = (typeof pl.slow === 'number') ? Math.max(0, Math.min(0.8, pl.slow / 100)) : 0;
    g.domAspd = (typeof pl.aspd === 'number') ? Math.max(-60, Math.min(60, pl.aspd)) : 0;

    /* ---- 吸力（吞噬领域）---- */
    if (typeof pl.pull === 'number' && pl.pull > 0) {
      const mul = (typeof enter.pullMul === 'number') ? enter.pullMul : 1;
      const p = g.playerGroup.position;
      const dx = d.r.x - p.x, dz = d.r.z - p.z;
      const len = Math.hypot(dx, dz);
      /* 1.2 米以内不再拉：再拉就把人塞进模型里，玩家会以为卡住了 */
      if (len > 1.2) {
        const v = Math.min(6, pl.pull * mul) * step;
        const ux = dx / len, uz = dz / len;
        p.x += ux * v; p.z += uz * v;
        if (g.collideWorld) g.collideWorld(p, 0.55, { x: ux, z: uz });
      }
    }

    /* ---- 小地图压暗（幻域）---- */
    this._dim = (typeof pl.minimapDim === 'number') ? Math.max(0, Math.min(0.75, pl.minimapDim)) : 0;

    /* ---- 进场那一下：记名字 / 色 / 文案，并写一条日志 ---- */
    if (!this._inDomain) {
      this._inDomain = true;
      const t = this.DOMAIN_TEXT[kind] || {};
      this._inName = dom.name || '领域';
      this._inColor = dom.color || '#e0895a';
      this._inIcon = t.icon || '域';
      this._inDesc = t.text ? t.text(pl, sight) : (dom.desc || '');
      if (typeof UI !== 'undefined' && UI.log) {
        UI.log('踏入「' + this._inName + '」—— ' + this._inDesc, 'bad');
      }
      if (typeof UI !== 'undefined' && UI.renderBuffs) UI.renderBuffs();
    } else {
      /* 数值会随阶段变（视野 / 吸力倍率），文案跟着刷新，
       * 但不重建 DOM —— renderBuffs 自己按签名去重 */
      const t = this.DOMAIN_TEXT[kind] || {};
      this._inDesc = t.text ? t.text(pl, sight) : this._inDesc;
    }
  },

  /* 归位。离开领域 / 死亡 / 换图 / 被讨伐 全走这里，**必须幂等**。 */
  _domainClear() {
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (g) {
      if (g.domSlow) g.domSlow = 0;
      if (g.domAspd) g.domAspd = 0;
    }
    const had = this._inDomain || this._fogBase || this._dim;
    this._dim = 0;
    this._dotT = 0;
    this._restoreSight();
    this._fogBase = null;
    if (!had) return;
    const name = this._inName;
    this._inDomain = false;
    this._inName = null;
    if (name && typeof UI !== 'undefined' && UI.log) UI.log('离开「' + name + '」');
    if (typeof UI !== 'undefined' && UI.renderBuffs) UI.renderBuffs();
  },

  /* 视野压缩。`sight` 为 0 / 非正数 = 不压。
   *
   * 只改 `fog.far` 是不够的：雾色还是白天的浅蓝，压到 8 米之后
   * 屏幕上就是**一片亮白**，玩家第一反应是「贴图没加载」，
   * 而不是「天黑了」。所以视野压得越狠，雾色 / 天空 / 环境光
   * 一起往夜色（#05070c）走 —— 那才读得出「闭眼为夜」。
   *
   * near 跟着 far 按同比例收：只改 far 会变成「近处清楚、远处一堵墙」，
   * 看起来像贴图错误而不是「看不见」。
   *
   * 原值存在 `_fogBase` 里，出圈 / 换图必须原样写回（`_domainClear`）。 */
  _applySight(sight) {
    const g = (typeof Game !== 'undefined') ? Game : null;
    const fog = g && g.scene && g.scene.fog;
    if (!fog) return;
    /* 没视野效果就别去抓原值 —— 抓了会让 `_domainClear` 以为
     * 「这次压过视野」，多跑一遍还原与 UI 刷新 */
    if (!(sight > 0)) { this._restoreSight(); return; }
    if (!this._fogBase) {
      this._fogBase = {
        near: fog.near, far: fog.far,
        fog: fog.color ? fog.color.clone() : null,
        bg: (g.scene.background && g.scene.background.clone) ? g.scene.background.clone() : null,
        hemi: g.hemi ? g.hemi.intensity : 0,
        sun: g.sun ? g.sun.intensity : 0
      };
    }
    const b = this._fogBase;

    const k = Math.min(1, sight / Math.max(1, b.far));
    fog.far = Math.max(8, Math.min(b.far, sight));
    fog.near = Math.max(2, b.near * k);

    /* 夜色按**绝对距离**算，不按比例。
     * 各图 fogFar 是 98~196，按比例算的话同一只 boss 在雾近的图上
     * 「白天」就已经黑成一片，在不同图上表现不一样。
     * 语义也清楚：18 米以上只是「视野收窄」（还是白天），
     * 掉到 6 米才「闭眼为夜」。数据里 sightDay 26 / sightNight 8
     * 正好落在两端。 */
    const t = Math.max(0, Math.min(1, (18 - sight) / 12));
    if (!this._night) this._night = new THREE.Color(0x05070c);
    if (b.fog && fog.color) fog.color.copy(b.fog).lerp(this._night, t * 0.9);
    if (b.bg && g.scene.background && g.scene.background.copy) {
      g.scene.background.copy(b.bg).lerp(this._night, t * 0.9);
    }
    /* 光也一起压：只压雾会变成「远处全黑、身边亮得像白天」，很割裂 */
    if (g.hemi) g.hemi.intensity = b.hemi * (1 - t * 0.55);
    if (g.sun) g.sun.intensity = b.sun * (1 - t * 0.55);
  },

  /* 把雾 / 天空 / 光照写回进圈前的值。没有原值就什么都不做。 */
  _restoreSight() {
    const g = (typeof Game !== 'undefined') ? Game : null;
    const b = this._fogBase;
    if (!b) return;
    const fog = g && g.scene && g.scene.fog;
    if (fog) {
      fog.near = b.near; fog.far = b.far;
      if (b.fog && fog.color) fog.color.copy(b.fog);
    }
    if (b.bg && g.scene.background && g.scene.background.copy) g.scene.background.copy(b.bg);
    if (g.hemi && typeof b.hemi === 'number') g.hemi.intensity = b.hemi;
    if (g.sun && typeof b.sun === 'number') g.sun.intensity = b.sun;
  },

  /* 小地图压暗系数（0 = 不压）。给 `Minimap.draw` 读。 */
  dim() { return this._dim || 0; },

  /* buff 条那一条。没站在圈里返回 null。
   * `noTimer` —— 它没有「剩余秒数」，出去就没了。 */
  domainBuff() {
    if (!this._inDomain || !this._inName) return null;
    return {
      name: this._inName, dur: 0, noTimer: true, type: 'debuff',
      color: this._inColor || '#e0895a', icon: this._inIcon || '域',
      desc: this._inDesc || ''
    };
  },

  /* ============================================================
   * 七、给 UI 读的纯查询
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
