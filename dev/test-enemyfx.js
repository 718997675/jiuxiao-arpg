#!/usr/bin/env node
/* ============================================================
 * [U9] 怪物侧常驻视觉层 · 静态契约
 *
 *   node dev/test-enemyfx.js
 *
 * 钉住四件事：
 *   1. 8 形态 / 12 词缀全覆盖，颜色与 data-monsters / data-elites 同源
 *   2. 绘制批次恒定 ≤20（8 + 12），不随怪数增长
 *   3. sync 只读实体：hp/dmg/spd/pos/radius 一个都不写
 *   4. game.js 真的接线：init / sync / pulse / healLink / bossArrive / bossDeath
 *
 * 这是离线契约，不渲染像素；真机看 dev/probe-enemyfx.js。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadData } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 源码纪律只看代码，不看注释 —— 注释里写「不 setTimeout」不算调用 */
const codeOf = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------------- 最小 THREE 桩：只实现 runtime 用到的 API ---------------- */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
}
class Obj3D {
  constructor() {
    this.position = new V3(); this.rotation = new V3(); this.scale = new V3(1, 1, 1);
    this.scale.setScalar = s => { this.scale.x = this.scale.y = this.scale.z = s; return this.scale; };
    this.children = []; this.matrix = null;
  }
  add(o) { this.children.push(o); return this; }
  updateMatrix() { this.matrix = { p: [this.position.x, this.position.y, this.position.z], s: this.scale.x }; }
}
class RingGeometry {
  constructor(inner, outer, seg, phi, start, arc) {
    this.inner = inner; this.outer = outer; this.seg = seg; this.arc = arc; this.rotated = false;
  }
  rotateX() { this.rotated = true; return this; }
}
class MeshBasicMaterial { constructor(o) { Object.assign(this, o); } }
class InstancedMesh {
  constructor(geo, mat, cap) {
    this.geometry = geo; this.material = mat; this.count = 0;
    this.userData = {}; this.matrices = [];
    this.instanceMatrix = { count: cap, needsUpdate: false, setUsage() { } };
  }
  setMatrixAt(i, m) { this.matrices[i] = m; }
}
const THREE = {
  Group: Obj3D, Object3D: Obj3D, Vector3: V3,
  RingGeometry, MeshBasicMaterial, InstancedMesh,
  DoubleSide: 2, DynamicDrawUsage: 35048
};
const FX = {
  q: 1, beams: [], rings: [], bursts: [],
  beam() { this.beams.push([].slice.call(arguments)); },
  ring() { this.rings.push([].slice.call(arguments)); },
  burst() { this.bursts.push([].slice.call(arguments)); }
};

/* ---------------- 装数据 + runtime ---------------- */
const ctx = loadData({ console, Math, Set, Map, JSON, Date });
ctx.THREE = THREE;
ctx.FX = FX;
vm.runInContext(src('src/enemy-fx.js'), ctx, { filename: 'src/enemy-fx.js' });
const EFX = vm.runInContext('EnemyFX', ctx);
const MOB_MARK = vm.runInContext('MOB_MARK', ctx);
const MOB_MARK_ORDER = vm.runInContext('MOB_MARK_ORDER', ctx);
const MOB_AI_KINDS = vm.runInContext('MOB_AI_KINDS', ctx);
const ELITE_MARK = vm.runInContext('ELITE_MARK', ctx);
const ELITE_AFFIXES = vm.runInContext('ELITE_AFFIXES', ctx);
const ELITE_AFFIX_ORDER = vm.runInContext('ELITE_AFFIX_ORDER', ctx);
const CAP = vm.runInContext('ENEMY_FX_MOB_CAP', ctx);
const ECAP = vm.runInContext('ENEMY_FX_ELITE_CAP', ctx);
const hex = s => parseInt(String(s).replace('#', ''), 16);

