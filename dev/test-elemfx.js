#!/usr/bin/env node
/* ============================================================
 * [U4-2] 元素反应视觉层契约（node + vm，不启浏览器）
 *
 *   node dev/test-elemfx.js
 *
 * 判的是「10 组配方各画了什么、画得像不像样、有没有越界」，
 * 真机链路归 dev/probe-elemfx.js。这里是**纯逻辑**尺子：
 * 用 stub 的 THREE / FXK 加载 src/elem-fx.js，逐组喂状态。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'elem-fx.js'), 'utf8');
const calls = [];

class V3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
}
/* 只给这五个方法 —— 配方要是用了别的原语，这里会抛错（被 ElemFX 记进 errors） */
const FXK = {
  enabled: true,
  spr(p, o) { calls.push({ op: 'spr', tex: o && o.tex, n: o && o.n }); },
  trail(pts, o) { calls.push({ op: 'trail', n: pts && pts.length }); },
  bolt(a, b, o) { calls.push({ op: 'bolt' }); },
  shock(p, r, o) { calls.push({ op: 'shock', r: r }); },
  decal(p, o) { calls.push({ op: 'decal', tex: o && o.tex }); }
};
const sandbox = {
  THREE: { Vector3: V3 }, FXK,
  console, Date, Math, JSON, Object, Number, String, Array
};
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__E = ElemFX;', sandbox,
  { filename: 'src/elem-fx.js' });
const E = sandbox.__E;

/* 反应表（真数据源，不是手抄）。
 * 只截 ELEM_REACTIONS 那一段数组 —— 整个文件里元素名（phys/fire/ice…）
 * 也写成 `key: '...'`，不切数组会把它们一起收进来。 */
const elemSrc = fs.readFileSync(path.join(root, 'src', 'data', 'data-elem.js'), 'utf8');
const REACT_KEYS = [];
{
  const start = elemSrc.indexOf('const ELEM_REACTIONS = [');
  const end = elemSrc.indexOf('\n];', start);
  const arr = elemSrc.slice(start, end);
  const re = /key:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(arr))) REACT_KEYS.push(m[1]);
}

console.log('\n【1】接口与配方表');
ok(!!E, 'ElemFX 能在隔离环境里加载（无顶层重名 / 语法错）');
for (const k of ['play', 'link', 'reset', 'stats']) {
  ok(typeof E[k] === 'function', '导出 ' + k);
}
const KEYS = ['steam', 'plasma', 'burnpoison', 'frozele', 'frostrot',
  'corrochain', 'purify', 'holyfrost', 'judgment', 'cleansmist'];
ok(E.recipes && Object.keys(E.recipes).length === 10, '10 套配方齐全', Object.keys(E.recipes || {}));
ok(KEYS.every(k => E.recipes[k]), '10 个 key 一个不缺', KEYS.filter(k => !E.recipes[k]));
ok(REACT_KEYS.length === 10 && KEYS.every(k => REACT_KEYS.indexOf(k) >= 0),
  '配方 key 与 ELEM_REACTIONS 的 key 一一对应', REACT_KEYS);

console.log('\n【2】逐组：画了什么');
const CTX = {
  color: 0xffffff, color2: 0x8888ff, radius: 2.4,
  pos: { x: 3, y: 0.2, z: -2 },
  playerPos: { x: 0, y: 0, z: 0 }
};
const sigs = {};
const usedOps = {};
for (const key of KEYS) {
  E.reset();
  calls.length = 0;
  const okDraw = E.play(key, { pos: { x: 3, z: -2 }, hp: 100 }, CTX);
  const s = E.stats();
  const parts = (s.lastDraw[key] || {}).parts || [];
  sigs[key] = parts.join('|');
  const ops = calls.map(c => c.op + ':' + (c.tex || '')).join(',');
  usedOps[key] = ops;
  ok(okDraw === true && s.counts[key] === 1 && s.draws[key] === 1,
    key + '：触发一次并真的画了', { okDraw, c: s.counts, d: s.draws });
  ok(parts.length > 0, key + '：记录了画了什么', parts);
  ok(s.errors.length === 0, key + '：零内部异常（说明只用了那五个原语）', s.errors);
}

