/* ============================================================
 * dev/skill-ref.js —— 技能射程 / 消耗的专项体检（P06 + P10）
 *
 * 两段，离线 + 真浏览器：
 *   一、离线：37 个技能的射程表与消耗表（纯数据，不起浏览器）
 *   二、浏览器：射程硬拒绝真的生效（不扣蓝 / 不进 CD）+ 满蓝连放能撑几秒
 *
 * 为什么必须有浏览器段：
 *   「30 米外点火球被拒绝」这条在数据层根本看不出来 —— 拒绝逻辑在
 *   `castSkill` 里，依赖 playerGroup / aimPoint / cooldowns 这些运行时状态。
 *   只查数据的话，射程改小了、但 resolveCast 还在「夹落点」，测试照样全绿。
 *
 * 用法：
 *   node dev/skill-ref.js                     # 两段都跑
 *   NODE_PATH=<puppeteer 所在> node dev/skill-ref.js
 * ============================================================ */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const head = (t) => console.log('\n— ' + t + ' —');

/* ============================================================
 * 一、离线：数据表
 * ============================================================ */
const ctx = vm.createContext({ console, Math, JSON, Date, isFinite, Number, String, Array, Object, parseInt, parseFloat });
const g = (e) => vm.runInContext(e, ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script src="(src\/[^"]+\.js)"><\/script>/g)) {
  const f = m[1];
  if (!(f.startsWith('src/data/') || f === 'src/items.js')) continue;
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const SKILLS = g('SKILLS');
const list = Object.values(SKILLS);

head('一、数据表（P06：射程 ≤ 13 · 消耗按上限百分比）');
/* [P2b] 技能重构新增了法师 ⑤「元素法相」（elementavatar）——
 * 净新增一只，所以是 37 不是 36（刀客 / 道士仍各 12）。
 * 数量断言留在这里是为了「有人再加技能时被迫回来确认射程表」，
 * 不是「36 这个数字本身神圣」。 */
const SKILL_TOTAL = 37;
ok(list.length === SKILL_TOTAL, '技能总数 ' + SKILL_TOTAL + '（刀客 12 · 法师 13 · 道士 12）', list.length);

/* 1. 射程：非 self 必须有射程，且 ≤ 13；self 必须是 0 */
const BOSS_MAX = 14;      // P02：首领技能最远 14 米
const RANGED_CAP = 13;    // P06：法师 / 道士远程一律 ≤ 13
const noRange = list.filter(s => s.cast !== 'self' && !(s.castRange > 0));
const selfRange = list.filter(s => s.cast === 'self' && (s.castRange || 0) !== 0);
const over = list.filter(s => (s.castRange || 0) > RANGED_CAP);
ok(noRange.length === 0, '非 self 技能全部有 castRange（去掉 `|| 99` 兜底的前提）',
  noRange.map(s => s.id));
ok(selfRange.length === 0, 'self 技能的 castRange 一律为 0（不然会被距离闸误伤）',
  selfRange.map(s => s.id));
ok(over.length === 0, '所有技能射程 ≤ ' + RANGED_CAP + ' 米', over.map(s => s.id + '(' + s.castRange + ')'));
ok(RANGED_CAP < BOSS_MAX, '玩家最远射程 ' + RANGED_CAP + ' < 首领技能 ' + BOSS_MAX + ' 米（站射程边缘不再无风险）');

/* 2. 逐职业看一遍：法师 / 道士不许再出现「一个量级之外」的射程 */
for (const cls of ['warrior', 'mage', 'taoist']) {
  const rows = list.filter(s => s.cls === cls);
  const rng = rows.map(s => s.castRange || 0);
  const max = Math.max(...rng);
  /* 法师多一只：P2b 的 ⑤ 号位「元素法相」是净新增技能 */
  const want = (cls === 'mage') ? 13 : 12;
  ok(rows.length === want, cls + ' 有 ' + want + ' 个技能', rows.length);
  ok(max <= RANGED_CAP, cls + ' 最远射程 ' + max + ' 米', max);
}

/* 3. 消耗：读作「占灵力上限的百分比」，主输出 8~12%、大招 ≤ 45% */
for (const cls of ['warrior', 'mage', 'taoist']) {
  const rows = list.filter(s => s.cls === cls);
  const costs = rows.map(s => s.cost);
  const max = Math.max(...costs);
  ok(max <= 45, cls + ' 最贵的一发 ≤ 45% 上限（再贵就放不出第二发）', max);
  ok(Math.min(...costs) >= 5, cls + ' 最便宜的一发 ≥ 5% 上限', Math.min(...costs));
}
const MAIN = { warrior: 'whirl', mage: 'fireball', taoist: 'talisman' };
for (const cls of Object.keys(MAIN)) {
  const c = SKILLS[MAIN[cls]].cost;
  ok(c >= 7 && c <= 12, cls + ' 主输出「' + SKILLS[MAIN[cls]].name + '」消耗 ' + c + '% 落在 7~12%', c);
}