console.log('一、8 种形态：全覆盖、颜色同源、轮廓可区分');
{
  ok(MOB_MARK_ORDER.length === 8, '形态表 8 条', MOB_MARK_ORDER.length);
  const kinds = Object.keys(MOB_AI_KINDS);
  ok(kinds.length === 8, 'MOB_AI_KINDS 也是 8 条', kinds.length);
  for (const k of MOB_MARK_ORDER) {
    ok(!!MOB_AI_KINDS[k], k + ' 是真实 AI 形态');
    ok(!!MOB_MARK[k], k + ' 有微标识声明');
    ok(hex(MOB_AI_KINDS[k].color) === MOB_MARK[k].color,
      k + ' 颜色与 MOB_AI_KINDS 同源', { data: MOB_AI_KINDS[k].color, mark: MOB_MARK[k].color });
  }
  const colors = new Set(MOB_MARK_ORDER.map(k => MOB_MARK[k].color));
  ok(colors.size === 8, '8 种形态颜色两两不同', colors.size);
  const silhouettes = new Set(MOB_MARK_ORDER.map(k => MOB_MARK[k].seg + ':' + MOB_MARK[k].arc));
  ok(silhouettes.size === 8, '8 种形态（边数, 开口）两两不同', Array.from(silhouettes));
  for (const k of MOB_MARK_ORDER) {
    ok(MOB_MARK[k].inner > 0 && MOB_MARK[k].inner < MOB_MARK[k].outer,
      k + ' 内径小于外径');
    ok(MOB_MARK[k].arc > 0 && MOB_MARK[k].arc <= Math.PI * 2, k + ' 开口弧度合法');
  }
}

console.log('二、12 条精英词缀：全覆盖、颜色同源、角标可区分');
{
  ok(ELITE_AFFIX_ORDER.length === 12, '词缀表 12 条', ELITE_AFFIX_ORDER.length);
  for (const id of ELITE_AFFIX_ORDER) {
    ok(!!ELITE_MARK[id], id + ' 有常驻角标');
    ok(hex(ELITE_AFFIXES[id].color) === ELITE_MARK[id].color,
      id + ' 颜色与 ELITE_AFFIXES 同源', { data: ELITE_AFFIXES[id].color, mark: ELITE_MARK[id].color });
  }
  const pairs = new Set(ELITE_AFFIX_ORDER.map(id => ELITE_MARK[id].color + ':' + ELITE_MARK[id].seg));
  ok(pairs.size === 12, '12 条词缀（颜色, 边数）两两不同', pairs.size);
  /* 同色的 venom / summoner 必须靠边数分开 */
  ok(ELITE_MARK.venom.color === ELITE_MARK.summoner.color, '剧毒与召唤同色（事实）');
  ok(ELITE_MARK.venom.seg !== ELITE_MARK.summoner.seg, '同色词缀靠边数区分');
}

console.log('三、绘制批次：8 + 12 = 20，与怪数无关');
{
  const scene = new THREE.Group();
  ok(EFX.init(scene) === true, 'init 成功');
  ok(EFX.init(scene) === false, '重复 init 不重复建组');
  const st = EFX.stats();
  ok(st.mobMeshes === 8, '8 个形态实例网格', st.mobMeshes);
  ok(st.eliteMeshes === 12, '12 个词缀实例网格', st.eliteMeshes);
  ok(st.drawCap === 20, '绘制批次上限 20', st.drawCap);
  ok(st.mobInstances === 0 && st.eliteInstances === 0, '初始没有实例');
  ok(scene.children.length === 1, '只往场景挂一个组', scene.children.length);
  for (const k of MOB_MARK_ORDER) ok(EFX.mob[k].instanceMatrix.count === CAP, k + ' 容量 = ' + CAP);
  for (const id of ELITE_AFFIX_ORDER) ok(EFX.elite[id].instanceMatrix.count === ECAP, id + ' 角标容量 = ' + ECAP);
}

/* 造一只最小实体：只带视觉层读的字段 */
const mkEnemy = (id, kind, x, z, extra) => Object.assign({
  id, pos: new V3(x, 0, z), radius: 0.8, facing: new V3(0, 0, 1),
  ai: { kind, state: 'idle' }, cfg: {}, dead: false, boss: false, elite: false,
  hp: 100, maxHp: 100, dmg: 10, spd: 3, atkCd: 1, windup: 0
}, extra || {});

console.log('四、sync：8 形态各就各位，40 只同类不涨批次');
{
  EFX.clear();
  const list = MOB_MARK_ORDER.map((k, i) => mkEnemy('k' + i, k, i * 2, 3));
  EFX.sync(0.016, 1, list);
  let st = EFX.stats();
  ok(st.mobInstances === 8, '8 只不同形态 → 8 个实例', st.mobInstances);
  for (let i = 0; i < MOB_MARK_ORDER.length; i++) {
    const k = MOB_MARK_ORDER[i];
    ok(EFX.mob[k].count === 1, k + ' 网格有 1 个实例', EFX.mob[k].count);
    const m = EFX.mob[k].matrices[0];
    ok(m && Math.abs(m.p[0] - i * 2) < 1e-6, k + ' 矩阵 x 跟实体一致', m && m.p);
  }

  EFX.clear();
  const crowd = [];
  for (let i = 0; i < 40; i++) crowd.push(mkEnemy('m' + i, 'melee', (i % 8) * 1.5, Math.floor(i / 8) * 1.5));
  EFX.sync(0.016, 2, crowd);
  st = EFX.stats();
  ok(st.mobInstances === 40, '40 只近战全部有实例', st.mobInstances);
  ok(st.drawCap === 20, '40 只同屏批次仍是 20', st.drawCap);
  ok(EFX.mob.melee.count === 40, '只用一个近战网格画 40 只', EFX.mob.melee.count);
  for (const k of MOB_MARK_ORDER) if (k !== 'melee') ok(EFX.mob[k].count === 0, k + ' 没有误画');
}

