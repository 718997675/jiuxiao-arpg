/* ============================================================
 * dev/test-m4.js —— M4 怪物/图鉴/卷末首领专项回归
 *
 * 覆盖（对应 docs/status/act-expansion.md 的 M4 验收口径）：
 *   1. 36 只新怪全部落表（key/字段/族群/AI/模型合法）
 *   2. 怪池引用完整：MAPS.spawns 不引用不存在的怪，每只怪都有图可落
 *   3. MAPS.spawns 与 MAP_SPECS.kinds 同步（改池漏一边会被钉住）
 *   4. 图鉴 5 大卷：覆盖全部怪、无重复归属、5 区都非空
 *   5. 卷末首领：actEnd 恰好 5 只、keyTier 对、终局 15%
 *   6. 老档迁移表：旧 5 区 key 全部有归宿
 *
 * [M5] 地下城新增 4 只专属怪（dungeon 字段）与第 6 个图鉴区 rift：
 *   本脚本只钉**野外**那 76 只（幽灵/归区/怪池），地下城部分交给 dev/test-m5.js。
 *
 * 用法：node dev/test-m4.js（纯 node，不启浏览器）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const ctx = { window: {}, console };
vm.createContext(ctx);
for (const f of ['src/data/data-core.js', 'src/data/data-world.js', 'src/data/data-maps.js', 'src/data/data-monsters.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
/* const 声明不会挂到 vm 全局 —— 在上下文里打包成 window.__m4data 再取 */
vm.runInContext(`
window.__m4data = { MONSTERS, MAPS, MAP_SPECS, ACTS, CODEX_REGIONS, CODEX_REGION_LEGACY, BOSSES, BALANCE, MON_FAMILIES, MOB_AI_KINDS };
function regionOf(kind) {
  /* [M5] 地下城专属怪（带 dungeon 字段）只在地脉裂隙里出场，不进任何野外图池，
   * 归区固定 rift —— 与 game.js 的 codexRegionOf 同一口径。 */
  const mc = MONSTERS[kind];
  if (mc && mc.dungeon) return 'rift';
  const cnt = {};
  for (const aid in ACTS) {
    const p = ACTS[aid].part;
    for (const mi of (ACTS[aid].maps || [])) {
      const m = MAPS[mi.id];
      if (m && m.spawns && m.spawns.indexOf(kind) >= 0) cnt[p] = (cnt[p] || 0) + 1;
    }
  }
  let best = null, bestN = 0;
  for (let p = 1; p <= 5; p++) if ((cnt[p] || 0) > bestN) { bestN = cnt[p]; best = 'part' + p; }
  return best;
}
window.__m4 = { regionOf };
`, ctx);
const D = ctx.window.__m4data;

const M4_NEW = ['foxfire', 'cliffram', 'stonecrow', 'mirehorror', 'leechqueen', 'bonefisher',
  'ironmaw', 'cinderhand', 'forgemaster', 'frostwraith', 'iceveil', 'frozenwidow',
  'ashhound', 'flamepriest', 'magmaworm', 'sootwraith', 'emberhound', 'cinderlord',
  'soulgaoler', 'papereffigy', 'wantern', 'tidewretch', 'scalekeeper', 'wraithlord',
  'swordhusk', 'bladewisp', 'duelist', 'cloudserpent', 'thunderdrum', 'feathered',
  'jadepuppet', 'starfaller', 'silkweaver', 'mirrortwin', 'maskweaver', 'voidmoth'];

const { MONSTERS, MAPS, MAP_SPECS, ACTS, CODEX_REGIONS, CODEX_REGION_LEGACY, BOSSES, BALANCE, MON_FAMILIES, MOB_AI_KINDS } = D;

console.log('\n【1】36 只新怪落表');
/* [M5] 新增 4 只地下城专属怪 → 80。它们的归属由 test-m5 管，这里只钉野外那 76 只。 */
const WILD = Object.keys(MONSTERS).filter(k => !MONSTERS[k].dungeon);
ok('MONSTERS 总数 80（76 野外 + 4 地下城）', Object.keys(MONSTERS).length === 80, Object.keys(MONSTERS).length);
ok('野外怪 76 只', WILD.length === 76, WILD.length);
const missingNew = M4_NEW.filter(k => !MONSTERS[k]);
ok('36 个新 key 全部存在', missingNew.length === 0, missingNew);
const badField = M4_NEW.filter(k => {
  const m = MONSTERS[k];
  return !m || !(m.hp > 0) || !(m.atk > 0) || !(m.xp > 0) || !m.lore || !m.model
    || !MON_FAMILIES[m.family] || (m.ai && !MOB_AI_KINDS[m.ai]);
});
ok('新怪字段健全（hp/atk/xp/lore/model/family/ai）', badField.length === 0, badField);
ok('新怪全部声明在卷一~卷五章节内（没有落进老图专属段）',
  M4_NEW.every(k => MONSTERS[k].xp >= 15 && MONSTERS[k].xp <= 220));

console.log('\n【2】怪池引用完整');
const badRef = [];
for (const id in MAPS) for (const k of (MAPS[id].spawns || [])) if (!MONSTERS[k]) badRef.push(id + ':' + k);
ok('所有图池引用的怪都存在', badRef.length === 0, badRef);
const orphan = WILD.filter(k =>
  !Object.keys(MAPS).some(id => (MAPS[id].spawns || []).includes(k)));
