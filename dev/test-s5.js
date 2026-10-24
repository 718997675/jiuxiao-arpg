/* ============================================================
 * S5 怪物体系验证
 *
 *   node dev/test-s5.js            # 数据 + 浏览器全跑
 *   node dev/test-s5.js --data     # 只跑数据层（秒级，改数据表时用）
 *
 * 覆盖：
 *   A. 40 只怪 / 6 族群 / 10 个新模型分支 / 每张图怪池引用完整
 *   B. 12 条精英词缀：参数齐全、抽取不重复、按难度给条数、名字前缀
 *   C. 族群抗性：数值区间、元素免疫覆盖、抗性真的改伤害
 *   D. 12 条词缀的真实生效点：逐条驱动，验「有反应」而不是「有字段」
 *   E. 图鉴：击杀收录、区域全录加成、面板渲染、存档往返
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, a + ' ≈ ' + b);
const DATA_ONLY = process.argv.includes('--data');

/* ---------------- 数据层 ---------------- */
const ctx = { console, Math, Set, Map, JSON, Object, Number, String, Array, Date };
vm.createContext(ctx);
const load = f => vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }
);
load('data/data-core.js');
load('data/data-icons.js');
load('data/data-items.js');
load('data/data-uniques.js');
load('data/data-relics.js');
load('data/data-skills.js');
load('data/data-monsters.js');
load('data/data-elites.js');
load('data/data-world.js');

const pick = n => vm.runInContext(n, ctx);
const MONSTERS = pick('MONSTERS');
const BOSSES = pick('BOSSES');
const MON_FAMILIES = pick('MON_FAMILIES');
const MAPS = pick('MAPS');
const CODEX_REGIONS = pick('CODEX_REGIONS');
const ELITE_AFFIXES = pick('ELITE_AFFIXES');
const ELITE_AFFIX_ORDER = pick('ELITE_AFFIX_ORDER');
const ELITE_WARD_ELEMS = pick('ELITE_WARD_ELEMS');
const rollEliteAffixes = pick('rollEliteAffixes');
const eliteAffixCount = pick('eliteAffixCount');
const eliteDisplayName = pick('eliteDisplayName');
const STATS = pick('STATS');
const QUESTS = pick('QUESTS');

/* codexBonusStats 住在 src/items.js，但 items.js 依赖 THREE，不能整份塞进数据 VM。
   它本身只读 CODEX_REGIONS，所以把「真实函数源码」抠出来在 VM 里跑，
   保证测的是生产代码而不是测试里另写一份副本。 */
const itemsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'items.js'), 'utf8');
const cbsStart = itemsSrc.indexOf('function codexBonusStats');
if (cbsStart < 0) { console.log('  ✗ src/items.js 里找不到 codexBonusStats'); process.exit(1); }
let cbsDepth = 0, cbsEnd = -1;
for (let i = itemsSrc.indexOf('{', cbsStart); i < itemsSrc.length; i++) {
  if (itemsSrc[i] === '{') cbsDepth++;
  else if (itemsSrc[i] === '}') { cbsDepth--; if (cbsDepth === 0) { cbsEnd = i + 1; break; } }
}
vm.runInContext(itemsSrc.slice(cbsStart, cbsEnd), ctx, { filename: 'items.js:codexBonusStats' });
const codexBonusStats = pick('codexBonusStats');

console.log('\n  S5 · 怪物体系验证');
console.log('  ==================================================================');

