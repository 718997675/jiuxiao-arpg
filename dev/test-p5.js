#!/usr/bin/env node
/* ============================================================
 * [equip-doll P5] 图标 / 说明页同源 · 离线契约
 *
 *   node dev/test-p5.js
 *
 * 方案 §11 第 8 条：**文档同源** —— 说明页条目数 == 数据表族数、
 * 图标键集合 == 族键集合。这一节把这两条钉死，并且用反向断言禁止
 * 「写死 33」这种当期对、下期就骗人的实现。
 * ============================================================ */
'use strict';
const fs = require('fs');
const vm = require('vm');
const { loadData, ROOT } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const ctx = loadData({});
const q = expr => vm.runInContext(expr, ctx);
const src = f => fs.readFileSync(require('path').join(ROOT, f), 'utf8');

/* ---------- 一、族键集合 ---------- */
console.log('一、族键集合');
const fams = q('DOLL_FAM_NAME');
const slots = q('Object.keys(DOLL_PARTS)');
const expect = [];
for (const s of slots) for (const f of fams) expect.push(s + '-' + f);
const actual = q('Object.keys(DOLL_ICONS)');
ok(expect.length === 33, '数据表必须是 11 槽 × 3 族 = 33', { slots: slots.length, fams: fams.length });
ok(actual.length === 33, '图标必须正好 33 张', actual.length);
ok(expect.every(k => actual.indexOf(k) >= 0), '每个族都要有自己的图标',
  expect.filter(k => actual.indexOf(k) < 0));
ok(actual.every(k => expect.indexOf(k) >= 0), '图标不许出现数据表里没有的族',
  actual.filter(k => expect.indexOf(k) < 0));
ok(actual.every(k => /<path|<circle|<ellipse/.test(q('DOLL_ICONS[' + JSON.stringify(k) + ']'))),
  '每张族图标都要有真实 SVG 路径（不是空壳）');
/* 三族的装饰层必须真的不同 —— 否则「族级图标」只是换了个名字 */
const overlays = q('JSON.stringify(DOLL_FAM_ICON)');
ok(new Set(Object.values(JSON.parse(overlays))).size === 3, '三族的图标装饰层必须互不相同');

/* ---------- 二、图标与 3D 同族 ---------- */
console.log('二、图标与 3D 同族（同一个 dollKeyOf）');
const mism = [];
let n = 0;
for (const slot of slots) {
  for (let tier = 0; tier < 8; tier++) {
    for (let fam = 0; fam < 3; fam++) {
      const it = q('rollItem(' + (tier * 7) + ', {slot:' + JSON.stringify(slot) +
        ',cls:"warrior",rarity:"rare"})');
      if (!it) continue;
      it.baseVar = fam;
      it.baseTier = tier;
      const key = q('dollKeyOf(' + JSON.stringify(it) + ')');
      const icon = q('itemIconKey(' + JSON.stringify(it) + ')');
      n++;
      if (icon !== key.slot + '-' + key.fam) mism.push({ slot, tier, fam, want: key.slot + '-' + key.fam, got: icon });
    }
  }
}
ok(n >= 33 * 5, '至少要穷举 165 组槽/阶/族', n);
ok(mism.length === 0, '图标键必须等于 dollKeyOf 的 槽-族', mism.slice(0, 6));
/* 武器 / 副手继续按 shape，不按族 */
const wK = q('itemIconKey({slot:"weapon",shape:"staff",baseVar:2,uid:1,rarity:"rare"})');
const ohK = q('itemIconKey({slot:"offhand",shape:"orb",baseVar:1,uid:2,rarity:"rare"})');
ok(wK === 'staff' && ohK === 'orb', '武器 / 副手仍按 shape 出图', { wK, ohK });

/* ---------- 三、说明页同源 ---------- */
console.log('三、说明页从数据表实时生成');
const UI = src('src/ui.js').replace(/\/\*[\s\S]*?\*\//g, '');
/* 取**函数定义**而不是调用点：MENU_TABS 里也有 this.renderHelp()/renderSettings()，
 * 用 indexOf('renderHelp()') 会切到那一行，长度是负的，五条断言一起假红。 */
const HELP = UI.slice(UI.indexOf('  renderHelp() {'), UI.indexOf('  renderSettings() {'));
ok(HELP.indexOf('DOLL_PARTS') >= 0, '说明页必须读 DOLL_PARTS，不能手写族表');
ok(HELP.indexOf('DOLL_FAM_NAME') >= 0, '说明页必须读 DOLL_FAM_NAME');
ok(HELP.indexOf('dollAccentCount') >= 0, '品质光条数必须读数据表函数');
ok(HELP.indexOf('装备模组') >= 0, '说明页必须有「装备模组」一节');
/* 反向：新加的那一节里不许出现写死的 33 —— 当期对了，加族那天就成谎话 */
const dollSec = HELP.slice(HELP.indexOf('十六 · 装备模组'));
ok(!/(^|[^\d])33([^\d]|$)/.test(dollSec.slice(0, 2600)), '装备模组一节不许写死 33');
/* 三轴的 name / axis 必须直接来自族定义 */
ok(HELP.indexOf('d.name') >= 0 && HELP.indexOf('d.axis') >= 0,
  '说明页的族名与三轴差异必须读族定义');

/* ---------- 四、不新建第二个 WebGL context ---------- */
console.log('四、试衣间不新建 GL context');
const PRE = src('src/doll-preview.js');
const HTML = src('index.html');
ok(!/new\s+THREE\.WebGLRenderer/.test(PRE), '预览模块不许 new WebGLRenderer');
ok(!/getContext\(\s*['"]webgl/.test(PRE), '预览模块不许 getContext(webgl)');
ok(PRE.indexOf('Game.renderer') >= 0, '预览必须共用 Game.renderer');
ok(PRE.indexOf('WebGLRenderTarget') >= 0, '预览必须走离屏 RenderTarget');
ok(/getContext\(\s*['"]2d['"]\s*\)/.test(PRE), '预览的展示层必须是 2D canvas blit');
ok(PRE.indexOf('readRenderTargetPixels') >= 0, 'RT 读回必须显式调用（不能假装 blit）');
ok((HTML.match(/<script src="src\/doll-preview\.js"/g) || []).length === 1,
  '试衣间脚本只能加载一次');
/* 加载顺序：必须在 game.js 之后（要用 Game.previewLook） */
ok(HTML.indexOf('src/game.js') < HTML.indexOf('src/doll-preview.js'),
  'doll-preview.js 必须排在 game.js 之后');

/* ---------- 五、试穿不改真装备 ---------- */
console.log('五、试穿与真装备隔离');
ok(PRE.indexOf('Game.state.equipment') >= 0, '预览基线必须读真装备');
ok(/Object\.assign\(\{\}, Game\.state\.equipment\)/.test(PRE),
  '试穿必须复制一份装备表，不能直接改 Game.state.equipment');
const GAME = src('src/game.js');
ok(GAME.indexOf('previewLook(equipment, cls)') >= 0, 'game.js 必须提供独立试穿角色');
ok(GAME.indexOf('this._lookActor') >= 0, '试穿角色必须单独存，不能复用 Game.actor');

console.log('\n----------------------------------------');
console.log(fail ? `✗ ${pass} 通过 / ${fail} 失败` : `✓ 全部通过：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
