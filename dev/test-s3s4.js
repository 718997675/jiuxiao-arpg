/* ============================================================
 * S3 天赋 + S4 技能 浏览器端验证（驱动真实 Game 对象）
 *
 *   node dev/test-s3s4.js [warrior|mage|taoist]
 *
 * 覆盖：
 *   A. 天赋：点数账、前置/上限/系点门槛、加点洗点、依赖保护、
 *      属性透传、预设存取、预算截断、洗点费用递增、旧档迁移
 *   A2. 天赋按级解锁：1/4/8/26 级边界、通用系递增、预设不还原未解锁节点
 *   B. 技能：12 技能全解锁、升级/满级/技能点、变体边界
 *   C. 施法：12 技能逐个 cast 不报错，冷却与消耗符合变体修正
 *   D. 伤害曲线：等级 1→10 恰好 1.72 倍；变体 +30%；天赋 +12%
 *   E. UI：天赋面板画布点击加点、技能面板升级/切变体、
 *      技能条 5 格手动配置（放置/换位/腾空/存档）、键 1-5、Z/X 药水键
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLS = process.argv[2] || 'warrior';
if (!['warrior', 'mage', 'taoist'].includes(CLS)) {
  console.log('用法：node dev/test-s3s4.js [warrior|mage|taoist]');
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, a + ' ≈ ' + b);

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + CLS, { waitUntil: 'load' });
  await wait(2200);

  /* 注意：Game / UI 是脚本级 const（全局词法绑定），只能用裸名访问，不能走 window.Game */
  const boot = await p.evaluate(() => ({
    game: typeof Game,
    state: !!(typeof Game !== 'undefined' && Game.state),
    running: !!(typeof Game !== 'undefined' && Game.running),
    url: location.href
  }));
  if (!(boot.game === 'object' && boot.state && boot.running)) {
    console.log('游戏未能启动：', JSON.stringify(boot));
    if (errs.length) console.log(errs.join('\n'));
    await b.close();
    process.exit(1);
  }

  /* ================= A. 天赋逻辑 ================= */
  console.log('\nA. 天赋逻辑（' + CLS + '）');
  const A = await p.evaluate(() => {
    const G = Game, R = {};
    const FIRST = { warrior: 'rage', mage: 'frost', taoist: 'talisman' }[G.state.cls];
    const ROOT = FIRST + '_s1', S2 = FIRST + '_s2', S4 = FIRST + '_s4', S6 = FIRST + '_s6';
    const M1 = FIRST + '_m1', L = FIRST + '_L';
    const OTHER = { warrior: 'guard', mage: 'flame', taoist: 'summon' }[G.state.cls];
    /* 根节点属性各职业不同：战士力量 / 法师、道士智力——期望值从数据里取，不写死 */
    const rootNode = TALENTS[G.state.cls].find(t => t.id === FIRST).nodes.find(n => n.id === ROOT);
    const STAT_KEY = Object.keys(rootNode.stats)[0];
    const STAT_PER = rootNode.stats[STAT_KEY];
    /* 大节点终极效果也因职业而异：战士 special / 法师 flag / 道士 special */
    const L_SP = { warrior: 'frenzyRefresh', mage: null, taoist: 'talismanPierce' }[G.state.cls];
    const L_FLAG = { warrior: null, mage: 'novaFreeze', taoist: null }[G.state.cls];

    G.state.level = 30; G.state.gold = 300000; G.recalc();
    R.points0 = G.talentPoints();
    R.statBase = G.state.stats[STAT_KEY];
    R.rootCan = G.canAllocTalent(ROOT);
    R.childLocked = !G.canAllocTalent(S2);
    G.allocTalent(ROOT);
    R.pointsAfter1 = G.talentPoints();
    R.childCan = G.canAllocTalent(S2);
    for (let i = 0; i < 6; i++) G.allocTalent(ROOT);
    R.rank = G.talentState().spent[ROOT];
    R.maxLocked = !G.canAllocTalent(ROOT);
    R.treePts = G.talentTreePoints(FIRST);
    R.largeCan = G.canAllocTalent(L);
    R.otherTreeLocked = !G.canAllocTalent(OTHER + '_L');
    G.allocTalent(L);
    R.largeSpecial = L_SP ? !!G.state.stats.specials[L_SP] : !!G.state.stats.flags[L_FLAG];
    R.m1Locked = !G.canAllocTalent(M1);
    G.allocTalent(S2); G.allocTalent(S4); G.allocTalent(S6);
    R.m1Can = G.canAllocTalent(M1);
    G.allocTalent(M1);
    R.refundBlocked = !G.refundTalent(S6);
    G.refundTalent(M1);
    R.refundOk = G.refundTalent(S6);
    R.spentTotal = G._spentTotal();
    R.pointsNow = G.talentPoints();
    R.statAfter = G.state.stats[STAT_KEY];
    R.statKey = STAT_KEY; R.statPer = STAT_PER;
    /* 加点后面板即时刷新（onTalentChanged 钩子） */
    R.talentPanelAlive = typeof UI.onTalentChanged === 'function';
    return R;
  });
  ok(A.points0 === 30, '30 级应有 30 天赋点', A.points0);
  ok(A.rootCan === true, '根节点应可点');
  ok(A.childLocked === true, '前置未满足时子节点应锁');
  ok(A.pointsAfter1 === 29, '点 1 级后剩 29 点', A.pointsAfter1);
  ok(A.childCan === true, '前置满足后子节点可点');
  ok(A.rank === 5, '小节点上限 5 级', A.rank);
  ok(A.maxLocked === true, '满级后不可再点');
  ok(A.treePts === 5, '本系已投入 5 点', A.treePts);
  ok(A.largeCan === true, '系点够 5 时大节点可点');
  ok(A.otherTreeLocked === true, '0 点的系不该开大节点');
  ok(A.largeSpecial === true, '大节点终极效果（special/flag）应进入面板');
  ok(A.m1Locked === true, '中节点前置未满足应锁');
  ok(A.m1Can === true, '中节点前置链通后可点');
  ok(A.refundBlocked === true, '后置节点还点着时前置不可洗');
  ok(A.refundOk === true, '洗掉后置后可洗前置');
  ok(A.spentTotal === 8, '最终投入 8 点（5+1+1+1）', A.spentTotal);
  ok(A.pointsNow === 22, '剩余 22 点', A.pointsNow);
  ok(A.statAfter === A.statBase + A.statPer * 5,
    '根节点 5 级应 +' + (A.statPer * 5) + ' ' + A.statKey + ' 并透传面板',
    A.statBase + '→' + A.statAfter);
  ok(A.talentPanelAlive, 'UI.onTalentChanged 钩子应存在');

  /* ================= A2. 天赋随等级解锁 ================= */
  console.log('\nA2. 天赋随等级解锁');
  const A2 = await p.evaluate(() => {
    const G = Game, R = {};
    const FIRST = { warrior: 'rage', mage: 'frost', taoist: 'talisman' }[G.state.cls];
    const S1 = FIRST + '_s1', S2 = FIRST + '_s2', S4 = FIRST + '_s4', L = FIRST + '_L';
    R.unlock = {
      s1: TALENT_NODES[S1].unlock, s2: TALENT_NODES[S2].unlock,
      s4: TALENT_NODES[S4].unlock, L: TALENT_NODES[L].unlock
    };
    /* 通用系长链：第一个 1 级，最后一个 30 级 */
    const uniIds = Object.keys(TALENT_NODES).filter(i => i.indexOf('uni_') === 0);
    R.uniFirst = TALENT_NODES[uniIds[0]].unlock;
    R.uniLast = TALENT_NODES[uniIds[uniIds.length - 1]].unlock;

    /* 1 级：根节点可点，第 2 层锁 */
    G.state.level = 1; G.talentState().spent = {}; G.recalc();
    R.lv1root = G.canAllocTalent(S1);
    R.lv1s2 = G.canAllocTalent(S2);
    /* 4 级：s2 解锁（前置已点），s4（8 级）仍锁 */
    G.state.level = 4; G.talentState().spent = {}; G.talentState().spent[S1] = 2; G.recalc();
    R.lv4s2 = G.canAllocTalent(S2);
    R.lv4s4 = G.canAllocTalent(S4);
    /* 26 级大节点解锁，25 级锁 */
    G.state.level = 26; G.talentState().spent = {}; G.talentState().spent[S1] = 5; G.recalc();
    R.lv26L = G.canAllocTalent(L);
    G.state.level = 25;
    R.lv25L = G.canAllocTalent(L);
    /* 预设不还原未解锁的深层节点 */
    G.state.level = 5; G.talentState().spent = {};
    G.talentState().presets[1] = {};
    G.talentState().presets[1][S1] = 2;
    G.talentState().presets[1][L] = 1;
    G.loadTalentPreset(1);
    R.presetDroppedL = !G.talentState().spent[L];
    R.presetKeptS1 = G.talentState().spent[S1] || 0;
    /* 还原现场 */
    G.talentState().spent = {}; G.talentState().presets = [null, null, null];
    G.state.level = 40; G.recalc();
    return R;
  });
  ok(A2.unlock.s1 === 1 && A2.unlock.s2 === 4 && A2.unlock.s4 === 8 && A2.unlock.L === 26,
    '职业系解锁等级应为 1 / 4 / 8 / 26', JSON.stringify(A2.unlock));
  ok(A2.uniFirst === 1 && A2.uniLast === 30, '通用系长链按序号解锁（1 → 30）',
    A2.uniFirst + '→' + A2.uniLast);
  ok(A2.lv1root === true, '1 级应能点根节点');
  ok(A2.lv1s2 === false, '1 级不应能点第 2 层（4 级解锁）');
  ok(A2.lv4s2 === true, '4 级第 2 层应解锁');
  ok(A2.lv4s4 === false, '4 级第 3 层仍锁（8 级解锁）');
  ok(A2.lv26L === true, '26 级大节点应解锁');
  ok(A2.lv25L === false, '25 级大节点仍锁');
  ok(A2.presetDroppedL && A2.presetKeptS1 === 2, '预设不应还原未解锁节点，已解锁的正常还原',
    'kept=' + A2.presetKeptS1 + ' droppedL=' + A2.presetDroppedL);


  /* ================= B. 预设 / 洗点 / 迁移 ================= */
  console.log('\nB. 预设 / 洗点 / 迁移');
  const B = await p.evaluate(() => {
    const G = Game, R = {};
    R.firstCost = G.respecCost();
    G.respecTalents();
    R.spentAfterRespec = G._spentTotal();
    const FIRST = { warrior: 'rage', mage: 'frost', taoist: 'talisman' }[G.state.cls];
    G.allocTalent(FIRST + '_s1'); G.allocTalent(FIRST + '_s2');
    G.saveTalentPreset(0);
    G.refundTalent(FIRST + '_s2');
    G.loadTalentPreset(0);
    R.restored = G.talentState().spent[FIRST + '_s2'] || 0;
    /* 低等级读预设：超出预算截断 */
    G.state.level = 3;
    const r = G.loadTalentPreset(0);
    R.truncated = G._spentTotal();
    R.loadMsg = r.msg;
    G.state.level = 40; G.recalc();
    /* 洗点费用递增（含刚才那次共 6 次） */
    G.state.gold = 300000;
    const costs = [R.firstCost];
    for (let i = 0; i < 5; i++) { costs.push(G.respecCost()); G.respecTalents(); }
    R.costs = costs;
    R.respecCount = G.talentState().respecCount;
    R.poorRespec = (() => { G.state.gold = 0; return G.respecTalents(); })();
    /* 旧档迁移 */
    const fake = {
      talents: { spent: { rage_dead_999: 3, rage_s1: 2 }, presets: [null, null, null] },
      skills: { whirl: { lv: 3, v: 1 }, dead_skill_x: { lv: 5 } }
    };
    G.normalizeProgress(fake);
    R.deadTalentGone = !fake.talents.spent.rage_dead_999;
    R.liveTalentKept = fake.talents.spent.rage_s1;
    R.deadSkillGone = !fake.skills.dead_skill_x;
    R.liveSkillKept = fake.skills.whirl && fake.skills.whirl.lv;
    G.normalizeProgress({});          // 空对象不应炸
    G.normalizeProgress(null);
    R.migrateSafe = true;
    return R;
  });
  ok(B.spentAfterRespec === 0, '洗点后清空');
  ok(B.restored === 1, '预设应还原加点');
  ok(B.truncated <= 3, '低等级读预设应按预算截断', B.truncated);
  ok(JSON.stringify(B.costs) === JSON.stringify([1000, 5000, 20000, 50000, 50000, 50000]),
    '洗点费用递增 1k/5k/20k/50k/50k/50k', B.costs.join(','));
  ok(B.respecCount === 6, '洗点计数', B.respecCount);
  ok(B.poorRespec && B.poorRespec.ok === false, '金币不足应拒绝洗点');
  ok(B.deadTalentGone && B.liveTalentKept === 2, '旧档死天赋 id 应清掉，活的保留');
  ok(B.deadSkillGone && B.liveSkillKept === 3, '旧档死技能 id 应清掉，活的保留');
  ok(B.migrateSafe, '空对象迁移不应抛错');

  /* ================= C. 技能升级 / 变体 ================= */
  console.log('\nC. 技能升级 / 变体');
  const C = await p.evaluate(() => {
    const G = Game, R = {};
    G.state.level = 40; G.recalc();
    const order = SKILL_ORDER[G.state.cls];
    R.orderLen = order.length;
    R.allUnlocked = order.every(id => G.state.level >= SKILLS[id].unlock);
    R.skillPts = G.skillPoints();
    R.lockedRejected = (() => { G.state.level = 1; G.recalc(); const r = G.levelUpSkill(order[order.length - 1]); G.state.level = 40; G.recalc(); return r; })();
    const first = order[0];
    G.levelUpSkill(first);
    R.lvAfterOne = G.skillLevel(first);
    for (let i = 0; i < 9; i++) G.levelUpSkill(first);
    R.lvMax = G.skillLevel(first);
    R.overMax = G.levelUpSkill(first);
    R.ptsSpentOnFirst = 9;
    R.skillPtsNow = G.skillPoints();
    R.v0 = G.setSkillVariant(first, 0);
    R.v2 = G.setSkillVariant(first, 2);
    R.vBad = G.setSkillVariant(first, 3);
    G.setSkillVariant(first, 0);
    return R;
  });
  ok(C.orderLen === 12, CLS + ' 应有 12 个技能', C.orderLen);
  ok(C.allUnlocked === true, '40 级全部技能应解锁');
  ok(C.skillPts === 40, '40 级应有 40 技能点', C.skillPts);
  ok(C.lockedRejected && C.lockedRejected.ok === false && /尚未领悟/.test(C.lockedRejected.msg),
    '未领悟技能不可升级', C.lockedRejected && C.lockedRejected.msg);
  ok(C.lvAfterOne === 2, '升 1 级后为 2 级', C.lvAfterOne);
  ok(C.lvMax === 10, '技能上限 10 级', C.lvMax);
  ok(C.overMax && C.overMax.ok === false, '满级后不可再升');
  ok(C.skillPtsNow === 31, '升级花掉 9 点，剩 31', C.skillPtsNow);
  ok(C.v0 && C.v2 && !C.vBad, '变体只能取 0/1/2');

  /* ================= D. 全技能施放 ================= */
  console.log('\nD. 全技能施放（消耗 / 冷却 / 不报错）');
  const D = await p.evaluate(() => {
    const G = Game, R = { list: [], bad: [] };
    G.state.level = 40; G.recalc();
    /* 旋风斩命中回 8 灵力（设计如此），期望消耗要扣掉它 */
    const MP_REFUND = { whirl: 8 };
    for (const id of SKILL_ORDER[G.state.cls]) {
      const sk = SKILLS[id];
      const v = G.skillVariant(id);
      const smod = mergeSkillMods(G.skillMod(id), variantMods(sk, v));
      const wantCd = Math.max(0.5, G.skillCd(sk) * (1 - ((smod && smod.cd) || 0) / 100));
      const wantCost = Math.max(1, Math.round(G.skillCost(sk) * (1 - ((smod && smod.cost) || 0) / 100)));
      G.cooldowns[id] = 0;
      G.state.mp = G.state.stats.mpMax;      // 每次施放前回满，避免前面的施放干扰计量
      const mp0 = G.state.mp;
      let err = null;
      try { G.castSkill(id); } catch (e) { err = String((e && e.message) || e); }
      const cd = G.cooldowns[id] || 0;
      const spent = mp0 - G.state.mp + (MP_REFUND[id] || 0);
      R.list.push({ id, err, cd: +cd.toFixed(2), spent: +spent.toFixed(1), wantCd: +wantCd.toFixed(2), wantCost });
      if (err) R.bad.push(id + ': ' + err);
    }
    return R;
  });
  ok(D.bad.length === 0, '全部技能施放不应抛错', D.bad.join(' | '));
  let cdBad = [], costBad = [];
  for (const c of D.list) {
    if (Math.abs(c.cd - c.wantCd) > 0.06) cdBad.push(c.id + ' ' + c.cd + '≠' + c.wantCd);
    if (Math.abs(c.spent - c.wantCost) > 1.5) costBad.push(c.id + ' ' + c.spent + '≠' + c.wantCost);
  }
  ok(cdBad.length === 0, '冷却应符合 skillCd', cdBad.join(','));
  ok(costBad.length === 0, '消耗应符合 skillCost', costBad.join(','));

  /* ================= E. 变体对消耗/冷却的影响 ================= */
  console.log('\nE. 变体修正（消耗 / 冷却）');
  const E = await p.evaluate(() => {
    const G = Game, R = {};
    const id = SKILL_ORDER[G.state.cls][0];
    const sk = SKILLS[id];
    const v0 = sk.variants[0].mods, v1 = sk.variants[1].mods;
    const cast = (v) => {
      G.setSkillVariant(id, v);
      G.cooldowns[id] = 0;
      G.state.mp = G.state.stats.mpMax;
      const mp0 = G.state.mp;
      G.castSkill(id);
      return { cd: G.cooldowns[id], cost: mp0 - G.state.mp + (id === 'whirl' ? 8 : 0) };
    };
    const base = cast(0);
    R.baseCd = base.cd; R.baseCost = base.cost;
    const one = cast(1);
    R.v1Cd = one.cd; R.v1Cost = one.cost;
    R.wantCd0 = Math.max(0.5, G.skillCd(sk) * (1 - (v0.cd || 0) / 100));
    R.wantCd1 = Math.max(0.5, G.skillCd(sk) * (1 - (v1.cd || 0) / 100));
    R.wantCost0 = Math.max(1, Math.round(G.skillCost(sk) * (1 - (v0.cost || 0) / 100)));
    R.wantCost1 = Math.max(1, Math.round(G.skillCost(sk) * (1 - (v1.cost || 0) / 100)));
    G.setSkillVariant(id, 0);
    return R;
  });
  near(E.baseCd, E.wantCd0, 0.06, '基准冷却 = 基础冷却 × 变体0修正', E.baseCd + ' vs ' + E.wantCd0);
  near(E.baseCost, E.wantCost0, 0.51, '基准消耗 = 基础消耗 × 变体0修正', E.baseCost + ' vs ' + E.wantCost0);
  near(E.v1Cd, E.wantCd1, 0.06, '变体1冷却修正生效', E.v1Cd + ' vs ' + E.wantCd1);
  near(E.v1Cost, E.wantCost1, 0.51, '变体1消耗修正生效', E.v1Cost + ' vs ' + E.wantCost1);

  /* ================= F. 伤害曲线 ================= */
  console.log('\nF. 伤害曲线（等级 / 变体 / 天赋）');
  if (process.env.DBG) await p.evaluate(() => { window.DBG = true; });
  /* 预清场 + 静置：D/E 段会留下召唤物（会索敌普攻测试怪）、在飞投射物、
   * 陨石/裁决的 telegraph（帧计时走 FX.zones）、火海/暴雪/星雨的 setInterval tick、
   * 以及剑雨的 rAF 落地动画。全部撤掉后等 700ms 让 rAF 放完，再生成测试怪计量 */
  await p.evaluate(() => {
    const G = Game;
    FX.clear();
    G.mapGen = (G.mapGen || 0) + 1;
    for (const al of G.allies) { if (al.actor && al.actor.group) G.scene.remove(al.actor.group); }
    G.allies.length = 0;
  });
  await wait(700);
  const F0 = await p.evaluate(() => {
    const G = Game, R = {};
    /* 确定性：Math.random 恒不暴击；rollDamage 换成无随机版
     * （RND 是 data-core 的 const 词法绑定，window.RND 覆盖不到它，
     *  所以直接替换 Game 对象上的方法） */
    Math.random = () => 0.99;
    G.rollDamage = base => {
      const st = G.state.stats;
      const lo = 0.9 + Math.min(0.2, (st.minDmg || 0) / 100);
      return { dmg: base * (lo + 1.12) / 2 * (1 + (st.dmgAll || 0) / 100), crit: false };
    };
    /* 命中计数：每次施放前归零，_dmg 取本次施放的总伤害 */
    window._hits = 0; window._total = 0; window._log = [];
    if (window.DBG) {
      const origExp = G.explodeAt.bind(G);
      G.explodeAt = (pos, radius, baseDmg, color, big, silent, tag) => {
        if (window._log) window._log.push({ explode: +(baseDmg / G.state.stats.atk).toFixed(3), r: radius });
        return origExp(pos, radius, baseDmg, color, big, silent, tag);
      };
    }
    const origDmg = G.damageEnemy.bind(G);
    G.damageEnemy = (e, dmg, crit, opts) => {
      window._hits++; window._total += dmg;
      if (window._log) window._log.push({ tag: (opts && opts.tag) || G._tag || 'melee', dmg: +dmg.toFixed(1) });
      return origDmg(e, dmg, crit, opts);
    };
    const id = SKILL_ORDER[G.state.cls][0];
    const pp = G.playerGroup.position;
    const e = G.spawnEnemy('ghost', pp.x + 2, pp.z, false, 1);
    if (!e) return { spawnFail: true };
    window._te = e;
    window._cast = (lv, v) => {
      G.state.skills[id] = { lv, v: v || 0 };
      G.recalc();
      const st = G.state.stats;
      st.crit = 0;
      /* 测试怪会自己飘：每次施放前把它钉回玩家身边，否则异步技能结算时
       * 命中次数不稳定（火球可能只蹭到 1 下），比值就不可比 */
      e.hp = 1e6; e.maxHp = 1e6; e.dead = false;
      const pp2 = G.playerGroup.position;
      e.pos.set(pp2.x + 2, 0, pp2.z);
      e.spawnPos.copy(e.pos);
      /* 朝向测试怪：dir 类技能（火球）沿 aimDir 飞行，enemy 类自动索敌 */
      G.aimDir.set(e.pos.x - pp2.x, 0, e.pos.z - pp2.z).normalize();
      G.aimPoint.set(e.pos.x, 0, e.pos.z);
      G.cooldowns[id] = 0;
      window._hits = 0; window._total = 0; window._log = [];
      G.castSkill(id);
    };
    window._dmg = () => window._total;
    window._hitlog = () => window._log;
    R.id = id;
    R.type = SKILLS[id].type;
    R.async = ['proj', 'bolt'].includes(SKILLS[id].type);   // 投射物伤害延迟结算
    R.atk = G.state.stats.atk;
    R.v0mods = SKILLS[id].variants[0].mods;
    R.v1mods = SKILLS[id].variants[1].mods;
    R.talent = {
      warrior: { id: 'rage_m1', skill: 'whirl', dmg: 12 },
      mage: { id: 'flame_m1', skill: 'fireball', dmg: 20 },
      taoist: { id: 'talisman_m1', skill: 'talisman', dmg: 20 }
    }[G.state.cls];
    R.snap = (() => { const s = G.state.stats; return { atk: s.atk, skillDmg: s.skillDmg, aoeDmg: s.aoeDmg, dmgAll: s.dmgAll, projDmg: s.projDmg, lvMul: 1 + SKILL_LV_STEP * (G.skillLevel(id) - 1), spent: JSON.stringify(G.state.talents.spent), zones: (G.zones || []).length, projs: (FX && FX.projectiles || []).length, buffs: (G.state.buffs || []).map(b => b.name) }; })();
    return R;
  });
  if (F0.spawnFail) {
    ok(false, '测试怪生成失败（同屏上限？）');
  } else {
    if (process.env.DBG) console.log('    [dbg] F0 快照：', JSON.stringify(F0.snap));
    const measure = async (lv, v) => {
      await p.evaluate(([l, vv]) => window._cast(l, vv), [lv, v]);
      if (F0.async) await wait(900);   // 投射物飞行 + 命中
      const r = await p.evaluate(() => ({ d: window._dmg(), h: window._hits, alive: Game.enemies.filter(x => !x.dead).length }));
      if (process.env.DBG) console.log('    [dbg] lv' + lv + ' v' + v + ' → hits=' + r.h + ' dmg=' + r.d.toFixed(1) + ' alive=' + r.alive + ' log=' + JSON.stringify(await p.evaluate(() => window._hitlog())));
      return r;
    };
    const m1 = await measure(1, 0);
    const m10 = await measure(10, 0);
    const v1mods = F0.v1mods;
    const v0mods = F0.v0mods;
    const mV = v1mods.dmg ? await measure(1, 1) : m1;
    const d1 = m1.d, d10 = m10.d, dV = mV.d;
    ok(d1 > 0, '技能应能造成伤害', d1.toFixed(1));
    ok(m1.h > 0, '技能应命中测试怪', m1.h);
    near(d10 / d1, 1.72, 0.02, '技能 10 级伤害应为 1 级的 1.72 倍', (d10 / d1).toFixed(3));
    if (v1mods.dmg) {
      /* 每击伤害按 dmg 修正走；总比值再乘以命中数之比。
       * 数量修正只有在「扇形齐发」技能上才体现为单敌多段命中——
       * 火球连环 3 发都砸同一只；五雷符是逐目标召唤，单敌时仍只有 1 道 */
      const perHit = (1 + v1mods.dmg / 100) / (1 + (v0mods.dmg || 0) / 100);
      const FAN = { warrior: false, mage: true, taoist: false }[CLS];
      const wantHits1 = FAN ? 1 + (v0mods.count || 0) : 1;
      ok(m1.h === wantHits1, '基准变体命中数应符合技能形态', m1.h + ' vs ' + wantHits1);
      near(dV / d1, perHit * (mV.h / m1.h), 0.03, '变体每击伤害修正应生效',
        (dV / d1).toFixed(3) + ' vs ' + (perHit * (mV.h / m1.h)).toFixed(3));
    }
    /* 天赋：给该技能加伤的中节点（注意变体 0 本身可能带伤害修正，比值要连它一起算） */
    if (F0.talent.skill === F0.id) {
      await p.evaluate(tid => {
        Game.state.talents.spent = {};
        Game.state.talents.spent[tid] = 1;
      }, F0.talent.id);
      const mT = await measure(1, 0);
      const dT = mT.d;
      const base = 1 + (F0.v0mods.dmg || 0) / 100;
      near(dT / d1, (base + F0.talent.dmg / 100) / base, 0.02,
        '天赋技能修正应进入伤害', (dT / d1).toFixed(3));
      await p.evaluate(() => { Game.state.talents.spent = {}; Game.recalc(); });
    } else {
      const mod = await p.evaluate(tid => {
        Game.state.talents.spent = {};
        Game.state.talents.spent[tid] = 1;
        Game.recalc();
        const m = Game.state.stats.skillMods['fireball'] || Game.state.stats.skillMods['talisman'];
        Game.state.talents.spent = {}; Game.recalc();
        return m && m.dmg;
      }, F0.talent.id);
      ok(mod === F0.talent.dmg, '天赋 skillMods 汇总值正确', mod);
    }
    await p.evaluate(() => { window._te.dead = true; });
  }

  /* ================= G. UI 面板 ================= */
  console.log('\nG. UI 面板');
  /* 天赋面板：画布点击加点 */
  const G1 = await p.evaluate(() => {
    UI.closeAll();
    UI.openTalent();
    const tabs = document.querySelectorAll('#tlTrees .tl-tab');
    const hits = UI._tlHit || [];
    return {
      open: document.getElementById('talentPanel').classList.contains('open'),
      tabs: tabs.length,
      hits: hits.length,
      tab0: tabs[0] && tabs[0].textContent.trim(),
      pts: document.getElementById('tlPts').textContent
    };
  });
  ok(G1.open, '天赋面板应能打开');
  ok(G1.tabs === 5, '应有 5 个系页签（3 系 + 通用 + 协同）', G1.tabs);
  ok(G1.hits === 10 || G1.hits === 30, '画布应生成节点热区（10 或 30）', G1.hits);
  const FIRST_TREE = { warrior: '狂战', mage: '寒冰', taoist: '符箓' }[CLS];
  ok((G1.tab0 || '').indexOf(FIRST_TREE) === 0, '首个页签应是本职业第一系', G1.tab0);

  const G2 = await p.evaluate(() => {
    const G = Game;
    G.state.level = 20; G.recalc();
    UI.openTalent();
    const before = G._spentTotal();
    const cv = document.getElementById('tlCanvas');
    const h = UI._tlHit[0];
    const r = cv.getBoundingClientRect();
    const sx = r.width / 660, sy = r.height / 440;
    cv.dispatchEvent(new MouseEvent('click', {
      clientX: r.left + h.x * sx, clientY: r.top + h.y * sy, bubbles: true
    }));
    const after = G._spentTotal();
    /* Shift + 点击洗掉 */
    cv.dispatchEvent(new MouseEvent('click', {
      clientX: r.left + h.x * sx, clientY: r.top + h.y * sy, bubbles: true, shiftKey: true
    }));
    const afterRefund = G._spentTotal();
    return { before, after, afterRefund };
  });
  ok(G2.after === G2.before + 1, '画布点击应加点', G2.before + '→' + G2.after);
  ok(G2.afterRefund === G2.before, 'Shift+点击应洗点', G2.afterRefund);

  /* 预设按钮 */
  const G3 = await p.evaluate(() => {
    const G = Game;
    G.state.level = 20; G.recalc();
    UI.openTalent();
    const btns = document.querySelectorAll('#tlPresets .tl-pst');
    return { count: btns.length, respec: !!document.getElementById('tlRespec') };
  });
  ok(G3.count === 3, '应有 3 个预设位', G3.count);
  ok(G3.respec, '应有重置按钮');

  /* 技能面板：升级 + 切变体 */
  const G4 = await p.evaluate(() => {
    const G = Game;
    G.state.level = 40; G.recalc();
    UI.openSkill();
    const rows = document.querySelectorAll('#skList .sk-row');
    const trees = document.querySelectorAll('#skList .sk-tree');
    const lvBtn = document.querySelector('#skList [data-sklv]');
    const before = lvBtn ? G.skillLevel(lvBtn.dataset.sklv) : -1;
    if (lvBtn) lvBtn.click();
    const after = lvBtn ? G.skillLevel(lvBtn.dataset.sklv) : -1;
    const vBtn = document.querySelectorAll('#skList [data-skv]')[1];   // 第二个变体（Ⅰ→Ⅱ 必有变化）
    let vBefore = -1, vAfter = -1;
    if (vBtn) {
      const sid = vBtn.dataset.skv.split(':')[0];
      vBefore = G.skillVariant(sid);
      vBtn.click();
      vAfter = G.skillVariant(sid);
    }
    return { rows: rows.length, trees: trees.length, before, after, vBefore, vAfter };
  });
  ok(G4.rows === 12, '技能面板应列 12 个技能', G4.rows);
  ok(G4.trees === 3, '应按 3 个系分组', G4.trees);
  ok(G4.after === G4.before + 1, '升级按钮应生效', G4.before + '→' + G4.after);
  ok(G4.vAfter !== G4.vBefore && G4.vAfter >= 0 && G4.vAfter <= 2, '变体按钮应切换', G4.vBefore + '→' + G4.vAfter);

  /* 详情卡底部的技能条按钮（1-5） */
  const G4b = await p.evaluate(() => {
    const G = Game;
    G.state.level = 40; G.recalc();
    UI.openSkill();
    const btns = document.querySelectorAll('#skList [data-skbar]');
    const sel = UI.skSel;
    const idx = btns.length ? 4 : -1;
    if (btns.length) btns[idx].click();
    const bar = G.skillBar();
    const tiles = document.querySelectorAll('#skList .sk-tile .sk-onslot').length;
    UI.closeAll();
    return { n: btns.length, sel, placed: bar[4], onSlotBadges: tiles };
  });
  ok(G4b.n === 8, '详情卡应有 8 个技能条按钮', G4b.n);
  ok(G4b.placed === G4b.sel, '点第 5 格应把当前选中技能放上技能条', G4b.placed + ' vs ' + G4b.sel);
  ok(G4b.onSlotBadges >= 1, '已在条上的技能应有角标');

  /* 动作条：技能条 5 格手动配置 */
  const G5 = await p.evaluate(() => {
    const G = Game;
    UI.closeAll();
    G.state.level = 40; G.recalc();
    G.state.skillbar = null;                 // 触发按「已领悟」自动填充
    G.skillBar(true);
    UI.buildActionBar();
    const bar = document.getElementById('actionbar');
    const skills = bar.querySelectorAll('.skill');
    const slots = G.skillBar();
    const R = {
      n: skills.length,
      len: slots.length,
      ids: slots.slice(),
      empty: bar.querySelectorAll('.skill.empty').length,
      hasPg: !!bar.querySelector('[data-pg]'),
      order: SKILL_ORDER[G.state.cls]
    };
    /* 空位点击应打开术法面板 */
    G.state.skillbar = [null, null, null, null, null];
    G.skillBar();
    UI.buildActionBar();
    R.emptyAll = document.querySelectorAll('#actionbar .skill.empty').length;
    const em = document.querySelector('#actionbar .skill.empty');
    R.hasEmpty = !!em;
    if (em) em.click();
    R.emptyOpensPanel = document.getElementById('skillPanel').classList.contains('open');
    UI.closeAll();
    return R;
  });
  ok(G5.n === 8, '动作条应 8 格', G5.n);
  ok(G5.len === 8, '技能条长度恒为 8', G5.len);
  ok(G5.ids.join() === G5.order.slice(0, 8).join(), '新档 / 空条应按已领悟顺序自动填前 8 个', G5.ids.join());
  ok(!G5.hasPg, '技能条不应再有翻页按钮');
  ok(G5.hasEmpty && G5.emptyAll === 8, '8 格全空时应渲染 8 个空占位', G5.emptyAll);
  ok(G5.emptyOpensPanel === true, '点空位应打开术法面板');

  /* 技能条配置：放上 / 换位 / 腾空 / 拒绝非法 */
  const G5b = await p.evaluate(() => {
    const G = Game, R = {};
    const order = SKILL_ORDER[G.state.cls];
    R.order7 = order[7];
    G.state.level = 40; G.recalc();
    G.state.skillbar = [order[0], order[1], null, null, null];
    G.skillBar();
    /* 替换：把第 8 个技能放到 1 格 */
    R.assign = G.assignSkillBar(0, order[7]);
    R.slot0 = G.skillBar()[0];
    /* 换位：把第 8 个技能从 0 格移到 4 格，0 格应腾空 */
    R.move = G.assignSkillBar(4, order[7]);
    R.afterMove = G.skillBar().slice();
    R.moveClearsOld = R.afterMove[0] === null;
    R.moveLandsNew = R.afterMove[4] === order[7];
    /* 腾空 */
    R.unassign = G.unassignSkillBar(4);
    R.slot4Empty = G.skillBar()[4] === null;
    /* 未领悟拒绝 */
    G.state.level = 1; G.recalc();
    R.lockedReject = G.assignSkillBar(0, order[order.length - 1]);
    G.state.level = 40; G.recalc();
    /* 越界 / 非本职业 */
    R.badSlot = G.assignSkillBar(9, order[0]);
    const other = G.state.cls === 'warrior' ? 'mage' : 'warrior';
    R.badCls = G.assignSkillBar(0, SKILL_ORDER[other][0]);
    /* 存档进出：技能条原样带回 */
    G.state.skillbar = [order[1], null, order[3], null, null];
    G.skillBar();
    try {
      const doc = SaveManager.pack(G.state, 0);
      const back = SaveManager.unpack(doc);
      R.saveBar = (back.skillbar || []).join(',');
      R.saveLen = (back.skillbar || []).length;
    } catch (e) { R.saveErr = String(e && e.message || e); }
    return R;
  });
  ok(G5b.assign && G5b.assign.ok, '应能把技能放到技能条', G5b.assign && G5b.assign.msg);
  ok(G5b.slot0 === G5b.order7, '放到第 1 格后该格应是目标技能');
  ok(G5b.moveClearsOld === true, '换位时原格应腾空');
  ok(G5b.moveLandsNew === true, '换位后新格应有该技能');
  ok(G5b.unassign && G5b.unassign.ok && G5b.slot4Empty === true, '应能腾空技能条格');
  ok(G5b.lockedReject && G5b.lockedReject.ok === false && /尚未领悟/.test(G5b.lockedReject.msg),
    '未领悟技能不可上条', G5b.lockedReject && G5b.lockedReject.msg);
  ok(G5b.badSlot && G5b.badSlot.ok === false, '越界格应拒绝');
  ok(G5b.badCls && G5b.badCls.ok === false, '非本职业技能应拒绝');
  ok(!G5b.saveErr && G5b.saveLen === 8 && G5b.saveBar.split(',')[0] !== '', '技能条应随存档进出',
    G5b.saveErr || G5b.saveBar);

  /* 键 1-5 对应技能条；空位不施放；Z/X 喝药 */
  const G6 = await p.evaluate(() => {
    const G = Game;
    G.state.level = 40; G.recalc();
    G.state.mp = 100000; G.state.stats.mpMax = 100000;
    const order = SKILL_ORDER[G.state.cls];
    G.state.skillbar = [order[0], order[1], order[9], null, null];
    G.skillBar();
    UI.buildActionBar();
    const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    G.cooldowns = {};
    key('1');
    const cd1 = G.cooldowns[order[0]] || 0;
    G.cooldowns = {};
    key('3');
    const cd3 = G.cooldowns[order[9]] || 0;    // 第 3 格是第 10 个技能
    G.cooldowns = {};
    key('4');                                  // 空位：不该施放
    let anyCd = false;
    for (const id in G.cooldowns) if (G.cooldowns[id] > 0) anyCd = true;
    /* 药水键 Z/X */
    G.state.potions.hp = 3; G.state.hp = 10; G.state.stats.hpMax = 100;
    const hp0 = G.state.hp;
    key('z');
    return { cd1, cd3, emptyNoCast: !anyCd, hp0, hpAfter: G.state.hp };
  });
  ok(G6.cd1 > 0, '键 1 应施放技能条第 1 格');
  ok(G6.cd3 > 0, '键 3 应施放技能条第 3 格（而不是第 3 个技能）');
  ok(G6.emptyNoCast === true, '空位按键不应施放任何技能');
  ok(G6.hpAfter > G6.hp0, 'Z 键应喝红药', G6.hp0 + '→' + G6.hpAfter);

  /* T / K 开面板 */
  const G7 = await p.evaluate(() => {
    UI.closeAll();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    const t = document.getElementById('talentPanel').classList.contains('open');
    UI.closeAll();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    const k = document.getElementById('skillPanel').classList.contains('open');
    UI.closeAll();
    return { t, k };
  });
  ok(G7.t, 'T 键应开天赋面板');
  ok(G7.k, 'K 键应开术法面板');

  /* ---------- H. 套装体系（v1.2.2） ---------- */
  console.log('\nH. 套装体系（3 类型 × 5/4/3 件）');
  const H = await p.evaluate(async () => {
    const G = Game;
    const cls = G.state.cls;
    const R = { sets: [], mech: {}, cls };
    const savedEq = G.state.equipment;
    const savedEnemies = G.enemies;
    G.state.level = 40; G.running = true; G.dead = false;
    const mk = (id, i) => normalizeItem({
      kind: SETS[id].slots[i], slot: SETS[id].slots[i], name: SETS[id].pieces[i],
      rarity: 'set', ilvl: 40, setId: id, setName: SETS[id].name, cls,
      sockets: 0, runes: [], affixes: []
    });
    const equipSet = id => {
      const eq = {};
      SETS[id].slots.forEach((sl, i) => { eq[sl] = mk(id, i); });
      G.state.equipment = eq;
      G.recalc();
      return eq;
    };
    let eid = 900000;
    const dummy = (x, z) => ({
      id: ++eid, dead: false, pos: new THREE.Vector3(x, 0, z), cfg: {}, level: 1,
      hp: 1e9, maxHp: 1e9, radius: 0.5, actor: {}, boss: false,
      slow: 0, slowT: 0, poisonT: 0, venomT: 0, stun: 0, hitFlash: 0
    });

    /* H1：三套满件 → 档位、属性、技能修正、机制全部落进 state.stats */
    for (const id of Object.keys(SETS).filter(x => SETS[x].cls === cls)) {
      const s = SETS[id];
      equipSet(id);
      const st = G.state.stats;
      const last = s.bonuses[s.bonuses.length - 1];
      const statsOk = Object.keys(last.stats || {}).every(k => (st[k] || 0) >= last.stats[k]);
      const modsOk = Object.keys(last.skillMods || {}).every(sk => st.skillMods[sk]
        && Object.keys(last.skillMods[sk]).every(k => (st.skillMods[sk][k] || 0) >= last.skillMods[sk][k]));
      const carriers = []
        .concat(last.flag ? [['flags', last.flag]] : [])
        .concat(Array.isArray(last.flags) ? last.flags.map(f => ['flags', f]) : [])
        .concat(last.special ? [['specials', last.special]] : [])
        .concat(Array.isArray(last.specials) ? last.specials.map(sp => ['specials', sp]) : []);
      const carriersOk = carriers.every(([bag, key]) => !!st[bag][key]);
      R.sets.push({
        id, size: s.pieces.length, n: st.setCount[id], tiers: s.bonuses.length,
        bonuses: st.setBonuses.filter(b => b.setId === id).length,
        statsOk, modsOk, carriersOk, carriers: carriers.map(c => c[1]).join(',')
      });
    }

    const st = () => G.state.stats;
    const dmgTo = (d, amt, crit) => {
      const before = d.hp;
      /* 不加 silent：暴击叠层 / 过载这类「有感命中」钩子会被 silent 跳过 */
      G.damageEnemy(d, amt, !!crit);
      return before - d.hp;
    };

    if (cls === 'warrior') {
      /* 血怒 3 件：暴击叠「狂怒」，5 层后同一击伤害 +25% */
      equipSet('xuenu');
      G.frenzy = { n: 0, t: 4 };
      const d = dummy(3, 0);
      for (let i = 0; i < 5; i++) dmgTo(d, 100, true);
      const stacks = G.frenzy.n;
      const boosted = dmgTo(d, 1000, false);
      G.frenzy = { n: 0, t: 4 };
      const plain = dmgTo(d, 1000, false);
      R.mech.frenzyStacks = stacks;
      R.mech.frenzyRatio = boosted / plain;

      /* 磐石 4 件：格挡立刻反击（把格挡率钉到 100% 稳定触发） */
      equipSet('panshi');
      st().block = 100; st().dodge = 0;
      G.invuln = 0; G.dead = false; G.state.hp = st().hpMax;
      G.riposteCd = 0;
      const src = dummy(3, 0);
      G.damagePlayer(50, src);
      R.mech.riposteDmg = 1e9 - src.hp;
      R.mech.riposteCd = G.riposteCd;
      R.mech.panshiThorns = st().thorns;
    }

    if (cls === 'mage') {
      /* 玄冰 3 件：减速目标吃 +25% */
      equipSet('xuanbing');
      const slowD = dummy(3, 0); slowD.slow = 0.5; slowD.slowT = 2;
      const freeD = dummy(3, 3); freeD.slow = 0; freeD.slowT = 0;
      R.mech.iceRatio = dmgTo(slowD, 1000, false) / dmgTo(freeD, 1000, false);

      /* 雷殛 4 件：暴击向周围追加 60% 天雷（第二个靶子被打到） */
      equipSet('leiji');
      G.overchargeCd = 0;
      const a = dummy(10, 10), b = dummy(11.4, 10);
      G.enemies = [a, b];
      const hitA = dmgTo(a, 1000, true);
      R.mech.overchargeOnB = 1e9 - b.hp;
      R.mech.overchargeCd = G.overchargeCd;
      R.mech.overchargeMain = hitA;
    }

    if (cls === 'taoist') {
      /* 天师 3 件：对中毒 / 蚀骨目标 +40% */
      equipSet('tianshi');
      const ven = dummy(3, 0); ven.venomT = 2;
      const clean = dummy(3, 3);
      R.mech.runeRatio = dmgTo(ven, 1000, false) / dmgTo(clean, 1000, false);

      /* 青符 5 件：召灵兽一次 2 头（wolfPack）+ 灵狼继承 90%（wolfPrime） */
      equipSet('qingfu');
      G.allies = [];
      G.cooldowns = {}; G.state.mp = 1e6; st().mpMax = 1e6;
      G.castSkill('summon');
      await new Promise(r => setTimeout(r, 60));
      R.mech.wolves = G.allies.length;
      const wolf = G.allies[0];
      R.mech.wolfInherit = wolf ? wolf.dmg / (st().atk * (1 + st().summonDmg / 100)) : 0;
      for (const al of G.allies) if (al.actor && al.actor.group) G.scene.remove(al.actor.group);
      G.allies = [];

      /* 丹鼎 4 件：毒雾每跳必定爆裂（把随机钉成 0，稳定验证钩子）
       * 用真实怪物当靶子：间隔回调会跑在下一帧，假对象会被 AI / 阴影逻辑撞上 */
      equipSet('danding');
      const pd = G.spawnEnemy('boar', G.playerGroup.position.x, G.playerGroup.position.z + 2.5, false, 5);
      pd.hp = pd.maxHp = 1e6; pd.dmg = 0;   // 靶子：打得久一点，别被毒死
      let booms = 0;
      const rawExplode = G.explodeAt;
      G.explodeAt = function (...args) { booms++; return rawExplode.apply(this, args); };
      const rawRandom = Math.random;
      Math.random = () => 0;
      G.cooldowns = {}; G.state.mp = 1e6;
      G.aimPoint.copy(pd.pos); G.aimDir.set(0, 0, 1);
      G.castSkill('poison');
      await new Promise(r => setTimeout(r, 950));
      Math.random = rawRandom;
      G.explodeAt = rawExplode;
      G.mapGen = (G.mapGen || 0) + 1;
      R.mech.plagueBooms = booms;
      R.mech.venomMarked = pd.venomT;
      G.enemies = G.enemies.filter(x => x !== pd);
    }

    G.enemies = savedEnemies;
    G.state.equipment = savedEq;
    G.recalc();
    return R;
  });

  ok(H.sets.length === 3, '每个职业 3 套都能满件穿上', 'n=' + H.sets.length);
  for (const s of H.sets) {
    ok(s.n === s.size, `【${s.id}】满件后 setCount = ${s.size}`, s.n);
    ok(s.bonuses === s.tiers, `【${s.id}】${s.tiers} 档加成全部激活`, s.bonuses);
    ok(s.statsOk, `【${s.id}】末档 stats 进入面板`);
    ok(s.modsOk, `【${s.id}】末档 skillMods 进入面板`);
    ok(s.carriersOk, `【${s.id}】flag / special 进入面板（${s.carriers}）`);
  }

  if (H.cls === 'warrior') {
    ok(H.mech.frenzyStacks === 5, '血怒：5 次暴击叠满 5 层狂怒', H.mech.frenzyStacks);
    near(H.mech.frenzyRatio, 1.25, 0.06, '血怒：满层伤害 +25%');
    ok(H.mech.riposteDmg > 0, '磐石：格挡后反击造成伤害', Math.round(H.mech.riposteDmg));
    ok(H.mech.riposteCd > 0, '磐石：反击有内置冷却', H.mech.riposteCd);
    ok(H.mech.panshiThorns >= 80, '磐石：荆棘 +80 落地', H.mech.panshiThorns);
  }
  if (H.cls === 'mage') {
    near(H.mech.iceRatio, 1.25, 0.06, '玄冰：减速目标吃 +25% 伤害');
    ok(H.mech.overchargeOnB > 0, '雷殛：暴击后追加天雷波及周围', Math.round(H.mech.overchargeOnB));
    ok(H.mech.overchargeCd > 0, '雷殛：过载有内置冷却', H.mech.overchargeCd);
  }
  if (H.cls === 'taoist') {
    near(H.mech.runeRatio, 1.4, 0.07, '天师：中毒 / 蚀骨目标吃 +40% 伤害');
    ok(H.mech.wolves === 2, '青符：召灵兽一次 2 头', H.mech.wolves);
    ok(H.mech.wolfInherit >= 0.85, '青符：灵狼继承攻击力 ≥ 85%', H.mech.wolfInherit);
    ok(H.mech.plagueBooms > 0, '丹鼎：毒雾跳伤触发了爆裂', H.mech.plagueBooms);
    ok(H.mech.venomMarked > 0, '丹鼎：毒雾给目标留下蚀骨印记', H.mech.venomMarked);
  }

  /* 截图存档 */
  await p.evaluate(() => { UI.openTalent(); });
  await wait(400);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's3-talent-' + CLS + '.png') });
  await p.evaluate(() => { UI.openSkill(); });
  await wait(400);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's4-skills-' + CLS + '.png') });
  await p.evaluate(() => { UI.closeAll(); });

  await b.close();

  console.log('\n====================================================');
  console.log(`结果（${CLS}）：${pass} 通过 / ${fail} 失败`);
  if (errs.length) console.log('页面错误 ' + errs.length + ' 条：\n' + errs.slice(0, 6).join('\n'));
  console.log('====================================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃：', e); process.exit(1); });
