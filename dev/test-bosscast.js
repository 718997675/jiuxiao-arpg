/* ============================================================
 * [B21] 首领招式的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-bosscast.js
 *
 * 三层：
 *   ① 源头一致 —— boss-cast.js 是**生成物**，跑 dev/build-bosscast.js --check
 *   ② 装上就不许缺件 —— 88 招引用的那套脚手架，顶层得真的声明过
 *   ③ 选招/占用是纯函数 —— 五格轮转、施法占用、三道闸，都在 node 里断
 *
 * 最要紧的是 ②：那些名字少一个，**静态检查全绿、运行时才炸**
 * （实测：`BFX is not defined` 让 88 招一条都放不出来，
 *  而 data-bosskits 的 34 条契约一条都没红）。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'src', 'boss-cast.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

ok(fs.existsSync(FILE), 'src/boss-cast.js 存在（没生成过就先跑 --write）');
const src = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

console.log('一、与特效台一致');
{
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'dev', 'build-bosscast.js'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    ok(true, 'boss-cast.js 与 docs/boss-vfx-playground.html 一致');
  } catch (e) {
    ok(false, '生成物过期（改过特效台但没重新生成）', String((e.stdout || '') + (e.stderr || '')).trim());
  }
}

console.log('二、脚手架不缺件');
{
  /* 88 招里真正出现的**全局名**（不是对象键、不是局部变量）。
   * 少一个 = 运行时 ReferenceError，而且只在真打起来那一刻才炸。 */
  const NEED = ['BFX', 'BOSS', 'DUMMY', 'R', 'WM', 'V3', 'TEX', 'scene',
    'addUpdate', 'delay', 'seq', 'flatMesh', 'billMesh', 'disposeMesh', 'lightPulse',
    'settle', 'inHit', 'normShape', 'aimAngle', 'aimDist', 'ph', 'moveDummy',
    'markOnPlayer', 'speedSmear', 'bossGlide', 'bossReset', 'bossLean',
    'swingArm', 'MK', 'G', 'P', 'nSay', 'hexs', 'floatText', 'flashScreen',
    'hurtVignette', 'label3d', 'labels', 'bossLabelY', 'TIME', 'S_HIST',
    'markForgotten', 'shake'];
  /* 允许缩进：生成区（从特效台切出来的那两段）整体缩进了 2 格，
   * 而 HEAD/FOOT 是齐头的。只认行首的话会漏掉一半 —— 实测漏了 23 个。 */
  /* fx2 解构：`const { flatMesh, billMesh, ... } = FX2.tools;`
   * 这六个是**解构声明**，普通正则查不到 —— 但它们是 88 招里出现频率最高的
   * 一批（flatMesh 27 次 / V3 87 次），漏检就等于这条断言没意义。 */
  const destr = (src.match(/const\s*\{[^}]*\}\s*=\s*FX2\.tools/) || [''])[0];
  const destrNames = destr.replace(/const\s*\{|\}\s*=.*/g, '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const decl = (n) => destrNames.indexOf(n) >= 0 ||
    new RegExp('^\\s*(?:const|let|var|function)\\s+' + n + '\\b', 'm').test(src);
  const missing = NEED.filter(n => !decl(n));
  ok(missing.length === 0, '所有脚手架都在顶层声明过（' + NEED.length + ' 个）', missing);
  /* 反向：声明了但没人用，说明是上一版留下的尸体，该删 */
  const dead = ['NSYN', 'NATIVE', 'NWARM'].filter(n => decl(n));
  ok(dead.length === 0, '没有上一版残留的声明', dead);
}

console.log('三、顶层名不撞别处');
{
  /* 顶层 const 重名 = **整页白屏**，报错还指向第二个文件。
   * 这里只查最容易撞的几个：短名（G / P / M / R）。 */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = html.match(/<script\s+src="(src\/[^"]+)"><\/script>/g)
    .map(s => s.match(/src="([^"]+)"/)[1]);
  /* 只查**肯定是顶层**的那几个（BOSS 自己发明的名字）。
   * `TEX` / `TIME` / `delay` / `addUpdate` 这些在 sfx.js / fx2.js 的 IIFE
   * 里也有同名变量（都无缩进，文本上看不出是不是在 IIFE 里），
   * 用文本查会误报。它们真撞了的话，下面的 vm 加载会直接抛 —— 那种验证比
   * 正则可靠。`M` 是 actors.js 的材质工厂，boss-cast 用的是 `MK`，不查 M。 */
  const checked = ['BOSS', 'DUMMY', 'G', 'P', 'R', 'N', 'WM', 'V3', 'scene',
    'S_HIST', 'MK', 'CTX', 'CUR'];
  const clash = [];
  for (const n of checked) {
    const owners = files.filter(f => {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      /* 只认**行首无缩进**的声明：IIFE 内部的同名变量不算（sfx.js / fx2.js 里都有） */
      return new RegExp('^(?:const|let|var)\\s+' + n + '\\b', 'm').test(t);
    });
    if (owners.length > 1) clash.push(n + ' → ' + owners.join(','));
  }
  ok(clash.length === 0, '顶层名没有跨文件重复', clash);
  ok(files.indexOf('src/boss-cast.js') >= 0, 'index.html 引了 boss-cast.js');
  ok(files.indexOf('src/boss-cast.js') > files.indexOf('src/fx2.js'),
    '在 fx2.js 之后加载（顶层直接取 FX2.tools）');
  ok(files.indexOf('src/boss-cast.js') < files.indexOf('src/game.js'),
    '在 game.js 之前加载（updateBossAI 要调它）');
}

