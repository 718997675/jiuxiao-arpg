/* ============================================================
 * 技能重构 P2 · 等级台阶接线契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p2.js
 *
 * 钉住五件事：
 *   1. 基础上限 5 → 10，且**只有一个地方写这个数**
 *      （SKILL_LV_MAX = SKILL_TREE.lvMax = SKILL_TIERS.baseMax）
 *   2. 伤害倍率只有 skillLvMul 一个口径：旧的 SKILL_LV_STEP 必须彻底消失，
 *      战斗（castSkill）与面板预览都读它 —— 两套算式必然「卡上 1.72、打出来 2.52」
 *   3. 点数供给同步到 等级 × 1.5：40 级 60 点，够拉满 5 个技能位（45 点），
 *      但**不够**点满全部 12 个技能（108 点）—— 取舍还在
 *   4. 满配花费随上限走（skillFullCost = 11 点），不许留写死的 6
 *   5. 老档 / 洗点：上限抬到 10 之后，全退仍然一分不少
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILL_ORDER = pick('SKILL_ORDER');
const SKILL_TREE = pick('SKILL_TREE');
const SKILL_TIERS = pick('SKILL_TIERS');
const SKILL_LV_MAX = pick('SKILL_LV_MAX');
const SKILL_POINT_RATE = pick('SKILL_POINT_RATE');
const skillLvMul = pick('skillLvMul');
const skillPointPool = pick('skillPointPool');
const skillFullCost = pick('skillFullCost');
const skillLines = pick('skillLines');
const skillRefundAll = pick('skillRefundAll');
const skillTreeRespecApply = pick('skillTreeRespecApply');
const skillSpentMap = pick('skillSpentMap');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; return; } fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d))); };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CLASSES = ['warrior', 'mage', 'taoist'];

/* ============================================================
 * 一、上限只有一个来源
 * ============================================================ */
console.log('一、上限唯一来源');
ok(SKILL_LV_MAX === 10, 'SKILL_LV_MAX = 10（基础档）', SKILL_LV_MAX);
ok(SKILL_TREE.lvMax === SKILL_LV_MAX, 'SKILL_TREE.lvMax 与它同源', SKILL_TREE.lvMax);
ok(SKILL_TIERS.baseMax === SKILL_LV_MAX, 'SKILL_TIERS.baseMax 与它同源', SKILL_TIERS.baseMax);
ok(SKILL_TIERS.cap === 20, '有效上限仍是 20（基础 10 + 词缀 10）', SKILL_TIERS.cap);

/* 树节点的 max 必须跟着走：否则面板画 10 格、结算只到 5 */
for (const cls of CLASSES) {
  for (const line of skillLines(cls)) {
    for (const n of line.nodes) {
      if (n.kind !== 'active') continue;
      if (n.max !== SKILL_LV_MAX) ok(false, cls + ' / ' + n.id + ' 节点 max 没跟上', n.max);
    }
  }
}
ok(true, '三职业所有主动节点的 max 都是 10');

/* 源码里不许再有写死的 5 / SKILL_LV_STEP */
ok(readSrc('src/game.js').indexOf('SKILL_LV_STEP') < 0, 'game.js 里不许再有 SKILL_LV_STEP');
ok(readSrc('src/ui.js').indexOf('SKILL_LV_STEP') < 0, 'ui.js 里不许再有 SKILL_LV_STEP');
ok(readSrc('src/ui-skills.js').indexOf('SKILL_LV_STEP') < 0, 'ui-skills.js 里不许再有 SKILL_LV_STEP');
ok(vm.runInContext('typeof SKILL_LV_STEP', ctx) === 'undefined', '全局也不再有 SKILL_LV_STEP');

/* ============================================================
 * 二、曲线（与 P0 同一函数，这里从「满级」角度再钉一次）
 * ============================================================ */
console.log('二、曲线');
ok(near(skillLvMul(1), 1), 'Lv1 = 1.0（不白送）', skillLvMul(1));
ok(near(skillLvMul(10), 1.72), 'Lv10（点满）= 1.72 倍', skillLvMul(10));
ok(near(skillLvMul(20), 2.02), 'Lv20（词缀满）= 2.02 倍', skillLvMul(20));
ok(skillLvMul(10) > 1.7 && skillLvMul(10) < 1.75, '点满 10 级给的是 1.72，不是旧公式的 1.72/2.52 混用',
  skillLvMul(10));
/* 每一级的增量必须与曲线表一致 */
{
  const seg = (lv) => (lv <= 10 ? 8 : lv <= 15 ? 4 : 2) / 100;
  let bad = 0;
  for (let lv = 2; lv <= 20; lv++) if (!near(skillLvMul(lv) - skillLvMul(lv - 1), seg(lv))) bad++;
  ok(bad === 0, '2→20 每一级的增量与 curve 表逐级吻合（8/4/2%）', bad);
}
/* 旧公式（全程 8%）在 10 级是 1.72 —— 一样；差别在 11 级以上，所以要看 20 级 */
ok(near(1 + 0.08 * 19, 2.52) && skillLvMul(20) < 2.2,
  '20 级不许回到旧的 2.52 倍', skillLvMul(20));

/* ============================================================
 * 三、点数供给
 * ============================================================ */
