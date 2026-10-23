#!/usr/bin/env node
/* ============================================================
 * bake-motion.mjs —— 把 PINOC 导出的 GLB 骨骼动画，烘焙成
 * 《九霄·山海录》ATK_KEYS 可直接用的关键帧表。
 *
 * 为什么需要这一层：
 *   PINOC 输出的是 441 骨 MetaHuman / Mixamo 骨架的骨骼动画（没有网格），
 *   而游戏里的角色是 buildHumanoid() 拼出来的盒子纸娃娃，只有 6 个可动关节：
 *     legL / legR / torso / headG / armL / armR（外加 weaponHand、offHand）
 *   两者骨架结构完全不同，没法直接加载，只能把「关节朝向」采样出来，
 *   换算成游戏用的欧拉角曲线。
 *
 * 用法：
 *   node bake-motion.mjs 动作.glb --name=warrior_cleave
 *   node bake-motion.mjs 动作.glb --dump-bones        # 只看骨架结构
 *   node bake-motion.mjs 动作.glb --name=x --out=x.js # 写文件
 *
 * 输出可以直接粘进 src/actors.js 的 ATK_KEYS 里。
 * ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

/* ---------------- 数学：只保留必需的那几个 ---------------- */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mat4Mul(a, b) { /* a*b，列主序 */
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function composeTRS(t, q, s) { /* 列主序 T*R*S */
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float64Array(16);
  m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0]; m[3] = 0;
  m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1]; m[7] = 0;
  m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2]; m[11] = 0;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}

const qIdentity = () => [0, 0, 0, 1];

function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function qInv(q) {
  const [x, y, z, w] = q;
  const n = x * x + y * y + z * z + w * w || 1;
  return [-x / n, -y / n, -z / n, w / n];
}

function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function qNlerp(a, b, t) { /* 四元数插值，够用了 */
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) return qNormalize([0, 1, 2, 3].map(i => a[i] + (bb[i] - a[i]) * t));
  const th = Math.acos(clamp(dot, -1, 1));
  const s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return qNormalize([0, 1, 2, 3].map(i => a[i] * w1 + bb[i] * w2));
}

/* 四元数 -> three.js Euler('XYZ')，和 actor.rotation.set(x,y,z) 完全一致 */
function quatToEulerXYZ(q) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy;
  const m22 = 1 - (xx + zz), m23 = yz - wx;
  const m32 = yz + wx, m33 = 1 - (xx + yy);
  const ey = Math.asin(clamp(m13, -1, 1));
  let ex, ez;
  if (Math.abs(m13) < 0.9999999) {
    ex = Math.atan2(-m23, m33);
    ez = Math.atan2(-m12, m11);
  } else {
    ex = Math.atan2(m32, m22);
    ez = 0;
  }
  return [ex, ey, ez];
}

/* ---------------- GLB 解析 ---------------- */

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('不是 GLB 文件（magic 不对）');
  let offset = 12, json = null, bin = null;
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004E4942) bin = data;
    offset += 8 + len;
  }
  if (!json) throw new Error('GLB 里没有 JSON chunk');
  return { gltf: json, bin };
}

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  if (acc.sparse) throw new Error('暂不支持 sparse accessor');
  const n = acc.count * NCOMP[acc.type];
  const out = new Float64Array(n);
  if (acc.bufferView === undefined) return out; // 全零
  const bv = gltf.bufferViews[acc.bufferView];
  const compSize = COMP[acc.componentType];
  const ncomp = NCOMP[acc.type];
  const stride = bv.byteStride || compSize * ncomp;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < ncomp; c++) {
      const p = base + i * stride + c * compSize;
      let v;
      switch (acc.componentType) {
        case 5126: v = bin.readFloatLE(p); break;
        case 5125: v = bin.readUInt32LE(p); break;
        case 5123: v = bin.readUInt16LE(p); break;
        case 5121: v = bin.readUInt8(p); break;
        case 5122: v = bin.readInt16LE(p); break;
        case 5120: v = bin.readInt8(p); break;
        default: throw new Error('未知 componentType ' + acc.componentType);
      }
      out[i * ncomp + c] = v;
    }
  }
  return out;
}

/* ---------------- 骨架命名归一化 ----------------
 * PINOC 可能吐 Mixamo 命名（mixamorig:LeftArm）也可能吐 MetaHuman 命名
 * （upperarm_l），这里统一抹平成小写无前缀，再用别名表匹配。 */

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/^[a-z]+:/, '')
    .replace(/[\s_\-.|]/g, '');
}

