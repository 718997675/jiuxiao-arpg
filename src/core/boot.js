/* ============================================================
 * 启动兜底：运行出错时给出可见提示，而不是一片黑
 * ============================================================ */

/* ---------------- 崩溃兜底：出错时给出可见提示，而不是一片黑 -------------
 *
 * 三条判定，按顺序（force = true 时跳过前两条，用于确实没救的情况，
 * 比如 WebGL 上下文 4 秒还没恢复）：
 *   1. 跨域脚本错误 → 直接忽略。本站脚本全部同源（没有 CDN、没有 Worker、
 *      没有 eval），出现 "Script error." 只可能是浏览器自己往页面里塞的
 *      东西。典型场景：iOS/iPadOS Safari 点「分享」按钮，或生成「添加到
 *      主屏幕」的快照时，WebKit 会注入脚本做预览，出错后 onerror 只拿得到
 *      一句 "Script error."，没有文件名也没有行号。
 *      —— 以前这一句会把整局游戏打成一张错误页，可游戏本身一点事都没有。
 *   2. 游戏已经在跑 → 不打断。弹一条 toast，控制台留全量堆栈，继续玩。
 *      一次性异常（贴图、音频、指针捕获）不该让玩家丢掉进度。
 *   3. 还没开局 → 出全屏错误页。这时候黑屏没人看得懂，必须给出可见提示。
 */
let __fatalShown = false;
let __lastWarn = { msg: '', at: 0 };

/* 游戏是否已经跑起来（开局后才算） */
function __gameAlive() {
  try {
    return typeof Game !== 'undefined' && Game && Game.running && !!Game.state;
  } catch (e) { return false; }
}

/* 跨域脚本错误的统一长相：只有 "Script error."，没有文件名和行号。
 * 有文件名的一律当自家 bug，照常报。 */
function __isOpaque(msg, file) {
  if (file) return false;
  /* 只在正式站点上忽略。file:// 直接打开 index.html 时，浏览器自己也会把
   * 一部分错误洗成 "Script error."，那种情况必须照常报出来，不然本地调试
   * 会变成「明明报错了却什么都不显示」。 */
  const p = (typeof location !== 'undefined' && location.protocol) || '';
  if (p !== 'http:' && p !== 'https:') return false;
  return /^Script error\.?$/i.test(String(msg || '').trim());
}

function showFatal(msg, file, force) {
  const text = String(msg || '未知错误');
  if (!force && __isOpaque(text, file)) {
    console.warn('[九霄] 已忽略一条跨域脚本错误（无文件名/行号，通常是浏览器注入的）：', text);
    return;
  }
  if (!force && __gameAlive()) {
    /* 游戏在跑：只弹提示，不盖全屏。同一条错误 5 秒内不重复弹 */
    const now = Date.now();
    if (__lastWarn.msg !== text || now - __lastWarn.at > 5000) {
      __lastWarn = { msg: text, at: now };
      console.error('[九霄] 运行出错（游戏继续）：', text, file || '');
      try {
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast('运行出错，游戏继续：' + text.split('\n')[0].slice(0, 32));
        }
      } catch (e) { /* 提示本身失败就算了 */ }
    }
    return;
  }
  if (__fatalShown) return;
  __fatalShown = true;
  try {
    const box = document.getElementById('fatal');
    const pre = document.getElementById('fatalMsg');
    if (!box || !pre) return;
    pre.textContent = (text + (file ? '\n' + file : '')).slice(0, 600);
    box.style.display = 'flex';
    console.error('[九霄] 运行出错：', text, file || '');
  } catch (e) { /* 兜底失败就算了 */ }
}

window.addEventListener('error', e => {
  if (!e || !e.message) return;
  showFatal(e.message, e.filename ? e.filename + ':' + e.lineno : '');
});

window.addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  if (!r) return showFatal('Promise rejection');
  if (typeof r === 'string') return showFatal(r);
  showFatal(r.message || 'Promise rejection', r.fileName ? r.fileName + ':' + r.lineNumber : '');
});

/* ---------------- 错误页上的「继续 / 复制信息」 ----------------
 * 继续：误报时不用被迫刷新（刷新会丢当前这一局的进度）。
 * 复制：真出问题时玩家点一下，整段（含文件名行号）就能贴过来，
 *       省掉「截图糊了 / 手抄错一个字符」的来回。 */
try {
  const box = document.getElementById('fatal');
  const pre = document.getElementById('fatalMsg');
  const dis = document.getElementById('fatalDismiss');
  const cp = document.getElementById('fatalCopy');
  if (dis && box) dis.addEventListener('click', () => { box.style.display = 'none'; });
  if (cp && pre) {
    const done = () => {
      cp.textContent = '已 复 制';
      setTimeout(() => { cp.textContent = '复 制 信 息'; }, 1600);
    };
    const fallback = () => {
      try {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        if (document.execCommand) document.execCommand('copy');
        done();
      } catch (e) { /* 选中了至少能手动复制 */ }
    };
    cp.addEventListener('click', () => {
      const txt = pre.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    });
  }
} catch (e) { /* 绑不上不影响兜底 */ }
