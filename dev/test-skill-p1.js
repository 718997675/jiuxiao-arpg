/* ============================================================
 * 技能重构 P1b · 动作条 8 → 5 的契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p1.js
 *
 * 钉住四件事：
 *   1. 动作条就是 5 格，键位就是 左键 + 1~4（不多不少）
 *   2. skillBarMigrate：老 8 格 → 5 格**按功能位归位**、幂等、同格冲突先到先得、
 *      传世秘技一件不丢、脏值不炸
 *   3. skillRefundAll：全退点数（lv 归 1 + 取向清空 + 被动清空），**变体保留**，幂等
 *   4. 接线是真的：键 1 打 bar[1]、左键走 primaryAttack、存档与战斗都调迁移函数
 *
 * 为什么要有第 3 条：拍板 #4「全退技能点 + 免费重投，已投点数一分不少」。
 * 退少了玩家吃亏，退多了可以刷点 —— 两个方向都得钉死。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILLS = pick('SKILLS');
const SKILL_ORDER = pick('SKILL_ORDER');
const SKILL_BAR_SLOTS = pick('SKILL_BAR_SLOTS');
const SKILL_BAR_KEYS = pick('SKILL_BAR_KEYS');
const SKILL_BAR_SETS = pick('SKILL_BAR_SETS');
const skillBarMigrate = pick('skillBarMigrate');
const skillArchSlotOf = pick('skillArchSlotOf');
const skillRefundAll = pick('skillRefundAll');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + extra : ''));
}
const CLASSES = ['warrior', 'mage', 'taoist'];

/* ============================================================
 * 一、常量：5 格，键位 左键 + 1~4
 * ============================================================ */
console.log('一、动作条常量');
ok(SKILL_BAR_SLOTS === 5, '动作条必须是 5 格', SKILL_BAR_SLOTS);
ok(Array.isArray(SKILL_BAR_KEYS) && SKILL_BAR_KEYS.length === 5, '键位表要有 5 项', SKILL_BAR_KEYS);
ok(SKILL_BAR_KEYS.join(',') === '左键,1,2,3,4', '键位必须是 左键 + 1~4', SKILL_BAR_KEYS.join(','));
ok(SKILL_BAR_KEYS[0] === '左键', '① 号位绑左键', SKILL_BAR_KEYS[0]);
ok(SKILL_BAR_SETS === 2, '两套快捷栏保留（同一格换不同技能）', SKILL_BAR_SETS);

/* ============================================================
 * 二、迁移：老 8 格 → 5 格
 * ============================================================ */
console.log('二、老档 8 格 → 5 格');
const isClean = (bar, cls) => {
  if (!Array.isArray(bar) || bar.length !== SKILL_BAR_SLOTS) return '长度不是 5: ' + (bar && bar.length);
  for (let i = 0; i < bar.length; i++) {
    const id = bar[i];
    if (id === null) continue;
    if (!SKILLS[id]) return '死 id: ' + id;
    const no = skillArchSlotOf(cls, id);
    const own = (SKILL_ORDER[cls] || []).indexOf(id) >= 0;
    if (own && no !== i + 1) return id + '(' + no + ' 号位) 跑到了第 ' + (i + 1) + ' 格';
  }
  return '';
};
for (const cls of CLASSES) {
  /* 老档：把本职业 12 个技能的第一个全塞进 8 格，顺序是「表顺序」——
   * 也就是老玩家最可能的排法（auto-fill 出来的就是这种） */
  const all = SKILL_ORDER[cls].slice();
  const old8 = all.slice(0, SKILL_BAR_SLOTS + 3);
  const got = skillBarMigrate(old8, cls);
  ok(isClean(got, cls) === '', cls + ' 迁移结果必须每格都在本位', isClean(got, cls));
  ok(got.every(id => id === null || old8.indexOf(id) >= 0), cls + ' 迁移不能凭空造技能', JSON.stringify(got));
  ok(got.filter(Boolean).length === new Set(old8).size || got.filter(Boolean).length > 0,
    cls + ' 迁移不该把技能全丢掉', JSON.stringify(got));

  /* 幂等 */
  const twice = skillBarMigrate(got, cls);
  ok(JSON.stringify(twice) === JSON.stringify(got), cls + ' 迁移必须幂等', JSON.stringify(got) + ' vs ' + JSON.stringify(twice));

  /* 同格冲突：同一功能位的两个技能，先到先得 */
  const twoInSame = all.filter(id => skillArchSlotOf(cls, id) === 2).slice(0, 2);
  if (twoInSame.length === 2) {
    const bar = skillBarMigrate([twoInSame[1], twoInSame[0]], cls);
    ok(bar[1] === twoInSame[1], cls + ' 同格冲突要保留靠前的那个', JSON.stringify(bar));
    ok(bar.indexOf(twoInSame[0]) < 0, cls + ' 同格被挤掉的不能再出现在别的格', JSON.stringify(bar));
  }
}

