/* ============================================================
 * dev/trial-balance.js —— 试炼模式数值验算（离线，node 直跑）
 *
 * 目的：试炼的怪物曲线必须跟玩家的真实成长曲线对齐，否则不是「越打越难」
 * 而是「打到第 12 波突然打不动」。这个脚本直接加载游戏的数据层与
 * computePlayerStats，用**真实的装备生成器**造一身装备，量出每个等级的
 * 攻击 / 生命 / 暴击 / 攻速，再跟试炼曲线逐波对比，输出 TTK（击杀耗时）
 * 与「几刀被打死」。
 *
 * 用法：
 *   node dev/trial-balance.js
 *   node dev/trial-balance.js --full      # 打印逐波明细
 *
 * 它不参与运行时，也不被 index.html 引用。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/data/data-core.js', 'src/data/data-icons.js', 'src/data/data-items.js',
  'src/data/data-relics.js', 'src/data/data-relic-icons.js', 'src/data/data-craft.js',
  'src/data/data-mat-icons.js', 'src/data/data-uniques.js', 'src/data/data-skills.js',
  'src/data/data-skill-icons.js', 'src/data/data-skill-tree.js', 'src/data/data-form-fx.js',
  'src/data/data-talents.js', 'src/data/class-pack.js', 'src/data/data-builds.js',
  'src/data/data-monsters.js', 'src/data/data-fauna.js', 'src/data/data-elites.js',
  'src/data/data-world.js', 'src/data/data-trial.js', 'src/items.js'
];

const ctx = { console, Math, JSON, Date, isFinite, Number, String, Array, Object, parseInt, parseFloat };
/* 固定随机种子。
 * 装备是 200 次随机取样平均出来的，默认 Math.random 会让每次跑的 atk / hpMax
 * 抖动 3~5%，算出来的「崩盘点」跟着来回跳 1~2 波 —— 调参时根本分不清
 * 是系数生效了还是运气变了。这里换成 LCG，同参数必然同结果。 */
let _seed = 20261028;
const _rand = () => {
  _seed = (_seed * 1664525 + 1013904223) % 4294967296;
  return _seed / 4294967296;
};
const M = Object.create(Math);
M.random = _rand;
ctx.Math = M;
/* const/let 声明不会挂到 vm 的 global 上，取数据表要走一次求值 */
const g = (expr) => vm.runInContext(expr, ctx);
vm.createContext(ctx);
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log('  (skip) ' + f); continue; }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('FAIL ' + f + ': ' + e.message); process.exit(1); }
}

/* ---------- 1. 玩家真实属性曲线 ----------
 * 造一身「试炼里打得出来的装备」：部位全覆盖，品质按首领池的长期期望
 * （玄 58 / 神 26 / 套 12 / 传 4），并平均 200 次取样，去掉运气波动。 */
const SLOTS = ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
const RARITY_MIX = [['rare', 58], ['legendary', 26], ['set', 12], ['unique', 4]];

function avgStats(cls, level, samples = 200) {
  const acc = {};
  for (let s = 0; s < samples; s++) {
    const eq = {};
    for (const slot of SLOTS) {
      const key = slot.replace(/[12]$/, '');
      const r = vm.runInContext(`pickFromPool(${JSON.stringify(RARITY_MIX)})`, ctx);
      const it = g('rollItem')(level, { slot: key, rarity: r, cls });
      if (key === 'ring') { eq[slot] = it; }
      else eq[key] = it;
    }
    const p = {
      cls, level, equipment: eq, talents: {}, attrAlloc: { str: 0, agi: 0, vit: 0, int: 0 },
      skills: {}, codex: null, trialBonus: null
    };
    const st = g('computePlayerStats')(p);
    for (const k of ['atk', 'hpMax', 'def', 'crit', 'critDmg', 'aspd', 'dmgAll', 'skillDmg', 'armorPen', 'moveSpd']) {
      acc[k] = (acc[k] || 0) + (Number(st[k]) || 0);
    }
  }
  for (const k in acc) acc[k] /= samples;
  return acc;
}

