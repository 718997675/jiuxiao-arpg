/* ============================================================
 * 骨骼角色层 —— 用 GLB 蒙皮模型替掉盒子纸娃娃
 *
 * 设计原则：对外接口和 buildHumanoid() 完全一致，
 * 这样 game.js / items.js / 武器挂载 这些调用方一行都不用改。
 *
 *   actor.group        <- 模型根节点（游戏负责摆位置、转向）
 *   actor.parts.torso  <- Spine 骨骼
 *   actor.parts.headG  <- Head 骨骼
 *   actor.parts.armL/R <- 大臂骨骼
 *   actor.parts.legL/R <- 大腿骨骼
 *   actor.parts.weaponHand <- 右手骨骼（武器挂这里）
 *   actor.parts.offHand    <- 左手骨骼
 *   actor.parts.helmG      <- Head 骨骼（头盔挂这里）
 *   actor.parts.capeG      <- Spine 骨骼（披风挂这里）
 *   actor.mats         <- 所有材质（受击白闪用）
 *
 * 模型没加载好 / 加载失败时，自动退回盒子，不会白屏。
 * ============================================================ */

const SKEL = {
  registry: {},     // cls -> { url, scale, yaw, clips }
  cache: {},        // url -> gltfPromise
  ready: {},        // cls -> 已就绪的模板
  failed: {}        // cls -> 错误信息
};

/* 骨骼名归一化：Mixamo / MetaHuman / 各种魔改都能认 */
function skelNorm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/^[a-z]+:/, '')
    .replace(/[\s_\-.|]/g, '');
}

const SKEL_BONES = {
  headG: ['head'],
  torso: ['spine2', 'spine1', 'spine', 'chest', 'upperchest'],
  armL: ['leftarm', 'upperarml', 'larm'],
  armR: ['rightarm', 'upperarmr', 'rarm'],
  legL: ['leftupleg', 'thighl', 'lthigh'],
  legR: ['rightupleg', 'thighr', 'rthigh'],
  weaponHand: ['righthand', 'handr', 'rhand'],
  offHand: ['lefthand', 'handl', 'lhand'],
  shoulderL: ['leftshoulder', 'claviclel', 'lshoulder'],
  shoulderR: ['rightshoulder', 'clavicler', 'rshoulder'],
  calfL: ['leftleg', 'calfl', 'shinl'],
  calfR: ['rightleg', 'calfr', 'shinr']
};

/* 注册一个职业的模型。url 可以是绝对路径，也可以是 assets/char/xxx.glb 这种相对路径 */
function skelRegister(cls, url, opt) {
  SKEL.registry[cls] = Object.assign({ url, scale: 1, yaw: 0 }, opt || {});
}

/* 预加载全部注册的模型。失败只记录，不抛错，交给调用方退回盒子 */
function skelPreload() {
  const jobs = Object.entries(SKEL.registry).map(([cls, reg]) => {
    if (SKEL.ready[cls] || SKEL.failed[cls]) return Promise.resolve();
    if (!SKEL.cache[reg.url]) {
      SKEL.cache[reg.url] = new Promise((resolve, reject) => {
        new THREE.GLTFLoader().load(
          reg.url,
          g => resolve(g),
          undefined,
          e => reject(e && e.message ? e.message : '加载失败')
        );
      });
    }
    return SKEL.cache[reg.url]
      .then(gltf => { SKEL.ready[cls] = { gltf, reg }; })
      .catch(err => { SKEL.failed[cls] = String(err); });
  });
  return Promise.all(jobs).then(() => {
    for (const cls of Object.keys(SKEL.registry)) {
      if (SKEL.failed[cls]) console.warn(`[skel] ${cls} 模型加载失败，退回纸娃娃：${SKEL.failed[cls]}`);
    }
  });
}

function skelAvailable(cls) { return !!SKEL.ready[cls]; }

/* 从骨骼树里按别名找骨骼 */
function skelFindBones(root) {
  const byNorm = new Map();
  root.traverse(o => { if (o.isBone && o.name) byNorm.set(skelNorm(o.name), o); });
  const out = {};
  for (const [part, alts] of Object.entries(SKEL_BONES)) {
    for (const a of alts) {
      if (byNorm.has(a)) { out[part] = byNorm.get(a); break; }
    }
  }
  return out;
}

/* 动画片段名归一化后匹配：idle / walk / run / attack… */
function skelPickClip(clips, want) {
  const cand = clips.filter(c => skelNorm(c.name).includes(want));
  return cand.length ? cand[0] : null;
}

/* ---------------- 构建 ---------------- */

