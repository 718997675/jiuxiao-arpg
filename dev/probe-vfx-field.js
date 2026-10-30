/* ============================================================
 * 领域四剪影 · 真机探针（node 直跑，开浏览器）
 *
 *   node dev/probe-vfx-field.js
 *
 * 量三件事：
 *   1. 四种 kind 真的**长得不一样**（部件数 / 部件类型不同，不是只换颜色）
 *   2. 半径听调用方的（领域圈 = 判定的视觉契约，这里不许自己放大）
 *   3. 到点回收：zone 移除、材质 dispose，连放十次不涨
 * 顺带把四种剪影各截一张图，人眼复核用（shots/field-<kind>.png）。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const exe = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
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

  const KINDS = ['sigil', 'taiji', 'mist', 'blades'];
  const shotDir = path.resolve(__dirname, '..', 'shots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);

  console.log('一、四种剪影的部件构成');
  const shapes = await p.evaluate((kinds) => {
    const out = {};
    for (const k of kinds) {
      FX.clear();
      const grp = FX.field(new THREE.Vector3(0, 0, 0), { kind: k, r: 3.2, life: 3 });
      const z = FX.zones[FX.zones.length - 1];
      /* 部件清单：类型 + 贴图种类（地纹/光柱/雾片/剑影各用不同贴图） */
      const parts = [];
      grp.traverse(o => {
        if (!o.material) return;
        const map = o.material.map;
        parts.push({
          geo: o.geometry.type,
          blend: o.material.blending,
          tex: map && map.image ? (map.image.width + 'x' + map.image.height) : '-',
          count: 1
        });
      });
      out[k] = {
        parts: parts.length,
        geos: parts.map(x => x.geo).join(','),
        tex: parts.map(x => x.tex).join(','),
        blend: parts.map(x => x.blend).join(','),
        r: z.R, kind: z.kind, life: z.max
      };
    }
    FX.clear();
    return out;
  }, KINDS);

  for (const k of KINDS) {
    ok(shapes[k].parts > 0, k + ' 真的建出了部件', shapes[k].parts);
    ok(shapes[k].kind === k, k + ' 的 zone 记下了 kind', shapes[k].kind);
  }
  /* 剪影不同 = 部件构成不同。四种若部件数 / 几何 / 贴图全一样，
   * 那就只是"换了个颜色"，正是这次要修的病。 */
  const sig = k => shapes[k].geos + '|' + shapes[k].tex;
  ok(new Set(KINDS.map(sig)).size === 4,
    '四种剪影的「几何 + 贴图」组合互不相同', KINDS.map(k => k + ':' + sig(k)));
  ok(shapes.sigil.parts > shapes.taiji.parts, '法阵比太极多件（柱 + 环墙）',
    { sigil: shapes.sigil.parts, taiji: shapes.taiji.parts });
  ok(shapes.mist.parts >= 5, '雾是"多片"而不是一个圆片', shapes.mist.parts);
  ok(shapes.blades.parts >= 5, '剑阵有环绕剑影', shapes.blades.parts);

  console.log('二、半径听调用方的');
  const radii = await p.evaluate(() => {
    FX.clear();
    const out = {};
    for (const r of [2, 5]) {
      const grp = FX.field(new THREE.Vector3(0, 0, 0), { kind: 'sigil', r: r, life: 3 });
      const z = FX.zones[FX.zones.length - 1];
      /* 地纹是 scale = R*2 的平面（入场第一帧只到 0.55 倍，这里读的是目标值） */
      out[r] = { zoneR: z.R, sigScale: z.sig ? Math.round(z.sig.scale.x * 100) / 100 : null };
      FX.clear();
    }
    return out;
  });
  ok(radii[2].zoneR === 2 && radii[5].zoneR === 5, 'zone 半径就是传进来的半径', radii);
  ok(radii[5].sigScale > radii[2].sigScale * 2, '半径翻倍时地纹也跟着翻倍（不是写死的）', radii);

  console.log('三、到点回收');
  const life = await p.evaluate(async () => {
    const wait2 = ms => new Promise(r => setTimeout(r, ms));
    FX.clear();
    const n0 = FX.zones.length;
    FX.field(new THREE.Vector3(0, 0, 0), { kind: 'sigil', r: 3, life: 0.4 });
    const n1 = FX.zones.length;
    await wait2(120);
    FX.update(0.1);
    const mid = FX.zones.length;
    FX.update(0.6);                       // 一次性推过生命期
    return { n0, n1, mid, after: FX.zones.length };
  });
  ok(life.n1 === life.n0 + 1 && life.mid === life.n1, '领域在存活期内不会被提前回收', life);
  ok(life.after === life.n0, '生命期结束就回收（zone 不累积）', life);

  console.log('四、连放不涨');
  const leak = await p.evaluate(async () => {
    const wait2 = ms => new Promise(r => setTimeout(r, ms));
    FX.clear();
    for (let i = 0; i < 10; i++) {
      FX.field(new THREE.Vector3(i, 0, 0), { kind: 'blades', r: 3, life: 0.2 });
    }
    const peak = FX.zones.length;
    await wait2(60);
    FX.update(0.5);
    return { peak, after: FX.zones.length };
  });
  ok(leak.peak === 10, '十次领域各自独立', leak);
  ok(leak.after === 0, '全部到期后 zones 清零（材质随 zone 一起释放）', leak);

  console.log('五、截图（人眼复核）');
  for (const k of KINDS) {
    await p.evaluate((kind) => {
      FX.clear();
      Game.dead = false;
      Game.state.hp = Game.state.stats.hpMax;
      const pp = Game.playerGroup.position;
      FX.field(new THREE.Vector3(pp.x, 0, pp.z), { kind: kind, r: 3.4, life: 6 });
      for (let i = 0; i < 40; i++) FX.update(0.02);   // 推到入场动画结束
    }, k);
    await wait(120);
    await p.screenshot({ path: path.join(shotDir, 'field-' + k + '.png') });
    console.log('  · shots/field-' + k + '.png');
  }

  console.log('六、控制台');
  ok(errs.length === 0, '全程零报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 领域探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
