/* ============================================================
 * P3c 真机探针：元素词缀统一口径（装备 / 面板 / 结算）
 *
 *   node dev/probe-elem-affix.js
 *
 * 契约测试（dev/test-elem-affix.js）验的是「表与函数」；这里验的是**接进游戏之后
 * 玩家真的能看到什么**：
 *   1. 老装备身上的「火焰伤害」读档后变成「元素伤害」，tooltip 也这么写；
 *   2. 装备后 state.stats.elemDmg 真的涨，火 / 冰 / 雷 / 毒 四种伤害一起受益；
 *   3. 道途面板出现「元素伤害」一行（以前这一族词条面板上一行都没有）；
 *   4. 命格固有「流火格」仍是火伤专属 —— 面板显示「火焰伤害」，只加火；
 *   5. 洗练池里只剩「元素伤害」，没有四族旧词条可选。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m, d === undefined ? '' : JSON.stringify(d)); }
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.setViewport({ width: 1440, height: 900 });

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await p.goto(url, { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);

  /* ---------------- 一、老装备折算 ---------------- */
  console.log('一、老装备折算');
  const fold = await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.cls = 'warrior';
    Game.recalc();
    /* 造一件「旧版」装备：词缀直接写成四族旧键 */
    const it = normalizeItem({
      slot: 'chest', rarity: 'rare', ilvl: 40, affixCls: 'warrior',
      name: '旧·玄铁甲', baseArmor: 40,
      affixes: [{ key: 'fireDmg', val: 20, q: 1 }, { key: 'iceDmg', val: 10, q: 1 }, { key: 'crit', val: 4, q: 1 }],
      fixed: [], sockets: 0, runes: []
    });
    const keys = it.affixes.map(a => a.key);
    const elemAff = it.affixes.find(a => a.key === 'elemDmg');
    const tip = itemTooltip(it);
    Game.state.equipment.chest = it;
    Game.recalc();
    const st = Game.state.stats;
    return {
      keys, elemVal: elemAff ? elemAff.val : null,
      tipHasElem: /元素伤害/.test(tip),
      tipHasFire: /火焰伤害/.test(tip),
      stElem: st.elemDmg || 0,
      stFire: st.fireDmg || 0
    };
  });
  ok(fold.keys.indexOf('elemDmg') >= 0, '读档后词缀变成 elemDmg', fold.keys);
  ok(fold.elemVal === 30, '火 20 + 冰 10 折成一条 元素伤害 30', fold.elemVal);
  ok(fold.tipHasElem, 'tooltip 写「元素伤害」');
  ok(!fold.tipHasFire, 'tooltip 不再写「火焰伤害」');
  ok(fold.stElem === 30, '装备后 stats.elemDmg = 30', fold.stElem);
  ok(fold.stFire === 0, '旧键在 stats 里是 0（没有双算）', fold.stFire);

  /* ---------------- 二、四种元素一起受益 ---------------- */
  console.log('二、四种元素一起受益');
  const muls = await p.evaluate(() => {
    const st = Game.state.stats;
    return ['fire', 'ice', 'lightning', 'poison', 'sigil', 'phys']
      .map(k => [k, +elemAffixMul(st, k).toFixed(4)]);
  });
  const map = Object.fromEntries(muls);
  ok(Math.abs(map.fire - 1.3) < 1e-6, '火 ×1.30', map.fire);
  ok(Math.abs(map.ice - 1.3) < 1e-6, '冰 ×1.30（同一个词缀）', map.ice);
  ok(Math.abs(map.lightning - 1.3) < 1e-6, '雷 ×1.30', map.lightning);
  ok(Math.abs(map.poison - 1.3) < 1e-6, '毒 ×1.30', map.poison);
  ok(map.phys === 1, '物理不吃（没有元素语义）', map.phys);

  /* ---------------- 三、道途面板 ---------------- */
  console.log('三、道途面板');
  const panel = await p.evaluate(() => {
    document.getElementById('statPanel').classList.add('open');
    UI.renderStats();
    const txt = document.getElementById('statList').textContent.replace(/\s+/g, '');
    return { hasElem: /元素伤害30%/.test(txt), hasFire: /火焰伤害/.test(txt), sample: txt.slice(0, 60) };
  });
  ok(panel.hasElem, '面板上有「元素伤害 30%」', panel.sample);
  ok(!panel.hasFire, '没有专属火伤时不显示「火焰伤害」行（面板不摆 0 值行）');

  /* ---------------- 四、命格固有仍是元素专属 ---------------- */
  console.log('四、命格固有（专属通道）');
  const fate = await p.evaluate(() => {
    /* 命格固有属性：流火格 = fireDmg 5，**不该**被折算 */
    const it = normalizeItem({
      slot: 'fate', rarity: 'rare', ilvl: 40, affixCls: 'warrior',
      name: '流火格', baseArmor: 0,
      implicit: { key: 'fireDmg', val: 5 },
      affixes: [{ key: 'crit', val: 3, q: 1 }], fixed: [], sockets: 0, runes: []
    });
    const keep = it.implicit && it.implicit.key;
    /* normalizeItem 会按品质补固定词条，其中可能正好有一条 elemDmg ——
     * 把它扣掉再比，否则「elemDmg 还是 30」会读到 41（假红）。 */
    const fixedElem = (it.fixed || []).filter(a => a.key === 'elemDmg').reduce((n, a) => n + a.val, 0);
    Game.state.equipment.fate = it;
    Game.recalc();
    const st = Game.state.stats;
    UI.renderStats();
    const txt = document.getElementById('statList').textContent.replace(/\s+/g, '');
    return {
      keep, fixedElem, stFire: st.fireDmg || 0, stElem: st.elemDmg || 0,
      mulFire: +elemAffixMul(st, 'fire').toFixed(4),
      mulIce: +elemAffixMul(st, 'ice').toFixed(4),
      panelFire: /火焰伤害5%/.test(txt)
    };
  });
  ok(fate.keep === 'fireDmg', '命格固有属性**不折算**（还是 fireDmg）', fate.keep);
  ok(fate.stFire === 5, 'stats.fireDmg = 5', fate.stFire);
  ok(fate.stElem - fate.fixedElem === 30, 'elemDmg 里没有混进命格的火伤（扣掉补的固定词条后仍是 30）',
    { 面板: fate.stElem, 补的固定词条: fate.fixedElem });
  ok(fate.mulFire > fate.mulIce, '火拿到 30% × 5%，冰只拿 30%（专属那条只加火）',
    { 火: fate.mulFire, 冰: fate.mulIce });
  ok(fate.panelFire, '面板上出现「火焰伤害 5%」一行（专属通道也要可见）');

  /* ---------------- 五、洗练池 ---------------- */
  console.log('五、洗练池');
  const pool = await p.evaluate(() => {
    const list = affixPool('warrior', 'chest');
    const keys = list.map(a => a.key);
    return {
      old: keys.filter(k => ['fireDmg', 'iceDmg', 'lightningDmg', 'poisonDmg'].indexOf(k) >= 0),
      elem: keys.filter(k => k === 'elemDmg').length,
      n: keys.length
    };
  });
  ok(pool.old.length === 0, '胸甲洗练池里没有四族旧词条', pool.old);
  ok(pool.elem === 3, 'elemDmg 在池子里占 3 条（三阶各一条）', pool.elem);
  ok(pool.n >= 10, '池子没被削到枯竭线以下', pool.n);

  /* ---------------- 六、收尾 ---------------- */
  await p.evaluate(() => {
    Game.state.equipment.chest = null;
    Game.state.equipment.fate = null;
    Game.recalc();
  });
  console.log('六、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3c 元素词缀探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
