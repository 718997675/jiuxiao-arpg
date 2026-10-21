const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: ['--no-sandbox', '--window-size=1440,900', '--window-position=0,0']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1800);
  console.log('BEFORE:', JSON.stringify(await page.evaluate(() => ({
    running: Game.running,
    startDisplay: getComputedStyle(document.getElementById('start')).display,
    bodyCls: document.body.className,
    canvas: [Game.renderer.domElement.width, Game.renderer.domElement.height, Game.renderer.domElement.clientWidth, Game.renderer.domElement.clientHeight],
    bg: Game.scene.background ? '#' + Game.scene.background.getHexString() : null
  }))));

  // 真实鼠标点击「踏 入 山 海」
  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);

  for (const t of [150, 500, 1200, 2600]) {
    await wait(t === 150 ? 150 : t - 150);
    const st = await page.evaluate(() => {
      let err = null;
      try {
        err = window.__lastErr || null;
      } catch (e) { err = 'x'; }
      return {
        running: Game.running, dead: Game.dead,
        startDisplay: getComputedStyle(document.getElementById('start')).display,
        bodyCls: document.body.className,
        hpOpacity: getComputedStyle(document.getElementById('charplate')).opacity,
        map: Game.state ? Game.state.mapId : null,
        bg: Game.scene.background ? '#' + Game.scene.background.getHexString() : null,
        cam: Game.camera.position.toArray().map(v => +v.toFixed(1)),
        player: Game.playerGroup ? [Game.playerGroup.position.x, Game.playerGroup.position.z] : null,
        calls: Game.renderer.info.render.calls,
        tris: Game.renderer.info.render.triangles,
        sceneChildren: Game.scene.children.length,
        canvas: [Game.renderer.domElement.width, Game.renderer.domElement.height]
      };
    });
    console.log('T+' + t + ':', JSON.stringify(st));
    await page.screenshot({ path: `shots/92-start-${t}.png` });
  }
  console.log('ERRORS:', errs.length ? errs.join('\n---\n') : 'none');
  await browser.close();
})();
