/* ============================================================
 * v1.1.9 套装体系验证（三系职业套装）
 *
 *   node dev/probe-set-system.js
 *
 * 不变量：
 *   1. 全库只有 3 套套装，一套一职业、6 件（5 防具 + 套装武器）
 *   2. 每套三档效果（2/4/6 件），stats / skillMods / flag / special
 *      四种载体全部有真实生效点（aggregate → computePlayerStats）
 *   3. 套装件必带至少一条本职业标志词条（SET_SIG 保底）
 *   4. 滚装备：战士只出龙骧、法师只出星阙、道士只出青符
 *   5. 打造按职业锁定：跨职业打造被拒；套装部位精确匹配
 *   6. 旧档迁移：已退出目录的 setId（青龙/九幽/天罡…）被剥离，
 *      装备本身不销毁
 *   7. 提示框渲染套装名、件数进度与三档效果（含未激活档）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Set, Map, JSON, Object };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-items.js');
load('data/data-uniques.js');
load('data/data-skills.js');   // 校验套装 skillMods 指向真实技能
load('items.js');

const pick = n => vm.runInContext(n, ctx);
const SETS = pick('SETS');
const SET_SIG = pick('SET_SIG');
const SKILLS = pick('SKILLS');
const STATS = pick('STATS');
const CLASSES = pick('CLASSES');
const rollItem = pick('rollItem');
const aggregate = pick('aggregate');
const computePlayerStats = pick('computePlayerStats');
const normalizeItem = pick('normalizeItem');
const itemTooltip = pick('itemTooltip');
const craftSetItem = pick('craftSetItem');
const setCraftTargets = pick('setCraftTargets');
const makeAffix = pick('makeAffix');

/* itemTooltip 里会读 Game.state.setCount，给个空壳即可 */
ctx.Game = { state: { setCount: {} } };

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); } };
const head = t => console.log('\n== ' + t + ' ==');

/* ---- 1. 目录结构 ---- */
head('套装目录');
{
  const ids = Object.keys(SETS);
  ok(ids.length === 3, '全库只有 3 套套装', 'got ' + ids.length);
  const clsSeen = {};
  let structBad = 0;
  for (const id of ids) {
    const s = SETS[id];
    if (s.pieces.length !== 6 || s.slots.length !== 6) structBad++;
    if (!CLASSES[s.cls]) structBad++;
    if (clsSeen[s.cls]) structBad++;          // 一职业一套
    clsSeen[s.cls] = id;
    if (s.slots[5] !== 'weapon') structBad++; // 第 6 件是套装武器
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) structBad++;
    if (s.bonuses.length !== 3) structBad++;
    for (const b of s.bonuses) {
      if ([2, 4, 6].indexOf(b.need) < 0) structBad++;
      for (const k in (b.stats || {})) if (!STATS[k]) structBad++;
      for (const sid in (b.skillMods || {})) {
        if (!SKILLS[sid]) structBad++;
        for (const k in b.skillMods[sid]) if (['dmg', 'cd', 'cost', 'radius', 'count', 'dur'].indexOf(k) < 0) structBad++;
      }
    }
  }
  ok(structBad === 0, '三套结构全部合规（6 件 / 职业唯一 / 2-4-6 档 / 载体合法）', 'count=' + structBad);
  ok(clsSeen.warrior === 'longxiang' && clsSeen.mage === 'xingque' && clsSeen.taoist === 'qingfu',
    '战士=龙骧 / 法师=星阙 / 道士=青符', JSON.stringify(clsSeen));
  /* 职业特性抽查：战士套打突进与近战，法师套打法术与范围，道士套打持续与召唤 */
  const lx = SETS.longxiang, xq = SETS.xingque, qf = SETS.qingfu;
  ok(lx.bonuses[1].skillMods.thrust && lx.bonuses[1].skillMods.thrust.dmg === 80, '龙骧 4 件强化烈焰突刺（突进技能）+80%');
  ok(lx.bonuses[0].stats.meleeDmg === 12, '龙骧 2 件带近战伤害');
  ok(lx.bonuses[1].flag === 'longDash' && lx.bonuses[2].special === 'chargeReset', '龙骧机制：突进距离 / 冲撞刷冷');
  ok(xq.bonuses[0].stats.skillDmg === 18 && xq.bonuses[0].stats.aoeDmg === 15, '星阙 2 件带技能伤害 + 范围伤害');
  ok(xq.bonuses[1].skillMods.fireball.radius === 30 && xq.bonuses[1].skillMods.frostnova.radius === 30
    && xq.bonuses[1].skillMods.meteor.radius === 30, '星阙 4 件放大三个范围技能');
  ok(xq.bonuses[2].skillMods.starfall.count === 8 && xq.bonuses[2].flag === 'novaFreeze', '星阙 6 件：陨星 +8 / 新星冻结');
  ok(qf.bonuses[0].stats.summonDmg === 35 && qf.bonuses[0].stats.dotDmg === 20, '青符 2 件带召唤物 + 持续伤害');
  ok(qf.bonuses[1].skillMods.poison.radius === 30 && qf.bonuses[1].skillMods.poison.dur === 3, '青符 4 件放大毒雾范围与持续');
  ok(qf.bonuses[2].special === 'wolfPrime' && qf.bonuses[2].skillMods.swordrain.count === 6, '青符 6 件：灵狼质变 / 符剑 +6');
}

