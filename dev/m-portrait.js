const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 手机竖屏 390x844 */
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.emulate({
    name: 'phone-portrait',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false }
  });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await page.screenshot({ path: 'shots/110-p-start.png' });

  const btn = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('STARTBTN:', JSON.stringify(btn), 'vh', await page.evaluate(() => innerHeight));
  await page.touchscreen.tap(btn.x, btn.y);
  await wait(1600);
  console.log('START:', JSON.stringify(await page.evaluate(() => ({ running: Game.running, map: Game.state && Game.state.mapId }))));
  await page.screenshot({ path: 'shots/111-p-play.png' });

  const boxes = await page.evaluate(() => {
    const g = id => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };
    return {
      joy: g('mJoy'), atk: g('mAtk'),
      sk: [...document.querySelectorAll('#mSkills .mskill')].map(e => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top)];
      }),
      util: [...document.querySelectorAll('#mUtil .mbtn')].map(e => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top)];
      }),
      vw: innerWidth, vh: innerHeight
    };
  });
  console.log('BOXES:', JSON.stringify(boxes));

  await page.evaluate(() => UI.toggleInv());
  await wait(500);
  await page.screenshot({ path: 'shots/112-p-inv.png' });
  await page.evaluate(() => UI.closeAll());

  await page.evaluate(() => UI.toggleStat());
  await wait(400);
  await page.screenshot({ path: 'shots/113-p-stat.png' });
  await page.evaluate(() => UI.closeAll());

  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
