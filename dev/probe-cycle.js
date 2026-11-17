#!/usr/bin/env node
/* ============================================================
 * [M7.8] 二周目（轮回）· 真机验收
 *
 *   node dev/probe-cycle.js
 *
 * 契约（test-m7-8）判的是「数据对不对、公式对不对、接没接上」；
 * 这一份判的是「真的入一次轮回之后，游戏里变了什么、没变什么」。
 *
 * 量九件事：
 *   一、基线：新档 cycle 0 / 倍率 1 / 怪等级等于地图等级
 *   二、入轮回：cycle 1 / +10 级 / ×1.5，且 diff().drop 真的变了
 *   三、怪等级真的 +10（普通怪 + 首领两条路都量）
 *   四、召唤物不重复加（lv0 口径）
 *   五、保留：装备 / 等级 / 印 / 任务 / 图鉴 一个都没丢
 *   六、存档 round-trip：刷新之后还在第 1 轮回
 *   七、上限：到 9 之后拒绝再入
 *   八、真杀终 boss → 弹「入轮回」（走 onEnemyDeath 真路径）
 *   九、零报错
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
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;
    Game.invuln = 9999;
  });
  await wait(300);

  /* ---------- 一、基线 ---------- */
  console.log('一、基线：第 0 轮回什么都不该变');
  const base = await page.evaluate(() => {
    Game.enemies.length = 0;
    const e = Game.spawnEnemy('bat', 3, 0, false, 60);
    return {
      cyc: Game.cycle(),
      lv: Game.cycleLv(),
      mul: Game.cycleDropMul(),
      drop: Game.diff().drop,
      eLv: e && e.level,
      eLv0: e && e.lv0,
      hasCycleField: Game.state.cycle === 0
    };
  });
  ok(base.cyc === 0, '新档必须是第 0 轮回', base.cyc);
  ok(base.hasCycleField, 'state.cycle 必须显式是 0（不是 undefined）');
  ok(base.lv === 0, '第 0 轮回等级加成必须是 0', base.lv);
  ok(base.mul === 1, '第 0 轮回倍率必须是 1（新档手感一个字节都不许变）', base.mul);
  ok(base.eLv === 60, '第 0 轮回指定 60 级的怪必须就是 60 级', base.eLv);
  ok(base.eLv0 === 60, 'lv0 必须等于基础等级', base.eLv0);

  /* ---------- 二、入轮回 ---------- */
  console.log('二、入轮回：cycle 1 / +10 级 / ×1.5');
  const entered = await page.evaluate(() => {
    const before = Game.diff().drop;
    /* 造点「不该丢」的东西：一件装备 + 一个印 + 一条任务进度 */
    const it = rollItem(60, { cls: 'warrior', rarity: 'rare' });
    Game.state.inventory.length = 0;
    Game.addItem(it);
    Game.state.equipment = { weapon: it };
    Game.state.seals = { indra: true, yama: true };
    Game.state.quests.done = ['q1', 'q2'];
    Game.state.codex = Object.assign({}, Game.state.codex, { bat: 3 });
    Game.state.codexUnique = { frostmoon: true };
    Game.state.skills = Game.state.skills || {};

    const lvBefore = Game.state.level;
    const bagBefore = Game.state.inventory.length;
    const okEnter = Game.enterCycle();
    return {
      okEnter: okEnter,
      cyc: Game.cycle(),
      lv: Game.cycleLv(),
      mul: Game.cycleDropMul(),
      dropBefore: before,
      dropAfter: Game.diff().drop,
      lvSame: Game.state.level === lvBefore,
      bagSame: Game.state.inventory.length === bagBefore,
      eqSame: !!Game.state.equipment.weapon,
      seals: Object.keys(Game.state.seals || {}).length,
      quests: (Game.state.quests.done || []).length,
      codex: Game.state.codex.bat,
      uniq: !!Game.state.codexUnique.frostmoon,
      victory: Game.state.victory
    };
  });
  ok(entered.okEnter === true, 'enterCycle() 必须返回 true', entered.okEnter);
  ok(entered.cyc === 1, '入一次轮回之后 cycle 必须是 1', entered.cyc);
  ok(entered.lv === 10, '第 1 轮回等级加成必须是 +10', entered.lv);
  ok(entered.mul === 1.5, '第 1 轮回倍率必须是 1.5', entered.mul);
  ok(Math.abs(entered.dropAfter - entered.dropBefore * 1.5) < 1e-9,
    'diff().drop 必须真的 ×1.5（只改常量不生效是这类改动的典型漏法）',
    { before: entered.dropBefore, after: entered.dropAfter });

  /* ---------- 三、怪等级真的 +10 ---------- */
  console.log('三、怪等级：普通怪 + 首领都 +10');
  const lvTest = await page.evaluate(() => {
    Game.enemies.length = 0;
    const m = Game.spawnEnemy('bat', 3, 0, false, 60);
    const bid = Object.keys(BOSSES)[0];
    const b = Game.spawnEnemy(null, -3, 0, false, 60, bid);
    const out = { m: m && m.level, m0: m && m.lv0, b: b && b.level, b0: b && b.lv0, bid: bid };
    if (b) { Game.enemies = Game.enemies.filter(x => x !== b); b.actor && b.actor.group && b.actor.group.parent && b.actor.group.parent.remove(b.actor.group); }
    return out;
  });
  ok(lvTest.m === 70, '第 1 轮回：指定 60 级的普通怪必须变 70 级', lvTest.m);
  ok(lvTest.m0 === 60, 'lv0 必须仍是 60（回传用，不许被加成污染）', lvTest.m0);
  ok(lvTest.b === 70, '首领也必须是 70 级（' + lvTest.bid + '）', lvTest.b);
  ok(lvTest.b0 === 60, '首领 lv0 必须仍是 60', lvTest.b0);

  /* ---------- 四、召唤物不重复加 ---------- */
  console.log('四、召唤物：不许把加成加两次');
  const summon = await page.evaluate(() => {
    Game.enemies.length = 0;
    const mom = Game.spawnEnemy('bat', 0, 0, false, 60);
    mom.tag = 'bat';
    mom.maxHp = mom.hp = 1000;
    Game.summonMinions(mom, 2);
    const kids = Game.enemies.filter(e => e !== mom);
    const r = { n: kids.length, lv: kids.map(e => e.level), lv0: kids.map(e => e.lv0) };
    Game.enemies.length = 0;
    return r;
  });
  ok(summon.n > 0, '（前置）必须真的召出东西', summon);
  ok(summon.lv.every(v => v === 70), '召唤物等级必须是 70（不是 80）—— 加两次就变 80', summon.lv);
  ok(summon.lv0.every(v => v === 60), '召唤物 lv0 必须是 60', summon.lv0);

  /* ---------- 五、保留 ---------- */
  console.log('五、保留：装备 / 等级 / 印 / 任务 / 图鉴');
  ok(entered.lvSame, '等级必须保留（计划书：保留等级）');
  ok(entered.bagSame, '行囊必须保留（计划书：保留装备）');
  ok(entered.eqSame, '身上穿的必须保留');
  ok(entered.seals === 2, '魔将之印必须保留', entered.seals);
  ok(entered.quests === 2, '任务完成记录必须保留（不做任务重置）', entered.quests);
  ok(entered.codex === 3, '图鉴必须保留', entered.codex);
  ok(entered.uniq === true, '传世收集账必须保留', entered.uniq);
  ok(entered.victory === true, '轮回后 victory 标记应为 true');

  /* ---------- 六、存档 round-trip ---------- */
  console.log('六、存档：刷新之后还在第 1 轮回');
  const save = await page.evaluate(() => {
    const doc = SaveManager.pack(Game.state, 0);
    const back = SaveManager.unpack(doc);
    const flat = back && (back.state || back.flat || back);
    const raw = JSON.stringify(doc);
    return { inDoc: raw.indexOf('"cycle"') >= 0, back: flat && flat.cycle, keys: Object.keys(flat || {}).length };
  });
  ok(save.inDoc, 'pack 出来的文档里必须有 cycle', save.inDoc);
  ok(save.back === 1, 'unpack 之后必须原样读回 1（存得进读不回 = 轮回白打）', save.back);

  /* ---------- 七、上限 ---------- */
  console.log('七、上限：第 9 轮回之后拒绝再入');
  const cap = await page.evaluate(() => {
    Game.state.cycle = 9;
    Game._diffKey = null;
    const r9 = { lv: Game.cycleLv(), mul: Game.cycleDropMul() };
    const denied = Game.enterCycle();
    const after = Game.state.cycle;
    /* 脏存档：100 也要夹回 9 */
    Game.state.cycle = 100; Game._diffKey = null;
    const dirty = Game.cycle();
    Game.state.cycle = 1; Game._diffKey = null;
    return { r9: r9, denied: denied, after: after, dirty: dirty };
  });
  ok(cap.r9.lv === 90, '第 9 轮回等级加成 +90', cap.r9.lv);
  ok(cap.r9.mul === 5.5, '第 9 轮回倍率 5.5（线性，不是 38 倍）', cap.r9.mul);
  ok(cap.denied === false, '到顶之后 enterCycle 必须返回 false', cap.denied);
  ok(cap.after === 9, '到顶之后 cycle 不许再加', cap.after);
  ok(cap.dirty === 9, '脏存档里的 100 必须夹回 9（否则倍率会炸）', cap.dirty);

  /* ---------- 八、真杀终 boss ---------- */
  console.log('八、真杀终 boss → 弹「入轮回」');
  const real = await page.evaluate(async () => {
    Game.state.cycle = 0; Game._diffKey = null;
    Game.enemies.length = 0;
    /* 拦 UI.showDialog 看有没有弹出来（不真的点按钮） */
    const hits = [];
    const old = UI.showDialog;
    UI.showDialog = function (name, text, opts) {
      hits.push({ name: name, text: (text || '').slice(0, 40), n: (opts || []).length });
      return old.apply(this, arguments);
    };
    const e = Game.spawnEnemy(null, 0, 0, false, 60, 'chaosavatar');
    Game.boss = e;
    Game.damageEnemy(e, e.maxHp * 5, true, {});      // 进 P5
    e.bossInvulnT = 0;
    Game.damageEnemy(e, e.maxHp * 5, true, {});      // 打死
    await new Promise(r => setTimeout(r, 2200));
    UI.showDialog = old;
    const r = { dead: e.dead, hits: hits };
    UI.closeAll();
    return r;
  });
  ok(real.dead, '（前置）终 boss 必须真的被打死', real.dead);
  ok(real.hits.some(h => h.name === '轮回'), '击杀终 boss 之后必须弹「轮回」对话框', real.hits);
  const cycDlg = real.hits.filter(h => h.name === '轮回')[0];
  ok(cycDlg && cycDlg.n === 2, '对话框必须有「入轮回」和「再等等」两个按钮', cycDlg);

  /* ---------- 九、零报错 ---------- */
  console.log('九、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  M7.8 二周目真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
