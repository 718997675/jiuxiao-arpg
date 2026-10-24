/* ============================================================
 * 数据层 · 唯一装备（传世）
 *
 * 设计参考暗黑系列的 Unique：每一件都有固定名字与固定词条区间，
 * 词条、特性（Trait）、技能效果（Skill）三件套，掉落可以重复，
 * 每次掉落都是一件新实例（roll 出不同的词条数值），不存在「唯一拥有」限制。
 *
 * 【与八阶体系的关系】[UNIQUE-1]
 *   八阶（凡兵 → 精铁 → 玄铁 → 地煞 → 天罡 → 仙品 → 神兵 → 太初）是「基底」，
 *   讲的是同一件东西被反复锻造到多好；传世是「名器」，天生就是这个样子，
 *   没有阶、不参与升阶（item.tierless = true），强度靠三样东西：
 *     ① 固定词条区间（比同等级八阶装备高一档）
 *     ② 独有特性（每件一个，全表不重复）
 *     ③ 专属技能效果（要么授予一个本来不会的技能，要么强化某个已有技能）
 *
 * 【特性唯一性】[UNIQUE-3]
 *   UNIQUE_TRAITS 里每一条特性只属于一件传世，全表不出现第二次。
 *   dev/test-unique.js 会扫描断言：没有重复、没有孤儿、没有指向不存在的特性。
 *   想让某件传世更强，请给它新写一条特性，不要复用别人的。
 *
 * 字段：
 *   id      唯一标识，存档里存这个，不能改
 *   slot    部位（与 SLOTS 一致）
 *   cls     限定职业，省略表示三职业通用
 *   ilvl    最低掉落等级（怪物等级 >= ilvl 才进池）
 *   stats   固定词条，{ key: [min, max] }，key 必须存在于 STATS
 *   traits  特性 id 数组，对应 UNIQUE_TRAITS（互不重复）
 *   skill   技能效果（每件都有，二选一）：
 *             id 为具体技能 → 只强化该技能（dmg / cd / cost / radius / count / dur）
 *             id 为 '*'      → 通用强化，折算成 skillDmg / cdr / costReduce
 *             grant 为技能 id → 直接授予该技能（本来等级没到也能放，可跨职业）
 *             rank 为数字     → 该技能等级 +N（配合 id 使用）
 *             desc 用于提示框展示
 *   lore    风味文字
 * ============================================================ */

/* ---------------- 特性（Trait） ----------------
 * 全部走真实生效点：
 *   stats   → sumItemStats 汇总进面板
 *   flags   → aggregate 合并进 state.stats.flags，战斗里已有判定
 *   special → game.js 里单独实现的钩子（specials）
 * 不允许出现「提示框写着、战斗里没有」的假特性。
 *
 * 一条特性只归一件传世所有（见文件头 [UNIQUE-3]）。
 */