/* ---- 2. 件数 → 加成档位 ---- */
head('加成激活');
{
  const mk = (setId, slot, idx) => normalizeItem({
    kind: slot, slot, name: SETS[setId].pieces[idx], rarity: 'set', ilvl: 30,
    setId, setName: SETS[setId].name, cls: SETS[setId].cls, sockets: 0, runes: [], affixes: []
  });
  const full = id => { const e = {}; SETS[id].slots.forEach((sl, i) => { e[sl] = mk(id, sl, i); }); return e; };

  for (const id of Object.keys(SETS)) {
    const s = SETS[id];
    for (const n of [2, 4, 6]) {
      const e = {};
      s.slots.slice(0, n).forEach((sl, i) => { e[sl] = mk(id, sl, i); });
      const agg = aggregate(e);
      const st = computePlayerStats({ cls: s.cls, level: 30, equipment: e });
      const wantBonuses = n >= 6 ? 3 : (n >= 4 ? 2 : 1);
      ok(agg.setBonuses.length === wantBonuses && agg.setCount[id] === n,
        `${s.name} ${n} 件 → ${wantBonuses} 档加成生效`, 'bonuses=' + agg.setBonuses.length);
      /* 2 件档的 stats 必须最终透传到面板 */
      const b0 = s.bonuses[0].stats || {};
      let statOk = true;
      for (const k in b0) if ((st[k] || 0) < b0[k]) statOk = false;
      ok(statOk, `${s.name} 2 件档属性进入面板`, JSON.stringify(b0));
    }
  }

  /* 龙骧 6 件：机制载体全落地 */
  const e6 = full('longxiang');
  const a6 = aggregate(e6);
  ok(a6.flags.longDash === true, '龙骧 6 件 → flags.longDash');
  ok(a6.specials.chargeReset === true, '龙骧 6 件 → specials.chargeReset');
  ok(a6.skillMods.thrust.dmg === 80 && a6.skillMods.whirl.dmg === 40 && a6.skillMods.avatar.dmg === 50,
    '龙骧 6 件 → skillMods（突刺 80 / 旋风 40 / 剑神 50）', JSON.stringify(a6.skillMods.thrust));
  const st6 = computePlayerStats({ cls: 'warrior', level: 40, equipment: e6 });
  ok(st6.meleeDmg >= 12, '龙骧 2 件档近战伤害 +12% 进入面板', 'meleeDmg=' + st6.meleeDmg);

  /* 星阙 6 件 */
  const aX = aggregate(full('xingque'));
  ok(aX.flags.novaFreeze === true, '星阙 6 件 → flags.novaFreeze');
  ok(aX.skillMods.starfall.count === 8, '星阙 6 件 → 陨星 count +8');
  ok(aX.skillMods.fireball.radius === 30 && aX.skillMods.meteor.radius === 30, '星阙 4 件 → 火球/炎爆范围 +30%');
  const stX = computePlayerStats({ cls: 'mage', level: 40, equipment: full('xingque') });
  ok(stX.costReduce >= 12, '星阙 4 件 → 技能消耗 -12% 进入面板', 'costReduce=' + stX.costReduce);

  /* 青符 6 件 */
  const aQ = aggregate(full('qingfu'));
  ok(aQ.specials.wolfPrime === true, '青符 6 件 → specials.wolfPrime');
  ok(aQ.skillMods.poison.dur === 3 && aQ.skillMods.swordrain.count === 6 && aQ.skillMods.heal.dmg === 30,
    '青符 4/6 件 → 毒雾持续 / 符剑数量 / 回春治疗');
  const stQ = computePlayerStats({ cls: 'taoist', level: 40, equipment: full('qingfu') });
  ok(stQ.summonDmg >= 35 && stQ.dotDmg >= 20, '青符 2 件档召唤/持续伤害进入面板', 'summon=' + stQ.summonDmg + ' dot=' + stQ.dotDmg);

  /* 混搭不激活：1 件无加成，跨套不叠加 */
  const e1 = { helm: mk('longxiang', 'helm', 0) };
  ok(aggregate(e1).setBonuses.length === 0, '单件无加成');
  const eMix = { helm: mk('longxiang', 'helm', 0), chest: mk('xingque', 'chest', 1) };
  ok(aggregate(eMix).setBonuses.length === 0, '跨套混搭不激活任何一档');
}

/* ---- 3. 标志词条保底 ---- */
head('套装标志词条');
{
  let noSig = 0, total = 0;
  for (const id of Object.keys(SETS)) {
    const s = SETS[id];
    for (let i = 0; i < 60; i++) {
      const it = rollItem(30, { rarity: 'set', slot: s.slots[i % 6], cls: s.cls });
      total++;
      if (it.setId !== id) { noSig++; continue; }
      const sig = SET_SIG[s.cls];
      const has = it.affixes.some(a => sig.indexOf(a.key) >= 0) || (it.fixed || []).some(a => sig.indexOf(a.key) >= 0);
      if (!has) noSig++;
    }
  }
  ok(noSig === 0, '每件套装至少带一条本职业标志词条', 'bad=' + noSig + '/' + total);
}

