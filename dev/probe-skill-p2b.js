#!/usr/bin/env node
/* ============================================================
 * 技能 P2b 真机探针：数量台阶（Lv3 / Lv7 各 +1 发）真的进战斗
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p2b.js
 *
 * 要证的五件事（都是「只改数据不改战斗」时会失败的）：
 *   1. 旋风斩：Lv1 扫 1 段、Lv3 扫 2 段、Lv7 扫 3 段（多段真的发生了）
 *   2. 总伤不是 2 倍 / 3 倍，而是 1.85 / 2.57 倍（多发递减真的生效）
 *   3. 火球 / 五雷符：Lv1 / Lv3 / Lv7 分别出手 1 / 2 / 3 枚
 *   4. 装备堆到 +20 也只出 9 枚（额外发数上限 8）
 *   5. 面板：已实装的台阶不带「待」，进化台阶（5 / 9 / 10）全带「待」
 *
 * 注意「真实基线」：变体 Ⅰ 与精研本身也带 count / dmg 修正，
 * 所以比「总伤倍数」时把 effSkillMods 临时收窄成**只留台阶这一层**
 * （第 2 / 3 节），否则量到的是「变体 + 精研 + 台阶」的乘积。
 * 这与「战斗真的读台阶」并不冲突 —— 第 4 / 5 节是真实（不 stub）跑的。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* 干净的施法环境：满资源、无冷却、无自动施放、无草稿 */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.gold = 999999;
    Game.running = true;
    Game.dead = false;
    UI.snapCommit('skill');
    window.__mkClean = () => {
      Game.state.mp = 99999;
      Game.cooldowns = {};
      Game._autoCast = false;
      Game._drainOn = null;
      Game._recharge = null;
      Game.state.stats.skillMods = {};
    };
    window.__mkEnemies = (n) => {
      const pp = Game.playerGroup.position;
      const out = [];
      for (let i = 0; i < n; i++) {
        /* anim.time / spd 是帧循环要读的 —— 少一个字段，
         * 探针在 await 期间就会收到「reading 'time'」的帧异常。 */
        out.push({ pos: new THREE.Vector3(pp.x + 0.6 + i * 0.3, 0, pp.z), radius: 0.5,
          dead: false, hp: 1e9, maxHp: 1e9, id: i, anim: { time: 0 }, spd: 0, atkCd: 999 });
      }
      Game.enemies = out;
      return out;
    };
  });

  /* ---------------- 1. 旋风斩：真的多扫几段 ---------------- */
  console.log('一、旋风斩（近战数量台阶）');
  const whirl = await p.evaluate(() => {
    const run = (lv) => {
      Game.state.skills = { whirl: { lv: lv } };
      window.__mkClean();
      const e = window.__mkEnemies(1)[0];
      const hits = [];
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = (en, dmg) => { if (en === e) hits.push(dmg); };
      const oldRoll = Game.rollDamage;
      Game.rollDamage = (base) => ({ dmg: base, crit: false });
      Game.castSkill('whirl');
      Game.damageEnemy = oldHit;
      Game.rollDamage = oldRoll;
      return { n: hits.length, total: hits.reduce((a, x) => a + x, 0), one: hits[0] || 0 };
    };
    const r = { lv1: run(1), lv2: run(2), lv3: run(3), lv7: run(7), lv10: run(10) };
    /* 假怪没有 actor / cfg，留到下一段 evaluate 之间就会被帧循环摸到
     * （「reading 'time'」「reading 'armorHigh'」）—— 每次量完就清场。 */
    Game.enemies = [];
    return r;
  });
  ok(whirl.lv1.n === 1, 'Lv1 只扫 1 段', whirl.lv1.n);
  ok(whirl.lv2.n === 1, 'Lv2 仍是 1 段（纯数值台阶）', whirl.lv2.n);
  ok(whirl.lv3.n === 2, 'Lv3 真的扫 2 段（双发）', whirl.lv3.n);
  ok(whirl.lv7.n === 3, 'Lv7 真的扫 3 段（三连斩）', whirl.lv7.n);
  ok(whirl.lv10.n === 3, 'Lv10 不再增加段数', whirl.lv10.n);

  /* ---------------- 2. 总伤曲线：1.85 / 2.57，不是 2 / 3 ---------------- */
  console.log('二、多发递减（只留台阶这一层量）');
  const curve = await p.evaluate(() => {
    const oldEff = Game.effSkillMods;
    /* 收窄到「只读台阶修正」：变体 Ⅰ / 精研自带 count 与 dmg，
     * 留着它们量到的就不是台阶的贡献了（第 4 / 5 节会用真实通道再验一次） */
    Game.effSkillMods = (id) => skillTierMods(id, Game.skillLevel(id));
    const run = (lv) => {
      Game.state.skills = { whirl: { lv: lv } };
      window.__mkClean();
      const e = window.__mkEnemies(1)[0];
      const hits = [];
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = (en, dmg) => { if (en === e) hits.push(dmg); };
      const oldRoll = Game.rollDamage;
      /* 直接读 rollDamage 的入参 = atk × mult × spow，不做护甲 / 标签二次修正 */
      Game.rollDamage = (base) => ({ dmg: base, crit: false });
      Game.castSkill('whirl');
      Game.damageEnemy = oldHit;
      Game.rollDamage = oldRoll;
      const st = Game.state.stats;
      const mult = 1.5 * (st.flags.thunder ? 2.2 : 1);
      const base = st.atk * mult * skillLvMul(Game.skillLevel('whirl'));
      return {
        n: hits.length, total: hits.reduce((a, x) => a + x, 0),
        one: hits[0] || 0, base: base
      };
    };
    const r1 = run(1), r3 = run(3), r7 = run(7);
    Game.effSkillMods = oldEff;
    Game.enemies = [];
    return { r1, r3, r7 };
  });
  const ratio = (a, b2) => a.total / b2.total;
  ok(Math.abs(curve.r3.total / curve.r3.base - 1.85) < 0.01,
    '双发总伤 = 1.85 × 单发基准（不是 2 倍）', curve.r3.total / curve.r3.base);
  ok(Math.abs(curve.r7.total / curve.r7.base - 2.5725) < 0.01,
    '三连斩总伤 = 2.57 × 单发基准（不是 3 倍）', curve.r7.total / curve.r7.base);
  ok(curve.r3.one < curve.r3.base, '双发的单段伤害被下调了', { one: curve.r3.one, base: curve.r3.base });
  /* 等级曲线与数量轴相乘才是玩家真实感受到的倍率：
   * Lv7 = 2.5725（数量）× 1.48（等级），而「三发不打折」会是 4.44 */
  ok(Math.abs(ratio(curve.r7, curve.r1) - 2.5725 * 1.48) < 0.05,
    'Lv7 / Lv1 = 数量 2.57 × 等级 1.48 ≈ 3.81（不是 3 发 × 1.48 = 4.44）',
    ratio(curve.r7, curve.r1));

  /* ---------------- 3. 投射物枚数 ---------------- */
  console.log('三、火球 / 五雷符（远程数量台阶）');
  const shots = await p.evaluate(() => {
    const oldEff = Game.effSkillMods;
    Game.effSkillMods = (id) => skillTierMods(id, Game.skillLevel(id));
    const run = (id, lv, enemies) => {
      Game.state.skills = { [id]: { lv: lv } };
      window.__mkClean();
      window.__mkEnemies(enemies);
      let n = 0;
      const oldProj = FX.projectile;
      FX.projectile = function () { n++; return { update() { }, dispose() { } }; };
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill(id);
      FX.projectile = oldProj;
      Game.damageEnemy = oldHit;
      return n;
    };
    const out = {
      fb1: run('fireball', 1, 1), fb3: run('fireball', 3, 1), fb7: run('fireball', 7, 1),
      tal1: run('talisman', 1, 3), tal3: run('talisman', 3, 3), tal7: run('talisman', 7, 3),
      talOneTarget: run('talisman', 7, 1)
    };
    Game.effSkillMods = oldEff;
    Game.enemies = [];
    return out;
  });
  ok(shots.fb1 === 1, '火球 Lv1 发 1 枚', shots.fb1);
  ok(shots.fb3 === 2, '火球 Lv3 发 2 枚', shots.fb3);
  ok(shots.fb7 === 3, '火球 Lv7 发 3 枚', shots.fb7);
  ok(shots.tal1 === 1, '五雷符 Lv1 发 1 张', shots.tal1);
  ok(shots.tal3 === 2, '五雷符 Lv3 发 2 张（分别追不同目标）', shots.tal3);
  ok(shots.tal7 === 3, '五雷符 Lv7 发 3 张', shots.tal7);
  ok(shots.talOneTarget === 1, '只有一只怪时多张符不会凭空变出来（最多 1 张）', shots.talOneTarget);

  /* ---------------- 4. 来源相加 + 上限 ---------------- */
  console.log('四、来源相加与上限');
  const stack = await p.evaluate(() => {
    const run = (mods, lv) => {
      Game.state.skills = { fireball: { lv: lv } };
      window.__mkClean();
      window.__mkEnemies(1);
      Game.state.stats.skillMods = mods;
      let n = 0;
      const oldProj = FX.projectile;
      FX.projectile = function () { n++; return { update() { }, dispose() { } }; };
      Game.castSkill('fireball');
      FX.projectile = oldProj;
      Game.state.stats.skillMods = {};
      return n;
    };
    const o = {
      lv1Real: run({}, 1),                 // 真实通道：变体 Ⅰ（连环）本来就带 count
      plus20: run({ fireball: { count: 20 } }, 7),
      cap: skillCountCap(),
      mods: Game.effSkillMods ? 'ok' : 'missing'
    };
    Game.enemies = [];
    return o;
  });
  ok(stack.cap === 8, '上限常量 = 8', stack.cap);
  ok(stack.lv1Real >= 1, 'Lv1 真实通道下发的枚数 ≥ 1（变体自带 count 时更多）', stack.lv1Real);
  ok(stack.plus20 === 9, '堆到 +20 也只出 9 枚（基础 1 + 上限 8）', stack.plus20);

  /* ---------------- 5. 面板「待实装」标记 ---------------- */
  console.log('五、面板「待实装」标记');
  const panel = await p.evaluate(() => {
    Game.state.cls = 'warrior';
    Game.state.skills = {};
    Game.recalc();
    document.getElementById('skillPanel').classList.add('open');
    UI.skSel = 'whirl';
    UI.renderSkillPanel();
    const open = document.querySelector('#skList .sk-arch');
    if (open) open.setAttribute('open', '');
    const cards = [...document.querySelectorAll('#skList .sk-ac')];
    const perCard = cards.map(c => {
      const steps = [...c.querySelectorAll('.sk-as')];
      return {
        total: steps.length,
        todoLv: steps.filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent),
        badge: steps.filter(s => s.querySelector('u')).length
      };
    });
    const tip = (document.querySelector('#skList .sk-arch-tip') || {}).textContent || '';
    return { perCard, tip: tip.replace(/\s+/g, ' ') };
  });
  ok(panel.perCard.length === 5, '5 张技能位卡都在', panel.perCard.length);
  ok(panel.perCard.every(c => c.total === 6), '每张卡 6 个台阶（1/3/5/7/9/10）', panel.perCard.map(c => c.total));
  ok(panel.perCard[0].todoLv.join(',') === '',
    '刀客 ① 三个进化台阶都已接（不再带「待」）', panel.perCard[0].todoLv);
  ok(panel.perCard[1].todoLv.join(',') === '3,5,7,9,10',
    '刀客 ② 的 3 / 7 也带「待」（位内没有吃 count 通道的技能）', panel.perCard[1].todoLv);
  ok(panel.perCard.every(c => c.badge === c.todoLv.length), '每个「待」台阶都带角标（不只是压暗）',
    panel.perCard.map(c => [c.badge, c.todoLv.length]));
  ok(/1\.85/.test(panel.tip) && /2\.57/.test(panel.tip), '卡区说明写着 1.85 / 2.57 倍', panel.tip.slice(0, 140));
  ok(/待/.test(panel.tip), '卡区说明写明「带待的是还没接的部分」', panel.tip.slice(-70));

  const magePanel = await p.evaluate(() => {
    Game.state.cls = 'mage';
    Game.state.skills = {};
    Game.recalc();
    UI.renderSkillPanel();
    const open = document.querySelector('#skList .sk-arch');
    if (open) open.setAttribute('open', '');
    const c = document.querySelector('#skList .sk-ac');
    const steps = [...c.querySelectorAll('.sk-as')];
    return steps.filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
  });
  ok(magePanel.join(',') === '',
    '法师 ① 全部台阶已接（数量 + 进化）', magePanel);

  const taoPanel = await p.evaluate(() => {
    Game.state.cls = 'taoist';
    Game.state.skills = {};
    Game.recalc();
    UI.renderSkillPanel();
    const open = document.querySelector('#skList .sk-arch');
    if (open) open.setAttribute('open', '');
    const c = document.querySelector('#skList .sk-ac');
    const steps = [...c.querySelectorAll('.sk-as')];
    return steps.filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
  });
  ok(taoPanel.join(',') === '',
    '道士 ① 全部台阶已接（数量 + 进化）', taoPanel);

  const taoSlot2 = await p.evaluate(() => {
    /* 面板会被帧循环重绘（重绘后 <details> 收回去，DOM 也可能整块换掉）——
     * 量之前先自己渲染一次，别读一份别人的缓存。 */
    Game.state.cls = 'taoist';
    Game.state.skills = {};
    Game.recalc();
    UI.renderSkillPanel();
    const arch = document.querySelector('#skList .sk-arch');
    if (arch) arch.setAttribute('open', '');
    const c = [...document.querySelectorAll('#skList .sk-ac')][1];
    return [...c.querySelectorAll('.sk-as')]
      .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
  });
  /* 毒雾这一位现在是「真的全接」：Lv3 / Lv7 的双团三团走 count 通道，
   * Lv5 / 9 / 10 走行为键 —— 所以面板不该再有「待」。 */
  ok(taoSlot2.join(',') === '',
    '道士 ② 全部台阶已接（双团 / 三团 + 蔓延 / 跟随 / 尸毒）', taoSlot2);

  /* ---------------- 6. 卡上预览与战斗同口径 ---------------- */
  console.log('六、预览与战斗同口径');
  const preview = await p.evaluate(() => {
    Game.state.cls = 'warrior';
    Game.state.skills = { whirl: { lv: 7 } };
    Game.state.stats.skillMods = {};
    Game.recalc();
    UI.skSel = 'whirl';
    UI.renderSkillPanel();
    const card = document.querySelector('#skList .sk-right .sd-desc');
    const nums = ((card ? card.textContent : '').match(/\d+/g) || []).map(Number);
    const smod = Game.effSkillMods('whirl');
    const spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * skillLvMul(Game.skillLevel('whirl'));
    return {
      nums, smod,
      want: Math.round(Game.state.stats.atk * SKILLS.whirl.mult * spow)
    };
  });
  ok(preview.smod && preview.smod.count === 2, 'Lv7 的 effSkillMods 里有 count +2', preview.smod);
  ok(preview.smod && preview.smod.dmg < 0, 'effSkillMods 里带着单发惩罚', preview.smod && preview.smod.dmg);
  ok(preview.nums.indexOf(preview.want) >= 0,
    '卡上预览伤害 == atk × 倍率 × 修正（与战斗同一函数）', { want: preview.want, nums: preview.nums });

  /* ---------------- 7. 说明页 ---------------- */
  console.log('七、说明页');
  const codex = await p.evaluate(() => {
    /* 说明页是一页一页渲染的（hpTab），「数量台阶」在「术法与变体」那一页 ——
     * 逐页翻到找到为止，别写死页签序号（加一节就会错位） */
    let t = '';
    const oldTab = UI.hpTab;
    for (let i = 0; i < 20; i++) {
      UI.hpTab = i;
      UI.renderHelp();
      t = (document.getElementById('helpBody') || {}).textContent || '';
      if (t.indexOf('数量台阶') >= 0) break;
    }
    UI.hpTab = oldTab;
    const i = t.indexOf('数量台阶');
    return i < 0 ? '' : t.slice(i, i + 460).replace(/\s+/g, ' ');
  });
  ok(!!codex, '说明页有「数量台阶」一行');
  ok(/已接进战斗/.test(codex), '说明页写明这条已经接进战斗', codex.slice(0, 60));
  ok(/0\.85/.test(codex), '说明页写着递减系数 0.85', codex.slice(0, 120));
  ok(/1\.85/.test(codex) && /2\.57/.test(codex), '说明页写着 1.85 / 2.57 倍', codex.slice(0, 200));
  ok(/上限\s*8/.test(codex), '说明页写着额外发数上限 8', codex.slice(0, 260));

  /* ---------------- 9. 进化台阶真的生效 ---------------- */
  console.log('九、进化台阶（Lv5 / Lv9 / Lv10）');
  const evo = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    /* 假敌人没有 actor / bar，帧循环一跑就报「reading 'time'」——
     * 这一节只量技能行为，不需要怪物 AI，整段把 updateEnemies 停掉。 */
    const savedUE = Game.updateEnemies;
    Game.updateEnemies = () => { };
    const setup = (id, lv, n, form) => {
      /* mapGen++：`c.later` 只在同图内执行。不换图的话，上一个测试留下的
       * 旋转 / 环绕 / 吸怪定时器会打进下一个测试的计数器里（实测把「补一段」
       * 量成了 9 段）。换图是唯一能一次性作废旧定时器的开关。 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.skills = { [id]: { lv: lv } };
      /* 变体不传就用默认 0 号。刀客 ① 的 0 号是「疾风」，自带 move 补段 ——
       * 所以量台阶时显式切 1 号「不竭」：不打伤害也不位移，最干净。 */
      if (form != null) Game.state.skills[id].f = form;
      Game.state.stats.skillMods = {};
      window.__mkClean();
      window.__mkEnemies(n);
      Game.recalc();
      /* 装备 / 命格加成是 recalc **算出来**的（stats.skillLv / skillRank）——
       * 必须放在 recalc 之后再清。清早了会被重算回来，于是「Lv2」量到的是
       * 5 级（带台阶），第一次跑就是这么红的。 */
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      return Game.enemies;
    };
    const out = {};

    /* --- whirl Lv5：一发变一段（0.5 秒后跟着人再扫一次） --- */
    const spinRun = async (lv) => {
      setup('whirl', lv, 1, 1);
      let n = 0;
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { n++; };
      Game.castSkill('whirl');
      const first = n;
      await wait(1300);          // 余震是「每秒一跳」，700ms 只能看到 0
      Game.damageEnemy = oldHit;
      return { first, after: n };
    };
    out.w2 = await spinRun(2);
    out.w5 = await spinRun(5);

    /* --- whirl Lv9：吸怪（3.2 码外的怪被拉近） --- */
    const gatherRun = async (lv) => {
      const es = setup('whirl', lv, 1, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x + 3.2, 0, pp.z);
      const before = Math.hypot(es[0].pos.x - pp.x, es[0].pos.z - pp.z);
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('whirl');
      await wait(80);
      Game.damageEnemy = oldHit;
      return { before, after: Math.hypot(es[0].pos.x - pp.x, es[0].pos.z - pp.z) };
    };
    out.g8 = await gatherRun(8);
    out.g9 = await gatherRun(9);

    /* --- whirl Lv10：回怒翻倍（同步读，避开每秒自然回蓝） --- */
    const rageRun = (lv) => {
      setup('whirl', lv, 1, 1);
      Game.state.stats.mpMax = 9999;
      Game.state.mp = 200;
      const before = Game.state.mp;
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('whirl');
      const delta = Game.state.mp - before;
      Game.damageEnemy = oldHit;
      return { delta };
    };
    out.r9 = rageRun(9);
    out.r10 = rageRun(10);

    /* --- fireball Lv5：爆炸半径 +50%、爆炸处留火海 --- */
    const fbRun = (lv) => {
      const es = setup('fireball', lv, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x + 2, 0, pp.z);
      Game.aimPoint = new THREE.Vector3(pp.x + 2, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      let rad = 0, patch = 0;
      const oldExp = Game.explodeAt, oldProj = FX.projectile, oldHit = Game.damageEnemy;
      const oldPatch = Game.createFirePatch;
      /* 直接触发 onHit：不走真弹道，免得量到的是飞行时间 */
      FX.projectile = (o) => { o.onHit(es[0], { pos: es[0].pos.clone(), dmg: 1 }); return { update() { }, dispose() { } }; };
      Game.explodeAt = (c, r) => { rad = Math.max(rad, r); };
      Game.createFirePatch = () => { patch++; };
      Game.damageEnemy = () => { };
      Game.castSkill('fireball');
      FX.projectile = oldProj; Game.explodeAt = oldExp; Game.damageEnemy = oldHit;
      Game.createFirePatch = oldPatch;
      return { rad, patch };
    };
    out.f4 = fbRun(4);
    out.f5 = fbRun(5);

    /* --- fireball Lv9：环绕火球（0.5 秒后绕自己补伤害） --- */
    const orbitRun = async (lv) => {
      setup('fireball', lv, 1);
      let n = 0;
      const oldHit = Game.damageEnemy, oldProj = FX.projectile;
      /* 把弹道吃掉：否则 700ms 里量到的是「火球飞到怪身上」，
       * 跟环绕没有半点关系（Lv8 也能量出 5 次）。 */
      FX.projectile = () => ({ update() { }, dispose() { } });
      Game.damageEnemy = () => { n++; };
      Game.castSkill('fireball');
      const first = n;
      await wait(700);
      FX.projectile = oldProj;
      Game.damageEnemy = oldHit;
      return { first, after: n };
    };
    out.o8 = await orbitRun(8);
    out.o9 = await orbitRun(9);

    /* --- fireball Lv10：自动索敌（瞄空地也朝最近目标出手） --- */
    const aimRun = (lv) => {
      const es = setup('fireball', lv, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x, 0, pp.z - 3);                              // 目标在 −z
      Game.aimPoint = new THREE.Vector3(pp.x + 6, 0, pp.z + 6);       // 玩家瞄在 +z 空地
      Game.aimDir = new THREE.Vector3(0.7, 0, 0.7).normalize();
      let dz = null;
      const oldProj = FX.projectile, oldHit = Game.damageEnemy;
      FX.projectile = (o) => { dz = o.dir.z; return { update() { }, dispose() { } }; };
      Game.damageEnemy = () => { };
      Game.castSkill('fireball');
      FX.projectile = oldProj; Game.damageEnemy = oldHit;
      return { dz };
    };
    out.a9 = aimRun(9);
    out.a10 = aimRun(10);

    /* --- 变体覆盖台阶：Lv9 台阶 gather 3.4，变体「聚怪」gather 4 —— 变体必须赢 --- */
    {
      setup('whirl', 9, 1, 2);
      const beh = Game.branchBeh('whirl');
      out.ovr = { gather: beh && beh.gather, every: beh && beh.gatherEvery };
    }

    /* ---------------- 道士 ① 符箓：三条台阶都在「落雷点」 ----------------
     * 这一节的核心不是「有没有效果」，而是「效果落在哪」：
     * 走通用 hit 通道会以准星为圆心，而符会追到怪身上 —— 两者恒不重合，
     * 于是「连锁」会连到一屏之外的空气里。所以这里显式制造
     * 「准星在 +x 12 码、怪在脚边」的错位场景。 */
    const talRun = (lv, n) => {
      const es = setup('talisman', lv, n);
      const pp = Game.playerGroup.position;
      /* 准星故意打到 12 码外：如果连锁拿准星当圆心，一个都跳不到 */
      Game.aimPoint = new THREE.Vector3(pp.x + 12, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const hits = [];
      let zones = 0, zoneRad = 0, zoneDur = 0;
      const oldProj = FX.projectile, oldHit = Game.damageEnemy, oldRoll = Game.rollDamage;
      const oldSig = Game.createSigilField;
      /* 只留台阶这一层：变体 Ⅰ「双符」自带 count +1，不掐掉的话
       * 「Lv4 打几张」量到的是 2 张，连锁的基线全错位。 */
      const oldEff = Game.effSkillMods;
      Game.effSkillMods = (id) => skillTierMods(id, Game.skillLevel(id));
      Game.createSigilField = (pos, r, dmg, dur) => { zones++; zoneRad = Math.max(zoneRad, r); zoneDur = dur; };
      FX.projectile = (o) => {
        o.onHit(es[0], { pos: es[0].pos.clone(), hitSet: null, seekUsed: 0 });
        return { update() { }, dispose() { } };
      };
      Game.damageEnemy = (en, dmg) => { hits.push({ id: en.id, dmg }); };
      Game.rollDamage = (base) => ({ dmg: base, crit: false });
      Game.castSkill('talisman');
      FX.projectile = oldProj; Game.damageEnemy = oldHit; Game.rollDamage = oldRoll;
      Game.createSigilField = oldSig;
      Game.effSkillMods = oldEff;
      return { n: hits.length, ids: hits.map(h => h.id), dmg: hits.map(h => Math.round(h.dmg)), zones, zoneRad, zoneDur };
    };
    out.tl2 = talRun(2, 3);
    out.tl5 = talRun(5, 3);
    out.tl8 = talRun(8, 3);
    out.tl9 = talRun(9, 3);

    /* --- 符箓 Lv10：命中后改追下一个目标（有预算，不会无限连） --- */
    const seekRun = (lv) => {
      const es = setup('talisman', lv, 2);
      const pp = Game.playerGroup.position;
      Game.aimPoint = new THREE.Vector3(es[0].pos.x, 0, es[0].pos.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const bases = [];
      let cap = null;
      const oldProj = FX.projectile, oldHit = Game.damageEnemy, oldRoll = Game.rollDamage;
      const oldSig = Game.createSigilField;
      const oldEff = Game.effSkillMods;
      Game.effSkillMods = (id) => skillTierMods(id, Game.skillLevel(id));
      Game.createSigilField = () => { };
      FX.projectile = (o) => { cap = o; return { update() { }, dispose() { } }; };
      Game.damageEnemy = () => { };
      Game.rollDamage = (base) => { bases.push(base); return { dmg: base, crit: false }; };
      Game.castSkill('talisman');
      const proj = { pos: es[0].pos.clone(), hitSet: new Set(), seekUsed: 0 };
      cap.onHit(es[0], proj);
      const a1 = { pierce: !!proj.pierce, homingX: proj.homing ? Math.round(proj.homing.x * 100) / 100 : null, used: proj.seekUsed || 0 };
      cap.onHit(es[1], proj);
      const a2 = { used: proj.seekUsed || 0 };
      FX.projectile = oldProj; Game.damageEnemy = oldHit; Game.rollDamage = oldRoll;
      Game.createSigilField = oldSig; Game.effSkillMods = oldEff;
      return { a1, a2, bases: bases.map(b => Math.round(b * 100) / 100), ex: Math.round(es[1].pos.x * 100) / 100 };
    };
    out.sk9 = seekRun(9);
    out.sk10 = seekRun(10);

    /* ---------------- 道士 ② 毒雾：蔓延 / 跟随 / 尸毒 ----------------
     * 三条都用现成通道，所以这里要证的不是「有没有」，而是两件更容易翻车的事：
     *   ① 蔓延的**判定半径**跟着特效一起长大（只长特效 = 看着罩住、伤害没到）
     *   ② 台阶的尸毒比变体的大（照抄变体 = 选过尸毒的人点 Lv10 毫无反应） */
    const pset = (lv) => {
      Game.state.cls = 'taoist';                       // barSkillOk 按职业判
      /* 变体固定切 2 号「化脓」（纯数值，没有任何 beh）：0 号是「尸毒」，
       * 留着它的话 Lv9 就已经会爆毒，把「Lv10 才给爆毒」量成假的。 */
      const es = setup('poison', lv, 2, 2);
      const pp = Game.playerGroup.position;
      /* 双团之后雾心不在落点：patches 沿圆周散开，偏移 = prad × 0.55 = 2.75。
       * 所以「基础打不到、蔓延后打得到」的那只必须按**雾心**算距离（5.7 码），
       * 按落点算会量出「Lv4 也打得到」的假结果。 */
      es[0].pos.set(pp.x + 3.0, 0, pp.z);              // 基础半径内
      es[1].pos.set(pp.x + 2.75 + 5.7, 0, pp.z);       // 雾心外 5.7 码：只有长大后才罩到
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      return es;
    };
    const poisonGrow = async (lv) => {
      const es = pset(lv);
      const ids = new Set();
      const scales = [];
      const oldArea = FX.area, oldHit = Game.damageEnemy, oldFollow = Game.attachFollow;
      FX.area = () => ({ scale: { setScalar(v) { scales.push(Math.round(v * 100) / 100); } } });
      Game.attachFollow = () => { };
      Game.damageEnemy = (en) => { ids.add(en.id); };
      Game.castSkill('poison');
      await wait(1800);                                 // 两跳（0.8s / 跳）
      FX.area = oldArea; Game.damageEnemy = oldHit; Game.attachFollow = oldFollow;
      return { ids: [...ids], scales, last: scales.length ? scales[scales.length - 1] : 0 };
    };
    out.p4 = await poisonGrow(4);
    out.p5 = await poisonGrow(5);

    /* 双团 / 三团：毒雾以前只有一团，面板写着「双团」却只铺一团 ——
     * 这属于「点了不生效」，比不写更糟。 */
    const poisonPatches = (lv) => {
      pset(lv);
      let n = 0;
      const oldArea = FX.area, oldHit = Game.damageEnemy, oldFollow = Game.attachFollow;
      FX.area = () => { n++; return { scale: { setScalar() { } } }; };
      Game.attachFollow = () => { }; Game.damageEnemy = () => { };
      Game.castSkill('poison');
      FX.area = oldArea; Game.damageEnemy = oldHit; Game.attachFollow = oldFollow;
      return n;
    };
    out.pp2 = poisonPatches(2);
    out.pp3 = poisonPatches(3);
    out.pp7 = poisonPatches(7);

    const poisonFollow = (lv) => {
      pset(lv);
      let n = 0;
      const oldFollow = Game.attachFollow, oldHit = Game.damageEnemy;
      Game.attachFollow = () => { n++; };
      Game.damageEnemy = () => { };
      Game.castSkill('poison');
      Game.attachFollow = oldFollow; Game.damageEnemy = oldHit;
      return n;
    };
    out.p8f = poisonFollow(8);
    out.p9f = poisonFollow(9);

    const poisonSpread = (lv) => {
      const es = pset(lv);
      let n = 0, rad = 0;
      const oldPatch = Game.spawnPoisonPatch;
      Game.spawnPoisonPatch = (pos, r) => { n++; rad = r; };
      const e = es[0];
      e.venomT = 2; e.dead = true;
      Game.onBehKill(e);
      Game.spawnPoisonPatch = oldPatch;
      return { n, rad };
    };
    out.p9s = poisonSpread(9);
    out.p10s = poisonSpread(10);

    /* 假怪没有 actor / armorHigh，帧循环一恢复就会摸到它们（实测报
     * 「reading 'time'」与「reading 'armorHigh'」）。量完清场再恢复。 */
    Game.enemies = [];
    Game.updateEnemies = savedUE;
    return out;
  });
  ok(evo.w2.after === evo.w2.first, 'Lv2 旋风斩只打一次（没有补段）', evo.w2);
  ok(evo.w2.first === 1, 'Lv2 只有 1 段（数量台阶从 3 级才起）', evo.w2);
  ok(evo.w5.after > evo.w5.first, 'Lv5 旋风斩 0.5 秒后真的补了一段', evo.w5);
  ok(evo.g8.after > 3.0, 'Lv8 不吸怪（怪还在 3.2 码外）', evo.g8);
  ok(evo.g9.after < evo.g9.before - 0.4, 'Lv9 把 3.2 码外的怪拉近了', evo.g9);
  ok(evo.r10.delta - evo.r9.delta === 8, 'Lv10 回怒从 8 点变 16 点（翻倍）', { r9: evo.r9, r10: evo.r10 });
  ok(evo.f5.rad > evo.f4.rad * 1.3, 'Lv5 爆炸半径明显变大（+50%）', { f4: evo.f4.rad, f5: evo.f5.rad });
  ok(evo.f5.patch > 0 && evo.f4.patch === 0, 'Lv5 爆炸处留火海（Lv4 不留）', { f4: evo.f4.patch, f5: evo.f5.patch });
  ok(evo.o8.after === evo.o8.first, 'Lv8 火球没有环绕段', evo.o8);
  ok(evo.o9.after > evo.o9.first, 'Lv9 火球放完还会绕着自己补伤害', evo.o9);
  ok(evo.a9.dz > 0.3, 'Lv9 瞄哪打哪（朝 +z 飞）', evo.a9);
  ok(evo.a10.dz < -0.5, 'Lv10 自动索敌（改朝 −z 的敌人飞）', evo.a10);
  ok(evo.ovr.gather === 4,
    '变体「聚怪」覆盖台阶参数（4 码而不是台阶的 3.4）', evo.ovr);
  /* --- 道士 ① 符箓 --- */
  ok(evo.tl2.n === 1, 'Lv2 符箓只打中一张（没有连锁）', evo.tl2.n);
  /* Lv5 有两张符（Lv3 的数量台阶），每张各自「1 主 + 2 连锁」 */
  ok(evo.tl5.n === 6, 'Lv5 雷符连锁：2 张符 ×（主目标 + 2 连锁）', evo.tl5);
  ok(evo.tl5.ids.join(',') === '0,1,2,0,1,2', '连锁跳到的是**身边**的怪，不是准星 12 码外的空气', evo.tl5.ids);
  ok(Math.abs(evo.tl5.dmg[1] / evo.tl5.dmg[0] - 0.6) < 0.02,
    '连锁第一跳是 60% 伤害', { base: evo.tl5.dmg[0], c1: evo.tl5.dmg[1] });
  ok(evo.tl5.dmg[2] < evo.tl5.dmg[1], '连锁第二跳继续递减（0.85^n，不是都打满）', evo.tl5.dmg);
  ok(evo.tl8.zones === 0 && evo.tl9.zones >= 1,
    'Lv9 才铺符阵（Lv8 一张都不铺）', { tl8: evo.tl8.zones, tl9: evo.tl9.zones });
  ok(evo.tl9.zoneDur === 2 && evo.tl9.zoneRad > 3,
    '符阵落在命中点、持续 2 秒、半径跟范围修正走', { rad: evo.tl9.zoneRad, dur: evo.tl9.zoneDur });
  ok(evo.sk9.a1.pierce === false, 'Lv9 符打完就消失（不会自己追下一个）', evo.sk9.a1);
  ok(evo.sk10.a1.pierce === true && Math.abs(evo.sk10.a1.homingX - evo.sk10.ex) < 0.01,
    'Lv10 命中后自动改追第二个目标', evo.sk10.a1);
  ok(evo.sk10.a2.used === 2, '改追有预算（追 2 次就停，不会一符清场）', evo.sk10.a2);
  /* --- 道士 ② 毒雾 --- */
  ok(evo.pp2 === 1 && evo.pp3 === 2 && evo.pp7 === 3,
    '毒雾 Lv2 / Lv3 / Lv7 分别铺 1 / 2 / 3 团（「双团 / 三团」是真的）',
    { lv2: evo.pp2, lv3: evo.pp3, lv7: evo.pp7 });
  ok(evo.p4.ids.join(',') === '0' && evo.p4.scales.length === 0,
    'Lv4 毒雾不蔓延：只毒到 3 码内那只，半径不动', evo.p4);
  ok(evo.p5.scales.length > 0 && evo.p5.last > 5,
    'Lv5 毒雾真的长大（特效半径 > 基础 5 码）', evo.p5.scales);
  ok(evo.p5.ids.indexOf(1) >= 0,
    'Lv5 判定半径跟着长大（雾心外 5.7 码那只也被毒到，不是只改特效）', evo.p5.ids);
  /* Lv9 已经有三团（Lv7 的数量台阶），每团各自跟随 —— 所以是 3 次不是 1 次 */
  ok(evo.p8f === 0 && evo.p9f === 3, 'Lv9 才跟随（Lv8 不跟随，Lv9 三团都跟）', { p8: evo.p8f, p9: evo.p9f });
  ok(evo.p9s.n === 0, 'Lv9 死了不爆毒', evo.p9s);
  ok(evo.p10s.n === 1 && Math.abs(evo.p10s.rad - 4.2) < 0.01,
    'Lv10 死亡爆毒，且比变体「尸毒」的 3.2 码更大', evo.p10s);
  ok(evo.sk10.bases.some(b => Math.abs(b / evo.sk10.bases[0] - 0.7) < 0.02),
    '改追那一下按 70% 结算（不是白送一次全额）', evo.sk10.bases);

  /* ---------------- 8. 零报错 ---------------- */
  console.log('八、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2b 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
