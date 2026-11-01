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
/* 第二块：§2 的「五格配招总表」。
   这张表以前也是手抄的 —— 一改 KIT 就开始说旧话（实测剑帝那一行还写着
   「剑域 / 剑雨 / 冲撞」，而代码里早换成令旗+剑侍）。既然五格全在 `KIT` 里、
   「这一战考什么」全在机制技的 `counter` 里，就没有手抄的理由。 */
const BEGIN_KIT = '<!-- EXPORT:KIT:BEGIN -->';
const END_KIT = '<!-- EXPORT:KIT:END -->';

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

/* §2 用的卷名（跟 §7.3 是两套叫法，别合并） */
const GROUPS_KIT = [
  { key: 'act1', title: '卷一 · 朽骨钥（Lv 1~18）' },
  { key: 'act2', title: '卷二 · 青铜钥（Lv 19~30）' },
  { key: 'act3', title: '卷三 · 玄铁钥（Lv 31~40）' },
  { key: 'act4', title: '卷四 · 赤金钥（Lv 41~50）' },
  { key: 'act5', title: '卷五 · 九霄钥（Lv 51~60）' },
  { key: 'bafo', title: '八部天龙（破防 + 元素弱点）' },
  { key: 'dgb', title: '地宫首领（场地机制）' }
];

/* 判定写成一行中文：形状 + 尺寸。**只有这 6 种形状**，多一种就说明
 * `normShape` 那里漏了归一（旧称 rect/sector 折进 line/fan）。 */
function hitText(h) {
  if (!h) return '—';
  const f = n => (Math.round(n * 10) / 10).toFixed(1);
  let s = h.shape;
  if (s === 'circle') return '圆 R' + f(h.r);
  if (s === 'ring') return '环 外R' + f(h.r) + ' 内R' + f(h.r0);
  if (s === 'fan' || s === 'sector') {
    /* 角度有三种写法：`deg`（直接给）、`a0/a1`（起止角）、`span`（张角）。
     * 只认前两种的话，天门转那一行的「张角」会写成 **NaN°** —— 上一版就是。 */
    const deg = h.deg != null ? h.deg
      : (h.a1 != null && h.a0 != null) ? (h.a1 - h.a0) * 180 / Math.PI
      : (h.span != null ? h.span * 180 / Math.PI : 0);
    return '扇 ' + f(h.r) + ' 米 · ' + Math.round(deg) + '°';
  }
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

  /* §2 那张表要的是「五格 + 这一战考什么」。五格在 `KIT`，
     那句话在机制技的 `counter` —— 两份都在运行时，没有手抄的余地。 */
  const kits = await p.evaluate(() => BOSSES_DEF.map(d => ({
    id: d.id, name: d.name, kind: d.kind, act: d.act,
    slots: (KIT[d.id] || []).slice(0, 4).map(k => {
      const s = SKILL_INDEX[k] || {};
      return { k, name: s.name || k, counter: s.counter || '' };
    })
  })));

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

  /* ---- 第二块：§2 五格总表 ---- */
  const kl = [BEGIN_KIT, ''];
  for (const g of GROUPS_KIT) {
    /* 世界 Boss 也有 `act:5`，不排掉就会混进卷五（实测多出 6 只）——
       它们有自己的 §2-B。 */
    const rs = kits.filter(r => r.kind !== 'wb' && groupOf(r) === g.key);
    if (!rs.length) continue;
    kl.push('#### ' + g.title + ' · ' + rs.length + ' 只', '');
    kl.push('| Boss | 机制位（第 1 格） | 套路位（第 2/3 格） | 签名位（第 4 格） | 这一战考什么 |');
    kl.push('| --- | --- | --- | --- | --- |');
    for (const r of rs) {
      const s = r.slots, cell = i => (s[i] ? s[i].name : '—');
      kl.push('| ' + [r.name, '**' + cell(0) + '**', cell(1) + ' / ' + cell(2), cell(3),
        ((s[0] && s[0].counter) || '—').replace(/\|/g, '/')].join(' | ') + ' |');
    }
    kl.push('');
  }
  kl.push('> 本表由 `node dev/boss-kits-export.js --write` 生成，**不要手改**。', END_KIT);
  const kitBlock = kl.join('\n');

  await b.close();

  if (!write) { console.log(block + '\n\n' + kitBlock); return; }

  const doc = fs.readFileSync(DOC, 'utf8');
  const swap = (src, bm, em, txt) => {
    const i = src.indexOf(bm), j = src.indexOf(em);
    if (i < 0 || j < 0) {
      console.error('✗ 文档里找不到导出标记 ' + bm + ' / ' + em);
      process.exit(1);
    }
    return src.slice(0, i) + txt + src.slice(j + em.length);
  };
  let out = swap(doc, BEGIN, END, block);
  out = swap(out, BEGIN_KIT, END_KIT, kitBlock);
  fs.writeFileSync(DOC, out);
  console.log('✓ 已重写 ' + path.relative(path.resolve(__dirname, '..'), DOC) +
    ' §7.3（' + rows.length + ' 行）+ §2（' + kits.filter(r=>r.kind!=='wb').length + ' 只）');
})().catch(e => { console.error(e); process.exit(1); });
