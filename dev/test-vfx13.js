#!/usr/bin/env node
/* ============================================================
 * [U6-4] §13 十四条验收清单 · 静态契约（node + vm，不启浏览器）
 *
 *   node dev/test-vfx13.js
 *
 * 只钉**能从源码 / 数据表复核**的那几格；人眼结论、真机读数、录屏归
 * `dev/vfx-shot-live.js` / `dev/vfx-bench.js` / `dev/probe-vfx-kit.js` /
 * `dev/probe-vfx-field.js` / `dev/smoke.js` / `dev/mobile-layout.js`，
 * 逐条写进 `docs/SKILL-VFX-PLAN.md §13`，两边别互相代替。
 *
 * 覆盖：
 *   §13-1  leap 补出抛物线轨迹（放大净剪影里不再和 quake 撞脸）
 *   §13-3  雷电 bolt 分叉 / 命中闪白 / 焦痕（真实链路源 = 实验室）
 *   §13-4  四个真实领域的演出构件签名两两不同
 *   §13-5  火上升 / 冰硬停 / 毒下沉翻滚（ELEM_PROFILE 三个方向）
 *   §13-13 低画质贴花消失 / 拖尾关闭（只认 FXK_TIER 一张表）
 *   尺子纪律：出图走真实链路，老配方层尺子不许被偷换
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseSkills } = require('./skillvfx-shape');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const dataVfx = read('src/data/data-vfx.js');
const fxk = read('src/fx-kit.js');
const sfx = read('src/sfx.js');
const html = read('docs/vfx-playground.html');
const shotLive = read('dev/vfx-shot-live.js');
const shotOld = read('dev/vfx-shot.js');
const skills = parseSkills(html);
/* 实验室的键不全是游戏 id（`swords→swordarray` 等 5 条）。
 * 从生成器里读 ALIAS，别手抄 —— U1 踩过「按游戏 id 去实验室找同名条目」，
 * 结果改到了另一只技能还看不出读数异常。 */
const mA = read('dev/build-skillvfx.js').match(/const ALIAS = \{([\s\S]*?)\};/);
const ALIAS = mA ? Function('return {' + mA[1] + '}')() : {};
const byId = id => skills.find(s => (ALIAS[s.id] || s.id) === id);
/* 判「源码里还没有某段代码」时先把注释剥掉：U6-1 的三档表注释里
 * 保留了 `q < 0.75` 作为历史说明，出图尺子的头注释里也提了 VFX.playFor。
 * 不剥注释就会把「写清楚为什么改」判成「没改」。 */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const KEY = id => '"' + id + '":';

/* ---------------- §13-5 元素粒子运动 ---------------- */
console.log('【1】§13 第 5 条 · 火上升 / 冰硬停 / 毒下沉翻滚');
const ctx = { console, THREE: { Vector3: class { } }, Math, JSON, Object, Number, Array, String };
vm.createContext(ctx);
vm.runInContext(dataVfx + '\n;globalThis.__P = { ELEM_PROFILE };', ctx,
  { filename: 'src/data/data-vfx.js' });
const P = ctx.__P.ELEM_PROFILE;
ok(!!P && Object.keys(P).length === 6, 'ELEM_PROFILE 能加载且恰好 6 套', P && Object.keys(P));
const fire = P.fire, ice = P.ice, poison = P.poison;
ok(fire.up > 0 && fire.grav < 0, '火：正向初速 + 负重力 = 往上走', fire);
ok(ice.grav > 0 && ice.drag > fire.drag && ice.drag > 3,
  '冰：正向重力 + 大阻尼 = 甩出去就硬停', ice);
ok(poison.up < 0 && poison.grav < 0, '毒：负初速 + 负重力 = 往下沉翻滚', poison);
const motion = k => [P[k].up, P[k].grav, P[k].drag].join('/');
ok(new Set([motion('fire'), motion('ice'), motion('poison')]).size === 3,
  '三者的 (up, grav, drag) 三元组两两不同（不是只换颜色）',
  ['fire', 'ice', 'poison'].map(k => k + ':' + motion(k)));
/* 数据层还要真的接到解释器上，不能只是表里写了 */
ok(/up:\s*op\.up\s*===\s*undefined\s*\?\s*p\.up/.test(read('src/vfx.js')),
  'vfx.js 的 spr 从 ELEM_PROFILE 取 up（数据表不是摆设）');

/* ---------------- §13-3 雷电 ---------------- */
console.log('【2】§13 第 3 条 · bolt 分叉 / 命中闪白 / 焦痕');
for (const id of ['chain', 'thundercloud', 'judgement']) {
  const s = byId(id);
  ok(!!s, id + ' 在实验室里有演出条目');
  if (!s) continue;
  ok(s.prims.indexOf('bolt') >= 0, id + ' 用 FX.bolt（不是一根直 beam）', s.prims);
  const branches = (s.raw.match(/branch:\s*(\d+)/g) || []).map(x => Number(x.match(/\d+/)[0]));
  ok(branches.some(n => n >= 2), id + ' 的 bolt 带 ≥2 层分叉', branches);
}
const tc = byId('thundercloud'), ch = byId('chain');
ok(tc && /FX\.decal\([^)]*'crack'/.test(tc.raw), '雷云落点留裂纹贴花（焦痕）');
ok(tc && /flash\s*=\s*1/.test(tc.raw) && /FX\.shock/.test(tc.raw),
  '雷云命中拍有云心闪白 + 局部冲击环');
