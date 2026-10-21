const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.emulate({
    name: 'p',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }
  });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => Game.startNew('mage', '试法'));
  await wait(1200);
  const yaw0 = await page.evaluate(() => Game.camYaw);

  // 单指拖动画面 → 转视角
  await page.evaluate(() => {
    const cv = document.getElementById('gl');
    const mk = (t, x) => cv.dispatchEvent(new PointerEvent(t, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true, cancelable: true, isPrimary: true
    }));
    mk('pointerdown', 420);
    mk('pointermove', 520);
    mk('pointermove', 620);
    mk('pointerup', 620);
  });
  await wait(300);
  const yaw1 = await page.evaluate(() => Game.camYaw);
  console.log('YAW:', yaw0.toFixed(3), '→', yaw1.toFixed(3));

  // 双指捏合 → 拉远
  const d0 = await page.evaluate(() => Game.camDist);
  await page.evaluate(() => {
    const cv = document.getElementById('gl');
    const mk = (t, id, x) => cv.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true, cancelable: true, isPrimary: id === 8
    }));
    mk('pointerdown', 8, 380); mk('pointerdown', 9, 460);
    mk('pointermove', 8, 340); mk('pointermove', 9, 500);
    mk('pointerup', 8, 340); mk('pointerup', 9, 500);
  });
  await wait(300);
  const d1 = await page.evaluate(() => Game.camDist);
  console.log('DIST:', d0.toFixed(1), '→', d1.toFixed(1));

  // Boss 场景：跳去幽冥深渊
  await page.evaluate(() => {
    Game.state.level = 26; Game.recalc();
    Game.loadMap('abyss');
  });
  await wait(2500);
  console.log('ABYSS:', JSON.stringify(await page.evaluate(() => ({
    map: Game.state.mapId,
    bosses: Game.enemies.filter(e => e.boss).length,
    bossbar: getComputedStyle(document.getElementById('bossbar')).display,
    calls: Game.renderer.info.render.calls
  }))));
  // 把 Boss 拉到眼前并激活
  await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss && !e.dead);
    if (b) {
      Game.playerGroup.position.set(b.pos.x, 0, b.pos.z + 6);
      UI.updateBoss(b);
    }
  });
  await wait(900);
  console.log('BOSSBAR:', JSON.stringify(await page.evaluate(() => {
    const r = document.getElementById('bossbar').getBoundingClientRect();
    return { shown: getComputedStyle(document.getElementById('bossbar')).display, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  })));
  await page.screenshot({ path: 'shots/107-m-boss.png' });

  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
