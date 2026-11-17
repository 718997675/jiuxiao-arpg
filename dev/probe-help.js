#!/usr/bin/env node
/* ============================================================
 * [M7.9] 说明页真机渲染 —— 那四行真的生成了吗
 *
 *   node dev/probe-help.js
 *
 * `check-help.js` 判的是「README 的数字与数据表一致」「ui.js 没写死数字」，
 * 但它读的是**源码文本**，管不到运行时。这一份真的把说明页渲染出来，
 * 抓「十五 · 终章」那一节的正文，逐条确认：
 *
 *   一、副标题带「N 阶段 / 最多 N 轮回」
 *   二、四行都在（终门之后 / 真身怎么打 / 终局传世 / 入轮回）
 *   三、每行里的数字与数据表一致
 *   四、不许出现 undefined / NaN / [object Object]
 *   五、零报错
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(300);

  /* ---------- 一、渲染「终章」那一节 ---------- */
  console.log('一、渲染说明页「十五 · 终章」');
  const got = await page.evaluate(() => {
    UI.renderHelp();
    const nav = document.getElementById('hpNav');
    const tabs = Array.from(nav.querySelectorAll('.hp-tab'));
    const idx = tabs.findIndex(t => /终章/.test(t.textContent));
    if (idx < 0) return { found: false };
    UI.hpTab = idx;
    UI.renderHelp();
    const el = document.getElementById('helpBody');
    const html = el.innerHTML;
    const txt = el.textContent.replace(/\s+/g, ' ');
    return {
      found: true, idx: idx, html: html.slice(0, 200), txt: txt,
      sub: (document.querySelector('.hp-sub') || {}).textContent || '',
      title: (document.querySelector('.hp-title') || {}).textContent || ''
    };
  });
  ok(got.found, '说明页必须有一节标题带「终章」');
  if (!got.found) { await browser.close(); process.exit(1); }

  const T = got.txt || '';
  ok(T.length > 200, '终章那一节必须有内容', T.length);

  /* ---------- 二、四行都在 ---------- */
  console.log('二、四行都在');
  for (const label of ['终门之后', '真身怎么打', '终局传世', '入轮回']) {
    ok(T.indexOf(label) >= 0, '说明页必须有「' + label + '」一行');
  }

  /* ---------- 三、数字与数据表一致 ---------- */
  console.log('三、数字对账（读的是运行时数据，不是源码）');
  const D = await page.evaluate(() => ({
    C: BALANCE.cycle,
    FU: BALANCE.finalUnique,
    F: BOSSES.chaosavatar.bafoFinal
  }));
  ok(T.indexOf('最多 ' + D.C.max + ' 轮回') >= 0, `正文必须写「最多 ${D.C.max} 轮回」`);
  ok(T.indexOf('+' + D.C.lvPer + ' 级') >= 0, `正文必须写「+${D.C.lvPer} 级」`);
  ok(T.indexOf('+' + Math.round(D.C.dropMul * 100) + '%') >= 0,
    `正文必须写「+${Math.round(D.C.dropMul * 100)}%」`);
  ok(T.indexOf((1 + D.C.dropMul * D.C.max).toFixed(1)) >= 0,
    `正文必须写满轮回倍率 ${(1 + D.C.dropMul * D.C.max).toFixed(1)}`);

  const pc = v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  ok(T.indexOf(pc(D.FU.rate.normal)) >= 0, `正文必须写普通档 ${pc(D.FU.rate.normal)}`);
  ok(T.indexOf(pc(D.FU.rate.nightmare)) >= 0, `正文必须写极难档 ${pc(D.FU.rate.nightmare)}`);
  ok(T.indexOf(D.FU.guaranteed.crystal.join('~')) >= 0,
    `正文必须写玄晶区间 ${D.FU.guaranteed.crystal.join('~')}`);

  ok(T.indexOf(String(D.F.names.length)) >= 0, `正文必须写「${D.F.names.length} 段」`);
  ok(T.indexOf(D.F.rage.aspd + '%') >= 0, `正文必须写攻速 +${D.F.rage.aspd}%`);
  ok(T.indexOf(D.F.weakRotate + ' 秒') >= 0, `正文必须写「每 ${D.F.weakRotate} 秒」换弱点`);
  ok(T.indexOf(D.F.shrink.r0 + ' 米') >= 0 && T.indexOf(D.F.shrink.r1 + ' 米') >= 0,
    `正文必须写塌缩圈 ${D.F.shrink.r0} → ${D.F.shrink.r1} 米`);

  /* ---------- 四、不许有渲染残留 ---------- */
  console.log('四、渲染残留');
  ok(T.indexOf('undefined') < 0, '正文里不许出现 undefined', T.slice(T.indexOf('undefined') - 40, T.indexOf('undefined') + 40));
  ok(T.indexOf('NaN') < 0, '正文里不许出现 NaN');
  ok(T.indexOf('[object Object]') < 0, '正文里不许出现 [object Object]');
  ok(T.indexOf('null') < 0, '正文里不许出现 null');

  /* ---------- 五、零报错 ---------- */
  console.log('五、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  M7.9 说明页真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
