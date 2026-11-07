/* ============================================================
 * [B24] 「每只首领自己的四拍」的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-bosstwist.js
 *
 * 这一层最怕的不是报错，是**悄悄退化成空**：
 *   - 写错格子（把 id 写成别的招 / 写进第 5 格）→ 那条变形永远不触发，
 *     面板照样显示、游戏照样跑，只是「这一只又多了一个共享招」。
 *   - 四格都写成「往旁边闪」→ 结构上是四拍，玩起来还是一拍。
 * 所以下面既有结构断言，也有「四拍必须不一样」的语义断言。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data', 'data-bosstwist.js');
const IMPL = path.join(ROOT, 'src', 'boss-twist.js');
const KITS = path.join(ROOT, 'src', 'data', 'data-bosskits.js');
const CAST = path.join(ROOT, 'src', 'boss-cast.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

ok(fs.existsSync(DATA), 'src/data/data-bosstwist.js 存在');
ok(fs.existsSync(IMPL), 'src/boss-twist.js 存在');
if (!fs.existsSync(DATA) || !fs.existsSync(IMPL)) { console.log('\n0 通过 / 1 失败'); process.exit(1); }

const dataSrc = fs.readFileSync(DATA, 'utf8');
const implSrc = fs.readFileSync(IMPL, 'utf8');
const kitSrc = fs.readFileSync(KITS, 'utf8');
const castSrc = fs.existsSync(CAST) ? fs.readFileSync(CAST, 'utf8') : '';

/* ---------- 读 BOSS_KIT：只切那一块字面量，不执行整个生成物 ---------- */
function pickBlock(src, name) {
  const at = src.indexOf('const ' + name + ' = {');
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
    /* 只数括号会把字符串里的 } 也算进去 —— 这里的表里没有字符串花括号，够用 */
  }
  return null;
}
const kitLit = pickBlock(kitSrc, 'BOSS_KIT');
ok(!!kitLit, 'BOSS_KIT 从 data-bosskits.js 切出来了');
const KIT = kitLit ? new Function('return ' + kitLit)() : {};

/* ---------- 读 BOSS_TWIST 与 OPS ---------- */
const ctx = { console, THREE: { Vector3: function (x, y, z) { this.x = x; this.y = y; this.z = z; } } };
vm.createContext(ctx);
/* 顶层 `const` 只进「全局词法环境」，不会变成 context 的属性 —— vm 里读不到，
 * 但浏览器里**跨 <script> 是能读到的**（同一个全局词法环境）。所以这里补一行
 * 挂到 globalThis 上，只为测试取得着，不代表浏览器需要它。 */
try { vm.runInContext(dataSrc + '\n;globalThis.BOSS_TWIST = BOSS_TWIST;', ctx, { filename: 'data-bosstwist.js' }); } catch (e) { ok(false, 'data-bosstwist.js 能执行', e.message); }
try { vm.runInContext(implSrc, ctx, { filename: 'boss-twist.js' }); } catch (e) { ok(false, 'boss-twist.js 能执行', e.message); }
const TW = ctx.BOSS_TWIST;
const Tw = ctx.BossTwist;

ok(!!TW && typeof TW === 'object', 'BOSS_TWIST 被定义了');
ok(!!Tw && typeof Tw.apply === 'function', 'BossTwist.apply 被导出了');
ok(!!Tw && !!Tw.OPS && Object.keys(Tw.OPS).length > 0, 'BossTwist.OPS 非空');

const bosses = TW ? Object.keys(TW) : [];
const OPS = (Tw && Tw.OPS) ? Object.keys(Tw.OPS) : [];

console.log('一、写在哪一格');
{
  const badBoss = bosses.filter(b => !KIT[b]);
  ok(badBoss.length === 0, '写的首领都在 BOSS_KIT 里（拼错 id 会静默失效）', badBoss);

  const badSlot = [], nativeSlot = [];
  for (const b of bosses) {
    const kit = KIT[b] || [];
    for (const id of Object.keys(TW[b].s || {})) {
      if (/^nt_/.test(id)) { nativeSlot.push(b + '/' + id); continue; }
      /* 第 5 格是 kit[4]（本命），前面四格才是共享位。写错位 = 永远不触发 */
      if (kit.indexOf(id) < 0 || kit.indexOf(id) > 3) badSlot.push(b + '/' + id);
    }
  }
  ok(nativeSlot.length === 0, '第 5 格（nt_*）一条都没写 —— 那 45 条已经是每只自己的了', nativeSlot);
  ok(badSlot.length === 0, '每一格都落在共享四拍上（第 1~4 格）', badSlot);
}

