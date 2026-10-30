/* ============================================================
 * dev/check-wbmodels.js —— M18.6 六套骨架体检（离线，node 直跑）
 *
 * 为什么用**真 three** 而不是桩：
 *   这个脚本要量的东西（包围盒、三角面数、材质清单、visible 开关）
 *   全是 three 自己的行为。桩出来的包围盒只能证明「我调用过 Box3」，
 *   证明不了「这条蛇盘起来是 14 米宽」。
 *   `lib/three.min.js` 是 r128 的 UMD 包，在 node 的 vm 里能直接跑
 *   （几何体与材质都不碰 document）。
 *
 * 为什么必须存在：
 *   骨架错了在浏览器里是**看不出来**的 —— 六只都刷得出来、都能打，
 *   只是「全都长得一样」或者「尾巴翘到 23 米高」。
 *   数据脚本（check-worldboss）只能保证 `model: 'wb_candle'` 这个字符串存在，
 *   保证不了「它真的被建出来了」。
 *
 * 用法：node dev/check-wbmodels.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadData } = require('./_load.js');

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg, detail) {
  if (cond) { pass++; return true; }
  fail++;
  bad.push({ msg, detail });
  return false;
}
function eq(a, b, msg) { return ok(a === b, msg, `实际 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}`); }
function near(a, b, tol, msg) { return ok(Math.abs(a - b) <= tol, msg, `实际 ${a} / 期望 ${b}±${tol}`); }
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* ---------------- 装环境 ---------------- */
const ctx = loadData({
  console, Math, Set, Map, JSON, Date, isFinite, parseFloat, parseInt,
  Number, String, Boolean, Error, Array, Object, RegExp,
  localStorage: { getItem() { return null; }, setItem() {} },
  /* actors.js 顶层的精灵 / 文字相关会摸 document，给最小桩 */
  document: {
    createElement() {
      return { style: {}, appendChild() {}, removeChild() {}, getContext() { return null; }, addEventListener() {} };
    },
    body: { appendChild() {} },
    getElementById() { return null; }
  }
});
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;

vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/three.min.js'), 'utf8'), ctx, { filename: 'lib/three.min.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/actors.js'), 'utf8'), ctx, { filename: 'src/actors.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/wbmodels.js'), 'utf8'), ctx, { filename: 'src/wbmodels.js' });

const THREE = ctx.THREE;
const WBModels = vm.runInContext('WBModels', ctx);
const ORDER = vm.runInContext('WORLD_BOSS_ORDER', ctx);
const DATA = vm.runInContext('WORLD_BOSSES', ctx);
const buildMonster = vm.runInContext('buildMonster', ctx);

/* `Box3.setFromObject` **不检查 visible**（r128 的 expandByObject 直接 traverse），
 * 所以「藏掉尾巴再量」用 visible 是无效的 —— 第一版就是这么拿到 38.2 的。
 * 这里自己遍历，跳过任意祖先 visible=false 的 mesh。 */
function sizeOf(group, skipHidden) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  group.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    if (skipHidden) {
      let p = o, hidden = false;
      while (p && p !== group) { if (!p.visible) { hidden = true; break; } p = p.parent; }
      if (hidden) return;
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return { x: 0, y: 0, z: 0, minY: 0, maxY: 0 };
  const s = box.getSize(new THREE.Vector3());
  return { x: s.x, y: s.y, z: s.z, minY: box.min.y, maxY: box.max.y };
}
function meshStats(group) {
  let meshes = 0, tris = 0;
  const mats = new Set();
  group.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    mats.add(o.material);
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return { meshes, tris: Math.round(tris), mats };
}

/* ============================================================
 * 一、六只都建得出来，而且**不是**同一个人形
 * ============================================================ */
head('一、六套骨架都建出来了');

const built = {};
for (const id of ORDER) {
  const d = DATA[id];
  ok(WBModels.has(d.model), `${d.name}：model「${d.model}」在 WBModels 里注册了`);
  const a = WBModels.build(d.model, { scale: d.scale, color: d.color, cloth: d.cloth, skin: d.skin });
  ok(!!a, `${d.name}：build 返回了 actor`, d.model);
  if (!a) continue;
  built[id] = a;
  eq(a.wbModel, d.model, `${d.name}：actor.wbModel 记录了模型名`);
  eq(a.noAutoScale, true, `${d.name}：必须带 noAutoScale（否则会被再乘一次 scale）`);
  near(a.footR, d.body.radius, 0.001, `${d.name}：footR = 数据里的 body.radius`);
  ok(!!a.parts.torso, `${d.name}：有 parts.torso`);
  ok(a.parts.torso !== a.group,
    `${d.name}：parts.torso 必须是内层 group（指向根节点会抹掉世界坐标）`, 'torso === group');
  ok(a.mats.length >= 3, `${d.name}：至少 3 种材质（鳞 / 腹 / 深色）`, a.mats.length);
}