console.log('三、点数供给');
ok(SKILL_POINT_RATE === 1.5, '供给倍率 = 1.5', SKILL_POINT_RATE);
ok(skillPointPool(1) === 1, 'Lv1 → 1 点', skillPointPool(1));
ok(skillPointPool(10) === 15, 'Lv10 → 15 点', skillPointPool(10));
ok(skillPointPool(40) === 60, 'Lv40 → 60 点', skillPointPool(40));
ok(skillPointPool(60) === 90, 'Lv60 → 90 点', skillPointPool(60));
ok(skillPointPool(0) === 1 && skillPointPool(-3) === 1, '脏等级按 1 级算', skillPointPool(-3));

const slots = 5;
const fiveMax = slots * (SKILL_LV_MAX - 1);
ok(skillPointPool(40) >= fiveMax,
  '40 级够把 5 个技能位全部点到 10 级（' + skillPointPool(40) + ' ≥ ' + fiveMax + '）');
ok(skillPointPool(40) < SKILL_ORDER.warrior.length * (SKILL_LV_MAX - 1),
  '又不许够点满全部 12 个技能（否则取舍消失）',
  { pool: skillPointPool(40), all: SKILL_ORDER.warrior.length * (SKILL_LV_MAX - 1) });

/* 整棵树（主动 + 被动）点满要多少：40 级只能拿一半左右 */
{
  const full = CLASSES.map(cls => {
    let n = 0;
    for (const line of skillLines(cls)) {
      for (const node of line.nodes) n += (node.kind === 'active') ? (SKILL_LV_MAX - 1) : node.max;
    }
    return n;
  });
  ok(full.every(n => n > skillPointPool(40) * 1.8),
    '点满全树约需 2 倍供给（取舍仍然成立）', full);
  ok(full[0] === full[1] && full[1] === full[2], '三职业全树花费一致（129 点）', full);
}

/* 四、满配花费随上限走 */
console.log('四、满配花费');
ok(skillFullCost() === SKILL_LV_MAX - 1 + SKILL_TREE.branchCost.pick + SKILL_TREE.branchCost.form,
  'skillFullCost = 等级 9 + 取向 1 + 变体 1', skillFullCost());
ok(skillFullCost() === 11, '满配一个技能 11 点（旧口径 6 点已作废）', skillFullCost());

/* ============================================================
 * 五、战斗接线（静态，防止「面板改了、战斗没改」）
 * ============================================================ */
console.log('五、战斗接线');
const game = readSrc('src/game.js');
ok(game.indexOf('skillLvMul(this.skillLevel(id))') >= 0,
  'castSkill 的等级倍率必须直接读 skillLvMul(skillLevel(id))');
ok(game.indexOf('skillPointPool(') >= 0, 'skillPoints() 必须走 skillPointPool（供给 ×1.5）');
ok(/skillPoints\(\)\s*\{[^}]*skillPointPool/.test(game), 'skillPointPool 必须真的在 skillPoints() 里',
  game.match(/skillPoints\(\)\s*\{[\s\S]{0,400}/)[0].slice(0, 120));
/* 不许再出现第二套「1 + 每级固定百分比」 */
const dup = game.match(/1\s*\+\s*[A-Za-z_.]*STEP\s*\*/);
ok(!dup, '不许再有「1 + STEP × 级差」的第二套算式', dup && dup[0]);
ok(readSrc('src/ui-skills.js').indexOf('skillLvMul(lv)') >= 0,
  '面板预览也读 skillLvMul（卡上数字与打出来一致）');
ok(readSrc('src/ui.js').indexOf('skillPointPool') >= 0, '说明页要写清供给公式');

/* ============================================================
 * 六、洗点 / 老档：上限抬高后仍一分不少
 * ============================================================ */
console.log('六、洗点与老档');
{
  const sk = { whirl: { lv: 1 }, thrust: { lv: 10, v: 2 } };
  const spent = skillSpentMap(sk, {});
  ok(spent.thrust === 9, '10 级 = 投入 9 点', spent.thrust);
  const pas = { w_bloodlust: 3 };
  const before = skillSpentMap(sk, pas);
  const total = Object.keys(before).reduce((a, k) => a + before[k], 0);
  const r = skillRefundAll(sk, pas);
  ok(r.refunded === total, '全退总额 == 退前投入（一分不少）', { got: r.refunded, want: total });
  ok(sk.thrust.lv === 1, '全退后等级归 1');
  ok(sk.thrust.v === 2, '变体保留（不花点的玩法选择）');
  ok(Object.keys(pas).length === 0, '被动清空');
}
{
  const sk = { whirl: { lv: 10, p: 1 } };
  const r = skillTreeRespecApply(sk, {}, 99999, 0);
  ok(r.ok === true, '洗点能执行', r);
  ok(sk.whirl.lv === 1 && sk.whirl.p === undefined, '洗点后等级归 1、取向清空', sk.whirl);
}
/* 老档 lv 6~10 的 clamp 上界必须读常量，不许写死 5 */
ok(/CLAMP\(\s*Math\.round\(Number\(e\.lv\)/.test(game) && game.indexOf('1, SKILL_LV_MAX)') >= 0,
  'normalizeProgress 的等级 clamp 上界必须读 SKILL_LV_MAX');

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
