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
  await wait(2200);
  await page.screenshot({ path: 'shots/80-title.png' });

  // 道士开局（法术特效最好看）
  await page.evaluate(() => {
    document.querySelector('.cclass[data-cls="taoist"]').click();
    document.getElementById('nameInput').value = '青囊客';
    document.getElementById('startBtn').click();
  });
  await wait(1600);

  // 村中散步看 NPC 与感叹号
  await page.evaluate(() => {
    Game.playerGroup.position.set(2.5, 0, 3.5);
    Game.camYaw = 0.55;
  });
  await wait(1200);
  await page.screenshot({ path: 'shots/81-village.png' });

  // 装备一套 Qinglong 让纸娃娃亮起来
  await page.evaluate(() => {
    Game.state.level = 24; Game.recalc();
    const slots = ['helm', 'shoulders', 'chest', 'gloves', 'belt', 'boots', 'weapon', 'offhand', 'amulet', 'ring', 'ring'];
    for (const s of slots) {
      const it = rollItem(24, { cls: 'taoist', slot: s, rarity: s === 'weapon' || s === 'chest' ? 'set' : undefined });
      Game.state.inventory.push(it);
      Game.equipFromInv(Game.state.inventory.length - 1);
    }
    Game.recalc();
    for (let i = 0; i < 14; i++) Game.addItem(rollItem(26));
    UI.toggleInv();
  });
  await wait(700);
  await page.mouse.move(1200, 700);
  await wait(500);
  await page.screenshot({ path: 'shots/82-paperdoll.png' });

  // 竹林战斗（打击感）
  await page.evaluate(() => {
    UI.toggleInv();
    Game.state.level = 12; Game.recalc();
    Game.travelTo('forest');
  });
  await wait(1600);
  await page.evaluate(() => {
    const e = Game.enemies[0];
    if (e) Game.playerGroup.position.set(e.pos.x, 0, e.pos.z + 3.2);
  });
  await wait(900);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(720, 450);
    await wait(180);
  }
  await page.keyboard.press('1');
  await wait(220);
  await page.keyboard.press('4');
  await wait(260);
  await page.screenshot({ path: 'shots/83-forest.png' });

  // 去幽冥深渊打 Boss
  await page.evaluate(() => {
    Game.state.level = 24; Game.recalc();
    Game.travelTo('abyss');
  });
  await wait(1800);
  await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    if (b) Game.playerGroup.position.set(b.pos.x + 1.5, 0, b.pos.z + 7.5);
  });
  await wait(1600);
  // 放几个技能制造特效
  await page.keyboard.press('1');
  await wait(260);
  await page.keyboard.press('3');
  await wait(200);
  await page.keyboard.press('4');
  await wait(420);
  await page.screenshot({ path: 'shots/84-boss.png' });

  const info = await page.evaluate(() => ({
    fps: Math.round(1 / Math.max(Game.clock.getDelta(), 0.0001)),
    calls: Game.renderer.info.render.calls,
    tris: Game.renderer.info.render.triangles,
    boss: Game.boss ? Game.boss.cfg.name : null,
    bossHp: Game.boss ? Math.round(Game.boss.hp) : null
  }));
  console.log('INFO:', JSON.stringify(info));
  console.log('ERRORS:', errs.length ? errs.slice(0, 6).join('\n') : 'none');
  await browser.close();
})();
