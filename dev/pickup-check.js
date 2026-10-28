/* ============================================================
 * dev/pickup-check.js —— 自动拾取 + 品质筛选的专项体检（P04）
 *
 * 两段，离线 + 真浏览器：
 *   一、离线：设置项的默认值 / 脏数据回落 / 品质顺序表
 *   二、浏览器：把 5 件不同品质的装备摆在「自动圈内、拾取圈外」，
 *              看谁被吸走、谁留在地上带「未拾取」角标
 *
 * 为什么必须有浏览器段：
 *   这一段要验的三件事全是**距离与顺序**：
 *     ① 够格的从 4.2 米被吸走（不是老口径的 2.4 米）
 *     ② 不够格的留在原地 —— 差一点写成「也吸到脚边」，肉眼看不出来
 *     ③ 行囊满时只提示一次，不是一件一条
 *   只查源码的话，`autoR` 写成 `pullR` 也能过。
 *
 * 用法：
 *   node dev/pickup-check.js
 *   NODE_PATH=<puppeteer 所在> node dev/pickup-check.js
 * ============================================================ */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const head = (t) => console.log('\n— ' + t + ' —');

/* ============================================================
 * 一、离线：设置项与品质顺序
 * ============================================================ */
const ctx = vm.createContext({
  console, Math, JSON, Date, isFinite, isNaN, Number, String, Array, Object, parseInt, parseFloat,
  window: { devicePixelRatio: 1 },
  /* Settings.load/save 要 Store；这里给个空壳，不碰真 localStorage */
  Store: { getKey() { return null; }, setKey() {} }
});
const g = (e) => vm.runInContext(e, ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script src="(src\/[^"]+\.js)"><\/script>/g)) {
  const f = m[1];
  if (!(f.startsWith('src/data/') || f === 'src/items.js' || f === 'src/core/settings.js')) continue;
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const Settings = g('Settings');
const RARITY = g('RARITY');
const RARITY_ORDER = g('RARITY_ORDER');
const rarityRank = g('rarityRank');

head('一、设置项默认值（P04）');
const D = Settings.DEFAULTS;
ok(D.autoPickup === true, 'autoPickup 默认开', D.autoPickup);
ok(D.pickupMinRarity === 'magic', 'pickupMinRarity 默认灵品', D.pickupMinRarity);
ok(D.pickupGold === true && D.pickupMat === true && D.pickupRune === true,
  '金币 / 匠材 / 符文三类掉落默认都自动捡', [D.pickupGold, D.pickupMat, D.pickupRune]);

head('二、脏数据与老存档回落');
const n0 = Settings.normalize(null);
ok(n0.autoPickup === true && n0.pickupMinRarity === 'magic', '空存档 → 全默认（不是全关）', n0);
/* 这条是真正的坑：老存档里根本没有这几个字段，
 * 若写成 !!o.autoPickup，undefined 会变成 false，玩家会以为新版本把自动拾取弄丢了 */
const nOld = Settings.normalize({ fps: true, volMaster: 50 });
ok(nOld.autoPickup === true, '老存档（无拾取字段）升级后仍是自动拾取开', nOld.autoPickup);
ok(nOld.fps === true && nOld.volMaster === 50, '老字段不受影响', [nOld.fps, nOld.volMaster]);
const nBad = Settings.normalize({ autoPickup: false, pickupMinRarity: 'epic' });
ok(nBad.autoPickup === false, 'autoPickup:false 生效', nBad.autoPickup);
ok(nBad.pickupMinRarity === 'magic', '非法品质 epic → 回落灵品（本作没有 epic 档）', nBad.pickupMinRarity);
ok(Settings.normalize({ pickupMinRarity: 'set' }).pickupMinRarity === 'set', '合法值 set 保留');
ok(Settings.RARITY_OPTS.every(r => !!RARITY[r]),
  'RARITY_OPTS 五项全部是真实存在的品质', Settings.RARITY_OPTS);

head('三、品质顺序表（rarityRank）');
ok(RARITY_ORDER.join(',') === 'common,magic,rare,legendary,set,unique',
  '顺序取自 RARITY 声明顺序', RARITY_ORDER);
