/* ============================================================
 * S3 天赋树数据验证（node 直跑，不依赖浏览器）
 *
 *   node dev/test-s3-talents.js
 *
 * 覆盖：
 *   1. 120 节点结构：3 职业 × 3 系 × 10（7 小 + 2 中 + 1 大）+ 通用 30
 *   2. 节点字段合法性：id 唯一 / pos 0-100 / tier-max 匹配 / desc 非空
 *   3. 依赖图：req 指向存在的节点、无环、大节点 reqPts=5、前置同系
 *   4. 载体合法性：stats key ∈ STATS；skillMods 指向真实技能或 '*'；
 *      修正通道 ∈ {dmg,cd,cost,radius,count,dur}
 *   5. flag / special 全部有 game.js 钩子落地
 *   6. aggregate(equipped, talents) 集成：属性 / skillMods / flag / special 正确汇总
 *   7. computePlayerStats 透传：天赋加点后面板属性随之变化
 *   8. 旧档兼容：aggregate 忽略已退出目录的节点 id
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Set, Map, JSON, Object };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-items.js');
load('data/data-uniques.js');
load('data/data-relics.js');   // RELICS / relicPool：rollItem 的法器分支要用
load('items.js');
load('data/data-skills.js');
load('data/data-talents.js');

const pick = name => vm.runInContext(name, ctx);
const STATS = pick('STATS');
const SKILLS = pick('SKILLS');
const SKILL_ORDER = pick('SKILL_ORDER');
const TALENTS = pick('TALENTS');
const TALENT_NODES = pick('TALENT_NODES');
const talentTrees = pick('talentTrees');
const aggregate = pick('aggregate');
const computePlayerStats = pick('computePlayerStats');
const emptyStats = pick('emptyStats');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra ? '  →  ' + extra : '')); }
};

/* ---------------- 1. 结构 ---------------- */
console.log('\n一、节点结构');
{
  const all = Object.values(TALENT_NODES);
  ok(all.length === 120, '节点总数应为 120', 'got ' + all.length);
  ok(new Set(Object.keys(TALENT_NODES)).size === 120, '节点 id 有重复');

  for (const cls of ['warrior', 'mage', 'taoist']) {
    const trees = TALENTS[cls];
    ok(trees.length === 3, cls + ' 应有 3 系', 'got ' + trees.length);
    for (const t of trees) {
      ok(t.nodes.length === 10, t.name + ' 应有 10 节点', 'got ' + t.nodes.length);
      const tiers = t.nodes.map(n => n.tier);
      ok(tiers.filter(x => x === 1).length === 7, t.name + ' 应有 7 个小节点');
      ok(tiers.filter(x => x === 2).length === 2, t.name + ' 应有 2 个中节点');
      ok(tiers.filter(x => x === 3).length === 1, t.name + ' 应有 1 个大节点');
      ok(!!t.color && /^#[0-9a-f]{6}$/i.test(t.color), t.name + ' 颜色非法');
      ok(!!t.desc, t.name + ' 缺少系描述');
    }
  }
  ok(TALENTS.universal[0].nodes.length === 30, '通用系应有 30 节点',
    'got ' + TALENTS.universal[0].nodes.length);

  /* 每职业 4 页签（3 系 + 通用） */
  for (const cls of ['warrior', 'mage', 'taoist']) {
    ok(talentTrees(cls).length === 4, cls + ' 应有 4 个可查看的系');
    ok(talentTrees(cls).some(t => t.id === 'universal'), cls + ' 应含通用系');
  }

  /* 技能树与天赋树同名（技能面板按 tree 分组） */
  const treeNames = new Set([...TALENTS.warrior, ...TALENTS.mage, ...TALENTS.taoist].map(t => t.name));
  const badTree = Object.values(SKILLS).filter(s => !treeNames.has(s.tree));
  ok(badTree.length === 0, '有技能的 tree 对不上天赋系名',
    badTree.map(s => s.id + ':' + s.tree).join(','));
}

/* ---------------- 1b. 解锁等级 ---------------- */
console.log('\n一b、天赋随等级解锁');
{
  const bad = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id];
    if (!(e.unlock >= 1 && e.unlock <= 40)) bad.push(id + ':unlock ' + e.unlock);
  }
  ok(bad.length === 0, '每个节点都要有 1-40 的解锁等级', bad.slice(0, 6).join(','));

  /* 职业系：小节点 1/4/8/12，中节点 18，大节点 26 */
  const want = { tier: { 1: [1, 4, 8, 12], 2: [18], 3: [26] } };
  const wrong = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id];
    if (e.cls === null) continue;
    if (!want.tier[e.node.tier].includes(e.unlock)) wrong.push(id + ':tier' + e.node.tier + '@' + e.unlock);
  }
  ok(wrong.length === 0, '职业系解锁等级应与层级对应（1/4/8/12 · 18 · 26）', wrong.slice(0, 6).join(','));

  /* 通用系长链：解锁等级随链上序号严格递增，最后一个是 30 */
  const uni = TALENTS.universal[0].nodes;
  ok(uni[0].unlock === 1, '通用系首个节点 1 级解锁', uni[0].unlock);
  ok(uni[uni.length - 1].unlock === 30, '通用系末个节点 30 级解锁', uni[uni.length - 1].unlock);
  let inc = true;
  for (let i = 1; i < uni.length; i++) if (uni[i].unlock <= uni[i - 1].unlock) inc = false;
  ok(inc, '通用系解锁等级应严格递增');

  /* 大节点（26 级）不该比中节点（18 级）更早开 */
  const early = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id];
    if (e.cls === null) continue;
    if (e.node.tier === 3 && e.unlock < 18) early.push(id);
  }
  ok(early.length === 0, '大节点不应早于中节点解锁', early.join(','));
}

