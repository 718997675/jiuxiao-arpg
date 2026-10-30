/* ============================================================
 * 技能 P3a 契约：元素反应表（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p3.js
 *
 * 方案 §6.2 有 10 组反应，前提是「元素注入」（P3b 还没做）。这一步只做
 * **不需要注入的那一半**：触发口径改成「目标身上已有 A 元素状态 + 这一下带 B 元素」。
 *
 * 这一节钉五件事：
 *   1. 表的形状（6 组、两两覆盖、没有圣系、没有同元素）；
 *   2. 查表顺序无关（火+冰 与 冰+火 是同一组）；
 *   3. 状态探针只读**已经在用的字段**（dotElem / slowT / stun / vulnT / poisonT）；
 *   4. 三道闸门（silent / react / _reacting）与双层 ICD 真的在代码里；
 *   5. 面板文案与表同源（写死数字就会红），且**没有**宣称圣系 4 组已经做了。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const ELEM_DEFS = pick('ELEM_DEFS');
const ELEM_REACTIONS = pick('ELEM_REACTIONS');
const ELEM_REACT_ICD = pick('ELEM_REACT_ICD');
const ELEM_STATUS = pick('ELEM_STATUS');
const elemDef = pick('elemDef');
const elemReaction = pick('elemReaction');
const elemReactionOn = pick('elemReactionOn');
const elemStatusOn = pick('elemStatusOn');
const elemStatusList = pick('elemStatusList');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gm = readSrc('src/game.js');
const uiJs = readSrc('src/ui.js');
const html = readSrc('index.html');
const elemSrc = readSrc('src/data/data-elem.js');

/* ============================================================
 * 一、表结构
 * ============================================================ */
console.log('一、表结构');
ok(ELEM_DEFS.length === 6, '六个元素（物理 / 火 / 冰 / 雷 / 毒 / 圣）', ELEM_DEFS.map(d => d.key));
ok(ELEM_DEFS.map(d => d.key).join(',') === 'phys,fire,ice,lightning,poison,sigil',
  'key 与 monsters.resist / items 的 ELEM_DMG 键同源（顺序固定）', ELEM_DEFS.map(d => d.key));
ok(ELEM_REACTIONS.length === 6, '6 组反应（方案 10 组里去掉圣系 4 组）', ELEM_REACTIONS.length);
{
  const keys = ELEM_REACTIONS.map(r => r.key);
  ok(new Set(keys).size === keys.length, '反应 key 唯一', keys);
  const bad = ELEM_REACTIONS.filter(r => !elemDef(r.a) || !elemDef(r.b));
  ok(bad.length === 0, '每条反应的 a / b 都是已知元素', bad.map(r => r.key));
  ok(ELEM_REACTIONS.every(r => r.a !== r.b), '没有「同元素反应」这种空条目');
  ok(!ELEM_REACTIONS.some(r => r.a === 'sigil' || r.b === 'sigil'),
    '**没有圣系反应**（引擎里 sigil 只是一个伤害类型，没有状态位）',
    ELEM_REACTIONS.filter(r => r.a === 'sigil' || r.b === 'sigil').map(r => r.key));
  ok(ELEM_REACTIONS.every(r => r.name && r.desc && r.color),
    '每条都有名字 / 说明 / 颜色（面板与特效都要用）');
  ok(ELEM_REACTIONS.every(r => !r.dmg || (r.dmg >= 20 && r.dmg <= 50)),
    '伤害类反应都在 20~50% 之间（不许出现一反应定生死）', ELEM_REACTIONS.map(r => r.dmg));
  ok(ELEM_REACTIONS.every(r => !r.chain || r.chain <= 2), '连锁最多 2 个（再多就是一屏电弧）');
  ok(ELEM_REACTIONS.every(r => !r.dotMul || r.dotMul >= 1), 'dot 倍率不会让持续伤害变低');
}

/* ============================================================
 * 二、查表：顺序无关、两两覆盖
 * ============================================================ */
