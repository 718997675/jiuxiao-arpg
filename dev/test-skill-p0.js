/* ============================================================
 * 技能重构 P0 · 数据骨架契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p0.js
 *
 * 钉住四件事：
 *   1. 5 个技能位 × 三职业的映射是完整的、不复用同一技能、⑤ 号位不可互换
 *   2. 1→10 台阶表没有「连续 3 级纯数值」的空档，且 20 级倍率约 2.0 而不是 2.52
 *   3. 三线并行：每个节点都有 reqLv / needPts，且**没有任何硬前置**
 *      （到级 + 该线点数够就一定能点，不需要先点同线的另一个节点）
 *   4. [P2] 已接线：skillLvMul 必须进战斗、SKILL_LV_MAX 必须是 10，
 *      且旧的 SKILL_LV_STEP 必须彻底消失（两套曲线并存必然对不上）
 *
 * 4 原本是刻意的「反向断言」（P0/P1 阶段不许接线）；P2 接线时它按计划变红，
 * 这里已经翻成正向：**接线是必须的，退回老公式才是 bug**。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILLS = pick('SKILLS');
const SKILL_ORDER = pick('SKILL_ORDER');
const SKILL_ARCHETYPE = pick('SKILL_ARCHETYPE');
const SKILL_TIERS = pick('SKILL_TIERS');
const SKILL_TREE = pick('SKILL_TREE');
const SKILL_LV_MAX = pick('SKILL_LV_MAX');
const SKILL_POINT_RATE = pick('SKILL_POINT_RATE');
const skillPointPool = pick('skillPointPool');
const SKILL_BAR_SLOTS = pick('SKILL_BAR_SLOTS');
const skillLvMul = pick('skillLvMul');
const skillArchOrphans = pick('skillArchOrphans');
const skillArchSlotOf = pick('skillArchSlotOf');
const skillTierStep = pick('skillTierStep');
const skillArchList = pick('skillArchList');
const skillArchSlot = pick('skillArchSlot');
const skillArchInherit = pick('skillArchInherit');
const skillLines = pick('skillLines');
const skillLineNodeInfo = pick('skillLineNodeInfo');
const skillLineSpent = pick('skillLineSpent');
const skillNodeGate = pick('skillNodeGate');
const skillTreeForks = pick('skillTreeForks');
const skillForkOf = pick('skillForkOf');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.005 : eps);

/* ---------------- 1. 槽位元数据 ---------------- */
console.log('一、5 个功能位');
const S = SKILL_ARCHETYPE.slots;
ok(S.length === 5, '槽位数必须是 5', S.length);
ok(S.map(s => s.no).join(',') === '1,2,3,4,5', '槽号 1~5 连续', S.map(s => s.no).join(','));
ok(S.map(s => s.keybind).join('/') === '左键/1/2/3/4', '键位必须是 左键 + 1~4', S.map(s => s.keybind).join('/'));
/* 拍板 #2：④ 增益槽不注入元素 */
ok(S[3].elem === false, '④ 号位不能注入元素');
ok(S.filter(s => s.elem).length === 4, '可注入元素的只有 4 个位', S.filter(s => s.elem).length);
ok(S.every(s => s.name && s.role && typeof s.cdMin === 'number' && typeof s.cdMax === 'number'),
  '每个位都要有名字 / 定位 / 冷却区间');
ok(S.every(s => s.cdMax >= s.cdMin), '冷却区间不能倒挂');
/* 第 6 个位不该存在：8 格放不下左手手位，这是收敛到 5 的理由 */
ok(!S.some(s => s.no > 5), '不允许出现第 6 个技能位');

/* ---------------- 2. 三职业 × 5 位 ---------------- */
console.log('二、三职业映射');
const CLASSES = Object.keys(SKILL_ARCHETYPE.classes);
ok(CLASSES.length === 3, '职业数必须是 3', CLASSES.length);
ok(CLASSES.slice().sort().join(',') === Object.keys(SKILL_ORDER).sort().join(','),
  '技能位覆盖的职业与 SKILL_ORDER 一致', CLASSES.join(','));