/* ---------------- 2. 字段合法性 ---------------- */
console.log('\n二、字段合法性');
{
  let bad = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id], n = e.node;
    if (n.id !== id) bad.push(id + ':id 错位');
    if (!n.name) bad.push(id + ':缺名字');
    if (!n.desc) bad.push(id + ':缺描述');
    if (![1, 2, 3].includes(n.tier)) bad.push(id + ':tier 非法');
    if (n.tier === 1 && n.max !== 5) bad.push(id + ':小节点应可点 5 级');
    if (n.tier > 1 && n.max !== 1) bad.push(id + ':中大节点应只可点 1 级');
    if (!n.pos || n.pos.x < 0 || n.pos.x > 100 || n.pos.y < 0 || n.pos.y > 100) bad.push(id + ':pos 越界');
    if (!e.tree || !e.treeName || !e.color) bad.push(id + ':缺树归属');
    /* 每个节点必须至少有一种载体 */
    if (!n.stats && !n.skillMods && !n.flag && !n.special) bad.push(id + ':没有任何效果载体');
  }
  ok(bad.length === 0, '节点字段存在非法项', bad.slice(0, 8).join(' | '));

  /* 同一系内 pos 不重叠（Canvas 渲染要能分开） */
  for (const cls of ['warrior', 'mage', 'taoist', 'universal']) {
    for (const t of TALENTS[cls]) {
      const seen = new Set(); let dup = 0;
      for (const n of t.nodes) {
        const k = n.pos.x + ',' + n.pos.y;
        if (seen.has(k)) dup++;
        seen.add(k);
      }
      ok(dup === 0, t.name + ' 有节点坐标重叠', 'dup=' + dup);
    }
  }
}

