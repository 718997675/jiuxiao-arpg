#!/usr/bin/env node
/* ============================================================
 * dev/build-fx2.js —— 从特效台抽出 BFX，生成 src/fx2.js
 *
 *   为什么是「生成」而不是「手抄一份」：
 *   BFX 这 17 个原语是在 `docs/boss-vfx-playground.html` 里调出来的，
 *   形状对不对全靠那边 51 只 Boss 真放一遍看。手抄一份进 src/ 之后，
 *   两边一定会走散（改了一边、另一边还是老样子，而且没人会发现）。
 *   所以：**特效台是唯一的源**，`src/fx2.js` 是生成物，跟 §7.3 的表格同一个规矩。
 *
 *   改 BFX 的流程：改特效台 → 在特效台里看对了 → 跑本脚本 --write → 提交两个文件。
 *
 * 用法：
 *   node dev/build-fx2.js            # 打印（默认，不写文件）
 *   node dev/build-fx2.js --check    # 只检查 src/fx2.js 是否已过期（过期退出码 1）
 *   node dev/build-fx2.js --write    # 重写 src/fx2.js
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'boss-vfx-playground.html');
const OUT = path.join(ROOT, 'src', 'fx2.js');

/* ---------------- 切片表 ----------------
 * 行号是**唯一的脆弱点**：特效台前面插一行，这里就全错。
 * 所以切片不靠行号，靠**字符串锚点**（见 CUTS 的 from/to），
 * 锚点找不到就直接报错退出，绝不生成半截文件。 */
const CUTS = [
  {
    name: '贴图',
    from: 'function cv(w, h, draw){',
    to: '/* ===== 20-core.js ===== */',   // 不含
  },
  {
    name: '粒子池',
    from: 'const U = { scale: { value: 400 } };',
    to: '/* =====================================================================\n   3. 时间 / 更新队列 / 贴片',
  },
  {
    name: '贴片工具',
    from: 'const _plane = new THREE.PlaneGeometry(1, 1);',
    to: '/* =====================================================================\n   4. 屏幕反馈',
  },
  {
    name: 'BFX 原语',
    from: 'const BFX = {};',
    to: '/* ---------- 6.11 判定可视化（叠加层）',
  },
  {
    name: '形状归一',
    from: 'function normShape(h){',
    to: 'function inHit(hit, px, pz){',
  },
];

function slice(src, cut) {
  const i = src.indexOf(cut.from);
  if (i < 0) throw new Error('找不到起点锚点（' + cut.name + '）：' + cut.from.split('\n')[0]);
  const j = src.indexOf(cut.to, i);
  if (j < 0) throw new Error('找不到终点锚点（' + cut.name + '）：' + cut.to.split('\n')[0]);
  const body = src.slice(i, j).replace(/\s+$/, '');
  /* 舞台相关的三处耦合，机械替换掉 —— 每一处都在下面返回的 API 里有对应口子 */
  return body
    .replace(/DUMMY\.pos/g, 'ACT.player.pos')
    .replace(/BOSS\.pos/g, 'ACT.boss.pos')
    .replace(
      'function updatePointScale(){ U.scale.value = renderer.domElement.height * 0.5; }',
      'function updatePointScale(){ U.scale.value = (renderer ? renderer.domElement.height : 800) * 0.5; }'
    );
}

