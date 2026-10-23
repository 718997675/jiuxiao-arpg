/* ============================================================
 * v1.0.4 五项改动的浏览器验证（Edge headless + puppeteer-core）
 *
 *   1. BOSS 名字牌世界坐标 == 模型头顶（不再被 group.scale 二次放大）
 *   2. 回城（进入安全区）回满血蓝
 *   3. 装备评分 / 对比 / 排序
 *   4. 商店 5 分钟窗口 + 金币刷新（重复说话不换货）
 *   5. 投射物扫掠判定（低帧率下不再穿模）+ 符咒飞行物
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8901;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const results = [];
const ok = m => { results.push(['PASS', m]); console.log('  [PASS] ' + m); };
const bad = m => { results.push(['FAIL', m]); console.log('  [FAIL] ' + m); };
const chk = (cond, m) => (cond ? ok(m) : bad(m));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/?cls=mage&name=测试&diff=normal`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));

  /* ---------- 0. 基础 ---------- */
  const base = await page.evaluate(() => ({
    running: (typeof Game !== 'undefined') && Game.running,
    cls: Game.state && Game.state.cls,
    hasSeg: typeof segCircleT === 'function',
    hasScore: typeof itemScore === 'function',
    hasCmp: typeof itemCompareHTML === 'function',
    shopMs: typeof SHOP_REFRESH_MS === 'number' ? SHOP_REFRESH_MS : -1
  }));
  chk(base.running, '游戏进入运行态（cls=' + base.cls + '）');
  chk(base.hasSeg && base.hasScore && base.hasCmp, '新函数已注入（segCircleT / itemScore / itemCompareHTML）');
  chk(base.shopMs === 300000, '商店刷新周期 = 300000ms（5 分钟）');

  /* ---------- 1. BOSS 名字牌位置 ---------- */
  const boss = await page.evaluate(() => {
    const e = Game.spawnEnemy(null, 4, -18, false, 20, 'golemking');
    if (!e) return { err: 'spawn failed' };
    e.actor.group.updateMatrixWorld(true);
    // 只量模型本体（跳过名字牌容器）
    const box = new THREE.Box3();
    for (const ch of e.actor.group.children) {
      if (ch === e.labelG) continue;
      box.expandByObject(ch);
    }
    const wp = new THREE.Vector3();
    e.labelG.getWorldPosition(wp);
    /* 字号要看「名字精灵自身」的世界缩放：labelG 负责抵消 group.scale，
     * 精灵本身仍是 6×1.5，两者相乘才是玩家看到的实际大小 */
    const ws = new THREE.Vector3();
    e.label.getWorldScale(ws);
    const out = {
      modelTop: box.max.y,
      labelY: wp.y,
      expect: box.max.y + 0.55,
      labelScaleX: ws.x,
      scale: e.actor.group.scale.x,
      labelX: wp.x, labelZ: wp.z, posX: e.pos.x, posZ: e.pos.z,
      oldY: 4.2 * (e.actor.group.scale.x / 1.8) * e.actor.group.scale.x
    };
    Game.enemies.pop();
    disposeTree(e.actor.group);
    return out;
  });
  chk(!boss.err, 'BOSS 生成成功');
  chk(Math.abs(boss.labelY - boss.expect) < 0.08,
    `名字牌高度贴合头顶：${boss.labelY.toFixed(2)} vs 期望 ${boss.expect.toFixed(2)}（旧算法会到 ${boss.oldY.toFixed(2)}）`);
  chk(Math.abs(boss.labelScaleX - 6) < 0.05,
    `名字牌字号不被放大：世界宽 ${boss.labelScaleX.toFixed(2)}（旧算法 ${(6 * boss.scale).toFixed(2)}）`);
  chk(Math.abs(boss.labelX - boss.posX) < 0.01 && Math.abs(boss.labelZ - boss.posZ) < 0.01,
    '名字牌水平坐标与 BOSS 实际坐标一致');

  /* ---------- 2. 回城满血 ---------- */
  await page.evaluate(() => { Game.loadMap('forest'); });
  await new Promise(r => setTimeout(r, 300));
  const town = await page.evaluate(() => {
    Game.state.hp = 12; Game.state.mp = 3;
    Game.poisonT = 2.5; Game.playerSlow = 0.5;
    Game.travelTo('village');
    return new Promise(res => setTimeout(() => res({
      mapId: Game.state.mapId,
      hp: Game.state.hp, hpMax: Game.state.stats.hpMax,
      mp: Game.state.mp, mpMax: Game.state.stats.mpMax,
      poison: Game.poisonT, slow: Game.playerSlow
    }), 500));
  });
  chk(town.mapId === 'village', '传送回桃源村成功');
  chk(Math.abs(town.hp - town.hpMax) < 0.01, `回城满血：${town.hp} / ${town.hpMax}`);
  chk(Math.abs(town.mp - town.mpMax) < 0.01, `回城满蓝：${town.mp} / ${town.mpMax}`);
  chk(town.poison <= 0 && town.slow <= 0, '负面状态一并清除');

  /* ---------- 3. 装备评分 / 对比 / 排序 ---------- */
  const eqTest = await page.evaluate(() => {
    const items = [];
    for (let i = 0; i < 8; i++) items.push(rollItem(10 + i * 2, { cls: 'mage' }));
    Game.state.inventory = items.slice();
    const before = Game.state.inventory.map(x => x.name).join('|');
    Game.sortInventory('score');
    const scores = Game.state.inventory.map(x => itemScore(x));
    let desc = true;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[i - 1] + 0.001) desc = false;
    const after = Game.state.inventory.map(x => x.name).join('|');
    // 对比：造一件明显更强的同类装备
    const a = Game.state.inventory[Game.state.inventory.length - 1];
    const b = Game.state.inventory[0];
    const html = itemCompareHTML(b, a);
    // 戒指双孔：equippedFor 应取较弱的那只
    Game.state.equipment.ring1 = rollItem(30, { cls: 'mage' });
    Game.state.equipment.ring2 = rollItem(5, { cls: 'mage' });
    const ring = rollItem(20, { cls: 'mage' });
    ring.slot = 'ring';
    const picked = UI.equippedFor(ring);
    return {
      changed: before !== after, desc, html,
      up: /class="up"/.test(html), cmp: /tt-cmp/.test(html),
      scoreA: itemScore(a), scoreB: itemScore(b),
      ringPicked: picked === Game.state.equipment.ring2,
      ringWeak: itemScore(Game.state.equipment.ring2) <= itemScore(Game.state.equipment.ring1)
    };
  });
  chk(eqTest.changed, '排序后背包顺序发生变化');
  chk(eqTest.desc, '按评分排序结果为降序');
  chk(eqTest.cmp && eqTest.up, '对比区块生成，含绿色提升标记');
  chk(eqTest.ringPicked && eqTest.ringWeak, '戒指对比对象取两只中较弱的那只');

  /* ---------- 4. 商店 5 分钟窗口 + 金币刷新 ---------- */
  const shop = await page.evaluate(() => {
    Game.state.gold = 999999;
    Game.state.shop = null;
    const first = Game.ensureShop();                 // 生成
    const names1 = Game.shopItems.map(x => x.item.name).join('|');
    const second = Game.ensureShop();                // 窗口内再说话
    const names2 = Game.shopItems.map(x => x.item.name).join('|');
    const remain = Game.shopRemainMs();
    const cost1 = Game.shopRefreshCost();
    const goldBefore = Game.state.gold;
    const r = Game.refreshShopPaid();
    const goldAfter = Game.state.gold;
    const cost2 = Game.shopRefreshCost();
    // 模拟 5 分钟过期
    Game.state.shop.at = Date.now() - 300001;
    const expired = Game.ensureShop();
    return {
      first, second, same: names1 === names2, count: Game.shopItems.length,
      remain, cost1, cost2, ok: r.ok, spent: goldBefore - goldAfter,
      rollsAfterExpire: Game.state.shop.rolls, expired
    };
  });
  chk(shop.first === true && shop.count === 6, '首次进货生成 6 件商品');
  chk(shop.second === false && shop.same, '5 分钟内重复开面板不会换货（堵住无限免费刷新）');
  chk(shop.remain > 295000 && shop.remain <= 300000, `免费刷新倒计时从 5 分钟起算（${Math.round(shop.remain / 1000)}s）`);
  chk(shop.ok && shop.spent === shop.cost1, `金币刷新扣费正确：${shop.spent} 金`);
  chk(shop.cost2 > shop.cost1, `连续刷新价格递增：${shop.cost1} → ${shop.cost2}`);
  chk(shop.expired === true && shop.rollsAfterExpire === 0, '过期后免费换货并把连刷计数清零');

  /* ---------- 5. 投射物扫掠判定 + 符咒 ---------- */
  const proj = await page.evaluate(() => {
    // 清场，只留一只目标怪
    for (const e of Game.enemies) disposeTree(e.actor.group);
    Game.enemies = [];
    FX.projectiles.length = 0;
    const e = Game.spawnEnemy('halfork', 0, 6, false, 5);
    let hits = 0, hitAt = null;
    // speed 60 + dt 1/15 = 每帧 4 单位：点判定必然穿过（4 和 8 都离 6 有 2 > 半径和）
    const p = FX.projectile({
      pos: new THREE.Vector3(0, 1.4, 0), dir: new THREE.Vector3(0, 0, 1),
      speed: 60, radius: 0.3, hitRadius: 0.55, team: 'player', life: 3,
      onHit: (en, pr) => { hits++; hitAt = pr.pos.z; }
    });
    const step = 1 / 15;
    for (let i = 0; i < 3 && hits === 0; i++) {
      FX.update(step);
      Game.updateProjectiles(step);
    }
    const sweptHit = hits;

    // 同样条件下用旧的点判定复算一遍，确认「真的会漏」
    let pointHits = 0;
    for (let s = 0; s <= 3; s++) {
      const z = s * 4;
      if (Math.abs(z - 6) < e.radius + 0.3 + 0.35) pointHits++;
    }

    // 符咒外观
    const tal = FX.projectile({
      pos: new THREE.Vector3(0, 1.5, 0), dir: new THREE.Vector3(0, 0, 1),
      speed: 17, style: 'talisman', color: 0xffd24a, team: 'player', life: 1
    });
    const talInfo = {
      style: tal.style,
      hasMap: !!(tal.mat && tal.mat.map),
      mapW: tal.mat.map ? tal.mat.map.image.width : 0,
      hasHalo: !!tal.haloMat,
      children: tal.mesh.children.length
    };
    FX.projectiles.length = 0;
    Game.enemies.forEach(x => disposeTree(x.actor.group));
    Game.enemies = [];
    return { sweptHit, hitAt, pointHits, talInfo, radius: e.radius };
  });
  chk(proj.sweptHit > 0, `扫掠判定命中（命中点 z=${proj.hitAt ? proj.hitAt.toFixed(2) : '-'}）`);
  chk(proj.pointHits === 0, '同一轨迹用旧点判定会完全漏掉（证明修复有效）');
  chk(proj.talInfo.style === 'talisman' && proj.talInfo.hasMap, '符咒投射物带程序化符纸贴图');
  chk(proj.talInfo.mapW === 96 && proj.talInfo.hasHalo, '符纸贴图尺寸 96px + 独立光晕层');

  /* ---------- 6. 道士技能真的能打中 ---------- */
  const taoist = await page.evaluate(() => {
    Game.state.cls = 'taoist';
    Game.state.inventory = [];
    Game.enemies.forEach(x => disposeTree(x.actor.group));
    Game.enemies = [];
    FX.projectiles.length = 0;
    Game.recalc();
    const e = Game.spawnEnemy('halfork', 0, 9, false, 5);
    const hp0 = e.hp;
    const sk = SKILLS.talisman;
    Game.cooldowns = {};
    Game.state.mp = Game.state.stats.mpMax;
    Game.castSkill('talisman');
    const spawned = FX.projectiles.filter(p => p.style === 'talisman').length;
    for (let i = 0; i < 40 && !e.dead && e.hp >= hp0; i++) {
      FX.update(1 / 30);
      Game.updateProjectiles(1 / 30);
    }
    const dmg = hp0 - e.hp;
    FX.projectiles.length = 0;
    Game.enemies.forEach(x => disposeTree(x.actor.group));
    Game.enemies = [];
    return { spawned, dmg };
  });
  chk(taoist.spawned === 1, '五雷符生成 1 枚符咒飞行物');
  chk(taoist.dmg > 0, `符咒命中造成伤害 ${Math.round(taoist.dmg)}`);

  chk(errors.length === 0, '运行期无 JS 报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close();
  server.close();

  const pass = results.filter(r => r[0] === 'PASS').length;
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
