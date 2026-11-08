#!/usr/bin/env node
/* ============================================================
 * [U3-2] 组合特效层契约（node + vm，不启浏览器）
 *
 *   node dev/test-combo.js
 *
 * 判的是「7 条规则的判据对不对、画了什么、ICD 有没有生效」，
 * 真机链路归 dev/probe-combo.js。这里是**纯逻辑**尺子：
 * 用 stub 的 THREE / FXK / VFX 加载 src/combo-fx.js，逐条喂状态。
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
const src = fs.readFileSync(path.join(root, 'src', 'combo-fx.js'), 'utf8');
const calls = [];
const laterMs = [];

class V3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
}
const FXK = {
  enabled: true,
  spr(p, o) { calls.push({ op: 'spr', tex: o && o.tex, n: o && o.n }); },
  decal(p, o) { calls.push({ op: 'decal', tex: o && o.tex }); },
  shock(p, r) { calls.push({ op: 'shock', r }); },
  trail(pts, o) { calls.push({ op: 'trail', n: pts && pts.length, width: o && o.width }); }
};
const VFX = { _later(fn, ms) { laterMs.push(ms); fn(); } };
const sandbox = {
  THREE: { Vector3: V3 }, FXK, VFX,
  console, Date, Math, JSON, WeakMap, Object, Number, String, Array
};
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__C = ComboFX;', sandbox,
  { filename: 'src/combo-fx.js' });
const C = sandbox.__C;

console.log('\n【1】接口与规则表');
ok(!!C, 'ComboFX 能在隔离环境里加载（无顶层重名 / 语法错）');
for (const k of ['onCast', 'onHit', 'reset', 'stats', 'setClock', 'clearStats', 'fire']) {
  ok(typeof C[k] === 'function', '导出 ' + k);
}
const KEYS = ['freeze', 'burn', 'exec', 'gather', 'poisonpin', 'giant', 'palm'];
ok(C.stats().rules.length === 7 && KEYS.every(k => C.rules[k]), '7 条规则齐全', C.stats().rules);
ok(KEYS.slice(0, 5).every(k => C.rules[k].lane === 'hit') &&
  KEYS.slice(5).every(k => C.rules[k].lane === 'cast'), '5 条挂命中口 / 2 条挂施法口');
ok(C.ICD.global === 500 && C.ICD.target === 2000, 'ICD = 0.5s 全局 / 2s 同目标', C.ICD);

console.log('\n【2】判据逐条：正例成立、缺一个条件就不成立');
let t = 10000;
C.setClock(() => t);
const foe = (o) => Object.assign({ pos: { x: 3, z: 4 }, hp: 100, hpMax: 100,
  slow: 0, slowT: 0, shred: 0, shredT: 0, poisonT: 0, poisonN: 0, venomT: 0 }, o || {});

ok(C.rules.freeze.test(foe({ slow: 1, slowT: 2 }), { elem: 'phys' }), 'freeze：冻结目标吃物理伤');
ok(!C.rules.freeze.test(foe({ slow: 0.35, slowT: 2 }), { elem: 'phys' }), 'freeze：只是减速不算');
ok(!C.rules.freeze.test(foe({ slow: 1, slowT: 2 }), { elem: 'fire' }), 'freeze：火伤不算');
ok(C.rules.burn.test(foe({ poisonN: 2 }), { elem: 'fire' }), 'burn：带毒目标吃火伤');
ok(C.rules.burn.test(foe({ dotElem: 'poison' }), { elem: 'fire' }), 'burn：毒 dot 也算带毒');
ok(!C.rules.burn.test(foe(), { elem: 'fire' }), 'burn：没毒不算');
ok(!C.rules.burn.test(foe({ poisonN: 2 }), { elem: 'phys' }), 'burn：物理伤不算');
ok(C.rules.exec.test(foe({ shred: 30, shredT: 3, hp: 20 }), {}), 'exec：破甲 + 残血');
ok(!C.rules.exec.test(foe({ shred: 30, shredT: 3, hp: 80 }), {}), 'exec：血还多不算');
ok(!C.rules.exec.test(foe({ shred: 0, shredT: 0, hp: 20 }), {}), 'exec：没破甲不算');
ok(C.rules.poisonpin.test(foe({ poisonN: 3 }), { elem: 'sigil' }), 'poisonpin：符命中带毒目标');
ok(!C.rules.poisonpin.test(foe({ poisonN: 3 }), { elem: 'phys' }), 'poisonpin：普攻不算');
ok(C.rules.giant.test({ edgeFull: true }), 'giant：castSkill 传来的满层标记');
ok(!C.rules.giant.test({ edgeFull: false }), 'giant：没满层不算');
ok(C.rules.palm.test({ cls: 'mage', slot: 2, auraOn: true }), 'palm：法相窗内法师 ②');
ok(!C.rules.palm.test({ cls: 'mage', slot: 5, auraOn: true }), 'palm：⑤ 开窗那一下自己不飞');
ok(!C.rules.palm.test({ cls: 'mage', slot: 2, auraOn: false }), 'palm：窗关了不飞');
ok(!C.rules.palm.test({ cls: 'warrior', slot: 2, auraOn: true }), 'palm：别职业不飞');

console.log('\n【3】命中口：4 条即时组合逐条真的画了（gather 在【5】单独验窗口）');
const hitCases = [
  ['freeze', foe({ slow: 1, slowT: 2 }), { elem: 'phys', id: 'thrust' }, 'spr:shard'],
  ['burn', foe({ poisonN: 1 }), { elem: 'fire', id: 'fireball' }, 'spr:ember×2'],
  ['exec', foe({ shred: 30, shredT: 3, hp: 10 }), { elem: 'phys', id: 'execute' }, 'decal:crack'],
  ['poisonpin', foe({ poisonN: 3 }), { elem: 'sigil', id: 'talisman' }, 'spr:rune×3']
];
for (const [key, e, ctx, want] of hitCases) {
  C.clearStats(); t += 5000; calls.length = 0;
  const n = C.onHit(e, ctx);
  const s = C.stats();
  ok(n === 1 && s.counts[key] === 1 && s.draws[key] === 1,
    key + ' 触发一次并真的画了', { n, s: s.counts, d: s.draws });
  ok((s.lastDraw[key] || {}).parts && s.lastDraw[key].parts.indexOf(want) >= 0,
    key + ' 画了 ' + want, s.lastDraw[key]);
}
/* 数值只读：组合层不许改敌人字段 */
{
  C.clearStats(); t += 5000;
  const e = foe({ slow: 1, slowT: 2, poisonN: 4, hp: 20, hpMax: 100 });
  const before = JSON.stringify(e);
  C.onHit(e, { elem: 'phys', id: 'thrust' });
  ok(JSON.stringify(e) === before, 'onHit 不改敌人任何字段（只画）');
}

