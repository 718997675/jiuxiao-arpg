const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  for (const vp of [{ w: 1440, h: 900, t: false }, { w: 390, h: 844, t: true }]) {
    await p.setViewport({ width: vp.w, height: vp.h, isMobile: vp.t, hasTouch: vp.t, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
    await wait(1300);
    const r = await p.evaluate(() => {
      SaveUI.open();
      const cards = [...document.querySelectorAll('#savePanel .scard')];
      const empty = cards.find(c => c.classList.contains('empty'));
      const full = cards.find(c => !c.classList.contains('empty'));
      const desc = el => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const kids = [...el.children].map(k => k.className + ':' + Math.round(k.getBoundingClientRect().height) + (getComputedStyle(k).display === 'none' ? '(none)' : ''));
        return { h: Math.round(el.getBoundingClientRect().height), pad: cs.padding, minH: cs.minHeight, kids };
      };
      return { total: cards.length, empty: desc(empty), full: desc(full), html: empty ? empty.outerHTML.slice(0, 300) : '' };
    });
    console.log(vp.w + 'x' + vp.h, JSON.stringify(r, null, 1));
  }
  await b.close();
})();
