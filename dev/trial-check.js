/* ============================================================
 * dev/trial-check.js —— P12「试炼平衡」专项体检（离线，node 直跑）
 *
 * 为什么单独有一个脚本：
 *   试炼是**升级最快的口子**。P12 之前 40 级角色刷 10 波能拿 340% 的经验
 *   （等于连升三级半），而怪的强度只跟波数有关、不跟玩家等级有关 ——
 *   「低波数 × 高等级」是零风险高收益，玩家不需要往高波打，只需要反复重开。
 *   这类问题在浏览器里完全看不出来（一切「正常」），只能靠离线算。
 *
 * 三段：
 *   A. 等级难度乘区：值对不对 / 单调 / 真乘进了 hp·dmg 两个乘区
 *   B. 经验衰减：40 级打 10 波 < 15% 升级所需；满额波数符合设计
 *   C. 传世掉落：概率表 / 波数门槛 / 等级门槛 / 目录里真的都是 ilvl ≥ 40
 *
 * 另外会检查 src/trial.js 的**接线**：函数写对了但没被调用，是最常见的一类
 * 「改完了但游戏里没变」。离线脚本看不见运行时代码路径，所以直接读源码断言。
 *
 * 用法：node dev/trial-check.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const eq = (a, b, msg) => ok(a === b, msg, { got: a, want: b });
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, { got: a, want: b, tol });
const head = (t) => console.log('\n— ' + t + ' —');

const dctx = loadData({ console });
const g = (n) => vm.runInContext(n, dctx);

const CFG = g('TRIAL_CFG');
const lvMul = (lv) => g('trialLevelMul')(lv);
const hpMul = (w, lv) => g('trialHpMul')(w, lv);
const dmgMul = (w, lv) => g('trialDmgMul')(w, lv);
const pace = (w, lv) => g('trialXpPace')(w, lv);
const uChance = (w, boss) => g('trialUniqueChance')(w, boss);

/* ============================================================
 * A. 等级难度乘区
 * ============================================================ */
head('一、等级乘区（难度随等级涨）');

eq(lvMul(1), 1, '1 级不加压（×1.00）');
eq(lvMul(6), 1, '6 级（刚解锁）不加压');
eq(lvMul(10), 1, '10 级是起算点（×1.00）');
near(lvMul(30), 1.7, 1e-9, '30 级 ×1.70');
near(lvMul(60), 2.75, 1e-9, '60 级 ×2.75');

let mono = true;
for (let lv = 2; lv <= 70; lv++) if (lvMul(lv) < lvMul(lv - 1) - 1e-9) mono = false;
ok(mono, '等级乘区对等级单调不减（不能出现「升级反而变简单」）');

/* 不传 level 时必须是 ×1.00 —— dev 脚本 / 老调用点不传参不能静默变难 */
eq(hpMul(5), hpMul(5, 1), '血量乘区不传 level 时按不加压算');
eq(dmgMul(5), dmgMul(5, 1), '伤害乘区不传 level 时按不加压算');

near(hpMul(5, 60) / hpMul(5, 10), 2.75, 1e-9, '同一波，60 级血量是 10 级的 2.75 倍');
near(dmgMul(5, 60) / dmgMul(5, 10), 2.75, 1e-9, '同一波，60 级伤害是 10 级的 2.75 倍');

/* 波数曲线本身没被动过（P12 只加等级乘区，不改波数曲线） */
near(hpMul(0, 10), 0.54, 1e-9, '波数曲线第 0 波 = 0.54（原补偿系数不变）');
near(dmgMul(0, 10), 0.56, 1e-9, '波数曲线第 0 波 = 0.56（原补偿系数不变）');

/* ============================================================
 * B. 经验衰减
 * ============================================================ */
head('二、经验衰减（止住「重开低波」刷级）');

eq(CFG.xpPaceLevelMul, 0.6, '满额锚点 = 等级 × 0.6');
ok(CFG.xpPacePow >= 2, '衰减指数 ≥ 2（线性达不到验收线，见 data-trial.js 注释）', CFG.xpPacePow);

near(pace(1, 40), Math.pow(1 / 24, CFG.xpPacePow), 1e-9, '40 级第 1 波几乎不给经验');
eq(pace(24, 40), 1, '40 级第 24 波起满额');
eq(pace(36, 60), 1, '60 级第 36 波起满额');
eq(pace(9, 15), 1, '15 级第 9 波起满额');
eq(pace(60, 10), 1, 'pace 上限是 1（不会倒扣）');
eq(pace(0, 40), 0, '第 0 波 = 0');

/* 累计经验：按真实波次类型（每 5 波首领 / 每 10 波大首领）求和 */
function xpSum(level, waves) {
  let s = 0;
  for (let w = 1; w <= waves; w++) {
    let r = CFG.xpWaveRatio;
    if (w % 10 === 0) r = CFG.xpWaveRatioBig;
    else if (w % 5 === 0) r = CFG.xpWaveRatioBoss;
    s += r * pace(w, level);
  }
  return s;
}
const s40 = xpSum(40, 10);
ok(s40 < 0.15, '40 级打 10 波 < 升级所需的 15%（P12 验收线）', (s40 * 100).toFixed(1) + '%');
ok(s40 > 0.02, '40 级打 10 波也不是 0（别把正常玩家也饿死）', (s40 * 100).toFixed(1) + '%');

