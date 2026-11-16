#!/usr/bin/env node
/* ============================================================
 * [U10] 竖向兜底 · 逐只排布契约
 *
 *   node dev/test-bosslayout.js
 *
 * U10 的第一条病根：同形状的两招拿到的柱子是同一套排布。
 * 修法不是给 88 招各写一份，而是：
 *   · `BFX.lift` 支持 variant（6 种骨架）+ seed（相位/抖动）
 *   · `BossCast._lift` 按「Boss id + 技能 id」算稳定 seed
 *
 * 本契约只钉源码结构（不渲染）：
 *   1. lift 真的分 6 种骨架，且不再用 Math.random（同 seed 可复现）
 *   2. _lift 真的把 variant/seed 传下去，且没有碰伤害 / 判定
 *   3. 两个生成物都与特效台一致（build --check）
 * 真机排布差异看 dev/probe-bosslayout.js。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fnText = (s, needle) => {
  const at = s.indexOf(needle);
  if (at < 0) return '';
  /* 从参数表结束后的第一个 `{` 开始数 —— `o = {}` 里的空对象不算函数体 */
  const p = s.indexOf(')', at);
  let i = s.indexOf('{', p < 0 ? at : p), d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') { d--; if (d === 0) return s.slice(at, j + 1); }
  }
  return s.slice(at);
};

console.log('一、BFX.lift：6 种骨架 + 可复现 seed');
{
  const fx2 = src('src/fx2.js');
  const lift = strip(fnText(fx2, 'BFX.lift = function'));
  ok(lift.length > 1000, '找到 BFX.lift 函数体', lift.length);
  ok(/variant/.test(lift), '支持 variant');
  ok(/seed/.test(lift), '支持 seed');
  ok(/rnd\s*=/.test(lift), '有 seeded RNG');
  ok(!/Math\.random/.test(lift), 'lift 内部不再用 Math.random');
  const branches = (lift.match(/variant\s*===\s*[1-5]/g) || []).length;
  ok(branches >= 5, '至少 6 种骨架（0 默认 + 1~5）', branches);
  for (const shape of ['circle', 'ring', 'rect', 'sector', 'scatter', 'self']) {
    ok(lift.indexOf("'" + shape + "'") >= 0, '覆盖形状 ' + shape);
  }
  ok(/Math\.imul\(sd,\s*1664525\)/.test(lift), 'seeded RNG 是 LCG（同 seed 同结果）');
}

console.log('一b、entity 低模核：从「亮团」补出体积');
{
  const fx2 = src('src/fx2.js');
  const ent = strip(fnText(fx2, 'BFX.entity = function'));
  ok(/IcosahedronGeometry/.test(ent), 'entity 用低模核');
  ok(/lowpoly/.test(ent), '支持 lowpoly:false 退回');
  ok(/core\.rotation/.test(ent), '核会转（有朝向）');
  ok(/core\.material\.dispose/.test(ent), 'kill 时释放核材质');
}

console.log('二、BossCast._lift：按 Boss + 技能播种，且不碰数值/判定');
{
  const bc = src('src/boss-cast.js');
  const lift = strip(fnText(bc, '_lift(e, sk, id)'));
  ok(lift.length > 300, '找到 _lift 函数体', lift.length);
  ok(/variant/.test(lift), '_lift 传 variant');
  ok(/seed\s*:\s*h/.test(lift), '_lift 传 seed');
  ok(/2166136261/.test(lift) && /16777619/.test(lift), 'FNV-1a 稳定哈希');
  ok(/e\.kind/.test(lift), 'seed 含 Boss id');
  ok(/\bid\b/.test(lift), 'seed 含技能 id');
  for (const bad of ['damagePlayer', 'damageEnemy', 'e.hp', 'e.dmg', 'e.spd', 'e.radius']) {
    ok(lift.indexOf(bad) < 0, '_lift 不出现 ' + bad);
  }
}

console.log('三、生成物与特效台一致');
{
  for (const [file, script] of [
    ['src/fx2.js', 'dev/build-fx2.js'],
    ['src/boss-cast.js', 'dev/build-bosscast.js']
  ]) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, script), '--check'], { cwd: ROOT, encoding: 'utf8' });
      ok(true, file + ' 与源一致');
    } catch (e) {
      ok(false, file + ' 过期（改源后没 --write）', String((e.stdout || '') + (e.stderr || '')).trim());
    }
  }
}

console.log('\n' + (fail ? '✗' : '✓') + ' U10 竖向排布契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
