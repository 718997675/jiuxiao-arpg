const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [], failed = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('requestfailed', r => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  console.log('HTTP:', resp.status());
  await wait(2500);
  await page.screenshot({ path: 'shots/95-live-title.png' });

  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await wait(2200);

  const st = await page.evaluate(() => ({
    running: Game.running || false,
    map: Game.state ? Game.state.mapId : null,
    lvl: Game.state ? Game.state.level : null,
    calls: Game.renderer.info.render.calls,
    tris: Game.renderer.info.render.triangles,
    save: (() => { try { return !!localStorage.getItem('jiuxiao_save_v1'); } catch (e) { return 'blocked'; } })(),
    fatal: getComputedStyle(document.getElementById('fatal')).display
  }));
  console.log('AFTER START:', JSON.stringify(st));
  await page.screenshot({ path: 'shots/96-live-game.png' });

  // 走几步 + 放个技能
  await page.keyboard.down('w'); await wait(700); await page.keyboard.up('w');
  await page.keyboard.press('1');
  await wait(900);
  console.log('MOVE:', JSON.stringify(await page.evaluate(() => ({
    pos: Game.playerGroup ? [+Game.playerGroup.position.x.toFixed(1), +Game.playerGroup.position.z.toFixed(1)] : null,
    hp: Game.state ? Math.round(Game.state.hp) : null
  }))));
  await page.screenshot({ path: 'shots/97-live-play.png' });

  console.log('FAILED_REQ:', failed.length ? failed.join('\n') : 'none');
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
