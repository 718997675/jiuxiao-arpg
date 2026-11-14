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
const puppeteer = require('./_pptr');
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
  /* 帧异常只打一句 err.message 是不够定位的（game.js 的兜底会把它吞成
   * 「[帧异常 x1] TypeError: ...」）。在页面最早期钩住 console.error，
   * 把 Error 对象的 stack 也留下来 —— 以后不用再写临时诊断脚本。 */
  await page.evaluateOnNewDocument(() => {
    window.__errStacks = [];
    const orig = console.error;
    console.error = function () {
      try {
        for (const a of arguments) if (a && a.stack) window.__errStacks.push(String(a.stack));
      } catch (e) { /* 别让捕获器自己炸了 */ }
      return orig.apply(this, arguments);
    };
  });

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

  head('四、B25 三条新应对轴真的生效');
  {
    /* ① totem：卵囊真的立起来（destructible 位），且**打掉就没事**。
     * 这一条最重要：`spawnDestructible` 此前有完整实现 + 28 项探针，
     * 但游戏里没有任何一招调它 —— 文案写着「优先打掉」，场上没目标。 */
    const t = await page.evaluate(async () => {
      FX2.clear(); Domains.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('spidermother', 0);     /* 机制位 = eggs */
      const born = await window.__until(() =>
        Game.enemies.some(e => !e.dead && e.destructible && e.kind === 'destructible'), 15000);
      const d = Game.enemies.find(e => !e.dead && e.destructible);
      return { id: out.id, born: born, name: d && d.cfg.name,
        ttl: d && d.destructible.ttl, sac: d && d.cfg && d.cfg.model,
        hint: out.hint };
    });
    ok(t.id === 'eggs' && t.born, '百子卵囊真的在场上立起来了（不是只有文案）', t);
    ok(t.ttl > 0 && t.sac === 'sac', '卵囊带读秒、用的是「囊」模型', t);
    ok(/打掉/.test(t.hint), '播报告诉玩家要转火打掉它', t.hint);

    /* 打掉之后预警圈不能继续亮着 —— 圈还在 = 玩家继续躲一个不存在的威胁。
     * 数 zone 句柄的 done 位（BFX.zone 返回 { kill() }）。 */
    const ringOff = await page.evaluate(async () => {
      FX2.clear(); Domains.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const P = Game.playerGroup.position;
      const e = { pos: { x: P.x + 1.5, z: P.z }, dmg: 10, dead: false,
        cfg: { id: 'probe' }, _castTok: 1 };
      const c = { e: e, sk: null, at: { shape: 'circle', x: P.x + 1.5, z: P.z, r: 3 },
        tw: { c: 0xffaa44, n: '测试图腾' }, tk: 1,
        p: { ttl: 6, r: 3, mul: 0.5 }, map: Game.state.mapId };
      BossTwist.OPS.totem(c);
      /* 取**最后一根**：前面的对照实验可能留下还没回收的图腾，
       * find() 会拿到旧的那根，onDeath 自然不是这次这张圈的。
       * 回收走 FX2 的 updater（按帧），无头下得轮询等它跑完。 */
      const alive = Game.enemies.filter(x => !x.dead && x.destructible);
      const d = alive[alive.length - 1];
      const before = FX2.stats().meshes;
      if (d) Game.destroyDestructible(d, false);
      await window.__until(() => FX2.stats().meshes < before, 8000);
      return { before: before, after: FX2.stats().meshes, killed: !!(d && d.dead) };
    });
    ok(ringOff.killed && ringOff.after < ringOff.before,
      '打掉图腾后预警圈也收掉了（不留下假的威胁）', ringOff);

    /* 到期 / 打掉 / 换图三条路径的**对照实验**。
     * 不能借 `tryCast` 来量：主招自己也会调 damagePlayer，计数窗口一抖
     * 就会把「主招那一下」读成「到期惩罚」（实测同样代码两次跑出 0 和 1）。
     * 直接调 op 造一根短读秒的图腾，把主招从式子里彻底拿掉。 */
    const paths = await page.evaluate(async () => {
      const P = Game.playerGroup.position;
      /* 图腾必须落在**伤害半径之内**，否则 `hurt()` 的距离闸直接 return，
       * 量出来永远是 0 次，会误判成「到期没惩罚」。真实数据里 `at` 用的是
       * 技能判定中心（贴着玩家），这里手工造就得自己对齐。 */
      const tx = P.x + 1.5, tz = P.z;
      const mk = () => {
        const e = { pos: { x: tx, z: tz }, dmg: 10, dead: false,
          cfg: { id: 'probe' }, _castTok: 1 };
        const c = { e: e, sk: null,
          at: { shape: 'circle', x: tx, z: tz, r: 3 },
          tw: { c: 0xffaa44, n: '测试图腾' }, tk: 1,
          p: { ttl: 1.0, r: 3, mul: 0.5 }, map: Game.state.mapId };
        BossTwist.OPS.totem(c);
        return Game.enemies.find(x => !x.dead && x.destructible);
      };
      const measure = async (action) => {
        FX2.clear(); Domains.clear();
        Game.enemies.filter(x => x.destructible && !x.dead).forEach(x => { x.dead = true; });
        Game.state.hp = 1e6; Game.state.stats.hp = 1e6;
        Game.invuln = 0; Game.dead = false;
        const d = mk();
        let hits = 0;
        const od = Game.damagePlayer.bind(Game);
        Game.damagePlayer = function (a, s, o) { hits++; return od(a, s, o); };
        try {
          if (action === 'kill' && d) Game.destroyDestructible(d, false);
          if (action === 'map') Game.state.mapId = 'swamp';   /* 真实存在的另一张图 */
          await new Promise(r => setTimeout(r, 4200));        /* 够 1.0 模拟秒走完 */
        } finally {
          Game.damagePlayer = od;
          Game.state.mapId = 'forest';
        }
        return { hits: hits, expired: !!(d && d.dead) };
      };
      return { expire: await measure('none'), kill: await measure('kill'), map: await measure('map') };
    });
    ok(paths.expire.expired && paths.expire.hits > 0,
      '图腾放着不管，读秒走完且真的炸一圈（惩罚成立）', paths);
    ok(paths.kill.hits === 0, '提前打掉就没有到期惩罚（转火是有回报的）', paths);
    ok(paths.map.hits === 0, '换图之后不会在新图上炸（sameMap 守卫）', paths);

    /* ② shroud：幻域真的进 Domains，且带了对应效果字段 */
    const sh = await page.evaluate(async () => {
      FX2.clear(); Domains.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const out = window.__cast('icequeen', 2);        /* ringshot → shroud/illusion */
      const hit = await window.__until(() => Domains.list.length > 0, 15000);
      const z = Domains.list[Domains.list.length - 1];
      return { id: out.id, hit: hit, preset: z && z.id,
        dim: z && z.player && z.player.minimapDim, owner: !!(z && z.owner),
        hint: out.hint };
    });
    ok(sh.id === 'ringshot' && sh.hit && sh.preset === 'illusion',
      '冰魄环真的压暗了小地图（illusion 预设第一次被用上）', sh);
    ok(sh.dim > 0 && sh.owner, '幻域有效果数值、也记住了主人', sh);

    /* ③ push：和 pull 方向相反。量「玩家离首领的距离变大」。
     * pull 的那一格是把人往里拽，这里是往外推 —— 同一套 dragPlayer，
     * 方向不能写反。 */
    const pu = await page.evaluate(async () => {
      FX2.clear(); Domains.clear();
      for (const e of Game.enemies) if (e.boss) e.dead = true;
      const P = Game.playerGroup.position;
      P.set(window.__P.x, 0, window.__P.z);
      await new Promise(r => setTimeout(r, 200));
      const out = window.__cast('riverwraith', 3);      /* tide → push */
      const p0 = { x: P.x, z: P.z };
      const moved = await window.__until(() => Math.hypot(P.x - p0.x, P.z - p0.z) > 0.4, 15000);
      const e = out.e;
      const d0 = Math.hypot(p0.x - e.pos.x, p0.z - e.pos.z);
      const d1 = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
      return { id: out.id, moved: moved, d0: +d0.toFixed(2), d1: +d1.toFixed(2) };
    });
    ok(pu.id === 'tide' && pu.moved && pu.d1 > pu.d0,
      '回潮把玩家往外推了（离首领更远，和 pull 相反）', pu);

  }

  head('五、45 只全覆盖（真机侧）');
  {
    const cov = await page.evaluate(() => ({
      kit: Object.keys(BOSS_KIT).length,
      tw: Object.keys(BOSS_TWIST).length,
      ops: Object.keys(BossTwist.OPS).length,
      slots: Object.values(BOSS_TWIST).reduce((n, t) => n + Object.keys(t.s || {}).length, 0)
    }));
    ok(cov.kit === 45 && cov.tw === 45, '真机里 45 只都写进了 BOSS_TWIST', cov);
    ok(cov.slots === 180, '45 只 × 4 格 = 180 条变形', cov.slots);
    ok(cov.ops >= 10, '变形层有 ≥10 种应对动作', cov.ops);
  }

  head('六、报错');
  const real = errs.filter(e => !/favicon|net::ERR_FILE_NOT_FOUND.*\.(mp3|ogg|wav)/i.test(e));
  if (real.length) {
    const stacks = await page.evaluate(() => window.__errStacks || []);
    stacks.slice(0, 2).forEach(s => console.log('    stack: ' + s.slice(0, 900).replace(/\n/g, '\n           ')));
  }
  ok(real.length === 0, '全程 0 报错', real.slice(0, 6));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
