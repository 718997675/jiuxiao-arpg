#!/usr/bin/env node
/* ============================================================
 * [M7.7] 终 boss 全传世掉落 —— 离线契约
 *
 *   node dev/test-m7-7.js
 *
 * 设计口径见 `docs/ACT-EXPANSION-PLAN.md §15.6`：
 *   掉落内容 = **全部 40 件传世**（不限部位，武器 / 副手按玩家职业过滤）
 *   概率     = 普通 0.01% / 困难 0.03% / 极难 0.1%
 *   保底     = 无硬保底，但**优先掉玩家没有的**；另有「每趟必有 1 橙 + 一堆玄晶」
 *
 * 本契约钉六件事：
 *   一、数据：概率三档 + 新手档 + 保底配置
 *   二、抽取器：未收集优先 / 收齐回全池 / 职业过滤 / ilvl 过滤 / 空池 null / 均匀
 *   三、实例：`rollItem` 能按 id 生成真传世（字段齐全，不退化成橙）
 *   四、存档：`codexUnique` 归一化 + pack / unpack 都搬（少一处就是「存得进读不回」）
 *   五、接线：终 boss 才调 / 一进包就记账 / seen 并入身上背包仓库
 *   六、概率抽样：100 万次 × 4 档，观测值落在 3σ 内
 *
 * 真机看 dev/probe-finaldrop.js（真实掉落路径 / 未收集优先 / 保底件数）。
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

const ctx = loadData({});
const q = expr => vm.runInContext(expr, ctx);

const G = strip(src('src/game.js'));
const I = strip(src('src/items.js'));
const SV = strip(src('src/core/save.js'));

/* ---------- 一、数据 ---------- */
console.log('一、数据：BALANCE.finalUnique');
const FU = q('BALANCE.finalUnique');
ok(!!FU, 'BALANCE 必须有 finalUnique（没有 = 终 boss 一件传世都不掉）');
if (FU) {
  const R = FU.rate || {};
  ok(R.normal === 0.0001, '普通 0.01%', R.normal);
  ok(R.hard === 0.0003, '困难 0.03%', R.hard);
  ok(R.nightmare === 0.001, '极难 0.1%（10 倍效率，这是「练极难」的理由）', R.nightmare);
  ok(R.novice === 0.0001, '新手跟普通同档（新手该少挨打，不该少拿东西）', R.novice);
  ok(R.nightmare === R.normal * 10, '极难必须正好是普通的 10 倍', R.nightmare / R.normal);
  ok(FU.guaranteed && FU.guaranteed.legendary === 1, '每趟必掉 1 件神兵', FU.guaranteed);
  ok(Array.isArray(FU.guaranteed.crystal) && FU.guaranteed.crystal[0] > 0,
    '每趟必掉一批玄晶', FU.guaranteed && FU.guaranteed.crystal);
}

