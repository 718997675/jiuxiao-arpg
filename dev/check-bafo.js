/* ============================================================
 * dev/check-bafo.js —— M7「八部天龙」专项体检（离线，node 直跑）
 *
 * 八部天龙这套结构有 4 份数据必须**严丝合缝**地对上：
 *
 *   1. BAFO_SEALS（八印清单：key / name / map / boss）
 *   2. MAPS.chaossea.gates（枢纽里的八扇门：seal / map / 坐标）
 *   3. ACTS['5-2'].maps（山河图里展开的 8 个副本图位）
 *   4. BOSSES.bafo_*（8 只魔将：seal / resist / stagger / animKind）
 *
 * 只要有一处对不上，玩家看到的就是「门开了但进去没有魔将」
 * 「打了魔将不掉印」「印满了门还不开」—— 而这三种在浏览器里
 * 都表现为「这游戏坏了」，很难反查到是哪张表写错了。
 *
 * 这里把「对得上」写成等式，顺便验两件数值上必须成立的事：
 *
 *   A. 抗性差 8 倍：弱点 −60（吃 160%）vs 其余 +80（吃 20%）。
 *      −60 是 damageEnemy 的抗性夹取下限，写别的数拿不到正好 1.6 倍。
 *   B. 破绽窗口存在：每只魔将必须有一个 `stagger`，且它的技能
 *      真的在 `patterns` 里 —— 否则「抓后摇」这套玩法根本触发不了。
 *
 * 用法：node dev/check-bafo.js
 * ============================================================ */
const { loadData } = require('./_load.js');
const vm = require('vm');

const ctx = loadData({
  console, Math, Set, Map, JSON,
  localStorage: { getItem() { return null; }, setItem() {} }
});
const g = (e) => vm.runInContext(e, ctx);

const BOSSES = g('BOSSES'), MAPS = g('MAPS'), ACTS = g('ACTS');
const BAFO_SEALS = g('BAFO_SEALS');
const MON_FAMILIES = g('MON_FAMILIES');
const bossPosOf = g('bossPosOf'), mapZones = g('mapZones'), zoneContains = g('zoneContains');

const ELEMS = ['phys', 'fire', 'ice', 'lightning', 'poison'];
const ELEM_CN = { phys: '物理', fire: '火', ice: '冰', lightning: '雷', poison: '毒' };

/* damageEnemy 的抗性夹取（game.js：CLAMP(res, -60, 85)） */
const RES_CLAMP_LO = -60, RES_CLAMP_HI = 85;
const mulOf = (res) => 1 - Math.max(RES_CLAMP_LO, Math.min(RES_CLAMP_HI, res)) / 100;

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; return true; }
  fail++;
  console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  return false;
};
const eq = (msg, a, b) => ok(a === b, msg, { got: a, want: b });
const head = (t) => console.log('\n=== ' + t + ' ===');

/* ============================================================
 * 一、八印清单本身
 * ============================================================ */
head('一、八印清单（BAFO_SEALS）');
ok(Array.isArray(BAFO_SEALS), 'BAFO_SEALS 是数组');
eq('八印 = 8 条', (BAFO_SEALS || []).length, 8);

const keys = (BAFO_SEALS || []).map(s => s.key);
eq('印的 key 不重复', new Set(keys).size, keys.length);
for (const s of (BAFO_SEALS || [])) {
  ok(!!s.key && !!s.name && !!s.part, `印 ${s.key} 有 key / name / part`, s);
  ok(!!MAPS[s.map], `印 ${s.key} 的副本图 ${s.map} 存在于 MAPS`);
  ok(!!BOSSES[s.boss], `印 ${s.key} 的魔将 ${s.boss} 存在于 BOSSES`);
}

/* ============================================================
 * 二、四份数据对齐：印 ↔ 门 ↔ 图位 ↔ 魔将
 * ============================================================ */
head('二、对齐（印 ↔ 门 ↔ 图位 ↔ 魔将）');

