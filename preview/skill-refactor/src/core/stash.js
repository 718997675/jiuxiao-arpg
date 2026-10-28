/* ============================================================
 * [M6] 仓库存储层 —— 跨角色共享的储物箱
 *
 * 与角色存档**分开存**：`jiuxiao_stash_v1` 这个 key 不随角色位走。
 * 所有角色位读的是同一份仓库，换角色不会丢东西，也不用重新扩容。
 *
 * 为什么单独抽一层而不是塞进 state：
 *   仓库是「账号资产」，角色档是「这个人物的进度」。混在一起的话，
 *   删除角色会把仓库一起删掉 —— 这是玩家最不能接受的丢档方式。
 *
 * 结构：
 *   { v: 1, cap: 60, items: [装备...], mats: { 玄晶/符文/匠材 }, sets: { 套装id: {at, pieces[]} } }
 *
 * mats 也放这里（原本在 state.stash.mats）：材料仓「不占格子」的设计
 * 本来就该跨角色，否则换个号玄晶归零，锻造台直接不可用。
 * 老档的 state.stash 会在首次读档时被 absorb() 搬进来，搬完清空，
 * 不会重复计入。
 * ============================================================ */

const StashStore = {
  KEY: 'jiuxiao_stash_v1',

  /* 内存副本。所有读写都过它，避免每次 addMat 都 JSON.parse 一遍 */
  d: null,

  blank() {
    const base = (typeof STASH_BASE_CAP === 'number') ? STASH_BASE_CAP : 60;
    return { v: 1, cap: base, items: [], mats: {}, sets: {} };
  },

  /* ---------------- 读写 ---------------- */

  load() {
    let raw = null;
    try { raw = (typeof Store !== 'undefined') ? Store.getKey(this.KEY) : null; } catch (e) { raw = null; }
    let o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    this.d = this.normalize(o);
    return this.d;
  },

  save() {
    try {
      if (typeof Store !== 'undefined' && this.d) Store.setKey(this.KEY, JSON.stringify(this.d));
    } catch (e) { /* 存不下不影响本局，下次再存 */ }
  },

  /* 拿内存副本；没 load 过就先 load */
  get() {
    if (!this.d) this.load();
    return this.d;
  },

  /* ---------------- 整形 ----------------
   * 所有字段都过一遍，脏数据一律回落默认值。
   * 仓库是跨角色共享的，一旦写坏就是三个角色一起坏，所以这里比角色档更保守。 */
  normalize(o) {
    const d = this.blank();
    const base = (typeof STASH_BASE_CAP === 'number') ? STASH_BASE_CAP : 60;
    const hard = (typeof stashHardCap === 'function') ? stashHardCap() : 200;
    if (!o || typeof o !== 'object') return d;

    const cap = Math.round(Number(o.cap));
    d.cap = isNaN(cap) ? base : Math.max(base, Math.min(hard, cap));

    if (Array.isArray(o.items)) {
      d.items = o.items.filter(it => it && typeof it === 'object').slice(0, hard);
      /* 物品本身也要整形（补 sockets / 清非法符文）。normalizeItem 在 items.js，
       * 它在 data-items.js 之后加载，所以这里要判一下存在性，单文件测试也能跑。 */
      if (typeof normalizeItem === 'function') d.items = d.items.map(normalizeItem).filter(Boolean);
    }

    if (o.mats && typeof o.mats === 'object') {
      for (const k in o.mats) {
        if (typeof k !== 'string' || !k) continue;
        const n = Math.round(Number(o.mats[k]));
        if (!isNaN(n) && n > 0) d.mats[k] = Math.min(n, 1e9);
      }
    }

    if (o.sets && typeof o.sets === 'object') {
      for (const id in o.sets) {
        const rec = o.sets[id];
        if (!rec || !Array.isArray(rec.pieces)) continue;
        const pieces = rec.pieces.filter(it => it && typeof it === 'object');
        if (!pieces.length) continue;
        d.sets[id] = { at: Math.max(0, Math.round(Number(rec.at) || 0)), pieces };
      }
    }
    return d;
  },

  /* ---------------- 老档搬迁 ----------------
   * 把角色档里遗留的 state.stash 并进仓库，然后清空它。
   * 返回 true 表示这次真搬了东西（调用方据此决定要不要立刻 save）。
   *
   * 容量兜底：老档 items 若超过当前 cap，直接把 cap 抬到装得下
   * （但不超过硬上限）。宁可多给几格，也不能让玩家的东西凭空消失。 */
  absorb(legacy) {
    if (!legacy || typeof legacy !== 'object') return false;
    const d = this.get();
    let moved = false;

    if (Array.isArray(legacy.items) && legacy.items.length) {
      const items = legacy.items.filter(it => it && typeof it === 'object');
      if (items.length) {
        d.items = d.items.concat(items);
        const hard = (typeof stashHardCap === 'function') ? stashHardCap() : 200;
        if (d.items.length > d.cap) d.cap = Math.min(hard, d.items.length);
        moved = true;
      }
      legacy.items = [];
    }

    if (legacy.mats && typeof legacy.mats === 'object') {
      for (const k in legacy.mats) {
        const n = Math.round(Number(legacy.mats[k]));
        if (!isNaN(n) && n > 0) { d.mats[k] = (d.mats[k] || 0) + n; moved = true; }
      }
      legacy.mats = {};
    }

    if (moved) this.save();
    return moved;
  },

  /* 清空（删档 / 调试用）。真删 key，不是写空对象 —— 否则下次读到空壳还会覆盖 */
  clear() {
    this.d = this.blank();
    try { if (typeof Store !== 'undefined' && Store.delKey) Store.delKey(this.KEY); } catch (e) { }
  }
};
