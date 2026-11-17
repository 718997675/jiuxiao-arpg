#!/usr/bin/env node
/* ============================================================
 * [M7.5] 九套骨架契约 —— 八部天龙 8 魔将 + 终 boss P5 真身
 *
 *   node dev/test-m7-5.js
 *
 * 设计口径见 `docs/ACT-EXPANSION-PLAN.md §15.5`：
 *   9 个新模型全部走**程序化**路线（不引 GLB），每只都要有
 *   独立剪影 + 可动分节，动画**不复用**通用的 walk/idle。
 *
 * 本契约钉五件事：
 *   一、骨架文件：9 个 builder 齐备，公共零件齐备，分派表自洽
 *   二、三条硬约定：真实米数 / parts.torso 是内层 group / footR 是「身子有多粗」
 *   三、接线：buildMonster 分派、updateActorAnim 分派、spawnEnemy 传 animKind、半径夹住
 *   四、数据对齐：8 只魔将的 animKind 都能在 KEYS 里找到（否则永远走老骨架）
 *   五、边界：不碰伤害 / 不写死碰撞半径 / 动画不写根 group 的水平坐标
 *
 * 真机（尺寸 / 零件 / 动画 / draw call）看 dev/probe-bafo-models.js，
 * 出图人工过看 dev/shot-bafo-models.js。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 剥注释再判源码：注释里提到 `noAutoScale` 不算实现 */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fnText = (s, needle) => {
  /* 同一个名字既出现在**调用处**又出现在**定义处**（`build(kind, cfg) {`）。
   * 只认后面紧跟 `{` 的那个 —— 否则会把调用点当函数体，后面全量错地方。 */
  let from = 0, at = -1;
  for (;;) {
    at = s.indexOf(needle, from);
    if (at < 0) return '';
    const rest = s.slice(at + needle.length, at + needle.length + 8);
    if (/^\s*\{/.test(rest)) break;
    from = at + needle.length;
  }
  let i = s.indexOf('{', at + needle.length), d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') { d--; if (d === 0) return s.slice(at, j + 1); }
  }
  return s.slice(at);
};

const ctx = loadData({});
const q = expr => vm.runInContext(expr, ctx);

const B = strip(src('src/bafomodels.js'));
const A = strip(src('src/actors.js'));
const G = strip(src('src/game.js'));
const HTML = src('index.html');

const KEYS = ['deva', 'naga', 'yaksa', 'gandharva', 'asura', 'garuda', 'kimnara', 'mahoraga', 'chaosTrue'];

