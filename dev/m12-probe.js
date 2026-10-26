/* 单怪探针：挑一只「明明该走过来却不动」的怪，逐帧打印它的状态。
 * 用法：node dev/m12-probe.js [mapId]
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
  await p.setViewport({ width: 800, height: 500 });
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
    /* 玩家钉在走廊口内侧，把怪都拉到同一侧 */
    const hz = zoneById(mid, 'hall');
    Game.playerGroup.position.set(hz.x, 0, hz.z + 2);
    Game.state.playerPos = { x: hz.x, z: hz.z + 2 };

    const e = Game.enemies.find(x => !x.boss && x.cfg.spd > 3) || Game.enemies[0];
    const log = [];
    for (let i = 0; i < 90; i++) {
      for (const o of Game.enemies) o.aggro = true;
      Game.state.hp = 1e9;
      Game.update(1 / 60);
      if (i % 6 === 0) {
        const pp = Game.playerGroup.position;
        log.push({
          i, k: e.kind,
          pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)],
          dtg: +Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z).toFixed(2),
          reach: e.reach, spd: +e.spd.toFixed(2),
          stun: +e.stun.toFixed(2), windup: +(e.windup || 0).toFixed(2),
          atkCd: +(e.atkCd || 0).toFixed(2),
          ai: e.ai && e.ai.kind, moving: !!e.actor.moving,
          za: (zoneAt(mid, e.pos.x, e.pos.z) || {}).id,
          zb: (zoneAt(mid, pp.x, pp.z) || {}).id,
          taunt: +(e.tauntT || 0).toFixed(1), fear: +(e.fearT || 0).toFixed(1)
        });
      }
    }
    const pp = Game.playerGroup.position;
    return { log, player: [+pp.x.toFixed(1), +pp.z.toFixed(1)] };
  }, MID);

  console.log('玩家', out.player.join(','));
  for (const r of out.log) console.log(JSON.stringify(r));
  await b.close();
})();
