/* ============================================================
 * 回归探针：法器系统（v1.3.0）
 * ------------------------------------------------------------
 * 法器是第 12 个装备位（纸娃娃右上角），三职业各 10 件共 30 件。
 * 检查五层：
 *   一、数据层  30 件 / 每职业 10 件 / 介绍与历史齐全 / 术法指向合法
 *   二、生成层  makeRelic 字段完整、不吃词条、掉落只出本职业
 *   三、装备层  槽位规则、属性生效、附带术法放行与卸下即失效
 *   四、界面层  纸娃娃法器格、汉字字形图标、提示框三段（介绍 / 修正 / 附带）
 *   五、存档层  pack → unpack 往返不丢法器
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8898;
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

  console.log('\n  法器系统回归（v1.3.0）');
  console.log('  ' + '='.repeat(64));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?cls=warrior&diff=normal&name=%E6%B3%95%E5%99%A8`,
    { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));

  /* ---------------- 一、数据层 ---------------- */
  const d = await page.evaluate(() => {
    const out = { started: !!(typeof Game !== 'undefined' && Game.state) };
    if (!out.started) return out;
    const ids = Object.keys(RELICS);
    out.total = ids.length;
    out.idMatch = ids.filter(k => RELICS[k].id !== k);
    out.byCls = { warrior: 0, mage: 0, taoist: 0 };
    for (const id of ids) out.byCls[RELICS[id].cls] = (out.byCls[RELICS[id].cls] || 0) + 1;
    out.nameDup = ids.length - new Set(ids.map(i => RELICS[i].name)).size;
    out.glyphMiss = ids.filter(i => !RELICS[i].glyph || RELICS[i].glyph.length !== 1);
    /* 介绍 / 历史 */
    out.introShort = ids.filter(i => !RELICS[i].intro || RELICS[i].intro.length < 8);
    out.loreShort = ids.filter(i => !RELICS[i].lore || RELICS[i].lore.length < 30);
    out.introDup = ids.length - new Set(ids.map(i => RELICS[i].intro)).size;
    out.loreDup = ids.length - new Set(ids.map(i => RELICS[i].lore)).size;
    /* 等级曲线 */
    out.ilvlBad = ids.filter(i => !(RELICS[i].ilvl >= 1 && RELICS[i].ilvl <= 40));
    const byClsIlvl = {};
    for (const id of ids) (byClsIlvl[RELICS[id].cls] = byClsIlvl[RELICS[id].cls] || []).push(RELICS[id].ilvl);
    out.ilvlOrdered = Object.keys(byClsIlvl).every(c => {
      const a = byClsIlvl[c].slice().sort((x, y) => x - y);
      return new Set(a).size === a.length;
    });
    /* 属性 */
    out.statBadKey = [], out.statBadVal = [];
    for (const id of ids) {
      const st = RELICS[id].stats || {};
      if (!Object.keys(st).length) out.statBadKey.push(id + ':空');
      for (const k in st) {
        if (!STATS[k]) out.statBadKey.push(id + ':' + k);
        if (!(st[k] > 0)) out.statBadVal.push(id + ':' + k);
      }
    }
    /* 术法指向 */
    const MOD_KEYS = ['dmg', 'cd', 'cost', 'radius', 'count', 'dur'];
    out.skillMiss = [], out.skillCls = [], out.modBad = [], out.grantBad = [];
    out.skillCount = 0;
    const covered = new Set();
    for (const id of ids) {
      const r = RELICS[id];
      if (!r.skill || !r.skill.id) { out.skillMiss.push(id + ':无'); continue; }
      const sk = SKILLS[r.skill.id];
      if (!sk) { out.skillMiss.push(id + ':' + r.skill.id); continue; }
      covered.add(r.skill.id);
      if (sk.cls !== r.cls) out.skillCls.push(id + '→' + r.skill.id);
      for (const k in r.skill) {
        if (k === 'id') continue;
        if (MOD_KEYS.indexOf(k) < 0) out.modBad.push(id + ':' + k);
        if (typeof r.skill[k] !== 'number' || r.skill[k] === 0) out.modBad.push(id + ':值异常=' + k);
      }
      if (r.grant) {
        const g = SKILLS[r.grant];
        if (!g || g.cls !== r.cls) out.grantBad.push(id + '→' + r.grant);
      }
    }
    out.skillCount = covered.size;
    out.grantN = ids.filter(i => !!RELICS[i].grant).length;
    /* relicPool */
    out.poolCls = { warrior: 'ok', mage: 'ok', taoist: 'ok' };
    for (const c of ['warrior', 'mage', 'taoist']) {
      for (let n = 0; n < 40; n++) {
        const pid = relicPool(c, 40)[0];
        const p = RELICS[pid];
        if (!p || p.cls !== c) out.poolCls[c] = '漏出 ' + pid;
      }
    }
    out.poolCap = relicPool('warrior', 10).every(id => RELICS[id].ilvl <= 16) && relicPool('warrior', 10).length < 10;
    out.poolFallback = relicPool('warrior', 1).every(id => RELICS[id].cls === 'warrior') && relicPool('warrior', 1).length > 0;
    out.poolNonEmpty = ['warrior', 'mage', 'taoist'].every(c => relicPool(c, 1).length > 0);
    return out;
  });

  if (!d.started) { bad('游戏未开局'); }
  else {
    if (d.total === 30) ok('法器共 30 件');
    else bad('法器数量异常：' + d.total);
    if (!d.idMatch.length) ok('键名与 id 一一对应');
    else bad('键名与 id 不一致：' + d.idMatch.join(','));
    if (d.byCls.warrior === 10 && d.byCls.mage === 10 && d.byCls.taoist === 10) ok('三职业各 10 件（战士 / 法师 / 道士）');
    else bad('职业分布异常：' + JSON.stringify(d.byCls));
    if (d.nameDup === 0 && !d.glyphMiss.length) ok('30 个名号互不重复，且各有单字字形');
    else bad('名字重复 ' + d.nameDup + ' / 缺字形 ' + d.glyphMiss.join(','));
    if (!d.introShort.length && !d.loreShort.length) ok('每件都有一句介绍 + 一段来历（30 段历史互不相同：' + (d.loreDup === 0) + '）');
    else bad('介绍/历史缺失：intro ' + d.introShort.join(',') + ' | lore ' + d.loreShort.join(','));
    if (d.introDup === 0 && d.loreDup === 0) ok('介绍与历史均无重复文案');
    else bad('文案重复：intro ' + d.introDup + ' / lore ' + d.loreDup);
    if (!d.ilvlBad.length && d.ilvlOrdered) ok('需求等级落在 1~40，且同职业内不撞档');
    else bad('等级异常：' + JSON.stringify({ bad: d.ilvlBad, ordered: d.ilvlOrdered }));
    if (!d.statBadKey.length && !d.statBadVal.length) ok('固定属性全部指向真实属性 key 且为正值');
    else bad('属性异常：' + JSON.stringify({ key: d.statBadKey, val: d.statBadVal }));
    if (!d.skillMiss.length && !d.skillCls.length) ok('每件都指向本职业的一门真实术法（共覆盖 ' + d.skillCount + ' 门）');
    else bad('术法指向异常：' + JSON.stringify({ miss: d.skillMiss, cls: d.skillCls }));
    if (!d.modBad.length) ok('术法修正只用 dmg/cd/cost/radius/count/dur 六个键');
    else bad('修正键越界：' + d.modBad.join(','));
    if (!d.grantBad.length) ok('附带术法 ' + d.grantN + ' 件，均为本职业可施放术法');
    else bad('附带术法异常：' + d.grantBad.join(','));
    if (d.skillCount >= 24) ok('30 件法器覆盖 ' + d.skillCount + ' 门不同术法（与技能系统相辅相成）');
    else bad('术法覆盖面过窄：' + d.skillCount);
    if (['warrior', 'mage', 'taoist'].every(c => d.poolCls[c] === 'ok') && d.poolCap && d.poolFallback && d.poolNonEmpty)
      ok('relicPool 只出本职业，按等级上限过滤，过滤空了也回落本职业');
    else bad('relicPool 异常：' + JSON.stringify({ pool: d.poolCls, cap: d.poolCap, fb: d.poolFallback, nonEmpty: d.poolNonEmpty }));
  }

  /* ---------------- 二、生成层 ---------------- */
  const g = await page.evaluate(() => {
    const out = {};
    const it = makeRelic('w1', 'warrior');
    out.slot = it.slot;
    out.rarity = it.rarity;
    out.noAffix = it.affixes.length === 0 && it.fixed.length === 0;
    out.hasStats = !!it.uniqueStats && it.uniqueStats.atk === RELICS.w1.stats.atk;
    out.hasSkill = !!it.uniqueSkill && it.uniqueSkill.id === RELICS.w1.skill.id;
    out.valueOk = isFinite(it.value) && it.value > 0;
    out.reqLv = it.reqLv;
    out.glyph = it.glyph;
    out.lore = !!it.lore && it.lore === RELICS.w1.lore;
    out.badId = makeRelic('nope', 'warrior');

    /* 掉落比例 + 职业隔离 */
    let relicN = 0, wrongCls = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) {
      const x = rollItem(10 + (i % 30), { cls: 'mage' });
      if (x.slot === 'relic') {
        relicN++;
        if (x.cls !== 'mage') wrongCls++;
      }
    }
    out.rate = relicN / N;
    out.wrongCls = wrongCls;
    /* 指定部位时不该被法器顶掉 */
    out.slotHonored = true;
    for (let i = 0; i < 300; i++) {
      const x = rollItem(20, { slot: 'helm' });
      if (x.slot !== 'helm') { out.slotHonored = false; break; }
    }
    /* fillFixedAffixes 不给法器补词条 */
    const r2 = makeRelic('m1', 'mage');
    out.fillN = fillFixedAffixes(r2);
    out.stillEmpty = r2.fixed.length === 0 && r2.affixes.length === 0;
    return out;
  });

  if (g.slot === 'relic' && g.rarity === 'legendary') ok('makeRelic 产出传说级法器，落在 relic 槽');
  else bad('法器生成字段异常：' + JSON.stringify([g.slot, g.rarity]));
  if (g.noAffix && g.stillEmpty && !g.fillN) ok('法器不吃固定词条 / 洗练词条（补词条函数直接跳过）');
  else bad('法器被塞了词条：' + JSON.stringify([g.noAffix, g.stillEmpty, g.fillN]));
  if (g.hasStats && g.hasSkill) ok('属性与术法修正按目录原样落到 uniqueStats / uniqueSkill');
  else bad('属性或术法未落到法器：' + JSON.stringify([g.hasStats, g.hasSkill]));
  if (g.valueOk && g.reqLv === RELICS_w1_req()) ok('售价与需求等级正确（可卖出，不出现 undefined）');
  else bad('价值/需求等级异常：' + JSON.stringify([g.valueOk, g.reqLv]));
  if (g.glyph && g.lore) ok('法器自带字形与来历，随物品走（存档 / 交易都不丢）');
  else bad('字形或来历缺失');
  if (g.badId === null) ok('未知法器 id 返回 null，不产生半成品');
  else bad('未知 id 未拦截');
  if (g.rate > 0.03 && g.rate < 0.11) ok('法器掉率约 6%（实测 ' + (g.rate * 100).toFixed(1) + '%）');
  else bad('法器掉率异常：' + (g.rate * 100).toFixed(1) + '%');
  if (g.wrongCls === 0) ok('法师掉落只出法师法器（职业隔离）');
  else bad('掉出了别职业法器：' + g.wrongCls);
  if (g.slotHonored) ok('指定部位掉落不会被法器顶掉（任务 / 奖励仍可定向给装）');
  else bad('指定部位掉落被法器污染');

  function RELICS_w1_req() { return 6; }   // w1.ilvl 8 → reqLv = ilvl - 2

  /* ---------------- 三、装备层 ---------------- */
  const e = await page.evaluate(() => {
    const out = {};
    const s = Game.state;
    s.level = 40; Game.recalc();
    const relic = makeRelic('w10', 'warrior');    // 剑神幡，附带 avatar（26 级解锁）
    out.fitsRelic = Game.fitsSlot(relic, 'relic');
    out.fitsWeapon = Game.fitsSlot(relic, 'weapon');
    out.fitsOff = Game.fitsSlot(relic, 'offhand');
    out.slotFor = Game.slotForItem(relic);
    out.grantId = relic.relicGrant;

    const atk0 = Game.state.stats.atk;
    s.inventory.push(relic);
    Game.equipFromInv(s.inventory.length - 1);
    out.equipped = !!s.equipment.relic;
    out.atkUp = Game.state.stats.atk > atk0;
    out.atkDelta = Math.round((Game.state.stats.atk - atk0) * 10) / 10;
    /* uniqueSkill 进 skillMods */
    const sm = Game.state.stats.skillMods || {};
    out.modApplied = !!(sm[RELICS.w10.skill.id] && sm[RELICS.w10.skill.id].dmg > 0);

    /* 未领悟也能放：等级压到 10，avatar 需 26 */
    s.level = 10; Game.recalc();
    s.mp = 999;
    Game.cooldowns[out.grantId] = 0;
    const mp0 = s.mp;
    Game.castSkill(out.grantId);
    out.castByRelic = s.mp < mp0 || (Game.cooldowns[out.grantId] || 0) > 0;

    /* 卸下 → 附带术法失效 */
    Game.unequip('relic');
    s.level = 10; Game.recalc();
    s.mp = 999; Game.cooldowns[out.grantId] = 0;
    const mp1 = s.mp;
    Game.castSkill(out.grantId);
    out.blockedAfterUnequip = s.mp === mp1 && !(Game.cooldowns[out.grantId] > 0);
    out.unequipped = !s.equipment.relic;
    return out;
  });

  if (e.fitsRelic && !e.fitsWeapon && !e.fitsOff && e.slotFor === 'relic') ok('法器只能进法器位，不会串到兵器 / 副手位');
  else bad('法器槽位规则异常：' + JSON.stringify(e));
  if (e.equipped && e.atkUp) ok('装上法器后攻击力提升 ' + e.atkDelta + '（属性真实生效）');
  else bad('法器属性未生效：' + JSON.stringify([e.equipped, e.atkUp, e.atkDelta]));
  if (e.modApplied) ok('法器对术法的修正进入 skillMods（与技能系统同一通道）');
  else bad('术法修正未生效');
  if (e.castByRelic) ok('未领悟的附带术法可凭法器施放（10 级放 26 级大招）');
  else bad('附带术法未放行');
  if (e.unequipped && e.blockedAfterUnequip) ok('卸下法器后附带术法立即失效');
  else bad('卸下后仍能放：' + JSON.stringify([e.unequipped, e.blockedAfterUnequip]));

  /* ---------------- 四、界面层 ---------------- */
  const u = await page.evaluate(() => {
    const out = {};
    const s = Game.state;
    s.level = 40;
    const relic = makeRelic('w3', 'warrior');
    s.equipment.relic = relic;
    Game.recalc();
    UI.closeAll();
    document.getElementById('invPanel').classList.add('open');
    UI.renderInventory();

    const cell = document.querySelector('#dollGrid .eslot[data-slot="relic"]');
    out.cell = !!cell;
    out.cellFilled = !!(cell && cell.classList.contains('filled'));
    out.hasIcon = !!(cell && cell.querySelector('.it-relic'));
    out.iconPaths = cell ? (cell.querySelectorAll('.it-relic path, .it-relic circle, .it-relic ellipse')).length : 0;
    out.iconW = cell ? Math.round((cell.querySelector('.it-relic') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width) : 0;
    out.auraRings = cell ? cell.querySelectorAll('.it-relic circle[fill="none"]').length : 0;
    out.cellMeta = cell ? (cell.querySelector('.rmeta b') || {}).textContent : '';

    /* 提示框三段 */
    const tip = itemTooltip(relic);
    out.tipIntro = /破军|鼓|雷/.test(tip) && /tt-relic-intro/.test(tip);
    out.tipLore = /tt-lore/.test(tip) && tip.indexOf(RELICS.w3.lore.slice(0, 8)) >= 0;
    out.tipSkill = /tt-skill/.test(tip) && tip.indexOf(SKILLS[RELICS.w3.skill.id].name) >= 0;
    /* 附带术法：只有 4 件带 grant，单独取剑神幡验 */
    const tipG = itemTooltip(makeRelic('w10', 'warrior'));
    out.tipGrant = /tt-grant/.test(tipG) && tipG.indexOf(SKILLS.avatar.name) >= 0;
    out.tipNoGrant = /tt-grant/.test(tip) === false;
    /* 行囊里也该认得出法器 */
    s.inventory.push(makeRelic('w4', 'warrior'));
    UI.renderInventory();
    const bag = [...document.querySelectorAll('#invGrid .islot')].find(x => x.querySelector('.it-relic'));
    out.bagGlyph = !!bag;
    return out;
  });

  if (u.cell && u.cellFilled) ok('纸娃娃有法器格且显示已装备');
  else bad('纸娃娃法器格异常：' + JSON.stringify(u));
  if (u.hasIcon && u.iconW >= 26) ok('法器格画的是专属器物图标（' + u.iconW + 'px，比普通装备大一号）');
  else bad('法器图标异常：' + JSON.stringify([u.hasIcon, u.iconW]));
  if (u.auraRings >= 2 && u.iconPaths >= 4) ok('图标自带法阵外圈（双环）+ 器物本体，共 ' + u.iconPaths + ' 个图形');
  else bad('图标过于简陋：' + JSON.stringify([u.auraRings, u.iconPaths]));
  if (u.cellMeta && u.cellMeta.length) ok('法器格显示名号：' + u.cellMeta);
  else bad('法器格未显示名号');
  if (u.tipIntro && u.tipLore) ok('提示框显示一句介绍 + 一段来历');
  else bad('提示框缺介绍/来历：' + JSON.stringify([u.tipIntro, u.tipLore]));
  if (u.tipSkill) ok('提示框显示对术法的修正（与术法同名）');
  else bad('提示框未显示术法修正');
  if (u.tipGrant) ok('带 grant 的法器在提示框标注「附带术法 · 未领悟亦可施放」');
  else bad('提示框未标注附带术法');
  if (u.tipNoGrant) ok('无附带术法的法器不会多出一行（文案不虚标）');
  else bad('无 grant 的法器也显示了附带术法');
  if (u.bagGlyph) ok('行囊里的法器同样用专属图标');
  else bad('行囊法器无图标');

  /* 30 件必须都有图标，且每张都不少于 3 个图形元素（不是占位方块） */
  const ic = await page.evaluate(() => {
    const out = { miss: [], thin: [], dup: 0, ids: 0 };
    const seen = new Set();
    for (const id in RELICS) {
      out.ids++;
      const shape = RELIC_ICONS[id];
      if (!shape) { out.miss.push(id); continue; }
      const n = (shape.match(/<(path|circle|ellipse|rect|polygon)/g) || []).length;
      if (n < 3) out.thin.push(id + ':' + n);
      if (seen.has(shape)) out.dup++;
      seen.add(shape);
    }
    out.auraN = (RELIC_AURA.match(/<(path|circle|ellipse|rect|polygon)/g) || []).length;
    return out;
  });
  if (!ic.miss.length && ic.ids === 30) ok('30 件法器全部有专属图标，无遗漏');
  else bad('缺图标：' + ic.miss.join(','));
  if (ic.dup === 0) ok('30 张图标互不重复（不是同一张换色）');
  else bad('图标重复 ' + ic.dup + ' 张');
  if (!ic.thin.length && ic.auraN >= 3) ok('每张图标都是「法阵外圈 + 多层器物」的完整构图');
  else bad('图标构图过薄：' + JSON.stringify(ic.thin));

  /* ---------------- 五、存档层 ---------------- */
  const sv = await page.evaluate(() => {
    const out = {};
    const s = Game.state;
    const relic = makeRelic('t10', 'taoist');
    s.equipment.relic = relic;
    const doc = SaveManager.pack(s);
    const back = SaveManager.unpack(doc);
    const r = back.equipment.relic;
    out.kept = !!r && r.relicId === 't10';
    out.slotKept = r && r.slot === 'relic';
    out.statsKept = r && r.uniqueStats && r.uniqueStats.summonDmg === RELICS.t10.stats.summonDmg;
    out.grantKept = r && r.relicGrant === 'azuredragon';
    out.noAffix = r && r.affixes.length === 0 && r.fixed.length === 0;
    out.glyphKept = r && r.glyph === RELICS.t10.glyph;
    return out;
  });

  if (sv.kept && sv.slotKept && sv.noAffix) ok('存档往返保留法器本体、部位与「无词条」状态');
  else bad('法器存档丢失：' + JSON.stringify(sv));
  if (sv.statsKept && sv.grantKept && sv.glyphKept) ok('属性 / 附带术法 / 字形都随存档还原');
  else bad('法器存档字段不全：' + JSON.stringify(sv));

  /* ---------------- 收尾 ---------------- */
  const jsErrors = errors.filter(e => !/favicon|WebGL|Failed to load/i.test(e));
  if (!jsErrors.length) ok('全程无 JS 报错');
  else bad('JS 报错：' + jsErrors.slice(0, 3).join(' | '));

  const shot = path.join(ROOT, 'shots', 'relic.png');
  await page.screenshot({ path: shot });
  await browser.close();
  server.close();
  const pass = results.filter(Boolean).length;
  console.log('  ' + '='.repeat(64));
  console.log(`  结果：${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
