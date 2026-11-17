#!/usr/bin/env node
/* ============================================================
 * [equip-doll P3] 首饰与法器 · 真机验收
 *
 *   node dev/probe-doll-p3.js
 *
 * 四槽：amulet（项链）/ relic（法器）/ ring1 + ring2（两枚戒指）/ fate（命格）。
 *
 * 计划书 §10 给 P3 的两条硬验收：
 *   ① 14/14 槽有表现
 *   ② 法器 / 命格有各自的静态或缓慢动画，不增 update 开销 > 0.2ms
 *
 * ② 在这一节的实现里是「零开销」：P3 只做静态件，一行 update 代码都没加，
 * 所以量的是「装四槽前后 update 耗时不变」。真要动画是 P4 之后的事。
 *
 * 这一节最容易错的三件事（都在下面钉死）：
 *   · 项链挂错挂点 → 一圈环挂在胯上（数据 anchor 原来写的 torsoG）
 *   · 戒指镜像没关 → 一枚戒指同时出现在两只手上
 *   · 两枚戒指共用缓存 → 左手戴上右手的戒指（几何镜像了，位置没镜像）
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

const HELP = `
window.__mk = function (slot, ilvl, fam, rarity) {
  const it = rollItem(ilvl, { slot: slot, cls: Game.state.cls, rarity: rarity || 'rare' });
  if (!it) return null;
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
window.__verts = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return 0;
  let n = 0;
  g.traverse(o => { if (o.isMesh && o.geometry) n += o.geometry.attributes.position.count; });
  return n;
};
/* 某个挂点里那件装备的世界包围盒中心 */
window.__ctr = function (name) {
  const g = Game.actor.parts[name];
  if (!g || !g.children.length) return null;
  const b = new THREE.Box3().setFromObject(g);
  if (!isFinite(b.min.x)) return null;
  const c = new THREE.Vector3();
  b.getCenter(c);
  return { x: +c.x.toFixed(4), y: +c.y.toFixed(4), z: +c.z.toFixed(4),
           w: +(b.max.x - b.min.x).toFixed(4), h: +(b.max.y - b.min.y).toFixed(4) };
};
window.__geo = function (name) {
  const g = Game.actor.parts[name];
  if (!g || !g.children.length) return null;
  const m = [];
  g.traverse(o => { if (o.isMesh) m.push({ v: o.geometry.attributes.position.count, id: o.geometry.id }); });
  return m;
};
/* 角色移动后某个挂点的世界坐标 —— 验证「挂在骨架里」而不是场景根 */
/* 量位置前必须把角色**位置和朝向都归零**。
 * 不归零的话量到的是「世界坐标」：角色出生点 z=32.77、rotation.y=π
 * （模型 +z 面朝世界 -z），于是「项链在 8.47 米高」「左手戒指在 x>0」
 * 这类假失败会一起冒出来 —— 不是装配错了，是坐标系没对齐。 */
