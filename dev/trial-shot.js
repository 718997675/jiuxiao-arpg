/* 试炼界面截图（headless）—— 只看画面，不做断言 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']
  .find(p => fs.existsSync(p));
(async () => {
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--window-size=1440,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname,'..','index.html').replace(/\\/g,'/'), {waitUntil:'load'});
  await wait(1500);
  await page.evaluate(()=>{ Game.startNew('warrior','测试者',1,'normal'); });
  await wait(500);
  await page.evaluate(()=>{ Game.state.level=18; Game.state.xpNext=xpToNext(18); Game.recalc(); Game.state.hp=Game.state.stats.hpMax; });
  // 1. 入口面板
  await page.evaluate(()=>{ UI.openTrialPanel(); });
  await wait(400);
  await page.screenshot({ path: path.join(__dirname,'shot-trial-panel.png') });
  // 2. 进场
  await page.evaluate(()=>{ UI.closeAll(); Trial.start(); Trial.spawnWave(); });
  await wait(2200);
  await page.screenshot({ path: path.join(__dirname,'shot-trial-arena.png') });
  // 3. 三选一
  await page.evaluate(()=>{ for(const e of Game.enemies) if(!e.dead) Game.damageEnemy(e,1e12,false,{silent:true}); });
  for (let i=0;i<80;i++){ await wait(150);
    const ph = await page.evaluate(()=>Trial.run?Trial.run.phase:'none');
    if (ph==='choose') break;
    await page.evaluate(()=>{ for(const e of Game.enemies) if(!e.dead) Game.damageEnemy(e,1e12,false,{silent:true}); });
  }
  await page.evaluate(()=>{ Trial.run.offers.slice(); });
  await wait(300);
  await page.screenshot({ path: path.join(__dirname,'shot-trial-bless.png') });
  // 4. 结算
  await page.evaluate(()=>{ Trial.closeBlessOnly && Trial.closeBlessOnly(); UI.closeTrialBless(); });
  await page.evaluate(()=>{ for(let i=0;i<6 && !Game.dead;i++){ Game.invuln=0; Game.damagePlayer(1e12,null); } });
  await wait(900);
  await page.screenshot({ path: path.join(__dirname,'shot-trial-end.png') });
  console.log('errs', errs);
  await browser.close();
})();
