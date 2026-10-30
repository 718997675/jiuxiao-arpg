/* ============================================================
 * 领域（FX.field）契约（node 直跑，不开浏览器）
 *
 *   node dev/test-vfx-field.js
 *
 * 钉住五件事：
 *   1. 四种剪影都真的分支实现（不是同一个骨架换颜色）
 *   2. 半径不听亮度的（`FX.amp` 只许乘亮度 / 不透明度，不许乘 R）——
 *      领域圈是判定的视觉契约，画大一圈就是向玩家谎报范围
 *   3. 贴图必须缓存（每次施法都 new CanvasTexture = 显存与上传带宽双爆）
 *   4. 逐帧里不许 new 对象、不许挂 PointLight（与其它原语同一套纪律）
 *   5. 回收要连材质一起 dispose（领域一个 zone 有好几份材质）
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/fx.js'), 'utf8');
const game = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 把 `field(pos, opts = {}) { ... }` 整块抠出来（到同缩进的 `},\n` 为止） */
function block(name) {
  const start = src.indexOf('  ' + name + '(');
  if (start < 0) return '';
  /* 从**签名结束**的那个 `{` 开始数：`opts = {}` 里的空对象会让朴素的花括号
   * 配对当场归零，抽出来只有一行 */
  const sigEnd = src.indexOf(') {', start);
  let i = src.indexOf('{', sigEnd < 0 ? start : sigEnd);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}
const fieldSrc = block('field');
const tickSrc = block('_fieldTick');
const texSrc = (() => {
  const s = src.indexOf('function fieldTexture(');
  return s < 0 ? '' : src.slice(s, src.indexOf('\nconst fxPlane', s) > s ? src.indexOf('\nconst fxPlane', s) : s + 6000);
})();

console.log('一、四种剪影');
ok(fieldSrc.length > 800, 'FX.field 真的有实现（不是空壳）', fieldSrc.length);
for (const k of ['sigil', 'taiji', 'mist', 'blades']) {
  ok(new RegExp("kind === '" + k + "'").test(fieldSrc), k + ' 有独立分支');
}
ok(/kind !== 'mist'/.test(fieldSrc), '雾不画地纹（带清晰圆边的"雾"读起来是一张饼）');
ok(/NormalBlending/.test(fieldSrc), '雾片走 NormalBlending（加色雾会变成一团荧光）');
ok(/opts\.rim !== false/.test(src) && /rim: false/.test(game),
  '毒雾关掉边沿亮圈（亮边会把「没有边界的雾」重新画成一个圆）');
ok(/CylinderGeometry/.test(fieldSrc), '法阵 / 太极有竖直柱体（51° 俯角下竖直方向最占屏幕）');
ok(/swords/.test(fieldSrc) && /fxPlane/.test(fieldSrc), '剑阵用立起来的 plane 做剑影（不是贴地弧）');

console.log('二、半径不听亮度的');
/* 硬约束：amp 只乘亮度 / 不透明度。R 一旦被 amp 乘过，
 * 高等级技能就会画出比判定更大的圈 —— 玩家会以为打得到更远的地方。 */
ok(!/R\s*\*\s*this\.amp/.test(fieldSrc) && !/this\.amp\s*\*\s*R/.test(fieldSrc),
  '领域半径不乘亮度倍率（`R * this.amp` 一处都不许有）');
ok(/this\.lit\(color\)/.test(fieldSrc), '亮度只走 lit(color)（把颜色往白里拉，不改尺寸）');
ok(/Math\.max\(0\.6, opts\.r \|\| 3\.2\)/.test(fieldSrc), '半径由调用方传入，缺省 3.2');

console.log('三、贴图缓存');
ok(/const _fieldTex = \{\}/.test(src), '领域贴图有模块级缓存表');
ok(/if \(_fieldTex\[kind\]\) return _fieldTex\[kind\]/.test(texSrc), '同一种贴图只生成一次');
ok(/_fieldTex\[kind\] = t/.test(texSrc), '生成后写回缓存');
for (const k of ['sigil', 'taiji', 'beam', 'smoke', 'blade']) {
  ok(new RegExp("kind === '" + k + "'").test(texSrc), '贴图 ' + k + ' 有画法');
}
ok(!/new THREE\.CanvasTexture/.test(fieldSrc), 'field 本体不新建纹理（只从缓存取）');

console.log('四、逐帧纪律');
ok(/type === 'field'/.test(src) && /this\._fieldTick\(z, dt\)/.test(src),
  'update 里有 field 分支，走 _fieldTick');
ok(tickSrc.length > 400, '_fieldTick 真的有实现', tickSrc.length);
ok(!/new THREE\./.test(tickSrc), '逐帧不 new 任何 THREE 对象（GC 抖动）');
ok(!/new THREE\.PointLight/.test(src), 'fx.js 里没有新建 PointLight（挂灯 = 全部材质重编译）');
ok(/z\.follow/.test(tickSrc), '跟随用函数（传快照会让阵留在原地）');

console.log('五、回收');
ok(/z\.mats/.test(src) && /for \(const m of z\.mats\) m\.dispose\(\)/.test(src),
  '领域回收要逐份 dispose 材质（一个 zone 有地纹 / 柱 / 墙 / 剑影好几份）');
ok(/if \(z\.mats\) \{ for \(const m of z\.mats\) m\.dispose\(\); \}/.test(src)
  && /else if \(z\.mat\) z\.mat\.dispose\(\)/.test(src),
  '其余 zone 仍然只 dispose 一份（不许顺手全改成数组）');

console.log('六、接进游戏');
const wired = [
  ['剑阵', /kind: 'blades'/, /FX\.field\(fieldCtr\(\)/],
  ['天师符阵', /kind: 'sigil'/, /FX\.field\(c, \{/],
  ['毒雾', /kind: 'mist'/, /const mistField = FX\.field\(c/],
  ['太极', /kind: 'taiji'/, /kind: 'taiji', r: 2\.6/]
];
for (const [name, a, b] of wired) {
  ok(a.test(game) && b.test(game), name + ' 已接进游戏');
}
ok(/if \(mistField\) mistField\.scale\.setScalar\(radNow \/ prad\)/.test(game),
  '毒雾「蔓延」时雾团跟着长（只放大圆片 = 看着罩住了、伤害没到）');
ok(/follow: pinOn \? null : fieldCtr/.test(game),
  '剑阵钉阵变体不跟随、跟随变体才跟随');

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 领域契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
