/* ============================================================
 * 装备体系核对：8 阶基底扩展后，套装 / 传世是否还在、是否正常掉落
 *
 *   node dev/probe-gear.js
 *
 * 注意 itemTierName / itemBaseList / itemBaseTier 接收的是 **item 对象**，
 * 不是 tier 数字 —— 传数字会一律返回第一阶（凡兵），别被这个骗了。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);
  const r = await p.evaluate(() => {
    const out = {};
    /* ---- 套装 / 传世 是否还在 ---- */
    out.sets = Object.keys(SETS).length;
    out.setPieces = Object.keys(SETS).reduce((n, k) => n + SETS[k].slots.length, 0);
    out.setNames = Object.keys(SETS).map(k => SETS[k].name + '(' + SETS[k].slots.length + ')');
    out.uniqueCount = (typeof UNIQUE_ITEMS !== 'undefined') ? UNIQUE_ITEMS.length : 0;
    out.uniqueNames = (typeof UNIQUE_ITEMS !== 'undefined') ? UNIQUE_ITEMS.map(u => u.name) : [];

    /* ---- 基底 8 阶覆盖情况 ---- */
    out.tierNames = BASE_TIER_NAME.slice();
    const dummy = { slot: 'chest', ilvl: 60, baseTier: 7, baseVar: 0 };
    out.tier7Name = itemTierName(dummy);

    /* ---- 不同 ilvl 掉落的套装 / 传世，基底阶分别是多少 ---- */
    const probe = ilvl => {
      const got = { set: null, unique: null };
      for (let i = 0; i < 900 && (!got.set || !got.unique); i++) {
        const it = rollItem(ilvl, 'warrior');
        if (!it) continue;
        if (it.rarity === 'set' && !got.set) got.set = { name: it.name, tier: it.baseTier, tn: itemTierName(it), ilvl: it.ilvl };
        if (it.rarity === 'unique' && !got.unique) got.unique = { name: it.name, tier: it.baseTier, tn: itemTierName(it), ilvl: it.ilvl };
      }
      return got;
    };
    out.at20 = probe(20);
    out.at60 = probe(60);

    /* ---- 升阶对套装是否生效（只看 API 与提示文案，不真扣钱） ---- */
    let setItem = null;
    for (let i = 0; i < 900 && !setItem; i++) {
      const it = rollItem(30, 'warrior');
      if (it && it.rarity === 'set') setItem = it;
    }
    out.setUpgrade = setItem ? {
      name: setItem.name, setId: setItem.setId,
      info: (() => { try { return upgradeTierInfo(setItem); } catch (e) { return 'ERR ' + e.message; } })()
    } : null;

    /* ---- 400 次掉落的品质分布（确认两族都在池子里） ---- */
    const cnt = {};
    for (let i = 0; i < 400; i++) {
      const it = rollItem(60, 'warrior');
      if (it) cnt[it.rarity] = (cnt[it.rarity] || 0) + 1;
    }
    out.roll400 = cnt;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
