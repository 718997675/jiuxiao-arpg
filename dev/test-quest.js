/* ============================================================
 * dev/test-quest.js —— M2 任务系统专项回归
 *
 * 覆盖六件事（对应 docs/status/act-expansion.md 的 M2 验收口径）：
 *   1. 接取：营地掌事手上第一环出现，接了之后不再重复出现
 *   2. 进度：击杀 / 首领 / reach 三种目标都能推进，达成后 ready
 *   3. 复命：发奖、进 done、下一环顺延
 *   4. 任务区域：接了就点亮（刷怪 ×1.4 + 目标怪加权），复命立刻熄灭
 *   5. 悬赏板：一次 3 条、可重复、8 分钟冷却
 *   6. 老档迁移：q1~q11 → m*，进度数组一条不丢
 *
 * 用法：node dev/test-quest.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));

function chromePath() {
  const cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  return cands.find(f => fs.existsSync(f));
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1200);

  /* ---------------- 1. 接取 ---------------- */
  console.log('\n【1】接取');
  let r = await page.evaluate(() => {
    Game.startNew('warrior', 'T');
    const offers = QuestSys.offersOf('campA_main').map(q => q.id);
    const q1 = QUESTS.m1_1_1;
    QuestSys.accept(q1.id);
    const after = QuestSys.offersOf('campA_main').map(q => q.id);
    return { offers, after, active: Game.state.quests.active.map(a => a.id), mapOpen: questMapOpen(q1) };
  });
  ok('新档掌事第一环 = m1_1_1', r.offers[0] === 'm1_1_1', r.offers);
  ok('接取后进入 active', r.active.indexOf('m1_1_1') >= 0, r.active);
  ok('接取后不再重复出现', r.after.indexOf('m1_1_1') < 0, r.after);
  ok('主线同时只 1 条（第二环被压住）', r.after.indexOf('m1_1_2') < 0, r.after);

  /* ---------------- 2. 进度 ---------------- */
  console.log('\n【2】进度');
  r = await page.evaluate(() => {
    const a = QuestSys.activeOf('m1_1_1');
    for (let i = 0; i < 8; i++) QuestSys.onKill({ tag: 'halfork', kind: 'halfork' });
    return { progress: a.progress.slice(), ready: QuestSys.ready(a), extra: (QuestSys.onKill({ tag: 'halfork' }), a.progress[0]) };
  });
  ok('击杀推进到 8/8', r.progress[0] === 8, r.progress);
  ok('达成后 ready = true', r.ready === true);
  ok('超过上限不溢出', r.extra === 8, r.extra);

  /* ---------------- 3. 复命 ---------------- */
  console.log('\n【3】复命');
  r = await page.evaluate(() => {
    const before = { gold: Game.state.gold, lvl: Game.state.level };
    const a = QuestSys.activeOf('m1_1_1');
    const done = QuestSys.turnIn(a);
    const nx = QuestSys.nextOf(done);
    return {
      done: Game.state.quests.done.slice(),
      active: Game.state.quests.active.map(x => x.id),
      goldUp: Game.state.gold > before.gold,
      nextId: nx ? nx.id : null,
      offers: QuestSys.offersOf('campA_main').map(q => q.id)
    };
  });
  ok('进 done', r.done.indexOf('m1_1_1') >= 0, r.done);
  ok('移出 active', r.active.indexOf('m1_1_1') < 0, r.active);
  ok('发了金币', r.goldUp === true);
  ok('下一环顺延到 m1_1_2', r.nextId === 'm1_1_2', r.nextId);
  ok('掌事手上换成 m1_1_2', r.offers[0] === 'm1_1_2', r.offers);

  /* ---------------- 4. 任务区域 ---------------- */
  console.log('\n【4】任务区域');
  r = await page.evaluate(() => {
    /* m1_1_2 的 zone 是 forest/path —— 先接下来，倍率才会点亮 */
    QuestSys.accept('m1_1_2');
    const on = QuestSys.zoneBoost('forest', 'path');
    const offZone = QuestSys.zoneBoost('forest', 'hall');
    const q = QUESTS.m1_1_2;
    const a = QuestSys.activeOf(q.id);
    QuestSys.turnIn(Object.assign(a, { progress: q.objectives.map(o => o.count) }));
    const after = QuestSys.zoneBoost('forest', 'path');
    return { on: on && on.mult, kinds: on && on.kinds, offZone: offZone, after: after };
  });
  ok('接了任务后该区有倍率', r.on === 1.4, r.on);
  ok('倍率带目标怪种', Array.isArray(r.kinds) && r.kinds.indexOf('bat') >= 0, r.kinds);
  ok('非任务区没有倍率', r.offZone === null, r.offZone);
  ok('复命后倍率立刻熄灭', r.after === null, r.after);

  /* ---------------- 5. reach 目标 ---------------- */
  console.log('\n【5】reach 目标');
  r = await page.evaluate(() => {
    Game.state.quests.done = [];
    QuestSys.accept('s1_1_1');
    const a = QuestSys.activeOf('s1_1_1');
    QuestSys.onZone('forest', 'hall');      /* 不是目标区 */
    const before = a.progress[0];
    QuestSys.onZone('forest', 'east');      /* 目标区 */
    return { before, after: a.progress[0], ready: QuestSys.ready(a) };
  });
  ok('进错区不推进', r.before === 0, r.before);
  ok('进对区推进到 1', r.after === 1, r.after);
  ok('reach 单独达不成整条（还有击杀目标）', r.ready === false);

  /* ---------------- 6. 悬赏板 ---------------- */
  console.log('\n【6】悬赏板');
  r = await page.evaluate(() => {
    Game.state.quests = { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } };
    const list = QuestSys.boardTake(1).map(q => q.id);
    QuestSys.accept(list[0]);
    const a = QuestSys.activeOf(list[0]);
    const q = QUESTS[list[0]];
    QuestSys.turnIn(Object.assign(a, { progress: q.objectives.map(o => o.count) }));
    const cd = Game.state.quests.board.cd[list[0]] || 0;
    const again = QuestSys.boardTake(1).map(x => x.id);
    return { list, cdMin: Math.round((cd - Date.now()) / 60000), again, count: Game.state.quests.board.count[list[0]] };
  });
  ok('一次列 3 条', r.list.length === 3, r.list);
  ok('交完进冷却（≈8 分钟）', r.cdMin >= 7 && r.cdMin <= 8, r.cdMin);
  ok('冷却中不再出现', r.again.indexOf(r.list[0]) < 0, r.again);
  ok('可重复：记完成次数', r.count === 1, r.count);

  /* ---------------- 7. 老档迁移 ---------------- */
  console.log('\n【7】老档迁移 q1~q11 → m*');
  r = await page.evaluate(() => {
    Game.state.quests = {
      active: [{ id: 'q2', progress: [3] }, { id: 'q7', progress: [1, 0] }],
      done: ['q1', 'q3'],
      next: 'q4',
      announced: { q2: true }
    };
    const changed = QuestSys.migrate();
    const q = Game.state.quests;
    return {
      changed,
      done: q.done.slice(),
      active: q.active.map(a => ({ id: a.id, p: a.progress.slice() })),
      next: q.next
    };
  });
  ok('迁移有改动', r.changed === true);
  ok('done 换成新 id', r.done.indexOf('m1_1_1') >= 0 && r.done.indexOf('m1_1_3') >= 0, r.done);
  ok('active 换成新 id', r.active.map(a => a.id).join(',') === 'm1_1_2,m1_3_1', r.active);
  ok('单目标进度原样搬过来', r.active[0].p[0] === 3, r.active[0]);
  ok('双目标进度原样搬过来', r.active[1].p[0] === 1 && r.active[1].p[1] === 0, r.active[1]);
  ok('next 换成新 id', r.next === 'm1_1_4', r.next);

  /* ---------------- 8. 幂等 + 存档结构 ---------------- */
  console.log('\n【8】幂等与存档');
  r = await page.evaluate(() => {
    const again = QuestSys.migrate();
    Game.save();
    const doc = SaveManager.load(SaveManager.activeSlot());
    const q = doc && doc.quests;
    return { again, hasBoard: !!(q && q.board && q.board.cd), doneLen: q ? q.done.length : -1 };
  });
  ok('重复迁移不再改动（幂等）', r.again === false);
  ok('存档带 board 结构', r.hasBoard === true);

  /* ---------------- 9. UI 接线 ---------------- */
  console.log('\n【9】UI 接线');
  r = await page.evaluate(() => {
    Game.state.quests = { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } };
    /* 老村长 = campA_main，点开应该有「接下」按钮 */
    Game.openGiver('elder');
    const dlg = document.getElementById('dialog');
    const dlgOpen = dlg.style.display !== 'none';
    const btns = Array.from(document.querySelectorAll('#dlgBtns .btn')).map(b => b.textContent);
    UI.closeAll();

    QuestSys.accept('m1_1_1');
    UI.renderQuests();
    UI.updateQuestTrack();
    const qList = document.getElementById('questList').textContent;
    const track = document.getElementById('questTrack').textContent;
    const trackShown = document.getElementById('questTrack').style.display;

    /* 悬赏板对话：3 条 + 离开 = 4 个按钮 */
    Game.openBoard(1);
    const boardBtns = Array.from(document.querySelectorAll('#dlgBtns .btn')).map(b => b.textContent);
    const boardText = document.getElementById('dlgText').textContent;
    UI.closeAll();

    return {
      dlgOpen,
      btns, qList, track, trackShown,
      boardBtns, boardHasGold: /金/.test(boardText)
    };
  });
  ok('掌事对话打开', r.dlgOpen === true);
  ok('对话里有「接下」按钮', r.btns.some(b => b.indexOf('接下') >= 0), r.btns);
  ok('任务面板显示任务名', r.qList.indexOf('竹林异动') >= 0, r.qList.slice(0, 60));
  ok('追踪条显示进度', /0\/8/.test(r.track), r.track);
  ok('追踪条可见', r.trackShown === 'block', r.trackShown);
  ok('悬赏板列出 3 条 + 离开', r.boardBtns.length === 4, r.boardBtns);
  ok('悬赏板带赏金', r.boardHasGold === true);

  /* ---------------- 10. 营地发布者 ---------------- */
  console.log('\n【10】营地发布者');
  r = await page.evaluate(() => {
    Game.state.quests = { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } };
    Game.state.level = 25; Game.recalc();
    /* 营地是「仅限已抵达」的严格收口：先打到卷二（进 frost）解锁 campB，
     * 再走营地 —— 这正是玩家真实路径，不是给测试开后门。 */
    Game.travelTo('frost');
    return new Promise(res => setTimeout(() => {
      Game.travelTo('campB');
      /* travelTo 的 loadMap 在 120ms 之后 —— NPC 要等那之后才摆出来，
       * 所以 ids 必须在最终的 setTimeout 里取，不能紧跟 travelTo。 */
      setTimeout(() => {
        const ids = Object.keys(Game.npcs);
        const marked = ids.filter(id => Game.npcs[id].markEx);
        res({
          mapId: Game.state.mapId,
          hasMain: ids.indexOf('campB_main') >= 0,
          hasSide: ids.indexOf('campB_side') >= 0,
          marked,
          npcCount: ids.length,
          camps: (Game.state.camps || []).join(',')
        });
      }, 700);
    }, 700));
  });
  ok('进得了营地 B', r.mapId === 'campB', r.mapId);
  ok('营地有掌事', r.hasMain === true, r.marked);
  ok('营地有录事', r.hasSide === true, r.marked);
  ok('两个发布者都挂了任务标记', r.marked.indexOf('campB_main') >= 0 && r.marked.indexOf('campB_side') >= 0, r.marked);
  ok('营地 NPC 总数 8（原 5 + 掌事 + 录事 + 地脉守）', r.npcCount === 8, r.npcCount);
  ok('抵达卷二后 campB 已解锁', r.camps.indexOf('campB') >= 0, r.camps);

  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + `（${pass} 项）`);
  if (errs.length) { console.log('\n运行时错误：'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  else console.log('ERRORS none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
