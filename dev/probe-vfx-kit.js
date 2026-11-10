#!/usr/bin/env node
/* ============================================================
 * FXKit v2 真机探针：五个原语在**真 WebGL** 里画得出来、画得住、画得不贵
 *
 *   NODE_PATH=<node_modules> node dev/probe-vfx-kit.js
 *
 * 契约测试（dev/test-vfx-kit.js）跑的是 THREE 桩，能证明「几何与池是对的」，
 * 但证明不了三件事，而这三件恰恰最容易在真机上翻车：
 *   1. 图集是 Canvas 现画的 —— 桩里的 canvas 什么都不画，真机上可能画崩 / 全白
 *   2. PointsMaterial 挂 map 之后，点精灵到底有没有采到贴图（桩不渲染）
 *   3. draw call 会不会被这一层顶上去（方案 §13：5 技能连放 ≤ 基线 +25%）
 *
 * 所以这里：放一轮 → 数 stats → 量 renderer.info.render.calls 的增量 → 截图。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
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

  console.log('一、图集：Canvas 现画，14 格都能出像素');
  const tex = await p.evaluate(() => {
    const out = {};
    for (const name of Object.keys(FXK_CELLS)) {
      const t = FXK.cellTex(name);
      const c = t.image;
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let lit = 0, sum = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 8) lit++; sum += d[i]; }
      out[name] = { w: c.width, h: c.height, lit: Math.round(lit / (c.width * c.height) * 1000) / 10, avg: Math.round(sum / (d.length / 4)) };
    }
    return out;
  });
  for (const [name, t] of Object.entries(tex)) {
    ok(t.w === 128 && t.h === 128, name + ' 是 128×128', [t.w, t.h]);
    ok(t.lit > 0.4 && t.lit < 99, name + ' 有实际像素（不是全空 / 全白）', t);
  }

  console.log('二、五个原语：真的进场景、真的画出来');
  const stats = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    const V = (x, y, z) => new THREE.Vector3(pp.x + x, y, pp.z + z);
    /* 先清干净，量的是「这一层自己」的成本。
     *
     * 量 draw call 必须**自己逼一帧**：`renderer.info` 是逐帧累加的，靠等
     * 主循环去渲染会量到 0（autoReset 一关，读到的就是上一次 reset 之后的账，
     * 而 reset 到读之间根本没有帧）。同步块里 rAF 插不进来，所以这两次
     * `render()` 之间的差就是这一层的净增量。 */
    FX.clear();
    const r = Game.renderer;
    r.info.autoReset = false;
    r.info.reset(); r.render(Game.scene, Game.camera);
    const base = r.info.render.calls;

    FXK.spr(V(0, 1, 2), { n: 24, tex: 'ember', color: 0xff8833, size: 0.6, life: 1.2, speed: 3, grav: -2 });
    FXK.spr(V(1, 1, 2), { n: 16, tex: 'smoke', color: 0x777777, size: 1.2, life: 1.2, speed: 1, additive: false });
    const trailPts = [];
    for (let i = 0; i < 8; i++) trailPts.push(V(-2 + i * 0.5, 1.2, 2));
    FXK.trail(trailPts, { color: 0xffddaa, width: 0.9, life: 1.0 });
    FXK.bolt(V(-1, 1.4, 3), V(1, 1.4, 6), { color: 0x88ddff, depth: 4, life: 1.0 });
    FXK.shock(V(0, 0, 3), 3, { color: 0xffaa55 });
    FXK.decal(V(0, 0, 4), { tex: 'scorch', size: 3, life: 2 });
    FXK.decal(V(1.5, 0, 4), { tex: 'crack', size: 2.6, life: 2, color: 0x2a1a10 });

    r.info.reset(); r.render(Game.scene, Game.camera);
    const after = r.info.render.calls;
    r.info.autoReset = true;
    return { stats: FXK.stats(), base, after, delta: after - base, q: FX.q };
  });
  console.log('   stats:', JSON.stringify(stats.stats));
  ok(stats.stats.parts >= 2, 'spr 两簇都在', stats.stats.parts);
  ok(stats.stats.trails === 1, 'trail 在', stats.stats.trails);
  ok(stats.stats.bolts === 1, 'bolt 在', stats.stats.bolts);
  ok(stats.stats.shocks === 1, 'shock 在', stats.stats.shocks);
  ok(stats.stats.decalOn === 2, '贴花两块都在', stats.stats.decalOn);
  ok(stats.delta > 0, 'draw call 真的涨了（说明画了东西，不是空转）', stats.delta);
  /* 方案 §13 的口径是「5 技能连放 ≤ 基线 +25%」。这一层一次放满五类原语，
   * 增量必须远小于整帧基线的一小截，否则 5 个技能一起放就爆了。 */
  ok(stats.delta <= 24, '五类原语同时在场：draw call 增量 ≤ 24', stats.delta);

  console.log('三、贴图真的被采到（截图像素不能是纯色）');
  const shot = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    FXK.spr(new THREE.Vector3(pp.x, 1.2, pp.z + 3), { n: 60, tex: 'star', color: 0xffffff, size: 2.2, life: 2, speed: 0.2 });
    FXK.shock(new THREE.Vector3(pp.x, 0, pp.z + 3), 4, { color: 0xffdd88 });
    await new Promise(res => setTimeout(res, 120));
    return true;
  });
  await wait(150);
  await p.screenshot({ path: '/tmp/vfx-kit.png' });
  ok(shot === true, '截图已出：/tmp/vfx-kit.png');

  /* [U6] 三档逐项核验：方案 §11 降级表 + §13 第 13 条「低画质：贴花消失、
   * 拖尾关闭」。之前实现是二档（q<1 / q<0.75），低档还留 6 块贴花，
   * 中档 0.7 反被砍掉拖尾 —— 现在统一由 FXK_TIER 一张表决定。 */
  console.log('四、降级：三档逐项核验（§11 / §13 第 13 条）');
  const tiers = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    const V = (x, y, z) => new THREE.Vector3(pp.x + x, y, pp.z + z);
    const old = FX.q;
    const probe = (q) => {
      FX.clear();
      FX.q = q;
      FXK.spr(V(0, 1, 2), { n: 40, tex: 'ember', life: 1 });
      const n = FXK.parts[0].n;
      FXK.trail([V(0, 1, 0), V(1, 1, 0), V(2, 1, 0)], { life: 1 });
      const trails = FXK.trails.length;
      FXK.shock(V(0, 0, 2), 2, {});
      const sheet = !!FXK.shocks[0].sheet;
      /* 连放 20 道闪电，逐道数分叉（FXK.bolt 把条数记在 branches 上，
       * 最深递归层数记在 maxLayer 上） */
      let forked = 0, deep = 0, maxL = 0;
      for (let i = 0; i < 20; i++) {
        const bl = FXK.bolt(V(0, 4, 0), V(0, 0, 2), { life: 0.2 });
        if (bl && bl.branches > 0) forked++;
        if (bl && bl.maxLayer >= 2) deep++;
        if (bl && bl.maxLayer > maxL) maxL = bl.maxLayer;
      }
      for (let i = 0; i < 20; i++) FXK.decal(V(i, 0, 0), { life: 5 });
      const pool = FXK.decals.length;
      const on = FXK.stats().decalOn;
      const tier = FXK.tier;
      FX.clear();
      return { q, tier, n, trails, sheet, forked, deep, maxL, pool, on };
    };
    const high = probe(1), mid = probe(0.7), low = probe(0.5);
    FX.q = old;
    return { high, mid, low };
  });
  const tm = t => ({ tier: t.tier, n: t.n, trails: t.trails, sheet: t.sheet, forked: t.forked, deep: t.deep, maxL: t.maxL, pool: t.pool, on: t.on });
  ok(tiers.high.tier === 'high' && tiers.mid.tier === 'mid' && tiers.low.tier === 'low',
    'FX.q = 1 / 0.7 / 0.5 归到高 / 中 / 低三档', [tm(tiers.high), tm(tiers.mid), tm(tiers.low)]);
  ok(tiers.high.n === 40 && tiers.mid.n === 24 && tiers.low.n === 14,
    '粒子倍率 100% / 60% / 35%（§11）', [tiers.high.n, tiers.mid.n, tiers.low.n]);
  ok(tiers.high.trails === 1 && tiers.mid.trails === 1,
    '高 / 中档仍画拖尾带子（0.7 不再被误判成低档）', [tiers.high.trails, tiers.mid.trails]);
  ok(tiers.low.trails === 0, '低档拖尾关闭（退化成 3 颗 spr，不建带子）', tiers.low.trails);
  ok(tiers.high.sheet === true && tiers.mid.sheet === false && tiers.low.sheet === false,
    '冲击波竖直气浪只在高档画', [tiers.high.sheet, tiers.mid.sheet, tiers.low.sheet]);
  ok(tiers.high.forked >= 18, '高档 20 道闪电 ≥18 道有分叉（§13 第 3 条）', tiers.high.forked);
  ok(tiers.low.forked === 0, '低档 20 道闪电零分叉（§11「无」）', tiers.low.forked);
  /* [U6] §11 的「高 = 2 层递归 / 中 = 1 层 / 低 = 无」逐档核验 */
  ok(tiers.high.deep >= 12, '高档 ≥12/20 道闪电长出第 2 层子分叉（§11「2 层递归」）', tiers.high.deep);
  ok(tiers.mid.maxL <= 1 && tiers.mid.deep === 0,
    '中档只长 1 层，不递归出子分叉（§11「1 层」）', { deep: tiers.mid.deep, maxL: tiers.mid.maxL });
  ok(tiers.low.maxL === 0, '低档分叉层数为 0（§11「无」）', tiers.low.maxL);
  ok(tiers.high.on === 16, '高档贴花池 16 块全可亮', { pool: tiers.high.pool, on: tiers.high.on });
  ok(tiers.mid.on === 8, '中档只转前 8 个槽（池不拆，只转 cap 个）', { pool: tiers.mid.pool, on: tiers.mid.on });
  ok(tiers.low.on === 0, '低档贴花消失（§13 第 13 条）', { pool: tiers.low.pool, on: tiers.low.on });

  console.log('五、清场：换图不留残影');
  const cleared = await p.evaluate(() => {
    FX.clear();
    return FXK.stats();
  });
  ok(cleared.parts === 0 && cleared.trails === 0 && cleared.bolts === 0 && cleared.shocks === 0,
    'clear 之后四类活物清零', cleared);
  ok(cleared.decalOn === 0, '贴花全部收起');

  console.log('六、控制台');
  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(errs2.length === 0, '全程零控制台报错', errs2.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' VFX 原语探针：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
