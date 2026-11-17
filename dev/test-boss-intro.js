/* ============================================================
 * dev/test-boss-intro.js —— P15 Boss 战前剧情 · 静态契约（离线，node 直跑）
 *
 * 分两层验：
 *   【数据层】45 只 Boss 都有 intro；{who,text} 结构合法；卷末 5 句、
 *              普通 3 句；首句必为旁白、末句必为「你」；句子非空。
 *   【存档层】bossIntro 跨存档四处齐全（newState / normalizeDoc /
 *              pack / unpack）；skipBossIntro 设置项 SPIKE 与 SET_ROWS。
 *   【源码层】game.js 有 playBossIntro 且接在激活点；输入冻结闸门、
 *              镜头推近、只播一次判定都在；index.html 有演出层 DOM。
 *
 * 后续 P15-2~4 落地后，本脚本会继续加段（先建数据段，保证节点可跑）。
 *
 * 用法：node dev/test-boss-intro.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, JSON, Number, String, Array, Object, parseFloat, parseInt, isFinite };
const g = (e) => vm.runInContext(e, ctx);
vm.createContext(ctx);
const dm = path.join(ROOT, 'src/data/data-monsters.js');
if (!fs.existsSync(dm)) { console.log('缺少 data-monsters.js'); process.exit(1); }
try { vm.runInContext(fs.readFileSync(dm, 'utf8'), ctx, { filename: 'data-monsters.js' }); }
catch (e) { console.log('FAIL data-monsters.js: ' + e.message); process.exit(1); }
const BOSSES = g('BOSSES');

let pass = 0, bad = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}

const ids = Object.keys(BOSSES);
const END = ['golemking', 'flameemperor', 'yellowspring', 'heavenguard', 'chaosavatar'];

console.log('\n【1】45 只 Boss 全有 intro');
ok(ids.length === 45, 'BOSSES 共 45 只', ids.length);
const noIntro = ids.filter(id => !Array.isArray(BOSSES[id].intro) || !BOSSES[id].intro.length);
ok(noIntro.length === 0, '每只 Boss 都有非空 intro 数组', noIntro);

console.log('\n【2】intro 结构：{who,text} 非空字符串');
const badShape = [];
const badEmpty = [];
for (const id of ids) {
  for (const ln of BOSSES[id].intro) {
    if (!ln || typeof ln.who !== 'string' || typeof ln.text !== 'string') badShape.push(id);
    else if (!ln.who.trim() || !ln.text.trim()) badEmpty.push(id);
  }
}
ok(badShape.length === 0, '每句都是 {who:string, text:string}', [...new Set(badShape)]);
ok(badEmpty.length === 0, 'who / text 都不是空串', [...new Set(badEmpty)]);

console.log('\n【3】句数：卷末 5 句，普通 3 句');
const badLen = ids.filter(id => {
  const want = END.indexOf(id) >= 0 ? 5 : 3;
  return BOSSES[id].intro.length !== want;
});
ok(badLen.length === 0, '卷末 5 只 5 句、其余 40 只 3 句', badLen.map(id => id + '=' + BOSSES[id].intro.length));

console.log('\n【4】叙事骨架：首句旁白、末句「你」');
const badFirst = ids.filter(id => BOSSES[id].intro[0].who !== '旁白');
const badLast = ids.filter(id => BOSSES[id].intro[BOSSES[id].intro.length - 1].who !== '你');
ok(badFirst.length === 0, '每只首句都是旁白（场景铺陈）', badFirst);
ok(badLast.length === 0, '每只末句都是「你」（玩家代入）', badLast);
/* 中间句必须由 Boss 自己说，不能又是旁白 */
const badMid = ids.filter(id => BOSSES[id].intro.slice(1, -1).some(ln => ln.who === '旁白' || ln.who === '你'));
ok(badMid.length === 0, '中间句全部由 Boss 本人说', badMid);

console.log('\n【5】剧情台词与战斗 lines 不重复');
const dupLine = ids.filter(id => {
  const lines = BOSSES[id].lines || [];
  return BOSSES[id].intro.some(ln => lines.indexOf(ln.text) >= 0);
});
ok(dupLine.length === 0, 'intro 台词与 lines 战斗台词无一字重复', dupLine);

console.log('\n【6】UI 演出层 DOM 与接口');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
ok(/<div id="bossIntro">/.test(html), 'index.html 有 #bossIntro 演出层');
const domIds = ['biName', 'biTitle', 'biLine', 'biWho', 'biText', 'biSkip'];
ok(domIds.every(id => html.indexOf('id="' + id + '"') >= 0), '六个字幕 DOM 齐全', domIds.filter(id => html.indexOf('id="' + id + '"') < 0));
ok(/#bossIntro\{[^}]*z-index:58/.test(html), '演出层 z-index 58（压 HUD、低于面板）');
ok(/@keyframes biFade/.test(html), '字幕淡入动画存在');
ok(/bossIntroOpen\(cfg\)/.test(ui) && /bossIntroLine\(line/.test(ui) && /bossIntroClose\(\)/.test(ui),
  'ui.js 有 open / line / close 三接口');
ok(/line\.who === '旁白'[\s\S]{0,120}?'narr'/.test(ui) && /line\.who === '你'[\s\S]{0,120}?'hero'/.test(ui),
  '旁白 / 你 两种身份有独立样式');

console.log('\n结果：' + pass + ' pass / ' + bad + ' bad');
process.exit(bad ? 1 : 0);
