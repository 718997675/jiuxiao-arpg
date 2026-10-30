#!/usr/bin/env node
/* ============================================================
 * dev/quest-ref.js —— 任务表的「引用完整性」探针
 *
 * 为什么需要它：data-quests.js 是完全数据驱动的，任务里写的是**字符串 id**：
 *   map: 'sunset' / zone: 't3' / target: 'batking' / skill: 'avatar'
 * 这些 id 拼错一个字母，代码不会报错，只会在运行到那一条任务时静默失效
 * （点「接下」没反应 / 任务永远打不完 / 追踪条显示空白）。
 * M3b 一次加了 23 条任务、19 张图、16 个首领，光靠肉眼对名字不可靠。
 *
 * 校验项：
 *   1. map 必须在 MAPS 里，且该图位在 ACTS 里已被填上（不是 id: null）
 *   2. zone 必须在该图的 zone 列表里（骨架图走 zonesOfMap）
 *   3. objectives 的 target：boss 型查 BOSSES，kill 型查 MONSTERS
 *   4. rewards.skill 必须在 SKILLS 里
 *   5. next / require 指向的任务必须存在
 *   6. 主线 require 链必须能走通（从 require:null 出发覆盖全部主线）
 *
 * 用法：node dev/quest-ref.js        # 有问题 exit 1
 * ============================================================ */

const vm = require('vm');
const { loadData } = require('./_load');

/* 数据层的 const 不会挂到 vm 全局上（只有 function 声明会），
 * 所以这里统一用 runInContext 取 —— 和 test-quest.js 的做法一致。 */
const ctx = loadData();
const get = (name) => vm.runInContext(name, ctx);
const QUESTS = get('QUESTS'), MAPS = get('MAPS'), ACTS = get('ACTS');
const BOSSES = get('BOSSES'), MONSTERS = get('MONSTERS'), SKILLS = get('SKILLS');
const mapZones = get('mapZones');

let bad = 0;
const fail = (m) => { console.log('  ✗ ' + m); bad++; };

/* ACTS 里已填实图的 id 集合：任务指向的图必须在其中，
 * 否则「图位存在但地图没做」，任务会被 questMapOpen 过滤掉（等于死任务） */
const OPEN_MAPS = new Set();
for (const k in ACTS) for (const m of ACTS[k].maps) if (m.id) OPEN_MAPS.add(m.id);

const ids = Object.keys(QUESTS);
console.log('\n任务表引用完整性：' + ids.length + ' 条任务 · ' + OPEN_MAPS.size + ' 张已开放地图\n');

const byKind = { main: 0, side: 0, board: 0 };
for (const id of ids) {
  const q = QUESTS[id];
  byKind[q.kind] = (byKind[q.kind] || 0) + 1;

  /* 1. 地图 */
  if (q.map && q.map !== 'any') {
    if (!MAPS[q.map]) fail(id + '：map ' + q.map + ' 不在 MAPS 里');
    else if (!OPEN_MAPS.has(q.map)) fail(id + '：map ' + q.map + ' 在 ACTS 里还是 id:null（任务会被过滤掉）');
  }

  /* 2. 区域 */
  if (q.zone) {
    const zs = mapZones(q.map) || [];
    if (!zs.some(z => z.id === q.zone)) fail(id + '：zone ' + q.zone + ' 不在 ' + q.map + ' 的区域里');
  }

  /* 3. 目标 */
  for (const o of q.objectives || []) {
    if (o.type === 'boss' && !BOSSES[o.target]) fail(id + '：boss ' + o.target + ' 不存在');
    if (o.type === 'kill' && !MONSTERS[o.target]) fail(id + '：monster ' + o.target + ' 不存在');
    if (o.type === 'reach') {
      const zs = mapZones(q.map) || [];
      if (!zs.some(z => z.id === o.zone)) fail(id + '：reach zone ' + o.zone + ' 不在 ' + q.map + ' 里');
    }
    if (!(o.count > 0)) fail(id + '：目标数量 ' + o.count + ' 不是正数');
  }
  if (!(q.objectives || []).length) fail(id + '：没有 objectives');

  /* 4. 奖励技能 */
  if (q.rewards && q.rewards.skill && !SKILLS[q.rewards.skill]) {
    fail(id + '：rewards.skill ' + q.rewards.skill + ' 不在 SKILLS 里');
  }

  /* 5. 链指针 */
  if (q.next && !QUESTS[q.next]) fail(id + '：next ' + q.next + ' 不存在');
  if (q.require && !QUESTS[q.require]) fail(id + '：require ' + q.require + ' 不存在');
}

/* 6. 主线链可走通：从所有 require:null 的主线出发，看能不能覆盖全部主线 */
const mains = ids.filter(i => QUESTS[i].kind === 'main');
const reached = new Set();
const queue = mains.filter(i => !QUESTS[i].require);
while (queue.length) {
  const id = queue.shift();
  if (reached.has(id)) continue;
  reached.add(id);
  for (const n of mains) if (n !== id && QUESTS[n].require === id) queue.push(n);
}
const orphans = mains.filter(i => !reached.has(i));
if (orphans.length) fail('主线链断开，走不到：' + orphans.join(', '));

/* 报告 */
console.log('  主线 ' + byKind.main + ' / 支线 ' + byKind.side + ' / 悬赏 ' + byKind.board);
console.log('  主线链首尾：' +
  mains.filter(i => !QUESTS[i].require).map(i => QUESTS[i].name).join(' / ') + ' → ' +
  mains.filter(i => !QUESTS[i].next).map(i => QUESTS[i].name).join(' / '));
console.log('  主线链覆盖 ' + reached.size + '/' + mains.length);

if (bad) { console.log('\n❌ ' + bad + ' 处引用错误\n'); process.exit(1); }
console.log('\n✅ 引用全部有效\n');
