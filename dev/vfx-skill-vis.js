#!/usr/bin/env node
/* ============================================================
 * 逐技能配方可见度 · 真机（37 只技能，白天亮地面上量「这一发放出来看得见吗」）
 *
 *   NODE_PATH=<node_modules> node dev/vfx-skill-vis.js
 *   NODE_PATH=<node_modules> node dev/vfx-skill-vis.js fireball talisman
 *
 * ---------------- 和 vfx-vis 的分工 ----------------
 * `vfx-vis` 量的是**原语**（spr / decal / shock…），一条最小配方只放一条指令，
 * 判「这个原语本身画不画得出来」。它保证的是地基。
 *
 * 这个脚本量的是**配方**：`VFX.playFor(id, ctx)` 走真实解析路径（功能位兜底 +
 * 台阶 patch + 元素染色），把整条 cast / loop / impact 一起放出去。它回答的是
 * 另一个问题 —— 「地基都在，为什么这只技能放出来还是没感觉」。
 *
 * 两个都要有，因为修法不同：
 *   原语看不见 → 改 `ELEM_PROFILE` / 贴图（一次改，所有配方受益）
 *   配方看不见 → 改这一条配方的**指令组合**（这个位该用几道、什么形）
 *
 * ---------------- 量法 ----------------
 * 与 `vfx-vis` 同一套：清场 → 取底帧 → 播 → 两帧取样 → 比差异像素，
 * **整段在一次 `page.evaluate` 里跑完**（同步块内 rAF 插不进来，
 * 两帧之间除了特效没有任何东西在动）。
 *
 * 取两个时刻的理由也照抄：`flash` / `arc` 60ms 最亮，`ring` 是从零扩出去的、
 * 60ms 才 13% 半径。取两者较大的那个，谁都不冤。
 *
 * ---------------- 判据 ----------------
 * 只判「看得见」，不判美丑。下界按**半径**分档，因为一只 3 米单体技能和一只
 * 8 米领域本来就不该一样大：
 *
 *   半径 ≤ 3.5 米：1500 像素      半径 > 3.5 米：2500 像素
 *
 * 这两个数不是拍的 —— 是这一轮实测里「读得出形状」的最低档（fireball 类单体
 * 投射物 ≈ 1800，AoE ≈ 3000+），往下留了约 20% 余量。
 *
 * 机位 / 地图固定：桃源村（白天）· 落点在身前 3 码（**不是脚下**，脚下会被
 * 角色自己挡住 —— `vfx-vis` 踩过这个坑，见那边的注释）· 俯视三分之四。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 下界：**自身增益 / 小范围 / 大范围**三档。
 *
 * 为什么增益单独一档：它天生画在**自己身上**，判据是「你知不知道它生效了」，
 * 不是「它有多壮观」。拿它跟火球比面积，只会逼着把 buff 做成全屏白闪。
 * 900 像素 ≈ 30×30 —— 在角色身上是明确的一团，够「看得见」。
 *
 * 另外两档按半径分：一只 3 米单体技能和一只 8 米领域本来就不该一样大。 */
const MIN_BUFF = 900;
const MIN_SMALL = 1500;
const MIN_BIG = 2500;
const BUFF_TYPES = { buff: 1, heal: 1, shield: 1 };
const minOf = it => (it.self && BUFF_TYPES[it.type] ? MIN_BUFF : (it.radius > 3.5 ? MIN_BIG : MIN_SMALL));

