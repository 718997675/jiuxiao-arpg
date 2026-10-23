/* ============================================================
 * 回归探针：难度 / 传送石 / 技能领悟 在「导出→导入→读档」链路不丢失
 * 背景 bug：pack()/unpack() 白名单漏了 difficulty，
 * 选最高难度开的档，导出再导入后变回「普通」。
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8897;
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

  console.log('\n  难度存档链路回归');
  console.log('  ' + '='.repeat(64));

  /* ---------- 1. 最高难度开局 ---------- */
  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=nightmare&name=%E9%9B%81%E9%9C%84`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 5000));

  const s1 = await page.evaluate(() => {
    if (typeof Game === 'undefined' || !Game.state) return { started: false };
    /* 造点会进存档的数据：传送石 + 一个已领悟技能 */
    Game.state.teleportStones = 3;
    Game.skillFlags.thrust = true;
    Game.state.skillFlags = Game.skillFlags;
    Game.save();
    return {
      started: true,
      difficulty: Game.state.difficulty,
      stones: Game.state.teleportStones,
      slot: Game.savedSlot
    };
  });
  if (!s1.started) { bad('游戏未开局'); }
  else {
    if (s1.difficulty === 'nightmare') ok('开局难度=nightmare（极难）');
    else bad('开局难度异常：' + s1.difficulty);
  }

  /* ---------- 2. 导出 → 导入到另一角色位 → 读档 ---------- */
  const s2 = await page.evaluate(async () => {
    const out = {};
    const text = SaveManager.exportText(1);
    out.exportedDiff = (JSON.parse(text).char || {}).difficulty;
    const r = SaveManager.importText(text, 2);
    out.importOk = r.ok;
    const flat = SaveManager.load(2);
    out.loadedDiff = flat && flat.difficulty;
    out.loadedStones = flat && flat.teleportStones;
    out.loadedFlags = flat && flat.skillFlags;
    out.slot2Diff = (SaveManager.peek(2).char || {}).difficulty;
    return out;
  });
  if (s2.exportedDiff === 'nightmare') ok('导出 JSON 内 difficulty=nightmare');
  else bad('导出 JSON 难度丢失：' + s2.exportedDiff);
  if (s2.importOk && s2.loadedDiff === 'nightmare') ok('导入角色位2 后读档 difficulty=nightmare');
  else bad('导入后难度丢失：importOk=' + s2.importOk + ' diff=' + s2.loadedDiff);
  if (s2.slot2Diff === 'nightmare') ok('存档 doc.char.difficulty 已持久化');
  else bad('doc 内 difficulty=' + s2.slot2Diff);
  if (s2.loadedStones === 3) ok('传送石数量随档保存（3）');
  else bad('传送石丢失：' + s2.loadedStones);
  if (s2.loadedFlags && s2.loadedFlags.thrust === true) ok('技能领悟标记随档保存（thrust）');
  else bad('技能领悟丢失：' + JSON.stringify(s2.loadedFlags));

  /* ---------- 3. 整页刷新后从角色位1 继续游戏 ---------- */
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  const s3 = await page.evaluate(() => {
    const out = {};
    out.loaded = Game.loadSlot(1);
    out.difficulty = Game.state && Game.state.difficulty;
    out.diffName = Game.diff && Game.diff().name;
    out.badge = (document.getElementById('pDiff')?.textContent || '').trim();
    out.stones = Game.state && Game.state.teleportStones;
    out.flags = Game.skillFlags;
    return out;
  });
  if (s3.loaded && s3.difficulty === 'nightmare' && s3.diffName === '极难') ok('刷新后续档：难度仍是极难');
  else bad('刷新后续档难度异常：loaded=' + s3.loaded + ' diff=' + s3.difficulty);
  if (s3.badge === '极难') ok('HUD 难度徽标显示「极难」');
  else bad('HUD 徽标异常：' + s3.badge);
  if (s3.stones === 3) ok('刷新后传送石仍在（3）');
  else bad('刷新后传送石异常：' + s3.stones);
  if (s3.flags && s3.flags.thrust === true) ok('刷新后技能领悟仍在');
  else bad('刷新后技能领悟丢失');

  /* ---------- 4. 旧档（无 difficulty 字段）回落默认档 ---------- */
  const s4 = await page.evaluate(() => {
    const doc = SaveManager.peek(1);
    delete doc.char.difficulty;
    SaveManager.writeSlot(3, doc);
    const flat = SaveManager.load(3);
    const text = SaveManager.exportText(3);
    const re = SaveManager.importText(text, 3);
    return {
      fallback: flat.difficulty,
      afterRoundtrip: re.ok ? (SaveManager.load(3).difficulty) : null,
      err: re.error || null
    };
  });
  if (s4.fallback === 'normal' && s4.afterRoundtrip === 'normal' && !s4.err) ok('旧档无 difficulty → 回落普通，且可正常导出/导入');
  else bad('旧档回落异常：' + JSON.stringify(s4));

  /* ---------- 5. 脏值（手改的非法难度）被纠正 ---------- */
  const s5 = await page.evaluate(() => {
    const doc = SaveManager.peek(1);
    doc.char.difficulty = 'hacker-mode';
    SaveManager.writeSlot(3, doc);
    const r = SaveManager.importText(SaveManager.exportText(3), 3);
    return { fixed: SaveManager.load(3).difficulty, err: r.error || null };
  });
  if (s5.fixed === 'normal' && !s5.err) ok('非法难度值被纠正为普通');
  else bad('脏值处理异常：' + JSON.stringify(s5));

  /* ---------- 收尾 ---------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-diff-save.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
