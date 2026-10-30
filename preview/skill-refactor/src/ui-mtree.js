/* ============================================================
 * 移动端「横向树状伸展」渲染器（天赋 / 术法共用）
 *
 * 为什么要有它：
 *   · 天赋页是一张 660×440 的轮盘 canvas —— 节点说明靠 mousemove 悬停，
 *     而触屏没有悬停；节点直径 30 像素，手指点不准。手机上的实际体验是
 *     「不知道点的是什么，也拖不动」。
 *   · 术法页是一张大画布 —— 要看全得双指捏合 + 单指平移，还得在节点下方
 *     找那对 ＋/− 小按钮。
 *
 * 两者在手机上统一改成：
 *   列 = 依赖深度，从左往右长；横向滚动（原生手势，不做缩放）；
 *   节点是 66px 的大格子，点一下选中 → 下方说明书卡里 ＋1 / −1。
 *
 * 这个文件只做「排版 + 画连线 + 派发点击」，格子长什么样由调用方给 tile 回调。
 * PC 上仍然用原来的轮盘 / 大画布，一行都不动。
 * ============================================================ */

const MTREE = {
  /* 尺寸：66 的格子 + 94 的列距 = 两列之间留 28px 给连线 */
  G: { tile: 66, colW: 94, rowH: 82, pad: 12, maxCols: 6 },

  /* 什么时候用横向树：触屏，或窄窗口（和 CSS 的 900px 断点对齐） */
  isMobile() {
    const touch = (typeof IS_TOUCH !== 'undefined') && !!IS_TOUCH;
    return touch || (window.innerWidth || 0) < 900;
  },

  /* nodes: [{ id, req: [id...] }]
   * 返回 { pos:{id:{c,r}}, edges:[[父,子]], W, H, G, rows, bands } */
  layout(nodes, opt) {
    /* 只认几何字段。cfg 里还有 tile/cls/onPick 这些回调，
     * 整包 Object.assign 会把数字 G.tile 换成函数，坐标就全成 NaN 了。 */
    const o = opt || {};
    const G = Object.assign({}, this.G);
    ['tile', 'colW', 'rowH', 'pad', 'maxCols'].forEach(k => {
      if (typeof o[k] === 'number') G[k] = o[k];
    });
    const list = nodes || [];
    if (!list.length) return { pos: {}, edges: [], W: 0, H: 0, G, rows: 0, bands: 1 };

    const byId = Object.create(null);
    list.forEach(n => { byId[n.id] = n; });

    /* ---- 1. 依赖深度 = 列号。取「最长路径」而不是最短，
     *         否则支线会跟主干挤到同一列，看起来像没有前置关系。
     *         如果调用方直接给了 col（术法树就是固定三列），以给的为准。 ---- */
    const depth = Object.create(null);
    const explicitCol = list.some(n => n.col != null);
    const walk = (id, guard) => {
      if (depth[id] != null) return depth[id];
      const n = byId[id];
      if (!n || guard > 80) return (depth[id] = 0);          // guard：数据写错成环时不炸
      const reqs = (n.req || []).filter(r => byId[r]);
      if (!reqs.length) return (depth[id] = 0);
      let d = 0;
      for (const r of reqs) d = Math.max(d, walk(r, guard + 1) + 1);
      return (depth[id] = d);
    };
    if (explicitCol) list.forEach(n => { depth[n.id] = n.col || 0; });
    else list.forEach(n => walk(n.id, 0));

    const maxD = list.reduce((a, n) => Math.max(a, depth[n.id]), 0);
    const cols = [];
    for (let i = 0; i <= maxD; i++) cols.push([]);
    list.forEach((n, i) => cols[depth[n.id]].push({ id: n.id, i }));

    /* ---- 1.5 完全没有前置关系的节点（协同系的隐藏星位就是这种）
     *         全落在第 0 列会排成一条竖线，一屏放不下还得竖着拖。
     *         直接按接近正方形的网格铺开。 ---- */
    if (list.every(n => !(n.req || []).length)) {
      const per = Math.min(list.length, Math.max(2, Math.ceil(Math.sqrt(list.length * 1.7))));
      const rows = Math.ceil(list.length / per);
      const pos = Object.create(null);
      list.forEach((n, i) => {
        pos[n.id] = { c: i % per, r: Math.floor(i / per) };
      });
      return {
        pos, edges: [], G, rows, bands: 1,
        W: G.pad * 2 + (Math.min(per, list.length) - 1) * G.colW + G.tile,
        H: G.pad * 2 + (rows - 1) * G.rowH + G.tile
      };
    }

    /* ---- 2. 列内行号：先按父节点所在行的均值排序（减少交叉），
     *         再逐个下推保证同列不重叠 ---- */
    const row = Object.create(null);
    cols.forEach((arr, c) => {
      if (c === 0) { arr.forEach((e, k) => { row[e.id] = k; }); return; }
      arr.forEach(e => {
        const reqs = (byId[e.id].req || []).filter(r => row[r] != null);
        e.want = reqs.length ? reqs.reduce((a, r) => a + row[r], 0) / reqs.length : 1e6;
      });
      arr.sort((a, b) => (a.want - b.want) || (a.i - b.i));
      let used = -1;
      arr.forEach(e => {
        const r = Math.max(e.want === 1e6 ? 0 : Math.round(e.want), used + 1);
        row[e.id] = r;
        used = r;
      });
    });
    /* 调用方指定了行就以指定的为准（术法树按岔口序号排行） */
    list.forEach(n => { if (n.row != null) row[n.id] = n.row; });

    /* ---- 3. 太长的链折成多段。通用系是 30 个节点的单链，
     *         一条直线会拉出 2800px，折成 6 列 × 5 段刚好一屏半。
     *         奇数段反向走（蛇形），换行那根线就是「正下方」，
     *         不用横穿整个屏幕去连 —— 否则看起来像两段无关的东西。 */
    const maxRow = list.reduce((a, n) => Math.max(a, row[n.id]), 0) + 1;
    const totalC = maxD + 1;
    const bands = Math.ceil(totalC / G.maxCols);
    const pos = Object.create(null);
    list.forEach(n => {
      const d = depth[n.id];
      const band = bands > 1 ? Math.floor(d / G.maxCols) : 0;
      let c = d;
      if (bands > 1) {
        c = d % G.maxCols;
        if (band % 2 === 1) c = G.maxCols - 1 - c;
      }
      pos[n.id] = { c, r: row[n.id] + band * maxRow };
    });

    const usedCols = Math.min(totalC, G.maxCols);
    const rows = maxRow * bands;
    const W = G.pad * 2 + (usedCols - 1) * G.colW + G.tile;
    const H = G.pad * 2 + (rows - 1) * G.rowH + G.tile;

    const edges = [];
    list.forEach(n => (n.req || []).forEach(r => { if (byId[r]) edges.push([r, n.id]); }));

    return { pos, edges, W, H, G, rows, bands };
  },

  /* 渲染到 host。
   * cfg = {
   *   nodes, sel, tile(node)->html, cls(node)->'locked max …',
   *   onPick(id), resetScroll
   * }
   * 返回 layout 结果（调用方偶尔要拿去量尺寸） */
  render(host, cfg) {
    if (!host) return null;
    cfg = cfg || {};
    const L = this.layout(cfg.nodes, cfg);
    const G = L.G;
    if (!cfg.nodes || !cfg.nodes.length) { host.innerHTML = ''; return L; }

    const keepX = cfg.resetScroll ? 0 : host.scrollLeft;
    const keepY = cfg.resetScroll ? 0 : host.scrollTop;
    const cx = id => G.pad + L.pos[id].c * G.colW + G.tile / 2;
    const cy = id => G.pad + L.pos[id].r * G.rowH + G.tile / 2;

    /* 连线：正交折线（右 → 中缝 → 下 → 子节点左沿）。
     * 折行段（子节点在父节点左边）改走「父节点底部 → 下 → 左」。
     * 用 SVG 而不是 div 边框，是因为一条主线要连两个分支，div 画不出分叉。 */
    const paths = L.edges.map(([a, b]) => {
      const x1 = cx(a), y1 = cy(a), x2 = cx(b), y2 = cy(b);
      const sx = x1 + G.tile / 2, ex = x2 - G.tile / 2;
      const cls = (cfg.edgeCls && cfg.edgeCls(a, b)) || '';
      const attr = cls ? ` class="${cls}"` : '';
      /* 蛇形折行的换行处：父子同一列，一根竖线连到底就行 */
      if (Math.abs(x2 - x1) < 2) return `<path${attr} d="M${x1} ${y1 + G.tile / 2}V${y2 - G.tile / 2}"/>`;
      if (ex > sx + 6) {
        const mx = (sx + ex) / 2;
        return `<path${attr} d="M${sx} ${y1}H${mx}V${y2}H${ex}"/>`;
      }
      /* 子节点在父节点左边（蛇形段的内部）：从父底部下到子所在行，再左折到子右沿 */
      return `<path${attr} d="M${x1} ${y1 + G.tile / 2}V${y2}H${ex}"/>`;
    });

    const tiles = cfg.nodes.map(n => {
      const p = L.pos[n.id];
      const cls = ['mt-nd'];
      const extra = cfg.cls ? (cfg.cls(n) || '') : '';
      if (extra) cls.push(extra);
      if (cfg.sel === n.id) cls.push('sel');
      return `<button type="button" class="${cls.join(' ').replace(/\s+/g, ' ').trim()}"
        data-mtid="${n.id}"
        style="left:${G.pad + p.c * G.colW}px;top:${G.pad + p.r * G.rowH}px;width:${G.tile}px;height:${G.tile}px"
        >${cfg.tile ? cfg.tile(n) : ''}</button>`;
    }).join('');

    host.innerHTML = `<div class="mt-canvas" style="width:${L.W}px;height:${L.H}px">
      <svg class="mt-lines" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" aria-hidden="true">${
      paths.join('')}</svg>${tiles}</div>`;

    /* 重画会换掉整个 DOM，滚动位置要手动还回去 —— 否则每点一个节点，
     * 横向滚动条都会弹回最左边，点第三列以后根本没法用 */
    host.scrollLeft = keepX;
    host.scrollTop = keepY;

    if (cfg.onPick) {
      host.querySelectorAll('[data-mtid]').forEach(b => {
        b.addEventListener('click', () => cfg.onPick(b.dataset.mtid));
      });
    }
    return L;
  }
};
