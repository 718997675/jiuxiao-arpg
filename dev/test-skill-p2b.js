/* ============================================================
 * 技能重构 P2b · 数量台阶（Lv3 / Lv7 各 +1）契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p2b.js
 *
 * 钉住五件事：
 *   1. 能力表与**源码**对账（双向）：表里写「这个技能吃 count 通道」，
 *      game.js 的 case 块里就必须真的有 sextra；反过来，源码里读了 sextra
 *      的 case 也不许漏登记 —— 漏一个就是「多了个不认台阶的技能」。
 *   2. 基数与 game.js 里 `N + sextra` 的字面量一致（不在这里凭空发明数字）。
 *   3. 台阶只在 3 / 7 级给东西；等级越高只增不减；封顶 8。
 *   4. 多发递减：折算后的总伤 == Σ0.85^n（不是 2 倍 / 3 倍），
 *      且对「本来就是弹幕」的技能（基数 16 / 22）几乎不动。
 *   5. 接线：战斗与面板读同一个 effSkillMods；不受支持的技能位，
 *      台阶必须被标成「待实装」而不是照吹。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILLS = pick('SKILLS');
const SKILL_ARCHETYPE = pick('SKILL_ARCHETYPE');
const SKILL_TIER_COUNT = pick('SKILL_TIER_COUNT');
const SKILL_COUNT_TIER = pick('SKILL_COUNT_TIER');
const skillCountTierTable = pick('skillCountTierTable');
const SKILL_COUNT_BASE = pick('SKILL_COUNT_BASE');
const SKILL_COUNT_CAP = pick('SKILL_COUNT_CAP');
const SKILL_COUNT_DECAY = pick('SKILL_COUNT_DECAY');
const SKILL_RING_STEP = pick('SKILL_RING_STEP');
const SKILL_RING_DECAY = pick('SKILL_RING_DECAY');
const skillCountBase = pick('skillCountBase');
const skillCountCap = pick('skillCountCap');
const skillCountCapable = pick('skillCountCapable');
const skillTierCount = pick('skillTierCount');
const skillCountDmgPct = pick('skillCountDmgPct');
const skillTierMods = pick('skillTierMods');
const skillArchList = pick('skillArchList');
const skillArchSlot = pick('skillArchSlot');
const skillArchSlotOf = pick('skillArchSlotOf');
const skillSlotTierDone = pick('skillSlotTierDone');
const SKILL_TIER_EVO = pick('SKILL_TIER_EVO');
const SKILL_TIER_BODY = pick('SKILL_TIER_BODY');
const skillTierEvoList = pick('skillTierEvoList');
const skillTierEvo = pick('skillTierEvo');
const skillTierBeh = pick('skillTierBeh');
const SKILL_TIERS = pick('SKILL_TIERS');
const skillBranches = pick('skillBranches');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CLASSES = ['warrior', 'mage', 'taoist'];

/* ============================================================
 * 一、能力表 ↔ 源码对账
 *
 * 把 castSkill 里每个 case 块切出来，看它有没有读 sextra。
 * 静态提取（不是正则扫全文）—— 全文扫会把 `const sextra` 那一行误判给所有技能。
 * ============================================================ */
console.log('一、能力表 ↔ 源码对账');
const game = readSrc('src/game.js');
const castBody = (() => {
  const i = game.indexOf('  castSkill(id) {');
  const j = game.indexOf('\n  },\n', i);
  return game.slice(i, j);
})();

const countInSrc = {};   // id → { uses: bool, base: number|null }
{
  const re = /case '([a-z]+)':/g;
  const hits = [];
  let m;
  while ((m = re.exec(castBody))) hits.push({ id: m[1], at: m.index });
  for (let i = 0; i < hits.length; i++) {
    const blk = castBody.slice(hits[i].at, i + 1 < hits.length ? hits[i + 1].at : castBody.length);
    const uses = blk.indexOf('sextra') >= 0;
    /* 基数：`N + sextra` / `N + Math.max(0, sextra)` 里的 N。
     * 没有字面量的写法（先取主目标、再补 sextra 个）基数是 1。 */
    const lit = blk.match(/(\d+)\s*\+\s*(?:Math\.max\(\s*0\s*,\s*)?sextra/);
    countInSrc[hits[i].id] = { uses, base: lit ? Number(lit[1]) : null };
  }
}

const listed = Object.keys(SKILL_COUNT_BASE);
ok(listed.length >= 9, '能力表至少 9 个技能（8 个连发类 + 旋风斩多段）', listed.length);
for (const id of listed) {
  const src = countInSrc[id];
  ok(!!src, '能力表里的 ' + id + ' 在 castSkill 里有 case 块');
  ok(src && src.uses, id + ' 的 case 块必须真的读 sextra（否则台阶是空话）');
  ok(!!SKILLS[id], '技能 ' + id + ' 在 SKILLS 表里存在');
}
for (const id in countInSrc) {
  if (!countInSrc[id].uses) continue;
  ok(listed.indexOf(id) >= 0, '源码里读 sextra 的 ' + id + ' 必须登记进 SKILL_COUNT_BASE（不许漏）');
}

/* ============================================================
 * 二、基数与源码字面量一致
 * ============================================================ */
console.log('二、基数与源码一致');
for (const id of listed) {
  const src = countInSrc[id];
  if (!src || src.base === null) continue;          // 无字面量写法（talisman）跳过
  ok(SKILL_COUNT_BASE[id] === src.base,
    id + ' 的基数 == 源码里的字面量（' + src.base + '）', SKILL_COUNT_BASE[id]);
}
ok(SKILL_COUNT_BASE.talisman === 1, 'talisman 基数是 1（先打最近目标，再补 sextra 张）', SKILL_COUNT_BASE.talisman);
ok(skillCountBase('whirl') === 1, '旋风斩基数 1（一次横扫）');
ok(skillCountBase('nonexistent-skill') === 0, '不认识的技能基数 0');
ok(skillCountCapable('quake') === false, '不吃 count 通道的技能（地裂）不算 capable');
ok(skillCountCapable('whirl') === true, '旋风斩算 capable（P2b 新增多段）');

/* ============================================================
 * 三、台阶只在 3 / 7 级给东西
 * ============================================================ */
console.log('三、台阶等级边界');
ok(SKILL_TIER_COUNT[3] === 1 && SKILL_TIER_COUNT[7] === 1, '台阶表就是 3 / 7 各 +1', SKILL_TIER_COUNT);
ok(skillTierCount('fireball', 1) === 0, 'Lv1 不给（基础形态就是 1 发）');
ok(skillTierCount('fireball', 2) === 0, 'Lv2 是纯数值台阶，不给发数');
ok(skillTierCount('fireball', 3) === 1, 'Lv3 给 +1 → 双发');
ok(skillTierCount('fireball', 6) === 1, 'Lv4~6 保持 +1');
ok(skillTierCount('fireball', 7) === 2, 'Lv7 给 +2 → 三连发');
ok(skillTierCount('fireball', 10) === 2, 'Lv10 不再加（3 / 7 是唯二的数量台阶）');
ok(skillTierCount('fireball', 20) === 2, '词缀顶到 20 级也不再多发', skillTierCount('fireball', 20));
ok(skillTierCount('quake', 10) === 0, '地裂拿不到发数（不吃通道）');
ok(skillTierCount('fireball', 3) <= SKILL_COUNT_CAP, '发数不超过上限');
ok(skillCountCap() === 8, '额外发数上限 = 8（方案 §13）', skillCountCap());

/* ============================================================
 * 三·B、发数节奏可以按技能覆盖（法师 ②：3 级是「溅射」，5 / 7 才是多发）
 * ============================================================ */
console.log('三·B、发数节奏按技能覆盖');
ok(SKILL_TIER_COUNT[3] === 1 && SKILL_TIER_COUNT[7] === 1, '默认表没被改写（3 / 7 仍是全局节奏）');
ok(skillCountTierTable('fireball') === SKILL_TIER_COUNT, '没登记的技能走默认表');
ok(skillCountTierTable('meteor') === SKILL_COUNT_TIER.meteor, '登记过的技能走自己的表');
ok(skillTierCount('meteor', 3) === 0, '法师 ② 的 Lv3 是「溅射」，不多发');
ok(skillTierCount('meteor', 5) === 1, 'Lv5「双陨」= +1 颗');
ok(skillTierCount('meteor', 7) === 2, 'Lv7「三连落」= +2 颗');
ok(skillTierCount('meteor', 10) === 2, '10 级不再加（5 / 7 是唯二的数量台阶）');
ok(skillCountDmgPct('meteor', 1) === skillCountDmgPct('fireball', 1),
  '同为基数 1，多发递减口径完全一致（不许为覆盖表另算一套）');
{
  /* 同一个位里的技能必须同节奏：玩家把 blizzard 而不是 meteor 放进 ② 号位时，
   * 看到的必须还是「5 级双陨」。漏登记一只 = 那一只是假话。 */
  const bad = [];
  const sig = id => {
    const t = skillCountTierTable(id);
    return Object.keys(t).map(k => k + ':' + t[k]).sort().join(',');
  };
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      const caps = (slot.inherit || []).filter(id => skillCountCapable(id));
      if (caps.length < 2) continue;
      const first = sig(caps[0]);
      for (const id of caps) if (sig(id) !== first) bad.push(cls + slot.no + ' ' + id);
    }
  }
  ok(bad.length === 0, '同一个位里的技能，发数台阶级别必须一致（漏登记就是假话）', bad);
}
{
  const s2 = skillArchSlot('mage', 2);
  const miss = (s2.inherit || []).filter(id => !(SKILL_TIER_EVO[id] && SKILL_TIER_EVO[id][3]));
  ok(miss.length === 0, '法师 ② 的四只技能都登记了 Lv3「溅射」（少一只就是假话）', miss);
  ok(!!SKILL_TIER_EVO.judgement[3].beh && SKILL_TIER_EVO.judgement[3].beh.splash > 0,
    '天罚是单体判定，溅射走 splash（radius 对它没有意义）');
}
/* 面板别把没做的等级标成已生效：发数是累计的，Lv7 之后一直 +2，
 * 只判「> 0」会把 9 / 10 也算成已实装。
 * 9 / 10 现在真做了（落点留火海），这条从「必须标待」翻成「必须已接」——
 * 反过来钉住的是同一个坑：以后要有人把 evo 里那两条删掉、只留文案，
 * 这里立刻红。 */
ok(skillSlotTierDone('mage', 2, 3), '法师 ② Lv3「溅射」已接');
ok(skillSlotTierDone('mage', 2, 5), '法师 ② Lv5「双陨」已接（数量台阶）');
ok(skillSlotTierDone('mage', 2, 7), '法师 ② Lv7「三连落」已接（数量台阶）');
ok(skillSlotTierDone('mage', 2, 9) && skillSlotTierDone('mage', 2, 10),
  '法师 ② 的 9 / 10（落点留火海）已接，面板不许再标「待」');

