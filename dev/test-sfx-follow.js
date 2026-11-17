#!/usr/bin/env node
/* ============================================================
 * [U13] sfx-follow · 静态契约（node + vm，不启浏览器）
 *
 *   node dev/test-sfx-follow.js
 *
 * U13 修的是「移动释放的技能，演出留在起手点」：旋风斩一边走一边转，
 * 斧头却钉在原地。修法是在 SKFX 里开「随人窗口」，把这一发摆出的 mesh
 * 每帧按玩家位移做增量平移。本契约判「该跟的跟 / 不该跟的不跟 / 窗口不漏」，
 * 真机是否真的跟着走由 probe-sfx-follow.js 判 —— 两者不互相代替。
 *
 * 覆盖：
 *   1 FOLLOW 表 12 键全是游戏技能 id（不是实验室口语名）
 *   2 三分类语义：自身光环跟 / 地面部署不跟 / 飞行体不跟
 *   3 随时长取值合理（宁可长一点，但不能离谱）
 *   4 随人窗口四处接线：ROOT.add 记账 / sync 平移 / play 开窗 / clear 关窗
 *   5 生成物 src/sfx.js 与生成器 build-skillvfx.js 一致
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); return; }
  fail++; console.log('  ✗ ' + m + (d !== undefined ? '  → ' + JSON.stringify(d) : ''));
};

const gen = read('dev/build-skillvfx.js');
const out = read('src/sfx.js');

/* 抽 FOLLOW 表（生成器与生成物各一份，内容应相同） */
function followTable(src) {
  const i = src.indexOf('const FOLLOW = {');
  if (i < 0) return null;
  const j = src.indexOf('};', i);
  const body = src.slice(i, j);
  const re = /^\s*([a-z][a-z0-9]*):\s*([0-9.]+)/gm;
  const tbl = {};
  let m;
  while ((m = re.exec(body))) tbl[m[1]] = parseFloat(m[2]);
  return tbl;
}
const FG = followTable(gen), FO = followTable(out);

console.log('\n【1】FOLLOW 表存在且生成器/生成物一致');
ok(!!FG && !!FO, '生成器与生成物都有 FOLLOW 表');
ok(FG && Object.keys(FG).length === 12, 'FOLLOW 表 12 个技能', FG && Object.keys(FG));
ok(JSON.stringify(FG) === JSON.stringify(FO), '生成物的 FOLLOW 表 = 生成器的（没被手改）',
  { gen: FG, out: FO });

