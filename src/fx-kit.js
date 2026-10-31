/* ============================================================
 * FXKit v2 —— 原语层（V0 地基）
 *
 *   docs/SKILL-VFX-PLAN.md §4 落地：图集 + spr / trail / bolt / shock / decal
 *
 * 为什么单开一个文件而不是往 fx.js 里塞：
 * fx.js 已经有 1100 行、管着「一次性的、放完就死」的效果（环 / 闪 / 爆点 / 投射物）。
 * 这一层管的是「**成片的、有形状的**」效果 —— 贴图粒子、带状拖尾、折线闪电、
 * 冲击波、地面贴花。两套的生命周期与降级策略都不一样，混在一起改一处炸两处。
 *
 * ---------------- 四条纪律（与 fx.js 同源，写在这里防止后人加回来） ----------------
 * 1. **不挂 PointLight**：一次挂灯 = 全部材质重编译（fx.js:527 踩过，卡成幻灯片）。
 * 2. **不逐帧 new 对象**：颜色 / 向量用模块级复用对象；顶点数组在创建时分配好。
 * 3. **材质按「格 + 混合模式 + 尺寸档」缓存**，同类复用；只在不透明动画时才改 opacity。
 * 4. **低画质降级写在原语内部**（读 `FX.q`），调用方不用关心 —— 否则每个调用点
 *    都得抄一遍 `if (FX.q < 1)`，漏一个就是手机端崩。
 *
 * ---------------- 为什么图集是「一格一张贴图」而不是一张 512 大图 ----------------
 * 方案 §4.1 写的是一张 512×512 / 16 格。但 **Points 的 uv 来自 `gl_PointCoord`**，
 * 材质上的 uv 变换（`map.offset` / `repeat`）对点精灵**完全不生效** —— 大图切不开，
 * 只会得到 16 格拼在一颗粒子上。所以这里改成「一次画进 16 张小图、按需生成」：
 * 总量 14×128×128×4 ≈ 0.9MB，比 14 份 512 大图克隆（14MB）小一个数量级，
 * 且**用不到的格一个字节都不占**（懒生成 + 缓存）。
 * ============================================================ */
'use strict';

/* ---------------- 模块级复用对象（逐帧不许 new） ---------------- */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _UP = new THREE.Vector3(0, 1, 0);

/* ---------------- 贴图：16 格，按需生成 ---------------- *
 * 画法沿用 talismanTexture / fieldTexture 的老规矩：**Canvas 现画，零素材文件**。
 * 约定：白 = 不透明，透明 = 不画。加色混合下颜色由材质 color 给，
 * 贴图只管「形状 + alpha」，这样同一张 spark 能出火星也能出圣光。
 */
const FXK_CELLS = {
  soft: 0, spark: 1, ember: 2, smoke: 3,
  shard: 4, ring: 5, slash: 6, rune: 7,
  dust: 8, star: 9, scorch: 10, frost: 11,
  acid: 12, crack: 13
};
const _fxkTex = {};

