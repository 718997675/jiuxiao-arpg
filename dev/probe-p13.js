#!/usr/bin/env node
/* ============================================================
 * [P13-4] 地图风貌差异化 —— 真机验收
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/probe-p13.js
 *
 * 静态契约（dev/test-p13.js）判的是「数据/源码对不对」；这一份判的是
 * **接进游戏之后真的出得来**。量六件事：
 *   1  23 张骨架图逐张 loadMap，真机 world.root 里都有 p13 地标 Group
 *   2  地标 mesh 数 3~7（不是空壳），且顶点坐标全有限（NaN 照样算 mesh）
 *   3  地标落在可走区内（zonesContain），不在墙外
 *   4  每张图都有 p13 天气 Points，粒子数 100~300，坐标全有限
 *   5  换图后旧地标/天气随 world 销毁（scene 里只有当前图的一套）
 *   6  全程零 console.error / pageerror
 *
 * 坑：
 *   · loadMap 有 aggroGrace 与换图表决，必须逐张顺序 load，等一帧再读数。
 *   · world.root 是 THREE.Group，children 里按 userData.p13 认领地带标/天气，
 *     不能靠遍历所有 mesh —— 地面/墙/道具也都在里面。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const EXE = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const MAPS23 = ['magmagully', 'ashfield', 'flamecanyon', 'flamealtar',
  'sunset', 'bonestrand', 'bonetower', 'ironpeak',
  'bonehall', 'forgetshore', 'abyssdeep', 'yellowferry',
  'swordtomb', 'swordpit', 'swordapex', 'cloudbridge', 'southgate',
  'jadecapital', 'starfall', 'mirrorrealm', 'mirrorabyss', 'nineapex', 'chaossea'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} Game.startNew('warrior', 'P13'); });
  await wait(600);

  /* 页面里装工具：从 world.root 认领 p13 地标/天气，数 mesh / 粒子 / 有限坐标 */
  await page.evaluate(() => {
    window.__p13 = function (mapId) {
     try {
      Game.loadMap(mapId);
      const root = Game.world.root;
      const lm = [], wt = [];
      for (const o of root.children) {
        const p = o.userData && o.userData.p13;
        if (!p) continue;
        (o.isPoints ? wt : lm).push(o);
      }
      /* 数一个 Group 内的 mesh + 顶点有限性 */
      function measure(obj) {
        let meshes = 0, finite = true, maxY = 0;
        obj.traverse(c => {
          if (c.isMesh) {
            meshes++;
            const pos = c.geometry && c.geometry.attributes && c.geometry.attributes.position;
            if (pos) for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) finite = false;
              if (y > maxY) maxY = y;
            }
          }
        });
        return { meshes, finite, maxY: +maxY.toFixed(2) };
      }
      const l = lm[0] ? measure(lm[0]) : null;
      let w = null;
      if (wt[0]) {
        const pos = wt[0].geometry && wt[0].geometry.attributes && wt[0].geometry.attributes.position;
        const n = pos ? pos.count : 0;
        let finite = true;
        if (pos) for (let i = 0; i < n; i++) {
          if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) finite = false;
        }
        w = { n, finite, type: (wt[0].userData.p13 || {}).type };
      }
      const inZone = l && (typeof zonesContain === 'function')
        ? zonesContain(mapId, lm[0].position.x, lm[0].position.z) : null;
      return {
        mapId,
        spec: (typeof MAP_SPECS !== 'undefined' && MAP_SPECS[mapId]) || {},
        lmCount: lm.length, wtCount: wt.length,
        lmType: l ? (lm[0].userData.p13 || {}).type : null,
        lm: l, w, inZone,
        worldChildren: root.children.length
      };
     } catch (e) { return { mapId: mapId, error: e.message, stack: (e.stack || '').slice(0, 300) }; }
    };
  });

  console.log('装工具状态:', await page.evaluate(() => typeof window.__p13));
  console.log('开局状态:', await page.evaluate(() => ({ game: typeof Game, running: Game && Game.running })));

  console.log('\n【1】23 张骨架图逐张真机出图');
  const rows = [];
  for (const id of MAPS23) {
    let r;
    try {
      /* 地图 id 直接拼进字符串：Safari 门面的 evaluate 不支持传参 */
      await page.evaluate('window.__cur=' + JSON.stringify(id));
      r = await page.evaluate(() => window.__p13(window.__cur));
    }
    catch (e) { r = { mapId: id, error: e.message }; console.log('  !! 探针异常:', id, e.message); }
    if (!r) { r = { mapId: id, error: '返回 undefined' }; console.log('  !! 探针未返回:', id); }
    rows.push(r);
  }
  const noLM = rows.filter(r => r.lmCount !== 1);
  ok(noLM.length === 0, '每张图恰好 1 个 p13 地标 Group', noLM.map(r => r.mapId + ':' + r.lmCount));
  const noWT = rows.filter(r => r.wtCount !== 1);
  ok(noWT.length === 0, '每张图恰好 1 个 p13 天气 Points', noWT.map(r => r.mapId + ':' + r.wtCount));

  console.log('\n【2】地标 mesh 数 3~7 + 坐标有限');
  const badLM = rows.filter(r => !r.lm || r.lm.meshes < 3 || r.lm.meshes > 7 || !r.lm.finite);
  ok(badLM.length === 0, '23 张图地标 mesh 数 3~7 且顶点全有限',
    badLM.map(r => r.mapId + ':' + JSON.stringify(r.lm)));
  const badType = rows.filter(r => r.lmType !== r.spec.landmark);
  ok(badType.length === 0, '真机出的地标类型 = 数据层声明的 landmark',
    badType.map(r => r.mapId + ':' + r.lmType + '≠' + r.spec.landmark));

  console.log('\n【3】地标落在可走区内');
  const outside = rows.filter(r => r.inZone !== true);
  ok(outside.length === 0, '23 张图地标都在可走区（不在墙外）',
    outside.map(r => r.mapId + ':' + r.inZone));

  console.log('\n【4】天气粒子数 100~300 + 坐标有限');
  const badWT = rows.filter(r => !r.w || r.w.n < 100 || r.w.n > 300 || !r.w.finite);
  ok(badWT.length === 0, '23 张图天气粒子 100~300 且坐标全有限',
    badWT.map(r => r.mapId + ':' + JSON.stringify(r.w)));
  const badWType = rows.filter(r => r.w && r.w.type !== r.spec.weather);
  ok(badWType.length === 0, '真机天气类型 = 数据层声明的 weather',
    badWType.map(r => r.mapId + ':' + r.w.type + '≠' + r.spec.weather));

  console.log('\n【5】同章四元组在真机数据上成立 + 换图不残留');
  /* 卷五四张 void 真机 sky 两两不同 */
  const vsky = await page.evaluate(() => ['jadecapital', 'starfall', 'mirrorrealm', 'mirrorabyss'].map(id => MAPS[id].sky));
  ok(new Set(vsky).size === 4, '卷五四张 void 真机 sky 四色全不同', vsky);
  /* 连切三张图，scene 里应始终只有当前 world.root 一套 */
  const roots = await page.evaluate(() => {
    const seen = [];
    for (const id of ['swordtomb', 'bonetower', 'mirrorabyss']) {
      Game.loadMap(id);
      let n = 0;
      Game.scene.traverse(o => { if (o.userData && o.userData.p13) n++; });
      seen.push({ id, n });
    }
    return seen;
  });
  ok(roots.every(r => r.n === 2), '换图后场景里只有当前图一套地标+天气（旧的销毁）', roots);

  console.log('\n【6】错误');
  ok(errs.length === 0, '全程零 console.error / pageerror', errs.slice(0, 5));

  console.log('\n【读数抽样】');
  for (const id of ['sunset', 'magmagully', 'bonetower', 'swordtomb', 'jadecapital', 'mirrorabyss']) {
    const r = rows.find(x => x.mapId === id);
    console.log('  ' + id.padEnd(13) + ' 地标=' + (r.lmType || '-').padEnd(13) +
      ' mesh=' + (r.lm ? r.lm.meshes : '-') + ' 天气=' + (r.w ? r.w.type : '-').padEnd(10) +
      ' 粒子=' + (r.w ? r.w.n : '-'));
  }

  await browser.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
