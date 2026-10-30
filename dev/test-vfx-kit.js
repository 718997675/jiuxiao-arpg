/* ============================================================
 * FXKit v2 原语层契约（node 直跑，不开浏览器）
 *
 *   node dev/test-vfx-kit.js
 *
 * 为什么要跑真代码而不是只 grep 源码：
 * 这一层最贵的三件事（缓存复用 / 池不增长 / 降级分支）**全是运行期行为**，
 * 光看源码看不出「同一个材质被 new 了 40 次」。所以这里用一套极小的 THREE 桩
 * 把 src/fx-kit.js 直接跑起来，数实例、数顶点、数 dispose。
 *
 * 钉住的七件事：
 *   1. 贴图按格懒生成 + 缓存（同一格两次拿到同一个 Texture）
 *   2. 材质按「格 + 颜色 + 尺寸档」复用，粒子死了**不许 dispose 材质**
 *   3. spr / trail / bolt / shock / decal 五个原语都有真实几何（不是空壳）
 *   4. bolt 真的有分叉，且总量有闸门（闪电是最容易一屏的原语）
 *   5. decal 是**固定池循环复用**：铺 40 次也只有 16 个 mesh
 *   6. 低画质（FX.q < 1）逐项降级：粒子减半、拖尾退化、气浪不画、贴花池缩到 6
 *   7. 四条纪律：不挂 PointLight / 不在 update 里 new 对象 / 只读坐标不改判定
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/fx-kit.js'), 'utf8');
const fxSrc = fs.readFileSync(path.join(ROOT, 'src/fx.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* ---------------- 极简 THREE 桩 ---------------- */
function makeCtx() {
  const counts = { mat: 0, geo: 0, mesh: 0, points: 0, line: 0, disposed: 0, tex: 0 };

  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
    crossVectors(a, b) {
      const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
      return this.set(x, y, z);
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    distanceTo(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  }
  class Color { constructor(c) { this.v = c; } set(c) { this.v = c; return this; } getHex() { return this.v; } lerp() { return this; } }
  class Obj3D {
    constructor() { this.children = []; this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new V3(1, 1, 1); this.parent = null; this.visible = true; }
    add(o) { this.children.push(o); o.parent = this; return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); o.parent = null; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  }
  const Scene = class extends Obj3D { };
  class BufferGeometry {
    constructor() { counts.geo++; this.attributes = {}; this.disposed = false; }
    setAttribute(n, a) { this.attributes[n] = a; return this; }
    setFromPoints(pts) { this.attributes.position = { count: pts.length, array: pts }; return this; }
    setIndex(i) { this.index = i; return this; }
    computeBoundingSphere() { }
    dispose() { this.disposed = true; counts.disposed++; }
  }
  class BufferAttribute {
    constructor(arr, item) { this.array = arr; this.itemSize = item; this.count = arr.length / item; this.needsUpdate = false; }
  }
  const Geo = (n) => class extends BufferGeometry { constructor() { super(); this.kind = n; } };
  class Mat {
    constructor(o) { counts.mat++; Object.assign(this, o || {}); this.disposed = false; this.opacity = (o && o.opacity !== undefined) ? o.opacity : 1; }
    dispose() { this.disposed = true; }
  }
  class Obj { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.frustumCulled = true; this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new V3(1, 1, 1); this.quaternion = {}; } }
  const Points = class extends Obj { constructor(g, m) { super(g, m); counts.points++; } };
  const Line = class extends Obj { constructor(g, m) { super(g, m); counts.line++; } };
  const Mesh = class extends Obj { constructor(g, m) { super(g, m); counts.mesh++; } };
  class CanvasTexture {
    constructor(c) { counts.tex++; this.image = c; this.needsUpdate = false; }
  }
  const g2d = () => ({
    clearRect() { }, fillRect() { }, strokeRect() { }, beginPath() { }, closePath() { },
    moveTo() { }, lineTo() { }, arc() { }, quadraticCurveTo() { }, fill() { }, stroke() { },
    save() { }, restore() { }, translate() { }, rotate() { },
    createRadialGradient: () => ({ addColorStop() { } }),
    createLinearGradient: () => ({ addColorStop() { } })
  });
  const document = {
    createElement: () => ({ width: 0, height: 0, getContext: g2d })
  };
  const THREE = {
    Vector3: V3, Color,
    Scene, Points, Line, Mesh,
    PointsMaterial: Mat, MeshBasicMaterial: Mat, LineBasicMaterial: Mat,
    BufferGeometry, BufferAttribute,
    PlaneGeometry: Geo('plane'), RingGeometry: Geo('ring'),
    CanvasTexture,
    AdditiveBlending: 2, NormalBlending: 1, DoubleSide: 2, LinearFilter: 1006
  };
  return { THREE, document, counts };
}

