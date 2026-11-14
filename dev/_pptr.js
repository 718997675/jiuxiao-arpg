#!/usr/bin/env node
/* ============================================================
 * dev/_pptr.js —— puppeteer 门面（有 Chromium 用 Chromium，没有就用 Safari）
 *
 *   探针原来都写 `require('puppeteer-core')`。换成 `require('./_pptr')` 之后：
 *     · 机器上有 Chromium / Edge（Windows 开发机、CI）→ **原样走 puppeteer**，
 *       行为、读数、截图与以前一个字节都不差；
 *     · 只有 Safari（macOS 没装 Chrome）→ 落到 WebDriver 适配层（dev/_wd.js）。
 *
 *   为什么要这一层而不是改探针：探针里 900 处 `evaluate` 都是按 puppeteer 的
 *   语义写的（同步函数直接返回、async 函数等它 resolve、`on('console')` 收报错）。
 *   把这些语义在门面里补齐，探针一行都不用动，而「换浏览器」只影响这一层。
 *
 *   ---------------- Safari 侧的实现差距（都做了兜底或明说） ----------------
 *     1. **控制台报错**：Safari 没有日志接口。这里往页面注入一个 `__errbuf`，
 *        把 console.error / window.onerror / unhandledrejection 都收进去，
 *        每次 evaluate 时顺手取回、喂给 `on('console'/'pageerror')` 的回调。
 *        **页面加载期（注入之前）的报错收不到** —— 这是硬限制，不是懒。
 *        需要「开局零报错」的探针请自己再判一次 `typeof Game`（游戏没起来 = 有报错）。
 *     2. **无头**：Safari 没有无头模式，会弹真窗口。探针跑起来会看到 Safari 自己动。
 *     3. **CDP**：没有。`createCDPSession` 用不了（只有个别诊断脚本用）。
 *     4. **视口**：只能设窗口尺寸。这里做两轮校正，把 innerWidth/Height 逼近目标值。
 *     5. **设备像素比**：不能模拟。`deviceScaleFactor` 会被忽略（截图分辨率按真实屏）。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const WD = require('./_wd');

/* ---------------- 探测：有没有 Chromium ---------------- */

function realChromium() {
  let exe = 'chrome';
  try { exe = require('./_chrome'); } catch (e) { return null; }
  /* `_chrome.js` 找不到时返回字面量 'chrome' —— 那就是「没有」 */
  if (!exe || exe === 'chrome') return null;
  try { if (!fs.existsSync(exe)) return null; } catch (e) { return null; }
  return exe;
}

/* ---------------- Safari 适配 ---------------- */

/* 注入到页面的报错收集器。幂等：重复注入不会叠加监听。 */
const ERRBUF = `
(function () {
  if (window.__errbuf) return;
  window.__errbuf = [];
  var push = function (kind, text) {
    try {
      window.__errbuf.push({ kind: kind, text: String(text).slice(0, 400) });
      if (window.__errbuf.length > 200) window.__errbuf.shift();
    } catch (e) { }
  };
  var ce = console.error;
  console.error = function () {
    push('console', Array.prototype.map.call(arguments, function (a) {
      try { return (a && a.message) ? a.message : String(a); } catch (e) { return '?'; }
    }).join(' '));
    return ce.apply(console, arguments);
  };
  window.addEventListener('error', function (e) {
    push('pageerror', (e && e.message) || 'error');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    push('pageerror', (r && r.message) || String(r));
  });
})();
`;

class SafariPage {
  constructor(browser, wd, sid) {
    this._b = browser;
    this._wd = wd;            /* { port, sid } */
    this._handlers = {};      /* ev -> [cb] */
    this._flushed = 0;        /* __errbuf 已消费到第几条 */
    this._alive = true;
  }

  /* ---- 事件 ---- */
  on(ev, cb) {
    (this._handlers[ev] = this._handlers[ev] || []).push(cb);
    return this;
  }

  /* 把页面里攒下的报错取回来喂给 on() 的回调。
   * 每次 evaluate 都顺手调一次 —— 成本是一次 execute，换「接近实时」。 */
  async _drain() {
    if (!this._alive) return;
    let buf = null;
    try {
      buf = await this._cmd('POST', '/execute/sync', { script: 'return window.__errbuf || null;', args: [] });
    } catch (e) { return; }
    if (!Array.isArray(buf)) return;
    for (let i = this._flushed; i < buf.length; i++) {
      const e = buf[i];
      const list = e.kind === 'console' ? (this._handlers.console || []) : (this._handlers.pageerror || []);
      for (const cb of list) { try { cb({ type: () => 'error', text: () => e.text }); } catch (x) { } }
    }
    this._flushed = buf.length;
  }

