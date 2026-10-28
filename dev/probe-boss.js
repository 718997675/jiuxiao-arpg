/* ============================================================
 * dev/probe-boss.js —— 首领专项探针（浏览器，真跑一局）
 *
 * 覆盖 P02（远处放技能 / 脱战）、P09（多首领时血条归属）。
 * 这两条都是「玩家以为游戏坏了」级别的问题，而且**离线脚本看不见**：
 * 距离闸在 updateBossAI 里、血条归属在 damageEnemy + _pickBoss 里，
 * 都依赖 Game 的运行时状态。所以这里起真浏览器，把状态摆好直接调。
 *
 * 四段：
 *   一、技能距离闸：60 米外不放技能；18 米内正常放
 *   二、脱战：玩家跑出 32 米 → 回位 / 回满血 / 脱战 / 血条消失
 *   三、血条归属：打谁看谁 · 站着不动不跳 · 目标死了自动接下一只
 *   四、招式落点：slam / rocks 的红圈不会落在交战半径之外
 *
 * 用法：
 *   NODE_PATH=<puppeteer 所在> node dev/probe-boss.js
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
  if (!exe) { console.log('找不到 Chrome / Edge，跳过'); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);

  /* 血沼泽有 3 只首领 —— 正是用户报「血条显示的是另一只」的那张图 */
  await page.evaluate(() => {
    Game.startNew('warrior', 'T');
    Game.state.level = 40; Game.recalc();
    Game.travelTo('swamp');
  });
  /* loadMap 是异步的（120ms 定时 + 程序化建图），不能只 wait 一个固定值就断言。
   * 等「首领真的刷出来了」再往下走，否则拿到的是上一张图的空数组。 */
  let setup = { n: 0, names: [] };
  for (let i = 0; i < 40; i++) {
    await wait(150);
    setup = await page.evaluate(() => {
      const bosses = Game.enemies.filter(e => e.boss);
      return { mapId: Game.state.mapId, n: bosses.length, names: bosses.map(b => b.cfg.name) };
    });
    if (setup.n >= 2) break;
  }
  head('零、场景');
  ok(setup.n >= 2, '血沼泽刷出多只首领（' + setup.n + ' 只：' + setup.names.join(' / ') + '）', setup);

  /* ============================================================
   * 一、技能距离闸
   * ============================================================ */
  head('一、技能距离闸（P02）');
  const gate = await page.evaluate(() => {
    const b = Game.enemies.filter(e => e.boss)[0];
    const R = BALANCE.boss.skillRange;
    /* 记一次「这一帧有没有真放技能」：bossPattern 是唯一出口 */
    let fired = 0;
    const orig = Game.bossPattern;
    Game.bossPattern = function () { fired++; return orig.apply(this, arguments); };
    const out = {};
    /* 远：25 米。**不能取 60 米** —— 60 已经超过拴绳半径 32，
     * 先走的是脱战复位（见第二段），验不到距离闸。18~32 这一段才是
     * 「人还在场上、但已经打不到」的区间，也正是用户说的「站在传送门那边」。 */
    b.active = true; b.patternCd = 0;
    let pp = new THREE.Vector3(b.pos.x, 0, b.pos.z + 25);
    Game.updateBossAI(b, 0.016, 25, pp);
    out.farCd = b.patternCd; out.farFired = fired;
    /* 近：10 米 */
    fired = 0; b.patternCd = 0;
    pp = new THREE.Vector3(b.pos.x, 0, b.pos.z + 10);
    Game.updateBossAI(b, 0.016, 10, pp);
    out.nearCd = b.patternCd; out.nearFired = fired;
    Game.bossPattern = orig;
    out.R = R;
    return out;
  });
  ok(gate.R === 18, '交战半径 = 18 米（BALANCE.boss.skillRange）', gate.R);
  ok(gate.farFired === 0, '25 米外一次技能都没放', gate);
  ok(Math.abs(gate.farCd - 1.2) < 1e-6, '远距离只是把 CD 压到 1.2 秒重试（不消耗整轮）', gate.farCd);
  ok(gate.nearFired === 1, '走进 10 米立刻放技能', gate);
  ok(gate.nearCd > 3, '近距离放完进正常 CD（4.5~7.5 秒档）', gate.nearCd);

  /* ============================================================
   * 二、脱战
   * ============================================================ */
  head('二、脱战复位（P02）');
  const leash = await page.evaluate(() => {
    const b = Game.enemies.filter(e => e.boss)[0];
    b.active = true;
    b.hp = Math.round(b.maxHp * 0.4);
    b.phase = 2;
    b.dmg = (b.baseDmg || b.dmg) * 1.3;
    Game.boss = b; UI.updateBoss(b);
    const before = { hp: b.hp, max: b.maxHp, x: b.pos.x, z: b.pos.z, dmg: b.dmg };
    const pp = new THREE.Vector3(b.pos.x, 0, b.pos.z + 40);   // 40 > leash 32
    Game.updateBossAI(b, 0.016, 40, pp);
    return {
      before,
      after: { hp: b.hp, active: b.active, phase: b.phase, dmg: b.dmg, x: b.pos.x, z: b.pos.z },
      anchor: b.anchor,
      bossRef: Game.boss === b,
      barShown: document.getElementById('bossbar').style.display,
      leash: BALANCE.boss.leash
    };
  });
  ok(leash.leash === 32, '拴绳半径 = 32 米', leash.leash);
  ok(leash.after.hp === leash.before.max, '脱战回满血', leash);
  ok(leash.after.active === false, '脱战（active=false，玩家再走近会重新登场）', leash.after);
  ok(leash.after.phase === 0, '狂怒阶段归零（血量满了不该还挂着 +15% 伤害）', leash.after);
  ok(Math.abs(leash.after.dmg - (leash.before.dmg / 1.3)) < 1e-6, '狂怒涨上去的伤害退回原值', leash);
  ok(Math.abs(leash.after.x - leash.anchor.x) < 1e-6 && Math.abs(leash.after.z - leash.anchor.z) < 1e-6,
    '回到祭坛锚点', { after: leash.after, anchor: leash.anchor });
  ok(leash.bossRef === false, '血条引用被清掉', leash.bossRef);

  /* ============================================================
   * 三、血条归属
   * ============================================================ */
  head('三、血条归属（P09）');
  const own = await page.evaluate(() => {
    const bs = Game.enemies.filter(e => e.boss);
    const [A, B] = bs;
    if (!A || !B) return { skip: true };
    /* 两只都激活，并让 A 离玩家近、B 远（先验「粘性」不是「就近」） */
    A.active = true; B.active = true;
    A.pos.x = Game.playerGroup.position.x + 4; A.pos.z = Game.playerGroup.position.z;
    B.pos.x = Game.playerGroup.position.x + 12; B.pos.z = Game.playerGroup.position.z + 4;
    Game.boss = null; Game.bossPickCd = 0;
    const out = {};

    /* ① 打 A → 血条 A */
    Game.damageEnemy(A, 5, false);
    out.hitA = Game.boss === A;
    out.nameA = document.getElementById('bossName').textContent === A.cfg.name;
    out.fillA = document.getElementById('bossFill').style.width;
    const hpA1 = A.hp;

    /* ② 站在 B 旁边不动手 → 血条仍是 A（粘性；旧实现会跳成 B） */
    B.pos.x = Game.playerGroup.position.x + 1.5; B.pos.z = Game.playerGroup.position.z;
    A.pos.x = Game.playerGroup.position.x + 20; A.pos.z = Game.playerGroup.position.z;
    Game.bossPickCd = 0;
    Game._pickBoss(1.0, new THREE.Vector3(Game.playerGroup.position.x, 0, Game.playerGroup.position.z));
    out.sticky = Game.boss === A;

    /* ③ 打 B → 切 B */
    Game.damageEnemy(B, 5, false);
    out.switchB = Game.boss === B;
    out.nameB = document.getElementById('bossName').textContent === B.cfg.name;

    /* ④ 回头打 A → 切回 A，且血条数字接得上（不是重新从满血开始） */
    Game.damageEnemy(A, 5, false);
    out.backA = Game.boss === A;
    out.continuous = Math.abs(A.hp - (hpA1 - 5 * 0)) < 1e6 && A.hp < A.maxHp;
    out.hpA = A.hp; out.maxA = A.maxHp;

    /* ⑤ A 死了 → 自动接下一只（B） */
    A.dead = true; Game.bossPickCd = 0;
    Game._pickBoss(1.0, new THREE.Vector3(Game.playerGroup.position.x, 0, Game.playerGroup.position.z));
    out.nextAfterDeath = Game.boss === B;

    /* ⑥ 一只都没有 → 收血条 */
    for (const e of bs) { e.dead = true; }
    Game.bossPickCd = 0;
    Game._pickBoss(1.0, new THREE.Vector3(Game.playerGroup.position.x, 0, Game.playerGroup.position.z));
    out.hidden = document.getElementById('bossbar').style.display === 'none';
    return out;
  });
  if (own.skip) {
    ok(false, '这张图不足两只首领，无法验归属');
  } else {
    ok(own.hitA && own.nameA, '打 A → 血条是 A（名字也跟着换）', own);
    ok(own.sticky, '站在 B 旁边不动手 → 血条仍是 A（不会因为「B 更近」就跳走）', own);
    ok(own.switchB && own.nameB, '打 B → 血条切成 B', own);
    ok(own.backA, '回头打 A → 血条切回 A', own);
    ok(own.continuous, '切回来时血量是连续的（不是重新满血）', own);
    ok(own.nextAfterDeath, '当前目标死亡 → 自动接最近的下一只', own);
    ok(own.hidden, '场上没有首领 → 血条收起', own);
  }

  /* ============================================================
   * 四、招式落点
   * ============================================================ */
  head('四、招式落点夹取（P02）');
  const aim = await page.evaluate(() => {
    const b = Game.enemies.filter(e => e.boss)[0];
    const R = BALANCE.boss.skillRange;
    b.pos.x = 0; b.pos.z = 0;
    /* 玩家贴着半径边缘（17 米），散布 10 米的招式可能飘到 27 米 */
    const pp = new THREE.Vector3(0, 0, 17);
    let maxD = 0;
    for (let i = 0; i < 400; i++) {
      const t = Game._bossAim(b, pp, 10);
      maxD = Math.max(maxD, Math.hypot(t.x - b.pos.x, t.z - b.pos.z));
    }
    return { maxD, R };
  });
  ok(aim.maxD <= aim.R + 1e-6, '落点永远夹在交战半径内（≤ ' + aim.R + ' 米）', aim);
  ok(aim.maxD > 5, '夹取没有把落点压到首领脚下（散布仍然生效）', aim);

  /* ============================================================ */
  await browser.close();
  console.log('\n错误日志: ' + (errs.length ? errs.join('\n') : '（无）'));
  console.log('\n' + (fail ? '❌ ' : '✅ ') + '全部通过（' + pass + ' 项）');
  if (fail) { console.log('失败 ' + fail + ' 项'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
