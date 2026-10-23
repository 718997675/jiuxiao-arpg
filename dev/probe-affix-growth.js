/* ============================================================
 * v1.1.8 词条数量成长 + 稀有词条惊喜验证
 *
 *   node dev/probe-affix-growth.js
 *
 * 不变量：
 *   1. 同一品质下，等级越高固定 / 可洗词条越多，且单调不回退
 *   2. 传世在任意等级都是词条最多的品质
 *   3. 任何品质掉落都可能额外带一条 tier 3 稀有词条（凡品也能爆）
 *   4. 稀有词条不占强化名额、不破坏同装备去重
 *   5. 低等级（<=11）保持 v1.1.7 的旧条数，不倒退
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
const rollItem = pick('rollItem');
const enhanceItem = pick('enhanceItem');
const affixLevelBonus = pick('affixLevelBonus');
const fixedAffixCount = pick('fixedAffixCount');
const FORGE = pick('FORGE');

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); } };
const head = t => console.log('\n== ' + t + ' ==');
const SAMPLE = 400;

/* ---- 1. 成长曲线 ---- */
head('等级成长表');
{
  const lv = [1, 8, 11, 12, 16, 25, 30, 32, 40];
  const rows = lv.map(l => {
    const b = affixLevelBonus(l);
    return `${l}:固定+${b.fixed}/可洗+${b.wash}`;
  });
  console.log('  ' + rows.join('  '));
  ok(affixLevelBonus(1).fixed === 0 && affixLevelBonus(1).wash === 0, '1 级无成长');
  ok(affixLevelBonus(11).fixed === 0, '11 级固定仍无成长');
  ok(affixLevelBonus(12).fixed === 1, '12 级固定 +1');
  ok(affixLevelBonus(16).wash === 1, '16 级可洗 +1');
  ok(affixLevelBonus(30).fixed === 2, '30 级固定 +2');
  ok(affixLevelBonus(32).wash === 2, '32 级可洗 +2');
  /* 单调不回退 */
  let mono = true, prev = null;
  for (let l = 1; l <= 40; l++) {
    const b = affixLevelBonus(l);
    if (prev && (b.fixed < prev.fixed || b.wash < prev.wash)) mono = false;
    prev = b;
  }
  ok(mono, '1~40 级成长单调不回退');
}

/* ---- 2. 实际条数随等级上升 ---- */
head('实际掉落条数（神兵，各等级 '.concat(SAMPLE, ' 件均值)'));
{
  const stat = lv => {
    let f = 0, w = 0, n = 0;
    for (let i = 0; i < SAMPLE; i++) {
      const it = rollItem(lv, { rarity: 'legendary', cls: 'warrior', slot: 'chest' });
      if (it.rarity !== 'legendary') continue;
      f += (it.fixed || []).length;
      w += (it.affixes || []).filter(a => a && !a.rare).length;
      n++;
    }
    return { fixed: f / n, wash: w / n, n };
  };
  const a = stat(5), b = stat(20), c = stat(40);
  console.log(`  5 级  固定 ${a.fixed.toFixed(2)} / 可洗 ${a.wash.toFixed(2)}`);
  console.log(`  20 级 固定 ${b.fixed.toFixed(2)} / 可洗 ${b.wash.toFixed(2)}`);
  console.log(`  40 级 固定 ${c.fixed.toFixed(2)} / 可洗 ${c.wash.toFixed(2)}`);
  ok(a.fixed === 3 && a.wash === 4, '5 级神兵 = 3 固定 + 4 可洗（与旧版一致）');
  ok(b.fixed > a.fixed && b.wash > a.wash, '20 级比 5 级多');
  ok(c.fixed > b.fixed && c.wash >= b.wash, '40 级比 20 级多');
  ok(c.fixed === 5 && c.wash === 6, '40 级神兵 = 5 固定 + 6 可洗');
}

