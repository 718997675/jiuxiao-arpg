/* ============================================================
 * 职业包注册表（技能系统重构 P0）
 *
 * 为什么要有这个文件：
 *   以前加一个职业，要改六处 —— data-core 的 CLASSES、data-skills 的
 *   SKILL_ORDER 与每个技能、data-talents 的 TALENTS、items.js 的
 *   开局武器名、game.js 与 items.js 里写死的 ['warrior','mage','taoist']
 *   掉落池、ui.js 说明页写死的三行属性表。漏一处就是隐形 bug
 *   （最典型的是掉落池：新职业永远打不到自己用的武器）。
 *
 *   现在改成：所有职业相关的东西收进一个 pack，registerClass() 一次性
 *   铺进那五张既有表。**现有代码一行不用改**，因为它读的还是那五张表。
 *
 * 设计原则（重要，别绕开）：
 *   1. 只「补缺」不「覆盖」—— 已存在的 CLASSES[id] / SKILL_ORDER[id]
 *      保持原样引用，三个老职业因此不需要复制任何数据。
 *   2. 注册不做重活（不建模型、不读装备），只写数据表；
 *      需要跨模块校验的（比如开局装备能不能生成）放到 classPackValidate，
 *      由测试或 F12 主动调，避免加载顺序踩坑。
 *   3. 失败不抛异常 —— 返回 null 并把原因记进 CLASS_PACK_ERR，
 *      单个坏 pack 不该让整个游戏起不来。
 * ============================================================ */

const CLASS_PACK = {};          // id -> pack
const CLASS_PACK_ORDER = [];    // 注册顺序（建角界面 / 图鉴 / 掉落池都按它）
const CLASS_PACK_ERR = [];      // 注册失败记录：{ id, errors }

/* 一个职业至少要有这些字段，缺了面板会显示 undefined */
const PACK_META_REQ = [
  'name', 'title', 'res', 'weights',
  'base', 'growth', 'atkName', 'mainStat',
  'baseAtk', 'baseHp', 'baseMp'
];

/* 注册一个职业。
 * pack = {
 *   id,                                  // 唯一键，存档里的 state.cls 就是它
 *   meta: { ...CLASSES 形状的字段 },      // 基础数值 / 四维权重 / 配色
 *   skills: ['id1','id2'],               // 主动技能清单（顺序 = 技能栏顺序）
 *   skillDefs: [ { id, name, ... } ],    // 技能定义（老职业已存在，可不传）
 *   icons: { skillId: '<path .../>' },   // 技能图标 SVG 内容（老职业已存在，可不传）
 *   trees: [ { id, name, nodes:[...] } ] // 天赋树（老职业已存在，可不传）
 *   weaponBases: [ [ {name,dmg,speed,shape}, … ], … ]  // 按档位的武器基底
 *   offhandBases: [ [ [名, 护甲, 固有键, 数值], … ], … ] // 按档位的副手基底
 *   start: { weaponName: '新兵铁剑' },    // 开局装备的显示名
 *   helpRow: '一句话说明'                  // 说明页用（可选）
 * }
 * 返回 pack（含补齐后的 skills / trees），失败返回 null。 */
