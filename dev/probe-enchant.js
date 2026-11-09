#!/usr/bin/env node
/* ============================================================
 * [U5-4] 近战武器附魔 · 真机验收
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-enchant.js
 *
 * 静态契约（dev/test-enchant.js）判的是「表和接线对不对」；这一份判的是
 * **接进游戏之后真的画得出来**。U1 有过「契约全绿但 NaN 粒子照样算数」
 * 的前车之鉴，所以这里量真机 renderer 的 draw call / 差异像素 / geometry 签名。
 *
 * 量十件事：
 *   1  6 元素逐只上场，差异像素 > 0（不是只挂了个空 Group）
 *   2  每只 draw call ≤ 6（renderer.info 实测增量，不是数源码里的 add）
 *   3  6 套真机签名两两不同（geometry 类型 / 参数 / 贴图格 / 色 / UV 滚动）
 *   4  粒子池坐标全有限 + 真的在动（不是一池死点）
 *   5  副元素叠一层 accent，draws = 5
 *   6  低画质只留发光，draws = 2
 *   7  关闭 / FXK.clear() 零残留，draw call 回基线
 *   8  状态不变时复用同一个 group（不每帧 new mesh）
 *   9  game.js 接线：Lv9 不亮 / Lv10 + 注入元素亮 / 元素随注入换 / 挂在真武器上
 *  10 全程无 console.error / pageerror
 *
 * 两个隔离（不这么做量到的不是附魔本身）：
 *   · `Game.running = false` 停主循环，否则 rAF 会推进角色动画与相机；
 *   · 像素测量用**探针专用 mount** 摆在角色身前正对相机，避免武器骨骼的
 *     持握姿态把刀转到画面外。真实挂武器由第 9 组单独验。
 *   · 首只技能先跑一轮「暖机」丢弃（U1：SwiftShader 冷启动会读到半帧）。
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

const ELEMS = ['phys', 'fire', 'ice', 'lightning', 'poison', 'sigil'];

const TOOLS = `
  const CELLS = ['soft','spark','ember','smoke','shard','ring','slash','rune',
                 'dust','star','scorch','frost','acid','crack'];
  window.__probeMount = null;
  window.__cellOf = function (map) {
    if (!map || !map.image) return '';
    for (const n of CELLS) {
      try { if (FXK.cellTex(n).image === map.image) return n; } catch (e) { }
    }
    return '?';
  };
  window.__sig = function (e) {
    if (!e) return '';
    const out = [];
    for (const c of e.group.children) {
      const g = c.geometry || {};
      const m = c.material || {};
      out.push([
        c.type, g.type, g.parameters ? JSON.stringify(g.parameters) : '',
        m.color && m.color.getHex ? m.color.getHex() : '',
        m.blending, window.__cellOf(m.map),
        c.position.x.toFixed(2) + ',' + c.position.y.toFixed(2) + ',' + c.position.z.toFixed(2)
      ].join(':'));
    }
    out.push('scroll=' + Math.round((e.bladeTex.offset.y || 0) * 1000));
    return out.join('|');
  };
  window.__setup = function () {
    Game.startNew('warrior', 'T');
    Game.state.level = 45;
    try { Game.recalc(); } catch (e) { }
    Game.state.level = 45;
    Game.running = false;
    FX.clear();
    if (typeof VFX !== 'undefined' && VFX.reset) VFX.reset();
    if (typeof SKFX !== 'undefined' && SKFX.clear) SKFX.clear();
    FXK.enchant(null);
    FX.q = 1;
    const pp = Game.playerGroup.position;
    const mount = new THREE.Object3D();
    mount.position.set(pp.x, 1.15, pp.z + 1.5);
    Game.scene.add(mount);
    window.__probeMount = mount;
    Game.camera.position.set(pp.x, 1.35, pp.z + 4.2);
    Game.camera.lookAt(pp.x, 1.15, pp.z + 1.5);
    Game.camera.updateMatrixWorld();
    return { mount: !!mount, weapon: !!(Game.actor && Game.actor.weapon) };
  };
  window.__render = function (x2, c2) {
    Game.renderer.info.reset();
    Game.renderer.render(Game.scene, Game.camera);
    Game.renderer.getContext().finish();
    x2.drawImage(document.getElementById('gl'), 0, 0);
    return { data: x2.getImageData(0, 0, c2.width, c2.height).data,
             calls: Game.renderer.info.render.calls };
  };
  window.__count = function (A, B) {
    let diff = 0, maxD = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i+1] - B[i+1]),
                         Math.abs(A[i+2] - B[i+2]));
      if (d >= 8) { diff++; if (d > maxD) maxD = d; }
    }
    return { diff: diff, maxD: maxD };
  };
  /* 一只元素：清场 → 基线帧 → 上场 → 推 0.48s → 量像素 / draw call / 签名 */
  window.__case = function (cfg) {
    FXK.enchant(null);
    FX.clear();
    FXK.enchant(null);
    const gl = document.getElementById('gl');
    const c2 = document.createElement('canvas');
    c2.width = gl.width; c2.height = gl.height;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    const base = window.__render(x2, c2);
    const e = FXK.enchant(Object.assign({ mount: window.__probeMount }, cfg));
    const before = e ? Array.from(e.points.geometry.attributes.position.array) : [];
    for (let i = 0; i < 12; i++) FX.update(0.04);
    const after = window.__render(x2, c2);
    const st = FXK.enchantStats();
    const arr = e ? e.points.geometry.attributes.position.array : [];
    let finite = true, moved = false;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) finite = false;
      if (before[i] !== arr[i]) moved = true;
    }
    return {
      diff: window.__count(base.data, after.data),
      calls: after.calls - base.calls,
      baseCalls: base.calls, afterCalls: after.calls,
      st: st, sig: window.__sig(e), finite: finite, moved: moved,
      alive: e ? e.alive : -1,
      parent: e ? (e.group.parent === window.__probeMount) : false
    };
  };
  /* 状态不变时不重建 */
  window.__reuse = function (cfg) {
    FXK.enchant(null);
    const a = FXK.enchant(Object.assign({ mount: window.__probeMount }, cfg));
    const b = FXK.enchant(Object.assign({ mount: window.__probeMount }, cfg));
    return { same: !!a && a === b, groupSame: !!a && a.group === b.group,
             children: a ? a.group.children.length : 0 };
  };
  /* 低画质 / 副元素 / 关闭 */
  window.__modes = function () {
    const out = {};
    FXK.enchant(null); FX.q = 0.5;
    FXK.enchant({ elem: 'fire', mount: window.__probeMount });
    FX.update(0.04);
    out.low = FXK.enchantStats();
    out.lowVis = FXK.ench.group.children.map(c => c.visible);
    FX.q = 1;
    FXK.enchant({ elem: 'fire', sub: 'ice', subAmt: 0.15, mount: window.__probeMount });
    FX.update(0.04);
    out.sub = FXK.enchantStats();
    FXK.enchant(null);
    out.off = FXK.enchantStats();
    out.leak = window.__probeMount.children.length;
    FXK.enchant({ elem: 'ice', mount: window.__probeMount });
    FXK.clear();
    out.afterClear = FXK.enchantStats();
    out.leak2 = window.__probeMount.children.length;
    return out;
  };
  /* 真实接线：技能条 ① 位的有效等级 + 注入包 → 常驻层 */
  window.__link = function (lv, elem, sub) {
    FXK.enchant(null);
    Game.state.level = 45;
    if (Game.state.stats) { Game.state.stats.skillLv = 0; Game.state.stats.skillRank = {}; }
    const bar = Game.skillBar(true);
    const id = bar[0];
    if (!id) return { err: 'slot1 empty' };
    const skills = Game.state.skills || (Game.state.skills = {});
    if (!skills[id]) skills[id] = {};
    skills[id].lv = lv;
    skills[id].el = elem || null;
    skills[id].el2 = sub || null;
    const pack = Game.skillInjectPack(id);
    Game.updateEnchant();
    const st = FXK.enchantStats();
    const e = FXK.ench;
    const a = Game.actor;
    const mount = a ? ((a.mounts && a.mounts.weapon) || a.weapon ||
                       (a.parts && a.parts.weaponHand) || null) : null;
    return {
      id: id, level: Game.skillLevel(id), pack: pack, on: st.on, sig: st.sig,
      draws: st.draws,
      onWeapon: !!e && !!mount && e.group.parent === mount,
      state: Game.enchantState()
    };
  };
