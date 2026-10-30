/* ============================================================
 * dev/balance-skills.js —— 技能重构 P6 · 平衡体检（离线，node 直跑）
 *
 *   node dev/balance-skills.js
 *   node dev/balance-skills.js --all      # 逐技能明细
 *
 * 与 dev/balance-report.js 的分工：
 *   balance-report.js  看「主线数值」—— 怪血 / 玩家攻击 / TTK / 升级节奏，
 *                      那一份是**基础攻击 + 装备**的口径，与技能无关。
 *   balance-skills.js  看「技能这一层的倍率曲线」—— 1→20 级到底涨了多少，
 *                      三职业之间是否齐平，技能点够不够养 5 个位。
 *
 * 为什么不量「绝对 DPS」：技能真实伤害还要过暴击 / 减伤 / 抗性 / 元素反应，
 * 那是探针（probe-skill-*）的活。这里量的是**系数**，回答的是
 * 「同一个技能从 1 级练到 20 级，输出涨几倍」和「三个职业是不是一个量级」。
 *
 * 口径（全部来自数据层，不在这里另发明数字）：
 *   单发   = skillLvMul(lv) × (1 + 台阶 dmg% / 100)
 *   发数   = skillCountBase(id) + skillTierCount(id, lv)
 *   单体输出 = 单发 × 发数
 *   覆盖   = 1 + 台阶 radius% / 100
 *   战斗价值 = 单体输出 × 覆盖     ← 只是「打一群」的粗估，不是精确 AoE 期望
 *
 * 【重要】`skillTierMods` 里的 `dmg` **已经就是多发折算**
 * （等于 `skillCountDmgPct(id, extra)`）。总输出里再乘一次衰减，
 * 3 级双发会被算成「两发各 85%，再整体 85%」。第 0 节有一条断言钉死这点。
 *
 * 两类结论，分开对待：
 *   **硬断言**（fail 会让脚本非 0 退出）—— 只放「明显是 bug」的：
 *     单调性、分段边界、注入占比口径、点数池下限。
 *   **观察项**（只打印）—— 数值离散度这类需要人拍板的东西：
 *     三职业涨幅差多少、位内技能差多少、数量型比单体型多多少。
 *     数值平衡是设计决定，不由脚本替人改。
 * ============================================================ */
const vm = require('vm');
const { loadData } = require('./_load');

const ctx = loadData();
const pick = n => vm.runInContext(n, ctx);

const SKILLS = pick('SKILLS');
const skillLvMul = pick('skillLvMul');
const skillCountBase = pick('skillCountBase');
const skillTierCount = pick('skillTierCount');
const skillCountDmgPct = pick('skillCountDmgPct');
const skillCountCapable = pick('skillCountCapable');
const skillTierMods = pick('skillTierMods');
const skillArchList = pick('skillArchList');
const skillPointPool = pick('skillPointPool');
const SKILL_LV_MAX = pick('SKILL_LV_MAX');
const SKILL_TIERS = pick('SKILL_TIERS');
const SKILL_TREE = pick('SKILL_TREE');

const ALL = process.argv.indexOf('--all') >= 0;
const LVS = [1, 3, 5, 7, 9, 10, 15, 20];
const CLASSES = ['warrior', 'mage', 'taoist'];
const CLS_NAME = { warrior: '刀客', mage: '法师', taoist: '道士' };

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const warn = [];
const note = (m, d) => { warn.push(m + (d === undefined ? '' : '  ' + d)); };

function shotsOf(id, lv) {
  return (skillCountBase(id) || 1) + (skillTierCount(id, lv) || 0);
}
function singleMul(id, lv) {
  const mods = skillTierMods(id, lv) || {};
  return skillLvMul(lv) * (1 + (mods.dmg || 0) / 100);
}
function totalMul(id, lv) { return singleMul(id, lv) * shotsOf(id, lv); }
function areaMul(id, lv) {
  const mods = skillTierMods(id, lv) || {};
  return 1 + (mods.radius || 0) / 100;
}
function valueMul(id, lv) { return totalMul(id, lv) * areaMul(id, lv); }

const r3 = v => Math.round(v * 1000) / 1000;
const med = arr => { const a = arr.slice().sort((x, y) => x - y); return a[a.length >> 1]; };

