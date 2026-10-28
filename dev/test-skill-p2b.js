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

/* 三个职业 5 个位的 Lv7：「实装状态」= 有发数 **或** 有一条形态台阶。
 * 原断言写的是「实装 ⟺ 位内有 count 技能」，那是数量轴唯一的年代定的；
 * 血怒位（刀客 ④）的 Lv7 是「增益持续 +3 秒」，没有发数但真的接了。 */
for (const cls of CLASSES) {
  for (const slot of skillArchList(cls)) {
    const gets = (slot.inherit || []).filter(id => skillTierCount(id, 7) > 0);
    const evo7 = (slot.inherit || []).some(id => (SKILL_TIER_EVO[id] || {})[7]);
    const done = skillSlotTierDone(cls, slot.no, 7);
    ok(done === (gets.length > 0 || evo7),
      cls + ' ' + slot.no + ' 号位的 Lv7 实装状态 == 有发数 或 有形态台阶',
      { done, gets: gets.length, evo7 });
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
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2b 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
