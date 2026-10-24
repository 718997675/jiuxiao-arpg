/* ============================================================
 * 截图：v1.6.0（主菜单页签 / 材料图标 / 锻造）
 * 产出 shots/v160-*.png
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8905;
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const OUT = path.join(ROOT, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const wait = ms => new Promise(r => setTimeout(r, ms));

const FILL = () => {
  const G = Game, s = G.state;
  const mk = (slot, name, rarity, ilvl) => {
    const it = rollItem(ilvl, { slot, cls: s.cls, rarity, noRelic: true });
    it.name = name;
    return normalizeItem(it);
  };
  const wp = (hand, name, shape, rarity, ilvl) => {
    const it = rollItem(ilvl, { slot: 'weapon', cls: s.cls, rarity, noRelic: true });
    it.name = name; it.hand = hand; it.shape = shape;
    return normalizeItem(it);
  };
  const relicId = s.cls === 'warrior' ? 'w10' : (s.cls === 'mage' ? 'm10' : 't10');
  s.equipment = {
    helm: mk('helm', '龙鳞盔', 'rare', 34),
    chest: mk('chest', '龙鳞战甲', 'legendary', 34),
    shoulders: mk('shoulders', '覆云肩', 'rare', 34),
    gloves: mk('gloves', '缚灵手', 'magic', 34),
    boots: mk('boots', '踏云靴', 'rare', 34),
    belt: mk('belt', '锁子带', 'magic', 34),
    amulet: mk('amulet', '青玉坠', 'set', 34),
    ring1: mk('ring', '赤髓戒', 'legendary', 34),
    ring2: mk('ring', '寒玉戒', 'rare', 34),
    weapon: wp('two', '太初斩斧', 'axe', 'legendary', 34),
    offhand: null,
    relic: makeRelic(relicId, s.cls)
  };
  /* 行囊：留出四件凡品 / 灵品当锻造的胚，其余是杂物 */
  s.inventory = [
    mk('weapon', '精铁剑', 'common', 30),
    mk('chest', '锁子甲', 'common', 30),
    mk('helm', '铁盔', 'magic', 30),
    mk('gloves', '铁护手', 'magic', 30),
    mk('boots', '铁战靴', 'common', 30),
    mk('belt', '铁腰带', 'magic', 30),
    mk('ring', '灵玉戒', 'rare', 30),
    mk('amulet', '灵玉项链', 'common', 30),
    makeRelic(s.cls === 'warrior' ? 'w3' : (s.cls === 'mage' ? 'm3' : 't3'), s.cls)
  ];
  s.maxInv = 56;
  s.gold = 24000;
  const AMT = { ore: 48, hide: 36, bone: 26, silk: 20, ember: 14, frost: 11, scale: 7, meteor: 4, soul: 2 };
  for (const id of CRAFT_MAT_ORDER) G.addCraftMat(id, AMT[id] || 0);
  [34, 20, 10, 4].forEach((n, i) => G.addMat('crystal' + (i + 1), n));
  s.quests.done = ['q1', 'q2', 'q3', 'q4'];
  s.potions = { hp: 9, mp: 5 };
  s.teleportStones = 3;
  G.recalc();
  s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
  UI.closeAll();
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 840, deviceScaleFactor: 2 });
  await p.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E9%87%8D%E9%93%B8`,
    { waitUntil: 'load' });
  await wait(3000);

  const clearTip = async () => {
    await p.mouse.move(1268, 826);
    await p.evaluate(() => {
      const t = document.getElementById('tooltip');
      if (t) t.style.cssText = 'position:fixed!important;left:-9999px!important;top:-9999px!important;visibility:hidden!important';
      UI.hoverRef = null;
    });
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await wait(220);
  };
  const shot = async name => {
    await clearTip();
    await p.screenshot({ path: path.join(OUT, name), captureBeyondViewport: false });
    console.log('  · ' + name);
  };

  await p.evaluate(FILL);
  await wait(500);

  /* 1. 菜单 + 行囊装备栏 */
  await p.evaluate(() => UI.openMenu('bag'));
  await wait(420);
  await shot('v160-menu-bag.png');

  /* 2. 材料：图标 + 角标 */
  await p.evaluate(() => { UI.invTab = 'mat'; UI.renderInventory(); });
  await wait(320);
  await shot('v160-mat.png');

  /* 3. 丹药 */
  await p.evaluate(() => { UI.invTab = 'pill'; UI.renderInventory(); });
  await wait(280);
  await shot('v160-pill.png');

  /* 4. 任务物品 */
  await p.evaluate(() => { UI.invTab = 'quest'; UI.renderInventory(); });
  await wait(280);
  await shot('v160-quest.png');

  /* 5. 锻造：先清空材料看「缺料红格」 */
  await p.evaluate(() => {
    for (const id of CRAFT_MAT_ORDER) Game.addCraftMat(id, -Game.craftMatCount(id));
    Game.state.gold = 300;
    UI.openMenu('forge');
    UI.forgeTab = 'craft';
    UI.forgeRef = 'inv:0';
    UI.renderForge();
  });
  await wait(360);
  await shot('v160-craft-lack.png');

  /* 6. 锻造：材料齐备（可点） */
  await p.evaluate(() => {
    const AMT = { ore: 48, hide: 36, bone: 26, silk: 20, ember: 14, frost: 11, scale: 7, meteor: 4, soul: 2 };
    for (const id of CRAFT_MAT_ORDER) Game.addCraftMat(id, AMT[id] || 0);
    Game.state.gold = 24000;
    UI.renderForge();
  });
  await wait(320);
  await shot('v160-craft.png');

  /* 7. 炼器台符文页（验证嵌入后仍是两栏） */
  await p.evaluate(() => { UI.forgeTab = 'rune'; UI.renderForge(); });
  await wait(320);
  await shot('v160-forge.png');

  /* 8. 属性页 / 天赋页（验证其它页签嵌入正常） */
  await p.evaluate(() => UI.openMenu('stat'));
  await wait(320);
  await shot('v160-stat.png');
  await p.evaluate(() => UI.openMenu('talent'));
  await wait(600);
  await shot('v160-talent.png');

  /* 9. 触屏：材料格 + 横排页签
   * 注意：Puppeteer 改 isMobile/hasTouch 会**重新加载**页面，状态会回到开局，
   * 所以这里必须重新铺一次数据，不能沿用上面的 FILL 结果。 */
  await p.setViewport({ width: 414, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await wait(3600);
  await p.evaluate(() => document.body.classList.add('touch'));
  await p.evaluate(FILL);
  await wait(400);
  await p.evaluate(() => { UI.openMenu('bag'); UI.invTab = 'mat'; UI.renderInventory(); });
  await wait(420);
  /* 竖屏是整面板滚动，材料区在装备栏下面，滚到它再截 */
  await p.evaluate(() => {
    const m = document.getElementById('invMats');
    if (m) m.scrollIntoView({ block: 'center' });
  });
  await wait(300);
  await shot('v160-mobile-mat.png');

  console.log('\n  页面错误：' + (errs.length ? errs.join(' | ') : '无'));
  await b.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