const s60 = xpSum(60, 10);
ok(s60 < s40, '60 级打 10 波拿到的经验比 40 级更少（等级越高越不给白食）',
  { lv60: (s60 * 100).toFixed(1) + '%', lv40: (s40 * 100).toFixed(1) + '%' });

/* 高波必须还能正常升级 —— 否则试炼从「刷级场」变成「经验黑洞」，两头都不对 */
const s40deep = xpSum(40, 40);
ok(s40deep > 3, '40 级打到第 40 波累计 > 3 级（高波收益仍然可观）', s40deep.toFixed(2) + ' 级');

/* ============================================================
 * C. 传世掉落
 * ============================================================ */
head('三、传世掉落（只在高级波数）');

const U = CFG.unique;
eq(U.minWave, 30, '起掉波数 30');
eq(U.minLevel, 39, '等级门槛 39（传世 reqLv = ilvl ≥ 40）');
eq(U.ilvlMin, 40, '只掉 ilvl ≥ 40 的传世');

eq(uChance(29, false), 0, '29 波不掉');
eq(uChance(1, true), 0, '首领波也不提前掉');
near(uChance(30, false), 0.003, 1e-9, '30 波 0.30%');
near(uChance(40, false), 0.007, 1e-9, '40 波 0.70%');
near(uChance(50, false), 0.011, 1e-9, '50 波 1.10%');
near(uChance(60, false), 0.015, 1e-9, '60 波 1.50%');
near(uChance(70, false), 0.019, 1e-9, '70 波 1.90%');
near(uChance(120, false), 0.019, 1e-9, '封顶 1.90%');
near(uChance(30, true), 0.009, 1e-9, '首领波 30 波 0.90%（×3）');
near(uChance(50, true), 0.033, 1e-9, '首领波 50 波 3.30%（×3）');
near(uChance(70, true), 0.057, 1e-9, '首领波封顶 5.70%');

/* 蒙特卡洛：10 万次抽样必须落在理论值 ±10% 内（防止 CHANCE 口径与概率表不一致） */
const CHANCE = g('CHANCE');
function sample(w, boss, n = 100000) {
  const p = uChance(w, boss);
  let hit = 0;
  for (let i = 0; i < n; i++) if (CHANCE(p)) hit++;
  return hit / n;
}
for (const [w, boss, want] of [[40, false, 0.007], [50, true, 0.033], [70, true, 0.057]]) {
  const got = sample(w, boss);
  ok(Math.abs(got - want) <= want * 0.1,
    '抽样 ' + w + ' 波' + (boss ? '首领' : '普通') + ' ≈ ' + (want * 100).toFixed(2) + '%',
    (got * 100).toFixed(3) + '%');
}

/* 目录侧：40 件传世必须全部 ilvl ≥ 40，否则「只掉 ilvl ≥ 40」这条会漏 */
const UNIQUES = g('UNIQUE_ITEMS');
eq(UNIQUES.length, 40, '传世目录 40 件');
const lowUniq = UNIQUES.filter(u => u.ilvl < U.ilvlMin);
eq(lowUniq.length, 0, '没有 ilvl < 40 的传世（门槛与目录一致）', lowUniq.map(u => u.id));

/* rollItem 用 rarity: 'unique' 真能出传世（而不是退化成品） */
const rollItem = g('rollItem');
let gotUnique = 0;
for (let i = 0; i < 40; i++) {
  const it = rollItem(45, { rarity: 'unique', cls: 'warrior' });
  if (it && it.rarity === 'unique') gotUnique++;
}
eq(gotUnique, 40, 'ilvl 45 指定 unique 必定出传世（40/40）');

/* ============================================================
 * D. 接线：函数写对了，还得真被调用
 * ============================================================ */
head('四、运行时接线（src/trial.js）');

const src = fs.readFileSync(path.join(ROOT, 'src/trial.js'), 'utf8');
ok(/trialHpMul\(w,\s*s\.level\)/.test(src), 'spawnWave 把玩家等级传进血量乘区');
ok(/trialDmgMul\(w,\s*s\.level\)/.test(src), 'spawnWave 把玩家等级传进伤害乘区');
ok(/trialXpPace\(w,\s*s\.level\)/.test(src), 'onWaveCleared 用 pace 衰减经验');
ok(/ratio\s*\*=\s*pace/.test(src), 'pace 真乘进了 ratio（不是算了不用）');
ok(/trialUniqueChance\(w,\s*isBoss\)/.test(src), 'onWaveCleared 判定传世掉落');
ok(/s\.level\s*>=\s*U\.minLevel/.test(src), '传世掉落有等级门槛');
ok(/r\.uniques/.test(src), '传世件数记进本轮统计');

/* 关卡门槛（P12 明确不设 20 级上限，只保留 unlockLevel） */
eq(CFG.unlockLevel, 6, '准入等级仍是 6（不加等级上限）');
ok(!/maxLevel|levelCap/.test(fs.readFileSync(path.join(ROOT, 'src/data/data-trial.js'), 'utf8')),
  '没有偷偷加「等级上限」字段（用户否掉了那个方案）');

/* ============================================================ */
console.log('\n' + (fail ? '❌ ' : '✅ ') + '全部通过（' + pass + ' 项）');
if (fail) { console.log('失败 ' + fail + ' 项'); process.exit(1); }
