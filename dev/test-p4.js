/* ============================================================
 * [equip-doll P4] 品质与传世 · 离线契约
 *
 *   node dev/test-p4.js
 *
 * 计划书 §10 给 P4 的两条判据：
 *   ① 同族同阶、凡品 vs 神品，accent 件数 0 → 3
 *   ② 传世 40 件两两剪影不重合（同槽 IoU < 0.9）
 *
 * ② 的口径说明：**同槽内**比。跨槽比没意义 —— 头盔和靴子的剪影本来就
 * 不在一块画布上（各自的包围盒差一个数量级），IoU 恒等于 0，
 * 那样「通过」是白送的。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData } = require('./_load');

const ROOT = path.resolve(__dirname, '..');
const ctx = loadData();
const P = n => vm.runInContext(n, ctx);

const DOLL_SIG = P('DOLL_SIG');
const UNIQUE_ITEMS = P('UNIQUE_ITEMS');
const dollSig = P('dollSig');
const dollSigParts = P('dollSigParts');
const dollQualityParts = P('dollQualityParts');
const dollAccentCount = P('dollAccentCount');
const dollPartsOf = P('dollPartsOf');
const dollSilhouette = P('dollSilhouette');
const dollIou = P('dollIou');
const dollKeyOf = P('dollKeyOf');
const _dollPieces = P('_dollPieces');
const DOLL_WEAPON_RIG = P('DOLL_WEAPON_RIG');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + msg + (extra === undefined ? '' : '  →  ' + JSON.stringify(extra)));
};

/* ============================================================
 * 一、40 件传世必须件件有签名
 * ============================================================ */
console.log('\n=== 1. 40 件传世签名覆盖 ===');
ok(UNIQUE_ITEMS.length === 40, '传世必须正好 40 件', UNIQUE_ITEMS.length);
const missing = UNIQUE_ITEMS.filter(u => !dollSig(u.id)).map(u => u.id);
ok(missing.length === 0, '有传世没有签名（外观会跟普通装备一样）', missing);
const extra = Object.keys(DOLL_SIG).filter(id => !UNIQUE_ITEMS.some(u => u.id === id));
ok(extra.length === 0, 'DOLL_SIG 里有不存在的传世 id（拼错了？）', extra);
ok(Object.keys(DOLL_SIG).length === 40, 'DOLL_SIG 必须正好 40 条', Object.keys(DOLL_SIG).length);

/* ============================================================
 * 二、每件签名真的装配出零件
 * ============================================================ */
console.log('\n=== 2. 签名件装配 ===');
const emptySig = [];
const badFam = [];
for (const u of UNIQUE_ITEMS) {
  const k = dollKeyOf({ slot: u.slot, baseVar: 0, baseTier: 6, uniqueId: u.id });
  if (!k) { emptySig.push(u.id + '(key)'); continue; }
  if (['A', 'B', 'C'].indexOf(k.fam) < 0) { badFam.push(u.id + ':' + k.fam); continue; }
  const sg = dollSig(u.id);
  /* 武器 / 副手走模具骨架，没有零件表 */
  if (u.slot === 'weapon' || u.slot === 'offhand') {
    if (!sg || (!sg.w && !sg.t && !sg.trim)) emptySig.push(u.id + '(武器无形制)');
    continue;
  }
  const list = dollSigParts(k.slot, k.fam, k.lod, u.id);
  if (!list || !list.length) emptySig.push(u.id);
}
ok(emptySig.length === 0, '有传世装配不出零件', emptySig);
ok(badFam.length === 0, '签名指定了非法主族', badFam);

/* mix 引用的零件必须真实存在 —— 拼错一个字母就是「少一件装饰」，
 * 而且不会报错（`for (const p of src) if (p.i === id)` 找不到就跳过）。 */
const badMix = [];
for (const u of UNIQUE_ITEMS) {
  const sg = dollSig(u.id);
  if (!sg || !sg.mix) continue;
  const k = dollKeyOf({ slot: u.slot, baseVar: 0, baseTier: 6, uniqueId: u.id });
  for (const ref of sg.mix) {
    const dot = ref.indexOf('.');
    if (dot < 0) { badMix.push(u.id + ':' + ref + '(格式)'); continue; }
    const f = ref.slice(0, dot), id = ref.slice(dot + 1);
    const src = dollPartsOf(k.slot, f, 2) || [];
    if (!src.some(p => p.i === id)) badMix.push(u.id + ':' + ref);
  }
}
ok(badMix.length === 0, '签名 mix 引用了不存在的零件', badMix);

/* ============================================================
 * 三、武器签名不许碰 len
 * ============================================================ */
