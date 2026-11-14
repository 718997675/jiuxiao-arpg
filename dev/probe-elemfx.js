#!/usr/bin/env node
/* ============================================================
 * [U4-4] 元素反应真机验收 —— 10 组逐条触发 + 形状互不重样
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-elemfx.js
 *
 * 契约（dev/test-elemfx.js）判的是「配方表对不对」；这一份判的是
 * **接进游戏之后还成不成立**。U1 有过「契约全绿但 NaN 粒子照样算数」的前车之鉴，
 * 所以这里量的是**真机 FXK 的实际调用**，不是读源码。
 *
 * 量八件事：
 *   1  10 组逐条真的触发（counts / draws 都有，且只有该组）
 *   2  真机 FXK 被调过（hook 住 spr/trail/bolt/shock/decal 五个原语）
 *   3  **10 组的形状互不重样**（真机调用序列两两不同，不是只换颜色）
 *   4  坐标全部有限（NaN 的粒子照样「画了」，但屏幕上什么都没有）
 *   5  旧 FX.* 视觉一个都没被调（换掉，不是叠上去）
 *   6  ICD（全局 0.5s / 同目标 2s）+ silent / react 不过滤
 *   7  换图后照样能触发（视觉层没有跨图窗口，和 ComboFX 的聚怪窗口不同）
 *   8  **数值逻辑一行没改** —— 10 组的收益逐条仍然生效
 *
 * 三个坑：
 *   · 触发条件是「目标身上的元素状态」+「这一发的元素」，
 *     状态位分别是：冰 = slowT/slow、雷电 = stun、毒 = poisonT、圣 = sigilT。
 *     只设该组需要的那一个，多设一个会让 elemStatusList 撞出另一组反应。
 *   · 目标的 `stunChance / slowChance / freezeChance / burnChance` 来自装备词缀，
 *     会偷偷给目标挂状态（burnChance 挂 poisonT 会改变判定结果）→ 探针里清零。
 *   · FXK.shock / bolt / trail 内部会自己调 FXK.spr（尘环 / 端点闪光），
 *     所以真机签名里会多出 spr:dust / spr:spark —— 这是真实调用，不是重复绘制。
 *
 * 两处必须隔离，否则量出来的不是「这一组反应长什么样」：
 *   · **ComboFX 停掉**：蒸汽爆炸的伤害是物理的，打在冻结目标上会触发
 *     ComboFX 的「冻结 → 碎裂」——两套视觉混在一起，签名就废了。
 *   · **`FX.spark` 排除**：`FX.spark`（伤害数字火花）内部就是 `this.burst(...)`，
 *     那是每次伤害都有的通用反馈，不是反应视觉。
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

/* 10 组反应各自的触发条件：命中元素 + 目标身上要有的那一个状态位 */
const CASES = [
  { key: 'steam', name: '蒸汽爆裂', elem: 'fire', status: { slowT: 5, slow: 1 }, foes: 1, part: 'decal:frost' },
  { key: 'plasma', name: '等离子', elem: 'fire', status: { stun: 5 }, foes: 1, part: 'bolt:surface×3' },
  { key: 'burnpoison', name: '焚毒', elem: 'fire', status: { poisonT: 5 }, foes: 1, part: 'spr:ember:outer' },
  { key: 'frozele', name: '感电冻结', elem: 'ice', status: { stun: 5 }, foes: 2, part: 'spr:shard:hex-shell' },
  { key: 'frostrot', name: '腐霜', elem: 'ice', status: { poisonT: 5 }, foes: 1, part: 'decal:acid' },
  { key: 'corrochain', name: '腐蚀链', elem: 'lightning', status: { poisonT: 5 }, foes: 3, part: 'bolt:trident×3' },
  { key: 'purify', name: '净化烈焰', elem: 'fire', status: { sigilT: 5 }, foes: 1, part: 'spr:ember:column' },
  { key: 'holyfrost', name: '圣霜', elem: 'ice', status: { sigilT: 5 }, foes: 1, part: 'trail:gold×2' },
  { key: 'judgment', name: '天罚', elem: 'lightning', status: { sigilT: 5 }, foes: 1, part: 'trail:column' },
  { key: 'cleansmist', name: '解毒雾', elem: 'poison', status: { sigilT: 5 }, foes: 1, part: 'spr:smoke:gold' }
];

