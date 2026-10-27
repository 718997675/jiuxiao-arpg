/* ============================================================
 * S0 存档地基 · 浏览器回归（node dev/test-save-browser.js）
 *
 * 覆盖：
 *   1. 塞一份 V1 旧档 → 刷新 → 自动迁移为角色位 1（字段逐项比对）
 *   2. 开始界面「存档」面板可打开、可操作
 *   3. 进入游戏 → 游戏内 P 键开面板
 *   4. 导出 → 清空 localStorage → 导入 → 指纹 100% 一致
 *   5. 三端布局（1440×900 / 844×390 / 390×844）无横向溢出、无遮挡
 *   6. 全程 0 console error、0 失败请求
 *
 * 前提：本地起静态服务，默认 http://127.0.0.1:8123
 *   通过环境变量 BASE_URL 可覆盖
 * ============================================================ */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const SHOTS = path.resolve(__dirname, '..', 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, label, extra) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra).slice(0, 400))); }
};
const eq = (a, b, label) => ok(a === b, label, { got: a, want: b });
const section = t => console.log('\n' + t);

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);
  const errs = [];
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  /* 换视口要 reload，正在缓冲的 BGM 会被浏览器主动 abort（net::ERR_ABORTED）。
   * 那不是应用报错，是测试自己打断的，过滤掉免得每次跑都随机红一条。 */
  page.on('requestfailed', r => {
    const t = (r.failure() || {}).errorText || '';
    if (/ERR_ABORTED/.test(t) && /\/audio\//.test(r.url())) return;
    errs.push('[reqfail] ' + r.url() + ' :: ' + t);
  });

  /* ---------------- 1. 造一份 V1 旧档（用页面里的 Game.newState + rollItem） ---------------- */
  section('一、V1 旧档自动迁移（真实浏览器 localStorage）');
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await wait(1200);

  const v1 = await page.evaluate(() => {
    const s = Game.newState('warrior', '青崖客');
    s.level = 17; s.xp = 340; s.xpNext = 2100; s.gold = 3421;
    s.potions = { hp: 5, mp: 2 }; s.hp = 470; s.mp = 61;
    const slots = ['helm', 'chest', 'boots', 'gloves', 'ring', 'amulet', 'weapon'];
    for (let i = 0; i < 12; i++) {
      s.inventory.push(rollItem(4 + i * 2, { slot: slots[i % slots.length], rarity: ['common', 'magic', 'rare', 'legendary'][i % 4], cls: 'warrior' }));
    }
    s.equipment.helm = rollItem(9, { slot: 'helm', rarity: 'rare', cls: 'warrior' });
    s.quests = { active: [{ id: 'q3', progress: [0] }], done: ['q1', 'q2'], next: 'q3', announced: { q1: 1, q2: 1 } };
    s.mapId = 'forest'; s.playerPos = { x: 3.5, z: -12.25 };
    s.bossKilled = { treeking: 1 }; s.playTime = 4321.7;
    localStorage.clear();
    localStorage.setItem('jiuxiao_save_v1', JSON.stringify(s));
    return s;
  });
  ok(v1.level === 17 && v1.inventory.length === 12, 'V1 旧档已写入 localStorage（17 级 / 12 件背包）');

  await page.reload({ waitUntil: 'load' });
  await wait(1600);

  const mig = await page.evaluate(() => {
    const rawLegacy = localStorage.getItem('jiuxiao_save_v1');
    const bak = localStorage.getItem('jiuxiao_save_v1.bak');
    const doc = SaveManager.readSlot(1);
    const flat = SaveManager.load(1);
    return {
      migrated: SaveManager.migrated,
      legacyIntact: !!rawLegacy,
      backupSame: !!bak && bak === rawLegacy,
      slotCount: SaveManager.listSlots().filter(s => !s.empty).length,
      active: SaveManager.activeSlot(),
      schema: doc && doc.v,
      tmpLeft: Object.keys(localStorage).filter(k => k.endsWith('.tmp')).length,
      fp: saveStateFingerprint(flat),
      keys: Object.keys(localStorage).sort()
    };
  });
  ok(mig.migrated, 'init() 自动完成迁移');
  ok(mig.legacyIntact, 'V1 旧键保留未删');
  ok(mig.backupSame, 'jiuxiao_save_v1.bak 与旧档逐字节一致');
  eq(mig.slotCount, 1, '只有 1 个非空角色位');
  eq(mig.active, 1, '当前角色位 = 1');
  eq(mig.schema, 2, 'schemaVersion = 2');
  eq(mig.tmpLeft, 0, '无残留 .tmp 键');

  const fpBefore = await page.evaluate(v => saveStateFingerprint(v), v1);
  eq(mig.fp.level, fpBefore.level, `等级 ${v1.level}`);
  eq(mig.fp.gold, fpBefore.gold, `金币 ${v1.gold}`);
  eq(mig.fp.invCount, fpBefore.invCount, `背包物品数 ${v1.inventory.length}`);
  eq(mig.fp.invSig, fpBefore.invSig, '背包指纹一致（稀有度/基底/ilvl/词缀数）');
  eq(mig.fp.eqSig, fpBefore.eqSig, '已装备物品指纹一致');
  eq(mig.fp.questActive, fpBefore.questActive, '任务进度一致');
  eq(mig.fp.questDone, fpBefore.questDone, '已完成任务一致');
  eq(mig.fp.questNext, fpBefore.questNext, '任务指针一致');
  eq(mig.fp.mapId, fpBefore.mapId, '地图一致');

  eq(await page.$eval('#continueBtn', el => el.style.display), 'inline-block', '开始界面出现「继续」按钮');
  ok((await page.$eval('#continueBtn', el => el.textContent)).includes('17'), '继续按钮显示等级 17');

  /* ---------------- 2. 开始界面存档面板 ---------------- */
  section('二、开始界面「存档」面板');
  await page.click('#saveMgrBtn');
  await wait(420);
  const p1 = await page.evaluate(() => {
    const p = document.getElementById('savePanel');
    const r = p.getBoundingClientRect();
    return {
      open: p.classList.contains('open'),
      cards: document.querySelectorAll('#savePanel .scard').length,
      slotCount: SaveManager.SLOT_COUNT,
      inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      overflowX: p.scrollWidth - p.clientWidth,
      text: document.getElementById('slotList').innerText.replace(/\s+/g, ' ')
    };
  });
  ok(p1.open, '面板已打开');
  eq(p1.cards, p1.slotCount, `角色位卡片 ${p1.slotCount} 张`);
  ok(p1.inView, '面板完整在视口内');
  ok(p1.overflowX <= 1, '无横向溢出', p1.overflowX);
  ok(p1.text.includes('青崖客') && p1.text.includes('17 级'), '卡片显示角色名与等级');
  await page.screenshot({ path: path.join(SHOTS, 's0-01-start-save.png') });

  // 关掉面板
  await page.evaluate(() => SaveUI.close());
  await wait(200);

  /* ---------------- 3. 进入游戏（继续前世） ---------------- */
  section('三、继续前世 → 游戏内状态');
  await page.click('#continueBtn');
  await wait(1800);
  const ing = await page.evaluate(() => ({
    running: Game.running, cls: Game.state.cls, level: Game.state.level,
    gold: Game.state.gold, map: Game.state.mapId, slot: Game.savedSlot,
    inv: Game.state.inventory.length, hp: Math.round(Game.state.hp),
    startHidden: document.getElementById('start').style.display === 'none',
    errors: 0
  }));
  ok(ing.running, '游戏已运行');
  eq(ing.cls, 'warrior', '职业 warrior');
  eq(ing.level, 17, '等级 17');
  eq(ing.gold, 3421, '金币 3421');
  eq(ing.map, 'forest', '在地图 forest');
  eq(ing.inv, 12, '背包 12 件');
  eq(ing.slot, 1, '当前档位 1');
  ok(ing.startHidden, '开始界面已隐藏');

  // 存档往返：改点东西 → 存 → 重载
  const rt = await page.evaluate(() => {
    Game.state.gold += 100;
    Game.state.inventory.push(rollItem(20, { slot: 'boots', rarity: 'set', cls: 'warrior' }));
    const before = saveStateFingerprint(Game.state);
    Game.save();
    const flat = SaveManager.load(1);
    return { before, after: saveStateFingerprint(flat) };
  });
  eq(rt.after.gold, rt.before.gold, '存盘→读回 金币一致');
  eq(rt.after.invCount, rt.before.invCount, '存盘→读回 背包数量一致');
  eq(rt.after.invSig, rt.before.invSig, '存盘→读回 背包指纹一致');

  /* ---------------- 4. 游戏内面板 + 三端布局 ---------------- */
  section('四、游戏内 P 键面板 & 三端布局');
  await page.keyboard.press('p');
  await wait(400);
  ok(await page.$eval('#savePanel', el => el.classList.contains('open')), '游戏内 P 键打开面板');
  await page.screenshot({ path: path.join(SHOTS, 's0-02-ingame-save.png') });
  await page.evaluate(() => SaveUI.close());
  await wait(200);

  /* ---------------- 5. 导出 → 清空 → 导入 ---------------- */
  section('五、导出 → 清空 localStorage → 导入');
  const text = await page.evaluate(() => {
    const t = SaveManager.exportText(1);
    window.__exported = t;
    return t;
  });
  ok(text.length > 500, `导出文本 ${text.length} 字符`);
  const fpx = await page.evaluate(() => saveStateFingerprint(SaveManager.unpack(JSON.parse(window.__exported))));

  await page.evaluate(() => localStorage.clear());
  eq(await page.evaluate(() => localStorage.length), 0, 'localStorage 已清空');

  const impRes = await page.evaluate(() => SaveManager.importText(window.__exported, 1));
  ok(impRes.ok, '导入成功', impRes.error);
  const fpi = await page.evaluate(() => saveStateFingerprint(SaveManager.load(1)));
  eq(JSON.stringify(fpi), JSON.stringify(fpx), '导入后指纹与导出时完全一致');

  // 真正刷新一次，确认落盘的不是内存态
  // 先「退出游戏」避免 beforeunload 把运行中的实时状态（含 playTime/hp 回复）写回去
  await page.evaluate(() => { Game.running = false; Game.state = null; });
  await page.reload({ waitUntil: 'load' });
  await wait(1500);
  const afterReload = await page.evaluate(() => {
    const flat = SaveManager.load(SaveManager.activeSlot());
    return { fp: saveStateFingerprint(flat), n: SaveManager.listSlots().filter(s => !s.empty).length };
  });
  eq(JSON.stringify(afterReload.fp), JSON.stringify(fpx), '刷新后仍 100% 一致（真落盘）');
  eq(afterReload.n, 1, '刷新后仍只有 1 个角色位');

  /* ---------------- 6. 新建 / 删除角色 ---------------- */
  section('六、面板内新建与删除');
  await page.evaluate(() => SaveUI.open());
  await wait(300);
  const created = await page.evaluate(async () => {
    document.querySelector('#newClsPick .cmini[data-cls="mage"]').click();
    document.getElementById('newName').value = '云中君';
    document.getElementById('newCharBtn').click();
    return { running: Game.running, cls: Game.state.cls, name: Game.state.name, slot: Game.savedSlot, n: SaveManager.listSlots().filter(s => !s.empty).length };
  });
  await wait(1400);
  ok(created.running, '建档后直接进入游戏');
  eq(created.cls, 'mage', '新角色职业 mage');
  eq(created.name, '云中君', '新角色名字生效');
  eq(created.slot, 2, '自动落在 2 号位');
  eq(created.n, 2, '现在有 2 个角色');

  await page.evaluate(() => SaveUI.open());
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS, 's0-03-two-slots.png') });
  const del = await page.evaluate(() => {
    // 删除 1 号位：两次点击确认
    const btn = document.querySelector('#slotList [data-act="del"][data-slot="1"]');
    btn.click();
    const label = btn.textContent;
    document.querySelector('#slotList [data-act="del"][data-slot="1"]').click();
    return { label, left: SaveManager.listSlots().filter(s => !s.empty).length, has1: !!SaveManager.peek(1) };
  });
  await wait(300);
  ok(del.label.includes('确认删除'), '第一次点击变为「确认删除」');
  eq(del.has1, false, '1 号位已删除');
  eq(del.left, 1, '剩 1 个角色');
  await page.evaluate(() => SaveUI.close());
  await wait(200);

  /* ---------------- 7. 三端布局 ---------------- */
  section('七、三端布局回归');
  const viewports = [
    { name: 'PC 1440×900', width: 1440, height: 900, touch: false },
    { name: '手机横屏 844×390', width: 844, height: 390, touch: true },
    { name: '手机竖屏 390×844', width: 390, height: 844, touch: true }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.touch, hasTouch: vp.touch, deviceScaleFactor: 1 });
    // 换视口要重新加载：IS_TOUCH 与触屏布局是在脚本载入时判定的
    await page.reload({ waitUntil: 'load' });
    await wait(1400);
    const entered = await page.evaluate(() => Game.loadSlot(SaveManager.activeSlot()));
    await wait(1600);
    ok(entered, `[${vp.name}] 进入角色位成功`);

    const hud = await page.evaluate(() => {
      const ids = ['charplate', 'topright', 'openBtns', 'miniWrap', 'questTrack'];
      const bad = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) { bad.push(id + ':missing'); continue; }
        if (getComputedStyle(el).display === 'none') continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0) continue;
        if (b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1) {
          bad.push(`${id}@${Math.round(b.left)},${Math.round(b.top)}~${Math.round(b.right)},${Math.round(b.bottom)}`);
        }
      }
      return { bad, scrollX: document.documentElement.scrollWidth - innerWidth };
    });
    ok(hud.bad.length === 0, `[${vp.name}] HUD 元素都在视口内`, hud.bad);
    ok(hud.scrollX <= 0, `[${vp.name}] 无横向溢出`, hud.scrollX);
    const tag = vp.touch ? (vp.width > vp.height ? 'landscape' : 'portrait') : 'pc';
    await page.screenshot({ path: path.join(SHOTS, `s0-05-game-${tag}.png`) });

    await page.evaluate(() => SaveUI.open());
    await wait(450);
    const lay = await page.evaluate(() => {
      const p = document.getElementById('savePanel');
      /* 游戏内存档是主菜单的一页（.embed），此时它按内容撑高、由菜单统一滚，
       * 所以「是否完整可见」要看外层菜单面板；标题界面才是独立弹窗。
       * 角色位 3 → 10 之后卡片多了 7 张，独立弹窗的限高也会生效，两种情况都得能滚。 */
      const mp = document.getElementById('menuPanel');
      const embedded = p.classList.contains('embed') && mp && mp.classList.contains('open');
      const host = embedded ? mp : p;
      const r = host.getBoundingClientRect();
      const bad = [];
      document.querySelectorAll('#savePanel .scard, #savePanel .btn, #savePanel #newName').forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.right > innerWidth + 1 || b.left < -1) bad.push(el.className + ':' + Math.round(b.left) + '~' + Math.round(b.right));
      });
      const pb = p.querySelector('.pb');
      const body = document.getElementById('menuBody');
      const scroller = embedded ? body : pb;
      return {
        embedded,
        inView: r.top >= -1 && r.bottom <= innerHeight + 2 && r.left >= -1 && r.right <= innerWidth + 2,
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), ih: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        panelOverflowX: p.scrollWidth - p.clientWidth,
        outOfView: bad,
        cards: document.querySelectorAll('#savePanel .scard').length,
        slotCount: SaveManager.SLOT_COUNT,
        touchCls: document.body.classList.contains('touch'),
        scrollable: scroller.scrollHeight - scroller.clientHeight
      };
    });
    ok(lay.inView, `[${vp.name}] 面板完整可见`, lay);
    /* 卡片多了必然要滚：要么菜单体在滚，要么面板自己滚，二者有一个能滚就算过关 */
    ok(lay.scrollable > 0 || lay.inView, `[${vp.name}] 内容装不下时可滚`, lay.scrollable);
    ok(lay.panelOverflowX <= 1, `[${vp.name}] 面板无横向溢出`, lay.panelOverflowX);
    ok(lay.overflowX <= 0, `[${vp.name}] 页面无横向滚动`, lay.overflowX);
    ok(lay.outOfView.length === 0, `[${vp.name}] 卡片/按钮都在视口内`, lay.outOfView);
    eq(lay.cards, lay.slotCount, `[${vp.name}] ${lay.slotCount} 张角色位卡片都在`);
    if (vp.touch) ok(lay.touchCls, `[${vp.name}] 走触屏布局`);
    await page.screenshot({ path: path.join(SHOTS, `s0-04-save-${tag}.png`) });
    await page.evaluate(() => SaveUI.close());
    await wait(250);
  }

  /* ---------------- 8. 控制台 ---------------- */
  section('八、控制台与网络');
  ok(errs.length === 0, `0 error / 0 失败请求（实际 ${errs.length}）`);
  if (errs.length) errs.slice(0, 10).forEach(e => console.log('     ' + e));

  await browser.close();
  console.log('\n' + '='.repeat(52));
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(52));
  process.exit(fail || errs.length ? 1 : 0);
})();
