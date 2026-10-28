/* ============================================================
 * dev/balance-report.js —— 全流程数值体检（离线，node 直跑）
 *
 * [M6] 从「5 张老图 · 40 级」重写到「30 张图 · 60 级 · 五卷」。
 *
 * 回答四个问题：
 *   1. 同级怪要打几秒（TTK）—— 太短就是「一路碾过去」，太长就是「打不动」
 *   2. 玩家能扛几下（TTD）—— 决定容错空间
 *   3. 五卷各吃多少经验、各自折算多长时间（计划书 §10.2 的总账）
 *   4. 装备成长跟不跟得上怪物成长（基底 8 阶 + ilvl 60）
 *
 * 用真实装备生成器 + computePlayerStats 造「该等级的正常玩家」，
 * 用真实怪物表 + 游戏里的血量/伤害公式算怪，两边都不拍脑袋。
 *
 * 用法：
 *   node dev/balance-report.js
 *   node dev/balance-report.js --cls mage    # 换职业
 *   node dev/balance-report.js --all         # 三职业并排
 *
 * 不参与运行时，也不被 index.html 引用。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Date, isFinite, Number, String, Array, Object, parseInt, parseFloat };
const g = (expr) => vm.runInContext(expr, ctx);
vm.createContext(ctx);

/* 数据层文件清单从 index.html 读，避免手写清单漏文件 */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(src\/[^"]+\.js)"><\/script>/g)]
  .map(m => m[1])
  .filter(f => f.startsWith('src/data/') || f === 'src/items.js');
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log('  (skip) ' + f); continue; }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('FAIL ' + f + ': ' + e.message); process.exit(1); }
}

const SLOTS = ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'ring', 'weapon', 'offhand'];
/* 「正常玩家」的装备品质分布：以稀有为主，橙装零星。
 * 用首领池那套（玄 58 / 神 26 / 套 12 / 传 4）会高估 —— 那是刷首领的收益。 */
const MIX = [['magic', 30], ['rare', 52], ['legendary', 16], ['set', 2]];

const BALANCE = g('BALANCE');
const MB = BALANCE.mob;
const XP = BALANCE.xp;
const PARTS = g('PARTS');
const ACTS = g('ACTS');
const MAPS = g('MAPS');
const MONSTERS = g('MONSTERS');
const BOSSES = g('BOSSES');
const ILVL_MAX = g('ILVL_MAX');

const CLS_LIST = ['warrior', 'mage', 'taoist'];
const CLS_ARG = process.argv.includes('--cls') ? process.argv[process.argv.indexOf('--cls') + 1] : 'warrior';
const REPORT_CLS = (function () {
  if (process.argv.includes('--all')) return null;
  return CLS_LIST.indexOf(CLS_ARG) >= 0 ? CLS_ARG : 'warrior';
})();

function avgStats(cls, level, samples = 90) {
  const acc = {};
  for (let s = 0; s < samples; s++) {
    const eq = {};
    let ringN = 0;
    for (const slot of SLOTS) {
      const r = g('pickFromPool')(MIX);
      const it = g('rollItem')(level, { slot, rarity: r, cls });
      if (slot === 'ring') { eq['ring' + (++ringN)] = it; }
      else eq[slot] = it;
    }
    const p = {
      cls, level, equipment: eq, talents: {}, attrAlloc: { str: 0, agi: 0, vit: 0, int: 0 },
      skills: {}, codex: null, trialBonus: null
    };
    const st = g('computePlayerStats')(p);
    for (const k of ['atk', 'hpMax', 'def', 'crit', 'critDmg', 'aspd', 'dmgAll', 'moveSpd']) {
      acc[k] = (acc[k] || 0) + (Number(st[k]) || 0);
    }
  }
  for (const k in acc) acc[k] /= samples;
  return acc;
}

/* 普攻 DPS：atk × 攻速 / 0.72（基础挥砍周期）× 暴击期望 × (1+全伤)
 * 技能按 1.9 倍折算（与 trial-balance 同口径，方便横向比） */