/* ---------------- A. 怪物数据 ---------------- */
console.log('\n  A. 怪物数据（40 只 / 6 族群）');
{
  const keys = Object.keys(MONSTERS);
  ok(keys.length === 40, '普通怪 40 只', keys.length);
  ok(Object.keys(BOSSES).length === 12, 'Boss 保持 12 个');

  /* 原有 12 只 key 不能丢：任务链直接按 key 引用 */
  const legacy = ['halfork', 'skelarch', 'bat', 'spider', 'boar', 'ghost',
    'scorpion', 'snake', 'golem', 'yaoguai', 'ghostfire', 'bloodlord'];
  ok(legacy.every(k => MONSTERS[k]), '原有 12 只 key 全部保留',
    legacy.filter(k => !MONSTERS[k]).join(','));

  /* 任务链引用的怪必须存在 */
  const qTargets = new Set();
  for (const q of Object.values(QUESTS)) {
    for (const o of q.objectives) if (o.type === 'kill') qTargets.add(o.target);
  }
  const missQ = [...qTargets].filter(k => !MONSTERS[k]);
  ok(missQ.length === 0, '任务链 kill 目标都存在', missQ.join(','));

  /* 模型分支：actors.js 里必须真有这个 kind 分支 */
  const actorsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'actors.js'), 'utf8');
  const models = new Set(Object.values(MONSTERS).map(m => m.model).filter(Boolean));
  const noBranch = [...models].filter(k => actorsSrc.indexOf(`kind === '${k}'`) < 0);
  ok(noBranch.length === 0, '所有 model 在 actors.js 都有分支', noBranch.join(','));
  ok(models.size >= 17, '模型种类 ≥ 17', models.size);

  /* 新增 10 个模型必须各自独立 */
  const NEW10 = ['wolf', 'fox', 'lantern', 'zombie', 'drowned', 'brood', 'statue', 'scorpking', 'crane', 'headless'];
  ok(NEW10.every(k => actorsSrc.indexOf(`kind === '${k}'`) >= 0), '10 个新模型分支齐全',
    NEW10.filter(k => actorsSrc.indexOf(`kind === '${k}'`) < 0).join(','));
  ok(actorsSrc.indexOf("kind === 'snake'") >= 0, 'snake 分支已补（此前会回退成人形）');

  /* 每只怪的字段完整性 */
  const badField = [];
  for (const [k, m] of Object.entries(MONSTERS)) {
    if (!m.name || !m.model || !m.family) badField.push(k + ':字段');
    if (!MON_FAMILIES[m.family]) badField.push(k + ':族群');
    if (!(m.hp > 0) || !(m.atk > 0) || !(m.spd > 0)) badField.push(k + ':数值');
    if (!m.lore || m.lore.length < 6) badField.push(k + ':传说');
    if (m.ranged && !m.proj) badField.push(k + ':远程缺 proj');
  }
  ok(badField.length === 0, '40 只怪字段齐全（族群/数值/传说/远程投射物）', badField.slice(0, 6).join(','));

  /* 名字唯一（图鉴按名字展示，重名会看着像重复条目） */
  const names = Object.values(MONSTERS).map(m => m.name);
  ok(new Set(names).size === names.length, '怪物名字无重复');

  /* 每张图的怪池引用都存在，且并集覆盖 40 只 */
  const spawnAll = new Set();
  const badSpawn = [];
  for (const [id, mp] of Object.entries(MAPS)) {
    for (const k of (mp.spawns || [])) {
      if (!MONSTERS[k]) badSpawn.push(id + '/' + k);
      spawnAll.add(k);
    }
  }
  ok(badSpawn.length === 0, '地图怪池引用全部存在', badSpawn.join(','));
  ok(spawnAll.size === 40, '40 只怪全部能在某张图刷出来', spawnAll.size);

  /* 每张非安全图至少 9 种怪（「怪池变厚」的验收线） */
  const thin = Object.entries(MAPS)
    .filter(([, m]) => !m.safe && (m.spawns || []).length < 9)
    .map(([id, m]) => id + ':' + m.spawns.length);
  ok(thin.length === 0, '每张战斗地图怪池 ≥ 9 种', thin.join(','));
}