console.log('四、选招与占用（纯函数）');
{
  /* 用桩跑真代码：只给 THREE.Vector3 和一个空 FX2，别的什么都不给。
   * 这样测的就是**发版的那份 `_pick`**，不是复制一份来测。 */
  const noop = () => {};
  const V3stub = class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new V3stub(this.x, this.y, this.z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const ctx = vm.createContext({
    console, Math, JSON, Object, Array, String, Number, Boolean, Error, Symbol, isFinite, parseInt, parseFloat,
    THREE: { Vector3: V3stub, Box3: class { setFromObject() { return this; } } },
    FX2: {
      tools: {
        flatMesh: noop, billMesh: noop, vplane: noop, disposeMesh: noop,
        lightPulse: noop, col: noop, pool: () => ({ spawn: noop }),
        V3: (x, y, z) => new V3stub(x, y, z),
        TEX: {}, TEX_BAND: {}, normShape: (h) => h.shape,
        addUpdate: (o) => o, delay: noop, seq: noop, shake: noop
      },
      scene: { add: noop, remove: noop },
      get time() { return 0; },
      stepHook: null
    },
    BALANCE: { boss: { skillRange: 18 } },
    BOSS_KIT: { treeking: ['a', 'b', 'c', 'd', 'nt_treeking'] },
    BOSS_SKILLS: { a: { run: noop }, b: { run: noop }, c: { run: noop }, d: { run: noop }, nt_treeking: { run: noop } }
  });
  let BC = null;
  try {
    vm.runInContext(src, ctx, { filename: 'boss-cast.js' });
    BC = vm.runInContext('BossCast', ctx);
  } catch (e) {
    ok(false, 'boss-cast.js 在桩环境里执行失败：' + e.message);
  }
  if (BC) {
    const e = { cfg: { id: 'treeking' }, phase: 0, pos: new V3stub(0, 0, 0), _castN: 0 };
    const order = [];
    for (let i = 0; i < 10; i++) order.push(BC._pick(e));
    ok(JSON.stringify(order) === JSON.stringify(
      ['a', 'b', 'c', 'd', 'nt_treeking', 'a', 'b', 'c', 'd', 'nt_treeking']),
      '五格轮转：四拍 + 每第 5 拍压轴（本命）', order);

    ok(BC._span({ warm: 1.5, mul: 1.5 }) > BC._span({ warm: 0.5, mul: 0.3 }),
      '施法占用：重招占得比轻招久',
      [BC._span({ warm: 1.5, mul: 1.5 }), BC._span({ warm: 0.5, mul: 0.3 })]);

    /* 三道闸（canCast 第一行就查 CTX.game，所以先 bind） */
    ok(BC.bind({ enemies: [] }) === BC, 'bind 返回自己（可链式）');
    ok(BC.canCast({ dead: true, pos: e.pos }, e.pos) === false, '死了不出招');
    ok(BC.canCast({ pos: e.pos, _castUntil: 2 }, e.pos) === false, '上一招没演完不出招');
    ok(BC.canCast({ pos: e.pos }, new V3stub(40, 0, 0)) === false, '玩家在交战半径外不出招（40 米 > 18）');
    ok(BC.canCast({ pos: e.pos }, new V3stub(6, 0, 0)) === true, '玩家在半径内可以出招（6 米）');

    /* 换图作废：clear 之后 delay 回调不该再执行 */
    const gen0 = vm.runInContext('CTX.gen', ctx);
    BC.clear();
    ok(vm.runInContext('CTX.gen', ctx) === gen0 + 1, 'clear() 会让换图代号 +1（旧的 delay 全部作废）');
  }
}

console.log('五、不许摸 DOM / 不许真实时间');
{
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* label3d 是唯一允许碰 DOM 的地方：3D 浮标（「破绽 2.1s」）要靠一个
   * absolutely 定位的 div 跟屏幕投影走。第一版把它写成空壳，结果技能自己
   * 写 bar.el.textContent 时每帧抛一次 —— 所以这里不能一刀切禁掉，
   * 而是把这一段摘出去，剩下的部分继续禁。 */
  const whole = strip(src);
  let rest = whole;
  const at = whole.indexOf('function label3d(');
  if (at >= 0) {
    let i = whole.indexOf('{', at), d = 0, j = i;
    for (; j < whole.length; j++) {
      if (whole[j] === '{') d++;
      else if (whole[j] === '}') { d--; if (d === 0) break; }
    }
    rest = whole.slice(0, at) + whole.slice(j + 1);
    ok(true, 'label3d 找到了（3D 浮标还在）');
  } else {
    ok(false, 'label3d 不见了（破防倒计时没处显示）');
  }
  ok(!/document\./.test(rest), 'label3d 之外没有 document.（演出层不碰 UI）');
  ok(!/setTimeout\s*\(/.test(rest), '没有 setTimeout（必须按帧走，切图要能取消）');
  ok(!/requestAnimationFrame/.test(rest), '没有 requestAnimationFrame（由宿主驱动）');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