function fxCellTexture(name) {
  if (_fxkTex[name]) return _fxkTex[name];
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const H = S / 2;
  g.clearRect(0, 0, S, S);

  /* ---------------- 贴花的「暗底」 ----------------
   * 亮地面上白色贴花几乎看不见：地面本身已经很亮，正常混合下白贴花只是
   * 「再亮一点点」，对比只剩几个灰阶（V0 量过：`decal` 的峰值 Δ 只有 48/255，
   * 而 `arc` 是 150）。地牢里没问题，所以这个缺陷只在白天暴露 ——
   * 「只在地牢里好看」不算好看。
   *
   * 做法：贴花贴图里**先铺一层黑**。材质 `color` 是乘法，黑底乘任何颜色还是黑，
   * 于是亮地面上看到的是「一块暗斑 + 元素色的纹路」，暗场景里黑等于没有，
   * 只剩元素色 —— 两种背景都对，而且**不多一次绘制**（不是再叠一层 quad，
   * 那样贴花就从 1 次变 2 次，预算直接翻倍）。
   *
   * 代价：这四格从此只能当贴花用（走 Mesh + NormalBlending）。当粒子贴图会被
   * 加色混合吃掉（黑加不出任何东西 = 粒子凭空消失），`test-vfx-dsl` 里有一条
   * 钉住「没有配方拿这四格当 `tex`」。 */
  const decalBase = (a) => {
    const grd = g.createRadialGradient(H, H, 0, H, H, H * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    grd.addColorStop(0.6, 'rgba(0,0,0,' + (a * 0.62).toFixed(2) + ')');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(H, H, H * 0.95, 0, Math.PI * 2); g.fill();
  };

  switch (name) {
    /* 径向柔光：最常用的一格，火花 / 光晕 / 尘埃都从它派生 */
    case 'soft': {
      const grd = g.createRadialGradient(H, H, 0, H, H, H);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
    /* 四芒星：两条渐变细十字 + 亮核。刀光崩裂 / 暴击用 */
    case 'spark': {
      const arm = (a) => {
        g.save();
        g.translate(H, H); g.rotate(a);
        const grd = g.createLinearGradient(0, -H, 0, H);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(255,255,255,.95)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(-2.5, -H, 5, S);
        g.restore();
      };
      arm(0); arm(Math.PI / 2); arm(Math.PI / 4); arm(-Math.PI / 4);
      const grd = g.createRadialGradient(H, H, 0, H, H, H * 0.34);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
    /* 小火点：小圆 + 边缘噪声，读起来「在烧」而不是「一颗点」 */
    case 'ember': {
      const grd = g.createRadialGradient(H, H, 0, H, H, H * 0.62);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.6, 'rgba(255,255,255,.5)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(H, H, H * 0.62, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, r = H * (0.3 + Math.random() * 0.45);
        g.fillStyle = 'rgba(255,255,255,' + (0.1 + Math.random() * 0.25).toFixed(2) + ')';
        g.beginPath();
        g.arc(H + Math.cos(a) * r, H + Math.sin(a) * r, 2 + Math.random() * 4, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    /* 烟团：多层不规则圆弧、低 alpha。加色混合下会变荧光，调用方要用 Normal */
    case 'smoke': {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = H * (0.12 + Math.random() * 0.42);
        const rad = H * (0.28 + Math.random() * 0.34);
        const grd = g.createRadialGradient(H + Math.cos(a) * r, H + Math.sin(a) * r, 0,
          H + Math.cos(a) * r, H + Math.sin(a) * r, rad);
        grd.addColorStop(0, 'rgba(255,255,255,' + (0.12 + Math.random() * 0.14).toFixed(2) + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(H + Math.cos(a) * r, H + Math.sin(a) * r, rad, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    /* 冰晶：六边形 + 内高光。冰系碎片、护盾裂纹用 */
    case 'shard': {
      g.save();
      g.translate(H, H);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const r = H * 0.78;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      const grd = g.createLinearGradient(-H, -H, H, H);
      grd.addColorStop(0, 'rgba(255,255,255,.92)');
      grd.addColorStop(0.5, 'rgba(255,255,255,.42)');
      grd.addColorStop(1, 'rgba(255,255,255,.75)');
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.lineWidth = 3;
      g.stroke();
      /* 内高光：一条竖棱，让六边形看起来有厚度 */
      g.beginPath();
      g.moveTo(0, -H * 0.6); g.lineTo(0, H * 0.6);
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 2;
      g.stroke();
      g.restore();
      break;
    }
    /* 细环：描边 + 模糊。冲击波内圈 / 命中环 */
    case 'ring': {
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.lineWidth = 5;
      g.shadowColor = 'rgba(255,255,255,.8)';
      g.shadowBlur = 10;
      g.beginPath(); g.arc(H, H, H * 0.72, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 12;
      g.beginPath(); g.arc(H, H, H * 0.72, 0, Math.PI * 2); g.stroke();
      break;
    }
    /* 月牙刀光：两段贝塞尔围成，内亮边。① 号位的「刀气」用它 */
    case 'slash': {
      g.beginPath();
      g.moveTo(H * 0.08, H * 0.08);
      g.quadraticCurveTo(H * 1.9, H * 0.9, H * 0.12, H * 1.86);
      g.quadraticCurveTo(H * 1.28, H * 0.95, H * 0.08, H * 0.08);
      g.closePath();
      const grd = g.createLinearGradient(0, H * 1.9, H * 1.7, H * 0.2);
      grd.addColorStop(0, 'rgba(255,255,255,.15)');
      grd.addColorStop(0.55, 'rgba(255,255,255,.95)');
      grd.addColorStop(1, 'rgba(255,255,255,.35)');
      g.fillStyle = grd;
      g.fill();
      break;
    }
    /* 符文：三笔朱砂风格的白描（这里只画形状，颜色交给材质） */
    case 'rune': {
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.lineCap = 'round';
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(H, H * 0.2); g.lineTo(H, H * 1.8); g.stroke();
      g.lineWidth = 6;
      const bars = [[H * 0.42, H * 0.5, H * 1.6], [H * 0.42, H * 0.85, H * 1.6], [H * 0.48, H * 1.2, H * 1.55]];
      for (const [x1, y, x2] of bars) {
        g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
      }
      g.beginPath();
      g.moveTo(H * 0.34, H * 0.45); g.lineTo(H * 0.34, H * 0.95); g.lineTo(H * 0.5, H * 1.05);
      g.moveTo(H * 1.66, H * 0.45); g.lineTo(H * 1.66, H * 0.95); g.lineTo(H * 1.5, H * 1.05);
      g.stroke();
      break;
    }
    /* 尘土：噪声团，比 smoke 更「干」、边缘更碎 */
    case 'dust': {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = H * Math.pow(Math.random(), 0.6) * 0.8;
        g.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
        g.beginPath();
        g.arc(H + Math.cos(a) * r, H + Math.sin(a) * r, 3 + Math.random() * 9, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    /* 大四芒：暴击 / 拾取闪光，比 spark 更长更亮 */
    case 'star': {
      const arm = (a, len, w) => {
        g.save();
        g.translate(H, H); g.rotate(a);
        const grd = g.createLinearGradient(0, -len, 0, len);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(255,255,255,1)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(-w, -len, w * 2, len * 2);
        g.restore();
      };
      arm(0, H * 0.96, 3); arm(Math.PI / 2, H * 0.96, 3);
      arm(Math.PI / 4, H * 0.55, 2); arm(-Math.PI / 4, H * 0.55, 2);
      const grd = g.createRadialGradient(H, H, 0, H, H, H * 0.42);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
    /* ---- 以下四格是贴花（decal）：形状即 alpha，颜色由材质给 ---- */
    case 'scorch': {
      decalBase(0.55);
      const grd = g.createRadialGradient(H, H, 0, H, H, H);
      grd.addColorStop(0, 'rgba(255,255,255,.85)');
      grd.addColorStop(0.55, 'rgba(255,255,255,.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(H, H, H, 0, Math.PI * 2); g.fill();
      /* 边缘的焦斑：让圆不是一个规整的圆 */
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = H * (0.55 + Math.random() * 0.4);
        g.fillStyle = 'rgba(255,255,255,' + (0.1 + Math.random() * 0.2).toFixed(2) + ')';
        g.beginPath();
        g.arc(H + Math.cos(a) * r, H + Math.sin(a) * r, 4 + Math.random() * 10, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'frost': {
      decalBase(0.42);
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
        const len = H * (0.55 + Math.random() * 0.42);
        g.lineWidth = 2 + Math.random() * 3;
        g.beginPath();
        g.moveTo(H, H);
        g.lineTo(H + Math.cos(a) * len, H + Math.sin(a) * len);
        g.stroke();
        /* 每根霜针上再挂两根短分叉 */
        for (const t of [0.55, 0.8]) {
          const bx = H + Math.cos(a) * len * t, by = H + Math.sin(a) * len * t;
          for (const s of [-0.5, 0.5]) {
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(bx + Math.cos(a + s) * len * 0.22, by + Math.sin(a + s) * len * 0.22);
            g.stroke();
          }
        }
      }
      const grd = g.createRadialGradient(H, H, 0, H, H, H * 0.5);
      grd.addColorStop(0, 'rgba(255,255,255,.5)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
    case 'acid': {
      decalBase(0.46);
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = H * Math.pow(Math.random(), 0.7) * 0.75;
        const rad = 6 + Math.random() * 18;
        const grd = g.createRadialGradient(H + Math.cos(a) * r, H + Math.sin(a) * r, 0,
          H + Math.cos(a) * r, H + Math.sin(a) * r, rad);
        grd.addColorStop(0, 'rgba(255,255,255,' + (0.25 + Math.random() * 0.3).toFixed(2) + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(H + Math.cos(a) * r, H + Math.sin(a) * r, rad, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'crack': {
      decalBase(0.40);
      g.strokeStyle = 'rgba(255,255,255,.92)';
      g.lineCap = 'round';
      /* 从中心往外裂的几条折线，越往外越细 */
      for (let i = 0; i < 7; i++) {
        let a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
        let x = H, y = H;
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          a += (Math.random() - 0.5) * 0.7;
          const step = H * (0.14 + Math.random() * 0.12);
          x += Math.cos(a) * step; y += Math.sin(a) * step;
          g.lineTo(x, y);
          g.lineWidth = Math.max(1.2, g.lineWidth - 1);
        }
        g.stroke();
      }
      break;
    }
    default: {
      const grd = g.createRadialGradient(H, H, 0, H, H, H);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  /* 点精灵 / 贴花都在贴近相机时被放大，线性过滤 + 不 mipmap 才不会糊成方块 */
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _fxkTex[name] = tex;
  return tex;
}

/* ---------------- 材质缓存 ---------------- *
 * key = 格 | 混合 | 尺寸档 | 颜色。**同类复用**是「画面变好看但没变慢」的关键：
 * 每簇粒子各建一份材质，切换材质的开销比多画几个点贵得多。
 * 上限 96 份，超了就淘汰最老的（正常玩法摸不到这个上限）。
 */
const _fxkMat = new Map();
const FXK_MAT_CAP = 96;

function fxMat(cell, color, size, additive) {
  const key = cell + '|' + color + '|' + size.toFixed(2) + '|' + (additive ? 1 : 0);
  let m = _fxkMat.get(key);
  if (m) return m;
  m = new THREE.PointsMaterial({
    map: fxCellTexture(cell),
    color: color,
    size: size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  if (_fxkMat.size >= FXK_MAT_CAP) {
    const oldest = _fxkMat.keys().next().value;
    const om = _fxkMat.get(oldest);
    if (om) om.dispose();
    _fxkMat.delete(oldest);
  }
  _fxkMat.set(key, m);
  return m;
}

/* 贴花材质：走 Mesh（不是 Points），单独一张缓存表 */
const _fxkDecalMat = new Map();
function fxDecalMat(cell, color) {
  const key = cell + '|' + color;
  let m = _fxkDecalMat.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    map: fxCellTexture(cell),
    color: color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    /* 贴花和地面共面：不加 polygonOffset 会被地面 / 广场按深度吃掉一半，
     * 表现是「贴花时有时无」，而且只在某些角度看得到 */
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  });
  _fxkDecalMat.set(key, m);
  return m;
}

/* 几何体缓存：贴花 / 竖直气浪都是固定尺寸的 quad */
const _fxkGeo = {};
function fxkPlane(w, h) {
  const k = w.toFixed(2) + 'x' + h.toFixed(2);
  if (_fxkGeo[k]) return _fxkGeo[k];
  return (_fxkGeo[k] = new THREE.PlaneGeometry(w, h));
}

/* ---------------- FXKit 本体 ---------------- */
const FXK = {
  parts: [],     // 贴图粒子簇（Points）
  trails: [],    // 带状拖尾
  bolts: [],     // 折线闪电
  shocks: [],    // 冲击波
  decals: [],    // 贴花（固定池）
  decalAt: 0,    // 池游标
  decalPool: 0,  // 池当前大小（按需扩到 16 / 低画质 6）
  mats: _fxkMat,
  cellTex: fxCellTexture,
  enabled: true,

  /* 低画质档：直接读 FX.q（由 Game.applyPerfLevel 按帧率下调），
   * 不自己维护一份 —— 两份倍率迟早会打架。 */
  get q() { return (typeof FX !== 'undefined' && FX && FX.q > 0) ? FX.q : 1; },
  get scene() { return (typeof FX !== 'undefined' && FX) ? FX.scene : null; },

  /* ============================================================
   * spr —— 贴图光斑粒子
   *
   * opt: { n, tex, color, size, life, speed, grav, spread, dir, up, additive, drag, y }
   *   tex    图集格名（soft / spark / ember / smoke / shard / ring / slash / rune / dust / star）
   *   dir    主方向（Vector3），给了就沿它喷（锥形），不给就各向同性
   *   up     垂直速度偏置（火向上、尘向下、冰几乎不动 —— §13 验收要求方向可辨）
   *   grav   重力（正 = 下坠；火给负值才会上飘）
   * ============================================================ */
  spr(pos, opt) {
    if (!this.enabled || !pos) return null;
    const scene = this.scene;
    if (!scene) return null;
    const o = opt || {};
    const q = this.q;
    /* 点数按画质档削减，但至少 3 颗 —— 少到看不见等于没放 */
    let n = Math.max(1, Math.round((o.n || 12) * (q < 1 ? Math.max(0.3, q) : 1)));
    if (o.n && o.n > 0 && q < 1) n = Math.max(3, n);
    const size = o.size || 0.5;
    const life = o.life || 0.6;
    const speed = o.speed === undefined ? 3 : o.speed;
    const spread = o.spread === undefined ? 0.25 : o.spread;
    const y0 = o.y === undefined ? pos.y : o.y;

    const arr = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const dir = o.dir || null;
    /* `ring`：把粒子等分到一个圆上（螺旋气流 / 环绕剑影 / 火墙的一排火舌）。
     *
     * 为什么要有这个开关：这些形状**必须是一簇**。按「每颗粒子各调一次 spr」
     * 去摆位置，一簇就是 n 次 draw call —— 实测火墙一发放出 88 个 Points，
     * 单技能 92 次绘制，比整帧基线还高。摆位是数据，不是绘制单元。 */
    const ringR = o.ring || 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (ringR > 0) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + (o.phase || 0);
        arr[k] = pos.x + Math.cos(a) * ringR + RND(-spread, spread);
        arr[k + 1] = y0 + RND(-spread * 0.4, spread * 0.4);
        arr[k + 2] = pos.z + Math.sin(a) * ringR + RND(-spread, spread);
        /* 切向初速：绕圈走，不是四散 —— 这是「转」读得出来的关键 */
        const sp = speed * RND(0.7, 1.2);
        vel[k] = -Math.sin(a) * sp;
        vel[k + 1] = (o.up === undefined ? 0 : o.up) * RND(0.6, 1.2);
        vel[k + 2] = Math.cos(a) * sp;
        continue;
      }
      arr[k] = pos.x + RND(-spread, spread);
      arr[k + 1] = y0 + RND(-spread * 0.4, spread * 0.4);
      arr[k + 2] = pos.z + RND(-spread, spread);
      if (dir) {
        /* 锥形：主方向上叠一层横向扰动，喷口看起来是「一束」而不是「一个球」 */
        const sp = speed * RND(0.5, 1.2);
        vel[k] = dir.x * sp + RND(-0.35, 0.35) * speed;
        vel[k + 1] = dir.y * sp + (o.up === undefined ? 0 : o.up) + RND(-0.2, 0.2) * speed;
        vel[k + 2] = dir.z * sp + RND(-0.35, 0.35) * speed;
      } else {
        const a = Math.random() * Math.PI * 2;
        const el = RND(-0.25, 0.85);
        const sp = speed * RND(0.4, 1);
        vel[k] = Math.cos(a) * sp;
        vel[k + 1] = el * speed + (o.up === undefined ? 0 : o.up);
        vel[k + 2] = Math.sin(a) * sp;
      }
    }
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.dynamic = true;
    geo.setAttribute('position', attr);
    const mat = fxMat(o.tex || 'soft', o.color === undefined ? 0xffffff : o.color, size,
      o.additive === undefined ? true : !!o.additive);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    this.parts.push({
      obj: pts, geo, mat, attr, arr, vel, n,
      life, max: life,
      gravity: o.grav === undefined ? 0 : o.grav,
      drag: o.drag === undefined ? 1.4 : o.drag,
      grow: o.grow || 0,
      baseOp: o.opacity === undefined ? 1 : o.opacity
    });
    return pts;
  },

  /* ============================================================
   * trail —— 带状拖尾 / 刀光余影
   *
   * points: Vector3 数组（>= 2），按顺序连成一条带。
   * opt: { color, width, life, additive, taper }
   *
   * 实现：每个点出两个顶点，向「切线 × 视线」方向偏移半个宽度 ——
   * 这样带子永远正面朝向相机，不会在某个角度看过去变成一条线。
   * 逐帧只改 opacity（位置不变），所以顶点数组只在创建时写一次。
   * ============================================================ */
  trail(points, opt) {
    if (!this.enabled || !points || points.length < 2) return null;
    const scene = this.scene;
    if (!scene) return null;
    const o = opt || {};
    const q = this.q;
    /* 低画质：退化成 3 颗 spr（方案 §4 的降级口径），而不是画一条糊带子 */
    if (q < 0.75) {
      const mid = points[Math.floor(points.length / 2)];
      this.spr(mid, {
        n: 3, tex: 'soft', color: o.color === undefined ? 0xffffff : o.color,
        size: (o.width || 0.6) * 1.2, life: o.life || 0.3, speed: 0.4, additive: o.additive !== false
      });
      return null;
    }

    const n = points.length;
    const w = o.width || 0.6;
    const taper = o.taper === undefined ? true : !!o.taper;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    const cam = (typeof FX !== 'undefined' && FX) ? FX.cam : null;

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(n - 1, i + 1)];
      /* 切线：前后点差；首尾退化成单侧差，避免零向量 */
      _v1.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
      if (_v1.lengthSq() < 1e-8) _v1.set(1, 0, 0);
      _v1.normalize();
      /* 视线方向：没有相机时用世界 Z 轴顶着（node 侧测试就是这种情况） */
      if (cam && cam.position) _v2.set(cam.position.x - p.x, cam.position.y - p.y, cam.position.z - p.z);
      else _v2.set(0, 0, 1);
      if (_v2.lengthSq() < 1e-8) _v2.set(0, 0, 1);
      _v2.normalize();
      /* 带面法线 = 切线 × 视线；再乘半个宽度得到两个顶点 */
      _v3.crossVectors(_v1, _v2);
      if (_v3.lengthSq() < 1e-8) _v3.set(0, 1, 0);
      _v3.normalize();
      const half = w * 0.5 * (taper ? (1 - Math.abs(i / (n - 1) - 0.5) * 1.2) : 1);
      const k = i * 6;
      pos[k] = p.x + _v3.x * half;
      pos[k + 1] = p.y + _v3.y * half;
      pos[k + 2] = p.z + _v3.z * half;
      pos[k + 3] = p.x - _v3.x * half;
      pos[k + 4] = p.y - _v3.y * half;
      pos[k + 5] = p.z - _v3.z * half;
      const t = i / (n - 1);
      uv[i * 4] = 0; uv[i * 4 + 1] = t;
      uv[i * 4 + 2] = 1; uv[i * 4 + 3] = t;
      if (i < n - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      color: o.color === undefined ? 0xffffff : o.color,
      transparent: true,
      opacity: o.opacity === undefined ? 0.85 : o.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.trails.push({ mesh, geo, mat, life: o.life || 0.3, max: o.life || 0.3, op0: mat.opacity });
    return mesh;
  },

  /* ============================================================
   * bolt —— 折线闪电（带分叉）
   *
   * opt: { color, core, life, depth, segs, jitter, branch, width }
   *
   * 现在的雷电是一根 1px 线（WebGL 里 linewidth 无效，写多少都是 1）。
   * 这里用「中点位移递归」生成折线，再叠两条：外晕（粗、暗）+ 内芯（细、白）。
   * 分叉按 30% 概率从内部节点甩出去，长度是主干的三分之一。
   *
   * 注意：**不做几何体缓存** —— 每一次闪电的形状本来就该不一样。
   * 但它活得极短（0.08~0.2 秒），且总量受 MAX_BOLTS 限制。
   * ============================================================ */
  bolt(a, b, opt) {
    if (!this.enabled || !a || !b) return null;
    const scene = this.scene;
    if (!scene) return null;
    const o = opt || {};
    const q = this.q;
    const depth = o.depth === undefined ? 4 : Math.max(1, Math.round(o.depth * (q < 1 ? 0.5 : 1)));
    const segs = o.segs === undefined ? 1 : o.segs;
    const jitter = o.jitter === undefined ? 0.22 : o.jitter;
    const life = o.life === undefined ? 0.16 : o.life;

    /* 主干：从 a 到 b，用中点位移把直线揉成折线 */
    let pts = [a.clone(), b.clone()];
    let amp = a.distanceTo(b) * jitter;
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        out.push(p0);
        const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        /* 垂直方向随机偏移：偏移量逐层减半，才有「粗到细」的自然感 */
        mid.x += RND(-amp, amp);
        mid.y += RND(-amp, amp) * 0.7;
        mid.z += RND(-amp, amp);
        out.push(mid);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
      amp *= 0.55;
    }

    /* 分叉：低画质直接不出（方案 §11 的降级表：bolt 分叉是可选项） */
    const branchP = (q < 1 ? 0.12 : 0.3) * (o.branch === undefined ? 1 : o.branch);
    const groups = [pts];
    if (branchP > 0 && pts.length > 4) {
      for (let i = 2; i < pts.length - 2; i++) {
        if (Math.random() > branchP) continue;
        const from = pts[i];
        const len = a.distanceTo(b) * RND(0.18, 0.36);
        /* 分叉方向：沿主干方向甩出去，再随机偏一点，不能往回折 */
        const dir = _v1.subVectors(pts[i + 1], pts[i - 1]).normalize().clone();
        dir.x += RND(-0.8, 0.8); dir.y += RND(-0.5, 0.5); dir.z += RND(-0.8, 0.8);
        dir.normalize();
        const to = from.clone().addScaledVector(dir, len);
        let bp = [from.clone(), to];
        let ba = len * 0.24;
        for (let d = 0; d < 3; d++) {
          const out = [];
          for (let k = 0; k < bp.length - 1; k++) {
            out.push(bp[k]);
            const m = new THREE.Vector3().addVectors(bp[k], bp[k + 1]).multiplyScalar(0.5);
            m.x += RND(-ba, ba); m.y += RND(-ba, ba) * 0.7; m.z += RND(-ba, ba);
            out.push(m);
          }
          out.push(bp[bp.length - 1]);
          bp = out;
          ba *= 0.55;
        }
        groups.push(bp);
      }
    }

    /* 外晕 + 内芯：**所有折线（主干 + 全部分叉）塞进同一份几何**，只画两次。
     * 早期版本每条折线各建一份几何 + 两个材质，一道带 3 个分叉的闪电就是
     * 8 次绘制 —— 而雷电是最容易「一次劈出一屏」的原语（实测单技能 13 次）。 */
    const outerC = o.color === undefined ? 0x88ddff : o.color;
    const coreC = o.core === undefined ? 0xffffff : o.core;
    const segPts = [];
    for (const g2 of groups) {
      for (let i = 0; i < g2.length - 1; i++) { segPts.push(g2[i], g2[i + 1]); }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(segPts);
    const matO = new THREE.LineBasicMaterial({
      color: outerC, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const matC = new THREE.LineBasicMaterial({
      color: coreC, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const lo = new THREE.LineSegments(geo, matO);
    const lc = new THREE.LineSegments(geo, matC);
    lo.frustumCulled = false; lc.frustumCulled = false;
    scene.add(lo); scene.add(lc);
    /* 总量闸门：闪电是最容易「一次劈出一屏」的原语 */
    if (this.bolts.length >= 12) {
      const old = this.bolts.shift();
      this._dropBolt(old);
    }
    this.bolts.push({ geo, matO, matC, lo, lc, life, max: life, a: a.clone(), b: b.clone() });
    /* 端点闪光：不画这个，闪电看起来「没打中」 */
    this.spr(b, {
      n: Math.round(6 * (o.flash === undefined ? 1 : o.flash)), tex: 'spark',
      color: coreC, size: (o.width || 0.9) * 1.6, life: 0.16, speed: 2.4, additive: true
    });
    return this.bolts[this.bolts.length - 1];
  },

  _dropBolt(item) {
    if (!item) return;
    const scene = this.scene;
    if (scene) { scene.remove(item.lo); scene.remove(item.lc); }
    item.geo.dispose();
    item.matO.dispose();
    item.matC.dispose();
  },

  /* ============================================================
   * shock —— 冲击波
   *
   * 三件套（方案 §4）：
   *   · 地面环（快，0.18 秒扩到 r）
   *   · 竖直气浪薄片（慢，0.25 秒，从地面往上抽）
   *   · 尘环（spr，正重力 = 往下沉）
   *
   * 为什么不是一个环了事：只有一个环的时候，「砸地」和「炸开」看起来一模一样。
   * 竖直薄片给了它**高度**，尘环给了它**重量**。
   * ============================================================ */
  shock(pos, r, opt) {
    if (!this.enabled || !pos) return null;
    const scene = this.scene;
    if (!scene) return null;
    const o = opt || {};
    const color = o.color === undefined ? 0xffffff : o.color;
    const q = this.q;
    const rad = Math.max(0.4, r || 1.2);

    /* 1) 地面环：用 RingGeometry 缩放，和 FX.ring 同一套几何缓存策略 */
    const ringGeo = fxkRing(0.86, 1, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.09, pos.z);
    ring.scale.setScalar(rad * 0.2);
    scene.add(ring);

    /* 2) 竖直气浪：一张立起来的薄片，往上抽、同时变淡。
     * 低画质档跳过（它是最「贵」的一件：一张半透明大面片 = 一屏的填充率） */
    let sheet = null, sheetMat = null;
    if (q >= 0.75) {
      sheetMat = new THREE.MeshBasicMaterial({
        color: color, map: fxCellTexture('soft'), transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      });
      sheet = new THREE.Mesh(fxkPlane(2, 1), sheetMat);
      sheet.position.set(pos.x, pos.y + 0.5, pos.z);
      sheet.scale.set(rad * 1.1, rad * 0.9, 1);
      scene.add(sheet);
    }

    /* 3) 尘环：往外甩 + 往下沉（正重力），所以它落地后还在滚 */
    this.spr(new THREE.Vector3(pos.x, pos.y + 0.15, pos.z), {
      n: Math.round(14 * (o.dust === undefined ? 1 : o.dust)),
      tex: 'dust', color: o.dustColor === undefined ? color : o.dustColor,
      size: 0.7, life: 0.55, speed: rad * 3.2, grav: 6, drag: 1.1,
      additive: false, opacity: 0.55
    });

    if (this.shocks.length >= 10) this._dropShock(this.shocks.shift());
    const item = { ring, ringMat, sheet, sheetMat, rad, life: 0.3, max: 0.3 };
    this.shocks.push(item);
    return item;
  },

  _dropShock(it) {
    if (!it) return;
    const scene = this.scene;
    if (scene) {
      if (it.ring) scene.remove(it.ring);
      if (it.sheet) scene.remove(it.sheet);
    }
    if (it.ringMat) it.ringMat.dispose();
    if (it.sheetMat) it.sheetMat.dispose();
  },

  /* ============================================================
   * decal —— 地面贴花（焦痕 / 霜 / 酸斑 / 裂痕）
   *
   * **固定池，循环复用**：16 个 quad（低画质 6 个）建一次，之后只改
   * 位置 / 旋转 / 贴图 / 透明度，永不新建几何。这是「世界被打过」的观感来源，
   * 也是最容易写漏的地方 —— 每放一次技能 new 一个 quad，打十分钟就是几千个。
   * ============================================================ */
  decal(pos, opt) {
    if (!this.enabled || !pos) return null;
    const scene = this.scene;
    if (!scene) return null;
    const o = opt || {};
    const q = this.q;
    const cap = q < 1 ? 6 : 16;
    /* 池按需长大，但不超过 cap */
    if (this.decalPool < cap) {
      const geo = fxkPlane(1, 1);
      for (let i = this.decalPool; i < cap; i++) {
        const mesh = new THREE.Mesh(geo, fxDecalMat('scorch', 0x1a0f08));
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        scene.add(mesh);
        this.decals.push({ mesh, life: 0, max: 1, on: false });
      }
      this.decalPool = cap;
    }
    if (!this.decals.length) return null;

    /* 游标循环：永远挑「最久没用的那个」，不挑「已经过期的」——
     * 后者会让池没满时反复命中同一个，视觉上叠在一处。
     *
     * 低画质时**只用前 6 个槽**（而不是把池拆小）：池是建一次就一直存在的，
     * 拆了重建反而更贵；但只转 6 个槽，同屏的贴花数就真的降下来了，
     * 填充率才是这一档真正省的东西。 */
    const usable = Math.min(this.decals.length, cap);
    const slot = this.decals[this.decalAt % usable];
    this.decalAt++;

    const cell = o.tex || 'scorch';
    const color = o.color === undefined ? 0x1a0f08 : o.color;
    slot.mesh.material = fxDecalMat(cell, color);
    slot.mesh.position.set(pos.x, pos.y + (o.y === undefined ? 0.045 : o.y), pos.z);
    slot.mesh.scale.setScalar((o.size === undefined ? 2.2 : o.size) * RND(0.85, 1.15));
    /* 随机朝向：同一张贴花铺两次不重叠才像「世界」而不是「印章」 */
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.visible = true;
    slot.life = o.life === undefined ? 4 : o.life;
    slot.max = slot.life;
    slot.op0 = o.opacity === undefined ? 0.85 : o.opacity;
    slot.on = true;
    slot.mesh.material.opacity = slot.op0;
    return slot;
  },

  /* ============================================================
   * 逐帧推进：由 FX.update 调用一次（不要自己开 timer）
   * ============================================================ */
  update(dt) {
    const scene = this.scene;

    /* 粒子簇 */
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      /* 透明度按 baseOp 缩放 —— smoke 这类要 Normal 混合 + 半透明的原语，
       * 写死 1 会变成一团实心灰 */
      p.mat.opacity = p.baseOp * k;
      const arr = p.arr, vel = p.vel, n = p.n;
      const damp = Math.max(0, 1 - p.drag * dt);
      const g = p.gravity * dt;
      for (let j = 0; j < n * 3; j += 3) {
        vel[j + 1] -= g;
        vel[j] *= damp; vel[j + 1] *= damp; vel[j + 2] *= damp;
        arr[j] += vel[j] * dt;
        arr[j + 1] += vel[j + 1] * dt;
        arr[j + 2] += vel[j + 2] * dt;
      }
      p.attr.needsUpdate = true;
      if (p.life <= 0) {
        if (scene) scene.remove(p.obj);
        p.geo.dispose();
        /* 材质是**共享缓存**，这里绝不能 dispose —— 下一次同类粒子还要用它 */
        this.parts.splice(i, 1);
      }
    }

    /* 拖尾：只淡出 */
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.op0 * (t.life / t.max));
      if (t.life <= 0) {
        if (scene) scene.remove(t.mesh);
        t.geo.dispose();
        t.mat.dispose();
        this.trails.splice(i, 1);
      }
    }

    /* 闪电：快速衰减 + 轻微闪烁（不做位移，位移会让人以为它在「爬」） */
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      const flick = 0.75 + Math.sin((b.max - b.life) * 90) * 0.25;
      b.matO.opacity = 0.45 * k * flick;
      b.matC.opacity = 0.95 * k;
      if (b.life <= 0) {
        this._dropBolt(b);
        this.bolts.splice(i, 1);
      }
    }

    /* 冲击波：环快、片慢（两段节奏，才有「炸开 + 抽上来」的层次） */
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.life -= dt;
      const k = 1 - Math.max(0, s.life / s.max);
      s.ring.scale.setScalar(s.rad * (0.2 + k * 1.15));
      s.ringMat.opacity = Math.max(0, 0.9 * (1 - k) * (1 - k));
      if (s.sheet) {
        const ks = Math.min(1, k * 1.6);
        s.sheet.position.y = 0.5 + ks * s.rad * 0.25;
        s.sheetMat.opacity = Math.max(0, 0.5 * (1 - ks));
        s.sheet.scale.set(s.rad * (1.1 + ks * 0.35), s.rad * (0.9 + ks * 0.5), 1);
      }
      if (s.life <= 0) {
        this._dropShock(s);
        this.shocks.splice(i, 1);
      }
    }

    /* 贴花：后半段才开始淡出（前 60% 保持不透明，否则刚落地就在消失） */
    for (const d of this.decals) {
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.on = false;
        d.mesh.visible = false;
        continue;
      }
      const k = d.life / d.max;
      d.mesh.material.opacity = d.op0 * (k > 0.6 ? 1 : k / 0.6);
    }
  },

  /* 换图 / 重开：把活着的都拆掉。材质缓存留着（下一张图还要用同一批） */
  clear() {
    const scene = this.scene;
    for (const p of this.parts) {
      if (scene) scene.remove(p.obj);
      p.geo.dispose();
    }
    this.parts.length = 0;
    for (const t of this.trails) {
      if (scene) scene.remove(t.mesh);
      t.geo.dispose();
      t.mat.dispose();
    }
    this.trails.length = 0;
    for (const b of this.bolts) this._dropBolt(b);
    this.bolts.length = 0;
    for (const s of this.shocks) this._dropShock(s);
    this.shocks.length = 0;
    for (const d of this.decals) {
      d.on = false;
      d.life = 0;
      d.mesh.visible = false;
    }
    this.decalAt = 0;
  },

  /* 探针用：一眼看清这一层现在压了多少东西（也用来钉「不增长」） */
  stats() {
    return {
      parts: this.parts.length,
      trails: this.trails.length,
      bolts: this.bolts.length,
      shocks: this.shocks.length,
      decals: this.decals.length,
      decalOn: this.decals.filter(d => d.on).length,
      mats: _fxkMat.size,
      decalMats: _fxkDecalMat.size,
      tex: Object.keys(_fxkTex).length,
      q: this.q
    };
  }
};

/* 冲击波用的细环几何：与 fx.js 的 _fxGeo 同一条思路（形状固定 → 缓存复用） */
function fxkRing(inner, outer, seg) {
  const k = 'ring' + inner + '_' + outer + '_' + seg;
  if (_fxkGeo[k]) return _fxkGeo[k];
  return (_fxkGeo[k] = new THREE.RingGeometry(inner, outer, seg));
}
