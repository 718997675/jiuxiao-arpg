/* [M6] 线上校验：仓管 NPC 入口 / 跨角色仓库 / 存取
 * 用法：node dev/live-m6.js
 * 注意：GitHub Pages 构建有 40~60 秒延迟，刚 push 完立刻跑会拿到旧版本。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const resp = await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  console.log('HTTP:', resp.status());
  await wait(1800);
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 30; Game.recalc(); });
  await wait(700);

  const r = await p.evaluate(async () => {
    const out = {};
    out.hasStore = typeof StashStore !== 'undefined';
    out.npc = NPCS.steward ? { name: NPCS.steward.name, role: NPCS.steward.role } : null;
    out.inVillage = (MAPS.village.npcs || []).indexOf('steward') >= 0;
    out.spawned = !!(Game.npcs && Game.npcs.steward);

    /* 菜单里不该有仓库 */
    UI.openMenu('bag');
    await new Promise(r => setTimeout(r, 160));
    out.tabs = [...document.querySelectorAll('#menuTabs .mtab')].map(x => x.textContent.trim());
    UI.closeMenu();

    /* 走 NPC 那条路开面板 */
    Game.openNPC('steward');
    await new Promise(r => setTimeout(r, 240));
    const el = document.getElementById('stashPanel');
    out.open = !!(el && el.classList.contains('open'));
    out.cap = Game.stashCap();

    /* 存取一轮 */
    const s = Game.state;
    s.inventory.length = 0;
    for (let i = 0; i < 4; i++) s.inventory.push(rollItem(20));
    const put = Game.stashPut(0);
    const n1 = Game.stashCount();
    const take = Game.stashTake(0);
    out.mv = { put: put.ok, n1, take: take.ok, n2: Game.stashCount(), inv: s.inventory.length };

    /* 材料跨角色：写 → 丢内存 → 重读 */
    Game.addMat('crystal3', 5);
    Game.save();
    StashStore.d = null; StashStore.load();
    out.mat = Game.crystalTierCount(3);

    /* 套装柜：造 3 件套 → 登记 → 取出 */
    const d = Game.stashData();
    d.items.length = 0; d.sets = {}; d.cap = 200;
    s.inventory.length = 0;
    const setId = Object.keys(SETS).find(id => SETS[id].slots.length === 3);
    const set = SETS[setId];
    set.slots.forEach((slot, k) => {
      const it = rollItem(30, { slot: slot === 'ring' ? 'ring' : slot, rarity: 'rare' });
      it.setId = setId; it.setName = set.name; it.rarity = 'set';
      it.name = set.pieces[k] || it.name;
      d.items.push(it);
    });
    const reg = Game.setRegister(setId);
    const afterReg = d.items.length;
    const outR = Game.setWithdraw(setId);
    out.set = { reg: reg.ok, afterReg, out: outR.ok, inv: s.inventory.length };
    return out;
  });

  console.log(`  仓管：${r.npc ? r.npc.name + '（' + r.npc.role + '）' : '缺失'}  在村庄=${r.inVillage}  已生成=${r.spawned}`);
  console.log('  菜单页签:', r.tabs.join(' / '));
  console.log(`  面板打开=${r.open}  容量 ${r.cap} 格`);
  console.log(`  存取：存入=${r.mv.put} 仓库 ${r.mv.n1} 件  取回=${r.mv.take} 仓库 ${r.mv.n2} 件  行囊 ${r.mv.inv}`);
  console.log(`  材料跨角色：3 阶玄晶 ${r.mat}（写入 5）`);
  console.log(`  套装柜：登记=${r.set.reg} 仓库剩 ${r.set.afterReg} 件  取出=${r.set.out} 行囊 ${r.set.inv} 件`);

  ok(r.hasStore, '线上没有 StashStore');
  ok(r.npc && r.npc.role === 'stash', '线上没有仓管 NPC');
  ok(r.inVillage, '仓管没进村庄 npc 列表');
  ok(r.spawned, '仓管没在场景里生成');
  ok(!r.tabs.some(t => t.indexOf('仓 库') === 0), '线上仓库还挂在主菜单里');
  ok(r.open, '线上和仓管说话打不开仓库');
  ok(r.cap === 60, `线上仓库容量 ${r.cap}（应为 60）`);
  ok(r.mv.put && r.mv.n1 === 1 && r.mv.take && r.mv.n2 === 0 && r.mv.inv === 4, '线上存取数量不对');
  ok(r.mat === 5, `线上材料重读后是 ${r.mat}（应为 5）`);
  ok(r.set.reg && r.set.afterReg === 0 && r.set.out && r.set.inv === 3, '线上套装柜流程不对');

  console.log('\n报错数:', errs.length, errs.slice(0, 3));
  ok(errs.length === 0, 'X: 线上页面有 JS 报错');
  console.log(fails.length ? '\n❌ 线上校验失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ 线上校验全部通过');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
