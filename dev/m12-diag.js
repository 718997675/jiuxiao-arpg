/* 一次性诊断：怪物到底卡在哪。
 * 用 30 秒拉怪，把每次「卡住」时的位置 / 所在区域 / 目标区域 / 期望的门打出来。
 * 用法：node dev/m12-diag.js [mapId]
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));
const MID = process.argv[2] || 'mine';

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 600 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 40; Game.recalc(); });
  await wait(800);

  const out = await p.evaluate(async (mid) => {
    Game.travelTo(mid);
    await new Promise(r => setTimeout(r, 900));
    Game.state.hp = 1e9;
    Game.camYaw = 0; Game.keys = {};

    const zs = mapZones(mid);
    const by = id => zs.find(z => z.id === id);
    const tour = [];
    for (const id of ['gate', 'path', 'hall', 'westLink', 'west', 'westLink', 'hall',
      'eastLink', 'east', 'eastLink', 'hall', 'sanctum', 'hall', 'path', 'gate']) {
      const z = by(id); if (z) tour.push({ x: z.x, z: z.z });
    }
    /* 打印区域图 */
    const graph = {};
    for (const z of zs) graph[z.id] = { kind: z.kind, adj: [] };
    for (const z of zs) {
      for (const o of zs) {
        if (o.id === z.id) continue;
        const d = zoneDoor(mid, z.id, o.id);
        if (d) graph[z.id].adj.push(o.id + '@' + d.x.toFixed(1) + ',' + d.z.toFixed(1));
      }
    }

    const track = Game.enemies.map(() => ({ x: 0, z: 0, winD: 0, winT: 0 }));
    const stuck = [];
    const DT = 1 / 60;
    let ti = 0, legT = 0;
    for (let i = 0; i < 30 * 60; i++) {
      const tgt = tour[ti % tour.length];
      const pp = Game.playerGroup.position;
      const dx = tgt.x - pp.x, dz = tgt.z - pp.z;
      if (Math.hypot(dx, dz) < 2.2) { ti++; legT = 0; }
      else {
        Game.keys = {};
        if (dz < -0.6) Game.keys['w'] = true;
        if (dz > 0.6) Game.keys['s'] = true;
        if (dx > 0.6) Game.keys['d'] = true;
        if (dx < -0.6) Game.keys['a'] = true;
        legT += DT; if (legT > 12) { ti++; legT = 0; }
      }
      Game.update(DT);
      const p2 = Game.playerGroup.position;
      for (let k = 0; k < Game.enemies.length; k++) {
        const e = Game.enemies[k];
        if (e.dead) continue;
        e.aggro = true;
        const t = track[k];
        const md = Math.hypot(e.pos.x - t.x, e.pos.z - t.z);
        t.x = e.pos.x; t.z = e.pos.z;
        t.winD += md; t.winT += DT;
        if (t.winT >= 2) {
          const far = Math.hypot(e.pos.x - p2.x, e.pos.z - p2.z) > 4;
          if (far && !e.cfg.ranged && t.winD < 0.8 && !e.boss && stuck.length < 40) {
            const za = zoneAt(mid, e.pos.x, e.pos.z);
            const zb = zoneAt(mid, p2.x, p2.z);
            const hop = za && zb ? zoneNextHop(mid, za.id, zb.id) : null;
            const door = za && hop ? zoneDoor(mid, za.id, hop) : null;
            stuck.push({
              k: e.kind, at: [e.pos.x.toFixed(1), e.pos.z.toFixed(1)],
              za: za && za.id, zb: zb && zb.id, hop, door: door && [door.x.toFixed(1), door.z.toFixed(1)],
              player: [p2.x.toFixed(1), p2.z.toFixed(1)]
            });
          }
          t.winD = 0; t.winT = 0;
        }
      }
      if (Game.state.hp < 1e8) Game.state.hp = 1e9;
    }
    return { graph, stuck, n: Game.enemies.length };
  }, MID);

  console.log('区域图:');
  for (const k in out.graph) console.log('  ' + k.padEnd(10) + out.graph[k].kind.padEnd(7) + out.graph[k].adj.join('  '));
  console.log('\n卡住样本 ' + out.stuck.length + ' / 怪 ' + out.n);
  for (const s of out.stuck) {
    console.log(`  ${String(s.k).padEnd(11)} at ${s.at.join(',')}  [${s.za}] → [${s.zb}]  hop=${s.hop}  door=${s.door ? s.door.join(',') : '-'}  player ${s.player.join(',')}`);
  }
  await b.close();
})();
