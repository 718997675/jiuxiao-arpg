/* ============================================================
 * 技能 P0b 真机探针：面板 / 说明页的「新版技能位」只读展示
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-arch.js
 *
 * 检查：
 *   1. 术法面板里那块预览存在且默认折叠，展开是 5 张卡、每张 6 条台阶
 *   2. 三职业各显示各的 5 个位（刀客兵形 / 法师法相 / 道士召灵兽），⑤ 不可互换
 *   3. 说明页第七节有两行新内容，且职业标签齐全
 *   4. 全程零控制台报错（新增 CSS/DOM 不许把面板搞崩）
 *   5. 面板操作没被影响：展开预览后仍能正常加点（点一下树上节点）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 180)));
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1200);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);

  /* ---------------- 1. 面板里的预览 ---------------- */
  await p.evaluate(() => {
    /* 直接开面板（和按 K 走同一条渲染路径） */
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
  });
  await wait(500);

  const box = await p.evaluate(() => {
    const d = document.querySelector('#skList .sk-arch');
    const list = document.querySelectorAll('#skList .sk-ac');
    return {
      exists: !!d,
      open: d ? d.open : null,
      cards: list.length,
      steps: Array.from(list).map(c => c.querySelectorAll('.sk-as').length),
      titles: Array.from(list).map(c => (c.querySelector('.sk-ac-title') || {}).textContent || ''),
      keys: Array.from(list).map(c => (c.querySelector('.sk-ac-key') || {}).textContent || ''),
      slots: Array.from(list).map(c => (c.querySelector('.sk-ac-slot') || {}).textContent || ''),
      summary: d ? d.querySelector('summary').textContent.slice(0, 40) : ''
    };
  });
  console.log('面板预览:', JSON.stringify(box));
  ok(box.exists, '面板里必须有新版技能位预览块');
  ok(box.open === false, '默认必须是折叠的（不抢技能树的版面）', box.open);
  ok(box.cards === 5, '展开后应有 5 张卡', box.cards);
  ok(box.steps.every(n => n === 6), '每张卡 6 条台阶（1/3/5/7/9/10）', box.steps.join(','));
  ok(box.keys.join('/') === '左键/1/2/3/4', '键位必须是 左键 + 1~4', box.keys.join('/'));
  ok(box.slots[4] === '职业核心', '第 5 张卡是职业核心', box.slots[4]);
  ok(box.titles[4] === '兵形', '刀客 ⑤ 应该是兵形', box.titles[4]);
  ok(/5 格预览/.test(box.summary), '折叠条上要写明这是预览', box.summary);

  /* 展开：5 张卡应在一行（桌面 1440），高度一致，不许叠在一起 */
  const layout = await p.evaluate(() => {
    const d = document.querySelector('#skList .sk-arch');
    d.open = true;
    const cards = Array.from(document.querySelectorAll('#skList .sk-ac'));
    const tops = cards.map(c => Math.round(c.getBoundingClientRect().top));
    const ws = cards.map(c => Math.round(c.getBoundingClientRect().width));
    const rects = cards.map(c => c.getBoundingClientRect());
    let overlap = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
    }
    return { tops, ws, overlap, h: Math.round(d.getBoundingClientRect().height) };
  });
  console.log('展开布局:', JSON.stringify(layout));
  ok(new Set(layout.tops).size === 1, '5 张卡必须在同一行', layout.tops.join(','));
  ok(layout.ws.every(w => w > 80), '每张卡都要有可用宽度', layout.ws.join(','));
  ok(layout.overlap === 0, '卡片之间不许重叠', layout.overlap);
  ok(layout.h > 100, '展开后高度要撑开（不是空壳）', layout.h);
  await p.screenshot({ path: '/tmp/skill-arch-panel.png', clip: { x: 0, y: 0, width: 1440, height: 620 } });

  /* ---------------- 2. 换职业：⑤ 不可互换 ---------------- */
  const mageCard = await p.evaluate(() => {
    Game.startNew('mage', '测试');
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const c = document.querySelectorAll('#skList .sk-ac');
    return { n: c.length, t5: (c[4].querySelector('.sk-ac-title') || {}).textContent };
  });
  ok(mageCard.n === 5 && mageCard.t5 === '元素法相', '法师 ⑤ 应该是元素法相', JSON.stringify(mageCard));

  const taoCard = await p.evaluate(() => {
    Game.startNew('taoist', '测试');
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const c = document.querySelectorAll('#skList .sk-ac');
    return { n: c.length, t5: (c[4].querySelector('.sk-ac-title') || {}).textContent };
  });
  ok(taoCard.n === 5 && taoCard.t5 === '召灵兽', '道士 ⑤ 应该是召灵兽', JSON.stringify(taoCard));

  /* 道士这张要带「不是宠物」的注记（数据里 note 字段） */
  const taoNote = await p.evaluate(() => {
    const c = document.querySelectorAll('#skList .sk-ac')[4];
    return (c.querySelector('.sk-ac-foot') || {}).textContent || '';
  });
  ok(/召唤/.test(taoNote), '道士 ⑤ 脚注要说明是召唤', taoNote);

  /* ---------------- 3. 说明页 ---------------- */
  const help = await p.evaluate(() => {
    /* 说明页是页签式的：只有当前那一节在 DOM 里，先切到「术法」那一节 */
    document.getElementById('helpPanel').classList.add('open');
    UI.renderHelp();
    const tabs = Array.from(document.querySelectorAll('#hpNav .hp-tab'));
    const idx = tabs.findIndex(t => /术法/.test(t.textContent));
    if (idx >= 0) { UI.hpTab = idx; UI.renderHelp(); }
    const body = document.getElementById('helpBody');
    const txt = body ? body.textContent : '';
    return {
      tab: idx,
      hasArch: txt.indexOf('新版预览') >= 0,
      hasTier: txt.indexOf('等级台阶') >= 0,
      hasSlots: txt.indexOf('左键·基础攻击') >= 0,
      hasFifth: txt.indexOf('兵形') >= 0 && txt.indexOf('元素法相') >= 0 && txt.indexOf('召灵兽') >= 0,
      hasMul: txt.indexOf('2.02') >= 0,
      hasClassTags: txt.indexOf('刀客') >= 0 && txt.indexOf('法师') >= 0 && txt.indexOf('道士') >= 0
    };
  });
  console.log('说明页:', JSON.stringify(help));
  ok(help.tab >= 0, '说明页里要能找到「术法」页签', help.tab);
  ok(help.hasArch, '说明页要有「技能位（新版预览）」');
  ok(help.hasTier, '说明页要有「等级台阶（新版预览）」');
  ok(help.hasSlots, '说明页要按数据列出 5 个键位');
  ok(help.hasFifth, '说明页要写出三职业的 ⑤ 号位');
  ok(help.hasMul, '说明页要写出 20 级倍率 2.02');
  ok(help.hasClassTags, '说明页要按数据列出三职业的技能位');
  await p.screenshot({ path: '/tmp/skill-arch-help.png', clip: { x: 0, y: 0, width: 1440, height: 700 } });

  /* ---------------- 4. 加点没被影响 ---------------- */
  const stillWorks = await p.evaluate(async () => {
    document.getElementById('helpPanel').classList.remove('open');
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const before = Game.skillPoints();
    const sid = (SKILL_ORDER[Game.state.cls] || [])[0];
    const lv0 = Game.state.skills[sid] ? (Game.state.skills[sid].lv || 1) : 1;
    Game.levelUpSkill(sid);
    const lv1 = Game.state.skills[sid] ? (Game.state.skills[sid].lv || 1) : 1;
    return { sid: sid, lv0: lv0, lv1: lv1, pts0: before, pts1: Game.skillPoints() };
  });
  console.log('加点:', JSON.stringify(stillWorks));
  ok(stillWorks.lv1 === stillWorks.lv0 + 1, '面板上的加点仍然生效', JSON.stringify(stillWorks));
  ok(stillWorks.pts1 === stillWorks.pts0 - 1, '加点仍然扣点', JSON.stringify(stillWorks));

  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  console.log('控制台错误:', realErrs.length ? realErrs.slice(0, 4) : '无');
  ok(realErrs.length === 0, '不许有控制台报错', realErrs.slice(0, 2).join(' | '));

  /* ---------------- 5. 手机：两列、不重叠 ---------------- */
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await wait(900);
  /* 视口切到移动端时页面可能整个重载（回到标题页）—— 那样 Game.state 是空的，
   * 面板渲染会直接 return，量出来就是「空的 #skList」。先确保在局内。 */
  await p.evaluate(() => {
    if (typeof Game === 'undefined' || !Game.state) {
      const b = document.getElementById('startBtn');
      if (b) b.click();
    }
  });
  await wait(1800);
  await p.evaluate(() => {
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
  });
  /* 视口变化会触发一次延迟重排，等它落定再量，否则量到的是被换掉的旧节点 */
  await wait(500);
  const mob = await p.evaluate(() => {
    const d = document.querySelector('.sk-arch');
    if (!d) return { exists: false, html: (document.getElementById('skList') || {}).innerHTML ? 'has-list' : 'empty' };
    d.open = true;
    const cards = Array.from(document.querySelectorAll('.sk-ac'));
    const rects = cards.map(c => c.getBoundingClientRect());
    let overlap = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
    }
    return {
      exists: true,
      cards: cards.length,
      cols: new Set(rects.map(r => Math.round(r.left))).size,
      overlap: overlap,
      minW: Math.round(Math.min(...rects.map(r => r.width)))
    };
  });
  console.log('手机布局:', JSON.stringify(mob));
  ok(mob.exists && mob.cards === 5, '手机上预览块也要在', JSON.stringify(mob));
  ok(mob.overlap === 0, '手机上卡片不许重叠', mob.overlap);
  ok(mob.cols === 2, '手机上应是两列（放不下就换行）', mob.cols);
  ok(mob.minW > 120, '手机上每张卡要有可用宽度', mob.minW);
  await p.screenshot({ path: '/tmp/skill-arch-mobile.png', clip: { x: 0, y: 0, width: 390, height: 844 } });

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P0b 真机探针：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
