/* ============================================================
 * dev/act-check.js —— 世界结构体检：5 卷 / 12 章 / 39 图（离线，node 直跑）
 *
 * 这个脚本在 §12 的验收清单里挂了很久没建，原因很实在：
 * M0/M1 时代 25 个图位是 `id: null`，校验器只能验「已开放的那 6 张」，
 * 剩下的全是空壳，写了也验不出东西。M3 把 30 个图位填满之后才真正可写。
 * [M7] 终章加了 9 个图位（8 副本 + 终 boss 场），总数 30 → 39。
 *
 * 它验的是**结构**，不是地形（地形归 zone-check / zone-density）：
 *
 *   一、卷：5 条、营地真实存在、级数首尾相接且盖满 1..levelMax
 *   二、章：12 条、每卷章号连续、章级数首尾相接、图数 1~5（终章 10）、双首领齐
 *   三、图：39 张、无 null、无重复、无孤儿、非安全区必有怪与首领
 *   四、连通：章间门能一路走到头、章尾判定只在每章最后一张
 *   五、引用：图里的怪 / 首领都在各自表里，章首领真的摆在某张图上
 *   六、图鉴区域：每张图都归得进某一卷
 *
 * 为什么值得单独一个脚本：这些错在浏览器里表现为「传送点进去是黑屏」
 * 「打完首领不开门」「主线指向一张不存在的图」，全都很难一眼看出来，
 * 但在数据层全是确定性的等式。
 *
 * 用法：node dev/act-check.js
 * ============================================================ */
const { loadData } = require('./_load.js');
const vm = require('vm');

const ctx = loadData({
  console, Math, Set, Map, JSON,
  localStorage: { getItem() { return null; }, setItem() {} }
});
const g = (e) => vm.runInContext(e, ctx);

const MAPS = g('MAPS'), MONSTERS = g('MONSTERS'), BOSSES = g('BOSSES');
const PARTS = g('PARTS'), ACTS = g('ACTS'), CAMPS = g('CAMPS');
const BALANCE = g('BALANCE');
const firstMapOfAct = g('firstMapOfAct'), actsOfPart = g('actsOfPart');
const campOfPart = g('campOfPart'), campMapOfPart = g('campMapOfPart');
const isChapterTail = g('isChapterTail'), nextChapterMap = g('nextChapterMap');
const nextMapInWorld = g('nextMapInWorld');

/* 内容等级上限：五卷一共铺到几级。
 * **不要**拿 `BALANCE.levelMax` 当这个用 —— 自 2026-10-28 起那是「全难度最高上限」
 * （极难 99），而内容只铺到 60。上限跟着难度走之后，这两个数不再相等。 */
const CONTENT_LV_MAX = 60;
const levelCapOf = g('levelCapOf'), DIFF_ORDER = g('DIFF_ORDER');
const PART_IDS = Object.keys(PARTS).map(Number).sort((a, b) => a - b);
const ACT_IDS = Object.keys(ACTS);
const MAP_IDS = Object.keys(MAPS);

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; return true; }
  fail++;
  console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  return false;
};
const eq = (msg, a, b) => ok(a === b, msg, { got: a, want: b });
const head = (t) => console.log('\n=== ' + t + ' ===');

/* 章排序：先按卷，再按章号 */
const actSort = (a, b) => (ACTS[a].part - ACTS[b].part) || (ACTS[a].no - ACTS[b].no);
const SORTED_ACTS = ACT_IDS.slice().sort(actSort);

/* ============================================================
 * 一、卷
 * ============================================================ */
head('一、卷（' + PART_IDS.length + '）');
eq('卷数 5', PART_IDS.length, 5);
eq('卷号从 1 连续到 5', PART_IDS.join(','), '1,2,3,4,5');

