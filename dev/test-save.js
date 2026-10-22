/* ============================================================
 * S0 存档地基 · 离线验证（node dev/test-save.js）
 *
 * 不启浏览器，直接把 core/ + data/ + items.js 打包进 vm 上下文，
 * 用假的 localStorage 跑完整闭环：
 *   1. V1 旧档 → 自动迁移成角色位 1（关键字段逐项比对）
 *   2. 读旧档 → 存新档 → 再读（指纹一致）
 *   3. 导出 → 清空 localStorage → 导入（100% 还原）
 *   4. 原子写入：模拟 quota 满，原档必须完好
 *   5. 3 个角色位互不干扰
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'src/core/boot.js',
  'src/core/store.js',
  'src/data/data-core.js',
  'src/data/data-items.js',
  'src/data/data-skills.js',
  'src/data/data-monsters.js',
  'src/data/data-world.js',
  'src/core/save.js',
  'src/items.js'
];

/* ---------------- 假 localStorage ---------------- */
const mem = new Map();
const failKeys = new Set();
const localStorage = {
  get length() { return mem.size; },
  key(i) { return Array.from(mem.keys())[i] ?? null; },
  getItem(k) { return mem.has(k) ? mem.get(k) : null; },
  setItem(k, v) {
    if (failKeys.has(k)) {
      const e = new Error('QuotaExceededError: simulated');
      e.name = 'QuotaExceededError';
      throw e;
    }
    mem.set(k, String(v));
  },
  removeItem(k) { mem.delete(k); },
  clear() { mem.clear(); }
};

/* ---------------- 最小 DOM ---------------- */
const fakeEl = () => ({
  style: {}, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
  textContent: '', innerHTML: '', addEventListener() { }, appendChild() { }, remove() { }, click() { },
});
const document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  addEventListener() { },
  body: fakeEl()
};
const window = {
  addEventListener() { },
  removeEventListener() { },
  localStorage,
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  navigator: { maxTouchPoints: 0 },
};

