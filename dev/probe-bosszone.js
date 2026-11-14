#!/usr/bin/env node
/* ============================================================
 * [U7] 形状预警 `FX.zone` 真机验收
 *
 *   node dev/probe-bosszone.js
 *
 * 静态契约（dev/test-bosspattern.js）只判「game.js 有没有写前摇和形状」，
 * 判不了 `FX.zone` 自己画得对不对 —— 它是 U7 全新加的一层，一个像素都
 * 没渲染过。这支探针量六件事：
 *
 *   1  四种形状的构件数对得上（circle 3 / ring 4 / rect 6 / lock 6）
 *   2  每个形状都真的出像素（差异像素 > 0，不是挂了个空 Group）
 *   3  rect 的朝向真的指向 dir（本地 +Y 投影 == dir，位置 == pos + dir*len/2）
 *   4  lock 的 `follow` 真的跟着人走（移动玩家 3 格，标记跟 3 格）
 *   5  `sweep` 方向对：'in' 进度环由大收小、'out' 由小扩到大
 *   6  到点回调**恰好一次**；全部过期后 zones 归零、draw call 回基线
 *
 * 两条纪律（沿用 probe-enchant）：
 *   · `Game.running = false` 停主循环，否则 rAF 会自己推进 FX，量到的
 *     不是我们手动喂的那一步；
 *   · 像素测量前 `gl.finish()`，SwiftShader 是异步的，不等就读到半帧。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const EXE = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const TOOLS = `
  window.__buf = null;
  window.__setup = function () {
    Game.startNew('warrior', 'T');
    Game.state.level = 45;
    try { Game.recalc(); } catch (e) { }
    Game.running = false;
    FX.clear();
    if (typeof FXK !== 'undefined' && FXK.clear) FXK.clear();
    FX.q = 1;
    const pp = Game.playerGroup.position;
    /* 俯视但**不能垂直向下**：lookAt 的方向与 up=(0,1,0) 平行时基向量退化，
     * 相机会转到意想不到的方位（实测圆盘正好被甩出画面，而矩形带还在）。
     * 抬高 14、后撤 6，约 67° 俯角，地面贴片仍然读得清形状。 */
    Game.camera.position.set(pp.x, 14, pp.z + 6);
    Game.camera.lookAt(pp.x, 0, pp.z - 4);
    Game.camera.updateMatrixWorld();
    const cv = document.getElementById('gl');
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    window.__buf = { cv, x2: c2.getContext('2d', { willReadFrequently: true }) };
    return { w: cv.width, h: cv.height };
  };
  window.__grab = function () {
    Game.renderer.render(Game.scene, Game.camera);
    Game.renderer.getContext().finish();
    const { cv, x2 } = window.__buf;
    x2.clearRect(0, 0, cv.width, cv.height);
    x2.drawImage(cv, 0, 0);
    return x2.getImageData(0, 0, cv.width, cv.height).data;
  };
  window.__diff = function (A, B) {
    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d >= 8) n++;
    }
    return n;
  };
  window.__step = function (t) {
    let left = t;
    while (left > 1e-6) { const d = Math.min(0.02, left); FX.update(d); left -= d; }
  };
  window.__zone = function (o) {
    const z = FX.zones[FX.zones.length - 1];
    return z || null;
  };
  window.__count = function () { return FX.zones.filter(z => z.type === 'zone').length; };