for (const cls of CLASSES) {
  const list = skillArchList(cls);
  ok(list.length === 5, cls + ' 必须有 5 个位', list.length);
  ok(list.map(s => s.no).join(',') === '1,2,3,4,5', cls + ' 的位号 1~5 完整', list.map(s => s.no).join(','));

  /* 每个位继承的现有技能必须真实存在 */
  const bad = [];
  for (const slot of list) for (const id of (slot.inherit || [])) if (!SKILLS[id]) bad.push(slot.no + ':' + id);
  ok(bad.length === 0, cls + ' 的 inherit 必须指向真实技能', bad.join(','));

  /* 同一个现有技能不能被塞进两个位（否则 P1 收敛时必有歧义） */
  const seen = new Map(); const dup = [];
  for (const slot of list) for (const id of (slot.inherit || [])) {
    if (seen.has(id)) dup.push(id + '(' + seen.get(id) + '→' + slot.no + ')');
    else seen.set(id, slot.no);
  }
  ok(dup.length === 0, cls + ' 的 inherit 不能重复占用', dup.join(','));

  /* 每个位都得有文案 */
  ok(list.every(s => s.title), cls + ' 每个位都要有标题');
  ok(list[4].no === 5, cls + ' 第 5 个位必须是职业核心');

  /* P1 对账：不许有孤儿（树上还在、动作条放不上） */
  const orphans = skillArchOrphans(cls);
  ok(orphans.length === 0, cls + ' 的现有技能必须全部有位接（孤儿 = 树上在、动作条放不上）', orphans.join(','));
  ok(skillArchInherit(cls).length === (SKILL_ORDER[cls] || []).length,
    cls + ' 的继承数要等于现有技能数', skillArchInherit(cls).length + '/' + (SKILL_ORDER[cls] || []).length);

  /* 反向查必须与正向一致（面板/存档迁移都靠它定位） */
  const rev = [];
  for (const id of (SKILL_ORDER[cls] || [])) {
    const no = skillArchSlotOf(cls, id);
    if (!no) rev.push(id);
    else if ((skillArchSlot(cls, no).inherit || []).indexOf(id) < 0) rev.push(id + '@' + no);
  }
  ok(rev.length === 0, cls + ' 的 skillArchSlotOf 必须与 inherit 双向一致', rev.join(','));
}

/* ⑤ 号位不可互换（拍板 #6）：刀客不产单位、道士产单位、法师是状态 */
const w5 = skillArchSlot('warrior', 5), m5 = skillArchSlot('mage', 5), t5 = skillArchSlot('taoist', 5);
ok(w5.unit === false, '刀客 ⑤ 不能产生独立单位', w5.unit);
ok(w5.forms && w5.forms.length === 3, '刀客 ⑤ 要有三种刀式', w5.forms && w5.forms.length);
ok(w5.finisher && w5.finisher.name === '断岳斩', '刀客 ⑤ 要有刃势终结技', w5.finisher && w5.finisher.name);
ok(w5.ultimate && w5.ultimate.name === '剑神降世', '刀客 ⑤ 终极是剑神降世（不召唤单位）');
ok(t5.unit === true, '道士 ⑤ 是召唤（限时单位）', t5.unit);
ok(/技能产物/.test(t5.note || ''), '道士 ⑤ 要写明「技能产物，非宠物」', t5.note);
ok(m5.isNew === true && m5.unit === false, '法师 ⑤ 是新做状态，不是召唤');
ok(m5.aura && m5.aura.mainElemOnly === true, '法师 ⑤ 只强化主元素');
ok(w5.title !== m5.title && m5.title !== t5.title && w5.title !== t5.title,
  '三个职业的 ⑤ 名字不能相同', [w5.title, m5.title, t5.title].join('/'));

/* 方案 §3.2 把 talisman 写进了法师 ①，实际是道士技能 —— 这里钉住修正 */
ok(skillArchInherit('mage').indexOf('talisman') < 0, '法师不能继承道士的符（talisman）');
ok(skillArchInherit('taoist').indexOf('talisman') >= 0, '符必须留在道士');

