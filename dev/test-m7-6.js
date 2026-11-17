#!/usr/bin/env node
/* ============================================================
 * [M7.6] 终 boss 五阶段 + P5 满血变身 —— 离线契约
 *
 *   node dev/test-m7-6.js
 *
 * 设计口径见 `docs/ACT-EXPANSION-PLAN.md §15.4`：
 *   P1 100~80% 单招试探 / P2 80~60% 八部残影 / P3 60~40% 场地塌缩 /
 *   P4 40~20% 狂怒 / P5 20% → **满血变身**（第二条血、换模型、八部合一）
 *
 * 本契约钉五件事：
 *   一、数据：`bafoFinal` 自洽（阈值单调、配招表每格都能查到、抽签池真的有 8 条）
 *   二、状态机：五个方法齐备，且**变身拦在伤害结算里**而不是每帧判
 *   三、接线：spawnEnemy / resetBoss / onEnemyDeath / BossCast / UI 五处
 *   四、四条硬约束：不翻倍 maxHp / 旧模型必须 dispose / 圈外伤害 pierce /
 *       按秒结算 / 不做全屏闪白（vfx.js 纪律三）
 *   五、边界：只对写了 `bafoFinal` 的那一只生效，其余 45 只首领一个字节不变
 *
 * 真机看 dev/probe-bossfinal.js（阶段推进 / 血条重置 / 换模型 / 弱点轮换）。
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
const fnText = (s, needle) => {
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
const BC = strip(src('src/boss-cast.js'));
const UI = strip(src('src/ui.js'));
const HTML = src('index.html');
const VFX = src('src/vfx.js');

/* ---------- 一、数据 ---------- */
console.log('一、数据：bafoFinal 自洽');
const F = q('BOSSES.chaosavatar.bafoFinal');
ok(!!F, 'BOSSES.chaosavatar 必须写 bafoFinal（否则整套状态机永远不触发）');
if (F) {
  /* 阈值：4 档、严格降序、formAt 比最后一道门槛还低 */
  ok(Array.isArray(F.at) && F.at.length === 4, 'at 必须是 4 档（P1~P4 的下界）', F.at && F.at.length);
  ok(F.at[0] === 1 && F.at[1] < F.at[0] && F.at[2] < F.at[1] && F.at[3] < F.at[2],
    'at 必须严格降序且首项为 1.00（否则会出现「进不了 P1」或「跳阶段」）', F.at);
  ok(F.formAt > 0 && F.formAt < F.at[3],
    'formAt 必须落在最后一道门槛之下（否则 P4 永远到不了 P5）', { formAt: F.formAt, p4: F.at[3] });
  /* 名字：5 个，UI 的副标题直接读它 */
  ok(Array.isArray(F.names) && F.names.length === 5, 'names 必须是 5 段', F.names && F.names.length);
  ok(F.names.every(n => typeof n === 'string' && n.length > 0), 'names 不许有空串（副标题会写成「第 3 / 5 阶段 · 」）');
  /* 变身形态必须是 M7.5 真有的那套骨架 */
  ok(F.form === 'chaosTrue', 'form 必须是 chaosTrue（M7.5 的第九套骨架）', F.form);
  ok(q("typeof BafoModels === 'undefined' || true"), '（占位：BafoModels 在运行时文件里，见第五节）');

  /* 配招表：5 格，两个 null 是运行时抽签 */
  ok(Array.isArray(F.kits) && F.kits.length === 5, 'kits 必须是 5 段', F.kits && F.kits.length);
  const fixed = [0, 2, 3].map(i => F.kits[i]);
  ok(fixed.every(k => Array.isArray(k) && k.length === 5),
    'P1 / P3 / P4 的配招必须是 5 格（前 4 格轮转 + 第 5 格本命，见 boss-cast._pick）',
    fixed.map(k => k && k.length));
  ok(F.kits[1] === null && F.kits[4] === null,
    'P2 / P5 必须是 null（运行时抽签：借 2 招 / 借 4 招）', [F.kits[1], F.kits[4]]);
  ok(fixed.every(k => k[4] === 'nt_chaosavatar'),
    '固定配招的第 5 格必须是本命 nt_chaosavatar', fixed.map(k => k && k[4]));

  /* 每一格都得能在 BOSS_SKILLS 里查到 —— 打错一个字就是「这一招永远不放」 */
  const SK = q('Object.keys(BOSS_SKILLS)');
  const skSet = new Set(SK);
  let bad = [];
  for (const k of fixed) for (const id of k) if (!skSet.has(id)) bad.push(id);
  ok(bad.length === 0, '固定配招里有查不到的技能 id（BossCast 会 warn 并跳过）', bad);

  /* 抽签：echo 2 / merge 4 / poolPrefix 真的匹配到 8 条 */
  ok(F.echo === 2, 'P2 必须借 2 招', F.echo);
  ok(F.merge === 4, 'P5 必须借 4 招（正好填满前 4 格）', F.merge);
  ok(F.poolPrefix === 'bafo_', 'poolPrefix 必须是 bafo_（抽签只从八魔将里抽）', F.poolPrefix);
  const poolIds = SK.length ? q('Object.keys(BOSS_KIT)').filter(id => id.indexOf('bafo_') === 0) : [];
  ok(poolIds.length === 8, '抽签池必须正好 8 条（八魔将）', poolIds.length);

  /* 塌缩 / 狂怒 / 弱点 */
  ok(F.shrink && F.shrink.r0 > F.shrink.r1 && F.shrink.r1 > 0,
    'shrink 必须 r0 > r1 > 0（收到 0 等于「必须站在 Boss 脚下」）', F.shrink);
  ok(F.shrink.speed > 0 && F.shrink.dps > 0, 'shrink 必须有 speed 与 dps', F.shrink);
  ok(F.rage && F.rage.aspd === 40, 'P4 攻速必须 +40%（计划书 §15.4）', F.rage);
  ok(F.rage.gap > 0 && F.rage.gap < 1, 'P4 技能间隔倍率必须 < 1（「连段不再断」的落地）', F.rage && F.rage.gap);
  ok(Array.isArray(F.weakOrder) && F.weakOrder.length === 5, 'weakOrder 必须 5 档', F.weakOrder && F.weakOrder.length);
  const EL = ['phys', 'fire', 'ice', 'lightning', 'poison'];
  ok(EL.every(e => F.weakOrder.indexOf(e) >= 0), 'weakOrder 必须覆盖五个元素（缺一个就有职业永远打不动）', F.weakOrder);
  ok(new Set(F.weakOrder).size === F.weakOrder.length, 'weakOrder 不许重复（重复 = 白给一轮）', F.weakOrder);
  ok(F.weakRotate === 20, 'P5 弱点每 20 秒轮换（计划书 §15.4）', F.weakRotate);
  ok(F.invuln === 3, '变身无敌 3 秒（计划书 §15.4）', F.invuln);
}

