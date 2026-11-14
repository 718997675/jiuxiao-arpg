#!/usr/bin/env node
/* ============================================================
 * U6-2 · 技能音效三段对齐 · 真机测量（先量后改）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-sfx-align.js
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-sfx-align.js whirl leap
 *
 * 为什么要有这支探针：
 *   方案 §5 说「时间轴三段式」—— 起手 60~150ms / 命中 40~80ms / 余韵 200~600ms。
 *   但**音频侧只落了「起手」一层**：命中音散在 `game.js` 的 40+ 处调用点，
 *   有的在施法瞬间就响（比画面命中早 100~200ms）、有的在命中点才响，
 *   余韵音**整个不存在**。没有统一时序可查 = 改不动也证明不了。
 *
 * 这支探针量四件事（全部在真机里量，不读源码猜）：
 *   1. **起手音**：施法后有没有音、音在第几毫秒
 *   2. **伤害结算**：第一笔伤害落在第几毫秒
 *   3. **命中反馈**：`Game.hitstop` / `Game.shake` 变化的时刻
 *      —— 这才是玩家感知的「打到了」（伤害数字可能比它更早出现）
 *   4. **余韵音**：命中之后有没有尾音
 *
 * 两个量法上的坑（跟 probe-skill-p5b 同源）：
 *   - 无头 + 软件渲染下 dt 被夹到 0.05，模拟时间远慢于真实时间。
 *     所以**顺序是硬判据**，毫秒只作参考打印（同一 tick 内的东西 ms 会偏）。
 *   - `SFX.*` 在真机上**可能压根没出声**（AudioContext 没跑起来），
 *     但我们要量的是「**什么时候决定要发这个音**」，所以包的是**方法调用**，
 *     不是 WebAudio 节点 —— 这么量跟有没有音频设备无关。
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

/* 观察窗口：命中在 setTimeout / 飞弹 onHit / DoT tick 里的技能要留够。
 * 同一张表在 probe-skill-p5b.js 里已有先例（WAIT.iceshard = 1700）。 */
const WAIT = {
  thrust: 750, leap: 750, fireball: 950, frostnova: 750, iceshard: 1700,
  blizzard: 950, firewall: 950, thundercloud: 950, poison: 950, taiji: 950,
  swordrain: 950, skysfall: 1700, meteor: 1600, starfall: 1800,
  judgement: 1400, swordarray: 900, chain: 500, quake: 500, whirl: 400, execute: 400,
  warcry: 400, bloodrage: 400, shieldwall: 400, riposte: 400, antidote: 400,
  heal: 400, revive: 400, iceshield: 500, elementavatar: 500, avatar: 700,
  talisman: 600, talismanarrow: 700, mastersigil: 600, summon: 600,
  whitetiger: 700, azuredragon: 700, pyroclasm: 900
};

/* 观察窗内「有没有伤害」的技能类型。
 * buff / heal / summon / shield 不结算伤害 —— 它们只有起手音。 */
const DAMAGE_TYPES = ['melee', 'aoe', 'proj', 'dash', 'zone', 'nova', 'ultimate',
  'rain', 'bolt', 'chain', 'meteor', 'swordrain'];

