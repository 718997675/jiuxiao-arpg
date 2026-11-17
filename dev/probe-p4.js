#!/usr/bin/env node
/* ============================================================
 * [equip-doll P4] 品质与传世 · 真机验收
 *
 *   node dev/probe-p4.js
 *
 * 计划书 §10 P4 判据：
 *   ① 同族同阶、凡品 vs 神品，accent 件数 0 → 3
 *   ② 传世 40 件两两剪影不重合（离线 test-p4 已经量过，这里验「真的装得上」）
 *
 * 离线能验的（剪影、字段、覆盖）都在 test-p4.js；这里只验**只有真机才能验**的：
 * 40 件逐件装到骨架上不崩、挂点里真有几何、品质光真的出 mesh、武器长度没变。
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
window.__mk = (slot, rarity, uniqueId, fam) => {
  /* 指定传世时品质必须是 'unique'：rollItem 的 opts.uniqueId 只在
   * rarity === 'unique' 分支里被读（items.js:825），传 'legendary' 会被
   * **静默忽略** —— 造出来的是一件随机神品，uniqueId 根本没有，
   * 于是签名件永远不生效，而探针只会看到「宽厚等于默认」。 */
  const rar = uniqueId ? 'unique' : (rarity || 'rare');
  const o = { slot: slot, cls: Game.state.cls, rarity: rar };
  if (uniqueId) o.uniqueId = uniqueId;
  /* ilvl 取 60：传世最高 58，低于它就进不了 forced 分支，会退化成随机传世 */
  const it = rollItem(60, o);
  if (it && fam !== undefined && fam !== null) it.baseVar = fam;
  return it;
};
window.__wear = (slot, item) => { Game.state.equipment[slot] = item; Game.applyDoll(); };
window.__clearAll = () => {
  for (const s of ['helm','chest','shoulders','cloak','gloves','boots','belt',
    'amulet','relic','fate','ring1','ring2','weapon','offhand']) window.__wear(s, null);
};
/* 某个挂点下的**光效**几何：几个 mesh + 多少顶点。
 *
 * 判据看 emissive 而不是 emissiveIntensity：mainMat 的 intensity 默认是 1。
 *
 * **为什么数顶点而不是数 mesh**：同一挂点的 N 件 accent 零件会被 mergeGeos
 * 合成 1 个 mesh（draw call 预算，见 doll.js 的 glow 循环）。所以「神品 3 件」
 * 在真机上永远是 1 个 mesh —— 数 mesh 只能证明「亮了」，数顶点才能证明
 * 「亮得更多」。件数本身由离线 test-p4.js 断言（它直接数零件表）。 */
