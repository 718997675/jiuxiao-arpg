/* ============================================================
 * 角色模型 / 纸娃娃 / 程序化动作
 * ============================================================ */

const GEO_CACHE = {};
/* 缓存几何体打上 shared 标记：它们被全场景复用，任何时候都不能 dispose */
function _cacheGeo(k, make) {
  const hit = GEO_CACHE[k];
  if (hit) return hit;
  const g = make();
  markShared(g);
  return (GEO_CACHE[k] = g);
}
function boxGeo(w, h, d) { return _cacheGeo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)); }
function sphGeo(r, s = 6) { return _cacheGeo(`s${r}_${s}`, () => new THREE.SphereGeometry(r, s, Math.max(4, s - 2))); }
function coneGeo(r, h, s = 6) { return _cacheGeo(`c${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s)); }
function cylGeo(rt, rb, h, s = 6) { return _cacheGeo(`y${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)); }
function torusGeo(r, tube, rs, ts) { return _cacheGeo(`t${r}_${tube}_${rs}_${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts)); }
function ringGeo(inner, outer, seg) { return _cacheGeo(`g${inner}_${outer}_${seg}`, () => new THREE.RingGeometry(inner, outer, seg)); }

/* 纹理在 r128 里不一定有 userData（几何体/材质都有，纹理没有），
 * 直接 .userData.shared 会抛「Cannot read properties of undefined」，
 * 所以统一走这两个小工具，别在业务代码里裸取。 */
function isShared(x) { return !!(x && x.userData && x.userData.shared); }
function markShared(x) { if (x) { if (!x.userData) x.userData = {}; x.userData.shared = true; } return x; }

/* ---------------- GPU 资源回收 ---------------- *
 * 关键：只释放「独占」的几何体/材质/纹理，跳过 userData.shared 的共享资源。
 * 之前的版本换地图只 scene.remove 不 dispose，导致每次换图泄漏整张图的
 * 几何体与材质，显存涨满后 WebGL 上下文丢失（表现为「过一会就闪退」）。
 */
function disposeTree(root, opts = {}) {
  if (!root) return 0;
  const geos = new Set(), mats = new Set(), texs = new Set();
  root.traverse(o => {
    const g = o.geometry;
    if (g && !isShared(g) && !geos.has(g)) geos.add(g);
    const m = o.material;
    if (m) {
      const list = Array.isArray(m) ? m : [m];
      for (const mt of list) {
        if (!mt || isShared(mt) || mats.has(mt)) continue;
        mats.add(mt);
        if (mt.map && !isShared(mt.map) && !texs.has(mt.map)) texs.add(mt.map);
      }
    }
  });
  geos.forEach(g => g.dispose());
  mats.forEach(m => m.dispose());
  texs.forEach(t => t.dispose());
  if (opts.detach !== false && root.parent) root.parent.remove(root);
  return geos.size + mats.size + texs.size;
}


function M(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color: color, roughness: o.rough !== undefined ? o.rough : 0.82,
    metalness: o.metal !== undefined ? o.metal : 0.06,
    emissive: o.emissive !== undefined ? o.emissive : 0x000000,
    emissiveIntensity: o.ei !== undefined ? o.ei : 1,
    flatShading: true, transparent: !!o.transparent, opacity: o.opacity !== undefined ? o.opacity : 1,
    side: o.side || THREE.FrontSide
  });
}

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = false;
  if (parent) parent.add(m);
  return m;
}

function newMatList(actor) { actor.mats = []; }

function reg(actor, mat) { actor.mats.push(mat); return mat; }

/* ---------------- 武器 ---------------- */
function buildWeapon(shape, color, glow, scale = 1) {
  const g = new THREE.Group();
  const metal = M(color, { metal: 0.75, rough: 0.35, emissive: glow, ei: glow ? 0.55 : 0 });
  const wood = M(0x5a4028, { rough: 0.95 });
  const gold = M(0xd8b25a, { metal: 0.8, rough: 0.35 });
  if (shape === 'sword') {
    mesh(boxGeo(0.12, 1.55, 0.04), metal, 0, 0.85, 0, g);
    mesh(boxGeo(0.38, 0.07, 0.1), gold, 0, 0.12, 0, g);
    mesh(boxGeo(0.07, 0.38, 0.07), wood, 0, -0.1, 0, g);
  } else if (shape === 'saber') {
    const b = mesh(boxGeo(0.14, 1.45, 0.05), metal, 0.05, 0.8, 0, g);
    b.rotation.z = -0.1;
    mesh(boxGeo(0.34, 0.08, 0.12), gold, 0, 0.1, 0, g);
    mesh(boxGeo(0.08, 0.34, 0.08), wood, 0, -0.1, 0, g);
  } else if (shape === 'axe') {
    mesh(boxGeo(0.09, 1.5, 0.09), wood, 0, 0.65, 0, g);
    mesh(boxGeo(0.62, 0.5, 0.07), metal, 0.22, 1.2, 0, g);
    mesh(coneGeo(0.12, 0.4, 4), metal, 0, 1.5, 0, g);
  } else if (shape === 'glaive') {
    mesh(boxGeo(0.08, 1.9, 0.08), wood, 0, 0.6, 0, g);
    const b = mesh(boxGeo(0.12, 0.9, 0.05), metal, 0.08, 1.5, 0, g);
    b.rotation.z = 0.16;
    mesh(boxGeo(0.3, 0.06, 0.09), gold, 0.02, 1.1, 0, g);
  } else if (shape === 'staff') {
    mesh(cylGeo(0.045, 0.06, 1.9, 6), wood, 0, 0.55, 0, g);
    mesh(sphGeo(0.16, 7), metal, 0, 1.55, 0, g);
    const ring = mesh(torusGeo(0.22, 0.035, 4, 8), gold, 0, 1.55, 0, g);
    ring.rotation.x = Math.PI / 2;
  } else if (shape === 'taojian') {
    mesh(boxGeo(0.06, 1.35, 0.03), metal, 0, 0.78, 0, g);
    mesh(boxGeo(0.3, 0.05, 0.09), gold, 0, 0.14, 0, g);
    mesh(boxGeo(0.06, 0.3, 0.06), wood, 0, -0.05, 0, g);
    const tas = mesh(boxGeo(0.12, 0.22, 0.02), M(0xd85a4a), 0, -0.28, 0, g);
    tas.rotation.x = 0.2;
  } else if (shape === 'shield') {
    const s = mesh(boxGeo(0.1, 0.9, 0.66), metal, 0, 0, 0, g);
    s.rotation.z = 0.06;
    mesh(boxGeo(0.07, 0.3, 0.3), gold, 0.08, 0, 0, g);
  } else if (shape === 'orb') {
    mesh(sphGeo(0.22, 8), metal, 0, 0.05, 0, g);
    const r = mesh(torusGeo(0.32, 0.025, 4, 10), gold, 0, 0.05, 0, g);
    r.rotation.x = 1.2;
  } else if (shape === 'charm') {
    mesh(boxGeo(0.3, 0.42, 0.04), M(0xe8dfa8, { emissive: glow, ei: 0.35 }), 0, 0.1, 0, g);
    mesh(boxGeo(0.34, 0.06, 0.06), gold, 0, 0.36, 0, g);
  }
  g.scale.setScalar(scale);
  return g;
}

/* ---------------- 纸娃娃基础人形 ---------------- */
function buildHumanoid(cfg) {
  const g = new THREE.Group();
  const actor = { group: g, mats: [], parts: {} };
  const skin = M(cfg.skin || 0xd8b090);
  const cloth = M(cfg.color || 0x8e2f24, { rough: 0.9 });
  const cloth2 = M(cfg.cloth || 0x5c1f18, { rough: 0.95 });
  const metalCol = cfg.metal || 0x6a7078;
  actor.parts.skinMat = reg(actor, skin);
  actor.parts.clothMat = reg(actor, cloth);
  actor.parts.cloth2Mat = reg(actor, cloth2);
  actor.parts.metalMat = reg(actor, M(metalCol, { metal: 0.7, rough: 0.4 }));

  // 腿
  const legL = new THREE.Group(); legL.position.set(-0.2, 0.92, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.2, 0.92, 0); g.add(legR);
  actor.parts.legL = legL; actor.parts.legR = legR;
  const legMat = reg(actor, M(cfg.legColor || cfg.cloth || 0x3a2a20, { rough: 0.95 }));
  const bootMat = reg(actor, M(cfg.bootColor || 0x2a2018, { rough: 0.9 }));
  actor.parts.legMat = legMat; actor.parts.bootMat = bootMat;
  for (const [lg, sx] of [[legL, -1], [legR, 1]]) {
    mesh(boxGeo(0.23, 0.78, 0.24), legMat, 0, -0.4, 0, lg);
    mesh(boxGeo(0.26, 0.18, 0.36), bootMat, 0, -0.76, 0.05, lg);
  }
  // 躯干
  const torso = new THREE.Group(); torso.position.y = 0.92; g.add(torso);
  actor.parts.torso = torso;
  mesh(boxGeo(0.7, 0.86, 0.4), cloth, 0, 0.36, 0, torso);
  mesh(boxGeo(0.74, 0.16, 0.44), cloth2, 0, -0.02, 0, torso);
  mesh(boxGeo(0.16, 0.5, 0.05), cloth2, 0, 0.4, 0.21, torso); // 衣襟
  actor.parts.chestMesh = torso.children[0];
  // 腰
  mesh(boxGeo(0.62, 0.16, 0.38), cloth2, 0, 0.02, 0, torso);
  mesh(boxGeo(0.16, 0.16, 0.06), M(0xd8b25a, { metal: 0.7 }), 0, 0.02, 0.2, torso);
  // 头
  const headG = new THREE.Group(); headG.position.y = 1.68; g.add(headG);
  actor.parts.headG = headG;
  const head = mesh(sphGeo(0.25, 8), skin, 0, 0.12, 0, headG);
  head.scale.set(1, 1.08, 0.95);
  actor.parts.head = head;
  const hairMat = reg(actor, M(cfg.hair || 0x241c1a, { rough: 1 }));
  mesh(boxGeo(0.48, 0.2, 0.48), hairMat, 0, 0.3, -0.02, headG);
  mesh(boxGeo(0.44, 0.3, 0.14), hairMat, 0, 0.12, -0.2, headG);
  mesh(boxGeo(0.16, 0.3, 0.1), M(0x2a2028), 0, 0.34, 0.16, headG); // 发髻
  // 领口
  mesh(boxGeo(0.56, 0.12, 0.44), cloth2, 0, 0.82, 0, torso).scale.z = 1.02;
  // 眼睛
  const eyeMat = M(0xffe0a0, { emissive: 0xffcc66, ei: 0.6 });
  mesh(boxGeo(0.05, 0.04, 0.02), eyeMat, -0.08, 0.14, 0.23, headG);
  mesh(boxGeo(0.05, 0.04, 0.02), eyeMat, 0.08, 0.14, 0.23, headG);
  // 手臂
  const armL = new THREE.Group(); armL.position.set(-0.44, 1.6, 0); g.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.44, 1.6, 0); g.add(armR);
  actor.parts.armL = armL; actor.parts.armR = armR;
  const sleeveMat = reg(actor, M(cfg.sleeve || cfg.color || 0x8e2f24, { rough: 0.9 }));
  const handMat = reg(actor, M(cfg.glove || 0x4a3524, { rough: 0.9 }));
  actor.parts.sleeveMat = sleeveMat; actor.parts.handMat = handMat;
  for (const [ar, sx] of [[armL, -1], [armR, 1]]) {
    mesh(boxGeo(0.18, 0.52, 0.19), sleeveMat, 0, -0.24, 0, ar);
    mesh(boxGeo(0.2, 0.24, 0.2), handMat, 0, -0.58, 0, ar);
  }
  // 副手位
  const offHand = new THREE.Group(); offHand.position.set(0, -0.62, 0.06); armL.add(offHand);
  actor.parts.offHand = offHand;
  // 武器位
  const weaponHand = new THREE.Group(); weaponHand.position.set(0, -0.62, 0.04); armR.add(weaponHand);
  actor.parts.weaponHand = weaponHand;
  // 头盔
  const helmG = new THREE.Group(); helmG.position.y = 0.16; headG.add(helmG);
  actor.parts.helmG = helmG;
  // 护肩
  const shoulderL = new THREE.Group(); shoulderL.position.set(-0.44, 1.66, 0); g.add(shoulderL);
  const shoulderR = new THREE.Group(); shoulderR.position.set(0.44, 1.66, 0); g.add(shoulderR);
  actor.parts.shoulderL = shoulderL; actor.parts.shoulderR = shoulderR;
  // 披风
  const capeG = new THREE.Group(); capeG.position.set(0, 1.62, -0.2); g.add(capeG);
  actor.parts.capeG = capeG;

  actor.mats.push.apply(actor.mats, [eyeMat]);
  return actor;
}

/* 不同怪物造型 */
function buildMonster(kind, cfg) {
  let a;
  const s = cfg.scale || 1;
  if (kind === 'spider') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const body = M(cfg.color, { rough: 0.8 });
    const dark = M(cfg.cloth, { rough: 0.9 });
    reg(a, body); reg(a, dark);
    // 腹部（后）
    const ab = mesh(sphGeo(0.5, 7), body, 0, 0.66, -0.52, g);
    ab.scale.set(1.06, 0.92, 1.3);
    // 头胸（前）
    const th = mesh(sphGeo(0.4, 7), body, 0, 0.6, 0.22, g);
    th.scale.set(1.0, 0.82, 1.05);
    // 甲片纹理
    for (let i = 0; i < 3; i++) {
      const pl = mesh(sphGeo(0.3 - i * 0.03, 6), dark, 0, 0.94 - i * 0.02, -0.34 - i * 0.28, g);
      pl.scale.set(1.0, 0.32, 0.7);
    }
    // 头部与毒牙
    const head = mesh(sphGeo(0.24, 7), dark, 0, 0.62, 0.56, g);
    head.scale.set(1.1, 0.85, 0.9);
    for (const sx of [-1, 1]) {
      const fang = mesh(coneGeo(0.05, 0.26, 5), M(0xe8dcc0, { rough: 0.5 }), sx * 0.1, 0.44, 0.68, g);
      fang.rotation.x = 2.5;
    }
    // 六只眼
    const eyes = M(0xff4a4a, { emissive: 0xff2020, ei: 1.4 });
    for (let i = 0; i < 6; i++) {
      const sx = (i % 2 ? 1 : -1) * (0.07 + Math.floor(i / 4) * 0.05);
      const ey = 0.68 + (i < 2 ? 0.06 : (i < 4 ? 0 : -0.05));
      mesh(sphGeo(0.042, 4), eyes, sx, ey, 0.72, g);
    }
    // 八条分节长腿
    const seg = (p0, p1, mat, w) => {
      const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const len = dir.length();
      const m = mesh(boxGeo(w, len, w), mat, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, g);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      return m;
    };
    a.parts.legs = [];
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z0 = 0.36 - k * 0.3;
        const spread = (k - 1.5) * 0.34;
        const hip = [sx * 0.3, 0.72, z0];
        const knee = [sx * (1.02 - k * 0.04), 1.12 - k * 0.06, z0 + spread];
        const foot = [sx * (1.6 - k * 0.06), 0.03, z0 + spread * 1.5];
        seg(hip, knee, body, 0.1);
        seg(knee, foot, dark, 0.075);
        const kn = mesh(sphGeo(0.085, 5), body, knee[0], knee[1], knee[2], g);
        a.parts.legs.push(kn);
        const tip = mesh(sphGeo(0.06, 4), dark, foot[0], foot[1] + 0.02, foot[2], g);
      }
    }
    a.parts.torso = g; a.parts.headG = head; a.parts.weaponHand = null;
    a.group.scale.setScalar(s);
    a.parts.bodyMat = body;
    return a;
  }
  if (kind === 'beast') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const fur = M(cfg.color, { rough: 1 });
    const dark = M(cfg.cloth, { rough: 1 });
    reg(a, fur); reg(a, dark);
    const body = new THREE.Group(); body.position.y = 0.95; g.add(body);
    a.parts.torso = body;
    mesh(boxGeo(1.0, 0.8, 1.7), fur, 0, 0, 0, body);
    mesh(boxGeo(0.86, 0.2, 1.2), dark, 0, 0.42, -0.1, body);
    const headG = new THREE.Group(); headG.position.set(0, 0.15, 0.95); body.add(headG);
    a.parts.headG = headG;
    mesh(boxGeo(0.62, 0.6, 0.62), fur, 0, 0, 0.24, headG);
    mesh(boxGeo(0.34, 0.22, 0.28), dark, 0, -0.16, 0.55, headG);
    const eye = M(0xff4030, { emissive: 0xff2010, ei: 1.2 });
    mesh(boxGeo(0.1, 0.08, 0.05), eye, -0.16, 0.1, 0.53, headG);
    mesh(boxGeo(0.1, 0.08, 0.05), eye, 0.16, 0.1, 0.53, headG);
    for (const sx of [-1, 1]) {
      const tusk = mesh(coneGeo(0.06, 0.34, 4), M(0xf0e8d0), sx * 0.2, -0.2, 0.6, headG);
      tusk.rotation.x = -0.7;
      const ear = mesh(coneGeo(0.1, 0.24, 4), dark, sx * 0.22, 0.36, 0.12, headG);
      ear.rotation.z = sx * 0.5;
    }
    const mkLeg = (x, z, back) => {
      const lg = new THREE.Group(); lg.position.set(x, 0.75, z); g.add(lg);
      mesh(boxGeo(0.24, 0.75, 0.24), fur, 0, -0.38, 0, lg);
      mesh(boxGeo(0.28, 0.14, 0.32), dark, 0, -0.72, 0.04, lg);
      return lg;
    };
    a.parts.legL = mkLeg(-0.32, 0.55);
    a.parts.legR = mkLeg(0.32, 0.55);
    a.parts.legBL = mkLeg(-0.32, -0.55, true);
    a.parts.legBR = mkLeg(0.32, -0.55, true);
    const tail = mesh(boxGeo(0.1, 0.1, 0.5), dark, 0, 0.15, -0.95, body);
    tail.rotation.x = 0.4;
    a.parts.weaponHand = null; a.parts.offHand = null;
    a.group.scale.setScalar(s);
    return a;
  }
  if (kind === 'bat' || kind === 'batking') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const body = M(cfg.color, { rough: 0.8, emissive: cfg.color, ei: 0.15 });
    reg(a, body);
    mesh(sphGeo(0.42, 7), body, 0, 0.9, 0, g).scale.set(1, 1.2, 0.9);
    const head = mesh(sphGeo(0.26, 7), body, 0, 1.32, 0.12, g);
    const eye = M(0xff3030, { emissive: 0xff0000, ei: 1.4 });
    mesh(sphGeo(0.06, 4), eye, -0.1, 1.36, 0.32, g);
    mesh(sphGeo(0.06, 4), eye, 0.1, 1.36, 0.32, g);
    mesh(coneGeo(0.06, 0.2, 4), body, -0.1, 1.55, 0.14, g).rotation.x = -0.3;
    mesh(coneGeo(0.06, 0.2, 4), body, 0.1, 1.55, 0.14, g).rotation.x = -0.3;
    if (kind === 'batking') {
      const crown = M(0xffd166, { metal: 0.9, rough: 0.3, emissive: 0x554400, ei: 0.5 });
      for (let i = -1; i <= 1; i++) mesh(coneGeo(0.05, 0.26, 4), crown, i * 0.13, 1.62, 0.06, g);
    }
    const wingMat = M(cfg.cloth, { rough: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    reg(a, wingMat);
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 0.36, 1.0, 0); g.add(w);
      mesh(boxGeo(0.95, 0.75, 0.04), wingMat, sx * 0.5, 0, 0, w);
      a.parts['wing' + (sx < 0 ? 'L' : 'R')] = w;
    }
    a.parts.torso = g; a.parts.headG = head;
    a.group.scale.setScalar(s);
    return a;
  }
  if (kind === 'ghost') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const robe = M(cfg.color, { rough: 0.55, emissive: cfg.color, ei: 0.4, transparent: true, opacity: 0.86 });
    reg(a, robe);
    const body = mesh(coneGeo(0.6, 1.7, 7), robe, 0, 1.0, 0, g);
    mesh(coneGeo(0.72, 0.4, 7), robe, 0, 0.35, 0, g);
    const head = mesh(sphGeo(0.27, 7), robe, 0, 1.95, 0, g);
    const eye = M(0x9affff, { emissive: 0x66ffff, ei: 1.6 });
    mesh(sphGeo(0.05, 4), eye, -0.09, 2.0, 0.23, g);
    mesh(sphGeo(0.05, 4), eye, 0.09, 2.0, 0.23, g);
    a.parts.torso = body; a.parts.headG = head;
    a.parts.armL = new THREE.Group(); a.parts.armR = new THREE.Group();
    a.parts.armL.position.set(-0.45, 1.5, 0); a.parts.armR.position.set(0.45, 1.5, 0);
    g.add(a.parts.armL, a.parts.armR);
    for (const ar of [a.parts.armL, a.parts.armR]) mesh(boxGeo(0.16, 0.7, 0.16), robe, 0, -0.35, 0, ar);
    a.parts.weaponHand = new THREE.Group(); a.parts.weaponHand.position.set(0, -0.7, 0);
    a.parts.armR.add(a.parts.weaponHand);
    a.parts.offHand = new THREE.Group();
    a.parts.legL = a.parts.legR = null;
    a.group.scale.setScalar(s);
    return a;
  }
  if (kind === 'treant') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const bark = M(cfg.color, { rough: 1 });
    const leaf = M(0x3f6b32, { rough: 1 });
    const leaf2 = M(0x2f5428, { rough: 1 });
    reg(a, bark); reg(a, leaf); reg(a, leaf2);
    const torso = new THREE.Group(); torso.position.y = 0.92; g.add(torso);
    a.parts.torso = torso;
    const trunk = mesh(cylGeo(0.5, 0.8, 2.2, 7), bark, 0, 0.9, 0, torso);
    trunk.scale.z = 0.9;
    mesh(cylGeo(0.62, 0.5, 0.5, 7), bark, 0, 1.95, 0, torso);
    // 树冠
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * 6.28;
      const s = mesh(sphGeo(RND(0.7, 1.0), 6), i % 2 ? leaf : leaf2, Math.cos(ang) * RND(0.6, 1.4), 2.5 + RND(-0.2, 0.5), Math.sin(ang) * RND(0.6, 1.2), torso);
      s.scale.y = 0.8;
    }
    const headG = new THREE.Group(); headG.position.y = 2.15; g.add(headG);
    a.parts.headG = headG;
    mesh(boxGeo(0.75, 0.6, 0.6), bark, 0, 0, 0.12, headG);
    const eye = M(0x9aff60, { emissive: 0x66ff30, ei: 1.8 });
    mesh(boxGeo(0.13, 0.1, 0.05), eye, -0.18, 0.05, 0.44, headG);
    mesh(boxGeo(0.13, 0.1, 0.05), eye, 0.18, 0.05, 0.44, headG);
    mesh(boxGeo(0.1, 0.26, 0.1), bark, 0, -0.3, 0.36, headG);
    // 手臂（树枝）
    const armL = new THREE.Group(); armL.position.set(-0.62, 2.45, 0); g.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.62, 2.45, 0); g.add(armR);
    a.parts.armL = armL; a.parts.armR = armR;
    for (const [ar, sx] of [[armL, -1], [armR, 1]]) {
      const b1 = mesh(cylGeo(0.12, 0.22, 1.5, 5), bark, sx * 0.35, -0.6, 0, ar);
      b1.rotation.z = sx * 0.5;
      const b2 = mesh(cylGeo(0.07, 0.12, 1.1, 4), bark, sx * 1.0, -1.25, 0.1, ar);
      b2.rotation.z = sx * 0.25;
      for (let k = 0; k < 3; k++) mesh(sphGeo(0.34, 5), leaf, sx * (0.9 + k * 0.15), -1.5 + RND(-0.3, 0.3), 0.2 + RND(-0.3, 0.3), ar).scale.y = 0.6;
    }
    const legL = new THREE.Group(); legL.position.set(-0.3, 0.9, 0); g.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.3, 0.9, 0); g.add(legR);
    a.parts.legL = legL; a.parts.legR = legR;
    for (const [lg, sx] of [[legL, -1], [legR, 1]]) {
      const l = mesh(cylGeo(0.16, 0.34, 1.0, 5), bark, 0, -0.5, 0, lg);
      for (let k = 0; k < 2; k++) {
        const root = mesh(coneGeo(0.12, 0.5, 4), bark, sx * 0.16 * (k ? 1 : -1), -0.95, 0.1, lg);
        root.rotation.z = sx * (k ? 0.6 : -0.4);
      }
    }
    a.parts.weaponHand = new THREE.Group(); a.parts.weaponHand.position.set(0, -1.6, 0);
    armR.add(a.parts.weaponHand);
    a.parts.offHand = new THREE.Group();
    a.group.scale.setScalar(s);
    return a;
  }
  if (kind === 'golem') {
    const g = new THREE.Group();
    a = { group: g, mats: [], parts: {} };
    const stone = M(cfg.color, { rough: 0.95, flatShading: true });
    const moss = M(cfg.cloth, { rough: 1 });
    reg(a, stone); reg(a, moss);
    mesh(boxGeo(1.15, 1.1, 0.85), stone, 0, 1.55, 0, g);
    mesh(boxGeo(0.9, 0.4, 0.7), stone, 0, 0.9, 0, g);
    const head = mesh(boxGeo(0.62, 0.55, 0.6), stone, 0, 2.28, 0.05, g);
    const eye = M(kind === 'treant' ? 0x9aff60 : 0xff8a30, { emissive: kind === 'treant' ? 0x66ff30 : 0xff5500, ei: 1.5 });
    mesh(boxGeo(0.12, 0.07, 0.05), eye, -0.14, 2.32, 0.36, g);
    mesh(boxGeo(0.12, 0.07, 0.05), eye, 0.14, 2.32, 0.36, g);
    const armL = new THREE.Group(); armL.position.set(-0.72, 1.9, 0); g.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.72, 1.9, 0); g.add(armR);
    a.parts.armL = armL; a.parts.armR = armR;
    for (const [ar, sx] of [[armL, -1], [armR, 1]]) {
      mesh(boxGeo(0.34, 1.0, 0.34), stone, sx * 0.06, -0.5, 0, ar);
      mesh(boxGeo(0.44, 0.42, 0.44), stone, sx * 0.06, -1.05, 0, ar);
    }
    const legL = new THREE.Group(); legL.position.set(-0.32, 0.95, 0); g.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.32, 0.95, 0); g.add(legR);
    a.parts.legL = legL; a.parts.legR = legR;
    for (const lg of [legL, legR]) mesh(boxGeo(0.38, 0.95, 0.4), stone, 0, -0.48, 0, lg);
    mesh(boxGeo(1.2, 0.2, 0.9), moss, 0, 1.05, 0, g);
    if (kind === 'treant') {
      for (const sx of [-1, 1]) {
        const br = mesh(boxGeo(0.14, 0.9, 0.14), M(0x4a3a24), sx * 0.5, 2.7, -0.1, g);
        br.rotation.z = sx * 0.5;
        mesh(coneGeo(0.42, 0.7, 5), M(0x2f5a28), sx * 0.78, 3.1, -0.1, g);
      }
    }
    a.parts.weaponHand = new THREE.Group(); a.parts.weaponHand.position.set(0, -1.25, 0);
    armR.add(a.parts.weaponHand);
    a.parts.headG = head;
    a.group.scale.setScalar(s);
    return a;
  }

  /* 默认人形（半兽人 / 骷髅 / 妖僧 / Boss） */
  a = buildHumanoid({
    skin: kind === 'skeleton' ? 0xc8c2ad : (cfg.skin || 0xa88464),
    color: cfg.color, cloth: cfg.cloth,
    legColor: cfg.cloth, bootColor: cfg.cloth, sleeve: cfg.color,
    glove: cfg.cloth
  });
  const g = a.group;
  if (kind === 'skeleton') {
    a.parts.head.scale.set(0.85, 0.9, 0.85);
    mesh(boxGeo(0.2, 0.12, 0.2), M(0x222222), 0, 0.02, 0.22, a.parts.headG);
  }
  if (kind === 'humanoid' || kind === 'brute' || kind === 'demon') {
    // 獠牙 + 犄角
    for (const sx of [-1, 1]) {
      if (kind === 'demon') {
        const h = mesh(coneGeo(0.07, 0.5, 5), M(0x2a1038), sx * 0.18, 0.45, 0.02, a.parts.headG);
        h.rotation.z = sx * 0.35;
      } else {
        mesh(coneGeo(0.035, 0.12, 4), M(0xf0e0c0), sx * 0.11, 0.0, 0.24, a.parts.headG);
      }
    }
    if (kind === 'brute' || kind === 'demon') {
      a.parts.torso.scale.set(1.2, 1.15, 1.15);
      g.scale.setScalar(s);
      if (kind === 'brute') {
        for (const gg of [a.parts.shoulderL, a.parts.shoulderR]) {
          const p = mesh(boxGeo(0.34, 0.22, 0.44), M(0x6a5a48, { metal: 0.35, rough: 0.6 }), 0, 0.06, 0, gg);
          p.rotation.z = 0.18;
          mesh(coneGeo(0.06, 0.24, 4), M(0xd8b25a, { metal: 0.7 }), 0, 0.2, -0.1, gg);
        }
        mesh(boxGeo(0.52, 0.36, 0.1), M(0x6a5a48, { metal: 0.4, rough: 0.6 }), 0, 0.45, 0.22, a.parts.torso);
        mesh(boxGeo(0.6, 0.12, 0.44), M(0x3a2414), 0, 0.72, 0, a.parts.torso);
      } else {
        for (const sx of [-1, 1]) {
          const wing = new THREE.Group();
          wing.position.set(sx * 0.4, 1.5, -0.2);
          g.add(wing);
          const wm = M(0x2a1038, { rough: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
          a.mats.push(wm);
          mesh(boxGeo(1.1, 1.5, 0.05), wm, sx * 0.55, -0.3, -0.1, wing).rotation.z = sx * 0.3;
          a.parts['wing' + (sx < 0 ? 'L' : 'R')] = wing;
        }
        const auraM = new THREE.Mesh(sphGeo(0.9, 8), new THREE.MeshBasicMaterial({ color: 0x8a2aff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
        auraM.position.y = 1.6; auraM.scale.set(1.15, 1.3, 1.15);
        g.add(auraM);
      }
    }
  }
  return a;
}

/* ---------------- 纸娃娃：穿上装备 ---------------- */
function clearGroup(g) { while (g.children.length) g.remove(g.children[0]); }

function rarityGlow(item) {
  if (!item) return null;
  if (item.rarity === 'legendary') return 0xff7a3c;
  if (item.rarity === 'set') return 0x5ce08a;
  if (item.rarity === 'rare') return 0xffc857;
  if (item.rarity === 'magic') return 0x67a9ff;
  return null;
}

function applyPaperDoll(p) {
  const a = p.actor;
  const eq = p.equipment;
  const cls = CLASSES[p.cls];
  const P = a.parts;

  /* 身体基础色随职业 */
  P.clothMat.color.setHex(cls.color);
  P.cloth2Mat.color.setHex(cls.cloth);
  P.sleeveMat.color.setHex(cls.color);
  P.legMat.color.setHex(cls.cloth);
  P.bootMat.color.setHex(cls.cloth);
  P.handMat.color.setHex(cls.cloth);
  P.chestMesh.material = P.clothMat;

  /* 护甲：躯干颜色、金属质感 */
  const chest = eq.chest;
  if (chest) {
    const c = itemVisualColor(chest);
    P.clothMat.color.setHex(c.base);
    P.clothMat.metalness = c.metal;
    P.clothMat.emissive.setHex(c.glow);
    P.clothMat.emissiveIntensity = c.glow ? 0.35 : 0;
    P.cloth2Mat.color.setHex(c.dark);
  } else {
    P.clothMat.metalness = 0.06;
    P.clothMat.emissive.setHex(0x000000);
  }

  /* 护腿 / 靴 */
  const boots = eq.boots;
  if (boots) {
    const c = itemVisualColor(boots);
    P.bootMat.color.setHex(c.base);
    P.bootMat.emissive.setHex(c.glow);
    P.bootMat.emissiveIntensity = c.glow ? 0.4 : 0;
  }

  /* 护手 */
  const gloves = eq.gloves;
  if (gloves) {
    const c = itemVisualColor(gloves);
    P.handMat.color.setHex(c.base);
    P.handMat.emissive.setHex(c.glow);
    P.handMat.emissiveIntensity = c.glow ? 0.4 : 0;
  } else {
    P.handMat.emissive.setHex(0x000000);
  }

  /* 头盔 */
  clearGroup(P.helmG);
  if (eq.helm) {
    const c = itemVisualColor(eq.helm);
    const mat = M(c.base, { metal: c.metal, rough: 0.5, emissive: c.glow, ei: 0.45 });
    a.mats.push(mat);
    const t = tierIndex(eq.helm.ilvl);
    if (p.cls === 'mage') {
      const hat = mesh(coneGeo(0.34, 0.7, 6), mat, 0, 0.42, 0, P.helmG);
      mesh(boxGeo(0.62, 0.05, 0.62), mat, 0, 0.14, 0, P.helmG);
    } else if (p.cls === 'taoist') {
      mesh(boxGeo(0.56, 0.2, 0.56), mat, 0, 0.26, 0, P.helmG);
      mesh(boxGeo(0.5, 0.06, 0.5), M(0xe8dfa8), 0, 0.38, 0, P.helmG);
    } else {
      mesh(boxGeo(0.58, 0.3, 0.58), mat, 0, 0.22, 0, P.helmG);
      const horn = mesh(coneGeo(0.07, 0.42, 5), M(0xd8b25a, { metal: 0.8 }), 0, 0.45, 0, P.helmG);
      mesh(boxGeo(0.62, 0.08, 0.12), mat, 0, 0.12, 0.24, P.helmG);
    }
  }

  /* 护肩 */
  for (const [gg, sx] of [[P.shoulderL, -1], [P.shoulderR, 1]]) {
    clearGroup(gg);
    const sh = eq.shoulders;
    if (!sh) continue;
    const c = itemVisualColor(sh);
    const mat = M(c.base, { metal: c.metal, rough: 0.45, emissive: c.glow, ei: 0.4 });
    a.mats.push(mat);
    const s = mesh(sphGeo(0.26, 6), mat, sx * 0.1, 0.06, 0, gg);
    s.scale.set(1.25, 0.75, 1.1);
    mesh(coneGeo(0.08, 0.3, 4), mat, sx * 0.22, 0.22, 0, gg).rotation.z = sx * 0.4;
  }

  /* 披风 */
  clearGroup(P.capeG);
  const capeItem = eq.chest;
  if (capeItem && (capeItem.rarity === 'legendary' || capeItem.rarity === 'set' || capeItem.rarity === 'rare')) {
    const c = itemVisualColor(capeItem);
    const cm = M(c.dark, { rough: 0.9, side: THREE.DoubleSide, emissive: c.glow, ei: 0.18 });
    a.mats.push(cm);
    const cape = mesh(boxGeo(0.72, 1.15, 0.05), cm, 0, -0.6, -0.03, P.capeG);
    cape.rotation.x = 0.12;
  }

  /* 武器 */
  clearGroup(P.weaponHand);
  const wp = eq.weapon;
  if (wp) {
    const c = itemVisualColor(wp);
    const w = buildWeapon(wp.shape || 'sword', c.base, wp.rarity === 'common' ? null : c.glow);
    if (wp.shape === 'staff' || wp.shape === 'charm') w.rotation.set(0, 0, -0.08);
    else w.rotation.set(-0.12, 0, -0.85);
    w.position.set(0.1, 0.06, 0.04);
    P.weaponHand.add(w);
    P.weaponMat = c;
  }

  /* 副手 */
  clearGroup(P.offHand);
  const oh = eq.offhand;
  if (oh) {
    const c = itemVisualColor(oh);
    const w = buildWeapon(oh.shape || 'shield', c.base, oh.rarity === 'common' ? null : c.glow);
    w.rotation.set(0, 0, 0.2);
    P.offHand.add(w);
  }

  /* 高阶套装光环 */
  if (p.stats && p.stats.setBonuses.length >= 2) {
    if (!P.aura) {
      const ring = mesh(ringGeo(0.7, 0.82, 24), new THREE.MeshBasicMaterial({ color: 0x5ce08a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 0.05, 0, a.group);
      ring.rotation.x = -Math.PI / 2;
      P.aura = ring;
    }
    P.aura.material.color.setStyle(SETS[p.stats.setBonuses[0].setId].color || '#5ce08a');
  } else if (P.aura) { P.aura.visible = false; }
}

function itemVisualColor(item) {
  const glow = rarityGlow(item);
  const tier = tierIndex(item.ilvl);
  const metal = ['cloth', 'leather', 'iron', 'darkiron', 'dragon'][tier];
  const palette = {
    cloth: [0x6b5a4a, 0x4a3c30, 0.05],
    leather: [0x7a5a3a, 0x533c26, 0.1],
    iron: [0x8a8f96, 0x5a6068, 0.65],
    darkiron: [0x4a5058, 0x30343a, 0.8],
    dragon: [0x6a7a5a, 0x3a4530, 0.75]
  }[metal];
  let base = palette[0], dark = palette[1];
  if (item.slot === 'weapon' || item.slot === 'offhand') { base = 0xd0d4dc; dark = 0x7a8088; }
  if (glow && item.rarity !== 'common') base = mixHex(base, glow, 0.42);
  return { base, dark, metal: palette[2], glow: glow || 0x000000 };
}

function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

/* ---------------- 动作 ---------------- */
/* 关键帧插值：p 为 0..1 的进度，keys = [[进度, 值], ...]，段内 smoothstep 缓动 */
function keyLerp(p, keys) {
  const n = keys.length;
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < n; i++) {
    if (p <= keys[i][0]) {
      const t0 = keys[i - 1][0], v0 = keys[i - 1][1];
      const t1 = keys[i][0], v1 = keys[i][1];
      let u = (p - t0) / Math.max(1e-4, t1 - t0);
      u = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * u;
    }
  }
  return keys[n - 1][1];
}

/* 攻击关键帧表（偏移量，弧度）。约定：
 *   armRx 负值 = 手臂向前上方抬起；torsoX 正值 = 后仰、负值 = 前倾
 *   tPosZ 正值 = 上半身前冲
 * 节奏：0 ~ 0.32 蓄力抬刀，0.32 ~ 0.56 下劈（最快），0.56 ~ 1 收势 */
const ATK_KEYS = {
  /* 挥砍：右手向右后方拉开 -> 横贯身前扫到左侧（俯视角下投影最明显） */
  swing: {
    armRx: [[0, 0], [0.16, -0.38], [0.34, -0.88], [0.56, -1.16], [0.78, -0.40], [1, 0]],
    armRy: [[0, 0], [0.34, -0.22], [0.56, 0.26], [1, 0]],
    armRz: [[0, 0], [0.16, 0.58], [0.34, 1.26], [0.56, -1.06], [0.78, -0.28], [1, 0]],
    armLx: [[0, 0], [0.34, 0.42], [0.56, -0.36], [1, 0]],
    armLz: [[0, 0], [0.34, 0.46], [0.56, -0.40], [1, 0]],
    torsoX: [[0, 0], [0.34, 0.13], [0.52, -0.24], [0.78, -0.08], [1, 0]],
    torsoY: [[0, 0], [0.34, 0.78], [0.56, -0.80], [0.80, -0.22], [1, 0]],
    torsoZ: [[0, 0], [0.34, -0.17], [0.56, 0.17], [1, 0]],
    legRx: [[0, 0], [0.34, 0.28], [0.56, -0.38], [1, 0]],
    legLx: [[0, 0], [0.34, -0.28], [0.56, 0.38], [1, 0]],
    handRx: [[0, 0], [0.34, 0.34], [0.56, -0.42], [1, 0]],
    handRz: [[0, 0], [0.34, 0.78], [0.56, -0.86], [1, 0]],
    tPosZ: [[0, 0], [0.34, -0.05], [0.56, 0.15], [1, 0]],
    tPosY: [[0, 0], [0.34, 0.02], [0.56, -0.05], [1, 0]]
  },
  /* 重砸：双手举顶蓄力更久，砸得更沉 */
  slam: {
    armRx: [[0, 0], [0.34, -2.30], [0.52, -2.90], [0.68, -0.16], [0.84, -0.06], [1, 0]],
    armRy: [[0, 0], [0.52, -0.26], [0.68, 0.16], [1, 0]],
    armRz: [[0, 0], [0.52, 0.70], [0.68, -0.30], [1, 0]],
    armLx: [[0, 0], [0.34, -2.20], [0.52, -2.82], [0.68, -0.12], [1, 0]],
    armLz: [[0, 0], [0.52, -0.62], [0.68, 0.26], [1, 0]],
    torsoX: [[0, 0], [0.34, 0.28], [0.52, 0.36], [0.68, -0.36], [1, 0]],
    torsoY: [[0, 0], [0.52, 0.10], [0.68, -0.14], [1, 0]],
    torsoZ: [[0, 0], [0.68, 0.08], [1, 0]],
    legRx: [[0, 0], [0.52, 0.18], [0.68, -0.26], [1, 0]],
    legLx: [[0, 0], [0.52, 0.18], [0.68, -0.26], [1, 0]],
    handRx: [[0, 0], [0.52, 0.34], [0.68, -0.66], [1, 0]],
    handRz: [[0, 0], [0.52, 0.18], [0.68, -0.12], [1, 0]],
    tPosZ: [[0, 0], [0.52, -0.09], [0.68, 0.20], [1, 0]],
    tPosY: [[0, 0], [0.52, 0.05], [0.68, -0.13], [1, 0]]
  },
  /* 施法：双手向前推出、掌前亮起，收势缓慢 */
  cast: {
    armRx: [[0, 0], [0.24, -1.46], [0.42, -1.58], [0.70, -1.22], [1, 0]],
    armRy: [[0, 0], [0.24, 0.14], [0.70, 0.18], [1, 0]],
    armRz: [[0, 0], [0.24, -0.46], [0.70, -0.52], [1, 0]],
    armLx: [[0, 0], [0.24, -1.40], [0.42, -1.52], [0.70, -1.16], [1, 0]],
    armLz: [[0, 0], [0.24, 0.50], [0.70, 0.56], [1, 0]],
    torsoX: [[0, 0], [0.24, 0.16], [0.42, 0.21], [0.70, 0.06], [1, 0]],
    torsoY: [[0, 0], [0.24, -0.10], [0.70, -0.12], [1, 0]],
    torsoZ: [[0, 0], [0.24, -0.04], [1, 0]],
    legRx: [[0, 0], [0.30, 0.14], [0.70, 0.10], [1, 0]],
    legLx: [[0, 0], [0.30, -0.12], [1, 0]],
    handRx: [[0, 0], [0.24, -0.30], [0.70, -0.34], [1, 0]],
    handRz: [[0, 0], [0.24, 0.12], [1, 0]],
    tPosZ: [[0, 0], [0.24, -0.08], [0.70, -0.05], [1, 0]],
    tPosY: [[0, 0], [0.24, -0.02], [1, 0]]
  }
};

function updateActorAnim(a, dt) {
  const P = a.parts;
  const t = a.time = (a.time || 0) + dt;
  if (!P.torso) return;

  if (a.anim === 'die') {
    a.dieT = (a.dieT || 0) + dt;
    a.group.rotation.z = LERP(a.group.rotation.z, 1.5, dt * 6);
    a.group.position.y = LERP(a.group.position.y, -0.4, dt * 3);
    return;
  }

  const moving = a.moving ? 1 : 0;
  const speed = moving ? 11 : 3.2;
  const sw = Math.sin(t * speed) * (moving ? 0.55 : 0.06);

  /* ---- 基础姿态（行走摆臂 + 呼吸） ---- */
  let legLx = sw, legRx = -sw;
  let armLx = -sw * 0.7, armLz = -0.08;
  let armRx = sw * 0.7, armRy = 0, armRz = 0;
  let torsoRx = 0;
  let torsoRy = Math.sin(t * (moving ? 9 : 1.6)) * (moving ? 0.12 : 0.04);
  let torsoRz = 0;
  let tPosZ = 0, tPosY = 0;
  let handRx = 0, handRz = 0;

  /* ---- 攻击 / 施法：关键帧叠加 ---- */
  let p = -1;
  if (a.atkAnim > 0) {
    a.atkAnim = Math.max(0, a.atkAnim - dt * (a.atkSpeed || 2.5));
    p = 1 - a.atkAnim;
  }

  if (p >= 0 && a.atkType === 'spin') {
    a.group.rotation.y += dt * 20 * a.atkAnim;
  } else if (p >= 0) {
    const K = ATK_KEYS[a.atkType] || ATK_KEYS.swing;
    /* 连击左右交替：偶数段镜像横向轨迹 */
    const mir = (a.atkType === 'swing' && a.combo % 2 === 0) ? -1 : 1;
    armRx += keyLerp(p, K.armRx);
    armRy += keyLerp(p, K.armRy) * mir;
    armRz += keyLerp(p, K.armRz) * mir;
    armLx += keyLerp(p, K.armLx);
    armLz += keyLerp(p, K.armLz) * mir;
    torsoRx += keyLerp(p, K.torsoX);
    torsoRy += keyLerp(p, K.torsoY) * mir;
    torsoRz += keyLerp(p, K.torsoZ) * mir;
    legRx += keyLerp(p, K.legRx);
    legLx += keyLerp(p, K.legLx);
    handRx += keyLerp(p, K.handRx);
    handRz += keyLerp(p, K.handRz) * mir;
    tPosZ += keyLerp(p, K.tPosZ);
    tPosY += keyLerp(p, K.tPosY);
  }

  if (P.legL) P.legL.rotation.x = legLx;
  if (P.legR) P.legR.rotation.x = legRx;
  if (P.legBL) P.legBL.rotation.x = -sw * 0.8;
  if (P.legBR) P.legBR.rotation.x = sw * 0.8;
  if (P.armL) { P.armL.rotation.x = armLx; P.armL.rotation.z = armLz; }
  if (P.armR) P.armR.rotation.set(armRx, armRy, armRz);

  P.torso.position.y = 0.92 + tPosY + (moving ? Math.abs(Math.sin(t * 11)) * 0.05 : Math.sin(t * 2.4) * 0.02);
  P.torso.position.z = tPosZ;
  P.torso.rotation.set(torsoRx, torsoRy, torsoRz);
  if (P.weaponHand) P.weaponHand.rotation.set(handRx, 0, handRz);

  // 披风 / 翅膀
  if (P.capeG) P.capeG.rotation.x = 0.12 + Math.sin(t * 3) * 0.06 + (moving ? 0.28 : 0);
  if (P.wingL && P.wingR) {
    const f = Math.sin(t * (a.fly ? 9 : 5)) * 0.7;
    P.wingL.rotation.z = f; P.wingR.rotation.z = -f;
  }
  // 漂浮
  if (a.fly) a.group.position.y = (a.baseY || 0) + 0.25 + Math.sin(t * 3.2) * 0.14;

  // 受击白闪
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
    for (const m of a.mats) { if (m.__oem !== undefined) m.emissive.setHex(m.__oem); }
  }
}