/* 跨职业秘技（传世授予）没有功能位：第二遍塞进剩余空格，一件不丢 */
const giftBar = skillBarMigrate(['meteor', 'talisman'], 'warrior');
ok(giftBar[1] === 'meteor' || giftBar[0] === 'meteor', '秘技也要能在战士条上落地', JSON.stringify(giftBar));
ok(giftBar.filter(Boolean).length === 2, '两件秘技都要保住', JSON.stringify(giftBar));

/* 脏值不炸 */
const junk = skillBarMigrate(['ghost_skill', '', null, 42, 'whirl'], 'warrior');
ok(isClean(junk, 'warrior') === '', '脏值迁移后仍是干净数组', JSON.stringify(junk));
ok(junk.filter(Boolean).length === 1 && junk[0] === 'whirl', '只有真实技能留下', JSON.stringify(junk));
ok(JSON.stringify(skillBarMigrate(null, 'warrior')) === '[null,null,null,null,null]', 'null 输入得到全空 5 格');
ok(JSON.stringify(skillBarMigrate(undefined, 'mage')) === '[null,null,null,null,null]', 'undefined 输入得到全空 5 格');

/* 短数组（老档只有 1 个技能）也要补满 */
const shortBar = skillBarMigrate(['talisman'], 'taoist');
ok(shortBar.length === 5 && shortBar[0] === 'talisman', '短数组要补满且归位', JSON.stringify(shortBar));

/* ============================================================
 * 三、全退点数（拍板 #4）
 * ============================================================ */
console.log('三、全退技能点');
{
  const skills = {
    whirl: { lv: 5, v: 2 },
    quake: { lv: 3, v: 0, f: 1 },
    fireball: { lv: 1, v: 0 }
  };
  const passives = { iron: 3, swift: 2 };
  const r = skillRefundAll(skills, passives);
  ok(r.refunded === 4 + 2 + 0 + 3 + 2, '退回点数必须一分不少（lv−1 + 被动）', r.refunded);
  ok(skills.whirl.lv === 1 && skills.quake.lv === 1, '等级必须归 1', JSON.stringify(skills));
  ok(skills.whirl.v === 2 && skills.quake.f === 1, '变体必须保留（不花点，是玩法选择）', JSON.stringify(skills));
  ok(Object.keys(passives).length === 0, '被动必须清空');
  const r2 = skillRefundAll(skills, passives);
  ok(r2.refunded === 0, '第二次调用退 0（幂等，不能刷点）', r2.refunded);
  ok(skillRefundAll(null, null).refunded === 0, '空账本退 0 且不炸');
}

/* ============================================================
 * 四、接线是真的（静态读取：node 里没有 DOM，只能看源码）
 * ============================================================ */
console.log('四、接线');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const game = src('src/game.js');
const ui = src('src/ui.js');
const mob = src('src/mobile.js');
const save = src('src/core/save.js');

/* 键 1 打 bar[1]（② 号位），不是 bar[0] */
ok(/parseInt\(k, 10\)\]/.test(game), '键 1~4 要按 k 直接取下标（bar[1] = ② 号位）', 'game.js');
ok(/SKILL_BAR_SLOTS - 1/.test(game), '按键上界必须是 SKILL_BAR_SLOTS - 1（键 5 不再占用）', 'game.js');
ok(game.indexOf('primaryAttack()') >= 0, '左键要有 primaryAttack 入口');
ok(/this\.mouseDown && this\.atkCd <= 0\) this\.primaryAttack\(\)/.test(game),
  '鼠标按住必须走 primaryAttack（而不是直接普攻）');
ok(/castable\(id\)/.test(game), '要有 castable 判定，否则左键会把「放不了」当成「普攻」');
ok(/if \(e\.button === 2\) this\.primaryAttack\(\)/.test(game), '右键与左键同义');
ok(game.indexOf('skillBarMigrate') >= 0, '战斗读档要用迁移函数归位');
ok(save.indexOf('skillBarMigrate') >= 0, '存档层也要用迁移函数（两边同一口径）');
ok(/skillRefundAll/.test(game), '读档要做一次性全退');
ok(/s\.skillReset !== 1/.test(game), '全退必须只跑一次（版本标记）');
ok(/s\.barVer !== 2/.test(game), '老档补位必须只跑一次（barVer 落盘）');
ok(/fillBarByRole\(/.test(game), '补位要认功能位（不能按表顺序乱填）');

/* UI：动作条要显示真实键位，手机宫格跳过第 0 格 */
ok(ui.indexOf('SKILL_BAR_KEYS') >= 0, '动作条要读 SKILL_BAR_KEYS 显示键位');
ok(/slots\.slice\(1\)/.test(mob), '手机宫格只画 1~4 格（① 是普攻键）', 'mobile.js');
ok(ui.indexOf('skillArchSlot') >= 0, '术法面板的技能条要按功能位标注');

/* 越位拦截不能只写在注释里 */
ok(/是 ' \+ meta\.glyph \+ ' 号位技能/.test(game) || /只能放在/.test(game), 'assignSkillBar 要能拒绝越位');

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P1b 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