const sandbox = {
  console, window, document, localStorage,
  navigator: window.navigator,
  Math, JSON, Date, Number, String, Array, Object, Set, Map, Promise, isFinite, parseInt, parseFloat,
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() { } },
  Blob: class Blob { constructor(a) { this.parts = a; } },
  setTimeout, clearTimeout,
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const bundle = FILES.map(f => `/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
vm.runInContext(bundle + '\n;globalThis.__api = { SaveManager, Store, makeStarterSet, rollItem, ITEM_UID: () => ITEM_UID, saveStateFingerprint, CLASSES, QUESTS };', sandbox, { filename: 'bundle.js' });
const api = sandbox.__api;
const SM = api.SaveManager;

/* ---------------- 断言 ---------------- */
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
}
function eq(a, b, label) { ok(a === b, label, { got: a, want: b }); }
function section(t) { console.log('\n' + t); }

/* ---------------- 构造一份真实的 V1 存档 ---------------- */
function buildV1() {
  const cls = 'warrior';
  const starter = api.makeStarterSet(cls);
  const eq0 = {
    helm: api.rollItem(9, { slot: 'helm', rarity: 'rare', cls }), chest: starter.chest, shoulders: null,
    gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null,
    weapon: starter.weapon, offhand: null
  };
  const inv = [];
  const slots = ['helm', 'chest', 'boots', 'gloves', 'ring', 'amulet', 'weapon'];
  for (let i = 0; i < 12; i++) {
    inv.push(api.rollItem(4 + i * 2, { slot: slots[i % slots.length], rarity: ['common', 'magic', 'rare', 'legendary'][i % 4], cls }));
  }
  return {
    cls, name: '青崖客', level: 17, xp: 340, xpNext: 2100, gold: 3421,
    potions: { hp: 5, mp: 2 }, hp: 470, mp: 61,
    equipment: eq0, inventory: inv, maxInv: 40,
    quests: {
      active: [{ id: 'q3', progress: [0] }],
      done: ['q1', 'q2'],
      next: 'q3',
      announced: { q1: 1, q2: 1 }
    },
    mapId: 'forest',
    playerPos: { x: 3.5, z: -12.25 },
    bossKilled: { treeking: 1 },
    playTime: 4321.7
  };
}

/* ============================================================ */
section('一、V1 旧档 → V2 角色位 1（自动迁移）');
const v1 = buildV1();
const v1Raw = JSON.stringify(v1);
localStorage.setItem('jiuxiao_save_v1', v1Raw);

SM.init();

ok(SM.migrated, 'init() 触发了迁移');
eq(localStorage.getItem('jiuxiao_save_v1'), v1Raw, 'V1 旧键原样保留（没被删改）');
eq(localStorage.getItem('jiuxiao_save_v1.bak'), v1Raw, '迁移前原始备份 jiuxiao_save_v1.bak 内容一致');
ok(!!localStorage.getItem('jiuxiao_save_v2_s1'), '角色位 1 已写入 jiuxiao_save_v2_s1');
eq(localStorage.getItem('jiuxiao_save_v2_s1.tmp'), null, '临时键已清理（无残留 .tmp）');
eq(SM.activeSlot(), 1, '当前角色位 = 1');

const doc1 = SM.readSlot(1);
eq(doc1.v, 2, 'doc.v === 2');
for (const k of ['meta', 'char', 'world', 'stash', 'codex', 'talents', 'mount', 'settings']) {
  ok(k in doc1, `doc 含 ${k} 段`);
}
eq(doc1.meta.migratedFrom, 1, 'meta.migratedFrom === 1');
eq(doc1.char.playTime, doc1.meta.playTime, 'char.playTime 与 meta.playTime 同步');

section('二、关键字段逐项比对（迁移前后必须一致）');
const flat1 = SM.load(1);
const fp0 = api.saveStateFingerprint(v1);
const fp1 = api.saveStateFingerprint(flat1);
eq(flat1.level, v1.level, `等级 ${v1.level}`);
eq(flat1.cls, v1.cls, `职业 ${v1.cls}`);
eq(flat1.name, v1.name, `道号 ${v1.name}`);
eq(flat1.gold, v1.gold, `金币 ${v1.gold}`);
eq(flat1.xp, v1.xp, `经验 ${v1.xp}`);
eq(flat1.inventory.length, v1.inventory.length, `背包物品数 ${v1.inventory.length}`);
eq(flat1.maxInv, v1.maxInv, '背包容量');
eq(JSON.stringify(flat1.quests.active), JSON.stringify(v1.quests.active), '进行中任务与进度');
eq(JSON.stringify(flat1.quests.done), JSON.stringify(v1.quests.done), '已完成任务');
eq(flat1.quests.next, v1.quests.next, '下一个任务指针');
eq(flat1.mapId, v1.mapId, '所在地图');
eq(flat1.playerPos.x, v1.playerPos.x, '坐标 x');
eq(flat1.playerPos.z, v1.playerPos.z, '坐标 z');
eq(flat1.bossKilled.treeking, 1, 'Boss 击杀记录');
eq(Math.round(flat1.playTime), Math.round(v1.playTime), '游戏时长');
eq(flat1.equipment.helm.affixes.length, v1.equipment.helm.affixes.length, '装备词缀条数');
eq(fp1.invSig, fp0.invSig, '背包物品指纹（稀有度/基底/ilvl 全一致）');
eq(fp1.eqSig, fp0.eqSig, '已装备物品指纹');

section('三、读旧档 → 存新档 → 再读（闭环一致）');
const before = JSON.stringify(SM.unpack(doc1));
SM.save(flat1, 1);
const doc1b = SM.readSlot(1);
const after = JSON.stringify(SM.unpack(doc1b));
ok(before === after, '二次落盘后 unpack 结果完全一致');
eq(SM.listSlots().filter(s => !s.empty).length, 1, '只有 1 个非空角色位');

section('四、导出 → 清空 → 导入（100% 还原）');
const exported = SM.exportText(1);
ok(exported.length > 500, `导出文本长度 ${exported.length}`);
const exObj = JSON.parse(exported);
eq(exObj.v, 2, '导出内容 schemaVersion = 2');
ok(!!exObj.meta.exportedAt, '导出带 exportedAt 时间戳');

const fpExport = api.saveStateFingerprint(SM.unpack(exObj));
localStorage.clear();
SM._createdAt = {};
eq(localStorage.length, 0, 'localStorage 已清空');
const imp = SM.importText(exported, 1);
ok(imp.ok, '导入成功', imp.error);
const flat2 = SM.load(1);
const fp2 = api.saveStateFingerprint(flat2);
eq(JSON.stringify(fp2), JSON.stringify(fpExport), '导入后指纹与导出时完全一致');
eq(flat2.inventory.length, v1.inventory.length, '背包数量还原');
eq(flat2.gold, v1.gold, '金币还原');
eq(JSON.stringify(flat2.quests), JSON.stringify(v1.quests), '任务进度还原（含 announced）');
eq(flat2.equipment.weapon.baseName, v1.equipment.weapon.baseName, '武器基底还原');

section('五、导入 V1 旧档文本（直接吃旧格式）');
localStorage.clear();
SM._createdAt = {};
const impV1 = SM.importText(v1Raw, 2);
ok(impV1.ok && impV1.fromV1, 'V1 扁平档可直接导入', impV1.error);
const flat3 = SM.load(2);
eq(api.saveStateFingerprint(flat3).invSig, fp0.invSig, 'V1 文本导入后背包指纹一致');

section('六、原子写入：模拟 quota 满，原档必须完好');
localStorage.clear();
SM._createdAt = {};
SM.save(flat1, 1);
const goodRaw = localStorage.getItem('jiuxiao_save_v2_s1');
const tampered = JSON.parse(JSON.stringify(flat1));
tampered.gold = 999999;
failKeys.add('jiuxiao_save_v2_s1');
const okWrite = SM.save(tampered, 1);
failKeys.delete('jiuxiao_save_v2_s1');
eq(okWrite, false, '写入失败被正确识别（返回 false）');
eq(localStorage.getItem('jiuxiao_save_v2_s1'), goodRaw, '原档一个字节都没变');
eq(SM.readSlot(1).char.gold, flat1.gold, '读回来仍是旧金币');
eq(localStorage.getItem('jiuxiao_save_v2_s1.tmp'), null, '失败后临时键已被清理');
ok(/回读不一致|写入/.test(SM.lastError), 'lastError 有可读原因：' + SM.lastError);

section('七、3 个角色位互不干扰');
localStorage.clear();
SM._createdAt = {};
const c1 = SM.createCharacter('warrior', '甲', 0);
const c2 = SM.createCharacter('mage', '乙', 0);
const c3 = SM.createCharacter('taoist', '丙', 0);
ok(c1.ok && c2.ok && c3.ok, '连建 3 个角色成功');
eq([c1.slot, c2.slot, c3.slot].join(','), '1,2,3', '自动分配到 1/2/3 号位');
const c4 = SM.createCharacter('mage', '丁', 0);
eq(c4.ok, false, '第 4 个角色被拒绝（3 位已满）');
eq(SM.listSlots().filter(s => !s.empty).length, 3, '三个位都有档');
eq(SM.listSlots().map(s => s.meta.name).join(','), '甲,乙,丙', '角色名各自独立');

SM.save(Object.assign(SM.load(2), { gold: 8888 }), 2);
eq(SM.readSlot(2).char.gold, 8888, '2 号位写入 8888');
eq(SM.readSlot(1).char.gold, 120, '1 号位金币不受影响（初始 120）');

ok(SM.deleteSlot(2), '删除 2 号位');
ok(!SM.peek(2), '2 号位已空');
eq(SM.listSlots().filter(s => !s.empty).length, 2, '剩 2 个角色');

section('八、异常输入不该崩');
const bad1 = SM.importText('', 1); ok(!bad1.ok, '空文本被拒');
const bad2 = SM.importText('{不是json', 1); ok(!bad2.ok, '坏 JSON 被拒');
const bad3 = SM.importText('{"hello":1}', 1); ok(!bad3.ok, '未知结构被拒');
const bad4 = SM.importText('{"v":2,"char":{"cls":"necro","level":1,"gold":0,"inventory":[]},"world":{"mapId":"village","quests":{}}}', 1);
ok(!bad4.ok, '未知职业被拒：' + (bad4.error || ''));
ok(!!SM.peek(1), '上述失败都没有破坏 1 号位');

section('九、归一化 / 修复能力');
localStorage.clear();
SM._createdAt = {};
const brokenDoc = {
  v: 2,
  meta: {},
  char: { cls: 'mage', level: 5, gold: -100, inventory: [{ uid: 1, rarity: 'rare' }, null, 3], equipment: { weapon: 'garbage' } },
  world: { quests: { active: [{ id: 'q1', progress: ['x', 2] }], done: 'notarray' } }
};
localStorage.setItem('jiuxiao_save_v2_s3', JSON.stringify(brokenDoc));
const fixed = SM.readSlot(3);
eq(fixed.char.gold, 0, '负数金币被夹到 0');
eq(fixed.char.inventory.length, 1, '背包里的脏数据被剔除');
eq(fixed.char.equipment.weapon, null, '非法装备被清空');
ok('helm' in fixed.char.equipment, '缺失的装备槽补齐');
eq(fixed.char.inventory[0].uid, 1, '合法物品原样保留');
eq(fixed.world.quests.done.length, 0, '非法 done 被重置为空数组');
eq(fixed.world.quests.active[0].progress[1], 2, '任务进度保留有效值');

section('十、ITEM_UID 防撞车');
localStorage.clear();
SM._createdAt = {};
const bigDoc = SM.pack(Object.assign(SM._fallbackState('warrior', 'UID 测试'), {
  inventory: [{ uid: 9001, rarity: 'rare', slot: 'helm', affixes: [] }]
}), 1);
SM.writeSlot(1, bigDoc);
const flatUid = SM.load(1);
ok(api.ITEM_UID() > 9001, `读档后 ITEM_UID 提升到 ${api.ITEM_UID()}（> 9001）`);

/* ============================================================ */
console.log('\n' + '='.repeat(52));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
