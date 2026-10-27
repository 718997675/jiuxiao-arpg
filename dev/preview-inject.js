#!/usr/bin/env node
/**
 * 预览副本注入器（配合 dev/publish-preview.sh 使用）
 *
 *   node dev/preview-inject.js <index.html 路径> [分支名] [commit]
 *
 * 只做两件事，都是为了「预览站不干扰正式站」：
 *   1. <title> 加「[预览]」前缀 —— 开一堆标签页时一眼能分清
 *   2. localStorage 键统一加 `__pv:` 前缀 —— 预览站和正式站**同源**
 *      （都是 718997675.github.io），不隔离的话在预览站玩一局
 *      会把正式站的存档覆盖掉。
 *
 * 幂等：检测到已注入的标记就直接退出，可以反复跑。
 */
'use strict';

const fs = require('fs');

const file = process.argv[2];
const branch = process.argv[3] || 'unknown';
const sha = process.argv[4] || '';

if (!file) {
  console.error('用法: node dev/preview-inject.js <index.html 路径> [分支名] [commit]');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error('找不到文件: ' + file);
  process.exit(1);
}

const MARK = 'data-preview-shim';
let html = fs.readFileSync(file, 'utf8');

if (html.indexOf(MARK) >= 0) {
  console.log('· 已注入过，跳过');
  process.exit(0);
}

// ---------- 1. 标题前缀 ----------
const titleRe = /<title>([\s\S]*?)<\/title>/;
if (titleRe.test(html)) {
  html = html.replace(titleRe, (m, t) => '<title>[预览] ' + t.replace(/^\[预览\]\s*/, '') + '</title>');
} else {
  html = html.replace('</head>', '<title>[预览] 九霄 · 山海录</title>\n</head>');
}

// ---------- 2. localStorage 隔离 ----------
// 注意：这段字符串里不能出现 </script>，否则会把外层标签提前闭合。
const shim = [
  '<script ' + MARK + '>',
  '/* 预览副本：localStorage 键加 __pv: 前缀，避免覆盖正式站存档。由 dev/publish-preview.sh 注入 */',
  '(function () {',
  "  var P = '__pv:', L;",
  '  try {',
  '    L = window.localStorage;',
  "    L.setItem(P + '__probe', '1');",
  '    L.removeItem(P + "__probe");',
  '  } catch (e) {',
  "    console.warn('[预览] localStorage 不可用，存档隔离已跳过');",
  '    return;',
  '  }',
  '  function ownKeys() {',
  '    var out = [], i, k;',
  '    for (i = 0; i < L.length; i++) {',
  '      k = L.key(i);',
  '      if (k && k.indexOf(P) === 0) out.push(k.slice(P.length));',
  '    }',
  '    return out;',
  '  }',
  '  var S = {',
  '    getItem: function (k) { return L.getItem(P + k); },',
  '    setItem: function (k, v) { return L.setItem(P + k, v); },',
  '    removeItem: function (k) { return L.removeItem(P + k); },',
  '    clear: function () {',
  '      var ks = ownKeys(), i;',
  '      for (i = 0; i < ks.length; i++) L.removeItem(P + ks[i]);',
  '    },',
  '    key: function (i) { var ks = ownKeys(); return i >= 0 && i < ks.length ? ks[i] : null; }',
  '  };',
  "  Object.defineProperty(S, 'length', { get: function () { return ownKeys().length; } });",
  '  try {',
  "    Object.defineProperty(window, 'localStorage', { get: function () { return S; }, configurable: true });",
  '  } catch (e) {',
  "    console.warn('[预览] localStorage 隔离失败，存档可能与正式站共用', e);",
  '  }',
  '})();',
  '</scr' + 'ipt>'
].join('\n');

if (html.indexOf('</head>') >= 0) {
  html = html.replace('</head>', shim + '\n</head>');
} else {
  console.error('index.html 里找不到 </head>，无法注入');
  process.exit(1);
}

// ---------- 3. 控制台留个标记，排查线上到底是哪一版 ----------
const meta = [
  '<script>',
  "console.info('[预览副本] 分支 " + branch + " @" + sha + " · 存档已隔离（__pv: 前缀）');",
  '</scr' + 'ipt>'
].join('\n');
html = html.replace('</head>', meta + '\n</head>');

fs.writeFileSync(file, html, 'utf8');
console.log('· 已注入：标题前缀 + 存档隔离');