/* ---------------- 3. 依赖图 ---------------- */
console.log('\n三、依赖图');
{
  let bad = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id], n = e.node;
    for (const r of (n.req || [])) {
      const re = TALENT_NODES[r];
      if (!re) { bad.push(id + ' 的前置不存在: ' + r); continue; }
      if (re.tree !== e.tree) bad.push(id + ' 的前置跨系: ' + r);
      /* 通用系是蛇形链，阶序不保证单调；职业系内前置不能阶序更高 */
      if (e.tree !== 'universal' && re.node.tier > n.tier) bad.push(id + ' 的前置阶序不合理: ' + r);
    }
    if (n.tier === 3) {
      /* 大节点只由 reqPts（本系 5 点）把关，不强制显式前置；
       * Canvas 用虚线把中节点连到它表示这条点数门槛 */
      if (n.reqPts !== 5) bad.push(id + ' 大节点 reqPts 应为 5');
    } else if (n.reqPts && e.tree !== 'universal') {
      bad.push(id + ' 非大节点不应有 reqPts');   // 通用系中节点用 reqPts 累计门槛（8/16/24）
    }
  }
  ok(bad.length === 0, '依赖关系存在非法项', bad.slice(0, 8).join(' | '));

  /* 无环：从每个节点沿 req 上溯，步数上限 120 */
  let cyclic = [];
  for (const id in TALENT_NODES) {
    let cur = id, steps = 0;
    const seen = new Set();
    while (cur) {
      if (seen.has(cur)) { cyclic.push(id); break; }
      seen.add(cur);
      const n = TALENT_NODES[cur] && TALENT_NODES[cur].node;
      cur = n && (n.req || []).length ? n.req[0] : null;
      if (++steps > 120) { cyclic.push(id); break; }
    }
  }
  ok(cyclic.length === 0, '依赖图有环', cyclic.slice(0, 5).join(','));

  /* 每系根节点（无 req 的小/中节点）唯一；大节点由 reqPts 把关不算根 */
  for (const cls of ['warrior', 'mage', 'taoist']) {
    for (const t of TALENTS[cls]) {
      const roots = t.nodes.filter(n => n.tier < 3 && !(n.req || []).length);
      ok(roots.length === 1, t.name + ' 应恰有 1 个根节点', 'got ' + roots.length);
      const kids = {};
      for (const n of t.nodes) for (const r of (n.req || [])) (kids[r] = kids[r] || []).push(n.id);
      const seen = new Set([roots[0].id]); const q = [roots[0].id];
      while (q.length) {
        const c = q.pop();
        for (const k of (kids[c] || [])) if (!seen.has(k)) { seen.add(k); q.push(k); }
      }
      const need = t.nodes.filter(n => n.tier < 3).length;
      ok(seen.size === need, t.name + ' 从根节点无法到达全部小/中节点', 'reach=' + seen.size + '/' + need);
    }
  }
}

/* ---------------- 4. 载体合法性 ---------------- */
console.log('\n四、载体合法性');
{
  const CHANNELS = new Set(['dmg', 'cd', 'cost', 'radius', 'count', 'dur']);
  let badStats = [], badMods = [], badCh = [];
  for (const id in TALENT_NODES) {
    const n = TALENT_NODES[id].node;
    if (n.stats) for (const k in n.stats) {
      if (!STATS[k] || !isFinite(n.stats[k])) badStats.push(id + ':' + k);
    }
    if (n.skillMods) for (const skid in n.skillMods) {
      if (skid !== '*' && !SKILLS[skid]) { badMods.push(id + '→' + skid); continue; }
      for (const k in n.skillMods[skid]) if (!CHANNELS.has(k)) badCh.push(id + ':' + skid + ':' + k);
    }
  }
  ok(badStats.length === 0, '天赋引用了不存在的属性 key', badStats.slice(0, 6).join(','));
  ok(badMods.length === 0, '天赋引用了不存在的技能', badMods.slice(0, 6).join(','));
  ok(badCh.length === 0, '天赋用了非法修正通道', badCh.slice(0, 6).join(','));

  /* 技能所在系 = 天赋系名：天赋给某技能加伤，该技能须同职业
   * （刻意允许跨系搭配：如破军天赋强化狂战的烈焰突刺，召唤天赋强化丹道的回春咒） */
  let cross = [];
  const crossTree = [];
  for (const id in TALENT_NODES) {
    const e = TALENT_NODES[id], n = e.node;
    if (!n.skillMods) continue;
    for (const skid in n.skillMods) {
      if (skid === '*') continue;
      const sk = SKILLS[skid];
      if (e.cls && sk.cls !== e.cls) cross.push(id + '→' + skid + ' 职业不符');
      else if (sk.tree !== e.treeName) crossTree.push(e.treeName + '→' + sk.name);
    }
  }
  ok(cross.length === 0, '天赋修正跨了职业', cross.slice(0, 6).join(' | '));
  console.log('    （跨系搭配 ' + crossTree.length + ' 处：' + [...new Set(crossTree)].join('、') + '）');

  /* flag / special 白名单：与 game.js 实际钩子对齐 */
  const KNOWN_FLAGS = new Set(['novaFreeze', 'firetrail', 'echo', 'lowHpFury']);
  const KNOWN_SPECIALS = new Set(['phoenix', 'frenzyRefresh', 'avatarResetThrust',
    'talismanPierce', 'wolfStrong', 'wolfPack']);
  const flags = new Set(), specials = new Set();
  for (const id in TALENT_NODES) {
    const n = TALENT_NODES[id].node;
    if (n.flag) flags.add(n.flag);
    if (n.special) specials.add(n.special);
  }
  const badF = [...flags].filter(f => !KNOWN_FLAGS.has(f));
  const badS = [...specials].filter(s => !KNOWN_SPECIALS.has(s));
  ok(badF.length === 0, '出现了未接入战斗逻辑的天赋 flag', badF.join(','));
  ok(badS.length === 0, '出现了未接入战斗逻辑的天赋 special', badS.join(','));
  ok(flags.size >= 3 && specials.size >= 6, 'flag/special 覆盖面异常',
    'flags=' + flags.size + ' specials=' + specials.size);
}

