/* ============================================================
 * dev/minimap-check.js —— P03「小地图方向 + 放大」验收
 *
 * 两段，分开跑：
 *
 *   A. 角度数学（离线，node 直接跑）
 *      「箭头方向不对」这类 bug 靠肉眼很难判断 —— 玩家朝北走、箭头朝东，
 *      在城里转两圈才会发现。所以把「世界朝向 → 画布角度」这段单独拎出来，
 *      四个正方向逐个验：朝 +z（画布向下）箭头必须朝下，朝 +x 朝右，依此类推。
 *      缩放锚点同理：滚轮放大后，鼠标指的那一点必须还在原地（误差 < 8px）。
 *
 *   B. 交互（浏览器）
 *      点小地图能不能开大图、滚轮能不能缩放、Esc / × 能不能关、大图有没有真画出东西。
 *      这一段必须有 DOM，所以放在 puppeteer 里；拿不到 puppeteer 就跳过。
 *
 * 用法：
 *   node dev/minimap-check.js                     # 只跑 A
 *   NODE_PATH=<puppeteer 所在> node dev/minimap-check.js   # A + B
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skip = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, { got: a, want: b, tol });
const head = (t) => console.log('\n— ' + t + ' —');

/* ============================================================
 * A. 离线：角度与缩放
 * ============================================================ */
