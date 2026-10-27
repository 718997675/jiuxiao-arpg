const puppeteer = require('puppeteer-core');
const URL = 'https://718997675.github.io/jiuxiao-arpg/?t=' + Date.now();
const wait = ms => new Promise(r => setTimeout(r, ms));

async function boot(page) {
  const errs = [], failed = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 120)); });
  page.on('requestfailed', r => {
    const u = r.url();
    if (!/favicon|sharecode|analytics/.test(u)) failed.push(u);
  });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) failed.push(r.status() + ' ' + r.url()); });
  return { errs, failed };
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  /* ---------- PC ---------- */
  const pc = await b.newPage();
  const pcw = await boot(pc);
  await pc.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await pc.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1500);
  const pcInfo = await pc.evaluate(() => ({
    touchClass: document.body.classList.contains('touch'),
    running: !!(window.Game && Game.running),
    draws: window.Game && Game.renderer ? Game.renderer.info.render.calls : -1,
    version: (document.querySelector('script[src*="mobile"]') ? 'has-mobile' : 'no-mobile'),
    icons: typeof ITEM_ICONS === 'object' ? Object.keys(ITEM_ICONS).length : -1
  }));
  // 进入游戏，验证挥砍与血条
  await pc.click('#startBtn').catch(() => {});
  await wait(400);
  await pc.evaluate(() => Game.startNew('warrior', '刀'));
  await wait(900);
  await pc.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1800);
  const pcPlay = await pc.evaluate(() => {
    const s = Game.state;
    return {
      inGame: !!s,
      cls: s && s.cls,
      hp: s && Math.round(s.hp),
      mp: s && Math.round(s.mp),
      enemies: Game.enemies ? Game.enemies.length : -1,
      bars: Game.enemies ? Game.enemies.filter(e => e.bar && e.bar.group.visible).length : -1,
      hpBarW: Game.enemies && Game.enemies[0] && Game.enemies[0].bar ? Game.enemies[0].bar.fill.scale.x.toFixed(3) : 'n/a'
    };
  });
  // 触发挥砍，采样手臂角度
  const swing = await pc.evaluate(async () => {
    Game.atkCd = 0; Game.doBasicAttack();
    const rec = [];
    const t0 = performance.now();
    return await new Promise(res => {
      const id = setInterval(() => {
        const a = Game.actor;
        rec.push({
          t: Math.round(performance.now() - t0),
          rx: a.parts.armR ? +a.parts.armR.rotation.x.toFixed(2) : 0,
          rz: a.parts.armR ? +a.parts.armR.rotation.z.toFixed(2) : 0,
          ty: +(a.parts.torso.rotation.y).toFixed(2)
        });
        if (performance.now() - t0 > 620) { clearInterval(id); res({ minRz: Math.min(...rec.map(r => r.rz)), maxRz: Math.max(...rec.map(r => r.rz)), minRx: Math.min(...rec.map(r => r.rx)), maxRx: Math.max(...rec.map(r => r.rx)), n: rec.length }); }
      }, 16);
    });
  });
  await wait(300);
  await pc.screenshot({ path: '../shots/150-live-pc.png' });

  /* ---------- 移动端横屏 ---------- */
  const m = await b.newPage();
  const mw = await boot(m);
  await m.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await m.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1200);
  await m.click('#startBtn').catch(() => {});
  await wait(400);
  await m.evaluate(() => Game.startNew('warrior', '刀'));
  await wait(900);
  await m.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1800);
  const mInfo = await m.evaluate(() => {
    const vis = id => { const el = document.getElementById(id); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      touchClass: document.body.classList.contains('touch'),
      joy: vis('mJoy'), atk: vis('mAtk'), skills: vis('mSkills'),
      skillBtns: document.querySelectorAll('#mSkills .mskill').length,
      skillRect: (() => { const e = document.getElementById('mSkills'); const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      firstSkillVisible: (() => { const e = document.querySelector('#mSkills .mskill'); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
      hudHiddenByMenu: document.body.classList.contains('in-menu'),
      err: window.__err || null
    };
  });
  await m.screenshot({ path: '../shots/151-live-m-land.png' });

  /* ---------- 移动端竖屏 ---------- */
  const p = await b.newPage();
  const pw = await boot(p);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1200);
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => Game.startNew('warrior', '刀'));
  await wait(900);
  await p.evaluate(() => { Game.state.level = 10; Game.recalc(); Game.travelTo('forest'); });
  await wait(1800);
  const pInfo = await p.evaluate(() => {
    const vis = id => { const el = document.getElementById(id); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const ov = (() => {
      const ids = ['mJoy', 'mAtk', 'mSkills'];
      const rs = ids.map(i => { const e = document.getElementById(i); return e ? e.getBoundingClientRect() : null; }).filter(Boolean);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], c = rs[j];
        if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) return true;
      }
      return false;
    })();
    return { touchClass: document.body.classList.contains('touch'), joy: vis('mJoy'), atk: vis('mAtk'), skills: vis('mSkills'),
      skillBtns: document.querySelectorAll('#mSkills .mskill').length,
      firstSkill: (() => { const e = document.querySelector('#mSkills .mskill'); if (!e) return false; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)]; })(),
      overlap: ov,
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  });
  await p.screenshot({ path: '../shots/152-live-m-port.png' });

  console.log('PC       :', JSON.stringify(pcInfo));
  console.log('PC 对局  :', JSON.stringify(pcPlay));
  console.log('挥砍采样 :', JSON.stringify(swing));
  console.log('横屏     :', JSON.stringify(mInfo));
  console.log('竖屏     :', JSON.stringify(pInfo));
  console.log('PC 错误  :', JSON.stringify(pcw.errs.slice(0, 4)), '| 失败请求', JSON.stringify(pcw.failed.slice(0, 4)));
  console.log('横屏错误 :', JSON.stringify(mw.errs.slice(0, 4)), '| 失败请求', JSON.stringify(mw.failed.slice(0, 4)));
  console.log('竖屏错误 :', JSON.stringify(pw.errs.slice(0, 4)), '| 失败请求', JSON.stringify(pw.failed.slice(0, 4)));
  await b.close();
})();
