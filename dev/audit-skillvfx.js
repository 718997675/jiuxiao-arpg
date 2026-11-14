#!/usr/bin/env node
/* ============================================================
 * 逐只技能演出审计 · U6-3「该几颗 / 什么色」的尺子
 *
 *   node dev/audit-skillvfx.js            # 人读的表格 + 判据
 *   node dev/audit-skillvfx.js --json     # 机器读（给 test-skillvfx-shape.js 或人眼复核用）
 *
 * 为什么先量再改：U6-2 的教训是「台账写的现象 ≠ 代码里的病因」。
 * U6-3 台账只写「逐条配方未逐个调」，但到底哪几只少颗粒、哪几只没颜色、
 * 哪几只一帧放完，不量就只能是凭感觉挑几只改。这里把 37 只的
 * 原语 / 发数 / 颜色 / 时序 / 剪影全部摊开，逐条给结论。
 *
 * 量的是**实验室**（唯一源），不是生成物 src/sfx.js。
 * 别名口径（U1）：swords→swordarray、stance→avatar、avatar→elementavatar、
 * missile→fireball、rain→swordrain。表里写实验室名，改之前先查 ALIAS。
 *
 * U1 留给 U6 的「离面积下界最近 6 只」单独标 ★，打磨优先级最高：
 * whitetiger 1.09× / iceshard 1.23× / chain 1.25× / bloodrage 1.29× /
 * thrust 1.38× / heal 1.62×。过了下界只说明「收得到」，不等于够显眼。
 * ============================================================ */
'use strict';

const { parseSkills } = require('./skillvfx-shape');

const TIGHT = ['whitetiger', 'iceshard', 'chain', 'bloodrage', 'thrust', 'heal'];
const ALIAS = {
  swords: 'swordarray', stance: 'avatar', avatar: 'elementavatar',
  missile: 'fireball', rain: 'swordrain'
};

let pass = 0, fail = 0;
const bad = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; return; }
  fail++; bad.push(msg);
  console.log('  ✗ ' + msg + (detail === undefined ? '' : '  →  ' + JSON.stringify(detail)));
};

const skills = parseSkills();
const json = process.argv.indexOf('--json') >= 0;

if (json) {
  console.log(JSON.stringify(skills.map(s => ({
    id: s.id, gameId: ALIAS[s.id] || s.id, cls: s.cls, slot: s.slot, name: s.name, sil: s.sil,
    prims: s.prims, builds: s.builds, visualKinds: s.visualKinds,
    nMax: s.nMax, nCount: s.nCount, nVars: s.nVars, loops: s.loops,
    rates: s.rates, meshes: s.meshes, quantitySources: s.quantitySources,
    elemFields: s.elemFields, hex: s.hex, times: s.times, stageKinds: s.stageKinds,
    delays: s.delays, seqs: s.seqs, onHits: s.onHits, updaters: s.updaters,
    lines: s.lines, tight: TIGHT.indexOf(s.id) >= 0
  })), null, 2));
  process.exit(0);
}

console.log('技能演出构成审计 · 源 docs/vfx-playground.html · 共 ' + skills.length + ' 只\n');
console.log('ID                 职 槽 剪影          原语种类                          颗 色 段 备注');
console.log('─'.repeat(112));
for (const s of skills) {
  const id = (s.id + '                  ').slice(0, 18);
  const cls = ({ blade: '刀', mage: '法', taoist: '道' }[s.cls] || s.cls || '?').slice(0, 2);
  const slot = (s.slot || '?');
  const sil = (s.sil + '            ').slice(0, 12);
  /* 构件 = FX.* 原语 + 手工拼的 flatMesh/billMesh/兽形/updater */
  const vk = (s.visualKinds.join(',') + '                                  ').slice(0, 34);
  const n = String(s.nMax || '-').padStart(3);
  const color = s.elemFields.length ? 'E:' + s.elemFields.join('/')
    : (s.hex.length ? 'H:' + s.hex.slice(0, 2).join('/') : '-');
  const stages = String(s.stageKinds).padStart(2);
  const mark = (TIGHT.indexOf(s.id) >= 0 ? ' ★贴地板' : '') + (ALIAS[s.id] ? ' →' + ALIAS[s.id] : '');
  console.log(id + cls + '  ' + slot + ' ' + sil + ' ' + vk + ' ' + n + ' ' +
    (color + '          ').slice(0, 10) + ' ' + stages + mark);
}

console.log('\n判据（逐条给结论，不是跑绿就算完）');
console.log('─'.repeat(112));

ok(skills.length === 37, '实验室里正好 37 只技能', skills.length);
const noPrim = skills.filter(s => !s.prims.length);
ok(noPrim.length === 0, '每只都有 FX.* 原语调用（没有空招）', noPrim.map(s => s.id));

/* 第一次跑只数 FX.*，把 heal（spr + flatMesh + 2 updater）与
 * riposte（arc + billMesh + updater + 延迟第二刀）判成「只有一个圈」——
 * 那是尺子漏抓，不是技能缺东西。现在按「视觉构件」判。 */
const thin = skills.filter(s => s.visualKinds.length < 2);
ok(thin.length === 0, '每只 ≥2 类视觉构件（不是「只画一个圈」）',
  thin.map(s => ({ id: s.id, kinds: s.visualKinds })));

