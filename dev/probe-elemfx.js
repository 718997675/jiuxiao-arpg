#!/usr/bin/env node
/* ============================================================
 * [U4-4] 元素反应专属视觉 · 真机验收
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-elemfx.js
 *
 * 契约（dev/test-elemfx.js）判的是「配方表对不对、接线对不对」；这一份判的是
 * **接进游戏之后 10 组是不是真的各画各的**。U1 有过「契约全绿但 NaN 粒子
 * 照样算数」的前车之鉴，所以这里量的是真机 FXK 的实际调用与全部数值参数。
 *
 * 量六件事：
 *   1  10 组反应逐条**从真实伤害管线**触发（damageEnemy → tryElemReaction
 *      → applyElemReaction），并确认游戏算出来的 key 就是预期的那一组
 *   2  每组都真的调过 FXK，且**全部数值入参有限**（NaN 粒子照样「画了」）
 *   3  10 组形状互不重样 —— 同时用视觉层的 parts 签名与真机 FXK 调用序列
 *      两把尺子量（不只比颜色）
 *   4  几组关键形状逐条对上：蒸汽内向烟 / 天罚竖直光柱 / 圣霜朝玩家收 /
 *      解毒雾画在玩家脚下 / 腐霜是唯一没有冲击波的一组 / 链式电弧走 link
 *   5  ICD 借的是反应机制的：同目标 2s 内不重画、推过时间放行；
 *      silent / react 命中完全不画；视觉层不改敌人任何字段
 *   6  全程无 console.error / pageerror
 *
 * 三个坑（都踩过）：
 *   · 触发口径是「目标身上原有 A 元素状态」+「这一发带 B 元素」，见
 *     data-elem.js 的 ELEM_STATUS / elemReactionOn。圣系 4 组要 e.sigilT>0，
 *     且目标身上不能有别的元素状态 —— elemStatusList 按 火→冰→雷→毒→圣
 *     的顺序取第一个能反应的，多挂一个状态就会撞到别的组。
 *   · **FXK 不是只有演出层在调**：`FX.spark` / `FX.ring` 等通用命中特效也走
 *     FXK.spr，会把「一条 bolt + 一条 trail」中间插进几个 spr:spark。
 *     所以给 ElemFX.play / link 套一层调用窗口，只录窗口内的 FXK 调用；
 *     另外单开一份全量记录用来验「所有 FXK 数值入参都有限」。
 *     ComboFX.onHit 同理，量这一层时先关掉。
 *   · chainReaction 要**场上有第二只怪**才会画链段；只放一只木桩时
 *     ElemFX.link 一次都不会被调用，会误判「链式电弧没做」。
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

/* 探针在页面里装的工具：起怪、录 FXK 调用、清账、关掉另一层演出 */
const TOOLS = `
  window.__fx = [];       /* 只录 ElemFX 调用窗口内的 FXK 调用（用来比形状） */
  window.__all = [];      /* 全量 FXK 调用（用来验所有数值入参都有限） */
  window.__keys = [];
  window.__inElem = 0;
  window.__fxkDepth = 0;
  /* 把一次 FXK 调用里所有数值入参抓出来 —— 坐标、尺寸、生命周期、颜色都算。
   * NaN 粒子照样「画了」，只数调用次数是抓不到的（U1 的教训）。 */
  window.__nums = function (v, d) {
    d = d || 0;
    if (d > 5) return [];
    if (typeof v === 'number') return [v];
    if (Array.isArray(v)) {
      let o = []; for (const x of v) o = o.concat(window.__nums(x, d + 1)); return o;
    }
    if (v && typeof v === 'object') {
      let o = []; for (const k in v) o = o.concat(window.__nums(v[k], d + 1)); return o;
    }
    return [];
  };
  ['spr','decal','shock','trail','bolt'].forEach(function (op) {
    const orig = FXK[op];
    FXK[op] = function () {
      /* bolt 会调 spr 撒端点火花、shock 会调 spr 扬尘 —— 只有**顶层**调用
       * 才代表视觉层的配方，内部组合的不算「画了什么」 */
      const top = window.__fxkDepth === 0;
      window.__fxkDepth++;
      try {
        const a = arguments[0], b = arguments[1];
        const rec = { op: op, nums: window.__nums(Array.prototype.slice.call(arguments)) };
        if (op === 'trail') {
          rec.n = Array.isArray(a) ? a.length : 0;
          rec.tex = '';
        } else if (op === 'bolt') {
          rec.pts = [a, b].map(v => [v && v.x, v && v.y, v && v.z]);
          rec.tex = '';
        } else if (op === 'shock') {
          rec.x = a && a.x; rec.y = a && a.y; rec.z = a && a.z;
          rec.tex = '';
        } else {
          rec.x = a && a.x; rec.y = a && a.y; rec.z = a && a.z;
          rec.tex = (b && b.tex) || '';
        }
        window.__all.push(rec);
        if (top && window.__inElem) window.__fx.push(rec);
        return orig.apply(this, arguments);
      } finally { window.__fxkDepth--; }
    };
  });
  window.__finite = function (recs) {
    for (const r of recs) for (const n of r.nums) if (!Number.isFinite(n)) return false;
    return true;
  };

  /* 归属窗口：ElemFX.play / link 期间才把 FXK 调用记进 __fx */
  [['play', 'play'], ['link', 'link']].forEach(function (pair) {
    const name = pair[0], orig = ElemFX[name];
    ElemFX[name] = function () {
      window.__inElem++;
      try { return orig.apply(this, arguments); }
      finally { window.__inElem--; }
    };
  });

  /* 记录游戏**真正算出来**的反应 key，不靠自己猜 */
  const origApply = Game.applyElemReaction.bind(Game);
  Game.applyElemReaction = function (r, e, f) {
    window.__keys.push(r.key);
    return origApply(r, e, f);
  };

  /* 只量 ElemFX：ComboFX 也调 FXK，混进来形状就比不干净了 */
  ComboFX.onHit = function () {};

  window.__reset = function () {
    ElemFX.reset();
    ComboFX.clearStats();
    window.__fx.length = 0;
    window.__all.length = 0;
    window.__keys.length = 0;
    window.__inElem = 0;
    window.__fxkDepth = 0;
    Game._reactCd = {};
    Game._reacting = false;
    Game._elem = null; Game._proj = null;
    Game.elemAura = null; Game._castSkill = ''; Game._tag = '';
  };

  window.__kit = function () {
    Game.startNew('mage', '毒');
    Game.state.level = 30;
    Game.state.mp = 999999; Game.state.hp = Game.state.hpMax;
    Game.cooldowns = {}; Game.invuln = 999; Game.mobCap = 200;
    Game.state.skills = {};
    try { Game.recalc(); } catch (e) { }
    /* 把命中附加（眩晕/减速/冻结/点燃/雷殛）全清零：它们是概率触发的，
     * 会在反应判定前往目标身上挂状态，把 elemStatusList 的顺序搅乱。 */
    const st = Game.state.stats;
    st.flags = {}; st.specials = {};
    st.stunChance = 0; st.slowChance = 0; st.freezeChance = 0; st.burnChance = 0;
    st.lifesteal = 0; st.mpOnHit = 0; st.hpOnHit = 0;
  };

  window.__foe = function (patch, extra) {
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game.enemies.length = 0;
    const pp = Game.playerGroup.position;
    const kind = Object.keys(MONSTERS)[0];
    const foe = Game.spawnEnemy(kind, pp.x, pp.z + 3);
    foe.hp = foe.maxHp = 1e9; foe.baseHp = 1e9;
    if (patch) Object.assign(foe, patch);
    foe._reactAt = {};
    /* 链式反应要有第二个目标才会画 link */
    for (let i = 0; i < (extra || 0); i++) {
      const o = Game.spawnEnemy(kind, pp.x + 1.5 + i * 1.5, pp.z + 4);
      o.hp = o.maxHp = 1e9; o.baseHp = 1e9; o._reactAt = {};
    }
    Game.aimPoint = new THREE.Vector3(foe.pos.x, 0, foe.pos.z);
    Game.aimDir = new THREE.Vector3(0, 0, 1);
    Game.lastMoveDir = { x: 0, z: 1 };
    Game.running = true;
    return foe;
  };
`;

