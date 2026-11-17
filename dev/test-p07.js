#!/usr/bin/env node
/* ============================================================
 * [P07] 悬赏板 —— 离线契约
 *
 *   node dev/test-p07.js
 *
 * 口径见 `docs/POLISH-PLAN.md` P07：
 *   独立浮层 `#boardPanel`，每行 = 类型色点 + 名称 + 目标 + **奖励预览** +
 *   剩余时间 / 冷却；已接的单独一栏带进度条；冷却中的置灰 + 倒计时。
 *   验收：三态一眼可分；剩余时间每秒跳；**关掉面板后 interval 必须清掉**。
 *
 * 本契约钉六件事：
 *   一、`QuestSys.boardAll()` 三态判定（active / cd / open），口径与 canOffer 一致
 *   二、四个 UI 方法都在，且 `renderBoard` 复用 P08 的奖励组件
 *   三、`closeAll` 必须清倒计时（不清就是关掉之后每秒还在算 DOM）
 *   四、倒计时每秒只改文本、状态变了才重排（重排会断 hover / 跳滚动）
 *   五、面板结构与三态样式存在
 *   六、反向：不许画数据里不存在的类型（「采集 / 护送」一个都没有）
 *
 * 真机看 dev/probe-p07.js。
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

const Q = strip(src('src/quests.js'));
const U = strip(src('src/ui.js'));
const G = strip(src('src/game.js'));
const H = src('index.html');

/* ---------- 一、boardAll 三态 ---------- */
console.log('一、QuestSys.boardAll：三态判定');
const fAll = fnText(Q, 'boardAll(part) {');
ok(fAll.length > 0, 'QuestSys.boardAll(part) 必须存在');
if (fAll) {
  ok(/active/.test(fAll) && /'cd'/.test(fAll) && /'open'/.test(fAll),
    '必须返回三种状态 active / cd / open');
  ok(/st\.active\.find/.test(fAll), 'active 必须读 state.quests.active（不另立一套判据）');
  ok(/st\.board\.cd/.test(fAll), 'cd 必须读 state.quests.board.cd');
  ok(/cdLeft/.test(fAll), '必须带 cdLeft（倒计时靠它）');
  ok(/count/.test(fAll), '必须带已完成次数（面板要显示「已做 N 次」）');
  ok(/questsOfPart\(part, 'board'\)/.test(fAll), '必须只取本卷的 board 类任务');
}
/* 数据侧：悬赏真的存在且只有两种 objective */
const B = q('QUESTS');
const boards = Object.keys(B).filter(id => B[id].kind === 'board');
ok(boards.length >= 20, '悬赏至少 20 条（5 卷 × 4）', boards.length);
const types = {};
for (const id of boards) {
  for (const o of (B[id].objectives || [])) types[o.type] = (types[o.type] || 0) + 1;
}
ok(!types.kill && !types.collect && !types.escort,
  '悬赏里不该出现 kill / collect / escort（实测只有 killAny 与 dungeon）', types);

/* ---------- 二、四个 UI 方法 ---------- */
console.log('二、UI 方法');
for (const sig of ['openBoard(part) {', 'closeBoard() {', 'renderBoard() {', 'tickBoard() {']) {
  ok(fnText(U, sig).length > 0, 'UI.' + sig.replace(' {', '') + ' 必须存在');
}
const fRender = fnText(U, 'renderBoard() {');
ok(/renderRewards\(q\.rewards\)/.test(fRender), '每行必须复用 P08 的 renderRewards（不另写一份奖励渲染）');
ok(/boardAll/.test(fRender), 'renderBoard 必须读 boardAll');
ok(/data-take/.test(fRender), '可接的行必须有「接下」按钮');
ok(/data-bd/.test(fRender), '冷却行必须带 data-bd（tick 靠它定位）');
ok(/bd-dot/.test(fRender), '必须有类型色点');
ok(/bd-bar/.test(fRender), '进行中必须有进度条');

/* ---------- 三、倒计时必须清 ---------- */
console.log('三、倒计时生命周期');
const fClose = fnText(U, 'closeAll(except) {');
ok(/closeBoard\(\)/.test(fClose), 'closeAll 必须调 closeBoard（否则关掉面板后每秒还在跑）');
const fCB = fnText(U, 'closeBoard() {');
ok(/clearInterval/.test(fCB), 'closeBoard 必须 clearInterval');
ok(/this\._boardTimer = null/.test(fCB), 'closeBoard 必须把句柄置空（留着就是个幽灵）');
const fOpen = fnText(U, 'openBoard(part) {');
ok(/clearInterval/.test(fOpen), 'openBoard 必须先清掉上一个 interval（连开两次不许叠两个）');
ok(/setInterval/.test(fOpen), 'openBoard 必须起 interval');
ok(/renderBoard\(\)/.test(fOpen), 'openBoard 必须先渲染一次（不能等第一次 tick）');

/* ---------- 四、tick 只改文本 ---------- */
console.log('四、tick：只改文本，状态变了才重排');
const fTick = fnText(U, 'tickBoard() {');
ok(/_boardSig/.test(fTick), 'tick 必须比对状态签名');
ok(/renderBoard\(\)/.test(fTick), '状态变了必须重排');
ok(/textContent = '冷却 '/.test(fTick), '冷却行只改 textContent（整块重排会断 hover、跳滚动）');
ok(/contains\('open'\)/.test(fTick), '面板没打开时 tick 必须自我关闭');

/* ---------- 五、结构 ---------- */
console.log('五、结构与样式');
ok(/id="boardPanel"/.test(H), 'index.html 必须有 #boardPanel');
ok(/id="boardBody"/.test(H), 'index.html 必须有 #boardBody');
ok(/id="boardSub"/.test(H), 'index.html 必须有 #boardSub（顶部计数）');
ok(/\.bd-row\.active\{/.test(H) && /\.bd-row\.cd\{/.test(H) && /\.bd-row\.open/.test(H),
  '三态必须各有一套样式（否则「一眼分出」做不到）');
ok(/class="panel" id="boardPanel"/.test(H), '#boardPanel 必须是 .panel（closeAll 靠这个类收）');

/* ---------- 六、反向 ---------- */
console.log('六、反向断言');
ok(!/'采集'/.test(U) && !/'护送'/.test(U),
  '不许出现「采集 / 护送」类型 —— 数据里一条都没有，画出来就是暗示不存在的内容');
ok(!/boardTake/.test(G), 'game.js 不许再调 boardTake 拼对话（面板已接管）');
const fGB = fnText(G, 'openBoard(part) {');
ok(/UI\.openBoard/.test(fGB), 'Game.openBoard 必须转发给 UI.openBoard');

console.log('\n================================');
console.log('  P07 悬赏板离线契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