console.log('\n【2】FOLLOW 键全是游戏技能 id（不是实验室口语名）');
/* 用 vm 加载真实数据表拿 SKILLS 的 key */
const ctx = { console, Math, JSON, Number, String, Array, Object, parseFloat, parseInt, isFinite };
vm.createContext(ctx);
for (const f of ['src/data/data-core.js', 'src/data/data-monsters.js', 'src/data/data-world.js', 'src/data/data-skills.js']) {
  try { vm.runInContext(read(f), ctx, { filename: f }); } catch (e) { /* 数据表可能互相依赖，下面兜底读源码 */ }
}
let skillIds = [];
try { skillIds = Object.keys(vm.runInContext('SKILLS', ctx) || {}); } catch (e) {}
if (!skillIds.length) {
  /* 兜底：从 data-skills.js 源码抽顶层 id */
  const s = read('src/data/data-skills.js');
  skillIds = [...s.matchAll(/^\s{2}([a-z][a-z0-9]*):\s*\{\s*id:/gm)].map(m => m[1]);
}
const badKey = FG ? Object.keys(FG).filter(k => skillIds.indexOf(k) < 0) : ['<no table>'];
ok(badKey.length === 0, '12 个键都在 SKILLS 里（写错实验室名会静默不跟）',
  { bad: badKey, ids: skillIds.length });
/* 易错的 5 个别名：实验室名绝不能当键 */
const aliasLabs = ['swords', 'stance', 'avatar', 'missile', 'rain'];
const usedAlias = FG ? Object.keys(FG).filter(k => aliasLabs.indexOf(k) >= 0) : [];
ok(usedAlias.length === 0, '没把实验室口语名（swords/avatar/stance/missile/rain）当键', usedAlias);

console.log('\n【3】三分类语义：该跟的跟、不该跟的不跟');
const MUST_FOLLOW = ['whirl', 'swordarray', 'bloodrage', 'iceshield', 'elementavatar',
  'heal', 'warcry', 'shieldwall', 'riposte', 'azuredragon', 'antidote', 'revive'];
const miss = FG ? MUST_FOLLOW.filter(k => !(k in FG)) : MUST_FOLLOW;
ok(miss.length === 0, '12 种自身光环/挂件类全在表里（旋风斩/剑阵/盾墙/法相…）', miss);
const NO_FOLLOW = ['firewall', 'frostnova', 'talisman'];  /* 地面部署 / 飞行体代表 */
const wrongFollow = FG ? NO_FOLLOW.filter(k => k in FG) : [];
ok(wrongFollow.length === 0, '地面部署与飞行体不在表里（火墙/冰霜新星/符箓）', wrongFollow);

console.log('\n【4】随时长取值合理（宁可长，但不能离谱）');
const badDur = FG ? Object.entries(FG).filter(([k, v]) => !(v >= 0.5 && v <= 3.0)) : [];
ok(badDur.length === 0, '12 个时长都在 0.5~3.0s（覆盖最后一个跟随构件）', badDur);
ok(FG && FG.whirl >= 1.0 && FG.swordarray >= 2.0,
  '旋风斩 ≥1s（斧头 1.0）/ 剑阵 ≥2s（绕身 2.6s）',
  FG && { whirl: FG.whirl, swordarray: FG.swordarray });

console.log('\n【5】随人窗口四处接线（生成器与生成物都要有）');
for (const [name, src] of [['生成器', gen], ['生成物', out]]) {
  ok(/_ride\s*&&\s*_ride\.objs\.indexOf\(o\)\s*<\s*0/.test(src),
    name + '：ROOT.add 把新 mesh 记进本次窗口', null);
  ok(/const dx = px - _ride\.lastX,\s*dz = pz - _ride\.lastZ/.test(src) &&
    /o\.position\.x \+= dx/.test(src) && /o\.position\.z \+= dz/.test(src),
    name + '：sync 用增量平移（不是绝对定位）', null);
  ok(/_ride\.ctx\.x = px;\s*_ride\.ctx\.z = pz/.test(src),
    name + '：同步刷新 ctx.x/z（持续发射器从人脚下冒）', null);
  ok(/_ride\.t \+= step;[\s\S]{0,80}if \(_ride\.t >= _ride\.dur\) _ride = null/.test(src),
    name + '：窗口到时自动关闭', null);
  ok(/_ride = null;\s*const rideDur = FOLLOW\[key\]/.test(src),
    name + '：新的一发开播先关旧窗口再按 FOLLOW 开窗', null);
  ok(/FOLLOW\[key\]/.test(src) && /dur: rideDur/.test(src),
    name + '：开窗用 FOLLOW 表的时长', null);
}
/* 换图清理在两处都要有（clear 函数里） */
for (const [name, src] of [['生成器', gen], ['生成物', out]]) {
  const clearAt = src.indexOf('_live.length = 0');
  const near = src.slice(clearAt - 300, clearAt + 300);
  ok(/_ride = null/.test(near), name + '：换图清场时关闭随人窗口（防第一发被旧位移污染）', null);
}
/* 活引用：旋风斩的 spinBlades / vortex 传活引用，不传坐标快照。
 * 配方源是 vfx-playground.html（用 P.pos），生成物是 sfx.js（用 ACT.player.pos）。 */
const lab = read('docs/vfx-playground.html');
ok(/FX\.spinBlades\(P\.pos/.test(lab) && /FX\.vortex\(P\.pos/.test(lab),
  '配方源 vfx-playground：旋风斩的刃尖火星 / 气流用玩家活引用 P.pos', null);
ok(/FX\.spinBlades\(ACT\.player\.pos/.test(out) && /FX\.vortex\(ACT\.player\.pos/.test(out),
  '生成物 sfx.js：同上，落盘成 ACT.player.pos', null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
