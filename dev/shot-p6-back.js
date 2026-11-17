#!/usr/bin/env node
/* ============================================================
 * [equip-doll P6] 背光复验（游戏侧，真正的验收场景）
 *   node dev/shot-p6-back.js
 * 工作台是中性布光，看不出「背光糊成黑」。这里在游戏里把相机转到角色背后，
 * 用太阳在前的林地场景复现 P2 截图的背光条件。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');
const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const SHOT_DIR = path.resolve(__dirname, '_shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

const HELP = `
window.__mk = (slot, fam) => {
  const it = rollItem(60, { slot, cls: Game.state.cls, rarity: 'legendary' });
  if (fam !== undefined) it.baseVar = fam;
  return it;
};
window.__wear = (slot, item) => { Game.state.equipment[slot] = item; Game.applyDoll(); };
window.__clearAll = () => {
  for (const s of ['helm','chest','shoulders','cloak','gloves','boots','belt',
    'amulet','relic','fate','ring1','ring2','weapon','offhand']) window.__wear(s, null);
};
/* 相机到角色背后，略微俯视，正对上身后背 */
window.__backcam = () => {
  const v = new THREE.Vector3();
  Game.actor.group.getWorldPosition(v);
  /* 角色默认朝 -Z；要看后背，相机放到 +Z 一侧 */
  Game.camera.position.set(v.x + 0.15, v.y + 1.05, v.z + 2.9);
  Game.camera.lookAt(v.x, v.y + 0.95, v.z);
};
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 720 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate((help) => {
    eval(help);
    Game.startNew('warrior', 'P6BACK');
    Game.state.level = 50; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {}; Game.updateCamera = function () {}; Game.faceHpBars = function () {};
  }, HELP);
  await wait(900);
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const shot = async (slot, name) => {
    await page.evaluate((s) => {
      window.__clearAll();
      window.__wear(s, window.__mk(s, 1));   // B 族（fam=1）
      window.__backcam();
    }, slot);
    await wait(380);
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
    console.log('  → ' + name + '.png');
  };

  await shot('chest', 'p6-back-chestB');
  await shot('cloak', 'p6-back-cloakB');

  console.log('\n报错 ' + errs.length + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})();
