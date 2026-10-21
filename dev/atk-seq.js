const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=900,760']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 760 });
  page.on('pageerror', e => console.log('[err]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[con]', m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1100);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(600);

  await page.evaluate(() => {
    Game.state.level = 10; Game.recalc();
    Game.travelTo('forest');
  });
  await wait(1500);

  // 清场 + 固定侧前方机位
  await page.evaluate(() => {
    Game.enemies.slice().forEach(e => { e.dead = true; e.actor.group.visible = false; });
    Game.playerGroup.position.set(0, 0, 0);
    Game.playerGroup.rotation.y = 0;               // 面朝 +Z
    Game.aimDir.set(0, 0, 1);
    Game.camDist = 6; Game.camHeight = 3;
    Game.updateCamera = function () {
      this.camera.position.set(2.6, 2.4, 4.4);
      this.camera.lookAt(0, 1.05, 0);
    };
    Game.actor.atkAnim = 0;
  });
  await wait(300);

  await page.screenshot({ path: '../shots/atk-00-idle.png' });

  // 触发一次普攻，逐帧采样手臂/躯干角度
  await page.evaluate(() => {
    window.__samples = [];
    Game.doBasicAttack();
    const P = Game.actor.parts;
    const t0 = performance.now();
    window.__sampler = setInterval(() => {
      window.__samples.push({
        t: +(performance.now() - t0).toFixed(0),
        a: +P.armR.rotation.x.toFixed(2),
        z: +P.armR.rotation.z.toFixed(2),
        ty: +P.torso.rotation.y.toFixed(2),
        tx: +P.torso.rotation.x.toFixed(2)
      });
    }, 25);
  });

  const files = [];
  for (let i = 1; i <= 9; i++) {
    await wait(46);
    const f = `../shots/atk-${String(i).padStart(2, '0')}.png`;
    files.push(f);
    await page.screenshot({ path: f });
  }

  const data = await page.evaluate(() => { clearInterval(window.__sampler); return window.__samples; });
  console.log(JSON.stringify(data));
  console.log('files', files.length);

  // 第二刀（反手）
  await wait(500);
  await page.evaluate(() => { Game.actor.comboAt = 0; Game.doBasicAttack(); });
  await wait(200);
  await page.screenshot({ path: '../shots/atk-10-combo2.png' });

  await browser.close();
})();
