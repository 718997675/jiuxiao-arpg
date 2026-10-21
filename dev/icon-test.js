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
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(700);

  const info = await page.evaluate(() => {
    const s = Game.state;
    const shapes = [
      ['sword', 'weapon', 'legendary'], ['saber', 'weapon', 'rare'], ['axe', 'weapon', 'magic'],
      ['glaive', 'weapon', 'rare'], ['staff', 'weapon', 'legendary'], ['taojian', 'weapon', 'common'],
      ['shield', 'offhand', 'rare'], ['orb', 'offhand', 'magic'], ['charm', 'offhand', 'set']
    ];
    const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];
    const rar = ['common', 'magic', 'rare', 'legendary', 'set'];

    s.inventory = [];
    // 背包：9 种武器/副手 + 各部位
    shapes.forEach(([sh, slot, rarity], i) => {
      const it = rollItem(20, { slot, rarity, cls: 'warrior' });
      it.shape = sh; it.name = '测试' + sh; it.rarity = rarity; it.reqLv = 1;
      s.inventory.push(it);
    });
    slots.forEach((sl, i) => {
      const base = sl.startsWith('ring') ? 'ring' : sl;
      const it = rollItem(18, { slot: base, rarity: rar[i % 5], cls: 'warrior' });
      it.name = '测试' + base; it.reqLv = 1;
      s.inventory.push(it);
    });
    // 再塞几件同部位不同稀有度，看配色
    ['helm', 'chest', 'weapon', 'boots'].forEach((sl, i) => {
      const it = rollItem(30, { slot: sl, rarity: rar[(i + 2) % 5], cls: 'warrior' });
      it.reqLv = 1;
      s.inventory.push(it);
    });

    // 装备栏：全部装上
    const order = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
    for (const key of order) {
      const base = key.startsWith('ring') ? 'ring' : key;
      const it = rollItem(22, { slot: base, rarity: rar[Math.floor(Math.random() * 5)], cls: 'warrior' });
      it.reqLv = 1;
      s.equipment[key] = it;
    }
    UI.toggleInv();
    return { inv: s.inventory.length };
  });
  await wait(500);
  await page.screenshot({ path: '../shots/140-icons-inv.png' });
  const ipanel = await page.$('#invPanel');
  if (ipanel) await ipanel.screenshot({ path: '../shots/143-icons-panel.png' });

  // hover 第一件背包物品，看 tooltip
  const box = await page.$eval('#invGrid .islot.filled, #invGrid .islot[data-ref]', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }).catch(() => null);
  if (box) {
    await page.mouse.move(box.x, box.y);
    await wait(400);
    await page.screenshot({ path: '../shots/141-icons-tip.png' });
  }

  // 商店
  await page.evaluate(() => {
    UI.closeAll();
    const items = [];
    for (let i = 0; i < 6; i++) {
      const it = rollItem(18, { cls: 'warrior' });
      items.push({ item: it, price: itemValue(it) });
    }
    UI.openShop(items, '铁 匠 铺');
  });
  await wait(400);
  await page.screenshot({ path: '../shots/142-icons-shop.png' });

  console.log('inv', info.inv, 'ERRORS', errs.length ? errs : 'none');
  await browser.close();
})();