/* 把 fx-kit.js 跑进一个干净上下文；FX 桩给 scene / cam / q */
function boot(q) {
  const { THREE, document, counts } = makeCtx();
  const scene = new THREE.Scene();
  const cam = new THREE.Vector3(0, 20, 20);
  const FX = { scene, cam, q: q === undefined ? 1 : q };
  const ctx = {
    THREE, document, FX,
    RND: (a, b) => a + Math.random() * (b - a),
    console
  };
  vm.createContext(ctx);
  /* 顶层 `const` 不会变成 global 属性（和浏览器里一样），所以同一段脚本里
   * 顺手挂一份到 globalThis 上，测试才拿得到 —— 分两次 runInContext 也行，
   * 但那样多一层「到底看得见没」的疑问，不如一次挂清楚。 */
  vm.runInContext(src + '\n;globalThis.__fxk = { FXK, FXK_CELLS, fxCellTexture, fxMat };', ctx);
  const ex = ctx.__fxk;
  return { ctx, FXK: ex.FXK, FXK_CELLS: ex.FXK_CELLS, counts, scene, THREE };
}

/* ============================================================ */
console.log('一、贴图：按格懒生成 + 缓存');
{
  const { FXK, FXK_CELLS } = boot(1);
  const cells = Object.keys(FXK_CELLS);
  ok(cells.length === 14, '图集共 14 格（10 形状 + 4 贴花）', cells.length);
  ok(/^soft|spark/.test(cells[0]), '格名可读（soft 打头）', cells[0]);
  const a = FXK.cellTex('spark');
  const b = FXK.cellTex('spark');
  ok(a === b, '同一格两次调用拿到同一个 Texture（不重复上传）');
  ok(FXK.cellTex('scorch') !== a, '不同格是不同 Texture');
  ok(FXK.stats().tex === 2, '只生成了用到的两格（懒生成）', FXK.stats().tex);
  ok(a.image.width === 128 && a.image.height === 128, '单格 128×128', [a.image.width, a.image.height]);
}

console.log('二、spr：几何 / 缓存 / 降级');
{
  const { FXK, counts } = boot(1);
  const pos = { x: 1, y: 0, z: 2 };
  FXK.spr(pos, { n: 20, tex: 'ember', color: 0xff8800, size: 0.4, life: 1 });
  ok(FXK.parts.length === 1, '一簇粒子 = 一个 Points（一次 draw call）', FXK.parts.length);
  ok(FXK.parts[0].arr.length === 60, '顶点数组 = 3×20', FXK.parts[0].arr.length);
  const mat1 = FXK.parts[0].mat;
  FXK.spr(pos, { n: 20, tex: 'ember', color: 0xff8800, size: 0.4, life: 1 });
  ok(FXK.parts[1].mat === mat1, '同格 / 同色 / 同尺寸 → 材质复用（不 new 第二份）');
  const before = counts.mat;
  FXK.spr(pos, { n: 6, tex: 'ember', color: 0xff8800, size: 0.9, life: 1 });
  ok(counts.mat === before + 1, '尺寸档不同才新建材质', counts.mat - before);
  /* 死掉之后：几何释放，材质**不许**释放（缓存还要用） */
  for (let i = 0; i < 40; i++) FXK.update(0.1);
  ok(FXK.parts.length === 0, '生命走完自动清空', FXK.parts.length);
  ok(!mat1.disposed, '粒子死了也不 dispose 共享材质（否则下一次要重建）');

  const low = boot(0.5);
  low.FXK.spr(pos, { n: 40, tex: 'ember', life: 1 });
  ok(low.FXK.parts[0].n === 20, '低画质：40 颗砍到 20 颗', low.FXK.parts[0].n);
  const tiny = boot(0.2);
  tiny.FXK.spr(pos, { n: 2, tex: 'ember', life: 1 });
  ok(tiny.FXK.parts[0].n === 3, '低画质也至少留 3 颗（少到看不见等于没放）', tiny.FXK.parts[0].n);
}

