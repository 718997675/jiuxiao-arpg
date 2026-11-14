#!/usr/bin/env node
/* ============================================================
 * 剪影出图 · **真实链路**（SKFX 为准）· §13 人眼验收的正尺子
 *
 *   NODE_PATH=<node_modules> node dev/vfx-shot-live.js
 *   NODE_PATH=<node_modules> node dev/vfx-shot-live.js --all
 *   NODE_PATH=<node_modules> node dev/vfx-shot-live.js --ids whirl chain heal
 *
 * ---------------- 为什么另起一把尺子 ----------------
 * U1 定了双演出层以 `src/sfx.js`（SKFX）为准：`Game.playSkillVfx` 里 37 只技能
 * 全部 `SKFX.play` 后 **return**，正常游戏一次配方层都不播。
 * `dev/vfx-shot.js` 拍的是 `VFX.playFor`（配方层 = 回落路径 + 15 位剪影数据层），
 * 拿它的图去勾 §13 第 1 条「同职业 5 招灰度后认出 ≥4」，勾的是玩家看不到的东西。
 * 本脚本改走 `Game.playSkillVfx(id, ctx)`，量玩家眼睛真正收到的帧。
 * 老尺子保留、判据不动，两层结论在 §13 里分开写。
 *
 * ---------------- 出图为什么不用 canvas.screenshot ----------------
 * 本机没有 Chromium，`dev/_pptr.js` 落到 Safari WebDriver；门面的 `$()` 返回对象
 * **没有 screenshot()**（W3C 只有整窗口 `/screenshot`），`vfx-shot.js` 那种
 * `canvas.screenshot({path})` 在这台机器直接 TypeError。
 * 这里改成：页面内 `drawImage(gl)` → 2D canvas → `toDataURL()` → Node 写 PNG。
 * 灰度、五连拼版也都在页面 2D canvas 里做（项目没有 node 图像库 / PIL），
 * 于是 Chromium 与 Safari 两条路出的是同一种图。
 *
 * ---------------- 量法（与 vfx-skill-vis --live 对齐）----------------
 * 停主循环 → 清 FX / VFX / SKFX 两层 → 随机数按配方键派生 → 取底帧 →
 * 播 → `FX.update` 拆 ≤0.04 小步并在每步前 `SKFX.sync`（`FX.update` 内部已经
 * 调 `SKFX.update`，再推一次是双倍时间轴；不拆步则 SKFX 把 dt 夹到 0.05，
 * 带 delay / seq 的招根本没开场）→ 60 / 250 / 600ms 三帧 → `gl.finish()`
 * 读完整帧 → 取**差异像素最大**那一帧当「高光截图」。
 * 另外输出 20×14 的二值剪影描述子，用来给「四领域剪影互不相同」一个机器旁证。
 *
 * 产出（shots/vfx-live/）：
 *   <id>.png / <id>-gray.png / <id>-sil.png / <id>-zoom.png
 *                                   彩色 / 灰度 / 去背景净剪影 / 净剪影自动裁切放大
 *   sheet-<warrior|mage|taoist>.png  同职业 5 招三行：彩色 / 灰度 / 放大净剪影
 *                                    （§13 第 1 条只按「灰度原帧」那一行人眼判，
 *                                      第三行是形状辅助，不替换判据）
 *   sheet-fields.png / sheet-enchant.png
 *   report.json                   逐只差异像素 + 剪影描述子 + 旋转采样
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* PLAN §13 第 4 条写的是「太极 / 火墙 / 毒雾 / 雷云」，实现里四个持续领域是
 * firewall / blizzard / thundercloud / swordarray（U6-2 真机口径）；
 * taiji 是 cast:'self' 的自身增益、poison 是 DoT。两组都拍，结论里写明归属。 */
const FIELD_IDS = ['firewall', 'blizzard', 'thundercloud', 'swordarray', 'taiji', 'poison'];
const ENCHANT_ELEMS = ['phys', 'fire', 'ice', 'lightning', 'poison', 'sigil'];
const ENCHANT_NAMES = ['白刃 phys', '流火 fire', '霜刃 ice', '惊雷 lightning', '蚀毒 poison', '圣辉 sigil'];