console.log('二、查表');
ok((elemReaction('fire', 'ice') || {}).key === 'steam', '火 + 冰 = 蒸汽爆裂');
ok(elemReaction('fire', 'ice') === elemReaction('ice', 'fire'), '查表**顺序无关**（同一个对象）');
ok((elemReaction('fire', 'lightning') || {}).key === 'plasma', '火 + 雷 = 等离子');
ok((elemReaction('fire', 'poison') || {}).key === 'burnpoison', '火 + 毒 = 焚毒');
ok((elemReaction('ice', 'lightning') || {}).key === 'frozele', '冰 + 雷 = 感电冻结');
ok((elemReaction('ice', 'poison') || {}).key === 'frostrot', '冰 + 毒 = 腐霜');
ok((elemReaction('lightning', 'poison') || {}).key === 'corrochain', '雷 + 毒 = 腐蚀链');
ok(elemReaction('fire', 'fire') === null, '同元素不反应');
ok(elemReaction('phys', 'fire') === null && elemReaction('ice', 'phys') === null, '物理不参与反应');
ok(elemReaction('sigil', 'fire') === null, '圣不参与（还没状态位，宁可没有也不编）');
ok(elemReaction('', 'fire') === null && elemReaction(null, undefined) === null, '空值不炸');
{
  /* 四种可反应元素两两组合正好 6 对，一对不多一对不少 */
  const E = ['fire', 'ice', 'lightning', 'poison'];
  let pairs = 0;
  for (let i = 0; i < E.length; i++) {
    for (let j = i + 1; j < E.length; j++) if (elemReaction(E[i], E[j])) pairs++;
  }
  ok(pairs === 6, '四种可反应元素两两组合 = 6，正好被表覆盖完', pairs);
}

/* ============================================================
 * 三、状态探针：只读已有字段
 * ============================================================ */
console.log('三、状态探针');
ok(elemStatusOn({ dotT: 2, dotElem: 'fire' }, 'fire') === true, '火状态 = 有火 dot 在跳');
ok(elemStatusOn({ dotT: 0, dotElem: 'fire' }, 'fire') === false, 'dot 跳完了就不算火状态');
ok(elemStatusOn({ dotT: 2, dotElem: 'ice' }, 'fire') === false, '冰 dot 不算火状态');
ok(elemStatusOn({ slowT: 1, slow: 0.4 }, 'ice') === true, '冰状态 = 减速还在');
ok(elemStatusOn({ slowT: 0, slow: 0.4 }, 'ice') === false, '减速时间到就不算冰状态');
ok(elemStatusOn({ slowT: 1, slow: 0 }, 'ice') === false, '有计时但强度是 0 不算');
ok(elemStatusOn({ stun: 0.5 }, 'lightning') === true, '雷状态 = 麻痹');
ok(elemStatusOn({ vulnT: 2, vuln: 15 }, 'lightning') === true, '雷状态 = 易伤（法相雷相挂的那个键）');
ok(elemStatusOn({ vulnT: 2, vuln: 0 }, 'lightning') === false, '只有计时没有强度不算');
ok(elemStatusOn({ poisonT: 3 }, 'poison') === true, '毒状态 = poisonT');
ok(elemStatusOn({ dotT: 2, dotElem: 'poison' }, 'poison') === true, '毒 dot 也算毒状态');
ok(elemStatusOn({}, 'poison') === false && elemStatusOn(null, 'fire') === false, '空对象 / null 不炸');
ok(Object.keys(ELEM_STATUS).join(',') === 'fire,ice,lightning,poison',
  '状态表只覆盖四种能反应的元素（顺序固定 → 反应优先级可预测）', Object.keys(ELEM_STATUS));
ok(elemStatusList({ dotT: 2, dotElem: 'fire', slowT: 1, slow: 0.5 }).join(',') === 'fire,ice',
  '同时挂着火与冰时，列表按固定顺序给出两种', elemStatusList({ dotT: 2, dotElem: 'fire', slowT: 1, slow: 0.5 }));

/* ============================================================
 * 四、命中判定：elemReactionOn(hitElem, e)
 * ============================================================ */
