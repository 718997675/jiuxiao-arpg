#!/usr/bin/env node
/* ============================================================
 * [U8] 世界 Boss 形状预警层 · 真机验收
 *
 *   NODE_PATH=<node_modules> node dev/probe-wbzone.js
 *
 * 契约（test-wbzone）判的是数据 / 接线；这一份判的是「接进真游戏后
 * 6 只 18 招真的画出形状预警，而且形状与判定匹配、零空招」。
 *
 * 量四件事：
 *   1 6 只全量：每只刷出来，18 招逐个直接 cast，每招都产出形状 zone
 *   2 形状匹配：line→rect / fan→fan / circle→circle / ring→ring / scatter→lock
 *   3 只画不判定：形状 zone 的 cb=null，判定挂在 silent telegraph 上
 *   4 换图清场 + silent telegraph 不崩（U8 中途踩过的 null mesh 坑）
 *
 * headless 软件渲染只有 1~2fps，一律显式调 FX.update / WBFight.cast，不靠等。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m, d === undefined ? '' : JSON.stringify(d));
};

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
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.mapsSeen = Object.keys(MAPS);
    Game.state.stats.hpMax = 1e9; Game.state.hp = 1e9;
    Game.invuln = 9999;
  });
  await wait(350);

  /* 逐只强刷 + 逐招 cast，量形状 zone。全部在一次 evaluate 的同步块里做完，
   * 避免主循环插进来改状态（与 probe-enchant 的纪律一致）。 */
  const r = await page.evaluate(() => {
    const out = { perBoss: [], err: [] };
    const IDS = window.WBZ_ORDER || [];
    for (const id of IDS) {
      const cfg = WORLD_BOSSES[id];
      const firstMap = (cfg.spawn && cfg.spawn.maps && cfg.spawn.maps[0]) ||
        Object.keys(MAPS).find(m => MAPS[m].worldBoss === id) || 'village';
      /* 用现成的强刷入口（worldboss-battle-live 同款），失败就跳过这只 */
      let e = null;
      try {
        const pos = (typeof bossPosOf === 'function') ? bossPosOf(firstMap, id, 0) : [0, 0];
        Game.state.worldBoss = {
          id, mapId: firstMap, x: pos[0], z: pos[1],
          spawnAt: Date.now(), until: Date.now() + WORLD_BOSS_CFG.cycle,
          killed: false, killAt: 0
        };
        WorldBoss.despawn();
        if (Game.state.mapId !== firstMap) Game.travelTo(firstMap);
        WorldBoss.sync();
        e = Game.enemies.find(x => x.wb && !x.dead) || null;
      } catch (ex) { out.err.push(id + ' spawn: ' + (ex.message || ex)); }
      if (!e) { out.perBoss.push({ id, fail: 'no-entity', skills: [] }); continue; }

      const pp = Game.playerGroup.position;
      const rows = [];
      for (const k of Object.keys(cfg.skills || {})) {
        const sk = cfg.skills[k];
        FX.clear();
        try {
          const ang = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
          WBFight.cast(e, sk, pp);
          const zones = FX.zones.filter(z => z.type === 'zone');
          const tels = FX.zones.filter(z => z.type === 'tele');
          rows.push({
            id: sk.id, shape: sk.shape,
            want: window.WBZ_SHAPE[sk.shape] && window.WBZ_SHAPE[sk.shape].zone,
            zoneShapes: zones.map(z => z.shape),
            zoneCount: zones.length,
            zoneCbNull: zones.every(z => z.cb === null),
            teleSilent: tels.every(z => !z.mesh),
            finite: zones.every(z => isFinite(z.mesh.position.x) && isFinite(z.mesh.position.z)),
            meshKids: zones.map(z => z.mesh.children.length),
          });
        } catch (ex) {
          rows.push({ id: sk.id, shape: sk.shape, error: (ex.message || ex) });
        }
      }
      out.perBoss.push({ id, skills: rows });
      FX.clear();
    }
    return out;
  });

  console.log('一、6 只全量：每只刷得出来');
  ok(r.perBoss.length === 6, '6 只世界 Boss 全跑了一遍', r.perBoss.length);
  ok(r.perBoss.every(b => b.skills.length > 0), '每只都有招式产出（零空招）',
    r.perBoss.filter(b => !b.skills.length).map(b => b.id + ':' + b.fail));
  ok(r.err.length === 0, '强刷过程零异常', r.err);

  console.log('二、18 招形状匹配 + 只画不判定');
  const all = r.perBoss.flatMap(b => b.skills);
  ok(all.length === 18, '共 18 招', all.length);
  const bad = all.filter(s => s.error);
  ok(bad.length === 0, '每招 cast 都不抛异常', bad);
  const wrong = all.filter(s => !s.error && (s.zoneShapes.indexOf(s.want) < 0));
  ok(wrong.length === 0, '每招都画出了形状匹配的 zone',
    wrong.map(s => s.id + ' 要 ' + s.want + ' 实际 ' + JSON.stringify(s.zoneShapes)));
  ok(all.filter(s => !s.error).every(s => s.zoneCbNull),
    '形状 zone 的 cb 全为 null（判定不在预警里结算）');
  ok(all.filter(s => !s.error).every(s => s.teleSilent),
    '判定 telegraph 全是 silent（不画旧圆、只留 cb）');
  ok(all.filter(s => !s.error).every(s => s.finite && s.meshKids.every(n => n > 0)),
    '每个形状 zone 坐标有限且有可见部件（不是空壳）',
    all.filter(s => !s.error && (!s.finite || s.meshKids.some(n => !n))).map(s => s.id));

  console.log('三、形状分布覆盖');
  const got = new Set(all.filter(s => !s.error).map(s => s.want));
  ok(['rect', 'circle', 'fan', 'ring', 'lock'].every(x => got.has(x)),
    '五种形状都真的出现在游戏里', Array.from(got));

  console.log('四、零报错');
  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(errs2.length === 0, '全程零控制台报错', errs2.slice(0, 5));

  await browser.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' U8 世界 Boss 形状预警真机：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
