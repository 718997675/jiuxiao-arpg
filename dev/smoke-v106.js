/* ============================================================
 * v1.0.6 验证（性能轮）
 *   1. 粒子批处理：一次 burst 只占 1 个 draw call（THREE.Points），不再是一粒一 Mesh
 *   2. 粒子对象在寿命结束后被回收，不残留
 *   3. 阴影视锥收到 ±26
 *   4. 近处怪投影、远处怪不投影（阈值 20），来回切换都能恢复
 *   5. Boss 永远保留投影
 *   6. 运行期无 JS 报错
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8916;
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

  await page.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=测`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1800));

  await page.evaluate(() => {
    /* 画质自适应会在测量途中改 dpr / 关阴影，把结论搅乱 */
    Game.tickPerf = () => {};
    Game.perf.level = 0; Game.perf.warm = 99;
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    FX.clear();
    Game.mobTimer = -1e9;
  });
  await new Promise(r => setTimeout(r, 500));

  /* ---------- 1. 粒子批处理 ---------- */
  console.log('\n[1] 粒子批处理');
  const p1 = await page.evaluate(async () => {
    const before = Game.renderer.info.render.calls;
    const pos = new THREE.Vector3(Game.playerGroup.position.x, 1, Game.playerGroup.position.z + 3);
    for (let i = 0; i < 10; i++) FX.burst(pos, 0xff8844, 40, { speed: 4, size: 0.12, life: 1.2, additive: true });
    await new Promise(r => setTimeout(r, 120));
    let points = 0, meshes = 0, particles = 0;
    for (const p of FX.parts) { p.obj.isPoints ? points++ : meshes++; particles += p.n || 0; }
    const after = Game.renderer.info.render.calls;
    return { points, meshes, particles, groups: FX.parts.length, callsBefore: before, callsAfter: after };
  });
  chk(p1.points === 10 && p1.meshes === 0,
    `10 组爆发全部是 Points（points=${p1.points} mesh=${p1.meshes}）`);
  chk(p1.particles >= 380, `400 颗粒子只占 ${p1.points} 个渲染对象（实测 ${p1.particles} 颗）`);
  chk(p1.callsAfter - p1.callsBefore <= 12,
    `draw call 增量 ${p1.callsAfter - p1.callsBefore}（旧实现会是 +400）`);

  /* ---------- 2. 粒子回收 ---------- */
  console.log('\n[2] 粒子回收');
  const p2 = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1800));
    FX.clear();
    await new Promise(r => setTimeout(r, 300));
    return { groups: FX.parts.length };
  });
  chk(p2.groups === 0, `寿命结束后粒子组清空（残留 ${p2.groups} 组）`);

  /* ---------- 3. 阴影视锥 ---------- */
  console.log('\n[3] 阴影视锥');
  const p3 = await page.evaluate(() => {
    const c = Game.sun.shadow.camera;
    return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, far: c.far, map: Game.sun.shadow.mapSize.x };
  });
  chk(p3.left === -26 && p3.right === 26 && p3.top === 26 && p3.bottom === -26,
    `阴影正交框 ±26（原 ±42），同样 ${p3.map} 贴图铺得更密`);

  /* ---------- 4. 阴影距离裁剪 ---------- */
  console.log('\n[4] 阴影距离裁剪');
  const p4 = await page.evaluate(async () => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    const kinds = MAPS[Game.state.mapId].spawns.length ? MAPS[Game.state.mapId].spawns : ['halfork'];
    const cnt = g => { let n = 0; g.traverse(o => { if (o.isMesh && o.castShadow) n++; }); return n; };
    const near = Game.spawnEnemy(kinds[0], 0, 5, false, 8);
    const far = Game.spawnEnemy(kinds[0], 0, 34, false, 8);
    near.aggro = false; far.aggro = false; near.spd = 0; far.spd = 0;
    await new Promise(r => setTimeout(r, 900));
    const a = { nearOn: near.shadowOn, nearC: cnt(near.actor.group), farOn: far.shadowOn, farC: cnt(far.actor.group) };
    /* 把远处那只挪回来，应当自动恢复投影 */
    far.pos.set(0, 0, 6);
    await new Promise(r => setTimeout(r, 900));
    const back = { on: far.shadowOn, casters: cnt(far.actor.group) };
    return Object.assign(a, { back });
  });
  chk(p4.nearOn === true && p4.nearC > 0, `近处怪照常投影（${p4.nearC} 个部件）`);
  chk(p4.farOn === false && p4.farC === 0, `20 格外的怪不再进 shadow map（${p4.farC} 个部件）`);
  chk(p4.back.on === true && p4.back.casters > 0, `走回近处自动恢复投影（${p4.back.casters} 个部件）`);

  /* ---------- 5. Boss 保留投影 ---------- */
  console.log('\n[5] Boss 投影');
  const p5 = await page.evaluate(async () => {
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    const b = Game.spawnEnemy('chief', 0, 40, false, 8, 'chief');
    if (!b) return { ok: false };
    await new Promise(r => setTimeout(r, 900));
    let n = 0; b.actor.group.traverse(o => { if (o.isMesh && o.castShadow) n++; });
    return { ok: true, boss: b.boss, shadowOn: b.shadowOn, casters: n };
  });
  chk(p5.ok && p5.boss && p5.shadowOn === true && p5.casters > 0,
    `Boss 即使在 40 格外也保留投影（${p5.casters} 个部件）`);

  chk(errors.length === 0, '运行期无 JS 报错' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));

  await browser.close();
  server.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
