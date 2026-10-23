/* 难度表数值验证：检查四档系数完整、单调，并按真实公式算出怪物实际数值 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../src/data/data-core.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\n;__out={DIFFS,DIFF_ORDER,getDiff,DEFAULT_DIFF,MONSTERS_KEYS:null};', ctx);
const { DIFFS, DIFF_ORDER, getDiff, DEFAULT_DIFF } = ctx.__out;

const NUM = ['mobHp','mobDmg','mobSpd','taken','xp','gold','drop','rune','elite','aggro','deathPenalty'];
let fail = 0;
const err = m => { console.log('  [FAIL] ' + m); fail++; };

console.log('\n  难度系统验证');
console.log('  ' + '='.repeat(72));

/* 1. 结构完整性 */
if (DIFF_ORDER.length !== 4) err('DIFF_ORDER 应为 4 档，实际 ' + DIFF_ORDER.length);
for (const k of DIFF_ORDER) {
  const d = DIFFS[k];
  if (!d) { err('缺少难度 ' + k); continue; }
  for (const f of NUM) if (typeof d[f] !== 'number') err(`${k}.${f} 不是数字`);
  if (!d.name || !d.desc || !d.color) err(k + ' 缺少 name/desc/color');
}
console.log('  1) 四档结构完整: ' + (fail === 0 ? 'PASS' : 'FAIL'));

/* 2. 单调性：难度越高，怪越强、收益越高 */
const mono = ['mobHp','mobDmg','mobSpd','taken','xp','gold','drop','rune','elite','aggro','deathPenalty'];
let monoOk = true;
for (const f of mono) {
  const vals = DIFF_ORDER.map(k => DIFFS[k][f]);
  for (let i = 1; i < vals.length; i++) {
    if (!(vals[i] >= vals[i-1])) { monoOk = false; err(`${f} 非单调: ${vals.join(' -> ')}`); }
  }
}
console.log('  2) 系数随难度单调递增: ' + (monoOk ? 'PASS' : 'FAIL'));

/* 3. 极端值合理性 */
const n = DIFFS.nightmare, v = DIFFS.novice;
if (n.mobHp / v.mobHp < 2) err('新手/极难 血量差距过小');
if (n.deathPenalty > 0.5) err('极难死亡惩罚过高');
if (v.deathPenalty !== 0) err('新手不应有死亡惩罚');
console.log('  3) 极端档位合理: ' + (n.mobHp / v.mobHp).toFixed(2) + 'x 血量跨度');

/* 4. 按真实公式算怪物实际数值 */
function spawnStats(diffKey, base, lvl, elite) {
  const D = DIFFS[diffKey];
  let hp = base.hp * (1 + lvl * 0.48);
  if (elite) hp *= 2.1;
  hp *= D.mobHp;
  const dmg = base.atk * (1 + lvl * 0.18) * (elite ? 1.3 : 1) * D.mobDmg;
  return { hp, dmg, spd: base.spd * D.mobSpd };
}
const base = { hp: 60, atk: 10, spd: 3 };
console.log('\n  ' + '-'.repeat(72));
console.log('  样本怪（基础 hp60 atk10 spd3，地图等级 3）实际数值：');
console.log('  ' + '-'.repeat(72));
console.log('  难度        血量      伤害     移速     受伤倍率  经验    死亡罚金');
console.log('  ' + '-'.repeat(72));
for (const k of DIFF_ORDER) {
  const D = DIFFS[k], s = spawnStats(k, base, 3, false);
  console.log('  ' + (D.name + '        ').slice(0, 10) +
    String(s.hp.toFixed(0)).padStart(6) +
    String(s.dmg.toFixed(1)).padStart(9) +
    String(s.spd.toFixed(2)).padStart(8) +
    String('x' + D.taken.toFixed(2)).padStart(10) +
    String('x' + D.xp.toFixed(2)).padStart(8) +
    String((D.deathPenalty * 100).toFixed(0) + '%').padStart(10));
}
console.log('  ' + '-'.repeat(72));

/* 5. 精英与元素机制 */
const mech = [];
mech.push(['精英概率', DIFF_ORDER.map(k => DIFFS[k].name + ' ' + (DIFFS[k].elite * 100).toFixed(0) + '%').join(' / ')]);
mech.push(['索敌半径', DIFF_ORDER.map(k => DIFFS[k].name + ' x' + DIFFS[k].aggro).join(' / ')]);
mech.push(['元素附魔', DIFF_ORDER.map(k => DIFFS[k].name + (DIFFS[k].elem ? ' 有' : ' 无')).join(' / ')]);
mech.push(['Boss 提前进阶段', DIFF_ORDER.map(k => DIFFS[k].name + (DIFFS[k].bossRush ? ' 是' : ' 否')).join(' / ')]);
console.log('\n  机制差异：');
for (const [a, b] of mech) console.log('  · ' + a.padEnd(14) + b);

/* 6. 旧档兼容 */
const legacy = getDiff(undefined);
if (legacy.key !== DEFAULT_DIFF) err('旧档无 difficulty 时未回落到普通');
console.log('\n  6) 旧档兼容（无 difficulty 字段）: ' + (legacy.key === DEFAULT_DIFF ? 'PASS → ' + legacy.name : 'FAIL'));

console.log('\n  ' + '='.repeat(72));
console.log('  结果: ' + (fail === 0 ? 'PASS  全部通过' : 'FAIL  ' + fail + ' 项未通过'));
console.log('');
process.exit(fail === 0 ? 0 : 1);
