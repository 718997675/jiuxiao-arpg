#!/usr/bin/env node
/* ============================================================
 * BOSS-KITS.md §7.3 的导出器 —— 45 行表**从代码生成**
 *
 *   NODE_PATH=<node_modules> node dev/boss-kits-export.js          # 打到屏幕
 *   NODE_PATH=<node_modules> node dev/boss-kits-export.js --write  # 改文档（就地替换）
 *
 * ---------------- 为什么要有这个脚本 ----------------
 * §7.3 上面写着一句「表本体是 `NR`，这一节由它生成」。之前这句话是个**谎**：
 * 表是手抄的，`NR` 一改，文档立刻开始说旧话 —— 实测改完之后表里 45 行有 30 多行
 * 是错的（藤蔓还是"在你脚下长"、九霄神将还是"几道雷落下来"）。
 *
 * 所以判据不能是「我导过了」，得是「跑一次就同步」。文档里埋了
 * `<!-- EXPORT:NR:BEGIN -->` / `<!-- EXPORT:NR:END -->` 两个标记，
 * `--write` 只替换这两行之间，别的一律不动。
 *
 * 数据全部来自**运行时**（不是解析源码）：`hit()` 就是结算用的那组数字，
 * 面板上「显示判定形状」画的也是它。文档里写 R3.6，代码里也必须是 R3.6 ——
 * 中间隔一层手抄就会走散。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
const DOC = path.resolve(__dirname, '..', 'docs', 'BOSS-KITS.md');
const BEGIN = '<!-- EXPORT:NR:BEGIN -->';
const END = '<!-- EXPORT:NR:END -->';

/* 卷标题以 BOSSES_DEF 的 `act` / `kind` 为键。名字写在这里而不是从数据推，
 * 因为「卷」是叙事概念，数据里只有编号。 */
const GROUPS = [
  { key: 'act1', title: '卷一 · 朽骨钥（Lv 6~18）' },
  { key: 'act2', title: '卷二 · 焚天炉（Lv 19~30）' },
  { key: 'act3', title: '卷三 · 剑冢（Lv 31~40）' },
  { key: 'act4', title: '卷四 · 九霄（Lv 42~50）' },
  { key: 'act5', title: '卷五 · 终焉（Lv 51~60）' },
  { key: 'bafo', title: '八部天龙（Lv 60）' },
  { key: 'dgb', title: '地宫首领（Lv 36）' }
];
const groupOf = d => (d.kind === 'bafo' || d.kind === 'dgb') ? d.kind : 'act' + d.act;

/* 判定写成一行中文：形状 + 尺寸。**只有这 6 种形状**，多一种就说明
 * `normShape` 那里漏了归一（旧称 rect/sector 折进 line/fan）。 */
function hitText(h) {
  if (!h) return '—';
  const f = n => (Math.round(n * 10) / 10).toFixed(1);
  let s = h.shape;
  if (s === 'circle') return '圆 R' + f(h.r);
  if (s === 'ring') return '环 外R' + f(h.r) + ' 内R' + f(h.r0);
  if (s === 'fan' || s === 'sector') return '扇 ' + f(h.r) + ' 米 · ' + (h.deg || Math.round((h.a1 - h.a0) * 180 / Math.PI)) + '°';
  if (s === 'line' || s === 'rect') return '线 ' + f(h.w || h.r) + '×' + f(h.len || h.l || 0);
  if (s === 'scatter') {
    const p = h.pts || [];
    const r = p.length ? p.reduce((a, q) => a + (q.r || 0), 0) / p.length : 0;
    return '散 ×' + p.length + ' R' + f(r);
  }
  if (s === 'self') return '整场 · ' + (h.note || '按帧结算');
  return s;
}

(async () => {
  const write = process.argv.indexOf('--write') >= 0;
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 600 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'docs', 'boss-vfx-playground.html'),
    { waitUntil: 'load' });
  await p.waitForFunction('typeof NR === "object" && typeof BOSSES_DEF !== "undefined"');
  await wait(600);

  const rows = await p.evaluate(() => BOSSES_DEF.map(def => {
    const nr = NR[def.id];
    if (!nr) return null;                       /* 世界 Boss（kind:'wb'）没有本命技 */
    let hit = null;
    try { hit = nr.hit ? nr.hit() : null; } catch (e) { hit = { shape: 'ERR:' + e.message }; }
    return {
      id: def.id, name: def.name, lv: def.lv, kind: def.kind, act: def.act,
      n: nr.n, tag: nr.tag, rule: nr.rule || '', warm: nr.warm, hit
    };
  }).filter(Boolean));

  const lines = [BEGIN, ''];
  for (const g of GROUPS) {
    const rs = rows.filter(r => groupOf(r) === g.key);
    if (!rs.length) continue;
    lines.push('#### ' + g.title, '');
    lines.push('| Boss | Lv | 本命技 | 逼玩家做的事 | 判定 | 前摇 |');
    lines.push('| --- | -- | --- | --- | --- | --- |');
    for (const r of rs) {
      lines.push('| ' + [r.name, r.lv, '**' + r.n + '**', r.rule.replace(/\|/g, '/'),
        hitText(r.hit), (r.warm || 0).toFixed(2) + 's'].join(' | ') + ' |');
    }
    lines.push('');
  }
  /* 最后一行写清「怎么再生」，否则下一个人只能手改表 */
  lines.push('> 本表由 `node dev/boss-kits-export.js --write` 生成，**不要手改**。', END);
  const block = lines.join('\n');

  await b.close();

  if (!write) { console.log(block); return; }

  const doc = fs.readFileSync(DOC, 'utf8');
  const i = doc.indexOf(BEGIN), j = doc.indexOf(END);
  if (i < 0 || j < 0) {
    console.error('✗ 文档里找不到导出标记 ' + BEGIN + ' / ' + END);
    process.exit(1);
  }
  fs.writeFileSync(DOC, doc.slice(0, i) + block + doc.slice(j + END.length));
  console.log('✓ 已重写 ' + path.relative(path.resolve(__dirname, '..'), DOC) +
    ' §7.3（' + rows.length + ' 行）');
})().catch(e => { console.error(e); process.exit(1); });
