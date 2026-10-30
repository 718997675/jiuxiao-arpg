#!/usr/bin/env node
/* ============================================================
 * 特效预算体检（真机）
 *
 *   NODE_PATH=<node_modules> node dev/vfx-bench.js
 *
 * 方案 §2 的三条硬指标里，有两条能量：
 *   · 单技能特效 ≤ 6 draw call
 *   · 5 技能连放峰值 ≤ 基线 + 25%
 * 第三条（移动端 30fps）在软件渲染（swiftshader）上量不出意义 ——
 * 这台机器空场景就只有个位数帧，所以**帧时只报数不判红**，别拿它当验收。
 *
 * 量法：`renderer.info` 是逐帧累加的，等主循环去渲染只会量到 0（实测踩过）。
 * 所以同步块里 `reset → render() → 读`，两次相减就是这一发的净增量；
 * rAF 插不进来，读数才是准的。
 *
 * 每个技能都按 `delay: 0` 播 —— 起手和命中挤在同一帧，这是**最坏一帧**，
 * 预算要按最坏情况算，不是按「前摇 0.9 秒之后才出」的平均情况算。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const SKILLS_UNDER_TEST = [
  'whirl', 'quake', 'swordarray', 'bloodrage', 'avatar',
  'fireball', 'meteor', 'firewall', 'iceshield', 'elementavatar',
  'talisman', 'swordrain', 'taiji', 'heal', 'summon'
];

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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

  const res = await p.evaluate(async (ids) => {
    const r = Game.renderer;
    r.info.autoReset = false;
    const frame = () => { r.info.reset(); r.render(Game.scene, Game.camera); return r.info.render.calls; };

    FX.clear();
    const base = frame();
    const out = [];

    for (const id of ids) {
      const sk = SKILLS[id];
      const pp = Game.playerGroup.position;
      FX.clear();
      VFX.reset();
      const before = frame();
      const dir = new THREE.Vector3(0, 0, 1);
      const aim = new THREE.Vector3(pp.x, 0, pp.z + Math.min(8, (sk.castRange || 6)));
      VFX.playFor(id, {
        pos: new THREE.Vector3(pp.x, 0, pp.z),
        aim: aim, dir: dir,
        radius: sk.radius || 3,
        delay: 0,
        lv: 9
      });
      const after = frame();
      out.push({
        id: id, calls: after - before, base: before,
        ops: VFX.lastBudget ? VFX.lastBudget.total : 0,
        unknown: VFX.unknown.slice(),
        stats: FXK.stats()
      });
      FX.clear();
    }

    /* 5 技能连放：选最重的 5 条同时在场 */
    FX.clear();
    const b0 = frame();
    for (const id of ['meteor', 'swordarray', 'firewall', 'elementavatar', 'quake']) {
      const sk = SKILLS[id];
      const pp = Game.playerGroup.position;
      VFX.playFor(id, {
        pos: new THREE.Vector3(pp.x, 0, pp.z),
        aim: new THREE.Vector3(pp.x, 0, pp.z + 6),
        dir: new THREE.Vector3(0, 0, 1),
        radius: sk.radius || 3, delay: 0, lv: 9
      });
    }
    const b1 = frame();
    const combo = { base: b0, after: b1, calls: b1 - b0, pct: Math.round((b1 - b0) / Math.max(1, b0) * 1000) / 10 };
    FX.clear();
    r.info.autoReset = true;
    return { base, out, combo };
  }, SKILLS_UNDER_TEST);

  console.log('基线（空场景一帧）：', res.base, 'draw call\n');
  console.log('技能'.padEnd(16), 'draw call', ' 指令', ' 段');
  for (const x of res.out) {
    console.log(
      String(x.id).padEnd(16),
      String(x.calls).padStart(9),
      String(x.ops).padStart(5),
      '  ' + JSON.stringify(FXK_PARTS(x.stats))
    );
  }
  function FXK_PARTS(s) { return { spr: s.parts, trail: s.trails, bolt: s.bolts, shock: s.shocks, decal: s.decalOn }; }

  console.log('');
  for (const x of res.out) {
    ok(x.calls > 0, x.id + ' 真的画了东西（draw call > 0）', x.calls);
    /* 方案 §2：单技能 ≤ 6 draw call。这一层一个粒子簇 / 一条带子 / 一道闪电
     * 都是一次绘制，所以这个数是硬的。 */
    ok(x.calls <= 6, x.id + ' ≤ 6 draw call（方案 §2 硬指标）', x.calls);
    ok(x.unknown.length === 0, x.id + ' 没有不认识的指令', x.unknown);
  }

  console.log('\n5 技能连放：', JSON.stringify(res.combo));
  ok(res.combo.pct <= 25, '5 技能连放峰值 ≤ 基线 +25%（方案 §2 硬指标）', res.combo.pct + '%');
  ok(res.combo.calls <= 30, '5 技能连放 draw call 增量 ≤ 30', res.combo.calls);

  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(errs2.length === 0, '全程零控制台报错', errs2.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 特效预算：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
