#!/usr/bin/env node
/* ============================================================
 * [U9] 怪物侧常驻视觉层 · 真机验收
 *
 *   NODE_PATH=<node_modules> node dev/probe-enemyfx.js
 *
 * 静态契约（test-enemyfx）判数据与接线；这一份判「接进真游戏后
 * 8 种形态真的各画出一枚环、40 只同屏批次不涨、词缀角标 / 治疗光束 /
 * Boss 进场倒地都真的出东西」。
 *
 * 量六件事：
 *   1 8 形态各刷一只：8 个实例网格各 1 个实例，像素差异 > 0
 *   2 40 只近战同屏：只占 1 个网格，绘制批次增量 ≤20（恒定上限）
 *   3 精英 3 词缀：3 个角标网格各 1 个实例，绕脚排布
 *   4 自爆引信：同一枚环放大（不再借受击闪白）
 *   5 治疗光束：FX.beams +1；自疗走环不走零长度光束
 *   6 Boss 进场 / 倒地：环 + 光柱 + 碎星，且不改 hp/active
 *
 * 纪律：Game.running=false 停主循环，所有同步块一次 evaluate 做完；
 * 像素测量前 gl.finish()。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

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
    Game.state.level = 60;
    try { Game.recalc(); } catch (e) { }
    Game.running = false;
    FX.clear();
    if (typeof EnemyFX !== 'undefined') EnemyFX.clear();
    const pp = Game.playerGroup.position;
    Game.camera.position.set(pp.x, 18, pp.z + 9);
    Game.camera.lookAt(pp.x, 0, pp.z);
    Game.camera.updateMatrixWorld();
    const cv = document.getElementById('gl');
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    window.__buf = { cv, x2: c2.getContext('2d', { willReadFrequently: true }) };
    /* 每种 AI 形态挑一只真实怪，避免探针自己编 kind */
    const pick = {};
    for (const k in MONSTERS) {
      const c = MONSTERS[k];
      const a = c.ai || (c.ranged ? 'ranged' : 'melee');
      if (!pick[a]) pick[a] = k;
    }
    window.__pick = pick;
    return { pick, pp: { x: pp.x, z: pp.z }, baseEnemies: Game.enemies.length };
  };
  window.__spawn = function (kind, x, z, elite, level) {
    const e = Game.spawnEnemy(kind, x, z, !!elite, level || 30);
    return e ? e.id : null;
  };
  window.__spawnBoss = function (id, x, z) {
    const b = Game.spawnEnemy(null, x, z, false, (BOSSES[id] && BOSSES[id].level) || 30, id);
    return b ? b.id : null;
  };
  window.__enemy = function (id) { return Game.enemies.find(e => e.id === id) || null; };
  window.__sync = function (t) {
    if (typeof EnemyFX !== 'undefined') EnemyFX.sync(1 / 60, t, Game.enemies);
  };
  window.__stats = function () { return EnemyFX.stats(); };
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
  window.__show = function (v) { if (EnemyFX.group) EnemyFX.group.visible = !!v; };
  window.__calls = function () {
    Game.renderer.render(Game.scene, Game.camera);
    Game.renderer.getContext().finish();
    return Game.renderer.info.render.calls;
  };
  /* 真 three.js 的实例矩阵要用 getMatrixAt 取，不能读内部数组 */
  window.__inst = function (kind, i, bucket) {
    const bag = bucket === 'elite' ? EnemyFX.elite : EnemyFX.mob;
    const m = bag[kind];
    if (!m || i == null || i < 0 || i >= m.count) return null;
    const mat = new THREE.Matrix4();
    m.getMatrixAt(i, mat);
    const a = mat.elements;
    return { s: a[0], x: a[12], z: a[14] };
  };
  window.__maxScale = function (kind) {
    const m = EnemyFX.mob[kind];
    if (!m || !m.count) return 0;
    let mx = 0;
    for (let i = 0; i < m.count; i++) {
      const q = window.__inst(kind, i);
      if (q) mx = Math.max(mx, q.s);
    }
    return mx;
  };
  window.__fx = function () {
    return {
      beams: FX.beams.length,
      rings: FX.zones.filter(z => z.type === 'ring').length,
      bursts: FX.parts.length
    };
  };
  window.__clearEnemies = function () {
    Game.enemies.length = 0;
    if (typeof EnemyFX !== 'undefined') EnemyFX.clear();
  };
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(TOOLS);

  const setup = await page.evaluate(() => window.__setup());
  ok(!!setup && setup.pick && Object.keys(setup.pick).length === 8, '8 种形态都能找到真实怪', setup && setup.pick);
  ok(await page.evaluate(() => EnemyFX.stats().bound === true), 'EnemyFX 已绑定场景');

  /* ---------- 1. 8 形态各一只：实例数 + 像素 ---------- */
  const eight = await page.evaluate((pick) => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    const ids = {};
    let i = 0;
    for (const k in pick) {
      const ang = i / 8 * Math.PI * 2;
      ids[k] = window.__spawn(pick[k], pp.x + Math.cos(ang) * 6, pp.z + Math.sin(ang) * 6, false, 30);
      i++;
    }
    window.__sync(1);
    window.__show(false);
    const base = window.__grab();
    window.__show(true);
    const px = window.__diff(base, window.__grab());
    const callsOn = window.__calls();
    window.__show(false);
    const callsOff = window.__calls();
    window.__show(true);
    return { ids, stats: window.__stats(), px, delta: callsOn - callsOff };
  }, setup.pick);
  ok(Object.values(eight.ids).every(Boolean), '8 只全部刷出', eight.ids);
  ok(eight.stats.mobInstances === 8, '8 形态 → 8 个实例', eight.stats.mobInstances);
  ok(eight.stats.mobMeshes === 8, '8 个形态网格', eight.stats.mobMeshes);
  ok(eight.px > 0, '8 枚形态环真的出像素', eight.px);
  ok(eight.delta > 0 && eight.delta <= 20, '8 形态绘制增量在 1~20 之间', eight.delta);

  /* ---------- 2. 40 只近战同屏 ---------- */
  const crowd = await page.evaluate(() => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    for (let i = 0; i < 40; i++) {
      const ang = i / 40 * Math.PI * 2;
      const r = 4 + (i % 4) * 1.4;
      window.__spawn(window.__pick.melee, pp.x + Math.cos(ang) * r, pp.z + Math.sin(ang) * r, false, 30);
    }
    window.__sync(2);
    const st = window.__stats();
    window.__show(true);
    const callsOn = window.__calls();
    window.__show(false);
    const callsOff = window.__calls();
    window.__show(true);
    return { st, delta: callsOn - callsOff, melee: EnemyFX.mob.melee.count, alive: Game.enemies.length };
  });
  /* 引擎同屏上限 MOB_CAP_PC = 36：刷 40 只只活 36，这里量「满编」而不是硬凑 40 */
  ok(crowd.alive >= 30 && crowd.st.mobInstances === crowd.alive,
    '满编近战每只都有实例（PC 上限 36）', { alive: crowd.alive, inst: crowd.st.mobInstances });
  ok(crowd.melee === crowd.alive, '只用一个网格画满编近战', { melee: crowd.melee, alive: crowd.alive });
  ok(crowd.st.drawCap === 20, '批次上限仍是 20', crowd.st.drawCap);
  ok(crowd.delta <= 20, '满编同屏绘制增量 ≤20', crowd.delta);

  /* ---------- 3. 精英 3 词缀角标 ---------- */
  const elite = await page.evaluate(() => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    const id = window.__spawn(window.__pick.melee, pp.x + 5, pp.z + 2, true, 30);
    const e = window.__enemy(id);
    e.affixes = ['frost', 'thorns', 'warded'];
    e.elite = true;
    window.__sync(3);
    const st = window.__stats();
    const rows = {};
    for (const a of ['frost', 'thorns', 'warded']) {
      const m = EnemyFX.elite[a];
      const q = m && m.count ? window.__inst(a, 0, 'elite') : null;
      rows[a] = q ? { count: m.count, x: q.x, z: q.z } : null;
    }
    return { st, rows, ex: e.pos.x, ez: e.pos.z, radius: e.radius };
  });
  ok(elite.st.eliteInstances === 3, '3 条词缀 → 3 个角标', elite.st.eliteInstances);
  for (const a of ['frost', 'thorns', 'warded']) {
    ok(elite.rows[a] && elite.rows[a].count === 1, a + ' 角标有 1 个实例', elite.rows[a]);
    if (elite.rows[a]) {
      const d = Math.hypot(elite.rows[a].x - elite.ex, elite.rows[a].z - elite.ez);
      ok(d > elite.radius && d < elite.radius + 1.2, a + ' 角标在脚边外圈', d);
    }
  }

  /* ---------- 4. 自爆引信：同一枚环放大 ---------- */
  const fuse = await page.evaluate(() => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    const id = window.__spawn(window.__pick.bomber, pp.x + 4, pp.z, false, 30);
    const e = window.__enemy(id);
    e.ai.state = 'idle';
    window.__sync(4);
    const before = window.__maxScale('bomber');
    e.ai.state = 'fuse';
    e.ai.fuseT = 1;
    window.__sync(4.05);
    const after = window.__maxScale('bomber');
    return { before, after, hitFlash: e.hitFlash };
  });
  ok(fuse.before > 0 && fuse.after > fuse.before * 1.15, '引信期自爆环明显放大', fuse);
  ok(!(fuse.hitFlash > 0), '引信不再把 hitFlash 当警戒灯', fuse.hitFlash);

  /* ---------- 5. 治疗光束 ---------- */
  const heal = await page.evaluate(() => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    const a = window.__enemy(window.__spawn(window.__pick.healer, pp.x + 3, pp.z, false, 30));
    const b = window.__enemy(window.__spawn(window.__pick.melee, pp.x + 6, pp.z, false, 30));
    const before = window.__fx();
    const r1 = EnemyFX.healLink(a, b);
    const mid = window.__fx();
    const r2 = EnemyFX.healLink(a, a);
    const end = window.__fx();
    return { r1, r2, before, mid, end };
  });
  ok(heal.r1 === true && heal.mid.beams === heal.before.beams + 1, '治疗目标时画 1 条光束', heal.mid);
  ok(heal.r2 === true && heal.end.rings === heal.mid.rings + 1, '自疗画环，不画零长度光束', heal.end);

  /* ---------- 6. Boss 进场 / 倒地 ---------- */
  const boss = await page.evaluate(() => {
    window.__clearEnemies();
    const pp = Game.playerGroup.position;
    const id = Object.keys(BOSSES)[0];
    const bid = window.__spawnBoss(id, pp.x + 10, pp.z + 2);
    const b = window.__enemy(bid);
    const snap = { hp: b.hp, active: b.active, dmg: b.dmg, x: b.pos.x, z: b.pos.z };
    const f0 = window.__fx();
    const r1 = EnemyFX.bossArrive(b);
    const f1 = window.__fx();
    const r2 = EnemyFX.bossDeath(b, b.pos.clone());
    const f2 = window.__fx();
    const after = { hp: b.hp, active: b.active, dmg: b.dmg, x: b.pos.x, z: b.pos.z };
    return { id, bid, r1, r2, f0, f1, f2, snap, after };
  });
  ok(!!boss.bid, 'Boss 刷出', boss.bid);
  ok(boss.r1 && boss.f1.rings === boss.f0.rings + 1, '进场画收束环', boss.f1);
  ok(boss.f1.beams === boss.f0.beams + 1, '进场画光柱', boss.f1);
  /* FX.beam 自带 8 颗尾焰（+1 组），bossArrive 再补一组碎星 → 至少 +2 组 */
  ok(boss.f1.bursts >= boss.f0.bursts + 2, '进场画碎星（含光柱尾焰）', boss.f1);
  ok(boss.r2 && boss.f2.rings === boss.f1.rings + 1, '倒地画环', boss.f2);
  ok(boss.f2.beams === boss.f1.beams + 1, '倒地画掉落光柱', boss.f2);
  ok(boss.f2.bursts >= boss.f1.bursts + 2, '倒地画碎片（含光柱尾焰）', boss.f2);
  ok(JSON.stringify(boss.snap) === JSON.stringify(boss.after), '生命周期不改 hp/active/dmg/pos', { a: boss.snap, b: boss.after });

  /* ---------- 7. clear + 零报错 ---------- */
  const cleared = await page.evaluate(() => {
    EnemyFX.clear();
    return EnemyFX.stats();
  });
  ok(cleared.mobInstances === 0 && cleared.eliteInstances === 0, 'clear 清空实例', cleared);
  ok(errs.length === 0, '零页面报错', errs);

  await browser.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' U9 怪物侧常驻视觉真机：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
