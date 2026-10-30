/* ============================================================
 * 技能 P3c 契约（其一）：元素词缀统一口径（node 直跑，不开浏览器）
 *
 *   node dev/test-elem-affix.js
 *
 * 方案 §6.5 拍板：装备词缀统一改为「元素伤害 +X%」（全元素通用），
 * 老档的「火伤 +20%」按 1:1 折算，不削弱。
 *
 * 这一节钉六件事：
 *   1. 属性表里有 elemDmg，旧四键只剩「折算入口」的身份（不再掉落）；
 *   2. 词缀池里彻底没有旧键，且 elemDmg 三阶齐全、数值区间与原元素族一致；
 *   3. 折算真的跑在 `STATS[key]` 过滤**之前**（否则老词缀会被当脏数据丢掉）；
 *   4. 折算口径是**相加**、合并成一条，且**不碰 implicit / uniqueStats**（那是专属身份）；
 *   5. 结算走 `elemAffixMul`：通用 × 专属叠乘，不再有第二处直读 `ELEM_AFFIX`；
 *   6. 面板与说明页跟得上（有「元素伤害」行、写清 1:1 与叠乘、不再写「注入还没做」）。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const STATS = pick('STATS');
const AFFIXES = pick('AFFIXES');
const AFFIX_SLOT_ALLOW = pick('AFFIX_SLOT_ALLOW');
const affixPool = pick('affixPool');
const makeAffix = pick('makeAffix');
const foldElemAffixes = pick('foldElemAffixes');
const normalizeItem = pick('normalizeItem');
const LEGACY_ELEM_KEYS = pick('LEGACY_ELEM_KEYS');
const TRIAL_BLESSINGS = pick('TRIAL_BLESSINGS');
const BUILDS = pick('BUILDS');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gm = readSrc('src/game.js');
const itemsJs = readSrc('src/items.js');
const uiJs = readSrc('src/ui.js');
const itemsData = readSrc('src/data/data-items.js');
const elemData = readSrc('src/data/data-elem.js');

const OLD = ['fireDmg', 'iceDmg', 'lightningDmg', 'poisonDmg'];

/* ============================================================
 * 一、属性表
 * ============================================================ */
console.log('一、属性表');
ok(!!STATS.elemDmg, '有统一的 elemDmg 键');
ok(STATS.elemDmg && STATS.elemDmg.pct === true, 'elemDmg 是百分比属性（+X%）');
ok(STATS.elemDmg && STATS.elemDmg.label === '元素伤害', 'label 是「元素伤害」', STATS.elemDmg && STATS.elemDmg.label);
{
  /* 旧键**必须留着**：normalizeItem 的折算发生在 `STATS[key]` 过滤之前，
   * 表里没有它们的话，老装备的元素词缀会在折算之前就被当脏数据扔掉 —— 玩家资产消失。 */
  const alive = OLD.filter(k => STATS[k]);
  ok(alive.length === 4, '旧四键仍在属性表里（折算的入口，删了就丢玩家资产）', alive);
  ok(OLD.every(k => STATS[k] && STATS[k].legacy === true), '旧四键标了 legacy: true（不再掉落，只用来折算）');
  ok(OLD.every(k => STATS[k] && !STATS[k].legacy !== false) === false, '（同上，反向确认标记真的存在）');
}
ok(!!STATS.sigilDmg && STATS.sigilDmg.label === '符法伤害', '符法伤害仍是独立键（专属来源，不进词缀池）');

/* ============================================================
 * 二、词缀池
 * ============================================================ */
console.log('二、词缀池');
{
  const bad = AFFIXES.filter(a => OLD.indexOf(a.key) >= 0);
  ok(bad.length === 0, '词缀池里**一条旧键都没有**（不再掉落火伤 / 冰伤…）', bad.map(a => a.key));

  const un = AFFIXES.filter(a => a.key === 'elemDmg');
  ok(un.length === 3, 'elemDmg 三阶齐全（一 / 二 / 三阶各一条）', un.map(a => a.tier));
  ok(un.map(a => a.tier).sort().join(',') === '1,2,3', 'tier 恰好是 1 / 2 / 3', un.map(a => a.tier));
  /* 数值区间必须与原来的元素族完全一致，否则等于偷偷改了掉落强度 */
  const want = { 1: [4, 10], 2: [9, 19], 3: [16, 30] };
  const badRange = un.filter(a => !want[a.tier] || a.min !== want[a.tier][0] || a.max !== want[a.tier][1]);
  ok(badRange.length === 0, '三阶数值区间与原元素族一致（4~10 / 9~19 / 16~30）',
    un.map(a => a.tier + ':' + a.min + '~' + a.max));

  ok(AFFIX_SLOT_ALLOW.fate.indexOf('elemDmg') >= 0, '命格白名单里有 elemDmg');
  ok(!OLD.some(k => AFFIX_SLOT_ALLOW.fate.indexOf(k) >= 0), '命格白名单里没有旧键', AFFIX_SLOT_ALLOW.fate);
  const fatePool = affixPool('warrior', 'fate');
  ok(fatePool.some(a => a.key === 'elemDmg'), '命格词缀池里能取到 elemDmg');
  ok(fatePool.length >= 10, '命格池没有被削到枯竭线以下（>= 10）', fatePool.length);
}
{
  /* 真滚 300 次：不许滚出旧键 */
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const a = makeAffix(40, new Set(), 'mage', 'chest');
    if (a) seen.add(a.key);
  }
  ok(!OLD.some(k => seen.has(k)), '滚 300 次没有一次滚出旧键', Array.from(seen).filter(k => OLD.indexOf(k) >= 0));
  ok(seen.has('elemDmg'), '滚得到 elemDmg', Array.from(seen).slice(0, 8));
}

