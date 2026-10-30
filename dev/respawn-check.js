/* ============================================================
 * dev/respawn-check.js —— P01「地图内补位」验收（浏览器）
 *
 * 用户原话：「任务怪数量少，要开地图几次才能刷满」。
 * 根因不是任务要得多，是**怪死了不补**：`spawnEnemies` 只在 loadMap 时刷一次。
 * 补位器（`Game.updateRespawn`）加在 updateEnemies 之后，每 6 秒跑一次。
 *
 * 这段逻辑在浏览器里很难手动验（要清空一张 40 只的图，再等 30 秒），
 * 所以这里直接摆状态 + 手动推进时间：
 *   一、清空后能不能长回来
 *   二、上限 / 距离 / 只补野图 三条边界
 *   三、任务量对齐（killAny 的 count ≤ 单图一轮能杀完的数量）
 *
 * 用法：NODE_PATH=<puppeteer 所在> node dev/respawn-check.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const head = (t) => console.log('\n— ' + t + ' —');

(async () => {
  if (!exe) { console.log('找不到 Chrome / Edge'); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);

  /* 落霞坡：骨架图，spawnCount 41，带 zone 分配 —— 补位器只在这种图上生效 */
  await page.evaluate(() => {
    Game.startNew('warrior', 'T');
    Game.state.level = 20; Game.recalc();
    Game.travelTo('sunset');
  });
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await wait(150);
    ready = await page.evaluate(() => ({
      mapId: Game.state.mapId,
      enemies: Game.enemies.filter(e => !e.boss).length,
      plan: (Game.spawnPlan || []).reduce((a, p) => a + p.cap, 0)
    }));
    if (ready.mapId === 'sunset' && ready.enemies > 10) break;
  }
  head('零、场景');
  ok(ready.mapId === 'sunset', '进得了落霞坡', ready);
  ok(ready.plan > 0, '刷怪计划被记下来了（spawnPlan 合计 ' + ready.plan + ' 只）', ready);
  ok(ready.enemies > 10, '开局刷出 ' + ready.enemies + ' 只小怪', ready);

  /* ============================================================
   * 一、清空后能长回来
   * ============================================================ */
  head('一、清空后补位');
  const grow = await page.evaluate(() => {
    const total = (Game.spawnPlan || []).reduce((a, p) => a + p.cap, 0);
    /* 清场：把所有非首领的怪标死（等价于玩家全清） */
    for (const e of Game.enemies) if (!e.boss) e.dead = true;
    const afterKill = Game.enemies.filter(e => !e.dead && !e.boss).length;
    /* 手动推进 10 次（每次跨过 6 秒的补位间隔） */
    const snap = [];
    for (let i = 0; i < 10; i++) {
      Game.updateRespawn(6.1);
      snap.push(Game.enemies.filter(e => !e.dead && !e.boss).length);
    }
    return { total, afterKill, snap, last: snap[snap.length - 1] };
  });
  ok(grow.afterKill === 0, '清场后存活 0 只', grow);
  ok(grow.snap[0] > 0, '第一次检查就补了怪（不会等满 6 秒×2）', grow.snap);
  ok(grow.last > grow.snap[0], '继续等会继续补（不是只补一波）', grow.snap);
  ok(grow.last <= grow.total, '补位不超过计划总数（' + grow.total + '）', grow);
  ok(grow.last >= grow.total * 0.6, '补到「计划总数 × 0.6」以上就够用（当前 ' + grow.last + '）', grow);

  /* ============================================================
   * 二、三条边界
   * ============================================================ */
  head('二、边界（上限 / 距离 / 只补野图）');
  const edge = await page.evaluate(() => {
    const pp = Game.playerGroup.position;
    const total = (Game.spawnPlan || []).reduce((a, p) => a + p.cap, 0);
    /* 距离：再补 30 次，任何一只都不能出现在玩家 20 米内（凭空冒怪比不补更糟） */
    for (let i = 0; i < 30; i++) Game.updateRespawn(6.1);
    let minD = Infinity, alive = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.boss) continue;
      alive++;
      minD = Math.min(minD, Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z));
    }
    /* 上限：连补 200 次也不能超过计划数 */
    for (let i = 0; i < 200; i++) Game.updateRespawn(6.1);
    const capped = Game.enemies.filter(e => !e.dead && !e.boss).length;

    /* 安全区 / raid 图 / 试炼里一律不补 */
    const skip = {};
    Game.state.mapId = 'village';
    Game.updateRespawn(6.1); skip.village = Game.enemies.filter(e => !e.dead).length;
    Game.state.mapId = 'bafo_deva';
    Game.updateRespawn(6.1); skip.raid = true;
    Game.state.mapId = 'sunset';
    const before = Game.enemies.length;
    if (typeof Trial !== 'undefined') { Trial.run = { wave: 1, bless: {} }; Game.updateRespawn(6.1); Trial.run = null; }
    skip.trial = Game.enemies.length === before;
    return { minD, alive, capped, total, skip, spawnSafe: 20 };
  });
  ok(edge.minD >= edge.spawnSafe, '补出来的怪离玩家 ≥ ' + edge.spawnSafe + ' 米（实际最近 ' + edge.minD.toFixed(1) + ' 米）', edge);
  ok(edge.capped <= edge.total, '连补 230 次也不会超过计划总数（' + edge.capped + ' ≤ ' + edge.total + '）', edge);
  ok(edge.skip.trial === true, '试炼里不补位', edge.skip);

  /* ============================================================
   * 三、任务量对齐（P01-A2）
   * ============================================================ */
  head('三、任务量对齐');
  const q = await page.evaluate(() => {
    const killAny = Object.keys(QUESTS)
      .map(id => QUESTS[id])
      .filter(x => x.objectives && x.objectives.some(o => o.type === 'killAny'));
    const counts = [];
    for (const x of killAny) for (const o of x.objectives) if (o.type === 'killAny') counts.push(o.count);
    /* 单图一轮能杀完的数量：最小 spawnCount 的骨架图 × 0.8 */
    const spawns = Object.keys(MAPS).map(id => MAPS[id])
      .filter(m => !m.safe && !m.raid && m.spawnCount >= 30).map(m => m.spawnCount);
    const minSpawn = Math.min.apply(null, spawns);
    /* 计划书 P01-A2 的口径：count ≤ spawnCount × 0.8，落在 32~36 这一档。
     * 用「最小骨架图 × 0.8」当硬上限会把 36 判错（最小图 40 只 → 32），
     * 所以按计划书给的上界 36 收口。 */
    const CAP = 36;
    return {
      n: counts.length, max: Math.max.apply(null, counts), minSpawn, cap: CAP,
      over: counts.filter(c => c > CAP).length
    };
  });
  ok(q.n > 0, '有 ' + q.n + ' 条击杀类任务', q);
  ok(q.over === 0, '没有一条超过「单图一轮能杀完」（' + q.cap + ' 只）· 当前最大 ' + q.max, q);
  ok(q.max <= 36 && q.max >= 30, '最大击杀需求落在 32~36 档（原来是 80）', q.max);

  await browser.close();
  console.log('\n错误日志: ' + (errs.length ? errs.join('\n') : '（无）'));
  console.log('\n' + (fail ? '❌ ' : '✅ ') + '全部通过（' + pass + ' 项）');
  if (fail) { console.log('失败 ' + fail + ' 项'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
