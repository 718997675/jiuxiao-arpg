/* ============================================================
 * 回归探针：主菜单页签（v1.6.0）
 * ------------------------------------------------------------
 * 一、结构：外壳只有一个，八个页签，HUD 只留两个按钮
 * 二、切换：任一时刻 #menuBody 里只有一页，其余在 #panelHome
 *     - 每页都能渲染出各自的关键内容（不是白板）
 *     - 切页不叠加、不残留 .embed
 *     - 关闭菜单后全部归位，仍能被独立打开
 * 三、快捷键：I/T/K/C/L/R/P/O 各自落到对应页；Tab 开合；Esc 关闭
 * 四、不冲突：商店 / 对话 / 图鉴等非菜单浮层照旧可开
 * 五、触屏：窄屏页签翻成横排，内容区可滚
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8901;
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

  console.log('\n  主菜单页签回归（v1.6.0）');
  console.log('  ' + '='.repeat(66));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=mage&diff=normal&name=%E8%8F%9C%E5%8D%95`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(4500);

  /* ---------------- 一、结构 ---------------- */
  console.log('\n  一、结构');
  const d1 = await page.evaluate(() => {
    const o = {};
    if (typeof Game === 'undefined' || !Game.state) { o.started = false; return o; }
    o.started = true;
    o.tabs = Array.from(document.querySelectorAll('#menuTabs .mtab')).map(b => b.dataset.mtab);
    o.tabNames = Array.from(document.querySelectorAll('#menuTabs .mtab')).map(b => b.childNodes[0].textContent.replace(/\s/g, ''));
    o.uiTabs = UI.MENU_TABS.map(t => t.id);
    o.sameOrder = JSON.stringify(o.tabs) === JSON.stringify(o.uiTabs);
    o.hudBtns = document.querySelectorAll('#openBtns .btn').length;
    o.hudTxt = Array.from(document.querySelectorAll('#openBtns .btn')).map(b => b.textContent.trim().split(' ')[0]);
    o.homeExists = !!document.getElementById('panelHome');
    o.menuClosed = !document.getElementById('menuPanel').classList.contains('open');
    o.panelsOutside = ['invPanel', 'statPanel', 'talentPanel', 'skillPanel', 'questPanel', 'codexPanel', 'forgePanel', 'savePanel', 'setPanel']
      .every(id => document.getElementById(id).parentElement.id !== 'menuBody');
    return o;
  });
  if (!d1.started) bad('开局失败');
  else {
    d1.tabs.length === 9 && d1.sameOrder ? ok('九个页签与 MENU_TABS 一一对应') : bad('页签不一致 ' + d1.tabs.join(','));
    d1.tabNames.join('') === '行囊道途天赋术法山海志异兽志炼器台存档设置' ? ok('页签文案正确') : bad('页签文案 ' + d1.tabNames.join(''));
    d1.hudBtns === 2 ? ok('HUD 入口收敛为 2 个按钮（' + d1.hudTxt.join(' / ') + '）') : bad('HUD 还有 ' + d1.hudBtns + ' 个按钮');
    d1.menuClosed && d1.homeExists && d1.panelsOutside ? ok('未开菜单时所有子面板都在原籍') : bad('子面板位置异常');
  }

  /* ---------------- 二、切换 ---------------- */
  console.log('\n  二、页签切换');
  const d2 = await page.evaluate(async () => {
    const o = {};
    const probe = {
      bag: () => document.querySelectorAll('#dollGrid .eslot').length + document.querySelectorAll('#invGrid .islot').length,
      stat: () => document.querySelectorAll('#statList .strow, #statList > div').length,
      talent: () => document.querySelectorAll('#tlTrees .tl-tab').length,
      skill: () => document.querySelectorAll('#skList .skcell, #skList > *').length,
      quest: () => document.querySelectorAll('#questList .qcard, #questList > *').length,
      codex: () => document.querySelectorAll('#codexGrid .cx').length,
      forge: () => document.querySelectorAll('#forgeList .fitem, #forgeMain .fempty').length,
      save: () => document.querySelectorAll('#slotList .scard').length,
      set: () => document.querySelectorAll('#setBody .setrow').length
    };
    const count = {};
    const inBody = {};
    const badEmbed = [];
    for (const id of UI.MENU_TABS.map(t => t.id)) {
      UI.openMenu(id);
      count[id] = probe[id]();
      const body = document.getElementById('menuBody');
      inBody[id] = body.children.length === 1 && body.firstElementChild.id ===
        UI.MENU_TABS.find(t => t.id === id).panel;
      /* 其它面板必须都回原籍，且没有残留 embed */
      document.querySelectorAll('.panel.embed').forEach(el => {
        if (el !== body.firstElementChild) badEmbed.push(el.id);
      });
    }
    o.count = count;
    o.inBody = inBody;
    o.badEmbed = badEmbed;
    o.menuTabAfter = UI.menuTab;

    /* 关闭：全部归位、状态清干净 */
    UI.closeMenu();
    o.closed = !document.getElementById('menuPanel').classList.contains('open');
    o.embedLeft = document.querySelectorAll('.panel.embed').length;
    o.homeN = document.getElementById('panelHome').children.length;
    o.bodyN = document.getElementById('menuBody').children.length;

    /* 独立浮层仍能打开（商店 / 对话不经过菜单） */
    UI.toggleInv();
    o.reopen = document.getElementById('menuPanel').classList.contains('open') &&
      document.getElementById('invPanel').parentElement.id === 'menuBody';
    UI.closeMenu();

    /* 天赋画布首帧必须有像素在画：
     * v1.6.0 曾先 drawTalentCanvas 再 bindTalentCanvas，后者设 width 把位图清空，进页一片空白。 */
    UI.openMenu('talent');
    const cv = document.getElementById('tlCanvas');
    if (cv) {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 8) n++;
      o.tlAlpha = n;
      o.tlSize = [cv.width, cv.height];
    } else o.tlAlpha = -1;
    UI.closeMenu();
    return o;
  });
  const need = { bag: 12, stat: 1, talent: 3, skill: 1, quest: 1, forge: 1, save: 1, set: 6 };
  let allRender = true, badPage = '';
  for (const k in need) {
    if (!d2.count[k] || d2.count[k] < need[k]) { allRender = false; badPage += k + '(' + d2.count[k] + ') '; }
  }
  allRender ? ok('八页都能渲染出各自内容') : bad('空白页：' + badPage);
  Object.keys(d2.inBody).every(k => d2.inBody[k]) ? ok('任一时刻 #menuBody 只挂一页') : bad('有多页叠加');
  d2.badEmbed.length === 0 ? ok('切页后无 .embed 残留') : bad('残留 embed: ' + d2.badEmbed.join(','));
  d2.closed && d2.embedLeft === 0 && d2.bodyN === 0 ? ok('关闭菜单后子面板全部归位') : bad('关闭后仍残留');
  d2.homeN === 9 ? ok('原籍收纳 9 个面板') : bad('原籍数量 ' + d2.homeN);
  d2.reopen ? ok('toggleInv 仍能重新打开行囊页') : bad('toggleInv 失效');
  d2.tlAlpha > 500 ? ok('天赋画布首帧就有内容（非空白，' + d2.tlAlpha + ' 采样点）')
    : bad('天赋画布空白（采样点 ' + d2.tlAlpha + '）');
  d2.tlSize && d2.tlSize[0] >= 660 ? ok('天赋画布位图按 dpr 放大（' + d2.tlSize.join('×') + '）')
    : bad('画布位图异常 ' + (d2.tlSize || []).join('×'));

  /* ---------------- 三、快捷键 ---------------- */
  console.log('\n  三、快捷键');
  const keyMap = [
    ['i', 'bag'], ['c', 'stat'], ['t', 'talent'], ['k', 'skill'],
    ['l', 'quest'], ['r', 'forge'], ['p', 'save'], ['o', 'set']
  ];
  for (const [key, tab] of keyMap) {
    await page.evaluate(() => UI.closeMenu());
    await page.keyboard.press(key === 'escape' ? 'Escape' : key.toUpperCase());
    await sleep(120);
    const got = await page.evaluate(() => ({
      menu: document.getElementById('menuPanel').classList.contains('open'),
      tab: UI.menuTab
    }));
    got.menu && got.tab === tab ? ok(`快捷键 ${key.toUpperCase()} → ${tab} 页`) : bad(`快捷键 ${key.toUpperCase()} 落到 ${got.tab}（menu=${got.menu}）`);
  }
  /* Tab 开合 / Esc 关闭 */
  await page.evaluate(() => UI.closeMenu());
  await sleep(100);
  await page.keyboard.press('Tab');
  await sleep(150);
  const tabOpen = await page.evaluate(() => document.getElementById('menuPanel').classList.contains('open'));
  await page.keyboard.press('Tab');
  await sleep(150);
  const tabClosed = await page.evaluate(() => !document.getElementById('menuPanel').classList.contains('open'));
  tabOpen && tabClosed ? ok('Tab 键开合菜单') : bad('Tab 键异常');
  await page.keyboard.press('i');
  await sleep(120);
  await page.keyboard.press('Escape');
  await sleep(150);
  const escClosed = await page.evaluate(() => !document.getElementById('menuPanel').classList.contains('open') &&
    document.querySelectorAll('.panel.open').length === 0);
  escClosed ? ok('Esc 关闭菜单且不留浮层') : bad('Esc 未关干净');

  /* ---------------- 四、不冲突 ---------------- */
  console.log('\n  四、与既有浮层共存');
  const d4 = await page.evaluate(() => {
    const o = {};
    /* 商店 / 图鉴直接开：菜单应当自动让位（closeAll 关掉菜单外壳） */
    UI.openMenu('bag');
    const npc = document.getElementById('shopPanel');
    UI.closeAll(npc);
    npc.classList.add('open');
    o.menuClosedByShop = !document.getElementById('menuPanel').classList.contains('open');
    o.invBackHome = document.getElementById('invPanel').parentElement.id === 'panelHome';
    UI.closeAll();

    /* 图鉴（独立面板，不进菜单） */
    UI.openSetCodex();
    o.codexOpen = document.getElementById('setCodexPanel').classList.contains('open');
    UI.closeAll();
    o.codexClosed = !document.getElementById('setCodexPanel').classList.contains('open');

    /* 再次打开菜单，行囊两列布局仍在（embed 不该把左列挤掉） */
    UI.openMenu('bag');
    const doll = document.querySelector('#menuBody .doll');
    const main = document.querySelector('#menuBody .inv-main');
    o.hasDoll = !!doll && doll.getBoundingClientRect().width > 200;
    o.hasMain = !!main && main.getBoundingClientRect().width > 300;
    const grid = document.querySelector('#menuBody #invGrid');
    o.gridH = grid ? grid.getBoundingClientRect().height > 60 : false;
    o.statsH = document.querySelector('#invStats').getBoundingClientRect().height > 30;
    return o;
  });
  d4.menuClosedByShop && d4.invBackHome ? ok('商店打开时菜单让位、子面板归位') : bad('商店与菜单冲突');
  d4.codexOpen && d4.codexClosed ? ok('套装图鉴仍是独立浮层') : bad('图鉴异常');
  d4.hasDoll && d4.hasMain ? ok('嵌入后行囊仍是「左装备栏 / 右行囊」两列') : bad('嵌入后布局塌了');
  d4.gridH && d4.statsH ? ok('嵌入后格子区与属性区都有高度') : bad('嵌入后高度塌了');

  /* ---------------- 五、触屏 ---------------- */
  console.log('\n  五、触屏');
  await page.evaluate(() => document.body.classList.add('touch'));
  await page.setViewport({ width: 414, height: 820, isMobile: true, hasTouch: true });
  /* 改 isMobile / hasTouch 会让 Puppeteer 重新加载页面 —— 等它开局完再操作 */
  await sleep(3800);
  await page.evaluate(() => document.body.classList.add('touch'));
  await page.evaluate(() => UI.openMenu('bag'));
  await sleep(400);
  const d5 = await page.evaluate(() => {
    const o = {};
    o.isTouch = typeof IS_TOUCH !== 'undefined' && IS_TOUCH === true;
    const tabs = document.querySelector('.menu-tabs');
    const cs = getComputedStyle(tabs);
    o.row = cs.flexDirection === 'row';
    o.overflowX = cs.overflowX;
    const mp = document.getElementById('menuPanel').getBoundingClientRect();
    o.fitsW = mp.width <= 414 + 1;
    o.fitsH = mp.height <= 820 + 1;
    const body = document.getElementById('menuBody');
    o.bodyVisible = body.getBoundingClientRect().height > 200;
    /* 触屏没有悬停：点材料格应直接弹提示 */
    UI.invTab = 'mat';
    UI.renderInventory();
    o.gridCols = getComputedStyle(document.querySelector('#invMats .mgrid')).gridTemplateColumns.split(' ').length;
    const cell = document.querySelector('#invMats .mgcell[data-mti]');
    if (cell) cell.click();
    const tip = document.getElementById('tooltip');
    o.tapTip = !!tip && tip.style.display === 'block' && tip.innerHTML.length > 40;
    return o;
  });
  d5.isTouch ? ok('触屏模拟生效（IS_TOUCH = true）') : bad('IS_TOUCH 未生效');
  d5.row ? ok('窄屏页签翻成横排') : bad('页签仍竖排');
  d5.overflowX === 'auto' || d5.overflowX === 'scroll' ? ok('页签可横向滚动') : bad('页签不可滚 ' + d5.overflowX);
  d5.fitsW && d5.fitsH ? ok('菜单不超出视口') : bad('菜单超界');
  d5.bodyVisible ? ok('触屏内容区有可用高度') : bad('触屏内容区被压扁');
  d5.tapTip ? ok('触屏点材料格即弹提示（无需悬停）') : bad('触屏点击无提示');
  d5.gridCols === 6 ? ok('触屏材料格 6 列（格子更大）') : bad('触屏材料列数 ' + d5.gridCols);

  if (errors.length) { console.log('\n  页面错误：'); errors.slice(0, 8).forEach(e => console.log('   · ' + e)); }
  const pass = results.filter(x => x).length, all = results.length;
  console.log('\n  ' + '='.repeat(66));
  console.log(`  结果：${pass} / ${all} 通过` + (errors.length ? `，页面错误 ${errors.length} 条` : '，无页面错误'));
  await browser.close();
  server.close();
  process.exit(pass === all && !errors.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
