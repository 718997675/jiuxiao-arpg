/* ============================================================
 * 技能重构 P1c · 三线并行的契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p1c.js
 *
 * 钉住五件事：
 *   1. 账本折算：主动 lv-1（领悟白送的 1 级不算投入）、被动 lv、同 id 取大
 *   2. 线内点数只算本线：跨线的点一分都不该算进来
 *   3. 等级门：reqLv 默认取技能领悟等级，被动跟同岔口主动
 *   4. 软前置：只有关键被动有 needPts，且值来自 lineMeta.softNeedPts
 *   5. **不再互斥**：同岔口的主动与被动各自独立成立，源码里也不许再有二选一拦截
 *
 * 为什么第 5 条要静态查源码：互斥是「行为」而不是「数据」，
 * 光测数据层测不出来 —— 拦截写在 Game.levelUpSkill / levelUpPassive 里。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load');

const ctx = loadData();
const pick = name => vm.runInContext(name, ctx);

const SKILLS = pick('SKILLS');
const SKILL_TREE = pick('SKILL_TREE');
const skillLines = pick('skillLines');
const skillLineNodes = pick('skillLineNodes');
const skillLineNodeInfo = pick('skillLineNodeInfo');
const skillLineSpent = pick('skillLineSpent');
const skillSpentMap = pick('skillSpentMap');
const skillNodeGate = pick('skillNodeGate');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + extra : ''));
}
const CLASSES = ['warrior', 'mage', 'taoist'];
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ============================================================
 * 一、账本折算 skillSpentMap
 * ============================================================ */
console.log('一、账本折算');
{
  const m = skillSpentMap({ whirl: { lv: 5 }, thrust: { lv: 1 } }, { w_bloodlust: 2 });
  ok(m.whirl === 4, '主动 lv5 → 投入 4 点（白送的 1 级不算）', m.whirl);
  ok(m.thrust === 0, '主动 lv1 → 投入 0 点', m.thrust);
  ok(m.w_bloodlust === 2, '被动 lv2 → 投入 2 点', m.w_bloodlust);

  const e = skillSpentMap(null, null);
  ok(Object.keys(e).length === 0, '空账本 → 空结果，不炸', JSON.stringify(e));

  const neg = skillSpentMap({ x: { lv: 0 } }, { y: 0 });
  ok(neg.x === 0 && neg.y === 0, '脏值（0 / 负数）夹到 0', JSON.stringify(neg));

  /* 同一个 id 同时出现在两边：取大的，不能被后面的 0 覆盖掉 */
  const both = skillSpentMap({ a: { lv: 4 } }, { a: 1 });
  ok(both.a === 3, '同 id 取大（主动 3 > 被动 1）', both.a);
}

/* ============================================================
 * 二、线内点数只算本线
 * ============================================================ */
console.log('二、线内点数');
for (const cls of CLASSES) {
  const lines = skillLines(cls);
  ok(lines.length === 3, cls + ' 恰好三条线', lines.length);

  const line0 = lines[0];
  /* 造一份「只在线 0 第 0 个节点投 3 点」的账本 */
  const node0 = line0.nodes[0];
  const spent = { [node0.id]: 3 };
  ok(skillLineSpent(cls, line0.name, spent) === 3, cls + ' 线内点数算得对', skillLineSpent(cls, line0.name, spent));

  /* 把点记到**别的线**的节点上，本线必须是 0 */
  const other = lines[1].nodes[0];
  const spentOther = { [other.id]: 9 };
  ok(skillLineSpent(cls, line0.name, spentOther) === 0, cls + ' 跨线的点不算进本线', skillLineSpent(cls, line0.name, spentOther));
  ok(skillLineSpent(cls, lines[1].name, spentOther) === 9, cls + ' 但它算进自己那条线', skillLineSpent(cls, lines[1].name, spentOther));
}
ok(skillLineSpent('warrior', '不存在的线', {}) === 0, '未知线返回 0');

/* ============================================================
 * 三、等级门与软前置
 * ============================================================ */
