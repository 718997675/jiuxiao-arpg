/* ============================================================
 * SaveManager —— 存档系统 v2（S0「存档地基」）
 *
 * · 10 个本地角色位（jiuxiao_save_v2_s1 … s10，数量见 SLOT_COUNT）
 * · schemaVersion = 3（M0 世界结构：world.part/act/camps/portals/mapsSeen），doc 结构见下方 pack()
 * · migrate()：V1 单档（扁平 JSON）→ V2 doc，字段 1:1 搬迁，不改数值
 *   V2 → V3 不需要单独的函数：normalizeDoc() 会按 mapId 反推卷/章并补默认值，
 *   读档时 changed=true 自动写回，等于就地升级。
 * · export() / import()：JSON 文本 + 文件
 * · 原子写入：先写 <key>.tmp 并回读校验，再替换正式键
 *
 * 设计原则：
 *   运行时 Game.state 仍是一个扁平对象（V1 的字段全保留），
 *   pack()/unpack() 负责在「扁平 state」与「V2 分层 doc」之间转换。
 *   这样 S0 不会碰到任何战斗/装备逻辑，后面 S1-S7 只需往 doc 里加字段。
 *
 * 存储键：
 *   jiuxiao_save_v2_s{N}   角色位 N（V2 doc）
 *   jiuxiao_save_v2_s{N}.tmp  写入中的临时键
 *   jiuxiao_active_slot    当前角色位
 *   jiuxiao_save_v1        V1 旧档（迁移后保留不删，作为最后一道保险）
 *   jiuxiao_save_v1.bak    V1 旧档原始备份（迁移前写入，只写不覆盖有效备份）
 *   jiuxiao_migrated_v2    迁移完成时间戳
 * ============================================================ */

