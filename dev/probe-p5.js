#!/usr/bin/env node
/* ============================================================
 * [equip-doll P5] 试衣间 + 同源图标 · 真机验收
 *
 *   node dev/probe-p5.js
 *
 * 只验「离线验不了」的：canvas 真的画出了人、换装后图真的变了、
 * 试穿不改真装备、**没有开出第二个 WebGL context**、说明页真的渲染出 33 条。
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

  /* 在页面脚本之前挂钩：数一数总共请求了几次 webgl context。
   * 注意 baseline 要在游戏自己建完 renderer 之后再记 —— three 可能因为
   * webgl2 回退多调一次，那是主 context 的事，不是试衣间的锅。 */
  await page.evaluateOnNewDocument(() => {
    window.__glCalls = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (/webgl/i.test(String(type))) window.__glCalls++;
      return orig.apply(this, arguments);
    };
  });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => {
    Game.startNew('warrior', 'P5');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {};
    Game.updateCamera = function () {};
    Game.faceHpBars = function () {};
    window.__wear = (slot, item) => {
      Game.state.equipment[slot] = item;
      Game.applyDoll();
      UI.renderInventory();
    };
    window.__mk = (slot, rarity, fam) => {
      const it = rollItem(50, { slot: slot, cls: Game.state.cls, rarity: rarity || 'rare' });
      if (it && fam !== undefined) it.baseVar = fam;
      return it;
    };
  });
  await wait(900);

  /* ---------- 一、打开面板，预览真的画出来了 ---------- */
  console.log('一、试衣间出图');
  await page.evaluate(() => UI.openMenu('bag'));
  await wait(300);
  const first = await page.evaluate(() => ({
    st: DollPreview.stats(),
    gl: window.__glCalls,
    rtOpen: !!Game.renderer.getRenderTarget(),
    scissor: Game.renderer.getScissorTest(),
    canvasW: document.getElementById('dpCanvas').width,
    canvasH: document.getElementById('dpCanvas').height,
    shown: document.getElementById('dpBody').style.display !== 'none'
  }));
  ok(first.shown, '桌面默认展开试衣间', first);
  ok(first.st.renders >= 1, '至少渲过一帧', first.st);
  ok(first.st.checksum > 0, 'RT 读回的像素校验和非 0（不是空图）', first.st);
  ok(first.st.hasRT && first.canvasW === 288 && first.canvasH === 360,
    '离屏 RT 与展示 canvas 尺寸对上', first);
  ok(!first.rtOpen && !first.scissor, '渲完必须还原 renderer 状态（target / scissor）', first);

  /* 直接读 2D canvas 的像素，确认不是纯色板 */
  const variance = await page.evaluate(() => {
    const c = document.getElementById('dpCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 131) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
  ok(variance > 8, '预览里必须真的有角色的明暗层次（不是一块纯色）', variance);

  /* ---------- 二、换装 → 预览实时变 ---------- */
  console.log('二、换装后预览实时变');
  const changed = await page.evaluate(() => {
    const before = DollPreview.stats().checksum;
    window.__wear('helm', window.__mk('helm', 'legendary', 2));
    return { before, after: DollPreview.stats().checksum, renders: DollPreview.stats().renders };
  });
  ok(changed.after !== changed.before, '换装备后预览像素必须变', changed);
  ok(changed.renders >= 2, '换装备必须触发一次新的离屏渲染', changed);

  /* 同一件再 render 一次不许重画（签名去重） */
  const dedup = await page.evaluate(() => {
    const r0 = DollPreview.stats().renders;
    UI.renderInventory(); UI.renderInventory();
    return DollPreview.stats().renders - r0;
  });
  ok(dedup === 0, '装备没变时不能重复 readPixels', dedup);

  /* ---------- 三、悬停试穿不改真装备 ---------- */
  console.log('三、试穿与真装备隔离');
  const peek = await page.evaluate(() => {
    const worn = JSON.stringify(Game.state.equipment, (k, v) => (k === 'uid' ? undefined : v));
    const before = DollPreview.stats().checksum;
    const it = window.__mk('chest', 'unique', null, 2);
    Game.state.inventory.push(it);
    DollPreview.peek(it);
    const during = DollPreview.stats().checksum;
    const wornDuring = JSON.stringify(Game.state.equipment, (k, v) => (k === 'uid' ? undefined : v));
    DollPreview.restore();
    const after = DollPreview.stats().checksum;
    return { before, during, after, same: worn === wornDuring };
  });
  ok(peek.during !== peek.before, '试穿时预览必须变', peek);
  ok(peek.same, '试穿绝不能写进 Game.state.equipment', peek);
  ok(peek.after === peek.before, '移开鼠标后预览必须回到真装备', peek);

  /* ---------- 四、没有第二个 WebGL context ---------- */
  console.log('四、全程只用一个 GL context');
  const glAfter = await page.evaluate(() => window.__glCalls);
  ok(glAfter === first.gl, '开试衣间不许再建 WebGL context', { before: first.gl, after: glAfter });

  /* ---------- 五、说明页真的渲染出 33 条 ---------- */
  console.log('五、说明页 · 装备模组 33 条');
  const help = await page.evaluate(() => {
    UI.openMenu('help');
    const nav = [...document.querySelectorAll('#hpNav .hp-tab')];
    const bt = nav.find(b => b.textContent.indexOf('装备模组') >= 0);
    if (bt) bt.click();
    /* renderHelp 会整块重建 nav —— 上面那个 bt 已经是脱离 DOM 的旧节点，
     * 得重新查一次才能看到 .on（第一版在这里假红）。 */
    const onTab = document.querySelector('#hpNav .hp-tab.on');
    const body = document.getElementById('helpBody');
    const rows = [...body.querySelectorAll('.hp-row')];
    const hits = rows.filter(r => {
      const b = r.querySelector('b');
      if (!b) return false;
      return /^[^\s].* · [ABC] /.test(b.textContent);
    });
    return {
      section: !!(onTab && onTab.textContent.indexOf('装备模组') >= 0),
      title: body.querySelector('h4') ? body.querySelector('h4').textContent : '',
      rows: rows.length, hits: hits.length,
      sample: hits.slice(0, 2).map(r => r.querySelector('b').textContent),
      hasQuality: body.textContent.indexOf('凡品 0') >= 0
    };
  });
  ok(help.section, '说明页必须有装备模组页签', help);
  ok(help.hits === 33, '说明页族条目必须正好 33 条', help);
  ok(help.hasQuality, '品质光条数必须从数据表读出来（凡品 0）', help);

  /* ---------- 六、图标与 3D 同族（真机渲染出来的 SVG） ---------- */
  console.log('六、图标同源');
  const icons = await page.evaluate(() => {
    const mk = fam => {
      const it = rollItem(50, { slot: 'helm', cls: 'warrior', rarity: 'rare' });
      it.baseVar = fam;
      return it;
    };
    const a = mk(0), b = mk(1), c = mk(2);
    const h = it => itemIcon(it);
    return {
      ka: itemIconKey(a), kb: itemIconKey(b), kc: itemIconKey(c),
      distinct: new Set([h(a), h(b), h(c)]).size,
      bMark: h(b).indexOf('M2.6 2.6H29.4V29.4H2.6Z') >= 0,
      cMark: h(c).indexOf('8.6 8.2') >= 0,
      total: Object.keys(DOLL_ICONS).length
    };
  });
  ok(icons.ka === 'helm-A' && icons.kb === 'helm-B' && icons.kc === 'helm-C',
    '同槽三族图标键必须不同', icons);
  ok(icons.distinct === 3, '同槽三族的 SVG 必须真的不一样', icons);
  ok(icons.bMark && icons.cMark, 'B/C 族的加厚框与飞翼必须真的画进去', icons);
  ok(icons.total === 33, '图标表必须 33 张', icons.total);

  /* ---------- 七、移动端不溢出 ---------- */
  console.log('七、移动端尺寸');
  await page.setViewport({ width: 390, height: 844 });
  await wait(400);
  const mob = await page.evaluate(() => {
    UI.openMenu('bag');
    const cv = document.getElementById('dpCanvas');
    const panel = document.getElementById('invPanel').getBoundingClientRect();
    return {
      shown: document.getElementById('dpBody').style.display !== 'none',
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      canvasRight: cv.getBoundingClientRect().right, panelRight: panel.right,
      renders: DollPreview.stats().renders
    };
  });
  ok(mob.scrollW <= mob.innerW + 2, '390 宽不许横向溢出', mob);
  ok(mob.canvasRight <= mob.panelRight + 2, '预览 canvas 不许顶出面板', mob);

  /* ---------- 八、零报错 ---------- */
  console.log('八、零报错');
  ok(errs.length === 0, '页面不许有报错', errs.slice(0, 5));

  await browser.close();
  console.log('\n================================');
  console.log('  equip-doll P5 真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
