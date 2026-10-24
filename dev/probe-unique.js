/* ============================================================
 * 传世名器 · 视觉/布局探针
 *
 *   node dev/probe-unique.js
 *
 * 出图：
 *   shots/probe-uni-skill.png   术法面板（秘技分组 + 「秘」角标）
 *   shots/probe-uni-tip.png     传世提示框（传世标签 / 特性 / 秘技）
 *   shots/probe-uni-forge.png   炼器台升阶页（拒绝升阶的理由）
 *   shots/probe-uni-help.png    说明页「传世名器」节
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
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('file://' + path.resolve(ROOT, 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);

  /* 穿一整套传世（4 件授予 + 1 件强化 + 1 件通玄） */
  const info = await p.evaluate(() => {
    const want = ['jiuyou_veil', 'longlin_armor', 'zhenyue', 'lunhui_ring', 'tayun_boots', 'leiting_gloves'];
    const s = Game.state;
    const got = [];
    for (const id of want) {
      const def = UNIQUE_ITEMS.find(u => u.id === id);
      let it = null;
      for (let i = 0; i < 500 && !it; i++) {
        const t = rollItem(40, { slot: def.slot, rarity: 'unique', cls: def.cls || 'warrior' });
        if (t.uniqueId === id) it = t;
      }
      if (!it) continue;
      const k = it.slot === 'ring' ? 'ring1' : it.slot;
      s.equipment[k] = it;
      got.push(id);
    }
    Game.recalc();
    /* 技能条：把秘技放上去，检查 HUD 是否正常渲染 */
    const grants = Object.keys(s.stats.grantedSkills || {});
    let slot = 0;
    for (const g of grants) {
      while (slot < 8 && s.skillbar[slot]) slot++;
      if (slot >= 8) break;
      Game.assignSkillBar(slot, g);
    }
    return {
      got, grants,
      traits: Object.values(s.stats.flags || {}).length,
      uni: s.equipment.helm ? s.equipment.helm.name : null
    };
  });
  console.log('穿上：', info.got.join(', '));
  console.log('秘技：', info.grants.join(', '));

  /* 1. 术法面板 */
  await p.evaluate(() => { UI.openSkill(); });
  await wait(400);
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-uni-skill.png') });

  /* 2. 提示框：把传世放进一个可见容器里截图 */
  await p.evaluate(() => {
    UI.closeMenu && UI.closeMenu();
    const it = Game.state.equipment.helm;
    const d = document.createElement('div');
    d.id = 'uniTip';
    d.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99999;background:#0b0d10;padding:10px;border:1px solid #333;border-radius:6px';
    d.innerHTML = itemTooltip(it);
    document.body.appendChild(d);
  });
  await wait(250);
  const tip = await p.$('#uniTip');
  await tip.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-uni-tip.png') });
  const tipBox = await p.evaluate(() => {
    const d = document.getElementById('uniTip');
    const tt = d.querySelector('.tt');
    return {
      w: Math.round(tt.getBoundingClientRect().width),
      h: Math.round(tt.getBoundingClientRect().height),
      overflow: Math.round(d.scrollWidth - d.clientWidth)
    };
  });
  await p.evaluate(() => { const d = document.getElementById('uniTip'); if (d) d.remove(); });

  /* 3. 炼器台升阶页 */
  await p.evaluate(() => {
    Game.state.materials = Game.state.materials || {};
    UI.openForge && UI.openForge();
  });
  await wait(300);
  const forge = await p.evaluate(() => {
    const tabs = [...document.querySelectorAll('#forgePanel .ftab')];
    const tierTab = tabs.find(t => t.dataset.ftab === 'tier') || tabs.find(t => /升阶/.test(t.textContent));
    if (tierTab) tierTab.click();
    const sel = [...document.querySelectorAll('#forgeList .fitem')].find(el => /传世/.test(el.textContent));
    if (sel) sel.click();
    const body = document.getElementById('forgeMain');
    return {
      tabFound: !!tierTab,
      selFound: !!sel,
      hasTrack: body ? /tier-track/.test(body.innerHTML) : null,
      txt: body ? (body.textContent.match(/传世[^，。]{0,40}/) || [''])[0] : ''
    };
  });
  await wait(350);
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-uni-forge.png') });

  /* 4. 说明页「传世名器」节 */
  await p.evaluate(() => {
    UI.closeMenu && UI.closeMenu();
    UI.openMenu('help');
    const tabs = [...document.querySelectorAll('#hpNav .hp-tab')];
    const t = tabs.find(x => /传世/.test(x.textContent));
    if (t) t.click();
  });
  await wait(350);
  await p.screenshot({ path: path.resolve(ROOT, 'shots', 'probe-uni-help.png') });

  console.log('提示框：', JSON.stringify(tipBox));
  console.log('炼器台：', JSON.stringify(forge));
  if (errs.length) console.log('报错：', errs.slice(0, 4).join(' | '));
  else console.log('无页面报错');
  await b.close();
})();
