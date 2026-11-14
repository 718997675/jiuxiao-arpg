#!/usr/bin/env node
/* ============================================================
 * [U7] BOSS 老兜底 `bossPattern()` 公平性静态扫描
 *
 *   node dev/audit-bosspattern.js            # 报表（人看）
 *   node dev/audit-bosspattern.js --check    # 不达标就 exit 1（CI / 契约用）
 *   node dev/audit-bosspattern.js --json     # 只吐 JSON
 *
 * 量的是 `docs/BOSS-VFX-PLAN.md §2` 那条验收口径：
 *
 *   所有造成 >1.0× 伤害的 Boss 技能，**前摇 ≥ 0.7s 且有形状匹配的预警**
 *
 * 为什么是静态扫描而不是进游戏量：这 11 个 case 在正常对局里**几乎不播**
 * （`BossCast.tryCast` 先接管，45 只守卫都有五格配招）。要等配招表读不到 /
 * 那一招炸了才会掉下来 —— 恰恰是最难复现、最该有底线的路径。静态扫描
 * 覆盖的是「兜底代码本身的形状」，不依赖任何一次能不能触发。
 *
 * 三个字段怎么读出来的（都是源码事实，不是估算）：
 *
 *   倍率 mult   `st * 1.6` / `e.dmg * 1.3` 里最大的那个数
 *   前摇 warn   `FX.telegraph(t, r, D, cb)` 的第 3 参（`0.7 + i*0.18` 取 i=0，
 *               因为第一段落地最早）；没有 telegraph 时看 `setTimeout(..., i*N)`
 *               的第一段（i=0 → 0s）和 `e.charging = X`（蓄力期间就能命中 → 0）
 *   判定形状    `DIST2D(...) < R` = 圆；多点循环 = 多圆串；`< 14` 无条件 = 全场
 *
 * 不判「好不好看」，只判「躲不躲得掉」。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src/game.js');

/* 验收线：前摇 ≥ 0.7s（§2 原文） */
const WARN_MIN = 0.7;
/* 免检线：≤1.0× 的技能算骚扰不算威胁，不要求前摇（§2「造成 >1.0× 伤害」） */
const MULT_MIN = 1.0;

/* ---------------- 源码切片：剥注释 + 括号配对 ---------------- */
/* 只剥注释，**不剥字符串** —— 剥注释是为了不让「写清楚为什么改」的说明
 * 被当成代码（U6-4 在 test-vfx13 踩过）。字符串里没有花括号干扰，保留原样。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const stop = e < 0 ? n : e + 2;
      /* 把块注释换成等量换行 —— 直接换成一个空格会让整支尺子报的行号
       * 比真实文件小一千多行（game.js 里块注释很多），点进去是别的地方。 */
      const nl = (src.slice(i, stop).match(/\n/g) || []).length;
      out += '\n'.repeat(nl);
      i = stop;
      continue;
    }
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i + 2);
      i = e < 0 ? n : e;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* 从 `open`（指向 `{`）开始找到配对的 `}`，返回区间 [open, close] */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) break;
        j++;
      }
      i = j;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return [open, i];
    }
  }
  throw new Error('括号没配上：从 offset ' + open + ' 起');
}

/* 顶层按逗号切参数（忽略嵌套里的逗号） */
function splitArgs(s) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* `0.7 + i * 0.18` → 0.7；`1.1` → 1.1；`WIND` → 0.7（本 case 里的
 * `const WIND = 0.7`）；读不懂就 null（不猜）。
 * 认本地常量是必须的：`charge` 写成 `dur: WIND`，不认就报「前摇 ?」，
 * 而它其实有 0.7s —— 尺子看不懂就报红，是最容易把人带偏的一类假红。 */
