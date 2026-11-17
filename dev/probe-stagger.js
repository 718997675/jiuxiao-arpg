#!/usr/bin/env node
/* ============================================================
 * [M7.3] 破绽窗口 · 真机验收
 *
 *   node dev/probe-stagger.js
 *
 * 契约（test-m7-3）判的是数据 / 接线 / 边界；这一份判的是
 * 「接进真游戏后，8 只魔将的破绽窗口真的按设计开、真的按 1.5 倍结算」。
 *
 * 量七件事（8 只逐只跑）：
 *   1. 8 只都能刷出来，且都带 cfg.stagger
 *   2. 放**非**破绽招 → 不武装（窗口只属于那一招）
 *   3. 放破绽招 → 武装，但前摇没走完**不开窗**
 *   4. 前摇走完 → 开窗，staggerT ≈ dur、staggerMul = mul
 *   5. 窗口内伤害 / 窗口外伤害 ≈ mul（同元素、同满血起点，控制变量）
 *   6. 窗口走完 → staggerT 归零、倍率复位 1
 *   7. 零 console / pageerror
 *
 * headless 软件渲染只有 1~2fps，时间一律显式推进（bossStaggerTick(e, dt)），不靠等。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

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
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.stats.hpMax = 1e9; Game.state.hp = 1e9;
    Game.invuln = 9999;
  });
  await wait(350);

  console.log('一、8 只魔将：窗口按设计开');
  const r = await page.evaluate(() => {
    const out = { rows: [], err: [] };
    const pp = Game.playerGroup.position;
    const ids = Object.keys(BOSSES).filter(k => k.indexOf('bafo_') === 0);

    /* 一次命中量：同元素、同满血起点、清护盾，只让 stagger 一个变量动 */
    const hit = (e, elem) => {
      e.dead = false; e.hp = e.maxHp; e.shield = 0; e.overkill = 0;
      const before = e.hp;
      Game.damageEnemy(e, 1000, false, { elem: elem });
      return before - e.hp;
    };

    for (const id of ids) {
      const row = { id: id, fail: null };
      let e = null;
      try {
        e = Game.spawnEnemy(null, pp.x + 7, pp.z + 3, false, 60, id);
      } catch (ex) { row.fail = 'spawn: ' + (ex.message || ex); out.rows.push(row); continue; }
      if (!e) { row.fail = 'no-entity'; out.rows.push(row); continue; }

      const stg = e.cfg && e.cfg.stagger;
      row.hasStagger = !!stg;
      if (!stg) { row.fail = 'cfg 没有 stagger'; out.rows.push(row); continue; }

      const weak = (e.cfg.weak) || 'phys';

      /* ② 放非破绽招：不武装 */
      const other = (stg.skill === 'slam') ? 'ringshot' : 'slam';
      e.staggerArm = null; e.staggerT = 0; e.staggerMul = 1;
      e._cast = { id: other, sk: { warm: 0.5 } };
      Game.bossStaggerArm(e);
      row.otherNoArm = !e.staggerArm;

      /* ③ 放破绽招：武装，但前摇没走完不开窗 */
      e._cast = { id: stg.skill, sk: { warm: 0.5 } };
      Game.bossStaggerArm(e);
      row.armed = !!e.staggerArm;
      Game.bossStaggerTick(e, 0.3);
      row.notYet = (e.staggerT === 0);

      /* ④ 前摇走完：开窗 */
      Game.bossStaggerTick(e, 0.3);
      row.opened = (e.staggerT > 0);
      row.durOk = Math.abs(e.staggerT - stg.dur) < 0.05;
      row.mulOk = (e.staggerMul === stg.mul);
      row.fxDecal = (typeof FXK !== 'undefined' && FXK && FXK.decals)
        ? FXK.decals.some(d => d.on) : null;

      /* ⑤ 窗口内 vs 窗口外：控制变量比值 */
      e.staggerT = 0; e.staggerMul = 1;
      const base = hit(e, weak);
      e.staggerT = stg.dur; e.staggerMul = stg.mul;
      const boost = hit(e, weak);
      row.base = +base.toFixed(1);
      row.boost = +boost.toFixed(1);
      row.ratio = base > 0 ? +(boost / base).toFixed(3) : null;

      /* ⑥ 收束：倍率复位 */
      Game.bossStaggerTick(e, stg.dur + 0.1);
      row.closed = (e.staggerT === 0 && e.staggerMul === 1);

      /* 收尾：别让这只挡住下一只 */
      e.dead = true;
      out.rows.push(row);
    }
    return out;
  });

  ok(r.err.length === 0, '批量过程无异常', r.err);
  ok(r.rows.length === 8, '8 只八部魔将全部刷出', r.rows.length);
  const bad = r.rows.filter(x => x.fail);
  ok(bad.length === 0, '8 只都能刷出且带 stagger', bad.map(x => x.id + ':' + x.fail));

  const noArm = r.rows.filter(x => x.otherNoArm !== true);
  ok(noArm.length === 0, '放非破绽招不武装', noArm.map(x => x.id));

  const notArmed = r.rows.filter(x => x.armed !== true);
  ok(notArmed.length === 0, '放破绽招会武装', notArmed.map(x => x.id));

  const early = r.rows.filter(x => x.notYet !== true);
  ok(early.length === 0, '前摇没走完不开窗', early.map(x => x.id));

  const notOpen = r.rows.filter(x => x.opened !== true);
  ok(notOpen.length === 0, '前摇走完开窗', notOpen.map(x => x.id));

  const durBad = r.rows.filter(x => x.durOk !== true);
  ok(durBad.length === 0, '窗口时长 = cfg.stagger.dur', durBad.map(x => x.id));

  const mulBad = r.rows.filter(x => x.mulOk !== true);
  ok(mulBad.length === 0, '窗口倍率 = cfg.stagger.mul', mulBad.map(x => x.id));

  const decalBad = r.rows.filter(x => x.fxDecal === false);
  ok(decalBad.length === 0, '开窗时画了地面裂纹（FXK.decal）', decalBad.map(x => x.id));

  console.log('\n二、伤害倍率（窗口内 / 窗口外）');
  for (const x of r.rows) {
    const okRatio = x.ratio != null && Math.abs(x.ratio - 1.5) < 0.02;
    ok(okRatio, x.id + ' 伤害 ×1.5', { base: x.base, boost: x.boost, ratio: x.ratio });
  }

  console.log('\n三、收束');
  const notClosed = r.rows.filter(x => x.closed !== true);
  ok(notClosed.length === 0, '窗口走完倍率复位 1', notClosed.map(x => x.id));

  ok(errs.length === 0, '零 console / pageerror', errs.slice(0, 3));

  console.log('\n================================');
  console.log('  M7.3 破绽窗口真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('探针自身崩了：', e && e.stack || e);
  process.exit(2);
});
