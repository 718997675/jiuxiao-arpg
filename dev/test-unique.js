/* ============================================================
 * [UNIQUE] 传世名器 · 浏览器端验证（驱动真实 Game / UNIQUE_ITEMS）
 *
 *   node dev/test-unique.js [warrior|mage|taoist]
 *
 * 覆盖：
 *   A. 数据层：20 件传世 / 每件都有技能效果 / 特性全表唯一（无重复、无孤儿）
 *      grant 与 id 指向的技能都真实存在 / 传世一律 tierless
 *   B. 装备生效：穿上后 grantedSkills 进 stats、skillUnlocked 变 true、
 *      跨职业秘技能放上技能条、术法面板出现「秘技」组
 *   C. 强化类：'*' 与指定技能的 skillMods 真的被 Game.skillMod 合并到
 *   D. 升阶：炼器台明确拒绝传世（不给「第 1/8 阶」这种假阶名）
 *   E. 提示框：传世标签 / 特性 / 技能效果三行都在
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLS = process.argv[2] || 'warrior';
if (!['warrior', 'mage', 'taoist'].includes(CLS)) {
  console.log('用法：node dev/test-unique.js [warrior|mage|taoist]');
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

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

  const boot = await p.evaluate(() => ({
    state: !!(typeof Game !== 'undefined' && Game.state),
    running: !!(typeof Game !== 'undefined' && Game.running)
  }));
  if (!(boot.state && boot.running)) {
    console.log('游戏未能启动：', JSON.stringify(boot));
    if (errs.length) console.log(errs.join('\n'));
    await b.close();
    process.exit(1);
  }

  /* ================= A. 数据层 ================= */
  console.log('\nA. 传世数据（' + CLS + '）');
  const A = await p.evaluate(() => {
    const R = {};
    R.items = UNIQUE_ITEMS.length;
    R.traits = Object.keys(UNIQUE_TRAITS).length;
    R.noSkill = [];        // 没有技能效果
    R.noDesc = [];         // 技能效果没写说明
    R.badSkillId = [];     // 指向不存在的技能
    R.badGrant = [];       // 授予了不存在的技能
    R.noTrait = [];        // 一条特性都没有
    R.badTrait = [];       // 指向不存在的特性
    const use = {};        // 特性 → 被哪些传世用了
    for (const u of UNIQUE_ITEMS) {
      const us = u.skill;
      if (!us || (!us.id && !us.grant)) R.noSkill.push(u.id);
      else {
        if (!us.desc) R.noDesc.push(u.id);
        if (us.id && us.id !== '*' && !SKILLS[us.id]) R.badSkillId.push(u.id + ':' + us.id);
        if (us.grant && !SKILLS[us.grant]) R.badGrant.push(u.id + ':' + us.grant);
        /* 授予 + 指定技能同时写是自相矛盾的（一件只做一件事） */
        if (us.grant && us.id) R.badGrant.push(u.id + ':grant+id');
      }
      const tr = u.traits || [];
      if (!tr.length) R.noTrait.push(u.id);
      for (const t of tr) {
        if (!UNIQUE_TRAITS[t]) R.badTrait.push(u.id + ':' + t);
        (use[t] = use[t] || []).push(u.id);
      }
    }
    R.dup = Object.keys(use).filter(t => use[t].length > 1).map(t => t + '×' + use[t].length);
    R.orphan = Object.keys(UNIQUE_TRAITS).filter(t => !use[t]);
    R.grantN = UNIQUE_ITEMS.filter(u => u.skill && u.skill.grant).length;
    R.upN = UNIQUE_ITEMS.filter(u => u.skill && !u.skill.grant).length;
    /* 传世一律不入八阶 */
    R.notTierless = [];
    R.badLabel = [];
    R.tierable = [];
    for (const u of UNIQUE_ITEMS) {
      const it = rollItem(40, { slot: u.slot, rarity: 'unique', cls: u.cls || 'warrior' });
      /* roll 出来的可能不是这一件，按 uniqueId 重试几次直到命中 */
      let hit = it.uniqueId === u.id ? it : null;
      for (let i = 0; !hit && i < 300; i++) {
        const t = rollItem(40, { slot: u.slot, rarity: 'unique', cls: u.cls || 'warrior' });
        if (t.uniqueId === u.id) hit = t;
      }
      if (!hit) { R.notTierless.push(u.id + ':没 roll 出来'); continue; }
      if (!hit.tierless) R.notTierless.push(u.id);
      if (itemTierLabel(hit) !== '传世') R.badLabel.push(u.id + ':' + itemTierLabel(hit));
      if (upgradeTierInfo(hit).ok) R.tierable.push(u.id);
    }
    return R;
  });
  ok(A.items === 20, '传世 20 件', A.items);
  ok(A.noSkill.length === 0, '每件都有技能效果', A.noSkill.join(','));
  ok(A.noDesc.length === 0, '技能效果都写了说明', A.noDesc.join(','));
  ok(A.badSkillId.length === 0, '强化的技能 id 都存在', A.badSkillId.join(','));
  ok(A.badGrant.length === 0, '授予的技能 id 都存在且不冲突', A.badGrant.join(','));
  ok(A.grantN > 0 && A.upN > 0, '授予新技能与强化已有技能两条路都有',
    `grant ${A.grantN} / 强化 ${A.upN}`);
  ok(A.noTrait.length === 0, '每件至少一条特性', A.noTrait.join(','));
  ok(A.badTrait.length === 0, '特性 id 都存在', A.badTrait.join(','));
  ok(A.dup.length === 0, '特性全表唯一（没有两件共用一条）', A.dup.join(' '));
  ok(A.orphan.length === 0, '没有孤儿特性（每条都挂在某件上）', A.orphan.join(','));
  ok(A.traits === 27, '特性总数 27 条', A.traits);
  ok(A.notTierless.length === 0, '传世全部标记 tierless', A.notTierless.join(','));
  ok(A.badLabel.length === 0, '阶名一律显示「传世」', A.badLabel.join(','));
  ok(A.tierable.length === 0, '传世不可升阶', A.tierable.join(','));

  /* ================= B. 授予类生效 ================= */
  console.log('\nB. 授予新技能（跨职业秘技）');
  const B = await p.evaluate(() => {
    const R = {};
    /* 挑一件授予类传世：优先通用件（跨职业才测得准） */
    const granters = UNIQUE_ITEMS.filter(u => u.skill && u.skill.grant && !u.cls);
    R.granterN = granters.length;
    /* 必须挑一条「秘技职业 ≠ 玩家职业」的，否则它本来就在技能树里，
     * 测不出「跨职业授予」这条路径（天师会命中自己的技能） */
    const def = granters.find(u => SKILLS[u.skill.grant].cls !== Game.state.cls) || granters[0];
    R.defId = def.id; R.defName = def.name; R.grant = def.skill.grant;
    let it = null;
    for (let i = 0; i < 400 && !it; i++) {
      const t = rollItem(40, { slot: def.slot, rarity: 'unique', cls: 'warrior' });
      if (t.uniqueId === def.id) it = t;
    }
    if (!it) return R;
    R.rolled = true;
    const s = Game.state;
    /* 装备容器叫 equipment（戒指有 ring1/ring2 两格） */
    const put = (x) => { const k = x.slot === 'ring' ? 'ring1' : x.slot; s.equipment[k] = x; return k; };
    const take = (x) => { const k = x.slot === 'ring' ? 'ring1' : x.slot; s.equipment[k] = null; return k; };
    R.grantCls = SKILLS[def.skill.grant].cls;
    /* 玩家职业与秘技职业不同才算真的跨职业 */
    R.crossClass = R.grantCls !== s.cls;
    /* 穿上前后对照 */
    const before = {
      unlocked: Game.skillUnlocked(def.skill.grant),
      inStats: !!(s.stats.grantedSkills && s.stats.grantedSkills[def.skill.grant])
    };
    put(it);
    Game.recalc();
    R.before = before;
    R.after = {
      unlocked: Game.skillUnlocked(def.skill.grant),
      inStats: !!(s.stats.grantedSkills && s.stats.grantedSkills[def.skill.grant]),
      barOk: Game.barSkillOk(def.skill.grant)
    };
    /* 放上技能条第 8 格（空位） */
    const slot = s.skillbar.indexOf(null);
    R.slotIdx = slot;
    const as = Game.assignSkillBar(slot >= 0 ? slot : 7, def.skill.grant);
    R.assign = as;
    R.onBar = Game.skillBar().indexOf(def.skill.grant) >= 0;
    /* 术法面板：秘技组 */
    UI.openSkill();
    const nav = document.querySelectorAll('#skList .sk-tree-g').length;
    R.groups = nav;
    R.tiles = document.querySelectorAll('#skList .sk-tile .sk-lk.gr').length;
    /* 脱下：技能应立刻失去（未到等级的秘技） */
    take(it);
    Game.recalc();
    R.afterOff = {
      unlocked: Game.skillUnlocked(def.skill.grant),
      barOk: Game.barSkillOk(def.skill.grant),
      onBar: Game.skillBar().indexOf(def.skill.grant) >= 0
    };
    /* 恢复：别把后面几节的环境搞脏 */
    put(it);
    Game.recalc();
    UI.renderSkillPanel();
    return R;
  });
  ok(B.rolled && B.granterN > 0, '找到授予类传世并 roll 出实物', `${B.defName} → ${B.grant}`);
  ok(B.before && B.before.unlocked === false, '穿上之前该秘技未领悟', JSON.stringify(B.before));
  ok(B.after && B.after.inStats === true, '穿上后 grantedSkills 进 stats', JSON.stringify(B.after));
  ok(B.after && B.after.unlocked === true, '穿上后 skillUnlocked 为真');
  ok(B.after && B.after.barOk === true, '穿上后可以放上技能条（barSkillOk）');
  ok(B.assign && B.assign.ok === true, 'assignSkillBar 接受跨职业秘技', JSON.stringify(B.assign));
  ok(B.onBar === true, '技能条上真的留住了该秘技');
  ok(B.groups >= 1, '术法面板出现「秘技」分组', B.groups);
  ok(B.tiles >= 1, '秘技格子带「秘」角标', B.tiles);
  ok(B.crossClass === true, '秘技确实跨职业', `${B.grantCls} vs ${CLS}`);
  ok(B.afterOff && B.afterOff.unlocked === false, '脱下后秘技失去', JSON.stringify(B.afterOff));
  ok(B.afterOff && B.afterOff.onBar === false, '脱下后技能条上的秘技被清掉');

  /* ================= C. 强化类生效 ================= */
  console.log('\nC. 强化已有技能');
  const C = await p.evaluate(() => {
    const R = {};
    const s = Game.state;
    const put = (x) => { const k = x.slot === 'ring' ? 'ring1' : x.slot; s.equipment[k] = x; return k; };
    const take = (x) => { const k = x.slot === 'ring' ? 'ring1' : x.slot; s.equipment[k] = null; return k; };
    /* 指定技能强化：找一件 cls 与本职业一致、id 是具体技能的传世 */
    const spec = UNIQUE_ITEMS.find(u => u.skill && u.skill.id && u.skill.id !== '*' && u.cls === s.cls);
    R.specId = spec ? spec.id : null;
    R.specSkill = spec ? spec.skill.id : null;
    if (spec) {
      let it = null;
      for (let i = 0; i < 400 && !it; i++) {
        const t = rollItem(40, { slot: spec.slot, rarity: 'unique', cls: s.cls });
        if (t.uniqueId === spec.id) it = t;
      }
      if (it) {
        put(it);
        Game.recalc();
        const m = Game.skillMod(spec.skill.id);
        R.specMod = m ? Object.assign({}, m) : null;
        /* 同职业别的技能不该被这条修正影响 */
        const other = Object.keys(SKILLS).find(id => SKILLS[id].cls === s.cls && id !== spec.skill.id);
        R.otherMod = Game.skillMod(other);
      }
    }
    /* 通玄类（'*'）：应该作用到任意技能上 */
    const star = UNIQUE_ITEMS.find(u => u.skill && u.skill.id === '*' && !u.cls);
    R.starId = star ? star.id : null;
    if (star) {
      let it = null;
      for (let i = 0; i < 400 && !it; i++) {
        const t = rollItem(40, { slot: star.slot, rarity: 'unique', cls: s.cls });
        if (t.uniqueId === star.id) it = t;
      }
      if (it) {
        put(it);
        Game.recalc();
        const any = Object.keys(SKILLS).find(id => SKILLS[id].cls === s.cls);
        const m = Game.skillMod(any);
        R.starMod = m ? Object.assign({}, m) : null;
        R.starAny = any;
        take(it);
        Game.recalc();
      }
    }
    return R;
  });
  ok(C.specMod && Math.abs((C.specMod.dmg || 0)) > 0, '指定技能拿到 dmg 修正',
    `${C.specSkill} → ${JSON.stringify(C.specMod)}`);
  ok(!C.otherMod || !(C.otherMod.dmg > 0), '指定技能修正不外溢到同职业其他技能',
    JSON.stringify(C.otherMod));
  ok(C.starMod && (C.starMod.dmg > 0 || C.starMod.cd > 0 || C.starMod.cost > 0 || C.starMod.dur > 0),
    '「通玄」类修正作用到任意技能', `${C.starAny} → ${JSON.stringify(C.starMod)}`);

  /* ================= D. 升阶拒绝 ================= */
  console.log('\nD. 炼器台升阶');
  const D = await p.evaluate(() => {
    const R = {};
    const def = UNIQUE_ITEMS.find(u => u.slot === 'chest');
    let it = null;
    for (let i = 0; i < 400 && !it; i++) {
      const t = rollItem(40, { slot: 'chest', rarity: 'unique', cls: 'warrior' });
      if (t.uniqueId === def.id) it = t;
    }
    R.defName = def.name;
    const info = upgradeTierInfo(it);
    R.ok = info.ok; R.msg = info.msg;
    /* 炼器台「升阶」页的头部文案：不能出现「第 N/8 阶」 */
    const view = UI.forgeTierView(it);
    R.hasTierTrack = /tier-track/.test(view);
    R.sub = (view.match(/class="fsub">([^<]*)/) || [])[1] || '';
    return R;
  });
  ok(D.ok === false, '传世升阶被拒绝');
  ok(/传世/.test(D.msg || '') && /不参与升阶/.test(D.msg || ''), '拒绝理由说清了「不入八阶」', D.msg);
  ok(D.hasTierTrack === false, '升阶页不再画八阶进度条');
  ok(/不入八阶/.test(D.sub), '升阶页头部写「传世 · 不入八阶」', D.sub);

  /* ================= E. 提示框 ================= */
  console.log('\nE. 提示框');
  const E = await p.evaluate(() => {
    const R = {};
    const def = UNIQUE_ITEMS.find(u => u.skill && u.skill.grant);
    let it = null;
    for (let i = 0; i < 400 && !it; i++) {
      const t = rollItem(40, { slot: def.slot, rarity: 'unique', cls: 'warrior' });
      if (t.uniqueId === def.id) it = t;
    }
    const h = itemTooltip(it);
    R.name = def.name;
    R.hasTierless = /tt-tierless/.test(h);
    R.tierlessTxt = (h.match(/class="tt-tierless">([^<]*)/) || [])[1] || '';
    R.traitN = (h.match(/class="tt-trait"/g) || []).length;
    R.expectTraitN = (def.traits || []).length;
    R.hasSkill = /class="tt-skill"/.test(h);
    R.tag = (h.match(/class="tt-skill-tag">([^<]*)/) || [])[1] || '';
    /* 每条特性的文字都要在（不能只写名字） */
    R.traitTexts = (def.traits || []).every(t => h.indexOf(UNIQUE_TRAITS[t].desc) >= 0);
    return R;
  });
  ok(E.hasTierless, '提示框有「传世」标签');
  ok(/不入八阶/.test(E.tierlessTxt), '标签写明「不入八阶」', E.tierlessTxt);
  ok(E.traitN === E.expectTraitN && E.traitN > 0, '特性条数与数据一致', `${E.traitN}/${E.expectTraitN}`);
  ok(E.traitTexts, '每条特性都带了效果说明');
  ok(E.hasSkill, '提示框有技能效果段');
  ok(E.tag === '秘技', '授予类标为「秘技」', E.tag);

  /* ================= 收尾 ================= */
  if (errs.length) {
    console.log('\n运行期报错：');
    errs.slice(0, 6).forEach(e => console.log('  ! ' + e));
  }
  ok(errs.length === 0, '无运行期报错', errs.length + ' 条');

  console.log(`\n结果（${CLS}）：通过 ${pass} · 失败 ${fail}`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
