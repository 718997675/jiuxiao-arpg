/* ============================================================
 * 特效配方 DSL v2 契约（node 直跑，不开浏览器）
 *
 *   node dev/test-vfx-dsl.js
 *
 * 这一层是纯数据 + 纯函数，所以能整段跑真代码（连 data-skills.js 一起），
 * 而不是 grep 源码。钉住的六件事：
 *
 *   1. **15 条剪影 = 3 职业 × 5 功能位**，一条不多一条不少，且 id 都是真技能
 *   2. 配方里出现的每一个 `t` 都在 `VFX_OPS` 里（打错字 = 这个技能没特效，最难查）
 *   3. 配方里出现的每一个贴图格都在 `FXK_CELLS` 里（同上，跨文件对账）
 *   4. 台阶是 **patch 覆盖**而不是拼接：5 级写两刀、9 级写四刀，结果就是四刀
 *   5. 染色不污染数据表（连调两次结果一致，改返回值不动原文）
 *   6. 元素材质的三条运动方向可辨（火上升 / 冰硬停 / 毒下沉）—— §13 验收原话
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 一次把「技能表 + 配方表 + 原语层」都装进同一个上下文 —— 它们本来就该
 * 互相对得上，分成三个上下文反而查不出跨文件的错。 */
const ctx = { console, THREE: { Vector3: class { constructor() { } } } };
vm.createContext(ctx);
const load = (f, tail) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;' + tail, ctx);

load('src/data/data-skills.js', 'globalThis.__sk = { SKILLS, SKILL_ORDER, SKILL_ARCHETYPE, skillArchSlotOf, skillArchInherit };');
load('src/data/data-vfx.js', 'globalThis.__vfx = { ELEM_PROFILE, VFX_OPS, VFX_KEYS, SKILL_VFX, vfxRecipe, vfxTint, vfxBudget, vfxMissing };');

const { SKILLS, SKILL_ARCHETYPE, skillArchSlotOf } = ctx.__sk;
const { ELEM_PROFILE, VFX_OPS, VFX_KEYS, SKILL_VFX, vfxRecipe, vfxTint, vfxBudget, vfxMissing } = ctx.__vfx;

/* fx-kit 的图集格名：从源码里取，避免为了几个字符串把 THREE 桩也搬进来 */
const fxkitSrc = fs.readFileSync(path.join(ROOT, 'src/fx-kit.js'), 'utf8');
const CELLS = (() => {
  const m = fxkitSrc.match(/const FXK_CELLS = \{([\s\S]*?)\};/);
  if (!m) return {};
  const out = {};
  for (const mm of m[1].matchAll(/(\w+)\s*:/g)) out[mm[1]] = true;
  return out;
})();
/* 解释器认得的指令：data-vfx 的 VFX_OPS 是权威，vfx.js 的 switch 是实装 */
const vfxSrc = fs.readFileSync(path.join(ROOT, 'src/vfx.js'), 'utf8');
const CASES = {};
for (const mm of vfxSrc.matchAll(/case '(\w+)':/g)) CASES[mm[1]] = true;

const ids = Object.keys(SKILL_VFX);

console.log('一、15 条剪影 = 3 职业 × 5 功能位');
{
  ok(ids.length === 15, '一共 15 条配方', ids.length);
  const bad = ids.filter(id => !SKILLS[id]);
  ok(bad.length === 0, '每条配方的 id 都是真技能', bad);
  const covered = {};
  for (const id of ids) {
    const sk = SKILLS[id];
    const no = skillArchSlotOf(sk.cls, id);
    ok(no >= 1 && no <= 5, id + ' 能归到功能位', no);
    covered[sk.cls + ':' + no] = (covered[sk.cls + ':' + no] || 0) + 1;
  }
  ok(Object.keys(covered).length === 15, '15 条正好覆盖 15 个（职业 × 位）组合', Object.keys(covered).length);
  for (const cls of ['warrior', 'mage', 'taoist']) {
    for (let no = 1; no <= 5; no++) {
      ok(!!covered[cls + ':' + no], cls + ' 的 ' + no + ' 号位有剪影');
    }
  }
  /* 每条剪影的 sil 标签必须唯一 —— 两条技能共用一个剪影就说明「辨识度」没做 */
  const sils = ids.map(id => SKILL_VFX[id].sil);
  ok(new Set(sils).size === 15, '15 条剪影标签互不相同（靠剪影就能认出技能）', sils);
}

