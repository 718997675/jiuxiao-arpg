#!/usr/bin/env node
/* ============================================================
 * 逐只技能演出构成契约（U6-3 · node 直跑，不启浏览器）
 *
 *   node dev/test-skillvfx-shape.js
 *
 * 与 dev/audit-skillvfx.js 的分工：
 *   audit 给**人读的表 + 观察项**（哪几只贴地板、时序骨架覆盖率、数量写法分布）；
 *   本契约把「不能退化的那几条」钉死，改实验室时跑一次就知道有没有把
 *   某只技能改回「只有一个圈」。
 *
 * 为什么量实验室而不是生成物：docs/vfx-playground.html 是唯一源。
 * 但生成物也不能漏 —— 第 9 组判据专门盯「改了源头忘了 --write」，
 * 这正是 U1 踩过的（实验室换 spinBlades、游戏里还是 arc，没人发现）。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSkills, PLAYGROUND, ROOT } = require('./skillvfx-shape');

const html = fs.readFileSync(PLAYGROUND, 'utf8');
const gen = fs.readFileSync(path.join(ROOT, 'src', 'sfx.js'), 'utf8');
const skills = parseSkills(html);
const byId = Object.fromEntries(skills.map(s => [s.id, s]));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const TIGHT = ['whitetiger', 'iceshard', 'chain', 'bloodrage', 'thrust', 'heal'];
/* U1 的别名坑：按游戏 id 去实验室找同名条目会改到另一只技能。 */
const ALIAS = {
  swords: 'swordarray', stance: 'avatar', avatar: 'elementavatar',
  missile: 'fireball', rain: 'swordrain'
};

console.log('一、解析底座与别名');
/* 生成器把实验室的 `id: {...}` 改写成 `"id": function(c) {...}`，
 * 键带双引号 —— 按 `id:` 找会一个都找不到（第一次跑 6 条假红）。 */
const KEY = id => '"' + id + '":';
ok(skills.length === 37, '实验室正好 37 只技能', skills.length);
ok(skills.filter(s => s.prims.length || s.builds.length).length === 37,
  '37 只都解析出视觉构件（锚点没漂）', skills.filter(s => !s.prims.length && !s.builds.length).map(s => s.id));
for (const [lab, game] of Object.entries(ALIAS)) {
  ok(!!byId[lab], '实验室有别名源技能 ' + lab);
  ok(gen.indexOf(KEY(game)) >= 0, '生成物里对应游戏 id ' + game);
}
ok(gen.indexOf(KEY('chain')) >= 0, '生成物里有 chain');

console.log('二、逐只构件 / 颜色 / 时序（§13 第 1 条的机器侧支撑）');
for (const s of skills) {
  ok(s.visualKinds.length >= 2, s.id + ' ≥2 类视觉构件', s.visualKinds);
  ok(s.elemFields.length + s.hex.length >= 1, s.id + ' 有颜色来源',
    { elem: s.elemFields, hex: s.hex });
  ok(s.stageKinds >= 1, s.id + ' 有非瞬时演出骨架',
    { delay: s.delays, seq: s.seqs, onHit: s.onHits, updater: s.updaters });
}

console.log('三、同职业 5 招能分开（剪影 + 原语组合签名）');
const byCls = {};
for (const s of skills) (byCls[s.cls] = byCls[s.cls] || []).push(s);
for (const cls of Object.keys(byCls)) {
  const g = byCls[cls];
  ok(new Set(g.map(s => s.sil)).size === g.length, cls + ' 剪影两两不同', g.map(s => s.id + ':' + s.sil));
  ok(new Set(g.map(s => s.prims.join('+') + '|' + s.sil)).size === g.length,
    cls + ' 原语组合 + 剪影签名两两不同', g.map(s => s.id));
}
ok(new Set(skills.map(s => s.sil)).size === skills.length, '37 只剪影全局两两不同');

console.log('四、U1 贴地板 6 只不许退回「只有一根线」');
for (const id of TIGHT) {
  const s = byId[id];
  ok(!!s, '贴地板清单里的 ' + id + ' 存在');
  if (!s) continue;
  ok(s.visualKinds.length >= 3, id + ' ≥3 类构件', s.visualKinds);
  ok(s.quantitySources >= 1, id + ' 数量控制有据', s.quantitySources);
}

console.log('五、chain 的三段（U6-3 实质打磨，不许被回退）');
{
  const s = byId.chain;
  const code = s.code;
  ok(code.indexOf('flatMesh(TEX.ring') >= 0, 'chain 用 flatMesh(TEX.ring) 画地面环');
  ok((code.match(/flatMesh\(TEX\.ring/g) || []).length >= 2,
    'chain 有起手环 + 每跳落点环两处 flatMesh', (code.match(/flatMesh\(TEX\.ring/g) || []).length);
  ok((code.match(/addUpdate\s*\(/g) || []).length >= 2,
    'chain 起手环与落点环各有自己的 updater（不是一帧贴死）',
    (code.match(/addUpdate\s*\(/g) || []).length);
  ok(code.indexOf('charge') >= 0 && code.indexOf('land') >= 0,
    'chain 起手蓄势 / 落地留痕两段都在');
  ok(code.indexOf('0xffe066') >= 0, 'chain 两段同色（电流黄，不另起一套配色）');
  ok(s.stageKinds >= 2, 'chain ≥2 种时序骨架', s.stageKinds);
  /* 落点环必须挂在「该跳的 delay 回调里」，不能提到循环外一次性铺完 ——
   * 那样会变成「所有落点同时亮」，折线跳连的逐跳读法就没了。 */
  const delayAt = code.indexOf('delay(i*0.055');
  const landAt = code.indexOf('const land');
  ok(delayAt >= 0 && landAt > delayAt, '落点环写在逐跳 delay 回调内', { delayAt, landAt });
}

console.log('六、生成物同步（改了源头忘了 --write 会在这里红）');
{
  const a = gen.indexOf(KEY('chain'));
  const b = gen.indexOf('\n    "', a + 10);
  const seg = gen.slice(a, b > a ? b : a + 4000);
  ok(seg.indexOf('charge') >= 0, 'src/sfx.js 的 chain 带起手环');
  ok(seg.indexOf('land') >= 0, 'src/sfx.js 的 chain 带落点环');
  ok((seg.match(/flatMesh\(TEX\.ring/g) || []).length >= 2,
    'src/sfx.js 的 chain 两处 flatMesh 都在');
  ok(seg.indexOf('U6-3') >= 0, 'src/sfx.js 带着 U6-3 的口径注释（说明是走生成器来的）');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 技能演出构成契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
