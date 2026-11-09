#!/usr/bin/env node
/* ============================================================
 * [U4-4] 元素反应专属视觉真机验收 —— 10 组逐条触发 + 形状互不重样
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-elemfx.js
 *
 * 契约（dev/test-elemfx.js）判的是「配方表对不对、接线在不在」；
 * 这一份判的是**接进游戏之后真的画了、而且 10 组不是同一个模子**。
 * U1 的教训：契约全绿 ≠ 视觉成立，NaN 粒子照样「画了」。
 *
 * 量七件事：
 *   1  10 组逐条在真机上触发，每组都调过 FXK，坐标全部有限
 *   2  10 组的**原语序列**两两不同（配色不算形状）
 *   3  旧 FX.* 视觉真的换掉了 —— 反应期间 flashCircle/ring/burst/beam/area 零调用
 *   4  链式电弧走 ElemFX.link（感电冻结 1 段 / 腐蚀链 2 段）
 *   5  数值逻辑一行没改 —— 10 组的收益逐条仍然生效
 *   6  ICD 仍然由反应机制管（同目标 2s 内视觉不重播）
 *   7  零 console.error / pageerror
 *
 * 三个坑：
 *   · **FXK 调用的归属**：ComboFX 与 ElemFX 都用 FXK，同一发伤害可能两层一起画
 *     （火打带毒目标 = ComboFX.burn + ElemFX.burnpoison）。所以这里包一层
 *     `Game.applyElemReaction`，只有它执行期间记的 FXK 调用才归元素反应。
 *   · **旧 FX.* 的归属同理**：damageEnemy 本身只调 FX.text，所以反应期间
 *     出现 flashCircle/ring/burst/beam/area 就一定是没换干净的残留。
 *   · 每个 case 都换一只新怪 —— `e._reactAt` 挂在目标身上，复用同一只会被 2s ICD 挡住。
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

const TOOLS = `
  window.__fx = [];        /* 反应期间的真机 FXK 调用（带 key） */
  window.__old = [];       /* 反应期间的旧 FX.* 视觉调用（应该是空的） */
  window.__in = null;      /* 当前正在结算哪一组反应（applyElemReaction 的窗口） */
  window.__draw = null;    /* 当前正在画哪一组（ElemFX.play / link 的窗口） */

  /* 旧 FX.* 视觉：换掉之后这五个在反应期间一次都不该出现。
   * 例外只有一个 —— FX.spark（每次命中都有的通用火花）内部调 FX.burst，
   * 那是 damageEnemy 的命中反馈，不是反应视觉。所以 spark 执行期间不记账。 */
  window.__spark = 0;
  const origSpark = FX.spark;
  FX.spark = function () {
    window.__spark++;
    try { return origSpark.apply(this, arguments); }
    finally { window.__spark--; }
  };
  ['flashCircle', 'ring', 'burst', 'beam', 'area'].forEach(function (op) {
    const orig = FX[op];
    if (typeof orig !== 'function') return;
    FX[op] = function () {
      if (window.__in && !window.__spark) window.__old.push({ key: window.__in, op: op });
      return orig.apply(this, arguments);
    };
  });

  /* 真机 FXK：记下原语、贴图格、坐标。
   * 归属只看 __draw（ElemFX.play / link 内部），不看 __in ——
   * 蒸汽的爆炸伤会再命中一次，把 ComboFX 的碎裂视觉也画在同一段时间里，
   * 那段不属于元素反应的「形状」。 */
  ['spr', 'decal', 'shock', 'trail', 'bolt'].forEach(function (op) {
    const orig = FXK[op];
    FXK[op] = function (a, b) {
      if (window.__draw) {
        const rec = { key: window.__draw, op: op };
        if (op === 'trail') {
          rec.n = Array.isArray(a) ? a.length : 0;
          rec.pts = (a || []).map(function (v) { return [v.x, v.y, v.z]; });
        } else if (op === 'bolt') {
          rec.pts = [[a && a.x, a && a.y, a && a.z], [b && b.x, b && b.y, b && b.z]];
        } else {
          rec.x = a && a.x; rec.y = a && a.y; rec.z = a && a.z;
          rec.tex = (b && b.tex) || '';
        }
        window.__fx.push(rec);
      }
      return orig.apply(this, arguments);
    };
  });

  /* 归属①：旧 FX.* 视觉 —— 只有 applyElemReaction 执行期间的才算反应残留 */
  const origApply = Game.applyElemReaction.bind(Game);
  Game.applyElemReaction = function (r, e, f) {
    const prev = window.__in;
    window.__in = r && r.key;
    try { return origApply(r, e, f); }
    finally { window.__in = prev; }
  };

  /* 归属②：FXK 调用 —— 只算 ElemFX.play / link 自己画的（含链段） */
  const origPlay = ElemFX.play;
  ElemFX.play = function (key) {
    const prev = window.__draw;
    window.__draw = key;
    try { return origPlay.apply(this, arguments); }
    finally { window.__draw = prev; }
  };
  const origLink = ElemFX.link;
  ElemFX.link = function (a, b, color, key) {
    const prev = window.__draw;
    window.__draw = key;
    try { return origLink.apply(this, arguments); }
    finally { window.__draw = prev; }
  };

  window.__reset = function () {
    ElemFX.reset();
    window.__fx.length = 0;
    window.__old.length = 0;
    window.__in = null;
    window.__draw = null;
    Game.shield = 0; Game.healMist = null;
    Game.time = (Game.time || 0) + 5000;   /* 跨过 0.5s 全局 / 2s 同目标两道 ICD */
  };

  /* n 只木桩：第 1 只是主目标，其余排在 +2 米上（给连锁反应当靶子） */
  window.__foes = function (n, patch) {
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const out = [];
    for (let i = 0; i < (n || 1); i++) {
      const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], pp.x + i * 2, pp.z + 3);
      foe.hp = foe.maxHp = foe.baseHp = 1e9;
      if (patch) Object.assign(foe, patch);
      out.push(foe);
    }
    Game.invuln = 999;
    Game.running = true;
    return out;
  };

  window.__finite = function (recs) {
    for (const r of recs) {
      const nums = r.pts ? r.pts.reduce(function (a, v) { return a.concat(v); }, [])
        : [r.x, r.y, r.z];
      for (const v of nums) if (!Number.isFinite(v)) return false;
    }
    return true;
  };

  /* 一组反应的完整读数 */
  window.__one = function (key, patch, elem, n) {
    window.__reset();
    const foes = window.__foes(n || 1, patch);
    const foe = foes[0];
    /* 血量压到 50%：净化烈焰 / 解毒雾的收益是回血，满血时看不出结算
     * （hpMax 在 state.stats 上，不在 state 上） */
    Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
    const before = {
      hp: foe.hp, x: foe.pos.x, z: foe.pos.z, slowT: foe.slowT || 0,
      dotDmg: foe.dotDmg || 0, shield: Game.shield || 0,
      php: Game.state.hp, chainHp: foes.slice(1).map(function (o) { return o.hp; })
    };
    Game.damageEnemy(foe, 1000, false, { elem: elem });
    const s = ElemFX.stats();
    const mine = window.__fx.filter(function (r) { return r.key === key; });
    return {
      counts: s.counts, draws: s.draws, links: s.links, errors: s.errors.slice(),
      parts: (s.lastDraw[key] || {}).parts || null,
      fx: mine, n: mine.length, finite: window.__finite(mine),
      ops: mine.map(function (r) { return r.op + ':' + (r.tex || ''); }).join(','),
      old: window.__old.filter(function (r) { return r.key === key; }).map(function (r) { return r.op; }),
      before: before,
      after: {
        hp: foe.hp, x: foe.pos.x, z: foe.pos.z, slowT: foe.slowT || 0,
        dotDmg: foe.dotDmg || 0, shred: foe.shred || 0, shredT: foe.shredT || 0,
        shield: Game.shield || 0, mist: !!Game.healMist,
        php: Game.state.hp, chainHp: foes.slice(1).map(function (o) { return o.hp; })
      }
    };
  };
