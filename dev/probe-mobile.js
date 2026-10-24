/* ============================================================
 * 移动端判定 / 横屏布局探测
 *
 *   node dev/probe-mobile.js
 *
 * 用三种真机常见环境跑同一份代码，检查 body.touch 是否加上：
 *   1. iPhone 竖屏（正常场景）
 *   2. iPhone 横屏（用户报的问题）
 *   3. iPhone 横屏 + pointer 媒体查询谎报 fine（iOS 横屏 / 微信内置浏览器的真实表现）
 * 并各存一张截图到 shots/ 方便肉眼比对。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CASES = [
  { name: 'iphone-portrait', w: 390, h: 844, liePointer: false },
  { name: 'iphone-landscape', w: 844, h: 390, liePointer: false },
  { name: 'iphone-landscape-lie', w: 844, h: 390, liePointer: true }
];

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  for (const c of CASES) {
    const p = await b.newPage();
    /* 模拟「pointer 媒体查询报 fine」：必须在页面脚本执行前注入 */
    if (c.liePointer) {
      await p.evaluateOnNewDocument(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = q => {
          if (/pointer|hover/.test(q)) {
            return { matches: false, media: q, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } };
          }
          return orig(q);
        };
      });
    }
    await p.emulate({
      viewport: { width: c.w, height: c.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent: IPHONE_UA
    });
    await p.goto('file://' + path.resolve(ROOT, 'index.html'), { waitUntil: 'load' });
    await wait(2500);

    const r = await p.evaluate(() => ({
      touch: document.body.classList.contains('touch'),
      mobileOn: typeof Mobile !== 'undefined' ? Mobile.on : 'n/a',
      iw: window.innerWidth, ih: window.innerHeight,
      actionbar: document.getElementById('actionbar') ? getComputedStyle(document.getElementById('actionbar')).display : 'n/a',
      mtouch: document.getElementById('mtouch') ? getComputedStyle(document.getElementById('mtouch')).display : 'n/a',
      joy: (() => { const el = document.getElementById('mJoy'); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
      skBtns: document.querySelectorAll('#mtouch .msk').length,
      offscreen: [...document.querySelectorAll('#mtouch *')].filter(el => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.right < -2 || b.left > window.innerWidth + 2 || b.bottom < -2 || b.top > window.innerHeight + 2);
      }).length
    }));
    console.log(c.name, JSON.stringify(r));
    await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-' + c.name + '.png') });
    await p.close();
  }

  await b.close();
})();
