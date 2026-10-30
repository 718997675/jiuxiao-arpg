/* ============================================================
 * dev/worldboss-loot.js —— M18.8「世界 Boss 掉落」专项体检（离线，node 直跑）
 *
 * 为什么必须单独一个脚本：
 *   掉落是**全作唯一稳定产出传世的入口**（章节首领只负责抽奖）。
 *   它错的方式都很安静：
 *     · 少发一件 —— 玩家只会觉得「今天手气差」，没人报 bug
 *     · 发两遍   —— 半个赛季的产出直接作废
 *     · 掉在模型里 —— 光柱在那儿，人撞不进 44 米的蛇，捡不到
 *     · 掉成神品 —— `rollItem` 里有两个 2% 的独立入口（法器 / 命格），
 *                  它们只看 `!opts.rarity`，传 `pool` 挡不住
 *   这些在浏览器里都只能靠运气撞见，所以在这里把随机数按大样本跑一遍。
 *
 * 怎么跑：`loadData()` 按 index.html 的顺序装数据层（含 items.js），
 *   再把 `src/worldboss.js` 灌进同一个 ctx，`Game.spawnLoot` 换成记账桩 ——
 *   只验「发了什么」，不验「捡起来怎么进背包」（那是 game.js 的职责）。
 *
 * 用法：node dev/worldboss-loot.js
 * ============================================================ */
const { loadData, ROOT } = require('./_load.js');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

/* ---------------- 断言器 ---------------- */
let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg, detail) {
  if (cond) { pass++; return true; }
  fail++;
  bad.push({ msg, detail });
  return false;
}
function eq(a, b, msg) { return ok(a === b, msg, `实际 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}`); }
function between(v, lo, hi, msg) { return ok(v >= lo && v <= hi, msg, `实际 ${v} / 期望 ${lo}~${hi}`); }
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* ---------------- 环境 ---------------- */
const ctx = loadData({
  console, Math, Set, Map, JSON, Date, isFinite, parseFloat, parseInt,
  Number, String, Boolean, Error, Array, Object, RegExp,
  localStorage: { getItem() { return null; }, setItem() {} }
});

/* THREE 只用到 Vector3 / Color（FX.flashCircle 的入参） */
ctx.THREE = {
  Vector3: function (x, y, z) {
    this.x = x || 0; this.y = y || 0; this.z = z || 0;
    this.set = function (a, b, c) { this.x = a; this.y = b; this.z = c; return this; };
    this.clone = function () { return new ctx.THREE.Vector3(this.x, this.y, this.z); };
  },
  Color: function (c) { this.c = c; this.getHex = () => (typeof c === 'number' ? c : 0xffffff); }
};

/* FX / UI / SFX：只记账 */
const fx = { flashes: [], flashCircle(p, r, c, d) { this.flashes.push({ x: p.x, z: p.z, r, c, d }); } };
ctx.FX = fx;
const logs = [];
ctx.UI = { log(t, c) { logs.push({ t, c }); }, toast() {}, renderWorldBoss() {} };
ctx.SFX = { levelup() {}, loot() {} };

/* Game：spawnLoot 记账桩。**故意不实现 addItem / addMat** ——
 * 一旦 grantLoot 绕过 spawnLoot 直接写背包，这里就会抛「not a function」。 */
const drops = [];
const game = {
  state: { level: 60, mapId: 'mirrorrealm', difficulty: 'normal', worldBoss: null },
  enemies: [],
  loot: [],
  scene: { remove() {}, add() {} },
  playerGroup: { position: { x: 0, y: 0, z: 12 } },
  spawnLoot(pos, item, gold, extra) {
    drops.push({ x: pos.x, z: pos.z, item: item || null, gold: gold || 0, extra: extra || null });
  }
};
ctx.Game = game;

vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worldboss.js'), 'utf8'), ctx,
  { filename: 'src/worldboss.js' });

const WB = vm.runInContext('WorldBoss', ctx);
const WBOSS = vm.runInContext('WORLD_BOSSES', ctx);
const ORDER = vm.runInContext('WORLD_BOSS_ORDER', ctx);
const CFG = vm.runInContext('WORLD_BOSS_CFG', ctx);
const CRAFT_MATS = vm.runInContext('CRAFT_MATS', ctx);
const MATS = vm.runInContext('WORLD_BOSS_MATERIALS', ctx);
const rollItem = vm.runInContext('rollItem', ctx);

/* 造一只世界 Boss 实体。`dist` 决定玩家站多远 */
function mk(id, dist) {
  const cfg = WBOSS[id];
  return {
    id: 'wb', wb: true, wbId: id, cfg, boss: true, dead: false,
    level: 60, maxHp: 1000, hp: 0, dmg: 100,
    pos: { x: 0, z: 0 }, radius: cfg.body.radius
  };
}
function reset(diff) {
  drops.length = 0;
  fx.flashes.length = 0;
  logs.length = 0;
  game.state.difficulty = diff || 'normal';
  game.playerGroup.position.x = 0;
  game.playerGroup.position.z = 12;
}

