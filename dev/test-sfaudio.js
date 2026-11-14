#!/usr/bin/env node
/* ============================================================
 * [U6-2] 技能音效三段契约（node + vm，不启浏览器）
 *
 *   node dev/test-sfaudio.js
 *
 * 判的是「三段有没有配齐、时序对不对、散落的音有没有收干净」，
 * 真机链路（音画同拍 / 无双响）归 dev/probe-sfx-align.js。
 * 这里用 stub 的 SFX / Game / setTimeout 加载 data-sfaudio.js + sfx-audio.js，
 * 逐条喂状态 —— 跟 test-elemfx.js 同一套写法。
 *
 * 为什么「散落」也要判：U6-2 之前命中音散在 game.js 的 40+ 处调用点，
 * 那正是「改一处必漏、音画错位查不出来」的根源。收口之后要**钉住**，
 * 让后来人想再加一处 `SFX.explode()` 的代价是被这条测试拦住。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

/* ---------------- 一、数据表 ---------------- */

/* 真数据源：SKILL_ORDER 的 37 只技能 id。不手抄。 */
const skillSrc = read('src/data/data-skills.js');
const SKILL_IDS = [];
{
  const start = skillSrc.indexOf('const SKILL_ORDER = {');
  const end = skillSrc.indexOf('\n};', start);
  const block = skillSrc.slice(start, end);
  const re = /'([a-z]+)'/g;
  let m;
  while ((m = re.exec(block))) SKILL_IDS.push(m[1]);
}

const dataSrc = read('src/data/data-sfaudio.js');
const sandbox = {
  console, Math, JSON, Object, Number, String, Array, Boolean,
  setTimeout: (fn, ms) => { sandbox.__timers.push({ fn, ms }); return 0; },
  __timers: []
};
vm.createContext(sandbox);
vm.runInContext(dataSrc + '\n;globalThis.__K = SFX_AUDIO_KEYS;'
  + 'globalThis.__T = SKILL_AUDIO;'
  + 'globalThis.__q = skillAudio;'
  + 'globalThis.__ok = skillAudioOk;', sandbox, { filename: 'src/data/data-sfaudio.js' });
const KEYS = sandbox.__K;
const TBL = sandbox.__T;
const skillAudio = sandbox.__q;
const skillAudioOk = sandbox.__ok;

console.log('一、数据表：37 只技能 × 三段');
ok(SKILL_IDS.length === 37, 'SKILL_ORDER 里有 37 只技能', SKILL_IDS.length);
ok(Array.isArray(KEYS) && KEYS.length > 0, '音色白名单存在（' + (KEYS ? KEYS.length : 0) + ' 个）');

const missing = SKILL_IDS.filter(id => !skillAudio(id));
ok(missing.length === 0, '每只技能都有音效配置（不漏一只）', missing);

const badKeys = [];
for (const id of SKILL_IDS) {
  const a = skillAudio(id);
  if (!a) continue;
  for (const seg of ['cast', 'impact', 'impactCrit']) {
    const k = a[seg];
    if (k === null || k === undefined) continue;
    if (KEYS.indexOf(k) < 0) badKeys.push({ id, seg, k });
  }
  if (a.after && KEYS.indexOf(a.after.key) < 0) badKeys.push({ id, seg: 'after', k: a.after.key });
}
ok(badKeys.length === 0, '所有段用的音色都在白名单里（没有手滑写错键名）', badKeys);

const noCast = SKILL_IDS.filter(id => { const a = skillAudio(id); return a && !a.cast; });
ok(noCast.length === 0, '每只技能都有起手段（按下键必须立刻有反馈）', noCast);

const noAfter = SKILL_IDS.filter(id => { const a = skillAudio(id); return a && !a.after; });
ok(noAfter.length === 0, '每只技能都有余韵段（§5 第三段）', noAfter);