for (const p of PART_IDS) {
  const part = PARTS[p];
  ok(part.id === p, `卷 ${p} 的 id 与键一致`, { id: part.id, key: p });
  ok(!!part.name, `卷 ${p} 有名字`);
  ok(!!part.brief, `卷 ${p} 有简介`);

  /* 营地：数据在、地图在、卷号对得上、地图自己也知道它属于这个营地 */
  const camp = CAMPS[part.camp];
  ok(!!camp, `卷 ${p} 的营地 ${part.camp} 存在于 CAMPS`);
  if (camp) {
    eq(`卷 ${p} 营地 ${part.camp} 的 part 字段`, camp.part, p);
    ok(!!MAPS[camp.mapId], `卷 ${p} 营地的地图 ${camp.mapId} 存在于 MAPS`);
    if (MAPS[camp.mapId]) {
      ok(MAPS[camp.mapId].camp === camp.id,
        `地图 ${camp.mapId} 反向指向营地 ${camp.id}`, MAPS[camp.mapId].camp);
      ok(MAPS[camp.mapId].safe === true, `营地地图 ${camp.mapId} 是安全区`);
    }
  }

  /* 传送门：名字与 key 都不能空（UI 要显示） */
  ok(!!part.portal, `卷 ${p} 有传送门 id`);
  ok(!!part.portalName, `卷 ${p} 有传送门名字`);
  ok(!!part.keyName, `卷 ${p} 有钥匙名`);

  /* 级数：单调、不重叠、不空档 */
  ok(part.from <= part.to, `卷 ${p} 级数区间合法`, [part.from, part.to]);
}

eq('第 1 卷从 1 级起', PARTS[1].from, 1);
eq('最后一卷盖到内容等级上限', PARTS[PART_IDS[PART_IDS.length - 1]].to, CONTENT_LV_MAX);
for (let i = 1; i < PART_IDS.length; i++) {
  const prev = PARTS[PART_IDS[i - 1]], cur = PARTS[PART_IDS[i]];
  eq(`卷 ${prev.id}→${cur.id} 级数首尾相接（不空档不重叠）`, cur.from, prev.to + 1);
}

head('一·b、等级上限跟难度走');
/* 2026-10-28 定：越难能爬得越高。这一节盯三件事 ——
 * 阶梯严格递增、最高档就是 BALANCE.levelMax、每档都不低于内容上限（不能出现
 * 「普通难度还没打完内容就满级了」）。 */
const CAPS = DIFF_ORDER.map(k => levelCapOf(k));
ok(CAPS.every(v => typeof v === 'number' && v > 0), '每档难度都有数值上限', CAPS);
ok(CAPS.every((v, i) => i === 0 || v > CAPS[i - 1]), '难度越高上限越高（严格递增）',
  DIFF_ORDER.map((k, i) => k + ':' + CAPS[i]));
eq('最高难度上限 = BALANCE.levelMax', CAPS[CAPS.length - 1], BALANCE.levelMax);
ok(CAPS.every(v => v >= CONTENT_LV_MAX), '每档上限都不低于内容上限（不会没打完就封顶）',
  DIFF_ORDER.map((k, i) => k + ':' + CAPS[i]));
eq('不认识的难度键回落到默认档上限', levelCapOf('no_such_diff'), levelCapOf('normal'));

/* ============================================================
 * 二、章
 * ============================================================ */
head('二、章（' + ACT_IDS.length + '）');
eq('章数 12', ACT_IDS.length, 12);

for (const p of PART_IDS) {
  const list = actsOfPart(p).slice().sort((a, b) => a.no - b.no);
  ok(list.length >= 1, `卷 ${p} 至少 1 章`, list.length);

  /* 章号从 1 连续，不许跳号（跳号会让「下一章」找不到） */
  const nos = list.map(a => a.no);
  eq(`卷 ${p} 章号从 1 连续`, nos.join(','), nos.map((_, i) => i + 1).join(','));

  /* 章级数首尾相接，并盖满整卷 */
  eq(`卷 ${p} 首章起点 = 卷起点`, list[0].from, PARTS[p].from);
  eq(`卷 ${p} 末章终点 = 卷终点`, list[list.length - 1].to, PARTS[p].to);
  for (let i = 1; i < list.length; i++) {
    eq(`卷 ${p} 章 ${list[i - 1].id}→${list[i].id} 级数相接`, list[i].from, list[i - 1].to + 1);
  }
}