console.log('\n【4】silent / react / ICD / 换目标');
{
  C.clearStats(); t += 5000;
  const e = foe({ slow: 1, slowT: 2 });
  ok(C.onHit(e, { elem: 'phys', silent: true }) === 0, 'dot 跳伤（silent）不触发');
  ok(C.onHit(e, { elem: 'phys', react: true }) === 0, '反应追加伤害（react）不触发');
  ok(C.onHit(e, { elem: 'phys' }) === 1, '有感命中触发');
  ok(C.onHit(e, { elem: 'phys' }) === 0, '同一目标立刻再打：同目标 ICD 挡住');
  t += 600;
  const e2 = foe({ slow: 1, slowT: 2, pos: { x: 9, z: 9 } });
  ok(C.onHit(e2, { elem: 'phys' }) === 1, '换目标 + 过了全局 ICD 可再触发');
  ok(C.onHit(e, { elem: 'phys' }) === 0, '原目标 2s 内仍不重播');
  t += 2100;
  ok(C.onHit(e, { elem: 'phys' }) === 1, '原目标过了 2s 可重播');
  C.clearStats(); t += 5000;
  ok(C.onHit(foe({ slow: 1, slowT: 2 }), { elem: 'phys' }) === 1 && C.stats().counts.freeze === 1,
    'clearStats 清空记账后重新可测');
}

