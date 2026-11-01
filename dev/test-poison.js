/* ============================================================
 * 技能 P0·毒 契约：蚀骨（叠毒 / 毒爆 / 符毒联动）—— node 直跑，不开浏览器
 *
 *   node dev/test-poison.js
 *
 * 方案 §3.2 / §12 第 7 条是**拍板过的**：「毒、符是道士的独占玩法」，
 * 其他职业注入毒元素只有 DoT 数值，不能叠毒、不能毒爆。
 * 计划 §11 也把它写成了验收项。
 *
 * 但一直没做 —— 代码里毒只是一个 DoT 计时器（`e.poisonT` + `e.poisonDmg`），
 * 谁打都是同一坨，道士和注了毒的法师在手感上没有任何区别。
 *
 * 这一节钉六件事：
 *   1. 规则表：层数上限 / 断档时间 / 每层系数 / 起爆层数，全部有出处；
 *   2. 加层只有**一个来源**：蚀骨毒雾的每一跳。其他路径不许写 `poisonN`；
 *   3. 引爆只有**符**能触发，且 silent / react / 已死 三种情况都不爆；
 *   4. 引爆**消耗**层数（不清零 = 每发符都白嫖一次满层）；
 *   5. 断档清零：雾停了，层数活不过 stackDur；
 *   6. 看得见：加层与引爆都有飘字，说明页写清「其他职业不叠不爆」。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const POISON_RULES = pick('POISON_RULES');
const poisonBurstDmg = pick('poisonBurstDmg');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gm = readSrc('src/game.js');
const ui = readSrc('src/ui.js');

/* 取 src/game.js 里某个方法的源码切片（从签名到下一个同级方法） */
function bodyOf(sig) {
  const i = gm.indexOf(sig);
  if (i < 0) return '';
  return gm.slice(i, i + 9000);
}

console.log('一、规则表');
{
  ok(POISON_RULES && typeof POISON_RULES === 'object', 'POISON_RULES 存在');
  ok(POISON_RULES.maxStacks === 5, '层数上限 5（再多就变成一条越长越粗的血条）', POISON_RULES.maxStacks);
  ok(POISON_RULES.stackDur === 4, '断档 4 秒清零', POISON_RULES.stackDur);
  ok(Math.abs(POISON_RULES.burstPerStack - 0.6) < 1e-9, '每层 0.6 × 攻击力', POISON_RULES.burstPerStack);
  ok(POISON_RULES.burstAt === 2, '2 层起爆（1 层就爆 = 每跳都能爆，层数没意义）', POISON_RULES.burstAt);

  /* 数值体检：5 层 3.0 × atk；毒雾单跳 0.75 × atk（见 case 'poison' 的
   * `st.atk * 0.75 * spow`）。也就是「炸一次 ≈ 在雾里多站 4 跳」——
   * 换循环值，但不至于把手雷塞给道士。 */
  const full = poisonBurstDmg(100, 5);
  ok(Math.abs(full - 300) < 1e-6, '5 层满爆 = 3.0 × 攻击力', full);
  ok(Math.abs(full / 75 - 4) < 0.01, '满爆 ≈ 毒雾 4 跳的伤害（4 × 0.75）', full / 75);
  ok(poisonBurstDmg(100, 99) === full, '层数传超了按上限截断（不按传进来的数算）', poisonBurstDmg(100, 99));
  ok(poisonBurstDmg(100, 0) === 0, '0 层不产生伤害');
}