`;

const CASE = `
  window.__one = function (o) {
    FX.clear();
    const pp = Game.playerGroup.position;
    /* 摆在玩家脚下，别往前放：出生点前方 6 格正好是场景遮挡物，
     * 圆盘会被挡住 → 差异 0 像素，看起来像「没画」，其实是「看不见」。 */
    const pos = new THREE.Vector3(pp.x, 0, pp.z);
    const base = window.__grab();
    let fired = 0;
    const g = FX.zone({
      shape: o.shape, pos, radius: o.radius || 4,
      len: o.len, halfW: o.halfW, dir: o.dir, sweep: o.sweep,
      dur: o.dur || 0.8, color: 0xff5522,
      follow: o.follow ? Game.playerGroup : null,
      cb: () => { fired++; },
    });
    /* 取样点：淡入期（前 15%）opacity 只有 0.02 量级，差异像素会是 0 ——
     * 那是设计（避免「啪」一下出现），不是画错了。取 30% 进度再看。 */
    window.__step((o.dur || 0.8) * 0.3);
    const px = window.__diff(base, window.__grab());
    const z = FX.zones.filter(q => q.type === 'zone')[0];
    const kids = g.children.length;
    /* 存活条数必须**现在**取：下面 progAt 会一路推到过期 */
    const alive = window.__count();
    /* rect 朝向：本地 +Y 经四元数转到世界 */
    let fwd = null, midOff = null;
    if (o.shape === 'rect') {
      g.updateMatrixWorld(true);
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion).normalize();
      fwd = { x: +v.x.toFixed(3), z: +v.z.toFixed(3) };
      midOff = { x: +(g.position.x - pos.x).toFixed(2), z: +(g.position.z - pos.z).toFixed(2) };
    }
    /* 进度环半径（sweep 方向） */
    const progAt = (t) => {
      window.__step(t);
      return z.prog ? +z.prog.scale.x.toFixed(3) : null;
    };
    const p0 = progAt(0.02);
    const p1 = progAt(o.dur ? o.dur * 0.25 : 0.2);
    const p2 = progAt(o.dur ? o.dur * 0.22 : 0.2);
    return { px, kids, fired, fwd, midOff, p0, p1, p2, n: alive };
  };
  /* 进度环只取首尾两点：中途取样会被「前面已经推过 30%」污染，
   * 量出来像「原地抖」（第一版就是这么误判的）。 */
  window.__sweep = function (shape, sweep) {
    FX.clear();
    const pp = Game.playerGroup.position;
    FX.zone({ shape, sweep, pos: new THREE.Vector3(pp.x, 0, pp.z), radius: 4, dur: 1 });
    const z = FX.zones.filter(q => q.type === 'zone')[0];
    window.__step(0.03);
    const a = +z.prog.scale.x.toFixed(3);
    window.__step(0.90);
    const b = +z.prog.scale.x.toFixed(3);
    return { a, b, radius: 4 };
  };
  window.__expire = function () {
    const before = { n: window.__count(), calls: 0 };
    Game.renderer.info.reset();
    Game.renderer.render(Game.scene, Game.camera);
    before.calls = Game.renderer.info.render.calls;
    window.__step(3);
    let fired = 0;
    const g = FX.zone({ shape: 'circle', pos: new THREE.Vector3(0, 0, 0), radius: 3, dur: 0.2, cb: () => { fired++; } });
    window.__step(0.5);
    window.__step(0.5);
    Game.renderer.info.reset();
    Game.renderer.render(Game.scene, Game.camera);
    return { fired, n: window.__count(), callsAfter: Game.renderer.info.render.calls, callsBefore: before.calls };
  };
  window.__follow = function () {
    FX.clear();
    /* pp 是 Game.playerGroup.position 的**活引用**：改完再读 pp.x 读到的是
     * 新值，pp.x + 3 会算成 +6（第一版就是这么判错的）。先快照。 */
    const pp = Game.playerGroup.position;
    const x0 = pp.x, z0 = pp.z;
    const g = FX.zone({ shape: 'lock', pos: pp, follow: Game.playerGroup, radius: 2.2, dur: 2 });
    window.__step(0.05);
    const a = { x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2) };
    pp.x = x0 + 3; pp.z = z0 + 4;
    window.__step(0.05);
    const b = { x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2) };
    const want = { x: +(x0 + 3).toFixed(2), z: +(z0 + 4).toFixed(2) };
    return { a, b, want, start: { x: +x0.toFixed(2), z: +z0.toFixed(2) } };
  };
  window.__noFollow = function () {
    FX.clear();
    const pp = Game.playerGroup.position;
    const p0 = new THREE.Vector3(pp.x, 0, pp.z);
    const g = FX.zone({ shape: 'circle', pos: p0, radius: 3, dur: 2 });
    window.__step(0.05);
    Game.playerGroup.position.x = pp.x + 5;
    window.__step(0.05);
    return { moved: +g.position.x.toFixed(2), want: +p0.x.toFixed(2) };
  };
