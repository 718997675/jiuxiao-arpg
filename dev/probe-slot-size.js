/* ============================================================
 * 回归探针：装备格子差异化（v1.2.3）
 * ------------------------------------------------------------
 * 目标：背包 / 纸娃娃的格子尺寸跟随部位，护甲·兵器最大、饰品最小。
 * 检查三层：
 *   1. 数据层 SLOT_SIZE 覆盖全部槽位、档位取值合法、兜底正确
 *   2. 渲染层 DOM 带 data-size/data-slot，纸娃娃落位互不重叠
 *   3. 实测层 getBoundingClientRect 面积严格单调递减（xl > lg > md > sm）
 * 最后截一张装了混合部位的背包图，肉眼复核。
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8896;
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

  console.log('\n  装备格子差异化回归（v1.2.3）');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E6%A0%BC%E5%AD%90`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  /* ---------------- 1. 数据层 ---------------- */
  const d = await page.evaluate(() => {
    const out = {};
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;
    out.slotCount = SLOT_ORDER.length;
    out.covered = SLOT_ORDER.every(k => !!SLOT_SIZE[k]);
    out.missing = SLOT_ORDER.filter(k => !SLOT_SIZE[k]);
    out.legal = Object.keys(SLOT_SIZE).every(k => SLOT_SIZE_ORDER.includes(SLOT_SIZE[k]));
    out.xl = Object.keys(SLOT_SIZE).filter(k => SLOT_SIZE[k] === 'xl').sort();
    out.sm = Object.keys(SLOT_SIZE).filter(k => SLOT_SIZE[k] === 'sm').sort();
    out.fallback = slotSize('not-a-slot');
    out.ringSame = slotSize('ring') === slotSize('ring1') && slotSize('ring') === slotSize('ring2');
    out.relicSize = slotSize('relic');
    out.hasRelic = SLOT_ORDER.indexOf('relic') >= 0 && !!SLOTS.relic;
    out.order = SLOT_SIZE_ORDER.slice();
    return out;
  });

  if (!d.started) { bad('游戏未开局'); }
  else {
    if (d.covered) ok(`SLOT_SIZE 覆盖全部 ${d.slotCount} 个槽位`);
    else bad('槽位缺口：' + d.missing.join(','));
    if (d.legal) ok('档位取值全部落在 SLOT_SIZE_ORDER（sm/md/lg/xl）内');
    else bad('档位取值越界');
    if (JSON.stringify(d.xl) === JSON.stringify(['chest', 'weapon'])) ok('特大档 = 战甲 + 兵器（体量最大的两件）');
    else bad('特大档异常：' + JSON.stringify(d.xl));
    if (JSON.stringify(d.sm) === JSON.stringify(['amulet', 'ring', 'ring1', 'ring2'])) ok('小档 = 项链 + 戒指（3 槽位共 4 个格子）');
    else bad('小档异常：' + JSON.stringify(d.sm));
    if (d.fallback === 'md') ok('未知部位兜底为中档');
    else bad('兜底异常：' + d.fallback);
    if (d.ringSame) ok('ring / ring1 / ring2 同档，两只戒指尺寸一致');
    else bad('戒指档位不一致');
    if (d.hasRelic && d.relicSize === 'lg') ok('法器槽入列且为大档（右上角横条格）');
    else bad('法器槽异常：' + JSON.stringify({ hasRelic: d.hasRelic, size: d.relicSize }));
  }

  /* ---------------- 2. 渲染层 + 3. 实测层 ---------------- */
  const r = await page.evaluate(() => {
    const out = {};
    const mk = (slot, name, rarity, ilvl) => normalizeItem({
      kind: slot, slot, name, rarity: rarity || 'rare', ilvl: ilvl || 26,
      cls: 'warrior', baseArmor: 60, sockets: 0, runes: [], affixes: []
    });
    /* 纸娃娃摆满 12 格，行囊塞一套混合部位 + 1 件无部位材料 */
    const eq = Game.state.equipment;
    const slots = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];
    for (const s of slots) eq[s] = mk(s, '试穿' + (SLOT_NAME[s] || s), 'rare', 26);
    eq.relic = makeRelic('w1', 'warrior');
    const bagSlots = ['chest', 'weapon', 'helm', 'gloves', 'boots', 'amulet', 'ring', 'ring'];
    Game.state.inventory = bagSlots.map((s, i) => mk(s, '行囊' + (SLOT_NAME[s] || s) + (i + 1), ['common', 'magic', 'rare', 'set', 'legendary', 'unique'][i % 6], 24 + i));
    Game.state.inventory.push(normalizeItem({ kind: 'mat', name: '妖丹', rarity: 'common', ilvl: 1, affixes: [] }));

    UI.closeAll();
    document.getElementById('invPanel').classList.add('open');
    UI.renderInventory();

    /* --- 纸娃娃 --- */
    const es = [...document.querySelectorAll('#dollGrid .eslot')];
    out.esCount = es.length;
    out.esAllSized = es.every(e => e.dataset.size && e.dataset.slot);
    out.esSizes = {};
    const rect = e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), area: Math.round(b.width * b.height), l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    for (const e of es) out.esSizes[e.dataset.slot] = rect(e);
    /* 落位是否互不重叠（格子是网格区域内的居中盒子，区域本身不相交） */
    let overlap = 0;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = out.esSizes[es[i].dataset.slot], b2 = out.esSizes[es[j].dataset.slot];
        if (a.l < b2.r - 1 && b2.l < a.r - 1 && a.t < b2.b - 1 && b2.t < a.b - 1) overlap++;
      }
    }
    out.overlap = overlap;
    /* 身体朝向布局（v1.3.0）：头中上、肩左上、法器右上、靴在下、兵器副手底部左右各一条长格 */
    const mid = b => (b.l + b.r) / 2;
    const S = out.esSizes;
    out.layout = {
      helmTopCenter: S.helm.t <= S.shoulders.t && Math.abs(mid(S.helm) - mid(S.chest)) <= 12,
      shoulderLeft: S.shoulders.r <= S.chest.l + 2,
      relicRight: S.relic.l >= S.chest.r - 2,
      shoulderRelicAligned: Math.abs(S.relic.t - S.shoulders.t) <= 16,
      chestTall: S.chest.h > S.helm.h * 1.5,
      bootsBelowWaist: S.boots.t >= S.ring1.t && S.boots.t >= S.belt.t - 2,
      weaponBottomBar: S.weapon.t >= S.boots.b - 4 && S.weapon.w > S.chest.w * 1.35,
      weaponLeftOfOffhand: S.weapon.r <= S.offhand.l + 2,
      weaponOffhandRow: Math.abs(S.weapon.t - S.offhand.t) <= 4
    };
    /* 尺寸单调：战甲/兵器 > 头盔(大) > 护手(中) > 项链/戒指(小) */
    out.mono = {
      xlVlg: out.esSizes.chest.area > out.esSizes.helm.area,
      lgVmd: out.esSizes.helm.area > out.esSizes.gloves.area,
      mdVsm: out.esSizes.gloves.area > out.esSizes.ring1.area,
      chestTall: out.esSizes.chest.h > out.esSizes.helm.h * 1.5,
      ringSquare: Math.abs(out.esSizes.ring1.w - out.esSizes.ring1.h) <= 16,
      ringsEqual: out.esSizes.ring1.w === out.esSizes.ring2.w && out.esSizes.ring1.h === out.esSizes.ring2.h,
      dualEqual: Math.abs(out.esSizes.weapon.area - out.esSizes.offhand.area) <= out.esSizes.weapon.area * 0.12,
      relicDistinct: out.esSizes.relic.area > out.esSizes.helm.area &&
                     out.esSizes.relic.area < out.esSizes.chest.area
    };

    /* --- 行囊 --- */
    const is = [...document.querySelectorAll('#invGrid .islot')];
    out.isCount = is.length;
    const byIdx = {};
    is.forEach((e, i) => { if (e.dataset.ref) byIdx[i] = rect(e); });
    out.isSizes = byIdx;
    /* 行囊前 8 格：chest/weapon/helm/gloves/boots/amulet/ring/ring */
    const area = i => byIdx[i].area;
    out.bagMono = {
      xlBiggest: area(0) > area(2) && area(1) > area(2),
      lgVmd: area(2) > area(3),
      mdVsm: area(3) > area(5),
      ringSmallest: area(7) < area(0) && area(7) < area(3),
      smEqual: area(5) === area(7),          // 项链与戒指同档，应等大
      noSlotFull: area(8) > 0 && area(8) >= area(0)
    };
    out.bagWidths = [0, 1, 2, 3, 5, 7].map(i => byIdx[i].w);
    out.bagTxt = (document.getElementById('invTip').textContent || '').trim();
    return out;
  });

  if (r.esCount === 12) ok('纸娃娃渲染 12 个装备格（含法器）');
  else bad('装备格数量异常：' + r.esCount);
  if (r.esAllSized) ok('每个装备格都带 data-slot + data-size');
  else bad('装备格缺少部位/档位标记');
  if (r.overlap === 0) ok('纸娃娃新布局互不重叠（网格区域一一对应）');
  else bad('装备格重叠：' + r.overlap + ' 对');
  const m = r.mono;
  if (m.xlVlg && m.lgVmd && m.mdVsm) ok('纸娃娃面积严格递减：战甲 > 头盔 > 护手 > 戒指');
  else bad('纸娃娃尺寸未分层：' + JSON.stringify(m));
  if (m.chestTall) ok('战甲格高度超过头盔 1.5 倍（占两行，体量感明确）');
  else bad('战甲未占据两行高度：' + JSON.stringify(r.esSizes.chest) + ' vs helm ' + JSON.stringify(r.esSizes.helm));
  if (m.dualEqual) ok('兵器与副手同尺寸，底部左右对称');
  else bad('兵器/副手尺寸不一致：' + JSON.stringify([r.esSizes.weapon, r.esSizes.offhand]));
  if (m.relicDistinct) ok('法器格尺寸介于头盔与战甲之间（专属一档）');
  else bad('法器格尺寸异常：' + JSON.stringify([r.esSizes.relic, r.esSizes.helm, r.esSizes.chest]));
  if (m.ringSquare && m.ringsEqual) ok('两枚戒指尺寸一致且接近方形');
  else bad('戒指格异常：' + JSON.stringify([r.esSizes.ring1, r.esSizes.ring2]));

  const ly = r.layout;
  if (ly.helmTopCenter) ok('头盔格在中轴最上方');
  else bad('头盔未居中最上：' + JSON.stringify([r.esSizes.helm, r.esSizes.shoulders]));
  if (ly.shoulderLeft && ly.relicRight && ly.shoulderRelicAligned) ok('护肩在左上、法器在右上，左右平齐');
  else bad('左右肩位异常：' + JSON.stringify(ly));
  if (ly.chestTall) ok('战甲居中占据上下两行（躯干）');
  else bad('战甲未占躯干位');
  if (ly.bootsBelowWaist) ok('战靴落在腰带 / 戒指之下（下半身）');
  else bad('战靴位置异常：' + JSON.stringify(r.esSizes.boots));
  if (ly.weaponBottomBar) ok('兵器是底部横跨三列的长格（宽 > 战甲 1.35 倍）');
  else bad('兵器长格异常：' + JSON.stringify(r.esSizes.weapon) + ' vs chest ' + JSON.stringify(r.esSizes.chest));
  if (ly.weaponLeftOfOffhand && ly.weaponOffhandRow) ok('主武器在左、副武器在右，同一行');
  else bad('主副武器未左右并排：' + JSON.stringify([r.esSizes.weapon, r.esSizes.offhand]));

  const b = r.bagMono;
  if (b.xlBiggest && b.lgVmd && b.mdVsm && b.ringSmallest) ok('行囊面积递减：战甲/兵器 > 头盔 > 护手 > 戒指');
  else bad('行囊尺寸未分层：' + JSON.stringify(b) + ' widths=' + JSON.stringify(r.bagWidths));
  if (b.smEqual) ok('行囊里项链与戒指同档等大（同属小档）');
  else bad('项链/戒指尺寸不一致');
  if (b.noSlotFull) ok('无部位物品（材料）仍占满整格，不被误判成小格');
  else bad('材料格尺寸异常');
  if (/格子大小随部位/.test(r.bagTxt)) ok('行囊提示条说明格子随部位变化');
  else bad('提示条未说明：' + r.bagTxt);

  /* ---------------- 4. 静态扫样式，防止回归成统一尺寸 ---------------- */
  const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const blocks = css.match(/\.eslot\{[^}]*\}/g) || [];
  const flatHeight = blocks.some(s => /height:\s*62px/.test(s));
  if (!flatHeight) ok('.eslot 基础规则不再写死统一高度（62px 已移除）');
  else bad('.eslot 仍写死 62px 统一高度');
  const tierRules = ['xl', 'lg', 'md', 'sm'].filter(t => new RegExp(`\\.eslot\\[data-size="${t}"\\]`).test(css) &&
                                            new RegExp(`\\.islot\\[data-size="${t}"\\]`).test(css));
  if (tierRules.length === 3) ok('eslot/islot 各有 lg·md·sm 三档独立规则（xl 即整格，无需另写）');
  else bad('档位规则缺失：' + tierRules.join(','));
  const areaBlock = (css.match(/grid-template-areas:([\s\S]*?);/) || [])[1] || '';
  const need = ['helm', 'chest', 'shoulders', 'amulet', 'gloves', 'ring1', 'weapon', 'belt', 'ring2', 'boots', 'offhand', 'relic'];
  const lack = need.filter(k => !new RegExp(`\\b${k}\\b`).test(areaBlock));
  if (!lack.length) ok('grid-template-areas 覆盖全部 12 个槽位');
  else bad('布局区域缺槽位：' + lack.join(','));

  /* 每个槽位都要有 grid-area 绑定，否则会退化成自动落位、错位 */
  const slotNames = ['helm', 'chest', 'shoulders', 'amulet', 'gloves', 'ring1', 'weapon', 'belt', 'ring2', 'boots', 'offhand', 'relic'];
  const bound = slotNames.filter(k => !new RegExp(`\\.eslot\\[data-slot="${k}"\\]\\{grid-area:`).test(css));
  if (!bound.length) ok('12 个槽位都绑定了 grid-area（不依赖 DOM 顺序落位）');
  else bad('槽位未绑定落位：' + bound.join(','));
  /* 触屏三列版也要有自己的 areas，否则 6 列模板塞进 3 列会错位 */
  const touchAreas = (css.match(/body\.touch \.doll-grid\{[^}]*grid-template-areas:([\s\S]*?)\}/) || [])[1] || '';
  const touchLack = need.filter(k => !new RegExp(`\\b${k}\\b`).test(touchAreas));
  if (!touchLack.length) ok('触屏三列版也单独声明了 areas（12 槽全覆盖）');
  else bad('触屏布局缺槽位：' + touchLack.join(','));

  /* ---------------- 收尾 ---------------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'shots', 'slot-size.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
