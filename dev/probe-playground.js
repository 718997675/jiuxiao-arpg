#!/usr/bin/env node
/* ============================================================
 * 特效台契约 + 可见度 + 残留 · 真机（docs/boss-vfx-playground.html）
 *
 *   NODE_PATH=<node_modules> node dev/probe-playground.js
 *   NODE_PATH=<node_modules> node dev/probe-playground.js dgb_fall bafo_asura
 *   NODE_PATH=<node_modules> node dev/probe-playground.js --shots dgb_fall
 *
 * 特效台是**唯一验证场**（游戏侧还没接，见 BOSS-KITS.md §4），所以这里的三件事
 * 没人替它做：
 *
 *   一、契约   51 只 × 全技能都放得出来；45 只守卫的第 5 格就是自己的 `NR`；
 *             45 条 `rule` / 45 个技能名互不相同；没有两只技能组完全一样。
 *   二、可见   每只本命技**真的画出来了**（比差异像素）。这一条是这轮的核心 ——
 *             45 招全换成「活物原语」（trail / entity / pool / beam / wall）之后，
 *             最典型的失败形态是「代码在跑、画面是空的」。
 *   三、残留   活物会自己活一段时间，如果生命周期写错，它就**永远不走**：
 *             `updaters` 只增不减、`scene.children` 一直涨 → 放十几招后整页卡死。
 *             静态截图看不出来，只能数。
 *
 * ---------------- 为什么可见度要在三个时刻取样 ----------------
 * 一次性特效（`zone` / `shock` / `flash`）在 60ms 就到峰值，取一帧就够。
 * 活物不是：藤蔓要长得出来、犬群要走过来、水位要涨上去 —— **峰值在 2 秒后**。
 * 只量 0.3 秒的话，这一批「会动的东西」全被判成空画面（实测藤蔓 0.3s 只有 320
 * 像素，2.2s 是 4800）。所以取 0.4 / 2.0 / 4.0 三帧，报**最大值**。
 *
 * ---------------- 判据 ----------------
 * 只判「看得见」，不判美丑。下界按判定半径分档，跟 `vfx-skill-vis` 同一套口径
 * （单体 1500 / 大范围 2500）。`shape:'self'` 的招没有半径，它考的是「知不知道
 * 自己在挨打」，放宽到 1200。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const MIN_SMALL = 1500, MIN_BIG = 2500, MIN_SELF = 1200;
const minOf = r => (r.shape === 'self' || !r.radius ? MIN_SELF : (r.radius > 3.5 ? MIN_BIG : MIN_SMALL));

/* 三个取样点（页内秒数）。0.4 抓起手，2.0 抓活物长开，4.0 抓「还在场上」。 */
const T_SAMPLES = [0.4, 2.0, 4.0];