/* ---------------- 5. 技能数据 ---------------- */
console.log('\n五、技能数据（S4 联动）');
{
  const all = Object.values(SKILLS);
  ok(all.length === 36, '技能总数应为 36', 'got ' + all.length);
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const list = SKILL_ORDER[cls];
    ok(list.length === 12, cls + ' 应有 12 个技能', 'got ' + list.length);
    ok(new Set(list).size === 12, cls + ' 技能顺序表有重复');
    ok(list.every(id => SKILLS[id] && SKILLS[id].cls === cls), cls + ' 顺序表里有非本职业技能');
    /* 顺序表按解锁等级排列 */
    const sorted = [...list].sort((a, b) => SKILLS[a].unlock - SKILLS[b].unlock);
    ok(list.join() === sorted.join(), cls + ' 技能顺序未按 unlock 排列');
  }
  let bad = [];
  for (const id in SKILLS) {
    const s = SKILLS[id];
    if (s.id !== id) bad.push(id + ':id 错位');
    if (!s.name || !s.glyph || !s.tree) bad.push(id + ':缺名称/字/系');
    if (!(s.unlock >= 1 && s.unlock <= 40)) bad.push(id + ':unlock 越界');
    if (!(s.cd > 0) || !(s.cost > 0)) bad.push(id + ':cd/cost 非法');
    /* 增益 / 护盾 / 召唤 / 治疗类没有伤害倍率、描述里也没有 {dmg} 占位 */
    const noMult = ['buff', 'shield', 'summon', 'heal'].includes(s.type);
    if (!noMult && !(s.mult > 0)) bad.push(id + ':mult 非法');
    if (!noMult && (!s.desc || !s.desc.includes('{dmg}'))) bad.push(id + ':desc 缺 {dmg} 占位');
    if (noMult && !s.desc) bad.push(id + ':缺描述');
    if (!['self', 'dir', 'enemy', 'ground'].includes(s.cast)) bad.push(id + ':cast 非法');
    if (!Array.isArray(s.variants) || s.variants.length !== 3) bad.push(id + ':应有 3 个变体');
    else for (const v of s.variants) {
      if (!v.name || !v.desc || !v.mods) bad.push(id + ':变体字段不全');
      for (const k in v.mods) if (!['dmg', 'cd', 'cost', 'radius', 'count', 'dur'].includes(k))
        bad.push(id + ':变体通道 ' + k);
    }
  }
  ok(bad.length === 0, '技能字段存在非法项', bad.slice(0, 8).join(' | '));

  /* 变体效果总和不为 0 太多：至少有一个非 dmg 通道在全部技能里出现过 */
  const usedCh = new Set();
  for (const s of all) for (const v of s.variants) for (const k in v.mods) usedCh.add(k);
  ok(usedCh.size >= 5, '变体通道过于单一', [...usedCh].join(','));
}

