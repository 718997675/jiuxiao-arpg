/* ============================================================
 * dev/worldboss-battle-live.js —— M18.7「多阶段战斗」浏览器实测
 *
 * worldboss-fight.js（离线）验的是**判定**：桩掉 FX / Game 之后，
 * 逐条量「这一下该不该命中」。它验不了的是「接进真游戏之后还成不成立」：
 *   · FX.telegraph / area / slash / beam 的**真签名**对不对
 *   · `Game.damageEnemy` 真的会读 `wbBlockFront`（P2 的盾不是装饰）
 *   · `Game.rootT` 真的会让人动不了（而不是只写了个字段）
 *   · 换图之后场地伤害真的停了（`WBFight.clear` 有没有被 loadMap 调到）
 * 这些都是「离线全绿、进游戏没反应」的典型位置。
 *
 * 怎么跑：headless swiftshader 只有 1~2 fps，**不能靠等**。
 *   所有时间推进都显式调：`WBFight.ai(e, dt, pp)` / `FX.update(dt)` /
 *   `WBFight.tick(dt)`。等时间只用来让 `travelTo` 建完图。
 *
 * 用法：node dev/worldboss-battle-live.js [--shot]
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXE = require('./_chrome');
const SHOT = process.argv.includes('--shot');
const wait = ms => new Promise(r => setTimeout(r, ms));

const fails = [];
const ok = (cond, msg, extra) => {
  if (!cond) {
    fails.push(msg);
    console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  }
  return cond;
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, `实际 ${a} / 期望 ${b}±${tol}`);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
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
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.mapsSeen = Object.keys(MAPS);
    /* 玩家血量拉满：这一段要测的是「BOSS 打得中」，不是「玩家扛不扛得住」。
     * 真按 60 级血量走，刑天两下就把人打死，后面的断言全变成在测复活流程。 */
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;

    /* 阶段播报要能观察：把 UI.toast 包一层记账 */
    window.__toasts = [];
    const _toast = UI.toast ? UI.toast.bind(UI) : null;
    UI.toast = (s, c) => { window.__toasts.push(String(s)); if (_toast) _toast(s, c); };

    /* 强制刷指定的一只到指定图。不走 rollNext（随机），
     * 否则每次跑测的 boss 都不一样，断言没法写。 */
    window.__force = (id, mapId) => {
      const pos = bossPosOf(mapId, id, 0);
      Game.state.worldBoss = {
        id, mapId, x: pos[0], z: pos[1],
        spawnAt: Date.now(), until: Date.now() + WORLD_BOSS_CFG.cycle,
        killed: false, killAt: 0
      };
      WorldBoss.despawn();
      if (Game.state.mapId !== mapId) Game.travelTo(mapId);
      WorldBoss.sync();
      return Game.enemies.find(e => e.wb && !e.dead) || null;
    };
    window.__pp = () => Game.playerGroup.position;
    /* 抬血 + 复活。**不能靠 `stats.hpMax`**：`recalc()` 会按属性重算，
     * 而 `loadMap` 又把 `hp` 重置回 `stats.hpMax`（60 级约 3100）。
     * 刑天一击 600+，七条预警一起结算必死；人一死，
     * `WBFight` 的 `if (g.dead) return` 会把后面所有断言变成假红。
     * 直接写一个远超上限的 hp —— 死亡判定只认 `hp <= 0`，不看上限。 */
    window.__hpUp = () => { Game.dead = false; Game.state.hp = 1e9; };
    /* 站到 boss 的某个方位：`ang` 是世界角度（0 = +z，与 rotation.y 同口径） */
    window.__stand = (e, ang, dist) => {
      Game.playerGroup.position.x = e.pos.x + Math.sin(ang) * dist;
      Game.playerGroup.position.z = e.pos.z + Math.cos(ang) * dist;
    };
  });
  await wait(400);

  /* ============================================================
   * 【A】刑天：三阶段真的按 1.00 / 0.66 / 0.33 切，且播报阶段名
   * ============================================================ */
  /* `travelTo` 有分帧的部分（建图 → 落地 → 淡入），所以 force 之后
   * 再补一次 `sync()`。只调一次的话偶发「实体没刷出来」——
   * headless 只有 1~2 fps，等 1.2 秒可能一帧都没跑，心跳 tick 还没补上。 */
  const spawnOn = async (id, mapId) => {
    await page.evaluate((a, b) => window.__force(a, b), id, mapId);
    await wait(1200);
    await page.evaluate(() => WorldBoss.sync());
    await wait(150);
  };

  console.log('【A】刑天三阶段 + 阶段播报');
  await spawnOn('xingtian', 'southgate');
  const A = await page.evaluate(() => {
    const e = Game.enemies.find(x => x.wb && !x.dead);
    if (!e) return { none: true };
    window.__hpUp();
    window.__x = e;
    const pp = window.__pp();
    window.__stand(e, 0, 6);
    window.__toasts.length = 0;
    WBFight.ai(e, 0.016, pp);                       // P1
    const p1 = { phase: e.wbPhase, stance: e.wbStance, dmg: e.dmg, toast: window.__toasts.slice() };
    e.hp = e.maxHp * 0.5; WBFight.ai(e, 0.016, pp); // P2
    const p2 = { phase: e.wbPhase, stance: e.wbStance, block: e.wbBlockFront, toast: window.__toasts.slice() };
    e.hp = e.maxHp * 0.2; WBFight.ai(e, 0.016, pp); // P3
    const p3 = { phase: e.wbPhase, stance: e.wbStance, block: e.wbBlockFront,
      atkCdBase: +e.atkCdBase.toFixed(3), baseAtkCd: e.cfg.atkCd, toast: window.__toasts.slice() };
    return { p1, p2, p3, name: e.cfg.name };
  });
  ok(!A.none, 'A: 刑天没刷出来');
  if (!A.none) {
    ok(A.p1.phase === 0 && A.p1.stance === 'axe', 'A: P1 姿态应为 axe', A.p1);
    ok(A.p1.toast.some(s => s.indexOf('斧') >= 0), 'A: P1 播报阶段名「斧」', A.p1.toast);
    ok(A.p2.phase === 1 && A.p2.block === true, 'A: P2 应持盾格挡', A.p2);
    ok(A.p2.toast.some(s => s.indexOf('盾') >= 0), 'A: P2 播报阶段名「盾」', A.p2.toast);
    ok(A.p3.phase === 2 && A.p3.block === false, 'A: P3 应弃守（不再格挡）', A.p3);
    ok(A.p3.toast.some(s => s.indexOf('舞干戚') >= 0), 'A: P3 播报阶段名「舞干戚」', A.p3.toast);
    near(A.p3.atkCdBase, A.p3.baseAtkCd / 2, 0.01, 'A: P3 攻速 ×2 → 普攻间隔减半');
    console.log('  ' + A.name + '：' + A.p1.toast.join(' / ') + ' → ' + A.p2.toast.join(' / ') +
      ' → ' + A.p3.toast.join(' / ') + '；P3 atkCdBase ' + A.p3.atkCdBase);
  }

  /* ============================================================
   * 【B】18 个招牌技能真的放得出来、预警真的会结算
   * ============================================================ */
  console.log('\n【B】出手：预警 → 结算');
  const B = await page.evaluate(() => {
    const e = window.__x; if (!e) return { none: true };
    window.__hpUp();
    const pp = window.__pp();
    window.__stand(e, 0, 6);
    FX.clear();
    /* 把 gcd / cd 全清掉，逼它一定出手。正常节奏里 wbGcd 是 0.9~1.7 秒。
     *
     * **要循环多轮**：P3 的技能表里有「战吼」（shape: self），抽到它这一轮
     * 就不会掉血 —— 只放一次的话有 1/3 概率假红。判据是「若干轮里至少
     * 有一轮打中」，不是「第一次一定打中」。 */
    let rounds = 0, tele = 0, taken = 0;
    while (rounds++ < 12 && taken <= 0) {
      e.wbGcd = 0;
      for (const k in e.wbCd) e.wbCd[k] = 0;
      WBFight.ai(e, 0.016, pp);
      const t = FX.zones.filter(z => z.type === 'tele').length;
      if (t > tele) tele = t;
      if (!t) continue;
      const hp0 = Game.state.hp;
      FX.update(3);                                 // 把所有预警推到结算
      taken += hp0 - Game.state.hp;
    }
    return { rounds, tele, dmgTaken: +taken.toFixed(1) };
  });
  ok(!B.none, 'B: 实体丢了');
  if (!B.none) {
    ok(B.tele > 0, 'B: 12 轮 ai() 都没铺出预警（技能全被距离/cd 挡住？）', B);
    ok(B.dmgTaken > 0, 'B: 预警结算后玩家没掉血（判定没跑 or 站错位置）', B);
    console.log('  ' + B.rounds + ' 轮出手，最多 ' + B.tele + ' 个预警，累计结算掉血 ' + B.dmgTaken);
  }

  /* ============================================================
   * 【C】P2 的盾：正面打折，背后全额
   * ============================================================ */
  console.log('\n【C】正面格挡 vs 背后');
  const C = await page.evaluate(() => {
    const e = window.__x; if (!e) return { none: true };
    window.__hpUp();
    e.hp = e.maxHp * 0.5;
    WBFight.ai(e, 0.016, window.__pp());
    if (e.wbPhase !== 1) return { phase: e.wbPhase };
    /* 定死朝向：rotation.y = 0 时面朝 +z（`updateBossAI` 里的 atan2 同口径） */
    e.actor.group.rotation.y = 0;
    const hit = (ang) => {
      window.__stand(e, ang, 5);
      const hp0 = e.hp;
      Game.damageEnemy(e, 1000, false);
      return +(hp0 - e.hp).toFixed(2);
    };
    const front = hit(0);            // 正面
    const side = hit(Math.PI * 0.6); // 侧面 108°（窗口外）
    const back = hit(Math.PI);       // 正后方
    return { phase: e.wbPhase, front, side, back };
  });
  ok(!C.none, 'C: 实体丢了');
  if (!C.none && C.front !== undefined) {
    ok(C.front > 0 && C.back > 0, 'C: 两侧都该掉血', C);
    ok(C.back > C.front * 2, 'C: 背后伤害应当明显高于正面（正面 ×0.4）', C);
    near(C.back / C.front, 2.5, 0.15, 'C: 正面折减到 40%');
    near(C.side, C.back, 1, 'C: 侧面在窗口外，应与背后同伤');
    console.log(`  正面 ${C.front} · 侧面 ${C.side} · 背后 ${C.back}（比值 ${(C.back / C.front).toFixed(2)}）`);
  } else if (!C.none) {
    ok(false, 'C: 没能进 P2', C);
  }

  /* ============================================================
   * 【D】战吼：快 50%，8 秒后自己掉回去
   * ============================================================ */
  console.log('\n【D】战吼攻速');
  const D = await page.evaluate(() => {
    const e = window.__x; if (!e) return { none: true };
    window.__hpUp();
    e.hp = e.maxHp * 0.2; WBFight.ai(e, 0.016, window.__pp());
    const base = e.atkCdBase;
    WBFight.cast(e, e.cfg.skills.wb_warcry, window.__pp());
    FX.update(1.0);                                  // 战吼预警 0.8 秒
    const hot = { haste: e.wbHaste, t: e.wbHasteT, atkCdBase: +e.atkCdBase.toFixed(3) };
    for (let i = 0; i < 9; i++) WBFight.ai(e, 1, window.__pp());
    const after = { haste: e.wbHaste, t: e.wbHasteT, atkCdBase: +e.atkCdBase.toFixed(3) };
    return { base: +base.toFixed(3), hot, after };
  });
  ok(!D.none, 'D: 实体丢了');
  if (!D.none) {
    near(D.hot.haste, 1.5, 0.01, 'D: 战吼应给 wbHaste 1.5');
    near(D.hot.atkCdBase, D.base / 1.5, 0.01, 'D: 战吼期间普攻间隔 ÷1.5');
    near(D.after.haste, 1, 0.01, 'D: 战吼 8 秒后应归位');
    near(D.after.atkCdBase, D.base, 0.01, 'D: 归位后回到阶段攻速');
    console.log(`  基线 ${D.base}s → 战吼 ${D.hot.atkCdBase}s → 8 秒后 ${D.after.atkCdBase}s`);
  }

  /* ============================================================
   * 【E】九尾狐：P1 分身、P2 定身（真的动不了）
   * ============================================================ */
  console.log('\n【E】九尾狐分身与定身');
  await spawnOn('jiuweihu', 'mirrorrealm');
  const E = await page.evaluate(() => {
    const e = Game.enemies.find(x => x.wb && !x.dead);
    if (!e) return { none: true };
    window.__hpUp();
    const pp = window.__pp();
    window.__stand(e, 0, 6);
    const before = Game.enemies.filter(x => x.wbClone).length;
    WBFight.ai(e, 0.016, pp);                        // P1 → 召分身
    const clones = Game.enemies.filter(x => x.wbClone && !x.dead);
    const cloneInfo = clones.map(c => ({
      boss: c.boss, wb: c.wb, active: c.active,
      hp: Math.round(c.hp), hpIs6pct: Math.abs(c.maxHp - Math.round(e.maxHp * 0.06)) <= 1,
      name: c.name
    }));
    /* P2：尾缚定身 */
    e.hp = e.maxHp * 0.5;
    WBFight.ai(e, 0.016, pp);
    const rootOnHit = e.wbRoot;
    Game.rootT = 0;
    window.__stand(e, 0, (e.cfg.skills.wb_tailbind.range || 20) * 0.75);
    const hpA = Game.state.hp;
    WBFight.cast(e, e.cfg.skills.wb_tailbind, pp);
    const teleN = FX.zones.filter(z => z.type === 'tele').length;
    FX.update(2);
    const hpB = Game.state.hp;
    const rootT = +(Game.rootT || 0).toFixed(2);
    const buffs = Game.statusBuffs().map(b => b.name);
    return { before, cloneCount: clones.length, cloneInfo, rootOnHit, rootT, buffs,
      phase: e.wbPhase, teleN, hurt: +(hpA - hpB).toFixed(1), dead: Game.dead,
      dist: +Math.hypot(Game.playerGroup.position.x - e.pos.x, Game.playerGroup.position.z - e.pos.z).toFixed(2),
      ringR: e.cfg.skills.wb_tailbind.range, eDmg: +e.dmg.toFixed(1) };
  });
  ok(!E.none, 'E: 九尾狐没刷出来');
  if (!E.none) {
    ok(E.before === 0, 'E: 上一只留下的分身没清干净', E.before);
    ok(E.cloneCount === 2, 'E: P1 应召 2 个分身', E.cloneCount);
    ok(E.cloneInfo.every(c => c.boss === false), 'E: 分身不能带 boss 标记（onKill 会去读 BOSSES）', E.cloneInfo);
    ok(E.cloneInfo.every(c => c.wb === false), 'E: 分身不能带 wb 标记（否则本尊算「还活着」）', E.cloneInfo);
    ok(E.cloneInfo.every(c => c.active === true), 'E: 分身必须一出生就追人（active）', E.cloneInfo);
    ok(E.cloneInfo.every(c => c.hpIs6pct), 'E: 分身血量应为本尊 6%', E.cloneInfo);
    near(E.rootOnHit, 2.5, 0.01, 'E: P2 enter.rootOnHit 应落到 wbRoot');
    ok(E.rootT > 0, 'E: 尾缚命中后玩家应被定身', E);
    ok(E.buffs.indexOf('定身') >= 0, 'E: buff 条应有「定身」', E.buffs);
    console.log('  分身 ' + E.cloneCount + ' 个（' + (E.cloneInfo[0] && E.cloneInfo[0].name) +
      '，血 ' + (E.cloneInfo[0] && E.cloneInfo[0].hp) + '）；尾缚定身 ' + E.rootT + ' 秒，buff：' + E.buffs.join(' / '));
  }

  /* ============================================================
   * 【F】相柳 P3 毒沼：掉血 → 换图停手
   * ============================================================ */
  console.log('\n【F】相柳毒沼与换图清场');
  await spawnOn('xiangliu', 'yellowferry');
  const F = await page.evaluate(async () => {
    const e = Game.enemies.find(x => x.wb && !x.dead);
    if (!e) return { none: true };
    window.__hpUp();
    const pp = window.__pp();
    window.__stand(e, 0, 6);
    e.hp = e.maxHp * 0.2;
    WBFight.ai(e, 0.016, pp);                        // 进 P3 → 铺毒沼
    const hazards = WBFight._hazards.length;
    const zones = FX.zones.filter(z => z.type === 'area').length;
    const h = WBFight._hazards[0];
    /* 站进毒沼中心（就是 boss 脚下），推 2.5 秒 */
    window.__stand(e, 0, 2);
    window.__hpUp();
    const hp0 = Game.state.hp;
    WBFight.tick(1.3);
    WBFight.tick(1.3);
    const lost = +(hp0 - Game.state.hp).toFixed(1);
    /* 出圈：不再掉血 */
    window.__stand(e, 0, 200);
    const hp1 = Game.state.hp;
    WBFight.tick(3);
    const outLost = +(hp1 - Game.state.hp).toFixed(1);
    window.__stand(e, 0, 2);
    /* 换图：场地必须清掉（否则新图上还在掉血，而且找不到源头） */
    Game.travelTo('jadecapital');
    await new Promise(r => setTimeout(r, 1200));
    return { hazards, zones, lost, outLost,
      afterHazards: WBFight._hazards.length,
      afterZones: FX.zones.filter(z => z.type === 'area').length,
      label: h && h.label, every: h && h.every, dmg: h && +h.dmg.toFixed(1),
      hx: h && +h.x.toFixed(1), hz: h && +h.z.toFixed(1), hr: h && h.r,
      px: +Game.playerGroup.position.x.toFixed(1), pz: +Game.playerGroup.position.z.toFixed(1),
      dead: Game.dead, hp: Math.round(Game.state.hp), hT: h && +h.t.toFixed(2),
      dist: h && +Math.hypot(Game.playerGroup.position.x - h.x, Game.playerGroup.position.z - h.z).toFixed(2) };
  });
  ok(!F.none, 'F: 相柳没刷出来');
  if (!F.none) {
    ok(F.hazards === 1, 'F: P3 应铺 1 层毒沼（不是 0 也不是 2）', F.hazards);
    ok(F.zones >= 1, 'F: 毒沼没有可视圆', F.zones);
    ok(F.label === '毒沼', 'F: 场地标注应为「毒沼」', F.label);
    ok(F.lost > 0, 'F: 站在毒沼里应当掉血', F);
    near(F.outLost, 0, 0.01, 'F: 出圈后不应再掉血');
    ok(F.afterHazards === 0, 'F: 换图后毒沼记账没清', F.afterHazards);
    ok(F.afterZones === 0, 'F: 换图后可视圆没清（会在新图上留一个大圈）', F.afterZones);
    console.log(`  毒沼 1 层，站 2.6 秒掉 ${F.lost} 血（每 ${F.every}s 一口 ${F.dmg}）` +
      `，出圈 ${F.outLost}，换图后剩 ${F.afterHazards} 层 / ${F.afterZones} 个圆`);
  }

  /* ============================================================
   * 【G】页面错误
   * ============================================================ */
  console.log('\n【G】页面错误');
  ok(errs.length === 0, 'G: 有页面错误', errs.slice(0, 5));
  console.log(errs.length ? '  ' + errs.slice(0, 5).join('\n  ') : '  无');

  if (SHOT) {
    await page.screenshot({ path: path.join(ROOT, 'shots', 'worldboss-battle.png') });
    console.log('\n  截图：shots/worldboss-battle.png');
  }

  await browser.close();
  console.log('\n' + '='.repeat(56));
  if (fails.length) {
    console.log('失败 ' + fails.length + ' 项：');
    for (const f of fails) console.log('  ✗ ' + f);
  }
  console.log('世界 Boss 战斗层（浏览器）：' + (fails.length ? '有失败' : '全部通过'));
  console.log('='.repeat(56));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