const noColor = skills.filter(s => !s.elemFields.length && !s.hex.length);
ok(noColor.length === 0, '每只都有颜色来源（元素染色或显式色，不是默认白）',
  noColor.map(s => s.id));

/* 四种第二段骨架：delay / seq / onHit（飞行体）/ addUpdate（持续演出）。
 * 只认数字字面量的 delay 会把 chain 的 delay(i*0.055)、heal 的 delay(d)
 * 全漏掉；missile 的命中干脆整段写在 onHit 里。
 * **判据只看「有没有非瞬时骨架」**：实验室本来就用 addUpdate 逐帧演领域，
 * 要求「≥2 种骨架」是凭空加的严格条件（第一次跑 18 只假红），没有方案依据。
 * 四种骨架的覆盖分布作为观察项打印，不判红。 */
const flat = skills.filter(s => s.stageKinds === 0);
ok(flat.length === 0, '每只都有非瞬时演出骨架（不是一帧放完）',
  flat.map(s => s.id));
const stageDist = {
  delay: skills.filter(s => s.delays > 0).length,
  seq: skills.filter(s => s.seqs > 0).length,
  onHit: skills.filter(s => s.onHits > 0).length,
  addUpdate: skills.filter(s => s.updaters > 0).length
};
console.log('  观察 · 时序骨架覆盖：delay ' + stageDist.delay + ' / seq ' + stageDist.seq +
  ' / onHit ' + stageDist.onHit + ' / addUpdate ' + stageDist.addUpdate + '（共 37 只，可重叠）');

/* 数量控制有六种写法（n: / for / 字面量数组 / 按 dt 速率 / 固定 mesh /
 * 变量 n）。全枚举只为**观察**，不拿来判红 —— 判据越宽越没判别力。
 * 真正判「该几颗够不够」的是真机面积尺子 dev/vfx-skill-vis.js --live。 */
const noCount = skills.filter(s => s.quantitySources === 0);
console.log('  观察 · 无数量写法痕迹：' + (noCount.length ? noCount.map(s => s.id).join(', ') : '无') +
  ' · 写法分布 n: ' + skills.filter(s => s.nCount + s.nVars > 0).length +
  ' / for ' + skills.filter(s => s.loops > 0).length +
  ' / 数组 ' + skills.filter(s => s.lits > 0).length +
  ' / dt速率 ' + skills.filter(s => s.rates > 0).length +
  ' / 固定mesh ' + skills.filter(s => s.meshes > 0).length);

/* U1 贴地板 6 只：面积余量 <1.7×，是 U6-3 真正的打磨对象。
 * 它们至少要有 3 类构件 + 数量控制，否则加量时只能靠放大半径硬撑。 */
const weak = TIGHT.map(id => skills.find(s => s.id === id)).filter(Boolean)
  .filter(s => s.visualKinds.length < 3 || s.quantitySources === 0);
ok(weak.length === 0, '贴地板 6 只都 ≥3 类构件且有数量控制（可打磨，不是只能放大半径）',
  weak.map(s => ({ id: s.id, kinds: s.visualKinds, q: s.quantitySources })));

/* §13 第 1 条的机器侧支撑：同职业 5 招剪影两两不同。
 * 人眼「灰度后认出 ≥4」归 U6-4 出图，这里只保证数据层不撞车。 */
const byCls = {};
for (const s of skills) (byCls[s.cls] = byCls[s.cls] || []).push(s);
for (const cls of Object.keys(byCls)) {
  const g = byCls[cls];
  const sils = g.map(s => s.sil);
  ok(new Set(sils).size === sils.length,
    cls + ' 的 ' + g.length + ' 招剪影文案两两不同', sils);
  const sigs = g.map(s => s.prims.join('+') + '|' + s.sil);
  ok(new Set(sigs).size === sigs.length,
    cls + ' 的 ' + g.length + ' 招「原语组合 + 剪影」签名两两不同',
    g.map(s => s.id + ':' + s.prims.join('+') + '/' + s.sil));
}
const allSil = skills.map(s => s.sil);
ok(new Set(allSil).size === allSil.length, '37 只剪影文案全局两两不同',
  allSil.filter((v, i) => allSil.indexOf(v) !== i));

/* 贴地板 6 只：面积余量 <1.7×，U6-3 优先加量。这里只标出来，不判红 ——
 * 「显不显眼」是面积尺子的活，归 dev/vfx-skill-vis.js --live。 */
console.log('\n★ U1 留下的贴地板 6 只（--live 面积余量 <1.7×，优先打磨）：');
for (const id of TIGHT) {
  const s = skills.find(x => x.id === id);
  if (!s) continue;
  console.log('  ' + (id + '            ').slice(0, 14) +
    ' 构件 ' + s.visualKinds.length + ' 类 [' + s.visualKinds.join(',') + '] · 最大发数 ' +
    (s.nMax || '-') + ' · 色 ' + (s.elemFields.join('/') || s.hex.slice(0, 2).join('/') || '?') +
    ' · 时序骨架 ' + s.stageKinds + ' 种' +
    (s.visualKinds.length < 3 ? '   ← 缺构件，U6-3 打磨对象' : ''));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' 演出构成审计：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('未通过：' + bad.join('；')); }
process.exit(fail === 0 ? 0 : 1);
