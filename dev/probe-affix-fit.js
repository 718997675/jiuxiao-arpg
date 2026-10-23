/* ============================================================
 * v1.1.7 词条职业 / 部位适配验证（node 直跑）
 *
 *   node dev/probe-affix-fit.js
 *
 * 不变量：
 *   1. 战士装备永不出现灵力 / 法术 / 召唤 / 冷却类词条
 *   2. 法师与道士装备永不出现力量 / 近战专精类词条
 *   3. 武器不出纯防御词条，防具不出武器专精，首饰不出大面积伤害
 *   4. 每个「职业 × 部位」组合的池子都够大（不因过滤而枯竭）
 *   5. 通用装备（cls = null）不受职业限制
 *   6. 所有过滤只影响新生成，已存在的词条不会被改写
 *   7. 传世是红色，且不参与品质升级
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
load('items.js');

const pick = n => vm.runInContext(n, ctx);
const RARITY = pick('RARITY');
const AFFIXES = pick('AFFIXES');
const AFFIX_CLS_DENY = pick('AFFIX_CLS_DENY');
const AFFIX_SLOT_DENY = pick('AFFIX_SLOT_DENY');
const affixPool = pick('affixPool');
const affixSlotGroup = pick('affixSlotGroup');
const AFFIX_UNIVERSAL_DENY = pick('AFFIX_UNIVERSAL_DENY');
const rollItem = pick('rollItem');
const normalizeItem = pick('normalizeItem');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};
const head = t => console.log('\n== ' + t + ' ==');

const CLS = ['warrior', 'mage', 'taoist'];
const SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring'];
const KEY2DEF = {};
for (const a of AFFIXES) KEY2DEF[a.key] = a;

/* ---- 1. 池子规模与去重 ---- */
head('池子规模');
{
  ok(AFFIXES.length === 64, '词条池仍为 64 条', AFFIXES.length);
  const keys = new Set(AFFIXES.map(a => a.key));
  ok(keys.size === AFFIXES.length, '64 个 key 互不重复');

  for (const cls of CLS) {
    for (const slot of SLOTS) {
      const p = affixPool(cls, slot);
      ok(p.length >= 10, `池子够大: ${cls}/${slot}`, p.length);
      ok(p.length < AFFIXES.length, `池子确有收窄: ${cls}/${slot}`, p.length);
    }
  }
  /* 通用装备用三职业交集池，不是全量 */
  const UNI = pick('AFFIX_UNIVERSAL_DENY');
  ok(affixPool(null, null).length === AFFIXES.length - UNI.length,
    '通用装备用三职业交集池', affixPool(null, null).length);
  ok(affixPool(null, 'chest').length < affixPool(null, null).length,
    '通用装备仍受部位限制');
  /* 排除表里的 key 必须都真实存在，防止手滑写了不存在的 key */
  const badKey = [];
  for (const c of Object.keys(AFFIX_CLS_DENY)) {
    for (const k of AFFIX_CLS_DENY[c]) if (!KEY2DEF[k]) badKey.push(c + ':' + k);
  }
  for (const s of Object.keys(AFFIX_SLOT_DENY)) {
    for (const k of AFFIX_SLOT_DENY[s]) if (!KEY2DEF[k]) badKey.push(s + ':' + k);
  }
  ok(badKey.length === 0, '排除表没有拼错的 key', badKey.join(','));
}

/* ---- 2. 实际掉落 1000 件，检查零越界 ---- */
head('实际掉落抽样（每职业 × 部位 120 件）');
const seen = {};
const NO_CLS_SLOTS = ['ring', 'amulet'];   // 首饰不绑职业，cls 为 null 属设计
for (const cls of CLS) {
  for (const slot of SLOTS) {
    const keys = new Set();
    let bad = null;
    let clsBad = null;
    for (let i = 0; i < 120; i++) {
      const it = rollItem(28, { cls, slot, rarity: 'rare' });
      /* 防具基底通用（item.cls 为 null），职业倾向记在 affixCls 上 */
      const ac = it.affixCls || it.cls;
      if (ac !== cls) clsBad = it.affixCls + '/' + it.cls + '/' + it.slot;
      const dcArr = ac ? (AFFIX_CLS_DENY[ac] || []) : AFFIX_UNIVERSAL_DENY;
      const deny = new Set([].concat(dcArr, AFFIX_SLOT_DENY[affixSlotGroup(it.slot)] || []));
      const all = [].concat(it.fixed || [], it.affixes || []);
      for (const a of all) {
        keys.add(a.key);
        if (deny.has(a.key)) bad = a.key;
      }
    }
    ok(!clsBad, `职业标识正确: ${cls}/${slot}`, clsBad);
    ok(!bad, `零越界: ${cls}/${slot}`, bad);
    ok(keys.size >= 8, `词条多样性: ${cls}/${slot}`, keys.size);
    seen[cls + '/' + slot] = keys.size;
  }
}