/* ---------------- 3. 1→10 台阶 ---------------- */
console.log('三、等级台阶');
const T = SKILL_TIERS;
ok(T.steps.length === 10, '基础台阶必须是 10 级', T.steps.length);
ok(T.steps.map(s => s.lv).join(',') === '1,2,3,4,5,6,7,8,9,10', '台阶等级 1~10 连续');
ok(T.baseMax === 10 && T.cap === 20, '基础上限 10、有效上限 20', T.baseMax + '/' + T.cap);
ok(T.steps[2].kind === 'count' && T.steps[6].kind === 'count', 'Lv3 / Lv7 是数量台阶');
ok(T.steps[4].kind === 'evo1' && T.steps[8].kind === 'evo2', 'Lv5 / Lv9 是进化台阶');
ok(T.steps[9].kind === 'final', 'Lv10 是终极形态');

/* 每两级必须有一次看得见的变化：可见台阶之间不能隔超过 2 级 */
const vis = T.visible;
ok(vis.slice().sort((a, b) => a - b).join(',') === '1,3,5,7,9,10', '可见台阶固定为 1/3/5/7/9/10', vis.join(','));
let maxGap = 0;
for (let i = 1; i < vis.length; i++) maxGap = Math.max(maxGap, vis[i] - vis[i - 1]);
ok(maxGap <= 2, '可见台阶间隔不能超过 2 级', maxGap);

/* 每个技能位的 6 个台阶文案都要有，且键只能是可见台阶 */
for (const cls of CLASSES) {
  for (const slot of skillArchList(cls)) {
    const keys = Object.keys(slot.tiers || {}).map(Number).sort((a, b) => a - b);
    ok(keys.join(',') === '1,3,5,7,9,10', cls + ' ⑤'.replace('⑤', slot.no + ' 号位') + ' 的台阶键不对', keys.join(','));
    const empty = keys.filter(k => !slot.tiers[k] || !String(slot.tiers[k]).trim());
    ok(empty.length === 0, cls + ' 第 ' + slot.no + ' 位有空台阶文案', empty.join(','));
    /* 同一位的台阶文案不能重复（复制粘贴最容易出的错） */
    const texts = keys.map(k => slot.tiers[k]);
    ok(new Set(texts).size === texts.length, cls + ' 第 ' + slot.no + ' 位台阶文案有重复');
  }
}

/* ---------------- 4. 倍率曲线 ---------------- */
console.log('四、分段倍率');
ok(skillLvMul(1) === 1, 'Lv1 倍率必须正好 1', skillLvMul(1));
ok(near(skillLvMul(5), 1.32), 'Lv5 = 1 + 4×8% = 1.32', skillLvMul(5));
ok(near(skillLvMul(10), 1.72), 'Lv10 = 1 + 9×8% = 1.72', skillLvMul(10));
ok(near(skillLvMul(15), 1.92), 'Lv15 = 1.72 + 5×4% = 1.92', skillLvMul(15));
ok(near(skillLvMul(20), 2.02), 'Lv20 = 1.92 + 5×2% = 2.02', skillLvMul(20));
ok(skillLvMul(20) < 2.2, '20 级不能超过 2.2 倍（旧的全程 8% 会到 2.52）', skillLvMul(20));
let mono = true;
for (let lv = 2; lv <= 20; lv++) if (skillLvMul(lv) < skillLvMul(lv - 1)) mono = false;
ok(mono, '倍率必须随等级单调不减');
ok(skillLvMul(0) === 1 && skillLvMul(-5) === 1, '越界低等级按 1 级算', skillLvMul(-5));
ok(near(skillLvMul(99), skillLvMul(20)), '超过 20 级按 20 级封顶', skillLvMul(99));
ok(skillTierStep(5).kind === 'evo1' && skillTierStep(11) === null, '台阶查询：5 级是进化Ⅰ，11 级属精通层');