/* ---------- 一、骨架文件 ---------- */
console.log('一、骨架文件：9 个 builder + 公共零件 + 分派表');
ok(/const BafoModels = \{/.test(B), 'src/bafomodels.js 定义了 BafoModels');
for (const k of KEYS) {
  ok(new RegExp('_build_' + k + '\\s*\\(').test(B), '缺 builder：_build_' + k);
}
for (const fn of ['build', 'has', 'dataOf', 'anim', '_body', '_arm', '_chain', '_tube', '_joint', '_eye', '_spike']) {
  ok(new RegExp(fn + '\\s*\\(').test(B), '缺公共方法：' + fn);
}
/* KEYS 字面量与契约里的 9 个必须一致 —— 少一个就是「建不出来也没人发现」 */
const keysInCode = (B.match(/KEYS:\s*\[([^\]]+)\]/) || [, ''])[1].replace(/['"\s]/g, '').split(',').filter(Boolean);
ok(keysInCode.length === 9, 'KEYS 是 9 项（实际 ' + keysInCode.length + '）', keysInCode);
for (const k of KEYS) ok(keysInCode.indexOf(k) >= 0, 'KEYS 里缺 ' + k, keysInCode);

/* ---------- 二、三条硬约定 ---------- */
console.log('二、三条硬约定（违反任意一条 = 模型和逻辑分家）');
const buildFn = fnText(B, 'build(name, opts = {})');
ok(/noAutoScale:\s*true/.test(buildFn), 'build 返回的 actor 带 noAutoScale（约定一：真实米数）');
ok(/a\.footR\s*=/.test(buildFn), 'build 里写了 a.footR（约定三：碰撞半径 ≠ 包围盒）');
/* 约定二：parts.torso 必须是内层 group，不能等于 a.group */
const bodyFn = fnText(B, '_body(a, cfg, o = {})');
ok(/torso\.position\.y/.test(bodyFn), '_body 把 torso 做成了有偏移的内层 group（约定二）');
ok(/a\.parts\.torso = torso/.test(bodyFn), '_body 把 torso 挂进 parts');
/* 九个 builder 里不许出现「parts.torso 指向根 group」的写法 */
ok(!/a\.parts\.torso\s*=\s*(a\.)?group/.test(B), '没有哪个 builder 把 parts.torso 指向根 group');
/* 9 只的 footR 都给了（缺了就退回 1.8，等于没量） */
const footBlock = (B.match(/FOOT:\s*\{([\s\S]*?)\}/) || [, ''])[1];
for (const k of KEYS) ok(new RegExp(k + '\\s*:').test(footBlock), 'FOOT 表里缺 ' + k);

/* ---------- 三、接线 ---------- */
console.log('三、接线：三处分派 + 半径夹住');
ok(/BafoModels\.has\(kind\)/.test(A), 'actors.js 的 buildMonster 有 BafoModels 分派');
ok(/BafoModels\.build\(kind, cfg\)/.test(A), 'actors.js 真的调了 BafoModels.build');
ok(/a\.bafoModel\s*&&\s*typeof BafoModels/.test(A), 'updateActorAnim 按 a.bafoModel 分派');
ok(/BafoModels\.anim\(a, dt\)/.test(A), 'updateActorAnim 真的调了 BafoModels.anim');
/* spawnEnemy：必须优先传 animKind，否则 8 只魔将永远落进 brute/demon 分支 */
ok(/cfg\.animKind[\s\S]{0,120}BafoModels\.has\(cfg\.animKind\)/.test(G), 'spawnEnemy 用 cfg.animKind 选骨架');
ok(/buildMonster\(mkind/.test(G), 'spawnEnemy 把 mkind 传给 buildMonster');
ok(/a\.bafoModel\s*&&\s*a\.footR/.test(G), 'spawnEnemy 用 footR 夹碰撞半径（bfCap）');
/* 加载顺序：必须在 actors.js 之后（要用它的 geo helper） */
const atActors = HTML.indexOf('src/actors.js');
const atBafo = HTML.indexOf('src/bafomodels.js');
ok(atBafo > 0, 'index.html 加载了 src/bafomodels.js');
ok(atBafo > atActors, 'bafomodels.js 在 actors.js 之后加载（否则 helper 未定义）');

/* ---------- 四、数据对齐 ---------- */
console.log('四、数据对齐：8 只魔将的 animKind 都有人接');
const bafo = JSON.parse(q(`
  (() => {
    const out = [];
    for (const id in BOSSES) {
      if (id.indexOf('bafo_') !== 0) continue;
      const b = BOSSES[id];
      out.push({ id: id, animKind: b.animKind || null, model: b.model, weak: b.weak, stagger: !!b.stagger });
    }
    return JSON.stringify(out);
  })()
`));
ok(bafo.length === 8, 'BOSSES 里有 8 只 bafo_ 首领（实际 ' + bafo.length + '）', bafo.length);
for (const b of bafo) {
  ok(!!b.animKind, b.id + ' 缺 animKind（会退回 model 字段 → 用老骨架）');
  ok(KEYS.indexOf(b.animKind) >= 0, b.id + ' 的 animKind「' + b.animKind + '」在 BafoModels 里没有 builder');
  /* 老字段还在，但**不该**再决定骨架 —— 它现在只是兜底 */
  ok(!!b.model, b.id + ' 的 model 字段丢了（兜底没了）');
  ok(b.stagger === true, b.id + ' 的 stagger 声明丢了（M7.3 会被打断）');
}
/* 9 个键里只有 chaosTrue 没有独立 BOSSES 条目，其余 8 个必须都能反查到数据 */
for (const k of KEYS) {
  const hit = bafo.filter(b => b.animKind === k).length;
  if (k === 'chaosTrue') ok(hit === 0, 'chaosTrue 不该有独立的 bafo_ 条目（它是 P5 形态）', hit);
  else ok(hit === 1, 'KEYS 里的 ' + k + ' 应该正好对应 1 只魔将（实际 ' + hit + '）', hit);
}

/* ---------- 五、边界 ---------- */
console.log('五、边界：不碰伤害 / 不写死半径 / 动画不写根坐标');
ok(!/damageEnemy|damagePlayer/.test(B), 'bafomodels.js 不参与伤害结算');
ok(!/e\.radius\s*=/.test(B), 'bafomodels.js 不写实体碰撞半径（那是 game.js 的事）');
ok(!/telegraph|hitRadius/.test(B), 'bafomodels.js 不碰判定几何 / Boss 预警');
/* 动画只写 rotation，不写根 group 的 position.x / .z（写一次模型就钉在原地） */
const animFn = fnText(B, 'anim(a, dt)');
ok(animFn.length > 0, 'anim 方法存在');
ok(!/group\.position\.x\s*=/.test(animFn), 'anim 不写根 group 的 x（会抹掉 game.js 同步的坐标）');
ok(!/group\.position\.z\s*=/.test(animFn), 'anim 不写根 group 的 z');
/* 唯一允许写 group.position.y 的是乾闼婆的悬浮（它本来就不该贴地） */
ok(/gandharva/.test(animFn) && /group\.position\.y/.test(animFn), '乾闼婆的悬浮写在 anim 里（允许）');

console.log('\n================================');
console.log('  M7.5 九套骨架契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
