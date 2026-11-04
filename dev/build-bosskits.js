#!/usr/bin/env node
/* ============================================================
 * dev/build-bosskits.js —— 把 KIT / 88 个技能生成到 src/data/data-bosskits.js
 *
 *   node dev/build-bosskits.js            # 打到屏幕（只看统计）
 *   node dev/build-bosskits.js --check    # 只检查是否过期（过期退出码 1）
 *   node dev/build-bosskits.js --write    # 重写 src/data/data-bosskits.js
 *
 * ---------------- 为什么又是个「生成物」 ----------------
 * 45 只首领的 5 格配招、88 个技能的前摇 / 判定 / 演出，全部只存在于
 * `docs/boss-vfx-playground.html`（那边能一只一只真放出来看）。
 * 手抄一份进游戏 = 两天后两边开始说不同的话，而且**没人会发现**：
 * 两边都"能跑"，只是打得不一样。
 *
 * 所以照 §9 的规矩：**特效台是唯一的源**，这里是生成器，`--check` 进契约。
 *
 * ---------------- 为什么不切文本，而是 `toString()` ----------------
 * BFX 是连续的一大段，能按锚点整块切（见 build-fx2.js）。
 * 技能不是：88 个对象散在 2600 行里，按锚点切会切出一堆半截对象。
 * `Function.prototype.toString()` 拿到的就是**那段源码本身**，
 * 而且跟文件排版无关 —— 特效台里加个注释、挪个位置，生成结果都不变
 * （这正是 `--check` 能当契约用的前提）。
 *
 * ---------------- 只导非世界 Boss 的 88 个 ----------------
 * 世界 Boss 的 24 个技能（`group==='wb'`）不进这张表：它们的实现是
 * `src/worldboss-fight.js` 里那套三阶段状态机，特效台里那份只是**演示**。
 * 导进来会变成第二份谁也不认识的实现。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EXE = require('./_chrome');

const ROOT = path.resolve(__dirname, '..');
const SRCFILE = path.join(ROOT, 'docs', 'boss-vfx-playground.html');
const OUT = path.join(ROOT, 'src', 'data', 'data-bosskits.js');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 一个函数源码 → 能放进对象字面量的值。
 * 三种写法都会遇到：`run(){}`（方法简写）、`run:function(){}`、`hit:()=>…`。 */