window.__zero = function () {
  const g = Game.playerGroup;
  g.position.set(0, 0, 0);
  g.rotation.y = 0;
  g.updateMatrixWorld(true);
  return true;
};
window.__wp = function (name) {
  const g = Game.actor.parts[name];
  if (!g) return null;
  const v = new THREE.Vector3();
  g.getWorldPosition(v);
  return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
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
    Game.startNew('warrior', 'P3');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {};
    Game.updateCamera = function () {};
    Game.faceHpBars = function () {};
  }, HELP);
  /* travelTo 是异步的（P2 踩过：角色会被挪到出生点 z=32.77），
   * 等它落定再开始量。 */
  await wait(900);

  /* ---------- 一、四槽都能造出来 ---------- */
  console.log('一、四槽都能造出来');
  const mk = await page.evaluate(() => {
    const out = {};
    for (const s of ['amulet', 'relic', 'ring1', 'ring2', 'fate']) {
      const it = window.__mk(s, 40, 0, 'rare');
      out[s] = it ? { slot: it.slot, name: it.name, rarity: it.rarity, ilvl: it.ilvl, baseVar: it.baseVar } : null;
    }
    return out;
  });
  for (const s of ['amulet', 'relic', 'ring1', 'ring2', 'fate']) {
    ok(!!mk[s], '（前置）rollItem 必须造得出 ' + s, mk[s]);
  }
  ok(mk.relic && mk.relic.slot === 'relic', '法器走的是 makeRelic（目录固定件）', mk.relic);

  /* ---------- 二、四槽挂上去，挂点里真的有东西 ---------- */
  console.log('二、四槽挂上（amulet / relic / fate / ring1+ring2）');
  const mount = await page.evaluate(() => {
    window.__zero();
    const slots = ['amulet', 'relic', 'fate', 'ring1', 'ring2'];
    for (const s of slots) window.__wear(s, null);
    const empty = {};
    for (const an of ['neckG', 'relicG', 'footG', 'ringL', 'ringR']) empty[an] = window.__kids(an);
    for (const s of slots) window.__wear(s, window.__mk(s, 40, 0, 'rare'));
    const full = {}, verts = {};
    for (const an of ['neckG', 'relicG', 'footG', 'ringL', 'ringR']) {
      full[an] = window.__kids(an);
      verts[an] = window.__verts(an);
    }
    return { empty: empty, full: full, verts: verts };
  });
  for (const an of ['neckG', 'relicG', 'footG', 'ringL', 'ringR']) {
    ok(mount.empty[an] === 0, '（前置）没装备时 ' + an + ' 必须是空的', mount.empty[an]);
    ok(mount.full[an] === 1, an + ' 装上一件后必须正好 1 个子节点（多了就是叠了两层）', mount.full[an]);
    ok(mount.verts[an] > 0, an + ' 必须有真实几何（顶点数 0 = 装配器静默失败）', mount.verts[an]);
  }
  /* ring1 只戴左手、ring2 只戴右手 —— 这是 P3 最容易错的一条 */
  ok(mount.full.ringL === 1 && mount.full.ringR === 1,
    '两枚戒指各占一只手（左 1 右 1）', { L: mount.full.ringL, R: mount.full.ringR });

  /* ---------- 三、项链在颈部，不在胯上 ---------- */
  console.log('三、项链挂的是颈部（不是 torsoG）');
  const neck = await page.evaluate(() => {
    window.__zero();
    const a = window.__ctr('neckG');
    /* 没装项链时量一次颈部本身的位置当参照 */
    const it = Game.state.equipment.amulet;
    window.__wear('amulet', null);
    const anchor = window.__wp('neckG');
    window.__wear('amulet', it);
    return { ctr: a, anchor: anchor, torso: window.__wp('torsoG') };
  });
  /* 颈环中心 y 应在 1.42~1.58（颈部圆柱在 1.505，环半径 0.08）。
   * 挂错到 torsoG 的话会落在 0.90 附近 —— 一眼能看出来。 */
  ok(neck.ctr && neck.ctr.y > 1.40 && neck.ctr.y < 1.60,
    '项链中心必须落在颈部高度（1.40~1.60），挂到 torsoG 就是一圈腰环', neck);
  ok(neck.anchor && Math.abs(neck.anchor[1] - 1.495) < 0.03,
    'neckG 挂点本身在 y≈1.495', neck.anchor);

  /* ---------- 三之二、法器不能埋在下摆里 ---------- */
  /* 下摆半径 0.290×build(1.06)=0.307，手臂在 x≈0.305 / z≈0。
   * 挂点落在「半径内」会被下摆吃掉，落在「手臂上」会被前臂挡住 ——
   * 两种都是**看不见但也不报错**，只能靠量离中轴的距离钉死。 */
  console.log('三之二、法器在下摆之外、手臂之后');
  const relicPos = await page.evaluate(() => {
    window.__zero();
    const out = [];
    for (let f = 0; f < 3; f++) {
      window.__wear('relic', window.__mk('relic', 40, f, 'rare'));
      const c = window.__ctr('relicG');
      out.push(c ? { f: f, r: +Math.hypot(c.x, c.z).toFixed(3), z: +c.z.toFixed(3), y: +c.y.toFixed(3) } : null);
    }
    return out;
  });
  for (const row of relicPos) {
    ok(row && row.r > 0.31, '法器第 ' + (row && row.f) + ' 族必须在下摆半径 0.307 之外（否则被下摆吞掉）', row);
    ok(row && row.z < -0.10, '法器必须在侧后方（z<-0.1），不然被自然下垂的前臂挡住', row);
  }

  /* ---------- 四、戒指左右分开（镜像真的关掉了） ---------- */
  console.log('四、戒指左右分开');
  const rings = await page.evaluate(() => {
    window.__zero();
    /* 两枚不同族：左 A 族、右 B 族，位置和顶点数都该不一样 */
    window.__wear('ring1', window.__mk('ring1', 40, 0, 'rare'));
    window.__wear('ring2', window.__mk('ring2', 40, 1, 'rare'));
    const L = window.__ctr('ringL'), R = window.__ctr('ringR');
    const Lv = window.__verts('ringL'), Rv = window.__verts('ringR');
    /* 同族同阶两枚：几何必须是**两份**（镜像各一份），不能共用同一份 */
    window.__wear('ring1', window.__mk('ring1', 40, 0, 'rare'));
    window.__wear('ring2', window.__mk('ring2', 40, 0, 'rare'));
    const same = { L: window.__geo('ringL'), R: window.__geo('ringR') };
    return { L: L, R: R, Lv: Lv, Rv: Rv, same: same };
  });
  ok(rings.L && rings.R, '两只手都量到戒指包围盒', rings);
  ok(rings.L && rings.R && rings.L.x < 0 && rings.R.x > 0,
    '左手戒指在 x<0、右手戒指在 x>0（同侧就是镜像没关）', { L: rings.L && rings.L.x, R: rings.R && rings.R.x });
  ok(rings.Lv !== rings.Rv, '左右两枚不同族时顶点数必须不同（A 族 1 点 vs B 族 2 件）',
    { L: rings.Lv, R: rings.Rv });
  /* 同族两枚：几何 id 必须不同。相同说明缓存 key 没带 side，
   * 结果就是「右手拿到了左手的镜像几何」—— 位置镜像了、形状没镜像。 */
  const sameIds = rings.same.L && rings.same.R && rings.same.L.length && rings.same.R.length
    ? { L: rings.same.L[0].id, R: rings.same.R[0].id } : null;
  ok(sameIds && sameIds.L !== sameIds.R,
    '同族两枚戒指必须是两份几何（缓存 key 必须带 side）', sameIds);

  /* ---------- 五、三族可辨（每槽 3 族顶点/位置都不同） ---------- */
  console.log('五、四槽三族都可辨');
  const fams = await page.evaluate(() => {
    window.__zero();
    const out = {};
    const probe = { amulet: 'neckG', relic: 'relicG', fate: 'footG', ring1: 'ringL' };
    for (const slot in probe) {
      const rows = [];
      for (let f = 0; f < 3; f++) {
        window.__wear(slot, window.__mk(slot, 40, f, 'rare'));
        rows.push({ v: window.__verts(probe[slot]), c: window.__ctr(probe[slot]) });
      }
      out[slot] = rows;
    }
    return out;
  });
  for (const slot of ['amulet', 'relic', 'fate', 'ring1']) {
    const rows = fams[slot];
    ok(rows.every(r => r.v > 0), slot + ' 三族都必须有几何', rows.map(r => r.v));
    const vs = rows.map(r => r.v);
    ok(new Set(vs).size === 3, slot + ' 三族顶点数必须互不相同（同数=同造型）', vs);
    /* 位置也要不同：只换顶点数不换位置，玩家看到的是「同一个东西多了几条边」 */
    const ys = rows.map(r => r.c && r.c.y);
    ok(new Set(ys).size >= 2, slot + ' 三族中心高度不能全一样', ys);
  }

  /* ---------- 五之二、实体件与光效件共存 ---------- */
  /* 一个挂点上可能同时有**实体件**（m='main'/'sub'/'trim'）和**光效件**
   * （m='accent'）—— 两者必须各是一个 mesh（emissive 是材质级，合不了）。
   * 第一版让光效覆盖实体：C 族戒指的两段短链（link / link2，72 顶点）
   * 直接不画，而且挂点里只有一个 mesh，看着完全正常。
   * ring C 族是唯一「同挂点同时有 trim 和 accent」的数据，拿它钉死。 */
  console.log('五之二、实体件与光效件共存');
  const dual = await page.evaluate(() => {
    window.__zero();
    window.__wear('ring1', window.__mk('ring1', 40, 2, 'rare'));   // C 族：p/p2 accent + link/link2 trim
    const g = Game.actor.parts.ringL;
    const meshes = [];
    g.traverse(o => { if (o.isMesh) meshes.push(o); });
    const k = dollKeyOf(Game.state.equipment.ring1);
    const list = dollPartsOf('ring', k.fam, k.lod);
    let verts = 0;
    g.traverse(o => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
    return { n: meshes.length, verts: verts, parts: list.map(x => x.i + ':' + x.m),
      /* 判据看 emissive 是不是非黑：`mainMat` 的 emissiveIntensity 默认是 1
       * （Three 的默认值），拿它判会把两个 mesh 都算成光效。 */
      accent: meshes.filter(o => o.material && o.material.emissive && o.material.emissive.getHex() !== 0).length };
  });
  ok(dual.n === 2, '同挂点的实体件与光效件必须是两个 mesh（覆盖 = 少画一半零件）', dual);
  ok(dual.accent === 1, '其中恰好一个是光效材质', dual);
  /* 4 件零件（2 sph + 2 box）的顶点全在：少任何一件都说明被覆盖 */
  ok(dual.verts > 200, 'C 族戒指的 4 件零件顶点必须全在（短链不能被吞）', dual);

  /* ---------- 六、换装不叠 ---------- */
  console.log('六、同槽换装 10 次不叠');
  const churn = await page.evaluate(() => {
    const slot = 'amulet', an = 'neckG';
    for (let i = 0; i < 10; i++) window.__wear(slot, window.__mk(slot, 30 + i, i % 3, 'rare'));
    return { kids: window.__kids(an), verts: window.__verts(an) };
  });
  ok(churn.kids === 1, '换 10 次装后挂点里仍只有 1 个子节点', churn);

  /* ---------- 七、脱掉清干净 ---------- */
  console.log('七、四槽全脱清干净');
  const off = await page.evaluate(() => {
    const before = { neckG: window.__verts('neckG'), relicG: window.__verts('relicG'),
      footG: window.__verts('footG'), ringL: window.__verts('ringL'), ringR: window.__verts('ringR') };
    for (const s of ['amulet', 'relic', 'fate', 'ring1', 'ring2']) window.__wear(s, null);
    const after = { neckG: window.__kids('neckG'), relicG: window.__kids('relicG'),
      footG: window.__kids('footG'), ringL: window.__kids('ringL'), ringR: window.__kids('ringR') };
    return { before: before, after: after };
  });
  for (const an of ['neckG', 'relicG', 'footG', 'ringL', 'ringR']) {
    ok(off.after[an] === 0, '脱掉后 ' + an + ' 必须清空（残留 = 摘的时候没摘）', off.after[an]);
  }

  /* ---------- 八、relic / fate 跟着角色走 ---------- */
  console.log('八、法器与命格跟人走');
  const follow = await page.evaluate(() => {
    window.__zero();
    window.__wear('relic', window.__mk('relic', 40, 0, 'rare'));
    window.__wear('fate', window.__mk('fate', 40, 0, 'rare'));
    const p0 = { relic: window.__wp('relicG'), fate: window.__wp('footG') };
    const g = Game.playerGroup;
    const o0 = g.position.clone();
    g.position.x += 2.5; g.position.z -= 1.5;
    g.updateMatrixWorld(true);
    const p1 = { relic: window.__wp('relicG'), fate: window.__wp('footG') };
    g.position.copy(o0);
    g.updateMatrixWorld(true);
    return { p0: p0, p1: p1 };
  });
  const dxR = follow.p1.relic[0] - follow.p0.relic[0];
  const dxF = follow.p1.fate[0] - follow.p0.fate[0];
  ok(Math.abs(dxR - 2.5) < 0.01, '角色横移 2.5，法器跟着横移 2.5（挂在骨架里，不是场景根）', { dxR });
  ok(Math.abs(dxF - 2.5) < 0.01, '命格跟着角色横移 2.5', { dxF });
  /* 命格三族形态差得远：A 脚下 / B 背后 / C 双肩。B 的 z 必须是负的（背后） */
  const fateShape = await page.evaluate(() => {
    window.__zero();
    const out = [];
    for (let f = 0; f < 3; f++) {
      window.__wear('fate', window.__mk('fate', 40, f, 'rare'));
      out.push(window.__ctr('footG'));
    }
    return out;
  });
  ok(fateShape[0] && fateShape[0].y < 0.3, '命格 A 族（符纹环）在脚下', fateShape[0]);
  ok(fateShape[1] && fateShape[1].z < -0.1, '命格 B 族（命盘）在背后', fateShape[1]);
  ok(fateShape[2] && fateShape[2].y > 1.3, '命格 C 族（命火）在肩高', fateShape[2]);

  /* ---------- 九、动画开销 ---------- */
  console.log('九、update 开销不增 0.2ms');
  const cost = await page.evaluate(() => {
    const origUpdate = Game.update;
    /* 装四槽 / 空身各跑 200 帧 update（用真实 update 会被我们冻住了，
     * 这里测的是**角色动画**那一层的开销：charforge.update 由 render 之外的
     * 主循环调，冻结期间不跑，所以直接量 Game.actor.update 的耗时） */
    const measure = () => {
      const t0 = performance.now();
      for (let i = 0; i < 300; i++) {
        if (Game.actor && Game.actor.update) Game.actor.update(0.016, { moving: true, moving2: true, atk: 0.3, cast: 0 });
      }
      return +(performance.now() - t0).toFixed(3);
    };
    for (const s of ['amulet', 'relic', 'fate', 'ring1', 'ring2']) window.__wear(s, null);
    const bare = measure();
    for (const s of ['amulet', 'relic', 'fate', 'ring1', 'ring2']) window.__wear(s, window.__mk(s, 40, 0, 'rare'));
    const full = measure();
    return { bare: bare, full: full, perFrame: +((full - bare) / 300).toFixed(4) };
  });
  /* 300 帧的总差除以 300 = 每帧增量。P3 没加一行 update 代码，
   * 这个数应该是 0 或者纯噪声（±0.02ms）。 */
  ok(Math.abs(cost.perFrame) < 0.2,
    '装四槽后每帧 update 增量必须 < 0.2ms', cost);

  /* ---------- 十、零报错 ---------- */
  console.log('十、零报错');
  ok(errs.length === 0, '页面不许有报错', errs.slice(0, 4));

  await browser.close();
  console.log('\n================================');
  console.log('  equip-doll P3 真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