const hub = MAPS.chaossea;
ok(!!hub, '枢纽图 chaossea 存在');
if (hub) {
  ok(hub.safe === true, '枢纽 chaossea 是安全区');
  ok(hub.hub === true, '枢纽 chaossea 带 hub 标记');
  eq('枢纽不刷怪', (hub.spawns || []).length, 0);
  eq('枢纽没有首领', (hub.bosses || []).length, 0);
  eq('枢纽八道门', (hub.gates || []).length, 8);

  const gateSeals = (hub.gates || []).map(x => x.seal);
  eq('门的 seal 与八印一一对应', gateSeals.join(','), keys.join(','));
  for (const gd of (hub.gates || [])) {
    const seal = (BAFO_SEALS || []).find(s => s.key === gd.seal);
    ok(!!seal, `门 ${gd.seal} 能在八印表里找到`);
    if (seal) eq(`门 ${gd.seal} 指向的图`, gd.map, seal.map);
    ok(!!MAPS[gd.map], `门 ${gd.seal} 的目标图 ${gd.map} 存在`);
  }
  /* 门必须站在可走区域内，否则玩家走到门口是空气墙 */
  const zs = mapZones('chaossea');
  ok(!!zs, '枢纽有 zone 数据');
  if (zs) {
    for (const gd of (hub.gates || [])) {
      const inside = zs.some(z => zoneContains(z, gd.x, gd.z));
      ok(inside, `门 ${gd.seal} 的坐标 (${gd.x},${gd.z}) 在可走区域内`);
    }
  }

  /* 终门 */
  const fg = hub.finalGate;
  ok(!!fg, '枢纽有天龙终门');
  if (fg) {
    eq('终门指向无相天', fg.map, 'wuxiang');
    eq('终门要求 8 印', fg.sealNeed, 8);
    ok(!!MAPS.wuxiang, '无相天存在于 MAPS');
    eq('无相天也带 sealNeed 8（travelTo 兜底拦截）', MAPS.wuxiang.sealNeed, 8);
    if (zs) ok(zs.some(z => zoneContains(z, fg.x, fg.z)),
      `终门坐标 (${fg.x},${fg.z}) 在可走区域内`);
  }
}

/* 5-2 章：枢纽 + 8 副本 + 终 boss 场 */
const act = ACTS['5-2'];
ok(!!act, '章 5-2 存在');
if (act) {
  eq('5-2 图位数 = 10（枢纽 + 8 副本 + 终 boss 场）', act.maps.length, 10);
  eq('5-2 首图是枢纽', act.maps[0].id, 'chaossea');
  eq('5-2 末图是无相天', act.maps[act.maps.length - 1].id, 'wuxiang');
  const actIds = act.maps.map(m => m.id);
  for (const s of (BAFO_SEALS || [])) {
    ok(actIds.indexOf(s.map) >= 0, `副本图 ${s.map} 在 5-2 的图位里`);
  }
  eq('5-2 主首领是终 boss', act.boss, 'chaosavatar');
  ok((MAPS.wuxiang.bosses || []).indexOf('chaosavatar') >= 0, '终 boss 摆在不无相天上');
}

/* ============================================================
 * 三、8 张副本图
 * ============================================================ */
head('三、8 张副本图');
for (const s of (BAFO_SEALS || [])) {
  const m = MAPS[s.map];
  if (!m) continue;
  ok(m.raid === true, `副本 ${s.map} 带 raid 标记`);
  ok(m.safe !== true, `副本 ${s.map} 不是安全区`);
  ok(Array.isArray(m.spawns) && m.spawns.length > 0, `副本 ${s.map} 有护卫怪池`);
  eq(`副本 ${s.map} 只有 1 只首领`, (m.bosses || []).length, 1);
  eq(`副本 ${s.map} 的首领是 ${s.boss}`, (m.bosses || [])[0], s.boss);
  eq(`副本 ${s.map} 刷怪数 = 12`, m.spawnCount, 12);
  ok(m.level === 60, `副本 ${s.map} 是 60 级`, m.level);

  /* 首领落点必须在 boss 区（zone-check 也验，但这里失败信息更直白） */
  const zs = mapZones(s.map);
  const sanctum = zs ? zs.find(z => z.kind === 'boss') : null;
  ok(!!sanctum, `副本 ${s.map} 有 boss 区`);
  if (sanctum) {
    const p = bossPosOf(s.map, s.boss, 0);
    ok(!!p && zoneContains(sanctum, p[0], p[1]), `副本 ${s.map} 魔将落点在 boss 区内`, p);
  }
}

/* ============================================================
 * 四、8 位魔将：抗性 / 破绽 / 模型 / 印
 * ============================================================ */
