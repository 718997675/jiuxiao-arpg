const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(700);
  await page.evaluate(() => {
    document.querySelector('.cclass[data-cls="taoist"]').click();
    document.getElementById('startBtn').click();
  });
  await wait(1200);
  const out = await page.evaluate(() => {
    Game.state.level = 24; Game.recalc(); Game.travelTo('abyss');
    return true;
  });
  await wait(1500);
  const info = await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    if (!b) return 'no boss';
    const mats = [];
    b.actor.group.traverse(o => {
      if (o.isMesh && o.material && o.material.color && o.material.emissive) mats.push({
        c: '#' + o.material.color.getHexString(),
        e: '#' + o.material.emissive.getHexString(),
        ei: o.material.emissiveIntensity
      });
    });
    return { name: b.cfg.name, scale: b.actor.group.scale.x, flash: b.actor.flash, mats: mats.slice(0, 8), n: mats.length };
  });
  console.log(JSON.stringify(info, null, 1));
  // 把镜头拉近看 boss 本体
  await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    Game.playerGroup.position.set(b.pos.x, 0, b.pos.z + 4.5);
    Game.camDist = 8; Game.camHeight = 6.5;
  });
  await wait(1500);
  await page.screenshot({ path: 'shots/84-spider.png' });
  await browser.close();
})();
