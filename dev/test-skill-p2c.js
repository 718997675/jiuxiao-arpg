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
 * 是说明，不是面板文案；用裸词会把注释当成宣称（刀客 ⑤ 那一节踩过同一个坑）。
 * [P2c·capstone] 反过来也一样：capstone 实装之后，面板**必须**写出「最终精通」，
 * 否则玩家在 20 级只会看到一句「有效等级上限」，不知道那两级词条换来了什么。 */
ok(/最终精通「' \+ CAP\.name/.test(uiSk),
  '面板文案里写了「最终精通」（Lv20 capstone 已实装，写了就得能兑现）');
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
ok(/tierMods,\s*\n\s*this\.skillMasteryMods\(id\),\s*\n\s*this\.skillCapstoneMods\(id\)\);/.test(gm),
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

/* ============================================================
 * 七、最终精通「归一」（Lv20）
 *
 * 方案 §5.2 只拍板了「统一模板 + 不做每技能独立 capstone」，没写 20 级给什么。
 * 这里钉的是我们**自己选的那套**：三条精通各 60% 同时生效、与 15 级所选叠加。
 * 三条都走 mods，所以四类技能（伤害 / 增益 / 召唤 / 领域）都不会点到空选项 ——
 * 这是选它而不是选「处决 / 溅射 / 回响」的唯一理由，也是这一节要守住的东西。
 * ============================================================ */
console.log('七、最终精通');
const skillCapstoneOn = pick('skillCapstoneOn');
const skillCapstoneBonus = pick('skillCapstoneBonus');
const mergeSkillMods = pick('mergeSkillMods');

ok(!!SKILL_TIERS.capstone, 'SKILL_TIERS 里有 capstone 定义');
ok(SKILL_TIERS.capstone.at === SKILL_TIERS.cap,
  'capstone 的开启等级就是有效等级上限（多一级都没有）',
  { at: SKILL_TIERS.capstone.at, cap: SKILL_TIERS.cap });
ok(SKILL_TIERS.capstone.name === '归一', '名字是「归一」', SKILL_TIERS.capstone.name);
ok(SKILL_TIERS.capstone.pct === 60, '三份里拿一份半（60%）', SKILL_TIERS.capstone.pct);
ok(!SKILL_TIERS.capstone.mods && !SKILL_TIERS.capstone.beh,
  'capstone 自己不带 mods / beh（它只是三条精通的折算规则，不新增形态）',
  Object.keys(SKILL_TIERS.capstone));

ok(skillCapstoneOn(19) === false, '19 级还没到最终精通', skillCapstoneOn(19));
ok(skillCapstoneOn(20) === true, '20 级开启', skillCapstoneOn(20));
ok(skillCapstoneOn(25) === true, '超过 20 级仍开启（有效等级被 cap 夹住，但状态不会掉）');
ok(skillCapstoneOn(1) === false && skillCapstoneOn(0) === false, '1 级 / 脏等级都不开');

{
  const c = skillCapstoneBonus();
  ok(c.dmg === 13 && c.cd === 11 && c.cost === 21,
    '三条各按 60% 折算：dmg 13 / cd 11 / cost 21', c);
  ok(Object.keys(c).every(k => Number.isInteger(c[k])),
    '折算结果全是整数（面板写 +13 而战斗乘 1.132 就是新的口径分裂）', c);
  ok(Object.keys(c).every(k => ['dmg', 'cd', 'cost'].indexOf(k) >= 0),
    '只碰 dmg / cd / cost 三个公共乘区', Object.keys(c));
  ok(c.dmg < 22 && c.cd < 18 && c.cost < 35,
    '单看每条都弱于 15 级的全额 —— 20 级是「再进一步」，不该盖掉 15 级的选择', c);

  /* 叠加不是替换：20 级选「烈」= 22 + 13 = 35，不是只剩 13 */
  const both = mergeSkillMods(SKILL_TIERS.mastery[0].mods, c);
  ok(both.dmg === 35 && both.cd === 11 && both.cost === 21,
    '20 级 + 烈 = dmg 35 / cd 11 / cost 21（两份 mods 相加，不是覆盖）', both);

  /* 纯函数：不许把折算写回 mastery 本体，否则反复调用会一路缩水 */
  const again = skillCapstoneBonus();
  ok(again.dmg === c.dmg && SKILL_TIERS.mastery[0].mods.dmg === 22,
    'skillCapstoneBonus 是纯函数（不写回 SKILL_TIERS.mastery）',
    { again, mastery0: SKILL_TIERS.mastery[0].mods });
}

