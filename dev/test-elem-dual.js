/* ============================================================
 * 技能 P3d 契约：双元素混搭（node 直跑，不开浏览器）
 *
 *   node dev/test-elem-dual.js
 *
 * 方案 §6.1：每技能位可注 1~2 种元素；双元素「各按 15%~25% 附加，
 * 合计不超过 50%」；视觉「主元素占 70% 特效，副元素占 30%」。
 *
 * 这一节钉五件事：
 *   1. 门槛：第二元素是**角色等级 40**，不是技能等级；
 *   2. 拆分：总量**不变**，按 70/30 拆，两段相加恒等于总量（不额外送伤害）；
 *   3. 段剔除：与命中元素相同 / 重复 / 权重为 0 的段不进结算；
 *   4. 反应：主 → 副顺序试，命中元素永远优先；
 *   5. 面板与说明页跟得上（混搭一行、粒子 70/30、文案不吹「双元素更强」）。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILL_INJECT = pick('SKILL_INJECT');
const skillInjectPct = pick('skillInjectPct');
const skillInjectSplit = pick('skillInjectSplit');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gm = readSrc('src/game.js');
const fx = readSrc('src/fx.js');
const uiJs = readSrc('src/ui.js');
const uiSk = readSrc('src/ui-skills.js');
const html = readSrc('index.html');

/* ============================================================
 * 一、门槛与配置
 * ============================================================ */
console.log('一、门槛与配置');
ok(SKILL_INJECT.subAt === 40, '第二元素门槛是角色 40 级（方案 §6.1 的解锁节奏）', SKILL_INJECT.subAt);
ok(SKILL_INJECT.subAt > SKILL_INJECT.at, '混搭门槛高于单元素门槛（20 级先学走，40 级再学混）',
  { at: SKILL_INJECT.at, subAt: SKILL_INJECT.subAt });
ok(SKILL_INJECT.split && SKILL_INJECT.split.main === 70 && SKILL_INJECT.split.sub === 30,
  '主 70 / 副 30（方案 §6.1 的视觉口径，同时用来拆附加量）', SKILL_INJECT.split);
ok(SKILL_INJECT.split.main + SKILL_INJECT.split.sub === 100, '两段权重加起来是 100（不然总量会漂）');
ok(SKILL_INJECT.elems.indexOf('sigil') < 0, '圣仍然不在可注入列表里（没有状态位、没有反应）');

/* ============================================================
 * 二、拆分：总量不变
 * ============================================================ */
console.log('二、拆分');
{
  const a = skillInjectSplit(30);
  ok(a.total === 30 && a.main === 21 && a.sub === 9, '30% → 主 21 + 副 9', a);
  const b = skillInjectSplit(50);
  ok(b.total === 50 && b.main === 35 && b.sub === 15, '50% → 主 35 + 副 15', b);

  /* 全区间扫一遍：两段相加必须恒等于总量，且都是整数 */
  let bad = [];
  for (let p = 0; p <= 100; p++) {
    const s = skillInjectSplit(p);
    if (s.main + s.sub !== s.total) bad.push([p, s]);
    if (!Number.isInteger(s.main) || !Number.isInteger(s.sub)) bad.push([p, s]);
  }
  ok(bad.length === 0, '0~100 每个总量都能拆干净（两段相加 = 总量，且是整数）', bad.slice(0, 3));
  ok(skillInjectSplit(0).main === 0 && skillInjectSplit(0).sub === 0, '总量 0 时不产生负段');
  ok(skillInjectSplit(1).main + skillInjectSplit(1).sub === 1, '总量 1 也不丢那 1%', skillInjectSplit(1));
}
{
  /* 总量必须还是 skillInjectPct 那一套：双元素**不许**偷偷翻倍 */
  const lv10 = skillInjectPct(10), lv20 = skillInjectPct(20);
  ok(lv10 === 30 && lv20 === 50, '单元素口径不变（10 级 30% / 20 级 50%）', { lv10, lv20 });
  const s10 = skillInjectSplit(lv10), s20 = skillInjectSplit(lv20);
  ok(s10.main + s10.sub === lv10 && s20.main + s20.sub === lv20,
    '双元素总量 = 单元素总量（混搭的收益在应对面，不在数值更高）',
    { 单元素20级: lv20, 双元素20级: s20.main + s20.sub });
}

/* ============================================================
 * 三、接线（源码级）
 * ============================================================ */
