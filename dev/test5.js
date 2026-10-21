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
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(600);
  await page.evaluate(() => {
    document.querySelector('.cclass[data-cls="warrior"]').click();
    document.getElementById('nameInput').value = '归一刀';
    document.getElementById('startBtn').click();
  });
  await wait(1400);

  // 真实键鼠：走到村长旁对话
  await page.evaluate(() => {
    const n = Game.npcs.elder;
    Game.playerGroup.position.set(n.pos.x + 0.5, 0, n.pos.z + 2.2);
  });
  await wait(400);
  await page.keyboard.press('f');
  await wait(500);
  await page.screenshot({ path: 'shots/60-dialog-real.png' });
  const dlgVisible = await page.evaluate(() => getComputedStyle(document.getElementById('dialog')).display);

  // 接任务
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#dlgBtns .btn')].find(x => x.textContent.includes('接下'));
    if (b) b.click();
  });
  await wait(300);

  // 用真实按键放技能（1）
  await page.keyboard.press('1');
  await wait(600);
  await page.screenshot({ path: 'shots/61-skill-key.png' });

  // 打开背包并用真实 hover 看 tooltip
  await page.evaluate(() => {
    Game.addItem(rollItem(20, { cls: 'warrior', rarity: 'set', slot: 'chest' }));
    Game.addItem(rollItem(22, { cls: 'warrior', rarity: 'legendary', slot: 'weapon' }));
    UI.toggleInv();
  });
  await wait(400);
  await page.hover('#invGrid .islot[data-ref]');
  await wait(500);
  await page.screenshot({ path: 'shots/62-tooltip.png' });
  const tt = await page.evaluate(() => ({ visible: document.getElementById('tooltip').style.display, text: document.getElementById('tooltip').innerText.slice(0, 80) }));
  // 点击装备
  const before = await page.evaluate(() => Object.keys(Game.state.equipment).filter(k => Game.state.equipment[k]).length);
  await page.click('#invGrid .islot[data-ref]');
  await wait(400);
  const after = await page.evaluate(() => Object.keys(Game.state.equipment).filter(k => Game.state.equipment[k]).length);
  await page.screenshot({ path: 'shots/63-equip.png' });

  // 存档读档
  await page.evaluate(() => Game.save());
  const saved = await page.evaluate(() => ({ name: Game.state.name, lv: Game.state.level, eq: Game.state.equipment.chest && Game.state.equipment.chest.name }));
  await page.reload({ waitUntil: 'load' });
  await wait(900);
  const hasContinue = await page.evaluate(() => getComputedStyle(document.getElementById('continueBtn')).display);
  await page.click('#continueBtn');
  await wait(1500);
  const loaded = await page.evaluate(() => ({ name: Game.state.name, cls: Game.state.cls, chest: Game.state.equipment.chest && Game.state.equipment.chest.name, quests: Game.state.quests.active.length }));
  await page.screenshot({ path: 'shots/64-loaded.png' });

  // 天堂 Boss 外观
  await page.evaluate(() => {
    Game.state.level = 38; Game.recalc();
    Game.state.playerPos = { x: 0, z: 6 };
    Game.travelTo('heaven');
  });
  await wait(1600);
  await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    Game.playerGroup.position.set(b.pos.x + 2, 0, b.pos.z + 9);
    Game.camDist = 15; Game.camHeight = 14;
  });
  await wait(2800);
  await page.screenshot({ path: 'shots/65-heaven-boss.png' });

  // 长时间运行稳定性（10 秒）
  const t0 = Date.now();
  await wait(10000);
  const stable = await page.evaluate(() => ({
    enemies: Game.enemies.length, loot: Game.loot.length, hp: Math.round(Game.state.hp), dead: Game.dead,
    fx: FX.parts.length + FX.zones.length + FX.projectiles.length,
    calls: Game.renderer.info.render.calls
  }));

  console.log('DIALOG:', dlgVisible);
  console.log('TOOLTIP:', JSON.stringify(tt));
  console.log('EQUIP:', before, '->', after);
  console.log('SAVED:', JSON.stringify(saved), 'CONTINUE:', hasContinue);
  console.log('LOADED:', JSON.stringify(loaded));
  console.log('STABLE:', JSON.stringify(stable));
  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
  await browser.close();
})();
