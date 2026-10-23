/* ============================================================
 * 回归探针：套装打造（v1.1.2）
 * 覆盖：普通/稀有装备可打造成指定套装件；部位不匹配被拒；
 *       已是套装/传世被拒；材料与金币扣除；词缀/孔位/符文保留；
 *       基底按套装系数重算；套装加成在 recalc 后生效；
 *       存档往返；炼金师「套装」页签 UI 渲染与点击打造。
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8895;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

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

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n  套装打造回归');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E9%93%81%E5%B0%9A`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  const r1 = await page.evaluate(() => {
    const out = {};
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;

    /* 一件 3 孔、2 词缀、带护甲的稀有胸甲（模拟"属性不错"） */
    const chest = normalizeItem({
      kind: 'chest', slot: 'chest', name: '玄铁胸甲', rarity: 'rare', ilvl: 22, cls: 'warrior',
      baseArmor: 100, implicit: null, sockets: 3, runes: ['el', null, null],
      affixes: [
        { key: 'str', val: 12, pre: '', suf: '', tier: 2, q: 2 },
        { key: 'vit', val: 10, pre: '', suf: '', tier: 2, q: 1 }
      ],
      enhances: 1, reforges: 2
    });
    /* 一条没有该部位的套装 target 检查用：手套（青龙有手套）& 项链（青龙没有） */
    const amulet = normalizeItem({ kind: 'amulet', slot: 'amulet', name: '旧项链', rarity: 'rare', ilvl: 20, sockets: 0, runes: [], affixes: [{ key: 'int', val: 5, pre: '', suf: '', tier: 1, q: 1 }] });
    const setItem = normalizeItem({ kind: 'helm', slot: 'helm', name: '已有套装', rarity: 'set', ilvl: 20, setId: 'qinglong', setName: '青龙偃月', sockets: 1, runes: [], affixes: [] });
    const uniq = normalizeItem({ kind: 'weapon', slot: 'weapon', name: '传世测试', rarity: 'unique', ilvl: 30, uniqueId: null, sockets: 0, runes: [], affixes: [] });

    Game.state.inventory.push(chest, amulet, setItem, uniq);
    Game.state.gold = 100000;
    for (let i = 0; i < 4; i++) Game.addCrystalTier(i + 1, 100);

    out.oldArmor = chest.baseArmor;
    out.oldRunes = chest.runes.slice();

    /* 1) 青龙（战士套装，有 chest 部位）→ 应成功 */
    const rCraft = Game.craftSetItem(chest, 'qinglong');
    out.craftOk = rCraft.ok;
    out.craftMsg = rCraft.msg || '';
    out.setId = chest.setId;
    out.setName = chest.setName;
    out.name = chest.name;
    out.rarity = chest.rarity;
    out.affixCount = chest.affixes.length;
    out.affixKeys = chest.affixes.map(a => a.key);
    out.sockets = chest.sockets;
    out.runes = chest.runes.slice();
    out.enhances = chest.enhances;
    out.armorGrew = chest.baseArmor > out.oldArmor;
    out.goldLeft = Game.state.gold;
    out.crystalsLeft = [1, 2, 3, 4].map(i => Game.crystalTierCount(i));

    /* 2) 已是套装 → 拒绝 */
    const rSet = Game.craftSetItem(setItem, 'zhuque');
    out.setRejected = !rSet.ok;

    /* 3) 传世 → 拒绝 */
    const rUniq = Game.craftSetItem(uniq, 'jiuli');
    out.uniqRejected = !rUniq.ok;

    /* 4) 套装没有这个部位 → 拒绝（青龙没有 amulet） */
    const rSlot = Game.craftSetItem(amulet, 'qinglong');
    out.slotRejected = !rSlot.ok;

    /* 5) 九幽有 amulet → 应成功 */
    const rAmu = Game.craftSetItem(amulet, 'jiuyou');
    out.amuletOk = rAmu.ok && amulet.setId === 'jiuyou';

    /* 6) 材料不足 → 拒绝 */
    Game.addCrystalTier(4, -1000);
    const spear = normalizeItem({ kind: 'weapon', slot: 'weapon', name: '旧长枪', rarity: 'rare', ilvl: 20, cls: 'warrior', baseDmg: [10, 14], sockets: 0, runes: [], affixes: [{ key: 'str', val: 5, pre: '', suf: '', tier: 1, q: 1 }] });
    Game.state.inventory.push(spear);
    const rPoor = Game.craftSetItem(spear, 'jiuli');
    out.poorRejected = !rPoor.ok && /神晶/.test(rPoor.msg || '');

    /* 7) 套装加成生效：再穿一件青龙（手套）凑 2 件 */
    const gloves = normalizeItem({ kind: 'gloves', slot: 'gloves', name: '青龙护手', rarity: 'set', ilvl: 22, setId: 'qinglong', setName: '青龙偃月', cls: 'warrior', sockets: 0, runes: [], affixes: [] });
    Game.state.inventory.push(gloves);
    Game.state.equipment.chest = chest;
    Game.state.equipment.gloves = gloves;
    Game.recalc();
    out.setBonusActive = ((Game.state.stats && Game.state.stats.setBonuses) || []).some(b => b.setId === 'qinglong' && b.need === 2);

    /* 8) 存档往返 */
    Game.save();
    const flat = SaveManager.load(1);
    const c2 = flat.equipment.chest;
    out.loadedSetId = c2 && c2.setId;
    out.loadedName = c2 && c2.name;
    out.loadedRunes = c2 && c2.runes.slice();
    const text = SaveManager.exportText(1);
    SaveManager.importText(text, 2);
    const c3 = SaveManager.load(2).equipment.chest;
    out.importedSetId = c3 && c3.setId;
    out.importedArmor = c3 && c3.baseArmor;
    return out;
  });

  if (!r1.started) { bad('游戏未开局'); }
  else {
    if (r1.craftOk && r1.setId === 'qinglong' && r1.setName === '青龙偃月' && r1.name === '青龙战甲' && r1.rarity === 'set') ok('稀有胸甲成功打造成青龙「青龙战甲」');
    else bad('打造失败：' + r1.craftMsg + ' setId=' + r1.setId + ' name=' + r1.name);
    if (r1.affixCount >= 3 && r1.affixKeys.includes('str') && r1.affixKeys.includes('vit')) ok('原词缀全保留（str/vit），不足 3 条已补足到 ' + r1.affixCount);
    else bad('词缀异常：' + JSON.stringify(r1.affixKeys));
    if (r1.sockets === 3 && JSON.stringify(r1.runes) === JSON.stringify(['el', null, null])) ok('3 孔与已镶符文（el）原样保留');
    else bad('孔位/符文丢失：sockets=' + r1.sockets + ' runes=' + JSON.stringify(r1.runes));
    if (r1.enhances === 1) ok('强化次数保留');
    else bad('强化次数丢失：' + r1.enhances);
    if (r1.armorGrew) ok('基底护甲按套装系数重算（' + r1.oldArmor + ' → 更高）');
    else bad('基底未重算');
    if (r1.goldLeft === 100000 - (3000 + 22 * 250) && r1.crystalsLeft[2] === 90 && r1.crystalsLeft[3] === 96) ok('金币与玄晶/神晶扣除正确');
    else bad('费用扣除异常：gold=' + r1.goldLeft + ' crystals=' + JSON.stringify(r1.crystalsLeft));
    if (r1.setRejected) ok('已是套装的装备被拒绝');
    else bad('套装装备可被重复打造（BUG）');
    if (r1.uniqRejected) ok('传世装备被拒绝');
    else bad('传世装备可打造成套装（BUG）');
    if (r1.slotRejected) ok('套装没有该部位时被拒绝（青龙×项链）');
    else bad('部位不匹配却打造成功（BUG）');
    if (r1.amuletOk) ok('项链可打进有该项的套装（九幽锁魂链）');
    else bad('九幽项链打造失败');
    if (r1.poorRejected) ok('材料不足时被拒绝并提示神晶');
    else bad('材料不足未拦截');
    if (r1.setBonusActive) ok('2 件青龙套装加成在 recalc 后生效');
    else bad('套装加成未生效');
    if (r1.loadedSetId === 'qinglong' && r1.loadedName === '青龙战甲' && JSON.stringify(r1.loadedRunes) === JSON.stringify(['el', null, null])) ok('存档往返后套装/名字/符文保留');
    else bad('读档后数据丢失：' + r1.loadedSetId + '/' + r1.loadedName);
    if (r1.importedSetId === 'qinglong' && r1.importedArmor > 100) ok('导出→导入后套装与重算后的基底保留');
    else bad('导入后数据丢失：' + r1.importedSetId);
  }

  /* ---------- UI：炼金师「套装」页签 ---------- */
  const ui = await page.evaluate(() => {
    /* 补回材料（上一步"材料不足"用例把神晶清空了），否则按钮会禁用 */
    for (let i = 0; i < 4; i++) Game.addCrystalTier(i + 1, 100);
    Game.state.gold = 100000;
    /* 清干净，只留一件可打造的胸甲 */
    Game.state.equipment.chest = null;
    Game.state.equipment.gloves = null;
    Game.state.inventory = Game.state.inventory.filter(it => it.name === '玄铁胸甲' || (!it.setId && it.rarity !== 'unique' && setCraftTargets(it).length));
    const idx = Game.state.inventory.findIndex(it => it.name === '玄铁胸甲');
    if (idx < 0) {
      const chest = normalizeItem({ kind: 'chest', slot: 'chest', name: '玄铁胸甲', rarity: 'rare', ilvl: 22, cls: 'warrior', baseArmor: 100, sockets: 0, runes: [], affixes: [{ key: 'str', val: 12, pre: '', suf: '', tier: 2, q: 2 }] });
      Game.state.inventory.push(chest);
    }
    const i2 = Game.state.inventory.findIndex(it => it.name === '玄铁胸甲');
    UI.alchemistTab = 'setcraft';
    UI.alchemistSetId = null;
    UI.alchemistRef = 'inv:' + i2;
    UI.openAlchemist();
    const cards = [...document.querySelectorAll('#alchemistMain [data-aset]')].map(e => e.dataset.aset);
    const tabOn = document.querySelector('#alchemistPanel .ftab[data-atab="setcraft"]').classList.contains('on');
    return { cards, tabOn, count: cards.length };
  });
  if (ui.tabOn && ui.count >= 5) ok('「套装」页签渲染 ' + ui.count + ' 个可选套装卡片');
  else bad('套装页签异常：tabOn=' + ui.tabOn + ' cards=' + ui.count);

  /* 选中天罡 → 点打造 */
  const ui2 = await page.evaluate(() => {
    const item = Game.state.inventory.find(it => it.name === '玄铁胸甲');
    const card = document.querySelector('#alchemistPanel [data-aset="tiangang"]');
    if (card) card.click();
    const btn = document.querySelector('#alchemistMain [data-setscraft]');
    const btnTxt = btn ? btn.textContent.trim() : '';
    if (btn && !btn.disabled) btn.click();
    return { setId: item.setId, name: item.name, btnTxt };
  });
  if (ui2.setId === 'tiangang' && ui2.name === '天罡战甲') ok('UI 点击打造成功 → 天罡战甲（按钮文案：' + ui2.btnTxt + '）');
  else bad('UI 打造失败：setId=' + ui2.setId + ' name=' + ui2.name);

  /* ---------- 收尾 ---------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-setcraft.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