function buildSkelActor(cfg, cls) {
  const ready = SKEL.ready[cls];
  if (!ready) return null;

  const src = ready.gltf;
  const reg = ready.reg;

  /* 克隆：蒙皮网格必须连同骨架一起重建。
   * 这里必须用官方 SkeletonUtils.clone —— 手写「按索引映射骨骼再 bind」会漏骨骼，
   * 表现是顶点被拉到远处，人身上射出几条黑线（踩过这个坑，别再自己实现） */
  const clone = new THREE.Group();
  const inst = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone)
    ? THREE.SkeletonUtils.clone(src.scene)
    : src.scene.clone(true);

  clone.add(inst);
  /* yaw 必须加在内层 inst 上，不能加在 clone 上：
   * 游戏每帧都会写 a.group.rotation.y（角色转向），加在外层会被直接覆盖掉 */
  inst.rotation.y = reg.yaw;

  /* 自动归一化尺寸：不同来源的模型单位差得离谱（Mixamo 常是厘米，玩家高 180），
   * 直接量包围盒换算成游戏里的人物高度，脚底对齐 y=0，就不用手填 scale 了 */
  const bb = new THREE.Box3().setFromObject(inst);
  const rawH = Math.max(bb.max.y - bb.min.y, 1e-4);
  const targetH = reg.height || 1.9;
  const s = (targetH / rawH) * (reg.scale || 1);
  clone.scale.setScalar(s);
  inst.position.y = -bb.min.y;
  if (!reg._logged) { reg._logged = true; console.log(`[skel] ${reg.url} 原始高 ${rawH.toFixed(2)} → 缩放 ${s.toFixed(4)}`); }

  const mats = [];
  inst.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m && !mats.includes(m)) mats.push(m);
    }
  });

  /* 每个实例要有自己的材质，否则受击白闪会串到所有角色身上 */
  const matClone = new Map();
  inst.traverse(o => {
    if (!o.isMesh) return;
    const one = m => {
      if (!m) return m;
      if (!matClone.has(m)) matClone.set(m, m.clone());
      return matClone.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  mats.length = 0;
  inst.traverse(o => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m && !mats.includes(m)) mats.push(m);
  });

  const bones = skelFindBones(inst);
  const parts = {
    torso: bones.torso, headG: bones.headG,
    armL: bones.armL, armR: bones.armR,
    legL: bones.legL, legR: bones.legR,
    weaponHand: bones.weaponHand, offHand: bones.offHand,
    helmG: bones.headG, capeG: bones.torso,
    shoulderL: bones.shoulderL, shoulderR: bones.shoulderR
  };

  const mixer = new THREE.AnimationMixer(inst);
  const clips = ready.gltf.animations || [];
  const actions = {};
  for (const c of clips) {
    const act = mixer.clipAction(c);
    actions[c.name] = act;
  }

  const a = {
    group: clone,
    parts,
    mats,
    skel: true,
    mixer,
    actions,
    clipList: clips.map(c => c.name),
    cur: null,
    busy: null
  };

  /* 动作表：能用模型自带的就用，没有就留空（调用方会跳过） */
  a.map = {
    idle: skelPickClip(clips, 'idle') || clips[0] || null,
    walk: skelPickClip(clips, 'walk') || null,
    run: skelPickClip(clips, 'run') || null,
    attack: skelPickClip(clips, 'attack') || skelPickClip(clips, 'slash') || skelPickClip(clips, 'punch') || null,
    die: skelPickClip(clips, 'death') || skelPickClip(clips, 'die') || null
  };

  skelPlay(a, a.map.idle, 0);
  return a;
}

/* ---------------- 挂点适配 ----------------
 * 骨骼自带一套离谱的世界缩放（Mixamo 骨架常见 0.01，也就是手部的 1 单位 = 1 厘米），
 * 武器直接 add 到骨骼上会被压成 8 毫米，肉眼看不见。所以先套一层 holder 抵消缩放。
 *
 * 朝向有两种模式：
 *   alignArm:true  —— 让武器的 +Y（刀刃方向）对齐「肘 → 手」的方向。
 *                    刀随手臂自然摆动，不用为每个模型手调角度，换模型也不会歪。
 *   默认           —— 抵消骨骼旋转，只保留角色朝向。武器按世界方向摆，适合盾牌这类不跟手臂转的物件。
 */