console.log('二、指令与贴图：每个名字都真的存在');
{
  let opCount = 0, badOp = [], badTex = [], badDecal = [];
  for (const id of ids) {
    const r = SKILL_VFX[id];
    for (const k of Object.keys(r)) ok(VFX_KEYS.indexOf(k) >= 0, id + ' 没有多余的顶层键 ' + k);
    for (const seg of ['cast', 'loop', 'impact']) {
      for (const op of (r[seg] || [])) {
        opCount++;
        if (!op.t || !VFX_OPS[op.t]) badOp.push(id + '.' + seg + '.' + op.t);
        if (!CASES[op.t]) badOp.push(id + '.' + seg + '.' + op.t + '(解释器没有这个 case)');
        if (op.tex && !CELLS[op.tex]) badTex.push(id + '.' + seg + '.' + op.tex);
      }
    }
    if (typeof r.decal === 'string' && r.decal !== 'elem' && !CELLS[r.decal]) badDecal.push(id + ':' + r.decal);
    for (const lv in (r.tiers || {})) {
      const patch = r.tiers[lv];
      for (const k of Object.keys(patch)) {
        ok(VFX_KEYS.indexOf(k) >= 0 && k !== 'tiers', id + ' 的 ' + lv + ' 级 patch 只写允许的键（' + k + '）');
        if (Array.isArray(patch[k])) {
          for (const op of patch[k]) {
            if (!op.t || !VFX_OPS[op.t]) badOp.push(id + '.tier' + lv + '.' + op.t);
          }
        }
      }
    }
  }
  ok(opCount > 50, '配方里一共 ' + opCount + ' 条指令（不是空壳）', opCount);
  ok(badOp.length === 0, '没有不认识的指令', badOp);
  ok(badTex.length === 0, 'op.tex 都在图集里', badTex);
  ok(badDecal.length === 0, '顶层 decal 都在图集里', badDecal);
  /* 11 个指令至少都被用到过一次，否则等于写了个没人用的分支 */
  const used = {};
  for (const id of ids) for (const seg of ['cast', 'loop', 'impact']) for (const op of (SKILL_VFX[id][seg] || [])) used[op.t] = 1;
  const unused = Object.keys(VFX_OPS).filter(k => !used[k]);
  ok(unused.length === 0, '11 个指令全部有用到', unused);
}

console.log('三、台阶：patch 覆盖，不是拼接');
{
  /* 「几刀」是**一条 arc 指令的 n**，不是数组长度 —— 一条 arc 画 n 道月牙，
   * 写成 n 条 arc 会多算 n 次 draw call 预算，而且没法统一倾斜角。 */
  const r1 = vfxRecipe('whirl', 1);
  const r5 = vfxRecipe('whirl', 5);
  const r9 = vfxRecipe('whirl', 9);
  ok(r1.cast.length === 1 && r1.cast[0].n === 2, '1 级：两刀', r1.cast);
  ok(r1.loop[0].helix === 1, '1 级：单螺旋', r1.loop[0].helix);
  ok(r5.loop[0].helix === 2, '5 级：螺旋加到 2 圈', r5.loop[0].helix);
  ok(r5.cast[0].n === 2, '5 级不动 cast（只改 loop）', r5.cast[0].n);
  ok(r9.cast.length === 1 && r9.cast[0].n === 4, '9 级：四刀（覆盖，不是 2+4=6）', r9.cast);
  ok(r9.loop[0].helix === 2, '9 级仍带着 5 级那条（台阶是累加的）', r9.loop[0].helix);
  ok(r9.decal === 'scorch', '9 级把残留换成焦痕', r9.decal);
  ok(r9.tier === 9 && r9.applied.join(',') === '5,9', '台阶记账：9 级吃到了 5 和 9', r9.applied);
  ok(vfxRecipe('whirl', 10).tier === 9, '没有 10 级 patch 时沿用 9 级', vfxRecipe('whirl', 10).tier);
  ok(vfxRecipe('nope', 1) === null, '没有配方的技能返回 null（不编一个空壳）');
  /* 不污染：连调两次结果一致 */
  const a = vfxRecipe('whirl', 9), b = vfxRecipe('whirl', 9);
  ok(JSON.stringify(a) === JSON.stringify(b), '连调两次结果一致');
  ok(SKILL_VFX.whirl.cast[0].n === 2, '调用方改返回值不会写回数据表', SKILL_VFX.whirl.cast[0].n);
  /* 只 slice 数组是不够的：数组里的指令对象还是同一份引用 */
  a.cast[0].n = 99;
  ok(SKILL_VFX.whirl.cast[0].n === 2 && vfxRecipe('whirl', 9).cast[0].n === 4,
    '改指令对象也不影响下一次取（指令是逐个复制的）', [SKILL_VFX.whirl.cast[0].n, vfxRecipe('whirl', 9).cast[0].n]);
}

