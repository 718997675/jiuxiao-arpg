#!/usr/bin/env node
/* ============================================================
 * [M7.5] 九套骨架 · 出图（人工过剪影用）
 *
 *   node dev/shot-bafo-models.js [输出目录]
 *
 * 默认输出到系统临时目录 `bafo-shots/`。**不进仓库** —— 这是给眼睛看的
 * 中间产物，不是交付物；仓库是公开的 Pages 站点，不往里塞截图。
 *
 * 每只一张：统一的 3/4 视角、统一光照、统一留白。
 * 判断标准只有一个 —— 九张图蒙住名字，能不能认出「这是不同的九只」。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'bafo-shots');
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
  await page.evaluate(() => { Game.startNew('warrior', '刀'); });
  await wait(300);

  const keys = await page.evaluate(() => BafoModels.KEYS);
  for (const k of keys) {
    const b64 = await page.evaluate((key) => {
      const a = BafoModels.build(key, {});
      if (!a) return null;
      /* 让它先动几帧，确认动画不会把模型甩出画面 */
      for (let f = 0; f < 30; f++) updateActorAnim(a, 1 / 60);

      const sc = new THREE.Scene();
      sc.background = new THREE.Color(0x15161c);
      sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x30303c, 1.5));
      const d1 = new THREE.DirectionalLight(0xffffff, 1.15); d1.position.set(8, 12, 9); sc.add(d1);
      const d2 = new THREE.DirectionalLight(0x8090ff, 0.55); d2.position.set(-9, 5, -7); sc.add(d2);
      /* 一块地台，不然不知道脚在哪 */
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(14, 24),
        new THREE.MeshStandardMaterial({ color: 0x23242c, roughness: 0.95 })
      );
      floor.rotation.x = -Math.PI * 0.5;
      sc.add(floor);
      sc.add(a.group);

      a.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(a.group);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(36, 0.875, 0.1, 600);
      const span = Math.max(size.y, size.x * 0.8);
      const dist = span * 1.55 + 3;
      cam.position.set(c.x + dist * 0.62, c.y + span * 0.30, c.z + dist * 0.92);
      cam.lookAt(c);

      const r = Game.renderer;
      const old = new THREE.Vector2(); r.getSize(old);
      r.setSize(700, 800, false);
      r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      r.setSize(old.x, old.y, false);
      return url;
    }, k);

    if (!b64) { console.log('  ✗ ' + k + ' 建不出来'); continue; }
    const buf = Buffer.from(b64.split(',')[1], 'base64');
    const f = path.join(OUT, k + '.png');
    fs.writeFileSync(f, buf);
    console.log('  ' + k.padEnd(11) + ' ' + (buf.length / 1024).toFixed(1) + ' KB  ' + f);
    if (buf.length < 4000) console.log('    ! 图可能是一片空白（' + buf.length + ' 字节）');
  }

  if (errs.length) console.log('报错: ' + JSON.stringify(errs.slice(0, 3)));
  await browser.close();
  console.log('\n输出目录：' + OUT);
})();
