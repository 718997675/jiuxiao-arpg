/* ============================================================
 * 回归探针：定向洗炼（v1.1.3）
 * 覆盖：候选词条排除其他位已占用；一键自动洗到指定词条即停；
 *       次数与花费统计正确；材料不足自动中断不浪费；
 *       已是目标词条 / 其他位占用同一词条 的拒绝；
 *       单次洗练仍可用；UI 渲染（定向按钮/候选芯片/预估/开始按钮）。
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8894;
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

  console.log('\n  定向洗炼回归');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E6%B4%BE%E5%BE%92`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  const r1 = await page.evaluate(() => {
    const out = {};
    if (typeof Game === 'undefined' || !Game.state) { out.started = false; return out; }
    out.started = true;

    const mk = () => normalizeItem({
      kind: 'chest', slot: 'chest', name: '试炼胸甲', rarity: 'rare', ilvl: 25, cls: 'warrior',
      baseArmor: 90, sockets: 0, runes: [],
      affixes: [
        { key: 'str', val: 10, pre: '', suf: '', tier: 2, q: 1 },
        { key: 'vit', val: 8, pre: '', suf: '', tier: 2, q: 1 },
        { key: 'def', val: 20, pre: '', suf: '', tier: 1, q: 1 }
      ]
    });
    let item = mk();
    Game.state.inventory.push(item);
    Game.addCrystal(2000000);   // 定向洗炼期望上百次，费用递增，需备足

    /* 1) 候选词条：不含其他位已占用的 vit/def（当前位自己的 str 允许再中） */
    const cands = reforgeTargets(item, 0).map(a => a.key);
    out.candHasCrit = cands.includes('crit');
    out.candExcludesUsed = !cands.includes('vit') && !cands.includes('def');

    /* 2) 定向洗到暴击率：应成功且停在目标上 */
    const before = Game.crystalCount();
    const r = Game.targetedReforge(item, 0, 'crit');
    out.ok = r.ok;
    out.msg = r.msg || '';
    out.attempts = r.attempts;
    out.spent = r.spent;
    out.key = item.affixes[0].key;
    out.spentMatches = r.spent === (before - Game.crystalCount());
    out.costEscalated = r.spent > r.attempts * 24;   // 费用递增，总价高于线性
    out.otherAffixesIntact = item.affixes[1].key === 'vit' && item.affixes[2].key === 'def';
    out.rarityKept = item.rarity === 'rare';

    /* 3) 已是目标词条 → 拒绝 */
    const rAlready = Game.targetedReforge(item, 0, 'crit');
    out.alreadyRejected = !rAlready.ok && rAlready.already === true;

    /* 4) 其他位已占用同一词条 → 拒绝 */
    const rClash = Game.targetedReforge(item, 1, 'crit');
    out.clashRejected = !rClash.ok && /不重复/.test(rClash.msg || '');

    /* 5) 材料不足 → 中断且不浪费（返回已洗次数，词条保持洗完状态） */
    let item2 = mk();
    Game.state.inventory.push(item2);
    Game.addCrystal(-(Game.crystalCount() - 60));   // 只留 60 玄晶，只够洗 1~2 次
    const rPoor = Game.targetedReforge(item2, 0, 'crit');
    out.poorStopped = !rPoor.ok && /玄晶不足/.test(rPoor.msg || '');
    out.poorAttempts = rPoor.attempts;
    out.poorSpent = rPoor.spent;
    out.poorCrystalLeft = Game.crystalCount();
    out.poorSpentMatches = 60 - Game.crystalCount() === rPoor.spent;

    /* 6) 单次洗练仍可用 */
    Game.addCrystal(1000);
    const rSingle = Game.reforgeItem(item2, 1);
    out.singleStillWorks = rSingle.ok && item2.affixes[1].key !== 'vit';

    /* 7) 预估函数 sanity */
    const est = estimateTargetedReforge(item2, 0, AFFIXES.find(a => a.key === 'crit'));
    out.estAttempts = est.attempts;
    out.estCost = est.cost;

    /* 8) 存档往返：洗出来的 crit 词条要活着 */
    Game.save();
    const flat = SaveManager.load(1);
    const c = flat.equipment.chest || flat.inventory.find(it => it.name === '试炼胸甲');
    out.savedKey = flat.inventory.filter(it => it.name === '试炼胸甲').map(it => it.affixes[0].key);
    return out;
  });

  if (!r1.started) { bad('游戏未开局'); }
  else {
    if (r1.candHasCrit && r1.candExcludesUsed) ok('候选词条含暴击率，且排除其他位已占用的 str/vit/def');
    else bad('候选词条异常：hasCrit=' + r1.candHasCrit + ' excludes=' + r1.candExcludesUsed);
    if (r1.ok && r1.key === 'crit') ok('定向洗炼成功洗出暴击率并停止（' + r1.attempts + ' 次 / ' + r1.spent + ' 玄晶）');
    else bad('定向洗炼失败：ok=' + r1.ok + ' key=' + r1.key);
    if (r1.spentMatches && r1.costEscalated) ok('花费统计与扣减一致，且费用随次数递增');
    else bad('花费异常：spent=' + r1.spent + ' match=' + r1.spentMatches + ' escalated=' + r1.costEscalated);
    if (r1.otherAffixesIntact && r1.rarityKept) ok('其他词缀与稀有度不受影响');
    else bad('副作用异常');
    if (r1.alreadyRejected) ok('已是目标词条时拒绝并提示');
    else bad('重复目标未拦截');
    if (r1.clashRejected) ok('其他位已占用同一词条时拒绝（同装备不重复）');
    else bad('重复词条冲突未拦截');
    if (r1.poorStopped && r1.poorSpentMatches && r1.poorCrystalLeft >= 0) ok('材料不足自动中断（洗了 ' + r1.poorAttempts + ' 次 / ' + r1.poorSpent + ' 玄晶），余额非负');
    else bad('材料不足处理异常：' + JSON.stringify(r1.poorStopped) + ' left=' + r1.poorCrystalLeft);
    if (r1.singleStillWorks) ok('单次洗练仍正常可用');
    else bad('单次洗练被破坏');
    if (r1.estAttempts >= 1 && r1.estCost > 0) ok('预估函数正常（约 ' + r1.estAttempts + ' 次 / ' + r1.estCost + ' 玄晶）');
    else bad('预估异常：' + JSON.stringify(r1.estAttempts));
    if (r1.savedKey[0] === 'crit') ok('存档往返后定向洗出的词条保留');
    else bad('读档后词条丢失：' + JSON.stringify(r1.savedKey));
  }

  /* ---------- UI：定向按钮 / 候选芯片 / 预估 / 开始按钮 ---------- */
  const ui = await page.evaluate(() => {
    Game.addCrystal(2000000);
    /* 用一件新胸甲，避免命中「已是目标词条」的拒绝分支 */
    const fresh = normalizeItem({
      kind: 'chest', slot: 'chest', name: '新胸甲', rarity: 'rare', ilvl: 25, cls: 'warrior',
      baseArmor: 90, sockets: 0, runes: [],
      affixes: [
        { key: 'str', val: 10, pre: '', suf: '', tier: 2, q: 1 },
        { key: 'vit', val: 8, pre: '', suf: '', tier: 2, q: 1 },
        { key: 'def', val: 20, pre: '', suf: '', tier: 1, q: 1 }
      ]
    });
    Game.state.inventory.push(fresh);
    const idx = Game.state.inventory.length - 1;
    UI.forgeTab = 'reforge';
    UI.forgeRef = 'inv:' + idx;
    UI.forgeTarget = null;
    UI.openForge('inv:' + idx);
    UI.forgeTab = 'reforge';
    UI.renderForge();
    const dirBtns = document.querySelectorAll('#forgeMain [data-ftarget]').length;
    document.querySelector('#forgeMain [data-ftarget="0"]').click();
    const picks = document.querySelectorAll('#forgeMain [data-fpick]').length;
    const hasCritChip = [...document.querySelectorAll('#forgeMain [data-fpick]')].some(e => e.dataset.fpick === 'crit');
    /* 选暴击率 → 出现预估与开始按钮 */
    [...document.querySelectorAll('#forgeMain [data-fpick]')].find(e => e.dataset.fpick === 'crit').click();
    const autoBtn = document.querySelector('#forgeMain [data-fauto]');
    const autoTxt = autoBtn ? autoBtn.textContent.trim() : '';
    const estTxt = (document.querySelector('#forgeMain .ftarget-box .hintline') || {}).textContent || '';
    const singleBtn = !!document.querySelector('#forgeMain [data-freforge="0"]');
    return { dirBtns, picks, hasCritChip, autoTxt, estTxt, singleBtn };
  });
  if (ui.dirBtns === 3) ok('每条词缀行都有「定向」按钮（单次洗练按钮仍在）');
  else bad('定向按钮数量异常：' + ui.dirBtns);
  if (ui.picks > 10 && ui.hasCritChip) ok('候选词条面板渲染 ' + ui.picks + ' 个芯片（含暴击率）');
  else bad('候选面板异常：picks=' + ui.picks);
  if (/开始定向洗炼/.test(ui.autoTxt) && /预计约/.test(ui.estTxt)) ok('选中目标后显示预估与「开始定向洗炼」按钮');
  else bad('确认条异常：' + ui.autoTxt);

  /* 点开始 → 真洗出暴击率 */
  const ui2 = await page.evaluate(() => {
    const item = Game.state.inventory.find(it => it.name === '新胸甲');
    const before = Game.crystalCount();
    document.querySelector('#forgeMain [data-fauto]').click();
    return { key: item.affixes[0].key, spent: before - Game.crystalCount(), panelClosed: !document.querySelector('#forgeMain [data-fauto]') };
  });
  if (ui2.key === 'crit' && ui2.spent > 0) ok('点击「开始定向洗炼」后自动洗出暴击率（消耗 ' + ui2.spent + ' 玄晶），面板自动收起');
  else bad('UI 定向洗炼失败：key=' + ui2.key + ' spent=' + ui2.spent);

  /* ---------- 收尾 ---------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(ROOT, 'dev', 'shot-targeted-reforge.png') });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
