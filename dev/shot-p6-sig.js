#!/usr/bin/env node
/* ============================================================
 * [equip-doll P6] 传世签名件美术复验（游戏侧，签名真的生效）
 *   node dev/shot-p6-sig.js
 * 工作台不读 DOLL_SIG，双法杖/法球的签名形制只能在游戏里看。
 * 造件口径与 probe-p4 完全相同（rarity=unique + uniqueId + ilvl60）。
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
window.__mk = (slot, uid) => {
  const o = { slot, cls: Game.state.cls, rarity: 'unique', uniqueId: uid };
  return rollItem(60, o);
};
window.__wear = (slot, item) => { Game.state.equipment[slot] = item; Game.applyDoll(); };
window.__clearAll = () => {
  for (const s of ['helm','chest','shoulders','cloak','gloves','boots','belt',
    'amulet','relic','fate','ring1','ring2','weapon','offhand']) window.__wear(s, null);
};
window.__cam = (which) => {
  /* 用工作台同款镜头，绕开游戏自身相机更新 */
  const a = Game.actor, g = a.parts[which];
  const v = new THREE.Vector3();
  if (g) g.getWorldPosition(v); else v.set(0, 1, 0);
  Game.camera.position.set(v.x + 2.0, v.y + 0.35, v.z + 2.6);
  Game.camera.lookAt(v.x, v.y, v.z);
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
    Game.startNew('mage', 'P6SIG');
    Game.state.level = 50; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {}; Game.updateCamera = function () {}; Game.faceHpBars = function () {};
  }, HELP);
  await wait(900);
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const render = async (slot, uid, anchor, name) => {
    await page.evaluate(([s, u, a]) => {
      window.__clearAll();
      const it = window.__mk(s, u);
      window.__wear(s, it);
      window.__cam(a);
    }, [slot, uid, anchor]);
    await wait(360);
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
    console.log('  → ' + name + '.png');
  };

  await render('weapon', 'emberheaven', 'weaponHand', 'p6-sig-staff-emberheaven');
  await render('weapon', 'jinshi', 'weaponHand', 'p6-sig-staff-jinshi');
  await render('offhand', 'taiyin', 'offHand', 'p6-sig-orb-taiyin');
  await render('offhand', 'youquan', 'offHand', 'p6-sig-orb-youquan');

  console.log('\n报错 ' + errs.length + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})();
