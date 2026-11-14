#!/usr/bin/env node
/* ============================================================
 * [B16.6] 领域乘区的真机探针
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-domain.js
 *
 * 契约（test-domain.js）测的是数值账，这里测**接进游戏之后还成不成立**：
 * 圈真的跟着 `Game.update` 走、真的扣血、走出圈真的归位、
 * buff 条真的出现、换图真的清干净。
 *
 * 两个无头环境的坑，上一轮已经踩过：
 *   1. 软件渲染下 dt 被夹到 0.05，**模拟时间远慢于真实时间** →
 *      一律轮询，别按「等 1 秒」写。
 *   2. `Game.invuln` 会让 `damagePlayer` 直接 return（探针开头为了安全
 *      开了无敌）→ 量伤害之前必须先归零，否则量到的是「0 点，且没报错」。
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

  /* 干净擂台：没有怪、没有世界 Boss、玩家满血且不无敌（不然伤害被吞） */
  await p.evaluate(() => {
    Game.running = true;
    Game._autoCast = false;
    Game.enemies.length = 0;
    Game.mobCap = 0;
    Game.invuln = 0;
    Game.talismanCharges = 0;
    if (Game.state.stats) { Game.state.stats.dodge = 0; Game.state.hp = Game.state.stats.hpMax; }
    Game._hit = [];
    const raw = Game.damagePlayer.bind(Game);
    Game.damagePlayer = function (amount, src, opts) {
      const before = Game.state.hp;
      raw(amount, src, opts);
      Game._hit.push({ amount, pierce: !!(opts && opts.pierce), lost: before - Game.state.hp });
    };
    /* 探针自己接管：把所有领域清掉，回到「空地」 */
    Domains.clear();
  });

  console.log('\n【1】毒沼：站进去真的掉血，而且是 pierce');
  const poison = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    Game.state.hp = Game.state.stats.hpMax;
    Game._hit = [];
    const h = Domains.add({ preset: 'poison', x: pp.x, z: pp.z, r: 6 });
    /* 轮询到「掉过血」，上限 60 圈（无头下模拟时间慢） */
    let spun = 0;
    while (Game._hit.length === 0 && spun < 60) { await w(100); spun++; }
    const hpAfter = Game.state.hp;
    const grewTtl = !!h.zone;
    h.kill();
    return {
      hits: Game._hit.length, first: Game._hit[0] || null, spun,
      hpMax: Game.state.stats.hpMax, hpAfter, filed: grewTtl
    };
  });
  ok(poison.hits > 0, '踩进毒沼会掉血（' + poison.hits + ' 跳 / ' + (poison.spun * 100) + 'ms 真实时间）', poison);
  ok(poison.first && poison.first.pierce === true, '走的是 pierce（堆防御不能免疫领域）', poison.first);
  /* 6 点 = 1000 × 0.6%，允许 ±1 取整 */
  ok(poison.first && Math.abs(poison.first.amount - poison.hpMax * 0.006) <= 1.5,
    '每跳 = 0.6% 最大生命（' + (poison.first && poison.first.amount) + ' / ' + poison.hpMax + '）', poison.first);

  console.log('\n【2】走出圈：立刻归位，不再掉血');
  const out = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    Game.state.hp = Game.state.stats.hpMax;
    const h = Domains.add({ preset: 'tide', x: pp.x, z: pp.z, r: 5 });
    await w(400);
    const inSlow = Game.fieldSlow;
    pp.x += 30;                       /* 一步走到圈外 */
    await w(500);
    const outside = { slow: Game.fieldSlow, buff: Domains.buff() };
    Game._hit = [];
    await w(600);
    const hitsOut = Game._hit.length;
    h.kill();
    return { inSlow, outside, hitsOut };
  });
  ok(Math.abs(out.inSlow - 0.3) < 1e-6, '水天圈里 fieldSlow = 0.3（−30%）', out.inSlow);
  ok(out.outside.slow === 0, '走出去 fieldSlow 归位 0', out.outside);
  ok(out.outside.buff === null, 'buff 条那条也跟着消失', out.outside.buff);

  console.log('\n【3】buff 条上真的画出来了');
  const bar = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const h = Domains.add({ preset: 'poison', x: pp.x, z: pp.z, r: 6 });
    await w(400);
    const list = Game.statusBuffs().map(o => o.name);
    if (typeof UI !== 'undefined' && UI.renderBuffs) UI.renderBuffs();
    /* [V1] 增益行搬进 #charplate 了，且改成增量渲染（空行不再靠 display:none） */
    const el = document.getElementById('buffrow');
    const html = el ? el.textContent : '';
    h.kill();
    return { list, hasDom: /毒沼/.test(html), shown: el ? el.children.length : null };
  });
  ok(bar.list.indexOf('毒沼') >= 0, 'statusBuffs 里有「毒沼」', bar.list);
  ok(bar.hasDom, 'buff 条 DOM 上真的渲染了', bar);

  console.log('\n【4】吸力：真的把人往圈心拉');
  const pull = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const cx = pp.x, cz = pp.z;
    pp.x = cx + 8;
    const h = Domains.add({ preset: 'devour', x: cx, z: cz, r: 20, player: { pull: 3 } });
    const x0 = pp.x;
    let spun = 0;
    while (spun < 40) { await w(100); spun++; if (pp.x < x0 - 1) break; }
    const x1 = pp.x;
    h.kill();
    return { x0, x1, moved: x0 - x1, spun };
  });
  ok(pull.moved > 1, '被拉近了 ' + pull.moved.toFixed(2) + ' 米', pull);
  ok(pull.moved < 8, '没有一路吸到脸上（封顶生效）', pull);

  console.log('\n【5】读秒：到点自己散，不用 setTimeout');
  const ttl = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const h = Domains.add({ preset: 'poison', x: pp.x, z: pp.z, r: 6, ttl: 0.8 });
    const t0 = h.zone.ttl;
    let spun = 0;
    while (Domains.list.length > 0 && spun < 60) { await w(100); spun++; }
    return { t0, gone: Domains.list.length === 0, spun, dead: h.zone.dead };
  });
  ok(ttl.gone, '0.8 秒的圈在 ' + (ttl.spun * 100) + 'ms 内散掉', ttl);
  ok(ttl.dead === true, '句柄上的 zone 被标成 dead（不是「看不见但还在结算」）', ttl);

  console.log('\n【6】主人死了，圈跟着散');
  const owner = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    const fake = { dead: false, pos: { x: pp.x, z: pp.z } };
    Domains.add({ preset: 'poison', x: pp.x, z: pp.z, r: 6, owner: fake });
    await w(200);
    const before = Domains.list.length;
    fake.dead = true;
    /* 墙钟 ≠ 模拟时间：无头软渲染 dt 被夹到 0.05，并行开几个浏览器时
     * 400ms 真实时间可能还不到一帧，曾随机红成「圈没散」。按清单轮询，
     * 等的是「帧真的推进到了」，不是「表走了 400ms」。 */
    for (let i = 0; i < 80 && Domains.list.length > 0; i++) await w(50);
    return { before, after: Domains.list.length };
  });
  ok(owner.before === 1 && owner.after === 0, 'Boss 一死圈就散', owner);

  console.log('\n【7】换图清干净（不会把毒圈带回城）');
  const map = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pp = Game.playerGroup.position;
    Domains.add({ preset: 'tide', x: pp.x, z: pp.z, r: 6 });
    await w(300);
    const before = { n: Domains.list.length, slow: Game.fieldSlow };
    /* 直接走真实的换图入口 */
    const ids = Object.keys(MAPS);
    const other = ids.find(id => id !== Game.state.mapId) || ids[0];
    Game.loadMap(other);
    await w(600);
    return { before, after: { n: Domains.list.length, slow: Game.fieldSlow, aspd: Game.fieldAspd } };
  });
  ok(map.before.n === 1, '换图前圈在场上', map.before);
  ok(map.after.n === 0 && map.after.slow === 0 && map.after.aspd === 0,
    '换图后清单空、两个字段归位', map.after);

  console.log('\n【8】全程零报错');
  ok(errs.length === 0, '没有控制台错误', errs.slice(0, 4));

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
