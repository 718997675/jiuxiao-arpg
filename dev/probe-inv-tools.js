/* ============================================================
 * 回归探针：一键分解 + 套装图鉴（v1.1.4）
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8893;
/* 浏览器可执行文件自动探测：优先本机 Chrome / Edge，兼容 Windows 路径 */
const EDGE_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const EDGE = EDGE_CANDIDATES.find(p => fs.existsSync(p)) || EDGE_CANDIDATES[0];

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

  console.log('\n  一键分解 + 套装图鉴回归');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E8%A1%8C%E8%A2%8B`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  const r1 = await page.evaluate(() => {
    const out = {};
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;

    const mk = (name, rarity, ilvl, sockets, runes) => normalizeItem({
      kind: 'chest', slot: 'chest', name, rarity, ilvl, cls: 'warrior',
      baseArmor: 50, sockets: sockets || 0, runes: runes || [], affixes: []
    });
    /* 3 凡品（其中 1 件镶了符文 el）+ 2 法器 + 1 玄品 + 1 神兵 */
    Game.state.inventory = [
      mk('凡品甲', 'common', 10, 0),
      mk('凡品乙', 'common', 12, 1, ['el']),
      mk('凡品丙', 'common', 14, 0),
      mk('法器甲', 'magic', 16, 0),
      mk('法器乙', 'magic', 18, 0),
      mk('玄品甲', 'rare', 20, 0),
      mk('神兵甲', 'legendary', 25, 0)
    ];
    Game.addRune('el', -99);          // 清空符文袋，验证卸下返还
    const runeBefore = Game.runeCount('el');
    const c0 = [1, 2, 3, 4].map(i => Game.crystalTierCount(i));

    /* 预览 */
    const pvCommon = Game.previewDecomposeJunk(false);
    const pvMagic = Game.previewDecomposeJunk(true);
    out.pvCommonCount = pvCommon.count;
    out.pvMagicCount = pvMagic.count;
    out.pvMagicExtra = pvMagic.magicCount;

    /* 分解凡品 */
    const r = Game.decomposeJunk(false);
    out.ok = r.ok;
    out.count = r.count;
    out.left = Game.state.inventory.map(it => it.name);
    out.runeReturned = Game.runeCount('el') - runeBefore;      // 卸下 'el' 应返还 1
    const c1 = [1, 2, 3, 4].map(i => Game.crystalTierCount(i));
    out.crystalGain = c1.map((v, i) => v - c0[i]);
    out.yieldsMatch = r.yields.every((v, i) => v === out.crystalGain[i]);

    /* 再分解（含法器） */
    const r2 = Game.decomposeJunk(true);
    out.ok2 = r2.ok;
    out.left2 = Game.state.inventory.map(it => it.name);

    /* 没有可分解时 */
    const r3 = Game.decomposeJunk(true);
    out.emptyRejected = !r3.ok && /没有可分解/.test(r3.msg || '');

    /* 凡品也不分时（只剩玄品/神兵） */
    const r4 = Game.decomposeJunk(false);
    out.emptyRejected2 = !r4.ok;

    return out;
  });

  if (!r1.started) { bad('游戏未开局'); }
  else {
    if (r1.pvCommonCount === 3 && r1.pvMagicCount === 5 && r1.pvMagicExtra === 2) ok('预览正确：凡品 3 件 / 含法器 5 件');
    else bad('预览异常：' + JSON.stringify(r1));
    if (r1.ok && r1.count === 3 && JSON.stringify(r1.left) === JSON.stringify(['法器甲', '法器乙', '玄品甲', '神兵甲'])) ok('分解凡品后法器/玄品/神兵保留');
    else bad('分解范围异常：left=' + JSON.stringify(r1.left));
    if (r1.runeReturned === 1) ok('带镶嵌装备先自动卸下符文再分解（el 返还 1）');
    else bad('符文未返还：' + r1.runeReturned);
    if (r1.yieldsMatch && r1.crystalGain[0] > 0) ok('玄晶到账与预告一致（+' + r1.crystalGain.join('/') + '）');
    else bad('产出异常：gain=' + JSON.stringify(r1.crystalGain) + ' yields=' + JSON.stringify(r1.yieldsMatch));
    if (r1.ok2 && JSON.stringify(r1.left2) === JSON.stringify(['玄品甲', '神兵甲'])) ok('勾选连带法器后法器也被分解');
    else bad('含法器分解异常：' + JSON.stringify(r1.left2));
    if (r1.emptyRejected && r1.emptyRejected2) ok('无可分解物品时明确拒绝');
    else bad('空分解未拦截');
  }

  /* ---------- 套装图鉴 ---------- */
  const r2 = await page.evaluate(() => {
    const out = {};
    /* 给 2 件龙骧（1 装备 + 1 行囊）+ 1 件星阙（仓库） */
    const ql1 = normalizeItem({ kind: 'helm', slot: 'helm', name: '龙骧战盔', rarity: 'set', ilvl: 20, setId: 'longxiang', setName: '龙骧', cls: 'warrior', sockets: 0, runes: [], affixes: [] });
    const ql2 = normalizeItem({ kind: 'gloves', slot: 'gloves', name: '龙骧护手', rarity: 'set', ilvl: 22, setId: 'longxiang', setName: '龙骧', cls: 'warrior', sockets: 0, runes: [], affixes: [] });
    const jy = normalizeItem({ kind: 'helm', slot: 'helm', name: '星阙法冠', rarity: 'set', ilvl: 24, setId: 'xingque', setName: '星阙', cls: 'mage', sockets: 0, runes: [], affixes: [] });
    Game.state.equipment.helm = ql1;
    Game.state.inventory.push(ql2);
    if (!Game.state.stash) Game.state.stash = { items: [], mats: {} };
    Game.state.stash.items.push(jy);

    /* 从背包界面点「套装图鉴」按钮 */
    UI.toggleInv();
    document.getElementById('invCodexBtn').click();
    const panel = document.getElementById('setCodexPanel');
    out.opened = panel.classList.contains('open');
    out.sumTxt = (document.getElementById('setCodexSum').textContent || '').trim();
    out.setCount = document.querySelectorAll('#setCodexList .cx-set').length;
    const qlCard = [...document.querySelectorAll('#setCodexList .cx-set')].find(c => c.textContent.includes('龙骧'));
    out.qlHasCount = /已集\s*2\s*\/\s*5/.test(qlCard.textContent.replace(/\s/g, ''));
    out.qlPiecesGot = qlCard.querySelectorAll('.cx-piece.got').length;
    out.qlPieceNames = [...qlCard.querySelectorAll('.cx-piece.got .cx-pname')].map(e => e.textContent);
    out.qlBonusOn = qlCard.querySelectorAll('.cx-b.on').length;     // 2 件档激活，4/6 件未激活
    out.qlBonusTotal = qlCard.querySelectorAll('.cx-b').length;
    const jyCard = [...document.querySelectorAll('#setCodexList .cx-set')].find(c => c.textContent.includes('星阙'));
    out.jyGot = jyCard.querySelectorAll('.cx-piece.got').length;    // 仓库里的也算
    return out;
  });
  if (r2.opened) ok('背包界面「套装图鉴」按钮打开图鉴面板');
  else bad('图鉴面板未打开');
  if (/9\s*套/.test(r2.sumTxt) && /已收集\s*3\s*件/.test(r2.sumTxt.replace(/\s/g, ''))) ok('汇总正确：9 套 · 已收集 3 件');
  else bad('汇总异常：' + r2.sumTxt);
  if (r2.setCount === 9) ok('渲染全部 9 套职业套装（3 职业 × 3 类型）');
  else bad('套装卡片数异常：' + r2.setCount);
  if (r2.qlHasCount && r2.qlPiecesGot === 2 && r2.qlPieceNames.join(',').includes('龙骧战盔') && r2.qlPieceNames.join(',').includes('龙骧护手')) ok('龙骧卡片显示已集 2/5，部件清单标注已获得（装备+行囊）');
  else bad('龙骧卡片异常：' + JSON.stringify(r2));
  if (r2.qlBonusOn === 1 && r2.qlBonusTotal === 3) ok('套装加成档位激活状态正确（2 件档亮，3/5 件暗）');
  else bad('加成档位异常：on=' + r2.qlBonusOn + '/' + r2.qlBonusTotal);
  if (r2.jyGot === 1) ok('账号仓库里的套装件也计入图鉴');
  else bad('仓库件未计入：' + r2.jyGot);

  /* ---------- 一键分解 UI 流程 ---------- */
  const r3 = await page.evaluate(() => {
    const out = {};
    Game.state.inventory = [
      normalizeItem({ kind: 'chest', slot: 'chest', name: 'UI凡品', rarity: 'common', ilvl: 10, baseArmor: 30, sockets: 0, runes: [], affixes: [] }),
      normalizeItem({ kind: 'helm', slot: 'helm', name: 'UI法器', rarity: 'magic', ilvl: 12, baseArmor: 20, sockets: 0, runes: [], affixes: [] })
    ];
    UI.toggleInv();
    UI.invJunkOpen = false; UI.invJunkMagic = false;
    UI.renderInventory();
    const bar = document.getElementById('invJunkBar');
    out.barHidden = bar.style.display === 'none';
    document.getElementById('invDecomposeBtn').click();
    out.barShown = bar.style.display !== 'none';
    out.barTxt = bar.textContent.replace(/\s+/g, ' ').trim();
    out.confirmDisabled = document.querySelector('[data-junkok]').disabled;
    /* 勾选连带法器 → 预览应变 2 件 */
    document.querySelector('[data-junkmagic]').click();
    out.barTxt2 = bar.textContent.replace(/\s+/g, ' ').trim();
    /* 确认分解 */
    document.querySelector('[data-junkok]').click();
    out.left = Game.state.inventory.map(it => it.name);
    out.barClosed = bar.style.display === 'none';
    return out;
  });
  if (r3.barHidden && r3.barShown) ok('「一键分解」按钮展开/收起确认条');
  else bad('确认条显隐异常');
  if (/1\s*件凡品/.test(r3.barTxt.replace(/\s+/g, '')) || /分解\s*1\s*件/.test(r3.barTxt)) ok('确认条显示待分解数量与预计产出');
  else bad('确认条文案异常：' + r3.barTxt);
  if (/2\s*件/.test(r3.barTxt2.replace(/\s+/g, ''))) ok('勾选「连带法器」后预览实时变为 2 件');
  else bad('勾选联动异常：' + r3.barTxt2);
  if (r3.left.length === 0 && r3.barClosed) ok('确认分解后行囊清空、确认条收起');
  else bad('分解执行异常：left=' + JSON.stringify(r3.left));

  /* ---------- 收尾 ---------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-codex.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
