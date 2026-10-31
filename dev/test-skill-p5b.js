/* ============================================================
 * 技能 P5b 契约：①~④ 位的接线（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p5b.js
 *
 * P5 做完的是**配方**（45 套剪影，`test-skill-p5.js` 钉住了）。
 * P5b 做的是**接线**：让游戏里真的去调 `playSkillVfx`，并且**不双播**。
 *
 * 为什么「不双播」是这一份的核心而不是「接上了没有」：
 * 每个 case 里本来就有一堆手写 FX（`FX.ring` / `FX.burst` / `FX.flashCircle`）。
 * 直接把配方叠上去，最省事，但那等于「同一个意思画两遍」——
 * 玩家看到的是更亮，不是更准；绘制预算还翻倍。所以接线这件事的判据是
 * **「配方替掉了哪几行」**，不是「配方加进去了」。
 *
 * 六节：
 *   一、29 只技能全部接线（每个 case 至少一次 playSkillVfx）
 *   二、分段播口径：命中在回调里的技能必须带 `segments`
 *   三、不许双播：配方旁边紧挨着手写剪影 → 必须登记理由
 *   四、两个「必须传」的参数：连射要 `decal: null`，同形三只要 `color`
 *   五、playSkillVfx 的参数透传（源码级）
 *   六、`VFX.play` 的 `segments` 语义（拿桩跑解释器）
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ============================================================
 * 切出 castSkill 的 case 块
 *
 * 不引 parser：`game.js` 是单文件 IIFE，抽出来跑要摆几十个桩，而这一份要验的
 * 只是「源码里怎么写的」。所以按 `case 'xxx': {` 与下一个同缩进的 case 切块，
 * 先把注释抹掉再数 —— 否则 `* 原来的 FX.ring 已由配方接管` 这种注释会被数进去。
 * ============================================================ */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')     // 块注释
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');  // 行注释
}

function caseBlocks() {
  const lines = src('src/game.js').split('\n');
  const first = lines.findIndex(l => /^      case 'whirl': \{/.test(l));
  const out = {};
  let cur = null, buf = [];
  for (let i = first; i < lines.length; i++) {
    const l = lines[i];
    const m = /^      case '([a-z]+)':/.exec(l);
    if (m) {
      if (cur) out[cur] = stripComments(buf.join('\n'));
      cur = m[1]; buf = [l];
      continue;
    }
    if (/^    \}$/.test(l)) { if (cur) out[cur] = stripComments(buf.join('\n')); break; }
    if (cur) buf.push(l);
  }
  return out;
}

const BLOCKS = caseBlocks();

/* 29 只「在 castSkill 里有一个 case」的技能。`avatar` 也在，但它的剪影走
 * `bladeFormVfx` / `bladeFinisherVfx`（P4 的兵形状态机），不是 playSkillVfx。 */
const CASES = [
  'whirl', 'thrust', 'execute', 'leap', 'swordarray', 'skysfall', 'quake', 'avatar',
  'elementavatar', 'fireball', 'frostnova', 'chain', 'meteor', 'iceshield', 'starfall',
  'iceshard', 'blizzard', 'firewall', 'pyroclasm', 'thundercloud', 'judgement',
  'talisman', 'talismanarrow', 'mastersigil', 'summon', 'whitetiger', 'azuredragon',
  'heal', 'poison', 'swordrain'
];

/* ============================================================
 * 一、全部接线
 * ============================================================ */