/* ============================================================
 * 一、传世必掉（1~3，按难度抬下限）
 * ============================================================ */
head('一、传世必掉');
for (const id of ORDER) {
  const c = WBOSS[id];
  const expect = { normal: [1, 3], hard: [2, 4], nightmare: [2, 4], hell: [3, 5] };
  for (const d of Object.keys(expect)) {
    reset(d);
    const e = mk(id);
    const out = WB.grantLoot(e);
    const uni = drops.filter(x => x.item && x.item.rarity === 'unique');
    between(uni.length, expect[d][0], expect[d][1],
      `${c.name} / ${d}：必掉 ${expect[d][0]}~${expect[d][1]} 件传世`);
    ok(out && out.unique === uni.length, `${c.name} / ${d}：返回值件数与实际掉落一致`, out && out.unique);
  }
}

/* ============================================================
 * 二、大样本：一件都不能掉成神品
 * ============================================================ */
head('二、大样本 400 次（不许出现非传世）');
{
  const cnt = {};
  let nonUnique = 0;
  const ids = new Set();
  /* 注意：**不要在循环里 reset()** —— 它清 drops，跑完只剩最后一杀的战利品。
   * 第一版就是这么写的，结果「120 次击杀产出 2 件」假红。 */
  reset('normal');
  for (let i = 0; i < 120; i++) {
    const e = mk(ORDER[i % ORDER.length]);
    WB.grantLoot(e);
  }
  for (const d of drops) {
    if (!d.item) continue;
    cnt[d.item.rarity] = (cnt[d.item.rarity] || 0) + 1;
    if (d.item.rarity !== 'unique') nonUnique++;
    if (d.item.uniqueId) ids.add(d.item.uniqueId);
  }
  const total = Object.values(cnt).reduce((a, b) => a + b, 0);
  ok(total > 200, '120 次击杀确实产出了大量装备', total);
  eq(nonUnique, 0, `全部是传世（实际出现 ${JSON.stringify(cnt)}）`);
  ok(ids.size > 20, '传世不是同一件反复出（uniqueId 种类够多）', ids.size);
  console.log(`  120 次击杀 · ${total} 件 · 品质分布 ${JSON.stringify(cnt)} · ${ids.size} 种不同传世`);
}

/* ============================================================
 * 三、材料 / 符文 / 世界魂
 * ============================================================ */
head('三、材料与符文');
for (const id of ORDER) {
  const c = WBOSS[id];
  reset();
  const out = WB.grantLoot(mk(id));
  const mats = drops.filter(d => d.extra && d.extra.mat);
  const crystals = drops.filter(d => d.extra && d.extra.crystal);
  const runes = drops.filter(d => d.extra && d.extra.rune);

  /* 玄晶走 crystal 通道，其余走 mat 通道 —— 混着发会「捡了但背包没涨」 */
  eq(crystals.length, 1, `${c.name}：玄晶恰好一坨（走 crystal 通道）`);
  ok(crystals.length === 1 && crystals[0].extra.crystal >= 80, `${c.name}：玄晶 ≥80`, crystals[0] && crystals[0].extra.crystal);

  const dataMats = (c.loot.mats || []).filter(m => m.key !== 'xuanjing');
  eq(mats.length, dataMats.length, `${c.name}：匠材堆数 = 掉落表里的非玄晶条数`);

  /* 每一条材料都要落在数据写的区间里 */
  for (const m of (c.loot.mats || [])) {
    if (m.key === 'xuanjing') continue;
    const d = drops.find(x => x.extra && x.extra.mat && ('craft_' + x.extra.mat.id) === m.key);
    ok(!!d, `${c.name}：掉落表里的 ${m.key} 真的发了`);
    if (d) between(d.extra.mat.n, m.min, m.max, `${c.name}：${m.key} 数量 ${m.min}~${m.max}`);
  }

  /* 世界魂必掉（M18.8 的接入口） */
  const soul = drops.find(x => x.extra && x.extra.mat && x.extra.mat.id === 'worldsoul');
  ok(!!soul, `${c.name}：必掉世界魂`);
  if (soul) {
    between(soul.extra.mat.n, 1, 2, `${c.name}：世界魂 1~2 个`);
    ok(!!CRAFT_MATS.worldsoul, `${c.name}：世界魂在 CRAFT_MATS 里（否则捡了没地方放）`);
    ok(soul.extra.mat.id === MATS.worldsoul.id, `${c.name}：世界魂 id 与 WORLD_BOSS_MATERIALS 一致`);
  }

  between(runes.length, 2, 4, `${c.name}：符文 2~4 个`);
  ok(runes.every(d => typeof d.extra.rune === 'string' && d.extra.rune.length > 0), `${c.name}：符文 id 合法`);
  ok(out.mats === crystals.length + mats.length, `${c.name}：返回的材料堆数与实际一致`, out.mats);
  ok(out.runes === runes.length, `${c.name}：返回的符文数与实际一致`, out.runes);
}

/* ============================================================
 * 四、落点：必须在尸体边缘，不能掉进模型里
 * ============================================================ */