console.log('\n【3】10 组的**形状**互不重样（配色不算形状）');
{
  const seen = {};
  let dup = [];
  for (const k of KEYS) {
    if (seen[sigs[k]]) dup.push(k + ' == ' + seen[sigs[k]]);
    seen[sigs[k]] = k;
  }
  ok(dup.length === 0, '10 组的原语配方签名两两不同', dup);
  ok(new Set(Object.values(usedOps)).size === 10, '10 组实际调用的原语序列两两不同',
    Object.values(usedOps));
}

console.log('\n【4】边界：只画不改数值 / 不设 ICD / 关掉 FXK 不炸');
{
  /* 只读：敌人字段一个都不许动 */
  E.reset(); calls.length = 0;
  const e = { pos: { x: 3, z: -2 }, hp: 100, hpMax: 100, slow: 0, poisonN: 2, dead: false };
  const before = JSON.stringify(e);
  E.play('steam', e, CTX);
  ok(JSON.stringify(e) === before, 'play 不改敌人任何字段（只画）');

  /* 不另设 ICD：连续画两次就是两次 —— 冷却是反应机制的事，不是视觉层的事 */
  E.reset(); calls.length = 0;
  E.play('plasma', e, CTX);
  E.play('plasma', e, CTX);
  ok(E.stats().draws.plasma === 2, '视觉层自己不设冷却（ICD 借反应机制的）', E.stats().draws);

  /* 关掉 FXK：不画、不抛错 */
  E.reset(); calls.length = 0;
  FXK.enabled = false;
  const n = E.play('purify', e, CTX);
  ok(n === false && (E.stats().draws.purify || 0) === 0, 'FXK 关掉时不画、不抛错', E.stats());
  FXK.enabled = true;

  /* 未知 key：记一条错，不炸 */
  E.reset();
  E.play('nosuchreaction', e, CTX);
  ok(E.stats().errors.length === 1, '未知反应 key 记一条错而不是抛出去', E.stats().errors);

  /* reset 清空记账 */
  E.reset();
  ok(Object.keys(E.stats().counts).length === 0 && E.stats().errors.length === 0,
    'reset 清空记账', E.stats());
}

console.log('\n【5】链式电弧 link()');
{
  E.reset(); calls.length = 0;
  const a = new V3(0, 1, 0), b = new V3(4, 1, 0);
  ok(E.link(a, b, 0x9adf60, 'corrochain') === true, 'link 画了一段链');
  ok(calls.length === 2 && calls[0].op === 'bolt' && calls[1].op === 'trail',
    '链段 = 一条折线 + 一条拖尾（两个 mesh，别用一串 bolt）', calls);
  ok(E.stats().links.corrochain === 1, '链段记账', E.stats().links);
}

console.log('\n【6】源码纪律：只用白名单原语 / 不碰 fx-kit');
{
  const used = [];
  const re = /\bK\.([a-zA-Z_]+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) used.push(m[1]);
  const allow = ['spr', 'trail', 'bolt', 'shock', 'decal'];
  const bad = used.filter(u => allow.indexOf(u) < 0);
  ok(bad.length === 0, '只用了 FXK 的五个白名单原语', { used, bad });
  ok(used.length >= 10, '配方确实调用了原语（不是空壳）', used.length);

  const kit = fs.readFileSync(path.join(root, 'src', 'fx-kit.js'), 'utf8');
  ok(!/ElemFX/.test(kit), 'fx-kit.js 一行都没动（不新增原语）');
}

