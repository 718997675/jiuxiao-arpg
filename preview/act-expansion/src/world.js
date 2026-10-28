/* ============================================================
 * 世界构建：地表贴图 / 地图场景 / 植被建筑 / NPC / 传送阵
 * ============================================================ */

/* [M3 · §5.4] 贴图缓存。
 *
 * 原来每进一张图就重新生成一张 512×512 的 canvas：9000 次 arc + 60 个
 * 多边斑，实测 12~20ms。现在地图从 8 张涨到 41 张，来回传送一次就重画一次，
 * 手机上能明显看到「传送卡一下」。
 * 同一 type 的贴图完全一样（种子是 Math.random，但视觉上是同一张），
 * 所以按 type 缓存、多张图共用一张 —— 41 张图实际只会生成 ≤12 张。
 *
 * 注意：缓存的是 CanvasTexture，被多个 map 共用。THREE 的纹理可以安全
 * 被多个材质引用，只要不 dispose。地图卸载时**不能** dispose 地面贴图，
 * 否则第二次进同一 type 的图会拿到已销毁的纹理（黑地面）。 */
const _groundTexCache = {};
function makeGroundTexture(type) {
  const key = type || 'dirt';
  if (_groundTexCache[key]) return _groundTexCache[key];
  const tex = _makeGroundTexture(key);
  _groundTexCache[key] = tex;
  return tex;
}

function _makeGroundTexture(type) {
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
    heaven: ['#a8b8cc', '#96a8bc', '#bccadd', '#8a9cae'],
    /* [M2] 冰封地貌：卷二寒潭水牢 / 冰魄湖。
     * 比 heaven 更冷更亮 —— 天阙是「仙石」，冰面要有反光感，
     * 所以最亮的一档拉到接近白，暗部压到蓝灰，一眼看出是冻住的。 */
    ice: ['#7d94a8', '#6d8498', '#9db6c8', '#5f7688'],
    /* [M3] 火山灰：卷二 2-3 焚天焦土。
     * 比 rock 暖、比 swamp 干 —— 三档灰 + 一档焦黑，
     * 底色不压太暗，否则配合 ash 地面的低雾距会糊成一片黑。 */
    ash: ['#4a4038', '#3a322c', '#5c5046', '#2a2420'],
    /* [M3b] 雪原：卷一铁山绝顶 / 卷四剑冢绝巅 / 卷五九霄绝顶。
     * 最亮的一档接近纯白，暗部是蓝灰 —— 雪地的「亮」不是白，是阴影里的蓝，
     * 这一点决定了它和 heaven（仙石）不会撞色。
     * 两轮返回值：第一版亮部 #f6fafd 过曝；第二版 #eef5fc 仍然过曝 ——
     * 原因是 **底色也在往上抬**（#dce7f3 本身就接近白），贴图里 9000 个
     * 中灰点是压在近白底上的，等于没有对比。第三版把底色压到 #cfdcec、
     * 中灰压到 #b3c4d8，亮部才真的成为「亮部」。 */
    snow: ['#cfdcec', '#b3c4d8', '#e9f1fa', '#93aac3'],
    /* [M3b] 白骨：卷三骨塔祭场 / 白骨长廊。
     * 米黄而不是灰白 —— 泡过水的骨头是暖色的，纯灰会像水泥地。
     * 但**不能黄过头**：第一版 #c9bda4 在暖色阳光下整片读成沙漠，
     * 骨地和沙地的差别不在明度，在「灰」—— 现在往灰里收一档，
     * 再靠贴图里的白色骨屑把「骨」这个信息补回来。 */
    bone: ['#bfb8a2', '#a9a28c', '#d8d2be', '#7d7767'],
    /* [M3b] 虚空：卷三九幽深渊 / 卷五玉京废墟、星陨台、无相幻境、镜渊、混沌海。
     * 比 abyss 更「空」—— 暗部压到近黑，亮部带一点紫，
     * 目的是让地面的纹理几乎看不出来，全靠道具发光撑视觉。 */
    void: ['#1c1628', '#120e1c', '#2a1e3c', '#08060e'],
    /* [M3b] 浅水：卷三忘川河滩 / 黄泉渡、卷二沉骨滩。
     * 蓝绿而不是蓝 —— 忘川是死水，不该有清亮的水色。
     * 整体提亮一档：原来 #2e4450 在忘川的暖雾里跟 Nine Hells 的石头分不开，
     * 水面必须比「泥」亮，玩家才知道自己踩在水里。 */
    flood: ['#33505c', '#27414c', '#45626f', '#1a2a32'],
    /* 试炼场：冷紫黑石，比九幽再「干净」一点 —— 这里是擂台，不是废墟 */
    trial: ['#3c3452', '#332c46', '#4a4064', '#2a2440']
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
  /* 裂缝：rock/abyss/ash/void/bone 有，snow 与 flood 没有 ——
   * 雪面和水面不该出现干裂，加了反而破坏地貌的辨识度。 */
  if (type === 'rock' || type === 'abyss' || type === 'ash' || type === 'void' || type === 'bone') {
    g.globalAlpha = type === 'ash' ? 0.4 : 0.5;
    /* ash 的裂缝用暗红（底下还没凉透）；void 用紫（裂隙里透出的光）；
     * bone 用深米色（骨缝），都比纯黑更贴合地貌。 */
    g.strokeStyle = type === 'abyss' ? '#5a3a7a'
      : type === 'ash' ? '#7a2a12'
        : type === 'void' ? '#6a3a9a'
          : type === 'bone' ? '#7a6a52'
            : '#2a2a30';
    for (let i = 0; i < (type === 'ash' ? 14 : 9); i++) {
      g.beginPath(); g.lineWidth = Math.random() * 1.6 + 0.4;
      let x = Math.random() * S, y = Math.random() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += RND(-30, 30); y += RND(-30, 30); g.lineTo(x, y); }
      g.stroke();
    }
  }
  /* [M3b] 雪面：**先铺暗、再盖亮**。顺序反了的话蓝色雪丘会把亮点压掉，
   * 整片雪地就只剩「白 + 白 + 白」。
   *
   * 三个层次的分工：
   *   ① 蓝灰雪丘（大、淡、统一朝向）→ 起伏。扁长比 2.6:1 且同向，
   *      读成「风吹出来的坡」；正圆雪堆在俯视角下会被当成石头或水渍。
   *   ② 风痕（细长亮线）→ 方向感。没有它，雪原的纹理是各向同性的，
   *      跟 heaven 的仙石地面就只差颜色。
   *   ③ 白亮点（小、密）→ 颗粒感，中远景靠它避免糊成白板。
   */
  if (type === 'snow') {
    for (let i = 0; i < 38; i++) {
      g.globalAlpha = RND(0.10, 0.26);
      g.fillStyle = i % 3 ? '#a2b8d2' : '#839dbb';
      const x = Math.random() * S, y = Math.random() * S, rr = Math.random() * 60 + 16;
      const ang = Math.random() * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      g.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2;
        const r2 = rr * (0.55 + Math.random() * 0.55);
        const px = Math.cos(a) * r2 * 1.6, py = Math.sin(a) * r2 * 0.62;
        g.lineTo(x + px * ca - py * sa, y + px * sa + py * ca);
      }
      g.closePath(); g.fill();
    }
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = RND(0.05, 0.15);
      g.strokeStyle = '#ffffff';
      g.lineWidth = RND(1.2, 3.4);
      const x = Math.random() * S, y = Math.random() * S, len = RND(90, 280);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y + RND(-14, 14), x + len, y + RND(-9, 9));
      g.stroke();
    }
    for (let i = 0; i < 1100; i++) {
      g.globalAlpha = Math.random() * 0.6 + 0.18;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, Math.random() * 1.2 + 0.35, 0, 7);
      g.fill();
    }
  }
  /* [M3b] 白骨：白色骨屑 + 深色骨缝。
   * 大块斑已经把地面做「旧」了，缺的是**碎**——骨地的辨识度来自
   * 「满地碎骨」，而不是底色。骨屑画成细长条（1×4~9px），
   * 圆点在这个尺寸下会被读成沙粒，和沙地彻底混掉。 */
  if (type === 'bone') {
    /* 湿泥斑 + 白垩斑：**先铺这两层，再撒骨屑**。
     * 只有骨屑的话地面仍然是一整片光滑的米黄 —— 俯视角下读成「沙漠」，
     * 加骨道具也救不回来（骨和沙的明度差不够）。真正把「沙」拆掉的是
     * 这一深一浅两种大斑：深斑 = 泡过水的泥，浅斑 = 干透的白垩。 */
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = RND(0.14, 0.3);
      g.fillStyle = i % 4 ? '#5d5747' : '#4e4a3c';
      const x = Math.random() * S, y = Math.random() * S, rr = Math.random() * 54 + 14;
      g.beginPath();
      g.ellipse(x, y, rr * 1.5, rr * 0.8, RND(0, 3.14), 0, 7);
      g.fill();
    }
    for (let i = 0; i < 16; i++) {
      g.globalAlpha = RND(0.1, 0.22);
      g.fillStyle = '#e6dfc8';
      const x = Math.random() * S, y = Math.random() * S, rr = Math.random() * 40 + 12;
      g.beginPath();
      g.ellipse(x, y, rr * 1.4, rr * 0.7, RND(0, 3.14), 0, 7);
      g.fill();
    }
    for (let i = 0; i < 620; i++) {
      g.globalAlpha = RND(0.18, 0.5);
      g.strokeStyle = i % 4 ? '#efe9d8' : '#8b8272';
      g.lineWidth = RND(0.8, 2.0);
      const x = Math.random() * S, y = Math.random() * S;
      const a = Math.random() * 6.28, len = RND(4, 9);
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    /* 骨缝：比裂缝更短更细，密而不抢 —— 只有 9 条长裂缝时地面太干净 */
    for (let i = 0; i < 46; i++) {
      g.globalAlpha = RND(0.12, 0.3);
      g.strokeStyle = '#6a6252';
      g.lineWidth = RND(0.6, 1.4);
      const x = Math.random() * S, y = Math.random() * S;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + RND(-22, 22), y + RND(-16, 16));
      g.stroke();
    }
  }
  /* [M3b] 浅水：横向水纹 + 泥痕。**只画横线**是因为这个视角下水是
   * 「一层层往前推」的，环状或乱纹会读成石头缝；横纹 + 低对比度才读得出
   * 「水很浅、底下是泥」。
   * 第一版 alpha 0.08~0.36 在暗绿底上完全看不见（截图是一片纯色），
   * 现在亮纹拉到 0.14~0.5，并补一层更暗的泥痕做反向对比。 */
  if (type === 'flood') {
    for (let i = 0; i < 60; i++) {
      g.globalAlpha = Math.random() * 0.36 + 0.14;
      g.strokeStyle = Math.random() < 0.6 ? '#7ba0ad' : '#16242c';
      g.lineWidth = Math.random() * 2.4 + 0.6;
      const y = Math.random() * S, x = Math.random() * S, len = Math.random() * 160 + 40;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + len * 0.3, y + RND(-6, 6), x + len * 0.7, y + RND(-6, 6), x + len, y);
      g.stroke();
    }
    for (let i = 0; i < 22; i++) {
      g.globalAlpha = RND(0.10, 0.22);
      g.fillStyle = '#1b2a30';
      const x = Math.random() * S, y = Math.random() * S, rr = Math.random() * 46 + 14;
      g.beginPath();
      g.ellipse(x, y, rr * 1.7, rr * 0.55, RND(0, 3.14), 0, 7);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.anisotropy = 4;
  return tex;
}

