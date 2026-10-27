/* ============================================================
 * dev/test-m6.js —— M6 收口验证（纯 node + vm，不依赖浏览器）
 *
 *   node dev/test-m6.js
 *
 * 钉住六件事（都是「改一个数就会悄悄坏掉」的地方）：
 *   1. 基底 12 阶：每槽 12 档 × 3 变体，名字表 / 材质表同长
 *   2. ilvl 上限 60：tierIndex 的分档边界、rollItem 的夹紧
 *   3. 数值单调：护甲与武器伤害随档位递增（表写歪会立刻红）
 *   4. 传世 28 件：41~60 段有货、特性全表唯一、stats key 全部合法
 *   5. 地下城经验 1.8 倍（计划书 §10.2，M5 漏掉的那条）
 *   6. 经验曲线与五卷占比：总量、方案偏差、单卷 45% 上限
 * ============================================================ */
const { loadData } = require('./_load');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ctx = loadData();
const pick = n => vm.runInContext(n, ctx);

/* TIER_METAL / METAL_PALETTE 在 actors.js（运行时文件，_load 不装它：
 * 里面 new THREE.Color 会当场炸）。这里静态提取名字数组与配色表的 key ——
 * 2026-10-25 那次线上崩溃正是「BASE_TIERS 扩了、TIER_METAL 没扩」，
 * 所以这条断言值得用正则读源码来钉。 */
const actorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'actors.js'), 'utf8');
const TIER_METAL = (function () {
  const m = /const TIER_METAL = \[([\s\S]*?)\];/.exec(actorsSrc);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
})();
const METAL_PALETTE = (function () {
  const m = /const METAL_PALETTE = \{([\s\S]*?)\n\};/.exec(actorsSrc);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const k = /^\s*(\w+):\s*\[/.exec(line);
    if (k) out[k[1]] = true;
  }
  return out;
})();
const BASE_TIERS = pick('BASE_TIERS');
const TIER_LEVELS = pick('TIER_LEVELS');
const BASE_TIER_NAME = pick('BASE_TIER_NAME');
const ILVL_MAX = pick('ILVL_MAX');
const ARMOR_BASES = pick('ARMOR_BASES');
const WEAPON_BASES = pick('WEAPON_BASES');
const OFFHAND_BASES = pick('OFFHAND_BASES');
const UNIQUE_ITEMS = pick('UNIQUE_ITEMS');
const UNIQUE_TRAITS = pick('UNIQUE_TRAITS');
const STATS = pick('STATS');
const BALANCE = pick('BALANCE');
const PARTS = pick('PARTS');
const xpToNext = pick('xpToNext');
const tierIndex = pick('tierIndex');
const rollItem = pick('rollItem');
const uniquePool = pick('uniquePool');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; return true; }
  fail++;
  console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  return false;
};
const eq = (msg, a, b) => ok(a === b, msg, { got: a, want: b });

/* ============================================================
 * 1. 基底 12 阶
 * ============================================================ */
console.log('\n【1】基底 12 阶');
eq('BASE_TIERS = 12', BASE_TIERS, 12);
eq('TIER_LEVELS 仍是 5（每 5 级一档）', TIER_LEVELS, 5);
eq('BASE_TIERS × TIER_LEVELS 覆盖 ilvl 上限', BASE_TIERS * TIER_LEVELS, ILVL_MAX);
eq('BASE_TIER_NAME 与 BASE_TIERS 同长', BASE_TIER_NAME.length, BASE_TIERS);
eq('TIER_METAL 与 BASE_TIERS 同长（扩档漏加材质 = 穿上就崩）', TIER_METAL.length, BASE_TIERS);
ok(TIER_METAL.every(m => METAL_PALETTE[m]), '每种材质都有配色',
  TIER_METAL.filter(m => !METAL_PALETTE[m]));
ok(new Set(BASE_TIER_NAME).size === BASE_TIERS, '阶名不重复',
  BASE_TIER_NAME.filter((n, i) => BASE_TIER_NAME.indexOf(n) !== i));
ok(new Set(TIER_METAL).size === BASE_TIERS, '材质名不重复');