`;

/* 10 组的触发条件（命中元素 + 目标身上要有的状态）
 * 状态字段的口径见 src/data/data-elem.js 的 ELEM_STATUS。 */
const CASES = [
  { key: 'steam', elem: 'fire', patch: { slow: 1, slowT: 3 }, why: '火打冻结目标' },
  { key: 'plasma', elem: 'fire', patch: { stun: 2 }, why: '火打感电目标' },
  { key: 'burnpoison', elem: 'fire', patch: { poisonT: 3, dotT: 3, dotElem: 'poison', dotDmg: 100 }, why: '火打带毒目标' },
  { key: 'frozele', elem: 'ice', patch: { slow: 1, slowT: 4, stun: 2 }, why: '冰打感电目标', foes: 2 },
  { key: 'frostrot', elem: 'ice', patch: { poisonT: 3 }, why: '冰打带毒目标' },
  { key: 'corrochain', elem: 'lightning', patch: { poisonT: 3 }, why: '雷打带毒目标', foes: 3 },
  { key: 'purify', elem: 'fire', patch: { sigilT: 3 }, why: '火打带圣印目标' },
  { key: 'holyfrost', elem: 'ice', patch: { sigilT: 3 }, why: '冰打带圣印目标' },
  { key: 'judgment', elem: 'lightning', patch: { sigilT: 3 }, why: '雷打带圣印目标' },
  { key: 'cleansmist', elem: 'poison', patch: { sigilT: 3 }, why: '毒打带圣印目标' }
];

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

  /* ---------------- 1~2：10 组逐条触发 + 形状互不重样 ---------------- */
  console.log('\n【1】10 组逐条在真机上触发 · FXK 真的被调过 · 坐标全部有限');
  const res = await p.evaluate(list => {
    const out = {};
    for (const c of list) out[c.key] = window.__one(c.key, c.patch, c.elem, c.foes);
    return out;
  }, CASES);

  for (const c of CASES) {
    const r = res[c.key];
    ok(r.counts[c.key] === 1 && r.draws[c.key] === 1,
      c.key + '：' + c.why + ' → 触发并真的画了', { counts: r.counts, draws: r.draws });
  }
  for (const c of CASES) {
    const r = res[c.key];
    ok(r.n >= 2, c.key + '：真机 FXK 至少被调 2 次', r.n);
    ok(r.finite, c.key + '：坐标全部有限（没有 NaN 粒子）');
    ok(r.errors.length === 0, c.key + '：视觉层零内部异常', r.errors);
  }

  console.log('\n【2】10 组的**形状**互不重样（真机原语序列，配色不算形状）');
  {
    const seen = {};
    const dup = [];
    for (const c of CASES) {
      const r = res[c.key];
      if (!r.ops) { dup.push(c.key + ' == (空)'); continue; }
      if (seen[r.ops]) dup.push(c.key + ' == ' + seen[r.ops]);
      seen[r.ops] = c.key;
    }
    ok(dup.length === 0, '10 组的原语序列两两不同', dup);
    ok(new Set(CASES.map(c => res[c.key].ops)).size === 10, '确实是 10 种不同的画法',
      CASES.map(c => c.key + ' → ' + res[c.key].ops));
    /* 形状签名（ElemFX 自己记的配方清单）也要两两不同 */
    const sig = CASES.map(c => (res[c.key].parts || []).join('|'));
    ok(new Set(sig).size === 10, '配方签名（parts）也两两不同',
      CASES.map((c, i) => c.key + ' → ' + sig[i]));
    console.log('  —— 真机画出来的 10 种形状 ——');
    for (const c of CASES) console.log('    ' + c.key.padEnd(11) + res[c.key].ops);
  }

  console.log('\n【3】旧 FX.* 视觉真的换掉了（反应期间零调用）');
  for (const c of CASES) {
    const r = res[c.key];
    ok(r.old.length === 0, c.key + '：反应期间没有 flashCircle/ring/burst/beam/area', r.old);
  }
  ok(res.steam.old.indexOf('flashCircle') < 0 && res.steam.old.indexOf('ring') < 0,
    'steam：通用爆炸环没被叠上来（explodeAt 的 noFx 生效）', res.steam.old);

  console.log('\n【4】链式电弧走 ElemFX.link（bolt + trail，不是 1px 线）');
  ok(res.frozele.links.frozele === 1, '感电冻结：连锁 1 段，每段都走了 link', res.frozele.links);
  ok(res.corrochain.links.corrochain === 2, '腐蚀链：连锁 2 段，每段都走了 link', res.corrochain.links);
  ok(res.frozele.fx.filter(r => r.op === 'trail').length >= 1,
    '链段真的画了拖尾（trail 不是 bolt 串）', res.frozele.fx.map(r => r.op));

  /* ---------------- 5：数值逻辑一行没改 ---------------- */
  console.log('\n【5】数值仍然生效（视觉换了，结算一个字节没动）');
  {
    const moved = (r) => Math.hypot(r.after.x - r.before.x, r.after.z - r.before.z);
    ok(res.steam.after.hp < 1e9, 'steam：汽浪的 35% 爆炸伤害真的结算了',
      { hp: res.steam.after.hp });
    ok(moved(res.steam) > 0.05, 'steam：击退真的把目标推开了', moved(res.steam));
    ok(res.plasma.before.hp - res.plasma.after.hp > 1000,
      'plasma：除了原伤害，还多结算了一发必暴雷伤',
      { lost: res.plasma.before.hp - res.plasma.after.hp });
    ok(res.burnpoison.after.dotDmg === 150,
      'burnpoison：本轮 dot ×1.5 真的乘上了', { before: 100, after: res.burnpoison.after.dotDmg });
    ok(Math.abs(res.frozele.after.slowT - 6) < 0.001,
      'frozele：冻结时长 ×1.5 真的乘上了', { before: 4, after: res.frozele.after.slowT });
    ok(res.frostrot.after.shred === 20 && res.frostrot.after.shredT > 0,
      'frostrot：减防 20% 真的挂上了', res.frostrot.after);
    ok(res.corrochain.after.chainHp.length === 2 && res.corrochain.after.chainHp.every(h => h < 1e9),
      'corrochain：两只连锁目标都真的掉血了', res.corrochain.after.chainHp);
    ok(res.purify.after.php > res.purify.before.php,
      'purify：回复 3% 生命真的结算了', { before: res.purify.before.php, after: res.purify.after.php });
    ok(res.holyfrost.after.shield > 0, 'holyfrost：护盾真的挂上了', res.holyfrost.after.shield);
    ok(res.judgment.after.hp < 1e9, 'judgment：圣雷伤害真的结算了', res.judgment.after.hp);
    ok(res.cleansmist.after.mist === true, 'cleansmist：回血雾计时器真的挂上了');
  }

  /* ---------------- 6：ICD 仍然由反应机制管 ---------------- */
  console.log('\n【6】ICD 仍然由反应机制管（视觉不另设冷却）');
  const icd = await p.evaluate(() => {
    window.__reset();
    const foes = window.__foes(1, { slow: 1, slowT: 3 });
    const foe = foes[0];
    Game.damageEnemy(foe, 1000, false, { elem: 'fire' });
    const a = (ElemFX.stats().counts.steam || 0);
    const fx1 = window.__fx.length;
    /* 同目标、没过 2s → 反应机制自己挡住，视觉也不该重播 */
    Game.damageEnemy(foe, 1000, false, { elem: 'fire' });
    const b = (ElemFX.stats().counts.steam || 0);
    /* 推过 2s → 放行 */
    Game.time = (Game.time || 0) + 2500;
    Game.damageEnemy(foe, 1000, false, { elem: 'fire' });
    const c = (ElemFX.stats().counts.steam || 0);
    return { a, b, c, fx1, fx2: window.__fx.length };
  });
  ok(icd.a === 1, '第一条命中触发一次', icd);
  ok(icd.b === 1, '同目标 2s 内视觉不重播（借的是反应机制的 ICD）', icd);
  ok(icd.c === 2, '过了同目标 2s 可以再播', icd);

  /* ---------------- 7：零 console error ---------------- */
  console.log('\n【7】错误');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