function dpsOf(st, skillMul = 1.9) {
  const critMul = 1 + (st.crit / 100) * (st.critDmg / 100 - 1);
  return st.atk * st.aspd / 0.72 * critMul * (1 + (st.dmgAll || 0) / 100) * skillMul;
}
function reduceOf(st, level) {
  /* 与 game.js damagePlayer 同口径（v1.11.0 收紧后的曲线） */
  return Math.min(0.70, st.def / (st.def + 380 + level * 28));
}
function mobHpOf(cfgHp, lv) {
  return cfgHp * ((MB.hpBase || 1) + lv * MB.hpLv + lv * lv * MB.hpLv2);
}
function mobDmgOf(cfgAtk, lv) {
  return cfgAtk * (1 + lv * MB.dmgLv);
}

/* 地图 → 怪物池平均档位（血量 / 攻击 / 攻击间隔） */
function mapProfile(mapId) {
  const m = MAPS[mapId];
  if (!m || !m.spawns || !m.spawns.length) return null;
  let hp = 0, atk = 0, cd = 0, n = 0;
  for (const k of m.spawns) {
    const c = MONSTERS[k];
    if (!c) continue;
    hp += c.hp; atk += c.atk; cd += (c.atkCd || 1.7); n++;
  }
  return n ? { hp: hp / n, atk: atk / n, cd: cd / n, lv: m.level, n } : null;
}

/* 阶段表：从 ACTS 自动推（不再手写 5 张老图，30 张图一张都不能漏） */
const STAGES = [];
for (const aid of Object.keys(ACTS)) {
  const act = ACTS[aid];
  for (const m of (act.maps || [])) {
    if (!MAPS[m.id]) continue;
    STAGES.push({ part: act.part, act: aid, mapId: m.id, lv: MAPS[m.id].level });
  }
}
STAGES.sort((a, b) => a.lv - b.lv || (a.mapId < b.mapId ? -1 : 1));

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const line = (n) => '-'.repeat(n);

/* ============================================================
 * 一、逐图体检
 * ============================================================ */
const FIELDS = REPORT_CLS ? [REPORT_CLS] : CLS_LIST;
const perMap = {};    // mapId → { cls: { ttk, secs, hits, dps } }

for (const cls of FIELDS) {
  console.log('\n=== 一、逐图体检 · ' + cls + ' · 全身蓝/紫/橙混合 ===');
  console.log(pad('卷', 3) + pad('章', 6) + pad('图', 12) + padL('图lv', 5) + padL('atk', 6) +
    padL('hpMax', 7) + padL('def', 6) + padL('减伤', 6) + padL('DPS', 6) + padL('怪HP', 7) +
    padL('TTK', 7) + padL('承伤', 6) + padL('可撑', 6));
  console.log(line(96));
  for (const s of STAGES) {
    const prof = mapProfile(s.mapId);
    if (!prof) continue;
    const st = avgStats(cls, s.lv);
    const dps = dpsOf(st);
    const ehp = mobHpOf(prof.hp, prof.lv);
    const edmg = mobDmgOf(prof.atk, prof.lv);
    const ttk = ehp / dps;
    const take = edmg * (1 - reduceOf(st, s.lv));
    const hits = st.hpMax / take;
    const secs = hits * prof.cd;
    (perMap[s.mapId] || (perMap[s.mapId] = {}))[cls] = { ttk, secs, hits, dps, lv: s.lv };
    console.log(
      pad(s.part, 3) + pad(s.act, 6) + pad(MAPS[s.mapId].name, 12) + padL(prof.lv, 5) +
      padL(st.atk.toFixed(0), 6) + padL(st.hpMax.toFixed(0), 7) + padL(st.def.toFixed(0), 6) +
      padL((reduceOf(st, s.lv) * 100).toFixed(0) + '%', 6) + padL(dps.toFixed(0), 6) +
      padL(ehp.toFixed(0), 7) + padL(ttk.toFixed(1) + 's', 7) +
      padL(take.toFixed(0), 6) + padL(hits.toFixed(0), 6));
  }
  /* 卷小结 */
  for (let p = 1; p <= 5; p++) {
    const rows = STAGES.filter(s => s.part === p).map(s => perMap[s.mapId] && perMap[s.mapId][cls]).filter(Boolean);
    if (!rows.length) continue;
    const aTtk = rows.reduce((a, r) => a + r.ttk, 0) / rows.length;
    const aHits = rows.reduce((a, r) => a + r.hits, 0) / rows.length;
    console.log(pad('', 3) + '卷' + p + ' 小结：平均 TTK ' + aTtk.toFixed(1) + 's · 平均可撑 ' +
      aHits.toFixed(0) + ' 下（' + rows.length + ' 图）');
  }
}