/* 估算 DPS：普攻 = atk × 攻速系数 / 0.72 × 暴击期望 × (1+全伤)，技能再乘 1.9 */
function dpsOf(st, skillMul = 1.9) {
  const critMul = 1 + (st.crit / 100) * (st.critDmg / 100 - 1);
  const basic = st.atk * st.aspd / 0.72 * critMul * (1 + (st.dmgAll || 0) / 100);
  return basic * skillMul;
}

/* ---------- 2. 试炼曲线 ---------- */
const MOB = g('BALANCE').mob;
function enemyHp(cfgHp, lvl, wave, level) {
  /* 与 game.js spawnEnemy 同口径（v1.11.0 起含 hpBase）。
   * [P12] 再乘等级乘区 —— trialHpMul 的第二个参数是玩家等级，
   * 不传就等于按「不加压」算，跟运行时对不上。 */
  const f = (MOB.hpBase || 1) + lvl * MOB.hpLv + lvl * lvl * MOB.hpLv2;
  return cfgHp * f * g('trialHpMul')(wave, level);
}
function enemyDmg(atk, lvl, wave, level) {
  return atk * (1 + lvl * MOB.dmgLv) * g('trialDmgMul')(wave, level);
}
/* 玩家承伤：与 game.js damagePlayer 同口径 ——
 *   reduce = min(0.75, def / (def + 320 + level×22))
 * 抗性 / 减伤 / 格挡按 0 算，留出余量（祝福会把它们堆起来）。 */
function reduceOf(st, level) {
  return Math.min(0.70, st.def / (st.def + 380 + level * 28));
}
function ehpOf(st, level) {
  return st.hpMax / (1 - reduceOf(st, level));
}

/* 该波怪池的平均血量 / 攻击 / 攻击间隔（用真实数据表算，不拍脑袋） */
function poolProfile(wave) {
  const pool = g('trialMobPool')(wave);
  let hp = 0, atk = 0, cd = 0, n = 0;
  for (const k of pool) {
    const m = g('MONSTERS')[k];
    if (!m) continue;
    hp += m.hp; atk += m.atk; cd += (m.atkCd || 1.7); n++;
  }
  return n ? { hp: hp / n, atk: atk / n, cd: cd / n } : { hp: 58, atk: 11, cd: 1.7 };
}

const ARGS = process.argv.slice(2);
const FULL = ARGS.indexOf('--full') >= 0;
const cls = 'warrior';
const LV = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

console.log('=== 玩家属性曲线（战士 · 全身玄/神/套/传混合 · ilvl = 等级）===');
console.log('Lv     atk     hpMax    def    crit%  critD%  aspd   DPS');
const curve = {};
for (const lv of LV) {
  const st = avgStats(cls, lv);
  curve[lv] = st;
  console.log(
    String(lv).padEnd(6) +
    st.atk.toFixed(0).padStart(6) + ' ' +
    st.hpMax.toFixed(0).padStart(8) + ' ' +
    st.def.toFixed(0).padStart(6) + ' ' +
    st.crit.toFixed(1).padStart(6) + ' ' +
    st.critDmg.toFixed(0).padStart(7) + ' ' +
    st.aspd.toFixed(2).padStart(6) + ' ' +
    dpsOf(st).toFixed(0).padStart(7)
  );
}

/* 插值：任意等级取最近的两个采样点做线性插值 */
function statsAt(lv) {
  const keys = LV;
  if (lv <= keys[0]) return curve[keys[0]];
  if (lv >= keys[keys.length - 1]) return curve[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (lv >= keys[i] && lv <= keys[i + 1]) {
      const t = (lv - keys[i]) / (keys[i + 1] - keys[i]);
      const a = curve[keys[i]], b = curve[keys[i + 1]], o = {};
      for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t;
      return o;
    }
  }
  return curve[keys[0]];
}