console.log('四、命中判定');
const frozen = { slowT: 1.2, slow: 1 };
const burning = { dotT: 2, dotElem: 'fire' };
const poisoned = { poisonT: 3 };
const stunned = { stun: 0.6 };
ok((elemReactionOn('fire', frozen) || {}).key === 'steam', '火打冻结目标 = 蒸汽爆裂');
ok((elemReactionOn('ice', burning) || {}).key === 'steam', '冰打燃烧目标 = 蒸汽爆裂（对称）');
ok(elemReactionOn('fire', burning) === null, '火打燃烧目标**不**反应（同元素）');
ok(elemReactionOn('ice', frozen) === null, '冰打冻结目标不反应（同元素）');
ok(elemReactionOn('phys', frozen) === null && elemReactionOn('phys', poisoned) === null,
  '物理打什么都不反应');
ok(elemReactionOn('none', frozen) === null, 'elem:"none"（部分投射物）不反应');
ok((elemReactionOn('lightning', poisoned) || {}).key === 'corrochain', '雷打中毒目标 = 腐蚀链');
ok((elemReactionOn('poison', stunned) || {}).key === 'corrochain', '毒打麻痹目标 = 腐蚀链（对称）');
ok(elemReactionOn('fire', {}) === null, '目标身上什么都没有就不反应');
{
  /* 双状态：先命中的那条状态说了算（顺序固定） */
  const both = { slowT: 1, slow: 1, poisonT: 3 };
  ok((elemReactionOn('fire', both) || {}).key === 'steam',
    '目标同时冻结 + 中毒时，火先跟冰反应（状态表顺序固定，不随机）',
    (elemReactionOn('fire', both) || {}).key);
}

/* ============================================================
 * 五、接线：三道闸门 + 双层 ICD + 面板同源
 * ============================================================ */
console.log('五、接线');
ok(/this\.tryElemReaction\(e, elem, final, opts, inj \? \[inj\.key, inj\.sub\]\.filter\(Boolean\) : null\);/.test(gm),
  'damageEnemy 里真的调了 tryElemReaction（所有伤害的唯一出口），并把注入的主 / 副元素都当反应源');
