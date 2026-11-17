#!/usr/bin/env node
/* ============================================================
 * [P13-4] 地图风貌 · 出图（每章代表图，供盲测）
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/shot-p13.js [输出目录]
 *
 * 默认输出到系统临时目录 p13-shots/，**不进仓库**（公开 Pages 站点不塞截图）。
 * 判断标准只有一条 —— 去掉 UI、镜头对准地标后，10 张图蒙住名字，
 * 能不能靠「地标形状 + 主色调 + 天气」分出是哪一章。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'p13-shots');
const TARGET = process.env.PROBE_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
/* 每章 2 张代表图：卷五刻意选 4 张 void 里的 2 张看配色是否拉开 */
const PICKS = [
  ['卷一', 'sunset'], ['卷一', 'bonetower'],
  ['卷二', 'magmagully'], ['卷二', 'ashfield'],
  ['卷三', 'forgetshore'], ['卷三', 'abyssdeep'],
  ['卷四', 'swordtomb'], ['卷四', 'cloudbridge'],
  ['卷五', 'jadecapital'], ['卷五', 'starfall']
];

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
  await page.click('#startBtn').catch(() => {});
  await page.evaluate(() => { Game.startNew('warrior', '风貌'); });
  await wait(300);
  /* 去 UI：藏掉 HUD / 迷你地图 / 日志，只留 3D 画布 */
  await page.evaluate(() => {
    const kill = sel => document.querySelectorAll(sel).forEach(e => { e.style.display = 'none'; });
    ['#hud', '#ui', '#minimap', '#log', '#actionbar', '#actionBar', '.hud', '.panel'].forEach(kill);
  });

  for (let i = 0; i < PICKS.length; i++) {
    const [chapter, id] = PICKS[i];
    const info = await page.evaluate((mapId) => {
      Game.loadMap(mapId);
      /* 镜头会每帧跟随玩家 —— 直接把玩家挪到地标旁，比改相机有效。 */
      let lm = null;
      for (const o of Game.world.root.children) {
        if (o.userData && o.userData.p13 && !o.isPoints) { lm = o; break; }
      }
      if (lm) {
        const p = lm.position;
        Game.playerGroup.position.set(p.x, 0, p.z + 13);
        if (Game.state) Game.state.playerPos = { x: p.x, z: p.z + 13 };
      }
      const spec = (typeof MAP_SPECS !== 'undefined' && MAP_SPECS[mapId]) || {};
      return { id: mapId, landmark: spec.landmark, weather: spec.weather, sky: MAPS[mapId].sky.toString(16) };
    }, id).catch(e => ({ id, error: e.message }));
    await wait(900);   /* 等相机 lerp 跟上玩家 */
    const file = path.join(OUT, String(i + 1).padStart(2, '0') + '_' + chapter + '_' + id + '.png');
    await page.screenshot({ path: file });
    console.log('  ' + path.basename(file) + '  地标=' + (info.landmark || '-') +
      ' 天气=' + (info.weather || '-') + ' sky=0x' + (info.sky || '-'));
  }
  await browser.close();
  console.log('\n输出目录:', OUT, '（' + PICKS.length + ' 张，不进仓库）');
  console.log('错误:', errs.length ? errs.slice(0, 3) : 'none');
})().catch(e => { console.error(e); process.exit(1); });