/* ============================================================
 * 〇、口径自检
 * ============================================================ */
console.log('〇、口径自检');
{
  let bad = null;
  for (const id in SKILLS) {
    for (const lv of [3, 5, 7, 9, 10, 15, 20]) {
      const mods = skillTierMods(id, lv) || {};
      if (mods.dmg === undefined) continue;
      const extra = skillTierCount(id, lv) || 0;
      if (Math.abs(mods.dmg - (skillCountDmgPct(id, extra) || 0)) > 0.051) {
        bad = { id, lv, dmg: mods.dmg, pct: skillCountDmgPct(id, extra) };
      }
    }
  }
  ok(!bad, '台阶 mods.dmg 与多发折算同源（总输出里不能再乘一次衰减）', bad);
  console.log('  ✓ 台阶 dmg 修正 = 多发折算本身，总输出 = 单发 × 发数');
}

/* ============================================================
 * 一、等级倍率曲线本身
 * ============================================================ */
console.log('\n一、等级倍率曲线 skillLvMul');
{
  const segs = SKILL_TIERS.curve;
  ok(Array.isArray(segs) && segs.length > 0, '曲线是分段表', segs);
  const sum = segs.reduce((a, s) => a + (s.to - Math.max(s.from, 2) + 1) * s.pct, 0);
  const want = 1 + sum / 100;
  ok(Math.abs(skillLvMul(SKILL_TIERS.cap) - want) < 1e-9,
    '20 级 = 1 + 全段增量之和（分段边界不重不漏）', { got: skillLvMul(20), want });
  ok(skillLvMul(1) === 1, '1 级是基准 1.0', skillLvMul(1));

  let mono = true, prev = 0;
  for (let lv = 1; lv <= SKILL_TIERS.cap; lv++) {
    const v = skillLvMul(lv);
    if (v < prev - 1e-9) mono = false;
    prev = v;
  }
  ok(mono, '1→20 单调不减（升级不会变弱）');
  /* 精进层（11~20）的每一级不许比基础层（2~10）的每一级更值钱 ——
   * 否则「堆装备等级」比「投点」划算，玩家的取舍会整个倒过来。 */
  const baseGain = skillLvMul(10) - skillLvMul(9);
  const fineGain = skillLvMul(20) - skillLvMul(19);
  ok(fineGain <= baseGain + 1e-9, '精进层单级增量不超过基础层单级增量', { baseGain, fineGain });

  console.log('  等级  倍率     相对 1 级');
  for (const lv of [1, 5, 10, 15, 20]) {
    console.log('  ' + String(lv).padStart(3) + '  ' + skillLvMul(lv).toFixed(3)
      + '    ×' + (skillLvMul(lv) / skillLvMul(1)).toFixed(2));
  }
}

/* ============================================================
 * 二、每个技能 1→20 的涨幅
 * ============================================================ */
