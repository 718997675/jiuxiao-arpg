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
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message + ' | ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(700);

  // 选择法师
  await page.evaluate(() => {
    document.querySelector('.cclass[data-cls="mage"]').click();
    document.getElementById('nameInput').value = '玄机子';
    document.getElementById('startBtn').click();
  });
  await wait(1500);
  await page.screenshot({ path: 'shots/20-mage-village.png' });

  // 对话：村长
  const dlg = await page.evaluate(() => {
    Game.playerGroup.position.set(Game.npcs.elder.pos.x, 0, Game.npcs.elder.pos.z + 2.2);
    return true;
  });
  await wait(500);
  await page.evaluate(() => Game.openNPC('elder'));
  await wait(400);
  await page.screenshot({ path: 'shots/21-dialog.png' });
  const dlgText = await page.evaluate(() => document.getElementById('dlgText').textContent.slice(0, 60));
  const quest = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#dlgBtns .btn')];
    const accept = btns.find(b => b.textContent.includes('接下'));
    if (accept) accept.click();
    return { active: Game.state.quests.active.map(a => a.id), next: Game.state.quests.next };
  });
  await wait(300);
  await page.screenshot({ path: 'shots/22-quest-accepted.png' });

  // 去幽篁林，放技能
  await page.evaluate(() => { Game.travelTo('forest'); });
  await wait(1500);
  await page.screenshot({ path: 'shots/23-forest-mage.png' });

  // 传送到怪堆
  const near = await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss);
    Game.playerGroup.position.set(e.pos.x + 4, 0, e.pos.z + 4);
    return { kind: e.kind, hp: Math.round(e.hp) };
  });
  await wait(400);
  // 鼠标瞄准最近的敌人
  await page.evaluate(() => { Game.aimPoint.set(Game.enemies[0].pos.x, 0, Game.enemies[0].pos.z); });
  await page.evaluate(() => { ['fireball', 'frostnova', 'chain'].forEach(s => Game.castSkill(s)); });
  await wait(600);
  await page.screenshot({ path: 'shots/24-mage-skills.png' });

  // 测试击杀 / 掉落 / 经验
  const kill = await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss && !x.dead);
    if (!e) return 'no enemy';
    for (let i = 0; i < 4; i++) Game.damageEnemy(e, 9999, false, { silent: true });
    return { dead: e.dead, loot: Game.loot.length, xp: Game.state.xp, lvl: Game.state.level, quest: Game.state.quests.active[0] && Game.state.quests.active[0].progress };
  });
  await wait(1200);
  const afterLoot = await page.evaluate(() => ({ loot: Game.loot.length, inv: Game.state.inventory.length, gold: Game.state.gold }));
  await page.screenshot({ path: 'shots/25-loot.png' });

  // 拾取：把玩家移到掉落物上
  await page.evaluate(() => {
    const l = Game.loot[0];
    if (l) Game.playerGroup.position.set(l.pos.x, 0, l.pos.z);
  });
  await wait(800);
  const picked = await page.evaluate(() => ({ loot: Game.loot.length, inv: Game.state.inventory.length }));

  // 装备掉落物 + 打开背包
  await page.evaluate(() => {
    if (Game.state.inventory[0]) Game.equipFromInv(0);
    UI.toggleInv();
  });
  await wait(500);
  await page.screenshot({ path: 'shots/26-mage-inv.png' });

  // 任务完成流程（手动补进度）
  const questDone = await page.evaluate(() => {
    const a = Game.state.quests.active[0];
    if (!a) return 'no active';
    const q = QUESTS[a.id];
    a.progress = q.objectives.map(o => o.count);
    Game.turnInQuest(a);
    return { done: Game.state.quests.done, next: Game.state.quests.next, gold: Game.state.gold, lvl: Game.state.level };
  });
  await wait(600);
  await page.screenshot({ path: 'shots/27-quest-done.png' });

  // 各图巡览
  for (const m of ['swamp', 'mine', 'abyss', 'heaven']) {
    await page.evaluate(id => { Game.state.level = 40; Game.recalc(); Game.travelTo(id); }, m);
    await wait(1700);
    await page.screenshot({ path: 'shots/30-' + m + '.png' });
  }

  // 打一场 Boss（混沌）
  const bossFight = await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    if (!b) return 'no boss';
    Game.playerGroup.position.set(b.pos.x + 5, 0, b.pos.z + 5);
    return { name: b.cfg.name, hp: b.maxHp, active: b.active };
  });
  await wait(2500);
  await page.screenshot({ path: 'shots/31-boss.png' });
  const bossState = await page.evaluate(() => ({
    active: Game.boss && Game.boss.cfg.name,
    bossHp: Game.boss && Math.round(Game.boss.hp),
    playerHp: Math.round(Game.state.hp),
    dead: Game.dead
  }));

  console.log('DIALOG:', dlgText);
  console.log('QUEST:', JSON.stringify(quest));
  console.log('NEAR:', JSON.stringify(near));
  console.log('KILL:', JSON.stringify(kill));
  console.log('AFTER LOOT:', JSON.stringify(afterLoot));
  console.log('PICKED:', JSON.stringify(picked));
  console.log('QUEST DONE:', JSON.stringify(questDone));
  console.log('BOSS:', JSON.stringify(bossFight), JSON.stringify(bossState));
  console.log('ERRORS:', errs.length ? '\n' + errs.slice(0, 12).join('\n') : 'none');
  await browser.close();
})();