/* 一张图里「平均每只小怪给多少经验」：读真实怪物表，不拿常数外推。
 * 早期版本写死 mobXpBase = 14 按等级外推，结果 60 级算出来要 3200 只/级 ——
 * 那是森林小怪的数字，卷五的怪一只就给几百。**经验必须查表，不能拍脑袋**。 */
function avgMobXp(mapId) {
  const m = MAPS[mapId];
  if (!m || !m.spawns || !m.spawns.length) return 14;
  let sum = 0, n = 0;
  for (const k of m.spawns) {
    const c = MONSTERS[k];
    if (!c) continue;
    sum += (c.xp || 12) * (1 + m.level * XP.mobLv);
    n++;
  }
  return n ? sum / n : 14;
}
/* 一卷的平均每只经验 = 卷内各图均值（图级已含等级差） */
function partMobXp(p) {
  const rows = STAGES.filter(s => s.part === p).map(s => avgMobXp(s.mapId));
  return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 14;
}

/* ============================================================
 * 二、五卷经验占比（计划书 §10.2 的总账）
 * ============================================================ */
console.log('\n=== 二、五卷经验占比（上限 ' + ILVL_MAX + ' 级 · ' + XP.base + '×L^' + XP.pow + '）===');
/* 方案给的对照值：3 / 11 / 18 / 28 / 40 */
const PLAN_SHARE = { 1: 3, 2: 11, 3: 18, 4: 28, 5: 40 };
let totalXp = 0;
const segXp = {};
for (let lv = 1; lv <= ILVL_MAX; lv++) {
  const n = g('xpToNext')(lv);
  totalXp += n;
  for (let p = 1; p <= 5; p++) {
    const P = PARTS[p];
    if (lv >= P.from && lv <= P.to) segXp[p] = (segXp[p] || 0) + n;
  }
}
/* 每卷的平均 TTK（用来折算时长） */
function partTtk(p, cls) {
  const rows = STAGES.filter(s => s.part === p).map(s => (perMap[s.mapId] || {})[cls]).filter(Boolean);
  return rows.length ? rows.reduce((a, r) => a + r.ttk, 0) / rows.length : 2.5;
}
const HOUR_CLS = REPORT_CLS || 'warrior';
console.log(pad('卷', 3) + pad('名称', 12) + padL('等级段', 9) + padL('级数', 5) +
  padL('经验', 10) + padL('占比', 7) + padL('方案', 7) + padL('偏差', 7) + padL('折算', 8));
console.log(line(76));
let warn = [];
let totalHours = 0;
for (let p = 1; p <= 5; p++) {
  const P = PARTS[p];
  const n = P.to - P.from + 1;
  const xp = segXp[p] || 0;
  const share = totalXp ? xp / totalXp * 100 : 0;
  const plan = PLAN_SHARE[p];
  const dev = share - plan;
  const perKill = partMobXp(p);
  const ttk = partTtk(p, HOUR_CLS);
  const hours = xp / perKill * (ttk + 2.2) / 3600;
  totalHours += hours;
  console.log(pad(p, 3) + pad(P.name, 12) + padL(P.from + '~' + P.to, 9) + padL(n, 5) +
    padL((xp / 10000).toFixed(0) + '万', 10) + padL(share.toFixed(1) + '%', 7) +
    padL(plan + '%', 7) + padL((dev >= 0 ? '+' : '') + dev.toFixed(1), 7) +
    padL(hours.toFixed(1) + 'h', 8));
  if (share > 45) warn.push('卷' + p + ' 占比 ' + share.toFixed(1) + '% > 45%');
}
console.log(line(76));
console.log(pad('合', 3) + pad('', 12) + padL('1~' + ILVL_MAX, 9) + padL(ILVL_MAX, 5) +
  padL((totalXp / 10000).toFixed(0) + '万', 10) + padL('100%', 7) + padL(totalHours.toFixed(1) + 'h', 8));
console.log('  纯刷小怪通关约 ' + totalHours.toFixed(1) + ' 小时（任务 / 悬赏 / 地脉另计，只会更短）');
if (warn.length) { console.log('  ⚠ ' + warn.join(' · ')); }
else { console.log('  ✓ 五卷占比都在 45% 以内'); }

/* ============================================================
 * 三、升级节奏（每级要杀多少只同级怪）
 * ============================================================ */