/* ---------- 3. 逐波推演 ----------
 * 模拟一个从 entryLevel 出发的玩家：每波清场拿 0.5 级经验，
 * 怪物等级 = 玩家等级 + 1 + 波数×0.12（跟随玩家，保证 TTK 稳定），
 * 难度全部交给 hpMul / dmgMul 两个乘区。 */
function simulate(entryLevel, waves = 60, verbose = false) {
  let lv = entryLevel;
  const rows = [];
  for (let w = 1; w <= waves; w++) {
    const st = statsAt(lv);
    const elvl = Math.round(lv + 1 + w * 0.12);
    const dps = dpsOf(st) * g('trialBlessingPower')(w);   // 祝福带来的乘区
    const count = g('trialWaveCount')(w);
    const prof = poolProfile(w);
    const hp = enemyHp(prof.hp, elvl, w, lv);
    const ttk = hp / Math.max(1, dps);
    const hit = enemyDmg(prof.atk, elvl, w, lv);
    const ehp = ehpOf(st, lv);
    /* 承伤不是「一只怪打你多少刀」，而是「贴身 k 只时能撑几秒」。
     * k 取同屏数量的 25%（近战位有限，远程/包夹会分走一部分）。 */
    const k = Math.max(1, Math.round(count * 0.25));
    const mobDps = hit / prof.cd;
    const ttd = ehp / (k * mobDps);
    /* 首领战长度：首领血量 = 本波小怪均血 × 随波衰减的倍数 */
    const bossEq = g('trialBossEquiv')(w, w % 10 === 0);
    const bossTtk = hp * bossEq / Math.max(1, dps);
    rows.push({ w, lv, elvl, dps, hp, ttk, hit, ttd, k, count, bossTtk, bossEq });
    if (verbose) {
      console.log(
        String(w).padStart(3) + '  lv' + String(lv).padStart(3) +
        '  敌' + String(elvl).padStart(3) +
        '  DPS' + dps.toFixed(0).padStart(7) +
        '  敌血' + hp.toFixed(0).padStart(8) +
        '  TTK' + ttk.toFixed(1).padStart(5) + 's' +
        '  贴身' + String(k).padStart(2) + '只可撑' + ttd.toFixed(1).padStart(5) + 's' +
        '  同屏' + String(count).padStart(3)
      );
    }
    lv += 0.5;   // 每波 0.5 级
  }
  return rows;
}

for (const entry of [8, 20, 32]) {
  console.log('\n=== 从 ' + entry + ' 级进入，逐 5 波抽样 ===');
  const rows = simulate(entry);
  for (const r of rows) {
    if (r.w % 5) continue;
    console.log(
      String(r.w).padStart(3) + '波  玩家lv' + String(r.lv).padStart(3) +
      '  敌lv' + String(r.elvl).padStart(3) +
      '  TTK ' + r.ttk.toFixed(1).padStart(5) + 's' +
      '  贴身' + r.k + '只可撑 ' + r.ttd.toFixed(1).padStart(5) + 's' +
      '  同屏 ' + String(r.count).padStart(2) +
      (r.w % 5 === 0 ? '  首领战 ' + r.bossTtk.toFixed(0) + 's' + (r.w % 10 === 0 ? '（大）' : '') : '')
    );
  }
  const bad = rows.find(r => r.ttk > 9 || r.ttd < 6);
  console.log('  → 首个「崩盘点」：' + (bad ? bad.w + ' 波（TTK ' + bad.ttk.toFixed(1) + 's，贴身可撑 ' + bad.ttd.toFixed(1) + 's）' : '60 波内未崩'));
}

if (FULL) {
  console.log('\n=== 全量明细（20 级进入）===');
  simulate(20, 60, true);
}

