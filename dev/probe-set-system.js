/* ============================================================
 * v1.2.2 套装体系验证（3 类型 × 3 职业 = 9 套）
 *
 *   node dev/probe-set-system.js
 *
 * 不变量：
 *   1. 9 套，每职业 3 套，件数 5 / 4 / 3，一件一部位、部位不重复
 *   2. 档位严格递增、末档 = 总件数；每档 stats / skillMods / flag /
 *      special / specials 五种载体全部有真实生效点（aggregate →
 *      computePlayerStats，且 game.js 里能搜到消费点）
 *   3. 套装件必带至少一条本套 sig 标志词条（龙骧偏攻击、磐石偏防御）
 *   4. 滚装备：只出本职业的套装；没有套装覆盖的部位（戒指）降级
 *   5. 打造：职业锁定 + 部位精确匹配；腰带/项链可打到 2 套之间选
 *   6. 旧档迁移：6 件套时代留下的「套装武器」被剥离套装标识但保留词条
 *   7. 提示框：显示套装名 · 类型 · 件数进度 · 全部档位，件数会截断显示
 *   8. 混搭：主套 5 + 兵装套 4 = 9 格全满；随身套 3 + 主套 4 + 兵装 2 = 9 格
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
const SET_TYPES = pick('SET_TYPES');
const SET_SIG = pick('SET_SIG');
const AFFIXES = pick('AFFIXES');
const SKILLS = pick('SKILLS');
const STATS = pick('STATS');
const SLOTS = pick('SLOTS');
const CLASSES = pick('CLASSES');
const rollItem = pick('rollItem');
const aggregate = pick('aggregate');
const computePlayerStats = pick('computePlayerStats');
const normalizeItem = pick('normalizeItem');
const itemTooltip = pick('itemTooltip');
const craftSetItem = pick('craftSetItem');
const setCraftTargets = pick('setCraftTargets');

/* itemTooltip 里会读 Game.state.setCount，给个空壳即可 */
ctx.Game = { state: { setCount: {} } };

const GAME_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); } };
const head = t => console.log('\n== ' + t + ' ==');

const MOD_KEYS = ['dmg', 'cd', 'cost', 'radius', 'count', 'dur'];
const sigOf = set => set.sig || SET_SIG[set.cls] || [];

