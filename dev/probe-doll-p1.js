#!/usr/bin/env node
/* ============================================================
 * [equip-doll P1] 五个槽位换成模组几何 · 真机验收
 *
 *   node dev/probe-doll-p1.js
 *
 * test-doll 判的是「数据表自洽」（族数 / 字段 / 剪影 IoU）；
 * 这一份判的是**装上去之后画面上真的换了东西**。
 *
 * 量七件事：
 *   一、五槽逐槽装上：对应挂点真的多出 Doll 造的 mesh
 *   二、同槽三族：几何真的不一样（顶点数 + 包围盒宽度）
 *   三、换装 10 次不叠加（挂点 child 数恒定）
 *   四、披风读 `eq.cloak` —— 换胸甲不许动披风（P1 修的就是这个 bug）
 *   五、护手不染手（handMat 颜色恒定）
 *   六、装备靴/护手时骨架自带那双隐藏，脱掉立刻还回来
 *   七、换装不泄漏：geometry 计数不随换装次数线性上涨
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

/* 页面里用的公共小工具：装一件指定槽位的装备并立即重绘 */
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
window.__bbox = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return null;
  const b = new THREE.Box3().setFromObject(g);
  if (!isFinite(b.min.x)) return null;
  return { w: +(b.max.x - b.min.x).toFixed(4), h: +(b.max.y - b.min.y).toFixed(4), d: +(b.max.z - b.min.z).toFixed(4) };
};
window.__verts = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return 0;
  let n = 0;
  g.traverse(o => { if (o.isMesh && o.geometry) n += o.geometry.attributes.position.count; });
  return n;
};
window.__dollOwned = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return 0;
  let n = 0;
  g.traverse(o => { if (o.isMesh && o.userData && o.userData.doll) n++; });
  return n;
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
    Game.startNew('warrior', 'P1');
    Game.state.level = 30; Game.recalc();
  }, HELP);
  await wait(300);

  /* ---------- 一、五槽逐槽装上 ---------- */
  console.log('一、五槽逐槽装上');
  const SLOT_ANCHOR = {
    helm: ['helmG'],
    shoulders: ['shoulderL', 'shoulderR'],
    cloak: ['capeG'],
    gloves: ['gloveL', 'gloveR'],
    boots: ['bootL', 'bootR']
  };
  const base = await page.evaluate((m) => {
    const o = {};
    for (const s in m) for (const a of m[s]) o[a] = window.__kids(a);
    return o;
  }, SLOT_ANCHOR);
  for (const a in base) ok(base[a] === 0, '（前置）' + a + ' 开始时必须是空槽', base[a]);

  for (const slot of Object.keys(SLOT_ANCHOR)) {
    const r = await page.evaluate((slot, anchors) => {
      const it = window.__mk(slot, 30, 0, 'rare');
      window.__wear(slot, it);
      const out = {};
      for (const a of anchors) out[a] = { kids: window.__kids(a), owned: window.__dollOwned(a), verts: window.__verts(a) };
      return { name: it.name, slot: it.slot, baseVar: it.baseVar, out: out };
    }, slot, SLOT_ANCHOR[slot]);
    for (const a of SLOT_ANCHOR[slot]) {
      ok(r.out[a].kids === 1, slot + ' 装上后 ' + a + ' 必须正好 1 个 mesh', r.out[a].kids);
      ok(r.out[a].owned === 1, slot + ' 的 mesh 必须带 userData.doll（证明是 Doll 造的，不是老手写几何）', r.out[a].owned);
      ok(r.out[a].verts > 12, slot + ' 的几何不许是空壳', r.out[a].verts);
    }
  }

  /* ---------- 二、同槽三族几何不同 ---------- */
  console.log('二、同槽三族几何不同');
  for (const slot of Object.keys(SLOT_ANCHOR)) {
    const anchors = SLOT_ANCHOR[slot];
    const v = [];
    const w = [];
    for (const fam of [0, 1, 2]) {
      const r = await page.evaluate((slot, fam, a0) => {
        const it = window.__mk(slot, 30, fam, 'rare');
        window.__wear(slot, it);
        return { v: window.__verts(a0), b: window.__bbox(a0), fam: it.baseVar };
      }, slot, fam, anchors[0]);
      v.push(r.v); w.push(r.b ? r.b.w : 0);
    }
    ok(new Set(v).size === 3, slot + ' 三族顶点数必须互不相同（相同就是同一份几何换了个名字）', v);
    const wmin = Math.min.apply(null, w), wmax = Math.max.apply(null, w);
    ok(wmax > 0 && (wmax - wmin) / wmax > 0.04,
      slot + ' 三族包围盒宽度差必须 > 4%（铁律一：3 米层看不出差别等于没做）',
      { w: w, spread: +((wmax - wmin) / wmax).toFixed(3) });
  }

  /* ---------- 三、换装 10 次不叠加 ---------- */
  console.log('三、换装 10 次不叠加');
  for (const slot of Object.keys(SLOT_ANCHOR)) {
    const r = await page.evaluate((slot, anchors) => {
      const seen = [];
      for (let i = 0; i < 10; i++) {
        window.__wear(slot, window.__mk(slot, 5 + i * 5, i % 3, i % 2 ? 'rare' : 'legendary'));
        seen.push(window.__kids(anchors[0]));
      }
      return seen;
    }, slot, SLOT_ANCHOR[slot]);
    ok(r.every(n => n === 1), slot + ' 换装 10 次后挂点仍必须只有 1 个 mesh（否则每次重绘都叠一层）', r);
  }

  /* ---------- 四、披风读 eq.cloak ---------- */
  console.log('四、披风读 eq.cloak');
  const cloak = await page.evaluate(() => {
    /* 先把披风脱光，确认空 */
    window.__wear('cloak', null);
    const empty = window.__kids('capeG');
    /* 只装胸甲：披风挂点必须还是 0 —— 老代码这里会冒出一件「胸甲披风」 */
    window.__wear('chest', window.__mk('chest', 40, 0, 'legendary'));
    const afterChest = window.__kids('capeG');
    /* 再装真披风：必须有 */
    window.__wear('cloak', window.__mk('cloak', 40, 1, 'legendary'));
    const afterCloak = window.__kids('capeG');
    const owned = window.__dollOwned('capeG');
    /* 换胸甲不许动披风 */
    window.__wear('chest', window.__mk('chest', 55, 2, 'unique'));
    const afterChest2 = window.__kids('capeG');
    const owned2 = window.__dollOwned('capeG');
    return { empty: empty, afterChest: afterChest, afterCloak: afterCloak, owned: owned,
      afterChest2: afterChest2, owned2: owned2 };
  });
  ok(cloak.empty === 0, '（前置）脱掉披风后 capeG 必须为空', cloak.empty);
  ok(cloak.afterChest === 0, '只装胸甲不许长出披风（老代码拿 eq.chest 当披风）', cloak.afterChest);
  ok(cloak.afterCloak === 1, '装上真披风后 capeG 必须有 1 个 mesh', cloak.afterCloak);
  ok(cloak.owned === 1, '披风必须是 Doll 造的', cloak.owned);
  ok(cloak.afterChest2 === 1 && cloak.owned2 === 1, '换胸甲不许动披风（挂点与来源都不变）', cloak);

  /* ---------- 五、护手不染手 ---------- */
  console.log('五、护手不染手');
  const hand = await page.evaluate(() => {
    window.__wear('gloves', null);
    const before = Game.actor.parts.handMat.color.getHex();
    window.__wear('gloves', window.__mk('gloves', 45, 1, 'unique'));
    const after = Game.actor.parts.handMat.color.getHex();
    const emis = Game.actor.parts.handMat.emissive.getHex();
    const worn = window.__kids('gloveL');
    window.__wear('gloves', null);
    const off = Game.actor.parts.handMat.color.getHex();
    return { before: before, after: after, emis: emis, worn: worn, off: off };
  });
  ok(hand.after === hand.before, '装护手不许改 handMat 颜色（那是手，不是手套）', hand);
  ok(hand.emis === 0, '装护手不许给 handMat 加自发光', hand.emis);
  ok(hand.worn === 1, '（前置）护手必须真的装上了', hand.worn);
  ok(hand.off === hand.before, '脱掉护手后 handMat 颜色不变（说明从头到尾没染过）', hand.off);

  /* ---------- 六、自带靴/护腕让位 ---------- */
  console.log('六、自带靴/护腕让位');
  const hide = await page.evaluate(() => {
    const r = {};
    window.__wear('boots', null);
    r.bootBaseOff = Game.actor.parts.bootBaseL.visible;
    window.__wear('boots', window.__mk('boots', 35, 2, 'rare'));
    r.bootBaseOn = Game.actor.parts.bootBaseL.visible;
    r.bootBaseOnR = Game.actor.parts.bootBaseR.visible;
    r.bootGear = window.__kids('bootL');
    window.__wear('boots', null);
    r.bootBaseBack = Game.actor.parts.bootBaseL.visible;

    window.__wear('gloves', null);
    r.wristOff = Game.actor.parts.wristBaseL.visible;
    window.__wear('gloves', window.__mk('gloves', 35, 0, 'rare'));
    r.wristOn = Game.actor.parts.wristBaseL.visible;
    r.wristOnR = Game.actor.parts.wristBaseR.visible;
    window.__wear('gloves', null);
    r.wristBack = Game.actor.parts.wristBaseL.visible;
    return r;
  });
  ok(hide.bootBaseOff === true, '（前置）没穿靴子时自带靴必须可见', hide.bootBaseOff);
  ok(hide.bootBaseOn === false && hide.bootBaseOnR === false, '穿上装备靴后自带靴必须整双隐藏（否则两双靴筒叠在一起）', hide);
  ok(hide.bootGear === 1, '（前置）装备靴必须真的装上了', hide.bootGear);
  ok(hide.bootBaseBack === true, '脱掉装备靴后自带靴必须还回来', hide.bootBaseBack);
  ok(hide.wristOff === true, '（前置）没戴护手时自带护腕必须可见', hide.wristOff);
  ok(hide.wristOn === false && hide.wristOnR === false, '戴上护手后自带护腕必须隐藏', hide);
  ok(hide.wristBack === true, '脱掉护手后自带护腕必须还回来', hide.wristBack);

  /* ---------- 七、换装不泄漏 ---------- */
  console.log('七、换装不泄漏');
  const leak = await page.evaluate(() => {
    const R = Game.renderer;
    const slots = ['helm', 'shoulders', 'cloak', 'gloves', 'boots'];
    /* 先热身 20 轮把缓存填满（缓存上限 128，前几轮必然 miss） */
    for (let i = 0; i < 20; i++) for (const s of slots) window.__wear(s, window.__mk(s, 5 + i, i % 3, 'rare'));
    const g0 = R.info.memory.geometries, t0 = R.info.memory.textures;
    for (let i = 0; i < 40; i++) for (const s of slots) window.__wear(s, window.__mk(s, 5 + (i % 20), i % 3, 'rare'));
    const g1 = R.info.memory.geometries, t1 = R.info.memory.textures;
    return { g0: g0, g1: g1, t0: t0, t1: t1, cache: Doll.stats() };
  });
  ok(leak.g1 <= leak.g0 + 8,
    '换装 200 次后 geometry 计数不许线性上涨（有界即可：缓存上限 128 × 每件 ≤2 份几何）',
    { before: leak.g0, after: leak.g1 });
  ok(leak.t1 <= leak.t0 + 4, '换装不许涨 texture 计数', { before: leak.t0, after: leak.t1 });
  ok(leak.cache.cache <= 128, '模组缓存不许超过上限 128', leak.cache.cache);

  /* ---------- 八、几何预算 ---------- */
  console.log('八、几何预算');
  const budget = await page.evaluate(() => {
    const slots = ['helm', 'shoulders', 'cloak', 'gloves', 'boots'];
    for (const s of slots) window.__wear(s, null);
    Game.renderer.render(Game.scene, Game.camera);
    const bare = Game.renderer.info.render.triangles;
    for (const s of slots) window.__wear(s, window.__mk(s, 40, 1, 'rare'));
    Game.renderer.render(Game.scene, Game.camera);
    const full = Game.renderer.info.render.triangles;
    /* 顺带记一笔「换装」的本质：新挂 8 个 mesh、同时藏掉 8 个自带 mesh
     * （靴筒/靴底/铜扣 ×2 + 护腕 ×2），所以总 mesh 数涨 8 而**可见数不变**。 */
    let n = 0, vis = 0;
    Game.actor.group.traverse(o => { if (o.isMesh) { n++; if (o.visible && o.parent && o.parent.visible) vis++; } });
    return { bare: bare, full: full, delta: full - bare, meshAll: n, meshVis: vis };
  });
  /* 为什么不用 draw call：`renderer.info.render.calls` 被 shadow map pass 一起算，
   * 实测装备前后恒为 281（装备的 color draw 与自带件的 shadow draw 互相抵消）。
   * triangles 只随真的画出来的东西变，是这里唯一可信的量。 */
  ok(budget.delta > 300, '五槽全装必须真的多画三角形（多 0 就是没画出来）', budget);
  ok(budget.delta < 4000, '五槽全装不许超过 4000 三角形（合并后一件装备 ≤ 800）', budget);

  /* ---------- 九、零报错 ---------- */
  console.log('九、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  equip-doll P1 真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
