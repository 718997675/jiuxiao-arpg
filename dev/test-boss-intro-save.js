/* ============================================================
 * dev/test-boss-intro-save.js —— P15 存档与设置字段契约（离线，node 直跑）
 *
 * 三段：
 *   A. 存档四处齐全：newState / normalizeDoc / pack / unpack + 兜底模板
 *   B. 存档往返：写入 → pack → normalizeDoc → unpack 读回；老档补空；
 *      脏值（'0' / 字符串 / null）夹成 0/1
 *   C. 设置项：DEFAULTS / normalize 的 skipBossIntro，bool 语义；
 *      UI 的 SET_ROWS 有观看/跳过 + 重播动作行，点击已接线
 *
 * 用法：node dev/test-boss-intro-save.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, ROOT } = require('./_load.js');

let pass = 0, bad = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('\n【A】存档四处齐全（进度字段铁律）');
const gameSrc = rd('src/game.js');
const saveSrc = rd('src/core/save.js');
ok(/newState\s*\([\s\S]{0,3000}?bossIntro:\s*\{\}/.test(gameSrc), 'newState 里有 bossIntro: {}');
ok(/normalizeDoc[\s\S]{0,4000}?c\.bossIntro\s*=\s*this\._obj\(c\.bossIntro\)\s*\|\|\s*\{\}/.test(saveSrc), 'normalizeDoc 补字段');
ok(/for \(const k in c\.bossIntro\)[\s\S]{0,220}?v === '0'[\s\S]{0,160}?\? 0 : 1/.test(saveSrc), 'normalizeDoc 逐项夹 0/1（含字符串 0）');
ok(/pack\([\s\S]{0,3500}?bossIntro:\s*this\._obj\(s\.bossIntro\)/.test(saveSrc), 'pack 写出 bossIntro');
ok(/unpack\([\s\S]{0,2500}?bossIntro:\s*this\._obj\(c\.bossIntro\)/.test(saveSrc), 'unpack 读回 bossIntro');
ok(/_fallbackState[\s\S]{0,1200}?bossIntro:\s*\{\}/.test(saveSrc), '兜底模板也有 bossIntro');

console.log('\n【B】真跑存档往返');
const ctx = loadData({ console, Math, Set, Map, JSON, Date,
  localStorage: { getItem() { return null; }, setItem() {} } });
const g = (n) => vm.runInContext(n, ctx);
const SM = g('SaveManager');
ok(!!SM && typeof SM.pack === 'function', 'SaveManager 已装载');

/* B1 正常往返 */
const flat = { cls: 'warrior', name: '测试', level: 5, gold: 100,
  bossIntro: { treeking: 1, golemking: 1 }, bossKilled: {}, seals: {} };
const doc = SM.pack(flat, 1);
ok(doc.char.bossIntro && doc.char.bossIntro.treeking === 1, 'pack 写入 treeking=1');
const back = SM.unpack(SM.normalizeDoc(doc, 1).doc || doc);
ok(back.bossIntro && back.bossIntro.treeking === 1 && back.bossIntro.golemking === 1,
  'unpack 读回两条已播记录', back.bossIntro);
ok(!('snakequeen' in back.bossIntro), '没看过的 Boss 不在记录里');

/* B2 老档兼容：完全没这个字段 */
const oldDoc = SM.pack({ cls: 'mage', name: '老档', level: 10, bossKilled: {}, seals: {} }, 2);
delete oldDoc.char.bossIntro;
const norm = SM.normalizeDoc(oldDoc, 2);
ok(norm.doc.char.bossIntro && Object.keys(norm.doc.char.bossIntro).length === 0,
  '老档缺字段 → 补成空对象（首次遇到照常播）');
ok(norm.changed === true, '补字段后标记 changed（读档会写回）');

/* B3 脏值夹取 */
const dirty = SM.pack({ cls: 'warrior', name: '脏档', bossKilled: {}, seals: {} }, 3);
dirty.char.bossIntro = { treeking: 1, batking: '0', chief: 'yes', snakequeen: null, ghostlord: 0 };
const cleaned = SM.normalizeDoc(dirty, 3).doc.char.bossIntro;
ok(cleaned.treeking === 1, '值 1 保持 1');
ok(cleaned.batking === 0 && cleaned.ghostlord === 0, "字符串 '0' 与数字 0 都夹成 0");
ok(cleaned.chief === 1, "非空字符串 'yes' 夹成 1");
ok(cleaned.snakequeen === 0, 'null 夹成 0');

console.log('\n【C】设置项与 UI 接线');
const setSrc = rd('src/core/settings.js');
const uiSrc = rd('src/ui.js');
ok(/skipBossIntro:\s*false/.test(setSrc), 'DEFAULTS.skipBossIntro = false（默认观看）');
ok(/d\.skipBossIntro\s*=/.test(setSrc), 'normalize 认识 skipBossIntro');
ok(/\{\s*k:\s*'skipBossIntro',\s*label:/.test(uiSrc), 'SET_ROWS 有首领剧情观看/跳过');
ok(/\{\s*k:\s*'replayIntro'[\s\S]{0,120}?act:\s*'replayIntro'/.test(uiSrc), 'SET_ROWS 有重播动作行');
ok(/k === 'replayIntro'[\s\S]{0,220}?replayBossIntros\(\)/.test(uiSrc), '点击重播已接到 Game.replayBossIntros');

console.log('\n结果：' + pass + ' pass / ' + bad + ' bad');
process.exit(bad ? 1 : 0);
