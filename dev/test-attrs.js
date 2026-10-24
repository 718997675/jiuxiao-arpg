/* ============================================================
 * 根基加点 + 穿戴需求验证（node 直跑，不依赖浏览器）
 *
 *   node dev/test-attrs.js
 *
 * 覆盖：
 *   1. 加点预算：等级 → 总点数 / 已花 / 剩余（旧档按等级补算）
 *   2. 跨职业换算：同一个字在不同职业身上不是一回事
 *   3. computePlayerStats：加点真的进面板，且不同项加不同派生属性
 *   4. 穿戴需求：部位 / 品质 / 传世的差异，低等级装备不设卡
 *   5. 需求随等级单调、按穿戴者职业折算
 *   6. meetsItemReq / itemReqGap 的判定
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Set, Map, JSON };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-items.js');
load('data/data-uniques.js');
load('data/data-relics.js');
load('items.js');

const pick = name => vm.runInContext(name, ctx);
const CLASSES = pick('CLASSES');
const ATTR_KEYS = pick('ATTR_KEYS');
const attrTotalAt = pick('attrTotalAt');
const attrLeft = pick('attrLeft');
const attrSpentOf = pick('attrSpentOf');
const deriveFromAttrs = pick('deriveFromAttrs');
const computePlayerStats = pick('computePlayerStats');
const rollItem = pick('rollItem');
const reqAttrOf = pick('reqAttrOf');
const meetsItemReq = pick('meetsItemReq');
const itemReqGap = pick('itemReqGap');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);
const sec = t => console.log('\n' + t);

/* 造一个最小 player，只喂 computePlayerStats 需要的字段 */
const mkPlayer = (cls, level, alloc) => ({
  cls, level, equipment: {}, talents: {}, codex: null, attrAlloc: alloc || {}
});
const statsOf = (cls, level, alloc) => computePlayerStats(mkPlayer(cls, level, alloc));

/* ---------------- 1. 预算 ---------------- */
sec('1. 加点预算');
ok(attrTotalAt(1) === 5, '1 级有 5 点启动点', attrTotalAt(1));
ok(attrTotalAt(2) === 8, '每级 +3', attrTotalAt(2));
ok(attrTotalAt(60) === 182, '60 级共 182 点', attrTotalAt(60));
ok(attrLeft(10, { str: 9 }) === attrTotalAt(10) - 9, '剩余 = 总数 - 已花', attrLeft(10, { str: 9 }));
ok(attrLeft(10, { str: 999, agi: 5 }) === 0, '超额加点时剩余不小于 0');
ok(attrSpentOf({ str: 3, agi: 2, vit: 0, int: 1 }) === 6, '已花点数四项相加');
ok(attrSpentOf({ str: -5, agi: 'x' }) === 0, '脏值 / 负数按 0 计');

/* ---------------- 2. 跨职业换算 ---------------- */
sec('2. 同字不同效');
const wStr = deriveFromAttrs('warrior', { str: 100 });
const wInt = deriveFromAttrs('warrior', { int: 100 });
const mInt = deriveFromAttrs('mage', { int: 100 });
const mStr = deriveFromAttrs('mage', { str: 100 });
ok(near(wStr.atk, 115), '刀客 100 力量 → 攻击 +115', wStr.atk);
ok(near(wStr.critDmg, 20), '刀客 100 力量 → 暴伤 +20%', wStr.critDmg);
ok(near(wInt.atk, 0), '刀客的灵力不加攻击', wInt.atk);
ok(near(mInt.atk, 150), '术士 100 灵力 → 术法攻击 +150', mInt.atk);
ok(near(mInt.cdr, 6), '术士 100 灵力 → 冷却缩减 +6%', mInt.cdr);
ok(near(mStr.atk, 0) && near(mStr.def, 90), '术士的力量只撑甲，不加攻击', `${mStr.atk}/${mStr.def}`);
ok(mInt.atk > wInt.atk * 10, '同一个「灵力」在两个职业身上差距巨大');
/* 每个职业四项都要有真实生效点，不许出现「写了没人用」 */
let dead = 0;
for (const ck of Object.keys(CLASSES)) {
  for (const ak of ATTR_KEYS) {
    const d = deriveFromAttrs(ck, { [ak]: 10 });
    const live = Object.keys(d).some(k => d[k] > 0);
    if (!live) dead++;
  }
}
ok(dead === 0, '四项根基在每个职业都有生效点（无死属性）', dead);

