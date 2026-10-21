const puppeteer = require('puppeteer-core');
const path = require('path');
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
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(2500);
  const info = await page.evaluate(() => ({
    running: Game.running,
    hasTitleGroup: !!Game.titleGroup,
    titleChildren: Game.titleGroup ? Game.titleGroup.children.length : -1,
    titleInScene: Game.titleGroup ? !!Game.titleGroup.parent : false,
    sceneChildren: Game.scene.children.length,
    bg: Game.scene.background ? '#' + Game.scene.background.getHexString() : null,
    fog: Game.scene.fog ? [Game.scene.fog.near, Game.scene.fog.far] : null,
    cam: Game.camera.position.toArray().map(v => +v.toFixed(1)),
    calls: Game.renderer.info.render.calls,
    tris: Game.renderer.info.render.triangles,
    lights: Game.scene.children.filter(o => o.isLight).map(o => o.type + ':' + o.intensity),
    canvasSize: [Game.renderer.domElement.width, Game.renderer.domElement.height],
    startDisplay: getComputedStyle(document.getElementById('start')).display,
    startBg: getComputedStyle(document.getElementById('start')).backgroundImage.slice(0, 120)
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'shots/90-cold-start.png' });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
