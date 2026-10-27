/* ============================================================
 * dev/dungeon-sim.js —— 地下城（地脉裂隙）整局推演 · 无浏览器
 *
 * 计划书 §2 第 10 项点名要一个「不开浏览器也能跑完一局」的验证脚本。
 * 为什么必须要有它：
 *   地下城的核心逻辑（钥匙扣减 / 开门阈值 / 首领血量反解 / 通关结算 / 死亡退出）
 *   全都发生在**状态机里**，而状态机最怕的错是「打得通但数不对」——
 *   这种错在真机上要打满 20 只怪才看得见，改一次数值就要重打一遍。
 *   所以这里用假的 Game / UI 把整条流程跑穿，把每一步的数字钉住。
 *
 * 覆盖：
 *   A 进门：扣钥匙 / 建图 / 首层总数与开门阈值
 *   B 层间：清怪 → 开门 → 地脉门 → 下一层（含「门没开不能走」）
 *   C 首领：血量 = 同阶小怪均血 × 14、伤害 = 均攻 × 3.2、2 名精英护卫
 *   D 结算：图鉴记一条 / 保底装备 / 玄晶 / 金币 / 回营地
 *   E 失败：死亡不换图只记账、复活回本卷营地、进度清空
 *   F 存档兜底：dgn_* 的 mapId 读档要回营地（game.js loadSlot 的契约）
 *
 * 用法：node dev/dungeon-sim.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./_load');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
};
const eq = (label, got, want) => ok(label, got === want, { got, want });
const section = t => console.log('\n' + t);

/* ---------------- 数据层（真文件） ---------------- */
const mem = new Map();
const localStorage = {
  get length() { return mem.size; },
  key(i) { return Array.from(mem.keys())[i] ?? null; },
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
};
const win = {
  addEventListener() { }, removeEventListener() { }, localStorage,
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0 }
};
/* 日志收集：状态机的每一步都靠 UI.log / UI.toast 告诉玩家，这里全接住 */
const logs = [], toasts = [], dialogs = [];
const sandbox = {
  console, window: win,
  document: { addEventListener() { }, getElementById: () => null },
  localStorage, navigator: win.navigator,
  Math, JSON, Date, Number, String, Array, Object, Set, Map, Promise,
  isFinite, parseInt, parseFloat, setTimeout: fn => fn(), clearTimeout,
  /* ---- 假 UI / 音效：只要不抛就行，内容进数组备查 ---- */
  UI: {
    log: (t, c) => logs.push([c || '', t]),
    toast: (t, c) => toasts.push([c || '', t]),
    showDialog: (title, text, btns) => dialogs.push({ title, text, btns }),
    closeAll: () => { },
    showDeath: t => logs.push(['dead', t])
  },
  SFX: { pickup() { }, boss() { } },
  FX: { ring() { } }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const SAFE = f => f.startsWith('src/data/') || f === 'src/items.js'
  || f === 'src/core/store.js' || f === 'src/core/save.js';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [];
{
  const re = /<script\s+src="(src\/[^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) if (SAFE(m[1])) files.push(m[1]);
}
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
/* 运行时：dungeon.js 依赖 Game，先建假 Game 再装它 */
const GAME_STUB = `
globalThis.__sim = {
  KEY_TIERS, DUNGEON_LAYERS, DUNGEON_TYPES, MONSTERS, MAPS, MAP_ZONES,
  BALANCE, PARTS, campMapOfPart, zoneSpawnTotal, zoneSpawners, mapZones,
  keyTierDef, dungeonTypeById, dungeonMobLevel, rollDungeonAffixes, dungeonCodexId,
  DUNGEON_CODEX
};
`;
vm.runInContext(GAME_STUB, sandbox);
const S = sandbox.__sim;

/* ---------------- 假 Game ---------------- */
/* 只实现 dungeon.js 真正碰到的那些方法，其余一律不写 —— 多了会掩盖真实依赖。 */
const state = {
  cls: 'warrior', name: '推演客', level: 36, part: 3, mapId: 'campC',
  hp: 3000, mp: 200, maxInv: 40,
  inventory: [], stash: { mats: {} }, gold: 1000,
  keys: [0, 0, 1, 0, 0],
  dungeon: { cleared: {}, runs: 0, wins: 0 },
  stats: { magicFind: 0 },
  equipment: {}
};
const Game = {
  state, enemies: [], dead: false, saves: 0,
  playerGroup: { position: { x: 0, z: 0, set(x, y, z) { this.x = x; this.z = z; } } },
  /* loadMap：把这张图的怪真刷出来（数量走 zone 分配，和线上同一个口径） */
  loadMap(id) {
    this.state.mapId = id;
    this.enemies = [];
    const n = S.zoneSpawnTotal(id);
    const kinds = (S.MAPS[id] && S.MAPS[id].spawns) || ['wolf'];
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length];
      this.spawnEnemy(kind, i, 0, !!(S.MONSTERS[kind] && S.MONSTERS[kind].xp > 60), S.MAPS[id].level);
    }
  },
  spawnEnemy(kind, x, z, elite, lv, bossId) {
    const m = S.MONSTERS[kind] || { hp: 100, atk: 10 };
    const MB = S.BALANCE.mob, BB = S.BALANCE.boss;
    const isBoss = !!bossId;
    const hpBase = isBoss ? 2000 : m.hp;
    const maxHp = Math.round(hpBase * (MB.hpBase + lv * MB.hpLv + lv * lv * MB.hpLv2)
      * (isBoss ? BB.hpMul : 1) * (elite ? 1.6 : 1));
    const e = {
      kind, elite: !!elite, boss: isBoss, dead: false,
      maxHp, hp: maxHp,
      dmg: (m.atk || 10) * (1 + lv * MB.dmgLv) * (isBoss ? BB.dmgMul : 1),
      spd: m.spd || 3, atkCd: m.atkCd || 2, cfg: isBoss ? cfgOf(bossId) : m
    };
    this.enemies.push(e);
    return e;
  },
  addItem(it) { this.state.inventory.push(it); return true; },
  recalc() { this.recalcs = (this.recalcs || 0) + 1; },
  save() { this.saves++; }
};
function cfgOf(id) { return S.MAPS.__bossCfg && S.MAPS.__bossCfg[id] ? S.MAPS.__bossCfg[id] : { id, name: id }; }
/* BOSSES 通过闭包取一次，给假 spawnEnemy 的 cfg 用 */
sandbox.Game = Game;
vm.runInContext('globalThis.__sim.BOSSES = BOSSES;', sandbox);
S.MAPS.__bossCfg = sandbox.__sim.BOSSES;

vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/dungeon.js'), 'utf8'), sandbox, { filename: 'src/dungeon.js' });
const Dungeon = vm.runInContext('Dungeon', sandbox);

console.log('=== 地下城推演 · 玩家 lv36 / 卷三 / 手里 1 把玄铁钥（三阶）===');

/* ============================================================ */
section('A 进门');
const tier = 3;
const kt = S.keyTierDef(tier);
eq('起始钥匙 1 把', Dungeon.keyCount(tier), 1);
const affixes = S.rollDungeonAffixes(tier, kt.affixN);
eq('三阶抽 2 条词缀', affixes.length, 2);
const entered = Dungeon.enter('tomb', tier, affixes);
ok('进门成功', entered === true);
eq('钥匙已扣（1 → 0）', Dungeon.keyCount(tier), 0);
eq('进入第 1 层', Dungeon.run.layer, 1);
eq('图 id 是运行时注册的 dgn_tomb_1', state.mapId, 'dgn_tomb_1');
ok('图已注册进 MAPS 且标了 dungeon', !!(S.MAPS['dgn_tomb_1'] && S.MAPS['dgn_tomb_1'].dungeon === true));
ok('区域骨架已展开进 MAP_ZONES', !!(S.MAP_ZONES['dgn_tomb_1'] && S.MAP_ZONES['dgn_tomb_1'].zones.length));
eq('第 1 层刷怪总数 = 20（不走 suggestSpawnTotal）', S.zoneSpawnTotal('dgn_tomb_1'), 20);
eq('run.total 与区域分配一致', Dungeon.run.total, 20);
const p1 = Dungeon.progress();
eq('开门阈值 70%', p1.need, 0.70);
eq('开局门是关的', p1.open, false);
ok('怪物等级 = 玩家 +2', Dungeon.run.lv === 38, Dungeon.run.lv);
ok('地图等级也同步', S.MAPS['dgn_tomb_1'].level === 38, S.MAPS['dgn_tomb_1'].level);

