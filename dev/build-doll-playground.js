/* ============================================================
 * 把 dev/doll-playground.src.html 打成自包含单文件
 *
 *   node dev/build-doll-playground.js          # 生成 docs/equip-doll-playground.html
 *   node dev/build-doll-playground.js --check  # 只比对，不写（回归用）
 *
 * 为什么要打包：工作台的源文件用 <script src="../src/..."> 引真实模块 ——
 * 这样改 charforge / doll.js 台子自动跟着变，不用维护副本。
 * 但交付物得能双击打开、能单发，所以再压一份内联的。
 *
 * **docs 里那一份是生成物，别手改。** 改 dev/doll-playground.src.html。
 * （和 src/fx2.js 是特效台的生成物是同一条规矩。）
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dev/doll-playground.src.html');
const OUT = path.join(ROOT, 'docs/equip-doll-playground.html');

function build() {
  let html = fs.readFileSync(SRC, 'utf8');
  let inlined = 0;

  html = html.replace(/<script\s+src="([^"]+)"><\/script>/g, (m, rel) => {
    const abs = path.resolve(path.dirname(SRC), rel);
    if (!fs.existsSync(abs)) throw new Error('找不到要内联的脚本：' + rel);
    let code = fs.readFileSync(abs, 'utf8');
    /* 防呆：脚本里出现闭合标签会把 HTML 提前截断 */
    if (/<\/script/i.test(code)) throw new Error(rel + ' 里出现了 </script，不能直接内联');
    inlined++;
    const label = path.basename(abs);
    return '<script>\n/* ===== ' + label + ' ===== */\n' + code + '\n</script>';
  });

  const banner = '<!--\n  装备模组工作台（自包含单文件）\n\n'
    + '  **这是生成物，别手改。** 源文件 = dev/doll-playground.src.html\n'
    + '  重新生成：node dev/build-doll-playground.js\n'
    + '  内联了：lib/three.min.js + src/weapons.js + src/charforge.js\n'
    + '          + src/data/data-doll.js + src/doll.js\n'
    + '  生成时间：' + new Date().toISOString() + '\n-->\n';
  html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + banner);

  return { html, inlined };
}

function main() {
  const check = process.argv.indexOf('--check') >= 0;
  let out;
  try {
    out = build();
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }

  if (check) {
    if (!fs.existsSync(OUT)) {
      console.error('✗ docs/equip-doll-playground.html 不存在，先跑一次生成');
      process.exit(1);
    }
    const cur = fs.readFileSync(OUT, 'utf8');
    /* 时间戳每次不同，比对时剔掉 */
    const strip = s => s.replace(/生成时间：[^\n]*/, '');
    if (strip(cur) !== strip(out.html)) {
      console.error('✗ docs 里的工作台与源文件不一致 —— 跑 node dev/build-doll-playground.js');
      process.exit(1);
    }
    console.log('✓ 工作台产物与源文件一致（' + (out.html.length / 1024).toFixed(0) + ' KB）');
    return;
  }

  fs.writeFileSync(OUT, out.html);
  console.log('✓ ' + path.relative(ROOT, OUT) + '  ' + (out.html.length / 1024).toFixed(0)
    + ' KB（内联 ' + out.inlined + ' 个脚本）');
}

main();
