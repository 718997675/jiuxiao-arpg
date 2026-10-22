const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1500);
  await p.screenshot({ path: '../shots/153-m-start.png' });
  const fs = await p.evaluate(() => {
    const el = id => document.getElementById(id);
    const r = e => e ? Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) : 'null';
    return { nameInput: r(el('nameInput')), fs: el('nameInput') ? getComputedStyle(el('nameInput')).fontSize : '', startH: r(el('start')) };
  });
  console.log('起始界面:', JSON.stringify(fs));
  await p.evaluate(() => SaveUI.open());
  await wait(700);
  await p.screenshot({ path: '../shots/154-m-save.png' });
  const sp = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    const r = e => e ? Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) : 'null';
    return { panel: r(q('#savePanel')), newName: r(q('#newName')), newNameFs: q('#newName') ? getComputedStyle(q('#newName')).fontSize : '' };
  });
  console.log('存档面板:', JSON.stringify(sp));
  await b.close();
})();