ok(ch && /flashAt\(/.test(ch.raw), '雷弧链每个跳点有局部闪白');
/* PLAN 字面写的 40~80ms 是「全屏闪白」提案；实现用的是云心 flash + 短 shock +
 * spark burst，属于同一处「命中回执」，但时长口径不同 —— 这条只记录事实，不判红。 */
ok(/40~80ms/.test(read('docs/SKILL-VFX-PLAN.md')),
  'PLAN 第 3 条原文仍在（口径差异写进 §13 结论，不偷偷改方案）');

/* ---------------- §13-4 领域四剪影 ---------------- */
console.log('【3】§13 第 4 条 · 四个真实领域的构件签名两两不同');
const fieldIds = ['firewall', 'blizzard', 'thundercloud', 'swordarray'];
const sigs = {};
for (const id of fieldIds) {
  const s = byId(id);
  ok(!!s && s.visualKinds.length >= 2, id + ' 有 ≥2 类视觉构件', s && s.visualKinds);
  sigs[id] = s ? s.visualKinds.join(',') : '';
}
ok(new Set(fieldIds.map(id => sigs[id])).size === 4,
  '四者视觉构件组合互不相同（不是只换颜色）', sigs);
/* PLAN 字面写「太极 / 火墙 / 毒雾 / 雷云」；实现里 taiji 是自身增益、
 * poison 是 DoT，不属于四个持续领域。两组都拍了，结论里写明归属。 */
ok(/taiji|poison/.test(shotLive) && /FIELD_IDS/.test(shotLive),
  '出图尺子把 PLAN 字面两只也拍进 sheet-fields（不假装名字一一对应）');

/* ---------------- §13-13 低画质三档降级 ---------------- */
console.log('【4】§13 第 13 条 · 低画质贴花消失 / 拖尾关闭');
const mTier = fxk.match(/const FXK_TIER = \{([\s\S]*?)\n\};/);
ok(!!mTier, 'FXK_TIER 三档表存在');
let T = null;
if (mTier) {
  const box = { console, Math };
  vm.createContext(box);
  vm.runInContext('globalThis.__T = {' + mTier[1] + '};', box, { filename: 'FXK_TIER' });
  T = box.__T;
}
if (T) {
  ok(T.high && T.mid && T.low, '恰好三档 high / mid / low', T && Object.keys(T));
  ok(T.low.decal === 0, '低档贴花 0', T.low.decal);
  ok(T.low.trail === false, '低档拖尾关', T.low.trail);
  ok(T.low.branch === 0, '低档 bolt 无分叉', T.low.branch);
  ok(T.mid.decal === 8 && T.mid.trail === true, '中档贴花 8 / 拖尾开', T.mid);
  ok(T.high.decal === 16, '高档贴花 16', T.high.decal);
}
ok(!/q\s*<\s*0\.75/.test(strip(fxk)), '原语层不再各写一套 q<0.75 阈值（三档只认一张表）');

/* ---------------- §13-1 leap 抛物线 ---------------- */
console.log('【5】§13 第 1 条 · leap 的抛物线轨迹（U6-4 实质修复）');
const leap = byId('leap'), quake = byId('quake');
ok(!!leap && /Math\.sin\(k\*Math\.PI\)\*2\.6/.test(leap.raw),
  'leap 沿抛物线摆出弧线光点（不是只移动 P.pos）');
ok(!!leap && /flatMesh\(TEX\.soft/.test(leap.raw) && /takeoff/.test(leap.raw),
  'leap 有弧线光点 + 起跳回执环两段');
ok(!!leap && /ARC_LIFE/.test(leap.raw), '弧线落地后还留余韵（600ms 高光帧拍得到）');
ok(!!quake && !/ARC_N/.test(quake.raw), 'quake 没有这条弧（两者剪影确实分开）');
const a = sfx.indexOf(KEY('leap'));
const b = sfx.indexOf('\n    "', a + 10);
const seg = sfx.slice(a, b > a ? b : a + 5000);
ok(a >= 0 && /ARC_N/.test(seg) && /takeoff/.test(seg),
  'src/sfx.js 的 leap 已由生成器同步（没手改生成物）', a);

/* ---------------- 尺子纪律 ---------------- */
console.log('【6】出图尺子纪律 · §13 只认真实链路');
ok(/Game\.playSkillVfx\(it\.id, ctx\)/.test(strip(shotLive)),
  'vfx-shot-live 播的是 Game.playSkillVfx（SKFX 真实链路）');
ok(!/VFX\.playFor/.test(strip(shotLive)), '新尺子代码里没有 VFX.playFor（不会退回配方层）');
ok(/VFX\.playFor/.test(strip(shotOld)), '老尺子仍量配方层（15 位剪影 / 回落路径）');
ok(/量的是配方层/.test(shotOld), '老尺子头部挂了「量的是配方层」告警');
for (const f of ['dev/vfx-bench.js', 'dev/probe-vfx-kit.js', 'dev/probe-vfx-field.js',
  'dev/smoke.js', 'dev/mobile-layout.js', 'dev/vfx-shot-live.js']) {
  ok(fs.existsSync(path.join(ROOT, f)), f + ' 存在（§13 各自的证据工具）');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' §13 静态契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
