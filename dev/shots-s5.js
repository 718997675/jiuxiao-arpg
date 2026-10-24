/* ============================================================
 * S5 怪物体系展示截图 + 三端布局体检
 *
 *   node dev/shots-s5.js
 *
 * 产出：
 *   shots/s5-codex-desktop.png   异兽志（1440×900）
 *   shots/s5-codex-landscape.png 异兽志（844×390 横屏手机）
 *   shots/s5-codex-portrait.png  异兽志（390×844 竖屏手机）
 *   shots/s5-forest.png          幽篁林实战（新怪同屏）
 *   shots/s5-elite.png           精英怪特写（金血条 + 词缀名）
 *
 * 体检项（三端都跑）：
 *   · 面板不溢出视口、条目可滚动、5 个区域页签不折行
 *   · 名字/抗性/传说文字没有被裁掉
 *   · 触屏端点即切区（不依赖 hover）
 *
 * 注意：全程复用同一个 page。同时开 4 个 page 会把 WebGL 上下文耗光，
 * 第 4 个页面起不来（Game.state 一直是 null，loadMap 直接炸）。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=warrior';
const VIEWS = [
  { id: 'desktop', w: 1440, h: 900, touch: false },
  { id: 'landscape', w: 844, h: 390, touch: true },
  { id: 'portrait', w: 390, h: 844, touch: true }
];

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '  →  ' + e : '')); } };

/* 有存档时游戏会停在「择一道而行」主菜单（?cls= 只在全新开局时自动进），
 * 所以每次 reload 后都得确认已经在局内，否则 Game.state 是 null。 */
