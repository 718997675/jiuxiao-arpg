#!/usr/bin/env node
/* ============================================================
 * 技能 P1d 真机探针：面板视觉重排成「三列纵向」
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p1d.js
 *
 * P1c 只把语义换成了三线并行，坐标还是「3 组 × 2 子列（主动 | 被动）」。
 * 这一版要证的是「视觉也换了」：
 *   1. 一条线一列（3 列），列内按 reqLv 升序 —— 不是按岔口下标
 *   2. 列内零重叠、列间零重叠（真机量 offsetHeight / offsetWidth，不看公式）
 *   3. 被动小一圈、挂在主动右边，连线只剩同线竖引导线 + 主动到自身被动的短线
 *   4. 手机上三条线有分页签，一页一条纵向列（原来压根没有页签，只能看到第一条线）
 *   5. P1c 的语义一个没丢（软前置标记仍与软锁节点一一对应）
 *   6. 全程零控制台报错
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const wait = ms => new Promise(r => setTimeout(r, ms));
/* 浏览器路径走跨平台探测（AGENTS.md §3）：写死 macOS / Chrome 路径的话，
   Windows 上（常常只装了 Edge）这个探针连启动都起不来 */
const exe = require('./_chrome');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d)); } };

/* 节点几何：排除掉浮层/标记这些非节点元素 */
const grab = () => {
  const nds = Array.from(document.querySelectorAll('#skList .skt-nd'));
  return nds.map(e => ({
    nm: (e.querySelector('.nm') || {}).textContent || '',
    x: parseFloat(e.style.left) || 0,
    y: parseFloat(e.style.top) || 0,
    w: e.offsetWidth,
    h: e.offsetHeight,
    act: e.classList.contains('act'),
    key: e.classList.contains('key'),
    pas: e.classList.contains('pas')
  }));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* 升到 40 级：全部节点都能点亮，量几何才不会被灰度/锁定影响 */
  await p.evaluate(() => { Game.state.level = 40; if (Game.recalc) Game.recalc(); });

  /* ---------------- 1. 三列、列内按 reqLv 升序 ---------------- */
  console.log('一、三列纵向：列数 + 顺序');
  const geo = await p.evaluate(() => {
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const cls = Game.state.cls;
    const g = UI.skTreeLayout(cls);
    return {
      cls: cls,
      cols: g.cols.map(c => ({
        name: c.name,
        baseX: c.baseX,
        reqs: c.nodes.map(n => n.reqLv),
        acts: c.nodes.filter(n => n.act).length,
        rows: c.nodes.reduce((a, n) => Math.max(a, n.ri), -1) + 1,
        n: c.nodes.length
      })),
      W: g.W, H: g.H, rows: g.rows,
      lines: skillLines(cls).map(l => l.nodes.length)
    };
  });
  ok(geo.cols.length === 3, '面板是三列（一条线一列），实际 ' + geo.cols.length, geo.cols.length);
  ok(geo.cols.length === geo.lines.length, '列数 == 职业的线数（' + geo.lines.length + '）', geo.lines);
  ok(geo.cols.every(c => c.reqs.length === c.n), '每列的 reqLv 与节点一一对应');
  const mono = geo.cols.filter(c => c.reqs.some((v, i) => i && v < c.reqs[i - 1]));
  ok(mono.length === 0, '每列 reqLv 单调不减（从上往下升）', mono.map(c => ({ name: c.name, reqs: c.reqs })));
  ok(geo.cols.every((c, i) => !i || c.baseX > geo.cols[i - 1].baseX), '列号从左往右递增', geo.cols.map(c => c.baseX));

  /* 三个职业都要成立，不能只测刀客 */
  const allCls = await p.evaluate(() => {
    const keep = Game.state.cls;
    const out = [];
    Object.keys(SKILL_TREE.layout).forEach(c => {
      Game.state.cls = c;
      UI.skTreeTab = null;
      UI.renderSkillPanel();
      const g = UI.skTreeLayout(c);
      const nds = Array.from(document.querySelectorAll('#skList .skt-nd')).map(e => ({
        x: parseFloat(e.style.left), y: parseFloat(e.style.top), h: e.offsetHeight
      }));
      const byX = {};
      nds.forEach(n => { (byX[n.x] = byX[n.x] || []).push(n); });
      let bad = 0;
      Object.keys(byX).forEach(k => {
        const arr = byX[k].sort((a, b) => a.y - b.y);
        for (let i = 1; i < arr.length; i++) if (arr[i].y < arr[i - 1].y + arr[i - 1].h) bad++;
      });
      out.push({
        cls: c, cols: g.cols.length, nodes: nds.length,
        want: skillLines(c).reduce((a, l) => a + l.nodes.length, 0), overlap: bad
      });
    });
    Game.state.cls = keep;
    UI.skTreeTab = null;
    UI.renderSkillPanel();
    return out;
  });
  ok(allCls.length >= 3, '遍历到 ' + allCls.length + ' 个职业', allCls.map(c => c.cls));
  ok(allCls.every(c => c.cols === 3), '三个职业都是三列', allCls);
  ok(allCls.every(c => c.nodes === c.want), '节点数 == 该职业线内节点总数（没有漏画）', allCls);
  ok(allCls.every(c => c.overlap === 0), '三个职业的子列内都零重叠', allCls);

  /* ---------------- 2. 真机几何：零重叠 ---------------- */
  console.log('二、真机几何：列内 / 列间零重叠');
  const dom = await p.evaluate(grab);
  ok(dom.length > 0, '画布上有 ' + dom.length + ' 个节点', dom.length);
  const byCol = {};
  dom.forEach(n => { (byCol[n.x] = byCol[n.x] || []).push(n); });
  /* 列簇：主动左边 + 列距 196 归到同一个号（列号与被动的相对偏移都由 SKG 决定） */
  const COLS = 3, COL_GAP = 196, PAD_X = 8;
  const clusterOf = x => Math.round((x - PAD_X) / COL_GAP);
  /* 每个 x 是一条「子列」（主动一条、被动一条），重叠只在同一子列内才叫重叠 */
  const badV = [];
  Object.keys(byCol).forEach(k => {
    const arr = byCol[k].slice().sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].y < arr[i - 1].y + arr[i - 1].h) {
        badV.push({ x: +k, a: arr[i - 1].nm, b: arr[i].nm, need: arr[i - 1].y + arr[i - 1].h, got: arr[i].y });
      }
    }
  });
  ok(badV.length === 0, '同一子列内节点上下零重叠（含名称与分支记号）', badV.slice(0, 2));

  const badH = [];
  const clusters = {};
  dom.forEach(n => { (clusters[clusterOf(n.x)] = clusters[clusterOf(n.x)] || []).push(n); });
  const keys = Object.keys(clusters).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < keys.length; i++) {
    const prev = clusters[keys[i - 1]], cur = clusters[keys[i]];
    const prevRight = Math.max.apply(null, prev.map(n => n.x + n.w));
    const curLeft = Math.min.apply(null, cur.map(n => n.x));
    if (curLeft < prevRight) badH.push({ col: keys[i], prevRight: prevRight, curLeft: curLeft });
  }
  ok(badH.length === 0, '相邻两列横向零重叠', badH);
  ok(keys.length === 3, '画布上正好 3 个列簇，实际 ' + keys.length, keys);

  /* ---------------- 3. 主动 / 被动的体型与连线 ---------------- */
  console.log('三、主动与被动的视觉层级');
  const acts = dom.filter(n => n.act), subs = dom.filter(n => !n.act);
  ok(acts.length > 0 && subs.length > 0, '主动 ' + acts.length + ' 个 / 被动 ' + subs.length + ' 个');
  ok(acts.every(n => n.w === 46) && subs.every(n => n.w === 38),
    '主动 46px、被动 38px（被动小一圈，不是并列选项）',
    { actW: acts.map(n => n.w).filter((v, i, a) => a.indexOf(v) === i), pasW: subs.map(n => n.w).filter((v, i, a) => a.indexOf(v) === i) });
  /* 同一行、同一列簇里：主动在左、被动在右 */
  const pairs = [];
  acts.forEach(a => {
    const s = subs.filter(n => n.y === a.y && clusterOf(n.x) === clusterOf(a.x));
    s.forEach(n => pairs.push({ actX: a.x, pasX: n.x }));
  });
  ok(pairs.length === subs.length, '每个被动都能配上自己那一行的主动（' + pairs.length + '/' + subs.length + '）', pairs.length);
  ok(pairs.every(pr => pr.pasX > pr.actX), '同一行的被动都挂在主动右边（' + pairs.length + ' 对）', pairs.slice(0, 3));

  const wire = await p.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('#skList .skt-wire path'));
    const st = Array.from(document.querySelectorAll('#skList .skt-wire path')).map(e => ({
      w: e.getAttribute('stroke-width'),
      dash: e.getAttribute('stroke-dasharray'),
      d: e.getAttribute('d')
    }));
    return {
      n: paths.length,
      rails: st.filter(s => /V/.test(s.d) && !/H/.test(s.d)).length,
      ties: st.filter(s => /H/.test(s.d)).length,
      dashed: st.filter(s => s.dash).length,
      heads: st.filter(s => /A|C|Q/.test(s.d)).length
    };
  });
  ok(wire.rails === 3, '每条线一根竖向引导线（共 3 根），实际 ' + wire.rails, wire.rails);
  ok(wire.ties === subs.length, '主动 → 自身被动的短线数 == 被动数（' + wire.ties + '/' + subs.length + '）', wire);
  ok(wire.dashed === 0, '没有虚线（虚线原来表示「二选一」，已删）', wire.dashed);
  ok(wire.n === wire.rails + wire.ties, '连线只有「竖引导 + 被动短线」两种', wire);

  /* ---------------- 4. 缩放与列标题 ---------------- */
  console.log('四、缩放与列标题');
  const view = await p.evaluate(() => {
    const st = document.querySelector('#skList .skt-stage');
    const pl = document.querySelector('#skList .skt-plate');
    const caps = Array.from(document.querySelectorAll('#skList .skt-cap')).map(e => ({
      t: e.textContent, x: parseFloat(e.style.left), w: e.offsetWidth
    }));
    return {
      stage: { w: st.clientWidth, h: st.clientHeight },
      plate: { w: +pl.dataset.w, h: +pl.dataset.h },
      zoom: UI.skZoom,
      caps: caps
    };
  });
  ok(view.caps.length === 3, '三列各有一个列标题，实际 ' + view.caps.length, view.caps.map(c => c.t));
  ok(view.caps.every(c => c.t.length > 0), '列标题按线名生成（不写死）', view.caps.map(c => c.t));
  const capOk = view.caps.every((c, i) => {
    /* 标题是 left:<中心>px + translateX(-50%)，所以 style.left 本身就是中心 */
    const center = PAD_X + i * COL_GAP + (46 / 2 + 74 + 38 / 2) / 2;
    return Math.abs(c.x - center) <= 3;
  });
  ok(capOk, '列标题居中压在自己那一列上（偏差 ≤3px）', view.caps);
  ok(view.zoom >= 1 && view.plate.w * view.zoom <= view.stage.w + 1,
    '缩放顶格且画布不超出可视宽度（zoom ' + view.zoom + '，' + Math.round(view.plate.w * view.zoom) + '≤' + view.stage.w + '）',
    { zoom: view.zoom, w: view.plate.w, stage: view.stage.w });

  /* ---------------- 5. P1c 的语义一条没丢 ---------------- */
  console.log('五、P1c 语义回归');
  const sem = await p.evaluate(() => {
    const root = document.getElementById('skList');
    return {
      pts: root.querySelectorAll('.skt-nd.pts').length,
      soft: root.querySelectorAll('.skt-or.soft').length,
      fklock: root.querySelectorAll('.fklock').length,
      lockMark: root.querySelectorAll('.skt-or.lock').length
    };
  });
  ok(sem.soft === sem.pts, '软前置标记 == 被软锁节点（' + sem.soft + '/' + sem.pts + '）', sem);
  ok(sem.fklock === 0 && sem.lockMark === 0, '仍然没有「锁 / 互斥」标记', sem);

  /* ---------------- 6. 手机：三条线分页签、一页一列 ---------------- */
  console.log('六、手机：分页签 + 单列');
  /* 切到手机视口 —— 会整页重载，得重新开局 */
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await wait(900);
  await p.evaluate(() => { if (!Game.state) document.getElementById('startBtn').click(); });
  await wait(1600);
  await p.evaluate(() => { Game.state.level = 40; if (Game.recalc) Game.recalc(); });
  const m1 = await p.evaluate(() => {
    document.getElementById('skillPanel').classList.add('open');
    UI.skTreeTab = null;
    UI.renderSkillPanel();
    const tabs = Array.from(document.querySelectorAll('#skList [data-skttree]')).map(b => ({
      t: b.textContent, on: b.classList.contains('on')
    }));
    const nds = Array.from(document.querySelectorAll('#skList .mt-nd')).map(e => ({
      x: parseFloat(e.style.left), y: parseFloat(e.style.top), h: e.offsetHeight
    }));
    return {
      tabs: tabs,
      n: nds.length,
      colCount: Array.from(new Set(nds.map(e => e.x))).length,
      ys: nds.map(e => e.y),
      overlap: nds.slice().sort((a, b) => a.y - b.y).filter((e, i, arr) => i && e.y < arr[i - 1].y + arr[i - 1].h).length,
      canvas: (() => { const c = document.querySelector('#skList .mt-canvas'); return c ? c.offsetWidth : 0; })()
    };
  });
  ok(m1.tabs.length === 3, '手机上有 3 个线的分页签（原来一个都没有）', m1.tabs);
  ok(m1.tabs.filter(t => t.on).length === 1, '当前只有一个页签是选中态', m1.tabs);
  ok(m1.colCount === 1, '一页只有一列（纵向排），实际 ' + m1.colCount + ' 列', m1.colCount);
  ok(m1.overlap === 0, '手机列内零重叠', m1.overlap);
  ok(m1.ys.every((v, i) => !i || v > m1.ys[i - 1]), '手机节点自上而下递增', m1.ys);

  /* 切到第二条线：节点数必须换成本线的数量，且 y 仍然递增 */
  const m2 = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#skList [data-skttree]'));
    const target = btns[1];
    const name = target.textContent;
    target.click();
    const nds = Array.from(document.querySelectorAll('#skList .mt-nd')).map(e => parseFloat(e.style.top));
    const geo = UI.skTreeLayout(Game.state.cls, UI.skTreeTab);
    return {
      name: name, tab: UI.skTreeTab,
      n: nds.length,
      want: geo.cols[0] ? geo.cols[0].nodes.length : -1,
      sorted: nds.every((v, i) => !i || v > nds[i - 1])
    };
  });
  ok(m2.tab === m2.name, '点第二个页签切到「' + m2.name + '」', m2);
  ok(m2.n === m2.want, '切换后节点数 == 该线节点数（' + m2.n + '/' + m2.want + '）', m2);
  ok(m2.sorted, '切换后仍自上而下递增', m2);

  /* ---------------- 7. 报错 ---------------- */
  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(realErrs.length === 0, '无控制台报错', realErrs.slice(0, 3));

  await b.close();
  console.log('');
  if (fail) { console.log(`✗ P1d 探针：${pass} 通过 / ${fail} 失败`); process.exit(1); }
  console.log(`✓ P1d 探针：${pass} 通过 / 0 失败`);
})();
