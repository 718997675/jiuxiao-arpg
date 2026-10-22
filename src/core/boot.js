/* ============================================================
 * 启动兜底：运行出错时给出可见提示，而不是一片黑
 * （从 data.js 原样搬迁，逻辑未改）
 * ============================================================ */

/* ---------------- 崩溃兜底：出错时给出可见提示，而不是一片黑 ------------- */
let __fatalShown = false;
function showFatal(msg) {
  if (__fatalShown) return;
  __fatalShown = true;
  try {
    const box = document.getElementById('fatal');
    const pre = document.getElementById('fatalMsg');
    if (!box || !pre) return;
    pre.textContent = String(msg || '未知错误').slice(0, 600);
    box.style.display = 'flex';
    console.error('[九霄] 运行出错：', msg);
  } catch (e) { /* 兜底失败就算了 */ }
}
window.addEventListener('error', e => {
  if (e && e.message) showFatal(e.message + (e.filename ? '\n' + e.filename + ':' + e.lineno : ''));
});
window.addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  showFatal((r && (r.stack || r.message)) || r || 'Promise rejection');
});
