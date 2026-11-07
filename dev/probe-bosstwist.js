/* ============================================================
 * dev/probe-bosstwist.js —— 「每只自己的四拍」在真机上到底生不生效
 *
 *   NODE_PATH=<puppeteer 所在> node dev/probe-bosstwist.js
 *
 * 为什么非要有这一条：`test-bosstwist.js` 只能证明**表的结构对**。
 * 表对了、但 tryCast 没调、op 名字打错、Domains 没加载、播报元素没接上 ——
 * 全都是「静态全绿、玩起来什么都没有」，和 B21 那次 `o is not defined`
 * 一模一样的病。
 *
 * ⚠️ 无头环境里 rAF 只有 ~5 帧/秒，而 FX2 的 dt 被夹在 0.05 秒：
 *    **模拟时间比墙钟慢 4~5 倍**。所以这里一律**轮询**，不写固定 sleep ——
 *    第一版按 `warm + 300ms` 等，全部判成「变形没发生」，其实只是还没到那一拍。
 *
 * 五段：
 *   一、装进页面了吗（BossTwist / BOSS_TWIST / OPS）
 *   二、播报真的出现（普通四拍 + 本命两种样式）
 *   三、变形真的发生（domain / pull / guard / spikes）
 *   四、语义对不对（内圈安全、外圈吃伤；格挡会自己摘掉）
 *   五、全程 0 报错
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const exe = (() => {
  try { return require('./_chrome'); } catch (e) { /* 老机器走下面 */ }
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(f => fs.existsSync(f));
})();

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const head = (t) => console.log('\n— ' + t + ' —');

