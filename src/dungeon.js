/* ============================================================
 * 地下城 · 运行时（M5）
 * ------------------------------------------------------------
 * 状态机：
 *   营地里跟「地脉守」说话
 *     → 选类型（5 类） → 选阶（手里的钥匙） → 词缀预告
 *     → 扣钥匙 → 第 1 层（入口厅，清 70% 开地脉门）
 *     → 第 2 层（主厅，清 80% 开地脉门）
 *     → 第 3 层（首领场，只有首领 + 2 名精英护卫）
 *     → 结算（装备 / 玄晶 / 符文 / 35% 次阶钥匙 / 图鉴）
 *
 * 与试炼（trial.js）的关系：**不共用状态机**（§8.5），只借鉴做法。
 * 三条沿用自试炼的既有经验：
 *   1. **不暂停游戏循环**。面板盖上来就够了，别在 update 里加 early-return。
 *   2. **首领血量以同阶小怪为锚**（`avgHp × 14`），不写死绝对值 ——
 *      同一个守卫要在 5 个阶里出现，写死了没法跟阶走。
 *   3. **死亡回营地而不是本图**：本图的 mapId 是运行时注册的，
 *      下次开机根本不存在，留在那儿会读档进空图（loadSlot 有兜底，但体验是坏的）。
 *
 * 为什么「层」是独立小图而不是一张图的三个区：
 *   每层要自己的骨架（入口岔路 / 主厅侧室 / 首领场），而一张图只能有一种骨架；
 *   层间走地脉门 = 一次 re-loadMap（约 120ms），跟试炼换波次一个量级。
 * ============================================================ */

/* 每类地下城的氛围参数：按地貌取，比野外图暗一档 —— 地下城本来就该更暗更闷。
 * props 沿用世界图的道具分支（bone / mine / swamp / flood / void）。 */
const DUNGEON_ATMOS = {
  bone: { sky: 0x1e1c22, fog: 0x2a2730, fogNear: 42, fogFar: 150, ambient: 0x8a8070, sun: 0xb0a080, sunI: 0.55, props: 'bone' },
  rock: { sky: 0x2e2a24, fog: 0x3a3428, fogNear: 48, fogFar: 160, ambient: 0x9a8a70, sun: 0xffa050, sunI: 0.70, props: 'mine' },
  swamp: { sky: 0x2a2a28, fog: 0x3a3028, fogNear: 38, fogFar: 122, ambient: 0x8a7a60, sun: 0xffb060, sunI: 0.70, props: 'swamp' },
  flood: { sky: 0x2a2a38, fog: 0x343040, fogNear: 44, fogFar: 155, ambient: 0x9a9090, sun: 0xd8c090, sunI: 0.70, props: 'flood' },
  void: { sky: 0x14101c, fog: 0x1a1426, fogNear: 40, fogFar: 150, ambient: 0x6a5a80, sun: 0x9a80c0, sunI: 0.60, props: 'void' }
};

/* 地下城图 id：`dgn` + 类型 + 层，运行时注册进 MAPS / MAP_ZONES。
 * 用固定 id 而不是随机，是为了「同一类同一层」复用同一份 zone 缓存
 * （zonesOfMap 有 _builtZones 缓存，重复进同一层不会再展开坐标）。 */
function dungeonMapId(tid, layer) { return 'dgn_' + tid + '_' + layer; }

