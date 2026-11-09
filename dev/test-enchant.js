#!/usr/bin/env node
/* ============================================================
 * [U5-2] 近战武器附魔 · 静态契约（node + vm，不启浏览器）
 *
 *   node dev/test-enchant.js
 *
 * 判四件事，运行期行为归 dev/probe-enchant.js（真机量 draw call / 像素 / 签名）：
 *   1  ENCHANT_PROFILE 6 套：键与 ELEM_PROFILE 一致、字段合法、
 *      **三个维度两两不同**（贴图 / accent 几何 / 粒子运动），不是只换色
 *   2  15 个位的 Lv10 patch 都声明了 enchant，且只影响 10 级以上、
 *      不进 vfxCost 预算表
 *   3  FXK 常驻层的源码纪律：自建材质 / clone 贴图 / clear 摘除 /
 *      低画质降级 / 最多 5 件可见物
 *   4  game.js 接线：有效等级 + 注入包 → 每帧同步；不硬编码元素表
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 一次把配方数据层装进隔离上下文（纯数据 + 纯函数，THREE 只需一个空壳） */
const ctx = { console, THREE: { Vector3: class { } }, Math, JSON, Object, Number, Array, String };
vm.createContext(ctx);
vm.runInContext(read('src/data/data-vfx.js') +
  '\n;globalThis.__V = { ELEM_PROFILE, ENCHANT_PROFILE, VFX_OPS, VFX_KEYS, SKILL_VFX, vfxRecipe, vfxCost };',
  ctx, { filename: 'src/data/data-vfx.js' });
const V = ctx.__V;

const fxk = read('src/fx-kit.js');
const game = read('src/game.js');
const html = read('index.html');

/* 图集格名从 fx-kit 源码里取，别手抄（U4 契约同款做法） */
const CELLS = (() => {
  const m = fxk.match(/const FXK_CELLS = \{([\s\S]*?)\};/);
  if (!m) return [];
  return (m[1].match(/[a-z]+:/g) || []).map(s => s.slice(0, -1));
})();

const KEYS = Object.keys(V.ELEM_PROFILE);
const EKEYS = Object.keys(V.ENCHANT_PROFILE);
const SLOTS = Object.keys(V.SKILL_VFX);

console.log('\n【1】6 套附魔外观（不只是换色）');
ok(!!V.ENCHANT_PROFILE, 'ENCHANT_PROFILE 存在且能在隔离环境里加载');
ok(KEYS.length === 6 && EKEYS.length === 6, '恰好 6 套', EKEYS);
ok(KEYS.join(',') === EKEYS.join(','), '键与 ELEM_PROFILE 完全一致（不另建元素表）',
  { elem: KEYS, ench: EKEYS });
