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
  await wait(1200);

  // ---- 1. 战士：静止时灵力不应下降 ----
  await page.evaluate(() => { Game.startNew('warrior', '测刀'); });
  await wait(600);
  const mp0 = await page.evaluate(() => {
    Game.state.mp = 20;
    return { mp: Game.state.mp, max: Game.state.stats.mpMax };
  });
  // 站 3 秒不动
  await wait(3000);
  const mp1 = await page.evaluate(() => ({ mp: Math.round(Game.state.mp * 10) / 10 }));
  // 再放一个技能看是否扣蓝
  const mp2 = await page.evaluate(() => {
    const id = SKILL_ORDER[Game.state.cls][0];
    const before = Game.state.mp;
    Game.castSkill(id);
    return { before: Math.round(before * 10) / 10, after: Math.round(Game.state.mp * 10) / 10 };
  });
  console.log('IDLE-MP:', JSON.stringify({ start: mp0.mp, max: mp0.max, after3s: mp1.mp, regen: mp1.mp > mp0.mp, skill: mp2 }));

  // ---- 2. 去森林看血条 ----
  await page.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1600);
  const info = await page.evaluate(() => {
    const es = Game.enemies.filter(e => !e.boss);
    return {
      count: Game.enemies.length,
      withBar: es.filter(e => e.bar).length,
      first: es[0] ? {
        hp: es[0].hp, maxHp: es[0].maxHp,
        hasBar: !!es[0].bar,
        barY: es[0].bar ? +es[0].bar.group.position.y.toFixed(2) : null,
        fillScale: es[0].bar ? +es[0].bar.fill.scale.x.toFixed(3) : null
      } : null
    };
  });
  console.log('BARS:', JSON.stringify(info));

  // ---- 3. 打一只，血条应缩短 ----
  const hit = await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss && !x.dead);
    if (!e) return null;
    const before = e.bar.fill.scale.x;
    Game.damageEnemy(e, e.maxHp * 0.5, false, { silent: true });
    updateHpBar(e.bar, e.hp / e.maxHp);
    return { before, after: e.bar.fill.scale.x, ratio: e.hp / e.maxHp, color: e.bar.fill.material.color.getHexString() };
  });
  console.log('HIT:', JSON.stringify(hit));

  // ---- 4. 死亡后血条隐藏 ----
  const dead = await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss && !x.dead);
    if (!e) return null;
    Game.damageEnemy(e, 999999, true, {});
    return { dead: e.dead, barVisible: e.bar ? e.bar.group.visible : null };
  });
  console.log('DEATH:', JSON.stringify(dead));

  // ---- 5. 贴近怪物截图 ----
  await page.evaluate(() => {
    const e = Game.enemies.find(x => !x.boss && !x.dead);
    if (e) {
      Game.playerGroup.position.set(e.pos.x, 0, e.pos.z + 6);
      Game.camera.position.set(e.pos.x, 10, e.pos.z + 14);
      Game.damageEnemy(e, e.maxHp * 0.35, false, { silent: true });
      UI.renderHUD(); UI.drawMinimap();
    }
  });
  await wait(900);
  await page.screenshot({ path: 'shots/120-hpbar.png' });

  // ---- 6. 三职业资源条 ----
  const res = await page.evaluate(() => {
    const out = {};
    for (const c of ['warrior', 'mage', 'taoist']) {
      Game.startNew(c, '测');
      UI.renderHUD();
      out[c] = {
        text: document.getElementById('mpText').textContent,
        color: getComputedStyle(document.getElementById('charplate')).getPropertyValue('--res').trim()
      };
    }
    return out;
  });
  console.log('RES:', JSON.stringify(res));

  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})();
