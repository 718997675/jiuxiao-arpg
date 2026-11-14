#!/usr/bin/env node
/* ============================================================
 * [U2-2] 增益符号图标 · 出图 + 形状可读性验收
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-buff-icons.js
 *   出图：dev/_shots/buff-icons-sheet.png（按仓库惯例不入库，按需生成）
 *
 * 「svg 存在」不等于「图标可读」—— 一条空 path、一条画满的方块、
 * 或者直接把 evenodd 写错导致孔洞没了，DOM 里都看得到 <path>。
 * 所以这里把 d 交给浏览器自己的 Path2D **真画一遍**，数非透明像素：
 *   · 128px 大图覆盖率区间 → 既不是空白也不是实心方块
 *   · 16px（HUD 里真实尺寸）可见像素数 → 缩到 16px 后细线不能全消失
 *   · evenodd 图标只画第一条子路径（未挖洞的外轮廓）→ 覆盖率必须更大
 *     （不能拿 nonzero 重画当反例：内圈子路径方向相反时 nonzero 也会挖空）
 *   · 17 枚全部能查到映射入口 → 不养死图标
 *
 * 顺带出一张 contact sheet：大图 48px + 真实 16px + 覆盖率数字，
 * 人眼看一眼就知道「箭头是不是箭头、盾是不是盾」（U2-2 的验收是形状，不是断言数）。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 470, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  /* 必须开真页面：验证 data-buff-icons.js 已经按序挂到全局、游戏能读到 */
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1000);

  const r = await p.evaluate(() => {
    const keys = Object.keys(BUFF_ICON_PATHS);
    /* 覆盖率 = 非透明像素 / 总面积。getBBox 只量外轮廓，看不出 evenodd 的洞，
     * 所以必须读 ImageData。Path2D 直接吃 SVG d，是浏览器自己的解析器。 */
    const cover = (d, rule, size) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.scale(size / 32, size / 32);
      cx.fillStyle = '#fff';
      cx.fill(new Path2D(d), rule);
      const a = cx.getImageData(0, 0, size, size).data;
      let n = 0;
      for (let i = 3; i < a.length; i += 4) if (a[i] > 40) n++;
      return n / (size * size);
    };
    const rows = keys.map(k => {
      const d = BUFF_ICON_PATHS[k];
      const rule = BUFF_ICON_EVENODD[k] ? 'evenodd' : 'nonzero';
      const out = { k, d, rule, len: d.length, big: 0, small: 0, solid: 0, err: null };
      try {
        out.big = cover(d, rule, 128);
        out.small = cover(d, rule, 16);
        /* 反例 = 只画外轮廓（第一条 M 子路径），此时所有孔洞都还填着。
         * 用 nonzero 重画整条 d 不行：内圈方向相反时 nonzero 同样会挖空。 */
        const parts = d.split(/(?=M)/);
        out.solid = cover(parts.length > 1 ? parts[0] : d, 'nonzero', 128);
      } catch (e) { out.err = String(e.message || e); }
      return out;
    });

    /* 映射入口：画了 17 枚却只有 14 枚能被 buffIconKey 查到 = 3 枚死图标 */
    const used = new Set(Object.values(BUFF_ICON_OF).concat(Object.values(BUFF_ICON_BY_NAME)));
    const dead = keys.filter(k => !used.has(k));

    /* 出图层：覆盖在游戏之上，只用测试容器，不碰 #buffrow 子树 */
    const sheet = document.createElement('div');
    sheet.id = 'buff-sheet';
    sheet.innerHTML = '<style>' +
      '#buff-sheet{position:fixed;left:0;top:0;z-index:99999;background:#141821;color:#e8d9b8;' +
      'display:grid;grid-template-columns:repeat(6,150px);gap:8px;padding:14px;font:11px sans-serif}' +
      '#buff-sheet .c{border:1px solid #333c48;border-radius:4px;background:#0e1218;padding:6px;text-align:center}' +
      '#buff-sheet .big{height:52px;display:flex;align-items:center;justify-content:center;color:#f0d080}' +
      '#buff-sheet .small{height:20px;display:flex;align-items:center;justify-content:center;color:#9ae0ff;margin-top:2px}' +
      '#buff-sheet .lb{margin-top:4px;color:#dfe6ef}' +
      '#buff-sheet .cv{color:#8894a6;font-size:9px}' +
      '</style>' +
      rows.map(x => '<div class="c"><div class="big">' + buffIconSvg(x.k, { size: 48 }) +
        '</div><div class="small">' + buffIconSvg(x.k, { size: 16 }) +
        '</div><div class="lb">' + x.k + '</div><div class="cv">' +
        (x.big * 100).toFixed(0) + '% · 16px ' + Math.round(x.small * 256) + 'px</div></div>').join('');
    document.body.appendChild(sheet);

    /* viewBox 尺度：path 的包围盒要撑满 32 坐标系，不能缩在角落 */
    const bbox = rows.map(x => {
      const el = sheet.querySelector('.c:nth-child(' + (rows.indexOf(x) + 2) + ') .big path');
      if (!el) return null;
      const q = el.getBBox();
      return { k: x.k, w: Math.round(q.width), h: Math.round(q.height) };
    }).filter(Boolean);
    const svgHtml = rows.map(x => buffIconSvg(x.k, { size: 16 }));
    return { rows, dead, bbox, svgHtml, nSheet: sheet.querySelectorAll('.c').length };
  });

  const rows = r.rows;
  console.log('\n【U2-2】17 枚符号图标 · 真画一遍');
  ok(rows.length === 17, '图标总数 17 枚', rows.length);
  ok(new Set(rows.map(x => x.d)).size === 17,
    '17 条 d 互不相同（不是同一形状换皮）', rows.length);
  ok(rows.every(x => !x.err), 'Path2D 全部解析成功（没有非法 d）', rows.filter(x => x.err));
  ok(r.svgHtml.every(s => /<path d="/.test(s) && /viewBox="0 0 32 32"/.test(s) && /fill="currentColor"/.test(s)),
    'buffIconSvg 产出符合 M11（32² / 纯 path / currentColor）');

  const bigBad = rows.filter(x => x.big < 0.06 || x.big > 0.90).map(x => [x.k, +x.big.toFixed(3)]);
  ok(bigBad.length === 0, '128px 覆盖率 6%~90%（不是空白 / 不是实心块）', bigBad);
  const smallBad = rows.filter(x => x.small * 256 < 20 || x.small > 0.92)
    .map(x => [x.k, Math.round(x.small * 256)]);
  ok(smallBad.length === 0, '缩到 HUD 真实 16px 后仍 ≥20 个可见像素', smallBad);

  const eo = rows.filter(x => x.rule === 'evenodd');
  const holeBad = eo.filter(x => x.solid - x.big < 0.01)
    .map(x => [x.k, +(x.solid - x.big).toFixed(3)]);
  ok(eo.length === 8 && holeBad.length === 0,
    '8 枚镂空图标的洞真的挖出来了（外轮廓实心 − 实际填充 ≥1%）', holeBad);

  /* 双箭头 / 沙漏 / 泪滴天生是窄符号，硬要求 ≥20×20 会误杀 ——
   * 改判「两维都 ≥12 且面积 ≥240」，即至少占住 32² 的 23%。 */
  const bboxBad = r.bbox.filter(x => x.w < 12 || x.h < 12 || x.w * x.h < 240);
  ok(r.bbox.length === 17 && bboxBad.length === 0,
    '每枚 path 包围盒占住 32 坐标系（两维 ≥12、面积 ≥240）', bboxBad);
  ok(r.dead.length === 0, '17 枚全部有查表入口（没有死图标）', r.dead);
  ok(r.nSheet === 17, 'contact sheet 17 格全部渲染', r.nSheet);

  const out = path.resolve(__dirname, '_shots', 'buff-icons-sheet.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const el = await p.$('#buff-sheet');
  await el.screenshot({ path: out });
  console.log('\n  出图 →', out);

  console.log('\n【错误】');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
