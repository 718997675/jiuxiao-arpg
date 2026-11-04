/* ============================================================
 * [B17.1] 首领技能表的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-bosskits.js
 *
 * 这张表（`src/data/data-bosskits.js`，88 招 / 45 只 × 5 格）是**生成物**，
 * 所以契约分两种：
 *   ① 源头一致 —— `dev/build-bosskits.js --check`
 *   ② 生成得对 —— 数量 / 分组 / 引用完整 / 没有 DOM / 形状合法
 *
 * 最要紧的一条是「45 只对得上」：`BOSSES`（data-monsters.js）里已经有 45 只，
 * id 和特效台完全同名。这条断言要是绿的，说明**游戏里那 45 只真的有配招**，
 * 不是"特效台里有个漂亮的名册"。它要是红的，别去改断言，去看是谁改了 id。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadData } = require('./_load');

const FILE = path.join(ROOT, 'src/data/data-bosskits.js');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

ok(fs.existsSync(FILE), 'src/data/data-bosskits.js 存在（没生成过就先跑 --write）');
const src = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

/* 生成物在 node 里能跑：两个表都是纯数据 + 函数字面量，不需要 THREE。
 * `@` 开头那行是「本文件是生成物」的标记 —— 别删，--check 靠它对比内容。 */
let SK = {}, KIT = {};
try {
  const ctx = vm.createContext({ console, Math, JSON });
  vm.runInContext(src, ctx, { filename: 'data-bosskits.js' });
  SK = vm.runInContext('BOSS_SKILLS', ctx);
  KIT = vm.runInContext('BOSS_KIT', ctx);
} catch (e) {
  ok(false, '生成物在 vm 里执行失败（语法或引用问题）：' + e.message);
}

console.log('一、数量与分组');
{
  const ids = Object.keys(SK);
  ok(ids.length === 88, '88 招（机制 18 / 套路 13 / 签名 12 / 本命 45）', ids.length);
  const g = {};
  for (const k of ids) g[SK[k].group] = (g[SK[k].group] || 0) + 1;
  ok(g.mech === 18, '机制 18', g.mech);
  ok(g.shared === 13, '套路 13', g.shared);
  ok(g.sign === 12, '签名 12', g.sign);
  ok(g.native === 45, '本命 45（一只一个，没有语法表）', g.native);
  ok(!Object.keys(SK).some(k => /^(wb_|dom_)/.test(k)), '世界 Boss 的 24 招**没**混进来');
}

console.log('二、45 只对得上游戏里的 BOSSES');
{
  const ctx = loadData();
  const BOSSES = vm.runInContext('BOSSES', ctx);
  const gameIds = Object.keys(BOSSES).sort();
  const kitIds = Object.keys(KIT).sort();
  ok(gameIds.length === 45, '游戏里正好 45 只首领', gameIds.length);
  ok(kitIds.length === 45, '配招表正好 45 只', kitIds.length);
  const missing = gameIds.filter(id => kitIds.indexOf(id) < 0);
  const extra = kitIds.filter(id => gameIds.indexOf(id) < 0);
  ok(missing.length === 0, '每只游戏首领都有配招', missing);
  ok(extra.length === 0, '配招表里没有游戏里不存在的 id', extra);
}

console.log('三、每只 5 格，格位 = 功能位');
{
  let bad = [];
  for (const id of Object.keys(KIT)) {
    const s = KIT[id];
    if (s.length !== 5) bad.push(id + ':' + s.length);
    if (new Set(s).size !== s.length) bad.push(id + ':重复格');
    /* 第 1 格机制、第 5 格本命 —— 这两条是 §2 的口径，配错了整只 Boss 的读法就变了 */
    if (s[0] && SK[s[0]] && SK[s[0]].group !== 'mech') bad.push(id + ':第1格不是机制');
    if (s[4] && s[4] !== 'nt_' + id) bad.push(id + ':第5格不是本命');
  }
  ok(bad.length === 0, '45 × 5 格全部合规（机制在第一格、本命在第五格）', bad.slice(0, 6));
}

console.log('四、引用完整：没有一格是悬空的');
{
  let dangling = [];
  for (const id of Object.keys(KIT)) for (const k of KIT[id]) if (!SK[k]) dangling.push(id + '→' + k);
  ok(dangling.length === 0, '225 格全部能查到实体', dangling.slice(0, 6));
  const noRun = Object.keys(SK).filter(k => typeof SK[k].run !== 'function');
  const noHit = Object.keys(SK).filter(k => typeof SK[k].hit !== 'function');
  ok(noRun.length === 0, '每招都有 run()', noRun.slice(0, 4));
  ok(noHit.length === 0, '每招都有 hit()', noHit.slice(0, 4));
  const noName = Object.keys(SK).filter(k => !SK[k].name);
  ok(noName.length === 0, '每招都有名字（界面 / 日志要用）', noName.slice(0, 4));
  const noWarm = Object.keys(SK).filter(k => typeof SK[k].warm !== 'number');
  ok(noWarm.length === 0, '每招都有前摇秒数（预警要用它）', noWarm.slice(0, 4));
}