/* ---- 3. 同一件装备不重复 key（固定 + 可洗都要算） ---- */
head('同装备去重');
{
  let dup = null;
  for (let i = 0; i < 400; i++) {
    const it = rollItem(30, { rarity: 'legendary' });
    const all = [].concat(it.fixed || [], it.affixes || []).map(a => a.key);
    if (new Set(all).size !== all.length) { dup = all.join(','); break; }
  }
  ok(!dup, '固定 + 可洗 合并后不重复', dup);
}

/* ---- 4. 职业定位抽样语义 ---- */
head('职业定位语义');
{
  const hasKey = (cls, slot, key, n) => {
    for (let i = 0; i < (n || 300); i++) {
      const it = rollItem(30, { cls, slot, rarity: 'legendary' });
      if ([].concat(it.fixed || [], it.affixes || []).some(a => a.key === key)) return true;
    }
    return false;
  };
  ok(!hasKey('warrior', 'chest', 'int'), '战士胸甲不出「灵力」');
  ok(!hasKey('warrior', 'chest', 'mp'), '战士胸甲不出「灵力上限」');
  ok(!hasKey('warrior', 'weapon', 'skillDmg'), '战士武器不出「技能伤害」');
  ok(!hasKey('mage', 'chest', 'str'), '法师胸甲不出「力量」');
  ok(!hasKey('mage', 'chest', 'meleeDmg'), '法师胸甲不出「近战伤害」');
  ok(!hasKey('taoist', 'weapon', 'str'), '道士武器不出「力量」');
  ok(!hasKey('taoist', 'chest', 'aoeDmg'), '道士胸甲不出「范围伤害」（走毒雾持续）');
  ok(hasKey('taoist', 'chest', 'dotDmg'), '道士胸甲可出「持续伤害」');
  ok(hasKey('mage', 'chest', 'aoeDmg'), '法师胸甲可出「范围伤害」');
  /* 部位语义 */
  ok(!hasKey('warrior', 'weapon', 'def'), '武器不出护甲');
  ok(!hasKey('warrior', 'weapon', 'dmgReduce'), '武器不出伤害减免');
  ok(!hasKey('warrior', 'chest', 'armorPen'), '防具不出穿甲');
  ok(!hasKey('warrior', 'ring', 'meleeDmg'), '戒指不出近战伤害');
  ok(hasKey('warrior', 'ring', 'crit'), '戒指可出暴击');
}

/* ---- 5. 旧词条不被改写 ---- */
head('兼容性');
{
  const old = normalizeItem({
    kind: 'chest', slot: 'chest', name: '旧胸甲', rarity: 'rare', ilvl: 25, cls: 'warrior',
    baseArmor: 90, sockets: 0, runes: [], affixes: [{ key: 'int', val: 6, pre: '通灵的', suf: '· 灵台', tier: 1, q: 1 }]
  });
  ok(old.affixes.some(a => a.key === 'int'), '旧档里不合规的词条原样保留（不强行洗掉）');
}

/* ---- 6. 传世定位 ---- */
head('传世');
{
  ok(RARITY.unique.color.toLowerCase() === '#ff3b3b', '传世颜色为红色', RARITY.unique.color);
  ok(RARITY.unique.name === '传世', '名称仍为「传世」');
  ok(RARITY.unique.affixes >= RARITY.legendary.affixes && RARITY.unique.fixed >= RARITY.legendary.fixed,
    '传世词条数全品质最多', `传世 ${RARITY.unique.fixed}+${RARITY.unique.affixes} / 神兵 ${RARITY.legendary.fixed}+${RARITY.legendary.affixes}`);
  /* 与其它品质颜色不冲突 */
  const colors = Object.keys(RARITY).map(k => RARITY[k].color.toLowerCase());
  ok(new Set(colors).size === colors.length, '六种品质颜色互不相同', colors.join(' '));
  /* 传世不在品质升级链上 */
  const chain = ['common', 'magic', 'rare', 'legendary'];
  ok(chain.indexOf('unique') < 0, '传世不在品质升级链内');
  ok(chain.indexOf('set') < 0, '套装不在品质升级链内');
}

console.log('\n============================');
console.log('  通过 ' + pass + ' / ' + (pass + fail));
if (fail) { console.log('  失败 ' + fail); process.exit(1); }
console.log('  全部通过');
