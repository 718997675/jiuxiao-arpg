/* ============================================================
 * [U9] 怪物侧常驻视觉层 · 形态微标识 / 词缀角标 / Boss 生命周期
 *
 * 这一层**只读**实体：位置、朝向、AI 状态、词缀 id。
 * 它不写 hp / dmg / spd / pos / radius，也不挂任何判定回调 ——
 * 玩家看到的小环是「这只会干什么」，不是「这里能打多大」。
 *
 * 为什么用 InstancedMesh：
 *   同屏上限 36，8 种形态各一个网格、12 条词缀各一个网格，
 *   绘制批次恒定 ≤20，跟怪数无关。每帧只改 instanceMatrix，
 *   不 new 材质 / 不 new 几何 / 不 setTimeout。
 *
 * 接线（在 game.js 里，全是可省的 typeof 守卫）：
 *   Game 构造  → EnemyFX.init(this.scene)
 *   changeMap  → EnemyFX.clear()
 *   updateEnemies 末尾 → EnemyFX.sync(dt, this.time, this.enemies)
 *   mobMeleeSwing  → EnemyFX.pulse(e, 1)      （抬手的那一下亮一圈）
 *   mobHeal        → EnemyFX.healLink(e, tgt) （治疗光束）
 *   spawnBosses    → EnemyFX.bossArrive(b)
 *   onEnemyDeath   → EnemyFX.bossDeath(e, p)
 * ============================================================ */
'use strict';