const HEAD = `/* ============================================================
 * FX2 —— 怪物侧演出原语层（BFX 18 个）
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = \`docs/boss-vfx-playground.html\`（那边有 51 只 Boss 可以真放一遍看效果）
 *   重新生成：\`node dev/build-fx2.js --write\`；只检查是否过期：\`--check\`
 *
 * ---------------- 为什么单独一个文件，不并进 fx.js / fx-kit.js ----------------
 * 三层各管一件事，混在一起改一处炸两处：
 *   fx.js      —— 玩家的「一次性」效果（环 / 闪 / 爆点 / 投射物 / 伤害数字）
 *   fx-kit.js  —— 玩家的「成片」效果（贴图粒子 / 拖尾 / 闪电 / 冲击波 / 贴花）
 *   fx2.js     —— **怪物侧**的「读得出形状」效果：形状即判定，
 *                 并且有 5 个「活物」原语（trail / entity / pool / beam / wall），
 *                 会走路、会追人、会被打断 —— 前两层都没有生命周期语义。
 *
 * ---------------- 宿主怎么接（只有四件事） ----------------
 *   FX2.bind(scene, camera, renderer)   开局一次
 *   FX2.update(dt)                      每帧（dt 是**秒**，内部夹到 0.05）
 *   FX2.clear()                         换图 / 重开
 *   FX2.actors.boss.pos / .player.pos   每帧同步两只的位置（beam / entity 的默认目标）
 *   FX2.shake = (amp, dur) => {}        可选：把屏幕震动接给 Game.shake
 *
 * ---------------- 三条纪律（跟 fx-kit.js 同源） ----------------
 * 1. 不逐帧 new：颜色 / 向量有缓存，粒子池创建时分配好。
 * 2. 材质按需建、随 mesh 释放；共享几何体打 \`userData.shared\` 不释放。
 * 3. 所有 mesh 挂在 FX2 自己的 Group 下 —— \`clear()\` 才可能真清干净
 *    （只清 updater 不清场景，换图后旧图的东西会挂在新图坐标上）。
 * ============================================================ */
'use strict';

const FX2 = (function () {
  /* ---------------- 宿主 ---------------- */
  let renderer = null;
  let camera = null;
  const root = new THREE.Group();
  root.name = 'fx2';
  /* 所有原语都往 root 里加。抽出来的代码里写的是 \`scene.add(...)\`，
   * 那个 \`scene\` 就是这个跟踪器 —— 它顺手记一份清单，
   * 否则 \`clear()\` 只能清掉 updater，mesh 会永远留在场景里。 */
  const _live = [];
  const scene = {
    add(o) { root.add(o); _live.push(o); return o; },
    remove(o) {
      root.remove(o);
      const i = _live.indexOf(o);
      if (i >= 0) _live.splice(i, 1);
      return o;
    }
  };

  /* beam / entity 的默认目标。游戏里每帧同步成 Boss 与玩家的位置；
   * 不设也不会报错（默认原点），但「默认朝玩家」这条语义就没了。 */
  const ACT = { boss: { pos: new THREE.Vector3() }, player: { pos: new THREE.Vector3() } };

  /* 屏幕震动交给宿主：游戏里是 Game.shake，特效台里是自己的相机抖 */
  let _shake = null;

  /* ---------------- 时间 / 更新队列 ---------------- */
  /* seq / delay 靠的是「模拟时间」，不是 setTimeout ——
   * setTimeout 在切图 / 暂停 / 掉帧时都会错位，而技能演出必须跟着帧走。 */
  const TIME = { t: 0, dt: 0 };
  const updaters = [];
  function addUpdate(o) { o.dead = false; updaters.push(o); return o; }
  function pruneUpdates() {
    for (let i = updaters.length - 1; i >= 0; i--) if (updaters[i].dead) updaters.splice(i, 1);
  }
  function seq(steps) {
    let i = 0, acc = 0;
    const list = steps.slice().sort((a, b) => a[0] - b[0]);
    return addUpdate({
      update(dt) {
        acc += dt;
        while (i < list.length && acc >= list[i][0]) {
          const fn = list[i][1]; i++;
          if (typeof fn === 'function') fn();
        }
        if (i >= list.length) this.dead = true;
      }
    });
  }
  function delay(sec, fn) { return seq([[sec, fn]]); }

  /* 抽出来的原语里有一处 \`shake(...)\`（blade 的落点余震），
   * 这里做成直通，没接宿主就是一个空函数 —— 不写「假接口」，写「可选的接口」。 */
  function shake(amp, dur) { if (typeof _shake === 'function') _shake(amp, dur == null ? 0.3 : dur); }

`;

