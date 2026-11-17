#!/usr/bin/env node
/* ============================================================
 * [P08] 任务奖励提前可见 —— 离线契约
 *
 *   node dev/test-p08.js
 *
 * 口径见 `docs/POLISH-PLAN.md` P08：
 *   抽一个 `UI.renderRewards(rewards)`，三处复用：
 *   **接取对话 / 山海志任务卡 / P07 悬赏板**。
 *
 * 本契约钉五件事：
 *   一、组件存在，且读的是 `QUESTS[x].rewards` 的六个字段
 *   二、三处出口真的都调了（少一处就是「对话里有、任务卡里没有」）
 *   三、`showDialog` 支持第 4 参数（奖励要带品质色，不能拼进 textContent）
 *   四、文案口径：必须写「随机」，**不许写「按交任务时的等级生成」**
 *   五、容器存在（index.html 的 `#dlgReward`）
 *
 * 真机看 dev/probe-p08.js（逐字段比对「对话里写的」与「交任务实际给的」）。
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

const U = strip(src('src/ui.js'));
const G = strip(src('src/game.js'));
const H = src('index.html');

/* ---------- 一、组件 ---------- */
console.log('一、组件：UI.renderRewards');
const fR = fnText(U, 'renderRewards(r) {');
ok(fR.length > 0, 'UI.renderRewards(r) 必须存在');
if (fR) {
  ok(/r\.xp/.test(fR), '必须渲染经验（xp）');
  ok(/r\.gold/.test(fR), '必须渲染金币（gold）');
  ok(/r\.rarity/.test(fR) && /RARITY\[/.test(fR), '必须渲染装备品质，且读 RARITY 拿名字与颜色');
  ok(/r\.ilvl/.test(fR), '必须渲染装备等级（ilvl）');
  ok(/r\.skill/.test(fR), '必须渲染技能书（skill）');
  ok(/r\.talent/.test(fR), '必须渲染天赋点（talent）');
  ok(/随机/.test(fR), '装备必须写「随机」—— 玩家会以为给的是某一件固定装备');
  ok(!/按交任务时的等级生成/.test(fR),
    '**不许**写「按交任务时的等级生成」：`QuestSys.turnIn` 用的是 rewards.ilvl 固定值，写了就是骗人');
}

/* 数据侧：真的每个字段都有任务在用（否则渲染了也白渲染） */
const Q = q('QUESTS');
const ids = Object.keys(Q || {});
ok(ids.length > 40, '任务表至少 40 条', ids.length);
const seen = { xp: 0, gold: 0, ilvl: 0, rarity: 0, skill: 0, talent: 0 };
for (const id of ids) {
  const r = (Q[id] || {}).rewards || {};
  for (const k in seen) if (r[k] !== undefined) seen[k]++;
}
for (const k of ['xp', 'gold', 'ilvl', 'rarity']) {
  ok(seen[k] > 40, `字段 ${k} 必须有大量任务在用（实测 ${seen[k]} 条）`);
}
ok(seen.skill > 0, '技能书奖励至少有一条任务在给', seen.skill);
ok(seen.talent > 0, '天赋点奖励至少有一条任务在给', seen.talent);

/* ---------- 二、三处出口 ---------- */
console.log('二、三处出口');
const fOpen = fnText(G, 'openGiver(npcId) {');
ok(fOpen.length > 0, 'openGiver 必须存在');
const offerCalls = (fOpen.match(/UI\.renderRewards\(/g) || []).length;
ok(offerCalls >= 2, '接取对话至少两处调 renderRewards（首接 + 下一环），实测 ' + offerCalls);
ok(/UI\.renderRewards\(q\.rewards\)/.test(fOpen), '首接新委托必须带奖励');
ok(/UI\.renderRewards\(nx\.rewards\)/.test(fOpen), '复命后接下一环也必须带奖励');

const fQuest = fnText(U, 'renderQuests() {');
ok(/renderRewards\(q\.rewards\)/.test(fQuest), '山海志任务卡必须带奖励');
ok(fQuest.indexOf('${rw}') > 0, '奖励必须真的插进任务卡 HTML（算出来不插是最典型的漏法）');

/* P07 的悬赏板还没做，先只要求组件本身可用（P07 落地时这里会加断言） */
ok(/renderRewards/.test(U), '悬赏板将来复用同一个组件（P07）');

/* ---------- 三、showDialog 第 4 参数 ---------- */
console.log('三、showDialog 第 4 参数');
const fDlg = fnText(U, 'showDialog(name, text, options, rewardHtml) {');
ok(fDlg.length > 0, 'showDialog 必须有第 4 个可选参数 rewardHtml');
ok(/dlgReward/.test(fDlg), 'showDialog 必须把奖励写进 #dlgReward');
ok(/innerHTML/.test(fDlg), '奖励必须走 innerHTML（品质色需要标签）');
ok(/rewardHtml \|\| ''/.test(fDlg), '不传奖励时必须清空（否则上一句对话的奖励会粘在下一条上）');

/* 反向：奖励不许拼进 text —— dlgText 走 textContent，标签会原样显示 */
ok(!/dlgText'\)\.innerHTML/.test(U), 'dlgText 不许改成 innerHTML（会引入注入面，且正文是纯文本契约）');

/* ---------- 四、容器 ---------- */
console.log('四、容器');
ok(/id="dlgReward"/.test(H), 'index.html 必须有 #dlgReward');
ok(/#dialog \.dr/.test(H), '#dialog .dr 必须有样式');
ok(/:not\(:empty\)/.test(H), '奖励条必须靠 :empty 自动显隐（不写死 display，少一处开关）');

console.log('\n================================');
console.log('  P08 奖励预览离线契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
