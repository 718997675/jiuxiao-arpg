#!/usr/bin/env node
/* ============================================================
 * 剪影截图 · 真机（15 条配方各一张）
 *
 *   NODE_PATH=<node_modules> node dev/vfx-shot.js
 *   NODE_PATH=<node_modules> node dev/vfx-shot.js whirl meteor   # 只截这几条
 *
 * 产出：`shots/vfx/<技能id>.png`（起手）+ `<技能id>-late.png`（收势）+ `_base.png`。
 * 用途是**人眼复核**：配方写得对不对、剪影分不分得开，只能靠看。
 * 所以这里**不判美丑**，只判能量的事：
 *
 *   1. 每条配方都真的往场景里放了东西（部件数 > 0，不是「播了但没画」）
 *   2. 放进去的部件**看得见**：`visible` 为真
 *   3. 部件**画在落点附近**（水平距离不超过半径的 5 倍 + 25 米）——
 *      坐标算错时会全部堆在原点，画面上是「技能没反应」
 *   4. 没有不认识的指令（`VFX.unknown` 空 —— 打错字在游戏里表现是「没特效」，
 *      不报错，最难查，所以必须由脚本兜住）
 *   5. 全程零控制台报错
 *
 * **为什么一张技能要两帧**：三段式的寿命差一个数量级。刀光（`arc`）0.2 秒就没了，
 * 火墙（`cone` loop）能烧 1 秒。只截 180ms 那一帧的话，刀客那几条全是空画面
 * （实测 whirl 只拍到脚下一圈白环）；只截 60ms 又拍不到收势的冲击波。
 * 所以取「起手 80ms」+「收势 320ms」两张，人眼对一遍就知道剪影对不对。
 *
 * **为什么不比亮度**：试过。同一机位连拍两张，亮像素占比的波动就有 ±0.03 个
 * 百分点（地形 / 水面每帧在动），而一条只有 6 颗粒子的配方带来的差异也是这个量级 ——
 * 那等于掷骰子。亮度只作为**参考值打印**，不判红。
 *
 * 机位固定成**俯视一点的三分之四视角**（`camDist` / `camHeight` 直接改，
 * 不去抢主循环的相机 —— 抢了会被下一帧覆盖，截图就拍到别的角度）。
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
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 两帧的时机。`EARLY` 是粒子刚散开、刀光还亮着的位置；
 * `LATE` 是收势 —— 冲击环扩到边缘、领域已经铺开。 */