console.log('三、接线');
ok(/skillInject2\(id\) \{[\s\S]{0,420}s\.el2 === main \? null : s\.el2/.test(gm),
  'skillInject2：主副同色时当作没有副元素');
ok(/\(this\.state\.level \|\| 1\) < \(SKILL_INJECT\.subAt \|\| 99\)/.test(gm),
  'skillInject2 读的是**角色等级**门槛，不是技能等级');
ok(/if \(!main\) return null;/.test(gm) || /const main = this\.skillInject\(id\);\s*\n\s*if \(!main\) return null;/.test(gm),
  '没有主元素就没有副元素（不存在「只注副」的状态）');
ok(/skillInjectPack\(id\) \{[\s\S]{0,700}sub: null, subAmt: 0/.test(gm),
  'skillInjectPack：单元素时 sub 为 null、subAmt 为 0');
ok(/const sp = \(typeof skillInjectSplit === 'function'\)/.test(gm),
  'skillInjectPack 用 skillInjectSplit 拆总量（不在 game.js 里另写一套比例）');
ok(/setSkillInject\(id, key\) \{[\s\S]{0,900}delete s\.el;\s*\n\s*delete s\.el2;/.test(gm),
  '摘掉主元素时副元素一并清掉');
ok(/if \(s\.el2 === key\) delete s\.el2;/.test(gm),
  '主元素换成和副元素一样时，副元素自动摘掉（面板上不会出现「主冰副冰」）');
ok(/setSkillInject2\(id, key\) \{[\s\S]{0,700}副元素不能和主元素相同/.test(gm),
  'setSkillInject2 拒绝主副同色，并给出人话原因');
ok(/injectSegs\(inj, elem\) \{[\s\S]{0,600}k === elem \|\| seen\[k\]/.test(gm),
  'injectSegs 剔除「与命中元素相同」和「重复」的段');
ok(/this\.tryElemReaction\(e, elem, final, opts, inj \? \[inj\.key, inj\.sub\]\.filter\(Boolean\) : null\);/.test(gm),
  '反应判定拿到主 + 副两个候选源');
ok(/const alts = Array\.isArray\(altElem\) \? altElem : \(altElem \? \[altElem\] : \[\]\);/.test(gm),
  'elemReactReady 收数组（老的单元素字符串调用也还能用）');
ok(/let r = elemReactionOn\(hitElem, e\);[\s\S]{0,200}if \(alts\[i\]\) r = elemReactionOn\(alts\[i\], e\);/.test(gm),
  '命中元素优先，主 → 副依次兜底（不是反过来）');

/* ============================================================
 * 四、视觉：主 70 / 副 30 的粒子数
 * ============================================================ */
console.log('四、视觉');
ok(/elemSpark\(pos, colorMain, colorSub\) \{/.test(fx), 'FX 有 elemSpark（注入元素的视觉标记）');
ok(/const nMain = colorSub \? Math\.max\(1, Math\.round\(n \* wMain \/ 100\)\) : n;/.test(fx),
  '主元素粒子数 = 总数 × 70%（没有副元素时全部给主色）');
ok(/this\.burst\(pos, colorMain, nMain,/.test(fx) && /this\.burst\(pos, colorSub, n - nMain,/.test(fx),
  '两簇火星分开发射（主色 nMain 颗、副色剩下的颗）');
ok(/SKILL_INJECT\.split\.main/.test(fx) || /SKILL_INJECT && SKILL_INJECT\.split/.test(fx),
  '70/30 读的是 SKILL_INJECT.split（不写死第二个 70）');
/* 反向断言：不做整体换色 —— FX 是全局的，染色会连敌人技能和血一起染 */
ok(!/tint|setTint/.test(fx), '**没有**给全局光效加换色通道（FX 是全局的，染色会连敌人技能一起染）');
ok(!/radius[^\n]{0,40}\*\s*(?:SKILL_INJECT|inj)/.test(fx),
  '注入不改任何半径（光效圈是判定的视觉契约）');
ok(/FX\.elemSpark\(this\.playerGroup\.position, cm, cs\);/.test(gm), 'castSkill 在玩家脚下喷这一簇火星');

/* ============================================================
 * 五、面板与说明页
 * ============================================================ */
console.log('五、面板与说明页');
ok(/data-inj2="\$\{id\}:\$\{k \|\| ''\}"/.test(uiSk), '面板有副元素按钮（data-inj2，与主元素分开）');
ok(/sb-i2list/.test(uiSk) && /sb-i2list/.test(html), '副元素一行有独立类名（样式与主元素区分开）');
ok(/Game\.setSkillInject2\(parts\[0\], parts\[1\] \|\| null\)/.test(uiSk), '点击委托接到 setSkillInject2');
ok(/dualOpen = !!injDefs && \(\(Game\.state && Game\.state\.level\) \|\| 1\) >= \(injDefs\.subAt \|\| 99\)/.test(uiSk),
  '面板用同一个 subAt 门槛，不自己写 40');
ok(/injDefs\.elems\.filter\(k => k !== injCur\)/.test(uiSk),
  '副元素选项里剔掉主元素本身（点不出「主冰副冰」）');
ok(/row\('元素混搭'/.test(uiJs), '说明页有「元素混搭」一行');
ok(/总量不变/.test(uiJs), '说明页写清「总量不变」（不吹双元素更强）');
ok(/附魔层/.test(uiJs), '说明页写清「注入是附魔层，不是把技能元素换掉」');
ok(/主 → 副/.test(uiJs), '说明页写清反应的尝试顺序');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3d 双元素契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
