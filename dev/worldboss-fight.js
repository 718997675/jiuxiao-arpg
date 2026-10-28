/* ============================================================
 * dev/worldboss-fight.js —— M18.7「多阶段战斗」专项体检（离线，node 直跑）
 *
 * 为什么这个脚本必须存在：
 *   战斗层是**唯一一处「数据写对了但玩家感受错了」看不出来的地方**。
 *   数据脚本（check-worldboss.js）能保证 `phases[2].enter.mire === true`，
 *   但它保证不了「毒沼真的在掉血」「三阶段真的按 0.66 切」
 *   「扇形朝正后方时不会误判命中」。这些只有跑一遍判定才知道。
 *
 * 怎么跑：不启浏览器，用 vm 把 `src/worldboss-fight.js` 装进一个
 *   带 THREE / FX / Game 桩的上下文里，然后**手动驱动** `ai()` 与
 *   `telegraph` 的回调 —— 浏览器里靠时间走的事，这里靠显式调用走。
 *
 * 三条桩的纪律（改这个文件之前先读）：
 *
 *   【一】`FX.telegraph` **不自动结算**。真 FX 是「dur 秒后调 cb」，
 *      这里把 cb 存进数组，由测试自己挑一个调。自动调会让
 *      「预警期间玩家跑开了」这类用例没法写。
 *
 *   【二】`Game.damagePlayer` 只记账不扣血。扣血会把
 *      「伤害数值对不对」和「判定有没有命中」两件事混在一起，
 *      而这个脚本只关心后者。护甲/抗性/难度是 game.js 的职责。
 *
 *   【三】坐标一律写成 `{x, z}` 的**世界米**，不要用像素或屏幕坐标。
 *      所有 shape 的判定都是米，混了单位会得到「永远命中」这种假绿。
 *
 * 用法：node dev/worldboss-fight.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadData } = require('./_load.js');

/* ---------------- 断言器 ---------------- */
let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg, detail) {
  if (cond) { pass++; return true; }
  fail++;
  bad.push({ msg, detail });
  return false;
}
function eq(a, b, msg) {
  return ok(a === b, msg, `实际 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}`);
}
function near(a, b, tol, msg) {
  return ok(Math.abs(a - b) <= tol, msg, `实际 ${a} / 期望 ${b}±${tol}`);
}

/* ============================================================
 * 一、桩
 * ============================================================ */

function mkVector(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    clone() { return mkVector(this.x, this.y, this.z); },
    setY(v) { this.y = v; return this; },
    set(x2, y2, z2) { this.x = x2; this.y = y2; this.z = z2; return this; }
  };
}

function buildHarness() {
  const ctx = loadData({
    console, Math, Set, Map, JSON, Date,
    localStorage: { getItem() { return null; }, setItem() {} }
  });

  /* --- THREE：只用到 Vector3 / Color --- */
  ctx.THREE = {
    Vector3: function (x, y, z) { return mkVector(x, y, z); },
    Color: function (c) { this.c = c; this.getHex = () => (typeof c === 'number' ? c : 0x886644); }
  };

  /* --- FX：全部记账，telegraph 的回调留给测试调 --- */
  const fx = {
    zones: [],            // area() 的产物（`_dropFx` 要能在这里找到它）
    tele: [],             // telegraph 的预警
    texts: [], rings: [], flashes: [], bursts: [], beams: [], slashes: [],
    telegraph(pos, radius, dur, cb, color) {
      this.tele.push({ pos, radius, dur, cb, color });
    },
    area(pos, radius, color, dur, opts) {
      const mesh = { parent: null, removed: false };
      this.zones.push({ mesh, mat: { disposed: false, dispose() { this.disposed = true; } }, type: 'area' });
      return mesh;
    },
    ring(pos, radius, color, dur, thick) { this.rings.push({ pos, radius, color, dur, thick }); },
    flashCircle(pos, radius, color, dur) { this.flashes.push({ pos, radius, color, dur }); },
    burst(pos, color, count, opts) { this.bursts.push({ pos, color, count, opts }); },
    beam(a, b, color, dur, width) { this.beams.push({ a, b, color, dur, width }); },
    slash(pos, angle, color, radius, arc) { this.slashes.push({ pos, angle, color, radius, arc }); },
    text(pos, str, cls, opts) { this.texts.push({ pos, str, cls, opts }); },
    /* 结算最近一次预警（`cast` 里最外层的那一个） */
    fire(i) {
      const t = this.tele[i === undefined ? this.tele.length - 1 : i];
      if (t && t.cb) t.cb();
      return !!t;
    },
    /* 结算全部预警 —— 散射 / 扇形会铺很多个，逐个挑太啰嗦 */
    fireAll() {
      let n = 0;
      for (const t of this.tele) if (t.cb) { t.cb(); t.cb = null; n++; }
      return n;
    },
    reset() {
      this.zones.length = 0; this.tele.length = 0; this.texts.length = 0;
      this.rings.length = 0; this.flashes.length = 0; this.bursts.length = 0;
      this.beams.length = 0; this.slashes.length = 0;
    }
  };
  ctx.FX = fx;

  /* --- UI / SFX：只记调用 --- */
  ctx.UI = { toasts: [], logs: [], toast(s) { this.toasts.push(s); }, log(s) { this.logs.push(s); } };
  ctx.SFX = { boss() {}, cast() {}, explode() {}, swing() {} };

  /* --- Game：玩家位置 + 伤害记账 + spawnEnemy --- */
  const game = {
    playerGroup: { position: mkVector(0, 0, 0) },
    state: { hp: 1000, mapId: 'm1' },
    dead: false,
    shake: 0,
    rootT: 0,
    enemies: [],
    hits: [],
    spawned: [],
    damagePlayer(amount, source, opts) {
      this.hits.push({ amount, source, opts: opts || {} });
    },
    spawnEnemy(kind, x, z, elite, lv, bossId) {
      const e = {
        id: 'sp' + this.spawned.length, kind: bossId || kind, boss: !!bossId, wb: false,
        pos: mkVector(x, 0, z), active: !bossId, dead: false,
        maxHp: 100, hp: 100, dmg: 10, name: '', label: null, aggro: false
      };
      this.spawned.push(e);
      this.enemies.push(e);
      return e;
    },
    placePlayer(x, z) { this.playerGroup.position.x = x; this.playerGroup.position.z = z; }
  };
  ctx.Game = game;

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worldboss-fight.js'), 'utf8'), ctx,
    { filename: 'src/worldboss-fight.js' });

  return { ctx, fx, game, WBFight: vm.runInContext('WBFight', ctx) };
}

