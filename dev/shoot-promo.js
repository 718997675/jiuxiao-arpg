/* 生成推广用截图：输出到 docs/screenshots/（不受 .gitignore 的 shots/ 影响） */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const W = 1440, H = 810;

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1600);

  // 1) 开始界面
  await p.screenshot({ path: path.join(OUT, '01-title.png') });
  console.log('title ok');

  // 进游戏
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    // 穿一套高品阶装备，让纸娃娃有完整外观（截图用）
    const eq = Game.state.equipment;
    const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'offhand'];
    const plan = { helm: 'legendary', chest: 'set', shoulders: 'legendary', gloves: 'rare', boots: 'legendary', belt: 'rare', amulet: 'legendary', ring: 'rare', offhand: 'rare' };
    for (const sl of slots) {
      try {
        const it = rollItem(32, { slot: sl, rarity: plan[sl] || 'rare', cls: 'warrior' });
        it.reqLv = 1;
        if (sl === 'ring') { eq.ring1 = it; } else { eq[sl] = it; }
      } catch (e) { }
    }
    Game.state.level = 20;
    Game.recalc();
    Game.applyDoll();
  });
  await wait(1200);

  const shots = [
    ['village', '02-village', 12],
    ['swamp', '03-swamp', 14],
    ['abyss', '04-abyss', 30],
    ['heaven', '05-heaven', 36],
    ['mine', '06-mine', 22]
  ];

  for (const [map, name, lv] of shots) {
    await p.evaluate(({ map, lv }) => {
      Game.state.level = lv;
      Game.recalc();
      Game.travelTo(map);
      Game.applyDoll();
    }, { map, lv });
    await wait(2400);

    // 让角色往画面下方走一点，避免被地图边缘挤压；同时把附近怪物拉近
    await p.evaluate(() => {
      const s = Game.state;
      s.mp = s.stats.mpMax;
      s.hp = s.stats.hpMax * 0.62;
      // 挑最近的敌人在角色前方
      const pg = Game.playerGroup.position;
      if (Game.enemies && Game.enemies.length) {
        const alive = Game.enemies.filter(e => !e.dead);
        alive.sort((a, b) => a.pos.distanceTo(pg) - b.pos.distanceTo(pg));
        alive.slice(0, 6).forEach((e, i) => {
          const ang = -0.9 + i * 0.36;
          const r = 5.5 + (i % 3) * 1.4;
          const nx = pg.x + Math.sin(ang) * r;
          const nz = pg.z - Math.cos(ang) * r;
          e.pos.set(nx, 0, nz);
          if (e.actor) { e.actor.group.position.set(nx, 0, nz); e.actor.pos = e.pos; }
          if (e.maxHp) e.hp = e.maxHp * (0.3 + 0.14 * i);
        });
      }
    });
    await wait(900);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    console.log(name, 'ok');
  }

  // 7) 战斗瞬间：挥砍 + 刀光 + 伤害数字
  await p.evaluate(() => { Game.travelTo('forest'); });
  await wait(2200);
  await p.evaluate(() => {
    const s = Game.state;
    s.level = 20; Game.recalc();
    s.hp = s.stats.hpMax * 0.55; s.mp = s.stats.mpMax * 0.8;
    const pg = Game.playerGroup.position;
    if (Game.enemies) {
      let i = 0;
      for (const e of Game.enemies) {
        if (e.dead) continue;
        const ang = -1.2 + i * 0.45;
        const r = 4.0 + (i % 2) * 1.5;
        const nx = pg.x + Math.sin(ang) * r;
        const nz = pg.z - Math.cos(ang) * r;
        e.pos.set(nx, 0, nz);
        if (e.actor) { e.actor.group.position.set(nx, 0, nz); e.actor.pos = e.pos; }
        e.hp = e.maxHp * (0.32 + 0.13 * i);
        i++;
        if (i >= 5) break;
      }
    }
  });
  await wait(700);
  // 连击两下并卡在挥砍中段截图
  await p.evaluate(() => { Game.atkCd = 0; Game.doBasicAttack(); });
  await wait(150);
  await p.screenshot({ path: path.join(OUT, '07-combat.png') });
  console.log('combat ok');

  // 8) 技能特效
  await p.evaluate(() => {
    Game.atkCd = 0;
    const sk = (Game.state.skills || []).find(s => s && s.id);
    if (sk) Game.castSkill(sk.id);
  }).catch(() => {});
  await wait(320);
  await p.screenshot({ path: path.join(OUT, '08-skill.png') });
  console.log('skill ok');

  // 9) 背包 + 纸娃娃面板
  await p.evaluate(() => {
    UI.toggleInv();
  }).catch(() => {});
  await wait(700);
  await p.screenshot({ path: path.join(OUT, '09-inventory.png') });
  console.log('inventory ok');

  await b.close();
  console.log('DONE');
})();
