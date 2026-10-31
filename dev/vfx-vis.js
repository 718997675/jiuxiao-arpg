#!/usr/bin/env node
/* ============================================================
 * 原语可见度体检 · 真机（白天亮地面上量「这一发到底画出来了几个像素」）
 *
 *   node dev/vfx-vis.js            # 全部原语
 *   node dev/vfx-vis.js spr decal  # 只量这几条
 *
 * ---------------- 为什么需要这个脚本 ----------------
 * V0 收口时记过一条观察：**在白天的桃源村地面上，粒子类特效几乎看不见**。
 * 当时是临时脚本量的（`arc` 1128 / `shock` 410 / `trail` 215 / `bolt` 90 /
 * `spr` 0~20 / `geyser` 2 / `vortex` 0 差异像素），量完脚本就丢了 ——
 * 于是「修没修好」只能靠人眼，而人眼在暗场景里会被骗（地牢里什么都好看）。
 *
 * 这个脚本把它变成**可复跑的数**：同一个机位、同一个落点、同一个原语，
 * 数「有这一发」与「没这一发」两帧之间变了多少个像素。
 *
 * ---------------- 为什么这次的能量是准的 ----------------
 * `vfx-shot.js` 明确说过「不比亮度」：两帧之间地形 / 水面 / 角色都在动，
 * 亮像素占比的抖动就有 ±0.03 个百分点，和一条 6 颗粒子的配方同量级。
 *
 * 这里的做法不同：**两次 render + 两次 getImageData 全在同一个同步块里**
 * （一次 `page.evaluate`）。同步块里 rAF 插不进来，所以两帧之间除了我们
 * 新加的特效，**什么都没变** —— 差异像素全部归因于特效本身。
 * 顺带也不受 `page.screenshot` 那几百毫秒的影响（刀光只活 0.2 秒，
 * 截图拍到的是「已经消失之后」，`vfx-shot` 为此刻意冻结了 `FX.update`）。
 *
 * ---------------- 判据 ----------------
 * 只判「看得见」，不判美丑：每个原语在亮地面上至少 **VIS_MIN** 个像素
 * 有明显变化（任一通道 |Δ| ≥ 8）。这个数是**下界**，不是目标值 ——
 * 过了下界也可能还是「一坨糊」，那要靠 `vfx-shot.js` 的截图人眼复核。
 *
 * 机位 / 地图固定：桃源村（白天）· 玩家站在空地中央 · 俯视三分之四。
 * 换地图量出来的数没有可比性，所以这里不提供 `--map` 参数。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 每个原语一条最小配方：只放这一条指令，别的都不放 ——
 * 混着量的话「spr 看不见」会被同一条配方里的 shock 盖住。 */
const RECIPES = {
  spr: { elem: 'fire', cast: [{ t: 'spr', n: 14 }] },
  trail: { elem: 'phys', cast: [{ t: 'trail' }] },
  bolt: { elem: 'lightning', cast: [{ t: 'bolt' }] },
  shock: { elem: 'phys', cast: [{ t: 'shock' }] },
  decal: { elem: 'fire', cast: [{ t: 'decal' }] },
  arc: { elem: 'phys', cast: [{ t: 'arc' }] },
  cone: { elem: 'fire', cast: [{ t: 'cone' }] },
  geyser: { elem: 'fire', cast: [{ t: 'geyser' }] },
  ring: { elem: 'fire', cast: [{ t: 'ring' }] },
  beam: { elem: 'fire', cast: [{ t: 'beam' }] },
  flash: { elem: 'phys', cast: [{ t: 'flash' }] },
  vortex: { elem: 'phys', cast: [{ t: 'vortex' }] }
};

/* 下界 = **实测值的一半**，四舍五入到好记的数。2026-10-31 实测（桃源村白天、
 * 落点在身前 3 码、无遮挡）：
 *
 *   spr 1042 · trail 7126 · bolt 874 · shock 15415 · decal 19868 · arc 13166
 *   cone 2572 · geyser 2631 · ring 2043 · beam 1029 · flash 28869 · vortex 676
 *
 * 为什么统一成 50%：上一版各条口径不一（`spr` 卡在实测的 86%、`trail` 只有 7%），
 * 于是「掉了一半」这件事在 trail 上根本不会红。判据只有一条 —— **掉一半就算回归**。
 * 留 50% 的余量是因为粒子分布是随机的，同一份代码两次跑差 ±15% 很正常。
 */
const VIS_MIN = {
  spr: 520, trail: 3500, bolt: 430, shock: 7700, decal: 9900,
  arc: 6500, cone: 1280, geyser: 1300, ring: 1000, beam: 510,
  flash: 14400, vortex: 340
};

