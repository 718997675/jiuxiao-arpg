#!/usr/bin/env node
/* ============================================================
 * [M7.3] 破绽窗口契约 —— 八部天龙 8 只的「打空了才有的大机会」
 *
 *   node dev/test-m7-3.js
 *
 * 设计口径见 `docs/ACT-EXPANSION-PLAN.md §15.2`：
 *   弱点 = 隐藏元素抗性（M7.2 已落地）+ 一个破绽窗口（本节点）。
 *   每只魔将的 patterns 里有一个长后摇招（`cfg.stagger.skill`），
 *   它放完之后 `dur` 秒内受伤 × `mul`。
 *
 * 本契约钉四件事：
 *   一、数据：8 只都有 stagger，且 patterns 里**真的有**那个技能
 *   二、抗性：弱点 −60（吃 160%）、其余 +80（吃 20%），硬断言 8 倍差
 *   三、接线：arm 挂在出招成功处、tick 挂在每帧、倍率挂在 damageEnemy
 *   四、边界：窗口**只乘伤害** —— 不改判定几何、不改 damagePlayer、不写死数值
 *
 * 真机窗口（开窗 / 倍率生效 / 收束）看 dev/probe-stagger.js。
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
/* 剥注释再判源码：注释里提到 stagger 不算接线 */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fnText = (s, needle) => {
  /* 同一个名字既出现在**调用处**（`this.bossPattern(e, pp)`）又出现在**定义处**
   * （`bossPattern(e, pp) {`）。只认后面紧跟 `{` 的那个 —— 否则会把调用点
   * 当成函数体，后面所有断言都量错地方。 */
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
const G = strip(src('src/game.js'));

/* ---------- 一、数据 ---------- */
console.log('一、8 只魔将的 stagger 声明');
const bosses = JSON.parse(q(`
  (() => {
    const out = [];
    for (const id in BOSSES) {
      const b = BOSSES[id];
      if (id.indexOf('bafo_') !== 0) continue;
      out.push({ id: id, patterns: b.patterns || [], stagger: b.stagger || null, weak: b.weak, resist: b.resist || null });
    }
    return JSON.stringify(out);
  })()
`));
ok(bosses.length === 8, '8 只八部魔将', bosses.length);

let dataBad = [];
for (const b of bosses) {
  const st = b.stagger;
  if (!st) { dataBad.push(b.id + ': 缺 stagger'); continue; }
  if (!st.skill) dataBad.push(b.id + ': 缺 skill');
  if (!(st.dur > 0)) dataBad.push(b.id + ': dur 不合法 ' + st.dur);
  if (!(st.mul > 1)) dataBad.push(b.id + ': mul 应 >1，实为 ' + st.mul);
  if (!st.label) dataBad.push(b.id + ': 缺 label');
  /* 破绽来源必须在 patterns 里，否则这一招永远放不出来 */
  if (st.skill && b.patterns.indexOf(st.skill) < 0) {
    dataBad.push(b.id + ': patterns 里没有破绽来源 ' + st.skill);
  }
}
ok(dataBad.length === 0, '8 只 stagger 字段齐全且 patterns 含破绽来源', dataBad);

const durs = bosses.map(b => b.stagger && b.stagger.dur).filter(Boolean);
ok(durs.every(d => d >= 2 && d <= 6), '窗口时长落在 2~6 秒', durs);

/* ---------- 二、抗性 8 倍差 ---------- */
console.log('\n二、弱点抗性（M7.2 已落地，这里防回退）');
const ELEMS = ['phys', 'fire', 'ice', 'lightning', 'poison'];
let resBad = [];
for (const b of bosses) {
  const r = b.resist || {};
  const weak = b.weak;
  if (!weak || ELEMS.indexOf(weak) < 0) { resBad.push(b.id + ': weak 不合法 ' + weak); continue; }
  /* damageEnemy 把抗性夹在 −60 ~ +85；−60 → 1.6 倍是唯一写法 */
  if (r[weak] !== -60) resBad.push(b.id + ': 弱点 resist 应为 −60，实为 ' + r[weak]);
  for (const e of ELEMS) {
    if (e === weak) continue;
    if (r[e] !== 80) resBad.push(b.id + ': ' + e + ' 应为 +80，实为 ' + r[e]);
  }
}
ok(resBad.length === 0, '弱点 −60 / 其余 +80（8 倍差）', resBad);
const mulRatio = (1 - (-60) / 100) / (1 - 80 / 100);
ok(Math.abs(mulRatio - 8) < 1e-9, '弱点/非弱点 = 8.00 倍', +mulRatio.toFixed(2));

/* ---------- 三、接线 ---------- */
console.log('\n三、game.js 接线');
ok(G.indexOf('bossStaggerArm(e)') >= 0, 'bossStaggerArm 已定义');
ok(G.indexOf('bossStaggerTick(e, dt)') >= 0, 'bossStaggerTick 已定义');
ok(G.indexOf('_staggerFx(e, stg)') >= 0, '_staggerFx 已定义');

/* arm 必须挂在 BossCast.tryCast 成功之后 */
const patFn = fnText(G, 'bossPattern(e, pp)');
ok(patFn.indexOf('BossCast.tryCast') >= 0, 'bossPattern 调 BossCast.tryCast');
const armAt = patFn.indexOf('this.bossStaggerArm(e)');
const castAt = patFn.indexOf('BossCast.tryCast');
ok(armAt > castAt && castAt >= 0, 'bossStaggerArm 在出招成功之后调用', { castAt, armAt });

/* tick 必须挂在 updateBossAI 里 */
const aiFn = fnText(G, 'updateBossAI(e, dt, d, pp)');
ok(aiFn.indexOf('this.bossStaggerTick(e, dt)') >= 0, 'updateBossAI 每帧调 bossStaggerTick');

/* 倍率必须挂在 damageEnemy 里 */
const dmgFn = fnText(G, 'damageEnemy(e, dmg, crit, opts = {})');
ok(dmgFn.indexOf('e.staggerT > 0') >= 0, 'damageEnemy 判 staggerT > 0');
ok(dmgFn.indexOf('e.staggerMul') >= 0, 'damageEnemy 乘 staggerMul');

/* ---------- 四、边界 ---------- */
console.log('\n四、边界：只乘伤害，不碰判定 / 玩家侧 / 写死数值');
/* staggerMul 只应出现在 damageEnemy（结算）与 tick（写入/复位） */
const mulHits = [];
G.split('\n').forEach((line, i) => {
  if (line.indexOf('staggerMul') >= 0) mulHits.push({ line: i + 1, text: line.trim().slice(0, 90) });
});
ok(mulHits.length > 0 && mulHits.length <= 6, 'staggerMul 出现次数受控（≤6）', mulHits.length);

/* 不许出现在 damagePlayer（玩家挨打不该被魔将的破绽放大） */
const dpFn = fnText(G, 'damagePlayer(amount, source, opts)');
ok(dpFn.length > 0 && dpFn.indexOf('staggerMul') < 0, 'damagePlayer 不读 staggerMul');

/* 不许写死 1.5：倍率一律从 cfg.stagger.mul 读 */
const tickFn = fnText(G, 'bossStaggerTick(e, dt)');
ok(tickFn.indexOf('stg.mul') >= 0, 'tick 从 stg.mul 读倍率（不是写死 1.5）');
ok(tickFn.indexOf('stg.dur') >= 0, 'tick 从 stg.dur 读时长');
const armFn = fnText(G, 'bossStaggerArm(e)');
ok(armFn.indexOf('cast.id !== stg.skill') >= 0, 'arm 只认 cfg.stagger.skill 那一招');
ok(armFn.indexOf('cast.sk.warm') >= 0, 'arm 用招式自己的前摇，不写死');

/* 视觉缺件不许连带机制：_staggerFx 的 FXK 调用要包 try/catch */
const fxFn = fnText(G, '_staggerFx(e, stg)');
ok(fxFn.indexOf('try') >= 0 && fxFn.indexOf('catch') >= 0, '_staggerFx 对 FXK 缺件有兜底');

/* 不许改判定的老字段：只检查本轮新增的三个方法（别的方法本来就有合法赋值） */
const newFns = [armFn, tickFn, fxFn].join('\n');
ok(newFns.indexOf('e.radius =') < 0 && newFns.indexOf('e.reach =') < 0,
  '三个新方法不写 e.radius / e.reach（判定几何）');
ok(newFns.indexOf('damagePlayer') < 0, '三个新方法不调 damagePlayer（只奖励打对的人）');

console.log('\n================================');
console.log('  M7.3 破绽窗口契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
