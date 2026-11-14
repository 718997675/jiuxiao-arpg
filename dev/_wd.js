#!/usr/bin/env node
/* ============================================================
 * dev/_wd.js —— 极简 WebDriver 客户端（只服务 Safari）
 *
 *   为什么需要它：这台机器上**没有 Chromium 内核的浏览器**
 *   （Chrome 装了吃内存，用户卸了；系统只有 Safari）。
 *   puppeteer-core 不能驱动 Safari，但 macOS 自带 `safaridriver`，
 *   走标准 W3C WebDriver 协议就能控制 Safari。
 *
 *   **前提（一次性，要人点）**：
 *     Safari → 设置 → 高级 → 勾「显示网页开发者功能」
 *     再在菜单栏「开发」→ 勾「允许远程自动化」
 *   没开的话第一个 POST /session 会返回
 *   「You must enable 'Allow remote automation'…」，报错信息已翻译成人话。
 *
 *   **Safari 与 Chrome 的差距（用的人必须知道）**：
 *     1. 没有「控制台日志」接口 —— 页面报错只能靠注入脚本自己收
 *        （见 _pptr.js 的 __errbuf）；页面**加载期**的报错收不到。
 *     2. 没有无头模式 —— 会真的弹一个 Safari 窗口出来。
 *     3. 没有 CDP —— `createCDPSession` 那类探针用不了。
 *     4. 视口只能设**窗口尺寸**，不是 innerWidth/Height，需要自己校正。
 *   所以它不是 puppeteer 的等价比，只保证「能跑、读数可信」。
 * ============================================================ */
'use strict';

const { spawn } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 驱动进程 ---------------- */

let _proc = null;
let _port = 0;

async function startDriver(port) {
  if (_proc && _port === port) return port;
  port = port || (4400 + Math.floor(Math.random() * 500));
  _port = port;
  _proc = spawn('safaridriver', ['--port', String(port)], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  _proc.on('error', () => { });
  /* 等端口起来：最多 15 秒。safaridriver 起来很快，但第一次会弹权限框 */
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      /* 随便打一个必然 404 的路径 —— 有响应就说明在听 */
      await req(port, 'GET', '/status');
      return port;
    } catch (e) { await sleep(200); }
  }
  throw new Error('safaridriver 起不来（端口 ' + port + '）。检查 Safari 是否装了、`safaridriver --version` 是否可用。');
}

function stopDriver() {
  if (!_proc) return;
  try { _proc.kill('SIGTERM'); } catch (e) { }
  _proc = null;
}

/* Safari 一次只能配一个 WebDriver 会话。探针抛异常时往往来不及
 * `await b.close()`，driver 子进程就留下来了 —— 下一支探针会报
 * 「The Safari instance is already paired with another WebDriver session」，
 * 而且看起来像「游戏坏了」。进程退出时无条件收掉自己起的 driver。 */
process.on('exit', stopDriver);

/* ---------------- HTTP ---------------- */

async function req(port, method, path, body) {
  const url = 'http://127.0.0.1:' + port + path;
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch(url, opt);
  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
  if (!r.ok) {
    const v = (json && json.value) || {};
    const msg = v.message || txt || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return json;
}

/* ---------------- 会话 ---------------- */

async function newSession(port, opts) {
  const o = opts || {};
  const caps = {
    alwaysMatch: {
      browserName: 'safari',
      /* 脚本超时：探针里有 `await wait(1800)` 这种，默认 30s 不够跑长序列 */
      'safari:automaticInspection': false
    }
  };
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await req(port, 'POST', '/session', { capabilities: caps });
      return res.value;
    } catch (e) {
      lastErr = e;
      const m = String(e.message || e);
      if (/Allow remote automation/i.test(m)) {
        throw new Error(
          'Safari 的「允许远程自动化」没开。开一次即可（之后一直有效）：\n'
          + '  1) Safari → 设置 → 高级 → 勾「显示网页开发者功能」\n'
          + '  2) 菜单栏「开发」→ 勾「允许远程自动化」\n'
          + '（或用管理员权限跑一次 `safaridriver --enable`）');
      }
      /* 上一支探针异常退出留下的配对：driver 断开后 Safari 会在一两秒内
       * 自己解除，等一下再试，别让整批测试跟着一起红。 */
      if (/already paired|another WebDriver session/i.test(m) && attempt < 4) {
        await sleep(1000);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function deleteSession(port, sid) {
  try { await req(port, 'DELETE', '/session/' + sid); } catch (e) { }
}

module.exports = { startDriver, stopDriver, newSession, deleteSession, req, sleep };