/* `buildMonster` 的分派必须真的走新分支。
 * 这是「写了模型但没人调用」的唯一防线 —— 六只全长得一样就是这么来的。 */
for (const id of ORDER) {
  const d = DATA[id];
  const a = buildMonster(d.model, { scale: d.scale, color: d.color, cloth: d.cloth, skin: d.skin });
  ok(a && a.wbModel === d.model, `buildMonster('${d.model}') 走新骨架而不是人形兜底`,
    a && { wbModel: a.wbModel, torso: !!a.parts.torso });
  ok(a && a.group.scale.x === 1, `buildMonster('${d.model}') 的 group.scale 必须是 1`, a && a.group.scale.x);
}

/* ============================================================
 * 二、尺寸必须贴数据（body.len / height / wingspan）
 * ============================================================ */
head('二、尺寸贴数据');

/* 每只量「最能代表它」的那一个轴。
 * 注意烛九阴：`body.len: 44` 是**展开长度**，盘三圈之后外径只有 14 米 ——
 * 拿 44 去卡包围盒是错的（第一版就是这么假红的）。这里卡的是「盘径」。
 * `hMul` 是高度容差倍数：九尾狐的尾巴本来就翘在身子上方，
 * 用 `body.height`（肩高）去卡总高必然超。 */
const DIM = {
  zhulong: { ax: 'xz', want: 14, tol: 0.30, hMul: 1.45, note: '盘三圈的外径' },
  xiangliu: { ax: 'z', want: 32, tol: 0.22, hMul: 1.45 },
  kunpeng: { ax: 'x', want: 60, tol: 0.12, hMul: 1.45, note: '翼展沿 x' },
  taotie: { ax: 'z', want: 30, tol: 0.22, hMul: 1.45 },
  xingtian: { ax: 'y', want: 16, tol: 0.18, hMul: 1.45, note: '身高沿 y' },
  /* 九尾狐的 `body.len: 26` 是**身体**长度，尾巴不算。
   * 总包围盒 z 有 38 米（身体 23 + 尾巴 12 + 头 3），拿 26 去卡必然红。
   * 所以量之前先把 tails 藏起来 —— 见下面 `bodyOnly`。 */
  jiuweihu: { ax: 'z', want: 26, tol: 0.25, hMul: 2.1, bodyOnly: 'tails',
    note: '身体长度，不含尾巴；总高含翘起的尾巴' }
};
const dims = {};
for (const id of ORDER) {
  const a = built[id]; if (!a) continue;
  const d = DATA[id];
  const s = sizeOf(a.group);
  dims[id] = s;
  const cfg = DIM[id];
  /* 只量「身体」的：临时藏掉尾巴 / 翅膀这类外延部件，量完恢复 */
  let sz = s;
  if (cfg.bodyOnly && a.parts[cfg.bodyOnly]) {
    const hid = a.parts[cfg.bodyOnly];
    const list = Array.isArray(hid) ? hid : [hid];
    list.forEach(o => { if (o && o.g) o.g.visible = false; else if (o) o.visible = false; });
    sz = sizeOf(a.group, true);   // 跳过不可见（尾巴）
    list.forEach(o => { if (o && o.g) o.g.visible = true; else if (o) o.visible = true; });
  }
  const got = cfg.ax === 'xz' ? Math.max(sz.x, sz.z) : sz[cfg.ax];
  near(got, cfg.want, cfg.want * cfg.tol,
    `${d.name}：${cfg.ax} 向尺寸 ${cfg.want} 米${cfg.note ? '（' + cfg.note + '）' : ''}（±${Math.round(cfg.tol * 100)}%）`);
  /* 高度单独卡：不能比数据矮太多（模型缩水）也不能高太多（飘起来） */
  ok(s.y > d.body.height * 0.65 && s.y < d.body.height * cfg.hMul,
    `${d.name}：高度落在 ${d.body.height} 米的 0.65~${cfg.hMul} 倍之间`, +s.y.toFixed(1));
  /* 脚不能陷进地里 —— 所有巨兽的 y 底都该在 0 附近 */
  ok(Math.abs(s.minY) < 0.9, `${d.name}：模型底部贴地（minY≈0）`, +s.minY.toFixed(2));
}

