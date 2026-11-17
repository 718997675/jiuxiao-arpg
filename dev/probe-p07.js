#!/usr/bin/env node
/* ============================================================
 * [P07] 悬赏板 · 真机验收
 *
 *   node dev/probe-p07.js
 *
 * 契约（test-p07）判的是「方法在、样式在、closeAll 清了定时器」；
 * 这一份判的是**真的打开面板之后看到什么、点下去发生什么**。
 *
 * 量八件事：
 *   一、打开：面板 .open、四行、三态各就各位
 *   二、每行：色点 + 名称 + 目标 + 奖励（复用 P08）+ 右侧状态
 *   三、倒计时每秒真的在跳
 *   四、点「接下」：该行当场变进行中，行数不变
 *   五、关闭后 interval 必须清掉（这是 P07 验收里唯一会漏的一条）
 *   六、连开两次不许叠两个 interval
 *   七、状态变了（cd 到期）必须自动重排成可接
 *   八、零报错
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

/* 造一份「三条状态各一条」的悬赏账本 */
const SEED = `Game.state.quests = {
  active: [{ id: 'b1_1', progress: [0], at: Date.now() }],
  done: [],
  board: { count: { b1_4: 2 }, cd: { b1_2: Date.now() + 90000 } },
  announced: {}
};`;

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
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 20; Game.recalc();
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;
    Game.invuln = 9999;
  });
  await wait(300);

  /* ---------- 一、打开与三态 ---------- */
  console.log('一、打开：三态各就各位');
  const open = await page.evaluate((seed) => {
    eval(seed);
    UI.openBoard(1);
    const p = document.getElementById('boardPanel');
    const rows = Array.from(p.querySelectorAll('.bd-row'));
    return {
      isOpen: p.classList.contains('open'),
      n: rows.length,
      open: rows.filter(r => r.classList.contains('open')).length,
      active: rows.filter(r => r.classList.contains('active')).length,
      cd: rows.filter(r => r.classList.contains('cd')).length,
      sub: (document.getElementById('boardSub').textContent || '').replace(/\s+/g, ' '),
      timer: UI._boardTimer
    };
  }, SEED);
  ok(open.isOpen, '面板必须真的打开（.open）');
  ok(open.n === 4, '本卷 4 条悬赏必须全列出来（三态全列，不是只列可接）', open.n);
  ok(open.open === 2, '可接必须是 2 条', open.open);
  ok(open.active === 1, '进行中必须是 1 条', open.active);
  ok(open.cd === 1, '冷却中必须是 1 条', open.cd);
  ok(open.timer !== null && open.timer !== undefined, '打开时必须有 interval 句柄', open.timer);
  ok(/可接/.test(open.sub) && /进行中/.test(open.sub), '顶部必须写清可接 / 进行中计数', open.sub);

  /* ---------- 二、每行的内容 ---------- */
  console.log('二、每行：色点 / 名称 / 目标 / 奖励 / 状态');
  const cells = await page.evaluate(() => {
    const p = document.getElementById('boardPanel');
    const rows = Array.from(p.querySelectorAll('.bd-row'));
    const out = rows.map(r => ({
      dot: !!r.querySelector('.bd-dot'),
      name: (r.querySelector('.bd-hd span:nth-child(2)') || {}).textContent || '',
      goal: (r.querySelector('.bd-goal') || {}).textContent || '',
      reward: !!r.querySelector('.rw-line'),
      rewardTxt: (r.querySelector('.rw-line') || {}).textContent || '',
      time: (r.querySelector('.bd-time') || {}).textContent || '',
      take: !!r.querySelector('[data-take]'),
      bar: !!r.querySelector('.bd-bar')
    }));
    return out;
  });
  ok(cells.every(c => c.dot), '每行都必须有类型色点');
  ok(cells.every(c => c.name && c.name.length > 1), '每行都必须有名字', cells.map(c => c.name));
  ok(cells.every(c => c.goal && c.goal.length > 2), '每行都必须写目标', cells.map(c => c.goal));
  ok(cells.every(c => c.reward), '每行都必须有奖励预览（复用 P08 组件）');
  ok(cells.every(c => /经验|金/.test(c.rewardTxt)), '奖励里必须能读到经验 / 金币', cells[0] && cells[0].rewardTxt);
  ok(cells.filter(c => c.take).length === 2, '只有「可接」的两行有接下按钮', cells.filter(c => c.take).length);
  ok(cells.filter(c => c.bar).length === 1, '只有「进行中」的那行有进度条', cells.filter(c => c.bar).length);
  ok(cells.some(c => /冷却/.test(c.time)), '冷却行必须写「冷却 m:ss」', cells.map(c => c.time));

  /* ---------- 三、倒计时每秒跳 ---------- */
  console.log('三、倒计时每秒真的在跳');
  const t1 = await page.evaluate(() => {
    const el = document.querySelector('[data-bd="b1_2"]');
    return el ? el.textContent : '';
  });
  await wait(1400);
  const t2 = await page.evaluate(() => {
    const el = document.querySelector('[data-bd="b1_2"]');
    return el ? el.textContent : '';
  });
  ok(t1 && t2, '（前置）冷却行必须有 data-bd 定位', { t1: t1, t2: t2 });
  ok(t1 !== t2, '倒计时必须每秒变化（不动 = interval 没跑或只渲染一次）', { t1: t1, t2: t2 });

  /* ---------- 四、点「接下」 ---------- */
  console.log('四、点「接下」：当场变进行中');
  const took = await page.evaluate(() => {
    const before = document.querySelectorAll('.bd-row').length;
    const btn = document.querySelector('[data-take]');
    const id = btn && btn.dataset.take;
    if (btn) btn.click();
    const after = document.querySelectorAll('.bd-row').length;
    const activeN = document.querySelectorAll('.bd-row.active').length;
    const inState = (Game.state.quests.active || []).some(a => a.id === id);
    return { id: id, before: before, after: after, activeN: activeN, inState: inState };
  });
  ok(!!took.id, '（前置）必须点到一条可接的');
  ok(took.inState, '点完之后必须真的接进 state.quests.active', took.id);
  ok(took.after === took.before, '行数不许变（接下不是删行）', { before: took.before, after: took.after });
  ok(took.activeN === 2, '进行中必须从 1 变 2', took.activeN);

  /* ---------- 五、关闭后 interval 清掉 ---------- */
  console.log('五、关闭：interval 必须清掉');
  const closed = await page.evaluate(() => {
    const had = UI._boardTimer;
    UI.closeAll();
    return {
      had: had,
      now: UI._boardTimer,
      isOpen: document.getElementById('boardPanel').classList.contains('open')
    };
  });
  ok(closed.had !== null, '（前置）关闭前应该有 interval');
  ok(closed.now === null, '关闭后 _boardTimer 必须是 null（这是 P07 验收里最容易漏的一条）', closed.now);
  ok(!closed.isOpen, '面板必须真的收起来');

  /* ---------- 六、连开两次不叠 ---------- */
  console.log('六、连开两次：不许叠两个 interval');
  const twice = await page.evaluate((seed) => {
    eval(seed);
    UI.openBoard(1);
    const a = UI._boardTimer;
    UI.openBoard(1);
    const b = UI._boardTimer;
    UI.closeAll();
    return { a: a, b: b, after: UI._boardTimer };
  }, SEED);
  ok(twice.a !== twice.b, '第二次打开必须换一个新句柄（旧的必须先清）', { a: twice.a, b: twice.b });
  ok(twice.after === null, '最终必须回到 null', twice.after);

  /* ---------- 七、cd 到期自动变可接 ---------- */
  console.log('七、cd 到期：自动重排成可接');
  const flip = await page.evaluate((seed) => {
    eval(seed);
    /* 把冷却设成 300ms 后到期，等 tick 把它翻成可接 */
    Game.state.quests.board.cd['b1_2'] = Date.now() + 300;
    UI.openBoard(1);
    const before = document.querySelectorAll('.bd-row.cd').length;
    return new Promise(res => {
      setTimeout(() => {
        const after = document.querySelectorAll('.bd-row.cd').length;
        const openN = document.querySelectorAll('.bd-row.open').length;
        UI.closeAll();
        res({ before: before, after: after, openN: openN });
      }, 1500);
    });
  }, SEED);
  ok(flip.before === 1, '（前置）开始时应该有一条冷却中', flip.before);
  ok(flip.after === 0, '冷却到期后必须自动变成非冷却（tick 要能识别状态变化并重排）', flip);
  ok(flip.openN === 3, '可接必须从 2 变 3', flip.openN);

  /* ---------- 八、零报错 ---------- */
  console.log('八、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  P07 悬赏板真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
