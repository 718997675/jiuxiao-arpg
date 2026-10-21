const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1600);
  await p.screenshot({ path: path.join(OUT, '10-m-title.png') });
  await p.tap('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    const eq = Game.state.equipment;
    const plan = { helm: 'legendary', chest: 'set', shoulders: 'legendary', gloves: 'rare', boots: 'legendary', belt: 'rare', amulet: 'legendary', ring: 'rare', offhand: 'rare' };
    for (const sl of Object.keys(plan)) {
      try { const it = rollItem(32, { slot: sl, rarity: plan[sl], cls: 'warrior' }); it.reqLv = 1; if (sl === 'ring') eq.ring1 = it; else eq[sl] = it; } catch (e) {}
    }
    Game.state.level = 22; Game.recalc(); Game.applyDoll();
    Game.travelTo('swamp');
  });
  await wait(2600);
  await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const alive = (Game.enemies || []).filter(e => !e.dead).sort((a, b) => a.pos.distanceTo(pg) - b.pos.distanceTo(pg));
    alive.slice(0, 4).forEach((e, i) => {
      const nx = pg.x + (-0.8 + i * 0.5) * 5, nz = pg.z - 5;
      e.pos.set(nx, 0, nz);
      if (e.actor) { e.actor.group.position.set(nx, 0, nz); e.actor.pos = e.pos; }
      e.hp = e.maxHp * (0.35 + 0.15 * i);
    });
  });
  await wait(900);
  await p.screenshot({ path: path.join(OUT, '11-m-play.png') });
  console.log('mobile ok');
  await b.close();
})();
