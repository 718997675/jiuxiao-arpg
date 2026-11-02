#!/usr/bin/env node
/* ============================================================
 * [B16.3 / B16.5] 真机探针：可破坏目标（图腾 / 卵囊）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-destructible.js
 *
 * 契约（test-destructible.js）只看代码长什么样，看不到「接上去之后
 * 它到底是站着的柱子还是一只会追人的怪」。这一条量七件事：
 *
 *   1. 立得起来，血量 / 血条 / 读秒环齐全；
 *   2. **它不动、不打人**（复用 enemies 最容易踩的坑）；
 *   3. 打掉走 onDeath，且**不给经验、不掉东西**；
 *   4. 到点走 onExpire，且**只走一次**（守卫错了就会双触发）；
 *   5. 不占同屏怪名额（否则「场上只有图腾，怪不刷了」）；
 *   6. 毒能烧掉它（DoT 段没有被早退吃掉）；
 *   7. 死后 3 秒从 enemies 里清干净。
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

  /* 公共环境：无敌（别被真怪打断）、清场、关自动施法 */
  await p.evaluate(() => {
    Game.invuln = 999;
    Game.running = true;
    Game._autoCast = false;
    Game.enemies.length = 0;
    Game.mobCap = 0;
  });

  console.log('\n【1】立得起来');
  const made = await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const e = Game.spawnDestructible({ x: pg.x + 6, z: pg.z, hp: 300, name: '试炼图腾', ttl: 6 });
    return {
      exists: !!e,
      inList: Game.enemies.indexOf(e) >= 0,
      hp: e && e.hp, maxHp: e && e.maxHp,
      hasBar: !!(e && e.bar),
      hasRing: !!(e && e.destructible && e.destructible.ring),
      boss: e && e.boss,
      ttl: e && e.destructible.ttl,
      y: e && e.actor.group.position.y
    };
  });
  ok(made.exists && made.inList, '进 enemies（伤害 / 溅射 / 锁定免费继承）', made);
  ok(made.hp === 300 && made.maxHp === 300, '血量就是传进来的那个数', made);
  ok(made.hasBar, '有血条', made);
  ok(made.hasRing, '有读秒环（ttl > 0 才有）', made);
  ok(made.boss === false, '不是 Boss（不抢顶部血条）', made);

  const plain = await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const e = Game.spawnDestructible({ x: pg.x - 6, z: pg.z, hp: 50, ttl: 0, quiet: true });
    return { hasRing: !!(e && e.destructible.ring), ttl: e && e.destructible.ttl };
  });
  ok(plain.hasRing === false, 'ttl = 0 时没有读秒环（不是所有目标都有期限）', plain);

  console.log('\n【2】它不动、也不打人');
  const idle = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const list = Game.enemies.filter(e => e.destructible && !e.dead);
    const a = list[0];
    const p0 = { x: a.pos.x, z: a.pos.z };
    const hp0 = Game.state.hp;
    const aggro0 = !!a.aggro;
    /* 把人挪到它脸上，站 1.2 秒 */
    const pg = Game.playerGroup.position;
    const back = { x: pg.x, z: pg.z };
    pg.x = a.pos.x + 1.0; pg.z = a.pos.z;
    await wait(1200);
    const out = {
      moved: Math.hypot(a.pos.x - p0.x, a.pos.z - p0.z),
      hpLost: hp0 - Game.state.hp,
      aggro: !!a.aggro, aggro0
    };
    pg.x = back.x; pg.z = back.z;
    return out;
  });
  ok(idle.moved < 0.05, '位置纹丝不动（' + idle.moved.toFixed(3) + ' 码）', idle);
  ok(idle.hpLost <= 0, '贴脸站着也不掉血（它没有攻击）', idle);
  ok(idle.aggro === false, '不会被激怒', idle);

  console.log('\n【3】打掉：走 onDeath，不给经验不掉东西');
  const killed = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const a = Game.enemies.filter(e => e.destructible && !e.dead)[0];
    let fired = 0;
    a.destructible.onDeath = () => { fired++; };
    const xp0 = Game.state.exp || 0, lv0 = Game.state.level;
    const gold0 = Game.state.gold || 0;
    const loot0 = (Game.loot || []).length;
    Game.damageEnemy(a, a.maxHp * 2, false, {});
    await wait(400);
    return {
      fired, dead: a.dead, hp: a.hp,
      xpGain: (Game.state.exp || 0) - xp0,
      lvGain: Game.state.level - lv0,
      goldGain: (Game.state.gold || 0) - gold0,
      lootGain: (Game.loot || []).length - loot0
    };
  });
  ok(killed.fired === 1, 'onDeath 被调用一次', killed);
  ok(killed.dead === true && killed.hp === 0, '实体标记为已毁', killed);
  ok(killed.xpGain === 0, '不给经验（接上就是无限刷级的路）', killed);
  ok(killed.lvGain === 0, '不升级', killed);
  ok(killed.goldGain <= 0, '不掉金币', killed);
  ok(killed.lootGain <= 0, '不生成掉落', killed);

  console.log('\n【4】到点：走 onExpire，且只走一次');
  const expired = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const pg = Game.playerGroup.position;
    let exp = 0, dth = 0;
    const a = Game.spawnDestructible({
      x: pg.x + 3, z: pg.z - 3, hp: 999, ttl: 0.5, quiet: true,
      onExpire: () => { exp++; },
      onDeath: () => { dth++; }
    });
    let spun = 0;
    while (!a.dead && spun < 400) { await wait(50); spun++; }
    const t1 = { exp, dth };
    await wait(600);                       // 再等一会儿，看有没有第二次
    Game.damageEnemy(a, 99999, false, {}); // 已经死了，再补一刀不许再回调
    await wait(150);
    return { t1, exp, dth, spun, ttlLeft: a.destructible.ttl };
  });
  ok(expired.t1.exp === 1, '读秒归零调 onExpire 一次', expired);
  ok(expired.t1.dth === 0, '到点不算「被打掉」（两条路径不串）', expired);
  ok(expired.exp === 1 && expired.dth === 0, '之后再等 + 补一刀都不会再触发（守卫有效）', expired);
  ok(expired.ttlLeft === 0, 'ttl 停在 0，不会跑成负数', expired);

  console.log('\n【5】不占同屏怪名额');
  const cap = await p.evaluate(async () => {
    Game.enemies.length = 0;
    Game.mobCap = 1;
    const pg = Game.playerGroup.position;
    for (let i = 0; i < 3; i++) {
      Game.spawnDestructible({ x: pg.x + 4 + i, z: pg.z + 4, hp: 50, ttl: 0, quiet: true });
    }
    const kind = Object.keys(MONSTERS)[0];
    /* 第二只必须被名额挡住（说明上限仍在真怪身上生效） */
    const m1 = Game.spawnEnemy(kind, pg.x - 5, pg.z, false, Game.state.level);
    const m2 = Game.spawnEnemy(kind, pg.x - 7, pg.z, false, Game.state.level);
    const totems = Game.enemies.filter(e => e.destructible && !e.dead).length;
    Game.mobCap = 0;
    return { m1: !!m1, m2: !!m2, totems };
  });
  ok(cap.totems === 3, '三个图腾立着', cap);
  ok(cap.m1 === true, '名额还有 1，真怪生成成功（图腾没把名额吃光）', cap);
  ok(cap.m2 === null || cap.m2 === undefined || cap.m2 === false, '第二只真怪被上限挡住（上限本身仍然有效）', cap);

  console.log('\n【6】毒 / DoT 能烧掉它');
  const burn = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    Game.enemies.length = 0;
    const pg = Game.playerGroup.position;
    const a = Game.spawnDestructible({ x: pg.x + 5, z: pg.z, hp: 5000, ttl: 0, quiet: true });
    const hp0 = a.hp;
    a.poisonT = 2.4; a.poisonDmg = 120;
    let spun = 0;
    while (a.hp >= hp0 && spun < 200) { await wait(50); spun++; }
    return { hp0, hp: a.hp, dropped: hp0 - a.hp, dead: a.dead };
  });
  ok(burn.dropped > 0, '中毒跳伤真的掉血（掉 ' + Math.round(burn.dropped) + '）', burn);
  ok(burn.dead === false, '血还厚的时候不会被一跳烧死', burn);

  console.log('\n【7】死后从 enemies 里清干净');
  const clean = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    Game.enemies.length = 0;
    const pg = Game.playerGroup.position;
    const a = Game.spawnDestructible({ x: pg.x + 6, z: pg.z + 2, hp: 40, ttl: 0, quiet: true });
    Game.damageEnemy(a, 9999, false, {});
    const gone0 = Game.enemies.indexOf(a) < 0;
    let spun = 0;
    while (Game.enemies.indexOf(a) >= 0 && spun < 600) { await wait(50); spun++; }
    return { gone0, gone: Game.enemies.indexOf(a) < 0, spun, sceneHas: !!a.actor.group.parent };
  });
  ok(clean.gone0 === false, '刚死时还留在表里（要演倒下）', clean);
  ok(clean.gone === true, '3 秒后从 enemies 移除', clean);
  ok(clean.sceneHas === false, '也从场景里摘掉了（不是只从数组删）', clean);

  console.log('\n【8】全程零报错');
  ok(errs.length === 0, '没有控制台错误', errs.slice(0, 4));

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
