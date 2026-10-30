/* ============================================================
 * 元素反应表（P3a）
 *
 * 方案 §6.2 定了 10 组反应，前提是「元素注入」—— 每个技能位可以塞 1~2 种元素。
 * 那套注入系统还没做（P3b），但**反应表本身不需要它**：
 *
 *   触发口径 = 「目标身上带着 A 元素的状态」+「这一次命中带的是 B 元素」
 *
 * 这比「一个技能同时带两种元素」更早能玩，也更符合实际打法：法师先一记冰环
 * 把怪冻住，再补一发火球 —— 玩家心里那就是「火碰冰」，不该等注入系统上线。
 * 将来注入做完，只是多了一个触发源，这张表原样复用（`elemReactionOn` 收 hitElem）。
 *
 * 圣（sigil）那 4 组**故意没做**：引擎里 sigil 只是一个伤害类型（`sigilDmg`），
 * 没有任何对应的状态位；硬做就得先新造一个「圣印」debuff —— 那是新机制，
 * 不属于「元素反应」这一步。台账里记成「6/10，圣系待 P3b」。
 * ============================================================ */

/* 元素定义：key 必须与 `data-monsters.js` 的 resist 键、`items.js` 的
 * ELEM_DMG 键**同源**（phys / fire / ice / lightning / poison / sigil）。
 * 颜色取 SKILL-VFX-PLAN §8 的元素语言层。 */
const ELEM_DEFS = [
  { key: 'phys', name: '物理', color: 0xffffff, glyph: '物' },
  { key: 'fire', name: '火', color: 0xff7a30, glyph: '火' },
  { key: 'ice', name: '冰', color: 0x8ad8ff, glyph: '冰' },
  { key: 'lightning', name: '雷', color: 0x9ad8ff, glyph: '雷' },
  { key: 'poison', name: '毒', color: 0x9adf60, glyph: '毒' },
  { key: 'sigil', name: '圣', color: 0xfff2b0, glyph: '圣' }
];

function elemDef(key) {
  return ELEM_DEFS.find(d => d.key === key) || null;
}

/* ============================================================
 * 状态位探针：目标身上「有没有这个元素留下的痕迹」
 *
 * 全部读**已经在用的字段**（不是为反应新造的）：
 *   火 → e.dotElem === 'fire' 且有跳伤（applySkillDot / 火墙 / 雷云同一条管线）
 *   冰 → e.slowT > 0 且 e.slow > 0（玄冰套 deepfreeze 读的就是这两个）
 *   雷 → e.stun > 0 或 e.vuln/vulnT（法相雷相挂的麻痹 + 易伤）
 *   毒 → e.poisonT > 0（burnChance / 天师套读的就是它），或毒 dot 还在跳
 * 圣没有状态位 —— 见文件头。
 * ============================================================ */
const ELEM_STATUS = {
  fire: e => (e.dotT || 0) > 0 && e.dotElem === 'fire',
  ice: e => (e.slowT || 0) > 0 && (e.slow || 0) > 0,
  lightning: e => (e.stun || 0) > 0 || ((e.vulnT || 0) > 0 && (e.vuln || 0) > 0),
  poison: e => (e.poisonT || 0) > 0 || ((e.dotT || 0) > 0 && e.dotElem === 'poison')
};

function elemStatusOn(e, key) {
  const f = ELEM_STATUS[key];
  return !!(f && e && f(e));
}

/* 目标身上现存的元素状态（顺序固定 = ELEM_STATUS 的键序，反应优先级可预测） */
function elemStatusList(e) {
  const out = [];
  for (const k in ELEM_STATUS) if (elemStatusOn(e, k)) out.push(k);
  return out;
}

/* ============================================================
 * 反应表（6 组）
 *
 * `dmg` = 按**触发那一下的最终伤害**的百分比结算（不是按 atk）——
 * 这样反应在任何等级都不会变成一个「固定小数字」而失去意义。
 * `chain` = 连锁几个目标；`shred` / `dotMul` 直接写目标身上已有的字段。
 * ============================================================ */
