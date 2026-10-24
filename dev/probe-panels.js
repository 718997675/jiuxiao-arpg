/* ============================================================
 * 面板布局探测：技能条 8 格是否溢出详情卡 / 协同说明是否渲染
 *
 *   node dev/probe-panels.js
 *
 * 产出截图：
 *   shots/probe-skill-panel.png   PC 术法面板（选中旋风斩，看底部 1-8 技能条行）
 *   shots/probe-talent-syn.png    PC 天赋面板切到「协同」页签
 * 并在控制台打印溢出判定结果。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(ROOT, 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);
  /* 直接开局，面板才有 state */
  await p.evaluate(() => { Game.startNew('warrior', '青崖客', 0, '普通'); });
  await wait(1200);

  /* ---------- 1. 术法面板 ---------- */
  const sk = await p.evaluate(async () => {
    Game.setSkillVariant('whirl', 2);
    UI.openSkill();
    await new Promise(r => setTimeout(r, 300));
    const panel = document.getElementById('skillPanel');
    const pr = panel.getBoundingClientRect();
    const bar = document.querySelector('.sd-bar');
    const slots = document.querySelector('.sd-barslots');
    const br = bar ? bar.getBoundingClientRect() : null;
    const sr = slots ? slots.getBoundingClientRect() : null;
    return {
      panel: { w: Math.round(pr.width), h: Math.round(pr.height), right: Math.round(pr.right) },
      bar: br ? { w: Math.round(br.width), right: Math.round(br.right) } : null,
      slots: sr ? { w: Math.round(sr.width), right: Math.round(sr.right) } : null,
      slotCount: document.querySelectorAll('.sk-bslot').length,
      overflow: br ? Math.round(br.right - pr.right) : null,
      slotsOverflow: sr ? Math.round(sr.right - pr.right) : null,
      docScrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth
    };
  });
  console.log('技能面板', JSON.stringify(sk));
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-skill-panel.png') });

  /* ---------- 2. 天赋协同 ---------- */
  const tl = await p.evaluate(async () => {
    UI.openTalent();
    await new Promise(r => setTimeout(r, 200));
    /* 切到协同页签 */
    const tab = [...document.querySelectorAll('.tl-tab')].find(b => b.dataset.tree === 'synergy');
    if (tab) tab.click();
    await new Promise(r => setTimeout(r, 400));
    const syn = document.getElementById('tlSyn');
    return {
      tabFound: !!tab,
      synOn: syn ? syn.classList.contains('on') : false,
      rows: syn ? syn.querySelectorAll('.sy-row').length : 0,
      sum: syn ? (syn.querySelector('.sy-sum') || {}).textContent : null,
      height: syn ? Math.round(syn.getBoundingClientRect().height) : 0,
      panelH: Math.round(document.getElementById('talentPanel').getBoundingClientRect().height),
      scrollH: document.getElementById('talentPanel').scrollHeight
    };
  });
  console.log('天赋协同', JSON.stringify(tl));
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-talent-syn.png') });

  await b.close();
})();