/* [M3b] 柔边圆点贴图 —— 给虚空星屑用。
 *
 * THREE 的 `PointsMaterial` **不带 map 时画的是硬边正方形**。
 * 第一版星屑没给贴图，size 提到 0.9 之后截图里是一地淡紫色小方块
 * （远看像渲染 bug，近看像贴图丢失）。
 * 32×32 的径向渐变是最省的做法：一次生成、所有 Points 共用、带 markShared 不参与释放。
 */
let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.62)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  _dotTex = markShared(new THREE.CanvasTexture(c));
  return _dotTex;
}

/* [M3b] 水洼贴图 —— 柔边 + 两圈涟漪。
 *
 * 硬边正圆的浅蓝圆片会被读成「UI 标记」或「石膏」，不像水；
 * 水的视觉特征一半在**边缘**（alpha 收到 0）和**内部环纹**上。
 * 一张 128×128 共用给所有水洼，18 个水洼只多一次绘制。
 */
let _puddleTex = null;
function puddleTexture() {
  if (_puddleTex) return _puddleTex;
  const S = 128, R = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(R, R, 4, R, R, R);
  gr.addColorStop(0, 'rgba(196,228,240,0.95)');
  gr.addColorStop(0.55, 'rgba(140,184,204,0.78)');
  gr.addColorStop(0.88, 'rgba(96,140,162,0.35)');
  gr.addColorStop(1, 'rgba(80,120,140,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(226,244,252,0.55)';
  for (const [rr, lw] of [[0.86, 1.6], [0.62, 1.2], [0.4, 1.0]]) {
    g.lineWidth = lw;
    g.beginPath(); g.arc(R, R, R * rr, 0, 7); g.stroke();
  }
  _puddleTex = markShared(new THREE.CanvasTexture(c));
  return _puddleTex;
}

function makeLabelSprite(text, color = '#ffe9a8', size = 40, sx = 6, sy = 1.5) {  const c = document.createElement('canvas');
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

/* [M3b] 雪松的三种树冠材质共用一份。
 * 一棵雪松 = 3 个锥体（暗针叶 / 半覆雪 / 压满雪），72 棵就是 216 个材质；
 * 每次进图 new 一遍会让首帧多 30~40ms，而且 disposeTree 会把它们逐个释放。
 * `M()` 没有缓存，所以这里手工缓存 + `markShared`（共享资源不参与卸载释放）。 */
let _snowTreeMats = null;
function snowTreeMats() {
  if (!_snowTreeMats) {
    _snowTreeMats = {
      trunk: markShared(M(0x2e2620, { rough: 1 })),
      low: markShared(M(0x3f5a70, { rough: 1 })),
      mid: markShared(M(0x6b8398, { rough: 1 })),
      top: markShared(M(0xdde8f4, { rough: 0.95 }))
    };
  }
  return _snowTreeMats;
}

function makeTree(scale = 1, kind = 'pine') {
  const g = new THREE.Group();
  /* [M3b] kind='snow'：雪松 —— 松树骨架，三层树冠由下往上「由暗到白」。
   * 复用松树的锥形层次而不是新建模型，是因为「雪压松枝」本来就是松树的形状，
   * 换个颜色就能读出来；新模型只会让 draw call 预算再紧一档。
   *
   * ⚠️ 两轮踩坑：
   *   ① 第一版树冠写白色（0xe6f0fa）—— 白树长在白地上，截图里一棵都看不见；
   *   ② 第二版整棵改成冷蓝灰（0x9db4c8）—— 是能看见了，但三个锥体同色，
   *      读出来是一块灰板，看不出「松」。
   * 现在**逐层变白**：底层深冷杉绿灰 → 中层过渡 → 顶冠近白。
   * 深色底把轮廓钉在白地上，白顶交代「上面压着雪」，两个信息一次给全。 */
  if (kind === 'snow') {
    const sm = snowTreeMats();
    mesh(cylGeo(0.22, 0.34, 3.4, 6), sm.trunk, 0, 1.7, 0, g);
    const tiers = [sm.low, sm.mid, sm.top];
    for (let i = 0; i < 3; i++) {
      const cone = mesh(coneGeo(1.5 - i * 0.32, 1.9, 7), tiers[i], 0, 3.0 + i * 1.0, 0, g);
      cone.rotation.y = RND(0, 3);
    }
    g.scale.setScalar(scale);
    g.userData.collider = { r: 0.7 * scale };
    return g;
  }
  const trunk = M(kind === 'snow' ? 0x3a3028 : 0x4a3826, { rough: 1 });
  const leaf = M(kind === 'pine' ? 0x2f5a34 : (kind === 'snow' ? 0x9db4c8 : 0x4a7a3a), { rough: 1 });
  mesh(cylGeo(0.22, 0.34, 3.4, 6), trunk, 0, 1.7, 0, g);
  if (kind === 'pine' || kind === 'snow') {
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

/* ---------------- M12：区域化工具 ----------------
 * 可走区域 = MAP_ZONES 里所有 zone 的并集（见 src/data/data-maps.js）。
 * 这里负责把「数据上的区域」变成看得见的地面、墙和道具分布。 */

/* 区域边界采样点：返回 { x, z, nx, nz }，法线朝区域外 */
function zoneEdgePoints(z, step) {
  const pts = [];
  step = step || 2.6;
  if (z.type === 'circle') {
    const n = Math.max(12, Math.round(Math.PI * 2 * z.r / step));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      pts.push({ x: z.x + Math.cos(a) * z.r, z: z.z + Math.sin(a) * z.r, nx: Math.cos(a), nz: Math.sin(a) });
    }
    return pts;
  }
  const hw = z.w / 2, hh = z.h / 2;
  const nx = Math.max(2, Math.round(z.w / step)), nz = Math.max(2, Math.round(z.h / step));
  for (let i = 0; i <= nx; i++) {
    const x = z.x - hw + z.w * i / nx;
    pts.push({ x, z: z.z - hh, nx: 0, nz: -1 });
    pts.push({ x, z: z.z + hh, nx: 0, nz: 1 });
  }
  for (let i = 1; i < nz; i++) {
    const zz = z.z - hh + z.h * i / nz;
    pts.push({ x: z.x - hw, z: zz, nx: -1, nz: 0 });
    pts.push({ x: z.x + hw, z: zz, nx: 1, nz: 0 });
  }
  return pts;
}

/* 在可走区域里随机取点（按面积加权，走廊不撒道具 —— 否则会挡路） */
function pickSpotInZones(mapId, pad) {
  if (typeof mapZones !== 'function') return null;
  const zs = mapZones(mapId);
  if (!zs) return null;
  const rooms = zs.filter(z => z.kind !== 'link');
  if (!rooms.length) return null;
  const areaOf = z => (z.type === 'circle' ? Math.PI * z.r * z.r : z.w * z.h);
  let total = 0;
  for (const z of rooms) total += areaOf(z);
  let t = Math.random() * total;
  let pick = rooms[rooms.length - 1];
  for (const z of rooms) { t -= areaOf(z); if (t <= 0) { pick = z; break; } }
  return randomPointInZone(pick, pad);
}

/* 在区域外轮廓上摆一圈乱石当墙。走廊开口处自动留空（外侧仍在区域内就跳过）。
 * 用 InstancedMesh 合成一次 draw call —— 每张图近 200 块石头，逐个 Mesh 会拖垮手机。 */
function buildZoneWalls(mapId, root, mat) {
  if (typeof mapZones !== 'function') return 0;
  const zs = mapZones(mapId);
  if (!zs) return 0;
  const spots = [];
  for (const z of zs) {
    for (const p of zoneEdgePoints(z, 2.6)) {
      /* 外侧 1.7 米仍在可走区域内 → 这里是走廊口或两区接缝，不放墙 */
      if (zonesContain(mapId, p.x + p.nx * 1.7, p.z + p.nz * 1.7)) continue;
      /* 内侧 1.2 米必须是可走区域，否则是两块区域之间的夹缝，也不用堵 */
      if (!zonesContain(mapId, p.x - p.nx * 1.2, p.z - p.nz * 1.2)) continue;
      spots.push(p);
    }
  }
  if (!spots.length) return 0;
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  inst.castShadow = false;
  inst.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    const jx = p.x + p.nx * RND(0.4, 1.5) + RND(-0.5, 0.5);
    const jz = p.z + p.nz * RND(0.4, 1.5) + RND(-0.5, 0.5);
    const sc = RND(1.1, 2.4);
    eul.set(RND(0, 3.1), RND(0, 3.1), RND(0, 3.1));
    q.setFromEuler(eul);
    s.set(sc, sc * RND(0.7, 1.3), sc);
    v.set(jx, RND(-0.3, 0.9), jz);
    m4.compose(v, q, s);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
  return spots.length;
}

/* ---------------- 构建地图 ---------------- */

/* 出口门（图间传送门）的构件：门 + 名牌 + 碰撞 + 光效。
 * 抽成独立函数是因为它有**两个出生时机**：
 *   ① 进图时 —— 本图首领已经打过（`mapCleared`），门一开始就在；
 *   ② 首领倒地那一瞬间 —— 由 `Game.markCleared()` 当场把门立在 boss 区，
 *      玩家站在原地抬头就看见，不用重进图。
 * 两处必须共用同一个函数，否则「重进图的门」和「当场立起来的门」会慢慢长歪。 */
function makeExitGate(parent, gx, gz, toId, colliders, anims, labels) {
  const gp = makePortal();
  gp.position.set(gx, 0, gz);
  gp.scale.setScalar(0.72);
  parent.add(gp);
  colliders.push({ x: gx, z: gz, r: 2.6 });
  anims.push(a => { gp.userData.ring.rotation.z -= 0.03; gp.userData.light.intensity = 1.0 + Math.sin(a * 2.4) * 0.25; });
  /* 名牌：目标图名（带箭头，和入口的传送阵区分开 —— 传送阵是「开面板」，门是「去下一张」） */
  const gl = makeLabelSprite('→ ' + MAPS[toId].name, '#ffe9a8', 34, 6.2, 1.55);
  gl.position.set(gx, 4.9, gz);
  parent.add(gl);
  if (labels) labels.push(gl);
  return { x: gx, z: gz, to: toId, name: MAPS[toId].name };
}

/* opts.cleared：本图首领是否已经打过（决定出口门这次进图要不要直接立起来）。
 * 不传就当作没打过 —— 门等首领倒地再由 Game.markCleared() 立。 */
function buildMap(mapId, opts) {
  const cfg = MAPS[mapId];
  const root = new THREE.Group();
  const colliders = [];
  const anims = [];
  const occluders = [];
  const labels = [];

  /* [M12] 有区域配置的图走「区域 + 走廊」，没有的（老图 / 试炼场）仍用圆形 */
  const zones = (typeof mapZones === 'function') ? mapZones(mapId) : null;
  /* [M3b] baseColor 补 4 种新地貌。
   * 不补的话会落到 `|| 0xffffff` —— 可走区直接拿满亮白去乘贴图，
   * 雪原和骨滩都会过曝（截图里雪地整片糊白、骨地像沙漠）。
   * 取值 = 「贴图主色的提亮版」，比贴图本身亮一档，才能和压暗的底层荒原分开。 */
  const baseColor = {
    dirt: 0xc6d2b0, bamboo: 0xa6c096, swamp: 0x9a8064,
    rock: 0xa8a8b2, abyss: 0xc0a8dc, heaven: 0xc4d2e6, trial: 0xd2c8ec,
    /* [M3b] 四个新地貌的提亮版，跟着第三版贴图一起收了一档 ——
     * 贴图压暗之后如果提亮值不跟着降，等于又把它抬回白板。
     * bone 额外再压一档：地面比骨道具还亮的话，「满地白骨」就糊在底里了。 */
    snow: 0xc6d6e8, bone: 0xb2aa96, void: 0x9c88c4, flood: 0xa4c0cc
  }[cfg.ground] || 0xffffff;

  const groundTex = makeGroundTexture(cfg.ground);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 0.98, metalness: 0 });
  groundMat.color.setHex(baseColor);
  /* 区域化地图：底层压暗当「不可走的荒原」，可走区域再单独铺亮色，
   * 玩家一眼能看出「哪能走」—— 这比墙更早建立空间感。 */
  if (zones) groundMat.color.multiplyScalar(0.40);
  /* [M3b] void 也补一条自发光：`void` 的贴图四档全近黑，只靠环境光会黑到
   * 看不清地形（截图里除了紫裂缝什么都没有）。0x1e0e38 / 0.55 是「有微光但
   * 仍然读成虚空」的那一档 —— 再亮就变成第二个 abyss 了。 */
  const gEmis = {
    abyss: [0x2a1040, 0.75], heaven: [0x223350, 0.5], mine: [0x140e08, 0.35],
    trial: [0x2a1444, 0.4], void: [0x1e0e38, 0.55]
  }[cfg.ground];
  if (gEmis) { groundMat.emissive.setHex(gEmis[0]); groundMat.emissiveIntensity = gEmis[1]; }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size * 3, cfg.size * 3, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  /* 可走区域的地面。每个 zone 单独一块，纹理按区域尺寸重复，
   * 免得 30 米的大厅把 8 米小径的纹理拉糊。y 逐块微抬避免共面闪烁。 */
  if (zones) {
    zones.forEach((z, i) => {
      const tex = groundTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const w = z.type === 'circle' ? z.r * 2 : z.w;
      const h = z.type === 'circle' ? z.r * 2 : z.h;
      tex.repeat.set(Math.max(1, w / 9), Math.max(1, h / 9));
      const mat = new THREE.MeshStandardMaterial({ map: tex, color: baseColor, roughness: 0.98, metalness: 0 });
      if (gEmis) { mat.emissive.setHex(gEmis[0]); mat.emissiveIntensity = gEmis[1] * 0.8; }
      const geo = z.type === 'circle'
        ? new THREE.CircleGeometry(z.r, 48)
        : new THREE.PlaneGeometry(z.w, z.h);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(z.x, 0.02 + i * 0.0012, z.z);
      m.receiveShadow = true;
      root.add(m);
    });
  }

  // 边界
  const R = cfg.size * 0.5;
  /* [M3b] 边界岩色查表。地貌从 4 种涨到 11 种之后，原来的三层嵌套三元已经读不动了。
   * 取值原则：比地貌底色更暗一档 —— 这圈石头的任务是「压住画面边缘」，不是被当成石头看。
   * 雪原反其道用亮蓝灰（0x9aacbe）：雪地边缘放暗石头会像一堆脏东西。
   * 虚空也反其道（0x332a4a）：第一版按原则压到 0x1a1426，结果墙和「更黑的外圈荒原」
   * 完全同色，整张图的边界消失了，玩家看不出自己能走多远 —— 暗底上的边界必须比底更亮。 */
  const BORDER_COL = {
    heaven: 0x8a9ab0, abyss: 0x2b2038, ice: 0x8fa8bc,
    snow: 0x9aacbe, bone: 0x8a7e64, void: 0x332a4a, flood: 0x2a3e48
  };
  const borderM = M(BORDER_COL[cfg.ground] || 0x3a3a40, { rough: 1 });
  if (zones) {
    /* 区域化：墙沿区域外轮廓长出来，走廊口自动留空 */
    buildZoneWalls(mapId, root, borderM);
    /* 外围远景再撒一圈大石，避免压暗的荒原一眼望到天边。
     * [v1.12.1] 半径不能再用 size×0.5 —— 区域放大后地图的对角半径
     * 比 size 的一半还远，按 size 摆石环会直接把大石头摆进房间里。
     * 改成按 zone 包围盒的对角半径算。 */
    let farR = R;
    for (const z of zones) {
      const hw = z.type === 'circle' ? z.r : z.w / 2;
      const hh = z.type === 'circle' ? z.r : z.h / 2;
      farR = Math.max(farR, Math.hypot(Math.abs(z.x) + hw, Math.abs(z.z) + hh));
    }
    farR += 8;
    for (let i = 0; i < 26; i++) {
      const ang = i / 26 * Math.PI * 2 + RND(-0.1, 0.1);
      const r = farR + RND(4, 12);
      const rock = mesh(new THREE.DodecahedronGeometry(RND(3, 6), 0), borderM, Math.cos(ang) * r, RND(-1, 1), Math.sin(ang) * r, root);
      rock.rotation.set(RND(0, 3), RND(0, 3), RND(0, 3));
      rock.castShadow = false;
    }
  } else {
    for (let i = 0; i < 40; i++) {
      const ang = i / 40 * Math.PI * 2;
      const r = R + RND(2, 8);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const rock = mesh(new THREE.DodecahedronGeometry(RND(2, 5), 0), borderM, x, RND(0, 2), z, root);
      rock.rotation.set(RND(0, 3), RND(0, 3), RND(0, 3));
      rock.castShadow = false;
    }
  }

  const add = (obj, x, z, collide = true, y = 0) => {
    obj.position.set(x, y, z);
    root.add(obj);
    if (collide && obj.userData.collider) colliders.push({ x, z, r: obj.userData.collider.r });
    occluders.push({ obj, r: (obj.userData.collider ? obj.userData.collider.r : 1.0) + 0.5 });
    return obj;
  };

  /* [M12] 道具撒点：有区域配置时只在可走区域内撒（走廊除外），
   * 否则会有一半竹子长在墙外、玩家看得见摸不着。
   * 没有区域配置的图（试炼擂台）退回原来的圆形撒点。 */
  const spot = (rmin, rmax, pad) => {
    if (zones) {
      const p = pickSpotInZones(mapId, pad === undefined ? 2.2 : pad);
      if (p) return p;
    }
    const ang = Math.random() * 7, r = RND(rmin, rmax);
    return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
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
      const { x, z } = spot(8, R + 4);
      add(makeBamboo(RND(0.8, 1.5)), x, z);
    }
    for (let i = 0; i < 26; i++) {
      const { x, z } = spot(6, R, 3.2);
      add(makeRock(RND(0.5, 1.1), 0x6a6a62), x, z);
    }
    for (let i = 0; i < 4; i++) {
      const { x, z } = spot(12, R - 4, 3);
      const t = makeTorch(); add(t, x, z, false);
      anims.push(a => { t.userData.flicker.intensity = 1.0 + Math.sin(a * 9 + i) * 0.3; });
    }
    scatterFoliage(root, 420, 6, R * 0.94, 0x3f5f2c, 0x9a6ac0);
  } else if (cfg.props === 'swamp') {
    // 死树
    for (let i = 0; i < 55; i++) {
      const { x, z } = spot(9, R + 3, 3.4);
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
      const { x, z } = spot(10, R - 8, 5);
      const puddle = mesh(new THREE.CircleGeometry(RND(2.5, 5), 16), new THREE.MeshStandardMaterial({ color: 0x2a4a30, emissive: 0x1a3a20, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 }), x, 0.04, z, root);
      puddle.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      const { x, z } = spot(10, R - 4, 3);
      add(makeBonePile(), x, z, false);
    }
    scatterFoliage(root, 260, 7, R * 0.9, 0x3a4a28, 0x7ab04a);
    for (let i = 0; i < 5; i++) {
      const { x, z } = spot(14, R - 6, 3);
      const t = makeTorch(); add(t, x, z, false);
      anims.push(a => { t.userData.flicker.intensity = 1.0 + Math.sin(a * 8 + i) * 0.35; });
    }
  } else if (cfg.props === 'mine') {
    for (let i = 0; i < 60; i++) {
      const { x, z } = spot(8, R + 2, 3.4);
      add(makeRock(RND(0.7, 2.0), 0x55555e), x, z);
    }
    for (let i = 0; i < 18; i++) {
      const { x, z } = spot(9, R - 4, 3);
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
      const { x, z } = spot(10, R - 6, 3);
      const t = makeTorch(); add(t, x, z, false);
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
      const cs = spot(10, R - 6, 4);
      add(cart, cs.x, cs.z);
    }
  } else if (cfg.props === 'abyss') {
    for (let i = 0; i < 22; i++) {
      const { x, z } = spot(9, R - 2, 3.6);
      add(makePillar(RND(4, 9), CHANCE(0.4), 0x584a68), x, z);
    }
    for (let i = 0; i < 26; i++) {
      const { x, z } = spot(8, R, 2.5);
      const orb = new THREE.Group();
      const s = mesh(sphGeo(RND(0.16, 0.3), 6), M(0xb07aff, { emissive: 0x9a4aff, ei: 2.4 }), 0, RND(1.5, 5), 0, orb);
      const l = new THREE.PointLight(0x9a6aff, 0.7, 8, 2); orb.add(l);
      orb.position.set(x, 0, z);
      root.add(orb);
      anims.push(a => { orb.position.y = Math.sin(a * 1.4 + i) * 0.4; s.rotation.y += 0.01; });
    }
    for (let i = 0; i < 16; i++) {
      const { x, z } = spot(6, R, 2.5);
      add(makeBonePile(), x, z, false);
    }
  } else if (cfg.props === 'heaven') {
    for (let i = 0; i < 20; i++) {
      const { x, z } = spot(10, R - 2, 3.8);
      add(makePillar(RND(6, 11), CHANCE(0.5)), x, z);
    }
    for (let i = 0; i < 30; i++) {
      const { x, z } = spot(6, R, 2.2);
      const cloud = mesh(sphGeo(RND(1.2, 2.6), 5), new THREE.MeshStandardMaterial({ color: 0xdde8f5, transparent: true, opacity: 0.5, roughness: 1 }), x, RND(0.5, 2), z, root);
      cloud.scale.y = 0.35;
    }
    // 悬浮碎块
    for (let i = 0; i < 12; i++) {
      const { x, z } = spot(14, R, 4);
      const blk = mesh(boxGeo(RND(1, 3), RND(0.4, 0.8), RND(1, 3)), M(0x8a94a8, { rough: 1 }), x, RND(3, 9), z, root);
      blk.rotation.set(RND(0, 1), RND(0, 3), RND(0, 1));
      anims.push(a => { blk.position.y += Math.sin(a * 0.8 + i) * 0.003; blk.rotation.y += 0.0015; });
    }
  } else if (cfg.props === 'snow') {
    /* ---------------- 雪原（M3b） ----------------
     * 雪松 + 冰柱 + 雪堆。**没有草丛** —— 雪地里长草是错的，
     * 散点交给雪堆（无碰撞，纯视觉起伏）和零星裸岩。
     * 冰柱用半透明高光材质：雪原的辨识度一半来自「冷白色的亮」，
     * 纯不透明的浅蓝会读成石膏。 */
    /* 雪松 72 棵（第一版 46 棵，16000㎡ 上摊下来是「一片白地上零星几棵树」，
     * 截图里入口附近一棵都看不到）。树也是雪原唯一的「纵向参照物」——
     * 没有它，三层台地在俯视角下全是平的白面。 */
    for (let i = 0; i < 72; i++) {
      const { x, z } = spot(10, R + 3, 3.6);
      add(makeTree(RND(1.0, 1.8), 'snow'), x, z);
    }
    const iceM = new THREE.MeshStandardMaterial({
      color: 0xbfe0f0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.72
    });
    for (let i = 0; i < 24; i++) {
      const { x, z } = spot(8, R - 2, 3.2);
      const g = new THREE.Group();
      const h = RND(2.2, 5.2);
      const spike = mesh(coneGeo(0.42, 1, 6), iceM, 0, 0.5, 0, g);
      spike.scale.set(RND(0.8, 1.3), h, RND(0.8, 1.3));
      spike.position.y = h / 2;
      spike.rotation.set(RND(-0.12, 0.12), RND(0, 3), RND(-0.12, 0.12));
      g.userData.collider = { r: 0.5 };
      add(g, x, z);
    }
    /* 冰面：贴地的半透明亮片。
     * 雪原的问题是「全图一个亮度」——雪堆、树、冰柱都近白，俯视角下
     * 缺一层**平的、反光的**东西，坡地和冰面才分得开。
     * 冰面必须画成不规则多边形（0.14 高、圆盘读成水渍），
     * 而且要贴地（y=0.04）——抬高一点就会和雪堆一起变成「第二个凸起」。 */
    for (let i = 0; i < 16; i++) {
      const { x, z } = spot(8, R - 4, 3.4);
      const pts = [], seg = RNDI(7, 11), rad = RND(2.2, 4.6);
      for (let k = 0; k < seg; k++) {
        const a = k / seg * Math.PI * 2, rr2 = rad * RND(0.6, 1.15);
        pts.push(new THREE.Vector2(Math.cos(a) * rr2, Math.sin(a) * rr2));
      }
      const sheet = mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshStandardMaterial({
        color: 0xcfeaf8, emissive: 0x2a4a60, emissiveIntensity: 0.45,
        roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide
      }), x, 0.04, z, root);
      sheet.rotation.x = -Math.PI / 2;
      sheet.rotation.z = RND(0, 3);
      sheet.castShadow = false;
    }
    /* 雪堆：压扁的半球半埋进地里，只露上半个弧 —— 正圆的球放地上读成「雪球」 */
    for (let i = 0; i < 34; i++) {
      const { x, z } = spot(6, R, 2.4);
      const d = mesh(sphGeo(1, 6), M(0xf2f8ff, { rough: 1 }), x, -0.3, z, root);
      d.scale.set(RND(1.2, 2.8), RND(0.32, 0.6), RND(1.2, 2.8));
    }
    for (let i = 0; i < 14; i++) {
      const { x, z } = spot(8, R, 3);
      add(makeRock(RND(0.5, 1.2), 0x6a7484), x, z);
    }
  } else if (cfg.props === 'bone') {
    /* ---------------- 白骨（M3b） ----------------
     * 骨柱 + 肋骨拱 + 骨堆 + 鬼火。
     * 骨柱是「一节一节码起来的骨节」，不是一根圆柱 —— 圆柱在这个地貌里
     * 会被读成石柱，只有分段才读得出「堆起来的骨头」。
     * 骨色用暖白（0xcfc4a8）而不是灰白：泡过水的骨头是暖的。 */
    for (let i = 0; i < 22; i++) {
      const { x, z } = spot(9, R - 2, 3.4);
      const g = new THREE.Group();
      const bm = M(0xcfc4a8, { rough: 1 });
      const n = RNDI(5, 8);
      for (let k = 0; k < n; k++) {
        const seg = mesh(cylGeo(0.34, 0.4, 0.62, 6), bm, RND(-0.16, 0.16), 0.31 + k * 0.6, RND(-0.16, 0.16), g);
        seg.rotation.y = RND(0, 3);
        seg.rotation.z = RND(-0.06, 0.06);
      }
      mesh(sphGeo(0.34, 6), M(0xe0d6ba, { rough: 1 }), 0, 0.31 + n * 0.6, 0, g);
      g.userData.collider = { r: 0.6 };
      add(g, x, z);
    }
    /* 肋骨拱：半圆环立在空地上。TorusGeometry 的弧从 0 到 π 正好是
     * 「两端落地、中间拱起」，不用自己拼两根弯骨。 */
    const ribM = M(0xd6cbae, { rough: 1 });
    for (let i = 0; i < 9; i++) {
      const { x, z } = spot(12, R - 6, 4.2);
      const g = new THREE.Group();
      const rad = RND(2.2, 3.6);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(rad, 0.17, 5, 14, Math.PI), ribM));
      g.rotation.y = RND(0, 3);
      g.userData.collider = { r: rad * 0.5 };
      add(g, x, z);
    }
    /* 脊柱：一串椎节躺在地上，中间拱起。
     * 这是骨地最「像骨」的东西 —— 骨堆是碎渣、骨柱是堆叠，只有脊柱有
     * 解剖结构（一节一节 + 朝上的棘突），远看也知道「这里死过一只大东西」。
     * 缺了棘突就只是一串横放的圆柱，所以每节都要配一根短刺。 */
    const vertM = M(0xdcd2b6, { rough: 1 });
    const thornM = M(0xc4b898, { rough: 1 });
    for (let i = 0; i < 12; i++) {
      const { x, z } = spot(9, R - 4, 3.6);
      const g = new THREE.Group();
      const n = RNDI(6, 9);
      const wob = RND(-0.1, 0.1);
      for (let k = 0; k < n; k++) {
        const px = (k - (n - 1) / 2) * 0.66;
        const py = 0.32 + Math.sin(k / Math.max(1, n - 1) * Math.PI) * RND(0.28, 0.6);
        const pz = Math.sin(k * 0.9 + i) * wob;
        const seg = mesh(cylGeo(0.3, 0.32, 0.46, 6), vertM, px, py, pz, g);
        seg.rotation.z = Math.PI / 2;
        mesh(coneGeo(0.12, 0.5, 4), thornM, px, py + 0.34, pz, g);
      }
      g.rotation.y = RND(0, 3);
      g.userData.collider = { r: 1.3 };
      add(g, x, z);
    }
    /* 头骨：不追求解剖准确，只要「圆颅 + 吻部 + 两只暗眼窝」的剪影。
     * 一个头骨 4 个 mesh（颅/吻/双眼），比堆 20 根骨头更省，也更远就看得出。 */
    for (let i = 0; i < 10; i++) {
      const { x, z } = spot(8, R - 4, 3.2);
      const g = new THREE.Group();
      const skM = M(0xe2d8bc, { rough: 1 });
      const cran = mesh(sphGeo(0.56, 7), skM, 0, 0.42, 0, g);
      cran.scale.set(1, 0.86, 1.1);
      const snout = mesh(boxGeo(0.42, 0.34, 0.5), skM, 0, 0.3, 0.56, g);
      const eyeM = M(0x241f18, { rough: 0.6 });
      for (const ex of [-0.2, 0.2]) mesh(sphGeo(0.15, 5), eyeM, ex, 0.5, 0.42, g);
      g.rotation.y = RND(0, 3);
      g.rotation.z = RND(-0.3, 0.3);
      g.scale.setScalar(RND(0.9, 1.8));
      g.userData.collider = { r: 0.7 };
      add(g, x, z);
    }
    /* 骨堆：**大小必须拉开**（0.7~2.0）。第一版全按 1.0 撒，40 堆在
     * 16000㎡ 上读起来像「撒了一把牙签」，完全撑不起「白骨遍地」。
     *
     * 用 InstancedMesh 而不是 60 个 `makeBonePile()` 组：
     * 一个骨堆 = 7 根骨头 + 3 个骨节 = 10 个 mesh，60 堆就是 **600 次绘制** ——
     * 这一条让白骨图的对象数从 654 直接涨到 1080（实测）。改成两个
     * InstancedMesh（骨头 420、骨节 180）之后是 2 次绘制，视觉一模一样。
     * 不带碰撞 —— 碎骨不该挡路。 */
    const PILES = 60, PER = 7, KNOBS = 3;
    const stickGeo = cylGeo(0.06, 0.06, 1, 5);
    const pileMat = M(0xcfc8b0, { rough: 1 });
    const sticks = new THREE.InstancedMesh(stickGeo, pileMat, PILES * PER);
    const knobs = new THREE.InstancedMesh(sphGeo(0.18, 5), pileMat, PILES * KNOBS);
    const pm4 = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler();
    const pv = new THREE.Vector3(), ps = new THREE.Vector3();
    let si = 0, ki = 0;
    for (let i = 0; i < PILES; i++) {
      const { x, z } = spot(6, R, 2.2);
      const sc = RND(0.7, 2.0), rot = RND(0, 3.14);
      for (let k = 0; k < PER; k++) {
        const lx = RND(-0.7, 0.7) * sc, lz = RND(-0.7, 0.7) * sc;
        pe.set(RND(0, 3), RND(0, 3), RND(-0.6, 0.6));
        pq.setFromEuler(pe);
        ps.set(sc, RND(0.5, 1.1) * sc, sc);
        pv.set(x + lx * Math.cos(rot) - lz * Math.sin(rot), RND(0.1, 0.3) * sc,
          z + lx * Math.sin(rot) + lz * Math.cos(rot));
        pm4.compose(pv, pq, ps);
        sticks.setMatrixAt(si++, pm4);
      }
      for (let k = 0; k < KNOBS; k++) {
        const lx = RND(-0.6, 0.6) * sc, lz = RND(-0.6, 0.6) * sc;
        pe.set(RND(0, 3), RND(0, 3), RND(0, 3));
        pq.setFromEuler(pe);
        ps.setScalar(sc);
        pv.set(x + lx * Math.cos(rot) - lz * Math.sin(rot), RND(0.15, 0.3) * sc,
          z + lx * Math.sin(rot) + lz * Math.cos(rot));
        pm4.compose(pv, pq, ps);
        knobs.setMatrixAt(ki++, pm4);
      }
    }
    sticks.instanceMatrix.needsUpdate = true;
    knobs.instanceMatrix.needsUpdate = true;
    root.add(sticks); root.add(knobs);
    /* 鬼火：青绿色，和卷二火原的橙红明确区分 —— 白骨地貌的关键词是「冷」 */
    for (let i = 0; i < 8; i++) {
      const { x, z } = spot(12, R - 6, 4);
      const g = new THREE.Group();
      const orb = mesh(sphGeo(0.26, 6), M(0x8affd0, { emissive: 0x3affb0, ei: 2.6 }), 0, RND(1.4, 3.4), 0, g);
      const l = new THREE.PointLight(0x4affc0, 0.8, 10, 2);
      l.position.y = orb.position.y;
      g.add(l);
      add(g, x, z, false);
      anims.push(a => { g.position.y = Math.sin(a * 1.1 + i) * 0.35; orb.rotation.y += 0.012; });
    }
  } else if (cfg.props === 'void') {
    /* ---------------- 虚空（M3b） ----------------
     * 黑曜石柱 + 漂浮虚空球 + 悬浮碎块 + 星屑。
     * 虚空地貌的地面几乎没有纹理（`void` 四档全近黑），视觉全靠道具发光撑起来 ——
     * 所以这里的发光物件密度比别的图高一档，否则整张图会「黑得没有信息」。
     * 点光只给 12 只球：再多的话手机端每帧的光照计算会明显掉帧（m3-check D 段盯着）。 */
    for (let i = 0; i < 24; i++) {
      const { x, z } = spot(9, R - 2, 3.6);
      add(makePillar(RND(5, 11), CHANCE(0.45), 0x2e2440), x, z);
    }
    /* 地台碎板：贴地的扁平石板，**唯一作用是给地面一点「结构」**。
     * 虚空的地面纹理是故意做成近黑的（见 `void` 的配色注释），结果第一版
     * 整张图是一块纯紫渐变 —— 玩家分不清自己站在地上还是浮着。
     * 这些板子比地面亮一档、带硬边和投影，俯视角下立刻读出「一层一层的地台」。
     * 不带碰撞：它们只是地砖，不是障碍。 */
    /* 板子必须比地面**亮**：0x3d3258 试过一版，比自发光的紫地面暗，
     * 截图里读成「地上一块块黑洞」。0x4a4470 才读成「抬起来一层的石台」。 */
    const slabM = M(0x4a4470, { rough: 1 });
    const slabEdgeM = M(0x8268bc, { rough: 0.9 });
    for (let i = 0; i < 26; i++) {
      const { x, z } = spot(8, R - 3, 3.2);
      const g = new THREE.Group();
      const w = RND(3.4, 8.2), d = RND(3.4, 8.2);
      mesh(boxGeo(w, 0.34, d), slabM, 0, 0.08, 0, g);
      /* 只有一侧描边：四面全描会变成「发光的盒子」，一侧就够交代板子的边 */
      mesh(boxGeo(w, 0.36, 0.22), slabEdgeM, 0, 0.1, d / 2, g);
      g.rotation.y = RND(0, 3);
      add(g, x, z, false);
    }
    for (let i = 0; i < 30; i++) {
      const { x, z } = spot(8, R, 2.4);
      const g = new THREE.Group();
      const orb = mesh(sphGeo(0.28, 6), M(0xc09aff, { emissive: 0x8a4aff, ei: 2.8 }), 0, RND(1.2, 6), 0, g);
      if (i < 12) {
        const l = new THREE.PointLight(0x9a6aff, 0.75, 9, 2);
        l.position.y = orb.position.y;
        g.add(l);
      }
      add(g, x, z, false);
      anims.push(a => { g.position.y = Math.sin(a * 1.5 + i) * 0.45; orb.rotation.y += 0.015; });
    }
    /* 悬浮碎块：从上方塌下来的岩板，缓慢自转 —— 让「虚空」有纵深感 */
    for (let i = 0; i < 14; i++) {
      const { x, z } = spot(12, R, 4);
      const blk = mesh(boxGeo(1, 1, 1), M(0x241c34, { rough: 1 }), x, RND(4, 12), z, root);
      blk.scale.set(RND(1.2, 3.4), RND(0.3, 0.8), RND(1.2, 3.4));
      blk.rotation.set(RND(0, 1), RND(0, 3), RND(0, 1));
      anims.push(a => { blk.position.y += Math.sin(a * 0.7 + i) * 0.003; blk.rotation.y += 0.0012; });
    }
    /* 星屑：一个 Points 云 = 一次 draw call。虚空地貌的「空」全靠它，
     * 用 240 个 mesh 来做会直接吃掉半张图的对象预算。 */
    const starGeo = new THREE.BufferGeometry();
    const spos = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      const ang = Math.random() * 6.28, rr = RND(6, R + 14);
      spos[i * 3] = Math.cos(ang) * rr;
      spos[i * 3 + 1] = RND(0.6, 22);
      spos[i * 3 + 2] = Math.sin(ang) * rr;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      /* size 0.9 而不是 0.34：PointsMaterial 的 size 是**世界单位**，
       * 0.34 在 30 米外只有亚像素，截图里整片星屑一个点都看不见。
       * map 必须给 —— 不给贴图时 Points 画的是硬边正方形（截图里是一地
       * 淡紫色小方块，像渲染出错），柔边圆点才读成「星屑」。
       * 尺寸收到 0.62：0.9 在镜头附近会变成一颗悬空的白色小球（加色混合
       * 直接过曝成白），近处的星应该只是「亮一下」。 */
      map: dotTexture(), color: 0xc4aaff, size: 0.62, sizeAttenuation: true,
      transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    root.add(stars);
    anims.push(a => { stars.rotation.y = a * 0.012; });
    /* 贴地浮尘：第二批 Points，尺寸更小、位置压到 0.3~3 米。
     * 星屑全飘在 6~22 米，俯视角下大部分在画面外；贴地这一层才是
     * 「脚边有东西在亮」的来源，也是虚空唯一的地面纹理。 */
    const moteGeo = new THREE.BufferGeometry();
    const mpos = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) {
      const ang = Math.random() * 6.28, rr = RND(4, R - 2);
      mpos[i * 3] = Math.cos(ang) * rr;
      mpos[i * 3 + 1] = RND(0.3, 3);
      mpos[i * 3 + 2] = Math.sin(ang) * rr;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      map: dotTexture(), color: 0x9a7ae0, size: 0.42, sizeAttenuation: true,
      transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    root.add(motes);
    anims.push(a => { motes.rotation.y = -a * 0.02; });
  } else if (cfg.props === 'flood') {
    /* ---------------- 浅水（M3b） ----------------
     * 水洼 + 枯木 + 芦苇 + 石墩。
     * 水洼**不带碰撞** —— 玩家踩着水走才像浅滩；能挡路的只有石墩和枯木。
     * 芦苇直接复用 scatterFoliage（实例化，一次 draw call），
     * 不自己堆 300 个锥体 —— 那是 300 次绘制，手机端立刻掉帧。 */
    /* 水洼：**比地面亮**、带反射、边缘柔和，才读成「水」。
     * 三轮返回值：
     *   ① 0x3a5a68（比地面暗）+ 半径 3~6.5 → 截图里是地上一块块黑洞；
     *   ② 0x5a8496 + 硬边正圆 → 变成「贴在地上的浅蓝圆片」，像 UI 标记；
     *   ③ 现在是**带柔边与水波环的贴图圆盘**：边缘 alpha 收到 0，
     *      再叠两圈涟漪，才读得出「一洼浅水」。
     * 用贴图而不是自己拼多边形：18 个水洼拼多边形要 18 份几何体，
     * 贴图是一张 128×128 共用，且柔边比锯齿多边形好看。 */
    const puddleTex = puddleTexture();
    const puddleMat = new THREE.MeshStandardMaterial({
      map: puddleTex, color: 0xc8dce6, emissive: 0x1b3844, emissiveIntensity: 0.9,
      roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.9, depthWrite: false
    });
    for (let i = 0; i < 22; i++) {
      const { x, z } = spot(10, R - 4, 4.5);
      const r0 = RND(2.4, 5.2);
      const puddle = mesh(new THREE.CircleGeometry(r0, 18), puddleMat, x, 0.035, z, root);
      puddle.rotation.x = -Math.PI / 2;
      puddle.rotation.z = RND(0, 3);
      puddle.castShadow = false;
    }
    /* 涟漪：6 圈只做「扩散 + 淡出」的循环，用来交代「水面是活的」。
     * 只做 6 圈 —— 每个圈一次绘制，20 圈会在手机端明显掉帧。 */
    for (let i = 0; i < 6; i++) {
      const { x, z } = spot(10, R - 6, 5);
      const ring = mesh(ringGeo(0.86, 1, 22), new THREE.MeshBasicMaterial({
        color: 0xa8cede, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false
      }), x, 0.05, z, root);
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = false;
      const ph = RND(0, 6.28);
      anims.push(a => {
        const t = (a * 0.55 + ph) % 1;
        const s = 1.2 + t * 3.4;
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.42 * (1 - t);
      });
    }
    for (let i = 0; i < 44; i++) {
      const { x, z } = spot(8, R + 2, 3.2);
      const g = new THREE.Group();
      const tm = M(0x4a4238, { rough: 1 });
      const h = RND(2.2, 4.4);
      const trunk = mesh(cylGeo(0.14, 0.3, 1, 5), tm, 0, 0.5, 0, g);
      trunk.scale.y = h;
      trunk.position.y = h / 2;
      trunk.rotation.z = RND(-0.22, 0.22);
      for (let k = 0; k < 3; k++) {
        const br = mesh(cylGeo(0.05, 0.1, 1, 4), tm, RND(-0.4, 0.4), h * RND(0.6, 0.95), RND(-0.4, 0.4), g);
        br.scale.y = RND(1.0, 2.0);
        br.rotation.set(RND(-0.7, 0.7), RND(0, 3), RND(-0.9, 0.9));
      }
      g.userData.collider = { r: 0.45 };
      add(g, x, z);
    }
    for (let i = 0; i < 12; i++) {
      const { x, z } = spot(10, R - 4, 3.4);
      add(makeRock(RND(0.8, 1.6), 0x4e5a5e), x, z);
    }
    scatterFoliage(root, 340, 6, R * 0.94, 0x6d7d44, 0xc2c88e);
  } else if (cfg.props === 'trial') {
    /* ---------------- 无尽试炼场 ----------------
     * 设计原则：**没有遮挡、没有死角**。无限波数的核心是走位与聚怪，
     * 任何能卡住玩家的地形都会变成 bug 制造机。所以：
     *   · 台面是纯圆形，边缘一圈石阶收口；
     *   · 柱子只立在最外圈（半径 24）当视觉边界，不参与战斗空间；
     *   · 中央只放阵纹与火盆（火盆不带碰撞），不挡视线。
     */
    const AR = 26;
    const platMat = new THREE.MeshStandardMaterial({
      map: makeGroundTexture('trial'), color: 0xd6cce6, roughness: 0.9, metalness: 0.08
    });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(AR, AR + 1.4, 0.6, 64), platMat);
    plat.position.y = -0.28;           // 顶面落在 y=0.02，和玩家脚底几乎齐平
    plat.receiveShadow = true;
    root.add(plat);
    /* 边缘石阶：两圈略低一点的环，让「台」有厚度 */
    for (let i = 0; i < 2; i++) {
      const r0 = AR + 0.9 + i * 1.0;
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 + 0.9, 0.34, 64), M(0x3a3348, { rough: 1 }));
      step.position.y = -0.5 - i * 0.3;
      step.receiveShadow = true;
      root.add(step);
    }
    /* 中央阵纹：三层同心环 + 旋转，作为「这里是擂台」的视觉锚点 */
    const runeMat = new THREE.MeshBasicMaterial({
      color: 0xa06aff, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const runeG = new THREE.Group();
    [[5.6, 6.0], [8.4, 8.62], [12.2, 12.34]].forEach(([a, b], i) => {
      const rg = new THREE.Mesh(ringGeo(a, b, 72), runeMat);
      rg.rotation.x = -Math.PI / 2; rg.position.y = 0.03 + i * 0.002;
      runeG.add(rg);
    });
    /* 阵纹射线：八条短线，让圆盘看得出「在转」 */
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const sp = new THREE.Mesh(boxGeo(0.18, 0.01, 3.2), runeMat);
      sp.position.set(Math.cos(ang) * 9.6, 0.035, Math.sin(ang) * 9.6);
      sp.rotation.y = -ang;
      runeG.add(sp);
    }
    root.add(runeG);
    anims.push(a => { runeG.rotation.y = a * 0.09; runeMat.opacity = 0.30 + Math.sin(a * 1.3) * 0.12; });

    /* 八根符文柱（最外圈，带碰撞） */
    const pillarM = M(0x4a4058, { rough: 0.85, metal: 0.15 });
    const glowM = new THREE.MeshBasicMaterial({ color: 0x9a6aff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2 + Math.PI / 8;
      const p = new THREE.Group();
      mesh(cylGeo(1.0, 1.3, 0.5, 10), pillarM, 0, 0.25, 0, p);
      mesh(boxGeo(1.35, 8.4, 1.35), pillarM, 0, 4.6, 0, p);
      mesh(boxGeo(1.7, 0.55, 1.7), pillarM, 0, 9.1, 0, p);
      /* 柱身三道发光符带 */
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(boxGeo(1.42, 0.16, 1.42), glowM);
        band.position.y = 2.4 + k * 2.1;
        p.add(band);
      }
      p.userData.collider = { r: 1.15 };
      add(p, Math.cos(ang) * 24, Math.sin(ang) * 24, true);
      anims.push(a => { p.children.forEach(c => { if (c.material === glowM) c.material.opacity = 0.5 + Math.sin(a * 2 + i) * 0.2; }); });
    }

    /* 四只火盆（不带碰撞，纯氛围 + 点光） */
    for (let i = 0; i < 4; i++) {
      const ang = i / 4 * Math.PI * 2 + Math.PI / 4;
      const bx = Math.cos(ang) * 13.5, bz = Math.sin(ang) * 13.5;
      const g = new THREE.Group();
      mesh(cylGeo(0.32, 0.5, 1.5, 8), M(0x3a3348, { metal: 0.5, rough: 0.6 }), 0, 0.75, 0, g);
      mesh(cylGeo(1.0, 0.55, 0.45, 10), M(0x4a4058, { metal: 0.6, rough: 0.5 }), 0, 1.6, 0, g);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({
        color: 0xff9a4a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      flame.position.y = 2.0; flame.scale.y = 1.5;
      g.add(flame);
      const lt = new THREE.PointLight(0xff8a3a, 1.5, 16, 2);
      lt.position.y = 2.1;
      g.add(lt);
      add(g, bx, bz, false);
      anims.push(a => {
        const f = 0.85 + Math.sin(a * 9 + i * 2) * 0.18 + Math.sin(a * 21 + i) * 0.06;
        lt.intensity = 1.5 * f;
        flame.scale.set(f, 1.5 * f, f);
        flame.material.opacity = 0.7 * f + 0.2;
      });
    }
  }

  // 传送阵
  const portal = makePortal();
  const px = cfg.portal ? cfg.portal.x : 0, pz = cfg.portal ? cfg.portal.z : 30;
  portal.position.set(px, 0, pz);
  root.add(portal);
  colliders.push({ x: px, z: pz, r: 3.4, isPortal: true });
  anims.push(a => { portal.userData.ring.rotation.z += 0.02; portal.userData.light.intensity = 1.3 + Math.sin(a * 2) * 0.3; });

  /* [M1] 路标石：野图入口旁立一块碑，交互直接回本卷营地。
   * 为什么不干脆复用传送阵：传送阵是「去哪都行」的面板入口，路标石是「先回家」的快捷键，
   * 两者各占一角 —— 迷路时不用先开面板、再找营地那一行。安全区不放（营地自己就是家）。 */
  let waystone = null;
  if (!cfg.safe && mapId !== 'trial') {
    const wx = px + 7, wz = pz - 2;
    const wg = new THREE.Group();
    const stoneM = M(0x70707a, { rough: 0.95 });
    const runeM = new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    });
    mesh(cylGeo(1.15, 1.35, 0.4, 8), stoneM, 0, 0.2, 0, wg);
    mesh(boxGeo(0.9, 2.4, 0.55), stoneM, 0, 1.5, 0, wg);
    const rune = new THREE.Mesh(boxGeo(0.5, 0.5, 0.08), runeM);
    rune.position.set(0, 2.0, 0.32);
    wg.add(rune);
    wg.position.set(wx, 0, wz);
    root.add(wg);
    colliders.push({ x: wx, z: wz, r: 1.0 });
    anims.push(a => { runeM.opacity = 0.55 + Math.sin(a * 2.4) * 0.35; });
    waystone = { x: wx, z: wz };
  }

  /* [M1/M3b] 图间出口门：本图 →「顺着走的下一张图」。
   * 顺序先看**本章内**的下一张（幽篁林 → 落霞坡），本章走完才跨到下一章首图；
   * 卷末章 / 终章（5-2 八部坛）/ 下一章没图 → 返回 null，门不出现（不留死门）。
   *
   * 为什么不是「只有章尾才有门」：M1 那版只在章尾挂门，结果一章里第 2 张起的图
   * （落霞坡 / 沉骨滩 / 玄铁矿洞 / 万剑坑 …）只能靠翻山河图进，玩家在上一张图里
   * 怎么走都找不到入口。计划书 §3.6 的原话是「章的边界是门，不是按钮」。
   *
   * 用传送阵同款门、缩到 0.72，只连下一张不开面板 —— 「顺着走」比「翻山河图」顺手。
   * 门上挂一块名牌，不然两扇门长得一样，玩家分不清这扇去哪。 */
  let gate = null, gatePending = null;
  const nx = (typeof nextMapInWorld === 'function') ? nextMapInWorld(mapId) : null;
  if (nx && MAPS[nx]) {
    /* 落点：**首领区最深处**（`gatePosOf` 按 boss 区圆心以北推导）。
     * 没有 boss 区的图（理论上只有调试用图）才退回入口旁，免得门凭空消失。 */
    const gp0 = (typeof gatePosOf === 'function') ? gatePosOf(mapId) : null;
    const gx = gp0 ? gp0.x : px - 7;
    const gz = gp0 ? gp0.z : pz - 2;
    /* 门是「打完首领才开」的：没打过就只记下落点（gatePending），
     * 等首领倒地由 Game.markCleared() 现场立门 —— 见文件上方 makeExitGate 的注释。 */
    if (opts && opts.cleared) gate = makeExitGate(root, gx, gz, nx, colliders, anims, labels);
    else gatePending = { x: gx, z: gz, to: nx, name: MAPS[nx].name };
  }

  return { root, colliders, anims, occluders, portal: { x: px, z: pz }, waystone, gate, gatePending, labels };
}

