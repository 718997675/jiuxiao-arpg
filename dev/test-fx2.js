#!/usr/bin/env node
/* ============================================================
 * fx2 契约：生成物没走散 + 接线还在 + 三条纪律没被破坏
 *
 *   node dev/test-fx2.js
 *
 * 真机能不能画出来由 `dev/probe-fx2.js` 证明；这一份管的是**结构**：
 * 搬家之后最容易松掉的那几颗螺丝，每颗一条。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const PRIMS = ['spr', 'burst', 'shock', 'zone', 'column', 'spikes', 'boulder', 'blade',
  'wave', 'decal', 'ribbon', 'arcSlash', 'trail', 'entity', 'pool', 'beam', 'wall'];

console.log('\n【1】生成物与特效台同步');
try {
  execFileSync('node', [path.join(__dirname, 'build-fx2.js'), '--check'], { cwd: ROOT, stdio: 'pipe' });
  ok(true, 'src/fx2.js 与 docs/boss-vfx-playground.html 一致');
} catch (e) {
  ok(false, 'src/fx2.js 已过期（跑 node dev/build-fx2.js --write）', String(e.stdout || e.message).trim());
}

const fx2 = rd('src/fx2.js');
/* 检查「有没有真的调用」时先把注释剥掉 —— 注释里写着「不用 setTimeout」，
 * 不剥的话那条纪律永远红（第一次就是这么红的）。 */
const code = fx2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('\n【2】17 个原语一个不少');
const found = [...fx2.matchAll(/BFX\.([a-zA-Z]+)\s*=/g)].map(m => m[1]);
const miss = PRIMS.filter(k => found.indexOf(k) < 0);
ok(miss.length === 0, 'BFX 原语齐（' + found.length + ' 个）', miss);
ok(found.length === PRIMS.length, '没有多出来的（' + found.length + ' / ' + PRIMS.length + '）', found);

console.log('\n【3】不依赖游戏的 DOM');
/* 原语层要能同时被特效台和游戏引用，所以它只能依赖 THREE + document.createElement。
 * 一旦出现 getElementById / querySelector，它就只能活在其中一个地方了。 */
ok(!/getElementById|querySelector/.test(code), '没有 getElementById / querySelector');
ok(!/window\./.test(code), '没有直接摸 window');

console.log('\n【4】三条纪律');
ok(/for \(const m of _live\.slice\(\)\)/.test(fx2),
  'clear 遍历的是副本（一边删一边遍历会漏掉后面几件）');
ok(/dt = Math\.min\(dt, 0\.05\)/.test(fx2),
  'update 把 dt 夹在 0.05（切后台回来的大 dt 会把 0.16 秒的刀一帧闪完）');
ok(!/setTimeout|setInterval/.test(code),
  '没有任何 setTimeout / setInterval（演出必须跟着帧走）');
ok(/if \(m\.isLight \|\| m\.isPoints\)/.test(fx2),
  '清场不拆点光与粒子缓冲（拆了之后再也画不出来）');

console.log('\n【5】导出面');
['bind', 'update', 'clear', 'stats'].forEach(k => {
  ok(new RegExp('function ' + k + '\\(').test(fx2), '导出了 ' + k);
});
ok(/actors: ACT/.test(fx2), '导出 actors（beam / entity 的默认目标）');

console.log('\n【6】三处接线还在');
const fx = rd('src/fx.js');
const game = rd('src/game.js');
const index = rd('index.html');
ok(/<script src="src\/fx2\.js"><\/script>/.test(index), 'index.html 引入了 fx2.js');
ok(/FX2\.update\(dt\)/.test(fx), 'FX.update 每帧推 FX2');
ok(/FX2\.clear\(\)/.test(fx), 'FX.clear 会把 FX2 一起清');
ok(/FX2\.bind\(this\.scene, this\.camera, this\.renderer\)/.test(game), '开局绑了场景 / 相机 / renderer');
ok(/FX2\.shake = /.test(game), '屏幕震动接到了 Game.shake');
ok(/syncFx2Actors\(\) \{/.test(game) && /this\.syncFx2Actors\(\)/.test(game),
  '每帧同步 boss / player 两个锚点');

console.log('\n【7】玩家侧「被拖」状态位（B16 第 2 件）');
ok(/dragPlayer\(x, z, dur/.test(game), '有统一入口 dragPlayer');
ok(/this\.pull = null;/.test(game), '换图 / 死亡都会清掉 pull');
ok(/if \(this\.pull\) \{\s*if \(this\.dashT > 0\)/.test(game), '冲刺能挣脱拖拽');
ok(/name: '被拖拽'/.test(game), '状态栏里有「被拖拽」这一条（和定身分开列）');

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