function skelHolder(a, bone, obj, opt) {
  bone.updateWorldMatrix(true, false);
  a.group.updateWorldMatrix(true, false);

  const bq = new THREE.Quaternion();
  bone.getWorldQuaternion(bq);
  const bs = new THREE.Vector3();
  bone.getWorldScale(bs);

  const holder = new THREE.Group();
  holder.position.set(0, 0, 0);
  holder.scale.setScalar(1 / (bs.x || 1));

  let worldQ = null;
  if (opt && opt.alignArm && bone.parent) {
    const handPos = new THREE.Vector3();
    bone.getWorldPosition(handPos);
    const elbowPos = new THREE.Vector3();
    bone.parent.getWorldPosition(elbowPos);
    const dir = handPos.clone().sub(elbowPos);
    if (dir.lengthSq() > 1e-8) {
      worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
  }
  if (!worldQ) {
    worldQ = new THREE.Quaternion();
    a.group.getWorldQuaternion(worldQ);
  }
  holder.quaternion.copy(bq).invert().multiply(worldQ);

  holder.add(obj);
  bone.add(holder);
  return holder;
}

/* ---------------- 播放控制 ---------------- */

function skelPlay(a, clip, fade) {
  if (!clip) return;
  const next = a.actions[clip.name];
  if (!next) return;
  if (a.cur === next && next.isRunning()) return;

  next.reset();
  next.setEffectiveWeight(1);
  next.enabled = true;
  next.play();

  if (a.cur && a.cur !== next) {
    if (fade > 0) next.crossFadeFrom(a.cur, fade, false);
    else a.cur.stop();
  }
  a.cur = next;
}

/* ---------------- 每帧更新 ----------------
 * 替代 updateActorAnim() 的骨骼版本：状态机 + 受击白闪
 * 攻击期间用 a.atkAnim 的倒计时映射到 clip 进度，和原来 ATK_KEYS 的节奏对齐 */
function updateSkelActor(a, dt) {
  if (!a.mixer) return;
  const t = a.time = (a.time || 0) + dt;

  if (a.anim === 'die') {
    if (a.map.die) skelPlay(a, a.map.die, 0.12);
    a.group.rotation.z = LERP(a.group.rotation.z, 1.5, dt * 6);
    a.group.position.y = LERP(a.group.position.y, -0.4, dt * 3);
    a.mixer.update(dt);
    return;
  }

  /* 攻击：atkAnim 从 1 倒数，用它的剩余量驱动播放速度，保证时长可控。
   * 计时器必须无条件递减——否则模型没有 attack 动作时会永久卡在 1，
   * 之后所有攻击都进不了这个分支（盒子版就是这么写的，这里对齐） */
  const attacking = a.atkAnim > 0;
  if (attacking) a.atkAnim = Math.max(0, a.atkAnim - dt * (a.atkSpeed || 2.5));

  if (attacking && a.map.attack) {
    const act = a.actions[a.map.attack.name];
    if (act) {
      if (a.cur !== act) skelPlay(a, a.map.attack, 0.06);
      act.setEffectiveTimeScale(1);
      act.time = (1 - a.atkAnim) * act.getClip().duration;
      act.paused = true;
    }
    a.mixer.update(0);
  } else {
    if (a.cur && a.cur.paused) a.cur.paused = false;
    const want = a.moving ? (a.fly ? a.map.idle : (a.map.run || a.map.walk || a.map.idle)) : a.map.idle;
    skelPlay(a, want, 0.18);
    /* 走跑速度跟着移动状态走，看着更跟手 */
    if (a.cur && a.moving && a.cur !== a.actions[(a.map.attack || {}).name]) {
      const base = (a.map.run && a.cur === a.actions[a.map.run.name]) ? 1.0 : 0.9;
      a.cur.setEffectiveTimeScale(base);
    }
    a.mixer.update(dt);

    /* 模型没有 attack 动作时的兜底：给躯干一个扭转，至少让挥击有反馈。
     * 必须在 mixer.update 之后加，否则会被动画覆盖掉 */
    if (attacking && a.parts.torso) {
      a.parts.torso.rotation.y += Math.sin((1 - a.atkAnim) * Math.PI) * 0.38;
    }
  }

  /* 受击白闪：骨骼模型的材质是克隆出来的，直接改 emissive */
  if (a.flash > 0) {
    a.flash = Math.max(0, a.flash - dt * 7);
    a.flashWas = true;
    const c = a.flash;
    for (const m of a.mats) {
      if (!m.__oem) m.__oem = m.emissive ? m.emissive.getHex() : 0;
      if (m.emissive) m.emissive.setRGB(c, c * 0.97, c * 0.96);
    }
  } else if (a.flashWas) {
    a.flashWas = false;
    for (const m of a.mats) if (m.__oem !== undefined && m.emissive) m.emissive.setHex(m.__oem);
  }
  if (a.capeG) a.capeG.rotation.x = 0.12 + Math.sin(t * 3) * 0.06 + (a.moving ? 0.28 : 0);
}

/* ============================================================
 * 骨骼版的纸娃娃
 *
 * 盒子版的装备是「用几何体现码肩甲/头盔/披风再塞进挂点」，
 * 这套做法贴到真模型上会很怪，所以骨骼版只保留：
 *   - 材质染色 / 品质发光（有贴图的模型只做发光，不改贴图）
 *   - 武器、副手挂到骨骼
 *   - 套装光环
 * 护甲外观等有正式模型后改为「换 mesh 部件」或直接换贴图。
 * ============================================================ */
function applySkelDoll(p) {
  const a = p.actor;
  const eq = p.equipment;
  const cls = CLASSES[p.cls];
  const P = a.parts;

  /* 基础染色：无贴图的材质才染，有贴图的只叠发光，避免把贴图糊掉 */
  const chest = eq.chest;
  const vis = chest ? itemVisualColor(chest) : null;
  for (const m of a.mats) {
    if (!m) continue;
    if (!m.map) {
      m.color.setHex(vis ? vis.base : cls.color);
      m.metalness = vis ? vis.metal : 0.1;
      m.roughness = 0.75;
    }
    if (vis && vis.glow) {
      m.emissive.setHex(vis.glow);
      m.emissiveIntensity = 0.22;
    } else {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 1;
    }
  }

  /* 摘掉上一次挂的物件。
   * 这里绝对不能用项目的 clearGroup(骨骼)——手骨的子节点里还有手指骨，
   * 一起删掉会把手从胳膊上撕下来，人身上就多出几条拉到几米外的黑线。
   * 只能精确移除我们自己加的那层 holder。 */
  const dropMount = key => {
    if (!a.mounts) a.mounts = {};
    const m = a.mounts[key];
    if (m && m.parent) m.parent.remove(m);
    a.mounts[key] = null;
  };

  /* 武器 */
  if (P.weaponHand) {
    dropMount('weapon');
    const wp = eq.weapon;
    if (wp) {
      const c = itemVisualColor(wp);
      const w = buildWeapon(wp.shape || 'sword', c.base, wp.rarity === 'common' ? null : c.glow, 0.85);
      /* 不做手工摆角：alignArm 会把刀刃对齐前臂方向，握把留在掌心 */
      w.rotation.set(0, 0, 0);
      w.position.set(0, 0.04, 0);
      a.mounts.weapon = skelHolder(a, P.weaponHand, w, { alignArm: true });
      P.weaponMat = c;
    }
  }

  /* 副手 */
  if (P.offHand) {
    dropMount('offhand');
    const oh = eq.offhand;
    if (oh) {
      const c = itemVisualColor(oh);
      const w = buildWeapon(oh.shape || 'shield', c.base, oh.rarity === 'common' ? null : c.glow, 0.85);
      w.rotation.set(0, 0, 0.2);
      a.mounts.offhand = skelHolder(a, P.offHand, w);
    }
  }

  /* 套装光环 */
  if (p.stats && p.stats.setBonuses.length >= 2) {
    if (!P.aura) {
      const ring = new THREE.Mesh(
        ringGeo(0.7, 0.82, 24),
        new THREE.MeshBasicMaterial({ color: 0x5ce08a, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      P.aura = ring;
      a.group.add(ring);
    }
  } else if (P.aura) {
    a.group.remove(P.aura);
    P.aura = null;
  }
}

/* ============================================================
 * 模型注册表 —— 换模型只需要改这里
 *
 * 要求：GLB，带骨骼蒙皮，至少含 idle / walk（或 run）/ attack 三个 clip，
 * clip 名字里带这些关键词就能自动识别。朝向按 glTF 惯例 +Z。
 * scale 调整体大小，yaw 调朝向（有些导出模型是 -Z 朝前，就填 Math.PI）。
 * ============================================================ */
skelRegister('warrior', 'assets/char/warrior.glb', { scale: 1.0, yaw: Math.PI });
skelRegister('mage', 'assets/char/mage.glb', { scale: 1.0 });
skelRegister('taoist', 'assets/char/taoist.glb', { scale: 1.0 });

/* 页面加载就开始下模型，等玩家点到「开始游戏」时基本已经好了 */
if (typeof window !== 'undefined' && typeof THREE !== 'undefined' && THREE.GLTFLoader) {
  skelPreload();
}