section('B 清怪 → 开门 → 下一层');
/* 清到 13 只（65%）门还不开 */
for (let i = 0; i < 13; i++) { Game.enemies.pop(); Dungeon.onKill({}); }
eq('清 13/20 → 65%', Dungeon.progress().kills, 13);
eq('门仍关着', Dungeon.progress().open, false);
Dungeon.usePortal();
eq('门没开时走地脉门不换层', Dungeon.run.layer, 1);
const beforeLayer2 = Game.enemies.length;
Game.enemies.pop(); Dungeon.onKill({});
eq('清到 14/20 → 70%', Dungeon.progress().kills, 14);
eq('门开了', Dungeon.progress().open, true);
Dungeon.usePortal();
eq('走到第 2 层', Dungeon.run.layer, 2);
eq('第 2 层图 id', state.mapId, 'dgn_tomb_2');
eq('第 2 层刷怪 18 只', S.zoneSpawnTotal('dgn_tomb_2'), 18);
eq('第 2 层 kill 计数已归零', Dungeon.run.kills, 0);
eq('第 2 层阈值 80%', Dungeon.progress().need, 0.80);
/* 「回响」词缀会按 ×2.5 的口径额外补精英（Dungeon.applyMobAffixes），
 * 所以实际数量可能是 18，也可能是 20（+2）。写死 18 会 20% 概率假红 ——
 * 这里钉的是「换层一定重刷」而不是「恰好 18 只」：
 * 只要落回 [18, 18 + ceil(18×0.1)] 就说明旧的怪被清干净了。 */
eq('第 2 层基础刷怪数 = 18', S.zoneSpawnTotal('dgn_tomb_2'), 18);
ok('换层会重刷怪（数量回到 18~20）',
  Game.enemies.length >= 18 && Game.enemies.length <= 20, Game.enemies.length);
for (let i = 0; i < 15; i++) { Game.enemies.pop(); Dungeon.onKill({}); }
eq('清 15/18 → 83% → 门开', Dungeon.progress().open, true);
Dungeon.usePortal();
eq('走到第 3 层（首领场）', Dungeon.run.layer, 3);
eq('首领场图 id', state.mapId, 'dgn_tomb_3');
eq('首领场 run.total 记 1', Dungeon.run.total, 1);

section('C 首领：以同阶小怪为锚');
/* 独立重算一遍均血，验证 dungeon.js 的 spawnBoss 不是随手写的数 */
const MB = S.BALANCE.mob;
let hpSum = 0, atkSum = 0, n = 0;
for (const k of S.dungeonTypeById('tomb').kinds) {
  const m = S.MONSTERS[k];
  hpSum += m.hp * (MB.hpBase + Dungeon.run.lv * MB.hpLv + Dungeon.run.lv * Dungeon.run.lv * MB.hpLv2);
  atkSum += (m.atk || 10) * (1 + Dungeon.run.lv * (MB.dmgLv || 0.12));
  n++;
}
const avgHp = hpSum / n, avgAtk = atkSum / n;
const boss = Game.enemies.find(e => e.boss);
ok('首领已生成', !!boss, Game.enemies.map(e => e.boss));
/* 词缀「贪狼」会再乘一次血量，所以要按 affixMob('hpMul') 校正期望值 */
const hpMul = Dungeon.affixMob('hpMul');
eq('首领血量 = 均血 × 14 × 词缀血量系数', boss.maxHp, Math.round(Math.round(avgHp * 14) * hpMul));
eq('首领伤害 = 均攻 × 3.2', Math.round(boss.dmg * 100) / 100, Math.round(avgAtk * 3.2 * 100) / 100);
ok('首领血量远高于同阶小怪（不是 4.5 倍那一档）',
  boss.maxHp > avgHp * 10, { boss: boss.maxHp, avg: Math.round(avgHp) });
