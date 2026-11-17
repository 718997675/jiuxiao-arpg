#!/usr/bin/env node
/* ============================================================
 * [P17] 日志消息流 —— 真机体检
 *
 *   node dev/log-check.js
 *
 * 口径见 `docs/POLISH-PLAN.md` P17。这一份是**唯一能验滚动行为**的脚本
 * （离线拿不到 scrollTop / clientHeight），所以直接用真浏览器。
 *
 * 量七件事：
 *   一、结构：#log > #logFold + #logList + #logInput
 *   二、环形缓冲：200 条封顶，超出丢最旧的（内存 + DOM 都封）
 *   三、时间戳：每条前面 `[HH:MM:SS]`
 *   四、降噪：`channel: 'combat'` 不进日志
 *   五、滚动跟随：贴底时跟随；玩家往上翻时**不许跳**
 *   六、折叠：默认收起 4 行，点把手展开 10 行，状态进 localStorage
 *   七、零报错
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

  /* ---------- 一、结构 ---------- */
  console.log('一、结构');
  const dom = await page.evaluate(() => {
    const box = document.getElementById('log');
    return {
      hasBox: !!box,
      hasList: !!document.getElementById('logList'),
      hasFold: !!document.getElementById('logFold'),
      hasInput: !!document.getElementById('logInput'),
      inputReadonly: document.getElementById('logInput').readOnly,
      inputPh: document.getElementById('logInput').placeholder || ''
    };
  });
  ok(dom.hasBox, '#log 必须存在');
  ok(dom.hasList, '#logList 必须存在（滚动容器）');
  ok(dom.hasFold, '#logFold 必须存在（折叠把手）');
  ok(dom.hasInput, '#logInput 必须存在（联机预留）');
  ok(dom.inputReadonly, '输入框现在必须 readonly（功能等联机）');
  ok(/多人/.test(dom.inputPh), '输入框占位文字必须说明「多人模式开放后可用」', dom.inputPh);

  /* ---------- 二、环形缓冲 ---------- */
  console.log('二、环形缓冲：200 条封顶');
  const ring = await page.evaluate(() => {
    UI.logs.length = 0;
    document.getElementById('logList').innerHTML = '';
    for (let i = 0; i < 260; i++) UI.log('消息 ' + i);
    const list = document.getElementById('logList');
    return {
      buf: UI.logs.length,
      dom: list.children.length,
      first: UI.logs[0].text,
      last: UI.logs[UI.logs.length - 1].text,
      domFirst: list.children[0].textContent,
      max: UI.LOG_MAX
    };
  });
  ok(ring.max === 200, 'LOG_MAX 必须是 200', ring.max);
  ok(ring.buf === 200, '内存缓冲必须封顶 200 条', ring.buf);
  ok(ring.dom === 200, 'DOM 也必须封顶 200 条（不封的话一局几小时能堆上千节点）', ring.dom);
  ok(ring.first === '消息 60', '超出时必须丢最旧的（第 0~59 条应该没了）', ring.first);
  ok(ring.last === '消息 259', '最新的必须还在', ring.last);
  ok(ring.domFirst.indexOf('消息 60') >= 0, 'DOM 的第一条也必须是 60', ring.domFirst);

  /* ---------- 三、时间戳 ---------- */
  console.log('三、时间戳');
  const ts = await page.evaluate(() => {
    const list = document.getElementById('logList');
    const last = list.children[list.children.length - 1];
    const span = last.querySelector('.lt');
    return { has: !!span, txt: span ? span.textContent : '', full: last.textContent };
  });
  ok(ts.has, '每条必须有 .lt 时间戳');
  ok(/^\[\d{2}:\d{2}:\d{2}\]$/.test(ts.txt), '时间戳必须是 [HH:MM:SS]', ts.txt);
  ok(/^\[/.test(ts.full), '时间戳必须排在正文前面', ts.full.slice(0, 20));

  /* ---------- 四、降噪 ---------- */
  console.log('四、降噪：combat 不进日志');
  const noise = await page.evaluate(() => {
    UI.logs.length = 0;
    document.getElementById('logList').innerHTML = '';
    UI.log('系统消息', 'good');
    UI.log('伤害 1234', '', 'combat');
    UI.log('掉落了一件', 'good', 'loot');
    UI.log('任务完成', 'lv', 'quest');
    return {
      n: UI.logs.length,
      texts: UI.logs.map(r => r.text),
      chans: UI.logs.map(r => r.channel)
    };
  });
  ok(noise.n === 3, 'combat 频道必须被丢掉（4 条进去只该留 3 条）', noise.texts);
  ok(noise.texts.indexOf('伤害 1234') < 0, 'combat 的消息不许进日志');
  ok(noise.chans.indexOf('loot') >= 0 && noise.chans.indexOf('quest') >= 0,
    'loot / quest 频道必须收进日志', noise.chans);

  /* ---------- 五、滚动跟随 ---------- */
  console.log('五、滚动跟随：贴底跟随，翻上去不跳');
  const scroll = await page.evaluate(() => {
    UI.logs.length = 0;
    const list = document.getElementById('logList');
    list.innerHTML = '';
    /* 先灌满，让它能滚 */
    for (let i = 0; i < 60; i++) UI.log('填充 ' + i);
    const atBottom = () => list.scrollTop + list.clientHeight >= list.scrollHeight - 2;

    /* ① 贴底时来新消息 → 必须跟随 */
    list.scrollTop = list.scrollHeight;
    const before1 = list.scrollTop;
    UI.log('贴底时的新消息');
    const after1 = list.scrollTop;
    const follow = atBottom() && after1 >= before1;

    /* ② 翻到顶上看来历史 → 新消息不许把它拽回去 */
    list.scrollTop = 0;
    const before2 = list.scrollTop;
    UI.log('翻历史时的新消息');
    const after2 = list.scrollTop;

    return { follow: follow, stuck: after2, before2: before2, canScroll: list.scrollHeight > list.clientHeight };
  });
  ok(scroll.canScroll, '（前置）列表必须真的能滚（内容要超出高度）');
  ok(scroll.follow, '贴底时新消息必须自动跟随');
  ok(scroll.stuck === 0, '**玩家往上翻时新消息不许把视图拽回底部**（这是消息流和飘字的分界线）', scroll);

  /* ---------- 六、折叠 ---------- */
  console.log('六、折叠：4 行 / 10 行，状态记忆');
  const fold = await page.evaluate(() => {
    const box = document.getElementById('log');
    UI.setLogOpen(false);
    const h1 = getComputedStyle(document.getElementById('logList')).maxHeight;
    const cls1 = box.classList.contains('fold-open');
    const label1 = document.getElementById('logFold').textContent;
    const ls1 = localStorage.getItem('jx_logOpen');
    UI.setLogOpen(true);
    const h2 = getComputedStyle(document.getElementById('logList')).maxHeight;
    const cls2 = box.classList.contains('fold-open');
    const label2 = document.getElementById('logFold').textContent;
    const ls2 = localStorage.getItem('jx_logOpen');
    const inputShown = getComputedStyle(document.getElementById('logInput')).display;
    UI.setLogOpen(false);
    return { h1: h1, h2: h2, cls1: cls1, cls2: cls2, label1: label1, label2: label2, ls1: ls1, ls2: ls2, inputShown: inputShown };
  });
  ok(!fold.cls1, '默认必须收起（不折叠类）', fold.cls1);
  ok(fold.cls2, '展开后必须有 fold-open 类');
  ok(parseFloat(fold.h2) > parseFloat(fold.h1), '展开后的高度必须大于收起', { h1: fold.h1, h2: fold.h2 });
  ok(fold.ls1 === '0' && fold.ls2 === '1', '折叠状态必须写进 localStorage（记忆）', { a: fold.ls1, b: fold.ls2 });
  ok(fold.inputShown === 'block', '展开时输入框才显示', fold.inputShown);
  ok(/▴/.test(fold.label1) && /▾/.test(fold.label2), '把手箭头必须跟着状态变', { a: fold.label1, b: fold.label2 });

  /* ---------- 七、零报错 ---------- */
  console.log('七、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  P17 日志消息流：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('体检崩了：', e); process.exit(2); });
