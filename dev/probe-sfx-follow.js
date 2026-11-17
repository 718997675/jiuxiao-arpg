#!/usr/bin/env node
/* ============================================================
 * [U13] sfx-follow · 真机验收
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-sfx-follow.js
 *
 * 静态契约（test-sfx-follow.js）判「表/接线对不对」；这一份判
 * **接进游戏之后，人走特效真的跟着走**。量六件事：
 *   1  放 whirl（旋风斩）后 SKFX 场景里出现随人 mesh（斧头/气流）
 *   2  玩家平移一段后，这些 mesh 的位移 ≈ 玩家位移（跟随成立）
 *   3  放 firewall（地面部署）后同样移动玩家，mesh 位移 ≈ 0（不该跟的不跟）
 *   4  随人窗口到时自动结束（1.2s 后不再跟随）
 *   5  换图后第一发不被上一张图的位移污染
 *   6  全程零 console.error / pageerror
 *
 * 坑：SKFX.update 在真游戏循环里逐帧跑，位移是「增量」累积的 ——
 * 必须等几帧再读数（wait 200ms），不能放完技能立刻读。
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} Game.startNew('warrior', 'U13'); });
  await wait(500);

  /* 页面工具：读 SKFX.scene 里非共享对象的位置（用 index 当 id，顺序在同一次实验里不变） */
  await page.evaluate(() => {
    window.__snap = function () {
      const out = [];
      const kids = SKFX.scene.children;
      for (let i = 0; i < kids.length; i++) {
        const o = kids[i];
        if (o.userData && o.userData.shared) continue;
        out.push({ i, x: +o.position.x.toFixed(3), z: +o.position.z.toFixed(3) });
      }
      return { n: out.length, list: out, active: SKFX.active, px: +Game.playerGroup.position.x.toFixed(3), pz: +Game.playerGroup.position.z.toFixed(3) };
    };
    window.__move = function (dx, dz) {
      const p = Game.playerGroup.position;
      p.x += dx; p.z += dz;
    };
    window.__cast = function (id) {
      SKFX.clear();
      Game.playerGroup.position.set(0, 0, 0);
      Game.syncSfxActors();
      SKFX.play(id, { x: 0, z: 0, aim: new THREE.Vector3(0, 0, 1), dir: new THREE.Vector3(0, 0, 1), radius: 4 });
      return window.__snap();
    };
  });

  console.log('\n【1】放旋风斩 → 随人 mesh 出现');
  const whirl0 = await page.evaluate(() => window.__cast('whirl'));
  await wait(150);
  const whirlA = await page.evaluate(() => window.__snap());
  ok(whirlA.n > 0 && whirlA.active > 0,
    'whirl 真机摆出了 mesh（斧头/气流）', { n: whirlA.n, active: whirlA.active });

  console.log('\n【2】玩家平移 → 随人 mesh 跟着走');
  const moved = await page.evaluate(() => { window.__move(6, 4); return window.__snap(); });
  await wait(250);
  const whirlB = await page.evaluate(() => window.__snap());
  /* 对同一批 index 的对象算位移；玩家位移 = (6,4) */
  const deltas = [];
  for (const a of whirlA.list) {
    const b = whirlB.list.find(x => x.i === a.i);
    if (b) deltas.push({ dx: +(b.x - a.x).toFixed(2), dz: +(b.z - a.z).toFixed(2) });
  }
  const followed = deltas.filter(d => Math.abs(d.dx - 6) < 0.5 && Math.abs(d.dz - 4) < 0.5);
  ok(followed.length > 0 && followed.length === deltas.length,
    'whirl 的所有随人 mesh 位移 ≈ 玩家位移 (6,4)',
    { total: deltas.length, followed: followed.length, sample: deltas.slice(0, 5) });

  console.log('\n【3】地面部署不该跟（对照组：firewall）');
  const fw0 = await page.evaluate(() => window.__cast('firewall'));
  await wait(150);
  const fwA = await page.evaluate(() => window.__snap());
  await page.evaluate(() => window.__move(6, 4));
  await wait(250);
  const fwB = await page.evaluate(() => window.__snap());
  const fwDeltas = [];
  for (const a of fwA.list) {
    const b = fwB.list.find(x => x.i === a.i);
    if (b) fwDeltas.push({ dx: +(b.x - a.x).toFixed(2), dz: +(b.z - a.z).toFixed(2) });
  }
  const stayed = fwDeltas.filter(d => Math.abs(d.dx) < 0.5 && Math.abs(d.dz) < 0.5);
  ok(fwA.n > 0 && stayed.length === fwDeltas.length,
    'firewall 的 mesh 留在原地（地面部署不跟人）',
    { total: fwDeltas.length, stayed: stayed.length, sample: fwDeltas.slice(0, 5) });

  console.log('\n【4】随人窗口到时自动结束');
  const expire = await page.evaluate(() => {
    SKFX.clear();
    Game.playerGroup.position.set(0, 0, 0);
    Game.syncSfxActors();
    SKFX.play('whirl', { x: 0, z: 0, radius: 4 });
    return window.__snap();
  });
  await wait(2200);   /* whirl 窗口 1.2s；真机帧率不稳，留够余量 */
  /* 窗口结束后再移玩家：mesh 应不再跟随（已经在过期时被 clear 或停跟） */
  const beforeExpireMove = await page.evaluate(() => window.__snap());
  await page.evaluate(() => window.__move(5, 0));
  await wait(250);
  const afterExpireMove = await page.evaluate(() => window.__snap());
  const expDeltas = [];
  for (const a of beforeExpireMove.list) {
    const b = afterExpireMove.list.find(x => x.i === a.i);
    if (b) expDeltas.push(+(b.x - a.x).toFixed(2));
  }
  /* 窗口过期后：旧 mesh 若已被 clear 消失（n=0）也算过；若还在则不跟（dx≈0） */
  const expired = afterExpireMove.n === 0 || expDeltas.every(d => Math.abs(d) < 0.5);
  ok(expired, 'whirl 窗口 1.2s 后不再跟随（过期 mesh 已清或停跟）',
    { before: beforeExpireMove.n, after: afterExpireMove.n, deltas: expDeltas.slice(0, 5) });

  console.log('\n【5】换图后第一发不被旧位移污染');
  const crossMap = await page.evaluate(() => {
    Game.loadMap('forest');
    Game.playerGroup.position.set(0, 0, 0);
    Game.syncSfxActors();
    SKFX.play('whirl', { x: 0, z: 0, radius: 4 });
    return window.__snap();
  });
  await wait(180);
  const cmB = await page.evaluate(() => window.__snap());
  const nearOrigin = cmB.list.every(o => Math.abs(o.x) < 12 && Math.abs(o.z) < 12);
  ok(nearOrigin, '换图后第一发 whirl 的 mesh 都在出生点附近（没被上一张图位移推走）',
    cmB.list.slice(0, 5));

  console.log('\n【6】错误');
  ok(errs.length === 0, '全程零 console.error / pageerror', errs.slice(0, 5));

  await browser.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
