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
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + (e.stack ? '\n' + String(e.stack).split('\n').slice(0, 4).join('\n') : '')));

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
     * （「reading 'time'」「reading 'armorHigh'」）—— 每次量完就清场。
     * 余震 / 环绕这类定时器还要靠换图才作废（`c.later` 判 mapGen），
     * 只清数组不够：定时器到点会重新 filter 一遍新的假怪。 */
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
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
  ok(panel.perCard[1].todoLv.join(',') === '3,7',
    '刀客 ② 只剩 3 / 7 带「待」（位内没有吃 count 通道的技能）', panel.perCard[1].todoLv);
  ok(panel.perCard[2].todoLv.join(',') === '3,7',
    '刀客 ③ 的 5 / 9 / 10 已接，只剩「双圈 / 三圈」（swordarray 不吃 count 通道）',
    panel.perCard[2].todoLv);
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
    '道士 ② 全部台阶已接（双团 / 三团 + 蔓延 / 减速 / 尸毒）', taoSlot2);

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
      /* 第二跳在 2 秒，还在路上 —— 不换图的话它到点会拿真 damageEnemy
       * 去打假怪（报 reading 'armorHigh'） */
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.enemies = [];
      return { first, after: n };
    };
    out.w2 = await spinRun(2);
    out.w5 = await spinRun(5);

    /* --- whirl Lv9：撕裂（命中的敌人挂易伤） ---
     * 原写「吸怪」（gather），但那是变体「聚怪」的键 —— 撞键的台阶对选过
     * 聚怪的玩家等于不存在。改测易伤：e.vuln 是伤害管线里真在用的字段。 */
    const tearRun = (lv) => {
      const es = setup('whirl', lv, 1, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x + 1.5, 0, pp.z);
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('whirl');
      const vuln = es[0].vuln || 0, vulnT = es[0].vulnT || 0;
      Game.damageEnemy = oldHit;
      /* Lv5 台阶的余震是定时器（1s / 2s 两跳）。不换图的话它会在**这之后**
       * 拿已经复原的真 damageEnemy 去摸这些没有 cfg 的假怪 ——
       * 报「Cannot read properties of undefined (reading 'armorHigh')」。
       * `c.later` 判 mapGen，所以换图是一次性作废旧定时器的开关。 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.enemies = [];
      return { vuln, vulnT };
    };
    out.t8 = tearRun(8);
    out.t9 = tearRun(9);

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
      /* 同 tearRun：Lv9 / Lv10 也带余震定时器，量完就作废 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.enemies = [];
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

    /* --- 变体覆盖台阶（用毒雾 Lv10 验，它有一条合法的「撞名 + 加参数」）---
     * spread 是变体「尸毒」的键，台阶也用它 —— 合并后**变体的值必须赢**
     * （花点选的盖过等级送的）；但台阶带的 spreadRad 分支没有，要活下来，
     * 否则「已经选了尸毒的玩家升到 10 级毫无反应」。 */
    {
      setup('poison', 10, 1, 0);          // 0 号变体 = 尸毒
      const beh = Game.branchBeh('poison');
      out.ovr = { spread: beh && beh.spread, rad: beh && beh.spreadRad };
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

    /* ---------------- 道士 ② 毒雾：蔓延 / 减速 / 尸毒 ----------------
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

    /* 雾内减速（Lv9）：原写「毒雾跟随」，撞了变体「追随」的 follow 键 ——
     * 选过追随的玩家这一级等于没有。改测每跳刷新的 e.slow。 */
    const poisonSlow = async (lv) => {
      const es = pset(lv);
      const oldArea = FX.area, oldHit = Game.damageEnemy, oldFollow = Game.attachFollow;
      FX.area = () => ({ scale: { setScalar() { } } });
      Game.attachFollow = () => { };
      Game.damageEnemy = () => { };
      es[0].slow = 0; es[0].slowT = 0;
      Game.castSkill('poison');
      await wait(900);                                   // 至少一跳（0.8s / 跳）
      const s = { slow: es[0].slow || 0, slowT: es[0].slowT || 0 };
      FX.area = oldArea; Game.damageEnemy = oldHit; Game.attachFollow = oldFollow;
      /* 雾的定时器还能再跑 5 秒，而 damageEnemy 已经复原成真的了 ——
       * 不清掉的话下一跳就去摸没有 cfg 的假怪，报「reading 'armorHigh'」。 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      return s;
    };
    out.p8sl = await poisonSlow(8);
    out.p9sl = await poisonSlow(9);

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

    /* ---------------- 刀客 ② 地裂：余震 / 扩范围 / 二次崩塌 ----------------
     * 这一位全走通用 hit 通道 —— 地裂是「落点为中心」的地面技能，
     * 通用通道的圆心正好对得上（符箓那边必须绕开，这里反过来可以直用）。 */
    const quakeRun = async (lv, off) => {
      const es = setup('quake', lv, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x + off, 0, pp.z);
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z);     // 砸自己脚下
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const hits = [];
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = (en, dmg) => { if (en === es[0]) hits.push(Math.round(dmg)); };
      /* 抓到「余震 handler 到底收到了什么」—— 比事后读 e.stun 稳：
       * 默认变体「三连震」会在零点几秒里再放两发，每发都把 stun 打回 1.6，
       * 读 stun 永远读不到 0.5。 */
      let pin;
      const oldRun = SKILL_BEH.aftershock.run;
      SKILL_BEH.aftershock.run = (c, v, b) => { pin = b.aftershockStun; return oldRun(c, v, b); };
      Game.castSkill('quake');
      const first = hits.length;
      await wait(600);                                       // echo 是 0.45 秒后
      const echo = hits.length;
      /* 余震是「每秒一跳、共 2 跳」：只等 1.2 秒的话第二跳会落在
       * damageEnemy 复原之后，真 damageEnemy 去摸没有 cfg 的假怪 →
       * 「reading 'armorHigh'」的帧异常。等满 2.3 秒。 */
      await wait(2300);
      SKILL_BEH.aftershock.run = oldRun;
      Game.damageEnemy = oldHit;
      return { first, echo, after: hits.length, hits, pin };
    };
    out.q4 = await quakeRun(4, 0);
    out.q5 = await quakeRun(5, 0);
    out.q8 = await quakeRun(8, 6.6);       // 基础 5.8 码外、Lv9 扩范围后进圈
    out.q9 = await quakeRun(9, 6.6);
    out.q10 = await quakeRun(10, 0);

    /* ---------------- 刀客 ③ 剑阵：减速 / 减伤 / 反击 ----------------
     * 三条台阶的共同前提是「人还在阵里」，所以量法必须分两种站位：
     * 阵铺在脚下（在阵内）与阵铺在十码外（在阵外）。
     * 只量「有没有 buff」的话，一个无条件常驻的假实现也能全绿 ——
     * 而钉阵变体（默认 0 号就是它）本来就能让玩家走出去。 */
    const swRun = async (lv, far) => {
      Game.state.cls = 'warrior';
      const es = setup('swordarray', lv, 1);
      const pp = Game.playerGroup.position;
      es[0].pos.set(pp.x + 1.2, 0, pp.z);            // 圈内
      Game.aimPoint = new THREE.Vector3(far ? pp.x + 10 : pp.x, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('swordarray');
      await wait(700);                                // 剑阵 600ms 一跳
      Game.damageEnemy = oldHit;
      const o = { field: !!Game.swordField, slow: es[0].slow || 0, slowT: es[0].slowT || 0 };
      /* 量完就换图：剑阵的 setInterval 要跑 8 秒，不掐掉的话后面几段
       * 会被它打进新的假怪数组里（同「探针自身的坑」第 ④ 条）。 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      return o;
    };
    out.sw4 = await swRun(4);
    out.sw5 = await swRun(5);

    /* 减伤：只留「剑阵这一层」，其余乘数两次相同，比的是比值 */
    const swGuard = async (lv, out) => {
      Game.state.cls = 'warrior';
      setup('swordarray', lv, 1);
      const pp = Game.playerGroup.position;
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('swordarray');
      Game.damageEnemy = oldHit;
      const st = Game.state.stats;
      /* 三个会让读数漂的东西：闪避 / 格挡 / 反伤。
       * 不掐掉的话一次「闪避」就把这一发量成 0 伤害。 */
      const keep = { dodge: st.dodge, block: st.block, thorns: st.thorns };
      st.dodge = 0; st.block = 0; st.thorns = 0;
      Game.shield = 0; Game.invuln = 0; Game.talismanCharges = 0;
      /* 剑阵是 selfCast，落点恒在自己脚下，钉阵变体把它钉在**施法时**的位置
       * （aim 是 aimPoint 的 clone）—— 所以「走出阵外」只能真把人挪走。 */
      const save = pp.clone();
      if (out) pp.set(pp.x + 20, pp.y, pp.z);
      /* 血量每段必须复位：默认角色只有 2000 出头，前一发打空了血条，
       * 这一发的「损失」就被血量上限卡住，量出来的是「还剩多少血」而不是伤害。 */
      Game.dead = false; Game.state.hp = st.hpMax;
      const before = Game.state.hp;
      Game.damagePlayer(200, null);
      const loss = Math.round((before - Game.state.hp) * 100) / 100;
      if (out) pp.copy(save);
      st.dodge = keep.dodge; st.block = keep.block; st.thorns = keep.thorns;
      const o = { loss, field: !!Game.swordField };
      Game.mapGen = (Game.mapGen || 0) + 1;           // 同上：把剑阵定时器作废
      return o;
    };
    out.sg8 = await swGuard(8, false);
    out.sg9 = await swGuard(9, false);
    out.sg9out = await swGuard(9, true);

    /* 反击：一次挨打反一次，0.4 秒内第二下不再反（不记账等于群体秒杀） */
    const swCounter = (lv) => {
      Game.state.cls = 'warrior';
      setup('swordarray', lv, 1);
      const pp = Game.playerGroup.position;
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z);
      Game.aimDir = new THREE.Vector3(1, 0, 0);
      const src = { pos: new THREE.Vector3(pp.x + 1.5, 0, pp.z), dead: false, hp: 1e9, maxHp: 1e9,
        radius: 0.5, id: 99, anim: { time: 0 }, spd: 0, atkCd: 999, cfg: null, stun: 0 };
      let onSrc = 0, others = 0;
      const oldHit = Game.damageEnemy;
      Game.castSkill('swordarray');
      Game.damageEnemy = (en) => { if (en === src) onSrc++; else others++; };
      const st = Game.state.stats;
      const keep = { dodge: st.dodge, block: st.block, thorns: st.thorns };
      st.dodge = 0; st.block = 0; st.thorns = 0;
      Game.shield = 0; Game.invuln = 0; Game.talismanCharges = 0;
      Game.dead = false; Game.state.hp = st.hpMax;
      Game.damagePlayer(40, src);
      const one = onSrc;
      Game.dead = false; Game.state.hp = st.hpMax;    // 同上：两次测量各自满血
      Game.damagePlayer(40, src);                     // 冷却内再挨一下
      const two = onSrc;
      st.dodge = keep.dodge; st.block = keep.block; st.thorns = keep.thorns;
      Game.damageEnemy = oldHit;
      Game.mapGen = (Game.mapGen || 0) + 1;           // 把剑阵定时器作废
      return { one, two, others };
    };
    out.sc9 = swCounter(9);
    out.sc10 = swCounter(10);

    /* 假怪没有 actor / armorHigh，帧循环一恢复就会摸到它们（实测报
     * 「reading 'time'」与「reading 'armorHigh'」）。量完清场再恢复。 */
    Game.enemies = [];
    Game.updateEnemies = savedUE;
    return out;
  });
  ok(evo.w2.after === evo.w2.first, 'Lv2 旋风斩只打一次（没有补段）', evo.w2);
  ok(evo.w2.first === 1, 'Lv2 只有 1 段（数量台阶从 3 级才起）', evo.w2);
  ok(evo.w5.after > evo.w5.first, 'Lv5 旋风斩 0.5 秒后真的补了一段', evo.w5);
  ok(evo.t8.vuln === 0, 'Lv8 横扫不留易伤', evo.t8);
  ok(evo.t9.vuln === 15 && evo.t9.vulnT > 0, 'Lv9 横扫撕裂：命中的敌人挂上 15% 易伤', evo.t9);
  ok(evo.r10.delta - evo.r9.delta === 8, 'Lv10 回怒从 8 点变 16 点（翻倍）', { r9: evo.r9, r10: evo.r10 });
  ok(evo.f5.rad > evo.f4.rad * 1.3, 'Lv5 爆炸半径明显变大（+50%）', { f4: evo.f4.rad, f5: evo.f5.rad });
  ok(evo.f5.patch > 0 && evo.f4.patch === 0, 'Lv5 爆炸处留火海（Lv4 不留）', { f4: evo.f4.patch, f5: evo.f5.patch });
  ok(evo.o8.after === evo.o8.first, 'Lv8 火球没有环绕段', evo.o8);
  ok(evo.o9.after > evo.o9.first, 'Lv9 火球放完还会绕着自己补伤害', evo.o9);
  ok(evo.a9.dz > 0.3, 'Lv9 瞄哪打哪（朝 +z 飞）', evo.a9);
  ok(evo.a10.dz < -0.5, 'Lv10 自动索敌（改朝 −z 的敌人飞）', evo.a10);
  ok(evo.ovr.spread === true, '撞名时变体的值赢（尸毒变体的 spread 盖过台阶的 1）', evo.ovr);
  ok(Math.abs(evo.ovr.rad - 4.2) < 0.01,
    '但台阶带的 spreadRad 活下来了（选过尸毒的人升到 Lv10 也真的变强）', evo.ovr);
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
  /* 键名带 l（slow）：p9s 已经被「死亡爆毒」那组占了 */
  ok(evo.p8sl.slow === 0, 'Lv8 的雾不减速', evo.p8sl);
  ok(Math.abs(evo.p9sl.slow - 0.4) < 0.01 && evo.p9sl.slowT > 0,
    'Lv9 雾内敌人减速 40%，且每跳刷新（不是施法瞬间一次性）', evo.p9sl);
  ok(evo.p9s.n === 0, 'Lv9 死了不爆毒', evo.p9s);
  ok(evo.p10s.n === 1 && Math.abs(evo.p10s.rad - 4.2) < 0.01,
    'Lv10 死亡爆毒，且比变体「尸毒」的 3.2 码更大', evo.p10s);
  /* --- 刀客 ② 地裂 --- */
  /* ---------------- 9.5. 余震钉人：直接调一次 handler ----------------
   * 上面那条证明了「参数送到了」，这条证明「handler 会用」——
   * 两段分开测，是因为前者被三连震的重复施法污染，后者必须没有干扰。 */
  const pinWorks = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const e = { pos: new THREE.Vector3(0, 0, 0), radius: 0.5, dead: false, stun: 0, hp: 1e9 };
    const ctx = {
      GFX: { ring() { }, text() { }, flashCircle() { } },
      center: new THREE.Vector3(0, 0, 0), rad: 5,
      hits: () => [e], strike() { },
      tick(n, fn) { for (let i = 1; i <= n; i++) setTimeout(fn, i * 60); },
      later() { }
    };
    SKILL_BEH.aftershock.run(ctx, 2, { aftershockPct: 30, aftershockStun: 0.5 });
    await wait(80);
    return e.stun;
  });
  ok(pinWorks === 0.5, '余震每跳把敌人钉住 0.5 秒（handler 真的读了 aftershockStun）', pinWorks);

  /* 余震本身是 3 级精研（自动给），所以「Lv4 只砸一下」是错的 ——
   * 台阶真正多出来的是「余震也能钉人」，量的就是这个。 */
  ok(evo.q4.after > evo.q4.first, '3 级精研的余震本来就在跳（不是台阶给的）', evo.q4);
  ok(evo.q4.pin === undefined && evo.q5.pin === 0.5,
    'Lv5 才把「余震钉人」交给余震 handler（Lv4 不带这个参数）',
    { q4: evo.q4.pin, q5: evo.q5.pin });
  ok(pinWorks === 0.5, '余震 handler 真的把 pin 写进 e.stun（0.5 秒）', pinWorks);
  ok(evo.q8.first === 0, 'Lv8 砸不到 6.6 码外的怪（基础半径 5.8）', evo.q8);
  ok(evo.q9.first === 1, 'Lv9 范围扩大后能砸到 6.6 码外（+35%）', evo.q9);
  ok(evo.q10.echo > evo.q10.first, 'Lv10 地裂结束再崩一次（0.45 秒后）', evo.q10);
  ok(evo.sk10.bases.some(b => Math.abs(b / evo.sk10.bases[0] - 0.7) < 0.02),
    '改追那一下按 70% 结算（不是白送一次全额）', evo.sk10.bases);
  /* --- 刀客 ③ 剑阵 --- */
  ok(evo.sw4.slow === 0 && evo.sw5.slow > 0.4,
    'Lv5 剑阵把阵内敌人黏住（Lv4 一点都不减速）', { lv4: evo.sw4.slow, lv5: evo.sw5.slow });
  ok(evo.sw5.slowT > 0.5, '减速有残留时长（出阵后还会慢一下，不是走一步就复原）', evo.sw5.slowT);
  ok(evo.sg8.field === false && evo.sg9.field === true,
    '只有 Lv9 才铺「阵」这份运行时状态（Lv8 没有）', { lv8: evo.sg8.field, lv9: evo.sg9.field });
  ok(evo.sg9.loss < evo.sg8.loss * 0.85,
    'Lv9 站在阵里明显少挨打（同一发 200 伤害）', { lv8: evo.sg8.loss, lv9: evo.sg9.loss });
  ok(evo.sg9out.loss > evo.sg9.loss * 1.1,
    '走出阵外就吃不到减伤（位置判定，不是常驻）', { in: evo.sg9.loss, out: evo.sg9out.loss });
  ok(evo.sc9.one === 0 && evo.sc10.one === 1,
    'Lv10 挨打会自动反击（Lv9 不反）', { lv9: evo.sc9.one, lv10: evo.sc10.one });
  ok(evo.sc10.two === 1, '反击有 0.4 秒内置冷却（连挨两下只反一次）', evo.sc10);

  /* ---------------- 8. 刀客 ④ 血怒：三只增益共用一个格位 ----------------
   * 这一位最容易被做假：只接 bloodrage 一只，玩家把 warcry 放进 ④ 号位
   * 就会看到「面板写着吸血、实际一点血都不回」。所以三条台阶三只都要量。 */
  console.log('八、刀客 ④ 血怒（三条台阶 × 三只增益）');
  const buffTiers = await p.evaluate(async () => {
    const out = {};
    const cast = (id, lv, form) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'warrior';
      Game.state.skills = { [id]: { lv: lv } };
      if (form != null) Game.state.skills[id].f = form;
      window.__mkClean();
      window.__mkEnemies(1);
      Game.recalc();
      /* 装备 / 命格把技能等级顶上去过 —— recalc 之后再清，否则量到的不是 lv */
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      Game.state.stats.skillMods = {};
      Game.buffs = [];
      Game.state.mp = 99999; Game.cooldowns = {};
      Game.dead = false;
      Game.playerSlowT = 0; Game.playerSlow = 0; Game.poisonT = 0;
      /* 半血起手：满血时「瞬回 12%」一点都看不出来（血条顶在上限） */
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
      const before = Game.state.hp;
      Game.castSkill(id);
      const b = Game.buffs.find(x => x.key === 'skill:' + id) || null;
      return {
        heal: Math.round(Game.state.hp - before),
        hpMax: Game.state.stats.hpMax,
        ls: Math.round((Game.state.stats.lifesteal || 0) * 10) / 10,
        dur: b ? Math.round(b.dur * 10) / 10 : 0,
        prolong: b && b.killProlong ? b.killProlong.max : 0,
        cc: Game.ccImmuneNow(),
        slowBlocked: Game.applyPlayerSlow(0.5, 2.5) === false,
        poisonBlocked: (Game.playerPoison(100), (Game.poisonT || 0) === 0),
        b
      };
    };
    /* 三位台阶的等级：2（都不给）/ 3 / 5 / 7 / 9 / 10 */
    for (const id of ['bloodrage', 'warcry', 'shieldwall']) {
      const o = {};
      for (const lv of [2, 3, 5, 7, 9, 10]) {
        const r = cast(id, lv, 1);        // 1 号变体 = 纯数值/持久，不带 beh
        delete r.b;
        o['lv' + lv] = r;
      }
      out[id] = o;
    }
    /* Lv9「击杀延长」：真跑击杀钩子看增益有没有变长。
     * 注意 warcry 自己还带精研「战鼓」（killExtend）——两条通道**同时**存在，
     * 所以「一直杀下去」的总延长 = 战鼓上限 + 台阶上限，不是只算台阶那一路。 */
    {
      const r = cast('warcry', 9, 1);
      const b = Game.buffs.find(x => x.key === 'skill:warcry');
      const d0 = b.dur;
      Game.onBehKill(null);
      const one = Math.round((b.dur - d0) * 10) / 10;
      for (let i = 0; i < 9; i++) Game.onBehKill(null);
      out.kill = {
        one, total: Math.round((b.dur - d0) * 10) / 10,
        pg: b.killProlong ? b.killProlong.got : 0,
        pm: b.killProlong ? b.killProlong.max : 0,
        eg: b.killExtend ? b.killExtend.got : 0,
        em: b.killExtend ? b.killExtend.max : 0
      };
    }
    window.__mkClean();
    Game.enemies = [];
    return out;
  });
  for (const id of ['bloodrage', 'warcry', 'shieldwall']) {
    const o = buffTiers[id];
    ok(o.lv2.heal === 0 && o.lv3.heal > 0,
      id + ' Lv3 施法瞬回（Lv2 一点都不回）', { lv2: o.lv2.heal, lv3: o.lv3.heal });
    ok(Math.abs(o.lv3.heal - o.lv3.hpMax * 0.12) < o.lv3.hpMax * 0.03,
      id + ' 回的是 12% 最大生命', { heal: o.lv3.heal, hpMax: o.lv3.hpMax });
    /* warcry 自带 8%，台阶是**叠加**不是覆盖 —— 8 → 18 才算真的变强 */
    ok(o.lv2.ls < o.lv5.ls, id + ' Lv5 吸血是叠加（不是覆盖原值）',
      { lv2: o.lv2.ls, lv5: o.lv5.ls });
    ok(o.lv7.dur > o.lv5.dur, id + ' Lv7 增益真的变长', { lv5: o.lv5.dur, lv7: o.lv7.dur });
    ok(o.lv9.prolong === 6, id + ' Lv9 有击杀延长预算（6 秒上限）', o.lv9.prolong);
    ok(o.lv9.cc === false && o.lv10.cc === true,
      id + ' Lv10 才免控', { lv9: o.lv9.cc, lv10: o.lv10.cc });
    ok(o.lv10.slowBlocked === true, id + ' Lv10 减速挂不上身', o.lv10);
    ok(o.lv10.poisonBlocked === true, id + ' Lv10 中毒也挂不上身', o.lv10);
  }
  ok(buffTiers.kill.one >= 2, 'Lv9 真杀一只，增益当场变长 2 秒', buffTiers.kill);
  ok(buffTiers.kill.pg === buffTiers.kill.pm,
    '台阶这条通道顶到自己的上限（6 秒）就不再涨', buffTiers.kill);
  ok(buffTiers.kill.total === buffTiers.kill.pm + buffTiers.kill.em,
    '两条延长通道各自封顶、互不吞并（战鼓 + 台阶一起算）', buffTiers.kill);

  {
    const todo = await p.evaluate(() => {
      Game.state.cls = 'warrior';
      Game.state.skills = {};
      Game.recalc();
      UI.renderSkillPanel();
      const arch = document.querySelector('#skList .sk-arch');
      if (arch) arch.setAttribute('open', '');
      const c = [...document.querySelectorAll('#skList .sk-ac')][3];   // ④ 号位
      return [...c.querySelectorAll('.sk-as')]
        .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
    });
    ok(todo.join(',') === '', '刀客 ④ 面板不再有「待」角标', todo);
  }

  /* ---------------- 9. 道士 ④ 回春：治疗 / 解毒 / 还魂 共用一个位 ----------------
   * 同血怒位：放哪只就该吃到哪只的台阶。这一位另有两条「+键」叠加台阶
   * （Lv5 hotPct / Lv7 drPct），必须证明**精研已经给了的时候还能再加**。 */
  console.log('九、道士 ④ 回春（三条台阶 × 三只）');
  const healTiers = await p.evaluate(async () => {
    const out = {};
    const cast = (id, lv, form) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'taoist';
      Game.state.skills = { [id]: { lv: lv } };
      if (form != null) Game.state.skills[id].f = form;
      window.__mkClean();
      window.__mkEnemies(1);
      Game.recalc();
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      Game.state.stats.skillMods = {};
      Game.buffs = [];
      Game.cooldowns = {};
      Game.state.mp = 99999;
      Game.dead = false;
      /* 起手带一份减速：Lv9 该把它驱散掉 */
      Game.playerSlow = 0.5; Game.playerSlowT = 2.5; Game.invuln = 0;
      /* heal 的 regen 会跨施法累加（每次 +3%/秒，4 秒后自己减回去）——
       * 不清零的话第二段量到的是两发的和 */
      Game.regen = 0;
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
      const before = Game.state.hp;
      Game.castSkill(id);
      const beh = Game.branchBeh(id);
      return {
        heal: Math.round(Game.state.hp - before),
        hpMax: Game.state.stats.hpMax,
        dr: Math.round(Game.state.stats.dmgReduce || 0),
        slowT: Math.round((Game.playerSlowT || 0) * 100) / 100,
        invuln: Math.round((Game.invuln || 0) * 100) / 100,
        hot: beh ? beh.tierHot : undefined
      };
    };
    for (const id of ['heal', 'antidote', 'revive']) {
      const o = {};
      /* 变体统一用 2 号（回春诀 / 灵台 / 逆命）：0 号带 zone、替身，
       * 会把「治疗量」量成别的技能的效果 */
      for (const lv of [2, 3, 5, 7, 9, 10]) o['lv' + lv] = cast(id, lv, 2);
      out[id] = o;
    }
    /* Lv5 持续回复：真等一跳。heal case 自带每秒 3% 的 regen，
     * 所以 Lv4 / Lv5 各量一次再比 —— 差值才是台阶那一份。 */
    {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const hotRun = async (lv) => {
        cast('heal', lv, 2);
        const h0 = Game.state.hp;
        Game.enemies = [];        // 等帧的时候别让假怪进帧循环
        await wait(1150);
        return Math.round(Game.state.hp - h0);
      };
      out.hot4 = await hotRun(4);
      out.hot5 = await hotRun(5);
      Game.mapGen = (Game.mapGen || 0) + 1;
    }
    /* Lv10 低血自动施放：放进 ④ 号位（下标 3），血拉到 20%，蓝设为 0 ——
     * 「免费」这条必须验，否则救命技能会被蓝条卡住。 */
    {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'taoist';
      Game.state.skills = { heal: { lv: 10 } };
      window.__mkClean();
      window.__mkEnemies(1);
      const bar = Game.skillBar();
      bar[3] = 'heal';
      Game.recalc();
      Game.state.stats.skillLv = 0; Game.state.stats.skillRank = {}; Game.state.stats.skillMods = {};
      Game.buffs = []; Game.cooldowns = {}; Game.dead = false;
      Game.state.mp = 0;                                  // 蓝见底
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.2);
      const before = Game.state.hp;
      for (let i = 0; i < 8; i++) Game.tickBeh(0.1);       // 0.25 秒节流，跑够一轮
      out.auto = {
        heal: Math.round(Game.state.hp - before),
        cd: Math.round((Game.cooldowns.heal || 0) * 10) / 10,
        mp: Game.state.mp
      };
      bar[3] = null;
    }
    window.__mkClean();
    Game.enemies = [];
    return out;
  });
  for (const id of ['heal', 'antidote', 'revive']) {
    const o = healTiers[id];
    ok(o.lv3.heal - o.lv2.heal >= o.lv3.hpMax * 0.07,
      id + ' Lv3 多回 8% 最大生命（Lv2 没有这一份）', { lv2: o.lv2.heal, lv3: o.lv3.heal });
    ok(o.lv5.hot === 2 && o.lv2.hot === undefined,
      id + ' Lv5 才带 tierHot（每秒 2% 最大生命）', { lv2: o.lv2.hot, lv5: o.lv5.hot });
    ok(o.lv7.dr > o.lv5.dr, id + ' Lv7 多一层 15% 减伤', { lv5: o.lv5.dr, lv7: o.lv7.dr });
    ok(o.lv9.slowT === 0, id + ' Lv9 已经把身上的减速驱散', o.lv9);
    ok(o.lv9.invuln >= 1.4, id + ' Lv9 同时给 1.5 秒无敌', o.lv9.invuln);
    /* antidote 本来就会驱散（case 里写死），所以只有 heal / revive 能证明「Lv9 才驱散」 */
    if (id !== 'antidote') {
      ok(o.lv7.slowT > 0, id + ' Lv7 还驱散不了（对照）', o.lv7.slowT);
    }
  }
  ok(healTiers.hot5 - healTiers.hot4 > 0,
    'Lv5 每秒真的多回一份（Lv4 只有 case 自带的 3% regen）',
    { lv4: healTiers.hot4, lv5: healTiers.hot5 });
  ok(healTiers.auto.heal > 0, 'Lv10 血量 20% 时真的自动施放了一次', healTiers.auto);
  ok(healTiers.auto.mp === 0, '自动施放不收资源（蓝 0 也放得出来）', healTiers.auto);
  ok(healTiers.auto.cd > 0, '自动施放照走冷却（不会每帧刷）', healTiers.auto);

  {
    const todo = await p.evaluate(() => {
      Game.state.cls = 'taoist';
      Game.state.skills = {};
      Game.recalc();
      UI.renderSkillPanel();
      const arch = document.querySelector('#skList .sk-arch');
      if (arch) arch.setAttribute('open', '');
      const c = [...document.querySelectorAll('#skList .sk-ac')][3];   // ④ 号位
      return [...c.querySelectorAll('.sk-as')]
        .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
    });
    ok(todo.join(',') === '', '道士 ④ 面板不再有「待」角标', todo);
  }

  /* ---------------- 10. 法师 ③ 火墙（火墙 / 冰霜新星 / 雷云 共用一个位） ---------------- */
  console.log('十、法师 ③ 火墙（三条台阶 × 三只）');
  const fireTiers = await p.evaluate(async () => {
    const out = {};
    const wait = ms => new Promise(r => setTimeout(r, ms));
    /* 假怪必须带上帧循环要读的字段：anim.time（挥砍计时）、spd / atkCd（AI） */
    const mkFoe = (x, z, id) => ({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false,
      hp: 1e9, maxHp: 1e9, id: id, anim: { time: 0 }, spd: 0, atkCd: 999, stun: 0
    });
    const setup = (id, lv, form, aimZ) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'mage';
      Game.state.skills = { [id]: { lv: lv } };
      if (form != null) Game.state.skills[id].f = form;
      window.__mkClean();
      Game.recalc();
      /* recalc 会把 skillLv / skillRank / skillMods 算一遍 —— 必须在它**之后**清，
       * 否则量到的是「等级 + 装备」的乘积，不是台阶那一份 */
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      Game.state.stats.skillMods = {};
      Game.buffs = []; Game.cooldowns = {}; Game.dead = false;
      Game.state.mp = 99999;
      const pp = Game.playerGroup.position;
      Game.aimDir.set(0, 0, 1);
      Game.aimPoint.set(pp.x, 0, pp.z + (aimZ || 6));
      return pp;
    };
    /* 一次施法：数 FX.area（每段/每朵一次）、数 explodeAt（收尾爆燃）、
     * 数每个假怪挨了几下。rollDamage 定死 = 基数，免得暴击把读数抖掉。
     *
     * 假怪只摆在三个横向位置：正中（0）、4 码、6 码。
     * 火墙是「沿施法方向的火带、宽 = 半径 3、段距 2.6」，所以正中会同时被
     * 相邻两段罩住（唯一一道墙就是 2 下）—— 多一道墙在正中是否多一层，
     * 正好用来验「双段真的叠上了」；4 / 6 码则是验「变宽了」。
     *
     * 等跳的时候把 running 关掉：假怪没有 actor，帧循环 updateEnemies 一碰
     * 就抛「reading 'time'」（x47 那种），而区域的跳是 setInterval，不依赖帧循环。 */
    const run = async (id, lv, form, aimZ, waitMs) => {
      const pp = setup(id, lv, form, aimZ);
      const z = id === 'firewall' ? pp.z + 12 : pp.z + (aimZ || 6);
      const es = [0, 4, 6].map((dx, i) => mkFoe(pp.x + dx, z, i));
      Game.enemies = es;
      let areas = 0, bursts = 0;
      const oldArea = FX.area, oldExp = Game.explodeAt;
      FX.area = function () { areas++; return oldArea.apply(FX, arguments); };
      Game.explodeAt = function () { bursts++; return oldExp.apply(Game, arguments); };
      const per = [0, 0, 0];
      const oldHit = Game.damageEnemy, oldRoll = Game.rollDamage;
      Game.damageEnemy = e => { if (e && e.id >= 0 && e.id < 3) per[e.id]++; };
      Game.rollDamage = base => ({ dmg: base, crit: false });
      Game.castSkill(id);
      Game.running = false;              // 等跳期间别让帧循环碰假怪
      await wait(waitMs);
      Game.running = true;
      FX.area = oldArea; Game.explodeAt = oldExp;
      Game.damageEnemy = oldHit; Game.rollDamage = oldRoll;
      const e0 = es[0];
      const r = {
        areas, per, bursts,
        vuln: Math.round(e0.vuln || 0),
        dot: Math.round((e0.dotT || 0) * 10) / 10,
        dotLabel: e0.dotLabel || ''
      };
      Game.enemies = [];
      Game.mapGen = (Game.mapGen || 0) + 1;
      return r;
    };

    /* 火墙：cast:'dir'，落点恒在射程尽头（12），假怪就摆在 12 处 */
    out.fw1 = await run('firewall', 1, 1, 6, 620);
    out.fw3 = await run('firewall', 3, 1, 6, 620);
    out.fw7 = await run('firewall', 7, 1, 6, 620);
    out.fw5 = await run('firewall', 5, 1, 6, 620);
    out.fw9 = await run('firewall', 9, 1, 6, 620);
    /* Lv10 的收尾爆燃要等火墙烧完（4 秒）+ 一格容错 */
    out.fw10 = await run('firewall', 10, 1, 6, 4600);
    out.fw9no = await run('firewall', 9, 1, 6, 4600);

    /* 冰霜新星：瞬发，只有一击 —— 台阶全落在这一击上 */
    out.fn1 = await run('frostnova', 1, 1, 4, 120);
    out.fn5 = await run('frostnova', 5, 1, 4, 120);
    out.fn9 = await run('frostnova', 9, 1, 4, 120);
    out.fn10 = await run('frostnova', 10, 1, 4, 900);

    /* 雷云：dur 6 秒，等 6.6 秒看收尾 */
    out.tc1 = await run('thundercloud', 1, 1, 6, 120);
    out.tc3 = await run('thundercloud', 3, 1, 6, 120);
    out.tc7 = await run('thundercloud', 7, 1, 6, 120);
    out.tc10 = await run('thundercloud', 10, 1, 6, 6600);

    /* Lv10 的 `+endBurst` 必须与变体「爆燃」叠加，而不是被它顶掉：
     * 变体 2 = 爆燃（endBurst 120），台阶再 +60 → 180 */
    {
      const eb = (lv, form) => {
        Game.state.cls = 'mage';
        Game.state.skills = { firewall: { lv: lv, f: form } };
        Game.recalc();
        const beh = Game.branchBeh('firewall');
        return beh ? beh.endBurst : undefined;
      };
      out.endBurst = { lv9f2: eb(9, 2), lv10f1: eb(10, 1), lv10f2: eb(10, 2) };
    }
    window.__mkClean();
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
    return out;
  });
  /* 数量：每道火墙 4 段、每朵雷云 1 块地 */
  ok(fireTiers.fw1.areas === 4, 'Lv1 火墙 = 4 段', fireTiers.fw1.areas);
  ok(fireTiers.fw3.areas === 8, 'Lv3 真的铺出 2 道（8 段）', fireTiers.fw3.areas);
  ok(fireTiers.fw7.areas === 12, 'Lv7 真的铺出 3 道（12 段）', fireTiers.fw7.areas);
  /* 伤害形态：正中「多一道墙就多一层」，横向「多一道墙就更宽」。
   * 为什么不是「N 道就打 N 下」：火带本身段距 2.6 < 半径 3，相邻两段本来就
   * 同时罩住正中的目标 —— 一道墙就是 2 下。所以判据是「加墙有没有真的加码」。 */
  ok(fireTiers.fw1.per[0] === 2 && fireTiers.fw3.per[0] === 4,
    'Lv1 正中挨 2 下（相邻两段），Lv3 挨 4 下 —— 双段在正中真的叠了一层',
    { lv1: fireTiers.fw1.per, lv3: fireTiers.fw3.per });
  ok(fireTiers.fw1.per[1] === 0 && fireTiers.fw3.per[1] > 0,
    '双段把火墙变宽了：4 码外一道打不到、两道能打到',
    { lv1: fireTiers.fw1.per, lv3: fireTiers.fw3.per });
  ok(fireTiers.fw1.per[2] === 0 && fireTiers.fw7.per[2] > 0,
    '三段更宽：6 码外一段 / 两道都打不到，三段能打到',
    { lv1: fireTiers.fw1.per, lv7: fireTiers.fw7.per });
  /* 进化台阶 */
  ok(fireTiers.fw1.dot === 0, 'Lv1 不挂持续伤害（对照）', fireTiers.fw1);
  ok(fireTiers.fw5.dot > 0 && fireTiers.fw5.dotLabel === '灼烧',
    'Lv5 命中真的挂上「灼烧」', fireTiers.fw5);
  ok(fireTiers.fw1.vuln === 0 && fireTiers.fw9.vuln === 12,
    'Lv9 场内目标真的带 12% 易伤', { lv1: fireTiers.fw1.vuln, lv9: fireTiers.fw9.vuln });
  ok(fireTiers.fw9no.bursts === 0, 'Lv9 烧完不炸（对照）', fireTiers.fw9no.bursts);
  ok(fireTiers.fw10.bursts > 0, 'Lv10 烧完真的在每段原地炸了', fireTiers.fw10.bursts);
  ok(fireTiers.endBurst.lv9f2 === 120 && fireTiers.endBurst.lv10f1 === 60
    && fireTiers.endBurst.lv10f2 === 180,
    'Lv10 的 +endBurst 与变体「爆燃」叠加（120 → 180），不是被顶掉',
    fireTiers.endBurst);
  /* 冰霜新星：瞬发也要吃到三条 */
  ok(fireTiers.fn5.dot > 0 && fireTiers.fn5.dotLabel === '霜蚀',
    'Lv5 冰霜新星挂的是「霜蚀」（按自己的元素，不是一律灼烧）', fireTiers.fn5);
  ok(fireTiers.fn9.vuln === 12, 'Lv9 冰霜新星也给易伤', fireTiers.fn9.vuln);
  ok(fireTiers.fn1.bursts === 0 && fireTiers.fn10.bursts > 0,
    'Lv10 新星 0.6 秒后补炸一发', { lv1: fireTiers.fn1.bursts, lv10: fireTiers.fn10.bursts });
  /* 雷云 */
  ok(fireTiers.tc1.areas === 1, 'Lv1 只有一朵云', fireTiers.tc1.areas);
  ok(fireTiers.tc3.areas === 2, 'Lv3 真的铺出 2 朵', fireTiers.tc3.areas);
  ok(fireTiers.tc7.areas === 3, 'Lv7 真的铺出 3 朵', fireTiers.tc7.areas);
  ok(fireTiers.tc10.bursts > 0, 'Lv10 雷云散了也会炸（以前没有收尾）', fireTiers.tc10.bursts);

  /* 面板：法师 ③ 号位不许再有「待」 */
  {
    const todo = await p.evaluate(() => {
      Game.state.cls = 'mage';
      Game.state.skills = {};
      Game.recalc();
      UI.renderSkillPanel();
      const arch = document.querySelector('#skList .sk-arch');
      if (arch) arch.setAttribute('open', '');
      const c = [...document.querySelectorAll('#skList .sk-ac')][2];   // ③ 号位
      return [...c.querySelectorAll('.sk-as')]
        .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
    });
    ok(todo.join(',') === '', '法师 ③ 面板不再有「待」角标', todo);
  }

  /* ---------------- 11. 法师 ④ 护盾（施法后的 4 秒窗口 × 两只） ---------------- */
  console.log('十一、法师 ④ 护盾（玄冰护盾 / 焚天）');
  const shieldTiers = await p.evaluate(async () => {
    const out = {};
    /* 这一节要**真结算**伤害（焚天的爆发 / 破盾那一发都走 damageEnemy），
     * 假怪必须补上 damageEnemy 会读的 level 与 cfg —— 少了 cfg 就是
     * 「reading 'armorHigh'」，而且报在 castSkill 里，看着像技能坏了。 */
    const mkFoe = (x, z, id) => ({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false,
      hp: 1e9, maxHp: 1e9, id: id, level: 1, cfg: {},
      anim: { time: 0 }, spd: 0, atkCd: 999, stun: 0
    });
    const setup = (id, lv, form) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'mage';
      Game.state.skills = { [id]: { lv: lv } };
      if (form != null) Game.state.skills[id].f = form;
      window.__mkClean();
      Game.buffs = []; Game.shield = 0; Game.shieldT = 0;
      Game.recalc();
      /* recalc 之后清加成：量台阶那一份，不能把装备/等级算进来 */
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      Game.state.stats.skillMods = {};
      Game.state.mp = 99999; Game.dead = false; Game.invuln = 0;
      Game.regen = 0;
      /* 两只假怪贴在脚下（0.6 / 1.2 码）：焚天要有人可打，破盾那发也要有东西挨 */
      const p0 = Game.playerGroup.position;
      Game.enemies = [mkFoe(p0.x + 0.6, p0.z, 0), mkFoe(p0.x + 1.2, p0.z, 1)];
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
      return p0;
    };
    /* 一次施法：量「血条跳了多少」和三条属性窗口（护甲 / 移速 / 暴击）。
     * 属性都在 recalc 后的 stats 上读 —— buff 一加上就 recalc，所以施法后
     * 立刻读到的就是「带了这一级窗口」的数。 */
    const run = (id, lv, form) => {
      setup(id, lv, form);
      const hp0 = Game.state.hp;
      const d0 = Game.state.stats.def, s0 = Game.state.stats.moveSpd, c0 = Game.state.stats.crit;
      /* 假怪没有 actor / 血条 DOM，damageEnemy 一碰就抛（reading 'flash'）。
       * 这一节只量「玩家身上的账」，敌人挨多少不在判据里 —— 直接挡掉。 */
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill(id);
      Game.damageEnemy = oldHit;
      const st1 = Game.state.stats;
      return {
        heal: Math.round(Game.state.hp - hp0),
        hpMax: st1.hpMax,
        def: Math.round((st1.def / (d0 || 1) - 1) * 100),
        spd: Math.round((st1.moveSpd / (s0 || 1) - 1) * 100),
        crit: Math.round(st1.crit - c0),
        shieldT: Math.round(Game.shieldT || 0)
      };
    };
    for (const id of ['iceshield', 'pyroclasm']) {
      const o = {};
      /* 变体统一用 2 号（永冻 / 燎原）—— 焚天的 0 号「火焰新星」会打三段、
       * 1 号「献祭」扣 20% 生命，两个都会把「瞬回多少」量成别的账 */
      for (const lv of [2, 3, 5, 7, 9]) o['lv' + lv] = run(id, lv, 2);
      out[id] = o;
    }
    /* 永冻写「持续 +6 秒」—— 原来 case 里 shieldT 写死 10，这条一直是假话 */
    out.dur = { base: run('iceshield', 4, 0).shieldT, freeze: run('iceshield', 4, 2).shieldT };

    /* Lv10：破盾（冰盾）/ 爆发（焚天）都要补一发范围伤害 + 定身，两个入口共用结算 */
    const breakRun = (id, lv) => {
      setup(id, lv, 2);
      let bursts = 0;
      const oldExp = Game.explodeAt;
      Game.explodeAt = function () { bursts++; return oldExp.apply(Game, arguments); };
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill(id);
      if (id === 'iceshield') {
        /* 打空护盾才走「破碎」那一侧；hp 抬高是为了量完不触发还魂 / 死亡 */
        Game.state.hp = 99999;
        Game.talismanCharges = 0;
        Game.invuln = 0;
        Game.shield = 5; Game.shieldT = 10;
        Game.damagePlayer(500, null);
      }
      Game.explodeAt = oldExp;
      Game.damageEnemy = oldHit;
      const es = Game.enemies || [];
      return {
        bursts,
        slowed: es.filter(e => (e.slow || 0) >= 1).length,
        slowT: es.length ? Math.round((es[0].slowT || 0) * 10) / 10 : 0,
        shield: Math.round(Game.shield || 0)
      };
    };
    out.nova9 = { shield: breakRun('iceshield', 9), fire: breakRun('pyroclasm', 9) };
    out.nova10 = { shield: breakRun('iceshield', 10), fire: breakRun('pyroclasm', 10) };

    window.__mkClean();
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
    return out;
  });
  for (const id of ['iceshield', 'pyroclasm']) {
    const o = shieldTiers[id];
    ok(o.lv3.heal - o.lv2.heal >= o.lv3.hpMax * 0.09,
      id + ' Lv3 多回 10% 最大生命（Lv2 没有这一份）', { lv2: o.lv2.heal, lv3: o.lv3.heal });
    ok(o.lv2.def === 0 && o.lv5.def >= 25,
      id + ' Lv5 护甲真的上去了（约 +30%）', { lv2: o.lv2.def, lv5: o.lv5.def });
    ok(o.lv2.spd === 0 && o.lv7.spd >= 12,
      id + ' Lv7 移速真的上去了（约 +15%）', { lv2: o.lv2.spd, lv7: o.lv7.spd });
    ok(o.lv2.crit === 0 && o.lv9.crit >= 14,
      id + ' Lv9 暴击率真的 +15（点数，不是乘区）', { lv2: o.lv2.crit, lv9: o.lv9.crit });
  }
  ok(shieldTiers.dur.base === 10 && shieldTiers.dur.freeze === 16,
    '变体「永冻」的 +6 秒真的进了护盾时长（原来写死 10）', shieldTiers.dur);
  /* 破盾 / 爆发：Lv9 是暴击（没有 tierNova），Lv10 才补那一发 */
  ok(shieldTiers.nova9.shield.bursts === 0 && shieldTiers.nova10.shield.bursts === 1,
    'Lv10 冰盾破碎时炸一发（Lv9 不炸，对照）',
    { lv9: shieldTiers.nova9.shield, lv10: shieldTiers.nova10.shield });
  ok(shieldTiers.nova10.shield.slowed === 2 && shieldTiers.nova10.shield.slowT >= 1.4,
    '碎盾那一发把周围敌人定住 1.5 秒', shieldTiers.nova10.shield);
  ok(shieldTiers.nova9.fire.bursts === 0 && shieldTiers.nova10.fire.bursts === 1,
    'Lv10 焚天爆发时也炸那一发（它没有护盾，走「爆发」入口）',
    { lv9: shieldTiers.nova9.fire, lv10: shieldTiers.nova10.fire });
  ok(shieldTiers.nova10.fire.slowed === 2, '焚天的定身也生效', shieldTiers.nova10.fire);

  /* 面板：法师 ④ 号位不许再有「待」 */
  {
    const todo = await p.evaluate(() => {
      Game.state.cls = 'mage';
      Game.state.skills = {};
      Game.recalc();
      UI.renderSkillPanel();
      const arch = document.querySelector('#skList .sk-arch');
      if (arch) arch.setAttribute('open', '');
      const c = [...document.querySelectorAll('#skList .sk-ac')][3];   // ④ 号位
      return [...c.querySelectorAll('.sk-as')]
        .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
    });
    ok(todo.join(',') === '', '法师 ④ 面板不再有「待」角标', todo);
  }

  /* ---------------- 12. 道士 ③ 太极（自身增益 / 地面符阵） ---------------- */
  console.log('十二、道士 ③ 太极（太极玄阵 / 天师符）');
  const taijiTiers = await p.evaluate(async () => {
    const out = {};
    const mkFoe = (x, z, id) => ({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false,
      hp: 1e9, maxHp: 1e9, id: id, level: 1, cfg: {},
      anim: { time: 0 }, spd: 0, atkCd: 999, stun: 0, slow: 0, slowT: 0
    });
    /* 这一位两只技能的**形态类别不同**：taiji 是 cast:'self' 的增益（阵心 = 人），
     * mastersigil 是丢在准星上的符阵（阵心 = 落点）。假怪放在 2.4 码：
     * 太极的默认半径是 3（没有 radius 字段），符阵 6 × 变体 1.4 —— 两边都够得着。 */
    const setup = (id, lv, form) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = 'taoist';
      Game.state.skills = { [id]: { lv: lv } };
      if (form != null) Game.state.skills[id].f = form;
      window.__mkClean();
      Game.buffs = []; Game.shield = 0; Game.shieldT = 0;
      Game.recalc();
      /* recalc 之后清加成：量的是台阶那一份，不是装备 / 等级 */
      Game.state.stats.skillLv = 0;
      Game.state.stats.skillRank = {};
      Game.state.stats.skillMods = {};
      Game.state.mp = 99999; Game.dead = false; Game.invuln = 0;
      Game.regen = 0;
      const p0 = Game.playerGroup.position;
      Game.enemies = [mkFoe(p0.x + 2.4, p0.z, 0), mkFoe(p0.x, p0.z + 2.4, 1)];
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
      return p0;
    };
    /* taiji 的变体 0 号「绵劲」自带 drPct 20 —— 正好用来验「+键」叠加：
     * 9 级的减伤必须是 20（变体）+ 10（精研阴阳）+ 12（台阶），
     * 而不是被其中任意一份顶掉。mastersigil 用 2 号「天师敕令」（纯 mods），
     * 0 号「贴身印」会去 attachFollow、1 号「五雷印」会加落雷，都会污染读数。 */
    const run = (id, lv, form) => {
      setup(id, lv, form);
      const hp0 = Game.state.hp;
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill(id);
      Game.damageEnemy = oldHit;
      const dr = Game.buffs.reduce((a, b) => a + ((b.stats && b.stats.dmgReduce) || 0), 0);
      const main = Game.buffs.find(b => b.key === 'skill:' + id);
      const es = Game.enemies || [];
      return {
        heal: Math.round(Game.state.hp - hp0),
        hpMax: Game.state.stats.hpMax,
        dur: main ? Math.round(main.dur * 10) / 10 : 0,
        dr: dr,
        slow: es.length ? Math.round((es[0].slow || 0) * 100) : -1,
        stun: es.length ? Math.round((es[0].stun || 0) * 10) / 10 : -1
      };
    };
    for (const id of ['taiji', 'mastersigil']) {
      const o = {};
      for (const lv of [2, 3, 5, 7, 9, 10]) o['lv' + lv] = run(id, lv, id === 'taiji' ? 0 : 2);
      out[id] = o;
    }
    /* 符阵没有 buff 可读：它的时长只活在 case 里那一句 FX.area —— 直接截参数。
     * 这一条正是「只给增益加时长、符阵不加」那个假话的守门人。 */
    const durOf = (lv) => {
      setup('mastersigil', lv, 2);
      let d = -1;
      const oldArea = FX.area;
      FX.area = function (c, r, col, du) { d = du; return { remove() { }, setOpacity() { } }; };
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('mastersigil');
      FX.area = oldArea;
      Game.damageEnemy = oldHit;
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.enemies = [];
      return Math.round(d * 10) / 10;
    };
    out.sigilDur = { lv4: durOf(4), lv7: durOf(7) };

    /* Lv10 的持续回复要真的逐秒跳：等 2.3 秒收两跳（1.5% × 2 ≈ 3% 最大生命）。
     * 期间不能让真 damageEnemy 碰到假怪，也不能换图（换图会让 tick 的
     * `later` 直接作废 —— 那样量到的是 0，看起来像「没做」）。
     * 假怪没有 `actor`，帧循环第一行就是 `e.actor.time` → 必须在这之前清空；
     * 清数组不影响 tick（`c.tick` 只判 mapGen / dead）。 */
    const hotRun = async (lv) => {
      setup('taiji', lv, 0);
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      Game.castSkill('taiji');
      Game.damageEnemy = oldHit;
      Game.enemies = [];
      const h0 = Game.state.hp;
      await new Promise(r => setTimeout(r, 2300));
      const h1 = Game.state.hp;
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.enemies = []; Game.buffs = [];
      return { healed: Math.round(h1 - h0), hpMax: Game.state.stats.hpMax };
    };
    out.hot = { lv7: await hotRun(7), lv10: await hotRun(10) };

    window.__mkClean();
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
    return out;
  });
  for (const id of ['taiji', 'mastersigil']) {
    const o = taijiTiers[id];
    ok(o.lv3.heal - o.lv2.heal >= o.lv3.hpMax * 0.07,
      id + ' Lv3 多回 8% 最大生命（Lv2 没有这一份）', { lv2: o.lv2.heal, lv3: o.lv3.heal });
    ok(o.lv2.slow === 0 && o.lv5.slow >= 38,
      id + ' Lv5 阵内敌人真的被减速 40%（Lv2 不减速）', { lv2: o.lv2.slow, lv5: o.lv5.slow });
    ok(o.lv2.stun === 0 && o.lv10.stun >= 1.9,
      id + ' Lv10 定住周围敌人 2 秒（Lv2 不晕）', { lv2: o.lv2.stun, lv10: o.lv10.stun });
    /* 减伤：mastersigil 没有分支 drPct，读数就是台阶本身；taiji 的读数里
     * 还叠着变体「绵劲」与精研「阴阳」—— 两份都得在，不是被谁顶掉。 */
    if (id === 'mastersigil') {
      ok(o.lv7.dr === 0 && o.lv9.dr === 12, id + ' Lv9 减伤 12%（Lv7 没有）', { lv7: o.lv7.dr, lv9: o.lv9.dr });
    } else {
      ok(o.lv9.dr - o.lv7.dr === 12,
        id + ' Lv9 的 +drPct 与变体「绵劲」20 + 精研「阴阳」10 叠加（不是顶掉）',
        { lv7: o.lv7.dr, lv9: o.lv9.dr });
    }
  }
  ok(taijiTiers.taiji.lv5.dur === 12 && taijiTiers.taiji.lv7.dur === 15,
    '太极的增益时长 12 → 15（Lv7 走 tierDur，不碰变体的 sdur）',
    { lv5: taijiTiers.taiji.lv5.dur, lv7: taijiTiers.taiji.lv7.dur });
  ok(taijiTiers.sigilDur.lv4 === 6 && taijiTiers.sigilDur.lv7 === 9,
    '天师符的符阵时长 6 → 9（同一级台阶，符阵也得吃）', taijiTiers.sigilDur);
  ok(taijiTiers.hot.lv7.healed <= taijiTiers.hot.lv7.hpMax * 0.005,
    'Lv7 没有持续回复（对照）', taijiTiers.hot.lv7);
  ok(taijiTiers.hot.lv10.healed >= taijiTiers.hot.lv10.hpMax * 0.02,
    'Lv10 两跳至少回 3% 最大生命（每秒 1.5%）', taijiTiers.hot.lv10);

  /* 面板：道士 ③ 号位不许再有「待」 */
  {
    const todo = await p.evaluate(() => {
      Game.state.cls = 'taoist';
      Game.state.skills = {};
      Game.recalc();
      UI.renderSkillPanel();
      const arch = document.querySelector('#skList .sk-arch');
      if (arch) arch.setAttribute('open', '');
      const c = [...document.querySelectorAll('#skList .sk-ac')][2];   // ③ 号位
      return [...c.querySelectorAll('.sk-as')]
        .filter(s => s.classList.contains('todo')).map(s => (s.querySelector('i') || {}).textContent);
    });
    ok(todo.join(',') === '', '道士 ③ 面板不再有「待」角标', todo);
  }

  /* ---------------- 13. 零报错 ---------------- */
  console.log('十三、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2b 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
