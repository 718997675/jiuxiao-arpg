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
  await wait(1500);

  // 在若干屏幕坐标做射线拾取，找出那块半透明棕色面片
  const hits = await page.evaluate(() => {
    const pts = [[760, 452], [800, 470], [730, 430], [700, 500], [850, 440]];
    const rc = new THREE.Raycaster();
    const out = [];
    for (const [x, y] of pts) {
      const ndc = new THREE.Vector2((x / 1440) * 2 - 1, -(y / 900) * 2 + 1);
      rc.setFromCamera(ndc, Game.camera);
      const res = rc.intersectObjects(Game.world.root.children, true).filter(r => r.object.isMesh);
      const h = res[0];
      if (!h) { out.push({ pt: [x, y], hit: null }); continue; }
      const o = h.object;
      let chain = [];
      let n = o;
      for (let i = 0; i < 4 && n; i++) { chain.push(n.name || n.type); n = n.parent; }
      out.push({
        pt: [x, y], geo: o.geometry.type,
        color: o.material && o.material.color ? '#' + o.material.color.getHexString() : '?',
        op: o.material ? +(o.material.opacity ?? 1).toFixed(2) : 1,
        tr: o.material ? !!o.material.transparent : false,
        world: h.point.toArray().map(v => +v.toFixed(1)),
        scale: [+o.scale.x.toFixed(1), +o.scale.y.toFixed(1), +o.scale.z.toFixed(1)],
        chain: chain.join(' < ')
      });
    }
    return out;
  });
  console.log(JSON.stringify(hits, null, 1));
  await browser.close();
})();