function evalDur(expr, iVal, scope) {
  const e = String(expr).trim();
  if (!e) return null;
  const keys = Object.keys(scope || {});
  try {
    const f = new Function('i', ...keys, 'return (' + e + ');');
    const v = f(iVal, ...keys.map(k => scope[k]));
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch (_) {
    return null;
  }
}

/* 取 `name(` 这次调用的完整实参串（按括号配对，不吃到下一个调用） */
function callArgs(chunk, name) {
  const out = [];
  const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'g');
  let m;
  while ((m = re.exec(chunk))) {
    let depth = 0, j = m.index + m[0].length - 1, end = -1;
    for (; j < chunk.length; j++) {
      if (chunk[j] === '(') depth++;
      else if (chunk[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) continue;
    out.push({ args: splitArgs(chunk.slice(m.index + m[0].length, end)), at: m.index });
  }
  return out;
}

/* 某个 offset 是否落在本 case 的第一层 `for (...)` 体内。
 * 用途：`roots/rocks/meteor/swordrain` 是「每个判定点各画一个圈」——
 * 循环里同时有 `FX.telegraph` 和 `DIST2D`，形状是匹配的；
 * 早期版本按「有循环 + 只有一个 telegraph 调用」判成不匹配，是尺子的错。 */
function loopSpan(chunk) {
  const i = chunk.search(/for\s*\(\s*let\s+i\s*=\s*0\s*;/);
  if (i < 0) return null;
  const open = chunk.indexOf('{', i);
  if (open < 0) return null;
  const [a, b] = matchBrace(chunk, open);
  return [a, b];
}

/* 伤害不落在 case 体里的技能，只能人工登记（并写明出处）。
 * 不登记就是「倍率未知」，报表里显示 —，不猜。 */
const DAMAGE_ELSEWHERE = {
  charge: {
    mult: 1.3,
    where: 'game.js updateBossAI 的 `else if (e.charging > 0)` 分支：'
      + '`this.damagePlayer(e.dmg * 1.3, e)`，蓄力期间第一帧就能命中',
  },
};

/* ---------------- 主扫描 ---------------- */
const raw = fs.readFileSync(SRC, 'utf8');
const src = stripComments(raw);

/* 注意：`this.bossPattern(e, pp)` 这个**调用点**在定义之前（8614 行）。
 * 用 indexOf('bossPattern(e, pp)') 会命中调用点，把 `{` 找到下一段代码去，
 * 于是整支尺子量的是错的地方还一声不响 —— 必须认「定义」那个 `{`。 */
const defM = /bossPattern\s*\(\s*e\s*,\s*pp\s*\)\s*\{/.exec(src);
if (!defM) {
  console.error('找不到 bossPattern(e, pp) { 定义 —— src/game.js 结构变了，先修尺子');
  process.exit(2);
}
const head = defM.index;
const braceOpen = head + defM[0].length - 1;
const [b0, b1] = matchBrace(src, braceOpen);
const body = src.slice(b0 + 1, b1);

/* 行号：把 offset 换算回原文件行号（报错时能直接跳过去） */
const lineOf = off => src.slice(0, b0 + 1 + off).split('\n').length;

/* 切 case：只认 switch 顶层的 `case 'x': {`
 * 先定位 `switch (pat)`，再在里面按 `case ` 分段。 */
const swIdx = body.indexOf('switch (pat)');
if (swIdx < 0) {
  console.error('bossPattern 里没有 switch (pat) —— 结构变了，先修尺子');
  process.exit(2);
}
const swOpen = body.indexOf('{', swIdx);
const [s0, s1] = matchBrace(body, swOpen);
const swBody = body.slice(s0 + 1, s1);
const swBase = s0 + 1;

const caseRe = /case\s+'([a-z]+)'\s*:\s*\{/g;
const marks = [];
let m;
while ((m = caseRe.exec(swBody))) {
  marks.push({ name: m[1], at: m.index + m[0].length - 1 });
}
marks.push(null);

const rows = [];
for (let k = 0; k < marks.length - 1; k++) {
  const cur = marks[k];
  const nxt = marks[k + 1];
  const [c0, c1] = matchBrace(swBody, cur.at);
  const chunk = swBody.slice(c0, c1 + 1);
  /* 下一个 case 之前的多余尾巴（break;）不算进本 case */
  const tail = nxt ? swBody.slice(c1 + 1, nxt.at).trim() : '';

  /* 本 case 里 `const WIND = 0.7;` 这类数值常量，喂给 evalDur 用 */
  const scope = {};
  const cRe = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*;/g;
  let cm;
  while ((cm = cRe.exec(chunk))) scope[cm[1]] = parseFloat(cm[2]);

  /* --- 倍率 --- */
  const mults = [];
  const mRe = /\b(?:st|e\.dmg)\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g;
  let mm;
  while ((mm = mRe.exec(chunk))) mults.push(parseFloat(mm[1]));
  const ann = DAMAGE_ELSEWHERE[cur.name];
  const mult = mults.length ? Math.max(...mults) : (ann ? ann.mult : null);
  const multFrom = mults.length ? 'case 体' : (ann ? 'AI 循环' : '');

  /* --- 前摇：telegraph 优先 --- */
  const teleCalls = callArgs(chunk, 'FX.telegraph');
  const tele = teleCalls.map(c => ({
    dur: c.args.length >= 3 ? evalDur(c.args[2], 0, scope) : null,
    raw: c.args.length >= 3 ? c.args[2].trim() : null,
    at: c.at,
  }));
  const durs = tele.map(t => t.dur).filter(d => typeof d === 'number');

  /* --- 前摇：形状预警 `FX.zone({ ... dur })` ---
   * U7 起新代码走 zone，不再走 telegraph。两个都认，取最早的那个。 */
  const zoneCalls = callArgs(chunk, 'FX.zone').map(c => {
    const src = c.args[0] || '';
    const shapeM = src.match(/shape\s*:\s*'([a-z]+)'/);
    const durM = src.match(/dur\s*:\s*([^,}]+)/);
    return {
      shape: shapeM ? shapeM[1] : 'circle',
      dur: durM ? evalDur(durM[1], 0, scope) : null,
      raw: durM ? durM[1].trim() : null,
      at: c.at,
    };
  });
  for (const z of zoneCalls) if (typeof z.dur === 'number') durs.push(z.dur);
  const teleMin = durs.length ? Math.min(...durs) : null;

  /* 循环内 telegraph：每个判定点各画一个圈 */
  const span = loopSpan(chunk);
  const teleInLoop = tele.some(t => span && t.at > span[0] && t.at < span[1]);
  const distInLoop = span
    ? /DIST2D/.test(chunk.slice(span[0], span[1])) : false;
  const perPoint = teleInLoop && distInLoop;

  /* --- 前摇：没有 telegraph 时的旁证 --- */
  const stCalls = callArgs(chunk, 'setTimeout');
  const setTimeoutFirst = stCalls.length
    ? evalDur(stCalls[0].args[stCalls[0].args.length - 1], 0, scope) : null;

  /* 蓄力：优先认 `e.chargeWind`（U7 起真正的停顿），退回 `e.charging` */
  const cwM = chunk.match(/e\.chargeWind\s*=\s*([^;\n]+);/);
  const chgM = chunk.match(/e\.charging\s*=\s*([^;\n]+);/);
  const charging = cwM ? evalDur(cwM[1], 0, scope)
    : (chgM ? evalDur(chgM[1], 0, scope) : null);

  /* --- 判定形状 --- */
  /* `DIST2D(new THREE.Vector3(...), x) < 7` —— 不能写 `\([^)]*\)`：
   * 第一个 `)` 是 `THREE.Vector3(` 的，会提前截断，半径全变 null。
   * 按括号配对取完整实参，再看后面跟的 `<`。 */
  const dists = [];
  const dRe = /DIST2D\s*\(/g;
  let dm;
  while ((dm = dRe.exec(chunk))) {
    let depth = 0, j = dm.index + dm[0].length - 1, end = -1;
    for (; j < chunk.length; j++) {
      if (chunk[j] === '(') depth++;
      else if (chunk[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) continue;
    const after = chunk.slice(end + 1, end + 40).match(/^\s*<\s*([0-9]+(?:\.[0-9]+)?)/);
    if (after) dists.push(parseFloat(after[1]));
  }
  const radius = dists.length ? Math.max(...dists) : null;
  const loops = (chunk.match(/for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*(\d+)/) || [])[1];
  let hitShape = 'circle';
  if (loops) hitShape = 'multi-circle(' + loops + ')';
  if (/FX\.projectile/.test(chunk)) hitShape = 'projectile';
  if (/setInterval/.test(chunk)) hitShape = 'area-dot';
  /* 无条件命中（没有 DIST2D，或半径大到跑不出去）：锁定类 */
  if (/applyPlayerSlow/.test(chunk) && !dists.length) hitShape = 'lock';
  if (/FX\.beam/.test(chunk) && dists.length && radius >= 12) hitShape = 'lock(全场)';

  /* --- 预警形状 --- */
  let warnShape = 'none';
  if (tele.length) warnShape = perPoint ? 'circle×N' : 'circle';
  if (!tele.length && /FX\.ring\s*\(/.test(chunk)) warnShape = 'ring-fx';
  if (!tele.length && /FX\.area\s*\(/.test(chunk)) warnShape = 'area';
  if (!tele.length && /FX\.beam\s*\(/.test(chunk)) warnShape = 'beam';
  if (zoneCalls.length) warnShape = 'zone:' + zoneCalls[0].shape;
  if (/FX\.telegraphBand\s*\(/.test(chunk)) warnShape = 'rect';

  /* --- 前摇结论 --- */
  let warn = null, warnFrom = '';
  if (zoneCalls.length && typeof zoneCalls[0].dur === 'number') {
    warn = zoneCalls[0].dur; warnFrom = 'FX.zone [' + zoneCalls[0].raw + ']';
  } else if (teleMin !== null) { warn = teleMin; warnFrom = 'telegraph'; }
  else if (charging !== null) { warn = 0; warnFrom = 'charging(蓄力期间即可命中)'; }
  else if (setTimeoutFirst !== null) { warn = setTimeoutFirst; warnFrom = 'setTimeout(i=0)'; }
  else if (dists.length) { warn = 0; warnFrom = '当帧结算'; }

  /* --- 形状是否匹配 ---
   * 三条不判：
   *   ① 完全不造成伤害（`summon` 只是叫小弟）—— 没有「躲不躲」这回事
   *   ② 弹道（`ringshot`）—— 12 颗子弹本身就是预警，看得见才躲得开
   *   ③ 判定与预警都还没写（warnShape === 'none' 之外的「没前摇也没形状」）
   * 其余按 §3「判定形状决定预警形状」逐条对。 */
  const isLockJudge = hitShape === 'lock' || hitShape === 'lock(全场)';
  const isLockWarn = warnShape === 'lock' || warnShape === 'zone:lock';
  const dealsDamage = mult !== null;
  let shapeMatch = true, shapeNote = '', shapeNA = '';
  if (!dealsDamage) {
    shapeNA = '不造成伤害';
  } else if (hitShape === 'projectile') {
    shapeNA = '弹道自证';
  } else if (isLockJudge && !isLockWarn) {
    shapeMatch = false;
    shapeNote = '判定是锁定（跑不出去），却画了 ' + warnShape + ' —— 看着像能躲';
  } else if (!isLockJudge && hitShape.startsWith('multi-circle') && warnShape === 'circle') {
    shapeMatch = false; shapeNote = '判定是多圆串，预警只画了一个圆';
  } else if (warnShape === 'none') {
    shapeMatch = false; shapeNote = '完全没有预警';
  } else if (warnShape === 'ring-fx') {
    shapeMatch = false; shapeNote = '只是结算时的装饰圈（0s 前摇），不是预警';
  }

  const needWarn = mult !== null && mult > MULT_MIN;
  /* A 前摇：>1.0× 必须有 ≥0.7s 前摇且带预警 */
  const fairA = !needWarn ? true : (warn !== null && warn >= WARN_MIN - 1e-9 && warnShape !== 'none');
  /* B 形状：预警画出来的东西必须读得出判定范围（与倍率无关） */
  const fairB = shapeMatch;
  const fair = fairA && fairB;

  rows.push({
    name: cur.name,
    line: lineOf(swBase + c0),
    mult,
    multFrom,
    warn,
    warnFrom,
    teleRaw: tele.length ? tele[0].raw : null,
    perPoint,
    radius,
    hitShape,
    warnShape,
    shapeMatch,
    shapeNote,
    shapeNA,
    needWarn,
    fairA,
    fairB,
    fair,
    tail: tail.slice(0, 40),
  });
}

/* ---------------- 输出 ---------------- */
const pad = (s, n) => {
  s = String(s === null || s === undefined ? '—' : s);
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('\nbossPattern 公平性静态扫描');
  console.log('  A 前摇：>1.0× 伤害 → 前摇 ≥ ' + WARN_MIN + 's 且带预警（BOSS-VFX-PLAN §2 原文）');
  console.log('  B 形状：预警画出来的东西要读得出判定范围（与倍率无关，§1.4 硬伤 ②）\n');
  console.log('  ' + pad('case', 13) + pad('倍率', 9) + pad('前摇', 8) + pad('来源', 26)
    + pad('判定形状', 18) + pad('预警形状', 12) + 'A    B');
  console.log('  ' + '─'.repeat(102));
  for (const r of rows) {
    const a = r.needWarn ? (r.fairA ? '✅' : '❌') : '·';
    const b = r.shapeNA ? '·' : (r.fairB ? '✅' : '❌');
    console.log('  ' + pad(r.name, 13)
      + pad(r.mult === null ? '—' : '×' + r.mult.toFixed(1) + (r.multFrom === 'AI 循环' ? '*' : ''), 9)
      + pad(r.warn === null ? '—' : r.warn.toFixed(2) + 's', 8)
      + pad(r.warnFrom + (r.teleRaw ? ' [' + r.teleRaw + ']' : ''), 26)
      + pad(r.hitShape + (r.radius !== null ? ' R' + r.radius : ''), 18)
      + pad(r.warnShape, 12)
      + pad(a, 4) + b);
    if (!r.shapeMatch) console.log('  ' + ' '.repeat(13) + '└ B：' + r.shapeNote);
  }
  const need = rows.filter(r => r.needWarn);
  const goodA = need.filter(r => r.fairA);
  const badB = rows.filter(r => !r.fairB);
  console.log('  ' + '─'.repeat(102));
  console.log('  A 前摇：需要前摇的 ' + need.length + ' 个里达标 ' + goodA.length
    + ' 个，不达标 ' + (need.length - goodA.length) + ' 个');
  console.log('  B 形状：' + rows.length + ' 个 case 里读得出判定范围 ' + (rows.length - badB.length)
    + ' 个，读不出 ' + badB.length + ' 个'
    + (badB.length ? '（' + badB.map(r => r.name).join(' / ') + '）' : ''));
  if (rows.some(r => r.multFrom === 'AI 循环')) {
    console.log('  * 倍率不在 case 体里，见 DAMAGE_ELSEWHERE 登记（出处写在注释里）');
  }
  const bad = rows.filter(r => !r.fair);
  if (bad.length) {
    console.log('\n  待办：');
    for (const r of bad) {
      console.log('   · ' + pad(r.name, 13) + 'game.js:' + pad(r.line, 6)
        + (r.fairA ? '' : 'A 前摇 ' + (r.warn === null ? '?' : r.warn + 's'))
        + (r.fairA || r.fairB ? '' : ' ＋ ')
        + (r.fairB ? '' : 'B ' + r.shapeNote));
    }
  }
  console.log('');
}

if (process.argv.includes('--check')) {
  const bad = rows.filter(r => !r.fair);
  process.exit(bad.length ? 1 : 0);
}