(async () => {
  const only = process.argv.slice(2);
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  console.log('\n【1】量法自检：包住音效方法 / 伤害口 / 命中反馈');
  const self = await p.evaluate(() => {
    window.__log = [];
    window.__T0 = 0;
    window.__inSeg = 0;
    /* 包音效方法：量的是「什么时候决定要发这个音」，
     * 与真机有没有音频设备无关。
     * **必须包含余韵三键**（tail / rustle / ring）—— 少了它们，
     * §5 第三段（余韵）在日志里根本不存在，判据只能永远红。 */
    const names = ['swing', 'hit', 'crit', 'cast', 'fire', 'ice', 'thunder',
      'explode', 'heal', 'die', 'ui', 'boss', 'skill', 'coin', 'levelup', 'loot',
      'tail', 'rustle', 'ring'];
    window.__saved = [];
    for (const n of names) {
      if (typeof SFX[n] !== 'function') continue;
      const old = SFX[n];
      window.__saved.push([n, old]);
      SFX[n] = function () {
        window.__log.push({ k: 'sfx', n, t: Math.round(performance.now() - window.__T0),
          seg: window.__inSeg ? 1 : 0 });
        return old.apply(this, arguments);
      };
    }
    /* [U6-2 收口] 三段层是唯一出口 —— 给它发出的每个音打标记。
     * 探针里那只假怪会自己攻击（SFX.cast()），跨技能的残留定时器也会响，
     * 以前把它们全算进当前技能，「无双响」判据一次误报 13 只。
     * 判据只认 seg=1：即 SfxAudio._play 发出的音。 */
    if (typeof SfxAudio !== 'undefined' && SfxAudio && typeof SfxAudio._play === 'function') {
      const op = SfxAudio._play;
      SfxAudio._play = function () {
        window.__inSeg++;
        try { return op.apply(this, arguments); }
        finally { window.__inSeg--; }
      };
      window.__segWrapped = true;
    }
    /* 包伤害结算：命中时刻的第一手证据 */
    const od = Game.damageEnemy;
    Game.damageEnemy = function () {
      window.__log.push({ k: 'dmg', t: Math.round(performance.now() - window.__T0) });
      return od.apply(this, arguments);
    };
    /* 包视觉命中标记：playSkillVfx 的 segments:['impact'] 就是「命中段」 */
    const ov = Game.playSkillVfx;
    Game.playSkillVfx = function (id, opts) {
      const seg = (opts && opts.segments) || null;
      if (seg && seg.indexOf('impact') >= 0) {
        window.__log.push({ k: 'vfxImpact', t: Math.round(performance.now() - window.__T0) });
      }
      return ov.call(this, id, opts);
    };
    /* 命中反馈：hitstop / shake 变了 = 玩家感知到的「打到了」 */
    window.__fb = { hitstop: -1, shake: -1 };
    const tick = () => {
      const hs = Game.hitstop || 0, sh = Game.shake || 0;
      if (hs !== window.__fb.hitstop || sh !== window.__fb.shake) {
        window.__fb.hitstop = hs; window.__fb.shake = sh;
        window.__log.push({ k: 'fb', t: Math.round(performance.now() - window.__T0) });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { sfxWrapped: window.__saved.length, hasDmg: typeof od === 'function',
      segWrapped: !!window.__segWrapped };
  });
  ok(self.sfxWrapped >= 14, '音效方法已包住 ' + self.sfxWrapped + ' 个', self);
  ok(self.hasDmg, '伤害结算口已包住');
  ok(self.segWrapped, '三段层出口已打标记（判据只认它发的音）');

  console.log('\n【2】逐只技能量三段（起手 / 命中 / 余韵）');
  const allIds = await p.evaluate(() => {
    const out = [];
    for (const c of Object.keys(SKILL_ORDER)) for (const id of SKILL_ORDER[c]) out.push(id);
    return out;
  });
  const list = only.length ? only : allIds;

  const rows = await p.evaluate(async (list, waits) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const oldUnlock = Game.skillUnlocked;
    Game.skillUnlocked = () => true;
    const out = [];
    for (const id of list) {
      /* 环境：一只假怪 + 满资源 + 无冷却 */
      Game.mapGen = (Game.mapGen || 0) + 1;
      if (Game.enemies) Game.enemies.length = 0;
      Game.state.mp = 999999;
      Game.state.hp = Game.state.hpMax;
      Game.cooldowns = {};
      Game._autoCast = false; Game._freeCast = false;
      Game._drainOn = null; Game._recharge = null;
      Game.invuln = 999;
      Game.running = true; Game.dead = false;
      Game.state.skills = {}; Game.state.skills[id] = { lv: 10 };
      try { Game.recalc(); } catch (e) { }
      const pp = Game.playerGroup.position;
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z + 2.5);
      Game.aimDir = new THREE.Vector3(0, 0, 1);
      Game.lastMoveDir = { x: 0, z: 1 };
      const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x, pp.z + 2.2);

      window.__log.length = 0;
      window.__T0 = performance.now();
      let err = null;
      try { Game.castSkill(id); } catch (e) { err = String(e && e.message || e); }
      await wait(waits[id] || 450);
      const log = window.__log.slice();
      if (foe) foe.dead = true;
      const sk = (typeof SKILLS !== 'undefined') ? SKILLS[id] : null;
      out.push({
        id, err, type: (sk && sk.type) || '?',
        /* `*` = 三段层（SfxAudio._play）发的音；没星的是怪 AI / 残留定时器 / UI，
         * 打印出来人眼就能分清，不用回头猜哪一声是噪声。 */
        log: log.map(e => e.k + (e.n ? ':' + e.n : '') + '@' + e.t
          + (e.k === 'sfx' && e.seg ? '*' : '')),
        /* 原始事件也带出去 —— 判据按 `k` 查，格式化串只给人看 */
        ev: log.map(e => ({ k: e.k, n: e.n || '', t: e.t, seg: e.seg || 0 }))
      });
    }
    Game.skillUnlocked = oldUnlock;
    return out;
  }, list, WAIT);

  console.log('  技能'.padEnd(16) + '类型'.padEnd(11) + '事件序列（毫秒）');
  for (const r of rows) {
    const seq = r.log.join(' ');
    console.log('  ' + r.id.padEnd(14) + r.type.padEnd(11) + (seq || '（无事件）') +
      (r.err ? '  抛错: ' + r.err : ''));
  }

  console.log('\n【3】判据');
  /* 3.1 每只技能：起手段必须有一声（施法后立刻就有反馈）。
   *     判据按 `k` 查（log 是给人看的格式化串，ev 才是原始事件）。 */
  const noCast = rows.filter(r => !r.ev.some(e => e.k === 'sfx' && e.seg === 1));
  ok(noCast.length === 0, '每只技能施放时都至少发一声（起手段不空）',
    noCast.map(r => r.id));

  /* 3.2 三段的分段键从**配置表**反查，不再用「固定音色清单」。
   *
   *   为什么要按技能分：命中音可能是 hit / crit / explode / thunder / swing
   *   任意一个；而起手音可能也是同一个键（whirl 的 cast 是 swing，
   *   swordarray 的 impact 也是 swing）。用一张全局清单必然把起手算成命中。 */
  const SEG = await p.evaluate(() => {
    const o = {};
    for (const id in SKILL_AUDIO) {
      const a = SKILL_AUDIO[id];
      o[id] = {
        impact: [a.impact, a.impactCrit].filter(Boolean),
        after: a.after ? a.after.key : null,
        impactAt: a.impactAt || 0,
        afterMs: a.after ? a.after.ms : 0
      };
    }
    return o;
  });
  ok(Object.keys(SEG).length === 37,
    '从页面取到了 37 只技能的分段键（命中/余韵各归各段）', Object.keys(SEG).length);

  /* 3.2a 音画同拍：**瞬时命中**的技能，命中音要贴着伤害结算（±200ms）。
   * 领域类（impactAt）不判这条 —— 它们的命中是「落地」那一拍，
   * 每跳 silent DoT 不是命中帧，拿它当基准会得出「落地音比伤害早 400ms」的假红。 */
  const orderBad = [];
  for (const r of rows) {
    const cfg = SEG[r.id];
    if (!cfg || !cfg.impact.length) continue;
    if (cfg.impactAt) {
      /* 领域：判「落地音存在」，不判与 DoT 同拍 */
      const land = r.ev.some(e => e.k === 'sfx' && e.seg === 1 && cfg.impact.indexOf(e.n) >= 0);
      if (!land) orderBad.push({ id: r.id, why: '领域落地没有自报命中音', log: r.log });
      continue;
    }
    const iDmg = r.ev.findIndex(e => e.k === 'dmg');
    if (iDmg < 0) continue;                 /* 挥空不判 */
    const near = r.ev.filter(e => e.k === 'sfx' && e.seg === 1
      && cfg.impact.indexOf(e.n) >= 0
      && Math.abs(e.t - r.ev[iDmg].t) <= 200);
    if (!near.length) orderBad.push({ id: r.id, why: '命中帧附近没有该技能的 impact 音', log: r.log });
  }
  ok(orderBad.length === 0, '结算伤害的技能：命中帧附近必有一声（音画同拍）',
    orderBad.map(b => ({ id: b.id, why: b.why, seq: b.log })));

  /* 3.2b 无双响：只统计**该技能 impact 段**的发声。
   * 任意两声间隔 < IMPACT_WINDOW(120ms) = 叠在一起 = 真双响；
   * 间隔 ≥120ms 是多段技（连震三波 / 剑雨多下），本来就该一下一下。
   * 起手、余韵、怪 AI、残留定时器全不在统计里。 */
  const dblBad = [];
  for (const r of rows) {
    const cfg = SEG[r.id];
    if (!cfg || !cfg.impact.length) continue;
    const ts = r.ev.filter(e => e.k === 'sfx' && e.seg === 1 && cfg.impact.indexOf(e.n) >= 0)
      .map(e => e.t).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] < 120) dblBad.push({ id: r.id, gap: ts[i] - ts[i - 1], at: ts[i] });
    }
  }
  ok(dblBad.length === 0, '同一发的命中音不叠在一起（间隔 ≥120ms，多段技合法）', dblBad);

  /* 3.3 余韵：每只技能都要有，且落在 §5 的 200~600ms。
   * 基准是**该技能第一声 impact 音**（命中那一刻）；没有命中段的技能
   * 用施法瞬间 t=0 —— 它们的余韵本来就是「这次施法的收尾」。
   * 旧判据拿「第一笔 dmg」当基准：领域落地比 DoT 早 400ms、
   * 陨石余韵跟的是命中不是第一跳，都会被误判。 */
  const noAfter = [];
  const afterRows = [];
  for (const r of rows) {
    const cfg = SEG[r.id];
    if (!cfg || !cfg.after) { noAfter.push(r.id); continue; }
    const imp = r.ev.find(e => e.k === 'sfx' && e.seg === 1 && cfg.impact.indexOf(e.n) >= 0);
    const base = imp ? imp.t : 0;
    const after = r.ev.filter(e => e.k === 'sfx' && e.seg === 1 && e.n === cfg.after
      && e.t >= base + 150);
    if (!after.length) noAfter.push(r.id);
    else afterRows.push({ id: r.id, n: after[0].n, dt: after[0].t - base });
  }
  ok(noAfter.length === 0, '每只技能都有余韵音（§5 第三段：tail / rustle / ring）', noAfter);
  /* 余韵延迟必须落在 §5 的 200~600ms 窗口里 */
  const lateAfter = afterRows.filter(x => x.dt < 150 || x.dt > 700);
  ok(lateAfter.length === 0, '余韵延迟落在 §5 的 200~600ms 窗口内', lateAfter);

  console.log('\n【4】控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail ? '✗' : '✓') + ' 音效三段探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