/* ---- 1. 目录结构 ---- */
head('套装目录');
{
  const ids = Object.keys(SETS);
  ok(ids.length === 9, '全库 9 套套装', 'got ' + ids.length);

  const byCls = { warrior: [], mage: [], taoist: [] };
  let structBad = [];
  for (const id of ids) {
    const s = SETS[id];
    const bad = m => structBad.push(id + ':' + m);
    if (!CLASSES[s.cls]) bad('职业非法');
    if (!s.tag) bad('缺类型标签');
    if (!Array.isArray(s.pieces) || !Array.isArray(s.slots)) { bad('缺 pieces/slots'); continue; }
    if (s.pieces.length !== s.slots.length) bad('件名与部位数不等');
    if (s.pieces.length < 2 || s.pieces.length > 5) bad('件数越界 ' + s.pieces.length);
    if (new Set(s.slots).size !== s.slots.length) bad('部位重复');
    for (const sl of s.slots) if (!SLOTS[sl]) bad('未知部位 ' + sl);
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) bad('颜色非法');
    /* 档位：从 2 起、严格递增、末档 = 总件数 */
    const needs = s.bonuses.map(b => b.need);
    if (needs[0] !== 2) bad('首档不是 2 件');
    for (let i = 1; i < needs.length; i++) if (needs[i] <= needs[i - 1]) bad('档位未递增');
    if (needs[needs.length - 1] !== s.pieces.length) bad('末档 ≠ 件数');
    if (s.bonuses.length < 2 || s.bonuses.length > 3) bad('档位数异常');
    for (const b of s.bonuses) {
      if (typeof b.text !== 'string' || b.text.length < 6) bad('档位描述缺失');
      for (const k in (b.stats || {})) {
        if (!STATS[k]) bad('未知属性 ' + k);
      }
      for (const sid in (b.skillMods || {})) {
        if (!SKILLS[sid]) bad('未知技能 ' + sid);
        for (const k in b.skillMods[sid]) if (MOD_KEYS.indexOf(k) < 0) bad('未知修正 ' + k);
      }
      if (b.flag && typeof b.flag !== 'string') bad('flag 非法');
      if (b.special && typeof b.special !== 'string') bad('special 非法');
      if (b.specials && !Array.isArray(b.specials)) bad('specials 应为数组');
      if (b.flags && !Array.isArray(b.flags)) bad('flags 应为数组');
      const carrier = b.stats || b.skillMods || b.flag || b.special || b.specials || b.flags;
      if (!carrier) bad('档位没有任何载体（空话）');
    }
    /* 词条取向必须能在词缀池里找到，否则保底永远落空 */
    const sig = sigOf(s);
    if (!sig.length) bad('缺标志词条取向');
    for (const k of sig) if (!AFFIXES.some(a => a.key === k)) bad('标志词条不在池内 ' + k);    byCls[s.cls].push(s);
  }
  ok(structBad.length === 0, '9 套结构全部合规（件数/部位/档位/载体/词条）', structBad.slice(0, 6).join(' | '));

  ok(byCls.warrior.length === 3 && byCls.mage.length === 3 && byCls.taoist.length === 3,
    '每职业正好 3 套', JSON.stringify(Object.keys(byCls).map(k => byCls[k].length)));
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const sizes = byCls[cls].map(s => s.pieces.length).sort((a, b) => b - a);
    ok(sizes.join('/') === '5/4/3', `${CLASSES[cls].name} 三套件数为 5 / 4 / 3`, sizes.join('/'));
  }
  /* 类型说明表要和目录对得上 */
  let typeBad = 0;
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const listed = [];
    for (const t of (SET_TYPES[cls] || [])) for (const id of t.ids) listed.push(id);
    if (listed.length !== 3) typeBad++;
    for (const id of listed) if (!SETS[id] || SETS[id].cls !== cls) typeBad++;
    const tags = new Set((SET_TYPES[cls] || []).map(t => t.tag));
    for (const s of byCls[cls]) if (!tags.has(s.tag)) typeBad++;
  }
  ok(typeBad === 0, 'SET_TYPES 与 9 套一一对应（3 职业 × 3 类型）', 'bad=' + typeBad);
}

/* ---- 2. 载体落地（不允许「写着有空」） ---- */
head('载体落地');
{
  const dead = [];
  const seen = new Set();
  for (const id in SETS) {
    for (const b of SETS[id].bonuses) {
      const flags = []
        .concat(b.flag ? [b.flag] : [])
        .concat(Array.isArray(b.flags) ? b.flags : []);
      const specials = []
        .concat(b.special ? [b.special] : [])
        .concat(Array.isArray(b.specials) ? b.specials : []);
      for (const f of flags) {
        if (seen.has('f:' + f)) continue;
        seen.add('f:' + f);
        if (GAME_SRC.indexOf(f) < 0) dead.push('flag ' + f);
      }
      for (const sp of specials) {
        if (seen.has('s:' + sp)) continue;
        seen.add('s:' + sp);
        if (GAME_SRC.indexOf(sp) < 0) dead.push('special ' + sp);
      }
    }
  }
  ok(dead.length === 0, '每个 flag / special 在 game.js 里都有消费点', dead.join(', '));
  ok(seen.size >= 8, '套装机制数量足够（≥8 个不同机制）', 'n=' + seen.size);

  /* 关键机制点名：本次新增的 6 个 */
  for (const sp of ['riposteGuard', 'frenzyStack', 'overcharge', 'plagueburst']) {
    ok(GAME_SRC.indexOf(sp) >= 0, '新机制已实现：' + sp);
  }
  for (const f of ['deepfreeze', 'runeburn']) {
    ok(GAME_SRC.indexOf(f) >= 0, '新机制已实现：' + f);
  }
  ok(GAME_SRC.indexOf('venomT') >= 0, '蚀骨印记（天师套判定用）已落地');
  ok(GAME_SRC.indexOf('this.frenzy') >= 0, '狂怒层数已落地');
  ok(GAME_SRC.indexOf('this.riposteCd') >= 0 && GAME_SRC.indexOf('this.overchargeCd') >= 0,
    '格挡反击 / 过载天雷都有内置冷却');
}