console.log('五、sync 只读实体：数值 / 位置 / 判定字段一个不写');
{
  EFX.clear();
  const e = mkEnemy('readonly', 'bomber', 5, 6, { ai: { kind: 'bomber', state: 'fuse' } });
  const before = JSON.stringify({
    hp: e.hp, maxHp: e.maxHp, dmg: e.dmg, spd: e.spd, atkCd: e.atkCd,
    x: e.pos.x, z: e.pos.z, radius: e.radius, windup: e.windup
  });
  EFX.sync(0.1, 3, [e]);
  const after = JSON.stringify({
    hp: e.hp, maxHp: e.maxHp, dmg: e.dmg, spd: e.spd, atkCd: e.atkCd,
    x: e.pos.x, z: e.pos.z, radius: e.radius, windup: e.windup
  });
  ok(before === after, 'sync 不改 hp/dmg/spd/atkCd/pos/radius/windup');
  ok(e._efxPulse === undefined, '没有 pulse 时不凭空写视觉字段');
  ok(EFX.mob.bomber.count === 1, '自爆怪有实例');
  const s1 = EFX.mob.bomber.matrices[0].s;
  EFX.sync(0.016, 3.2, [e]);
  const s2 = EFX.mob.bomber.matrices[0].s;
  ok(s2 !== s1, '引信期尺寸在闪（同一枚环放大/收缩）', { s1, s2 });

  ok(EFX.pulse(e, 1) === true, 'pulse 返回 true');
  EFX.sync(0.05, 4, [e]);
  ok(e._efxPulse > 0 && e._efxPulse < 1, 'pulse 会衰减', e._efxPulse);

  EFX.clear();
  EFX.sync(0.016, 5, [
    mkEnemy('dead', 'melee', 1, 1, { dead: true }),
    mkEnemy('boss', 'melee', 2, 2, { boss: true }),
    mkEnemy('elite', 'healer', 3, 3, { elite: true, affixes: ['frost'] })
  ]);
  const st = EFX.stats();
  ok(st.mobInstances === 1, 'dead / boss 不画形态环，精英照画', st.mobInstances);
  ok(st.eliteInstances === 1, '精英角标 1 个', st.eliteInstances);
}

console.log('六、精英角标：一条词缀一个角标，绕脚排布');
{
  EFX.clear();
  const e = mkEnemy('elite1', 'ranged', 10, 10, {
    elite: true, radius: 1.2, affixes: ['frost', 'thorns', 'warded']
  });
  EFX.sync(0.016, 6, [e]);
  const st = EFX.stats();
  ok(st.eliteInstances === 3, '3 条词缀 → 3 个角标', st.eliteInstances);
  for (const id of ['frost', 'thorns', 'warded']) {
    ok(EFX.elite[id].count >= 1, id + ' 角标网格有实例', EFX.elite[id].count);
    const m = EFX.elite[id].matrices[0];
    const d = Math.hypot(m.p[0] - e.pos.x, m.p[2] - e.pos.z);
    ok(d > e.radius && d < e.radius + 1, id + ' 角标在脚边外圈', d);
  }
  ok(EFX.elite.frost.count === 1, '没抽到的词缀不画');
}