/* ============================================================
 * 三、折算（旧档 → 统一键）
 * ============================================================ */
console.log('三、折算');
{
  const one = foldElemAffixes([{ key: 'fireDmg', val: 20, q: 2 }]);
  ok(one.length === 1 && one[0].key === 'elemDmg' && one[0].val === 20, '火伤 20 → 元素伤害 20（1:1）', one);
  ok(one[0].q === 2, '品质 q 保留', one[0]);

  const two = foldElemAffixes([{ key: 'fireDmg', val: 20 }, { key: 'iceDmg', val: 10 }]);
  ok(two.length === 1, '火 20 + 冰 10 合并成**一条**（两条会让洗练面板出现两个「元素伤害」）', two);
  ok(two[0].val === 30, '折算口径是**相加**（20 + 10 = 30）', two[0]);

  const mix = foldElemAffixes([
    { key: 'fireDmg', val: 12 }, { key: 'crit', val: 5 }, { key: 'poisonDmg', val: 8 }
  ]);
  ok(mix.length === 2, '只折元素键，其它词缀原样保留', mix.map(a => a.key));
  ok(mix.some(a => a.key === 'crit' && a.val === 5), 'crit 一个数都没动', mix);
  ok(mix.find(a => a.key === 'elemDmg').val === 20, '火 12 + 毒 8 = 20', mix);

  ok(foldElemAffixes([{ key: 'crit', val: 5 }]).length === 1, '没有元素键时是恒等变换');
  ok(foldElemAffixes(null) === null, '空值不炸');
}
{
  /* 折算必须**在** STATS 过滤之前跑：否则老词缀先被当脏数据扔掉，玩家资产消失 */
  const iFold = itemsJs.indexOf('foldElemAffixes(item.affixes)');
  const iFilter = itemsJs.indexOf("item.affixes.filter(a => a && typeof a.key === 'string' && STATS[a.key]");
  ok(iFold > 0 && iFilter > 0 && iFold < iFilter,
    'affixes 的折算在 STATS 过滤**之前**（顺序反了就是静默删玩家装备）', { fold: iFold, filter: iFilter });
  ok(/item\.fixed = foldElemAffixes\(item\.fixed\);/.test(itemsJs), 'fixed（固定词条）也折算');
  /* 反向断言：implicit / uniqueStats 不许折 —— 命格的元素身份、传世的元素倾向是设计 */
  ok(!/foldElemAffixes\([^)]*implicit/.test(itemsJs), '**implicit 不折算**（命格「流火格」就该只加火）');
  ok(!/foldElemAffixes\([^)]*uniqueStats/.test(itemsJs), '**uniqueStats 不折算**（传世的元素倾向是身份）');
}
{
  /* 端到端：一件老装备过一遍 normalizeItem */
  const it = normalizeItem({
    slot: 'chest', rarity: 'common', ilvl: 30, affixCls: null,
    affixes: [{ key: 'fireDmg', val: 20 }, { key: 'iceDmg', val: 10 }, { key: 'crit', val: 3 }],
    fixed: [], sockets: 0, runes: []
  });
  const keys = it.affixes.map(a => a.key);
  ok(keys.indexOf('elemDmg') >= 0, 'normalizeItem 之后有 elemDmg', keys);
  ok(!OLD.some(k => keys.indexOf(k) >= 0), 'normalizeItem 之后旧键全部消失', keys);
  const v = it.affixes.find(a => a.key === 'elemDmg').val;
  ok(v === 30, '折完的值是 30（不是 20 也不是 60）', v);
  ok(keys.indexOf('crit') >= 0, '其它词缀没被顺手删掉', keys);
}

/* ============================================================
 * 四、结算：两条通道叠乘
 * ============================================================ */
