#!/usr/bin/env node
/* ============================================================
 * [equip-doll P6] 美术欠账 · 人工复验截图
 *
 *   node dev/shot-p6-art.js
 *
 * 走装备工作台（和 probe-doll.js 同一套镜头），出图稳、不玩游戏相机：
 *   p6-01-shoulders-B  B 族护肩正视（是否门板）
 *   p6-02-chestB-back  B 族札甲背面（背光是否救回）
 *   p6-03-cloakB-back  B 族重氅背面
 *   p6-04-chestC       C 族轻裘腰包（是否偏亮）
 *   p6-05-staff       法师法杖（两签名同形制，看杖头辨识度）
 *   p6-06-orb         法师副手法球（看直径）
 * 只出图不断言，落在 dev/_shots/p6-*.png（不入库）。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');

const TARGET = process.env.PROBE_URL
  || ('file://' + path.join(__dirname, '..', 'docs', 'equip-doll-playground.html'));
const SHOT_DIR = path.resolve(__dirname, '_shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await page.waitForFunction('window.__doll && window.__doll.main', { timeout: 15000 });
  await wait(900);
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const setup = async (cfg) => page.evaluate((c) => {
    const D = window.__doll;
    D.S.cls = c.cls || 'warrior';
    for (const s of D.SLOT_ORDER) { D.S.eq[s].on = false; }
    for (const x of c.eq) {
      D.S.eq[x.slot].on = true;
      if (x.fam) D.S.eq[x.slot].fam = x.fam;
      if (x.tier) D.S.eq[x.slot].tier = x.tier;
      if (x.rarity) D.S.eq[x.slot].rarity = x.rarity;
    }
    D.apply();
    /* 视角必须点按钮：直接写 S.view 不会走 applyView()。 */
    const btn = document.querySelector('[data-view="' + (c.view || 'front') + '"]');
    if (btn) btn.click();
  }, cfg);

  const shot = async (name) => {
    await wait(340);
    await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
    console.log('  → ' + name + '.png');
  };

  /* 护肩 B 族：正 + close */
  await setup({ eq: [
    { slot: 'helm', fam: 'B', tier: 5 }, { slot: 'chest', fam: 'B', tier: 5 },
    { slot: 'shoulders', fam: 'B', tier: 5, rarity: 'legendary' }
  ], view: 'front' });
  await shot('p6-01-shouldersB-front');
  await setup({ eq: [
    { slot: 'chest', fam: 'B', tier: 5 }, { slot: 'shoulders', fam: 'B', tier: 5, rarity: 'legendary' }
  ], view: 'close' });
  await shot('p6-01b-shouldersB-close');

  /* 札甲 / 重氅 背面 */
  await setup({ eq: [{ slot: 'chest', fam: 'B', tier: 5, rarity: 'legendary' }], view: 'back' });
  await shot('p6-02-chestB-back');
  await setup({ eq: [{ slot: 'cloak', fam: 'B', tier: 5, rarity: 'legendary' }], view: 'back' });
  await shot('p6-03-cloakB-back');

  /* C 族腰包（轻裘 + 细带） */
  await setup({ eq: [
    { slot: 'chest', fam: 'C', tier: 5, rarity: 'legendary' },
    { slot: 'belt', fam: 'C', tier: 5, rarity: 'legendary' }
  ], view: 'front' });
  await shot('p6-04-chestC-pouch');
  await setup({ eq: [
    { slot: 'chest', fam: 'C', tier: 5, rarity: 'legendary' }
  ], view: 'close' });
  await shot('p6-04b-chestC-close');

  /* 戒指光点（close 视角，两手戴满） */
  await setup({ eq: [
    { slot: 'ring1', fam: 'A', tier: 5, rarity: 'legendary' },
    { slot: 'ring2', fam: 'C', tier: 5, rarity: 'legendary' }
  ], view: 'close' });
  await shot('p6-05-ring-glow');

  /* 法杖 / 法球：法师职业 */
  await setup({ cls: 'mage', eq: [{ slot: 'weapon', fam: 'B', tier: 6 }], view: 'front' });
  await shot('p6-06-staff');
  await setup({ cls: 'mage', eq: [{ slot: 'offhand', fam: 'A', tier: 6 }], view: 'front' });
  await shot('p6-07-orb');

  console.log('\n报错 ' + errs.length + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})();
