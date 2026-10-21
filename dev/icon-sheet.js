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
    const keys = Object.keys(ITEM_ICONS);
    const html = `<div style="display:flex;flex-wrap:wrap;gap:14px;padding:20px;background:#14181e;width:760px">` +
      keys.map(k => `<div style="text-align:center;color:#dfe6ef;font:11px sans-serif">
        <div style="width:56px;height:56px;border:1px solid #333c48;border-radius:4px;display:flex;align-items:center;justify-content:center;background:#0e1218">
          <svg class="it-ico" viewBox="0 0 32 32" fill="currentColor" style="color:#e8d9b8;width:38px;height:38px">${ITEM_ICONS[k]}</svg></div>
        <div style="margin-top:4px">${k}</div></div>`).join('') + `</div>`;
    const d = document.createElement('div');
    d.id = 'allicons'; d.innerHTML = html;
    d.style.cssText = 'position:fixed;left:0;top:0;z-index:9999';
    document.body.appendChild(d);
  });
  await wait(300);
  const all = await p.$('#allicons');
  await all.screenshot({ path: '../shots/145-allicons.png' });
  await b.close();
  console.log('ok');
})();