const ELEM_REACTIONS = [
  {
    key: 'steam', a: 'fire', b: 'ice', name: '蒸汽爆裂',
    color: 0xe8f6ff, color2: 0xbfe6ff,
    dmg: 35, radius: 2.6, knock: 1.2,
    desc: '命中点炸开一圈汽浪（35% 伤害）+ 击退'
  },
  {
    key: 'plasma', a: 'fire', b: 'lightning', name: '等离子',
    color: 0xd0a0ff, color2: 0xffffff,
    dmg: 40, radius: 2.2,
    desc: '追加一发必暴的雷伤（40%）+ 电弧'
  },
  {
    key: 'burnpoison', a: 'fire', b: 'poison', name: '焚毒',
    color: 0x9adf60, color2: 0xff7a30,
    dotMul: 1.5,
    desc: '目标身上的持续伤害 ×1.5（本轮跳完为止）'
  },
  {
    key: 'frozele', a: 'ice', b: 'lightning', name: '感电冻结',
    color: 0x9ae8ff, color2: 0xffffff,
    freezeMul: 1.5, chain: 1, dmg: 25,
    desc: '冻结时长 ×1.5 + 连锁 1 个目标（25%）'
  },
  {
    key: 'frostrot', a: 'ice', b: 'poison', name: '腐霜',
    color: 0xd8ffe0, color2: 0x9adf60,
    shred: 20, dur: 5,
    desc: '减防 20%（5 秒）'
  },
  {
    key: 'corrochain', a: 'lightning', b: 'poison', name: '腐蚀链',
    color: 0x9adf60, color2: 0x9ad8ff,
    chain: 2, dmg: 25,
    desc: '绿电弧连锁 2 个目标（各 25%）'
  }
];

/* 内建冷却（方案 §14.3 #12）：全局 0.5 秒，同目标同反应 2 秒。
 * 没有它的话「满屏特效 + 伤害翻倍」是必然结果 —— 一次 AoE 打 8 只怪就是 8 次反应。 */
const ELEM_REACT_ICD = { global: 0.5, sameTarget: 2 };

/* 两种元素能不能反应（顺序无关）。phys / sigil / 同元素 一律返回 null */
function elemReaction(a, b) {
  if (!a || !b || a === b) return null;
  for (const r of ELEM_REACTIONS) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
  }
  return null;
}

/* 这一次命中（hitElem）打在有状态的（e）身上，会不会触发反应 */
function elemReactionOn(hitElem, e) {
  if (!hitElem || hitElem === 'phys' || hitElem === 'none') return null;
  for (const s of elemStatusList(e)) {
    if (s === hitElem) continue;
    const r = elemReaction(hitElem, s);
    if (r) return r;
  }
  return null;
}

/* ============================================================
 * [P3c] 元素增伤**两条通道，叠乘**
 *
 *   ELEM_AFFIX     elemDmg —— 全元素通用。来源：随机词缀（统一后的
 *                            「元素伤害 +X%」）、试炼祝福「五行归一」。
 *   ELEM_AFFIX_EX  fireDmg / iceDmg / lightningDmg / poisonDmg / sigilDmg
 *                            —— 元素专属。来源：被动（高压 / 毒经 / 符力）、
 *                            符文之语天赋（雷引 / 炎心）、命格固有。
 *                            **不进随机词缀池。**
 *
 * 为什么留两条：随机词缀必须跟着人走（元素注入能随时改元素，四族词缀等于
 * 「换个注入就废一身装」），但「雷霆之语 → 雷伤」这种专属来源的元素身份是设计，
 * 统一掉就只剩一个空名字。两条通道都是乘区，不会互相挤占。
 *
 * [P3b] 这张表从 damageEnemy 里提出来：元素注入要按**段**取词条（原伤害一段、
 * 附加一段），两处必须读同一张表，否则「面板说火伤 +20%、打出去按冰伤算」这种
 * 口径分裂迟早出现。所以合并只留 `elemAffixMul` 一个出口。
 * ============================================================ */
const ELEM_AFFIX = {
  fire: 'elemDmg', ice: 'elemDmg', lightning: 'elemDmg',
  poison: 'elemDmg', sigil: 'elemDmg'
};
const ELEM_AFFIX_EX = {
  fire: 'fireDmg', ice: 'iceDmg', lightning: 'lightningDmg',
  poison: 'poisonDmg', sigil: 'sigilDmg'
};