(async () => {
  const only = process.argv.slice(2);
  const list = Object.keys(RECIPES).filter(k => !only.length || only.indexOf(k) >= 0);
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

  /* 固定机位 + 站到空地中央。和 vfx-shot 用同一套参数，两边的图可以直接对着看。 */
  await p.evaluate(() => {
    Game.camDist = 9.5;
    Game.camHeight = 13.5;
    Game.camYaw = 0.35;
    Game.playerGroup.position.set(0, 0, 0);
    /* 清场：怪站在落点旁边会挡住特效，也会被闪白 / 易伤之类的副作用改色 */
    Game.enemies.length = 0;
  });
  await wait(600);

  console.log('一、地图与机位');
  const env = await p.evaluate(() => ({
    map: (typeof Game.mapId !== 'undefined' ? Game.mapId : '?'),
    w: document.getElementById('gl').width,
    h: document.getElementById('gl').height
  }));
  ok(env.w > 0 && env.h > 0, '拿到画布尺寸 ' + env.w + '×' + env.h, env);

  console.log('二、逐原语量差异像素（白天亮地面）');
  const rows = [];
  for (const op of list) {
    /* 整段（清场 → 取样 → 播 → 取样 → 比差）在**一次 evaluate** 里跑完：
     * 同步块内 rAF 插不进来，两帧之间除了特效没有任何东西在动。 */
    const r = await p.evaluate((opName, recipe) => {
      const gl = document.getElementById('gl');
      const c2 = document.createElement('canvas');
      c2.width = gl.width; c2.height = gl.height;
      const x2 = c2.getContext('2d', { willReadFrequently: true });

      const grab = () => {
        Game.renderer.render(Game.scene, Game.camera);
        x2.drawImage(gl, 0, 0);
        return x2.getImageData(0, 0, c2.width, c2.height).data;
      };

      FX.clear(); VFX.reset();
      const A = grab();

      /* 落点放在**玩家身前 3 码**，不是脚下。
       *
       * 第一版把 `pos` 放在玩家原点，量出来的数是「原语 + 角色自己挡住的阴影」：
       * 粒子类（spr / cone / vortex）从脚底往上飘，一大半被自己的模型吃掉，
       * 于是 spr 只剩 177 像素；而 shock / decal / arc 走 `aim`（身前 5 码），
       * 全程无遮挡。同一个判据对两种原语差着三倍 —— 量到的不是原语，
       * 是「站在哪」。这跟「白天地面看不见」是两件事，混在一起就没法修了。
       *
       * 现在 pos / aim 都在角色身前，两者都无遮挡；dir 仍然成立（pos → aim）。 */
      const pp = Game.playerGroup.position;
      const aim = new THREE.Vector3(pp.x, 0, pp.z + 6);
      VFX.play(recipe, {
        pos: new THREE.Vector3(pp.x, 0, pp.z + 3),
        aim: aim, dir: new THREE.Vector3(0, 0, 1), radius: 3, delay: 0
      });
      /* 取**两个时刻**，各自和同一张底帧比，取较大的那个。
       *
       * 为什么必须两个：原语的寿命差一个数量级。`flash` / `arc` 是一闪就没，
       * 60ms 时最亮；而 `ring` 是**从零扩出去**的，60ms 时半径才 13%，
       * 量到 0 像素不代表它坏了（第一版就把它判成了红）。
       * 60ms = 起手最亮的那一刻，250ms = 扩开 / 飘散之后。 */
      const d1 = (() => {
        FX.update(0.06);
        const B = grab();
        return B;
      })();
      const d2 = (() => {
        FX.update(0.19);
        return grab();
      })();

      const count = (B) => {
        let diff = 0, maxD = 0, sumD = 0;
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]),
            Math.abs(A[i + 2] - B[i + 2]));
          if (d >= 8) { diff++; sumD += d; if (d > maxD) maxD = d; }
        }
        return { diff: diff, maxD: maxD, avgD: diff ? Math.round(sumD / diff) : 0 };
      };
      const r1 = count(d1), r2 = count(d2);
      const best = r1.diff >= r2.diff ? r1 : r2;
      FX.clear(); VFX.reset();
      return { ...best, diff60: r1.diff, diff250: r2.diff };
    }, op, RECIPES[op]);
    rows.push({ op: op, ...r });
  }

  const pad = s => (s + '          ').slice(0, 10);
  console.log('  原语      ' + pad('差异像素') + pad('60ms') + pad('250ms') + pad('峰值Δ') + '下界');
  for (const r of rows) {
    console.log('  ' + pad(r.op) + pad(String(r.diff)) + pad(String(r.diff60)) +
      pad(String(r.diff250)) + pad(String(r.maxD)) + VIS_MIN[r.op]);
  }

  console.log('三、判据（亮地面上「看得见」的下界）');
  for (const r of rows) {
    const min = VIS_MIN[r.op];
    ok(r.diff >= min,
      r.op + ' 在白天地面上看得见（≥ ' + min + ' 像素）',
      { diff: r.diff, min: min, maxD: r.maxD });
  }

  console.log('四、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' 原语可见度：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
