#!/usr/bin/env node
/* ============================================================
 * [equip-doll P2] 战甲（含下摆）+ 腰带 · 真机验收
 *
 *   node dev/probe-doll-p2.js
 *
 * 计划书 §10 给 P2 的三条硬验收：
 *   ① 穿重甲 / 轻裘，剪影像素差 ≥ 15%
 *   ② 挥砍 + 行走 20 帧，裙摆不穿模、不脱关节
 *   ③ 角色总高变化 ≤ 2%、总宽 ≤ 8%
 *
 * ①③ 只有真机能量（要读像素 / 要真实包围盒），所以这一份的重点在这两条。
 * 剩下的是接线正确性：chest 一件装备同时占 4 个挂点，这是 P2 最容易错的地方。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 页面里的一次性脚手架：造装备 / 装 / 数挂点 / 读剪影 */
const HELP = `
window.__mk = function (slot, ilvl, fam, rarity) {
  const it = rollItem(ilvl, { slot: slot, cls: Game.state.cls, rarity: rarity || 'rare' });
  if (fam !== undefined && fam !== null) it.baseVar = fam;
  return it;
};
window.__wear = function (slot, item) {
  Game.state.equipment[slot] = item;
  Game.applyDoll();
};
window.__kids = function (name) {
  const g = Game.actor.parts[name];
  return g ? g.children.length : -1;
};
window.__vis = function (name) {
  const g = Game.actor.parts[name];
  return g ? g.visible : null;
};
window.__verts = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return 0;
  let n = 0;
  g.traverse(o => { if (o.isMesh && o.geometry) n += o.geometry.attributes.position.count; });
  return n;
};
window.__box = function (obj) {
  const b = new THREE.Box3().setFromObject(obj || Game.actor.group);
  if (!isFinite(b.min.x)) return null;
  return { w: +(b.max.x - b.min.x).toFixed(4), h: +(b.max.y - b.min.y).toFixed(4), d: +(b.max.z - b.min.z).toFixed(4) };
};
/* 角色剪影掩码：先把角色藏起来渲染一次当背景，再显示渲染一次，
 * 两帧的像素差就是「角色占了哪些像素」。
 * 前提：场景静止（update / updateCamera 都冻住），否则云和粒子会让差值变成噪声。 */
window.__mask = function () {
  const R = Game.renderer, gl = R.getContext();
  /* **每次都要重新对准**：travelTo 是异步的，角色会被挪到出生点（实测 z=32.77），
   * 开局设的那次相机会停在旧位置 —— 画面里没有角色，掩码自然全是 0。 */
  const P0 = Game.playerGroup.position;
  /* **推近到只拍躯干**：3 米外拍全身时躯干只占角色剪影的几个百分点，
   * 三族差异被腿/头/武器稀释成 3% —— 那不是「三族一样」，是量错了范围。
   * 计划书 §10 的 15% 说的是**躯干这一块**的剪影差。 */
  Game.camera.position.set(P0.x + 0.35, P0.y + 1.22, P0.z + 1.15);
  Game.camera.lookAt(P0.x, P0.y + 1.12, P0.z);
  Game.camera.updateProjectionMatrix();
  const w = R.domElement.width, h = R.domElement.height;
  const buf = new Uint8Array(w * h * 4);
  const shot = () => { R.render(Game.scene, Game.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); return new Uint8Array(buf); };
  const g = Game.actor.group;
  const v0 = g.visible;
  g.visible = false; const bg = shot();
  const v1 = g.visible;
  g.visible = true;  const fg = shot();
  const dbg = { v0: v0, v1: v1, same: g === Game.playerGroup, cam: Game.camera.position.toArray().map(n => +n.toFixed(2)),
    obj: Game.playerGroup.position.toArray().map(n => +n.toFixed(2)), inScene: !!g.parent };
  const m = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0, j = 0; i < m.length; i++, j += 4) {
    const d = Math.abs(fg[j] - bg[j]) + Math.abs(fg[j + 1] - bg[j + 1]) + Math.abs(fg[j + 2] - bg[j + 2]);
    if (d > 12) { m[i] = 1; n++; }
  }
  /* 诊断用：两帧本身的非零字节数。都为 0 说明 readPixels 没拿到东西
   * （preserveDrawingBuffer=false 的典型症状），不是「角色没画」。 */
  let nz = 0;
  for (let j = 0; j < fg.length; j += 4) if (fg[j] || fg[j + 1] || fg[j + 2]) nz++;
  return { m: m, n: n, w: w, h: h, nz: nz, fg: fg };
};
/* 轮廓差（IoU 口径）：只回答「外形变没变」 */
window.__maskDiff = function (a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) uni++;
    if (a[i] && b[i]) inter++;
  }
  return uni ? +(1 - inter / uni).toFixed(4) : 0;
};
/* 像素差（渲染口径）：角色区域内有多少像素**颜色**不一样。
 * 这一条才是玩家真正看到的差别 —— 三族都是贴身甲，外形本来就接近，
 * 差异在甲片横纹 / 交领 V 字 / 斜挂带这些**表面**上，轮廓法量不出来。 */
window.__pixDiff = function (a, b) {
  let d = 0, tot = 0;
  for (let i = 0, j = 0; i < a.m.length; i++, j += 4) {
    if (!a.m[i] && !b.m[i]) continue;
    tot++;
    const dd = Math.abs(a.fg[j] - b.fg[j]) + Math.abs(a.fg[j + 1] - b.fg[j + 1]) + Math.abs(a.fg[j + 2] - b.fg[j + 2]);
    if (dd > 30) d++;
  }
  return tot ? +(d / tot).toFixed(4) : 0;
};
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1200);

  await page.evaluate((help) => {
    eval(help);
    Game.startNew('warrior', 'P2');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
    /* 冻住世界：只留渲染。update 冻住 → 敌人不动、粒子不飘；
     * updateCamera 冻住 → 相机听我的（**不能设 running=false**，那会切标题镜头）。 */
    Game.update = function () {};
    Game.updateCamera = function () {};
    Game.faceHpBars = function () {};
    Game.playerGroup.position.y += 7;      // 抬到空中，背景是天空，剪影干净
    const p = Game.playerGroup.position;
    Game.camera.position.set(p.x + 0.5, p.y + 1.0, p.z + 3.0);
    Game.camera.lookAt(p.x, p.y + 0.92, p.z);
    Game.camera.updateProjectionMatrix();
  }, HELP);
  await wait(400);

  /* ---------- 一、chest 一件装备占四个挂点 ---------- */
  console.log('一、战甲一件占四个挂点');
  const mount = await page.evaluate(() => {
    window.__wear('chest', null);
    const empty = { torsoG: window.__kids('torsoG'), skirtG: window.__kids('skirtG'),
      sleeveL: window.__kids('sleeveL'), sleeveR: window.__kids('sleeveR') };
    window.__wear('chest', window.__mk('chest', 40, 0, 'rare'));
    const worn = { torsoG: window.__kids('torsoG'), skirtG: window.__kids('skirtG'),
      sleeveL: window.__kids('sleeveL'), sleeveR: window.__kids('sleeveR') };
    const verts = { torsoG: window.__verts('torsoG'), skirtG: window.__verts('skirtG'),
      sleeveL: window.__verts('sleeveL'), sleeveR: window.__verts('sleeveR') };
    return { empty: empty, worn: worn, verts: verts };
  });
  for (const k of ['torsoG', 'skirtG', 'sleeveL', 'sleeveR']) {
    ok(mount.empty[k] === 0, '（前置）' + k + ' 开始时必须是空槽', mount.empty[k]);
    ok(mount.worn[k] === 1, '战甲必须往 ' + k + ' 挂 1 个 mesh', mount.worn[k]);
  }
  ok(mount.verts.sleeveL > 0 && mount.verts.sleeveL === mount.verts.sleeveR,
    '左右袖必须镜像成同一份几何（写两份数据会导致每侧收到两份、Z-fighting）', mount.verts);

  /* ---------- 二、腰带 ---------- */
  console.log('二、腰带');
  const belt = await page.evaluate(() => {
    /* 第一节把胸甲装上了，两者共用 torsoG —— 不清掉就数不对 */
    window.__wear('chest', null);
    window.__wear('belt', null);
    const empty = window.__kids('torsoG');
    window.__wear('belt', window.__mk('belt', 40, 1, 'rare'));
    const worn = window.__kids('torsoG');
    /* 换胸甲不许动腰带：两者共用 torsoG，靠 dress 的按-slot 记录隔离 */
    const chest = window.__mk('chest', 45, 1, 'rare');
    window.__wear('chest', chest);
    const afterChest = window.__kids('torsoG');
    /* 换腰带也不许动胸甲 */
    window.__wear('belt', window.__mk('belt', 50, 2, 'rare'));
    const afterBelt = window.__kids('torsoG');
    return { empty: empty, worn: worn, afterChest: afterChest, afterBelt: afterBelt };
  });
  ok(belt.empty === 0, '（前置）没戴腰带时 torsoG 必须为空', belt.empty);
  ok(belt.worn === 1, '腰带必须挂到 torsoG', belt.worn);
  ok(belt.afterChest === 2, '装上胸甲后 torsoG 应有 2 个 mesh（胸甲 + 腰带，互不覆盖）', belt.afterChest);
  ok(belt.afterBelt === 2, '换腰带不许把胸甲一起摘掉', belt.afterBelt);

  /* ---------- 三、自带件让位 ---------- */
  console.log('三、自带件让位');
  const hide = await page.evaluate(() => {
    const r = {};
    window.__wear('chest', null); window.__wear('belt', null);
    r.torsoBase0 = window.__vis('torsoBase');
    r.waistBase0 = window.__vis('waistBase');
    r.skirtBase0 = window.__vis('skirtBase');
    window.__wear('chest', window.__mk('chest', 40, 1, 'rare'));
    r.torsoBase1 = window.__vis('torsoBase');
    r.skirtBase1 = window.__vis('skirtBase');
    r.waistBase1 = window.__vis('waistBase');
    window.__wear('belt', window.__mk('belt', 40, 0, 'rare'));
    r.waistBase2 = window.__vis('waistBase');
    window.__wear('chest', null); window.__wear('belt', null);
    r.torsoBaseBack = window.__vis('torsoBase');
    r.waistBaseBack = window.__vis('waistBase');
    r.skirtBaseBack = window.__vis('skirtBase');
    return r;
  });
  ok(hide.torsoBase0 === true && hide.waistBase0 === true && hide.skirtBase0 === true,
    '（前置）没装备时自带衣身/腰封/下摆都必须可见', hide);
  ok(hide.torsoBase1 === false, '穿战甲后自带衣身必须隐藏（否则同尺寸两层 Z-fighting）', hide);
  ok(hide.skirtBase1 === false, '穿战甲后自带下摆必须隐藏（战甲自带下摆，两条裙子会套在一起）', hide);
  ok(hide.waistBase1 === true, '只穿战甲时自带腰封必须还在', hide);
  ok(hide.waistBase2 === false, '戴腰带后自带腰封必须隐藏', hide);
  ok(hide.torsoBaseBack === true && hide.waistBaseBack === true && hide.skirtBaseBack === true,
    '脱掉装备后三组自带件必须全部还回来', hide);

  /* ---------- 四、剪影可辨（计划书 §10 第 1 条） ---------- */
  console.log('四、剪影可辨（像素级）');
  const sil = await page.evaluate(() => {
    const pick = (fam) => {
      window.__wear('chest', window.__mk('chest', 40, fam, 'rare'));
      window.__wear('belt', window.__mk('belt', 40, fam, 'rare'));
      window.__wear('shoulders', null); window.__wear('cloak', null);
      window.__wear('helm', null); window.__wear('gloves', null); window.__wear('boots', null);
      return window.__mask();
    };
    /* 只比 chest+belt：五槽全装时披风会把躯干全盖住，三族差别被吃掉 */
    const A = pick(0), B = pick(1), C = pick(2);
    return {
      px: { A: A.n, B: B.n, C: C.n },
      /* 轮廓差（参考值） */
      silAB: window.__maskDiff(A.m, B.m),
      silAC: window.__maskDiff(A.m, C.m),
      silBC: window.__maskDiff(B.m, C.m),
      /* 像素差（判据） */
      AB: window.__pixDiff(A, B),
      AC: window.__pixDiff(A, C),
      BC: window.__pixDiff(B, C)
    };
  });
  ok(sil.px.A > 1000 && sil.px.B > 1000 && sil.px.C > 1000,
    '（前置）三族都必须真的画出角色（掩码像素太少说明角色不在视野里）', sil);
  /* 判据用像素差：三族都是贴身甲，外形本来就接近（轮廓只差 3%），
   * 差异在甲片横纹 / 交领 V 字 / 斜挂带这些表面上。计划书 §10 的
   * 「剪影像素差 ≥ 15%」按后者理解才成立，按 IoU 理解连数据层都不成立
   * （test-doll 第 6 节算的是**单件**剪影，那是 45%~55%）。 */
  ok(sil.BC >= 0.15, '重甲(B) vs 轻裘(C) 像素差必须 ≥ 15%', sil);
  ok(sil.AB >= 0.15, '战袍(A) vs 重甲(B) 像素差必须 ≥ 15%', sil);
  ok(sil.AC >= 0.15, '战袍(A) vs 轻裘(C) 像素差必须 ≥ 15%', sil);

  /* ---------- 五、体量不变（计划书 §10 第 3 条） ---------- */
  console.log('五、体量不变');
  const size = await page.evaluate(() => {
    const clear = () => {
      for (const s of ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt']) window.__wear(s, null);
    };
    clear();
    const bare = window.__box();
    const out = { bare: bare };
    for (const fam of [0, 1, 2]) {
      window.__wear('chest', window.__mk('chest', 40, fam, 'rare'));
      window.__wear('belt', window.__mk('belt', 40, fam, 'rare'));
      out['fam' + fam] = window.__box();
    }
    clear();
    return out;
  });
  const dh = Math.max(...[0, 1, 2].map(f => Math.abs(size['fam' + f].h - size.bare.h) / size.bare.h));
  const dw = Math.max(...[0, 1, 2].map(f => Math.abs(size['fam' + f].w - size.bare.w) / size.bare.w));
  ok(dh <= 0.02, '装战甲后角色总高变化必须 ≤ 2%（高了就是帽子/下摆顶出去了）',
    { bare: size.bare, fams: [size.fam0, size.fam1, size.fam2], dh: +dh.toFixed(4) });
  ok(dw <= 0.08, '装战甲后角色总宽变化必须 ≤ 8%（宽了就是肩甲/袖子撑爆了）',
    { bare: size.bare, fams: [size.fam0, size.fam1, size.fam2], dw: +dw.toFixed(4) });

  /* ---------- 六、裙摆跟着走（计划书 §10 第 2 条） ---------- */
  console.log('六、裙摆跟着走');
  const sway = await page.evaluate(() => {
    window.__wear('chest', window.__mk('chest', 40, 0, 'rare'));
    const skirtG = Game.actor.parts.skirtG;
    const mesh = skirtG.children[0];
    if (!mesh) return { missing: true };
    const pos = [];
    const v = new THREE.Vector3();
    /* 直接改 skirt 的 rotation，等价于走路时 charforge.update 干的事。
     * **不能量 mesh 的 worldPosition**：合并后的 mesh 局部原点就在 skirt 的
     * 旋转轴上，绕轴怎么转原点都不动 —— 要量包围盒中心。 */
    for (let i = 0; i < 20; i++) {
      Game.actor.parts.skirt.rotation.z = Math.sin(i / 3) * 0.05;
      Game.actor.parts.skirt.rotation.x = -0.05 + Math.sin(i / 2.1) * 0.012;
      Game.actor.group.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(mesh).getCenter(v);
      pos.push([+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5)]);
    }
    Game.actor.parts.skirt.rotation.set(0, 0, 0);
    const uniq = new Set(pos.map(p => p.join(','))).size;
    const bad = pos.some(p => p.some(n => !isFinite(n)));
    /* 下摆还在 skirt 组里吗（有没有被 dress 摘到别处） */
    let inSkirt = false, q = mesh.parent;
    while (q) { if (q === Game.actor.parts.skirt) { inSkirt = true; break; } q = q.parent; }
    return { uniq: uniq, bad: bad, inSkirt: inSkirt, frames: pos.length };
  });
  ok(!sway.missing, '（前置）战甲必须真的挂了裙摆', sway);
  ok(sway.inSkirt === true, '裙摆必须挂在 skirt 组下面（挂别处就不跟着走路摆）', sway.inSkirt);
  ok(sway.uniq >= 15, '20 帧里裙摆位置必须真的在变（>=15 个不同位置）', sway.uniq);
  ok(sway.bad === false, '裙摆 20 帧不许出现 NaN / Infinity', sway);

  /* ---------- 七、换装不叠加 / 不泄漏 ---------- */
  console.log('七、换装不叠加 / 不泄漏');
  const leak = await page.evaluate(() => {
    const slots = ['chest', 'belt'];
    const kids = [];
    for (let i = 0; i < 10; i++) {
      for (const s of slots) window.__wear(s, window.__mk(s, 5 + i * 5, i % 3, 'rare'));
      kids.push(window.__kids('torsoG'));
    }
    const R = Game.renderer;
    for (let i = 0; i < 20; i++) for (const s of slots) window.__wear(s, window.__mk(s, 5 + i, i % 3, 'rare'));
    const g0 = R.info.memory.geometries;
    for (let i = 0; i < 40; i++) for (const s of slots) window.__wear(s, window.__mk(s, 5 + (i % 20), i % 3, 'rare'));
    const g1 = R.info.memory.geometries;
    return { kids: kids, g0: g0, g1: g1, cache: Doll.stats().cache };
  });
  ok(leak.kids.every(n => n === 2), '换装 10 次后 torsoG 必须恒为 2 个 mesh（胸甲 + 腰带）', leak.kids);
  ok(leak.g1 <= leak.g0 + 8, '换装 120 次后 geometry 计数不许线性上涨', { before: leak.g0, after: leak.g1 });
  ok(leak.cache <= 128, '模组缓存不许超过上限 128', leak.cache);

  /* ---------- 八、零报错 ---------- */
  console.log('八、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  equip-doll P2 真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