const H = buildHarness();
const { fx, game, WBFight } = H;
const WB = vm.runInContext('WORLD_BOSSES', H.ctx);
const ORDER = vm.runInContext('WORLD_BOSS_ORDER', H.ctx);

/* 造一只世界 Boss 实体。`hpPct` 决定它在哪个阶段 */
function mkBoss(id, hpPct) {
  const cfg = WB[id];
  const e = {
    id: 'wb', wb: true, wbId: id, cfg, boss: true, dead: false,
    level: 60, maxHp: 1000, hp: 1000 * (hpPct === undefined ? 1 : hpPct),
    dmg: 100, spd: 3, atkCdBase: cfg.atkCd, reach: cfg.range || 2.2,
    pos: mkVector(0, 0, 0), radius: 2,
    wbCd: {}, wbGcd: 0, wbPhase: -1, wbSpawned: {}
  };
  return e;
}
function reset() {
  fx.reset();
  /* 场地记账是模块级状态（`WBFight._hazards`），不跟着 `fx.reset()` 走。
   * 不清的话：上一段用例在相柳 P3 铺的毒沼会留到下一段，
   * 「铺了 1 层」变成「铺了 2 层」，看起来像叠层 bug，实际是测试没打扫。 */
  WBFight.clear();
  game.hits.length = 0;
  game.spawned.length = 0;
  game.enemies.length = 0;
  game.rootT = 0;
  game.dead = false;
  game.placePlayer(0, 0);
}

/* ============================================================
 * 二、阶段（0.66 / 0.33 分界 + enter 分派 + 重置）
 * ============================================================ */
console.log('\n=== 一、阶段 ===');

for (const id of ORDER) {
  const cfg = WB[id];
  const cases = [
    [1.00, 0], [0.99, 0], [0.70, 0], [0.66, 1], [0.50, 1],
    [0.34, 1], [0.33, 2], [0.10, 2], [0.01, 2]
  ];
  for (const [pct, want] of cases) {
    const e = mkBoss(id, pct);
    eq(WBFight.phaseOf(e), want, `${cfg.name} 血量 ${(pct * 100).toFixed(0)}% → P${want + 1}`);
  }
}

/* 阶段切换必须真的把 `e.phase` 与 `e.wbPhase` 一起改（通用 AI 的移速读 e.phase） */
{
  reset();
  const e = mkBoss('xiangliu', 1);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 0, '相柳 首次 ai() 落 P1');
  eq(e.phase, 0, '相柳 P1 同步写 e.phase（通用 AI 读它算移速）');
  ok(UI().toasts.length > 0, '进阶段有 toast 提示', UI().toasts);
  ok(UI().logs.some(s => s.indexOf('相柳') >= 0), '进阶段写战斗日志', UI().logs);
}

function UI() { return H.ctx.UI; }

