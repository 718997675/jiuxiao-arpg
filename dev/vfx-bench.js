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

    /* [P5] 按**四个关键等级**各量一次：1（基础剪影）/ 5（进化 Ⅰ）/
     * 9（进化 Ⅱ）/ 10（终极）。台阶是 patch 覆盖，10 级不是「9 级 + 一点点」，
     * 所以不能只量一个等级就宣布「15 条全 ≤ 6」—— 那正是 P5 之前的状态。
     *
     * 等级靠临时换掉 `Game.skillLevel`（`VFX.playFor` 唯一的等级来源），
     * 量完立刻还原：这一层不许改游戏状态，否则后面的连放测试就不是同一个起点了。 */
    const LEVELS = [1, 5, 9, 10];
    const origSkillLevel = Game.skillLevel;
    const out = [];

    for (const id of ids) {
      const sk = SKILLS[id];
      for (const lv of LEVELS) {
        Game.skillLevel = () => lv;
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
          delay: 0
        });
        const after = frame();
        out.push({
          id: id, lv: lv, calls: after - before, base: before,
          ops: VFX.lastBudget ? VFX.lastBudget.total : 0,
          /* [P5] 数据层的估算值（`vfxCost`）。同一帧实测**只会 ≤ 它**：
           * 带 `at` 的指令被推迟到后面的帧，所以实测常常比估算小。 */
          est: (typeof vfxCost === 'function') ? vfxCost(vfxRecipe(id, lv)) : null,
          unknown: VFX.unknown.slice(),
          stats: FXK.stats()
        });
        FX.clear();
      }
    }
    Game.skillLevel = origSkillLevel;

    /* 5 技能连放：选最重的 5 条同时在场 */
    FX.clear();
    const b0 = frame();
    for (const id of ['meteor', 'swordarray', 'firewall', 'elementavatar', 'quake']) {
      const sk = SKILLS[id];
      const pp = Game.playerGroup.position;
      Game.skillLevel = () => 10;          // 连放按**满级**压测：最坏情况
      VFX.playFor(id, {
        pos: new THREE.Vector3(pp.x, 0, pp.z),
        aim: new THREE.Vector3(pp.x, 0, pp.z + 6),
        dir: new THREE.Vector3(0, 0, 1),
        radius: sk.radius || 3, delay: 0
      });
    }
    Game.skillLevel = origSkillLevel;
    const b1 = frame();
    const combo = { base: b0, after: b1, calls: b1 - b0, pct: Math.round((b1 - b0) / Math.max(1, b0) * 1000) / 10 };
    FX.clear();
    r.info.autoReset = true;
    return { base, out, combo };
  }, SKILLS_UNDER_TEST);

  console.log('基线（空场景一帧）：', res.base, 'draw call\n');
  console.log('技能'.padEnd(16), ' Lv1  Lv5  Lv9 Lv10', '  峰值  数据估算(1/5/9/10)');
  {
    /* 按技能收成一行：四个等级横着排，一眼看出「哪一档突然变重」 */
    const byId = {};
    for (const x of res.out) (byId[x.id] = byId[x.id] || {})[x.lv] = x;
    for (const id of Object.keys(byId)) {
      const g = byId[id];
      const row = [1, 5, 9, 10].map(lv => String(g[lv] ? g[lv].calls : '-').padStart(4));
      const mx = Math.max(...[1, 5, 9, 10].map(lv => (g[lv] ? g[lv].calls : 0)));
      const est = [1, 5, 9, 10].map(lv => (g[lv] && g[lv].est !== null ? g[lv].est : '-')).join('/');
      console.log(String(id).padEnd(16), row.join(' '), '  ', String(mx).padStart(3), '  ', est);
    }
  }
  console.log('');

  let worst = { id: '', lv: 0, calls: 0 };
  for (const x of res.out) {
    if (x.calls > worst.calls) worst = x;
    ok(x.calls > 0, x.id + ' Lv' + x.lv + ' 真的画了东西（draw call > 0）', x.calls);
    /* 方案 §2：单技能 ≤ 6 draw call。这一层一个粒子簇 / 一条带子 / 一道闪电
     * 都是一次绘制，所以这个数是硬的。 */
    ok(x.calls <= 6, x.id + ' Lv' + x.lv + ' ≤ 6 draw call（方案 §2 硬指标）', x.calls);
    ok(x.unknown.length === 0, x.id + ' Lv' + x.lv + ' 没有不认识的指令', x.unknown);
  }
  ok(true, '最重的一发：' + worst.id + ' Lv' + worst.lv + ' = ' + worst.calls + ' 次绘制');
  /* 实测不许超过数据层的估算 —— 这条能抓住「成本表算错了」（V0 就把 `cone`
   * 按粒子数算过，算出 29 次这种荒谬读数）。反过来实测更小是正常的：
   * 带 `at` 的指令被推迟到后面的帧，同一帧自然少画几次。 */
  {
    const over = res.out.filter(x => x.est !== null && x.calls > x.est)
      .map(x => [x.id, x.lv, x.calls, x.est]);
    ok(over.length === 0, '实测 draw call 都不超过数据层估算（成本表没算错）', over);
    const lower = res.out.filter(x => x.est !== null && x.calls < x.est).length;
    ok(true, '有 ' + lower + ' 个读数低于估算（`at` 把指令推迟到后面的帧，符合预期）');
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
