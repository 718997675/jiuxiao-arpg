#!/usr/bin/env node
/* ============================================================
 * [P08] 任务奖励提前可见 · 真机验收
 *
 *   node dev/probe-p08.js
 *
 * 契约（test-p08）判的是「组件在、三处都调了、文案没撒谎」；
 * 这一份判的是**最硬的那条**：对话里写的数字，和交任务实际给的一致。
 *
 * 量六件事：
 *   一、全表扫：每一条任务的奖励都能渲染出来，且六个字段一个不漏
 *   二、接取对话真的把奖励挂上去了（`#dlgReward` 非空）
 *   三、真交一条：金 / 天赋点 / 装备 / 经验逐项与预览一致
 *   四、不传奖励时奖励条必须是空的（否则上一条对话的奖励会粘过来）
 *   五、山海志任务卡里也有奖励
 *   六、零报错
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');

const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 20; Game.recalc();
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;
    Game.invuln = 9999;
  });
  await wait(300);

  /* ---------- 一、全表扫 ---------- */
  console.log('一、全表扫：每条任务的奖励都渲染得出来');
  const scan = await page.evaluate(() => {
    const box = document.createElement('div');
    box.style.position = 'absolute'; box.style.left = '-9999px';
    document.body.appendChild(box);
    const bad = [], empty = [];
    let n = 0;
    for (const id in QUESTS) {
      const r = QUESTS[id].rewards;
      if (!r) { empty.push(id); continue; }
      box.innerHTML = UI.renderRewards(r);
      const t = box.textContent.replace(/\s+/g, '');
      n++;
      const miss = [];
      if (r.xp && t.indexOf(String(r.xp) + '经验') < 0) miss.push('xp');
      if (r.gold && t.indexOf(String(r.gold) + '金') < 0) miss.push('gold');
      if (r.rarity && t.indexOf(RARITY[r.rarity].name) < 0) miss.push('rarity');
      if (r.ilvl && t.indexOf('ilv' + r.ilvl) < 0) miss.push('ilvl');
      if (r.skill && SKILLS[r.skill] && t.indexOf(SKILLS[r.skill].name) < 0) miss.push('skill');
      if (r.talent && t.indexOf('+' + r.talent) < 0) miss.push('talent');
      if (miss.length) bad.push({ id: id, miss: miss, txt: t.slice(0, 60) });
      if (!t.length) bad.push({ id: id, miss: ['全空'] });
    }
    box.remove();
    return { n: n, bad: bad.slice(0, 5), badN: bad.length, empty: empty.length, total: Object.keys(QUESTS).length };
  });
  ok(scan.total > 40, '（前置）任务表至少 40 条', scan.total);
  ok(scan.badN === 0, '每一条任务的奖励都必须渲染完整（缺字段 = 玩家看到不完整的报酬）', scan.bad);
  ok(scan.n > 40, '至少 40 条任务带奖励', scan.n);

  /* ---------- 二、接取对话真的挂上了 ---------- */
  console.log('二、接取对话：#dlgReward 非空');
  const dlg = await page.evaluate(() => {
    /* 清空进度，保证第一个发布者有 offer */
    Game.state.quests = { active: [], done: [], board: { count: {}, cd: {} }, announced: {} };
    if (QuestSys && QuestSys.ensure) QuestSys.ensure();
    const npcIds = Object.keys(NPCS || {});
    let hit = null;
    for (const nid of npcIds) {
      try {
        Game.openGiver(nid);
        const el = document.getElementById('dlgReward');
        const t = (el && el.textContent || '').replace(/\s+/g, '');
        if (t.length) { hit = { npc: nid, txt: t.slice(0, 90), html: (el.innerHTML || '').slice(0, 60) }; break; }
      } catch (e) { /* 有的 NPC 不是发布者 */ }
    }
    UI.closeAll();
    return hit;
  });
  ok(!!dlg, '至少有一个发布者的接取对话带上了奖励', dlg);
  if (dlg) {
    ok(dlg.txt.indexOf('奖励') >= 0, '奖励条必须写「奖励」两个字', dlg.txt);
    ok(/rw-/.test(dlg.html), '奖励必须用 rw-* 样式（品质色靠它）', dlg.html);
  }

  /* ---------- 三、真交一条：逐项比对 ---------- */
  console.log('三、真交一条：预览 vs 实际到手');
  const real = await page.evaluate(() => {
    /* 挑一条**当前真的能接**的、带装备奖励的任务。
     * 不能只按「有 gold + talent + ilvl」挑：主线后面几章的 require 没完成时
     * `canOffer` 直接 false，`accept` 返回 false，探针会误判成「交不掉」。 */
    let pick = null;
    for (const id in QUESTS) {
      const qq = QUESTS[id], rr = qq.rewards || {};
      if (!rr.ilvl) continue;
      if (!QuestSys.canOffer(qq)) continue;
      pick = id; break;
    }
    if (!pick) return { none: true };
    const q = QUESTS[pick];

    /* 造一个「已接、目标全达成」的 active 记录。
     * 注意 `QuestSys.accept()` 返回的是 **true / false**，不是记录 ——
     * 记录要从 `state.quests.active` 里取（第一次跑就栽在这）。 */
    Game.state.quests = { active: [], done: [], board: { count: {}, cd: {} }, announced: {} };
    QuestSys.ensure();
    if (!QuestSys.accept(pick)) return { acceptFail: true, pick: pick };
    const a = (Game.state.quests.active || []).filter(x => x.id === pick)[0];
    if (!a) return { acceptFail: true, pick: pick, why: 'active 里找不到' };
    /* 直接把进度写满（不真的去杀怪） */
    QuestSys.lines(a).forEach((o, i) => { a.progress[i] = o.count; });

    /* 预览文本 */
    const box = document.createElement('div');
    box.innerHTML = UI.renderRewards(q.rewards);
    const preview = box.textContent.replace(/\s+/g, '');

    const g0 = Game.state.gold;
    const t0 = Game.state.talentBonus || 0;
    const bag0 = Game.state.inventory.length;
    Game.state.inventory.length = 0;        // 空包，保证装备能进
    let xpGot = 0;
    const oldXp = Game.gainXp;
    Game.gainXp = function (v) { xpGot += v; return oldXp.apply(this, arguments); };

    const done = QuestSys.turnIn(a);
    Game.gainXp = oldXp;

    return {
      pick: pick,
      preview: preview,
      goldDelta: Game.state.gold - g0,
      talentDelta: (Game.state.talentBonus || 0) - t0,
      bagDelta: Game.state.inventory.length,
      xpGot: xpGot,
      want: q.rewards,
      turned: !!done
    };
  });
  ok(!real.none, '（前置）必须能找到一条带 gold + talent + ilvl 的任务');
  ok(real.turned, '（前置）任务必须真的交掉', real.pick);
  if (real.want) {
    const W = real.want, P = real.preview || '';
    ok(W.gold ? P.indexOf(W.gold + '金') >= 0 : true, '预览里的金币数必须与数据一致', W.gold);
    ok(real.goldDelta === W.gold, '实际到手的金币必须与预览一致', { preview: W.gold, real: real.goldDelta });
    ok(real.talentDelta === (W.talent || 0), '实际到手的天赋点必须与预览一致', { preview: W.talent, real: real.talentDelta });
    ok(real.bagDelta >= (W.ilvl ? 1 : 0), '预览说有装备，实际就得进包', { preview: W.ilvl, bag: real.bagDelta });
    ok(real.xpGot === (W.xp || 0), '实际拿到的经验必须与预览一致', { preview: W.xp, real: real.xpGot });
  }

  /* ---------- 四、不传奖励时必须清空 ---------- */
  console.log('四、不传奖励：奖励条必须是空的');
  const clean = await page.evaluate(() => {
    UI.showDialog('测试', '正文', [{ label: '好', action: () => { } }], '<div class="rw-line">奖励 999 金</div>');
    const withR = (document.getElementById('dlgReward').textContent || '').trim();
    UI.showDialog('测试', '正文', [{ label: '好', action: () => { } }]);
    const without = (document.getElementById('dlgReward').textContent || '').trim();
    const hidden = getComputedStyle(document.getElementById('dlgReward')).display;
    UI.closeAll();
    return { withR: withR.length, without: without.length, display: hidden };
  });
  ok(clean.withR > 0, '（前置）传了奖励就该有内容');
  ok(clean.without === 0, '不传奖励必须清空 —— 否则上一条对话的奖励会粘在下一条上', clean);
  ok(clean.display === 'none', '空奖励条必须不可见（:empty 规则）', clean.display);

  /* ---------- 五、山海志任务卡 ---------- */
  console.log('五、山海志任务卡里也有奖励');
  const card = await page.evaluate(() => {
    /* 接一条，让山海志有卡 */
    Game.state.quests = { active: [], done: [], board: { count: {}, cd: {} }, announced: {} };
    QuestSys.ensure();
    let picked = null;
    for (const id in QUESTS) {
      const a = QuestSys.accept(id);
      if (a) { picked = id; break; }
    }
    UI.renderQuests();
    const html = document.getElementById('questList').innerHTML;
    const txt = document.getElementById('questList').textContent.replace(/\s+/g, '');
    return { picked: picked, hasRw: /rw-line/.test(html), hasWord: txt.indexOf('奖励') >= 0, txt: txt.slice(0, 80) };
  });
  ok(!!card.picked, '（前置）必须能接上一条任务');
  ok(card.hasRw, '山海志任务卡必须带奖励条');
  ok(card.hasWord, '任务卡里的奖励必须写「奖励」', card.txt);

  /* ---------- 六、零报错 ---------- */
  console.log('六、零报错');
  const finalErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok(finalErrs.length === 0, '控制台不许有 pageerror / console.error', finalErrs.slice(0, 4));

  console.log('\n================================');
  console.log('  P08 奖励预览真机：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
