/* ============================================================
 * 截图：行囊四栏 + 双手兵器锁副手（v1.3.0）
 *
 *   node dev/shots-bag.js [warrior|mage|taoist]
 *
 * 产出：
 *   shots/bag-equip.png   装备栏（左纸娃娃 / 右装备格 + 详细属性）
 *   shots/bag-mat.png     材料栏（玄晶四阶 + 符文）
 *   shots/bag-pill.png    丹药栏
 *   shots/bag-quest.png   任务物品栏（委托凭证）
 *   shots/bag-twohand.png 双手兵器在握，副手格锁定
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => fs.existsSync(p));

const CLS = process.argv[2] || 'warrior';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + CLS;
const SHOTS = path.resolve(__dirname, '..', 'shots');

const FILL = () => {
  const G = Game;
  const s = G.state;
  s.level = 40;
  const mk = (slot, name, rarity, ilvl, extra) => normalizeItem(Object.assign({
    kind: slot, slot, name, rarity, ilvl, cls: s.cls,
    baseArmor: 70, sockets: 0, runes: [], affixes: [], reqLv: 1
  }, extra || {}));
  const wp = (hand, name, shape) => mk('weapon', name, 'legendary', 34, {
    hand, shape, baseDmg: [66, 98], speed: hand === 'two' ? 0.86 : 1.06
  });

  const relic10 = makeRelic(s.cls === 'warrior' ? 'w10' : (s.cls === 'mage' ? 'm10' : 't10'), s.cls);
  const relic3 = makeRelic(s.cls === 'warrior' ? 'w3' : (s.cls === 'mage' ? 'm3' : 't3'), s.cls);
  s.equipment = {
    weapon: wp('one', '龙渊剑', 'sword'),
    chest: mk('chest', '玄铁重铠', 'set', 34),
    helm: mk('helm', '镇山盔', 'set', 34),
    offhand: mk('offhand', '镇岳塔盾', 'rare', 34, { baseArmor: 150, shape: 'shield' }),
    amulet: mk('amulet', '青玉坠', 'set', 34),
    shoulders: mk('shoulders', '覆云肩', 'rare', 34),
    gloves: mk('gloves', '缚灵手', 'magic', 34),
    ring1: mk('ring', '赤髓戒', 'legendary', 34),
    boots: mk('boots', '踏云靴', 'rare', 34),
    belt: mk('belt', '锁子带', 'magic', 34),
    ring2: mk('ring', '寒玉戒', 'rare', 34),
    relic: relic10
  };
  s.inventory = [
    wp('two', '太初斩斧', 'axe'),
    wp('dual', '斩马刀', 'saber'),
    relic3,
    mk('chest', '布衣', 'common', 30),
    mk('helm', '皮盔', 'magic', 30),
    mk('gloves', '皮手', 'common', 30),
    mk('ring', '青铜戒', 'magic', 30),
    mk('amulet', '木坠', 'common', 30)
  ];
  s.potions = { hp: 9, mp: 6 };
  s.teleportStones = 3;
  ['crystal1', 'crystal2', 'crystal3', 'crystal4'].forEach((k, i) => G.addMat(k, [23, 11, 4, 1][i]));
  ['el', 'sol', 'shael', 'ist', 'um'].forEach((id, i) => G.addMat('rune_' + id, [4, 3, 2, 1, 1][i]));
  s.quests.done = ['q1', 'q2', 'q3', 'q5'];

  G.recalc();
  s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
  UI.closeAll();
  document.getElementById('invPanel').classList.add('open');
  UI.invTab = 'equip';
  UI.renderInventory();
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 820, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'load' });
  await wait(2600);
  await p.evaluate(FILL);
  await wait(400);

  const shot = async name => {
    await wait(260);
    await p.screenshot({ path: path.join(SHOTS, 'bag-' + name + '.png') });
  };
  await shot('equip');

  /* 法器提示框：介绍 / 历史 / 术法修正 / 附带术法 四段挤在一张里 */
  const cell = await p.$('#dollGrid .eslot[data-slot="relic"]');
  if (cell) {
    const bb = await cell.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await wait(500);
    await p.screenshot({ path: path.join(SHOTS, 'bag-relic-tip.png') });
    await p.mouse.move(10, 400);
    await wait(200);
  }

  await p.evaluate(() => { UI.invTab = 'mat'; UI.renderInventory(); });
  await shot('mat');
  await p.evaluate(() => { UI.invTab = 'pill'; UI.renderInventory(); });
  await shot('pill');
  await p.evaluate(() => { UI.invTab = 'quest'; UI.renderInventory(); });
  await shot('quest');

  /* 双手兵器在握：单独开一个页面做，避免连着截五张后 WebGL 掉上下文变黑屏 */
  const p2 = await b.newPage();
  p2.on('pageerror', e => errs.push('twohand: ' + String(e).slice(0, 160)));
  await p2.setViewport({ width: 1280, height: 820, deviceScaleFactor: 2 });
  await p2.goto(URL, { waitUntil: 'load' });
  await wait(2600);
  await p2.evaluate(FILL);
  await p2.evaluate(() => {
    const s = Game.state;
    s.equipment.weapon = s.inventory[0];
    s.inventory.splice(0, 1);
    Game.recalc();
    s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
    Game.applyDoll();
    UI.renderInventory();
    UI.renderHUD();
  });
  await p2.mouse.move(640, 400);
  await wait(700);
  await p2.screenshot({ path: path.join(SHOTS, 'bag-twohand.png') });

  if (errs.length) console.log('页面错误：\n' + errs.slice(0, 4).join('\n'));
  else console.log('OK → shots/bag-*.png');
  await b.close();
})().catch(e => { console.error('崩溃：', e); process.exit(1); });