ok(CELLS.length >= 14, '图集格表读到了（14 格）', CELLS.length);
for (const k of EKEYS) {
  const p = V.ENCHANT_PROFILE[k];
  ok(p && typeof p === 'object', k + '：是一份配置对象');
  ok(Number.isInteger(p.color) && p.color >= 0 && p.color <= 0xffffff, k + '：核心色合法', p.color);
  ok(Number.isInteger(p.glow) && p.glow >= 0 && p.glow <= 0xffffff, k + '：外晕色合法', p.glow);
  ok(CELLS.indexOf(p.bladeTex) >= 0, k + '：剑身贴图是图集里的真实格', p.bladeTex);
  ok(CELLS.indexOf(p.accentTex) >= 0, k + '：accent 贴图是图集里的真实格', p.accentTex);
  ok(CELLS.indexOf(p.particle.tex) >= 0, k + '：粒子贴图是图集里的真实格', p.particle.tex);
  ok(p.bladeOp > 0 && p.bladeOp <= 1, k + '：剑身透明度在 (0,1]', p.bladeOp);
  ok(typeof p.accent === 'string' && p.accent.length > 0, k + '：accent 几何类型有值');
  ok(typeof p.scroll === 'number' && typeof p.pulse === 'number', k + '：滚动 / 脉动是数值');
  const q = p.particle;
  ok(q.n >= 6 && q.n <= 28, k + '：粒子容量在 6~28（固定池，不许无限长）', q.n);
  ok(q.size > 0.04 && q.size < 0.32, k + '：粒子尺寸适配 1.2 米剑身（不是技能粒子那套 0.7+）', q.size);
  ok(q.life > 0.1 && q.life <= 1.2, k + '：粒子寿命合理', q.life);
  ok(typeof q.additive === 'boolean', k + '：混合方式显式声明');
}
{
  const dim = (fn) => EKEYS.map(k => fn(V.ENCHANT_PROFILE[k]));
  const unique = a => new Set(a).size === a.length;
  ok(unique(dim(p => p.bladeTex)), '维度① 剑身贴图 6 套两两不同', dim(p => p.bladeTex));
  ok(unique(dim(p => p.accent)), '维度② accent 几何类型 6 套两两不同', dim(p => p.accent));
  ok(new Set(dim(p => p.particle.tex)).size >= 5, '维度③ 粒子贴图 ≥5 种', dim(p => p.particle.tex));
  const motion = dim(p => [p.particle.up, p.particle.grav, p.particle.drag].join('/'));
  ok(unique(motion), '维度③ 粒子运动（up/grav/drag）6 套两两不同', motion);
  const all = dim(p => [p.bladeTex, p.accent, p.particle.tex, p.particle.up, p.particle.grav].join('|'));
  ok(unique(all), '整套签名 6 套两两不同（灰度也该认得出）', all.length);
  ok(dim(p => p.particle.up).some(v => v > 0) && dim(p => p.particle.up).some(v => v < 0),
    '运动方向有上有下（火上升 / 毒下沉）');
  ok(dim(p => p.particle.grav).some(v => v < 0) && dim(p => p.particle.grav).some(v => v > 0),
    '重力有负有正（上飘 / 下坠都有）');
  ok(dim(p => p.scroll).some(v => v > 0) && dim(p => p.scroll).some(v => v < 0),
    'UV 滚动有正有负（不是统一换个速度）');
  ok(EKEYS.some(k => V.ENCHANT_PROFILE[k].accent === 'arc'), '雷有折线 accent');
  ok(EKEYS.some(k => V.ENCHANT_PROFILE[k].accent === 'halo'), '圣有环形 accent');
}

console.log('\n【2】Lv10 声明与预算');
ok(V.VFX_KEYS.indexOf('enchant') >= 0, 'VFX_KEYS 放开 enchant（否则 DSL 契约会拦）');
ok(SLOTS.length === 15, 'SKILL_VFX 仍是 15 个位', SLOTS.length);
for (const id of SLOTS) {
  ok(V.SKILL_VFX[id].tiers && V.SKILL_VFX[id].tiers[10] &&
     V.SKILL_VFX[id].tiers[10].enchant === true,
     id + ' 的 Lv10 patch 声明了 enchant');
  const r10 = V.vfxRecipe(id, 10);
  ok(r10 && r10.enchant === true, id + ' @10 能读到 enchant');
  for (const lv of [1, 5, 9]) {
    const r = V.vfxRecipe(id, lv);
    ok(!r.enchant, id + ' @' + lv + ' 还没有附魔（不能提前亮）');
  }
  ok(V.vfxRecipe(id, 20).enchant === true, id + ' @20 仍然有（装备抬级也算）');
  /* enchant 是声明键，不许进绘制预算 */
  const r = V.vfxRecipe(id, 10);
  const cost = V.vfxCost(r);
  const clone = Object.assign({}, r);
  delete clone.enchant;
  ok(V.vfxCost(clone) === cost, id + ' @10 enchant 不影响 vfxCost', { with: cost, without: V.vfxCost(clone) });
}