/* 每个护甲槽 12 档 × 3 变体 */
for (const slot in ARMOR_BASES) {
  const list = ARMOR_BASES[slot];
  ok(list.length === BASE_TIERS, `护甲槽 ${slot} 有 ${BASE_TIERS} 档`, list.length);
  ok(list.every(t => t.length === 3), `护甲槽 ${slot} 每档 3 变体`,
    list.map(t => t.length));
}
/* 武器 / 副手 3 职业 × 12 档 */
for (const cls in WEAPON_BASES) {
  const list = WEAPON_BASES[cls];
  ok(list.length === BASE_TIERS, `武器 ${cls} 有 ${BASE_TIERS} 档`, list.length);
  ok(list.every(t => t.length === 3), `武器 ${cls} 每档 3 变体`);
}
for (const cls in OFFHAND_BASES) {
  const list = OFFHAND_BASES[cls];
  ok(list.length === BASE_TIERS, `副手 ${cls} 有 ${BASE_TIERS} 档`, list.length);
  ok(list.every(t => t.length === 3), `副手 ${cls} 每档 3 变体`);
}

/* ============================================================
 * 2. ilvl 上限 60
 * ============================================================ */
console.log('\n【2】ilvl 上限 60');
eq('ILVL_MAX = 60', ILVL_MAX, 60);
eq('ilvl 1 → 第 0 档', tierIndex(1), 0);
eq('ilvl 5 → 第 0 档（分档左闭右闭）', tierIndex(5), 0);
eq('ilvl 6 → 第 1 档', tierIndex(6), 1);
eq('ilvl 60 → 第 11 档', tierIndex(60), BASE_TIERS - 1);
eq('ilvl 999 被夹到顶档（不越界）', tierIndex(999), BASE_TIERS - 1);
eq('ilvl 0 被夹到底档', tierIndex(0), 0);
for (const lv of [1, 30, 59, 60, 99]) {
  const it = rollItem(lv, { slot: 'chest', rarity: 'common' });
  ok(it.ilvl <= ILVL_MAX && it.ilvl >= 1, `rollItem(${lv}) 的 ilvl 被夹在 1~60`, it.ilvl);
  ok(it.baseTier >= 0 && it.baseTier < BASE_TIERS, `rollItem(${lv}) 的 baseTier 合法`, it.baseTier);
}
const top = rollItem(600, { slot: 'weapon', rarity: 'common' });
eq('rollItem(600) 夹到 60 级', top.ilvl, 60);

/* 60 级装备的穿戴需求必须在等级上限内 */
const reqOk = [1, 20, 40, 60].every(lv => {
  const it = rollItem(lv, { slot: 'helm', rarity: 'common' });
  return it.reqLv <= ILVL_MAX;
});
ok(reqOk, '穿戴需求 reqLv 不超过等级上限');

/* ============================================================
 * 3. 数值单调
 * ============================================================ */
console.log('\n【3】数值单调（护甲 / 武器伤害随档位递增）');
for (const slot in ARMOR_BASES) {
  for (let v = 0; v < 3; v++) {
    const vals = ARMOR_BASES[slot].map(t => t[v][1]);
    /* 命格 / 项链 / 戒指的护甲恒为 0，只检查有护甲的那些 */
    const nonzero = vals.filter(x => x > 0);
    if (nonzero.length < 2) continue;
    const mono = vals.every((x, i) => i === 0 || x >= vals[i - 1]);
    ok(mono, `${slot} 变体 ${v} 的护甲不是随档递增`, vals);
  }
}
for (const cls in WEAPON_BASES) {
  for (let v = 0; v < 3; v++) {
    const vals = WEAPON_BASES[cls].map(t => t[v].dmg[1]);
    ok(vals.every((x, i) => i === 0 || x > vals[i - 1]),
      `${cls} 变体 ${v} 的武器上限伤害不是随档递增`, vals);
  }
}
for (const cls in OFFHAND_BASES) {
  for (let v = 0; v < 3; v++) {
    const vals = OFFHAND_BASES[cls].map(t => t[v][1]);
    const nonzero = vals.filter(x => x > 0);
    if (nonzero.length < 2) continue;
    ok(vals.every((x, i) => i === 0 || x >= vals[i - 1]),
      `副手 ${cls} 变体 ${v} 的数值不是随档递增`, vals);
  }
}