/* ---- 3. 件数 → 加成档位 ---- */
head('加成激活');
{
  const mk = (setId, idx) => {
    const s = SETS[setId];
    return normalizeItem({
      kind: s.slots[idx], slot: s.slots[idx], name: s.pieces[idx], rarity: 'set', ilvl: 30,
      setId, setName: s.name, cls: s.cls, sockets: 0, runes: [], affixes: []
    });
  };
  for (const id of Object.keys(SETS)) {
    const s = SETS[id];
    for (const need of [1].concat(s.bonuses.map(b => b.need))) {
      const e = {};
      s.slots.slice(0, need).forEach((sl, i) => { e[sl] = mk(id, i); });
      const agg = aggregate(e);
      const want = s.bonuses.filter(b => need >= b.need).length;
      ok(agg.setBonuses.length === want && agg.setCount[id] === need,
        `${s.name} ${need} 件 → ${want} 档生效`, 'bonuses=' + agg.setBonuses.length);
    }
    /* 2 件档属性必须最终透传到面板 */
    const b0 = s.bonuses[0].stats || {};
    if (Object.keys(b0).length) {
      const e = {}; s.slots.slice(0, 2).forEach((sl, i) => { e[sl] = mk(id, i); });
      const st = computePlayerStats({ cls: s.cls, level: 40, equipment: e });
      let statOk = true, detail = '';
      for (const k in b0) if ((st[k] || 0) + 1e-6 < b0[k]) { statOk = false; detail += k + ':' + st[k] + '<' + b0[k] + ' '; }
      ok(statOk, `${s.name} 2 件档属性进入面板`, detail || JSON.stringify(b0));
    }
  }

  /* 多 special 组合：青符 5 件应同时点亮灵狼质变与双狼 */
  const qf = SETS.qingfu;
  const e5 = {}; qf.slots.forEach((sl, i) => { e5[sl] = mk('qingfu', i); });
  const a5 = aggregate(e5);
  ok(a5.specials.wolfPrime === true && a5.specials.wolfPack === true,
    '青符 5 件 → specials 数组同时登记 wolfPrime + wolfPack', JSON.stringify(a5.specials));
  ok(a5.skillMods.swordrain.count === 6 && a5.skillMods.poison.radius === 30,
    '青符 5 件 → 符剑 +6 / 毒雾 +30% 仍生效');

  /* 玄冰 3 件 flag */
  const xb = SETS.xuanbing;
  const e3 = {}; xb.slots.forEach((sl, i) => { e3[sl] = mk('xuanbing', i); });
  const a3 = aggregate(e3);
  ok(a3.flags.deepfreeze === true && a3.skillMods.blizzard.dur === 2 && a3.skillMods.frostnova.radius === 25,
    '玄冰 3 件 → deepfreeze + 暴雪/新星修正');
  const axq = aggregate((() => {
    const e = {}; SETS.xingque.slots.forEach((sl, i) => { e[sl] = mk('xingque', i); }); return e;
  })());
  ok(axq.flags.firetrail === true && axq.skillMods.starfall.count === 8,
    '星阙 5 件 → firetrail + 陨星 +8');
  const alp = aggregate((() => {
    const e = {}; SETS.leiji.slots.forEach((sl, i) => { e[sl] = mk('leiji', i); }); return e;
  })());
  ok(alp.specials.overcharge === true && alp.skillMods.chain.count === 2 && alp.skillMods.judgement.dmg === 40,
    '雷殛 4 件 → 过载 + 雷弧链 +2 / 雷罚 +40%');
  const adp = aggregate((() => {
    const e = {}; SETS.danding.slots.forEach((sl, i) => { e[sl] = mk('danding', i); }); return e;
  })());
  ok(adp.specials.plagueburst === true && adp.skillMods.poison.dur === 2,
    '丹鼎 4 件 → 毒爆 + 毒雾持续');
  const ats = aggregate((() => {
    const e = {}; SETS.tianshi.slots.forEach((sl, i) => { e[sl] = mk('tianshi', i); }); return e;
  })());
  ok(ats.flags.runeburn === true && ats.specials.talismanPierce === true && ats.skillMods.talismanarrow.count === 2,
    '天师 3 件 → 符火 + 穿透 + 符箭 +2');
  const aps = aggregate((() => {
    const e = {}; SETS.panshi.slots.forEach((sl, i) => { e[sl] = mk('panshi', i); }); return e;
  })());
  ok(aps.specials.riposteGuard === true && aps.stats.thorns >= 80, '磐石 4 件 → 格挡反击 + 荆棘');
  const axn = aggregate((() => {
    const e = {}; SETS.xuenu.slots.forEach((sl, i) => { e[sl] = mk('xuenu', i); }); return e;
  })());
  ok(axn.specials.frenzyStack === true && axn.stats.crit >= 8 && axn.stats.executeDmg >= 40,
    '血怒 3 件 → 狂怒叠层 + 暴击 / 斩杀');

  /* 1 件无加成；跨套各计各的 */
  const one = aggregate({ helm: mk('longxiang', 0) });
  ok(one.setBonuses.length === 0, '单件无加成');
  const mix = aggregate({ helm: mk('longxiang', 0), belt: mk('xuenu', 1) });
  ok(mix.setBonuses.length === 0, '跨套各 1 件都不激活');
}

