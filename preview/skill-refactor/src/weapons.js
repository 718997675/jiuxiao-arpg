/* ============================================================
 * 武器建模 —— 独立模块，角色（actors.js）与古风生成器（charforge.js）共用
 *
 * 为什么单独拆出来：
 *   原来 actors.js 的 buildWeapon 用 box 拼，sword 刀身 1.55 米、
 *   saber 1.45 米，角色身高才 1.88 —— 武器比人还长，且边缘全是直角。
 *   这里改用 Shape + ExtrudeGeometry 挤出真实轮廓：刀背弧、刃口弧、
 *   收尖、护手与缠绳，既是薄片又有侧影。
 *
 * 坐标约定：握点在 y=0，刀刃向 +y，刀柄向 -y，厚度方向为 z。
 * ============================================================ */
(function (global) {
  'use strict';

  function MAT(c, o) {
    o = o || {};
    const m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: o.rough == null ? 0.52 : o.rough,
      metalness: o.metal == null ? 0.25 : o.metal,
      flatShading: true
    });
    if (o.emissive != null) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei == null ? 0.5 : o.ei;
    }
    return m;
  }

  /* 装备色 → 护手/饰件的金属色：往金色偏，并保证明度够，
   * 否则深色品质色做出来的护手会糊成一团 */
  function mixGold(c) {
    const base = new THREE.Color(0xb99340);
    const out = base.clone().lerp(new THREE.Color(c), 0.32);
    const hsl = { h: 0, s: 0, l: 0 };
    out.getHSL(hsl);
    if (hsl.l < 0.46) out.setHSL(hsl.h, Math.min(0.7, hsl.s + 0.16), 0.52);
    return out.getHex();
  }

  function put(parent, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* 轮廓 → 薄片。
   * pts 每项： [x, y] 直线点；[cx, cy, x, y] 二次曲线（控制点 + 终点） */
  function bladeGeo(pts, depth) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else s.lineTo(p[0], p[1]);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: depth, bevelEnabled: false, curveSegments: 5, steps: 1
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  /* 刀身轮廓（总长 0.85 米，单边刃：刀背外鼓、刃口内收、刀尖斜收） */
  const P_SABER = [
    [-0.050, 0.05], [0.058, 0.05],
    [0.072, 0.46, 0.068, 0.70],
    [0.056, 0.80, 0.006, 0.850],
    [-0.030, 0.60, -0.050, 0.26],
    [-0.058, 0.12, -0.050, 0.05]
  ];

  /* 剑身轮廓（总长 0.80 米，双刃，剑尖菱形收） */
  const P_SWORD = [
    [-0.032, 0.05], [0.032, 0.05],
    [0.032, 0.52, 0.027, 0.70],
    [0.016, 0.775, 0, 0.80],
    [-0.016, 0.775, -0.027, 0.70],
    [-0.032, 0.52, -0.032, 0.05]
  ];

  /* 桃木剑：更窄，剑尖更钝 */
  const P_TAO = [
    [-0.025, 0.05], [0.025, 0.05],
    [0.025, 0.50, 0.020, 0.66],
    [0.012, 0.735, 0, 0.76],
    [-0.012, 0.735, -0.020, 0.66],
    [-0.025, 0.50, -0.025, 0.05]
  ];

  /* 柄：圆柱 + 缠绳环（3 道），尾部收一颗柄头 */
  function makeHilt(g, yTop, yBot, r, matGrip, matRing, matPommel) {
    const h = yTop - yBot;
    put(g, new THREE.CylinderGeometry(r * 0.86, r, h, 7), matGrip, 0, yBot + h / 2, 0);
    const ringN = 3;
    for (let i = 0; i < ringN; i++) {
      const t = (i + 0.6) / (ringN + 0.2);
      put(g, new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.07, 7), matRing, 0, yBot + h * t, 0);
    }
    if (matPommel) {
      const p = put(g, new THREE.SphereGeometry(r * 1.25, 7, 5), matPommel, 0, yBot - r * 0.35, 0);
      p.scale.set(1, 0.85, 1);
    }
  }

  function build(shape, color, glow, scale) {
    scale = scale == null ? 1 : scale;
    const g = new THREE.Group();
    /* 刀身统一用钢色：装备品质色改成辉光，否则暗品质武器在夜里看就是一根黑棍。
     * metalness 不能给太高——场景没有环境贴图时，纯金属只反射光源，
     * 背光面会直接黑成剪影，所以压到 0.55 让漫反射顶上来 */
    const metal = MAT(0xd2d9e2, { metal: 0.55, rough: 0.34, emissive: glow, ei: glow ? 0.45 : 0 });
    const steel = MAT(0xeef3f8, { metal: 0.68, rough: 0.22 });
    const wood = MAT(0x5a4028, { rough: 0.95, metal: 0.02 });
    const gold = MAT(color != null ? mixGold(color) : 0xb99340, { metal: 0.85, rough: 0.32 });
    const dark = MAT(0x24201c, { rough: 0.9, metal: 0.05 });

    if (shape === 'saber') {
      /* 厚背大刀：刀身 0.85 米，护手为椭圆盘，柄 0.30 米 */
      put(g, bladeGeo(P_SABER, 0.028), metal, 0, 0, 0);
      /* 刃口一条更亮的薄片，做出「开刃」的层次 */
      const edge = put(g, bladeGeo(P_SABER, 0.030), steel, -0.030, 0.006, 0);
      edge.scale.set(0.46, 0.985, 1);
      const guard = put(g, new THREE.CylinderGeometry(0.066, 0.074, 0.028, 9), gold, 0, 0.040, 0);
      guard.scale.set(1, 1, 0.55);
      makeHilt(g, 0.036, -0.245, 0.024, dark, gold, gold);

    } else if (shape === 'sword') {
      put(g, bladeGeo(P_SWORD, 0.024), metal, 0, 0, 0);
      /* 十字护手：横杆 + 两端小球 */
      put(g, new THREE.BoxGeometry(0.195, 0.028, 0.042), gold, 0, 0.046, 0);
      put(g, new THREE.SphereGeometry(0.021, 6, 5), gold, -0.099, 0.046, 0);
      put(g, new THREE.SphereGeometry(0.021, 6, 5), gold, 0.099, 0.046, 0);
      makeHilt(g, 0.043, -0.225, 0.021, dark, gold, gold);

    } else if (shape === 'taojian') {
      /* 桃木剑：木色剑身 + 铜护手 + 符箓 */
      put(g, bladeGeo(P_TAO, 0.020), MAT(0x7a5634, { rough: 0.9, metal: 0.02, emissive: glow, ei: glow ? 0.3 : 0 }), 0, 0, 0);
      put(g, new THREE.BoxGeometry(0.145, 0.022, 0.036), gold, 0, 0.040, 0);
      makeHilt(g, 0.038, -0.205, 0.019, MAT(0x3d2a18, { rough: 0.92 }), gold, gold);
      /* 剑穗上的符：薄片，略微前倾 */
      const tas = put(g, new THREE.BoxGeometry(0.062, 0.135, 0.008),
        MAT(0xe8d98a, { rough: 0.8, emissive: 0xd8a23a, ei: 0.35 }), 0, -0.262, 0.014);
      tas.rotation.x = 0.16;

    } else if (shape === 'axe') {
      put(g, new THREE.CylinderGeometry(0.026, 0.032, 1.16, 7), wood, 0, 0.20, 0);
      /* 斧头：梯形轮廓（上宽下窄的后掠弧） */
      const s = new THREE.Shape();
      s.moveTo(-0.02, 0.0);
      s.lineTo(0.02, 0.0);
      s.quadraticCurveTo(0.30, -0.06, 0.315, 0.18);
      s.quadraticCurveTo(0.28, 0.40, 0.03, 0.35);
      s.lineTo(-0.02, 0.30);
      const ax = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 5 });
      ax.translate(0, 0, -0.025);
      put(g, ax, metal, 0, 0.62, 0);
      put(g, new THREE.BoxGeometry(0.05, 0.09, 0.06), gold, 0.012, 0.60, 0);

    } else if (shape === 'glaive') {
      put(g, new THREE.CylinderGeometry(0.024, 0.030, 1.62, 7), wood, 0, 0.42, 0);
      /* 长刀身：细长单刃 */
      const P_GLAIVE = [
        [-0.026, 0.0], [0.026, 0.0],
        [0.034, 0.30, 0.030, 0.52],
        [0.022, 0.66, 0.002, 0.70],
        [-0.016, 0.44, -0.024, 0.18]
      ];
      put(g, bladeGeo(P_GLAIVE, 0.024), metal, 0, 0.98, 0);
      put(g, new THREE.CylinderGeometry(0.040, 0.040, 0.05, 8), gold, 0, 0.97, 0);

    } else if (shape === 'staff') {
      /* 云头法杖：杖身 1.42 米，尾部铜箍，头部云纹球 */
      put(g, new THREE.CylinderGeometry(0.020, 0.027, 1.42, 8), wood, 0, 0.30, 0);
      put(g, new THREE.CylinderGeometry(0.030, 0.030, 0.045, 8), gold, 0, -0.10, 0);
      put(g, new THREE.CylinderGeometry(0.030, 0.030, 0.045, 8), gold, 0, 0.55, 0);
      put(g, new THREE.CylinderGeometry(0.038, 0.030, 0.07, 8), gold, 0, 0.98, 0);
      const head = put(g, new THREE.SphereGeometry(0.072, 9, 7),
        MAT(0xd8c070, { rough: 0.4, metal: 0.35, emissive: glow || 0xd8b060, ei: 0.35 }), 0, 1.06, 0);
      head.scale.set(1, 1.22, 1);
      /* 云纹：两片弯钩 */
      for (const side of [-1, 1]) {
        const hook = put(g, new THREE.TorusGeometry(0.055, 0.011, 4, 8, Math.PI * 1.25), gold,
          side * 0.052, 1.09, 0);
        hook.rotation.set(Math.PI / 2, 0, side * 0.7);
      }

    } else if (shape === 'shield') {
      /* 圆盾：外圈 + 中央凸面 + 盾面放射筋 */
      const rim = put(g, new THREE.TorusGeometry(0.30, 0.030, 5, 14), gold, 0, 0, 0);
      rim.rotation.y = Math.PI / 2;
      const face = put(g, new THREE.CylinderGeometry(0.285, 0.26, 0.045, 12), metal, 0, 0, 0);
      face.rotation.z = Math.PI / 2;
      const boss = put(g, new THREE.SphereGeometry(0.085, 8, 6), gold, 0.035, 0, 0);
      boss.scale.set(0.55, 1, 1);

    } else if (shape === 'orb') {
      const o = put(g, new THREE.SphereGeometry(0.155, 10, 8),
        MAT(color, { rough: 0.3, metal: 0.4, emissive: glow || color, ei: 0.45 }), 0, 0.05, 0);
      o.material.transparent = true;
      o.material.opacity = 0.92;
      const r = put(g, new THREE.TorusGeometry(0.225, 0.014, 4, 12), gold, 0, 0.05, 0);
      r.rotation.x = 1.15;
      const r2 = put(g, new THREE.TorusGeometry(0.225, 0.012, 4, 12), gold, 0, 0.05, 0);
      r2.rotation.set(1.15, 0, Math.PI / 2.2);

    } else if (shape === 'charm') {
      /* 符板：双层，正面略亮 */
      put(g, new THREE.BoxGeometry(0.155, 0.30, 0.016),
        MAT(0xe8dfa8, { rough: 0.85, emissive: glow, ei: glow ? 0.3 : 0 }), 0, 0.04, 0);
      put(g, new THREE.BoxGeometry(0.17, 0.022, 0.022), gold, 0, 0.20, 0);
      put(g, new THREE.BoxGeometry(0.17, 0.022, 0.022), gold, 0, -0.115, 0);
      /* 朱砂笔画：三笔 */
      const ink = MAT(0xb03a2c, { rough: 0.9 });
      put(g, new THREE.BoxGeometry(0.075, 0.012, 0.004), ink, 0, 0.11, 0.010);
      put(g, new THREE.BoxGeometry(0.012, 0.10, 0.004), ink, -0.012, 0.03, 0.010);
      put(g, new THREE.BoxGeometry(0.055, 0.012, 0.004), ink, 0.012, -0.045, 0.010);

    } else {
      /* 未知类型：给一把小刀，避免空手 */
      put(g, bladeGeo(P_SWORD, 0.022), metal, 0, 0, 0);
    }

    g.scale.setScalar(scale);
    return g;
  }

  global.WeaponForge = { build, bladeGeo };
})(typeof window !== 'undefined' ? window : globalThis);
