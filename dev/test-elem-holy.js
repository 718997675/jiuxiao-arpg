/* ============================================================
 * 技能 P3a 补齐契约：圣系 4 组反应（node 直跑，不开浏览器）
 *
 *   node dev/test-elem-holy.js
 *
 * P3a 当时只做了 6/10，圣系那 4 组留了尾巴 —— 引擎里 `sigil` 只是个伤害类型，
 * 打完什么都不留，反应表没有可判的「状态位」。这次补上「**圣印**」（`e.sigilT`）。
 *
 * 这一节钉五件事：
 *   1. 圣印：sigil 命中才盖、6 秒、只刷新不叠加、反应伤害不盖；
 *   2. 表结构：4 组圣系反应，收益字段是 `heal` / `shield` / `vsUndead`，
 *      不是单纯的 `dmg`（圣系是给玩家的，不是给敌人的）；
 *   3. 优先级：圣印排状态表**最后**，不能把「火 + 冰」的蒸汽爆裂吃掉；
 *   4. 结算：回血 / 护盾 / 亡灵判定 / 首领判定 / 回血雾，全部真的落在玩家身上；
 *   5. 文案：说明页讲清「圣印」，且不许再写「圣系未做」。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const ELEM_REACTIONS = pick('ELEM_REACTIONS');
const ELEM_STATUS = pick('ELEM_STATUS');
const SIGIL_MARK = pick('SIGIL_MARK');
const elemReaction = pick('elemReaction');
const elemReactionOn = pick('elemReactionOn');
const elemStatusList = pick('elemStatusList');
const elemStatusOn = pick('elemStatusOn');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gm = readSrc('src/game.js');
const uiJs = readSrc('src/ui.js');
const elemSrc = readSrc('src/data/data-elem.js');

const holy = ELEM_REACTIONS.filter(r => r.a === 'sigil' || r.b === 'sigil');
const byKey = k => holy.find(r => r.key === k) || {};

/* ============================================================
 * 一、圣印：圣系反应的状态位
 * ============================================================ */
console.log('一、圣印');
ok(SIGIL_MARK && SIGIL_MARK.dur === 6, '圣印 6 秒（一套连招的量级）', SIGIL_MARK);
ok(elemStatusOn({ sigilT: 1 }, 'sigil') === true, '有圣印 = 有圣状态');
ok(elemStatusOn({ sigilT: 0 }, 'sigil') === false, '印记到时间就不算');
ok(elemStatusOn({}, 'sigil') === false, '从没盖过也不算');
ok(/sigilT: 0,/.test(gm), '敌人生成时显式初始化 sigilT（不留 undefined 分支）');
ok(/if \(e\.sigilT > 0\) e\.sigilT = Math\.max\(0, e\.sigilT - dt\);/.test(gm),
  '圣印每帧递减（挂在 stun 的 continue 之前，眩晕的怪不会把印记冻住）');
