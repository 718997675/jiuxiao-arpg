/* ============================================================
 * 技能 P4 契约：三职业 ⑤ 号位的签名表现（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p4.js
 *
 * P2b 把「机制」做完了，P4 只补「看得出来」。所以这一份钉的不是伤害，
 * 而是**读得出来**这件事本身：
 *
 *   1. 三种刀式的刀气形状**互不相同**（形在 tilt / n，不在颜色）
 *   2. 刀式补丁打在 `SKILL_VFX.avatar` 上 —— 只换 `arc` 那一条，
 *      起手圈与 5 / 10 级台阶原样保留（整段覆盖 = 换刀式就少一级）
 *   3. 取配方不污染数据表；越界的 stance 落回斩锋式
 *   4. 每条指令与贴图都真的存在（跨文件对账，和 test-vfx-dsl 同一把尺子）
 *   5. 单发绘制 ≤ 6（方案 §2 硬指标）：换式 ≤ 4、终结技 ≤ 4
 *   6. 源码里真的接上了：换式 / 终结技 / 开窗 / 换相 / 召唤 / 法身 / 登场动作
 *
 * 第 6 节是 grep 源码，不是跑代码 —— 表现层没有可断言的返回值，
 * 只能钉「这段代码在不在、有没有被调用」。真正的读数交给 probe-skill-p4。
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

const ctx = { console, THREE: { Vector3: class { constructor() { } } } };
vm.createContext(ctx);
const load = (f, tail) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;' + tail, ctx);

load('src/data/data-skills.js', 'globalThis.__sk = { SKILLS, SKILL_ARCHETYPE, skillArchSlotOf };');
load('src/data/data-vfx.js',
  'globalThis.__vfx = { SKILL_VFX, BLADE_FORM_VFX, VFX_OPS, VFX_KEYS, vfxRecipe, vfxBladeForm, vfxBladeImpact, vfxBudget };');

const { SKILLS, skillArchSlotOf } = ctx.__sk;
const { SKILL_VFX, BLADE_FORM_VFX, VFX_OPS, vfxRecipe, vfxBladeForm, vfxBladeImpact } = ctx.__vfx;

/* fx-kit 的图集格名 / vfx.js 的指令 case：与 test-vfx-dsl 同一套取法 */
const CELLS = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/fx-kit.js'), 'utf8');
  const m = src.match(/const FXK_CELLS = \{([\s\S]*?)\};/);
  const out = {};
  if (m) for (const mm of m[1].matchAll(/(\w+)\s*:/g)) out[mm[1]] = true;
  return out;
})();
const CASES = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/vfx.js'), 'utf8');
  const out = {};
  for (const mm of src.matchAll(/case '(\w+)':/g)) out[mm[1]] = true;
  return out;
})();

/* 单条指令的绘制成本 —— 数字来自 V0 的真机实测（台账「每条指令的真实绘制成本」），
 * 不是估的。以后加配方照这张表算，别凭感觉。 */
function draws(recipe) {
  let n = 0;
  for (const seg of ['cast', 'loop', 'impact']) {
    for (const op of (recipe[seg] || [])) {
      if (!op || !op.t) continue;
      if (op.t === 'arc' || op.t === 'cone' || op.t === 'vortex') n += Math.max(1, op.n || 1);
      else if (op.t === 'shock' || op.t === 'bolt') n += 3;
      else if (op.t === 'beam') n += 2;
      else if (op.t === 'geyser') n += (op.shock === false ? 1 : 4);
      else n += 1;
    }
  }
  return n;
}

const gameSrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
const has = re => re.test(gameSrc);

console.log('一、三种刀式的刀气形状互不相同');
{
  const f = [0, 1, 2].map(i => BLADE_FORM_VFX[i]);
  ok(f.every(Boolean), '斩锋 / 镇岳 / 摧城 三式都有配方', Object.keys(BLADE_FORM_VFX));
  const arcs = f.map(x => (x.impact || []).find(o => o.t === 'arc'));
  ok(arcs.every(Boolean), '每一式都有一条 arc（刀气本体）');
  /* 形必须靠 tilt / n 区分 —— 只换颜色的话玩家在暗场景里认不出来 */
  const shape = arcs.map(a => a.n + '/' + a.tilt);
  ok(new Set(shape).size === 3, '三式的刀气参数两两不同（n / tilt）', shape);
  ok(arcs[0].tilt < 0.25 && arcs[0].n === 1, '斩锋 = 一道细长弧（tilt 小）', arcs[0]);
  ok(arcs[1].tilt >= 0.4, '镇岳 = 立起来的半圆护体（tilt 大）', arcs[1]);
  ok(arcs[2].n >= 3 && arcs[2].tilt < 0.15, '摧城 = 三道短粗裂弧', arcs[2]);
  ok(f[2].decal === 'crack', '摧城要留裂痕（砸开的身份）', f[2].decal);
  ok(!f[0].decal && !f[1].decal, '斩锋 / 镇岳 不留痕（点杀不砸地）', [f[0].decal, f[1].decal]);
}

