/* ============================================================
 * [B16.3 / B16.5] 可破坏目标的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-destructible.js
 *
 * 「图腾 / 卵囊」这类东西的最省事写法是**新开一个数组**，
 * 但那样自动锁定、AoE 溅射、伤害结算全得再写一遍；
 * 更容易犯的错是图省事**直接复用 `enemies` 而不做区分**，
 * 于是图腾会追人、会占同屏怪名额、打掉还给经验。
 *
 * 这一节钉的就是「复用了，但四处该放行的地方都放行了」：
 *   1. 三个入口都在（立 / 读秒 / 收场）；
 *   2. 同屏上限不算它（两处循环都要改，漏一处就是「怪不刷了」）；
 *   3. AI 段早退，且放在 debuff 计时**之后**（毒要能烧掉它）；
 *   4. 击杀结算段早退，且在**经验**之前（否则是一条刷经验的路）；
 *   5. 读秒按帧递减，全文件不许出现 setTimeout；
 *   6. 收场只有一个出口，两条路径各回各的回调，且不会触发两次。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_load');

const gm = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
const at = s => gm.indexOf(s);
/* 从签名切到下一个同级方法：够用的近似是「再下一次出现两个空格 + 标识符(」 */
function bodyOf(sig, len = 4200) {
  const i = at(sig);
  if (i < 0) return '';
  return gm.slice(i, i + len);
}

console.log('一、三个入口');
const spawnB = bodyOf('  spawnDestructible(opts) {', 5200);
const tickB = bodyOf('  _tickDestructible(e, dt) {', 1400);
const killB = bodyOf('  destroyDestructible(e, expired) {', 1800);
ok(spawnB.length > 1200, 'spawnDestructible 存在且不是空壳', spawnB.length);
ok(tickB.length > 300, '_tickDestructible 存在', tickB.length);
ok(killB.length > 400, 'destroyDestructible 存在', killB.length);
ok(/kind === 'sac'/.test(bodyOf('  _buildDestructibleModel(o) {', 2200)),
  '模型按 kind 分叉（卵囊 ≠ 图腾，不是同一根柱子换个颜色）');
ok(/e\.bar = makeHpBar/.test(spawnB), '带血条（它是"有血量的东西"，不是特效）');
ok(/this\.enemies\.push\(e\)/.test(spawnB), '进 enemies —— 自动锁定 / 溅射 / 伤害结算全都免费继承');
ok(/n >= 24/.test(spawnB), '有兜底上限（防「每 3 秒召一根」参数写错就满屏）');

console.log('二、同屏上限不算它');
{
  const cap = gm.match(/if \(!e\.dead && !e\.boss && !e\.destructible\) alive\+\+/g) || [];
  ok(cap.length >= 2, '两处存活统计都排除了 destructible（漏一处就是「怪不刷了」）', cap.length);
}

console.log('三、AI 段早退');
{
  const ue = bodyOf('  updateEnemies(dt) {', 12000);
  const iTick = ue.indexOf('if (e.destructible) { this._tickDestructible');
  const iDot = ue.indexOf("if (e.dotT > 0) {");
  const iAI = ue.indexOf('if (e.boss) { this.updateBossAI');
  ok(iTick > 0, 'updateEnemies 里有 destructible 早退');
  ok(iTick > iDot, '早退在 DoT 计时之后 —— 毒 / 流血照样能烧掉它', [iDot, iTick]);
  ok(iTick < iAI, '早退在 AI 段之前 —— 它不会追人、不会挥刀', [iTick, iAI]);
  ok(/continue;/.test(ue.slice(iTick, iTick + 120)), '早退真的 continue 了（不是只调一下又放行）');
}

console.log('四、击杀结算段早退');
{
  const od = bodyOf('  onEnemyDeath(e) {', 600);
  const iBranch = od.indexOf('if (e.destructible)');
  const iXp = gm.slice(at('  onEnemyDeath(e) {')).indexOf('// 经验');
  ok(iBranch > 0, 'onEnemyDeath 一进来就分流');
  ok(od.indexOf('destroyDestructible(e, false)') > 0, '分流到 destroyDestructible(e,false) —— 打掉');
  ok(iBranch < iXp, '分流在**经验**之前（接上就是一条无限刷经验的路）', [iBranch, iXp]);
  ok(iXp > 0, '「// 经验」这一段还在（说明判定的是真实位置）');
}

console.log('五、读秒：按帧递减，不是 setTimeout');
{
  ok(!/setTimeout|setInterval/.test(tickB), '_tickDestructible 里没有 setTimeout / setInterval（切图会漏）');
  ok(/d\.ttl = Math\.max\(0, d\.ttl - dt\)/.test(tickB), '读秒按帧递减');
  ok(/this\.destroyDestructible\(e, true\)/.test(tickB), '归零 → destroyDestructible(e,true)（到点那条路）');
  ok(/d\.ring\.scale\.setScalar/.test(tickB), '读秒环跟着缩（玩家不用读数字）');
  ok(/panic/.test(tickB), '最后 1.6 秒开始抖 —— 这是"来不及了"唯一的非读数提示');
}

console.log('六、收场只有一个出口');
{
  ok(/if \(!e \|\| e\.dead \|\| !e\.destructible\) return false;/.test(killB),
    '守卫齐全（重复伤害 / 已消失还会回调 = 双触发）');
  ok(/const cb = expired \? d\.onExpire : d\.onDeath;/.test(killB), '两条路径各回各的回调');
  ok(/if \(typeof cb === 'function'\) cb\(e, p\);/.test(killB), '回调带 (e, 位置快照)');
  ok(/disposeTree\(d\.ring\)/.test(killB), '读秒环走 disposeTree（scene.remove 会漏材质）');
  ok(/e\.actor\.anim = 'die'/.test(killB), '演"倒下"（否则图腾笔直站满 3 秒，看起来像没打死）');
}

console.log('七、它也会被 DoT / 毒层数认作合法目标');
{
  ok(/poisonN: 0, poisonNT: 0/.test(spawnB), '带毒层数字段（毒爆能选它当目标）');
  ok(/dotT: 0, dotTick: 0/.test(spawnB), '带 DoT 字段（流血 / 灼烧能烧它）');
  ok(/resist: \{\}/.test(spawnB), '抗性表存在且为空（伤害结算读 e.resist[elem] 不会炸）');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
