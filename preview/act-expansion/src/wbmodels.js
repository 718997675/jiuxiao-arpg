/* ============================================================
 * wbmodels.js —— 世界 Boss 的六套程序化骨架（M18.6）
 * ------------------------------------------------------------
 * 为什么单独一个文件：
 *   actors.js 已经 1286 行、19 个 kind 分支。再塞六套「每套 150 行」的
 *   巨兽骨架进去，那个文件就没人看得懂了。这里只放**世界 Boss 专属**的
 *   建模与动画，通过 `buildMonster` 开头的一行分派接进去：
 *     if (WBModels.has(kind)) return WBModels.build(kind, cfg);
 *
 * ------------------------------------------------------------
 * 三条硬约定（改之前先读，违反任意一条都会出「模型和逻辑分家」）：
 *
 * 【一】1 单位 = 1 米，`group.scale = 1`。
 *   数据里的 `scale: 4.6~5.6` 是给「2 米人形 × scale」用的旧口径。
 *   新骨架按 `body.len / height` 的**真实米数**建（烛九阴 44 米），
 *   再乘一次 5.4 会变成 238 米，直接穿出地图边界。
 *   所以 build 返回的 actor 带 `noAutoScale: true`，`buildMonster` 末尾
 *   会跳过 `setScalar(s)`。
 *
 * 【二】`parts.torso` 必须是**内层 group**，不能是根 group。
 *   `updateActorAnim` 会无条件写 `P.torso.position`，若它指向根节点，
 *   等于把 `updateEnemies` 每帧同步过来的世界坐标抹掉 ——
 *   表现是「逻辑坐标已经走远、模型钉在出生点」。
 *   这里所有 build 都把躯干做成内层 group，根 group 只归游戏逻辑管。
 *
 * 【三】碰撞半径不等于包围盒半径。
 *   44 米的蛇盘三圈，水平包围有 14 米；拿它当碰撞半径，玩家得站 14 米外，
 *   近战永远够不到。数据里 `body.radius` 描述的是「主干有多粗」，
 *   由 `game.js` 的 `[M18.6]` 段夹住 `measureFootR` 的结果。
 *
 * ------------------------------------------------------------
 * 六只的剪影必须一眼分得开（这是 M18.6 的唯一验收标准）：
 *   烛九阴 = 盘在地上的巨大螺旋 + 直立的颈
 *   相柳   = 贴地长身 + 九条脖子炸开
 *   鲲鹏   = 横躺的巨鱼 ↔ 展开 60 米翼展的鸟
 *   饕餮   = 矮胖四足 + 一张占一半体长的嘴
 *   刑天   = 直立无头巨人 + 双乳发光 + 斧盾
 *   九尾狐 = 四足狐身 + 扇形展开的九条长尾
 * ============================================================ */

