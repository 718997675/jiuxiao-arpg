const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'load' });
  await wait(1500);
  await page.evaluate(() => { document.querySelector('.cclass[data-cls="mage"]').click(); document.getElementById('startBtn').click(); });
  await wait(1600);
  const ok = await page.evaluate(() => ({
    running: Game.running, cls: Game.state.cls, map: Game.state.map,
    lv: Game.state.level, calls: Game.renderer.info.render.calls,
    saveKey: Object.keys(localStorage)
  }));
  console.log('HTTP RUN:', JSON.stringify(ok));
  console.log('ERRORS:', errs.length ? errs.slice(0, 5).join('\n') : 'none');
  await page.screenshot({ path: 'shots/91-http.png' });
  await browser.close();
})();