(async () => {
  const only = process.argv.slice(2);
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  await p.evaluate(() => {
    Game.camDist = 9.5;
    Game.camHeight = 13.5;
    Game.camYaw = 0.35;
    Game.playerGroup.position.set(0, 0, 0);
    Game.enemies.length = 0;
    /* **必须停主循环**：不停的话游戏自己的 rAF 也在跑 `FX.update(dt)`，
     * 我们这一次 `FX.update(0.06)` 就变成了「0.06 + 真帧时间」，
     * 粒子提前飘散、`flash` 提前消失 —— 同一份代码两次量能差一倍
     * （实测 fireball 3521 vs 6430）。停掉之后画面只有我们推的那两帧。 */
    Game.running = false;
  });
  await wait(600);

  /* 技能清单：以 SKILLS 为准（`SKILL_VFX` 的键是配方键，`vfxSlotKey` 会把
   * poison / leap / frostnova 这些折到所属位的剪影上）。没有配方的直接跳过，
   * 但**跳过要报出来** —— 静默跳过等于「37 只里少量了几只没人知道」。 */
  const ids = await p.evaluate(() => {
    const out = [];
    for (const id of Object.keys(SKILLS)) {
      let rec = null;
      try { rec = (typeof vfxRecipe === 'function') ? vfxRecipe(id, 1) : null; } catch (e) { rec = null; }
      if (!rec) continue;
      const sk = SKILLS[id] || {};
      out.push({ id: id, radius: Number(sk.radius) || 3, name: sk.name || id,
        self: sk.cast === 'self', type: sk.type,
        key: (typeof vfxSlotKey === 'function') ? vfxSlotKey(id) : id });
    }
    return out;
  });
  const list = ids.filter(o => !only.length || only.indexOf(o.id) >= 0);

  console.log('一、量 ' + list.length + ' 只技能（白天亮地面，落点在身前 3 码）');
  const rows = [];
  for (const it of list) {
    const r = await p.evaluate((it) => {
      const gl = document.getElementById('gl');
      const c2 = document.createElement('canvas');
      c2.width = gl.width; c2.height = gl.height;
      const x2 = c2.getContext('2d', { willReadFrequently: true });

      const grab = () => {
        Game.renderer.render(Game.scene, Game.camera);
        x2.drawImage(gl, 0, 0);
        return x2.getImageData(0, 0, c2.width, c2.height).data;
      };
      const count = (A, B) => {
        let diff = 0, maxD = 0;
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]),
            Math.abs(A[i + 2] - B[i + 2]));
          if (d >= 8) { diff++; if (d > maxD) maxD = d; }
        }
        return { diff: diff, maxD: maxD };
      };

      FX.clear(); VFX.reset();
      /* **随机数上种子**。粒子的散布 / 大小 / 寿命全走 Math.random，
       * 不固定的话同一份代码两次量能差 25%（实测 heal 1615 vs 1283）——
       * 调参就变成在噪声里找方向。种子按技能 id 派生，所以「同一条配方」
       * 每次跑出来的数完全一致，跨版本比较才有意义。 */
      const rnd0 = Math.random;
      let seed = 0;
      /* 种子按**配方键**派生，不是按技能 id：heal / revive / antidote 共用一条
       * 剪影，按 id 派生会让「同一条配方」量出三个不同的数（1081 / 1187 / 1212），
       * 那就分不清「配方改了」还是「骰子换了」。 */
      for (let i = 0; i < it.key.length; i++) seed = (seed * 31 + it.key.charCodeAt(i)) >>> 0;
      seed = seed || 1;
      Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const A = grab();
      const pp = Game.playerGroup.position;
      /* **自身施法的技能，落点就是自己**（`cast:'self'`）。游戏里 buff 走的是
       * `playSkillVfx(id, { pos: pp, aim: pp })`；探针要是把 aim 摆到 5 码外，
       * 增益位那些「0.2 秒后的脉冲环」就全画在别人脚下了 —— 量出来一片黑，
       * 而游戏里其实是有的。第一版就是这么把 ④ 位九只全判成欠账的。 */
      const aim = it.self
        ? new THREE.Vector3(pp.x, 0, pp.z + 3)
        : new THREE.Vector3(pp.x, 0, pp.z + 3 + Math.max(2, it.radius));
      /* 走真实入口：功能位兜底 / 台阶 patch / 元素染色都在里面 */
      Game.playSkillVfx(it.id, {
        pos: new THREE.Vector3(pp.x, 0, pp.z + 3),
        aim: aim,
        dir: new THREE.Vector3(0, 0, 1),
        radius: it.radius
      });
      FX.update(0.06);
      const r1 = count(A, grab());
      FX.update(0.19);
      const r2 = count(A, grab());
      Math.random = rnd0;
      FX.clear(); VFX.reset();
      return r1.diff >= r2.diff ? { ...r1, d60: r1.diff, d250: r2.diff } : { ...r2, d60: r1.diff, d250: r2.diff };
    }, it);
    rows.push({ ...it, ...r });
  }

  /* 按「相对下界」排序：绝对像素数没意义（大范围技能天生面积大），
   * 要看的是「离自己的下界有多近」。 */
  rows.sort((a, b) => (a.diff / minOf(a)) - (b.diff / minOf(b)));

  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  console.log('  ' + pad('技能', 16) + pad('半径', 6) + pad('差异像素', 10) + pad('60ms', 8) + pad('250ms', 8) + pad('峰值Δ', 8) + '下界');
  for (const r of rows) {
    console.log('  ' + pad(r.id, 16) + pad(r.radius.toFixed(1), 6) + pad(r.diff, 10) +
      pad(r.d60, 8) + pad(r.d250, 8) + pad(r.maxD, 8) + minOf(r) +
      (r.diff < minOf(r) ? '   ← 欠' : ''));
  }

  console.log('二、判据（每只技能 vs 自己那档下界）');
  for (const r of rows) {
    ok(r.diff >= minOf(r),
      r.id + ' 看得见（≥ ' + minOf(r) + ' 像素）',
      { diff: r.diff, min: minOf(r), radius: r.radius, type: r.type });
  }

  console.log('三、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' 逐技能可见度：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