const UNIQUE_TRAITS = {
  /* —— 武器 —— */
  frostbite:   { name: '霜噬', desc: '命中时有 25% 几率使敌人减速 40%，持续 2 秒。', flags: ['frost'] },
  emberburst:  { name: '焚烬', desc: '击杀敌人时引发一次火焰爆炸。', flags: ['explode'] },
  firetrail:   { name: '燎原', desc: '火球命中后留下燃烧的火海。', flags: ['firetrail'] },
  stormcall:   { name: '雷罚', desc: '攻击有 18% 几率召下连锁天雷。', flags: ['thunder'] },

  /* —— 副手 —— */
  aegis:       { name: '玄冥壁', desc: '格挡率 +10%，受到的伤害 -6%。', stats: { block: 10, dmgReduce: 6 } },
  frostguard:  { name: '玄冰护体', desc: '受击时释放冰环，冻结周围敌人（4 秒冷却）。', flags: ['frostBurst'] },
  groupheal:   { name: '普度', desc: '回春咒额外附加护盾。', flags: ['groupheal'] },

  /* —— 头盔 —— */
  vampiric:    { name: '饮血', desc: '生命偷取 +6%。', stats: { lifesteal: 6 } },
  executioner: { name: '索命', desc: '对生命低于 30% 的敌人伤害 +45%。', stats: { executeDmg: 45 } },
  manaflow:    { name: '灵泉', desc: '灵力回复 +8/秒，技能消耗 -12%。', stats: { mpReg: 8, costReduce: 12 } },
  echo:        { name: '回响', desc: '施放技能有 15% 几率不进入冷却。', flags: ['echo'] },

  /* —— 战甲 —— */
  thorns:      { name: '反噬', desc: '受到攻击时反弹 30% 伤害。', stats: { thorns: 30 } },
  bloodrush:   { name: '血怒', desc: '击杀后攻速与移速提升，持续 4 秒。', flags: ['bloodRush'] },
  giant:       { name: '巨灵', desc: '生命上限 +12%。', stats: { hpPct: 12 } },
  huntmaster:  { name: '屠龙', desc: '对首领造成的伤害提高 40%。', flags: ['bossSlayer'] },

  /* —— 护肩 —— */
  bulwark:     { name: '金刚', desc: '护甲 +40，格挡 +8%。', stats: { def: 40, block: 8 } },
  firstblood:  { name: '破晓', desc: '对满血敌人伤害 +50%。', stats: { firstStrike: 50 } },
  wind:        { name: '疾风', desc: '移动速度 +8%。', stats: { moveSpd: 8 } },

  /* —— 护手 —— */
  soulharvest: { name: '收魂', desc: '击杀敌人回复 3% 最大生命。', special: 'soulharvest' },
  berserk:     { name: '狂战', desc: '击杀后进入 3 秒狂战：攻速 +25%。', special: 'berserk' },
  critburst:   { name: '裂魂', desc: '暴击时有 20% 几率引发一次小范围爆炸。', special: 'critburst' },

  /* —— 战靴 —— */
  cloudstep:   { name: '踏云', desc: '移动速度 +12%，闪避 +8%。', stats: { moveSpd: 12, dodge: 8 } },
  phoenix:     { name: '涅槃', desc: '受到致命伤害时以 35% 生命复活（60 秒冷却）。', special: 'phoenix' },

  /* —— 腰带 —— */
  fortune:     { name: '天缘', desc: '奇遇机缘 +30%。', stats: { magicFind: 30 } },
  undying:     { name: '幽息', desc: '生命上限 +10%，受到的伤害 -5%。', stats: { hpPct: 10, dmgReduce: 5 } },

  /* —— 项链 / 戒指 —— */
  seeker:      { name: '寻宝', desc: '符文与玄晶掉落提升，拾取范围扩大。', flags: ['seeker'] },
  samsara:     { name: '轮回', desc: '所有技能伤害 +10%，冷却 -6%。', stats: { skillDmg: 10, cdr: 6 } }
};

/* ---------------- 唯一装备目录 ----------------
 * 20 件：武器 3 / 副手 3 / 头盔 2 / 战甲 2 / 护肩 2 / 护手 2 / 战靴 2 / 腰带 2 / 项链 1 / 戒指 1
 * 每件至少带 1 条独占特性，且必定带一条技能效果：
 *   职业专属的 6 件（3 武器 + 3 副手）→ 强化本职业某个具体技能
 *   通用 14 件 → 授予跨职业秘技（grant）或全局强化（'*'）
 */