console.log('\n【5】聚怪窗口 / 施法口两条连携 / 二段演出');
{
  C.clearStats(); t += 5000; laterMs.length = 0;
  const pos = { x: 2, z: 3 }, aim = { x: 8, z: 9 }, dir = { x: 0, z: 1 };
  ok(C.onCast('poison', { cls: 'taoist', slot: 2, gather: true,
    pos, aim, dir, auraOn: false, edgeFull: false }) === 0, '开窗那一下不画组合');
  ok(C.stats().gather.id === 'poison' && C.stats().gather.until > t, '聚怪窗口记下了技能 id');
  ok(C.onHit(foe(), { elem: 'phys', id: 'poison' }) === 0, '同一发技能自己不触发');
  ok(C.onHit(foe(), { elem: 'fire', id: 'firewall' }) === 1, '2s 内另一发命中触发塌陷');
  ok(C.stats().gather.until < t, '塌陷放完窗口立刻收掉（一次性）');
  ok(C.onHit(foe(), { elem: 'fire', id: 'firewall' }) === 0, '窗口收了不再触发');

  C.clearStats(); t += 5000; laterMs.length = 0;
  ok(C.onCast('avatar', { cls: 'warrior', slot: 5, edgeFull: true, pos, aim, dir }) === 1,
    '刃势满层 ⑤ → 巨刀虚影');
  ok((C.stats().lastDraw.giant || {}).parts.indexOf('trail:vertical-blade') >= 0,
    '巨刀画的是立起来的竖直带', C.stats().lastDraw.giant);
  C.clearStats(); t += 5000;
  ok(C.onCast('fireball', { cls: 'mage', slot: 1, auraOn: true, pos, aim, dir,
    color: 0xff8844 }) === 1, '法相窗内法师 ① → 手掌光点');
  ok((C.stats().lastDraw.palm || {}).parts.indexOf('trail:palm-arc') >= 0,
    '手掌光点从背后走抛物线', C.stats().lastDraw.palm);
  ok(laterMs.indexOf(380) >= 0 || laterMs.indexOf(240) >= 0 || laterMs.length > 0,
    '二段演出走 VFX._later（不是裸 setTimeout）', laterMs);
  ok(Object.keys(C.stats().laters).length > 0, '二段演出真的执行了', C.stats().laters);
}

console.log('\n【6】降级 / 换图 / 零报错');
{
  C.clearStats(); t += 5000;
  FXK.enabled = false;
  const n = C.onHit(foe({ slow: 1, slowT: 2 }), { elem: 'phys' });
  ok(n === 0 && (C.stats().draws.freeze || 0) === 0, 'FXK 关掉时不画、不抛错', C.stats());
  FXK.enabled = true;

  C.clearStats(); t += 5000;
  C.onCast('poison', { cls: 'taoist', gather: true, pos: { x: 0, z: 0 } });
  C.reset();
  ok(C.stats().gather.until < t && C.stats().gather.id === '', 'reset 清掉聚怪窗口');
  ok(C.stats().errors.length === 0, '全程零内部异常', C.stats().errors);
}

console.log('\n【7】index.html 加载顺序');
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const at = s => html.indexOf('src="' + s + '"');
  ok(at('src/combo-fx.js') > 0, '已引入 src/combo-fx.js');
  ok(at('src/fx-kit.js') > 0 && at('src/vfx.js') > at('src/fx-kit.js') &&
    at('src/combo-fx.js') > at('src/vfx.js') && at('src/combo-fx.js') < at('src/game.js'),
    '顺序：FXK → VFX → ComboFX → Game', [at('src/fx-kit.js'), at('src/vfx.js'),
      at('src/combo-fx.js'), at('src/game.js')]);
  ok(!/src\/combo-fx\.js[^>]*>\s*<\/script>\s*<script src="src\/combo-fx\.js"/.test(html),
    '没有重复引入');
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
process.exit(fail ? 1 : 0);
