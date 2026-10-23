/* ============================================================
 * 古风低模角色生成器（原型）
 *
 * 为什么要有这个文件：
 *   Soldier 那套是美式机械风，和《九霄·山海录》的山海仙侠完全不搭。
 *   外部素材要么风格不对、要么有版权问题、要么骨骼命名乱七八糟。
 *   所以用几何体现搭一套「有骨架层级」的古风角色：
 *   交领右衽、广袖、腰封、发髻、甲裙、披风、道冠都做进去，
 *   再配一套程序化动作。风格统一、零外部依赖、三职业同源。
 *
 * 骨架层级（和 skel.js 的 parts 对齐，将来可以直接接 PINOC 烘焙曲线）：
 *   hips ─┬ legL/legR ─ kneeL/kneeR
 *         ├ torso ─┬ armL/armR ─ elbowL/elbowR ─ weaponHand/offHand
 *         │        ├ headG
 *         │        └ capeG
 *         └ skirt
 *
 * 坐标约定：Y 向上，角色朝 +Z，脚底 y≈0，身高约 1.9
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 几何 / 材质小工具 ---------------- */

  function MAT(c, o) {
    o = o || {};
    const m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: o.rough == null ? 0.82 : o.rough,
      metalness: o.metal == null ? 0.04 : o.metal,
      flatShading: true
    });
    if (o.emissive != null) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei == null ? 0.4 : o.ei;
    }
    return m;
  }

  const GEO = {
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

  /* ---------------- 三职业配色 / 造型参数 ---------------- */
  /* 取色思路：朱红/墨铁/赤金（战士）、靛青/月白/银（法师）、青碧/米白/黄铜（道士） */
  const CFG = {
    warrior: {
      label: '战士 · 刀客',
      skin: 0xe2b78f, hair: 0x17130f,
      cloth: 0x9a3226, cloth2: 0x561b16, armor: 0x413c34, trim: 0xc9a227,
      pants: 0x2b2420, boot: 0x241d18,
      robe: 'armor', shoulder: 'plate', head: 'band', cape: true,
      weapon: 'saber', longSleeve: false, beard: false
    },
    mage: {
      label: '法师 · 术士',
      skin: 0xf0d0b0, hair: 0x141018,
      cloth: 0x35507e, cloth2: 0x1d2f4d, armor: 0x6a7390, trim: 0xd7d2b8,
      pants: 0x243a5c, boot: 0x1a1a22,
      robe: 'long', shoulder: 'silk', head: 'guan', cape: false,
      weapon: 'staff', longSleeve: true, beard: false
    },
    taoist: {
      label: '道士 · 符师',
      skin: 0xeed3b0, hair: 0x171310,
      cloth: 0x2e5f4c, cloth2: 0xe4dcc0, armor: 0x8a7a4a, trim: 0x9a8248,
      pants: 0x2a4a3e, boot: 0x1d1a16,
      robe: 'long', shoulder: 'silk', head: 'daoguan', cape: false,
      weapon: 'sword', longSleeve: true, beard: true
    }
  };

  /* ---------------- 武器 ---------------- */
  function buildWeapon(kind, cfg) {
    const g = new THREE.Group();
    const metal = MAT(cfg.armor, { rough: 0.35, metal: 0.7 });
    const gold = MAT(cfg.trim, { rough: 0.3, metal: 0.85 });
    const wood = MAT(0x6b4a2c, { rough: 0.95 });
    const glow = MAT(cfg.trim, { rough: 0.4, metal: 0.5, emissive: cfg.trim, ei: 0.5 });

    if (kind === 'saber') {
      /* 大刀：厚背薄刃，刀身略弯 */
      const b = put(g, GEO.box(0.11, 1.05, 0.045), metal, 0, 0.72, 0);
      b.rotation.z = -0.04;
      const tip = put(g, GEO.cone(0.062, 0.26, 4), metal, 0.045, 1.30, 0);
      tip.rotation.z = -0.10;
      put(g, GEO.cyl(0.075, 0.075, 0.05, 8), gold, 0, 0.19, 0);   // 护手
      put(g, GEO.cyl(0.035, 0.04, 0.34, 6), wood, 0, 0.01, 0);    // 柄
      put(g, GEO.box(0.05, 0.06, 0.05), gold, 0, -0.17, 0);       // 柄头
    } else if (kind === 'staff') {
      /* 法杖：竹节杆 + 云头 + 悬珠 */
      put(g, GEO.cyl(0.032, 0.042, 1.55, 6), wood, 0, 0.55, 0);
      put(g, GEO.cyl(0.05, 0.05, 0.05, 6), gold, 0, 0.30, 0);
      put(g, GEO.cyl(0.05, 0.05, 0.05, 6), gold, 0, 0.90, 0);
      const head = put(g, GEO.sph(0.085, 8), glow, 0, 1.36, 0);
      head.scale.set(1, 1.25, 1);
      put(g, GEO.cyl(0.10, 0.055, 0.10, 8), gold, 0, 1.24, 0);    // 云头托
      const ring = put(g, GEO.sph(0.13, 10), glow, 0, 1.36, 0);
      ring.scale.set(1, 1.25, 1);
      ring.material = MAT(cfg.trim, { rough: 0.4, metal: 0.3, emissive: cfg.trim, ei: 0.22 });
      ring.material.transparent = true;
      ring.material.opacity = 0.18;
    } else if (kind === 'sword') {
      /* 桃木剑：剑身细直，剑格黄铜，柄缠红绳 */
      put(g, GEO.box(0.045, 1.02, 0.022), wood, 0, 0.62, 0);
      put(g, GEO.box(0.05, 0.10, 0.026), gold, 0, 1.15, 0);
      put(g, GEO.box(0.16, 0.035, 0.05), gold, 0, 0.11, 0);
      put(g, GEO.cyl(0.032, 0.035, 0.24, 6), wood, 0, -0.02, 0);
      put(g, GEO.box(0.02, 0.20, 0.02), MAT(0xb5352c, { rough: 0.9 }), 0, -0.02, 0.026);
      /* 符箓 */
      put(g, GEO.box(0.10, 0.16, 0.008), MAT(0xe8dfa8, { emissive: 0xd8c060, ei: 0.35, rough: 0.9 }),
        0.09, 0.72, 0.01, 0, 0, 0.12);
    }
    return g;
  }

  /* ---------------- 角色构建 ---------------- */
  function build(cls, opt) {
    const cfg = CFG[cls];
    if (!cfg) return null;
    opt = opt || {};

    const g = new THREE.Group();
    const A = { group: g, parts: {}, mats: [], cfg, cls, t: 0, phase: 0, amp: 0, atkT: -1 };
    const keep = m => { A.mats.push(m); return m; };

    const mSkin = keep(MAT(cfg.skin, { rough: 0.62 }));
    const mCloth = keep(MAT(cfg.cloth, { rough: 0.9 }));
    const mCloth2 = keep(MAT(cfg.cloth2, { rough: 0.92 }));
    const mArmor = keep(MAT(cfg.armor, { rough: 0.4, metal: 0.55 }));
    const mTrim = keep(MAT(cfg.trim, { rough: 0.34, metal: 0.8 }));
    const mHair = keep(MAT(cfg.hair, { rough: 0.85 }));
    const mPants = keep(MAT(cfg.pants, { rough: 0.92 }));
    const mBoot = keep(MAT(cfg.boot, { rough: 0.78 }));

    /* ---- 髋 ---- */
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    g.add(hips);
    A.parts.hips = hips;

    /* ---- 腿 ---- */
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.125, 0, 0);
      hips.add(leg);
      put(leg, GEO.cyl(0.100, 0.082, 0.46, 7), mPants, 0, -0.23, 0);

      const knee = new THREE.Group();
      knee.position.y = -0.46;
      leg.add(knee);
      put(knee, GEO.cyl(0.082, 0.066, 0.38, 7), mPants, 0, -0.19, 0);
      put(knee, GEO.cyl(0.092, 0.084, 0.17, 7), mBoot, 0, -0.335, 0);      // 靴筒
      put(knee, GEO.box(0.14, 0.09, 0.255), mBoot, 0, -0.45, 0.045);        // 靴底
      put(knee, GEO.box(0.095, 0.045, 0.055), mTrim, 0, -0.395, 0.105);     // 靴口铜扣

      if (side < 0) { A.parts.legL = leg; A.parts.kneeL = knee; }
      else { A.parts.legR = leg; A.parts.kneeR = knee; }
    }

    /* ---- 躯干 ---- */
    const torso = new THREE.Group();
    hips.add(torso);
    A.parts.torso = torso;

    put(torso, GEO.cyl(0.180, 0.205, 0.22, 8), mCloth, 0, 0.10, 0);         // 腹
    put(torso, GEO.cyl(0.215, 0.180, 0.30, 8), mCloth, 0, 0.35, 0);          // 胸
    put(torso, GEO.box(0.47, 0.10, 0.27), mCloth, 0, 0.455, 0);              // 肩线（做宽，显壮）

    /* 交领右衽：两条斜襟在胸前交叉成 V，外襟压在内襟上 */
    put(torso, GEO.box(0.042, 0.26, 0.020), mCloth2, -0.062, 0.36, 0.168, 0, 0, 0.46);
    put(torso, GEO.box(0.042, 0.26, 0.020), mCloth2, 0.062, 0.36, 0.168, 0, 0, -0.46);
    put(torso, GEO.box(0.040, 0.24, 0.016), mCloth2, 0.105, 0.24, 0.176, 0, 0, -0.13); // 右衽压边

    /* 腰封 + 玉扣 */
    put(torso, GEO.cyl(0.198, 0.204, 0.095, 8), mCloth2, 0, 0.005, 0);
    put(torso, GEO.box(0.08, 0.08, 0.026), mTrim, 0, 0.005, 0.190);

    /* 肩甲 / 云肩 */
    if (cfg.shoulder === 'plate') {
      for (const side of [-1, 1]) {
        const pa = new THREE.Group();
        pa.position.set(side * 0.245, 0.455, 0);
        pa.rotation.z = side * -0.20;
        torso.add(pa);
        put(pa, GEO.cyl(0.115, 0.132, 0.09, 7), mArmor, 0, 0, 0);
        put(pa, GEO.cyl(0.132, 0.150, 0.075, 7), mArmor, 0, -0.068, 0);
        put(pa, GEO.cyl(0.152, 0.152, 0.020, 7), mTrim, 0, -0.105, 0);
      }
    } else {
      for (const side of [-1, 1]) {
        const pa = put(torso, GEO.cyl(0.135, 0.168, 0.05, 7), mCloth2, side * 0.228, 0.44, 0);
        pa.rotation.z = side * -0.16;
      }
    }

    /* ---- 脖子 / 头 ---- */
    put(torso, GEO.cyl(0.058, 0.068, 0.10, 6), mSkin, 0, 0.565, 0);

    const headG = new THREE.Group();
    headG.position.y = 0.625;
    torso.add(headG);
    A.parts.headG = headG;

    const skull = put(headG, GEO.sph(0.128, 10), mSkin, 0, 0.10, 0);
    skull.scale.set(1, 1.10, 0.95);
    put(headG, GEO.box(0.033, 0.052, 0.042), mSkin, -0.124, 0.09, 0);   // 耳
    put(headG, GEO.box(0.033, 0.052, 0.042), mSkin, 0.124, 0.09, 0);

    /* 眉、眼、鼻（低模就靠这几笔出神态） */
    put(headG, GEO.box(0.046, 0.013, 0.012), mHair, -0.047, 0.132, 0.121, 0, 0, 0.16);
    put(headG, GEO.box(0.046, 0.013, 0.012), mHair, 0.047, 0.132, 0.121, 0, 0, -0.16);
    put(headG, GEO.box(0.034, 0.020, 0.012), MAT(0x191410, { rough: 0.35 }), -0.047, 0.104, 0.124);
    put(headG, GEO.box(0.034, 0.020, 0.012), MAT(0x191410, { rough: 0.35 }), 0.047, 0.104, 0.124);
    put(headG, GEO.box(0.026, 0.045, 0.035), mSkin, 0, 0.072, 0.126);   // 鼻

    /* 发：后脑罩 + 顶髻 */
    const cap = put(headG, GEO.dome(0.136, 10, 8, Math.PI * 0.55), mHair, 0, 0.098, -0.004);
    cap.scale.set(1, 1.06, 1);
    put(headG, GEO.sph(0.056, 8), mHair, 0, 0.262, -0.02);              // 发髻
    put(headG, GEO.cyl(0.044, 0.050, 0.052, 8), mTrim, 0, 0.228, -0.02); // 束发

    if (cfg.beard) {
      put(headG, GEO.cone(0.045, 0.18, 6), mHair, 0, -0.05, 0.085, 0.18, 0, 0);
      put(headG, GEO.box(0.10, 0.016, 0.02), mHair, 0, 0.062, 0.126);   // 八字须
    }

    /* 头饰 */
    if (cfg.head === 'band') {
      const band = put(headG, GEO.cyl(0.138, 0.138, 0.038, 10), mTrim, 0, 0.152, 0);
      band.scale.set(1, 1, 0.98);
      put(headG, GEO.box(0.022, 0.20, 0.012), mCloth2, -0.05, 0.02, -0.135, 0.2, 0, 0.1);  // 飘带
      put(headG, GEO.box(0.022, 0.16, 0.012), mCloth2, 0.03, 0.04, -0.14, 0.15, 0, -0.1);
    } else if (cfg.head === 'guan') {
      put(headG, GEO.box(0.115, 0.085, 0.10), mTrim, 0, 0.315, -0.01);
      put(headG, GEO.box(0.135, 0.018, 0.02), mTrim, 0, 0.275, 0.045);
      put(headG, GEO.box(0.20, 0.016, 0.012), mCloth2, 0, 0.245, -0.115, 0, 0, 0);
    } else {
      put(headG, GEO.cyl(0.062, 0.075, 0.085, 6), mCloth2, 0, 0.30, -0.01);  // 道巾
      put(headG, GEO.cyl(0.082, 0.082, 0.022, 6), mTrim, 0, 0.258, -0.01);
      put(headG, GEO.box(0.016, 0.26, 0.012), mCloth2, -0.06, 0.0, -0.132, 0.22, 0, 0.08);
      put(headG, GEO.box(0.016, 0.22, 0.012), mCloth2, 0.055, 0.02, -0.138, 0.18, 0, -0.06);
    }

    /* ---- 手臂 ---- */
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.262, 0.44, 0);
      torso.add(arm);

      put(arm, GEO.cyl(0.074, 0.066, 0.32, 7), mCloth, 0, -0.16, 0);
      /* 广袖：由上往下张开，是古装最关键的一笔 */
      const sleeve = put(arm, GEO.cyl(0.094, cfg.longSleeve ? 0.150 : 0.128, 0.30, 8), mCloth, 0, -0.15, 0);
      sleeve.scale.set(1, 1, 0.92);
      put(arm, GEO.cyl(cfg.longSleeve ? 0.152 : 0.130, cfg.longSleeve ? 0.152 : 0.130, 0.026, 8),
        mCloth2, 0, -0.30, 0);   // 袖口

      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      arm.add(elbow);
      put(elbow, GEO.cyl(0.054, 0.046, 0.26, 6), cfg.longSleeve ? mCloth : mSkin, 0, -0.13, 0);
      if (!cfg.longSleeve) {
        put(elbow, GEO.cyl(0.062, 0.058, 0.10, 6), mArmor, 0, -0.10, 0);   // 护腕
      }

      const hand = new THREE.Group();
      hand.position.y = -0.27;
      elbow.add(hand);
      put(hand, GEO.box(0.070, 0.092, 0.056), mSkin, 0, -0.02, 0);

      if (side < 0) { A.parts.armL = arm; A.parts.elbowL = elbow; A.parts.offHand = hand; }
      else { A.parts.armR = arm; A.parts.elbowR = elbow; A.parts.weaponHand = hand; }
    }

    /* ---- 下摆 ---- */
    const skirt = new THREE.Group();
    hips.add(skirt);
    A.parts.skirt = skirt;

    if (cfg.robe === 'armor') {
      put(skirt, GEO.cyl(0.205, 0.285, 0.42, 8), mArmor, 0, -0.235, 0);
      put(skirt, GEO.cyl(0.290, 0.290, 0.030, 8), mTrim, 0, -0.44, 0);
      /* 甲裙分片，走动时会跟着摆 */
      for (const side of [-1, 1]) {
        put(skirt, GEO.box(0.13, 0.38, 0.02), mArmor, side * 0.175, -0.25, 0.185, 0.08, side * 0.62, 0);
      }
    } else {
      put(skirt, GEO.cyl(0.200, 0.300, 0.55, 8), mCloth, 0, -0.295, 0);
      put(skirt, GEO.cyl(0.302, 0.306, 0.026, 8), mCloth2, 0, -0.565, 0);
      /* 前后开衩 */
      put(skirt, GEO.box(0.115, 0.40, 0.014), mCloth2, -0.075, -0.36, 0.215, 0.10, 0, 0.05);
      put(skirt, GEO.box(0.115, 0.40, 0.014), mCloth2, 0.075, -0.36, 0.215, 0.10, 0, -0.05);
      put(skirt, GEO.box(0.17, 0.28, 0.012), mCloth2, 0, -0.31, -0.225, -0.10, 0, 0);
    }

    /* ---- 披风 ---- */
    if (cfg.cape) {
      const capeG = new THREE.Group();
      capeG.position.set(0, 0.50, -0.155);
      torso.add(capeG);
      capeG.rotation.x = 0.10;
      put(capeG, GEO.box(0.44, 0.70, 0.028), mCloth2, 0, -0.35, 0);
      put(capeG, GEO.box(0.46, 0.05, 0.034), mTrim, 0, -0.02, 0);
      A.parts.capeG = capeG;
    }

    /* ---- 武器 ---- */
    if (cfg.weapon) {
      const w = buildWeapon(cfg.weapon, cfg);
      /* 刀剑自然下垂（+Y 是刃口方向，转 180° 让它朝下），法杖立地握在偏上位置 */
      if (cfg.weapon === 'saber') {
        w.position.set(0.012, -0.02, 0.02);
        w.rotation.set(0, 0, Math.PI - 0.10);
      } else if (cfg.weapon === 'staff') {
        w.position.set(0.02, -0.30, 0.02);
        w.rotation.set(0, 0, -0.06);
      } else {
        w.position.set(0.004, -0.02, 0.02);
        w.rotation.set(0, 0, Math.PI + 0.10);
      }
      A.parts.weaponHand.add(w);
      A.weapon = w;
    }

    A.group.userData.charforge = A;
    return A;
  }

  /* ---------------- 动作 ---------------- */

  function keyLerp(keys, t) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = (t - t0) / (t1 - t0 || 1);
        return v0 + (v1 - v0) * (k * k * (3 - 2 * k));   // smoothstep
      }
    }
    return keys[keys.length - 1][1];
  }

  /* 各职业的招牌动作：0→1 为一个完整挥击 */
  const ATK = {
    warrior: {
      armR: [[0, 0], [0.24, -2.35], [0.42, -2.55], [0.60, 0.95], [0.76, 0.45], [1, 0]],
      armRz: [[0, 0], [0.24, -0.35], [0.42, -0.15], [0.60, 0.55], [1, 0]],
      elbowR: [[0, 0], [0.24, -0.75], [0.42, -0.55], [0.60, -0.15], [1, 0]],
      twist: [[0, 0], [0.26, 0.55], [0.44, 0.62], [0.62, -0.50], [0.82, -0.18], [1, 0]],
      lean: [[0, 0], [0.30, -0.10], [0.62, 0.16], [1, 0]]
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

  function update(A, dt, st) {
    st = st || {};
    const P = A.parts;
    A.t += dt;

    const moving = !!st.moving;
    const spd = st.speed == null ? 1 : st.speed;

    /* 走路相位与幅度平滑过渡，切换动作时不会「啪」一下跳过去 */
    const target = moving ? 1 : 0;
    A.amp += (target - A.amp) * Math.min(1, dt * 9);
    if (A.amp > 0.01) A.phase += dt * 7.2 * spd;

    const t = A.t;
    const amp = A.amp;
    const ph = A.phase;
    const breathe = Math.sin(t * 1.7) * 0.022;

    /* 腿 */
    P.legL.rotation.x = Math.sin(ph) * 0.60 * amp;
    P.legR.rotation.x = Math.sin(ph + Math.PI) * 0.60 * amp;
    P.kneeL.rotation.x = Math.max(0, -Math.sin(ph - 0.55)) * 1.05 * amp;
    P.kneeR.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.55)) * 1.05 * amp;

    /* 手臂与腿反相 */
    const swing = Math.sin(ph) * 0.55 * amp;
    P.armL.rotation.x = swing * 0.85;
    P.armR.rotation.x = -swing * 0.85;
    P.armL.rotation.z = 0.06 + 0.05 * amp;
    P.armR.rotation.z = -0.06 - 0.05 * amp;
    P.elbowL.rotation.x = -(0.14 + 0.28 * amp);
    P.elbowR.rotation.x = -(0.14 + 0.28 * amp);

    /* 躯干：呼吸 + 走路起伏 + 侧倾 */
    P.torso.position.y = Math.abs(Math.sin(ph)) * 0.026 * amp;
    P.torso.rotation.x = breathe * 0.6 - 0.06 * amp;
    P.torso.rotation.y = Math.sin(ph) * 0.07 * amp;
    P.torso.rotation.z = Math.sin(ph) * 0.035 * amp;

    /* 头：反向稳住视线（真人走路头是稳的） */
    P.headG.rotation.x = -breathe * 0.5 + 0.04 * amp;
    P.headG.rotation.y = -Math.sin(ph) * 0.05 * amp + Math.sin(t * 0.55) * 0.10 * (1 - amp);

    /* 下摆 / 披风 */
    if (P.skirt) {
      P.skirt.rotation.z = Math.sin(ph) * 0.05 * amp;
      P.skirt.rotation.x = -0.05 * amp + Math.sin(t * 2.1) * 0.012;
    }
    if (P.capeG) {
      P.capeG.rotation.x = 0.10 + 0.30 * amp + Math.sin(t * 3.4) * 0.05;
      P.capeG.rotation.z = Math.sin(t * 2.6) * 0.04;
    }

    /* 攻击覆盖 */
    if (st.attack != null && st.attack >= 0) {
      const k = ATK[A.cls] || ATK.warrior;
      const tA = Math.min(1, Math.max(0, st.attack));
      if (k.armR) P.armR.rotation.x = keyLerp(k.armR, tA);
      if (k.armRz) P.armR.rotation.z = keyLerp(k.armRz, tA);
      if (k.elbowR) P.elbowR.rotation.x = keyLerp(k.elbowR, tA);
      if (k.armL) P.armL.rotation.x = keyLerp(k.armL, tA);
      if (k.elbowL) P.elbowL.rotation.x = keyLerp(k.elbowL, tA);
      if (k.twist) P.torso.rotation.y = keyLerp(k.twist, tA);
      if (k.lean) P.torso.rotation.x = keyLerp(k.lean, tA);
    }
  }

  global.CharForge = { build, update, CFG, ATK };
})(typeof window !== 'undefined' ? window : globalThis);