ok(/elemReactReady\(e, hitElem, opts = \{\}, altElem\) \{[\s\S]{0,400}opts\.silent \|\| opts\.react \|\| this\._reacting/.test(gm),
  '三道闸门齐了：silent（dot 不重复触发）/ react（反应伤害不再反应）/ _reacting（递归锁）');
ok(/_reactCd\[r\.key\] = now \+ icd\.global/.test(gm) && /_reactAt\[r\.key\] = now \+ icd\.sameTarget/.test(gm),
  '双层 ICD：全局 + 同目标同反应');
ok(ELEM_REACT_ICD.global > 0 && ELEM_REACT_ICD.sameTarget > ELEM_REACT_ICD.global,
  '同目标冷却长于全局冷却（否则「同目标」这层等于没写）', ELEM_REACT_ICD);
ok(/this\._reacting = true;[\s\S]{0,120}finally \{ this\._reacting = false; \}/.test(gm),
  '结算包在 try/finally 里（抛异常也不会把递归锁焊死）');
ok(/\{ elem: elem, react: true, tag: 'aoe' \}/.test(gm) || /react: true/.test(gm),
  '反应自己造成的伤害带 react 标记（连锁不会滚成无限反应）');
ok(/e\._reactDot = false;/.test(gm), 'dot 跳完清掉「焚毒」标记（不会永久 ×1.5）');
ok(/if \(\(e\.dotT \|\| 0\) > 0 && !e\._reactDot\)/.test(gm),
  '焚毒只在本轮 dot 里加一次（反复触发不叠乘）');
ok(/tryElemReaction\(e, elem, final, opts, inj \? \[inj\.key, inj\.sub\]\.filter\(Boolean\) : null\);[\s\S]{0,600}法相命中附加/.test(gm),
  '反应判定在法相挂状态**之前**（否则同一发会跟自己挂的状态反应）');

/* 面板文案与表同源 */
ok(/row\('元素反应'/.test(uiJs), '说明页有一行「元素反应」');
ok(/ELEM_REACTIONS\.map\(r =>/.test(uiJs), '那一行是**遍历表**生成的，不是手写 6 条文案');
ok(/ELEM_REACT_ICD\.global/.test(uiJs), '冷却数字也从数据里读（改表就改文案）');
ok(/圣系 4 组[\s\S]{0,40}未做/.test(uiJs), '**明说**圣系 4 组未做（做了才许写，没做要写清楚）');

/* 加载顺序 */
ok(html.indexOf('src/data/data-elem.js') > 0, 'index.html 加载了 data-elem.js');
ok(html.indexOf('src/data/data-elem.js') < html.indexOf('src/game.js'),
  'data-elem.js 在 game.js 之前加载（game 里直接用表）');

/* ============================================================
 * 六、元素注入（P3b · 单元素）
 *
 * 方案 §6.1 的口径是「**附加，不转换**」：原伤害保留，元素再附加 30%~50%。
 * 这一节钉四件事：
 *   1. 门槛（角色等级 20）与适用范围（①②③⑤，④ 增益槽不算）；
 *   2. 附加比例跟**技能有效等级**走（10 级 30% → 20 级 50%），不是新造一个等级；
 *   3. 伤害真的是两段相加（不是把整发换成元素色）；
 *   4. 圣不参与（没有状态位、没有反应），面板与数据都不许出现它。
 * ============================================================ */
console.log('六、元素注入');
const SKILL_INJECT = pick('SKILL_INJECT');
const skillInjectPct = pick('skillInjectPct');
const skillCanInject = pick('skillCanInject');
const skillSlotOf = pick('skillSlotOf');
const saveSrc = readSrc('src/core/save.js');
const fx = readSrc('src/fx.js');
const uiSkSrc = readSrc('src/ui-skills.js');

ok(SKILL_INJECT.at === 20, '门槛是角色等级 20（前期不动数值）', SKILL_INJECT.at);
ok(SKILL_INJECT.elems.join(',') === 'fire,ice,lightning,poison',
  '可注入的四种元素：火 / 冰 / 雷 / 毒', SKILL_INJECT.elems);
ok(SKILL_INJECT.elems.indexOf('sigil') < 0, '**圣不在注入列表里**（没有状态位，注了也没有任何效果）');
ok(SKILL_INJECT.elems.indexOf('phys') < 0, '物理不在列表里（那就是「本命」）');

ok(skillInjectPct(1) === 30 && skillInjectPct(10) === 30, '有效等级 ≤10：附加 30%',
  [skillInjectPct(1), skillInjectPct(10)]);
ok(skillInjectPct(15) === 40, '有效等级 15：附加 40%', skillInjectPct(15));
ok(skillInjectPct(20) === 50 && skillInjectPct(25) === 50, '有效等级 20（含溢出）：附加 50%',
  [skillInjectPct(20), skillInjectPct(25)]);
ok(skillInjectPct(0) === 30 && skillInjectPct('x') === 30, '脏等级按最低档，不炸',
  [skillInjectPct(0), skillInjectPct('x')]);
{
  let mono = true;
  for (let lv = 11; lv <= 20; lv++) if (skillInjectPct(lv) < skillInjectPct(lv - 1)) mono = false;
  ok(mono, '11→20 单调不减（升级不会让注入变弱）',
    Array.from({ length: 11 }, (_, i) => skillInjectPct(10 + i)));
}

/* 适用范围：①②③⑤ 能注，④ 不能 */
ok(skillCanInject('whirl') === true, '① 位（旋风斩）能注入');
ok(skillCanInject('quake') === true, '② 位（裂地）能注入');
ok(skillCanInject('swordarray') === true, '③ 位（剑阵）能注入');
ok(skillCanInject('avatar') === true, '⑤ 位（兵形）能注入');
ok(skillCanInject('bloodrage') === false, '**④ 位（血怒）不能注入** —— 增益槽没有元素语义');
ok(skillCanInject('no_such_skill') === false, '不认识的技能一律不能注入');
ok((skillSlotOf('whirl') || {}).no === 1 && (skillSlotOf('bloodrage') || {}).no === 4,
  '位号取自 SKILL_ARCHETYPE（不自己维护第二张表）',
  [skillSlotOf('whirl'), skillSlotOf('bloodrage')]);

/* 接线：三道校验、取值优先级、两段相加、收尾清零 */
ok(/skillInject\(id\) \{[\s\S]{0,420}SKILL_INJECT\.at[\s\S]{0,200}skillCanInject\(id\)/.test(gm),
  'skillInject 里三道校验齐了：门槛 / 该位能不能注 / 键认不认识');
ok(/curInject\(opts\) \{[\s\S]{0,260}this\._proj && this\._proj\.inj[\s\S]{0,80}this\._elem/.test(gm),
  'curInject 的优先级：投射物 > 施法窗口（飞出去的那一发要带自己的注入）');
ok(/this\._elem = \(typeof this\.skillInjectPack === 'function'\) \? this\.skillInjectPack\(id\) : null;/.test(gm),
  'castSkill 把注入折成注入包放进施法窗口');
ok(/this\._elem = null;\s*\/\/ \[P3b\]/.test(gm), '施法收尾把 _elem 清零（窗口之外不注入）');
/* [P3d] 从「两段相加」升级成「N 段相加」：段数由 injectSegs 决定（单元素 1 段、混搭 2 段），
 * 每段各自过自己的抗性与元素词缀，最后和原伤害那段相加。 */
ok(/const segs = \(elem === 'none'\) \? null : this\.injectSegs\(inj, elem\);/.test(gm),
  'damageEnemy 把注入拆成若干段（injectSegs 负责剔除与命中元素相同的段）');
ok(/let mul = this\.elemHitMul\(e, elem, 1\);\s*\n\s*for \(let i = 0; i < segs\.length; i\+\+\) mul \+= this\.elemHitMul\(e, segs\[i\]\.key, segs\[i\]\.w\);/.test(gm),
  '**各段相加**：原伤害 100% + 附加 X%，各自过自己的抗性与元素词缀');
ok(/const inj = \(opts\.react \|\| opts\.silent\) \? null : this\.curInject\(opts\);/.test(gm),
  '反应伤害与持续伤害不参与注入（否则反应的爆炸会再被注入一次）');
ok(/elemHitMul\(e, key, w\) \{[\s\S]{0,240}elemAffixMul\(this\.state\.stats, key\)/.test(gm),
  'elemHitMul 乘的是「抗性 × 该元素增伤（通用 × 专属）× 权重」');
/* [P3c] 元素词缀表搬去了 data-elem.js，并把 sigil 也并进 elemDmg（统一口径）。
 * 这里只钉「两段读同一张表」这件事本身 —— 具体映射由 test-elem-affix 负责。 */
ok(/const ELEM_AFFIX = \{[\s\S]{0,200}sigil: 'elemDmg'/.test(elemSrc),
  '元素词缀表在模块级、只有一份（两段读同一张表，不许各写一份）');
ok(/elemAffixMul\(this\.state\.stats, key\)/.test(gm) && /final \*= elemAffixMul\(st, elem\);/.test(gm),
  '注入两段与原路径都走同一个 elemAffixMul（口径不分裂）');
ok(/inj: this\._elem,/.test(gm) && /inj: opts\.inj \|\| null/.test(fx), 
  '玩家投射物把注入复制到自己身上（fx.js 存 p.inj）');
ok(/const prevProj = this\._proj;[\s\S]{0,160}this\._proj = prevProj;/.test(gm),
  '命中期间挂 _proj，回调里的 damageEnemy 才拿得到注入');

/* 面板与存档 */
ok(/data-inj="\$\{id\}:\$\{k \|\| ''\}"/.test(uiSkSrc), '面板上每个元素都是可点的（data-inj）');
ok(/sb-ilist/.test(uiSkSrc), '注入行有独立类名（不与取向 / 变体 / 精通的委托撞车）');
ok(/境界达到 \$\{injDefs\.at\} 级后可给这个技能位注入元素/.test(uiSkSrc),
  '没到门槛时写明「几级开启」（不是把按钮藏起来让人猜）');
ok(/Game\.setSkillInject\(parts\[0\], parts\[1\] \|\| null\)/.test(uiSkSrc),
  '点击走 Game.setSkillInject（失败会 toast，不静默吞掉）');
ok(/_obj\(d\.skills\)/.test(saveSrc), '存档的 skills 是整块保留 —— `el` 不需要再加白名单');

/* 反向断言：口径是「附加」不是「转换」 */
ok(!/final = dmg \* this\.elemHitMul/.test(gm),
  '**不是转换**：原伤害那一份必须留着（写成 `=` 就变成纯色换皮了）');
ok(!/sigil/.test(JSON.stringify(SKILL_INJECT)), 'SKILL_INJECT 里不许出现 sigil');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
