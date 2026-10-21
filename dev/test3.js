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
  await wait(700);
  await page.evaluate(() => {
    document.querySelector('.cclass[data-cls="taoist"]').click();
    document.getElementById('nameInput').value = '青牛';
    document.getElementById('startBtn').click();
  });
  await wait(1200);

  // 直接给一套装备
  await page.evaluate(() => {
    ['helm', 'chest', 'shoulders', 'gloves', 'boots'].forEach(sl => {
      Game.state.equipment[sl] = rollItem(24, { slot: sl, cls: 'taoist', rarity: 'set' });
    });
    Game.state.equipment.weapon = rollItem(26, { slot: 'weapon', cls: 'taoist', rarity: 'legendary' });
    Game.state.equipment.offhand = rollItem(26, { slot: 'offhand', cls: 'taoist', rarity: 'rare' });
    Game.recalc(); Game.applyDoll(); UI.renderHUD();
  });
  await wait(600);
  await page.screenshot({ path: 'shots/40-geared.png' });

  // 进图刷怪
  await page.evaluate(() => { Game.travelTo('forest'); });
  await wait(1300);
  const killed = await page.evaluate(() => {
    let n = 0;
    for (const e of [...Game.enemies]) {
      if (e.boss) continue;
      Game.damageEnemy(e, 99999, false, { silent: true }); n++;
    }
    return { n, loot: Game.loot.length };
  });
  await wait(900);
  await page.screenshot({ path: 'shots/41-loot-field.png' });

  // 收集掉落：逐个瞬移
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const l = Game.loot[0];
      if (l) Game.playerGroup.position.set(l.pos.x, 0, l.pos.z);
    });
    await wait(220);
  }
  const picked = await page.evaluate(() => ({
    inv: Game.state.inventory.length, gold: Game.state.gold, lootLeft: Game.loot.length,
    names: Game.state.inventory.slice(0, 8).map(i => i.name + '(' + i.rarity + ')'),
    lvl: Game.state.level
  }));

  // 全部穿上最好的
  await page.evaluate(() => {
    const order = { legendary: 5, set: 4, rare: 3, magic: 2, common: 1 };
    const inv = [...Game.state.inventory].sort((a, b) => order[b.rarity] - order[a.rarity]);
    inv.forEach(it => {
      const idx = Game.state.inventory.indexOf(it);
      if (idx >= 0) Game.equipFromInv(idx);
    });
    Game.recalc(); Game.applyDoll();
    UI.toggleInv();
  });
  await wait(500);
  await page.screenshot({ path: 'shots/42-equipped.png' });

  // 关闭背包看纸娃娃
  await page.evaluate(() => UI.closeAll());
  await wait(400);
  await page.screenshot({ path: 'shots/43-paperdoll.png' });

  // 打 BOSS 看掉落
  const bossKill = await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss);
    if (!b) return 'none';
    b.active = true; Game.boss = b; UI.updateBoss(b);
    for (let i = 0; i < 6; i++) Game.damageEnemy(b, 99999, true, { silent: true });
    return { name: b.cfg.name, dead: b.dead, loot: Game.loot.length };
  });
  await wait(1000);
  await page.screenshot({ path: 'shots/44-boss-loot.png' });
  // 拾取 boss 掉落
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const l = Game.loot.find(x => x.item);
      if (l) Game.playerGroup.position.set(l.pos.x, 0, l.pos.z);
    });
    await wait(250);
  }
  const bossLoot = await page.evaluate(() => ({
    inv: Game.state.inventory.length,
    items: Game.state.inventory.map(i => i.name + '|' + i.rarity + '|' + (i.setId || i.power || ''))
  }));

  // 道士技能
  await page.evaluate(() => {
    Game.playerGroup.position.set(0, 0, 6);
    ['summon', 'heal', 'poison', 'taiji'].forEach(s => Game.castSkill(s));
  });
  await wait(1000);
  await page.screenshot({ path: 'shots/45-taoist-skills.png' });

  // 性能采样
  const perf = await page.evaluate(() => new Promise(res => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res({ fps: Math.round(frames / ((performance.now() - t0) / 1000)), calls: Game.renderer.info.render.calls, tris: Game.renderer.info.render.triangles }); };
    requestAnimationFrame(tick);
  }));

  console.log('KILLED:', JSON.stringify(killed));
  console.log('PICKED:', JSON.stringify(picked));
  console.log('BOSS KILL:', JSON.stringify(bossKill));
  console.log('BOSS LOOT:', JSON.stringify(bossLoot).slice(0, 500));
  console.log('PERF:', JSON.stringify(perf));
  console.log('ERRORS:', errs.length ? '\n' + errs.slice(0, 10).join('\n') : 'none');
  await browser.close();
})();
