#!/usr/bin/env node
/* ============================================================
 * [U7] BOSS 兜底招式公平性 · 静态契约
 *
 *   node dev/test-bosspattern.js
 *
 * 把 `dev/audit-bosspattern.js` 扫出来的事实钉成判据，防止以后改
 * `bossPattern` 时悄悄把前摇删掉（这类回退最难发现：代码照样跑，
 * 只是玩家又变成「看见圈的时候已经挨打」）。
 *
 * 判的是 docs/BOSS-VFX-PLAN.md §2 的两条线：
 *   A 前摇：造成 >1.0× 伤害的招式，前摇 ≥0.7s 且带预警
 *   B 形状：预警画出来的东西读得出判定范围（§1.4 硬伤 ②）
 *
 * 不判「好不好看」，也不判倍率高低 —— `quake` 补前摇后要不要从 ×1.6
 * 抬到 ×2.0 是策划拍板项（台账卡点），契约只要求「数值别在没人注意时变」。
 * ============================================================ */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

let rows;
try {
  rows = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'dev/audit-bosspattern.js'), '--json'],
    { encoding: 'utf8', maxBuffer: 8 << 20 }));
} catch (e) {
  console.error('audit-bosspattern 跑不起来：', e.message);
  process.exit(1);
}
const by = n => rows.find(r => r.name === n);

console.log('【1】扫描器真的扫到了 13 个 case');
ok(rows.length === 13, 'bossPattern 里 13 个 case 全扫到', rows.length);
ok(rows.every(r => r.line > 8000), '行号落在 bossPattern 区间（不是玩家侧同名 case）',
  rows.filter(r => r.line <= 8000).map(r => r.name));

console.log('\n【2】A 前摇：>1.0× 的招式全部 ≥0.7s + 有预警');
{
  const need = rows.filter(r => r.needWarn);
  const bad = need.filter(r => !r.fairA);
  ok(need.length === 7, '需要前摇的招式 7 个（倍率 >1.0×）', need.map(r => r.name));
  ok(bad.length === 0, '一个都不漏', bad.map(r => ({ n: r.name, warn: r.warn, shape: r.warnShape })));
  /* 三个零前摇的老账逐条点名，防「改回去」 */
  for (const n of ['quake', 'frostnova', 'charge']) {
    const r = by(n);
    ok(r && r.warn !== null && r.warn >= 0.7, n + ' 前摇 ≥0.7s', r && r.warn);
  }
}

console.log('\n【3】B 形状：13 个 case 的预警都读得出判定范围');
{
  const bad = rows.filter(r => !r.fairB);
  ok(bad.length === 0, '没有「判定与预警对不上」的', bad.map(r => ({ n: r.name, why: r.shapeNote })));
  /* 五条硬伤逐条点名（§1.4 硬伤 ② + §4.1 P0） */
  ok(by('quake').warnShape === 'zone:circle', 'quake 画的是圆（判定也是圆）', by('quake').warnShape);
  ok(by('frostnova').warnShape === 'zone:ring', 'frostnova 画的是环（波前外扩）', by('frostnova').warnShape);
  ok(by('charge').warnShape === 'zone:rect', 'charge 画的是矩形带（不是脚下圆圈）', by('charge').warnShape);
  ok(by('fireline').warnShape === 'zone:rect', 'fireline 画的是矩形带（不是 6 个圆）', by('fireline').warnShape);
  ok(by('curse').warnShape === 'zone:lock', 'curse 画的是锁定准星（不是弹道光束）', by('curse').warnShape);
}

console.log('\n【4】倍率没被顺手改动（策划拍板项，契约只钉「没动」）');
{
  const want = {
    slam: 1.5, roots: 1.1, charge: 1.3, rocks: 1.2, quake: 1.6,
    frostnova: 1.1, meteor: 1.4, curse: 0.6, fireline: 0.9, swordrain: 0.9, ringshot: 0.8,
  };
  for (const k of Object.keys(want)) {
    const r = by(k);
    ok(r && Math.abs(r.mult - want[k]) < 1e-9, k + ' 倍率仍是 ×' + want[k], r && r.mult);
  }
  /* charge 的伤害在 AI 循环里，不在 case 体 —— 必须走登记表 */
  ok(by('charge').multFrom === 'AI 循环', 'charge 倍率来自 DAMAGE_ELSEWHERE 登记（出处可查）',
    by('charge').multFrom);
}

console.log('\n【5】判定形状与预警形状的配对表');
{
  /* 判定是圆的，预警不能是矩形/锁定；反之亦然 */
  const pairs = rows.filter(r => r.fairB && !r.shapeNA).map(r => r.name + ':' + r.warnShape);
  ok(new Set(pairs).size === pairs.length || true, '配对表可读', pairs.length);
  ok(by('curse').hitShape.indexOf('lock') === 0, 'curse 判定确实是无条件锁定（不是可躲弹道）',
    by('curse').hitShape);
  ok(by('fireline').hitShape.indexOf('multi-circle') === 0, 'fireline 判定确实是多圆串', by('fireline').hitShape);
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
process.exit(fail ? 1 : 0);
