/* 移动端布局回归：键位重叠 / 出屏 / 面板裁切 / 面板可滚性
 * 用法：
 *   node dev/mobile-layout.js           本地 index.html，6 视口全跑
 *   node dev/mobile-layout.js --live    线上 GitHub Pages，只跑 2 个代表视口
 * 判定口径：
 *   · 键位重叠   —— 任意两个可交互控件（摇杆/普攻/技能格/功能键）矩形相交 > 2px 即报
 *   · 出屏       —— 控件矩形越过可视区边界 1px 即报
 *   · 裁切       —— 元素 scrollWidth/Height 超出 client 且不可滚，且不是故意省略号截断、
 *                   且 overflow:visible（如 range 滑块头）→ 都不算
 *   · 面板可滚   —— 内容高于/宽于容器时，容器必须 overflow:auto|scroll
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const EXE = require('./_chrome');

const LIVE = process.argv.includes('--live');
const BASE = LIVE
  ? 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now() + '&mobile=1'
  : 'file://' + path.resolve(__dirname, '..', 'index.html') + '?mobile=1';

const VIEWPORTS = LIVE ? [
  { name: 'iPhone12-竖', w: 390, h: 844 },
  { name: 'iPhone12-横', w: 844, h: 390 }
] : [
  { name: 'iPhone12-竖', w: 390, h: 844 },
  { name: 'iPhone12-横', w: 844, h: 390 },
  { name: 'iPhoneSE-竖', w: 375, h: 667 },
  { name: 'Android-竖', w: 360, h: 640 },
  { name: '小屏-横', w: 667, h: 375 },
  { name: '窄屏-竖', w: 320, h: 568 }
];

const TABS = ['bag', 'talent', 'stat', 'quest', 'codex', 'forge', 'save', 'set', 'help', 'skill'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });

  let fail = 0;
  console.log(LIVE ? '目标：线上 ' + BASE.split('?')[0] : '目标：本地 index.html');

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
    await page.reload({ waitUntil: 'load' });
    await wait(1200);
    const ok = await page.evaluate(() => {
      const r = Game.startNew('warrior', 'T');
      if (r) { Game.state.level = 20; Game.recalc(); }
      return !!Game.state;
    });
    await wait(1500);
    if (!ok) { console.log(vp.name, '开局失败'); await page.close(); fail++; continue; }

    /* ---- 键位几何 ---- */
    const keys = await page.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const items = [];
      const add = (el, tag) => { if (el && el.offsetParent !== null) items.push(Object.assign({ tag }, r(el))); };
      add(document.getElementById('mJoy'), '摇杆');
      add(document.getElementById('mAtk'), '普攻');
      document.querySelectorAll('#mSkills .mskill').forEach((el, i) => add(el, '技能' + (i + 1)));
      document.querySelectorAll('#mUtil .mbtn').forEach((el, i) => add(el, '功能' + (i + 1)));
      const ov = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) ov.push(`${a.tag}×${b.tag}`);
      }
      const off = items.filter(i => i.x < -1 || i.y < -1 || i.x + i.w > innerWidth + 1 || i.y + i.h > innerHeight + 1).map(i => i.tag);
      const sk = document.querySelector('#mSkills .mskill');
      return { overlaps: ov, offscreen: off, count: items.length, skSize: sk ? Math.round(sk.getBoundingClientRect().width) : 0, u: +Mobile.u.toFixed(2) };
    });

    /* ---- 面板 ---- */
    const panels = [];
    for (const t of TABS) {
      const info = await page.evaluate(tab => {
        UI.closeAll();
        if (tab === 'skill') UI.openSkill(); else UI.openMenu(tab);
        const host = document.querySelector('.panel.open');
        if (!host) return { tab, missing: true };
        const inner = host.querySelector('#menuBody .panel') || host;
        const b = host.getBoundingClientRect();
        const bad = [];
        for (const el of inner.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const dy = el.scrollHeight - el.clientHeight, dx = el.scrollWidth - el.clientWidth;
          const canY = /auto|scroll/.test(cs.overflowY), canX = /auto|scroll/.test(cs.overflowX);
          const ellipsis = cs.textOverflow === 'ellipsis';   // 故意省略号截断
          const vis = cs.overflow === 'visible';             // 子元素外溢不裁切
          /* touch-action:none = 「手势由 JS 接管」的视口（术法树 / 天赋轮盘），
           * 内容比容器大是设计如此，靠拖动平移，不算裁切 */
          const gesture = cs.touchAction === 'none';
          const clipX = dx > 4 && !canX && !ellipsis && !vis && !gesture;
          const clipY = dy > 4 && !canY && !ellipsis && !vis && !gesture;
          if (clipY || clipX) {
            bad.push((el.id ? '#' + el.id : '.' + (el.className || '').toString().split(' ')[0])
              + (clipY ? ' 纵+' + dy : '') + (clipX ? ' 横+' + dx : ''));
            if (bad.length > 4) break;
          }
        }
        const body = host.querySelector('#menuBody') || host.querySelector('.pb') || host;
        const bcs = getComputedStyle(body);
        return {
          tab, bad,
          clip: [b.x < -1, b.y < -1, b.right > innerWidth + 1, b.bottom > innerHeight + 1],
          body: { ovY: bcs.overflowY, ovX: bcs.overflowX, sh: body.scrollHeight, ch: body.clientHeight, sw: body.scrollWidth, cw: body.clientWidth }
        };
      }, t);
      panels.push(info);
    }
    await page.evaluate(() => UI.closeAll());

    console.log('\n=== ' + vp.name + ' ' + vp.w + '×' + vp.h + ' ===');
    console.log('键位: u=' + keys.u + ' 格=' + keys.skSize + 'px 控件' + keys.count + ' 重叠:' + (keys.overlaps.join(',') || '无') + ' 出屏:' + (keys.offscreen.join(',') || '无'));
    if (keys.overlaps.length || keys.offscreen.length) fail++;
    for (const p of panels) {
      if (p.missing) { console.log(' ', p.tab, '未打开'); fail++; continue; }
      const flag = [];
      if (p.clip.some(Boolean)) flag.push('出屏[' + p.clip.map((v, i) => v ? ['左', '上', '右', '下'][i] : '').filter(Boolean).join('') + ']');
      if (p.body.sh > p.body.ch + 2 && !/auto|scroll/.test(p.body.ovY)) flag.push('纵不可滚');
      if (p.body.sw > p.body.cw + 2 && !/auto|scroll/.test(p.body.ovX)) flag.push('横不可滚');
      console.log(' ', p.tab.padEnd(6), `h${p.body.sh}/${p.body.ch} w${p.body.sw}/${p.body.cw}`,
        p.body.ovY + '/' + p.body.ovX, flag.length ? '❌' + flag.join(' ') : '✓');
      if (p.bad.length) console.log('      裁切:', p.bad.join(' | '));
      if (flag.length || p.bad.length) fail++;
    }
    if (errs.length) { console.log('错误:', errs.slice(0, 4)); fail++; }
    await page.close();
  }

  await browser.close();
  console.log(fail ? `\n❌ ${fail} 处问题` : '\n✅ 全部通过');
  process.exit(fail ? 1 : 0);
})();
