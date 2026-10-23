/* ============================================================
 * v1.0.5 验证
 *   1. 符咒尺寸已缩小（0.34 × 0.56）
 *   2. 同屏怪物硬上限生效（桌面 36 / 触屏 28）
 *   3. Boss 召唤物按「身边数量」封顶
 *   4. 远处怪物不渲染、回到近处自动恢复
 *   5. 单帧异常不再让画面定格（兜底生效）
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8906;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const ok = m => { results.push(['PASS', m]); console.log('  [PASS] ' + m); };
const bad = m => { results.push(['FAIL', m]); console.log('  [FAIL] ' + m); };
const chk = (c, m) => (c ? ok(m) : bad(m));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

  await page.goto(`http://127.0.0.1:${PORT}/?cls=taoist&name=测`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));

  /* ---------- 1. 符咒尺寸 ---------- */
  const tal = await page.evaluate(() => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    FX.clear();
    Game.state.mp = Game.state.stats.mpMax;
    Game.cooldowns = {};
    // 真放一次技能，量的是技能真正产出的那枚符
    const e = Game.spawnEnemy('halfork', 0, 14, false, 6);
    Game.aimPoint.set(0, 0, 14);
    Game.castSkill('talisman');
    const p = FX.projectiles.find(x => x.style === 'talisman');
    if (!p) return { err: 'no talisman' };
    const g = p.mesh.geometry;
    const box = new THREE.Box3().setFromObject(p.mesh);
    const size = box.getSize(new THREE.Vector3());
    const glow = p.mesh.children[0];
    const out = {
      w: g.parameters ? g.parameters.width : -1,
      h: g.parameters ? g.parameters.height : -1,
      worldW: size.x, worldH: size.y,
      glowW: glow.geometry.parameters ? glow.geometry.parameters.width : -1,
      hitRadius: p.hitRadius
    };
    FX.clear();
    if (e) disposeTree(e.actor.group);
    Game.enemies = [];
    return out;
  });
  chk(!tal.err, '技能成功产出符咒');
  chk(Math.abs(tal.w - 0.40) < 0.001 && Math.abs(tal.h - 0.64) < 0.001,
    `符纸尺寸 0.40 × 0.64（实测 ${tal.w} × ${tal.h}）`);
  chk(tal.worldW < 0.85 && tal.worldH < 1.1, `符咒含光晕的世界包围盒 ${tal.worldW.toFixed(2)} × ${tal.worldH.toFixed(2)}，不再挡视野`);
  chk(tal.hitRadius === 0.45, `命中半径同步收紧到 ${tal.hitRadius}`);

  /* ---------- 2. 怪物硬上限 ---------- */
  const cap = await page.evaluate(() => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    const kinds = MAPS[Game.state.mapId].spawns.length ? MAPS[Game.state.mapId].spawns : ['halfork'];
    let tries = 0, made = 0;
    for (let i = 0; i < 200; i++) {
      tries++;
      const a = Math.random() * 6.28, r = 8 + Math.random() * 12;
      const e = Game.spawnEnemy(kinds[i % kinds.length], Math.cos(a) * r, Math.sin(a) * r, false, 8);
      if (e) made++;
    }
    return { tries, made, live: Game.enemies.length, capPc: MOB_CAP_PC, capTouch: MOB_CAP_TOUCH, touch: IS_TOUCH };
  });
  chk(cap.made === cap.capPc && cap.live === cap.capPc,
    `连生 200 次只落地 ${cap.made} 只（上限 ${cap.capPc}），其余返回 null`);

  /* ---------- 3. Boss 召唤封顶 ---------- */
  const summon = await page.evaluate(() => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    Game.state.mapId = 'swamp';                 // 有 spawns 的地图才能召唤
    const boss = Game.spawnEnemy(null, 0, 0, false, 20, 'chief');   // chief 的 patterns 含 summon
    boss.active = true;
    const before = Game.enemies.length;
    let rounds = 0, spawned = 0;
    for (let i = 0; i < 12; i++) {
      const n0 = Game.enemies.length;
      Game.bossPattern(boss, new THREE.Vector3(0, 0, 6));
      spawned += Game.enemies.length - n0;
      rounds++;
    }
    const near = Game.enemies.filter(e => !e.boss && DIST2D(e.pos, boss.pos) < 16).length;
    const out = { before, after: Game.enemies.length, near, rounds, cap: SUMMON_CAP, spawned };
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    Game.state.mapId = 'village';
    return out;
  });
  chk(summon.spawned > 0, `召唤确实生效过（累计生成 ${summon.spawned} 只）`);
  chk(summon.near <= summon.cap, `连续召唤 ${summon.rounds} 次后身边杂兵 ${summon.near} 只，未超过 ${summon.cap}`);
  chk(summon.after < 40, `场上总数 ${summon.after} 只，没有被召唤撑爆`);

  /* ---------- 4. 远处不渲染 ---------- */
  const cull = await page.evaluate(() => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    const e = Game.spawnEnemy('halfork', 0, 5, false, 8);
    const pg = Game.playerGroup.position;
    // 近处一帧
    e.pos.set(pg.x, 0, pg.z + 5);
    Game.updateEnemies(1 / 60);
    const nearVis = e.actor.group.visible;
    // 挪到远处
    e.pos.set(pg.x, 0, pg.z + 200);
    Game.updateEnemies(1 / 60);
    const farVis = e.actor.group.visible;
    const callsFar = Game.renderer.info.render.calls;
    // 回来
    e.pos.set(pg.x, 0, pg.z + 5);
    Game.updateEnemies(1 / 60);
    const backVis = e.actor.group.visible;
    return { nearVis, farVis, backVis, cullDist: MOB_CULL_DIST, callsFar };
  });
  chk(cull.nearVis === true && cull.farVis === false && cull.backVis === true,
    `距离剔除：近 ${cull.nearVis} → 远 ${cull.farVis} → 回近 ${cull.backVis}（阈值 ${cull.cullDist}）`);

  /* ---------- 5. 单帧异常兜底 ---------- */
  const guard = await page.evaluate(async () => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    /* 前几项测试刷了一堆怪，玩家多半已经死了；死亡时 update 根本不会被调用，
     * 那样就测不到兜底。先把状态拉回「活着且在跑」。 */
    Game.dead = false;
    Game.running = true;
    Game.state.hp = Game.state.stats.hpMax;
    document.getElementById('death').style.display = 'none';
    const alive = !Game.dead && Game.running;
    /* 先量一段正常帧推进速度做基准：headless + swiftshader 的帧率本身就不稳，
     * 用绝对值判断会误判，只比「抛异常时是否明显掉到停滞」 */
    const b0 = Game.time;
    await new Promise(r => setTimeout(r, 600));
    const baseAdv = Game.time - b0;
    const t0 = Game.time;
    const realUpdate = Game.update;
    Game.update = () => { throw new Error('故意抛出的测试异常'); };
    await new Promise(r => setTimeout(r, 600));
    const errs = Game._errCount || 0;
    const advanced = Game.time - t0;
    Game.update = realUpdate;
    await new Promise(r => setTimeout(r, 250));
    const t1 = Game.time;
    await new Promise(r => setTimeout(r, 250));
    return { alive, errs, advanced, baseAdv, recovered: Game.time > t1 + 0.02, hasGuard: typeof Game.onFrameError === 'function' };
  });
  chk(guard.alive, '测试前游戏处于运行态');
  chk(guard.hasGuard && guard.errs > 0, `异常被捕获并计数 ${guard.errs} 次`);
  chk(guard.advanced >= guard.baseAdv * 0.4,
    `抛异常期间主循环仍在推进（${guard.advanced.toFixed(2)}s vs 正常 ${guard.baseAdv.toFixed(2)}s），画面不会定格`);
  chk(guard.recovered, '异常消失后自动恢复正常运行');

  chk(errors.length === 0, '无未捕获的 JS 报错' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));

  await browser.close();
  server.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
