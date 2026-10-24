/* ============================================================
 * 回归探针：锻造 + 材料图标（v1.6.0）
 * ------------------------------------------------------------
 * 一、匠材与配方：九种材料、五档区间、铜钱与用料递增
 *     - craftTierOf 覆盖 1-40 且边界不重叠
 *     - 凡品全价 / 灵品六折，折扣后不足 1 记 1
 *     - 兵刃另需玄鳞与陨星铁，防具不需要
 * 二、掉落：小怪只出凡料、精英出到灵料、首领必出神料
 * 三、结算：缺料不扣、齐料才对；部位 / 职业 / 等级保留，品质抬档
 *     - 白装胚必出灵品；蓝装胚出玄品 / 神兵 / 套装
 *     - 锻造不出法器；只替换行囊那一格
 * 四、界面：炼器台「锻造」页、需求格与按钮状态、点按钮真的出货
 * 五、图标：17 枚材料 / 丹药 / 凭证图标、材料栏改为格子 + 角标
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8899;
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const ok = m => { results.push(1); console.log('  [PASS] ' + m); };
const bad = m => { results.push(0); console.log('  [FAIL] ' + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n  锻造与材料图标回归（v1.6.0）');
  console.log('  ' + '='.repeat(66));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E9%94%BB%E9%80%A0`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(4500);

  /* ---------------- 一、匠材与配方 ---------------- */
  console.log('\n  一、匠材与配方');
  const d1 = await page.evaluate(() => {
    const o = {};
    if (typeof Game === 'undefined' || !Game.state) { o.started = false; return o; }
    o.started = true;
    o.matN = Object.keys(CRAFT_MATS).length;
    o.orderN = CRAFT_MAT_ORDER.length;
    o.orderMatch = CRAFT_MAT_ORDER.every(id => CRAFT_MATS[id]);
    o.matFields = CRAFT_MAT_ORDER.every(id => {
      const m = CRAFT_MATS[id];
      return m && m.name && m.color && m.from && m.desc && m.icon && m.icon === id;
    });
    o.tiers = CRAFT_MAT_ORDER.map(id => CRAFT_MATS[id].tier);
    o.hasT1 = o.tiers.filter(t => t === 1).length;
    o.hasT2 = o.tiers.filter(t => t === 2).length;
    o.hasT3 = o.tiers.filter(t => t === 3).length;
    o.recipeN = CRAFT_RECIPES.length;
    o.cover = CRAFT_RECIPES[0].from === 1 && CRAFT_RECIPES[CRAFT_RECIPES.length - 1].to === 40;
    o.gapFree = CRAFT_RECIPES.every((r, i) => i === 0 || r.from === CRAFT_RECIPES[i - 1].to + 1);
    o.goldAsc = CRAFT_RECIPES.every((r, i) => i === 0 || r.gold > CRAFT_RECIPES[i - 1].gold);
    o.matAsc = CRAFT_RECIPES.every((r, i) => i === 0 || Object.keys(r.mats).length >= Object.keys(CRAFT_RECIPES[i - 1].mats).length);
    o.tierEdge = [craftTierOf(1), craftTierOf(8), craftTierOf(9), craftTierOf(16), craftTierOf(17), craftTierOf(40)];
    o.tierClamp = [craftTierOf(0), craftTierOf(99)];
    o.highHasScale = !!(CRAFT_RECIPES[4].mats.scale && CRAFT_RECIPES[4].mats.meteor);
    o.lowNoScale = !CRAFT_RECIPES[0].mats.scale;

    /* 配方：凡品武器 / 灵品防具 / 非法胚 */
    const wpn = rollItem(30, { slot: 'weapon', cls: 'warrior', rarity: 'common', noRelic: true });
    const arm = rollItem(30, { slot: 'chest', rarity: 'magic', noRelic: true });
    arm.rarity = 'magic';
    const rw = craftRecipeFor(wpn), ra = craftRecipeFor(arm);
    o.wpnMeteor = !!(rw && rw.mats.meteor);
    o.wpnScale = !!(rw && rw.mats.scale);
    o.armNoMeteor = !(ra && ra.mats.meteor);
    o.armDiscounted = !!(ra && ra.mats.ore && rw.mats.ore && ra.mats.ore < rw.mats.ore);
    o.discMinOne = !!(ra && Object.keys(ra.mats).every(k => ra.mats[k] >= 1));
    o.relicNull = craftRecipeFor({ slot: 'relic', rarity: 'legendary', ilvl: 20 }) === null;
    o.setNull = craftRecipeFor({ slot: 'chest', rarity: 'set', ilvl: 20 }) === null;
    o.craftedFlag = craftableItem(arm) && !craftableItem(wpn) === false;
    return o;
  });
  if (!d1.started) { bad('开局失败'); }
  else {
    d1.matN === 9 ? ok('匠材 9 种') : bad('匠材数量 ' + d1.matN);
    d1.orderN === 9 && d1.orderMatch ? ok('CRAFT_MAT_ORDER 与 CRAFT_MATS 一致') : bad('匠材顺序表不一致');
    d1.matFields ? ok('每种匠材都有名称 / 颜色 / 来源 / 说明 / 图标键') : bad('匠材字段缺失');
    d1.hasT1 === 3 && d1.hasT2 === 3 && d1.hasT3 === 3 ? ok('三阶匠材各 3 种（凡 / 灵 / 神）') : bad('匠材阶数分布异常');
    d1.recipeN === 5 ? ok('配方 5 档') : bad('配方档数 ' + d1.recipeN);
    d1.cover && d1.gapFree ? ok('五档无缝覆盖 1-40 级') : bad('配方区间有缺口');
    d1.goldAsc ? ok('铜钱逐档递增') : bad('铜钱非递增');
    d1.matAsc ? ok('用料种类不减少') : bad('用料种类回退');
    JSON.stringify(d1.tierEdge) === JSON.stringify([1, 1, 2, 2, 3, 5]) ? ok('craftTierOf 边界正确') : bad('craftTierOf 边界 ' + JSON.stringify(d1.tierEdge));
    JSON.stringify(d1.tierClamp) === JSON.stringify([1, 5]) ? ok('craftTierOf 越界夹取') : bad('craftTierOf 越界 ' + JSON.stringify(d1.tierClamp));
    d1.highHasScale && d1.lowNoScale ? ok('玄鳞 / 陨星铁只出现在高档配方') : bad('高阶材料档位错误');
    d1.wpnMeteor && d1.wpnScale ? ok('兵器另需陨星铁与玄鳞') : bad('兵器未加料');
    d1.armNoMeteor ? ok('防具不需要陨星铁') : bad('防具被加了陨星铁');
    d1.armDiscounted ? ok('灵品胚用料少于凡品胚（六折）') : bad('灵品折扣未生效');
    d1.discMinOne ? ok('折扣后每项至少 1') : bad('折扣后出现 0');
    d1.relicNull && d1.setNull ? ok('法器 / 套装不能当胚') : bad('非法胚未被拒绝');
  }

  /* ---------------- 二、掉落 ---------------- */
  console.log('\n  二、掉落分布');
  const d2 = await page.evaluate(() => {
    const o = {};
    const tierOf = id => CRAFT_MATS[id].tier;
    let boss3 = 0, bossKinds = 0, elite3 = 0, eliteKinds = 0, normalKinds = 0, normal3 = 0;
    for (let i = 0; i < 200; i++) {
      const b = Game.rollCraftMats('boss', 1, false);
      if (b.length >= 2) bossKinds++;
      if (b.some(x => tierOf(x.id) === 3)) boss3++;
      const e = Game.rollCraftMats('elite', 1, false);
      if (e.length >= 1) eliteKinds++;
      if (e.some(x => tierOf(x.id) === 3)) elite3++;
      const n = Game.rollCraftMats('normal', 1, false);
      if (n.length >= 1) normalKinds++;
      if (n.some(x => tierOf(x.id) === 3)) normal3++;
    }
    o.bossKinds = bossKinds; o.boss3 = boss3;
    o.eliteKinds = eliteKinds; o.elite3 = elite3;
    o.normalKinds = normalKinds; o.normal3 = normal3;
    /* seeker 提升数量：比较 300 次的总量 */
    let a = 0, b = 0;
    for (let i = 0; i < 300; i++) {
      Game.rollCraftMats('boss', 1, false).forEach(x => a += x.n);
      Game.rollCraftMats('boss', 1, true).forEach(x => b += x.n);
    }
    o.seekerMore = b > a;
    /* 拾取通道：addCraftMat 累加 */
    const before = Game.craftMatCount('ore');
    Game.addCraftMat('ore', 3);
    o.added = Game.craftMatCount('ore') === before + 3;
    Game.addCraftMat('ore', -3);
    o.restored = Game.craftMatCount('ore') === before;
    o.matKey = craftMatKey('ore') === 'craft_ore';
    return o;
  });
  d2.bossKinds === 200 && d2.boss3 === 200 ? ok('首领每次掉 ≥2 种且必含神料') : bad(`首领掉落异常 (${d2.bossKinds}/${d2.boss3})`);
  d2.eliteKinds === 200 && d2.elite3 === 0 ? ok('精英必掉且不出神料') : bad(`精英掉落异常 (${d2.eliteKinds}/${d2.elite3})`);
  d2.normalKinds > 20 && d2.normalKinds < 120 && d2.normal3 === 0 ? ok('小怪约三成出凡料且不出神料') : bad(`小怪掉落异常 (${d2.normalKinds}/${d2.normal3})`);
  d2.seekerMore ? ok('山海套 seeker 提高匠材数量') : bad('seeker 未提升数量');
  d2.added && d2.restored ? ok('addCraftMat 加减正确') : bad('addCraftMat 记账错误');
  d2.matKey ? ok('匠材存档键为 craft_<id>') : bad('匠材键名不符');

  /* ---------------- 三、结算 ---------------- */
  console.log('\n  三、锻造结算');
  const d3 = await page.evaluate(() => {
    const o = {};
    Game.state.inventory = [];
    const mk = (rarity, slot, ilvl) => {
      const it = rollItem(ilvl, { slot, cls: 'warrior', rarity, noRelic: true });
      it.rarity = rarity;
      return it;
    };
    const white = mk('common', 'weapon', 20);
    const blue = mk('magic', 'chest', 20);
    Game.state.inventory.push(white, blue);

    /* 清空材料：必须先拒绝且不扣钱 */
    for (const id of CRAFT_MAT_ORDER) Game.addCraftMat(id, -Game.craftMatCount(id));
    Game.state.gold = 0;
    const goldBefore = Game.state.gold;
    const fail = Game.craftItem(0);
    o.failRejected = !fail.ok;
    o.failNoGold = Game.state.gold === goldBefore;
    o.failSameItem = Game.state.inventory[0].uid === white.uid;
    o.previewLack = (Game.craftPreview(0).info.lack || []).length > 0;

    /* 备齐：按 craftPreview 的 need 补料 */
    const pv = Game.craftPreview(0);
    pv.info.mats.forEach(m => Game.addCraftMat(m.id, m.need));
    Game.state.gold = pv.info.gold + 500;
    const pv2 = Game.craftPreview(0);
    o.canAfter = pv2.info.can === true;
    const beforeMats = {};
    pv2.info.mats.forEach(m => beforeMats[m.id] = Game.craftMatCount(m.id));
    const goldB = Game.state.gold;
    const invN = Game.state.inventory.length;
    const r = Game.craftItem(0);
    o.ok = !!r.ok;
    o.rarity = r.ok ? r.rarity : null;
    o.slotKept = Game.state.inventory[0].slot === 'weapon';
    o.ilvlKept = Game.state.inventory[0].ilvl === 20;
    o.clsKept = Game.state.inventory[0].cls === 'warrior';
    o.invN = Game.state.inventory.length === invN;
    o.matSpent = pv2.info.mats.every(m => Game.craftMatCount(m.id) === beforeMats[m.id] - m.need);
    o.goldSpent = Game.state.gold === goldB - pv2.info.gold;

    /* 白装胚必出灵品：再来五次 */
    let whiteAllMagic = true;
    for (let i = 0; i < 6; i++) {
      const w = mk('common', 'helm', 12);
      Game.state.inventory[1] = w;
      const p = Game.craftPreview(1);
      if (!p.ok) { whiteAllMagic = false; break; }
      p.info.mats.forEach(m => Game.addCraftMat(m.id, m.need));
      Game.state.gold = p.info.gold + 100;
      const rr = Game.craftItem(1);
      if (!rr.ok || Game.state.inventory[1].rarity !== 'magic') whiteAllMagic = false;
    }
    o.whiteAllMagic = whiteAllMagic;

    /* 蓝装胚：品质必须落在玄品 / 神兵 / 套装 */
    const blueSet = new Set();
    let noRelic = true;
    for (let i = 0; i < 40; i++) {
      Game.state.inventory[1] = mk('magic', 'chest', 20);
      const p = Game.craftPreview(1);
      p.info.mats.forEach(m => Game.addCraftMat(m.id, m.need));
      Game.state.gold = p.info.gold + 100;
      const rr = Game.craftItem(1);
      if (!rr.ok) { blueSet.add('FAIL'); break; }
      const got = Game.state.inventory[1].rarity;
      blueSet.add(got);
      if (Game.state.inventory[1].slot === 'relic') noRelic = false;
    }
    o.blueSet = Array.from(blueSet);
    o.noRelic = noRelic;

    /* 武器成品仍然带握持（形制没丢） */
    const wpnG = mk('magic', 'weapon', 20);
    Game.state.inventory[2] = wpnG;
    const pw = Game.craftPreview(2);
    pw.info.mats.forEach(m => Game.addCraftMat(m.id, m.need));
    Game.state.gold = pw.info.gold + 100;
    Game.craftItem(2);
    o.handKept = ['one', 'dual', 'two'].indexOf(Game.state.inventory[2].hand) >= 0;
    return o;
  });
  d3.failRejected && d3.failNoGold ? ok('缺料时拒绝且不扣铜钱') : bad('缺料仍扣了资源');
  d3.failSameItem ? ok('失败时胚装原样留在行囊') : bad('失败却换了装备');
  d3.previewLack ? ok('craftPreview 能报出缺口') : bad(' preview 缺口为空');
  d3.canAfter ? ok('补齐材料后 can = true') : bad('补齐后仍不可锻造');
  d3.ok ? ok('锻造成功返回 ok') : bad('锻造失败');
  d3.rarity === 'magic' ? ok('白装胚产出灵品') : bad('白装胚产出 ' + d3.rarity);
  d3.slotKept && d3.ilvlKept && d3.clsKept ? ok('部位 / 等级 / 职业原样保留') : bad('产物基底信息丢失');
  d3.invN ? ok('行囊格数不变（原地替换）') : bad('行囊格数变了');
  d3.matSpent && d3.goldSpent ? ok('材料与铜钱扣得准') : bad('扣料数量不对');
  d3.whiteAllMagic ? ok('白装胚六连必出灵品') : bad('白装胚有未出灵品的');
  d3.blueSet.every(r => ['rare', 'legendary', 'set'].indexOf(r) >= 0) && d3.blueSet.length >= 2
    ? ok('蓝装胚产出玄品 / 神兵 / 套装（实测 ' + d3.blueSet.join(' / ') + '）') : bad('蓝装胚产出异常 ' + d3.blueSet.join(','));
  d3.noRelic ? ok('锻造不会产出法器') : bad('锻造产出了法器');
  d3.handKept ? ok('兵刃成品仍带握持字段') : bad('兵刃握持丢失');

  /* ---------------- 四、界面 ---------------- */
  console.log('\n  四、锻造界面');
  const d4 = await page.evaluate(() => {
    const o = {};
    Game.state.inventory = [
      rollItem(20, { slot: 'weapon', cls: 'warrior', rarity: 'common', noRelic: true }),
      rollItem(20, { slot: 'chest', rarity: 'magic', noRelic: true }),
      rollItem(20, { slot: 'helm', rarity: 'rare', noRelic: true })
    ];
    UI.openMenu('forge');
    o.menuOpen = document.getElementById('menuPanel').classList.contains('open');
    o.forgeInside = document.getElementById('forgePanel').parentElement.id === 'menuBody';
    const tabs = Array.from(document.querySelectorAll('#forgePanel .ftab')).map(b => b.dataset.ftab);
    o.tabs = tabs;
    /* 手动切到锻造页 */
    UI.forgeTab = 'craft';
    UI.forgeRef = 'inv:0';
    UI.renderForge();
    o.listN = document.querySelectorAll('#forgeList .fitem').length;
    o.listOnlyBase = Array.from(document.querySelectorAll('#forgeList .fitem')).length === 2;  // 玄品不可当胚
    o.cmatN = document.querySelectorAll('#forgeMain .cmat').length;
    const btn = document.querySelector('#forgeMain [data-fcraft]');
    o.hasBtn = !!btn;
    o.btnDisabled = btn ? btn.disabled : null;
    /* 补料后按钮应变为可点 */
    const pv = Game.craftPreview(0);
    pv.info.mats.forEach(m => Game.addCraftMat(m.id, m.need));
    Game.state.gold = pv.info.gold + 999;
    UI.renderForge();
    const btn2 = document.querySelector('#forgeMain [data-fcraft]');
    o.btnEnabled = btn2 ? !btn2.disabled : false;
    return o;
  });
  d4.menuOpen ? ok('锻造入口在菜单里打开') : bad('菜单未打开');
  d4.forgeInside ? ok('炼器台被挂进菜单内容区') : bad('炼器台未嵌入菜单');
  d4.tabs.indexOf('craft') >= 0 && d4.tabs.indexOf('tier') >= 0 && d4.tabs.length === 5 ? ok('炼器台五个页签含锻造与升阶') : bad('页签异常 ' + d4.tabs.join(','));
  d4.listN === 2 && d4.listOnlyBase ? ok('锻造列表只列行囊里的白 / 蓝装') : bad('列表混入不可锻造物品 (' + d4.listN + ')');
  d4.cmatN >= 3 ? ok('需求格含匠材与铜钱 (' + d4.cmatN + ')') : bad('需求格数量 ' + d4.cmatN);
  d4.hasBtn && d4.btnDisabled === true ? ok('材料不足时锻造键置灰') : bad('按钮状态不对');
  d4.btnEnabled ? ok('补料后锻造键可点') : bad('补料后仍置灰');

  /* 真点一次按钮 */
  const d4b = await page.evaluate(() => {
    const before = Game.state.inventory[0].rarity;
    const btn = document.querySelector('#forgeMain [data-fcraft]');
    if (btn) btn.click();
    return { before, after: Game.state.inventory[0].rarity, name: Game.state.inventory[0].name, slots: document.querySelectorAll('#invGrid .islot').length };
  });
  d4b.after !== d4b.before ? ok('点击锻造键后行囊那格品质提升（' + d4b.before + '→' + d4b.after + '）') : bad('点击后品质未变');

  /* ---------------- 五、材料图标与格子 ---------------- */
  console.log('\n  五、材料图标与角标');
  const d5 = await page.evaluate(() => {
    const o = {};
    const keys = Object.keys(MAT_ICONS);
    o.iconN = keys.length;
    o.keys = keys.sort();
    o.allPath = keys.every(k => MAT_ICONS[k].indexOf('<path') === 0);
    o.noCircleRect = keys.every(k => !/<(circle|rect|ellipse) /.test(MAT_ICONS[k]));
    o.svg32 = matIcon('ore', { size: 30 }).indexOf('viewBox="0 0 32 32"') > 0;
    o.svgColor = matIcon('frost', { color: '#8fd8ff' }).indexOf('color:#8fd8ff') > 0;
    o.fallback = matIcon('nope-not-exist').indexOf('<svg') === 0;

    /* 材料栏：4 玄晶 + 9 匠材 + 持有符文 */
    Game.addCraftMat('ore', 7);
    Game.addCraftMat('meteor', 2);
    Game.addCrystalTier(1, 5);
    UI.openMenu('bag');
    UI.invTab = 'mat';
    UI.renderInventory();
    const cells = document.querySelectorAll('#invMats .mgcell');
    o.cellN = cells.length;
    o.runeKinds = Object.keys(RUNES).filter(id => Game.runeCount(id) > 0).length;
    const qty = Array.from(cells).map(c => c.querySelector('.mg-qty').textContent);
    o.qtyN = qty.length === cells.length;
    o.qtyHas7 = qty.indexOf('7') >= 0;
    o.qtyHas2 = qty.indexOf('2') >= 0;
    o.offN = document.querySelectorAll('#invMats .mgcell.off').length;
    o.zeroShown = qty.filter(t => t === '0').length > 0;

    /* 丹药栏 */
    Game.state.potions = { hp: 3, mp: 0 };
    Game.state.teleportStones = 1;
    UI.invTab = 'pill';
    UI.renderInventory();
    o.pillN = document.querySelectorAll('#invMats .mgcell').length;
    o.pillQty = Array.from(document.querySelectorAll('#invMats .mg-qty')).map(e => e.textContent);
    o.pillUse = document.querySelectorAll('#invMats [data-use]').length;

    /* 任务栏：造两单完成记录 */
    Game.state.quests.done = ['q1', 'q2'];
    UI.invTab = 'quest';
    UI.renderInventory();
    o.questN = document.querySelectorAll('#invMats .mgcell').length;

    /* 角标与徽章 */
    UI.renderTabBadges();
    o.badgeMat = document.querySelector('#invTabs .itab[data-tab="mat"] i').textContent;
    o.badgeQuest = document.querySelector('#invTabs .itab[data-tab="quest"] i').textContent;

    /* 悬停提示（桌面）：直接调 showMatTip 检查内容 */
    UI.showMatTip({ icon: matIcon('ore'), color: '#b9c2cc', name: '玄铁锭', sub: '凡料 · 来自妖兽', desc: 'x', qty: 7 }, null);
    o.tipShown = document.getElementById('tooltip').innerHTML.indexOf('玄铁锭') >= 0;
    UI.tooltipEl.style.display = 'none';
    return o;
  });
  d5.iconN === 17 ? ok('材料 / 丹药 / 凭证图标共 17 枚') : bad('图标数量 ' + d5.iconN);
  d5.allPath ? ok('全部以 <path> 起手') : bad('有图标不是路径起手');
  d5.noCircleRect ? ok('无 circle / rect / ellipse（Chrome 与 Path2D 通用）') : bad('含 circle/rect 元素');
  d5.svg32 && d5.svgColor ? ok('matIcon 输出 32 viewBox 且着色正确') : bad('matIcon 输出异常');
  d5.fallback ? ok('未知图标键回落而不是空白') : bad('未知键输出空');
  d5.cellN === 13 + d5.runeKinds ? ok('材料栏 = 4 玄晶 + 9 匠材 + 符文（' + d5.cellN + ' 格）') : bad('材料格数 ' + d5.cellN);
  d5.qtyN && d5.qtyHas7 && d5.qtyHas2 ? ok('每格都有数量角标且数值正确') : bad('角标缺失或数值不对');
  d5.zeroShown && d5.offN > 0 ? ok('未持有的材料灰显并标 0') : bad('未持有状态未表现');
  d5.pillN === 3 && d5.pillUse === 3 ? ok('丹药三格都可点用') : bad('丹药格异常 ' + d5.pillN + '/' + d5.pillUse);
  JSON.stringify(d5.pillQty) === JSON.stringify(['3', '0', '1']) ? ok('丹药角标 = 持有数') : bad('丹药角标 ' + d5.pillQty.join(','));
  d5.questN === 2 ? ok('任务凭证按委托各占一格') : bad('任务格数 ' + d5.questN);
  d5.badgeMat !== '0' && d5.badgeQuest === '2' ? ok('页签徽章随持有变化') : bad('徽章 ' + d5.badgeMat + '/' + d5.badgeQuest);
  d5.tipShown ? ok('材料悬停提示能渲染名称与说明') : bad('材料提示未渲染');

  if (errors.length) { console.log('\n  页面错误：'); errors.slice(0, 8).forEach(e => console.log('   · ' + e)); }
  const pass = results.filter(x => x).length, all = results.length;
  console.log('\n  ' + '='.repeat(66));
  console.log(`  结果：${pass} / ${all} 通过` + (errors.length ? `，页面错误 ${errors.length} 条` : '，无页面错误'));
  await browser.close();
  server.close();
  process.exit(pass === all && !errors.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
