/* 移动端 HUD 几何诊断：找出「摇杆消失 / 按钮变大」到底是被哪个变化触发的
 * 用法：node m-diagnose.js [步骤名...]   默认跑全部步骤
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const wait = ms => new Promise(r => setTimeout(r, ms));

const ONLY = process.argv.slice(2);

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await p.goto(URL, { waitUntil: 'load' });
  await wait(1200);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => Game.startNew('warrior', '刀'));
  await wait(600);
  await p.evaluate(() => { Game.state.level = 20; Game.recalc(); Game.travelTo('forest'); });
  await wait(1600);

  const probe = () => p.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const sk = document.querySelector('#mSkills .mskill');
    const open = document.getElementById('openBtns');
    const vv = window.visualViewport;
    // 可视区矩形：有 visualViewport 就用它（页面被放大时它就是「真正看得见」的范围）
    const vx = vv ? vv.offsetLeft : 0, vy = vv ? vv.offsetTop : 0;
    const vw = vv && vv.width ? vv.width : window.innerWidth;
    const vh = vv && vv.height ? vv.height : window.innerHeight;
    const inside = el => {
      const b = el && el.getBoundingClientRect();
      if (!b) return false;
      return b.left >= vx - 1 && b.top >= vy - 1 && b.right <= vx + vw + 1 && b.bottom <= vy + vh + 1;
    };
    return {
      win: [Math.round(window.innerWidth), Math.round(window.innerHeight)],
      vv: vv ? [Math.round(vv.offsetLeft), Math.round(vv.offsetTop), Math.round(vv.width), Math.round(vv.height), +vv.scale.toFixed(2)] : null,
      joy: r(document.getElementById('mJoy')),
      atk: r(document.getElementById('mAtk')),
      skill: r(sk),
      open: r(open),
      u: +Mobile.u.toFixed(2),
      inView: ['joy', 'atk', 'skill'].every(k => inside(document.getElementById(k === 'joy' ? 'mJoy' : k === 'atk' ? 'mAtk' : 'mSkills')))
        && inside(sk) && inside(document.getElementById('mAtk')),
      scroll: [window.scrollX, window.scrollY]
    };
  });

  const base = await probe();
  const rows = [['基线', base]];

  const step = async (name, fn) => {
    if (ONLY.length && !ONLY.includes(name)) return;
    await fn();
    await wait(500);
    rows.push([name, await probe()]);
  };

  // 1. 页面被放大（iOS Safari 忽略 user-scalable=no 的捏合 / 输入框聚焦放大）
  await step('页面放大1.5x', async () => {
    await p.evaluate(() => {
      window.__vv = window.visualViewport;
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { width: 260, height: 563, scale: 1.5, offsetLeft: 65, offsetTop: 140, addEventListener() { } }
      });
      Mobile.layout();
    });
  });
  await step('页面还原', async () => {
    await p.evaluate(() => {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__vv });
      Mobile.layout();
    });
  });

  // 1b. 转屏中间态：宽度已经报成横屏，高度还是竖屏
  await step('假尺寸844x844', async () => {
    await p.evaluate(() => {
      window.__w = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
      Mobile.layout();
    });
  });
  await step('尺寸修正', async () => {
    await p.evaluate(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: window.__w });
      Mobile.layout();
    });
  });

  // 2. 地址栏收起/弹出：高度变化触发的 resize
  await step('高度844→900', async () => { await p.setViewport({ width: 390, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); });
  await step('高度回844', async () => { await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); });

  // 3. 横竖屏切换
  await step('转横屏', async () => { await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); });
  await step('转回竖屏', async () => { await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); });

  // 4. 开/关面板
  for (const k of ['i', 'c', 'l', 'p']) {
    await step('开面板' + k, async () => { await p.keyboard.press(k); });
    await step('关面板' + k, async () => { await p.keyboard.press(k); });
  }

  // 5. 技能栏重建（升级 / 换职业会走 buildSkills）
  await step('buildSkills重建', async () => { await p.evaluate(() => Mobile.buildSkills()); });

  // 6. 切后台再回来
  await step('切后台回来', async () => {
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p.evaluate(() => Mobile.resetJoy());
  });

  const fmt = a => a ? a.join(',') : 'null';
  console.log('步骤'.padEnd(16), '窗口'.padEnd(10), '视觉视口(偏移+尺寸+缩放)'.padEnd(24), '摇杆'.padEnd(20), '技能'.padEnd(16), '右侧菜单'.padEnd(16), 'u', ' 全在可视区');
  for (const [name, s] of rows) {
    console.log(name.padEnd(16), fmt(s.win).padEnd(10), fmt(s.vv).padEnd(24), fmt(s.joy).padEnd(20), fmt(s.skill).padEnd(16), fmt(s.open).padEnd(16), s.u, ' ', s.inView ? '✓' : '✗ 出界');
  }
  console.log('\n报错:', errs.length, errs.slice(0, 3));
  await b.close();
})();