console.log('\n【7】游戏接线（U4-3）');
{
  const game = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');

  /* 挂点恰好一处，且在 applyElemReaction 里、数值 switch 之前 */
  const plays = game.match(/ElemFX\.play\s*\(/g) || [];
  ok(plays.length === 1, 'ElemFX.play 在 game.js 里恰好一处（挂点唯一）', plays.length);
  const fnAt = game.indexOf('applyElemReaction(r, e, final) {');
  const bodyAt = game.indexOf('frontGuardOf(e) {');
  ok(fnAt > 0 && bodyAt > fnAt, '能定位 applyElemReaction 的函数体');
  const body = game.slice(fnAt, bodyAt);
  const pAt = body.indexOf('ElemFX.play');
  const swAt = body.indexOf('switch (r.key)');
  ok(pAt > 0 && swAt > 0 && pAt < swAt, '挂点在数值 switch 之前', { pAt, swAt });

  /* 旧 FX.* 视觉换掉了（只留 FX.text —— 那是信息，不是视觉语言） */
  const usedFx = [];
  const fre = /\bFX\.([a-zA-Z]+)\s*\(/g;
  let m2;
  while ((m2 = fre.exec(body))) usedFx.push(m2[1]);
  const old = usedFx.filter(x => ['flashCircle', 'ring', 'burst', 'beam', 'area'].indexOf(x) >= 0);
  ok(old.length === 0, 'applyElemReaction 里不再有旧 FX.* 视觉（换掉，不是叠上去）', old);
  ok(usedFx.every(x => x === 'text'), '只保留 FX.text（信息浮字）', usedFx);

  /* 链式电弧改走 ElemFX.link，不再是 1px 的 FX.beam */
  const chAt = game.indexOf('chainReaction(from, count');
  ok(chAt > 0, '能定位 chainReaction');
  const chBody = game.slice(chAt, game.indexOf('applyElemReaction(r, e, final) {'));
  ok(/ElemFX\.link\s*\(/.test(chBody), 'chainReaction 改用 ElemFX.link 画链段');
  ok(!/FX\.beam\s*\(/.test(chBody), 'chainReaction 里不再有 FX.beam');

  /* explodeAt：只给「蒸汽」这一处开了 noFx，其他调用点一个字节都没变 */
  ok(/if \(!noFx\) \{/.test(game), 'explodeAt 支持只结算不画通用爆炸');
  const noFxCall = (game.match(/explodeAt\([^)]*, undefined, true\)/g) || []).length;
  ok(noFxCall === 1, 'noFx 只在蒸汽这一处传 true', noFxCall);

  /* 数值逻辑一行没改：关键数值行都还在 */
  const keep = [
    ['e.dotDmg = Math.round((e.dotDmg || 0) * r.dotMul)', '焚毒的 dot 加成'],
    ['e.slowT *= r.freezeMul', '感电冻结的减速延长'],
    ['e.shred = Math.max(e.shred || 0, r.shred)', '腐霜的易伤'],
    ['this.shield = add', '圣霜的护盾'],
    ['this.healMist = { t: r.mist.dur, tick: 0, dps: r.mist.dps, r: r.mist.r }', '解毒雾的计时器'],
    ['final * r.dmg / 100 * (st.critDmg || 150) / 100', '等离子的必定暴击'],
    ['final * kp', '净化的亡灵加伤'],
    ['final * r.dmg / 100 * kb', '天罚的 Boss 加伤'],
    ['this.knockEnemy(e, r.knock)', '蒸汽的击退'],
    ['this.healPlayer(this.state.stats.hpMax * r.heal / 100)', '净化的回血']
  ];
  for (const [frag, why] of keep) {
    ok(body.indexOf(frag) >= 0, '数值逻辑保留：' + why, frag);
  }
}

console.log('\n【8】index.html 加载顺序');
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const at = s => html.indexOf('src="' + s + '"');
  ok(at('src/elem-fx.js') > 0, '已引入 src/elem-fx.js');
  ok(at('src/fx-kit.js') > 0 && at('src/elem-fx.js') > at('src/fx-kit.js') &&
    at('src/elem-fx.js') < at('src/game.js'),
    '顺序：FXK → ElemFX → Game', [at('src/fx-kit.js'), at('src/elem-fx.js'), at('src/game.js')]);
  ok(!/src\/elem-fx\.js[^>]*>\s*<\/script>\s*<script src="src\/elem-fx\.js"/.test(html),
    '没有重复引入');
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
process.exit(fail ? 1 : 0);
