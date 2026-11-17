/*
 * U12 线上验收 —— 正式站上 U8 / U9 / U10 三块 BOSS 视觉是否真的在跑
 *
 *   node dev/probe-live-u12.js
 *
 * 与 probe-enemyfx / probe-wbzone / probe-bosslayout 的区别：
 *   那三支量的是**本地源码链路**（本地起服务或 file://），
 *   这支量的是 `https://718997675.github.io/jiuxiao-arpg/` 上**真正部署出去的那份**。
 *   U12 的验收口径就是「正式站上 88 招 0 空招 0 报错」，本地绿不代表线上绿
 *   （U11 那次就是 `fx2/boss-cast` 一个文件都没上去，本地却全绿）。
 *
 * 判据（任何一条红即 exit 1）：
 *   1. HTTP 200、能点开始、Game.running
 *   2. U9：EnemyFX 在，8 个形态网格 + 12 个词缀网格都建好了
 *   3. U8：wbWarnOf 在，6 只世界 Boss 的 18 招全有预警声明
 *   4. U8：FX.zone 支持 fan（真建一条，不报错）
 *   5. U10：BossCast 在且带 _lift（逐只排布的入口）
 *   6. 零 console / pageerror / 请求失败
 */
const puppeteer = require('./_pptr');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();

let pass = 0, fail = 0;
const ok = (c, name, extra) => {
  if (c) { pass++; console.log('  ✓ ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [], failed = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('requestfailed', r => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

  console.log('一、正式站加载');
  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  ok(resp.status() === 200, 'HTTP 200', resp.status());
  await wait(2500);

  const box = await page.$eval('#startBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await wait(2200);

  const st = await page.evaluate(() => {
    const G = (typeof Game !== 'undefined') ? Game : null;
    return {
      hasGame: !!G,
      running: !!(G && G.running),
      map: G && G.state ? G.state.mapId : null,
      fatal: getComputedStyle(document.getElementById('fatal')).display
    };
  });
  ok(st.hasGame === true, 'Game 全局已就绪', st.hasGame);
  ok(st.running === true, '开局 running', st.running);
  ok(st.fatal === 'none', 'fatal 未显示', st.fatal);

  console.log('\n二、U9 小怪常驻视觉（正式站）');
  const u9 = await page.evaluate(() => {
    if (typeof EnemyFX === 'undefined') return { missing: true };
    const st = EnemyFX.stats ? EnemyFX.stats() : {};
    return {
      mobs: st.mobMeshes,
      elites: st.eliteMeshes,
      drawCap: st.drawCap,
      bound: st.bound
    };
  });
  ok(!u9.missing, 'EnemyFX 已加载');
  ok(u9.bound === true, '已挂进场景（group bound）', u9.bound);
  ok(u9.mobs === 8, '8 个形态网格', u9.mobs);
  ok(u9.elites === 12, '12 个词缀网格', u9.elites);
  ok(u9.drawCap === 20, '绘制批次上限 20', u9.drawCap);

  console.log('\n三、U8 世界 Boss 形状预警（正式站）');
  const u8 = await page.evaluate(() => {
    if (typeof wbWarnOf !== 'function') return { missing: true };
    const declIds = Object.keys(WB_WARN || {});
    /* 用线上真实的 WORLD_BOSSES 技能数据遍历，不是拿 WB_WARN 自证 */
    const real = [];
    const bosses = (typeof WORLD_BOSS_ORDER !== 'undefined' && typeof WORLD_BOSSES !== 'undefined')
      ? WORLD_BOSS_ORDER.map(id => WORLD_BOSSES[id]).filter(Boolean) : [];
    for (const b of bosses) {
      for (const k in (b.skills || {})) {
        const sk = b.skills[k];
        if (sk && sk.id) real.push(sk);
      }
    }
    let withShape = 0;
    const bad = [];
    for (const sk of real) {
      const d = wbWarnOf(sk, { e: { pos: { x: 0, z: 0 } }, pp: { x: 1, z: 1 }, ang: 0.4 });
      if (d && d.shape && d.dur > 0) withShape++; else bad.push(sk.id);
    }
    /* FX.zone 的 fan 形状真建一条，确认线上这版有 fan 分支 */
    let fanOk = false, fanErr = null;
    try {
      const z = FX.zone({ shape: 'fan', pos: { x: 0, z: 0 }, radius: 6, dur: 0.4, color: 0xff8844 });
      fanOk = !!z;
      if (z && z.children) z.children.forEach(c => { if (c.material) c.material.opacity = 0; });
    } catch (e) { fanErr = String(e && e.message || e); }
    return { decls: declIds.length, real: real.length, withShape: withShape, bad: bad, fanOk: fanOk, fanErr: fanErr };
  });
  ok(!u8.missing, 'wbWarnOf 已加载');
  ok(u8.decls === 18, 'WB_WARN 声明 18 条', u8.decls);
  ok(u8.real === 18, '线上真实技能 6 只 × 3 = 18 招', u8.real);
  ok(u8.withShape === 18, '18 招真实数据都能翻译成形状', u8.withShape);
  ok(u8.bad.length === 0, '无翻译失败', u8.bad);
  ok(u8.fanOk === true && !u8.fanErr, 'FX.zone 支持 fan', u8.fanErr || 'ok');

  console.log('\n四、U10 逐只排布（正式站）');
  const u10 = await page.evaluate(() => {
    const bc = (typeof BossCast !== 'undefined') ? BossCast : null;
    if (!bc) return { missing: true };
    return {
      hasLift: typeof bc._lift === 'function',
      liftSrc: typeof bc._lift === 'function' ? String(bc._lift).length : 0
    };
  });
  ok(!u10.missing, 'BossCast 已加载');
  ok(u10.hasLift === true, 'BossCast._lift 存在（逐只 seed 入口）', u10.liftSrc);

  console.log('\n五、放技能 + 报错');
  await page.keyboard.press('1');
  await wait(900);
  const play = await page.evaluate(() => {
    const G = (typeof Game !== 'undefined') ? Game : null;
    return {
      running: !!(G && G.running),
      hp: G && G.state ? Math.round(G.state.hp) : null,
      calls: G && G.renderer ? G.renderer.info.render.calls : null
    };
  });
  ok(play.running === true, '放技能后仍在跑', play.running);
  ok(Number.isFinite(play.calls) && play.calls > 0, 'draw call 有读数', play.calls);

  ok(failed.length === 0, '无请求失败', failed.length ? failed.slice(0, 3) : 'none');
  ok(errs.length === 0, '零 console / pageerror', errs.length ? errs.slice(0, 3) : 'none');

  console.log('\n================================');
  console.log('  U12 线上验收：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('探针自身崩了：', e && e.stack || e);
  process.exit(2);
});