console.log('\n【3】FXK 常驻层源码纪律');
for (const [frag, why] of [
  ['enchant(cfg) {', 'FXK.enchant 入口'],
  ['_buildEnchant(p, sub, cfg, sig) {', '构建'],
  ['_enchUpdate(dt) {', '逐帧推进'],
  ['_dropEnchant() {', '摘除'],
  ['_enchQuality(e) {', '低画质档'],
  ['enchantStats() {', '探针读数'],
  ['this._enchUpdate(dt);', '挂进 FXK.update'],
  ['this._dropEnchant();', '挂进 FXK.clear'],
  ['enchant: this.enchantStats()', '挂进 FXK.stats'],
  ['fxCellTexture(p.bladeTex).clone()', '剑身贴图 clone（不滚共享 UV）'],
  ['new THREE.PointsMaterial({', '粒子池自建材质（不共用 fxMat）'],
  ['const low = this.q < 1;', '低画质判定读 FX.q'],
  ['if (cur && cur.sig === sig && cur.mount === want.mount) return cur;', '状态没变不重建']
]) ok(fxk.indexOf(frag) >= 0, 'FXK：' + why, frag);
ok(fxk.indexOf('new THREE.PointLight') < 0, '不挂 PointLight（全部材质会重编译）');
{
  /* 常驻层的 draw call 上界 = group.add 的件数：blade / halo / accent / accentSub / points */
  const seg = fxk.slice(fxk.indexOf('_buildEnchant(p, sub, cfg, sig) {'),
                        fxk.indexOf('_enchQuality(e) {'));
  const adds = (seg.match(/group\.add\(/g) || []).length;
  ok(adds === 5, '最多 5 件可见物（≤6 draw call 留一格余量）', adds);
  ok(seg.indexOf('this._enchAccent(sub, true)') >= 0, '副元素只叠一层 accent');
  ok(seg.indexOf('fxMat(') < 0, '构建阶段不碰 fxMat 缓存材质（会被引擎逐帧改 opacity）');
}
{
  const seg = fxk.slice(fxk.indexOf('_enchUpdate(dt) {'), fxk.indexOf('_dropEnchant() {'));
  ok(seg.indexOf('new THREE.') < 0, 'update 里不 new 任何 THREE 对象');
  ok(seg.indexOf('e.emit >= 0.2') >= 0, '每 0.2s 一颗（PLAN 原话）');
  ok(seg.indexOf('needsUpdate = true') >= 0, '粒子池只标脏、不重建几何');
  ok(seg.indexOf('p.scroll') >= 0 && seg.indexOf('p.pulse') >= 0, '滚动 / 脉动真的在跑');
  ok(seg.indexOf('arcJump') >= 0, '雷的折线会重跳');
}

console.log('\n【4】game.js 接线与加载顺序');
for (const [frag, why] of [
  ['enchantState() {', '状态计算'],
  ['updateEnchant() {', '每帧同步'],
  ['this.updateEnchant();', '挂进 updateSkillForm'],
  ['this.updateSkillForm(dt);', 'updateSkillForm 每帧被调用'],
  ['vfxRecipe(id, lv)', '读数据层的 Lv10 声明'],
  ['if (lv < 10) continue;', '门槛是有效等级 10'],
  ['this.skillLevel(id)', '等级走 skillLevel（含装备 +N）'],
  ['this.skillInjectPack(id)', '元素走注入包'],
  ["SKILLS[id] && SKILLS[id].elem", '没注入退回技能本命元素'],
  ['a.mounts.weapon', '挂点优先装备武器 holder'],
  ['FXK.enchant(null)', '不满足条件要摘掉（不能留残影）']
]) ok(game.indexOf(frag) >= 0, 'Game：' + why, frag);
ok(!/enchantState\(\)[\s\S]{0,900}(fire|ice|lightning|poison|sigil)\s*:/.test(game),
  '接线里没有硬编码「元素 → 特效」分支表');
{
  const at = s => html.indexOf('src="' + s + '"');
  ok(at('src/data/data-vfx.js') > 0 && at('src/fx-kit.js') > at('src/data/data-vfx.js'),
    'data-vfx.js 在 fx-kit.js 之前（ENCHANT_PROFILE 要先可见）',
    [at('src/data/data-vfx.js'), at('src/fx-kit.js')]);
  ok(at('src/fx-kit.js') < at('src/game.js'), 'fx-kit.js 在 game.js 之前');
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
process.exit(fail ? 1 : 0);