async function enterGame(p) {
  const at = await p.evaluate(() => getComputedStyle(document.querySelector('#start')).display !== 'none');
  if (at) {
    await p.evaluate(() => {
      const c = document.querySelector('#continueBtn');
      if (c && c.offsetParent !== null) c.click();
      else document.querySelector('#startBtn').click();
    });
    await wait(1800);
  }
  return p.evaluate(() => !!(typeof Game !== 'undefined' && Game.state && Game.playerGroup));
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  for (const v of VIEWS) {
    errs.length = 0;
    await p.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: v.touch, hasTouch: v.touch });
    await p.goto(URL, { waitUntil: 'load' });
    await wait(2000);
    const inGame = await enterGame(p);
    ok(inGame, `[${v.id}] 已进入局内`);

    /* 造一份「录了一半」的图鉴：森林全录 + 沼泽 3 只，
     * 既有已录也有问号，最能看出排版是否撑得住 */
    const seeded = await p.evaluate(() => {
      if (!Game || !Game.state) return false;
      Game.state.level = 22; Game.recalc();
      Game.state.codex = { mon: {}, regions: {} };
      Game.codexRegionKinds('forest').forEach(k => Game.unlockCodex(k));
      Game.codexRegionKinds('swamp').slice(0, 3).forEach(k => Game.unlockCodex(k));
      Game.checkCodexRegion('forest');
      UI.openMenu('codex');
      return true;
    });
    ok(seeded, `[${v.id}] 图鉴数据注入成功`);
    await wait(700);

    const m = await p.evaluate(() => {
      const q = s => document.querySelector(s);
      const grid = q('#codexGrid');
      const regs = q('#codexRegions');
      const pr = q('#codexPanel').getBoundingClientRect();
      const cards = [...grid.querySelectorAll('.cx')];
      const clipped = cards.filter(c => {
        const el = c.querySelector('.cx-n') || c;
        return el.scrollWidth > el.clientWidth + 2;
      }).length;
      /* 页签折行判定：任一页签的 top 明显低于首行，就算折行 */
      const kids = [...regs.children];
      const firstTop = kids[0] ? kids[0].getBoundingClientRect().top : 0;
      const wrap = kids.some(c => c.getBoundingClientRect().top > firstTop + 4);
      const res = {
        panelIn: pr.top >= -1 && pr.bottom <= innerHeight + 1 && pr.right <= innerWidth + 1,
        pr: [Math.round(pr.width), Math.round(pr.height)],
        cards: cards.length,
        clipped,
        wrap,
        resChips: grid.querySelectorAll('.cx-r i').length,
        lore: cards.some(c => c.querySelector('.cx-l')) ? 1 : 0,
        /* 面板里能滚动的只有条目区，别让整页出现滚动条 */
        bodyScroll: document.documentElement.scrollHeight > innerHeight + 2
      };
      /* 切到沼泽（只录了 3 只）再数问号——森林已全录，问号为 0 是正常的。
       * 点击会整体重渲染，所以按钮要重新查，不能拿旧引用判断 .on */
      kids[1] && kids[1].click();
      const after = [...q('#codexRegions').children];
      res.swampOn = after[1] ? after[1].classList.contains('on') : false;
      res.swampCards = q('#codexGrid').querySelectorAll('.cx').length;
      res.swampLocked = q('#codexGrid').querySelectorAll('.cx.lock').length;
      return res;
    });

    ok(m.panelIn, `[${v.id}] 面板不溢出视口`, m.pr.join('×'));
    ok(!m.bodyScroll, `[${v.id}] 页面本身不出现滚动条`);
    ok(m.cards >= 5, `[${v.id}] 条目有渲染`, m.cards);
    ok(m.swampOn && m.swampCards > 0, `[${v.id}] 区域页签可切换`, m.swampCards);
    ok(m.swampLocked > 0, `[${v.id}] 未收录显示问号`, m.swampLocked);
    ok(m.clipped === 0, `[${v.id}] 名字没被截断`, m.clipped);
    ok(!m.wrap, `[${v.id}] 区域页签单行（不折行）`);
    ok(m.resChips > 0, `[${v.id}] 抗性数值有渲染`, m.resChips);
    ok(m.lore === 1, `[${v.id}] 传说文案有渲染`);
    ok(errs.length === 0, `[${v.id}] 控制台 0 error`, errs.slice(0, 2).join(' | '));

    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's5-codex-' + v.id + '.png') });
    console.log('  ' + v.id + ' 完成 ' + m.pr.join('×'));
  }

  /* ---------------- 实战截图：森林 + 精英特写 ---------------- */
  errs.length = 0;
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto(URL, { waitUntil: 'load' });
  await wait(2200);

  const booted = await enterGame(p);
  ok(booted, '实战页已进入游戏（state 就绪）');
  if (booted) {
    await p.evaluate(() => { UI.closeAll(); Game.loadMap('forest'); });
    await wait(2800);
    /* 读档/开局会带出上次留着的面板，截图前再收一次 */
    await p.evaluate(() => { UI.closeAll(); });
    await wait(400);
    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's5-forest.png') });

    /* 精英特写：拉一只带 2 条以上词缀的精英到镜头前 */
    const elite = await p.evaluate(() => {
      Game.invuln = 9999;
      const pp = Game.playerGroup.position;
      let found = null;
      for (let i = 0; i < 60 && !found; i++) {
        const e = Game.spawnEnemy('shigandang', pp.x + 2.6, pp.z + 2.6, true, 20);
        if (e && e.affixes && e.affixes.length >= 2) found = e;
        else if (e) { e.dead = true; e.deadT = 99; }
      }
      if (!found) return null;
      return { name: found.name, affixes: found.affixes, hp: found.maxHp };
    });
    ok(elite && elite.affixes.length >= 2, '拉到多词缀精英', elite && elite.name);
    await wait(900);
    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's5-elite.png') });
    ok(errs.length === 0, '实战页 0 error', errs.slice(0, 2).join(' | '));
  }

  await b.close();
  console.log('\n====================================================');
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  if (fail) process.exit(1);
})().catch(e => { console.error('截图崩溃：', e); process.exit(1); });
