#!/usr/bin/env node
/* ============================================================
 * [M7.6] 五阶段 · 出图（人工过眼睛用）
 *
 *   node dev/shot-bossfinal.js [输出目录]
 *
 * 默认输出到系统临时目录 `bossfinal-shots/`。**不进仓库** —— 仓库是公开的
 * Pages 站点，不往里塞截图。
 *
 * 三张图，对应三件「只能靠眼睛判」的事：
 *   1. P3 场地塌缩 —— 收缩圈画得对不对：边界清不清楚、圈外是不是一眼读成危险
 *   2. P4 血条    —— 五盏灯 + 「第 4 / 5 阶段 · 狂怒」副标题，玩家读不读得出来
 *   3. P5 真身    —— 变身之后模型换了、收缩圈撤了、八臂八首在场上立得住
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'bossfinal-shots');
const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: require('./_chrome'), headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto(TARGET, { waitUntil: 'load' });
  await wait(1300);
  await page.click('#startBtn').catch(() => { });
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;
    Game.invuln = 9999;
  });
  await wait(400);

  /* 摆好场：直接进「无相天」（终 boss 场，arena 图，size 180），
   * 让它落在**真实场地**上 —— 在村庄里拍收缩圈，看到的是一圈围着 NPC 的红线，
   * 根本判断不了这个机制在实战里读不读得出来。 */
  const setup = await page.evaluate(() => {
    Game.loadMap('wuxiang');
    Game.state.stats.hpMax = 1e6; Game.state.hp = 1e6;
    Game.invuln = 9999;
    let e = null;
    for (const x of Game.enemies) if (x.cfg && x.cfg.bafoFinal) e = x;
    if (!e) e = Game.spawnEnemy(null, 0, 0, false, 60, 'chaosavatar');
    e.active = true;
    Game.boss = e; UI.updateBoss(e);
    window.__e = e;
    const p = Game.playerGroup.position;
    p.set(7, 0, 11);
    return { ok: !!e, maxHp: e.maxHp, map: Game.state.mapId, enemies: Game.enemies.length };
  });
  console.log('  场地：' + setup.map + '（' + setup.enemies + ' 个实体）');
  if (!setup.ok) { console.log('  ✗ 终 boss 建不出来'); process.exit(1); }

  /* 用一台临时相机取景（不动 Game.camera，免得影响后面） */
  const shoot = (camSpec) => page.evaluate((spec) => {
    const e = window.__e;
    const sc = Game.scene;
    const cam = new THREE.PerspectiveCamera(spec.fov || 42, 0.875, 0.1, 900);
    cam.position.set(spec.x, spec.y, spec.z);
    cam.lookAt(new THREE.Vector3(spec.lx || 0, spec.ly || 0, spec.lz || 0));
    const r = Game.renderer;
    const old = new THREE.Vector2(); r.getSize(old);
    r.setSize(700, 800, false);
    r.render(sc, cam);
    const url = r.domElement.toDataURL('image/png');
    r.setSize(old.x, old.y, false);
    return url;
  }, camSpec);

  const save = (name, b64) => {
    if (!b64) { console.log('  ✗ ' + name + ' 没出图'); return; }
    const buf = Buffer.from(b64.split(',')[1], 'base64');
    const f = path.join(OUT, name + '.png');
    fs.writeFileSync(f, buf);
    console.log('  ' + name.padEnd(16) + ' ' + (buf.length / 1024).toFixed(1) + ' KB  ' + f);
    if (buf.length < 4000) console.log('    ! 图可能是一片空白（' + buf.length + ' 字节）');
  };

  /* ---------- 1. P3 场地塌缩 ---------- */
  await page.evaluate(() => {
    const e = window.__e;
    e.hp = e.maxHp * 0.58;
    Game.bossFinalTick(e, 0.016);
    /* 推到收到 17 米左右，圈才有存在感（26 米时几乎贴着地图边） */
    for (let i = 0; i < 56; i++) Game.bossFinalTick(e, 0.1);
  });
  save('1-p3-shrink', await shoot({ x: 30, y: 34, z: 34, fov: 46, lx: 0, ly: 0, lz: 0 }));

  /* ---------- 2. P4 血条（五盏灯 + 副标题） ---------- */
  await page.evaluate(() => {
    const e = window.__e;
    e.hp = e.maxHp * 0.33;
    Game.bossFinalTick(e, 0.016);
  });
  {
    const box = await page.evaluate(() => {
      const r = document.getElementById('bossbar').getBoundingClientRect();
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
    });
    await page.screenshot({ path: path.join(OUT, '2-p4-bossbar.png'), clip: box });
    const st = fs.statSync(path.join(OUT, '2-p4-bossbar.png'));
    console.log('  2-p4-bossbar     ' + (st.size / 1024).toFixed(1) + ' KB  ' + path.join(OUT, '2-p4-bossbar.png'));
  }

  /* ---------- 3. P5 真身 ---------- */
  await page.evaluate(() => {
    const e = window.__e;
    e.hp = e.maxHp * 0.22;
    Game.damageEnemy(e, e.maxHp * 5, true, {});
    const p = Game.playerGroup.position;
    p.set(9, 0, 12);
  });
  /* 等变身那一拍的强闪 / 环 / 粒子走完再拍 ——
   * 否则拍到的是「一坨白光盖着地面」，什么都判断不了。
   * **不能只 `wait()`**：headless 软件渲染只有 1~2fps，而游戏循环会把 dt 夹住，
   * 等 1.6 秒真实时间只推进了 0.1 秒游戏时间，环还挂在场上。
   * 所以显式把特效层推完（FX.update 只管粒子 / 飘字 / 环，不碰判定）。 */
  await page.evaluate(() => { for (let i = 0; i < 120; i++) FX.update(1 / 30); });
  await wait(200);
  save('3-p5-trueform', await shoot({ x: 26, y: 16, z: 30, fov: 40, lx: 0, ly: 6, lz: 0 }));
  save('4-p5-wide', await shoot({ x: 40, y: 44, z: 46, fov: 46, lx: 0, ly: 0, lz: 0 }));

  if (errs.length) console.log('报错: ' + JSON.stringify(errs.slice(0, 3)));
  else console.log('报错: 0');
  await browser.close();
})().catch(e => { console.error('出图崩了：', e); process.exit(2); });