ok('每只怪都至少落进一张图的怪池', orphan.length === 0, orphan);
/* 新怪必须落在本章的图里：foxfire 不能出现在卷三 */
const chapterOf = {};
for (const aid in ACTS) for (const mi of ACTS[aid].maps) {
  for (const k of (MAPS[mi.id].spawns || [])) if (!(k in chapterOf)) chapterOf[k] = +ACTS[aid].part;
}
const plannedChapter = { foxfire: 1, cliffram: 1, stonecrow: 1, mirehorror: 1, leechqueen: 1, bonefisher: 1,
  ironmaw: 1, cinderhand: 1, forgemaster: 1, frostwraith: 2, iceveil: 2, frozenwidow: 2,
  ashhound: 2, flamepriest: 2, magmaworm: 2, sootwraith: 2, emberhound: 2, cinderlord: 2,
  soulgaoler: 3, papereffigy: 3, wantern: 3, tidewretch: 3, scalekeeper: 3, wraithlord: 3,
  swordhusk: 4, bladewisp: 4, duelist: 4, cloudserpent: 4, thunderdrum: 4, feathered: 4,
  jadepuppet: 5, starfaller: 5, silkweaver: 5, mirrortwin: 5, maskweaver: 5, voidmoth: 5 };
const wrongChapter = M4_NEW.filter(k => chapterOf[k] !== plannedChapter[k]);
ok('36 只新怪全部落在本人的卷', wrongChapter.length === 0,
  wrongChapter.map(k => k + ':' + chapterOf[k] + '≠' + plannedChapter[k]));

console.log('\n【3】MAPS.spawns 与 MAP_SPECS.kinds 同步');
const desync = [];
for (const id in MAP_SPECS) {
  const a = (MAPS[id] && MAPS[id].spawns) || [];
  const b = MAP_SPECS[id].kinds || [];
  if (a.length !== b.length || a.some(k => b.indexOf(k) < 0)) desync.push(id);
}
ok('骨架图两份怪池一致', desync.length === 0, desync);

console.log('\n【4】图鉴 5 大卷');
const regionOf = ctx.window.__m4.regionOf;
const uncovered = Object.keys(MONSTERS).filter(k => !regionOf(k));
ok('80 只全部可归区（含 4 只地下城怪 → rift）', uncovered.length === 0, uncovered.slice(0, 5));
const dist = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, rift: 0 };
for (const k in MONSTERS) dist[regionOf(k)]++;
ok('六个区都非空', Object.values(dist).every(n => n > 0), dist);
ok('卷一不超过 32 只（归区策略没有退化回首扫）', dist.part1 <= 32, dist.part1);
ok('rift 区恰好 4 只（M5 地下城专属怪）', dist.rift === 4, dist.rift);
ok('CODEX_REGIONS 是 part1~5 + rift',
  CODEX_REGIONS.length === 6
  && CODEX_REGIONS.slice(0, 5).every((r, i) => r.id === 'part' + (i + 1))
  && CODEX_REGIONS[5].id === 'rift');
ok('每区都有加成与描述', CODEX_REGIONS.every(r => r.bonus && Object.keys(r.bonus).length && r.bonusDesc));

console.log('\n【5】卷末首领');
const actEnd = Object.values(BOSSES).filter(b => b.actEnd);
ok('actEnd 恰好 5 只', actEnd.length === 5, actEnd.map(b => b.id));
ok('keyTier 依次 2/3/4/5/5',
  actEnd.map(b => b.keyTier).join(',') === '2,3,4,5,5', actEnd.map(b => b.keyTier));
const fin = actEnd.find(b => b.final);
ok('只有混沌真身带 final', fin && fin.id === 'chaosavatar');
ok('keyDrop 8% / 终局 15%',
  BALANCE.keyDrop && BALANCE.keyDrop.actBoss === 0.08 && BALANCE.keyDrop.actBossFinal === 0.15);
ok('石甲巨魔 lv18 / 铁山绝顶+沼泽双驻扎',
  BOSSES.golemking.level === 18 && MAPS.ironpeak.bosses.includes('golemking') && MAPS.swamp.bosses.includes('golemking'));
ok('赤炎魔将挪到寒潭水牢（m2_1_1 的任务图）',
  MAPS.frost.bosses.includes('firegeneral') && !MAPS.mine.bosses.includes('firegeneral'));
ok('冥河渡者 lv32 对齐九幽地宫',
  BOSSES.ferryman.level === 32 && MAPS.abyss.bosses.includes('ferryman'));
ok('卷末首领血量随等级递增',
  [BOSSES.golemking, BOSSES.flameemperor, BOSSES.yellowspring, BOSSES.heavenguard, BOSSES.chaosavatar]
    .every((b, i, arr) => i === 0 || b.hp > arr[i - 1].hp));

console.log('\n【6】老档迁移表');
ok('旧 5 区 key 全部有归宿',
  ['forest', 'swamp', 'mine', 'abyss', 'heaven'].every(k => CODEX_REGION_LEGACY[k]));
ok('迁移目标都是合法区 id',
  Object.values(CODEX_REGION_LEGACY).every(id => CODEX_REGIONS.some(r => r.id === id)));

console.log('\n分布：' + CODEX_REGIONS.map(r => r.name + ' ' + dist[r.id]).join(' · '));
console.log(fail ? `\n❌ ${fail} 项失败（${pass} 通过）` : `\n✅ 全部通过（${pass} 项）`);
process.exit(fail ? 1 : 0);
