/* ============================================================
 * 截图：行囊扩容（v1.4.0）
 *
 *   node dev/shots-bag-upgrade.js [warrior|mage|taoist]
 *
 * 产出：
 *   shots/bag-upgrade-off.png   扩容条展开但材料不足（键置灰 + 还差提示）
 *   shots/bag-upgrade-on.png    材料给足，扩容键可点
 *   shots/bag-upgrade-done.png  扩容一次后 48 格铺满
 *   shots/bag-upgrade-max.png   满档 104 格 + 入口转「已满」
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
    relic: makeRelic(s.cls === 'warrior' ? 'w10' : (s.cls === 'mage' ? 'm10' : 't10'), s.cls)
  };
  /* 十件杂物：扩容前后的格子差别一眼看得出来 */
  s.inventory = [
    wp('two', '太初斩斧', 'axe'),
    wp('dual', '斩马刀', 'saber'),
    makeRelic(s.cls === 'warrior' ? 'w3' : (s.cls === 'mage' ? 'm3' : 't3'), s.cls),
    mk('chest', '布衣', 'common', 30),
    mk('helm', '皮盔', 'magic', 30),
    mk('gloves', '皮手', 'common', 30),
    mk('ring', '青铜戒', 'magic', 30),
    mk('amulet', '木坠', 'common', 30),
    mk('boots', '草鞋', 'common', 30),
    mk('belt', '麻绳', 'common', 30)
  ];
  s.maxInv = BAG_BASE_CAP;
  s.gold = 200;
  for (let i = 1; i <= 4; i++) G.addMat('crystal' + i, i === 1 ? 6 : 0);

  G.recalc();
  s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
  UI.closeAll();
  document.getElementById('invPanel').classList.add('open');
  UI.invTab = 'equip';
  UI.invUpOpen = true;
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
  /* 鼠标移到右下空白并抹掉悬停提示，否则上一帧的物品提示框会压在界面上 */
  const clearTip = async () => {
    await p.mouse.move(1250, 790);
    /* 悬停提示会被主循环反复写回 display/left/top，所以用 !important 把它钉在屏幕外，
     * 只改内联样式会被 moveTooltip 覆盖，截图里就会留一块残影。 */
    await p.evaluate(() => {
      const t = document.getElementById('tooltip');
      if (t) t.style.cssText = 'position:fixed!important;left:-9999px!important;top:-9999px!important;visibility:hidden!important';
      UI.hoverRef = null;
    });
    /* 等两帧让合成层真的重绘，否则截图里可能留着上一帧的悬停卡 */
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await wait(240);
  };
  await p.evaluate(FILL);
  await clearTip();
  console.log('DBG', JSON.stringify(await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach(d => {
      const r = d.getBoundingClientRect();
      if (r.width > 150 && r.width < 340 && r.height > 180 && r.height < 460 && r.left > 380 && r.left < 760) {
        out.push({ id: d.id, cls: String(d.className).slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top), txt: d.innerText.slice(0, 14) });
      }
    });
    return out;
  })));
  await p.screenshot({ path: path.join(SHOTS, 'bag-upgrade-off.png'), captureBeyondViewport: false });

  /* 给足料：凡晶 12 / 铜钱 300 */
  await p.evaluate(() => {
    Game.addMat('crystal1', 10);
    Game.state.gold = 1200;
    UI.renderInventory();
  });
  await clearTip();
  await p.screenshot({ path: path.join(SHOTS, 'bag-upgrade-on.png'), captureBeyondViewport: false });

  /* 真的点一次：容量 40 → 48，格子当场变多 */
  await p.click('#invUpBar [data-upgo]');
  await wait(600);
  await clearTip();
  await p.screenshot({ path: path.join(SHOTS, 'bag-upgrade-done.png'), captureBeyondViewport: false });

  /* 满档：连扩到 104，按钮与条都转成上限形态 */
  await p.evaluate(() => {
    const s = Game.state;
    for (let i = 0; i < 20; i++) {
      Game.addMat('crystal1', 400); Game.addMat('crystal2', 200);
      Game.addMat('crystal3', 100); Game.addMat('crystal4', 50);
      s.gold = 100000;
      if (!Game.upgradeBag().ok) break;
    }
    UI.invUpOpen = true;
    UI.renderInventory();
  });
  await clearTip();
  await p.screenshot({ path: path.join(SHOTS, 'bag-upgrade-max.png'), captureBeyondViewport: false });

  if (errs.length) console.log('页面错误：\n' + errs.slice(0, 4).join('\n'));
  else console.log('OK → shots/bag-upgrade-*.png');
  await b.close();
})().catch(e => { console.error('崩溃：', e); process.exit(1); });