console.log('二、每一格都说清了三件事');
{
  const missN = [], missA = [], missOps = [], badOp = [], badNum = [];
  for (const b of bosses) {
    for (const id of Object.keys(TW[b].s || {})) {
      const s = TW[b].s[id];
      if (!s.n || typeof s.n !== 'string') missN.push(b + '/' + id);
      if (!s.a || typeof s.a !== 'string') missA.push(b + '/' + id);
      if (!Array.isArray(s.ops) || !s.ops.length) { missOps.push(b + '/' + id); continue; }
      for (const row of s.ops) {
        if (!Array.isArray(row) || typeof row[0] !== 'string') { badOp.push(b + '/' + id); continue; }
        if (OPS.indexOf(row[0]) < 0) badOp.push(b + '/' + id + ':' + row[0]);
        const p = row[1] || {};
        for (const k of ['r', 'ttl', 'mul', 'dur', 'gap', 'n', 'frac', 'arc', 'turn']) {
          if (p[k] !== undefined && (typeof p[k] !== 'number' || !(p[k] > 0))) badNum.push(b + '/' + id + ':' + k);
        }
      }
    }
  }
  ok(missN.length === 0, '每格都有名字 n（播报要用）', missN);
  ok(missA.length === 0, '每格都有应对 a（这是「不一样」的落点）', missA);
  ok(missOps.length === 0, '每格都有 ops', missOps);
  ok(badOp.length === 0, '用到的 op 都在 BossTwist.OPS 里实现过', badOp);
  ok(badNum.length === 0, '数值参数都是正数（0 会被 `|| 兜底` 吃掉，写成负数更糟）', badNum);
}

console.log('三、同一只的四拍要真的不一样');
{
  const dupA = [], dupOps = [];
  for (const b of bosses) {
    const slots = Object.keys(TW[b].s || {});
    const seenA = new Map(), seenO = new Map();
    for (const id of slots) {
      const s = TW[b].s[id];
      if (seenA.has(s.a)) dupA.push(b + '：' + seenA.get(s.a) + ' 与 ' + id + ' 同答案「' + s.a + '」');
      else seenA.set(s.a, id);
      /* 指纹 = op 名 + 关键参数：完全一样的组合就是同一招换了个名字 */
      const fp = (s.ops || []).map(r => r[0] + '(' + JSON.stringify(r[1] || {}) + ')').join('+');
      if (seenO.has(fp)) dupOps.push(b + '：' + seenO.get(fp) + ' 与 ' + id + ' 同变形');
      else seenO.set(fp, id);
    }
  }
  ok(dupA.length === 0, '同一只的四格答案互不相同（四格全写「往旁边闪」等于一拍）', dupA);
  ok(dupOps.length === 0, '同一只的四格变形互不相同', dupOps);
}

console.log('四、这一层不许把游戏搞挂');
{
  const code = implSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/document\./.test(code), '没有 document.（变形层不碰 DOM，播报交给 UI）');
  ok(!/setTimeout\s*\(/.test(code), '没有 setTimeout（切图要能取消，必须按帧）');
  ok(!/requestAnimationFrame/.test(code), '没有 requestAnimationFrame（由宿主驱动）');
  /* 顶层 const 重名 = 整页白屏，报错指在第二个文件上。
   * 这一层所有局部名都必须在 IIFE 里；顶层只许出现 `var BossTwist =`。 */
  const topConst = code.split('\n').filter(l => /^const\s|^let\s/.test(l));
  ok(topConst.length === 0, '没有任何顶层 const/let（会和 boss-cast.js 的 BFX/V3 撞成白屏）', topConst.slice(0, 3));
}