ok(/if \(e\.sigilT > 0\) e\.sigilT = Math\.max\(0, e\.sigilT - dt\);[\s\S]{0,200}if \(e\.stun > 0\) \{/.test(gm),
  '递减在 stun 早退**之前**（否则一波控住就能白嫖 6 秒圣系反应）');
ok(/elem === 'sigil' && !opts\.react[\s\S]{0,160}e\.sigilT = Math\.max\(e\.sigilT \|\| 0, SIGIL_MARK\.dur\)/.test(gm),
  'sigil 命中就盖印，`opts.react` 的伤害不盖（否则反应自己给自己续命）');
ok(/e\.sigilT = Math\.max\(e\.sigilT \|\| 0, SIGIL_MARK\.dur\);[\s\S]{0,400}this\.tryElemReaction\(/.test(gm),
  '盖印在反应判定**之前**（圣符打在燃烧目标上必须算数）');

/* ============================================================
 * 二、表结构：圣系 4 组，收益落在玩家身上
 * ============================================================ */
console.log('二、表结构');
ok(holy.length === 4, '圣系 4 组', holy.map(r => r.key));
ok(byKey('purify').name === '净化烈焰' && byKey('holyfrost').name === '圣霜'
  && byKey('judgment').name === '天罚' && byKey('cleansmist').name === '解毒雾',
  '四组名字与方案 §6.2 一致', holy.map(r => r.name));
ok(byKey('purify').vsUndead === 30,
  '净化烈焰：对亡灵 **+30%**（方案 §6.2 的硬指标）', byKey('purify').vsUndead);
ok(byKey('purify').heal > 0,
  '净化烈焰：回血 —— 方案写的是「击杀回血」，实装改成**立刻回 3%**（窗口内击杀回血面板看不见，' +
  '打不死目标时这组反应等于白触发）', byKey('purify').heal);
ok(byKey('holyfrost').shieldMul === 25,
  '圣霜：护盾吸收量 **+25%**（方案 §6.2 的硬指标）', byKey('holyfrost').shieldMul);
ok(byKey('judgment').vsBoss === 15,
  '天罚：对首领 **+15%**（方案 §6.2 的硬指标）', byKey('judgment').vsBoss);
ok(byKey('cleansmist').mist && byKey('cleansmist').mist.dps > 0,
  '解毒雾：持续回血（方案「范围内友方持续回血」）', byKey('cleansmist'));
ok(holy.every(r => r.color && r.color2), '四组都有主副两色（圣系统一是金白基调）');
ok(holy.every(r => r.name && r.desc), '四组都有名字与说明（面板遍历表生成文案）');

/* ============================================================
 * 三、优先级：圣印是底色，不许吃掉别的反应
 * ============================================================ */
console.log('三、优先级');
ok(Object.keys(ELEM_STATUS).slice(-1)[0] === 'sigil',
  '圣排状态表最后（顺序即优先级）', Object.keys(ELEM_STATUS));
ok((elemReactionOn('fire', { slowT: 1, slow: 1, sigilT: 3 }) || {}).key === 'steam',
  '目标同时「冻结 + 圣印」时，火优先出蒸汽爆裂（圣印不许抢）',
  (elemReactionOn('fire', { slowT: 1, slow: 1, sigilT: 3 }) || {}).key);
ok((elemReactionOn('ice', { dotT: 2, dotElem: 'fire', sigilT: 3 }) || {}).key === 'steam',
  '火 dot + 圣印 + 冰命中 → 蒸汽爆裂优先（圣印让位给元素互碰）');
ok((elemReactionOn('fire', { sigilT: 3 }) || {}).key === 'purify',
  '目标**只有**圣印时，火命中 → 净化烈焰（没有别的元素可抢）');
ok((elemReactionOn('sigil', { dotT: 2, dotElem: 'fire' }) || {}).key === 'purify',
  '反过来：圣命中燃烧目标 → 净化烈焰（同一组，方向无关）');
ok(elemReactionOn('sigil', { sigilT: 3 }) === null, '圣打圣印不反应（同元素）');
ok(elemReactionOn('sigil', {}) === null, '圣打白板目标不反应');
ok((elemReactionOn('fire', { sigilT: 3, slowT: 1, slow: 1 }) || {}).key === 'steam',
  '圣印在场也不会让「火 + 冰」降级成圣系');

/* ============================================================
 * 四、结算：收益真的落在玩家身上
 * ============================================================ */
console.log('四、结算');
/* 净化烈焰：亡灵判定 + 回血 */
ok(/const undead = e\.family === 'undead';/.test(gm),
  '净化烈焰读 `family === "undead"` 判亡灵（data-monsters 里骷髅 / 僵尸 / 怨魂都是）');
ok(/const kp = r\.dmg \/ 100 \* \(undead \? 1 \+ r\.vsUndead \/ 100 : 1\);/.test(gm),
  '「对亡灵 +30%」乘在**这一发**的追加伤害上（不开窗口 buff —— 面板看不见的增益等于没做）');
ok(/this\.healPlayer\(this\.state\.stats\.hpMax \* r\.heal \/ 100\);/.test(gm),
  '净化烈焰按最大生命百分比回血（不吃固定值，等级越高越有用）');
ok(/\{ elem: 'sigil', react: true, tag: 'aoe' \}/.test(gm),
  '追加的圣伤带 react 标记（不会再触发一次反应）');

/* 圣霜：护盾 */
ok(/const add = stS\.hpMax \* r\.shield \/ 100 \* \(1 \+ \(stS\.shieldBonus \|\| 0\) \/ 100\) \* \(1 \+ r\.shieldMul \/ 100\);/.test(gm),
  '圣霜护盾 = 最大生命 × 8% × 护盾强度 × 1.25');
ok(/if \(add > \(this\.shield \|\| 0\)\) \{[\s\S]{0,200}this\.shield = add;/.test(gm),
  '护盾取 max 不叠加（冰环连着砸不会刷成第二条血条）');
ok(/this\.shieldT = Math\.max\(this\.shieldT \|\| 0, r\.dur\);/.test(gm), '圣霜护盾有自己的持续时间');

/* 天罚：首领 */
ok(/const kb = e\.boss \? 1 \+ r\.vsBoss \/ 100 : 1;/.test(gm),
  '天罚对首领 ×1.15（非首领照打，只是没有加成）');

/* 解毒雾：回血雾 */
ok(/this\.healMist = \{ t: r\.mist\.dur, tick: 0, dps: r\.mist\.dps, r: r\.mist\.r \};/.test(gm),
  '解毒雾挂一个玩家侧计时器（不新建地面实体）');
ok(/if \(this\.healMist && this\.healMist\.t > 0\)[\s\S]{0,1400}if \(hm\.t <= 0\) this\.healMist = null;/.test(gm),
  '回血雾在玩家 tick 里结算，走完自己清掉');
ok(/if \(this\.state\.hp < stM\.hpMax\) this\.healPlayer\(amount, true\);/.test(gm),
  '回血雾 silent 回血（每跳都弹字会把屏幕刷满 +N）');
ok(/for \(const al of \(this\.allies \|\| \[\]\)\)[\s\S]{0,300}al\.hp = Math\.min\(al\.maxHp, al\.hp \+ amount\);/.test(gm),
  '半径内的灵兽也回血（方案说的「友方」= 玩家 + 召唤物）');
ok(/if \(!ap \|\| DIST2D\(ap, pp0\) > hm\.r\) continue;/.test(gm),
  '灵兽要**在雾里**才回（按距离判，不是无差别全图回血）');
ok(/this\.healMist = null;/.test(gm), '换图 / 重开清掉回血雾（不然会跨图续着回）');

/* ============================================================
 * 五、文案与红线
 * ============================================================ */
console.log('五、文案');
ok(/圣印/.test(uiJs), '说明页讲「圣印」（面板要能兑现这套机制）');
ok(!/圣系 4 组[\s\S]{0,40}未做/.test(uiJs), '**不许**再写「圣系 4 组未做」');
ok(!/没有对应的状态位/.test(uiJs), '**不许**再写「圣没有对应的状态位」');
ok(/SIGIL_MARK/.test(uiJs), '印记时长从数据里读（改表就改文案）');
ok(!/玄冰护盾消散/.test(gm), '护盾消散文案不再写死「玄冰」（圣霜走同一个字段）');
ok(/elem === 'sigil'/.test(gm) && !/SKILL_INJECT[\s\S]{0,80}'sigil'/.test(elemSrc),
  '圣有状态位了，但**仍然不进注入列表**（职业元素身份，理由写在 SKILL_INJECT 注释里）');
ok(/圣是道士的职业元素身份/.test(elemSrc), '数据层写清「圣为什么不给注」（下次别又改成能注）');

/* ============================================================
 * 六、口径：圣系不做窗口 buff
 * ============================================================ */
console.log('六、口径');
ok(!/purifyT|judgmentT|holyT\b/.test(gm),
  '**没有**给圣系开窗口计时器字段 —— 条件加成全部当场结算');
ok(/不做窗口 buff/.test(elemSrc),
  '数据层写明这条口径（窗口 buff 面板看不见 = 文案与实装对不上）');
ok(holy.every(r => !r.dmg || (r.dmg >= 20 && r.dmg <= 50)),
  '圣系里带伤害的两组也在 20~50% 之间（和另外六组同口径）', holy.map(r => r.dmg));

console.log(`\n${fail ? '✗' : '✓'} 圣系反应契约：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
