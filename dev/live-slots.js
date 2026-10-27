/* [v1.13.1] 线上校验：角色位 10 是否真的发上去了
 *
 * GitHub Pages 有 CDN 缓存，所以带 ?t= 时间戳绕开。
 * 只看四件事：
 *   ① SLOT_COUNT === 10，listSlots() 10 项
 *   ② 开始界面「存档」面板渲染 10 张卡片，序号 壹~拾
 *   ③ 标题界面文案说的是「十个角色位」
 *   ④ 控制台 0 error
 *
 * 用法：node dev/live-slots.js
 */
const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();

let pass = 0, fail = 0;
const ok = (c, label, extra) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra).slice(0, 300))); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  console.log('HTTP:', resp.status());
  await wait(2500);

  /* ---------- 一、常量 ---------- */
  console.log('\n一、线上常量');
  const c = await page.evaluate(() => ({
    n: SaveManager.SLOT_COUNT,
    list: SaveManager.listSlots().length,
    hint: (document.getElementById('start') || {}).innerText || ''
  }));
  ok(c.n === 10, `SLOT_COUNT = ${c.n}`);
  ok(c.list === 10, `listSlots() = ${c.list} 项`);
  ok(/十个角色位/.test(c.hint), '标题界面写的是「十个角色位」', c.hint.slice(0, 120));

  /* ---------- 二、存档面板 ---------- */
  console.log('\n二、开始界面存档面板');
  await page.click('#saveMgrBtn');
  await wait(500);
  const p = await page.evaluate(() => {
    const el = document.getElementById('savePanel');
    return {
      open: el.classList.contains('open'),
      cards: document.querySelectorAll('#savePanel .scard').length,
      idx: [...document.querySelectorAll('#savePanel .scard .sidx')].map(e => e.textContent.trim()).join(''),
      text: document.getElementById('slotList').innerText.replace(/\s+/g, ' ').slice(0, 80)
    };
  });
  ok(p.open, '面板已打开');
  ok(p.cards === 10, `卡片 ${p.cards} 张`);
  ok(p.idx === '壹贰叁肆伍陆柒捌玖拾', `序号 ${p.idx}`);
  await page.screenshot({ path: 'shots/v1131-live-10slots.png' });

  /* ---------- 三、控制台 ---------- */
  console.log('\n三、控制台');
  ok(errs.length === 0, `0 error（实际 ${errs.length}）`);
  if (errs.length) errs.slice(0, 5).forEach(e => console.log('     ' + e));

  await browser.close();
  console.log('\n' + '='.repeat(46));
  console.log(fail ? `❌ ${pass} 通过 / ${fail} 失败` : `✅ 线上校验全部通过（${pass} 项）`);
  process.exit(fail ? 1 : 0);
})();
