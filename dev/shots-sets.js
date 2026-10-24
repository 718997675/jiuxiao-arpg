/* ============================================================
 * 套装体系截图（v1.2.2）
 *
 *   node dev/shots-sets.js
 *
 * 产出：
 *   shots/set-codex.png    套装图鉴（9 套，按职业分组）
 *   shots/set-tooltip.png  套装件提示框（磐石 2/4 档）
 *   shots/set-combo.png    5 件主套 + 4 件兵装套 = 9 格满配的角色面板
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8898;
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const EXE = CANDIDATES.find(p => fs.existsSync(p)) || CANDIDATES[0];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E5%A5%97%E8%A3%85%E6%BC%94%E7%A4%BA`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  /* 准备：9 套各来几件（图鉴要有「已集」进度），战士穿 5 + 4 */
  await page.evaluate(() => {
    const mk = (id, i) => normalizeItem({
      kind: SETS[id].slots[i], slot: SETS[id].slots[i], name: SETS[id].pieces[i],
      rarity: 'set', ilvl: 32, reqLv: 32, setId: id, setName: SETS[id].name, cls: SETS[id].cls,
      sockets: 0, runes: [], affixes: []
    });
    Game.state.level = 40;
    Game.state.inventory = [];
    /* 图鉴进度：每套塞 1-3 件（装备/行囊都算） */
    const owned = {
      longxiang: [0, 1, 2, 3, 4], panshi: [0, 1], xuenu: [0],
      xingque: [0, 1, 2], leiji: [0], xuanbing: [0, 1],
      qingfu: [0, 1], danding: [0, 1, 2, 3], tianshi: [0, 1, 2]
    };
    for (const id in owned) for (const i of owned[id]) {
      if (SETS[id].cls !== 'warrior') Game.state.inventory.push(mk(id, i));
    }
    /* 战士：主套 5 + 兵装套 4 = 9 格满配 */
    Game.state.equipment = {};
    SETS.longxiang.slots.forEach((sl, i) => { Game.state.equipment[sl] = mk('longxiang', i); });
    SETS.panshi.slots.forEach((sl, i) => { Game.state.equipment[sl] = mk('panshi', i); });
    Game.recalc();
    Game.state.hp = Game.state.stats.hpMax;
    Game.state.mp = Game.state.stats.mpMax;
  });
  await new Promise(r => setTimeout(r, 400));

  /* 1) 套装图鉴（上 / 下两屏，9 套全拍到） */
  await page.evaluate(() => { UI.closeAll(); UI.openSetCodex(); });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'set-codex.png') });
  await page.evaluate(() => {
    const list = document.querySelector('#setCodexList');
    if (list) list.scrollTop = list.scrollHeight;
  });
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'set-codex2.png') });

  /* 2) 套装件提示框（磐石 4 件套 → 2 档全亮） */
  await page.evaluate(() => {
    UI.closeAll();
    const it = Game.state.equipment.weapon;
    const t = UI.tooltipEl;
    t.innerHTML = itemTooltip(it, { hint: '套装武器 · 与 5 件主套部位不冲突，可同时穿满' });
    t.style.display = 'block';
    t.style.left = '520px'; t.style.top = '90px';
  });
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'set-tooltip.png') });

  /* 3) 角色面板：看双套档位同时激活 */
  await page.evaluate(() => {
    UI.tooltipEl.style.display = 'none';
    UI.closeAll();
    UI.toggleStat();
  });
  await new Promise(r => setTimeout(r, 450));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'set-combo.png') });

  await browser.close();
  server.close();
  console.log('已生成 shots/set-codex.png / set-tooltip.png / set-combo.png');
})().catch(e => { console.error(e); process.exit(1); });
