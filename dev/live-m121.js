/* v1.12.1 线上校验：地图尺寸 / 刷怪数 / 仇恨参数
 * 用法：node dev/live-m121.js
 * 注意：GitHub Pages 构建有 40~60 秒延迟，刚 push 完立刻跑会拿到旧版本。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const resp = await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  console.log('HTTP:', resp.status());
  await wait(1800);
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 30; Game.recalc(); });
  await wait(700);

  /* 1. 数据层：区域几何 / 刷怪数 / 仇恨参数 */
  const d = await p.evaluate(() => {
    const out = {};
    out.aggro = BALANCE.aggro || null;
    out.maps = {};
    for (const mid of ['forest', 'swamp', 'mine', 'abyss', 'heaven']) {
      const zs = mapZones(mid);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, area = 0, mobs = 0;
      for (const z of zs) {
        const hw = z.type === 'circle' ? z.r : z.w / 2;
        const hh = z.type === 'circle' ? z.r : z.h / 2;
        x0 = Math.min(x0, z.x - hw); x1 = Math.max(x1, z.x + hw);
        z0 = Math.min(z0, z.z - hh); z1 = Math.max(z1, z.z + hh);
        area += z.type === 'circle' ? Math.PI * z.r * z.r : z.w * z.h;
        if (z.spawns) mobs += z.spawns.count;
      }
      out.maps[mid] = {
        span: [+(x1 - x0).toFixed(0), +(z1 - z0).toFixed(0)],
        area: Math.round(area), mobs, fogFar: MAPS[mid].fogFar,
        zones: zs.length, entrySpawns: !!(zs.find(z => z.kind === 'entry') || {}).spawns
      };
    }
    return out;
  });

  console.log('\n【数据层】');
  console.log('  BALANCE.aggro =', JSON.stringify(d.aggro));
  for (const [mid, m] of Object.entries(d.maps)) {
    console.log(`  ${mid.padEnd(7)} ${m.zones} 区  跨度 ${m.span[0]}×${m.span[1]}m  可走 ${m.area}㎡  刷怪 ${m.mobs} 只  雾 ${m.fogFar}m  入口刷怪=${m.entrySpawns}`);
    ok(m.span[0] >= 95 && m.span[1] >= 100, `线上 ${mid} 跨度只有 ${m.span.join('×')}（旧版本？）`);
    ok(m.mobs >= 8 && m.mobs <= 13, `线上 ${mid} 刷怪 ${m.mobs} 只，超出 8~13 区间`);
    ok(!m.entrySpawns, `线上 ${mid} 入口区还在刷怪`);
  }
  ok(d.aggro && d.aggro.aggroR === 13, '线上 BALANCE.aggro.aggroR 不是 13');
  ok(d.aggro && d.aggro.deaggroR === 28, '线上 BALANCE.aggro.deaggroR 不是 28');

  /* 2. 运行时：落地 5 秒仇恨数 + 索敌距离 */
  console.log('\n【运行时】');
  for (const mid of ['forest', 'mine', 'heaven']) {
    const r = await p.evaluate(async (mid) => {
      Game.travelTo(mid);
      await new Promise(r => setTimeout(r, 900));
      Game.state.hp = 1e9;
      const pp = Game.playerGroup.position;
      let near = 1e9;
      for (const e of Game.enemies) if (!e.dead) near = Math.min(near, Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z));
      let maxAggro = 0;
      for (let i = 0; i < 300; i++) {
        Game.update(1 / 60);
        Game.state.hp = 1e9;
        let n = 0;
        for (const e of Game.enemies) if (!e.dead && e.aggro) n++;
        maxAggro = Math.max(maxAggro, n);
      }
      /* 索敌距离 */
      Game.aggroGrace = 0;
      const zs = mapZones(mid);
      const hall = zs.find(z => z.kind === 'hall');
      const target = Game.enemies.find(e => !e.boss && Math.hypot(e.pos.x - hall.x, e.pos.z - hall.z) < 10);
      let firstAt = null;
      if (target) {
        const ang = Math.atan2(hall.z - target.pos.z, hall.x - target.pos.x) || 0;
        for (let dd = 40; dd >= 2; dd -= 0.5) {
          pp.x = target.pos.x + Math.cos(ang) * dd;
          pp.z = target.pos.z + Math.sin(ang) * dd;
          Game.collideWorld(pp, 0.55, null, false);
          target.aggro = false;
          Game.update(1 / 60);
          if (target.aggro) { firstAt = +Math.hypot(target.pos.x - pp.x, target.pos.z - pp.z).toFixed(1); break; }
        }
      }
      return { mid, near: +near.toFixed(1), maxAggro, firstAt, mobs: Game.enemies.filter(e => !e.boss).length };
    }, mid);
    console.log(`  ${mid.padEnd(7)} 最近怪 ${r.near}m  站 5 秒仇恨 ${r.maxAggro}  索敌距离 ${r.firstAt === null ? '未触发' : r.firstAt + 'm'}  场上怪 ${r.mobs}`);
    ok(r.maxAggro === 0, `线上 ${mid} 落地站 5 秒有 ${r.maxAggro} 只怪仇恨`);
    ok(r.near >= 18, `线上 ${mid} 出生点 ${r.near}m 内就有怪`);
    ok(r.firstAt === null || r.firstAt <= 20, `线上 ${mid} 索敌距离 ${r.firstAt}m 太远`);
  }

  console.log('\n报错数:', errs.length, errs.slice(0, 3));
  ok(errs.length === 0, 'X: 线上页面有 JS 报错');
  console.log(fails.length ? '\n❌ 线上校验失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ 线上校验全部通过');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
