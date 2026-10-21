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
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(600);
  await page.evaluate(() => { Game.startNew('warrior', '查'); });
  await wait(1200);

  const list = await page.evaluate(() => {
    const out = [];
    Game.world.root.traverse(o => {
      if (!o.isMesh) return;
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      if (Math.abs(p.x) > 9 || Math.abs(p.z) > 12) return;
      if (p.y > 2.2) return;
      const m = o.material;
      const col = m && m.color ? '#' + m.color.getHexString() : '?';
      const op = m && m.opacity !== undefined ? +m.opacity.toFixed(2) : 1;
      const tr = m ? !!m.transparent : false;
      out.push({
        name: o.name || o.parent.name || '(无名)',
        pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
        scale: [+o.scale.x.toFixed(1), +o.scale.y.toFixed(1), +o.scale.z.toFixed(1)],
        color: col, op, tr,
        geo: o.geometry.type
      });
    });
    return out;
  });
  console.log(JSON.stringify(list, null, 0).replace(/\},\{/g, '}\n{'));
  await browser.close();
})();