`;

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);
  await p.evaluate(TOOLS);
  const s = await p.evaluate(() => window.__setup());
  ok(s.w > 0 && s.h > 0, '页面与相机就位（' + s.w + '×' + s.h + '）');
  /* 只注入 CASE：再灌一遍 TOOLS 会把 `window.__buf` 清回 null，
   * 后面 `const {cv, x2} = window.__buf` 直接炸「cannot be destructured」。 */
  await p.evaluate(CASE);

  console.log('\n【1】四种形状的构件数 + 出像素');
  const want = { circle: 3, ring: 4, rect: 6, lock: 6 };
  const got = {};
  for (const shape of ['circle', 'ring', 'rect', 'lock']) {
    const r = await p.evaluate(o => window.__one(o), {
      shape, radius: 4, len: 12, halfW: 2.2, dir: { x: 1, z: 0 },
      sweep: shape === 'ring' ? 'out' : (shape === 'circle' ? 'in' : null),
      dur: 0.9,
    });
    got[shape] = r;
    ok(r.kids === want[shape], shape + ' 构件数 ' + want[shape] + ' 件', r.kids);
    ok(r.px > 200, shape + ' 真的出像素（差异 ' + r.px + '）', r.px);
    ok(r.n === 1, shape + ' 只压进一条 zone', r.n);
  }

  console.log('\n【2】rect 朝向：本地 +Y 投影 == dir，位置 == pos + dir·len/2');
  {
    const dirs = [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: 0.6, z: 0.8 }, { x: -0.8, z: 0.6 }];
    for (const d of dirs) {
      const L = Math.hypot(d.x, d.z);
      const ux = d.x / L, uz = d.z / L;
      const r = await p.evaluate(o => window.__one(o), {
        shape: 'rect', len: 12, halfW: 2, dir: d, dur: 0.9,
      });
      const dx = Math.abs(r.fwd.x - ux), dz = Math.abs(r.fwd.z - uz);
      ok(dx < 0.02 && dz < 0.02, '朝向 (' + ux.toFixed(2) + ',' + uz.toFixed(2) + ') 对上', r.fwd);
      ok(Math.abs(r.midOff.x - ux * 6) < 0.05 && Math.abs(r.midOff.z - uz * 6) < 0.05,
        '矩形带中心在 pos + dir·6', r.midOff);
    }
  }

  console.log('\n【3】sweep 方向：in 收 / out 扩（首尾两点）');
  {
    const ci = await p.evaluate(() => window.__sweep('circle', 'in'));
    const rg = await p.evaluate(() => window.__sweep('ring', 'out'));
    ok(ci.a > 3.4 && ci.b < 0.6, 'circle「收」：起点≈半径、终点≈0', ci);
    ok(rg.a < 0.6 && rg.b > 3.4, 'ring「扩」：起点≈0、终点≈半径', rg);
    /* 默认值也要对：circle 不给 sweep 就是 in，ring 不给就是 out */
    const d1 = await p.evaluate(() => window.__sweep('circle', undefined));
    const d2 = await p.evaluate(() => window.__sweep('ring', undefined));
    ok(d1.a > 3.4 && d1.b < 0.6, 'circle 默认 sweep=in', d1);
    ok(d2.a < 0.6 && d2.b > 3.4, 'ring 默认 sweep=out', d2);
  }

  console.log('\n【4】lock 跟随 / 非 lock 不跟随');
  {
    const f = await p.evaluate(() => window.__follow());
    ok(Math.abs(f.a.x - f.start.x) < 0.05 && Math.abs(f.a.z - f.start.z) < 0.05,
      'lock 初始就画在玩家脚下', f);
    ok(Math.abs(f.b.x - f.want.x) < 0.05 && Math.abs(f.b.z - f.want.z) < 0.05,
      'lock 跟着玩家走（+3,+4 到位）', f);
    const nf = await p.evaluate(() => window.__noFollow());
    ok(Math.abs(nf.moved - nf.want) < 0.05, 'circle 不跟随（画在哪留在哪）', nf);
  }

  console.log('\n【5】到点回调恰好一次 + 过期零残留');
  {
    const e = await p.evaluate(() => window.__expire());
    ok(e.fired === 1, '回调只触发一次（不是每帧都调）', e.fired);
    ok(e.n === 0, '全部过期后 zones 归零（没有留残影）', e.n);
    ok(e.callsAfter <= e.callsBefore + 1, 'draw call 回基线', [e.callsBefore, e.callsAfter]);
  }

  console.log('\n【6】错误');
  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(realErrs.length === 0, '全程无 console.error / pageerror', realErrs.slice(0, 4));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