/* 4. 源码口径：不能又写回固定点数，也不能留 `|| 99` */
const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
ok(/st\.mpMax \|\| 0\) \* pct/.test(gsrc) || /mpMax[\s\S]{0,40}pct/.test(gsrc),
  'skillCost 走「上限 × 百分比」口径（不是固定点数）');
ok(!/const maxR = range \|\| 99/.test(gsrc), 'resolveCast 里没有 `range || 99` 兜底了');
ok(/castRangeFail\(sk\)/.test(gsrc), 'castSkill 里接了射程硬拒绝');
const ssrc = fs.readFileSync(path.join(ROOT, 'src/items.js'), 'utf8');
ok(/costReduce: 20/.test(ssrc), 'costReduce 封顶 20（否则百分比消耗会被它放大成无限蓝）');
ok(/cdr: 40/.test(ssrc), 'cdr 封顶 40（86% 会把 CD 全压到 0.5 秒地板）');

/* ============================================================
 * 二、浏览器：硬拒绝 + 续航
 * ============================================================ */
const puppeteer = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

(async () => {
  if (!puppeteer || !exe) {
    console.log('\n（跳过浏览器段：找不到 puppeteer-core 或 Chrome）');
    return finish();
  }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300));

  /* 进血沼泽：有首领、有普通怪，射程测试两头都要 */
  await page.evaluate(() => {
    Game.startNew('mage', 'T');
    Game.state.level = 60;
    Game.recalc();
    Game.travelTo('swamp');
  });
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    ready = await page.evaluate(() => ({
      map: Game.state.mapId,
      bosses: Game.enemies.filter(e => e.boss).length,
      mobs: Game.enemies.filter(e => !e.boss && !e.dead).length
    }));
    if (ready.bosses >= 1 && ready.mobs >= 3) break;
  }
  head('二、场景');
  ok(ready && ready.bosses >= 1, '血沼泽刷出首领与杂兵', ready);

  /* 2.1 30 米外点火球 → 拒绝，不扣蓝、不进 CD */
  head('三、射程硬拒绝（P10）');
  const far = await page.evaluate(() => {
    const sk = SKILLS.fireball;
    const boss = Game.enemies.filter(e => e.boss)[0];
    /* 场景必须干净：`dir` 类技能判的是「最近敌人」，
     * 身边留三只杂兵的话闸门根本不会触发（那不是 bug —— 火球确实打得到杂兵）。
     * 所以先把杂兵全部标死，只留首领，才是在验「够不着首领就别放」。 */
    for (const e of Game.enemies) if (!e.boss) e.dead = true;
    /* 把玩家挪到离首领 30 米的位置，朝向它 */
    const px = boss.pos.x, pz = boss.pos.z + 30;
    Game.playerGroup.position.set(px, 0, pz);
    Game.aimPoint.set(boss.pos.x, 0, boss.pos.z);
    Game.aimDir.set(0, 0, -1).normalize();
    Game.state.mp = Game.state.stats.mpMax;
    Game.cooldowns = {};
    /* 抓日志：UI.log 是唯一出口，包一层记下来，比事后翻 DOM 稳 */
    if (!UI.__hooked) {
      UI.__hooked = true;
      const old = UI.log.bind(UI);
      UI.log = function (t) { (window.__logs = window.__logs || []).push(String(t)); return old.apply(null, arguments); };
    }
    window.__logs = [];
    const mp0 = Game.state.mp;
    Game.castSkill('fireball');
    return {
      dist: +Math.hypot(boss.pos.x - px, boss.pos.z - pz).toFixed(1),
      mp0: Math.round(mp0), mp1: Math.round(Game.state.mp),
      cd: +(Game.cooldowns.fireball || 0).toFixed(2),
      logs: window.__logs.slice(-3),
      range: sk.castRange
    };
  });
  ok(far.mp1 === far.mp0, '30 米外点火球不扣蓝', far);
  ok(far.cd === 0, '被拒绝的施法不进冷却', far);
  ok(far.logs.some(t => /距离太远/.test(t)), '给出「距离太远」提示', far.logs);

  /* 2.2 走进射程 → 正常放，扣蓝 + 进 CD */
  const near = await page.evaluate(() => {
    const boss = Game.enemies.filter(e => e.boss)[0];
    const px = boss.pos.x, pz = boss.pos.z + (SKILLS.fireball.castRange - 2);
    Game.playerGroup.position.set(px, 0, pz);
    Game.aimPoint.set(boss.pos.x, 0, boss.pos.z);
    Game.state.mp = Game.state.stats.mpMax;
    Game.cooldowns = {};
    window.__logs = [];
    const mp0 = Game.state.mp;
    Game.castSkill('fireball');
    return {
      mp0: Math.round(mp0), mp1: Math.round(Game.state.mp),
      cd: +(Game.cooldowns.fireball || 0).toFixed(2),
      cost: Game.skillCost(SKILLS.fireball), mpMax: Math.round(Game.state.stats.mpMax)
    };
  });
  ok(near.mp1 < near.mp0, '射程内点火球正常扣蓝', near);
  ok(near.cd > 0, '射程内施法正常进冷却', near);
  ok(Math.abs((near.mp0 - near.mp1) - near.cost) <= 1, '扣的就是 skillCost 报的数（面板与实际一致）', near);
  ok(near.cost / near.mpMax < 0.15, '一发火球占上限 ' + (near.cost / near.mpMax * 100).toFixed(1) + '%（< 15%）', near);

  /* 2.3 满蓝连放：按 CD 卡点，看几秒空蓝（含回灵） */
  head('四、满蓝连放能撑几秒（P06 验收口径：实际 CD，含回灵）');
  const sust = await page.evaluate(() => {
    const out = {};
    const run = (cls, id) => {
      Game.startNew(cls, 'T');
      Game.state.level = 60;
      Game.recalc();
      const st = Game.state.stats;
      const sk = SKILLS[id];
      const cost = Game.skillCost(sk);
      const cd = Game.skillCd(sk);
      let mp = st.mpMax, t = 0, casts = 0;
      /* 每次施法扣 cost、隔 cd 秒；期间按战斗中回灵线性补回 */
      while (mp >= cost && t < 600) {
        mp -= cost; casts++; t += cd;
        mp = Math.min(st.mpMax, mp + st.mpReg * cd);
      }
      return {
        cls, id, cost, cd: +cd.toFixed(2), casts,
        secs: +t.toFixed(1), mpMax: Math.round(st.mpMax),
        pct: +(cost / st.mpMax * 100).toFixed(1), regen: +st.mpReg.toFixed(1)
      };
    };
    out.warrior = run('warrior', 'whirl');
    out.mage = run('mage', 'fireball');
    out.taoist = run('taoist', 'talisman');
    return out;
  });
  const band = { warrior: [25, 35], mage: [12, 18], taoist: [12, 18] };
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const r = sust[cls];
    const b = band[cls];
    ok(r.secs >= b[0] && r.secs <= b[1],
      cls + '：' + r.casts + ' 发 / ' + r.secs + ' 秒（验收 ' + b[0] + '~' + b[1] + ' 秒）' +
      ' · 每发 ' + r.pct + '% 上限 · CD ' + r.cd + 's', r);
  }
  /* 反证：如果消耗还是固定点数，法师能撑几百秒 —— 这条防「改回去了」 */
  const oldWay = await page.evaluate(() => {
    Game.startNew('mage', 'T'); Game.state.level = 60; Game.recalc();
    const st = Game.state.stats;
    const flat = 10 * (1 - Math.min(20, st.costReduce || 0) / 100);   // 旧口径：火球固定 10 点
    const drain = flat / 1.4 - st.mpReg;
    return { flat: +flat.toFixed(1), secs: drain > 0 ? Math.round(st.mpMax / drain) : null };
  });
  ok(oldWay.secs === null || oldWay.secs > 120,
    '反证：固定点数口径下满蓝能撑 ' + (oldWay.secs === null ? '∞（回灵 > 消耗）' : oldWay.secs + ' 秒') + ' —— 这就是用户说的「一个蓝条都用不完」', oldWay);

  head('五、页面错误');
  ok(errs.length === 0, '无页面报错', errs.slice(0, 3));

  await browser.close();
  finish();
})();

function finish() {
  console.log('\n' + '='.repeat(56));
  if (fail === 0) console.log('✅ 全部通过（' + pass + ' 项）');
  else console.log('失败 ' + fail + ' 项：\n  · ' + '（见上）');
  console.log('='.repeat(56));
  process.exit(fail === 0 ? 0 : 1);
}