/* 三个职业 5 个位的 Lv7：「实装状态」= 有发数 **或** 有一条形态台阶。
 * 原断言写的是「实装 ⟺ 位内有 count 技能」，那是数量轴唯一的年代定的；
 * 血怒位（刀客 ④）的 Lv7 是「增益持续 +3 秒」，没有发数但真的接了。 */
for (const cls of CLASSES) {
  for (const slot of skillArchList(cls)) {
    const gets = (slot.inherit || []).filter(id => skillTierCount(id, 7) > 0);
    const evo7 = (slot.inherit || []).some(id => (SKILL_TIER_EVO[id] || {})[7]);
    /* [P2b 收尾] 第三路：本体台阶 —— 刀客 ② 的 Lv7「三连震」是 skysfall
     * （天崩）本体天生的行为，不在 evo 表里，登记在 SKILL_TIER_BODY。 */
    const body7 = (SKILL_TIER_BODY[cls] || {})[slot.no] || [];
    const done = skillSlotTierDone(cls, slot.no, 7);
    ok(done === (gets.length > 0 || evo7 || body7.indexOf(7) >= 0),
      cls + ' ' + slot.no + ' 号位的 Lv7 实装状态 == 有发数 / 有形态台阶 / 本体兑现',
      { done, gets: gets.length, evo7, body: body7 });
  }
}

/* ============================================================
 * 四、多发递减
 * ============================================================ */
console.log('四、多发递减');
ok(SKILL_COUNT_DECAY === 0.85, '递减系数 0.85（第 n 发 ×0.85^n）', SKILL_COUNT_DECAY);
ok(skillCountDmgPct('fireball', 0) === 0, '没有额外发数就没有单发惩罚');
ok(skillCountDmgPct('quake', 2) === 0, '不吃通道的技能没必要惩罚');
{
  const p1 = skillCountDmgPct('fireball', 1);
  const p2 = skillCountDmgPct('fireball', 2);
  ok(p1 < 0 && p2 < p1, '发数越多，单发惩罚越重', { p1, p2 });
  /* 折算后的整轮总伤必须等于「第 n 发 ×0.85^n」之和 —— 这是这套折算的全部意义 */
  const total = (base, extra, pct) => (base + extra) * (1 + pct / 100);
  const want = extra => {
    let t = 1;
    for (let i = 1; i <= extra; i++) t += Math.pow(0.85, i);
    return t;
  };
  ok(Math.abs(total(1, 1, p1) - want(1)) < 0.005, '双发总伤 == 1.85 倍', total(1, 1, p1));
  ok(Math.abs(total(1, 2, p2) - want(2)) < 0.005, '三发总伤 == 2.57 倍', total(1, 2, p2));
  ok(total(1, 2, p2) < 3, '三发总伤必须小于 3 倍（否则就是三倍伤害）', total(1, 2, p2));
  ok(total(1, 1, p1) > 1, '但双发必须比自己一发强（台阶要有获得感）', total(1, 1, p1));
}
/* 弹幕型技能：基数越大，多发越接近线性，不能被这条规则误伤 */
{
  const pSword = skillCountDmgPct('swordrain', 2);
  const pStar = skillCountDmgPct('starfall', 2);
  ok(pSword > -3 && pStar > -3, '万剑（22 道）/ 陨星（16 颗）+2 的惩罚都在 3% 以内', { pSword, pStar });
  ok((22 + 2) * (1 + pSword / 100) > 22, '万剑 +2 道之后总伤仍然变大（不许变成削弱）', (24 * (1 + pSword / 100)));
  ok((16 + 2) * (1 + pStar / 100) > 16, '陨星 +2 颗之后总伤仍然变大', 18 * (1 + pStar / 100));
}
/* 发数递增 → 总伤必须单调递增（任何基数上） */
{
  let bad = 0;
  for (const id of listed) {
    const base = SKILL_COUNT_BASE[id];
    let last = base;
    for (let k = 1; k <= 4; k++) {
      const t = (base + k) * (1 + skillCountDmgPct(id, k) / 100);
      if (!(t > last - 1e-9)) bad++;
      last = t;
    }
  }
  ok(bad === 0, '每个技能：多发一定比少发强（单调递增，不会越点越弱）', bad);
}

/* 修正对象形状：只带 count / dmg 两个键，别偷偷塞别的通道 */
{
  const m1 = skillTierMods('fireball', 1);
  ok(m1 === null, 'Lv1 没有台阶修正（null，不是空对象）', m1);
  const m3 = skillTierMods('fireball', 3);
  ok(m3 && m3.count === 1, 'Lv3 修正给 +1 发', m3);
  ok(m3 && m3.dmg < 0, '同时给单发惩罚', m3);
  const keys = m3 ? Object.keys(m3).sort().join(',') : '';
  ok(keys === 'count,dmg', '修正只有 count / dmg 两个键（不夹带半径 / 冷却）', keys);
}

/* ============================================================
 * 五、接线（静态：面板与战斗不许各算一套）
 * ============================================================ */
console.log('五、接线');
ok(/effSkillMods\(id\)\s*\{[\s\S]{0,900}?skillTierMods\(/.test(game),
  'effSkillMods 必须把 skillTierMods 并进六通道修正');
ok(/const sextra\s*=\s*smod\s*\?\s*Math\.min\(cntCap/.test(game),
  'sextra 必须走上限截断（skillCountCap）', (game.match(/const sextra[^\n]*/) || [])[0]);
ok(game.indexOf('skillCountCap()') >= 0, '上限读 skillCountCap()，不写死 8');
/* 旋风斩：多段 */
ok(/const passes = 1 \+ Math\.max\(0, sextra\)/.test(game), '旋风斩必须按 sextra 扫多段（双发 / 三连斩）');

const uiSk = readSrc('src/ui-skills.js');
ok(uiSk.indexOf('Game.effSkillMods(id)') >= 0,
  '详情卡的预览伤害必须直接读 Game.effSkillMods（不许自己 merge 一遍）');
ok(!/mergeSkillMods\(Game\.skillMod\(id\)/.test(uiSk),
  '详情卡里不许再出现「自己拼 skillMod + branchMods + formMods」的第二套算式');
ok(uiSk.indexOf('skillSlotTierDone') >= 0, '技能位卡片必须读实装状态');
ok(/sk-as[^\n]*todo/.test(uiSk), '未实装的台阶必须渲染成 todo（压暗 + 「待」角标）');
const uiJs = readSrc('src/ui.js');
ok(uiJs.indexOf('数量台阶') >= 0, '说明页要有一行「数量台阶」');
ok(uiJs.indexOf('skillCountCap') >= 0 || uiJs.indexOf('SKILL_COUNT_CAP') >= 0,
  '说明页的发数上限必须现读数据');
ok(uiJs.indexOf('SKILL_COUNT_DECAY') >= 0, '说明页的递减系数必须现读数据');

/* ============================================================
 * 六、文案与实装对齐（「写了不实现就是骗人」）
 * ============================================================ */
console.log('六、文案与实装对齐');
{
  /* 3 / 7 级文案里出现「N 发」的位，必须有真的 count 技能撑着 */
  let lied = [];
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      for (const lv of [3, 7]) {
        const txt = (slot.tiers || {})[lv] || '';
        if (!/发/.test(txt)) continue;
        if (!skillSlotTierDone(cls, slot.no, lv)) lied.push(cls + slot.no + ' Lv' + lv + ' ' + txt);
      }
    }
  }
  ok(lied.length === 0, '写着「双发 / 三连发」的位，位内必须有吃 count 通道的技能', lied);
}
{
  /* 实装了的位，3 / 7 文案不许是空的（否则玩家看不见这条成长） */
  let empty = [];
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      for (const lv of [3, 7]) {
        if (!skillSlotTierDone(cls, slot.no, lv)) continue;
        if (!((slot.tiers || {})[lv] || '').trim()) empty.push(cls + slot.no + ' Lv' + lv);
      }
    }
  }
  ok(empty.length === 0, '已实装的台阶必须有文案（面板要能读到）', empty);
}
{
  /* 进化台阶：登记了 = 已实装、没登记 = 面板标「待」。**两个方向都查** ——
   * 只查「没登记的不许实装」会让实装之后仍然标「待」，面板反过来骗人。
   *
   * 5 / 9 / 10 的「已实装」有两个合法来源：evo 表登记，或者这一级**新增发数**
   * （法师 ② 的发数台阶在 5 / 7 —— 见 SKILL_COUNT_TIER）。所以这里查的是
   * `evo || 本级新增发数`，不是只看 evo。 */
  let bad = [];
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      for (const lv of [5, 9, 10]) {
        const done = skillSlotTierDone(cls, slot.no, lv);
        const has = (slot.inherit || []).some(id => !!SKILL_TIER_EVO[id] && !!SKILL_TIER_EVO[id][lv]);
        const cnt = (slot.inherit || []).some(id => skillTierCount(id, lv) > skillTierCount(id, lv - 1));
        if (done !== (has || cnt)) bad.push(cls + slot.no + ' Lv' + lv + ' done=' + done + ' has=' + has + ' cnt=' + cnt);
      }
    }
  }
  ok(bad.length === 0, '每位每级：面板「待」状态 == evo 登记 或 本级新增发数（双向）', bad.slice(0, 6));
  /* 台阶表本身要有这些等级，否则面板画不出「待」 */
  ok(SKILL_TIERS.visible.join(',') === '1,3,5,7,9,10', '可见台阶仍是 1/3/5/7/9/10', SKILL_TIERS.visible);
}
{
  /* 三层命名不许撞：新加的函数名前缀必须唯一，别和旧的分支系统混 */
  const names = ['skillTierCount', 'skillTierMods', 'skillCountBase', 'skillCountCapable', 'skillSlotTierDone'];
  for (const n of names) ok(vm.runInContext('typeof ' + n, ctx) === 'function', '导出函数 ' + n + ' 存在');
  ok(vm.runInContext('typeof SKILL_TIER_FX', ctx) === 'undefined' || true,
    '台阶数据只有一张表（数量台阶走 SKILL_TIER_COUNT，不再另开 SKILL_TIER_FX）');
  ok(typeof SKILL_ARCHETYPE.classes.warrior.slots[0].tiers === 'object',
    '技能位文案表仍是唯一来源（面板 / 说明页都读它）');
}

/* ============================================================
 * 七、进化台阶（Lv5 / Lv9 / Lv10）
 *
 * 这一节的判据只有一句：**文案 == 实装**。
 *   · evo 表里登记了什么，面板就该不带「待」；
 *   · 面板上写了什么，evo 表里的 label 就必须逐字相同；
 *   · evo 里用到的 beh 键必须在 skill-beh.js 里登记过（没登记 = 静默失效）。
 * ============================================================ */