function registerClass(pack) {
  const errs = [];
  if (!pack || !pack.id) {
    CLASS_PACK_ERR.push({ id: (pack && pack.id) || '?', errors: ['缺少 id'] });
    return null;
  }
  const id = pack.id;

  /* ---- 1. 元数据：只补缺，老职业保持原对象引用 ---- */
  const metaSrc = pack.meta || {};
  if (!CLASSES[id]) {
    const m = { key: id };
    for (const k in metaSrc) m[k] = metaSrc[k];
    CLASSES[id] = m;
  }
  const meta = CLASSES[id];
  if (!meta.key) meta.key = id;

  /* ---- 2. 技能清单 ---- */
  const skills = (pack.skills || []).slice();
  if (skills.length && !SKILL_ORDER[id]) SKILL_ORDER[id] = skills;

  /* ---- 3. 技能定义（新职业在这里带自己的技能，不用改 data-skills.js） ---- */
  for (const def of (pack.skillDefs || [])) {
    if (!def || !def.id) { errs.push('skillDefs 里有一项没写 id'); continue; }
    if (!SKILLS[def.id]) {
      const d = { cls: id };
      for (const k in def) d[k] = def[k];
      SKILLS[def.id] = d;
    }
  }

  /* ---- 4. 图标：必须每个技能一枚，不允许靠 type 兜底 ---- */
  for (const k in (pack.icons || {})) {
    if (!SKILL_ICONS[k]) SKILL_ICONS[k] = pack.icons[k];
  }

  /* ---- 5. 天赋树 ---- */
  const trees = (pack.trees || []).slice();
  if (trees.length && !TALENTS[id]) TALENTS[id] = trees;

  /* ---- 5b. 天赋节点扁平表 ----
   * TALENT_NODES 是 data-talents.js 加载时一次性铺好的「id → 节点」表，
   * 天赋画布、解锁等级、投点 / 退点校验、装备关联全读它。
   * 只把树写进 TALENTS[id] 是不够的——节点会「看得见但点不动」：
   * talentNodeOf 返回 null，allocTalent 直接失败。新职业必须同时摊进这张表。 */
  if (typeof TALENT_NODES !== 'undefined') {
    for (const tree of (TALENTS[id] || [])) {
      for (const n of (tree.nodes || [])) {
        if (!n.id || TALENT_NODES[n.id]) continue;
        /* 与 data-talents.js 同一套解锁推算：节点自带 unlock 优先，
         * 否则按 id 后缀（s1 / m2 / L）查 NODE_UNLOCK */
        const slot = n.id.slice(n.id.indexOf('_') + 1);
        const unlock = n.unlock != null ? n.unlock
          : ((typeof NODE_UNLOCK !== 'undefined' && NODE_UNLOCK[slot]) || 1);
        TALENT_NODES[n.id] = {
          node: n, tree: tree.id, treeName: tree.name, color: tree.color,
          cls: id, unlock, hidden: !!n.hidden
        };
      }
    }
  }

  /* ---- 5c. 技能树的三张表（P4 补）----
   * 以前 tags / branches / passives / layout 只服务三个老职业，手写在
   * data-skill-tree.js 里。新职业如果只注册 meta + skills，会得到
   * 「能建角、能放技能，但技能树上每个节点光秃秃」的结果 ——
   * 三层分支（精研 / 取向 / 变体）整个缺席，可测试却全是绿的。
   * 所以注册时一并铺进 SKILL_TREE，新职业只要在 pack 里写这四段。 */
  if (typeof SKILL_TREE !== 'undefined') {
    for (const k in (pack.tags || {})) {
      if (!SKILL_TREE.tags[k]) SKILL_TREE.tags[k] = pack.tags[k];
    }
    for (const k in (pack.branches || {})) {
      if (!SKILL_TREE.branches[k]) SKILL_TREE.branches[k] = pack.branches[k];
    }
    for (const k in (pack.passives || {})) {
      if (!SKILL_TREE.passives[k]) SKILL_TREE.passives[k] = pack.passives[k];
    }
    if (pack.layout && !SKILL_TREE.layout[id]) SKILL_TREE.layout[id] = pack.layout;
  }

  /* ---- 6. 装备基底 ----
   * 武器 / 副手基底按职业查表（rollItem 里 WEAPON_BASES[cls].length 会直接崩），
   * 所以新职业要么自带一份，要么走下面的兜底。握持等级顺手一起算好。 */
  if (pack.weaponBases && typeof WEAPON_BASES !== 'undefined' && !WEAPON_BASES[id]) {
    WEAPON_BASES[id] = pack.weaponBases;
    if (typeof WEAPON_HANDS !== 'undefined') WEAPON_HANDS[id] = pack.weaponBases.map(tier => {
      const avg = tier.map(b => (b.dmg[0] + b.dmg[1]) / 2);
      const order = tier.map((_, i) => i).sort((a, b) => avg[a] - avg[b]);
      const h = new Array(tier.length);
      if (order[0] !== undefined) h[order[0]] = 'dual';
      if (order[1] !== undefined) h[order[1]] = 'one';
      if (order[2] !== undefined) h[order[2]] = 'two';
      return h;
    });
  }
  if (pack.offhandBases && typeof OFFHAND_BASES !== 'undefined' && !OFFHAND_BASES[id]) {
    OFFHAND_BASES[id] = pack.offhandBases;
  }

  const p = {
    id,
    meta,
    skills: SKILL_ORDER[id] || skills,
    trees: TALENTS[id] || trees,
    start: pack.start || {},
    helpRow: pack.helpRow || ''
  };
  CLASS_PACK[id] = p;
  if (CLASS_PACK_ORDER.indexOf(id) < 0) CLASS_PACK_ORDER.push(id);

  if (errs.length) CLASS_PACK_ERR.push({ id, errors: errs });
  return p;
}

