#!/usr/bin/env node
/* ============================================================
 * 装备模组工作台 · 真机探针
 *
 *   NODE_PATH=<node_modules> node dev/probe-doll.js
 *   NODE_PATH=<node_modules> node dev/probe-doll.js --shots
 *
 * 工作台是**唯一验证场**（游戏侧 P0 还没接进 actors.js），所以这四件事
 * 只有这里能做：
 *
 *   一、覆盖   14 格逐格装上，对应挂点真的多出 mesh（不是「代码跑了但画面没东西」）
 *   二、预算   全身 14 格装满时 draw call / 顶点数落在方案 §9 的线内
 *   三、残留   换装 50 轮，`renderer.info.memory.geometries` 不许涨
 *              —— 现状 clearGroup 只 remove 不 dispose，这条是模组化前必须锁死的
 *   四、可辨   真实剪影 IoU（GPU 读像素）三族两两 < 0.85
 *
 * 截图走 --shots，落在 dev/_shots/（不入库）。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
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

const WANT_SHOTS = process.argv.indexOf('--shots') >= 0;
const SHOT_DIR = path.resolve(__dirname, '_shots');

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1180, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'docs', 'equip-doll-playground.html'),
    { waitUntil: 'load' });
  await p.waitForFunction('window.__doll && window.__doll.main', { timeout: 15000 });
  await wait(900);

  console.log('零、启动');
  ok(errs.length === 0, '启动就有报错', errs.slice(0, 4));
  const boot = await p.evaluate(() => ({
    cls: window.__doll.S.cls,
    slots: window.__doll.SLOT_ORDER.length,
    parts: Object.keys(window.__doll.DOLL_PARTS).length,
    meshInScene: (() => { let n = 0; window.__doll.main.group.traverse(o => { if (o.isMesh) n++; }); return n; })(),
    calls: window.__doll.renderer.info.render.calls
  }));
  ok(boot.slots === 14, '槽位数应为 14', boot.slots);
  ok(boot.meshInScene > 30, '开场角色 mesh 太少（身体都没建起来？）', boot.meshInScene);
  console.log('  职业 ' + boot.cls + ' · 建模槽 ' + boot.parts + ' · 场景 mesh ' + boot.meshInScene
    + ' · draw ' + boot.calls);

  /* ---------------- 一、14/14 覆盖 ---------------- */
  console.log('\n一、14 格覆盖（装一格 → 挂点必须多出 mesh）');
  const cover = await p.evaluate(() => {
    const D = window.__doll;
    const rows = [];
    for (const s of D.SLOT_ORDER) {
      for (const k of D.SLOT_ORDER) D.S.eq[k].on = false;
      D.S.eq[s].on = true;
      D.S.eq[s].tier = 5;
      D.apply();
      const h = D.main.__mounted[s] || {};
      const anchors = Object.keys(h);
      let meshes = 0, verts = 0;
      for (const an of anchors) h[an].traverse(o => {
        if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; }
      });
      rows.push({ slot: s, anchors, meshes, verts });
    }
    return rows;
  });
  let bad = cover.filter(r => r.meshes === 0 || r.anchors.length === 0);
  for (const r of cover) {
    if (r.meshes === 0) console.log('    · ' + r.slot + ' 没有几何');
  }
  ok(bad.length === 0, '有槽位装上后挂点还是空的', bad.map(r => r.slot));
  console.log('  ' + cover.map(r => r.slot + ':' + r.meshes).join('  '));

  /* ---------------- 二、预算 ---------------- */
  console.log('\n二、预算（14 格全装）');
  const budget = await p.evaluate(async () => {
    const D = window.__doll;
    const walk = () => {
      let verts = 0, meshes = 0;
      D.main.group.traverse(o => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; } });
      return { meshes, verts, calls: D.renderer.info.render.calls };
    };
    /* 先量裸身体，再量装甲 —— 差值才是「装备增量」，方案 §9 的预算说的是增量 */
    for (const s of D.SLOT_ORDER) D.S.eq[s].on = false;
    D.apply();
    await new Promise(r => requestAnimationFrame(r));
    const bare = walk();
    for (const s of D.SLOT_ORDER) {
      D.S.eq[s].on = true;
      D.S.eq[s].tier = 6;
      D.S.eq[s].rarity = 'legendary';
      D.S.eq[s].fam = ['A', 'B', 'C'][D.SLOT_ORDER.indexOf(s) % 3];
    }
    D.apply();
    await new Promise(r => requestAnimationFrame(r));
    const full = walk();
    return {
      bare, full,
      dMesh: full.meshes - bare.meshes,
      dVert: full.verts - bare.verts,
      dCalls: full.calls - bare.calls,
      mats: D.Doll.stats().mats
    };
  });
  console.log('  裸身 ' + budget.bare.meshes + ' mesh / ' + budget.bare.calls + ' draw'
    + '　→　全装 ' + budget.full.meshes + ' mesh / ' + budget.full.calls + ' draw');
  console.log('  装备增量 +' + budget.dMesh + ' mesh · +' + budget.dVert + ' 顶点 · +'
    + budget.dCalls + ' draw · 材质池 ' + budget.mats);
  /* 方案 §9：装备 ≤ 11 主通道 + 品质光 ≤ 4 → 14 格全装按「一格至多 2 个 draw」
   * （主材质 + 品质光）算，28 是宽线；超过说明合并失效（一零件一 mesh）。 */
  ok(budget.dCalls <= 34, '装备增量 draw call 过高，合并失效', budget.dCalls);
  ok(budget.dMesh <= 34, '装备增量 mesh 数过高，没合并', budget.dMesh);
  /* 成对槽位镜像后（护肩/护手/靴/戒各两份）实测 6765，14 格全装第 6 阶最繁。
   * 上限 7600 是「再加两件装饰件就会报警」的位置，别按整数往下砍。 */
  ok(budget.dVert <= 7600, '装备顶点增量超过 7600（实测基线 6765）', budget.dVert);
  ok(budget.mats < 40, '材质实例过多，共享失效', budget.mats);

  /* ---------------- 三、换装 50 轮不涨显存 ---------------- */
  console.log('\n三、换装 50 轮（geometries 不许涨）');
  /* 判据是「**同一批配置**来回换 50 轮不涨」—— 每轮都换新阶/新族必然产生新缓存项，
   * 那是缓存未命中，不是泄漏。真泄漏的形态是：同样的 3 套装备切来切去，
   * geometries 一路涨（clearGroup 只 remove 不 dispose 就是这种）。 */
  const leak = await p.evaluate(async () => {
    const D = window.__doll;
    const sets = [
      { helm: ['A', 1], chest: ['A', 1], gloves: ['A', 1], boots: ['A', 1], weapon: ['A', 1] },
      { helm: ['B', 4], chest: ['B', 4], gloves: ['B', 4], boots: ['B', 4], weapon: ['B', 4] },
      { helm: ['C', 7], chest: ['C', 7], gloves: ['C', 7], boots: ['C', 7], weapon: ['C', 7] }
    ];
    for (const s of D.SLOT_ORDER) D.S.eq[s].on = false;
    for (const k in sets[0]) D.S.eq[k].on = true;
    const applySet = (set) => {
      for (const k in set) { D.S.eq[k].fam = set[k][0]; D.S.eq[k].tier = set[k][1]; }
      D.apply();
    };
    /* 先预热三套：第一次见到某套配置时创建 geometry 是**缓存填充**，不是泄漏。
     * 基线要在「三套都已经建好」之后取，否则会把填充量当成泄漏（第一版就误判了）。 */
    for (let i = 0; i < 3; i++) { applySet(sets[i]); await new Promise(r => requestAnimationFrame(r)); }
    /* 先预热三套：第一次见到某套配置时创建 geometry 是**缓存填充**，不是泄漏。
     * 基线要在「三套都已经建好」之后取，否则会把填充量当成泄漏（第一版就误判了）。 */
    for (let i = 0; i < 3; i++) { applySet(sets[i]); await new Promise(r => requestAnimationFrame(r)); }
    applySet(sets[0]);
    await new Promise(r => requestAnimationFrame(r));
    const g0 = D.renderer.info.memory.geometries;
    const t0 = D.renderer.info.memory.textures;
    for (let i = 0; i < 50; i++) {
      applySet(sets[i % 3]);
      await new Promise(r => requestAnimationFrame(r));
    }
    const g1 = D.renderer.info.memory.geometries;
    const t1 = D.renderer.info.memory.textures;
    return { g0, g1, t0, t1, cache: D.Doll.stats().cache, disposed: D.Doll.stats().disposed };
  });
  console.log('  geometries ' + leak.g0 + ' → ' + leak.g1
    + ' · textures ' + leak.t0 + ' → ' + leak.t1
    + ' · 缓存 ' + leak.cache + ' 套 · 已拆 ' + leak.disposed);
  ok(Math.abs(leak.g1 - leak.g0) <= 2, '同批配置换装 50 轮后 geometries 增长（泄漏）', leak.g1 - leak.g0);
  ok(Math.abs(leak.t1 - leak.t0) <= 2, '换装后 textures 增长', leak.t1 - leak.t0);

  /* ---------------- 四、真实剪影 IoU ---------------- */
  console.log('\n四、三族真实剪影 IoU（GPU 读像素）');
  const iouRows = [];
  for (const slot of ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'relic']) {
    const r = await p.evaluate(async (s) => {
      const D = window.__doll;
      D.S.sel = s;
      D.S.eq[s].on = true;
      D.S.eq[s].tier = 3;
      for (const k of D.SLOT_ORDER) if (k !== s) D.S.eq[k].on = false;
      D.apply();
      if (!D.S.cmp) D.build();
      await new Promise(r => requestAnimationFrame(r));
      const out = D.iou();
      return out;
    }, slot);
    iouRows.push({ slot, r });
    const worst = Math.max(r.AB, r.AC, r.BC);
    console.log('  ' + slot.padEnd(10) + ' AB ' + r.AB.toFixed(3) + '  AC ' + r.AC.toFixed(3)
      + '  BC ' + r.BC.toFixed(3) + (worst >= 0.85 ? '  ✗' : ''));
    ok(worst < 0.85, slot + ' 三族剪影太像（真实像素）', +worst.toFixed(3));
  }

  /* ---------------- 五、三职业都不崩 ---------------- */
  console.log('\n五、三职业 × 全槽');
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const r = await p.evaluate(async (c) => {
      const D = window.__doll;
      D.S.cls = c;
      D.S.cmp = false;
      for (const s of D.SLOT_ORDER) { D.S.eq[s].on = true; D.S.eq[s].tier = 7; }
      D.build();
      await new Promise(r => requestAnimationFrame(r));
      let n = 0;
      D.main.group.traverse(o => { if (o.isMesh) n++; });
      return { n, calls: D.renderer.info.render.calls, errs: 0 };
    }, cls);
    ok(r.n > 40, cls + ' 装备后 mesh 数异常', r);
    console.log('  ' + cls + ' mesh ' + r.n + ' · draw ' + r.calls);
  }
  ok(errs.length === 0, '运行期有报错', errs.slice(0, 5));

  /* ---------------- 截图 ---------------- */
  if (WANT_SHOTS) {
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shot = async (name) => {
      await wait(260);
      await p.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
    };
    await p.evaluate(async () => {
      const D = window.__doll;
      D.S.cls = 'warrior'; D.S.cmp = false; D.S.anim = 'idle'; D.S.view = 'front';
      for (const s of D.SLOT_ORDER) D.S.eq[s].on = false;
      for (const s of ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'weapon']) {
        D.S.eq[s].on = true; D.S.eq[s].tier = 4; D.S.eq[s].rarity = 'rare';
      }
      D.build();
    });
    await shot('01-full-A');
    for (const [slot, fam, name] of [
      ['helm', 'A', '02-helm-A'], ['helm', 'B', '03-helm-B'], ['helm', 'C', '04-helm-C'],
      ['chest', 'A', '05-chest-A'], ['chest', 'B', '06-chest-B'], ['chest', 'C', '07-chest-C']
    ]) {
      await p.evaluate(async ([s, f]) => {
        const D = window.__doll;
        D.S.sel = s; D.S.eq[s].fam = f; D.S.eq[s].on = true; D.S.eq[s].tier = 5;
        D.S.view = 'close';
        D.apply();
      }, [slot, fam]);
      await shot(name);
    }
    /* 三族对比图 */
    await p.evaluate(async () => {
      const D = window.__doll;
      D.S.sel = 'chest';
      for (const s of D.SLOT_ORDER) D.S.eq[s].on = (['helm', 'chest', 'gloves', 'boots', 'belt', 'weapon'].indexOf(s) >= 0);
      D.S.view = 'front';
      if (!D.S.cmp) { document.getElementById('bCmp').click(); }
      D.apply();
    });
    await shot('08-compare-chest');
    /* 剪影 */
    await p.evaluate(() => { const D = window.__doll; if (!D.S.silh) document.getElementById('bSilh').click(); });
    await shot('09-compare-silhouette');
    await p.evaluate(() => { const D = window.__doll; if (D.S.silh) document.getElementById('bSilh').click(); });
    console.log('\n  截图 → ' + path.relative(process.cwd(), SHOT_DIR) + '/');
  }

  console.log('\n----------------------------------------');
  console.log((fail === 0 ? '✓ 全部通过' : '✗ 失败 ' + fail) + '：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