/* 探针在页面里装的通用工具：起怪、录 FXK 调用、录旧 FX 调用、清账 */
const TOOLS = `
  window.__fx = [];
  window.__old = [];
  ['spr','decal','shock','trail','bolt'].forEach(function (op) {
    const orig = FXK[op];
    FXK[op] = function (a, b) {
      const rec = { op: op };
      if (op === 'trail') {
        rec.n = Array.isArray(a) ? a.length : 0;
        rec.pts = (a || []).map(function (v) { return [v.x, v.y, v.z]; });
      } else if (op === 'bolt') {
        rec.a = a ? [a.x, a.y, a.z] : null;
        rec.b = b ? [b.x, b.y, b.z] : null;
      } else {
        rec.x = a && a.x; rec.y = a && a.y; rec.z = a && a.z;
        rec.tex = (b && b.tex) || '';
      }
      window.__fx.push(rec);
      return orig.apply(this, arguments);
    };
  });
  /* 旧 FX.*：反应期间**一个都不许被调**（换掉，不是叠上去）。
   * 例外：FX.spark（伤害数字火花）内部就是 this.burst(...)
   * —— 那不是反应视觉，是每次伤害都有的通用反馈，所以用 __generic 标记区分开。 */
  window.__generic = 0;
  ['spark','blood'].forEach(function (op) {
    const orig = FX[op];
    if (typeof orig !== 'function') return;
    FX[op] = function () {
      window.__generic++;
      try { return orig.apply(this, arguments); } finally { window.__generic--; }
    };
  });
  ['flashCircle','ring','burst','beam','area'].forEach(function (op) {
    const orig = FX[op];
    if (typeof orig !== 'function') return;
    FX[op] = function () {
      if (!window.__generic) window.__old.push(op);
      return orig.apply(this, arguments);
    };
  });
  /* 组合层（ComboFX）在这一份里**停掉**。
   * 理由：蒸汽爆炸的伤害是**物理**（explodeAt 不带元素），打在冻结目标上
   * 会触发 ComboFX 的「冻结 → 碎裂」，两套视觉混在一起就量不准「这一组长什么样」。
   * 组合层自己有一份探针（dev/probe-combo.js），那份不关它。 */
  window.__comboOff = function () {
    if (window.__comboSave) return;
    window.__comboSave = { hit: ComboFX.onHit, cast: ComboFX.onCast };
    ComboFX.onHit = function () { };
    ComboFX.onCast = function () { };
  };
  window.__comboOn = function () {
    if (!window.__comboSave) return;
    ComboFX.onHit = window.__comboSave.hit;
    ComboFX.onCast = window.__comboSave.cast;
    window.__comboSave = null;
  };
  window.__reset = function () {
    ElemFX.reset();
    window.__fx.length = 0;
    window.__old.length = 0;
    Game.time += 5;            /* 跨过全局 0.5s / 同目标 2s 两道 ICD */
  };
  window.__kit = function (cls) {
    Game.startNew(cls, '毒');
    Game.state.level = 30;
    Game.state.mp = 999999; Game.state.hp = Game.state.hpMax;
    Game.cooldowns = {}; Game.invuln = 999; Game.mobCap = 200;
    try { Game.recalc(); } catch (e) { }
    /* 装备词缀的命中附加会偷偷改目标状态（burnChance 挂 poisonT 会改判定结果）→ 清零 */
    try {
      const st = Game.state.stats;
      st.stunChance = 0; st.slowChance = 0; st.freezeChance = 0; st.burnChance = 0;
      if (st.flags) { st.flags.frost = false; st.flags.thunder = false; st.flags.explode = false; }
    } catch (e) { }
  };
  window.__foes = function (n, patch) {
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const type = Object.keys(MONSTERS)[0];
    const out = [];
    for (let i = 0; i < n; i++) {
      const foe = Game.spawnEnemy(type, pp.x, pp.z + 3 + i * 1.5);
      foe.hp = foe.maxHp = 1e9; foe.baseHp = 1e9;
      foe.boss = false; foe.family = '';
      if (i === 0 && patch) Object.assign(foe, patch);
      out.push(foe);
    }
    Game.aimPoint = new THREE.Vector3(out[0].pos.x, 0, out[0].pos.z);
    Game.aimDir = new THREE.Vector3(0, 0, 1);
    Game.lastMoveDir = { x: 0, z: 1 };
    Game.running = true;
    return out;
  };
  window.__finite = function (recs) {
    for (const r of recs) {
      const nums = [];
      if (r.op === 'trail') {
        for (const pt of (r.pts || [])) nums.push(pt[0], pt[1], pt[2]);
      } else if (r.op === 'bolt') {
        nums.push.apply(nums, (r.a || []).concat(r.b || []));
      } else {
        nums.push(r.x, r.y, r.z);
      }
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

  /* ---------------- 1~5：10 组逐条触发 ---------------- */
  console.log('\n【1】10 组逐条真的触发 + 真机 FXK 被调过 + 坐标有限');
  const res = await p.evaluate((cases) => {
    const out = {};
    window.__comboOff();
    for (const c of cases) {
      window.__kit('mage');
      window.__reset();
      const foes = window.__foes(c.foes, c.status);
      let err = null;
      try {
        Game.damageEnemy(foes[0], 100, false, { elem: c.elem });
      } catch (e) { err = String((e && e.message) || e); }
      const s = ElemFX.stats();
      out[c.key] = {
        err: err,
        counts: s.counts, draws: s.draws, links: s.links,
        last: s.lastDraw[c.key] || null,
        fx: window.__fx.slice(),
        old: window.__old.slice(),
        finite: window.__finite(window.__fx),
        errors: s.errors.slice()
      };
    }
    return out;
  }, CASES);

  const sigs = {};
  for (const c of CASES) {
    const r = res[c.key];
    const keys = Object.keys(r.counts || {});
    ok(!r.err && keys.length === 1 && keys[0] === c.key && r.counts[c.key] === 1,
      c.name + '（' + c.key + '）：只触发了这一组反应', { err: r.err, counts: r.counts });
    ok(r.draws && r.draws[c.key] === 1, c.name + '：视觉真的画了一次', r.draws);
    ok(r.last && r.last.parts.indexOf(c.part) >= 0,
      c.name + '：画的是它自己的那套（含 ' + c.part + '）', (r.last || {}).parts);
    ok(r.fx.length >= 3, c.name + '：真机 FXK 真的被调过（' + r.fx.length + ' 次）', r.fx.length);
    ok(r.finite === true, c.name + '：坐标全部有限', r.fx);
    ok(r.errors.length === 0, c.name + '：视觉层零内部异常', r.errors);
    ok(r.old.length === 0, c.name + '：旧 FX.* 一次都没被调（换掉，不是叠上去）', r.old);
    /* 真机调用序列 = 这一组在屏幕上真实画出来的东西（shape，不含配色） */
    sigs[c.key] = r.fx.map(f => f.op + (f.tex ? ':' + f.tex : '')).join('|');
  }

  console.log('\n【2】10 组的**形状**互不重样（真机调用序列，不是只换颜色）');
  {
    const seen = {};
    const dup = [];
    for (const c of CASES) {
      if (seen[sigs[c.key]]) dup.push(c.key + ' == ' + seen[sigs[c.key]]);
      seen[sigs[c.key]] = c.key;
    }
    ok(dup.length === 0, '10 组的真机原语序列两两不同', dup);
    ok(new Set(Object.values(sigs)).size === 10, '10 组序列去重后还剩 10 个',
      Object.values(sigs));
    for (const c of CASES) {
      console.log('    ·', c.key.padEnd(11), sigs[c.key]);
    }
  }

  console.log('\n【3】链式电弧（感电冻结 / 腐蚀链）');  ok(res.frozele.links && res.frozele.links.frozele === 1,
    '感电冻结：链段记在 frozele 名下', res.frozele.links);
  ok(res.corrochain.links && res.corrochain.links.corrochain === 2,
    '腐蚀链：两段链都记在 corrochain 名下', res.corrochain.links);
  ok(sigs.corrochain.indexOf('trail') >= 0,
    '腐蚀链的链段带拖尾（不是一根 1px 线）', sigs.corrochain);

  console.log('\n【4】ICD · silent / react 不过滤');
  await p.evaluate(() => window.__comboOn());
  const icd = await p.evaluate(() => {
    window.__kit('mage');
    window.__reset();
    const foe = window.__foes(1, { slowT: 5, slow: 1 })[0];
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const a = ElemFX.stats().counts.steam || 0;
    /* 同目标、没过 2s → 必须挡住 */
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const b = ElemFX.stats().counts.steam || 0;
    /* 时钟推过 2s → 放行 */
    Game.time += 3;
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const c = ElemFX.stats().counts.steam || 0;
    /* 换目标：没过全局 0.5s → 挡住 */
    Game.time += 0.1;
    const foe2 = window.__foes(1, { slowT: 5, slow: 1 })[0];
    Game.damageEnemy(foe2, 100, false, { elem: 'fire' });
    const d = ElemFX.stats().counts.steam || 0;
    /* 过了全局 0.5s → 放行 */
    Game.time += 0.6;
    Game.damageEnemy(foe2, 100, false, { elem: 'fire' });
    const e = ElemFX.stats().counts.steam || 0;
    return { a, b, c, d, e };
  });
  ok(icd.a === 1, '第一条命中触发', icd);
  ok(icd.b === 1, '同目标 2s 内不重播', icd);
  ok(icd.c === 2, '过了同目标 2s 可以再播', icd);
  ok(icd.d === 2, '换目标也过不了全局 0.5s', icd);
  ok(icd.e === 3, '过了全局 0.5s 换目标可以播', icd);

  const quiet = await p.evaluate(() => {
    window.__kit('mage');
    window.__reset();
    const foe = window.__foes(1, { slowT: 5, slow: 1 })[0];
    Game.damageEnemy(foe, 100, false, { elem: 'fire', silent: true });
    const s1 = ElemFX.stats().counts.steam || 0;
    Game.time += 3;
    Game.damageEnemy(foe, 100, false, { elem: 'fire', react: true });
    const s2 = ElemFX.stats().counts.steam || 0;
    return { s1, s2 };
  });
  ok(quiet.s1 === 0 && quiet.s2 === 0, 'silent（dot 跳伤）与 react（反应追加）都不触发', quiet);

  console.log('\n【5】换图 · 视觉层没有跨图窗口（和 ComboFX 不一样）');
  /* ElemFX **故意不挂** loadMap 的 reset：它只有计数器，没有「开窗 / 到期」这类
   * 跨帧状态（ICD 借的是反应机制的 `_reactCd` / `e._reactAt`，挂在敌人身上）。
   * ComboFX 才需要在 loadMap 清窗口，否则「上一张图的聚怪窗」会带进村里。
   * 所以这里判的不是「换图清账」，而是「换图后照样能触发」= 没留跨图状态。 */
  const reset = await p.evaluate(() => {
    window.__kit('mage');
    window.__reset();
    const foe = window.__foes(1, { slowT: 5, slow: 1 })[0];
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const before = ElemFX.stats().counts.steam || 0;
    Game.loadMap('village');
    window.__reset();
    const foe2 = window.__foes(1, { slowT: 5, slow: 1 })[0];
    Game.damageEnemy(foe2, 100, false, { elem: 'fire' });
    const after = ElemFX.stats().counts.steam || 0;
    return { before, after };
  });
  ok(reset.before === 1 && reset.after === 1,
    '换图后照样能触发（视觉层没留跨图状态）', reset);

  /* ---------------- 6：数值逻辑一行没改 ---------------- */
  console.log('\n【6】数值逻辑一行没改（视觉换了，结算照旧）');
  const nums = await p.evaluate((cases) => {
    const out = {};
    window.__comboOff();
    for (const c of cases) {
      window.__kit('mage');
      window.__reset();
      Game.shield = 0; Game.healMist = null;
      /* 血量压到 50%：净化的回血要看得见（hpMax 在 state.stats 上） */
      Game.state.hp = Math.round(Game.state.stats.hpMax * 0.5);
      /* 只有这两组需要额外的「已有状态」才看得见收益：
       * 焚毒要求本轮 dot 已经在跳（dotT>0 才乘 dotMul）、
       * 感电冻结要求本来就在减速（slowT>0 才乘 freezeMul）。 */
      let patch = c.status;
      if (c.key === 'burnpoison') patch = Object.assign({}, c.status, { dotT: 5, dotElem: 'poison', dotDmg: 100 });
      if (c.key === 'frozele') patch = Object.assign({}, c.status, { slow: 1, slowT: 4 });
      const foes = window.__foes(c.foes, patch);
      const foe = foes[0];
      const snap = () => ({
        hp: foe.hp, x: foe.pos.x, z: foe.pos.z, slowT: foe.slowT || 0,
        dotDmg: foe.dotDmg || 0, shred: foe.shred || 0, shredT: foe.shredT || 0,
        shield: Game.shield || 0, mist: !!Game.healMist, php: Game.state.hp,
        chainHp: foes.slice(1).map(function (o) { return o.hp; })
      });
      const b = snap();
      Game.damageEnemy(foe, 1000, false, { elem: c.elem });
      out[c.key] = { b: b, a: snap() };
    }
    return out;
  }, CASES);
  {
    const moved = (r) => Math.hypot(r.a.x - r.b.x, r.a.z - r.b.z);
    ok(nums.steam.a.hp < 1e9, 'steam：汽浪的 35% 爆炸伤害真的结算了', nums.steam.a.hp);
    ok(moved(nums.steam) > 0.05, 'steam：击退真的把目标推开了', moved(nums.steam));
    ok(nums.plasma.b.hp - nums.plasma.a.hp > 1000,
      'plasma：除了原伤害，还多结算了一发必暴雷伤',
      { lost: nums.plasma.b.hp - nums.plasma.a.hp });
    ok(nums.burnpoison.a.dotDmg === 150,
      'burnpoison：本轮 dot ×1.5 真的乘上了',
      { before: 100, after: nums.burnpoison.a.dotDmg });
    ok(Math.abs(nums.frozele.a.slowT - 6) < 0.001,
      'frozele：冻结时长 ×1.5 真的乘上了',
      { before: 4, after: nums.frozele.a.slowT });
    ok(nums.frostrot.a.shred === 20 && nums.frostrot.a.shredT > 0,
      'frostrot：减防 20% 真的挂上了', nums.frostrot.a);
    ok(nums.corrochain.a.chainHp.length === 2 && nums.corrochain.a.chainHp.every(h => h < 1e9),
      'corrochain：两只连锁目标都真的掉血了', nums.corrochain.a.chainHp);
    ok(nums.purify.a.php > nums.purify.b.php,
      'purify：回复 3% 生命真的结算了',
      { before: nums.purify.b.php, after: nums.purify.a.php });
    ok(nums.holyfrost.a.shield > 0, 'holyfrost：护盾真的挂上了', nums.holyfrost.a.shield);
    ok(nums.judgment.a.hp < 1e9, 'judgment：圣雷伤害真的结算了', nums.judgment.a.hp);
    ok(nums.cleansmist.a.mist === true, 'cleansmist：回血雾计时器真的挂上了');
  }

  console.log('\n【错误】');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
