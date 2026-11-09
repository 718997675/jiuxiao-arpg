#!/usr/bin/env node
/* ============================================================
 * [U3-4] 组合特效真机验收 —— 7 条规则逐条成立 + 视觉真的画了
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-combo.js
 *
 * 契约（dev/test-combo.js）判的是「规则表对不对」；这一份判的是
 * **接进游戏之后还成不成立**。两者缺一不可 —— U1 有过「契约全绿但
 * NaN 粒子照样算数」的前车之鉴，所以这里量的是真机 FXK 的实际调用。
 *
 * 量八件事：
 *   1  freeze  冻结目标吃物理伤 → 碎裂（真机 FXK.spr/decal/shock 都被调过）
 *   2  burn    带毒目标吃火伤   → 焚毒（绿焰 + 橙芯 + 酸渍）
 *   3  exec    破甲 + 残血       → 处决（裂口 + 目标身上一次软闪）
 *   4  poisonpin 真实放一张五雷符打带毒目标 → 绿烟 + 符钉（端到端）
 *   5  giant   刃势满层放 ⑤     → 立起来的巨刀虚影
 *   6  palm    法相窗内放法师 ① → 从背后飞来的手掌光点
 *   7  gather  聚怪开窗后另一发命中 → 向心吸入 + 0.55s 后的塌陷冲击
 *   8  ICD / silent / react / 换图 reset
 *
 * 三个坑：
 *   · 坐标必须验有限 —— NaN 的粒子照样「画了」，count 不为 0 但屏幕上什么都没有。
 *   · 组合层的时钟用假时钟（setClock），否则每条规则之间要死等 0.5~2 秒 ICD。
 *     假时钟只管 ICD 与聚怪窗口；二段演出走 VFX._later（真定时器），照旧等。
 *   · 技能伤害的主路径是 skill-beh.js 的 c.strike()（带元素、不带 tag），
 *     它是 setTimeout 延迟的 —— 判「符毒绿符钉」必须等够时间再读数。
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

/* 探针在页面里装的通用工具：起一个怪、录 FXK 调用、清账 */
const TOOLS = `
  window.__fx = [];
  ['spr','decal','shock','trail'].forEach(function (op) {
    const orig = FXK[op];
    FXK[op] = function (a, b) {
      const rec = { op: op };
      if (op === 'trail') {
        rec.n = Array.isArray(a) ? a.length : 0;
        rec.pts = (a || []).map(v => [v.x, v.y, v.z]);
      } else {
        rec.x = a && a.x; rec.y = a && a.y; rec.z = a && a.z;
        rec.tex = (b && b.tex) || '';
      }
      window.__fx.push(rec);
      return orig.apply(this, arguments);
    };
  });
  window.__t = 100000;
  ComboFX.setClock(function () { return window.__t; });
  window.__reset = function () {
    ComboFX.clearStats();
    window.__fx.length = 0;
    window.__t += 5000;          /* 跨过全局 0.5s / 同目标 2s 两道 ICD */
  };
  window.__foe = function (patch) {
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x, pp.z + 3);
    foe.hp = foe.maxHp = 1e9; foe.baseHp = 1e9;
    if (patch) Object.assign(foe, patch);
    Game.aimPoint = new THREE.Vector3(foe.pos.x, 0, foe.pos.z);
    Game.aimDir = new THREE.Vector3(0, 0, 1);
    Game.lastMoveDir = { x: 0, z: 1 };
    Game.running = true;
    return foe;
  };
  window.__kit = function (cls, skills) {
    Game.startNew(cls, '毒');
    Game.state.level = 30;
    Game.state.mp = 999999; Game.state.hp = Game.state.hpMax;
    Game.cooldowns = {}; Game.invuln = 999; Game.mobCap = 200;
    Game.state.skills = skills || {};
    try { Game.recalc(); } catch (e) { }
  };
  window.__finite = function (recs) {
    for (const r of recs) {
      const nums = r.op === 'trail' ? (r.pts || []).reduce((a, v) => a.concat(v), [])
        : [r.x, r.y, r.z];
      for (const v of nums) if (!Number.isFinite(v)) return false;
    }
    return true;
  };
`;

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);
  await p.evaluate(TOOLS);

  /* ---------------- 1~3：三条技能内组合（命中口） ---------------- */
  console.log('\n【1 / 2 / 3】技能内组合 · 真机 FXK 被调过 · 坐标有限');
  const hits = await p.evaluate(() => {
    const out = {};
    const one = (key, patch, elem) => {
      window.__reset();
      const foe = window.__foe(patch);
      Game.damageEnemy(foe, 100, false, { elem: elem });
      const s = ComboFX.stats();
      return {
        counts: s.counts, draws: s.draws,
        last: s.lastDraw[key] || null,
        fx: window.__fx.slice(),
        finite: window.__finite(window.__fx),
        errors: s.errors.slice()
      };
    };
    out.freeze = one('freeze', { slow: 1, slowT: 3 }, 'phys');
    out.burn = one('burn', { poisonN: 2, poisonNT: 2, venomT: 2 }, 'fire');
    out.exec = one('exec', { shred: 30, shredT: 3 }, 'phys');
    /* exec 要残血：把血量压到 20%（木桩是 1e9，直接改 hp 不改 maxHp） */
    window.__reset();
    const foe = window.__foe({ shred: 30, shredT: 3 });
    foe.hp = foe.maxHp * 0.2;
    Game.damageEnemy(foe, 100, false, { elem: 'phys' });
    const s = ComboFX.stats();
    out.exec = {
      counts: s.counts, draws: s.draws, last: s.lastDraw.exec || null,
      fx: window.__fx.slice(), finite: window.__finite(window.__fx), errors: s.errors.slice()
    };
    return out;
  });
  ok(hits.freeze.counts.freeze === 1 && hits.freeze.draws.freeze === 1,
    'freeze：冻结目标吃物理伤 → 碎裂触发并真的画了', hits.freeze.counts);
  ok(hits.freeze.last && hits.freeze.last.parts.join(',').indexOf('spr:shard') >= 0
    && hits.freeze.last.parts.join(',').indexOf('decal:frost') >= 0,
    'freeze：画了碎裂 + 霜面贴花', hits.freeze.last);
  ok(hits.freeze.fx.length >= 3 && hits.freeze.finite,
    'freeze：真机 FXK 真的被调过，坐标全部有限', hits.freeze.fx.length);

  ok(hits.burn.counts.burn === 1 && hits.burn.draws.burn === 1,
    'burn：带毒目标吃火伤 → 焚毒触发并真的画了', hits.burn.counts);
  ok(hits.burn.last && hits.burn.last.parts.join(',').indexOf('spr:ember') >= 0
    && hits.burn.last.parts.join(',').indexOf('decal:acid') >= 0,
    'burn：画了绿焰橙芯 + 酸渍', hits.burn.last);
  ok(hits.burn.fx.length >= 3 && hits.burn.finite,
    'burn：真机 FXK 真的被调过，坐标全部有限', hits.burn.fx.length);

  ok(hits.exec.counts.exec === 1 && hits.exec.draws.exec === 1,
    'exec：破甲 + 残血 → 处决触发并真的画了', hits.exec.counts);
  ok(hits.exec.last && hits.exec.last.parts.join(',').indexOf('decal:crack') >= 0
    && hits.exec.last.parts.join(',').indexOf('soft:target-only') >= 0,
    'exec：画了裂口 + 只闪目标（不是全屏闪白）', hits.exec.last);
  ok(hits.exec.fx.length >= 3 && hits.exec.finite,
    'exec：真机 FXK 真的被调过，坐标全部有限', hits.exec.fx.length);

  /* ---------------- 4：符毒绿符钉（端到端：真的放一张符） ---------------- */
  console.log('\n【4】poisonpin · 真的放一张五雷符打带毒目标');
  const pin = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__reset();
    window.__kit('taoist', { talisman: { lv: 1 } });
    const foe = window.__foe({ poisonN: 3, poisonNT: 3, venomT: 3 });
    Game.castSkill('talisman');
    /* 行为层的 strike 是 setTimeout 延迟的（技能伤害主路径），必须等够 */
    for (let i = 0; i < 30 && !(ComboFX.stats().counts.poisonpin); i++) await wait(120);
    const s = ComboFX.stats();
    return {
      counts: s.counts, draws: s.draws, last: s.lastDraw.poisonpin || null,
      fx: window.__fx.slice(), finite: window.__finite(window.__fx),
      errors: s.errors.slice(), n: window.__fx.length
    };
  });
  ok(pin.counts.poisonpin === 1 && pin.draws.poisonpin === 1,
    'poisonpin：符命中带毒目标 → 绿符钉触发并真的画了', pin.counts);
  ok(pin.last && pin.last.parts.join(',').indexOf('spr:smoke') >= 0
    && pin.last.parts.join(',').indexOf('spr:rune') >= 0
    && pin.last.parts.join(',').indexOf('decal:acid') >= 0,
    'poisonpin：画了绿烟 + 悬浮符钉 + 酸渍', pin.last);
  ok(pin.fx.length >= 3 && pin.finite,
    'poisonpin：真机 FXK 真的被调过，坐标全部有限', pin.fx.length);

  /* ---------------- 5：刃势满层 · 巨刀虚影 ---------------- */
  console.log('\n【5】giant · 刃势满层放 ⑤（剑神降世）');
  const giant = await p.evaluate(() => {
    window.__reset();
    window.__kit('warrior', { avatar: { lv: 10 } });
    /* 刃势 = 4 位掩码；满层 = 0b1111。断岳斩一进 case 'avatar' 就清零，
     * 组合层读的是 switch 之前算好的快照 —— 这里必须先点亮再放。 */
    Game.blade = { i: 0, mask: 0b1111 };
    const before = { edge: Game.bladeEdge(), on: Game.bladeFinisherOn() };
    Game.castSkill('avatar');
    const s = ComboFX.stats();
    return {
      before, counts: s.counts, draws: s.draws, last: s.lastDraw.giant || null,
      fx: window.__fx.slice(), finite: window.__finite(window.__fx), errors: s.errors.slice()
    };
  });
  ok(giant.before.on && giant.before.edge === 4, '刃势满层前置条件成立（4 层 + 终结技已解锁）', giant.before);
  ok(giant.counts.giant === 1 && giant.draws.giant === 1,
    'giant：刃势满层放 ⑤ → 巨刀虚影触发并真的画了', giant.counts);
  ok(giant.last && giant.last.parts.join(',').indexOf('trail:vertical-blade') >= 0,
    'giant：画的是立起来的竖直刀带', giant.last);
  ok(giant.fx.length >= 1 && giant.finite,
    'giant：真机 FXK 真的被调过，坐标全部有限', giant.fx.length);

  /* ---------------- 6：法相 · 手掌光点 ---------------- */
  console.log('\n【6】palm · 法相窗内放法师 ①');
  const palm = await p.evaluate(() => {
    window.__reset();
    window.__kit('mage', { fireball: { lv: 1 } });
    /* 法相窗口：法师 ⑤ 开的那 10 秒 */
    Game.elemAura = { t: 10, elem: 0, mul: 1, rider: false };
    const before = { aura: Game.elemAuraOn(), slot: skillArchSlotOf('mage', 'fireball') };
    Game.castSkill('fireball');
    const s = ComboFX.stats();
    return {
      before, counts: s.counts, draws: s.draws, last: s.lastDraw.palm || null,
      fx: window.__fx.slice(), finite: window.__finite(window.__fx), errors: s.errors.slice()
    };
  });
  ok(palm.before.aura && palm.before.slot === 1, '法相窗口 + 法师 ① 前置条件成立', palm.before);
  ok(palm.counts.palm === 1 && palm.draws.palm === 1,
    'palm：法相窗内放 ① → 手掌光点触发并真的画了', palm.counts);
  ok(palm.last && palm.last.parts.join(',').indexOf('trail:palm-arc') >= 0,
    'palm：画的是从背后飞过来的抛物线', palm.last);
  ok(palm.fx.length >= 1 && palm.finite,
    'palm：真机 FXK 真的被调过，坐标全部有限', palm.fx.length);

  /* ---------------- 7：聚怪窗口（真机开窗 → 另一发命中） ---------------- */
  console.log('\n【7】gather · 聚怪开窗后另一发命中 → 塌陷冲击');
  const gather = await p.evaluate(() => {
    window.__reset();
    /* 聚怪是旋风斩的「聚怪」变体（form 索引 2）*/
    window.__kit('warrior', { whirl: { lv: 10, p: 0, f: 2 } });
    const beh = Game.branchBeh('whirl');
    const opened = { hasForm: Game.hasSkillForm('whirl'), gather: !!(beh && beh.gather) };
    Game.castSkill('whirl');
    const win = ComboFX.stats().gather;
    /* 另一发命中：直接走伤害管线（带 skill:id，认得出不是旋风斩自己） */
    const foe = window.__foe();
    Game.damageEnemy(foe, 100, false, { elem: 'phys', skill: 'thrust' });
    const s = ComboFX.stats();
    return {
      opened, win: { id: win.id, until: win.until },
      counts: s.counts, draws: s.draws, last: s.lastDraw.gather || null,
      fx: window.__fx.slice(), finite: window.__finite(window.__fx), errors: s.errors.slice()
    };
  });
  ok(gather.opened.hasForm && gather.opened.gather,
    '旋风斩的「聚怪」变体真的挂上了 beh.gather', gather.opened);
  ok(gather.win.id === 'whirl', '真机施法把聚怪窗口开在了旋风斩上', gather.win);
  ok(gather.counts.gather === 1 && gather.draws.gather === 1,
    'gather：窗口内另一发命中 → 塌陷触发并真的画了', gather.counts);
  ok(gather.last && gather.last.parts.join(',').indexOf('spr:inward') >= 0,
    'gather：画的是向心吸入', gather.last);
  ok(gather.fx.length >= 4 && gather.finite,
    'gather：四道向心吸入都调过 FXK，坐标全部有限', gather.fx.length);

  /* ---------------- 8：ICD / silent / react / 换图 reset ---------------- */
  console.log('\n【8】ICD · silent/react 不过滤 · 换图清窗');
  const icd = await p.evaluate(() => {
    window.__reset();
    const foe = window.__foe({ slow: 1, slowT: 3 });
    Game.damageEnemy(foe, 100, false, { elem: 'phys' });
    const a = ComboFX.stats().counts.freeze || 0;
    /* 同目标、没过 2s → 必须挡住 */
    Game.damageEnemy(foe, 100, false, { elem: 'phys' });
    const b = ComboFX.stats().counts.freeze || 0;
    /* 假时钟推过 2s → 放行 */
    window.__t += 2500;
    Game.damageEnemy(foe, 100, false, { elem: 'phys' });
    const c = ComboFX.stats().counts.freeze || 0;
    /* 换目标：没过全局 0.5s → 挡住 */
    window.__t += 100;
    const foe2 = window.__foe({ slow: 1, slowT: 3 });
    Game.damageEnemy(foe2, 100, false, { elem: 'phys' });
    const d = ComboFX.stats().counts.freeze || 0;
    window.__t += 600;
    Game.damageEnemy(foe2, 100, false, { elem: 'phys' });
    const e = ComboFX.stats().counts.freeze || 0;
    return { a, b, c, d, e };
  });
  ok(icd.a === 1, '第一条命中触发', icd);
  ok(icd.b === 1, '同目标 2s 内不重播', icd);
  ok(icd.c === 2, '过了同目标 2s 可以再播', icd);
  ok(icd.d === 2, '换目标也过不了全局 0.5s', icd);
  ok(icd.e === 3, '过了全局 0.5s 换目标可以播', icd);

  const quiet = await p.evaluate(() => {
    window.__reset();
    const foe = window.__foe({ slow: 1, slowT: 3, poisonN: 2 });
    Game.damageEnemy(foe, 100, false, { elem: 'phys', silent: true });
    const s1 = ComboFX.stats().counts.freeze || 0;
    window.__t += 3000;
    Game.damageEnemy(foe, 100, false, { elem: 'phys', react: true });
    const s2 = ComboFX.stats().counts.freeze || 0;
    return { s1, s2, fx: window.__fx.length };
  });
  ok(quiet.s1 === 0 && quiet.s2 === 0, 'silent（dot 跳伤）与 react（反应追加）都不触发', quiet);

  const reset = await p.evaluate(() => {
    window.__reset();
    window.__kit('warrior', { whirl: { lv: 10, p: 0, f: 2 } });
    Game.castSkill('whirl');
    const before = ComboFX.stats().gather.id;
    /* 换图 = 走真的 loadMap */
    Game.loadMap('village');
    const after = ComboFX.stats().gather.id;
    return { before, after };
  });
  ok(reset.before === 'whirl' && reset.after === '',
    '换图后聚怪窗口被清掉（不把上一张图的窗口带进村里）', reset);

  console.log('\n【错误】');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