/* P3 不许带着 P2 的战斗参数 —— `_resetCombat` 的意义。
 * 做法：先把实体上的阶段字段**故意写脏**，再强制重进 P3，
 * 看它们有没有被打回基线。这比「P2 → P3」更能抓到漏重置的字段。 */
{
  reset();
  const e = mkBoss('xiangliu', 0.2);
  const rawDmg = e.dmg, rawSpd = e.spd, rawCd = e.atkCdBase;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 2, '相柳 P3');
  eq(e.wbHeads, 9, '相柳 P3 九头全开');
  /* 写脏：模拟「P2 的六头 + 定身 + 格挡」残留 */
  e.wbHeads = 6; e.wbRoot = 9; e.wbBlockFront = true;
  e.dmg = rawDmg * 7; e.spd = rawSpd * 7; e.atkCdBase = rawCd * 7;
  WBFight._enterPhase(e, 2);
  eq(e.wbHeads, 9, '重进 P3 后头数按本阶段重算（不继承 P2 的 6）');
  eq(e.wbRoot, 0, '重进 P3 后定身归零');
  eq(e.wbBlockFront, false, '重进 P3 后不再格挡');
  near(e.dmg, rawDmg, 0.001, '重进 P3 后伤害回到基线');
  near(e.spd, rawSpd, 0.001, '重进 P3 后移速回到基线');
  near(e.atkCdBase, rawCd, 0.001, '重进 P3 后普攻间隔回到基线');
}

/* 刑天 P3：弃守全攻 —— 攻速 ×2、伤害 +30%、且**不再格挡** */
{
  reset();
  const e = mkBoss('xingtian', 1);
  const rawDmg = e.dmg, rawCd = e.atkCdBase;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 0, '刑天 P1');
  eq(e.wbStance, 'axe', '刑天 P1 持斧');
  near(e.dmg, rawDmg * 1.2, 0.001, '持斧伤害 ×1.2');
  e.hp = 1000 * 0.5;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbStance, 'shield', '刑天 P2 持盾');
  eq(e.wbBlockFront, true, '刑天 P2 挡正面');
  near(e.dmg, rawDmg * 0.85, 0.001, '持盾伤害 ×0.85');
  e.hp = 1000 * 0.2;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 2, '刑天 P3');
  eq(e.wbStance, 'both', '刑天 P3 斧盾同用');
  eq(e.wbBlockFront, false, '刑天 P3 不再格挡（弃守全攻）');
  near(e.atkCdBase, rawCd / 2, 0.001, '刑天 P3 攻速 ×2（普攻间隔减半）');
  near(e.dmg, rawDmg * 1.1 * 1.3, 0.001, '刑天 P3 伤害 = 基线 ×1.1（双持）×1.3（dmgMul）');
}

/* 鲲鹏：鲲慢而重、鹏快而轻 —— 用 spd / reach 表达体型 */
{
  reset();
  const e = mkBoss('kunpeng', 1);
  const rawSpd = e.spd, rawReach = e.reach;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbMorph, 'kun', '鲲鹏 P1 入鲲形');
  near(e.spd, rawSpd * 0.8, 0.001, '鲲形移速 ×0.8');
  ok(e.reach > rawReach, '鲲形触及更远（体型更大）', { rawReach, now: e.reach });
  e.hp = 1000 * 0.5; WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbMorph, 'peng', '鲲鹏 P2 入鹏形');
  near(e.spd, rawSpd * 1.5, 0.001, '鹏形移速 ×1.5');
  ok(e.reach < rawReach, '鹏形触及更近', { rawReach, now: e.reach });
  e.hp = 1000 * 0.2; WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbMorph, 'both', '鲲鹏 P3 鲲鹏同体');
  near(e.spd, rawSpd * 1.2, 0.001, '同体移速 ×1.2');
}

/* 相柳 P3 毒沼：只铺一次（重复进阶段不许叠） */
{
  reset();
  const e = mkBoss('xiangliu', 0.2);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(WBFight._hazards.length, 1, '相柳 P3 铺 1 层毒沼');
  const first = WBFight._hazards[0];
  /* 反复「出阶段再进阶段」不该叠 */
  e.wbPhase = 1; e.hp = 1000 * 0.2;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(WBFight._hazards.length, 1, '重复进 P3 不叠毒沼');
  ok(WBFight._hazards[0] === first, '毒沼还是第一次那一层');
  near(first.r, WB.xiangliu.domain.radius, 0.001, '毒沼半径 = 领域半径');
  WBFight.clear();
}