/* ============================================================
 * 4. 传世
 * ============================================================ */
console.log('\n【4】传世（28 件 · ilvl 8~60）');
eq('传世总数 28', UNIQUE_ITEMS.length, 28);
const late = UNIQUE_ITEMS.filter(u => u.ilvl >= 41);
ok(late.length >= 6, '41~60 级段至少 6 件（终局有可追的红装）', late.length);
ok(UNIQUE_ITEMS.every(u => u.ilvl >= 1 && u.ilvl <= ILVL_MAX), '所有传世 ilvl 在上限内',
  UNIQUE_ITEMS.filter(u => u.ilvl > ILVL_MAX).map(u => u.id));
ok(UNIQUE_ITEMS.every(u => u.id && u.name && u.slot && u.lore), '每件都有 id / 名字 / 部位 / 风味文字');
ok(new Set(UNIQUE_ITEMS.map(u => u.id)).size === UNIQUE_ITEMS.length, '传世 id 不重复');
ok(UNIQUE_ITEMS.every(u => u.skill && (u.skill.id || u.skill.grant)), '每件都带技能效果');

/* 特性：id 存在 + 全表唯一归属 + 生效点真实 */
const traitOwner = {};
for (const u of UNIQUE_ITEMS) {
  ok(Array.isArray(u.traits) && u.traits.length > 0, `${u.id} 没有特性`);
  for (const t of (u.traits || [])) {
    if (!ok(!!UNIQUE_TRAITS[t], `${u.id} 引用了不存在的特性 ${t}`)) continue;
    if (traitOwner[t]) ok(false, `特性 ${t} 同时属于 ${traitOwner[t]} 与 ${u.id}`);
    traitOwner[t] = u.id;
  }
}
const orphan = Object.keys(UNIQUE_TRAITS).filter(t => !traitOwner[t]);
ok(orphan.length === 0, '没有孤儿特性（写了没人用）', orphan);

/* 特性必须有真实生效点：stats / flags / special 三选一 */
const deadTrait = Object.keys(UNIQUE_TRAITS).filter(t => {
  const d = UNIQUE_TRAITS[t];
  const hasStats = d.stats && Object.keys(d.stats).length;
  const hasFlags = d.flags && d.flags.length;
  const hasSpecial = !!d.special;
  return !hasStats && !hasFlags && !hasSpecial;
});
ok(deadTrait.length === 0, '每条特性都有生效点（stats / flags / special）', deadTrait);

/* stats key 必须是真的属性键 */
const badKey = [];
for (const u of UNIQUE_ITEMS) {
  for (const k in (u.stats || {})) if (!STATS[k]) badKey.push(u.id + ':' + k);
}
for (const t in UNIQUE_TRAITS) {
  for (const k in (UNIQUE_TRAITS[t].stats || {})) if (!STATS[k]) badKey.push('trait ' + t + ':' + k);
}
ok(badKey.length === 0, '传世属性键全部落在 STATS 里', badKey);

/* 掉落池按 ilvl 过滤：40 级摸不到终局件，60 级摸得到 */
eq('ilvl 40 的传世池不含终局件', uniquePool(40, 'warrior').filter(u => u.ilvl >= 41).length, 0);
ok(uniquePool(60, 'warrior').some(u => u.ilvl >= 41), 'ilvl 60 的传世池含终局件');
ok(uniquePool(60, 'warrior').every(u => !u.cls || u.cls === 'warrior'), '传世池按职业过滤');

/* ============================================================
 * 5. 地下城经验倍率
 * ============================================================ */
console.log('\n【5】地下城 1.8 倍经验（计划书 §10.2）');
ok(BALANCE.dungeon && BALANCE.dungeon.xpMul, 'BALANCE.dungeon.xpMul 存在',
  BALANCE.dungeon);
eq('倍率 = 1.8', BALANCE.dungeon && BALANCE.dungeon.xpMul, 1.8);
ok(BALANCE.dungeon.xpMul > 1 && BALANCE.dungeon.xpMul <= 2.2,
  '倍率在 1~2.2 之间（低于野外没人打，高于 2.2 会架空野外图）', BALANCE.dungeon.xpMul);

