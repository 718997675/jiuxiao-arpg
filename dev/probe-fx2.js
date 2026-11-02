#!/usr/bin/env node
/* ============================================================
 * B16 真机探针：怪物侧原语层 `src/fx2.js` 在**游戏里**真的能出东西
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-fx2.js
 *
 * 为什么不能只靠 `build-fx2.js --check`：那只证明「生成物没走散」，
 * 证明不了「搬进游戏之后还画得出来」。搬家最容易坏的三处，这里各钉一条：
 *   1. 没绑场景 —— 原语全部往 `FX2` 自己的 Group 里加，没 bind 就一个都进不了场景图
 *   2. 没接帧 —— `update` 没被调，粒子永远停在第 0 帧、一次性效果永不退场
 *   3. 没接清场 —— 换图后旧图的柱子和落石挂在新图坐标上，再也删不掉
 *
 * 两个「量法」上的坑（都踩过）：
 *   - `FX2` 是 `const` 声明，**不在 window 上**。用 `window.FX2` 判接口会全判成 false，
 *     看起来像「没导出」，其实只是取不到。
 *   - 无头 + 软件渲染下帧率极低，`dt` 又被夹在 0.05，所以**模拟时间比真实时间慢好几倍**。
 *     按真实秒数死等会量到「还在飞」，一律改成轮询到条件成立（带超时）。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const PRIMS = ['spr', 'burst', 'shock', 'zone', 'column', 'spikes', 'boulder', 'blade',
  'wave', 'decal', 'ribbon', 'arcSlash', 'trail', 'entity', 'pool', 'beam', 'wall'];

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  console.log('\n【1】接口面');
  const api = await p.evaluate((list) => ({
    missing: list.filter(k => typeof FX2 === 'undefined' || typeof FX2[k] !== 'function'),
    bound: !!(Game.scene && Game.scene.getObjectByName('fx2')),
    hasUpdate: typeof FX2.update === 'function',
    hasClear: typeof FX2.clear === 'function',
    hasActors: !!(FX2.actors && FX2.actors.boss && FX2.actors.player),
    shakeHooked: typeof FX2.shake === 'function',
    zoneOn: FX2.zoneOn === true,
  }), PRIMS);
  ok(api.missing.length === 0, '17 个原语都在（缺 ' + api.missing.length + '）', api.missing);
  ok(api.bound, 'bind 之后 fx2 组已经挂进场景图', api);
  ok(api.hasUpdate && api.hasClear, 'update / clear 都导出了', api);
  ok(api.hasActors, 'actors.boss / actors.player 两个锚点存在', api);
  ok(api.shakeHooked, '屏幕震动已经接上（不是 undefined）', api);
  ok(api.zoneOn, '预警开关默认打开（关了整层等于没画）', api);

  console.log('\n【2】粒子类：真的进了池子，而且会自己退场');
  const parts = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const v = new THREE.Vector3(pp.x, 1, pp.z);
    FX2.burst(v, 24, { sp: 3, life: .6 });
    const just = FX2.stats().particles;          /* stats 数的是真活着的，不用等一帧 */
    /* 轮询到退完（模拟时间比真实时间慢，死等 1 秒会量到「还在飞」） */
    let n = just, spun = 0;
    while (n > 0 && spun < 60) { await wait(200); spun++; n = FX2.stats().particles; }
    return { just, end: n, realMs: spun * 200 };
  });
  ok(parts.just >= 20, '一次 burst 24 发，池子里真有 ≥20 颗', parts);
  ok(parts.end === 0, '会自己退场（update 确实在跑，' + parts.realMs + 'ms 后归零）', parts);

  console.log('\n【3】mesh 类：加进 fx2 组，清场时被收走');
  const mesh = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const g = () => Game.scene.getObjectByName('fx2');
    const n0 = g().children.length;
    FX2.column({ x: pp.x, z: pp.z }, 2.2, { color: 0xff8a44, dur: 6, tex: 'soft' });
    FX2.spikes({ x: pp.x + 1, z: pp.z, n: 5, r: 1.6, h: 2.2, color: 0x9a8a6a, glow: 0xffaa66, dur: 6 });
    FX2.decal({ x: pp.x, z: pp.z - 1, tex: 'rune', r: 1.6, life: 6, color: 0xaa66ff });
    FX2.shock(V(pp.x, 0, pp.z + 1), 3, { color: 0xffd8a0, dur: 3 });
    const n1 = g().children.length;
    FX2.clear();
    const n2 = g().children.length;
    return { n0, n1, n2, stats: FX2.stats() };
  });
  ok(mesh.n1 - mesh.n0 >= 4, '柱 / 刺 / 贴花 / 冲击环都进了场景（+' + (mesh.n1 - mesh.n0) + ' 个节点）', mesh);
  ok(mesh.n2 === mesh.n0, 'clear() 之后回到清场前的节点数（不多不少，' + mesh.n2 + '）', mesh);
  ok(mesh.stats.particles === 0 && mesh.stats.updaters === 0,
    'clear() 之后粒子与更新器都归零', mesh.stats);

  console.log('\n【4】活物五件：接口不是占位符');
  const live = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const r = {};
    /* trail：能长到 N 个节点，能 kill，kill 之后更新器不许留下 */
    const tr = FX2.trail({ color: 0xffc078, w: .6, y: .1, max: 32 });
    for (let i = 0; i < 12; i++) tr.push(pp.x + Math.sin(i * .2) * 2, pp.z + i * .3, .1);
    r.trailNodes = tr.count();
    const upBefore = FX2.stats().updaters;
    tr.kill();
    await wait(120);
    r.trailKilled = FX2.stats().updaters < upBefore;

    /* entity：朝目标走，走过去要真的动 */
    const e = FX2.entity({
      x: pp.x + 6, z: pp.z, size: .5, speed: 3, life: 6,
      target: () => ({ x: pp.x, z: pp.z })
    });
    const d0 = Math.hypot(e.x - pp.x, e.z - pp.z);
    await wait(900);
    const d1 = Math.hypot(e.x - pp.x, e.z - pp.z);
    r.entityClosed = d1 < d0 - .1;
    r.entityD = [+d0.toFixed(2), +d1.toFixed(2)];
    e.kill();

    /* pool：地面块会扩（要跨几帧才看得出来，所以取两次） */
    const po = FX2.pool({ x: pp.x, z: pp.z + 3, r: 3, dur: 12, color: 0x7fd05a, onTick: () => { } });
    await wait(150);
    const rA = po.r;
    await wait(900);
    r.poolR = [+rA.toFixed(2), +po.r.toFixed(2)];
    r.poolGrew = po.r > rA + .05;

    /* beam：A→B 跟着两个锚点走，kill 得掉 */
    const bm = FX2.beam({ a: () => FX2.actors.boss.pos, b: () => FX2.actors.player.pos, color: 0xaa66ff, w: .3, life: 3 });
    r.beamOk = !!bm && typeof bm.kill === 'function';
    bm.kill();

    /* wall：会朝一个方向推进，kill 是真实现 */
    const w = FX2.wall({ x: pp.x, z: pp.z - 6, ang: 0, w: 10, speed: 3, life: 4, color: 0xff6a3c });
    const z0 = w.pos.z;
    await wait(900);
    r.wallMoved = Math.abs(w.pos.z - z0) > .1;
    r.wallDz = +(w.pos.z - z0).toFixed(2);
    w.kill();
    return r;
  });
  ok(live.trailNodes >= 12, 'trail 收得下 12 个节点', live);
  ok(live.trailKilled, 'trail.kill() 把更新器一起收掉（不是只删 mesh）', live);
  ok(live.entityClosed, 'entity 朝目标真的在走（' + (live.entityD || []).join(' → ') + ' 码）', live);
  ok(live.poolGrew, 'pool 半径在长（' + (live.poolR || []).join(' → ') + '）', live);
  ok(live.beamOk, 'beam 两个锚点都在，且能 kill', live);
  ok(live.wallMoved, 'wall 真的在推进（' + live.wallDz + ' 码）', live);

  console.log('\n【5】换图清场：旧图的东西不跟到新图');
  const wipe = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const g = () => Game.scene.getObjectByName('fx2');
    /* 先把上一节留下的活物（还有一个 12 秒的毒地）清掉再取基线 ——
     * 不清的话 n0 里混着「本来就该被清掉的东西」，n2 < n0 会被判成
     * 「清多了」，其实那正好是清对了。 */
    FX2.clear();
    const n0 = g().children.length;
    FX2.column({ x: pp.x, z: pp.z }, 2, { color: 0xff8a44, dur: 30 });
    FX2.trail({ color: 0xffffff, w: .4, max: 16 }).push(pp.x, pp.z, .1);
    const n1 = g().children.length;
    Game.mapGen = (Game.mapGen || 0) + 1;
    FX.clear();
    await wait(150);
    return { n0, n1, n2: g().children.length, stats: FX2.stats() };
  });
  ok(wipe.n1 > wipe.n0, '清场前场景里确实多了东西（' + wipe.n0 + ' → ' + wipe.n1 + '）', wipe);
  ok(wipe.n2 === wipe.n0, 'FX.clear() 把原语层一起清干净（回到 ' + wipe.n2 + '）', wipe);
  ok(wipe.stats.updaters === 0, '清完没有残留更新器（旧的会一直写已删的 mesh）', wipe);

  console.log('\n【6】清场之后还能用（粒子缓冲不许被拆掉）');
  const reuse = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    FX2.spr(pp.x, 1, pp.z, { life: .5, s0: .4 });
    FX2.burst(new THREE.Vector3(pp.x, 1, pp.z), 10, {});
    const n = FX2.stats().particles;
    /* 缓冲还在不在场景图里：不在了就永远画不出来 */
    let ptsInScene = 0;
    Game.scene.getObjectByName('fx2').traverse(o => { if (o.isPoints) ptsInScene++; });
    return { n, ptsInScene };
  });
  ok(reuse.n > 0, '清场之后还能再放粒子（' + reuse.n + ' 颗）', reuse);
  ok(reuse.ptsInScene > 0, '粒子缓冲还在场景图里（' + reuse.ptsInScene + ' 个 Points）', reuse);

  console.log('\n【7】全程零报错');
  ok(errs.length === 0, '没有控制台错误', errs.slice(0, 4));

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
