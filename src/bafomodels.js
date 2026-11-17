/* ============================================================
 * bafomodels.js —— 八部天龙九套程序化骨架（M7.5）
 * ------------------------------------------------------------
 * 为什么单独一个文件（和 M18.6 的 wbmodels.js 同一个理由）：
 *   actors.js 已经 1306 行、20 个 kind 分支。再塞九套「每套 100 行」的
 *   骨架进去，那个文件就没人看得懂了。这里只放**八部天龙专属**的建模
 *   与动画，通过 `buildMonster` 开头的一行分派接进去：
 *     if (BafoModels.has(kind)) return BafoModels.build(kind, cfg);
 *
 * ------------------------------------------------------------
 * 三条硬约定（和 wbmodels 完全一致，违反任意一条都会出「模型和逻辑分家」）：
 *
 * 【一】1 单位 = 1 米，`group.scale = 1`。
 *   数据里的 `scale: 2.3~2.8` 是给「2 米人形 × scale」用的旧口径。
 *   九套骨架直接按**真实米数**建（帝释 7.2 米、无相真身 11.5 米），
 *   再乘一次 2.5 会变成 18 米穿出副本图（副本图只有 140 见方）。
 *   所以 build 返回的 actor 带 `noAutoScale: true`，`buildMonster` 末尾
 *   会跳过 `setScalar(s)`。
 *
 * 【二】`parts.torso` 必须是**内层 group**，不能是根 group。
 *   `updateActorAnim` 会无条件写 `P.torso.position`，若它指向根节点，
 *   等于把 `updateEnemies` 每帧同步过来的世界坐标抹掉 ——
 *   表现是「逻辑坐标已经走远、模型钉在出生点」。
 *
 * 【三】碰撞半径不等于包围盒半径。
 *   金翅展开的翼展 5 米、阿修罗的巨盾甩出去 2 米，量包围盒会得到 3 米半径，
 *   玩家得站 3 米外，战士 reach 3.2 勉强够得到但会被分离逻辑一路往外推。
 *   所以每只都给 `a.footR`（「身子有多粗」），`game.js` 用它当上限。
 *
 * ------------------------------------------------------------
 * 九只的剪影必须一眼分得开（这是 M7.5 的唯一验收标准）：
 *   帝释   = 背后的光轮 + 六只**不接肩**的悬浮臂（唯一有光轮的人形）
 *   难陀   = 贴地盘两圈的蛇身 + 一根竖起的龙颈（唯一没有腿的人形站位）
 *   毗沙   = 四臂 + 白色骨面 + 肩甲炸开的尖刺（唯一「骨面」）
 *   乾闼婆 = 没有脚、下身是雾、三条飘带（唯一悬浮 + 唯一飘带）
 *   罗睺   = 三颗头 + 六臂 + 一面比自己还高的盾（唯一三头）
 *   金翅   = 人形上身接鸟爪 + 五米翼展 + 扇形尾羽（唯一有翅膀）
 *   紧那罗 = 鹿角 + 竖琴 + 马首 + 四节马腿（唯一有角有蹄）
 *   摩睺罗迦 = 三条巨蟒缠在身上 + 头顶炸开一圈小蛇（唯一「身上有活物」）
 *   无相真身 = 十一米半、八臂、八首环绕公转、没有脸（唯一无面）
 *
 * ------------------------------------------------------------
 * 动画不走通用的「走路摆臂」。
 *   `updateActorAnim` 开头按 `a.bafoModel` 分派到 `BafoModels.anim`，
 *   每只的动作曲线在下面各自一段 —— 光轮要转、蛇要游、翅膀要开合、
 *   八首要公转，这些塞进 `walk/idle` 里没有任何意义。
 * ============================================================ */

