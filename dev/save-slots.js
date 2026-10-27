/* [v1.13.1] 角色位 3 → 10 验收
 *
 *   ① SLOT_COUNT = 10，listSlots() 返回 10 项
 *   ② 存档面板渲染 10 张卡片，序号 壹~拾
 *   ③ 第 10 位能建档、能读回；第 11 位被夹回 1
 *   ④ 老档（1~3 位）内容不受影响
 *   ⑤ 面板内容可滚（10 张卡片不会把新建区顶出可视区）
 *
 * 用法：node dev/save-slots.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

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

  /* ---------- A. 常量与列表 ---------- */
  console.log('【A】角色位常量');
  const a = await p.evaluate(() => ({
    count: SaveManager.SLOT_COUNT,
    list: SaveManager.listSlots().length,
    v10: SaveManager.validSlot(10),
    v11: SaveManager.validSlot(11),
    v0: SaveManager.validSlot(0),
    vNaN: SaveManager.validSlot('abc')
  }));
  console.log(`  SLOT_COUNT=${a.count}  listSlots()=${a.list} 项  validSlot: 10→${a.v10}  11→${a.v11}  0→${a.v0}  'abc'→${a.vNaN}`);
  ok(a.count === 10, `A: SLOT_COUNT 是 ${a.count}，不是 10`);
  ok(a.list === 10, `A: listSlots() 返回 ${a.list} 项`);
  ok(a.v10 === 10, 'A: validSlot(10) 没返回 10');
  ok(a.v11 === 1, 'A: validSlot(11) 没被夹回 1');
  ok(a.v0 === 1, 'A: validSlot(0) 没被夹回 1');
  ok(a.vNaN === 1, 'A: validSlot("abc") 没被夹回 1');

  /* ---------- B. 面板渲染 ---------- */
  console.log('\n【B】存档面板');
  const bp = await p.evaluate(async () => {
    SaveUI.open();
    await new Promise(r => setTimeout(r, 320));
    const cards = [...document.querySelectorAll('#slotList .scard')];
    const idx = cards.map(c => (c.querySelector('.sidx') || {}).textContent);
    const pb = document.querySelector('#savePanel .pb');
    const panel = document.getElementById('savePanel');
    const newBox = document.querySelector('#savePanel .savenew');
    return {
      open: panel.classList.contains('open'),
      cards: cards.length,
      idx,
      empty: cards.filter(c => c.classList.contains('empty')).length,
      scrollable: pb.scrollHeight > pb.clientHeight,
      pbH: Math.round(pb.clientHeight),
      contentH: Math.round(pb.scrollHeight),
      /* 新建区在文档流里，只要 pb 能滚就够得着 */
      newTop: Math.round(newBox.getBoundingClientRect().top - pb.getBoundingClientRect().top),
      panelW: Math.round(panel.getBoundingClientRect().width)
    };
  });
  console.log(`  打开=${bp.open}  卡片 ${bp.cards} 张（空位 ${bp.empty}）  面板宽 ${bp.panelW}px`);
  console.log(`  序号: ${bp.idx.join(' ')}`);
  console.log(`  内容 ${bp.contentH}px / 可视 ${bp.pbH}px  可滚=${bp.scrollable}  新建区距顶 ${bp.newTop}px`);
  ok(bp.open, 'B: 存档面板没打开');
  ok(bp.cards === 10, `B: 面板渲染了 ${bp.cards} 张卡片`);
  ok(bp.idx.join('') === '壹贰叁肆伍陆柒捌玖拾', `B: 序号不对（${bp.idx.join(' ')}）`);
  ok(bp.newTop < bp.contentH, 'B: 新建区落在内容区之外');
  ok(bp.scrollable || bp.contentH <= bp.pbH, 'B: 内容超高却不可滚');

  /* ---------- C. 第 10 位建档 / 读回 ---------- */
  console.log('\n【C】第 10 位建档');
  const c = await p.evaluate(async () => {
    /* 先把 10 号位清干净，避免上一次跑的残留 */
    try { Store.delKey(SaveManager.slotKey(10)); } catch (e) { }
    try { Store.delKey(SaveManager.slotKey(10) + '.tmp'); } catch (e) { }
    try { Store.delKey(SaveManager.slotKey(10) + '.bak'); } catch (e) { }
    const r = SaveManager.createCharacter('taoist', '拾号客', 10);
    const loaded = SaveManager.load(10);
    return {
      ok: !!r.ok, slot: r.slot,
      name: loaded ? loaded.name : null,
      cls: loaded ? loaded.cls : null,
      lv: loaded ? loaded.level : null
    };
  });
  console.log(`  建档=${c.ok} 落在第 ${c.slot} 位  读回：${c.name} / ${c.cls} / ${c.lv} 级`);
  ok(c.ok && c.slot === 10, `C: 第 10 位建档失败（slot=${c.slot}）`);
  ok(c.name === '拾号客' && c.cls === 'taoist', 'C: 第 10 位读回的内容不对');

  /* ---------- D. 老档不受影响 ---------- */
  console.log('\n【D】老档（1~3 位）');
  const d = await p.evaluate(async () => {
    const out = [];
    for (const n of [1, 2, 3]) {
      const s = SaveManager.load(n);
      out.push({ n, has: !!s, name: s ? s.name : null, lv: s ? s.level : null });
    }
    return { out, active: SaveManager.activeSlot() };
  });
  d.out.forEach(x => console.log(`  位 ${x.n}: ${x.has ? x.name + ' ' + x.lv + ' 级' : '空'}`));
  ok(d.out[0].has, 'D: 1 号位的老档丢了');
  ok(d.active >= 1 && d.active <= 10, `D: 当前位 ${d.active} 越界`);

  /* ---------- E. 面板重绘后仍 10 张 ---------- */
  console.log('\n【E】建完档后重绘');
  const e = await p.evaluate(async () => {
    SaveUI.render();
    await new Promise(r => setTimeout(r, 120));
    const cards = [...document.querySelectorAll('#slotList .scard')];
    const ten = cards[9];
    return {
      n: cards.length,
      tenFilled: ten ? !ten.classList.contains('empty') : false,
      tenName: ten ? (ten.querySelector('.sname') || {}).textContent : null
    };
  });
  console.log(`  卡片 ${e.n} 张  第 10 位已填=${e.tenFilled}  名字「${e.tenName}」`);
  ok(e.n === 10, `E: 重绘后卡片变成 ${e.n} 张`);
  ok(e.tenFilled, 'E: 第 10 位建档后卡片仍显示空位');
  ok(e.tenName && e.tenName.indexOf('拾号客') === 0, 'E: 第 10 位卡片名字不对');

  /* 截图 */
  await p.evaluate(() => { SaveUI.render(); document.querySelector('#savePanel .pb').scrollTop = 0; });
  await wait(260);
  await p.screenshot({ path: 'shots/v1131-save-10slots.png' });
  console.log('\n  截图 shots/v1131-save-10slots.png');

  console.log('\n报错数:', errs.length, errs.slice(0, 3));
  ok(errs.length === 0, 'X: 页面有 JS 报错');
  console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ 角色位 10 验收全部通过');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
