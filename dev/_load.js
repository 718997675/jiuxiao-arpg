/* ============================================================
 * dev/_load.js —— 离线验证脚本共用的「按真实顺序装数据层」
 *
 * 为什么要有它：
 *   数据层拆成十几个文件之后（data-uniques / data-trial / class-pack …），
 *   每个测试脚本里手写的文件清单必然会漏，漏一个就报
 *   「UNIQUE_ITEMS is not defined」这种跟被测逻辑无关的错。
 *   所以统一从 index.html 里读 <script src="src/...">，**顺序天然和线上一致**。
 *
 * 只装「纯数据 / 纯逻辑」文件，碰到 THREE、document、window 的运行时文件自动跳过：
 *   白名单 = src/data/*  +  src/items.js  +  src/core/store.js  +  src/core/save.js
 *
 * 用法：
 *   const { loadData } = require('./_load');
 *   const ctx = loadData({ console, Math, Set, Map, JSON, localStorage: fakeLS });
 *   const STATS = vm.runInContext('STATS', ctx);   // const 声明不挂全局，必须这样取
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SAFE = [
  'src/data/',
  'src/items.js',
  'src/core/store.js',
  'src/core/save.js'
];

/* 从 index.html 里按出现顺序取出所有 src/ 脚本，再过滤成安全子集 */
function listFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\s+src="(src\/[^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const f = m[1];
    if (SAFE.some(p => (p.endsWith('/') ? f.startsWith(p) : f === p))) out.push(f);
  }
  return out;
}

/* 把数据层灌进 ctx（ctx 由调用方给，缺省补一份最小全局） */
function loadData(extra) {
  const ctx = vm.createContext(Object.assign({ console, Math, Set, Map, JSON, Date }, extra || {}));
  for (const f of listFiles()) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

module.exports = { ROOT, listFiles, loadData };
