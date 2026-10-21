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

  // 全职业技能覆盖测试
  const skillReport = [];
  for (const cls of ['warrior', 'mage', 'taoist']) {
    await page.evaluate(c => { Game.startNew(c, '测试者'); }, cls);
    await wait(900);
    const skills = await page.evaluate(() => SKILL_ORDER[Game.state.cls].slice());
    for (const id of skills) {
      const st = await page.evaluate(sid => {
        Game.state.level = 40; Game.recalc();
        Game.state.mp = 9999;
        Game.cooldowns[sid] = 0;
        const before = FX.zones.length + FX.projectiles.length + Game.enemies.length;
        Game.castSkill(sid);
        return {
          id: sid,
          cd: Game.cooldowns[sid],
          fx: FX.zones.length + FX.projectiles.length,
          enemies: Game.enemies.length,
          mp: Math.round(Game.state.mp)
        };
      }, id);
      await wait(160);
      skillReport.push(st);
    }
    await wait(500);
  }

  // 数据完整性检查
  const dataCheck = await page.evaluate(() => {
    const bossMaps = {};
    Object.values(BOSSES).forEach(b => { bossMaps[b.id] = b.map; });
    const mapBosses = Object.values(MAPS).flatMap(m => m.bosses || []);
    return {
      bosses: Object.keys(BOSSES).length,
      bossMapRefs: mapBosses.length,
      allBossesPlaced: Object.keys(BOSSES).every(id => mapBosses.includes(id)),
      skills: Object.keys(SKILLS).length,
      sets: Object.keys(SETS).length,
      affixes: AFFIXES.length,
      quests: Object.keys(QUESTS).length,
      maps: Object.keys(MAPS).length
    };
  });

  // 掉落抽样统计
  const dropStats = await page.evaluate(() => {
    const c = { common: 0, magic: 0, rare: 0, legendary: 0, set: 0 };
    for (let i = 0; i < 400; i++) c[rollItem(20, { cls: 'warrior', magicFind: 60 }).rarity]++;
    return c;
  });

  // 最终画面
  await page.evaluate(() => { Game.startNew('warrior', '归一刀'); });
  await wait(1200);
  await page.screenshot({ path: 'shots/70-final-village.png' });
  await page.evaluate(() => { Game.travelTo('forest'); });
  await wait(1600);
  await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss);
    if (e) { Game.playerGroup.position.set(e.pos.x + 3, 0, e.pos.z + 5); Game.aimPoint.copy(e.pos); }
  });
  await wait(500);
  await page.evaluate(() => { Game.mouseDown = true; });
  await wait(1600);
  await page.screenshot({ path: 'shots/71-final-combat.png' });
  await page.evaluate(() => { Game.mouseDown = false; UI.toggleInv(); });
  await wait(500);
  await page.screenshot({ path: 'shots/72-final-ui.png' });

  console.log('SKILLS:', skillReport.map(s => `${s.id}:${s.cd > 0 ? 'ok' : 'NO_CD'}`).join(' '));
  console.log('DATA:', JSON.stringify(dataCheck));
  console.log('DROPS(400@ilvl20):', JSON.stringify(dropStats));
  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
  await browser.close();
})();
