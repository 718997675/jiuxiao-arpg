/* ============================================================
 * 面板欠账审计（node 直跑，开浏览器）
 *
 *   node dev/audit-tiers.js
 *
 * 数两个东西：
 *   1. 三个职业的技能面板上还剩多少「待」角标（= 文案写了但战斗没接的档）
 *   2. 说明页里几条「现状」文案（未实现项 / 数量台阶 / 进化台阶 / 元素反应）
 *
 * 为什么单独一个脚本：契约测试是**逐条断言**，跑绿了也不代表「整体还有多少
 * 欠账」看得清。这个脚本给的是**总量**—— 收尾时看一眼，比翻 900 条断言快。
 * 2026-10-30 起三个职业的「待」都是 0（P2b 收尾）。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const exe = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1200);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1500);

  const r = await p.evaluate(() => {
    /* 说明页是分页签渲染的，要逐页翻；面板得先 open 才有页签 DOM */
    document.getElementById('helpPanel').classList.add('open');
    UI.hpTab = 0; UI.renderHelp();
    const nav = document.getElementById('hpNav');
    const el = document.getElementById('helpBody');
    const ids = Array.from(nav.querySelectorAll('.hp-tab')).map(x => parseInt(x.dataset.hp, 10));
    const rows = {};
    for (const i of ids) {
      UI.hpTab = i; UI.renderHelp();
      el.querySelectorAll('.hp-row').forEach(r0 => {
        const k = r0.querySelector('b').textContent.trim();
        if (/未实现项|数量台阶|进化台阶|元素反应/.test(k)) {
          rows[k] = r0.querySelector('span').textContent.replace(/\s+/g, ' ').trim();
        }
      });
    }
    UI.hpTab = 0; UI.renderHelp();

    /* 「待」角标：三个职业都数一遍，顺便记下是哪几档 */
    const todo = {};
    const cls0 = Game.state.cls;
    for (const c of ['warrior', 'mage', 'taoist']) {
      Game.state.cls = c;
      if (typeof UI.renderSkillPanel === 'function') UI.renderSkillPanel();
      const cards = Array.from(document.querySelectorAll('#skList .sk-ac'));
      const left = [];
      cards.forEach((card, ci) => {
        card.querySelectorAll('.sk-as.todo').forEach(x => {
          left.push((ci + 1) + '·Lv' + (x.querySelector('i') || {}).textContent);
        });
      });
      todo[c] = left;
    }
    Game.state.cls = cls0;
    return { rows, todo };
  });

  let total = 0;
  for (const c in r.todo) total += r.todo[c].length;
  console.log('说明页现状文案：');
  for (const k in r.rows) console.log('  · ' + k + ' → ' + r.rows[k].slice(0, 120));
  console.log('\n面板「待」角标：');
  for (const c in r.todo) {
    console.log('  ' + c + '：' + (r.todo[c].length ? r.todo[c].join(' / ') : '0（无欠账）'));
  }
  console.log('\n合计 ' + total + ' 档' + (total === 0 ? ' —— 文案与实装全部对齐' : ' 尚未接进战斗'));
  await b.close();
})();