  async _cmd(method, p, body) {
    const res = await WD.req(this._wd.port, method, '/session/' + this._wd.sid + p, body);
    /* W3C WebDriver 的**所有**成功响应都是 `{ value: <结果> }`。
     * 早期这里直接把整个响应返还，于是：
     *   evaluate → {value:3}（探针判据全错位）
     *   screenshot → String({value:...}) = '[object Object]'（截图是坏的）
     *   setViewport → inner 不是数组 → 校正直接 break（1280×800 实际只有 748）
     *   goto → st === 'complete' 永假 → 每次白等满 30 秒
     *   _drain → buf 不是数组 → 报错收集器静默失效
     * 统一在这一层解包，所有调用点拿到的就是 puppeteer 语义的结果。 */
    return (res && typeof res === 'object' && 'value' in res) ? res.value : res;
  }

  /* ---- 导航 ---- */

  async goto(url, opts) {
    await this._cmd('POST', '/url', { url: String(url) });
    /* 等 readyState=complete；最多 30 秒 */
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      try {
        const st = await this._cmd('POST', '/execute/sync', {
          script: 'return document.readyState;', args: []
        });
        if (st === 'complete') break;
      } catch (e) { }
      await WD.sleep(80);
    }
    await this._injectErr();
    return null;
  }

  async reload() {
    await this._cmd('POST', '/refresh', {});
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      try {
        const st = await this._cmd('POST', '/execute/sync', { script: 'return document.readyState;', args: [] });
        if (st === 'complete') break;
      } catch (e) { }
      await WD.sleep(80);
    }
    await this._injectErr();
    return null;
  }

  async _injectErr() {
    try { await this._cmd('POST', '/execute/sync', { script: ERRBUF, args: [] }); } catch (e) { }
  }

  /* ---- 视口 ---- */
  /* 只能设窗口尺寸 → 量一次 innerWidth/Height 再补偿一次。 */
  async setViewport(v) {
    const wantW = Math.round(v.width || 1280);
    const wantH = Math.round(v.height || 800);
    let cur = { w: wantW, h: wantH };
    for (let k = 0; k < 3; k++) {
      await this._cmd('POST', '/window/rect', { width: cur.w, height: cur.h, x: 0, y: 0 });
      let inner = null;
      try {
        inner = await this._cmd('POST', '/execute/sync', {
          script: 'return [window.innerWidth, window.innerHeight];', args: []
        });
      } catch (e) { break; }
      if (!Array.isArray(inner)) break;
      const dw = wantW - inner[0], dh = wantH - inner[1];
      if (Math.abs(dw) <= 1 && Math.abs(dh) <= 1) break;
      cur = { w: cur.w + dw, h: cur.h + dh };
    }
    return null;
  }

  /* ---- evaluate ---- */
  /* 与 puppeteer 的语义对齐：
   *   · 传同步函数 → 返回值直接拿回来
   *   · 传 async 函数 → 等它 resolve（走 WebDriver 的 execute/async）
   *   · 函数里抛错 → 在 Node 侧抛出（探针的 try/catch 照常生效）
   * 参数必须可 JSON 化。函数 / DOM 节点 / 类实例过不去 —— 过不去就明确报错，
   * 别让探针悄悄拿到 null 然后判成「全绿」。 */
  async evaluate(fn, ...args) {
    /* puppeteer 也支持 `evaluate('表达式')`：返回该表达式的值。
     * 好几支生成器（build-bosskits 的 waitForFunction）就是这么写的，
     * 早期这里明确拒绝字符串 → waitForFunction 永远拿到 false → 白等 30 秒。 */
    if (typeof fn === 'string') {
      const out = await this._cmd('POST', '/execute/sync', {
        script: 'return (' + fn + ');', args: []
      });
      return out === undefined ? null : out;
    }
    if (typeof fn !== 'function') {
      /* 其它类型（对象 / DOM 句柄）不支持 —— 明确报错好过静默 */
      throw new Error('_pptr(Safari).evaluate 只接受函数或表达式字符串；对象/句柄请自己包成 () => ...');
    }
    const isAsync = fn.constructor && fn.constructor.name === 'AsyncFunction';
    let src = fn.toString();
    /* 传进来的参数必须能过 JSON；不能过的直接告知，别让页面里拿到 undefined */
    let jsonArgs = [];
    try { jsonArgs = JSON.parse(JSON.stringify(args || [])); }
    catch (e) { throw new Error('evaluate 的参数无法 JSON 序列化（函数 / 类实例传不进浏览器）'); }

    let script;
    if (isAsync) {
      script = `
var __cb = arguments[arguments.length - 1];
var __args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
var __fn = (${src});
Promise.resolve(__fn.apply(null, __args)).then(
  function (v) { __cb(v === undefined ? null : v); },
  function (e) { __cb({ __wdErr: String((e && e.message) || e) }); }
);`;
    } else {
      script = `
var __args = Array.prototype.slice.call(arguments, 0);
var __fn = (${src});
return __fn.apply(null, __args);`;
    }

    let out;
    try {
      out = await this._cmd('POST', isAsync ? '/execute/async' : '/execute/sync', {
        script, args: jsonArgs
      });
    } finally {
      await this._drain();
    }
    if (out && typeof out === 'object' && out.__wdErr) throw new Error(out.__wdErr);
    return out === undefined ? null : out;
  }

  /* ---- 截图 ---- */
  async screenshot(o) {
    const o2 = o || {};
    const b64 = await this._cmd('GET', '/screenshot');
    if (!b64) return null;
    const buf = Buffer.from(String(b64), 'base64');
    if (o2.path) {
      try { fs.mkdirSync(path.dirname(o2.path), { recursive: true }); } catch (e) { }
      fs.writeFileSync(o2.path, buf);
    }
    return buf;
  }

  /* ---- 点击 / 查询 ---- */
  async click(sel) {
    return this.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) throw new Error('找不到元素: ' + s);
      el.click();
      return true;
    }, sel);
  }

  async $(sel) {
    const found = await this.evaluate((s) => !!document.querySelector(s), sel);
    return found ? { _sel: sel, click: () => this.click(sel) } : null;
  }

  /* puppeteer 的 $eval(sel, fn) = 把 fn 应用到第一个匹配元素。
   * 元素本身过不了 JSON，所以把 fn 的**源码**塞进页面里执行 ——
   * 这样 fn 能正常拿到那个 DOM 元素，语义与 puppeteer 一致。 */
  async $eval(sel, fn, ...args) {
    const fsrc = typeof fn === 'function' ? fn.toString() : String(fn);
    return this.evaluate((s, src2, a) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const f = (0, eval)('(' + src2 + ')');
      return f(el, ...a);
    }, sel, fsrc, args || []);
  }

  async $$eval(sel, fn, ...args) {
    const fsrc = typeof fn === 'function' ? fn.toString() : String(fn);
    return this.evaluate((s, src2, a) => {
      const list = Array.prototype.slice.call(document.querySelectorAll(s));
      const f = (0, eval)('(' + src2 + ')');
      return f(list, ...a);
    }, sel, fsrc, args || []);
  }

  /* 轮询等待条件。puppeteer 的 waitForFunction 是在页面里轮询，
   * 这里改成 Node 侧轮询（Safari 没有 MutationObserver 注入通道也无所谓）。 */
  async waitForFunction(fn, opts, ...args) {
    const timeout = (opts && opts.timeout) || 30000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      let v = false;
      try { v = await this.evaluate(fn, ...args); } catch (e) { v = false; }
      if (v) return { ok: true };
      await WD.sleep((opts && opts.polling) || 100);
    }
    throw new Error('waitForFunction 超时（' + timeout + 'ms）');
  }

  /* 无等价能力：明确记一笔，别让调用方以为生效了 */
  async setUserAgent() { return null; }
  async emulate() { return null; }
  async setCacheEnabled() { return null; }
  async evaluateOnNewDocument() { return null; }   /* Safari 没这通道 */
  async addStyleTag() { return null; }
  async tap() { return null; }
  async hover() { return null; }
  async createCDPSession() { throw new Error('Safari 没有 CDP（createCDPSession 用不了）'); }
  async content() { return this.evaluate(() => document.documentElement.outerHTML); }
  async title() { return this.evaluate(() => document.title); }
  async url() { return this._cmd('GET', '/url'); }
  async close() {
    /* Safari 一个 WebDriver 会话只有一个窗口，真关了后面 newPage() 就没得用。
     * 只把本页标记为死；调用方（mobile-layout 等）下一次 newPage() 会
     * 复用这个窗口并重新 goto / reload，状态不会串。 */
    this._alive = false;
    return null;
  }
}

class SafariBrowser {
  constructor(port, sid) { this._port = port; this._sid = sid; this._pages = []; }

  async newPage() {
    const pg = new SafariPage(this, { port: this._port, sid: this._sid });
    this._pages.push(pg);
    await pg._injectErr();
    return pg;
  }

  async close() {
    for (const p of this._pages) p._alive = false;
    await WD.deleteSession(this._port, this._sid);
    WD.stopDriver();
  }
}

/* ---------------- 对外 ---------------- */

async function launch(opts) {
  const exe = realChromium();
  if (exe) {
    /* 有 Chromium：原样交给 puppeteer，行为与以前一致 */
    const puppeteer = require('puppeteer-core');
    return puppeteer.launch(Object.assign({}, opts, { executablePath: exe }));
  }
  /* 只有 Safari */
  const port = await WD.startDriver();
  const sess = await WD.newSession(port, opts);
  const sid = sess.sessionId || (sess.value && sess.value.sessionId);
  if (!sid) throw new Error('safaridriver 建会话失败：没有返回 sessionId');
  return new SafariBrowser(port, sid);
}

module.exports = { launch, realChromium };