/* ---------------- 5. 三线并行 ---------------- */
console.log('五、三线并行');
for (const cls of CLASSES) {
  const lines = skillLines(cls);
  ok(lines.length === 3, cls + ' 必须正好 3 条线', lines.length);
  ok(lines.map(l => l.name).join(',') === SKILL_TREE.layout[cls].map(t => t.name).join(','),
    cls + ' 线名必须与 layout 一致');
  ok(lines.every(l => l.nodes.length > 0), cls + ' 每条线都要有节点');

  for (const line of lines) {
    /* 每个节点都要有 reqLv / needPts，且是数字 */
    const badGate = line.nodes.filter(n => typeof n.reqLv !== 'number' || n.reqLv < 1 || typeof n.needPts !== 'number');
    ok(badGate.length === 0, cls + ' / ' + line.name + ' 有节点缺 reqLv 或 needPts', badGate.map(n => n.id).join(','));

    /* 软前置只给关键被动；其余节点 needPts 必须是 0（不许偷偷硬串行） */
    const wrongSoft = line.nodes.filter(n => (n.kind === 'key') !== (n.needPts > 0));
    ok(wrongSoft.length === 0, cls + ' / ' + line.name + ' 的 needPts 只应该出现在关键被动上',
      wrongSoft.map(n => n.id + ':' + n.needPts).join(','));

    const keys = line.nodes.filter(n => n.kind === 'key');
    ok(keys.length === 1, cls + ' / ' + line.name + ' 必须正好 1 个关键被动', keys.length);
    if (keys.length === 1) {
      ok(keys[0].needPts === SKILL_TREE.lineMeta.softNeedPts, '关键被动软前置 = ' + SKILL_TREE.lineMeta.softNeedPts,
        keys[0].needPts);
    }

    /* 没有硬前置：等级到位 + 该线点数够 → 一定能点，不需要先点任何节点 */
    for (const n of line.nodes) {
      const g = skillNodeGate(n.id, { level: n.reqLv, linePts: SKILL_TREE.lineMeta.softNeedPts });
      ok(g && g.ok === true, '节点 ' + n.id + ' 在等级/点数到位时必须可点（不许有硬前置）',
        g && JSON.stringify(g));
    }
  }
}

/* reqLv 的默认来源必须是主动技能的 unlock（单一事实来源，避免两处写歪） */
const thrustNode = skillLineNodeInfo('thrust');
ok(thrustNode && thrustNode.reqLv === SKILLS.thrust.unlock, '主动节点的 reqLv 必须等于 SKILLS[id].unlock',
  thrustNode && (thrustNode.reqLv + ' vs ' + SKILLS.thrust.unlock));
const passNode = skillLineNodeInfo('w_undying');
ok(passNode && passNode.kind === 'key', 'w_undying 必须被识别为关键被动', passNode && passNode.kind);
ok(passNode && passNode.reqLv === SKILLS.execute.unlock, '被动节点的 reqLv 跟随同岔口主动',
  passNode && (passNode.reqLv + ' vs ' + SKILLS.execute.unlock));

/* 门槛判定本身 */
const gLow = skillNodeGate('thrust', { level: SKILLS.thrust.unlock - 1, linePts: 0 });
ok(gLow.levelOK === false && gLow.ok === false, '不到级必须锁着', JSON.stringify(gLow));
const gSoft = skillNodeGate('w_undying', { level: 40, linePts: SKILL_TREE.lineMeta.softNeedPts - 1 });
ok(gSoft.ptsOK === false && gSoft.ok === false, '该线点数不够时关键被动不能点', JSON.stringify(gSoft));
const gOK = skillNodeGate('w_undying', { level: 40, linePts: SKILL_TREE.lineMeta.softNeedPts });
ok(gOK.ok === true, '点数够了就能点关键被动');
ok(skillNodeGate('not_a_node', { level: 40 }) === null, '未知节点返回 null');