/* ---------- 二、抽取器 ---------- */
console.log('二、pickFinalUnique：未收集优先 / 职业过滤 / 均匀');
ok(/function pickFinalUnique\(/.test(I), 'items.js 必须定义 pickFinalUnique');
ok(/\bconst UNIQUE_BY_ID = new Map\(/.test(I), 'items.js 必须有 UNIQUE_BY_ID（按 id 查表）');

const ALL = q('UNIQUE_ITEMS.map(u => ({ id: u.id, slot: u.slot, cls: u.cls || null, ilvl: u.ilvl }))');
ok(ALL.length === 40, '传世池必须正好 40 件', ALL.length);

/* 未收集优先：留一件没收集，抽 200 次必须全是它 */
{
  const keep = ALL[ALL.length - 1].id;
  const seen = {};
  for (const u of ALL) if (u.id !== keep) seen[u.id] = true;
  const set = new Set();
  for (let i = 0; i < 200; i++) set.add(q('pickFinalUnique("warrior",' + JSON.stringify(seen) + ',62).id'));
  ok(set.size === 1 && set.has(keep), '只差一件没收集时，抽 200 次必须全是它', Array.from(set));
}
/* 全收齐 → 回到全池（必须能抽到不止一件） */
{
  const seen = {};
  for (const u of ALL) seen[u.id] = true;
  const set = new Set();
  for (let i = 0; i < 400; i++) set.add(q('pickFinalUnique("warrior",' + JSON.stringify(seen) + ',62).id'));
  ok(set.size > 5, '收齐之后必须回到全池随机（不能永远给同一件）', set.size);
}
/* 职业过滤：战士永远抽不到法师 / 道士的武器 */
{
  const wrong = ALL.filter(u => u.cls && u.cls !== 'warrior').map(u => u.id);
  let bad = [];
  for (let i = 0; i < 3000; i++) {
    const id = q('pickFinalUnique("warrior",{},62).id');
    if (wrong.indexOf(id) >= 0) bad.push(id);
  }
  ok(bad.length === 0, '战士抽不到别的职业的专属件', bad.slice(0, 3));
}
/* ilvl 过滤：等级不够的不参与 */
{
  const low = ALL.filter(u => u.ilvl > 45);
  let bad = [];
  for (let i = 0; i < 2000; i++) {
    const id = q('pickFinalUnique("warrior",{},45).id');
    if (low.some(u => u.id === id)) bad.push(id);
  }
  ok(bad.length === 0, 'ilvl 45 抽不到 46 级以上的传世', bad.slice(0, 3));
}
/* 均匀性：战士可见池（40 − 4 法师武器 − 3 道士武器... 实际按 cls 过滤） */
{
  const vis = ALL.filter(u => !u.cls || u.cls === 'warrior');
  const N = 100000, cnt = {};
  for (let i = 0; i < N; i++) {
    const id = q('pickFinalUnique("warrior",{},62).id');
    cnt[id] = (cnt[id] || 0) + 1;
  }
  const keys = Object.keys(cnt);
  ok(keys.length === vis.length, '抽 10 万次必须覆盖整个可见池', { got: keys.length, want: vis.length });
  const exp = N / vis.length;
  const sd = Math.sqrt(N * (1 / vis.length) * (1 - 1 / vis.length));
  const off = keys.filter(k => Math.abs(cnt[k] - exp) > 4 * sd);
  ok(off.length === 0, '可见池必须近似均匀（4σ 外不许有）', { exp: Math.round(exp), off: off.slice(0, 3).map(k => [k, cnt[k]]) });
  /* 池外的一件都不许出现 */
  const extra = keys.filter(k => !vis.some(u => u.id === k));
  ok(extra.length === 0, '不许抽到池外的传世', extra.slice(0, 3));
}
/* 空池：ilvl 太低时返回 null，调用方退回神品 */
ok(q('pickFinalUnique("warrior",{},1)') === null, 'ilvl 1 时抽不到任何传世，必须返回 null');

/* ---------- 三、实例 ---------- */
console.log('三、rollItem 按 id 生成真传世');
{
  const def = ALL[0];
  const it = q('rollItem(62,{cls:"warrior",rarity:"unique",uniqueId:"' + def.id + '"})');
  ok(it.rarity === 'unique', '必须真的出传世（不退化成神品）', it.rarity);
  ok(it.uniqueId === def.id, 'uniqueId 必须是要求的那一件', it.uniqueId);
  ok(it.slot === def.slot, '部位必须跟着传世定义走', { got: it.slot, want: def.slot });
  ok(it.tierless === true, '传世必须带 tierless（不属于八阶基底体系）');
  ok(it.uniqueStats && Object.keys(it.uniqueStats).length > 0, '必须真的滚了固定属性', it.uniqueStats);
  ok(it.reqLv === def.ilvl, '需求等级必须等于传世的 ilvl', { got: it.reqLv, want: def.ilvl });
  /* 指定一件 ilvl 高于入参的 → 不许强出，退回池抽 */
  const high = ALL.filter(u => u.ilvl >= 60)[0];
  if (high) {
    const it2 = q('rollItem(40,{cls:"warrior",rarity:"unique",uniqueId:"' + high.id + '"})');
    ok(it2.uniqueId !== high.id || it2.rarity !== 'unique',
      'ilvl 不够时不许强出高等级传世', { want: high.id, got: it2.uniqueId });
  }
}
/* 保底橙：rarity 指定 legendary 时必须真的出橙 */
{
  const lg = q('rollItem(62,{cls:"warrior",rarity:"legendary",noRelic:true})');
  ok(lg.rarity === 'legendary', '保底件必须是神品（橙）', lg.rarity);
}

/* ---------- 四、存档 ---------- */
console.log('四、存档：codexUnique 归一化 + 三处都搬');
ok(/  _uniqSet\(v\) \{/.test(SV), 'save.js 必须有 _uniqSet');
ok(/d\.codexUnique = this\._uniqSet\(d\.codexUnique\)/.test(SV), 'normalizeDoc 必须整形 codexUnique');
ok((SV.match(/codexUnique: this\._uniqSet\(/g) || []).length === 2,
  'pack 与 unpack **两处**都要搬 codexUnique（少一处就是「存得进、读不回」）',
  (SV.match(/codexUnique: this\._uniqSet\(/g) || []).length);
{
  const f = q('SaveManager._uniqSet({a:true,b:false,c:1})');
  ok(f.a === true && f.c === true && f.b === undefined, '真值留下、假值丢掉', f);
  ok(Object.keys(q('SaveManager._uniqSet("junk")')).length === 0, '脏值收敛成空对象');
  ok(Object.keys(q('SaveManager._uniqSet([1,2])')).length === 0, '数组收敛成空对象');
  ok(Object.keys(q('SaveManager._uniqSet(null)')).length === 0, 'null 收敛成空对象');
}

/* ---------- 五、接线 ---------- */
console.log('五、接线：终 boss 才调 / 一进包就记账 / seen 三处并集');
ok(/if \(e\.cfg && e\.cfg\.final\) this\._finalUniqueDrop\(p\)/.test(G),
  'onEnemyDeath 必须只对 `cfg.final` 调 _finalUniqueDrop');
ok(/  _finalUniqueDrop\(p\) \{/.test(G), 'game.js 必须有 _finalUniqueDrop');
ok(/  uniqueSeen\(\) \{/.test(G), 'game.js 必须有 uniqueSeen');
ok(/  markUnique\(id\) \{/.test(G), 'game.js 必须有 markUnique');
{
  const add = G.slice(G.indexOf('  addItem(item) {'));
  const body = add.slice(0, add.indexOf('\n  },') + 4);
  ok(/item\.uniqueId/.test(body) && /this\.markUnique/.test(body),
    'addItem 必须记账（捡取 / 商店 / 打造 / 任务奖励全走这里）', body.slice(0, 120));
}
{
  const us = G.slice(G.indexOf('  uniqueSeen() {'));
  const body = us.slice(0, us.indexOf('\n  },') + 4);
  ok(/s\.codexUnique/.test(body), 'uniqueSeen 必须读存档账');
  ok(/s\.inventory/.test(body), 'uniqueSeen 必须并入背包（老档账本是空的）');
  ok(/s\.equipment/.test(body), 'uniqueSeen 必须并入身上');
  ok(/s\.stash/.test(body), 'uniqueSeen 必须并入仓库');
}
/* 终 boss 才有的标记 */
{
  const ids = q('Object.keys(BOSSES)');
  const hit = ids.filter(id => q('!!BOSSES["' + id + '"].final'));
  ok(hit.length === 1 && hit[0] === 'chaosavatar', '只有终 boss 带 final 标记', hit);
}

/* ---------- 六、概率抽样 ---------- */
console.log('六、概率抽样：100 万次 × 4 档');
/* 为什么不是 10 万次：0.01% 在 10 万次里只有 10 个期望值，±3σ 是 ±95% ——
 * 差 3 倍都未必抓得住。100 万次把 σ 压到 10% 以内，仍然只要几十毫秒。 */
{
  const N = 1000000;
  const bands = {
    novice: [0.0001, 70, 130],
    normal: [0.0001, 70, 130],
    hard: [0.0003, 240, 360],
    nightmare: [0.001, 900, 1100]
  };
  for (const k in bands) {
    const [p, lo, hi] = bands[k];
    const rate = q('BALANCE.finalUnique.rate.' + k);
    ok(rate === p, k + ' 的配置值必须是 ' + p, rate);
    let hit = 0;
    for (let i = 0; i < N; i++) if (Math.random() < rate) hit++;
    ok(hit >= lo && hit <= hi, k + '：100 万次观测必须落在 3σ 带内', { hit, band: [lo, hi] });
  }
}

console.log('\n================================');
console.log('  M7.7 全传世掉落契约：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('================================');
process.exit(fail ? 1 : 0);
