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
  page.on('pageerror', e => console.log('[err]', e.message));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1100);
  await page.evaluate(() => { Game.startNew('warrior', '测刀'); });
  await wait(500);

  // 森林：把怪拉到玩家身边，镜头拉近
  await page.evaluate(() => {
    Game.state.level = 10; Game.recalc();
    Game.travelTo('forest');
  });
  await wait(1400);
  await page.evaluate(() => {
    // 把 4 只怪排到玩家前方
    const es = Game.enemies.filter(e => !e.boss && !e.dead).slice(0, 4);
    es.forEach((e, i) => {
      e.pos.x = -3 + i * 2.2; e.pos.z = -4;
      e.actor.group.position.set(e.pos.x, 0, e.pos.z);
      Game.damageEnemy(e, e.maxHp * (0.25 + i * 0.22), false, { silent: true });
      updateHpBar(e.bar, e.hp / e.maxHp);
    });
    Game.playerGroup.position.set(-2, 0, 2);
    Game.camDist = 11; Game.camHeight = 10;
    Game.camera.position.set(-1, 9, 12);
  });
  await wait(800);
  await page.screenshot({ path: 'shots/121-hpbar-close.png' });
  await page.screenshot({ path: 'shots/121b-hpbar-crop.png', clip: { x: 380, y: 40, width: 720, height: 400 } });

  // 深渊：蜘蛛 + 首领（不应有头顶小血条）
  await page.evaluate(() => {
    Game.state.level = 24; Game.recalc();
    Game.travelTo('abyss');
  });
  await wait(1400);
  const bossInfo = await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    const m = Game.enemies.find(e => !e.boss && !e.dead);
    if (m) Game.damageEnemy(m, m.maxHp * 0.45, false, { silent: true });
    if (b) Game.damageEnemy(b, b.maxHp * 0.3, false, { silent: true });
    return {
      bossHasBar: b ? !!b.bar : null,
      mobHasBar: m ? !!m.bar : null
    };
  });
  await wait(700);
  await page.screenshot({ path: 'shots/122-hpbar-abyss.png' });
  console.log('ABYSS:', JSON.stringify(bossInfo));
  await browser.close();
})();
