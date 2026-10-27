#!/usr/bin/env node
/* ============================================================
 * 技能 P2 真机探针：等级台阶 5 → 10 接线
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p2.js
 *
 * 要证的五件事（都是「只改数据不改战斗」时会失败的）：
 *   1. 40 级供给 60 点，面板上写的是「可用 / 总供给」
 *   2. 详情卡 10 格，能一路点到 10 级，第 11 次被拦（已满级）
 *   3. **真打出来的伤害**按 skillLvMul 走：10 级 / 1 级 ≈ 1.72 倍
 *      （不是旧的「每级 +8%」在 10 级给出的同一个 1.72 —— 所以还要看
 *       面板预览与战斗是否同一个数）
 *   4. 树上节点 10 级显示「满」，不再是 5 级就满
 *   5. 洗点把 9 点一分不少退回来
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d)); } };

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
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

  /* 40 级、清空已投、打开术法面板 */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.skills = {};
    Game.state.passives = {};
    Game.state.gold = 999999;
    Game.recalc();
    document.getElementById('skillPanel').classList.add('open');
    UI.skSel = 'whirl';
    UI.renderSkillPanel();
  });
  await wait(400);

  /* ---------------- 1. 供给 ---------------- */
  console.log('一、点数供给');
  const supply = await p.evaluate(() => ({
    pts: Game.skillPoints(),
    txt: (document.getElementById('skPtsTxt') || {}).textContent,
    rate: SKILL_POINT_RATE,
    cap: SKILL_LV_MAX
  }));
  ok(supply.pts === 60, '40 级可用技能点 = 60', supply.pts);
  ok(/60/.test(supply.txt || ''), '面板上写着 60', supply.txt);
  ok(/\/\s*60/.test(supply.txt || ''), '面板上写着总供给 /60（不是只有可用数）', supply.txt);
  ok(supply.cap === 10, 'SKILL_LV_MAX = 10', supply.cap);

  /* ---------------- 2. 卡上 10 格 ---------------- */
  console.log('二、详情卡等级格');
  const pips = await p.evaluate(() => document.querySelectorAll('#skList .sk-right .sk-pip').length);
  ok(pips === 10, '详情卡有 10 格（旧版是 5）', pips);
  /* 10 格不许把「升级」按钮挤出卡片 */
  const fit = await p.evaluate(() => {
    const row = document.querySelector('#skList .sk-right .sd-lv');
    const card = document.querySelector('#skList .sk-right');
    if (!row || !card) return null;
    const r = row.getBoundingClientRect(), c = card.getBoundingClientRect();
    return { rowW: Math.round(r.width), cardW: Math.round(c.width), overflow: r.right > c.right + 1 };
  });
  ok(fit && !fit.overflow, '10 格不溢出卡片', fit);

  /* ---------------- 3. 一路点到 10 级 ---------------- */
  console.log('三、点到 10 级');
  const up = await p.evaluate(() => {
    const log = [];
    for (let i = 0; i < 10; i++) {
      const before = (Game.skillState().whirl || {}).lv || 1;
      UI.skillStep('whirl', true);
      const after = (Game.skillState().whirl || {}).lv || 1;
      log.push({ before, after, ok: after > before });
    }
    UI.snapCommit('skill');
    return { lv: Game.skillState().whirl.lv, pts: Game.skillPoints(), log };
  });
  ok(up.lv === 10, '技能能点到 10 级（不再卡在 5）', up.lv);
  const ups = up.log.filter(x => x.ok).length;
  ok(ups === 9, '1→10 一共成功 9 次（第 10 次是「已满级」拦截）', ups);
  ok(up.pts === 60 - 9, '点满花掉 9 点，剩 51', up.pts);

  /* 满级后按钮状态与文案 */
  const cardTxt = await p.evaluate(() => {
    const lvt = document.querySelector('#skList .sk-right .sk-lvt');
    return lvt ? lvt.textContent.replace(/\s+/g, ' ') : '';
  });
  ok(/10\s*\/\s*10/.test(cardTxt), '卡上写「投入 10/10」', cardTxt);

  /* ---------------- 4. 真打出来的伤害按 skillLvMul ---------------- */
  console.log('四、战斗结算（真调 castSkill）');
  const dmg = await p.evaluate(() => {
    /* 干净环境：满资源、无冷却、非自动施放 */
    const mk = (lv) => {
      Game.state.skills = { whirl: { lv: lv } };
      Game.state.mp = 99999;
      Game.cooldowns = {};
      Game._autoCast = false;
      Game._drainOn = null;
      Game._recharge = null;
      Game.running = true;
      Game.dead = false;
      const got = [];
      const oldRoll = Game.rollDamage.bind(Game);
      const oldHit = Game.damageEnemy.bind(Game);
      Game.rollDamage = (base) => { got.push(base); return { dmg: base, crit: false }; };
      Game.damageEnemy = () => {};
      const pp = Game.playerGroup.position;
      const fake = { pos: new THREE.Vector3(pp.x + 1, 0, pp.z), radius: 0.6, dead: false, hp: 1e9 };
      const oldEnemies = Game.enemies;
      Game.enemies = [fake];
      Game.castSkill('whirl');
      Game.enemies = oldEnemies;
      Game.rollDamage = oldRoll;
      Game.damageEnemy = oldHit;
      return got.length ? got[got.length - 1] : null;
    };
    const d1 = mk(1), d10 = mk(10);
    return { d1, d10, ratio: d10 / d1, mul10: skillLvMul(10), atk: Game.state.stats.atk };
  });
  ok(dmg.d1 > 0 && dmg.d10 > dmg.d1, '10 级打出的基础值比 1 级高', dmg);
  ok(Math.abs(dmg.ratio - dmg.mul10) < 0.01,
    '10 级 / 1 级 = skillLvMul(10) = ' + dmg.mul10 + '（战斗真的读了同一个函数）', dmg.ratio);
  ok(Math.abs(dmg.ratio - 1.72) < 0.01, '倍率是 1.72（不是旧的 2.52）', dmg.ratio);

  /* 面板预览与战斗同源：卡上的伤害数字 == atk × 倍率 × mods */
  const preview = await p.evaluate(() => {
    Game.state.skills = { whirl: { lv: 10 } };
    Game.recalc();
    UI.renderSkillPanel();
    const card = document.querySelector('#skList .sk-right .sd-desc');
    const nums = (card ? card.textContent : '').match(/\d+/g) || [];
    const smod = Game.effSkillMods('whirl');
    const spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * skillLvMul(Game.skillLevel('whirl'));
    return { nums: nums.map(Number), want: Math.round(Game.state.stats.atk * SKILLS.whirl.mult * spow) };
  });
  ok(preview.nums.indexOf(preview.want) >= 0,
    '卡上预览伤害 == atk × 倍率 × 分支修正（与战斗同口径）', preview);

  /* ---------------- 5. 树上节点 10 级才满 ---------------- */
  console.log('五、树上节点');
  const nodeTxt = await p.evaluate(() => {
    const el = document.querySelector('#skList .skt-nd[data-skpick="whirl"]');
    if (!el) return null;
    const bg = el.querySelector('.bg');
    const ring = getComputedStyle(el.querySelector('.box')).boxShadow;
    return {
      cls: el.className,
      badge: bg ? bg.textContent.trim() : '',
      tip: bg ? (bg.getAttribute('title') || '') : '',
      ring: ring && ring !== 'none'
    };
  });
  ok(!!nodeTxt, '树上找得到 whirl 节点');
  ok(nodeTxt && /\bmax\b/.test(nodeTxt.cls), '10 级节点带 max 标记', nodeTxt && nodeTxt.cls);
  ok(nodeTxt && nodeTxt.badge === '10', '角标写的是 10（不是旧上限的 5）', nodeTxt && nodeTxt.badge);
  ok(nodeTxt && /满级/.test(nodeTxt.tip), '角标 title 写清「已满级」', nodeTxt && nodeTxt.tip);
  ok(nodeTxt && nodeTxt.ring, '满级节点有金环（视觉上一眼能扫出来）', nodeTxt && nodeTxt.ring);

  /* 5 级时不许算满（旧上限的口径已经作废） */
  const five = await p.evaluate(() => {
    Game.state.skills = { whirl: { lv: 5 } };
    Game.recalc();
    UI.renderSkillPanel();
    const el = document.querySelector('#skList .skt-nd[data-skpick="whirl"]');
    return { cls: el ? el.className : '', badge: el && el.querySelector('.bg') ? el.querySelector('.bg').textContent.trim() : '' };
  });
  ok(!/\bmax\b/.test(five.cls), '5 级不再算满级（上限已抬到 10）', five.cls);
  ok(five.badge === '5', '5 级角标就是 5', five.badge);

  /* ---------------- 6. 洗点全额退回 ---------------- */
  console.log('六、洗点');
  const respec = await p.evaluate(() => {
    Game.state.skills = { whirl: { lv: 10 } };
    Game.state.passives = {};
    Game.state.gold = 999999;
    Game.recalc();
    const before = Game.skillPoints();
    const r = Game.respecTree();
    return {
      ok: r.ok, refunded: r.cleaned, before: before,
      after: Game.skillPoints(), lv: Game.skillState().whirl.lv,
      goldLeft: Game.state.gold
    };
  });
  ok(respec.ok === true, '洗点能执行', respec);
  ok(respec.lv === 1, '洗点后等级归 1');
  ok(respec.after === 60, '点数回到 60（9 点一分不少）', respec.after);
  ok(respec.refunded === 9, '洗点报告里写清退了 9 点', respec.refunded);

  /* ---------------- 7. 零报错 ---------------- */
  console.log('七、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