/* ---- 4. 掉落按职业分流 ---- */
head('掉落分流');
{
  let wrong = 0;
  for (let i = 0; i < 400; i++) {
    const cls = ['warrior', 'mage', 'taoist'][i % 3];
    const it = rollItem(35, { rarity: 'set', cls, slot: ['helm', 'chest', 'gloves', 'boots', 'weapon'][i % 5] });
    if (it.setId && SETS[it.setId].cls !== cls) wrong++;
    if (it.rarity === 'set' && !it.setId) wrong++;
  }
  ok(wrong === 0, '套装只掉本职业的（战士龙骧 / 法师星阙 / 道士青符）', 'wrong=' + wrong);
  /* 套装不出首饰 / 副手 / 腰带 */
  let odd = 0;
  for (let i = 0; i < 400; i++) {
    const slot = ['amulet', 'ring', 'belt', 'offhand'][i % 4];
    const it = rollItem(35, { rarity: 'set', slot });
    if (it.rarity === 'set') odd++;
  }
  ok(odd === 0, '套装不出项链/戒指/腰带/副手（降级为玄品）', 'setOnOdd=' + odd);
}

/* ---- 5. 打造按职业锁定 ---- */
head('打造锁定');
{
  const chest = normalizeItem({ kind: 'chest', slot: 'chest', name: '玄铁胸甲', rarity: 'rare', ilvl: 20, cls: 'warrior', baseArmor: 50, sockets: 0, runes: [], affixes: [] });
  ok(setCraftTargets(chest).length === 1 && setCraftTargets(chest)[0].id === 'longxiang', '战士胸甲只能打造成龙骧');
  const mChest = normalizeItem({ kind: 'chest', slot: 'chest', name: '法袍', rarity: 'rare', ilvl: 20, cls: 'mage', baseArmor: 30, sockets: 0, runes: [], affixes: [] });
  ok(setCraftTargets(mChest).length === 1 && setCraftTargets(mChest)[0].id === 'xingque', '法师胸甲只能打造成星阙');
  ok(craftSetItem(chest, 'xingque') === null, '跨职业打造被 items 层拒绝');
  const r = craftSetItem(chest, 'longxiang');
  ok(r && chest.setId === 'longxiang' && chest.name === '龙骧战铠', '本职业打造成功 → 龙骧战铠', chest.name);
  ok(craftSetItem(chest, 'longxiang') === null, '已是套装不可重复打造');
}

/* ---- 6. 旧档迁移 ---- */
head('旧档迁移');
{
  const old = normalizeItem({ kind: 'helm', slot: 'helm', name: '青龙盔', rarity: 'set', ilvl: 20, setId: 'qinglong', setName: '青龙偃月', cls: 'warrior', sockets: 1, runes: [], affixes: [{ key: 'str', val: 5, pre: '', suf: '', tier: 1, q: 1 }] });
  ok(old.setId === null && old.setName === null && old.rarity === 'rare', '已退出目录的套装件被剥离并降为玄品', old.setId + '/' + old.rarity);
  ok(old.affixes.length === 1 && old.sockets === 1, '词条与孔位保留，不销毁玩家资产');
  const keep = normalizeItem({ kind: 'helm', slot: 'helm', name: '龙骧战盔', rarity: 'set', ilvl: 20, setId: 'longxiang', setName: '龙骧', cls: 'warrior', sockets: 0, runes: [], affixes: [] });
  ok(keep.setId === 'longxiang' && keep.rarity === 'set', '目录内的套装件不受迁移影响');
  /* 带着旧套装件的 aggregate 不炸 */
  const agg = aggregate({ helm: old });
  ok(agg.setBonuses.length === 0, '含已剥离套装件的汇总不报错');
}

/* ---- 7. 提示框 ---- */
head('提示框');
{
  const it = rollItem(30, { rarity: 'set', slot: 'chest', cls: 'warrior' });
  const h = itemTooltip(it);
  ok(h.indexOf('龙骧') >= 0, '提示框显示套装名');
  ok(/\(2\)/.test(h) && /\(4\)/.test(h) && /\(6\)/.test(h), '提示框显示 2/4/6 三档效果');
  ok(h.indexOf('tt-set-b off') >= 0, '未激活档位标灰（背包里看的是未穿状态）');
  ctx.Game.state.setCount = { longxiang: 6 };
  const h2 = itemTooltip(it);
  ok(h2.indexOf('龙骧（6/6）') >= 0, '提示框显示已穿件数进度 6/6');
  ok((h2.match(/tt-set-b on/g) || []).length === 3, '6 件时三档全部点亮');
  ctx.Game.state.setCount = {};
}

console.log('\n====================================================');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('====================================================');
process.exit(fail ? 1 : 0);
