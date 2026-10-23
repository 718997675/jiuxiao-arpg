/* ============================================================
 * 回归探针：打孔功能（v1.1.1）
 * 覆盖：0 孔装备可打 → 逐孔扣费 → 5 孔上限 → 第 6 次拒绝
 *       戒指/项链拒绝 → runes 数组同步 → 新孔可镶符文
 *       存档往返保留 5 孔（normalizeItem 上限从 4 提到 5）
 *       炼器台符文页把 0 孔装备列入可选、渲染打孔按钮
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8896;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const ok = m => { results.push(1); console.log('  [PASS] ' + m); };
const bad = m => { results.push(0); console.log('  [FAIL] ' + m); };

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n  打孔功能回归');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E9%BC%93%E4%BA%BA`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  const r1 = await page.evaluate(() => {
    const out = { log: [] };
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;

    /* 造一把 0 孔武器 + 一枚戒指 */
    const w = normalizeItem({ kind: 'weapon', slot: 'weapon', name: '试炼巨剑', rarity: 'rare', ilvl: 20, sockets: 0, runes: [], affixes: [] });
    const ring = normalizeItem({ kind: 'ring', slot: 'ring', name: '赤玉指环', rarity: 'magic', ilvl: 20, sockets: 0, runes: [], affixes: [] });
    Game.state.inventory.push(w, ring);
    Game.addCrystal(1000);
    out.have = Game.crystalCount();

    /* 1) 戒指拒绝打孔 */
    const rRing = Game.drillSocketItem(ring);
    out.ringRejected = !rRing.ok && /戒指/.test(rRing.msg || '');

    /* 2) 逐孔打到 5，记录每孔花费 */
    out.costs = [];
    for (let i = 0; i < 6; i++) {
      const before = Game.crystalCount();
      const r = Game.drillSocketItem(w);
      out.costs.push({ i, ok: r.ok, cost: r.ok ? r.cost : null, sockets: r.ok ? r.sockets : null, msg: r.ok ? '' : (r.msg || ''), spent: before - Game.crystalCount() });
    }
    out.finalSockets = w.sockets;
    out.finalRunesLen = w.runes.length;
    out.runesAllNull = w.runes.every(x => x === null);
    out.spentTotal = 1000 - (Game.crystalCount() - 1000) >= 0 ? (1000 + 1000 - Game.crystalCount()) : -1;

    /* 3) 新孔可以镶符文 */
    Game.addRune('el', 1);
    const rSock = Game.socketRune(w, 4, 'el');
    out.socketIntoNewHole = rSock.ok && w.runes[4] === 'el';

    /* 4) 存档往返：5 孔必须活下来（旧 normalizeItem 会砍到 4） */
    Game.save();
    const flat = SaveManager.load(1);
    out.afterLoad = flat.inventory.find(it => it.name === '试炼巨剑');
    out.loadedSockets = out.afterLoad ? out.afterLoad.sockets : null;
    out.loadedRunes = out.afterLoad ? out.afterLoad.runes.length : null;

    /* 5) 导出→导入往返 */
    const text = SaveManager.exportText(1);
    const imp = SaveManager.importText(text, 2);
    const flat2 = SaveManager.load(2);
    const w2 = flat2.inventory.find(it => it.name === '试炼巨剑');
    out.importOk = imp.ok;
    out.importedSockets = w2 ? w2.sockets : null;
    return out;
  });

  if (!r1.started) { bad('游戏未开局'); }
  else {
    if (r1.ringRejected) ok('戒指打孔被拒绝（提示含「戒指」）');
    else bad('戒指打孔未被拒绝');

    const expect = [14, 20, 28, 38, 50];
    let costOk = true, firstFiveOk = true;
    for (let i = 0; i < 5; i++) {
      if (!r1.costs[i].ok || r1.costs[i].cost !== expect[i] || r1.costs[i].sockets !== i + 1 || r1.costs[i].spent !== expect[i]) { costOk = false; firstFiveOk = false; }
    }
    if (firstFiveOk && r1.costs[5].ok === false && /上限/.test(r1.costs[5].msg)) ok('逐孔打孔扣费正确（14/20/28/38/50），第 6 次被上限拒绝');
    else bad('打孔扣费/上限异常：' + JSON.stringify(r1.costs));
    if (r1.finalSockets === 5 && r1.finalRunesLen === 5 && r1.runesAllNull === true) ok('5 孔时 runes 数组长度同步（5 个空孔）');
    else bad('runes 同步异常：sockets=' + r1.finalSockets + ' runes=' + r1.finalRunesLen);
    if (r1.socketIntoNewHole) ok('新打出的孔可以正常镶嵌符文');
    else bad('新孔镶符文失败');
    if (r1.loadedSockets === 5 && r1.loadedRunes === 5) ok('存档往返后仍是 5 孔（normalizeItem 上限已放宽）');
    else bad('读档后孔数异常：' + r1.loadedSockets);
    if (r1.importOk && r1.importedSockets === 5) ok('导出→导入后仍是 5 孔');
    else bad('导入后孔数异常：importOk=' + r1.importOk + ' sockets=' + r1.importedSockets);
  }

  /* ---------- UI：符文页列出 0 孔装备并渲染打孔按钮 ---------- */
  const ui = await page.evaluate(() => {
    Game.state.inventory = Game.state.inventory.filter(it => it.name !== '试炼巨剑' && it.name !== '赤玉指环');
    const zero = normalizeItem({ kind: 'chest', slot: 'chest', name: '素色战甲', rarity: 'common', ilvl: 10, sockets: 0, runes: [], affixes: [{ key: 'str', val: 3, pre: '', suf: '', tier: 1, q: 1 }] });
    Game.state.inventory.push(zero);
    UI.forgeTab = 'rune';
    UI.forgeRef = null;
    UI.openForge('inv:' + (Game.state.inventory.length - 1));
    const listHas = [...document.querySelectorAll('#forgeList [data-fref]')].some(el => el.textContent.includes('素色战甲'));
    const btn = document.querySelector('#forgeMain [data-fdrill]');
    const sub = [...document.querySelectorAll('#forgeList .fs')].map(e => e.textContent).find(t => t.includes('素色战甲')) || '';
    return { listHas, hasBtn: !!btn, btnText: btn ? btn.textContent.trim() : '', disabled: btn ? btn.disabled : null, sub };
  });
  if (ui.listHas) ok('符文页装备列表包含 0 孔装备（素色战甲）');
  else bad('0 孔装备未出现在符文页列表');
  if (ui.hasBtn && /14/.test(ui.btnText)) ok('打孔按钮已渲染：' + ui.btnText);
  else bad('打孔按钮缺失或价格不对：' + ui.btnText);

  /* 点按钮 → 真打孔 */
  const clicked = await page.evaluate(() => {
    Game.addCrystal(100);
    document.querySelector('#forgeMain [data-fdrill]').click();
    const item = Game.state.inventory.find(it => it.name === '素色战甲');
    return { sockets: item.sockets, crystalSpent: Game.crystalCount() <= 100 };
  });
  if (clicked.sockets === 1) ok('点击打孔按钮后装备变为 1 孔');
  else bad('点击打孔无效：sockets=' + clicked.sockets);

  /* ---------- 收尾 ---------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-drill.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