/* §5：余韵 200~600ms */
const badMs = [];
for (const id of SKILL_IDS) {
  const a = skillAudio(id);
  if (!a || !a.after) continue;
  if (!(a.after.ms >= 200 && a.after.ms <= 600)) badMs.push({ id, ms: a.after.ms });
}
ok(badMs.length === 0, '余韵延迟落在 §5 的 200~600ms 窗口内', badMs);

ok(SKILL_IDS.every(id => skillAudioOk(id)), 'skillAudioOk() 对 37 只全为真');

/* 起手音不能 37 只全一样 —— 那等于没有辨识度 */
const castSet = new Set(SKILL_IDS.map(id => (skillAudio(id) || {}).cast).filter(Boolean));
ok(castSet.size >= 4, '起手音不是只有一两种（有辨识度）', [...castSet]);

/* 原本有两个起手音的技能（召唤 / 终极技：低频轰鸣是它们的身份），
 * 收口时必须用 cast2 保住那个和弦，不能只剩一个音。 */
const chord = SKILL_IDS.filter(id => (skillAudio(id) || {}).cast2);
ok(chord.length >= 6, '原本的双起手音用 cast2 保住了（和弦没被吞）', chord);

/* 余韵三种音都用上了 —— 只配一种就等于「所有技能的尾巴一个味」 */
const afterSet = new Set(SKILL_IDS.map(id => (skillAudio(id) || {}).after).filter(Boolean).map(x => x.key));
ok(afterSet.size >= 3, '余韵三种音（tail / rustle / ring）都用上了', [...afterSet]);

/* ---------------- 二、解释层行为 ---------------- */

console.log('\n二、解释层：三段的时序与去重');

const audioSrc = read('src/sfx-audio.js');
const played = [];
const sb2 = {
  console, Math, JSON, Object, Number, String, Array, Boolean, Date,
  performance: { now: () => sb2.__now },
  __now: 1000,
  /* SFX 门面：只记「什么时候决定发哪个音」 */
  SFX: {},
  Game: { mapGen: 1 },
  setTimeout: (fn, ms) => { sb2.__timers.push({ fn, ms }); return 0; },
  __timers: []
};
/* 白名单里每个键都挂一个记录器 */
for (const k of KEYS) sb2.SFX[k] = () => { played.push({ k, t: sb2.__now }); };

vm.createContext(sb2);
vm.runInContext(dataSrc + '\n' + audioSrc + '\n;globalThis.__A = SfxAudio;'
  + 'globalThis.__q = skillAudio;', sb2, { filename: 'sfx-audio bundle' });
const A = sb2.__A;
const q2 = sb2.__q;

const flush = () => {
  /* 按 ms 排序，并循环到没有新定时器 —— 真实 setTimeout 是按**到期时间**
   * 触发，不是按注册顺序。兜底 / impactAt / 余韵三者有时序依赖，
   * 按注册顺序跑会得出「兜底抢在落地音前面」这种假结论。 */
  let guard = 0;
  while (sb2.__timers.length && guard++ < 10) {
    const list = sb2.__timers.slice().sort((a, b) => a.ms - b.ms);
    sb2.__timers.length = 0;
    for (const t of list) { sb2.__now += t.ms; t.fn(); }
  }
};
const reset = () => { played.length = 0; sb2.__timers.length = 0; A.reset(); A.stats.cast = A.stats.impact = A.stats.after = A.stats.dedup = A.stats.fallback = 0; };

/* 2.1 起手 → 命中 → 余韵 三段都响，且顺序正确 */
reset();
A.cast('fireball');
ok(played.length === 1 && played[0].k === q2('fireball').cast, '起手：发了一声，音色 = 配置的 cast', played);
/* [U6-2 补] cast 会挂一个**余韵兜底**定时器 —— 领域 / 换式 / 护盾没有
 * 「伤害结算」那一拍，impact 永远不来，余韵不能因此整段消失。 */
ok(sb2.__timers.length === 1, '起手就挂了余韵兜底定时器（8 只无命中技能靠它）');
A.impact('fireball', false);
ok(played.length === 2 && played[played.length - 1].k === q2('fireball').impact,
  '命中：发了第二声，音色 = 配置的 impact', played);