console.log('二、加层只有一个来源');
{
  /* 全文件里对 poisonN 的**写入**必须只有：初始化 / 清零 / 毒雾加层 / 引爆清零。 */
  const writes = (gm.match(/poisonN\s*(=[^=]|\+\+)/g) || []).length;
  ok(writes === 4, 'game.js 里写 poisonN 的地方正好 4 处（初始化 1 + 毒雾 1 + 衰减清零 1 + 引爆清零 1）', writes);

  const poisonCase = bodyOf("case 'poison': {");
  ok(poisonCase.length > 1000, '找得到毒雾的 case', poisonCase.length);
  ok(/e\.poisonN\s*=\s*Math\.min\(POISON_RULES\.maxStacks,\s*was\s*\+\s*1\)/.test(poisonCase),
    '毒雾每一跳 +1 层，上限读 POISON_RULES.maxStacks');
  ok(/e\.poisonNT\s*=\s*Math\.max\([\s\S]{0,40}POISON_RULES\.stackDur\)/.test(poisonCase),
    '每跳刷新断档计时器（满层也刷新，否则满层再放雾等于放了个寂寞）');
  ok(/蚀骨 ×/.test(poisonCase), '加层有飘字（看不见的机制等于没做）');

  /* 「其他职业注入毒不能叠层」不是靠 if 判职业，而是靠**结构**：
   * 加层只写在毒雾的结算里，而毒雾是道士 ② 独占的技能。
   * 这里反向钉一句：注入路径（damageEnemy 的 inj 段）里不许出现 poisonN。 */
  const dmg = bodyOf('  damageEnemy(e, dmg, crit, opts = {}) {');
  const injSeg = dmg.slice(0, dmg.indexOf('const segs'));
  ok(injSeg.length > 0 && !/poisonN/.test(injSeg), '元素注入那一段不碰层数（注了毒的法师不会叠）');
}

console.log('三、引爆只认符');
{
  const dmg = bodyOf('  damageEnemy(e, dmg, crit, opts = {}) {');
  ok(dmg.length > 5000, '找得到 damageEnemy 本体（按定义行切，不按调用点）', dmg.length);
  ok(/elem === 'sigil'/.test(dmg), '引爆条件里有 `elem === \'sigil\'`（只有符能点着）');
  ok(/!opts\.silent/.test(dmg) && /!opts\.react/.test(dmg),
    'silent（DoT 每跳）与 react（反应附带伤害）都不引爆');
  ok(/e\.hp > 0/.test(dmg), '这一符已经打死目标就不再多算一次爆炸');
  ok(/n0 >= \(POISON_RULES\.burstAt/.test(dmg), '层数不够不爆（burstAt）');
  ok(/poisonBurstDmg\(st\.atk, n0\)/.test(dmg), '爆炸伤害按「攻击力 × 每层系数 × 层数」算');
  ok(/elem:\s*'poison'/.test(dmg) || /'poisonburst'/.test(dmg),
    '爆炸自己带 poison 口径（不再触发引爆，也不会叠层）');
  ok(/毒爆 ×/.test(dmg), '引爆有飘字');
}

console.log('四、引爆要消耗层数');
{
  const dmg = bodyOf('  damageEnemy(e, dmg, crit, opts = {}) {');
  const i = dmg.indexOf("elem === 'sigil'");
  const seg = dmg.slice(i, i + 1200);
  ok(/e\.poisonN\s*=\s*0/.test(seg), '引爆后层数清零（不清零 = 每发符都白嫖满层）');
  ok(/e\.poisonNT\s*=\s*0/.test(seg), '断档计时器一起清（否则清零后又被动「续命」）');
}

console.log('五、断档清零（在帧循环里）');
{
  ok(/if \(e\.poisonNT > 0\)/.test(gm), '帧循环里有 poisonNT 递减');
  ok(/if \(e\.poisonNT <= 0\) e\.poisonN = 0/.test(gm), '计时器到点把层数清 0');
  ok(/poisonN: 0, poisonNT: 0/.test(gm), '新怪初始化层数为 0');
  ok(/e\.poisonN = 0; e\.poisonNT = 0;/.test(gm), '回收 / 重置怪物时层数一起清');
}

console.log('六、说明页');
{
  ok(/蚀骨与毒爆/.test(ui), '说明页有「蚀骨与毒爆」一行');
  ok(/道士独占/.test(ui), '说明页写清这是道士独占');
  ok(/不叠层、也不会爆/.test(ui), '说明页写清其他职业注毒不叠不爆');
}

console.log('\n' + (fail ? '✗' : '✓') + ' P0·毒契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