/* ---- 4. 标志词条保底 ---- */
head('套装标志词条');
{
  let bad = 0, total = 0;
  for (const id in SETS) {
    const s = SETS[id];
    /* 部位词条池会禁掉一部分取向（武器不出防御、首饰不出近战），
     * 所以判定用「本套 sig ∪ 职业 sig」的并集 */
    const sig = sigOf(s).concat(SET_SIG[s.cls] || []);
    for (let i = 0; i < s.slots.length; i++) {
      const it = normalizeItem({
        kind: s.slots[i], slot: s.slots[i], name: '底子', rarity: 'rare', ilvl: 25,
        cls: s.cls, affixCls: s.cls, sockets: 0, runes: [], affixes: []
      });
      const r = craftSetItem(it, id);
      if (!r) { bad++; continue; }
      total++;
      const has = it.affixes.some(a => sig.indexOf(a.key) >= 0) || (it.fixed || []).some(a => sig.indexOf(a.key) >= 0);
      if (!has) bad++;
    }
  }
  ok(bad === 0 && total === 36, '36 件套装部件都由打造补上标志词条', 'bad=' + bad + '/' + total);

  /* 滚装备路径也要保底（随机部位多抽几次） */
  let noSig = 0, rolled = 0;
  for (const id in SETS) {
    const s = SETS[id];
    const sig = sigOf(s).concat(SET_SIG[s.cls] || []);
    for (let i = 0; i < 40; i++) {
      const it = rollItem(30, { rarity: 'set', slot: s.slots[i % s.slots.length], cls: s.cls });
      if (it.setId !== id) continue;
      rolled++;
      const has = it.affixes.some(a => sig.indexOf(a.key) >= 0) || (it.fixed || []).some(a => sig.indexOf(a.key) >= 0);
      if (!has) noSig++;
    }
  }
  ok(noSig === 0 && rolled > 100, '滚出来的套装件同样带标志词条', 'bad=' + noSig + '/' + rolled);
}

