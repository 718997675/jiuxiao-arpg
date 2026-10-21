const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://jiuxiao-arpg.app.workbuddy.host/?sharecode=KMOWFYC4VF';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1280,760']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));

  const resp = await page.goto(URL, { waitUntil: 'load' });
  console.log('HTTP', resp.status());
  await wait(1600);
  await page.click('#startBtn').catch(() => {});
  await wait(400);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(900);
  await page.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1600);

  // 采样一次普攻的手臂轨迹
  const track = await page.evaluate(async () => {
    const P = Game.actor.parts;
    const arr = [];
    Game.atkCd = 0; Game.doBasicAttack();
    const t0 = performance.now();
    await new Promise(res => {
      const iv = setInterval(() => {
        arr.push([Math.round(performance.now() - t0), +P.armR.rotation.x.toFixed(2), +P.armR.rotation.z.toFixed(2), +P.torso.rotation.y.toFixed(2)]);
        if (performance.now() - t0 > 520) { clearInterval(iv); res(); }
      }, 30);
    });
    return arr;
  });
  const xs = track.map(r => r[1]), zs = track.map(r => r[2]), ty = track.map(r => r[3]);
  console.log('armRx range', Math.min(...xs), Math.max(...xs));
  console.log('armRz range', Math.min(...zs), Math.max(...zs));
  console.log('torsoY range', Math.min(...ty), Math.max(...ty));
  console.log('dur ms', track[track.length - 1][0]);

  await page.evaluate(() => { Game.atkCd = 0; Game.doBasicAttack(); });
  await wait(180);
  await page.screenshot({ path: '../shots/130-live-swing.png' });

  const info = await page.evaluate(() => ({
    running: Game.running, calls: Game.renderer.info.render.calls,
    camDist: Game.camDist, camPunch: +(Game.camPunch || 0).toFixed(3)
  }));
  console.log('INFO', JSON.stringify(info));
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : 'none');
  await browser.close();
})();