const SaveManager = {
  SCHEMA: 3,
  /* [v1.13.1] 角色位 3 → 10。所有取位、遍历、校验都读这个常量，
   * 所以改这一处就够；UI 那边只有中文数字表要跟着补。
   * 存档键是 jiuxiao_save_v2_s{N}，旧的 1~3 号位原样不动。 */
  SLOT_COUNT: 10,

  LEGACY_KEY: 'jiuxiao_save_v1',
  BACKUP_KEY: 'jiuxiao_save_v1.bak',
  ACTIVE_KEY: 'jiuxiao_active_slot',
  MIGRATED_KEY: 'jiuxiao_migrated_v2',

  lastError: '',
  lastSavedAt: 0,
  initDone: false,
  migrated: false,
  _createdAt: {},

  _DEFAULT_SLOTS: ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand', 'relic', 'fate'],

  /* ---------------- 基础工具 ---------------- */
  slotKey(n) { return 'jiuxiao_save_v2_s' + n; },
  validSlot(n) {
    const v = Math.round(Number(n));
    return (isFinite(v) && v >= 1 && v <= this.SLOT_COUNT) ? v : 1;
  },
  equipSlots() {
    try {
      if (typeof SLOT_ORDER !== 'undefined' && Array.isArray(SLOT_ORDER) && SLOT_ORDER.length) return SLOT_ORDER;
    } catch (e) { }
    return this._DEFAULT_SLOTS;
  },
  /* 技能条整形：截到 SKILL_BAR_SLOTS 格、非字符串置 null、补满长度。
   * 两套快捷栏共用；数据层没加载时退回 8 格常量。 */
  _bar(arr) {
    const n = (typeof SKILL_BAR_SLOTS === "number") ? SKILL_BAR_SLOTS : 8;
    const out = Array.isArray(arr) ? arr.slice(0, n).map(v => (typeof v === 'string' && v) ? v : null) : [];
    while (out.length < n) out.push(null);
    return out;
  },
  _now() { return Date.now(); },
  /* [v1.8.5] 根基加点整形：四项各是 0~999 的非负整数，缺项补 0。
   * 手改存档把某一项写成字符串也能收敛回来，不会让面板算出 NaN。 */
  _attrAlloc(v) {
    const src = this._obj(v) || {};
    const keys = (typeof ATTR_KEYS !== 'undefined') ? ATTR_KEYS : ['str', 'agi', 'vit', 'int'];
    const out = {};
    for (const k of keys) out[k] = this._int(src[k], 0, 999, 0);
    return out;
  },
  _int(v, min, max, def) {
    const n = Math.round(Number(v));
    if (!isFinite(n)) return (def === undefined ? min : def);
    return Math.max(min, Math.min(max, n));
  },
  _num(v, def) {
    const n = Number(v);
    if (!isFinite(n)) return (def || 0);
    return n;
  },
  _obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; },
  /* 是不是「本代 doc」：v2 ~ 当前 SCHEMA 都算。
   * ⚠ 别写成 v === SCHEMA —— 那样每次升版本，所有老档都会读不出来（存档面板整排变空）。
   * 升级本身不需要额外代码：normalizeDoc 会补默认值，readSlot 看到 changed 自动写回。 */
  _isDoc(v) { return typeof v === 'number' && v >= 2 && v <= this.SCHEMA; },
  /* [试炼] 无尽试炼的永久记录：{ best, runs, bestAt }
   * 只存「最高波数 / 总轮数 / 达成时间」—— 波次进度本身不落盘
   * （中途退出即作废，这是 roguelite 的规矩），所以这里不存在「恢复本轮」的脏状态。 */
  _trialRec(v) {
    const src = this._obj(v) || {};
    return {
      best: this._int(src.best, 0, 9999, 0),
      runs: this._int(src.runs, 0, 999999, 0),
      bestAt: this._num(src.bestAt, 0)
    };
  },
  /* [S5] 异兽志归一化：{ mon: { kind: {kills, at} }, regions: { id: true } }
   * 旧档里 codex 只是个空对象，手改存档可能塞进字符串/数组，
   * 一律收敛成合法结构——图鉴面板会直接取 kills，结构不对就整页崩。 */
  _codex(v) {
    const src = this._obj(v) || {};
    const mon = {};
    const rawMon = this._obj(src.mon) || {};
    for (const k in rawMon) {
      const e = this._obj(rawMon[k]);
      if (!e) continue;
      mon[k] = { kills: this._int(e.kills, 0, 999999, 0), at: this._num(e.at, 0) };
    }
    const regions = {};
    const rawReg = this._obj(src.regions) || {};
    for (const k in rawReg) if (rawReg[k]) regions[k] = true;
    return { mon, regions };
  },
  /* [M5] 地脉钥匙：固定长度 5 的整数数组，下标 = 阶 − 1。
   * 旧档没有这个字段 → 全新 5 个 0（不是「送一把一阶」，钥匙必须打出来）。
   * 手改档塞进字符串 / 超长数组 / 负数一律收敛：keys[i] 会被 UI 直接当数字显示，
   * 出现 NaN 就是「钥匙 ×NaN」这种脏面板。 */
  _keys(v) {
    const out = [0, 0, 0, 0, 0];
    if (!Array.isArray(v)) return out;
    for (let i = 0; i < 5; i++) out[i] = this._int(v[i], 0, 99, 0);
    return out;
  },

  /* [M5] 地下城进度：{ cleared: { 'tomb1': true, … }, runs, wins }
   * cleared 的 key 是「类型 + 阶」（见 data-dungeon.js 的 dungeonCodexId），
   * 这里不校验 key 是否合法 —— 类型表以后会扩，删掉的条目也只是查不到而已。 */
  _dungeonRec(v) {
    const src = this._obj(v) || {};
    const cleared = {};
    const raw = this._obj(src.cleared) || {};
    for (const k in raw) if (raw[k]) cleared[k] = true;
    return {
      cleared,
      runs: this._int(src.runs, 0, 999999, 0),
      wins: this._int(src.wins, 0, 999999, 0)
    };
  },

  /* 难度白名单校验：认不出的值（含旧档缺失）统一回落默认档，绝不让脏值进存档 */
  _difficulty(v) {
    const def = (typeof DEFAULT_DIFF !== 'undefined') ? DEFAULT_DIFF : 'normal';
    const table = (typeof DIFFS !== 'undefined') ? DIFFS : null;
    if (!table) return def;
    return table[v] ? v : def;
  },
  _clone(v, def) {
    try { return v === undefined ? def : JSON.parse(JSON.stringify(v)); }
    catch (e) { return def; }
  },

  /* ---------------- 底层读写（全部经 Store，localStorage 不可用也能跑） ---------------- */
  _raw(n) { return Store.getKey(this.slotKey(n)); },

  _parse(text) {
    if (!text) return null;
    try {
      const d = JSON.parse(text);
      return (d && typeof d === 'object' && !Array.isArray(d)) ? d : null;
    } catch (e) { return null; }
  },

  /* localStorage 可用时读真实值；完全不可用时退回内存（内存里能读到就算成功） */
  _verifyRead(k) {
    const strict = Store.strictGet(k);
    return strict === undefined ? Store.getKey(k) : strict;
  },

  /* 只读：不修数据、不写盘 */
  peek(n) {
    n = this.validSlot(n);
    const d = this._parse(this._raw(n));
    if (!d) return null;
    /* 别写成「只认当前 SCHEMA」：那样每次升版本，存档面板都会把升级前的档显示成「空」。
     * v2 结构对上层是兼容的（字段只增不减），照常返回；整形交给 readSlot/normalizeDoc。 */
    if (typeof d.v === 'number' && d.v >= 2 && d.v <= this.SCHEMA) return d;
    return null;
  },

  /* ---------------- 数值整形 ---------------- */
  normalizeDoc(d, slot) {
    if (!d || typeof d !== 'object') return { doc: null, changed: false };
    const before = JSON.stringify(d);
    slot = this.validSlot(slot || (d.meta && d.meta.slot) || 1);

    d.v = this.SCHEMA;

    /* ---- meta ---- */
    const m = this._obj(d.meta) || (d.meta = {});
    m.slot = slot;
    m.name = String(m.name || '无名客').slice(0, 12);
    m.cls = m.cls || 'warrior';
    m.level = this._int(m.level, 1, 99, 1);
    m.playTime = this._num(m.playTime, 0);
    m.mapId = m.mapId || 'village';
    m.updatedAt = this._num(m.updatedAt, 0);
    if (!m.createdAt) m.createdAt = m.updatedAt || this._now();

    /* ---- char ---- */
    const c = this._obj(d.char) || (d.char = {});
    c.cls = c.cls || m.cls;
    c.name = String(c.name || m.name).slice(0, 12);
    c.level = this._int(c.level, 1, 99, m.level);
    c.xp = this._num(c.xp, 0);
    const xpDef = Math.max(1, Math.round(c.level * 100));
    /* [v1.10.0] xpNext 一律按当前曲线重算：老档里存的是旧曲线（1.55 次方）的值，
     * 留着会让老角色比新角色升级快一截，属于「隐性 buff」 */
    c.xpNext = (typeof xpToNext === 'function') ? xpToNext(c.level) : Math.max(1, this._num(c.xpNext, xpDef));
    c.gold = this._int(c.gold, 0, 1e12, 0);
    /* 难度 / 传送石 / 技能领悟：旧档没有时补默认值，避免 unpack 出 undefined */
    c.difficulty = this._difficulty(c.difficulty);
    c.teleportStones = this._int(c.teleportStones, 0, 9999, 0);
    if (!this._obj(c.skillFlags)) c.skillFlags = {};
    const pot = this._obj(c.potions) || {};
    c.potions = { hp: this._int(pot.hp, 0, 999, 0), mp: this._int(pot.mp, 0, 999, 0) };
    c.hp = this._num(c.hp, 1);
    c.mp = this._num(c.mp, 0);
    c.maxInv = this._int(c.maxInv, 10, 200, 40);
    c.playTime = this._num(c.playTime, m.playTime);
    c.bossKilled = this._obj(c.bossKilled) || {};
    m.level = c.level;
    m.name = c.name;
    m.cls = c.cls;
    m.playTime = c.playTime;
    m.updatedAt = m.updatedAt || this._now();

    const eq = this._obj(c.equipment) || (c.equipment = {});
    for (const k of this.equipSlots()) {
      if (!(k in eq)) eq[k] = null;
      else if (eq[k] !== null && typeof eq[k] !== 'object') eq[k] = null;
    }
    if (!Array.isArray(c.inventory)) c.inventory = [];
    c.inventory = c.inventory.filter(it => it && typeof it === 'object').slice(0, 200);

    /* ---- world ---- */
    const w = this._obj(d.world) || (d.world = {});
    w.mapId = w.mapId || m.mapId || 'village';
    m.mapId = w.mapId;
    const pos = this._obj(w.playerPos) || (w.playerPos = { x: 0, z: 6 });
    pos.x = this._num(pos.x, 0);
    pos.z = this._num(pos.z, 6);

    /* ---- M0 世界结构：卷 / 章 / 营地 / 已抵达 ----
     * 老档（schema 2）只有 mapId，这里按图反推卷与章 —— 反推不到（村内、试炼场）就落卷一第 1 章。
     * 反推而不是「一律从卷一重开」，是为了让已经在九幽地宫的老档不被降级。 */
    const pv = Number(w.part);
    w.part = (isFinite(pv) && pv >= 1 && pv <= 5) ? Math.round(pv) : 0;
    if (typeof w.act !== 'string' || !w.act) w.act = '';
    if (!w.part || !w.act) {
      const p = (typeof partOfMap === 'function') ? partOfMap(w.mapId) : null;
      const a = (typeof actOfMap === 'function') ? actOfMap(w.mapId) : null;
      if (!w.part) w.part = p || 1;
      if (!w.act) w.act = a || '1-1';
    }
    /* 章说了算：手改档里出现「卷三 / 第 1-1 章」这种不自洽的组合时，以章为准 */
    if (typeof ACTS !== 'undefined' && ACTS[w.act]) w.part = ACTS[w.act].part;
    else { w.act = '1-1'; w.part = 1; }

    w.camps = Array.isArray(w.camps)
      ? w.camps.filter(c => typeof c === 'string' && (typeof CAMPS === 'undefined' || CAMPS[c]))
      : [];
    if (!w.camps.length) w.camps = ['campA'];
    w.portals = Array.isArray(w.portals) ? w.portals.filter(p => typeof p === 'string' && p) : [];
    if (!w.portals.length) w.portals = ['portalA'];
    /* 营地 / 传送门按卷累积：抵达卷 N 说明 campA..campN、portalA..portalN 都到过。
     * M1 之前营地还没有实体地图（CAMPS[x].mapId 为空），但进度语义必须准 ——
     * 否则卷三的老档只认 campA，等 M1 做完营地会被判成「没解锁」。 */
    if (typeof PARTS !== 'undefined' && PARTS[w.part]) {
      const SEQ = ['A', 'B', 'C', 'D', 'E'];
      const upto = SEQ.indexOf(String(PARTS[w.part].camp || '').replace('camp', ''));
      for (let i = 0; i <= upto; i++) {
        const c = 'camp' + SEQ[i], p = 'portal' + SEQ[i];
        if (w.camps.indexOf(c) < 0) w.camps.push(c);
        if (w.portals.indexOf(p) < 0) w.portals.push(p);
      }
    }
    w.mapsSeen = Array.isArray(w.mapsSeen) ? w.mapsSeen.filter(m => typeof m === 'string' && m) : [];
    if (w.mapsSeen.indexOf('village') < 0) w.mapsSeen.push('village');
    if (w.mapId && w.mapsSeen.indexOf(w.mapId) < 0) w.mapsSeen.push(w.mapId);

    const q = this._obj(w.quests);
    if (!q) {
      w.quests = { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } };
    } else {
      if (!Array.isArray(q.active)) q.active = [];
      if (!Array.isArray(q.done)) q.done = [];
      const ann = this._obj(q.announced) || (q.announced = {});
      /* [M2] 悬赏板：cd 是按任务 id 记的到期时间戳，count 是完成次数 */
      const qb = this._obj(q.board) || (q.board = {});
      qb.cd = this._obj(qb.cd) || (qb.cd = {});
      qb.count = this._obj(qb.count) || (qb.count = {});
      // 未接任务时 next 指向下一个可接任务；全部做完是 null
      if (q.next === undefined) q.next = 'q1';
      q.active = q.active.filter(a => a && typeof a === 'object' && a.id).map(a => {
        a.progress = Array.isArray(a.progress) ? a.progress.map(v => this._int(v, 0, 1e6, 0)) : [];
        return a;
      });
      q.done = q.done.filter(id => typeof id === 'string');
    }

    /* ---- V2 预留分区（S1/S3/S6/S7 会往这里加东西） ---- */
    d.stash = this._obj(d.stash) || { items: [], mats: {} };
    if (!Array.isArray(d.stash.items)) d.stash.items = [];
    if (!this._obj(d.stash.mats)) d.stash.mats = {};
    d.codex = this._codex(d.codex);
    d.talents = this._obj(d.talents) || {};
    /* [M1] 任务奖励天赋点：旧档没有这个字段，缺省补 0，脏值夹到 0~40 */
    d.talentBonus = this._int(d.talentBonus, 0, 40, 0);
    /* [v1.8.5] 根基加点：四项非负整数，缺省补零（旧档按等级自动得到可分配点数） */
    d.attrAlloc = this._attrAlloc(d.attrAlloc);
    /* [试炼] 无尽试炼记录（最高波数 / 总轮数） */
    d.trial = this._trialRec(d.trial);
    /* S4 技能：等级 / 变体 / 技能条 8 格 × 2 套配置 */
    d.skills = this._obj(d.skills) || {};
    d.skillbar = this._bar(d.skillbar);
    d.skillbar2 = this._bar(d.skillbar2);
    d.barSet = (d.barSet === 1) ? 1 : 0;
    if (d.mount === undefined) d.mount = null;
    d.settings = this._obj(d.settings) || {};

    return { doc: d, changed: JSON.stringify(d) !== before };
  },

  /* ---------------- 扁平 state ⇄ V2 doc ---------------- */
  pack(flat, slot) {
    const s = flat || {};
    slot = this.validSlot(slot || (s.slot) || this.activeSlot());
    const now = this._now();
    const playTime = this._num(s.playTime, 0);
    const createdAt = this._createdAt[slot] || (now - Math.max(0, playTime) * 1000);
    this._createdAt[slot] = createdAt;

    const eq = {};
    const srcEq = this._obj(s.equipment) || {};
    for (const k of this.equipSlots()) eq[k] = srcEq[k] || null;

    return {
      v: this.SCHEMA,
      meta: {
        slot, name: String(s.name || '无名客').slice(0, 12), cls: s.cls || 'warrior',
        level: this._int(s.level, 1, 99, 1), playTime,
        mapId: s.mapId || 'village', createdAt, updatedAt: now, version: '2.0.0-s0'
      },
      char: {
        cls: s.cls || 'warrior',
        name: String(s.name || '无名客').slice(0, 12),
        level: this._int(s.level, 1, 99, 1),
        xp: this._num(s.xp, 0),
        xpNext: (typeof xpToNext === 'function') ? xpToNext(this._int(s.level, 1, 99, 1)) : Math.max(1, this._num(s.xpNext, 180)),
        gold: this._int(s.gold, 0, 1e12, 0),
        difficulty: this._difficulty(s.difficulty),
        teleportStones: this._int(s.teleportStones, 0, 9999, 0),
        skillFlags: this._obj(s.skillFlags) || {},
        potions: {
          hp: this._int((s.potions || {}).hp, 0, 999, 0),
          mp: this._int((s.potions || {}).mp, 0, 999, 0)
        },
        hp: this._num(s.hp, 1),
        mp: this._num(s.mp, 0),
        equipment: eq,
        inventory: Array.isArray(s.inventory) ? s.inventory.filter(Boolean) : [],
        maxInv: this._int(s.maxInv, 10, 200, 40),
        bossKilled: this._obj(s.bossKilled) || {},
        playTime
      },
      world: {
        mapId: s.mapId || 'village',
        playerPos: { x: this._num((s.playerPos || {}).x, 0), z: this._num((s.playerPos || {}).z, 6) },
        quests: this._obj(s.quests) || { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } },
        /* M0：卷 / 章 / 营地 / 大传送门 / 已抵达的图（具体整形在 normalizeDoc 里） */
        part: s.part,
        act: s.act,
        camps: Array.isArray(s.camps) ? s.camps.slice() : undefined,
        portals: Array.isArray(s.portals) ? s.portals.slice() : undefined,
        mapsSeen: Array.isArray(s.mapsSeen) ? s.mapsSeen.slice() : undefined
      },
      stash: this._obj(s.stash) || { items: [], mats: {} },
      /* v1.0.4 商店刷新窗口 { at, items, rolls }。
       * 存下来的意义是「刷新页面不重置 5 分钟计时、也不能白嫖一次换货」，
       * 结构不对（被手改过）时直接丢成 null，下次进货会重新生成。 */
      shop: (s.shop && Array.isArray(s.shop.items)) ? s.shop : null,
      codex: this._codex(s.codex),
      talents: this._obj(s.talents) || {},
      talentBonus: this._int(s.talentBonus, 0, 40, 0),
      attrAlloc: this._attrAlloc(s.attrAlloc),
      trial: this._trialRec(s.trial),
      /* [M5] 地脉钥匙（长度 5，下标 = 阶 − 1）+ 地下城进度 */
      keys: this._keys(s.keys),
      dungeon: this._dungeonRec(s.dungeon),
      /* S4：技能等级 / 变体 / 技能条 8 格 × 2 套（id 或 null） */
      skills: this._obj(s.skills) || {},
      skillbar: this._bar(s.skillbar),
      skillbar2: this._bar(s.skillbar2),
      barSet: (s.barSet === 1) ? 1 : 0,
      mount: s.mount === undefined ? null : s.mount,
      settings: this._obj(s.settings) || {}
    };
  },

  unpack(doc) {
    const c = doc.char || {}, w = doc.world || {};
    return {
      cls: c.cls, name: c.name, level: c.level, xp: c.xp, xpNext: c.xpNext,
      gold: c.gold, potions: c.potions, hp: c.hp, mp: c.mp,
      difficulty: c.difficulty,
      teleportStones: c.teleportStones || 0,
      skillFlags: c.skillFlags || {},
      equipment: c.equipment, inventory: c.inventory, maxInv: c.maxInv,
      bossKilled: c.bossKilled || {}, playTime: c.playTime || 0,
      quests: w.quests, mapId: w.mapId, playerPos: w.playerPos,
      /* M0：世界结构（normalizeDoc 保证这几个字段一定存在） */
      part: w.part, act: w.act,
      camps: Array.isArray(w.camps) ? w.camps.slice() : ['campA'],
      portals: Array.isArray(w.portals) ? w.portals.slice() : ['portalA'],
      mapsSeen: Array.isArray(w.mapsSeen) ? w.mapsSeen.slice() : ['village'],
      stash: doc.stash || { items: [], mats: {} },
      shop: (doc.shop && Array.isArray(doc.shop.items)) ? doc.shop : null,
      codex: this._codex(doc.codex),
      talents: doc.talents || {},
      talentBonus: this._int(doc.talentBonus, 0, 40, 0),
      attrAlloc: this._attrAlloc(doc.attrAlloc),
      trial: this._trialRec(doc.trial),
      keys: this._keys(doc.keys),
      dungeon: this._dungeonRec(doc.dungeon),
      skills: doc.skills || {},
      skillbar: this._bar(doc.skillbar),
      skillbar2: this._bar(doc.skillbar2),
      barSet: (doc.barSet === 1) ? 1 : 0,
      mount: doc.mount === undefined ? null : doc.mount,
      settings: doc.settings || {}
    };
  },

  /* ---------------- 迁移器 v1 → v2 ---------------- */
  /*
   * V1 存档是 Game.state 直接 JSON.stringify 出来的扁平对象：
   *   { cls, name, level, xp, xpNext, gold, potions, hp, mp, equipment,
   *     inventory, maxInv, quests, mapId, playerPos, bossKilled, playTime }
   * 迁移只做「换个位置放」，任何数值都不重新计算。
   */
  migrate(v1, slot) {
    slot = this.validSlot(slot || 1);
    const s = (typeof v1 === 'string') ? this._parse(v1) : v1;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;

    // 已经是 v2 就直接整形返回（导入时可能拿到 v2 doc）
    if (this._isDoc(s.v) && this._obj(s.char)) {
      return this.normalizeDoc(s, slot).doc;
    }
    // 认不出格式
    if (!s.cls || !s.level) return null;

    delete this._createdAt[slot];
    const doc = this.pack(s, slot);
    doc.meta.migratedFrom = 1;
    doc.meta.migratedAt = this._now();
    doc.meta.createdAt = this._now() - Math.max(0, this._num(s.playTime, 0)) * 1000;
    this._createdAt[slot] = doc.meta.createdAt;
    return this.normalizeDoc(doc, slot).doc;
  },

  /* ---------------- 读 ---------------- */
  readSlot(n, opts) {
    n = this.validSlot(n);
    opts = opts || {};
    const raw = this._parse(this._raw(n));
    if (!raw) return null;

    // 角色位上若是旧格式（不应该发生，兜一手）
    let doc;
    if (this._isDoc(raw.v) && this._obj(raw.char)) {
      doc = this.normalizeDoc(raw, n);
    } else if (raw.cls) {
      const mig = this.migrate(raw, n);
      if (!mig) return null;
      doc = { doc: mig, changed: true };
    } else {
      return null;
    }
    if (!doc.doc) return null;
    this._createdAt[n] = doc.doc.meta.createdAt;
    if (doc.changed && opts.repair !== false) this.writeSlot(n, doc.doc);
    return doc.doc;
  },

  load(slot) {
    const n = this.validSlot(slot || this.activeSlot());
    const doc = this.readSlot(n);
    if (!doc) return null;
    this.setActiveSlot(n);
    const flat = this.unpack(doc);
    this.bumpUid(flat);
    return flat;
  },

  /* 导入/读档后把 ITEM_UID 推到已用最大值之后，避免新旧物品 uid 撞车 */
  bumpUid(flat) {
    try {
      if (!flat) return;
      let max = 0;
      const scan = it => { if (it && typeof it.uid === 'number' && it.uid > max) max = it.uid; };
      (flat.inventory || []).forEach(scan);
      const eq = flat.equipment || {};
      for (const k in eq) scan(eq[k]);
      if (max > 0 && typeof ITEM_UID !== 'undefined' && ITEM_UID <= max) ITEM_UID = max + 1;
    } catch (e) { }
  },

  /* ---------------- 写（原子） ---------------- */
  writeSlot(n, doc) {
    n = this.validSlot(n);
    const key = this.slotKey(n);
    const tmp = key + '.tmp';
    let text;
    try { text = JSON.stringify(doc); }
    catch (e) { this.lastError = '序列化失败：' + (e && e.message); return false; }
    if (!text || text.length < 32) { this.lastError = '序列化结果异常'; return false; }

    // 1) 先写临时键
    Store.setKey(tmp, text);
    // 2) 回读校验（存储空间不足 / 隐私模式在这一步就能发现）
    const back = this._verifyRead(tmp);
    if (back !== text) {
      this.lastError = '临时键回读不一致（可能是存储空间不足）';
      Store.delKey(tmp);
      return false;
    }
    if (!this._parse(back)) {
      this.lastError = '临时键内容无法解析';
      Store.delKey(tmp);
      return false;
    }
    // 3) 原子替换正式键：这一行是唯一改动「正式档」的动作，
    //    即使在此刻断电，也只会是「旧档完整」或「新档完整」
    Store.setKey(key, text);
    const fin = this._verifyRead(key);
    if (fin !== text) {
      this.lastError = '正式键写入后回读不一致';
      Store.delKey(tmp);
      return false;
    }
    // 4) 清理临时键
    Store.delKey(tmp);
    this._createdAt[n] = (doc.meta && doc.meta.createdAt) || this._createdAt[n] || this._now();
    return true;
  },

  save(flat, slot) {
    if (!flat) return false;
    const n = this.validSlot(slot || this.activeSlot());
    const doc = this.pack(flat, n);
    if (!this.writeSlot(n, doc)) { console.warn('[存档] 写入失败：' + this.lastError); return false; }
    this.setActiveSlot(n);
    this.lastSavedAt = doc.meta.updatedAt;
    return true;
  },

  /* ---------------- 角色位管理 ---------------- */
  activeSlot() {
    const v = this._int(Store.getKey(this.ACTIVE_KEY), 1, this.SLOT_COUNT, 1);
    return v;
  },
  setActiveSlot(n) {
    const v = this.validSlot(n);
    Store.setKey(this.ACTIVE_KEY, String(v));
    return v;
  },

  listSlots() {
    const out = [];
    for (let i = 1; i <= this.SLOT_COUNT; i++) {
      const doc = this.readSlot(i);
      out.push({
        slot: i,
        empty: !doc,
        meta: doc ? doc.meta : null,
        clsName: doc ? ((typeof CLASSES !== 'undefined' && CLASSES[doc.meta.cls]) ? CLASSES[doc.meta.cls].name : doc.meta.cls) : '',
        gold: doc ? doc.char.gold : 0,
        invCount: doc ? doc.char.inventory.length : 0
      });
    }
    return out;
  },

  hasAny() {
    for (let i = 1; i <= this.SLOT_COUNT; i++) if (this.peek(i)) return true;
    return false;
  },

  legacyPresent() { return !!Store.getKey(this.LEGACY_KEY); },
  backupPresent() { return !!Store.getKey(this.BACKUP_KEY); },

  /* 新建角色：slot 不传则找第一个空位 */
  createCharacter(cls, name, slot) {
    let n = slot ? this.validSlot(slot) : 0;
    if (!n) {
      for (let i = 1; i <= this.SLOT_COUNT; i++) { if (!this.peek(i)) { n = i; break; } }
    }
    if (!n) return { ok: false, error: `${this.SLOT_COUNT} 个角色位都满了，先删除一个再建。` };
    if (slot && this.peek(n)) {
      // 明确指定了已有角色的位：当作覆盖，但仍然先备份旧档
      const old = this._raw(n);
      if (old) Store.setKey(this.slotKey(n) + '.bak', old);
    }

    let flat = null;
    try {
      if (typeof Game !== 'undefined' && Game.newState) flat = Game.newState(cls, name);
    } catch (e) { }
    if (!flat) flat = this._fallbackState(cls, name);

    delete this._createdAt[n];
    const doc = this.pack(flat, n);
    doc.meta.createdAt = this._now();
    doc.meta.updatedAt = doc.meta.createdAt;
    this._createdAt[n] = doc.meta.createdAt;
    if (!this.writeSlot(n, doc)) return { ok: false, error: this.lastError || '写入失败' };
    this.setActiveSlot(n);
    return { ok: true, slot: n, doc };
  },

  /* 兜底的新档模板（Game 尚未就绪时用，字段与 Game.newState 一致） */
  _fallbackState(cls, name) {
    const eq = (typeof makeStarterSet === 'function') ? makeStarterSet(cls) : { chest: null, weapon: null };
    return {
      cls, name, level: 1, xp: 0, xpNext: (typeof xpToNext === 'function' ? xpToNext(1) : 180), gold: 120,
      difficulty: (typeof DEFAULT_DIFF !== 'undefined') ? DEFAULT_DIFF : 'normal',
      potions: { hp: 4, mp: 3 }, teleportStones: 0, hp: 100, mp: 50,
      equipment: { helm: null, chest: eq.chest, shoulders: null, cloak: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, weapon: eq.weapon, offhand: null, relic: null, fate: null },
      inventory: [], maxInv: 40,
      quests: { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } },
      mapId: 'village', playerPos: { x: 0, z: 10 },
      /* [M0] 世界结构（新档默认停在卷一第 1 章，只到过桃源村） */
      part: 1, act: '1-1', camps: ['campA'], portals: ['portalA'], mapsSeen: ['village'],
      bossKilled: {}, playTime: 0
    };
  },

  deleteSlot(n) {
    n = this.validSlot(n);
    Store.delKey(this.slotKey(n));
    Store.delKey(this.slotKey(n) + '.tmp');
    Store.delKey(this.slotKey(n) + '.bak');
    delete this._createdAt[n];
    if (this.activeSlot() === n) {
      const rest = this.listSlots().filter(s => !s.empty);
      this.setActiveSlot(rest.length ? rest[0].slot : 1);
    }
    return !this.peek(n);
  },

  /* ---------------- 导出 / 导入 ---------------- */
  exportText(slot) {
    const n = this.validSlot(slot || this.activeSlot());
    const doc = this.readSlot(n);
    if (!doc) return '';
    const out = JSON.parse(JSON.stringify(doc));
    out.meta.exportedAt = this._now();
    out.meta.exportedBy = 'jiuxiao-v2-s0';
    return JSON.stringify(out, null, 2);
  },

  exportFileName(slot) {
    const n = this.validSlot(slot || this.activeSlot());
    const doc = this.readSlot(n);
    const name = doc && doc.meta ? doc.meta.name : '角色';
    const d = new Date();
    const p = x => String(x).padStart(2, '0');
    return `jiuxiao-s${n}-${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  },

  exportFile(slot) {
    const text = this.exportText(slot);
    if (!text) return { ok: false, error: '该角色位没有存档' };
    try {
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.exportFileName(slot);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1200);
      return { ok: true, size: text.length, name: a.download };
    } catch (e) {
      return { ok: false, error: '导出失败：' + (e && e.message) };
    }
  },

  validate(doc) {
    const errs = [];
    if (!doc || typeof doc !== 'object') return ['存档不是对象'];
    if (doc.v !== this.SCHEMA) errs.push('schemaVersion 不是 ' + this.SCHEMA);
    const c = this._obj(doc.char), w = this._obj(doc.world);
    if (!c) errs.push('缺少 char 段');
    if (!w) errs.push('缺少 world 段');
    if (c) {
      if (typeof c.cls !== 'string') errs.push('职业字段非法');
      else {
        try { if (typeof CLASSES !== 'undefined' && !CLASSES[c.cls]) errs.push('未知职业：' + c.cls); } catch (e) { }
      }
      if (!(c.level >= 1 && c.level <= 99)) errs.push('等级超出范围');
      if (!(c.gold >= 0)) errs.push('金币为负');
      if (!Array.isArray(c.inventory)) errs.push('背包不是数组');
      else if (c.inventory.length > 200) errs.push('背包物品数量异常（>200）');
    }
    if (w) {
      if (!this._obj(w.quests)) errs.push('任务进度缺失');
      if (!w.mapId) errs.push('地图缺失');
    }
    return errs;
  },

  /* 接受三种输入：v2 doc / v1 扁平档 / 带一层 save 包裹的 */
  importText(text, slot) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return { ok: false, error: '内容为空' };
    const obj = this._parse(raw);
    if (!obj) return { ok: false, error: '不是合法的 JSON 文本' };

    let doc = null;
    let from = 0;
    if (this._isDoc(obj.v) && this._obj(obj.char)) {
      doc = this.normalizeDoc(obj, slot).doc;
      from = 2;
    } else if (obj.cls) {
      doc = this.migrate(obj, slot);        // 允许直接吃 V1 单档
      from = 1;
    } else if (this._obj(obj.save) && this._isDoc(obj.save.v)) {
      doc = this.normalizeDoc(obj.save, slot).doc;
      from = 2;
    } else {
      return { ok: false, error: '无法识别的存档格式（需要 v2 或旧版单档）' };
    }
    if (!doc) return { ok: false, error: '存档解析失败' };

    const errs = this.validate(doc);
    if (errs.length) return { ok: false, error: '存档校验失败：' + errs[0] };

    const target = this.validSlot(slot || this.activeSlot());
    doc.meta.slot = target;
    doc.meta.updatedAt = this._now();
    // 导入到已有角色的位：先留一份旧档，避免手滑丢档
    const old = this._raw(target);
    if (old && this.peek(target)) Store.setKey(this.slotKey(target) + '.bak', old);

    if (!this.writeSlot(target, doc)) return { ok: false, error: this.lastError || '写入失败' };
    this.setActiveSlot(target);
    return { ok: true, slot: target, doc, fromV1: from === 1 };
  },

  importFile(file, slot) {
    return new Promise(resolve => {
      try {
        const fr = new FileReader();
        fr.onload = () => resolve(this.importText(fr.result, slot));
        fr.onerror = () => resolve({ ok: false, error: '读取文件失败' });
        fr.readAsText(file, 'utf-8');
      } catch (e) {
        resolve({ ok: false, error: '读取文件失败：' + (e && e.message) });
      }
    });
  },

  /* ---------------- 启动：老档自动迁移 ---------------- */
  init() {
    if (this.initDone) return this;
    this.initDone = true;
    try {
      const legacy = Store.getKey(this.LEGACY_KEY);
      if (legacy) {
        // 1) 先备份：只写一次，且不会用坏内容覆盖好备份
        const bak = Store.getKey(this.BACKUP_KEY);
        if (!bak || !this._parse(bak)) Store.setKey(this.BACKUP_KEY, legacy);

        // 2) 角色位 1 还空着 → 迁移
        if (!this.peek(1)) {
          const doc = this.migrate(legacy, 1);
          if (doc && this.writeSlot(1, doc)) {
            this.migrated = true;
            Store.setKey(this.MIGRATED_KEY, String(this._now()));
            this.setActiveSlot(1);
            console.log('[存档] V1 旧档已升级为角色位 1（备份：' + this.BACKUP_KEY + '）');
          } else {
            this.lastError = '旧档迁移失败：' + (this.lastError || '格式无法识别');
            console.warn('[存档] ' + this.lastError + '；旧档原样保留在 ' + this.LEGACY_KEY);
          }
        }
      }
    } catch (e) {
      this.lastError = '迁移异常：' + (e && e.message);
      console.warn('[存档] ' + this.lastError);
    }

    // 当前角色位修正
    try {
      const a = this.activeSlot();
      if (!this.peek(a)) {
        const first = this.listSlots().filter(s => !s.empty)[0];
        this.setActiveSlot(first ? first.slot : 1);
      }
    } catch (e) { }

    return this;
  }
};

/* 供调试台/回归脚本使用：对比两个扁平 state 的关键字段是否一致 */
function saveStateFingerprint(s) {
  if (!s) return null;
  const inv = Array.isArray(s.inventory) ? s.inventory : [];
  const eq = s.equipment || {};
  const itemSig = it => {
    if (!it) return '-';
    const nm = it.baseName || (it.base && it.base.name) || '';
    const af = Array.isArray(it.affixes) ? it.affixes.length : 0;
    return [it.slot || '', it.rarity || '', nm, it.ilvl || 0, af, it.setId || '', it.baseDmg ? it.baseDmg.join('/') : '', it.baseArmor || ''].join('~');
  };
  /* 槽位顺序固定走 equipSlots()：旧档只有 12 格、新档 14 格，
   * 若按 Object.keys(eq) 取，迁移前后的指纹必然对不上（会误报「存档丢装备」）。 */
  const slots = (typeof SaveManager !== 'undefined' && SaveManager.equipSlots)
    ? SaveManager.equipSlots() : Object.keys(eq);
  const eqSig = slots.map(k => k + '=' + itemSig(eq[k])).join('|');
  const invSig = inv.map(itemSig).join('|');
  const q = s.quests || {};
  return {
    cls: s.cls, level: s.level, gold: s.gold, xp: s.xp,
    hp: Math.round(s.hp || 0), mp: Math.round(s.mp || 0),
    mapId: s.mapId, playTime: Math.round(s.playTime || 0),
    invCount: inv.length, eqSig, invSig,
    questActive: JSON.stringify((q.active || []).map(a => [a.id, a.progress])),
    questDone: JSON.stringify(q.done || []), questNext: q.next
  };
}