/* ---- 5. 掉落按职业分流 ---- */
head('掉落分流');
{
  const seen = {};
  let wrong = 0;
  const slotsByCls = {};
  for (const id in SETS) (slotsByCls[SETS[id].cls] = slotsByCls[SETS[id].cls] || new Set()).add(SETS[id].slots.join(','));
  for (let i = 0; i < 900; i++) {
    const cls = ['warrior', 'mage', 'taoist'][i % 3];
    const allSlots = [];
    for (const id in SETS) if (SETS[id].cls === cls) allSlots.push(...SETS[id].slots);
    const it = rollItem(35, { rarity: 'set', cls, slot: allSlots[i % allSlots.length] });
    if (!it.setId) { wrong++; continue; }
    if (SETS[it.setId].cls !== cls) wrong++;
    seen[it.setId] = (seen[it.setId] || 0) + 1;
  }
  ok(wrong === 0, '套装只掉本职业的', 'wrong=' + wrong);
  ok(Object.keys(seen).length === 9, '9 套都能通过掉落获得', Object.keys(seen).join(','));

  let odd = 0;
  for (let i = 0; i < 300; i++) {
    const slot = ['ring', 'ring'][i % 2];
    const it = rollItem(35, { rarity: 'set', slot });
    if (it.rarity === 'set') odd++;
  }
  ok(odd === 0, '戒指没有套装覆盖，掉落降级（不会出空套装件）', 'setOnRing=' + odd);
}

/* ---- 6. 打造规则 ---- */
head('打造规则');
{
  const mkRare = (slot, cls) => normalizeItem({
    kind: slot, slot, name: '玄铁底', rarity: 'rare', ilvl: 20, cls, affixCls: cls,
    baseArmor: slot === 'weapon' ? 0 : 40, baseDmg: slot === 'weapon' ? [10, 14] : null,
    sockets: 0, runes: [], affixes: []
  });

  const chest = mkRare('chest', 'warrior');
  const t1 = setCraftTargets(chest).map(s => s.id);
  ok(t1.length === 1 && t1[0] === 'longxiang', '战士胸甲只能打造成龙骧', t1.join(','));

  const belt = mkRare('belt', 'warrior');
  const t2 = setCraftTargets(belt).map(s => s.id).sort();
  ok(t2.join(',') === 'panshi,xuenu', '战士腰带可在磐石 / 血怒之间选', t2.join(','));

  const mWeapon = mkRare('weapon', 'mage');
  ok(craftSetItem(mWeapon, 'panshi') === null, '跨职业打造被拒');
  const r = craftSetItem(mWeapon, 'leiji');
  ok(r && mWeapon.setId === 'leiji' && mWeapon.name === '雷殛法杖', '法师法杖打造成雷殛法杖', mWeapon.name);
  ok(craftSetItem(mWeapon, 'leiji') === null, '已是套装不可重复打造');

  const tWeapon = mkRare('weapon', 'taoist');
  ok(setCraftTargets(tWeapon).map(s => s.id).join(',') === 'danding', '道士武器只能打造丹鼎');
  const slotMiss = craftSetItem(mkRare('helm', 'taoist'), 'danding');
  ok(slotMiss === null, '部位不在套装目录内时拒绝（头盔 ↛ 丹鼎）');
}

