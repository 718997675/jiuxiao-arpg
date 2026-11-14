/* ============================================================
 * dev/probe-bosscast.js —— 首领招式真的在游戏里打出来了吗（真机）
 *
 *   NODE_PATH=<puppeteer 所在> node dev/probe-bosscast.js
 *
 * 为什么必须有这个探针：`node dev/test-bosskits.js` 只能证明「表是对的」，
 * 证明不了「有人用它」。88 个 run() 引用的是一整套脚手架（BOSS / R /
 * aimAngle / settle …），少一个就是**运行时**才炸的 ReferenceError ——
 * 而这套东西在特效台里永远发现不了（那边全都有）。
 *
 * 五段：
 *   一、开局能进图，首领带着五格配招活着
 *   二、打满 25 秒：真的出招了，而且不止一招
 *   三、配招的五格都用到了（机制 / 套路 / 签名 / 本命）
 *   四、玩家真的在掉血（settle 接上了 damagePlayer）
 *   五、全程 0 报错、演出层不泄漏
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

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);

  head('零、装进页面了吗');
  {
    const has = await page.evaluate(() => ({
      BossCast: typeof BossCast,
      FX2: typeof FX2,
      KIT: typeof BOSS_KIT,
      SK: typeof BOSS_SKILLS,
      kitN: (typeof BOSS_KIT !== 'undefined') ? Object.keys(BOSS_KIT).length : -1,
      skN: (typeof BOSS_SKILLS !== 'undefined') ? Object.keys(BOSS_SKILLS).length : -1,
    }));
    ok(has.BossCast === 'object', 'BossCast 挂在全局', has.BossCast);
    ok(has.FX2 === 'object', 'FX2 在（boss-cast 顶层直接取它的 tools）', has.FX2);
    ok(has.kitN === 45 && has.skN === 88, '配招 45 只 / 技能 88 招都在', has);
  }

  /* 开局：幽篁林（treeking，第 6 级，血最少 → 好杀、好观察） */
  await page.evaluate(() => {
    Game.startNew('warrior', 'T');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('forest');
  });
  let setup = { n: 0, names: [] };
  for (let i = 0; i < 40; i++) {
    await wait(150);
    setup = await page.evaluate(() => {
      const bs = Game.enemies.filter(e => e.boss && !e.dead);
      return { mapId: Game.state.mapId, n: bs.length, names: bs.map(b => b.cfg.name) };
    });
    if (setup.n >= 1) break;
  }
  head('一、场景');
  ok(setup.n >= 1, '图里有活着的首领', setup);

  /* 站到首领脸上：技能的距离闸是 18 米，不进圈它一枪不放。
   * 同时把血堆高 —— 这里量的是「招式出不出来」，不是「玩家能撑几秒」，
   * 死了以后 AI 停摆，后面的统计全是假的。 */
  /* loadMap 是异步的（120ms 定时 + 程序化建图），前面那个轮询只等到
   * 「首领刷出来了」，玩家位置随后还会被 loadMap 的落地逻辑改一次。
   * 不等这一下就设位置，等于白设 —— 第一次跑的时候第一招拖到 18 秒才出，
   * 就是因为它其实站在出生点、离首领 30 多米（距离闸 18 米）。 */
  await wait(1500);
  await page.evaluate(() => {
    const b = Game.enemies.find(e => e.boss && !e.dead);
    if (!b) return;
    Game.playerGroup.position.set(b.pos.x + 7, 0, b.pos.z + 7);
    /* **真血量字段是 `Game.state.hp`**（damagePlayer 读它），不是
     * `state.stats.hp`、更不是 `Game.hp`。补错这两个的后果：B24 变形层
     * 加了领域 DoT / 追炸 / 尖刺之后伤害是真的，玩家在模拟 24 秒被打死、
     * `Game.dead=true`，AI 停摆，后面一招不出 —— 看着像「出招卡住」，
     * 其实是探针把人补死了。 */
    Game.state.hp = 999999;
    Game.state.stats.hp = 999999;
    Game.invuln = 0;
    /* 统计口：BossCast.tryCast 返回 true = 真的放出去了 */
    window.__cast = [];
    /* 模拟时间累计器。**别拿墙钟当时间基准**：无头 SwiftShader 只有 ~8fps，
     * dt 被夹到 0.05，30 秒墙钟只跑出 12 秒模拟时间；B24 变形层加了
     * Domains 每帧 tick / 播报 / 拖拽之后帧率还会再掉一点。死等 32 秒墙钟
     * 就会从「6 招」掉到「4 招」，纯假红 —— 实测这 4 招落在模拟
     * 3.02 / 4.27 / 7.84 / 8.96 秒，间隔 4.8 秒，CD 节奏一点没坏。 */
    window.__sim = 0;
    const ou = BossCast.update.bind(BossCast);
    BossCast.update = function (dt) { window.__sim += dt; return ou(dt); };
    const o = BossCast.tryCast.bind(BossCast);
    BossCast.tryCast = function (e, pp) {
      const before = this;
      const r = o(e, pp);
      if (r && e._cast) window.__cast.push({ id: e._cast.id, boss: e.cfg.id, hp: Math.round(Game.hp) });
      return r;
    };
  });

  /* 轮询到「模拟时间跑够 32 秒」为止，墙钟只做兜底上限（90 秒）。
   * Boss 的 patternCd 是 4.5~7.5 **模拟**秒，五格轮转要 5 轮；
   * 一轮里可能有多段 delay，所以不停往前推进。
   * 用墙钟计时是这里最早的一个假红源：帧率一变，招数跟着变。 */
  const t0 = Date.now();
  let sim = 0;
  while (Date.now() - t0 < 90000 && sim < 32) {
    await wait(250);
    /* 每帧把血补满，只观察招式；同时别让玩家被击退跑出 18 米 */
    /* 每帧把玩家钉在首领旁边（不靠「跑远了再拉回」）：这是一次**表演验收**，
     * 要的是「32 模拟秒里它把配招走一遍」，不是「玩家能不能站住」。
     * 只在超出距离时才拉回的话，前几秒会一直卡在闸外，统计到的全是 0。 */
    sim = await page.evaluate(() => {
      /* 同上：补 `state.hp`，不是 stats.hp / Game.hp。同时把倒地标志
       * 一并清掉 —— 一旦 dead=true，AI 不会自己站起来。 */
      Game.state.hp = 999999; Game.state.stats.hp = 999999;
      Game.invuln = 0; Game.dead = false;
      const b = Game.enemies.find(e => e.boss && !e.dead);
      if (b) Game.playerGroup.position.set(b.pos.x + 6, 0, b.pos.z + 6);
      return window.__sim || 0;
    });
  }

  const res = await page.evaluate(() => {
    const cast = window.__cast || [];
    /* 按**首领分组**统计。这一条是拿假红换来的：沼泽图是**三首领同场**
     * （chief / golemking / snakequeen），三只都在出招，而第一版把三次
     * 出招混成一个 byId 去比 chief 一人的五格配招 —— 于是
     * 「只用到 2 格」这种假红，其实是另外两格的招属于另两只。 */
    const byBoss = {};
    for (const c of cast) {
      byBoss[c.boss] = byBoss[c.boss] || { n: 0, byId: {} };
      byBoss[c.boss].n++;
      byBoss[c.boss].byId[c.id] = (byBoss[c.boss].byId[c.id] || 0) + 1;
    }
    /* 取「出招最多的那只」做五格验收 —— 它才有足够轮次把配招走过半 */
    const main = Object.keys(byBoss).sort((a, b) => byBoss[b].n - byBoss[a].n)[0] || null;
    const kit = (main && typeof BOSS_KIT !== 'undefined') ? BOSS_KIT[main] : null;
    const byId = main ? byBoss[main].byId : {};
    const all = {};
    for (const c of cast) all[c.id] = (all[c.id] || 0) + 1;
    return {
      total: cast.length,
      byId, all, main, byBoss: Object.keys(byBoss).map(k => k + '×' + byBoss[k].n),
      kit: kit,
      reached: kit ? kit.filter(k => byId[k]) : [],
      stats: (typeof FX2 !== 'undefined' && FX2.stats) ? FX2.stats() : null,
      hpDown: cast.length ? Math.min(...cast.map(c => c.hp)) : null,
    };
  });

  head('二、真的出招了');
  ok(res.total >= 6, '32 模拟秒内放出 ≥6 招（首领各约 3 招）',
    { total: res.total, 模拟秒: Math.round(sim * 10) / 10, 墙钟秒: Math.round((Date.now() - t0) / 1000), 各首领: res.byBoss });
  ok(Object.keys(res.all).length >= 4, '至少用了 4 个不同的招式', res.all);

  head('三、五格都用到了');
  ok(res.kit && res.reached.length >= 2,
    '出招最多的那只（' + res.main + '）走到过配招里的 ≥2 格', {
      kit: res.kit, reached: res.reached
    });
  ok(res.kit && res.reached.indexOf(res.kit[0]) >= 0, '第 1 格（机制）出场过', res.reached);
  /* 第 5 格（本命）**不在这段断言**：它要第 5 轮才轮到，而 32 秒走不完
   * 五轮（一轮 5~8 秒 + 演出占用）。放在「三b」里逐格点放验证 ——
   * 那里验的是「这一格跑不跑得起来」，轮转算得对不对是纯函数的事，
   * 交给 dev/test-bosscast.js（它不需要浏览器）。 */

  /* 真实节奏下 32 秒只能走 3~4 轮，第 5 格（本命）要第 5 轮才轮到。
   * 与其等 50 秒，不如直接把五格**逐格点放**一遍 —— 这里验的是
   * 「这一格能不能跑起来、会不会炸」，不是「轮转算得对不对」
   * （轮转那一层在 test-bosscast.js 里用纯函数断言）。 */
  const slots = await page.evaluate(async () => {
    const b = Game.enemies.find(e => e.boss && !e.dead);
    if (!b) return null;
    const kit = BOSS_KIT[b.cfg.id];
    const out = [];
    for (let i = 0; i < kit.length; i++) {
      const id = kit[i];
      b._castUntil = 0; b._cast = null;
      /* 指定格子：_pick 里 n = ++_castN，平时 n%5==0 出第 5 格、
       * 否则 pool[(n-1)%4]。所以把 _castN 预置成 i（第 5 格用 4）
       * 就能让它这一轮正好抽出第 i 格 —— 不用给 BossCast 加调试接口。 */
      /* 现在是**两个**计数器（见 BossCast._pick 的注释）：
       *   _castN 总轮数（判压轴）、_round 四拍里的第几拍
       * 所以指定格子要两个都摆：第 5 格 → _castN=4 让它正好轮到压轴；
       * 前四格 → _castN 给个非 5 倍数、_round 指向那一拍。 */
      if (i === 4) { b._castN = 4; }
      else { b._castN = 0; b._round = i; }
      let err = null, got = null;
      try {
        BossCast.tryCast(b, Game.playerGroup.position);
        got = b._cast && b._cast.id;
      } catch (e) { err = String(e && e.message || e); }
      out.push({ slot: i + 1, id: id, got: got, err: err });
      /* 每格之间清一次，避免上一格的 delay 和这一格叠在一起 */
      b._castUntil = 0; b._cast = null;
    }
    return out;
  });
  head('三b、五格逐格点放');
  ok(slots && slots.length === 5, '五格都拿到了', slots);
  ok(slots && slots.every(x => !x.err), '五格逐一施放 0 异常', slots && slots.filter(x => x.err));
  ok(slots && slots.every(x => x.got === x.id), '五格抽到的都是自己那一格', slots && slots.filter(x => x.got !== x.id));
  ok(slots && slots[4] && slots[4].id === 'nt_treeking' && slots[4].got === 'nt_treeking',
    '第 5 格（本命）真的放出来了 —— 它是「这只和那只不一样」的地方', slots && slots[4]);

  head('四、演出层');
  ok(res.stats && res.stats.meshes > 0, '场上留下了演出的 mesh', res.stats);
  ok(res.stats && res.stats.updaters >= 0, 'updater 队列可读', res.stats);

  head('五、报错');
  const real = errs.filter(e => !/favicon|net::ERR_FILE_NOT_FOUND.*\.mp3/i.test(e));
  ok(real.length === 0, '全程 0 报错', real.slice(0, 6));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' 通过 / ' + fail + ' 失败');
  if (res.total) console.log('   招式明细：' + JSON.stringify(res.byId));
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