const LAST_ACT = SORTED_ACTS[SORTED_ACTS.length - 1];
for (const id of SORTED_ACTS) {
  const a = ACTS[id];
  ok(a.id === id, `章 ${id} 的 id 与键一致`, { id: a.id, key: id });
  ok(!!a.name, `章 ${id} 有名字`);
  ok(a.from <= a.to, `章 ${id} 级数区间合法`, [a.from, a.to]);

  /* 图数 1~5（计划书 §5.3）。
   * [M7] 终章例外：5-2 从「一张图」改成「枢纽 + 8 副本 + 终 boss 场」，
   * 一共 10 个图位 —— 这不是「一章塞了十张世界图」，而是 1 张枢纽图
   * 背后挂 9 个入口，章的长度没变（还是 59~60 级）。 */
  const maxMaps = (id === LAST_ACT) ? 10 : 5;
  ok(a.maps.length >= 1 && a.maps.length <= maxMaps, `章 ${id} 图数在 1~${maxMaps}`, a.maps.length);

  /* 双首领：主首领必须有；副首领允许为空，但只允许出现在最后一章 */
  ok(!!BOSSES[a.boss], `章 ${id} 主首领 ${a.boss} 存在于 BOSSES`);
  if (a.sub) {
    ok(!!BOSSES[a.sub], `章 ${id} 副首领 ${a.sub} 存在于 BOSSES`);
  } else {
    ok(id === LAST_ACT, `章 ${id} 缺副首领，只有最后一章允许`, id);
  }

  /* 章内每张图的 lv 落在章的区间内，且随图序递增 */
  let prevLv = -Infinity;
  for (const m of a.maps) {
    ok(m.lv >= a.from && m.lv <= a.to, `章 ${id} 图 ${m.id} 的 lv ${m.lv} 在章区间 ${a.from}~${a.to} 内`);
    ok(m.lv >= prevLv, `章 ${id} 图 ${m.id} 的 lv 不倒退`, [prevLv, m.lv]);
    prevLv = m.lv;
  }
}

/* ============================================================
 * 三、图
 * ============================================================ */
head('三、图（' + MAP_IDS.length + ' 张实体地图）');

const referenced = [];        // 章里引用到的图 id
const ownerOf = {};           // 图 → 所属章
for (const id of SORTED_ACTS) {
  for (const m of ACTS[id].maps) {
    referenced.push(m.id);
    if (m.id) ownerOf[m.id] = id;
  }
}
const realRefs = referenced.filter(Boolean);

/* [M7] 30 → 39：终章新增 8 张副本图 + 终 boss 场「无相天」。
 * 混沌海本体还在（变成枢纽），所以是 +9 而不是 +10。 */
eq('图位总数 39（计划书 §5 + §15.1）', referenced.length, 39);
eq('图位里没有 id: null', realRefs.length, referenced.length);
eq('同一张图不被两章引用', new Set(realRefs).size, realRefs.length);

for (const id of realRefs) {
  ok(!!MAPS[id], `章引用的图 ${id} 存在于 MAPS`);
  if (MAPS[id]) ok(MAPS[id].id === id, `图 ${id} 的 id 字段与键一致`, MAPS[id].id);
}

/* 孤儿图：MAPS 里除「营地 + 试炼场」之外，每张图都必须被某章引用。
 * 孤儿图 = 做了但玩家永远去不到的地图，白花的体积。 */
const campMaps = new Set(Object.keys(CAMPS).map(k => CAMPS[k].mapId));
const orphan = MAP_IDS.filter(id => realRefs.indexOf(id) < 0 && !campMaps.has(id) && id !== 'trial');
eq('没有孤儿图（除营地与试炼场外全部被章引用）', orphan.length, 0);
if (orphan.length) console.log('    孤儿：' + orphan.join(', '));

/* 每张图的怪 / 首领 */
for (const id of realRefs) {
  const m = MAPS[id];
  if (!m) continue;
  /* [M7] 安全区（营地 / 八部坛枢纽）与 boss 场（无相天）本来就没有小怪 ——
   * 要求它们「有刷怪池」等于要求村口站两只狼。 */
  if (!m.safe && !m.arena) {
    ok(Array.isArray(m.spawns) && m.spawns.length > 0, `图 ${id} 有刷怪池`, (m.spawns || []).length);
  }
  const badSpawn = (m.spawns || []).filter(k => !MONSTERS[k]);
  eq(`图 ${id} 的刷怪都在 MONSTERS 里`, badSpawn.length, 0);
  if (badSpawn.length) console.log('    缺：' + badSpawn.join(', '));

  const badBoss = (m.bosses || []).filter(k => !BOSSES[k]);
  eq(`图 ${id} 的首领都在 BOSSES 里`, badBoss.length, 0);
  if (badBoss.length) console.log('    缺：' + badBoss.join(', '));
}

