/* 长时间压力测试：模拟真实战斗 3 分钟，采样 GPU 资源与帧率
 * 用法：node stress.js [秒数]
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SEC = parseInt(process.argv[2] || '180', 10);
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: [
      '--no-sandbox', '--enable-webgl', '--use-gl=angle',
      '--enable-precise-memory-info', '--js-flags=--expose-gc',
      '--window-size=1440,900'
    ]
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1500);

  // 进游戏
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 30; Game.recalc();
    Game.travelTo('swamp');
  });
  await wait(2500);

  // 帧率采样钩子
  await p.evaluate(() => {
    window.__frames = 0;
    window.__fps = 0;
    const orig = Game.animate.bind(Game);
    Game.animate = function () {
      window.__frames++;
      orig();
    };
    setInterval(() => { window.__fps = window.__frames; window.__frames = 0; }, 1000);
  });

  const samples = [];
  const t0 = Date.now();
  let lastLog = 0;
  const MAPS = ['swamp', 'forest', 'desert', 'snow'];
  let mapIdx = 0, lastMap = 0;

  while (Date.now() - t0 < SEC * 1000) {
    // 持续战斗：普攻 + 每 4 秒一次技能 + 每 25 秒换图
    await p.evaluate(() => {
      try {
        Game.atkCd = 0; Game.doBasicAttack();
        if (Game.state.hp < Game.state.stats.hpMax * 0.5) Game.state.hp = Game.state.stats.hpMax;
        if (Game.state.mp < Game.state.stats.mpMax * 0.4) Game.state.mp = Game.state.stats.mpMax;
      } catch (e) {}
    }).catch(() => {});
    await wait(320);

    const el = (Date.now() - t0) / 1000;

    // 每 45 秒换一次图：换图是最容易泄漏 GPU 资源的路径，必须压到
    if (el - lastMap >= 45) {
      lastMap = el;
      mapIdx = (mapIdx + 1) % MAPS.length;
      await p.evaluate((m) => { try { Game.travelTo(m); } catch (e) {} }, MAPS[mapIdx]).catch(() => {});
    }

    if (el - lastLog >= 15) {
      lastLog = el;
      const s = await p.evaluate(() => {
        const r = Game.renderer;
        const mem = performance.memory || {};
        return {
          t: Math.round(Game.time),
          geo: r.info.memory.geometries,
          tex: r.info.memory.textures,
          prog: r.info.programs ? r.info.programs.length : -1,
          calls: r.info.render.calls,
          tris: r.info.render.triangles,
          heap: Math.round((mem.usedJSHeapSize || 0) / 1048576),
          fps: window.__fps || 0,
          enemies: (Game.enemies || []).length,
          fxParts: FX.parts.length,
          fxZones: FX.zones.length,
          fxProj: FX.projectiles.length,
          fxTexts: FX.texts.length,
          lights: (() => { let n = 0; Game.scene.traverse(o => { if (o.isLight) n++; }); return n; })(),
          lv: Game.perf ? Game.perf.level : -1,
          dpr: Game.renderer.getPixelRatio().toFixed(2)
        };
      }).catch(e => ({ err: String(e).slice(0, 80) }));
      samples.push(s);
      console.log(`[${String(Math.round(el)).padStart(3)}s] fps=${s.fps} geo=${s.geo} tex=${s.tex} prog=${s.prog} `
        + `calls=${s.calls} tris=${s.tris} heap=${s.heap}MB lights=${s.lights} L${s.lv}@${s.dpr} | `
        + `part=${s.fxParts} zone=${s.fxZones} proj=${s.fxProj} txt=${s.fxTexts} mob=${s.enemies}`);
    }

    // 每 15 秒放一次技能（制造特效）
    if (Math.floor(el) % 15 === 0 && Math.floor(el) > 0) {
      await p.evaluate(() => {
        try {
          const id = SKILL_ORDER[Game.state.cls][0];
          Game.castSkill(id);
        } catch (e) {}
      }).catch(() => {});
    }
  }

  // 收尾
  const alive = await p.evaluate(() => !!(window.Game && Game.running)).catch(() => false);
  const canvasOk = await p.evaluate(() => {
    const c = document.getElementById('gl');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return gl ? !gl.isContextLost() : false;
  }).catch(() => false);

  console.log('\n=== 结论 ===');
  console.log('页面仍在运行:', alive, '| WebGL 上下文正常:', canvasOk);
  console.log('报错数:', errs.length, errs.slice(0, 5));
  if (samples.length > 1) {
    const a = samples[0], z = samples[samples.length - 1];
    console.log(`几何体 ${a.geo} → ${z.geo}   纹理 ${a.tex} → ${z.tex}   program ${a.prog} → ${z.prog}`);
    console.log(`draw call ${a.calls} → ${z.calls}   堆内存 ${a.heap}MB → ${z.heap}MB`);
    console.log(`帧率 ${a.fps} → ${z.fps}`);
  }
  fs.writeFileSync('/tmp/stress-samples.json', JSON.stringify(samples, null, 2));
  await b.close();
})();