/* ---------------- 3. 进面板 ---------------- */
sec('3. computePlayerStats');
const base = statsOf('warrior', 20, {});
const pStr = statsOf('warrior', 20, { str: 30 });
const pVit = statsOf('warrior', 20, { vit: 30 });
ok(pStr.atk > base.atk + 30, '刀客加 30 力量 → 攻击明显上升', `${base.atk.toFixed(1)} → ${pStr.atk.toFixed(1)}`);
ok(near(pStr.hpMax, base.hpMax, 1), '加力量不改生命', `${base.hpMax} / ${pStr.hpMax}`);
ok(pVit.hpMax > base.hpMax + 400, '刀客加 30 体质 → 生命 +420', `${base.hpMax} → ${pVit.hpMax}`);
ok(pVit.atk < base.atk + 0.01, '加体质不改攻击');
const mBase = statsOf('mage', 20, {});
const mAll = statsOf('mage', 20, { int: 40 });
ok(mAll.atk > mBase.atk + 55, '术士加 40 灵力 → 术法攻击上升', `${mBase.atk.toFixed(1)} → ${mAll.atk.toFixed(1)}`);
ok(mAll.mpMax > mBase.mpMax + 200, '术士加灵力同时抬灵力上限');
ok(mAll.cdr > mBase.cdr, '术士灵力还带冷却缩减');
const st = pStr;
let nan = 0;
for (const k in st) if (typeof st[k] === 'number' && !isFinite(st[k])) nan++;
ok(nan === 0, '面板无 NaN / Infinity', nan);
ok(st.attrDerived && near(st.attrDerived.atk, pStr.str * 1.15), 'attrDerived 与面板同源');

/* ---------------- 4. 穿戴需求 ---------------- */
sec('4. 穿戴需求');
const w40 = rollItem(40, { slot: 'weapon', rarity: 'rare', cls: 'warrior' });
const c40 = rollItem(40, { slot: 'chest', rarity: 'rare', cls: 'warrior' });
const wr40 = reqAttrOf(w40, 'warrior');
const cr40 = reqAttrOf(c40, 'warrior');
ok(wr40.length >= 1 && wr40[0].key === 'str', '刀客武器要力量', JSON.stringify(wr40));
ok(cr40.some(r => r.key === 'vit'), '护甲要体质', JSON.stringify(cr40));
ok(!cr40.some(r => r.key === 'str'), '护甲不额外要力量（免得法系穿不上）', JSON.stringify(cr40));
ok(reqAttrOf(w40, 'mage').length === 0 || reqAttrOf(w40, 'mage')[0].key === 'int', '武器按穿戴者职业折算');

/* 品质越高越挑人 */
const mkChest = rar => { const it = rollItem(40, { slot: 'chest', rarity: rar, cls: 'warrior' }); return reqAttrOf(it, 'warrior'); };
const vitOf = list => (list.find(r => r.key === 'vit') || {}).need || 0;
const vitCommon = vitOf(mkChest('common'));
const vitRare = vitOf(mkChest('rare'));
const vitLegend = vitOf(mkChest('legendary'));
ok(vitCommon < vitRare && vitRare < vitLegend, '凡品 < 玄品 < 神品 的属性需求', `${vitCommon}/${vitRare}/${vitLegend}`);

