/* ============================================================
 * dev/wbmodels-shot.js —— M18.6 六套骨架的「肉眼验收」截图
 *
 * 为什么必须截图：
 *   `check-wbmodels.js` 能量出「尺寸 10.4×11.6×14.6、1128 面」，
 *   但量不出「它看起来像不像一条盘着的蛇」「斧头有没有插在土里」
 *   「九条尾巴是不是糊成一团」。骨架的成败是视觉问题，只能看图。
 *
 * 做法：在页面里盖一个独立 canvas + renderer（不碰 Game.scene），
 *   六只按真实尺寸排一排，用三盏灯打亮，渲完直接 toDataURL 存盘。
 *   **不复用游戏相机**：渲染循环每帧会把相机拉回玩家身后，抢不过它。
 *
 * 用法：node dev/wbmodels-shot.js
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXE = require('./_chrome');
const OUT = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1400,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1200);
  await page.click('#startBtn').catch(() => {});
  await wait(200);

  /* 独立舞台：一个 canvas + 一个 renderer，和游戏渲染完全分开 */
  await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.id = 'wbmShot';
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#0d1117';
    document.body.appendChild(cv);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(1400, 900);
    r.setClearColor(0x0d1117, 1);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfeaff, 0x2a3038, 1.35));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.15); d1.position.set(60, 90, 70); sc.add(d1);
    const d2 = new THREE.DirectionalLight(0x9ac8ff, 0.55); d2.position.set(-70, 40, -60); sc.add(d2);
    /* 地面网格：没有它看不出「脚是不是离地 / 陷进地里」 */
    const grid = new THREE.GridHelper(400, 40, 0x3a4652, 0x222a33);
    sc.add(grid);
    window.__stage = { cv, r, sc };
  });

  /* 六只各拍一张特写 + 一张合影 */
  const shots = await page.evaluate(() => {
    const { r, sc } = window.__stage;
    const out = [];
    const ORDER = WORLD_BOSS_ORDER;
    const built = {};
    for (const id of ORDER) {
      const d = WORLD_BOSSES[id];
      const a = WBModels.build(d.model, { scale: d.scale, color: d.color, cloth: d.cloth, skin: d.skin });
      if (!a) continue;
      built[id] = a;
    }
    const fit = (a, cam) => {
      /* 按包围盒自动取景：远角 + 略俯视，和游戏里的斜俯视一致 */
      const box = new THREE.Box3().setFromObject(a.group);
      const s = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      const rad = Math.max(s.x, s.y, s.z) * 0.62;
      const dist = rad / Math.tan(cam.fov * Math.PI / 360) * 1.15;
      cam.position.set(c.x + dist * 0.62, c.y + dist * 0.52, c.z + dist * 0.78);
      cam.lookAt(c.x, c.y * 0.85, c.z);
    };
    const cam = new THREE.PerspectiveCamera(36, 1400 / 900, 0.5, 3000);

    for (const id of ORDER) {
      const a = built[id];
      if (!a) continue;
      sc.add(a.group);
      /* 先跑 40 帧动画，让它摆到「活着」的姿势，不是 T-pose */
      a.moving = false;
      for (let i = 0; i < 40; i++) WBModels.anim(a, 1 / 30);
      fit(a, cam);
      r.render(sc, cam);
      out.push({ id, name: WORLD_BOSSES[id].name, url: r.domElement.toDataURL('image/png') });
      sc.remove(a.group);
    }

    /* 合影：按真实尺寸排一排，间距 = 各自半径 + 6 米 */
    let x = 0;
    const placed = [];
    for (const id of ORDER) {
      const a = built[id];
      if (!a) continue;
      a.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(a.group);
      const halfW = (box.max.x - box.min.x) / 2;
      x += halfW + 3;
      a.group.position.x = x;
      x += halfW + 3;
      placed.push(a);
      sc.add(a.group);
      a.moving = false;
      for (let i = 0; i < 40; i++) WBModels.anim(a, 1 / 30);
    }
    const total = x;
    cam.position.set(total * 0.5 + 20, 95, 300);
    cam.lookAt(total * 0.5, 8, 0);
    r.render(sc, cam);
    out.push({ id: 'all', name: '六只合影', url: r.domElement.toDataURL('image/png') });
    return out;
  });

  fs.mkdirSync(OUT, { recursive: true });
  for (const s of shots) {
    const p = path.join(OUT, `wbm-${s.id}.png`);
    fs.writeFileSync(p, Buffer.from(s.url.split(',')[1], 'base64'));
    console.log('  写出 ' + path.relative(ROOT, p) + '  (' + s.name + ')');
  }

  if (errs.length) {
    console.log('\n页面错误：');
    for (const e of errs.slice(0, 6)) console.log('  ✗ ' + e);
  } else {
    console.log('\n无页面错误');
  }
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
