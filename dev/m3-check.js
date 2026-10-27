/* ============================================================
 * dev/m3-check.js —— M3 地图扩容浏览器实测
 *
 * zone-check / zone-density 校验的是**数据**（能不能走通、多大、多密）。
 * 这个脚本校验的是**跑起来之后**：
 *
 *   A. 数据层：4 张新图在 MAPS 里、骨架展开出 12 区、首领在 BOSSES 里
 *   B. 落点：玩家出生点、40+ 只怪、首领全部落在 zone 内
 *   C. 小地图：ui-minimap.js 能画出来（画布非空 + 区域数对得上 + 不抛异常）
 *   D. 性能：40+ 只怪同屏的帧时间（§5.4 预算 50 FPS）
 *
 * 用法：node dev/m3-check.js [--shot]
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOT = process.argv.includes('--shot');
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

const NEW_MAPS = ['magmagully', 'ashfield', 'flamecanyon', 'flamealtar'];
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await page.click('#startBtn').catch(() => {});
  await wait(300);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 40; Game.recalc(); });
  await wait(1200);

  /* ---------- A. 数据层 ---------- */
  console.log('【A】数据层');
  const api = await page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const m = MAPS[id];
      const zs = mapZones(id);
      out[id] = m ? {
        name: m.name, size: m.size, level: m.level, ground: m.ground,
        zones: zs ? zs.length : 0,
        boss: m.bosses && m.bosses[0] ? m.bosses[0] : null,
        bossOk: !!(m.bosses && m.bosses[0] && BOSSES[m.bosses[0]]),
        spawnCount: m.spawnCount
      } : null;
    }
    return { maps: out, hasMinimap: typeof Minimap !== 'undefined', hasQuest: typeof QuestSys !== 'undefined' };
  }, NEW_MAPS);

  ok(api.hasMinimap, 'A: Minimap 模块没挂到全局（ui-minimap.js 没引入？）');
  ok(api.hasQuest, 'A: QuestSys 未定义');
  for (const id of NEW_MAPS) {
    const r = api.maps[id];
    if (!ok(r, `A: MAPS 里没有 ${id}`)) continue;
    console.log(`  ${id.padEnd(12)} ${r.name}  lv${r.level}  size ${r.size}  ${r.zones} 区  ground=${r.ground}  首领=${r.boss || '无'}`);
    ok(r.zones === 12, `A: ${id} 应有 12 个 zone，实际 ${r.zones}`);
    ok(r.bossOk, `A: ${id} 的首领 ${r.boss} 在 BOSSES 里不存在`);
    ok(r.size >= 285, `A: ${id} size ${r.size} < 285，面积/密度不可能同时达标`);
  }

  /* ---------- B. 落点 ---------- */
  console.log('\n【B】落点合法性');
  for (const mid of NEW_MAPS) {
    const r = await page.evaluate(async (mid) => {
      Game.state.level = 40; Game.recalc();
      Game.travelTo(mid);
      await new Promise(res => setTimeout(res, 1100));
      const inside = (x, z) => zonesContain(mid, x, z);
      const pp = Game.playerGroup.position;
      let badE = 0, nB = 0, badB = 0, bossZone = '-', culled = 0, skipping = 0;
      for (const e of Game.enemies) {
        if (!inside(e.pos.x, e.pos.z)) badE++;
        if (e.culled) culled++;
        if (e.aiSkip && e.aiSkip % 3 !== 0) skipping++;
        if (e.boss) {
          nB++;
          const bz = zoneAt(mid, e.pos.x, e.pos.z);
          bossZone = bz ? bz.name : '-';
          if (!inside(e.pos.x, e.pos.z)) badB++;
        }
      }
      const pz = zoneAt(mid, pp.x, pp.z);
      return {
        n: Game.enemies.length, badE, nB, badB, bossZone, culled, skipping,
        playerIn: inside(pp.x, pp.z),
        playerZone: pz ? pz.name : '-',
        waystone: !!(Game.world && Game.world.waystone)
      };
    }, mid);
    console.log(`  怪 ${String(r.n).padStart(2)} 只 · 越界 ${r.badE} · 首领 ${r.nB} 只@${r.bossZone} · 出生点[${r.playerZone}] · 视野外 ${r.culled} 只（降频中 ${r.skipping}）· 路标石 ${r.waystone ? '有' : '无'}`);
    ok(r.playerIn, `B: ${mid} 出生点不在任何 zone 内`);
    ok(r.badE === 0, `B: ${mid} 有 ${r.badE} 只怪刷在 zone 外`);
    ok(r.nB >= 1, `B: ${mid} 没有刷出首领`);
    ok(r.badB === 0, `B: ${mid} 首领刷在 zone 外`);
    /* 同屏上限 PC 36：实际存活数会被 cap 截断，所以只要求 ≥ 24 */
    ok(r.n >= 24, `B: ${mid} 只刷出 ${r.n} 只怪，太少`);
    /* 大图的意义就在这：出生点附近只占一小块，大半怪在 62 米外。
     * 如果这里一直是 0，说明 AI 降频（§5.4）根本没有生效对象。 */
    ok(r.culled >= 3, `B: ${mid} 视野外只有 ${r.culled} 只怪，AI 降频没有作用对象`);
    /* 大图的意义就在这：出生点附近只占一小块，大半怪在 62 米外。
     * 如果这里一直是 0，说明 AI 降频（§5.4）根本没有生效对象。 */
    ok(r.culled >= 3, `B: ${mid} 视野外只有 ${r.culled} 只怪，AI 降频没有作用对象`);
  }

  /* ---------- C. 小地图 ---------- */
  console.log('\n【C】小地图绘制');
  for (const mid of NEW_MAPS) {
    const r = await page.evaluate(async (mid) => {
      Game.state.level = 40; Game.recalc();
      Game.travelTo(mid);
      await new Promise(res => setTimeout(res, 900));
      const cv = document.getElementById('minimap');
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      let threw = null;
      try { UI.drawMinimap(); } catch (e) { threw = e.message; }
      /* 采样：统计非透明像素与不同颜色数 —— 画布全空说明什么都没画 */
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let painted = 0;
      const cols = new Set();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 8) {
          painted++;
          if (cols.size < 400) cols.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
        }
      }
      return { threw, painted, colors: cols.size, total: cv.width * cv.height, zone: (document.getElementById('zoneName') || {}).textContent };
    }, mid);
    console.log(`  像素 ${r.painted}/${r.total} · 颜色 ${r.colors} 种 · 区域名「${r.zone}」${r.threw ? ' · 异常 ' + r.threw : ''}`);
    ok(!r.threw, `C: ${mid} 小地图抛异常：${r.threw}`);
    ok(r.painted > r.total * 0.3, `C: ${mid} 小地图只画了 ${(r.painted / r.total * 100).toFixed(0)}% 的像素`);
    ok(r.colors >= 6, `C: ${mid} 小地图只有 ${r.colors} 种颜色，区域轮廓可能没画出来`);
  }

  /* ---------- D. 帧率 ----------
   * 这段有两次踩坑，写下来免得下次再踩：
   *
   * 1) 不能用 Game.perf.frames 累计差值 —— 它每秒被 tickPerf 清零，
   *    两次采样跨过清零点就会算出负数。改成自己数 rAF 回调。
   * 2) 不能拿「老图 abyss」当基准 —— 第一次传送是冷启动，
   *    着色器还在编译，实测只有 2 FPS，而热起来之后同图有 20+ FPS。
   *    所以基准必须**热身之后再测**，且同一张图测两次取好的那次。
   *
   * 绝对帧率在 headless + swiftshader（纯软件渲染）下只反映相对开销，
   * 真机 GPU 通常高一个数量级。所以这里只设一个宽松地板（6 FPS）用来
   * 抓「明显崩了」的情况（例如地面贴图没缓存导致每帧重生成），
   * §5.4 的 50 FPS 预算以 dev/verify-perf.js 在真机上跑的结果为准。 */
  console.log('\n【D】37 只怪同屏帧率（软件渲染，仅看相对开销）');

  const measureFps = async (mid, mobs) => await page.evaluate(async (mid, mobs) => {
    Game.state.level = 40; Game.recalc();
    Game.travelTo(mid);
    await new Promise(res => setTimeout(res, 1500));
    Game.state.hp = 1e9;
    /* 把怪全部拉到玩家身边 8 米处 —— 模拟最坏情况（同屏全渲染） */
    const pp = Game.playerGroup.position;
    let i = 0;
    for (const e of Game.enemies) {
      if (i >= mobs) break;
      const a = i++ * 0.7;
      e.pos.x = pp.x + Math.cos(a) * 8;
      e.pos.z = pp.z + Math.sin(a) * 8;
    }
    const sample = () => new Promise(res => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else res(n / 2);
      };
      requestAnimationFrame(tick);
    });
    const a = await sample();       // 第一次：多半还在编译着色器
    const b = await sample();       // 第二次：热态
    return { fps: Math.max(a, b), cold: a, warm: b, n: Game.enemies.length };
  }, mid, mobs);

  /* 热身：先随便进一张图跑一会儿，把着色器 / 贴图全部预热 */
  await measureFps('abyss', 12);
  console.log('  （已热身）');

  for (const mid of NEW_MAPS) {
    const r = await measureFps(mid, 37);
    console.log(`  ${mid.padEnd(12)} ${String(r.n).padStart(2)} 只 · ${r.fps.toFixed(1)} FPS（冷 ${r.cold.toFixed(1)} / 热 ${r.warm.toFixed(1)}）`);
    ok(r.fps >= 6, `D: ${mid} 只有 ${r.fps.toFixed(1)} FPS，低于软件渲染地板 6`);
  }

  if (SHOT) {
    const p = path.join(ROOT, 'dev/shot-m3.png');
    await page.screenshot({ path: p });
    console.log('\n截图：' + p);
  }

  /* ---------- 结果 ---------- */
  if (errs.length) {
    console.log('\n页面错误：');
    for (const e of errs.slice(0, 10)) console.log('  ' + e);
  }
  ok(errs.length === 0, `页面报了 ${errs.length} 个错误`);
  console.log('\n' + (fails.length ? '❌ ' + fails.length + ' 项失败' : '✅ 全部通过'));
  for (const f of fails) console.log('  ✗ ' + f);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