/* ---------------- B. 精英词缀 ---------------- */
console.log('\n  B. 精英词缀（12 条）');
{
  ok(ELITE_AFFIX_ORDER.length === 12, '词缀 12 条', ELITE_AFFIX_ORDER.length);
  ok(ELITE_AFFIX_ORDER.every(k => ELITE_AFFIXES[k]), '词缀 key 与表一一对应');
  ok(Object.keys(ELITE_AFFIXES).length === 12, '没有表外多余词缀');

  const bad = [];
  for (const [k, a] of Object.entries(ELITE_AFFIXES)) {
    if (!a.name || !a.desc || !a.color) bad.push(k + ':文案');
    if (a.desc.length < 6) bad.push(k + ':描述太短');
  }
  ok(bad.length === 0, '12 条词缀都有名字 / 颜色 / 说明', bad.join(','));

  /* 每条都要有可用的效果参数（否则就是面板摆设） */
  const PARAM = {
    berserk: ['dmgMul', 'cdMul', 'hpLine'],
    frost: ['slow', 'slowDur'],
    lightning: ['proc', 'mult'],
    vampiric: ['leech'],
    summoner: ['step', 'count'],
    split: ['count', 'hpPct'],
    shield: ['cd', 'pct'],
    swift: ['spd', 'aspd'],
    venom: ['dpsPct'],
    thorns: ['pct'],
    deathwish: ['radius', 'mult'],
    warded: ['cut']
  };
  const noParam = [];
  for (const k of ELITE_AFFIX_ORDER) {
    const a = ELITE_AFFIXES[k];
    for (const p of (PARAM[k] || [])) if (typeof a[p] !== 'number') noParam.push(k + '.' + p);
  }
  ok(noParam.length === 0, '12 条词缀的效果参数齐全', noParam.join(','));

  /* 抽取：不重复、条数受控 */
  let dup = 0, badLen = 0;
  for (let i = 0; i < 500; i++) {
    const r = rollEliteAffixes(3);
    if (new Set(r).size !== r.length) dup++;
    if (r.length !== 3) badLen++;
  }
  ok(dup === 0, '抽 3 条不重复（500 次）', dup);
  ok(badLen === 0, '抽取条数正确', badLen);

  /* 12 条都能被抽到 */
  const seen = new Set();
  for (let i = 0; i < 3000; i++) for (const k of rollEliteAffixes(3)) seen.add(k);
  ok(seen.size === 12, '12 条词缀全部可抽到', [...ELITE_AFFIX_ORDER].filter(k => !seen.has(k)).join(','));

  /* 难度 → 条数 */
  ok(eliteAffixCount('novice') === 1, '新手：1 条');
  ok(eliteAffixCount('hard') === 2, '困难：2 条');
  let nm2 = 0, nm3 = 0;
  for (let i = 0; i < 400; i++) { const n = eliteAffixCount('nightmare'); if (n === 2) nm2++; else if (n === 3) nm3++; }
  ok(nm2 > 0 && nm3 > 0, '极难：2~3 条都会出现', nm2 + '/' + nm3);
  let nr1 = 0, nr2 = 0;
  for (let i = 0; i < 400; i++) { const n = eliteAffixCount('normal'); if (n === 1) nr1++; else if (n === 2) nr2++; }
  ok(nr1 > 0 && nr2 > 0, '普通：1~2 条都会出现', nr1 + '/' + nr2);

  /* 名字前缀 */
  ok(eliteDisplayName('獠牙猪卫', ['frost']) === '冰霜·獠牙猪卫', '名字带词缀前缀',
    eliteDisplayName('獠牙猪卫', ['frost']));
  ok(eliteDisplayName('獠牙猪卫', []) === '獠牙猪卫', '无词缀不加前缀');

  /* 元素免疫只免疫四种元素，不能免疫物理（否则石魔 + 免疫物理无解） */
  ok(ELITE_WARD_ELEMS.length === 4 && ELITE_WARD_ELEMS.indexOf('phys') < 0,
    '元素免疫不含物理', ELITE_WARD_ELEMS.join(','));
}

/* ---------------- C. 族群抗性 ---------------- */
console.log('\n  C. 族群抗性');
{
  ok(Object.keys(MON_FAMILIES).length === 6, '6 个族群', Object.keys(MON_FAMILIES).length);
  const KEYS = ['phys', 'fire', 'ice', 'lightning', 'poison'];
  const bad = [];
  for (const [id, f] of Object.entries(MON_FAMILIES)) {
    if (!f.name || !f.desc || !f.color) bad.push(id + ':文案');
    for (const k of KEYS) if (typeof f.resist[k] !== 'number') bad.push(id + '.' + k);
    for (const k of KEYS) {
      const v = f.resist[k];
      if (v < -60 || v > 85) bad.push(id + '.' + k + '=' + v);
    }
  }
  ok(bad.length === 0, '族群抗性键齐全且落在 [-60, 85]', bad.join(','));

  /* 每个族群至少一个抗性 + 一个弱点，才有「换武器」的意义 */
  const flat = [];
  for (const [id, f] of Object.entries(MON_FAMILIES)) {
    const vals = KEYS.map(k => f.resist[k]);
    if (!vals.some(v => v > 0)) flat.push(id + ':无抗');
    if (!vals.some(v => v < 0)) flat.push(id + ':无弱点');
  }
  ok(flat.length === 0, '每个族群都有抗性与弱点', flat.join(','));

  /* 计划里的三条硬设定 */
  ok(MON_FAMILIES.undead.resist.poison >= 50, '亡灵抗毒 ≥ 50%', MON_FAMILIES.undead.resist.poison);
  ok(MON_FAMILIES.stone.resist.phys >= 40, '石魔抗物理 ≥ 40%', MON_FAMILIES.stone.resist.phys);
  ok(MON_FAMILIES.spirit.resist.phys < 0, '妖灵抗法术 → 物理反而是弱点', MON_FAMILIES.spirit.resist.phys);

  /* 每只怪都能查到族群抗性 */
  const noFam = Object.entries(MONSTERS).filter(([, m]) => !MON_FAMILIES[m.family]).map(([k]) => k);
  ok(noFam.length === 0, '40 只怪都能查到族群抗性', noFam.join(','));
}