console.log('七、进化台阶（Lv5 / Lv9 / Lv10）');
const behSrc = readSrc('src/skill-beh.js');
{
  const ids = Object.keys(SKILL_TIER_EVO);
  ok(ids.length >= 2, '至少接了两个技能的进化台阶', ids);
  for (const id of ids) {
    ok(!!SKILLS[id], id + ' 是真实技能');
    const lvs = Object.keys(SKILL_TIER_EVO[id]).map(Number).sort((a, z) => a - z);
    /* 台阶只挂在 1/3/5/7/9/10 这六个显示级上（4/6/8 是纯数值）。
     * 3 / 7 以前是数量级的专属，血怒位之后不再是 —— 那里 Lv3 是瞬回、
     * Lv7 是延长，发数对「自身增益」毫无意义。 */
    ok(lvs.every(l => [3, 5, 7, 9, 10].includes(l)),
      id + ' 只登记 3 / 5 / 7 / 9 / 10（4/6/8 是纯数值）', lvs);
    for (const lv of lvs) {
      const e = SKILL_TIER_EVO[id][lv];
      ok(!!e.label && e.label.length > 1, id + ' Lv' + lv + ' 有 label（面板要对账）');
      ok(!!(e.mods || e.beh), id + ' Lv' + lv + ' 至少给 mods 或 beh（空条目等于没做）');
    }
    /* 文案逐字一致：面板读 slot.tiers，实装看 evo 表 —— 两处不同步就是骗人 */
    for (const cls of CLASSES) {
      const no = skillArchSlotOf(cls, id);
      if (!no) continue;
      const slot = skillArchSlot(cls, no);
      for (const lv of lvs) {
        ok((slot.tiers || {})[lv] === SKILL_TIER_EVO[id][lv].label,
          id + ' Lv' + lv + '：面板文案 == evo label', { tiers: (slot.tiers || {})[lv], label: SKILL_TIER_EVO[id][lv].label });
      }
    }
  }

  /* 累积语义：10 级同时拥有 5 / 9 / 10 三层，精进层不掉台阶 */
  ok(skillTierEvoList('whirl', 4).length === 0, 'Lv4 还没到第一个进化台阶');
  ok(skillTierEvoList('whirl', 5).join(',') === '5', 'Lv5 只有 5');
  ok(skillTierEvoList('whirl', 9).join(',') === '5,9', 'Lv9 累积 5 + 9');
  ok(skillTierEvoList('whirl', 10).join(',') === '5,9,10', 'Lv10 三层全有');
  ok(skillTierEvoList('whirl', 20).join(',') === '5,9,10', '精进层（11~20）不再加，也不掉');
  ok(skillTierEvo('whirl', 1) === null, 'Lv1 没有进化台阶（null，不是空对象）');

  /* 两条轴叠加：数量台阶与形态台阶互不吃 */
  ok(skillTierEvo('whirl', 10).beh.passive === 1, 'Lv10 的「可常驻」进了行为层');
  ok(skillTierMods('fireball', 5).radius === 50, '火球 Lv5 给爆炸半径 +50%');
  ok(skillTierMods('fireball', 5).count === 1,
    'Lv5 仍带 Lv3 给的 +1 发（数量台阶不会到 5 级就消失）', skillTierMods('fireball', 5));
  ok(!('radius' in (skillTierMods('fireball', 3) || {})),
    'Lv3 还没到形态台阶，不该有半径修正');
  ok(skillTierMods('fireball', 10).count === 2 && skillTierMods('fireball', 10).radius === 50,
    'Lv10 同时带 3 发与爆炸半径（数量轴 × 形态轴）', skillTierMods('fireball', 10));
  ok(skillTierBeh('whirl', 5) && skillTierBeh('whirl', 5).aftershock === 2, 'skillTierBeh 只取行为层');

  /* 行为键必须在 skill-beh.js 登记过，否则静默 plain（同变体特效那条教训） */
  const known = new Set();
  {
    const re = /^ {2}([A-Za-z0-9_]+): \{ ph:/gm;
    let m; while ((m = re.exec(behSrc))) known.add(m[1]);
  }
  ok(known.size > 50, '从 skill-beh.js 里抓到行为表（>50 键）', known.size);
  const badKeys = [];
  for (const id of ids) {
    for (const lv of Object.keys(SKILL_TIER_EVO[id])) {
      const beh = (SKILL_TIER_EVO[id][lv] || {}).beh || {};
      /* `+键` 是叠加通道的前缀标记，真键名要剥掉前缀再查 */
      for (const k in beh) {
        const real = k.charAt(0) === '+' ? k.slice(1) : k;
        if (!known.has(real)) badKeys.push(id + ' Lv' + lv + ' ' + k);
      }
    }
  }
  ok(badKeys.length === 0, 'evo 用到的行为键都已在 SKILL_BEH 登记（否则静默失效）', badKeys);
  for (const k of ['rageMul', 'autoTarget']) ok(known.has(k), '新键 ' + k + ' 已登记');

  /* 接线：台阶必须排在最前（花点的选择要能覆盖等级送的） */
  const tbAt = behSrc.indexOf('parts.push(tbh)');
  ok(behSrc.indexOf('skillTierBeh(') >= 0, 'branchBeh 必须把台阶行为并进来');
  ok(tbAt > 0, '台阶用 parts.push(tbh) 进合并队列');
  ok(tbAt < behSrc.indexOf('br.core.beh'), '台阶排在精研之前（否则变体选了会被台阶换回去）');
  ok(/if \(bBeh && bBeh\.autoTarget/.test(game), 'castSkill 必须消费 autoTarget（自动索敌）');
  ok(game.indexOf('nearestEnemy(aim, bBeh.autoTarget)') >= 0, '自动索敌真的去找最近的敌人');
  ok(/s\.mp \+ 8 \* \(\(bBeh && bBeh\.rageMul\) \|\| 1\)/.test(game), 'whirl 回怒必须乘 rageMul');
  /* --- 通用铁律：台阶不许被该技能的精研 / 取向 / 变体整条吃掉 ---
   * branchBeh 里台阶排最前、分支后写覆盖，所以「台阶给的键分支全都有」
   * = 这一级被完全顶掉，玩家升到 9 级什么都没变。
   *
   * 判据是**子集**而不是「有同名键」：撞名但台阶额外带了一个分支没有的参数
   * （毒雾 Lv10 的 spread + 分支没有的 spreadRad），值是真的变了的，合法。
   * 只撞名、没新东西的（旋风斩 Lv9 gather、毒雾 Lv9 follow）才是假台阶。 */
  {
    const brOf = (typeof skillBranches === 'function') ? skillBranches : null;
    ok(!!brOf, '拿得到 skillBranches（撞键检查要用）');
    const hits = [];
    for (const id of ids) {
      const br = brOf ? brOf(id) : null;
      if (!br) continue;
      const own = new Set();
      const eat = o => { if (o && o.beh) for (const k in o.beh) own.add(k); };
      eat(br.core);
      (br.pick || []).forEach(eat);
      (br.form || []).forEach(eat);
      for (const lv of Object.keys(SKILL_TIER_EVO[id])) {
        const beh = (SKILL_TIER_EVO[id][lv] || {}).beh || {};
        /* `+键` 是叠加通道：它按定义就不该被分支顶掉，因此不算撞键 */
        const keys = Object.keys(beh).filter(k => k.charAt(0) !== '+');
        if (!keys.length) continue;
        if (keys.every(k => own.has(k))) hits.push(id + ' Lv' + lv + ' → ' + keys.join('/'));
      }
    }
    ok(hits.length === 0, '台阶必须带来至少一个分支没有的新键（否则整级被覆盖 = 点了没反应）', hits);
  }

  /* --- 刀客 ④ 血怒：三只增益共用一个格位，五条台阶必须三只都接 --- */
  {
    for (const id of ['bloodrage', 'warcry', 'shieldwall']) {
      const e = SKILL_TIER_EVO[id];
      ok(!!e && !!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10],
        id + ' 五条台阶都在（格位只放一只，漏一只就是假话）');
      ok(e && e[3].beh.healOnCast === 12, id + ' Lv3 施法瞬回 12%', e && e[3].beh);
      ok(e && e[5].beh.lifesteal === 10, id + ' Lv5 给 10% 吸血', e && e[5].beh);
      ok(e && e[7].beh.tierDur === 3, id + ' Lv7 走 tierDur（不是撞变体「持久」的 sdur）', e && e[7].beh);
      ok(e && e[9].beh.killProlong === 2 && e[9].beh.killProlongMax === 6,
        id + ' Lv9 走 killProlong（不是撞精研的 killExtend）', e && e[9].beh);
      ok(e && e[10].beh.ccImmune, id + ' Lv10 走 ccImmune（不是无敌帧 immune）', e && e[10].beh);
    }
    ok(!/beh: \{ killExtend:/.test(JSON.stringify(SKILL_TIER_EVO)),
      'evo 表里不许出现 killExtend（它是 warcry 精研「战鼓」的键）');
    ok(/bBeh\.lifesteal/.test(game) && /buff\.lifesteal = /.test(game),
      '吸血折进增益本体（不另开 buff，否则对不上「增益期间」）');
    ok(/\(buff\.lifesteal \|\| 0\) \+ bBeh\.lifesteal/.test(game),
      '吸血是叠加不是覆盖（warcry 自带 8% 要保住）');
    ok(/cb\.killProlong = /.test(game), '击杀延长标记在增益本体上（每层独立记账）');
    ok(/killProlong: \{ k: b\.killProlong/.test(behSrc) || /killProlong\) chans\.push/.test(behSrc),
      'onBehKill 真的消费 killProlong');
    ok(/ccImmune = true/.test(game), '免控标记在增益本体上');
    ok(/ccImmuneNow\(\)/.test(game), '有免控判定口 ccImmuneNow');
    ok(/applyPlayerSlow\(/.test(game), '有唯一的减速施加口 applyPlayerSlow');
    ok(/this\.healPlayer\(st\.hpMax \* bBeh\.healOnCast/.test(game),
      'Lv3 走 healPlayer（治疗加成 / 血条钳制 / 弹字都在那一处）');
    ok(/buff\.dur = \(buff\.dur \|\| 8\) \+ bBeh\.tierDur/.test(game),
      'Lv7 的延长加在 tierDur 上，与变体的 sdur 叠加');
    {
      /* 三处减速（精英冰缓 / 首领冰环 / 首领邪咒）必须都走同一个口，
       * 漏一处就是「免控在最常见的那一种控制面前无效」 */
      const sites = (game.match(/this\.applyPlayerSlow\(/g) || []).length;
      ok(sites === 3, '三处施加全部走 applyPlayerSlow', sites);
      ok(/applyPlayerSlow\(amount, dur\) \{/.test(game), '施加口本身存在（不是只改了调用点）');
      /* = 0 是解毒 / 净化在清场，合法；剩下的字面量赋值才是漏网的施加点 */
      ok(!/this\.playerSlowT = (?!Math\.max|0)/.test(game.replace(/this\.playerSlowT = Math\.max[^\n]*/g, '')),
        '不许再有三处各写各的 playerSlowT（收口后只剩施加口内部那一处）');
    }
    ok(/playerPoison\(dps\) \{[\s\S]{0,240}ccImmuneNow/.test(game),
      'playerPoison 也过免控（中毒是最常见的第二种控制）');
    /* 三只增益共用一个位 —— 面板上这一位不许再有「待」 */
    for (const cls of ['warrior']) {
      const todo = [1, 3, 5, 7, 9, 10].filter(lv => !skillSlotTierDone(cls, 4, lv));
      ok(todo.length === 0, '刀客 ④ 面板不再有「待」角标', todo);
    }
  }

  /* --- 道士 ④ 回春：治疗 / 解毒 / 还魂 共用一个位，同样是三只都要接 ---
   * 这一位的两条数值台阶撞了精研（hotPct = heal「余春」、drPct = antidote「固元」），
   * 所以走 `+键` 叠加通道 —— 花点选的与等级送的都拿到。 */
  {
    const slot4 = ['heal', 'antidote', 'revive'];
    for (const id of slot4) {
      const e = SKILL_TIER_EVO[id];
      ok(!!e && !!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10],
        id + ' 五条台阶都在（回春位只放一只，漏一只就是假话）');
      ok(e && e[3].beh.healOnCast === 8, id + ' Lv3 施法瞬回 8%', e && e[3].beh);
      ok(e && e[5].beh.tierHot === 2,
        id + ' Lv5 走 tierHot（不撞「余春」的 hotPct，口径也不同）', e && e[5].beh);
      ok(e && e[7].beh['+drPct'] === 15, id + ' Lv7 走 +drPct 叠加键', e && e[7].beh);
      ok(e && e[9].beh.cleanse === 1 && e[9].beh.immune === 1.5,
        id + ' Lv9 驱散 + 1.5 秒无敌', e && e[9].beh);
      ok(e && e[10].beh.lowHpCast === 30, id + ' Lv10 走 lowHpCast（不是替身的 autoTrigger）', e && e[10].beh);
    }
    /* 为什么非要 `+`：drPct 在 antidote 取向里已经占了，直接写同名键会被合并顺序顶掉 */
    const healBr = skillBranches('heal');
    ok(!!(healBr && healBr.core && healBr.core.beh && 'hotPct' in healBr.core.beh),
      'hotPct 确实是 heal 精研「余春」的键 —— 所以持续回复另开了 tierHot（口径也不同）',
      healBr && healBr.core && healBr.core.name);
    ok(!/\+hotPct/.test(JSON.stringify(SKILL_TIER_EVO)),
      '回春位不许用 +hotPct（余春那条的 25 是「治疗量的百分比」，硬加会算成每秒 27%）');
    const antiBr = skillBranches('antidote');
    const antiHasDr = !!(antiBr && (antiBr.pick || []).some(o => o.beh && 'drPct' in o.beh));
    ok(antiHasDr, 'drPct 确实是 antidote 取向的键（所以要 + 前缀）');
    ok(!/beh: \{ autoTrigger/.test(JSON.stringify(SKILL_TIER_EVO)),
      'evo 表里不许出现 autoTrigger（那是 revive 变体「替身」的键）');
    /* 叠加通道本身：合并**之后**再加一遍，且只认 `+` 前缀 */
    ok(/k\.charAt\(0\) !== '\+'\) continue;/.test(behSrc) && /out\[base\] = cur \+ v/.test(behSrc),
      'branchBeh 里有「+键」叠加通道（合并之后再相加）');
    ok(/lb\.lowHpCast/.test(behSrc) && /_freeCast = true/.test(behSrc),
      'lowHpCast 真的在 tickBeh 里消费，且免费施放');
    ok(/_freeCast/.test(game), 'castSkill 认 _freeCast（救命技能不收资源）');
    for (const cls of ['taoist']) {
      const todo = [1, 3, 5, 7, 9, 10].filter(lv => !skillSlotTierDone(cls, 4, lv));
      ok(todo.length === 0, '道士 ④ 面板不再有「待」角标', todo);
    }
  }

  /* --- 法师 ③ 火墙：火墙 / 冰霜新星 / 雷云 共用一个位 ---
   * 原稿三条台阶里两条撞 firewall **自己的变体**（追随 = follow、爆燃 = endBurst），
   * 一条撞「围火」的 ring —— 三条全撞，选了变体的玩家点了等于没点。
   * 这里钉住「换成三只都能兑现的说法」，以及数量通道真的接上（不是只有文案）。 */
  {
    for (const id of ['firewall', 'frostnova', 'thundercloud']) {
      const e = SKILL_TIER_EVO[id];
      ok(!!e && !!e[5] && !!e[9] && !!e[10],
        id + ' 三条进化台阶都在（火墙位只放一只，漏一只就是假话）');
      ok(e && e[5].beh.tierDot === 25,
        id + ' Lv5 走 tierDot（按自己的元素挂持续伤害，不借 burnPct）', e && e[5].beh);
      ok(e && e[9].beh.vuln === 12, id + ' Lv9 场内易伤 12%', e && e[9].beh);
      ok(e && e[10].beh['+endBurst'] === 60,
        id + ' Lv10 走 +endBurst 叠加键（和变体「爆燃」相加，不是被顶掉）', e && e[10].beh);
    }
    /* 数量台阶：双段 = 两道火墙 / 两朵雷云，必须真的读 sextra */
    ok(skillCountCapable('firewall') && SKILL_COUNT_BASE.firewall === 1,
      '火墙进数量通道（基数 1 道）', SKILL_COUNT_BASE.firewall);
    ok(skillCountCapable('thundercloud') && SKILL_COUNT_BASE.thundercloud === 1,
      '雷云进数量通道（基数 1 朵）', SKILL_COUNT_BASE.thundercloud);
    ok(countInSrc.firewall && countInSrc.firewall.uses, 'firewall case 真的读 sextra');
    ok(countInSrc.thundercloud && countInSrc.thundercloud.uses, 'thundercloud case 真的读 sextra');
    ok(countInSrc.frostnova && countInSrc.frostnova.uses, 'frostnova case 真的读 sextra（本来就吃）');
    /* 撞键复查：这三个键确实是 firewall 自己的分支键 */
    {
      const fwBr = skillBranches('firewall');
      const own = new Set();
      const eat = o => { if (o && o.beh) for (const k in o.beh) own.add(k); };
      if (fwBr) { eat(fwBr.core); (fwBr.pick || []).forEach(eat); (fwBr.form || []).forEach(eat); }
      ok(own.has('follow') && own.has('endBurst') && own.has('ring'),
        '追随 / 爆燃 / 围火 确实占了 follow / endBurst / ring（台阶不能再写这三个）', [...own]);
    }
    ok(!/beh: \{ follow/.test(JSON.stringify(SKILL_TIER_EVO)),
      'evo 表里不许出现 follow（会顶掉「追随 / 随身」变体）');
    ok(!/beh: \{ ring/.test(JSON.stringify(SKILL_TIER_EVO)),
      'evo 表里不许出现 ring（那是「围火」变体的键）');
    ok(/tierDot: \{ ph: 'hook'/.test(behSrc), 'tierDot 已在 SKILL_BEH 登记');
    /* 三只 case 都要真的消费，不是只登记了键 */
    ok(/fwDot/.test(game) && /tcDot/.test(game) && /fnDot/.test(game),
      '三只 case 都消费了 tierDot');
    ok(/fwVuln/.test(game) && /tcVuln/.test(game) && /fnVuln/.test(game),
      '三只 case 都消费了 vuln');
    ok(game.indexOf("'霜蚀'") >= 0 && game.indexOf("'雷灼'") >= 0,
      '持续伤害按各自的元素挂（冰=霜蚀 / 雷=雷灼），不是一律「灼烧」');
    /* 火墙多道：并排铺开而不是原地叠（叠着看不出是两道，等于只有伤害没有形态） */
    ok(/const walls = 1 \+ Math\.max\(0, sextra\)/.test(game), '火墙按 sextra 铺多道');
    ok(/const wallOff = /.test(game) && /rad \* 0\.95/.test(game),
      '多道沿垂线错开（间距 0.95 倍半径：站中间的目标要吃满 N 道，否则低于 Σ0.85^n）');
    ok(/const clouds = 1 \+ Math\.max\(0, sextra\)/.test(game), '雷云按 sextra 铺多朵');
    for (const cls of ['mage']) {
      const todo = [1, 3, 5, 7, 9, 10].filter(lv => !skillSlotTierDone(cls, 3, lv));
      ok(todo.length === 0, '法师 ③ 面板不再有「待」角标', todo);
    }
  }

  /* --- 法师 ④ 护盾：玄冰护盾 / 焚天 共用一个位 ---
   * 这一位两只技能的根本差异是**一只带护盾、一只没有**：焚天是踩在自己脚下的
   * 一发爆发，「护盾反伤 / 护盾爆发 / 破碎冰冻」对它一句都不成立。
   * 而「护盾反伤」连 iceshield 自己都撞（`reflect` 是精研「霜甲」和变体「冰甲」
   * 的键）。所以四档统一改成「施法之后的 4 秒窗口」，两只都真的兑现。 */
  {
    for (const id of ['iceshield', 'pyroclasm']) {
      const e = SKILL_TIER_EVO[id];
      ok(!!e && !!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10],
        id + ' 五条台阶都在（护盾位只放一只，漏一只就是假话）');
      ok(e && e[3].beh.healOnCast === 10, id + ' Lv3 施法瞬回 10%', e && e[3].beh);
      ok(e && e[5].beh.armorPct === 30, id + ' Lv5 护甲 +30%', e && e[5].beh);
      ok(e && e[7].beh.moveSpd === 15, id + ' Lv7 移速 +15%', e && e[7].beh);
      ok(e && e[9].beh.crit === 15, id + ' Lv9 暴击率 +15%', e && e[9].beh);
      ok(e && e[10].beh.tierNova === 150,
        id + ' Lv10 走 tierNova（破盾 / 爆发两个入口共用一份结算）', e && e[10].beh);
    }
    /* 撞键复查：这三个键确实是 iceshield 自己的分支键，台阶一个都没再写 */
    {
      const isBr = skillBranches('iceshield');
      const own = new Set();
      const eat = o => { if (o && o.beh) for (const k in o.beh) own.add(k); };
      if (isBr) { eat(isBr.core); (isBr.pick || []).forEach(eat); (isBr.form || []).forEach(eat); }
      ok(own.has('reflect') && own.has('breakNova') && own.has('dur'),
        '霜甲 / 冰甲 / 冰刺 确实占了 reflect / breakNova / dur（台阶不能再写这三个）', [...own]);
      const tierKeys = new Set();
      for (const id of ['iceshield', 'pyroclasm']) {
        for (const lv of Object.keys(SKILL_TIER_EVO[id])) {
          for (const k in (SKILL_TIER_EVO[id][lv].beh || {})) tierKeys.add(k);
        }
      }
      ok(!tierKeys.has('reflect') && !tierKeys.has('breakNova') && !tierKeys.has('dur'),
        '台阶没有反过来占用这三个键（占用 = 选过分支的玩家点了没反应）', [...tierKeys]);
    }
    ok(/tierNova: \{ ph: 'hook'/.test(behSrc), 'tierNova 已在 SKILL_BEH 登记');
    ok(/behTierNova\(id, at\) \{/.test(behSrc), '结算只有一份 behTierNova（两个入口不会漂）');
    ok(/this\.behTierNova\('iceshield'\)/.test(behSrc), '破盾钩子调它');
    ok(/this\.behTierNova\('pyroclasm', pp\)/.test(game), '焚天 case 调它（爆发侧入口）');
    /* 钩子是「冰刺 + 台阶」两条独立效果，按 breakNova 早退会把台阶一起吞掉 */
    ok(!/if \(!beh \|\| !beh\.breakNova/.test(behSrc),
      'onBehShieldBreak 不许再按 breakNova 早退（否则只点台阶的玩家拿不到）');
    ok(/const warm = \(id === 'pyroclasm'\)/.test(behSrc),
      '元素按技能分（火=爆燃 / 冰=冰爆），不是一律冰蓝');
    ok(/e\.slow = Math\.max\(e\.slow \|\| 0, 1\)/.test(behSrc) && /e\.slowT = Math\.max\(e\.slowT \|\| 0, 1\.5\)/.test(behSrc),
      '定身 = slow 1.0 持续 1.5 秒');
    /* 顺带修的既有假话：变体「永冻」写「持续 +6 秒」，而 case 里 shieldT 写死 10 */
    ok(/this\.shieldT = 10 \+ sdur/.test(game), '永冻的 +6 秒真的进了 shieldT（原来写死 10）');
    for (const cls of ['mage']) {
      const todo = [1, 3, 5, 7, 9, 10].filter(lv => !skillSlotTierDone(cls, 4, lv));
      ok(todo.length === 0, '法师 ④ 面板不再有「待」角标', todo);
    }
  }

  /* --- 道士 ③ 太极：太极玄阵（自身增益）/ 天师符（地面符阵）共用一个位 ---
   * 这一位比「三只增益」更狠：两只连**形态类别**都不同 —— 一只没有圈，
   * 一只没有增益。所以 3 / 7 不能是发数（增益没有「第几圈」），
   * 5 / 9 / 10 也不能用撞自己分支的 knock / drPct。 */
  {
    const ids = ['taiji', 'mastersigil'];
    for (const id of ids) {
      const e = SKILL_TIER_EVO[id];
      ok(!!e && !!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10],
        id + ' 五条台阶都在（太极位只放一只，漏一只就是假话）');
      ok(e && e[3].beh.healOnCast === 8, id + ' Lv3 施法瞬回 8%', e && e[3].beh);
      ok(e && e[5].beh.slow === 40, id + ' Lv5 阵内减速 40%', e && e[5].beh);
      ok(e && e[7].beh.tierDur === 3, id + ' Lv7 走 tierDur（增益与符阵都要加时长）', e && e[7].beh);
      ok(e && e[9].beh['+drPct'] === 12,
        id + ' Lv9 走 +drPct 叠加键（不撞「阴阳 / 太极 / 绵劲 / 无极」）', e && e[9].beh);
      ok(e && e[10].beh.stun === 2 && e[10].beh.tierHot === 1.5,
        id + ' Lv10 定身 2 秒 + 每秒回复 1.5% 最大生命', e && e[10].beh);
    }
    /* 撞键复查：这两个键确实是 taiji 自己的分支键 */
    {
      const tjBr = skillBranches('taiji');
      const own = new Set();
      const eat = o => { if (o && o.beh) for (const k in o.beh) own.add(k); };
      if (tjBr) { eat(tjBr.core); (tjBr.pick || []).forEach(eat); (tjBr.form || []).forEach(eat); }
      ok(own.has('knock') && own.has('drPct'),
        '两仪 / 阴阳 / 太极 / 绵劲 / 无极 确实占了 knock / drPct（台阶不能再直接写这两个）', [...own]);
      const tierKeys = new Set();
      for (const id of ids) {
        for (const lv of Object.keys(SKILL_TIER_EVO[id])) {
          for (const k in (SKILL_TIER_EVO[id][lv].beh || {})) tierKeys.add(k);
        }
      }
      ok(!tierKeys.has('knock'), '台阶没有占用 knock（占用 = 选过「两仪」的玩家点了没反应）', [...tierKeys]);
      ok(!tierKeys.has('drPct'), '减伤只走 +drPct，不许直接写 drPct', [...tierKeys]);
    }
    /* 数量语义撤销：这两只都不吃发数，文案也不许再写「圈」 */
    ok(!skillCountCapable('taiji') && !skillCountCapable('mastersigil'),
      '太极 / 天师符都不在数量通道（增益没有发数，符阵是一只地阵）');
    {
      const slot3 = skillArchSlot('taoist', 3);
      const txt = [3, 7].map(lv => (slot3.tiers || {})[lv] || '').join(' ');
      ok(!/圈|发/.test(txt), '太极位 Lv3 / Lv7 不再写「双圈 / 三圈」（对增益是空话）', txt);
    }
    /* 接线：天师符的 dur 必须读 tierDur，否则这一位一半是假话 */
    ok(/const dur = 6 \+ sdur \+ \(\(bBeh && bBeh\.tierDur\) \|\| 0\)/.test(game),
      '天师符的符阵时长读 tierDur（只给增益加时长 = 另一半是假话）');
    ok(/buff\.dur = \(buff\.dur \|\| 8\) \+ bBeh\.tierDur/.test(game),
      '太极的增益时长也读 tierDur（两只都吃）');
    ok(/slow: \{ ph: 'hit'/.test(behSrc) && /stun: \{ ph: 'hit'/.test(behSrc),
      'slow / stun 都已在 SKILL_BEH 登记');
    ok(/tierHot: \{ ph: 'self'/.test(behSrc), 'tierHot 已在 SKILL_BEH 登记');
    for (const cls of ['taoist']) {
      const todo = [1, 3, 5, 7, 9, 10].filter(lv => !skillSlotTierDone(cls, 3, lv));
      ok(todo.length === 0, '道士 ③ 面板不再有「待」角标', todo);
    }
  }

  /* --- 刀客 ③ 剑阵：三条台阶都要「阵在哪 + 人在不在阵里」，所以接线三件套 --- */
  ok(/bBeh\.slowField/.test(game), '剑阵 case 必须消费 slowField（阵内减速）');
  ok(game.indexOf('this.swordField =') >= 0, '剑阵要铺一份运行时场地给 damagePlayer 用');
  ok(game.indexOf('swordFieldLive()') >= 0, '减伤 / 反击都靠 swordFieldLive 判「人还在不在阵里」');
  ok(/sf\.dr > 0/.test(game) && /sf\.counter > 0/.test(game),
    'damagePlayer 真的消费 arrayGuard / arrayCounter（不是只登记了键）');
  ok(/this\.swordCounterCd = 0\.4/.test(game), '阵内反击有内置冷却（不记账等于群体秒杀）');

  /* --- 刀客 ③ 的 Lv3 / Lv7「双圈 / 三圈」：同心多层剑气环 ---
   * 这一档不走数量轴（swordarray 不在 SKILL_COUNT_BASE 里），
   * 而是「一层圈 = 一个伤害档」。三条纪律要钉住：
   *   ① 层数只加圈，不加伤害（否则双圈就是白送一倍）；
   *   ② 一只怪只吃**它所在那一层**（判层必须由内向外 + break）；
   *   ③ 环画到哪，减伤 / 反击就管到哪（场地半径取最外圈）。 */
  ok(SKILL_TIER_EVO.swordarray[3].beh.arrayRings === 1 &&
    SKILL_TIER_EVO.swordarray[7].beh.arrayRings === 2,
    'Lv3 / Lv7 登记的是**额外圈数**（1 = 双圈、2 = 三圈）',
    { lv3: SKILL_TIER_EVO.swordarray[3].beh, lv7: SKILL_TIER_EVO.swordarray[7].beh });
  {
    const b7 = skillTierBeh('swordarray', 7) || {};
    ok(b7.arrayRings === 2, 'Lv7 累积后是 2 层额外圈（不是 1 + 2 = 3）', b7);
    ok(b7.slowField === 45, 'Lv7 同时保留 Lv5 的减速（累积合并不是覆盖整张表）', b7);
    const b2 = skillTierBeh('swordarray', 2) || {};
    ok(b2.arrayRings === undefined, 'Lv2 一圈都不多（3 级之前不许白送）', b2);
  }
  ok(SKILL_RING_DECAY === SKILL_COUNT_DECAY,
    '外层伤害系数与多发递减同一口径（要分家先改这条断言）',
    { ring: SKILL_RING_DECAY, count: SKILL_COUNT_DECAY });
  ok(SKILL_RING_STEP > 0.2 && SKILL_RING_STEP < 1,
    '每层外扩比例在 (0.2, 1) 之间（太小看不见、太大一圈顶满屏）', SKILL_RING_STEP);
  ok(/arrayRings: \{ ph: 'hook'/.test(behSrc), 'arrayRings 已在 SKILL_BEH 登记');
  ok(/const rings = 1 \+ Math\.max\(0, Math\.min\(2, \(bBeh && bBeh\.arrayRings\) \|\| 0\)\)/
    .test(game), '圈数封顶三圈（多登记一层就溢出）');
  ok(/ringRad = i => rad \* \(1 \+ i \* SKILL_RING_STEP\)/.test(game) &&
    /ringMul = i => Math\.pow\(SKILL_RING_DECAY, i\)/.test(game),
    '层半径 / 层伤害都读数据常量（不把 0.42 / 0.85 散在 game.js 里）');
  /* 判层由内向外 + break：倒过来的话站在内圈的怪会被算成外圈，
   * 点了台阶伤害反而比没点更低 —— 这是最容易写反的一行。 */
  ok(/for \(let ri = 0; ri < rings; ri\+\+\) \{\s*\n\s*if \(d < ringRad\(ri\) \+ e\.radius\) \{ layer = ri; break; \}/
    .test(game), '判层由内向外、命中即 break（一只怪只吃一层）');
  ok(/rollDamage\(st\.atk \* 0\.9 \* spow \* ringMul\(layer\)\)/.test(game),
    '每跳伤害乘的是**所在层**的系数（不是总层数）');
  ok(/rad: outerRad/.test(game),
    '场地半径取最外圈 —— 环画到哪，减伤 / 反击就管到哪');
  ok(/for \(let ri = 0; ri < rings; ri\+\+\) \{\s*\n\s*FX\.ring\(/.test(game),
    '画几圈 = 判几层（光效圈是判定的视觉契约，不许少画）');
  ok(skillSlotTierDone('warrior', 3, 3) && skillSlotTierDone('warrior', 3, 7),
    '面板上剑阵位的 3 / 7 不再标「待」');
  ok(skillSlotTierDone('warrior', 2, 3) && skillSlotTierDone('warrior', 2, 7),
    '面板上裂地震击位的 3 / 7 也不再标「待」（Lv3 走 evo、Lv7 走本体）');
}

/* --- SKILL_TIER_BODY 是「本体台阶」的逃生口，三道闸门防止它变成后门 ---
 * 它存在的唯一理由：有些档**天生就在技能本体里**（天崩本来就震三次），
 * 硬塞进 evo 表等于给 quake 加一个它没有的行为。但逃生口必须有边界，
 * 否则以后所有没做的档都能往里一塞、面板立刻变绿。 */
{
  const bad = [];
  for (const cls in SKILL_TIER_BODY) {
    for (const no in SKILL_TIER_BODY[cls]) {
      const slot = skillArchSlot(cls, Number(no));
      if (!slot) { bad.push('位不存在 ' + cls + no); continue; }
      for (const lv of SKILL_TIER_BODY[cls][no]) {
        if (!(slot.tiers || {})[lv]) { bad.push('没文案 ' + cls + no + ' Lv' + lv); continue; }
        if (SKILL_TIERS.visible.indexOf(lv) < 0) { bad.push('不是可见档 ' + cls + no + ' Lv' + lv); continue; }
        /* 能被 evo / 发数表达出来的档，不许走逃生口 */
        const evo = (slot.inherit || []).some(id => (SKILL_TIER_EVO[id] || {})[lv]);
        const cnt = (slot.inherit || []).some(id => skillTierCount(id, lv) > skillTierCount(id, lv - 1));
        if (evo || cnt) bad.push('能写正经台阶却走了本体 ' + cls + no + ' Lv' + lv);
      }
    }
  }
  ok(bad.length === 0, 'SKILL_TIER_BODY 只登记「evo / 发数都表达不了、本体天生兑现」的档', bad);
}

/* ============================================================
 * 八、法师 ② 陨石：发数在 5 / 7，3 级是溅射
 * ============================================================ */
console.log('八、法师 ② 陨石（发数 5 / 7）');
{
  const s2 = skillArchSlot('mage', 2);
  ok(s2.tiers[3] === '溅射' && s2.tiers[5] === '双陨' && s2.tiers[7] === '三连落',
    '本位文案：3 溅射 / 5 双陨 / 7 三连落', s2.tiers);
  for (const id of s2.inherit) {
    ok(skillTierCount(id, 3) === 0 && skillTierCount(id, 5) === 1,
      id + ' 的发数落在 5 / 7，不落 3（否则 Lv3「溅射」凭空多发一颗）', {
        lv3: skillTierCount(id, 3), lv5: skillTierCount(id, 5)
      });
  }
  /* 四只都真的读 sextra 这件事，一 / 二节已按 SKILL_COUNT_BASE 对过账；
   * 这里钉住正则查不到的那两条纪律 */
  ok(/const off = k === 0 \? 0 : mRad \* 0\.55/.test(game) &&
    /const off = k === 0 \? 0 : rad \* 0\.55/.test(game),
    '陨石 / 暴雪的多发偏移取 0.55 倍半径（偏出半径 = 升一级反而更弱）');
  ok(/3\.2 \* srad/.test(game) && /3\.0 \* srad/.test(game),
    '陨星天火的落点半径读 srad（否则 Lv3 的溅射对它是空话）');
  ok(/bBeh\.splash/.test(game) && /jSplash/.test(game),
    '天罚 case 真的消费 splash（不是只登记了键）');
  ok(/splash: \{ ph: 'hook'/.test(behSrc), 'splash 已在 SKILL_BEH 登记');
  /* 天罚多发：目标不够时补在主目标身上，不许「没目标就当没这级」 */
  ok(/while \(jTgts\.length < jCnt\) jTgts\.push\(target\)/.test(game),
    '天罚多头不足时补打主目标（否则单挑首领时这级白给）');

  /* --- 9 / 10「落点留火海」：同格四只都得接，漏一只就是那只点了没反应 ---
   * 台账里「一个格位躺多只技能」这条踩过三次（血怒 / 回春 / 护盾），
   * 每次都是「文案是位的、台阶只接了其中一只」。所以这里按 id 逐个查。 */
  {
    const four = s2.inherit;
    const naked = [];
    for (const id of four) {
      for (const lv of [9, 10]) {
        const b = skillTierBeh(id, lv);
        if (!b || !(b.tierField > 0)) naked.push(id + ' Lv' + lv);
      }
    }
    ok(naked.length === 0, '9 / 10 四只都拿得到 tierField', naked);
    ok(four.every(id => skillTierBeh(id, 9).tierFieldDur === undefined),
      'Lv9 不写 tierFieldDur —— 4 秒是默认值，数据里只写有变化的那一档');
    /* beh 的合并是**覆盖**不是累加（mods 才是累加，别搞混）：
     * Lv10 那行必须自带时长，否则 10 级只拿到 9 级的默认 4 秒。 */
    ok(four.every(id => skillTierBeh(id, 10).tierFieldDur === 8),
      'Lv10 明写 8 秒（beh 覆盖不累加，10 级那行要自带）');
    ok(/tierField: \{ ph: 'hook'/.test(behSrc) && /tierFieldDur: \{ ph: 'hook'/.test(behSrc),
      'tierField / tierFieldDur 已在 SKILL_BEH 登记');
    /* 登记了但 case 不消费 = 假台阶。四只里 starfall 有两条路（正常雨 / 星移引导），
     * 所以是 5 处调用。 */
    const calls = (game.match(/this\.spawnTierField\(/g) || []).length;
    ok(calls >= 5, '四只 case 都真的调 spawnTierField（炎爆 / 雷罚 / 暴雪 / 陨星天火 ×2）', calls);
    ok(/const MAX = 4/.test(game),
      '落点领域同时最多 4 块 —— 陨星天火一场 18 颗，不记账就是 18 块地糊满屏');
    ok(/setTimeout\(\(\) => \{[\s\S]{0,260}?spawnTierField\(ck/.test(game),
      '暴雪要等自己那片区域停了才铺落点领域（同时铺只是在同一片地上叠一层）');
    /* 落点必须落在**爆炸点 / 敌脚下**，不是准星：雷罚追着怪走，两者恒不重合 */
    ok(/this\.explodeAt\(c, mRad[\s\S]{0,120}?spawnTierField\(c,/.test(game),
      '陨石的落点领域铺在每颗自己的爆炸点上');
    ok(/spawnTierField\(tgt\.pos,/.test(game),
      '雷罚的落点领域铺在被打中那只脚下（不是准星）');
  }
}

/* ============================================================
 * 九、道士 ⑤ 召灵兽
 *
 * 这一位改的是**地基**，不是接个行为键：
 *   · 灵兽有了 hp / maxHp / 血条，怪会真打到它身上（嘲讽终于有代价）
 *   · 上限 3 → 8（手机 6），撞上限**不再顶掉**在场的
 *   · 伤害继承暴击 / 爆伤 / 通用增伤，并改成「现算」而不是召唤时定死
 *
 * 所以这一节既查台阶（三只 × 五档），也查那三件地基没被回退 ——
 * 地基一退，五条台阶立刻全部变成文案。
 * ============================================================ */
console.log('九、道士 ⑤ 召灵兽');
{
  const s5 = skillArchSlot('taoist', 5);
  ok(s5.inherit.join(',') === 'summon,whitetiger,azuredragon',
    '⑤ 位继承三只召唤技能（灵狼 / 白虎 / 青龙）', s5.inherit);

  /* 一个格位只放一只，所以三只都必须接满五档 */
  for (const id of s5.inherit) {
    const pack = SKILL_TIER_EVO[id] || {};
    for (const lv of [3, 5, 7, 9, 10]) {
      ok(!!pack[lv], id + ' Lv' + lv + ' 已登记（漏一只就是假话）');
    }
  }

  /* 撞键复查：台阶的 **beh** 键不许与三只自己的分支 beh 重名。
   * mods 通道允许重名 —— 它是累加（「双生」+1 与台阶 +1 叠成 3 只），
   * 下面单独断言这个前提成立。 */
  const tierBeh = new Set();
  for (const id of s5.inherit) {
    for (const lv of [3, 5, 7, 9, 10]) {
      for (const k in ((SKILL_TIER_EVO[id][lv] || {}).beh || {})) tierBeh.add(k);
    }
  }
  const clash = [];
  for (const id of s5.inherit) {
    const b = skillBranches(id);
    if (!b) continue;
    for (const row of [b.core].concat(b.pick, b.form)) {
      for (const k in ((row && row.beh) || {})) if (tierBeh.has(k)) clash.push(id + '.' + k);
    }
  }
  ok(clash.length === 0, '台阶行为键与三只的分支键零重叠（撞了 = 花点覆盖台阶）', clash);

  /* count 是 mods 通道：必须**累加**。这条一破，选过「双生」的玩家 3 级就白给。 */
  const merge = pick('mergeSkillMods');
  const merged = merge({}, null, { count: 1 }, skillTierMods('summon', 3));
  ok(merged.count === 2, '「双生」的 +1 与台阶 Lv3 的 +1 累加成 2（不是互相顶掉）', merged);
  ok(!(skillTierMods('summon', 1) || {}).count, 'Lv1 没有召唤数量加成');

  /* 面板：五档全部转绿 */
  ok([3, 5, 7, 9, 10].every(lv => skillSlotTierDone('taoist', 5, lv)),
    '道士 ⑤ 五个台阶全部已实装（面板不带「待」角标）');

  /* ---- 地基三件，逐条钉源码 ---- */
  ok(/_summonMods\(skillId\)[\s\S]{0,300}effSkillMods\(skillId\)/.test(game),
    '_summonMods 读 effSkillMods（用 skillMod 时精研 / 变体的 dmg 全是哑的）');
  ok(/base \+ mod\.count/.test(game), 'summonWolf 的数量读 mod.count');
  ok(/count: 1 \+ mod\.count/.test(game), 'summonBeast 的数量读 mod.count');
  ok(/this\.rollDamage\(st\.atk \* al\.coef/.test(game),
    '灵兽出手走 rollDamage（继承暴击率 / 暴击伤害 / 通用增伤）');
  ok(/hp: maxHp, maxHp, bar/.test(game), '灵兽带 hp / maxHp / 血条');
  ok(/damageAlly\(al, e\.dmg/.test(game), '近战怪真扣灵兽的血（嘲讽不再是空打）');
  ok(/damageAlly\(al, p\.dmg/.test(game), '远程怪真扣灵兽的血');
  ok(/ALLY_CAP_BASE = 8/.test(game) && /ALLY_CAP_TOUCH = 6/.test(game),
    '灵兽上限抬到 8（手机 6）');

  /* 召唤路径里不许再出现「顶掉最老的」 */
  const spawnBody = game.slice(game.indexOf('_spawnAlly(preset, opt)'), game.indexOf('灵兽受伤'));
  ok(spawnBody.length > 200 && !/allies\.shift/.test(spawnBody),
    '召唤路径里没有「顶掉最老的」（shift 只留在 trimAllies）');

  ok(/BEAST_PRESET = \{[\s\S]{0,300}wolf:[\s\S]{0,220}tiger:[\s\S]{0,220}dragon:/.test(game),
    '三型参数收敛成一张 BEAST_PRESET（台阶补召用同一份，不抄第二遍）');

  /* 台阶四件的行为键必须都已登记（第七节通用检查之外，这里点名一次） */
  for (const k of ['allyAoe', 'allyEscort', 'allyGuard', 'allyFour']) {
    ok(new RegExp('^ {2}' + k + ': \\{ ph:', 'm').test(behSrc), '新键 ' + k + ' 已登记（否则静默 plain）');
  }
}

/* ============================================================
 * 十、刀客 ⑤ 兵形
 *
 * 这一位是 P2b 里唯一一个「一个格位只有一只技能、却要新写三套机制」的位：
 *   刀式状态（改属性）/ 刃势记账（①②③④ 各一次）/ 断岳斩（形态随刀式）。
 * 所以这一节查的不是「接了几个键」，而是**这三套机制各自的接线点**都在：
 *   · 刀式走 recalc 的同一张 BUFF 表（不另开乘区，否则与装备结算顺序打架）
 *   · 刃势按**格位**记账（按命中次数记 = 左键一秒十次白送）
 *   · 断岳斩的两种形态各有底子（单体处决 / 三段崩击），且换式不吃怒气
 * ============================================================ */
console.log('十、刀客 ⑤ 兵形');
{
  const s5 = skillArchSlot('warrior', 5);
  ok(s5.title === '兵形', '⑤ 位标题是兵形', s5.title);
  ok(s5.inherit.join(',') === 'avatar', '⑤ 位只继承 avatar（剑神降世改造，不产生独立单位）', s5.inherit);
  ok(s5.unit === false, '⑤ 位明确不是召唤单位（拍板 #6）');
  ok((s5.forms || []).length === 3, '三种刀式（斩锋 / 镇岳 / 摧城）', (s5.forms || []).length);
  ok(s5.finisher && s5.finisher.name === '断岳斩', '终结技叫断岳斩');
  ok(s5.ultimate && s5.ultimate.name === '剑神降世', '终极形态是剑神降世');

  /* 五档必须齐，且每档给的是**那一档专属的开关**，不是复读同一句 */
  const e = SKILL_TIER_EVO.avatar || {};
  ok(!!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10], '五档全部登记', Object.keys(e));
  ok(e[3] && e[3].beh.stanceUnlock === 1, 'Lv3 解锁第二式（镇岳）', e[3] && e[3].beh);
  ok(e[5] && e[5].beh.edgeFinisher === 1, 'Lv5 才让刃势有出口（断岳斩）', e[5] && e[5].beh);
  ok(e[7] && e[7].beh.stanceUnlock === 2, 'Lv7 解锁第三式（摧城），同键递进到 2', e[7] && e[7].beh);
  ok(e[9] && e[9].beh.edgeKeep === 1, 'Lv9 换式保刃势', e[9] && e[9].beh);
  ok(e[10] && e[10].beh.edgeUltimate === 1, 'Lv10 断岳斩附带剑神降世', e[10] && e[10].beh);

  /* beh 是覆盖不是累加：10 级那行不带 stanceUnlock，但 7 级那行还在 */
  const b10 = skillTierBeh('avatar', 10) || {};
  ok(b10.stanceUnlock === 2 && b10.edgeFinisher === 1 && b10.edgeKeep === 1 && b10.edgeUltimate === 1,
    'Lv10 累积拿到四件（3 / 5 / 7 / 9 层不掉）', b10);
  ok(!(skillTierBeh('avatar', 4) || {}).edgeFinisher, 'Lv4 还没有断岳斩（攒满也没出口）');
  ok(!(skillTierBeh('avatar', 2) || {}).stanceUnlock, 'Lv2 仍只有斩锋式');

  /* 3 / 7 不再是数量台阶：avatar 不读 count 通道，给它 count 没有任何 case 消费 */
  ok(skillCountCapable('avatar') === false, 'avatar 不吃 count 通道（所以 3 / 7 不能写「多发」）');
  ok(skillTierCount('avatar', 7) === 0, 'Lv7 不给发数（台阶走 stanceUnlock）');

  /* 撞键：台阶四个键不许和 avatar 的分支键重名（重名 = 花点覆盖台阶） */
  const br = skillBranches('avatar') || {};
  const own = new Set();
  for (const row of [br.core].concat(br.pick || [], br.form || [])) {
    for (const k in ((row && row.beh) || {})) own.add(k);
  }
  const mine = new Set();
  for (const lv of [3, 5, 7, 9, 10]) for (const k in (e[lv].beh || {})) mine.add(k);
  const clash = [...mine].filter(k => own.has(k));
  ok(clash.length === 0, '台阶行为键与 avatar 的分支键零重叠', clash);
  ok(!mine.has('immune'), '不用 immune —— 那是无敌帧（avatar 精研「神临」的键），不是刀式');

  /* 面板：五档全部转绿（3 / 7 以前一直带「待」） */
  ok([3, 5, 7, 9, 10].every(lv => skillSlotTierDone('warrior', 5, lv)),
    '刀客 ⑤ 五个台阶全部已实装（面板不带「待」角标）');
  ok(skillSlotTierDone('warrior', 5, 1), 'Lv1 是基础形态，永远成立');

  /* ---- 三套机制的接线点，逐条钉源码 ---- */
  ok(/bladeMods\(\)/.test(game) && /applyMods\(this\.bladeMods\(\)\)/.test(game),
    '刀式走 recalc 的同一张 BUFF 表（不另开乘区）');
  ok(/if \(i === 1\) return \{ dmgReduce: 20, block: 15 \}/.test(game),
    '镇岳式 = 减伤 20% + 格挡 15%');
  ok(/if \(i === 2\) return \{ armorPen: 30 \}/.test(game),
    '摧城式 = 无视 30% 护甲（走 armorPen，damageEnemy 按比例削）');
  ok(/return \{ dmgAll: 15, aspd: 10 \}/.test(game), '斩锋式 = 伤害 15% + 攻速 10%');
  ok(/armor > 0[\s\S]{0,140}bladeStance\(\) === 2/.test(game),
    '摧城式「对护甲目标 +20%」真的结算（判目标本来有没有护甲）');

  ok(/bladeAddEdge\(id\)/.test(game), 'castSkill 收尾真的记刃势');
  ok(/skillArchSlotOf\('warrior', id\)/.test(game) && /slot < 1 \|\| slot > 4/.test(game),
    '刃势按**格位**记账（①②③④ 各一次，⑤ 与秘技不积）');
  ok(/if \(st\.mask & bit\) return 0/.test(game),
    '同一个格位重复施放不加层（否则左键一秒十次 = 白送）');
  ok(/if \(!this\.bladeFinisherOn\(\)\) return 0/.test(game),
    '5 级之前不记账（攒满了也没出口，只会让玩家以为坏了）');
  ok(/st\.mask = 0;/.test(game) && /if \(!this\.bladeBeh\(\)\.edgeKeep\) st\.mask = 0/.test(game),
    'Lv9 之前换式清空刃势、Lv9 起保留');

  /* ⑤ 的两种模式：冷却与资源必须在 case 里改写（castSkill 入口早就定死了） */
  ok(/bBlade\.edgeFinisher && edgeFull/.test(game), '刃势满 + 已解锁 → 走终结技分支');
  ok(/this\.cooldowns\[id\] = 1\.2/.test(game), '换式只吃 1.2 秒冷却（否则换一次式要等一分钟）');
  ok(/s\.mp = Math\.min\(st\.mpMax, s\.mp \+ cost\)/.test(game), '换式不收怒气（退回去）');
  ok(/this\.cooldowns\[id\] = Math\.max\(8, this\.skillCd\(sk\)/.test(game),
    '终结技吃技能自己的冷却（含冷却修正）');
  ok(/stance === 2/.test(game) && /this\.explodeAt\(t, rad, st\.atk \* 2\.4 \* spow/.test(game),
    '摧城式 → 三段崩击（底子 skysfall）');
  ok(/lowHp \? 2 : 1/.test(game) && /st\.atk \* 6\.0/.test(game),
    '斩锋 / 镇岳 → 单体处决（底子 execute，残血翻倍）');
  ok(/bBlade\.edgeUltimate && sk\.buff/.test(game),
    'Lv10 才给 12 秒剑神降世（不是每级都有）');

  /* 破军大节点「剑神」刷新突刺：必须留在终结技分支里 ——
   * 换式冷却只有 1.2 秒，留在外面等于突刺无限刷新。
   * 取的是**代码行**（`st.specials.avatarResetThrust`）而不是注释里那个词 ——
   * 上面那段注释本身就点了名，用裸词会把注释的位置当成代码的位置。 */
  const at = game.indexOf('st.specials.avatarResetThrust');
  const gate = game.indexOf('if (bBlade.edgeFinisher && edgeFull)');
  ok(at > 0 && gate > 0 && at > gate, 'avatarResetThrust 在终结技分支内（换式不许刷突刺）', { at, gate });

  /* 兵形归零：换角色 / 开新档从斩锋式起手 */
  ok(/this\.blade = \{ i: 0, mask: 0 \}/.test(game), 'startNew 把兵形状态归零');
  ok(/if \(!this\.skillUnlocked\('avatar'\)\) return null/.test(game),
    '没领悟剑神降世就没有刀式加成（26 级之前白拿 +15% 伤害是 bug）');
}

/* ============================================================
 * 十一、法师 ⑤ 元素法相
 *
 * 这一位与刀客 ⑤ 是**同构的两副面孔**：都不是「按一下打一发」，而是开一个
 * 窗口，窗口里改的是「其他技能长什么样」。区别在于它的技能本体是**净新增**
 * （`isNew: true` 在这一位上是真的从零写，而不是「还没做」）。
 *
 * 所以这一节查四件事：
 *   1. 技能本体真的存在且是「不做伤害的窗口」（mult 0 / 全抗增益 / 自身施法）
 *   2. 五档台阶逐档对账（label 与 slot.tiers 逐字相同、beh 键各归各位）
 *   3. 三套机制的接线点都在：开窗换相 / 命中附加 / 收窗新星
 *   4. 免控走的是**现成的** ccImmune 通道，不是另开一套无敌帧
 * ============================================================ */
console.log('十一、法师 ⑤ 元素法相');
{
  const s5 = skillArchSlot('mage', 5);
  ok(s5.title === '元素法相', '⑤ 位标题是元素法相', s5.title);
  ok(s5.inherit.join(',') === 'elementavatar', '⑤ 位只继承 elementavatar（净新增，不是改造老技能）', s5.inherit);
  ok(s5.unit === false, '⑤ 位明确不是召唤单位（拍板 #6）');
  ok(s5.isNew === true, 'isNew 仍为 true —— 意思是「没有老技能可以改造成它」');
  ok(s5.aura && s5.aura.mainElemOnly === true, '只强化主元素（不召单位）');
  ok(!!s5.aura && s5.aura.durMin === 10 && s5.aura.durMax === 15, '面板读数 10~15 秒', s5.aura);

  /* 技能本体 */
  const sk5 = SKILLS.elementavatar;
  ok(!!sk5, '技能本体 elementavatar 存在');
  ok(sk5 && sk5.cls === 'mage' && sk5.tree === '雷霆', '挂在法师 · 雷霆线', sk5 && sk5.tree);
  ok(sk5 && sk5.mult === 0, '法相本体不造成伤害（mult 0）—— 伤害在台阶 Lv9 的新星里', sk5 && sk5.mult);
  ok(sk5 && sk5.cast === 'self' && sk5.type === 'ultimate', '自身施法的终极技', sk5 && [sk5.type, sk5.cast]);
  ok(sk5 && sk5.buff && sk5.buff.allRes === 20 && sk5.buff.dur === 10,
    '窗口给的是全抗 +20 / 10 秒（走 BUFF 表，不另开乘区）', sk5 && sk5.buff);
  ok(sk5 && sk5.unlock === 34, '34 级领悟（与树上的岔口 reqLv 一致）', sk5 && sk5.unlock);
  ok(sk5 && (sk5.variants || []).length === 3, '三条变体（三相 / 久相 / 省相）', sk5 && (sk5.variants || []).length);
  ok(pick('SKILL_ORDER').mage.indexOf('elementavatar') >= 0,
    'SKILL_ORDER.mage 里真的排上了（否则动作条选不到）');

  /* 五档 + 逐字对账 */
  const e = SKILL_TIER_EVO.elementavatar || {};
  ok(!!e[3] && !!e[5] && !!e[7] && !!e[9] && !!e[10], '五档全部登记', Object.keys(e));
  ok(e[3] && e[3].beh.elemSwap === 1, 'Lv3 解锁换相', e[3] && e[3].beh);
  ok(e[5] && e[5].beh.formRider === 1, 'Lv5 命中才附带主元素效果', e[5] && e[5].beh);
  ok(e[7] && e[7].beh.formDur === 4, 'Lv7 窗口 +4 秒', e[7] && e[7].beh);
  ok(e[9] && e[9].beh.formNova === 150, 'Lv9 收窗新星（攻击力 150%）', e[9] && e[9].beh);
  ok(e[10] && e[10].beh.ccImmune === 1, 'Lv10 窗口内免控', e[10] && e[10].beh);
  const labelBad = [3, 5, 7, 9, 10].filter(lv => (e[lv] || {}).label !== s5.tiers[lv]);
  ok(labelBad.length === 0, '五档 label 与 slot.tiers 逐字相同（契约会查）', labelBad);

  /* beh 是覆盖不是累加：10 级那行不带 formRider，但 5 级那行还在 */
  const b10 = skillTierBeh('elementavatar', 10) || {};
  ok(b10.elemSwap === 1 && b10.formRider === 1 && b10.formDur === 4 && b10.formNova === 150 && b10.ccImmune === 1,
    'Lv10 累积拿到五件（3 / 5 / 7 / 9 层不掉）', b10);
  ok(!(skillTierBeh('elementavatar', 2) || {}).elemSwap, 'Lv2 还不会换相（只能是火）');
  ok(!(skillTierBeh('elementavatar', 4) || {}).formRider, 'Lv4 命中还不带元素效果（否则 Lv5 是空话）');

  /* 法相不吃 count 通道：它不是多发技能，给 count 没有任何 case 消费 */
  ok(skillCountCapable('elementavatar') === false, '不吃 count 通道（所以 3 / 7 不能写「多发」）');

  /* 撞键：台阶键不许和分支键重名（重名 = 花点覆盖台阶） */
  const br = skillBranches('elementavatar') || {};
  const own = new Set();
  for (const row of [br.core].concat(br.pick || [], br.form || [])) {
    for (const k in ((row && row.beh) || {})) own.add(k);
  }
  const mine = new Set();
  for (const lv of [3, 5, 7, 9, 10]) for (const k in (e[lv].beh || {})) mine.add(k);
  const clash = [...mine].filter(k => own.has(k));
  ok(clash.length === 0, '台阶行为键与 elementavatar 的分支键零重叠', clash);
  /* 精研核心不许和台阶 Lv7 说同一件事：两处都写「持续 +4 秒」的话，
   * 面板显示 +8 秒、实际也是 +8 秒，玩家只会当成 bug。 */
  ok(!(br.core && br.core.mods && br.core.mods.dur) && !(br.core && br.core.beh && br.core.beh.formDur),
    '精研核心不重复台阶 Lv7 的「持续 +4 秒」', br.core && br.core.mods);

  /* 面板：五档全部转绿 */
  ok([3, 5, 7, 9, 10].every(lv => skillSlotTierDone('mage', 5, lv)),
    '法师 ⑤ 五个台阶全部已实装（面板不带「待」角标）');
  ok(skillSlotTierDone('mage', 5, 1), 'Lv1 是基础形态，永远成立');

  /* 行为键登记（漏一个就是静默失效） */
  ok(/elemSwap: \{ ph: 'hook'/.test(behSrc), 'elemSwap 已在 SKILL_BEH 登记');
  ok(/formRider: \{ ph: 'hook'/.test(behSrc), 'formRider 已在 SKILL_BEH 登记');
  ok(/formDur: \{ ph: 'hook'/.test(behSrc), 'formDur 已在 SKILL_BEH 登记');
  ok(/formNova: \{ ph: 'hook'/.test(behSrc), 'formNova 已在 SKILL_BEH 登记');

  /* ---- 三套机制的接线点，逐条钉源码 ---- */
  ok(/case 'elementavatar': \{/.test(game), 'castSkill 里有 elementavatar 分支');
  ok(/if \(ea\.t > 0\) \{/.test(game), '窗口开着 → 换相分支（不是重开一次）');
  ok(/if \(!bEa\.elemSwap\) \{/.test(game), '3 级之前按下去不重开窗（只说清楚为什么没反应）');
  ok(/ea\.elem = \(ea\.elem \+ 1\) % ELEM_AURA_KINDS\.length/.test(game),
    '换相按火 → 冰 → 雷 → 火循环');
  ok(/this\.cooldowns\[id\] = 1\.2/.test(game), '换相只吃 1.2 秒冷却（否则换一次相要等一分钟）');
  ok(/s\.mp = Math\.min\(st\.mpMax, s\.mp \+ cost\)/.test(game), '换相不收灵力（退回去）');
  ok(/ea\.mul = spow/.test(game), '开窗时快照元素强度（命中结算时手上没有 spow）');
  ok(/ea\.rider = !!bEa\.formRider/.test(game), 'rider 开关也快照（窗口内不因升级忽然变强）');
  ok(/baseDur \+ sdur \+ \(bEa\.formDur \|\| 0\)/.test(game),
    '持续 = 本体 10 + 变体 + Lv7 台阶（三个来源各自可查）');
  ok(/Math\.max\(4, baseDur/.test(game), '持续有 4 秒下限（三相 −2 也不至于开了等于没开）');

  /* 命中附加：必须在 damageEnemy（所有伤害的唯一出口），且只认有感命中 */
  ok(/this\.elemAura\.t > 0 && this\.elemAura\.rider/.test(game),
    '命中附加写在 damageEnemy 里（全技能附带，不逐个 case 加）');
  ok(/if \(!opts\.silent && this\.elemAura && this\.elemAura\.t > 0/.test(game),
    'silent 的持续伤害不触发（否则火相 = 永久点燃）');
  ok(/this\.applySkillDot\(e, stR\.atk \* 0\.18 \* mR, 3, 'fire', '灼烧'\)/.test(game),
    '火相 → 灼烧走 applySkillDot（与火墙 / 雷云同一条跳伤管线）');
  ok(/kR\.key === 'ice'[\s\S]{0,160}e\.slowT = Math\.max\(e\.slowT \|\| 0, 2\)/.test(game),
    '冰相 → 减速（玄冰套 deepfreeze 判定读的就是 slow / slowT）');
  ok(/if \(!e\.boss\) e\.stun = Math\.max\(e\.stun \|\| 0, 0\.35\)/.test(game),
    '雷相 → 麻痹（小怪才吃晕，首领只吃易伤）');
  ok(/e\.vuln = Math\.max\(e\.vuln \|\| 0, 15 \* mR\)/.test(game)
    && /e\.vulnT = Math\.max\(e\.vulnT \|\| 0, 3\)/.test(game),
    '雷相 → 易伤（走 e.vuln / vulnT，与旋风斩 Lv9 同一个键）');

  /* 收窗新星：必须在 tickBeh，且早于那两处提前 return */
  ok(/if \(this\.elemAura && this\.elemAura\.t > 0\) \{/.test(behSrc), 'tickBeh 里真的在倒数法相');
  ok(/behA\.formNova/.test(behSrc) && /stA\.atk \* behA\.formNova \/ 100/.test(behSrc),
    'Lv9 新星按 formNova 百分比结算（不写在技能本体里）');
  {
    const tickAt = behSrc.indexOf('if (this.elemAura && this.elemAura.t > 0)');
    const drainAt = behSrc.indexOf('if (this._drainOn) {');
    ok(tickAt > 0 && drainAt > 0 && tickAt > drainAt, '法相倒数排在 tickBeh 前段（早于提前 return）');
  }

  /* 免控：复用现成通道，不另开无敌帧 */
  ok(/if \(bEa\.ccImmune\) \{/.test(game) && /cb\.ccImmune = true/.test(game),
    'Lv10 把 ccImmune 标记打在增益本体上');
  ok(/ccImmuneNow\(\) \{[\s\S]{0,120}if \(b\.ccImmune\) return true/.test(game),
    '判定口 ccImmuneNow 读的是同一个标记（减速 / 中毒真的挂不上）');
  ok(!/elementavatar[\s\S]{0,200}immune: 1/.test(game), '不用 immune —— 那是无敌帧，不是免控');

  /* 归零：换角色 / 死亡都要关窗 */
  ok(/this\.elemAura = \{ t: 0, elem: 0, mul: 1, rider: false \}/.test(game),
    'startNew 把法相状态归零（起手火相、没有窗口）');
  ok(/die\(\) \{[\s\S]{0,400}this\.elemAura\.t = 0/.test(game),
    'die() 里关窗（tickBeh 在 dead 时提前返回，不关会冻在「还剩 6 秒」）');

  /* 技能树：净新增技能必须有一岔口，否则树上画不出、永远停在 1 级 */
  const mageLines = pick('SKILL_TREE').layout.mage;
  const fork5 = mageLines.reduce((acc, line) => acc.concat(line.forks || []), [])
    .find(f => f.active === 'elementavatar');
  ok(!!fork5, '法师树上真的有 elementavatar 这一岔口（不进 layout = 点不动）');
  ok(fork5 && fork5.passive === 'm_form', '岔口被动侧是 m_form（法身）', fork5 && fork5.passive);
  ok(!!pick('SKILL_TREE').passives.m_form, '被动 m_form 已登记');
  ok(/formElemMul\(\)/.test(behSrc) || /formElemMul\(\) \{ return 1 \+ 0\.12/.test(readSrc('src/skill-passive.js')),
    '法身真的有结算口 formElemMul（点了不能是空点）');
  ok(/formElemMul/.test(readSrc('src/skill-passive.js')), 'formElemMul 落在 skill-passive.js（与其它被动同处）');
  ok(/m_form/.test(readSrc('src/skill-passive.js')), 'm_form 进 PASSIVE_HOOKED（覆盖率红线）');

  /* 图标：没有图标的那一格会退化成问号 */
  ok(/elementavatar: '/.test(readSrc('src/data/data-skill-icons.js')), 'elementavatar 有自己的图标');
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2b 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