const FOOT = `
  /* ---------------- 归属钩子 ----------------
   * 由 boss-cast.js 装：每帧推进某个 updater 之前，把「当前施法的怪」
   * 切回它自己的主人。fx2 单独使用时它是 null，行为不变。 */
  let stepHook = null;

  /* ---------------- 生命周期 ---------------- */
  function bind(sc, cam, rd) {
    if (sc && root.parent !== sc) sc.add(root);
    if (cam) camera = cam;
    if (rd) { renderer = rd; updatePointScale(); }
    return FX2;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    /* 一帧最多推进 0.05 秒：切后台回来 / 卡一下的 dt 可能是好几秒，
     * 直接喂给 updater 会让「0.16 秒扫完的刀」一瞬间闪完，看不见。 */
    dt = Math.min(dt, 0.05);
    TIME.dt = dt;
    TIME.t += dt;
    for (const k in POOLS) POOLS[k].update(dt);
    for (let i = 0; i < updaters.length; i++) {
      const u = updaters[i];
      if (u.dead) continue;
      /* 归属切换：技能体（data-bosskits 的 run）读的是全局 BOSS，
       * 而这个全局指向「当前正在放招的那只」。多个 updater 交替执行时
       * 不在这里切回去，前一只的回调会把伤害算到后一只头上。 */
      if (u.__own && stepHook) stepHook(u.__own);
      u.update(dt);
    }
    pruneUpdates();
    if (camera && _billList.length) {
      for (let i = _billList.length - 1; i >= 0; i--) {
        const m = _billList[i];
        if (!m.parent) { _billList.splice(i, 1); continue; }
        m.quaternion.copy(camera.quaternion);
      }
    }
  }

  function clear() {
    for (const u of updaters) {
      if (typeof u.kill === 'function') { try { u.kill(); } catch (e) { } }
      u.dead = true;
    }
    updaters.length = 0;
    for (const k in POOLS) {
      const P = POOLS[k];
      P.p.forEach(p => { p.live = false; });
      P.alive = 0;
      P.update(0.001);
    }
    /* 灯和粒子缓冲**不拆**：它们是长期槽位，拆了之后再也回不来 ——
     * 灯不在场景图里就不出光；Points 缓冲从场景移走后不再渲染，而 POOLS 是缓存的，
     * 谁也想不到要重建它。表现是「换一次图之后，所有粒子永久消失」。 */
    const keep = [];
    /* 必须遍历**副本**：disposeMesh 内部会调 scene.remove，
     * 而那个 remove 会把这一项从 _live 里 splice 掉 —— 一边遍历一边删，
     * 后面那几件就被跳过了（实测：4 件里只清掉 2 件，剩下的永远留在场上）。 */
    for (const m of _live.slice()) {
      if (m.isLight || m.isPoints) { keep.push(m); continue; }
      root.remove(m);
      disposeMesh(m);
    }
    _live.length = 0;
    for (const m of keep) _live.push(m);
    _billList.length = 0;
    DECALS.length = 0;
    TIME.t = 0;
  }

  function stats() {
    /* 数**真活着**的，不数缓存：Pool.alive 是上一帧算的，
     * 刚 spawn 完读它永远是 0，会让人以为「放了但没出」。同理 updaters 里
     * 还躺着已 dead 等 prune 的，直接读 length 会虚高。 */
    let n = 0;
    for (const k in POOLS) { const P = POOLS[k].p; for (let i = 0; i < P.length; i++) if (P[i].live) n++; }
    let u = 0;
    for (let i = 0; i < updaters.length; i++) if (!updaters[i].dead) u++;
    return { particles: n, updaters: u, meshes: _live.length, billboards: _billList.length };
  }

  /* ---------------- 导出 ---------------- */
  return Object.assign(BFX, {
    bind, update, clear, stats,
    actors: ACT,
    /* 技能体里会直接 \`scene.add(mesh)\`（岩甲的 5 块石板、镜我的碎面都是这么加的），
     * 走这个跟踪器才可能被 clear() 收掉。**别把 Game.scene 直接交出去** ——
     * 那样换图之后这些 mesh 会留在场上，挂在新图坐标上。 */
    scene,
    tex: TEX,
    /* 技能体是「特效台的执行代码」，它直接调演出层的**内部件**：
     * \`V3\` 87 次 / \`addUpdate\` 57 / \`P\` 53 / \`flatMesh\` 27 / \`disposeMesh\` 27 ……
     * 这些不是公开 API，但那 88 招就是按这些名字写的。摊成一个 tools 子对象
     * 交出去，比在 BFX 上挂二十个新方法干净（也不会和原语撞名）。
     * **缺一个就是运行时 ReferenceError**，而特效台里永远发现不了（那边全都有）。 */
    tools: {
      /* 注意：这里**没有** \`P\`。fx2 里没有那个函数（473 / 1510 行都是局部变量名），
       * 写进导出就是 ReferenceError，而且它会在 IIFE 里炸掉整个 FILE ——
       * FX2 直接变成 undefined，后面所有依赖它的脚本一起挂。
       * 88 招用的 P(parent, geo, mat, pos, scl, rot) 是 boss-cast.js 里的实体工具。 */
      addUpdate, delay, seq, shake, V3, col, pool,
      flatMesh, billMesh, vplane, disposeMesh, lightPulse,
      TEX, TEX_BAND, normShape
    },
    get shake() { return _shake; },
    set shake(f) { _shake = f; },
    get zoneOn() { return ZONE_ON; },
    set zoneOn(v) { ZONE_ON = !!v; },
    get time() { return TIME.t; },
    get stepHook() { return stepHook; },
    set stepHook(f) { stepHook = (typeof f === 'function') ? f : null; },
    delay, seq,
  });
})();
`;

function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const parts = CUTS.map(c => '  /* ---------- ' + c.name + ' ---------- */\n' + slice(src, c)
    .split('\n').map(l => (l ? '  ' + l : l)).join('\n'));
  return HEAD + parts.join('\n\n') + '\n' + FOOT;
}

const out = build();
const mode = process.argv[2] || '';

if (mode === '--check') {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('✗ src/fx2.js 与特效台不一致（特效台改过但没重新生成）');
    console.error('  修：node dev/build-fx2.js --write');
    process.exit(1);
  }
  console.log('✓ src/fx2.js 与特效台一致（' + out.split('\n').length + ' 行）');
} else if (mode === '--write') {
  fs.writeFileSync(OUT, out);
  console.log('✓ 已重写 src/fx2.js（' + out.split('\n').length + ' 行）');
} else {
  process.stdout.write(out);
}