(async () => {
  if (!exe) { console.log('找不到 Chrome / Edge，跳过'); process.exit(1); }
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
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);

  head('零、装进页面了吗');
  {
    const has = await page.evaluate(() => ({
      BossTwist: typeof BossTwist,
      data: typeof BOSS_TWIST,
      bosses: (typeof BOSS_TWIST !== 'undefined') ? Object.keys(BOSS_TWIST).length : -1,
      ops: (typeof BossTwist !== 'undefined') ? Object.keys(BossTwist.OPS) : [],
      castbar: !!document.getElementById('castbar'),
      banner: !!(typeof UI !== 'undefined' && UI.castBanner)
    }));
    ok(has.BossTwist === 'object', 'BossTwist 挂在全局', has.BossTwist);
    ok(has.data === 'object' && has.bosses >= 8, 'BOSS_TWIST 有 ≥8 只', has.bosses);
    ok(has.ops.length >= 6, 'OPS 都在（' + has.ops.join(' / ') + '）', has.ops);
    ok(has.castbar && has.banner, '播报元素与 UI.castBanner 都在', has);
  }

  await page.evaluate(() => {
    Game.startNew('warrior', 'T');
    Game.state.level = 60; Game.recalc();
    Game.travelTo('forest');
  });
  await wait(2600);

  await page.evaluate(() => {
    const p = Game.playerGroup.position;
    window.__P = { x: p.x, z: p.z };
    Game.invuln = 0;
    /* 真正管血的是 `Game.state.hp`；`Game.hp` 只是个显示副本。
     * 只改 Game.hp 的话玩家其实还是几百血 —— 一发就倒地，AI 停摆，
     * 后面所有「变形有没有发生」都会读成 0（这个坑在这次改之前踩过）。 */
    Game.state.stats.hp = 1e6; Game.state.hp = 1e6;

    /* 轮询：无头下模拟时间慢 4~5 倍，固定 sleep 一定会误判 */
    window.__until = async function (fn, ms) {
      const t0 = performance.now();
      while (performance.now() - t0 < (ms || 15000)) {
        let v = false;
        try { v = fn(); } catch (e) { /* 还没准备好 */ }
        if (v) return true;
        await new Promise(r => setTimeout(r, 60));
      }
      return false;
    };

    /* 在玩家旁边放一只指定首领，指定格子点放一次 */
    window.__cast = function (bossId, slot) {
      const P = Game.playerGroup.position;
      const e = Game.spawnEnemy(null, P.x + 5, P.z + 5, false, 60, bossId);
      if (!e) return { err: 'spawn 失败' };
      e.hp = e.maxHp = 999999; e.dead = false; e._castUntil = 0; e._cast = null;
      Game.state.stats.hp = 1e6; Game.state.hp = 1e6; Game.invuln = 0;
      const kit = BOSS_KIT[bossId] || [];
      const id = kit[slot];
      if (slot === 4) e._castN = 4; else { e._castN = 0; e._round = slot; }
      const before = {
        domains: (typeof Domains !== 'undefined') ? Domains.list.length : -1,
        meshes: FX2.stats().meshes,
        hp: Game.hp,
        px: P.x, pz: P.z
      };
      let err = null;
      try { BossCast.tryCast(e, P); } catch (ex) { err = String(ex && ex.message || ex); }
      return { e: e, id: id, got: e._cast && e._cast.id, err: err, before: before,
        name: document.getElementById('castName').textContent,
        hint: document.getElementById('castHint').textContent,
        on: document.getElementById('castbar').classList.contains('on'),
        native: document.getElementById('castbar').classList.contains('native') };
    };
  });

  head('一、播报（同步，出招那一刻就写进 DOM）');
  {
    const r = await page.evaluate(() => {
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('treeking', 1);   /* 套路A = slam */
      return { id: out.id, name: out.name, hint: out.hint, on: out.on, native: out.native, err: out.err };
    });
    ok(r.id === 'slam' && !r.err, '第 2 格放的是 slam', r);
    ok(r.name === '裂根震', '播报用的是**这一只自己的叫法**（不是共享招的「砸地」）', r.name);
    ok(r.hint === '砸完别贴边', '播报带上了应对提示', r.hint);
    ok(r.on === true && r.native === false, '播报条亮着，且不是本命样式', r);

    const n = await page.evaluate(() => {
      const out = window.__cast('treeking', 4);
      return { id: out.id, name: out.name, hint: out.hint, native: out.native };
    });
    ok(n.id === 'nt_treeking' && n.name === '绞根', '本命播报读的是本命自己的名字', n);
    ok(n.native === true, '本命走大号样式（5 轮才出一次，不能被普通招盖住）', n);
  }

  head('二、变形真的发生');
  {
    /* ① domain：树王 腐叶瘴 → Domains 多一块 poison */
    const d = await page.evaluate(async () => {
      FX2.clear(); Domains.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('treeking', 0);      /* 机制位 = sporecloud */
      const hit = await window.__until(() => Domains.list.length > out.before.domains, 15000);
      const z = Domains.list[Domains.list.length - 1];
      return { id: out.id, hit: hit, n: Domains.list.length,
        preset: z && z.id, dot: z && z.player && z.player.dotPct, owner: !!(z && z.owner) };
    });
    ok(d.id === 'sporecloud' && d.hit, '腐叶瘴留下了一块领域（命中那一拍才落）', d);
    ok(d.dot > 0, '这块领域带持续伤害（不是只有个圈）', d);
    ok(d.owner === true, '领域记住了主人（主人死了要跟着散）', d);

    /* ② pull：酋长 蛮冲 → 玩家被拽向首领（量玩家位移，别量两者距离：
     * 首领自己也会冲过来，那样分不清是谁动的） */
    const p = await page.evaluate(async () => {
      FX2.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const P = Game.playerGroup.position;
      P.set(window.__P.x, 0, window.__P.z);
      await new Promise(r => setTimeout(r, 200));
      const out = window.__cast('chief', 2);          /* 套路B = charge */
      const p0 = { x: P.x, z: P.z };
      await window.__until(() => Math.hypot(P.x - p0.x, P.z - p0.z) > 0.4, 15000);
      return { id: out.id, moved: +Math.hypot(P.x - p0.x, P.z - p0.z).toFixed(2) };
    });
    ok(p.id === 'charge' && p.moved > 0.4, '蛮冲把玩家拽动了（拖拽真的接上了）', p);

    /* ③ guard：石王 岩甲 → 正面格挡立起来 */
    const g = await page.evaluate(async () => {
      FX2.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('golemking', 0);      /* 机制位 = stonearmor */
      const hit = await window.__until(() => !!out.e.guardFront, 15000);
      const gf = out.e.guardFront;
      return { id: out.id, hit: hit, arc: gf && gf.arc, mul: gf && gf.mul, turn: gf && gf.turn };
    });
    ok(g.id === 'stonearmor' && g.arc === 120 && g.mul === 0.2,
      '岩甲立起正面格挡（120° / ×0.2 / 转身 1.2 秒）', g);

    /* ④ spikes：落点外圈长出一圈尖刺（数 mesh 增量） */
    const s = await page.evaluate(async () => {
      FX2.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('golemking', 1);      /* 套路A = slam */
      const hit = await window.__until(() => FX2.stats().meshes > out.before.meshes + 5, 15000);
      return { id: out.id, hit: hit, meshes: FX2.stats().meshes, before: out.before.meshes };
    });
    ok(s.id === 'slam' && s.hit, '碎岩拳在落点外圈长出了尖刺（不止地上的圈）', s);
  }

  head('三、语义对不对（不是只有圈，是真有区别）');
  {
    /* 内圈安全 / 外圈吃伤 —— 「别贴边」这条答案能不能成立就看这里。
     *
     * 判据不用「掉了多少血」而用**挨了几下**：`Game.hp` 是个显示副本
     * （真正扣的是 `Game.state.hp`），而且首领一发的数值在四位数上下，
     * 两次之间差那半下会被四舍五入吃掉。数 damagePlayer 的调用次数，
     * 一次 = 只吃了主招，两次 = 主招 + 变形层那一圈刺。 */
    const cmp = await page.evaluate(async () => {
      const run = async (offset) => {
        FX2.clear();
        for (const e of Game.enemies) if (e.boss) e.dead = true;
        const P = Game.playerGroup.position;
        P.set(window.__P.x, 0, window.__P.z);
        Game.state.stats.hp = 1e6; Game.state.hp = 1e6; Game.invuln = 0; Game.dead = false;
        let hits = 0;
        const od = Game.damagePlayer.bind(Game);
        Game.damagePlayer = function (a, src, o) { hits++; return od(a, src, o); };
        try {
          window.__cast('golemking', 1);
          P.set(window.__P.x + offset, 0, window.__P.z);
          await window.__until(() => hits > 0, 12000);
          await new Promise(r => setTimeout(r, 1500));   /* 等变形层那一拍 */
        } finally { Game.damagePlayer = od; }
        return hits;
      };
      const center = await run(0);
      const outer = await run(4.0);      /* slam 的 R 是 4.6 → 0.87R，正好在环带里 */
      return { center: center, outer: outer };
    });
    ok(cmp.outer > cmp.center, '站外圈比站圆心多挨一下（内圈安全 / 外圈吃刺）', cmp);

    /* 格挡会自己摘掉 —— 不摘的话这只怪从此永久免疫正面。
     * 数据里 dur 是 4 秒（模拟时间），无头下要走 20 秒墙钟，太慢；
     * 这里把那一格临时改成 0.4 秒，验的是**同一条清理路径**。 */
    const clr = await page.evaluate(async () => {
      BOSS_TWIST.golemking.s.stonearmor.ops[0][1].dur = 0.4;
      const out = window.__cast('golemking', 0);
      const on = await window.__until(() => !!out.e.guardFront, 15000);
      const off = await window.__until(() => !out.e.guardFront, 15000);
      return { on: on, off: off };
    });
    ok(clr.on && clr.off, '岩甲到点自己摘掉了（不会永久免疫正面）', clr);
  }

  head('四、报错');
  const real = errs.filter(e => !/favicon|net::ERR_FILE_NOT_FOUND.*\.(mp3|ogg|wav)/i.test(e));
  ok(real.length === 0, '全程 0 报错', real.slice(0, 6));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
