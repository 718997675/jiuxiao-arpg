/* ============================================================
 * dev/worldboss-run.js —— M18.2「世界 Boss 运行时」专项体检（离线，node 直跑）
 *
 * 这个脚本存在的唯一理由：**30 分钟的轮转在浏览器里没法测**。
 * 手动等半小时、还要卡在「正好到点」那一秒，一次就够累了，
 * 而这条状态机一旦写错（比如累加 dt 而不是比时间戳），
 * 表现是「切后台回来时间不对」—— 没有玩家会给你复现步骤。
 *
 * 所以这里把 `Date.now()` 打桩成可控时钟，把 6 小时压缩成毫秒级：
 *
 *   · 到点换人：30:00 还是同一只，30:01 换了一只，且**绝不连续两次同一只**
 *   · 无人击杀 = 立刻换（不空窗）；被击杀 = 冷却满一个周期再换
 *   · 跨会话：把 state.worldBoss 序列化成 JSON 再读回来，until 必须原样
 *   · 存档往返：SaveManager.pack → normalizeDoc → unpack 之后记录不变
 *   · 等级门禁：39 级不刷，40 级立刻刷
 *   · 脏档：id 不存在 / 时间戳是秒级 / until < spawnAt → 一律重新 roll
 *
 * 用法：node dev/worldboss-run.js
 * ============================================================ */
const { loadData, ROOT } = require('./_load.js');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

/* ---------------- 可控时钟 ----------------
 * 必须**在**加载 worldboss.js 之前把 Date 换掉：
 * worldboss.js 里所有时间判断都是 `Date.now()`，
 * 换掉之后 `ensure / tick / remaining` 全部跟着走。 */
let CLOCK = Date.UTC(2026, 9, 28, 12, 0, 0);
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(CLOCK); }
  static now() { return CLOCK; }
}

/* ---------------- 假的 Game / UI ---------------- */
const spawned = [];
function makeGame() {
  return {
    state: {
      level: 60, mapId: 'village', mapsSeen: ['village'], worldBoss: null
    },
    enemies: [],
    scene: null,
    boss: null,
    spawnEnemy(kind, x, z, elite, lv, bossId) {
      const e = {
        id: 'e' + spawned.length, kind: bossId || kind, boss: !!bossId,
        x, z, lv, elite: !!elite, dead: false, pos: { x, z }
      };
      spawned.push(e);
      this.enemies.push(e);
      return e;
    }
  };
}
const logs = [];
const UI = {
  log(t) { logs.push(t); },
  toast() {}, updateBoss() {},
  renderWorldBoss() {}, showWorldBossBanner() {}
};

const ctx = loadData({
  console, Math, Set, Map, JSON,
  Date: FakeDate,
  localStorage: { getItem() { return null; }, setItem() {} }
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worldboss.js'), 'utf8'), ctx,
  { filename: 'src/worldboss.js' });
ctx.Game = makeGame();
ctx.UI = UI;
ctx.SFX = { boss() {}, levelup() {} };

const WB = vm.runInContext('WorldBoss', ctx);
const CFG = vm.runInContext('WORLD_BOSS_CFG', ctx);
const ORDER = vm.runInContext('WORLD_BOSS_ORDER', ctx);
const MAPS = vm.runInContext('MAPS', ctx);
const WBD = vm.runInContext('WORLD_BOSSES', ctx);
const SaveManager = vm.runInContext('SaveManager', ctx);

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; return true; }
  fail++;
  console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  return false;
};
const eq = (msg, a, b) => ok(a === b, msg, { got: a, want: b });
const head = (t) => console.log('\n=== ' + t + ' ===');
const MIN = 60 * 1000;

/* 把时钟推进 n 毫秒，并跑一次心跳（tick 内部 1 秒节流，喂 1.1 秒保证触发） */
function advance(ms) {
  CLOCK += ms;
  WB.tick(1.1);
}

/* ============================================================ */
head('一、首次 ensure：滚一只出来');
/* 玩家在桃源村（安全区），没有记录 */
let r = WB.ensure();
ok(!!r, 'ensure() 建出了一条记录');
eq('周期 = 30 分钟真实时间', CFG.cycle, 30 * 60 * 1000);
eq('until = spawnAt + cycle', r.until - r.spawnAt, CFG.cycle);
eq('新记录 killed = false', r.killed, false);
ok(ORDER.indexOf(r.id) >= 0, 'id 在 WORLD_BOSS_ORDER 里', r.id);
ok((WBD[r.id].homeMaps || []).indexOf(r.mapId) >= 0,
  '刷在它自己的主题图里（不是全世界随机）', { id: r.id, map: r.mapId });