console.log('一、30 个 case 全部接线');
{
  let wired = 0;
  for (const id of CASES) {
    const body = BLOCKS[id];
    ok(!!body, 'castSkill 里有 `' + id + '` 这个 case');
    if (!body) continue;
    const n = (body.match(/playSkillVfx\(/g) || []).length;
    ok(n >= 1, id + ' 调了 playSkillVfx（' + n + ' 处）', n);
    if (n >= 1) wired++;
  }
  ok(wired === CASES.length, '30 个 case 全部接线（' + wired + '/' + CASES.length + '）', wired);

  /* 共享 case 也要查：6 只增益技能挤在同一个 case 里 */
  ok(/'warcry': case 'bloodrage'/.test(src('src/game.js')), '增益组（warcry / bloodrage / taiji / shieldwall / riposte / antidote）仍是共享 case');
  ok(/case 'revive': \{/.test(src('src/game.js')) &&
    /playSkillVfx\('revive'|playSkillVfx\(id/.test(src('src/game.js')), 'revive 也接了（它不在上面的列表里，但同样是①~④ 位）');

  /* 兵形（⑤）走自己的口，不能混进 playSkillVfx —— 否则换式会播满级配方 */
  const av = BLOCKS.avatar;
  ok(/bladeFinisherVfx\(/.test(av), 'avatar：终结技走 bladeFinisherVfx（按刀式取形）');
  ok(/bladeFormVfx\(/.test(av), 'avatar：换式走 bladeFormVfx');
}

/* ============================================================
 * 二、分段播：命中在回调里的技能必须带 `segments`
 *
 * 这一节是 P5b 里最容易漏、后果最离谱的一条。火球的命中在 `onHit` 里，
 * 陨石 / 天罚的命中在 `telegraph` 的回调里，剑雨的命中在 rAF 回调里 ——
 * 整条一起播的话，爆炸会出现在**施法者脚下**（因为 `pos` 传的是施法点）。
 * ============================================================ */
console.log('二、分段播：延时命中必须 `segments`');
{
  /* 命中发生在「别处 / 以后」的技能：必须出现 `segments:` */
  const DELAYED = [
    'fireball', 'meteor', 'judgement', 'starfall', 'iceshield', 'talisman',
    'talismanarrow', 'iceshard', 'thrust', 'execute', 'skysfall', 'leap',
    'chain', 'swordrain', 'blizzard', 'frostnova', 'thundercloud', 'pyroclasm'
  ];
  for (const id of DELAYED) {
    const body = BLOCKS[id] || '';
    ok(/segments:/.test(body), id + ' 用了 `segments`（命中不在施法那一帧）');
  }

  /* 合法的段名只有三个：`VFX.play` 里 `on(k)` 就是按这三个名字过滤的。
   * 写错一个字母 = 那一段**永远不播**，而且不报错。 */
  const game = src('src/game.js');
  const segs = new Set();
  const re = /segments:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(game))) {
    for (const s of m[1].split(',')) {
      const t = s.trim().replace(/^['"]|['"]$/g, '');
      if (t) segs.add(t);
    }
  }
  const bad = [...segs].filter(s => ['cast', 'loop', 'impact'].indexOf(s) < 0);
  ok(bad.length === 0, 'segments 里只出现 cast / loop / impact', bad);
  ok(segs.has('cast') && segs.has('impact'),
    'cast 与 impact 都用上了（不是只会整条播）', [...segs]);
  /* `['cast','loop']` 这种组合也要真的存在：起手 + 飞行段，命中另算 */
  ok(/segments:\s*\['cast',\s*'loop'\]/.test(game), '有 `[\'cast\',\'loop\']` 的组合（起手 + 飞行段，命中另接）');
  /* 只播命中：落地/破盾那一侧 */
  ok(/segments:\s*\['impact'\]/.test(game), '有只播命中段的调用点');
}

/* ============================================================
 * 三、不许双播
 *
 * 判据：一次 `playSkillVfx` 的**前后 4 行**里如果还有手写的
 * `FX.ring` / `FX.burst` / `FX.flashCircle`，那基本就是「配方加上了、老的没删」。
 * 允许的例外必须写在这张表里，并且写清**为什么那一条不能删**。
 * ============================================================ */
console.log('三、不许双播（配方旁边不许再手写剪影）');
{
  const WHY = {
    pyroclasm: 'FX.ring 是 7 码判定边界（画多大 = 打多大），配方里的 cast 环只有一半',
    frostnova: 'ring + flashCircle 是「新星」的环形读法，配方给的是火墙位的「一排」',
    elementavatar: '7 码外环是「窗口」的边界，配方给的是贴身阵环',
    execute: '挥空分支的小圈 —— 打空了不该塌一块地',
    blizzard: 'FX.area 是判定圈，不是剪影',
    thrust: '起跑扬尘是「人从这儿窜出去」的痕迹，配方里没有这一层'
  };
  const NEAR = 4;
  const lines = stripComments(src('src/game.js')).split('\n');
  const HAND = /FX\.(ring|burst|flashCircle|spark)\(/;
  let hits = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('playSkillVfx(')) continue;
    let near = null;
    for (let j = Math.max(0, i - NEAR); j < Math.min(lines.length, i + NEAR + 1); j++) {
      if (j === i) continue;
      if (HAND.test(lines[j])) { near = lines[j].trim(); break; }
    }
    if (!near) continue;
    /* 找这一次调用属于哪个 case */
    let owner = null;
    for (let j = i; j >= 0; j--) {
      const m = /^      case '([a-z]+)':/.exec(lines[j]);
      if (m) { owner = m[1]; break; }
    }
    hits++;
    ok(!!WHY[owner], '第 ' + (i + 1) + ' 行 [' + owner + '] 配方旁边的手写剪影已登记理由',
      { near: near.slice(0, 60) });
  }
  ok(hits >= 3, '这条规则真的查到了东西（' + hits + ' 处挨着的，全部登记过）', hits);

  /* 反过来的硬断言：这几处**必须**已经删掉（P5b 之前它们是双播的重灾区）。
   * 只在**这个 case 的块**里查 —— 全文件还有别的 30 次循环（UI 那边的星图），
   * 拿整份文件 grep 会假红。 */
  const game = src('src/game.js');
  ok(!/playSkillVfx\('summon',[^)]*\);\s*\n\s*FX\.flashCircle\(pp, 2\.4/.test(game),
    '召灵兽：配方后面那行 `FX.flashCircle(pp, 2.4, …)` 已删（同一句话画两遍）');
  ok(!/playSkillVfx\('elementavatar',\s*\{[^}]*\}\);\s*\n\s*FX\.flashCircle/.test(game),
    '法相换相：配方后面没有残留的 flashCircle');
  const BURST_LOOPS = [
    ['frostnova', 30, '冰霜新星：30 次 `FX.burst`（30 次绘制 → 3 次）'],
    ['pyroclasm', 36, '焚天：36 次 `FX.burst`'],
    ['avatar', 24, '剑神降世：24 次 `FX.burst`'],
    ['elementavatar', 22, '法相开窗：22 次 `FX.burst`']
  ];
  for (const [id, n, why] of BURST_LOOPS) {
    const b = BLOCKS[id] || '';
    ok(b.indexOf('i < ' + n + ';') < 0, why + ' 的循环已删');
  }
}

/* ============================================================
 * 四、两个「必须传」的参数
 * ============================================================ */
console.log('四、连射要 `decal: null`，同形三只要 `color`');
{
  /* 冰枪是 3~8 连射：每发都留一块元素残留，一次齐射就能把贴花池吃空 */
  ok(/decal:\s*null/.test(BLOCKS.iceshard || ''), 'iceshard 传了 `decal: null`（连射不留残）');
  const n = ((BLOCKS.iceshard || '').match(/decal:\s*null/g) || []).length;
  ok(n === 1, 'iceshard 只在命中段关一次残留（不多不少）', n);

  /* 三只灵兽共用 `summon` 一条剪影 —— 绿 / 金 / 蓝就是它们的身份 */
  ok(/playSkillVfx\('summon',\s*\{[^}]*color:\s*0x9affd0/.test(BLOCKS.summon || ''),
    '召灵兽（狼）传了绿色（同形靠色区分）');
  ok(/playSkillVfx\('summon',\s*\{[^}]*color:\s*0xffe0b0/.test(BLOCKS.whitetiger || ''),
    '白虎传了金色');
  ok(/playSkillVfx\('summon',\s*\{[^}]*color:\s*0x6ac8ff/.test(BLOCKS.azuredragon || ''),
    '青龙传了蓝色');
  /* 化龙（变体）也走这条：自己变成龙，半径比召龙大一圈 */
  const drag = BLOCKS.azuredragon || '';
  ok(/playSkillVfx\('summon',\s*\{\s*radius:\s*3\.2,\s*color:\s*0x6ac8ff/.test(drag),
    '青龙·化龙变体也接了（半径 3.2 的起手）');

  /* 颜色覆盖是「少数位有自己的身份色」的唯一出路，所以要在源码层验一次 */
  ok(/id === 'taiji' \|\| id === 'antidote' \? 0x88ffd0/.test(src('src/game.js')),
    '太极 / 解毒的身份色仍然由 case 给（配方按元素取色会把它冲掉）');
}

/* ============================================================
 * 五、playSkillVfx 的参数透传（源码级）
 * ============================================================ */
console.log('五、playSkillVfx 的透传契约');
{
  const game = src('src/game.js');
  ok(/if \(o\.color !== undefined\) ctx\.color = o\.color;/.test(game), '`color` 透传');
  ok(/if \(o\.tex !== undefined\) ctx\.tex = o\.tex;/.test(game), '`tex` 透传');
  ok(/if \(o\.decal !== undefined\) ctx\.decal = o\.decal;/.test(game), '`decal` 透传（`null` 也要能透 —— 它是「关掉残留」）');
  ok(/if \(o\.segments\) ctx\.segments = o\.segments;/.test(game), '`segments` 透传');
  /* `decal` 的判据必须是 `!== undefined` 而不是 `if (o.decal)`：
   * 后者会把 `decal: null` 当成「没传」，iceshard 的关残留就失效了 */
  ok(!/if \(o\.decal\) ctx\.decal/.test(game), '`decal` 没有写成 `if (o.decal)`（那样 `null` 会被吃掉）');
}

/* ============================================================
 * 六、`VFX.play` 的 segments 语义（拿桩跑）
 * ============================================================ */
console.log('六、`segments` 真的只播那几段');
{
  const calls = [];
  class V3 {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() { return this; }
  }
  const ctx = { console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  ctx.THREE = { Vector3: V3, Color: class { constructor() { } multiplyScalar() { return this; } getHex() { return 0; } } };
  ctx.FXK = {
    spr: () => { calls.push('spr'); return {}; },
    shock: () => { calls.push('shock'); return {}; },
    decal: () => { calls.push('decal'); return {}; },
    bolt: () => { calls.push('bolt'); return {}; },
    trail: () => { calls.push('trail'); return {}; }
  };
  ctx.FX = {
    ring: () => { calls.push('ring'); },
    flashCircle: () => { calls.push('flash'); },
    beam: () => { calls.push('beam'); },
    slash: () => { calls.push('arc'); }
  };
  ctx.Game = { mapGen: 1 };
  /* `vfx.js` 的 `_ctx` 会读 `ELEM_PROFILE`（没写元素时按材质取色），
   * 而它是 `data-vfx.js` 里的常量 —— 不先装载就会在 `ELEM_PROFILE.phys` 上炸。 */
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/data/data-vfx.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/vfx.js'), 'utf8') + '\n;globalThis.__VFX = VFX;', ctx);
  const VFX = ctx.__VFX;

  const rec = {
    sil: 'x', color: 0xffffff, tex: 'spark', decal: 'scorch',
    cast: [{ t: 'ring', r: 0.4 }],
    loop: [{ t: 'trail', r: 0.5 }],
    impact: [{ t: 'flash', r: 0.3 }]
  };
  const run = seg => {
    calls.length = 0;
    VFX.play(rec, { pos: new V3(), aim: new V3(), radius: 3, segments: seg });
    return calls.slice();
  };

  ok(JSON.stringify(run(['cast'])) === '["ring"]', '只播 cast：只画那一圈', run(['cast']));
  ok(JSON.stringify(run(['impact'])) === '["flash"]', '只播 impact：只画命中那一下', run(['impact']));
  ok(JSON.stringify(run(['cast', 'loop'])) === '["ring","trail"]', 'cast + loop：起手与飞行段，不画命中', run(['cast', 'loop']));
  ok(JSON.stringify(run(undefined)) === '["ring","trail","flash"]', '不传 segments：三段全播（老行为不变）', run(undefined));

  /* `decal: null` 真的会关掉残留 —— 这是 iceshard 那一行的依据 */
  const rec2 = { sil: 'x', cast: [], loop: [], impact: [{ t: 'decal', r: 0.5 }] };
  calls.length = 0;
  VFX.play(rec2, { pos: new V3(), aim: new V3(), radius: 3, decal: null });
  ok(calls.length === 0, '`decal: null` 真的不画贴花（连射靠它省贴花池）', calls);
  calls.length = 0;
  VFX.play(rec2, { pos: new V3(), aim: new V3(), radius: 3 });
  ok(calls.length === 1, '不传 `decal` 时按元素材质画（默认行为不变）', calls);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P5b 契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
