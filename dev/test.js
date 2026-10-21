const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => logs.push('[console.' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('requestfailed', r => logs.push('[requestfailed] ' + r.url() + ' ' + r.failure().errorText));

  const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(file, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'shots/01-title.png' });

  // 开始游戏
  await page.evaluate(() => {
    const b = document.getElementById('startBtn');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: 'shots/02-village.png' });

  // 移动 + 攻击
  await page.mouse.move(720, 300);
  await page.keyboard.down('w');
  await new Promise(r => setTimeout(r, 700));
  await page.keyboard.up('w');
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 500));
  await page.mouse.up();
  await page.screenshot({ path: 'shots/03-attack.png' });

  const info = await page.evaluate(() => ({
    hasState: !!Game.state,
    level: Game.state && Game.state.level,
    hp: Game.state && Math.round(Game.state.hp),
    stats: Game.state && Math.round(Game.state.stats.atk),
    enemies: Game.enemies.length,
    map: Game.state && Game.state.mapId,
    y: Game.playerGroup && Game.playerGroup.position.y,
    pos: Game.playerGroup && [+Game.playerGroup.position.x.toFixed(1), +Game.playerGroup.position.z.toFixed(1)],
    inventory: Game.state && Game.state.inventory.length,
    quests: Game.state && Game.state.quests.active.length,
    fps: Game.renderer.info.render
  }));
  console.log('INFO', JSON.stringify(info, null, 1));

  // 尝试攻击附近怪物
  await page.evaluate(() => { Game.travelTo('forest'); });
  await new Promise(r => setTimeout(r, 1600));
  await page.screenshot({ path: 'shots/04-forest.png' });

  await page.evaluate(() => {
    // 传送到最近的怪旁边，放技能
    const e = Game.enemies[0];
    if (e) { Game.playerGroup.position.set(e.pos.x + 2, 0, e.pos.z + 2); }
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    Game.castSkill('whirl');
    Game.castSkill('thrust');
  });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'shots/05-combat.png' });

  const info2 = await page.evaluate(() => ({
    enemyCount: Game.enemies.length,
    nearestHp: Game.enemies[0] && Math.round(Game.enemies[0].hp),
    dead: Game.enemies.filter(e => e.dead).length,
    loot: Game.loot.length,
    xp: Game.state.xp, lvl: Game.state.level,
    err: window.__err || null
  }));
  console.log('INFO2', JSON.stringify(info2));

  // 打开背包
  await page.evaluate(() => UI.toggleInv());
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'shots/06-inventory.png' });

  // 升级测试 + 装备生成
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) Game.addItem(rollItem(12 + i, { cls: Game.state.cls, rarity: i < 3 ? 'set' : 'legendary' }));
    UI.renderInventory();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'shots/07-inventory-items.png' });

  console.log('---LOGS---');
  console.log(logs.join('\n') || '(no logs)');
  await browser.close();
})();