(async () => {
  const argv = process.argv.slice(2);
  const useAll = argv.indexOf('--all') >= 0;
  const idsArg = argv.indexOf('--ids');
  const explicit = idsArg >= 0 ? argv.slice(idsArg + 1).filter(a => a.indexOf('--') !== 0) : [];

  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  const shotDir = path.resolve(__dirname, '..', 'shots', 'vfx-live');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
  const save = (name, dataUrl) => {
    if (!dataUrl) return 0;
    const buf = Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(shotDir, name), buf);
    return buf.length;
  };

  const meta = await p.evaluate(() => {
    Game.camDist = 9.5;
    Game.camHeight = 13.5;
    Game.camYaw = 0.35;
    Game.playerGroup.position.set(0, 0, 0);
    Game.enemies.length = 0;
    Game.running = false;
    const names = {}, radius = {}, self = {};
    for (const id of Object.keys(SKILLS)) {
      const sk = SKILLS[id] || {};
      names[id] = sk.name || id;
      radius[id] = Number(sk.radius) || 3;
      self[id] = sk.cast === 'self';
    }
    return {
      order: (typeof SKILL_ORDER !== 'undefined') ? SKILL_ORDER : {},
      names: names, radius: radius, self: self,
      has: (typeof SKFX !== 'undefined' && SKFX.keys) ? SKFX.keys() : []
    };
  });
  await wait(600);

  const cls5 = {};
  for (const cls of ['warrior', 'mage', 'taoist']) {
    cls5[cls] = (meta.order[cls] || []).filter(id => meta.has.indexOf(id) >= 0).slice(0, 5);
  }
  const classIds = [].concat(cls5.warrior, cls5.mage, cls5.taoist);
  const fieldIds = FIELD_IDS.filter(id => meta.has.indexOf(id) >= 0);
  let list;
  if (explicit.length) list = explicit.slice();
  else if (useAll) list = meta.has.slice();
  else list = classIds.concat(fieldIds.filter(id => classIds.indexOf(id) < 0));
  list = list.filter((x, i) => list.indexOf(x) === i && meta.has.indexOf(x) >= 0);

  console.log('一、真实链路出图 · ' + list.length + ' 只（层 = SKFX，入口 = Game.playSkillVfx）');
  console.log('  同职业 5 招：warrior ' + cls5.warrior.join('/') +
    ' · mage ' + cls5.mage.join('/') + ' · taoist ' + cls5.taoist.join('/'));

  /* ---------- 页面里的公共量法，装一次，后面每只技能都调它 ---------- */
  await p.evaluate(() => {
    const W = 500, H = 330;
    window.__W = W; window.__H = H;
    window.__frames = {};
    window.__seedFor = (key) => {
      let seed = 0;
      for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
      return seed || 1;
    };
    window.__wipe = () => {
      FX.clear();
      if (typeof VFX !== 'undefined' && VFX.reset) VFX.reset();
      if (typeof SKFX !== 'undefined' && SKFX.clear) SKFX.clear();
    };
    window.__step = (t) => {
      let left = t;
      while (left > 0.0001) {
        const d = Math.min(0.04, left);
        if (typeof SKFX !== 'undefined' && SKFX.sync) {
          SKFX.sync(Game.playerGroup.position, 0, Game.enemies, Game.playerGroup, null);
        }
        FX.update(d);
        left -= d;
      }
    };
    /* 一只技能 = 清场 → 底帧 → 播 → 三帧取样 → 选差异最大的一帧 */
    window.__shoot = (it) => {
      const gl = document.getElementById('gl');
      const W = window.__W, H = window.__H;
      const big = document.createElement('canvas');
      big.width = gl.width; big.height = gl.height;
      const bx = big.getContext('2d', { willReadFrequently: true });
      const small = document.createElement('canvas');
      small.width = W; small.height = H;
      const sx = small.getContext('2d', { willReadFrequently: true });
      const grayCv = document.createElement('canvas');
      grayCv.width = W; grayCv.height = H;
      const gx = grayCv.getContext('2d', { willReadFrequently: true });
      /* 净剪影：把背景压成近黑，只留这一发特效的灰度。
       * §13 第 1 条要人眼在灰度里认形状，宽机位下村庄背景会抢走全部注意力；
       * 这一行是**辅助判据**，不是替换「灰度原帧」那一行。 */
      const silCv = document.createElement('canvas');
      silCv.width = W; silCv.height = H;
      const lx = silCv.getContext('2d', { willReadFrequently: true });
      const grab = () => {
        Game.renderer.render(Game.scene, Game.camera);
        Game.renderer.getContext().finish();
        bx.drawImage(gl, 0, 0);
        sx.drawImage(big, 0, 0, W, H);
        return {
          full: bx.getImageData(0, 0, big.width, big.height).data,
          small: sx.getImageData(0, 0, W, H).data
        };
      };
      const count = (A, B) => {
        let diff = 0;
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]),
            Math.abs(A[i + 2] - B[i + 2]));
          if (d >= 8) diff++;
        }
        return diff;
      };
      /* 剪影描述子从**放大后的净剪影**取，不从原帧取。
       * 第一版用原帧 20×14，宽机位下小特效只占几格：whirl / warcry 距离 0，
       * 人眼却明显一个横条一个圆弧 —— 是尺子太粗，不是演出一样。
       * 现在 40×26、按放大净剪影的亮度取，颜色 / 亮度无关。 */
      const maskOfZoom = (cv) => {
        const GX = 40, GY = 26, out = new Array(GX * GY).fill(0);
        const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
        const cw = W / GX, ch = H / GY;
        for (let y = 0; y < H; y++) {
          const gy = Math.min(GY - 1, (y / ch) | 0);
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            if (l > 40) out[gy * GX + Math.min(GX - 1, (x / cw) | 0)] = 1;
          }
        }
        return out.join('');
      };

      window.__wipe();
      const rnd0 = Math.random;
      let seed = window.__seedFor(it.key || it.id);
      Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const A = grab();
      const pp = Game.playerGroup.position;
      const base = it.self ? pp.z : pp.z + 3;
      const aim = it.self
        ? new THREE.Vector3(pp.x, 0, base)
        : new THREE.Vector3(pp.x, 0, base + Math.max(2, it.radius));
      const ctx = {
        pos: new THREE.Vector3(pp.x, 0, base), aim: aim,
        dir: new THREE.Vector3(0, 0, 1), radius: it.radius
      };
      let played = 0, err = null, frames = [];
      try {
        played = Game.playSkillVfx(it.id, ctx);
        const take = (tag) => {
          const B = grab();
          const diff = count(A.full, B.full);
          const color = small.toDataURL('image/png');
          gx.drawImage(big, 0, 0, W, H);
          const im = gx.getImageData(0, 0, W, H);
          for (let i = 0; i < im.data.length; i += 4) {
            const l = (im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114) | 0;
            im.data[i] = im.data[i + 1] = im.data[i + 2] = l;
          }
          gx.putImageData(im, 0, 0);
          const sil = lx.getImageData(0, 0, W, H);
          /* gx 此刻是原帧灰度；从它拷出来再按差异掩膜压背景 */
          const grayData = gx.getImageData(0, 0, W, H);
          for (let i = 0; i < sil.data.length; i += 4) {
            const d = Math.max(Math.abs(A.small[i] - B.small[i]),
              Math.abs(A.small[i + 1] - B.small[i + 1]),
              Math.abs(A.small[i + 2] - B.small[i + 2]));
            const on = d >= 8;
            sil.data[i] = on ? grayData.data[i] : 14;
            sil.data[i + 1] = on ? grayData.data[i + 1] : 14;
            sil.data[i + 2] = on ? grayData.data[i + 2] : 18;
            sil.data[i + 3] = 255;
          }
          lx.putImageData(sil, 0, 0);
          /* 自动裁切放大：宽机位下特效只占 500×330 里几十像素，
           * 五张并排时人眼根本比不了形状。按差异包围盒裁一个与画幅同比例的窗，
           * 再放大到整格。**只用于辅助那一行**，§13 第 1 条仍判「灰度原帧」。 */
          let minX = W, minY = H, maxX = 0, maxY = 0, hit = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              const d = Math.max(Math.abs(A.small[i] - B.small[i]),
                Math.abs(A.small[i + 1] - B.small[i + 1]),
                Math.abs(A.small[i + 2] - B.small[i + 2]));
              if (d < 8) continue;
              hit++;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          const zoomCv = document.createElement('canvas');
          zoomCv.width = W; zoomCv.height = H;
          const zx = zoomCv.getContext('2d');
          zx.fillStyle = '#0e0e12'; zx.fillRect(0, 0, W, H);
          if (hit > 0) {
            const pad = Math.max(28, Math.round(Math.max(maxX - minX, maxY - minY) * 0.28));
            let x0 = Math.max(0, minX - pad), x1 = Math.min(W, maxX + pad);
            let y0 = Math.max(0, minY - pad), y1 = Math.min(H, maxY + pad);
            /* 把窗撑到 500:330，不足的部分往两边补，避免拉伸变形 */
            const asp = W / H;
            let sw = x1 - x0, sh = y1 - y0;
            if (sw / sh > asp) {
              const nh = sw / asp, c = (y0 + y1) / 2;
              y0 = c - nh / 2; y1 = c + nh / 2;
            } else {
              const nw = sh * asp, c = (x0 + x1) / 2;
              x0 = c - nw / 2; x1 = c + nw / 2;
            }
            /* 越界时整体平移回画幅内 */
            if (x0 < 0) { x1 -= x0; x0 = 0; }
            if (y0 < 0) { y1 -= y0; y0 = 0; }
            if (x1 > W) { x0 -= x1 - W; x1 = W; }
            if (y1 > H) { y0 -= y1 - H; y1 = H; }
            zx.drawImage(silCv, Math.max(0, x0), Math.max(0, y0),
              Math.max(1, x1 - x0), Math.max(1, y1 - y0), 0, 0, W, H);
          }
          frames.push({ tag: tag, diff: diff, color: color,
            gray: grayCv.toDataURL('image/png'),
            sil: silCv.toDataURL('image/png'),
            zoom: zoomCv.toDataURL('image/png'), mask: maskOfZoom(zoomCv) });
        };
        window.__step(0.06); take('60ms');
        window.__step(0.19); take('250ms');
        window.__step(0.35); take('600ms');
      } catch (e) { err = String((e && e.message) || e); }
      Math.random = rnd0;
      window.__wipe();

      let best = frames[0] || null;
      for (const f of frames) if (!best || f.diff > best.diff) best = f;
      if (best) window.__frames[it.id] = {
        color: best.color, gray: best.gray, sil: best.sil, zoom: best.zoom
      };
      return {
        id: it.id, played: played, err: err,
        diff: best ? best.diff : 0,
        frame: best ? best.tag : '-',
        mask: best ? best.mask : '',
        d60: frames[0] ? frames[0].diff : 0,
        d250: frames[1] ? frames[1].diff : 0,
        d600: frames[2] ? frames[2].diff : 0
      };
    };
  });

  /* ---------- 冷启动暖机（U1 口径，结果丢弃）---------- */
  await p.evaluate(() => {
    const it = { id: 'fireball', radius: 3, self: false, key: 'fireball' };
    window.__wipe();
    const pp = Game.playerGroup.position;
    Game.playSkillVfx(it.id, {
      pos: new THREE.Vector3(pp.x, 0, pp.z + 3),
      aim: new THREE.Vector3(pp.x, 0, pp.z + 6),
      dir: new THREE.Vector3(0, 0, 1), radius: 3
    });
    window.__step(0.32);
    Game.renderer.render(Game.scene, Game.camera);
    Game.renderer.getContext().finish();
    window.__wipe();
  });

  const rows = [];
  for (const id of list) {
    const it = {
      id: id, radius: meta.radius[id] || 3, self: !!meta.self[id],
      key: (typeof id === 'string') ? id : id
    };
    /* 与 vfx-skill-vis 一致：种子按配方键派生；这里没有 vfxSlotKey 直接用 id，
     * 出图的用途是「认不认得出」，不是跨版本比绝对像素，不受共剪影影响。 */
    const r = await p.evaluate(x => window.__shoot(x), it);
    /* 两张 PNG 都从页面取回（dataURL 留在 window.__frames，不用来回搬第二趟） */
    const pngs = await p.evaluate(sid => window.__frames[sid] || null, id);
    if (pngs) {
      save(id + '.png', pngs.color);
      save(id + '-gray.png', pngs.gray);
      save(id + '-sil.png', pngs.sil);
      save(id + '-zoom.png', pngs.zoom);
    }
    rows.push({ ...r, name: meta.names[id] || id, bytes: pngs ? pngs.color.length : 0 });
    ok(!r.err, id + ' 真实链路推进不抛错', r.err);
    ok(r.diff > 0, id + ' 不是空画面（有差异像素）', { diff: r.diff, played: r.played });
    ok(!!pngs, id + ' 出图成功', pngs ? pngs.color.length : 0);
  }
  console.log('  ' + '技能'.padEnd(16) + '名称'.padEnd(12) + '差异像素'.padStart(10) +
    '  60/250/600ms'.padEnd(20) + '高光帧');
  for (const r of rows) {
    console.log('  ' + String(r.id).padEnd(16) + String(r.name).padEnd(12) +
      String(r.diff).padStart(10) + ('  ' + r.d60 + '/' + r.d250 + '/' + r.d600).padEnd(20) + r.frame);
  }

  /* ---------- 五连拼版（页面内合成，彩色一行 + 灰度一行）---------- */
  const groups = [];
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const ids = cls5[cls].filter(x => list.indexOf(x) >= 0);
    if (ids.length) groups.push({ name: cls, ids: ids, titles: ids.map(x => meta.names[x] || x) });
  }
  const fids = fieldIds.filter(x => list.indexOf(x) >= 0);
  if (fids.length) groups.push({ name: 'fields', ids: fids, titles: fids.map(x => meta.names[x] || x) });

  if (groups.length) {
    const sheets = await p.evaluate(async (gs) => {
      const W = window.__W, H = window.__H, PAD = 8, LABEL = 26;
      const load = src => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('拼版加载帧失败'));
        im.src = src;
      });
      const out = {};
      for (const g of gs) {
        const cv = document.createElement('canvas');
        cv.width = W * g.ids.length + PAD * (g.ids.length + 1);
        const yL = [], yI = [];
        for (let row = 0; row < 3; row++) {
          yL[row] = PAD + row * (H + LABEL + PAD);
          yI[row] = yL[row] + LABEL;
        }
        cv.height = yI[2] + H + PAD;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#111116';
        cx.fillRect(0, 0, cv.width, cv.height);
        const ROW_LABEL = ['彩色原帧', '灰度原帧（§13 第 1 条判这一行）',
          '灰度净剪影 · 自动裁切放大（辅助）'];
        for (let i = 0; i < g.ids.length; i++) {
          const f = window.__frames[g.ids[i]];
          if (!f) continue;
          const x = PAD + i * (W + PAD);
          const imgs = [await load(f.color), await load(f.gray), await load(f.zoom)];
          for (let row = 0; row < 3; row++) cx.drawImage(imgs[row], x, yI[row], W, H);
          cx.fillStyle = '#ffffff';
          cx.font = 'bold 18px sans-serif';
          cx.fillText(g.titles[i] + '  (' + g.ids[i] + ')', x + 8, yL[0] + 18);
          for (let row = 1; row < 3; row++) {
            cx.fillStyle = row === 1 ? '#9ad8ff' : '#ffd166';
            cx.fillText(ROW_LABEL[row], x + 8, yL[row] + 18);
          }
        }
        out[g.name] = cv.toDataURL('image/png');
      }
      return out;
    }, groups);
    for (const g of groups) {
      const sz = save('sheet-' + g.name + '.png', sheets[g.name]);
      ok(sz > 6000, 'sheet-' + g.name + ' 拼版不是空白（PNG ' + sz + ' B）', sz);
    }
  }

  /* ---------- 四领域剪影两两距离（机器旁证，人眼仍看 sheet-fields）---------- */
  const fieldRows = rows.filter(r => fieldIds.indexOf(r.id) >= 0);
  const dist = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  };
  console.log('\n二、领域 / PLAN 字面六只：放大净剪影 40×26 二值描述子两两汉明距离');
  const pairs = [];
  for (let i = 0; i < fieldRows.length; i++) {
    for (let j = i + 1; j < fieldRows.length; j++) {
      pairs.push({ a: fieldRows[i].id, b: fieldRows[j].id,
        d: dist(fieldRows[i].mask, fieldRows[j].mask) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  for (const q of pairs.slice(0, 8)) console.log('  ' + q.a.padEnd(16) + q.b.padEnd(16) + q.d);
  const real4 = ['firewall', 'blizzard', 'thundercloud', 'swordarray']
    .filter(x => fieldRows.some(r => r.id === x));
  const realPairs = pairs.filter(q => real4.indexOf(q.a) >= 0 && real4.indexOf(q.b) >= 0);
  /* `--ids` 单跑一两只时不该因为「没拍领域」报红 —— 这不是回归，是清单没齐 */
  if (real4.length === 4) {
    ok(realPairs.length === 6, '四个真实领域凑齐 6 组两两对比', realPairs.length);
    ok(realPairs.every(q => q.d >= 8), '四个真实领域剪影两两不同（汉明距离 ≥8）',
      realPairs.map(q => q.a + '/' + q.b + ':' + q.d));
  } else {
    console.log('  （本次只拍了 ' + real4.length + '/4 只真实领域，剪影两两判据跳过；全量跑才判）');
  }
  /* 同职业 5 招也把最近的一对打出来：人眼结论要能和机器读数对得上，
   * 出现「人眼说分得出、机器说 0」时先怀疑尺子（20×14 那版就踩过）。 */
  console.log('  同职业 5 招最近的一对：');
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const ids = cls5[cls].filter(x => rows.some(r => r.id === x));
    let near = null;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = rows.find(r => r.id === ids[i]), b2 = rows.find(r => r.id === ids[j]);
        const d = dist(a.mask, b2.mask);
        if (!near || d < near.d) near = { d: d, a: ids[i], b: ids[j] };
      }
    }
    if (near) console.log('    ' + cls.padEnd(9) + near.a + ' / ' + near.b + ' = ' + near.d);
  }

  /* ---------- 旋风斩 1 秒逐帧（§13 第 2 条）---------- */
  const spin = await p.evaluate(() => {
    window.__wipe();
    const pp = Game.playerGroup.position;
    Game.playSkillVfx('whirl', {
      pos: new THREE.Vector3(pp.x, 0, pp.z),
      aim: new THREE.Vector3(pp.x, 0, pp.z + 4),
      dir: new THREE.Vector3(0, 0, 1), radius: 4.2
    });
    const samples = [];
    for (let k = 0; k <= 10; k++) {
      if (k > 0) window.__step(0.1);
      const grps = [];
      SKFX.scene.traverse(o => {
        if (o.type !== 'Group' && !o.isGroup) return;
        const kids = (o.children || []).filter(c => c.isGroup);
        if (kids.length >= 2) grps.push({ rot: o.rotation.y, blades: kids.length });
      });
      samples.push({ t: k / 10, grps: grps });
    }
    window.__wipe();
    return samples;
  });
  /* 只认「转起来」的那一层：piv 子组也有 2 个 Group 孩子，但它 rotation.y 恒定；
   * ROOT 自己也可能有 ≥2 个 Group 孩子且 rot 恒为 0。所以每层取该帧最大 rot，
   * 再只累加**相邻采样帧之间的正向增量** —— 恒定层贡献 0，真正在转的层才计数。 */
  const spinGroups = spin.map(s => s.grps.filter(g => g.blades >= 2));
  const alive = spin.map((s, i) => ({
    t: s.t,
    blades: spinGroups[i].length ? Math.max(...spinGroups[i].map(g => g.blades)) : 0,
    rot: spinGroups[i].length ? Math.max(...spinGroups[i].map(g => g.rot)) : null
  })).filter(x => x.blades >= 2 && x.rot !== null);
  let rotSum = 0;
  for (let i = 1; i < alive.length; i++) {
    const d = alive[i].rot - alive[i - 1].rot;
    if (d > 0) rotSum += d;
  }
  console.log('\n三、旋风斩 1 秒逐帧 · 旋转刀气');
  console.log('  有 ≥2 道刀气的采样帧：' + alive.length + '/11，' +
    '累计正向转角 ' + rotSum.toFixed(2) + ' rad（≈' + (rotSum / (2 * Math.PI)).toFixed(2) + ' 圈）');
  ok(alive.length >= 5, '1 秒内多数采样帧能看到 ≥2 道刀气', alive.length);
  ok(rotSum >= 2 * Math.PI, '刀气在绕圈旋转（累计 ≥1 圈，不是静止风扇）', rotSum);

  /* ---------- 6 套附魔逐套出图（§13 附赠人眼结论）---------- */
  const ench = await p.evaluate(async (elems, names) => {
    const gl = document.getElementById('gl');
    const W = window.__W, H = window.__H;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d', { willReadFrequently: true });
    const gv = document.createElement('canvas');
    gv.width = W; gv.height = H;
    const gx = gv.getContext('2d', { willReadFrequently: true });
    const pp = Game.playerGroup.position;
    const mount = new THREE.Object3D();
    mount.position.set(pp.x, 1.15, pp.z + 1.5);
    Game.scene.add(mount);
    /* 近景机位：附魔贴在 1.2 米剑身上，三分之四俯视机位看不清 */
    const camPos = Game.camera.position.clone();
    const camQuat = Game.camera.quaternion.clone();
    /* 近景再收一档：4.2 时附魔只是角色背上一道细线，6 套几乎只能靠颜色分 */
    Game.camera.position.set(pp.x, 1.32, pp.z + 3.0);
    Game.camera.lookAt(pp.x, 1.15, pp.z + 1.5);
    Game.camera.updateMatrixWorld();
    const out = {};
    for (const e of elems) {
      FXK.enchant(null); FX.clear(); FXK.enchant(null);
      FXK.enchant({ elem: e, mount: mount });
      for (let i = 0; i < 12; i++) FX.update(0.04);
      Game.renderer.render(Game.scene, Game.camera);
      Game.renderer.getContext().finish();
      x.drawImage(gl, 0, 0, W, H);
      const color = cv.toDataURL('image/png');
      gx.drawImage(cv, 0, 0, W, H);
      const im = gx.getImageData(0, 0, W, H);
      for (let i = 0; i < im.data.length; i += 4) {
        const l = (im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114) | 0;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = l;
      }
      gx.putImageData(im, 0, 0);
      const gray = gv.toDataURL('image/png');
      window.__frames['ench-' + e] = { color: color, gray: gray };
      out[e] = { st: FXK.enchantStats() };
    }
    FXK.enchant(null);
    Game.scene.remove(mount);
    Game.camera.position.copy(camPos);
    Game.camera.quaternion.copy(camQuat);
    Game.camera.updateMatrixWorld();
    return out;
  }, ENCHANT_ELEMS, ENCHANT_NAMES);
  for (const e of ENCHANT_ELEMS) {
    const f = await p.evaluate(k => window.__frames['ench-' + k] || null, e);
    if (f) { save('ench-' + e + '.png', f.color); save('ench-' + e + '-gray.png', f.gray); }
    ok(!!f && !!(ench[e] && ench[e].st), '附魔 ' + e + ' 出图且有常驻层', ench[e] && ench[e].st);
  }
  const enchSheet = await p.evaluate(async (elems, names) => {
    const W = window.__W, H = window.__H, PAD = 8, LABEL = 26;
    const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    const cv = document.createElement('canvas');
    cv.width = W * 3 + PAD * 4;
    /* 6 套 = 3 列 × 2 行，别按 4 行开画布（下半张全黑，看着像出图失败） */
    cv.height = (H + LABEL) * 2 + PAD * 3;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#111116'; cx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < elems.length; i++) {
      const f = window.__frames['ench-' + elems[i]];
      if (!f) continue;
      const col = i % 3, row = (i / 3) | 0;
      const x = PAD + col * (W + PAD);
      const yL = PAD + row * (H + LABEL + PAD);
      const im = await load(f.color);
      cx.drawImage(im, x, yL + LABEL, W, H);
      cx.fillStyle = '#ffffff'; cx.font = 'bold 18px sans-serif';
      cx.fillText(names[i], x + 8, yL + 18);
    }
    return cv.toDataURL('image/png');
  }, ENCHANT_ELEMS, ENCHANT_NAMES);
  const enchSize = save('sheet-enchant.png', enchSheet);
  ok(enchSize > 6000, '6 套附魔拼版不是空白（PNG ' + enchSize + ' B）', enchSize);

  /* ---------- 写报告 ---------- */
  fs.writeFileSync(path.join(shotDir, 'report.json'), JSON.stringify({
    layer: 'SKFX / Game.playSkillVfx', mode: useAll ? 'all' : (explicit.length ? 'explicit' : 'default'),
    rows: rows, fieldPairs: pairs, spin: spin, enchant: ench,
    generated: new Date().toISOString()
  }, null, 2));

  console.log('\n四、控制台');
  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  ok(errs2.length === 0, '全程零控制台报错', errs2.slice(0, 3));

  await b.close();
  console.log('\n出图目录：' + shotDir);
  console.log((fail === 0 ? '✓' : '✗') + ' 真实链路剪影出图：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('vfx-shot-live 抛错：' + (e && e.stack || e)); process.exit(1); });
