/* ============================================================
 * dev/check-worldboss.js —— M18「世界 Boss」专项体检（离线，node 直跑）
 *
 * 世界 Boss 的坑和八部天龙不一样：它不是「四份数据要对上」，
 * 而是「一份数据要同时满足六套互相拉扯的约束」：
 *
 *   1. **结构必须能被 spawnEnemy 直接吃**：worldBoss 是独立表，
 *      但 `cfg.hp / cfg.atk / cfg.scale / cfg.model / cfg.family /
 *      cfg.resist / cfg.range / cfg.atkCd` 少一个，M18.2 就得复制一份
 *      spawnEnemy，然后两份代码各自漂移。
 *   2. **抗性必须是一整条水平线，不许有缺口**（2026-10-28 第二版口径）：
 *      五项同值、没有负数。**这是与八部天龙强制去重的结果** ——
 *      八部 8 只魔将每人一个 −60 洞 + 四条 +80 墙（8 倍差），
 *      世界 Boss 若也这么写，就是同一个「猜元素」谜题做两遍。
 *      世界 Boss 的答案在 `domain` 里，`counter` 恒为 'domain'。
 *      第十节把这条和 BOSSES 里八部的字段钉成互斥。
 *   3. **三阶段的血量分界必须是 1.00 / 0.66 / 0.33**：按当前血量比例取，
 *      不按时间取。写错了表现是「打得快就跳过阶段」，很难在浏览器里发现。
 *   4. **阶段里引用的技能必须真的存在**：`phases[].skills` 是字符串数组，
 *      写错一个 id 不会报错，只会让那一段「少一个技能」，玩家完全无感。
 *   5. **homeMaps 必须是非安全图、非副本、非竞技场**：烛龙刷在营地里，
 *      或者刷进八部副本（要 8 印才开），等于这只 Boss 白做。
 *   6. **掉落材料键必须在 stash.mats 的真实命名空间里**：
 *      `xuanjing` / `craft_<id>` / `rune`。写个 `soul` 会静默变成
 *      `stash.mats.soul = 160`，玩家永远看不到（UI 只遍历 CRAFT_MAT_ORDER）。
 *
 * 用法：node dev/check-worldboss.js
 * ============================================================ */
const { loadData } = require('./_load.js');
const vm = require('vm');

const ctx = loadData({
  console, Math, Set, Map, JSON,
  localStorage: { getItem() { return null; }, setItem() {} }
});
const g = (e) => vm.runInContext(e, ctx);

const WB = g('WORLD_BOSSES'), ORDER = g('WORLD_BOSS_ORDER'), CFG = g('WORLD_BOSS_CFG');
const MATS = g('WORLD_BOSS_MATERIALS');
const MAPS = g('MAPS'), BOSSES = g('BOSSES');
const CRAFT_MATS = g('CRAFT_MATS');
const WB_ELEMS = g('WB_ELEMS'), WB_SHAPES = g('WB_SHAPES');
const phaseAt = g('worldBossPhaseAt'), skillsOf = g('worldBossSkillsOf');
const skillsAt = g('worldBossSkillsAt'), domainOf = g('worldBossDomain');
const uniqueCount = g('worldBossUniqueCount'), weakOf = g('worldBossWeakOf');
const byId = g('worldBossById');

/* damageEnemy 的抗性夹取（game.js：CLAMP(res, -60, 85)） */
const RES_LO = -60, RES_HI = 85;
const mulOf = (res) => 1 - Math.max(RES_LO, Math.min(RES_HI, res)) / 100;
/* spawnEnemy 里首领血量的统一放大（BALANCE.boss.hpMul） */
const BOSS_HP_MUL = g('BALANCE').boss.hpMul;

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
 * 一、表本身
 * ============================================================ */
head('一、表结构');
ok(!!WB && typeof WB === 'object', 'WORLD_BOSSES 存在');
const ids = Object.keys(WB || {});
eq('世界 Boss = 6 只（用户硬要求）', ids.length, 6);
eq('WORLD_BOSS_ORDER 覆盖全部', ORDER.length, ids.length);
eq('ORDER 无重复', new Set(ORDER).size, ORDER.length);
for (const id of ids) ok(ORDER.indexOf(id) >= 0, `${id} 出现在 WORLD_BOSS_ORDER`);
for (const id of ORDER) ok(!!WB[id], `ORDER 里的 ${id} 在 WORLD_BOSSES 中`);
for (const id of ids) eq(`${id} 的 id 字段与键一致`, WB[id].id, id);
for (const id of ids) ok(WB[id].wb === true, `${id} 标了 wb: true（区别于章节首领）`);

