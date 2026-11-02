/* ============================================================
 * 装备模组装配器 —— 把 data-doll.js 的零件表变成 mesh
 *
 * 四件事：装配 / 合并 / 缓存 / 回收。
 * **不认识「哪件装备好看」，只管拼**；造型全在 data-doll.js 里。
 *
 * 为什么必须合并：33 族 × 平均 6 件 ≈ 200 个小 mesh。玩家只有一具纸娃娃，
 * 但 200 个 mesh 在手机上仍然是 200 次「材质设置 + 绘制」。合并后按挂点算，
 * 一件装备 ≤ 3 个 draw（主材质 / 品质光 / 武器）。
 *
 * 三个环境约束（踩过才知道）：
 *   1. `lib/three.min.js` 里**没有 BufferGeometryUtils**（没有 mergeBufferGeometries）
 *      → mergeGeos 自己写，不许引第三方。
 *   2. `emissive` 是材质级的，顶点色做不了 → 品质光必须单独成 mesh。
 *   3. 合并后的 mesh 材质**必须注册进 actor.mats**，否则挨打只有身体闪、装备不闪，
 *      看起来像模型分层（charforge.js:511 遍历的就是 mats）。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 八阶材质兜底表 ----------------
   * 正式口径在 actors.js 的 METAL_PALETTE（前 8 阶）。这里留一份**同样的值**，
   * 让本模块在不引入 actors.js 的环境（工作台 / node 测试）里也能跑。
   * dev/test-doll.js 会断言两份表逐项相等 —— 改一处漏另一处会立刻红。 */
  const DOLL_METAL_FALLBACK = {
    cloth:     [0x6b5a4a, 0x4a3c30, 0.05],
    leather:   [0x7a5a3a, 0x533c26, 0.10],
    iron:      [0x8a8f96, 0x5a6068, 0.65],
    darkiron:  [0x4a5058, 0x30343a, 0.80],
    steel:     [0x7d8a99, 0x4c5764, 0.70],
    jade:      [0x86a394, 0x4c6b5c, 0.60],
    gold:      [0xb69a5a, 0x6f5c33, 0.72],
    dragon:    [0x6a7a5a, 0x3a4530, 0.75]
  };
  const DOLL_TIER_METAL = ['cloth', 'leather', 'iron', 'darkiron', 'steel', 'jade', 'gold', 'dragon'];

  /* 职业基色（与 charforge.CFG 一致）。**只用来混主色**，不改轮廓。 */
  const DOLL_CLS_COLOR = {
    warrior: { cloth: 0x9a3226, trim: 0xc9a227 },
    mage:    { cloth: 0x35507e, trim: 0xd7d2b8 },
    taoist:  { cloth: 0x2e5f4c, trim: 0x9a8248 }
  };

  const RARITY_GLOW = { unique: 0xff3b3b, legendary: 0xff7a3c, set: 0x5ce08a, rare: 0xffc857, magic: 0x67a9ff };

  /* ---------------- 颜色 ---------------- */
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();

  function hex2c(h) { return _c1.setHex(h).clone(); }

  function tierPalette(tier) {
    const key = DOLL_TIER_METAL[Math.max(0, Math.min(DOLL_TIER_METAL.length - 1, Math.round(tier) || 0))]
      || DOLL_TIER_METAL[0];
    const ext = (typeof METAL_PALETTE !== 'undefined' && METAL_PALETTE[key]) || null;
    return ext || DOLL_METAL_FALLBACK[key] || DOLL_METAL_FALLBACK.iron;
  }

  /* 通道 → 颜色。**主色只由「阶 + 职业」决定，品质只加件和光** ——
   * 现状 itemVisualColor 把品质色按 42% 混进主色，结果 8 阶材质全被吃掉
   * （玄铁和太初在白装下同色）。这里不再混品质色。 */
  function paletteOf(item, cls) {
    const tier = (typeof itemBaseTier === 'function') ? itemBaseTier(item)
      : (isFinite(item.baseTier) ? item.baseTier : 0);
    const pal = tierPalette(tier);
    const cc = DOLL_CLS_COLOR[cls] || DOLL_CLS_COLOR.warrior;

    const base = _c1.setHex(pal[0]).clone();
    /* 职业色占比 0.45：0.30 时天罡钢灰会把战士的朱红压成"粉灰"，
     * 隔着 3 米读不出职业。阶材质仍是主导（55%），只是不再吃掉职业。 */
    const main = base.clone().lerp(hex2c(cc.cloth), 0.45);
    const sub = _c1.setHex(pal[1]).clone().multiplyScalar(0.82);
    const trim = base.clone().lerp(hex2c(0xb99340), 0.50).lerp(hex2c(cc.trim), 0.24);
    const glow = RARITY_GLOW[item.rarity] || 0;
    const accent = glow ? hex2c(glow) : base.clone().lerp(hex2c(0xffffff), 0.25);
    return { main, sub, trim, accent, metal: pal[2], glow };
  }

  /* ---------------- 原语 → geometry ---------------- */
  function geoOf(spec) {
    const s = spec.s || [];
    switch (spec.g) {
      case 'box':   return new THREE.BoxGeometry(s[0] || 0.1, s[1] || 0.1, s[2] || 0.1);
      case 'cyl':   return new THREE.CylinderGeometry(s[0], s[1], s[2], Math.max(3, s[3] || 8), 1);
      case 'cone':  return new THREE.ConeGeometry(s[0] || 0.1, s[1] || 0.1, Math.max(3, s[2] || 8));
      case 'sph':   return new THREE.SphereGeometry(s[0] || 0.1, Math.max(4, s[1] || 8),
                      Math.max(3, Math.round((s[1] || 8) * 0.72)));
      case 'dome':  return new THREE.SphereGeometry(s[0] || 0.1, Math.max(4, s[1] || 10),
                      Math.max(3, s[2] || 8), 0, Math.PI * 2, 0, s[3] || Math.PI * 0.6);
      case 'torus': return new THREE.TorusGeometry(s[0] || 0.1, s[1] || 0.01,
                      Math.max(3, s[2] || 4), Math.max(4, s[3] || 10));
      case 'disc':  return new THREE.CylinderGeometry(s[0] || 0.1, s[0] || 0.1, s[1] || 0.01,
                      Math.max(3, s[2] || 12), 1);
      default:      return new THREE.BoxGeometry(0.05, 0.05, 0.05);
    }
  }

  /* ---------------- 合并（手写，三家里没有 BufferGeometryUtils） ----------------
   * 逐件 `toNonIndexed()` → 应用矩阵 → concat position/normal → 生成 color。
   * 不合并 uv（本作没有贴图），不合并 index（统一非索引，省得对偏移）。 */
  function mergeGeos(items) {
    const bufs = [];
    let total = 0;
    for (const it of items) {
      let g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
      if (it.matrix) g.applyMatrix4(it.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      bufs.push({ g, color: it.color });
      total += g.attributes.position.count;
    }
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let off = 0;
    for (const b of bufs) {
      const pa = b.g.attributes.position.array;
      const na = b.g.attributes.normal.array;
      const n = b.g.attributes.position.count;
      pos.set(pa, off * 3);
      nor.set(na, off * 3);
      const c = b.color;
      for (let i = 0; i < n; i++) {
        col[(off + i) * 3] = c.r;
        col[(off + i) * 3 + 1] = c.g;
        col[(off + i) * 3 + 2] = c.b;
      }
      off += n;
      b.g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    if (pos.length === 0) out.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.01);
    return out;
  }

  /* ---------------- 材质（按 metalness 分档共用） ---------------- */
  const matPool = new Map();
  function mainMat(metal, rough) {
    const k = (Math.round(metal * 20) / 20) + '|' + (Math.round(rough * 20) / 20);
    let m = matPool.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true,
        roughness: Math.round(rough * 20) / 20,
        metalness: Math.round(metal * 20) / 20
      });
      matPool.set(k, m);
    }
    return m;
  }

  const glowPool = new Map();
  function glowMat(hex, strong) {
    const k = hex + '|' + (strong ? 1 : 0);
    let m = glowPool.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex, emissive: hex, emissiveIntensity: strong ? 1.15 : 0.55,
        roughness: 0.4, metalness: 0.2, flatShading: true
      });
      glowPool.set(k, m);
    }
    return m;
  }

  /* ---------------- 装配 ---------------- */
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function matrixOf(pt, side) {
    const sgn = pt.mx ? side : 1;
    const p = pt.p || [0, 0, 0];
    const r = pt.r || [0, 0, 0];
    const sc = pt.sc || [1, 1, 1];
    _v.set(p[0] * sgn, p[1], p[2]);
    _e.set(r[0], r[1] * sgn, r[2] * sgn);
    _q.setFromEuler(_e);
    _s.set(sc[0], sc[1], sc[2]);
    return _m4.compose(_v, _q, _s).clone();
  }

  function sideOfAnchor(an) {
    if (/L$/.test(an)) return -1;
    if (/R$/.test(an)) return 1;
    return 1;
  }

  /* 一件装备 → { 挂点名: Mesh }。成对槽位（肩/手/靴/戒）返回左右两组。 */
  function buildAnchors(item, cls, opt) {
    opt = opt || {};
    const key = dollKeyOf(item);
    if (!key || !dollHasParts(key.slot)) return null;
    const def = dollFamDef(key.slot, key.fam);
    const list = dollPartsOf(key.slot, key.fam, key.lod);
    if (!def || !list || !list.length) return null;

    const pal = paletteOf(item, cls);
    const metal = Math.max(0.04, pal.metal);
    const rough = metal > 0.5 ? 0.42 : 0.86;

    /* 按挂点分组；accent 通道单独拎出来（emissive 是材质级） */
    const solid = {}, glow = {};
    for (const pt of list) {
      const an = pt.a || def.anchor || 'torsoG';
      const bucket = (pt.m === 'accent') ? glow : solid;
      (bucket[an] || (bucket[an] = [])).push(pt);
    }

    const out = {};
    const stats = { verts: 0, parts: 0 };

    /* 成对挂点必须**生成左右两份**。数据里护肩只写 `shoulderL` 一份（写两份会
     * 立刻出现「右肩照抄左肩坐标」的重复代码），镜像由这里负责 —— 但第一版漏了，
     * 结果是**右肩整个没有几何**，截图里看着像被砍了一只肩。 */
    function targetsOf(an) {
      if (/L$/.test(an)) return [[an, -1], [an.replace(/L$/, 'R'), 1]];
      if (/R$/.test(an)) return [[an, 1], [an.replace(/R$/, 'L'), -1]];
      return [[an, 1]];
    }

    for (const an in solid) {
      for (const [target, side] of targetsOf(an)) {
        const items = [];
        for (const pt of solid[an]) {
          const c = (pt.m === 'sub' ? pal.sub : pt.m === 'trim' ? pal.trim : pal.main).clone();
          if (pt.c) c.multiplyScalar(1 + pt.c);
          items.push({ geo: geoOf(pt), matrix: matrixOf(pt, side), color: c });
        }
        const geo = mergeGeos(items);
        stats.verts += geo.attributes.position.count;
        stats.parts += solid[an].length;
        const mesh = new THREE.Mesh(geo, mainMat(metal, rough));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.doll = key;
        out[target] = mesh;
      }
    }

    for (const an in glow) {
      for (const [target, side] of targetsOf(an)) {
        const items = [];
        for (const pt of glow[an]) {
          items.push({ geo: geoOf(pt), matrix: matrixOf(pt, side), color: pal.accent });
        }
        /* accent 逐件单独成 mesh 会让 draw 爆掉；同挂点合并成 1 个 */
        const geo = mergeGeos(items);
        stats.verts += geo.attributes.position.count;
        stats.parts += glow[an].length;
        const mesh = new THREE.Mesh(geo, glowMat(pal.glow || 0xd8c060, !!pal.glow));
        mesh.userData.doll = key;
        out[target] = mesh;
      }
    }

    out.__stats = stats;
    out.__key = key;
    out.__pal = pal;
    return out;
  }

  /* ---------------- 武器 / 副手 ----------------
   * 走「模具骨架」三层（见 data-doll.js 的 DOLL_WEAPON_RIG）：
   *   形制 = 非等比缩放 **只改 w/t，y 恒为 1**。整体 scale 会同时拉长武器 ——
   *          1.40 米的大刀举起来顶出画面、劈砍扎穿地面（charforge.js:107 的注释），
   *          所以长度是契约，装饰和形制都不许动它。
   *   装饰 = DOLL_WEAPON_TRIM 里的形制件，挂刃根/柄尾，和防具零件同一套字段。 */
  const trimPool = new Map();
  function solidMat(hex, metal, rough) {
    const k = hex + '|' + metal + '|' + rough;
    let m = trimPool.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex, metalness: metal, roughness: rough, flatShading: true
      });
      trimPool.set(k, m);
    }
    return m;
  }

  function buildWeapon(item, cls, opt) {
    if (typeof WeaponForge === 'undefined') return null;
    const key = dollKeyOf(item);
    const pal = paletteOf(item, cls);
    const fam = (key && key.fam) || 'A';
    const shape = item.shape || (item.slot === 'offhand' ? 'shield' : 'sword');
    const rig = DOLL_WEAPON_RIG[shape] || DOLL_WEAPON_RIG.sword;
    const fdef = rig.fam[fam] || rig.fam.A;

    const g = WeaponForge.build(shape, pal.trim.getHex(), pal.glow || null, 1);
    /* **y 恒为 1** —— 这一行就是「扩大小」的正确做法 */
    g.scale.set(fdef.w, 1, fdef.t);

    /* 装饰层：形制件。只加件，不改主体轮廓。 */
    for (const tid of (fdef.trim || [])) {
      const tp = DOLL_WEAPON_TRIM[tid];
      if (!tp) continue;
      const col = tp.m === 'sub' ? pal.sub : tp.m === 'accent' ? pal.accent : pal.trim;
      const mesh = new THREE.Mesh(geoOf(tp), solidMat(col.getHex(),
        tp.m === 'trim' ? 0.85 : 0.15, tp.m === 'trim' ? 0.32 : 0.9));
      const p = tp.p || [0, 0, 0];
      mesh.position.set(p[0], p[1], p[2]);
      const r = tp.r || [0, 0, 0];
      if (r[0] || r[1] || r[2]) mesh.rotation.set(r[0], r[1], r[2]);
      mesh.castShadow = true;
      /* 装饰件挂在**未缩放**的父组里，否则重刀的装饰会被一起拉宽 */
      g.add(mesh);
      /* 反缩放，让装饰件保持自身比例：w/t 只作用于主体轮廓 */
      mesh.scale.set(1 / fdef.w, 1, 1 / fdef.t);
    }

    g.userData.doll = key;
    g.userData.fam = fam;
    g.userData.rig = { shape, len: rig.len, w: fdef.w, t: fdef.t, tag: fdef.tag };
    /* **只返回自己那个挂点**：两个都返回会让同一个 Group 被 add 两次
     * （第二次 add 会把它从第一个父节点摘走，副手槽看起来「消失」）。 */
    return item.slot === 'offhand' ? { offHand: g } : { weaponHand: g };
  }

  /* ---------------- 缓存 ----------------
   * key 含 cls 与 rarity：职业基色进顶点色、品质决定 accent。
   *
   * **引用计数**是这里的核心：50 轮换装实测 geometries 从 77 涨到 869 ——
   * 因为淘汰时只删了 Map 引用，而 three 的 `renderer.info.memory.geometries`
   * 只认 `geometry.dispose()`，GC 清不掉它。所以：
   *   · build / 命中 → refs++
   *   · 调用方卸载 → release(res)  // refs--
   *   · 淘汰 → 打 dead 标记；refs 归零那一刻才真 dispose
   * 这样「还在用的」永远不会被拆掉（拆了就是模型突然变空），
   * 「没人用的」一定会被拆掉（否则显存只涨不落）。 */
  const CACHE = new Map();
  const CACHE_MAX = 128;
  let hits = 0, misses = 0;
  let disposed = 0;

  function cacheKey(item, cls, extra) {
    const k = dollKeyOf(item);
    if (!k) return null;
    return [k.slot, k.fam, k.lod, cls, item.rarity || 'common', item.uniqueId || item.setId || '-',
      extra || ''].join('|');
  }

  function geosOf(res) {
    const out = [];
    for (const an in res) {
      if (an.charAt(0) === '_') continue;
      const o = res[an];
      if (!o) continue;
      if (o.isMesh && o.geometry) out.push(o.geometry);
      else if (o.traverse) o.traverse(c => { if (c.isMesh && c.geometry) out.push(c.geometry); });
    }
    return out;
  }

  function disposeEntry(e) {
    for (const g of e.geos) {
      try { g.dispose(); disposed++; } catch (x) {}
    }
    e.geos.length = 0;
  }

  function release(res) {
    const e = res && res.__entry;
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0 && e.dead) disposeEntry(e);
  }

  function build(item, cls, opt) {
    opt = opt || {};
    const isW = item.slot === 'weapon' || item.slot === 'offhand';
    const ck = cacheKey(item, cls);
    let entry = ck ? CACHE.get(ck) : null;
    if (entry) {
      hits++;
      entry.refs++;
      return entry.res;
    }
    misses++;
    const res = isW ? buildWeapon(item, cls, opt) : buildAnchors(item, cls, opt);
    if (res) {
      const e = { res, refs: 1, dead: false, geos: geosOf(res) };
      res.__entry = e;
      if (ck) {
        if (CACHE.size >= CACHE_MAX) {
          const first = CACHE.keys().next().value;
          const old = CACHE.get(first);
          CACHE.delete(first);
          if (old) {
            old.dead = true;
            if (old.refs === 0) disposeEntry(old);
          }
        }
        CACHE.set(ck, e);
      }
    }
    return res;
  }

  /* ---------------- 挂载与回收 ---------------- */
  /* clear：**先 remove 再 dispose**，且只 dispose 自己造的。
   * 现状 clearGroup 只 remove 不 dispose（actors.js:933），而 WeaponForge 每次新建
   * geo/mat → 每换一次装漏一把武器 + 一顶头盔的显存。模组化后是 10 倍泄漏。 */
  function clear(g) {
    if (!g) return;
    while (g.children.length) {
      const ch = g.children[0];
      g.remove(ch);
      disposeTree(ch);
    }
  }

  function disposeTree(obj) {
    obj.traverse(o => {
      /* 共享材质（主材质池 / 辉光池）永不 dispose —— 否则下一件装备直接黑 */
      if (o.geometry && !o.geometry.__shared) {
        /* geometry 是缓存里的，clone 出来的 mesh 共享同一份 → 不能在这 dispose。
         * 只清「一次性的」：带有 __tmp 标记的。 */
        if (o.geometry.__tmp) o.geometry.dispose();
      }
    });
  }

  /* 把 build 的结果挂到 actor.parts 上；返回是否成功 */
  function mount(actor, item, cls) {
    if (!actor || !actor.parts || !item) return false;
    const res = build(item, cls);
    if (!res) return false;
    let n = 0;
    for (const an in res) {
      if (an.charAt(0) === '_') continue;
      const g = actor.parts[an];
      if (!g) continue;
      g.add(res[an]);
      n++;
    }
    return n > 0;
  }

  function stats() {
    let meshes = 0, verts = 0;
    for (const [, e] of CACHE) {
      const v = e.res;
      for (const an in v) {
        if (an.charAt(0) === '_' || !v[an] || !v[an].isMesh) continue;
        meshes++;
        verts += v[an].geometry.attributes.position.count;
      }
    }
    return { cache: CACHE.size, meshes, verts, hits, misses, disposed,
      mats: matPool.size + glowPool.size };
  }

  /* 清空缓存：先全部标记 dead，refs 为 0 的立刻拆，剩下的等 release */
  function reset() {
    for (const [, e] of CACHE) {
      e.dead = true;
      if (e.refs === 0) disposeEntry(e);
    }
    CACHE.clear();
    hits = 0; misses = 0;
  }

  global.Doll = {
    build, mount, clear, stats, reset, release,
    mergeGeos, geoOf, paletteOf, matrixOf,
    keyOf: dollKeyOf,
    CACHE,
    /* 供测试用：八阶兜底表对比 */
    __metal: DOLL_METAL_FALLBACK, __tierMetal: DOLL_TIER_METAL
  };

})(typeof window !== 'undefined' ? window : globalThis);
