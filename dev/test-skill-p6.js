/* ============================================================
 * 技能重构 P6 · 回归契约（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p6.js
 *
 * P6 的三件事，全部落在「账本」上，所以全部可以离线钉死：
 *   1. **老档兼容** —— 一个 8 格 / 只有 v 通道 / 没有 passives 的旧档，
 *      读进来之后 5 格齐、点数守恒、字段一个不丢。
 *   2. **洗点** —— 退光花点的（lv / p），**留下免费的**（v / f / m / el / el2）。
 *      洗点收钱、次数递增，次数本身也要落盘（否则永远第一档 800 金）。
 *   3. **字段保真** —— 升级 / 降级 / 换变体这三处都是「重建对象」，
 *      每处漏一个键，玩家的选择就无声消失。这一节按源码对账钉死。
 *
 * 三条红线（写在这里，防止以后有人「顺手简化」）：
 *   · 技能账本只有两类字段：**花点的**（lv / p）和**免费的**（v / f / m / el / el2）。
 *     洗点只能动前者。
 *   · 一切「重建对象」的地方都必须保留免费字段 —— 加字段时不许回头补代码。
 *   · 存档 pack / unpack / normalizeDoc 三处必须同时认识一个字段，
 *     漏一处就是「存了读不回来」，比不存更隐蔽。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadData, listFiles, ROOT } = require('./_load');

const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dataSrc = f => readSrc('src/data/' + f);

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* ============================================================
 * 一、技能账本字段分类（全篇的地基）
 * ============================================================ */