head('一·b、全局配置');
eq('cycle = 30 分钟（用户硬要求）', CFG.cycle, 30 * 60 * 1000);
eq('minLevel = 40（传世掉落线）', CFG.minLevel, 40);
eq('sameTime = 1（同一时刻只有一只）', CFG.sameTime, 1);
eq('respawnGap = 0（无空窗）', CFG.respawnGap, 0);
eq('固定等级 60 → 掉落 ilvl 62', CFG.level + 2, CFG.ilvl);
eq('必掉传世下限 ≥ 1', CFG.uniqueMin >= 1, true);
eq('必掉传世上限 = 3（用户硬要求 1~3）', CFG.uniqueMax, 3);

/* ============================================================
 * 二、spawnEnemy 兼容性 —— 少一个字段，M18.2 就要复制一份 spawnEnemy
 * ============================================================ */
head('二、spawnEnemy 兼容字段');
const NEED_NUM = ['level', 'scale', 'hp', 'atk', 'spd', 'atkCd', 'range'];
const NEED_STR = ['name', 'model', 'family'];
for (const id of ORDER) {
  const c = WB[id];
  for (const k of NEED_NUM) {
    ok(typeof c[k] === 'number' && c[k] > 0, `${id}.${k} 是正数`, c[k]);
  }
  for (const k of NEED_STR) {
    ok(typeof c[k] === 'string' && c[k].length > 0, `${id}.${k} 是非空字符串`, c[k]);
  }
  ok(!!c.melee || !!c.ranged, `${id} 有 melee / ranged 之一`);
  ok(!!BOSSES[c.model] === false, `${id} 的 model「${c.model}」没有复用任何现有首领模型`);
  ok(/^wb_/.test(c.model), `${id}.model 用 wb_ 前缀（M18.6 新骨架）`, c.model);
  ok(/^wb[A-Z]/.test(c.animKind), `${id}.animKind 用 wbXxx 驼峰（动画层分派键）`, c.animKind);
  ok(!!c.title && !!c.lore, `${id} 有 title / lore（图鉴与横幅要显示）`);
  ok((c.lines || []).length >= 2, `${id} 至少 2 句台词`, (c.lines || []).length);
}

head('二·b、防御口径（「没有多件传世很难打过」的量化来源）');
/* 护甲是双曲减伤，不是线性减伤 —— 这是本项目最容易算错的一处。
 * 所以这里不验「护甲是几倍」，直接验**最终有效血量是几倍**。 */
const armorMultOf = (lv, high, mul) =>
  100 / (100 + (lv * 3 + (high ? lv * 6 : 0)) * (mul || 1));
/* 抗性必须和 spawnEnemy 同口径：族群表打底，cfg.resist 覆盖。
 * 只读 cfg.resist 会漏掉「没写抗性的首领靠族群表」这一半 —— 混沌真身
 * 就是靠妖灵的物理 −15 吃 115% 伤害的，漏了它基准会虚高 15%。 */
const MON_FAMILIES_ = g('MON_FAMILIES');
const resistOf = (cfg, elem) => {
  const fam = MON_FAMILIES_[cfg.family] || MON_FAMILIES_.humanoid;
  const base = fam.resist[elem] || 0;
  const own = (cfg.resist || {})[elem];
  return own === undefined ? base : own;
};
const effHpOf = (cfg, elem) => {
  const armor = armorMultOf(cfg.level, !!cfg.armorHigh, cfg.armorMul);
  const res = mulOf(resistOf(cfg, elem));
  const all = cfg.all ? 0.85 : 1;
  return cfg.hp * BOSS_HP_MUL / (armor * res * all);
};
/* 基准：混沌·无相天魔（真身）—— 现有终局首领，物理是它最软的一项（妖灵 −15） */
const CHAOS = BOSSES.chaosavatar;
const CHAOS_EFF = effHpOf(CHAOS, 'phys');
const bestElemOf = (c) => WB_ELEMS.reduce((a, e) =>
  (resistOf(c, e) < resistOf(c, a) ? e : a), 'phys');

for (const id of ORDER) {
  const c = WB[id];
  eq(`${id}.armorMul 留在 1.0（乘上去会变成 16 分钟的血牛）`, c.armorMul, 1.0);
  eq(`${id}.armorHigh = true（世界 Boss 该是重甲）`, c.armorHigh, true);
  /* hp 从 280k~340k 降到 175k~235k 是**有意的**：抗性压平后
   * 「打对元素」的 1.6 倍加成没了，同样的血量会硬 2.3 倍。
   * 所以这里改看「实际血量」与「有效血量」两个真口径，不看 cfg.hp 的脸面。 */
  ok(c.hp >= 170000 && c.hp <= 240000, `${id}.hp 在第二版区间 170k~240k`, c.hp);
  const real = c.hp * BOSS_HP_MUL;
  ok(real >= 0.75e6, `${id} 实际血量 ≥ 0.75M（八部魔将最高 675k）`, Math.round(real));
}
head('二·c、有效血量 = 相对混沌真身的倍数');
console.log('  基准：混沌真身 有效血量 ' + (CHAOS_EFF / 1e6).toFixed(2) + 'M' +
  '（cfg ' + CHAOS.hp + ' × ' + BOSS_HP_MUL + '，护甲 ' + CHAOS.level * 3 + '）');
