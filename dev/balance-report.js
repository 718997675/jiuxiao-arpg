/* ============================================================
 * dev/balance-report.js —— 主线数值体检（离线，node 直跑）
 *
 * 目的：回答三个问题
 *   1. 同级怪要打几秒（TTK）—— 太短就是「一路碾过去」，太长就是「打不动」
 *   2. 玩家能扛几下（TTD）—— 决定容错空间
 *   3. 升一级要杀多少只 —— 决定整条流程有多长
 *
 * 用真实装备生成器 + computePlayerStats 造「该等级的正常玩家」，
 * 用真实怪物表 + 游戏里的血量/伤害公式算怪，两边都不拍脑袋。
 *
 * 用法：
 *   node dev/balance-report.js
 *   node dev/balance-report.js --curve    # 加打装备曲线细节
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

function avgStats(cls, level, samples = 120) {
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
function ehpOf(st, level) {
  return st.hpMax / (1 - reduceOf(st, level));
}

/* 地图 → 怪物池平均档位（血量 / 攻击 / 攻击间隔） */
function mapProfile(mapId) {
  const m = g('MAPS')[mapId];
  if (!m || !m.spawns || !m.spawns.length) return null;
  let hp = 0, atk = 0, cd = 0, n = 0;
  for (const k of m.spawns) {
    const c = g('MONSTERS')[k];
    if (!c) continue;
    hp += c.hp; atk += c.atk; cd += (c.atkCd || 1.7); n++;
  }
  return n ? { hp: hp / n, atk: atk / n, cd: cd / n, lv: m.level, n } : null;
}

const MB = g('BALANCE').mob;
const XP = g('BALANCE').xp;
const CLS = process.argv.includes('--cls') ? process.argv[process.argv.indexOf('--cls') + 1] : 'warrior';

/* 主线推进节奏：每个阶段玩家大约在这个等级区间刷这张图 */
const STAGES = [
  ['forest', [4, 6, 8, 10, 12]],
  ['swamp', [12, 14, 16, 18, 20]],
  ['mine', [20, 22, 24, 26, 28]],
  ['abyss', [28, 31, 34, 37]],
  ['heaven', [35, 38, 40]]
];

console.log('=== 主线数值体检 · ' + CLS + ' · 全身蓝/紫/橙混合 ===');
console.log('地图      图lv  玩家lv   atk   hpMax    def   减伤   DPS   怪HP   TTK  承伤/下  可撑下数  可撑秒');
console.log('-'.repeat(112));

const rows = [];
for (const [mapId, levels] of STAGES) {
  const prof = mapProfile(mapId);
  if (!prof) continue;
  for (const lv of levels) {
    if (lv > 40) continue;
    const st = avgStats(CLS, lv);
    const dps = dpsOf(st);
    /* 怪物等级 = 图等级 ±1，取图等级为基准 */
    const elv = prof.lv;
    const ehp = prof.hp * ((MB.hpBase || 1) + elv * MB.hpLv + elv * elv * MB.hpLv2);
    const edmg = prof.atk * (1 + elv * MB.dmgLv);
    const ttk = ehp / dps;
    const take = edmg * (1 - reduceOf(st, lv));
    const hits = st.hpMax / take;
    const secs = hits * prof.cd;
    rows.push({ mapId, lv, ttk, secs, hits, dps, ehp });
    console.log(
      mapId.padEnd(9) + String(prof.lv).padStart(4) + String(lv).padStart(8) +
      st.atk.toFixed(0).padStart(7) + st.hpMax.toFixed(0).padStart(7) +
      st.def.toFixed(0).padStart(7) + (reduceOf(st, lv) * 100).toFixed(0).padStart(6) + '%' +
      dps.toFixed(0).padStart(7) + ehp.toFixed(0).padStart(7) +
      ttk.toFixed(1).padStart(6) + 's' + take.toFixed(0).padStart(8) +
      hits.toFixed(0).padStart(9) + secs.toFixed(0).padStart(8) + 's'
    );
  }
}

/* ---------- 首领战时长 ---------- */
console.log('\n=== 首领战（站桩口径 · 不含走位）===');
console.log('首领                 等级   血量    玩家DPS   预计');
for (const [mapId, levels] of STAGES) {
  const m = g('MAPS')[mapId];
  if (!m || !m.bosses) continue;
  const lv = levels[0];              // 用「刚进图」的等级当基准
  const st = avgStats(CLS, lv);
  const dps = dpsOf(st);
  for (const bid of m.bosses) {
    const b = g('BOSSES')[bid];
    if (!b) continue;
    const hp = b.hp * g('bossHpScale')(b.level);
    console.log(
      (b.name || bid).padEnd(20) + String(b.level).padStart(5) +
      hp.toFixed(0).padStart(8) + dps.toFixed(0).padStart(10) +
      (hp / dps).toFixed(1).padStart(7) + 's'
    );
  }
}

/* ---------- 新手期：只有一把初始武器 ---------- */
console.log('\n=== 新手期（裸装 + 一把凡品武器 · 最坏情况）===');
console.log('玩家lv  图lv   atk   DPS   怪HP   TTK');
for (const [lv, elv] of [[1, 3], [2, 3], [3, 4], [5, 4], [8, 4], [10, 12], [12, 12]]) {
  const w = g('rollItem')(lv, { slot: 'weapon', rarity: 'common', cls: CLS });
  const st = g('computePlayerStats')({
    cls: CLS, level: lv, equipment: { weapon: w }, talents: {},
    attrAlloc: { str: 0, agi: 0, vit: 0, int: 0 }, skills: {}, codex: null, trialBonus: null
  });
  const dps = dpsOf(st);
  const hp = 71 * ((MB.hpBase || 1) + elv * MB.hpLv + elv * elv * MB.hpLv2);
  console.log(
    String(lv).padStart(6) + String(elv).padStart(6) +
    st.atk.toFixed(0).padStart(6) + dps.toFixed(0).padStart(6) +
    hp.toFixed(0).padStart(7) + (hp / dps).toFixed(1).padStart(6) + 's'
  );
}

/* ---------- 升级节奏：升一级要杀多少只同级怪 ---------- */
console.log('\n=== 升级节奏（每级需击杀数 · 同级怪 · 经验 ' + XP.base + '×L^' + XP.pow + '）===');
const mobXpBase = 14;   // 森林小怪的平均 xp，随等级按 (1 + lv*mobLv) 放大
let totalKills = 0;
for (let lv = 2; lv <= 40; lv++) {
  const need = g('xpToNext')(lv);
  const perKill = mobXpBase * (1 + lv * XP.mobLv);
  const kills = Math.ceil(need / perKill);
  totalKills += kills;
  if (lv % 4 === 0 || lv <= 4) {
    console.log('  Lv' + String(lv).padStart(2) + '  需 ' + need.toFixed(0).padStart(7) + ' exp   每只 ' + perKill.toFixed(0).padStart(4) + '   击杀 ' + String(kills).padStart(4));
  }
}
console.log('  1→40 累计击杀约 ' + totalKills + ' 只');

/* 总时长估算：每只怪 = TTK + 走动/拾取约 2.2 秒 */
const avgTtk = rows.reduce((a, r) => a + r.ttk, 0) / rows.length;
const perKillSec = avgTtk + 2.2;
console.log('  平均 TTK ' + avgTtk.toFixed(1) + 's，按每只 ' + perKillSec.toFixed(1) + 's 计，纯刷怪约 ' +
  (totalKills * perKillSec / 3600).toFixed(1) + ' 小时');
