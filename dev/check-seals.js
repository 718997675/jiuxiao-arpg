/* ============================================================
 * dev/check-seals.js —— M7.4「魔将之印」专项体检（离线，node 直跑）
 *
 * 为什么单独有一个脚本：
 *   印是**终章唯一的钥匙** —— 8 枚齐才开天龙终门（`finalGate.sealNeed = 8`）。
 *   一旦「打了魔将不掉印」，玩家会卡在 5-2 枢纽，看到
 *   「天龙终门未开：魔将之印 0 / 8」而永远拿不到印 ——
 *   这在浏览器里表现为「游戏到此为止」，是最难接受的一类 bug。
 *   所以这里把「打 → 掉 → 存 → 数 → 开门」整条链全验一遍。
 *
 * 三段：
 *   A. 数据对得上：BAFO_SEALS ↔ BOSSES ↔ MAPS ↔ 终门门槛
 *   B. 行为：真装载 src/game.js，调 onBossKill，看印 / 播报 / 存档次数
 *   C. 存档：normalizeDoc 夹脏值、导出白名单、兜底新档
 *
 * 用法：node dev/check-seals.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const eq = (a, b, msg) => ok(a === b, msg, { got: a, want: b });
const head = (t) => console.log('\n— ' + t + ' —');

/* ============================================================
 * A. 数据层
 * ============================================================ */
const dctx = loadData({ console, localStorage: { getItem() { return null; }, setItem() {} } });
const g = (n) => vm.runInContext(n, dctx);

const BAFO_SEALS = g('BAFO_SEALS');
const BOSSES = g('BOSSES');
const MAPS = g('MAPS');

head('一、八印表本身');
eq(BAFO_SEALS.length, 8, 'BAFO_SEALS 恰好 8 枚');
eq(new Set(BAFO_SEALS.map(s => s.key)).size, 8, '8 个 key 互不相同');
eq(new Set(BAFO_SEALS.map(s => s.name)).size, 8, '8 个名字互不相同');
eq(new Set(BAFO_SEALS.map(s => s.boss)).size, 8, '8 只魔将 id 互不相同');
for (const s of BAFO_SEALS) {
  ok(typeof s.color === 'number' && s.color > 0, s.key + ' 有颜色（播报光圈用）', s.color);
  ok(/之印$/.test(s.name), s.key + ' 名字以「之印」结尾', s.name);
}

head('二、印 → 魔将 → 地图 三者对齐');
for (const s of BAFO_SEALS) {
  const b = BOSSES[s.boss];
  ok(!!b, 'BOSSES 里有 ' + s.boss);
  ok(!!MAPS[s.map], 'MAPS 里有 ' + s.map);
  if (MAPS[s.map]) {
    ok((MAPS[s.map].bosses || []).indexOf(s.boss) >= 0,
      s.map + ' 的首领列表含 ' + s.boss, MAPS[s.map].bosses);
  }
}

head('三、终门门槛');
const hub = MAPS.chaossea;
ok(!!hub && !!hub.finalGate, 'chaossea 有 finalGate');
if (hub && hub.finalGate) {
  /* 门槛必须正好等于印数 —— 写死 7 或 9 都会造成「齐了不开 / 少了也能进」 */
  eq(hub.finalGate.sealNeed, BAFO_SEALS.length, 'finalGate.sealNeed === 印数');
  eq(hub.finalGate.sealNeed, 8, 'finalGate.sealNeed === 8');
}
/* 八扇门与八印同序同 key */
if (hub && hub.gates) {
  eq(hub.gates.length, 8, 'chaossea 有 8 扇门');
  const same = hub.gates.every((gt, i) => gt.seal === BAFO_SEALS[i].key && gt.map === BAFO_SEALS[i].map);
  ok(same, '门的 seal/map 与 BAFO_SEALS 逐条同序', hub.gates.map(x => x.seal));
}

/* ============================================================
 * B. 行为：装载 src/game.js，真调 onBossKill
 * ============================================================ */
head('四、装载 game.js（THREE / DOM 打桩）');

/* 只做「够用」的桩：Vector3 真实现（要读 x/z），其余一律吞掉 */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
}
const swallow = () => new Proxy(function () { }, {
  get: (t, k) => (k === 'Vector3' ? V3 : k === Symbol.toPrimitive ? (() => 0) : swallow()),
  apply: () => swallow(),
  construct: () => swallow()
});
const noop = () => { };
const fakeEl = { style: {}, appendChild: noop, removeChild: noop, remove: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }), children: [], textContent: '', innerHTML: '' };