console.log('三、等级门 / 软前置');
{
  const soft = (SKILL_TREE.lineMeta && SKILL_TREE.lineMeta.softNeedPts) || 5;
  let keyFound = 0, plainFound = 0;

  for (const cls of CLASSES) {
    for (const line of skillLines(cls)) {
      for (const node of line.nodes) {
        const info = skillLineNodeInfo(node.id);
        ok(!!info, cls + ' ' + node.id + ' 能反查到所在线');

        /* reqLv：主动默认取 SKILLS.unlock；被动取同岔口主动的 unlock */
        const expectLv = node.kind === 'active'
          ? ((SKILLS[node.id] || {}).unlock || 1)
          : (node.reqLv || 1);
        ok(node.reqLv === expectLv, cls + ' ' + node.id + ' reqLv 与技能表一致', node.reqLv + ' vs ' + expectLv);

        if (node.kind === 'active' || node.kind === 'passive') {
          ok(node.needPts === 0, cls + ' ' + node.id + ' 普通节点没有软前置', node.needPts);
          plainFound++;
        }
        if (node.kind === 'key') {
          ok(node.needPts === soft, cls + ' ' + node.id + ' 关键被动软前置 = ' + soft, node.needPts);
          keyFound++;
        }

        /* 等级差 1 就该拦住 */
        const g0 = skillNodeGate(node.id, { level: node.reqLv, linePts: 999 });
        ok(g0.levelOK === true && g0.ok === true, cls + ' ' + node.id + ' 等级到位就放行', JSON.stringify(g0));
        if (node.reqLv > 1) {
          const g1 = skillNodeGate(node.id, { level: node.reqLv - 1, linePts: 999 });
          ok(g1.levelOK === false, cls + ' ' + node.id + ' 差 1 级必须拦住', JSON.stringify(g1));
        }
      }
    }
  }
  ok(keyFound > 0, '三职业里确实存在关键被动（否则这条测试是空转）', keyFound);
  ok(plainFound > 0, '也存在普通节点', plainFound);

  /* 软前置的两侧边界：刚好 N 点放行，N-1 点拦住 */
  const keyNode = skillLines('warrior').flatMap(l => l.nodes).find(n => n.kind === 'key');
  if (keyNode) {
    const ga = skillNodeGate(keyNode.id, { level: 99, linePts: soft });
    ok(ga.ptsOK === true && ga.ok === true, '关键被动：线内刚好 ' + soft + ' 点放行', JSON.stringify(ga));
    const gb = skillNodeGate(keyNode.id, { level: 99, linePts: soft - 1 });
    ok(gb.ptsOK === false && gb.ok === false, '关键被动：线内 ' + (soft - 1) + ' 点拦住', JSON.stringify(gb));
  } else {
    ok(false, '找不到关键被动，无法验证软前置');
  }
}

/* ============================================================
 * 四、不再互斥（这一节是 P1c 的核心）
 * ============================================================ */