ok(!!MAPS[r.mapId], '落点图存在于 MAPS', r.mapId);
ok(!MAPS[r.mapId].safe, '不会刷在安全区', r.mapId);
eq('落点坐标是数字', typeof r.x + '/' + typeof r.z, 'number/number');

head('一·b、不在它的图上时，场上不该有实体');
eq('玩家在 village，boss 在别处 → 不刷', WB.sync(), null);
eq('enemies 里没有世界 Boss', ctx.Game.enemies.filter(e => e.wb).length, 0);

head('一·c、走到它的图上 → 刷出来，且只刷一只');
const home = r.mapId;
ctx.Game.state.mapId = home;
WB.onMapEnter();
eq('进图后场上有 1 只', ctx.Game.enemies.filter(e => e.wb && !e.dead).length, 1);
const first = ctx.Game.enemies.find(e => e.wb);
ok(!!first, '实体打了 e.wb 标记（清场靠它区分常驻首领）');
eq('实体 id 与记录一致', first.wbId, r.id);
eq('实体按首领处理（boss = true）', first.boss, true);
eq('等级用 WORLD_BOSS_CFG.level（不跟地图走）', first.lv, CFG.level);
eq('重复 sync 不会刷第二只', (WB.sync(), ctx.Game.enemies.filter(e => e.wb).length), 1);

/* ============================================================ */
head('二、到点换人（无人击杀 → 立刻换，不空窗）');
const idA = r.id, spawnA = r.spawnAt;
advance(29 * MIN);
eq('29 分钟时还是同一只', WB.rec().id, idA);
eq('29 分钟时实体还在', ctx.Game.enemies.filter(e => e.wb).length, 1);
advance(2 * MIN);                     // 越过 30:00
const r2 = WB.rec();
ok(r2.spawnAt !== spawnA, '30 分钟到点换了记录', { old: spawnA, now: r2.spawnAt });
ok(r2.id !== idA, '换的不是同一只（连续两次同一只 = 玩家以为没刷新）',
  { old: idA, now: r2.id });
eq('新记录 killed = false（不是「死了等复活」）', r2.killed, false);
eq('到点当下 until 已重算', r2.until - r2.spawnAt, CFG.cycle);

head('二·b、换人后场上实体也跟着换（不会留下上一只的壳）');
/* 新 boss 可能刷在别的图 —— 玩家跟着走一遍，两边的实体数都要对 */
ctx.Game.state.mapId = r2.mapId;
WB.onMapEnter();
const live = ctx.Game.enemies.filter(e => e.wb && !e.dead);
eq('跟着换图后场上仍然只有 1 只', live.length, 1);
eq('场上这只就是记录里那只', live[0] && live[0].wbId, r2.id);

/* ============================================================ */
head('三、连滚 60 次：顺序与去重');
let sameInRow = 0, seenAll = {};
for (let i = 0; i < 60; i++) {
  const prev = WB.rec().id;
  advance(31 * MIN);
  const now = WB.rec();
  if (now.id === prev) sameInRow++;
  seenAll[now.id] = (seenAll[now.id] || 0) + 1;
}
eq('60 次轮转里没有一次「连续两只同一只」', sameInRow, 0);
eq('6 只都被抽到过', Object.keys(seenAll).length, 6);
const total = Object.values(seenAll).reduce((a, b) => a + b, 0);
eq('60 次分配总数正确', total, 60);
console.log('  分布：' + ORDER.map(id => id + ' ' + (seenAll[id] || 0)).join(' · '));