/* 九尾狐 P1 分身：拆干净 boss / wb，血量 6%，会主动追人 */
{
  reset();
  const e = mkBoss('jiuweihu', 1);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 0, '九尾狐 P1');
  eq(game.spawned.length, 2, '九尾狐 P1 召 2 个分身（数据 clones: 2）');
  for (const c of game.spawned) {
    eq(c.boss, false, '分身不是首领（否则 onKill 会读 BOSS_POS 抛异常）');
    eq(c.wb, false, '分身不挂 wb（否则 WorldBoss.live() 认错本尊）');
    eq(c.wbClone, true, '分身有 wbClone 标记');
    eq(c.active, true, '分身一出生就会追人');
    eq(c.maxHp, Math.round(e.maxHp * 0.06), '分身血量 = 本尊 6%（一击碎）');
    ok(c.dmg > 0, '分身有伤害（否则只是站着不动的摆设）', c.dmg);
  }
  /* 重复进阶段不重复召唤 */
  e.wbPhase = -1;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(game.spawned.length, 2, '重复进 P1 不再召分身');
}

/* ============================================================
 * 三、出手（cd / 夜间限定 / 距离门槛）
 * ============================================================ */
console.log('\n=== 二、出手 ===');

/* cd：同一只技能不会连着放两次 */
{
  reset();
  const e = mkBoss('xiangliu', 1);
  WBFight.ai(e, 0.016, game.playerGroup.position);   // 进 P1，wbGcd = 0.7
  const sk = WB.xiangliu.skills[WB.xiangliu.phases[0].skills[0]];
  eq(e.wbCd[sk.id] || 0, 0, 'P1 首个技能初始无 cd');
  /* 把 gcd 推过去 */
  WBFight.ai(e, 1.0, game.playerGroup.position);
  const used = Object.keys(e.wbCd).filter(k => e.wbCd[k] > 0);
  ok(used.length >= 1, '出手后至少记了一个技能 cd', e.wbCd);
  const cdVal = e.wbCd[used[0]];
  ok(cdVal > 0 && cdVal <= (WB.xiangliu.skills[used[0]].cd || 6), 'cd 落在技能自己的 cd 内', e.wbCd);
}

/* 夜间限定：烛九阴的 `nightOnly` 技能白天不放 */
{
  reset();
  const e = mkBoss('zhulong', 1);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  /* 找一个 P3 的夜间限定技能 */
  const p3 = WB.zhulong.phases[2];
  const nightSk = (p3.skills || []).map(id => WB.zhulong.skills[id]).filter(s => s && s.nightOnly);
  ok(nightSk.length > 0, '烛九阴 P3 存在夜间限定技能', p3.skills);
  if (nightSk.length) {
    e.hp = 1000 * 0.2;
    e.wbNight = false;
    WBFight.ai(e, 0.016, game.playerGroup.position);
    eq(WBFight.nightOf(e), false, '白天时 nightOf = false');
    /* 让所有非夜间技能都进 cd，只剩夜间技能可用 → 不该出手 */
    for (const id of (WB.zhulong.phases[2].skills || [])) {
      const s = WB.zhulong.skills[id];
      if (s && !s.nightOnly) e.wbCd[id] = 99;
    }
    e.wbGcd = 0;
    fx.reset();
    WBFight.ai(e, 0.016, game.playerGroup.position);
    eq(fx.tele.length, 0, '白天不放夜间限定技能');
    e.wbNight = true;
    eq(WBFight.nightOf(e), true, '入夜后 nightOf = true');
    e.wbGcd = 0;
    WBFight.ai(e, 0.016, game.playerGroup.position);
    ok(fx.tele.length > 0, '入夜后夜间技能可以放', fx.tele.length);
  }
}

/* 距离门槛：够不着的技能不放（否则满屏打不到的空预警） */
{
  reset();
  const e = mkBoss('xiangliu', 1);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  game.placePlayer(400, 400);                 // 跑到 565 米外
  for (const id in e.wbCd) e.wbCd[id] = 0;
  e.wbGcd = 0;
  fx.reset();
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(fx.tele.length, 0, '距离超出所有技能射程时不出手');
  game.placePlayer(0, 0);
}

/* ============================================================
 * 四、7 种 shape 的判定
 * ============================================================ */
console.log('\n=== 三、shape 判定 ===');

/* 造一个「只放指定技能」的最小环境：直接把技能塞进当前阶段 */
function castOnly(bossId, skillId, playerX, playerZ) {
  reset();
  const e = mkBoss(bossId, 1);
  const sk = WB[bossId].skills[skillId];
  if (!sk) return { e, sk: null, hit: false };
  game.placePlayer(playerX, playerZ);
  e.dmg = 100;
  WBFight.cast(e, sk, game.playerGroup.position);
  fx.fireAll();
  return { e, sk, hit: game.hits.length > 0 };
}

