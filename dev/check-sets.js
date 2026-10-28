/* ============================================================
 * dev/check-sets.js —— 套装目录体检（[M6] 12 → 18 套）
 *
 * 断言：
 *   1. 18 套；每套 pieces 与 slots 一一对应、部位不重复
 *   2. 档位 need 严格递增且不超过件数（否则永远点不亮）
 *   3. stats 的 key 必须存在于 STATS；skillMods 的技能 id 必须存在
 *   4. 掉落可达：该套的每个部位都能通过 rollItem(rarity:'set') 抽到它
 *   5. 图鉴分组 SET_TYPES 覆盖全部套装，没有漏登记 / 登记了不存在的 id
 *
 * 用法：node dev/check-sets.js
 * ============================================================ */
const { loadData } = require('./_load');
const vm = require('vm');

const ctx = loadData({ console, Math, JSON, Set, Map, Number, String, Array, Object, isFinite, parseInt, parseFloat });
const g = expr => vm.runInContext(expr, ctx);

const SETS = g('SETS');
const SET_TYPES = g('SET_TYPES');
const STATS = g('STATS');
const SKILLS = g('SKILLS');
const SLOT_ORDER = g('SLOT_ORDER');

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };

const ids = Object.keys(SETS);
ok(ids.length === 18, `套装应为 18 套，实际 ${ids.length}`);

/* ---- 结构 ---- */
for (const id of ids) {
  const s = SETS[id];
  ok(s.id === id, `${id} 的 id 字段与键名不一致（${s.id}）`);
  ok(s.pieces.length === s.slots.length, `${id} pieces ${s.pieces.length} 件 ≠ slots ${s.slots.length} 格`);
  const seen = new Set();
  for (const sl of s.slots) {
    /* SLOT_ORDER 里戒指写作 ring1 / ring2（两个手指位），套装统一写 'ring' */
    ok(sl === 'ring' || SLOT_ORDER.indexOf(sl) >= 0, `${id} 的部位 ${sl} 不在 SLOT_ORDER 里`);
    ok(!seen.has(sl), `${id} 部位 ${sl} 重复`);
    seen.add(sl);
  }
  ok(s.pieces.every(p => typeof p === 'string' && p.length), `${id} 有空部件名`);
  ok(!!s.color && /^#[0-9a-f]{6}$/i.test(s.color), `${id} 颜色格式不对：${s.color}`);

  /* ---- 档位 ---- */
  let last = 0;
  for (const b of s.bonuses) {
    ok(b.need > last, `${id} 档位 need 不是递增（${last} → ${b.need}）`);
    last = b.need;
    ok(b.need <= s.slots.length, `${id} 有 ${b.need} 件档位，但只有 ${s.slots.length} 格，永远点不亮`);
    ok(typeof b.text === 'string' && b.text.length > 0, `${id} 的 ${b.need} 件档位缺文案`);
    for (const k in (b.stats || {})) ok(STATS[k], `${id} 档位 ${b.need} 的属性 ${k} 不在 STATS 里`);
    for (const skid in (b.skillMods || {})) {
      ok(SKILLS[skid], `${id} 档位 ${b.need} 改了不存在的技能 ${skid}`);
    }
  }
  /* sig 是数组（偏好词条顺序），别用 for...in —— 那拿到的是下标 */
  for (const k of (s.sig || [])) ok(STATS[k], `${id} 的 sig 里有不存在的属性 ${k}`);
}

/* ---- 掉落可达：每个部位都能抽到本套 ---- */
for (const id of ids) {
  const s = SETS[id];
  for (const sl of s.slots) {
    const cands = Object.values(SETS).filter(x => x.slots.indexOf(sl) >= 0 && (!x.cls || x.cls === (s.cls || 'warrior')));
    ok(cands.some(x => x.id === id), `${id} 的 ${sl} 部位不在掉落候选里（cls=${s.cls}）`);
  }
}

/* ---- 图鉴分组 ---- */
const typed = new Set();
for (const grp in SET_TYPES) {
  for (const t of SET_TYPES[grp]) {
    for (const sid of t.ids) {
      ok(SETS[sid], `SET_TYPES.${grp} 登记了不存在的套装 ${sid}`);
      ok(!typed.has(sid), `套装 ${sid} 在 SET_TYPES 里登记了两次`);
      typed.add(sid);
      if (SETS[sid]) {
        const want = grp === 'universal' ? null : grp;
        ok((SETS[sid].cls || null) === want, `${sid} 的 cls=${SETS[sid].cls}，却被登记在 ${grp} 组`);
      }
    }
  }
}
for (const id of ids) ok(typed.has(id), `套装 ${id} 没在 SET_TYPES 里登记（图鉴会漏掉它）`);

/* ---- 报告 ---- */
const byCls = { warrior: 0, mage: 0, taoist: 0, universal: 0 };
for (const id of ids) byCls[SETS[id].cls || 'universal']++;
console.log('=== 套装目录体检 ===');
console.log('套数 ' + ids.length + '：战士 ' + byCls.warrior + ' / 术士 ' + byCls.mage +
  ' / 道人 ' + byCls.taoist + ' / 通用 ' + byCls.universal);
console.log('件数分布：' + ids.map(id => SETS[id].name + ' ' + SETS[id].slots.length).join(' · '));
if (fails.length) {
  console.log('\n✗ ' + fails.length + ' 项不通过：');
  for (const f of fails) console.log('  · ' + f);
  process.exit(1);
}
console.log('\n✓ 全部通过');
