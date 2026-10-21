const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(600);
  await page.evaluate(() => { document.getElementById('startBtn').click(); });
  await wait(1000);

  // 给一套合适装备，模拟中期角色
  await page.evaluate(() => {
    Game.state.level = 36; Game.state.xpNext = 99999;
    ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet'].forEach(sl => {
      Game.state.equipment[sl] = rollItem(34, { slot: sl, cls: Game.state.cls, rarity: 'rare' });
    });
    Game.state.equipment.ring1 = rollItem(34, { slot: 'ring', cls: Game.state.cls, rarity: 'rare' });
    Game.state.equipment.ring2 = rollItem(34, { slot: 'ring', cls: Game.state.cls, rarity: 'rare' });
    Game.state.equipment.weapon = rollItem(34, { slot: 'weapon', cls: Game.state.cls, rarity: 'rare' });
    Game.state.equipment.offhand = rollItem(34, { slot: 'offhand', cls: Game.state.cls, rarity: 'rare' });
    Game.recalc(); Game.state.hp = Game.state.stats.hpMax; Game.state.mp = Game.state.stats.mpMax;
    Game.applyDoll(); UI.renderHUD();
  });

  const results = [];
  for (const m of ['forest', 'swamp', 'mine', 'abyss', 'heaven']) {
    await page.evaluate(id => { Game.travelTo(id); }, m);
    await wait(1500);
    const info = await page.evaluate(() => {
      const bosses = Game.enemies.filter(e => e.boss);
      return { map: Game.state.mapId, bosses: bosses.map(b => b.cfg.name + '@' + Math.round(b.pos.x) + ',' + Math.round(b.pos.z)) };
    });
    // 传送到第一个 boss 旁，等它出手
    await page.evaluate(() => {
      const b = Game.enemies.find(e => e.boss);
      if (b) Game.playerGroup.position.set(b.pos.x + 3, 0, b.pos.z + 3);
    });
    await wait(6000);
    await page.evaluate(() => { Game.mouseDown = true; });
    await wait(3500);
    await page.evaluate(() => { Game.mouseDown = false; });
    await page.evaluate(() => { Game.mouseDown = true; });
    await wait(3500);
    await page.evaluate(() => { Game.mouseDown = false; });
    await page.screenshot({ path: 'shots/50-boss-' + m + '.png' });
    const st = await page.evaluate(() => ({
      boss: Game.boss && Game.boss.cfg.name,
      hp: Math.round(Game.state.hp), max: Math.round(Game.state.stats.hpMax),
      dead: Game.dead, active: Game.boss ? Game.boss.active : null,
      patterns: Game.boss ? Game.boss.patternCd.toFixed(1) : null, bossHp: Game.boss ? Math.round(Game.boss.hp) : null, atk: Math.round(Game.state.stats.atk), def: Math.round(Game.state.stats.def), bossHp: Game.boss ? Math.round(Game.boss.hp) : null, atk: Math.round(Game.state.stats.atk), def: Math.round(Game.state.stats.def)
    }));
    results.push({ info, st });
    if (st.dead) await page.evaluate(() => Game.respawn());
    await wait(600);
  }

  console.log(JSON.stringify(results, null, 1));
  console.log('ERRORS:', errs.length ? errs.slice(0, 8).join('\n') : 'none');
  await browser.close();
})();