ok(sb2.__timers.length === 2, '命中后又排了一个余韵定时器（兜底 + 正常余韵）');
const aftTimer = sb2.__timers.filter(t => t.ms === q2('fireball').after.ms);
ok(aftTimer.length >= 1, '余韵延迟 = 配置的 after.ms', sb2.__timers.map(t => t.ms));
flush();
ok(played.length === 3 && played[2].k === q2('fireball').after.key,
  '余韵：到点发了第三声，兜底没重复响', played);

/* 2.1b 和弦：配了 cast2 的技能，起手要响两声 */
reset();
const cid = chord[0];
A.cast(cid);
ok(played.length === 2 && played[0].k === q2(cid).cast && played[1].k === q2(cid).cast2,
  'cast2 和弦：起手响两声（' + cid + '）', played);

/* 2.2 AOE 去重：一次施放打 5 只怪只响一声命中 */
reset();
A.cast('quake');
sb2.__now += 10; A.impact('quake', false);
sb2.__now += 10; A.impact('quake', false);
sb2.__now += 10; A.impact('quake', false);
const quakeHits = played.filter(p => p.k === q2('quake').impact).length;
ok(quakeHits === 1, 'AOE 命中去重：3 次伤害结算只响 1 声命中', { hits: quakeHits, dedup: A.stats.dedup });

/* 2.3 余韵一发只补一次 */
flush();
const quakeAfter = played.filter(p => p.k === q2('quake').after.key).length;
ok(quakeAfter === 1, '余韵一发技能只补一次（不按目标数累加）', quakeAfter);

/* 2.4 去重窗口之外的第二发要响（多段技不能被吃掉） */
reset();
A.cast('whirl');
sb2.__now += 5; A.impact('whirl', false);
sb2.__now += 300; A.impact('whirl', false);      /* 超过 120ms 窗口 */
ok(A.stats.impact === 2, '超过去重窗口的第二次命中照常响（多段技不被吞）', A.stats.impact);

/* 2.5 暴击音：配了 impactCrit 的用暴击音 */
reset();
const hasCrit = SKILL_IDS.filter(id => (q2(id) || {}).impactCrit);
ok(hasCrit.length > 0, '有技能配了暴击音（impactCrit）', hasCrit.length);
A.cast(hasCrit[0]);
A.impact(hasCrit[0], true);
ok(played[played.length - 1].k === q2(hasCrit[0]).impactCrit,
  '暴击时用 impactCrit 音（不是普通命中音）', played[played.length - 1]);

/* 2.6 没有 impact 段的技能（增益 / 治疗）：施放后直接补余韵，命中口走 fallback */
reset();
const noImpact = SKILL_IDS.filter(id => { const a = q2(id); return a && !a.impact; });
ok(noImpact.length > 0, '存在「没有命中段」的技能（增益 / 治疗）', noImpact.length);
const nid = noImpact[0];
A.cast(nid);
ok(sb2.__timers.length === 1, '增益类：施放后直接排余韵（没有命中可等）', nid);
let fbCalled = 0;
const ret = A.impact(nid, false, () => { fbCalled++; });
ok(ret === false && fbCalled === 1, '增益类命中口走 fallback（保住原来的受击音）', { ret, fbCalled });

/* 2.7 未知技能：不兜底、不抛 */
reset();
ok(A.cast('__no_such_skill__') === false, '未知技能：cast 返回 false（不兜底成通用音）');
ok(played.length === 0, '未知技能：一个音都不发');

/* 2.8 施法令牌按技能分槽：A 技能的余韵不会被 B 技能吞掉 */
reset();
A.cast('fireball');
A.cast('quake');                                  /* 连着放第二招 */
A.impact('fireball', false);                       /* 火球（投射物）晚一点命中 */
flush();
const fAfter = played.filter(p => p.k === q2('fireball').after.key).length;
ok(fAfter === 1, '异步命中的投射物：自己的余韵照常补（不被后放的技能吞掉）', fAfter);

