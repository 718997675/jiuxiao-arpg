#!/usr/bin/env node
/* ============================================================
 * [M7.5] 八部天龙九套骨架 · 真机验收
 *
 *   node dev/probe-bafo-models.js
 *
 * 契约（test-m7-5）判的是「代码里有没有、接没接对」；这一份判的是
 * 「接进真游戏之后，九套骨架真的建出来了、真的能动、真的不炸」。
 *
 * 量六件事：
 *   1. 九套都能建出来，没有 null、没有 pageerror
 *   2. 高度 / 宽度在「一眼是巨物」的量级（不是 2 米小人，也不是穿出地图）
 *   3. `parts.torso` 是内层 group（约定二 —— 写成根 group 会让模型钉在出生点）
 *   4. 每套的身份件都在（光轮 / 蛇颈 / 骨面 / 飘带 / 三头 / 翼 / 角 / 蟒 / 八首）
 *   5. 动画跑 120 帧不产生 NaN，且根 group 的 position 没被动画写过
 *   6. 八只魔将走**真实 spawnEnemy 路径**能拿到自己的骨架，且碰撞半径被 footR 夹住
 *
 * headless 软件渲染只有 1~2fps，时间一律显式推进，不靠等。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 九套的期望：高度区间（米）、身份件（parts 里必须有的键）。
 * 高度区间给得宽（±40%），因为调比例是正常动作；
 * 它防的是「建成 2 米小人」和「建成 30 米穿出副本图」两种事故。 */