/* ============================================================
 * 6. 曲线与五卷占比
 * ============================================================ */
console.log('\n【6】60 级曲线与五卷占比');
let total = 0;
const seg = {};
for (let lv = 1; lv <= ILVL_MAX; lv++) {
  const n = xpToNext(lv);
  total += n;
  for (let p = 1; p <= 5; p++) {
    const P = PARTS[p];
    if (lv >= P.from && lv <= P.to) seg[p] = (seg[p] || 0) + n;
  }
}
/* 计划书 §10.1：60 级累计 799 万。允许 ±3% 的取整误差 */
ok(Math.abs(total - 7990000) / 7990000 < 0.03, '累计经验 ≈ 799 万（计划书 §10.1）', total);
eq('五卷等级段连续无空洞', [1, 2, 3, 4, 5].every(p => PARTS[p].to - PARTS[p].from + 1 > 0), true);
for (let p = 1; p < 5; p++) {
  eq(`卷${p} 与卷${p + 1} 等级相接`, PARTS[p].to + 1, PARTS[p + 1].from);
}
eq('卷五止于等级上限', PARTS[5].to, ILVL_MAX);

/* 方案占比 3 / 11 / 18 / 28 / 40 —— 偏差 ≤ 2 个百分点 */
const PLAN = { 1: 3, 2: 11, 3: 18, 4: 28, 5: 40 };
for (let p = 1; p <= 5; p++) {
  const share = (seg[p] || 0) / total * 100;
  ok(Math.abs(share - PLAN[p]) <= 2,
    `卷${p} 经验占比偏离方案 ${PLAN[p]}%（±2 内）`, share.toFixed(1) + '%');
  ok(share <= 45, `卷${p} 经验占比不超过 45%`, share.toFixed(1) + '%');
}
const segSum = Object.values(seg).reduce((a, b) => a + b, 0);
eq('五卷经验之和 = 总量（无溢出级）', segSum, total);

/* 升级曲线单调递增：高等级永远更贵 */
let monoXp = true;
for (let lv = 2; lv < ILVL_MAX; lv++) if (xpToNext(lv) <= xpToNext(lv - 1)) monoXp = false;
ok(monoXp, 'xpToNext 随等级严格递增');

/* 40→60 的装备成长要与怪物成长同量级（差 35% 以内） */
const MB = BALANCE.mob;
const mobGrow = (lv) => (MB.hpBase + lv * MB.hpLv + lv * lv * MB.hpLv2);
const mobRatio = mobGrow(60) / mobGrow(40);
ok(mobRatio > 1.6 && mobRatio < 2.6, '40→60 同级怪血量约 2 倍', mobRatio.toFixed(2));

/* ============================================================
 * 7. 地脉悬赏：接上 QuestSys.onDungeon（M5 起就没人调过的钩子）
 * ============================================================ */
console.log('\n【7】地脉悬赏 · dungeon 目标接线');
const QUESTS = pick('QUESTS');
const QALL = Object.values(QUESTS);
/* 每卷必须有且只有一条「地脉悬赏」，且 tier === part（钥匙本来就一阶对一卷） */
for (let p = 1; p <= 5; p++) {
  const boards = QALL.filter(q => q.part === p && q.kind === 'board');
  eq(`卷${p} 悬赏 4 条`, boards.length, 4);
  const dg = boards.filter(q => (q.objectives || []).some(o => o.type === 'dungeon'));
  eq(`卷${p} 恰好 1 条地脉悬赏`, dg.length, 1);
  const o = dg.length ? dg[0].objectives.find(x => x.type === 'dungeon') : null;
  eq(`卷${p} 地脉悬赏 tier = ${p}（钥匙一阶对一卷）`, o && o.tier, p);
  eq(`卷${p} 地脉悬赏 count = 1`, o && o.count, 1);
  /* 不给 dtype 是刻意的：钥匙不带类型、5 类在门口自选，写死会让某些玩家做不了 */
  ok(!(o && o.dtype), `卷${p} 地脉悬赏不锁类型（钥匙本就不带类型）`, o && o.dtype);
  ok(dg[0].rewards && dg[0].rewards.xp >= 3000,
    `卷${p} 地脉悬赏经验不低于本卷 killAny 悬赏的量级`, dg[0].rewards && dg[0].rewards.xp);
}
/* 「dungeon」必须是 6 种目标类型之一，且在 onDungeon 里真的被消费 */
const okTypes = new Set(['kill', 'killAny', 'boss', 'reach', 'collect', 'dungeon']);
const badType = QALL.flatMap(q => q.objectives || []).filter(o => !okTypes.has(o.type));
ok(badType.length === 0, '所有目标类型都是 6 种合法之一', badType.map(o => o.type));

