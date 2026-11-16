#!/usr/bin/env node
/* ============================================================
 * [U10] 竖向兜底 · 逐只排布真机验收
 *
 *   NODE_PATH=<node_modules> node dev/probe-bosslayout.js
 *
 * 静态契约（test-bosslayout）只证明「代码里有 variant/seed」；
 * 这一份在特效台里真的调 `BFX.lift`，把 `BFX.spikes` 换成一个记录器，
 * 量「同一形状不同骨架 / 不同 Boss 同一招」到底排布一不一样。
 *
 * 量五件事：
 *   1 六种形状 × 六种骨架：每种的柱子坐标签名至少 5 种不同
 *   2 同 seed 可复现；换 seed 必不同
 *   3 45 只 × 四格：同一只里「同形状的两招」不再拿到同一排
 *   4 跨 Boss 的同一招：排布不重合
 *   5 不碰 hit 对象、坐标全有限、零报错
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'docs', 'boss-vfx-playground.html');
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const TOOLS = `
  window.__sig = function (hit, variant, seed) {
    const old = BFX.spikes;
    const rows = [];
    BFX.spikes = function (o) { rows.push([o.x, o.z, o.h]); };
    try { BFX.lift(hit, { glow: 0xff5522, variant: variant, seed: seed }); }
    finally { BFX.spikes = old; }
    return rows.map(r => r.map(v => Math.round(v * 100) / 100));
  };
  window.__seedOf = function (boss, skill) {
    const key = String(boss || '') + '|' + String(skill || '');
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  window.__allHits = function () {
    const HITS = {
      circle: { shape: 'circle', x: 1, z: 2, r: 4 },
      ring: { shape: 'ring', x: 1, z: 2, r: 4, r0: 2 },
      rect: { shape: 'rect', x: 1, z: 2, len: 9, w: 2.4, angle: 0.6 },
      sector: { shape: 'sector', x: 1, z: 2, r: 5, angle: 0.4, span: 1.6 },
      scatter: { shape: 'scatter', x: 1, z: 2, pts: [
        { x: 1, z: 2, r: 1.2 }, { x: 4, z: 5, r: 1.6 }, { x: -2, z: 3, r: 1.0 }
      ] },
      self: { shape: 'self', x: 1, z: 2, r: 2.5 }
    };
    const out = {};
    for (const k in HITS) {
      const variants = [];
      for (let v = 0; v < 6; v++) variants.push(window.__sig(HITS[k], v, 20261116));
      out[k] = variants;
    }
    return out;
  };
  window.__bossRows = function () {
    const rows = [];
    const errors = [];
    for (const id of Object.keys(KIT)) {
      const keys = KIT[id] || [];
      const per = [];
      for (const key of keys) {
        const sk = SKILL_INDEX[key];
        if (!sk || typeof sk.hit !== 'function') continue;
        let hit;
        try { hit = sk.hit(); } catch (e) { errors.push(id + '/' + key + ': ' + e.message); continue; }
        if (!hit) continue;
        const before = JSON.stringify(hit);
        const seed = window.__seedOf(id, key);
        const sig = window.__sig(hit, seed % 6, seed);
        const after = JSON.stringify(hit);
        per.push({ key, shape: hit.shape, sig, same: before === after });
      }
      rows.push({ id, per });
    }
    return { rows, errors };
  };
`;

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

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof SKILL_INDEX === "object" && Object.keys(SKILL_INDEX).length > 50');
  await wait(500);
  await page.evaluate(() => {
    const b = document.getElementById('startBtn'); if (b) b.click();
    const it = document.getElementById('intro'); if (it) it.style.display = 'none';
    FROZEN = true;
  });
  await page.evaluate(TOOLS);

  /* ---------- 1. 六形状 × 六骨架 ---------- */
  const shapes = await page.evaluate(() => window.__allHits());
  const shapeNames = Object.keys(shapes);
  ok(shapeNames.length === 6, '六种形状都取样', shapeNames);
  for (const shape of shapeNames) {
    const sigs = shapes[shape].map(s => JSON.stringify(s));
    const uniq = new Set(sigs).size;
    ok(uniq >= 5, shape + ' 六种骨架至少 5 种排布不同', { uniq });
    const all = shapes[shape].flat();
    ok(all.length > 0, shape + ' 有柱子', all.length);
    ok(all.every(r => r.every(v => Number.isFinite(v))), shape + ' 坐标全有限');
    const maxN = Math.max.apply(null, shapes[shape].map(s => s.length));
    ok(maxN <= 80, shape + ' 单种骨架柱子数量有上限', maxN);
  }

  /* ---------- 1b. entity 低模核 ---------- */
  const entity = await page.evaluate(() => {
    const a = BFX.entity({ x: 0, z: 0, size: 1.2, life: 1 });
    const b = BFX.entity({ x: 0, z: 0, size: 1.2, life: 1, lowpoly: false });
    const out = {
      hasCore: !!a.core,
      geo: a.core && a.core.geometry && a.core.geometry.type,
      optOut: !!b.core
    };
    a.kill(); b.kill();
    return out;
  });
  ok(entity.hasCore, 'entity 默认带低模核');
  ok(entity.geo === 'IcosahedronGeometry', '低模核是 Icosahedron', entity.geo);
  ok(entity.optOut === false, 'lowpoly:false 可退回纯 billboard');

  /* ---------- 2. 同 seed 可复现 / 换 seed 不同 ---------- */
  const repro = await page.evaluate(() => {
    const hit = { shape: 'circle', x: 1, z: 2, r: 4 };
    const a = window.__sig(hit, 3, 123456);
    const b = window.__sig(hit, 3, 123456);
    const c = window.__sig(hit, 3, 123457);
    return { same: JSON.stringify(a) === JSON.stringify(b), diff: JSON.stringify(a) !== JSON.stringify(c) };
  });
  ok(repro.same, '同 variant + 同 seed → 同一排布（可复现）');
  ok(repro.diff, '同 variant + 换 seed → 排布不同');

  /* ---------- 3/4. 45 只 × 四格 ---------- */
  const bosses = await page.evaluate(() => window.__bossRows());
  ok(bosses.errors.length === 0, '所有 Boss 的 hit() 都能取到', bosses.errors);
  const allRows = bosses.rows.flatMap(r => r.per.map(p => ({ boss: r.id, ...p })));
  ok(allRows.length >= 160, '覆盖 45 只 × 四格（≥160 招）', allRows.length);
  ok(allRows.every(r => r.same), 'BFX.lift 不改 hit 对象');

  let sameShapePairs = 0, sameShapeSame = 0;
  for (const b of bosses.rows) {
    const per = b.per;
    for (let i = 0; i < per.length; i++) {
      for (let j = i + 1; j < per.length; j++) {
        if (per[i].shape !== per[j].shape) continue;
        sameShapePairs++;
        if (JSON.stringify(per[i].sig) === JSON.stringify(per[j].sig)) sameShapeSame++;
      }
    }
  }
  ok(sameShapePairs > 0, '样本里存在同形状的招对', sameShapePairs);
  ok(sameShapeSame === 0, '同一只里同形状两招不再拿到同一排', { sameShapePairs, sameShapeSame });

  /* 跨 Boss 同一招：按 key 分组，比较第一只与其余 */
  const byKey = {};
  for (const r of allRows) (byKey[r.key] = byKey[r.key] || []).push(r);
  let crossPairs = 0, crossSame = 0;
  for (const k in byKey) {
    const rows = byKey[k];
    if (rows.length < 2) continue;
    const base = JSON.stringify(rows[0].sig);
    for (let i = 1; i < rows.length; i++) {
      crossPairs++;
      if (JSON.stringify(rows[i].sig) === base) crossSame++;
    }
  }
  ok(crossPairs > 0, '样本里存在跨 Boss 的同一招', crossPairs);
  ok(crossSame === 0, '跨 Boss 同一招不再一像素不差', { crossPairs, crossSame });

  /* ---------- 5. 源码纪律 ---------- */
  const discipline = await page.evaluate(() => {
    const s = String(BFX.lift);
    return { random: s.indexOf('Math.random') >= 0, seed: s.indexOf('seed') >= 0, variant: s.indexOf('variant') >= 0 };
  });
  ok(!discipline.random, 'BFX.lift 内部不用 Math.random');
  ok(discipline.seed && discipline.variant, 'BFX.lift 读 seed / variant');
  ok(errs.length === 0, '零页面报错', errs);

  await browser.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' U10 竖向排布真机：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