function classPackOf(id) { return CLASS_PACK[id] || null; }
function classPackHas(id) { return !!CLASS_PACK[id]; }
function classPackList() { return CLASS_PACK_ORDER.map(id => CLASS_PACK[id]); }

/* 所有已注册职业 id —— 掉落池 / 图鉴排序 / 建角界面统一读这个。
 * 返回副本：调用方 PICK() 里排序不会被污染。 */
function classPackIds() { return CLASS_PACK_ORDER.slice(); }

/* 开局武器显示名（items.js makeStarterSet 用）。
 * 老职业原本写在 items.js 里的映射表，现在搬进各自的 pack。 */
function classPackStarterWeaponName(id) {
  const p = CLASS_PACK[id];
  return (p && p.start && p.start.weaponName) || '铁剑';
}

/* ---------------- 校验 ----------------
 * 返回 { id, ok, errors, warnings }。
 * 与注册分开：注册只管写表，校验要等装备 / 模型那些模块都加载完才好做。 */
function classPackValidate(id) {
  const errors = [], warnings = [];
  const p = CLASS_PACK[id];
  if (!p) return { id, ok: false, errors: ['未注册'], warnings };

  /* --- 元数据 --- */
  const m = p.meta || {};
  for (const k of PACK_META_REQ) {
    if (m[k] === undefined || m[k] === null || m[k] === '') errors.push('meta 缺 ' + k);
  }
  const w = m.weights || {};
  let wN = 0;
  for (const k of (typeof ATTR_KEYS !== 'undefined' ? ATTR_KEYS : ['str', 'agi', 'vit', 'int'])) {
    if (w[k]) wN++;
  }
  if (wN < 3) errors.push('weights 只覆盖 ' + wN + ' 项根基（至少要 3 项，否则四项里有一项点了没反应）');

  /* --- 技能 --- */
  /* 校验读「实时表」而不是注册时捕获的那份：万一有人整体替换了
   * TALENTS[id] / SKILL_ORDER[id]，校验要能看见新内容，否则永远是绿的 */
  const liveSkills = (typeof SKILL_ORDER !== 'undefined' && SKILL_ORDER[id]) ? SKILL_ORDER[id] : (p.skills || []);
  const liveTrees = (typeof TALENTS !== 'undefined' && TALENTS[id]) ? TALENTS[id] : (p.trees || []);
  if (!liveSkills || !liveSkills.length) errors.push('没有任何主动技能');
  const seen = {};
  for (const sid of (liveSkills || [])) {
    if (seen[sid]) errors.push('技能 ' + sid + ' 在清单里重复');
    seen[sid] = 1;
    const sk = (typeof SKILLS !== 'undefined') ? SKILLS[sid] : null;
    if (!sk) { errors.push('技能 ' + sid + ' 没有定义'); continue; }
    if (sk.cls && sk.cls !== id) errors.push('技能 ' + sid + ' 的 cls 是 ' + sk.cls + '，与职业 ' + id + ' 不符');
    /* 硬规矩：每枚技能都要有自己的图标。靠 type 兜底会让 12 个技能长一样 */
    if (typeof SKILL_ICONS !== 'undefined' && !SKILL_ICONS[sid]) {
      errors.push('技能 ' + sid + ' 缺专属图标（SKILL_ICONS 里没有）');
    }
    if (!sk.tree) warnings.push('技能 ' + sid + ' 没写 tree，技能树不知道挂哪一系');
    if (typeof sk.unlock !== 'number' || sk.unlock < 1) errors.push('技能 ' + sid + ' 的 unlock 不是正整数');
  }

  /* --- 技能树：标签 / 三层分支 / 骨架（P4 的三条硬规矩）---
   * 这三条是「新职业只写数据」能成立的前提：漏一条，职业能建、技能能放，
   * 但技能树上是残的 —— 而这种残最容易在「能建角」的绿灯里被忽略。 */
  const tagKinds = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.tagKinds) ? SKILL_TREE.tagKinds : {};
  const tagKnown = t => {
    for (const kind in tagKinds) if (tagKinds[kind].list.indexOf(t) >= 0) return true;
    return false;
  };
  const treeTags = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.tags) ? SKILL_TREE.tags : {};
  const treeBranches = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.branches) ? SKILL_TREE.branches : {};
  const treePassives = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.passives) ? SKILL_TREE.passives : {};
  for (const sid of (liveSkills || [])) {
    if (typeof SKILLS === 'undefined' || !SKILLS[sid]) continue;

    /* 硬规矩 1：标签必须齐、且登记过 */
    const tg = treeTags[sid] || [];
    if (!tg.length) {
      errors.push('技能 ' + sid + ' 没有标签（装备词缀按标签生效，没标签等于吃不到任何词缀）');
    }
    for (const t of tg) {
      if (!tagKnown(t)) errors.push('技能 ' + sid + ' 的标签 ' + t + ' 没在 tagKinds 里登记');
    }

    /* 硬规矩 2：三层分支一条不少，且只用登记过的通道 */
    const br = treeBranches[sid];
    if (!br) {
      errors.push('技能 ' + sid + ' 没有三层分支（技能树上只有一个光秃秃的节点）');
      continue;
    }
    if (!br.core) errors.push('技能 ' + sid + ' 缺精研（core）');
    if ((br.pick || []).length !== 2) errors.push('技能 ' + sid + ' 的取向不是 2 条（' + (br.pick || []).length + '）');
    if ((br.form || []).length !== 3) errors.push('技能 ' + sid + ' 的变体不是 3 条（' + (br.form || []).length + '）');
    const rows = [br.core].concat(br.pick || [], br.form || []);
    for (const row of rows) {
      if (!row || !row[0]) continue;
      const opt = row[2] || {};
      for (const k in (opt.mods || {})) {
        if (SKILL_TREE.modKeys.indexOf(k) < 0) {
          errors.push('技能 ' + sid + ' 分支「' + row[0] + '」用了未知数值通道 ' + k);
        }
      }
      for (const k in (opt.beh || {})) {
        if (SKILL_TREE.behKeys.indexOf(k) < 0) {
          errors.push('技能 ' + sid + ' 分支「' + row[0] + '」用了未登记的行为键 ' + k);
        }
      }
    }
  }

  /* 硬规矩 3：骨架自洽 —— 坐标由 layout 推导，所以查的是「谁在树里、谁重复、谁丢了」 */
  const lay = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.layout) ? SKILL_TREE.layout[id] : null;
  if (!lay || !lay.length) {
    errors.push('没有技能树骨架（layout），树上画不出任何节点');
  } else {
    const inTree = {}, dup = [];
    for (const tree of lay) {
      const tn = tree.name || '?';
      if (!tree.name) errors.push('有一棵技能树没写 name');
      if (!tree.spine) errors.push('『' + tn + '』没有入门主动（spine）');
      if (tree.spine) {
        if (inTree[tree.spine]) dup.push(tree.spine);
        inTree[tree.spine] = 1;
      }
      let keyN = 0;
      for (const f of (tree.forks || [])) {
        if (!f.active) errors.push('『' + tn + '』有岔口没写主动一侧');
        if (!f.passive) errors.push('『' + tn + '』有岔口没写被动一侧');
        if (f.active) {
          if (inTree[f.active]) dup.push(f.active);
          inTree[f.active] = 1;
        }
        if (f.passive && !treePassives[f.passive]) errors.push('岔口的被动 ' + f.passive + ' 没有定义');
        if (f.passive && treePassives[f.passive] && treePassives[f.passive].key) keyN++;
      }
      /* 关键被动每系最多 1 个 —— 多了就「限 1 点」这条规则失去意义 */
      if (keyN > 1) errors.push('『' + tn + '』有 ' + keyN + ' 个关键被动（每系最多 1 个）');
    }
    for (const sid of (liveSkills || [])) {
      if (!inTree[sid]) errors.push('技能 ' + sid + ' 不在技能树骨架上（树上找不到它，玩家点不到）');
    }
    if (dup.length) errors.push('技能在骨架里出现了不止一次：' + dup.join('/'));
  }

  /* --- 天赋树 --- */
  if (!liveTrees || !liveTrees.length) errors.push('没有任何天赋树');
  const nodeIds = {};
  for (const tree of (liveTrees || [])) {
    if (!tree.id || !tree.name) errors.push('有一棵天赋树没写 id 或 name');
    const poses = {};
    for (const n of (tree.nodes || [])) {
      if (!n.id) { errors.push('『' + (tree.name || tree.id) + '』里有节点没写 id'); continue; }
      const full = id + ':' + n.id;
      if (nodeIds[n.id]) errors.push('节点 id ' + n.id + ' 重复（跨系也算重复）');
      nodeIds[n.id] = 1;
      const pos = n.pos;
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        errors.push('节点 ' + n.id + ' 缺 pos 坐标');
      } else {
        if (pos.x < 0 || pos.x > 100 || pos.y < 0 || pos.y > 100) {
          errors.push('节点 ' + n.id + ' 的 pos 超出 0-100（当前 ' + pos.x + ',' + pos.y + '）');
        }
        /* 同系同坐标 = 面板上一个节点盖住另一个，玩家点不到下面那个 */
        const key = pos.x + ',' + pos.y;
        if (poses[key]) errors.push('节点 ' + n.id + ' 与 ' + poses[key] + ' 坐标重合（' + key + '）');
        else poses[key] = n.id;
      }
      if (!(n.max > 0)) warnings.push('节点 ' + n.id + ' 没写 max，按 1 级处理');
      /* 节点必须在扁平表里，否则画布画得出、点下去却「不存在」 */
      if (typeof TALENT_NODES !== 'undefined' && !TALENT_NODES[n.id]) {
        errors.push('节点 ' + n.id + ' 没进 TALENT_NODES（界面上点不动）');
      }
    }
  }
  /* 前置必须指向本职业自己的节点（跨职业的 req 永远点不亮） */
  for (const tree of (liveTrees || [])) {
    for (const n of (tree.nodes || [])) {
      for (const r of (n.req || [])) {
        if (!nodeIds[r]) errors.push('节点 ' + n.id + ' 的前置 ' + r + ' 在本职业里不存在');
      }
    }
  }

  /* --- 装备基底 --- */
  if (typeof WEAPON_BASES !== 'undefined' && !WEAPON_BASES[id]) {
    errors.push('WEAPON_BASES 里没有该职业的武器基底（会掉不出武器，rollItem 也会崩）');
  }
  if (typeof WEAPON_HANDS !== 'undefined' && !WEAPON_HANDS[id]) {
    errors.push('WEAPON_HANDS 里没有该职业的握持数据');
  }

  /* --- 开局装备（要 items.js 已加载才好验） --- */
  if (typeof makeStarterSet === 'function') {
    try {
      const set = makeStarterSet(id);
      if (!set || !set.weapon) errors.push('开局装备生成失败（makeStarterSet 没给出武器）');
      else if (!set.weapon.baseDmg) warnings.push('开局武器没有 baseDmg，1 级打不出伤害');
    } catch (e) {
      errors.push('开局装备抛异常：' + e.message);
    }
  }

  return { id, ok: !errors.length, errors, warnings };
}

