#!/usr/bin/env node
/* ============================================================
 * [M7.6] 终 boss 五阶段 · 真机验收
 *
 *   node dev/probe-bossfinal.js
 *
 * 契约（test-m7-6）判的是「代码里有没有、接没接对」；这一份判的是
 * 「接进真游戏之后，五个阶段真的推得动、血条真的重置、模型真的换了」。
 *
 * 量八件事：
 *   1. 真实 spawnEnemy 路径拿到 bafoF，初始在 P1、配招是 P1 那套
 *   2. P1→P2→P3→P4 逐档推进：阶段号、配招、收缩圈、攻速各就各位
 *   3. P2 借来的 2 招**真的来自八魔将**（不是随便什么招）
 *   4. P3 收缩圈真的在收，站在圈外真的掉血（按秒，不是按帧）
 *   5. **一击从 30% 打到 0% 也会变身**（不是先死再变身）
 *   6. P5：血量填回 100%、模型换成 chaosTrue、旧模型真的从场景摘掉、
 *      无敌 3 秒期间打不动、玩家血蓝回满
 *   7. P5 弱点每 20 秒轮换，且每次都只有一个 −60
 *   8. 脱战复位把五阶段整条复原（阶段 / 形态 / 模型 / 配招 / 抗性）
 *
 * headless 软件渲染只有 1~2fps，时间一律显式推进，不靠等。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  console.log('目标：' + TARGET.replace(/^file:\/\/.*jiuxiao-arpg-skill-refactor\//, 'local '));
  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.stats.hpMax = 4000; Game.state.hp = 4000;
    Game.state.stats.mpMax = 400; Game.state.mp = 400;
    Game.invuln = 0;
  });
  await wait(300);

  /* ---------- 一、真实路径 spawn ---------- */
  console.log('一、真实 spawnEnemy 路径：bafoF / P1 / P1 配招');
  const init = await page.evaluate(() => {
    Game.enemies.length = 0;
    const e = Game.spawnEnemy(null, 0, 0, false, 60, 'chaosavatar');
    Game.boss = e; UI.updateBoss(e);
    window.__e = e;
    return {
      hasF: !!e.bafoF,
      stage: e.bafoStage,
      form: e.bafoForm,
      invulnT: e.bossInvulnT,
      kit: e.bafoKit,
      maxHp: e.maxHp,
      hp: e.hp,
      radius: e.radius,
      model: e.actor.bafoModel || e.cfg.model,
      lamps: document.querySelectorAll('#bossPhase i').length,
      title: document.getElementById('bossTitle').textContent
    };
  });
  ok(init.hasF, '真实 spawn 之后必须有 bafoF（没有 = bossFinalInit 没接上）');
  ok(init.stage === 1, '初始阶段必须是 P1', init.stage);
  ok(init.form === false, '初始不该已经变身', init.form);
  ok(Array.isArray(init.kit) && init.kit.length === 5, 'P1 配招必须 5 格', init.kit && init.kit.length);
  ok(init.kit && init.kit[4] === 'nt_chaosavatar', 'P1 配招第 5 格必须是本命', init.kit && init.kit[4]);
  ok(init.lamps === 5, 'UI 必须画 5 盏阶段灯', init.lamps);
  ok(/第 1 \/ 5 阶段/.test(init.title), 'UI 副标题必须写「第 1 / 5 阶段」', init.title);

  /* ---------- 二、P1→P4 逐档推进 ---------- */
  console.log('二、P1→P2→P3→P4：阶段号 / 配招 / 收缩圈 / 攻速');
  const stage2 = await page.evaluate(() => {
    const e = window.__e;
    e.hp = e.maxHp * 0.78;
    Game.bossFinalTick(e, 0.016);
    return { stage: e.bafoStage, kit: e.bafoKit, shrink: !!e.bafoShrinkG };
  });
  ok(stage2.stage === 2, '血量 78% 必须进 P2', stage2.stage);
  ok(stage2.kit && stage2.kit.length === 5, 'P2 配招必须 5 格（2 固定 + 2 借 + 本命）', stage2.kit);
  ok(!stage2.shrink, 'P2 不该有收缩圈', stage2.shrink);

  /* P2 借来的两招必须来自八魔将 */
  const echo = await page.evaluate(() => {
    const pool = new Set();
    for (const id in BOSS_KIT) {
      if (id.indexOf('bafo_') !== 0) continue;
      const k = BOSS_KIT[id];
      for (let i = 0; i < 4; i++) if (k[i]) pool.add(k[i]);
    }
    const kit = window.__e.bafoKit;
    /* 顺带验 `_bossFinalPool` 的去重口径：它返回的池必须和这份 union 等长 */
    const real = Game._bossFinalPool(window.__e.bafoF);
    return {
      a: kit[2], b: kit[3],
      inPool: pool.has(kit[2]) && pool.has(kit[3]),
      poolSize: pool.size, realSize: real.length,
      realUnique: new Set(real).size === real.length
    };
  });
  ok(echo.poolSize >= 12, '八魔将配招池去重后应有 12 条以上（8 只 × 4 格）', echo.poolSize);
  ok(echo.inPool, 'P2 借来的 2 招必须来自八魔将配招池', echo);
  ok(echo.realSize === echo.poolSize && echo.realUnique,
    '_bossFinalPool 必须与「8 只 × 前 4 格」的去重并集一致', echo);

  const stage3 = await page.evaluate(() => {
    const e = window.__e;
    e.hp = e.maxHp * 0.58;
    Game.bossFinalTick(e, 0.016);
    return {
      stage: e.bafoStage, shrink: !!e.bafoShrinkG, r: e.bafoShrinkR,
      kids: e.bafoShrinkG ? e.bafoShrinkG.children.length : 0,
      inScene: e.bafoShrinkG ? !!e.bafoShrinkG.parent : false
    };
  });
  ok(stage3.stage === 3, '血量 58% 必须进 P3', stage3.stage);
  ok(stage3.shrink && stage3.inScene, 'P3 必须把收缩圈挂进场景', stage3);
  ok(stage3.r > 25.9 && stage3.r <= 26.01, '收缩圈初始半径必须是 26（数据里的 r0）', stage3.r);

  /* 收缩：推进 5 秒应该收掉 8 米（speed 1.6） */
  const shrunk = await page.evaluate(() => {
    const e = window.__e;
    const p = Game.playerGroup.position;
    p.x = 0; p.z = 0;                       // 先站到圈心，不吃圈外伤害
    Game.state.hp = 4000;
    for (let i = 0; i < 50; i++) Game.bossFinalTick(e, 0.1);
    return { r: e.bafoShrinkR, hp: Game.state.hp };
  });
  ok(Math.abs(shrunk.r - 18) < 0.35, '收 5 秒后半径应约 18 米（26 − 1.6×5）', shrunk.r);
  ok(shrunk.hp === 4000, '站在圈内不该掉血', shrunk.hp);

  /* 圈外扣血：站到 30 米外，推 1.1 秒 */
  const outside = await page.evaluate(() => {
    const e = window.__e;
    const p = Game.playerGroup.position;
    p.x = 30; p.z = 0;
    Game.state.hp = 4000; Game.invuln = 0;
    const h0 = Game.state.hp;
    Game.bossFinalTick(e, 0.55);
    const h1 = Game.state.hp;
    Game.bossFinalTick(e, 0.55);
    return { h0: h0, h1: h1, h2: Game.state.hp, dps: e.bafoF.shrink.dps };
  });
  ok(outside.h1 === outside.h0, '不到 1 秒不该结算（按秒累加，不按帧）', outside);
  ok(outside.h2 < outside.h0, '站满 1 秒必须掉血', outside);
  /* 6% 最大生命 = 240（4000 × 6%），允许被闪避吃掉一次 */
  ok(Math.abs((outside.h0 - outside.h2) - 240) < 1 || outside.h0 - outside.h2 === 0,
    '圈外一秒应扣 6% 最大生命（240）', outside.h0 - outside.h2);

  const stage4 = await page.evaluate(() => {
    const e = window.__e;
    const p = Game.playerGroup.position;
    p.x = 0; p.z = 0;
    e.hp = e.maxHp * 0.38;
    Game.bossFinalTick(e, 0.016);
    return {
      stage: e.bafoStage, atkCdBase: e.atkCdBase, gap: e.bafoGap, rage: e.bafoRage,
      cfgCd: e.cfg.atkCd, kit: e.bafoKit
    };
  });
  ok(stage4.stage === 4, '血量 38% 必须进 P4', stage4.stage);
  ok(stage4.rage === true, 'P4 必须打上狂怒标记', stage4.rage);
  ok(Math.abs(stage4.atkCdBase - stage4.cfgCd / 1.4) < 1e-6,
    'P4 普攻间隔必须 ÷1.4（攻速 +40%）', { base: stage4.atkCdBase, cfg: stage4.cfgCd });
  ok(Math.abs(stage4.gap - 0.6) < 1e-6, 'P4 技能间隔倍率必须是 0.6', stage4.gap);

  /* ---------- 三、P5 变身：一击从 30% 打到 0% ---------- */
  console.log('三、P5 变身：一击从 30% 打到 0% 也不许死');
  const trans = await page.evaluate(() => {
    const e = window.__e;
    const oldGroup = e.actor.group;
    const oldModel = e.actor.bafoModel || e.cfg.model;
    e.hp = e.maxHp * 0.30;
    Game.state.hp = 100; Game.state.mp = 0;
    /* 一击远远过量：模拟「暴击 + 破防」把 30% 直接打到负数 */
    Game.damageEnemy(e, e.maxHp * 5, true, {});
    return {
      dead: e.dead,
      form: e.bafoForm,
      stage: e.bafoStage,
      hp: e.hp, maxHp: e.maxHp,
      invulnT: e.bossInvulnT,
      newModel: e.actor.bafoModel,
      oldDetached: oldGroup.parent === null,
      oldModel: oldModel,
      radius: e.radius,
      kit: e.bafoKit,
      shrinkGone: !e.bafoShrinkG,
      pHp: Game.state.hp, pMp: Game.state.mp,
      pMax: Game.state.stats.hpMax, pMaxMp: Game.state.stats.mpMax,
      lamps: document.querySelectorAll('#bossPhase i.on').length,
      title: document.getElementById('bossTitle').textContent
    };
  });
  ok(trans.dead === false, '变身那一击不许把它打死', trans.dead);
  ok(trans.form === true, 'P5 必须真的变身', trans.form);
  ok(trans.stage === 5, '变身之后阶段号必须是 5', trans.stage);
  ok(Math.abs(trans.hp - trans.maxHp) < 1, '第二条血必须填回 100%', { hp: trans.hp, max: trans.maxHp });
  ok(Math.abs(trans.maxHp - init.maxHp) < 1, 'maxHp 不许被翻倍（第二条血不是加长血条）', trans.maxHp);
  ok(trans.newModel === 'chaosTrue', '变身必须换成 chaosTrue 骨架', trans.newModel);
  ok(trans.oldDetached, '旧模型必须从场景摘掉（disposeTree 会 detach）', trans.oldDetached);
  ok(trans.radius > 2.2, '碰撞半径必须跟着新骨架换（无相真身 2.6 米）', trans.radius);
  ok(Math.abs(trans.invulnT - 3) < 0.001, '变身无敌必须是 3 秒', trans.invulnT);
  ok(trans.shrinkGone, '变身必须撤掉收缩圈（给一次公平重开）', trans.shrinkGone);
  ok(trans.pHp === trans.pMax, '变身必须把玩家血回满', { hp: trans.pHp, max: trans.pMax });
  ok(trans.pMp === trans.pMaxMp, '变身必须把玩家蓝回满', { mp: trans.pMp, max: trans.pMaxMp });
  ok(trans.lamps === 5, '变身后 5 盏灯必须全亮', trans.lamps);
  ok(/第 5 \/ 5 阶段/.test(trans.title), 'UI 副标题必须写「第 5 / 5 阶段」', trans.title);

  /* P5 配招：4 抽 + 本命 */
  const p5kit = await page.evaluate(() => {
    const pool = new Set();
    for (const id in BOSS_KIT) {
      if (id.indexOf('bafo_') !== 0) continue;
      const k = BOSS_KIT[id];
      for (let i = 0; i < 4; i++) if (k[i]) pool.add(k[i]);
    }
    const kit = window.__e.bafoKit;
    return {
      kit: kit, len: kit.length,
      /* 注意是 kit[i] 不是 i —— 下标不是技能名 */
      fromPool: [0, 1, 2, 3].every(i => pool.has(kit[i])),
      native: kit[4]
    };
  });
  ok(p5kit.len === 5, 'P5 配招必须 5 格', p5kit.len);
  ok(p5kit.fromPool, 'P5 前 4 格必须全部来自八魔将（八部合一）', p5kit.kit);
  ok(p5kit.native === 'nt_chaosavatar', 'P5 第 5 格必须还是本命', p5kit.native);

  /* ---------- 四、无敌 3 秒 ---------- */
  console.log('四、变身无敌：3 秒内打不动');
  const inv = await page.evaluate(() => {
    const e = window.__e;
    const h0 = e.hp;
    Game.damageEnemy(e, 1e7, true, {});
    const h1 = e.hp;
    /* 推进 3.1 秒让无敌走完 */
    for (let i = 0; i < 31; i++) Game.bossFinalTick(e, 0.1);
    Game.damageEnemy(e, 1e5, true, {});
    return { h0: h0, h1: h1, h2: e.hp, invulnT: e.bossInvulnT };
  });
  ok(inv.h1 === inv.h0, '无敌期间伤害必须为 0', { before: inv.h0, after: inv.h1 });
  ok(inv.invulnT === 0, '3.1 秒后无敌必须归零', inv.invulnT);
  ok(inv.h2 < inv.h1, '无敌结束之后必须能打进去', { h1: inv.h1, h2: inv.h2 });

  /* ---------- 五、弱点轮换 ---------- */
  console.log('五、P5 弱点：每 20 秒轮换，每次只有一个 −60');
  const weak = await page.evaluate(() => {
    const e = window.__e;
    const seq = [];
    for (let n = 0; n < 6; n++) {
      e.bafoWeakT = 0;
      Game.bossFinalTick(e, 0.016);
      const r = e.resist || {};
      const weakOnes = Object.keys(r).filter(k => r[k] < 0);
      seq.push({
        weak: weakOnes, val: weakOnes.length ? r[weakOnes[0]] : null,
        others: Object.keys(r).filter(k => k !== weakOnes[0]).map(k => r[k])
      });
    }
    return { seq: seq, order: e.bafoF.weakOrder, rotate: e.bafoF.weakRotate };
  });
  ok(weak.seq.every(s => s.weak.length === 1), '每一轮必须**只有一个**弱点（多一个就是白送）', weak.seq.map(s => s.weak));
  ok(weak.seq.every(s => s.val === -60), '弱点必须 −60（吃 160%，与八魔将同口径）', weak.seq.map(s => s.val));
  ok(weak.seq.every(s => s.others.length === 4 && s.others.every(v => v === 80)),
    '其余四项必须 +80（吃 20%）—— 差 8 倍才是「必须换输出手段」', weak.seq[0]);
  {
    const seen = weak.seq.map(s => s.weak[0]);
    const ord = weak.order;
    ok(new Set(seen.slice(0, 5)).size === 5, '连续 5 轮必须覆盖全部 5 个元素（轮转不是随机）', seen);
    /* 顺序必须严格沿 weakOrder 循环走。起点不重要 —— 变身那一帧已经抽过第一个，
     * 这里是从第二轮开始量的，所以只验「相邻两轮在 weakOrder 里相差 1」。 */
    const steps = [];
    for (let i = 0; i + 1 < seen.length; i++) {
      steps.push((ord.indexOf(seen[i + 1]) - ord.indexOf(seen[i]) + 5) % 5);
    }
    ok(steps.every(v => v === 1), '轮转必须严格沿 weakOrder 循环（每轮 +1）', { seen, ord });
  }

  /* ---------- 六、脱战复位 ---------- */
  console.log('六、脱战复位：五阶段整条复原');
  const reset = await page.evaluate(() => {
    const e = window.__e;
    const formGroup = e.actor.group;
    Game.resetBoss(e);
    return {
      stage: e.bafoStage, form: e.bafoForm, invulnT: e.bossInvulnT,
      hp: e.hp, maxHp: e.maxHp,
      model: e.actor.bafoModel || e.cfg.model,
      formDetached: formGroup.parent === null,
      kit: e.bafoKit,
      shrink: !e.bafoShrinkG,
      gap: e.bafoGap, rage: e.bafoRage,
      resist: e.resist
    };
  });
  ok(reset.stage === 1, '复位后必须回到 P1', reset.stage);
  ok(reset.form === false, '复位后必须回到未变身', reset.form);
  ok(Math.abs(reset.hp - reset.maxHp) < 1, '复位后血量必须回满', { hp: reset.hp, max: reset.maxHp });
  ok(reset.model !== 'chaosTrue', '复位后模型必须换回原身（不许留着十一米真身）', reset.model);
  ok(reset.formDetached, '复位换下来的真身模型必须从场景摘掉', reset.formDetached);
  ok(reset.kit && reset.kit[0] === 'slam', '复位后配招必须回到 P1', reset.kit);
  ok(reset.shrink, '复位后不该有收缩圈', reset.shrink);
  ok(reset.gap === 1 && reset.rage === false, '复位后狂怒必须清掉', { gap: reset.gap, rage: reset.rage });
  {
    /* 复位后的抗性必须等于「族群表 + cfg.resist」那一份 —— 不许留着 P5 的
     * −60/+80 弱点轮换。注意族群表本身可能有负数（灵体的物理就是 −15 =
     * 吃 115%），所以不能简单断言「没有负数」。 */
    const want = await page.evaluate(() => {
      const e = window.__e;
      const r = Object.assign({}, (MON_FAMILIES[e.cfg.family] || {}).resist || {});
      if (e.cfg.resist) Object.assign(r, e.cfg.resist);
      return r;
    });
    ok(JSON.stringify(reset.resist) === JSON.stringify(want),
      '复位后抗性必须回到「族群表 + cfg.resist」', { got: reset.resist, want });
  }

  /* ---------- 七、不炸 ---------- */
  console.log('七、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  M7.6 五阶段真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