console.log('\n=== 三、升级节奏（同级怪 · 经验查真实怪物表）===');
let totalKills = 0;
for (let lv = 1; lv < ILVL_MAX; lv++) {
  const need = g('xpToNext')(lv);
  /* 该等级段落在哪一卷，就用那一卷的平均每只经验 */
  let p = 1;
  for (let i = 1; i <= 5; i++) if (lv >= PARTS[i].from && lv <= PARTS[i].to) p = i;
  const perKill = partMobXp(p);
  totalKills += Math.ceil(need / perKill);
  if (lv % 5 === 0 || lv === 1) {
    console.log('  Lv' + padL(lv, 2) + '  需 ' + padL(need.toFixed(0), 7) + ' exp   每只 ' +
      padL(perKill.toFixed(0), 4) + '   击杀 ' + padL(Math.ceil(need / perKill), 5) + '   （卷' + p + '）');
  }
}
console.log('  1→' + ILVL_MAX + ' 累计击杀约 ' + totalKills + ' 只');

/* ============================================================
 * 四、装备成长（8 阶基底 · ilvl 1→60；ilvl 41~60 由 tierIndex 夹到第 7 档「太初」）
 * ============================================================ */
console.log('\n=== 四、装备成长（白装中位数 · 基底 ' + g('BASE_TIERS') + ' 阶）===');
console.log(pad('ilvl', 5) + padL('武器基础', 10) + padL('战甲护甲', 10) + padL('头盔护甲', 10) + padL('阶名', 10));
console.log(line(48));
const eqCurve = {};
/* 采样点：1 / 每 5 级 / 顶档（60 不是 5 的倍数，必须补上，否则顶档那一行永远是空的） */
const EQ_STEPS = [1];
for (let lv = 5; lv <= ILVL_MAX; lv += 5) EQ_STEPS.push(lv);
if (EQ_STEPS[EQ_STEPS.length - 1] !== ILVL_MAX) EQ_STEPS.push(ILVL_MAX);
for (const lv of EQ_STEPS) {
  const w = [], c = [], h = [];
  for (let i = 0; i < 60; i++) {
    const wi = g('rollItem')(lv, { slot: 'weapon', cls: REPORT_CLS || 'warrior', rarity: 'common' });
    w.push((wi.baseDmg[0] + wi.baseDmg[1]) / 2);
    c.push(g('rollItem')(lv, { slot: 'chest', rarity: 'common' }).baseArmor);
    h.push(g('rollItem')(lv, { slot: 'helm', rarity: 'common' }).baseArmor);
  }
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  eqCurve[lv] = { w: med(w), c: med(c), h: med(h) };
  console.log(pad(lv, 5) + padL(eqCurve[lv].w.toFixed(0), 10) + padL(eqCurve[lv].c, 10) +
    padL(eqCurve[lv].h, 10) + padL(g('BASE_TIER_NAME')[g('tierIndex')(lv)], 10));
}
console.log('  1→' + ILVL_MAX + ' 武器基础伤害 ' + (eqCurve[ILVL_MAX].w / eqCurve[1].w).toFixed(1) +
  'x · 战甲护甲 ' + (eqCurve[ILVL_MAX].c / eqCurve[1].c).toFixed(1) + 'x');
/* 关键对照：40→60 的装备成长 vs 怪物成长，两条必须同量级 */
const eq4060 = eqCurve[ILVL_MAX].w / eqCurve[40].w;
const mob4060 = mobHpOf(1, 60) / mobHpOf(1, 40);
console.log('  40→60：武器 ×' + eq4060.toFixed(2) + ' · 同级怪血量 ×' + mob4060.toFixed(2) +
  (Math.abs(eq4060 - mob4060) < 0.35 ? '  ✓ 匹配' : '  ⚠ 不匹配（装备与怪物成长脱节）'));

/* ============================================================
 * 五、首领战（站桩口径，不含走位）
 * ============================================================ */