/* 某个元素拿到的总增伤倍率（通用 × 专属）。物理 / 无元素恒 1 */
function elemAffixMul(st, elem) {
  if (!st || !elem || elem === 'phys' || elem === 'none') return 1;
  let m = 1;
  const a = ELEM_AFFIX[elem];
  if (a && st[a]) m *= 1 + st[a] / 100;
  const b = ELEM_AFFIX_EX[elem];
  if (b && st[b]) m *= 1 + st[b] / 100;
  return m;
}

/* ============================================================
 * 元素注入（P3b 单元素 / P3d 双元素）
 *
 * 方案 §6.1：每个技能位可注入 1~2 种元素，伤害**附加、不转换**
 * （原伤害保留，元素在原伤害上再附加 30%~50%）。
 *
 * 四条口径，都是刻意选的：
 *   1. **只有 ①②③⑤ 能注入**（`SKILL_ARCHETYPE.slots[].elem`，④ 是增益槽）；
 *   2. **附加比例跟技能有效等级走**（10 级 30% → 20 级 50%）——
 *      方案里说的「注入等级」在本仓库不存在，硬造一个新等级就是新机制；
 *      精进层本来就是词条层，挂在这里最自然，也不用多存一个字段；
 *   3. **圣不参与**：`sigil` 只是一个伤害类型，没有状态位、没有反应，
 *      注进去除了改抗性什么都没有 —— 等 P3b 补上圣印状态位再说；
 *   4. **双元素不额外加总量**：总量仍由 `skillInjectPct` 决定，
 *      主副按 `split` 拆（50% → 35% + 15%）。双元素的收益在「多一种元素
 *      能打反应、不被单一抗性吃满」，不在数值更高 —— 再加一份总量就成了
 *      「双元素 = 无脑更强」，单元素那条路直接作废。
 * ============================================================ */
const SKILL_INJECT = {
  at: 20,                                        // 角色等级门槛（前期不动数值）
  subAt: 40,                                     // 第二元素门槛（方案 §6.1：40 级解锁混搭）
  elems: ['fire', 'ice', 'lightning', 'poison'], // 圣不在列，见上
  minPct: 30,                                    // 有效等级 10 及以下
  maxPct: 50,                                    // 有效等级 20
  /* 双元素时附加量的分配（方案 §6.1「主元素占 70%，副元素占 30%」）。
   * 方案表里写的是「各按 15%~25% 附加」，那是 50% 总量按 70/30 拆出来的
   * 近似描述（35 / 15）。实际按**比例**拆而不是按绝对值夹取，
   * 否则总量一变，副元素就卡在 15% 不动，升级对它毫无意义。 */
  split: { main: 70, sub: 30 }
};

/* 注入能附加多少（整数百分比，10 级 30% → 20 级 50%） */
function skillInjectPct(lv) {
  const T = SKILL_TIERS;
  const n = Math.max(T.baseMax, Math.min(T.cap, Math.round(Number(lv) || 1)));
  const k = (n - T.baseMax) / Math.max(1, T.cap - T.baseMax);
  return Math.round(SKILL_INJECT.minPct + (SKILL_INJECT.maxPct - SKILL_INJECT.minPct) * k);
}

/* 把总量拆成主 / 副两段（整数百分比，两段相加**恒等于**总量） */
function skillInjectSplit(pct) {
  const total = Math.round(Number(pct) || 0);
  const main = Math.round(total * SKILL_INJECT.split.main / 100);
  return { total, main, sub: total - main };
}

/* 某个技能属于哪个功能位（秘技 / 不在 5 位体系里的返回 null） */
function skillSlotOf(id) {
  if (typeof SKILL_ARCHETYPE === 'undefined' || !SKILL_ARCHETYPE.classes) return null;
  for (const cls in SKILL_ARCHETYPE.classes) {
    const pack = SKILL_ARCHETYPE.classes[cls];
    for (const s of (pack.slots || [])) {
      if ((s.inherit || []).indexOf(id) >= 0) {
        const meta = (SKILL_ARCHETYPE.slots || []).find(m => m.no === s.no) || {};
        return { cls: cls, no: s.no, elem: !!meta.elem, name: meta.name || '' };
      }
    }
  }
  return null;
}

/* 这个技能位能不能注入元素（④ 增益槽恒为 false） */
function skillCanInject(id) {
  const s = skillSlotOf(id);
  return !!(s && s.elem);
}