function toFn(src) {
  let s = String(src).trim();
  if (/^function\b/.test(s)) return s;
  if (/=>/.test(s.split('\n')[0]) && /^\(?[\w$,\s]*\)?\s*=>/.test(s)) return s;   // 箭头
  /* 方法简写：去掉名字，补 function —— `run(a){…}` → `function(a){…}` */
  s = s.replace(/^[A-Za-z_$][\w$]*\s*\(/, '(');
  return 'function' + s;
}

/* 值的序列化：字符串用单引号，数字原样，函数走 toFn，其余 JSON */
function emit(v, ind) {
  /* `M(...)` 是特效台的材质工厂（`{r,m,e,flat,t,o}` 那套参数）。
   * 游戏里 `src/actors.js` 已经有一个同名同签名的 `M`，但参数口径是
   * `{rough,metal,emissive,transparent,opacity}`，且 `flatShading` 恒 true。
   * 同名会在顶层覆盖 —— actors.js 的整套角色建模会跟着变味。
   * 所以这里改名 `MK`：boss-cast.js 里定义同名函数，两边互不干扰。 */
  if (typeof v === 'function') return toFn(v.toString()).replace(/(?<![A-Za-z0-9_$])M\(/g, 'MK(');
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (v == null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(x => emit(x, ind)).join(', ') + ']';
  return JSON.stringify(v);
}

/* 从特效台取的字段。**这一份是唯一来源**：evaluate 里靠参数拿到，
 * 自检（见「四道闸门」第 4 条）也读它 —— 抄第二份就会走散。 */
const META_FIELDS = ['name', 'warm', 'tag', 'counter', 'rule', 'desc',
  'mul', 'hitR', 'kind', 'dmg', 'answer', 'native'];

/* 写进文件的顺序，和 META_FIELDS 是两个问题：
 * 取的时候按数据本来的样子取，写的时候按「读的人关心什么」排 ——
 * 数值在前（多疼 / 多快 / 多大），文案在后。 */
const EMIT_ORDER = ['warm', 'mul', 'hitR', 'tag', 'kind', 'native', 'dmg', 'answer',
  'rule', 'counter', 'desc'];

(async () => {
  const mode = process.argv[2] || '';
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.goto('file://' + SRCFILE, { waitUntil: 'load' });
  await p.waitForFunction('typeof NR === "object" && typeof KIT === "object"');
  await wait(500);

  /* 一次取全：技能元信息 + 两段源码 + 配招表。**只取不改**，
   * 生成物里一个数字都不是这里算出来的 —— 算出来的数字迟早和代码对不上。 */
  const data = await p.evaluate((META) => {
    /* `SKILL_INDEX` 是**唯一入口**：三类共用技 + 45 个本命技都在里面
     * （本命技那 45 条是下面 8753 行那段代码把 `NR` 包进 `SKILL_INDEX['nt_'+id]`
     * 生成的）。所以**别再单独遍历 NR** —— 那样每个 `nt_` 会被加两遍，
     * 生成出来是个后写盖前写的重复键。这一条是生成器自己的闸门抓到的。 */
    /* `mul` 是**结算用的伤害倍率**（0 ~ 2.2），`hitR` 是个别招的额外命中半径
     * （88 招里 25 招有）。这两个漏了，表就只够当说明书、不够跑结算 ——
     * 而 `--check` 照样绿（重新生成也不含它们），最难发现的就是这一种。
     * 字段表在 node 侧的 `META_FIELDS`，传进来而不是抄第二份。 */
    const out = { skills: [], kit: [] };
    for (const k of Object.keys(SKILL_INDEX)) {
      const s = SKILL_INDEX[k];
      /* 世界 Boss 的 24 条不进这张表（理由见文件头） */
      if (s.group === 'wb') continue;
      const o = { id: k, group: s.group || '' };
      for (const m of META) if (s[m] !== undefined) o[m] = s[m];
      if (s.hit) o.hit = s.hit.toString();
      if (s.run) o.run = s.run.toString();
      out.skills.push(o);
    }
    /* ---------------- 45 个本命技的**本体** ----------------
     * 这段是拿真 bug 换来的：`nt_*` 在特效台里是
     *     const key='nt_'+id, o = NR[id];
     *     SKILL_INDEX[key] = { ..., hit(){ return o.hit(); }, run(){ o.run(); } };
     * `o` 是**闭包变量**。`toString()` 能拿到源码，但拿不到闭包 ——
     * 生成物里就是 `function(){ return o.hit(); }`，而 `o` 根本不存在。
     * 后果：45 只守卫的第 5 格（本命）在游戏里**一次都放不出来**，
     * 报 ReferenceError: o is not defined。而契约测试只看
     * 「typeof run === 'function'」，照样全绿。
     *
     * 所以把 NR 的本体整份导出来（它自己就是数据 + 函数），
     * 包装层改成显式引用 `BOSS_NATIVE.<id>`，闭包就没有了。 */
    out.native = {};
    for (const id of Object.keys(NR)) {
      const o = NR[id];
      const n = {};
      for (const f of ['n', 'tag', 'warm', 'mul', 'rule', 'kind', 'dmg', 'answer', 'note']) {
        if (o[f] !== undefined) n[f] = o[f];
      }
      /* NR 里除了 hit/run 还可能有**辅助方法**。目前只有 4 只（黄泉主宰 /
       * 无相天魔 / 混沌真身 / 兽群）写了 `mk()` —— 它是「这一招的落点」，
       * hit() 和 run() 都读它（判定与预警同源）。
       * 漏掉它的后果是这 4 只一次都放不出来（this.mk is not a function），
       * 而其余 41 只照常 —— 最容易被「跑了 45 只，大部分是好的」糊过去。 */
      n.hit = o.hit ? o.hit.toString() : null;
      n.run = o.run ? o.run.toString() : null;
      const EXTRA = ['mk', 'place', 'aim', 'tick'];
      for (const f of EXTRA) if (typeof o[f] === 'function') n[f] = o[f].toString();
      /* 闸门：NR 上出现白名单之外的函数 → 生成中止。
       * 不写这一条，下一个写辅助方法的人会踩一模一样的坑。 */
      for (const f of Object.keys(o)) {
        if (typeof o[f] !== 'function') continue;
        if (f === 'hit' || f === 'run') continue;
        if (EXTRA.indexOf(f) >= 0) continue;
        out.badMethod = (out.badMethod || []).concat(id + '.' + f);
      }
      out.native[id] = n;
    }
    for (const id of Object.keys(KIT)) {
      const slots = (KIT[id] || []).slice(0, 5);
      /* 世界 Boss 的配招里全是 `group==='wb'` 的招 —— 它们不进这张表
       * （否则游戏侧查表会拿到 24 个根本不存在的 id） */
      if (slots.some(k => SKILL_INDEX[k] && SKILL_INDEX[k].group === 'wb')) continue;
      /* 万一哪天有人写错一个 id，这里就该炸，
       * 而不是生成一条谁也放不出来的配招 */
      if (slots.some(k => !SKILL_INDEX[k])) out.kit.push({ id, slots, bad: true });
      else out.kit.push({ id, slots, bad: false });
    }
    return out;
  }, META_FIELDS);
  await b.close();

  const skills = data.skills;
  const kit = data.kit;

  /* ---- 三道闸门：宁可生成失败，也不要生成一份「看起来对」的表 ----
   * （第四道在文件拼完之后：收了的字段必须真的写进文本） */
  const problems = [];
  const seen = new Map();
  for (const s of skills) {
    if (seen.has(s.id)) problems.push('重复的技能 id：' + s.id + '（对象字面量后写会静默盖掉前写）');
    seen.set(s.id, 1);
    if (!s.run) problems.push('没有 run：' + s.id);
    if (!s.hit) problems.push('没有 hit：' + s.id);
    if (!s.name) problems.push('没有名字：' + s.id);
  }
  for (const k of kit) if (k.bad) problems.push('配招表引用了不存在的技能：' + k.id + ' → ' + k.slots.join('/'));
  if (data.badMethod && data.badMethod.length) {
    problems.push('NR 上有没被导出的方法（加进 EXTRA 白名单，否则运行时是 is not a function）：' +
      data.badMethod.join('、'));
  }
  if (problems.length) {
    console.error('✗ 生成中止：');
    for (const x of problems) console.error('  · ' + x);
    process.exit(1);
  }

  /* ---- 拼文件 ---- */
  const lines = [];
  lines.push('/* ============================================================');
  lines.push(' * 首领技能表 —— 45 只的五格配招 + 88 个技能的判定与演出');
  lines.push(' *');
  lines.push(' *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。');
  lines.push(' *   源 = `docs/boss-vfx-playground.html`（那边能一只一只真放出来看）');
  lines.push(' *   重新生成：`node dev/build-bosskits.js --write`；只检查：`--check`');
  lines.push(' *');
  lines.push(' * `run()` / `hit()` 是从特效台**原样搬过来**的源码，它们引用的是');
  lines.push(' * 特效台那套脚手架（`BFX` / `N` / `R` / `WM` / `aimAngle` / `settle` …）。');
  lines.push(' * 游戏侧由 `src/boss-cast.js` 提供同名全局 —— 少一个就是**运行时**才炸的');
  lines.push(' * ReferenceError，所以 `dev/test-bosskits.js` 会把用到的那套名字全列出来核对。');
  lines.push(' *');
  lines.push(' * 世界 Boss 的 24 个技能**不在**这里：它们的实现是 `worldboss-fight.js`');
  lines.push(' * 的三阶段状态机，特效台里那份只是演示，导进来就是第二份实现。');
  lines.push(' * ============================================================ */');
  lines.push("'use strict';");
  lines.push('');
  lines.push('/* 45 只 × 5 格：机制 / 套路 / 套路 / 签名 / 本命（`nt_` 前缀） */');
  lines.push('const BOSS_KIT = {');
  for (const k of kit) lines.push('  ' + k.id + ": [" + k.slots.map(s => "'" + s + "'").join(', ') + '],');
  lines.push('};');
  lines.push('');
  /* --- 45 个本命技的本体（`nt_*` 只是包装层） --- */
  const native = data.native || {};
  lines.push('/* 45 个本命技的本体。`BOSS_SKILLS` 里那 45 条 `nt_*` 只是包装：');
  lines.push(' * 它们的 run/hit 显式转到这里（原来写的是闭包变量 `o`，搬出来之后');
  lines.push(' * `o` 不存在 —— 45 只的第 5 格会全部 ReferenceError）。 */');
  lines.push('const BOSS_NATIVE = {');
  for (const id of Object.keys(native)) {
    const n = native[id];
    lines.push('  ' + id + ': {');
    for (const f of ['n', 'tag', 'warm', 'mul', 'rule', 'kind', 'dmg', 'answer', 'note']) {
      if (n[f] !== undefined) lines.push('    ' + f + ': ' + emit(n[f]) + ',');
    }
    for (const f of ['mk', 'place', 'aim', 'tick']) {
      if (n[f] !== undefined) lines.push('    ' + f + ': ' + toFn(n[f]) + ',');
    }
    lines.push('    hit: ' + toFn(n.hit) + ',');
    lines.push('    run: ' + toFn(n.run));
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('/* 88 个技能。`group`：mech 机制 / shared 套路 / sign 签名 */');
  lines.push('const BOSS_SKILLS = {');
  for (const s of skills) {
    lines.push('  ' + s.id + ': {');
    lines.push("    id: '" + s.id + "', group: '" + s.group + "',");
    lines.push('    name: ' + emit(s.name) + ',');
    /* 数值在前、文案在后：读的时候「多疼」比「说得漂亮」重要。
     * 遍历 `EMIT_ORDER` 而不是逐行手写 —— 手写就会漏（`mul` 就是这么丢的）。 */
    for (const f of EMIT_ORDER) {
      if (s[f] !== undefined) lines.push('    ' + f + ': ' + emit(s[f]) + ',');
    }
    /* `nt_*` 的包装层写的是 `o.hit()` / `o.run()`（特效台里的闭包）。
     * 闭包搬不过来，这里换成对 BOSS_NATIVE 的显式引用。 */
    const nat = s.id.indexOf('nt_') === 0 ? s.id.slice(3) : null;
    let hitSrc = toFn(s.hit), runSrc = toFn(s.run);
    if (nat) {
      hitSrc = hitSrc.replace(/\bo\.hit\(\)/g, 'BOSS_NATIVE.' + nat + '.hit()');
      runSrc = runSrc.replace(/\bo\.run\(\)/g, 'BOSS_NATIVE.' + nat + '.run()');
      if (hitSrc.indexOf('BOSS_NATIVE.') < 0 || runSrc.indexOf('BOSS_NATIVE.') < 0) {
        console.error('✗ 生成中止：' + s.id + ' 的包装层没认出来（不是 o.hit()/o.run() 的形状？）');
        process.exit(1);
      }
    }
    lines.push('    hit: ' + hitSrc + ',');
    lines.push('    run: ' + runSrc);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  const out = lines.join('\n');

  /* ---- 第四道闸门：收了的字段必须真的写进文本 ---- *
   * 这一条是拿真 bug 换来的：`mul` 收进了 META 但模板没写，
   * 88 招的伤害倍率全丢，而 `--check` 依然绿（重新生成也不含它）、
   * 契约也全绿（没人断言它存在）。整条链上没有一处会红 —— 除了这里。 */
  const lost = [];
  for (const f of META_FIELDS) {
    if (f === 'name') continue;
    const used = skills.some(s => s[f] !== undefined);
    if (used && !out.includes('\n    ' + f + ': ')) lost.push(f);
  }
  if (lost.length) {
    console.error('✗ 生成中止：这些字段取到了但没写进文件 → ' + lost.join(', '));
    console.error('  修：把字段加进 EMIT_ORDER（模板是按它遍历的）');
    process.exit(1);
  }

  /* ---- 用法 ---- */
  if (mode === '--check') {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== out) {
      console.error('✗ src/data/data-bosskits.js 与特效台不一致（改过特效台但没重新生成）');
      console.error('  修：node dev/build-bosskits.js --write');
      process.exit(1);
    }
    console.log('✓ 首领技能表与特效台一致（' + skills.length + ' 招 / ' + kit.length + ' 只 / ' +
      out.split('\n').length + ' 行）');
  } else if (mode === '--write') {
    fs.writeFileSync(OUT, out);
    console.log('✓ 已重写 src/data/data-bosskits.js（' + skills.length + ' 招 / ' + kit.length +
      ' 只 / ' + out.split('\n').length + ' 行 / ' + (out.length / 1024).toFixed(1) + ' KB）');
  } else {
    const byGroup = {};
    for (const s of skills) byGroup[s.group] = (byGroup[s.group] || 0) + 1;
    console.log('技能 ' + skills.length + ' 招：' + JSON.stringify(byGroup));
    console.log('配招 ' + kit.length + ' 只，共 ' + kit.reduce((a, k) => a + k.slots.length, 0) + ' 格');
    console.log('预计文件 ' + (out.length / 1024).toFixed(1) + ' KB / ' + out.split('\n').length + ' 行');
  }
})().catch(e => { console.error(e); process.exit(1); });