/* ---- 3. 全品质对比：传世最多 ---- */
head('40 级各品质词条总数');
{
  const total = rar => {
    let sum = 0, n = 0;
    for (let i = 0; i < SAMPLE; i++) {
      const it = rollItem(40, { rarity: rar, cls: 'warrior', slot: 'chest' });
      if (it.rarity !== rar) continue;
      sum += (it.fixed || []).length + (it.affixes || []).filter(a => a && !a.rare).length;
      n++;
    }
    return n ? sum / n : 0;
  };
  const res = {};
  for (const r of Object.keys(RARITY)) res[r] = total(r);
  console.log('  ' + Object.keys(res).map(k => `${RARITY[k].name} ${res[k].toFixed(1)}`).join(' | '));
  const uni = res.unique, leg = res.legendary;
  ok(uni > 0, '传世有词条', uni);
  ok(uni > leg, '传世词条多于神兵', `${uni.toFixed(1)} vs ${leg.toFixed(1)}`);
  /* 传世必须是全场最多 */
  let max = 0, maxKey = '';
  for (const k of Object.keys(res)) if (res[k] > max) { max = res[k]; maxKey = k; }
  ok(maxKey === 'unique', '传世是词条总数最多的品质', maxKey + ' ' + max.toFixed(1));
  /* 凡品在 40 级也应有固定词条（等级成长） */
  ok(res.common > 0, '40 级凡品也有词条（等级成长）', res.common.toFixed(1));
}

/* ---- 4. 稀有词条概率与分布 ---- */
head('稀有词条惊喜');
{
  const N = 4000;
  for (const rar of ['common', 'magic', 'rare', 'legendary']) {
    let hit = 0, tier3 = 0, dup = 0;
    for (let i = 0; i < N; i++) {
      const it = rollItem(25, { rarity: rar, cls: 'warrior', slot: 'chest' });
      const rares = (it.affixes || []).filter(a => a && a.rare);
      if (rares.length) {
        hit++;
        for (const r of rares) if (r.tier === 3) tier3++;
      }
      const all = [].concat(it.fixed || [], it.affixes || []).map(a => a.key);
      if (new Set(all).size !== all.length) dup++;
    }
    const p = hit / N;
    console.log(`  ${RARITY[rar].name}: 出稀有 ${(p * 100).toFixed(1)}%`);
    ok(p > 0.06 && p < 0.19, `${RARITY[rar].name} 稀有词条概率约 12%`, (p * 100).toFixed(1) + '%');
    ok(tier3 === hit, `${RARITY[rar].name} 稀有词条都是 tier 3`, `${tier3}/${hit}`);
    ok(dup === 0, `${RARITY[rar].name} 稀有词条不破坏去重`, dup);
  }
  ok(FORGE.rareAffixChance === 0.12, '稀有概率来自 FORGE 配置', FORGE.rareAffixChance);
}

/* ---- 5. 稀有词条不占强化名额 ---- */
head('稀有词条与强化名额');
{
  const it = rollItem(20, { rarity: 'magic', cls: 'warrior', slot: 'chest' });
  /* 手动塞一条稀有词条，模拟掉落 */
  it.affixes.push({ key: 'lifesteal', val: 2, pre: '饮血的', suf: '· 饮血', tier: 3, q: 1, rare: true });
  const before = it.affixes.filter(a => a && !a.rare).length;
  let added = 0;
  for (let i = 0; i < FORGE.enhanceMax; i++) { if (enhanceItem(it)) added++; }
  ok(added === FORGE.enhanceMax, '强化名额不受稀有词条影响', `加了 ${added} 条`);
  ok(it.affixes.filter(a => a && !a.rare).length === before + added, '常规词条数 = 原有 + 强化数');
  ok(it.affixes.filter(a => a && a.rare).length === 1, '稀有词条原样保留');
  ok(!enhanceItem(it), '强化次数用尽后拒绝');
}

/* ---- 6. 低等级不倒退 ---- */
head('低等级兼容');
{
  for (const rar of ['magic', 'rare', 'legendary', 'set']) {
    const it = rollItem(5, { rarity: rar, cls: 'mage', slot: 'helm' });
    ok((it.fixed || []).length === RARITY[rar].fixed, `5 级 ${RARITY[rar].name} 固定条数 = 旧值 ${RARITY[rar].fixed}`, it.fixed.length);
  }
  /* fixedAffixCount 与 rollItem 结果一致 */
  const it = rollItem(35, { rarity: 'rare', cls: 'taoist', slot: 'boots' });
  ok(fixedAffixCount(it) === it.fixed.length, 'fixedAffixCount 与实际条数一致',
    `${fixedAffixCount(it)} vs ${it.fixed.length}`);
}

console.log('\n============================');
console.log('  通过 ' + pass + ' / ' + (pass + fail));
if (fail) { console.log('  失败 ' + fail); process.exit(1); }
console.log('  全部通过');