console.log('\n二、单技能涨幅（1 级 = 1.00）');
const rows = [];
for (const cls of CLASSES) {
  for (const slot of skillArchList(cls)) {
    for (const id of (slot.inherit || [])) {
      if (!SKILLS[id]) continue;
      const t1 = totalMul(id, 1), v1 = valueMul(id, 1);
      const at = {}, val = {}, area = {};
      for (const lv of LVS) {
        at[lv] = totalMul(id, lv) / t1;
        val[lv] = valueMul(id, lv) / v1;
        area[lv] = areaMul(id, lv);
      }
      rows.push({
        cls, no: slot.no, id, name: SKILLS[id].name, at, val, area,
        shots: shotsOf(id, 1), countCapable: !!skillCountCapable(id)
      });
    }
  }
}
{
  /* 单调：任何一个技能，等级涨了输出不许掉。
   * 这条看起来废话，但「数量台阶 + 多发衰减」很容易写成
   * 「3 级多发一发、结果每发掉得更多」→ 3 级比 2 级弱。 */
  let worst = null;
  for (const r of rows) {
    let prev = 0;
    for (let lv = 1; lv <= SKILL_TIERS.cap; lv++) {
      const v = totalMul(r.id, lv);
      if (v < prev - 1e-9 && (!worst || v / prev < worst.ratio)) {
        worst = { id: r.id, lv, ratio: r3(v / prev) };
      }
      prev = v;
    }
  }
  ok(!worst, '1→20 每一级都不掉输出', worst);

  /* 练级必须有回报：纯等级曲线已经 ×2.02，任何技能都不该低于它的一半 */
  const weak = rows.filter(r => r.at[20] < 1.95);
  ok(weak.length === 0, '20 级单体输出都 ≥ ×1.95（练级不会白练）',
    weak.map(r => r.id + ' ×' + r.at[20].toFixed(2)));

  /* 不许失控：再强的技能，20 级也不该到 1 级的 10 倍以上 */
  const hot = rows.filter(r => r.at[20] > 10);
  ok(hot.length === 0, '20 级单体输出都 ≤ ×10（没有失控技能）',
    hot.map(r => r.id + ' ×' + r.at[20].toFixed(2)));

  console.log('  职业      技能数   1级   3级   7级   10级   15级   20级（中位数）');
  const medByCls = {};
  for (const cls of CLASSES) {
    const rs = rows.filter(r => r.cls === cls);
    const line = LVS.map(lv => med(rs.map(r => r.at[lv])).toFixed(2).padStart(6)).join(' ');
    medByCls[cls] = { 10: med(rs.map(r => r.at[10])), 20: med(rs.map(r => r.at[20])) };
    console.log('  ' + CLS_NAME[cls].padEnd(6) + String(rs.length).padStart(6) + '  ' + line);
  }

  /* ---- 观察项：以下只打印，不判红 ---- */
  const spread = lv => {
    const v = CLASSES.map(c => medByCls[c][lv]);
    return Math.max.apply(null, v) / Math.min.apply(null, v);
  };
  note('三职业 20 级涨幅中位数差', '×' + r3(spread(20))
    + '（' + CLASSES.map(c => CLS_NAME[c] + ' ×' + medByCls[c][20].toFixed(2)).join(' / ') + '）');

  for (const cls of CLASSES) {
    const rs = rows.filter(r => r.cls === cls);
    const m = med(rs.map(r => r.at[20]));
    const wild = rs.filter(r => r.at[20] > m * 1.8 || r.at[20] < m * 0.6)
      .map(r => r.id + ' ×' + r.at[20].toFixed(2));
    if (wild.length) note(CLS_NAME[cls] + ' 的 20 级涨幅离散', wild.join(' / '));
  }

  /* 位内离散：同一个技能位里，玩家换一只技能，20 级后的输出差多少 */
  const slotSpread = [];
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      const rs = rows.filter(r => r.cls === cls && r.no === slot.no);
      if (rs.length < 2) continue;
      const v = rs.map(r => r.at[20]);
      const k = Math.max.apply(null, v) / Math.min.apply(null, v);
      if (k >= 1.5) slotSpread.push(CLS_NAME[cls] + slot.no + ' ×' + r3(k)
        + '（' + rs.map(r => r.id + ' ' + r.at[20].toFixed(2)).join(' / ') + '）');
    }
  }
  if (slotSpread.length) note('同一位内换技能的涨幅差 ≥1.5×：', '\n    ' + slotSpread.join('\n    '));

  /* 「数量型」= 吃数量台阶（Lv3 / Lv7 多发），与「基础发数」无关 ——
   * 火球基础 1 发但吃台阶，弹幕基础 16 发也吃台阶，两者都是数量型。 */
  const multi = rows.filter(r => r.countCapable);
  const single = rows.filter(r => !r.countCapable);
  if (single.length && multi.length) {
    note('数量型 / 单体型 20 级涨幅比',
      '×' + r3(med(multi.map(r => r.at[20])) / med(single.map(r => r.at[20])))
      + '（单体型 ' + single.length + ' 只 · 数量型 ' + multi.length + ' 只）');
  }

  /* 战斗价值（单体 × 覆盖）：把「靠多发涨」和「靠范围涨」放回同一把尺子 */
  console.log('  战斗价值（单体 × 覆盖）中位数：');
  for (const cls of CLASSES) {
    const rs = rows.filter(r => r.cls === cls);
    const line = LVS.map(lv => med(rs.map(r => r.val[lv])).toFixed(2).padStart(6)).join(' ');
    console.log('  ' + CLS_NAME[cls].padEnd(6) + '  ' + line);
  }
}

