/* ============================================================
 * 截图：30 件法器图标总览（v1.3.0）
 *
 *   node dev/shots-relics.js
 *
 * 产出：
 *   shots/relic-icons.png  30 枚图标按职业分三组，附名号
 *   shots/relic-doll.png   纸娃娃实物效果（法器位 + 行囊）
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => fs.existsSync(p));

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=warrior';
const SHOTS = path.resolve(__dirname, '..', 'shots');

const SHEET = () => {
  const groups = [['warrior', '战 士'], ['mage', '法 师'], ['taoist', '道 士']];
  const cell = id => {
    const it = makeRelic(id, RELICS[id].cls);
    return `<div class="rc"><div class="rci">${itemIcon(it)}</div><div class="rcn">${it.name}</div></div>`;
  };
  let html = '<div id="rSheet"><h1>法器 · 三十件</h1>';
  for (const [cls, name] of groups) {
    html += `<div class="rgrp"><div class="rgt">${name}</div><div class="rgc">`
      + Object.keys(RELICS).filter(i => RELICS[i].cls === cls).map(cell).join('')
      + '</div></div>';
  }
  html += '</div>';
  const d = document.createElement('div');
  d.innerHTML = html;
  document.body.appendChild(d.firstChild);
  const st = document.createElement('style');
  st.textContent = `
    #rSheet{position:fixed;inset:0;z-index:99999;background:radial-gradient(ellipse at 50% 30%,#1c1811,#08070a 70%);
      font-family:"STKaiti","KaiTi",serif;color:#e8dcc0;padding:30px 40px;overflow:auto}
    #rSheet h1{font-size:20px;letter-spacing:10px;text-align:center;color:#d8b25a;margin:0 0 18px;font-weight:400}
    .rgrp{margin-bottom:14px}
    .rgt{font-size:11px;letter-spacing:6px;color:#7a7466;margin:0 0 6px 4px}
    .rgc{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
    .rc{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 2px 6px;
      background:linear-gradient(160deg,rgba(38,34,28,.8),rgba(0,0,0,.5));
      border:1px solid rgba(216,178,90,.22)}
    .rci{color:#d8b25a;display:flex;align-items:center;justify-content:center}
    .rci .it-relic{width:44px;height:44px}
    .rcn{font-size:10px;color:#b8ad90;letter-spacing:.5px}
  `;
  document.head.appendChild(st);
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1180, height: 560, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'load' });
  await wait(2400);
  await p.evaluate(SHEET);
  await wait(400);
  await p.screenshot({ path: path.join(SHOTS, 'relic-icons.png') });

  /* 纸娃娃 + 行囊实物 */
  const p2 = await b.newPage();
  await p2.setViewport({ width: 1280, height: 820, deviceScaleFactor: 2 });
  await p2.goto(URL, { waitUntil: 'load' });
  await wait(2400);
  await p2.evaluate(() => {
    const s = Game.state;
    s.level = 40;
    s.equipment.relic = makeRelic('w10', 'warrior');
    ['w1', 'w3', 'w6', 'w8', 'm3', 't6', 't9', 'w10'].forEach(id => s.inventory.push(makeRelic(id, RELICS[id].cls)));
    Game.recalc();
    s.hp = s.stats.hpMax; s.mp = s.stats.mpMax;
    UI.closeAll();
    document.getElementById('invPanel').classList.add('open');
    UI.invTab = 'equip';
    UI.renderInventory();
  });
  await wait(500);
  await p2.screenshot({ path: path.join(SHOTS, 'relic-doll.png'), clip: { x: 200, y: 60, width: 620, height: 520 } });

  if (errs.length) console.log('页面错误：\n' + errs.slice(0, 3).join('\n'));
  else console.log('OK → shots/relic-icons.png / relic-doll.png');
  await b.close();
})().catch(e => { console.error('崩溃：', e); process.exit(1); });