const ALIASES = {
  hips: ['hips', 'pelvis', 'root', 'hip'],
  spine: ['spine', 'spine01', 'spine1', 'spine02', 'chest'],
  neck: ['neck', 'neck01', 'neck1'],
  head: ['head'],
  upperarmL: ['leftarm', 'upperarml', 'arml', 'larm', 'leftupperarm', 'luparm'],
  lowerarmL: ['leftforearm', 'lowerarml', 'forearml', 'lelbow', 'leftlowerarm'],
  handL: ['lefthand', 'handl', 'lhand'],
  upperarmR: ['rightarm', 'upperarmr', 'armr', 'rarm', 'rightupperarm', 'ruparm'],
  lowerarmR: ['rightforearm', 'lowerarmr', 'forearmr', 'relbow', 'rightlowerarm'],
  handR: ['righthand', 'handr', 'rhand'],
  thighL: ['leftupleg', 'thighl', 'leftthigh', 'lupleg', 'lthigh'],
  calfL: ['leftleg', 'calfl', 'shinl', 'leftcalf', 'lknee'],
  thighR: ['rightupleg', 'thighr', 'rightthigh', 'rupleg', 'rthigh'],
  calfR: ['rightleg', 'calfr', 'shinr', 'rightcalf', 'rknee'],
  shoulderL: ['leftshoulder', 'claviclel', 'shoulderl', 'lshoulder'],
  shoulderR: ['rightshoulder', 'clavicler', 'shoulderr', 'rshoulder'],
  toeL: ['lefttoebase', 'lefttoe', 'footl', 'lfoot'],
  toeR: ['righttoebase', 'righttoe', 'footr', 'rfoot']
};

/* ---------------- 动画采样器 ---------------- */

class Clip {
  constructor(gltf, bin, animIndex) {
    this.gltf = gltf;
    this.anim = gltf.animations[animIndex];
    this.channels = new Map(); // nodeIndex -> {translation, rotation, scale}
    this.duration = 0;

    for (const ch of this.anim.channels) {
      const s = this.anim.samplers[ch.sampler];
      const times = readAccessor(gltf, bin, s.input);
      const values = readAccessor(gltf, bin, s.output);
      const n = times.length;
      const ncomp = values.length / n;
      if (!this.channels.has(ch.target.node)) this.channels.set(ch.target.node, {});
      this.channels.get(ch.target.node)[ch.target.path] = { times, values, ncomp, interp: s.interpolation || 'LINEAR' };
      this.duration = Math.max(this.duration, times[n - 1]);
    }

    // 节点局部 TRS 的静态底值
    this.rest = gltf.nodes.map(nd => ({
      t: nd.translation || [0, 0, 0],
      r: nd.rotation || [0, 0, 0, 1],
      s: nd.scale || [1, 1, 1]
    }));

    this.parentOf = new Array(gltf.nodes.length).fill(-1);
    gltf.nodes.forEach((nd, i) => (nd.children || []).forEach(c => (this.parentOf[c] = i)));
  }

  sampleChannel(entry, time, path) {
    const { times, values, ncomp, interp } = entry;
    if (times.length === 1) return values.slice(0, ncomp);
    let i = 0;
    while (i < times.length - 1 && times[i + 1] < time) i++;
    const t0 = times[i], t1 = times[Math.min(i + 1, times.length - 1)];
    if (interp === 'STEP') return values.slice(i * ncomp, (i + 1) * ncomp);
    const u = t1 > t0 ? clamp((time - t0) / (t1 - t0), 0, 1) : 0;
    const a = Array.from(values.slice(i * ncomp, (i + 1) * ncomp));
    const b = Array.from(values.slice(Math.min(i + 1, times.length - 1) * ncomp, (Math.min(i + 1, times.length - 1) + 1) * ncomp));
    if (path === 'rotation') return qNlerp(a, b, u);
    return a.map((v, k) => v + (b[k] - v) * u);
  }

  worldMatrices(time) {
    const out = new Array(this.gltf.nodes.length);
    const local = (i) => {
      const ch = this.channels.get(i) || {};
      const rest = this.rest[i];
      const t = ch.translation ? this.sampleChannel(ch.translation, time, 'translation') : rest.t;
      const r = ch.rotation ? this.sampleChannel(ch.rotation, time, 'rotation') : rest.r;
      const s = ch.scale ? this.sampleChannel(ch.scale, time, 'scale') : rest.s;
      return composeTRS(t, r, s);
    };
    const resolve = (i) => {
      if (out[i]) return out[i];
      const p = this.parentOf[i];
      const m = local(i);
      out[i] = p >= 0 ? mat4Mul(resolve(p), m) : m;
      return out[i];
    };
    for (let i = 0; i < this.gltf.nodes.length; i++) resolve(i);
    return out;
  }

