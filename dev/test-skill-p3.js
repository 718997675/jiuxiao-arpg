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
ok(/this\.tryElemReaction\(e, elem, final, opts\);/.test(gm),
  'damageEnemy 里真的调了 tryElemReaction（所有伤害的唯一出口）');
ok(/elemReactReady\(e, hitElem, opts = \{\}\) \{[\s\S]{0,320}opts\.silent \|\| opts\.react \|\| this\._reacting/.test(gm),
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
ok(/this\.tryElemReaction\(e, elem, final, opts\);[\s\S]{0,400}法相命中附加/.test(gm),
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

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3a 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
