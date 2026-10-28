/* ============================================================
 * dev/worldboss-live.js —— M18.2 / M18.3 / M18.4 浏览器实测
 *
 * worldboss-run.js 验的是**状态机**（离线、时间打桩）。
 * 这个脚本验的是**接进游戏之后**：实体真的刷出来了、领域圈真的挂上了、
 * 追踪行与横幅真的有字、小地图画星标不抛异常、时间快进真的会换人。
 *
 * 为什么时间快进要在这里再做一遍：离线脚本里的 `Date.now` 是假的，
 * 而这里要证明**真浏览器**里 `tick` 也是比时间戳而不是累加 dt。
 *
 * 用法：node dev/worldboss-live.js [--shot]
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXE = require('./_chrome');
const SHOT = process.argv.includes('--shot');
const wait = ms => new Promise(r => setTimeout(r, ms));

const fails = [];
const ok = (cond, msg, extra) => {
  if (!cond) {
    fails.push(msg);
    console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  }
  return cond;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await page.click('#startBtn').catch(() => {});
  await wait(300);
  await page.evaluate(() => {
    Game.startNew('warrior', '刀');
    Game.state.level = 60; Game.recalc();
    /* 把 6 张候选图都标成「已抵达」，让 rollNext 一定能选到玩家去得了的图 */
    Game.state.mapsSeen = Object.keys(MAPS);
    Game.state.worldBoss = null;
    WorldBoss._acc = 9; WorldBoss._seenSpawnAt = 0;
    WorldBoss.tick(0.1);
  });
  await wait(600);

  console.log('【A】运行时已接上');
  const A = await page.evaluate(() => ({
    has: typeof WorldBoss !== 'undefined',
    rec: WorldBoss.rec(),
    cfgCycle: WORLD_BOSS_CFG.cycle,
    hasBanner: !!document.getElementById('wbBanner'),
    hasTrack: !!document.getElementById('wbTrack'),
    trackShown: document.getElementById('wbTrack').style.display,
    trackText: document.getElementById('wbTrack').textContent.trim(),
    status: WorldBoss.statusText()
  }));
  ok(A.has, 'A: WorldBoss 没挂到全局（index.html 少一行 script？）');
  ok(!!A.rec, 'A: 60 级开局没有滚出世界 Boss');
  ok(A.rec && A.rec.until - A.rec.spawnAt === A.cfgCycle, 'A: until − spawnAt ≠ 30 分钟',
    A.rec && (A.rec.until - A.rec.spawnAt));
  ok(A.hasBanner, 'A: 缺少 #wbBanner');
  ok(A.hasTrack, 'A: 缺少 #wbTrack');
  ok(A.trackShown === 'block', 'A: 追踪行没显示', A.trackShown);
  ok(A.trackText.indexOf('世 界 Boss') >= 0, 'A: 追踪行没写标题', A.trackText);
  ok(/\d+:\d\d/.test(A.trackText), 'A: 追踪行没有倒计时', A.trackText);
  console.log('  追踪行：' + A.trackText.replace(/\s+/g, ' '));

  console.log('\n【B】走到它的图上 → 实体 + 领域光环');
  const B = await page.evaluate(async () => {
    const r = WorldBoss.rec();
    Game.travelTo(r.mapId);
    await new Promise(res => setTimeout(res, 1500));
    const live = Game.enemies.filter(e => e.wb && !e.dead);
    const e = live[0];
    /* 光环挂在 scene 上（不在 boss.group 里 —— 那里有 5 倍缩放） */
    let aura = null;
    if (WorldBoss._aura) {
      const g = WorldBoss._aura.grp;
      aura = {
        inScene: !!g.parent && g.parent === Game.scene,
        x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2),
        kids: g.children.length,
        t0: +WorldBoss._aura.t.toFixed(3)
      };
    }
    /* 淡入必须**手动推一次**再断言：headless 的 swiftshader 只有 1~2 fps，
     * 等 1.5 秒实际只跑了 2 帧，`t` 还是 0.1 —— 那是渲染慢，不是逻辑错。
     * 直接喂 2 秒进 anim() 才是「1.5 秒淡入」这条逻辑本身。 */
    if (WorldBoss._aura) WorldBoss.anim(2.0);
    if (aura) aura.edgeOp = +WorldBoss._aura.edgeMat.opacity.toFixed(3);
    return {
      mapId: r.mapId, mapName: (MAPS[r.mapId] || {}).name,
      live: live.length,
      eWb: !!(e && e.wb), eBoss: !!(e && e.boss),
      eLv: e ? e.level : null, eHp: e ? Math.round(e.maxHp) : 0,
      ePos: e ? [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)] : null,
      recPos: [+r.x.toFixed(2), +r.z.toFixed(2)],
      eArmorHigh: !!(e && e.cfg && e.cfg.armorHigh),
      eArmorMul: e ? e.armorMul : null,
      eRadius: e ? +e.radius.toFixed(2) : 0,
      aura
    };
  });
  ok(B.live === 1, 'B: 场上应当正好 1 只世界 Boss', B.live);
  ok(B.eWb, 'B: 实体没有 e.wb 标记');
  ok(B.eBoss, 'B: 实体没按首领处理（boss = false）');
  ok(B.eLv === 60, 'B: 等级不是 60', B.eLv);
  ok(B.eArmorHigh, 'B: cfg.armorHigh 没进实体');
  ok(B.eArmorMul === 1, 'B: armorMul 没从 cfg 传到实体（应当是 1）', B.eArmorMul);
  ok(Math.abs(B.ePos[0] - B.recPos[0]) < 0.01 && Math.abs(B.ePos[1] - B.recPos[1]) < 0.01,
    'B: 实体落点与记录不一致', { e: B.ePos, rec: B.recPos });
  ok(!!B.aura, 'B: 领域光环没建出来');
  ok(B.aura && B.aura.inScene, 'B: 光环没挂在 scene 上（挂进 boss.group 会被放大 5 倍）');
  ok(B.aura && B.aura.kids >= 3, 'B: 光环至少要有 边界环 / 符文环 / 地面染色 三层', B.aura && B.aura.kids);
  ok(B.aura && B.aura.edgeOp > 0, 'B: 光环没有淡入（opacity 还是 0）', B.aura && B.aura.edgeOp);
  console.log('  ' + B.mapName + '：实体 lv' + B.eLv + ' 血 ' + B.eHp +
    ' 半径 ' + B.eRadius + '，光环 ' + B.aura.kids + ' 层，边界不透明度 ' + B.aura.edgeOp);

  console.log('\n【C】小地图星标（必须与常驻首领的红点完全不同）');
  const C = await page.evaluate(() => {
    const cv = document.getElementById('minimap');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const r = WorldBoss.rec();
    const cfg = worldBossById(r.id);

    /* 冻结动画时间再量。
     * 星标有呼吸缩放（0.88~1.12 倍）+ 刻度公转，两次绘制之间只要
     * 时间往前走了一点，边缘像素就会整体错位 —— 第一版没冻结，
     * 量出来的「红点差异」有 4940 px，全是星标自己抖出来的。
     * drawWorldBoss 读的是 performance.now()，打桩成常量即可。 */
    const realNow = performance.now.bind(performance);
    performance.now = () => 123456;

    try {
      /* 用「画 / 不画」两张图的差异把星标**单独抠出来**。
       * 关掉星标的办法是临时把记录标成 killed —— drawWorldBoss 第一件事
       * 就是 `if (r.killed) return`，而 killed 不影响小地图上任何别的图层。 */
      Minimap.draw(Game.state);
      const withStar = g.getImageData(0, 0, W, H).data;
      const keep = r.killed;
      r.killed = true;
      try { Minimap.draw(Game.state); } finally { r.killed = keep; }
      const noStar = g.getImageData(0, 0, W, H).data;

      const dom = cfg.domain.color;
      const dr = parseInt(dom.slice(1, 3), 16);
      const dg = parseInt(dom.slice(3, 5), 16);
      const db = parseInt(dom.slice(5, 7), 16);

      /* 先收一遍差异像素 + 质心。质心当星标圆心用 ——
       * 领域圈是绕同一个圆心的一圈细线，对称，不影响质心。 */
      const pts = [];
      let sx = 0, sy = 0;
      for (let i = 0; i < withStar.length; i += 4) {
        const d = Math.abs(withStar[i] - noStar[i]) +
                  Math.abs(withStar[i + 1] - noStar[i + 1]) +
                  Math.abs(withStar[i + 2] - noStar[i + 2]);
        if (d <= 18) continue;
        const p = i / 4, px = p % W, py = (p / W) | 0;
        pts.push(px, py, i);
        sx += px; sy += py;
      }
      const n = pts.length / 3;
      const cx = sx / n, cy = sy / n;

      /* 按半径切两半：
       *   inner = 星标本体（星 + 信标环 + 刻度，最远 28px）
       *   outer = 领域虚线圆（radius 26~32 米 × scale，远得多）
       * 混在一起量会把「领域圈直径」当成星标尺寸，测出 106px 的假结果。 */
      const R_IN = 34;
      let ix0 = 1e9, ix1 = -1e9, iy0 = 1e9, iy1 = -1e9, inner = 0, outer = 0, tint = 0;
      for (let j = 0; j < pts.length; j += 3) {
        const px = pts[j], py = pts[j + 1], i = pts[j + 2];
        const dd = Math.hypot(px - cx, py - cy);
        if (dd > R_IN) { outer++; continue; }
        inner++;
        if (px < ix0) ix0 = px; if (px > ix1) ix1 = px;
        if (py < iy0) iy0 = py; if (py > iy1) iy1 = py;
        /* 领域色命中：星标是「领域色填充」，不是随便一个亮色块。
         * 容差 110 —— 星标填充会把领域色往白混 18%（Minimap._lift），
         * 饕餮 #c07a3a 提亮后三通道合计偏 70，容差给 70 就正好卡在边界上。
         * 高光心（暖白）与描边（墨色）离得更远，不会被算进来。 */
        if (Math.abs(withStar[i] - dr) + Math.abs(withStar[i + 1] - dg) +
            Math.abs(withStar[i + 2] - db) < 110) tint++;
      }

      /* 反证：世界 Boss 的实体本身**不许**被敌人循环画成红点。
       * 做法：把实体从领域中心挪开 9 米（实战里它追人时本来就会离开），
       * 此时星标还钉在领域中心，两者不再重叠。然后对比
       *   wb = true  → 它的位置应该什么都没有
       *   wb = false → 会画一颗 r=6 的红点（`e.boss` 为真）
       * 差异应该正好是一个直径 12 的小圆（≈113 px）。
       * 若不挪开，红点会被不透明的星标盖住，差异恒为 0，测不出东西。 */
      const ent = Game.enemies.find(x => x.wb && !x.dead);
      let dotPx = 0, dotW = 0, dotH = 0;
      if (ent) {
        const kx = ent.pos.x, kz = ent.pos.z;
        ent.pos.x += 9; ent.pos.z += 9;
        Minimap.draw(Game.state);
        const noDot = g.getImageData(0, 0, W, H).data;
        ent.wb = false;
        Minimap.draw(Game.state);
        const withDot = g.getImageData(0, 0, W, H).data;
        ent.wb = true; ent.pos.x = kx; ent.pos.z = kz;

        let dx0 = 1e9, dx1 = -1e9, dy0 = 1e9, dy1 = -1e9;
        for (let i = 0; i < withDot.length; i += 4) {
          if (Math.abs(withDot[i] - noDot[i]) + Math.abs(withDot[i + 1] - noDot[i + 1]) +
              Math.abs(withDot[i + 2] - noDot[i + 2]) <= 18) continue;
          dotPx++;
          const q = i / 4, px = q % W, py = (q / W) | 0;
          if (px < dx0) dx0 = px; if (px > dx1) dx1 = px;
          if (py < dy0) dy0 = py; if (py > dy1) dy1 = py;
        }
        dotW = dx1 - dx0 + 1; dotH = dy1 - dy0 + 1;
        /* 把画面复原成「有星标」那一帧，后面的截图都基于它 */
        Minimap.draw(Game.state);
      }

      /* 常驻首领的红点：半径 6（canvas 像素），直径 12。 */
      return {
        n, inner, outer, tint, dom, dotPx, dotW, dotH, hasEnt: !!ent,
        w: ix1 - ix0 + 1, h: iy1 - iy0 + 1,
        bossDot: 12,
        hasFn: typeof Minimap.drawWorldBoss === 'function',
        hasStar: typeof Minimap._starPath === 'function',
        here: Game.state.mapId === r.mapId
      };
    } finally {
      performance.now = realNow;
    }
  });
  ok(C.hasFn, 'C: Minimap.drawWorldBoss 不存在');
  ok(C.hasStar, 'C: Minimap._starPath 不存在（双层星形会画歪）');
  ok(C.here, 'C: 玩家不在 boss 那张图上（B 段应该已经 travelTo 了）');
  ok(C.inner > 400, 'C: 星标落笔像素太少，可能只画了个小点', C.inner);
  ok(C.w >= 40 && C.h >= 40,
    'C: 星标外廓 ' + C.w + '×' + C.h + ' 不比首领红点（' + C.bossDot + '×' + C.bossDot +
    '）大多少，形状区分度不够');
  ok(C.w <= 90 && C.h <= 90, 'C: 星标过大，会盖住整张小地图', C.w + '×' + C.h);
  ok(Math.abs(C.w - C.h) <= 8, 'C: 星标不是等宽高（说明不是五角星而是被裁了）', C.w + '×' + C.h);
  ok(C.tint > 100, 'C: 星标里没有足够的领域色像素（颜色没生效？）', C.tint);
  ok(C.outer > 100, 'C: 没画出领域虚线圆', C.outer);
  ok(C.hasEnt, 'C: 场上找不到 wb 实体（B 段应该刷出来了）');
  /* 红点应该正好是 r=6 的一个小圆：面积 ≈ π·36 ≈ 113，外廓 ≈ 12×12。
   * 放宽到 60~400 px / 10~18 px，容抗锯齿。 */
  ok(C.dotPx > 60 && C.dotPx < 400,
    'C: 摘掉 wb 标记后没有出现一颗正常的红点（说明「跳过 wb」的闸没在起作用）', C.dotPx);
  ok(C.dotW >= 10 && C.dotW <= 18 && C.dotH >= 10 && C.dotH <= 18,
    'C: 红点外廓不是 12×12 的圆', C.dotW + '×' + C.dotH);
  console.log('  星标外廓 ' + C.w + '×' + C.h + '（首领红点 ' + C.bossDot + '×' + C.bossDot +
    '），落笔 ' + C.inner + ' px，领域色命中 ' + C.tint + ' px，领域圈 ' + C.outer +
    ' px，色值 ' + C.dom);
  console.log('  反证：把实体挪开 9 米后，摘掉 wb 标记才会多出 ' + C.dotPx + ' px 红点（' +
    C.dotW + '×' + C.dotH + '）→ 星标旁边不会有红点');

  console.log('\n【D】横幅与山海志卡');
  const D = await page.evaluate(() => {
    WorldBoss.announce(WorldBoss.rec());
    const bn = document.getElementById('wbBanner');
    UI.renderQuests();
    const card = document.querySelector('#questList .wbc');
    return {
      show: bn.classList.contains('show'),
      name: document.getElementById('wbbName').textContent,
      sub: document.getElementById('wbbSub').textContent,
      color: bn.style.getPropertyValue('--wbc'),
      card: !!card,
      cardText: card ? card.textContent.replace(/\s+/g, ' ').slice(0, 90) : ''
    };
  });
  ok(D.show, 'D: 横幅没有加 show 类');
  ok(D.name.length >= 2, 'D: 横幅没写 boss 名', D.name);
  ok(/^#[0-9a-f]{6}$/i.test(D.color.trim()), 'D: 横幅没取到领域色', D.color);
  ok(D.card, 'D: 山海志里没有世界 Boss 常驻卡');
  ok(D.cardText.indexOf('世界 Boss') >= 0, 'D: 卡片文案不对', D.cardText);
  console.log('  横幅：' + D.name + '　' + D.sub + '　' + D.color);
  console.log('  卡片：' + D.cardText);

  if (SHOT) {
    await wait(200);
    const out = path.join(ROOT, 'shots', 'worldboss-live.png');
    await page.screenshot({ path: out });
    console.log('  截图：' + path.relative(ROOT, out));
  }

  console.log('\n【E】时间快进（真浏览器里也必须比时间戳）');
  const E = await page.evaluate(async () => {
    const before = JSON.parse(JSON.stringify(WorldBoss.rec()));
    const realNow = Date.now;
    const offset = 31 * 60 * 1000;
    Date.now = () => realNow() + offset;
    WorldBoss._acc = 9;
    WorldBoss.tick(0.1);
    Date.now = realNow;
    const after = WorldBoss.rec();
    /* 换人之后如果新 boss 也在同一张图，场上应当换成新的一只 */
    const live = Game.enemies.filter(e => e.wb && !e.dead);
    return {
      changed: after.id !== before.id || after.spawnAt !== before.spawnAt,
      beforeId: before.id, afterId: after.id,
      sameId: before.id === after.id,
      liveId: live[0] ? live[0].wbId : null,
      killed: after.killed
    };
  });
  ok(E.changed, 'E: 快进 31 分钟没有换人');
  ok(!E.sameId, 'E: 换成了同一只（连续两次同一只 = 玩家以为没刷新）', E);
  ok(!E.killed, 'E: 新记录不应该是 killed 状态');
  if (E.liveId) ok(E.liveId === E.afterId, 'E: 场上的实体还是上一只', E);
  console.log('  ' + E.beforeId + ' → ' + E.afterId + '（场上：' + (E.liveId || '不在本图') + '）');

  console.log('\n【F】击杀 → 冷却');
  const F = await page.evaluate(async () => {
    const r = WorldBoss.rec();
    if (Game.state.mapId !== r.mapId) {
      Game.travelTo(r.mapId);
      await new Promise(res => setTimeout(res, 1200));
    }
    let e = Game.enemies.find(x => x.wb && !x.dead);
    if (!e) { WorldBoss._acc = 9; WorldBoss.tick(0.1); e = Game.enemies.find(x => x.wb && !x.dead); }
    if (!e) return { skip: true };
    /* 用真实伤害路径打死它，而不是直接调 onKill —— 要验的是
     * 「击杀链路有没有把世界 Boss 认出来」，那才是会抛异常的地方。
     * 血量要给到 60 倍：`damageEnemy` 会先过护甲（armorHigh 60 级吃 15.6%）
     * 再过抗性（+40 吃 60%），1 点伤害只落 9.4%。 */
    const hp = e.maxHp;
    Game.damageEnemy(e, hp * 60, false);
    await new Promise(res => setTimeout(res, 400));
    const rec = WorldBoss.rec();
    return {
      skip: false, hp,
      dead: !!e.dead,
      killed: rec.killed,
      cd: rec.until - rec.killAt,
      aura: !!WorldBoss._aura,
      track: document.getElementById('wbTrack').textContent.replace(/\s+/g, ' '),
      bossBar: document.getElementById('bossbar').style.display
    };
  });
  if (F.skip) {
    console.log('  （跳过：这只不在当前图 / 没刷出来）');
  } else {
    ok(F.killed, 'F: 打死之后记录没有标记 killed');
    ok(F.cd === 30 * 60 * 1000, 'F: 冷却不是一个完整周期', F.cd);
    ok(!F.aura, 'F: 击杀后领域光环没撤（玩家会以为效果还在）');
    ok(F.track.indexOf('后再现') >= 0, 'F: 追踪行没切成「后再现」', F.track);
    console.log('  击杀后追踪行：' + F.track);
  }

  console.log('\n【G】领域机制（M18.5 · 六种玩家侧效果）');
  const G = await page.evaluate(() => {
    const out = {};

    /* 把玩家丢进指定 boss 的领域里。offset 是相对领域中心的偏移（米）。 */
    function enter(id, offset) {
      const cfg = worldBossById(id);
      const mapId = cfg.map;
      const pos = bossPosOf(mapId, id, 0);
      Game.state.level = 60; Game.recalc();
      Game.state.mapsSeen = Object.keys(MAPS);
      Game.state.worldBoss = {
        id, mapId, x: pos[0], z: pos[1],
        spawnAt: Date.now() - 1000, until: Date.now() + 1800000,
        killed: false, killAt: 0
      };
      /* 换图会重建 scene.fog，先丢掉旧原值，否则还原时会写错雾 */
      WorldBoss._fogBase = null;
      WorldBoss._domainClear();
      Game.loadMap(mapId, pos[0] + offset, pos[1] + offset);
      /* loadMap 的落点参数会被入口区覆盖（它按 zone 选出生点），
       * 所以要**手动**把人放到领域里，否则永远站在 160 米外测不到东西。 */
      const pg = Game.playerGroup.position;
      pg.set(pos[0] + offset, pg.y, pos[1] + offset);
      /* loadMap 末尾已经调过 onMapEnter（ensure + sync），实体应该在了 */
      Game.dead = false;
      Game.invuln = 0;
      Game.state.hp = Game.state.stats.hpMax;
      Game.state.stats.dodge = 0;      // 别让「闪避」把毒沼那一下整条吃掉
      const fog = Game.scene && Game.scene.fog;
      return {
        cfg, pos, e: WorldBoss.live(),
        inside: (WorldBoss.domainState() || {}).inside || false,
        baseFar: fog ? fog.far : 0, baseNear: fog ? fog.near : 0,
        radius: cfg.domain.radius
      };
    }
    const run = (n, dt) => { for (let i = 0; i < n; i++) WorldBoss.domainTick(dt); };
    const fogNow = () => (Game.scene && Game.scene.fog) ? Math.round(Game.scene.fog.far) : -1;
    /* 雾色亮度：压视野时如果只改 far 不改色，屏幕会变成「一片亮白」，
     * 玩家以为贴图没加载。用 RGB 之和当亮度代理，够用且不依赖 THREE。 */
    const fogLum = () => {
      const c = Game.scene && Game.scene.fog && Game.scene.fog.color;
      if (!c) return -1;
      return Math.round(c.r * 255) + Math.round(c.g * 255) + Math.round(c.b * 255);
    };

    /* ---- ① 昼夜领域：视野压缩 + 阶段覆盖 + 出圈还原 ---- */
    let s = enter('zhulong', 6);
    out.daySpawned = !!s.e;
    out.dayInside = s.inside;
    run(3, 0.1);
    out.sightDay = fogNow();
    out.lumDay = fogLum();
    if (s.e) {
      s.e.hp = s.e.maxHp * 0.5;        // 打到 P2（闭眼）
      run(3, 0.1);
      out.sightNight = fogNow();
      out.lumNight = fogLum();
      s.e.hp = s.e.maxHp;              // 还原，后面还要用这只
    }
    /* 走出圈：雾必须回到进圈前的值 */
    Game.playerGroup.position.set(s.pos[0] + 400, 0, s.pos[1] + 400);
    run(3, 0.1);
    out.fogBack = fogNow();
    out.fogBase = Math.round(s.baseFar);
    out.lumBack = fogLum();

    /* ---- ② 毒沼领域：每秒扣最大生命的 0.6%（无视护甲） ---- */
    s = enter('xiangliu', 6);
    Game.invuln = 0;
    const hp0 = Game.state.hp;
    run(10, 0.1);                      // 1.0 秒 = 1 跳
    out.poisonDrop = +(hp0 - Game.state.hp).toFixed(2);
    out.poisonExpect = +(Game.state.stats.hpMax * 0.006).toFixed(2);
    out.buff = Game.statusBuffs().find(b => b.noTimer) || null;
    out.buffDom = (document.getElementById('buffbar').textContent || '').replace(/\s+/g, '');

    /* ---- ③ 水天领域：移速 −20% ---- */
    s = enter('kunpeng', 6);
    run(3, 0.1);
    out.slow = Game.domSlow;
    out.slowPlayer = Game.playerSlow;   // 必须是 0：领域减速走独立字段

    /* ---- ④ 吞噬领域：每秒被拉近 2.2 米 ---- */
    s = enter('taotie', 10);
    const p = Game.playerGroup.position;
    const d0 = Math.hypot(p.x - s.pos[0], p.z - s.pos[1]);
    run(10, 0.1);
    const d1 = Math.hypot(p.x - s.pos[0], p.z - s.pos[1]);
    out.pullIn = +(d0 - d1).toFixed(2);

    /* ---- ⑤ 战意领域：攻速 −15% ---- */
    s = enter('xingtian', 6);
    run(3, 0.1);
    out.aspd = Game.domAspd;
    /* 攻速真的进了普攻冷却：同一套装备下 cd 应该变长 */
    Game.doBasicAttack();
    out.cdInDomain = Game.atkCd;
    Game.domAspd = 0;
    Game.doBasicAttack();
    out.cdOutDomain = Game.atkCd;

    /* ---- ⑥ 幻域：小地图压暗（但星标仍画） ---- */
    s = enter('jiuweihu', 6);
    run(3, 0.1);
    out.dim = WorldBoss.dim();
    /* 压暗之后小地图还应该画出星标 —— 用「画 / 不画」差异像素证明 */
    const cv = document.getElementById('minimap');
    const g2 = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    Minimap.draw(Game.state);
    const A = g2.getImageData(0, 0, W, H).data;
    const r2 = WorldBoss.rec(), keep2 = r2.killed;
    r2.killed = true;
    try { Minimap.draw(Game.state); } finally { r2.killed = keep2; }
    const B = g2.getImageData(0, 0, W, H).data;
    let starPx = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 18) starPx++;
    }
    out.starUnderDim = starPx;

    /* ---- ⑦ 出圈 / 换图：一切归位 ---- */
    Game.playerGroup.position.set(s.pos[0] + 400, 0, s.pos[1] + 400);
    run(3, 0.1);
    out.after = {
      slow: Game.domSlow, aspd: Game.domAspd, dim: WorldBoss.dim(),
      inDomain: !!WorldBoss._inDomain, buff: !!WorldBoss.domainBuff()
    };
    return out;
  });

  ok(G.daySpawned, 'G: 昼夜领域那只没刷出来');
  ok(G.dayInside, 'G: 没把玩家放进领域里 —— 后面所有断言都不可信');
  ok(Math.abs(G.sightDay - 26) <= 1, 'G: 昼阶段视野不是 26 米', G.sightDay);
  ok(Math.abs(G.sightNight - 8) <= 1, 'G: 打到 P2 后视野没压到 8 米', G.sightNight);
  ok(G.lumNight < G.lumDay * 0.5,
    'G: 夜阶段雾色没压暗（屏幕会变成一片亮白，玩家以为贴图没加载）',
    G.lumDay + ' → ' + G.lumNight);
  ok(Math.abs(G.fogBack - G.fogBase) <= 1,
    'G: 出圈后雾距没还原（会变成「打完 Boss 永远看不见远处」）', G.fogBack + ' vs ' + G.fogBase);
  ok(Math.abs(G.lumBack - G.lumDay) <= 6,
    'G: 出圈后雾色没还原', G.lumBack + ' vs ' + G.lumDay);

  ok(G.poisonDrop > 0, 'G: 毒沼领域没有掉血', G.poisonDrop);
  ok(Math.abs(G.poisonDrop - G.poisonExpect) <= Math.max(1, G.poisonExpect * 0.12),
    'G: 毒沼每秒伤害不是「最大生命的 0.6%」（被护甲吃了？）',
    G.poisonDrop + ' vs ' + G.poisonExpect);
  ok(G.buff && G.buff.noTimer, 'G: buff 条没有领域那一条', G.buff);
  ok(G.buffDom.indexOf('领域') >= 0, 'G: buff 条上没写出领域名', G.buffDom);
  ok(G.buffDom.indexOf('常驻') >= 0, 'G: buff 条给领域写了倒计时（它没有剩余时间）', G.buffDom);

  ok(Math.abs(G.slow - 0.2) < 1e-6, 'G: 水天领域减速不是 20%', G.slow);
  ok(!G.slowPlayer, 'G: 领域减速串到了 playerSlow（出圈会算不清该清多少）', G.slowPlayer);
  ok(G.pullIn > 1.6 && G.pullIn < 2.8, 'G: 吞噬领域每秒拉近不是 ~2.2 米', G.pullIn);
  ok(G.aspd === -15, 'G: 战意领域攻速不是 −15%', G.aspd);
  ok(G.cdInDomain > G.cdOutDomain,
    'G: 攻速 −15% 没进普攻冷却', G.cdInDomain + ' vs ' + G.cdOutDomain);
  ok(Math.abs(G.dim - 0.35) < 1e-6, 'G: 幻域压暗系数不是 0.35', G.dim);
  ok(G.starUnderDim > 200, 'G: 幻域压暗之后小地图上找不到星标了', G.starUnderDim);
  ok(!G.after.slow && !G.after.aspd && !G.after.dim,
    'G: 出圈后玩家侧字段没归零', G.after);
  ok(!G.after.inDomain && !G.after.buff, 'G: 出圈后 buff 条还挂着领域', G.after);

  console.log('  视野 昼 ' + G.sightDay + 'm → 夜 ' + G.sightNight + 'm → 出圈还原 ' +
    G.fogBack + 'm（原 ' + G.fogBase + 'm）；雾色亮度 ' + G.lumDay + ' → ' + G.lumNight +
    ' → ' + G.lumBack);
  console.log('  毒沼 1 秒掉 ' + G.poisonDrop + ' 血（应 ' + G.poisonExpect +
    '），buff 条：' + (G.buff ? G.buff.name + ' / ' + G.buffDom : '无'));
  console.log('  水天减速 ' + (G.slow * 100) + '% · 吞噬每秒拉近 ' + G.pullIn +
    'm · 战意攻速 ' + G.aspd + '%（cd ' + G.cdInDomain.toFixed(3) + 's vs ' +
    G.cdOutDomain.toFixed(3) + 's）');
  console.log('  幻域压暗 ' + G.dim + '，压暗后星标仍有 ' + G.starUnderDim + ' px');

  console.log('\n【H】页面错误');
  ok(errs.length === 0, 'H: 有 pageerror / console.error', errs.slice(0, 4));

  await browser.close();
  console.log('\n' + '='.repeat(56));
  console.log(fails.length ? '失败 ' + fails.length + ' 项：\n  · ' + fails.join('\n  · ')
    : '世界 Boss 浏览器实测：全部通过');
  console.log('='.repeat(56));
  process.exit(fails.length ? 1 : 0);
})();