console.log('三、trail：双排顶点 + 低画质退化');
{
  const { FXK, THREE } = boot(1);
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push(new THREE.Vector3(i, 1, 0));
  const t = FXK.trail(pts, { color: 0xffddaa, width: 0.8, life: 0.3 });
  ok(!!t, 'trail 建出来了');
  ok(t.geometry.attributes.position.count === 12, '6 个点 → 12 个顶点（双排）', t.geometry.attributes.position.count);
  ok(t.geometry.index.length === 30, '6 个点 → 5 段 × 6 索引', t.geometry.index.length);
  ok(t.geometry.attributes.uv.count === 12, 'uv 沿 t 拉伸（每点一对）', t.geometry.attributes.uv.count);
  for (let i = 0; i < 10; i++) FXK.update(0.1);
  ok(FXK.trails.length === 0, '拖尾到期清空', FXK.trails.length);

  const low = boot(0.5);
  const t2 = low.FXK.trail(pts, { color: 0xffffff, life: 0.3 });
  ok(t2 === null && low.FXK.parts.length === 1, '低画质：退化成 3 颗 spr，不建带子', low.FXK.stats());
}

console.log('四、bolt：折线 / 分叉 / 闸门');
{
  const { FXK, THREE } = boot(1);
  const from = new THREE.Vector3(0, 1, 0), to = new THREE.Vector3(0, 1, 12);
  const b = FXK.bolt(from, to, { depth: 4, branch: 1 });
  ok(!!b, 'bolt 建出来了');
  ok(b.items.length >= 2, '至少主干 + 分叉（branch=1 时几乎必有分叉）', b.items.length);
  const main = b.items[0].geo.attributes.position.array;
  ok(main.length === 17, 'depth=4 → 主干 17 个折点（2^4+1）', main.length);
  /* 折点必须真的偏离直线：x 或 y 有非零位移，否则就是一根直棍 */
  const bent = main.filter(p => Math.abs(p.x) > 1e-6 || Math.abs(p.y - 1) > 1e-6).length;
  ok(bent >= 4, '折点真的被中点位移揉过（不是一条直线）', bent);
  ok(FXK.parts.length === 1, '端点有闪光（不然看起来「没打中」）', FXK.parts.length);

  /* 闸门：连劈 20 道，最多留 12 道 */
  for (let i = 0; i < 20; i++) FXK.bolt(from, to, { depth: 2, branch: 0 });
  ok(FXK.bolts.length <= 12, '闪电总量有闸门（≤12）', FXK.bolts.length);

  for (let i = 0; i < 20; i++) FXK.update(0.05);
  ok(FXK.bolts.length === 0, '闪电到期清空', FXK.bolts.length);

  const low = boot(0.5);
  const from2 = new low.THREE.Vector3(0, 1, 0), to2 = new low.THREE.Vector3(0, 1, 12);
  const b2 = low.FXK.bolt(from2, to2, { depth: 4, branch: 1 });
  const m2 = b2.items[0].geo.attributes.position.array;
  ok(m2.length === 5, '低画质：depth 砍半（4→2）→ 5 个折点', m2.length);
}

console.log('五、shock：三件套 + 低画质去气浪');
{
  const { FXK } = boot(1);
  const s = FXK.shock({ x: 0, y: 0, z: 0 }, 3, {});
  ok(!!s.ring, '地面环');
  ok(!!s.sheet, '竖直气浪（给「高度」的那一件）');
  ok(FXK.parts.length === 1, '尘环走 spr（正重力，落地还在滚）', FXK.parts.length);
  ok(FXK.parts[0].gravity > 0, '尘是往下沉的（正重力）', FXK.parts[0].gravity);
  for (let i = 0; i < 10; i++) FXK.update(0.1);
  ok(FXK.shocks.length === 0, '冲击波到期清空', FXK.shocks.length);
  ok(s.ringMat.disposed && s.sheetMat.disposed, '到期连材质一起 dispose');

  const low = boot(0.5);
  const s2 = low.FXK.shock({ x: 0, y: 0, z: 0 }, 3, {});
  ok(s2.sheet === null, '低画质：不画竖直气浪（一张半透明大面片 = 一屏填充率）');
  ok(!!s2.ring, '低画质仍保留地面环');
}

