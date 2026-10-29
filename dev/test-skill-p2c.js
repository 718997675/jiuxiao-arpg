/* ============================================================
 * 技能 P2c 契约：精通层（11~20）的口径与可见性（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p2c.js
 *
 * P2c 的数值骨架（cap 20 / 分段曲线 / 圆满·精进标签）在 P0a 就铺好了，
 * P2a 又把 skillLvMul 接进了战斗与面板。所以这一节**不重复测曲线**
 * （那是 test-skill-p2 的活），只钉三件 P2c 才有的东西：
 *
 *   1. 11~20 是**词条层**：不占技能点、投入仍封顶 10、有效等级封顶 20。
 *   2. 面板真的把这一段画出来了，而且**渐进披露**（10 级以下看不到）。
 *   3. 轨道上**不许宣称还没实装的质变**（Lv15 / Lv20 的里程碑标记）。
 *      这是本项目「面板文案与实装对齐」那条红线 —— 写了就得能兑现，
 *      兑现不了就先别写。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILL_TIERS = pick('SKILL_TIERS');
const SKILL_LV_MAX = pick('SKILL_LV_MAX');
const skillLvMul = pick('skillLvMul');
const skillTierStep = pick('skillTierStep');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const uiSk = readSrc('src/ui-skills.js');
const html = readSrc('index.html');

/* ============================================================
 * 一、两段分界：10 是投入上限，20 是有效上限
 * ============================================================ */
console.log('一、两段分界');
ok(SKILL_TIERS.baseMax === 10, '基础段 1~10（玩家投入）', SKILL_TIERS.baseMax);
ok(SKILL_TIERS.cap === 20, '有效上限 20（基础 10 + 词缀 10）', SKILL_TIERS.cap);
ok(SKILL_TIERS.masteryAt === 15, '精通层的质变点仍是 15', SKILL_TIERS.masteryAt);
ok(SKILL_LV_MAX === SKILL_TIERS.baseMax, 'SKILL_LV_MAX 与 baseMax 同源（投入封顶 10）',
  { SKILL_LV_MAX, baseMax: SKILL_TIERS.baseMax });
ok(SKILL_TIERS.cap - SKILL_TIERS.baseMax === 10, '精进段正好 10 级（轨道 10 格）',
  SKILL_TIERS.cap - SKILL_TIERS.baseMax);

/* 11 级往后没有台阶对象：精通层不承诺新形态（方案 §5.2 拍板） */
ok(skillTierStep(10) && skillTierStep(10).kind === 'final', 'Lv10 是最后一个台阶（终极形态）');
ok(skillTierStep(11) === null && skillTierStep(15) === null && skillTierStep(20) === null,
  '11~20 没有台阶对象（精通层不加新形态）');

/* ============================================================
 * 二、曲线：分段递减，20 级封顶约 2.0 倍
 * ============================================================ */
console.log('二、曲线');
ok(near(skillLvMul(1), 1), 'Lv1 = 1.0', skillLvMul(1));
ok(near(skillLvMul(10), 1.72), 'Lv10 = 1.72（9 级 × 8%）', skillLvMul(10));
ok(near(skillLvMul(15), 1.92), 'Lv15 = 1.92（再 5 级 × 4%）', skillLvMul(15));
ok(near(skillLvMul(20), 2.02), 'Lv20 = 2.02（再 5 级 × 2%）', skillLvMul(20));
ok(skillLvMul(20) < 2.1, '20 级不许回到旧的 2.52 倍', skillLvMul(20));
ok(near(skillLvMul(25), skillLvMul(20)), '超过 20 级不再涨（cap 真的夹住）', skillLvMul(25));
ok(near(skillLvMul(0), 1) && near(skillLvMul(-3), 1), '脏等级按 1 级算',
  [skillLvMul(0), skillLvMul(-3)]);
{
  const inc = lv => skillLvMul(lv) - skillLvMul(lv - 1);
  ok(near(inc(11), 0.04) && near(inc(15), 0.04), '11~15 每级 +4%', [inc(11), inc(15)]);
  ok(near(inc(16), 0.02) && near(inc(20), 0.02), '16~20 每级 +2%', [inc(16), inc(20)]);
  ok(near(inc(10), 0.08), '10 级那一档还是 +8%（分段边界不吞一级）', inc(10));
}

