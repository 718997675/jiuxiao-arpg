#!/usr/bin/env node
/* ============================================================
 * [M7.8] 二周目（轮回）最小闭环 —— 离线契约
 *
 *   node dev/test-m7-8.js
 *
 * 设计口径见 `docs/ACT-EXPANSION-PLAN.md §15.7`：
 *   击杀终 boss → 「入轮回」→ 保留装备 / 等级 / 印，`state.cycle += 1`
 *   轮回后：怪物等级 +10/轮回、掉落 ×1.5/轮回、传世池不变
 *   轮回数进存档，山河图标题显示「第 N 轮回」
 *   **不做**：剧情重跑 / 任务重置 / 装备清零
 *
 * 本契约钉七件事：
 *   一、数据：`BALANCE.cycle` 三个旋钮 + 第 1 轮回正好 ×1.5
 *   二、三个口径方法：cycle / cycleLv / cycleDropMul，且都从 BALANCE 派生
 *   三、`diff()`：倍率只乘 drop、有缓存、key 含轮回
 *   四、等级加成只加一次：`lv0` 存基础等级，三处召唤都传 lv0
 *   五、存档三处（normalizeDoc / pack / unpack），少一处就是「存得进读不回」
 *   六、接线：终 boss 不重生 + 走 cycleOffer + enterCycle 真的 +1
 *   七、反向断言：enterCycle 不许清任何东西（装备 / 等级 / 印 / 任务）
 *
 * 真机看 dev/probe-cycle.js。
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
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* 取一个方法的函数体。`sig` 必须带到 `(`，且 `{` 必须在**同一行** ——
 * 否则说明签名没传全（M7.6 踩过：`fnText(G,'bossFinalTick(')` 静默返回空串，
 * 五条断言一起挂，报错却指向别处）。 */
function fnText(s, sig) {
  const i = s.indexOf(sig);
  if (i < 0) return '';
  const nl = s.indexOf('\n', i);
  const b = s.indexOf('{', i);
  if (b < 0 || (nl >= 0 && b > nl)) return '';
  let d = 0;
  for (let k = b; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) return s.slice(b, k + 1); }
  }
  return '';
}

const ctx = loadData({});
const q = expr => vm.runInContext(expr, ctx);

const G = strip(src('src/game.js'));
const U = strip(src('src/ui.js'));
const SV = strip(src('src/core/save.js'));
const H = src('index.html');

/* ---------- 一、数据 ---------- */
console.log('一、数据：BALANCE.cycle');
const C = q('BALANCE.cycle');
ok(!!C, 'BALANCE 必须有 cycle（没有 = 二周目没有旋钮，数字会散落在代码里）');
if (C) {
  ok(C.max === 9, '轮回上限 9（本节点自定，理由写在 data-core.js 注释里）', C.max);
  ok(C.lvPer === 10, '每轮回怪物等级 +10', C.lvPer);
  ok(C.dropMul === 0.5, '每轮回掉落 +50%（第 1 轮回正好 ×1.5，对上计划书字面值）', C.dropMul);
  ok(1 + C.dropMul * 1 === 1.5, '第 1 轮回的倍率必须正好是 1.5', 1 + C.dropMul);
  ok(C.max > 0 && C.max <= 20, '上限要在 1~20 之间（再高就不是「难」而是「打不动」）', C.max);
}