/* 2.9 reset（换图）清空令牌，旧余韵不再响 */
reset();
A.cast('meteor');
A.reset();
flush();
ok(A.stats.after === 0, '换图 reset 之后：未发的余韵不再响', A.stats.after);

/* 2.10 领域类：impactAt 自报落地（每跳伤害是 silent DoT，但三段不能缺命中） */
reset();
const zones = SKILL_IDS.filter(id => (q2(id) || {}).impactAt);
ok(zones.length >= 4, '领域类技能配了 impactAt（落地即命中）', zones);
const zid = zones[0];
A.cast(zid);
flush();
const zImpact = played.filter(p => p.k === q2(zid).impact).length;
const zAfter = played.filter(p => p.k === q2(zid).after.key).length;
ok(zImpact === 1, '领域落地：自报一次 impact（不靠 silent DoT 触发）', { id: zid, zImpact, played });
ok(zAfter === 1, '领域落地之后接上余韵，且只响一次', { id: zid, zAfter, played });

/* 2.11 无命中技能：兜底补余韵（真机实测曾有 8 只整段没有） */
reset();
A.cast('heal');
flush();
ok(played.filter(p => p.k === q2('heal').after.key).length === 1,
  '没有命中段的技能：余韵兜底到点补一声', played);

/* 2.12 兜底与正常余韵互斥（不双尾巴） */
reset();
A.cast('fireball');
A.impact('fireball', false);
flush();
ok(played.filter(p => p.k === q2('fireball').after.key).length === 1,
  '命中过的技能：兜底不再重复发余韵', played);

/* 2.13 afterGuard：慢命中技能的兜底延后到命中之后 */
reset();
A.cast('meteor');
ok(sb2.__timers.some(t => t.ms === q2('meteor').afterGuard),
  '陨石的余韵兜底延后到 afterGuard（不会跑到命中前面）', sb2.__timers.map(t => t.ms));

/* 2.14 令牌 seq 隔离：同一技能连放两次，旧令牌的兜底被挡住 */
reset();
A.cast('whirl');
A.cast('whirl');
flush();
ok(A.stats.after === 1, '同一技能连放两次：旧令牌的兜底不重复发声', A.stats.after);

/* 2.15 cast2 不撞 impact（pyroclasm 曾同帧两个 explode） */
const clash = SKILL_IDS.filter(id => { const a = q2(id); return a && a.cast2 && a.cast2 === a.impact; });
ok(clash.length === 0, '起手和弦不与命中音撞键（避免同帧双响）', clash);

/* 2.16 延迟伤害认人：oldestPending 取「最早还没命中」的那一发 */
reset();
A.cast('meteor');
A.cast('riposte');                 /* 陨石飞行期间自动施放了别的招 */
ok(A.oldestPending() === 'meteor',
  '延迟爆炸认对人：取最早未命中的那一发（不是最近施放）', A.oldestPending());
A.impact('meteor', false);
ok(A.oldestPending() === 'riposte', '一发命中后退出队列，下一发补上', A.oldestPending());

/* 2.17 跨技能同音色短窗口去重（白虎召唤物 + 自动施放 51ms 连出两声 hit） */
reset();
A.cast('whitetiger');
A.cast('riposte');
A.impact('whitetiger', false);
sb2.__now += 50;
A.impact('riposte', false);
ok(played.filter(p => p.k === 'hit').length === 1,
  '不同技能 50ms 内同音色：只响一声（不叠噪音）', played);
sb2.__now += 200;
A.impact('riposte', false);
ok(played.filter(p => p.k === 'hit').length === 2,
  '超过 120ms 窗口后照常响（真·第二次命中不被吞）', played);

/* ---------------- 三、接线纪律（源码级） ---------------- */

console.log('\n三、接线纪律：散落的音必须收干净');

