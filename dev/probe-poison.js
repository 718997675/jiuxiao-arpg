#!/usr/bin/env node
/* ============================================================
 * 技能 P0·毒 真机探针：蚀骨层数真的会涨、符真的会爆
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-poison.js
 *
 * 契约（test-poison）证明的是「源码里写了加层 / 引爆」；
 * 这一份证明的是**按下去之后层数真的变了**。两者缺一不可：
 * 源码写对了但被某个提前 return 挡住，grep 一样是绿的。
 *
 * 量五件事：
 *   1. 毒雾每跳 +1 层（3 跳之后层数 ≥ 3）
 *   2. 层数不超上限（POISON_RULES.maxStacks）
 *   3. 符命中带层目标 → 引爆一次（`explodeAt` 收到 `poisonburst`）且层数清零
 *   4. 不带层的毒伤（= 别的职业注毒走的同一条路）永远不叠层
 *   5. 雾停了以后层数会自己掉光（断档清零），不是永久挂着
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
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1500);

  /* ---------------- 一、道士：毒雾叠层 ---------------- */
  console.log('一、蚀骨毒雾每一跳 +1 层');
  const stack = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    Game.startNew('taoist', '毒');
    /* 角色等级要够：`skillUnlocked` 判的是 `state.level >= SKILLS[id].unlock`。
     * 写 1 级的话 castSkill 会静默拦在「尚未领悟」，探针就量到一坨 0。 */
    Game.state.level = 30;
    Game.state.mp = 999999; Game.state.hp = Game.state.hpMax;
    Game.cooldowns = {}; Game.invuln = 999; Game.mobCap = 200;
    Game.state.skills = { poison: { lv: 1 } };
    try { Game.recalc(); } catch (e) { }
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    /* 坦克木桩：血厚到打不死，位置就在身前 3 码 */
    const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x, pp.z + 3);
    foe.hp = foe.maxHp = 1e9; foe.baseHp = 1e9;
    Game.aimPoint = new THREE.Vector3(foe.pos.x, 0, foe.pos.z);
    Game.aimDir = new THREE.Vector3(0, 0, 1);
    Game.lastMoveDir = { x: 0, z: 1 };
    Game.running = true;
    Game.castSkill('poison');
    const seen = [];
    for (let i = 0; i < 6; i++) { await wait(420); seen.push(foe.poisonN || 0); }
    return { seen, max: POISON_RULES.maxStacks, n: foe.poisonN || 0, hp: foe.hp };
  });
  ok(stack.seen.some(v => v >= 2), '毒雾每跳 +1 层（3 跳内到 2 层以上）', stack.seen);
  ok(stack.n <= stack.max, '层数不超过上限 ' + stack.max, stack.n);

  /* ---------------- 二、符引爆 ---------------- */
  console.log('\n二、符命中带层目标 → 引爆并清零');
  const burst = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    /* 上一节留下的雾还在跳，层数应该在 4~5 层。先把「爆过几次」记下来 */
    const foe = Game.enemies.find(e => !e.dead && e.hp > 1e8) || Game.enemies[0];
    const before = foe.poisonN || 0;
    const oldEx = Game.explodeAt;
    const hits = [];
    Game.explodeAt = function (pos, radius, dmg, color, big, silent, tag, elem) {
      hits.push({ tag: tag, elem: elem, dmg: Math.round(dmg || 0) });
      return oldEx.apply(this, arguments);
    };
    Game.state.level = 30;
    Game.state.skills = { talisman: { lv: 1 } };
    try { Game.recalc(); } catch (e) { }
    Game.cooldowns = {};
    Game.aimPoint = new THREE.Vector3(foe.pos.x, 0, foe.pos.z);
    Game.aimDir = new THREE.Vector3(0, 0, 1);
    Game.castSkill('talisman');
    await wait(1400);
    Game.explodeAt = oldEx;
    const pb = hits.filter(h => h.tag === 'poisonburst');
    return { before: before, after: foe.poisonN || 0, pb: pb, all: hits.length };
  });
  ok(burst.before >= 2, '引爆前目标身上有层数（' + burst.before + ' 层）', burst.before);
  ok(burst.pb.length >= 1, '符命中触发了 poisonburst', burst.pb);
  ok(burst.pb.length >= 1 && burst.pb[0].elem === 'poison', '毒爆按毒的口径结算（过毒抗）',
    burst.pb[0]);
  ok(burst.after === 0, '引爆后层数清零', burst.after);

  /* ---------------- 三、非法来源不叠层 ---------------- */
  console.log('\n三、别处的毒伤不叠层（= 其他职业注入毒走的是这条路）');
  const noStack = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x, pp.z + 3);
    foe.hp = foe.maxHp = 1e9;
    /* 直接走伤害管线打毒伤：注入毒元素 / 装备「中毒几率」都是这条路 */
    for (let i = 0; i < 12; i++) {
      Game.damageEnemy(foe, 10, false, { elem: 'poison', silent: i % 2 === 0 });
      await wait(20);
    }
    return { n: foe.poisonN || 0, poisonT: foe.poisonT || 0 };
  });
  ok(noStack.n === 0, '12 发毒伤之后层数仍是 0（不叠层）', noStack);

  /* ---------------- 四、断档清零 ---------------- */
  console.log('\n四、雾停了层数会掉光');
  const decay = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    Game.mapGen = (Game.mapGen || 0) + 1;   // 让上一团的 setInterval 自己退场
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x, pp.z + 3);
    foe.hp = foe.maxHp = 1e9;
    Game.state.level = 30;
    Game.state.skills = { poison: { lv: 1 } };
    try { Game.recalc(); } catch (e) { }
    Game.cooldowns = {};
    Game.aimPoint = new THREE.Vector3(foe.pos.x, 0, foe.pos.z);
    Game.castSkill('poison');
    await wait(2600);
    const mid = foe.poisonN || 0;
    /* 手动把雾的计时器停掉：换图编号会让所有闭包里的 setInterval 下一拍退出 */
    Game.mapGen = (Game.mapGen || 0) + 1;
    /* **轮询，不是死等固定秒数**：无头 + 软件渲染下帧率低，
     * 主循环的 dt 有上限，模拟时间比真实时间慢好几倍 ——
     * 按「4 秒」死等会量到「还没掉完」，看起来像清零没生效。 */
    let n = mid;
    for (let i = 0; i < 80 && n > 0; i++) { await wait(500); n = foe.poisonN || 0; }
    const end = n;
    return { mid: mid, end: end, nt: +(foe.poisonNT || 0).toFixed(2) };
  });
  ok(decay.mid >= 2, '雾在的时候确实有层（' + decay.mid + ' 层）', decay.mid);
  ok(decay.end === 0, '断档 ' + '以后层数清零（不是永久挂着）', decay);

  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail ? '✗' : '✓') + ' P0·毒探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