/* ============================================================
 * 三、面板：精进轨道真的画出来了
 * ============================================================ */
console.log('三、精进轨道');
ok(/const mstPips = Array\.from\(\{ length: mstSpan \}/.test(uiSk),
  '精进轨道按 cap − baseMax 生成格子（不是写死 10）');
ok(/const mstSpan = Math\.max\(1, T\.cap - T\.baseMax\)/.test(uiSk), '格数取自 SKILL_TIERS');
ok(/mstN = Math\.max\(0, Math\.min\(T\.cap, lv\) - T\.baseMax\)/.test(uiSk),
  '亮几格 = 有效等级 − 10（夹在 0~10）');
ok(/\$\{T\.labels\.mastery\} <b>\$\{lv\}<\/b>\/\$\{T\.cap\}/.test(uiSk),
  '读数写「精进 13/20」（名字取自 labels，不写死）');
ok(/lvBonus > 0\s*\n?\s*\? `<div class="sd-lv mst"/.test(uiSk),
  '**渐进披露**：只有有效等级超过 10（lvBonus > 0）才画这一行');
ok(/class="sd-lv mst"/.test(uiSk), '精进行有自己的类（与圆满那行区分）');
ok(/class="sk-pip\$\{i < mstN \? ' on' : ''\}\$\{cls\}"/.test(uiSk),
  '格子的 on 状态按精进层数点，15 / 20 两级另带标记类');
ok(/有效等级上限/.test(uiSk), '20 级那格的提示说的是「有效等级上限」（事实，不是质变）');
/* 取的是**字符串字面量**，不是注释里的词 —— 注释里写「Lv20 Capstone 还没实装」
 * 是说明，不是面板文案；用裸词会把注释当成宣称（刀客 ⑤ 那一节踩过同一个坑）。 */
ok(!/'最终精通'|"最终精通"|'Capstone'/.test(uiSk),
  '面板文案里没有「最终精通 / Capstone」（Lv20 capstone 还没实装）');
ok(/投入 <b>\$\{inv\}<\/b>\/\$\{SKILL_LV_MAX\}/.test(uiSk),
  '第一行仍写「投入 x/10」—— 投入封顶没被精通层改掉');
ok(/T\.labels\.base/.test(uiSk) && /T\.labels\.masteryTip/.test(uiSk),
  '圆满 / 精进层说明都在面板上被消费（不是死数据）');

/* 红线：轨道上的标记必须是**已兑现**的 */
ok(/sk-pip\.ms\{/.test(html), '15 级那格有里程碑样式（精通三选一已实装）');
ok(/at === T\.masteryAt \? ' ms'/.test(uiSk), '15 级里程碑按 masteryAt 取，不写死 15');
ok(/精通层：三选一/.test(uiSk), '15 级那格的提示说的是「三选一」，不是含糊的「质变」');

/* ============================================================
 * 四、样式与响应式
 * ============================================================ */
console.log('四、样式');
ok(/\.sk-pip\.cap\{/.test(html) && /\.sk-pip\.cap\.on\{/.test(html),
  '20 级那格有独立样式（否则标记看不见）');
ok(/\.sd-lv\.mst\{/.test(html), '精进行与上一行拉开 3px（两行菱形不能糊成一片）');

/* ============================================================
 * 五、说明页口径一致
 * ============================================================ */
console.log('五、说明页');
const uiJs = readSrc('src/ui.js');
ok(/精进层/.test(uiJs), '说明页写了「精进层」');
ok(/不占技能点/.test(uiJs) || /不占技能点/.test(uiSk), '「不占技能点」说清楚了');

/* ============================================================
 * 六、精通三选一（Lv15）
 * ============================================================ */
console.log('六、精通三选一');
const skillMasteryOn = pick('skillMasteryOn');
const skillMasteryIdx = pick('skillMasteryIdx');
const skillMasteryOpt = pick('skillMasteryOpt');

ok(Array.isArray(SKILL_TIERS.mastery) && SKILL_TIERS.mastery.length === 3,
  '三条精通（烈 / 疾 / 省）', SKILL_TIERS.mastery && SKILL_TIERS.mastery.length);
ok(SKILL_TIERS.mastery.every(o => o.mods && !o.beh),
  '三条**只走 mods**，不新增 beh 键（精通层是数值强化，不是第二套机制）',
  SKILL_TIERS.mastery.map(o => Object.keys(o)));
ok(SKILL_TIERS.mastery.every(o => {
  const k = Object.keys(o.mods);
  return k.length === 1 && ['dmg', 'cd', 'cost'].indexOf(k[0]) >= 0;
}), '三条各占一个公共乘区（dmg / cd / cost）',
  SKILL_TIERS.mastery.map(o => o.mods));

ok(skillMasteryOn(14) === false, '14 级还没开精通', skillMasteryOn(14));
ok(skillMasteryOn(15) === true, '15 级开启', skillMasteryOn(15));
ok(skillMasteryOn(20) === true, '20 级仍是开启状态');
ok(skillMasteryOn(1) === false && skillMasteryOn(0) === false, '1 级 / 脏等级都不开');

ok(skillMasteryIdx({}, 'whirl') === 0, '没选过默认第 0 条（不能出现「开了但没生效」）');
ok(skillMasteryIdx({ whirl: { lv: 10, m: 2 } }, 'whirl') === 2, '存了 m=2 就读 2');
ok(skillMasteryIdx({ whirl: { lv: 10, m: 9 } }, 'whirl') === 0, '脏值回落 0');
ok(skillMasteryIdx({ whirl: { lv: 10, m: 'x' } }, 'whirl') === 0, '非数字回落 0');
ok(skillMasteryOpt(0) && skillMasteryOpt(0).name === '烈', '第 0 条是「烈」');
ok(skillMasteryOpt(9) === skillMasteryOpt(0), '越界回落第 0 条（不会返回 undefined）');

/* ---- 接线：合并口、门槛口径、落库字段、面板入口 ---- */
const gm = readSrc('src/game.js');
ok(/tierMods,\s*\n\s*this\.skillMasteryMods\(id\)\);/.test(gm),
  '精通并进 effSkillMods 的同一个 merge（面板 / 战斗 / 召唤自动同口径）');
ok(/skillMasteryMods\(id\) \{[\s\S]{0,220}skillMasteryOn\(this\.skillLevel\(id\)\)/.test(gm),
  '门槛读 **skillLevel（有效等级）**，不是已投等级 —— 否则词条层永远开不了');
ok(/e\.m = idx;/.test(gm), '选择落在 state.skills[id].m（与 lv / f 同一张表）');
ok(/_summonMods\(skillId\) \{[\s\S]{0,160}this\.effSkillMods\(skillId\)/.test(gm),
  '召唤的 dmgMul 也是从 effSkillMods 折的 —— 精通「烈」对灵兽同样生效');
ok(/data-mset="\$\{id\}:\$\{i\}"/.test(uiSk), '面板上三条可点（data-mset）');
ok(/sb-mlist/.test(uiSk), '精通行有独立的列表类（不与取向 / 变体的委托撞车）');
ok(/const mstOn = \(typeof skillMasteryOn === 'function'\) && skillMasteryOn\(lv\)/.test(uiSk),
  '面板用同一个 skillMasteryOn 判门槛（不自己写 lv >= 15）');
ok(/lvBonus > 0 && mstItems/.test(uiSk), '精通块与精进轨道同一条渐进披露线（> 10 级才出现）');
ok(/setSkillMastery\(parts\[0\], parseInt\(parts\[1\], 10\)\)/.test(uiSk),
  '点击走 Game.setSkillMastery（失败会 toast，不静默吞掉）');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2c 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