head('四、8 位魔将');
const animKinds = new Set();
for (const s of (BAFO_SEALS || [])) {
  const b = BOSSES[s.boss];
  if (!b) continue;
  console.log('\n  【' + b.name + '】弱点 ' + ELEM_CN[b.weak] + ' · 破绽 ' +
    (b.stagger ? b.stagger.dur + 's ×' + b.stagger.mul : '无'));

  /* --- 印 --- */
  eq(`${b.id} 的 seal 与印表一致`, b.seal, s.key);
  ok(!!b.sealName, `${b.id} 有 sealName`, b.sealName);
  eq(`${b.id} 的 map 与印表一致`, b.map, s.map);

  /* --- 抗性：一个缺口 + 四个满抗 --- */
  ok(!!b.resist, `${b.id} 有 resist`);
  if (b.resist) {
    const weak = ELEMS.filter(e => (b.resist[e] || 0) < 0);
    eq(`${b.id} 只有一个弱点元素`, weak.length, 1);
    eq(`${b.id} 的 weak 字段指向那个弱点`, b.weak, weak[0]);

    const weakMul = mulOf(b.resist[b.weak] || 0);
    const otherMuls = ELEMS.filter(e => e !== b.weak).map(e => mulOf(b.resist[e] || 0));
    const worst = Math.min.apply(null, otherMuls);
    /* 8 倍差：1.6 / 0.2 = 8 */
    const ratio = weakMul / worst;
    ok(Math.abs(weakMul - 1.6) < 1e-9,
      `${b.id} 弱点吃 ${weakMul.toFixed(3)} 倍（应 1.6，抗性须 −60）`, b.resist[b.weak]);
    ok(Math.abs(worst - 0.2) < 1e-9,
      `${b.id} 非弱点只吃 ${worst.toFixed(3)} 倍（应 0.2，抗性须 +80）`, b.resist);
    ok(Math.abs(ratio - 8) < 1e-9,
      `${b.id} 弱点/非弱点 = ${ratio.toFixed(2)} 倍（应 8）`);

    /* resist 必须**写满 5 个元素**：漏一个就会回落到族群表的值，
     * 那只魔将的「8 倍差」当场缩水成 4 倍，而且不会报错 —— 只会变简单。 */
    const missing = ELEMS.filter(e => b.resist[e] === undefined);
    eq(`${b.id} 的 resist 写满 5 个元素`, missing.length, 0);
    if (missing.length) console.log('    缺：' + missing.join(', '));

    /* 弱点不许写进族群表：族群表是公开的（图鉴会显示 resist），
     * 里面出现 ±70 以上量级的抗性，就等于把答案抄在门上。
     * 注意 beast 怕火 −15 / undead 毒抗 60 这种**不算**泄露 ——
     * 那是「这个种族普遍抗什么」的常识，量级差得远；
     * undead 毒抗 60 甚至是**误导**（毗沙的弱点正好是毒），这是好事。 */
    const fam = MON_FAMILIES[b.family];
    if (fam && fam.resist) {
      const leak = ELEMS.filter(e => Math.abs(fam.resist[e] || 0) >= 70);
      eq(`${b.id} 的族群表 ${b.family} 没有量级抗性（±70 以上）泄露`, leak.length, 0);
      if (leak.length) console.log('    泄露：' + leak.join(', '));
    }
  }

  /* --- 破绽 --- */
  ok(!!b.stagger, `${b.id} 有 stagger（破绽窗口）`);
  if (b.stagger) {
    ok(b.stagger.dur >= 2, `${b.id} 破绽窗口 ≥ 2s`, b.stagger.dur);
    ok(b.stagger.mul >= 1.2, `${b.id} 破绽增伤 ≥ 1.2`, b.stagger.mul);
    ok((b.patterns || []).indexOf(b.stagger.skill) >= 0,
      `${b.id} 破绽技能 ${b.stagger.skill} 在 patterns 里`, b.patterns);
    ok(!!b.stagger.label, `${b.id} 破绽有提示文案`);
  }

  /* --- 模型分派 --- */
  ok(!!b.animKind, `${b.id} 有 animKind（M7.5 模型分派键）`);
  ok(!animKinds.has(b.animKind), `${b.id} 的 animKind「${b.animKind}」不与他人重复`);
  animKinds.add(b.animKind);

  /* --- 体量 --- */
  eq(`${b.id} 是 60 级`, b.level, 60);
  ok(b.hp > 0 && b.atk > 0, `${b.id} 有 hp / atk`);
  ok((b.patterns || []).length >= 3, `${b.id} 至少 3 种招式`, (b.patterns || []).length);
}

head('五、终 boss 场（无相天）');
const wx = MAPS.wuxiang;
ok(!!wx, '无相天存在于 MAPS');
if (wx) {
  ok(wx.arena === true, '无相天带 arena 标记');
  eq('无相天不刷杂兵', (wx.spawns || []).length, 0);
  eq('无相天只有终 boss', (wx.bosses || []).join(','), 'chaosavatar');
  const zs = mapZones('wuxiang');
  ok(!!zs, '无相天有 zone 数据');
  if (zs) {
    const bossZone = zs.find(z => z.kind === 'boss');
    ok(!!bossZone, '无相天有 boss 区');
    ok(bossZone && bossZone.r >= 40,
      '无相天的 boss 区半径 ≥ 40（P3 场地塌缩要空间）', bossZone && bossZone.r);
    /* 传送阵在入口区内 */
    ok(zs.some(z => z.kind === 'entry' && zoneContains(z, wx.portal.x, wx.portal.z)),
      '无相天传送阵在入口区内');
  }
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(52));
const table = (BAFO_SEALS || []).map(s => {
  const b = BOSSES[s.boss] || {};
  return '  ' + (b.name || s.boss).padEnd(16) + ELEM_CN[b.weak] + '  ' +
    (b.stagger ? b.stagger.skill + ' ' + b.stagger.dur + 's' : '-');
}).join('\n');
console.log('八部天龙 · 8 印 / 8 门 / 8 图 / 8 将');
console.log(table);
console.log(fail === 0 ? '\n✓ 全部通过  ' + pass + ' 项' : '\n✗ 有失败项  ' + pass + ' 通过 / ' + fail + ' 失败');
console.log('='.repeat(52));
process.exit(fail === 0 ? 0 : 1);