/* ---- line：长条穿透 ---- */
{
  /* 用相柳的冲撞（shape line）。玩家站在正前方 10 米 → 命中 */
  const lineSk = ORDER.map(id => WB[id].skills).flatMap(s => Object.values(s))
    .find(s => s.shape === 'line' && !s.nightOnly);
  ok(!!lineSk, '存在 line 形状技能', lineSk && lineSk.id);
  if (lineSk) {
    const owner = ORDER.find(id => WB[id].skills[lineSk.id]);
    const halfW = Math.max(1, (lineSk.width || 3) / 2);
    /* 「侧向 / 边缘」必须靠 **cast 之后再移动** 来测。
     * line 是「朝玩家放」的：让玩家直接站侧面，技能会跟着转过去，
     * 玩家永远在线上 —— 那样测到的不是判定，是「boss 会不会转向」。
     * 上一版两个用例就是这么假红的（看起来像判定写错，其实是构造错）。 */
    const lockThenMove = (x, z) => {
      reset();
      const e = mkBoss(owner, 1);
      e.dmg = 100;
      game.placePlayer(0, 10);                     // 先站正前方 → 技能朝 +z 锁死
      WBFight.cast(e, lineSk, game.playerGroup.position);
      game.placePlayer(x, z);                      // 预警已锁定，再挪位置
      fx.fireAll();
      return game.hits.length > 0;
    };
    ok(castOnly(owner, lineSk.id, 0, 10).hit, `line「${lineSk.name}」正前方 10 米命中`, game.hits);
    ok(!lockThenMove(30, 10), `line「${lineSk.name}」侧向 30 米不命中`);
    /* 0.7 米宽容：半宽 + 0.7 之内算命中 */
    ok(lockThenMove(halfW + 0.6, 10), 'line 边缘 0.6 米仍命中（0.7 米宽容）');
    ok(!lockThenMove(halfW + 0.9, 10), 'line 边缘 0.9 米不命中');
    /* 穿透 ≠ 无限长：走到线末端之外要安全 */
    ok(!lockThenMove(0, (lineSk.range || 20) + 3), 'line 射程之外不命中');
  }
}

/* ---- circle at target：落点圆 ---- */
{
  const cSk = ORDER.map(id => WB[id].skills).flatMap(s => Object.values(s))
    .find(s => s.shape === 'circle' && s.at === 'target');
  ok(!!cSk, '存在 at:target 的 circle 技能', cSk && cSk.id);
  if (cSk) {
    const owner = ORDER.find(id => WB[id].skills[cSk.id]);
    const cr = cSk.range || 16;
    /* 先站到 (5,5) 让落点锁在那里，预警期间跑出圈。
     * 跑的距离要**超过落点半径**才叫「跑出去」—— 上一版只挪了 7 米，
     * 而落点圆半径 16~22 米，人还在圈里，假红。 */
    reset();
    const e = mkBoss(owner, 1);
    game.placePlayer(5, 5);
    WBFight.cast(e, cSk, game.playerGroup.position);
    game.placePlayer(5 + cr + 4, 5);            // 跑出圈
    fx.fireAll();
    ok(!game.hits.length, `circle「${cSk.name}」预警后跑出圈不挨打`);
    /* 原地不动 → 命中 */
    reset();
    game.placePlayer(5, 5);
    WBFight.cast(mkBoss(owner, 1), cSk, game.playerGroup.position);
    fx.fireAll();
    ok(game.hits.length > 0, `circle「${cSk.name}」站着不动命中`);
  }
}

/* ---- fan：扇形，朝正后方不许误判 ---- */
{
  const fSk = ORDER.map(id => WB[id].skills).flatMap(s => Object.values(s))
    .find(s => s.shape === 'fan' || s.shape === 'cone');
  ok(!!fSk, '存在 fan/cone 技能', fSk && fSk.id);
  if (fSk) {
    const owner = ORDER.find(id => WB[id].skills[fSk.id]);
    const r = fSk.range || 14;
    /* 正前方 */
    const front = castOnly(owner, fSk.id, 0, r * 0.6);
    ok(front.hit, `fan「${fSk.name}」正前方命中`);
    /* 正后方（角度差 = π，必须绕回 [-π, π] 才能判对）。
     * 同样要「先 cast 再移到背后」—— 直接站背后放，扇子会转过去。 */
    reset();
    {
      const e = mkBoss(owner, 1);
      game.placePlayer(0, r * 0.6);
      WBFight.cast(e, fSk, game.playerGroup.position);
      game.placePlayer(0, -r * 0.6);
      fx.fireAll();
      ok(!game.hits.length, `fan「${fSk.name}」正后方不命中（角度绕回正确）`);
    }
    /* 超距 */
    const far = castOnly(owner, fSk.id, 0, r + 3);
    ok(!far.hit, `fan「${fSk.name}」超出射程不命中`);
  }
}

