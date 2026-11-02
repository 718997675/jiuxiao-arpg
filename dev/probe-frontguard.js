#!/usr/bin/env node
/* ============================================================
 * [B16.4] 真机探针：正面格挡（岩甲 / 盾）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-frontguard.js
 *
 * 契约看不出「站在正面打到底少不少血」，只看出代码长什么样。
 * 这一条量的是**数值关系**（都拿同一个 Boss 打同一发 1000，比值说话）：
 *
 *   1. 正面 40%，背面 100%（默认 = 刑天的 150° / 0.4）
 *   2. 侧面 90° 不在 150° 窗口内 → 必须全额
 *   3. arc 改成 240° 后侧面也被挡（arc 是**总**张角，不是半角）
 *   4. mul 改成 0.2 → 正面两成
 *   5. 摘掉之后正面全额（不是留一个挡 0° 的残壳）
 *   6. 老的 `wbBlockFront` 仍然有效（世界 Boss 的 P2 走这条）
 *   7. `turn` 真的在控制转身：1.2 秒的 Boss 在 0.3 秒里只转了一半，
 *      0.1 秒的已经基本转完 —— 这一条决定「绕背」是不是一段能走完的路
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

  /* 造一个"沙包 Boss"：不动、不出招、血厚到打不死、朝向钉在 0（+Z） */
  const setup = await p.evaluate(() => {
    Game.invuln = 999;
    Game.running = true;
    Game._autoCast = false;
    Game.enemies.length = 0;
    Game.mobCap = 0;
    const pg = Game.playerGroup.position;
    const bid = Object.keys(BOSSES)[0];
    const cfg = BOSSES[bid];
    const e = Game.spawnEnemy(null, pg.x + 5, pg.z, false, cfg.level, bid);
    if (!e) return { ok: false };
    e.active = true;
    e.spd = 0; e.atkCd = 9999; e.patternCd = 9999; e.windup = 0; e.charging = 0;
    e.hp = e.maxHp = 1e9;
    e.actor.group.rotation.y = 0;
    e.wbBlockFront = false;
    Game.setGuardFront(e, null);
    return { ok: true, bid, name: cfg.name, radius: e.radius };
  });
  ok(setup.ok, '沙包 Boss 就位（' + (setup.name || '?') + '）', setup);
  if (!setup.ok) { await b.close(); process.exit(1); }

  /* 站在 `ang` 方向上，打一发固定 1000，返回掉了多少血。
   * 全程同步执行 —— 中间不插帧，所以朝向不会自己转走。 */
  const measure = spec => p.evaluate(s => {
    const g = Game;
    const e = g.enemies.find(x => x.boss);
    if (s.guard !== undefined) {
      if (s.guard === null) g.setGuardFront(e, null);
      else g.setGuardFront(e, s.guard);
    }
    e.actor.group.rotation.y = s.rot === undefined ? 0 : s.rot;
    const rot = e.actor.group.rotation.y;
    const pg = g.playerGroup.position;
    const hitAt = ang => {
      pg.x = e.pos.x + Math.sin(ang) * 1.5;
      pg.z = e.pos.z + Math.cos(ang) * 1.5;
      e.hp = 1e9;
      const before = e.hp;
      g.damageEnemy(e, 1000, false, {});
      return before - e.hp;
    };
    return {
      rot,
      front: hitAt(rot),
      back: hitAt(rot + Math.PI),
      side: hitAt(rot + Math.PI / 2),
      quarter: hitAt(rot + Math.PI / 4)
    };
  }, spec);

  console.log('\n【1】默认（150° / 0.4）：正面挡，背面不挡');
  const base = await measure({ guard: {}, rot: 0 });
  const rFront = base.front / base.back;
  ok(Math.abs(rFront - 0.4) < 0.02, '正面只吃四成（比值 ' + rFront.toFixed(3) + '）', base);
  ok(Math.abs(base.side / base.back - 1) < 0.02, '侧面 90° 全额（在 150° 窗口外）', base);
  ok(Math.abs(base.quarter / base.back - 0.4) < 0.02, '45° 斜前方仍算正面（半角 75° 内）', base);

  console.log('\n【2】arc 是总张角：改成 240° 之后连侧面也算正面');
  const wide = await measure({ guard: { arc: 240 }, rot: 0 });
  ok(Math.abs(wide.side / wide.back - 0.4) < 0.02,
    '侧面吃四成（240°/2 = 120° > 90°，说明换算没错）', wide);

  console.log('\n【3】mul 可配：岩甲 −80%');
  const hard = await measure({ guard: { arc: 120, mul: 0.2 }, rot: 0 });
  ok(Math.abs(hard.front / hard.back - 0.2) < 0.02, '正面只吃两成（比值 ' + (hard.front / hard.back).toFixed(3) + '）', hard);
  ok(Math.abs(hard.quarter / hard.back - 0.2) < 0.02, 'arc 120° 时 45° 还在正面（半角 60°）', hard);
  const outside = await measure({ guard: { arc: 120, mul: 0.2 }, rot: 0 });
  ok(Math.abs(outside.side / outside.back - 1) < 0.02, '但 90° 已经在窗口外 → 全额（120° 比 150° 窄，绕背更好绕）', outside);

  console.log('\n【4】摘掉就是真摘掉');
  const off = await measure({ guard: null, rot: 0 });
  ok(Math.abs(off.front / off.back - 1) < 0.02, '正面全额（残壳会让正面永远是 0.4）', off);

  console.log('\n【5】老的 wbBlockFront 仍然有效');
  const legacy = await p.evaluate(() => {
    const g = Game;
    const e = g.enemies.find(x => x.boss);
    g.setGuardFront(e, null);
    e.wbBlockFront = true;
    e.actor.group.rotation.y = 0;
    const pg = g.playerGroup.position;
    const hitAt = ang => {
      pg.x = e.pos.x + Math.sin(ang) * 1.5;
      pg.z = e.pos.z + Math.cos(ang) * 1.5;
      e.hp = 1e9; const b0 = e.hp;
      g.damageEnemy(e, 1000, false, {});
      return b0 - e.hp;
    };
    const front = hitAt(0), back = hitAt(Math.PI);
    const spec = g.frontGuardOf(e);
    e.wbBlockFront = false;
    return { front, back, arc: spec && spec.arc, mul: spec && spec.mul };
  });
  ok(Math.abs(legacy.front / legacy.back - 0.4) < 0.02, '世界 Boss 的 P2 还是四成（数值没变）', legacy);
  ok(legacy.arc === 150 && legacy.mul === 0.4, '退到的就是默认那三个数', legacy);

  console.log('\n【6】turn 真的在控制转身速度');
  const turn = await p.evaluate(() => {
    const g = Game;
    const e = g.enemies.find(x => x.boss);
    const pg = g.playerGroup.position;
    /* 把玩家放到 Boss 背后（相对 rotation.y = 0 的 +Z 面），
     * 然后同步推 6 个 0.05 秒的 AI 帧 = 0.3 秒模拟时间。
     * 同步调用是为了让两次测量的"帧数"完全一样 —— 靠等真实时间会飘。 */
    const run = turnSec => {
      g.setGuardFront(e, { turn: turnSec });
      e.actor.group.rotation.y = 0;
      e.windup = 0; e.atkCd = 9999; e.patternCd = 9999;
      pg.x = e.pos.x; pg.z = e.pos.z - 1.5;
      const pp = new THREE.Vector3(pg.x, 0, pg.z);
      for (let i = 0; i < 6; i++) g.updateBossAI(e, 0.05, 1.5, pp);
      return Math.abs(e.actor.group.rotation.y);
    };
    const slow = run(1.2);
    const fast = run(0.1);
    const dflt = run(0.48);
    g.setGuardFront(e, null);
    return { slow, fast, dflt };
  });
  ok(turn.slow < 2.0, '1.2 秒的 Boss 在 0.3 秒里只转了一半（' + turn.slow.toFixed(2) + ' rad）', turn);
  ok(turn.fast > 2.8, '0.1 秒的基本转完（' + turn.fast.toFixed(2) + ' rad）', turn);
  ok(turn.slow < turn.fast * 0.75, '慢的确实比快的慢一截 —— 绕背窗口是它让出来的', turn);
  ok(turn.dflt > turn.slow && turn.dflt < turn.fast,
    '默认 0.48 秒落在两者之间（' + turn.dflt.toFixed(2) + ' rad）—— 老数值的手感没变', turn);

  console.log('\n【7】全程零报错');
  ok(errs.length === 0, '没有控制台错误', errs.slice(0, 4));

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
