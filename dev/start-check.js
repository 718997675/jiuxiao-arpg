const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1600);
  console.log('BEFORE:', JSON.stringify(await page.evaluate(() => ({
    running: Game.running || false,
    canvas: [Game.renderer.domElement.width, Game.renderer.domElement.clientHeight],
    fatal: getComputedStyle(document.getElementById('fatal')).display
  }))));

  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);

  for (const t of [200, 800, 2000]) {
    await wait(t === 200 ? 200 : 600);
    console.log('T+' + t + ':', JSON.stringify(await page.evaluate(() => ({
      running: Game.running || false,
      start: getComputedStyle(document.getElementById('start')).display,
      body: document.body.className,
      map: Game.state ? Game.state.mapId : null,
      cam: Game.camera.position.toArray().map(v => +v.toFixed(1)),
      calls: Game.renderer.info.render.calls,
      tris: Game.renderer.info.render.triangles,
      fatal: getComputedStyle(document.getElementById('fatal')).display
    }))));
    await page.screenshot({ path: `shots/92-start-${t}.png` });
  }
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
