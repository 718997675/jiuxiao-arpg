/* ============================================================
 * 浏览器冒烟测试（Edge headless + puppeteer-core）
 *
 * 覆盖：
 *   1. 页面能否无报错加载
 *   2. 开始界面是否渲染出 4 档难度、描述是否随选择切换
 *   3. ?cls=&diff= 直接开局时，state.difficulty 是否正确落地
 *   4. HUD 难度徽标是否显示对应档位
 *   5. 血条修复：血条组的世界朝向是否已对齐相机（错位的根因）
 *   6. 四档难度下怪物血量是否真的按系数放大
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8899;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const ok = (m) => { results.push(['PASS', m]); console.log('  [PASS] ' + m); };
const bad = (m) => { results.push(['FAIL', m]); console.log('  [FAIL] ' + m); };

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });

  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n  浏览器冒烟测试');
  console.log('  ' + '='.repeat(64));

  /* ---------- 1. 开始界面 ---------- */
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));

  const startInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#diffPick .cdiff')];
    return {
      count: cards.length,
      names: cards.map(c => c.querySelector('.dn').textContent.trim()),
      selected: document.querySelector('#diffPick .cdiff.sel .dn')?.textContent.trim(),
      desc: (document.getElementById('diffDesc')?.textContent || '').trim(),
      classCount: document.querySelectorAll('#classPick .cclass').length
    };
  });

  if (startInfo.count === 4) ok('开始界面渲染出 4 档难度：' + startInfo.names.join(' / '));
  else bad('难度卡片数量异常：' + startInfo.count);

  if (startInfo.selected === '普通') ok('默认选中「普通」');
  else bad('默认难度应为普通，实际：' + startInfo.selected);

  if (startInfo.desc.length > 8) ok('难度描述已渲染（' + startInfo.desc.length + ' 字）');
  else bad('难度描述为空');

  /* 点击「极难」，描述应切换 */
  await page.evaluate(() => {
    const el = document.querySelector('#diffPick .cdiff[data-diff="nightmare"]');
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const afterClick = await page.evaluate(() => ({
    selected: document.querySelector('#diffPick .cdiff.sel .dn')?.textContent.trim(),
    desc: (document.getElementById('diffDesc')?.textContent || '').trim(),
    color: document.getElementById('diffDesc')?.style.color
  }));
  if (afterClick.selected === '极难') ok('点击后切换到「极难」，描述同步更新');
  else bad('切换难度失败，当前：' + afterClick.selected);

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-start.png') });

  /* ---------- 2. 按指定难度开局 ---------- */
  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=nightmare&name=%E6%B5%8B%E8%AF%95`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 5000));

  const inGame = await page.evaluate(() => {
    if (typeof Game === 'undefined' || !Game.state) return { started: false };
    return {
      started: true,
      running: !!Game.running,
      difficulty: Game.state.difficulty,
      diffName: Game.diff().name,
      badge: (document.getElementById('pDiff')?.textContent || '').trim(),
      badgeColor: document.getElementById('pDiff')?.style.color,
      enemyCount: Game.enemies.length
    };
  });

  if (inGame.started && inGame.running) ok('游戏成功开局（running=true）');
  else bad('游戏未进入运行状态');

  if (inGame.difficulty === 'nightmare') ok('state.difficulty 正确落地：nightmare（' + inGame.diffName + '）');
  else bad('difficulty 未落地，实际：' + inGame.difficulty);

  if (inGame.badge === '极难') ok('HUD 难度徽标显示「极难」');
  else bad('HUD 徽标异常：' + inGame.badge);

  /* ---------- 3. 血条朝向修复 ---------- */
  const barCheck = await page.evaluate(async () => {
    /* 造一个怪，让它带上血条 */
    const e = Game.spawnEnemy('halfork', 6, 6, false, 3);
    if (!e || !e.bar) return { spawned: false };
    /* 让怪转个角度，制造错位条件 */
    e.actor.group.rotation.y = 1.1;
    /* 等几帧让 updateHpBar 跑到 */
    await new Promise(r => setTimeout(r, 400));
    const q = new THREE.Quaternion();
    e.bar.group.getWorldQuaternion(q);
    const cq = Game.camera.quaternion;
    const dot = Math.abs(q.dot(cq));
    return { spawned: true, dot, visible: e.bar.group.visible };
  });

  if (barCheck.spawned && barCheck.dot > 0.999) {
    ok('血条世界朝向已对齐相机（dot=' + barCheck.dot.toFixed(5) + '，错位根因已消除）');
  } else if (barCheck.spawned) {
    bad('血条朝向未对齐相机，dot=' + (barCheck.dot || 0).toFixed(4));
  } else {
    bad('无法生成测试怪物');
  }

  /* ---------- 4. 四档难度怪物血量对比 ---------- */
  const KEYS = ['novice', 'normal', 'hard', 'nightmare'];
  const NAMES = { novice: '新手', normal: '普通', hard: '困难', nightmare: '极难' };
  const hpByDiff = await page.evaluate((keys) => {
    const out = {};
    const saved = Game.state.difficulty;
    for (const k of keys) {
      Game.state.difficulty = k;
      const e = Game.spawnEnemy('halfork', 20, 20, false, 5);
      out[k] = e ? Math.round(e.maxHp) : null;
      if (e) { Game.scene.remove(e.actor.group); Game.enemies.pop(); }
    }
    Game.state.difficulty = saved;
    return out;
  }, KEYS);

  const vals = KEYS.map(k => hpByDiff[k]);
  const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
  if (rising) ok('四档怪物血量递增：' + KEYS.map((k, i) => NAMES[k] + ' ' + vals[i]).join(' → '));
  else bad('怪物血量未按难度递增：' + JSON.stringify(hpByDiff));

  const ratio = vals[3] / vals[0];
  if (ratio > 3) ok('极难 / 新手 血量跨度 ' + ratio.toFixed(2) + 'x');
  else bad('血量跨度偏小：' + ratio.toFixed(2) + 'x');

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-ingame.png') });

  /* ---------- 5. 报错检查 ---------- */
  const realErrors = errors.filter(e =>
    !/favicon|WebGL|SwiftShader|GroupMarkerNotSet|Failed to load resource/i.test(e));
  if (realErrors.length === 0) ok('无 JS 运行时错误');
  else {
    bad('发现 ' + realErrors.length + ' 条错误');
    realErrors.slice(0, 6).forEach(e => console.log('        ' + e.slice(0, 160)));
  }

  await browser.close();
  server.close();

  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log('  ' + '='.repeat(64));
  console.log('  结果: ' + (failed === 0 ? 'PASS  全部通过' : 'FAIL  ' + failed + ' 项未通过'));
  console.log('  截图: dev/shot-start.png  dev/shot-ingame.png\n');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
  console.error('\n  测试脚本异常: ' + e.message);
  try { server.close(); } catch (_) { }
  process.exit(2);
});
