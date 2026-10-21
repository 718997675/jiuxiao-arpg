const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 手机横屏 844x390（iPhone 12 横置）+ 触屏 */
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=900,500']
  });
  const page = await browser.newPage();
  await page.emulate({
    name: 'phone-landscape',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }
  });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  console.log('DETECT:', JSON.stringify(await page.evaluate(() => ({
    IS_TOUCH, bodyCls: document.body.className,
    mtouch: !!document.getElementById('mtouch'),
    actionbar: getComputedStyle(document.getElementById('actionbar')).display,
    help: getComputedStyle(document.getElementById('help')).display
  }))));
  await page.screenshot({ path: 'shots/100-m-start.png' });

  // 点「踏入山海」
  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(box.x, box.y);
  await wait(1800);
  console.log('START:', JSON.stringify(await page.evaluate(() => ({
    running: Game.running, map: Game.state && Game.state.mapId,
    skills: document.querySelectorAll('#mSkills .mskill').length,
    calls: Game.renderer.info.render.calls
  }))));
  await page.screenshot({ path: 'shots/101-m-play.png' });

  // 摇杆：合成 pointer 事件拖动
  const joyRect = await page.$eval('#mJoy', el => {
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.width / 2 };
  });
  await page.evaluate(({ cx, cy, r }) => {
    const joy = document.getElementById('mJoy');
    const mk = (type, x, y) => joy.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true
    }));
    mk('pointerdown', cx, cy);
    mk('pointermove', cx, cy - r * 0.9);
  }, joyRect);
  await wait(900);
  const moved = await page.evaluate(() => ({
    pos: [+Game.playerGroup.position.x.toFixed(1), +Game.playerGroup.position.z.toFixed(1)],
    mag: +Mobile.mag.toFixed(2)
  }));
  console.log('MOVE UP:', JSON.stringify(moved));
  await page.evaluate(() => {
    document.getElementById('mJoy').dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true }));
  });
  await wait(200);

  // 普攻按钮
  const atk = await page.$eval('#mAtk', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, size: r.width };
  });
  console.log('ATK BOX:', JSON.stringify(atk));
  await page.touchscreen.tap(atk.x, atk.y);
  await wait(400);
  console.log('AFTER ATK:', JSON.stringify(await page.evaluate(() => ({
    atkCd: +Game.atkCd.toFixed(2), attacking: +Game.attacking.toFixed(2)
  }))));

  // 技能 1
  const sk = await page.$$eval('#mSkills .mskill', els => els.map(e => {
    const r = e.getBoundingClientRect();
    return { id: e.dataset.skill, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  }));
  console.log('SKILL BOXES:', JSON.stringify(sk.map(s => [s.id, Math.round(s.x), Math.round(s.y), Math.round(s.w)])));
  await page.touchscreen.tap(sk[0].x, sk[0].y);
  await wait(500);
  console.log('AFTER SKILL:', JSON.stringify(await page.evaluate(() => ({
    cd: +(Game.cooldowns[SKILL_ORDER[Game.state.cls][0]] || 0).toFixed(2),
    mp: Math.round(Game.state.mp)
  }))));
  await page.screenshot({ path: 'shots/102-m-skill.png' });

  // 打开背包
  await page.evaluate(() => UI.toggleInv());
  await wait(500);
  console.log('INV:', JSON.stringify(await page.evaluate(() => {
    const p = document.getElementById('invPanel').getBoundingClientRect();
    return { w: Math.round(p.width), h: Math.round(p.height), left: Math.round(p.left), vw: innerWidth };
  })));
  await page.screenshot({ path: 'shots/103-m-inv.png' });

  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
