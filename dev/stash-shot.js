/* [M6] 仓库面板实景截图（桌面 + 手机）
 * 用法：node dev/stash-shot.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));

/* 造一批有代表性的装备：各部位 / 各品质 / 带孔 / 带套装 */
const SEED = () => {
  const d = Game.stashData();
  d.items.length = 0; d.sets = {}; d.cap = 120;
  const slots = ['weapon', 'helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'offhand', 'relic'];
  const rar = ['common', 'magic', 'rare', 'legendary', 'set', 'unique'];
  for (let i = 0; i < 34; i++) {
    const it = rollItem(8 + i, { slot: slots[i % slots.length], rarity: rar[i % rar.length] });
    d.items.push(it);
  }
  /* 造一套完整的 4 件套，用来展示收藏柜的「可登记」 */
  const setId = Object.keys(SETS).find(id => SETS[id].slots.length === 4);
  const set = SETS[setId];
  set.slots.forEach((slot, k) => {
    const it = rollItem(30, { slot: slot === 'ring' ? 'ring' : slot, rarity: 'rare' });
    it.setId = setId; it.setName = set.name; it.rarity = 'set';
    it.name = set.pieces[k] || it.name;
    d.items.push(it);
  });
  /* 再登记一套，展示「已收藏」状态 */
  const setId2 = Object.keys(SETS).find(id => id !== setId && SETS[id].slots.length === 3);
  if (setId2) {
    const s2 = SETS[setId2];
    d.sets[setId2] = { at: Date.now(), pieces: s2.slots.map((slot, k) => {
      const it = rollItem(30, { slot: slot === 'ring' ? 'ring' : slot, rarity: 'rare' });
      it.setId = setId2; it.setName = s2.name; it.rarity = 'set';
      it.name = s2.pieces[k] || it.name;
      return it;
    }) };
  }
  /* 行囊也放几件，左边不空 */
  Game.state.inventory.length = 0;
  for (let i = 0; i < 9; i++) Game.state.inventory.push(rollItem(20 + i * 2));
  Game.addCrystal(28); Game.addCrystalTier(2, 9); Game.addCrystalTier(3, 3);
  Game.addCraftMat(CRAFT_MAT_ORDER[0], 14); Game.addCraftMat(CRAFT_MAT_ORDER[3], 5);
  Game.state.gold = 6800;
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });

  /* 桌面 */
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 40; Game.recalc(); });
  await wait(600);
  await p.evaluate(SEED);
  await p.evaluate(() => UI.openStash());
  await wait(700);
  await p.screenshot({ path: 'shots/m6-stash-pc.png' });
  console.log('shots/m6-stash-pc.png');

  /* 村庄里的仓管：走过去看看交互提示对不对 */
  await p.evaluate(() => { UI.closeAll(); Game.travelTo('village'); });
  await wait(1100);
  await p.evaluate(() => {
    const n = Game.npcs.steward;
    if (!n) return;
    const pp = Game.playerGroup.position;
    pp.x = n.pos.x - 1.9; pp.z = n.pos.z + 2.0;
    /* 相机直接落位，省得等它插值过去 */
    Game.camera.position.set(pp.x + 3, 9, pp.z + 9);
    Game.updateInteract();
  });
  await wait(900);
  await p.screenshot({ path: 'shots/m6-steward.png' });
  console.log('shots/m6-steward.png');

  /* 手机竖屏 */
  const m = await b.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
  await m.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1600);
  await m.click('#startBtn').catch(() => {});
  await wait(400);
  await m.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 40; Game.recalc(); });
  await wait(600);
  await m.evaluate(SEED);
  await m.evaluate(() => UI.openStash());
  await wait(700);
  await m.screenshot({ path: 'shots/m6-stash-mobile.png' });
  console.log('shots/m6-stash-mobile.png');

  await b.close();
})();
