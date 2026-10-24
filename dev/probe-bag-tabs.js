/* ============================================================
 * 回归探针：行囊四栏 + 兵器握持（v1.3.0）
 * ------------------------------------------------------------
 * 一、四栏切换：装备 / 材料 / 丹药 / 任务物品
 *     - 默认装备栏，切栏只换右侧内容，纸娃娃常驻
 *     - 材料栏按玄晶四阶 + 已有符文出条目
 *     - 丹药栏数字与存档一致，点击即用
 *     - 任务物品栏按「已完成委托」生成凭证，不占行囊
 *     - 装备栏底部有人物详细属性（分组 ≥ 4）
 * 二、兵器握持：one 单手 / dual 双持 / two 双手
 *     - 双手装上 → 副手自动卸回行囊，副手格锁定
 *     - 双手在握 → 副手拒绝穿戴
 *     - 双持武器：主手已有兵器时点击直接补到副手
 *     - 单手兵器 / 副手装备不能串槽
 *     - 主手卸下时副手那把双持兵器一并收回
 *     - 异常存档由 repairHands 纠正
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8897;
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

  console.log('\n  行囊四栏 + 兵器握持回归（v1.3.0）');
  console.log('  ' + '='.repeat(66));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E5%9B%9B%E6%A0%8F`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  /* ---------------- 一、四栏 ---------------- */
  const t1 = await page.evaluate(() => {
    const out = {};
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;
    const s = Game.state;
    s.level = 40; Game.recalc();
    s.potions = { hp: 7, mp: 3 };
    s.teleportStones = 2;
    Game.addMat('crystal1', 12); Game.addMat('crystal2', 5);
    Game.addMat('crystal3', 2); Game.addMat('crystal4', 0);
    Game.addMat('rune_el', 3); Game.addMat('rune_sol', 1);
    s.quests.done = ['q1', 'q2'];
    const invBefore = s.inventory.length;

    UI.invTab = 'equip';
    UI.toggleInv();
    const tabs = [...document.querySelectorAll('#invTabs .itab')];
    out.tabCount = tabs.length;
    out.tabNames = tabs.map(b => b.textContent.trim().split(/\s/)[0]);
    out.defaultOn = (document.querySelector('#invTabs .itab.on') || {}).dataset ? document.querySelector('#invTabs .itab.on').dataset.tab : null;
    out.gridShown = document.getElementById('invGrid').style.display !== 'none';
    out.matsShown = document.getElementById('invMats').style.display !== 'none';
    out.sortShown = document.getElementById('invSort').style.display !== 'none';
    /* 详细属性 */
    out.statGroups = document.querySelectorAll('#invStats .st-grp').length;
    out.statRows = document.querySelectorAll('#invStats > div').length;
    out.statHasAtk = /攻击力/.test(document.getElementById('invStats').textContent);
    out.statShown = document.getElementById('invStats').style.display !== 'none';

    /* 材料栏 */
    tabs.find(b => b.dataset.tab === 'mat').click();
    out.matRows = [...document.querySelectorAll('#invMats .matrow')].map(r => ({
      name: r.querySelector('.mn b').textContent, n: r.querySelector('.mt').textContent
    }));
    out.matGridHidden = document.getElementById('invGrid').style.display === 'none';
    out.matStatsHidden = document.getElementById('invStats').style.display === 'none';
    out.matCap = document.getElementById('invCap').textContent;

    /* 丹药栏 */
    tabs.find(b => b.dataset.tab === 'pill').click();
    out.pillRows = [...document.querySelectorAll('#invMats .matrow')].length;
    out.pillTxt = document.getElementById('invMats').textContent.replace(/\s+/g, '');
    const hpRow = [...document.querySelectorAll('#invMats .matrow')].find(r => /回春丹/.test(r.textContent));
    const hpBefore = s.potions.hp;
    hpRow.click();
    out.potionUsed = s.potions.hp === hpBefore - 1;

    /* 任务物品栏 */
    tabs.find(b => b.dataset.tab === 'quest').click();
    out.questRows = [...document.querySelectorAll('#invMats .matrow')].map(r => r.querySelector('.mn b').textContent);
    out.questNotInBag = s.inventory.length === invBefore;
    out.questCap = document.getElementById('invCap').textContent;

    /* 空任务物品时的文案 */
    s.quests.done = [];
    UI.invTab = 'quest'; UI.renderInventory();
    out.questEmpty = /尚无任务物品/.test(document.getElementById('invMats').textContent);

    return out;
  });

  if (!t1.started) bad('游戏未开局');
  else {
    if (t1.tabCount === 4) ok('行囊分四栏：' + t1.tabNames.join(' / '));
    else bad('栏位数量异常：' + t1.tabCount);
    if (t1.defaultOn === 'equip' && t1.gridShown && !t1.matsShown) ok('默认停在装备栏，只显示装备格');
    else bad('默认栏位异常：' + t1.defaultOn);
    if (t1.sortShown) ok('装备栏显示排序 / 分解 / 图鉴条');
    else bad('装备栏排序条缺失');
    if (t1.matGridHidden && t1.matStatsHidden) ok('切到材料栏只换右侧内容，装备格与详细属性收起');
    else bad('材料栏布局异常：gridHidden=' + t1.matGridHidden + ' statsHidden=' + t1.matStatsHidden);
    if (t1.matRows.length === 6) ok('材料栏列出玄晶四阶 + 手中的 2 种符文（共 6 行）');
    else bad('材料行数异常：' + t1.matRows.length + ' → ' + JSON.stringify(t1.matRows));
    const c3 = t1.matRows.find(r => /玄晶/.test(r.name));
    if (c3 && c3.n === '×2') ok('玄晶数量与存档一致（三阶 ×2）');
    else bad('玄晶数量异常：' + JSON.stringify(c3));
    if (t1.pillRows === 3) ok('丹药栏固定三行：回春丹 / 凝露 / 传送阵石');
    else bad('丹药行数异常：' + t1.pillRows);
    if (/回春丹.*×7/.test(t1.pillTxt) && /传送阵石.*×2/.test(t1.pillTxt)) ok('丹药数量与存档一致（回春丹 ×7 / 阵石 ×2）');
    else bad('丹药数量异常：' + t1.pillTxt);
    if (t1.potionUsed) ok('点丹药行即服用（回春丹 -1）');
    else bad('丹药未生效');
    if (t1.questRows.length === 2 && t1.questRows.every(n => /凭证$/.test(n))) ok('任务物品栏按已完成委托生成凭证（2 枚）');
    else bad('任务物品异常：' + JSON.stringify(t1.questRows));
    if (t1.questNotInBag) ok('任务物品不占行囊格位');
    else bad('任务物品挤占了行囊');
    if (/任务物品\s*2/.test(t1.questCap)) ok('栏头按「枚」统计任务物品');
    else bad('任务物品栏头异常：' + t1.questCap);
    if (t1.questEmpty) ok('无委托完成时给出空态文案');
    else bad('任务物品空态缺失');
    if (t1.statGroups >= 3 && t1.statRows >= 15 && t1.statHasAtk) ok(`装备栏底部展示人物详细属性（${t1.statGroups} 组 / ${t1.statRows} 条，与属性面板同源）`);
    else bad('详细属性异常：groups=' + t1.statGroups + ' rows=' + t1.statRows);
  }

  /* ---------------- 二、兵器握持 ---------------- */
  const t2 = await page.evaluate(() => {
    const out = {};
    const s = Game.state;

    /* 数据层：每档三变体各占一种握持 */
    out.tierOk = [];
    for (const cls in WEAPON_BASES) {
      WEAPON_BASES[cls].forEach((tier, ti) => {
        const hs = WEAPON_HANDS[cls][ti].slice().sort().join(',');
        if (hs === 'dual,one,two') out.tierOk.push(cls + ti);
      });
    }
    out.tierCount = out.tierOk.length;

    /* 生成层：30 把武器 hand 合法 */
    const gen = [];
    for (let i = 0; i < 30; i++) gen.push(rollItem(30, { slot: 'weapon', cls: 'warrior', rarity: 'rare' }));
    out.genLegal = gen.every(w => ['one', 'dual', 'two'].includes(w.hand));
    out.genHands = [...new Set(gen.map(w => w.hand))].sort();

    /* 造四件测试装备 */
    const wp = (hand, name) => normalizeItem({
      kind: '武器', slot: 'weapon', name, rarity: 'rare', ilvl: 32, cls: 'warrior',
      hand, shape: hand === 'two' ? 'axe' : (hand === 'dual' ? 'saber' : 'sword'),
      baseDmg: [40, 60], speed: 1, sockets: 0, runes: [], affixes: [], reqLv: 1
    });
    const shield = () => normalizeItem({ kind: '副手', slot: 'offhand', name: '试炼盾', rarity: 'rare', ilvl: 32, cls: 'warrior', baseArmor: 90, sockets: 0, runes: [], affixes: [], reqLv: 1 });
    const one = wp('one', '单手剑'), dual = wp('dual', '双持刀'), two = wp('two', '双手斧');
    s.equipment.weapon = null; s.equipment.offhand = null;
    s.inventory = [one, dual, two, shield()];
    Game.recalc();

    /* 1. 单手进主手 */
    Game.equipFromInv(0);
    out.step1 = s.equipment.weapon && s.equipment.weapon.hand === 'one';

    /* 2. 双持武器：主手已有兵器 → 自动补到副手 */
    Game.equipFromInv(0);
    out.step2 = !!(s.equipment.offhand && s.equipment.offhand.hand === 'dual');
    out.step2weapon = s.equipment.weapon && s.equipment.weapon.hand;

    /* 3. 换双手：副手自动卸回行囊（旧主手回行囊 → 净 +1） */
    const invN = s.inventory.length;
    Game.equipFromInv(s.inventory.findIndex(it => it && it.hand === 'two'));
    out.step3 = s.equipment.weapon.hand === 'two' && s.equipment.offhand === null;
    out.step3return = s.inventory.length === invN + 1;
    out.step3hasDual = s.inventory.some(it => it && it.hand === 'dual');

    /* 4. 双手在握时穿副手 → 拒绝 */
    const logs = [];
    const oldLog = UI.log;
    UI.log = (m, t) => { logs.push(m + '|' + t); };
    Game.equipFromInv(s.inventory.findIndex(it => it && it.slot === 'offhand'));
    out.step4 = s.equipment.offhand === null && logs.some(l => /双手兵器/.test(l));
    UI.log = oldLog;

    /* 副手格应为锁定态 */
    UI.renderInventory();
    out.lockedClass = document.querySelector('.eslot[data-slot="offhand"]').classList.contains('locked');

    /* 5. 换回单手 → 副手可以穿盾 */
    Game.equipFromInv(s.inventory.findIndex(it => it && it.hand === 'one'));
    Game.equipFromInv(s.inventory.findIndex(it => it && it.slot === 'offhand'));
    out.step5 = !!(s.equipment.offhand && s.equipment.offhand.slot === 'offhand');

    /* 6. 单手兵器 / 副手装备不能串槽 */
    out.fits = {
      oneToOff: Game.fitsSlot(one, 'offhand') === false,
      dualToOff: Game.fitsSlot(dual, 'offhand') === true,
      twoToOff: Game.fitsSlot(two, 'offhand') === false,
      shieldToWeapon: Game.fitsSlot(shield(), 'weapon') === false,
      ringToRing2: Game.fitsSlot(normalizeItem({ kind: '戒指', slot: 'ring', name: '戒', rarity: 'rare', ilvl: 20, affixes: [] }), 'ring2') === true
    };

    /* 7. 主手卸下 → 副手那把双持兵器一并收回 */
    s.equipment.offhand = null;
    s.inventory.push(wp('dual', '副手刀'));
    Game.equipFromInv(s.inventory.length - 1);        // 落到副手
    out.step7pre = !!(s.equipment.offhand && s.equipment.offhand.hand === 'dual');
    const before7 = s.inventory.length;
    Game.unequip('weapon');
    out.step7 = s.equipment.weapon === null && s.equipment.offhand === null && s.inventory.length === before7 + 2;

    /* 8. 异常存档：双手 + 副手并存 → repairHands 纠正 */
    s.equipment.weapon = two;
    s.equipment.offhand = shield();
    const invBefore8 = s.inventory.length;
    Game.recalc();
    out.step8 = s.equipment.offhand === null && s.inventory.length === invBefore8 + 1;

    /* 9. 提示框显示握持 */
    out.tipTwo = /双手/.test(itemTooltip(two));
    out.tipDual = /双持/.test(itemTooltip(dual));
    out.tipOne = /单手/.test(itemTooltip(one));
    out.tipTwoDesc = /占用副手位/.test(itemTooltip(two));

    return out;
  });

  if (t2.tierCount === 15) ok('15 个档位（3 职业 × 5 档）都恰好一件单手 / 双持 / 双手');
  else bad('档位握持分布异常：' + t2.tierCount + '/15');
  if (t2.genLegal && t2.genHands.length === 3) ok('随机掉落的兵器三类握持都会出现（' + t2.genHands.join('/') + '）');
  else bad('生成层握持异常：' + JSON.stringify(t2.genHands));
  if (t2.step1) ok('单手兵器落主手');
  else bad('单手兵器未落主手');
  if (t2.step2 && t2.step2weapon === 'one') ok('双持兵器在主手已满时自动补到副手（主手仍是单手）');
  else bad('双持补副手失败：' + JSON.stringify([t2.step2, t2.step2weapon]));
  if (t2.step3 && t2.step3return && t2.step3hasDual) ok('换双手兵器：副手自动卸回行囊，装备数量守恒');
  else bad('双手换装异常：' + JSON.stringify([t2.step3, t2.step3return, t2.step3hasDual]));
  if (t2.step4) ok('双手在握时副手拒绝穿戴，并给出提示');
  else bad('双手未锁住副手');
  if (t2.lockedClass) ok('副手格渲染为锁定态（锁字 + 虚框）');
  else bad('副手格缺少锁定样式');
  if (t2.step5) ok('换回单手后副手可正常穿戴');
  else bad('换回单手后副手仍被锁');
  const f = t2.fits;
  if (f.oneToOff && f.dualToOff && f.twoToOff && f.shieldToWeapon && f.ringToRing2) ok('槽位规则正确：单手/双手进不了副手、副手装备进不了主手、双持可进副手');
  else bad('槽位规则异常：' + JSON.stringify(f));
  if (t2.step7pre && t2.step7) ok('主手卸下时副手那把双持兵器一并收回');
  else bad('卸主手未回收副手兵器：' + JSON.stringify([t2.step7pre, t2.step7]));
  if (t2.step8) ok('异常存档（双手 + 副手并存）由 repairHands 自动纠正');
  else bad('repairHands 未生效');
  if (t2.tipOne && t2.tipDual && t2.tipTwo && t2.tipTwoDesc) ok('提示框标注握持，双手明写「占用副手位」');
  else bad('提示框握持标签异常：' + JSON.stringify([t2.tipOne, t2.tipDual, t2.tipTwo, t2.tipTwoDesc]));

  /* ---------------- 收尾 ---------------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(66));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