const effList = [];
for (const id of ORDER) {
  const c = WB[id];
  const e = bestElemOf(c);
  const eff = effHpOf(c, e);
  const ratio = eff / CHAOS_EFF;
  effList.push({ id, ratio, eff });
  console.log('  ' + id.padEnd(10) + '最优元素 ' + e.padEnd(10) +
    ' 有效血量 ' + (eff / 1e6).toFixed(2) + 'M   混沌 ×' + ratio.toFixed(2));
  /* 目标带：3.0~4.2 倍。抗性压平后「打对元素」不再是变量，
   * 六只的硬度只由 hp + armorHigh 决定，所以这条带子比第一版
   * （1.9~3.6）整体上移 —— TTK 约 4.5~6 分钟，是「世界 Boss」该有的长度。
   * 低于 3.0 就成了「一个更肉的小怪」；高于 4.2 就是「站着打八分钟」。 */
  ok(ratio >= 3.0 && ratio <= 4.2, `${id} 有效血量是混沌的 3.0~4.2 倍`, +ratio.toFixed(2));
}
/* 六只之间不能有 1.5 倍以上的硬度差：否则玩家只会去打最软的那只。
 * 第一版靠「谁的洞好打」自然拉不开，第二版抗性全平，这条更要盯紧。 */
const ratios = effList.map(x => x.ratio);
ok(Math.max(...ratios) / Math.min(...ratios) <= 1.35, '六只之间的硬度差 ≤ 1.35 倍', {
  max: +Math.max(...ratios).toFixed(2), min: +Math.min(...ratios).toFixed(2)
});

/* ============================================================
 * 三、体型与骨架 —— 六套不许复用（用户硬要求）
 * ============================================================ */
head('三、体型与骨架唯一性');
const models = ORDER.map(id => WB[id].model);
const anims = ORDER.map(id => WB[id].animKind);
eq('6 个 model 互不相同', new Set(models).size, 6);
eq('6 个 animKind 互不相同', new Set(anims).size, 6);
/* 计划书 §18.1 的体型表，改数就要同步改文档 */
const SCALE_WANT = { zhulong: 5.4, xiangliu: 4.8, kunpeng: 5.0, taotie: 5.2, xingtian: 5.6, jiuweihu: 4.6 };
for (const id of ORDER) {
  eq(`${id}.scale 与计划书一致`, WB[id].scale, SCALE_WANT[id]);
  ok(WB[id].scale >= 4.6, `${id}.scale ≥ 4.6（现有最大首领 3.0）`, WB[id].scale);
  ok(!!WB[id].body && !!WB[id].body.note, `${id} 有 body 描述（骨架规范要写清结构）`);
  /* 体型必须有量级差异：全在 4.6~5.6 之间，最大/最小 ≥ 1.15 倍 */
}
const scales = ORDER.map(id => WB[id].scale);
ok(Math.max(...scales) / Math.min(...scales) >= 1.15, '最大与最小体型差 ≥ 1.15 倍', {
  max: Math.max(...scales), min: Math.min(...scales)
});

/* ============================================================
 * 四、抗性 —— 一条水平线（与八部天龙的「一个洞 + 四面墙」正相反）
 * ============================================================ */
head('四、抗性（平坦，无元素谜题）');
for (const id of ORDER) {
  const c = WB[id], r = c.resist || {};
  /* 五项必须全部写死：漏一项就落到族群表（±15 量级），
   * 那个「软墙」会让玩家误以为找到了缺口。 */
  for (const e of WB_ELEMS) {
    ok(typeof r[e] === 'number', `${id}.resist.${e} 显式写了（不漏给族群表）`, r[e]);
  }
  const vals = WB_ELEMS.map(e => r[e] || 0);
  /* **核心断言**：五项完全同值。差 1 点都会让玩家去做「换武器」实验，
   * 而那个实验的答案在八部天龙那边。这里是 0 差，零歧义。 */
  eq(`${id} 五项抗性完全同值（世界 Boss 不看元素）`, new Set(vals).size, 1);
  ok(vals[0] >= 25 && vals[0] <= 45, `${id} 抗性落在 +25~+45（远高于普通首领 ±15）`, vals[0]);
  /* 没有缺口 —— 这是与八部最直接的差别，写成硬断言 */
  eq(`${id} 没有负数抗性（不设元素缺口）`, vals.filter(v => v < 0).length, 0);
  eq(`${id}.weak 恒为 null`, c.weak, null);
  eq(`${id}.counter = 'domain'（答案在领域里）`, c.counter, 'domain');
  /* 最优 / 最差元素的伤害差必须是 1.00 —— 一点余地都不留 */
  const hi = Math.max(...vals), lo = Math.min(...vals);
  eq(`${id} 最优/最差元素伤害差 = 1.00 倍`, +(mulOf(lo) / mulOf(hi)).toFixed(2), 1);
}
eq('六只全部无元素缺口（第一版是五只有一只无）', ORDER.filter(id => WB[id].weak).length, 0);
/* 六只的抗性不能全表一个数：那会让「六只」变成同一只的六个皮。
 * 烛九阴是唯一 +30 的，因为它没有任何元素偏好可言 —— 它的答案是昼夜。 */
