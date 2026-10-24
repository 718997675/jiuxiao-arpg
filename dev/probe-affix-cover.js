/* 探针：哪些词缀 key 滚不出来，卡在哪个池子 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math, Set, Map, JSON, Object };
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
load('data/data-core.js');
load('data/data-icons.js');
load('data/data-items.js');
load('data/data-uniques.js');
load('data/data-relics.js');
load('data/data-skills.js');
load('items.js');
const pick = n => vm.runInContext(n, ctx);
const AFFIXES = pick('AFFIXES');
const affixPool = pick('affixPool');
const rollItem = pick('rollItem');
const AFFIX_SLOT_GROUP = pick('AFFIX_SLOT_GROUP');
const AFFIX_SLOT_DENY = pick('AFFIX_SLOT_DENY');

const hit = new Set();
for (let i = 0; i < 20000; i++) {
  const it = rollItem(1 + Math.floor(Math.random() * 40));
  for (const a of (it.affixes || [])) hit.add(a.key);
  for (const a of (it.fixed || [])) hit.add(a.key);
}
const keys = [...new Set(AFFIXES.map(a => a.key))];
const miss = keys.filter(k => !hit.has(k));
console.log('词缀条目 ' + AFFIXES.length + ' · 唯一 key ' + keys.length + ' · 未覆盖 ' + miss.length);
for (const k of miss) {
  const defs = AFFIXES.filter(a => a.key === k);
  const tiers = defs.map(d => 'T' + d.tier).join(',');
  const reach = [];
  for (const cls of [null, 'warrior', 'mage', 'taoist']) {
    for (const g of Object.keys(AFFIX_SLOT_GROUP)) {
      const slots = Object.keys(AFFIX_SLOT_GROUP).filter(s => AFFIX_SLOT_GROUP[s] === g);
      const inPool = affixPool(cls, slots[0]).some(a => a.key === k);
      if (inPool) reach.push((cls || 'uni') + ':' + g);
    }
  }
  console.log('  ✗ ' + k + ' [' + tiers + '] 可入池: ' + (reach.length ? [...new Set(reach)].join(' ') : '无'));
}
console.log('\n槽位分组：' + JSON.stringify(AFFIX_SLOT_GROUP));
console.log('槽位禁用：' + JSON.stringify(AFFIX_SLOT_DENY));