if (ALL) {
  console.log('\n  明细（单体输出）：');
  for (const r of rows) {
    console.log('  ' + (r.cls + ' ' + r.no).padEnd(11) + r.id.padEnd(14)
      + LVS.map(lv => r.at[lv].toFixed(2).padStart(6)).join(' '));
  }
}

/* ============================================================
 * 三、技能点经济：养得起 5 个位吗
 * ============================================================ */
console.log('\n三、技能点经济');
{
  const pool = lv => skillPointPool(lv);
  /* 只养 5 个位到 10 级（玩家投入上限）= 5 × 9 = 45 点。
   * 池子在 40 级是 60 点 —— 富余 15 点给被动 / 取向，这个数是拍板过的：
   * 富余太多 = 没有取舍；富余为负 = 后期点不满。 */
  const need5 = 5 * (SKILL_LV_MAX - 1);
  ok(pool(40) === 60, '40 级池 60 点', pool(40));
  ok(pool(40) - need5 === 15, '养满 5 个位后富余 15 点（给被动 / 取向）', pool(40) - need5);
  ok(pool(30) >= 5 * 6, '30 级至少能把 5 个位都推到 7 级（池 ' + pool(30) + ' ≥ 30）', pool(30));

  let pasNeed = 0;
  for (const id in SKILL_TREE.passives) pasNeed += (SKILL_TREE.passives[id].max || 1);
  /* 池子**必须**小于「全点满」的总需求 —— 这就是取舍存在的证明。
   * 反过来（池 ≥ 总需求）才是问题：想点什么都点得满，构筑就没意义了。 */
  ok(pool(40) < need5 + pasNeed,
    '40 级池 < 「5 位满级 + 全部被动」总需求（取舍真的存在）',
    { pool: pool(40), need: need5 + pasNeed });

  console.log('  等级   池   养满 5 位(45) 后富余');
  for (const lv of [10, 20, 30, 40]) {
    console.log('  ' + String(lv).padStart(4) + String(pool(lv)).padStart(5)
      + String(pool(lv) - need5).padStart(15));
  }
  console.log('  5 位满级需 ' + need5 + ' 点 · 全部被动满级需 ' + pasNeed + ' 点'
    + ' · 合计 ' + (need5 + pasNeed) + ' 点 > 池 60 点');
}

/* ============================================================
 * 四、元素注入的占比（P3b / P3d）
 * ============================================================ */
console.log('\n四、元素注入占比');
{
  const skillInjectPct = pick('skillInjectPct');
  const SKILL_INJECT = pick('SKILL_INJECT');
  const p1 = skillInjectPct(1), p10 = skillInjectPct(10), p20 = skillInjectPct(20);
  ok(p1 === SKILL_INJECT.minPct, '1 级注入 = 下限 ' + SKILL_INJECT.minPct + '%', p1);
  ok(p20 === SKILL_INJECT.maxPct, '20 级注入 = 上限 ' + SKILL_INJECT.maxPct + '%', p20);
  ok(p10 >= p1 && p20 >= p10, '注入随有效等级单调不减', [p1, p10, p20]);
  /* 单元素 / 双元素总量必须一致 —— 双元素是「换口味」，不是「换强度」 */
  const sp = pick('skillInjectSplit')(p20);
  ok(sp.main + sp.sub === p20, '双元素主副之和 = 单元素总量（混搭不额外送伤害）',
    { main: sp.main, sub: sp.sub, total: p20 });
  console.log('  有效等级 1 / 10 / 20 的附加比例：' + p1 + '% / ' + p10 + '% / ' + p20 + '%');
}

/* ============================================================
 * 汇总
 * ============================================================ */
if (warn.length) {
  console.log('\n观察项（不判红，需要人拍板）：');
  for (const w of warn) console.log('  · ' + w);
}
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 技能平衡体检：' + pass + ' 通过 / ' + fail + ' 失败'
  + (warn.length ? ' · ' + warn.length + ' 条观察项' : ''));
process.exit(fail === 0 ? 0 : 1);