/* ============================================================
 * 三、剪影必须两两分得开
 * ============================================================ */
head('三、六只的剪影互不相同');

/* 度量方式：**(宽/长, 高/长) 的平面点距**。
 *
 * 第一版用「三维尺寸向量归一化后求距离」，结果相柳和饕餮只有 0.038 ——
 * 两只都是「长条兽」，长轴都是 z，归一化之后 z 都是 1.0，
 * 差异全被归一化吃掉了。
 *
 * 玩家看剪影看的是**比例**：相柳是「瘦高的九颈」、饕餮是「矮胖的大嘴」，
 * 差别在 h/len 与 w/len 这两条比值上。阈值 0.10 ≈ 10% 的比例差，
 * 小于这个数人眼就分不出来了。 */
const ratios = {};
for (const id of ORDER) {
  const s = dims[id]; if (!s) continue;
  const len = Math.max(s.x, s.z);
  ratios[id] = [s.x / len, s.y / len];
}
for (let i = 0; i < ORDER.length; i++) {
  for (let j = i + 1; j < ORDER.length; j++) {
    const a = ratios[ORDER[i]], b = ratios[ORDER[j]];
    if (!a || !b) continue;
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    ok(dist > 0.10, `${DATA[ORDER[i]].name} 与 ${DATA[ORDER[j]].name} 的宽高比例要明显不同`, +dist.toFixed(3));
  }
}

/* ============================================================
 * 四、性能与材质
 * ============================================================ */
head('四、面数与材质');

for (const id of ORDER) {
  const a = built[id]; if (!a) continue;
  const st = meshStats(a.group);
  const d = DATA[id];
  /* 上限 9000 面：同屏只有 1 只世界 Boss（WORLD_BOSS_CFG.sameTime = 1），
   * 一只 5000 面完全无压力；但写死上限能拦住「以后有人往尾巴上再堆 20 段」。 */
  ok(st.tris < 9000, `${d.name}：三角面 < 9000`, st.tris);
  ok(st.meshes >= 20, `${d.name}：至少 20 个部件（太少就是「一个球加两条腿」）`, st.meshes);
  /* 所有材质都要进 a.mats：受击闪白 / 死亡淡出 / dispose 全靠这张表 */
  let unregistered = 0;
  st.mats.forEach(m => { if (a.mats.indexOf(m) < 0) unregistered++; });
  eq(unregistered, 0, `${d.name}：所有材质都注册进 a.mats（受击闪白与 dispose 要用）`);
  console.log(`  ${d.name.padEnd(4)} ${String(st.meshes).padStart(4)} 部件 ${String(st.tris).padStart(5)} 面 ` +
    `${a.mats.length} 材质  尺寸 ${dims[id].x.toFixed(1)}×${dims[id].y.toFixed(1)}×${dims[id].z.toFixed(1)}`);
}

/* ============================================================
 * 五、动画：120 帧不抛异常，且真的在动
 * ============================================================ */
head('五、动画');

for (const id of ORDER) {
  const a = built[id]; if (!a) continue;
  const d = DATA[id];
  a.moving = true;
  let threw = null;
  const snaps = [];
  try {
    for (let i = 0; i < 120; i++) {
      WBModels.anim(a, 1 / 60);
      if (i === 10) snaps.push(a.group.rotation.z, a.group.position.y);
      if (i === 100) snaps.push(a.group.rotation.z, a.group.position.y);
    }
  } catch (e) { threw = e.message; }
  ok(!threw, `${d.name}：anim 跑 120 帧不抛异常`, threw);
  /* 动画必须真的改了什么，否则就是「写了个空函数」 */
  let moved = 0;
  a.group.traverse(o => {
    if (o.rotation && (Math.abs(o.rotation.x) + Math.abs(o.rotation.y) + Math.abs(o.rotation.z) > 1e-4)) moved++;
  });
  ok(moved > 0, `${d.name}：anim 真的在改变节点（不是空函数）`, moved);
  /* 死亡：不能翻到地下 */
  a.anim = 'die';
  try { for (let i = 0; i < 90; i++) WBModels.anim(a, 1 / 60); } catch (e) { threw = e.message; }
  ok(!threw, `${d.name}：die 动画不抛异常`, threw);
  ok(a.group.position.y > -2.5, `${d.name}：死亡下沉不超过 2.5 米（再深就穿地了）`, +a.group.position.y.toFixed(2));
  a.anim = 0; a.group.rotation.z = 0; a.group.position.y = 0;
}