const seq = RARITY_ORDER.map(r => rarityRank(r));
ok(seq.every((v, i) => v === i), 'rank 与声明顺序一致（0..5 严格递增）', seq);
ok(rarityRank('nope') === 0, '未知品质 → 0（当作最低，不会被误判成可自动捡）');
ok(rarityRank('magic') > rarityRank('common') && rarityRank('unique') > rarityRank('set'),
  '灵品 > 凡品、传世 > 套装');

head('四、源码口径');
const gsrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
const usrc = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
ok(/const autoR = 4\.2 \+ pr \* 0\.6/.test(gsrc), '自动拾取圈是独立的 autoR（4.2 米），不是复用 pullR');
ok(/d < \(auto \? autoR : pullR\)/.test(gsrc), '吸附半径按「够不够格」分开取');
ok(/rarityRank\(l\.item\.rarity\) >= cfg\.minRank/.test(gsrc), '装备按品质门槛判自动拾取');
ok(/_holdTagSprite\(\)/.test(gsrc), '「未拾取」角标有独立构造（共享材质）');
ok(/自动拾取暂停/.test(gsrc), '行囊满时是「自动拾取暂停」而不是逐件红字');
ok(/now - \(this\._autoFullAt \|\| -99\) > 10/.test(gsrc), '行囊满提示 10 秒去重');
ok(/\{ k: 'autoPickup', label: '自动拾取', bool: true/.test(usrc), '设置面板有「自动拾取」开关');
for (const k of ['pickupMinRarity', 'pickupGold', 'pickupMat', 'pickupRune']) {
  ok(usrc.indexOf(`k: '${k}'`) > 0, '设置面板有 ' + k);
}
ok((usrc.match(/sub: 'autoPickup'/g) || []).length === 4,
  '四个子项都挂在总开关下（总开关关掉时变灰）', (usrc.match(/sub: 'autoPickup'/g) || []).length);
ok(/\.setrow\.off\{opacity/.test(html), '灰掉子项的样式存在');

/* ============================================================
 * 二、浏览器：真的把东西吸走 / 真的留在地上
 * ============================================================ */
const puppeteer = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

(async () => {
  if (!puppeteer || !exe) {
    console.log('\n（跳过浏览器段：找不到 puppeteer-core 或 Chrome）');
    return finish();
  }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300));

  /* 进第一张图就行：不打架，只要地面和玩家 */
  await page.evaluate(() => {
    Game.startNew('mage', 'T');
    Game.state.level = 60;
    Game.recalc();
    Game.travelTo('forest');
  });
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    ready = await page.evaluate(() => ({ map: Game.state.mapId, loot: Game.loot.length, pg: !!Game.playerGroup }));
    if (ready.map === 'forest' && ready.pg) break;
  }
  head('五、场景');
  ok(ready && ready.map === 'forest' && ready.pg, '进图完成（桃源外森林）', ready);

  /* 公共工具：清空地面 / 摆一排装备 / 空跑若干帧 updateLoot */
  await page.evaluate(() => {
    window.__T = {
      /* 清空地面掉落（连同光柱一起还回） */
      clearLoot() {
        while (Game.loot.length) { const l = Game.loot.pop(); if (l.obj) disposeTree(l.obj); }
      },
      /* 在玩家东边 dist 米处摆一件指定品质的装备 */
      put(rarity, dist) {
        const pp = Game.playerGroup.position;
        const it = rollItem(60, { cls: 'mage', pool: [[rarity, 1]] });
        Game.spawnLoot({ x: pp.x + dist, z: pp.z }, it, 0);
        return it;
      },
      /* 空跑：dt 固定，模拟若干帧。主循环仍在跑，但逻辑相同，不冲突 */
      tick(n) { for (let i = 0; i < n; i++) Game.updateLoot(0.05); },
      /* 把地上的东西挪到玩家脚下（不动玩家，避免地形/物理把位置抢回去） */
      toFeet() {
        const pp = Game.playerGroup.position;
        for (const l of Game.loot) { l.pos.x = pp.x; l.pos.z = pp.z; l.obj.position.x = pp.x; l.obj.position.z = pp.z; }
      },
      snap() {
        const pp = Game.playerGroup.position;
        return {
          inv: Game.state.inventory.map(i => i.rarity),
          loot: Game.loot.map(l => ({
            r: l.item ? l.item.rarity : (l.rune ? 'rune' : (l.mat ? 'mat' : (l.crystal ? 'crystal' : 'gold'))),
            tag: !!l.tag,
            d: +Math.hypot(pp.x - l.pos.x, pp.z - l.pos.z).toFixed(2)
          })),
          gold: Game.state.gold
        };
      }
    };
    if (!UI.__hooked) {
      UI.__hooked = true;
      const old = UI.log.bind(UI);
      UI.log = function (t) { (window.__logs = window.__logs || []).push(String(t)); return old.apply(null, arguments); };
    }
    window.__logs = [];
  });

  /* ---------------- 5.1 品质门槛 ---------------- */
  head('六、品质门槛：rare 档下只捡玄品以上');
  const s1 = await page.evaluate(() => {
    Settings.set('autoPickup', true);
    Settings.set('pickupMinRarity', 'rare');
    Game.state.inventory.length = 0;
    window.__T.clearLoot();
    for (const r of ['common', 'common', 'common', 'magic', 'rare']) window.__T.put(r, 3.5);
    const before = window.__T.snap();
    window.__T.tick(90);
    return { before, after: window.__T.snap() };
  });
  ok(s1.before.loot.length === 5, '摆下 5 件（3 白 1 蓝 1 金）', s1.before.loot.length);
  ok(s1.before.loot.every(l => l.d > 2.4 && l.d < 4.2),
    '五件都落在「自动圈内、老吸附圈外」（' + s1.before.loot.map(l => l.d).join(' / ') + ' 米）',
    s1.before.loot.map(l => l.d));
  ok(s1.after.inv.length === 1 && s1.after.inv[0] === 'rare',
    '只有玄品自动进了行囊（其余四件留在原地）', s1.after.inv);
  ok(s1.after.loot.length === 4, '地上还剩 4 件', s1.after.loot.length);
  ok(s1.after.loot.every(l => l.tag), '留在地上的每一件都挂了「未拾取」角标',
    s1.after.loot.map(l => [l.r, l.tag]));
  ok(s1.after.loot.every(l => l.d > 2.4),
    '没被自动捡的没有被吸到脚边（还在原位，没跟着玩家跑）', s1.after.loot.map(l => l.d));

  /* ---------------- 5.2 关掉总开关 ---------------- */
  head('七、关掉自动拾取 → 回到「走近才捡」');
  const s2 = await page.evaluate(() => {
    Settings.set('autoPickup', false);
    window.__T.tick(60);
    const mid = window.__T.snap();
    window.__T.toFeet();
    window.__T.tick(10);
    return { mid, after: window.__T.snap() };
  });
  ok(s2.mid.loot.length === 4, '关掉后四件仍然在地上（没有继续被吸）', s2.mid.loot.length);
  ok(s2.mid.loot.every(l => !l.tag), '关掉总开关时不再挂角标（全都得自己走过去，不是意外）',
    s2.mid.loot.map(l => l.tag));
  ok(s2.after.loot.length === 0, '走到脚边（grabR 内）照样能捡起来 —— 关开关不等于捡不到',
    s2.after.loot.length);
  ok(s2.after.inv.length === 5, '行囊里现在 5 件', s2.after.inv);

  /* ---------------- 5.3 行囊满 ---------------- */
  head('八、行囊满：自动拾取静默暂停，不刷屏');
  const s3 = await page.evaluate(() => {
    Settings.set('autoPickup', true);
    Settings.set('pickupMinRarity', 'common');
    const cap = Game.bagCap();
    while (Game.state.inventory.length < cap) {
      Game.state.inventory.push(rollItem(1, { cls: 'mage', pool: [['common', 1]] }));
    }
    window.__T.clearLoot();
    window.__logs = [];
    for (let i = 0; i < 3; i++) window.__T.put('rare', 3.0);
    window.__T.tick(120);       // 6 秒模拟时间，足够把 3 件都吸到脚边
    const logs1 = window.__logs.slice();
    window.__T.tick(120);       // 再跑 6 秒：10 秒去重窗口内不该再刷
    return {
      cap, inv: Game.state.inventory.length,
      loot: Game.loot.length,
      logs1, logs2: window.__logs.slice()
    };
  });
  const fullLogs = s3.logs2.filter(t => /自动拾取暂停/.test(t));
  ok(s3.inv === s3.cap, '行囊确实是满的（' + s3.inv + '/' + s3.cap + '）', [s3.inv, s3.cap]);
  ok(s3.loot === 3, '三件都还在地上（没被吞掉，腾出位置后能接着捡）', s3.loot);
  ok(fullLogs.length === 1, '12 秒里只提示 1 次（不是一件一条）', s3.logs2.filter(t => /行囊/.test(t)));
  ok(!s3.logs2.some(t => /先清理背包/.test(t)), '自动拾取卡住时不走「先清理背包」那条逐件提示');

  /* ---------------- 5.4 腾出位置就恢复 ---------------- */
  head('九、腾出位置后自动恢复');
  const s4 = await page.evaluate(() => {
    Game.state.inventory.pop();
    window.__T.tick(60);
    return { inv: Game.state.inventory.length, loot: Game.loot.length };
  });
  ok(s4.inv === s3.cap, '腾出一格立刻捡回一件（自动拾取没有被「卡死」）', s4);
  ok(s4.loot === 2, '地上还剩 2 件', s4.loot);

  /* ---------------- 5.5 三类非装备掉落 ---------------- */
  head('十、金币 / 匠材 / 符文 单独开关');
  const s5 = await page.evaluate(() => {
    Game.state.inventory.length = 0;
    window.__T.clearLoot();
    Settings.set('pickupGold', false);
    Settings.set('pickupMat', false);
    Settings.set('pickupRune', false);
    window.__T.put('rare', 3.5);
    Game.loot.pop();                        // 上面那件不用，换三类掉落
    Game.spawnLoot({ x: Game.playerGroup.position.x + 3.5, z: Game.playerGroup.position.z }, null, 500);
    Game.spawnLoot({ x: Game.playerGroup.position.x + 3.5, z: Game.playerGroup.position.z }, null, 0, { mat: { id: 'ore', n: 2 } });
    Game.spawnLoot({ x: Game.playerGroup.position.x + 3.5, z: Game.playerGroup.position.z }, null, 0, { rune: rollRune(60) });
    const g0 = Game.state.gold;
    window.__T.tick(90);
    const off = window.__T.snap();
    Settings.set('pickupGold', true);
    Settings.set('pickupMat', true);
    Settings.set('pickupRune', true);
    window.__T.tick(90);
    const on = window.__T.snap();
    return { g0, off, on, mats: Game.state.stash ? Object.keys(Game.state.stash.mats || {}).length : -1 };
  });
  ok(s5.off.loot.length === 3, '三类开关全关时，金币 / 匠材 / 符文都留在地上', s5.off.loot.map(l => l.r));
  ok(s5.off.gold === s5.g0, '金币没进账', [s5.g0, s5.off.gold]);
  ok(s5.on.loot.length === 0, '开关打开后三类掉落都被吸走', s5.on.loot.map(l => l.r));
  ok(s5.on.gold > s5.g0, '金币到账 +' + (s5.on.gold - s5.g0), [s5.g0, s5.on.gold]);

  /* ---------------- 5.6 设置落盘 ---------------- */
  head('十一、设置落盘');
  const s6 = await page.evaluate(() => {
    Settings.set('pickupMinRarity', 'set');
    Settings.set('autoPickup', '0');            // UI 传下来的是字符串，必须被收成布尔
    const raw = JSON.parse(localStorage.getItem(Settings.KEY) || '{}');
    const d = Settings.d;
    return { raw, d: { auto: d.autoPickup, min: d.pickupMinRarity }, typeofAuto: typeof d.autoPickup };
  });
  ok(s6.raw.pickupMinRarity === 'set', 'pickupMinRarity 写进了 localStorage', s6.raw.pickupMinRarity);
  ok(s6.raw.autoPickup === false && s6.typeofAuto === 'boolean',
    'autoPickup 存的是布尔 false，不是字符串 "0"', [s6.raw.autoPickup, s6.typeofAuto]);
  ok(s6.d.min === 'set', '内存里的值与落盘一致');

  head('十二、页面错误');
  ok(errs.length === 0, '无页面报错', errs.slice(0, 3));

  await browser.close();
  finish();
})();

function finish() {
  console.log('\n' + '='.repeat(56));
  if (fail === 0) console.log('✅ 全部通过（' + pass + ' 项）');
  else console.log('失败 ' + fail + ' 项：\n  · ' + '（见上）');
  console.log('='.repeat(56));
  process.exit(fail === 0 ? 0 : 1);
}
