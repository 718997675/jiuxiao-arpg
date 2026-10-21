const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1280,760']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  page.on('pageerror', e => console.log('[err]', e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1100);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(600);
  await page.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1500);

  await page.evaluate(() => {
    Game.enemies.slice().forEach(e => { e.dead = true; e.actor.group.visible = false; });
    Game.playerGroup.position.set(0, 0, 0);
    Game.updatePlayer = function () {
      this.playerGroup.rotation.y = 0;
      this.aimDir.set(0, 0, 1);
      updateActorAnim(this.actor, 0.016);
    };
    Game.camera.position.set(0, 12.2, 11.6);
    // 冻结姿态：p 固定，由外部设定
    window.__p = 0;
    const orig = window.updateActorAnim;
    window.updateActorAnim = function (a, dt) {
      a.atkAnim = Math.max(0, 1 - window.__p);
      a.atkSpeed = 2.5;
      orig(a, dt);
      a.atkAnim = Math.max(0, 1 - window.__p);
    };
  });
  await wait(300);

  const poses = [0, 0.16, 0.34, 0.45, 0.56, 0.75];
  for (const p of poses) {
    await page.evaluate(pp => {
      window.__p = pp;
      Game.actor.atkType = pp > 0 ? 'swing' : 'none';
      Game.actor.combo = 1;
    }, p);
    await wait(220);
    await page.screenshot({
      path: `../shots/gpose-${String(Math.round(p * 100)).padStart(3, '0')}.png`,
      clip: { x: 440, y: 180, width: 400, height: 340 }
    });
  }
  console.log('done');
  await browser.close();
})();