console.log('七、一次性演出：治疗光束 / Boss 进场 / Boss 倒地');
{
  EFX.clear(); FX.beams.length = 0; FX.rings.length = 0; FX.bursts.length = 0;
  const healer = mkEnemy('h', 'healer', 1, 1);
  const tgt = mkEnemy('t', 'melee', 3, 1);
  ok(EFX.healLink(healer, tgt) === true, '治疗光束返回 true');
  ok(FX.beams.length === 1, '画了 1 条 beam', FX.beams.length);
  const selfRings = FX.rings.length;
  ok(EFX.healLink(healer, healer) === true, '自疗也返回 true');
  ok(FX.rings.length === selfRings + 1, '自疗画环而不是零长度光束');
  ok(EFX.events.healLink === 2, '治疗事件计数 2', EFX.events.healLink);

  const boss = mkEnemy('b', 'melee', 8, 8, { boss: true, radius: 2.4, active: false, hp: 999 });
  const snap = JSON.stringify({ hp: boss.hp, active: boss.active, dmg: boss.dmg, x: boss.pos.x, z: boss.pos.z });
  const b0 = FX.beams.length, r0 = FX.rings.length, p0 = FX.bursts.length;
  ok(EFX.bossArrive(boss) === true, 'bossArrive 返回 true');
  ok(FX.beams.length === b0 + 1, '进场有 1 道光柱');
  ok(FX.rings.length === r0 + 1, '进场有收束环');
  ok(FX.bursts.length === p0 + 1, '进场有碎星');
  ok(JSON.stringify({ hp: boss.hp, active: boss.active, dmg: boss.dmg, x: boss.pos.x, z: boss.pos.z }) === snap,
    '进场不改 hp/active/dmg/pos');

  const p = boss.pos.clone();
  ok(EFX.bossDeath(boss, p) === true, 'bossDeath 返回 true');
  ok(FX.beams.length === b0 + 2, '倒地有掉落光柱');
  ok(FX.bursts.length === p0 + 2, '倒地有碎片');
  ok(EFX.events.arrive === 1 && EFX.events.death === 1, '生命周期事件计数正确', EFX.events);

  EFX.clear();
  ok(EFX.stats().mobInstances === 0 && EFX.stats().eliteInstances === 0, 'clear 清空实例');
  ok(EFX.events.arrive === 0, 'clear 清空事件');
}

console.log('八、源码纪律：不写数值、不挂判定、不搞定时器');
{
  const s = codeOf(src('src/enemy-fx.js'));
  for (const bad of ['damagePlayer', 'damageEnemy', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
    ok(s.indexOf(bad) < 0, 'runtime 不出现 ' + bad);
  }
  for (const f of ['hp', 'dmg', 'spd', 'atkCd', 'radius', 'windup']) {
    const re = new RegExp('e\\.' + f + '\\s*=');
    ok(!re.test(s), 'runtime 不写 e.' + f);
  }
  ok(!/e\.pos\.[xz]\s*=/.test(s), 'runtime 不写 e.pos.x / e.pos.z');

  const data = codeOf(src('src/data/data-enemyfx.js'));
  for (const bad of ['damagePlayer', 'damageEnemy']) {
    ok(data.indexOf(bad) < 0, 'data 层不出现 ' + bad);
  }
  ok(!/(^|[^A-Za-z])FX\./.test(data), 'data 层不调用 FX.*');
}

console.log('九、game.js 接线：六处都真的调了');
{
  const g = src('src/game.js');
  const wiring = [
    ['EnemyFX.init(this.scene)', '构造时绑定场景'],
    ['EnemyFX.clear()', '换图时清空'],
    ['EnemyFX.sync(dt, this.time, this.enemies)', '每帧跟随'],
    ['EnemyFX.pulse(e, 1)', '近战抬手回执'],
    ['EnemyFX.healLink(e, tgt)', '治疗光束'],
    ['EnemyFX.bossArrive(b)', 'Boss 进场'],
    ['EnemyFX.bossDeath(e, p)', 'Boss 倒地']
  ];
  for (const [needle, name] of wiring) ok(g.indexOf(needle) >= 0, name + '：' + needle);
  /* 自爆引信不再借 hitFlash */
  const bomber = codeOf(g.slice(g.indexOf('aiBomber(e, dt, d, pp)'), g.indexOf('mobExplode(e, byFuse)')));
  ok(bomber.length > 200, '找到 aiBomber 函数体', bomber.length);
  ok(!/e\.hitFlash\s*=/.test(bomber), '自爆引信不再借 hitFlash 当警戒灯');
}

console.log('十、加载顺序：数据在 elites 之后，runtime 在 fx.js 之后、game.js 之前');
{
  const html = src('index.html');
  const at = s => html.indexOf(s);
  ok(at('src/data/data-elites.js') < at('src/data/data-enemyfx.js'), 'data-enemyfx 晚于 data-elites');
  ok(at('src/fx.js') < at('src/enemy-fx.js'), 'enemy-fx 晚于 fx.js');
  ok(at('src/enemy-fx.js') < at('src/game.js'), 'enemy-fx 早于 game.js');
}

console.log('\n' + (fail ? '✗' : '✓') + ' U9 怪物侧常驻视觉契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