/* 播报记录器：UI / FX / SFX 都记账，后面断言「有没有反馈」 */
const rec = { toast: [], log: [], ring: 0, flash: 0, cast: 0 };
const UI = { toast: (t, c) => rec.toast.push({ t, c }), log: (t, c) => rec.log.push({ t, c }), updateBoss: noop, updateQuestTrack: noop };
const FX = { ring: () => rec.ring++, flashCircle: () => rec.flash++, burst: noop, spark: noop, beam: noop, flash: noop };
const SFX = { cast: () => rec.cast++, ui: noop, hit: noop, swing: noop, die: noop };

const ctx = loadData({
  console, localStorage: { getItem() { return null; }, setItem() { } },
  THREE: swallow(),
  window: { addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, requestAnimationFrame: noop, location: { href: '' }, localStorage: { getItem() { return null; }, setItem() { } } },
  document: { addEventListener: noop, removeEventListener: noop, getElementById: () => fakeEl, createElement: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], body: fakeEl, documentElement: fakeEl, hidden: false, exitPointerLock: noop, pointerLockElement: null },
  UI, FX, SFX,
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  performance: { now: () => Date.now() },
  requestAnimationFrame: noop,
  cancelAnimationFrame: noop,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorageFake: null
});

let loaded = true, loadErr = '';
try {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8'), ctx, { filename: 'src/game.js' });
} catch (e) { loaded = false; loadErr = e.message; }
ok(loaded, 'src/game.js 可离线装载（桩够用）', loadErr);
if (!loaded) { console.log('\n装载失败，后续行为段跳过'); process.exit(1); }

const Game = vm.runInContext('Game', ctx);
ok(!!Game && typeof Game.onBossKill === 'function', 'Game.onBossKill 存在');

/* 只替掉 save（本脚本不测落盘，测「有没有触发保存」） */
let saveN = 0;
Game.save = () => { saveN++; };
Game.playerGroup = { position: new V3(3, 0, -4) };

const reset = () => {
  Game.state = { seals: {} };
  rec.toast.length = 0; rec.log.length = 0;
  rec.ring = rec.flash = rec.cast = 0;
  saveN = 0;
};

head('五、杀一只魔将 → 掉一枚印');
reset();
Game.onBossKill({ kind: 'bafo_deva' });
eq(Game.state.seals.deva, 1, 'state.seals.deva 被置 1');
eq(Game.sealCount(), 1, 'sealCount() === 1');
ok(rec.toast.some(x => x.t.indexOf('天之印') >= 0), '有「得 · 天之印」播报', rec.toast.map(x => x.t));
ok(rec.log.some(x => x.t.indexOf('1 / 8') >= 0), '播报带进度「1 / 8」', rec.log.map(x => x.t));
eq(saveN, 1, '掉印后立即存档一次');
eq(rec.cast, 1, '播了音效');
eq(rec.ring, 1, '播了光圈');

head('六、重复击杀不重复给');
reset();
Game.onBossKill({ kind: 'bafo_deva' });
const t0 = rec.toast.length;
Game.onBossKill({ kind: 'bafo_deva' });
eq(Game.state.seals.deva, 1, '仍是 1 枚');
eq(Game.sealCount(), 1, 'sealCount 仍是 1');
eq(rec.toast.length, t0, '第二次不再播报');
eq(saveN, 1, '第二次不再存档');

head('七、杀满八只 → 终门播报');
reset();
for (const s of BAFO_SEALS) Game.onBossKill({ kind: s.boss });
eq(Game.sealCount(), 8, '八印齐备');
eq(Object.keys(Game.state.seals).length, 8, 'seals 里 8 个键');
ok(rec.toast.some(x => x.t.indexOf('终 门 已 开') >= 0), '有「天龙终门已开」播报', rec.toast.map(x => x.t));
ok(rec.flash >= 1, '开了终门闪光');
eq(saveN, 8, '八次掉印八次存档');

head('八、非魔将不掉印');
reset();
for (const k of ['wolf', 'chief', 'chaosavatar', 'bafo_deva_x', '']) {
  Game.onBossKill({ kind: k });
}
eq(Game.sealCount(), 0, '普通怪 / 终 boss / 近似 id 都不掉印');
eq(saveN, 0, '不掉印就不存档');

head('九、老档与脏数据');
reset();
Game.state = {};                       /* 老档：连 seals 字段都没有 */
let threw = false;
try { Game.onBossKill({ kind: 'bafo_naga' }); } catch (e) { threw = true; }
ok(!threw, '老档调 onBossKill 不抛错');
eq(Game.sealCount(), 1, '老档也能拿到第一枚印');
Game.state = {};
eq(Game.sealCount(), 0, '没有 seals 字段时 sealCount === 0');
Game.state = { seals: null };
eq(Game.sealCount(), 0, 'seals 为 null 时 sealCount === 0');
Game.state = { seals: { deva: 1, naga: 0, yaksa: 'x' } };
eq(Game.sealCount(), 2, '只数真值（0 / 假值不算）');