(async () => {
  const argv = process.argv.slice(2);
  let shotBoss = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--shots') shotBoss = argv[++i];
    else rest.push(argv[i]);
  }
  const only = rest;

  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'docs', 'boss-vfx-playground.html'),
    { waitUntil: 'load' });
  await p.waitForFunction('typeof simulate === "function" && typeof setBoss === "function"');
  await wait(1200);

  /* 开场那层遮罩会压暗整个舞台 —— 不点掉的话截图全是暗的（第一版就这么截的，
   * 九张图全废）。`#intro` 只是显隐，不影响后面的任何状态。 */
  await p.evaluate(() => {
    const b = document.getElementById('startBtn');
    if (b) b.click();
    const it = document.getElementById('intro');
    if (it) it.style.display = 'none';
  });
  await wait(400);

  /* 停掉主循环的推帧：不然我们推 0.05 秒，画面里还有 rAF 自己的那一份，
   * 同一份代码两次量出来的数会差一截（`vfx-skill-vis` 踩过这个坑）。 */
  await p.evaluate(() => { FROZEN = true; });

  /* ---------------- 一、契约 ---------------- */
  console.log('一、契约');
  const meta = await p.evaluate(() => {
    const ids = BOSSES_DEF.map(b => b.id);
    /* 世界 Boss（kind:'wb'）四格全独占，没有本命技 —— 判据只管 45 只守卫 */
    const guards = BOSSES_DEF.filter(b => b.kind !== 'wb').map(b => b.id);
    const nr = Object.keys(NR);
    const miss = guards.filter(id => !NR[id]);
    const extra = nr.filter(id => ids.indexOf(id) < 0);
    const badSlot = [];
    for (const id of ids) {
      const order = KIT[id] || [];
      const last = order[order.length - 1];
      /* 世界 Boss 没有本命技（四格全独占），只有守卫需要 nt_ 尾格 */
      const isWb = !NR[id];
      if (!isWb && last !== 'nt_' + id) badSlot.push(id + ' → ' + last);
      /* 每一格都得在 SKILL_INDEX 里，否则点了没反应 */
      for (const s of order) if (!SKILL_INDEX[s]) badSlot.push(id + ' 缺技能 ' + s);
    }
    const rules = {}, names = {}, noRule = [];
    for (const id of nr) {
      /* `rule` 是面板上那句「这一战考什么」的唯一来源，缺了就是一格空白 */
      if (!NR[id].rule) noRule.push(id);
      rules[NR[id].rule] = (rules[NR[id].rule] || 0) + 1;
      names[NR[id].n] = (names[NR[id].n] || 0) + 1;
    }
    const dupRule = Object.keys(rules).filter(k => k !== 'undefined' && rules[k] > 1);
    const dupName = Object.keys(names).filter(k => names[k] > 1);
    const kits = {};
    const dupKit = [];
    for (const id of ids) {
      const k = (KIT[id] || []).join(',');
      if (kits[k]) dupKit.push([kits[k], id]);
      kits[k] = id;
    }
    /* 世界 Boss 那 6 只没有 rule（四格全独占，不走「本命技」这套） */
    return { n: ids.length, ids, nrIds: nr, nrn: nr.length, miss, extra, badSlot, dupRule, dupName, dupKit, noRule };
  });
  ok(meta.miss.length === 0, '45 只守卫都有本命技（NR 覆盖）', meta.miss);
  ok(meta.extra.length === 0, 'NR 里没有野键', meta.extra);
  ok(meta.noRule.length === 0, '每只本命技都有 rule（面板上那句「这一战考什么」）', meta.noRule);
  ok(meta.badSlot.length === 0, '每只第 5 格 = 自己的 nt_<id>，且每格都能在索引里找到', meta.badSlot.slice(0, 5));
  ok(meta.dupRule.length === 0, '45 条 rule 互不相同', meta.dupRule);
  ok(meta.dupName.length === 0, '45 个技能名互不相同', meta.dupName);
  ok(meta.dupKit.length === 0, '51 只技能组两两不同', meta.dupKit);
  console.log('  ' + meta.n + ' 只 / ' + meta.nrn + ' 条本命技');

  /* ---------------- 二、全量施放（不判像素，只判不炸） ---------------- */
  console.log('二、51 只 × 全技能施放');
  const castAll = await p.evaluate(() => {
    const bad = [];
    let n = 0;
    for (const def of BOSSES_DEF) {
      setBoss(def.id);
      const order = KIT[def.id] || [];
      for (const sk of order) {
        try { cast(sk); n++; }
        catch (e) { bad.push(def.id + ' / ' + sk + ' → ' + e.message); }
        for (let i = 0; i < 40; i++) simulate(1 / 60);
      }
      /* 换 Boss 前把它自己那套跑完，看看活物在生命周期里会不会炸 */
      for (let i = 0; i < 300; i++) simulate(1 / 60);
      clearStage();
    }
    return { n, bad };
  });
  ok(castAll.bad.length === 0, castAll.n + ' 次施放 + 收尾全部零异常', castAll.bad.slice(0, 5));
  console.log('  施放 ' + castAll.n + ' 次');

  /* ---------------- 三、本命技：可见度 + 残留 ---------------- */
  const rows = [];
  /* 世界 Boss 没有 `nt_` 本命技 —— 只量有 NR 的那 45 只 */
  const targets = meta.nrIds.filter(id => !only.length || only.indexOf(id) >= 0);
  console.log('三、本命技可见度 + 残留（' + targets.length + ' 只，取样 ' + T_SAMPLES.join('/') + ' 秒）');

  for (const bossId of targets) {
    const r = await p.evaluate((bossId, TS) => {
      const gl = document.getElementById('gl');
      const c2 = document.createElement('canvas');
      c2.width = gl.width; c2.height = gl.height;
      const x2 = c2.getContext('2d', { willReadFrequently: true });
      const grab = () => {
        renderer.render(scene, camera);
        x2.drawImage(gl, 0, 0);
        return x2.getImageData(0, 0, c2.width, c2.height).data;
      };
      const diff = (A, B) => {
        let d = 0;
        for (let i = 0; i < A.length; i += 4) {
          if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]),
            Math.abs(A[i + 2] - B[i + 2])) >= 8) d++;
        }
        return d;
      };

      setBoss(bossId);
      const sk = SKILL_INDEX['nt_' + bossId];
      if (!sk) return { err: 'no-native' };
      const hit = sk.hit ? sk.hit() : null;
      const base = { up: updaters.length, ch: scene.children.length };

      /* 随机数上种子：粒子的散布 / 大小 / 寿命全走 Math.random，
       * 不固定就是「同一份代码两次量出两个数」，调参变成在噪声里找方向。 */
      const rnd0 = Math.random;
      let seed = 0;
      for (let i = 0; i < bossId.length; i++) seed = (seed * 31 + bossId.charCodeAt(i)) >>> 0;
      seed = seed || 1;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

      const A = grab();
      cast('nt_' + bossId);
      /* 按取样点推进，每个点取一张；`cast` 里的计时器是页内时间，跟着 simulate 走 */
      const samples = [];
      let t = 0;
      for (const at of TS) {
        const n = Math.max(1, Math.round((at - t) * 60));
        for (let i = 0; i < n; i++) simulate(1 / 60);
        t = at;
        samples.push(diff(A, grab()));
      }
      Math.random = rnd0;

      /* 残留：活物最长 9 秒，**收回**还要几秒（藤蔓一节 45ms，150 节就是 6.75 秒）。
       * 所以窗口取 22 秒 —— 短于这个数会把「慢慢收回去」误判成泄漏。 */
      for (let i = 0; i < Math.round((22 - t) * 60); i++) simulate(1 / 60);
      const after = { up: updaters.length, ch: scene.children.length };
      clearStage();

      return {
        name: sk.name || sk.n || '', rule: sk.rule || '',
        shape: hit && hit.shape, radius: hit && (hit.r || hit.r0) || 0,
        samples, best: Math.max.apply(null, samples),
        base, after
      };
    }, bossId, T_SAMPLES);
    rows.push({ id: bossId, ...r });
  }

  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  console.log('  ' + pad('Boss', 14) + pad('本命技', 10) + pad('判定', 10) + pad('0.4s', 8) +
    pad('2.0s', 8) + pad('4.0s', 8) + pad('最大值', 9) + pad('下界', 7) + '残留');
  rows.sort((a, b) => (a.best / minOf(a)) - (b.best / minOf(b)));
  for (const r of rows) {
    const leak = (r.after.up - r.base.up) + (r.after.ch - r.base.ch);
    console.log('  ' + pad(r.id, 14) + pad(r.name, 10) +
      pad((r.shape || '?') + (r.radius ? ' R' + r.radius.toFixed(1) : ''), 10) +
      pad(r.samples[0], 8) + pad(r.samples[1], 8) + pad(r.samples[2], 8) +
      pad(r.best, 9) + pad(minOf(r), 7) +
      (leak ? '  ← 残留 ' + leak + ' (up ' + (r.after.up - r.base.up) + ' / ch ' + (r.after.ch - r.base.ch) + ')' : ''));
  }

  console.log('四、判据');
  for (const r of rows) {
    ok(r.best >= minOf(r), r.id + ' 本命技看得见（≥ ' + minOf(r) + ' 像素）',
      { best: r.best, samples: r.samples, shape: r.shape, radius: r.radius });
    const leak = (r.after.up - r.base.up) + (r.after.ch - r.base.ch);
    ok(leak <= 0, r.id + ' 活物 22 秒内自己收干净', { up: r.after.up - r.base.up, ch: r.after.ch - r.base.ch });
  }
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  /* ---------------- 五、截图（人眼复核） ---------------- */
  if (shotBoss) {
    const dir = path.resolve(__dirname, '..', 'shots', 'playground');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ids = shotBoss === 'all' ? meta.nrIds : shotBoss.split(',');
    console.log('五、截图 → shots/playground/（只截画布，不带面板）');
    /* 量的时候用 1000×660（快）；截图要看清形状，换成 1400×880 再截。
     * 面板是 DOM 浮在画布上的，只截画布仍然会带上它 —— 所以截图时把 UI 藏掉。 */
    await p.setViewport({ width: 1400, height: 880, deviceScaleFactor: 1 });
    await p.addStyleTag({ content:
      '#top,#roster,#panel,#barwrap,#hint{display:none!important}' });
    await wait(500);
    const canvas = await p.$('#gl');
    for (const id of ids) {
      for (const at of T_SAMPLES) {
        await p.evaluate((id, at) => {
          setBoss(id);
          for (let i = 0; i < 4; i++) simulate(1 / 60);
          cast('nt_' + id);
          for (let i = 0; i < Math.round(at * 60); i++) simulate(1 / 60);
          renderer.render(scene, camera);
        }, id, at);
        await canvas.screenshot({ path: path.join(dir, id + '-' + at.toFixed(1) + 's.png') });
      }
      await p.evaluate(() => clearStage());
    }
  }

  await b.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' 特效台：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