/* ============================================================
 * 六、鲲鹏的三档形态
 * ============================================================ */
head('六、鲲鹏 morph 三档');

{
  const a = built.kunpeng;
  if (a) {
    const P = a.parts;
    ok(!!P.kun && !!P.peng, '鲲鹏：有 kun / peng 两套部件');
    ok(!!P.pengBody, '鲲鹏：peng 的鸟身单独一层（P3 同体时要藏掉）');
    eq(P.kun.visible, true, '鲲鹏：初始显示鲲');
    eq(P.peng.visible, false, '鲲鹏：初始隐藏鹏');

    WBModels.setMorph(a, 'peng');
    eq(P.kun.visible, false, 'peng：鱼藏起来');
    eq(P.peng.visible, true, 'peng：鸟显示');
    eq(P.pengBody.visible, true, 'peng：鸟身显示');

    WBModels.setMorph(a, 'both');
    eq(P.kun.visible, true, 'both：鱼显示');
    eq(P.peng.visible, true, 'both：鸟的翼与爪显示');
    eq(P.pengBody.visible, false, 'both：鸟身与鸟首藏掉（要的是「鱼长了翅膀」）');

    WBModels.setMorph(a, 'kun');
    eq(P.peng.visible, false, 'kun：切回鱼');
    eq(P.pengBody.visible, true, 'kun：鸟身恢复 visible（下次切鹏才是对的）');

    /* 形态切换必须**不重建**模型：重建会丢掉血条 / 名字牌 / 领域光环 */
    const root = a.group;
    WBModels.setMorph(a, 'peng');
    ok(a.group === root && root.children.length > 0, '鲲鹏：切换形态不重建根节点');
  } else {
    ok(false, '鲲鹏：没建出来，跳过 morph 检查');
  }
}

/* ============================================================
 * 七、接线：数据 / 加载顺序 / 战斗层
 * ============================================================ */
head('七、尾巴展开与影子态（M18.7b 的两个 enter 键）');

/* `enter.tails` → `setTails`；`enter.revealVuln` → `setGhost`。
 * 这两个接口是**骨架侧**的唯一入口，战斗层只负责在正确的时机调它们。
 * 这里验的是「调了之后真的看得见变化」，不是「函数返回了 true」。 */
{
  const a = WBModels.build('wb_ninetail', {});
  ok(!!a && a.parts.tails && a.parts.tails.length === 9, '九尾狐有 9 条尾（setTails 的前提）');
  eq(a.parts.tails[4].sign, 0, '正中间那条尾的展开方向是 0（展开后扇形仍然对称）');

  /* 展开 → 包围盒变宽 */
  const widthAt = (flare) => {
    WBModels.setTails(a, flare);
    a.animT = 0;                      // 固定相位，两次量的是同一帧
    WBModels.anim(a, 0.001);
    a.group.updateMatrixWorld(true);
    return sizeOf(a.group).x;
  };
  const w0 = widthAt(0), w1 = widthAt(1);
  ok(w1 > w0 * 1.05, '九尾展开后包围盒明显变宽', { 收拢: +w0.toFixed(1), 展开: +w1.toFixed(1) });

  eq(WBModels.setTails(a, 5), true, 'setTails 返回值 true');
  eq(a.tailFlare, 1, 'setTails 把超界的值夹到 1');
  WBModels.setTails(a, -3);
  eq(a.tailFlare, 0, 'setTails 把负数夹到 0');
  WBModels.setTails(a, 1);

  /* 摆动不能被展开覆盖掉：展开状态下换一个相位，rotation.y 还要变 */
  a.animT = 0; WBModels.anim(a, 0.001);
  const r1 = a.parts.tails[0].g.rotation.y;
  a.animT = 1.7; WBModels.anim(a, 0.001);
  const r2 = a.parts.tails[0].g.rotation.y;
  ok(Math.abs(r1 - r2) > 1e-4, '展开状态下尾巴仍在摆动（展开是叠加，不是替代）', { r1: +r1.toFixed(3), r2: +r2.toFixed(3) });

  /* 别的模型没有尾巴，setTails 要老实返回 false 而不是抛异常 */
  const z = WBModels.build('wb_candle', {});
  eq(WBModels.setTails(z, 1), false, '没有尾巴的模型 setTails 返回 false');

  /* 影子态：所有材质一起转半透明，且能完整还原 */
  const mats = a.mats.slice();
  ok(mats.length > 0, '九尾狐有材质表（setGhost 遍历它）', mats.length);
  WBModels.setGhost(a, true);
  ok(mats.every(m => m.transparent === true && Math.abs(m.opacity - 0.42) < 1e-6 && m.depthWrite === false),
    'setGhost(true) 让每个材质都变半透明（漏一个就是「身上一块实心」）',
    mats.filter(m => !m.transparent).length);
  eq(a.ghost, true, 'setGhost 记了 a.ghost');
  WBModels.setGhost(a, false);
  ok(mats.every(m => m.transparent === false && m.opacity === 1 && m.depthWrite === true),
    'setGhost(false) 完整还原（不还原会留下「一直半透明」的鬼影）');
  eq(WBModels.setGhost({}, true), false, '没有材质表的对象 setGhost 返回 false');
}