/* ---------------- NPC 生成 ---------------- */
function buildNPC(npcId) {
  const npc = NPCS[npcId];
  const roleCfg = {
    quest: { color: 0xb8a06a, cloth: 0x6a5a3a, skin: 0xd8b090 },
    shop: { color: 0x8a6a4a, cloth: 0x5a3a26, skin: 0xb08a68 },
    potion: { color: 0x6a9a7a, cloth: 0x3a5a46, skin: 0xe0c0a0 },
    travel: { color: 0x9a9ab0, cloth: 0x4a4a5a, skin: 0xd0b090 },
    decompose: { color: 0xc08060, cloth: 0x6a4026, skin: 0xd8b090 },
    /* 试炼使者：紫袍，和「传送 / 任务」两种黄褐色系明确区分开 */
    trial: { color: 0x8a6ec0, cloth: 0x3a2a58, skin: 0xd8c0a8 },
    /* [M6] 仓管：青灰长袍。仓库要的是「稳」，配色跟着压低饱和度 */
    stash: { color: 0x6a8a98, cloth: 0x33454e, skin: 0xd8bda8 },
    /* [M5] 地脉守：青金袍（地脉的颜色），和试炼使者的紫、仓管的青灰都拉得开 */
    dungeon: { color: 0x4fa898, cloth: 0x1e3833, skin: 0xd8c8b0 }
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
  } else if (npc.role === 'trial') {
    /* 试炼使者拿一柄紫光电刃 —— 远远看见那道紫光就知道「那是试炼入口」 */
    const blade = buildWeapon('taojian', 0x6a5a8a, 0xb08aff, 0.95);
    a.parts.weaponHand.add(blade);
  } else if (npc.role === 'dungeon') {
    /* [M5] 地脉守提一盏青灯 —— 地底的东西，光比兵器更像信号 */
    const lamp = new THREE.Group();
    mesh(boxGeo(0.05, 0.9, 0.05), M(0x2a3a36), 0, 0.45, 0, lamp);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x7fe0c8, transparent: true, opacity: 0.9 })
    );
    glow.position.set(0, 1.02, 0);
    lamp.add(glow);
    mesh(boxGeo(0.2, 0.06, 0.2), M(0x3a4a44, { metal: 0.6 }), 0, 0.9, 0, lamp);
    a.parts.weaponHand.add(lamp);
  } else if (npc.role === 'stash') {
    /* [M6] 仓管抱一只木匣：远远看见就知道「东西可以放他那儿」，
     * 比在头顶挂一个「仓」字更省字，也不破坏村里的氛围。 */
    const chest = new THREE.Group();
    mesh(boxGeo(0.46, 0.3, 0.32), M(0x6a4a2e), 0, 0, 0, chest);
    mesh(boxGeo(0.48, 0.07, 0.34), M(0x8a6a3e), 0, 0.17, 0, chest);
    mesh(boxGeo(0.1, 0.1, 0.03), M(0xd8b25a, { metal: 0.7 }), 0, 0.04, 0.17, chest);
    chest.position.set(0, -0.62, 0.14);
    chest.rotation.x = 0.08;
    a.parts.weaponHand.add(chest);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 20), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  a.group.add(ring);
  const label = makeLabelSprite(npc.name, '#ffe9a8', 40, 4.4, 1.1);
  label.position.y = 3.1;
  a.group.add(label);
  return a;
}
