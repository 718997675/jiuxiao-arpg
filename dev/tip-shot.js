const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    const tip = document.getElementById('tooltip');
    const wrap = document.createElement('div');
    wrap.id = 'tipwrap';
    wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;display:flex;gap:14px;padding:16px;background:#101318';
    const mk = (slot, rarity, shape) => {
      const it = rollItem(30, { slot, rarity, cls: 'warrior' });
      it.reqLv = 1;
      if (shape) it.shape = shape;
      return `<div style="width:270px">${itemTooltip(it, { hint: '左键装备 / Shift+左键出售' })}</div>`;
    };
    wrap.innerHTML = mk('weapon', 'legendary', 'glaive') + mk('chest', 'set') + mk('offhand', 'rare', 'shield');
    document.body.appendChild(wrap);
    tip.style.display = 'none';
  });
  await wait(400);
  const el = await p.$('#tipwrap');
  await el.screenshot({ path: '../shots/144-tip.png' });
  await b.close();
  console.log('ok');
})();