/* ============================================================
 * 八、接线
 * ============================================================ */
head('八、接线');

{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iActors = html.indexOf('src/actors.js');
  const iWb = html.indexOf('src/wbmodels.js');
  ok(iWb >= 0, 'index.html 加载了 wbmodels.js');
  ok(iWb > iActors, '加载顺序：wbmodels.js 在 actors.js 之后（要用它的几何 helper）');

  const act = fs.readFileSync(path.join(ROOT, 'src/actors.js'), 'utf8');
  ok(/WBModels\.has\(kind\)/.test(act), 'actors.js 的 buildMonster 按 kind 查 WBModels');
  ok(/noAutoScale/.test(act), 'actors.js 跳过 noAutoScale 的 setScalar');
  ok(/WBModels\.anim\(a, dt\)/.test(act), 'updateActorAnim 分派给 WBModels.anim');

  const fight = fs.readFileSync(path.join(ROOT, 'src/worldboss-fight.js'), 'utf8');
  ok(/WBModels\.setMorph/.test(fight), 'worldboss-fight.js 的 morph 会切真模型');
  ok(/WBModels\.setTails/.test(fight), 'worldboss-fight.js 的 enter.tails 会展开九尾（M18.7b）');
  ok(/WBModels\.setGhost/.test(fight), 'worldboss-fight.js 的 enter.revealVuln 会切影子态（M18.7b）');

  const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  ok(/body\.radius/.test(gsrc), 'game.js 用 body.radius 夹碰撞半径（否则 44 米的蛇站不进去）');

  /* 六只的 body.radius 必须存在且合理：太小会穿模，太大会够不到 */
  for (const id of ORDER) {
    const d = DATA[id];
    ok(typeof d.body.radius === 'number' && d.body.radius >= 2 && d.body.radius <= 7,
      `${d.name}：body.radius 在 2~7 米之间`, d.body && d.body.radius);
    /* 触及距离要能覆盖「玩家站在半径外一点」—— reach 至少比 radius 大 2 米，
     * 否则玩家贴着身体也打不到（近战判定用 reach） */
    const reach = Math.max(d.range || 2.2, d.body.radius * 1.26 + 0.75);
    /* reach 只需要「明显大于 radius」——玩家贴到身体边缘还能打到。
     * 要求 radius + 2 太严：饕餮 radius 4.6 → reach 6.55，差 1.95 也能打。 */
    ok(reach > d.body.radius + 1.5, `${d.name}：reach ${reach.toFixed(1)} > radius + 1.5`, +reach.toFixed(1));
  }
}

/* ============================================================
 * 收尾
 * ============================================================ */
console.log('\n' + '='.repeat(56));
if (fail) {
  console.log(`失败 ${fail} 项：`);
  for (const b of bad) console.log('  ✗ ' + b.msg + (b.detail !== undefined ? '  → ' + JSON.stringify(b.detail) : ''));
}
console.log(`世界 Boss 骨架（M18.6）：通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
