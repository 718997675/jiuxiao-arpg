const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();
(async () => {
  const b = await puppeteer.launch({ executablePath: require('./_chrome'), headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => errs.push('reqfail: ' + r.url()));

  const resp = await p.goto(URL, { waitUntil: 'load' });
  console.log('HTTP', resp.status());
  await wait(1700);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(900);

  const info = await p.evaluate(() => {
    const s = Game.state;
    const rar = ['common', 'magic', 'rare', 'legendary', 'set'];
    const order = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
    order.forEach((key, i) => {
      const base = key.startsWith('ring') ? 'ring' : key;
      const it = rollItem(26, { slot: base, rarity: rar[i % 5], cls: 'warrior' });
      it.reqLv = 1; s.equipment[key] = it;
    });
    s.inventory = [];
    for (let i = 0; i < 18; i++) {
      const it = rollItem(22, { rarity: rar[i % 5], cls: 'warrior' });
      it.reqLv = 1; s.inventory.push(it);
    }
    UI.toggleInv();
    return { icons: document.querySelectorAll('#invPanel svg.it-ico').length };
  });
  await wait(600);
  await p.screenshot({ path: '../shots/147-live-icons.png' });
  const panel = await p.$('#invPanel');
  if (panel) await panel.screenshot({ path: '../shots/148-live-panel.png' });
  console.log('ICONS', info.icons, 'ERR', errs.length ? errs.slice(0, 4) : 'none');
  await b.close();
})();
