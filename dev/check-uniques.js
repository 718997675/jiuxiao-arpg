/* ============================================================
 * dev/check-uniques.js —— 传世目录体检（[M6] 40 件 · ilvl 40~60）
 *
 * 断言：
 *   1. 件数 / 部位分布 / ilvl 下限（40 以下不许有，初期不掉）
 *   2. id 不重复；每条特性只归一件传世、没有孤儿特性
 *   3. 词条 key 必须存在于 STATS（否则面板显示成 undefined）
 *   4. 技能效果要么是 '*'、要么是真实技能 id、要么 grant 真实技能
 *   5. 掉落池：39 级时池子必须为空，40 级起按部位逐个进池
 *
 * 用法：node dev/check-uniques.js
 * ============================================================ */
const { loadData } = require('./_load');
const vm = require('vm');

const ctx = loadData({ console, Math, JSON, Set, Map, Number, String, Array, Object, isFinite, parseInt, parseFloat });
const g = expr => vm.runInContext(expr, ctx);

const ITEMS = g('UNIQUE_ITEMS');
const TRAITS = g('UNIQUE_TRAITS');
const STATS = g('STATS');
const SKILLS = g('SKILLS');

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

/* ---- 1. 件数与分布 ---- */
ok(ITEMS.length === 40, `件数应为 40，实际 ${ITEMS.length}`);

const bySlot = {};
const byIlvl = {};
for (const it of ITEMS) {
  bySlot[it.slot] = (bySlot[it.slot] || 0) + 1;
  byIlvl[it.ilvl] = (byIlvl[it.ilvl] || 0) + 1;
  ok(it.ilvl >= 40, `${it.id} ilvl ${it.ilvl} < 40（初期会掉，违反「传世只有 40 级以上」）`);
}
const want = { weapon: 6, offhand: 5, helm: 4, chest: 4, shoulders: 3, cloak: 3, gloves: 3, boots: 3, belt: 3, amulet: 3, ring: 3 };
for (const k in want) ok(bySlot[k] === want[k], `${k} 件数 ${bySlot[k] || 0}，应为 ${want[k]}`);

/* ---- 2. id / 特性唯一性 ---- */
const ids = new Set();
for (const it of ITEMS) {
  ok(!ids.has(it.id), `id 重复：${it.id}`);
  ids.add(it.id);
  ok(Array.isArray(it.traits) && it.traits.length > 0, `${it.id} 没有特性`);
}
const traitUse = {};
for (const it of ITEMS) for (const t of (it.traits || [])) traitUse[t] = (traitUse[t] || 0) + 1;
for (const t in traitUse) {
  ok(TRAITS[t], `特性 ${t} 未定义`);
  ok(traitUse[t] === 1, `特性 ${t} 被 ${traitUse[t]} 件传世共用（必须唯一）`);
}
for (const t in TRAITS) ok(traitUse[t], `孤儿特性：${t} 没有任何传世在用`);

/* ---- 3. 词条 key ---- */
for (const it of ITEMS) {
  for (const k in (it.stats || {})) {
    ok(STATS[k], `${it.id} 的词条 ${k} 不在 STATS 里`);
    const r = it.stats[k];
    const lo = Array.isArray(r) ? r[0] : r, hi = Array.isArray(r) ? r[1] : r;
    ok(lo <= hi, `${it.id}.${k} 区间反了：[${lo}, ${hi}]`);
    ok(lo > 0, `${it.id}.${k} 下限为 0`);
  }
  ok(Object.keys(it.stats || {}).length >= 2, `${it.id} 词条少于 2 条`);
}

/* ---- 4. 技能效果 ---- */
for (const it of ITEMS) {
  const s = it.skill;
  if (!ok(s && (s.id || s.grant), `${it.id} 没有技能效果`)) continue;
  if (s.id && s.id !== '*') ok(SKILLS[s.id], `${it.id} 强化的技能 ${s.id} 不存在`);
  if (s.grant) ok(SKILLS[s.grant], `${it.id} 授予的技能 ${s.grant} 不存在`);
  ok(!!s.desc, `${it.id} 的技能效果缺 desc`);
}

/* ---- 5. 掉落池：39 级必须空 ----
 * 三职业各查一遍再按 id 去重：通用件在三次查询里都会出现，
 * 直接相加会把它们数三遍（第一版就是这么错的）。 */
const poolAt = lv => {
  const set = new Set();
  for (const cls of ['warrior', 'mage', 'taoist']) {
    for (const u of g('uniquePool')(lv, cls, null)) set.add(u.id);
  }
  return set.size;
};
const p39 = poolAt(39), p40 = poolAt(40), p60 = poolAt(60);
ok(p39 === 0, `39 级池子里还有 ${p39} 件（初期不该掉传世）`);
ok(p40 > 0, '40 级池子是空的');
ok(p60 === ITEMS.length, `60 级应能掉全部 ${ITEMS.length} 件，实际 ${p60}`);

/* ---- 报告 ---- */
console.log('=== 传世目录体检 ===');
console.log('件数 ' + ITEMS.length + ' · 特性 ' + Object.keys(TRAITS).length + ' 条');
console.log('部位：' + Object.keys(want).map(k => k + ' ' + (bySlot[k] || 0)).join(' / '));
console.log('ilvl 分布：' + Object.keys(byIlvl).sort((a, b) => a - b).map(k => k + '级×' + byIlvl[k]).join('  '));
console.log('掉落池：39 级 ' + p39 + ' 件 / 40 级 ' + p40 + ' 件 / 60 级 ' + p60 + ' 件');
if (fails.length) {
  console.log('\n✗ ' + fails.length + ' 项不通过：');
  for (const f of fails) console.log('  · ' + f);
  process.exit(1);
}
console.log('\n✓ 全部通过');
