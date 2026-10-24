/* ============================================================
 * 机制说明页（菜单第 10 页）探测
 *
 *   node dev/probe-help.js
 *
 * 布局：左边竖排页签切换分节，右边只显示当前这一节。
 * 检查：
 *   · 菜单页签「说 明」存在且能点开
 *   · 左侧页签数量 = 分节数，逐个点开都有内容
 *   · 说明里的数字与数据表一致（不是写死的）
 *   · 内容不溢出
 * 产出截图 shots/probe-help.png（第 1 节）+ shots/probe-help-3.png（装备节）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '  →  ' + e : '')); } };

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(ROOT, 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);
  await p.evaluate(() => { Game.startNew('warrior', '青崖客', 0, '普通'); });
  await wait(1200);

  const r = await p.evaluate(async () => {
    UI.openMenu('help');
    await new Promise(r => setTimeout(r, 400));
    const body = document.getElementById('helpBody');
    const nav = document.getElementById('hpNav');
    const tabs = [...nav.querySelectorAll('.hp-tab')];
    const out = {
      tabExists: !!document.querySelector('[data-mtab="help"]'),
      tabOn: (() => { const t = document.querySelector('[data-mtab="help"]'); return t ? t.classList.contains('on') : false; })(),
      tabCount: tabs.length,
      names: tabs.map(t => t.textContent.replace(/^\d+/, '').trim()),
      /* 逐个点开，收集每一节的内容长度与标题 */
      perTab: []
    };
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].click();
      await new Promise(r => setTimeout(r, 90));
      const bd = document.getElementById('helpBody');
      /* 行与行之间不能有裸分隔符：sec() 的 body 传数组时若直接插值，
       * 会被 Array.toString 拼成「行,行」，那个逗号在 flex 布局里会单独占一行。 */
      const bare = (bd.innerText || '').split('\n').filter(l => /^\s*[,，、]\s*$/.test(l)).length;
      out.perTab.push({
        i,
        len: bd.textContent.trim().length,
        secs: bd.querySelectorAll('.hp-sec').length,
        rows: bd.querySelectorAll('.hp-row').length,
        on: document.querySelectorAll('#hpNav .hp-tab.on').length,
        bareSep: bare
      });
    }
    /* 全量文本：把每节都点一遍后再拼 */
    const all = [];
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].click();
      await new Promise(r => setTimeout(r, 70));
      all.push(document.getElementById('helpBody').textContent);
    }
    const txt = all.join(' ');
    out.allLen = txt.length;
    out.hasSlot = /头盔/.test(txt) && /命格/.test(txt);
    out.hasTier = /凡兵/.test(txt) && /太初/.test(txt);
    out.hasMech = /流血/.test(txt) && /回响/.test(txt);
    out.hasDiff = /新手/.test(txt) && /普通/.test(txt);
    /* [UNIQUE] 传世专节：件数 / 特性数 / 「不入八阶」都要写到 */
    out.hasUni = /传世名器/.test(txt) && /不入八阶/.test(txt) && /特性唯一/.test(txt);
    out.uniNum = {
      item: txt.indexOf(String(UNIQUE_ITEMS.length) + ' 件') >= 0,
      trait: txt.indexOf(String(Object.keys(UNIQUE_TRAITS).length) + ' 条独有特性') >= 0
    };
    out.numOk = {
      aff: txt.indexOf(String(AFFIXES.length) + ' 条') >= 0,
      set: txt.indexOf(String(Object.keys(SETS).length) + ' 套') >= 0,
      skill: txt.indexOf(String(Object.keys(SKILLS).length) + ' 个') >= 0,
      talent: txt.indexOf(String(Object.keys(TALENT_NODES).length) + ' 个') >= 0,
      elite: txt.indexOf(String(Object.keys(ELITE_AFFIXES).length) + ' 条') >= 0
    };
    out.data = {
      aff: AFFIXES.length, set: Object.keys(SETS).length, skill: Object.keys(SKILLS).length,
      talent: Object.keys(TALENT_NODES).length, elite: Object.keys(ELITE_AFFIXES).length,
      uni: UNIQUE_ITEMS.length, trait: Object.keys(UNIQUE_TRAITS).length
    };
    const bd = document.getElementById('helpBody');
    out.overflowX = Math.round(bd.scrollWidth - bd.clientWidth);
    /* 回到第 1 节做截图 */
    tabs[0].click();
    await new Promise(r => setTimeout(r, 150));
    return out;
  });

  ok(r.tabExists, '菜单里有「说 明」页签');
  ok(r.tabOn, '点开后页签高亮');
  ok(r.tabCount >= 10, '左侧至少 10 个分节页签', r.tabCount);
  ok(r.names.every(n => n.length > 0 && n.length <= 8), '页签名都是短名', JSON.stringify(r.names));
  ok(r.perTab.every(t => t.secs === 1), '每次只渲染当前这一节', JSON.stringify(r.perTab.map(t => t.secs)));
  ok(r.perTab.every(t => t.len > 60), '每一节都有内容', JSON.stringify(r.perTab.map(t => t.len)));
  ok(r.perTab.every(t => t.rows >= 2), '每一节至少 2 条说明行', JSON.stringify(r.perTab.map(t => t.rows)));
  ok(r.perTab.every(t => t.on === 1), '同时只有一个页签高亮');
  ok(r.perTab.every(t => (t.bareSep || 0) === 0), '没有独占一行的裸分隔符',
    JSON.stringify(r.perTab.map(t => t.bareSep)));
  ok(r.hasSlot, '槽位说明含头盔 / 命格');
  ok(r.hasTier, '基底八阶说明含凡兵 / 太初');
  ok(r.hasMech, '机制说明含流血 / 回响');
  ok(r.hasDiff, '难度说明含新手 / 普通');
  ok(r.hasUni, '传世专节含「不入八阶 / 特性唯一」');
  ok(r.uniNum.item, '传世件数与数据表一致', r.data.uni);
  ok(r.uniNum.trait, '传世特性数与数据表一致', r.data.trait);
  ok(r.numOk.aff, '词缀条数与数据表一致', r.data.aff);
  ok(r.numOk.set, '套装套数与数据表一致', r.data.set);
  ok(r.numOk.skill, '技能个数与数据表一致', r.data.skill);
  ok(r.numOk.talent, '天赋节点数与数据表一致', r.data.talent);
  ok(r.numOk.elite, '精英词缀条数与数据表一致', r.data.elite);
  ok(r.overflowX <= 1, '内容没有横向溢出', r.overflowX);
  ok(errs.length === 0, '无页面报错', errs.slice(0, 3).join(' | '));

  console.log('分节：', r.names.join(' / '));
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-help.png') });
  await p.evaluate(async () => {
    const tabs = [...document.querySelectorAll('#hpNav .hp-tab')];
    if (tabs[2]) tabs[2].click();
    await new Promise(r => setTimeout(r, 200));
  });
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-help-3.png') });

  console.log('\n' + (fail === 0 ? '✓ 全部通过' : '✗ 有失败项') + `  ${pass} pass / ${fail} fail`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