/* 每章的首领必须真的摆在**本章某张图**上，否则「打完首领开下一章」永远触发不了 */
for (const id of SORTED_ACTS) {
  const a = ACTS[id];
  const placed = new Set();
  for (const mm of a.maps) {
    if (!mm.id || !MAPS[mm.id]) continue;
    for (const b of (MAPS[mm.id].bosses || [])) placed.add(b);
  }
  ok(placed.has(a.boss), `章 ${id} 主首领 ${a.boss} 摆在章内某张图上`,
    [...placed]);
  if (a.sub) ok(placed.has(a.sub), `章 ${id} 副首领 ${a.sub} 摆在章内某张图上`);
}

/* ============================================================
 * 四、连通
 * ============================================================ */
head('四、连通（营地 → 章 → 章间门）');

for (const p of PART_IDS) {
  const campMap = campMapOfPart(p);
  ok(!!campMap && !!MAPS[campMap], `卷 ${p} 能取到营地地图`, campMap);
  for (const a of actsOfPart(p)) {
    const first = firstMapOfAct(a.id);
    ok(!!first && !!first.id && !!MAPS[first.id], `卷 ${p} 章 ${a.id} 能取到首图`, first && first.id);
  }
}

/* 章间门只在**同一卷内**：卷末章的门是「回营地」而不是「去下一卷」
 * （M1 的设计，卷与卷之间靠大传送门 / 营地，见台账决策记录）。
 * 所以这里按卷分组验：卷内相邻章要通，卷末章必须返回 null。 */
for (const p of PART_IDS) {
  const list = actsOfPart(p).slice().sort((a, b) => a.no - b.no);
  for (let i = 0; i < list.length; i++) {
    const cur = list[i];
    /* 章尾 = 本章最后一张**已开放**的图（不是图位最后一个） */
    const tail = cur.maps.filter(m => m.id).pop();
    ok(!!tail, `章 ${cur.id} 至少有一张已开放图`);
    if (!tail) continue;

    ok(isChapterTail(tail.id) === true, `章 ${cur.id} 的末图 ${tail.id} 被判定为章尾`);

    const to = nextChapterMap(tail.id);
    if (i + 1 < list.length) {
      const nextFirst = firstMapOfAct(list[i + 1].id);
      const want = nextFirst ? nextFirst.id : null;
      eq(`章 ${cur.id} 的章尾门通向 ${list[i + 1].id} 的首图`, to, want);
      ok(!!to && !!MAPS[to], `章 ${cur.id} 的章尾门目标 ${to} 是真实地图`);
    } else {
      eq(`卷 ${p} 末章 ${cur.id} 不出跨卷门（回营地）`, to, null);
    }
  }
}

/* 非章尾不该被误判成章尾（否则同一张图会挂两道门） */
for (const id of SORTED_ACTS) {
  const a = ACTS[id];
  const tail = a.maps.filter(m => m.id).pop();
  for (const m of a.maps) {
    if (!m.id || m.id === tail.id) continue;
    ok(isChapterTail(m.id) === false, `章 ${id} 的非末图 ${m.id} 不是章尾`);
  }
}

/* 最后一章不该有章尾门 */
const lastTail = ACTS[LAST_ACT].maps.filter(m => m.id).pop();
if (lastTail) {
  eq(`最后一章 ${LAST_ACT} 的末图没有下一章`, nextChapterMap(lastTail.id), null);
}

/* ---- 图间门（M3b 补）：每张图都要有「顺着走的下一张」 ----
 * 这一节是给一个真事故补的回归：M1 只给章尾挂了门，一章里第 2 张起的图
 * （落霞坡 / 沉骨滩 / 玄铁矿洞 / 万剑坑 …）在游戏里**根本没有入口** ——
 * 上一张图走不过去，只能翻山河图，而山河图在叙事上是「回头路」不是「前进」。
 * 判据三条：
 *   1. 非卷末、非终章的图，nextMapInWorld 必须给出一张真实地图；
 *   2. 同章内相邻两张图要直连（不许跳过中间的图）；
 *   3. 从每卷首图出发顺着门一路走，要能走完整卷（不漏图、不死循环）。
 * 终章（linear:false）单独验：八部坛是枢纽，靠 8 道门而不是走廊。 */