const EnemyFX = {
  group: null,
  mob: {},
  elite: {},
  events: { arrive: 0, death: 0, healLink: 0, pulse: 0 },
  _dummy: null,
  _qApplied: -1,

  /* 固定键顺序，探针按它数网格；与 data-enemyfx.js 的 MOB_MARK_ORDER 一致 */
  _mobOrder() {
    return (typeof MOB_MARK_ORDER !== 'undefined' && MOB_MARK_ORDER.length)
      ? MOB_MARK_ORDER
      : ['melee', 'ranged', 'flank', 'kite', 'bomber', 'healer', 'summoner', 'coward'];
  },
  _eliteOrder() {
    return (typeof ELITE_AFFIX_ORDER !== 'undefined' && ELITE_AFFIX_ORDER.length)
      ? ELITE_AFFIX_ORDER : Object.keys(typeof ELITE_MARK !== 'undefined' ? ELITE_MARK : {});
  },

  init(scene) {
    if (this.group || typeof THREE === 'undefined' || !scene) return false;
    this.group = new THREE.Group();
    this.group.name = 'enemy-fx';
    this._dummy = new THREE.Object3D();

    const mk = (geo, color, cap, key, bucket) => {
      const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, depthWrite: false
      });
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;          // 实例位置每帧变，包围盒不可信
      mesh.userData.enemyFxKey = key;
      if (mesh.instanceMatrix && THREE.DynamicDrawUsage) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
      this.group.add(mesh);
      bucket[key] = mesh;
      return mesh;
    };

    for (const k of this._mobOrder()) {
      const d = (typeof MOB_MARK !== 'undefined' && MOB_MARK[k]) || null;
      if (!d) continue;
      const arc = d.arc == null ? Math.PI * 2 : d.arc;
      /* RingGeometry 在 XY 面，转平到 XZ；开口弧居中（-arc/2 起） */
      const geo = new THREE.RingGeometry(d.inner || 0.62, d.outer || 1, d.seg || 6, 1, -arc / 2, arc);
      geo.rotateX(-Math.PI / 2);
      mk(geo, d.color, (typeof ENEMY_FX_MOB_CAP !== 'undefined' ? ENEMY_FX_MOB_CAP : 48), k, this.mob);
    }

    const eCap = (typeof ENEMY_FX_ELITE_CAP !== 'undefined' ? ENEMY_FX_ELITE_CAP : 16);
    for (const id of this._eliteOrder()) {
      const d = (typeof ELITE_MARK !== 'undefined' && ELITE_MARK[id]) || null;
      if (!d) continue;
      const geo = new THREE.RingGeometry(0.68, 1, d.seg || 6, 1, -Math.PI / (d.seg || 6), Math.PI * 2);
      geo.rotateX(-Math.PI / 2);
      mk(geo, d.color, eCap, id, this.elite);
    }

    scene.add(this.group);
    this._applyQuality(this._quality());
    return true;
  },

  _quality() {
    return (typeof FX !== 'undefined' && FX && FX.q != null) ? FX.q : 1;
  },

  _applyQuality(q) {
    if (!this.group || this._qApplied === q) return;
    this._qApplied = q;
    const op = q < 0.75 ? 0.5 : (q < 1 ? 0.64 : 0.78);
    for (const k in this.mob) this.mob[k].material.opacity = op;
    for (const k in this.elite) this.elite[k].material.opacity = op + 0.1;
  },

  /* 纯视觉脉冲：只记一个衰减量，不碰血条 / 位移 / 冷却 */
  pulse(e, strength) {
    if (!e) return false;
    e._efxPulse = Math.max(e._efxPulse || 0, strength || 1);
    this.events.pulse++;
    return true;
  },

  /* 每帧跟随实体。enemies 可以是任意数组；boss / dead 自动跳过。 */
  sync(dt, time, enemies) {
    if (!this.group || !enemies || !this._dummy) return false;
    const d0 = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const t = Number.isFinite(time) ? time : 0;
    const q = this._quality();
    this._applyQuality(q);
    const qScale = q < 0.75 ? 0.76 : (q < 1 ? 0.9 : 1);
    const dummy = this._dummy;

    const byKind = {};
    for (const k of this._mobOrder()) byKind[k] = [];
    const elites = [];
    for (const e of enemies) {
      if (!e || e.dead || !e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) continue;
      if (e.elite && !e.boss && e.affixes && e.affixes.length) elites.push(e);
      if (e.boss) continue;
      let k = (e.ai && e.ai.kind) || ((e.cfg && e.cfg.ranged) ? 'ranged' : 'melee');
      if (!this.mob[k]) k = 'melee';
      if (byKind[k]) byKind[k].push(e);
    }

    for (const k of this._mobOrder()) {
      const mesh = this.mob[k];
      if (!mesh) continue;
      const list = byKind[k] || [];
      const n = Math.min(list.length, mesh.instanceMatrix ? mesh.instanceMatrix.count : list.length);
      for (let i = 0; i < n; i++) {
        const e = list[i];
        const p = e._efxPulse || 0;
        if (p > 0) e._efxPulse = Math.max(0, p - d0 * 4);
        let boost = 1 + p * 0.55;
        const ai = e.ai || {};
        /* 引信 / 施法 / 逃跑 / 抬手：只放大同一枚常驻记号，不另画一朵花 */
        if (k === 'bomber' && ai.state === 'fuse') boost *= 1.5 + Math.sin(t * 22) * 0.22;
        else if ((k === 'healer' || k === 'summoner') && ai.state === 'cast') boost *= 1.3;
        else if (k === 'coward' && ai.state === 'flee') boost *= 1.25 + Math.sin(t * 9) * 0.14;
        else if (k === 'melee' && e.windup > 0) boost *= 1.22;
        const s = 0.42 * qScale * Math.max(0.6, boost);
        dummy.position.set(e.pos.x, 0.12, e.pos.z);
        dummy.rotation.set(0, (e.facing && Number.isFinite(e.facing.x)) ? Math.atan2(e.facing.z, e.facing.x) : 0, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = n;
      if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    }

    /* 精英槽位每帧重排：死亡 / 换图后空出来的位置要能复用。
     * 先排完再写，不能用上一帧的槽 —— 新刷出来的精英会撞掉别人的位置。 */
    this._eliteSlot = {};
    const eCap = (typeof ENEMY_FX_ELITE_CAP !== 'undefined' ? ENEMY_FX_ELITE_CAP : 16);
    for (let i = 0; i < elites.length; i++) this._eliteSlot[elites[i].id] = i % eCap;
    for (const k in this.elite) this.elite[k].count = 0;
    for (const e of elites) {
      const affixes = e.affixes;
      const slot = this._eliteSlot[e.id];
      for (let j = 0; j < affixes.length; j++) {
        const mesh = this.elite[affixes[j]];
        if (!mesh) continue;
        const ang = (j / affixes.length) * Math.PI * 2 + t * 0.35;
        const r = (e.radius || 0.8) + 0.45;
        const s = 0.26 * qScale;
        dummy.position.set(e.pos.x + Math.cos(ang) * r, 0.14, e.pos.z + Math.sin(ang) * r);
        dummy.rotation.set(0, -ang, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(slot, dummy.matrix);
        mesh.count = slot + 1;
        if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return true;
  },

  /* 精英槽位表：sync 里先按上一帧的槽写，再重排；换图 clear 会整个清空 */
  _eliteSlot: {},

  /* 一次性的治疗光束。FX.beam 自带 0.3s 尾焰，不另起定时器 */
  healLink(from, to) {
    if (!from || !to || typeof THREE === 'undefined' || typeof FX === 'undefined') return false;
    if (!from.pos || !to.pos) return false;
    if (from === to || from.id === to.id) {
      FX.ring(to.pos, 1.5, 0x66d08a, 0.3, 0.16);
    } else {
      FX.beam(
        new THREE.Vector3(from.pos.x, 1.6, from.pos.z),
        new THREE.Vector3(to.pos.x, 1.4, to.pos.z),
        0x66d08a, 0.32, 1.2);
    }
    this.events.healLink++;
    return true;
  },

  /* Boss 进场：环由大收小（FX.ring 的 dur 就是收束时间）+ 地面光柱 + 碎星 */
  bossArrive(b) {
    if (!b || !b.pos || typeof THREE === 'undefined' || typeof FX === 'undefined') return false;
    const C = (typeof BOSS_FX !== 'undefined' && BOSS_FX.arrive) || {};
    const p = b.pos, r = (b.radius || 2) + 2.2;
    FX.ring(p, r, C.ringColor || 0xff6644, C.ringDur || 0.9, 0.3);
    FX.beam(
      new THREE.Vector3(p.x, 0.1, p.z),
      new THREE.Vector3(p.x, C.height || 7, p.z),
      C.beamColor || 0xffb070, C.beamDur || 0.85, C.beamWidth || 3);
    FX.burst(new THREE.Vector3(p.x, 0.5, p.z), C.beamColor || 0xffb070,
      C.shards || 16, { speed: 3.4, size: 0.13, life: 0.9, additive: true, gravity: -4 });
    this.events.arrive++;
    return true;
  },

  /* Boss 死亡：碎片向上抛 + 掉落光柱。掉落物自己的光柱保留，这里不重复造物 */
  bossDeath(e, p0) {
    if (!e || typeof THREE === 'undefined' || typeof FX === 'undefined') return false;
    const p = p0 || (e.pos && e.pos.clone && e.pos.clone()) || e.pos;
    if (!p) return false;
    const C = (typeof BOSS_FX !== 'undefined' && BOSS_FX.death) || {};
    FX.ring(p, (e.radius || 2) + 3, C.ringColor || 0xffaa44, C.ringDur || 1.1, 0.34);
    FX.burst(new THREE.Vector3(p.x, 1.2, p.z), C.beamColor || 0xffd890,
      C.shards || 26, { speed: 7, size: 0.16, life: 1, additive: true, gravity: -9 });
    FX.beam(
      new THREE.Vector3(p.x, 0.15, p.z),
      new THREE.Vector3(p.x, C.height || 9, p.z),
      C.beamColor || 0xffd890, C.beamDur || 1.2, C.beamWidth || 4);
    this.events.death++;
    return true;
  },

  clear() {
    for (const k in this.mob) { this.mob[k].count = 0; if (this.mob[k].instanceMatrix) this.mob[k].instanceMatrix.needsUpdate = true; }
    for (const k in this.elite) { this.elite[k].count = 0; if (this.elite[k].instanceMatrix) this.elite[k].instanceMatrix.needsUpdate = true; }
    this._eliteSlot = {};
    this.events = { arrive: 0, death: 0, healLink: 0, pulse: 0 };
    return true;
  },

  stats() {
    let mobInstances = 0, eliteInstances = 0;
    for (const k in this.mob) mobInstances += this.mob[k].count;
    for (const k in this.elite) eliteInstances += this.elite[k].count;
    return {
      bound: !!this.group,
      mobMeshes: Object.keys(this.mob).length,
      eliteMeshes: Object.keys(this.elite).length,
      drawCap: Object.keys(this.mob).length + Object.keys(this.elite).length,
      mobInstances, eliteInstances, q: this._qApplied,
      events: Object.assign({}, this.events)
    };
  }
};

if (typeof window !== 'undefined') window.EnemyFX = EnemyFX;
