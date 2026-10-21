const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle'] });
  const p = await b.newPage();
  await p.emulate({
    name: 'phone-portrait',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false }
  });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    const s = Game.state;
    const rar = ['common', 'magic', 'rare', 'legendary', 'set'];
    const order = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
    order.forEach((key, i) => {
      const base = key.startsWith('ring') ? 'ring' : key;
      const it = rollItem(24, { slot: base, rarity: rar[i % 5], cls: 'warrior' });
      it.reqLv = 1;
      s.equipment[key] = it;
    });
    s.inventory = [];
    for (let i = 0; i < 16; i++) {
      const it = rollItem(20, { rarity: rar[i % 5], cls: 'warrior' });
      it.reqLv = 1;
      s.inventory.push(it);
    }
    UI.toggleInv();
  });
  await wait(700);
  await p.screenshot({ path: '../shots/146-m-icons.png' });
  console.log('ERR', errs.length ? errs : 'none');
  await b.close();
})();