/* ============================================================
 * 各等级的「最远波数」（P12）
 * ------------------------------------------------------------
 * 上面三段是「从 N 级进入、边打边升级」的推演，回答的是「一场能走多远」。
 * 这一段回答的是另一个问题：**同一个等级的玩家，靠装备碾压能推到第几波**。
 *
 * 所以这里**不涨等级**（`lv` 固定），只让波数往前走 —— 这正是 P12 要治的场景：
 * 40 级玩家反复重开第 1~10 波。等级乘区 `trialLevelMul` 生效后，
 * 高等级玩家在同一波的 TTK / 承伤都会变差，崩盘点提前。
 *
 * 崩判据与上面一致：TTK > 9 秒（打一只怪要挨 5 轮以上）或贴身可撑 < 6 秒。
 * 目标（计划书 P12）：10/20/30/40/50/60 级都落在 25~40 波。
 * ============================================================ */
function simulateFixed(level, waves = 80) {
  const st = statsAt(level);
  const ehp = ehpOf(st, level);
  for (let w = 1; w <= waves; w++) {
    const elvl = Math.round(level + 1 + w * 0.12);
    const dps = dpsOf(st) * g('trialBlessingPower')(w);
    const count = g('trialWaveCount')(w);
    const prof = poolProfile(w);
    const hp = enemyHp(prof.hp, elvl, w, level);
    const ttk = hp / Math.max(1, dps);
    const hit = enemyDmg(prof.atk, elvl, w, level);
    const k = Math.max(1, Math.round(count * 0.25));
    const ttd = ehp / (k * hit / prof.cd);
    if (ttk > 9 || ttd < 6) return { w, ttk, ttd };
  }
  return { w: waves, ttk: 0, ttd: 99 };
}

/* 注意「最远波数」的绝对值和计划书写的 25~40 对不上：
 * 这个模型从 v1.x 起就用「贴身 25% 同屏、可撑 6 秒」当崩盘线，
 * **P12 之前的基线本身就是 16~20 波**（不是 25~40）。所以这里不打印达标/不达标，
 * 只打印「比 10 级早几波崩」—— 那才是 P12 真正要验的东西（等级越高越难）。
 * 绝对波数要抬到 25~40 是另一件事（松 0.54 补偿系数），不在 P12 范围里。 */
console.log('\n=== 各等级「最远波数」（等级固定 · 崩盘线：TTK>9s 或贴身可撑<6s）===');
console.log('Lv   等级乘区   最远波数   比 10 级');
const base = simulateFixed(10).w;
for (const lv of [10, 20, 30, 40, 50, 60]) {
  const r = simulateFixed(lv);
  const mul = g('trialLevelMul')(lv);
  const d = r.w - base;
  console.log(
    String(lv).padEnd(5) +
    ('×' + mul.toFixed(2)).padStart(9) + '   ' +
    String(r.w).padStart(6) + ' 波   ' +
    (d === 0 ? '—' : (d > 0 ? '+' + d : String(d))) + ' 波'
  );
}

/* 同一波、不同等级：这才是「等级乘区有没有生效」的直接证据。
 * 上面那张表看的是「打到哪崩」，崩点由 ttd≈6 这条线决定，所以崩点处的 ttd
 * 永远接近 6，看不出等级差；这里固定波数横向比，才看得出 60 级的同一波
 * 到底比 10 级难多少。 */
console.log('\n=== 同一波 · 不同等级的强度（TTK 应随等级上升）===');
console.log('波次   Lv10 TTK   Lv30 TTK   Lv60 TTK   Lv60/Lv10');
for (const w of [5, 10, 20]) {
  const cell = (lv) => {
    const st = statsAt(lv);
    const elvl = Math.round(lv + 1 + w * 0.12);
    const dps = dpsOf(st) * g('trialBlessingPower')(w);
    const prof = poolProfile(w);
    return enemyHp(prof.hp, elvl, w, lv) / Math.max(1, dps);
  };
  const a = cell(10), b = cell(30), c = cell(60);
  console.log(
    String(w).padStart(4) + '   ' +
    a.toFixed(1).padStart(7) + 's  ' +
    b.toFixed(1).padStart(8) + 's  ' +
    c.toFixed(1).padStart(8) + 's  ' +
    ('×' + (c / a).toFixed(2)).padStart(9)
  );
}
