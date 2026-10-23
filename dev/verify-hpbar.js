/* ============================================================
 * 血条错位数值验证（Node 环境，不需要浏览器）
 *
 * 复现 makeHpBar / updateHpBar 的几何关系，扫描怪物 0~360° 自转，
 * 测量「填充条左边缘」相对「底槽中心」的偏移，再看它随角度漂移多少。
 *
 * 旧逻辑：偏移随角度从 -28px 漂到 +28px（最大漂移 ~57px）→ 两条分开的横条
 * 新逻辑：血条组反向旋转到正对相机 → 偏移恒定，漂移为 0
 * ============================================================ */

const THREE = require('../lib/three.min.js');

const VW = 1600, VH = 900;                 // 视口尺寸
const HPBAR_W = 1.2, HPBAR_H = 0.19;

const camera = new THREE.PerspectiveCamera(46, VW / VH, 0.1, 200);
camera.position.set(0, 5.2, 12);
camera.lookAt(0, 1.6, 0);
camera.updateMatrixWorld(true);

/* 怪物：host 会自转（模拟转身面向玩家） */
const host = new THREE.Group();
host.position.set(0, 0, 0);

/* 血条组，挂在 host 下，与 makeHpBar 一致 */
const barGroup = new THREE.Group();
barGroup.position.y = 2.4;
host.add(barGroup);

/* bg：居中锚点，位于组原点 */
const bg = new THREE.Object3D();
barGroup.add(bg);

/* fill：左锚点（center.x=0），用 -W/2 偏移实现左对齐 —— 错位的来源 */
const fill = new THREE.Object3D();
fill.position.x = -HPBAR_W / 2;
barGroup.add(fill);

/* 复算 updateHpBar 里的组缩放 */
function groupScale(dist) {
  const px = 9;
  const h = Math.min(Math.max(px / VH * 0.849 * dist, 0.08), 0.85);
  return h / HPBAR_H;
}
const DIST = 12;
barGroup.scale.setScalar(groupScale(DIST));

const _p = new THREE.Vector3();
function projectX(obj) {
  obj.getWorldPosition(_p);
  _p.project(camera);
  return (_p.x * 0.5 + 0.5) * VW;
}

/* 扫一圈角度：返回「填充左边缘 - 底槽中心」的像素偏移序列 */
function sweep(useFix) {
  const vals = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < 360; i++) {
    host.rotation.y = i * Math.PI / 180;
    barGroup.quaternion.identity();
    host.updateMatrixWorld(true);

    if (useFix) {
      /* 新增逻辑：local = inv(parentWorld) * camera */
      host.getWorldQuaternion(q);
      q.invert();
      q.multiply(camera.quaternion);
      barGroup.quaternion.copy(q);
      host.updateMatrixWorld(true);
    }

    vals.push(projectX(fill) - projectX(bg));
  }
  return vals;
}

function stats(vals) {
  const base = vals[0];               // 0° 时为正确对齐基准
  let maxDev = 0, min = Infinity, max = -Infinity;
  for (const v of vals) {
    maxDev = Math.max(maxDev, Math.abs(v - base));
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { base, maxDev, min, max, range: max - min };
}

const before = stats(sweep(false));
const after = stats(sweep(true));

const pad = (s, n) => String(s).padStart(n);
const pxf = v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' px';

console.log('');
console.log('  血条错位验证  （视口 1600x900，镜头距离 12，怪物自转 0~360°）');
console.log('  指标：填充条左边缘 相对 底槽中心 的屏幕偏移');
console.log('  ' + '-'.repeat(66));
console.log('  逻辑                    偏移范围              随角度漂移');
console.log('  ' + '-'.repeat(66));
console.log(`  修复前（不传 camera）   ${pad(pxf(before.min), 9)} ~ ${pad(pxf(before.max), 9)}   ${pad(before.maxDev.toFixed(1) + ' px', 10)}`);
console.log(`  修复后（传 camera）     ${pad(pxf(after.min), 9)} ~ ${pad(pxf(after.max), 9)}   ${pad(after.maxDev.toFixed(1) + ' px', 10)}`);
console.log('  ' + '-'.repeat(66));
console.log('');
console.log(`  修复前最大漂移 ${before.maxDev.toFixed(1)} px  →  修复后 ${after.maxDev.toFixed(1)} px`);
console.log(`  判定：${after.maxDev < 0.5 ? 'PASS  血条随角度变化保持贴合，不再分裂' : 'FAIL  仍有漂移'}`);
console.log('');

process.exit(after.maxDev < 0.5 ? 0 : 1);