const EARLY = 80;
const LATE = 320;

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

  const shotDir = path.resolve(__dirname, '..', 'shots', 'vfx');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });

  /* 固定机位 + 把玩家摆到空地中央，免得特效一半埋在建筑里 */
  const ids = await p.evaluate(() => {
    Game.camDist = 9.5;
    Game.camHeight = 13.5;
    Game.camYaw = 0.35;
    const pp = Game.playerGroup.position;
    pp.set(0, 0, 0);
    return Object.keys(SKILL_VFX);
  });
  await wait(600);

  const canvas = await p.$('#gl');
  const list = only.length ? ids.filter(x => only.indexOf(x) >= 0) : ids;

  /* 采样器：同步「渲染一帧 → 拷进 2D 画布 → 数亮像素」。
   * 必须在同一个同步块里 render 再 drawImage —— WebGL 的绘制缓冲在帧
   * 呈现后就被清了，隔一拍再拷只会拿到一张空白（实测过）。
   * 结果只作**参考值打印**，不判红（见文件头「为什么不比亮度」）。 */
  const SAMPLE_SRC = `(() => {
    Game.renderer.render(Game.scene, Game.camera);
    const gl = document.getElementById('gl');
    const c2 = document.createElement('canvas');
    c2.width = 200; c2.height = 132;
    const x = c2.getContext('2d');
    x.drawImage(gl, 0, 0, c2.width, c2.height);
    const d = x.getImageData(0, 0, c2.width, c2.height).data;
    let hot = 0, sum = 0;
    const total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1;
      sum += l;
      if (l > 150) hot++;
    }
    return { hot: hot / total, mean: sum / total };
  })()`;

  console.log('一、空场景基线');
  await p.evaluate(() => { FX.clear(); VFX.reset(); });
  await wait(LATE);
  const basePath = path.join(shotDir, '_base.png');
  await canvas.screenshot({ path: basePath });
  const baseShot = fs.statSync(basePath).size;
  ok(baseShot > 6000, '基线帧不是空白画面（PNG ' + baseShot + ' B）', baseShot);

  console.log('二、逐条截剪影（' + list.length + ' 条）');
  const rows = [];
  for (const id of list) {
    /* 量「这一发新加了哪些对象」：先拍一张场景快照，播完再看新增的那批。
     * 贴花是**池化复用**的（16 个 quad 建一次，之后只改位置），所以它在
     * 「新增」里数不到 —— 那部分由 FXK.stats().decalOn 兜住。 */
    const r = await p.evaluate((sid) => {
      FX.clear();
      VFX.reset();
      const sk = SKILLS[sid] || {};
      const pp = Game.playerGroup.position;
      const dir = new THREE.Vector3(0, 0, 1);
      const aim = new THREE.Vector3(pp.x, 0, pp.z + Math.min(7, (sk.castRange || 6)));
      const radius = sk.radius || 3;
      const seen = new Set(Game.scene.children);
      const n = VFX.playFor(sid, {
        pos: new THREE.Vector3(pp.x, 0, pp.z),
        aim: aim, dir: dir, radius: radius,
        /* delay 归零：起手与命中挤在同一帧，截图才能一张拍到全部段 */
        delay: 0
      });
      /* 新加的对象留个引用，等 `EARLY` 之后再查可见性 —— 不少领域 / 光柱
       * 是「出生时 opacity 0，逐帧淡入」的，出生那一刻查会全是假红。 */
      window.__vfxAdded = Game.scene.children.filter(o => !seen.has(o));
      window.__vfxAim = { x: aim.x, z: aim.z, r: radius };
      const st = FXK.stats();
      return {
        n: n, unknown: VFX.unknown.slice(), added: window.__vfxAdded.length,
        parts: st.parts + st.trails + st.bolts + st.shocks + st.decalOn,
        zones: FX.zones.length
      };
    }, id);
    await wait(EARLY);
    /* **截图前必须先冻结特效**。`page.screenshot` 要几百毫秒才拿到一帧，
     * 而刀光（`arc`）只活 0.2 秒 —— 不冻结的话拍到的是「已经消失之后」，
     * 表现就是「配方明明有 3 个部件，图上一片空白」（实测 whirl 就这样）。
     * 冻结只掐 `FX.update`，主循环照跑，所以相机 / 水面还在动，画面不会僵。 */
    await p.evaluate(() => {
      if (!window.__fxUpdate) window.__fxUpdate = FX.update;
      FX.update = function () { };
    });
    const litA = await p.evaluate(SAMPLE_SRC);
    /* 起手那一帧的体检：这一发新加的东西，此刻是不是真的看得见、画在落点附近。
     * **贴花池要排除**：`FXK.decal` 是 16 个 quad 建一次、循环复用，
     * 没用到的那些天生 `visible = false` / 材质是模板 —— 它们是池的内部状态，
     * 不是「这一发没画出来」。第一次用到贴花时整池会一起进场景，
     * 不排除的话每条带贴花的配方都会假红。 */
    const look = await p.evaluate(() => {
      const pool = new Set(((typeof FXK !== 'undefined' && FXK.decals) || []).map(d => d.mesh));
      const list = (window.__vfxAdded || []).filter(o => !pool.has(o));
      const a = window.__vfxAim || { x: 0, z: 0, r: 3 };
      const hidden = list.filter(o => o.visible === false).length;
      const dimList = list.filter(o => o.material && o.material.opacity === 0);
      const far = list.filter(o => {
        const dx = o.position.x - a.x, dz = o.position.z - a.z;
        return Math.sqrt(dx * dx + dz * dz) > a.r * 5 + 25;
      }).length;
      return {
        hidden: hidden, dim: dimList.length, far: far,
        /* 哪一类部件在偷懒 —— 报类型比报个数好查得多 */
        dimTypes: dimList.map(o => o.type + (o.material ? ':' + o.material.type : ''))
      };
    });
    const fileA = path.join(shotDir, id + '.png');
    await canvas.screenshot({ path: fileA });
    const sizeA = fs.statSync(fileA).size;
    /* 收势那一帧：冲击环扩到边、领域铺开。只截不判 —— 它本来就是给眼睛看的。 */
    await p.evaluate(() => { FX.update = window.__fxUpdate; });
    await wait(LATE - EARLY);
    await p.evaluate(() => {
      if (!window.__fxUpdate) window.__fxUpdate = FX.update;
      FX.update = function () { };
    });
    const litB = await p.evaluate(SAMPLE_SRC);
    const fileB = path.join(shotDir, id + '-late.png');
    await canvas.screenshot({ path: fileB });
    const sizeB = fs.statSync(fileB).size;
    await p.evaluate(() => { FX.update = window.__fxUpdate; });
    rows.push({
      id: id, n: r.n, parts: r.parts, zones: r.zones, added: r.added,
      size: sizeA, sizeB: sizeB, hot: litA.hot, hotB: litB.hot
    });

    ok(r.parts + r.zones > 0, id + ' 真的往场景里放了部件（不是「播了但没画」）',
      { parts: r.parts, zones: r.zones });
    ok(look.hidden === 0, id + ' 起手那一刻没有 invisible 的部件', look);
    /* **不判 `opacity === 0`**：短命部件（`flash` 0.12 秒）这时可能已经淡完、
     * 还没被回收，那是正常生命周期，不是「白画」。出生那一刻查也没用 ——
     * 领域 / 光柱是「opacity 0 淡入」的。所以只把 `dimTypes` 打进失败信息供人看。 */
    ok(look.far === 0, id + ' 部件都画在落点附近（没有全堆在原点）', look);
    ok(r.unknown.length === 0, id + ' 没有不认识的指令', r.unknown);
  }

  console.log('');
  console.log('技能'.padEnd(16), '指令', '部件', '领域', '新增对象', '亮像素%(起手/收势)', 'PNG 起手/收势');
  for (const x of rows) {
    console.log(String(x.id).padEnd(16), String(x.n).padStart(4),
      String(x.parts).padStart(5), String(x.zones).padStart(5),
      String(x.added === undefined ? '' : x.added).padStart(8),
      ((x.hot * 100).toFixed(2) + ' / ' + (x.hotB * 100).toFixed(2)).padStart(18),
      (String(x.size) + ' / ' + String(x.sizeB)).padStart(14));
  }
  console.log('\n截图目录：' + shotDir);

  console.log('\n三、控制台');
  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(errs2.length === 0, '全程零控制台报错', errs2.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 剪影截图：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
