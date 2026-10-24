/* ============================================================
 * 截图：装备格子差异化（v1.2.3）
 *
 *   node dev/shots-slot-size.js
 *
 * 产出：
 *   shots/slot-size-desktop.png —— 桌面行囊（左纸娃娃 / 右行囊混合部位）
 *   shots/slot-size-mobile.png  —— 竖屏手机（触屏尺寸档）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  .find(p => require('fs').existsSync(p));

const CLS = process.argv[2] || 'warrior';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + CLS;

/* 把行囊摆成「同一屏里能同时看到四档尺寸」的样子 */
const FILL = () => {
  const G = Game;
  G.state.level = 40; G.recalc();
  const CLS_PICK = G.state.cls;
  const mk = (slot, name, rarity, ilvl) => normalizeItem({
    kind: slot, slot, name, rarity, ilvl,
    cls: CLS_PICK, baseArmor: 60, sockets: 0, runes: [], affixes: [], reqLv: 30
  });
  const all = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
  for (const s of all) G.state.equipment[s] = mk(s, (SLOT_NAME[s] || s), 'set', 32);
  /* 行囊：先两件最大（战甲/兵器），再按档位递减，最后放两只戒指 */
  const bag = [
    ['chest', '玄铁重铠', 'legendary'],
    ['weapon', '斩龙刀', 'unique'],
    ['helm', '镇山盔', 'set'],
    ['boots', '踏云靴', 'rare'],
    ['gloves', '缚灵手', 'magic'],
    ['belt', '锁子带', 'magic'],
    ['offhand', '青铜盾', 'rare'],
    ['amulet', '青玉坠', 'set'],
    ['ring', '赤髓戒', 'legendary'],
    ['ring', '寒玉戒', 'rare']
  ];
  G.state.inventory = bag.map(([s, n, r], i) => mk(s, n, r, 28 + i));
  G.recalc();
  UI.closeAll();
  document.getElementById('invPanel').classList.add('open');
  UI.renderInventory();
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  /* ---- 桌面 ---- */
  const p1 = await b.newPage();
  const errs = [];
  p1.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p1.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await p1.goto(URL, { waitUntil: 'load' });
  await wait(2600);
  await p1.evaluate(FILL);
  await wait(500);
  await p1.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'slot-size-desktop.png') });

  /* ---- 手机竖屏 ---- */
  const p2 = await b.newPage();
  p2.on('pageerror', e => errs.push('mobile: ' + String(e).slice(0, 160)));
  await p2.setViewport({ width: 430, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p2.goto(URL, { waitUntil: 'load' });
  await wait(2600);
  await p2.evaluate(FILL);
  await wait(500);
  await p2.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'slot-size-mobile.png') });

  if (errs.length) console.log('页面错误：\n' + errs.slice(0, 4).join('\n'));
  else console.log('OK → shots/slot-size-desktop.png / slot-size-mobile.png');
  await b.close();
})().catch(e => { console.error('崩溃：', e); process.exit(1); });
