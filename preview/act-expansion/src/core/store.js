/* ============================================================
 * 底层存储驱动：localStorage + 内存兜底
 * 上层由 SaveManager（core/save.js）使用，本文件只负责读写原子性最低层
 * ============================================================ */

/* ---------------- 存档：localStorage 不可用时的内存兜底 ----------------
 * 沙箱 iframe、隐私模式、部分浏览器的 file:// 下，访问 localStorage 会直接抛异常。
 * 以前这一步没兜住，会让 init() 中断 —— 表现就是「界面还在、3D 全黑」。
 */
const Store = {
  key: 'jiuxiao_save_v1',
  mem: null,
  get() {
    try { return localStorage.getItem(this.key); } catch (e) { return this.mem; }
  },
  set(v) {
    this.mem = v;
    try { localStorage.setItem(this.key, v); } catch (e) { /* 落到内存里，本局照样能存 */ }
  },
  has() { return !!this.get(); }
};

/* ---------------- 多键读写扩展（SaveManager 用） ----------------
 * 原来的 get/set 只认单个 key；多角色位需要按 key 读写，这里补一套。
 *
 * 可用性探测：只在启动时探一次 localStorage 能不能写。
 *   · 能写 → 一切以 localStorage 为准（内存镜像不参与读，避免
 *     「玩家在控制台清了 localStorage，页面还拿旧数据复活」）
 *   · 不能写（沙箱 iframe / 隐私模式 / file://）→ 全部落到 memMap，
 *     本局内依然可读可写，只是刷新后丢失
 */
(function (S) {
  const memMap = {};
  let lsOK = null;

  function probe() {
    if (lsOK !== null) return lsOK;
    try {
      const t = '__jx_probe__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      lsOK = true;
    } catch (e) { lsOK = false; }
    return lsOK;
  }

  S.getKey = function (k) {
    if (probe()) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? null : v;
      } catch (e) { /* 落到内存 */ }
    }
    return k in memMap ? memMap[k] : null;
  };

  S.setKey = function (k, v) {
    if (probe()) {
      try {
        localStorage.setItem(k, String(v));
        memMap[k] = String(v);
        return;
      } catch (e) {
        // 写失败（配额满 / 权限）：不污染内存镜像，读到的仍是旧值，
        // 上层 SaveManager 的回读校验会据此判定失败
        return;
      }
    }
    memMap[k] = String(v);
  };

  S.delKey = function (k) {
    delete memMap[k];
    if (!probe()) return;
    try { localStorage.removeItem(k); } catch (e) { }
  };

  S.keys = function () {
    const out = new Set();
    if (probe()) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) out.add(k);
        }
        return Array.from(out);
      } catch (e) { }
    }
    return Object.keys(memMap);
  };

  // 严格读取：只认 localStorage（用于写入校验，quota 满时能发现失败）
  S.strictGet = function (k) {
    if (!probe()) return undefined;
    try { return localStorage.getItem(k); } catch (e) { return undefined; }
  };

  S.hasLocalStorage = probe;
  S._resetProbe = function () { lsOK = null; };
})(Store);