/* 该线已投入点数 */
const spent = { whirl: 4, thrust: 1, w_bloodlust: 2 };
ok(skillLineSpent('warrior', '狂战', spent) === 7, '狂战线已投 7 点', skillLineSpent('warrior', '狂战', spent));
ok(skillLineSpent('warrior', '守护', spent) === 0, '没投的线是 0 点');
ok(skillLineSpent('warrior', '不存在', spent) === 0, '未知线返回 0');

/* ---------------- 6. P2 接线边界 ---------------- */
console.log('六、边界（技能条 5 格、等级台阶已接线）');
ok(SKILL_LV_MAX === 10, 'SKILL_LV_MAX = 10（P2 已升）', SKILL_LV_MAX);
ok(SKILL_TREE.lvMax === SKILL_LV_MAX, '技能树上限与 SKILL_LV_MAX 同源（不许两处各写一个数）',
  SKILL_TREE.lvMax);
ok(SKILL_TIERS.baseMax === SKILL_LV_MAX, '台阶表 baseMax 也要跟上', SKILL_TIERS.baseMax);
/* 旧的单一曲线必须删干净：留着就一定有人接着用，两套曲线必然对不上 */
ok(vm.runInContext('typeof SKILL_LV_STEP', ctx) === 'undefined',
  'SKILL_LV_STEP 已删除（每级加多少只认 skillLvMul）');
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const combatFiles = ['src/game.js', 'src/core/save.js'];
const wired = combatFiles.filter(f => readSrc(f).indexOf('skillLvMul') >= 0);
ok(wired.indexOf('src/game.js') >= 0, '战斗必须读 skillLvMul（castSkill 的等级倍率）', wired.join(','));
ok(readSrc('src/ui-skills.js').indexOf('skillLvMul') >= 0, '面板预览也必须读同一个函数');
ok(SKILL_BAR_SLOTS === 5, '动作条必须收敛到 5 格', SKILL_BAR_SLOTS);
const migrateWired = combatFiles.filter(f => readSrc(f).indexOf('skillBarMigrate') >= 0);
ok(migrateWired.length === 2, '战斗与存档都要用 skillBarMigrate（格位 = 功能位）', migrateWired.join(','));

/* 点数供给：等级 × 1.5，且必须够把 5 个技能位拉满 */
ok(SKILL_POINT_RATE === 1.5, '技能点供给倍率 = 1.5', SKILL_POINT_RATE);
ok(skillPointPool(1) === 1, '1 级 1 点（不白送）', skillPointPool(1));
ok(skillPointPool(40) === 60, '40 级 60 点', skillPointPool(40));
ok(skillPointPool(40) >= 5 * (SKILL_LV_MAX - 1), '40 级点数够把 5 个技能位全部拉满（45 点）',
  skillPointPool(40));
/* 又不能多到「点满整棵树」：否则取舍消失 */
{
  const full = SKILL_ORDER.warrior.length * (SKILL_LV_MAX - 1);
  ok(skillPointPool(40) < full, '40 级点数不许够点满全部技能（' + skillPointPool(40) + ' < ' + full + '）');
}

/* 展示侧反过来必须真的读了，否则「说明页跟着数据变」只是句空话 */
ok(readSrc('src/ui-skills.js').indexOf('SKILL_ARCHETYPE') >= 0, '术法面板要展示新版技能位');
ok(readSrc('src/ui-skills.js').indexOf('skArchHTML') >= 0, '面板里那块预览必须存在');
ok(readSrc('src/ui.js').indexOf('SKILL_ARCHETYPE') >= 0, '说明页要展示新版技能位');
ok(readSrc('src/ui.js').indexOf('SKILL_TIERS') >= 0, '说明页要展示等级台阶');

/* 旧接口必须还能用（P0 期间面板与战斗都还走它） */
const oldForkCount = SKILL_TREE.layout.warrior.reduce((n, t) => n + t.forks.length, 0);
ok(skillTreeForks('warrior').length === oldForkCount, '旧「岔口」接口仍然可用',
  skillTreeForks('warrior').length + ' vs ' + oldForkCount);
ok(skillForkOf('thrust') !== null, '旧 forkLock 判定仍然可用');

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P0 数据契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
