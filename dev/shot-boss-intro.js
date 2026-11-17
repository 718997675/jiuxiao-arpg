#!/usr/bin/env node
/* ============================================================
 * [P15] Boss 剧情演出 · 截图（人工肉眼验收，不进仓库）
 *
 *   NODE_PATH=/tmp/wb-node/node_modules node dev/shot-boss-intro.js
 *
 * 输出 3 张到 /tmp/p15-shot/：
 *   s1-旁白.png / s2-Boss自白.png / s3-玩家代入.png
 * 逐句触发后截图，看黑边 / 字幕 / 身份配色是否到位。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');
const wait = ms => new Promise(r => setTimeout(r, ms));
const OUT = '/tmp/p15-shot';
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1300);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} Game.startNew('warrior', 'P15Shot'); });
  await wait(500);
  /* 直接驱动 UI 接口，不经过 Game 状态机 —— 主循环会推进 tickBossIntro，
   * 那样每张图截到的句子会漂移（先前的坑）。这里只验视觉层。 */
  const names = ['s1-旁白', 's2-Boss1', 's3-Boss2', 's4-Boss3', 's5-玩家'];
  for (let i = 0; i < 5; i++) {
    await page.evaluate((idx) => {
      const cfg = BOSSES.golemking;
      UI.bossIntroOpen(cfg);           /* 每张重开，确保 .open 在 */
      UI.bossIntroLine(cfg.intro[idx], idx + 1, 5);
    }, i);
    await wait(650);   /* 等淡入动画走完 */
    const f = path.join(OUT, names[i] + '.png');
    await page.screenshot({ path: f });
    console.log('  → ' + f);
  }
  await page.evaluate(() => UI.bossIntroClose());
  await browser.close();
  console.log('截图完成：' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
