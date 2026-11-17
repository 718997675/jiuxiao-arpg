#!/usr/bin/env node
/* ============================================================
 * [P14] 多首领分场 · 血量 ×0.7 · 分批激活 真机验收
 *
 *   node dev/probe-p14.js
 *
 * zone-check 只验「落点在哪个 zone」，验不了运行时：
 *   · 副首领是不是真挂在主首领身上（leadBoss）
 *   · 副首领血量是不是真的 ×0.7（不是写死、不是乘在错误基数上）
 *   · 主首领没死时，副首领会不会因为玩家路过而提前醒
 *
 * 量四件事：
 *   1  五张多首领图的落点 / 主副关系 / 血量 ×0.7
 *   2  激活闸门：zone 外不醒、踏进 zone 醒、主首领死后按距离醒
 *   3  单首领图（icelake）老逻辑不变
 *   4  全程零报错
 *
 * 纪律：Game.running=false 停主循环，所有推进手动喂 updateEnemies(dt)，
 * 否则 rAF 会在我们摆玩家位置之前就把副首领激活掉，量到的不是闸门。
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

const TOOLS = `
  /* patch spawnEnemy 记下「×0.7 之前」的原始血量。
   * spawnBosses 是在 spawnEnemy 返回之后才削血的，所以这里读到的是主口径。 */
  window.__load = function (mapId) {
    const orig = Game.spawnEnemy;
    const raw = [];
    Game.spawnEnemy = function () {
      const b = orig.apply(this, arguments);
      if (b && b.boss) raw.push({ kind: b.kind, hp: b.hp, maxHp: b.maxHp });
      return b;
    };
    try { Game.loadMap(mapId); }
    finally { Game.spawnEnemy = orig; }
    const list = Game.enemies.filter(e => e.boss).map(e => ({
      kind: e.kind, hp: e.hp, maxHp: e.maxHp,
      wing: !!e.wingBoss, active: !!e.active,
      leadKind: e.leadBoss ? e.leadBoss.kind : null,
      leadDead: e.leadBoss ? !!e.leadBoss.dead : null,
      x: e.pos.x, z: e.pos.z,
      inZone: e.wingBoss ? zoneContains({ type: e.wingZoneType, x: e.wingZoneX,
        z: e.wingZoneZ, w: e.wingZoneW, h: e.wingZoneH, r: e.wingZoneR },
        e.pos.x, e.pos.z) : null
    }));
    return { raw, list };
  };
  /* 闸门三段：zone 外（但 <17 米）→ zone 内 → 主首领已死后的 zone 外 */
  window.__gate = function (mapId) {
    Game.loadMap(mapId);
    const wing = Game.enemies.find(e => e.boss && e.wingBoss);
    const lead = Game.enemies.find(e => e.boss && !e.wingBoss);
    if (!wing || !lead) return { err: 'no wing/lead' };
    const outsideX = wing.wingZoneX + (wing.wingZoneX < 0 ? 1 : -1) * (wing.wingZoneW / 2 + 0.8);
    const pp = Game.playerGroup.position;
    pp.set(outsideX, 0, wing.wingZoneZ);
    const dOut = Math.hypot(pp.x - wing.pos.x, pp.z - wing.pos.z);
    Game.updateEnemies(0.016);
    const beforeZone = !!wing.active;
    pp.set(wing.wingZoneX, 0, wing.wingZoneZ);
    Game.updateEnemies(0.016);
    const inZone = !!wing.active;

    Game.loadMap(mapId);
    const w2 = Game.enemies.find(e => e.boss && e.wingBoss);
    const l2 = Game.enemies.find(e => e.boss && !e.wingBoss);
    l2.dead = true;
    const pp2 = Game.playerGroup.position;
    pp2.set(outsideX, 0, w2.wingZoneZ);
    Game.updateEnemies(0.016);
    const afterLeadDead = !!w2.active;
    return { dOut, beforeZone, inZone, afterLeadDead };
  };
  window.__single = function (mapId) {
    window.__load(mapId);
    const b = Game.enemies.find(e => e.boss);
    if (!b) return { err: 'no boss' };
    const pp = Game.playerGroup.position;
    pp.set(b.pos.x, 0, b.pos.z + 6);
    Game.updateEnemies(0.016);
    return { wing: !!b.wingBoss, active: !!b.active };
  };
`;

const WING_MAP = {
  forest: ['batking'],
  swamp: ['golemking', 'snakequeen'],
  mine: ['icequeen'],
  abyss: ['ferryman', 'swordlord'],
  frost: ['firegeneral']
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);
  await p.evaluate(TOOLS);
  await p.evaluate(() => { Game.running = false; });

  console.log('\n【1】多首领图：落点 / 主副关系 / 血量 ×0.7');
  for (const mapId of Object.keys(WING_MAP)) {
    const r = await p.evaluate(id => window.__load(id), mapId);
    const rawBy = {}; r.raw.forEach(x => { rawBy[x.kind] = x; });
    const wings = r.list.filter(x => x.wing);
    const mains = r.list.filter(x => !x.wing);
    ok(mains.length === 1, mapId + ' 只有 1 只主首领', mains.map(x => x.kind));
    ok(wings.length === WING_MAP[mapId].length, mapId + ' 副首领 ' + WING_MAP[mapId].length + ' 只', wings.map(x => x.kind));
    ok(wings.every(x => WING_MAP[mapId].indexOf(x.kind) >= 0), mapId + ' 副首领身份对', wings.map(x => x.kind));
    ok(wings.every(x => x.inZone === true), mapId + ' 副首领落在自己 wing zone', wings.map(x => ({ kind: x.kind, inZone: x.inZone, x: x.x, z: x.z })));
    ok(wings.every(x => x.leadKind === mains[0].kind && x.leadDead === false), mapId + ' 副首领挂在主首领上', wings.map(x => x.leadKind));
    ok(wings.every(x => { const q = rawBy[x.kind]; return q && x.hp === Math.round(q.hp * 0.7) && x.maxHp === x.hp; }),
      mapId + ' 副首领 HP = 主口径 ×0.7',
      wings.map(x => ({ kind: x.kind, hp: x.hp, want: rawBy[x.kind] ? Math.round(rawBy[x.kind].hp * 0.7) : null })));
    ok(mains.every(x => { const q = rawBy[x.kind]; return q && x.hp === q.hp; }),
      mapId + ' 主首领 HP 未被削', mains.map(x => ({ kind: x.kind, hp: x.hp, raw: rawBy[x.kind] && rawBy[x.kind].hp })));
  }

  console.log('\n【2】激活闸门：主首领活着时副首领不因路过而醒');
  for (const mapId of Object.keys(WING_MAP)) {
    const r = await p.evaluate(id => window.__gate(id), mapId);
    ok(r.dOut < 17, mapId + ' 测试点确实在 17 米内（' + (r.dOut || 0).toFixed(1) + '）', r);
    ok(r.beforeZone === false, mapId + ' zone 外 → 副首领不 active', r);
    ok(r.inZone === true, mapId + ' 踏进 zone → 副首领 active', r);
    ok(r.afterLeadDead === true, mapId + ' 主首领死后 → 按距离激活', r);
  }

  console.log('\n【3】单首领图回归：老逻辑不变');
  const s = await p.evaluate(() => window.__single('icelake'));
  ok(s.wing === false, 'icelake 主首领没有 wingBoss 标记', s);
  ok(s.active === true, 'icelake 玩家靠近 → Boss 照常 active', s);

  console.log('\n【4】报错');
  const real = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(real.length === 0, '全程无 console.error / pageerror', real.slice(0, 4));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