console.log('六、B25：45 只全覆盖 + 跨只不撞脸');
{
  /* 补全之后，`BOSS_TWIST` 必须和 `BOSS_KIT` 一一对应。
   * 少一只不是「还没轮到」就算了 —— 台账上写着 45 只，测试得能拦住漏项。 */
  const kitBosses = Object.keys(KIT);
  const missing = kitBosses.filter(b => !TW[b]);
  ok(missing.length === 0, '45 只首领全部写进了 BOSS_TWIST', missing);
  ok(kitBosses.length === 45, 'BOSS_KIT 还是 45 只', kitBosses.length);

  /* 每只四格**全写完**，而且覆盖至少 3 种不同的 op。
   * 只写两格的话，另外两拍会退回共享招原名 —— 玩家看到的就是「半只新的」。 */
  const short = [], thin = [];
  for (const b of bosses) {
    const kit = (KIT[b] || []).slice(0, 4);
    const got = Object.keys(TW[b].s || {});
    if (got.length !== 4 || kit.some(id => got.indexOf(id) < 0)) short.push(b + ':' + got.length);
    const ops = new Set();
    for (const id of got) for (const row of TW[b].s[id].ops || []) ops.add(row[0]);
    if (ops.size < 3) thin.push(b + ':' + ops.size);
  }
  ok(short.length === 0, '每只的四格全写完（不是只写两格）', short);
  ok(thin.length === 0, '每只四拍覆盖 ≥3 种不同的应对动作', thin);

  /* 同一个共享招会在很多只身上出现（ringshot 17 次）。
   * 如果它们拿到的变形指纹全都一样，那就是「换了名字没换招」——
   * B24 之前的病。判据：出现 ≥4 次的招，至少要有 3 种不同的变形。 */
  const bySkill = {};
  for (const b of bosses) for (const id of Object.keys(TW[b].s || {})) {
    const fp = (TW[b].s[id].ops || []).map(r => r[0] + '(' + JSON.stringify(r[1] || {}) + ')').join('+');
    (bySkill[id] = bySkill[id] || []).push(fp);
  }
  const cloned = [];
  for (const id of Object.keys(bySkill)) {
    const arr = bySkill[id];
    if (arr.length >= 4 && new Set(arr).size < 3) cloned.push(id + ':' + arr.length + '次/' + new Set(arr).size + '种');
  }
  ok(cloned.length === 0, '高频共享招跨只不是同一个变形（≥4 次要 ≥3 种）', cloned);

  /* 八部众的第 1 格全是 staggerbreak，同一段共享代码。
   * 这一格八只必须八种不同的 op，否则「八部」就是一张脸。 */
  const bafo = bosses.filter(b => /^bafo_/.test(b));
  const sbOps = bafo.map(b => {
    const s = TW[b].s && TW[b].s.staggerbreak;
    return s && s.ops && s.ops[0] ? s.ops[0][0] : null;
  });
  ok(bafo.length === 8, '八部众是 8 只', bafo.length);
  ok(sbOps.every(Boolean) && new Set(sbOps).size === 8,
    '八部的 staggerbreak 八只各一种变形（不许换皮）', sbOps);

  /* 新增的三个 op 都得在数据里真的被用过 —— 不然就是写了个空壳 */
  const used = new Set();
  for (const b of bosses) for (const id of Object.keys(TW[b].s || {}))
    for (const row of TW[b].s[id].ops || []) used.add(row[0]);
  for (const op of ['totem', 'shroud', 'push']) {
    ok(used.has(op), 'B25 新增的 ' + op + ' 真的被招用上了');
  }
  ok(new Set(OPS).size >= 10, '变形层至少 10 种应对动作', Object.keys(OPS || {}));
}

console.log('五、真的接上了');
{
  ok(/BossTwist\.apply\s*\(/.test(castSrc), 'boss-cast.js 的 tryCast 会调 BossTwist.apply');
  ok(/data-bosstwist\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')),
    'index.html 加载了 data-bosstwist.js');
  ok(/src\/boss-twist\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')),
    'index.html 加载了 boss-twist.js');
  ok(/castBanner/.test(fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8')),
    'UI.castBanner 存在（播报没接上的话名字去哪都不显示）');
}

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) process.exit(1);