console.log('\n=== 3. 武器签名只改宽厚 ===');
const lenHit = [];
for (const u of UNIQUE_ITEMS) {
  const sg = dollSig(u.id);
  if (!sg) continue;
  if ('len' in sg) lenHit.push(u.id);
}
ok(lenHit.length === 0, 'DOLL_SIG 里不许出现 len 字段（长度是契约）', lenHit);

const trimBad = [];
const TRIM = P('DOLL_WEAPON_TRIM');
for (const u of UNIQUE_ITEMS) {
  const sg = dollSig(u.id);
  if (!sg || !sg.trim) continue;
  for (const t of sg.trim) if (!TRIM[t]) trimBad.push(u.id + ':' + t);
}
ok(trimBad.length === 0, '签名 trim 引用了不存在的装饰件', trimBad);

/* 武器签名的 w/t 必须与同族默认不同，否则「签名」是空的 */
const sameWT = [];
for (const u of UNIQUE_ITEMS) {
  if (u.slot !== 'weapon' && u.slot !== 'offhand') continue;
  const sg = dollSig(u.id);
  if (!sg) continue;
  const shape = u.shape || (u.slot === 'offhand' ? 'shield' : 'sword');
  const rig = DOLL_WEAPON_RIG[shape];
  if (!rig) { sameWT.push(u.id + '(未知 shape ' + shape + ')'); continue; }
  const k = dollKeyOf({ slot: u.slot, baseVar: 0, baseTier: 6, uniqueId: u.id });
  const base = rig.fam[k.fam] || rig.fam.A;
  if ((sg.w || base.w) === base.w && (sg.t || base.t) === base.t
    && JSON.stringify(sg.trim || base.trim) === JSON.stringify(base.trim)) {
    sameWT.push(u.id);
  }
}
ok(sameWT.length === 0, '武器签名的 w/t/trim 与默认形制完全相同（等于没签）', sameWT);

/* ============================================================
 * 四、同槽两两剪影 IoU < 0.9
 * ============================================================ */
console.log('\n=== 4. 同槽签名件剪影互不重合 ===');
/* 同一槽的包围盒要**把签名件也算进去**，否则 mix 加出来的部分会被裁掉，
 * 剪影全变成「族主件」的形状 —— 那样量出来的 IoU 反而更小，是假通过。 */
function boxOf(slot, rows) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const r of rows) {
    for (const p of _dollPieces(slot, r.fam, 0, r.sig)) {
      const rx = Math.max(0.01, p.rx), ry = Math.max(0.01, p.ry);
      x0 = Math.min(x0, p.cx - rx); x1 = Math.max(x1, p.cx + rx);
      y0 = Math.min(y0, p.cy - ry); y1 = Math.max(y1, p.cy + ry);
    }
  }
  if (x0 > x1) return [-0.5, 0.5, 0, 2];
  const px = (x1 - x0) * 0.04 + 0.01, py = (y1 - y0) * 0.04 + 0.01;
  return [x0 - px, x1 + px, y0 - py, y1 + py];
}

const bySlot = {};
for (const u of UNIQUE_ITEMS) {
  const k = dollKeyOf({ slot: u.slot, baseVar: 0, baseTier: 6, uniqueId: u.id });
  if (!k) continue;
  (bySlot[k.slot] = bySlot[k.slot] || []).push({ id: u.id, fam: k.fam, sig: u.id });
}
/* 武器 / 副手剪影由模具骨架的 w/t 决定，这里只验有零件表的槽 */
const worstRows = [];
for (const slot in bySlot) {
  if (slot === 'weapon' || slot === 'offhand') continue;
  const rows = bySlot[slot];
  if (rows.length < 2) continue;
  const box = boxOf(slot, rows);
  const sil = rows.map(r => ({ id: r.id, s: dollSilhouette(slot, r.fam, 0, box, null, r.sig) }));
  for (let i = 0; i < sil.length; i++) {
    for (let j = i + 1; j < sil.length; j++) {
      const iou = dollIou(sil[i].s, sil[j].s);
      worstRows.push({ slot, a: sil[i].id, b: sil[j].id, iou: +iou.toFixed(3) });
    }
  }
}
worstRows.sort((x, y) => y.iou - x.iou);
const tooSame = worstRows.filter(r => r.iou >= 0.9);
console.log('  最像的 8 对：' + worstRows.slice(0, 8).map(r => r.a + '/' + r.b + ' ' + r.iou).join(' · '));
ok(tooSame.length === 0, '有传世两两剪影几乎一样（IoU ≥ 0.9）',
  tooSame.map(r => r.a + '/' + r.b + ' ' + r.iou));

/* ============================================================
 * 五、品质光：凡品 0 件 → 神品 3 件
 * ============================================================ */
