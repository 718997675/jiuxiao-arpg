/* ============================================================
 * 换栏键 + 键位说明迁移 · 浏览器验证
 *
 *   node dev/test-hotkeys.js
 *
 * 覆盖：
 *   A. Shift 默认换栏；面板开着时不换（避让 Shift+左键出售 / 洗点）
 *   B. 反引号 / V 作为备用键仍可换栏
 *   C. HUD 左下角的键位块已移除（说明页接管）
 *   D. 说明页第一节列出全部键位（Shift / 1-8 / I / H ...）
 *   E. 手机端有「甲 / 乙」换栏按钮且能切
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (x !== undefined ? '  →  ' + x : '')); } };

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('file://' + path.resolve(ROOT, 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);

  console.log('\nA. Shift 换栏');
  const A = await p.evaluate(async () => {
    const R = {};
    R.key = SKILL_BAR_SET_KEY;
    R.label = SKILL_BAR_SET_LABEL;
    R.start = Game.barSet();
    const fire = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === 'Shift' ? 'ShiftLeft' : '', bubbles: true }));
    fire('Shift');
    R.afterShift = Game.barSet();
    fire('Shift');
    R.backShift = Game.barSet();
    /* 面板开着：Shift 不换栏 */
    UI.openMenu('bag');
    await new Promise(r => setTimeout(r, 120));
    const before = Game.barSet();
    fire('Shift');
    R.panelOpen = UI.menuIsOpen();
    R.panelShift = Game.barSet();
    R.panelStayed = Game.barSet() === before;
    UI.closeMenu();
    return R;
  });
  ok(A.key === 'shift' && A.label === 'Shift', '默认键常量是 Shift', A.key + '/' + A.label);
  ok(A.afterShift !== A.start, 'Shift 切到了另一套', `${A.start} → ${A.afterShift}`);
  ok(A.backShift === A.start, '再按 Shift 切回', A.backShift);
  ok(A.panelOpen === true, '菜单能打开（前置条件）');
  ok(A.panelStayed === true, '面板开着时 Shift 不换栏', A.panelShift);

  console.log('\nB. 备用键');
  const B = await p.evaluate(async () => {
    const R = {};
    const fire = (k, code) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code || '', bubbles: true }));
    const s0 = Game.barSet();
    fire('`', 'Backquote');
    R.bt = Game.barSet() !== s0;
    const s1 = Game.barSet();
    fire('v');
    R.v = Game.barSet() !== s1;
    /* 输入法把 e.key 变成 Process 时，靠 e.code 兜底 */
    const s2 = Game.barSet();
    fire('Process', 'Backquote');
    R.code = Game.barSet() !== s2;
    return R;
  });
  ok(B.bt === true, '反引号仍可换栏');
  ok(B.v === true, 'V 仍可换栏');
  ok(B.code === true, 'e.key 异常时靠 e.code 兜底');

  console.log('\nC. HUD 键位块已移除');
  const C = await p.evaluate(() => ({
    el: !!document.getElementById('help'),
    /* 说明页要有内容 */
    tab: !!document.querySelector('.mtab[data-mtab="help"]')
  }));
  ok(C.el === false, 'HUD 不再有 #help 键位块');
  ok(C.tab === true, '菜单里有「说 明」页签');

  console.log('\nD. 说明页键位');
  const D = await p.evaluate(async () => {
    UI.openMenu('help');
    await new Promise(r => setTimeout(r, 200));
    const tabs = [...document.querySelectorAll('#hpNav .hp-tab')];
    tabs[0].click();
    await new Promise(r => setTimeout(r, 120));
    const body = document.getElementById('helpBody');
    const keys = [...body.querySelectorAll('.hp-tag.kc .hp-key')].map(e => e.textContent.trim());
    const txt = body.textContent;
    return {
      keys,
      hasShift: keys.some(k => /Shift/i.test(k)),
      hasSlotKey: keys.some(k => /1-8/.test(k)),
      hasPanels: ['I', 'C', 'T', 'K', 'L', 'B', 'R', 'P', 'O', 'H'].every(x => keys.includes(x)),
      mentionBarSets: /快捷栏/.test(txt) && /Shift/.test(txt),
      barIcons: body.querySelectorAll('.hp-tag svg').length,
      overflow: Math.round(body.scrollWidth - body.clientWidth)
    };
  });
  ok(D.hasShift, '键位牌里有 Shift', JSON.stringify(D.keys));
  ok(D.hasSlotKey, '键位牌里有 1-8 技能条');
  ok(D.hasPanels, '十个面板键都在', JSON.stringify(D.keys));
  ok(D.mentionBarSets, '写清了换栏方式与 Shift');
  ok(D.barIcons >= 2, '说明页里换栏也用图标表示', D.barIcons);
  ok(D.overflow <= 1, '说明页没有横向溢出', D.overflow);

  console.log('\nE. 手机换栏按钮');
  const p2 = await b.newPage();
  await p2.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p2.goto('file://' + path.resolve(ROOT, 'index.html') + '?cls=warrior&mobile=1', { waitUntil: 'load' });
  await wait(2400);
  const E = await p2.evaluate(async () => {
    const btn = document.getElementById('mBarSet');
    const R = { exists: !!btn };
    if (!btn) return R;
    const icon = () => (btn.querySelector('svg path') || {}).getAttribute
      ? btn.querySelector('svg path').getAttribute('d') : '';
    const idx = () => (btn.querySelector('.idx') || {}).textContent || '';
    R.iconN = btn.querySelectorAll('svg').length;
    R.d1 = icon(); R.idx1 = idx(); R.title1 = btn.title;
    const s0 = Game.barSet();
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    R.after = Game.barSet();
    R.changed = Game.barSet() !== s0;
    R.d2 = icon(); R.idx2 = idx(); R.title2 = btn.title;
    R.rect = (() => { const r = btn.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)]; })();
    return R;
  });
  ok(E.exists, '手机 HUD 有换栏按钮');
  ok(/^1\/2$/.test(E.idx1 || '') && /^2\/2$/.test(E.idx2 || ''), '角标显示当前是第几套', `${E.idx1} → ${E.idx2}`);
  ok(E.changed === true, '点一下能换栏', `${E.idx1} → ${E.after}`);
  ok(!!E.d1 && !!E.d2 && E.d1 !== E.d2, '两套各有一个图标（剑 / 盾）', `svg=${E.iconN}`);
  ok(/第 1 套/.test(E.title1 || '') && /第 2 套/.test(E.title2 || ''), 'title 说明当前套数与栏目',
    `${E.title1} → ${E.title2}`);
  ok(E.rect && E.rect[0] > 20, '按钮有实际尺寸（没被挤成 0）', JSON.stringify(E.rect));

  if (errs.length) { console.log('\n运行期报错：'); errs.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
  ok(errs.length === 0, '无运行期报错', errs.length + ' 条');

  console.log(`\n结果：通过 ${pass} · 失败 ${fail}`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