const game = { playerFace: { x: 0, z: 1 } };
const ctx = vm.createContext({
  console, Math, JSON, Object, Array, Number, String, isFinite,
  Game: game,
  /* 只被 paint() 用到的运行时依赖，这里给最小占位 */
  MAPS: { test: { size: 300, spawns: [], npcs: [] } },
  /* 注意 _fit 认的是 `type === 'circle'` 与 `w/h`，不是 kind/r —— 给错字段
   * 会算出一堆 NaN（cx/cz/span 全 null），看起来像「函数坏了」。 */
  mapZones: () => [
    { id: 'entry', kind: 'entry', type: 'circle', x: 0, z: 100, r: 30, name: '入口' },
    { id: 'sanctum', kind: 'boss', type: 'circle', x: 0, z: -100, r: 30, name: '祭坛' }
  ],
  QuestSys: { activeZones: () => [], readyOf: () => [] },
  giverOfNpc: () => null,
  document: { getElementById: () => null }
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui-minimap.js'), 'utf8'), ctx, { filename: 'src/ui-minimap.js' });
const Minimap = vm.runInContext('Minimap', ctx);

/* 箭头绘制：三角形朝上画（tip 在 (0,-9)），再 rotate(angle)。
 * 所以箭尖方向 = (sin θ, −cos θ)，θ = faceAngle + π/2。 */
function arrowDir(face) {
  game.playerFace = face;
  const th = Minimap._faceAngle() + Math.PI / 2;
  return { x: Math.sin(th), y: -Math.cos(th) };
}
const dirName = (d) => {
  if (d.y > 0.9) return 'down';
  if (d.y < -0.9) return 'up';
  if (d.x > 0.9) return 'right';
  if (d.x < -0.9) return 'left';
  return '斜的(' + d.x.toFixed(2) + ',' + d.y.toFixed(2) + ')';
};

head('一、箭头四方向（世界 +z 在画布上是向下）');
const cases = [
  [{ x: 0, z: 1 }, 'down', '朝 +z（南）→ 箭头朝下'],
  [{ x: 1, z: 0 }, 'right', '朝 +x（东）→ 箭头朝右'],
  [{ x: 0, z: -1 }, 'up', '朝 −z（北）→ 箭头朝上'],
  [{ x: -1, z: 0 }, 'left', '朝 −x（西）→ 箭头朝左']
];
for (const [face, want, msg] of cases) {
  const d = arrowDir(face);
  ok(dirName(d) === want, msg, dirName(d));
}

/* 旧写法 `g.rotate(atan2(x, z))` —— 没有 +π/2，等价于把朝上的三角形
 * 直接按 atan2 转。朝 +z 时 atan2 = 0，箭头仍朝上，而 +z 在画布上是向下，
 * 于是「朝南走、箭头指北」。这条断言把旧行为钉住，免得以后有人改回去。 */
const oldDir = (face) => {
  const a = Math.atan2(face.x, face.z);
  return { x: Math.sin(a), y: -Math.cos(a) };
};
ok(dirName(oldDir({ x: 0, z: 1 })) === 'up',
  '旧写法朝 +z 时箭头朝上（确实反了，反向验证）', dirName(oldDir({ x: 0, z: 1 })));

head('二、缩放锚点与边界');
/* 造一个大图视图：base 缩放 2 px/米，初始 1.0× */
Minimap.big = {
  open: true, zoom: 1, cx: 0, cz: 0,
  fit: { cx: 0, cz: 0, span: 180 }, base: 2, W: 720, H: 720, drag: null, pinch: 0
};
const worldAt = (mx, my) => {
  const b = Minimap.big, R = b.W / 2, s = b.base * b.zoom;
  return { x: b.cx + (mx - R) / s, z: b.cz + (my - R) / s };
};
const before = worldAt(500, 240);
Minimap._zoomAt(500, 240, 1.16);
const after = worldAt(500, 240);
near(after.x, before.x, 8 / (Minimap.big.base * Minimap.big.zoom), '放大后鼠标下的世界坐标不变（X）');
near(after.z, before.z, 8 / (Minimap.big.base * Minimap.big.zoom), '放大后鼠标下的世界坐标不变（Z）');
ok(Minimap.big.zoom > 1, 'zoom 确实变了', Minimap.big.zoom);

/* 缩到 0.5× 后继续缩，必须夹住 */
for (let i = 0; i < 40; i++) Minimap._zoomAt(360, 360, 1 / 1.16);
near(Minimap.big.zoom, 0.5, 1e-9, '缩小下限 0.5×');
for (let i = 0; i < 60; i++) Minimap._zoomAt(360, 360, 1.16);
near(Minimap.big.zoom, 4, 1e-9, '放大上限 4×');

/* 平移边界：不能拖到「地图外面全是黑」 */
Minimap.big.cx = 99999; Minimap.big.cz = -99999;
Minimap._clampPan();
ok(Math.abs(Minimap.big.cx) <= Minimap.big.fit.span * 0.9 + 1e-6, '平移 X 被夹在 ±0.9 span 内', Minimap.big.cx);
ok(Math.abs(Minimap.big.cz) <= Minimap.big.fit.span * 0.9 + 1e-6, '平移 Z 被夹在 ±0.9 span 内', Minimap.big.cz);

head('三、整图适配');
const fit = Minimap._fit({ mapId: 'test' }, { size: 300 });
ok(fit.span >= 45, 'span 下限 45 米（小图不过度放大）', fit.span);
ok(Math.abs(fit.cx) < 1e-9 && Math.abs(fit.cz) < 1e-9, '包围盒中心 = 两张区的中点（0,0）', fit);

/* ============================================================
 * B. 浏览器：点击 / 缩放 / 关闭
 * ============================================================ */
(async () => {
  let puppeteer = null;
  try { puppeteer = require('puppeteer-core'); } catch (e) { /* 没装就跳过 */ }
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(f => fs.existsSync(f));
  if (!puppeteer || !exe) {
    console.log('\n（跳过浏览器段：' + (!puppeteer ? '找不到 puppeteer-core，设 NODE_PATH' : '找不到 Chrome') + '）');
    skip++;
  } else {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const browser = await puppeteer.launch({
      executablePath: exe, headless: 'new',
      args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await wait(1200);
    await page.evaluate(() => { Game.startNew('warrior', 'T'); Game.travelTo('forest'); });
    await wait(1200);
    /* 点击监听是在 Minimap.draw 里第一次绑的（每帧都跑，不能每帧 addEventListener）。
     * headless + swiftshader 一帧要几百毫秒，所以等「真的画过一帧」再点，
     * 否则点在一个还没绑事件的容器上，测出来是假阴性。 */
    for (let i = 0; i < 40; i++) {
      const b = await page.evaluate(() => !!document.getElementById('miniWrap')._bound);
      if (b) break;
      await wait(200);
    }

    head('四、大图交互（浏览器）');
    const opened = await page.evaluate(() => {
      document.getElementById('miniWrap').click();
      return {
        open: document.getElementById('mapBig').classList.contains('open'),
        cv: !!document.getElementById('mapBigCv'),
        zoom: Minimap.big.zoom
      };
    });
    ok(opened.open, '点小地图能打开大图', opened);
    ok(opened.cv, '大图画布存在', opened);

    /* 画布真的画出东西了吗：取中心 40×40 采样，不能全黑。
     * 大图是在 Minimap.draw 里顺带重画的（跟主循环同频），而 headless +
     * swiftshader 一帧要几百毫秒 —— 所以这里轮询等它画出来，不能「等一下再看」，
     * 否则 1fps 的机器上必然读到一张还没画过的空画布（假阴性）。 */
    let painted = { lit: 0, total: 1600 };
    for (let i = 0; i < 40; i++) {
      painted = await page.evaluate(() => {
        const cv = document.getElementById('mapBigCv');
        const g = cv.getContext('2d');
        const d = g.getImageData(cv.width / 2 - 20, cv.height / 2 - 20, 40, 40).data;
        let lit = 0;
        for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 30) lit++;
        return { lit, total: d.length / 4 };
      });
      if (painted.lit > painted.total * 0.2) break;
      await wait(200);
    }
    ok(painted.lit > painted.total * 0.2, '大图上真的画了东西（不是空画布）', painted);

    /* 滚轮缩放：在画布上滚一格，zoom 必须变大、标签跟着变 */
    const zoomed = await page.evaluate(() => {
      const cv = document.getElementById('mapBigCv');
      const r = cv.getBoundingClientRect();
      const before = Minimap.big.zoom;
      cv.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120, clientX: r.left + r.width * 0.7, clientY: r.top + r.height * 0.3,
        bubbles: true, cancelable: true
      }));
      return { before, after: Minimap.big.zoom, label: document.getElementById('mapBigZoom').textContent };
    });
    ok(zoomed.after > zoomed.before, '滚轮向上 → 放大', zoomed);
    ok(/×$/.test(zoomed.label) && parseFloat(zoomed.label) > 1, '缩放倍率标签跟着变', zoomed);

    /* 拖动画布：中心点必须移动 */
    const dragged = await page.evaluate(() => {
      const cv = document.getElementById('mapBigCv');
      const r = cv.getBoundingClientRect();
      const cx0 = Minimap.big.cx;
      const down = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
        clientX: x, clientY: y, bubbles: true, pointerId: 1
      }));
      down('pointerdown', r.left + 300, r.top + 300);
      down('pointermove', r.left + 340, r.top + 300);
      down('pointerup', r.left + 340, r.top + 300);
      return { moved: Minimap.big.cx !== cx0 };
    });
    ok(dragged.moved, '按住拖动可以平移', dragged);

    /* Esc 关闭（Game 的 keydown 分支） */
    const esc = await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.getElementById('mapBig').classList.contains('open');
    });
    ok(esc === false, 'Esc 关闭大图', esc);

    /* × 关闭 */
    const closed = await page.evaluate(() => {
      document.getElementById('miniWrap').click();
      const on = document.getElementById('mapBig').classList.contains('open');
      document.getElementById('mapBigClose').click();
      return { on, off: document.getElementById('mapBig').classList.contains('open') };
    });
    ok(closed.on && closed.off === false, '右上角 × 能关闭', closed);

    /* 关掉面板时大图也要一起收（UI.closeAll 的约定） */
    const withPanel = await page.evaluate(() => {
      document.getElementById('miniWrap').click();
      UI.closeAll();
      return document.getElementById('mapBig').classList.contains('open');
    });
    ok(withPanel === false, 'UI.closeAll 会顺手收掉大图（不会留下挡屏的一层）', withPanel);

    await browser.close();
    console.log('\n错误日志: ' + (errs.length ? errs.join('\n') : '（无）'));
    if (errs.length) fail++;
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + '全部通过（' + pass + ' 项' + (skip ? '，跳过 ' + skip + ' 段' : '') + '）');
  if (fail) { console.log('失败 ' + fail + ' 项'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
