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
  await page.evaluate(() => { document.querySelector('.cclass[data-cls="taoist"]').click(); document.getElementById('startBtn').click(); });
  await wait(1200);
  await page.evaluate(() => { Game.state.level = 24; Game.recalc(); Game.travelTo('abyss'); });
  await wait(1600);
  await page.evaluate(() => { const b = Game.enemies.find(e => e.boss); if (b) Game.playerGroup.position.set(b.pos.x + 1.5, 0, b.pos.z + 7.5); });
  await wait(1200);
  await page.keyboard.press('1'); await wait(200);
  await page.keyboard.press('3'); await wait(200);
  await page.keyboard.press('4'); await wait(300);
  const zones = await page.evaluate(() => FX.zones.map(z => ({
    t: z.type, r: Math.round(z.radius || 0), c: z.mat ? '#' + z.mat.color.getHexString() : null,
    o: z.mat ? +z.mat.opacity.toFixed(2) : null, blend: z.mat ? z.mat.blending : null
  })));
  // 场上所有大的水平圆面
  const big = await page.evaluate(() => {
    const out = [];
    Game.scene.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const p = o.geometry.parameters || {};
      if (!(p.radius > 2)) return;
      out.push({
        geo: o.geometry.type, r: p.radius, sx: +o.scale.x.toFixed(1),
        y: +o.position.y.toFixed(2), rotx: +o.rotation.x.toFixed(2),
        c: o.material && o.material.color ? '#' + o.material.color.getHexString() : null,
        o: o.material ? +(o.material.opacity ?? 1).toFixed(2) : null,
        bl: o.material ? o.material.blending : null, vis: o.visible
      });
    });
    return out;
  });
  console.log('ZONES', JSON.stringify(zones));
  console.log('BIG', JSON.stringify(big));
  await browser.close();
})();