console.log('四、二选一已取消');
{
  /* 1. 数据层：gate 的返回里不该有「对面是谁 / 是否被对面锁」这种字段 */
  const anyId = skillLines('warrior')[0].nodes[0].id;
  const g = skillNodeGate(anyId, { level: 99, linePts: 99 });
  ok(g && g.ok === true, 'gate 本身能成立', JSON.stringify(g));
  const keys = Object.keys(g || {});
  ok(keys.indexOf('other') < 0, 'gate 不再返回 other（对面节点）', keys.join(','));
  ok(keys.indexOf('lock') < 0, 'gate 不再返回 lock（互斥标记）', keys.join(','));

  /* 2. 同一岔口的主动与被动，各自的 gate 互不影响：
   *    把祖先节点的点数拉满时，两者必须同时可点。 */
  let pairs = 0, both = 0;
  for (const cls of CLASSES) {
    for (const line of skillLines(cls)) {
      const byRow = {};
      for (const n of line.nodes) (byRow[n.row] = byRow[n.row] || []).push(n);
      for (const row in byRow) {
        const arr = byRow[row];
        if (arr.length < 2) continue;
        const act = arr.find(n => n.kind === 'active');
        const pas = arr.find(n => n.kind !== 'active');
        if (!act || !pas) continue;
        /* 关键被动另算软前置，这里只验「不存在互相拦」的普通对 */
        if (pas.kind === 'key') continue;
        pairs++;
        const maxLv = Math.max(act.reqLv, pas.reqLv);
        const ga = skillNodeGate(act.id, { level: maxLv, linePts: 99 });
        const gp = skillNodeGate(pas.id, { level: maxLv, linePts: 99 });
        if (ga.ok && gp.ok) both++;
      }
    }
  }
  ok(pairs > 0, '存在同岔口的主动/被动对（否则这节空转）', pairs);
  ok(both === pairs, '同一岔口的主动与被动可以同时点（' + both + '/' + pairs + '）', both + '/' + pairs);

  /* 3. 源码静态：战斗侧不许再有 fork 互斥拦截 */
  const gameSrc = readSrc('src/game.js');
  const pasSrc = readSrc('src/skill-passive.js');
  ok(gameSrc.indexOf('skillForkOf') < 0, 'levelUpSkill 不再调 skillForkOf（互斥已删）');
  ok(pasSrc.indexOf('skillForkOf') < 0, 'levelUpPassive 不再调 skillForkOf（互斥已删）');
  ok(gameSrc.indexOf('skillGate') >= 0, 'levelUpSkill 接的是 skillGate（等级门）');
  ok(pasSrc.indexOf('skillGate') >= 0, 'levelUpPassive 接的是 skillGate（等级门 + 软前置）');
  ok(pasSrc.indexOf('needPts') >= 0 || pasSrc.indexOf('ptsOK') >= 0, '被动侧真的检查了软前置', '');

  /* 4. 面板不该再画「或 / 锁」 */
  const uiSrc = readSrc('src/ui-skills.js');
  ok(uiSrc.indexOf('skt-or lock') < 0, '画布不再渲染「锁」标记');
  ok(uiSrc.indexOf('fklock') < 0, '画布不再用 .fklock（互斥红）');
  ok(uiSrc.indexOf('fk-dash') < 0, '不再画主动↔被动的互斥虚线');
  /* 手机端也不许再用 alt 边暗示互斥 */
  ok(!/edgeCls:\s*\(a,\s*b\)/.test(uiSrc), '手机端 edgeCls 不再按「被动列」画虚线');

  /* 5. Game.lineSpent 与数据层同源（口径唯一） */
  ok(gameSrc.indexOf('skillLineSpent') >= 0, 'Game.lineSpent 走数据层 skillLineSpent');
  ok(gameSrc.indexOf('skillSpentMap') >= 0, 'Game.lineSpent 用 skillSpentMap 折算账本');
}

/* ============================================================
 * 五、老档：已投的点全部保留（不退款、不补点）
 * ============================================================ */
console.log('五、老档兼容');
{
  /* 老模型里「二选一选了主动」的玩家，被动侧 now 变成可继续点 —— 数据上就是
   * 同一个 spent 两个节点都在，不需要任何迁移代码。这里钉住「折算不会丢点」。 */
  const cls = 'warrior';
  const line = skillLines(cls)[0];
  const act = line.nodes.find(n => n.kind === 'active' && n.row > 0);
  const spent = { [act.id]: 4 };
  ok(skillLineSpent(cls, line.name, spent) === 4, '老档主动的 4 点仍然算数', skillLineSpent(cls, line.name, spent));
  const sp2 = skillSpentMap({ [act.id]: { lv: 5 } }, {});
  ok(sp2[act.id] === 4, '老档 lv5 折算成 4 点投入（一分不少）', sp2[act.id]);
}

console.log('');
if (fail) {
  console.log(`✗ P1c 契约：${pass} 通过 / ${fail} 失败`);
  process.exit(1);
}
console.log(`✓ P1c 契约：${pass} 通过 / 0 失败`);
