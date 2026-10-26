/* ============================================================
 * dev/pace-check.js —— 手感实测：移速 / 冲刺位移 / 实际 TTK
 *
 * 数值表能算出「应该是多少」，但玩家感受的是「按一秒走多远」。
 * 这个脚本在真实浏览器里跑：
 *   1. 按住 W 1 秒，量实际位移 → 得到真实移速
 *   2. 触发闪避 / 突进，量冲刺距离
 *   3. 传送到当前图，量「杀一只同级怪」的真实秒数
 *
 * 用法：NODE_PATH=... node dev/pace-check.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await wait(1400);

  await page.evaluate(() => {
    Game.startNew('warrior', '手感', 1, 'normal');
    Game.state.level = 20; Game.state.xpNext = xpToNext(20);
    for (let i = 0; i < 8; i++) {
      const it = rollItem(20, { cls: 'warrior', rarity: i < 2 ? 'legendary' : 'rare', noRelic: true });
      if (it) { Game.addItem(it); try { Game.equipItem(it.uid); } catch (e) {} }
    }
    Game.recalc();
    Game.state.hp = Game.state.stats.hpMax;
    Game.state.mp = Game.state.stats.mpMax;
  });
  await wait(300);

  /* 1. 基础移速：手动推进 1 秒游戏时间（headless 帧率不稳，不能靠 rAF 计时） */
  const walk = await page.evaluate(() => {
    const p = Game.playerGroup.position;
    const st = Game.state.stats;
    const x0 = p.x, z0 = p.z;
    Game.keys['w'] = true;
    for (let i = 0; i < 60; i++) Game.updatePlayer(1 / 60);
    Game.keys['w'] = false;
    const d = Math.hypot(p.x - x0, p.z - z0);
    return { dist: +d.toFixed(2), panelSpd: +st.moveSpd.toFixed(2), base: BALANCE.move.base };
  });

  /* 2. 闪避位移 */
  const dodge = await page.evaluate(() => {
    const p = Game.playerGroup.position;
    Game.lastMoveDir = { x: 1, z: 0 };
    const x0 = p.x, z0 = p.z;
    Game.dashCd = 0; Game.dashT = 0;
    Game.tryDash();
    const t0 = Game.dashT;
    for (let i = 0; i < 40; i++) Game.updatePlayer(1 / 60);
    return { dist: +Math.hypot(p.x - x0, p.z - z0).toFixed(2), spd: Game.dashSpd, dur: +t0.toFixed(2) };
  });

  /* 3. 怪物落地校验：刷一只，核对血量 / 伤害 / 移速是否与公式一致 */
  const mob = await page.evaluate(() => {
    for (const e of Game.enemies.slice()) e.dead = true;
    Game.enemies.length = 0;
    const e = Game.spawnEnemy('halfork', 2.4, 0, false, 4);
    if (!e) return { err: 'spawn failed' };
    const MB = BALANCE.mob;
    const f = (MB.hpBase || 1) + 4 * MB.hpLv + 16 * MB.hpLv2;
    return {
      lvl: e.level, hp: Math.round(e.maxHp), expectHp: Math.round(e.cfg.hp * f),
      dmg: Math.round(e.dmg), spd: +e.spd.toFixed(2),
      cfgHp: e.cfg.hp, cfgSpd: e.cfg.spd, factor: +f.toFixed(2)
    };
  });

  console.log('基础移速   ', JSON.stringify(walk), '（面板 m/s）');
  console.log('闪避位移   ', JSON.stringify(dodge));
  console.log('怪物落地   ', JSON.stringify(mob));
  console.log('JS 错误    ', errs.length ? errs : '无');
  await browser.close();
})();