console.log('\n=== 五、首领战（站桩口径 · 不含走位）===');
console.log(pad('首领', 20) + padL('等级', 5) + padL('血量', 9) + padL('玩家DPS', 9) + padL('预计', 8));
console.log(line(52));
const seenBoss = new Set();
for (const aid of Object.keys(ACTS)) {
  const act = ACTS[aid];
  /* 玩家打这一章的首领时，已经走完这一章了 —— 等级取**章末**（act.to），
   * 不是章首图。取章首会把「南天守门神」按 35 级玩家的 DPS 算，
   * 得出 79 秒这种假红（真实是 50 级玩家打，40 秒上下）。 */
  const lv = Math.max(1, act.to || 1);
  const st = avgStats(REPORT_CLS || 'warrior', lv);
  const dps = dpsOf(st);
  for (const bid of [act.boss, act.sub]) {
    if (!bid || seenBoss.has(bid)) continue;
    const b = BOSSES[bid];
    if (!b) continue;
    seenBoss.add(bid);
    const hp = b.hp * g('bossHpScale')(b.level);
    const secs = hp / dps;
    console.log(pad(b.name || bid, 20) + padL(b.level, 5) + padL(hp.toFixed(0), 9) +
      padL(dps.toFixed(0), 9) + padL(secs.toFixed(1) + 's', 8) +
      (secs > 75 ? '  ← 偏长' : ''));
  }
}

/* ============================================================
 * 六、新手期（裸装 + 一把凡品武器 · 最坏情况）
 * ============================================================ */
console.log('\n=== 六、新手期（裸装 + 一把凡品武器 · 最坏情况）===');
console.log(pad('玩家lv', 7) + padL('图lv', 5) + padL('atk', 6) + padL('DPS', 6) + padL('怪HP', 7) + padL('TTK', 7));
for (const [lv, mapId] of [[1, 'forest'], [2, 'forest'], [3, 'forest'], [5, 'forest'], [8, 'sunset'], [10, 'swamp'], [12, 'swamp']]) {
  const w = g('rollItem')(lv, { slot: 'weapon', rarity: 'common', cls: REPORT_CLS || 'warrior' });
  const st = g('computePlayerStats')({
    cls: REPORT_CLS || 'warrior', level: lv, equipment: { weapon: w }, talents: {},
    attrAlloc: { str: 0, agi: 0, vit: 0, int: 0 }, skills: {}, codex: null, trialBonus: null
  });
  const dps = dpsOf(st);
  const elv = MAPS[mapId] ? MAPS[mapId].level : lv;
  const hp = mobHpOf(71, elv);
  console.log(pad(lv, 7) + padL(elv, 5) + padL(st.atk.toFixed(0), 6) + padL(dps.toFixed(0), 6) +
    padL(hp.toFixed(0), 7) + padL((hp / dps).toFixed(1) + 's', 7));
}

/* ============================================================
 * 七、经验供给结构（计划书 §10.2「卷五靠地下城与悬赏补」的验收）
 *
 * §10.2 写死了：卷五吃掉 40% 的经验，**不许靠再加两张图**，
 * 要靠「悬赏 + 无限地下城」这两条重复线。这一节就是查它做到了没有：
 *   一次性任务只能吃一次，算完就从需求里扣掉；
 *   剩下的差额只有三条路 —— 纯刷 / 悬赏循环 / 地脉，各折算多少小时。
 *  repeats 的每小时收益差得越多，说明「只刷一张图」的诱惑越大，内容就越浪费。
 * ============================================================ */
console.log('\n=== 七、经验供给结构与重复可刷深度（normal 难度）===');
const QUESTS = g('QUESTS');
const DIFFS = g('DIFFS');
const DL = g('DUNGEON_LAYERS');
const dungeonMobLevel = g('dungeonMobLevel');
const D = DIFFS.normal;
function partQuests(p) {
  return Object.values(QUESTS).filter(q => q.part === p);
}
/* 悬赏一轮要杀多少只（killAny 才算击杀；地脉那条不算，它卖的是一把钥匙） */
function boardRound(rows) {
  let xp = 0, kills = 0, dg = 0, dgXp = 0;
  for (const q of rows) {
    if (q.kind !== 'board') continue;
    xp += (q.rewards && q.rewards.xp) || 0;
    for (const o of (q.objectives || [])) {
      if (o.type === 'killAny') kills += o.count;
      else if (o.type === 'dungeon') { dg += o.count; dgXp += q.rewards.xp; }
    }
  }
  return { xp, kills, dg, dgXp };
}
/* 一次地脉的收益：3 层小怪（1.8 倍经验）+ 守关首领 + 该卷那条地脉悬赏 */
function dungeonRun(p) {
  const mobs = DL.reduce((a, l) => a + (l.total || 0), 0);
  const lvOfP = Math.round((PARTS[p].from + PARTS[p].to) / 2);
  const mlv = dungeonMobLevel(lvOfP, p);
  const mobXp = mobs * partMobXp(p) * (BALANCE.dungeon ? BALANCE.dungeon.xpMul : 1);
  const bossXp = mlv * XP.bossLv;
  const b = boardRound(partQuests(p));
  return { mobs, mlv, mobXp, bossXp, bounty: b.dgXp, total: mobXp + bossXp + b.dgXp };
}
console.log(pad('卷', 3) + padL('本卷需求', 10) + padL('一次性', 9) + padL('净需求', 10) +
  padL('悬赏/只', 9) + padL('地脉/趟', 10) + padL('纯刷', 7) + padL('做悬赏', 8) + padL('刷地脉', 8));