for (const p of PART_IDS) {
  const list = actsOfPart(p).slice().sort((a, b) => a.no - b.no);
  const lastAct = list[list.length - 1];
  for (const a of list) {
    if (a.linear === false) {
      eq(`终章 ${a.id} 不参与线性串联（八部坛走 8 道门）`, nextMapInWorld(firstMapOfAct(a.id).id), null);
      continue;
    }
    const open = a.maps.filter(m => m.id);
    for (let k = 0; k < open.length; k++) {
      const to = nextMapInWorld(open[k].id);
      if (k + 1 < open.length) {
        eq(`章 ${a.id} 的 ${open[k].id} 顺着门去本章下一张 ${open[k + 1].id}`, to, open[k + 1].id);
      } else if (a.id === lastAct.id) {
        eq(`卷 ${p} 末章 ${a.id} 的末图 ${open[k].id} 不出门（回营地）`, to, null);
      } else {
        ok(!!to && !!MAPS[to], `章 ${a.id} 的末图 ${open[k].id} 门通向下一章首图`, to);
      }
      if (to) ok(!!MAPS[to], `图间门目标 ${to} 是真实地图`);
    }
  }

  /* 顺着门把整卷走一遍：卷内所有图都要踩到，且不能绕回已踩过的图 */
  let cur = firstMapOfAct(list[0].id);
  const walked = [];
  let guard = 0;
  while (cur && guard++ < 100) {
    const id = cur.id || cur;
    if (walked.indexOf(id) >= 0) { ok(false, `卷 ${p} 的图间门在 ${id} 处成环`); break; }
    walked.push(id);
    const nx = nextMapInWorld(id);
    if (!nx) break;
    cur = nx;
  }
  const want = [];
  for (const a of list) {
    if (a.linear === false) {
      /* 终章只有「首图」算链上的终点（混沌海），8 张副本不在走廊上 */
      const f = firstMapOfAct(a.id);
      if (f) want.push(f.id);
      continue;
    }
    for (const m of a.maps) if (m.id) want.push(m.id);
  }
  eq(`卷 ${p} 顺着门能从首图走完整卷（${walked.length} 张）`, walked.length, want.length);
  for (const id of want) ok(walked.indexOf(id) >= 0, `卷 ${p} 顺着门能走到 ${id}`);
}

/* ============================================================
 * 五、图鉴区域（M4 把图鉴改成 5 大卷，这里确认每张图都归得进去）
 * ============================================================ */
head('五、图鉴区域');
let CODEX_REGIONS = null;
try { CODEX_REGIONS = g('CODEX_REGIONS'); } catch (e) { /* 老版本没有就跳过 */ }
if (CODEX_REGIONS) {
  const regions = Object.keys(CODEX_REGIONS);
  ok(regions.length >= 5, '图鉴至少 5 个区域（卷一~卷五 + 秘境）', regions.length);
  /* 每张图（按出场最多的卷归区）至少能算出归属：用章 → 卷反查 */
  const unassigned = realRefs.filter(id => !ownerOf[id]);
  eq('每张图都能反查到所属章（进而归卷）', unassigned.length, 0);
} else {
  console.log('  （本版没有 CODEX_REGIONS，跳过）');
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(52));
const partInfo = PART_IDS.map(p => PARTS[p].name + '(' + PARTS[p].from + '~' + PARTS[p].to + ')').join(' · ');
console.log('5 卷：' + partInfo);
console.log('12 章 · ' + referenced.length + ' 图位 · ' + realRefs.length + ' 张实体图 · 5 营地 · ' + MAP_IDS.length + ' 张 MAPS 条目');
const perPart = PART_IDS.map(p => actsOfPart(p).length + ' 章/' +
  actsOfPart(p).reduce((s, a) => s + a.maps.length, 0) + ' 图').join(' · ');
console.log('每卷：' + perPart);
console.log(fail === 0 ? '\n✓ 全部通过  ' + pass + ' 项' : '\n✗ 有失败项  ' + pass + ' 通过 / ' + fail + ' 失败');
console.log('='.repeat(52));
process.exit(fail === 0 ? 0 : 1);
