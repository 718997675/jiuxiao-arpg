/* ============================================================
 * 手机端（触屏）技能条截图
 *
 *   node dev/shots-mobile.js [warrior|mage|taoist]
 *
 * 产出：shots/s4-mobile.png —— 3 列宫格里的 5 格技能条（含空位）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const CLS = process.argv[2] || 'warrior';

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 430, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + CLS, { waitUntil: 'load' });
  await wait(2400);

  const R = await p.evaluate(() => {
    const G = Game;
    G.state.level = 40; G.recalc();
    const order = SKILL_ORDER[G.state.cls];
    G.state.skillbar = [order[0], null, order[4], order[6], null];
    G.skillBar();
    UI.buildActionBar();
    Mobile.buildSkills();
    const slots = document.querySelectorAll('#mSkills .mskill');
    return {
      touch: document.body.classList.contains('touch'),
      n: slots.length,
      empty: document.querySelectorAll('#mSkills .mskill.empty').length,
      bar: G.skillBar().slice()
    };
  });
  console.log(JSON.stringify(R));

  await wait(500);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's4-mobile.png') });
  if (errs.length) console.log('页面错误：\n' + errs.slice(0, 4).join('\n'));
  await b.close();
})().catch(e => { console.error('崩溃：', e); process.exit(1); });