console.log(line(74));
let hPlain = 0, hBoard = 0, hDgn = 0;
for (let p = 1; p <= 5; p++) {
  const rows = partQuests(p);
  const once = rows.filter(q => q.kind !== 'board').reduce((a, q) => a + ((q.rewards && q.rewards.xp) || 0), 0);
  const net = Math.max(0, (segXp[p] || 0) - once);
  const ttk = partTtk(p, HOUR_CLS);
  const sec = ttk + 2.2;                                  /* 一只怪的总耗时：打 + 走过去 */
  /* 平均每只怪的经验：精英占比 × dramatic 2 倍（game.js: baseXp × (e.elite ? 2 : 1)） */
  const perBase = partMobXp(p) * (1 + D.elite);
  const b = boardRound(rows);
  /* 悬赏循环：每杀一只，还分摊到 29~180 分之一条悬赏 */
  const perBoard = b.kills ? b.xp / b.kills : 0;
  const run = dungeonRun(p);
  const tPlain = net / perBase * sec / 3600;
  const tBoard = net / (perBase + perBoard) * sec / 3600;
  /* 地脉一趟的总耗时：3 层怪（含 1.8 倍经验下的击杀数）+ 首领一首叹]。
   * 首领按「同阶小怪均血 × 14」反解（dungeon.js），用 TTK 折算。 */
  const bossSec = (ttk * 14) + 20;
  const tDgn = net / run.total * ((run.mobs * sec) + bossSec) / 3600;
  hPlain += tPlain; hBoard += tBoard; hDgn += tDgn;
  console.log(pad(p, 3) + padL(((segXp[p] || 0) / 10000).toFixed(1) + '万', 10) +
    padL((once / 10000).toFixed(1) + '万', 9) + padL((net / 10000).toFixed(1) + '万', 10) +
    padL(perBoard.toFixed(0), 9) + padL((run.total / 10000).toFixed(1) + '万', 10) +
    padL(tPlain.toFixed(1) + 'h', 7) + padL(tBoard.toFixed(1) + 'h', 8) + padL(tDgn.toFixed(1) + 'h', 8));
  if (p === 5) {
    console.log('     └ 卷五地脉明细：小怪 ' + run.mobs + ' 只(lv' + run.mlv + ') ' +
      Math.round(run.mobXp / 1000) + 'k + 首领 ' + Math.round(run.bossXp / 1000) + 'k + 悬赏 ' +
      Math.round(run.bounty / 1000) + 'k');
  }
}
console.log(line(74));
console.log(pad('合', 3) + padL((totalXp / 10000).toFixed(1) + '万', 10) + padL('', 9) + padL('', 10) +
  padL('', 9) + padL('', 10) + padL(hPlain.toFixed(1) + 'h', 7) + padL(hBoard.toFixed(1) + 'h', 8) +
  padL(hDgn.toFixed(1) + 'h', 8));
console.log('  「做悬赏」比「纯刷」快 ' + (hPlain / hBoard).toFixed(2) + ' 倍 —— 这个倍数是**内容引导**，' +
  '不是惩罚：' );
console.log('  太大 = 不做悬赏就是傻（玩家被迫每 8 分钟回一趟营地）；太小 = 悬赏板没人看。项目口径落在 1.3~2.0。');
console.log('  ⚠ 地脉受**钥匙供给**限制（小怪 0.6% / 精英 10% / 首领必掉本阶），不能无限刷 ——');
console.log('    上表按「钥匙管够」算，实际它只是把刷怪的一部分时间换成了更高密度。');

console.log('');
