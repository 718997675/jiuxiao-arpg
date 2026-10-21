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
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);

  const out = [];
  for (const cls of ['warrior', 'mage', 'taoist']) {
    await page.evaluate(c => { Game.startNew(c, 'T'); Game.state.level = 12; Game.recalc(); Game.travelTo('forest'); }, cls);
    await wait(900);
    // 连打 15 刀
    await page.evaluate(() => {
      Game.enemies.slice(0, 3).forEach(e => { e.pos.z = 2.4; });
      for (let i = 0; i < 15; i++) { Game.atkCd = 0; Game.doBasicAttack(); }
    });
    await wait(500);
    // 全技能
    const r = await page.evaluate(() => {
      const res = { cast: 0, fail: [] };
      for (const id of Object.keys(SKILLS)) {
        const sk = SKILLS[id];
        if (sk.cls && sk.cls !== Game.state.cls) continue;
        Game.state.mp = Game.state.stats.mpMax;
        Game.cooldowns = {};
        try { Game.castSkill(id); res.cast++; } catch (e) { res.fail.push(id + ':' + e.message); }
      }
      return res;
    });
    await wait(700);
    const st = await page.evaluate(() => ({
      running: Game.running, hp: Math.round(Game.state.hp),
      calls: Game.renderer.info.render.calls,
      camPunch: +(Game.camPunch || 0).toFixed(3),
      camDist: +Game.camDist.toFixed(1)
    }));
    out.push({ cls, ...r, ...st });
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', errs.length ? errs.slice(0, 8) : 'none');
  await browser.close();
})();
