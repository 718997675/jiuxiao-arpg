#!/usr/bin/env node
/* ============================================================
 * [equip-doll P6] 回归 · 老档穷举 + 泄漏 + renderer 状态 · 真机
 *
 *   node dev/probe-p6.js
 *
 * 只验「离线验不了」的：
 *   一、384 件基底 × 真机装配不抛错（含老档里常见的空槽 / ring1+ring2）
 *   二、同一批配置换装 50 轮，geometries / textures 不涨（真泄漏）
 *   三、试衣间反复开合 30 轮不泄漏，且每次渲完 renderer 状态都还原
 *   四、全程只有一个 WebGL context
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.evaluateOnNewDocument(() => {
    window.__glCalls = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (/webgl/i.test(String(type))) window.__glCalls++;
      return orig.apply(this, arguments);
    };
  });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => {
    Game.startNew('warrior', 'P6');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
    Game.update = function () {}; Game.updateCamera = function () {}; Game.faceHpBars = function () {};
    window.__clearAll = () => {
      for (const s of ['helm','chest','shoulders','cloak','gloves','boots','belt',
        'amulet','relic','fate','ring1','ring2','weapon','offhand']) Game.state.equipment[s] = null;
      Game.applyDoll();
    };
  });
  await wait(900);

  /* ---------- 一、384 件基底穷举 ---------- */
  console.log('一、384 件基底穷举（真机装配不抛错）');
  const enumR = await page.evaluate(() => {
    let n = 0, bad = [];
    const testOne = (it, tag) => {
      try {
        const k = dollKeyOf(it);
        if (!k || ['A','B','C'].indexOf(k.fam) < 0) { bad.push(tag + ' key 空/族非法'); return; }
        /* 老档形态：真机装配。清掉再装，验证每件不抛 */
        window.__clearAll();
        Game.state.equipment[it.slot] = it;
        Game.applyDoll();
        n++;
      } catch (e) { bad.push(tag + ': ' + e.message); }
    };
    for (const slot in ARMOR_BASES) {
      for (let t = 0; t < ARMOR_BASES[slot].length; t++)
        for (let v = 0; v < ARMOR_BASES[slot][t].length; v++)
          testOne({ slot, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common', affixes: [] },
            slot + '/' + t + '/' + v);
    }
    for (const cls in WEAPON_BASES) {
      for (let t = 0; t < WEAPON_BASES[cls].length; t++)
        for (let v = 0; v < WEAPON_BASES[cls][t].length; v++)
          testOne({ slot: 'weapon', cls, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common', affixes: [] },
            'w:' + cls + '/' + t + '/' + v);
    }
    for (const cls in OFFHAND_BASES) {
      for (let t = 0; t < OFFHAND_BASES[cls].length; t++)
        for (let v = 0; v < OFFHAND_BASES[cls][t].length; v++)
          testOne({ slot: 'offhand', cls, baseTier: t, baseVar: v, ilvl: t * 5 + 1, rarity: 'common', affixes: [] },
            'oh:' + cls + '/' + t + '/' + v);
    }
    window.__clearAll();
    return { n, bad: bad.slice(0, 8), badN: bad.length };
  });
  console.log('  穷举 ' + enumR.n + ' 件，失败 ' + enumR.badN + (enumR.bad.length ? '：' + enumR.bad.join(' | ') : ''));
  ok(enumR.n >= 380, '基底总数偏少（应 384）', enumR.n);
  ok(enumR.badN === 0, '老档穷举装配抛错', enumR.bad);

  /* 老档特例：空 equipment、缺字段的戒指 */
  const legacy = await page.evaluate(() => {
    const out = {};
    try {
      Game.state.equipment = {};
      Game.applyDoll(); out.empty = 'ok';
    } catch (e) { out.empty = e.message; }
    try {
      Game.state.equipment = {
        ring1: { slot: 'ring', cls: 'warrior', baseVar: 0, baseTier: 2, rarity: 'rare', affixes: [] },
        ring2: { slot: 'ring', cls: 'warrior', baseVar: 2, baseTier: 3, rarity: 'rare', affixes: [] }
      };
      Game.applyDoll(); out.rings = 'ok';
    } catch (e) { out.rings = e.message; }
    window.__clearAll();
    return out;
  });
  ok(legacy.empty === 'ok' && legacy.rings === 'ok', '老档空装备 / 双戒指不能崩', legacy);

  /* ---------- 二、50 轮换装泄漏 ---------- */
  console.log('\n二、同批配置换装 50 轮（geometries / textures 不涨）');
  const leak = await page.evaluate(async () => {
    const sets = [
      { helm: 0, chest: 0, shoulders: 0, belt: 0, weapon: 0 },
      { helm: 1, chest: 1, shoulders: 1, belt: 1, weapon: 1 },
      { helm: 2, chest: 2, shoulders: 2, belt: 2, weapon: 2 }
    ];
    const apply = (set) => {
      window.__clearAll();
      for (const slot in set) {
        /* 每套固定 fam（baseVar）与 tier，避免随机缓存填充污染泄漏判据 */
        Game.state.equipment[slot] = {
          slot, cls: 'warrior', baseTier: set[slot], baseVar: set[slot],
          ilvl: set[slot] * 5 + 1, rarity: 'rare', affixes: []
        };
      }
      Game.applyDoll();
    };
    /* 预热三套：首次装配是缓存填充，不是泄漏 */
    for (let i = 0; i < 3; i++) { apply(sets[i]); await new Promise(r => requestAnimationFrame(r)); }
    apply(sets[0]); await new Promise(r => requestAnimationFrame(r));
    const g0 = Game.renderer.info.memory.geometries;
    const t0 = Game.renderer.info.memory.textures;
    for (let i = 0; i < 50; i++) {
      apply(sets[i % 3]);
      await new Promise(r => requestAnimationFrame(r));
    }
    window.__clearAll(); await new Promise(r => requestAnimationFrame(r));
    return { g0, g1: Game.renderer.info.memory.geometries,
      t0, t1: Game.renderer.info.memory.textures, cache: Doll.stats().cache };
  });
  console.log('  geometries ' + leak.g0 + ' → ' + leak.g1 + ' · textures ' + leak.t0 + ' → ' + leak.t1
    + ' · 缓存 ' + leak.cache + ' 套');
  /* 只拦增长：clearAll 会 dispose 掉缓存项，geometries 下降是好事不是失败 */
  ok(leak.g1 <= leak.g0 + 2, '50 轮换装 geometries 增长（泄漏）', leak);
  ok(leak.t1 <= leak.t0 + 2, '50 轮换装 textures 增长', leak);

  /* ---------- 三、试衣间反复开合 ---------- */
  console.log('\n三、试衣间开合 30 轮（不泄漏 + renderer 状态每次还原）');
  const dp = await page.evaluate(async () => {
    UI.openMenu('bag');
    await new Promise(r => requestAnimationFrame(r));
    const before = Game.renderer.info.memory.geometries;
    let dirty = 0;
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) UI.closeMenu(); else UI.openMenu('bag');
      await new Promise(r => requestAnimationFrame(r));
      if (Game.renderer.getRenderTarget() || Game.renderer.getScissorTest()) dirty++;
    }
    UI.openMenu('bag');
    await new Promise(r => requestAnimationFrame(r));
    return { before, after: Game.renderer.info.memory.geometries,
      dirty, checksum: DollPreview.stats().checksum, gl: window.__glCalls };
  });
  console.log('  geometries ' + dp.before + ' → ' + dp.after + ' · 状态脏 ' + dp.dirty
    + ' 次 · GL context ' + dp.gl + ' · 校验和 ' + dp.checksum);
  ok(dp.after <= dp.before + 2, '试衣间开合 30 轮 geometries 增长', dp);
  ok(dp.dirty === 0, '每次渲染后 renderer 状态（target / scissor）必须还原', dp.dirty);
  ok(dp.checksum > 0, '试衣间反复开合后仍能出图', dp.checksum);
  ok(dp.gl <= 2, '全程不许开第二个 WebGL context（three 回退可能 +1）', dp.gl);

  ok(errs.length === 0, '页面不许有报错', errs.slice(0, 4));
  console.log('\n----------------------------------------');
  console.log((fail === 0 ? '✓ 全部通过' : '✗ 失败 ' + fail) + '：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
