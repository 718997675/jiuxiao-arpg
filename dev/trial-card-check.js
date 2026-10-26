/* 三选一卡片文本核对：带真实装备，验证「当前 → 选后」是否对得上 */
const puppeteer = require('puppeteer-core');
const path = require('path'), fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']
  .find(p => fs.existsSync(p));
(async () => {
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--window-size=1440,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname,'..','index.html').replace(/\\/g,'/'), {waitUntil:'load'});
  await wait(1200);
  await page.evaluate(() => {
    Game.startNew('warrior','测试者',1,'normal');
    Game.state.level = 24; Game.state.xpNext = xpToNext(24);
    /* 塞几件真装备，让面板上确实有 atkPct / crit / lifesteal 这些值 */
    for (let i = 0; i < 6; i++) {
      const it = rollItem(24, { cls: 'warrior', rarity: i < 3 ? 'legendary' : 'rare', noRelic: true });
      if (it) Game.addItem(it);
    }
    Game.recalc();
    if (Game.state.items) for (const it of Game.state.items) { try { Game.equipItem(it.uid); } catch (e) {} }
    Game.recalc();
    Game.state.hp = Game.state.stats.hpMax;
  });
  const info = await page.evaluate(() => {
    const s = Game.state.stats;
    return { atkPct: s.raw.atkPct, crit: s.crit, lifesteal: s.raw.lifesteal, atk: s.atk, hpMax: s.hpMax };
  });
  console.log('面板抽样', JSON.stringify(info));
  const cards = await page.evaluate(() => {
    Trial.start();
    Trial.run.phase = 'choose';
    const offers = trialRollBlessings(3, 1, {});
    UI.openTrialBless(offers, 1);
    return [...document.querySelectorAll('.tcard')].map(c => ({
      name: c.querySelector('.tc-name').textContent,
      cat: c.querySelector('.tc-cat').textContent,
      desc: c.querySelector('.tc-desc').textContent,
      stats: [...c.querySelectorAll('.tc-stat')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
      cur: c.querySelector('.tc-cur').textContent.replace(/\s+/g, ' ').trim()
    }));
  });
  for (const c of cards) console.log(`[${c.cat}] ${c.name} — ${c.desc}\n    ${c.stats.join('\n    ')}\n    ${c.cur}`);
  await page.screenshot({ path: path.join(__dirname,'shot-trial-bless2.png') });
  console.log('errs', errs);
  await browser.close();
})();