const Dungeon = {
  run: null,
  _t: 0,

  get active() { return !!this.run; },

  /* ---------------- 存档 ---------------- */
  /* keys 是长度 5 的数组，下标 = 阶 - 1。 */
  keys() {
    const s = Game.state;
    if (!s) return [0, 0, 0, 0, 0];
    if (!Array.isArray(s.keys) || s.keys.length !== 5) s.keys = [0, 0, 0, 0, 0];
    return s.keys;
  },
  keyCount(tier) { return this.keys()[Math.max(0, Math.min(4, (tier || 1) - 1))] || 0; },
  /* 唯一加钥匙入口。QuestSys.turnIn 与 dropLoot 都走这里 —— 别在别处直接改数组。 */
  addKey(tier, n) {
    const i = Math.max(0, Math.min(4, (tier || 1) - 1));
    const k = this.keys();
    const before = k[i] || 0;
    k[i] = Math.min(99, before + (n || 1));
    if (k[i] > before) {
      const def = keyTierDef(tier);
      UI.log('获得【' + def.name + '】×' + (k[i] - before), 'good');
      UI.toast(def.name + ' ×' + (k[i] - before), 'lv');
      if (typeof SFX !== 'undefined' && SFX.pickup) SFX.pickup();
    }
    return k[i];
  },
  spendKey(tier) {
    const i = Math.max(0, Math.min(4, (tier || 1) - 1));
    const k = this.keys();
    if ((k[i] || 0) <= 0) return false;
    k[i]--;
    return true;
  },
  dungeonState() {
    const s = Game.state;
    if (!s) return { cleared: {}, runs: 0, wins: 0 };
    if (!s.dungeon || typeof s.dungeon !== 'object') s.dungeon = { cleared: {}, runs: 0, wins: 0 };
    const d = s.dungeon;
    if (!d.cleared || typeof d.cleared !== 'object') d.cleared = {};
    if (typeof d.runs !== 'number') d.runs = 0;
    if (typeof d.wins !== 'number') d.wins = 0;
    return d;
  },

  /* ---------------- 入口：地脉裂隙 ---------------- */
  /* 用对话而不是新面板（和悬赏板同一条理由）：手机上少一个面板就少一处溢出风险，
   * 而且「走过去、跟守门人说话、把钥匙递进去」这条动线本身就在讲设定。 */
  openRift() {
    const s = Game.state;
    if (!s) return;
    if (this.run) return;
    const k = this.keys();
    const have = KEY_TIERS.filter(t => (k[t.tier - 1] || 0) > 0);
    if (!have.length) {
      UI.showDialog('地脉守', '你手里没有钥匙。\n\n地脉的钥匙出在本卷的妖物身上 —— 小怪偶有，精英常见，首领必掉一把。\n货郎那儿也有得卖，只是贵。', [
        { label: '知道了', primary: true, action: () => UI.closeAll() }
      ]);
      return;
    }
    /* 第一步：选阶（手里的钥匙）。一阶对一卷，所以阶就是卷。 */
    const btns = have.map(t => ({
      label: `${t.name} ×${k[t.tier - 1]}　（卷${t.part} · ${t.lvFrom}~${t.lvTo} 级）`,
      action: () => { UI.closeAll(); this.pickType(t.tier); }
    }));
    btns.push({ label: '离开', action: () => UI.closeAll() });
    UI.showDialog('地脉守', '钥匙在手，门就开一半。\n\n往哪一道地缝里走？', btns);
  },

  /* 第二步：选类型（钥匙不带类型，门口自选 —— §8.1） */
  pickType(tier) {
    const t = keyTierDef(tier);
    const btns = DUNGEON_TYPES.map(d => ({
      label: `${d.name}　${d.subtitle}`,
      action: () => { UI.closeAll(); this.preview(d.id, tier); }
    }));
    btns.push({ label: '换一把钥匙', action: () => { UI.closeAll(); this.openRift(); } });
    UI.showDialog(t.name, '五道地缝，各有各的死法。\n\n' + DUNGEON_TYPES.map(d => '· ' + d.name + '：' + d.mechanic.desc).join('\n'), btns);
  },

  /* 第三步：词缀预告 + 确认。
   * 词缀在**进门时**就抽定并告知（§8.3）——「这把不打了，换一把」是刷子游戏的乐趣。
   * 代价是钥匙已经扣了，所以抽完先给一次拒绝的机会：取消则不扣钥匙。 */
  preview(tid, tier) {
    const type = dungeonTypeById(tid);
    if (!type) return;
    if (this.keyCount(tier) <= 0) { UI.log('钥匙不够了。', 'bad'); return; }
    const affixes = rollDungeonAffixes(tier, dungeonAffixCount(tier));
    const lines = [
      `【${type.name} · ${keyTierDef(tier).name}】`,
      type.hint,
      '',
      '本次词缀：' + (affixes.length ? affixes.map(a => a.name).join(' · ') : '无（一阶门不设词缀）'),
      ...affixes.map(a => '· ' + a.name + '：' + a.desc)
    ];
    UI.showDialog('地脉守', lines.join('\n'), [
      { label: '推门进去', primary: true, action: () => { UI.closeAll(); this.enter(tid, tier, affixes); } },
      { label: '再想想', action: () => UI.closeAll() }
    ]);
  },

  /* ---------------- 进入 ---------------- */
  enter(tid, tier, affixes) {
    const s = Game.state;
    if (!s || this.run || Game.dead) return false;
    if (!this.spendKey(tier)) { UI.log('钥匙不够了。', 'bad'); return false; }
    const type = dungeonTypeById(tid);
    const d = this.dungeonState();
    d.runs++;
    this.run = {
      tid, tier, type,
      lv: dungeonMobLevel(s.level, tier),
      affixes: affixes || [],
      layer: 0, kills: 0, total: 0, bossDown: false,
      items: 0, gold: 0, crystals: 0,
      startedAt: Date.now(),
      back: campMapOfPart(s.part) || 'campA',
      ramp: 0, teleT: 0
    };
    this._t = 0;
    UI.closeAll();
    UI.log('【' + type.name + '】地脉开启 —— ' + keyTierDef(tier).name + '。', 'good');
    if (typeof SFX !== 'undefined' && SFX.boss) SFX.boss();
    this.loadLayer(1);
    return true;
  },

  /* 建一层并进去。
   * 这里直接写 MAPS / MAP_ZONES（和 MAP_SPECS 展开出来的结构完全一致），
   * 上层（world.js / ui-minimap.js / spawnEnemies）不需要知道这是运行时图。 */
  loadLayer(no) {
    const r = this.run;
    if (!r) return;
    const layer = DUNGEON_LAYERS[no - 1];
    if (!layer) return;
    r.layer = no;
    const id = dungeonMapId(r.tid, no);
    const at = DUNGEON_ATMOS[r.type.ground] || DUNGEON_ATMOS.bone;

    MAPS[id] = {
      id, name: r.type.name + ' · ' + layer.name,
      safe: false, level: r.lv, dungeon: true,
      ground: r.type.ground, props: at.props,
      sky: at.sky, fog: at.fog, fogNear: at.fogNear, fogFar: at.fogFar,
      ambient: at.ambient, sun: at.sun, sunI: at.sunI,
      size: layer.size,
      /* 图级 spawns 给 zonePickKind 兜底用；真正的分配在 MAP_ZONES 里 */
      spawns: r.type.kinds.slice(), spawnCount: layer.total,
      bosses: [], portal: { x: 0, z: layer.size * 0.42 }, unlock: 1
    };
    /* 词缀「幽闭」：雾距 −35%（地图级，进图前写进 cfg 最省事） */
    if (this.hasAffix('claustro')) {
      MAPS[id].fogFar = Math.round(MAPS[id].fogFar * 0.65);
      MAPS[id].fogNear = Math.round(MAPS[id].fogNear * 0.65);
    }

    /* zone 用骨架展开，刷怪总数写死（不走 suggestSpawnTotal：那个下限 40 只，
     * 是世界图口径，地下城走廊推进 20 只就到顶）。 */
    const built = (typeof buildZones === 'function')
      ? buildZones(id, { archetype: r.type.arch, size: layer.size, spawnTotal: layer.total, kinds: r.type.kinds })
      : null;
    if (built) MAP_ZONES[id] = built;

    Game.loadMap(id);
    /* loadMap 之后才有敌人，词缀要在这时候乘到活怪身上 */
    this.applyMobAffixes();
    r.kills = 0;
    r.bossDown = false;
    r.total = (no >= DUNGEON_LAYERS.length) ? 1 : (typeof zoneSpawnTotal === 'function' ? zoneSpawnTotal(id) : layer.total);
    if (no >= DUNGEON_LAYERS.length) this.spawnBoss();
    this.renderHud(true);
    UI.toast(r.type.name + ' · 第 ' + no + ' 层', 'lv');
  },

  /* 词缀的「怪物侧」效果：一次性乘到已生成的怪身上。
   * 为什么不在 spawnEnemy 里做：那份代码是世界图的公用路径，
   * 为了地下城改它会把词缀状态带进野外（一个怪身上挂着「血怒」很怪）。 */
  applyMobAffixes() {
    const r = this.run;
    if (!r) return;
    const hpMul = this.affixMob('hpMul');
    const spdMul = this.affixMob('spdMul');
    const aspdMul = this.affixMob('aspdMul');
    const armorMul = this.affixMob('armorMul');
    for (const e of Game.enemies) {
      if (e.dead) continue;
      if (hpMul !== 1) { e.maxHp = Math.round(e.maxHp * hpMul); e.hp = e.maxHp; }
      if (spdMul !== 1) e.spd *= spdMul;
      /* 攻速 = 冷却的倒数：+25% 攻速 = atkCd / 1.25 */
      if (aspdMul !== 1) e.atkCd = Math.max(0.35, e.atkCd / aspdMul);
      if (armorMul !== 1) e.armorMul = armorMul;
    }
    /* 「回响」：精英出现率 ×2.5。已经在 spawnEnemy 里定死的没法事后升格，
     * 改成额外补几只精英（数量按 ×2.5 的口径折算）。
     * 本层没有杂兵时（首领场）不补 —— 那里只该有守卫和 2 名护卫。 */
    const eliteMul = this.affixMob('eliteMul');
    if (eliteMul > 1 && !this.hasAffix('treasure') && Game.enemies.length) {
      const extra = Math.max(1, Math.round(Game.enemies.length * 0.10));
      const zs = (typeof zoneSpawners === 'function') ? zoneSpawners(Game.state.mapId) : [];
      for (let i = 0; i < extra && zs.length; i++) {
        const z = zs[i % zs.length];
        const kinds = (z.spawns && z.spawns.kinds) || r.type.kinds;
        const p = (typeof randomPointInZone === 'function') ? randomPointInZone(z, 3) : null;
        if (!p) continue;
        const e = Game.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], p.x, p.z, true, r.lv);
        if (e && armorMul !== 1) e.armorMul = armorMul;
      }
    }
  },

  hasAffix(id) { return !!(this.run && this.run.affixes.some(a => a.id === id)); },
  affixMob(key) {
    let m = 1;
    if (!this.run) return m;
    for (const a of this.run.affixes) if (a.mob && a.mob[key] !== undefined) m *= a.mob[key];
    return m;
  },

  /* 第 3 层：首领 + 2 名精英护卫。
   * 血量/伤害按「同阶小怪均值」反解 —— 见 trial.js 的同类做法。
   * 均血从**本层的怪池**估（不真的先刷 20 只再杀），口径是
   * 「同阶同族的怪在 spawnEnemy 里会得到多少血」，所以直接算公式。 */
  spawnBoss() {
    const r = this.run;
    if (!r) return;
    const id = Game.state.mapId;
    const zs = (typeof mapZones === 'function') ? mapZones(id) : null;
    let zone = null;
    if (zs) for (const z of zs) if (z.kind === 'boss') { zone = z; break; }
    const cx = zone ? zone.x : 0;
    const cz = zone ? zone.z : 0;

    /* 均值：用同类怪的 base hp / atk 过一遍与 spawnEnemy 相同的成长公式 */
    const MB = (typeof BALANCE !== 'undefined' && BALANCE.mob) ? BALANCE.mob : { hpBase: 1, hpLv: 0.55, hpLv2: 0.010 };
    const BB = (typeof BALANCE !== 'undefined' && BALANCE.boss) ? BALANCE.boss : { hpMul: 4.5, dmgLv: 0.28 };
    const lv = r.lv;
    let hpSum = 0, atkSum = 0, n = 0;
    for (const k of r.type.kinds) {
      const m = MONSTERS[k];
      if (!m) continue;
      hpSum += m.hp * ((MB.hpBase || 1) + lv * MB.hpLv + lv * lv * MB.hpLv2);
      atkSum += (m.atk || 10) * (1 + lv * (MB.dmgLv || 0.12));
      n++;
    }
    const avgHp = n ? hpSum / n : 200;
    const avgAtk = n ? atkSum / n : 30;

    const b = Game.spawnEnemy(r.type.kinds[0], cx, cz, false, lv, r.type.boss);
    if (b) {
      /* 14 倍同阶均血（§8.2）、3.2 倍均攻 —— 覆盖 spawnEnemy 按恒 4.5 算出来的值。
       * 这是唯一一处改 spawnEnemy 结果的合法场景：它算不出「跨 5 个阶」的血量。 */
      b.maxHp = Math.max(1, Math.round(avgHp * 14));
      b.hp = b.maxHp;
      b.dmg = avgAtk * 3.2;
      b.dungeonBoss = true;
      if (this.affixMob('hpMul') !== 1) { b.maxHp = Math.round(b.maxHp * this.affixMob('hpMul')); b.hp = b.maxHp; }
      if (this.affixMob('spdMul') !== 1) b.spd *= this.affixMob('spdMul');
      if (this.affixMob('armorMul') !== 1) b.armorMul = this.affixMob('armorMul');
      UI.log('【' + r.type.bossName + '】挡在出口。', 'bad');
      UI.toast(r.type.bossName, 'bad');
      if (typeof SFX !== 'undefined' && SFX.boss) SFX.boss();
    }
    /* 2 名精英护卫 */
    for (let i = 0; i < 2; i++) {
      const ang = Math.PI * (0.25 + i * 0.5);
      const kind = r.type.kinds[Math.floor(Math.random() * r.type.kinds.length)];
      const e = Game.spawnEnemy(kind, cx + Math.cos(ang) * 7, cz + Math.sin(ang) * 7, true, lv);
      if (e && this.affixMob('armorMul') !== 1) e.armorMul = this.affixMob('armorMul');
    }
  },

  /* ---------------- 战斗钩子 ---------------- */
  /* 每杀一只：计数 + 「献祭」叠伤 */
  onKill(e) {
    const r = this.run;
    if (!r) return;
    if (e && e.boss) return;
    r.kills++;
    if (this.hasAffix('sacrifice')) {
      r.ramp = Math.min(60, r.ramp + 2);
      const mul = 1 + r.ramp / 100;
      for (const o of Game.enemies) {
        if (o.dead || o.boss) continue;
        /* baseDmg 只在第一次记下来 —— 直接在 o.dmg 上反复乘会指数叠（2% 叠成 60 次幂） */
        if (!o.baseDmg) o.baseDmg = o.dmg;
        o.dmg = o.baseDmg * mul;
      }
    }
    this.renderHud();
    this.checkClear();
  },

  /* 首领倒了 = 通关 */
  onBossDown() {
    const r = this.run;
    if (!r) return;
    r.bossDown = true;
    this.finish(true, 'clear');
  },

  /* 清怪进度：达到本层阈值就开地脉门 */
  progress() {
    const r = this.run;
    if (!r) return { kills: 0, total: 0, pct: 0, need: 0, open: false };
    const layer = DUNGEON_LAYERS[r.layer - 1] || DUNGEON_LAYERS[0];
    const total = Math.max(1, r.total);
    const pct = Math.min(1, r.kills / total);
    return { kills: r.kills, total: r.total, pct, need: layer.need, open: pct >= layer.need - 1e-6, layer };
  },

  checkClear() {
    const r = this.run;
    if (!r) return;
    const p = this.progress();
    if (!p.open || r._gateOpen) return;
    r._gateOpen = true;
    if (r.layer >= DUNGEON_LAYERS.length) return;
    UI.toast('地脉门已开', 'lv');
    UI.log('本层清到 ' + Math.round(p.pct * 100) + '%，地脉门浮出地面。', 'good');
    this.renderHud();
  },

  /* 走地脉门（由 Game.interact 的 portal 分支调用） */
  usePortal() {
    const r = this.run;
    if (!r) return;
    if (r.layer >= DUNGEON_LAYERS.length) { this.quit(); return; }
    const p = this.progress();
    if (!p.open) {
      UI.toast('地脉门还封着（' + Math.round(p.pct * 100) + '% / ' + Math.round(p.need * 100) + '%）', 'bad');
      UI.log('门上有禁制：清掉本层 ' + Math.round(p.need * 100) + '% 的妖物才开。', 'bad');
      return;
    }
    r._gateOpen = false;
    this.loadLayer(r.layer + 1);
  },

  /* ---------------- 收尾 ---------------- */
  finish(win, reason) {
    const r = this.run;
    if (!r) return null;
    const s = Game.state;
    let lines = [];
    if (win) {
      const d = this.dungeonState();
      const cid = dungeonCodexId(r.tid, r.tier);
      const first = !d.cleared[cid];
      d.cleared[cid] = true;
      d.wins++;
      /* 保底装备：ilvl = 该卷等级段中位 + 阶 × 2（§8.4） */
      const kt = keyTierDef(r.tier);
      const ilvl = Math.round((kt.lvFrom + kt.lvTo) / 2) + r.tier * 2;
      const loot = this.grantLoot(ilvl, true);
      r.items += loot.items; r.crystals += loot.crystals; r.gold += loot.gold;
      /* 35% 掉次阶钥匙（爬塔动力，与野外首领 8% 是两条独立线） */
      let nextKey = 0;
      if (r.tier < KEY_TIERS.length && CHANCE(0.35)) nextKey = r.tier + 1;
      if (nextKey) this.addKey(nextKey, 1);
      lines.push('地脉归于寂静。');
      lines.push('');
      lines.push('产出：装备 ×' + loot.items + '（ilvl ' + ilvl + '）· 玄晶 ×' + loot.crystals + ' · 金币 ' + loot.gold);
      if (nextKey) lines.push('首领身上掉出一把【' + keyTierDef(nextKey).name + '】。');
      if (first) {
        lines.push('异闻录新记一条：' + r.type.name + ' · ' + kt.name + '。');
        const prog = dungeonCodexProgress(d);
        lines.push('地脉异闻 ' + prog.done + ' / ' + prog.total);
        this.checkTypeBonus(r.tid);
      }
      /* [M6] 地脉结算也是任务的完成条件 —— objectives 的 dungeon 类型
       * 从 data-quests.js 起了数据、QuestSys.onDungeon 写了实现，
       * 但整整一个版本没人调它：那 5 条悬赏永远停在 0/1。
       * 必须放在 pop 对话框**之前**：达成时 QuestSys 会 toast，
       * 人要能在结算文案里看见「悬赏进了一条」。 */
      if (typeof QuestSys !== 'undefined' && QuestSys.onDungeon) {
        try { QuestSys.onDungeon(r.tid, r.tier); } catch (e) {}
      }
    } else {
      lines.push(reason === 'quit' ? '你退出了地脉，第 ' + r.layer + ' 层就此封回去。' : '你倒在了第 ' + r.layer + ' 层。');
      lines.push('');
      lines.push('钥匙没有回来 —— 地脉只认活着走出去的人。');
    }
    this.run = null;
    this._t = 0;
    this.renderHud(false);
    Game.recalc();
    if (!Game.dead) Game.loadMap(r.back);
    const title = win ? (r.type.name + ' · 通关') : (r.type.name + ' · 失败');
    UI.showDialog(title, lines.join('\n'), [
      { label: win ? '回营地' : '被抬出去', primary: true, action: () => UI.closeAll() }
    ]);
    Game.save();
    return { win, reason };
  },

  /* 地脉图鉴：某类 5 阶全清时补发专属加成（items.js 那边按 cleared 实时汇总，
   * 这里只负责弹提示 —— 加成本身不落存档，重算就生效） */
  checkTypeBonus(tid) {
    const d = this.dungeonState();
    let n = 0;
    for (const k of KEY_TIERS) if (d.cleared[dungeonCodexId(tid, k.tier)]) n++;
    if (n !== KEY_TIERS.length) return;
    const b = DUNGEON_TYPE_BONUS[tid];
    if (!b) return;
    const t = dungeonTypeById(tid);
    UI.toast('地脉异闻 · ' + (t ? t.name : tid) + ' 全录', 'lv');
    UI.log('【' + (t ? t.name : tid) + '】五阶皆平：' + b.desc, 'good');
  },

  /* 结算产出：直接进包（不走地面掉落 —— 通关面板弹出来时人已经要被送走了，
   * 掉一地再传送等于让玩家白捡）。 */
  grantLoot(ilvl, win) {
    const out = { items: 0, crystals: 0, gold: 0 };
    const s = Game.state;
    /* 「贪狼」：掉落 +40% —— 折算成多给一件的概率，不直接乘数量（乘了会超背包） */
    const bonus = this.affixLootBonus;
    let count = win ? 2 : 1;
    if (bonus > 0 && CHANCE(Math.min(0.9, bonus))) count++;
    for (let i = 0; i < count; i++) {
      const it = rollItem(ilvl, {
        cls: s.cls,
        magicFind: s.stats.magicFind,
        pool: [['rare', 62], ['legendary', 26], ['set', 10], ['unique', 2]]
      });
      if (it && Game.addItem(it)) out.items++;
    }
    const cry = Math.round((win ? RND(10, 18) : RND(3, 6)) * (1 + (win ? this.run.tier * 0.25 : 0)));
    s.stash = s.stash || {};
    s.stash.mats = s.stash.mats || {};
    s.stash.mats.crystal = (s.stash.mats.crystal || 0) + cry;
    out.crystals = cry;
    const gold = Math.round((win ? RND(260, 420) : RND(60, 120)) * (1 + (this.run.tier - 1) * 0.45));
    s.gold += gold;
    out.gold = gold;
    return out;
  },

  get affixLootBonus() {
    if (!this.run) return 0;
    let b = 0;
    for (const a of this.run.affixes) if (a.loot) b += a.loot;
    return b;
  },

  /* ---------------- 死亡 / 退出 ---------------- */
  /* 死亡 = 失败：钥匙不返还、进度清空、回本卷营地（§8.2）。
   *
   * 注意这里**不换图、不弹自己的面板** —— 死着的时候 loadMap 会让镜头卡在尸体上，
   * 而死亡面板（UI.showDeath）的「回城」按钮才是真正复活的地方。
   * 所以这里只记账 + 打日志，清理留给 onRespawn()。 */
  onPlayerDeath() {
    const r = this.run;
    if (!r) return;
    r.failed = true;
    UI.log('【' + r.type.name + '】止步第 ' + r.layer + ' 层，钥匙留在了地脉里。', 'bad');
  },

  /* Game.respawn() 里调用：返回该回哪张图（null = 退回 default 的村）。
   * 到这里 Game.dead 已经翻成 false，换图是安全的。 */
  onRespawn() {
    const r = this.run;
    if (!r) return null;
    const back = r.back || campMapOfPart(Game.state.part) || 'campA';
    this.run = null;
    this._t = 0;
    this.renderHud(false);
    UI.log('被抬出地脉裂隙。', '');
    return MAPS[back] ? back : null;
  },

  quit() {
    const r = this.run;
    if (!r) return;
    UI.showDialog('退出地脉', '现在退出，这一把就算废了（钥匙不返还，已得的产出保留）。\n\n当前第 ' + r.layer + ' 层。', [
      { label: '继续深入', primary: true, action: () => UI.closeAll() },
      { label: '退出', action: () => { UI.closeAll(); this.finish(false, 'quit'); } }
    ]);
  },

  /* ---------------- 每帧 ---------------- */
  update(dt) {
    const r = this.run;
    if (!r) return;
    this._t += dt;
    /* 无常：每 60 秒随机传送一次 */
    if (this.hasAffix('chaos')) {
      r.teleT += dt;
      if (r.teleT >= 60) {
        r.teleT = 0;
        const zs = (typeof zoneSpawners === 'function') ? zoneSpawners(Game.state.mapId) : [];
        const z = zs.length ? zs[Math.floor(Math.random() * zs.length)] : null;
        if (z && typeof randomPointInZone === 'function') {
          const p = randomPointInZone(z, 3);
          if (p) {
            Game.playerGroup.position.set(p.x, 0, p.z);
            if (typeof FX !== 'undefined') FX.ring(Game.playerGroup.position, 2.4, 0xb98cff, 0.5, 0.2);
            UI.toast('无常 · 地脉把你挪了地方', 'bad');
          }
        }
      }
    }
    /* HUD 的进度条不必每帧重画：杀怪与开门时会 renderHud()，
     * 这里只做 0.25 秒一次的心跳（层内秒数 / 剩余数会变）。 */
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT >= 0.25) { this._hudT = 0; this.renderHud(); }
  },

  /* ---------------- HUD ---------------- */
  renderHud(force) {
    const el = document.getElementById('dgHud');
    if (!el) return;
    const r = this.run;
    if (!r) { if (el.classList.contains('on')) el.classList.remove('on'); return; }
    if (!el.classList.contains('on')) el.classList.add('on');
    const p = this.progress();
    const set = (id, txt) => { const n = document.getElementById(id); if (n) n.textContent = txt; };
    set('dgName', r.type.name);
    set('dgLayer', r.layer + '/' + DUNGEON_LAYERS.length);
    set('dgState', r.layer >= DUNGEON_LAYERS.length ? (r.bossDown ? '已通关' : '首领场') : (p.open ? '地脉门已开' : '清怪'));
    set('dgKill', r.layer >= DUNGEON_LAYERS.length ? (r.bossDown ? '1 / 1' : '0 / 1') : (r.kills + ' / ' + r.total));
    set('dgAffix', r.affixes.length ? r.affixes.map(a => a.name).join(' · ') : '无词缀');
    set('dgTier', keyTierDef(r.tier).name);
    const bar = document.getElementById('dgBar');
    if (bar) bar.style.width = Math.round((r.layer >= DUNGEON_LAYERS.length ? (r.bossDown ? 1 : 0) : p.pct) * 100) + '%';
  }
};
