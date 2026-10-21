const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => console.log('[err]', e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1100);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(600);

  await page.evaluate(() => {
    Game.state.level = 10; Game.recalc();
    Game.travelTo('forest');
  });
  await wait(1500);

  await page.evaluate(() => {
    Game.playerGroup.position.set(0, 0, 0);
    Game.playerGroup.rotation.y = 0;
    Game.aimDir.set(0.4, 0, 1);
    Game.actor.atkAnim = 0;
  });
  await wait(600);
  await page.screenshot({ path: '../shots/gcam-0.png' });

  // 默认游戏机位下连拍一个完整挥砍
  await page.evaluate(() => { Game.doBasicAttack(); });
  for (let i = 1; i <= 8; i++) {
    await wait(48);
    await page.screenshot({ path: `../shots/gcam-${i}.png` });
  }
  await browser.close();
})();