console.log('四、染色：形不动，只换贴图 / 色 / 残留');
{
  const base = vfxRecipe('fireball', 1);
  const fire = vfxTint(base, 'fire');
  const ice = vfxTint(base, 'ice');
  ok(fire.color === ELEM_PROFILE.fire.color, '火的色值来自元素材质', fire.color);
  ok(ice.color === ELEM_PROFILE.ice.color, '冰的色值来自元素材质', ice.color);
  ok(fire.tex === 'ember' && ice.tex === 'shard', '贴图跟着元素换', [fire.tex, ice.tex]);
  ok(fire.decal === 'scorch' && ice.decal === 'frost', '残留跟着元素换', [fire.decal, ice.decal]);
  ok(JSON.stringify(fire.cast) === JSON.stringify(ice.cast), '**剪影一模一样**（形不参与染色）');
  ok(base.color === 'elem', '染色的返回值不动原对象', base.color);
  const unknown = vfxTint(base, 'nope');
  ok(unknown.color === ELEM_PROFILE.phys.color, '认不出的元素退回物理（不炸）', unknown.color);
  /* 固定色（刀客的金色）不该被元素盖掉 */
  const av = vfxTint(vfxRecipe('avatar', 10), 'fire');
  ok(av.color === 0xffd166, '写死的色值不被元素覆盖（刀客的金环就是金的）', av.color);
}

console.log('五、元素材质：三条运动方向可辨（§13 验收原话）');
{
  const e = Object.keys(ELEM_PROFILE);
  ok(e.length === 6, '6 套元素材质', e.length);
  const f = ELEM_PROFILE.fire, i = ELEM_PROFILE.ice, p = ELEM_PROFILE.poison;
  ok(f.up > 0 && f.grav < 0, '火：向上初速 + 负重力（往上飘）', [f.up, f.grav]);
  ok(i.up >= 0 && i.grav > 0 && i.drag > f.drag, '冰：正重力 + 高阻尼（甩出去就硬停）', [i.grav, i.drag, f.drag]);
  ok(p.up < 0, '毒：负初速（往下沉）', p.up);
  ok(p.grav < 0, '毒：负重力（一直往下漂，不是掉地上就停）', p.grav);
  /* 贴图与残留三件不能重复，否则「火和毒看起来一样」 */
  const texs = e.map(k => ELEM_PROFILE[k].tex);
  ok(new Set(texs).size >= 5, '6 套材质至少 5 种贴图（不撞脸）', texs);
  for (const k of e) {
    ok(!!CELLS[ELEM_PROFILE[k].tex], k + ' 的贴图在图集里', ELEM_PROFILE[k].tex);
    if (ELEM_PROFILE[k].decal) ok(!!CELLS[ELEM_PROFILE[k].decal], k + ' 的残留贴花在图集里', ELEM_PROFILE[k].decal);
  }
}

console.log('六、预算：单技能指令数有上限（draw call 的代理指标）');
{
  let worst = { id: '', n: 0 };
  for (const id of ids) {
    for (const lv of [1, 5, 9, 10]) {
      const b = vfxBudget(vfxTint(vfxRecipe(id, lv), 'fire'));
      if (b.total > worst.n) worst = { id: id + '@' + lv, n: b.total };
      ok(b.total <= 10, id + ' Lv' + lv + ' 指令数 ≤ 10（方案 §2：单技能 ≤ 6 draw call 的量级）', b.total);
    }
  }
  console.log('   最重的一条：', worst.id, worst.n, '条指令');
  const b = vfxBudget(vfxRecipe('whirl', 9));
  ok(b.ops.arc === 1 && b.ops.vortex === 1, '预算按指令分类统计', b.ops);
  ok(vfxBudget(null).total === 0, '空配方预算为 0（不炸）');
}

console.log('七、欠账：哪些技能还没配方（面板要能报出来）');
{
  const all = Object.keys(SKILLS);
  const miss = vfxMissing(all);
  ok(miss.length === all.length - 15, '37 个技能里 15 个有剪影，其余 ' + miss.length + ' 个待补', [all.length, miss.length]);
  ok(vfxMissing([]).length === 0, '空列表不炸');
  /* 这 15 个是「每职业每位的第一个技能」，其余同位的兄弟技能共用剪影即可，
   * 但必须能通过 skillArchSlotOf 找到同位的代表 —— 这里只记数，不判红。 */
  console.log('   待补：', miss.length, '个（同位兄弟技能会共用剪影，V2/V3 逐职业补齐）');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' VFX 配方契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