const UNIQUE_ITEMS = [
  /* ---------- 武器 ---------- */
  {
    id: 'frostmoon', name: '斩月·霜寒', slot: 'weapon', cls: 'warrior', ilvl: 8, shape: 'sword',
    lore: '刀锋过处，月色都凝成了霜。',
    stats: { crit: [6, 10], critDmg: [24, 40], atkPct: [8, 14] },
    traits: ['frostbite'],
    skill: { id: 'whirl', name: '霜月斩', dmg: 50, cd: 15, desc: '强化【旋风斩】：伤害 +50%，冷却 -15%。' }
  },
  {
    id: 'emberheaven', name: '焚天·赤霄', slot: 'weapon', cls: 'mage', ilvl: 8, shape: 'staff',
    lore: '一杖引落九天火，赤霄尽染不夜天。',
    stats: { atkPct: [12, 18], skillDmg: [15, 25], burnChance: [8, 14] },
    traits: ['emberburst', 'firetrail'],
    skill: { id: 'fireball', name: '赤霄焚天', dmg: 60, radius: 25, desc: '强化【火球术】：伤害 +60%，爆炸范围 +25%。' }
  },
  {
    id: 'taichu', name: '太初·无相', slot: 'weapon', cls: 'taoist', ilvl: 8, shape: 'taojian',
    lore: '无相之相，雷自符中生。',
    stats: { int: [8, 14], skillDmg: [15, 25], crit: [5, 9] },
    traits: ['stormcall'],
    skill: { id: 'talisman', name: '太初雷符', dmg: 55, desc: '强化【五雷符】：伤害 +55%。' }
  },

  /* ---------- 副手 ---------- */
  {
    id: 'zhenyue', name: '玄冥·镇岳盾', slot: 'offhand', cls: 'warrior', ilvl: 10,
    lore: '岳镇玄冥，百邪不侵。',
    stats: { def: [40, 70], block: [6, 12], dmgReduce: [3, 6] },
    traits: ['aegis'],
    skill: { id: 'warcry', name: '镇岳战吼', dmg: 30, cd: 20, desc: '强化【战意咆哮】：增益效果 +30%，冷却 -20%。' }
  },
  {
    id: 'taiyin', name: '太阴·玄冰珠', slot: 'offhand', cls: 'mage', ilvl: 10,
    lore: '珠中藏着一轮太阴，触之即寒。',
    stats: { mp: [40, 70], skillDmg: [12, 20], freezeChance: [5, 10] },
    traits: ['frostguard'],
    skill: { id: 'frostnova', name: '太阴霜爆', dmg: 45, radius: 20, desc: '强化【冰霜新星】：伤害 +45%，范围 +20%。' }
  },
  {
    id: 'bagua', name: '镇魂·八卦镜', slot: 'offhand', cls: 'taoist', ilvl: 10,
    lore: '镜照三魂，符安七魄。',
    stats: { mp: [35, 60], healBonus: [20, 35], allRes: [8, 14] },
    traits: ['groupheal'],
    skill: { id: 'heal', name: '普度回春', dmg: 50, cd: 15, desc: '强化【回春咒】：治疗量 +50%，冷却 -15%。' }
  },

  /* ---------- 头盔 ---------- */
  {
    id: 'jiuyou_veil', name: '九幽面纱', slot: 'helm', ilvl: 14,
    lore: '纱后没有面容，只有一双饮血的眼。',
    stats: { hp: [60, 110], crit: [4, 8], lifesteal: [3, 6] },
    traits: ['vampiric', 'executioner'],
    skill: { grant: 'poison', name: '幽冥蚀骨', desc: '九幽之下，血亦是毒。' }
  },
  {
    id: 'tianji_crown', name: '天机玉冠', slot: 'helm', ilvl: 26,
    lore: '冠上星纹缓缓流转，参得破一分天机。',
    stats: { int: [10, 16], cdr: [6, 10], mpPct: [10, 16] },
    traits: ['manaflow', 'echo'],
    skill: { id: '*', name: '天机通玄', dmg: 10, cd: 5, desc: '强化所有技能：伤害 +10%，冷却 -5%。' }
  },

  /* ---------- 战甲 ---------- */
  {
    id: 'xuanming_armor', name: '玄冥战衣', slot: 'chest', ilvl: 12,
    lore: '衣上棘刺无声生长，替主人记住每一次疼痛。',
    stats: { def: [60, 100], hp: [100, 180], thorns: [20, 35] },
    traits: ['thorns', 'bloodrush'],
    skill: { id: '*', name: '棘甲回响', dmg: 6, cd: 6, desc: '强化所有技能：伤害 +6%，冷却 -6%。' }
  },
  {
    id: 'longlin_armor', name: '龙鳞战甲', slot: 'chest', ilvl: 24,
    lore: '逆鳞之下，是比山岳更沉的血脉。',
    stats: { def: [80, 130], hpPct: [8, 14], allRes: [8, 14] },
    traits: ['giant', 'huntmaster'],
    skill: { grant: 'whitetiger', name: '龙鳞召虎', desc: '龙鳞之下，虎啸相和。' }
  },

  /* ---------- 护肩 ---------- */
  {
    id: 'zhenshan_pauldron', name: '镇山护肩', slot: 'shoulders', ilvl: 14,
    lore: '一肩挑起半座山，也挑起了身后的人。',
    stats: { def: [40, 70], block: [6, 10], dmgReduce: [3, 6] },
    traits: ['bulwark', 'firstblood'],
    skill: { grant: 'shieldwall', name: '镇山壁垒', desc: '山不会退，人也不退。' }
  },
  {
    id: 'youying_pauldron', name: '幽影护肩', slot: 'shoulders', ilvl: 25,
    lore: '影随身动，声在人后。',
    stats: { dodge: [5, 9], moveSpd: [5, 9], ccResist: [10, 18] },
    traits: ['wind'],
    skill: { id: '*', name: '影随', cd: 8, cost: 8, desc: '强化所有技能：冷却 -8%，消耗 -8%。' }
  },

  /* ---------- 护手 ---------- */
  {
    id: 'xueshou', name: '血手·噬魂', slot: 'gloves', ilvl: 16,
    lore: '指尖残留的温度，不属于这双手的主人。',
    stats: { crit: [6, 10], critDmg: [20, 35], lifesteal: [3, 6] },
    traits: ['soulharvest', 'berserk'],
    skill: { grant: 'bloodrage', name: '噬魂血怒', desc: '手上的血，从来不是自己的。' }
  },
  {
    id: 'leiting_gloves', name: '雷霆护手', slot: 'gloves', ilvl: 24,
    lore: '握拳时，掌心有闷雷滚过。',
    stats: { aspd: [8, 14], crit: [5, 9], stunChance: [4, 8] },
    traits: ['critburst'],
    skill: { grant: 'chain', name: '掌心雷链', desc: '闷雷自掌心滚过。' }
  },

  /* ---------- 战靴 ---------- */
  {
    id: 'tayun_boots', name: '踏云履', slot: 'boots', ilvl: 10,
    lore: '云在脚下，路在身后。',
    stats: { moveSpd: [8, 14], dodge: [4, 8], pickupRadius: [2, 4] },
    traits: ['cloudstep'],
    skill: { grant: 'leap', name: '踏云纵', desc: '云在脚下，纵身即至。' }
  },
  {
    id: 'lingxu_boots', name: '凌虚履', slot: 'boots', ilvl: 24,
    lore: '一步凌虚，生死之间也能踏出半步。',
    stats: { moveSpd: [10, 16], dodge: [6, 10], ccResist: [12, 20] },
    traits: ['phoenix'],
    skill: { id: '*', name: '凌虚', radius: 10, dur: 20, desc: '强化所有技能：范围 +10%，持续时间 +20%。' }
  },

  /* ---------- 腰带 ---------- */
  {
    id: 'panlong_belt', name: '蟠龙带', slot: 'belt', ilvl: 16,
    lore: '龙蟠于腰，财气自聚。',
    stats: { hp: [80, 140], def: [30, 55], goldFind: [20, 35] },
    traits: ['fortune'],
    skill: { grant: 'summon', name: '蟠龙召灵', desc: '蟠龙在腰，灵兽自随。' }
  },
  {
    id: 'jiuyou_belt', name: '九幽腰带', slot: 'belt', ilvl: 24,
    lore: '束住的不只是衣衫，还有不肯散去的那口气。',
    stats: { hpPct: [8, 14], lifesteal: [4, 7], killHeal: [15, 30] },
    traits: ['undying'],
    skill: { grant: 'taiji', name: '九幽玄阵', desc: '那口气不散，阵便不破。' }
  },

  /* ---------- 项链 / 戒指 ---------- */
  {
    id: 'tianji_jade', name: '天机玉珏', slot: 'amulet', ilvl: 18,
    lore: '珏分两半，一半在人间，一半在天机。',
    stats: { magicFind: [25, 45], goldFind: [25, 45], expGain: [12, 22] },
    traits: ['seeker'],
    skill: { id: '*', name: '天机引', dmg: 5, cost: 10, dur: 10, desc: '强化所有技能：伤害 +5%，消耗 -10%，持续时间 +10%。' }
  },
  {
    id: 'lunhui_ring', name: '轮回之戒', slot: 'ring', ilvl: 18,
    lore: '戴上它的人，都记不起上一世是怎么死的。',
    stats: { crit: [6, 10], critDmg: [25, 45], lifesteal: [4, 7] },
    traits: ['samsara'],
    skill: { grant: 'revive', name: '轮回', desc: '死过一次的人，才戴得住它。' }
  }
];
