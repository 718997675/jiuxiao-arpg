#!/usr/bin/env node
/* ============================================================
 * 技能 P6 真机探针：账本在「升级 / 洗点 / 存读档」之后还是不是原来那本
 *
 *   node dev/probe-skill-p6.js
 *
 * 契约测试（dev/test-skill-p6.js）钉的是数据层与源码形状，
 * 这里钉的是**真跑一遍**：
 *
 *   1. 升级不吞选择 —— 设好变体 / 精通 / 元素注入之后升一级，
 *      三样都得还在（旧实现里 keepPick 只认 p，升一级全丢）。
 *   2. 洗点只退花点的 —— lv 归 1、取向清空、点数一分不少地回来；
 *      变体 / 精通 / 元素注入原样留着（它们不收钱）。
 *   3. 被动落盘 —— 投被动 → 存档 → 刷新页面 → 被动还在、点数没白送。
 *   4. 洗点价递增且落盘 —— 洗一次存一次档，下次读回来还是第二档。
 *   5. 脏档不崩 —— 手改出 `skills: { fireball: null }` 也读得进、面板能开。
 *   6. 老档兼容 —— 8 格技能条读成 5 格，缺的字段补默认值。
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

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  const hook = () => {
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  };
  hook();

  await p.goto(URL, { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* 干净的起点：40 级（技能点池 60）、钱管够、没有面板草稿 */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.gold = 999999;
    Game.running = true;
    Game.dead = false;
    UI.snapCommit('skill');
    Game.recalc();
    /* 精通看**有效等级**（15 级起，只能靠装备 / 词缀堆），
     * 探针没有真装备，所以临时把有效等级抬上去 —— 测的是「设完之后会不会丢」，
     * 不是「能不能设」（那是 P2c 契约的事）。 */
    window.__lvStub = (id, n) => { const old = Game.skillLevel; Game.skillLevel = () => n; return old; };
  });

  /* ---------------- 1. 升级不吞选择 ---------------- */
  console.log('一、升级不吞选择');
  const keep = await p.evaluate(() => {
    Game.state.skills = { fireball: { lv: 6 } };
    Game.recalc();
    /* 变体：fireball 走新通道 f；取向：p；元素注入：el / el2（40 级可混搭） */
    Game.setSkillForm('fireball', 2);
    Game.setSkillInject('fireball', 'fire');
    Game.setSkillInject2('fireball', 'ice');
    const oldLv = window.__lvStub('fireball', 16);
    Game.setSkillMastery('fireball', 1);
    Game.skillLevel = oldLv;
    const before = JSON.parse(JSON.stringify(Game.state.skills.fireball));

    const up = Game.levelUpSkill('fireball');
    const afterUp = JSON.parse(JSON.stringify(Game.state.skills.fireball));
    const down = Game.levelDownSkill('fireball');
    const afterDown = JSON.parse(JSON.stringify(Game.state.skills.fireball));
    return { before, up, afterUp, down, afterDown };
  });
  ok(keep.before.f === 2, '起始：变体 f = 2', keep.before);
  ok(keep.before.m === 1, '起始：精通 m = 1', keep.before);
  ok(keep.before.el === 'fire' && keep.before.el2 === 'ice', '起始：主副元素 = 火 / 冰', keep.before);
  ok(keep.up.ok === true && keep.afterUp.lv === 7, '升到 7 级', keep.afterUp);
  ok(keep.afterUp.f === 2, '升级后变体还在', keep.afterUp);
  ok(keep.afterUp.m === 1, '升级后精通还在', keep.afterUp);
  ok(keep.afterUp.el === 'fire' && keep.afterUp.el2 === 'ice', '升级后元素注入还在', keep.afterUp);
  ok(keep.afterDown.lv === 6, '降级回 6 级', keep.afterDown);
  ok(keep.afterDown.f === 2 && keep.afterDown.m === 1
    && keep.afterDown.el === 'fire' && keep.afterDown.el2 === 'ice', '降级后三样都还在', keep.afterDown);

  /* 换变体：旧通道 v 也要跟着走（否则 f 存在时换不动） */
  const varSwap = await p.evaluate(() => {
    Game.setSkillVariant('fireball', 0);
    const a = JSON.parse(JSON.stringify(Game.state.skills.fireball));
    Game.setSkillForm('fireball', 2);
    const bb = JSON.parse(JSON.stringify(Game.state.skills.fireball));
    return { a, bb, readA: skillFormIdx(Game.state.skills, 'fireball') };
  });
  ok(varSwap.a.f === 0 && varSwap.a.v === 0, '旧通道换变体时 f 同步改（否则读 f 的路径换不动）', varSwap.a);
  ok(varSwap.bb.f === 2, '新通道仍能正常换回来', varSwap.bb);

  /* ---------------- 2. 洗点只退花点的 ---------------- */
  console.log('二、洗点只退花点的');
  const respec = await p.evaluate(() => {
    Game.state.skills = {};
    Game.state.passives = {};
    Game.state.treeRespecCount = 0;
    Game.state.gold = 999999;
    Game.recalc();
    const pool = skillPointPool(40);
    /* 造一份「花光 60 点」的账：主动 lv + 取向 + 被动 */
    Game.state.skills = {
      fireball: { lv: 10, v: 0, f: 2, m: 1, p: 0, el: 'fire', el2: 'ice' },
      frostnova: { lv: 10, v: 1, f: 1, p: 1, el: 'ice' },
      meteor: { lv: 10, v: 0, f: 0 },
      swordrain: { lv: 10, v: 0, f: 0 }
    };
    const pasIds = Object.keys(SKILL_TREE.passives).slice(0, 4);
    for (const id of pasIds) Game.state.passives[id] = 1;
    Game.recalc();
    const spent0 = pool - Game.skillPoints();
    const gold0 = Game.state.gold;

    const r = Game.respecTree();
    const after = JSON.parse(JSON.stringify(Game.state.skills));
    return {
      pool, spent0, r, after,
      gold0, gold1: Game.state.gold,
      pointsAfter: Game.skillPoints(),
      pasAfter: Object.keys(Game.state.passives).length,
      feeNext: Game.treeRespecFee(),
      count: Game.state.treeRespecCount
    };
  });
  ok(respec.r.ok === true, '洗点成功', respec.r);
  /* 4 只技能各 10 级 = 4×9 = 36 点，4 个被动各 1 级 = 4 点，2 个取向 = 2 点 → 42 */
  ok(respec.spent0 === 42, '洗点前共投出 42 点（36 等级 + 4 被动 + 2 取向）', respec.spent0);
  ok(respec.pointsAfter === respec.pool, '洗点后可用点回到满池（一分不少）', respec.pointsAfter);
  ok(respec.gold1 === respec.gold0 - 800, '第一次洗点扣 800 金', { a: respec.gold0, b: respec.gold1 });
  ok(respec.count === 1, '洗点次数 +1', respec.count);
  ok(respec.feeNext === 2400, '下一洗报价走到第二档 2400', respec.feeNext);
  ok(respec.pasAfter === 0, '被动账本清空');
  ok(Object.values(respec.after).every(e => e.lv === 1), '主动等级全部归 1', respec.after);
  ok(Object.values(respec.after).every(e => e.p === undefined), '取向清空（那是花点的）', respec.after);
  ok(respec.after.fireball.f === 2 && respec.after.fireball.m === 1
    && respec.after.fireball.el === 'fire' && respec.after.fireball.el2 === 'ice',
    '洗点后变体 / 精通 / 元素注入原样留着', respec.after.fireball);
  ok(respec.after.frostnova.f === 1 && respec.after.frostnova.el === 'ice', '另一只技能的免费字段也在', respec.after.frostnova);

  /* ---------------- 3. 被动落盘 ---------------- */
  console.log('三、被动落盘（存 → 刷新 → 读）');
  const pasSave = await p.evaluate(() => {
    Game.state.skills = { fireball: { lv: 6, f: 1 } };
    Game.state.passives = {};
    Game.state.treeRespecCount = 3;
    Game.recalc();
    /* 直接写账本（跳过门槛），再存档 —— 这一步验的是「写不写得进盘」 */
    const ids = Object.keys(SKILL_TREE.passives).slice(0, 2);
    for (const id of ids) Game.state.passives[id] = 2;
    Game.recalc();
    const pointsBefore = Game.skillPoints();
    Game.save();
    return { ids, pointsBefore, slot: Game.savedSlot };
  });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(600);
  const pasAfter = await p.evaluate((slot) => {
    const list = SaveManager.listSlots ? SaveManager.listSlots() : null;
    const okLoad = Game.loadSlot(slot);
    return {
      okLoad, list,
      passives: JSON.parse(JSON.stringify(Game.state.passives || {})),
      count: Game.state.treeRespecCount,
      points: Game.skillPoints(),
      fireball: JSON.parse(JSON.stringify((Game.state.skills || {}).fireball || {})),
      fee: Game.treeRespecFee()
    };
  }, pasSave.slot);
  ok(pasAfter.okLoad === true, '读档成功', pasAfter.okLoad);
  ok(Object.keys(pasAfter.passives).length === 2, '被动账本真的存进去了（旧实现根本不写盘）', pasAfter.passives);
  ok(Object.values(pasAfter.passives).every(v => v === 2), '被动等级原样回来', pasAfter.passives);
  ok(pasAfter.points === pasSave.pointsBefore, '可用点数与存档前一致（没有白送也没有吞掉）',
    { before: pasSave.pointsBefore, after: pasAfter.points });
  ok(pasAfter.count === 3, '洗点次数落盘（否则洗点价永远第一档）', pasAfter.count);
  ok(pasAfter.fee === 15000, '读档后洗点价仍在第四档 15000', pasAfter.fee);
  ok(pasAfter.fireball.f === 1, '技能账本的免费字段也过了一道存档', pasAfter.fireball);

  /* ---------------- 4. 脏档不崩 ---------------- */
  console.log('四、脏档不崩');
  const dirty = await p.evaluate((slot) => {
    /* 手改存档：一条 null、一条数字、一条 lv 越界 + 认不出的元素键 + 垃圾 id */
    const raw = JSON.parse(localStorage.getItem(SaveManager.slotKey(slot)));
    raw.skills = {
      fireball: null,
      frostnova: 5,
      meteor: { lv: 999, f: 9, m: 9, el: 'nope', el2: 3 },
      swordrain: { lv: 6, f: 2, m: 1, el: 'fire' },
      __junk__: 'x'
    };
    raw.passives = { nope: 3, m_blade: 99 };
    raw.treeRespecCount = -7;
    localStorage.setItem(SaveManager.slotKey(slot), JSON.stringify(raw));
    let loadOk = false, thrown = null;
    try { loadOk = Game.loadSlot(slot); } catch (e) { thrown = String(e && e.message || e); }
    let pointsOk = null, panelOk = null;
    try { pointsOk = Game.skillPoints(); } catch (e) { thrown = thrown || String(e && e.message || e); }
    try { UI.openSkill(); panelOk = true; } catch (e) { thrown = thrown || String(e && e.message || e); }
    const sk = JSON.parse(JSON.stringify(Game.state.skills || {}));
    return { loadOk, thrown, pointsOk, panelOk, sk, pas: Game.state.passives, cnt: Game.state.treeRespecCount };
  }, pasSave.slot);
  ok(dirty.loadOk === true, '脏档读得进', dirty.thrown);
  ok(dirty.thrown === null, '读档 + 算点数 + 开面板全程没抛异常', dirty.thrown);
  ok(dirty.panelOk === true, '技能面板能开');
  ok(typeof dirty.pointsOk === 'number' && dirty.pointsOk >= 0, 'skillPoints() 有合法读数', dirty.pointsOk);
  ok(!('__junk__' in dirty.sk), '认不出的技能 id 被丢掉（否则会白吃技能点）', Object.keys(dirty.sk));
  ok(dirty.sk.fireball && dirty.sk.fireball.lv === 1, 'null 条目收敛成 1 级', dirty.sk.fireball);
  ok(!dirty.sk.frostnova || typeof dirty.sk.frostnova === 'object', '数字条目收敛成对象', dirty.sk.frostnova);
  ok(dirty.sk.meteor.lv === 10, 'lv 越界夹到 10', dirty.sk.meteor);
  ok(dirty.sk.meteor.el === undefined, '认不出的元素键被丢掉', dirty.sk.meteor);
  ok(dirty.sk.meteor.f === 2 && dirty.sk.meteor.m === 2, '越界变体 / 精通夹回 0~2', dirty.sk.meteor);
  ok(dirty.sk.swordrain.el === 'fire', '合法的元素键留着', dirty.sk.swordrain);
  ok(!('nope' in (dirty.pas || {})), '认不出的被动 id 被丢掉', dirty.pas);
  ok(dirty.pas.m_blade === undefined || dirty.pas.m_blade <= 5, '被动等级夹到上限', dirty.pas);
  ok(dirty.cnt === 0, '负的洗点次数夹回 0', dirty.cnt);

  /* ---------------- 5. 老档兼容（8 格 → 5 格） ---------------- */
  console.log('五、老档兼容');
  const legacy = await p.evaluate((slot) => {
    const raw = JSON.parse(localStorage.getItem(SaveManager.slotKey(slot)));
    /* 退回 P1 之前的形状：8 格技能条、skills 只有 lv + v、没有 passives */
    raw.skillbar = ['whirl', 'thrust', 'bloodrage', 'execute', 'warcry', 'shieldwall', null, 'riposte'];
    raw.skills = { whirl: { lv: 7, v: 1 }, thrust: { lv: 5, v: 2 }, riposte: { lv: 3 } };
    delete raw.passives;
    delete raw.treeRespecCount;
    delete raw.barSet;
    localStorage.setItem(SaveManager.slotKey(slot), JSON.stringify(raw));
    const loadOk = Game.loadSlot(slot);
    const bar = Game.skillBar().slice();
    return {
      loadOk, bar,
      forms: {
        whirl: skillFormIdx(Game.state.skills, 'whirl'),
        thrust: skillFormIdx(Game.state.skills, 'thrust'),
        riposte: skillFormIdx(Game.state.skills, 'riposte')
      },
      pas: Game.state.passives,
      cnt: Game.state.treeRespecCount,
      set: Game.barSet(),
      lv: Game.state.skills.whirl.lv,
      points: Game.skillPoints()
    };
  }, pasSave.slot);
  ok(legacy.loadOk === true, '老档读得进');
  ok(Array.isArray(legacy.bar) && legacy.bar.length === 5, '8 格老条收敛成 5 格', legacy.bar);
  ok(legacy.bar.every(v => v === null || typeof v === 'string'), '条上没有 undefined', legacy.bar);
  ok(legacy.forms.whirl === 1 && legacy.forms.thrust === 2 && legacy.forms.riposte === 0,
    '只有 v 通道的老档，变体读数正确（缺 f 时读 v）', legacy.forms);
  ok(legacy.lv === 7, '老档技能等级原样保留', legacy.lv);
  ok(legacy.pas && typeof legacy.pas === 'object', '缺 passives 补空对象（不是 undefined）', legacy.pas);
  ok(legacy.cnt === 0, '缺 treeRespecCount 补 0');
  ok(legacy.set === 0, '缺 barSet 补 0');
  ok(typeof legacy.points === 'number', '老档算得出技能点', legacy.points);

  /* ---------------- 6. 面板截图 ---------------- */
  await p.evaluate(() => {
    Game.state.skills = {
      whirl: { lv: 10, v: 0, f: 2, m: 1 },
      thrust: { lv: 7, v: 1 },
      bloodrage: { lv: 5, v: 0 },
      execute: { lv: 4 },
      warcry: { lv: 3 },
      shieldwall: { lv: 2 }
    };
    Game.state.level = 40;
    Game.recalc();
    UI.openSkill();
  });
  await wait(700);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 'p6-skill-panel.png') });
  console.log('  截图：shots/p6-skill-panel.png');

  /* ---------------- 7. 控制台 ---------------- */
  console.log('六、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P6 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
