#!/usr/bin/env node
/* ============================================================
 * [equip-doll P6] 移动端试衣间 + 帧率 · 真机
 *
 *   node dev/probe-p6-mobile.js
 *
 * 计划书 §10 P6 判据②：iPhone SE 尺寸 ≥ 30fps。
 * 补 P5 没覆盖的「试衣间打开态」：折叠按钮可点、canvas 不出屏、
 * 面板可滚、打开试衣间后游戏主循环帧率不掉到 30 以下。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const EXE = require('./_chrome');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(TARGET + '?mobile=1', { waitUntil: 'load' });
  await wait(1200);

  /* ---------- 一、打开试衣间 ---------- */
  console.log('一、iPhone SE 375×667 打开试衣间');
  await page.evaluate(() => {
    Game.startNew('warrior', 'P6M');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
    UI.openMenu('bag');
  });
  await wait(400);

  /* 触屏默认折叠；点头部展开 */
  await page.evaluate(() => {
    const h = document.getElementById('dpHead');
    if (document.getElementById('dpBody').style.display === 'none' && h) h.click();
  });
  await wait(350);

  const layout = await page.evaluate(() => {
    const body = document.getElementById('dpBody');
    const cv = document.getElementById('dpCanvas');
    const head = document.getElementById('dpHead');
    const bag = document.querySelector('#panelBag') || document.querySelector('[data-panel="bag"]')
      || document.getElementById('panel-bag');
    const r = cv.getBoundingClientRect();
    const col = (document.querySelector('.inv-left') || cv.parentElement);
    const cr = col.getBoundingClientRect();
    return {
      shown: body && body.style.display !== 'none',
      cvW: Math.round(r.width), cvH: Math.round(r.height),
      inViewX: r.left >= -1 && r.right <= window.innerWidth + 1,
      colScrollable: col.scrollHeight <= col.clientHeight + 2
        || /auto|scroll/.test(getComputedStyle(col).overflowY),
      headClickable: !!(head && head.getBoundingClientRect().height >= 16),
      checksum: (typeof DollPreview !== 'undefined') ? DollPreview.stats().checksum : -1,
      vw: window.innerWidth, vh: window.innerHeight
    };
  });
  console.log('  canvas ' + layout.cvW + '×' + layout.cvH + ' · 视口 ' + layout.vw + '×' + layout.vh
    + ' · 校验和 ' + layout.checksum);
  ok(layout.shown, '点头部后试衣间应展开', layout);
  ok(layout.inViewX, 'canvas 不能横向出屏', layout);
  ok(layout.cvW > 100 && layout.cvH > 100, 'canvas 尺寸不能塌成 0', layout);
  ok(layout.colScrollable, '左列内容超出时必须可滚', layout);
  ok(layout.headClickable, '折叠头必须可点', layout);
  ok(layout.checksum > 0, '移动端试衣间必须真的出图', layout.checksum);

  /* ---------- 二、帧率：试衣间不能拖慢主循环 ----------
   * 无头 SwiftShader 是纯软件光栅，绝对帧率本来就到不了 30（真机 GPU 才能）。
   * 所以判据改成「开试衣间前后帧率不退化」—— P5 的设计是「签名不变就不渲」，
   * 它本来就应当零每帧开销；若它每帧 readPixels，这里会立刻掉一半。 */
  console.log('\n二、开关试衣间的帧率对比（无头软件光栅只看相对值）');
  const measure = () => page.evaluate(async () => {
    const stamps = [];
    return await new Promise(resolve => {
      const tick = (t) => {
        stamps.push(t);
        if (stamps.length >= 31) {
          const spans = [];
          for (let i = 1; i < stamps.length; i++) spans.push(stamps[i] - stamps[i - 1]);
          spans.sort((a, b) => a - b);
          resolve(1000 / spans[Math.floor(spans.length / 2)]);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  /* 关掉面板量基线 */
  await page.evaluate(() => UI.closeMenu());
  await wait(300);
  const fpsBase = await measure();
  await page.evaluate(() => { UI.openMenu('bag'); const h = document.getElementById('dpHead');
    if (document.getElementById('dpBody').style.display === 'none') h.click(); });
  await wait(300);
  const fpsOpen = await measure();
  console.log('  基线 ' + fpsBase.toFixed(1) + 'fps · 开试衣间 ' + fpsOpen.toFixed(1) + 'fps');
  ok(fpsOpen >= fpsBase * 0.85, '开试衣间让主循环帧率掉了 15% 以上（每帧在 readPixels？）',
    { base: fpsBase, open: fpsOpen });

  /* 空闲期间不许重复渲染 —— 这是「零每帧开销」的直接证据 */
  const idle = await page.evaluate(async () => {
    const r0 = DollPreview.stats().renders;
    await new Promise(r => setTimeout(r, 500));
    return { r0, r1: DollPreview.stats().renders };
  });
  ok(idle.r1 === idle.r0, '静止 500ms 内试衣间不应重复渲染', idle);

  /* ---------- 三、折叠回去不再渲染 ---------- */
  console.log('\n三、折叠后停止重复渲染');
  const fold = await page.evaluate(async () => {
    const r0 = DollPreview.stats().renders;
    document.getElementById('dpHead').click();
    await new Promise(r => setTimeout(r, 250));
    const r1 = DollPreview.stats().renders;
    return { r0, r1, shown: document.getElementById('dpBody').style.display !== 'none' };
  });
  console.log('  renders ' + fold.r0 + ' → ' + fold.r1 + ' · 展开 ' + fold.shown);
  ok(!fold.shown, '再点一次应折叠', fold);
  ok(fold.r1 - fold.r0 <= 1, '折叠后不应继续渲染', fold);

  ok(errs.length === 0, '页面不许有报错', errs.slice(0, 4));
  console.log('\n----------------------------------------');
  console.log((fail === 0 ? '✓ 全部通过' : '✗ 失败 ' + fail) + '：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