/* ---------------- 6. aggregate 集成 ---------------- */
console.log('\n六、aggregate 集成');
{
  const eq = {};
  /* 战士：膂力 3 级（力量 +9）+ 战斗本能（旋风斩 dmg+12/radius+15）+ 狂怒（血怒 dmg+50 + special） */
  const a1 = aggregate(eq, { spent: { rage_s1: 3, rage_m1: 1, rage_L: 1 } });
  ok(a1.stats.str === 9, '膂力 3 级应 +9 力量', 'got ' + a1.stats.str);
  ok(a1.skillMods.whirl && a1.skillMods.whirl.dmg === 12, '战斗本能应给旋风斩 +12% 伤害',
    JSON.stringify(a1.skillMods.whirl));
  ok(a1.skillMods.whirl.radius === 15, '战斗本能应给旋风斩 +15% 范围');
  ok(a1.skillMods.bloodrage && a1.skillMods.bloodrage.dmg === 50, '狂怒应给血怒 +50%');
  ok(a1.specials.frenzyRefresh === true, '狂怒的 special 应进入 specials');

  /* 通用系共鸣：全技能 +8% */
  const a2 = aggregate(eq, { spent: { uni_m3: 1 } });
  ok(a2.skillMods['*'] && a2.skillMods['*'].dmg === 8, '共鸣应给全技能 +8% 伤害');

  /* flag：绝对零度 / 焚天 / 浴血 */
  const a3 = aggregate(eq, { spent: { frost_L: 1, flame_L: 1, rage_m2: 1 } });
  ok(a3.flags.novaFreeze === true, '绝对零度 flag 应生效');
  ok(a3.flags.firetrail === true, '焚天 flag 应生效');
  ok(a3.flags.lowHpFury === true, '浴血 flag 应生效');

  /* 旧档：已退出目录的节点 id 应被忽略，不炸 */
  const a4 = aggregate(eq, { spent: { rage_dead_999: 5, uni_ghost: 2 } });
  ok(Object.keys(a4.skillMods).length === 0 && a4.stats.str === 0, '死节点 id 应被忽略');

  /* talents 为 null / 空：与旧行为一致 */
  const a5 = aggregate(eq, null);
  const a6 = aggregate(eq, { spent: {} });
  ok(a5.stats.str === 0 && a6.stats.str === 0, '空天赋不应改属性');

  /* 通用系节点任何职业都能加（cls 为 null 不影响汇总） */
  const a7 = aggregate(eq, { spent: { uni_s1: 5 } });
  ok(Object.keys(a7.skillMods).length === 0, '通用小节点只加属性');
}

/* ---------------- 7. computePlayerStats 透传 ---------------- */
console.log('\n七、computePlayerStats 透传');
{
  const mk = (talents, lv) => ({
    cls: 'warrior', level: lv, equipment: {}, talents,
    stats: emptyStats(), gold: 0, hp: 100, mp: 50
  });
  const base = computePlayerStats(mk({ spent: {} }, 30));
  const withT = computePlayerStats(mk({ spent: { rage_s1: 5, assault_s1: 5 } }, 30));
  ok(withT.str === base.str + 15, '5 级膂力应 +15 力量（透传到面板）',
    base.str + ' → ' + withT.str);
  ok(withT.atkPct === base.atkPct + 15, '5 级锋芒应 +15% 攻击力');
  /* skillMods 透传：战斗本能 */
  const withM = computePlayerStats(mk({ spent: { rage_m1: 1 } }, 30));
  ok(withM.skillMods.whirl && withM.skillMods.whirl.dmg === 12, '面板 skillMods 应含天赋修正');
}

console.log('\n====================================================');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('====================================================');
process.exit(fail ? 1 : 0);