/* ---- 接线：门槛口径、合并口、面板角标 ---- */
ok(/skillCapstoneMods\(id\) \{[\s\S]{0,260}skillCapstoneOn\(this\.skillLevel\(id\)\)/.test(gm),
  'capstone 的门槛也读 **skillLevel（有效等级）**，与精通三选一同一条线');
ok(/this\.skillMasteryMods\(id\),\s*\n\s*this\.skillCapstoneMods\(id\)\);/.test(gm),
  'capstone 是 effSkillMods 的第六层（与上面五层同一个 merge）');
ok(/const capOn = !!CAP && \(typeof skillCapstoneOn === 'function'\) && skillCapstoneOn\(lv\)/.test(uiSk),
  '面板用同一个 skillCapstoneOn 判状态（不自己写 lv >= 20）');
ok(/class="sd-tag cap"/.test(uiSk), '20 级时三条精通各挂一个折算角标（玩家看得出「另外两条也拿到了」）');
ok(/\.sd-tag\.cap\{/.test(html), '那个角标有独立样式（橙色，与「当前」的金色区分）');
ok(/20 级「' \+ CAP\.name \+ '」让三条各 ' \+ CAP\.pct \+ '% 同时生效/.test(uiSk),
  '提示语写的是「同时生效」，不是含糊的「效果提升」');

/* ============================================================
 * 八、光效随等级变亮（P2c 的最后一件）
 *
 * 方案 §5.2 把 11~20 定成「数值强化 + 光效增强」，数值那半在 P2a 就接完了。
 * 这一节钉三件事：
 *   1. 曲线只在**精通层**成立（10 级及以下恒 1，否则 1 级和 10 级只差「暗一点」）；
 *   2. 15 / 20 两级各跳一档，与两条质变门槛同源；
 *   3. **只乘亮度 / 不透明度 / 粒子数，不乘半径 / 角度** ——
 *      光效圈是判定的视觉契约，画大了就是谎报范围。
 * 顺带钉住「它是纯表现」：fx.js 里 amp 不许出现在任何伤害 / 冷却算式里。
 * ============================================================ */
console.log('八、光效变亮');
const skillFxAmp = pick('skillFxAmp');
const fx = readSrc('src/fx.js');

ok(!!SKILL_TIERS.fx, 'SKILL_TIERS 里有光效强度定义（可调，不写死在 fx.js 里）');
ok(skillFxAmp(1) === 1 && skillFxAmp(10) === 1, '基础段（1~10）恒为 1：台阶才是基础段的可见变化',
  [skillFxAmp(1), skillFxAmp(10)]);
ok(skillFxAmp(0) === 1 && skillFxAmp(-5) === 1 && skillFxAmp('x') === 1, '脏等级按「不变亮」处理',
  [skillFxAmp(0), skillFxAmp(-5), skillFxAmp('x')]);
ok(skillFxAmp(11) > 1, '11 级开始变亮（与「> 10 才是精进层」同一条线）', skillFxAmp(11));
{
  let mono = true;
  for (let lv = 11; lv <= 20; lv++) if (!(skillFxAmp(lv) > skillFxAmp(lv - 1))) mono = false;
  ok(mono, '11→20 单调递增（没有哪一级反而变暗）',
    Array.from({ length: 10 }, (_, i) => skillFxAmp(11 + i)));
  ok(skillFxAmp(20) === 1.22, '20 级 = 1.22（10 级 ×1.00 → 20 级 ×1.22）', skillFxAmp(20));
  ok(skillFxAmp(20) <= SKILL_TIERS.fx.max, '不超过 SKILL_TIERS.fx.max 的夹子',
    { amp20: skillFxAmp(20), max: SKILL_TIERS.fx.max });
  ok(skillFxAmp(99) === skillFxAmp(20), '超过 20 级不再更亮（与有效等级 cap 同源）',
    [skillFxAmp(99), skillFxAmp(20)]);
  /* 两级台阶：15 与 20 的增量明显大于普通一级 —— 玩家该在质变点看到「跳一档」 */
  const step = lv => skillFxAmp(lv) - skillFxAmp(lv - 1);
  ok(step(15) > step(14) && step(20) > step(19),
    '15 / 20 各跳一档（与精通三选一 / 归一的门槛同源）',
    { s14: step(14), s15: step(15), s19: step(19), s20: step(20) });
}

/* ---- FX 侧：接口、默认值、回落、只乘亮度的硬约束 ---- */
ok(/amp: 1,/.test(fx) && /ampHold: 0,/.test(fx), 'FX 默认 amp = 1、没有残留尾窗');
ok(/setAmp\(v, hold = 1\.2\)/.test(fx), 'setAmp 自带 1.2 秒尾窗（延后特效也在窗内）');
ok(/lit\(color\) \{[\s\S]{0,140}if \(this\.amp <= 1\.0001\) return color;/.test(fx),
  'lit() 在 amp = 1 时**原样返回**（不引入任何颜色误差）');
ok(/if \(this\.ampHold > 0\) \{[\s\S]{0,160}this\.amp = 1;/.test(fx),
  '尾窗在 update 里倒数，到点回落 1（不会一路亮到下一次施法）');
ok(/this\.amp = 1;\s*\n\s*this\.ampHold = 0;/.test(fx), 'FX.clear() 也把亮度还原（换图不带旧亮度）');

/* 反向断言：半径 / 角度 / 射程一个都不许被 amp 乘 */
ok(!/(radius|arc|thickness|hitRadius|castRange)\s*\*\s*this\.amp/.test(fx),
  '**半径 / 弧度 / 判定半径都不乘 amp**（光效圈画多大，就该真能打到多大）');
ok(!/this\.amp\s*\*\s*(radius|arc|thickness|hitRadius)/.test(fx),
  '反过来写也不许（同一条硬约束）');
/* 纯表现：amp 只出现在 FX 里，战斗算式里一处都没有 */
ok(!/skillFxAmp|\.amp\b/.test(gm.replace(/FX\.setAmp\([\s\S]{0,160}?\);/, '')),
  'game.js 里除了那一次 setAmp，没有任何地方读 amp / skillFxAmp（它不参与结算）');
ok(/FX\.setAmp\(\(typeof skillFxAmp === 'function'\) \? skillFxAmp\(this\.skillLevel\(id\)\) : 1\)/.test(gm),
  'castSkill 按**有效等级**（skillLevel）设亮度，与精通 / capstone 同一条门槛');
ok(/this\._castSkill = id;\s*\n\s*\/\* \[P2c\] 光效随等级变亮/.test(gm),
  'setAmp 写在所有闸门之后（冷却中 / 资源不足不会把屏幕调亮）');

/* ---- 面板文案：做了才许写 ---- */
ok(/光效也随之变亮/.test(pick('SKILL_TIERS').labels.masteryTip), '精进层的说明写上「光效也随之变亮」');
ok(/20 级 ×1\.22/.test(readSrc('src/ui.js')), '说明页写出 1.00 → 1.22 的读数（不写「明显增强」这种空话）');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2c 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
