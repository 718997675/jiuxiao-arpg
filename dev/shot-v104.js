/* v1.0.4 视觉截图：符咒飞行 / 背包对比+排序 / 商店刷新条 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8902;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await page.goto(`http://127.0.0.1:${PORT}/?cls=taoist&name=符师&diff=normal`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1600));

  /* ---- 1. 符咒飞行中 ---- */
  await page.evaluate(() => {
    Game.state.level = 12; Game.recalc();
    Game.state.mp = Game.state.stats.mpMax;
    Game.enemies.forEach(e => disposeTree(e.actor.group));
    Game.enemies = [];
    FX.clear();
    const e = Game.spawnEnemy('halfork', 0.5, 15, false, 8);
    e.aggro = false;
    Game.aimDir.set(0, 0, 1);
    Game.aimPoint.set(0.5, 0, 15);
    Game.cooldowns = {};
    Game.castSkill('talisman');
  });
  await new Promise(r => setTimeout(r, 260));
  await page.screenshot({ path: path.join(__dirname, 'shot-v104-talisman.png') });
  console.log('  符咒截图 ok');

  /* ---- 2. 背包：排序条 + 装备对比 ---- */
  await page.evaluate(() => {
    const items = [];
    const RAR = ['rare', 'magic', 'legendary', 'set', 'magic', 'rare'];
    for (let i = 0; i < 14; i++) items.push(rollItem(8 + i * 2, { cls: 'taoist', rarity: RAR[i % RAR.length] }));
    Game.state.inventory = items;
    Game.state.equipment.weapon = rollItem(10, { cls: 'taoist', rarity: 'magic' });
    Game.state.equipment.chest = rollItem(12, { cls: 'taoist', rarity: 'rare' });
    Game.recalc();
    UI.toggleInv();
    Game.sortInventory('score');
  });
  await new Promise(r => setTimeout(r, 400));
  // 悬停到第一件装备，触发真实 mouseover 以显示对比
  const box = await page.evaluate(() => {
    const el = document.querySelector('#invGrid .islot[data-ref]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (box) { await page.mouse.move(box.x, box.y); await new Promise(r => setTimeout(r, 350)); }
  await page.screenshot({ path: path.join(__dirname, 'shot-v104-inv.png') });
  console.log('  背包截图 ok');

  /* ---- 3. 商店刷新条 ---- */
  await page.evaluate(() => {
    UI.closeAll();
    Game.state.gold = 5000;
    Game.state.shop = null;
    Game.ensureShop();
    UI.openShop(Game.shopItems, '铁匠铺');
    UI.renderHUD();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(__dirname, 'shot-v104-shop.png') });
  console.log('  商店截图 ok');

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
