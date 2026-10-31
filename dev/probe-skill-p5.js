#!/usr/bin/env node
/* ============================================================
 * 技能 P5 真机探针：45 套形态进化真的播得出来
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p5.js
 *
 * 契约（test-skill-p5）证明的是「数据对、判据立得住」；这一份证明的是
 * **在真的渲染器里、按真的等级取到配方、真的画出来了**。量五件事：
 *
 *   1. 15 位 × 4 级（1 / 5 / 9 / 10）= 60 发全部播出去：播放账涨、
 *      没有不认识的指令、控制台零报错
 *   2. 三段台阶在浏览器里取出来的**剪影签名互不相同**（不是 node 侧算出来的幻觉）
 *   3. `at` 真的会延迟：包一层 `FX.ring` 数次数 —— 施法那一帧只有 1 圈，
 *      0.3 秒后变 2 圈
 *   4. 换图会作废：延迟的那一圈不会砸到新地图上
 *   5. 按功能位解析：`poison` 播的确实是 `swordrain` 那条剪影
 *
 * 为什么第 3 条要包 `FX.ring` 而不是读 `VFX.played`：`played` 是**同步记账**
 * （延迟的指令在记账时就算「消费了」），它证明不了「晚一点才画」。
 * 而这里要验的恰恰是「晚一点」。
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

  /* ---------------- 1. 60 发全播得出来 ---------------- */
  console.log('一、15 位 × 4 级 = 60 发，每一发都播得出来');
  const sweep = await p.evaluate(() => {
    const KEYS = Object.keys(SKILL_VFX);
    const LEVELS = [1, 5, 9, 10];
    const orig = Game.skillLevel;
    const rows = [];
    const pp = Game.playerGroup.position;
    for (const key of KEYS) {
      for (const lv of LEVELS) {
        Game.skillLevel = () => lv;
        FX.clear();
        VFX.reset();
        const before = VFX.played;
        const n = VFX.playFor(key, {
          pos: new THREE.Vector3(pp.x, 0, pp.z),
          aim: new THREE.Vector3(pp.x, 0, pp.z + 5),
          dir: new THREE.Vector3(0, 0, 1),
          radius: (SKILLS[key] && SKILLS[key].radius) || 3,
          delay: 0
        });
        rows.push({
          key: key, lv: lv, n: n, delta: VFX.played - before,
          unknown: VFX.unknown.slice(),
          ops: VFX.lastBudget ? VFX.lastBudget.total : 0,
          tier: vfxRecipe(key, lv).tier
        });
        FX.clear();
      }
    }
    Game.skillLevel = orig;
    return rows;
  });
  {
    ok(sweep.length === 60, '一共 60 发（15 位 × 4 级）', sweep.length);
    const silent = sweep.filter(r => r.delta === 0);
    ok(silent.length === 0, '没有「一声不响」的配方（播放账都涨了）',
      silent.map(r => r.key + '@' + r.lv));
    const unk = [];
    for (const r of sweep) for (const u of r.unknown) unk.push(r.key + '@' + r.lv + ':' + u);
    ok(unk.length === 0, '没有不认识的指令', unk.slice(0, 5));
    /* 台阶记账对得上：1 级不吃档、5 级吃 5、9 级吃 5+9、10 级吃满 */
    const want = { 1: 0, 5: 5, 9: 9, 10: 10 };
    const bad = sweep.filter(r => r.tier !== want[r.lv]);
    ok(bad.length === 0, '每一发的台阶档位都对（Lv1 不吃档 / Lv10 吃满）',
      bad.map(r => r.key + '@' + r.lv + '→' + r.tier));
    const rows = {};
    for (const r of sweep) (rows[r.key] = rows[r.key] || {})[r.lv] = r.ops;
    const worse = Object.keys(rows).filter(k => rows[k][10] < rows[k][1]);
    ok(worse.length === 0, '满级的指令数不少于 1 级（升级不变素）', worse);
  }

  /* ---------------- 2. 三段剪影在浏览器里互不相同 ---------------- */
  console.log('二、三段台阶的剪影在浏览器里互不相同');
  const sigs = await p.evaluate(() => {
    /* 与 dev/test-skill-p5.js 的 sigOf 同一把尺子：只认「改剪影」的参数 */
    const opSig = op => {
      if (!op || !op.t) return '?';
      let s = op.t;
      if (op.tex) s += '/' + op.tex;
      if (op.t === 'arc') s += 'x' + (op.n || 1);
      if (op.t === 'vortex') s += 'h' + (op.helix || 1);
      if (op.t === 'cone' || op.t === 'decal') s += 'l' + (op.line || 1);
      if (op.at) s += '@';
      return s;
    };
    const sig = rec => {
      const seg = k => (rec[k] || []).map(opSig).join(',');
      return [rec.decal || '-', seg('cast'), seg('loop'), seg('impact')].join('|');
    };
    const out = {};
    for (const key of Object.keys(SKILL_VFX)) {
      out[key] = { 1: sig(vfxRecipe(key, 1)), 5: sig(vfxRecipe(key, 5)),
        9: sig(vfxRecipe(key, 9)), 10: sig(vfxRecipe(key, 10)) };
    }
    return out;
  });
  {
    const same = [];
    for (const key of Object.keys(sigs)) {
      const s = sigs[key];
      if (s[5] === s[1] || s[9] === s[5] || s[10] === s[9]) same.push([key, s[1], s[5], s[9], s[10]]);
    }
    ok(same.length === 0, '15 条剪影的三段台阶两两不同（45 套真的各不相同）', same);
  }

  /* ---------------- 3. `at` 真的会延迟 ---------------- */
  console.log('三、`at` 在真机上确实晚一点才画');
  {
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      /* 只数「半径 0.77」那一圈：游戏循环自己也会发环（刃势脉冲等），
       * 不按半径筛就会把别人的环算进来。radius=1 → k=0.77。 */
      const orig = FX.ring;
      let hits = 0;
      FX.ring = function (pos, rad, color, dur, w) {
        if (Math.abs(rad - 0.77) < 1e-6) hits++;
        return orig.call(FX, pos, rad, color, dur, w);
      };
      const rec = {
        sil: 'x', color: 0xffffff, tex: 'spark', decal: null,
        cast: [], loop: [],
        impact: [{ t: 'ring', r: 0.77 }, { t: 'ring', r: 0.77, at: 0.12 }]
      };
      FX.clear();
      hits = 0;
      const pp = Game.playerGroup.position;
      VFX.play(rec, { pos: pp.clone(), aim: pp.clone(), radius: 1, dir: null });
      const atOnce = hits;
      await wait(600);
      const after = hits;
      FX.ring = orig;
      return { atOnce: atOnce, after: after };
    });
    ok(r.atOnce === 1, '施法那一帧只画了 1 圈（`at` 的那圈还没出）', r.atOnce);
    ok(r.after === 2, '0.6 秒后两圈都画了（延迟的补上了）', r.after);
  }

  /* ---------------- 4. 换图作废 ---------------- */
  console.log('四、换图后延迟的特效不会砸到新地图上');
  {
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const orig = FX.ring;
      let hits = 0;
      FX.ring = function (pos, rad, color, dur, w) {
        if (Math.abs(rad - 0.66) < 1e-6) hits++;
        return orig.call(FX, pos, rad, color, dur, w);
      };
      const rec = {
        sil: 'x', color: 0xffffff, tex: 'spark', decal: null,
        cast: [], loop: [], impact: [{ t: 'ring', r: 0.66, at: 0.15 }]
      };
      FX.clear();
      hits = 0;
      const pp = Game.playerGroup.position;
      VFX.play(rec, { pos: pp.clone(), aim: pp.clone(), radius: 1, dir: null });
      Game.mapGen = (Game.mapGen || 0) + 1;     // 这一帧换图
      await wait(700);
      FX.ring = orig;
      return hits;
    });
    ok(r === 0, '换图后延迟的那一圈被作废（一次都没画）', r);
  }

  /* ---------------- 5. 按功能位解析 ---------------- */
  console.log('五、兄弟技能共用本位剪影');
  {
    const r = await p.evaluate(() => {
      const out = [];
      /* 道士 ② 位：符箭 / 万剑归宗 / 毒雾 —— 三只技能必须都拿到 `swordrain` 那条 */
      for (const id of ['talismanarrow', 'swordrain', 'poison']) {
        const rec = vfxRecipe(id, 9);
        out.push({ id: id, key: rec ? rec.key : null,
          budget: rec ? vfxBudget(rec).total : -1 });
      }
      /* 刀客 ② 位的五只技能同理 */
      const q = [];
      for (const id of (skillArchSlot('warrior', 2).inherit || [])) {
        const rec = vfxRecipe(id, 10);
        q.push({ id: id, key: rec ? rec.key : null });
      }
      return { tao2: out, war2: q };
    });
    ok(r.tao2.every(x => x.key === 'swordrain'), '道士 ② 的三只技能都解析到 swordrain',
      r.tao2);
    ok(new Set(r.tao2.map(x => x.budget)).size === 1, '它们拿到的是同一份配方（指令数一致）',
      r.tao2.map(x => x.budget));
    ok(r.war2.length >= 5 && r.war2.every(x => x.key === 'quake'),
      '刀客 ② 的 ' + r.war2.length + ' 只技能都解析到 quake', r.war2);
  }

  /* ---------------- 收尾 ---------------- */
  const bad = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(bad.length === 0, '全程零控制台报错', bad.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P5 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
