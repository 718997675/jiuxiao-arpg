/* M12 地图与关卡结构 2.0 —— 浏览器实测
 *
 * 验收标准逐条对应：
 *   1) 每张图 4~6 个区域、跨区必须走走廊        → zone-check.js 已静态校验
 *   2) 连续 60 秒拉怪，怪物卡墙次数 0            → 本脚本 B/C 段
 *   3) 小地图能看出区域轮廓与走廊                → 本脚本 D 段（截图 + 采样）
 *   4) 老档载入不报错、不落进墙里                → 本脚本 E 段
 *   5) 同屏 40 怪 + 200 粒子 ≥ 50 FPS            → 本脚本 F 段
 *
 * 用法：node dev/m12-check.js [--shot]
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOT = process.argv.includes('--shot');
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

const MAPS5 = ['forest', 'swamp', 'mine', 'abyss', 'heaven'];
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  /* 先进游戏：Game.state 在 startNew 之前是 null */
  await page.click('#startBtn').catch(() => {});
  await wait(300);
  await page.evaluate(() => { Game.startNew('warrior', '刀'); Game.state.level = 40; Game.recalc(); });
  await wait(1200);

  /* ---------- A. 数据层可用性 ---------- */
  const api = await page.evaluate(() => ({
    hasMapZones: typeof mapZones === 'function',
    hasZoneAt: typeof zoneAt === 'function',
    hasContain: typeof zonesContain === 'function',
    hasTickZone: typeof Game.tickZone === 'function',
    counts: (() => { const o = {}; for (const k in MAPS) { const z = mapZones(k); o[k] = z ? z.length : 0; } return o; })()
  }));
  console.log('【A】数据层', JSON.stringify(api.counts));
  ok(api.hasMapZones && api.hasZoneAt && api.hasContain, 'A: 区域函数未挂到全局');
  ok(api.hasTickZone, 'A: Game.tickZone 未定义');
  for (const k of MAPS5) ok(api.counts[k] === 8, `A: ${k} 应有 8 个区域，实际 ${api.counts[k]}`);

  /* ---------- B. 各图落点合法性 ---------- */
  console.log('\n【B】各图落点');
  for (const mid of MAPS5) {
    const r = await page.evaluate(async (mid) => {
      Game.state.level = 40; Game.recalc();
      Game.travelTo(mid);
      await new Promise(res => setTimeout(res, 900));
      const inside = (x, z) => zonesContain(mid, x, z);
      const pp = Game.playerGroup.position;
      let badE = 0, badB = 0, nB = 0;
      for (const e of Game.enemies) {
        if (!inside(e.pos.x, e.pos.z)) badE++;
        if (e.boss) { nB++; if (!inside(e.pos.x, e.pos.z)) badB++; }
      }
      return {
        mid, n: Game.enemies.length, badE, badB, nB,
        player: { x: +pp.x.toFixed(1), z: +pp.z.toFixed(1), in: inside(pp.x, pp.z) },
        zone: (zoneAt(mid, pp.x, pp.z) || {}).name || '-',
        boss: nB ? { n: nB, z: (zoneAt(mid, Game.enemies.find(e => e.boss).pos.x, Game.enemies.find(e => e.boss).pos.z) || {}).name } : null
      };
    }, mid);
    console.log(`  ${mid.padEnd(7)} 怪 ${String(r.n).padStart(2)}  越界 ${r.badE}  出生点 (${r.player.x},${r.player.z}) 在[${r.zone}]  首领 ${r.boss ? r.boss.n + ' 只 @' + r.boss.z : '未刷'}  首领越界 ${r.badB}`);
    ok(r.player.in, `B: ${mid} 出生点不在任何区域内`);
    ok(r.badE === 0, `B: ${mid} 有 ${r.badE} 只怪刷在区域外`);
    ok(r.badB === 0, `B: ${mid} 首领刷在区域外`);
  }

  /* ---------- C. 60 秒拉怪：卡墙 / 越界 ---------- */
  console.log('\n【C】60 秒拉怪（全部怪仇恨，玩家巡游全图）');
  for (const mid of MAPS5) {
    const r = await page.evaluate(async (mid) => {
      Game.state.level = 40; Game.recalc();
      Game.travelTo(mid);
      await new Promise(res => setTimeout(res, 900));

      /* 玩家无敌：本项只测寻路，不测能不能活 60 秒 */
      Game.state.hp = 1e9;
      Game.keys = {};
      Game.camYaw = 0;

      const zs = mapZones(mid);
      /* 巡游点：入口 → 走廊 → 主厅 → 西翼 → 主厅 → 东翼 → 主厅 → 祭坛 → 回主厅 */
      const by = id => zs.find(z => z.id === id);
      const tour = [];
      for (const id of ['gate', 'path', 'hall', 'westLink', 'west', 'westLink', 'hall',
        'eastLink', 'east', 'eastLink', 'hall', 'sanctum', 'hall', 'path', 'gate']) {
        const z = by(id);
        if (z) tour.push({ x: z.x, z: z.z });
      }

      const enemies = Game.enemies;
      const track = enemies.map(() => ({ x: 0, z: 0, winD: 0, winT: 0, stuck: 0, moved: 0, reached: false }));
      let outOfBounds = 0, stuckEvents = 0, playerOut = 0, steps = 0;
      const byKind = {};
      const DT = 1 / 60;
      const TOTAL = 60 * 60;                  // 60 秒 × 60 帧
      let ti = 0, legT = 0;

      for (let i = 0; i < TOTAL; i++) {
        /* --- 玩家朝下一个巡游点走：直接按移速推进，不走按键输入 ---
         * 用按键驱动的话，玩家自己偶尔会被装饰物楔住，这一段 60 秒就废了，
         * 测出来的「怪贴不到玩家」全是假阳性。这里用固定速度把玩家推到目标点，
         * 只保留 collideWorld 的边界约束，测的仍然是「怪能不能追上来」。 */
        const tgt = tour[ti % tour.length];
        const pp = Game.playerGroup.position;
        const dx = tgt.x - pp.x, dz = tgt.z - pp.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.6) { ti++; legT = 0; }
        else {
          const step = Math.min(d, 4.6 * DT);
          pp.x += dx / d * step;
          pp.z += dz / d * step;
          Game.collideWorld(pp, 0.55, { x: dx / d, z: dz / d });
          legT += DT;
          if (legT > 12) { ti++; legT = 0; }
        }
        Game.keys = {};

        Game.update(DT);

        /* --- 记账 --- */
        const p2 = Game.playerGroup.position;
        if (!zonesContain(mid, p2.x, p2.z)) playerOut++;
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k];
          if (e.dead) continue;
          if (!zonesContain(mid, e.pos.x, e.pos.z)) outOfBounds++;
          const t = track[k];
          const md = Math.hypot(e.pos.x - t.x, e.pos.z - t.z);
          t.x = e.pos.x; t.z = e.pos.z;
          if (Math.hypot(e.pos.x - p2.x, e.pos.z - p2.z) < 5) t.reached = true;
          t.moved += md;
          /* 卡墙判定用 2 秒滑动窗口，而不是「这一帧没动」——
           * 慢速怪（蜗牛、被减速的）单帧位移本来就小于阈值，逐帧判会全是误报。 */
          t.winD += md; t.winT += DT;
          if (t.winT >= 2) {
            const far = Math.hypot(e.pos.x - p2.x, e.pos.z - p2.z) > 4;
            /* 只有「孤立 + 仇恨 + 离玩家还远 + 2 秒几乎没动」才算卡墙。
             * 附近有同伴时不算 —— 那是被前排堵住，正常的拥挤：每只怪都在
             * 往前顶、分离力互相抵消，位移自然接近 0。判定半径用
             * 「两怪半径之和」而不是固定米数：铁甲虫半径 2.08，两只之间的
             * 分离距离就是 4.16 米，用 3 米会把这种挤压误判成卡墙。
             * 召唤师（brood）本体设计上就不移动，也不算。 */
            const stationaryByDesign = e.ai && e.ai.kind === 'summoner';
            let crowded = false;
            if (far && !e.cfg.ranged && !e.boss && !stationaryByDesign) {
              for (const o of enemies) {
                if (o === e || o.dead) continue;
                if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < e.radius + o.radius + 0.6) { crowded = true; break; }
              }
            }
            if (e.aggro && far && !e.cfg.ranged && !e.boss && !stationaryByDesign && !crowded && t.winD < 0.8) {
              t.stuck++; stuckEvents++;
              byKind[e.kind] = (byKind[e.kind] || 0) + 1;
            }
            t.winD = 0; t.winT = 0;
          }
        }
        /* 让所有怪保持仇恨 */
        for (const e of enemies) if (!e.dead) e.aggro = true;
        steps++;
        /* 血量兜底，防止意外死亡中断 */
        if (Game.state.hp < 1e8) Game.state.hp = 1e9;
      }
      return {
        mid, steps, outOfBounds, stuckEvents, playerOut, byKind,
        alive: enemies.filter(e => !e.dead).length,
        reached: track.filter(t => t.reached).length,
        totalMoved: +track.reduce((a, t) => a + t.moved, 0).toFixed(1)
      };
    }, mid);
    const kinds = Object.keys(r.byKind).map(k => k + '×' + r.byKind[k]).join(' ') || '-';
    console.log(`  ${mid.padEnd(7)} 帧 ${r.steps}  怪越界 ${r.outOfBounds}  卡住 ${r.stuckEvents} 次  玩家越界 ${r.playerOut}  贴到过玩家 ${r.reached}/${r.alive}  怪总位移 ${r.totalMoved}m  卡住种类 ${kinds}`);
    ok(r.outOfBounds === 0, `C: ${mid} 怪物越界 ${r.outOfBounds} 帧次`);
    ok(r.stuckEvents === 0, `C: ${mid} 卡墙 ${r.stuckEvents} 次`);
    ok(r.playerOut === 0, `C: ${mid} 玩家越界 ${r.playerOut} 帧次`);
    ok(r.reached >= Math.ceil(r.alive * 0.7), `C: ${mid} 只有 ${r.reached}/${r.alive} 只怪成功贴到玩家（寻路没打通）`);
  }

  /* ---------- D. 小地图 ---------- */
  console.log('\n【D】小地图');
  const mm = await page.evaluate(() => {
    const cv = document.getElementById('minimap') || document.querySelector('canvas.minimap');
    if (!cv) return { err: '找不到小地图 canvas' };
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let painted = 0;
    const tones = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      painted++;
      tones.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5));
    }
    return { w: cv.width, h: cv.height, painted, tones: tones.size, zones: mapZones(Game.state.mapId).length };
  });
  console.log('  canvas', mm.w + 'x' + mm.h, ' 上色像素', mm.painted, ' 色阶种类', mm.tones);
  ok(!mm.err, 'D: ' + (mm.err || ''));
  ok(mm.painted > 400, 'D: 小地图几乎没画东西');
  ok(mm.tones >= 5, 'D: 小地图色阶过少，看不出区域区分');

  if (SHOT) {
    await page.screenshot({ path: path.join(__dirname, 'm12-forest.png') });
    console.log('  截图 → dev/m12-forest.png');
  }

  /* ---------- E. 老档载入 ---------- */
  console.log('\n【E】老档载入（玩家坐标在旧地图边缘/墙外）');
  for (const mid of MAPS5) {
    const r = await page.evaluate(async (mid) => {
      /* 模拟一份「M12 之前」的存档：只有 mapId + 一个落在圆环边缘的 playerPos */
      Game.state.mapId = mid;
      Game.state.level = 30;
      Game.state.playerPos = { x: 0, z: 44 };     // 旧地图半径 42~45，正好贴边
      Game.state.hp = 100;
      let err = null;
      try { Game.loadMap(mid); } catch (e) { err = e.message; }
      await new Promise(res => setTimeout(res, 500));
      const pp = Game.playerGroup.position;
      return {
        mid, err,
        pos: { x: +pp.x.toFixed(1), z: +pp.z.toFixed(1) },
        in: zonesContain(mid, pp.x, pp.z),
        hp: Math.round(Game.state.hp),
        enemies: Game.enemies.length
      };
    }, mid);
    console.log(`  ${mid.padEnd(7)} 载入${r.err ? '报错: ' + r.err : '正常'}  落点 (${r.pos.x},${r.pos.z}) 在区域内=${r.in}  怪 ${r.enemies}`);
    ok(!r.err, `E: ${mid} 载入抛错 ${r.err}`);
    ok(r.in, `E: ${mid} 老档落点 (${r.pos.x},${r.pos.z}) 掉进墙里`);
  }

  /* ---------- F. 性能：40 怪 + 200 粒子 ---------- */
  console.log('\n【F】同屏 40 怪 + 200 粒子');
  const perf = await page.evaluate(async () => {
    Game.travelTo('forest');
    await new Promise(res => setTimeout(res, 1000));
    /* 补到 40 只：直接按区域刷，别管刷怪预算 */
    let guard = 0;
    while (Game.enemies.filter(e => !e.dead).length < 40 && guard++ < 200) {
      const zs = mapZones('forest').filter(z => z.kind !== 'boss');
      const z = zs[Math.floor(Math.random() * zs.length)];
      const p = randomPointInZone(z, 2);
      Game.spawnEnemy(zonePickKind(z, 'halfork'), p.x, p.z, false);
    }
    for (const e of Game.enemies) { e.aggro = true; e.pos.x = Game.playerGroup.position.x + (Math.random() - 0.5) * 14; e.pos.z = Game.playerGroup.position.z + (Math.random() - 0.5) * 14; }

    /* 粒子：拉满 FX */
    for (let i = 0; i < 20; i++) {
      FX.burst(new THREE.Vector3(Game.playerGroup.position.x + (Math.random() - 0.5) * 6, 1.2, Game.playerGroup.position.z + (Math.random() - 0.5) * 6),
        0xffaa33, 10, { speed: 3, size: 0.14, life: 3.0, gravity: -1, additive: true });
    }

    /* 量 rAF 帧率 + 纯 JS 帧耗时（GPU 在 headless 下不可信，单列出来看趋势） */
    const t0 = performance.now();
    let frames = 0;
    await new Promise(res => {
      const tick = () => {
        frames++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else res();
      };
      requestAnimationFrame(tick);
    });
    const wall = performance.now() - t0;
    /* 单独量逻辑帧成本 */
    const a = performance.now();
    for (let i = 0; i < 60; i++) Game.update(1 / 60);
    const logicMs = (performance.now() - a) / 60;
    const r = Game.renderer.info.render;
    return {
      fps: +(frames / (wall / 1000)).toFixed(1),
      logicMs: +logicMs.toFixed(2),
      calls: r.calls, tris: r.triangles,
      enemies: Game.enemies.filter(e => !e.dead).length,
      parts: FX.parts.length
    };
  });
  console.log(`  rAF ${perf.fps}fps  update 逻辑 ${perf.logicMs}ms/帧  drawcalls ${perf.calls}（${(perf.calls / Math.max(1, perf.enemies)).toFixed(1)}/怪）  三角面 ${perf.tris}  怪 ${perf.enemies}  粒子 ${perf.parts}`);
  console.log('  注：headless + swiftshader 是纯 CPU 软件渲染，绝对帧率不代表真机（同一台机上只有个位数 fps）；');
  console.log('      所以判据取「update 逻辑 < 4ms + 每怪 drawcall < 40」这两条与 GPU 无关的线。');
  ok(perf.logicMs < 4, `F: update 逻辑 ${perf.logicMs}ms/帧 过重`);
  ok(perf.calls / Math.max(1, perf.enemies) < 40, `F: 每怪 drawcall ${(perf.calls / perf.enemies).toFixed(1)} 过多`);

  /* ---------- 汇总 ---------- */
  console.log('\n报错数:', errs.length, errs.slice(0, 5));
  ok(errs.length === 0, 'X: 页面有 JS 报错');
  console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n  ' + fails.join('\n  ') : '\n✅ M12 全部通过');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