/* ---- scatter：落点周围撒 N 颗，站在落点中心必中 ---- */
{
  const sSk = ORDER.map(id => WB[id].skills).flatMap(s => Object.values(s))
    .find(s => s.shape === 'scatter');
  ok(!!sSk, '存在 scatter 技能', sSk && sSk.id);
  if (sSk) {
    const owner = ORDER.find(id => WB[id].skills[sSk.id]);
    /* 撒点有随机性，跑 20 次，只要中过一次就说明判定是通的 */
    let hitAny = false;
    for (let i = 0; i < 20 && !hitAny; i++) {
      const r = castOnly(owner, sSk.id, 0, 0);
      if (r.hit) hitAny = true;
    }
    ok(hitAny, `scatter「${sSk.name}」站在落点中心 20 次内至少中 1 次`);
    ok(fx.tele.length >= 3, 'scatter 至少铺 3 个落点', fx.tele.length);
  }
}

/* ---- ring：内圈安全，环上挨打 ---- */
{
  const rSk = ORDER.map(id => WB[id].skills).flatMap(s => Object.values(s))
    .find(s => s.shape === 'ring');
  ok(!!rSk, '存在 ring 技能', rSk && rSk.id);
  if (rSk) {
    const owner = ORDER.find(id => WB[id].skills[rSk.id]);
    const R = rSk.range || 20;
    const inner = R * 0.55;
    const inSafe = castOnly(owner, rSk.id, 0, inner * 0.4);
    ok(!inSafe.hit, `ring「${rSk.name}」内圈安全`);
    const onRing = castOnly(owner, rSk.id, 0, (R + inner) / 2);
    ok(onRing.hit, `ring「${rSk.name}」环上命中`);
    const out = castOnly(owner, rSk.id, 0, R + 3);
    ok(!out.hit, `ring「${rSk.name}」圈外不命中`);
  }
}

/* ---- self：战吼只给自己上状态，不伤人 ---- */
{
  reset();
  const e = mkBoss('xingtian', 1);
  const sk = WB.xingtian.skills.wb_warcry;
  ok(!!sk, '刑天有战吼', sk && sk.id);
  if (sk) {
    WBFight.cast(e, sk, game.playerGroup.position);
    fx.fireAll();
    eq(game.hits.length, 0, 'self 技能不伤害玩家');
    ok((e.wbHasteT || 0) > 0, '战吼给自己上攻速 buff', e.wbHasteT);
  }
}

/* ============================================================
 * 五、场地（毒沼 / 狐火）
 * ============================================================ */
console.log('\n=== 四、场地 ===');

{
  reset();
  const e = mkBoss('xiangliu', 0.2);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  const h = WBFight._hazards[0];
  ok(!!h, '相柳 P3 有场地效果');
  /* 玩家在圈内：每 `every` 秒掉一次 */
  game.placePlayer(0, 0);
  game.state.hp = 1000;
  WBFight.tick(0.5);
  eq(game.hits.length, 0, '场地伤害不到 1 个间隔不掉血');
  WBFight.tick(0.8);                       // 累计 1.3 > 1.2
  eq(game.hits.length, 1, '过了间隔掉一次血');
  eq(game.hits[0].opts.pierce, true, '场地伤害走 pierce（不吃护甲/抗性/难度）');
  near(game.hits[0].amount, 100 * 0.22, 0.001, '毒沼伤害 = 本尊伤害 ×0.22');
  ok(game.hits[0].source === null, '场地伤害没有来源实体（环境伤害）');
  /* 玩家出圈：不掉血 */
  game.hits.length = 0;
  game.placePlayer(200, 0);
  WBFight.tick(5);
  eq(game.hits.length, 0, '出圈后不再掉血');
  /* clear 要连可视圆一起摘 */
  const zoneBefore = fx.zones.length;
  ok(zoneBefore > 0, '场地铺了可视圆', zoneBefore);
  WBFight.clear();
  eq(WBFight._hazards.length, 0, 'clear 清空场地记账');
  eq(fx.zones.length, 0, 'clear 同时摘掉可视圆（否则场景里留一个大圆）');
}

/* 狐火：伤害更高、间隔更长 */
{
  reset();
  const e = mkBoss('jiuweihu', 0.2);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  const h = WBFight._hazards[0];
  ok(!!h, '九尾狐 P3 有狐火');
  if (h) {
    eq(h.label, '狐火', '狐火标注正确（UI 文本读它）');
    near(h.dmg, e.dmg * 0.3, 0.001, '狐火伤害 = 本尊伤害 ×0.3');
    near(h.every, 1.5, 0.001, '狐火每 1.5 秒一跳');
  }
  WBFight.clear();
}

