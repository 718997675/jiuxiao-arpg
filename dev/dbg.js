const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  const st = await page.evaluate(() => ({
    three: typeof THREE, game: typeof Game, ui: typeof UI, fx: typeof FX,
    startVisible: getComputedStyle(document.getElementById('start')).display,
    hasCanvas: !!document.querySelector('canvas')
  }));
  console.log(JSON.stringify(st, null, 1));
  console.log(logs.join('\n') || '(no logs)');
  await page.screenshot({ path: 'shots/00-debug.png' });
  await browser.close();
})();