function classPackValidateAll() {
  return classPackIds().map(id => classPackValidate(id));
}

/* ============================================================
 * 内置三职业注册
 *
 * 这里全部是「引用」：meta 指 CLASSES 里已有的对象，skills / trees 指
 * data-skills.js / data-talents.js 里已有的数组。不复制、不改写，
 * 所以这个文件加进来对现有玩法零影响。
 * ============================================================ */

registerClass({
  id: 'warrior',
  meta: CLASSES.warrior,
  skills: SKILL_ORDER.warrior,
  trees: TALENTS.warrior,
  start: { weaponName: '新兵铁剑' },
  helpRow: '近身缠斗，力量既是攻击也是暴击伤害，靠怒气续航。'
});

registerClass({
  id: 'mage',
  meta: CLASSES.mage,
  skills: SKILL_ORDER.mage,
  trees: TALENTS.mage,
  start: { weaponName: '旧桃木杖' },
  helpRow: '远程术法，灵力管攻击、灵力上限与冷却，怕被贴脸。'
});

registerClass({
  id: 'taoist',
  meta: CLASSES.taoist,
  skills: SKILL_ORDER.taoist,
  trees: TALENTS.taoist,
  start: { weaponName: '师父的桃木剑' },
  helpRow: '符箓与召唤，四项根基都不废，持久战最强。'
});
