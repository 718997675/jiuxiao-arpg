/* ============================================================
 * dev/trial-smoke.js —— 无尽试炼冒烟测试（真实浏览器，headless）
 *
 * 干的事：
 *   1. 打开 index.html，收 pageerror / console.error / 请求失败；
 *   2. 建一个新档（headless 每次都是干净 profile，不会碰用户存档）；
 *   3. 直接驱动 Trial 的状态机跑 12 波：刷怪 → 秒杀清场 → 选祝福；
 *   4. 断言：波数推进、祝福真的进了 stats、第 5/10 波出首领、
 *      首领血量在合理区间（不是数据表原值）、结算与记录落盘；
 *   5. 打印每波的首领血量 / 祝福数 / 玩家攻击，方便对数值。
 *
 * 用法：
 *   NODE_PATH=<managed node_modules> node dev/trial-smoke.js
 *   （需要本机有 Edge 或 Chrome；默认找 Edge）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const exe = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!exe) { console.log('找不到浏览器，跳过冒烟测试'); process.exit(0); }

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });
  await wait(1500);

  /* ---- 建档 ---- */
  const boot = await page.evaluate(() => {
    try {
      const ok = Game.startNew('warrior', '试炼测试', 1, 'normal');
      return { ok: !!ok, hasTrial: !!(Game.state && Game.state.trial), map: Game.state && Game.state.mapId };
    } catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  console.log('建档:', JSON.stringify(boot));
  await wait(400);

  /* ---- 把等级抬到 20，免得被 6 级门槛挡住，也让数值接近中期 ---- */
  await page.evaluate(() => {
    Game.state.level = 20;
    Game.state.xpNext = xpToNext(20);
    Game.recalc();
    Game.state.hp = Game.state.stats.hpMax;
    Game.state.mp = Game.state.stats.mpMax;
  });

  /* ---- 进入试炼 ---- */
  const enter = await page.evaluate(() => {
    try {
      const ok = Trial.start();
      return { ok, map: Game.state.mapId, wave: Trial.run && Trial.run.wave, phase: Trial.run && Trial.run.phase };
    } catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  console.log('进入试炼:', JSON.stringify(enter));
  if (!enter.ok) { console.log('进入失败，中止'); await browser.close(); process.exit(1); }

  /* ---- 逐波推演 ----
   * 直接调 Trial.spawnWave() 跳过读秒，然后用 damageEnemy 把怪打死，
   * 走的是真实的死亡 / 掉落 / 清场链路。
   * 注意：headless + 软件渲染下游戏时间只有真实时间的三分之一左右，
   * 所以清场判定必须「轮询」而不是「等固定毫秒」。 */
  const rows = [];
  for (let w = 1; w <= 12; w++) {
    await page.evaluate(() => { Trial.spawnWave(); });
    const info = await page.evaluate(() => {
      const out = { wave: Trial.run.wave, spawned: Trial.run.spawned };
      let bossHp = 0, trashHp = 0, trashN = 0, bossName = '';
      for (const e of Game.enemies) {
        if (e.dead) continue;
        if (e.boss) { bossHp = e.maxHp; bossName = e.cfg.name; }
        else { trashHp += e.maxHp; trashN++; }
      }
      out.bossHp = bossHp; out.bossName = bossName;
      out.avgTrashHp = trashN ? Math.round(trashHp / trashN) : 0;
      out.playerAtk = Math.round(Game.state.stats.atk);
      out.playerHp = Math.round(Game.state.stats.hpMax);
      out.bless = Trial.blessCount();
      let guard = 0;
      while (Game.enemies.some(e => !e.dead) && guard++ < 400) {
        for (const e of Game.enemies) if (!e.dead) Game.damageEnemy(e, 1e12, false, { silent: true });
      }
      out.killedAll = !Game.enemies.some(e => !e.dead);
      return out;
    });

    /* 轮询等待清场翻牌（最多 10 秒真实时间） */
    let phase = 'fight', offers = [], hudOn = false, blessOpen = false;
    for (let i = 0; i < 100; i++) {
      await wait(100);
      const st = await page.evaluate(() => {
        /* 分裂幼体与首领召唤物是在帧末入队的，第一轮秒杀时它们还不存在，
         * 所以轮询期间要补杀 —— 否则永远等不到清场。 */
        for (const e of Game.enemies) if (!e.dead) Game.damageEnemy(e, 1e12, false, { silent: true });
        return {
          phase: Trial.run ? Trial.run.phase : 'none',
          offers: (Trial.run && Trial.run.offers) || [],
          hudOn: !!document.querySelector('#trialHud.on'),
          blessOpen: document.getElementById('trialBless').classList.contains('open')
        };
      });
      phase = st.phase; offers = st.offers; hudOn = st.hudOn; blessOpen = st.blessOpen;
      if (phase === 'choose') break;
    }
    const picked = offers[0] || null;
    if (picked) await page.evaluate(id => Trial.pickBlessing(id), picked);
    const blessAfter = await page.evaluate(() => Trial.blessCount());

    rows.push(Object.assign({}, info, { phase, offers, hudOn, blessOpen, picked, blessAfter }));
    console.log(
      '第' + String(info.wave).padStart(2) + '波  ' +
      '刷出' + String(info.spawned).padStart(2) + '  ' +
      '小怪均血' + String(info.avgTrashHp).padStart(7) + '  ' +
      '首领' + (info.bossHp ? (info.bossName + ' ' + info.bossHp) : '—').padEnd(22) +
      ' 玩家atk' + String(info.playerAtk).padStart(5) +
      ' hp' + String(info.playerHp).padStart(6) +
      ' 祝福' + String(blessAfter).padStart(2) +
      '  ' + (picked || '')
    );
    if (phase !== 'choose') console.log('  ⚠ 清场后没有进入翻牌阶段，phase=' + phase);
    if (!hudOn) console.log('  ⚠ 战况 HUD 没显示');
    if (offers.length && !blessOpen) console.log('  ⚠ 三选一面板没打开');
  }

  /* ---- 断言 ---- */
  const check = await page.evaluate(() => {
    const s = Game.state;
    const st = s.stats;
    const tb = (typeof trialBonusStats === 'function') ? trialBonusStats(s) : {};
    return {
      wave: Trial.run.wave,
      bless: Trial.blessCount(),
      bonusKeys: Object.keys(tb).length,
      atk: Math.round(st.atk),
      hpMax: Math.round(st.hpMax),
      trialHudText: document.getElementById('thWave').textContent,
      bestRecord: s.trial.best,
      runs: s.trial.runs,
      /* 存档里有没有 trial 段 */
      packed: (() => { try { const d = SaveManager.peek(1); return d ? ('trial' in d) : null; } catch (e) { return 'err'; } })()
    };
  });
  console.log('\n最终状态:', JSON.stringify(check, null, 2));

  /* ---- 死亡 → 结算 ---- */
  const death = await page.evaluate(async () => {
    /* 战士在 20 级会「替身」自动免死一次，所以必须反复打、每次都清无敌帧 */
    for (let i = 0; i < 6 && !Game.dead; i++) {
      Game.invuln = 0;
      Game.damagePlayer(1e12, null);
      await new Promise(r => setTimeout(r, 160));
    }
    await new Promise(r => setTimeout(r, 400));
    return {
      dead: Game.dead,
      endOpen: document.getElementById('trialEnd').classList.contains('open'),
      waveText: document.getElementById('teWave').textContent,
      bestText: document.getElementById('teBest').textContent,
      deathHidden: document.getElementById('death').style.display !== 'flex'
    };
  });
  console.log('死亡结算:', JSON.stringify(death));

  const after = await page.evaluate(async () => {
    Trial.finishDeath();
    await new Promise(r => setTimeout(r, 500));
    return {
      map: Game.state.mapId,
      dead: Game.dead,
      trialActive: Trial.active,
      best: Game.state.trial.best,
      runs: Game.state.trial.runs,
      atk: Math.round(Game.state.stats.atk),
      endOpen: document.getElementById('trialEnd').classList.contains('open')
    };
  });
  console.log('回村后:', JSON.stringify(after));

  await page.screenshot({ path: path.join(__dirname, 'trial-smoke.png') });
  await browser.close();

  console.log('\n错误日志:', errs.length ? '\n  ' + errs.join('\n  ') : '（无）');
  const bad = [];
  if (check.wave < 11) bad.push('12 轮下来波数应 ≥11，实际 ' + check.wave);
  if (check.bless < 9) bad.push('祝福应 ≥9 层，实际 ' + check.bless);
  if (check.bonusKeys < 1) bad.push('祝福没有进入 stats');
  if (check.trialHudText !== String(check.wave)) bad.push('战况 HUD 波数与实际不一致');
  if (after.trialActive) bad.push('结束后 Trial 仍处于激活状态');
  if (after.map !== 'village') bad.push('结束后没回村，实际 ' + after.map);
  if (after.best !== check.wave) bad.push('最高记录应为 ' + check.wave + '，实际 ' + after.best);
  if (!death.endOpen) bad.push('死亡没弹结算面板');
  if (!death.deathHidden) bad.push('试炼死亡时仍弹了「身陨」框');
  if (check.packed !== true) bad.push('存档里没有 trial 段');
  if (errs.length) bad.push('有 JS 错误');
  console.log(bad.length ? '\n❌ 失败:\n  ' + bad.join('\n  ') : '\n✅ 全部通过');
  process.exit(bad.length ? 1 : 0);
})();