eq('首领场没有杂兵（spawnTotal 0 不被当成没传）', S.zoneSpawnTotal('dgn_tomb_3'), 0);
eq('2 名精英护卫（不多不少）', Game.enemies.filter(e => e.elite && !e.boss).length, 2);
eq('首领场总共 3 个活物', Game.enemies.length, 3);

section('D 结算');
const invBefore = state.inventory.length;
const goldBefore = state.gold;
const cryBefore = state.stash.mats.crystal || 0;
const runsBefore = state.dungeon.runs;
Dungeon.onBossDown();
ok('首领倒下后 run 已清空', Dungeon.run === null);
eq('runs 在 enter 时就 +1（finish 不再加）', state.dungeon.runs, runsBefore);
eq('wins +1', state.dungeon.wins, 1);
ok('图鉴记了一条 tomb3', state.dungeon.cleared['tomb3'] === true, state.dungeon.cleared);
ok('进了装备（≥2 件）', state.inventory.length - invBefore >= 2, state.inventory.length - invBefore);
ok('进了玄晶', (state.stash.mats.crystal || 0) > cryBefore, state.stash.mats.crystal);
ok('进了金币', state.gold > goldBefore, state.gold - goldBefore);
eq('通关送回本卷营地（卷三 = campC）', state.mapId, 'campC');
ok('弹了结算面板', dialogs.length > 0 && /通关/.test(dialogs[dialogs.length - 1].title),
  dialogs.length ? dialogs[dialogs.length - 1].title : null);
ok('结算里写了产出数量', /产出：装备/.test(dialogs[dialogs.length - 1].text));
ok('落盘一次', Game.saves >= 1, Game.saves);

section('E 失败路径：死亡不换图、复活回营地');
state.keys = [0, 0, 1, 0, 0];
Dungeon.enter('den', 3, []);
eq('第二次进门扣钥匙', Dungeon.keyCount(3), 0);
const dieMap = state.mapId;
Dungeon.onPlayerDeath();
ok('死亡只记账，不换图（换图会卡镜头）', state.mapId === dieMap, state.mapId);
ok('run 还在（清理留给 onRespawn）', Dungeon.run !== null);
const backTo = Dungeon.onRespawn();
eq('复活回本卷营地', backTo, 'campC');
ok('run 已清空', Dungeon.run === null);
eq('失败不加 wins', state.dungeon.wins, 1);
eq('失败不计图鉴', state.dungeon.cleared['den3'], undefined);
eq('钥匙没返还（lose 也是 0）', Dungeon.keyCount(3), 0);

section('F 读档兜底（game.js loadSlot 的 dgn_ 契约）');
/* 直接跑 game.js 太重（要 THREE），这里只验「前缀判定 + 目标图存在」这段逻辑，
 * 与 game.js 里那段保持同一写法。 */
const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
ok('loadSlot 里有 dgn_ 前缀判定', /indexOf\('dgn_'\) === 0/.test(gsrc));
ok('dgn_ 判定在「未知图 → 村」之前',
  gsrc.indexOf("indexOf('dgn_')") < gsrc.indexOf("this.state.mapId === 'trial' || !MAPS[this.state.mapId]"));
ok('兜底目标是 campMapOfPart（不是写死 village）', /campMapOfPart\(this\.state\.part\)/.test(gsrc));
ok('campMapOfPart 对 5 个卷都有营地', [1, 2, 3, 4, 5].every(p => !!S.MAPS[S.campMapOfPart(p)]),
  [1, 2, 3, 4, 5].map(p => S.campMapOfPart(p)));

console.log('\n--- 关键日志（前 8 条）---');
for (const [c, t] of logs.slice(0, 8)) console.log('  [' + c + '] ' + t);
console.log('--- 提示（前 6 条）---');
for (const [c, t] of toasts.slice(0, 6)) console.log('  [' + c + '] ' + t);

console.log(fail ? `\n❌ ${fail} 项失败（${pass} 通过）` : `\n✅ 整局推演通过（${pass} 项）`);
process.exit(fail ? 1 : 0);
