/* ============================================================
 * 古风低模角色生成器 —— 正式版（进 src，替换盒子人）
 *
 * 设计契约（和 buildHumanoid 完全一致，所以动画/换装/武器/AI 全部零改动复用）：
 *   root
 *    ├ legL / legR     髋关节 (±0.145, 0.92)  ── kneeL / kneeR（古风版才有，用于屈膝）
 *    ├ torso           躯干 (0, 0.92)
 *    │   ├ armL / armR 肩关节 (±0.295, 0.52)  ── elbowL / elbowR
 *    │   ├ headG       颈 (0, 0.70)
 *    │   └ capeArt     披风本体（只在对应用职业时创建）
 *    ├ skirt           下摆
 *    └ —— 以下全是「空挂点」，换装时会 clearGroup，绝不允许放装饰件 ——
 *        helmG / shoulderL / shoulderR / capeG / weaponHand / offHand
 *
 * parts 材质契约：skinMat clothMat cloth2Mat metalMat legMat bootMat sleeveMat handMat
 * parts 网格契约：chestMesh（护甲会替换它的材质）
 *
 * 坐标：Y 向上、角色朝 +Z、脚底 y=0、身高约 1.88
 * ============================================================ */
(function (global) {
  'use strict';

  function MAT(c, o) {
    o = o || {};
    const m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: o.rough == null ? 0.84 : o.rough,
      metalness: o.metal == null ? 0.04 : o.metal,
      flatShading: true
    });
    if (o.emissive != null) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei == null ? 0.4 : o.ei;
    }
    return m;
  }

  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 8, 1),
    cone: (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 8),
    sph: (r, seg) => new THREE.SphereGeometry(r, seg || 10, Math.max(4, Math.round((seg || 10) * 0.7))),
    dome: (r, w, h, len) => new THREE.SphereGeometry(r, w || 10, h || 8, 0, Math.PI * 2, 0, len || Math.PI * 0.6)
  };

  function put(parent, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function slot(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    parent.add(g);
    return g;
  }

  /* ---------------- 三职业造型参数 ----------------
   * 取色：朱红/墨铁/赤金（战士）、靛青/月白/银（法师）、青碧/米白/黄铜（道士） */
  const CFG = {
    warrior: {
      label: '战士 · 刀客',
      skin: 0xe2b78f, hair: 0x17130f,
      cloth: 0x9a3226, cloth2: 0x561b16, armor: 0x413c34, trim: 0xc9a227,
      pants: 0x2b2420, boot: 0x241d18,
      robe: 'armor', shoulder: 'plate', head: 'band', cape: true,
      weapon: 'saber', longSleeve: false, beard: false, build: 1.06
    },
    mage: {
      label: '法师 · 术士',
      skin: 0xf0d0b0, hair: 0x141018,
      cloth: 0x35507e, cloth2: 0x1d2f4d, armor: 0x6a7390, trim: 0xd7d2b8,
      pants: 0x243a5c, boot: 0x1a1a22,
      robe: 'long', shoulder: 'silk', head: 'guan', cape: false,
      weapon: 'staff', longSleeve: true, beard: false, build: 0.96
    },
    taoist: {
      label: '道士 · 符师',
      skin: 0xeed3b0, hair: 0x171310,
      cloth: 0x2e5f4c, cloth2: 0xe4dcc0, armor: 0x8a7a4a, trim: 0x9a8248,
      pants: 0x2a4a3e, boot: 0x1d1a16,
      robe: 'long', shoulder: 'silk', head: 'daoguan', cape: false,
      weapon: 'sword', longSleeve: true, beard: true, build: 0.98
    }
  };

  /* ---------------- 武器（古风：大刀 / 云头杖 / 桃木剑） ---------------- */
  function weapon(kind, cfg) {
    const g = new THREE.Group();
    const metal = MAT(cfg.armor, { rough: 0.35, metal: 0.72 });
    const gold = MAT(cfg.trim, { rough: 0.3, metal: 0.86 });
    const wood = MAT(0x6b4a2c, { rough: 0.95 });

    if (kind === 'saber') {
      /* 刀长控制在 1.24 米（原本 1.40，举刀时会顶出画面、劈砍时容易扎穿地面） */
      const blade = put(g, G.box(0.105, 0.88, 0.045), metal, 0, 0.62, 0);
      blade.rotation.z = -0.04;
      put(g, G.cone(0.060, 0.26, 4), metal, 0.045, 1.11, 0).rotation.z = -0.10;
      put(g, G.cyl(0.072, 0.072, 0.05, 8), gold, 0, 0.185, 0);
      put(g, G.cyl(0.034, 0.040, 0.34, 6), wood, 0, 0.01, 0);
      put(g, G.box(0.05, 0.06, 0.05), gold, 0, -0.17, 0);
    } else if (kind === 'staff') {
      put(g, G.cyl(0.030, 0.042, 1.56, 6), wood, 0, 0.52, 0);
      put(g, G.cyl(0.048, 0.048, 0.05, 6), gold, 0, 0.28, 0);
      put(g, G.cyl(0.048, 0.048, 0.05, 6), gold, 0, 0.88, 0);
      const head = put(g, G.sph(0.082, 8), MAT(cfg.trim, { rough: 0.4, metal: 0.4, emissive: cfg.trim, ei: 0.5 }),
        0, 1.34, 0);
      head.scale.set(1, 1.25, 1);
      put(g, G.cyl(0.098, 0.052, 0.10, 8), gold, 0, 1.22, 0);
      const halo = put(g, G.sph(0.125, 10), MAT(cfg.trim, { rough: 0.4, metal: 0.3, emissive: cfg.trim, ei: 0.22 }),
        0, 1.34, 0);
      halo.scale.set(1, 1.25, 1);
      halo.material.transparent = true;
      halo.material.opacity = 0.18;
    } else if (kind === 'sword') {
      put(g, G.box(0.044, 1.00, 0.022), wood, 0, 0.60, 0);
      put(g, G.box(0.048, 0.10, 0.026), gold, 0, 1.12, 0);
      put(g, G.box(0.155, 0.035, 0.05), gold, 0, 0.10, 0);
      put(g, G.cyl(0.031, 0.034, 0.24, 6), wood, 0, -0.03, 0);
      put(g, G.box(0.020, 0.20, 0.020), MAT(0xb5352c, { rough: 0.9 }), 0, -0.03, 0.026);
      put(g, G.box(0.095, 0.155, 0.008), MAT(0xe8dfa8, { emissive: 0xd8c060, ei: 0.35, rough: 0.9 }),
        0.085, 0.70, 0.012, 0, 0, 0.12);
    }
    return g;
  }

  /* ---------------- 主体 ---------------- */
  function build(cls, opt) {
    const base = CFG[cls];
    if (!base) return null;
    opt = opt || {};
    const cfg = Object.assign({}, base, opt);      // opt 可覆盖配色（NPC 用）

    const root = new THREE.Group();
    const A = {
      group: root, mats: [], parts: {}, cls, cfg,
      cf: true,                     // 标记：古风角色，走 charforge 的动画
      torsoBaseY: 0.92,
      time: 0, walkPhase: 0, walkAmp: 0
    };

    const mSkin = reg(A, MAT(cfg.skin, { rough: 0.62 }));
    const mCloth = reg(A, MAT(cfg.cloth, { rough: 0.9 }));
    const mCloth2 = reg(A, MAT(cfg.cloth2, { rough: 0.92 }));
    const mArmor = reg(A, MAT(cfg.armor, { rough: 0.4, metal: 0.56 }));
    const mTrim = reg(A, MAT(cfg.trim, { rough: 0.34, metal: 0.8 }));
    const mHair = reg(A, MAT(cfg.hair, { rough: 0.88 }));
    const mPants = reg(A, MAT(cfg.pants, { rough: 0.92 }));
    const mBoot = reg(A, MAT(cfg.boot, { rough: 0.78 }));
    const mSleeve = reg(A, MAT(cfg.cloth, { rough: 0.9 }));
    const mHand = reg(A, MAT(cfg.skin, { rough: 0.66 }));

    /* —— 材质契约 —— */
    A.parts.skinMat = mSkin;
    A.parts.clothMat = mCloth;
    A.parts.cloth2Mat = mCloth2;
    A.parts.metalMat = mArmor;
    A.parts.legMat = mPants;
    A.parts.bootMat = mBoot;
    A.parts.sleeveMat = mSleeve;
    A.parts.handMat = mHand;

    const w = cfg.build;
    const hipY = 0.92;

    /* ================= 腿 ================= */
    for (const side of [-1, 1]) {
      const leg = slot(root, side * 0.145 * w, hipY, 0);
      put(leg, G.cyl(0.108, 0.090, 0.46, 7), mPants, 0, -0.23, 0);

      const knee = slot(leg, 0, -0.46, 0);
      put(knee, G.cyl(0.090, 0.072, 0.36, 7), mPants, 0, -0.18, 0);
      put(knee, G.cyl(0.098, 0.090, 0.16, 7), mBoot, 0, -0.29, 0);      // 靴筒
      put(knee, G.box(0.150, 0.10, 0.265), mBoot, 0, -0.41, 0.05);      // 靴底
      put(knee, G.box(0.100, 0.045, 0.055), mTrim, 0, -0.235, 0.108);   // 靴口铜扣

      if (side < 0) { A.parts.legL = leg; A.parts.kneeL = knee; }
      else { A.parts.legR = leg; A.parts.kneeR = knee; }
    }

    /* ================= 躯干 ================= */
    const torso = slot(root, 0, hipY, 0);
    A.parts.torso = torso;

    put(torso, G.cyl(0.185 * w, 0.208 * w, 0.22, 8), mCloth, 0, 0.10, 0);        // 腹
    const chest = put(torso, G.cyl(0.222 * w, 0.186 * w, 0.30, 8), mCloth, 0, 0.35, 0);
    A.parts.chestMesh = chest;                                                    // 换装会用
    put(torso, G.box(0.432 * w, 0.100, 0.262), cfg.robe === 'armor' ? mArmor : mCloth2, 0, 0.482, 0);  // 肩线

    /* 交领右衽：两襟在胸前交叉成 V */
    put(torso, G.box(0.044, 0.27, 0.020), mCloth2, -0.063 * w, 0.365, 0.170, 0, 0, 0.46);
    put(torso, G.box(0.044, 0.27, 0.020), mCloth2, 0.063 * w, 0.365, 0.170, 0, 0, -0.46);
    put(torso, G.box(0.040, 0.24, 0.016), mCloth2, 0.106 * w, 0.245, 0.178, 0, 0, -0.13);

    /* 腰封 + 玉扣 */
    put(torso, G.cyl(0.200 * w, 0.206 * w, 0.098, 8), mCloth2, 0, 0.005, 0);
    put(torso, G.box(0.082, 0.082, 0.026), mTrim, 0, 0.005, 0.192 * w);

    /* 肩部：甲片 or 云肩（属于身体造型，不是换装挂点） */
    for (const side of [-1, 1]) {
      if (cfg.shoulder === 'plate') {
        const pa = slot(torso, side * 0.248 * w, 0.472, 0);
        pa.rotation.z = side * -0.20;
        put(pa, G.cyl(0.118, 0.136, 0.090, 7), mArmor, 0, 0, 0);
        put(pa, G.cyl(0.136, 0.154, 0.075, 7), mArmor, 0, -0.070, 0);
        put(pa, G.cyl(0.156, 0.156, 0.020, 7), mTrim, 0, -0.108, 0);
      } else {
        put(torso, G.cyl(0.136, 0.170, 0.048, 7), mCloth2, side * 0.232 * w, 0.452, 0)
          .rotation.z = side * -0.16;
      }
    }

    /* ================= 颈 / 头 ================= */
    put(torso, G.cyl(0.058, 0.068, 0.10, 6), mSkin, 0, 0.585, 0);

    const headG = slot(torso, 0, 0.665, 0);
    A.parts.headG = headG;

    const skull = put(headG, G.sph(0.128, 10), mSkin, 0, 0.10, 0);
    skull.scale.set(1, 1.10, 0.95);
    A.parts.head = skull;
    put(headG, G.box(0.032, 0.052, 0.042), mSkin, -0.124, 0.09, 0);     // 耳
    put(headG, G.box(0.032, 0.052, 0.042), mSkin, 0.124, 0.09, 0);

    /* 眉眼鼻：低模靠这几笔出神态 */
    put(headG, G.box(0.046, 0.013, 0.012), mHair, -0.047, 0.132, 0.121, 0, 0, 0.16);
    put(headG, G.box(0.046, 0.013, 0.012), mHair, 0.047, 0.132, 0.121, 0, 0, -0.16);
    const eyeMat = reg(A, MAT(0x191410, { rough: 0.35 }));
    put(headG, G.box(0.034, 0.020, 0.012), eyeMat, -0.047, 0.104, 0.124);
    put(headG, G.box(0.034, 0.020, 0.012), eyeMat, 0.047, 0.104, 0.124);
    put(headG, G.box(0.026, 0.045, 0.035), mSkin, 0, 0.072, 0.126);      // 鼻

    /* 发：后脑罩 + 顶髻（罩子收一点，多露出脸） */
    put(headG, G.dome(0.136, 10, 8, Math.PI * 0.46), mHair, 0, 0.100, -0.012).scale.set(1, 1.06, 1);
    put(headG, G.sph(0.056, 8), mHair, 0, 0.262, -0.02);
    put(headG, G.cyl(0.044, 0.050, 0.052, 8), mTrim, 0, 0.228, -0.02);

    if (cfg.beard) {
      put(headG, G.cone(0.045, 0.18, 6), mHair, 0, -0.05, 0.085, 0.18, 0, 0);
      put(headG, G.box(0.100, 0.016, 0.020), mHair, 0, 0.062, 0.126);
    }

    /* 头饰（造型的一部分；换装的头盔挂在 helmG 空槽上） */
    if (cfg.head === 'band') {
      put(headG, G.cyl(0.138, 0.138, 0.038, 10), mTrim, 0, 0.152, 0).scale.set(1, 1, 0.98);
      put(headG, G.box(0.022, 0.20, 0.012), mCloth2, -0.05, 0.02, -0.136, 0.2, 0, 0.1);
      put(headG, G.box(0.022, 0.16, 0.012), mCloth2, 0.03, 0.04, -0.140, 0.15, 0, -0.1);
    } else if (cfg.head === 'guan') {
      put(headG, G.box(0.116, 0.086, 0.100), mTrim, 0, 0.315, -0.01);
      put(headG, G.box(0.136, 0.018, 0.020), mTrim, 0, 0.275, 0.046);
      put(headG, G.box(0.200, 0.016, 0.012), mCloth2, 0, 0.245, -0.116);
    } else {
      put(headG, G.cyl(0.062, 0.075, 0.085, 6), mCloth2, 0, 0.300, -0.01);   // 道巾
      put(headG, G.cyl(0.082, 0.082, 0.022, 6), mTrim, 0, 0.258, -0.01);
      put(headG, G.box(0.016, 0.26, 0.012), mCloth2, -0.06, 0.0, -0.133, 0.22, 0, 0.08);
      put(headG, G.box(0.016, 0.22, 0.012), mCloth2, 0.055, 0.02, -0.139, 0.18, 0, -0.06);
    }

    /* ================= 手臂 ================= */
    for (const side of [-1, 1]) {
      const arm = slot(torso, side * 0.288 * w, 0.520, 0);
      put(arm, G.cyl(0.072, 0.062, 0.34, 7), mSleeve, 0, -0.17, 0);

      /* 广袖：上窄下宽、向外张开，才像古装袖子而不是方块 */
      const cuffR = cfg.longSleeve ? 0.148 : 0.126;
      const sleeve = put(arm, G.cyl(0.086, cuffR, 0.34, 8), mSleeve, 0, -0.170, 0);
      sleeve.scale.set(1, 1, 0.9);
      put(arm, G.cyl(cuffR, cuffR, 0.024, 8), mCloth2, 0, -0.345, 0);   // 袖口

      const elbow = slot(arm, 0, -0.355, 0);
      put(elbow, G.cyl(0.055, 0.046, 0.26, 6), cfg.longSleeve ? mSleeve : mSkin, 0, -0.13, 0);
      if (!cfg.longSleeve) put(elbow, G.cyl(0.064, 0.058, 0.10, 6), mArmor, 0, -0.10, 0);  // 护腕
      put(elbow, G.box(0.072, 0.094, 0.058), mHand, 0, -0.30, 0);       // 手

      /* 副手 / 武器位：必须是空 Group（换装会 clearGroup） */
      const offSlot = slot(elbow, 0, -0.30, 0.03);
      const wpnSlot = slot(elbow, 0, -0.30, 0.02);

      if (side < 0) { A.parts.armL = arm; A.parts.elbowL = elbow; A.parts.offHand = offSlot; }
      else { A.parts.armR = arm; A.parts.elbowR = elbow; A.parts.weaponHand = wpnSlot; }
    }

    /* ================= 下摆 ================= */
    const skirt = slot(root, 0, hipY, 0);
    A.parts.skirt = skirt;

    if (cfg.robe === 'armor') {
      put(skirt, G.cyl(0.208 * w, 0.290 * w, 0.42, 8), mArmor, 0, -0.235, 0);
      put(skirt, G.cyl(0.294 * w, 0.294 * w, 0.030, 8), mTrim, 0, -0.445, 0);
      for (const side of [-1, 1]) {
        put(skirt, G.box(0.132, 0.38, 0.020), mArmor, side * 0.178 * w, -0.25, 0.188, 0.08, side * 0.62, 0);
      }
    } else {
      put(skirt, G.cyl(0.202 * w, 0.305 * w, 0.55, 8), mCloth, 0, -0.295, 0);
      put(skirt, G.cyl(0.307 * w, 0.310 * w, 0.026, 8), mCloth2, 0, -0.568, 0);
      put(skirt, G.box(0.116, 0.40, 0.014), mCloth2, -0.076, -0.36, 0.216, 0.10, 0, 0.05);
      put(skirt, G.box(0.116, 0.40, 0.014), mCloth2, 0.076, -0.36, 0.216, 0.10, 0, -0.05);
      put(skirt, G.box(0.170, 0.28, 0.012), mCloth2, 0, -0.31, -0.226, -0.10, 0, 0);
    }

    /* ================= 披风（本体，独立于 capeG 挂点） ================= */
    if (cfg.cape) {
      const capeArt = slot(torso, 0, 0.505, -0.148);
      capeArt.rotation.x = 0.12;
      const cMantle = put(capeArt, G.box(0.360, 0.780, 0.024), mCloth2, 0, -0.395, -0.020);
      cMantle.rotation.x = 0.04;
      put(capeArt, G.box(0.384, 0.048, 0.030), mTrim, 0, -0.020, 0);
      A.parts.capeArt = capeArt;
    }

    /* ================= 空挂点（换装专用） ================= */
    A.parts.helmG = slot(headG, 0, 0.16, 0);
    A.parts.shoulderL = slot(torso, -0.268 * w, 0.545, 0);
    A.parts.shoulderR = slot(torso, 0.268 * w, 0.545, 0);
    A.parts.capeG = slot(torso, 0, 0.520, -0.170);

    /* ================= 自带武器 ================= */
    if (cfg.weapon && !opt.noWeapon) {
      const w3 = weapon(cfg.weapon, cfg);
      if (cfg.weapon === 'saber') { w3.position.set(0.012, -0.02, 0.02); w3.rotation.set(-1.02, 0, Math.PI - 0.10); }
      else if (cfg.weapon === 'staff') { w3.position.set(0.02, -0.30, 0.02); w3.rotation.set(0, 0, -0.06); }
      else { w3.position.set(0.004, -0.02, 0.02); w3.rotation.set(0, 0, Math.PI + 0.10); }
      A.parts.weaponHand.add(w3);
      A.weapon = w3;
    }

    return typeof setFootR === 'function' ? setFootR(A) : A;
  }

  function reg(A, m) { A.mats.push(m); return m; }

  /* ---------------- 动作 ----------------
   * 走自己的曲线（有屈膝、袖子与下摆摆动），但读取的全是游戏原有状态：
   *   a.moving  a.atkAnim  a.atkSpeed  a.atkType  a.flash  a.anim === 'die'
   */
  function keyLerp(keys, t) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i], [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = (t - t0) / ((t1 - t0) || 1);
        return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
      }
    }
    return keys[keys.length - 1][1];
  }

  /* 各职业招牌动作：0→1 一次完整挥击
   * 通道说明：
   *   armRx / armRy / armRz  右肩三轴（x=前后抬落，y=水平横扫，z=外展内收）
   *   armL / elbowL          左手配合（挥击时向后甩，起平衡作用）
   *   twist                  拧腰（躯干绕 Y），是横向力量的主要来源
   *   lean                   前倾 / 后仰
   * 斜劈的关键：光靠 armRx 只会「手上下动」，必须 twist + armRy 叠加出水平弧线 */
  const ATK = {
    warrior: {
      /* 右上蓄力 → 扫过正前 → 左下触底 → 收势（收势时手臂留在身前，避免刀尖扎进地面） */
      armRx: [[0, 0], [0.16, -1.10], [0.30, -1.62], [0.40, -1.68], [0.52, -1.38], [0.66, -0.98], [0.80, -0.70], [0.92, -0.30], [1, 0]],
      armRy: [[0, 0], [0.16, 0.52], [0.30, 0.90], [0.40, 0.92], [0.52, -0.20], [0.66, -1.02], [0.80, -0.45], [0.92, -0.12], [1, 0]],
      armRz: [[0, 0], [0.16, 0.55], [0.30, 0.92], [0.40, 0.94], [0.52, 0.06], [0.66, -0.46], [0.80, -0.22], [0.92, -0.05], [1, 0]],
      elbowR: [[0, 0], [0.16, -0.62], [0.30, -1.08], [0.40, -1.12], [0.52, -0.42], [0.66, -0.18], [0.80, -0.10], [1, 0]],
      armL: [[0, 0], [0.30, 0.30], [0.40, 0.34], [0.58, -0.42], [0.74, -0.28], [0.90, -0.10], [1, 0]],
      elbowL: [[0, 0], [0.30, -0.50], [0.58, -0.30], [1, 0]],
      twist: [[0, 0], [0.16, 0.26], [0.30, 0.78], [0.40, 0.82], [0.52, -0.04], [0.66, -0.78], [0.80, -0.42], [0.92, -0.14], [1, 0]],
      lean: [[0, 0], [0.30, -0.10], [0.40, -0.13], [0.52, 0.05], [0.66, 0.22], [0.80, 0.14], [0.92, 0.04], [1, 0]],
      /* 沉身：屈膝 + 重心下压，挥砍的力量感主要来自这里 */
      sink: [[0, 0], [0.30, 0.10], [0.40, 0.12], [0.52, 0.32], [0.66, 0.46], [0.80, 0.34], [0.92, 0.12], [1, 0]]
    },
    mage: {
      armR: [[0, 0], [0.30, -1.10], [0.48, -1.15], [0.66, -1.95], [1, 0]],
      elbowR: [[0, 0], [0.30, -1.45], [0.48, -1.55], [0.66, -0.35], [1, 0]],
      armL: [[0, 0], [0.30, -0.95], [0.48, -1.00], [0.66, -1.85], [1, 0]],
      elbowL: [[0, 0], [0.30, -1.35], [0.48, -1.45], [0.66, -0.30], [1, 0]],
      lean: [[0, 0], [0.30, -0.16], [0.50, -0.18], [0.68, 0.14], [1, 0]]
    },
    taoist: {
      armR: [[0, 0], [0.22, -1.75], [0.40, -1.80], [0.58, -0.55], [0.74, -0.95], [1, 0]],
      armRz: [[0, 0], [0.22, 0.30], [0.40, 0.55], [0.58, -0.25], [1, 0]],
      elbowR: [[0, 0], [0.22, -1.30], [0.40, -1.45], [0.58, -0.25], [1, 0]],
      armL: [[0, 0], [0.30, -0.85], [0.50, -0.90], [1, 0]],
      elbowL: [[0, 0], [0.30, -1.60], [0.50, -1.70], [1, 0]],
      twist: [[0, 0], [0.30, -0.28], [0.58, 0.12], [1, 0]]
    }
  };

  /* 武器相对手的翻腕曲线（rotation.x）
   * 注意方向：负值让刀沿手的「前方」抬起，手臂举高后「前方」就变成了上方，
   * 刀尖反而翘起；要劈下去必须走正值（朝手的「下方」翻）。
   *   待机  -1.02  刀尖朝前下方，1.34 米长刀才不会插进地面
   *   蓄力  -0.26  刀顺着举臂朝上后方，像把刀举过头顶
   *   挥出  +0.60 甩腕翻下去
   *   触底  +0.95 刀尖扎向地面 */
  const WPN = {
    warrior: [[0, -1.02], [0.20, -0.80], [0.34, -0.88], [0.44, -0.86], [0.56, 0.16], [0.68, 0.10], [0.80, -0.55], [0.92, -0.85], [1, -1.02]]
  };

  function update(a, dt) {
    const P = a.parts;
    if (!P || !P.torso) return;
    const t = a.time = (a.time || 0) + dt;

    /* 死亡：沿用盒子版的倒地写法 */
    if (a.anim === 'die') {
      a.dieT = (a.dieT || 0) + dt;
      a.group.rotation.z = a.group.rotation.z + (1.5 - a.group.rotation.z) * Math.min(1, dt * 6);
      a.group.position.y = a.group.position.y + (-0.4 - a.group.position.y) * Math.min(1, dt * 3);
      return;
    }

    const moving = !!a.moving;
    const amp = a.walkAmp = (a.walkAmp || 0) + ((moving ? 1 : 0) - (a.walkAmp || 0)) * Math.min(1, dt * 9);
    if (amp > 0.01) a.walkPhase = (a.walkPhase || 0) + dt * 7.4;

    const ph = a.walkPhase || 0;
    const breathe = Math.sin(t * 1.7) * 0.022;

    /* 攻击进度 */
    let p = -1;
    if (a.atkAnim > 0) {
      a.atkAnim = Math.max(0, a.atkAnim - dt * (a.atkSpeed || 2.5));
      p = 1 - a.atkAnim;
    }
    const spin = p >= 0 && a.atkType === 'spin';
    if (spin) a.group.rotation.y += dt * 20 * a.atkAnim;

    /* —— 腿：髋摆 + 屈膝 —— */
    P.legL.rotation.x = Math.sin(ph) * 0.60 * amp;
    P.legR.rotation.x = Math.sin(ph + Math.PI) * 0.60 * amp;
    if (P.kneeL) P.kneeL.rotation.x = Math.max(0, -Math.sin(ph - 0.55)) * 1.0 * amp;
    if (P.kneeR) P.kneeR.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.55)) * 1.0 * amp;

    /* —— 手臂：与同侧腿反相 —— */
    const swing = Math.sin(ph) * 0.55 * amp;
    P.armL.rotation.set(swing * 0.85, 0, 0.06 + 0.05 * amp);
    P.armR.rotation.set(-swing * 0.85, 0, -0.06 - 0.05 * amp);
    if (P.elbowL) P.elbowL.rotation.x = -(0.14 + 0.26 * amp);
    if (P.elbowR) P.elbowR.rotation.x = -(0.14 + 0.26 * amp);

    /* —— 躯干：呼吸 + 起伏 + 侧倾 —— */
    P.torso.position.y = a.torsoBaseY + (moving ? Math.abs(Math.sin(ph)) * 0.026 : Math.sin(t * 2.4) * 0.012);
    P.torso.position.z = 0;
    P.torso.rotation.set(breathe * 0.6 - 0.06 * amp, Math.sin(ph) * 0.07 * amp, Math.sin(ph) * 0.035 * amp);

    /* —— 头：稳住视线 —— */
    P.headG.rotation.set(-breathe * 0.5 + 0.04 * amp,
      -Math.sin(ph) * 0.05 * amp + Math.sin(t * 0.55) * 0.10 * (1 - amp), 0);

    /* —— 下摆 / 披风 —— */
    if (P.skirt) {
      P.skirt.rotation.z = Math.sin(ph) * 0.05 * amp;
      P.skirt.rotation.x = -0.05 * amp + Math.sin(t * 2.1) * 0.012;
    }
    if (P.capeArt) {
      P.capeArt.rotation.x = 0.10 + 0.30 * amp + Math.sin(t * 3.4) * 0.05;
      P.capeArt.rotation.z = Math.sin(t * 2.6) * 0.04;
    }
    if (P.capeG) P.capeG.rotation.x = 0.10 + 0.28 * amp + Math.sin(t * 3) * 0.05;

    /* —— 攻击覆盖 —— */
    if (p >= 0 && !spin) {
      const K = ATK[a.cls] || ATK.warrior;
      /* 三轴一起覆盖：只改 x 的话，y/z 会残留待机姿态，挥击方向被拖偏 */
      const rx = K.armRx || K.armR;
      P.armR.rotation.set(
        rx ? keyLerp(rx, p) : P.armR.rotation.x,
        K.armRy ? keyLerp(K.armRy, p) : 0,
        K.armRz ? keyLerp(K.armRz, p) : -0.06
      );
      if (K.elbowR && P.elbowR) P.elbowR.rotation.x = keyLerp(K.elbowR, p);
      if (K.armL) P.armL.rotation.x = keyLerp(K.armL, p);
      if (K.elbowL && P.elbowL) P.elbowL.rotation.x = keyLerp(K.elbowL, p);
      if (K.twist) P.torso.rotation.y = keyLerp(K.twist, p);
      if (K.lean) P.torso.rotation.x = keyLerp(K.lean, p);

      /* 屈膝沉身：只有手臂在动的话看着像挥拍，加上重心下压才有劈砍的分量 */
      if (K.sink) {
        const sink = keyLerp(K.sink, p);
        if (P.kneeL) P.kneeL.rotation.x = sink * 1.55;
        if (P.kneeR) P.kneeR.rotation.x = sink * 1.30;
        P.legL.rotation.x = -sink * 0.42;
        P.legR.rotation.x = -sink * 0.30;
        P.torso.position.y = a.torsoBaseY - sink * 0.15;
      }
    }

    /* —— 武器翻腕 —— */
    const WK = WPN[a.cls];
    if (WK && a.weapon) a.weapon.rotation.x = keyLerp(WK, p >= 0 ? p : 0);

    /* —— 受击白闪 —— */
    if (a.flash > 0) {
      a.flash = Math.max(0, a.flash - dt * 7);
      a.flashWas = true;
      const c = a.flash;
      for (const m of a.mats) {
        if (!m.__oem) m.__oem = m.emissive.getHex();
        m.emissive.setRGB(c, c * 0.97, c * 0.96);
      }
    } else if (a.flashWas) {
      a.flashWas = false;
      for (const m of a.mats) if (m.__oem !== undefined) m.emissive.setHex(m.__oem);
    }
  }

  global.CharForge = {
    build, update, CFG, ATK,
    has: cls => !!CFG[cls]
  };
})(typeof window !== 'undefined' ? window : globalThis);