head('十、接线（静态）');
const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
ok(/BAFO_SEALS\.find\(/.test(gsrc), 'onBossKill 按 boss id 查印表');
ok(/this\.sealCount\(\)/.test(gsrc), '掉印后算总数');
ok(/sealNeed/.test(gsrc), 'travelTo 有 sealNeed 拦截');
ok(/seals: \{\}/.test(gsrc), 'Game.newState 带 seals 空表');

/* ============================================================
 * C. 存档层
 * ============================================================ */
head('十一、存档：归一化 / 导出 / 新档');
const SaveManager = g('SaveManager');
ok(!!SaveManager, 'SaveManager 存在');

/* 用一个最小 doc 走 normalizeDoc：char 段必须有 name / cls / equipment 等 */
const mkDoc = (seals) => ({
  v: 2,
  meta: { slot: 1, name: '测试', cls: 'warrior', level: 10, mapId: 'village', updatedAt: 1, createdAt: 1 },
  char: { cls: 'warrior', name: '测试', level: 10, equipment: {}, inventory: [], seals },
  world: { mapId: 'village' },
  stash: { items: [], mats: {} }
});

let r = SaveManager.normalizeDoc(mkDoc({ deva: 1, naga: 0, yaksa: 'yes', asura: 2 }), 1);
ok(!!r && !!r.doc, 'normalizeDoc 返回 doc');
const sd = r.doc.char.seals;
ok(!!sd, '归一化后 char.seals 存在');
eq(sd.deva, 1, '真值保持 1');
eq(sd.naga, 0, '0 保持 0');
eq(sd.yaksa, 1, '字符串真值夹成 1');
eq(sd.asura, 1, '数字 2 夹成 1（不会算出 9 枚）');

let r2 = SaveManager.normalizeDoc(mkDoc(undefined), 1);
ok(!!r2.doc.char.seals, '老档（没有 seals）归一化后补成空表');
eq(Object.keys(r2.doc.char.seals).length, 0, '补出来的空表 0 个键');

/* 导出白名单：seals 必须在里面，否则「存了但读不回来」 */
const packed = SaveManager.pack
  ? SaveManager.pack(mkDoc({ deva: 1 }), 1)
  : null;
ok(packed === null || !!packed, 'pack 可用性探测（不阻塞）');
const expSrc = fs.readFileSync(path.join(ROOT, 'src/core/save.js'), 'utf8');
ok(/seals: this\._obj\(s\.seals\) \|\| \{\}/.test(expSrc), '导出白名单含 seals');
ok(/c\.seals = this\._obj\(c\.seals\) \|\| \{\}/.test(expSrc), 'normalizeDoc 补 seals');
ok(/bossKilled: \{\}, seals: \{\}/.test(expSrc), '兜底新档带 seals');

/* 读档侧：unpack(doc) → flat state。漏了这一行就是「存得进、读不回」——
 * seal-live.js 在浏览器里真的抓到过（刷新后 8 枚变 0 枚），所以必须钉住。 */
ok(/seals: this\._obj\(c\.seals\) \|\| \{\}/.test(expSrc), 'unpack 把 seals 搬回 flat state');
const flat = SaveManager.unpack(r.doc);
ok(!!flat && !!flat.seals, 'unpack 输出含 seals');
eq(flat && flat.seals && flat.seals.deva, 1, 'unpack 后 deva 还在');
eq(flat && flat.seals && flat.seals.yaksa, 1, 'unpack 后脏值已被夹成 1');

head('十二、文案与数据一致');
/* 写文档时最容易犯的错：殿名靠记忆写，和 data-world.js 差一个字。
 * 玩家看到「夜叉窟」但游戏里叫「毗沙窟」，就会以为走错了图。 */
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
for (const s of BAFO_SEALS) {
  const nm = (MAPS[s.map] && MAPS[s.map].name) || '';
  ok(!!nm && readme.indexOf(nm) >= 0, 'README 里有真实殿名「' + nm + '」');
  ok(readme.indexOf(s.name) >= 0, 'README 里有「' + s.name + '」');
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(52));
console.log('魔将之印 · 8 枚 / 8 只魔将 / 终门需 8');
console.log((BAFO_SEALS || []).map(s => '  ' + s.name.padEnd(12) + s.map).join('\n'));
console.log(fail === 0 ? '\n✓ 全部通过  ' + pass + ' 项' : '\n✗ 有失败项  ' + pass + ' 通过 / ' + fail + ' 失败');
console.log('='.repeat(52));
process.exit(fail === 0 ? 0 : 1);