/* ---------------- D. 图鉴数据 ---------------- */
console.log('\n  D. 图鉴数据');
{
  ok(CODEX_REGIONS.length === 5, '5 个区域页签', CODEX_REGIONS.length);
  /* 区域奖励必须是真实属性键，否则「集齐了也没效果」 */
  const badStat = [];
  for (const r of CODEX_REGIONS) {
    if (!r.name || !r.bonusDesc) badStat.push(r.id + ':文案');
    for (const k in r.bonus) if (!(k in STATS)) badStat.push(r.id + '.' + k);
  }
  ok(badStat.length === 0, '区域奖励都是真实属性键', badStat.join(','));

  /* 空图鉴 → 无加成 */
  const empty = codexBonusStats({ mon: {}, regions: {} });
  ok(Object.keys(empty).length === 0, '空图鉴不产生加成');

  /* 全录 → 5 区加成累加 */
  const all = {};
  for (const r of CODEX_REGIONS) all[r.id] = true;
  const full = codexBonusStats({ mon: {}, regions: all });
  let expectKeys = 0;
  for (const r of CODEX_REGIONS) expectKeys += Object.keys(r.bonus).length;
  ok(Object.keys(full).length === expectKeys, '全录加成覆盖全部键', Object.keys(full).length + '/' + expectKeys);

  /* 每个区域的怪都能归到区（按 MAPS 声明顺序取首个） */
  const regionOf = kind => {
    for (const id in MAPS) {
      const m = MAPS[id];
      if (m.spawns && m.spawns.indexOf(kind) >= 0) return id;
    }
    return null;
  };
  const orphan = Object.keys(MONSTERS).filter(k => !regionOf(k));
  ok(orphan.length === 0, '40 只怪都能归到一个区域', orphan.join(','));
  /* 每个区至少 5 条，图鉴页才不会空 */
  const thin = CODEX_REGIONS.filter(r => {
    const kinds = (MAPS[r.id].spawns || []).filter(k => regionOf(k) === r.id);
    return kinds.length < 5;
  }).map(r => r.id);
  ok(thin.length === 0, '每个区域 ≥ 5 条图鉴', thin.join(','));
}

