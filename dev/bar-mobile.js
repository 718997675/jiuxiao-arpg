const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=900,500']
  });
  const page = await browser.newPage();
  await page.emulate({
    name: 'phone-landscape',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }
  });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => { Game.startNew('mage', '测法'); });
  await wait(500);
  await page.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1500);
  await page.evaluate(() => {
    const es = Game.enemies.filter(e => !e.boss && !e.dead).slice(0, 5);
    es.forEach((e, i) => {
      e.pos.x = -4 + i * 2.1; e.pos.z = -5.5;
      e.actor.group.position.set(e.pos.x, 0, e.pos.z);
      Game.damageEnemy(e, e.maxHp * (0.2 + i * 0.19), false, { silent: true });
    });
  });
  await wait(900);
  await page.screenshot({ path: 'shots/123-m-hpbar.png' });
  console.log('MOBILE BARS:', JSON.stringify(await page.evaluate(() => {
    const es = Game.enemies.filter(e => !e.boss);
    return { n: es.length, bars: es.filter(e => e.bar).length, err: 0 };
  })), 'ERRORS:', errs.length ? errs.join('|') : 'none');
  await browser.close();
})();
