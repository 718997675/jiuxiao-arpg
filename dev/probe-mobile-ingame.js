/* ============================================================
 * iPhone 横屏 · 游戏内 HUD 探测
 *
 *   node dev/probe-mobile-ingame.js
 *
 * 前一个问题：iPhone 横屏打开时整页退回 PC 布局（body 没有 .touch）。
 * 这里模拟三种真机环境并**进入游戏**，检查：
 *   · body.touch 是否加上
 *   · PC 动作条是否隐藏、触屏层是否可见
 *   · 摇杆 / 技能格是否都在可视区内（不会跑到屏幕外）
 * 产出 shots/probe-ingame-<case>.png
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CASES = [
  { name: 'landscape', w: 844, h: 390, liePointer: false },
  { name: 'landscape-lie', w: 844, h: 390, liePointer: true },
  { name: 'se', w: 667, h: 375, liePointer: true }
];

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  for (const c of CASES) {
    const p = await b.newPage();
    if (c.liePointer) {
      await p.evaluateOnNewDocument(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = q => /pointer|hover/.test(q)
          ? { matches: false, media: q, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }
          : orig(q);
      });
    }
    await p.emulate({
      viewport: { width: c.w, height: c.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent: IPHONE_UA
    });
    await p.goto('file://' + path.resolve(ROOT, 'index.html'), { waitUntil: 'load' });
    await wait(2200);
    await p.evaluate(() => { Game.startNew('warrior', '青崖客', 0, '普通'); });
    await wait(1600);

    const r = await p.evaluate(() => {
      const rect = id => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const out = [...document.querySelectorAll('#mtouch *')].filter(el => {
        const b = el.getBoundingClientRect();
        return b.width > 2 && (b.right < -2 || b.left > window.innerWidth + 2 || b.bottom < -2 || b.top > window.innerHeight + 2);
      }).length;
      return {
        touch: document.body.classList.contains('touch'),
        mobileOn: Mobile.on,
        iw: window.innerWidth, ih: window.innerHeight,
        actionbar: getComputedStyle(document.getElementById('actionbar')).display,
        mtouch: getComputedStyle(document.getElementById('mtouch')).display,
        joy: rect('mJoy'),
        skills: document.querySelectorAll('#mtouch .msk, #mtouch [data-msk]').length,
        offscreen: out
      };
    });
    console.log(c.name, JSON.stringify(r));
    await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-ingame-' + c.name + '.png') });
    await p.close();
  }

  await b.close();
})();
