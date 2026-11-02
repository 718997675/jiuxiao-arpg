/* ============================================================
 * 装备模组（纸娃娃零件表）契约测试 —— node 直跑，不需要浏览器
 *
 *   node dev/test-doll.js
 *
 * 覆盖：
 *   1. 族数 / 零件数是否与文档口径一致（33 族 = 9 建模 × 3 + 2 光效 × 3）
 *   2. 每条零件数据的字段合法性（原语白名单、尺寸有限正数、挂点存在）
 *   3. 同族零件 id 不重名；LOD 只增不减（升阶看到的是「长出来了」）
 *   4. 成对槽位（肩/手/靴/戒）是否都走 L/R 挂点并标了 mx
 *   5. 384 件基底穷举 dollKeyOf 不抛错、族/LOD 在范围内
 *   6. 同槽三族剪影两两 IoU < 0.85（方案 §2 验收第 1 条）
 *   7. doll.js 的八阶兜底表与 actors.js 的 METAL_PALETTE 前 8 阶逐项相等
 *
 * 为什么剪影用近似投影而不是渲染：node 里没有 WebGL。这里做的是**粗筛**
 * （拦住「两族几乎一样」），真正的像素剪影在工具台的对比模式里用 GPU 算。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData } = require('./_load');

const ROOT = path.resolve(__dirname, '..');
const ctx = loadData();
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/data/data-doll.js'), 'utf8'), ctx,
  { filename: 'src/data/data-doll.js' });

const P = n => vm.runInContext(n, ctx);
const DOLL_PARTS = P('DOLL_PARTS');
const DOLL_ANCHORS = P('DOLL_ANCHORS');
const DOLL_WEAPON_RIG = P('DOLL_WEAPON_RIG');
const DOLL_WEAPON_TRIM = P('DOLL_WEAPON_TRIM');
const dollKeyOf = P('dollKeyOf');
const dollLod = P('dollLod');
const dollStats = P('dollStats');
const dollPartsOf = P('dollPartsOf');
const dollFamIou = P('dollFamIou');
const ARMOR_BASES = P('ARMOR_BASES');
const WEAPON_BASES = P('WEAPON_BASES');
const OFFHAND_BASES = P('OFFHAND_BASES');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

const MOD_SLOTS = ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'relic'];
const FX_SLOTS = ['ring', 'fate'];
const PAIRED = { shoulders: 1, gloves: 1, boots: 1, ring: 1 };
const GLYPHS = ['box', 'cyl', 'cone', 'sph', 'dome', 'torus', 'disc'];

console.log('\n=== 1. 族数与零件数 ===');
const st = dollStats();
ok(Object.keys(DOLL_PARTS).length === 11, '建模槽应为 11（9 建模 + 2 光效）', Object.keys(DOLL_PARTS).length);
ok(st.fams === 33, '族数应为 33', st.fams);
ok(st.parts >= 120, '基础零件总数偏少（<120），造型会太单薄', st.parts);
ok(st.lodParts >= 20, 'LOD 增量件偏少（<20），升阶看不出变化', st.lodParts);
for (const s of MOD_SLOTS.concat(FX_SLOTS)) {
  const def = DOLL_PARTS[s];
  ok(def && Object.keys(def).length === 3, '槽 ' + s + ' 应有 A/B/C 三族',
    def ? Object.keys(def).join('/') : 'missing');
}
console.log('  族 ' + st.fams + ' / 基础件 ' + st.parts + ' / LOD 增量件 ' + st.lodParts);

console.log('\n=== 2. 零件字段合法性 ===');
let badField = 0, badPrim = 0, badAnchor = 0, badNum = 0;
const allParts = [];
for (const slot in DOLL_PARTS) {
  for (const fam in DOLL_PARTS[slot]) {
    const def = DOLL_PARTS[slot][fam];
    ok(!!def.name, slot + '.' + fam + ' 缺 name');
    ok(!!def.axis, slot + '.' + fam + ' 缺 axis（三轴差异说明）');
    ok(!!def.anchor || !!(def.parts && def.parts[0].a), slot + '.' + fam + ' 没有族级 anchor');
    const list = (def.parts || []).concat(...(def.lod || []).map(a => a || []));
    const seen = new Set();
    for (const pt of list) {
      allParts.push({ slot, fam, pt });
      if (!pt.i || seen.has(pt.i)) { badField++; }
      seen.add(pt.i);
      if (GLYPHS.indexOf(pt.g) < 0) badPrim++;
      const an = pt.a || def.anchor;
      if (!DOLL_ANCHORS[an]) { badAnchor++; console.log('    · 未知挂点 ' + an + ' @ ' + slot + '.' + fam + '.' + pt.i); }
      for (const arrName of ['s', 'p', 'r', 'sc']) {
        const arr = pt[arrName];
        if (!arr) continue;
        for (const v of arr) if (!isFinite(v)) badNum++;
      }
      if (!pt.s || !pt.s.length) badNum++;
    }
  }
}
ok(badField === 0, '存在缺失 id 或同族 id 重名的零件', badField);
ok(badPrim === 0, '存在白名单外的原语', badPrim);
ok(badAnchor === 0, '存在挂点在 DOLL_ANCHORS 里不存在的零件', badAnchor);
ok(badNum === 0, '存在 NaN / Infinity 尺寸', badNum);
console.log('  零件条目 ' + allParts.length + ' 条全部通过');

console.log('\n=== 3. LOD 单调（只加件不换件）===');
let notMono = [];
for (const slot in DOLL_PARTS) {
  for (const fam in DOLL_PARTS[slot]) {
    const c0 = (dollPartsOf(slot, fam, 0) || []).length;
    const c1 = (dollPartsOf(slot, fam, 1) || []).length;
    const c2 = (dollPartsOf(slot, fam, 2) || []).length;
    if (!(c0 <= c1 && c1 <= c2)) notMono.push(slot + '.' + fam + ' ' + c0 + '/' + c1 + '/' + c2);
    /* 「已实装」判据：繁段必须比简段真多件，否则升阶是假的 */
    if (slot !== 'ring' && c2 <= c0) notMono.push(slot + '.' + fam + ' 繁段没加件');
  }
}
ok(notMono.length === 0, 'LOD 不是单调递增（或繁段没加件）', notMono.join(', '));