/* 目标状态位 + 命中元素 → 预期的反应 key。extra = 额外的怪（给链式反应） */
const SPECS = [
  ['steam',      { slow: 0.5, slowT: 3 }, 'fire',     0],
  ['plasma',     { stun: 1 },             'fire',     0],
  ['burnpoison', { poisonT: 3 },          'fire',     0],
  ['frozele',    { stun: 1 },             'ice',      2],
  ['frostrot',   { poisonT: 3 },          'ice',      0],
  ['corrochain', { poisonT: 3 },          'lightning', 2],
  ['purify',     { sigilT: 6 },           'fire',     0],
  ['holyfrost',  { sigilT: 6 },           'ice',      0],
  ['judgment',   { sigilT: 6 },           'lightning', 0],
  ['cleansmist', { sigilT: 6 },           'poison',   0]
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
  await p.evaluate(() => window.__kit());

  /* ---------------- 1：10 组逐条从真实伤害管线触发 ---------------- */
  console.log('\n【1】10 组反应逐条触发（真机 damageEnemy → applyElemReaction）');
  const runs = await p.evaluate(specs => {
    const out = {};
    for (const [key, patch, elem, extra] of specs) {
      window.__reset();
      const foe = window.__foe(patch, extra);
      const foeX = Math.round(foe.pos.x * 100) / 100, foeZ = Math.round(foe.pos.z * 100) / 100;
      const pg = Game.playerGroup.position;
      Game.damageEnemy(foe, 100, false, { elem: elem });
      const s = ElemFX.stats();
      out[key] = {
        keys: window.__keys.slice(),
        counts: s.counts, draws: s.draws, links: s.links,
        last: s.lastDraw[key] || null,
        errors: s.errors.slice(),
        fx: window.__fx.slice(),
        finite: window.__finite(window.__fx),
        allFinite: window.__finite(window.__all),
        seq: window.__fx.map(r => r.op + ':' + (r.tex || '')).join(','),
        foeX, foeZ, playerX: Math.round(pg.x * 100) / 100, playerZ: Math.round(pg.z * 100) / 100
      };
    }
    return out;
  }, SPECS);

  for (const [key] of SPECS) {
    const r = runs[key];
    ok(r.keys.length === 1 && r.keys[0] === key,
      key + '：游戏算出来的反应 key 就是 ' + key, r.keys);
    ok((r.counts[key] || 0) === 1 && (r.draws[key] || 0) === 1,
      key + '：ElemFX.play 触发一次并真的画了', { counts: r.counts, draws: r.draws });
    ok(r.last && r.last.parts.length > 0,
      key + '：记录了这一套画了什么', r.last && r.last.parts);
    ok(r.errors.length === 0, key + '：视觉层零内部异常', r.errors);
    ok(r.fx.length >= 2 && r.finite && r.allFinite,
      key + '：真机 FXK 真的被调过、全部数值入参有限',
      { n: r.fx.length, finite: r.finite, allFinite: r.allFinite });
  }

  /* ---------------- 2：10 组形状互不重样（两把尺子） ---------------- */
  console.log('\n【2】10 组形状互不重样（不是只换颜色）');
  {
    const partSigs = {}, seqSigs = {};
    const dupParts = [], dupSeqs = [];
    for (const [key] of SPECS) {
      const ps = (runs[key].last || {}).parts.join('|');
      if (partSigs[ps]) dupParts.push(key + ' == ' + partSigs[ps]);
      partSigs[ps] = key;
      const qs = runs[key].seq;
      if (seqSigs[qs]) dupSeqs.push(key + ' == ' + seqSigs[qs]);
      seqSigs[qs] = key;
    }
    ok(dupParts.length === 0, '视觉层 parts 签名两两不同', dupParts);
    ok(dupSeqs.length === 0, '真机 FXK 调用序列两两不同', dupSeqs);
    ok(Object.keys(seqSigs).length === 10, '10 组都有各自的真机形状',
      Object.keys(seqSigs).length);
  }

  /* ---------------- 3：关键形状逐条对上 ---------------- */
  console.log('\n【3】关键形状逐条对上（配方签名不是空话）');
  {
    const parts = k => ((runs[k].last || {}).parts || []).join(',');
    const seq = k => runs[k].seq;
    ok(parts('steam').indexOf('spr:smoke:inward') >= 0 && parts('steam').indexOf('decal:frost') >= 0,
      '蒸汽：向内翻卷的烟 + 霜面贴花', parts('steam'));
    ok(parts('judgment').indexOf('trail:column') >= 0 && parts('judgment').indexOf('bolt') >= 0,
      '天罚：竖直光柱 + 一道雷（唯一从天上下来的一组）', parts('judgment'));
    ok(parts('holyfrost').indexOf('trail:gold') >= 0 && parts('holyfrost').indexOf('spr:star:player') >= 0,
      '圣霜：金光朝玩家收 + 玩家身上落星', parts('holyfrost'));
    const mistDecal = runs.cleansmist.fx.find(r => r.op === 'decal' && r.tex === 'acid');
    ok(parts('cleansmist').indexOf('decal:acid:5s') >= 0 && !!mistDecal &&
      Math.round(mistDecal.x * 100) / 100 === runs.cleansmist.playerX &&
      Math.round(mistDecal.z * 100) / 100 === runs.cleansmist.playerZ,
      '解毒雾：5 秒酸渍贴花画在玩家脚下（雾跟人走，不钉在怪脚下）',
      { decal: mistDecal, player: [runs.cleansmist.playerX, runs.cleansmist.playerZ],
        foe: [runs.cleansmist.foeX, runs.cleansmist.foeZ] });
    const steamShock = runs.steam.fx.find(r => r.op === 'shock');
    ok(parts('steam').indexOf('shock') >= 0 && !!steamShock &&
      Math.round(steamShock.x * 100) / 100 === runs.steam.foeX &&
      Math.round(steamShock.z * 100) / 100 === runs.steam.foeZ,
      '蒸汽：冲击波画在目标脚下（与解毒雾相反）',
      { shock: steamShock, foe: [runs.steam.foeX, runs.steam.foeZ] });
    ok((parts('frostrot').match(/decal:/g) || []).length === 2 &&
      parts('frostrot').indexOf('shock') < 0,
      '腐霜：两张贴花叠层（白霜底 + 绿斑），没有冲击波 —— 语言是「慢慢腐蚀」不是「炸开」',
      parts('frostrot'));
    const withShock = SPECS.filter(([k]) => seq(k).indexOf('shock:') >= 0).map(([k]) => k);
    ok(withShock.length === 5 && withShock.indexOf('steam') >= 0 &&
      withShock.indexOf('plasma') >= 0 && withShock.indexOf('judgment') >= 0,
      '10 组里恰好 5 组带冲击波（不是全员一个环）', withShock);
    ok(parts('corrochain').indexOf('bolt:trident') >= 0,
      '腐蚀链：起点三叉绿弧', parts('corrochain'));
    ok((runs.frozele.links.frozele || 0) >= 1 && (runs.corrochain.links.corrochain || 0) >= 1,
      '链式电弧真的画了链段（ElemFX.link 被调过）',
      { frozele: runs.frozele.links, corrochain: runs.corrochain.links });
    ok(/bolt:,trail:/.test(seq('frozele')),
      '链段 = 一条折线 + 一条拖尾（不是 1px 的 FX.beam）', seq('frozele'));
  }

  /* ---------------- 4：ICD 借反应机制的 / silent·react / 只画不改 ---------------- */
  console.log('\n【4】ICD 复用 + silent/react 不过滤 + 视觉层不改数值');
  const icd = await p.evaluate(() => {
    window.__reset();
    const foe = window.__foe({ slow: 0.5, slowT: 3 });
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const a = ElemFX.stats().counts.steam || 0;
    /* 同目标、没过 2s → 反应机制自己挡住，视觉不该重画 */
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const c = ElemFX.stats().counts.steam || 0;
    /* 推过 2s → 放行 */
    Game.time = (Game.time || 0) + 3;
    Game.damageEnemy(foe, 100, false, { elem: 'fire' });
    const d = ElemFX.stats().counts.steam || 0;
    return { a, c, d, keys: window.__keys.slice() };
  });
  ok(icd.a === 1, '第一条命中触发蒸汽爆裂', icd);
  ok(icd.c === 1, '同目标 2s 内不重画（视觉层没另设一套冷却）', icd);
  ok(icd.d === 2 && icd.keys.length === 2, '推过 ICD 后放行，且 game 真的结算了两次', icd);

  const quiet = await p.evaluate(() => {
    window.__reset();
    const foe = window.__foe({ slow: 0.5, slowT: 3 });
    Game.damageEnemy(foe, 100, false, { elem: 'fire', silent: true });
    const s1 = ElemFX.stats().counts.steam || 0;
    Game.damageEnemy(foe, 100, false, { elem: 'fire', react: true });
    const s2 = ElemFX.stats().counts.steam || 0;
    return { s1, s2, n: window.__fx.length };
  });
  ok(quiet.s1 === 0 && quiet.s2 === 0 && quiet.n === 0,
    'silent（dot 跳伤）与 react（反应追加）完全不画', quiet);

  const readonly = await p.evaluate(() => {
    window.__reset();
    const foe = window.__foe({ slow: 0.5, slowT: 3, poisonT: 2 });
    const before = JSON.stringify(foe, (k, v) => (k === 'actor' || k === 'pos' || typeof v === 'function') ? undefined : v);
    ElemFX.play('steam', foe, {
      pos: foe.pos, color: 0xe8f6ff, color2: 0xbfe6ff,
      radius: 2.6, playerPos: Game.playerGroup.position
    });
    const after = JSON.stringify(foe, (k, v) => (k === 'actor' || k === 'pos' || typeof v === 'function') ? undefined : v);
    return { same: before === after };
  });
  ok(readonly.same, '真机上 ElemFX.play 不改敌人任何字段（只画不结算）', readonly);

  console.log('\n【5】错误');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