const BafoModels = {
  /* 分派键 = 数据里的 `animKind`（data-monsters.js 的八部条目）。
   * 第九个 `chaosTrue` 是终 boss P5 的变身形态，没有独立的 BOSSES 条目，
   * 由 M7.6 在变身时按名字直接取。 */
  KEYS: ['deva', 'naga', 'yaksa', 'gandharva', 'asura', 'garuda', 'kimnara', 'mahoraga', 'chaosTrue'],

  /* 每只的碰撞半径（「身子有多粗」，不是包围盒）。
   * 和 wbmodels 的 `body.radius` 同一个用途，只是这里写死在骨架里 ——
   * 八部条目在 data-monsters 里已经很长了，再加一个 body 块只为了一个数。 */
  FOOT: {
    deva: 1.75, naga: 1.95, yaksa: 1.70, gandharva: 1.55, asura: 2.00,
    garuda: 2.10, kimnara: 1.70, mahoraga: 2.05, chaosTrue: 2.60
  },

  _data: null,
  _index() {
    if (this._data) return this._data;
    const m = {};
    if (typeof BOSSES !== 'undefined') {
      for (const id in BOSSES) {
        const c = BOSSES[id];
        if (c && c.animKind) m[c.animKind] = c;
      }
      /* 无相真身没有自己的条目，颜色沿用 `chaos` —— 它是同一个存在的第二形态，
       * 变身时不该突然换一套配色（玩家要认得出「还是它」）。 */
      if (BOSSES.chaos && !m.chaosTrue) m.chaosTrue = BOSSES.chaos;
    }
    this._data = m;
    return m;
  },

  has(name) { return this.KEYS.indexOf(name) >= 0; },
  dataOf(name) { return this._index()[name] || null; },

  /* ============================================================
   * 建模型
   * ============================================================ */
  build(name, opts = {}) {
    const d = this.dataOf(name) || {};
    const g = new THREE.Group();
    const a = {
      group: g, mats: [], parts: {}, bafoModel: name, animKind: name,
      noAutoScale: true
    };
    /* 数据里的颜色优先；opts 是 buildMonster 透传的同一份，兜底用 */
    const cfg = {
      color: d.color !== undefined ? d.color : opts.color,
      cloth: d.cloth !== undefined ? d.cloth : opts.cloth,
      skin: d.skin !== undefined ? d.skin : opts.skin
    };
    const fn = this['_build_' + name];
    if (typeof fn !== 'function') return null;
    fn.call(this, a, cfg, d);

    /* 把所有 mesh 的材质补进 `mats`。**不要指望每个 builder 手写 reg** ——
     * 九只加起来四百多个 mesh，手写必漏；受击闪白、死亡淡出、
     * `disposeTree` 只认这张表，漏一个就是「打它不闪」。 */
    a.group.traverse(o => {
      if (o.isMesh && o.material && a.mats.indexOf(o.material) < 0) a.mats.push(o.material);
    });
    a.footR = this.FOOT[name] || 1.8;
    return a;
  },

  /* ============================================================
   * 通用零件（和 wbmodels 同名同义，别在这里改语义）
   * ============================================================ */

  /* 两点之间的一节「管子」，半径从 r0 渐变到 r1。蛇身 / 颈 / 尾都是这么拼的 ——
   * 用圆柱不用 box：五米粗的时候方盒子一眼假。 */
  _tube(root, mat, p0, p1, r0, r1, seg = 8) {
    const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = dir.length() || 0.001;
    const m = mesh(cylGeo(r1, r0, len, seg), mat,
      (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, root);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  },

  _joint(root, mat, p, r, seg = 7) {
    return mesh(sphGeo(r, seg), mat, p[0], p[1], p[2], root);
  },

  _eye(root, x, y, z, r, color = 0xffd040, ei = 1.9) {
    const mat = new THREE.MeshStandardMaterial({
      color: color, emissive: color, emissiveIntensity: ei,
      roughness: 0.32, metalness: 0, flatShading: true
    });
    return mesh(sphGeo(r, 6), mat, x, y, z, root);
  },

  /* 一片「尖」。肩甲刺 / 背鳍 / 尾羽 / 高冠全是它，只是缩放不同。
   * 用 4 面锥（不是 6 面）—— 骨质的刺要有棱角，圆一点就像塑料。 */
  _spike(root, mat, p, r, h, rot = [0, 0, 0], seg = 4) {
    const m = mesh(coneGeo(r, h, seg), mat, p[0], p[1], p[2], root);
    m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  },

  /* 一条多节「带子」（飘带 / 蟒身 / 蛇冠）。
   * ------------------------------------------------------------
   * **逐节嵌套，且节点的原点必须在「近端关节」**。两条都错不了：
   *
   *   关节 J0 … Jn，第 i 段是 J_i → J_{i+1}。
   *   nodes[i] 的原点 = J_i（i=0 时相对 root 写绝对坐标，其余写相对上一节的位移），
   *   里面装着「从 J_i 画到 J_{i+1}」的那根管子，以及**下一节节点**。
   *
   * 这样 `nodes[i].rotation` 才是「从第 i 个关节弯，后面整条跟着走」。
   *
   * 第一版错了两处，症状是「飘带散成一截一截的棍子」：
   *   ① 所有节做成 root 的同级子节点 —— 转一节，别的节纹丝不动；
   *   ② 改嵌套时又把原点放在**远端** —— 转第一节等于把整条带子
   *      从它附着在身上的那一点掰下来，接头处一样会断。
   *
   * `nodes` 长度是 n+1，`nodes[n]` 是**末端的空节点**（挂蛇头 / 尾饰用）。
   * anim 里只写 rotation，**不要写 position**：position 是「相对上一节」的
   * 长度，写一次整条带子就会被拉长或缩回原点。
   */
  _chain(root, mat, pts, r0, r1, seg = 6) {
    const n = pts.length - 1;
    const nodes = [];
    let parent = root;
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = (i + 1) / n;
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      const dz = pts[i + 1][2] - pts[i][2];
      const g = new THREE.Group();
      if (i === 0) {
        g.position.set(pts[0][0], pts[0][1], pts[0][2]);        // 相对 root 的绝对位置
      } else {
        g.position.set(pts[i][0] - pts[i - 1][0],
          pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); // 相对上一关节
      }
      parent.add(g);
      this._tube(g, mat, [0, 0, 0], [dx, dy, dz],
        r0 + (r1 - r0) * k0, r0 + (r1 - r0) * k1, seg);
      /* **不补关节球**：逐节嵌套之后，相邻两节的管子共用同一个端点，
       * 本来就没有缝。补球在弯角小（anim 里最大 0.10 弧度）时纯属浪费 ——
       * 三条蟒 + 五条冠蛇会因此多出 60 多个 mesh（一只 Boss 199 个，
       * 直接顶穿单只 140 的预算）。 */
      nodes.push(g);
      parent = g;
    }
    /* 末端的空节点：位置 = 最后一段的位移，用来挂头 / 尾饰 */
    const tip = new THREE.Group();
    tip.position.set(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1], pts[n][2] - pts[n - 1][2]);
    parent.add(tip);
    nodes.push(tip);
    return nodes;
  },

  /* ============================================================
   * 人形底座。帝释 / 毗沙 / 罗睺 / 金翅 / 紧那罗 共用
   * ------------------------------------------------------------
   * 只做「腿 + 躯干 + 颈 + 头 + 肩点」，**不做手臂** —— 手臂是每只的
   * 身份特征（六只悬浮 / 四只 / 六只 / 两只带翼 / 两只持琴），
   * 统一做反而每只都要拆掉重来。
   *
   * 返回 { torso, headG, hipY, shoulderY, shoulderX } 给 builder 挂件用。
   * ============================================================ */
  _body(a, cfg, o = {}) {
    const O = Object.assign({
      hipY: 2.55, torsoH: 2.15, torsoW: 1.45, torsoD: 0.92,
      headR: 0.60, neckH: 0.32, legSeg: 2, legR: 0.27, footR: 0.34
    }, o);
    const g = a.group;
    const skinM = reg(a, M(cfg.skin, { rough: 0.72 }));
    const clothM = reg(a, M(cfg.cloth, { rough: 0.88 }));
    const trimM = reg(a, M(cfg.color, { rough: 0.42, metal: 0.45 }));

    /* 躯干：内层 group（约定二），原点在胯部高度 */
    const torso = new THREE.Group();
    torso.position.y = O.hipY;
    g.add(torso);
    a.parts.torso = torso;

    /* 胯 → 腰 → 胸 → 肩，四段收放。人形要「肩宽腰细」，
     * 一段圆柱看不出是个人 —— 这是第一版看起来像「方块娃娃」的主因。 */
    mesh(boxGeo(O.torsoW * 0.80, 0.46, O.torsoD * 0.84), clothM, 0, 0.06, 0, torso);
    mesh(boxGeo(O.torsoW * 0.66, 0.44, O.torsoD * 0.72), skinM, 0, 0.50, 0, torso);   // 收腰
    const chest = mesh(boxGeo(O.torsoW, O.torsoH * 0.50, O.torsoD), clothM, 0, 1.10, 0, torso);
    a.parts.chest = chest;
    /* 腰带 + 胸口纹 + 领口：三个薄片，成本极低，但「古风甲胄」全靠它们
     * 把方块切成「甲片」。去掉这三片就是第一版那种光板身子。 */
    mesh(boxGeo(O.torsoW * 0.88, 0.18, O.torsoD * 0.98), trimM, 0, 0.32, 0, torso);
    mesh(boxGeo(O.torsoW * 0.54, 0.58, 0.07), trimM, 0, 1.10, O.torsoD * 0.52, torso);
    const collar = mesh(torusGeo(O.torsoW * 0.30, 0.075, 6, 12), trimM, 0, 1.44, 0, torso);
    collar.rotation.x = Math.PI * 0.5;
    /* 两侧肋甲：把胸口的方角磨掉 */
    for (const sx of [-1, 1]) {
      const side = mesh(boxGeo(0.14, O.torsoH * 0.42, O.torsoD * 0.90), trimM,
        sx * O.torsoW * 0.52, 1.10, 0, torso);
      side.scale.set(1, 1, 0.96);
    }

    const shoulderY = O.torsoH * 0.62;
    const shoulderX = O.torsoW * 0.56;

    /* 腿：两节（大腿 / 小腿）+ 靴。第一版腿细 0.20，站在 1.6 宽的躯干下
     * 像两根筷子 —— 0.27 才撑得住上面的重量感。 */
    a.parts.legs = [];
    if (O.legSeg > 0) {
      for (const sx of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(sx * O.torsoW * 0.27, 0, 0);
        torso.add(leg);
        const upper = mesh(boxGeo(O.legR * 2, O.hipY * 0.52, O.legR * 2), skinM, 0, -O.hipY * 0.26, 0, leg);
        const lower = mesh(boxGeo(O.legR * 1.72, O.hipY * 0.50, O.legR * 1.72), clothM, 0, -O.hipY * 0.75, 0, leg);
        mesh(boxGeo(O.legR * 2.3, O.footR * 0.8, O.footR * 2.5), clothM, 0, -O.hipY * 0.99, O.footR * 0.42, leg);
        /* 膝甲：一个小方块，腿就从「圆柱」变成「有节」 */
        mesh(boxGeo(O.legR * 1.9, 0.16, O.legR * 1.9), trimM, 0, -O.hipY * 0.52, O.legR * 0.5, leg);
        a.parts.legs.push({ g: leg, sx: sx, upper: upper, lower: lower });
      }
    }

    /* 颈 + 头。**坐标是相对 torso 的**：torso 自己已经站在 `hipY` 上，
     * 这里再写一次 `hipY` 就是算了两次 —— 头会飘在躯干上方三米，
     * 而 `measureFootR` / 血条 / 名贴全按「头顶高度」算，一起错。
     * （M7.5 第一版就是这么错的，探针一量高度 9.3 米才露出来。） */
    const headG = new THREE.Group();
    headG.position.y = O.torsoH * 0.62 + O.neckH;
    torso.add(headG);
    mesh(cylGeo(O.headR * 0.44, O.headR * 0.54, O.neckH * 2, 6), skinM, 0, -O.neckH * 0.6, 0, headG);
    const head = mesh(sphGeo(O.headR, 7), skinM, 0, O.headR * 0.52, 0, headG);
    head.scale.set(0.94, 1.06, 0.98);
    a.parts.headG = headG;
    a.parts.head = head;

    return { torso, headG, head, hipY: O.hipY, shoulderY, shoulderX, skinM, clothM, trimM, O };
  },

  /* 一条手臂（肩甲 + 上臂 + 肘 + 前臂 + 手）。
   * ------------------------------------------------------------
   * `splay` 是**向外张开的角度**（弧度），必须给正值，方向由 sx 决定。
   * 第一版六只臂全部垂在身侧、splay 只有 0.1~0.2，六条白板糊成一片 ——
   * 「六臂」在剪影上完全看不出来。张开 0.55 以上才数得清有几条。
   * 上臂给甲色、前臂给肤色：整条都是肤色的手臂会读成「裸的」。 */
  _arm(parent, mats, o = {}) {
    const O = Object.assign({
      x: 0, y: 0, z: 0, len: 1.30, r: 0.20, sx: 1, splay: 0.55, swing: 0.06,
      matUpper: null, matFore: null, pauldron: true
    }, o);
    const upM = O.matUpper || mats.clothM;
    const foM = O.matFore || mats.skinM;
    const g = new THREE.Group();
    g.position.set(O.x, O.y, O.z);
    parent.add(g);
    if (O.pauldron) {
      const pd = mesh(sphGeo(O.r * 2.05, 6), upM, 0, 0.04, 0, g);
      pd.scale.set(1, 0.82, 1);
    }
    mesh(boxGeo(O.r * 1.85, O.len, O.r * 1.85), upM, 0, -O.len * 0.5, 0, g);
    const elbow = new THREE.Group();
    elbow.position.y = -O.len;
    g.add(elbow);
    mesh(sphGeo(O.r * 1.10, 6), foM, 0, 0, 0, elbow);
    mesh(boxGeo(O.r * 1.58, O.len * 0.95, O.r * 1.58), foM, 0, -O.len * 0.48, 0, elbow);
    const hand = new THREE.Group();
    hand.position.y = -O.len * 0.96;
    elbow.add(hand);
    mesh(sphGeo(O.r * 1.25, 6), foM, 0, 0, 0, hand);
    g.rotation.z = O.sx * O.splay;
    g.rotation.x = O.swing;
    return { g: g, upper: g.children[1], fore: elbow, hand: hand };
  },

  /* ============================================================
   * 1. 帝释·持杵天主 —— 背光轮 + 六只悬浮臂 + 金刚杵
   * ============================================================ */
  _build_deva(a, cfg, d) {
    const B = this._body(a, cfg, { hipY: 2.75, torsoH: 2.35, torsoW: 1.5, torsoD: 0.94, headR: 0.62 });
    const gold = reg(a, M(0xffd878, { rough: 0.30, metal: 0.65, emissive: 0x8a5c00, ei: 0.55 }));
    const robeM = reg(a, M(cfg.cloth, { rough: 0.9 }));

    /* 背光轮：立在背后的大环 + 一圈短辐。**y 是相对 torso 的**（别再加 hipY）。
     * 它是帝释唯一的「光源」，用自发光材质，anim 里整圈旋转。 */
    const halo = new THREE.Group();
    halo.position.set(0, 1.85, -0.62);
    B.torso.add(halo);
    const ring = mesh(torusGeo(1.70, 0.09, 8, 28), gold, 0, 0, 0, halo);
    for (let i = 0; i < 12; i++) {
      const ang = i / 12 * Math.PI * 2;
      const sp = mesh(boxGeo(0.07, 0.42, 0.07), gold,
        Math.cos(ang) * 1.86, Math.sin(ang) * 1.86, 0, halo);
      sp.rotation.z = ang - Math.PI * 0.5;
    }
    a.parts.halo = halo;
    a.parts.haloRing = ring;

    /* 六只**悬浮**手臂：三对，不接肩 —— 这是帝释的剪影签名。
     * 三对的张开角度递进（0.55 / 0.95 / 1.35），剪影上才数得出「三对」；
     * 第一版六条全垂着、角度只差 0.1，看起来就是一整块白板。 */
    a.parts.arms = [];
    const rows = [
      { y: 1.50, x: 0.98, len: 1.24, splay: 0.55 },
      { y: 1.02, x: 1.16, len: 1.36, splay: 0.95 },
      { y: 0.58, x: 1.02, len: 1.22, splay: 1.35 }
    ];
    for (let r = 0; r < rows.length; r++) {
      for (const sx of [-1, 1]) {
        const arm = this._arm(B.torso, B, {
          x: sx * rows[r].x, y: rows[r].y, z: 0.04 + r * 0.05,
          len: rows[r].len, r: 0.17, sx: sx, splay: rows[r].splay
        });
        a.parts.arms.push({
          g: arm.g, hand: arm.hand, sx: sx, row: r, fore: arm.fore,
          ph: r * 1.7 + (sx > 0 ? 0 : 0.85), base: 0
        });
      }
    }

    /* 金刚杵：右上那只握着，并且把那条臂抬起来 —— 握在身侧的话
     * 杵会插进大腿里，剪影上完全看不见（第一版就是这样）。 */
    const topRight = a.parts.arms[1];
    topRight.base = -1.05;
    const vajra = new THREE.Group();
    vajra.position.y = -0.10;
    vajra.rotation.x = 1.05;                 // 跟着抬起的手腕转成「竖握」
    topRight.hand.add(vajra);
    mesh(cylGeo(0.075, 0.075, 1.5, 6), gold, 0, 0, 0, vajra);
    for (const sy of [-1, 1]) {
      mesh(sphGeo(0.19, 6), gold, 0, sy * 0.78, 0, vajra);
      for (let i = 0; i < 5; i++) {
        const ang = i / 5 * Math.PI * 2;
        const prong = mesh(coneGeo(0.045, 0.46, 4), gold,
          Math.cos(ang) * 0.13, sy * 1.02, Math.sin(ang) * 0.13, vajra);
        prong.rotation.z = Math.cos(ang) * 0.22;
        prong.rotation.x = -Math.sin(ang) * 0.22;
      }
    }
    a.parts.vajra = vajra;

    /* 天冠：一圈冠带 + 五根上翘的尖。
     * 第一版是三个悬空的圆环 —— 那读起来是「头顶飘着三个呼啦圈」，不是冠。 */
    mesh(cylGeo(0.50, 0.58, 0.26, 8), gold, 0, 0.78, 0, B.headG);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      this._spike(B.headG, gold,
        [Math.cos(ang) * 0.42, 0.96, Math.sin(ang) * 0.42],
        0.075, 0.40, [-Math.sin(ang) * 0.42, 0, Math.cos(ang) * 0.42], 4);
    }
    /* 长袍下摆：从腰垂到脚踝的一圈裙摆（**宽口朝下**）。
     * 第一版锥尖朝下 + 位置偏上，出来是个「灯罩」。 */
    const skirt = mesh(coneGeo(1.18, 2.30, 10), robeM, 0, B.hipY - 0.62, 0, a.group);
    a.parts.skirt = skirt;

    this._eye(B.headG, -0.22, 0.52, 0.58, 0.105, 0xffe8a0, 2.2);
    this._eye(B.headG, 0.22, 0.52, 0.58, 0.105, 0xffe8a0, 2.2);
  },

  /* ============================================================
   * 2. 难陀·盘渊龙众 —— 贴地盘两圈 + 竖起的龙颈，没有腿
   * ============================================================ */
  _build_naga(a, cfg, d) {
    const g = a.group;
    const scaleM = reg(a, M(cfg.color, { rough: 0.62, metal: 0.15 }));
    const bellyM = reg(a, M(cfg.skin, { rough: 0.78 }));
    const finM = reg(a, M(cfg.cloth, { rough: 0.5, emissive: 0x0a2018, ei: 0.4 }));

    const torso = new THREE.Group();
    g.add(torso);
    a.parts.torso = torso;

    /* 盘身：两圈半的螺旋，从半径 2.6 收到 1.0、高度 0.55 → 1.5。
     * 圈间距 0.8、身粗 0.55 —— 盘得下、不互相穿。 */
    const N = 6;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ang = t * Math.PI * 2 * 2.5 - Math.PI * 0.5;
      const r = 2.6 - 1.6 * t;
      pts.push([Math.cos(ang) * r, 0.55 + 0.95 * t, Math.sin(ang) * r]);
    }
    a.parts.coil = [];
    for (let i = 0; i < N; i++) {
      const r0 = 0.58 - 0.16 * (i / N), r1 = 0.58 - 0.16 * ((i + 1) / N);
      const m = this._tube(torso, i % 2 ? bellyM : scaleM, pts[i], pts[i + 1], r0, r1, 8);
      a.parts.coil.push(m);
      this._joint(torso, scaleM, pts[i + 1], r1 * 1.04);
    }

    /* 背鳍：沿盘身外缘 10 片，朝外朝上 —— 这是「龙」不是「蛇」的关键 */
    a.parts.fins = [];
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      const ang = t * Math.PI * 2 * 2.5 - Math.PI * 0.5;
      const r = 2.6 - 1.6 * t;
      const sp = this._spike(torso, finM,
        [Math.cos(ang) * (r + 0.42), 0.55 + 0.95 * t + 0.34, Math.sin(ang) * (r + 0.42)],
        0.26, 0.86, [0.55, -ang, 0], 4);
      sp.scale.set(1, 1, 0.45);
      a.parts.fins.push(sp);
    }

    /* 盘尾 → 颈根：一段过渡。**这一段不能省** —— 盘的最后一个点在半径 1.0 上，
     * 颈根在圆心，中间空着的话整根颈是浮空的（第一版截图里一眼就看出来了）。 */
    this._tube(torso, scaleM, pts[N], [0, 1.5, 0], 0.42, 0.50, 8);

    /* 颈：从盘心竖起到 4.6 米，三节，每节略前倾（龙首朝玩家） */
    const neckPts = [[0, 1.5, 0]];
    let prev = neckPts[0];
    for (let i = 0; i < 3; i++) {
      const nxt = [prev[0] + 0.10 * (i + 1), prev[1] + 1.05, prev[2] + 0.22 * (i + 1)];
      neckPts.push(nxt); prev = nxt;
    }
    a.parts.neck = [];
    for (let i = 0; i < 3; i++) {
      this._tube(torso, scaleM, neckPts[i], neckPts[i + 1], 0.46 - i * 0.08, 0.46 - (i + 1) * 0.08, 8);
      a.parts.neck.push(this._joint(torso, bellyM, neckPts[i + 1], (0.46 - (i + 1) * 0.08) * 1.05));
    }

    /* 龙首：长吻 + 上下颚 + 双角 + 双须 */
    const headG = new THREE.Group();
    headG.position.set(neckPts[3][0], neckPts[3][1] + 0.30, neckPts[3][2]);
    torso.add(headG);
    const skull = mesh(boxGeo(0.72, 0.56, 0.86), scaleM, 0, 0, 0, headG);
    const snout = mesh(boxGeo(0.52, 0.34, 0.78), scaleM, 0, -0.12, 0.72, headG);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.28, 0.34);
    headG.add(jaw);
    mesh(boxGeo(0.46, 0.18, 0.70), bellyM, 0, 0, 0.34, jaw);
    a.parts.jaw = jaw;
    a.parts.headG = headG;
    a.parts.head = skull;
    for (const sx of [-1, 1]) {
      this._spike(headG, finM, [sx * 0.30, 0.34, -0.12], 0.09, 0.62, [-0.5, 0, sx * 0.35], 4);
      /* 龙须：两根细长的管子往后飘 */
      this._chain(headG, finM,
        [[sx * 0.34, -0.10, 0.50], [sx * 0.52, -0.06, 0.10], [sx * 0.62, 0.10, -0.40]],
        0.035, 0.02, 4);
    }
    this._eye(headG, -0.30, 0.10, 0.44, 0.085, 0x9cf0d8, 2.2);
    this._eye(headG, 0.30, 0.10, 0.44, 0.085, 0x9cf0d8, 2.2);
  },

  /* ============================================================
   * 3. 毗沙·四臂鬼将 —— 四臂 + 白色骨面 + 肩甲尖刺
   * ============================================================ */
  _build_yaksa(a, cfg, d) {
    const B = this._body(a, cfg, { hipY: 2.55, torsoH: 2.15, torsoW: 1.62, torsoD: 1.00, headR: 0.56 });
    const boneM = reg(a, M(0xe6e0cc, { rough: 0.55 }));
    const ironM = reg(a, M(cfg.cloth, { rough: 0.42, metal: 0.55 }));
    const glowM = reg(a, M(0xff5a3c, { rough: 0.4, emissive: 0xff3010, ei: 1.5 }));

    /* 骨面：一整块白色面具盖住脸，只有两个黑洞 + 两排獠牙。
     * 这是它唯一的识别点 —— 别的魔将都有「脸」，它没有。 */
    const mask = mesh(boxGeo(0.78, 0.86, 0.30), boneM, 0, 0.34, 0.42, B.headG);
    mask.scale.set(1, 1.1, 1);
    for (const sx of [-1, 1]) {
      mesh(boxGeo(0.19, 0.13, 0.10), glowM, sx * 0.20, 0.46, 0.58, B.headG);
      for (let i = 0; i < 3; i++) {
        this._spike(B.headG, boneM, [sx * (0.10 + i * 0.07), 0.02 - i * 0.03, 0.56], 0.035, 0.20, [Math.PI, 0, 0], 4);
      }
    }
    a.parts.mask = mask;

    /* 肩甲 + 尖刺：每肩三根，朝外朝后炸开 */
    a.parts.spikes = [];
    for (const sx of [-1, 1]) {
      const pad = mesh(boxGeo(0.72, 0.42, 0.86), ironM, sx * 0.86, 1.40, 0, B.torso);
      for (let i = 0; i < 3; i++) {
        const sp = this._spike(B.torso, boneM,
          [sx * (0.98 + i * 0.05), 1.60 + i * 0.06, -0.18 + i * 0.22],
          0.10, 0.62 - i * 0.10, [-0.35 + i * 0.25, 0, sx * 0.85], 4);
        a.parts.spikes.push(sp);
      }
    }

    /* 四臂：上对粗（接肩）、下对细（从肋侧伸出来，位置更低） */
    a.parts.arms = [];
    const rows = [{ y: 1.32, x: 0.90, len: 1.28, r: 0.21, splay: 0.75 },
      { y: 0.74, x: 0.84, len: 1.14, r: 0.17, splay: 1.15 }];
    for (let r = 0; r < rows.length; r++) {
      for (const sx of [-1, 1]) {
        const arm = this._arm(B.torso, B, {
          x: sx * rows[r].x, y: rows[r].y, z: 0, len: rows[r].len, r: rows[r].r,
          sx: sx, splay: rows[r].splay
        });
        a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: r * 1.9 + (sx > 0 ? 0 : 0.9), row: r, fore: arm.fore });
      }
    }

    /* 鬼将的兵器：上右一把厚背刀，上左一面小盾，下对空手（抓取） */
    const blade = new THREE.Group();
    blade.rotation.x = 0.35;
    a.parts.arms[1].hand.add(blade);
    mesh(boxGeo(0.16, 1.55, 0.46), ironM, 0, -0.62, 0, blade);
    mesh(boxGeo(0.24, 0.18, 0.70), boneM, 0, 0.16, 0, blade);
    mesh(boxGeo(0.05, 1.30, 0.10), boneM, 0, -0.60, 0.24, blade);

    const shield = new THREE.Group();
    shield.position.set(0.14, 0.06, 0.22);
    shield.rotation.set(0.10, -0.55, 0);
    a.parts.arms[0].hand.add(shield);
    const disc = mesh(cylGeo(0.52, 0.52, 0.12, 10), ironM, 0, 0, 0, shield);
    disc.rotation.x = Math.PI * 0.5;
    mesh(sphGeo(0.18, 6), boneM, 0, 0, 0.12, shield);

    /* 腰甲：一圈垂片，把两条腿的上半截切掉，显矮壮 */
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const pl = mesh(boxGeo(0.30, 0.72, 0.08), ironM,
        Math.cos(ang) * 0.66, B.hipY * 0.72, Math.sin(ang) * 0.52, a.group);
      pl.rotation.y = -ang;
    }
  },

  /* ============================================================
   * 4. 乾闼婆·弦歌乐神 —— 悬浮、没有脚、三条飘带、琵琶
   * ============================================================ */
  _build_gandharva(a, cfg, d) {
    const B = this._body(a, cfg, {
      hipY: 2.05, torsoH: 1.95, torsoW: 1.18, torsoD: 0.76, headR: 0.52, legSeg: 0
    });
    const silkM = reg(a, M(0xf0e4ff, { rough: 0.55, transparent: true, opacity: 0.82 }));
    const silk2M = reg(a, M(cfg.color, { rough: 0.5, transparent: true, opacity: 0.72 }));
    const luteM = reg(a, M(0x8a5a2a, { rough: 0.6 }));

    /* 无脚：下身收成一段「雾」。三段锥依次收细，最下面几乎透明。 */
    const mist = new THREE.Group();
    mist.position.y = -0.10;
    B.torso.add(mist);
    /* 一个大锥（宽口接腰、尖朝地）+ 三圈渐隐的环。
     * 三段锥叠起来像「钻头」，一圈比一圈淡的环才读成「化开」。 */
    /* 短而宽的锥（腰宽 1.1、高 1.9）+ 三圈渐隐环 + 底缘一圈碎絮。
     * 细高的锥读成「漏斗」，宽而短才读成「裙摆化开」。 */
    const tail = mesh(coneGeo(1.10, 1.90, 12), silkM, 0, -0.95, 0, mist);
    tail.rotation.x = Math.PI;
    tail.material.opacity = 0.5;
    for (let i = 0; i < 3; i++) {
      const ring = mesh(torusGeo(0.86 - i * 0.24, 0.055, 6, 16), silk2M, 0, -0.34 - i * 0.56, 0, mist);
      ring.rotation.x = Math.PI * 0.5;
      ring.material.opacity = 0.45;
    }
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const w = mesh(boxGeo(0.10, 0.34 + (i % 3) * 0.12, 0.06), silk2M,
        Math.cos(ang) * 0.42, -1.86 - (i % 2) * 0.10, Math.sin(ang) * 0.42, mist);
      w.rotation.y = -ang;
      w.material.opacity = 0.4;
    }
    a.parts.mist = mist;

    /* 三条飘带：从背后绕到前面再甩出去，每条约 7 节。
     * anim 里逐节写 rotation 就是「飘」，这是它唯一的动感来源。 */
    a.parts.ribbons = [];
    const paths = [
      [[-0.5, 1.5, -0.2], [-0.95, 1.2, 0.35], [-1.15, 0.7, 0.85], [-1.05, 0.15, 1.15], [-0.8, -0.35, 1.2], [-0.55, -0.75, 0.95], [-0.35, -1.0, 0.6]],
      [[0.5, 1.5, -0.2], [0.98, 1.15, 0.30], [1.20, 0.62, 0.80], [1.10, 0.05, 1.10], [0.85, -0.45, 1.15], [0.58, -0.85, 0.9], [0.36, -1.05, 0.55]],
      [[0, 1.6, -0.5], [0.10, 1.05, -0.95], [0.15, 0.45, -1.25], [0.10, -0.15, -1.35], [0, -0.70, -1.25], [-0.08, -1.1, -1.0], [-0.12, -1.35, -0.7]]
    ];
    for (let i = 0; i < paths.length; i++) {
      const nodes = this._chain(B.torso, i === 1 ? silk2M : silkM, paths[i], 0.10, 0.045, 4);
      a.parts.ribbons.push({ nodes: nodes, ph: i * 1.4 });
    }

    /* 琵琶：抱在左臂前。椭圆音箱 + 直颈 + 四根弦 + 四只轸 */
    const lute = new THREE.Group();
    lute.position.set(-0.72, 0.62, 0.46);
    lute.rotation.set(0.18, 0.42, -0.55);
    B.torso.add(lute);
    const body = mesh(sphGeo(0.52, 8), luteM, 0, 0, 0, lute);
    body.scale.set(1, 1.18, 0.42);
    mesh(cylGeo(0.09, 0.11, 1.05, 6), luteM, 0, 0.86, 0, lute);
    for (let i = 0; i < 4; i++) {
      mesh(boxGeo(0.012, 1.5, 0.012), silkM, -0.13 + i * 0.087, 0.45, 0.09, lute);
      mesh(boxGeo(0.09, 0.07, 0.07), luteM, -0.13 + i * 0.087, 1.22, 0, lute);
    }
    a.parts.lute = lute;

    /* 两条手臂：都往琵琶上搭 —— 乐神的手不该垂着 */
    a.parts.arms = [];
    for (const sx of [-1, 1]) {
      const arm = this._arm(B.torso, B, {
        x: sx * 0.70, y: 1.26, z: 0.06, len: 1.04, r: 0.15, sx: sx, splay: 0.52
      });
      a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: sx > 0 ? 0 : 1.1, row: 0, fore: arm.fore });
    }

    /* 高髻 + 披帛在肩上的两个结 */
    mesh(sphGeo(0.30, 7), reg(a, M(cfg.cloth, { rough: 0.9 })), 0, 0.86, -0.10, B.headG).scale.set(1, 1.35, 1);
    for (const sx of [-1, 1]) {
      mesh(sphGeo(0.14, 6), silk2M, sx * 0.66, 1.42, 0.12, B.torso);
    }
    this._eye(B.headG, -0.18, 0.52, 0.44, 0.055, 0xd8b0ff, 1.8);
    this._eye(B.headG, 0.18, 0.52, 0.44, 0.055, 0xd8b0ff, 1.8);
  },

  /* ============================================================
   * 5. 罗睺·三头阿修罗 —— 三头 + 六臂 + 巨盾 + 高冠
   * ============================================================ */
  _build_asura(a, cfg, d) {
    const B = this._body(a, cfg, { hipY: 2.85, torsoH: 2.45, torsoW: 1.72, torsoD: 1.02, headR: 0.60 });
    const rageM = reg(a, M(0xff4422, { rough: 0.5, emissive: 0xc02000, ei: 1.1 }));
    const ironM = reg(a, M(cfg.cloth, { rough: 0.4, metal: 0.6 }));
    const goldM = reg(a, M(0xd8b060, { rough: 0.32, metal: 0.7 }));

    /* 三头：中间大、两侧小，各自挂在自己的一节短颈上。
     * 侧头往外偏 35° 并略低 —— 三个头并排等高会像「三个球」。 */
    a.parts.heads = [];
    a.parts.heads.push({ g: B.headG, sx: 0, ph: 0 });
    for (const sx of [-1, 1]) {
      const hg = new THREE.Group();
      hg.position.set(sx * 0.86, -0.30, -0.10);
      hg.rotation.set(0, sx * 0.52, sx * -0.16);
      B.headG.add(hg);
      mesh(cylGeo(0.14, 0.18, 0.42, 6), B.skinM, 0, -0.18, 0, hg);
      const h = mesh(sphGeo(0.48, 7), B.skinM, 0, 0.26, 0, hg);
      h.scale.set(0.94, 1.02, 0.96);
      this._eye(hg, -0.16, 0.34, 0.40, 0.055, 0xff6030, 2.2);
      this._eye(hg, 0.16, 0.34, 0.40, 0.055, 0xff6030, 2.2);
      a.parts.heads.push({ g: hg, sx: sx, ph: sx > 0 ? 1.5 : 0.8 });
    }
    /* 中间那颗的眼睛 + 一张咧到耳根的嘴（六颗獠牙） */
    this._eye(B.headG, -0.22, 0.56, 0.50, 0.075, 0xff6030, 2.4);
    this._eye(B.headG, 0.22, 0.56, 0.50, 0.075, 0xff6030, 2.4);
    mesh(boxGeo(0.52, 0.14, 0.12), rageM, 0, 0.18, 0.50, B.headG);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        this._spike(B.headG, reg(a, M(0xf0e8d8, { rough: 0.5 })), [sx * (0.12 + i * 0.08), 0.20, 0.52], 0.030, 0.18, [Math.PI, 0, 0], 4);
      }
    }

    /* 高冠：冠带 + 一圈上翘的尖 + 一根顶针。
     * 第一版是三个悬空的金环 —— 和帝释同一个错，读起来是「飘着三个呼啦圈」。 */
    mesh(cylGeo(0.52, 0.60, 0.30, 8), goldM, 0, 0.80, 0, B.headG);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI * 0.5;
      this._spike(B.headG, goldM,
        [Math.cos(ang) * 0.44, 1.00, Math.sin(ang) * 0.44],
        0.070, 0.42, [-Math.sin(ang) * 0.42, 0, Math.cos(ang) * 0.42], 4);
    }
    this._spike(B.headG, goldM, [0, 1.30, 0], 0.11, 0.60, [0, 0, 0], 4);

    /* 六臂：三对，每对高度递减，最下一对几乎水平张开 */
    a.parts.arms = [];
    const rows = [{ y: 1.42, x: 0.94, len: 1.26, r: 0.21, splay: 0.58 },
    { y: 0.98, x: 1.00, len: 1.34, r: 0.19, splay: 0.92 },
    { y: 0.56, x: 0.90, len: 1.20, r: 0.17, splay: 1.18 }];
    for (let r = 0; r < rows.length; r++) {
      for (const sx of [-1, 1]) {
        const arm = this._arm(B.torso, B, {
          x: sx * rows[r].x, y: rows[r].y, z: 0, len: rows[r].len, r: rows[r].r,
          sx: sx, splay: rows[r].splay
        });
        a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: r * 1.6 + (sx > 0 ? 0 : 0.75), row: r, fore: arm.fore });
      }
    }

    /* 巨盾：比身子还高的一面塔盾，挂在左中臂上。外缘一圈铆钉。 */
    const shield = new THREE.Group();
    shield.position.set(-0.10, 0.10, 0.28);
    shield.rotation.set(0.10, 0.42, 0.06);
    a.parts.arms[2].hand.add(shield);
    mesh(boxGeo(1.55, 2.10, 0.16), ironM, 0, 0, 0, shield);
    mesh(boxGeo(1.68, 0.20, 0.22), goldM, 0, 0.95, 0, shield);
    mesh(boxGeo(1.68, 0.20, 0.22), goldM, 0, -0.95, 0, shield);
    for (let i = 0; i < 8; i++) {
      mesh(sphGeo(0.07, 5), goldM, -0.66 + (i % 4) * 0.44, (i < 4 ? 0.78 : -0.78), 0.12, shield);
    }
    mesh(sphGeo(0.26, 6), rageM, 0, 0, 0.12, shield);
    a.parts.shield = shield;

    /* 右上那把长柄斧：柄 + 双面斧刃 */
    const axe = new THREE.Group();
    axe.rotation.x = 0.30;
    a.parts.arms[1].hand.add(axe);
    mesh(cylGeo(0.075, 0.085, 2.05, 6), ironM, 0, -0.55, 0, axe);
    for (const sx of [-1, 1]) {
      const bl = mesh(coneGeo(0.46, 0.86, 4), goldM, sx * 0.42, -1.24, 0, axe);
      bl.rotation.z = sx * Math.PI * 0.5;
      bl.scale.set(1, 1, 0.30);
    }
    a.parts.axe = axe;
  },

  /* ============================================================
   * 6. 金翅·迦楼罗王 —— 人形上身 + 巨翼 + 鸟爪 + 尾羽
   * ============================================================ */
  _build_garuda(a, cfg, d) {
    const B = this._body(a, cfg, {
      hipY: 2.70, torsoH: 2.30, torsoW: 1.44, torsoD: 0.92, headR: 0.54, legSeg: 0
    });
    const featherM = reg(a, M(cfg.color, { rough: 0.55 }));
    const feather2M = reg(a, M(cfg.cloth, { rough: 0.6 }));
    const beakM = reg(a, M(0xf0c840, { rough: 0.35, metal: 0.4 }));
    const clawM = reg(a, M(0x6a5a3a, { rough: 0.45, metal: 0.5 }));

    /* 鸟爪：两条反关节的腿，三趾朝前、一趾朝后。
     * 没有「脚掌」—— 鹰站在地上是趾尖点地，这一点决定了剪影。 */
    a.parts.claws = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.42, 0, 0);
      B.torso.add(leg);
      mesh(boxGeo(0.26, 1.15, 0.26), feather2M, 0, -0.60, 0.06, leg);
      const shin = new THREE.Group();
      shin.position.set(0, -1.16, 0.12);
      leg.add(shin);
      shin.rotation.x = -0.30;
      mesh(boxGeo(0.30, 1.10, 0.30), clawM, 0, -0.55, 0, shin);
      const ankle = new THREE.Group();
      ankle.position.set(0, -1.08, 0);
      shin.add(ankle);
      for (let i = -1; i <= 1; i++) {
        const toe = mesh(boxGeo(0.17, 0.15, 0.72), clawM, i * 0.21, -0.07, 0.30, ankle);
        toe.rotation.y = i * 0.30;
        this._spike(ankle, clawM, [i * 0.21, -0.10, 0.68], 0.085, 0.34, [Math.PI * 0.55, i * 0.30, 0], 4);
      }
      this._spike(ankle, clawM, [0, -0.06, -0.26], 0.085, 0.34, [-Math.PI * 0.55, 0, 0], 4);
      a.parts.claws.push({ g: leg, sx: sx, shin: shin, ankle: ankle });
    }

    /* 巨翼：每翼三节（上臂 / 前臂 / 翼尖）+ 一排飞羽。
     * 展开时上臂外张 0.55、前臂再外 0.35、翼尖再 0.2 —— 三段递进才像翅膀，
     * 一段直杆张开像晾衣杆。 */
    a.parts.wings = [];
    for (const sx of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(sx * 0.72, 1.42, -0.30);
      B.torso.add(root);
      const upper = new THREE.Group();
      root.add(upper);
      mesh(boxGeo(1.05, 0.20, 0.32), feather2M, sx * 0.53, 0, 0, upper);
      const fore = new THREE.Group();
      fore.position.set(sx * 1.05, 0, 0);
      upper.add(fore);
      mesh(boxGeo(1.10, 0.16, 0.28), featherM, sx * 0.55, 0, 0, fore);
      const tip = new THREE.Group();
      tip.position.set(sx * 1.10, 0, 0);
      fore.add(tip);
      mesh(boxGeo(0.95, 0.13, 0.24), feather2M, sx * 0.48, 0, 0, tip);
      /* 飞羽：沿三节的外缘往下垂一排，越长越靠外 */
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const len = 0.75 + 0.95 * t;
        const par = i < 3 ? upper : (i < 5 ? fore : tip);
        const ox = i < 3 ? sx * (0.22 + i * 0.38) : (i < 5 ? sx * (0.30 + (i - 3) * 0.55) : sx * (0.28 + (i - 5) * 0.50));
        const f = mesh(boxGeo(0.28, len, 0.10), featherM, ox, -len * 0.42, 0.02, par);
        f.rotation.z = sx * (0.10 + t * 0.22);
      }
      a.parts.wings.push({ root: root, upper: upper, fore: fore, tip: tip, sx: sx });
    }

    /* 尾羽：五片扇形，从腰后往后上方甩 */
    a.parts.tail = [];
    for (let i = 0; i < 5; i++) {
      const ang = (i - 2) * 0.30;
      const tg = new THREE.Group();
      tg.position.set(0, 0.18, -0.55);
      tg.rotation.set(-1.15, ang, 0);
      B.torso.add(tg);
      const len = 1.5 - Math.abs(i - 2) * 0.22;
      mesh(boxGeo(0.26, len, 0.08), featherM, 0, -len * 0.45, 0, tg);
      a.parts.tail.push({ g: tg, ph: i * 0.5, i: i });
    }

    /* 两条手臂：金翅是「人形上身 + 鸟」，只有翅膀没有手的话
     * 剪影上就是个「带翅膀的衣架」。手给肤色、上臂给羽色。 */
    a.parts.arms = [];
    for (const sx of [-1, 1]) {
      const arm = this._arm(B.torso, B, {
        x: sx * 0.74, y: 1.30, z: 0.06, len: 1.12, r: 0.17, sx: sx, splay: 0.62
      });
      a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: sx > 0 ? 0 : 1.2, row: 0, fore: arm.fore });
    }

    /* 鹰首：喙 + 头冠（三根上翘的羽） */
    const beak = mesh(coneGeo(0.16, 0.52, 5), beakM, 0, 0.28, 0.52, B.headG);
    beak.rotation.x = Math.PI * 0.52;
    for (let i = 0; i < 3; i++) {
      this._spike(B.headG, featherM, [(i - 1) * 0.12, 0.76, -0.06], 0.075, 0.44 + (i === 1 ? 0.14 : 0), [-0.9, 0, (i - 1) * 0.30], 4);
    }
    this._eye(B.headG, -0.20, 0.54, 0.40, 0.070, 0xffe060, 2.3);
    this._eye(B.headG, 0.20, 0.54, 0.40, 0.070, 0xffe060, 2.3);
  },

  /* ============================================================
   * 7. 紧那罗·鹿鸣乐天 —— 鹿角 + 竖琴 + 马首 + 四节马腿
   * ============================================================ */
  _build_kimnara(a, cfg, d) {
    const B = this._body(a, cfg, {
      hipY: 2.35, torsoH: 2.05, torsoW: 1.26, torsoD: 0.84, headR: 0.50, legSeg: 0
    });
    const antlerM = reg(a, M(0x8a6a3a, { rough: 0.72 }));
    const maneM = reg(a, M(cfg.cloth, { rough: 0.85 }));
    const harpM = reg(a, M(0xc8a050, { rough: 0.34, metal: 0.62 }));
    const hoofM = reg(a, M(0x3a2a1a, { rough: 0.5, metal: 0.35 }));

    /* 马腿四节：大腿 / 小腿 / 跖骨 / 蹄。四节是「马」和「人」的分界线 ——
     * 人腿两节，马腿多一个向后折的跖骨，少一节就变成踮脚的人。 */
    a.parts.legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.36, 0, 0);
      B.torso.add(leg);
      mesh(boxGeo(0.34, 0.90, 0.38), B.skinM, 0, -0.48, 0, leg);
      const knee = new THREE.Group();
      knee.position.set(0, -0.94, 0);
      leg.add(knee);
      knee.rotation.x = 0.46;
      mesh(boxGeo(0.26, 0.78, 0.30), B.skinM, 0, -0.38, 0, knee);
      const hock = new THREE.Group();
      hock.position.set(0, -0.78, 0);
      knee.add(hock);
      hock.rotation.x = -0.82;
      mesh(boxGeo(0.16, 0.62, 0.18), B.skinM, 0, -0.30, 0, hock);
      const hoof = new THREE.Group();
      hoof.position.set(0, -0.62, 0);
      hock.add(hoof);
      mesh(cylGeo(0.21, 0.24, 0.30, 6), hoofM, 0, -0.13, 0.02, hoof);
      a.parts.legs.push({ g: leg, sx: sx, knee: knee, hock: hock, hoof: hoof });
    }

    /* 马首：长吻 + 鬃毛 + 鹿角。
     * 头骨比人长 1.6 倍，吻部往前伸出 0.6 —— 这两条决定了「不是人」。 */
    const headG = B.headG;
    headG.position.y += 0.16;
    mesh(boxGeo(0.42, 0.56, 0.62), B.skinM, 0, 0.30, 0, headG);
    const muzzle = mesh(boxGeo(0.40, 0.40, 0.92), B.skinM, 0, 0.10, 0.66, headG);
    muzzle.rotation.x = 0.26;
    mesh(boxGeo(0.34, 0.12, 0.20), reg(a, M(0x2a2018, { rough: 0.6 })), 0, -0.06, 1.06, headG);
    /* 鬃毛：从额顶到颈后的一排硬片 */
    for (let i = 0; i < 6; i++) {
      const m = mesh(boxGeo(0.10, 0.34 - i * 0.02, 0.22), maneM, 0, 0.72 - i * 0.14, -0.20 - i * 0.10, headG);
      m.rotation.x = -0.35 - i * 0.10;
    }
    a.parts.headG = headG;

    /* 鹿角：每侧一根主干 + 三根分叉。分叉朝上朝外，是「鹿」不是「牛」。 */
    a.parts.antlers = [];
    for (const sx of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(sx * 0.26, 0.72, -0.02);
      headG.add(root);
      root.rotation.set(-0.20, 0, sx * 0.34);
      this._tube(root, antlerM, [0, 0, 0], [sx * 0.10, 0.62, 0], 0.075, 0.045, 5);
      this._tube(root, antlerM, [sx * 0.10, 0.62, 0], [sx * 0.20, 1.05, 0.10], 0.045, 0.022, 5);
      const branches = [[0.30, 0.34, 0.16], [-0.02, 0.50, -0.24], [0.44, 0.10, -0.06]];
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        this._tube(root, antlerM, [sx * 0.10, 0.62, 0], [sx * b[0], 0.62 + b[1], b[2]], 0.032, 0.014, 4);
      }
      a.parts.antlers.push(root);
    }

    /* 竖琴：三角框 + 七根弦，抱在右侧。比琵琶小，是「手持」不是「抱住」。 */
    const harp = new THREE.Group();
    harp.position.set(1.02, 0.94, 0.56);
    harp.rotation.set(0.10, -0.42, 0.22);
    B.torso.add(harp);
    mesh(boxGeo(0.09, 1.15, 0.09), harpM, 0, 0, 0, harp);
    const arm2 = mesh(boxGeo(0.09, 0.62, 0.09), harpM, 0.26, 0.50, 0, harp);
    arm2.rotation.z = -0.72;
    mesh(boxGeo(0.62, 0.10, 0.09), harpM, 0.26, -0.42, 0, harp);
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      mesh(boxGeo(0.010, 0.86 - k * 0.42, 0.010), reg(a, M(0xf0f0e0, { rough: 0.4 })),
        0.08 + k * 0.48, -0.10 + k * 0.28, 0, harp);
    }
    a.parts.harp = harp;

    /* 两条手臂：左按弦、右拨弦 */
    a.parts.arms = [];
    for (const sx of [-1, 1]) {
      const arm = this._arm(B.torso, B, {
        x: sx * 0.72, y: 1.22, z: 0.06, len: 1.02, r: 0.15, sx: sx, splay: 0.40
      });
      a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: sx > 0 ? 0 : 1.3, row: 0, fore: arm.fore });
    }
    this._eye(headG, -0.18, 0.34, 0.30, 0.060, 0xd8f0a0, 2.0);
    this._eye(headG, 0.18, 0.34, 0.30, 0.060, 0xd8f0a0, 2.0);
  },

  /* ============================================================
   * 8. 摩睺罗迦·大蟒腹 —— 三条巨蟒缠身 + 蛇冠 + 无足
   * ============================================================ */
  _build_mahoraga(a, cfg, d) {
    const g = a.group;
    const scaleM = reg(a, M(cfg.color, { rough: 0.66 }));
    const bellyM = reg(a, M(cfg.skin, { rough: 0.8 }));
    const darkM = reg(a, M(cfg.cloth, { rough: 0.9 }));

    const torso = new THREE.Group();
    torso.position.y = 1.95;
    g.add(torso);
    a.parts.torso = torso;

    /* 下身：一段粗盘（不是腿）。蟒腹着地，躯干直接从盘上长出来。 */
    const NB = 12;
    const base = [];
    for (let i = 0; i <= NB; i++) {
      const t = i / NB;
      const ang = t * Math.PI * 2 * 2.0 - Math.PI * 0.5;
      const r = 1.58 - 0.62 * t;
      base.push([Math.cos(ang) * r, 0.30 + 1.18 * t, Math.sin(ang) * r]);
    }
    a.parts.coil = [];
    for (let i = 0; i < NB; i++) {
      const r0 = 0.40 - 0.10 * (i / NB), r1 = 0.40 - 0.10 * ((i + 1) / NB);
      a.parts.coil.push(this._tube(g, i % 2 ? bellyM : scaleM, base[i], base[i + 1], r0, r1, 8));
      this._joint(g, scaleM, base[i + 1], r1 * 1.02, 7);
    }
    this._tube(g, scaleM, base[NB], [0, 1.90, 0], 0.44, 0.56, 8);

    /* 躯干：粗壮的胸腹，比人形宽 1.4 倍（它是个「腹」，不是「人」） */
    const chest = mesh(boxGeo(1.70, 1.55, 1.10), scaleM, 0, 0.86, 0, torso);
    mesh(boxGeo(1.30, 0.90, 0.30), bellyM, 0, 0.72, 0.62, torso);

    /* 三条巨蟒缠在身上：每条的路径都绕着躯干走一圈半。
     * 它们是**活物**（anim 里各自游），不是装饰 —— 所以每条单独一条链。 */
    a.parts.serpents = [];
    const coils = [
      { y0: 1.66, y1: 0.52, ph: 0, r: 0.26, turns: 1.6, dir: 1 },
      { y0: 1.02, y1: 1.88, ph: 2.1, r: 0.24, turns: 1.4, dir: -1 },
      { y0: 0.34, y1: 1.44, ph: 4.2, r: 0.22, turns: 1.7, dir: 1 }
    ];
    for (const c of coils) {
      const pts = [];
      const N = 16;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const ang = c.ph + t * Math.PI * 2 * c.turns * c.dir;
        const rad = 1.16 - 0.12 * Math.sin(t * Math.PI);
        pts.push([Math.cos(ang) * rad, c.y0 + (c.y1 - c.y0) * t, Math.sin(ang) * rad]);
      }
      const nodes = this._chain(torso, scaleM, pts, c.r, c.r * 0.6, 6);
      /* 蛇头挂在链尾，跟着整条蛇一起游 */
      const last = nodes[nodes.length - 1];
      const head = new THREE.Group();
      head.position.set(0, 0.24, 0);
      last.add(head);
      mesh(boxGeo(0.26, 0.20, 0.40), bellyM, 0, 0, 0, head);
      mesh(boxGeo(0.16, 0.10, 0.14), scaleM, 0, 0.02, 0.24, head);
      this._eye(head, -0.09, 0.09, 0.16, 0.042, 0xffe060, 2.2);
      this._eye(head, 0.09, 0.09, 0.16, 0.042, 0xffe060, 2.2);
      a.parts.serpents.push({ nodes: nodes, head: head, ph: c.ph, dir: c.dir });
    }

    /* 头 + 蛇冠：头顶炸开一圈小蛇头（5 条短颈 + 5 个小头） */
    const headG = new THREE.Group();
    headG.position.y = 1.95;
    torso.add(headG);
    mesh(boxGeo(0.92, 0.72, 0.86), scaleM, 0, 0.30, 0, headG);
    mesh(boxGeo(0.60, 0.30, 0.28), bellyM, 0, 0.10, 0.46, headG);
    a.parts.headG = headG;
    a.parts.crownHeads = [];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI * 0.5;
      const ox = Math.cos(ang), oz = Math.sin(ang);
      /* 每条冠蛇是一小段三节的链：先往上、再往外弯 —— 直挺挺的一根
       * 读成「天线」，弯一下才是「蛇从头顶探出来」。 */
      const pts = [
        [ox * 0.30, 0.58, oz * 0.28],
        [ox * 0.46, 1.02, oz * 0.42],
        [ox * 0.72, 1.32, oz * 0.66],
        [ox * 0.98, 1.40, oz * 0.90]
      ];
      const nodes = this._chain(headG, scaleM, pts, 0.10, 0.075, 5);
      const tip = nodes[nodes.length - 1];
      const hd = new THREE.Group();
      hd.position.set(ox * 0.30, 0.02, oz * 0.30);
      tip.add(hd);
      mesh(boxGeo(0.24, 0.19, 0.40), bellyM, 0, 0, 0, hd);
      mesh(boxGeo(0.15, 0.09, 0.13), scaleM, 0, 0.01, 0.24, hd);
      this._eye(hd, -0.08, 0.08, 0.15, 0.034, 0xffe060, 2.4);
      this._eye(hd, 0.08, 0.08, 0.15, 0.034, 0xffe060, 2.4);
      a.parts.crownHeads.push({ g: nodes[0], nodes: nodes, ph: i * 1.25, i: i });
    }
    this._eye(headG, -0.26, 0.36, 0.44, 0.070, 0xff9040, 2.2);
    this._eye(headG, 0.26, 0.36, 0.44, 0.070, 0xff9040, 2.2);

    /* 两条手臂：从蟒堆里伸出来，位置偏低、姿态下垂 */
    a.parts.arms = [];
    for (const sx of [-1, 1]) {
      const arm = this._arm(torso, {
        skinM: scaleM, clothM: darkM, trimM: bellyM
      }, { x: sx * 0.92, y: 1.36, z: 0.12, len: 0.74, r: 0.22, sx: sx, splay: 0.95 });
      a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: sx > 0 ? 0 : 1.0, row: 0, fore: arm.fore });
    }
  },

  /* ============================================================
   * 9. 无相真身 —— 终 boss P5：十一米半、八臂、八首环绕、没有脸
   * ------------------------------------------------------------
   * 它**没有**别的魔将的任何特征（无光轮 / 无骨面 / 无翅膀 / 无角）：
   * 一身紫黑长袍、一张空白的面、八个首级在背后绕圈公转。
   * 「无相」就是「你认不出它是谁」—— 所以脸上什么都没有。
   * ============================================================ */
  _build_chaosTrue(a, cfg, d) {
    const B = this._body(a, cfg, {
      hipY: 4.95, torsoH: 4.15, torsoW: 2.70, torsoD: 1.70, headR: 0.98, neckH: 0.52
    });
    const voidM = reg(a, M(0x2a1038, { rough: 0.92 }));
    const robeM = reg(a, M(cfg.cloth !== undefined ? cfg.cloth : 0x1a0824, { rough: 0.95 }));
    const coreM = reg(a, M(0xb050ff, { rough: 0.35, emissive: 0x8020e0, ei: 2.2 }));
    const haloM = reg(a, M(0x6a30a0, { rough: 0.5, emissive: 0x4010a0, ei: 1.2 }));

    /* 长袍：一个从胸口一直垂到地面的巨锥，把腿全部吃掉。
     * 十一米的「无相」不该露脚 —— 露脚就变成「一个大人」。 */
    const robe = mesh(coneGeo(3.50, B.hipY + 1.45, 12), robeM, 0, (B.hipY + 1.45) * 0.5, 0, a.group);
    a.parts.robe = robe;
    mesh(boxGeo(3.00, 0.32, 1.90), haloM, 0, 0.86, 0, B.torso);

    /* 无面：一颗光滑的球，正面只有一个**凹进去的核**在脉动。
     * 没有眼睛、没有嘴 —— 这是它和另外八只最大的区别。 */
    const face = mesh(sphGeo(B.O.headR, 8), voidM, 0, B.O.headR * 0.5, 0, B.headG);
    face.scale.set(1.02, 1.10, 1.02);
    const socket = mesh(sphGeo(0.46, 7), coreM, 0, 0.58, 1.00, B.headG);
    socket.scale.set(1, 1, 0.35);
    a.parts.core = socket;

    /* 八首环绕：八个「首级」挂在半径 2.2 的圆上，各自朝外。
     * anim 里整个圆环公转（不是各自转），所以它们挂在同一个父节点下。 */
    const orbit = new THREE.Group();
    orbit.position.set(0, 0.10, -0.30);
    B.headG.add(orbit);
    a.parts.halos = [];
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const hg = new THREE.Group();
      hg.position.set(Math.cos(ang) * 2.20, Math.sin(ang * 2) * 0.26, Math.sin(ang) * 2.20);
      hg.rotation.y = -ang + Math.PI * 0.5;
      orbit.add(hg);
      const skull = mesh(sphGeo(0.40, 6), voidM, 0, 0, 0, hg);
      skull.scale.set(0.92, 1.12, 0.92);
      /* 每个首级两点的微光，凑近看才知道是「眼睛」 */
      this._eye(hg, -0.14, 0.07, 0.33, 0.044, 0xc060ff, 2.4);
      this._eye(hg, 0.14, 0.07, 0.33, 0.044, 0xc060ff, 2.4);
      a.parts.halos.push({ g: hg, ang: ang, ph: i * 0.78 });
    }
    a.parts.orbit = orbit;

    /* 八臂：四对，从背后「张开」而不是垂在身侧。
     * 每只臂比人形长 60%（2.1 米），末端是爪不是手。 */
    a.parts.arms = [];
    const rows = [
      { y: 2.86, x: 1.62, len: 1.95, r: 0.30, splay: 0.46 },
      { y: 2.06, x: 1.78, len: 2.05, r: 0.28, splay: 0.76 },
      { y: 1.26, x: 1.70, len: 1.92, r: 0.25, splay: 1.02 },
      { y: 0.50, x: 1.48, len: 1.76, r: 0.23, splay: 1.24 }
    ];
    for (let r = 0; r < rows.length; r++) {
      for (const sx of [-1, 1]) {
        const arm = this._arm(B.torso, B, {
          x: sx * rows[r].x, y: rows[r].y, z: -0.10, len: rows[r].len, r: rows[r].r,
          sx: sx, splay: rows[r].splay
        });
        /* 爪子：三根朝下的尖，替换掉「手」那颗球 */
        for (let k = 0; k < 3; k++) {
          this._spike(arm.hand, voidM, [(k - 1) * 0.10, -0.12, 0.04], 0.045, 0.42, [Math.PI * 0.9, 0, (k - 1) * 0.30], 4);
        }
        a.parts.arms.push({ g: arm.g, hand: arm.hand, sx: sx, ph: r * 1.35 + (sx > 0 ? 0 : 0.65), row: r, fore: arm.fore });
      }
    }
  },

  /* ============================================================
   * 动画。由 `updateActorAnim` 开头分派（`a.bafoModel` 存在时接管）
   * ------------------------------------------------------------
   * 每只的动作曲线各自一段，**不共用「走路摆臂」**。
   * 通用写法的三条禁忌在这里同样成立：
   *   ① 只写 rotation，不写 position（节点坐标是建模时算好的）；
   *   ② 根 group 只做死亡时的侧倾，别的一概不碰（世界坐标归 game.js）；
   *   ③ 受击闪白要遍历 a.mats，别只闪主材质（骨架是拼的）。
   * ============================================================ */
  anim(a, dt) {
    const P = a.parts;
    const t = a.time = (a.time || 0) + dt;
    const kind = a.animKind || '';
    const moving = a.moving ? 1 : 0;

    /* 死亡：九只都是巨躯，整体翻转会穿到地面以下。只做「侧倾 + 下沉」，
     * 而且比小怪慢（1.2 秒倒下 vs 0.35 秒）。 */
    if (a.anim === 'die') {
      a.dieT = (a.dieT || 0) + dt;
      const k = Math.min(1, a.dieT * 0.85);
      a.group.rotation.z = LERP(a.group.rotation.z, 0.42 * k, dt * 1.8);
      a.group.position.y = LERP(a.group.position.y, -0.9 * k, dt * 1.4);
      return;
    }

    /* 攻击时全体的「前压」：躯干前倾一点，玩家能读出「它要打了」 */
    const atk = a.atkAnim > 0 ? a.atkAnim : 0;
    if (P.torso) P.torso.rotation.x = -0.10 * atk;

    if (kind === 'deva') {
      /* 帝释：背光轮匀速旋转（唯一的「机器感」）+ 六臂错相轻摆 */
      if (P.halo) P.halo.rotation.z += dt * 0.42;
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = (ar.base || 0) + Math.sin(t * 1.35 + ar.ph) * 0.14 - 0.20 * atk;
        if (ar.fore) ar.fore.rotation.x = Math.sin(t * 1.35 + ar.ph + 0.8) * 0.18 - 0.30 * atk;
      }
      if (P.skirt) P.skirt.rotation.y = Math.sin(t * 0.5) * 0.05;
      if (P.headG) P.headG.rotation.y = Math.sin(t * 0.62) * 0.14;
      return;
    }

    if (kind === 'naga') {
      /* 难陀：盘身逐节蠕动（相位沿身长递进，像真的在盘），颈左右摆 */
      if (P.coil) for (let i = 0; i < P.coil.length; i++) {
        const m = P.coil[i];
        if (!m) continue;
        m.rotation.y = Math.sin(t * 0.85 + i * 0.7) * 0.035;
        m.rotation.x = Math.sin(t * 1.15 + i * 0.5) * 0.022;
      }
      if (P.neck) for (let i = 0; i < P.neck.length; i++) {
        P.neck[i].position.y += Math.sin(t * 1.4 + i * 0.6) * 0.004;
      }
      if (P.headG) {
        P.headG.rotation.y = Math.sin(t * 0.7) * 0.30;
        P.headG.rotation.x = Math.sin(t * 0.95 + 0.5) * 0.10 + 0.18 * atk;
      }
      if (P.jaw) P.jaw.rotation.x = Math.max(0, Math.sin(t * 1.6)) * 0.16 + 0.45 * atk;
      return;
    }

    if (kind === 'yaksa') {
      /* 毗沙：四臂上下交替（上对抡、下对撑），骨面不动 —— 面具是死的 */
      if (P.arms) for (const ar of P.arms) {
        const sp = ar.row === 0 ? 1.5 : 0.9;
        ar.g.rotation.x = Math.sin(t * sp + ar.ph) * (ar.row === 0 ? 0.20 : 0.10) - 0.35 * atk;
        if (ar.fore) ar.fore.rotation.x = Math.sin(t * sp + ar.ph + 1.1) * 0.16 - 0.4 * atk;
      }
      if (P.torso) P.torso.rotation.y = Math.sin(t * (moving ? 2.0 : 0.8)) * 0.05;
      if (P.headG) P.headG.rotation.y = Math.sin(t * 0.8) * 0.12;
      return;
    }

    if (kind === 'gandharva') {
      /* 乾闼婆：整体浮沉 + 三条飘带错相波浪 + 上身随琴轻摇 */
      const fl = Math.sin(t * 1.15) * 0.16;
      a.group.position.y = (a.baseY || 0) + 0.55 + fl;
      if (P.ribbons) for (const rb of P.ribbons) {
        for (let i = 0; i < rb.nodes.length; i++) {
          const n = rb.nodes[i];
          const k = (i + 1) / rb.nodes.length;
          n.rotation.z = Math.sin(t * 1.6 + rb.ph - i * 0.55) * 0.22 * k;
          n.rotation.x = Math.sin(t * 1.25 + rb.ph - i * 0.4) * 0.14 * k;
        }
      }
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = -0.55 + Math.sin(t * 2.4 + ar.ph) * 0.10 - 0.25 * atk;
        if (ar.fore) ar.fore.rotation.x = -0.35 + Math.sin(t * 2.4 + ar.ph + 0.6) * 0.14;
      }
      if (P.torso) P.torso.rotation.y = Math.sin(t * 0.9) * 0.08;
      return;
    }

    if (kind === 'asura') {
      /* 罗睺：三头各自转向（相位错开，永远不同步）+ 六臂波浪 */
      if (P.heads) for (const h of P.heads) {
        h.g.rotation.y = (h.sx * 0.38) + Math.sin(t * 0.85 + h.ph) * 0.26;
        h.g.rotation.x = Math.sin(t * 1.1 + h.ph * 1.4) * 0.10;
      }
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = Math.sin(t * 1.45 + ar.ph) * 0.18 - 0.30 * atk;
        if (ar.fore) ar.fore.rotation.x = Math.sin(t * 1.45 + ar.ph + 0.9) * 0.14 - 0.35 * atk;
      }
      if (P.shield) P.shield.rotation.z = Math.sin(t * 0.9) * 0.05;
      return;
    }

    if (kind === 'garuda') {
      /* 金翅：双翼三段递进开合（频率随移动变快）+ 尾羽扇形轻颤 + 爪抓地 */
      const freq = moving ? 3.4 : 1.25;
      const flap = Math.sin(t * freq) * 0.30 + (moving ? 0.28 : 0.10);
      if (P.wings) for (const w of P.wings) {
        w.upper.rotation.z = w.sx * flap;
        w.fore.rotation.z = w.sx * flap * 0.62;
        w.tip.rotation.z = w.sx * flap * 0.42;
        w.upper.rotation.x = Math.sin(t * freq * 0.5) * 0.06;
      }
      if (P.tail) for (const tg of P.tail) {
        tg.g.rotation.x = -1.15 + Math.sin(t * 1.5 + tg.ph) * 0.10;
        tg.g.rotation.y = (tg.i - 2) * 0.30 + Math.sin(t * 1.1 + tg.ph) * 0.05;
      }
      if (P.claws) for (const c of P.claws) {
        c.shin.rotation.x = -0.30 + Math.sin(t * 1.2 + (c.sx > 0 ? 0 : 1.6)) * 0.05;
      }
      if (P.headG) P.headG.rotation.y = Math.sin(t * 0.75) * 0.22;
      return;
    }

    if (kind === 'kimnara') {
      /* 紧那罗：四节马腿各自屈伸（相位成对错开，走起来像马）+ 鹿角轻点头 */
      if (P.legs) for (const l of P.legs) {
        const ph = (l.sx > 0 ? 0 : Math.PI) + (moving ? 0 : 0.6);
        l.knee.rotation.x = 0.46 + Math.sin(t * (moving ? 5.5 : 1.4) + ph) * (moving ? 0.32 : 0.04);
        l.hock.rotation.x = -0.82 + Math.sin(t * (moving ? 5.5 : 1.4) + ph + 0.9) * (moving ? 0.26 : 0.03);
        l.hoof.rotation.x = Math.sin(t * (moving ? 5.5 : 1.4) + ph + 1.5) * 0.14;
      }
      if (P.antlers) for (const an of P.antlers) {
        an.rotation.x = -0.20 + Math.sin(t * 0.8) * 0.05;
      }
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = -0.45 + Math.sin(t * 2.1 + ar.ph) * 0.12 - 0.20 * atk;
        if (ar.fore) ar.fore.rotation.x = -0.30 + Math.sin(t * 2.1 + ar.ph + 0.7) * 0.18;
      }
      if (P.headG) P.headG.rotation.y = Math.sin(t * 0.65) * 0.16;
      return;
    }

    if (kind === 'mahoraga') {
      /* 摩睺罗迦：三条巨蟒各自沿身体游走（相位差 2.1，看起来互不相干）
       * + 蛇冠五个小头轮流抬头（不同步，否则像一朵花） */
      if (P.serpents) for (const s of P.serpents) {
        for (let i = 0; i < s.nodes.length; i++) {
          const n = s.nodes[i];
          n.rotation.y = Math.sin(t * 1.1 + s.ph + i * 0.5) * 0.10 * s.dir;
          n.rotation.x = Math.sin(t * 0.85 + s.ph + i * 0.35) * 0.07;
        }
        if (s.head) s.head.rotation.y = Math.sin(t * 1.6 + s.ph) * 0.45;
      }
      if (P.crownHeads) for (const c of P.crownHeads) {
        /* 冠蛇是链，逐节轻摆；根节点不动（动了整条会连根甩出去） */
        if (c.nodes) for (let i = 1; i < c.nodes.length; i++) {
          c.nodes[i].rotation.x = Math.sin(t * 1.5 + c.ph + i * 0.4) * 0.10;
          c.nodes[i].rotation.y = Math.sin(t * 1.1 + c.ph + i * 0.3) * 0.08;
        }
      }
      if (P.coil) for (let i = 0; i < P.coil.length; i++) {
        const m = P.coil[i];
        if (m) m.rotation.y = Math.sin(t * 0.7 + i * 0.6) * 0.03;
      }
      if (P.headG) P.headG.rotation.y = Math.sin(t * 0.55) * 0.18;
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = Math.sin(t * 0.95 + ar.ph) * 0.12 - 0.25 * atk;
      }
      return;
    }

    if (kind === 'chaosTrue') {
      /* 无相真身：八首公转（整环转，不是各自转）+ 核脉动 + 八臂波浪
       * + 长袍微旋。它没有呼吸 —— 一个「无相」不该像活物那样起伏。 */
      if (P.orbit) P.orbit.rotation.y += dt * 0.55;
      if (P.core) {
        const pulse = 1 + Math.sin(t * 2.2) * 0.16;
        P.core.scale.set(pulse, pulse, 0.35);
      }
      if (P.halos) for (const h of P.halos) {
        h.g.rotation.z = Math.sin(t * 1.3 + h.ph) * 0.12;
      }
      if (P.arms) for (const ar of P.arms) {
        ar.g.rotation.x = Math.sin(t * 1.05 + ar.ph) * 0.16 - 0.28 * atk;
        if (ar.fore) ar.fore.rotation.x = Math.sin(t * 1.05 + ar.ph + 0.7) * 0.13 - 0.30 * atk;
      }
      if (P.robe) P.robe.rotation.y = Math.sin(t * 0.4) * 0.04;
      return;
    }
  }
};
