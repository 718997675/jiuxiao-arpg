#!/usr/bin/env node
/* ============================================================
 * 逐技能可见度 · 真机（37 只技能，白天亮地面上量「这一发放出来看得见吗」）
 *
 *   NODE_PATH=<node_modules> node dev/vfx-skill-vis.js                 # 默认：配方层
 *   NODE_PATH=<node_modules> node dev/vfx-skill-vis.js --live          # 真实链路（判据）
 *   NODE_PATH=<node_modules> node dev/vfx-skill-vis.js fireball talisman
 *
 * ---------------- 两种模式（B20 之后必须分开量） ----------------
 * `74d8025` 给玩家侧加了 `src/sfx.js`：`playSkillVfx` 现在是 **SKFX 手搓实现
 * 优先、有就不播配方**（37 只全有），只有没手搓实现的技能才回落到 data-vfx。
 * 于是「量这只技能」变成两个不同的问题：
 *
 *   默认（配方层）  绕过 SKFX，直接 `VFX.playFor`，只推进 FX，判据用三档下界。
 *                   保住回落路径 + 15 位剪影这把尺子 —— V2/V3 修的全在配方层，
 *                   不能因为新演出层抢了前排就把它扔了。它也是本脚本的**判据**。
 *   --live（判据）  走 `Game.playSkillVfx`，FX 与 SKFX 同时推进，回答玩家眼睛
 *                   真正收到什么。U1 实测过「要不要给 SKFX 单独定一档更松的下界」，
 *                   结论是**不要**：两层画在同一块视口、同一机位，看得见就是
 *                   看得见，按层打折没有依据（证据见下方常量处的 37 只比值）。
 *                   `--live` 直接沿用 MIN_*，判据为零异常 / 零空招 / 每只 ≥ 下界。
 *
 * 第一次撞上这件事时，探针只推 `FX.update`，SKFX 的粒子永远停在第 0 帧：
 * 10 只技能量出 `diff = 0`，看着像大规模回归，其实是**尺子过期**。
 * 这和前面两次坑是同一类（V2 落点量到角色身上、V3 主循环没停）：
 * 先确认量的是谁，再谈数字涨跌。
 *
 * ---------------- 和 vfx-vis 的分工 ----------------
 * `vfx-vis` 量**原语**（一条最小配方只放一条指令），保证地基；
 * 这个脚本量**整只技能**，回答「地基都在，为什么放出来还是没感觉」。
 * 修法不同：原语看不见 → 改 `ELEM_PROFILE` / 贴图；整只看不见 → 改指令组合。
 *
 * ---------------- 量法 ----------------
 * 清场 → 取底帧 → 播 → 多帧取样 → 比差异像素，**整段在一次 `page.evaluate`
 * 同步块里跑完**（rAF 插不进来，两帧之间除了特效没有任何东西在动）。
 * 取 60 / 250 / 600ms 三个时刻的最大值：`flash` / `arc` 在 60ms 最亮，
 * `ring` 是从零扩出去的、60ms 才 13% 半径，SKFX 的自带 seq 更晚。
 *
 * ---------------- 判据 ----------------
 * 只判「看得见」，不判美丑。下界分三档（见下方常量）：自身增益画在自己身上，
 * 判据是「你知不知道它生效了」，拿它跟火球比面积只会逼出全屏白闪。
 *
 * 机位 / 地图固定：桃源村（白天）· 俯视三分之四。
 * 落点分两种，跟着技能自己的施法方式走：**自身增益落在脚下**（含角色遮挡，
 * 那才是玩家看到的），**指向性技能落在身前 3 码**（脚下会被角色挡住，
 * `vfx-vis` 踩过这个坑）。
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

/* ---------------- U1 · SKFX 要不要自己的下界？不要。 ----------------
 *
 * 曾经拍过一版 `SFX_MIN_* = MIN_* × 60%`（540 / 900 / 1500），注释还写着
 * 「实测中位比 0.58~0.64」。把 37 只两层读数逐只配对比一遍，那句话不成立：
 *
 *   SKFX / 配方：min 0.166（swordrain）· p25 0.466 · 中位 1.003（fireball）
 *                · p75 2.170 · max 6.514（judgement / mastersigil）
 *   15 只 < 0.6，14 只 > 1.5 —— 跨 39 倍，根本不存在一个可套的「同档比例」。
 *   手搓层不是「更收敛」，是**另一种画法**：解毒 / 太极 / 法印比配方夸张 5~6 倍，
 *   剑雨 / 法相 / 治疗反而只有配方的 1/5。
 *
 * 而且两层渲染的是**同一块 1000×660 视口、同一机位**，玩家眼睛收到的
 * 「看得见」是绝对像素量，不会因为这一笔是手搓就打折。按当前这批读数去
 * 反推一个能全绿的比例，等于把尺子绑在被量对象上 —— 这就是为了绿灯倒推尺子。
 *
 * 所以 U1 的定法是：`--live` **直接沿用 MIN_***，不另设 SFX_MIN_*。
 * 结果不是放宽，是收紧（buff 540→900 / 小范围 900→1500 / 大范围 1500→2500），
 * 于是 6 只偏淡技能必须真的补视觉才能过线（见 U1-3）。
 *
 * 唯一保留的不对称：`--live` 多采 600ms 一帧。SKFX 的 seq 常在 0.3 秒后才
 * 开场，配方层的下界是在 60/250ms 两时刻量法上定的；多这一帧是补演出层的
 * 起步时差，不是给面积放水。配方层保持两帧不动，历史读数才可比。
 *
 * 下界是**地板不是目标值**：过了只说明「玩家收得到」，好不好看归 U6。 */

