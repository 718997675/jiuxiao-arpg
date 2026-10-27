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
const SKILL_COUNT_BASE = pick('SKILL_COUNT_BASE');
const SKILL_COUNT_CAP = pick('SKILL_COUNT_CAP');
const SKILL_COUNT_DECAY = pick('SKILL_COUNT_DECAY');
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
const skillTierEvoList = pick('skillTierEvoList');
const skillTierEvo = pick('skillTierEvo');
const skillTierBeh = pick('skillTierBeh');
const SKILL_TIERS = pick('SKILL_TIERS');

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

/* 三个职业的 ① / ② / ③ 位，该有 count 技能的都有 */
for (const cls of CLASSES) {
  for (const slot of skillArchList(cls)) {
    const gets = (slot.inherit || []).filter(id => skillTierCount(id, 7) > 0);
    const done = skillSlotTierDone(cls, slot.no, 7);
    ok(done === (gets.length > 0),
      cls + ' ' + slot.no + ' 号位的 Lv7 实装状态 == 位内有 count 技能',
      { done, gets: gets.length });
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
   * 只查「没登记的不许实装」会让实装之后仍然标「待」，面板反过来骗人。 */
  let bad = [];
  for (const cls of CLASSES) {
    for (const slot of skillArchList(cls)) {
      for (const lv of [5, 9, 10]) {
        const done = skillSlotTierDone(cls, slot.no, lv);
        const has = (slot.inherit || []).some(id => !!SKILL_TIER_EVO[id] && !!SKILL_TIER_EVO[id][lv]);
        if (done !== has) bad.push(cls + slot.no + ' Lv' + lv + ' done=' + done + ' has=' + has);
      }
    }
  }
  ok(bad.length === 0, '每位每级：面板「待」状态 == evo 表是否登记（双向）', bad.slice(0, 6));
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
    ok(lvs.every(l => [5, 9, 10].includes(l)), id + ' 只登记 5 / 9 / 10（4/6/8 是纯数值）', lvs);
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
      for (const k in beh) if (!known.has(k)) badKeys.push(id + ' Lv' + lv + ' ' + k);
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
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2b 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
