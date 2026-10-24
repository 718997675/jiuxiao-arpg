/* ============================================================
 * S3 天赋 / S4 术法 面板展示截图
 *
 *   node dev/shots-s3s4.js
 *
 * 每个职业截 3 张：
 *   shots/s3-talent-<职业>.png   天赋面板（带一套示例加点，按级解锁）
 *   shots/s4-skills-<职业>.png   术法面板（12 技能分系 + 升级 + 变体 + 技能条配置）
 *   shots/s4-hud-<职业>.png      HUD + 5 格技能条（含空位）
 * 另附 1 张动作条特写：shots/s4-bar.png
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLASSES = ['warrior', 'mage', 'taoist'];

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  for (const cls of CLASSES) {
    const p = await b.newPage();
    p.on('pageerror', e => console.log('PAGEERROR(' + cls + '):', String(e).slice(0, 200)));
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + cls, { waitUntil: 'load' });
    await wait(2200);

    /* 搭一套示例 build：每系 10 点——小节点铺开 + 中节点 + 大节点，截出来好看 */
    await p.evaluate(() => {
      const G = Game;
      G.state.level = 40; G.recalc();
      const PLAN = { 1: 3, 2: 1, 3: 1 };   // 每节点计划等级
      for (const tree of TALENTS[G.state.cls]) {
        let budget = 10;
        const nodes = tree.nodes.slice().sort((a, b2) => a.tier - b2.tier || a.pos.x - b2.pos.x);
        for (const n of nodes) {
          if (budget <= 0) break;
          let guard = 0;
          while (G.canAllocTalent(n.id) && budget > 0 && guard++ < PLAN[n.tier]) {
            G.allocTalent(n.id); budget--;
          }
        }
      }
      /* 技能：前 4 个升到 5 级，第 2 个切到变体 Ⅱ，让面板有对比 */
      const order = SKILL_ORDER[G.state.cls];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) G.levelUpSkill(order[i]);
      G.setSkillVariant(order[1], 1);
      /* 技能条手动摆 4 个技能 + 留 1 个空位（看配置效果） */
      G.state.skillbar = [order[0], null, order[4], order[6], order[9]];
      G.skillBar();
      UI.buildActionBar();
      G.recalc();
    });

    await p.evaluate(() => UI.openTalent());
    await wait(600);
    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's3-talent-' + cls + '.png') });

    await p.evaluate(() => UI.openSkill());
    await wait(600);
    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's4-skills-' + cls + '.png') });

    await p.evaluate(() => { UI.closeAll(); });
    await wait(400);
    await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's4-hud-' + cls + '.png') });

    /* 动作条特写：技能图标 + 空位占位 */
    if (cls === CLASSES[0]) {
      const barEl = await p.$('#actionbar');
      if (barEl) await barEl.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's4-bar.png') });
    }

    await p.close();
    console.log(cls + ' 截图完成');
  }

  await b.close();
})().catch(e => { console.error('截图崩溃：', e); process.exit(1); });