(async () => {
  const argv = process.argv.slice(2);
  /* 默认量配方层；`--live` 切到真实链路。`--recipe` 留作显式别名。 */
  const live = argv.indexOf('--live') >= 0;
  const recipeOnly = !live;
  const only = argv.filter(a => a.indexOf('--') !== 0);
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

  console.log('一、量 ' + list.length + ' 只技能 · ' + (recipeOnly ? '配方层（默认，绕过 SKFX）' : '真实链路 --live（FX + SKFX 同推进）') +
    ' · 白天亮地面；增益落在脚下，指向性落在身前 3 码');
  const rows = [];

  /* ---------------- 冷启动暖机（U1） ----------------
   * 全量首只 iceshard 会在 1401 / 1460 / 1600 / 1897 之间跳（种子固定、
   * 配方层一行没动），差 30%，远超 ±5% 的 GPU 浮动；它又恰好最贴 1500 下界，
   * 于是偶发假红。正式计量前先用同一只技能把材质 / shader 过一遍并清场：
   * 实测「暖机 + finish()」连跑三次全量稳定在 1604~1607、39/0。
   * 取样时刻、判据下界、随机数种子一律不动，暖机结果直接丢弃。 */
  if (list.length) {
    await p.evaluate((it, recipeOnly) => {
      const pp = Game.playerGroup.position;
      const aim = new THREE.Vector3(pp.x, 0, pp.z + 3 + Math.max(2, it.radius));
      const ctx = {
        pos: new THREE.Vector3(pp.x, 0, pp.z + 3), aim: aim,
        dir: new THREE.Vector3(0, 0, 1), radius: it.radius
      };
      if (recipeOnly) VFX.playFor(it.id, ctx); else Game.playSkillVfx(it.id, ctx);
      for (let i = 0; i < 8; i++) {
        FX.update(0.04);
        Game.renderer.render(Game.scene, Game.camera);
      }
      FX.clear(); VFX.reset();
      if (typeof SKFX !== 'undefined' && SKFX && typeof SKFX.clear === 'function') SKFX.clear();
    }, list[0], recipeOnly);
  }

  for (const it of list) {
    const r = await p.evaluate((it, recipeOnly) => {
      const gl = document.getElementById('gl');
      const c2 = document.createElement('canvas');
      c2.width = gl.width; c2.height = gl.height;
      const x2 = c2.getContext('2d', { willReadFrequently: true });

      const grab = () => {
        Game.renderer.render(Game.scene, Game.camera);
        /* **渲染必须 flush 完再读**（U1）：SwiftShader 下 `drawImage(gl)` 可能
         * 拿到命令队列还没画完的帧。配合上面的暖机轮，全量连跑三次稳定
         * 1604~1607；单独去掉任一个都会偶发 1401~1460 的假红（iceshard）。
         * `finish()` 只保证读到完整那一帧，取样时刻与判据下界都不变。
         * 仍存在的差异：单跑一只（1908）比全量第一只（1605）高约 300 像素，
         * 属浏览器进程状态差异，看「过 / 不过」不看绝对数。 */
        Game.renderer.getContext().finish();
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

      /* **两条演出层都要清、都要推**。SKFX 的 mesh 挂在自己的 Group 下，
       * `FX.clear()` 碰不到它；不清的话上一只技能的残留会算进这一只的底帧。
       * SKFX 也没有 rAF 自理（主循环被我们停了），不推 `update` 就永远停在
       * 第 0 帧 —— 第一次跑出来 10 只 `diff = 0` 就是这个原因。 */
      const hasSfx = typeof SKFX !== 'undefined' && SKFX && typeof SKFX.update === 'function';
      const wipe = () => {
        FX.clear(); VFX.reset();
        if (hasSfx) SKFX.clear();
      };
      const step = (t) => {
        /* `--recipe` 沿用旧量法（FX.update 单步），这样配方层的数字和 V2/V3
         * 的历史读数可比。配方层不播 SKFX，拆步没有意义。 */
        if (recipeOnly) { FX.update(t); return; }
        /* **不要再单独调 SKFX.update**：`FX.update` 内部已经调了（fx.js:1210），
         * 再推一次是双倍时间轴。
         *
         * 但 SKFX 的 update 把 dt 夹到 0.05（`Math.min(0.05, raw)`）—— 一次喂
         * 0.35 只走 0.05，三步加起来才 0.15 秒，带 delay / seq 的招根本还没开场，
         * 量出来就是 `diff = 0`。所以把 **FX.update 本身**拆成 ≤0.04 的小步：
         * 两家拿到的累计时间相同，SFX 也不会被夹。 */
        let left = t;
        while (left > 0.0001) {
          const d = Math.min(0.04, left);
          /* 玩家侧演出每帧靠 sync 拿锚点；主循环停了，只能我们喂 */
          if (hasSfx && typeof SKFX.sync === 'function') {
            SKFX.sync(Game.playerGroup.position, 0, Game.enemies, Game.playerGroup, null);
          }
          FX.update(d);
          left -= d;
        }
      };
      wipe();

      /* **随机数上种子**。粒子的散布 / 大小 / 寿命全走 Math.random，
       * 不固定的话同一份代码两次量能差 25%（实测 heal 1615 vs 1283）——
       * 调参就变成在噪声里找方向。种子按配方键派生，所以「同一条配方」
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
      /* **自身施法的技能，落点就是脚下**（`cast:'self'`），和游戏里
       * `playSkillVfx(id, { pos: pp, aim: pp })` 完全一致。
       *
       * 这里踩过两次坑，两次都是「量到的不是特效，是站在哪」：
       * ① aim 摆到 5 码外 → 增益位那些「0.2 秒后的脉冲环」全画在别人脚下，
       *    量出来一片黑，④ 位九只全被判成欠账；
       * ② pos 也摆到身前 3 码 → 量的是**空地**上的读数，比游戏里高一大截
       *    （角色挡不住），于是「数字过线了但画面上还是看不见」。
       * 现在 pos / aim 都跟着 `self` 走：脚下的读数**包含角色自己的遮挡**，
       * 那才是玩家眼睛收到的东西。 */
      const base = it.self ? pp.z : pp.z + 3;
      const aim = it.self
        ? new THREE.Vector3(pp.x, 0, base)
        : new THREE.Vector3(pp.x, 0, base + Math.max(2, it.radius));
      const ctx = {
        pos: new THREE.Vector3(pp.x, 0, base),
        aim: aim,
        dir: new THREE.Vector3(0, 0, 1),
        radius: it.radius
      };
      /* 默认走真实入口（功能位兜底 / 台阶 patch / 元素染色 / SKFX 优先都在里面）；
       * `--recipe` 显式绕过 SKFX，量配方层自己的可见度。
       *
       * `played` / `afterPlay` 是给 `--dbg` 用的：量出 0 像素时，先分清
       * 「统一播放口没让它播」和「播了但一个像素没画出来」—— 两种修法完全相反。 */
      const played = recipeOnly ? VFX.playFor(it.id, ctx) : Game.playSkillVfx(it.id, ctx);
      const afterPlay = (hasSfx && typeof SKFX.stats === 'function') ? SKFX.stats() : null;

      /* 单只技能的 updater 抛错不能让整轮崩 —— 记下来，作为一条独立判据。
       * （第一次跑全量就是被 quake 的 `hits.forEach` 打断的。） */
      let r1 = { diff: 0, maxD: 0 }, r2 = r1, r3 = r1, err = null;
      const dbgs = [];
      const snap = () => ({
        live: (hasSfx && typeof SKFX.stats === 'function') ? SKFX.stats() : null,
        kids: (hasSfx && SKFX.scene) ? SKFX.scene.children.length : null,
        vis: (hasSfx && SKFX.scene) ? SKFX.scene.children.filter(x => x.visible).length : null
      });
      try {
        step(0.06); r1 = count(A, grab()); dbgs.push([0.06, r1.diff, snap()]);
        step(0.19); r2 = count(A, grab()); dbgs.push([0.25, r2.diff, snap()]);
        /* 第三帧只给 `--live`：SKFX 的 seq 常常 0.3 秒后才开场。
         * 配方层的三档下界是在**两时刻**量法上定的，多采一帧会让读数普涨、
         * 悄悄把判据撑松 —— 所以这边沿用 60 / 250ms，数字与 V2/V3 可比。 */
        if (!recipeOnly) { step(0.35); r3 = count(A, grab()); dbgs.push([0.60, r3.diff, snap()]); }
      } catch (e) { err = String((e && e.message) || e); }
      Math.random = rnd0;
      wipe();
      const best = [r1, r2, r3].reduce((a, b) => (b.diff > a.diff ? b : a));
      return {
        diff: best.diff,
        maxD: Math.max(r1.maxD, r2.maxD, r3.maxD),
        d60: r1.diff, d250: r2.diff, d600: r3.diff,
        err: err,
        played: played, afterPlay: afterPlay, dbgs: dbgs,
        layer: recipeOnly ? '配方' : ((hasSfx && typeof SKFX.has === 'function' && SKFX.has(it.id)) ? 'SKFX' : '配方兜底')
      };
    }, it, recipeOnly);
    rows.push({ ...it, ...r });
  }

  /* 按「相对下界」排序：绝对像素数没意义（大范围技能天生面积大），
   * 要看的是「离自己的下界有多近」。 */
  rows.sort((a, b) => (a.diff / minOf(a)) - (b.diff / minOf(b)));

  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  console.log('  ' + pad('技能', 16) + pad('半径', 6) + pad('差异像素', 10) + pad('60ms', 8) +
    pad('250ms', 8) + pad('600ms', 8) + pad('峰值Δ', 8) + pad('下界', 7) + pad('演出层', 12) + '');
  for (const r of rows) {
    console.log('  ' + pad(r.id, 16) + pad(r.radius.toFixed(1), 6) + pad(r.diff, 10) +
      pad(r.d60, 8) + pad(r.d250, 8) + pad(recipeOnly ? '-' : r.d600, 8) + pad(r.maxD, 8) +
      pad(minOf(r), 7) + pad(r.layer, 12) +
      (r.err ? '  抛错: ' + r.err : (r.diff < minOf(r) ? '  ← 欠' : '')));
  }

  if (argv.indexOf('--dbg') >= 0) {
    console.log('  --dbg · 零像素 / 偏淡的播放明细（played = 统一播放口返回值，after = 播完瞬间 SKFX 状态）');
    for (const r of rows.filter(x => x.diff < minOf(x))) {
      console.log('    ' + pad(r.id, 16) + ' diff=' + pad(r.diff, 7) +
        ' played=' + pad(r.played, 4) + ' after=' + JSON.stringify(r.afterPlay) +
        ' snaps=' + JSON.stringify(r.dbgs) + (r.err ? ' err=' + r.err : ''));
    }
  }

  console.log('二、判据（' + (live
    ? '真实链路：零空招 + 零异常 + 每只 ≥ 下界（与配方层同一把尺子）'
    : '每只技能 vs 自己那档配方层下界') + '）');
  for (const r of rows) {
    if (live) {
      ok(!r.err, r.id + ' 推进不抛错', { err: r.err, diff: r.diff });
      ok(r.diff > 0, r.id + ' 不是空招（有差异像素）', { diff: r.diff, played: r.played });
      ok(r.diff >= minOf(r),
        r.id + ' 看得见（≥ ' + minOf(r) + ' 像素）',
        { diff: r.diff, min: minOf(r), radius: r.radius, type: r.type });
    } else {
      ok(r.diff >= minOf(r),
        r.id + ' 看得见（≥ ' + minOf(r) + ' 像素）',
        { diff: r.diff, min: minOf(r), radius: r.radius, type: r.type });
    }
  }
  const thrown = rows.filter(r => r.err);
  ok(thrown.length === 0, '推进零异常（updater 队列里没有半路抛错）',
    thrown.map(r => r.id + ': ' + r.err));
  if (live) {
    /* 不再有「SKFX 专用下界」这条更松的线，也就没有「卡在两条线之间」的观察项。
     * 改成把**离地板最近**的 6 只列出来：过了线只说明收得到，好不好看归 U6，
     * 这串是 U6 逐条打磨该优先看的顺序，不参与判死。 */
    const near = rows.slice().sort((a, b) => (a.diff / minOf(a)) - (b.diff / minOf(b))).slice(0, 6);
    console.log('  · 观察 · 离下界最近（U6 逐条打磨的优先顺序，不判死）：\n    ' +
      near.map(r => r.id + ' ' + r.diff + '（' + (r.diff / minOf(r)).toFixed(2) + '× 下界）').join(' · '));
  }

  console.log('三、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' 逐技能可见度：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