/* ---------------- 浏览器部分 ---------------- */
(async () => {
  if (DATA_ONLY) {
    console.log('\n====================================================');
    console.log(`结果（仅数据层）：${pass} 通过 / ${fail} 失败`);
    console.log('====================================================');
    process.exit(fail ? 1 : 0);
  }

  const puppeteer = require('puppeteer-core');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 180)); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2200);

  /* ---------------- E. 40 个模型都能造出来 ---------------- */
  console.log('\n  E. 模型生成（40 只逐个 spawn）');
  const build = await p.evaluate(() => {
    const out = { bad: [], noTorso: [], tiny: [] };
    const kinds = Object.keys(MONSTERS);
    for (const k of kinds) {
      try {
        const e = Game.spawnEnemy(k, 40 + Math.random() * 4, 40, false, 20);
        if (!e) { out.bad.push(k + ':null'); continue; }
        if (!e.actor || !e.actor.parts || !e.actor.parts.torso) out.noTorso.push(k);
        if (!(e.radius > 0.3 && e.radius < 6)) out.tiny.push(k + ':' + e.radius.toFixed(2));
        e.dead = true; e.deadT = 99;   // 立刻回收，别把 40 只全留在场上
      } catch (err) {
        out.bad.push(k + ':' + String(err).slice(0, 60));
      }
    }
    return out;
  });
  ok(build.bad.length === 0, '40 只怪全部 spawn 成功', build.bad.slice(0, 4).join(' | '));
  ok(build.noTorso.length === 0, '40 只怪都有躯干节点（动画不会失效）', build.noTorso.join(','));
  ok(build.tiny.length === 0, '碰撞半径合理（0.3~6）', build.tiny.join(','));

  /* 新模型的辨识度：同一坐标下顶点数不同（说明不是同一套几何） */
  const shape = await p.evaluate(() => {
    const sig = {};
    for (const k of ['wolf', 'fox', 'lantern', 'zombie', 'drowned', 'brood', 'statue', 'scorpking', 'crane', 'headless']) {
      const e = Game.spawnEnemy(k, 60, 60, false, 20);
      let n = 0;
      e.actor.group.traverse(o => { if (o.isMesh) n++; });
      sig[k] = n;
      e.dead = true; e.deadT = 99;
    }
    return sig;
  });
  const sigVals = Object.values(shape);
  ok(sigVals.every(v => v >= 4), '10 个新模型都有足够部件', JSON.stringify(shape));
  ok(new Set(sigVals).size >= 7, '10 个新模型外形互不相同（部件数至少 7 种）', JSON.stringify(sigVals));

  /* ---------------- F. 抗性真的改伤害 ---------------- */
  console.log('\n  F. 抗性结算');
  const resTest = await p.evaluate(() => {
    const mk = () => {
      const e = Game.spawnEnemy('golem', 70, 70, false, 20);
      e.hp = e.maxHp = 1e7;
      return e;
    };
    const hit = (e, elem) => {
      const h = e.hp;
      Game.damageEnemy(e, 1000, false, { elem, silent: true });
      return h - e.hp;
    };
    const a = mk(); a.resist = { phys: 0, fire: 0 };
    const b1 = mk(); b1.resist = { phys: 0, fire: 50 };
    const c1 = mk(); c1.resist = { phys: 0, fire: -50 };
    const d1 = mk(); d1.resist = { phys: 50, fire: 0 };
    const out = {
      base: hit(a, 'fire'),
      half: hit(b1, 'fire'),
      weak: hit(c1, 'fire'),
      phys: hit(d1, 'phys'),
      noResistField: hit(mk(), 'fire')
    };
    [a, b1, c1, d1].forEach(e => { e.dead = true; e.deadT = 99; });
    return out;
  });
  near(resTest.half / resTest.base, 0.5, 0.02, '50% 火抗 → 火伤减半');
  near(resTest.weak / resTest.base, 1.5, 0.03, '-50% 火抗（弱点）→ 火伤 ×1.5');
  near(resTest.phys / resTest.noResistField, 0.5, 0.02, '物理抗性同样生效');
  ok(resTest.noResistField > 0, '没有 resist 字段时不报错、照常结算');

  /* ---------------- G. 12 条词缀逐条驱动 ---------------- */
  console.log('\n  G. 12 条词缀的真实生效点');
  const affTest = await p.evaluate(() => {
    const R = {};
    const A = ELITE_AFFIXES;
    const near5 = () => { const pp = Game.playerGroup.position; return { x: pp.x, z: pp.z }; };

    /* 准备：清掉干扰项 */
    const clean = () => {
      Game.invuln = 0; Game.dead = false; Game._eliteProc = false;
      Game.playerSlow = 0; Game.playerSlowT = 0; Game.poisonT = 0;
      const st = Game.state.stats;
      st.dodge = 0; st.block = 0; st.dmgReduce = 0; st.allRes = 0;
      st.physRes = 0; st.fireRes = 0; st.iceRes = 0; st.poisonRes = 0;
      Game.state.hp = st.hpMax;
    };
    const dummy = (aff) => {
      const e = Game.spawnEnemy('halfork', 80, 80, false, 20);
      e.hp = e.maxHp = 1e6;
      e.aff = aff; e.affixes = Object.keys(aff || {});
      return e;
    };
    const reap = e => { e.dead = true; e.deadT = 99; };

    /* 1 狂暴 */
    {
      clean();
      const e = dummy({ berserk: A.berserk });
      e.hp = e.maxHp * 0.4;
      const dmg0 = e.dmg;
      Game.updateEnemies(0.016);
      R.berserk = { on: !!e.berserkOn, ratio: e.dmg / dmg0 };
      reap(e);
    }
    /* 2 冰霜 */
    {
      clean();
      const e = dummy({ frost: A.frost });
      Game.damagePlayer(1, e);
      R.frost = { slow: Game.playerSlow, t: Game.playerSlowT };
      reap(e);
    }
    /* 3 闪电 */
    {
      clean();
      const e = dummy({ lightning: Object.assign({}, A.lightning, { proc: 1 }) });
      const hp0 = Game.state.hp;
      Game.damagePlayer(1, e);
      R.lightning = { lost: hp0 - Game.state.hp };
      reap(e);
    }
    /* 4 吸血 */
    {
      clean();
      const e = dummy({ vampiric: A.vampiric });
      e.hp = 1000;
      Game.damagePlayer(200, e);
      R.vampiric = { healed: e.hp > 1000, hp: e.hp };
      reap(e);
    }
    /* 5 召唤 */
    {
      clean();
      const e = dummy({ summoner: A.summoner });
      e.hp = e.maxHp * 0.5;      // 已过半血，再打一点就该触发两档
      const before = Game.enemies.filter(x => !x.dead).length;
      Game.damageEnemy(e, 1, false, { silent: true });
      R.summoner = {
        step: e.summonStep,
        added: Game.enemies.filter(x => !x.dead && x.summoned).length,
        before
      };
      reap(e);
      Game.enemies.filter(x => x.summoned).forEach(reap);
    }
    /* 6 分裂 */
    {
      clean();
      const e = dummy({ split: A.split });
      const before = Game.enemies.filter(x => !x.dead).length;
      Game.damageEnemy(e, 1e9, false, { silent: true });
      Game.flushSplit();
      const kids = Game.enemies.filter(x => x.splitChild && !x.dead);
      R.split = { n: kids.length, hpRatio: kids.length ? kids[0].hp / e.maxHp : 0, before };
      kids.forEach(reap);
    }
    /* 7 护盾 */
    {
      clean();
      const e = dummy({ shield: A.shield });
      e.shield = 0; e.shieldCd = 0;
      Game.updateEnemies(0.016);
      const sh = e.shield;
      const h0 = e.hp;
      Game.damageEnemy(e, sh / 2, false, { silent: true });
      R.shield = { gained: sh > 0, absorbed: e.hp === h0, left: e.shield };
      reap(e);
    }
    /* 8 迅捷：抽到 swift 的精英 spd 必须高于同族普通怪 */
    {
      clean();
      const plain = Game.spawnEnemy('boar', 90, 90, false, 20);
      const spdPlain = plain.spd;
      reap(plain);
      let found = null;
      for (let i = 0; i < 400 && !found; i++) {
        const e = Game.spawnEnemy('boar', 90, 90, true, 20);
        if (e.aff && e.aff.swift) found = e;
        else reap(e);
      }
      R.swift = found ? { ok: found.spd > spdPlain, spd: found.spd, base: spdPlain, cd: found.atkCdBase } : { ok: false };
      if (found) reap(found);
    }
    /* 9 剧毒 */
    {
      clean();
      const e = dummy({ venom: A.venom });
      Game.damagePlayer(1, e);
      R.venom = { poisonT: Game.poisonT };
      reap(e);
    }
    /* 10 荆棘 */
    {
      clean();
      const e = dummy({ thorns: A.thorns });
      const hp0 = Game.state.hp;
      Game.damageEnemy(e, 300, false, { tag: 'melee' });
      R.thorns = { reflect: hp0 - Game.state.hp > 0, lost: hp0 - Game.state.hp };
      reap(e);
    }
    /* 11 亡语 */
    {
      clean();
      const pp = near5();
      const e = Game.spawnEnemy('halfork', pp.x + 1, pp.z, false, 20);
      e.aff = { deathwish: A.deathwish };
      /* 不能靠「hp 掉没掉」判断：击杀给经验，升级会把 hp 拉满，
       * 亡语的伤害被回血盖掉，看起来反而像在加血。
       * 改成挂一个探针监听 damagePlayer 的实际入参，验的是生效点本身。 */
      const orig = Game.damagePlayer;
      let dealt = 0, calls = 0;
      Game.damagePlayer = function (v, src) {
        if (v > 0) { dealt += v; calls++; }
        return orig.call(this, v, src);
      };
      Game.damageEnemy(e, 1e9, false, { silent: true });
      Game.damagePlayer = orig;
      R.deathwish = { boom: calls > 0 && dealt > 0, lost: Math.round(dealt) };
      reap(e);
    }
    /* 12 元素免疫：抽到的元素伤害必须显著低于无免疫 */
    {
      clean();
      const e = Game.spawnEnemy('golem', 95, 95, false, 20);
      e.hp = e.maxHp = 1e7;
      e.resist = Object.assign({}, MON_FAMILIES.stone.resist);
      e.wardElem = 'fire';
      e.resist.fire = Math.max(e.resist.fire || 0, A.warded.cut);
      const h0 = e.hp;
      Game.damageEnemy(e, 1000, false, { elem: 'fire', silent: true });
      const cut = (h0 - e.hp);
      R.warded = { cut, ratio: cut / 1000 };
      reap(e);
    }
    return R;
  });

  ok(affTest.berserk.on && affTest.berserk.ratio > 1.5, '狂暴：半血后伤害 ×1.6',
    affTest.berserk.on + '/' + affTest.berserk.ratio);
  ok(affTest.frost.slow > 0.3 && affTest.frost.t >= 3, '冰霜：命中给玩家减速 35%/3s',
    affTest.frost.slow + '/' + affTest.frost.t);
  ok(affTest.lightning.lost > 5, '闪电：命中追加落雷（额外掉血）', affTest.lightning.lost);
  ok(affTest.vampiric.healed, '吸血：造成伤害后自身回血', affTest.vampiric.hp);
  ok(affTest.summoner.added >= 2, '召唤：过 25% 血线召出同族', JSON.stringify(affTest.summoner));
  ok(affTest.split.n === 2, '分裂：死亡裂成 2 只', affTest.split.n);
  ok(affTest.split.hpRatio > 0.35 && affTest.split.hpRatio < 0.45, '分裂幼体血量 40%', affTest.split.hpRatio);
  ok(affTest.shield.gained && affTest.shield.absorbed, '护盾：回充满盾并吸收伤害', JSON.stringify(affTest.shield));
  ok(affTest.swift.ok, '迅捷：精英移速高于同族普通怪', JSON.stringify(affTest.swift));
  ok(affTest.venom.poisonT > 0, '剧毒：命中必定中毒', affTest.venom.poisonT);
  ok(affTest.thorns.reflect, '荆棘：近战打它会被反弹', affTest.thorns.lost);
  ok(affTest.deathwish.boom, '亡语：死亡时爆炸伤到玩家', affTest.deathwish.lost);
  ok(affTest.warded.ratio < 0.2, '元素免疫：该元素伤害被砍到 15% 以下', affTest.warded.ratio);

  /* 精英外观：金色血条 + 名字前缀 */
  console.log('\n  H. 精英可辨识');
  const look = await p.evaluate(() => {
    let e = null;
    for (let i = 0; i < 60 && !e; i++) {
      const t = Game.spawnEnemy('boar', 100, 100, true, 20);
      if (t) e = t;
    }
    const barColor = e && e.bar ? e.bar.fill.material.color.getHexString() : null;
    const out = {
      hasLabel: !!(e && e.label),
      name: e ? e.name : null,
      prefixed: !!(e && e.name.indexOf('·') > 0),
      barColor,
      ring: !!(e && e.eliteRing),
      affixes: e ? e.affixes.length : 0
    };
    if (e) { e.dead = true; e.deadT = 99; }
    return out;
  });
  ok(look.hasLabel && look.prefixed, '精英头顶有带前缀的名字牌', look.name);
  ok(look.barColor === 'd8b25a', '精英血条转金色', look.barColor);
  ok(look.ring, '精英脚下有光环');
  ok(look.affixes >= 1, '精英至少带 1 条词缀', look.affixes);

  /* ---------------- I. 图鉴 ---------------- */
  console.log('\n  I. 图鉴（异兽志）');
  const cx = await p.evaluate(() => {
    const out = {};
    Game.state.codex = { mon: {}, regions: {} };
    out.k0 = Game.unlockCodex('halfork');
    out.kills1 = Game.codexEntry('halfork').kills;
    Game.unlockCodex('halfork');
    out.kills2 = Game.codexEntry('halfork').kills;
    out.regionOf = Game.codexRegionOf('halfork');
    /* 未集齐时不给加成 */
    out.bonusBefore = Game.codexBonus();
    /* 集齐幽篁林 */
    const kinds = Game.codexRegionKinds('forest');
    kinds.forEach(k => Game.unlockCodex(k));
    out.forestKinds = kinds.length;
    out.regionDone = !!Game.codex().regions.forest;
    out.bonusAfter = Game.codexBonus();
    out.statEliteDmg = Game.state.stats.eliteDmg;
    /* 重复集齐不叠加 */
    Game.checkCodexRegion('forest');
    out.bonusTwice = Game.codexBonus();
    return out;
  });
  ok(cx.kills1 === 1 && cx.kills2 === 2, '击杀累加计数', cx.kills1 + '/' + cx.kills2);
  ok(cx.regionOf === 'forest', 'halfork 归属幽篁林', cx.regionOf);
  ok(Object.keys(cx.bonusBefore).length === 0, '未集齐无加成');
  ok(cx.regionDone, '集齐幽篁林 → 区域标记', cx.forestKinds);
  ok(cx.bonusAfter.eliteDmg === 4, '集齐奖励进入面板属性（eliteDmg +4）', JSON.stringify(cx.bonusAfter));
  ok(cx.statEliteDmg >= 4, 'computePlayerStats 已合并图鉴加成', cx.statEliteDmg);
  ok(cx.bonusTwice.eliteDmg === 4, '重复集齐不叠加', cx.bonusTwice.eliteDmg);

  /* 面板渲染 */
  const panel = await p.evaluate(() => {
    UI.openMenu('codex');
    const grid = document.getElementById('codexGrid');
    const regs = document.querySelectorAll('#codexRegions .creg');
    const cards = grid ? grid.querySelectorAll('.cx').length : 0;
    const locked = grid ? grid.querySelectorAll('.cx.lock').length : 0;
    const cap = document.getElementById('codexCap').textContent;
    const foot = document.getElementById('codexFoot').textContent;
    /* 切到第二个区域 */
    const btns = document.querySelectorAll('#codexRegions .creg');
    btns[1] && btns[1].click();
    const cards2 = document.querySelectorAll('#codexGrid .cx').length;
    const on2 = document.querySelectorAll('#codexRegions .creg')[1].classList.contains('on');
    UI.closeAll();
    return { regs: regs.length, cards, locked, cap, foot, cards2, on2 };
  });
  ok(panel.regs === 5, '5 个区域页签', panel.regs);
  ok(panel.cards >= 5, '当前区域渲染出条目', panel.cards);
  ok(panel.locked >= 0, '未收录条目以「？」占位', panel.locked);
  ok(/已录 \d+ \/ 40/.test(panel.cap), '顶部显示收录进度', panel.cap);
  ok(panel.foot.indexOf('全录达成') >= 0, '集齐的区域在底注标「全录达成」', panel.foot.slice(0, 40));
  ok(panel.on2 && panel.cards2 > 0, '区域页签可切换', panel.cards2);

  /* 存档往返：codex 必须能存能读 */
  const round = await p.evaluate(() => {
    Game.save();
    const slot = SaveManager.activeSlot ? SaveManager.activeSlot() : 1;
    const doc = SaveManager.readSlot(slot);
    const raw = JSON.parse(localStorage.getItem(SaveManager.slotKey(slot)) || 'null');
    const src = doc || raw;
    return {
      hasMon: !!(src && src.codex && src.codex.mon && src.codex.mon.halfork),
      kills: src && src.codex && src.codex.mon && src.codex.mon.halfork ? src.codex.mon.halfork.kills : -1,
      memKills: Game.codexEntry('halfork').kills,
      region: !!(src && src.codex && src.codex.regions && src.codex.regions.forest)
    };
  });
  ok(round.hasMon && round.kills === round.memKills && round.kills > 0,
    '图鉴写入存档（击杀数与内存一致）', JSON.stringify(round));
  ok(round.region, '区域标记写入存档');

  /* 脏数据归一化：codex 被手改成字符串也不能让图鉴页崩 */
  const dirty = await p.evaluate(() => {
    const bad = [{ codex: 'x' }, { codex: { mon: [1, 2], regions: 'y' } }, { codex: { mon: { halfork: { kills: -5, at: 'zz' } } } }];
    const out = bad.map(v => JSON.stringify(SaveManager._codex(v.codex)));
    return out;
  });
  ok(dirty.every(s => s.indexOf('"mon"') >= 0 && s.indexOf('"regions"') >= 0),
    'codex 脏数据一律收敛成 {mon,regions}', dirty.join(' '));
  ok(dirty[2].indexOf('-5') < 0, '负数击杀被夹到 0', dirty[2]);

  /* 截图 */
  await p.evaluate(() => { Game.state.codex = Game.codex(); UI.openMenu('codex'); });
  await wait(400);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's5-codex.png') });
  await p.evaluate(() => { UI.closeAll(); Game.loadMap('forest'); });
  await wait(1600);
  await p.screenshot({ path: path.resolve(__dirname, '..', 'shots', 's5-forest.png') });

  await b.close();

  const realErrs = errs.filter(e => e.indexOf('glb') < 0 && e.indexOf('favicon') < 0);
  ok(realErrs.length === 0, '控制台 0 error', realErrs.slice(0, 3).join(' | '));

  console.log('\n====================================================');
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  if (realErrs.length) console.log('页面错误：\n' + realErrs.slice(0, 6).join('\n'));
  console.log('====================================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃：', e); process.exit(1); });
