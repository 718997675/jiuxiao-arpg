/* ============================================================
 * dev/seal-live.js —— M7.4 魔将之印 · 浏览器实测（真 DOM / 真存档）
 *
 * 离线脚本（dev/check-seals.js）把 UI / FX / save 全打成了桩，
 * 只能证明「逻辑对」。这里补的是桩证明不了的三件事：
 *
 *   1. 播报真的落到页面上（`#toasts` / `#log` 里能读到「天之印」「1 / 8」）
 *   2. `Game.save()` 真的把 `seals` 写进 localStorage
 *   3. 刷新页面 → 读档 → `Game.sealCount()` 还是 8（不是内存里的假象）
 *
 * 用法：
 *   node dev/seal-live.js          # 自己起 127.0.0.1 随机端口的静态服务
 *   node dev/seal-live.js --url https://718997675.github.io/jiuxiao-arpg/
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
let EXTERNAL = argv[0] === '--url' ? argv[1] : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'
};

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end('404'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const eq = (a, b, msg) => ok(a === b, msg, { got: a, want: b });

/* 八印清单：从页面里读，不在脚本里硬编码第二份 */
const SEAL_BOSSES = ['bafo_deva', 'bafo_naga', 'bafo_yaksa', 'bafo_gandharva',
  'bafo_asura', 'bafo_garuda', 'bafo_kimnara', 'bafo_mahoraga'];

(async () => {
  const srv = EXTERNAL ? null : await serve();
  const URL = EXTERNAL ? EXTERNAL : 'http://127.0.0.1:' + srv.address().port + '/index.html';
  console.log('目标：' + URL);

  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const enterGame = async () => {
    await page.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(),
      { waitUntil: 'load', timeout: 60000 });
    await wait(2200);
    const box = await page.$eval('#startBtn', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await wait(2000);
  };

  console.log('\n— 一、开局并清掉旧进度 —');
  await enterGame();
  const st0 = await page.evaluate(() => ({
    running: !!Game.running,
    map: Game.state && Game.state.mapId,
    lvl: Game.state && Game.state.level,
    seals: Game.state && Game.state.seals,
    count: Game.sealCount()
  }));
  ok(st0.running, '游戏跑起来了', st0);
  eq(st0.count, 0, '新档 sealCount === 0');
  ok(st0.seals === undefined || Object.keys(st0.seals || {}).length === 0,
    '新档 seals 为空（老档补的 {} 或 undefined 都算对）', st0.seals);

  console.log('\n— 二、杀第一只魔将（帝释）—');
  const one = await page.evaluate(() => {
    Game.onBossKill({ kind: 'bafo_deva' });
    const toasts = Array.from(document.querySelectorAll('#toasts .toast')).map(e => e.textContent);
    const logs = Array.from(document.querySelectorAll('#log > div')).map(e => e.textContent);
    return { seals: Game.state.seals, count: Game.sealCount(), toasts, logs };
  });
  eq(one.count, 1, 'sealCount === 1');
  eq((one.seals || {}).deva, 1, 'state.seals.deva === 1');
  ok(one.toasts.some(t => t.indexOf('天之印') >= 0), '页面上出现「得 · 天之印」', one.toasts);
  ok(one.logs.some(t => t.indexOf('1 / 8') >= 0), '日志里出现「1 / 8」', one.logs);

  console.log('\n— 三、重复击杀不重复给 —');
  const twice = await page.evaluate(() => {
    const before = document.querySelectorAll('#toasts .toast').length;
    Game.onBossKill({ kind: 'bafo_deva' });
    return { count: Game.sealCount(), toasts: document.querySelectorAll('#toasts .toast').length, before };
  });
  eq(twice.count, 1, '再杀一次仍是 1 枚');
  eq(twice.toasts, twice.before, '第二次不再弹播报');

  console.log('\n— 四、杀满八只 → 终门播报 —');
  const eight = await page.evaluate((list) => {
    for (const k of list) Game.onBossKill({ kind: k });
    return {
      count: Game.sealCount(),
      keys: Object.keys(Game.state.seals || {}).length,
      toasts: Array.from(document.querySelectorAll('#toasts .toast')).map(e => e.textContent)
    };
  }, SEAL_BOSSES);
  eq(eight.count, 8, 'sealCount === 8');
  eq(eight.keys, 8, 'seals 里 8 个键');
  ok(eight.toasts.some(t => t.indexOf('终 门 已 开') >= 0), '页面上出现「天龙终门已开」', eight.toasts);

  console.log('\n— 五、真存档：localStorage 里要有 seals —');
  const disk = await page.evaluate(() => {
    Game.save();
    /* 存档键随角色位走，扫一遍所有 v2 槽位，找到有 char.seals 的那个 */
    const hits = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^jiuxiao_save_v2_s\d+$/.test(k)) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        const sl = d && d.char && d.char.seals;
        if (sl && Object.keys(sl).length) hits.push({ k, slot: +k.replace(/^.*_s/, ''), n: Object.keys(sl).length, sl });
      } catch (e) { }
    }
    return hits;
  });
  ok(disk.length > 0, '至少一个存档槽位里写进了 seals', disk.map(h => h.k));
  if (disk.length) {
    eq(disk[0].n, 8, '落盘的 seals 是 8 枚');
    ok(disk[0].sl.deva === 1 && disk[0].sl.mahoraga === 1, '首尾两枚都在盘上',
      { deva: disk[0].sl.deva, mahoraga: disk[0].sl.mahoraga });
  }
  const savedSlot = disk.length ? disk[0].slot : 1;

  console.log('\n— 六、刷新重进：印还在（不是内存假象）—');
  /* 注意：标题页的「开始」是**新建角色**（会占用下一个空槽），
   * 读旧档必须走 Game.loadSlot(n) —— 也就是存档面板那条路。
   * 一开始用 #startBtn 验这一步，结果读到的是 1 级新号，白红了两项。 */
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(),
    { waitUntil: 'load', timeout: 60000 });
  await wait(2200);
  const after = await page.evaluate((slot) => {
    const okLoad = Game.loadSlot(slot);
    return {
      okLoad, count: Game.sealCount(),
      keys: Object.keys((Game.state && Game.state.seals) || {}).length,
      lvl: Game.state && Game.state.level
    };
  }, savedSlot);
  ok(after.okLoad, '读档成功（角色位 ' + savedSlot + '）', after);
  eq(after.count, 8, '刷新后 sealCount 仍是 8');
  eq(after.keys, 8, '刷新后 seals 仍有 8 个键');

  console.log('\n— 七、页面错误 —');
  ok(errs.length === 0, '零 pageerror / console.error', errs.slice(0, 4));

  await page.screenshot({ path: 'shots/seal-live.png' });
  await browser.close();
  if (srv) srv.close();

  console.log('\n' + '='.repeat(52));
  console.log(fail === 0 ? '✓ 全部通过  ' + pass + ' 项' : '✗ 有失败项  ' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('='.repeat(52));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('脚本异常：', e); process.exit(1); });