/* ---------- 二、三个口径方法 ---------- */
console.log('二、口径：cycle / cycleLv / cycleDropMul');
const fCycle = fnText(G, 'cycle() {');
const fLv = fnText(G, 'cycleLv() {');
const fMul = fnText(G, 'cycleDropMul() {');
const fCfg = fnText(G, 'cycleCfg() {');
ok(fCycle.length > 0, 'Game.cycle() 必须存在（读 `state.cycle` 并夹取）');
ok(fLv.length > 0, 'Game.cycleLv() 必须存在');
ok(fMul.length > 0, 'Game.cycleDropMul() 必须存在');
ok(fCfg.length > 0, 'Game.cycleCfg() 必须存在（唯一的旋钮来源）');
ok(/BALANCE/.test(fCfg), 'cycleCfg 必须读 BALANCE.cycle，不许在方法里写死数字');
ok(/this\.cycle\(\)/.test(fCycle) || /state\.cycle/.test(fCycle), 'cycle() 必须读 state.cycle', fCycle.slice(0, 80));
ok(/Math\.max\(0/.test(fCycle) && /Math\.min/.test(fCycle), 'cycle() 必须夹在 0~max（脏存档不许把倍率放大）');
ok(/lvPer/.test(fLv), 'cycleLv 必须乘 lvPer，不许写死 10');
ok(/dropMul/.test(fMul), 'cycleDropMul 必须乘 dropMul，不许写死 0.5');

/* 用 BALANCE 复算三档，确认公式与常量一致（不是只对了一遍源码字符串） */
const mulAt = c => 1 + c * q('BALANCE.cycle.dropMul');
ok(mulAt(0) === 1, '第 0 轮回倍率必须是 1（新档手感一个字节都不许变）', mulAt(0));
ok(mulAt(1) === 1.5, '第 1 轮回 ×1.5', mulAt(1));
ok(mulAt(3) === 2.5, '第 3 轮回 ×2.5', mulAt(3));
ok(mulAt(9) === 5.5, '第 9 轮回 ×5.5（线性，不是 1.5^9≈38 倍）', mulAt(9));

/* ---------- 三、diff() ---------- */
console.log('三、diff()：倍率只乘 drop + 缓存');
const fDiff = fnText(G, 'diff() {');
ok(fDiff.length > 0, 'diff() 必须存在');
ok(/cycleDropMul\(\)/.test(fDiff), 'diff() 必须调 cycleDropMul（否则掉率永远不涨）');
ok(/drop:\s*\(d\.drop \|\| 1\) \* m/.test(fDiff),
  '倍率必须只乘在 drop 上 —— 乘到 mobHp / mobDmg 就是「轮回后怪更硬但掉得一样多」', fDiff.slice(0, 200));
ok(!/mobHp\s*\*/.test(fDiff) && !/mobDmg\s*\*/.test(fDiff),
  'diff() 里不许乘 mobHp / mobDmg（轮回不是难度档，怪物强度由等级 +10 自然带出来）');
ok(/_diffKey/.test(fDiff) && /_diffCfg/.test(fDiff), 'diff() 必须有缓存（它在 spawnEnemy 与每帧 AI 里都被调）');
ok(/this\.cycle\(\)/.test(fDiff), '缓存 key 必须含轮回数，否则入轮回后还读旧配置');

/* ---------- 四、等级加成只加一次 ---------- */
console.log('四、等级：lv0 + 三处召唤回传');
ok(/const lv0 = levelOverride \|\| \(mapLv \+ RNDI\(-1, 2\)\)/.test(G),
  'spawnEnemy 必须先把「基础等级」算成 lv0');
ok(/const lvl = lv0 \+ this\.cycleLv\(\)/.test(G),
  '最终等级必须是 lv0 + cycleLv()，且**只加这一次**');
ok(/lv0: lv0,/.test(G), '实体上必须存 lv0（召唤物回传用）');
ok(!/level: lv0,/.test(G), '不许把 lv0 当 level 存（那样轮回加成就丢了）');

/* 三处回传点分别断言。不用统一模式是因为 summonMinions 传的是纯 `e.lv0`
 * （它不可能是 undefined），另外两处带 `|| e.level` 兜底 —— 形状本来就不同。 */
ok(/false, e\.lv0\)/.test(G), 'summonMinions 必须回传 e.lv0');
ok(/\(e\.lv0 \|\| e\.level\) - T\.levelDrop/.test(G), '图腾类召唤必须回传 lv0');
ok(/\(e\.lv0 \|\| e\.level\) - 2\)/.test(G), '分裂 / 二段召唤必须回传 lv0');
ok(!/false, e\.level\)/.test(G), '不许有 spawnEnemy(..., e.level) 的裸传（会被加第二次）');
ok(!/Math\.max\(1, e\.level - /.test(G), '不许有 `e.level - N` 裸传（同上）');

/* ---------- 五、存档三处 ---------- */
console.log('五、存档：normalizeDoc / pack / unpack');
ok(/d\.cycle = this\._int\(d\.cycle, 0, this\._cycleMax\(\), 0\)/.test(SV),
  'normalizeDoc 必须整形 cycle（老档 → 0）');
ok(/cycle: this\._int\(s\.cycle, 0, this\._cycleMax\(\), 0\)/.test(SV),
  'pack 必须搬 cycle');
ok(/cycle: this\._int\(doc\.cycle, 0, this\._cycleMax\(\), 0\)/.test(SV),
  'unpack 必须搬 cycle（少这行 = 轮回一次、刷新回第一周目）');
ok(/state\.cycle = 0/.test(G) || /cycle: 0,/.test(G), 'startNew 必须显式写 cycle: 0');
const fMax = fnText(SV, '_cycleMax() {');
ok(fMax.length > 0 && /BALANCE/.test(fMax), '_cycleMax 必须读 BALANCE.cycle.max（存档与游戏同一口径）');

/* ---------- 六、接线 ---------- */
console.log('六、接线：终 boss → cycleOffer → enterCycle');
ok(/e\.kind === 'chaosavatar'/.test(G), 'onEnemyDeath 必须有 chaosavatar 专属分支');
ok(/this\.cycleOffer\(\)/.test(G), '击杀终 boss 必须调 cycleOffer');
const fDeath = fnText(G, 'onEnemyDeath(');
ok(!/chaosavatar[\s\S]{0,600}75000/.test(fDeath),
  '终 boss 分支里不许出现 75 秒重生（它不该重生，走图重进即可）');

const fOffer = fnText(G, 'cycleOffer() {');
ok(fOffer.length > 0, 'cycleOffer() 必须存在');
ok(/C\.max/.test(fOffer), 'cycleOffer 必须判上限（到顶要明确说「只剩虚空」）');
ok(/enterCycle/.test(fOffer), 'cycleOffer 的按钮必须调 enterCycle');

const fEnter = fnText(G, 'enterCycle() {');
ok(fEnter.length > 0, 'enterCycle() 必须存在');
ok(/this\.state\.cycle = cy \+ 1/.test(fEnter), 'enterCycle 必须真的 +1');
ok(/this\.save\(\)/.test(fEnter), 'enterCycle 必须立刻存档（轮回是不可逆进度，丢了等于白打一局）');
ok(/_diffKey = null/.test(fEnter), 'enterCycle 必须让 diff() 缓存失效');
ok(/travelTo\('chaossea'\)/.test(fEnter), 'enterCycle 必须送回枢纽（无相天只有 boss，留在原地只能自己走出去）');

/* ---------- 七、反向断言：什么都不许清 ---------- */
console.log('七、反向：enterCycle 不许重置任何东西');
const FORBID = [
  ['state.inventory', '行囊'],
  ['state.equipment', '身上装备'],
  ['state.level', '等级'],
  ['state.seals', '魔将之印'],
  ['state.quests', '任务'],
  ['state.codex', '图鉴'],
  ['state.codexUnique', '传世收集账'],
  ['state.skills', '技能'],
  ['state.talents', '天赋']
];
for (const [field, name] of FORBID) {
  ok(fEnter.indexOf(field) < 0, 'enterCycle 不许碰 ' + name + '（' + field + '）—— 计划书明写「保留」');
}

/* 反向：不许改地图等级 / 装备上限 */
ok(!/MAPS\[[^\]]*\]\.level\s*=/.test(G), '不许改写 MAPS[].level（地图定位不该被轮回改写）');
ok(!/ILVL_MAX\s*=/.test(G), '不许在 game.js 里改写 ILVL_MAX');

/* ---------- 八、UI ---------- */
console.log('八、UI：山河图轮回标记');
ok(/Game\.cycle\(\)/.test(U), '山河图必须读 Game.cycle()');
ok(/wm-cyc/.test(U), '轮回标记必须有独立 class（否则和等级区间糊成一行）');
ok(/cycleLv\(\)/.test(U) && /cycleDropMul\(\)/.test(U),
  '山河图必须同时写「怪物 +N 级」和「掉落 ×M」—— 只写「第 N 轮回」会让「60 级图配 70 级怪」读起来像骗人');
ok(/\.wm-cyc\{/.test(H), 'index.html 必须有 .wm-cyc 样式');
ok(/const cycTag = cyc\s*\n\s*\?/.test(U) && /: '';/.test(U),
  '第 0 轮回不许显示标记（新档看到「第 0 轮回」是噪音）');

console.log('\n================================');
console.log('  M7.8 二周目离线契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