/* ============================================================
 * 六、定身（root）
 * ============================================================ */
console.log('\n=== 五、定身 ===');

/* 技能自带 root（尾缚 2.5 秒） */
{
  reset();
  const e = mkBoss('jiuweihu', 0.5);
  const sk = WB.jiuweihu.skills.wb_tailbind;
  ok(!!sk && sk.root === 2.5, '尾缚数据里 root: 2.5', sk && sk.root);
  game.placePlayer(0, (sk.range || 20) * 0.7);   // 站在环上
  WBFight.cast(e, sk, game.playerGroup.position);
  fx.fireAll();
  ok(game.hits.length > 0, '尾缚命中');
  near(game.rootT, 2.5, 0.001, '命中后玩家被定身 2.5 秒');
}

/* 阶段 enter.rootOnHit：连非定身技能也定身 */
{
  reset();
  const e = mkBoss('jiuweihu', 0.5);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 1, '九尾狐 P2');
  eq(e.wbRoot, 2.5, 'P2 enter.rootOnHit 落到 e.wbRoot');
  const sk = WB.jiuweihu.skills.wb_foxfire;      // 本身没有 root
  ok(!sk.root, '狐火本身不带 root');
  game.placePlayer(0, 0);
  WBFight.cast(e, sk, game.playerGroup.position);
  fx.fireAll();
  ok(game.hits.length > 0, '狐火命中');
  near(game.rootT, 2.5, 0.001, 'P2 之后普通技能也定身（rootOnHit 名副其实）');
}

/* ============================================================
 * 六、阶段 enter 的落地效果 + 接线（game.js / worldboss.js 那几处）
 * ============================================================ */
console.log('\n=== 六、enter 与接线 ===');

/* 刑天：P2 盾（正面格挡）、P3 弃守全攻（攻速 ×2、伤害 ×1.3、不格挡） */
{
  reset();
  const e = mkBoss('xingtian', 0.5);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 1, '刑天 P2');
  eq(e.wbStance, 'shield', 'P2 姿态 = shield');
  eq(e.wbBlockFront, true, 'P2 stance:shield → 正面格挡');
  near(e.dmg, 100 * 0.85, 0.001, 'P2 持盾伤害 = 基线 ×0.85');

  e.hp = 1000 * 0.2;                       // 掉到 P3
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 2, '刑天 P3');
  eq(e.wbStance, 'both', 'P3 姿态 = both');
  eq(e.wbBlockFront, false, 'P3「弃守全攻」不再格挡（_resetCombat 真的把 P2 的盾摘了）');
  near(e.dmg, 100 * 1.1 * 1.3, 0.001, 'P3 伤害 = 基线 ×1.1(both) ×1.3(dmgMul)');
  near(e.atkCdBase, e.cfg.atkCd / 2, 0.001, 'P3 aspdMul 2 → 普攻间隔减半');
}

/* 战吼：快 50%，8 秒后自己掉回去；且**叠加**在阶段攻速上，不是覆盖 */
{
  reset();
  const e = mkBoss('xingtian', 0.2);
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 2, '刑天 P3（战吼可用）');
  const base = e.atkCdBase;
  WBFight.cast(e, WB.xingtian.skills.wb_warcry, game.playerGroup.position);
  fx.fireAll();
  near(e.wbHaste, 1.5, 0.001, '战吼给 wbHaste = 1.5（快 50%）');
  near(e.atkCdBase, base / 1.5, 0.001, '战吼叠加在阶段攻速上（不是覆盖）');
  /* 8 秒后归位。用 dt=1 推 9 次，中途出手不影响攻速 */
  for (let i = 0; i < 9; i++) WBFight.ai(e, 1, game.playerGroup.position);
  near(e.wbHaste, 1, 0.001, '战吼 8 秒后自动归位（不借 aspdT，那个不会自己清）');
  near(e.atkCdBase, base, 0.001, '归位后回到阶段攻速');
}

/* 烛九阴 P3：昼夜交替每 6 秒翻一次，`nightOf` 必须跟着走
 * （领域视野在 worldboss.js 里读的就是它） */
{
  reset();
  const e = mkBoss('zhulong', 0.2);
  e.wbNight = false;
  WBFight.ai(e, 0.016, game.playerGroup.position);
  eq(e.wbPhase, 2, '烛九阴 P3');
  eq(WBFight.nightOf(e), false, 'P3 起手是白天');
  for (let i = 0; i < 7; i++) WBFight.ai(e, 1, game.playerGroup.position);
  eq(e.wbNight, true, 'P3 每 6 秒翻一次昼夜（7 秒后已入夜）');
  eq(WBFight.nightOf(e), true, 'nightOf 跟随 wbNight');
  for (let i = 0; i < 7; i++) WBFight.ai(e, 1, game.playerGroup.position);
  eq(e.wbNight, false, '再过 6 秒回到白天');
}

