#!/usr/bin/env node
/* ============================================================
 * [P05] 新怪辨识度 · 人工复验截图
 *   node dev/shot-p05.js
 * 同 model 换色的几组新旧对照 + 全新配色怪，统一镜头出图，落在
 * dev/_shots/p05-*.png（不入库）。只出图不断言。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');
const SHOT_DIR = path.resolve(__dirname, '_shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 每组：同 model 的新旧对照，看换色+缩放后能否区分 */
const GROUPS = [
  { name: '01-plant-treant', kinds: ['bamboo', 'vinewraith', 'bogreed', 'swordbamboo'] },
  { name: '02-anthropoid', kinds: ['halfork', 'bandit', 'swordsman', 'starmage'] },
  { name: '03-beast-wolf', kinds: ['wolf', 'mountaincat', 'snowwolf', 'hellhound'] },
  { name: '04-spirit-ghost', kinds: ['ghost', 'mountainspirit', 'waterspirit', 'mirrorspirit'] },
  { name: '05-undead', kinds: ['zombie', 'rotcorpse', 'corpsegeneral', 'swordcorpse'] },
  { name: '06-stone', kinds: ['golem', 'lavaguard', 'starstone', 'jadewarden'] }
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 520, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  for (const grp of GROUPS) {
    await page.evaluate((kinds) => {
      Game.running = false;
      /* stub 掉主循环的相机更新，否则 rAF 会把镜头拉回玩家视角（P6 踩过的坑） */
      Game.update = function () { }; Game.updateCamera = function () { }; Game.faceHpBars = function () { };
      /* 清场：把已有实体（NPC/村民）全隐藏，只留要拍的怪 */
      for (const e of Game.enemies) { if (e.actor && e.actor.group) e.actor.group.visible = false; }
      Game.enemies.length = 0;
      if (Game.npcs) for (const id in Game.npcs) {
        const n = Game.npcs[id]; if (n && n.group) n.group.visible = false;
      }
      /* 把玩家挪到出生点前方空地，四只怪排在玩家前面 */
      const pp = Game.playerGroup.position;
      pp.set(0, 0, 0);
      if (Game.playerGroup) Game.playerGroup.visible = false;
      const kinds2 = kinds;
      kinds2.forEach((k, i) => {
        const x = -6 + i * 4;
        const e = Game.spawnEnemy(k, x, -3, false, 30);
        if (e && e.actor && e.actor.group) {
          e.actor.group.position.set(x, 0, -3);
          e.actor.group.visible = true;
          e.actor.group.scale.multiplyScalar(2.2);   /* 放大便于看清剪影/配色 */
        }
      });
      const cp = Game.camera.position;
      cp.set(0, 3.2, 8);
      Game.camera.lookAt(0, 1.0, -3);
      Game.camera.updateMatrixWorld();
      Game.renderer.render(Game.scene, Game.camera);
    }, grp.kinds);
    await wait(300);
    await page.screenshot({ path: path.join(SHOT_DIR, 'p05-' + grp.name + '.png') });
    console.log('  shot p05-' + grp.name + '.png');
  }
  await browser.close();
  console.log('P05 截图完成（' + GROUPS.length + ' 组）');
})().catch(e => { console.error(e); process.exit(1); });
