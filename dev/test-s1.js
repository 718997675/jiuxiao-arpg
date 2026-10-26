/* ============================================================
 * S1 浏览器端验证：装备生成 / 固有属性 / 属性面板
 *   node dev/test-s1.js
 * 产出截图：shots/160-s1-stats.png、shots/161-s1-tooltip.png
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
/* 跨平台找浏览器：本机 Windows 用 Edge，macOS 退回 Chrome（原来写死 mac 路径，Windows 上直接跑不起来） */
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 160)));

  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* ---- 1. 装一整套 40 级传说，检查属性 ---- */
  const stats = await p.evaluate(() => {
    const s = Game.state;
    const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon', 'offhand'];
    const made = [];
    for (const sl of slots) {
      const it = rollItem(40, { slot: sl, cls: s.cls, rarity: 'legendary' });
      s.equipment[sl] = it;
      made.push({ slot: sl, name: it.name, imp: it.implicit ? it.implicit.key + '+' + it.implicit.val : null });
    }
    s.level = 40;
    Game.recalc();
    const st = s.stats;
    const nums = Object.keys(st).filter(k => typeof st[k] === 'number');
    const bad = nums.filter(k => !isFinite(st[k]));
    const caps = {
      dodge: st.dodge, block: st.block, dmgReduce: st.dmgReduce,
      armorPen: st.armorPen, crit: st.crit, cdr: st.cdr
    };
    return {
      made, bad, keyCount: nums.length, caps,
      atk: Math.round(st.atk), def: Math.round(st.def),
      hpMax: st.hpMax, mpMax: st.mpMax, power: Math.round(itemPower(s.equipment.chest))
    };
  });

  console.log('装备 10 件，属性 key 数:', stats.keyCount);
  console.log('  攻击', stats.atk, '护甲', stats.def, '生命', stats.hpMax, '灵力', stats.mpMax);
  console.log('  封顶检查:', JSON.stringify(stats.caps));
  console.log('  固有属性:', stats.made.filter(m => m.imp).map(m => m.slot + '=' + m.imp).join(' ') || '（本套未带）');
  console.log('  NaN 属性:', stats.bad.length ? stats.bad.join(',') : '无');

  /* ---- 2. 打开属性面板 ---- */
  await p.evaluate(() => UI.toggleStat());
  await wait(500);
  const panel = await p.evaluate(() => {
    const el = document.getElementById('statPanel');
    const list = document.getElementById('statList');
    const groups = [...list.querySelectorAll('.st-grp')].map(e => e.textContent);
    const rows = list.querySelectorAll('div:not(.st-grp)').length;
    const r = el.getBoundingClientRect();
    return {
      open: el.classList.contains('open'), groups, rows,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      overflow: list.scrollHeight > list.clientHeight + 2,
      emptyVals: [...list.querySelectorAll('b')].filter(b => /^0%?$/.test(b.textContent)).length
    };
  });
  console.log('属性面板:', JSON.stringify(panel));
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', '160-s1-stats.png') });

  /* ---- 3. 装备提示框（固有属性那一行） ---- */
  await p.evaluate(() => UI.closeAll && UI.closeAll());
  const tip = await p.evaluate(() => {
    const s = Game.state;
    let it = null;
    for (let i = 0; i < 200 && !it; i++) {
      const c = rollItem(40, { slot: 'chest', cls: s.cls, rarity: 'legendary' });
      if (c.implicit) it = c;
    }
    const host = document.createElement('div');
    host.id = 's1tip';
    host.style.cssText = 'position:fixed;left:50%;top:60px;transform:translateX(-50%);z-index:9999;width:320px';
    host.innerHTML = itemTooltip(it);
    document.body.appendChild(host);
    const imp = host.querySelector('.tt-imp');
    const lines = [...host.querySelectorAll('.tt-aff')].map(e => e.textContent);
    return {
      name: it.name, baseName: it.baseName,
      implicitText: imp ? imp.textContent : null,
      affixLines: lines,
      affixCount: lines.length,
      impColor: imp ? getComputedStyle(imp).color : null
    };
  });
  await wait(200);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', '161-s1-tooltip.png') });
  console.log('提示框:', JSON.stringify(tip, null, 0));

  /* ---- 4. 实战：身边刷 6 只怪，打 20 轮，验证新属性不会跑崩战斗 ---- */
  const combat = await p.evaluate(async () => {
    const base = Game.playerGroup.position.clone();
    let spawned = 0;
    for (let i = 0; i < 6; i++) {
      const e = Game.spawnEnemy('halfork', base.x + 2 + i * 0.8, base.z + 1.5);
      if (e) { spawned++; e.level = 20; e.hp = e.maxHp = 400; }
    }
    let kills = 0;
    const oldDeath = Game.onEnemyDeath.bind(Game);
    Game.onEnemyDeath = function (e) { kills++; return oldDeath(e); };
    const hp0 = Game.state.hp;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      Game.doBasicAttack();
      if (i % 3 === 0) {
        const ids = SKILL_ORDER[Game.state.cls] || [];
        if (ids.length) Game.castSkill(ids[i % ids.length]);
      }
      await new Promise(r => setTimeout(r, 90));
    }
    return {
      secs: +((performance.now() - t0) / 1000).toFixed(1), spawned, kills,
      hp: Math.round(Game.state.hp), hp0: Math.round(hp0),
      mp: Math.round(Game.state.mp),
      shield: Math.round(Game.shield || 0),
      geo: Game.renderer.info.memory.geometries,
      alive: Game.enemies.filter(e => !e.dead).length
    };
  });
  console.log('实战:', JSON.stringify(combat));

  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  console.log('控制台错误（排除 glb）:', realErrs.length ? realErrs.slice(0, 5) : '无');

  await b.close();
  const okAll = stats.bad.length === 0 && panel.open && panel.groups.length === 5 &&
    tip.implicitText && realErrs.length === 0 && combat.kills > 0;
  console.log(okAll ? '\n✓ S1 浏览器验证通过\n' : '\n✗ 有失败项\n');
  process.exit(okAll ? 0 : 1);
})();