/* ---- 7. 旧档迁移 ---- */
head('旧档迁移');
{
  const oldWeapon = normalizeItem({
    kind: '武器', slot: 'weapon', name: '龙骧战刃', rarity: 'set', ilvl: 20,
    setId: 'longxiang', setName: '龙骧', cls: 'warrior', sockets: 2, runes: [null, null],
    affixes: [{ key: 'atk', val: 20, pre: '', suf: '', tier: 1, q: 1 }]
  });
  ok(oldWeapon.setId === null && oldWeapon.rarity === 'rare', '6 件套时代的套装武器被剥离标识', oldWeapon.setId + '/' + oldWeapon.rarity);
  ok(oldWeapon.affixes.length === 1 && oldWeapon.sockets === 2, '词条与孔位保留，不销毁玩家资产');

  const oldArmor = normalizeItem({
    kind: '头盔', slot: 'helm', name: '龙骧战盔', rarity: 'set', ilvl: 20,
    setId: 'longxiang', setName: '龙骧', cls: 'warrior', sockets: 0, runes: [], affixes: []
  });
  ok(oldArmor.setId === 'longxiang' && oldArmor.rarity === 'set', '仍在目录内的部位不受影响');

  const gone = normalizeItem({
    kind: '头盔', slot: 'helm', name: '青龙盔', rarity: 'set', ilvl: 20,
    setId: 'qinglong', setName: '青龙偃月', cls: 'warrior', sockets: 1, runes: [null],
    affixes: [{ key: 'str', val: 5, pre: '', suf: '', tier: 1, q: 1 }]
  });
  ok(gone.setId === null && gone.rarity === 'rare', '已退出目录的套装件仍按老规则剥离');
  ok(aggregate({ helm: gone }).setBonuses.length === 0, '含已剥离件的汇总不报错');
}

/* ---- 8. 提示框 ---- */
head('提示框');
{
  const it = rollItem(30, { rarity: 'set', slot: 'chest', cls: 'warrior' });
  const h = itemTooltip(it);
  ok(h.indexOf('龙骧') >= 0 && h.indexOf('突进') >= 0, '提示框显示套装名与类型');
  ok(/\(2\)/.test(h) && /\(3\)/.test(h) && /\(5\)/.test(h), '提示框显示 2/3/5 三档效果');
  ok(h.indexOf('tt-set-b off') >= 0, '未激活档位标灰');
  ctx.Game.state.setCount = { longxiang: 3 };
  const h2 = itemTooltip(it);
  ok(h2.indexOf('龙骧·突进（3/5）') >= 0, '提示框显示 3/5 件进度', h2.match(/龙骧[^（]*（[^）]*）/));
  ok((h2.match(/tt-set-b on/g) || []).length === 2, '3 件时前两档点亮');
  ctx.Game.state.setCount = { longxiang: 6 };
  const h3 = itemTooltip(it);
  ok(h3.indexOf('（5/5）') >= 0, '旧档 6 件时进度截断显示 5/5');
  ctx.Game.state.setCount = {};
}

/* ---- 9. 混搭空间 ---- */
head('混搭空间');
{
  for (const cls of ['warrior', 'mage', 'taoist']) {
    const list = Object.values(SETS).filter(s => s.cls === cls).sort((a, b) => b.pieces.length - a.pieces.length);
    const A = list[0], B = list[1], C = list[2];
    const used = new Set(A.slots);
    const overlapAB = B.slots.filter(sl => used.has(sl));
    ok(overlapAB.length === 0, `${CLASSES[cls].name} 主套 5 + 兵装套 4 部位不冲突（9 格满配）`, overlapAB.join(','));
    ok(A.pieces.length + B.pieces.length === 9, `${CLASSES[cls].name} 两套合计正好 9 格`, A.pieces.length + B.pieces.length);
    const overlapCA = C.slots.filter(sl => A.slots.indexOf(sl) >= 0);
    const overlapCB = C.slots.filter(sl => B.slots.indexOf(sl) >= 0);
    ok(overlapCA.length >= 1 && overlapCB.length >= 1,
      `${CLASSES[cls].name} 随身套与两套都咬合（可 3+4+2 混搭）`, overlapCA.join(',') + ' / ' + overlapCB.join(','));
    /* 3+4+2 是否真能凑 9 格 */
    const wear = new Set([...C.slots, ...B.slots]);
    const aLeft = A.slots.filter(sl => !wear.has(sl));
    ok(wear.size + aLeft.length === 9, `${CLASSES[cls].name} 3+4+2 路线可凑满 9 格`, wear.size + '+' + aLeft.length);
  }
}

console.log('\n====================================================');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('====================================================');
process.exit(fail ? 1 : 0);
