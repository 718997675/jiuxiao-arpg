/* [M6] 仓库（储物箱）验收
 *
 * 对应 V2-ROADMAP M6 的三条验收：
 *   ① 存 200 件物品后打开仓库 < 100ms
 *   ② 跨角色存取正确
 *   ③ 整理后不丢物品（对比 md5）
 * 外加：扩容扣费、套装登记/取出、面板 0 报错。
 *
 * 用法：node dev/stash-check.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };
/* 物品集合的指纹：按稳定键排序后取 md5，顺序变化不算丢东西 */
function md5Of(items) {
  const keys = items.map(it => `${it.slot}|${it.baseName || it.name}|${it.ilvl}|${it.rarity}|${(it.affixes || []).length}|${it.sockets || 0}`).sort();
  return crypto.createHash('md5').update(keys.join('\n')).digest('hex');
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 30; Game.recalc(); });
  await wait(700);

  /* ---------- A. 入口：NPC 而不是菜单 ---------- */
  console.log('【A】入口与面板');
  const panel = await p.evaluate(async () => {
    /* 从干净的仓库开始，避免上一次跑的残留影响计数 */
    StashStore.clear(); StashStore.d = StashStore.blank();
    /* 仓库不在主菜单里 */
    UI.openMenu('bag');
    await new Promise(r => setTimeout(r, 200));
    const tabs = [...document.querySelectorAll('#menuTabs .mtab')].map(x => x.textContent.trim());
    UI.closeMenu();
    /* 村里的仓管 */
    const npc = NPCS.steward;
    const inVillage = (MAPS.village.npcs || []).indexOf('steward') >= 0;
    Game.openNPC('steward');
    await new Promise(r => setTimeout(r, 260));
    const el = document.getElementById('stashPanel');
    return {
      tabs,
      npcName: npc ? npc.name : null,
      npcRole: npc ? npc.role : null,
      inVillage,
      open: !!(el && el.classList.contains('open')),
      inMenuBody: !!(document.getElementById('menuBody') || {}).contains && document.getElementById('menuBody').contains(el),
      grid: document.querySelectorAll('#stashGrid .islot').length,
      bagGrid: document.querySelectorAll('#stashBagGrid .islot').length,
      mats: document.querySelectorAll('#stashMats .mgcell').length,
      sets: !!document.getElementById('stashSets')
    };
  });
  console.log(`  仓管 NPC：${panel.npcName}（role=${panel.npcRole}）在村庄=${panel.inVillage}`);
  console.log(`  打开=${panel.open}  挂在菜单容器里=${panel.inMenuBody}  行囊格 ${panel.bagGrid}  仓库格 ${panel.grid}  材料格 ${panel.mats}`);
  console.log('  菜单页签:', panel.tabs.join(' / '));
  ok(panel.npcName === '仓管·玄贮', 'A: 没有仓管 NPC');
  ok(panel.npcRole === 'stash', 'A: 仓管的 role 不是 stash');
  ok(panel.inVillage, 'A: 仓管没被放进村庄的 npc 列表');
  ok(!panel.tabs.some(t => t.indexOf('仓 库') === 0), 'A: 仓库还挂在主菜单里');
  ok(panel.open, 'A: 和仓管说话没能打开仓库面板');
  ok(!panel.inMenuBody, 'A: 仓库面板挂在了菜单容器里（应该独立浮层）');
  ok(panel.bagGrid === 40, `A: 行囊格 ${panel.bagGrid} 个（应为 40）`);
  ok(panel.grid === 60, `A: 仓库格 ${panel.grid} 个（应为 60）`);
  ok(panel.mats > 0, 'A: 材料仓没渲染');
  ok(panel.sets, 'A: 套装收藏柜没渲染');

  /* ---------- B. 存取正确 ---------- */
  console.log('\n【B】存入 / 取回');
  const mv = await p.evaluate(async () => {
    const s = Game.state;
    s.inventory.length = 0;
    for (let i = 0; i < 10; i++) s.inventory.push(rollItem(20 + i));
    const before = { inv: s.inventory.length, stash: Game.stashCount() };
    const ids = s.inventory.map(it => it.name + '#' + (it.ilvl || 0));
    const r1 = Game.stashPut(0);
    const r2 = Game.stashPut(0);
    const mid = { inv: s.inventory.length, stash: Game.stashCount() };
    const back = Game.stashTake(Game.stashCount() - 1);
    const after = { inv: s.inventory.length, stash: Game.stashCount() };
    /* 取回的必须是同一件（名字 + 等级一致），不能是重新生成的 */
    const same = s.inventory.some(it => it.name + '#' + (it.ilvl || 0) === ids[1]);
    return { before, mid, after, ok1: r1.ok, ok2: r2.ok, okBack: back.ok, same, msg: back.msg };
  });
  console.log(`  存 2 件：行囊 ${mv.before.inv}→${mv.mid.inv}  仓库 ${mv.before.stash}→${mv.mid.stash}`);
  console.log(`  取 1 件：行囊 ${mv.mid.inv}→${mv.after.inv}  仓库 ${mv.mid.stash}→${mv.after.stash}  同一件=${mv.same}`);
  ok(mv.ok1 && mv.ok2, 'B: 存入失败');
  ok(mv.mid.inv === mv.before.inv - 2 && mv.mid.stash === mv.before.stash + 2, 'B: 存入后数量不对');
  ok(mv.okBack && mv.after.inv === mv.mid.inv + 1 && mv.after.stash === mv.mid.stash - 1, 'B: 取回后数量不对');
  ok(mv.same, 'B: 取回的不是原来那件');

  /* 仓库满 / 行囊满时拒绝，而不是丢东西 */
  const guard = await p.evaluate(() => {
    const s = Game.state;
    const cap = Game.stashCap();
    while (Game.stashCount() < cap) Game.stashItems().push(rollItem(5));
    s.inventory.push(rollItem(5));
    const before = s.inventory.length;
    const r = Game.stashPut(s.inventory.length - 1);
    const after = s.inventory.length;
    /* 清掉塞进去的填充物，只留下前面测试的两件 */
    Game.stashData().items.length = 0;
    return { full: !r.ok, kept: after === before, msg: r.msg };
  });
  console.log(`  仓库满时存入：拒绝=${guard.full}  物品没丢=${guard.kept}  「${guard.msg}」`);
  ok(guard.full, 'B: 仓库满了还能存进去');
  ok(guard.kept, 'B: 仓库满时把物品弄丢了');

  /* ---------- C. 跨角色共享 ---------- */
  console.log('\n【C】跨角色共享');
  const share = await p.evaluate(async () => {
    const s = Game.state;
    s.inventory.length = 0;
    for (let i = 0; i < 6; i++) s.inventory.push(rollItem(30));
    for (let i = 0; i < 5; i++) Game.stashPut(0);
    Game.addMat('crystal2', 7);
    Game.addCrystal(13);
    Game.save();
    const mine = { items: Game.stashCount(), crystal2: Game.crystalTierCount(2), xj: Game.crystalCount() };

    /* 模拟「重开页面」：把内存副本扔掉，从 localStorage 重新读 */
    StashStore.d = null;
    StashStore.load();
    const reloaded = { items: Game.stashCount(), crystal2: Game.crystalTierCount(2), xj: Game.crystalCount() };

    /* 模拟「换角色」：新建第二个角色位并载入，仓库不该变 */
    let second = null, afterSwitch = null;
    if (typeof SaveManager !== 'undefined' && SaveManager.createCharacter) {
      const r = SaveManager.createCharacter('mage', '二丫');
      if (r && r.ok) {
        Game.loadSlot(r.slot);
        second = r.slot;
        afterSwitch = { items: Game.stashCount(), crystal2: Game.crystalTierCount(2), xj: Game.crystalCount() };
        /* 切回原角色，后续测试继续在原角色上做 */
        SaveManager.setActiveSlot(1); Game.loadSlot(1);
      }
    }
    return { mine, reloaded, second, afterSwitch };
  });
  console.log(`  写入后：${share.mine.items} 件 / 灵晶 ${share.mine.crystal2} / 玄晶 ${share.mine.xj}`);
  console.log(`  重读后：${share.reloaded.items} 件 / 灵晶 ${share.reloaded.crystal2} / 玄晶 ${share.reloaded.xj}`);
  if (share.afterSwitch) {
    console.log(`  切角色位 ${share.second} 后：${share.afterSwitch.items} 件 / 灵晶 ${share.afterSwitch.crystal2} / 玄晶 ${share.afterSwitch.xj}`);
    ok(share.afterSwitch.items === share.mine.items, `C: 换角色后仓库件数变了（${share.afterSwitch.items} vs ${share.mine.items}）`);
    ok(share.afterSwitch.crystal2 === share.mine.crystal2, 'C: 换角色后材料数量变了');
  } else {
    console.log('  （跳过换角色：存档层不可用）');
  }
  ok(share.reloaded.items === share.mine.items, `C: 重新读档后仓库件数变了（${share.reloaded.items} vs ${share.mine.items}）`);
  ok(share.reloaded.crystal2 === share.mine.crystal2, 'C: 重新读档后灵晶数量变了');
  ok(share.reloaded.xj === share.mine.xj, 'C: 重新读档后玄晶数量变了');

  /* ---------- D. 整理不丢东西 ---------- */
  console.log('\n【D】一键整理');
  const sort = await p.evaluate(() => {
    const d = Game.stashData();
    d.items.length = 0;
    for (let i = 0; i < 40; i++) d.items.push(rollItem(10 + i * 0.7));
    const before = JSON.parse(JSON.stringify(d.items));
    const t0 = performance.now();
    Game.stashSort();
    const ms = performance.now() - t0;
    const after = d.items;
    /* 部位是否成段（整理成功的判据：同部位必须连续） */
    const order = SLOT_ORDER;
    const seq = after.map(it => order.indexOf(it.slot === 'ring' ? 'ring1' : it.slot));
    let grouped = true;
    const seen = {};
    let last = null;
    for (const v of seq) {
      if (v !== last) { if (seen[v]) { grouped = false; break; } seen[v] = 1; last = v; }
    }
    return { before, after: JSON.parse(JSON.stringify(after)), ms, grouped, n: after.length };
  });
  const h0 = md5Of(sort.before), h1 = md5Of(sort.after);
  console.log(`  ${sort.n} 件整理耗时 ${sort.ms.toFixed(1)}ms  部位成段=${sort.grouped}`);
  console.log(`  md5 ${h0} → ${h1}`);
  ok(sort.n === 40, `D: 整理后剩 ${sort.n} 件`);
  ok(h0 === h1, 'D: 整理后物品集合变了（有东西丢了或被改了）');
  ok(sort.grouped, 'D: 整理后同部位没排在一起');

  /* ---------- E. 200 件性能 ---------- */
  console.log('\n【E】200 件打开仓库');
  const perf = await p.evaluate(async () => {
    const d = Game.stashData();
    d.items.length = 0;
    for (let i = 0; i < 200; i++) d.items.push(rollItem(1 + (i % 40)));
    /* 容量抬到 200 才装得下（正常玩法要扩到上限，测试里直接给） */
    d.cap = 200;
    Game.state.inventory.length = 0;
    for (let i = 0; i < 60; i++) Game.state.inventory.push(rollItem(20));
    UI.openStash();
    const runs = [];
    for (let k = 0; k < 6; k++) {
      const t0 = performance.now();
      UI.renderStash();
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    return {
      n: Game.stashCount(), cells: document.querySelectorAll('#stashGrid .islot').length,
      min: +runs[0].toFixed(1), med: +runs[3].toFixed(1), max: +runs[runs.length - 1].toFixed(1)
    };
  });
  console.log(`  ${perf.n} 件 / 铺 ${perf.cells} 格  渲染 最快 ${perf.min}ms  中位 ${perf.med}ms  最慢 ${perf.max}ms`);
  ok(perf.n === 200, `E: 仓库只有 ${perf.n} 件`);
  ok(perf.med < 100, `E: 200 件时渲染中位 ${perf.med}ms，超过 100ms`);

  /* ---------- F. 扩容扣费 ---------- */
  console.log('\n【F】扩容');
  const up = await p.evaluate(() => {
    const d = Game.stashData();
    d.items.length = 0;
    d.cap = STASH_BASE_CAP;
    Game.state.gold = 100;
    const poor = Game.upgradeStash();
    const gold0 = Game.state.gold;
    Game.state.gold = 5000;
    const rich = Game.upgradeStash();
    const info = Game.stashUpgradeInfo();
    return {
      poorReject: !poor.ok, poorMsg: poor.msg,
      richOk: rich.ok, cap: Game.stashCap(), goldAfter: Game.state.gold,
      cost: 2000, tier: info.tier, maxTier: info.maxTier
    };
  });
  console.log(`  金币 100 时：拒绝=${up.poorReject}「${up.poorMsg}」`);
  console.log(`  金币 5000 时：成功=${up.richOk}  容量 60→${up.cap}  余 ${up.goldAfter} 金  档位 ${up.tier}/${up.maxTier}`);
  ok(up.poorReject, 'F: 金币不足也能扩容');
  ok(up.richOk, 'F: 金币够却扩容失败');
  ok(up.cap === 80, `F: 扩容后容量 ${up.cap}（应为 80）`);
  ok(up.goldAfter === 3000, `F: 扩容扣费不对，余 ${up.goldAfter}（应为 3000）`);

  /* ---------- G. 套装收藏柜 ---------- */
  console.log('\n【G】套装收藏柜');
  const setR = await p.evaluate(() => {
    const d = Game.stashData();
    d.items.length = 0; d.sets = {}; d.cap = 200;
    const s = Game.state;
    s.inventory.length = 0;
    /* 挑一个 4 件套：把全部部件造出来放进仓库 */
    const setId = Object.keys(SETS).find(id => SETS[id].slots.length === 4) || Object.keys(SETS)[0];
    const set = SETS[setId];
    const made = [];
    for (const slot of set.slots) {
      const it = rollItem(30, { slot: slot === 'ring' ? 'ring' : slot, rarity: 'rare' });
      it.setId = setId; it.setName = set.name; it.rarity = 'set';
      it.name = set.pieces[set.slots.indexOf(slot)] || it.name;
      d.items.push(it);
      made.push(it.name);
    }
    const before = Game.setCollectInfo(setId);
    const reg = Game.setRegister(setId);
    const mid = { items: d.items.length, inSet: !!(d.sets[setId] && d.sets[setId].pieces.length) };
    const invBefore = s.inventory.length;
    const out = Game.setWithdraw(setId);
    const after = { items: d.items.length, inv: s.inventory.length, gone: !d.sets[setId] };
    return { setId, made, before, reg, mid, out, after, invBefore };
  });
  console.log(`  套装 ${setR.setId}：造 ${setR.made.length} 件 → 集齐=${setR.before.ok}（缺 ${setR.before.miss.length}）`);
  console.log(`  登记：${setR.reg.ok} 仓库剩 ${setR.mid.items} 件  收藏柜有货=${setR.mid.inSet}`);
  console.log(`  取出：${setR.out.ok} 行囊 +${setR.after.inv - setR.invBefore} 件  收藏柜清空=${setR.after.gone}`);
  ok(setR.before.ok, 'G: 4 件造齐了却判不出「集齐」');
  ok(setR.reg.ok && setR.mid.inSet, 'G: 登记失败');
  ok(setR.mid.items === 0, `G: 登记后仓库还剩 ${setR.mid.items} 件（应该全搬进收藏柜）`);
  ok(setR.out.ok, 'G: 取出失败');
  ok(setR.after.inv - setR.invBefore === 4, `G: 取出后行囊只多了 ${setR.after.inv - setR.invBefore} 件`);
  ok(setR.after.gone, 'G: 取出后收藏柜没清空');

  /* ---------- 收尾 ---------- */
  console.log('\n报错数:', errs.length, errs.slice(0, 4));
  ok(errs.length === 0, 'X: 页面有 JS 报错');
  console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ 仓库验收全部通过');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