const EXPECT = {
  deva: { h: [4.6, 8.0], parts: ['halo', 'arms', 'torso', 'headG'] },
  naga: { h: [4.0, 7.0], parts: ['coil', 'neck', 'jaw', 'headG'] },
  yaksa: { h: [4.0, 7.0], parts: ['arms', 'mask', 'spikes', 'torso'] },
  gandharva: { h: [3.4, 6.4], parts: ['ribbons', 'lute', 'mist', 'torso'] },
  asura: { h: [4.4, 7.6], parts: ['heads', 'arms', 'shield', 'torso'] },
  garuda: { h: [4.2, 7.4], parts: ['wings', 'tail', 'claws', 'torso'] },
  kimnara: { h: [3.8, 6.8], parts: ['antlers', 'harp', 'legs', 'headG'] },
  mahoraga: { h: [4.0, 7.4], parts: ['serpents', 'crownHeads', 'coil', 'torso'] },
  chaosTrue: { h: [8.0, 14.0], parts: ['halos', 'orbit', 'core', 'arms', 'robe', 'torso'] }
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

  console.log('目标：' + TARGET.replace(/^file:\/\/.*jiuxiao-arpg-skill-refactor\//, 'local '));
  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.stats.hpMax = 1e9; Game.state.hp = 1e9;
    Game.invuln = 9999;
  });
  await wait(300);

  /* ---------- 一、九套骨架建得出来 ---------- */
  console.log('一、九套骨架：尺寸 / 零件 / 约定');
  const built = await page.evaluate(() => {
    const out = [];
    for (const k of BafoModels.KEYS) {
      const a = BafoModels.build(k, {});
      if (!a) { out.push({ k: k, null: true }); continue; }
      const g = a.group;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const sz = new THREE.Vector3(); box.getSize(sz);
      let meshes = 0;
      g.traverse(o => { if (o.isMesh) meshes++; });
      /* 约定二：parts.torso 不能是根 group */
      const torsoIsRoot = !!(a.parts.torso && a.parts.torso === g);
      /* 建模时就该是 1，不被任何 scale 污染（约定一） */
      const scaleIsOne = Math.abs(g.scale.x - 1) < 1e-6 && Math.abs(g.scale.y - 1) < 1e-6;
      out.push({
        k: k, null: false,
        h: +sz.y.toFixed(2), w: +sz.x.toFixed(2), d: +sz.z.toFixed(2),
        bottom: +box.min.y.toFixed(2),
        meshes: meshes, mats: a.mats.length,
        parts: Object.keys(a.parts),
        footR: a.footR, noAutoScale: !!a.noAutoScale,
        torsoIsRoot: torsoIsRoot, scaleIsOne: scaleIsOne,
        animKind: a.animKind, bafoModel: a.bafoModel
      });
    }
    return out;
  });

  for (const b of built) {
    const E = EXPECT[b.k] || { h: [1, 30], parts: [] };
    if (b.null) { ok(false, b.k + ' 建不出来（build 返回 null）'); continue; }
    console.log('    ' + b.k.padEnd(11) + ' 高 ' + String(b.h).padStart(6) + '  宽 ' + String(b.w).padStart(6) +
      '  深 ' + String(b.d).padStart(5) + '  mesh ' + String(b.meshes).padStart(3) +
      '  材质 ' + String(b.mats).padStart(2) + '  footR ' + b.footR);
    ok(b.h >= E.h[0] && b.h <= E.h[1], b.k + ' 高度在量级内（' + b.h + ' 米，期望 ' + E.h.join('~') + '）', b.h);
    ok(b.w <= 12, b.k + ' 宽度没爆（' + b.w + ' 米，副本图只有 140 见方）', b.w);
    /* 底面不能穿地：模型原点在地面，包围盒底应在 -0.6~+0.4 之间 */
    ok(b.bottom > -0.9 && b.bottom < 0.6, b.k + ' 没有埋进地里 / 没有飘在空中（底面 y=' + b.bottom + '）', b.bottom);
    ok(b.torsoIsRoot === false, b.k + ' 的 parts.torso 是内层 group（约定二）');
    ok(b.scaleIsOne === true, b.k + ' 的 group.scale 是 1（约定一）');
    ok(b.noAutoScale === true, b.k + ' 带 noAutoScale（否则会被再乘一次数据里的 scale）');
    ok(b.bafoModel === b.k && b.animKind === b.k, b.k + ' 分派键自洽（bafoModel / animKind）');
    for (const p of E.parts) ok(b.parts.indexOf(p) >= 0, b.k + ' 缺身份件 parts.' + p, b.parts);
    ok(b.meshes >= 12 && b.meshes <= 140, b.k + ' mesh 数在预算内（' + b.meshes + '，单只上限 140）', b.meshes);
  }

  /* ---------- 二、动画：跑 120 帧不炸、不写根 position ---------- */
  console.log('二、动画 120 帧：无 NaN、不写根 group 的 position');
  const anim = await page.evaluate(() => {
    const out = [];
    for (const k of BafoModels.KEYS) {
      const a = BafoModels.build(k, {});
      if (!a) continue;
      a.group.position.set(3, 0, -5);           // 假装是 game.js 同步过来的世界坐标
      const p0 = a.group.position.clone();
      let nan = 0;
      const bad = (v) => !isFinite(v);
      for (let f = 0; f < 120; f++) {
        a.moving = f % 40 < 20;
        a.atkAnim = f % 30 < 8 ? 1 - (f % 30) / 8 : 0;
        updateActorAnim(a, 1 / 60);
        const r = a.group.rotation;
        if (bad(r.x) || bad(r.y) || bad(r.z)) nan++;
      }
      /* 根 group 的水平位置不该被动画改（垂直允许 —— 乾闼婆要浮） */
      const dx = Math.abs(a.group.position.x - p0.x);
      const dz = Math.abs(a.group.position.z - p0.z);
      const dy = Math.abs(a.group.position.y - p0.y);
      /* 死亡动画跑一遍，确认不产生 NaN */
      a.anim = 'die';
      for (let f = 0; f < 90; f++) updateActorAnim(a, 1 / 60);
      const dieOk = isFinite(a.group.rotation.z) && isFinite(a.group.position.y);
      out.push({ k: k, nan: nan, dx: +dx.toFixed(3), dz: +dz.toFixed(3), dy: +dy.toFixed(3), dieOk: dieOk });
    }
    return out;
  });
  for (const r of anim) {
    ok(r.nan === 0, r.k + ' 动画 120 帧无 NaN', r.nan);
    ok(r.dx < 1e-6 && r.dz < 1e-6, r.k + ' 动画没写根 group 的水平坐标（dx=' + r.dx + ' dz=' + r.dz + '）');
    /* 只有乾闼婆允许上下浮 */
    if (r.k === 'gandharva') ok(r.dy > 0.05, 'gandharva 悬浮生效（dy=' + r.dy + '）');
    else ok(r.dy < 1e-6, r.k + ' 不在地面上乱飘（dy=' + r.dy + '）');
    ok(r.dieOk, r.k + ' 死亡动画无 NaN');
  }

  /* ---------- 三、八只走真实 spawnEnemy 路径 ---------- */
  console.log('三、八只魔将：真实 spawnEnemy 拿到自己的骨架');
  const spawned = await page.evaluate(() => {
    const out = [];
    const ids = Object.keys(BOSSES).filter(k => k.indexOf('bafo_') === 0);
    for (const id of ids) {
      const cfg = BOSSES[id];
      const e = Game.spawnEnemy('bafo', 6 + out.length * 4, 6, false, 60, id);
      if (!e) { out.push({ id: id, null: true }); continue; }
      const a = e.actor;
      const g = a.group;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const sz = new THREE.Vector3(); box.getSize(sz);
      out.push({
        id: id, animKind: cfg.animKind,
        bafoModel: a.bafoModel || null,
        radius: +e.radius.toFixed(2), reach: +e.reach.toFixed(2),
        footR: a.footR, h: +sz.y.toFixed(2),
        hp: e.maxHp, seal: cfg.seal, stagger: !!cfg.stagger
      });
      /* 立刻清掉，避免同屏九只影响后面量 draw call */
      e.dead = true;
      Game.scene.remove(g);
    }
    return out;
  });
  for (const s of spawned) {
    if (s.null) { ok(false, s.id + ' spawnEnemy 返回 null'); continue; }
    console.log('    ' + s.id.padEnd(18) + ' 骨架 ' + String(s.bafoModel).padEnd(11) +
      ' 高 ' + String(s.h).padStart(6) + '  半径 ' + String(s.radius).padStart(5) +
      '  reach ' + String(s.reach).padStart(5) + '  hp ' + s.hp);
    ok(s.bafoModel === s.animKind, s.id + ' 用的是自己的骨架（' + s.bafoModel + ' ≠ ' + s.animKind + '）', s.bafoModel);
    ok(s.radius <= s.footR + 0.01, s.id + ' 碰撞半径被 footR 夹住（' + s.radius + ' ≤ ' + s.footR + '）', s.radius);
    ok(s.reach >= 4.5 && s.reach <= 20, s.id + ' reach 落在「打得到、不穿模」区间（' + s.reach + '；远程首领本就 16~18）', s.reach);
    ok(s.stagger === true, s.id + ' 破绽声明还在（M7.3 没被模型改动打断）');
  }

  /* ---------- 四、同屏 draw call ---------- */
  console.log('四、同屏 draw call（一只魔将 + 12 护卫）');
  const calls = await page.evaluate(async () => {
    const ids = Object.keys(BOSSES).filter(k => k.indexOf('bafo_') === 0);
    const rows = [];
    /* 基线：场上什么都不加，先量一次 —— 不然后面 254 这种数字分不清
     * 是「魔将太重」还是「场景本来就这样」。 */
    for (const en of Game.enemies.slice()) {
      if (en.actor && en.actor.group) Game.scene.remove(en.actor.group);
    }
    Game.enemies.length = 0;
    Game.renderer.render(Game.scene, Game.camera);
    const base = Game.renderer.info.render.calls;
    for (const id of ids) {
      const cfg = BOSSES[id];
      const map = cfg.map;
      Game.state.mapId = map;
      const e = Game.spawnEnemy('bafo', 0, 0, false, 60, id);
      for (let i = 0; i < 12; i++) Game.spawnEnemy('wolf', 4 + i, 4, false, 60);
      /* 推进两帧让 renderer 记账，然后**显式渲染一次** ——
       * `Game.update` 在 headless 下不一定走渲染路径，只读 info 会读到上一帧的空场景。 */
      Game.update(1 / 60); Game.update(1 / 60);
      Game.renderer.render(Game.scene, Game.camera);
      const c = Game.renderer ? Game.renderer.info.render.calls : null;
      rows.push({ id: id, calls: c, base: base });
      for (const en of Game.enemies.slice()) {
        if (en.actor && en.actor.group) Game.scene.remove(en.actor.group);
      }
      Game.enemies.length = 0;
    }
    return rows;
  });
  for (const c of calls) {
    console.log('    ' + c.id.padEnd(18) + ' draw call ' + c.calls + '（基线 ' + c.base + '，本只 +' + (c.calls - c.base) + '）');
    ok(c.calls !== null && c.calls < 900, c.id + ' draw call 在预算内（' + c.calls + ' < 900）', c.calls);
  }

  /* ---------- 五、零报错 ---------- */
  console.log('五、控制台');
  ok(errs.length === 0, '零 console / pageerror', errs.slice(0, 3));

  await browser.close();
  console.log('\n================================');
  console.log('  M7.5 九套骨架真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  process.exit(fail ? 1 : 0);
})();