console.log('六、decal：固定池循环复用（这条最容易写漏）');
{
  const { FXK, counts, scene } = boot(1);
  for (let i = 0; i < 40; i++) {
    FXK.decal({ x: i, y: 0, z: 0 }, { tex: 'scorch', size: 2, life: 5 });
  }
  const meshes = scene.children.filter(o => o.geometry && o.geometry.kind === 'plane' && o.material && o.material.map);
  ok(FXK.decals.length === 16, '池上限 16（铺 40 次也只有 16 个槽）', FXK.decals.length);
  ok(counts.mesh <= 16, 'Mesh 实例数 ≤ 16（不新建几何）', counts.mesh);
  ok(FXK.decalAt === 40, '游标一直往前走', FXK.decalAt);
  /* 第 17 次应该回到 0 号槽 */
  const slot0 = FXK.decals[0];
  ok(slot0.on === true && Math.abs(slot0.mesh.position.x - 32) < 1e-6,
    '第 33 次落在 0 号槽（循环复用，不是「挑最早过期的」）', slot0.mesh.position.x);
  ok(FXK.stats().decalOn === 16, '16 个槽全在用', FXK.stats().decalOn);

  for (let i = 0; i < 80; i++) FXK.update(0.1);
  ok(FXK.stats().decalOn === 0, '贴花到期全部收起（但 mesh 还留着复用）', FXK.stats().decalOn);
  ok(FXK.decals.length === 16, '收起不等于销毁', FXK.decals.length);

  const low = boot(0.5);
  low.FXK.decal({ x: 0, y: 0, z: 0 }, {});
  ok(low.FXK.decals.length === 6, '低画质：池缩到 6', low.FXK.decals.length);
}

console.log('七、clear：换图不留残影');
{
  const { FXK, scene } = boot(1);
  FXK.spr({ x: 0, y: 0, z: 0 }, { n: 8, life: 9 });
  FXK.trail([{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }], { life: 9 });
  FXK.bolt({ x: 0, y: 1, z: 0, clone() { return this; }, distanceTo() { return 5; } },
    { x: 0, y: 1, z: 5, clone() { return this; }, distanceTo() { return 5; } }, { depth: 2 });
  FXK.shock({ x: 0, y: 0, z: 0 }, 2, {});
  FXK.decal({ x: 0, y: 0, z: 0 }, { life: 9 });
  const before = scene.children.length;
  FXK.clear();
  ok(FXK.parts.length === 0 && FXK.trails.length === 0 && FXK.bolts.length === 0 && FXK.shocks.length === 0,
    'clear 把四类活物全拆了', FXK.stats());
  ok(FXK.stats().decalOn === 0, '贴花全部不可见');
  ok(scene.children.length < before, '场景里的对象数下降（真的 remove 了）', [before, scene.children.length]);
  ok(FXK.decals.length === 16, '贴花 mesh 留着复用（换图不该重建池）');
}

console.log('八、纪律（源码级）');
{
  /* 注释里本来就写着「不挂 PointLight」—— 直接 grep 原文会把注释判成违规。
   * 所以纪律检查一律在**去掉注释的代码**上做。 */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = strip(src);
  ok(!/PointLight/.test(code), '不挂 PointLight（一次挂灯 = 全部材质重编译）');
  const updRaw = src.slice(src.indexOf('  update(dt) {'), src.indexOf('  clear() {'));
  const upd = strip(updRaw);
  ok(updRaw.length > 500, 'update 抠出来了', updRaw.length);
  ok(!/new THREE\.(Vector3|Color)/.test(upd), 'update 里不 new Vector3 / Color');
  ok(!/new THREE\.(PointsMaterial|MeshBasicMaterial|LineBasicMaterial)/.test(upd), 'update 里不 new 材质');
  ok(/FX\.q|this\.q/.test(code), '降级读 FX.q（不自己维护第二份倍率）');
  /* 特效层只读坐标：不许改 pos / 伤害 */
  ok(!/\.pos\.(x|y|z)\s*[-+*/]?=/.test(code), '不写回 pos（特效层只读坐标）');
  ok(!/dmg\s*\*?=/.test(code), '不碰伤害数值');
  /* fx.js 必须真的把这一层接进主循环与清场 */
  ok(/FXK\.update\(dt\)/.test(fxSrc), 'FX.update 里调了 FXK.update');
  ok(/FXK\.clear\(\)/.test(fxSrc), 'FX.clear 里调了 FXK.clear');
  /* 材质缓存必须有上限，否则颜色 / 尺寸组合能把显存吃掉 */
  ok(/FXK_MAT_CAP/.test(code), '材质缓存有上限');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' FXKit 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
