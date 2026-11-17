#!/usr/bin/env node
/* ============================================================
 * [P15] Boss 战前剧情 · 真机验收
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-boss-intro.js
 *
 * 静态契约判「接线对不对」；这一份判**游戏里真的演出**：
 *   1  首遇 Boss → 演出层打开、名字/字幕写入、世界定格标志立起
 *   2  演出期间按移动键 → 玩家不动（输入冻结）
 *   3  0.8s/句逐句推进 → 结束后演出层收起、标志清空
 *   4  二次遇到同一只 Boss → 不再播（落盘只播一次）
 *   5  按任意键 → 立即跳过（剩余字幕不播）
 *   6  skipBossIntro 打开 → 首遇也不播
 *   7  replayBossIntros → 清记录后可再播
 *   8  演出中换图 → 不留下永久定格
 *   9  零 console.error / pageerror
 *
 * 做法：注入一个带 intro 的假 Boss 走真实状态机（startBossIntro /
 * tickBossIntro / skipBossIntro），不改生产代码；真激活点接线由静态契约验。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const EXE = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} Game.startNew('warrior', 'P15'); });
  await wait(500);

  /* 页面工具：造一只带 3 句 intro 的假 Boss，走真实 maybeBossIntro */
  await page.evaluate(() => {
    window.__fakeBoss = function (id) {
      return {
        cfg: {
          id: id || 'treeking', name: '巨木妖王', title: '幽篁林之主',
          lines: ['战斗台词一', '战斗台词二'],
          intro: [
            { who: '旁白', text: '林子里没有鸟叫。' },
            { who: '巨木妖王', text: '活人？这片林子只埋死人。' },
            { who: '你', text: '整片林子都是它的身体。' }
          ]
        },
        pos: { x: 0, z: -14 }, hp: 1800, maxHp: 1800
      };
    };
    window.__introState = function () {
      const st = Game.bossIntro;
      const el = document.getElementById('bossIntro');
      return {
        active: !!(st && !st.done), idx: st ? st.idx : -1,
        introCam: +(Game.introCam || 0).toFixed(3),
        domOpen: !!(el && el.classList.contains('open')),
        name: (document.getElementById('biName') || {}).textContent || '',
        text: (document.getElementById('biText') || {}).textContent || '',
        who: (document.getElementById('biWho') || {}).textContent || '',
        seen: !!(Game.state.bossIntro && Game.state.bossIntro.treeking),
        px: +Game.playerGroup.position.x.toFixed(3),
        pz: +Game.playerGroup.position.z.toFixed(3)
      };
    };
  });

  console.log('\n【1】首遇 → 演出打开 + 世界定格');
  const s1 = await page.evaluate(() => {
    Game.playerGroup.position.set(0, 0, 6);
    Game.state.bossIntro = {};
    Game.maybeBossIntro(window.__fakeBoss());
    return window.__introState();
  });
  ok(s1.active && s1.domOpen, '演出激活且演出层打开', s1);
  ok(s1.name === '巨木妖王' && s1.text.indexOf('林子') >= 0 && s1.who === '旁白',
    '首句旁白字幕写入', { name: s1.name, who: s1.who, text: s1.text });
  ok(s1.seen === true, '开演即落盘 bossIntro[treeking]=1');

  console.log('\n【2】演出期间世界定格 → 玩家不动');
  /* 注意：不能在这里派发移动键 —— 本作「任意键 = 跳过」，按 W 会直接跳掉演出。
   * 输入冻结的正确验法：演出激活后 keys 被清空，且不按键时玩家坐标随时间不变。
   * 「按键会跳过」由【5】单独验。 */
  const s2a = await page.evaluate(() => window.__introState());
  await wait(250);
  const s2b = await page.evaluate(() => window.__introState());
  ok(s2a.active && s2b.active, '演出持续期间未被误跳过', { a: s2a.active, b: s2b.active });
  ok(s2b.px === 0 && s2b.pz === 6, '没有按键时玩家坐标不变（世界定格）', s2b);
  ok(s2b.introCam > 0, '推镜计时在推进', s2b.introCam);

  console.log('\n【3】逐句推进 → 自然结束');
  /* 软件渲染帧率不稳，不按固定毫秒断言；轮询到状态出现为止（上限给足）。
   * 这是 AGENTS.md §7.3 的规矩：定时器到点才发生的效果，等出现而不是死等。 */
  async function until(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = await page.evaluate(() => window.__introState()); if (fn(v)) return v; await wait(80); }
    return await page.evaluate(() => window.__introState());
  }
  const s3 = await until(v => v.idx >= 1, 4000);
  ok(s3.idx >= 1 && s3.who === '巨木妖王', '逐句推进到第 2 句（Boss 自白）',
    { idx: s3.idx, who: s3.who, text: s3.text });
  ok(s3.introCam > 0.5, '镜头推近已生效（introCam>0.5）', s3.introCam);
  const s3end = await until(v => !v.active, 8000);
  ok(!s3end.active && !s3end.domOpen, '字幕播完后演出层收起、状态清空', s3end);

  console.log('\n【4】二次遇到同一只 → 不再播');
  const s4 = await page.evaluate(() => {
    Game.maybeBossIntro(window.__fakeBoss());
    return window.__introState();
  });
  ok(!s4.active && !s4.domOpen, '看过的 Boss 不再触发演出（只播一次）', s4);

  console.log('\n【5】任意键立即跳过');
  const s5a = await page.evaluate(() => {
    Game.state.bossIntro = {};
    Game.maybeBossIntro(window.__fakeBoss());
    return window.__introState();
  });
  ok(s5a.active, '先开一场新演出', s5a);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  const s5b = await page.evaluate(() => window.__introState());
  ok(!s5b.active && !s5b.domOpen, '按 X 立即跳过（演出层收起）', s5b);

  console.log('\n【6】skipBossIntro 打开 → 首遇也不播');
  const s6 = await page.evaluate(() => {
    Game.state.bossIntro = {};
    Settings.set('skipBossIntro', true);
    const started = Game.maybeBossIntro(window.__fakeBoss());
    const st = window.__introState();
    Settings.set('skipBossIntro', false);
    return { started, st };
  });
  ok(s6.started === false && !s6.st.active, '设了跳过后首遇直接开打', s6);

  console.log('\n【7】replayBossIntros → 清记录后可再播');
  const s7 = await page.evaluate(() => {
    Game.state.bossIntro = { treeking: 1, golemking: 1 };
    const n = Game.replayBossIntros();
    const cleared = Object.keys(Game.state.bossIntro).length;
    const started = Game.maybeBossIntro(window.__fakeBoss());
    const st = window.__introState();
    if (Game.bossIntro) Game.skipBossIntro();
    return { n, cleared, started, active: st.active };
  });
  ok(s7.n === 2 && s7.cleared === 0, '重播清掉全部已播记录', s7);
  ok(s7.started === true && s7.active === true, '清记录后同一只 Boss 可再播', s7);

  console.log('\n【8】演出中换图 → 不留永久定格');
  const s8 = await page.evaluate(() => {
    Game.state.bossIntro = {};
    Game.maybeBossIntro(window.__fakeBoss());
    const before = window.__introState().active;
    Game.loadMap('village');
    return { before, after: window.__introState() };
  });
  await wait(200);
  const s8b = await page.evaluate(() => window.__introState());
  ok(s8.before === true && !s8b.active && !s8b.domOpen, '换图清掉演出状态（世界不会永久定格）', s8b);

  console.log('\n【9】错误');
  ok(errs.length === 0, '全程零 console.error / pageerror', errs.slice(0, 5));

  await browser.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
