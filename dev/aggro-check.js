/* v1.12.1 体验验收：地图尺寸 / 怪物密度 / 仇恨与脱战
 *
 * 对应玩家反馈的三条：
 *   ① 地图还是小        → 量每张图的实际跨度与主厅面积
 *   ② 怪物密度过大      → 量每图怪物总数与「每千平方米几只」
 *   ③ 传送过去就被追着打 → 落地后连续 5 秒统计仇恨数；再量第一次被索敌的距离
 *
 * 用法：node dev/aggro-check.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));

const MAPS5 = ['forest', 'swamp', 'mine', 'abyss', 'heaven'];
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 30; Game.recalc(); });
  await wait(700);

  /* ---------- A. 地图尺寸 / 密度 ---------- */
  console.log('【A】地图尺寸与怪物密度');
  for (const mid of MAPS5) {
    const r = await p.evaluate(async (mid) => {
      Game.travelTo(mid);
      await new Promise(r => setTimeout(r, 900));
      const zs = mapZones(mid);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, area = 0;
      for (const z of zs) {
        const hw = z.type === 'circle' ? z.r : z.w / 2;
        const hh = z.type === 'circle' ? z.r : z.h / 2;
        x0 = Math.min(x0, z.x - hw); x1 = Math.max(x1, z.x + hw);
        z0 = Math.min(z0, z.z - hh); z1 = Math.max(z1, z.z + hh);
        area += z.type === 'circle' ? Math.PI * z.r * z.r : z.w * z.h;
      }
      const hall = zs.find(z => z.kind === 'hall');
      return {
        mid,
        span: [+(x1 - x0).toFixed(0), +(z1 - z0).toFixed(0)],
        area: Math.round(area),
        hall: hall ? [hall.w, hall.h] : null,
        mobs: Game.enemies.filter(e => !e.boss).length,
        fogFar: MAPS[mid].fogFar
      };
    }, mid);
    const dens = (r.mobs / (r.area / 1000)).toFixed(1);
    console.log(`  ${mid.padEnd(7)} 跨度 ${r.span[0]}×${r.span[1]}m  可走 ${r.area}㎡  主厅 ${r.hall ? r.hall.join('×') : '-'}  怪 ${r.mobs} 只（${dens} 只/千㎡）  雾 ${r.fogFar}m`);
    ok(r.span[0] >= 95 && r.span[1] >= 100, `A: ${mid} 跨度只有 ${r.span.join('×')}`);
    ok(r.fogFar >= r.span[1] * 0.8, `A: ${mid} 雾距 ${r.fogFar} 撑不住 ${r.span[1]}m 的跨度`);
  }

  /* ---------- B. 落地 5 秒不被追 ---------- */
  console.log('\n【B】传送落地后的 5 秒');
  for (const mid of MAPS5) {
    const r = await p.evaluate(async (mid) => {
      Game.travelTo(mid);
      await new Promise(r => setTimeout(r, 900));
      Game.state.hp = 1e9;
      const pp = Game.playerGroup.position;
      const spawn = { x: pp.x, z: pp.z };
      /* 落地瞬间：离出生点最近的怪有多远 */
      let near = 1e9;
      for (const e of Game.enemies) if (!e.dead) near = Math.min(near, Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z));
      /* 原地站 5 秒（不移动、不攻击），统计仇恨数 */
      let maxAggro = 0, tookDmg = 0;
      const hp0 = Game.state.hp;
      for (let i = 0; i < 300; i++) {
        Game.update(1 / 60);
        Game.state.hp = Math.max(Game.state.hp, 1);   // 只看有没有挨打，不让它死
        let n = 0;
        for (const e of Game.enemies) if (!e.dead && e.aggro) n++;
        maxAggro = Math.max(maxAggro, n);
      }
      return {
        mid, near: +near.toFixed(1), maxAggro,
        grace: +(Game.aggroGrace || 0).toFixed(1),
        moved: +Math.hypot(pp.x - spawn.x, pp.z - spawn.z).toFixed(2)
      };
    }, mid);
    console.log(`  ${mid.padEnd(7)} 最近怪 ${r.near}m  站 5 秒后仇恨数 ${r.maxAggro}  落地保护 ${r.grace}s`);
    ok(r.maxAggro === 0, `B: ${mid} 站着不动 5 秒却有 ${r.maxAggro} 只怪仇恨了`);
    ok(r.near >= 20, `B: ${mid} 出生点 ${r.near}m 内就有怪`);
  }

  /* ---------- C. 走近才被索敌 ---------- */
  console.log('\n【C】走近多少米才会被索敌');
  for (const mid of MAPS5) {
    const r = await p.evaluate(async (mid) => {
      Game.travelTo(mid);
      await new Promise(r => setTimeout(r, 900));
      Game.state.hp = 1e9;
      Game.aggroGrace = 0;          // 手动清掉落地保护，只测距离
      const zs = mapZones(mid);
      const hall = zs.find(z => z.kind === 'hall');
      /* 找一只主厅里的怪，把玩家从 40 米外一步步走近 */
      const target = Game.enemies.find(e => !e.boss && Math.hypot(e.pos.x - hall.x, e.pos.z - hall.z) < 10);
      if (!target) return { mid, skip: true };
      const pp = Game.playerGroup.position;
      const ang = Math.atan2(hall.z - target.pos.z, hall.x - target.pos.x) || 0;
      let firstAt = null;
      for (let d = 40; d >= 2; d -= 0.5) {
        pp.x = target.pos.x + Math.cos(ang) * d;
        pp.z = target.pos.z + Math.sin(ang) * d;
        Game.collideWorld(pp, 0.55, null, false);
        target.aggro = false;
        Game.update(1 / 60);
        if (target.aggro) { firstAt = Math.hypot(target.pos.x - pp.x, target.pos.z - pp.z); break; }
      }
      return { mid, firstAt: firstAt === null ? null : +firstAt.toFixed(1), diff: Game.state.difficulty };
    }, mid);
    if (r.skip) { console.log(`  ${mid.padEnd(7)} 跳过（主厅没刷到怪）`); continue; }
    console.log(`  ${mid.padEnd(7)} 第一次被索敌：${r.firstAt === null ? '一直没索敌' : r.firstAt + 'm'}（难度 ${r.diff}）`);
    ok(r.firstAt === null || r.firstAt <= 20, `C: ${mid} 索敌距离 ${r.firstAt}m 太远`);
  }

  /* ---------- D. 脱战 ---------- */
  console.log('\n【D】跑远之后会不会脱战');
  const dg = await p.evaluate(async () => {
    Game.travelTo('forest');
    await new Promise(r => setTimeout(r, 900));
    Game.state.hp = 1e9; Game.aggroGrace = 0;
    const gz = mapEntryZone('forest');
    /* 挑离入口最远的那只普通怪。
       不能随便拿第一只：path 区的怪离入口只有 28m 左右，正好压在脱战阈值上，
       怪一追近就跌破阈值、deaggroT 被清零，然后在阈值两侧反复横跳永远脱不掉。 */
    let e = null, best = -1;
    for (const x of Game.enemies) {
      if (x.boss || x.dead) continue;
      const d = Math.hypot(x.pos.x - gz.x, x.pos.z - gz.z);
      if (d > best) { best = d; e = x; }
    }
    if (!e) return { skip: true };
    const pp = Game.playerGroup.position;
    /* ① 贴到 2 米内逼它仇恨 */
    pp.x = e.pos.x + 2; pp.z = e.pos.z + 2;
    Game.collideWorld(pp, 0.55, null, false);
    Game.update(1 / 60); Game.update(1 / 60);
    const aggroed = e.aggro;
    /* ② 玩家瞬移回入口钉死，看怪多久放弃 */
    pp.x = gz.x; pp.z = gz.z;
    const dist = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
    let deaggroAt = null;
    for (let i = 0; i < 60 * 20; i++) {
      Game.update(1 / 60);
      Game.state.hp = 1e9;
      pp.x = gz.x; pp.z = gz.z;
      if (!e.aggro) { deaggroAt = +(i / 60).toFixed(1); break; }
    }
    /* ③ 再等 10 秒看它有没有走回出生点 */
    const home0 = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
    for (let i = 0; i < 60 * 10; i++) { Game.update(1 / 60); Game.state.hp = 1e9; pp.x = gz.x; pp.z = gz.z; }
    const home1 = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
    return { aggroed, dist: +dist.toFixed(1), deaggroAt, home0: +home0.toFixed(1), home1: +home1.toFixed(1) };
  });
  if (dg.skip) {
    console.log('  跳过（森林里没有可用的普通怪）');
    ok(false, 'D: 森林里找不到普通怪，无法验证脱战');
  } else {
    console.log(`  逼它仇恨=${dg.aggroed}，拉开 ${dg.dist}m 后 ${dg.deaggroAt === null ? '20 秒内没脱战' : dg.deaggroAt + ' 秒脱战'}；回位距离 ${dg.home0}m → ${dg.home1}m`);
    ok(dg.aggroed, 'D: 贴近 2 米都没能触发仇恨');
    ok(dg.dist > 30, `D: 测试几何没拉开（只有 ${dg.dist}m），测不出脱战`);
    ok(dg.deaggroAt !== null, 'D: 拉开 30 米以上 20 秒都没脱战');
    ok(dg.deaggroAt === null || dg.deaggroAt <= 12, `D: 脱战用了 ${dg.deaggroAt} 秒，太磨人`);
    ok(dg.home1 < dg.home0, 'D: 脱战后没有走回出生点');
  }

  console.log('\n报错数:', errs.length, errs.slice(0, 3));
  ok(errs.length === 0, 'X: 页面有 JS 报错');
  console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ 体验验收全部通过');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
