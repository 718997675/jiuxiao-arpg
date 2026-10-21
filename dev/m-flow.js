const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.emulate({
    name: 'p',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }
  });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => Game.startNew('taoist', '摸鱼道人'));
  await wait(1200);

  // 走到村长身边
  await page.evaluate(() => {
    const e = Game.npcs['elder'];
    Game.playerGroup.position.set(e.pos.x + 1.4, 0, e.pos.z + 0.6);
    Game.updateInteract();
  });
  await wait(300);
  console.log('INTERACT TARGET:', JSON.stringify(await page.evaluate(() => ({
    target: Game.interactTarget && Game.interactTarget.type,
    useOn: document.getElementById('mUse').classList.contains('on')
  }))));

  // 点「交」按钮
  const ub = await page.$eval('#mUse', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(ub.x, ub.y);
  await wait(600);
  console.log('DIALOG:', JSON.stringify(await page.evaluate(() => {
    const d = document.getElementById('dialog');
    const r = d.getBoundingClientRect();
    return {
      open: getComputedStyle(d).display,
      btns: [...d.querySelectorAll('.dc .btn')].map(b => b.textContent.trim()),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      bodyCls: document.body.className
    };
  })));
  await page.screenshot({ path: 'shots/104-m-dialog.png' });

  // 点第一个对话按钮
  const db = await page.$eval('#dialog .dc .btn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: el.textContent.trim() };
  });
  await page.touchscreen.tap(db.x, db.y);
  await wait(700);
  console.log('AFTER DIALOG BTN(' + db.t + '):', JSON.stringify(await page.evaluate(() => ({
    quests: Game.state.quests.active.map(q => q.id),
    qlog: !!document.querySelector('#questTrack'),
    bodyCls: document.body.className
  }))));

  // 给一件装备，测试触屏 tooltip
  await page.evaluate(() => {
    Game.addItem(rollItem(8, { rarity: 'rare' }));
    UI.renderInventory();
    UI.toggleInv();
  });
  await wait(500);
  const slot = await page.$eval('#invGrid .islot[data-ref]', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(slot.x, slot.y);
  await wait(400);
  console.log('TIP:', JSON.stringify(await page.evaluate(() => {
    const t = document.getElementById('tooltip');
    return {
      shown: getComputedStyle(t).display,
      acts: [...t.querySelectorAll('.tt-act .btn')].map(b => b.textContent.trim()),
      name: (t.querySelector('.tt-name') || {}).textContent
    };
  })));
  await page.screenshot({ path: 'shots/105-m-tooltip.png' });

  const act = await page.$eval('#tooltip .tt-act .btn.primary', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(act.x, act.y);
  await wait(600);
  console.log('EQUIP:', JSON.stringify(await page.evaluate(() => ({
    weapon: Game.state.equipment.weapon ? Game.state.equipment.weapon.name : null,
    weaponSlot: Game.state.equipment.weapon ? Game.state.equipment.weapon.slot : null,
    tipShown: getComputedStyle(document.getElementById('tooltip')).display
  }))));
  await page.screenshot({ path: 'shots/106-m-equipped.png' });

  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