console.log('二、刀式补丁打在 avatar 配方上：只换 arc，起手与台阶保留');
{
  const base = vfxRecipe('avatar', 1);
  const f0 = vfxBladeForm(0), f1 = vfxBladeForm(1), f2 = vfxBladeForm(2);
  ok(!!base, 'avatar 配方存在（兵形的剪影就是它）', !!base);
  ok(JSON.stringify(f0.cast) === JSON.stringify(base.cast),
    '起手段沿用 avatar（同一个动作，不抄第二份）', { base: base.cast, f: f0.cast });
  ok(f0.cast.length > 0, '起手段不是空的（换式得有一圈）', f0.cast);
  ok(f2.impact.some(o => o.t === 'decal') && !base.impact.some(o => o.t === 'decal'),
    '摧城多出来的裂痕是补丁加的', f2.impact);
  /* 换式**刻意不吃台阶**：台阶属于断岳斩 / 剑神降世那两个瞬间 */
  const f10 = vfxBladeForm(1);
  ok(!f10.impact.some(o => o.t === 'shock'),
    '换式不带 Lv5 的冲击（那是终结技的规格）', f10.impact);
  ok(!f10.cast.some(o => o.t === 'spr'),
    '换式不带 Lv10 的星火（同上）', f10.cast);
  ok(f10.tier === 0, '换式的台阶记账是 0（固定基础段）', f10.tier);
  ok(f0.impact.filter(o => o.t === 'arc').length === 1,
    '刀气只有一条（不是「基础一条 + 刀式一条」）', f0.impact);
  /* 终结技那一段才有台阶的份 */
  const fin = vfxBladeImpact(2);
  ok(fin.impact.some(o => o.t === 'decal'), '终结技的摧城刀气带裂痕', fin.impact);
}

console.log('三、不污染数据表 / 越界兜底');
{
  const a = vfxBladeForm(2);
  a.impact[0].n = 99;
  ok(BLADE_FORM_VFX[2].impact[0].n === 3, '改返回值不动数据表', BLADE_FORM_VFX[2].impact[0].n);
  ok(vfxBladeForm(2).impact[0].n === 3, '下一次取还是原值', vfxBladeForm(2).impact[0].n);
  const bad = vfxBladeForm(99);
  ok(bad && bad.sil === BLADE_FORM_VFX[0].sil, '越界的 stance 落回斩锋式（不崩、不空）', bad && bad.sil);
  const neg = vfxBladeForm(-3);
  ok(neg && neg.impact.length === BLADE_FORM_VFX[0].impact.length, '负数同样落回斩锋式', neg && neg.impact);
  /* 终结技那一段：只有刀气，没有起手圈 */
  const imp = vfxBladeImpact(2);
  ok(imp.cast.length === 0 && imp.loop.length === 0, '终结技只取刀气段（不重播起手圈）', imp);
  ok(imp.impact.length === BLADE_FORM_VFX[2].impact.length, '刀气段完整', imp.impact);
}

console.log('四、指令与贴图都真的存在');
{
  const bad = [];
  for (const st of [0, 1, 2]) {
    for (const rec of [vfxBladeForm(st), vfxBladeImpact(st)]) {
      for (const seg of ['cast', 'loop', 'impact']) {
        for (const op of (rec[seg] || [])) {
          if (!op.t || !VFX_OPS[op.t]) bad.push('op:' + op.t);
          else if (!CASES[op.t]) bad.push('case:' + op.t);
          if (op.tex && !CELLS[op.tex]) bad.push('tex:' + op.tex);
        }
      }
      if (rec.decal && !CELLS[rec.decal]) bad.push('decal:' + rec.decal);
    }
  }
  ok(bad.length === 0, '刀式配方里的指令 / 贴图 / 残留全部存在', bad);
  /* 贴图与残留来自表本身，别在补丁里写死一个不存在的名字 */
  ok([0, 1, 2].every(i => CELLS[BLADE_FORM_VFX[i].tex]), '三式的 tex 都在图集里',
    [0, 1, 2].map(i => BLADE_FORM_VFX[i].tex));
}

