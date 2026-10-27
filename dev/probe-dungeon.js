/* ============================================================
 * dev/probe-dungeon.js —— 地脉裂隙 · 真机整局探针（headless 浏览器）
 *
 * 为什么 dev/dungeon-sim.js 之外还要这个：
 *   推演脚本跑的是**状态机**，用假的 Game.spawnEnemy。真机上真正会出问题的是
 *   它接不住的那些：HUD 的 DOM 有没有、loadMap 换图会不会崩、词缀乘在活怪身上
 *   有没有效果、首领走的是不是真的 BOSSES 配置。这些必须开浏览器才看得见。
 *
 * 干的事：
 *   1. 打开 index.html，收 pageerror / console.error / 请求失败
 *   2. 建新档，把等级抬到 36（卷三），塞一把三阶钥匙
 *   3. 走真实入口：跟营地的「地脉守」说话 → 选阶 → 选类型 → 确认词缀
 *   4. 三层推演：清怪到阈值 → 地脉门 → 下一层 → 首领
 *   5. 断言：HUD 出现/文案对、层数推进、首领血量与同阶小怪的比例、
 *      通关后有装备/玄晶/金币、回了营地、HUD 收起
 *
 * 用法：NODE_PATH=<managed node_modules> node dev/probe-dungeon.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
};
const eq = (label, got, want) => ok(label, got === want, { got, want });
const wait = ms => new Promise(r => setTimeout(r, ms));

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const exe = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!exe) { console.log('找不到浏览器，跳过探针'); process.exit(0); }

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

  console.log('\n【0】装载');
  const loaded = await page.evaluate(() => ({
    keys: typeof KEY_TIERS !== 'undefined',
    types: typeof DUNGEON_TYPES !== 'undefined',
    dungeon: typeof Dungeon !== 'undefined',
    hud: !!document.getElementById('dgHud')
  }));
  ok('data-dungeon.js 已装载（KEY_TIERS / DUNGEON_TYPES）', loaded.keys && loaded.types);
  ok('dungeon.js 已装载（Dungeon）', loaded.dungeon);
  ok('index.html 里有 #dgHud 容器', loaded.hud);

  console.log('\n【1】建档 · 卷三 · 一把三阶钥匙');
  const boot = await page.evaluate(() => {
    try {
      Game.startNew('warrior', '地脉测试', 1, 'normal');
      Game.state.level = 36;
      Game.state.xpNext = xpToNext(36);
      Game.state.part = 3;
      Game.state.keys = [0, 0, 1, 0, 0];
      Game.recalc();
      Game.state.hp = Game.state.stats.hpMax;
      Game.state.mp = Game.state.stats.mpMax;
      return { map: Game.state.mapId, lv: Game.state.level, key: Dungeon.keyCount(3) };
    } catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  ok('建档成功', !boot.err, boot.err);
  eq('手里 1 把三阶钥匙', boot.key, 1);

  console.log('\n【2】入口：营地的地脉守');
  /* 走到营地 NPC 面前说话 —— 用 Game.openNPC('rift') 这条真入口 */
  const npc = await page.evaluate(() => {
    try {
      Game.openNPC('rift');
      const d = document.getElementById('dialog');
      const vis = d && getComputedStyle(d).display !== 'none';
      const txt = (document.getElementById('dlgText') || {}).textContent || '';
      const name = (document.getElementById('dlgName') || {}).textContent || '';
      const btns = Array.from(document.getElementById('dlgBtns').querySelectorAll('button')).map(b => b.textContent.trim());
      return { opened: !!vis, name, txt: txt.slice(0, 60), btns };
    } catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  ok('跟地脉守说话弹出了面板', npc.opened, npc.err || npc.txt);
  eq('面板署名 = 地脉守', npc.name, '地脉守');
  ok('面板里能看到「三阶钥匙」的选项',
    (npc.btns || []).some(b => /玄铁钥/.test(b)), npc.btns);

  /* 选阶 → 选类型 → 推门，全走真函数（跳过点按钮的脆性） */
  const enter = await page.evaluate(() => {
    try {
      UI.closeAll();
      Dungeon.pickType(3);
      const typeBtns = Array.from(document.getElementById('dlgBtns').querySelectorAll('button')).map(b => b.textContent.trim());
      UI.closeAll();
      Dungeon.enter('tomb', 3, []);
      return {
        typeBtns,
        map: Game.state.mapId, layer: Dungeon.run && Dungeon.run.layer,
        key: Dungeon.keyCount(3), total: Dungeon.run && Dungeon.run.total,
        enemies: Game.enemies.length
      };
    } catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  ok('类型面板列出了 5 类地缝', (enter.typeBtns || []).length >= 5, (enter.typeBtns || []).length);
  ok('进门成功', !enter.err, enter.err);
  eq('地图切到 dgn_tomb_1', enter.map, 'dgn_tomb_1');
  eq('第 1 层', enter.layer, 1);
  eq('钥匙已扣', enter.key, 0);
  ok('怪已经刷出来了（>10 只）', enter.enemies > 10, enter.enemies);

  /* HUD */
  await wait(400);
  const hud = await page.evaluate(() => {
    const el = document.getElementById('dgHud');
    const vis = el && getComputedStyle(el).display !== 'none';
    return {
      vis, name: (document.getElementById('dgName') || {}).textContent,
      layer: (document.getElementById('dgLayer') || {}).textContent,
      kill: (document.getElementById('dgKill') || {}).textContent,
      tier: (document.getElementById('dgTier') || {}).textContent,
      barW: (document.getElementById('dgBar') || {}).style.width
    };
  });
  ok('HUD 显示出来了', hud.vis);
  eq('HUD 类型名 = 尸冢', hud.name, '尸冢');
  eq('HUD 层数 = 1/3', hud.layer, '1/3');
  eq('HUD 阶名 = 玄铁钥', hud.tier, '玄铁钥');
  ok('HUD 击杀数形如「n / m」', /^\d+ \/ \d+$/.test((hud.kill || '').trim()), hud.kill);

  /* ---- 三层推演：用真 damageEnemy 打死，走真实的死亡/掉落/清怪链路 ---- */
  const rows = [];
  for (let layer = 1; layer <= 3; layer++) {
    /* 清怪到能开门 */
    const r1 = await page.evaluate(() => {
      const out = {};
      const p = Dungeon.progress();
      out.need = p.need; out.total = p.total;
      /* 先记下本层杂兵的均血，用来校验首领的倍率 */
      const alive = Game.enemies.filter(e => !e.dead && !e.boss);
      out.avgTrash = alive.length ? Math.round(alive.reduce((a, e) => a + e.maxHp, 0) / alive.length) : 0;
      /* 打死 (need × total) 只，够开门就行 */
      const target = Math.ceil(p.total * p.need);
      let guard = 0;
      while (Dungeon.run && Dungeon.progress().kills < target && guard++ < 2000) {
        const e = Game.enemies.find(x => !x.dead && !x.boss);
        if (!e) break;
        Game.damageEnemy(e, 1e12, false, { silent: true });
      }
      out.kills = Dungeon.progress().kills;
      out.open = Dungeon.progress().open;
      return out;
    });
    rows.push({ layer, ...r1 });
    ok('第 ' + layer + ' 层清到阈值开门', r1.open === true, r1);

    if (layer < 3) {
      const nx = await page.evaluate(() => {
        Dungeon.usePortal();
        return { layer: Dungeon.run && Dungeon.run.layer, map: Game.state.mapId, n: Game.enemies.length };
      });
      eq('走到第 ' + (layer + 1) + ' 层', nx.layer, layer + 1);
      eq('图 id 换成 dgn_tomb_' + (layer + 1), nx.map, 'dgn_tomb_' + (layer + 1));
      ok('第 ' + (layer + 1) + ' 层有怪', nx.n > 0, nx.n);
    }
  }

  console.log('\n【3】首领场');
  const boss = await page.evaluate(() => {
    let b = null, trash = 0, trashN = 0, elites = 0;
    for (const e of Game.enemies) {
      if (e.boss) b = { hp: e.maxHp, name: e.cfg && e.cfg.name, dmg: Math.round(e.dmg) };
      else { trash += e.maxHp; trashN++; if (e.elite) elites++; }
    }
    return {
      b, trashN, elites,
      cfgOk: !!(b && BOSSES.dgb_tomb && b.name === BOSSES.dgb_tomb.name)
    };
  });
  /* 同阶小怪均血取第 1 层开打前的那个数（首领场已经没杂兵了） */
  const avgTrash = (rows[0] && rows[0].avgTrash) || 0;
  ok('首领已刷出', !!boss.b, boss);
  ok('首领走的是 BOSSES.dgb_tomb 配置', boss.cfgOk, boss.b);
  ok('首领血量 ≈ 同阶小怪均血 × 14（不是 4.5 倍档）',
    boss.b && avgTrash > 0 && boss.b.hp > avgTrash * 10 && boss.b.hp < avgTrash * 20,
    { boss: boss.b && boss.b.hp, avg: avgTrash });
  eq('首领场只有 3 个活物（首领 + 2 护卫）', boss.trashN + 1, 3);
  eq('场上 2 名护卫都是精英', boss.elites, boss.trashN);

  console.log('\n【4】通关结算');
  const before = await page.evaluate(() => ({
    inv: Game.state.inventory.length, gold: Game.state.gold,
    cry: (Game.state.stash.mats && Game.state.stash.mats.crystal) || 0
  }));
  const done = await page.evaluate(() => {
    Game.damageEnemy(Game.enemies.find(e => e.boss), 1e12, false, { silent: true });
    return true;
  });
  /* onBossDown 走的是 600ms 延时，轮询等 */
  let after = null;
  for (let i = 0; i < 40; i++) {
    await wait(200);
    after = await page.evaluate(() => ({
      run: !!Dungeon.run, map: Game.state.mapId,
      cleared: Object.keys((Game.state.dungeon && Game.state.dungeon.cleared) || {}),
      wins: Game.state.dungeon && Game.state.dungeon.wins,
      inv: Game.state.inventory.length, gold: Game.state.gold,
      cry: (Game.state.stash.mats && Game.state.stash.mats.crystal) || 0,
      hudOn: !!document.getElementById('dgHud').classList.contains('on')
    }));
    if (!after.run) break;
  }
  ok('首领倒下后地脉关闭（run 清空）', after.run === false, after);
  ok('图鉴记了 tomb3', after.cleared.indexOf('tomb3') >= 0, after.cleared);
  eq('wins = 1', after.wins, 1);
  ok('拿到了装备', after.inv > before.inv, { before: before.inv, after: after.inv });
  ok('拿到了玄晶', after.cry > before.cry, { before: before.cry, after: after.cry });
  ok('拿到了金币', after.gold > before.gold, { before: before.gold, after: after.gold });
  eq('被送回卷三营地', after.map, 'campC');
  ok('HUD 已收起', after.hudOn === false);

  console.log('\n【5】跑图没报错');
  ok('零 pageerror / console.error / 请求失败', errs.length === 0, errs.slice(0, 6));

  console.log('\n--- 每层清怪 ---');
  for (const r of rows) console.log('  第 ' + r.layer + ' 层：' + r.kills + '/' + r.total + '  阈值 ' + Math.round(r.need * 100) + '%');
  console.log('--- 首领：' + (boss.b ? boss.b.name + '  hp ' + boss.b.hp + ' / 首层均血 ' + avgTrash : '无') + ' ---');

  console.log(fail ? `\n❌ ${fail} 项失败（${pass} 通过）` : `\n✅ 真机整局通过（${pass} 项）`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：' + e.stack); process.exit(1); });
