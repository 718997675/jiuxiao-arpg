#!/usr/bin/env node
/* ============================================================
 * B20 真机探针：玩家侧技能演出层 `src/sfx.js` 在**游戏里**真的能出东西
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-sfx.js
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-sfx.js whirl quake
 *
 * 为什么不能只靠 `build-skillvfx.js --check`：那只证明「生成物没走散」，
 * 证明不了「搬进游戏之后还画得出来」。搬家最容易坏的五处，这里各钉一条：
 *   1. 没绑场景 —— 原语全往 SKFX 自己的 Group 里加，没 bind 就一个都进不了场景图
 *   2. 没接帧   —— update 没被调，粒子永远停在第 0 帧、一次性效果永不退场
 *   3. 符号没垫 —— 技能体引用了实验室的全局（playerHP / tierOn / toast …），
 *                  少一个就是运行到那一行才 ReferenceError，而且 catch 会吞
 *   4. 没接清场 —— 换图后旧图的斧头 / 灵符挂在新图坐标上，再也删不掉
 *   5. id 对不上 —— 实验室叫 swords / missile / rain / stance，游戏叫
 *                  swordarray / fireball / swordrain / avatar / elementavatar；
 *                  对不上不报错，只是**静默不播**（最容易漏）
 *
 * 两个量法上的坑（跟 probe-fx2 同源）：
 *   - SKFX 是 `const`，不在 window 上；判接口直接引用名字，别用 window.SKFX
 *   - 无头 + 软件渲染下 dt 被夹到 0.05，模拟时间远慢于真实时间 → 一律轮询
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const only = process.argv.slice(2);

  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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

  console.log('\n【1】接口面');
  const api = await p.evaluate(() => {
    const missing = ['bind', 'update', 'sync', 'play', 'clear', 'has', 'stats', 'keys']
      .filter(k => typeof SKFX === 'undefined' || typeof SKFX[k] !== 'function');
    return {
      missing,
      bound: !!(Game.scene && Game.scene.getObjectByName('sfx')),
      n: (typeof SKFX !== 'undefined' && SKFX.keys) ? SKFX.keys().length : 0,
      keys: (typeof SKFX !== 'undefined' && SKFX.keys) ? SKFX.keys() : []
    };
  });
  ok(api.missing.length === 0, '八个接口都在', api.missing);
  ok(api.bound, 'bind 进了场景图（Game.scene 里找得到 sfx 这个 Group）');
  ok(api.n === 37, '技能实现 37 只', api.n);
  console.log('    ' + api.keys.join(' '));

  /* 游戏侧的 37 只真技能 id。探针要**双向**核：
   * 实验室多出来的（说明 id 没映射对）和游戏缺的（说明有技能还是老配方）都算红。 */
  const gameIds = await p.evaluate(() => {
    const out = [];
    for (const cls of Object.keys(SKILL_ORDER)) for (const id of SKILL_ORDER[cls]) out.push(id);
    return out;
  });
  const sfxSet = new Set(api.keys);
  const gameMiss = gameIds.filter(id => !sfxSet.has(id));
  ok(gameMiss.length === 0, '游戏 37 只技能全部有手搓实现', gameMiss);

  console.log('\n【2】逐只放一遍（每一只都必须有东西上场）');
  const list = only.length ? only.filter(k => sfxSet.has(k)) : api.keys;
  const rows = [];
  for (const key of list) {
    const r = await p.evaluate(async (k) => {
      try { SKFX.clear(); } catch (e) { }
      const pp = Game.playerGroup.position;
      let thrown = null;
      try {
        SKFX.play(k, {
          x: pp.x, z: pp.z,
          aim: new THREE.Vector3(pp.x + 3, 0, pp.z + 3),
          dir: new THREE.Vector3(0, 0, 1),
          tx: pp.x + 3, tz: pp.z + 3
        });
      } catch (e) { thrown = e.message; }
      /* 推进两帧，让 delay / seq 的第一拍落下来 */
      for (let i = 0; i < 3; i++) { SKFX.update(0.016); }
      const s = SKFX.stats();
      return { thrown, ...s };
    }, key);
    rows.push({ key, ...r });
  }

  const dead = rows.filter(r => r.thrown || (r.particles + r.updaters + r.meshes) === 0);
  for (const r of rows) {
    const total = r.particles + r.updaters + r.meshes;
    const flag = (r.thrown || total === 0) ? '✗' : ' ';
    console.log(`  ${flag} ${r.key.padEnd(15)} 粒子 ${String(r.particles).padStart(4)}  updater ${String(r.updaters).padStart(3)}  mesh ${String(r.meshes).padStart(3)}` +
      (r.thrown ? '  抛错: ' + r.thrown : ''));
  }
  ok(dead.length === 0, '每只技能都上场了（粒子 / updater / mesh 至少一样 > 0）',
    dead.map(d => d.key + (d.thrown ? '(' + d.thrown + ')' : '')));

  console.log('\n【3】推进与退场');
  const ttl = await p.evaluate(async () => {
    SKFX.clear();
    const pp = Game.playerGroup.position;
    SKFX.play('whirl', {
      x: pp.x, z: pp.z,
      aim: new THREE.Vector3(pp.x, 0, pp.z + 1),
      dir: new THREE.Vector3(0, 0, 1), tx: pp.x, tz: pp.z + 1
    });
    for (let i = 0; i < 4; i++) SKFX.update(0.016);
    const a = SKFX.stats().particles;
    /* 推进 6 秒（分 120 步，每步 0.05）—— 无头下按真实时间等不到 */
    for (let i = 0; i < 120; i++) SKFX.update(0.05);
    const b = SKFX.stats();
    return { after: a, later: b.particles, updaters: b.updaters };
  });
  ok(ttl.after > 0, '刚放完有粒子在飞', ttl.after);
  ok(ttl.later === 0 && ttl.updaters === 0, '6 秒后全部退场（粒子清零、updater 清空）', ttl);

  console.log('\n【4】清场');
  const cl = await p.evaluate(async () => {
    const pp = Game.playerGroup.position;
    for (const k of ['whirl', 'talisman', 'summon', 'storm'].filter(x => SKFX.has(x))) {
      SKFX.play(k, {
        x: pp.x, z: pp.z, aim: new THREE.Vector3(pp.x + 2, 0, pp.z),
        dir: new THREE.Vector3(0, 0, 1), tx: pp.x + 2, tz: pp.z
      });
      SKFX.update(0.016);
    }
    const before = SKFX.stats();
    SKFX.clear();
    const after = SKFX.stats();
    return { before, after, groupChildren: (SKFX.scene.children || []).length };
  });
  ok(cl.before.meshes > 0, '清场前确实有 mesh', cl.before.meshes);
  ok(cl.after.meshes === 0, 'clear 之后 mesh 清零', cl.after);

  console.log('\n【5】接线：游戏自己的施法口能不能走到新层');
  /* 上一节是**直接**调 SKFX.play，证明不了「游戏会调它」。
   * 这一节走 Game.playSkillVfx（castSkill 内部用的就是它），钉两件事：
   *   起手那一拍 → 必须播（否则游戏里永远看不到）
   *   命中那一拍 → 必须**不播**（sfx 的 v2 是整只一次播完，再补一次就是双播）
   * 施法闸门（解锁 / CD / 蓝 / 射程）不走 —— 这里只验接线，不验玩法。 */
  const wire = await p.evaluate((ids) => {
    const hits = {};
    const orig = SKFX.play;
    SKFX.play = function (k, c) { hits[k] = (hits[k] || 0) + 1; return orig.call(SKFX, k, c); };
    const pp = Game.playerGroup.position;
    const aim = new THREE.Vector3(pp.x + 2, 0, pp.z);
    const missCast = [], missImpact = [];
    const clear = () => { for (const k in hits) delete hits[k]; };
    for (const id of ids) {
      clear();
      Game.playSkillVfx(id, { pos: pp, aim: aim, segments: ['cast'] });
      if (!hits[id]) missCast.push(id);
      clear();
      Game.playSkillVfx(id, { pos: pp, aim: aim, segments: ['impact'] });
      if (hits[id]) missImpact.push(id);
    }
    SKFX.play = orig;
    return { missCast, missImpact };
  }, api.keys);
  ok(wire.missCast.length === 0, '37 只的「起手」都会走到新层', wire.missCast);
  ok(wire.missImpact.length === 0, '「命中」那一拍不再补播（防双播）', wire.missImpact);

  console.log('\n【6】控制台');
  const real = errs.filter(e => !/favicon|Failed to load resource/i.test(e));
  if (real.length) { real.slice(0, 12).forEach(e => console.log('  ! ' + e.slice(0, 180))); }
  ok(real.length === 0, '没有报错', real.length);

  console.log(`\n${fail === 0 ? '✓' : '✗'} 技能演出层：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
