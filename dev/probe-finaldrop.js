#!/usr/bin/env node
/* ============================================================
 * [M7.7] 终 boss 全传世掉落 · 真机验收
 *
 *   node dev/probe-finaldrop.js
 *
 * 契约（test-m7-7）判的是「数据对不对、抽取器语义对不对、接没接上」；
 * 这一份判的是「真杀掉那只终 boss 之后，地上真的多出哪些东西」。
 *
 * 量七件事：
 *   1. 真杀终 boss（走 onEnemyDeath）→ 必掉 1 件神兵 + 一堆玄晶
 *   2. 抽签机制真的吃 `BALANCE.finalUnique.rate`（抬到 50% 就掉一半）
 *   3. 真实概率下 2 万次不掉链子，且命中数与 0.01% 同量级
 *   4. **未收集优先**：只差一件时，抽 30 次必须全是它
 *   5. 传世一进包就记账（`state.codexUnique`）
 *   6. 老档兜底：账本是空的，但身上已经穿着一件 → 不会被当成「没收过」
 *   7. 存档 round-trip：`codexUnique` 存得进也读得回
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

  /* ---------- 一、真杀终 boss ---------- */
  console.log('一、真杀终 boss：保底橙 + 玄晶');
  const kill = await page.evaluate(() => {
    Game.enemies.length = 0;
    Game.loot.length = 0;
    const e = Game.spawnEnemy(null, 0, 0, false, 60, 'chaosavatar');
    Game.boss = e;
    /* 先打过 P5（不然这一击只会触发变身），再一击打死 */
    Game.damageEnemy(e, e.maxHp * 5, true, {});
    const formed = e.bafoForm;
    e.bossInvulnT = 0;
    Game.damageEnemy(e, e.maxHp * 5, true, {});
    const items = Game.loot.filter(l => l.item).map(l => ({ r: l.item.rarity, id: l.item.uniqueId || null }));
    return {
      formed: formed, dead: e.dead,
      lootN: Game.loot.length,
      items: items,
      crystal: Game.loot.filter(l => l.crystal).reduce((s, l) => s + l.crystal, 0),
      legendaries: items.filter(x => x.r === 'legendary').length
    };
  });
  ok(kill.formed, '（前置）这一击必须先进 P5 变身', kill.formed);
  ok(kill.dead, '第二击必须真的打死', kill.dead);
  ok(kill.legendaries >= 1, '必掉至少 1 件神兵（橙）', kill.legendaries);
  ok(kill.crystal >= 20, '必掉至少 20 玄晶（保证「刷一次不空手」）', kill.crystal);

  /* ---------- 二、抽签机制吃配置 ---------- */
  console.log('二、抽签机制：抬到 50% 就该掉一半');
  const mech = await page.evaluate(() => {
    const old = Game.spawnLoot;
    Game.spawnLoot = () => { };                  // 不真的造 3D 物体
    const FU = BALANCE.finalUnique;
    const saved = FU.rate.normal;
    FU.rate.normal = 0.5;
    let hit = 0;
    const N = 4000;
    /* 真实路径传的是 `e.pos`（Vector3），抽中时内部会 `p.clone()` 画一圈光。
     * 传裸对象 `{x,y,z}` 会在那一行炸 —— 探针要模拟真实调用形状。 */
    const P = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < N; i++) if (Game._finalUniqueDrop(P)) hit++;
    FU.rate.normal = saved;
    Game.spawnLoot = old;
    return { hit: hit, n: N, saved: saved };
  });
  /* p=0.5, n=4000 → σ≈31.6，±4σ 是 ±127 */
  ok(Math.abs(mech.hit - mech.n / 2) < 130, '50% 档必须掉一半（4σ 内）', mech);
  ok(mech.saved === 0.0001, '测试必须把真实概率原样还回去', mech.saved);

  /* ---------- 三、真实概率 ---------- */
  console.log('三、真实概率：2 万次同量级');
  const real = await page.evaluate(() => {
    const old = Game.spawnLoot;
    Game.spawnLoot = () => { };
    let hit = 0;
    const N = 20000;
    const P = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < N; i++) if (Game._finalUniqueDrop(P)) hit++;
    Game.spawnLoot = old;
    return { hit: hit, n: N, rate: BALANCE.finalUnique.rate[Game.state.difficulty] };
  });
  /* p=1e-4, n=2e4 → 期望 2；给 0~12 的宽带（0 的概率 13%，所以下限只能是 0） */
  ok(real.rate === 0.0001, '普通难度必须是 0.01%', real.rate);
  ok(real.hit <= 12, '2 万次不该出现几十次（说明概率没被放大）', real);
  ok(real.hit >= 0, '（观测）2 万次命中 ' + real.hit + ' 次');

  /* ---------- 四、未收集优先 ---------- */
  console.log('四、未收集优先：只差一件时全是它');
  const fresh = await page.evaluate(() => {
    const all = UNIQUE_ITEMS.map(u => u.id);
    const keep = all[all.length - 1];
    const seen = {};
    for (const id of all) if (id !== keep) seen[id] = true;
    Game.state.codexUnique = seen;
    Game.state.inventory.length = 0;
    Game.state.equipment = {};
    const old = Game.spawnLoot;
    Game.spawnLoot = () => { };
    const FU = BALANCE.finalUnique;
    const saved = FU.rate.normal;
    FU.rate.normal = 1;                          // 每次都中，只看「抽到哪一件」
    const got = [];
    const P = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const it = Game._finalUniqueDrop(P);
      got.push(it && it.uniqueId);
    }
    FU.rate.normal = saved;
    Game.spawnLoot = old;
    return { keep: keep, got: got, uniq: Array.from(new Set(got)) };
  });
  ok(fresh.uniq.length === 1 && fresh.uniq[0] === fresh.keep,
    '只差一件没收集时，30 次必须全是它', { want: fresh.keep, got: fresh.uniq });

  /* ---------- 五、一进包就记账 ---------- */
  console.log('五、记账：一进包就记');
  const mark = await page.evaluate(() => {
    Game.state.codexUnique = {};
    Game.state.inventory.length = 0;
    const it = rollItem(62, { cls: 'warrior', rarity: 'unique', uniqueId: 'frostmoon' });
    const added = Game.addItem(it);
    return { added: added, has: !!Game.state.codexUnique.frostmoon, keys: Object.keys(Game.state.codexUnique) };
  });
  ok(mark.added, '（前置）必须真的进包', mark.added);
  ok(mark.has, 'addItem 之后账本里必须有这一件', mark.keys);

  /* ---------- 六、老档兜底 ---------- */
  console.log('六、老档：账本空但身上穿着，也算「收过」');
  const legacy = await page.evaluate(() => {
    Game.state.codexUnique = {};
    Game.state.inventory.length = 0;
    const it = rollItem(62, { cls: 'warrior', rarity: 'unique', uniqueId: 'frostmoon' });
    Game.state.equipment = { weapon: it };
    const seen = Game.uniqueSeen();
    /* 背包里也放一件，同样要算 */
    const it2 = rollItem(62, { cls: 'warrior', rarity: 'unique', uniqueId: 'lingxu_boots' });
    Game.state.inventory.push(it2);
    const seen2 = Game.uniqueSeen();
    Game.state.equipment = {}; Game.state.inventory.length = 0;
    return { eq: !!seen.frostmoon, bag: !!seen2.lingxu_boots, book: Object.keys(Game.state.codexUnique).length };
  });
  ok(legacy.eq, '身上穿着的那件必须算「收过」（账本是空的）', legacy);
  ok(legacy.bag, '背包里的那件也必须算', legacy);
  ok(legacy.book === 0, '（前置）账本确实是空的', legacy.book);

  /* ---------- 七、存档 round-trip ---------- */
  console.log('七、存档 round-trip');
  const save = await page.evaluate(() => {
    Game.state.codexUnique = { frostmoon: true, lingxu_boots: true };
    const doc = SaveManager.pack(Game.state, 0);
    const s = JSON.stringify(doc);
    const back = SaveManager.unpack(doc);
    const flat = back && (back.state || back.flat || back);
    const cu = flat && flat.codexUnique;
    return {
      inDoc: s.indexOf('frostmoon') >= 0,
      back: cu && cu.frostmoon === true && cu.lingxu_boots === true,
      keys: cu ? Object.keys(cu) : null
    };
  });
  ok(save.inDoc, 'pack 出来的文档里必须有 codexUnique', save.inDoc);
  ok(save.back, 'unpack 之后必须原样读回（存得进、读不回是最典型的坑）', save.keys);

  /* ---------- 八、不炸 ---------- */
  console.log('八、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  M7.7 全传世掉落真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
