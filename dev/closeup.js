const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
  page.on('pageerror', e => logs.push('[err] ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { document.getElementById('startBtn').click(); });
  await new Promise(r => setTimeout(r, 1200));
  // 近景
  await page.evaluate(() => {
    Game.camDist = 6; Game.camHeight = 6.5; Game.camYaw = 0;
    Game.keys = {};
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'shots/10-closeup.png' });

  // 走到药师旁边
  await page.evaluate(() => {
    const n = Game.npcs.herbalist;
    Game.playerGroup.position.set(n.pos.x, 0, n.pos.z + 3);
    Game.camDist = 7; Game.camHeight = 7;
    Game.playerGroup.rotation.y = Math.PI;
  });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'shots/11-npc.png' });

  // 生成带装备的纸娃娃
  await page.evaluate(() => {
    const setPieces = ['青龙盔', '青龙战甲', '青龙护肩', '青龙护手', '青龙战靴'];
    const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots'];
    slots.forEach((sl, i) => {
      const it = rollItem(30, { slot: sl, cls: 'warrior', rarity: 'set' });
      Game.state.equipment[sl] = it;
    });
    const w = rollItem(30, { slot: 'weapon', cls: 'warrior', rarity: 'legendary' });
    Game.state.equipment.weapon = w;
    const oh = rollItem(30, { slot: 'offhand', cls: 'warrior', rarity: 'rare' });
    Game.state.equipment.offhand = oh;
    Game.recalc(); Game.applyDoll(); UI.renderHUD();
    Game.camDist = 6; Game.camHeight = 6;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'shots/12-paperdoll.png' });
  console.log(logs.join('\n') || 'no errors');
  await browser.close();
})();