/* 传世：多一条敏捷 */
const uItem = rollItem(40, { slot: 'chest', rarity: 'unique', cls: 'warrior' });
if (uItem && uItem.rarity === 'unique') {
  const ur = reqAttrOf(uItem, 'warrior');
  ok(ur.length >= 2 && ur.some(r => r.key === 'agi'), '传世额外要一条敏捷', JSON.stringify(ur));
  /* 传世目录件的 reqLv 是它自己的设计等级，和随机件不同级，不能直接比数值 ——
   * 用同 reqLv 的合成件对齐后再比 */
  const sameLv = lv => [
    reqAttrOf({ slot: 'chest', rarity: 'legendary', reqLv: lv, ilvl: lv }, 'warrior'),
    reqAttrOf({ slot: 'chest', rarity: 'unique', reqLv: lv, ilvl: lv }, 'warrior')
  ];
  const [leg, uni] = sameLv(40);
  const vitL = (leg.find(r => r.key === 'vit') || {}).need || 0;
  const vitU = (uni.find(r => r.key === 'vit') || {}).need || 0;
  ok(vitU > vitL, '同等级下传世比神品更挑人', `${vitU} > ${vitL}`);
}
/* 新手装备不设卡 */
const low = rollItem(2, { slot: 'weapon', rarity: 'legendary', cls: 'warrior' });
ok(reqAttrOf(low, 'warrior').length === 0, '1-3 级装备不设属性门槛', JSON.stringify(reqAttrOf(low, 'warrior')));

/* ---------------- 5. 单调性 ---------------- */
sec('5. 需求曲线');
let mono = true, prev = 0;
for (let lv = 5; lv <= 60; lv += 5) {
  const it = { slot: 'chest', rarity: 'rare', reqLv: lv, ilvl: lv };
  const need = (reqAttrOf(it, 'warrior').find(r => r.key === 'vit') || {}).need || 0;
  if (need < prev) mono = false;
  prev = need;
}
ok(mono, '护甲体质需求随等级单调不降');
const lvOkItem = { slot: 'weapon', rarity: 'rare', reqLv: 30, ilvl: 30 };
const gapAt20 = reqAttrOf(lvOkItem, 'warrior')[0].need;
ok(gapAt20 > 0 && gapAt20 % 5 === 0, '需求取整到 5 的倍数（好读）', gapAt20);

/* ---------------- 6. 判定 ---------------- */
sec('6. meetsItemReq / itemReqGap');
const need = reqAttrOf(lvOkItem, 'warrior')[0];
ok(meetsItemReq(lvOkItem, { str: need.need }, 'warrior'), '刚好够 → 可穿');
ok(!meetsItemReq(lvOkItem, { str: need.need - 1 }, 'warrior'), '差 1 点 → 不可穿');
const gap = itemReqGap(lvOkItem, { str: need.need - 8 }, 'warrior');
ok(gap.length === 1 && gap[0].need - gap[0].have === 8, 'gap 报出差额', JSON.stringify(gap));
ok(meetsItemReq({ slot: 'chest', rarity: 'common', reqLv: 1 }, {}, 'warrior'), '无需求装备恒可穿');

/* 面板属性直接接进判定：20 级刀客穿 20 级玄品武器要投点吗 */
const w20 = rollItem(20, { slot: 'weapon', rarity: 'rare', cls: 'warrior' });
const s20 = statsOf('warrior', 20, {});
const need20 = reqAttrOf(w20, 'warrior')[0];
console.log(`  20 级刀客：力量 ${Math.round(s20.str)}，玄品武器需求 ${need20.need}`);
ok(need20.need >= Math.round(s20.str) - 2, '同级玄品武器至少要求接近自然成长（不会形同虚设）');
ok(need20.need <= Math.round(s20.str) + 20, '但也不至于要投几十点（加点空间够）');

console.log('\n' + (fail === 0 ? `✓ 全部通过  ${pass} 通过 / 0 失败`
  : `✗ ${fail} 项失败  /  ${pass} 通过`));
process.exit(fail ? 1 : 0);