console.log('\n=== 4. 成对槽位必须走 L/R 挂点 ===');
let pairBad = [];
for (const slot in PAIRED) {
  for (const fam in DOLL_PARTS[slot]) {
    const def = DOLL_PARTS[slot][fam];
    const an = def.anchor;
    if (!/[LR]$/.test(an)) { pairBad.push(slot + '.' + fam + ' 族级 anchor=' + an); continue; }
    for (const pt of (def.parts || [])) {
      if (pt.a && !/[LR]$/.test(pt.a)) pairBad.push(slot + '.' + fam + '.' + pt.i + ' 挂到中线 ' + pt.a);
    }
  }
}
ok(pairBad.length === 0, '成对槽位用了非 L/R 挂点', pairBad.join(', '));

console.log('\n=== 5. 384 件基底穷举 ===');
let n = 0, bad = 0;
for (const slot in ARMOR_BASES) {
  for (let t = 0; t < ARMOR_BASES[slot].length; t++) {
    for (let v = 0; v < ARMOR_BASES[slot][t].length; v++) {
      const it = { slot, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common' };
      let k;
      try { k = dollKeyOf(it); } catch (e) { bad++; continue; }
      n++;
      if (!k || ['A', 'B', 'C'].indexOf(k.fam) < 0 || k.lod < 0 || k.lod > 2) bad++;
      /* 披风/命格也要能解析（它们是真槽位） */
      if (DOLL_PARTS[slot] && !DOLL_PARTS[slot][k.fam]) bad++;
    }
  }
}
for (const cls in WEAPON_BASES) {
  for (let t = 0; t < WEAPON_BASES[cls].length; t++) {
    for (let v = 0; v < WEAPON_BASES[cls][t].length; v++) {
      const it = { slot: 'weapon', cls, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common' };
      const k = dollKeyOf(it); n++;
      if (!k || ['A', 'B', 'C'].indexOf(k.fam) < 0) bad++;
    }
  }
}
for (const cls in OFFHAND_BASES) {
  for (let t = 0; t < OFFHAND_BASES[cls].length; t++) {
    for (let v = 0; v < OFFHAND_BASES[cls][t].length; v++) {
      const it = { slot: 'offhand', cls, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common' };
      const k = dollKeyOf(it); n++;
      if (!k || ['A', 'B', 'C'].indexOf(k.fam) < 0) bad++;
    }
  }
}
ok(n >= 380, '基底总数偏少（应 384）', n);
ok(bad === 0, '穷举里有解析失败的基底', bad);
console.log('  穷举 ' + n + ' 件，失败 ' + bad);

console.log('\n=== 6. 同槽三族剪影 IoU < 0.85 ===');
const iouRows = [];
let iouBad = [];
for (const slot of MOD_SLOTS.concat(FX_SLOTS)) {
  const r = dollFamIou(slot, 0);
  iouRows.push({ slot, r });
  const worst = Math.max(r.AB, r.AC, r.BC);
  if (worst >= 0.85) iouBad.push(slot + ' 最差 ' + worst.toFixed(3));
}
for (const row of iouRows) {
  const r = row.r;
  const flag = Math.max(r.AB, r.AC, r.BC) >= 0.85 ? ' ✗' : '';
  console.log('  ' + row.slot.padEnd(10) + ' AB ' + r.AB.toFixed(3) + '  AC ' + r.AC.toFixed(3)
    + '  BC ' + r.BC.toFixed(3) + flag);
}
ok(iouBad.length === 0, '有槽位三族剪影太像（近似投影，阈值 0.85）', iouBad.join(' | '));

console.log('\n=== 7. 八阶材质兜底表与 actors.js 一致 ===');
const actorsSrc = fs.readFileSync(path.join(ROOT, 'src/actors.js'), 'utf8');
const tbl = actorsSrc.match(/const METAL_PALETTE = \{([\s\S]*?)\n\};/);
ok(!!tbl, '没在 actors.js 里找到 METAL_PALETTE');
const parsed = {};
if (tbl) {
  const re = /(\w+):\s*\[\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*,\s*([\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(tbl[1]))) {
    parsed[m[1]] = [parseInt(m[2], 16), parseInt(m[3], 16), parseFloat(m[4])];
  }
}
const dollSrc = fs.readFileSync(path.join(ROOT, 'src/doll.js'), 'utf8');
const fb = dollSrc.match(/const DOLL_METAL_FALLBACK = \{([\s\S]*?)\n  \};/);
ok(!!fb, '没在 doll.js 里找到 DOLL_METAL_FALLBACK');
let metalBad = [];
if (fb) {
  const re = /(\w+):\s*\[\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*,\s*([\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(fb[1]))) {
    const k = m[1];
    const mine = [parseInt(m[2], 16), parseInt(m[3], 16), parseFloat(m[4])];
    const theirs = parsed[k];
    if (!theirs) { metalBad.push(k + ' 在 actors.js 里不存在'); continue; }
    if (mine[0] !== theirs[0] || mine[1] !== theirs[1] || Math.abs(mine[2] - theirs[2]) > 1e-6) {
      metalBad.push(k + ' 值不一致');
    }
  }
}
ok(metalBad.length === 0, 'doll.js 的兜底材质表与 actors.js 漂了', metalBad.join(', '));
console.log('  对比 ' + Object.keys(parsed).length + ' 个阶材质的字段');

console.log('\n=== 8. 武器模具骨架 ===');
let rigBad = [];
for (const shape in DOLL_WEAPON_RIG) {
  const rig = DOLL_WEAPON_RIG[shape];
  if (!(rig.len > 0.2 && rig.len < 2.0)) rigBad.push(shape + ' len=' + rig.len);
  for (const fam of ['A', 'B', 'C']) {
    const f = rig.fam[fam];
    if (!f) { rigBad.push(shape + ' 缺 ' + fam); continue; }
    /* 契约：长度不许参数化 —— 只允许 w/t，出现 h/len/scale 就是越界 */
    for (const k of Object.keys(f)) {
      if (['w', 't', 'tag', 'trim'].indexOf(k) < 0) rigBad.push(shape + '.' + fam + ' 出现越界字段 ' + k);
    }
    if (!(f.w > 0.5 && f.w < 2 && f.t > 0.5 && f.t < 2)) rigBad.push(shape + '.' + fam + ' w/t 越界');
    for (const tid of (f.trim || [])) if (!DOLL_WEAPON_TRIM[tid]) rigBad.push(shape + '.' + fam + ' 未知装饰件 ' + tid);
  }
}
for (const tid in DOLL_WEAPON_TRIM) {
  if (GLYPHS.indexOf(DOLL_WEAPON_TRIM[tid].g) < 0) rigBad.push('装饰件 ' + tid + ' 原语非法');
}
ok(rigBad.length === 0, '武器骨架不合契约（长度被参数化 / 字段越界）', rigBad.join(', '));
console.log('  形状 ' + Object.keys(DOLL_WEAPON_RIG).length + ' 个 × 3 族，装饰件 '
  + Object.keys(DOLL_WEAPON_TRIM).length + ' 种');

console.log('\n----------------------------------------');
console.log((fail === 0 ? '✓ 全部通过' : '✗ 失败 ' + fail) + '：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
