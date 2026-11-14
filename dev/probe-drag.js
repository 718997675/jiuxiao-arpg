#!/usr/bin/env node
/* ============================================================
 * B16 第 2 件真机探针：玩家的「被拖拽」状态位
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-drag.js
 *
 * 这条状态位是 6 只 Boss 的硬前置（魂锁拖拽 / 吞咽 / 摆渡 / 尾缚…），
 * 而它最容易做错的地方不是「拖不动」，是**拖住了还能自己走**：
 * 玩家按着方向键，脚本位移和输入位移同时往 pg.position 上写，
 * 结果是「被拖着走的同时还能侧移」—— 看起来像没生效。
 *
 * 量六件事：
 *   1. 真的从 A 挪到了 B
 *   2. 全程不偏离 A→B 这条线（输入被完全屏蔽，不是"减半"）
 *   3. 按住 W 也改不了终点
 *   4. 冲刺能挣脱
 *   5. 状态栏有「被拖拽」这一条
 *   6. 死亡 / 换图会清掉，不会把尸体拖到别的图上
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

  /* 公共环境：无敌 + 关自动施法，免得被怪打断 / 被反击牵走视线 */
  await p.evaluate(() => {
    Game.invuln = 999;
    Game.running = true;
    Game._autoCast = false;
    Game.enemies.length = 0;
    Game.mobCap = 0;
  });

  console.log('\n【1】从 A 拖到 B');
  const drag = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pg = Game.playerGroup.position;
    const x0 = pg.x, z0 = pg.z;
    const tx = x0 + 4, tz = z0 + 4;
    Game.dragPlayer(tx, tz, 0.6);
    const samples = [];
    let spun = 0;
    while (Game.pull && spun < 80) {
      await wait(80);
      samples.push({ x: pg.x, z: pg.z });
      spun++;
    }
    return {
      x0, z0, tx, tz,
      end: { x: pg.x, z: pg.z },
      pullAfter: Game.pull,
      samples,
      realMs: spun * 80,
    };
  });
  const dEnd = Math.hypot(drag.end.x - drag.tx, drag.end.z - drag.tz);
  ok(dEnd < 0.6, '终点对得上（差 ' + dEnd.toFixed(2) + ' 码，含碰撞体推出）', drag);
  ok(drag.pullAfter === null, '走完自己收尾（不留在场上）', drag);

  /* 轨迹贴线：每个采样点到 A→B 线段的垂距 */
  const vx = drag.tx - drag.x0, vz = drag.tz - drag.z0;
  const vl = Math.hypot(vx, vz) || 1;
  let maxOff = 0;
  for (const s of drag.samples) {
    const dx = s.x - drag.x0, dz = s.z - drag.z0;
    const proj = (dx * vx + dz * vz) / vl;
    const off = Math.abs(dx * (-vz) / vl + dz * vx / vl);
    if (proj > 0.2 && proj < vl - 0.2) maxOff = Math.max(maxOff, off);
  }
  ok(maxOff < 0.25, '全程贴着 A→B 的直线（最大偏离 ' + maxOff.toFixed(2) + ' 码）', drag.samples.slice(0, 6));

  console.log('\n【2】按住 W 也改不了终点');
  const held = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pg = Game.playerGroup.position;
    const sx = pg.x, sz = pg.z;
    const tx = sx - 3, tz = sz + 3;
    Game.keys['w'] = true;                 /* 一直按着前进 */
    Game.dragPlayer(tx, tz, 0.6);
    let spun = 0;
    while (Game.pull && spun < 80) { await wait(80); spun++; }
    Game.keys['w'] = false;
    return { tx, tz, end: { x: pg.x, z: pg.z } };
  });
  const dHeld = Math.hypot(held.end.x - held.tx, held.end.z - held.tz);
  ok(dHeld < 0.6, '按着 W 终点仍然落在目标上（差 ' + dHeld.toFixed(2) + ' 码）', held);

  console.log('\n【3】冲刺能挣脱');
  const dash = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pg = Game.playerGroup.position;
    const sx = pg.x, sz = pg.z;
    Game.dragPlayer(sx + 6, sz + 6, 1.2);
    await wait(150);
    const midPull = !!Game.pull;
    Game.dashT = 0.18;                     /* 等价于玩家按下冲刺 */
    await wait(150);
    return { midPull, after: Game.pull };
  });
  ok(dash.midPull, '拖拽中（还没到终点）', dash);
  ok(dash.after === null, '按冲刺立刻挣脱（pull 被清掉）', dash);

  console.log('\n【4】状态栏');
  const badge = await p.evaluate(async () => {
    const pg = Game.playerGroup.position;
    Game.dragPlayer(pg.x + 5, pg.z + 5, 3);
    /* 真正的出口叫 statusBuffs（`playerDebuffs` 是我一开始猜错的） */
    const list = typeof Game.statusBuffs === 'function' ? Game.statusBuffs() : [];
    const names = (list || []).map(o => o.name);
    const entry = (list || []).find(o => o.name === '被拖拽');
    Game.pull = null;
    return { names, desc: entry ? entry.desc : null };
  });
  ok(badge.names.indexOf('被拖拽') >= 0, '状态栏出现「被拖拽」', badge.names);
  ok(/挣脱/.test(badge.desc || ''), '文案里说了怎么挣脱（冲刺）', badge);

  console.log('\n【5】死亡会清掉（换图那条由 test-fx2 静态钉住）');
  const clear = await p.evaluate(async () => {
    const pg = Game.playerGroup.position;
    Game.dragPlayer(pg.x + 8, pg.z, 5);
    const before = !!Game.pull;
    Game.die();
    return { before, afterDie: Game.pull };
  });
  ok(clear.before, '死之前确实在被拖', clear);
  ok(clear.afterDie === null, '死亡当场清掉（尸体不会被拖到复活点）', clear);

  console.log('\n【6】全程零报错');
  ok(errs.length === 0, '没有控制台错误', errs.slice(0, 4));

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