head('四、落点（44 米的蛇不许把战利品埋在肚子里）');
{
  for (const id of ORDER) {
    const c = WBOSS[id];
    reset();
    WB.grantLoot(mk(id));
    const rad = c.body.radius;
    const dists = drops.map(d => Math.hypot(d.x, d.z));
    const near = Math.min(...dists);
    ok(near > rad * 0.9, `${c.name}：最近的掉落也在半径 ${rad} 米之外（不在模型里）`, +near.toFixed(1));
    ok(near < rad + 6, `${c.name}：掉落没被推到天边（≤ 半径 +6 米）`, +near.toFixed(1));
    /* 玩家在 (0,12)，落点必须比「中心到玩家」更近 */
    ok(dists.every(d => d <= 12.01), `${c.name}：掉落比玩家更靠近尸体中心（不会推到玩家身后）`);
  }

  /* 玩家和 boss 重合时不能除零炸掉 */
  reset();
  game.playerGroup.position.x = 0; game.playerGroup.position.z = 0;
  const e = mk('zhulong');
  let threw = null;
  try { WB.grantLoot(e); } catch (err) { threw = err.message; }
  ok(!threw, '玩家与 boss 重合时不抛异常（除零保护）', threw);
  ok(drops.length > 0, '重合时仍然发奖（退回中心点）');
}

/* ============================================================
 * 五、幂等：重入不能发两遍
 * ============================================================ */
head('五、幂等与守卫');
{
  reset();
  const e = mk('taotie');
  const first = WB.grantLoot(e);
  const n1 = drops.length;
  const second = WB.grantLoot(e);
  eq(drops.length, n1, '同一只 boss 第二次调 grantLoot 不再发奖');
  eq(second, null, '第二次返回 null');
  ok(!!first, '第一次正常返回');

  /* 非世界 Boss / 没数据的一律不发 */
  eq(WB.grantLoot({ pos: { x: 0, z: 0 }, cfg: {} }), null, '没有 wbId 的实体不发奖');
  eq(WB.grantLoot(null), null, '传 null 不发奖也不抛');
  const ghost = { wb: true, wbId: 'nope', cfg: {}, pos: { x: 0, z: 0 } };
  eq(WB.grantLoot(ghost), null, 'wbId 不存在（cfg 取不到 loot）不发奖');

  /* spawnLoot 不在时静默返回 —— 世界 Boss 可能在别的系统里被造出来 */
  const keep = ctx.Game.spawnLoot;
  ctx.Game.spawnLoot = null;
  reset();
  eq(WB.grantLoot(mk('xingtian')), null, '没有 spawnLoot 时返回 null 而不是抛异常');
  ctx.Game.spawnLoot = keep;
}

/* ============================================================
 * 六、接线：onKill 真的会发奖
 * ============================================================ */
head('六、接线（onKill → grantLoot）');
{
  reset();
  const e = mk('kunpeng');
  /* onKill 会走 dropAura / _domainClear，给个最小 state */
  game.state.worldBoss = { id: 'kunpeng', mapId: 'mirrorrealm', spawnAt: 1, until: 2, killed: false, killAt: 0, x: 0, z: 0 };
  WB.onKill(e);
  ok(drops.length > 0, 'onKill 之后地上有战利品（onKill 调了 grantLoot）');
  ok(drops.some(d => d.item && d.item.rarity === 'unique'), 'onKill 至少发了一件传世');
  ok(logs.some(l => l.t.indexOf('遗落') >= 0), '聊天框有一条「遗落：…」汇总', logs.map(l => l.t).slice(-3));
  ok(fx.flashes.length > 0, '掉落时有一个闪光提示');

  /* 击杀记账与掉落互不影响 */
  const rec = game.state.worldBoss;
  ok(rec.killed === true, 'onKill 仍然记了 killed');
  ok(rec.until > Date.now(), 'onKill 仍然把 until 推到下一个周期之后');

  const src = fs.readFileSync(path.join(ROOT, 'src/worldboss.js'), 'utf8');
  ok(/grantLoot\(e\)/.test(src), 'onKill 里有 grantLoot(e) 调用');
  ok(/wbLooted/.test(src), 'grantLoot 有 wbLooted 幂等记账');
  ok(/rarity: 'unique'/.test(src), '传世用 rarity 指定而不是 pool（pool 挡不住法器/命格那两掷）');
  ok(/e\.cfg\.body\.radius|cfg\.body\.radius/.test(src), '_lootAnchor 读了 body.radius（掉落推出模型边缘）');

  const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  ok(/WorldBoss\.onKill\(e\)/.test(gsrc), 'game.js 击杀链路仍然转发 WorldBoss.onKill');
}

/* ============================================================
 * 收尾
 * ============================================================ */
console.log('\n' + '='.repeat(56));
if (fail) {
  console.log(`失败 ${fail} 项：`);
  for (const b of bad) console.log('  ✗ ' + b.msg + (b.detail !== undefined ? '  → ' + JSON.stringify(b.detail) : ''));
}
console.log(`世界 Boss 掉落（M18.8）：通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
