#!/usr/bin/env node
/**
 * 预览站回归：确认「子路径部署」真的能开局，且存档与正式站隔离。
 *
 *   node dev/preview-check.js                                  # 校验本地 http://127.0.0.1:8765/preview/act-expansion/
 *   node dev/preview-check.js <slug>                           # 校验本地某个 slug
 *   node dev/preview-check.js --url https://.../preview/x/     # 校验线上（隔离项自动跳过）
 *
 * 检查项：
 *   1. HTTP 200，零 pageerror，零 requestfailed
 *   2. 点「开始」后 Game.running，且人物真的动了
 *   3. 所有本地资源都从 /preview/<slug>/ 下取（没有掉到站点根）
 *   4. 存档隔离：预览站写的键，正式站读不到（同源，不隔离就会互相覆盖）
 */
'use strict';

const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2);
let URL = 'http://127.0.0.1:8765/preview/act-expansion/';
if (argv[0] === '--url' && argv[1]) URL = argv[1];
else if (argv[0] && argv[0] !== '--url') URL = 'http://127.0.0.1:8765/preview/' + argv[0] + '/';
const IS_LOCAL = /127\.0\.0\.1|localhost/.test(URL);
if (!URL.includes('?')) URL += '?t=' + Date.now();
// 同源的正式站根地址，用来做存档隔离的黑盒对照
const ROOT_URL = IS_LOCAL ? URL.replace(/\/preview\/.*$/, '/') : null;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errs = [], failed = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('requestfailed', r => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

  console.log('URL:', URL);
  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  console.log('HTTP:', resp.status());
  await wait(2500);

  const head = await page.evaluate(() => ({
    title: document.title,
    shim: !!document.querySelector('script[data-preview-shim]')
  }));
  console.log('TITLE:', JSON.stringify(head.title), '| 存档隔离 shim:', head.shim);

  // 起局：真实鼠标点击（合成 click 不一定能过游戏的 pointerdown 判定）
  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await wait(2500);

  const before = await page.evaluate(() => (typeof Game !== 'undefined' && Game.playerGroup)
    ? [+Game.playerGroup.position.x.toFixed(1), +Game.playerGroup.position.z.toFixed(1)] : null);
  // headless 下 page.keyboard 常因页面没焦点而丢事件，直接驱动 Game.keys 更稳。
  // 键盘映射本身由 dev/smoke.js 覆盖，这里只验「站点能跑、人物能动」。
  await page.evaluate(() => { if (typeof Game !== 'undefined' && Game.keys) Game.keys['w'] = true; });
  await wait(700);
  await page.evaluate(() => { if (typeof Game !== 'undefined' && Game.keys) Game.keys['w'] = false; });
  await wait(400);

  const st = await page.evaluate(() => {
    // 资源来源：本地脚本/音频/模型是否都落在预览目录下
    const base = location.pathname.replace(/index\.html$/, '');
    const res = performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => n.indexOf(location.origin) === 0)
      .filter(n => /\.(js|wav|mp3|m4a|glb|json)(\?|$)/.test(n));
    const outside = res.filter(n => new URL(n).pathname.indexOf(base) !== 0);

    const hasGame = typeof Game !== 'undefined';
    // 注意：Game 是顶层 const/let，不挂 window，必须直接引用变量
    return {
      hasGame,
      running: hasGame && !!Game.running,
      map: hasGame && Game.state ? Game.state.mapId : null,
      lvl: hasGame && Game.state ? Game.state.level : null,
      pos: hasGame && Game.playerGroup ? [+Game.playerGroup.position.x.toFixed(1), +Game.playerGroup.position.z.toFixed(1)] : null,
      fatal: getComputedStyle(document.getElementById('fatal')).display,
      resTotal: res.length,
      resOutside: outside.slice(0, 5)
    };
  });

  const moved = before && st.pos ? (Math.abs(st.pos[0] - before[0]) + Math.abs(st.pos[1] - before[1]) > 0.2) : false;
  console.log('AFTER START:', JSON.stringify({ hasGame: st.hasGame, running: st.running, map: st.map, lvl: st.lvl, pos: st.pos, moved, fatal: st.fatal }));
  console.log('RESOURCES:', st.resTotal, '个本地资源，越界', st.resOutside.length, st.resOutside.length ? JSON.stringify(st.resOutside) : '');

  // ---------- 存档隔离（黑盒：预览写 → 正式站读） ----------
  let isolated = null;
  if (ROOT_URL) {
    const KEY = '__probe_' + Date.now();
    await page.evaluate(k => localStorage.setItem(k, 'pv'), KEY);
    const back = await page.evaluate(k => localStorage.getItem(k), KEY);

    const root = await browser.newPage();
    await root.goto(ROOT_URL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    const seen = await root.evaluate(k => ({
      value: localStorage.getItem(k),
      // 正式站里能看到的键：应该只有它自己的，不该混进预览站的
      previewKeys: (() => { const o = []; for (let i = 0; i < localStorage.length; i++) { const n = localStorage.key(i); if (n && n.indexOf('__pv:') === 0) o.push(n); } return o.slice(0, 5); })()
    }), KEY);
    await root.close();

    isolated = back === 'pv' && seen.value === null;
    console.log('STORAGE:', JSON.stringify({ previewReadBack: back, rootSees: seen.value, rootPreviewKeys: seen.previewKeys, isolated }));
  } else {
    console.log('STORAGE: 线上地址，跳过同源隔离对照');
  }

  console.log('FAILED_REQ:', failed.length ? failed.join('\n') : 'none');
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');

  const pass =
    resp.status() === 200 &&
    st.running && st.fatal === 'none' && moved &&
    errs.length === 0 && failed.length === 0 &&
    st.resOutside.length === 0 &&
    head.shim && head.title.startsWith('[预览]') &&
    isolated !== false;

  console.log(pass ? '\n✅ 预览站 PASS' : '\n❌ 预览站 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