`;

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);
  await p.evaluate(TOOLS);
  const setup = await p.evaluate(() => window.__setup());
  ok(setup.mount, '探针 mount 与相机就位');
  ok(setup.weapon, '刀客真的有一把武器 mesh（不是盒子人兜底）');

  /* 暖机：U1 的 SwiftShader 冷启动坑，第一只结果丢弃 */
  await p.evaluate(() => window.__case({ elem: 'phys' }));

  console.log('\n【1】6 元素逐只上场：像素 / draw call / 签名');
  const res = await p.evaluate((elems) => {
    const out = {};
    for (const e of elems) out[e] = window.__case({ elem: e });
    return out;
  }, ELEMS);
  const sigs = {};
  for (const e of ELEMS) {
    const r = res[e];
    sigs[e] = r.sig;
    ok(r.diff.diff > 0, e + '：真的画出来了（差异像素 ' + r.diff.diff + ' / 峰值 ' + r.diff.maxD + '）', r.diff);
    ok(r.calls > 0 && r.calls <= 6,
      e + '：draw call 增量 ' + r.calls + ' ≤ 6（' + r.baseCalls + ' → ' + r.afterCalls + '）', r.calls);
    ok(r.st.on && r.st.draws <= 6, e + '：常驻层可见件数 ≤ 6', r.st);
    ok(r.parent, e + '：group 挂在传入的 mount 上');
    ok(r.finite, e + '：粒子池坐标全有限（没有 NaN 粒子）');
    ok(r.moved, e + '：粒子池真的在动');
    ok(r.alive > 0, e + '：推进 0.48s 后有活着的粒子', r.alive);
  }

  console.log('\n【2】6 套真机签名两两不同（不是只换颜色）');
  {
    const uniq = new Set(Object.keys(sigs).map(k => sigs[k]));
    ok(uniq.size === 6, '6 套签名互不相同', { unique: uniq.size, sigs: Object.keys(sigs) });
    const geos = ELEMS.map(e => (res[e].sig.match(/(PlaneGeometry|RingGeometry|BufferGeometry)/g) || []).join(','));
    ok(new Set(geos).size >= 3, 'accent 至少用了 3 种不同 geometry', geos);
  }

  console.log('\n【3】低画质 / 副元素 / 关闭 / clear');
  {
    const m = await p.evaluate(() => window.__modes());
    ok(m.low.draws === 2, 'FX.q < 1 只留发光 2 件（PLAN「只留发光」）', m.low);
    ok(m.lowVis.filter(Boolean).length === 2, '低画质真的把 accent / 粒子隐藏了', m.lowVis);
    ok(m.sub.sub === true && m.sub.draws === 5, '副元素叠一层 accent，共 5 件', m.sub);
    ok(m.off.on === false && m.leak === 0, 'enchant(null) 摘干净，mount 上零残留', m);
    ok(m.afterClear.on === false && m.leak2 === 0, 'FXK.clear() 也摘干净（换图不会留残影）', m);
  }

  console.log('\n【4】状态不变不重建 / 换元素才重建');
  {
    const r = await p.evaluate(() => window.__reuse({ elem: 'fire' }));
    ok(r.same && r.groupSame, '连续两次同状态 enchant 复用同一个 group', r);
  }

  console.log('\n【5】game.js 真接线：有效等级 + 注入包');
  {
    const l9 = await p.evaluate(() => window.__link(9, 'fire'));
    const l10 = await p.evaluate(() => window.__link(10, 'fire'));
    const ice = await p.evaluate(() => window.__link(10, 'ice'));
    const none = await p.evaluate(() => window.__link(10, null));
    const sub = await p.evaluate(() => window.__link(10, 'fire', 'poison'));
    ok(!l9.err && l9.level === 9 && !l9.on, 'Lv9 不亮（不能提前常开）', l9);
    ok(!l10.err && l10.level === 10 && l10.on, 'Lv10 亮了', l10);
    ok(l10.onWeapon, '常驻层挂在真实武器 mesh / holder 上（不是探针 mount）', l10);
    ok(l10.pack && l10.pack.key === 'fire' && l10.sig.indexOf('fire|') === 0,
      '注入火 → 附魔元素就是火', l10);
    ok(ice.sig.indexOf('ice|') === 0 && ice.sig !== l10.sig, '换注入元素 → 附魔换一套', ice);
    ok(none.on, '没注入元素时退回本命元素（照样亮）', none);
    ok(sub.pack && sub.pack.sub === 'poison' && sub.sig.indexOf('poison') >= 0,
      '双元素 70-30 的副元素进 sig', sub);
  }

  console.log('\n【6】错误');
  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(realErrs.length === 0, '全程无 console.error / pageerror', realErrs.slice(0, 4));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
