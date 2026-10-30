/* ============================================================
 * dev/input-keys.js —— 键盘 / 输入框回归（浏览器）
 *
 * 用户报的 bug（2026-10-28）：
 *   「输入名称时如果之前有名称，点击输入框会显示以前输入的，再次点击就会报错」
 *   → Uncaught TypeError: Cannot read properties of undefined (reading 'toLowerCase')
 *      @ src/game.js:382
 *
 * 根因两条，缺一条都不会崩：
 *   1. `#nameInput` / `#newName` / `#stashSearch` 都没写 `autocomplete="off"`，
 *      Chrome 于是给道号框弹「历史输入」下拉 —— 这就是「显示以前输入的」。
 *   2. 在历史下拉里点选时，Chrome 会发 **`e.key === undefined`** 的 keydown/keyup。
 *      而 `bindInput()` 里 `const k = e.key.toLowerCase()` 写在「输入框聚焦」判断**之前**，
 *      于是先抛 TypeError，被 boot.js 兜成「山海未开 · 运行出错」，整页卡死。
 *
 * 这个脚本钉住四件事：
 *   A. 三个输入框都带 autocomplete="off"（不再弹历史下拉）
 *   B. `e.key === undefined` 的 keydown / keyup 不抛错、不卡死
 *   C. 输入框里打字不写游戏按键状态（打 w 不该让角色往前走）
 *   D. 输入框里打字不触发全局热键（搜索框里打 h 不该弹说明页）
 *
 * 用法：node dev/input-keys.js
 *       node dev/input-keys.js --url https://718997675.github.io/jiuxiao-arpg/
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const EXTERNAL = argv[0] === '--url' ? argv[1] : null;

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

(async () => {
  const srv = EXTERNAL ? null : await serve();
  const URL = EXTERNAL || ('http://127.0.0.1:' + srv.address().port + '/index.html');
  console.log('目标：' + URL);

  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(),
    { waitUntil: 'load', timeout: 60000 });
  await wait(2200);

  console.log('\n— 一、三个输入框都关掉浏览器「历史输入」下拉 —');
  const attrs = await page.evaluate(() => {
    const out = {};
    for (const id of ['nameInput', 'newName', 'stashSearch']) {
      const el = document.getElementById(id);
      out[id] = el ? {
        auto: el.getAttribute('autocomplete'),
        spell: el.getAttribute('spellcheck'),
        cap: el.getAttribute('autocapitalize')
      } : null;
    }
    return out;
  });
  for (const id of ['nameInput', 'newName', 'stashSearch']) {
    ok(!!attrs[id], '#' + id + ' 存在');
    eq(attrs[id] && attrs[id].auto, 'off', '#' + id + ' autocomplete="off"');
    eq(attrs[id] && attrs[id].spell, 'false', '#' + id + ' spellcheck="false"');
    eq(attrs[id] && attrs[id].cap, 'off', '#' + id + ' autocapitalize="off"');
  }

  console.log('\n— 二、e.key === undefined 不崩（用户报的那一下）—');
  /* 复刻 Chrome 的怪事件：KeyboardEvent 构造器的 key 默认是 ''，拿不到 undefined，
   * 必须用 defineProperty 盖成 undefined —— 这正是 Chrome 历史下拉点选时发的形状。 */
  const undef = await page.evaluate(() => {
    const fire = (type) => {
      const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'key', { get: () => undefined });
      Object.defineProperty(ev, 'code', { get: () => undefined });
      window.dispatchEvent(ev);
    };
    const el = document.getElementById('nameInput');
    el.focus();
    let threw = null;
    try { fire('keydown'); fire('keyup'); fire('keydown'); } catch (e) { threw = e.message; }
    el.blur();
    return { threw, alive: !!Game && !!Game.keys };
  });
  ok(undef.threw === null, '聚焦道号框时 e.key 为 undefined 也不抛错', undef.threw);
  ok(undef.alive, 'Game.keys 还在（没被异常打断）');

  console.log('\n— 三、输入框里打字不写游戏按键状态 —');
  const typing = await page.evaluate(() => {
    const el = document.getElementById('nameInput');
    el.focus();
    Game.keys = {};
    /* 真按键：走 Chrome 的输入通道，比 dispatchEvent 更接近真实 */
    return { focused: document.activeElement === el };
  });
  ok(typing.focused, '道号框拿到焦点');
  await page.keyboard.type('wad');
  const afterType = await page.evaluate(() => ({
    val: document.getElementById('nameInput').value,
    w: !!Game.keys.w, a: !!Game.keys.a, d: !!Game.keys.d,
    any: Object.keys(Game.keys).filter(k => Game.keys[k]).length
  }));
  eq(afterType.val, 'wad', '道号框里真的打进了 wad');
  ok(!afterType.w && !afterType.a && !afterType.d,
    '打 w/a/d 没有把游戏按键点亮（角色不会乱走）', afterType);
  eq(afterType.any, 0, 'Game.keys 里没有任何键被按下', afterType.any);

  console.log('\n— 四、输入框里打字不触发全局热键 —');
  await page.evaluate(() => {
    document.getElementById('nameInput').blur();
    /* 包一层 openMenu 记账，避免去猜「哪个面板开着」 */
    window.__menuCalls = [];
    if (!UI.__origOpenMenu) UI.__origOpenMenu = UI.openMenu;
    UI.openMenu = function (id) { window.__menuCalls.push(id); return UI.__origOpenMenu.apply(UI, arguments); };
  });
  await page.evaluate(() => { document.getElementById('nameInput').focus(); });
  await page.keyboard.type('hip');
  const hot = await page.evaluate(() => window.__menuCalls.slice());
  eq(hot.length, 0, '道号框里打 h/i/p 一次菜单都没开', hot);

  /* 反证：焦点不在输入框时，热键必须还能用（别把功能一起关掉） */
  await page.evaluate(() => { document.getElementById('nameInput').blur(); window.__menuCalls = []; });
  await page.keyboard.press('h');
  await wait(300);
  const hot2 = await page.evaluate(() => window.__menuCalls.slice());
  ok(hot2.length === 1 && hot2[0] === 'help', '不在输入框时按 h 仍能开说明页', hot2);

  console.log('\n— 五、页面错误 —');
  ok(errs.length === 0, '零 pageerror / console.error', errs.slice(0, 4));

  await browser.close();
  if (srv) srv.close();

  console.log('\n' + '='.repeat(52));
  console.log(fail === 0 ? '✓ 全部通过  ' + pass + ' 项' : '✗ 有失败项  ' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('='.repeat(52));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('脚本异常：', e); process.exit(1); });