const WBModels = {
  /* model 名 → 世界 Boss 数据。buildMonster 只传 `{scale, color, cloth, skin}`，
   * 拿不到 body / animKind，所以按 model 名反查完整条目。 */
  _data: null,
  _index() {
    if (this._data) return this._data;
    const m = {};
    if (typeof WORLD_BOSSES !== 'undefined' && typeof WORLD_BOSS_ORDER !== 'undefined') {
      for (const id of WORLD_BOSS_ORDER) {
        const c = WORLD_BOSSES[id];
        if (c && c.model) m[c.model] = c;
      }
    }
    this._data = m;
    return m;
  },

  has(name) { return !!this._index()[name]; },
  dataOf(name) { return this._index()[name] || null; },

  /* ============================================================
   * 建模型
   * ============================================================ */
  build(name, opts = {}) {
    const d = this.dataOf(name);
    if (!d) return null;
    const g = new THREE.Group();
    const a = { group: g, mats: [], parts: {}, wbModel: name, noAutoScale: true };
    /* 数据里的颜色优先；opts 是 buildMonster 透传的同一份，兜底用 */
    const cfg = {
      color: d.color !== undefined ? d.color : opts.color,
      cloth: d.cloth !== undefined ? d.cloth : opts.cloth,
      skin: d.skin !== undefined ? d.skin : opts.skin
    };
    const fn = this['_build_' + name.replace(/^wb_/, '')];
    if (typeof fn !== 'function') return null;
    fn.call(this, a, cfg, d);
    /* 把所有 mesh 的材质补进 `mats`。**不要指望每个 builder 手写 reg** ——
     * 六只加起来 400 多个 mesh，手写必漏（第一版漏了 3~38 个/只）。
     * 受击闪白、死亡淡出、`disposeTree` 只认这张表，漏一个就是「打它不闪」。 */
    a.group.traverse(o => {
      if (o.isMesh && o.material && a.mats.indexOf(o.material) < 0) a.mats.push(o.material);
    });
    /* 数据里写明的碰撞半径。game.js 拿它夹 measureFootR 的结果 */
    a.footR = (d.body && d.body.radius) || 3.5;
    a.animKind = d.animKind || '';
    return a;
  },

  /* ============================================================
   * 通用零件
   * ============================================================ */

  /* 两点之间的一节「管子」。半径从 r0 渐变到 r1（r0 是 p0 端）。
   * 巨兽的躯干 / 颈 / 尾全是这么拼的 —— 用圆柱而不是 box，
   * 因为蛇和脖子要「看起来是圆的」，方盒子在 5 米粗的时候非常明显。 */
  _tube(root, mat, p0, p1, r0, r1, seg = 8) {
    const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = dir.length() || 0.001;
    const m = mesh(cylGeo(r1, r0, len, seg), mat,
      (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, root);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  },

  /* 关节球。两节管子接缝处塞一个，远看就不会露出「两段圆台拼歪」的缝 */
  _joint(root, mat, p, r, seg = 7) {
    return mesh(sphGeo(r, seg), mat, p[0], p[1], p[2], root);
  },

  /* 发光眼。巨兽的眼睛是唯一的「亮度来源」，尤其在烛九阴的夜阶段 */
  _eye(root, x, y, z, r, color = 0xffd040, ei = 1.8) {
    const mat = new THREE.MeshStandardMaterial({
      color: color, emissive: color, emissiveIntensity: ei,
      roughness: 0.35, metalness: 0, flatShading: true
    });
    const m = mesh(sphGeo(r, 6), mat, x, y, z, root);
    return m;
  },

  /* ============================================================
   * 1. 烛九阴 —— 人面蛇身，44 米，七节脊椎盘三圈
   * ============================================================ */
  _build_candle(a, cfg, d) {
    const g = a.group;
    const scaleM = reg(a, M(cfg.color, { rough: 0.72 }));         // 鳞
    const belly = reg(a, M(cfg.skin, { rough: 0.8 }));            // 腹
    const dark = reg(a, M(cfg.cloth, { rough: 0.92 }));           // 发 / 背脊

    /* 躯干：内层 group（约定二） */
    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* 七节脊椎盘三圈：螺旋半径 1.4 → 7.0，高度 0.7 → 2.4。
     * 圈间距 = (7.0-1.4)/3 ≈ 1.87，蛇身直径 1.3 —— 盘得下、不互相穿。 */
    const SEG = 7;
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const ang = t * Math.PI * 2 * 3 - Math.PI * 0.5;
      const r = 1.4 + 5.6 * t;
      pts.push([Math.cos(ang) * r, 0.7 + 1.7 * t, Math.sin(ang) * r]);
    }
    a.parts.spine = [];
    for (let i = 0; i < SEG; i++) {
      const r0 = 1.15 - 0.55 * (i / SEG);
      const r1 = 1.15 - 0.55 * ((i + 1) / SEG);
      const m = this._tube(torso, i % 2 ? scaleM : belly, pts[i], pts[i + 1], r0, r1, 8);
      a.parts.spine.push(m);
      this._joint(torso, scaleM, pts[i + 1], r1 * 1.02);
    }
    /* 尾尖：最后一节再细下去，加一个锥 */
    const tailTip = mesh(coneGeo(0.35, 2.2, 6), scaleM,
      pts[SEG][0] * 1.04, pts[SEG][1], pts[SEG][2] * 1.04, torso);
    tailTip.rotation.set(Math.PI * 0.5, 0, 0);
    a.parts.tail = tailTip;

    /* 颈三节：从盘心竖起到 9 米，略前倾（人面要朝着玩家） */
    const neckBase = [0, 2.4, 0.4];
    const neck = [];
    let prev = neckBase;
    for (let i = 0; i < 3; i++) {
      const nxt = [prev[0] + 0.12 * (i + 1), prev[1] + 2.15, prev[2] + 0.28 * (i + 1)];
      this._tube(torso, scaleM, prev, nxt, 0.95 - i * 0.16, 0.95 - (i + 1) * 0.16, 8);
      this._joint(torso, belly, nxt, (0.95 - (i + 1) * 0.16) * 1.05);
      neck.push(nxt); prev = nxt;
    }
    /* 颈根一段更粗的过渡，避免「盘」和「颈」之间出现直角 */
    this._tube(torso, scaleM, pts[0], neckBase, 1.2, 1.05, 8);
    a.parts.neck = neck;

    /* 人面（数据原典：人面蛇身而赤）。挂在颈顶 */
    const headG = new THREE.Group();
    headG.position.set(neck[2][0], neck[2][1] + 0.6, neck[2][2]);
    torso.add(headG);
    a.parts.headG = headG;
    const face = mesh(boxGeo(1.5, 1.7, 1.2), reg(a, M(cfg.skin, { rough: 0.72 })), 0, 0, 0, headG);
    face.scale.set(1, 1.06, 0.96);
    /* 长发（赤色神祇的黑发 + 两侧鬓角） */
    mesh(boxGeo(1.62, 0.5, 1.3), dark, 0, 0.86, -0.04, headG);
    for (const sx of [-1, 1]) {
      mesh(boxGeo(0.16, 1.5, 0.3), dark, sx * 0.8, 0.1, -0.2, headG);
    }
    mesh(boxGeo(0.9, 2.4, 0.35), dark, 0, -1.1, -0.5, headG);     // 后脑披下的长发
    /* 眼：金色竖瞳，是它在夜阶段唯一的光源 */
    this._eye(headG, -0.36, 0.12, 0.62, 0.17, 0xffd23a, 2.2);
    this._eye(headG, 0.36, 0.12, 0.62, 0.17, 0xffd23a, 2.2);
    /* 眉 + 鼻 + 口 */
    mesh(boxGeo(1.1, 0.1, 0.1), dark, 0, 0.4, 0.6, headG);
    mesh(boxGeo(0.14, 0.34, 0.16), reg(a, M(cfg.skin, { rough: 0.8 })), 0, -0.02, 0.64, headG);
    mesh(boxGeo(0.5, 0.08, 0.1), M(0x6a2018), 0, -0.45, 0.62, headG);
    /* 双角：烛龙是「钟山之神」，给一对短而钝的角 */
    for (const sx of [-1, 1]) {
      const horn = mesh(coneGeo(0.16, 0.9, 5), reg(a, M(0xd8c090, { rough: 0.6 })), sx * 0.5, 1.0, 0, headG);
      horn.rotation.z = sx * 0.28;
    }
    a.parts.face = face;
  },

  /* ============================================================
   * 2. 相柳 —— 九首，32 米贴地长身，九条颈各四节
   * ============================================================ */
  _build_hydra(a, cfg, d) {
    const g = a.group;
    const scaleM = reg(a, M(cfg.color, { rough: 0.74 }));
    const belly = reg(a, M(cfg.skin, { rough: 0.82 }));
    const dark = reg(a, M(cfg.cloth, { rough: 0.9 }));

    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* 五节躯干，沿 +z 铺 32 米，贴地（y 1.5），前粗后细 */
    const BODY = 5, LEN = 32;
    const segLen = LEN / BODY;
    a.parts.body = [];
    for (let i = 0; i < BODY; i++) {
      const z0 = -LEN * 0.5 + i * segLen;
      const z1 = z0 + segLen;
      const r0 = 1.35 + 0.45 * Math.sin((i / BODY) * Math.PI);
      const r1 = 1.35 + 0.45 * Math.sin(((i + 1) / BODY) * Math.PI);
      const p0 = [0, 1.5, z0], p1 = [0, 1.5, z1];
      this._tube(torso, i % 2 ? scaleM : belly, p0, p1, r0, r1, 9);
      this._joint(torso, scaleM, p1, r1 * 1.01);
      a.parts.body.push(p1);
      /* 背脊鳞片：一排小锥，让「贴地滑行」有质感 */
      if (i < BODY - 1) mesh(coneGeo(0.3, 0.7, 4), dark, 0, 1.5 + r1 * 0.92, z0 + segLen * 0.5, torso);
    }
    /* 尾尖 */
    const tail = mesh(coneGeo(0.5, 3.2, 6), scaleM, 0, 1.5, -LEN * 0.5 - 1.4, torso);
    tail.rotation.x = -Math.PI * 0.5;

    /* 九条颈，各四节。从躯干前 2/3 段的背部发出，扇形炸开。
     * 分布规则：3 排 × 3 列 —— 前排高而外张、后排低而内收，
     * 这样从任何角度看都是「一团脖子」，不会连成一把扇子。 */
    a.parts.necks = [];
    const heads = [];
    let idx = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const sx = (col - 1);                       // -1 / 0 / 1
        const zBase = 3.2 + row * 4.2;              // 沿躯干往前的三排
        /* 9.5 + row·2.2（最高 13.9，加头约 15.5）与 0.85 + row·0.22 的外张：
         * 第一版 7.5 / 0.55 做出来是「一条长虫背上插了几根管子」，
         * 尺寸向量和饕餮几乎重合（距离 0.038）。相柳的辨识点是**竖起来的九条脖子**，
         * 所以往「瘦高」推，饕餮往「矮宽」推，两者剪影才分得开。 */
        const h = 9.5 + row * 2.2;                  // 越靠前越高
        const spread = 0.85 + row * 0.22;           // 越靠前越外张
        const base = [sx * 1.1, 2.3, zBase];
        let prev = base;
        const joints = [];
        for (let s = 0; s < 4; s++) {
          const t = (s + 1) / 4;
          const nxt = [
            sx * (1.1 + spread * h * 0.42 * t),
            2.3 + h * t,
            zBase + (1.9 + row * 0.5) * t - sx * sx * 0.2 * t
          ];
          const r0 = 0.62 - s * 0.09, r1 = 0.62 - (s + 1) * 0.09;
          this._tube(torso, scaleM, prev, nxt, r0, r1, 7);
          this._joint(torso, belly, nxt, r1 * 1.04);
          joints.push(nxt);
          prev = nxt;
        }
        /* 蛇头：扁长的楔形 + 双颚 + 发光眼 */
        const headG = new THREE.Group();
        headG.position.set(prev[0], prev[1], prev[2]);
        headG.lookAt(prev[0] * 1.4, prev[1] - 1.2, prev[2] + 6);
        torso.add(headG);
        const skull = mesh(boxGeo(0.86, 0.62, 1.7), scaleM, 0, 0, 0.5, headG);
        skull.scale.set(1, 0.9, 1);
        mesh(boxGeo(0.8, 0.26, 1.4), dark, 0, 0.26, 0.5, headG);      // 头顶鳞脊
        for (const s2 of [-1, 1]) {
          this._eye(headG, s2 * 0.3, 0.16, 0.95, 0.12, 0xd8ff6a, 1.9);
          /* 毒牙 */
          const fang = mesh(coneGeo(0.07, 0.34, 4), M(0xe8e0c0, { rough: 0.4 }), s2 * 0.22, -0.24, 1.2, headG);
          fang.rotation.x = 2.9;
        }
        a.parts.necks.push({ joints, head: headG, phase: idx * 0.7, sx, row });
        heads.push(headG);
        idx++;
      }
    }
    a.parts.heads = heads;
  },

  /* ============================================================
   * 3. 鲲鹏 —— 鲲（鱼）↔ 鹏（鸟），翼展 60 米
   * ============================================================ */
  _build_kunpeng(a, cfg, d) {
    const g = a.group;
    const scaleM = reg(a, M(cfg.color, { rough: 0.6, metal: 0.12 }));   // 鳞 / 羽
    const belly = reg(a, M(cfg.skin, { rough: 0.72 }));                 // 腹 / 翼膜
    const dark = reg(a, M(cfg.cloth, { rough: 0.85 }));                 // 背 / 翼骨

    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* ---------- 鲲：横躺的巨鱼，38 米 ---------- */
    const kun = new THREE.Group(); torso.add(kun);
    a.parts.kun = kun;
    const bodyLen = 38, bodyR = 5.2;
    const fish = mesh(sphGeo(1, 10), scaleM, 0, 4.4, 0, kun);
    fish.scale.set(bodyR, bodyR * 0.82, bodyLen * 0.5);
    /* 腹白：下半部一块浅色，读起来是「鱼肚子」 */
    const bellyM = mesh(sphGeo(1, 10), belly, 0, 3.4, 0, kun);
    bellyM.scale.set(bodyR * 0.86, bodyR * 0.5, bodyLen * 0.46);
    /* 背鳍 */
    const dorsal = mesh(boxGeo(0.5, 3.2, 12), dark, 0, 8.6, -2, kun);
    dorsal.rotation.x = -0.12;
    /* 尾鳍（竖立的扇形，用三片拼） */
    for (const rz of [-0.5, 0, 0.5]) {
      const f = mesh(boxGeo(0.4, 7.5, 4.2), belly, 0, 4.6, -bodyLen * 0.52, kun);
      f.rotation.set(rz * 0.5, 0, rz);
    }
    /* 双胸鳍：向下后方展开，摆动用 */
    a.parts.fins = [];
    for (const sx of [-1, 1]) {
      const fin = new THREE.Group();
      fin.position.set(sx * bodyR * 0.8, 3.6, 4);
      kun.add(fin);
      const blade = mesh(boxGeo(9, 0.4, 5.4), belly, sx * 4.6, -1.2, -1.4, fin);
      blade.rotation.set(0.18, sx * 0.5, sx * -0.34);
      a.parts.fins.push({ g: fin, sx });
    }
    /* 鱼眼 */
    for (const sx of [-1, 1]) this._eye(kun, sx * bodyR * 0.72, 5.4, bodyLen * 0.28, 0.55, 0x9ae8ff, 1.6);

    /* ---------- 鹏：鸟身 + 60 米翼展 + 鸟爪 ---------- */
    const peng = new THREE.Group(); torso.add(peng);
    peng.visible = false;
    a.parts.peng = peng;
    /* 鸟的**身体部分**单独一层：P3「鲲鹏同体」要的是「鱼身长出翅膀」，
     * 不是「一条鱼和一个鸟叠在一起」。所以 both 时把这一层藏掉，
     * 只留双翼与鸟爪。 */
    const pengBody = new THREE.Group(); peng.add(pengBody);
    a.parts.pengBody = pengBody;
    const bird = mesh(sphGeo(1, 9), scaleM, 0, 6.2, 0, pengBody);
    bird.scale.set(4.2, 4.6, 9.5);
    /* 鸟首：颈 + 喙 */
    const birdNeck = mesh(cylGeo(1.2, 1.7, 5.4, 7), scaleM, 0, 11.4, 5.4, pengBody);
    birdNeck.rotation.x = -0.34;
    const birdHead = mesh(sphGeo(1.7, 8), scaleM, 0, 14.2, 7.4, pengBody);
    birdHead.scale.set(1, 1.06, 1.18);
    const beak = mesh(coneGeo(0.85, 3.4, 5), reg(a, M(0xe8c060, { rough: 0.45, metal: 0.3 })), 0, 13.9, 9.6, pengBody);
    beak.rotation.x = Math.PI * 0.5;
    for (const sx of [-1, 1]) this._eye(pengBody, sx * 0.86, 14.7, 8.1, 0.28, 0xffe066, 1.8);
    /* 双翼：三段（肩 / 肘 / 翼尖），每段用扁 box 拼羽毛。
     * 翼展 60 = 每侧 30 米，肩在 x=±4。 */
    a.parts.wings = [];
    for (const sx of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(sx * 4, 7.4, 1.2);
      peng.add(root);
      /* 翼骨：三段向下折，末端略上翘，像滑翔中的鹏 */
      /* 三段合计 26.5 米 + 肩 4 米 = 每侧 30.5，翼展 61 —— 贴数据里的 60。
       * 第一版写成 11+12+9 = 32/侧，实测 72，比数据大 20%，
       * 在 32 米半径的领域里会捅出圈外。 */
      const upper = new THREE.Group(); root.add(upper);
      const bone1 = mesh(boxGeo(9, 0.5, 2.4), dark, sx * 4.5, 0, 0, upper);
      const fore = new THREE.Group(); fore.position.set(sx * 9, 0, 0); upper.add(fore);
      const bone2 = mesh(boxGeo(10, 0.4, 2.0), dark, sx * 5, -0.2, -0.4, fore);
      const tipG = new THREE.Group(); tipG.position.set(sx * 10, -0.2, -0.4); fore.add(tipG);
      const bone3 = mesh(boxGeo(7.5, 0.3, 1.6), dark, sx * 3.75, 0, -0.6, tipG);
      /* 羽毛：每段铺几片，越往外越细 */
      for (let i = 0; i < 4; i++) {
        const f = mesh(boxGeo(3.0, 0.12, 4.6 - i * 0.5), belly, sx * (2.0 + i * 2.0), -0.5, -1.6, upper);
        f.rotation.y = sx * 0.06 * i;
      }
      for (let i = 0; i < 4; i++) {
        const f = mesh(boxGeo(3.2, 0.1, 4.2 - i * 0.5), belly, sx * (1.8 + i * 2.2), -0.8, -2.0, fore);
        f.rotation.y = sx * 0.08 * i;
      }
      for (let i = 0; i < 3; i++) {
        const f = mesh(boxGeo(2.6, 0.1, 3.4 - i * 0.4), belly, sx * (1.8 + i * 2.0), -1.0, -2.4, tipG);
      }
      a.parts.wings.push({ root, upper, fore, tip: tipG, sx });
    }
    /* 双爪：两趾前、一趾后，抓着空气（鹏在空中） */
    for (const sx of [-1, 1]) {
      /* 腿组起点 6.4 而不是 3.2：爪尖在腿组下 -4.6，从 3.2 起会落到 -1.4，
       * 再算上趾的半径就到 -2.16 —— 整只鸟的爪子埋在地里。 */
      const leg = new THREE.Group(); leg.position.set(sx * 2.2, 6.4, 2.4); peng.add(leg);
      mesh(cylGeo(0.42, 0.55, 4.2, 6), dark, 0, -2.1, 0, leg);
      for (let t = 0; t < 3; t++) {
        const a2 = (t - 1) * 0.7 + (t === 2 ? Math.PI : 0);
        const toe = mesh(cylGeo(0.14, 0.2, 2.4, 5), reg(a, M(0xd8c090, { rough: 0.5 })),
          Math.sin(a2) * 1.0, -4.6, Math.cos(a2) * 1.0, leg);
        toe.rotation.set(Math.cos(a2) * 1.2, 0, -Math.sin(a2) * 1.2);
      }
    }
  },

  /* ============================================================
   * 4. 饕餮 —— 四足短身，口开 120°，两排牙，腋下双目，背六刺
   * ============================================================ */
  _build_maw(a, cfg, d) {
    const g = a.group;
    const hide = reg(a, M(cfg.color, { rough: 0.86 }));
    const skin = reg(a, M(cfg.skin, { rough: 0.8 }));
    const dark = reg(a, M(cfg.cloth, { rough: 0.94 }));

    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* 短身：30 长 11 高，矮胖。椭球 + 臀高胸低 */
    const body = mesh(sphGeo(1, 10), hide, 0, 5.4, -2, torso);
    body.scale.set(5.6, 4.6, 13.5);
    const shoulder = mesh(sphGeo(1, 9), hide, 0, 6.2, 7.6, torso);
    shoulder.scale.set(6.2, 5.0, 6.2);
    /* 背六刺：脊线六根，前高后低 */
    a.parts.spikes = [];
    for (let i = 0; i < 6; i++) {
      const z = 8.4 - i * 3.0;
      const h = 3.4 - i * 0.34;
      const sp = mesh(coneGeo(0.62, h, 5), dark, 0, 8.8 + h * 0.2 - i * 0.12, z, torso);
      sp.rotation.x = -0.16;
      a.parts.spikes.push(sp);
    }

    /* 四条粗腿：每条两段（大腿 / 小腿）+ 爪 */
    a.parts.legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        /* 4.6 → 5.2：爪在膝盖下 -2.5、再往下 1.2 的锥，从 4.6 起会穿地。
         * 横向 3.9 → 4.6：饕餮要「矮胖」，四腿跨得开，剪影才不像相柳。 */
        const hip = new THREE.Group();
        hip.position.set(sx * 4.6, 5.2, sz > 0 ? 7.2 : -7.4);
        torso.add(hip);
        mesh(sphGeo(1.5, 7), hide, 0, 0, 0, hip);
        this._tube(hip, hide, [0, 0, 0], [sx * 0.7, -2.6, 0], 1.35, 1.05, 7);
        const knee = new THREE.Group(); knee.position.set(sx * 0.7, -2.6, 0); hip.add(knee);
        this._tube(knee, hide, [0, 0, 0], [0, -2.1, 0], 1.0, 0.85, 7);
        /* 爪：三趾 */
        for (let t = 0; t < 3; t++) {
          const toe = mesh(coneGeo(0.34, 1.2, 4), M(0xe0d4b0, { rough: 0.45 }),
            (t - 1) * 0.55, -2.5, 0.5, knee);
          toe.rotation.x = 1.9;
        }
        a.parts.legs.push({ hip, knee, sx, sz });
      }
    }

    /* 巨口：上下颚各一个 group，挂在身体前端。张口 120° = 每侧 60° */
    const jawUp = new THREE.Group(); jawUp.position.set(0, 6.4, 11.2); torso.add(jawUp);
    const jawDn = new THREE.Group(); jawDn.position.set(0, 5.2, 11.2); torso.add(jawDn);
    a.parts.jawUp = jawUp; a.parts.jawDn = jawDn;

    /* 上颚：向前伸 7 米、宽 7 米。内部深色（口腔） */
    const upper = mesh(boxGeo(7.2, 1.5, 7.6), hide, 0, 0.2, 3.2, jawUp);
    upper.scale.set(1, 1, 1);
    mesh(boxGeo(6.4, 0.6, 6.6), M(0x40100c, { rough: 0.9 }), 0, -0.7, 3.0, jawUp);   // 上膛
    const lower = mesh(boxGeo(7.0, 1.4, 7.2), hide, 0, -0.2, 3.0, jawDn);
    mesh(boxGeo(6.2, 0.6, 6.2), M(0x5a1a12, { rough: 0.9 }), 0, 0.6, 2.8, jawDn);     // 舌 / 下膛
    /* 两排牙：上排朝下、下排朝上，各 9 颗，前小后大 */
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * 0.78;
      const h = 1.1 + Math.abs(i - 4) * -0.06 + 0.5;
      const tu = mesh(coneGeo(0.26, h, 4), M(0xe8e0c4, { rough: 0.4 }), x, -1.0, 5.6, jawUp);
      tu.rotation.x = Math.PI;
      const td = mesh(coneGeo(0.26, h * 0.9, 4), M(0xe8e0c4, { rough: 0.4 }), x, 0.9, 5.4, jawDn);
    }
    /* 口角两根獠牙（比其它牙长一倍，剪影上认得出是饕餮） */
    for (const sx of [-1, 1]) {
      const tusk = mesh(coneGeo(0.36, 2.6, 4), M(0xf0e8cc, { rough: 0.35 }), sx * 3.2, 1.4, 5.2, jawDn);
      tusk.rotation.x = 0.2;
    }
    /* 腋下双目（原典「其目在腋下」）：长在前腿内侧，发光 */
    a.parts.armpitEyes = [];
    for (const sx of [-1, 1]) {
      const e = this._eye(torso, sx * 4.6, 4.2, 6.2, 0.62, 0xff7a2a, 2.0);
      a.parts.armpitEyes.push(e);
    }
    /* 鼻孔：上颚前端两个黑洞 */
    for (const sx of [-1, 1]) {
      mesh(sphGeo(0.3, 5), M(0x1a0c08), sx * 1.5, 0.9, 6.4, jawUp);
    }
  },

  /* ============================================================
   * 5. 刑天 —— 无头巨人 16 米，双乳为目，脐为口，右斧左盾
   * ============================================================ */
  _build_headless(a, cfg, d) {
    const g = a.group;
    const skin = reg(a, M(cfg.skin, { rough: 0.78 }));
    const hide = reg(a, M(cfg.color, { rough: 0.88 }));      // 皮甲 / 腰布
    const dark = reg(a, M(cfg.cloth, { rough: 0.95 }));
    /* 金属不要给 0.75 的 metalness：场景里没有环境贴图，metalness 高 = 反射不到
     * 东西 = 直接渲染成近黑。第一版斧盾在截图里就是两块黑木板。
     * 0.38 + 提亮基色，才有「青铜」的观感。 */
    const metal = reg(a, M(0x9e9270, { metal: 0.38, rough: 0.44 }));
    const steel = reg(a, M(0xdcd4b4, { metal: 0.46, rough: 0.26 }));   // 斧刃 / 盾心

    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* 躯干：胸腔（宽 7）+ 腹（宽 5）+ 腰布。整体 y 8~14，无头 */
    const chest = mesh(boxGeo(7.4, 5.2, 3.8), skin, 0, 11.6, 0, torso);
    chest.scale.set(1, 1, 1);
    /* 斜方肌隆起：无头巨人的肩线要塌下去，否则像被砍了头的方块。
     * 但它**不能鼓成半球** —— 第一版 scale(4.0,1.5,2.2) 在胸口上方鼓出一个
     * 圆顶，截图里读作「一颗光头」，反而像有头。压扁到 1.1、加宽到 4.4，
     * 它才只是肩。 */
    mesh(sphGeo(1, 7), skin, 0, 13.8, 0, torso).scale.set(4.4, 1.1, 2.4);
    /* 断颈：颈口一圈暗红 + 一根残骨。这是「无头」唯一能一眼读出来的地方 */
    mesh(cylGeo(1.15, 1.4, 1.0, 8), M(0x5c1a14, { rough: 0.88 }), 0, 14.5, 0, torso);
    mesh(cylGeo(0.42, 0.5, 0.9, 6), M(0xe8e0c4, { rough: 0.5 }), 0.35, 15.0, 0.25, torso);
    const abs = mesh(boxGeo(5.4, 3.6, 3.2), skin, 0, 8.2, 0, torso);
    mesh(boxGeo(6.0, 1.6, 3.6), hide, 0, 6.0, 0, torso);           // 腰布
    mesh(boxGeo(1.4, 3.2, 0.4), hide, 0, 5.2, 1.6, torso);         // 垂布

    /* 双乳为目：两颗发光球嵌在胸口，外加一圈骨环 */
    a.parts.chestEyes = [];
    for (const sx of [-1, 1]) {
      const e = this._eye(torso, sx * 2.0, 12.4, 1.9, 0.82, 0xffe066, 2.4);
      a.parts.chestEyes.push(e);
      const rim = mesh(torusGeo(1.0, 0.16, 6, 12), hide, sx * 2.0, 12.4, 1.7, torso);
      rim.rotation.x = Math.PI * 0.5;
    }
    /* 脐为口：腹部一条横向裂口 + 上下牙 */
    const mouth = mesh(boxGeo(2.4, 0.5, 0.5), M(0x2a0a08), 0, 9.0, 1.7, torso);
    a.parts.bellyMouth = mouth;
    for (let i = 0; i < 5; i++) {
      mesh(coneGeo(0.13, 0.34, 4), M(0xe8e0c4, { rough: 0.4 }), (i - 2) * 0.5, 9.16, 1.86, torso);
    }

    /* 双臂：各三段（上臂 / 前臂 / 手），右手持斧、左手持盾 */
    const arms = {};
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 4.3, 13.6, 0);
      torso.add(sh);
      mesh(sphGeo(1.5, 7), skin, 0, 0, 0, sh);
      this._tube(sh, skin, [0, 0, 0], [sx * 0.5, -4.2, 0], 1.3, 1.05, 7);
      const el = new THREE.Group(); el.position.set(sx * 0.5, -4.2, 0); sh.add(el);
      this._tube(el, skin, [0, 0, 0], [sx * 0.2, -3.8, 0], 1.0, 0.86, 7);
      const hand = new THREE.Group(); hand.position.set(sx * 0.2, -3.8, 0); el.add(hand);
      mesh(boxGeo(1.2, 1.4, 1.2), skin, 0, -0.6, 0, hand);
      arms[sx > 0 ? 'R' : 'L'] = { sh, el, hand };
    }
    a.parts.armR = arms.R; a.parts.armL = arms.L;

    /* 右斧：**举着**，不是垂着。
     * 第一版把斧刃放在手的 -3.4 处（世界 y≈2.6），20 米高的巨人手里那把斧头
     * 直接拖到脚踝 —— 截图里像脚下多了一块木板，完全读不出「持斧」。
     * 现在斧柄从手**往上**伸 6.2 米，刃口在手以上 5 米（世界 y≈11.5，胸口高度），
     * 挥砍时随小臂整体抡下，读作「举斧过顶」。 */
    const axe = new THREE.Group(); axe.position.set(0.1, 0, 0.3); arms.R.hand.add(axe);
    this._tube(axe, dark, [0, -1.6, 0], [0, 6.2, 0], 0.26, 0.30, 6);
    /* 斧头：**刃面朝前**（薄在 z 轴、宽在 x 轴）。
     * 第一版薄在 x 轴、刃口往 +x 伸 —— 那是一片竖着的窄板，
     * 从游戏那台斜 45° 的相机看只剩一条边，读不出是斧。 */
    mesh(boxGeo(3.2, 3.0, 0.6), metal, 1.5, 5.0, 0, axe);
    const bladeEdge = mesh(boxGeo(1.0, 3.6, 0.34), steel, 3.1, 5.0, 0, axe);
    bladeEdge.rotation.z = -0.06;
    /* 斧柄顶端一颗铜箍：举起来的时候斧头才不会看着像「飘在柄外面」 */
    mesh(cylGeo(0.36, 0.36, 0.5, 8), metal, 0, 6.0, 0, axe);
    a.parts.axe = axe;

    /* 左盾：圆盘 + 中心凸 + 一圈铆钉。
     * 盘面必须**朝前**（+Z）：第一版 rotation.z = 90° 让盘轴沿 X，
     * 从正面看只剩一条边，截图里像个挂在手边的黑饼。 */
    const shield = new THREE.Group(); shield.position.set(0, -0.9, 0.6); arms.L.hand.add(shield);
    const disc = mesh(cylGeo(2.3, 2.3, 0.42, 12), metal, 0, 0, 0, shield);
    disc.rotation.x = Math.PI * 0.5;
    mesh(sphGeo(0.7, 7), steel, 0, 0, 0.4, shield).scale.set(1, 1, 0.6);
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      mesh(sphGeo(0.16, 5), steel, Math.cos(ang) * 1.7, Math.sin(ang) * 1.7, 0.3, shield);
    }
    a.parts.shield = shield;

    /* 双腿：粗壮，各三段 */
    a.parts.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 1.9, 5.6, 0); torso.add(hip);
      this._tube(hip, skin, [0, 0, 0], [0, -2.8, 0.2], 1.5, 1.2, 7);
      const knee = new THREE.Group(); knee.position.set(0, -2.8, 0.2); hip.add(knee);
      this._tube(knee, skin, [0, 0, 0], [0, -2.2, 0], 1.1, 0.9, 7);
      mesh(boxGeo(1.9, 0.7, 3.0), hide, 0, -2.5, 0.5, knee);     // 靴 / 脚
      a.parts.legs.push({ hip, knee, sx });
    }
  },

  /* ============================================================
   * 6. 九尾狐 —— 四足狐身 26 米，九条独立尾（各五节），狐首双耳
   * ============================================================ */
  _build_ninetail(a, cfg, d) {
    const g = a.group;
    const fur = reg(a, M(cfg.color, { rough: 0.9 }));
    const furLight = reg(a, M(cfg.skin, { rough: 0.88 }));
    const dark = reg(a, M(cfg.cloth, { rough: 0.92 }));

    const torso = new THREE.Group(); g.add(torso);
    a.parts.torso = torso; a.torsoBaseY = 0;

    /* 狐身：26 长，肩高 7，腰略塌 */
    const body = mesh(sphGeo(1, 10), fur, 0, 6.4, -1, torso);
    body.scale.set(3.2, 3.0, 7.0);   // 半轴 → 体长 14 米；第一版 9.2 让身子就有 18 米
    const chest = mesh(sphGeo(1, 9), fur, 0, 6.9, 7.0, torso);
    chest.scale.set(3.0, 3.2, 4.0);
    /* 颈 → 狐首。**颈要细、要立、头要高过肩背**。
     * 第一版颈是 2.1→1.55 米的粗管、只比背高 1 米，头就架在背线上，
     * 整只读作「野猪」—— 这是九尾狐最不能犯的错。 */
    const neckG = new THREE.Group(); neckG.position.set(0, 9.0, 8.8); torso.add(neckG);
    a.parts.headG = neckG;
    this._tube(neckG, fur, [0, -1.8, -1.6], [0, 2.0, 0.4], 1.85, 1.15, 8);
    const skull = mesh(sphGeo(1, 8), fur, 0, 3.1, 1.6, neckG);
    skull.scale.set(1.6, 1.5, 1.9);
    /* 长吻（狐的标志）：从颅前平伸，**不能朝下** —— 朝下就是猪鼻子 */
    const muzzle = mesh(boxGeo(1.4, 1.1, 2.6), furLight, 0, 2.75, 3.4, neckG);
    mesh(boxGeo(0.65, 0.45, 0.5), M(0x2a1410), 0, 2.85, 4.7, neckG);     // 鼻
    /* 双耳：大而尖，外橙内白 */
    for (const sx of [-1, 1]) {
      const ear = mesh(coneGeo(0.82, 2.6, 4), fur, sx * 1.0, 4.5, 0.9, neckG);
      ear.rotation.set(-0.16, 0, sx * 0.26);
      mesh(coneGeo(0.44, 1.7, 4), furLight, sx * 1.0, 4.4, 1.1, neckG).rotation.set(-0.16, 0, sx * 0.26);
    }
    /* 眼：青白色的狐火瞳（与 P3「狐火焚天」同一色系） */
    for (const sx of [-1, 1]) this._eye(neckG, sx * 0.72, 3.25, 2.8, 0.26, 0x9ae8ff, 2.0);

    /* 四足：细长（狐的比例），每条两段 */
    a.parts.legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 2.5, 5.0, sz > 0 ? 6.6 : -5.6);
        torso.add(hip);
        mesh(sphGeo(1.1, 6), fur, 0, 0, 0, hip);
        this._tube(hip, fur, [0, 0, 0], [sx * 0.3, -2.4, sz * 0.3], 0.92, 0.68, 6);
        const knee = new THREE.Group(); knee.position.set(sx * 0.3, -2.4, sz * 0.3); hip.add(knee);
        this._tube(knee, fur, [0, 0, 0], [0, -2.3, 0], 0.64, 0.5, 6);
        mesh(boxGeo(0.9, 0.5, 1.5), furLight, 0, -2.5, 0.3, knee);      // 爪
        a.parts.legs.push({ hip, knee, sx, sz });
      }
    }

    /* 九条尾：各五节，从尾根扇形展开。
     *
     * 三条从截图里学到的：
     * 【1】**不能是一张平面扇**。第一版九条尾的 pitch 只跟水平角有关、
     *      全部落在同一个锥面上，正面看是一把「打开的折扇」，侧面看是一条线。
     *      现在奇偶条错开 0.16 rad，尾根也按水平角在臀上摊开 1.5 米 ——
     *      有了前后层次，才像「九条尾巴」而不是「一片鳍」。
     * 【2】**不能太细**。第一版根 0.86 收 0.21，10 米长只有 0.2 米粗，
     *      截图里是一排针。根 1.12 收 0.35 才立得住。
     * 【3】尾尖是**三股炸开的毛**，不是一根锥。九尾狐的辨识度全在尾尖那一团白。 */
    a.parts.tails = [];
    const rootP = [0, 7.0, -9.4];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;                                   // 0..1
      const yaw = (t - 0.5) * Math.PI * 0.72;            // ±65°
      const odd = i % 2 === 1;
      /* 抬高角：中间高、两侧低。第一版 0.62 rad 让尾巴翘到 23 米高
       * （狐身才 8 米），整只看起来像一盆火而不是九尾狐。
       * 0.22 rad ≈ 13°，逐节再抬 0.055 —— 尾尖落在 12 米左右，
       * **低于狐首**（14.8 米）：头必须是最高点，否则剪影会变成「一丛尾」。 */
      const pitch = 0.22 - Math.abs(t - 0.5) * 0.26 + (odd ? -0.14 : 0.04);
      const chain = new THREE.Group();
      /* 尾根沿臀部摊开：不然九条尾从同一个点长出来，根部会糊成一坨 */
      chain.position.set(rootP[0] + Math.sin(yaw) * 1.5,
        rootP[1] + (odd ? 0 : 0.55),
        rootP[2] - Math.cos(yaw) * 0.5);
      torso.add(chain);
      let prev = [0, 0, 0];
      const nodes = [];
      /* 每条尾 5 节 × 2.05 米 ≈ 12.7 米。第一版 3.6 让整只展开到 42 米宽，
       * 比它自己 26 米的身子还大 —— 剪影会变成「一团尾巴带个脑袋」。 */
      const segLen = 2.05 - Math.abs(t - 0.5) * 0.24;
      /* 毛量剖面：**中段鼓、末端收**。第一版是线性收细（1.12→0.34），
       * 五节一条直线下来就是一根锥子 —— 截图里九条尾像九把刀。
       * 狐尾是「根部细、中段蓬、尾尖再收」的，靠这条剖面才有毛感。 */
      const prof = [0.70, 1.08, 1.20, 1.00, 0.70, 0.36];
      const baseR = 1.05 - Math.abs(t - 0.5) * 0.16;
      for (let s = 0; s < 5; s++) {
        /* 逐节上扬 + 逐节外张：**弧线**。第一版五节共用同一个 dir，
         * 所以每条尾都是一条笔直的线段，九条排开就是一把打开的折扇。 */
        const ps = pitch + s * 0.055;
        const ys = yaw * (1 + s * 0.05);
        const d = [Math.sin(ys) * Math.cos(ps), Math.sin(ps), -Math.cos(ys) * Math.cos(ps)];
        const nxt = [prev[0] + d[0] * segLen, prev[1] + d[1] * segLen, prev[2] + d[2] * segLen];
        const r0 = baseR * prof[s], r1 = baseR * prof[s + 1];
        /* 尾根深色、末端转白 —— 九尾狐的经典配色 */
        const mat = s < 3 ? fur : furLight;
        this._tube(chain, mat, prev, nxt, r0, r1, 7);
        this._joint(chain, mat, nxt, r1 * 1.06);
        nodes.push(nxt);
        prev = nxt;
      }
      /* 尾尖：三股炸开的白毛（朝尾根那节的方向继续） */
      const up = new THREE.Vector3(0, 1, 0);
      const dEnd = nodes.length > 1
        ? new THREE.Vector3(nodes[4][0] - nodes[3][0], nodes[4][1] - nodes[3][1], nodes[4][2] - nodes[3][2]).normalize()
        : new THREE.Vector3(0, 1, 0);
      for (let k = -1; k <= 1; k++) {
        const sp = 0.34 * k;
        const d2 = new THREE.Vector3(
          dEnd.x * Math.cos(sp), dEnd.y + Math.abs(sp) * 0.5, dEnd.z * Math.cos(sp)
        ).normalize();
        const tip = mesh(coneGeo(0.34, 2.2, 5), furLight,
          prev[0] + d2.x * 0.9, prev[1] + d2.y * 0.9, prev[2] + d2.z * 0.9, chain);
        tip.quaternion.setFromUnitVectors(up, d2);
      }
      /* sign 给「展开」用：正的往右摊、负的往左摊，**正中间那条给 0**。
       * 中间那条如果也给 +1，展开时它会整个偏到右边，扇形立刻不对称。 */
      a.parts.tails.push({ g: chain, nodes, yaw, pitch, sign: yaw > 0 ? 1 : (yaw < 0 ? -1 : 0), phase: i * 0.42 });
    }
  },

  /* ============================================================
   * 动画。由 `updateActorAnim` 开头分派（`a.wbModel` 存在时接管）
   * ============================================================ */
  anim(a, dt) {
    const P = a.parts;
    const t = a.time = (a.time || 0) + dt;

    /* 死亡：巨兽倒下要比小怪慢，而且不能整个翻过去 ——
     * 44 米的蛇翻转会穿到地面以下。所以只做「侧倾 + 下沉」。 */
    if (a.anim === 'die') {
      a.dieT = (a.dieT || 0) + dt;
      const k = Math.min(1, a.dieT * 1.6);
      a.group.rotation.z = LERP(a.group.rotation.z, 0.55 * k, dt * 2.2);
      a.group.position.y = LERP(a.group.position.y, -1.2 * k, dt * 1.6);
      return;
    }

    const moving = a.moving ? 1 : 0;
    const kind = a.animKind || '';

    /* 呼吸：所有巨兽共用的低频起伏（0.35Hz，比小怪的 2.4 慢得多） */
    const breath = Math.sin(t * 1.1) * 0.35 + Math.sin(t * 0.43) * 0.2;

    if (kind === 'wbCoil') {
      /* 烛九阴：盘着的身体缓慢蠕动 + 颈像蛇一样左右摆 + 头微顿 */
      if (P.spine) {
        for (let i = 0; i < P.spine.length; i++) {
          const m = P.spine[i];
          if (!m) continue;
          m.position.y += Math.sin(t * 0.9 + i * 0.55) * 0.006 * (1 + moving);
          m.rotation.y = Math.sin(t * 0.7 + i * 0.4) * 0.02;
        }
      }
      if (P.neck) {
        /* 颈的位置是建模时算好的，这里只做「整条颈的轻微摆」——
         * 改节点坐标会让头和身子脱节，所以摆动交给 headG 的 rotation。 */
      }
      if (P.headG) {
        P.headG.rotation.y = Math.sin(t * 0.62) * 0.22;
        P.headG.rotation.x = Math.sin(t * 0.9 + 0.6) * 0.08 + (a.atkAnim > 0 ? -0.2 * a.atkAnim : 0);
        /* **不要写 `P.headG.position`**：它的 position 是建模时算好的颈顶
         * （0, 9.4, 1.2 之类）。写一次就把头拽到躯干原点，
         * 表现是「头和脖子分家，一颗头飘在盘蛇中心」。 */
      }
      if (P.torso) P.torso.rotation.y = Math.sin(t * 0.3) * 0.02;
      return;
    }

    if (kind === 'wbNecks') {
      /* 相柳：九条颈各自独立摆动（相位错开），像九条各自有想法的蛇。
       * 这是它「九首」的读法 —— 同步摆动会变成海葵。 */
      if (P.necks) {
        for (const n of P.necks) {
          const ph = n.phase;
          n.head.rotation.y = Math.sin(t * 1.5 + ph) * 0.42;
          n.head.rotation.x = Math.sin(t * 1.9 + ph * 1.3) * 0.22;
          n.head.position.y = Math.sin(t * 1.2 + ph) * 0.28;
        }
      }
      if (P.torso) {
        P.torso.rotation.y = Math.sin(t * (moving ? 2.2 : 0.7)) * 0.06;
        P.torso.position.y = breath * 0.5;
      }
      return;
    }

    if (kind === 'wbMorph') {
      /* 鲲鹏：鲲时双鳍慢摆，鹏时双翼拍打（频率差 4 倍，一眼看出换形态了） */
      const peng = P.peng && P.peng.visible;
      if (peng) {
        const flap = Math.sin(t * 2.6) * 0.34 + 0.1;
        if (P.wings) for (const w of P.wings) {
          w.upper.rotation.z = w.sx * flap;
          w.fore.rotation.z = w.sx * flap * 0.55;
          w.tip.rotation.z = w.sx * flap * 0.35;
        }
        if (P.torso) P.torso.position.y = Math.sin(t * 2.6) * 0.55;
      } else {
        if (P.fins) for (const f of P.fins) {
          f.g.rotation.z = f.sx * (Math.sin(t * 0.9) * 0.16 + 0.06);
          f.g.rotation.x = Math.sin(t * 0.7 + 1.2) * 0.1;
        }
        if (P.torso) P.torso.position.y = breath * 0.4;
      }
      if (P.torso) P.torso.rotation.y = Math.sin(t * 0.4) * 0.03;
      return;
    }

    if (kind === 'wbMaw') {
      /* 饕餮：呼吸时上下颚微微开合，攻击时张到 120°。
       * 120° = 每侧 60° = 1.047 rad。 */
      const open = a.atkAnim > 0
        ? Math.sin((1 - a.atkAnim) * Math.PI) * 1.047
        : 0.10 + Math.sin(t * 0.8) * 0.06;
      if (P.jawUp) P.jawUp.rotation.x = -open * 0.5;
      if (P.jawDn) P.jawDn.rotation.x = open * 0.5;
      if (P.legs) for (const l of P.legs) {
        l.knee.rotation.x = Math.sin(t * (moving ? 4 : 0.9) + (l.sz > 0 ? 0 : Math.PI)) * (moving ? 0.28 : 0.05);
      }
      if (P.torso) {
        P.torso.position.y = breath * 0.7;
        P.torso.rotation.x = Math.sin(t * 0.7) * 0.012;
      }
      return;
    }

    if (kind === 'wbHeadless') {
      /* 刑天：无头，所以「表情」全靠手臂。走路时斧盾前后摆，
       * 攻击时右臂抡起（斧）或左臂顶出（盾）。 */
      const sw = Math.sin(t * (moving ? 3.2 : 0.9)) * (moving ? 0.34 : 0.06);
      if (P.armR) {
        P.armR.sh.rotation.x = -sw + (a.atkAnim > 0 ? -Math.sin((1 - a.atkAnim) * Math.PI) * 1.5 : 0);
        P.armR.el.rotation.x = -0.24 - Math.abs(sw) * 0.2;
      }
      if (P.armL) {
        P.armL.sh.rotation.x = sw * 0.7;
        P.armL.el.rotation.x = -0.5;                 // 持盾的手一直抬着
      }
      if (P.legs) for (let i = 0; i < P.legs.length; i++) {
        const l = P.legs[i];
        l.hip.rotation.x = (i === 0 ? 1 : -1) * sw * 0.8;
        l.knee.rotation.x = Math.max(0, (i === 0 ? 1 : -1) * sw) * 0.5;
      }
      if (P.torso) {
        P.torso.position.y = Math.abs(Math.sin(t * (moving ? 3.2 : 0.9))) * (moving ? 0.12 : 0.04);
        P.torso.rotation.z = Math.sin(t * 1.6) * 0.02;
      }
      /* 胸口的「目」随呼吸明暗 —— 它是这只 Boss 唯一的表情 */
      if (P.chestEyes) for (const e of P.chestEyes) {
        if (e.material) e.material.emissiveIntensity = 1.9 + Math.sin(t * 1.4) * 0.7;
      }
      return;
    }

    if (kind === 'wbTails') {
      /* 九尾狐：九条尾各自摆动（相位错开 0.42 rad），整体像一团火在动。
       * 同步摆动会变成「一把扫帚」，那是最难看的失败形态。 */
      if (P.tails) {
        /* `a.tailFlare`（0~1）是 P2「九尾缚」的展开量，由 `setTails` 写。
         * 展开要**加在摆动之上**，不能替代摆动 —— 替代的话一进 P2
         * 九条尾就定住不动，看着像模型卡了。 */
        const fl = a.tailFlare || 0;
        for (const tl of P.tails) {
          const ph = tl.phase;
          /* rotation.y 要**取负**：尾巴朝 -Z 长，绕 Y 正向转是把它往中间收。
           * 第一版写成正号，展开反而把扇形收窄了（24.3 → 18.2 米）。 */
          tl.g.rotation.y = -(tl.sign || 0) * fl * 0.55 + Math.sin(t * 1.3 + ph) * 0.14;
          tl.g.rotation.x = fl * 0.16 + Math.sin(t * 1.05 + ph * 1.4) * 0.10;
          tl.g.rotation.z = Math.sin(t * 0.9 + ph * 0.8) * 0.08;
        }
      }
      if (P.legs) for (const l of P.legs) {
        l.knee.rotation.x = Math.sin(t * (moving ? 4.4 : 1.0) + (l.sz > 0 ? 0 : Math.PI)) * (moving ? 0.3 : 0.04);
      }
      if (P.headG) {
        P.headG.rotation.y = Math.sin(t * 0.8) * 0.18;
        P.headG.rotation.x = Math.sin(t * 1.2 + 0.5) * 0.06;
      }
      if (P.torso) {
        P.torso.position.y = breath * 0.55;
        P.torso.rotation.y = Math.sin(t * (moving ? 2.6 : 0.6)) * 0.05;
      }
      return;
    }

    /* 兜底：只做呼吸，别让没登记 animKind 的模型僵住 */
    if (P.torso) P.torso.position.y = breath * 0.5;
  },

  /* 鲲 ↔ 鹏 ↔ 同体 切换。由 `WBFight._applyEnter` 的 `morph` 调用。
   *
   * 注意：**两套模型共享同一个根**，切换只是 visible 翻转 ——
   * 重建模型会让「同一只 boss 换了皮」变成「换了一只怪」，
   * 而且血条 / 名字牌 / 领域光环全挂在根上，重建就全丢了。
   *
   * 三档语义（数据里 phases 的三个 enter 一一对应）：
   *   kun  = 只有鱼
   *   peng = 只有鸟（鱼藏起来，连鱼鳍一起）
   *   both = P3「鲲鹏同体」= **鱼身 + 双翼**，鸟身与鸟首藏掉。
   *          不藏的话就是「一条鱼和一个鸟叠在一起」，那是最难看的形态。 */
  setMorph(a, which) {
    if (!a || !a.parts) return false;
    const P = a.parts;
    if (!P.kun || !P.peng) return false;
    if (which === 'peng') {
      P.kun.visible = false; P.peng.visible = true;
      if (P.pengBody) P.pengBody.visible = true;
    } else if (which === 'both') {
      P.kun.visible = true; P.peng.visible = true;
      if (P.pengBody) P.pengBody.visible = false;
    } else {
      P.kun.visible = true; P.peng.visible = false;
      if (P.pengBody) P.pengBody.visible = true;   // 还原，下次切鹏时是对的
    }
    a.wbMorph = which;
    return true;
  },

  /* 九尾展开（九尾狐 P2「九尾缚」的 `enter.tails`）。
   *
   * `spread` 只存一个 0~1 的标量，真正的姿态在 `anim` 里和摆动叠加算 ——
   * 这里直接写九条 chain 的 rotation 会被下一帧的 anim 覆盖掉，
   * 表现是「展开一瞬间就没了」。 */
  setTails(a, spread) {
    if (!a || !a.parts || !a.parts.tails) return false;
    a.tailFlare = Math.max(0, Math.min(1, spread || 0));
    return true;
  },

  /* 半透明「影子态」（九尾狐 P3「真身现身」的 `enter.revealVuln`）。
   *
   * 用的是**材质透明度**而不是 `visible=false`：
   * 藏起来的话玩家会以为 boss 消失了，还会丢失「打中的是影子」这层意思。
   * `transparent` 开关会触发一次 shader 重编译（6 个材质），
   * 每 9 秒一次，可以接受；常开 `transparent: true` 反而会让六只
   * 巨兽全掉进透明渲染队列，排序问题更难收拾。 */
  setGhost(a, on) {
    if (!a || !a.mats) return false;
    for (const m of a.mats) {
      if (!m) continue;
      if (on) {
        m.transparent = true;
        m.opacity = 0.42;
        m.depthWrite = false;
      } else {
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
      }
      m.needsUpdate = true;
    }
    a.ghost = !!on;
    return true;
  }
};

/* 供 game.js / 测试脚本判断「这个 model 是不是世界 Boss 的新骨架」 */
function isWbModel(name) { return typeof WBModels !== 'undefined' && WBModels.has(name); }