/* ============================================================ */
head('四、击杀 → 冷却一个周期 → 下一只');
const rk = WB.rec();
ctx.Game.state.mapId = rk.mapId;
WB.onMapEnter();
const target = ctx.Game.enemies.find(e => e.wb);
ok(!!target, '击杀前场上有一只');
WB.onKill(target);
const afterKill = WB.rec();
eq('记录标记 killed', afterKill.killed, true);
eq('冷却 = 一个完整周期（从击杀时刻算）', afterKill.until - afterKill.killAt, CFG.cycle);
eq('击杀时间戳 = 当前时钟', afterKill.killAt, CLOCK);
eq('击杀后立刻 sync 不会重生', (WB.sync(), ctx.Game.enemies.filter(e => e.wb).length), 0);
advance(29 * MIN);
eq('29 分钟后仍然没有', (WB.sync(), ctx.Game.enemies.filter(e => e.wb).length), 0);
eq('29 分钟后记录仍是 killed', WB.rec().killed, true);
advance(2 * MIN);
eq('冷却满 → 换下一只', WB.rec().killed, false);
ok(WB.rec().id !== afterKill.id, '换的不是刚杀的那只');
ctx.Game.state.mapId = WB.rec().mapId;
WB.onMapEnter();
eq('冷却满后场上重新有 1 只', ctx.Game.enemies.filter(e => e.wb).length, 1);

/* ============================================================ */
head('五、跨会话：序列化 → 反序列化 → until 不变');
const before = JSON.parse(JSON.stringify(WB.rec()));
const json = JSON.stringify(before);
const fresh = makeGame();
fresh.state = {
  level: 60, mapId: before.mapId, mapsSeen: ['village'], worldBoss: JSON.parse(json)
};
ctx.Game = fresh;
const r3 = WB.ensure();
eq('读回来的 id 不变', r3.id, before.id);
eq('读回来的 until 不变', r3.until, before.until);
eq('读回来的坐标不变', r3.x + ',' + r3.z, before.x + ',' + before.z);
const left1 = WB.remaining();
CLOCK += 5 * MIN;
eq('过了 5 分钟，剩余时间正好少 5 分钟', left1 - WB.remaining(), 5 * MIN);

/* ============================================================ */
head('六、等级门禁（minLevel = 40）');
const low = makeGame();
low.state = { level: 39, mapId: 'village', mapsSeen: ['village'], worldBoss: null };
ctx.Game = low;
eq('39 级 ensure() 返回 null', WB.ensure(), null);
eq('39 级不会留下记录', low.state.worldBoss, null);
WB.tick(1.1);
eq('39 级心跳不会刷出来', low.enemies.length, 0);
low.state.level = 40;
const r4 = WB.ensure();
ok(!!r4, '40 级立刻有得打（升级那一刻正好看见横幅）');
eq('门槛就是 40', CFG.minLevel, 40);

head('六·b、已经有记录时降到 40 级以下 → 记录清掉');
low.state.level = 39;
WB.tick(1.1);
eq('低等级不该带着一只 60 级 Boss 的坐标', low.state.worldBoss, null);

/* ============================================================ */
head('七、脏档兜底（手改 / 版本回退 / 秒级时间戳）');
const dirty = [
  { id: 'nope_not_a_boss', mapId: 'village', x: 0, z: 0, spawnAt: 1.7e12, until: 1.8e12 },
  { id: 'zhulong', mapId: 'no_such_map', x: 0, z: 0, spawnAt: 1.7e12, until: 1.8e12 },
  { id: 'zhulong', mapId: 'nineapex', x: NaN, z: 0, spawnAt: 1.7e12, until: 1.8e12 },
  { id: 'zhulong', mapId: 'nineapex', x: 0, z: 0, spawnAt: 'oops', until: 1.8e12 },
  /* 秒级时间戳：少三位，最常见的手改错误 */
  { id: 'zhulong', mapId: 'nineapex', x: 0, z: 0, spawnAt: 1761000000, until: 1761001800 }
];
for (const d of dirty) {
  const g = makeGame();
  g.state = { level: 60, mapId: 'village', mapsSeen: ['village'], worldBoss: d };
  ctx.Game = g;
  const rr = WB.ensure();
  ok(!!rr, '脏档「' + JSON.stringify(d).slice(0, 46) + '…」被替换成一条合法记录');
  if (rr) ok(WB._valid(rr), '替换后的记录通过 _valid');
}