console.log('五、判定形状只有那六种');
{
  const ALLOW = ['circle', 'ring', 'fan', 'line', 'scatter', 'self', 'cone', 'sector', 'rect'];
  const found = new Set();
  const re = /shape:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(src))) found.add(m[1]);
  const bad = [...found].filter(s => ALLOW.indexOf(s) < 0);
  ok(bad.length === 0, '没有野形状（' + [...found].join('/') + '）', bad);
  ok(found.size >= 4, '至少用到 4 种形状（否则 45 只读起来是一样的）', [...found]);
}

console.log('六、不许摸 DOM / 不许真实时间');
{
  /* `document.` 与 `setTimeout` 是特效台那套 UI 的东西。搬进游戏之后
   * 前者会摸一个不存在的元素（直接抛），后者在切图时不会取消。
   * 「遗忘」那一招原本两个都有，已经改成 `markForgotten()` 交回宿主。 */
  /* 要先剥掉注释再查。这张表的注释里**故意**留着几句
   * 「不能写 document.querySelector + setTimeout」的记录 —— 那是讲清楚
   * 为什么这招要交回宿主（markForgotten），不是真代码。
   * 不剥注释的话，写得越清楚越容易红，最后没人愿意写注释。 */
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  ok(!/document\./.test(codeOnly), '生成物里没有 document.（技能不许摸 UI）');
  ok(!/setTimeout\s*\(/.test(codeOnly), '生成物里没有 setTimeout（演出必须按帧走）');
  ok(!/requestAnimationFrame/.test(codeOnly), '生成物里没有 requestAnimationFrame（同上）');
}

console.log('七、装进页面：没有重名，也没拖慢首屏');
{
  ok(html.indexOf('src/data/data-bosskits.js') > 0, 'index.html 引了这个文件');
  ok(html.indexOf('src/data/data-bosskits.js') < html.indexOf('<script src="src/game.js">'),
    '在 game.js 之前加载（game 里要查表）');
  /* 跨系统重名是本项目栽过的坑（`SKILLS[id].variants` 那一次）：
   * 顶层 `const` 重名会让**整页**白屏，而且报错指向第二个文件，很难找。 */
  const names = ['BOSS_KIT', 'BOSS_SKILLS'];
  const files = html.match(/<script\s+src="(src\/[^"]+)"><\/script>/g)
    .map(s => s.match(/src="([^"]+)"/)[1]);
  for (const n of names) {
    const decls = files.filter(f => {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return new RegExp('^const ' + n + '\\b', 'm').test(t);
    });
    ok(decls.length === 1, n + ' 只在一个文件里声明（' + decls.join(',') + '）', decls);
  }
}

console.log('八、结算要用的字段真的在表里');
{
  /* 这一节是拿真 bug 换的：生成器把 `mul` 收进了 META，模板却只手写了
   * 七个字段 —— 88 招的伤害倍率全丢，而 `--check` 绿（重新生成也不含它）、
   * 前面七节也全绿（没人问它存不存在）。整条链上没有一处会红。
   * 所以「表够不够跑结算」必须单独问一次。 */
  const arr = Object.values(SK);

  const noMul = arr.filter(s => typeof s.mul !== 'number').map(s => s.id);
  ok(noMul.length === 0, '每招都有 mul（伤害倍率）', noMul);

  const badMul = arr.filter(s => s.mul < 0 || s.mul > 3).map(s => s.id + '=' + s.mul);
  ok(badMul.length === 0, 'mul 落在 0~3（超出就是写错了一位数）', badMul);

  /* 全 1 说明「取到了但没取到真值」，和缺失一样跑不起来 */
  const ones = arr.filter(s => s.mul === 1).length;
  ok(ones < arr.length, 'mul 不是一律 1（' + ones + '/' + arr.length + ' 招是 1.0）');

  /* 45 个本命技：`native` 指回 NR 的键，`dmg` / `answer` 是说明页要用的描述 */
  const natives = arr.filter(s => s.group === 'native');
  ok(natives.length === 45, '本命技 45 条', natives.length);
  const noNative = natives.filter(s => !s.native).map(s => s.id);
  ok(noNative.length === 0, '本命技都带 native（指回 NR 的键）', noNative);
  const noAnswer = natives.filter(s => !s.answer || !s.dmg).map(s => s.id);
  ok(noAnswer.length === 0, '本命技都有 dmg / answer（说明页按这两句写）', noAnswer);

  /* hitR 是可选字段：25 招有。但不能出现「有值却不是数」 */
  const badR = arr.filter(s => s.hitR !== undefined && typeof s.hitR !== 'number').map(s => s.id);
  ok(badR.length === 0, 'hitR 有值时必须是数字', badR);
}

console.log('九、生成物没走散');
{
  /* 这一条是 `--check`：跑一次生成器，逐字节比对。它慢（要开浏览器），
   * 但**只有它能回答「文档里的表还是代码里的表吗」**。 */
  const { execFileSync } = require('child_process');
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'dev/build-bosskits.js'), '--check'],
      { cwd: ROOT, env: Object.assign({}, process.env, { NODE_PATH: '/Users/niekai/node_modules' }), encoding: 'utf8' });
  } catch (e) {
    code = e.status || 1;
    out = (e.stdout || '') + (e.stderr || '');
  }
  ok(code === 0, 'src/data/data-bosskits.js 与特效台一致（改过特效台就 --write）', out.split('\n').slice(-3));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