  localRotation(nodeIndex, time) {
    const ch = this.channels.get(nodeIndex);
    if (ch && ch.rotation) return this.sampleChannel(ch.rotation, time, 'rotation');
    return this.rest[nodeIndex].r;
  }
}

const posOf = (m) => [m[12], m[13], m[14]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/* ---------------- 关键帧抽稀（RDP） ---------------- */

function simplify(keys, eps) {
  if (keys.length <= 2) return keys;
  const keep = new Array(keys.length).fill(false);
  keep[0] = keep[keys.length - 1] = true;
  const stack = [[0, keys.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ta, va] = keys[a], [tb, vb] = keys[b];
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [ti, vi] = keys[i];
      const u = tb > ta ? (ti - ta) / (tb - ta) : 0;
      const pred = va + (vb - va) * u;
      const d = Math.abs(vi - pred);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return keys.filter((_, i) => keep[i]);
}

/* ---------------- 主流程 ---------------- */

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('用法: node bake-motion.mjs <动作.glb> [--name=键名] [--fps=30] [--eps=0.02] [--clip=0] [--out=文件] [--dump-bones] [--no-mirror-x]');
    process.exit(1);
  }
  const opt = {};
  for (const a of argv) if (a.startsWith('--')) {
    const [k, v] = a.replace(/^--/, '').split('=');
    opt[k] = v === undefined ? true : v;
  }

  const buf = fs.readFileSync(file);
  const { gltf, bin } = parseGLB(buf);
  if (!gltf.animations || !gltf.animations.length) {
    throw new Error('这个 GLB 里没有动画。PINOC 的动作应该带 1 条 clip，检查一下下载的是不是动作文件而不是角色文件。');
  }

  /* --- 骨架识别 --- */
  const byNorm = new Map();
  gltf.nodes.forEach((nd, i) => { if (nd.name) byNorm.set(normName(nd.name), i); });

  const B = {};
  const missing = [];
  for (const [key, alts] of Object.entries(ALIASES)) {
    let hit = null;
    for (const a of alts) if (byNorm.has(a)) { hit = byNorm.get(a); break; }
    if (hit === null) { missing.push(key); continue; }
    B[key] = hit;
  }

  if (opt['dump-bones']) {
    console.log('== 动画 clip ==');
    gltf.animations.forEach((an, i) => console.log(`  [${i}] ${an.name || '(未命名)'} · ${an.channels.length} 通道`));
    console.log('\n== 全部节点 ==');
    gltf.nodes.forEach((nd, i) => {
      const tag = Object.entries(B).find(([, v]) => v === i);
      console.log(`  ${String(i).padStart(3)} ${nd.name || '(无名)'}${tag ? '   <= ' + tag[0] : ''}`);
    });
    const mapped = Object.keys(B).length;
    console.log(`\n识别到 ${mapped} 个关键骨骼，缺 ${missing.length} 个：${missing.join(', ') || '无'}`);
    return;
  }

  const need = ['upperarmL', 'lowerarmL', 'upperarmR', 'lowerarmR', 'thighL', 'calfL', 'thighR', 'calfR'];
  const lack = need.filter(k => B[k] === undefined);
  if (lack.length) {
    throw new Error(`骨架缺少关键骨骼：${lack.join(', ')}。先跑 --dump-bones 看看这个模型用的什么命名。`);
  }

  /* --- 朝向与镜像判定 ---
   * glTF 约定角色面朝 +Z。游戏里 legL 在 x=-0.2、armR 在 x=+0.44，
   * 所以要看骨骼的静止世界坐标，判断左右是否和游戏同一侧。 */
  const clipIndex = Number(opt.clip || 0);
  const clip = new Clip(gltf, bin, clipIndex);
  const w0 = clip.worldMatrices(0);

  const mirrorX = opt['no-mirror-x'] ? false
    : (B.upperarmR !== undefined && B.upperarmL !== undefined)
      ? (posOf(w0[B.upperarmR])[0] < posOf(w0[B.upperarmL])[0])
      : false;

  /* 尺度：骨骼体系里的身高 vs 游戏里的 1.9 单位 */
  let rigHeight = 1;
  if (B.head !== undefined && B.hips !== undefined) {
    rigHeight = len(sub(posOf(w0[B.head]), posOf(w0[B.hips]))) || 1;
  }
  const GAME_HEIGHT = 1.9;
  const posScale = GAME_HEIGHT / Math.max(rigHeight, 1e-3) * 0.25; // 0.25 是刻意压小，root motion 只取意境

  const toGame = (d) => (mirrorX ? [-d[0], d[1], d[2]] : [d[0], d[1], d[2]]);

  /* 方向 -> 游戏里盒子的欧拉角
   * 盒子默认朝下 (0,-1,0)，rotation.set(x, y, z) 为 XYZ 序：
   *   x 负 = 向前抬起；z 正 = 向 +X 摆 */
  function dirToAngles(d) {
    const dx = clamp(d[0], -1, 1);
    const z = Math.asin(dx);
    const x = Math.atan2(-d[2], -d[1]);
    return [x, z];
  }

  const fps = Number(opt.fps || 30);
  const nFrames = Math.max(2, Math.round(clip.duration * fps));
  const tracks = {};
  const push = (name, p, v) => { (tracks[name] ||= []).push([p, v]); };

  const hipsStart = posOf(w0[B.hips] || 0);

  for (let f = 0; f <= nFrames; f++) {
    const time = (f / nFrames) * clip.duration;
    const w = clip.worldMatrices(time);
    const p = f / nFrames;

    const armR = dirToAngles(toGame(norm(sub(posOf(w[B.lowerarmR]), posOf(w[B.upperarmR])))));
    const armL = dirToAngles(toGame(norm(sub(posOf(w[B.lowerarmL]), posOf(w[B.upperarmL])))));
    const legR = dirToAngles(norm(sub(posOf(w[B.calfR]), posOf(w[B.thighR]))));
    const legL = dirToAngles(norm(sub(posOf(w[B.calfL]), posOf(w[B.thighL]))));

    push('armRx', p, armR[0]);
    push('armRz', p, armR[1]);
    push('armLx', p, armL[0]);
    push('armLz', p, armL[1]);
    push('legRx', p, legR[0]);
    push('legLx', p, legL[0]);

    /* 躯干：spine 局部旋转相对首帧的偏量，转成欧拉 */
    if (B.spine !== undefined) {
      const q0 = clip.localRotation(B.spine, 0);
      const qt = clip.localRotation(B.spine, time);
      const [ex, ey, ez] = quatEulerDelta(q0, qt);
      push('torsoX', p, -ex);
      push('torsoY', p, -ey);
      push('torsoZ', p, ez);
    }

    /* 根运动：竖直起伏取意境，水平位移丢掉（游戏里位移由摇杆控制） */
    if (B.hips !== undefined) {
      const d = sub(posOf(w[B.hips]), hipsStart);
      push('tPosY', p, d[1] * posScale);
      push('tPosZ', p, d[2] * posScale);
    }
  }

  function quatEulerDelta(q0, qt) {
    const d = qMul(qInv(q0), qt);
    return quatToEulerXYZ(d);
  }

  /* --- 抽稀 + 归零 ---
   * ATK_KEYS 是叠加在基础姿态上的偏移量，首尾必须回到 0，否则动作结束会「抽」一下 */
  const eps = Number(opt.eps || 0.02);
  const lines = [];
  let harvested = 0;

  for (const [name, keys] of Object.entries(tracks)) {
    const first = keys[0][1];
    const shifted = keys.map(([p, v]) => [p, v - first]);
    const simple = simplify(shifted, eps);
    const fmt = simple.map(([p, v]) => `[${+p.toFixed(3)}, ${+v.toFixed(3)}]`).join(', ');
    if (simple.length > 2 || Math.abs(simple[simple.length - 1][1]) > eps) harvested++;
    lines.push(`    ${name}: [${fmt}]`);
  }

  const name = opt.name || path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9_]/g, '_');
  const header = [
    `  /* ${name} —— 由 bake-motion.mjs 从 ${path.basename(file)} 烘焙`,
    `   * clip: ${clip.anim.name || '(未命名)'} · ${clip.duration.toFixed(2)}s · ${nFrames + 1} 帧 @${fps}fps`,
    `   * 引擎侧把 a.atkSpeed 设成 ${(1 / Math.max(clip.duration, 0.01)).toFixed(2)} 就能和这个时长对上 */`
  ].join('\n');

  const out = `${header}\n  ${name}: {\n${lines.join(',\n')}\n  }`;

  if (opt.out) {
    fs.writeFileSync(opt.out, out + '\n', 'utf8');
    console.log(`已写入 ${opt.out}`);
  } else {
    console.log(out);
  }

  console.error(`\n[摘要] 骨骼 ${Object.keys(B).length} 个 · ${nFrames + 1} 帧 · ${clip.duration.toFixed(2)}s · 通道 ${Object.keys(tracks).length} 个 · 镜像 ${mirrorX}`);
  if (missing.length) console.error(`[提示] 未匹配骨骼：${missing.join(', ')}`);
}

main();