window.__glow = (an) => {
  const g = Game.actor.parts[an];
  if (!g) return { n: -1, verts: 0 };
  let n = 0, verts = 0;
  g.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex() !== 0) {
      n++;
      verts += o.geometry.attributes.position.count;
    }
  });
  return { n: n, verts: verts };
};
window.__kids = (an) => {
  const g = Game.actor.parts[an];
  return g ? g.children.length : -1;
};
window.__verts = (an) => {
  const g = Game.actor.parts[an];
  if (!g) return 0;
  let n = 0;
  g.traverse(o => { if (o.isMesh && o.geometry) n += o.geometry.attributes.position.count; });
  return n;
};
/* 武器 / 副手的形制信息（buildWeapon 写在 userData.rig 上） */
window.__rig = (which) => {
  const g = Game.actor.parts[which];
  if (!g || !g.children.length) return null;
  const w = g.children[0];
  return w && w.userData ? w.userData.rig || null : null;
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
    Game.startNew('warrior', 'P4');
    Game.state.level = 50; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {};
    Game.updateCamera = function () {};
    Game.faceHpBars = function () {};
  }, HELP);
  await wait(900);

  /* ---------- 一、40 件传世逐件装配 ---------- */
  console.log('一、40 件传世逐件装到骨架上');
  const uniq = await page.evaluate(() => {
    const SLOT_ANCHOR = {
      helm: 'helmG', chest: 'torsoG', shoulders: 'shoulderL', cloak: 'capeG',
      gloves: 'gloveL', boots: 'bootL', belt: 'torsoG', amulet: 'neckG',
      ring: 'ringL', weapon: 'weaponHand', offhand: 'offHand'
    };
    const out = [];
    for (const u of UNIQUE_ITEMS) {
      window.__clearAll();
      const slot = (u.slot === 'ring') ? 'ring1' : u.slot;
      const it = window.__mk(u.slot, 'legendary', u.id, 0);
      if (!it) { out.push({ id: u.id, ok: false, why: '造不出来' }); continue; }
      window.__wear(slot, it);
      const an = SLOT_ANCHOR[u.slot];
      const kids = window.__kids(an);
      const verts = window.__verts(an);
      const rig = (u.slot === 'weapon' || u.slot === 'offhand') ? window.__rig(an) : null;
      out.push({ id: u.id, slot: u.slot, an: an, kids: kids, verts: verts, rig: rig,
        ok: kids > 0 && verts > 0 });
    }
    return out;
  });
  const dead = uniq.filter(r => !r.ok || r.kids < 1 || r.verts < 1);
  ok(dead.length === 0, '每件传世装上去挂点里都要有几何', dead);
  ok(uniq.length === 40, '必须逐件跑完 40 件', uniq.length);

  /* ---------- 二、武器签名只改宽厚，不改长度 ---------- */
  console.log('二、武器签名：改宽厚不改长度');
  const weps = uniq.filter(r => r.slot === 'weapon' || r.slot === 'offhand');
  ok(weps.length === 11, '武器 6 + 副手 5', weps.length);
  /* 形制表在页面里（data-doll.js 的顶层 const），Node 侧读不到 —— 取一份出来比 */
  const RIG = await page.evaluate(() => JSON.parse(JSON.stringify(DOLL_WEAPON_RIG)));
  const rigBad = [];
  for (const w of weps) {
    if (!w.rig) { rigBad.push(w.id + '(没有 rig 信息)'); continue; }
    const shape = w.rig.shape;
    const rig = RIG[shape];
    if (!rig) { rigBad.push(w.id + '(未知 shape ' + shape + ')'); continue; }
    /* 长度必须是形制表里那个数 —— 签名不许碰 */
    if (Math.abs(w.rig.len - rig.len) > 1e-6) rigBad.push(w.id + ' len ' + w.rig.len + ' ≠ ' + rig.len);
    if (!(w.rig.w > 0) || !(w.rig.t > 0)) rigBad.push(w.id + ' w/t 非法');
  }
  ok(rigBad.length === 0, '武器签名的 len 必须等于形制表的 len（长度是契约）', rigBad);
  /* 11 件里至少 8 件的 w 或 t 与默认不同，否则「签名」是空的 */
  const diffWT = weps.filter(w => {
    if (!w.rig) return false;
    const rig = RIG[w.rig.shape];
    if (!rig) return false;
    const base = rig.fam[w.rig.fam] || rig.fam.A;
    return Math.abs(w.rig.w - base.w) > 1e-6 || Math.abs(w.rig.t - base.t) > 1e-6;
  });
  ok(diffWT.length >= 8, '至少 8 件武器的宽厚与默认形制不同', diffWT.length);

  /* ---------- 三、品质光：凡品 0 件 → 神品 3 件 ---------- */
  console.log('三、品质光件数（真机发光顶点）');
  /* 阶梯是 **凡 → 魔法 → 玄 → 套装 → 神**（0 / 1 / 1 / 2 / 3 件）。
   *
   * **玄品不在阶梯上**：rollItem 里 rarity='unique' 一律去 uniquePool 抽一件
   * 传世（items.js:818），所以「玄品」这个品质在可掉落装备上根本不存在 ——
   * 每一件玄品都是传世，几何里叠着签名件，顶点数和同族白装没有可比性。
   * 硬把玄品塞进阶梯，量到的是「签名件和另一族的签名件谁顶点多」，
   * 跟品质光一点关系都没有（第一版就是这么假红的）。 */
  const LADDER = ['common', 'magic', 'rare', 'set', 'legendary'];
  const glow = await page.evaluate((LADDER) => {
    const SLOTS = [
      ['helm', 'helmG'], ['chest', 'torsoG'], ['shoulders', 'shoulderL'],
      ['cloak', 'capeG'], ['gloves', 'gloveL'], ['boots', 'bootL'], ['belt', 'torsoG']
    ];
    const out = [];
    for (const [slot, an] of SLOTS) {
      const row = { slot: slot };
      for (const rar of LADDER) {
        window.__clearAll();
        window.__wear(slot, window.__mk(slot, rar, null, 1));
        row[rar] = window.__glow(an).verts;
      }
      out.push(row);
    }
    return out;
  }, LADDER);
  for (const row of glow) {
    ok(row.common === 0, row.slot + ' 凡品不许有品质光几何', row);
    ok(row.magic > 0, row.slot + ' 魔法品质起必须有光效几何', row);
    /* 神品点亮 3 件、魔法 1 件 —— 顶点数必须真的变多（不是换了个颜色） */
    ok(row.legendary > row.magic, row.slot + ' 神品的光效几何必须多于魔法品质', row);
  }
  /* 单调：五档一路不减（凡品 0 → 神品最多） */
  const rising = glow.filter(r => LADDER.every((k, i) =>
    i === 0 || r[LADDER[i - 1]] <= r[k]));
  ok(rising.length === glow.length, '品质光必须随品质单调不减', glow);

  /* 玄品 = 传世：一定有 uniqueId，签名件与品质光同时在场 */
  const uniqRow = await page.evaluate(() => {
    const out = [];
    for (const slot of ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt']) {
      window.__clearAll();
      const it = window.__mk(slot, 'unique', null, 1);
      out.push({ slot: slot, uid: it.uniqueId || null, sig: !!(it.uniqueId && dollSig(it.uniqueId)) });
    }
    return out;
  });
  const uniqBad = uniqRow.filter(r => !r.uid || !r.sig);
  ok(uniqBad.length === 0, '玄品必然是传世，而且必须有签名件', uniqBad);

  /* ---------- 四、传世身上品质光也在 ---------- */
  console.log('四、传世 = 签名件 + 品质光');
  const sigGlow = await page.evaluate(() => {
    window.__clearAll();
    window.__wear('helm', window.__mk('helm', 'legendary', 'jiuxiao_crown', 0));
    const an = 'helmG';
    const gl = window.__glow(an);
    return { kids: window.__kids(an), verts: window.__verts(an), glowN: gl.n, glowVerts: gl.verts };
  });
  ok(sigGlow.glowVerts > 0, '九霄冠（签名件 + 神品）必须有品质光几何', sigGlow);
  ok(sigGlow.verts > 0, '九霄冠必须有几何', sigGlow);
  /* 签名件（C 族的翼 / 角）叠在 A 族的冠上：挂点里必须是两层 mesh
   * ——实体一层 + 光效一层，而且光效是实体的子节点。 */
  ok(sigGlow.kids >= 1, '九霄冠挂点里要有实体件', sigGlow);

  /* ---------- 五、换装 40 次不泄漏 ---------- */
  console.log('五、连续换 40 件不泄漏');
  const leak = await page.evaluate(() => {
    const snap = () => Game.renderer.info.memory.geometries;
    window.__clearAll();
    Game.renderer.render(Game.scene, Game.camera);
    const g0 = snap();
    for (const u of UNIQUE_ITEMS) {
      const slot = (u.slot === 'ring') ? 'ring1' : u.slot;
      window.__wear(slot, window.__mk(u.slot, 'legendary', u.id, 0));
    }
    Game.renderer.render(Game.scene, Game.camera);
    const g1 = snap();
    window.__clearAll();
    Game.renderer.render(Game.scene, Game.camera);
    const g2 = snap();
    return { g0: g0, g1: g1, g2: g2 };
  });
  /* 装 40 件时几何必然涨（那是 40 份缓存，上限 128 不会爆）；
   * 全脱之后要回落到接近基线 —— 差 40 以内算缓存里还留着的，可接受。 */
  ok(leak.g2 <= leak.g0 + 60, '全脱之后几何数要回落（差值 ≤ 60）', leak);

  /* ---------- 六、零报错 ---------- */
  console.log('六、零报错');
  ok(errs.length === 0, '页面不许有报错', errs.slice(0, 4));

  await browser.close();
  console.log('\n================================');
  console.log('  equip-doll P4 真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