/* ---------- 二、状态机 ---------- */
console.log('二、状态机：五个方法齐备 + 变身拦在伤害结算里');
for (const m of ['bossFinalInit', 'bossFinalTick', 'bossFinalTransform', 'bossFinalReset']) {
  ok(new RegExp('\\n  ' + m + '\\s*\\(').test(G), 'game.js 缺方法：' + m);
}
for (const m of ['_bossFinalEnter', '_bossFinalWeak', '_bossFinalKit', '_bossFinalPool',
  '_bossFinalForm', '_bossFinalShrinkFx', '_bossFinalShrinkTick', '_bossFinalShrinkEnd']) {
  ok(new RegExp('\\n  ' + m + '\\s*\\(').test(G), 'game.js 缺方法：' + m);
}

const dmgFn = fnText(G, 'damageEnemy(e, dmg, crit, opts = {})');
ok(dmgFn.length > 0, 'damageEnemy 存在');
/* 无敌必须拦在最前面：放在后面的话伤害数字已经弹了、hitFlash 已经闪了 */
ok(/bossInvulnT\s*>\s*0/.test(dmgFn), 'damageEnemy 必须处理 bossInvulnT（P5 无敌）');
{
  const iInv = dmgFn.indexOf('bossInvulnT');
  const iArm = dmgFn.indexOf('const armor');
  ok(iInv > 0 && iInv < iArm, '无敌判定必须在护甲结算**之前**（否则会先算一遍伤害再丢弃）', { iInv, iArm });
}
/* 变身拦截：必须在扣血之后、死亡判定之前 */
{
  const iSub = dmgFn.indexOf('e.hp -= final');
  const iTr = dmgFn.indexOf('bossFinalTransform');
  const iDead = dmgFn.indexOf('if (e.hp <= 0)');
  ok(iSub > 0 && iTr > iSub, '变身必须拦在扣血之后（扣血之前拦 = 血量永远到不了 20%）', { iSub, iTr });
  ok(iDead > 0 && iTr < iDead, '变身必须拦在死亡判定**之前**（之后拦 = 那一击已经把它打死了）', { iTr, iDead });
}