const resVals = ORDER.map(id => WB[id].resist.phys);
ok(new Set(resVals).size >= 2, '六只的抗性档位不是单一值（否则六只没有区别）', resVals);
eq('最低抗性档是烛九阴（+30）', WB.zhulong.resist.phys, 30);

/* ============================================================
 * 五、领域 —— 为多人玩法铺垫的「范围」
 * ============================================================ */
head('五、领域');
const kinds = [];
for (const id of ORDER) {
  const d = domainOf(WB[id]);
  ok(!!d, `${id} 有领域`);
  if (!d) continue;
  kinds.push(d.kind);
  ok(d.radius >= 24 && d.radius <= 34, `${id} 领域半径 24~34（盖住一次走位）`, d.radius);
  ok(/^#[0-9a-f]{6}$/i.test(d.color || ''), `${id} 领域有十六进制色`, d.color);
  ok(!!d.name && !!d.desc, `${id} 领域有 name / desc`);
  ok(!!d.player && typeof d.player === 'object', `${id} 领域有玩家侧效果表（M18.5 读）`);
  /* 领域半径要大于最大技能范围的一半：否则「领域」只是个装饰圈，
   * 玩家站在领域里但所有技能都够不到他。 */
  const maxRange = Math.max(...skillsOf(WB[id]).map(s => s.range || 0));
  ok(d.radius >= maxRange * 0.5, `${id} 领域半径 ≥ 最大技能范围的一半`, { r: d.radius, maxRange });
}
eq('6 种领域互不相同', new Set(kinds).size, 6);
const KIND_WANT = ['daynight', 'poison', 'tide', 'devour', 'warcry', 'illusion'];
for (const k of KIND_WANT) ok(kinds.indexOf(k) >= 0, `领域 ${k} 已实现（计划书 §18.3）`);

/* ============================================================
 * 六、三阶段
 * ============================================================ */
head('六、三阶段');
const AT_WANT = [1.00, 0.66, 0.33];
for (const id of ORDER) {
  const c = WB[id], ph = c.phases || [];
  eq(`${id} 有 3 个阶段`, ph.length, 3);
  ph.forEach((p, i) => {
    eq(`${id}.phases[${i}].at 与计划书一致`, p.at, AT_WANT[i]);
    ok(!!p.name && !!p.desc, `${id}.phases[${i}] 有 name / desc`);
    ok((p.skills || []).length >= 1, `${id}.phases[${i}] 至少一个技能`);
    /* `enter` 是「进入这一段时一次性生效」的效果（变身 / 招分身 / 攻速）。
     * 必须每段都有：三阶段如果只有技能变化，就只是「血少一点换招」。 */
    ok(!!p.enter && typeof p.enter === 'object' && Object.keys(p.enter).length > 0,
      `${id}.phases[${i}] 有 enter 效果`, p.enter);
    for (const sk of (p.skills || [])) {
      ok(!!c.skills[sk], `${id}.phases[${i}] 引用的技能 ${sk} 存在于 skills`, sk);
    }
  });
  /* 阶段必须真的在加东西：P3 的技能集 ⊇ P1，否则「三阶段」是假的 */
  const s1 = new Set(ph[0].skills), s3 = new Set(ph[2].skills);
  for (const s of s1) ok(s3.has(s), `${id}: P1 的技能 ${s} 在 P3 仍可用（阶段是加不是换）`);
  ok(s3.size > s1.size, `${id}: P3 技能数 > P1（真的变强了）`, { p1: s1.size, p3: s3.size });
  /* 三段的技能并集 = 全部技能（没有写了却永远用不到的技能） */
  const all = new Set();
  ph.forEach(p => (p.skills || []).forEach(s => all.add(s)));
  eq(`${id}: 技能表里没有「写了但永远不会用」的技能`, all.size, Object.keys(c.skills).length);
}
/* phaseAt 的边界：0.66 落在 P2 而不是 P1 */
head('六·b、enter 词表（M18.7 按这个分派，不许临时加键）');
const ENTER_KEYS = {
  sight: '视野半径（米）',
  dayNightCycle: '昼夜切换周期（毫秒）',
  heads: '活动头数（相柳）',
  mire: '场地毒沼（相柳 P3）',
  morph: '形态切换 kun / peng / both（鲲鹏）',
  pullMul: '吸力倍率（饕餮）',
  regurgitate: '启用反刍（饕餮 P2）',
  aspdMul: '攻速倍率（饕餮 P3 / 刑天 P3）',
  dmgMul: '伤害倍率（刑天 P3 弃守全攻）',
  stance: '持械姿态 axe / shield / both（刑天）',
  blockFront: '正面格挡（刑天 P2）',
  clones: '分身数量（九尾狐 P1）',
  tails: '展开的尾数（九尾狐）',
  rootOnHit: '命中定身秒数（九尾狐 P2）',
  foxfireField: '全场狐火（九尾狐 P3）',
  revealVuln: '真身现身时受伤倍率（九尾狐 P3）'
};
const usedKeys = new Set();
for (const id of ORDER) {
  for (const p of WB[id].phases) for (const k in p.enter) usedKeys.add(k);
}
for (const k of usedKeys) ok(!!ENTER_KEYS[k], `enter 键「${k}」在词表里`, k);
/* enter 键里**不许出现 stagger 字样**。
 * 八部天龙的「破绽窗口」是 `stagger` + `staggerDur`，世界 Boss 一旦也开
 * 硬直窗口，两套 Boss 的战斗节奏就变成同一件事（等窗口 → 站桩）。
 * 这条曾经真的红过：刑天 P3 原来写的是 `staggerEvery: 8000`。 */
for (const k of usedKeys) {
  ok(k.toLowerCase().indexOf('stagger') < 0,
    `enter 键「${k}」不是硬直窗口（那是八部的语言）`, k);
}
/* 每只至少有一个「改变战斗规则」的 enter，而不是只有数值加成 */
const RULE_KEYS = ['sight', 'dayNightCycle', 'heads', 'mire', 'morph', 'regurgitate',
  'stance', 'blockFront', 'clones', 'tails', 'foxfireField', 'revealVuln'];
for (const id of ORDER) {
  const has = WB[id].phases.some(p => Object.keys(p.enter).some(k => RULE_KEYS.indexOf(k) >= 0));
  ok(has, `${id} 至少有一个「改规则」的阶段效果（不只是加攻速）`);
}
console.log('  词表 ' + Object.keys(ENTER_KEYS).length + ' 个键，实际用到 ' + usedKeys.size + ' 个');

head('六·c、worldBossPhaseAt 边界');
const sample = WB.zhulong;
eq('pct 1.00 → P1', phaseAt(sample, 1.00), 0);
eq('pct 0.67 → P1', phaseAt(sample, 0.67), 0);
eq('pct 0.66 → P2', phaseAt(sample, 0.66), 1);
eq('pct 0.50 → P2', phaseAt(sample, 0.50), 1);
eq('pct 0.33 → P3', phaseAt(sample, 0.33), 2);
eq('pct 0.00 → P3', phaseAt(sample, 0.00), 2);
eq('pct 越界（1.5）夹回 P1', phaseAt(sample, 1.5), 0);
eq('pct 越界（−1）夹回 P3', phaseAt(sample, -1), 2);
for (const id of ORDER) {
  const ph = WB[id].phases;
  eq(`${id}: P1 阶段技能 = worldBossSkillsAt(…,0)`, skillsAt(WB[id], 0).length, ph[0].skills.length);
  eq(`${id}: 全部技能 = worldBossSkillsOf`, skillsOf(WB[id]).length, Object.keys(WB[id].skills).length);
}

/* ============================================================
 * 七、技能数值
 * ============================================================ */
head('七、技能');
/* 计划书 §18.1「技能伤害与范围」表：招牌技能倍率 */
const MUL_WANT = {
  wb_breath: 2.2, wb_darktide: 2.8, wb_tailsweep: 1.6,
  wb_poisonspit: 1.8, wb_ninehowl: 3.2, wb_tailwhip: 1.4,
  wb_watercannon: 2.0, wb_windblade: 2.4, wb_dive: 1.8,
  wb_swallow: 3.0, wb_regurgitate: 2.6, wb_stomp: 1.8,
  wb_axecleave: 2.8, wb_shieldbash: 2.2, wb_warcry: 0,
  wb_foxfire: 2.4, wb_tailbind: 1.6, wb_phantomdash: 2.0
};
const RANGE_WANT = {
  wb_breath: 30, wb_darktide: 22, wb_poisonspit: 12, wb_ninehowl: 28,
  wb_watercannon: 26, wb_windblade: 18, wb_swallow: 20,
  wb_axecleave: 10, wb_shieldbash: 14, wb_foxfire: 16, wb_tailbind: 20
};
let skillCount = 0;
const allSkillIds = [];
for (const id of ORDER) {
  const c = WB[id];
  for (const sid in c.skills) {
    skillCount++;
    allSkillIds.push(sid);
    const s = c.skills[sid];
    eq(`${sid}.id 与键一致`, s.id, sid);
    ok(!!s.name && !!s.desc, `${sid} 有 name / desc`);
    ok(typeof s.mul === 'number' && s.mul >= 0, `${sid}.mul 是非负数`, s.mul);
    ok(!!WB_SHAPES[s.shape], `${sid}.shape「${s.shape}」是已定义形状`, s.shape);
    ok(typeof s.range === 'number' && s.range > 0, `${sid}.range 是正数`, s.range);
    ok(WB_ELEMS.indexOf(s.elem) >= 0, `${sid}.elem「${s.elem}」合法`, s.elem);
    ok(typeof s.cd === 'number' && s.cd >= 3, `${sid}.cd ≥ 3 秒（不许连发）`, s.cd);
    /* 伤害技能的预警不能为 0：世界 Boss 的技能是「看见才躲得开」的，
     * 没有预警就变成纯数值对撞。0.5 秒是人的反应下限。 */
    if (s.mul > 0) ok(s.warn >= 0.5, `${sid}.warn ≥ 0.5 秒（给反应时间）`, s.warn);
    if (MUL_WANT[sid] !== undefined) eq(`${sid}.mul 与计划书一致`, s.mul, MUL_WANT[sid]);
    if (RANGE_WANT[sid] !== undefined) eq(`${sid}.range 与计划书一致`, s.range, RANGE_WANT[sid]);
    /* 扇形 / 锥形必须有 arc，直线必须有 width，散射必须有 count */
    if (s.shape === 'fan' || s.shape === 'cone') ok(typeof s.arc === 'number' && s.arc > 0, `${sid} 是 ${s.shape}，必须写 arc`, s.arc);
    if (s.shape === 'line') ok(typeof s.width === 'number' && s.width > 0, `${sid} 是 line，必须写 width`, s.width);
    if (s.shape === 'scatter') ok(typeof s.count === 'number' && s.count > 1, `${sid} 是 scatter，必须写 count`, s.count);
  }
}
eq('招牌技能共 18 个（计划书 §18.1）', skillCount, 18);
eq('技能 id 全局不重复', new Set(allSkillIds).size, allSkillIds.length);
eq('18 个技能都写进了 MUL_WANT（没有漏登记的）', Object.keys(MUL_WANT).length, 18);
/* 夜间限定只有烛九阴的暗潮 */
const nightOnly = allSkillIds.filter(s => {
  for (const id of ORDER) if (WB[id].skills[s] && WB[id].skills[s].nightOnly) return true;
  return false;
});
eq('夜间限定技能只有 1 个（暗潮）', nightOnly.length, 1);
eq('夜间限定的是暗潮', nightOnly[0], 'wb_darktide');

/* ============================================================
 * 八、homeMaps —— 刷在哪决定这只 Boss 有没有人打
 * ============================================================ */
head('八、刷新点（homeMaps）');
for (const id of ORDER) {
  const c = WB[id], hm = c.homeMaps || [];
  ok(hm.length >= 2 && hm.length <= 3, `${id} 有 2~3 张主题候选图`, hm.length);
  eq(`${id}.map = homeMaps[0]（图鉴显示口径）`, c.map, hm[0]);
  eq(`${id} 的候选图不重复`, new Set(hm).size, hm.length);
  for (const m of hm) {
    const mp = MAPS[m];
    ok(!!mp, `${id} 的候选图 ${m} 存在于 MAPS`);
    if (!mp) continue;
    ok(!mp.safe, `${id} 不会刷在安全区 ${m}（营地/据点）`);
    ok(!mp.raid, `${id} 不会刷进副本 ${m}（要印才能进）`);
    ok(!mp.arena, `${id} 不会刷进竞技场 ${m}`);
    ok(typeof mp.level === 'number', `${m} 有 level 字段（spawnEnemy 读它）`, mp.level);
    ok(typeof mp.size === 'number' && mp.size >= 240, `${m} 是大地图（size ≥ 240），装得下领域`, mp.size);
    /* 图必须已经开放（unlock ≤ 60）：刷在还没解锁的图上，横幅点了是灰的 */
    ok((mp.unlock || 0) <= CFG.level, `${m} 在 60 级前已开放`, mp.unlock);
  }
}
/* 六只的候选图加起来要覆盖卷四~卷五，不能全挤在最后三张图 */
const allHome = new Set();
ORDER.forEach(id => (WB[id].homeMaps || []).forEach(m => allHome.add(m)));
ok(allHome.size >= 9, '候选图总数 ≥ 9（不至于每次都刷同一张）', allHome.size);

/* ============================================================
 * 九、掉落 —— 必掉传世是这套系统唯一的存在理由
 * ============================================================ */
head('九、掉落');
/* stash.mats 的真实命名空间：xuanjing / crystal1~4 / rune_<id> / craft_<id> */
const matOk = (k) => k === 'xuanjing' || /^crystal[1-4]$/.test(k) ||
  (k.indexOf('craft_') === 0 && !!CRAFT_MATS[k.slice(6)]);
for (const id of ORDER) {
  const c = WB[id], l = c.loot || {};
  eq(`${id}.loot.uniqueMin = 1`, l.uniqueMin, 1);
  eq(`${id}.loot.uniqueMax = 3`, l.uniqueMax, 3);
  ok((l.mats || []).length >= 2, `${id} 至少两种稀有材料`, (l.mats || []).length);
  for (const m of (l.mats || [])) {
    ok(matOk(m.key), `${id} 的材料键「${m.key}」在 stash.mats 命名空间里`);
    ok(m.min > 0 && m.max >= m.min, `${id}.${m.key} 数量区间合法`, m);
  }
  ok(l.rune && l.rune.min >= 2 && l.rune.max >= l.rune.min, `${id} 符文 2~4`, l.rune);
  /* 玄晶必须是主要产出：它是炼器 / 洗练 / 扩容的通货，缺了就打不动装 */
  ok((l.mats || []).some(m => m.key === 'xuanjing'), `${id} 掉玄晶`);
}
head('九·b、必掉件数（worldBossUniqueCount）');
for (const id of ORDER) {
  const c = WB[id];
  const n = uniqueCount(c, 'normal');
  eq(`${id} 普通难度必掉 1~3 件`, n.min + '-' + n.max, '1-3');
  ok(uniqueCount(c, 'hard').min >= 2, `${id} 困难难度下限抬到 2`, uniqueCount(c, 'hard'));
  ok(uniqueCount(c, 'nightmare').min >= 2, `${id} 噩梦难度下限抬到 2`, uniqueCount(c, 'nightmare'));
  ok(uniqueCount(c, 'hell').min >= 3, `${id} 极难难度下限抬到 3`, uniqueCount(c, 'hell'));
  /* 任何难度、任何 boss 都不许返回 0 —— 「刷一次空手」是最不能有的结果 */
  for (const d of ['normal', 'hard', 'nightmare', 'hell', 'unknown']) {
    ok(uniqueCount(c, d).min >= 1, `${id}/${d} 至少 1 件传世`, uniqueCount(c, d));
  }
}
head('九·c、世界魂（worldsoul）');
ok(!!MATS.worldsoul, 'WORLD_BOSS_MATERIALS.worldsoul 已定义');
eq('世界魂键名带 craft_ 前缀', MATS.worldsoul.key, 'craft_worldsoul');
ok(!CRAFT_MATS.worldsoul, '世界魂**没有**混进 CRAFT_MATS（强化系统还没做，先进去会让背包多一格永远为 0）');
eq('世界魂标了 pending 阶段', MATS.worldsoul.pending, 'M18.8');
for (const id of ORDER) {
  ok(!(WB[id].loot.mats || []).some(m => m.key === MATS.worldsoul.key),
    `${id} 没有提前掉世界魂（M18.8 才接）`);
}

/* ============================================================
 * 十、派生函数
 * ============================================================ */
head('十、派生函数');
eq('worldBossById 取得到', byId('zhulong').id, 'zhulong');
eq('worldBossById 取不到返回 null', byId('nope'), null);
for (const id of ORDER) {
  const c = WB[id];
  eq(`${id}: worldBossWeakOf 与 weak 字段一致`, weakOf(c), c.weak);
  ok(!!domainOf(c), `${id}: worldBossDomain 返回对象`);
}
eq('worldBossDomain(null) 返回 null', domainOf(null), null);
eq('worldBossPhaseAt(空表) 返回 0', phaseAt({ phases: [] }, 0.5), 0);

/* ============================================================
 * 十一、与「八部天龙」强制去重（用户 2026-10-28 要求）
 *
 * 这一节不是「顺手多写点断言」，它是这套数据存在的边界：
 * 八部天龙（M7）和世界 Boss（M18）在同一个分支、同一个版本里并存，
 * 玩家会在 8 张副本里学一遍「找元素洞」，回头又遇到 6 只世界 Boss。
 * 如果后者还是同一道题，两套系统会互相稀释成「又是换武器」。
 *
 * 所以这里把两边钉成**互斥的两套语言**：
 *
 *   八部天龙：一个 −60 洞 + 四条 +80 墙 → 答案 = 换武器（8 倍差）
 *             配套 `stagger` 破绽窗口、`patterns` 共用招式池、单段
 *   世界 Boss：五项抗性同值、零缺口     → 答案 = 读领域（1.00 倍差）
 *             配套 `domain` 领域、`skills` 专属招式、三阶段 + enter
 *
 * 谁想把八部那套搬过来（加缺口 / 加 stagger / 加 patterns），
 * 会先在这里红，而不是等玩家发现「这两套 Boss 打起来一样」。
 * ============================================================ */
head('十一、与八部天龙去重');
const BAFO = Object.keys(BOSSES).filter(k => k.indexOf('bafo_') === 0);
eq('八部魔将共 8 只（M7.2）', BAFO.length, 8);

/* 1) 身份不能撞：id 与名字 */
for (const id of ORDER) {
  ok(BAFO.indexOf(id) < 0, `世界 Boss id「${id}」不与八部重名`, id);
  ok(!BAFO.some(b => BOSSES[b].name === WB[id].name),
    `世界 Boss 名字「${WB[id].name}」不与八部重名`);
}

/* 2) 抗性结构互斥 —— 这是「谜题不重复」的量化证据 */
const bafoNeg = BAFO.map(b => WB_ELEMS.filter(e => ((BOSSES[b].resist || {})[e] || 0) < 0).length);
eq('八部每只恰好一个元素缺口（8 倍差谜题）', bafoNeg.join(','), '1,1,1,1,1,1,1,1');
const wbNeg = ORDER.map(id => WB_ELEMS.filter(e => (WB[id].resist[e] || 0) < 0).length);
eq('世界 Boss 全部零缺口（与八部正相反）', wbNeg.join(','), '0,0,0,0,0,0');

/* 3) 八部的两个招牌字段，世界 Boss 一个都不许有 */
for (const id of ORDER) {
  eq(`${id} 没有 stagger（破绽窗口是八部的语言）`, WB[id].stagger, undefined);
  eq(`${id} 没有 patterns（共用招式池是八部的语言）`, WB[id].patterns, undefined);
}
for (const b of BAFO) {
  ok(!!BOSSES[b].stagger, `八部 ${b} 仍保留 stagger（没被反向污染）`);
  ok(Array.isArray(BOSSES[b].patterns), `八部 ${b} 仍保留 patterns`);
}

/* 4) 世界 Boss 的两个招牌字段，八部一个都不许有 */
for (const id of ORDER) {
  ok(!!WB[id].domain, `${id} 有 domain（这是世界 Boss 的识别符号）`);
  eq(`${id} 有 3 个阶段`, (WB[id].phases || []).length, 3);
}
for (const b of BAFO) {
  eq(`八部 ${b} 没有 domain（领域不许被搬过去）`, BOSSES[b].domain, undefined);
  eq(`八部 ${b} 没有 phases（多段是世界 Boss 的语言）`, BOSSES[b].phases, undefined);
}

/* 5) 骨架键不能撞 —— 两边各 6/8 套全新骨架，撞了就是「复用」 */
const bafoAnims = BAFO.map(b => BOSSES[b].animKind).filter(Boolean);
eq('八部 8 只都写了 animKind', bafoAnims.length, 8);
for (const id of ORDER) {
  ok(bafoAnims.indexOf(WB[id].animKind) < 0,
    `${id}.animKind「${WB[id].animKind}」不与八部撞`, bafoAnims);
  ok(bafoAnims.indexOf(WB[id].model) < 0, `${id}.model「${WB[id].model}」不与八部撞`);
}

/* 6) 招式文本不能借用八部的招牌动作。
 * 迦楼罗的招牌是**俯冲**（`charge` + 飞行期只有雷/投掷能命中），
 * 鲲鹏原本写了个「潜渊 / 俯冲」，那是同一记动作做两遍 —— 已改成纯潜渊。 */
const BAFO_SIGNS = ['俯冲', '破绽', '后摇'];
for (const id of ORDER) {
  for (const sid in WB[id].skills) {
    const s = WB[id].skills[sid];
    for (const w of BAFO_SIGNS) {
      ok((s.name + s.desc).indexOf(w) < 0,
        `${sid}「${s.name}」不借用八部招牌动作「${w}」`, s.desc);
    }
  }
  for (const p of WB[id].phases) {
    for (const w of BAFO_SIGNS) {
      ok((p.name + p.desc).indexOf(w) < 0,
        `${id}.${p.id} 阶段文案不借用「${w}」`, p.desc);
    }
  }
}
console.log('  八部 8 只（一洞 + 四面墙 + stagger + patterns）↔ 世界 Boss 6 只（平抗 + 领域 + 三阶段）');

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(56));
console.log('世界 Boss：' + ORDER.length + ' 只 · ' + skillCount + ' 个招牌技能 · ' +
  new Set(kinds).size + ' 种领域 · ' + allHome.size + ' 张候选图');
console.log('通过 ' + pass + ' 项' + (fail ? '，失败 ' + fail + ' 项' : '，失败 0 项'));
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