console.log('五、绘制预算：单发 ≤ 6（方案 §2 硬指标）');
{
  const rows = [];
  for (const st of [0, 1, 2]) {
    rows.push(['换式' + st, draws(vfxBladeForm(st))]);
    rows.push(['终结技' + st, draws(vfxBladeImpact(st))]);
  }
  const over = rows.filter(r => r[1] > 6);
  ok(over.length === 0, '6 条读数全部 ≤ 6 次绘制', over);
  const finMax = Math.max(...[0, 1, 2].map(st => draws(vfxBladeImpact(st))));
  ok(finMax <= 4, '终结技刀气 ≤ 4（摧城三道裂弧 + 一块裂痕）', finMax);
  /* 换式是 1.2 秒一次的小动作，比技能本体（≤6）还贵就说不过去了 */
  const formMax = Math.max(...[0, 1, 2].map(st => draws(vfxBladeForm(st))));
  ok(formMax <= 6, '换式 ≤ 6（与技能本体同一条线）', formMax);
  /* 这条是给「以后有人想给换式加台阶」的人留的：加了就会撞上面那条 */
  ok(draws(vfxBladeForm(2)) === draws(vfxBladeForm(0)) + 3,
    '摧城比斩锋贵的那 3 次 = 多两道刀气 + 一块裂痕（其余同价）',
    [draws(vfxBladeForm(0)), draws(vfxBladeForm(2))]);
}

console.log('六、源码接线：该调的地方都调了');
{
  ok(has(/playSkillVfx\(id, opts\)/), 'playSkillVfx 统一播放口存在');
  ok(has(/bladeFormVfx\(stance\)/), 'bladeFormVfx 存在');
  ok(has(/bladeFinisherVfx\(stance\)/), 'bladeFinisherVfx 存在');
  ok(has(/bladeEdgeVfx\(dt\)/), 'bladeEdgeVfx（刃势满层脉冲）存在');
  ok(has(/updateFormAura\(dt\)/) && has(/_mkFormAura\(/), '法身：建 / 更新两个入口都在');
  ok(has(/_dropFormAura\(/), '法身：摘除入口在（换图要能作废）');
  ok(has(/this\.updateSkillForm\(dt\)/), 'update() 每帧调 updateSkillForm');
  ok(has(/updateFormAura\(dt\);\s*\n\s*this\.bladeEdgeVfx\(dt\);/), 'updateSkillForm 同时驱动法身与刃势脉冲');
  ok(has(/summonGate\(pp, 0x9affd0\)/), '灵狼：召唤阵');
  ok(has(/summonGate\(pp, 0xffe0b0\)/), '白虎：召唤阵（换色）');
  ok(has(/summonGate\(pp, 0x6ac8ff\)/), '青龙：召唤阵（换色）');
  ok(has(/this\.playSkillVfx\('summon'/), '三只召唤都播 summon 配方');
  ok(has(/playSkillVfx\('elementavatar'/), '法相开窗 / 换相都播 elementavatar 配方');
  ok(has(/spawnT: 0\.42/), '灵兽带登场计时');
  ok(has(/al\.spawnT > 0/) && has(/smoothstep|3 - 2 \* k/), 'updateAllies 里有登场动画（smoothstep）');
  ok(has(/this\.bladeFinisherVfx\(stance\)/), '断岳斩调用刀气');
  ok(has(/this\.bladeFormVfx\(\);\s*\n\s*this\.cooldowns\[id\] = 1\.2;/), '换式后立刻播新刀式的刀光');
  /* 不许在 case 里偷偷改数值 —— P4 只做表现 */
  ok(!/bladeFormVfx[\s\S]{0,200}?st\.atk/.test(gameSrc), 'bladeFormVfx 附近没有伤害计算（只做表现）');
  /* 三个 ⑤ 位都得能归到 5 号位，否则上面的接线接错了地方 */
  for (const [cls, id] of [['warrior', 'avatar'], ['mage', 'elementavatar'], ['taoist', 'summon']]) {
    ok(skillArchSlotOf(cls, id) === 5, cls + ' 的 ' + id + ' 在 ⑤ 号位', skillArchSlotOf(cls, id));
    ok(!!SKILLS[id], id + ' 是真技能');
    ok(!!SKILL_VFX[id], id + ' 有剪影配方');
  }
}

console.log('');
console.log((fail === 0 ? '✓' : '✗') + ' P4 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