console.log('四、结算');
{
  const mul = pick('elemAffixMul');
  const st = { elemDmg: 20, fireDmg: 0, iceDmg: 0, lightningDmg: 0, poisonDmg: 0, sigilDmg: 0 };
  ok(Math.abs(mul(st, 'fire') - 1.2) < 1e-9, '元素伤害 20% → 火伤 ×1.20', mul(st, 'fire'));
  ok(Math.abs(mul(st, 'ice') - 1.2) < 1e-9, '同一个 20% 也作用在冰上（全元素通用）', mul(st, 'ice'));
  ok(Math.abs(mul(st, 'sigil') - 1.2) < 1e-9, '符法同样吃元素伤害', mul(st, 'sigil'));
  ok(mul(st, 'phys') === 1, '物理不吃元素词条（没有元素语义）', mul(st, 'phys'));
  ok(mul(st, 'none') === 1, 'none 不吃（护盾吸收这类无元素伤害）', mul(st, 'none'));

  const st2 = { elemDmg: 20, fireDmg: 30, iceDmg: 0, lightningDmg: 0, poisonDmg: 0, sigilDmg: 0 };
  ok(Math.abs(mul(st2, 'fire') - 1.2 * 1.3) < 1e-9, '通用 20% × 专属 30% **叠乘**（不是相加）', mul(st2, 'fire'));
  ok(Math.abs(mul(st2, 'ice') - 1.2) < 1e-9, '专属那条只对火生效，冰只吃通用的 20%', mul(st2, 'ice'));

  ok(mul({}, 'fire') === 1, '空属性表不炸');
  ok(mul(null, 'fire') === 1, 'null 不炸');
}
{
  /* 口径唯一：不许再有第二处直读 ELEM_AFFIX 去算增伤 */
  const direct = gm.match(/st\[ELEM_AFFIX\[/g) || [];
  ok(direct.length === 0, 'damageEnemy 不再直读 `st[ELEM_AFFIX[...]]`（口径分裂的源头）', direct.length);
  ok(/final \*= elemAffixMul\(st, elem\);/.test(gm), 'damageEnemy 的元素增伤走 elemAffixMul');
  ok(/elemAffixMul\(this\.state\.stats, key\)/.test(gm), 'elemHitMul（注入分段结算）也走 elemAffixMul');
  ok(/const ELEM_AFFIX_EX = \{/.test(elemData), '有「元素专属」第二条通道 ELEM_AFFIX_EX');
}

/* ============================================================
 * 五、面板与说明页
 * ============================================================ */
console.log('五、面板与说明页');
ok(/atk\.push\(\['元素伤害', P\('elemDmg'\)\]\)/.test(uiJs), '道途面板有「元素伤害」一行');
ok(/atk\.push\(\['火焰伤害', P\('fireDmg'\)\]\)/.test(uiJs), '专属通道也有行（高压 / 毒经 加了看不见等于没加）');
ok(/atk\.push\(\['符法伤害', P\('sigilDmg'\)\]\)/.test(uiJs), '符法伤害有行');
ok(/1:1/.test(uiJs), '说明页写清老档 1:1 折算');
ok(/叠乘/.test(uiJs), '说明页写清通用 × 专属是叠乘');
ok(!/元素注入还没做/.test(uiJs), '**说明页不再写「元素注入还没做」**（P3b 已经落地了）');
ok(/row\('元素注入'/.test(uiJs), '说明页有「元素注入」一行');

/* ============================================================
 * 六、其它数据源不落队
 * ============================================================ */
console.log('六、其它数据源');
{
  const bless = TRIAL_BLESSINGS.find(b => b.id === 'elem');
  ok(bless && bless.stats.elemDmg === 14, '试炼祝福「五行归一」用一个 elemDmg 14（不再是四个键各 14）', bless && bless.stats);
  const bad = BUILDS.filter(b => b.stats && OLD.some(k => b.stats[k] !== undefined));
  ok(bad.length === 0, '推荐流派的属性建议里没有旧键', bad.map(b => b.id));
  ok(BUILDS.filter(b => b.stats && b.stats.elemDmg).length >= 4, '四套元素 BD 都改成了 elemDmg', 
    BUILDS.filter(b => b.stats && b.stats.elemDmg).map(b => b.id));
  ok(!/key: 'fireDmg'/.test(itemsData) && !/key: 'iceDmg'/.test(itemsData), 'data-items 的词缀表里没有旧键');
}

/* ============================================================
 * 七、反向断言：别把统一做成削弱
 * ============================================================ */
console.log('七、不削弱');
ok(LEGACY_ELEM_KEYS && Object.keys(LEGACY_ELEM_KEYS).length === 4, '折算表恰好四个旧键（不多不少）', Object.keys(LEGACY_ELEM_KEYS || {}));
ok(!/Math\.min|Math\.max|CLAMP/.test(String(foldElemAffixes).slice(0, 900)),
  '折算里没有任何削顶 / 打折（1:1 就是 1:1）');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3c 元素词缀契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
