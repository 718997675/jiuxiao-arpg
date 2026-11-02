/* ============================================================
 * [B16.4] 正面格挡（岩甲 / 盾）的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-frontguard.js
 *
 * 这一条原本是刑天 P2 手写死的：`if (e.wbBlockFront)` + 75° + `*= 0.4`。
 * 石甲巨魔 / 髓主 / 南天守门神 三只用的是同一套机制，但**三个数都不同**
 * （120° / −80% / 转身 1.2 秒）。照抄一份 if 就是三份会各自走散的代码。
 *
 * 所以抽成 `e.guardFront = { arc, mul, turn }`：
 *   1. 默认值 = 刑天当年那三个数，老路径一个字节都不变；
 *   2. `wbBlockFront` 继续被认（世界 Boss 的 P2 还在写它）；
 *   3. `arc` 是**总**张角 —— 半角换算只能在一个地方写，写错就是「永远格挡」；
 *   4. `turn` 接进转身插值 —— 不接的话「转身要 1.2 秒」这句文案是假的。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_load');

const gm = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
const wbf = fs.readFileSync(path.join(ROOT, 'src/worldboss-fight.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};
function bodyOf(sig, len = 3000) {
  const i = gm.indexOf(sig);
  if (i < 0) return '';
  return gm.slice(i, i + len);
}

console.log('一、默认值就是刑天当年那三个数');
{
  const m = gm.match(/const FRONT_GUARD_DEFAULT = \{ arc: (\d+), mul: ([\d.]+), turn: ([\d.]+) \};/);
  ok(!!m, 'FRONT_GUARD_DEFAULT 存在');
  if (m) {
    ok(+m[1] === 150, 'arc 150° = 原来的 ±75° 窗口', m[1]);
    ok(Math.abs(+m[2] - 0.4) < 1e-9, 'mul 0.4 = 原来折减到四成', m[2]);
    ok(Math.abs(+m[3] - 0.48) < 1e-9, 'turn 0.48 秒', m[3]);
  }
}

console.log('二、读口：数据优先，老布尔位兜底');
{
  const b = bodyOf('  frontGuardOf(e) {', 700);
  ok(/if \(e\.guardFront\) return e\.guardFront;/.test(b), '先读 e.guardFront（新数据）');
  ok(/if \(e\.wbBlockFront\) return FRONT_GUARD_DEFAULT;/.test(b), '再退到 e.wbBlockFront（世界 Boss 的旧路径）');
  ok(/return null;/.test(b), '都没有 → null（不挡）');
  ok(/const fg = this\.frontGuardOf\(e\);/.test(gm), 'damageEnemy 真的走这个读口');
  ok(!/if \(e\.wbBlockFront && !opts\.silent/.test(gm), '旧的 `if (e.wbBlockFront && …)` 直判已经拆掉（不是两套并存）');
}

console.log('三、三个数真的被用上');
{
  const b = bodyOf('  damageEnemy(e, dmg, crit, opts = {}) {', 6000);
  ok(/Math\.abs\(da\) <= Math\.PI \* fg\.arc \/ 360/.test(b), '张角用 fg.arc，且半角换算只写这一处（π·arc/360）');
  ok(/final \*= fg\.mul;/.test(b), '折减用 fg.mul（不是写死 0.4）');
  ok(!/Math\.PI \* 75 \/ 180/.test(b), '没有残留写死的 75°');
  ok(/fg\.text \|\| '格挡 · 绕后'/.test(b), '提示文案可覆盖，默认还是那句');
}

console.log('四、转身速度接进插值');
{
  ok(!/Math\.pow\(0\.002, dt\)/.test(gm), '旧的写死转身常数已经不在了');
  const b = bodyOf("    const turnSec = (e.guardFront && e.guardFront.turn)", 400);
  ok(/const turnSec = \(e\.guardFront && e\.guardFront\.turn\) \|\| FRONT_GUARD_DEFAULT\.turn;/.test(b),
    'turnSec 从 guardFront 取，缺省回默认');
  ok(/Math\.pow\(0\.05, dt \/ turnSec\)/.test(b), '转过 95% 用时 = turnSec（口径写死在代码里，数据侧不用换算）');
}

console.log('五、挂 / 摘只有一个入口');
{
  const b = bodyOf('  setGuardFront(e, spec) {', 600);
  ok(/if \(!spec \|\| \(spec\.arc !== undefined && !\(spec\.arc > 0\)\)\) \{ e\.guardFront = null; return null; \}/.test(b),
    'arc 传 0 / 负数 = 摘掉；**不传** arc 不算摘掉（否则只调一个数会把整块格挡关掉）');
  ok(/Object\.assign\(\{\}, FRONT_GUARD_DEFAULT, spec\)/.test(b), '缺省字段从默认值补（调用方只写关心的那个）');
}

console.log('六、世界 Boss 的老路径没被删');
{
  ok(/e\.wbBlockFront = false;/.test(wbf), '阶段复位（_resetCombat）仍然写 wbBlockFront');
  ok(/if \(en\.blockFront\) e\.wbBlockFront = true;/.test(wbf), 'P2 进场仍然写 wbBlockFront');
}

console.log('七、文案与数字对得上（说 120°/−80%/1.2 秒，就得真给这三个数）');
{
  const html = fs.readFileSync(path.join(ROOT, 'docs/boss-vfx-playground.html'), 'utf8');
  const i = html.indexOf('MECH.stonearmor = {');
  const seg = i < 0 ? '' : html.slice(i, i + 600);
  ok(/正面 120°/.test(seg), 'counter 文案写着 120°');
  ok(/−80%/.test(seg) || /-80%/.test(seg), 'counter 文案写着 −80%');
  ok(/1\.2 秒/.test(seg), 'counter 文案写着转身 1.2 秒');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