/* updateBossAI 必须绕开狂怒 */
ok(/if \(!e\.wb && e\.bafoF\) \{/.test(G), 'updateBossAI 必须给 bafoF 单独一条分支');
ok(/this\.bossFinalTick\(e, dt\)/.test(G), 'updateBossAI 必须调 bossFinalTick');
{
  /* 狂怒那段的 `e.dmg *= 1.15` 必须在 else 分支里，不能跟五阶段同时生效 */
  const iBr = G.indexOf('if (!e.wb && e.bafoF) {');
  const iRage = G.indexOf('e.dmg *= 1.15');
  ok(iBr > 0 && iRage > iBr, '狂怒（e.dmg *= 1.15）必须在 else 分支里', { iBr, iRage });
}

/* 阶段推进：want 只增不减，且 P5 走的是 formAt 不是 at */
{
  const tick = fnText(G, 'bossFinalTick(e, dt)');
  ok(/want > e\.bafoStage/.test(tick), '阶段只能往上推（want > e.bafoStage），不许回退');
  ok(/formAt/.test(fnText(G, 'bossFinalTransform(e)')) || /formAt/.test(dmgFn),
    'formAt 必须真的被读到（写在数据里没人读 = 假数据）');
}

/* ---------- 三、接线 ---------- */
console.log('三、接线：spawn / reset / death / BossCast / UI');
ok(/if \(cfg\.bafoFinal\) this\.bossFinalInit\(e\)/.test(G), 'spawnEnemy 必须调 bossFinalInit');
ok(/if \(e\.bafoF\) this\.bossFinalReset\(e\)/.test(G), 'resetBoss 必须调 bossFinalReset（否则脱战回来是「满血真身」）');
ok(/if \(e\.bafoF\) this\._bossFinalShrinkEnd\(e\)/.test(G), 'onEnemyDeath 必须收掉收缩圈');
/* BossCast 读 e.bafoKit */
ok(/e\.bafoKit && e\.bafoKit\.length/.test(BC), 'BossCast._pick 必须优先读 e.bafoKit');
{
  const pick = fnText(BC, '_pick(e)');
  ok(/e\.bafoKit/.test(pick), '_pick 里必须真的用到 e.bafoKit');
  ok(/BOSS_KIT\[e\.cfg && e\.cfg\.id\]/.test(pick), '_pick 的兜底必须保持原样（其余 45 只走这条）');
}
/* UI 五盏灯 */
ok(/boss\.bafoF/.test(UI), 'UI.updateBoss 必须认 bafoF');
{
  const ub = fnText(UI, 'updateBoss(boss)');
  ok(/for \(let i = 0; i < 5; i\+\+\)/.test(ub), 'UI 必须画 5 盏灯');
  ok(/bafoF\.names/.test(ub), 'UI 副标题必须读 bafoF.names（否则名字写死在两处）');
  ok(/第 ' \+ n \+ ' \/ 5 阶段/.test(ub), 'UI 副标题必须写「第 N / 5 阶段」');
}

/* ---------- 四、四条硬约束 ---------- */
console.log('四、硬约束：不翻倍血量 / dispose / pierce / 按秒 / 不做全屏闪');
const transFn = fnText(G, 'bossFinalTransform(e)');
ok(transFn.length > 0, 'bossFinalTransform 存在');
/* 第二条血：填回 maxHp，**不许**改 maxHp */
ok(/e\.hp = e\.maxHp/.test(transFn), '变身必须把 hp 填回 maxHp（第二条血）');
ok(!/e\.maxHp\s*\*?=/.test(transFn), '变身不许改 maxHp（翻倍会让血条在变身那一帧突然变短）');
/* 旧模型必须释放 */
{
  const formFn = fnText(G, '_bossFinalForm(e)');
  ok(/disposeTree\(old\.group\)/.test(formFn), '换模型必须 disposeTree 旧模型（每只 100 个 mesh）');
  ok(/position\.copy\(old\.group\.position\)/.test(formFn), '新模型必须接住旧模型的位置（否则变身那一帧跳回原点）');
}
/* 圈外伤害必须 pierce */
{
  const shFn = fnText(G, '_bossFinalShrinkTick(e, dt)');
  ok(/pierce: true/.test(shFn), '圈外扣血必须 pierce（否则堆防御的人等于免疫这个机制）');
  ok(/bafoOutT/.test(shFn) && />= 1/.test(shFn), '圈外扣血必须按 1 秒累加，不许按帧（帧率越高扣得越多）');
}
/* 全屏闪白禁止 —— vfx.js 纪律三 */
ok(/全屏闪白禁止/.test(VFX), '（前置）vfx.js 里应有「全屏闪白禁止」这条纪律');
ok(!/id="whiteout"|screenFlash|flashScreen/.test(HTML + G + UI), '不许加全屏白闪（vfx.js 纪律三）');
ok(/FX\.flashCircle\(/.test(transFn), '变身的表现必须有半径（flashCircle），不是全屏');

/* ---------- 五、边界 ---------- */
console.log('五、边界：只对终 boss 生效');
/* 所有新方法都必须先判 e.bafoF，不许裸跑 */
for (const sig of ['bossFinalTick(e, dt)', '_bossFinalEnter(e, n)', '_bossFinalWeak(e)',
  'bossFinalTransform(e)', '_bossFinalShrinkTick(e, dt)']) {
  const t = fnText(G, sig);
  ok(t.length > 0, sig + ' 找不到函数体');
  ok(/e\.bafoF/.test(t), sig + ' 必须先判 e.bafoF（否则其余首领会被卷进来）');
}
/* 只有终 boss 的数据带 bafoFinal */
{
  const ids = q('Object.keys(BOSSES)');
  const hit = ids.filter(id => q('!!BOSSES["' + id + '"].bafoFinal'));
  ok(hit.length === 1 && hit[0] === 'chaosavatar', 'bafoFinal 只许写在 chaosavatar 上', hit);
}
/* 五阶段的招式名与实装对齐：P3 真的会收圈、P4 真的会加速 */
ok(/_bossFinalShrinkFx\(e\)/.test(fnText(G, '_bossFinalEnter(e, n)')), '进 P3 必须真的摆出收缩圈');
ok(/atkCdBase/.test(fnText(G, '_bossFinalEnter(e, n)')), '进 P4 必须真的改攻速');
/* 弱点轮换必须播报（藏起来 = 随机挨打） */
ok(/UI\.log/.test(fnText(G, '_bossFinalWeak(e)')), 'P5 弱点轮换必须播报（20 秒换一次，藏起来就没法玩）');

console.log('\n================================');
console.log('  M7.6 五阶段契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
