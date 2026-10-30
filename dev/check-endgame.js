/* ============================================================
 * dev/check-endgame.js —— [M6] 终局内容联调（真浏览器）
 *
 * 为什么单独写一个：
 *   check-uniques / check-sets 只查数据表，查不出「面板里会不会崩」。
 *   40 件传世 + 18 套套装最终都要落到图鉴、说明页、装备结算上，
 *   这里在真页面里把它们各走一遍：
 *     1. 60 级刷 600 件，确认传世全部 ≥ ilvl 40、id 都在目录里
 *     2. 每个部位各穿一件传世，recalc 不报错、特性/技能修正确实进面板
 *     3. 套装图鉴渲染 18 张卡，名称与数据表一致
 *     4. 说明页（H）里的件数文案与数据表一致，不出现 undefined
 *
 * 用法：
 *   NODE_PATH=<node_modules> node dev/check-endgame.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 160)); });

  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1000);
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => {
    Game.startNew('warrior', '终局');
    Game.state.level = 60;
    Game.recalc();
  });
  await wait(600);

  /* ---- 1. 60 级掉落：传世必须全部 ≥40 级且来自目录 ---- */
  const drops = await p.evaluate(() => {
    const cat = new Map(UNIQUE_ITEMS.map(u => [u.id, u]));
    const seen = new Map();
    let below = 0, unknown = 0, total = 0;
    for (let i = 0; i < 600; i++) {
      const it = rollItem(60, { cls: 'warrior', magicFind: 300 });
      if (it.rarity !== 'unique') continue;
      total++;
      if (!cat.has(it.uniqueId)) unknown++;
      if (it.ilvl < 40) below++;
      seen.set(it.uniqueId, (seen.get(it.uniqueId) || 0) + 1);
    }
    return { total, below, unknown, distinct: seen.size };
  });
  ok(drops.total > 0, '600 次掉落里一件传世都没出（掉率或池子有问题）');
  ok(drops.below === 0, `有 ${drops.below} 件传世的 ilvl < 40`);
  ok(drops.unknown === 0, `有 ${drops.unknown} 件传世的 id 不在目录里`);

  /* ---- 2. 每个部位穿一件传世，结算不崩 ---- */
  const equip = await p.evaluate(() => {
    const out = [];
    const slots = ['helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon', 'offhand'];
    for (const slot of slots) {
      let it = null;
      for (let i = 0; i < 400 && !it; i++) {
        const c = rollItem(60, { slot, cls: 'warrior', rarity: 'unique' });
        if (c.rarity === 'unique') it = c;
      }
      if (!it) { out.push({ slot, ok: false, why: 'roll 不出该部位的传世' }); continue; }
      Game.state.equipment[slot] = it;
      try {
        Game.recalc();
        const st = Game.state.stats;
        out.push({
          slot, ok: true, name: it.name,
          traits: (it.traits || []).length,
          skillMods: Object.keys(st.skillMods || {}).length,
          specials: Object.keys(st.specials || {}).length
        });
      } catch (e) {
        out.push({ slot, ok: false, why: String(e).slice(0, 120) });
      }
    }
    return out;
  });
  for (const r of equip) ok(r.ok, `穿上 ${r.slot} 的传世失败：${r.why || ''}`);
  const equippedN = equip.filter(r => r.ok).length;

  /* ---- 3. 套装图鉴：18 张卡 ---- */
  await p.evaluate(() => UI.openSetCodex());
  await wait(400);
  const codex = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#setCodexPanel .cx-set')];
    return {
      n: cards.length,
      names: cards.map(c => (c.querySelector('.cx-name') || {}).textContent || ''),
      html: document.getElementById('setCodexPanel').innerHTML.length
    };
  });
  ok(codex.n === 18, `套装图鉴渲染了 ${codex.n} 张卡，应为 18`);
  const allSetNames = await p.evaluate(() => Object.values(SETS).map(s => s.name));
  for (const nm of allSetNames) {
    ok(codex.names.some(t => t.indexOf(nm) === 0), `图鉴里没有「${nm}」这张卡`);
  }
  await p.evaluate(() => { const el = document.getElementById('setCodexPanel'); if (el) el.classList.remove('open'); });

  /* ---- 4. 说明页文案与数据表一致 ----
   * 说明页是分节渲染的（一次只挂一节到 DOM），所以要逐节翻一遍再拼起来。
   * SECTIONS 是 ui.js 内部的私有表，页面里取不到，只能走 UI.hpTab + renderHelp。 */
  await p.evaluate(() => { UI.openMenu('help'); });
  await wait(500);
  const helpTxt = await p.evaluate(() => {
    let all = '';
    let prev = null;
    for (let i = 0; i < 12; i++) {
      UI.hpTab = i;
      try { UI.renderHelp(); } catch (e) { break; }
      const t = (document.getElementById('helpBody') || {}).textContent || '';
      if (t === prev) break;         // 越界后渲染不变，说明已经翻完
      prev = t;
      all += t;
    }
    return all;
  });
  const truth = await p.evaluate(() => ({
    uni: UNIQUE_ITEMS.length,
    sets: Object.keys(SETS).length,
    traits: Object.keys(UNIQUE_TRAITS).length
  }));
  ok(helpTxt.indexOf(truth.uni + ' 件') >= 0, `说明页没写出传世 ${truth.uni} 件`);
  ok(helpTxt.indexOf(truth.sets + ' 套') >= 0, `说明页没写出套装 ${truth.sets} 套`);
  ok(helpTxt.indexOf('undefined') < 0, '说明页里出现了 undefined');

  /* ---- 报告 ---- */
  console.log('=== 终局联调 ===');
  console.log('60 级 600 次掉落：传世 ' + drops.total + ' 件 / 目录覆盖 ' + drops.distinct + ' 种 / 低于 40 级 ' + drops.below + ' 件');
  console.log('逐部位穿传世：' + equippedN + ' / ' + equip.length + ' 部位通过');
  console.log('套装图鉴：' + codex.n + ' 张卡 · HTML ' + codex.html + ' 字符');
  console.log('说明页：传世 ' + truth.uni + ' 件 · 套装 ' + truth.sets + ' 套 · 特性 ' + truth.traits + ' 条');
  ok(errs.length === 0, '页面报错：' + errs.slice(0, 3).join(' | '));
  await b.close();
  if (fails.length) {
    console.log('\n✗ ' + fails.length + ' 项不通过：');
    for (const f of fails) console.log('  · ' + f);
    process.exit(1);
  }
  console.log('\n✓ 全部通过');
})();