/* 接线断言：这些是「数据对了但没接上」的唯一防线。
 * 战斗层自己全绿、游戏里却一点效果都没有，是最难查的一类问题。 */
{
  const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  ok(gsrc.indexOf('WBFight.ai(') >= 0, 'game.js updateBossAI 调 WBFight.ai');
  ok(gsrc.indexOf('WBFight.tick(') >= 0, 'game.js update 每帧调 WBFight.tick（场地伤害）');
  ok(gsrc.indexOf('WBFight.clear(') >= 0, 'game.js loadMap 清场地（否则换图还在掉血）');
  ok(/e\.wbBlockFront/.test(gsrc), 'game.js damageEnemy 读 wbBlockFront（否则 P2 的盾是装饰）');
  ok(/this\.rootT/.test(gsrc), 'game.js 有 rootT 并进了移动 / 死亡 / 换图三处');
  ok(/e\.wbRoot/.test(gsrc), 'game.js 普攻结算读 wbRoot（九尾狐 P2 连普攻都定身）');
  ok(/e\.atkCdBase/.test(gsrc), 'game.js 普攻冷却读 atkCdBase（阶段攻速才生效）');

  const wsrc = fs.readFileSync(path.join(ROOT, 'src/worldboss.js'), 'utf8');
  ok(/WBFight\.nightOf/.test(wsrc), 'worldboss.js 昼夜视野读 WBFight.nightOf（不另起计时器）');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iWb = html.indexOf('src/worldboss.js');
  const iFight = html.indexOf('src/worldboss-fight.js');
  ok(iFight >= 0, 'index.html 加载了战斗层');
  ok(iFight > iWb, '加载顺序：worldboss.js 在战斗层之前');
}

/* `enter` 的每一个键都要有**消费点**（战斗层或领域层真的读过它）。
 * 这是「数据里加了新键、代码没接」的唯一防线 —— 只写不读的字段
 * 看起来一切正常，进游戏什么都不会发生，是最难查的一类问题。
 * 显式 pending 的两个键要写进 PENDING，而不是静默放过。 */
{
  const PENDING = new Set(['tails', 'revealVuln']);   // 等 M18.6 的骨架
  const srcAll = fs.readFileSync(path.join(ROOT, 'src/worldboss-fight.js'), 'utf8') +
    fs.readFileSync(path.join(ROOT, 'src/worldboss.js'), 'utf8');
  const keys = new Set();
  for (const id of ORDER) for (const ph of (WB[id].phases || [])) for (const k in (ph.enter || {})) keys.add(k);
  for (const k of keys) {
    if (PENDING.has(k)) continue;
    ok(srcAll.indexOf(k) >= 0, `enter 键「${k}」有消费点（战斗层或领域层读过它）`);
  }
  ok(PENDING.size === 2, 'pending 的 enter 键应当只有 tails / revealVuln');
}

/* ============================================================
 * 七、与八部天龙去重（战斗层不许出现八部的语言）
 * ============================================================ */
console.log('\n=== 七、去重 ===');

{
  const src = fs.readFileSync(path.join(ROOT, 'src/worldboss-fight.js'), 'utf8');
  /* **只看代码，不看注释。** 文件头明明白白写着「不要走 bossPattern / patterns」，
   * 拿原文 indexOf 去查会把这段解释判成违规 —— 上一版就是这么假红的。
   * 去重的实质是「不调用、不读取」，不是「不许提起」。 */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(code.indexOf('bossPattern') < 0, '战斗层不调用 bossPattern（那是八部的招式池）');
  ok(!/\.patterns\b/.test(code), '战斗层不读 cfg.patterns');
  ok(code.indexOf('stagger') < 0, '战斗层不出现 stagger（八部的破绽窗口）');
  /* 世界 Boss 的 enter 里也不许有 stagger 键 */
  for (const id of ORDER) {
    for (const ph of (WB[id].phases || [])) {
      for (const k in (ph.enter || {})) {
        ok(k.toLowerCase().indexOf('stagger') < 0,
          `${WB[id].name} ${ph.name} 的 enter 键「${k}」不是八部的语言`);
      }
    }
  }
}

/* ============================================================
 * 收尾
 * ============================================================ */
console.log('\n' + '='.repeat(56));
if (fail) {
  console.log(`失败 ${fail} 项：`);
  for (const b of bad) console.log('  ✗ ' + b.msg + (b.detail !== undefined ? '  → ' + JSON.stringify(b.detail) : ''));
}
console.log(`世界 Boss 战斗层：通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
