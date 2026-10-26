/* 试炼 UI 手机端溢出检查（竖屏 390×844 / 横屏 844×390） */
const puppeteer = require('puppeteer-core');
const path = require('path'), fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']
  .find(p => fs.existsSync(p));
(async () => {
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.resolve(__dirname,'..','index.html').replace(/\\/g,'/'), {waitUntil:'load'});
    await wait(1200);
    await page.evaluate(() => { Game.startNew('warrior','M',1,'normal'); Game.state.level = 18; Game.state.xpNext = xpToNext(18); Game.recalc(); });
    /* 三选一 */
    await page.evaluate(() => { Trial.start(); Trial.run.phase = 'choose'; UI.openTrialBless(trialRollBlessings(3, 1, {}), 1); });
    await wait(400);
    const bless = await page.evaluate(() => {
      const r = document.getElementById('trialBless').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.tcard')].map(c => c.getBoundingClientRect());
      return {
        vw: innerWidth, vh: innerHeight,
        cardsBottom: Math.round(Math.max(...cards.map(c => c.bottom))),
        cardsTop: Math.round(Math.min(...cards.map(c => c.top))),
        overflowX: Math.round(Math.max(...cards.map(c => c.right))) > innerWidth,
        scrollH: document.getElementById('trialBless').scrollHeight,
        clientH: document.getElementById('trialBless').clientHeight
      };
    });
    await page.screenshot({ path: path.join(__dirname, `shot-trial-bless-${tag}.png`) });
    /* HUD */
    await page.evaluate(() => { UI.closeTrialBless(); UI.renderTrialHud(true); });
    await wait(300);
    const hud = await page.evaluate(() => {
      const r = document.getElementById('trialHud').getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               right: Math.round(r.right), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
    });
    await page.screenshot({ path: path.join(__dirname, `shot-trial-hud-${tag}.png`) });
    /* 结算 */
    await page.evaluate(() => { UI.showTrialEnd({ wave: 12, best: 12, kills: 88, items: 4, gold: 960, level: 20, secs: 512, isBest: true, reason: 'death' }); });
    await wait(300);
    const end = await page.evaluate(() => {
      const el = document.getElementById('trialEnd');
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
               scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    await page.screenshot({ path: path.join(__dirname, `shot-trial-end-${tag}.png`) });
    console.log(tag, JSON.stringify({ bless, hud, end, errs }));
    await page.close();
  }
  await browser.close();
})();