/* ============================================================ */
head('八、存档往返（pack → normalizeDoc → unpack）');
const g8 = makeGame();
const rec8 = {
  id: 'xiangliu', mapId: 'yellowferry', x: 12.5, z: -33,
  spawnAt: 1761000000000, until: 1761001800000, killed: false, killAt: 0
};
g8.state = {
  cls: 'warrior', name: '测试', level: 60, xp: 0, xpNext: 1, gold: 0,
  potions: { hp: 3, mp: 3 }, hp: 100, mp: 50, equipment: {}, inventory: [],
  maxInv: 40, bossKilled: {}, playTime: 10, quests: { active: [], done: [], next: null, announced: {}, board: { cd: {}, count: {} } },
  mapId: 'yellowferry', playerPos: { x: 0, z: 6 }, part: 2, act: '2-1',
  camps: ['campA', 'campB'], portals: ['portalA', 'portalB'], mapsSeen: ['village', 'yellowferry'],
  stash: { items: [], mats: {} }, codex: {}, talents: {}, talentBonus: 0,
  attrAlloc: {}, trial: {}, keys: [0, 0, 0, 0, 0], dungeon: {}, skills: {},
  skillbar: [], skillbar2: [], barSet: 0, mount: null, settings: {},
  worldBoss: rec8
};
const packed = SaveManager.pack(g8.state, 1);
ok(!!packed.world, 'pack 出了 world 段');
ok(!!packed.world.worldBoss, 'world 段里带上了 worldBoss');
const norm = SaveManager.normalizeDoc(packed, 1).doc;
ok(!!norm.world.worldBoss, 'normalizeDoc 之后 worldBoss 还在');
eq('normalizeDoc 之后 id 不变', norm.world.worldBoss.id, 'xiangliu');
eq('normalizeDoc 之后 until 不变', norm.world.worldBoss.until, rec8.until);
const flat = SaveManager.unpack(norm);
eq('unpack 回到扁平 state 之后 id 不变', flat.worldBoss.id, 'xiangliu');
eq('unpack 之后坐标不变', flat.worldBoss.x + ',' + flat.worldBoss.z, '12.5,-33');

head('八·b、老档（没有 worldBoss 字段）补 null，不写迁移函数');
const oldDoc = JSON.parse(JSON.stringify(packed));
delete oldDoc.world.worldBoss;
const normOld = SaveManager.normalizeDoc(oldDoc, 1).doc;
eq('老档 normalizeDoc 补成 null', normOld.world.worldBoss, null);
const gOld = makeGame();
gOld.state = SaveManager.unpack(normOld);
ctx.Game = gOld;
ok(!!WB.ensure(), '老档第一次 ensure 自己滚一只（和新档同一条路径）');

head('八·c、秒级时间戳在存档层就被拦掉');
const bad = JSON.parse(JSON.stringify(packed));
bad.world.worldBoss.spawnAt = 1761000000;
bad.world.worldBoss.until = 1761001800;
eq('秒级时间戳 → 收敛成 null', SaveManager.normalizeDoc(bad, 1).doc.world.worldBoss, null);

/* ============================================================ */
head('九、查询接口（UI 只认这几个）');
const g9 = makeGame();
ctx.Game = g9;
WB._seenSpawnAt = 0;
const r9 = WB.ensure();
ok(!!r9, '有记录');
ok(WB.alive(), '未击杀 → alive() 为 true');
ok(/^\d+:\d\d$/.test(WB.timeText()), 'timeText 是 mm:ss 形状', WB.timeText());
ok(WB.statusText().indexOf(WBD[r9.id].name) >= 0, 'statusText 里有 boss 名', WB.statusText());
ok(WB.statusText().indexOf(WB.timeText()) >= 0, 'statusText 里的倒计时与 timeText 同一份');
eq('cur() 取到配置', WB.cur().id, r9.id);
WB.onKill({ wb: true, wbId: r9.id });
eq('击杀后 alive() 为 false', WB.alive(), false);
ok(WB.statusText().indexOf('后再现') >= 0, '击杀后文案变成「后再现」', WB.statusText());

/* ============================================================ */
console.log('\n' + '='.repeat(56));
console.log('世界 Boss 运行时：' + ORDER.length + ' 只 · 周期 ' + (CFG.cycle / MIN) + ' 分钟 · 门槛 ' + CFG.minLevel + ' 级');
console.log('通过 ' + pass + ' 项' + (fail ? '，失败 ' + fail + ' 项' : '，失败 0 项'));
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