const gameSrc = read('src/game.js');
/* 只切 castSkill 的 switch 段 —— 技能 case 里的音效必须全走三段层 */
const switchAt = gameSrc.indexOf("switch (id) {");
const castEnd = gameSrc.indexOf('this._castSkill = null;', switchAt);
const caseBlock = gameSrc.slice(switchAt, castEnd > switchAt ? castEnd : switchAt + 60000);

ok(caseBlock.length > 5000, 'castSkill 的 switch 段抠出来了（' + caseBlock.length + ' 字符）');
/* 容许的例外：SFX.ui()（界面反馈，不是技能音）、SFX.skill()（老兜底） */
const stray = [];
const strayRe = /SFX\.([a-z]+)\(\)/g;
let sm;
while ((sm = strayRe.exec(caseBlock))) {
  const k = sm[1];
  if (k === 'ui' || k === 'skill') continue;
  stray.push(k);
}
ok(stray.length === 0, '技能 case 里不再有散落的技能音（起手/命中全走三段层）', stray);

/* 命中音必须挂在 damageEnemy 的伤害落地处，且走 SfxAudio */
ok(/SfxAudio\.impact\(sfxWho/.test(gameSrc), 'damageEnemy 的命中口调 SfxAudio.impact');
ok(/SfxAudio\.oldestPending\(\)/.test(gameSrc),
  '延迟伤害用 oldestPending 认施法者（不被飞行期间的自动施放覆盖）');
ok(/SfxAudio\.cast\(id/.test(gameSrc), 'castSkill 的起手口调 SfxAudio.cast');
ok(/本次施放的 id/.test(gameSrc) || /_sfxCastId = id/.test(gameSrc), 'castSkill 记下了本次施放的技能 id');
ok(/this\._proj && this\._proj\.sfxId/.test(gameSrc), '投射物命中：用 _proj.sfxId 兜底认人（异步命中不认错招）');
ok(/SfxAudio\.reset\(\)/.test(gameSrc), '换图调了 SfxAudio.reset（旧余韵不飘到新图）');

/* explodeAt 的爆炸音不能无条件响 —— 与 impact 双响 */
const explodeHead = gameSrc.slice(gameSrc.indexOf('explodeAt(pos, radius, baseDmg'), gameSrc.indexOf('explodeAt(pos, radius, baseDmg') + 1400);
ok(/willHit/.test(explodeHead), 'explodeAt 先数命中数再决定要不要自己发爆炸音（避免与 impact 双响）');

/* sfx-audio.js 纪律 */
const audioStrict = audioSrc;
ok(/if \(mapGen\(\) !== gen\) return;/.test(audioStrict), '余韵回调里比 mapGen（换图后自动作废）');
ok(!/new THREE/.test(audioStrict), '音效层不碰 THREE（纯音频，不该有几何）');
ok(/IMPACT_WINDOW/.test(audioStrict) && /CAST_WINDOW/.test(audioStrict), '两个窗口都是显式常量');

/* index.html 必须按顺序加载 */
const html = read('index.html');
const iData = html.indexOf('src/data/data-sfaudio.js');
const iLayer = html.indexOf('src/sfx-audio.js');
const iGame = html.indexOf('src/game.js');
const iFx = html.indexOf('src/fx.js');
ok(iData > 0 && iLayer > 0, 'index.html 引了两个新文件');
ok(iData < iLayer, 'data-sfaudio.js 在 sfx-audio.js 之前（解释器要读表）');
ok(iFx < iLayer, 'fx.js 在 sfx-audio.js 之前（要调 SFX 门面）');
ok(iLayer < iGame, 'sfx-audio.js 在 game.js 之前（castSkill / damageEnemy 要用）');

/* 余韵三音必须真的写进了 fx.js */
const fxSrc = read('src/fx.js');
for (const k of ['tail', 'rustle', 'ring']) {
  ok(new RegExp('\\n  ' + k + '\\(\\) \\{').test(fxSrc), 'fx.js 里有 ' + k + '() 音色');
}

console.log('\n' + (fail ? '✗' : '✓') + ' 技能音效三段契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
