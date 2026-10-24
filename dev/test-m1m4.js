/* ============================================================
 * M1–M4 模块补齐 · 浏览器端验证（驱动真实 Game / UI）
 *
 *   node dev/test-m1m4.js [warrior|mage|taoist]
 *
 * 覆盖（P0 批）：
 *   A. 套装 9 → 12：3 套通用（cls === null）、不占武器/副手、
 *      任何职业都能滚出、穿上后属性与 special 真的生效
 *   B. 天赋点来源：任务奖励 talent 共 10 点、talentBonus 进存档
 *   C. 新词缀族：元素伤害 / 全技能等级 / 濒死免疫
 *      （不只是「数据里有」，而是战斗里真的改数值）
 *   D. 变体角标：PC 技能条 + 移动端技能格都显示 Ⅰ/Ⅱ/Ⅲ
 *   E. 图鉴：每张卡带掉落行（.cx-d）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLS = process.argv[2] || 'warrior';
if (!['warrior', 'mage', 'taoist'].includes(CLS)) {
  console.log('用法：node dev/test-m1m4.js [warrior|mage|taoist]');
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

  const boot = await p.evaluate(() => ({
    game: typeof Game,
    state: !!(typeof Game !== 'undefined' && Game.state),
    running: !!(typeof Game !== 'undefined' && Game.running)
  }));
  if (!(boot.game === 'object' && boot.state && boot.running)) {
    console.log('游戏未能启动：', JSON.stringify(boot));
    if (errs.length) console.log(errs.join('\n'));
    await b.close();
    process.exit(1);
  }

  /* ================= A. 套装 9 → 12 ================= */
  console.log('\nA. 套装扩展（' + CLS + '）');
  const A = await p.evaluate(() => {
    const G = Game, R = {};
    const ids = Object.keys(SETS);
    R.count = ids.length;
    R.uni = ids.filter(id => SETS[id].cls === null);
    R.uniTypes = (SET_TYPES.universal || []).map(t => t.ids.join(','));
    /* 通用套不能占武器 / 副手：那两格形态与职业绑定 */
    R.badSlot = [];
    for (const id of R.uni) for (const s of SETS[id].slots) {
      if (s === 'weapon' || s === 'offhand') R.badSlot.push(id + ':' + s);
    }
    /* 通用套件必须能被任何职业滚出（含 cls 为 null 的通用基底） */
    R.rollable = {};
    for (const cls of ['warrior', 'mage', 'taoist']) {
      const got = new Set();
      for (let i = 0; i < 2500; i++) {
        const it = rollItem(40, { rarity: 'set', cls });
        if (it && it.setId) got.add(it.setId);
      }
      R.rollable[cls] = R.uni.filter(id => got.has(id));
    }
    /* 穿满 3 件行脚：属性 + special 都要真的进 stats */
    const mk = (setId, slot, name) => ({
      slot, name, setId, rarity: 'set', ilvl: 40, reqLv: 1, cls: null,
      affixes: [], fixed: [], sockets: 0, runes: [], value: 10
    });
    const eqCaravan = {
      belt: mk('caravan', 'belt', '行脚商囊'),
      boots: mk('caravan', 'boots', '行脚快靴'),
      amulet: mk('caravan', 'amulet', '行脚铜铃')
    };
    const st1 = computePlayerStats({ cls: G.state.cls, level: 40, equipment: eqCaravan });
    R.goldFind = st1.goldFind; R.magicFind = st1.magicFind;
    R.pickup = st1.pickupRadius; R.lootRush = !!(st1.specials && st1.specials.lootRush);
    const eqHermit = {
      helm: mk('hermit', 'helm', '隐修布冠'),
      chest: mk('hermit', 'chest', '隐修衲衣'),
      gloves: mk('hermit', 'gloves', '隐修护手'),
      boots: mk('hermit', 'boots', '隐修芒鞋')
    };
    const st2 = computePlayerStats({ cls: G.state.cls, level: 40, equipment: eqHermit });
    R.hpPct = st2.hpPct; R.ward = st2.deathWard; R.reduce = st2.dmgReduce;
    const eqWander = {
      shoulders: mk('wanderer', 'shoulders', '游侠披肩'),
      gloves: mk('wanderer', 'gloves', '游侠手套'),
      ring: mk('wanderer', 'ring', '游侠指环'),
      amulet: mk('wanderer', 'amulet', '游侠护符')
    };
    const st3 = computePlayerStats({ cls: G.state.cls, level: 40, equipment: eqWander });
    R.projDmg = st3.projDmg; R.deadeye = !!(st3.specials && st3.specials.deadeye);
    R.wanderCritDmg = st3.critDmg;
    /* 打造通用套：成品 cls 必须是 null（三职业都能穿） */
    const base = rollItem(40, { rarity: 'rare', slot: 'belt', cls: null });
    const applied = craftSetItem(base, 'caravan');
    R.craftCls = applied ? base.cls : 'null-apply';
    R.craftName = applied ? base.name : '';
    return R;
  });
  ok(A.count === 12, '套装应为 12 套（9 职业 + 3 通用）', A.count);
  ok(A.uni.length === 3, '通用套应为 3 套', A.uni.join(','));
  ok(A.uniTypes.length === 3 && A.uniTypes.every(t => t.includes(',') === false),
    'SET_TYPES.universal 应为 3 条单套条目', JSON.stringify(A.uniTypes));
  ok(A.badSlot.length === 0, '通用套不应占用武器/副手', A.badSlot.join(','));
  for (const cls of ['warrior', 'mage', 'taoist']) {
    ok(A.rollable[cls].length === 3, cls + ' 应能滚出全部 3 套通用套', A.rollable[cls].join(','));
  }
  ok(A.goldFind === 45 && A.magicFind === 20 && A.pickup === 2,
    '行脚 2 件：金币 45 / 机缘 20 / 拾取 2', `${A.goldFind}/${A.magicFind}/${A.pickup}`);
  ok(A.lootRush === true, '行脚 3 件应点亮 lootRush');
  ok(A.hpPct === 14 && A.reduce === 6, '隐修 2 件：生命 14% / 减伤 6%', `${A.hpPct}/${A.reduce}`);
  ok(A.ward === 40, '隐修 4 件应给濒死免疫 40%', A.ward);
  ok(A.projDmg === 22, '游侠 2 件：投射物伤害 +22', A.projDmg);
  ok(A.deadeye === true, '游侠 4 件应点亮 deadeye');
  ok(A.craftCls === null, '通用套打造后 cls 应为 null（全职业可穿）', A.craftCls);

  /* ================= B. 天赋点来源 ================= */
  console.log('\nB. 天赋点来源（任务奖励）');
  const B = await p.evaluate(() => {
    const G = Game, R = {};
    let sum = 0;
    const fromQuests = [];
    for (const q of Object.values(QUESTS)) {
      if (q.rewards && q.rewards.talent) { sum += q.rewards.talent; fromQuests.push(q.id + ':' + q.rewards.talent); }
    }
    R.sum = sum; R.list = fromQuests;
    R.stateDefault = typeof G.state.talentBonus === 'number' ? G.state.talentBonus : 'missing';
    /* talentPoints = 等级 + 奖励 - 已花 */
    G.state.level = 20; G.state.talentBonus = 0;
    for (const k in G.talentState().spent) delete G.talentState().spent[k];
    R.pure = G.talentPoints();
    G.state.talentBonus = 10;
    R.withBonus = G.talentPoints();
    /* 存档往返：talentBonus 必须活下来 */
    const norm = SaveManager.normalizeDoc({ talentBonus: 10 }, 1);
    R.saveKeeps = norm && norm.doc ? norm.doc.talentBonus : 'no-normalize';
    G.state.talentBonus = 0;
    return R;
  });
  ok(B.sum === 10, '任务天赋奖励合计应为 10 点', B.list.join(','));
  ok(B.stateDefault === 0, 'state.talentBonus 默认应为 0', B.stateDefault);
  ok(B.withBonus - B.pure === 10, 'talentBonus 应直接加到可用点数', B.withBonus + ' vs ' + B.pure);
  ok(B.saveKeeps === 10, 'talentBonus 应能通过存档归一化', B.saveKeeps);

  /* ================= C. 新词缀族 ================= */
  console.log('\nC. 新词缀族（元素伤害 / 技能等级 / 濒死免疫）');
  const C = await p.evaluate(() => {
    const G = Game, R = {};
    const NEW = ['fireDmg', 'iceDmg', 'lightningDmg', 'poisonDmg', 'skillLv', 'deathWard'];
    R.inStats = NEW.filter(k => !!STATS[k]);
    R.inAffix = NEW.filter(k => AFFIXES.some(a => a.key === k));
    R.tierCount = {};
    for (const k of NEW) R.tierCount[k] = AFFIXES.filter(a => a.key === k).length;

    /* --- 元素伤害：+100% 火伤，火属性这一击应正好翻倍 --- */
    const kind = Object.keys(MONSTERS)[0];
    G.state.stats.fireDmg = 0;
    const e1 = G.spawnEnemy(kind, 4, 4, false, 12);
    const h1 = e1.hp;
    G.damageEnemy(e1, 100, false, { elem: 'fire', silent: true });
    const d1 = h1 - e1.hp;
    G.state.stats.fireDmg = 100;
    const e2 = G.spawnEnemy(kind, 6, 4, false, 12);
    const h2 = e2.hp;
    G.damageEnemy(e2, 100, false, { elem: 'fire', silent: true });
    const d2 = h2 - e2.hp;
    G.state.stats.fireDmg = 0;
    R.d1 = d1; R.d2 = d2; R.ratio = d1 > 0 ? d2 / d1 : 0;
    /* 物理伤害不该吃到火伤加成 */
    G.state.stats.fireDmg = 100;
    const e3 = G.spawnEnemy(kind, 8, 4, false, 12);
    const h3 = e3.hp;
    G.damageEnemy(e3, 100, false, { elem: 'phys', silent: true });
    R.physWithFire = h3 - e3.hp;
    const e4 = G.spawnEnemy(kind, 10, 4, false, 12);
    const h4 = e4.hp;
    G.state.stats.fireDmg = 0;
    G.damageEnemy(e4, 100, false, { elem: 'phys', silent: true });
    R.physNoFire = h4 - e4.hp;
    G.state.stats.fireDmg = 0;

    /* --- 技能等级：stats.skillLv 叠在已投等级上，上限 20 --- */
    const sid = Object.keys(SKILLS).find(id => SKILLS[id].cls === G.state.cls) || Object.keys(SKILLS)[0];
    G.state.skills[sid] = { lv: 5 };
    G.state.stats.skillLv = 0;
    R.lvBase = G.skillLevel(sid);
    G.state.stats.skillLv = 3;
    R.lvPlus = G.skillLevel(sid);
    G.state.skills[sid] = { lv: 19 };
    G.state.stats.skillLv = 5;
    R.lvCap = G.skillLevel(sid);
    G.state.skills[sid] = { lv: 5 };
    G.state.stats.skillLv = 0;

    /* --- 濒死免疫：致命伤保留 1 点生命 + 回血，60 秒冷却 --- */
    G.state.stats.dodge = 0; G.state.stats.block = 0;
    G.state.hp = G.state.stats.hpMax;
    G.state.deathWardCd = 0;
    G.invuln = 0; G.dead = false;
    const savedWard = G.state.stats.deathWard;
    G.state.stats.deathWard = 40;
    G.damagePlayer(9e9, null);
    R.wardHp = G.state.hp;
    R.wardPct = Math.round(G.state.hp / G.state.stats.hpMax * 100);
    R.wardCd = G.state.deathWardCd;
    /* 冷却内再吃一次致命伤：应当真的死 */
    G.invuln = 0;
    G.state.hp = 10;
    const hpBefore2 = G.state.hp;
    G.damagePlayer(9e9, null);
    R.secondDead = G.state.hp <= 0 || G.dead;
    G.state.stats.deathWard = savedWard;
    G.state.deathWardCd = 0;
    if (G.dead) { G.dead = false; G.state.hp = G.state.stats.hpMax; }
    return R;
  });
  ok(C.inStats.length === 6, '6 个新属性 key 都应登记在 STATS', C.inStats.join(','));
  ok(C.inAffix.length === 6, '6 个新属性都应出现在 AFFIXES', C.inAffix.join(','));
  ok(C.tierCount.fireDmg === 3 && C.tierCount.skillLv === 3 && C.tierCount.deathWard === 1,
    '元素伤害 3 阶 / 技能等级 3 阶 / 濒死免疫 1 条',
    JSON.stringify(C.tierCount));
  near(C.ratio, 2.0, 0.02, '火伤 +100% 时火属性伤害应翻倍');
  ok(C.physWithFire === C.physNoFire, '物理伤害不该吃到火伤加成',
    C.physWithFire + ' vs ' + C.physNoFire);
  ok(C.lvBase === 5, '技能基础等级应为 5', C.lvBase);
  ok(C.lvPlus === 8, 'skillLv +3 应把技能等级推到 8', C.lvPlus);
  ok(C.lvCap === 20, '技能等级上限应为 20', C.lvCap);
  ok(C.wardHp > 1 && C.wardPct >= 35 && C.wardPct <= 45,
    '濒死免疫应回复约 40% 生命', C.wardPct + '%');
  ok(C.wardCd > 59, '濒死免疫应进入 60 秒冷却', C.wardCd);
  ok(C.secondDead === true, '冷却内再受致命伤应真的死亡', C.secondDead);

  /* ================= D. 变体角标 ================= */
  console.log('\nD. 变体角标（PC + 移动端）');
  const D = await p.evaluate(() => {
    const G = Game, R = {};
    /* 选一个本职业、已解锁的技能放到技能条第 1 格 */
    const ids = (SKILL_ORDER[G.state.cls] || []).filter(id => SKILLS[id]);
    const target = ids[0];
    G.state.level = Math.max(G.state.level, SKILLS[target].unlock);
    G.recalc();
    G.assignSkillBar(0, target);
    G.setSkillVariant(target, 1);
    UI.buildActionBar();
    UI.updateSkillbar();
    const bar = document.getElementById('actionbar');
    R.badges = bar ? bar.querySelectorAll('.skill .vb').length : -1;
    const el = bar && bar.querySelector('#actionbar .skill[data-skill="' + target + '"] .vb')
      || (bar && bar.querySelector('.skill[data-skill="' + target + '"] .vb'));
    R.vbText = el ? el.textContent.trim() : '';
    R.vbVisible = el ? el.style.display !== 'none' : false;
    R.variantNow = G.skillVariant(target);
    /* 切回 Ⅰ 时角标应隐藏 */
    G.setSkillVariant(target, 0);
    UI.updateSkillbar();
    const el0 = bar && bar.querySelector('.skill[data-skill="' + target + '"] .vb');
    R.vbHidden = el0 ? el0.style.display === 'none' : false;
    G.setSkillVariant(target, 1);
    UI.updateSkillbar();
    /* 移动端：Mobile.buildSkills 产出的圆钮也要带角标 */
    R.mobileOn = typeof Mobile !== 'undefined' && !!Mobile.on;
    try {
      Mobile.buildSkills();
      const m = document.querySelector('#mSkills .mskill .vb');
      R.mobileVb = m ? m.textContent.trim() : '';
      R.mobileCount = document.querySelectorAll('#mSkills .mskill .vb').length;
    } catch (e) { R.mobileVb = 'build-failed'; R.mobileCount = -1; }
    return R;
  });
  ok(D.badges > 0, '技能条每个技能格都应有 .vb 角标节点', D.badges);
  ok(D.variantNow === 1, '应能切到 Ⅱ 变体', D.variantNow);
  ok(D.vbText === 'Ⅱ' && D.vbVisible === true, '变体角标应显示 Ⅱ', D.vbText);
  ok(D.vbHidden === true, '变体为 Ⅰ 时角标应隐藏');
  ok(D.mobileCount > 0 || D.mobileOn === false, '移动端技能格应有角标节点', D.mobileCount);
  ok(D.mobileVb === 'Ⅱ' || D.mobileOn === false, '移动端角标应与 PC 一致', D.mobileVb);

  /* ================= E. 图鉴掉落行 ================= */
  console.log('\nE. 图鉴掉落行');
  const E = await p.evaluate(() => {
    const G = Game, R = {};
    R.text = G.codexDrops(Object.keys(MONSTERS)[0], 12);
    /* 先把当前区域所有怪都收录，再看每张卡是否都带掉落行 */
    const region = (typeof UI.codexRegion === 'string' && UI.codexRegion) || CODEX_REGIONS[0].id;
    const kinds = G.codexRegionKinds(region);
    for (const k of kinds) G.unlockCodex(k);
    UI.renderCodex();
    R.cards = document.querySelectorAll('#codexGrid .cx:not(.lock)').length;
    R.dropLines = document.querySelectorAll('#codexGrid .cx:not(.lock) .cx-d').length;
    R.sample = (document.querySelector('#codexGrid .cx-d') || {}).textContent || '';
    return R;
  });
  ok(/装备 Lv\.12/.test(E.text) && /符文/.test(E.text), 'codexDrops 应给出装备/符文掉率', E.text);
  ok(E.cards > 0, '图鉴应渲染出已收录卡片', E.cards);
  ok(E.dropLines === E.cards, '每张已收录卡片都应带一行掉落说明', E.dropLines + '/' + E.cards);
  ok(/装备 Lv\./.test(E.sample), '掉落行文案应含装备等级', E.sample);

  /* ================= F. 协同节点（B4） ================= */
  console.log('\nF. 协同点：装备激活隐藏天赋');
  const F = await p.evaluate(() => {
    const G = Game, R = {};
    const EMPTY = { helm: null, chest: null, shoulders: null, cloak: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, weapon: null, offhand: null, relic: null, fate: null };
    R.count = (typeof SYNERGY_NODES !== 'undefined') ? SYNERGY_NODES.length : -1;
    R.registered = (typeof SYNERGY_NODES !== 'undefined')
      && SYNERGY_NODES.every(n => TALENT_NODES[n.id] && TALENT_NODES[n.id].hidden);
    /* 先清空装备：所有协同节点都该是封着的 */
    const keep = JSON.parse(JSON.stringify(G.state.equipment));
    G.state.equipment = Object.assign({}, EMPTY);
    G.state.level = 40;
    G.state.talents.spent = {};
    G.recalc();
    R.open0 = G.synergyOpen().length;
    R.can0 = G.canAllocTalent('syn_longxiang');
    R.alloc0 = G.allocTalent('syn_longxiang');

    /* 穿满 5 件龙骧 → 龙魂显形，并真的改属性 */
    const mk = (slot, name) => ({
      slot, name, setId: 'longxiang', setName: '龙骧', rarity: 'set', ilvl: 40, reqLv: 1,
      cls: 'warrior', affixes: [], fixed: [], sockets: 0, runes: [], value: 10
    });
    G.state.equipment.helm = mk('helm', '龙骧战盔');
    G.state.equipment.chest = mk('chest', '龙骧战铠');
    G.state.equipment.shoulders = mk('shoulders', '龙骧护肩');
    G.state.equipment.gloves = mk('gloves', '龙骧护手');
    G.state.equipment.boots = mk('boots', '龙骧战靴');
    G.recalc();
    R.open1 = G.synergyOpen().slice();
    R.can1 = G.canAllocTalent('syn_longxiang');
    const before = G.state.stats.dmgAll;
    R.alloc1 = G.allocTalent('syn_longxiang');
    R.gain = Math.round(G.state.stats.dmgAll - before);

    /* 符文之语：3 孔镶 el/sol/tal 成「雷霆之语」→ 雷引显形 */
    const w = rollItem(40, { slot: 'weapon', cls: 'warrior' });
    w.sockets = 3; w.runes = ['el', 'sol', 'tal'];
    G.state.equipment.weapon = w;
    G.recalc();
    R.rwName = (runeWordOf(w) || {}).id || '';
    R.rwOpen = G.synergyUnlocked('syn_thunder');
    R.rwOther = G.synergyUnlocked('syn_inferno');   // 没成形的不该跟着亮

    /* 卸下装备：节点保持已投，但重新变成「不可再点」 */
    G.state.equipment = Object.assign({}, EMPTY);
    G.recalc();
    R.keepSpent = (G.talentState().spent.syn_longxiang || 0);
    R.afterUnequipOpen = G.synergyUnlocked('syn_longxiang');

    /* UI：协同页签能画出来，封着的节点不露名字 */
    UI.tlTree = 'synergy';
    UI.renderTalentPanel();
    const hit = UI._tlHit || [];
    R.hits = hit.length;
    R.sealed = hit.filter(h => h.sealed).length;
    const tabs = document.querySelectorAll('#tlTrees .tl-tab');
    R.tabs = Array.from(tabs).map(t => t.dataset.tree);
    /* 恢复现场，别影响后面的用例 */
    G.state.equipment = keep;
    G.state.talents.spent = {};
    G.recalc();
    return R;
  });
  ok(F.count === 8, '协同节点应为 8 个', F.count);
  ok(F.registered === true, '8 个协同节点都应登记进 TALENT_NODES 且标记 hidden');
  ok(F.open0 === 0, '未穿装备时不应有显形的协同节点', F.open0);
  ok(F.can0 === false && F.alloc0 === false, '未显形的协同节点不可加点', F.can0 + '/' + F.alloc0);
  ok(F.open1.length === 1 && F.open1[0] === 'syn_longxiang', '龙骧 5 件应只点亮龙魂', F.open1.join(','));
  ok(F.can1 === true, '显形后应可加点');
  ok(F.alloc1 === true && F.gain === 12, '龙魂应给全伤害 +12', F.gain);
  ok(F.rwName === 'thunder' && F.rwOpen === true, '雷霆之语应点亮雷引', F.rwName + '/' + F.rwOpen);
  ok(F.rwOther === false, '未成形的符文之语不该点亮别的协同节点');
  ok(F.keepSpent === 1, '卸下装备后已投的协同点应保留', F.keepSpent);
  ok(F.afterUnequipOpen === false, '卸下装备后协同节点应重新封印');
  ok(F.hits === 8, '协同轮盘应画满 8 个星位', F.hits);
  ok(F.sealed === 8, '未满足条件时应全部是封印', F.sealed);
  ok(F.tabs.indexOf('synergy') >= 0, '天赋页签应含「协同」', F.tabs.join(','));

  /* ================= G. 装备升阶（B5） ================= */
  console.log('\nG. 装备升阶（+1 基底阶）');
  const G = await p.evaluate(() => {
    const G_ = Game, R = {};
    const s = G_.state;
    /* 造一件 12 级玄品胸甲：tierIndex(12) = 2（玄铁） */
    const it = rollItem(12, { slot: 'chest', rarity: 'rare', cls: 'warrior' });
    R.tier0 = it.baseTier;
    R.var0 = it.baseVar;
    R.armor0 = it.baseArmor;
    R.affixN = it.affixes.length;
    const info = upgradeTierInfo(it);
    R.infoOk = info.ok; R.from = info.from; R.to = info.to;
    const cost = upgradeTierCost(it);
    R.cost = cost;

    /* 没有同名装备时不能升 */
    const keepInv = s.inventory.slice();
    s.inventory = [];
    R.noMat = G_.upgradeItemTier(it).ok;

    /* 放一件同名装备当引子 */
    const mat = JSON.parse(JSON.stringify(it));
    mat.uid = it.uid + 9999;
    s.inventory = [mat];
    s.gold = 999999;
    G_.addCrystal(200);
    R.pvCan = G_.tierUpPreview(it).can;
    const r = G_.upgradeItemTier(it);
    R.ok = r.ok;
    R.tier1 = it.baseTier;
    R.armor1 = it.baseArmor;
    R.nameChanged = it.name !== it.baseName ? 'set-name-kept' : 'base-name';
    R.affixAfter = it.affixes.length;
    R.matConsumed = s.inventory.length === 0;
    R.goldSpent = 999999 - s.gold;
    R.tierUps = it.tierUps;

    /* 顶阶拒绝 */
    it.baseTier = 7;
    R.top = upgradeTierInfo(it).ok;
    it.baseTier = R.tier1;
    /* 法器没有基底阶 */
    const relic = rollItem(30, { slot: 'relic', cls: 'warrior' });
    R.relicNo = upgradeTierInfo(relic).ok === false;

    /* UI：炼器台应有「升阶」页签，且能渲染出升阶视图 */
    s.inventory = [it].concat(keepInv);
    const tabs = Array.from(document.querySelectorAll('#forgePanel .ftab')).map(b => b.dataset.ftab);
    R.tabs = tabs;
    UI.forgeTab = 'tier';
    UI.forgeRef = 'inv:0';
    UI.renderForge();
    const main = document.getElementById('forgeMain');
    R.view = main ? main.innerHTML : '';
    R.hasBtn = /data-ftier/.test(R.view);
    R.hasTrack = /tier-track/.test(R.view);
    s.inventory = keepInv;
    UI.forgeTab = 'rune';
    return R;
  });
  ok(G.tier0 === 2, '12 级胸甲应落在第 3 阶（玄铁）', G.tier0);
  ok(G.infoOk === true && G.from === '玄铁' && G.to === '地煞', '下一阶应是地煞', G.from + '→' + G.to);
  ok(G.cost && G.cost.gold > 0 && G.cost.crystal > 0, '升阶应同时消耗铜钱与玄晶', JSON.stringify(G.cost));
  ok(G.noMat === false, '没有同名装备时不该升阶成功');
  ok(G.ok === true, '材料齐备时应升阶成功');
  ok(G.tier1 === 3, '升阶后基底阶应为 3（地煞）', G.tier1);
  ok(G.armor1 > G.armor0, '升阶后护甲应提高', G.armor0 + ' → ' + G.armor1);
  ok(G.affixAfter === G.affixN, '升阶不该动词条', G.affixN + ' → ' + G.affixAfter);
  ok(G.matConsumed === true, '同名装备应被消耗');
  ok(G.goldSpent === G.cost.gold, '扣款应与报价一致', G.goldSpent + ' vs ' + G.cost.gold);
  ok(G.tierUps === 1, '应记录升阶次数', G.tierUps);
  ok(G.top === false, '顶阶（太初）不该再升');
  ok(G.relicNo === true, '法器没有基底阶');
  ok(G.tabs.indexOf('tier') >= 0, '炼器台应有「升阶」页签', G.tabs.join(','));
  ok(G.hasBtn && G.hasTrack, '升阶视图应含按钮与八阶进度条', G.hasBtn + '/' + G.hasTrack);

  /* ================= H. 光环词缀（C5） ================= */
  console.log('\nH. 光环词缀（周围敌人减速 / 灼烧）');
  const H = await p.evaluate(() => {
    const G_ = Game, R = {};
    const NEW = ['auraSlow', 'auraBurn', 'auraRange'];
    R.inStats = NEW.filter(k => !!STATS[k]);
    R.inAffix = NEW.filter(k => AFFIXES.some(a => a.key === k));
    R.fateAllow = (AFFIX_SLOT_ALLOW.fate || []).filter(k => NEW.indexOf(k) >= 0);
    R.weaponDeny = (AFFIX_SLOT_DENY.weapon || []).filter(k => NEW.indexOf(k) >= 0);

    const st = G_.state.stats;
    const saved = { auraSlow: st.auraSlow, auraBurn: st.auraBurn, auraRange: st.auraRange };
    const pp = G_.playerGroup.position;
    const kind = Object.keys(MONSTERS)[0];
    /* 近处一只、远处一只 */
    const near = G_.spawnEnemy(kind, pp.x + 2, pp.z + 2, false, 12);
    const far = G_.spawnEnemy(kind, pp.x + 22, pp.z + 22, false, 12);
    st.auraSlow = 40; st.auraBurn = 30; st.auraRange = 0;
    G_.updateAuras(0.1);
    R.nearSlow = near.slow; R.farSlow = far.slow;
    R.nearSlowT = near.slowT;
    const hp0 = near.hp, hpFar0 = far.hp;
    for (let i = 0; i < 5; i++) G_.updateAuras(0.2);
    R.burnTick = Math.round(hp0 - near.hp);
    R.farBurn = Math.round(hpFar0 - far.hp);
    R.ring = !!(G_.auraRing && G_.auraRing.visible);
    R.ringR = G_.auraRing ? +G_.auraRing.scale.x.toFixed(2) : 0;
    /* 关掉光环：环应隐藏 */
    st.auraSlow = 0; st.auraBurn = 0;
    G_.updateAuras(0.1);
    R.ringOff = !!(G_.auraRing && G_.auraRing.visible === false);
    st.auraSlow = saved.auraSlow; st.auraBurn = saved.auraBurn; st.auraRange = saved.auraRange;
    near.dead = true; far.dead = true;
    return R;
  });
  ok(H.inStats.length === 3, '3 个光环属性都应登记在 STATS', H.inStats.join(','));
  ok(H.inAffix.length === 3, '3 个光环属性都应有词缀条目', H.inAffix.join(','));
  ok(H.fateAllow.length === 3, '命格应能洗出光环词条', H.fateAllow.join(','));
  ok(H.weaponDeny.length === 3, '武器不该出光环词条', H.weaponDeny.join(','));
  ok(Math.abs(H.nearSlow - 0.4) < 0.02 && H.nearSlowT > 0, '圈内敌人应被减速 40%', H.nearSlow);
  ok(H.farSlow === 0, '圈外敌人不该被减速', H.farSlow);
  ok(H.burnTick > 0, '圈内敌人应持续掉血', H.burnTick);
  ok(H.farBurn === 0, '圈外敌人不该被灼烧', H.farBurn);
  ok(H.ring === true && Math.abs(H.ringR - 4.2) < 0.1, '应有半径 4.2 的地面光环', H.ringR);
  ok(H.ringOff === true, '没有光环词缀时光环应隐藏');

  if (errs.length) {
    console.log('\n控制台错误：');
    console.log(errs.slice(0, 8).join('\n'));
  }
  ok(errs.length === 0, '控制台不应有报错', errs.slice(0, 3).join(' | '));

  console.log('\n====================================================');
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  console.log('====================================================');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