console.log('\n=== 5. 品质光件数 ===');
ok(dollAccentCount('common') === 0, '凡品不许有品质光', dollAccentCount('common'));
ok(dollAccentCount('legendary') === 3, '神品必须 3 件品质光', dollAccentCount('legendary'));
const mono = ['common', 'magic', 'rare', 'unique', 'set', 'legendary'].map(r => dollAccentCount(r));
for (let i = 1; i < mono.length; i++) {
  ok(mono[i] >= mono[i - 1], '品质光的件数必须单调不减（' + mono.join(' → ') + '）', mono);
}

/* 七个防具槽在凡品下**一件 accent 都没有**，神品下正好 3 件 */
const armorSlots = ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt'];
const accBad = [];
for (const slot of armorSlots) {
  for (const fam of ['A', 'B', 'C']) {
    const low = dollQualityParts(slot, fam, 2, dollAccentCount('common'));
    const high = dollQualityParts(slot, fam, 2, dollAccentCount('legendary'));
    const n0 = low.filter(p => p.m === 'accent').length;
    const n3 = high.filter(p => p.m === 'accent').length;
    if (n0 !== 0) accBad.push(slot + '.' + fam + ' 凡品 ' + n0);
    if (n3 < 3) accBad.push(slot + '.' + fam + ' 神品 ' + n3);
  }
}
ok(accBad.length === 0, '七槽在凡品下 0 件、神品下 ≥3 件品质光', accBad);

/* 光效族（fate / ring）**不许**被品质光改写 ——
 * 它们的 accent 件是造型本体（符纹环 / 命盘 / 戒指光点），
 * 按品质增减就是「凡品命格没有符纹环」。
 * `relic` 不在此列：它三族里只有 A / C 带 accent（浮珠的 spark、铃铎的 clap），
 * B 族的符板一件都没有 —— 那正好该由品质光来点亮。 */
const fxBad = [];
for (const slot of ['fate', 'ring']) {
  for (const fam of ['A', 'B', 'C']) {
    const a = dollQualityParts(slot, fam, 2, 0);
    const b = dollQualityParts(slot, fam, 2, 3);
    if (a.length !== b.length) fxBad.push(slot + '.' + fam + ' 件数变了');
    for (let i = 0; i < a.length; i++) if (a[i].m !== b[i].m) { fxBad.push(slot + '.' + fam + ' 材质变了'); break; }
  }
}
ok(fxBad.length === 0, '光效族不许被品质光改写', fxBad);

/* 反向断言：dollQualityParts 不许改动原表（元素是共享的） */
const orig = dollPartsOf('helm', 'A', 2);
const before = orig.map(p => p.m).join(',');
dollQualityParts('helm', 'A', 2, 3);
const after = dollPartsOf('helm', 'A', 2).map(p => p.m).join(',');
ok(before === after, 'dollQualityParts 污染了原始零件表（元素共享，必须复制）',
  { before, after });

/* ============================================================
 * 六、签名件与品质光能共存
 * ============================================================ */
console.log('\n=== 6. 签名件 + 品质光 ===');
const both = dollQualityParts('helm', 'C', 2, 3, 'jiuxiao_crown');
const sigIds = both.filter(p => /\$s$/.test(p.i)).map(p => p.i);
const accN = both.filter(p => p.m === 'accent').length;
ok(sigIds.length > 0, '九霄冠的签名件必须在（C 族 + B 族双角 + C 族双翼）', sigIds);
ok(accN >= 3, '签名件之上还要有品质光', accN);

/* ============================================================
 * 七、签名件不许改武器长度
 * ============================================================ */
console.log('\n=== 7. 长度契约 ===');
const lenBad = [];
for (const u of UNIQUE_ITEMS) {
  if (u.slot !== 'weapon' && u.slot !== 'offhand') continue;
  const sg = dollSig(u.id);
  if (!sg) continue;
  const shape = u.shape || (u.slot === 'offhand' ? 'shield' : 'sword');
  const rig = DOLL_WEAPON_RIG[shape];
  if (!rig || !(rig.len > 0)) lenBad.push(u.id + ' 没有 len');
}
ok(lenBad.length === 0, '武器形制必须都有 len（长度是契约，签名不许碰）', lenBad);

/* ============================================================
 * 八、源码反向断言
 * ============================================================ */
console.log('\n=== 8. 源码反向断言 ===');
const srcDoll = fs.readFileSync(path.join(ROOT, 'src/doll.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const srcData = fs.readFileSync(path.join(ROOT, 'src/data/data-doll.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/dollQualityParts/.test(srcDoll), 'doll.js 必须走 dollQualityParts（否则品质光不生效）');
ok(/dollSigParts/.test(srcData), 'data-doll 必须有 dollSigParts');
ok(!/len\s*[:=]\s*sg\./.test(srcDoll), 'doll.js 不许把签名长度写进形制');

console.log('\n----------------------------------------');
console.log((fail === 0 ? '✓ 全部通过：' : '✗ 有失败：') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
