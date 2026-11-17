#!/usr/bin/env node
/* ============================================================
 * [M7.9] 文案对账 —— 说明页 / README 里写的每个数字，都得能从数据表推出来
 *
 *   node dev/check-help.js
 *
 * 为什么要有这一份：
 *   说明页（`ui.js`）是**动态生成**的，读的是 `BALANCE` / `BOSSES`，天然不会漂；
 *   但 `README.md` 是**手写文档**，改数值的人不一定记得回来改它。
 *   本项目最恨的就是「文案与实装脱节」—— 面板写着 9 轮回、代码改成 5，
 *   玩家点到第 6 次发现点不动，那这一句就是骗人。
 *
 * 所以这里把 README 里的**具体数字**全部反解出来，与数据表逐条比对；
 * 同时反向钉住 `ui.js` **不许硬编码**这些数字（必须读表）。
 *
 * 覆盖 M7.6（五阶段）/ M7.7（终局传世）/ M7.8（二周目）。
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
const ctx = loadData({});
const q = expr => vm.runInContext(expr, ctx);

const README = src('README.md');
/* 扫 ui.js 前先剥注释：注释里写「不许写死 20~34」是说明，不是实装。 */
const UI = src('src/ui.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const C = q('BALANCE.cycle');
const FU = q('BALANCE.finalUnique');
const F = q('BOSSES.chaosavatar.bafoFinal');

/* ---------- 一、二周目（M7.8） ---------- */
console.log('一、README · 二周目数字');
if (C) {
  const lvMax = C.lvPer * C.max;
  const mulMax = (1 + C.dropMul * C.max).toFixed(1);
  ok(README.indexOf(`最多 ${C.max} 轮回`) >= 0, `README 必须写「最多 ${C.max} 轮回」（数据是 ${C.max}）`);
  ok(README.indexOf(`怪物 +${lvMax} 级`) >= 0, `README 必须写「怪物 +${lvMax} 级」（${C.lvPer}×${C.max}）`);
  ok(README.indexOf(`×${mulMax}`) >= 0, `README 必须写「掉落 ×${mulMax}」（1+${C.dropMul}×${C.max}）`);
  ok(README.indexOf(`+${C.lvPer} / 轮回`) >= 0, `README 必须写「等级 +${C.lvPer} / 轮回」`);
  ok(README.indexOf(`+${Math.round(C.dropMul * 100)}% / 轮回`) >= 0,
    `README 必须写「掉落 +${Math.round(C.dropMul * 100)}% / 轮回」`);
  ok(README.indexOf('第 1 轮回正好 ×1.5') >= 0, 'README 必须写「第 1 轮回正好 ×1.5」（1+0.5×1）');
  ok(README.indexOf('山河图') >= 0 && README.indexOf('第几轮回') >= 0,
    'README 必须写「山河图卷头显示第几轮回」（否则玩家不知道有这个提示）');
}

/* ---------- 二、终局传世（M7.7） ---------- */
console.log('二、README · 终局传世数字');
if (FU) {
  const pc = v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  const R = FU.rate || {};
  for (const k of ['normal', 'hard', 'nightmare']) {
    ok(README.indexOf(pc(R[k])) >= 0, `README 必须写 ${k} 档的 ${pc(R[k])}（数据是 ${R[k]}）`);
  }
  const cr = (FU.guaranteed && FU.guaranteed.crystal) || [20, 34];
  ok(README.indexOf(`${cr[0]}~${cr[1]}`) >= 0, `README 必须写玄晶区间「${cr[0]}~${cr[1]}」`);
  ok(README.indexOf(`${(FU.guaranteed && FU.guaranteed.legendary) || 1} 件神兵`) >= 0,
    'README 必须写「必掉 N 件神兵」');
  ok(README.indexOf('先抽你没拿过的') >= 0, 'README 必须写「未收集优先」（这是长期目标成立的前提）');
  ok(README.indexOf('身上穿着') >= 0 || README.indexOf('行囊里放着') >= 0,
    'README 必须写「身上穿着 / 行囊里放着的也算收过」（否则老档玩家会以为要重新刷）');
}

/* ---------- 三、五阶段（M7.6） ---------- */
console.log('三、README · 五阶段数字');
if (F) {
  ok(README.indexOf('五段') >= 0, 'README 必须写「五段」');
  for (const n of (F.names || [])) {
    ok(README.indexOf(n) >= 0, `README 必须写出第 ${(F.names || []).indexOf(n) + 1} 段的名字「${n}」`);
  }
  ok(README.indexOf(`${Math.round((F.formAt || 0.2) * 100)}%`) >= 0,
    `README 必须写变身阈值 ${Math.round((F.formAt || 0.2) * 100)}%`);
  ok(README.indexOf(`${F.invuln || 3} 秒无敌`) >= 0, `README 必须写「${F.invuln || 3} 秒无敌」`);
  ok(README.indexOf(`每 ${F.weakRotate || 20} 秒`) >= 0, `README 必须写「每 ${F.weakRotate || 20} 秒换弱点」`);
  const sh = F.shrink || {};
  ok(README.indexOf(`${sh.r0} 米`) >= 0 && README.indexOf(`${sh.r1} 米`) >= 0,
    `README 必须写塌缩圈的 ${sh.r0} 米 → ${sh.r1} 米`);
  ok(README.indexOf(`${sh.dps}%`) >= 0, `README 必须写圈外每秒 ${sh.dps}% 最大生命`);
  ok(README.indexOf(`+${(F.rage && F.rage.aspd) || 40}%`) >= 0,
    `README 必须写「攻速 +${(F.rage && F.rage.aspd) || 40}%」`);
}

/* ---------- 四、反向：ui.js 不许硬编码 ---------- */
console.log('四、反向：说明页必须读表，不许写死');
/* 说明页里如果出现这些字面量，说明有人图省事抄了一份 —— 下次改数值就漂了。 */
const HARD = [
  [/最多 9 轮回/, '最多 9 轮回'],
  [/\+90 级/, '+90 级'],
  [/×5\.5/, '×5.5'],
  [/0\.01%/, '0.01%'],
  [/0\.03%/, '0.03%'],
  [/20~34/, '20~34']
];
for (const [re, label] of HARD) {
  ok(!re.test(UI), 'ui.js 里不许写死「' + label + '」（必须从 BALANCE 读，否则改表不生效）');
}
ok(/BALANCE\.cycle/.test(UI) || /BALANCE !== 'undefined' && BALANCE\.cycle/.test(UI),
  '说明页必须读 BALANCE.cycle');
ok(/BALANCE\.finalUnique/.test(UI), '说明页必须读 BALANCE.finalUnique');
ok(/bafoFinal/.test(UI), '说明页必须读 BOSSES.chaosavatar.bafoFinal');

/* ---------- 五、说明页渲染冒烟（不靠浏览器，只查关键字符串在函数体里） ---------- */
console.log('五、说明页结构');
ok(UI.indexOf("row('终门之后'") >= 0, '说明页必须有「终门之后」一行（五阶段）');
ok(UI.indexOf("row('真身怎么打'") >= 0, '说明页必须有「真身怎么打」一行（弱点轮换）');
ok(UI.indexOf("row('终局传世'") >= 0, '说明页必须有「终局传世」一行');
ok(UI.indexOf("row('入轮回'") >= 0, '说明页必须有「入轮回」一行');
ok(/_F\.names\.length/.test(UI), '说明页副标题的「N 阶段」必须读数据');
ok(/_C\.max/.test(UI), '说明页副标题的「最多 N 轮回」必须读数据');

console.log('\n================================');
console.log('  M7.9 文案对账：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