/* 真跑一遍 QuestSys.onDungeon —— 这条钩子全项目只有 Dungeon.finish 在调，
 * 之前没调过，所以 5 条悬赏永远停在 0/1。这里直接给一个假 Game 跑通。 */
const questSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'quests.js'), 'utf8');
ctx.Game = {
  state: {
    part: 5, level: 55,
    quests: {
      active: [{ id: 'b5_4', progress: [0], at: Date.now() }],
      done: [], announced: {}, board: { cd: {}, count: {} }
    }
  }
};
vm.runInContext(questSrc, ctx, { filename: 'src/quests.js' });
const QuestSys = vm.runInContext('QuestSys', ctx);
const before = QuestSys.lines({ id: 'b5_4', progress: [0] })[0];
eq('地脉悬赏初始进度 0/1', before.cur, 0);
/* 阶不对不该推进 */
QuestSys.onDungeon('tomb', 3);
eq('三阶通关不推进五阶悬赏', QuestSys.activeOf('b5_4').progress[0], 0);
/* 阶对了才推进 */
QuestSys.onDungeon('tomb', 5);
eq('五阶通关推进悬赏', QuestSys.activeOf('b5_4').progress[0], 1);
ok(QuestSys.ready(QuestSys.activeOf('b5_4')), '一次五阶地脉就够交悬赏');
/* 任意类型都要能推进（作者可能在门口自选了「坠天」而不是「尸冢」） */
QuestSys.activeOf('b5_4').progress[0] = 0;
QuestSys.onDungeon('fall', 5);
eq('换一类地脉也能推进（不锁 dtype）', QuestSys.activeOf('b5_4').progress[0], 1);

/* Dungeon.finish 里必须有这一句 —— 静态 grep 源码比造假更直接 */
const dgSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'dungeon.js'), 'utf8');
ok(/QuestSys\.onDungeon\s*\(/.test(dgSrc), 'Dungeon.finish 里有调 QuestSys.onDungeon');
ok(/onDungeon[\s\S]{0,200}catch/.test(dgSrc) || /try\s*\{\s*QuestSys\.onDungeon/.test(dgSrc),
  '这一句包了 try/catch（任务系统出岔子不能把结算弹窗弄崩）');

/* 任务板：4 条候选要能轮换，不能永远只露前三条。
 * active 必须先清空 —— boardList 会把进行中的那条过滤掉测试前我刚 b5_4 推进过，不清就永远只有 3 条候选。 */
ctx.Game.state.quests.active = [];
const b5 = QALL.filter(q => q.part === 5 && q.kind === 'board').map(q => q.id);
const seen = new Set();
for (let i = 0; i < 200; i++) {
  for (const id of QuestSys.boardTake(5).map(q => q.id)) seen.add(id);
}
eq('200 次开板能见到全部 4 条（boardTake 洗牌了）', seen.size, 4);
ok([...seen].every(id => b5.indexOf(id) >= 0), '开板只出本卷的悬赏', [...seen]);
/* 每次只给 3 条（§4.1 的规格） */
const take1 = QuestSys.boardTake(5);
ok(take1.length === 3, '任务板一次列 3 条', take1.length);
ok(new Set(take1.map(q => q.id)).size === 3, '同一批不重复', take1.map(q => q.id));

console.log(`\n${fail === 0 ? '✓ 全部通过' : '✗ 有失败项'}  ${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