console.log('一、账本字段分类');
const PAID = ['lv', 'p'];              // 花技能点
const FREE = ['v', 'f', 'm', 'el', 'el2'];   // 不花点，纯选择
{
  const tree = dataSrc('data-skill-tree.js');
  const fnOf = name => {
    const i = tree.indexOf('function ' + name + '(');
    if (i < 0) return '';
    return tree.slice(i, tree.indexOf('\n}', i) + 2);
  };

  /* 「留下来的东西」必须是**一处**定义，两处调用。
   * 分成两份实现就一定会各自漏字段 —— P2 加 m、P3 加 el/el2 时就是这么漏的。 */
  const keepFn = fnOf('skillEntryKeep');
  ok(!!keepFn, 'skillEntryKeep 存在（免费字段的唯一出口）');
  for (const k of FREE) {
    ok(new RegExp('(?:keep|e)\\.' + k + '\\b').test(keepFn),
      'skillEntryKeep 保留免费字段 ' + k);
  }
  ok(!/keep\.lv\s*=/.test(keepFn), 'skillEntryKeep 不保留 lv（那是花点的账）');
  ok(!/keep\.p\s*=/.test(keepFn), 'skillEntryKeep 不保留 p 取向（那是花点的账）');
  ok(/lv: 1/.test(keepFn), 'skillEntryKeep 把 lv 归 1');

  for (const name of ['skillTreeRespecApply', 'skillRefundAll']) {
    const f = fnOf(name);
    ok(/skillEntryKeep\(/.test(f), name + ' 走 skillEntryKeep（不自己手写保留逻辑）');
    ok(!/keep\.[a-z0-9]+\s*=/.test(f), name + ' 里没有第二份保留实现');
  }
}

/* ============================================================
 * 二、「重建对象」的保留逻辑（keepPick）
 *
 * 升级 / 降级 / 换变体都走 keepPick(prev, next)。以前它只认 p，
 * 于是 P2 加了 m、P3 加了 el/el2 之后，**升一级就把元素注入丢了**。
 * 现在改成「next 没提到的键一律从 prev 带过来」，
 * 以后再加字段不用回头改这里。
 * ============================================================ */
console.log('\n二、重建对象时保留免费字段');
{
  const game = readSrc('src/game.js');
  const fn = (() => {
    const i = game.indexOf('function keepPick(');
    return game.slice(i, game.indexOf('\n}', i) + 2);
  })();
  ok(/SKILL_ENTRY_KEEP|SKILL_KEEP_KEYS/.test(fn) || /for\s*\(/.test(fn),
    'keepPick 是「按名单循环带过来」，不是手写 if');
  for (const k of FREE.concat(['p'])) {
    ok(new RegExp("'" + k + "'").test(game.slice(game.indexOf('const SKILL_ENTRY_KEEP'), game.indexOf('const SKILL_ENTRY_KEEP') + 200)),
      '保留名单里有 ' + k);
  }
  /* 三处调用点仍在（少一处说明有人把重建改成了原地改，也就不用管保留了） */
  const n = (game.match(/keepPick\(/g) || []).length;
  ok(n >= 3, 'keepPick 仍被 levelUp / levelDown / setVariant 三处复用', n);

  /* 反向断言：不许再出现「手写只保留 p」的老写法 */
  ok(!/if \(prev && prev\.p !== undefined\) next\.p = prev\.p;/.test(game),
    '老的「只保留 p」实现已删除');
}

/* ============================================================
 * 三、存档三处必须同时认识一个字段
 *
 * pack 写了 / unpack 不读 = 存了看不见；
 * pack 不写 = 根本没存。两者都是「重开就没了」。
 * ============================================================ */
console.log('\n三、存档 pack / unpack / normalizeDoc 三处对齐');
{
  const save = readSrc('src/core/save.js');
  const block = (name, end) => {
    const i = save.indexOf('  ' + name);
    const j = save.indexOf(end, i);
    return save.slice(i, j > 0 ? j : i + 4000);
  };
  const packSrc = block('pack(flat, slot)', '\n  unpack(doc)');
  const unpackSrc = block('unpack(doc)', '\n  /* ---------------- 迁移器');
  const normSrc = block('normalizeDoc(d, slot)', '\n  /* ---------------- 扁平 state');

  const FIELDS = ['skills', 'passives', 'skillbar', 'skillbar2', 'barSet', 'treeRespecCount'];
  for (const f of FIELDS) {
    ok(new RegExp('\\b' + f + ':').test(packSrc), 'pack 写 ' + f);
    ok(new RegExp('\\b' + f + ':').test(unpackSrc), 'unpack 读 ' + f);
    ok(new RegExp('d\\.' + f + '\\b').test(normSrc), 'normalizeDoc 整形 ' + f);
  }

  /* 一次性迁移标记：normalizeProgress 靠「标记 != 目标值」判断是不是第一次。
   * 标记不落盘 = 每次读档都以为自己是第一次 = 每次读档退光技能点。
   * 这条不是「顺手补的字段」，是整个 P6 最贵的一个 bug，单独立断言。 */
  for (const f of ['barVer', 'skillReset']) {
    ok(new RegExp('\\b' + f + ':').test(packSrc), '一次性迁移标记 ' + f + ' 必须落盘（否则每次读档重跑迁移）');
    ok(new RegExp('\\b' + f + ':').test(unpackSrc), 'unpack 读回 ' + f);
  }
  /* 新档也必须主动写上「已迁移」，否则「建号 → 投点 → 存档 → 读档」照样退款 */
  const game = readSrc('src/game.js');
  const startAt = game.indexOf('newState(cls, name, difficulty)');
  const startBody = game.slice(startAt, game.indexOf('\n  },', startAt));
  ok(/barVer:\s*2/.test(startBody), 'newState 的新档直接标 barVer = 2');
  ok(/skillReset:\s*1/.test(startBody), 'newState 的新档直接标 skillReset = 1');
}

/* ============================================================
 * 四、老档兼容（真跑数据层）
 *
 * 造一个「P1 之前」的档：8 格技能条、skills 里只有 lv + v、
 * 没有 passives / treeRespecCount / barSet。读进来必须：
 *   · 技能条收敛成 5 格且按功能位归位；
 *   · 缺的字段补成合法默认值（不是 undefined）；
 *   · 已经投的点一分不少（skillPointPool − 已投）。
 * ============================================================ */
console.log('\n四、老档兼容');
{
  const ctx = loadData();
  const pick = n => vm.runInContext(n, ctx);

  const SKILL_BAR_SLOTS = pick('SKILL_BAR_SLOTS');
  const skillBarMigrate = pick('skillBarMigrate');
  const skillFormIdx = pick('skillFormIdx');
  const skillPointPool = pick('skillPointPool');
  const skillSpentMap = pick('skillSpentMap');
  const skillTreeRespecFee = pick('skillTreeRespecFee');
  const skillTreeRespecApply = pick('skillTreeRespecApply');
  const skillRefundAll = pick('skillRefundAll');
  const skillArchSlotOf = pick('skillArchSlotOf');
  const SKILLS = pick('SKILLS');
  const SKILL_TREE = pick('SKILL_TREE');

  ok(SKILL_BAR_SLOTS === 5, '技能条是 5 格（P1 拍板）', SKILL_BAR_SLOTS);

  /* 8 格老条：② 号位的技能必须落到 1 键格，不是「截前 5 个」 */
  const cls = 'warrior';
  const bySlot = {};
  for (const id in SKILLS) {
    const no = skillArchSlotOf(cls, id);
    if (no && !bySlot[no]) bySlot[no] = id;
  }
  const oldBar = [];
  for (let no = 1; no <= 5; no++) if (bySlot[no]) oldBar.push(bySlot[no]);
  oldBar.push(null, 'nonexistent_skill', null);          // 凑到 8 格 + 一个脏 id
  const migrated = skillBarMigrate(oldBar, cls);
  ok(Array.isArray(migrated) && migrated.length === 5, '8 格老条 → 5 格', migrated && migrated.length);
  let placed = true;
  for (let no = 1; no <= 5; no++) {
    if (bySlot[no] && migrated[no - 1] !== bySlot[no]) placed = false;
  }
  ok(placed, '老条按功能位归位（不是简单截断）', migrated);
  ok(migrated.every(v => v === null || typeof v === 'string'), '脏 id 被剔掉，不留 undefined');

  /* 只有 v 通道的老技能项：新通道 f 缺省必须读 v（拍板「旧变体原样保留成变体分支」） */
  for (const v of [0, 1, 2]) {
    ok(skillFormIdx({ fireball: { lv: 5, v } }, 'fireball') === v,
      '老档只有 v=' + v + ' 时 f 通道读到的就是 ' + v);
  }
  ok(skillFormIdx({ fireball: { lv: 5, f: 2, v: 0 } }, 'fireball') === 2,
    'f 存在时优先读 f（新通道说了算）');
  ok(skillFormIdx({ fireball: { lv: 5 } }, 'fireball') === 0, '两个都没有 → 0 号变体');
  ok(skillFormIdx({ fireball: { lv: 5, f: 9 } }, 'fireball') === 0, '越界 f 收敛成 0');

  /* 点数守恒：老档里已经投出去的点，退还之后必须一分不少地回来 */
  const pool = skillPointPool(40);
  ok(pool === 60, '40 级技能点池 = 60（等级 × 1.5）', pool);

  /* 造一个「投满了」的账本：主动 lv 拉满 + 取向 + 被动 */
  const mkFull = () => {
    const sk = {};
    let left = pool;
    const ids = Object.keys(SKILLS).filter(id => skillArchSlotOf(cls, id));
    for (const id of ids) {
      if (left <= 0) break;
      const take = Math.min(9, left);           // lv 1→10 = 9 点
      sk[id] = { lv: 1 + take, v: 1, f: 2, m: 1, el: 'fire', el2: 'ice' };
      left -= take;
    }
    const pas = {};
    for (const pid in SKILL_TREE.passives) {
      if (left <= 0) break;
      pas[pid] = 1; left -= 1;
    }
    return { sk, pas };
  };

  const sumSpent = (sk, pas) => {
    const m = skillSpentMap(sk, pas);
    let n = 0;
    for (const k in m) n += m[k];
    return n;
  };

  const a = mkFull();
  const spentA = sumSpent(a.sk, a.pas);
  ok(spentA === pool, '造的账本正好花光技能点池', { spentA, pool });

  const refunded = skillRefundAll(a.sk, a.pas);
  ok(refunded.refunded === spentA, '退还点数 == 已投点数（一分不少）', { refunded, spentA });
  ok(Object.keys(a.pas).length === 0, '被动账本被清空');
  ok(Object.keys(a.sk).every(id => a.sk[id].lv === 1), '主动等级全部归 1');
  ok(Object.keys(a.sk).every(id => a.sk[id].p === undefined), '取向清空（那是花点的）');
  ok(Object.keys(a.sk).every(id => a.sk[id].f === 2 && a.sk[id].m === 1
    && a.sk[id].el === 'fire' && a.sk[id].el2 === 'ice'),
    '变体 / 精通 / 元素注入全部保留（免费的）', a.sk[Object.keys(a.sk)[0]]);

  /* 洗点费用阶梯：800 → 2400 → 6000 → 15000 → 35000 封顶 */
  const fees = [0, 1, 2, 3, 4, 5, 99].map(skillTreeRespecFee);
  ok(fees[0] === 800 && fees[1] === 2400 && fees[2] === 6000 && fees[3] === 15000,
    '洗点阶梯 800 / 2400 / 6000 / 15000', fees);
  ok(fees[4] === 35000 && fees[5] === 35000 && fees[6] === 35000, '第 5 次起 35000 封顶', fees);

  /* 洗点扣钱、计数 +1、免费字段原样 */
  const b = mkFull();
  const gold0 = 100000;
  const r = skillTreeRespecApply(b.sk, b.pas, gold0, 0);
  ok(r.ok === true, '钱够时洗点成功', r);
  ok(r.cost === 800, '第一次洗点收 800', r.cost);
  ok(r.cleaned === spentA, 'cleaned 报的是「退掉的花点」，不是别的', { c: r.cleaned, spentA });
  ok(Object.keys(b.sk).every(id => b.sk[id].el === 'fire'), '洗点后元素注入还在（免费的选择）');
  ok(skillTreeRespecApply(b.sk, b.pas, gold0, 0).ok === false, '刚洗完再洗 → 拒绝（没有可退的点）');
  const poor = mkFull();
  ok(skillTreeRespecApply(poor.sk, poor.pas, 100, 0).ok === false, '钱不够 → 拒绝');
  ok(poor.sk[Object.keys(poor.sk)[0]].lv > 1, '钱不够时账本一点没动（不能洗一半）');

  /* 越界 / 脏值：洗点次数为负或非数，费用回落第一档而不是 NaN */
  ok(skillTreeRespecFee(-5) === 800, '负次数回落第一档', skillTreeRespecFee(-5));
  ok(skillTreeRespecFee('abc') === 800, '非数次数回落第一档', skillTreeRespecFee('abc'));
  ok(skillTreeRespecFee(undefined) === 800, '缺省次数回落第一档');
}

/* ============================================================
 * 五、脏档不崩
 *
 * normalizeDoc 只保证 d.skills 是个对象，**没有逐条整形**。
 * 一条 `skills: { fireball: null }` 就能让 skillPoints() 在
 * 「读档后第一次点技能」时抛 TypeError —— 玩家看到的是整个面板白掉。
 * ============================================================ */
console.log('\n五、脏档不崩');
{
  const save = readSrc('src/core/save.js');
  ok(/d\.skills\s*=\s*this\._skillLedger\(/.test(save) || /_skillLedger\(/.test(save),
    'normalizeDoc 逐条整形技能账本（不是只判 _obj）');

  /* 真跑一遍：脏条目必须被收敛成 { lv, v } 而不是原样留着 */
  const ctx = loadData();
  const Save = vm.runInContext('SaveManager', ctx);
  const dirty = {
    v: Save.SCHEMA,
    meta: { slot: 1, name: '脏', cls: 'warrior', level: 40, playTime: 0 },
    char: { cls: 'warrior', name: '脏', level: 40, gold: 0 },
    skills: {
      fireball: null,
      frostnova: 5,
      meteor: { lv: 'abc' },
      swordrain: { lv: 99, v: 7, f: -1, m: 9, el: 'nope', el2: 3 },
      __junk__: 'x'
    }
  };
  const out = Save.normalizeDoc(dirty, 1).doc;
  ok(out && out.skills, '脏档能整形出来', out && typeof out.skills);
  const sk = out.skills || {};
  ok(!('__junk__' in sk), '认不出的技能 id 被剔掉');
  ok(sk.fireball && typeof sk.fireball === 'object', 'null 条目被收敛成对象', sk.fireball);
  ok(!sk.frostnova || typeof sk.frostnova === 'object', '数字条目被收敛成对象', sk.frostnova);
  ok(sk.meteor && sk.meteor.lv === 1, 'lv 非数 → 回落 1', sk.meteor && sk.meteor.lv);
  ok(sk.swordrain && sk.swordrain.lv === 10, 'lv 越界 → 夹到 SKILL_LV_MAX', sk.swordrain && sk.swordrain.lv);
  ok(sk.swordrain && (sk.swordrain.f === undefined || (sk.swordrain.f >= 0 && sk.swordrain.f <= 2)),
    'f 越界 → 丢弃或夹回 0~2', sk.swordrain && sk.swordrain.f);
  ok(sk.swordrain && (sk.swordrain.m === undefined || (sk.swordrain.m >= 0 && sk.swordrain.m <= 2)),
    'm 越界 → 丢弃或夹回 0~2', sk.swordrain && sk.swordrain.m);
  ok(sk.swordrain && sk.swordrain.el === undefined, '认不出的元素键被丢掉', sk.swordrain && sk.swordrain.el);
  ok(sk.swordrain && sk.swordrain.el2 === undefined, '副元素非字符串 → 丢掉', sk.swordrain && sk.swordrain.el2);

  /* 整形之后 skillPoints 必须能算（不抛） */
  ok(typeof Save.normalizeDoc({ v: Save.SCHEMA, meta: { slot: 1 }, char: {} }, 1).doc === 'object',
    '缺 char 的档也不崩');
}

/* ============================================================
 * 六、老档补字段：读进来之后不该有 undefined
 * ============================================================ */
console.log('\n六、读档后字段齐不齐');
{
  const ctx = loadData();
  const Save = vm.runInContext('SaveManager', ctx);
  const bare = {
    v: Save.SCHEMA,
    meta: { slot: 1, name: '老', cls: 'taoist', level: 30 },
    char: { cls: 'taoist', name: '老', level: 30, gold: 500 },
    world: { mapId: 'village' }
    /* 故意不给 skills / skillbar / passives / treeRespecCount / barSet */
  };
  const flat = Save.unpack(Save.normalizeDoc(bare, 1).doc);
  const need = ['skills', 'skillbar', 'skillbar2', 'barSet', 'passives', 'treeRespecCount'];
  for (const k of need) {
    ok(flat[k] !== undefined, '读档后 ' + k + ' 有值（不是 undefined）', flat[k]);
  }
  ok(Array.isArray(flat.skillbar) && flat.skillbar.length === 5, 'skillbar 补成 5 格', flat.skillbar);
  ok(flat.barSet === 0, 'barSet 缺省 0');
  ok(flat.treeRespecCount === 0, 'treeRespecCount 缺省 0');
  ok(flat.passives && typeof flat.passives === 'object', 'passives 缺省空对象');
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P6 回归契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
