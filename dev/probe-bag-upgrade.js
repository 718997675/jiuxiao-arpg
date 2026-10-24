/* ============================================================
 * 回归探针：行囊扩容（v1.4.0）
 * ------------------------------------------------------------
 * 一、档位表：基础 40 格，8 档 / 每档 +8 / 上限 104
 *     - 容量严格递增、铜钱严格递增
 *     - 首档只要凡晶（新号能上手）
 *     - bagTierOf / bagNextUpgrade / bagHardCap 边界正确
 * 二、扩容判定：材料与铜钱不足时拒绝、够时扣得准
 *     - 缺料不扣钱不出货
 *     - 扩容后 maxInv 生效，addItem 按新容量收
 *     - 冲满档后第 9 次返回「极限」
 *     - pack → unpack 往返保住容量
 * 三、界面：容量旁「扩容」→ 内联条展开 → 确认后格子立刻变多
 *     - 未扩容时按需渲染格子（不铺满）
 *     - 扩容后铺满整行容量
 *     - 满档时按钮转灰、条内不再给扩容键
 *     - 切材料栏时扩容条与按钮一并收起
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8899;
const EDGE_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const EDGE = EDGE_CANDIDATES.find(p => fs.existsSync(p)) || EDGE_CANDIDATES[0];
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
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n  行囊扩容回归（v1.4.0）');
  console.log('  ' + '='.repeat(66));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E6%89%A9%E5%AE%B9`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(4500);

  /* ---------------- 一、档位表 ---------------- */
  const d = await page.evaluate(() => {
    const o = {};
    if (typeof Game === 'undefined' || !Game.state) { o.started = false; return o; }
    o.started = true;
    o.n = BAG_UPGRADES.length;
    o.base = BAG_BASE_CAP;
    o.step = BAG_STEP;
    o.monotone = BAG_UPGRADES.every((u, i) => u.cap === BAG_BASE_CAP + BAG_STEP * (i + 1));
    o.goldAsc = BAG_UPGRADES.every((u, i) => i === 0 || u.gold > BAG_UPGRADES[i - 1].gold);
    o.crystalAsc = BAG_UPGRADES.every((u, i) => i === 0 ||
      u.crystal.reduce((a, b) => a + b, 0) > BAG_UPGRADES[i - 1].crystal.reduce((a, b) => a + b, 0));
    o.firstCheap = BAG_UPGRADES[0].crystal.slice(1).every(n => n === 0);
    o.tier0 = bagTierOf(40);
    o.tier1 = bagTierOf(48);
    o.tierMax = bagTierOf(104);
    o.tierOver = bagTierOf(200);            // 超出表也不越界
    o.next40 = (bagNextUpgrade(40) || {}).cap;
    o.nextMax = bagNextUpgrade(104);
    o.hard = bagHardCap();
    o.newCap = Game.bagCap();
    o.maxInvInit = Game.state.maxInv;
    return o;
  });

  if (d.started) ok('游戏已开局，扩容数据可用');
  else { bad('未开局，后续断言全部跳过'); }

  if (d.n === 8) ok('扩容共 8 档');
  else bad('档位数量异常：' + d.n);
  if (d.monotone && d.base === 40 && d.step === 8)
    ok('从 40 格起、每档 +8，档位与容量严格对应');
  else bad('档位与容量不对应：' + JSON.stringify(d));
  if (d.hard === 104) ok('上限 104 格（40 + 8×8）');
  else bad('上限异常：' + d.hard);
  if (d.goldAsc) ok('铜钱消耗逐档递增');
  else bad('铜钱消耗不是递增');
  if (d.crystalAsc) ok('玄晶总消耗逐档递增');
  else bad('玄晶消耗不是递增');
  if (d.firstCheap) ok('首档只用凡晶，新号也能扩第一次');
  else bad('首档就吃高阶晶，门槛过高');
  if (d.tier0 === 0 && d.tier1 === 1 && d.tierMax === 8 && d.tierOver === 8)
    ok('bagTierOf 边界正确（40→0 / 48→1 / 104→8 / 超表夹到 8）');
  else bad('bagTierOf 边界错：' + JSON.stringify([d.tier0, d.tier1, d.tierMax, d.tierOver]));
  if (d.next40 === 48 && d.nextMax === null)
    ok('bagNextUpgrade(40)=48 格、满档返回 null');
  else bad('bagNextUpgrade 异常：' + JSON.stringify([d.next40, d.nextMax]));
  if (d.newCap === 40 && d.maxInvInit === 40)
    ok('新档容量 40 格，maxInv 与 bagCap 一致');
  else bad('新档容量异常：' + JSON.stringify([d.newCap, d.maxInvInit]));

  /* ---------------- 二、扩容判定 ---------------- */
  const g = await page.evaluate(() => {
    const o = {};
    const s = Game.state;
    s.maxInv = BAG_BASE_CAP;
    s.gold = 0;
    for (let i = 1; i <= 4; i++) Game.addMat('crystal' + i, -Game.crystalTierCount(i));

    let info = Game.bagUpgradeInfo();
    o.tier = info.tier;
    o.nextCap = info.next && info.next.cap;
    o.noMatCan = info.can;
    o.noMatLack = info.lack.slice();
    o.costRows = info.cost.map(c => c.name + ':' + c.need);

    /* 只给凡晶、不给铜钱 → 只缺铜钱 */
    Game.addMat('crystal1', 100);
    s.gold = 0;
    info = Game.bagUpgradeInfo();
    o.goldOnlyLack = info.can === false && info.lack.join(',') === '铜钱';

    /* 补足铜钱 */
    s.gold = 100000;
    info = Game.bagUpgradeInfo();
    o.canNow = info.can;

    const before = { c1: Game.crystalTierCount(1), gold: s.gold };
    const r1 = Game.upgradeBag();
    o.ok1 = r1.ok;
    o.cap1 = s.maxInv;
    o.c1Delta = before.c1 - Game.crystalTierCount(1);
    o.goldDelta = before.gold - s.gold;

    /* 材料清空后再点 → 拒绝，且容量不动 */
    for (let i = 1; i <= 4; i++) Game.addMat('crystal' + i, -Game.crystalTierCount(i));
    s.gold = 0;
    const capBefore = s.maxInv;
    const r2 = Game.upgradeBag();
    o.failOk = r2.ok;
    o.failMsg = r2.msg || '';
    o.capStable = s.maxInv === capBefore;

    /* 一路扩到满 */
    for (let i = 0; i < 20; i++) {
      Game.addMat('crystal1', 400); Game.addMat('crystal2', 200);
      Game.addMat('crystal3', 100); Game.addMat('crystal4', 50);
      s.gold = 100000;
      if (!Game.upgradeBag().ok) break;
    }
    o.capMax = s.maxInv;
    const r3 = Game.upgradeBag();
    o.overOk = r3.ok;
    o.overMsg = r3.msg || '';
    o.infoMaxNoNext = Game.bagUpgradeInfo().next === null;

    /* addItem 按新容量收：塞到第 104 件应成功，第 105 件应被拒 */
    s.inventory = [];
    return o;
  });

  if (g.tier === 0 && g.nextCap === 48) ok('初始读数为第 1 档目标 48 格');
  else bad('初始读数异常：' + JSON.stringify([g.tier, g.nextCap]));
  if (g.noMatCan === false && g.noMatLack.length >= 2)
    ok('材料 / 铜钱双缺时判定为不可扩（缺：' + g.noMatLack.join('、') + '）');
  else bad('缺料判定异常：' + JSON.stringify([g.noMatCan, g.noMatLack]));
  if (g.costRows.length === 1 && g.costRows[0] === '凡晶:12')
    ok('首档消耗只有凡晶（12 枚），与档位表一致');
  else bad('首档消耗异常：' + JSON.stringify(g.costRows));
  if (g.goldOnlyLack) ok('给足玄晶但铜钱不够时，只报缺铜钱');
  else bad('铜钱缺口未单独识别');
  if (g.canNow) ok('材料齐备后判定可扩容');
  else bad('材料齐备仍判不可扩');
  if (g.ok1 && g.cap1 === 48) ok('扩容成功，容量 40 → 48');
  else bad('扩容失败：' + JSON.stringify([g.ok1, g.cap1]));
  if (g.c1Delta === 12) ok('按表扣凡晶 12 枚');
  else bad('凡晶扣减异常：' + g.c1Delta);
  if (g.goldDelta === 300) ok('按表扣铜钱 300');
  else bad('铜钱扣减异常：' + g.goldDelta);
  if (g.failOk === false && g.failMsg.indexOf('不足') >= 0 && g.capStable)
    ok('材料不足时拒绝扩容，容量与材料都不动');
  else bad('缺料仍扩容：' + JSON.stringify([g.failOk, g.failMsg, g.capStable]));
  if (g.capMax === 104) ok('连续扩容可一路到 104 格');
  else bad('满档容量异常：' + g.capMax);
  if (g.overOk === false && g.overMsg.indexOf('极限') >= 0 && g.infoMaxNoNext)
    ok('满档后第 9 次扩容被拒（已至极限）');
  else bad('满档仍可扩：' + JSON.stringify([g.overOk, g.overMsg, g.infoMaxNoNext]));

  /* 存档往返 + 收件上限 */
  const sv = await page.evaluate(() => {
    const o = {};
    const s = Game.state;
    const doc = SaveManager.pack(s);
    const back = SaveManager.unpack(doc);
    o.saveCap = back.maxInv;
    o.saveTier = bagTierOf(back.maxInv);

    /* 用扩容后的容量收件：先直接铺满 103 件，再走 addItem 试第 104 / 105 件 */
    s.inventory = [];
    for (let i = 0; i < 103; i++) s.inventory.push(rollItem(1, { slot: 'ring', rarity: 'common', noRelic: true }));
    const r104 = Game.addItem(rollItem(1, { slot: 'ring', rarity: 'common', noRelic: true }));
    const n104 = s.inventory.length;
    const r105 = Game.addItem(rollItem(1, { slot: 'ring', rarity: 'common', noRelic: true }));
    o.filled = n104;
    o.ok104 = r104;
    o.ok105 = r105;
    o.overflow = s.inventory.length;
    return o;
  });

  if (sv.saveCap === 104 && sv.saveTier === 8)
    ok('存档往返保住容量 104 格（档位 8）');
  else bad('存档丢容量：' + JSON.stringify([sv.saveCap, sv.saveTier]));
  if (sv.filled === 104 && sv.ok104 === true && sv.ok105 === false && sv.overflow === 104)
    ok('扩容后的 104 格全部可用，第 105 件被挡下');
  else bad('收件上限异常：' + JSON.stringify([sv.filled, sv.ok104, sv.ok105, sv.overflow]));

  /* ---------------- 三、界面 ---------------- */
  const u0 = await page.evaluate(() => {
    const o = {};
    const s = Game.state;
    s.maxInv = BAG_BASE_CAP;
    s.inventory = [];
    for (let i = 1; i <= 4; i++) Game.addMat('crystal' + i, -Game.crystalTierCount(i));
    s.gold = 0;
    UI.invTab = 'equip';
    UI.invUpOpen = false;
    if (!document.getElementById('invPanel').classList.contains('open')) UI.toggleInv();
    UI.renderInventory();
    o.capText = document.getElementById('invCap').textContent;
    o.btn = (document.getElementById('invUpBtn') || {}).textContent || '';
    o.btnVisible = document.getElementById('invUpBtn').style.display !== 'none';
    o.cells = document.querySelectorAll('#invGrid .islot').length;
    o.barHidden = document.getElementById('invUpBar').style.display === 'none';
    return o;
  });

  if (u0.capText === '0 / 40') ok('装备栏容量文案为 0 / 40');
  else bad('容量文案异常：' + u0.capText);
  if (u0.btn.trim() === '扩 容' && u0.btnVisible) ok('容量旁有可点的「扩容」入口');
  else bad('扩容入口异常：' + JSON.stringify([u0.btn, u0.btnVisible]));
  if (u0.cells === 40) ok('未扩容时铺满 40 格（格子数 = 容量，右列不留白）');
  else bad('未扩容格子数异常：' + u0.cells);
  if (u0.barHidden) ok('扩容条默认收起');
  else bad('扩容条默认就展开了');

  await page.click('#invUpBtn');
  await sleep(150);
  const u1 = await page.evaluate(() => {
    const bar = document.getElementById('invUpBar');
    const o = {};
    o.shown = bar.style.display !== 'none' && bar.offsetHeight > 0;
    o.hasGo = !!bar.querySelector('[data-upgo]');
    o.goDisabled = bar.querySelector('[data-upgo]') ? bar.querySelector('[data-upgo]').disabled : null;
    o.dots = bar.querySelectorAll('.udots span').length;
    o.dotNow = bar.querySelectorAll('.udots span.now').length;
    o.capTxt = (bar.querySelector('.ucap') || {}).textContent || '';
    o.hint = (bar.querySelector('.uhint') || {}).textContent || '';
    return o;
  });

  if (u1.shown) ok('点「扩容」展开行囊内的扩容条');
  else bad('扩容条未展开');
  if (u1.dots === 8 && u1.dotNow === 1) ok('档位点阵 8 颗，当前第 1 颗点亮');
  else bad('档位点阵异常：' + JSON.stringify([u1.dots, u1.dotNow]));
  if (u1.capTxt.replace(/\s/g, '') === '40→48格') ok('条内显示 40 → 48 格');
  else bad('条内容量文案异常：' + u1.capTxt);
  if (u1.hasGo && u1.goDisabled === true) ok('材料不足时扩容键置灰');
  else bad('扩容键状态异常：' + JSON.stringify([u1.hasGo, u1.goDisabled]));
  if (u1.hint.indexOf('还差') >= 0) ok('条内直接写明还差哪些材料');
  else bad('缺料提示缺失：' + u1.hint);

  /* 给料 → 点确认 → 容量与格子同步变大 */
  await page.evaluate(() => {
    Game.addMat('crystal1', 50);
    Game.state.gold = 5000;
    UI.renderInventory();
  });
  await sleep(120);
  const beforeClick = await page.evaluate(() => ({
    c1: Game.crystalTierCount(1), gold: Game.state.gold,
    goEnabled: !document.querySelector('#invUpBar [data-upgo]').disabled
  }));
  if (beforeClick.goEnabled) ok('材料给足后扩容键转为可点');
  else bad('材料给足仍不可点');

  await page.click('#invUpBar [data-upgo]');
  await sleep(200);
  const u2 = await page.evaluate(() => {
    const s = Game.state;
    const bar = document.getElementById('invUpBar');
    return {
      cap: s.maxInv,
      capText: document.getElementById('invCap').textContent,
      cells: document.querySelectorAll('#invGrid .islot').length,
      c1: Game.crystalTierCount(1),
      gold: s.gold,
      barStill: bar.style.display !== 'none',
      dotDone: bar.querySelectorAll('.udots span.done').length,
      dotNow: bar.querySelectorAll('.udots span.now').length
    };
  });

  if (u2.cap === 48) ok('点确认后容量变为 48 格');
  else bad('确认后容量异常：' + u2.cap);
  if (u2.capText === '0 / 48' && u2.cells === 48)
    ok('容量文案同步为 0 / 48，格子当场铺满 48 格');
  else bad('界面未同步：' + JSON.stringify([u2.capText, u2.cells]));
  if (u2.c1 === beforeClick.c1 - 12 && u2.gold === beforeClick.gold - 300)
    ok('点击即扣 12 凡晶 + 300 铜钱');
  else bad('扣费异常：' + JSON.stringify([u2.c1, u2.gold, beforeClick]));
  if (u2.barStill && u2.dotDone === 1 && u2.dotNow === 1)
    ok('扩容条留在原地、档位推进到第 2 次');
  else bad('扩容条未刷新：' + JSON.stringify([u2.barStill, u2.dotDone, u2.dotNow]));

  /* 收起 → 满档形态 → 切栏隐藏 */
  await page.click('#invUpBtn');
  await sleep(120);
  const u3 = await page.evaluate(() => ({
    hidden: document.getElementById('invUpBar').style.display === 'none'
  }));
  if (u3.hidden) ok('再点一次收起扩容条');
  else bad('扩容条收不起来');

  const u4 = await page.evaluate(() => {
    const s = Game.state;
    for (let i = 0; i < 20; i++) {
      Game.addMat('crystal1', 400); Game.addMat('crystal2', 200);
      Game.addMat('crystal3', 100); Game.addMat('crystal4', 50);
      s.gold = 100000;
      if (!Game.upgradeBag().ok) break;
    }
    UI.invUpOpen = true;
    UI.renderInventory();
    const bar = document.getElementById('invUpBar');
    const btn = document.getElementById('invUpBtn');
    return {
      cap: s.maxInv,
      cells: document.querySelectorAll('#invGrid .islot').length,
      btn: btn.textContent.trim(),
      btnFull: btn.classList.contains('full'),
      noGo: !bar.querySelector('[data-upgo]'),
      tierTxt: (bar.querySelector('.utier') || {}).textContent || '',
      dotsDone: bar.querySelectorAll('.udots span.done').length
    };
  });

  if (u4.cap === 104 && u4.cells === 104)
    ok('满档后 104 格全部铺出');
  else bad('满档格子异常：' + JSON.stringify([u4.cap, u4.cells]));
  if (u4.btn === '已 满' && u4.btnFull) ok('满档时入口按钮转为「已满」灰态');
  else bad('满档按钮态异常：' + JSON.stringify([u4.btn, u4.btnFull]));
  if (u4.noGo && u4.tierTxt.indexOf('上限') >= 0 && u4.dotsDone === 8)
    ok('满档条内不再给扩容键，改为「已达上限」');
  else bad('满档条异常：' + JSON.stringify([u4.noGo, u4.tierTxt, u4.dotsDone]));

  const u5 = await page.evaluate(() => {
    UI.invTab = 'mat';
    UI.renderInventory();
    const o = {
      barHidden: document.getElementById('invUpBar').style.display === 'none',
      btnHidden: document.getElementById('invUpBtn').style.display === 'none'
    };
    UI.invTab = 'equip';
    UI.invUpOpen = false;
    UI.renderInventory();
    return o;
  });
  if (u5.barHidden && u5.btnHidden) ok('切到材料栏时扩容条与入口一并收起');
  else bad('切栏未收起扩容相关元素：' + JSON.stringify(u5));

  if (errors.length) { console.log('\n  页面报错：'); errors.slice(0, 6).forEach(e => console.log('   · ' + e)); }

  const pass = results.filter(Boolean).length;
  console.log('\n  ' + '='.repeat(66));
  console.log(`  结果：${pass} / ${results.length} 通过`);
  await browser.close();
  server.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
