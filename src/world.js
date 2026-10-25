/* ============================================================
 * 世界构建：地表贴图 / 地图场景 / 植被建筑 / NPC / 传送阵
 * ============================================================ */

function makeGroundTexture(type) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const conf = {
    dirt: ['#6f7750', '#616844', '#7d8558', '#545b38'],
    bamboo: ['#4a6b3f', '#3d5a34', '#557a48', '#2f4a2a'],
    swamp: ['#42342e', '#332824', '#4e3d34', '#2a201c'],
    rock: ['#4a4a52', '#3c3c44', '#565660', '#30303a'],
    abyss: ['#221c2a', '#1a1422', '#2c2236', '#140f1c'],
    heaven: ['#a8b8cc', '#96a8bc', '#bccadd', '#8a9cae']
  }[type] || ['#7a6a48'];
  g.fillStyle = conf[0]; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const r = Math.random() * 3 + 0.6;
    g.fillStyle = conf[1 + Math.floor(Math.random() * 3)];
    g.globalAlpha = Math.random() * 0.5 + 0.15;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, r, 0, 7); g.fill();
  }
  // 大块斑
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.14;
    g.fillStyle = conf[1 + Math.floor(Math.random() * 3)];
    g.beginPath();
    const x = Math.random() * S, y = Math.random() * S, rr = Math.random() * 40 + 12;
    for (let k = 0; k < 8; k++) {
      const ang = k / 8 * Math.PI * 2;
      const r2 = rr * (0.65 + Math.random() * 0.5);
      g.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
    }
    g.closePath(); g.fill();
  }
  if (type === 'rock' || type === 'abyss') {
    g.globalAlpha = 0.5;
    g.strokeStyle = type === 'abyss' ? '#5a3a7a' : '#2a2a30';
    for (let i = 0; i < 9; i++) {
      g.beginPath(); g.lineWidth = Math.random() * 1.6 + 0.4;
      let x = Math.random() * S, y = Math.random() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += RND(-30, 30); y += RND(-30, 30); g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.anisotropy = 4;
  return tex;
}

function makeLabelSprite(text, color = '#ffe9a8', size = 40, sx = 6, sy = 1.5) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = `bold ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 256, 64);
  g.fillStyle = color;
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(sx, sy, 1);
  sp.renderOrder = 999;
  return sp;
}

/* ---------------- 道具构件 ---------------- */
/* 实例化草丛 + 野花，控制 draw call */
function scatterFoliage(root, count, rmin, rmax, grassColor, flowerColor) {
  const grassGeo = coneGeo(0.16, 0.42, 4);
  const grassM = M(grassColor, { rough: 1 });
  const grass = new THREE.InstancedMesh(grassGeo, grassM, count);
  const flowerGeo = sphGeo(0.1, 4);
  const flowers = new THREE.InstancedMesh(flowerGeo, M(flowerColor, { rough: 0.9 }), Math.floor(count / 6));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let fi = 0;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * 6.28, r = RND(rmin, rmax);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    eul.set(RND(-0.06, 0.06), RND(0, 3.14), RND(-0.06, 0.06));
    q.setFromEuler(eul);
    s.set(RND(0.6, 1.1), RND(0.55, 1.15), RND(0.6, 1.1));
    v.set(x, 0.3, z);
    m4.compose(v, q, s);
    grass.setMatrixAt(i, m4);
    if (i % 6 === 0 && fi < flowers.count) {
      s.set(1, 1, 1); eul.set(0, 0, 0); q.setFromEuler(eul);
      v.set(x + RND(-0.7, 0.7), 0.26, z + RND(-0.7, 0.7));
      m4.compose(v, q, s);
      flowers.setMatrixAt(fi++, m4);
    }
  }
  grass.castShadow = false; flowers.castShadow = false;
  root.add(grass); root.add(flowers);
  return { grass, flowers };
}

function makeTree(scale = 1, kind = 'pine') {
  const g = new THREE.Group();
  const trunk = M(0x4a3826, { rough: 1 });
  const leaf = M(kind === 'pine' ? 0x2f5a34 : 0x4a7a3a, { rough: 1 });
  mesh(cylGeo(0.22, 0.34, 3.4, 6), trunk, 0, 1.7, 0, g);
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) {
      const cone = mesh(coneGeo(1.5 - i * 0.32, 1.9, 7), leaf, 0, 3.0 + i * 1.0, 0, g);
      cone.rotation.y = RND(0, 3);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      mesh(sphGeo(RND(0.9, 1.3), 6), leaf, RND(-0.7, 0.7), 3.6 + RND(-0.6, 0.7), RND(-0.7, 0.7), g);
    }
  }
  g.scale.setScalar(scale);
  g.userData.collider = { r: 0.7 * scale };
  return g;
}

function makeBamboo(scale = 1) {
  const g = new THREE.Group();
  const stalk = M(0x6a8a4a, { rough: 0.9 });
  const leafM = M(0x3f6b32, { rough: 1 });
  const n = RNDI(2, 4);
  for (let i = 0; i < n; i++) {
    const h = RND(4.2, 6.6);
    const x = RND(-0.6, 0.6), z = RND(-0.6, 0.6);
    mesh(cylGeo(0.07, 0.1, h, 5), stalk, x, h / 2, z, g);
    for (let k = 0; k < 4; k++) {
      const lf = mesh(coneGeo(0.24, 1.0, 4), leafM, x + RND(-0.7, 0.7), h * RND(0.62, 0.98), z + RND(-0.7, 0.7), g);
      lf.rotation.z = RND(-1.2, 1.2);
      lf.rotation.x = RND(-1.0, 1.0);
    }
    for (let k = 0; k < 2; k++) {
      const nd = mesh(cylGeo(0.08, 0.08, 0.06, 5), M(0x4a6b32), x, h * 0.4 * (k + 1), z, g);
    }
  }
  g.scale.setScalar(scale);
  g.userData.collider = { r: 0.6 };
  return g;
}

function makeRock(scale = 1, color = 0x6a6a72) {
  const g = new THREE.Group();
  const m = M(color, { rough: 0.95 });
  const n = RNDI(1, 3);
  for (let i = 0; i < n; i++) {
    const r = mesh(new THREE.DodecahedronGeometry(RND(0.5, 1.1), 0), m, RND(-0.6, 0.6), RND(0.2, 0.5), RND(-0.6, 0.6), g);
    r.rotation.set(RND(0, 3), RND(0, 3), RND(0, 3));
    r.scale.y = RND(0.6, 1);
  }
  g.scale.setScalar(scale);
  g.userData.collider = { r: 0.8 * scale };
  return g;
}

function makeHouse(w = 5, d = 4, h = 3) {
  const g = new THREE.Group();
  const wall = M(0xcbb894, { rough: 0.95 });
  const beam = M(0x6a3f28, { rough: 0.9 });
  const roofM = M(0x3a4750, { rough: 0.7, metal: 0.1 });
  mesh(boxGeo(w, h, d), wall, 0, h / 2, 0, g);
  // 石基
  mesh(boxGeo(w + 0.3, 0.4, d + 0.3), M(0x8a8272, { rough: 1 }), 0, 0.2, 0, g);
  // 木柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(boxGeo(0.22, h, 0.22), beam, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06), g);
  mesh(boxGeo(w + 0.3, 0.28, d + 0.3), beam, 0, h, 0, g);
  // 屋顶：四坡
  mesh(boxGeo(w + 1.5, 0.22, d + 1.5), roofM, 0, h + 0.26, 0, g);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, h * 0.92, 4), roofM);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  roof.position.y = h + 0.38 + h * 0.46;
  roof.castShadow = true;
  g.add(roof);
  mesh(boxGeo(0.3, 0.5, 0.3), M(0x2a2a2a), 0, h + h * 0.92 + 0.55, 0, g);
  // 门
  mesh(boxGeo(1.3, 2, 0.12), M(0x3a2418), 0, 1.05, d / 2 + 0.04, g);
  mesh(boxGeo(1.7, 0.18, 0.16), beam, 0, 2.1, d / 2 + 0.08, g);
  // 窗
  for (const sx of [-1, 1]) mesh(boxGeo(0.9, 0.8, 0.1), M(0x2a2018, { emissive: 0xffa040, ei: 0.7 }), sx * w / 3.2, h * 0.6, d / 2 + 0.04, g);
  return g;
}

function makeLantern() {
  const g = new THREE.Group();
  mesh(cylGeo(0.06, 0.08, 3.2, 5), M(0x4a3020), 0, 1.6, 0, g);
  const ball = mesh(sphGeo(0.32, 7), M(0xd8402a, { emissive: 0xff5522, ei: 1.6 }), 0, 3.1, 0, g);
  mesh(cylGeo(0.34, 0.34, 0.1, 7), M(0x2a1a10), 0, 3.36, 0, g);
  const light = new THREE.PointLight(0xff8a40, 1.1, 14, 2);
  light.position.set(0, 3.1, 0);
  g.add(light);
  g.userData.flicker = light;
  return g;
}

function makePortal() {
  const g = new THREE.Group();
  const stone = M(0x3a3a48, { rough: 0.8, metal: 0.3 });
  mesh(cylGeo(3.2, 3.6, 0.4, 12), stone, 0, 0.2, 0, g);
  const ringM = M(0xc8a458, { metal: 0.9, rough: 0.3, emissive: 0x4a3210, ei: 0.8 });
  for (let i = 0; i < 6; i++) {
    const ang = i / 6 * Math.PI * 2;
    mesh(boxGeo(0.3, 2.6, 0.3), ringM, Math.cos(ang) * 2.9, 1.5, Math.sin(ang) * 2.9, g);
  }
  // 立起的门环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.16, 6, 28), ringM);
  ring.position.y = 2.4;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.15, 28),
    new THREE.MeshBasicMaterial({ color: 0x1e58c8, transparent: true, opacity: 0.62, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.set(0, 2.4, 0.02);
  g.add(inner);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.06, 5, 24),
    new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  swirl.position.set(0, 2.4, 0.08);
  g.add(swirl);
  const base = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28),
    new THREE.MeshBasicMaterial({ color: 0x2a6aff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.44;
  g.add(base);
  const l = new THREE.PointLight(0x5a9aff, 1.6, 18, 2); l.position.y = 2.2; g.add(l);
  g.userData.ring = swirl;
  g.userData.ring2 = ring;
  g.userData.light = l;
  return g;
}

function makeTorch() {
  const g = new THREE.Group();
  mesh(cylGeo(0.07, 0.09, 1.8, 5), M(0x4a3020), 0, 0.9, 0, g);
  mesh(sphGeo(0.22, 6), M(0xffaa30, { emissive: 0xff7722, ei: 2.2 }), 0, 1.9, 0, g);
  const l = new THREE.PointLight(0xff9944, 1.3, 12, 2); l.position.y = 1.9; g.add(l);
  g.userData.flicker = l;
  return g;
}

function makePlazaTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8b7c62'; g.fillRect(0, 0, S, S);
  const R = S / 2;
  for (let r = 26; r < R; r += 30) {
    g.strokeStyle = (r % 60 === 26) ? '#746550' : '#7f7059';
    g.lineWidth = 3;
    g.beginPath(); g.arc(R, R, r, 0, 7); g.stroke();
  }
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    g.strokeStyle = '#73644f'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(R + Math.cos(a) * 26, R + Math.sin(a) * 26);
    g.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R);
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = Math.random() * 0.28;
    g.fillStyle = Math.random() < 0.5 ? '#93846a' : '#5e5240';
    const x = Math.random() * S, y = Math.random() * S;
    const rr = Math.random() * 3 + 0.6;
    g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeCrate(s = 1) {
  const g = new THREE.Group();
  const wood = M(0x6a4f33, { rough: 0.95 });
  const dark = M(0x4a3524, { rough: 1 });
  mesh(boxGeo(0.9, 0.9, 0.9), wood, 0, 0.45, 0, g);
  for (const x of [-0.45, 0.45]) mesh(boxGeo(0.08, 0.92, 0.92), dark, x, 0.45, 0, g);
  for (const z of [-0.45, 0.45]) mesh(boxGeo(0.92, 0.92, 0.08), dark, 0, 0.45, z, g);
  g.scale.setScalar(s);
  g.userData.collider = { r: 0.62 * s };
  return g;
}

function makeBarrel() {
  const g = new THREE.Group();
  const wood = M(0x5a4128, { rough: 0.9 });
  mesh(cylGeo(0.42, 0.34, 1.0, 8), wood, 0, 0.5, 0, g);
  const hoop = M(0x3a3a42, { metal: 0.6, rough: 0.5 });
  for (const y of [0.2, 0.8]) {
    const h = mesh(new THREE.TorusGeometry(0.42, 0.035, 4, 10), hoop, 0, y, 0, g);
    h.rotation.x = Math.PI / 2;
  }
  g.userData.collider = { r: 0.5 };
  return g;
}

function makeBanner(color = 0xb8402a) {
  const g = new THREE.Group();
  mesh(cylGeo(0.06, 0.08, 3.4, 5), M(0x3a2a1c), 0, 1.7, 0, g);
  mesh(boxGeo(1.0, 1.5, 0.04), M(color, { side: THREE.DoubleSide, rough: 0.95 }), 0.5, 2.4, 0, g);
  mesh(boxGeo(0.2, 0.2, 0.06), M(0xd8b25a, { metal: 0.7 }), 0.5, 3.2, 0, g);
  g.userData.collider = { r: 0.3 };
  return g;
}

function makeBonePile() {
  const g = new THREE.Group();
  const bm = M(0xcfc8b0, { rough: 1 });
  for (let i = 0; i < 7; i++) {
    const b = mesh(cylGeo(0.06, 0.06, RND(0.5, 1.1), 5), bm, RND(-0.7, 0.7), RND(0.1, 0.3), RND(-0.7, 0.7), g);
    b.rotation.set(RND(0, 3), RND(0, 3), RND(-0.6, 0.6));
  }
  for (let i = 0; i < 3; i++) mesh(sphGeo(0.18, 5), bm, RND(-0.6, 0.6), RND(0.15, 0.3), RND(-0.6, 0.6), g);
  return g;
}

function makePillar(h = 7, broken = false, col = 0x8a8a92) {
  const g = new THREE.Group();
  const m = M(col, { rough: 0.9, metal: 0.05 });
  mesh(boxGeo(1.5, 0.4, 1.5), m, 0, 0.2, 0, g);
  mesh(boxGeo(1.05, h, 1.05), m, 0, h / 2, 0, g);
  if (!broken) {
    mesh(boxGeo(1.6, 0.4, 1.6), m, 0, h + 0.2, 0, g);
    const glow = mesh(sphGeo(0.24, 6), M(0x9a6aff, { emissive: 0x6a2aff, ei: 2 }), 0, h + 0.5, 0, g);
  }
  g.userData.collider = { r: 0.9 };
  return g;
}

/* ---------------- 构建地图 ---------------- */
function buildMap(mapId) {
  const cfg = MAPS[mapId];
  const root = new THREE.Group();
  const colliders = [];
  const anims = [];
  const occluders = [];
  const labels = [];

  const groundTex = makeGroundTexture(cfg.ground);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 0.98, metalness: 0 });
  groundMat.color.setHex({
    dirt: 0xc6d2b0, bamboo: 0xa6c096, swamp: 0x9a8064,
    rock: 0xa8a8b2, abyss: 0xc0a8dc, heaven: 0xc4d2e6
  }[cfg.ground] || 0xffffff);
  const gEmis = { abyss: [0x2a1040, 0.75], heaven: [0x223350, 0.5], mine: [0x140e08, 0.35] }[cfg.ground];
  if (gEmis) { groundMat.emissive.setHex(gEmis[0]); groundMat.emissiveIntensity = gEmis[1]; }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size * 3, cfg.size * 3, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // 边界（雾气环绕的岩壁）
  const R = cfg.size * 0.5;
  const borderM = M(cfg.ground === 'heaven' ? 0x8a9ab0 : (cfg.ground === 'abyss' ? 0x2b2038 : 0x3a3a40), { rough: 1 });
  for (let i = 0; i < 40; i++) {
    const ang = i / 40 * Math.PI * 2;
    const r = R + RND(2, 8);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const rock = mesh(new THREE.DodecahedronGeometry(RND(2, 5), 0), borderM, x, RND(0, 2), z, root);
    rock.rotation.set(RND(0, 3), RND(0, 3), RND(0, 3));
    rock.castShadow = false;
  }

  const add = (obj, x, z, collide = true, y = 0) => {
    obj.position.set(x, y, z);
    root.add(obj);
    if (collide && obj.userData.collider) colliders.push({ x, z, r: obj.userData.collider.r });
    occluders.push({ obj, r: (obj.userData.collider ? obj.userData.collider.r : 1.0) + 0.5 });
    return obj;
  };

  if (cfg.props === 'village') {
    // 村庄
    const housePos = [[-16, -7, 0.2], [15, -9, -0.3], [-18, 13, 0.1], [17, 15, -0.2]];
    for (const [x, z, rot] of housePos) {
      const h = makeHouse(RND(4.5, 6), RND(3.8, 4.6), RND(2.8, 3.4));
      h.rotation.y = rot;
      h.userData.collider = { r: 3.2 };
      add(h, x, z, true);
    }
    // 村中心石板
    const plazaGeo = new THREE.CylinderGeometry(6, 6, 0.14, 40);
    const pTop = new THREE.MeshStandardMaterial({ map: makePlazaTexture(), color: 0xd2c6ae, roughness: 0.95 });
    const pSide = M(0x4e463a, { rough: 1 });
    const plaza = new THREE.Mesh(plazaGeo, [pSide, pTop, pSide]);
    plaza.position.set(0, 0.07, 0);
    plaza.receiveShadow = true;
    root.add(plaza);
    // 货箱 / 酒坛 / 旗帜
    for (const [x, z] of [[-12, -2], [-11.1, -2.5], [13, 2], [13.7, 2.8], [-13.5, 18]]) add(makeCrate(RND(0.8, 1.1)), x, z);
    for (const [x, z] of [[-9, -4], [-8.2, -3.4], [14, -2], [14.6, -2.6]]) add(makeBarrel(), x, z);
    // 草丛野花（实例化，单次绘制）
    const foliage = scatterFoliage(root, 300, 8.5, 34, 0x4e6e34, 0xd8b860);
    // 旗幡只立在广场两侧与后方，正面（相机方向 +Z）留空，避免挡住角色视线
    const bannerAng = [200, 240, 300, 340, 20, 160].map(d => d * Math.PI / 180);
    bannerAng.forEach((ang, i) => {
      add(makeBanner(i % 2 ? 0xa83424 : 0x2a4a7a), Math.cos(ang) * 7.4, Math.sin(ang) * 7.4, false);
    });
    plaza.receiveShadow = true;
    for (let i = 0; i < 5; i++) {
      const l = makeLantern(); add(l, RND(-18, 18), RND(-4, 20), false);
      anims.push(a => { if (l.userData.flicker) l.userData.flicker.intensity = 0.9 + Math.sin(a * 7 + i) * 0.25; });
    }
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * 7;
      add(makeTree(RND(0.8, 1.4), 'leaf'), Math.cos(ang) * RND(22, 32), Math.sin(ang) * RND(22, 32));
    }
    // 牌坊
    const gate = new THREE.Group();
    const gm = M(0x8a4a34, { rough: 0.85 });
    mesh(boxGeo(0.5, 6, 0.5), gm, -3, 3, 0, gate);
    mesh(boxGeo(0.5, 6, 0.5), gm, 3, 3, 0, gate);
    mesh(boxGeo(8, 0.5, 0.7), gm, 0, 6, 0, gate);
    mesh(boxGeo(6.4, 0.4, 0.6), gm, 0, 5.1, 0, gate);
    const plaque = mesh(boxGeo(2.6, 1.1, 0.2), M(0x2a1a12, { emissive: 0x3a2a10 }), 0, 4.5, 0.1, gate);
    add(gate, 0, 34, false);
    // 水井
    const well = new THREE.Group();
    mesh(cylGeo(1.2, 1.3, 0.9, 10), M(0x8a8272, { rough: 1 }), 0, 0.45, 0, well);
    mesh(cylGeo(1.05, 1.05, 0.1, 10), M(0x1a3040, { emissive: 0x0a2030 }), 0, 0.85, 0, well);
    add(well, 10, -7, true);
  } else if (cfg.props === 'bamboo') {
    for (let i = 0; i < 95; i++) {
      const ang = Math.random() * 7, r = RND(8, R + 4);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (Math.hypot(x, z) < 7) continue;
      add(makeBamboo(RND(0.8, 1.5)), x, z);
    }
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * 7, r = RND(6, R);
      add(makeRock(RND(0.5, 1.1), 0x6a6a62), Math.cos(ang) * r, Math.sin(ang) * r);
    }
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * 7, r = RND(12, R - 4);
      const t = makeTorch(); add(t, Math.cos(ang) * r, Math.sin(ang) * r, false);
      anims.push(a => { t.userData.flicker.intensity = 1.0 + Math.sin(a * 9 + i) * 0.3; });
    }
    scatterFoliage(root, 420, 6, R * 0.94, 0x3f5f2c, 0x9a6ac0);
    scatterFoliage(root, 420, 6, R * 0.94, 0x3f5f2c, 0x9a6ac0);
  } else if (cfg.props === 'swamp') {
    // 死树
    for (let i = 0; i < 55; i++) {
      const ang = Math.random() * 7, r = RND(9, R + 3);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const g = new THREE.Group();
      const tm = M(0x3a2f26, { rough: 1 });
      mesh(cylGeo(0.25, 0.45, RND(3, 5), 5), tm, 0, 2, 0, g);
      for (let k = 0; k < 4; k++) {
        const br = mesh(cylGeo(0.06, 0.13, RND(1.2, 2.4), 4), tm, RND(-0.6, 0.6), RND(2.6, 4), RND(-0.6, 0.6), g);
        br.rotation.set(RND(-0.7, 0.7), RND(0, 3), RND(-0.9, 0.9));
      }
      g.scale.setScalar(RND(0.8, 1.3));
      g.position.set(x, 0, z);
      root.add(g);
      colliders.push({ x, z, r: 0.6 });
    }
    // 毒潭
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * 7, r = RND(10, R - 8);
      const puddle = mesh(new THREE.CircleGeometry(RND(2.5, 5), 16), new THREE.MeshStandardMaterial({ color: 0x2a4a30, emissive: 0x1a3a20, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 }), Math.cos(ang) * r, 0.04, Math.sin(ang) * r, root);
      puddle.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * 7, r = RND(10, R - 4);
      add(makeBonePile(), Math.cos(ang) * r, Math.sin(ang) * r, false);
    }
    scatterFoliage(root, 260, 7, R * 0.9, 0x3a4a28, 0x7ab04a);
    scatterFoliage(root, 260, 7, R * 0.9, 0x3a4a28, 0x7ab04a);
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * 7, r = RND(14, R - 6);
      const t = makeTorch(); add(t, Math.cos(ang) * r, Math.sin(ang) * r, false);
      anims.push(a => { t.userData.flicker.intensity = 1.0 + Math.sin(a * 8 + i) * 0.35; });
    }
  } else if (cfg.props === 'mine') {
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * 7, r = RND(8, R + 2);
      add(makeRock(RND(0.7, 2.0), 0x55555e), Math.cos(ang) * r, Math.sin(ang) * r);
    }
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * 7, r = RND(9, R - 4);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const sup = new THREE.Group();
      const wm = M(0x4a3524, { rough: 0.95 });
      mesh(boxGeo(0.4, 5, 0.4), wm, -2, 2.5, 0, sup);
      mesh(boxGeo(0.4, 5, 0.4), wm, 2, 2.5, 0, sup);
      mesh(boxGeo(4.6, 0.4, 0.5), wm, 0, 5, 0, sup);
      sup.rotation.y = RND(0, 3);
      sup.position.set(x, 0, z);
      root.add(sup);
    }
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * 7, r = RND(10, R - 6);
      const t = makeTorch(); add(t, Math.cos(ang) * r, Math.sin(ang) * r, false);
      anims.push(a => { t.userData.flicker.intensity = 1.1 + Math.sin(a * 11 + i * 2) * 0.4; });
    }
    // 矿车
    for (let i = 0; i < 3; i++) {
      const cart = new THREE.Group();
      mesh(boxGeo(1.6, 0.9, 1.1), M(0x5a5a62, { metal: 0.7, rough: 0.5 }), 0, 0.7, 0, cart);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = mesh(cylGeo(0.28, 0.28, 0.16, 8), M(0x2a2a2e), sx * 0.7, 0.28, sz * 0.5, cart);
        w.rotation.z = Math.PI / 2;
      }
      add(cart, RND(-20, 20), RND(-20, 20));
    }
  } else if (cfg.props === 'abyss') {
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * 7, r = RND(9, R - 2);
      add(makePillar(RND(4, 9), CHANCE(0.4), 0x584a68), Math.cos(ang) * r, Math.sin(ang) * r);
    }
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * 7, r = RND(8, R);
      const orb = new THREE.Group();
      const s = mesh(sphGeo(RND(0.16, 0.3), 6), M(0xb07aff, { emissive: 0x9a4aff, ei: 2.4 }), 0, RND(1.5, 5), 0, orb);
      const l = new THREE.PointLight(0x9a6aff, 0.7, 8, 2); orb.add(l);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      orb.position.set(x, 0, z);
      root.add(orb);
      anims.push(a => { orb.position.y = Math.sin(a * 1.4 + i) * 0.4; s.rotation.y += 0.01; });
    }
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * 7, r = RND(6, R);
      add(makeBonePile(), Math.cos(ang) * r, Math.sin(ang) * r, false);
    }
  } else if (cfg.props === 'heaven') {
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * 7, r = RND(10, R - 2);
      add(makePillar(RND(6, 11), CHANCE(0.5)), Math.cos(ang) * r, Math.sin(ang) * r);
    }
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * 7, r = RND(6, R);
      const cloud = mesh(sphGeo(RND(1.2, 2.6), 5), new THREE.MeshStandardMaterial({ color: 0xdde8f5, transparent: true, opacity: 0.5, roughness: 1 }), Math.cos(ang) * r, RND(0.5, 2), Math.sin(ang) * r, root);
      cloud.scale.y = 0.35;
    }
    // 悬浮碎块
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * 7, r = RND(14, R);
      if (Math.abs(Math.cos(ang) * r) < 12 && Math.sin(ang) * r < -18) continue;
      const blk = mesh(boxGeo(RND(1, 3), RND(0.4, 0.8), RND(1, 3)), M(0x8a94a8, { rough: 1 }), Math.cos(ang) * r, RND(3, 9), Math.sin(ang) * r, root);
      blk.rotation.set(RND(0, 1), RND(0, 3), RND(0, 1));
      anims.push(a => { blk.position.y += Math.sin(a * 0.8 + i) * 0.003; blk.rotation.y += 0.0015; });
    }
  }

  // 传送阵
  const portal = makePortal();
  const px = cfg.portal ? cfg.portal.x : 0, pz = cfg.portal ? cfg.portal.z : 30;
  portal.position.set(px, 0, pz);
  root.add(portal);
  colliders.push({ x: px, z: pz, r: 3.4, isPortal: true });
  anims.push(a => { portal.userData.ring.rotation.z += 0.02; portal.userData.light.intensity = 1.3 + Math.sin(a * 2) * 0.3; });

  return { root, colliders, anims, occluders, portal: { x: px, z: pz }, labels };
}

/* ---------------- NPC 生成 ---------------- */
function buildNPC(npcId) {
  const npc = NPCS[npcId];
  const roleCfg = {
    quest: { color: 0xb8a06a, cloth: 0x6a5a3a, skin: 0xd8b090 },
    shop: { color: 0x8a6a4a, cloth: 0x5a3a26, skin: 0xb08a68 },
    potion: { color: 0x6a9a7a, cloth: 0x3a5a46, skin: 0xe0c0a0 },
    travel: { color: 0x9a9ab0, cloth: 0x4a4a5a, skin: 0xd0b090 },
    decompose: { color: 0xc08060, cloth: 0x6a4026, skin: 0xd8b090 }
  }[npc.role];
  const a = buildHumanoid({
    color: roleCfg.color, cloth: roleCfg.cloth, skin: roleCfg.skin,
    legColor: roleCfg.cloth, bootColor: 0x2a2018, sleeve: roleCfg.color, glove: roleCfg.cloth
  });
  a.group.scale.setScalar(1.05);
  // 手持物
  if (npc.role === 'quest') {
    const cane = buildWeapon('staff', 0x8a6a3a, null, 0.9);
    cane.position.y = 0;
    a.parts.weaponHand.add(cane);
    // 长须
    const beard = mesh(boxGeo(0.12, 0.5, 0.08), M(0xe8e8e8), 0, -0.05, 0.22, a.parts.headG);
    beard.rotation.x = 0.15;
  } else if (npc.role === 'shop') {
    const hammer = new THREE.Group();
    mesh(boxGeo(0.07, 0.7, 0.07), M(0x5a4030), 0, 0, 0, hammer);
    mesh(boxGeo(0.28, 0.2, 0.2), M(0x55555c, { metal: 0.8 }), 0, 0.34, 0, hammer);
    a.parts.weaponHand.add(hammer);
  } else if (npc.role === 'travel') {
    const sword = buildWeapon('taojian', 0x9a8a5a, 0x88ffaa, 0.85);
    a.parts.weaponHand.add(sword);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 20), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  a.group.add(ring);
  const label = makeLabelSprite(npc.name, '#ffe9a8', 40, 4.4, 1.1);
  label.position.y = 3.1;
  a.group.add(label);
  return a;
}
