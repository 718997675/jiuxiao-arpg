/* 探针：玩家与怪物的「穿模」检测
 * 判定：玩家中心到怪物中心的水平距离 vs 怪物模型的真实水平包围半径（Box3 实测）。
 *       距离 < 包围半径 → 玩家已经站进模型体内 = 穿模。
 * 同时统计怪物是否还能打到玩家（防止半径放大后「撞不进去也打不到」）。
 */
const http = require('http'), fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..'), PORT = 8931;
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 1024, height: 700 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await pg.goto(`http://127.0.0.1:${PORT}/?cls=mage&name=p`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1700));

  const out = await pg.evaluate(async () => {
    Game.tickPerf = () => {};
    Game.running = true; Game.dead = false;
    const res = [];

    /* 模型真实水平包围半径：遍历所有顶点求到中心的最大水平距离（含 group.scale） */
    const visualR = (group) => {
      const box = new THREE.Box3().setFromObject(group);
      const c = box.getCenter(new THREE.Vector3());
      let mx = 0;
      group.updateWorldMatrix(true, true);
      const v = new THREE.Vector3();
      group.traverse(o => {
        if (o.isSprite || o.renderOrder >= 900) return;
        if (!o.isMesh || !o.geometry) return;
        const pos = o.geometry.attributes.position;
        if (!pos) return;
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const dd = Math.hypot(v.x - c.x, v.z - c.z);
          if (dd > mx) mx = dd;
        }
      });
      return { r: mx, c };
    };

    const trial = (kind, isBoss) => {
      Game.enemies.forEach(e => disposeTree(e.actor.group)); Game.enemies = [];
      Game.mobTimer = -1e9;
      const e = Game.spawnEnemy(kind, 6, 0, false, 20, isBoss ? kind : null);
      if (!e) return { kind, err: 'spawn failed' };
      e.active = true;
      const vr = visualR(e.actor.group);
      let worst = 999, worstAt = null, hitCount = 0;
      const realDmg = Game.damagePlayer.bind(Game);
      Game.damagePlayer = (d, src) => { if (src === e) hitCount++; return realDmg(d, src); };
      for (let i = 0; i < 900; i++) {
        const t = i / 900;
        const px = 6 + (1 - t) * 10;           // 玩家从 16 一路走进怪中心
        Game.playerGroup.position.set(px, 0, 0);
        Game.actor.group.position.set(px, 0, 0);
        Game.state.hp = Game.state.stats.hpMax;
        try { Game.updateEnemies(1 / 60); } catch (err) { Game.damagePlayer = realDmg; return { kind, err: String(err).slice(0, 120) }; }
        // 用怪「当前实际位置」比，冲锋/位移后也成立
        const d = Math.hypot(e.pos.x - px, e.pos.z - 0);
        const pen = d - vr.r;
        if (pen < worst) { worst = pen; worstAt = { i, d: +d.toFixed(2) }; }
      }
      Game.damagePlayer = realDmg;
      return {
        kind, model: e.model, radius: +e.radius.toFixed(2), reach: +e.reach.toFixed(2),
        visualR: +vr.r.toFixed(2), minDist: worstAt.d,
        penetration: +worst.toFixed(2), clipped: worst < -0.05,
        ranged: !!e.cfg.ranged, attacksLanded: hitCount
      };
    };

    for (const k of Object.keys(MONSTERS)) res.push(trial(k, false));
    for (const k of Object.keys(BOSSES)) res.push(trial(k, true));
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  const clipped = out.filter(r => r.err || r.clipped);
  const mute = out.filter(r => !r.err && !r.ranged && r.attacksLanded === 0);
  console.log('pageerrors:', errs.length ? errs.slice(0, 3) : 'none');
  console.log(clipped.length ? 'FAIL 穿模: ' + clipped.map(r => r.kind + '(' + (r.err || r.penetration) + ')').join(', ') : 'PASS 24 个模型均未穿模');
  console.log(mute.length ? 'WARN 近战打不到玩家: ' + mute.map(r => r.kind).join(', ') : 'PASS 所有近战怪都能命中玩家');
  await b.close(); server.close();
  if (clipped.length || errs.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
