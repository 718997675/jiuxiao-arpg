/* 验证「自适应画质」这条路真的能跑通 —— 不是看它有没有被触发，
 * 而是直接把它按到每一档，确认 dpr / 阴影 / 粒子倍率都跟着变、且不报错。
 * 用法：node verify-perf.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
/* 跨平台浏览器路径：原来写死 macOS Chrome，Windows 上跑直接崩（[M6] 修） */
const EXE = require('./_chrome');

const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900']
  });
  // deviceScaleFactor=2 模拟 Windows 200% 缩放
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await p.click('#startBtn').catch(() => {});
  await wait(300);
  await p.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 20; Game.recalc(); Game.travelTo('forest'); });
  await wait(2000);

  const out = [];
  const snap = async (tag) => {
    const s = await p.evaluate(() => ({
      dpr: +Game.renderer.getPixelRatio().toFixed(3),
      shadow: Game.renderer.shadowMap.enabled,
      size: Game.sun.shadow.mapSize.x,
      q: FX.q,
      lv: Game.perf.level,
      calls: Game.renderer.info.render.calls,
      geo: Game.renderer.info.memory.geometries,
      fps: Game.perf.fps
    }));
    out.push([tag, s]);
    return s;
  };

  const l0 = await snap('初始（dpr=2 屏幕）');
  console.log('初始 dpr 应被夹到 1.5 →', l0.dpr);

  // 逐档强制降级，确认每一项都跟着走
  for (const lv of [1, 2, 0]) {
    await p.evaluate((lv) => { Game.perf.level = lv; Game.applyPerfLevel(); }, lv);
    await wait(700);
    await snap('强制 L' + lv);
  }

  // 状态机：连续两次低帧率必须降一档
  const auto = await p.evaluate(() => {
    Game.perf.level = 0; Game.applyPerfLevel();
    Game.perf.low = 0; Game.perf.good = 0; Game.perf.warm = 3;
    const feed = () => { Game.perf.acc = 1.99; Game.perf.frames = 20; Game.tickPerf(0.02); };  // 10fps
    feed(); const afterOne = Game.perf.level;
    feed(); const afterTwo = Game.perf.level;
    return { afterOne, afterTwo };
  });
  console.log('低帧率状态机：第1次采样后 L' + auto.afterOne + ' → 第2次采样后 L' + auto.afterTwo + '（应为 0 → 1）');

  // 升档：连续 5 次高帧率才回升
  const up = await p.evaluate(() => {
    Game.perf.low = 0; Game.perf.good = 0;
    const feed = () => { Game.perf.acc = 1.99; Game.perf.frames = 120; Game.tickPerf(0.02); };  // 60fps
    const seq = [];
    for (let i = 0; i < 6; i++) { feed(); seq.push(Game.perf.level); }
    return seq;
  });
  console.log('高帧率回升：' + up.join(' → ') + '（应在第 5 次采样后回到 L0）');

  for (const [tag, s] of out) {
    console.log(`${tag.padEnd(18)} dpr=${s.dpr} 阴影=${s.shadow ? s.size : '关'} 粒子q=${s.q} calls=${s.calls} geo=${s.geo}`);
  }
  console.log('\n报错数:', errs.length, errs.slice(0, 4));
  await b.close();
})();
