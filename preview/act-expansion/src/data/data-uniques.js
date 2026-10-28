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
 * 【[M6] 40 件 · ilvl 40~60 · 初期不掉】
 *   传世从「全期都能掉」改成**终局专属**：最低 ilvl 40，怪物等级到 40 才进池。
 *   原因：卷一~卷三（1~40 级）已经有八阶 + 18 套套装撑着，红装提前出现只会
 *   把中期的成长曲线压平（20 级摸到一件传世，后面二十级就没有追求了）。
 *   `uniquePool()` 只按 `u.ilvl <= 怪物等级` 过滤，所以**不用改任何逻辑** ——
 *   把 ilvl 抬到 40 以上，初期自然掉不出来。
 *
 *   数量 20 → 40，按部位铺满：武器 6 / 副手 5 / 头盔 4 / 战甲 4 / 护肩 3 /
 *   披风 3 / 护手 3 / 战靴 3 / 腰带 3 / 项链 3 / 戒指 3。
 *   40~60 之间每 2~3 级就有一件新的可追，终局不再「一件都没有」。
 *
 * 【词条区间怎么定】
 *   老 20 件的原始区间是按它们当年的 ilvl（8~26）配的。抬到 40~60 时，
 *   区间按词缀的同一条成长率（每级 +5.5%）同步放大，
 *   于是它们在各自等级段里的**相对强度不变**，不会一升 ilvl 就变成废纸。
 *
 * 【特性唯一性】[UNIQUE-3]
 *   UNIQUE_TRAITS 里每一条特性只属于一件传世，全表不出现第二次。
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
  samsara:     { name: '轮回', desc: '所有技能伤害 +10%，冷却 -6%。', stats: { skillDmg: 10, cdr: 6 } },

  /* ============ [M6] 终局 20 件的新特性 ============
   * 每条只归一件传世。全部走 stats 通道（面板可见、战斗生效），
   * 不新增 flag / special —— 新机制要配新钩子，那是另一件事；
   * 这里先把「数值型独有特性」铺满，保证 40 件两两不撞。 */
  earthrend:   { name: '破岳', desc: '对精英与首领的伤害各 +30%。', stats: { eliteDmg: 30, bossDmg: 25 } },
  soulflame:   { name: '魂焰', desc: '火焰伤害 +26%，持续伤害 +20%。', stats: { fireDmg: 26, dotDmg: 20 } },
  sigilmaster: { name: '符主', desc: '阵法与符箓伤害 +35%，技能伤害 +12%。', stats: { sigilDmg: 35, skillDmg: 12 } },
  stonewall:   { name: '石壁', desc: '格挡率 +12%，荆棘 +70。', stats: { block: 12, thorns: 70 } },
  manaweave:   { name: '灵织', desc: '灵力上限 +25%，技能消耗 -15%。', stats: { mpPct: 25, costReduce: 15 } },
  soulgather:  { name: '聚魂', desc: '对残血敌人伤害 +50%，击杀回复生命 +45。', stats: { executeDmg: 50, killHeal: 45 } },
  ascend:      { name: '登霄', desc: '经验获取 +35%，全技能等级 +1。', stats: { expGain: 35, skillLv: 1 } },
  ironroot:    { name: '铁根', desc: '护甲 +22%，控制抵抗 +25%。', stats: { armorPct: 22, ccResist: 25 } },
  warden:      { name: '守夜', desc: '濒死护盾 +50，受到的伤害 -8%。', stats: { deathWard: 50, dmgReduce: 8 } },
  bloodpact:   { name: '血契', desc: '生命上限 +15%，生命偷取 +9%。', stats: { hpPct: 15, lifesteal: 9 } },
  gale:        { name: '罡风', desc: '移动速度 +14%，闪避 +10%。', stats: { moveSpd: 14, dodge: 10 } },
  frostheart:  { name: '冰心', desc: '冰霜伤害 +24%，冻结几率 +14%。', stats: { iceDmg: 24, freezeChance: 14 } },
  swiftdeath:  { name: '疾殁', desc: '攻击速度 +20%，移动速度 +8%。', stats: { aspd: 20, moveSpd: 8 } },
  piercer:     { name: '破甲', desc: '护甲穿透 +30，精英伤害 +25%。', stats: { armorPen: 30, eliteDmg: 25 } },
  thunderlord: { name: '雷主', desc: '雷电伤害 +26%，眩晕几率 +12%。', stats: { lightningDmg: 26, stunChance: 12 } },
  venomlord:   { name: '毒主', desc: '毒素伤害 +26%，持续伤害 +20%。', stats: { poisonDmg: 26, dotDmg: 20 } },
  beastbond:   { name: '兽契', desc: '召唤物伤害 +35%，光环范围 +25%。', stats: { summonDmg: 35, auraRange: 25 } },
  fortuneflow: { name: '天流', desc: '奇遇机缘 +55%，金币 +55%，掉落数量 +12%。', stats: { magicFind: 55, goldFind: 55, dropRate: 12 } },
  firstlight:  { name: '晨锋', desc: '对满血敌人伤害 +60%，暴击率 +10%。', stats: { firstStrike: 60, crit: 10 } },
  hunter:      { name: '猎首', desc: '对首领伤害 +35%，暴击伤害 +30%。', stats: { bossDmg: 35, critDmg: 30 } }
};

/* ---------------- 唯一装备目录（40 件 · ilvl 40~60） ----------------
 * 部位分布：武器 6 / 副手 5 / 头盔 4 / 战甲 4 / 护肩 3 / 披风 3 /
 *           护手 3 / 战靴 3 / 腰带 3 / 项链 3 / 戒指 3
 * 职业专属 9 件（3 件 44 级武器 + 3 件 58 级终局武器 + 2 件 56 级副手 + 1 件 42 级盾），
 * 其余三职业通用。每件至少带 1 条独占特性，且必定带一条技能效果。
 */
const UNIQUE_ITEMS = [
  /* ---------- 武器 · 44 / 58 ---------- */
  {
    id: 'frostmoon', name: '斩月·霜寒', slot: 'weapon', cls: 'warrior', ilvl: 44, shape: 'sword',
    lore: '刀锋过处，月色都凝成了霜。',
    stats: { crit: [18, 30], critDmg: [72, 119], atkPct: [24, 42] },
    traits: ['frostbite'],
    skill: { id: 'whirl', name: '霜月斩', dmg: 50, cd: 15, desc: '强化【旋风斩】：伤害 +50%，冷却 -15%。' }
  },
  {
    id: 'emberheaven', name: '焚天·赤霄', slot: 'weapon', cls: 'mage', ilvl: 44, shape: 'staff',
    lore: '一杖引落九天火，赤霄尽染不夜天。',
    stats: { atkPct: [36, 54], skillDmg: [45, 75], burnChance: [24, 42] },
    traits: ['emberburst', 'firetrail'],
    skill: { id: 'fireball', name: '赤霄焚天', dmg: 60, radius: 25, desc: '强化【火球术】：伤害 +60%，爆炸范围 +25%。' }
  },
  {
    id: 'taichu', name: '太初·无相', slot: 'weapon', cls: 'taoist', ilvl: 44, shape: 'taojian',
    lore: '无相之相，雷自符中生。',
    stats: { int: [24, 42], skillDmg: [45, 75], crit: [15, 27] },
    traits: ['stormcall'],
    skill: { id: 'talisman', name: '太初雷符', dmg: 55, desc: '强化【五雷符】：伤害 +55%。' }
  },
  {
    id: 'duanyue', name: '断岳·山河裂', slot: 'weapon', cls: 'warrior', ilvl: 58, shape: 'sword',
    lore: '一剑落下，山脊断开，裂缝里涌出来的是旧日的河声。',
    stats: { atkPct: [44, 66], critDmg: [86, 138], armorPen: [22, 38] },
    traits: ['earthrend'],
    skill: { id: 'avatar', name: '断岳斩', dmg: 60, cd: 12, desc: '强化【剑神降世】：伤害 +60%，冷却 -12%。' }
  },
  {
    id: 'jinshi', name: '烬世·九幽焚', slot: 'weapon', cls: 'mage', ilvl: 58, shape: 'staff',
    lore: '九幽的火没有烟，烧完之后只剩一片安静的白。',
    stats: { atkPct: [40, 60], skillDmg: [58, 88], burnChance: [28, 46] },
    traits: ['soulflame'],
    skill: { id: 'meteor', name: '九幽天火', dmg: 65, radius: 25, desc: '强化【陨星术】：伤害 +65%，范围 +25%。' }
  },
  {
    id: 'taixu_wujiu', name: '太虚·无咎', slot: 'weapon', cls: 'taoist', ilvl: 58, shape: 'sword',
    lore: '无咎者，动而不失其时。符未出鞘，雷已在指间。',
    stats: { int: [30, 48], skillDmg: [58, 88], cdr: [15, 23] },
    traits: ['sigilmaster'],
    skill: { id: 'talisman', name: '无咎雷符', dmg: 70, cd: 10, desc: '强化【五雷符】：伤害 +70%，冷却 -10%。' }
  },

  /* ---------- 副手 · 42 / 56 ---------- */
  {
    id: 'zhenyue', name: '玄冥·镇岳盾', slot: 'offhand', cls: 'warrior', ilvl: 42,
    lore: '岳镇玄冥，百邪不侵。',
    stats: { def: [110, 193], block: [17, 33], dmgReduce: [8, 17] },
    traits: ['aegis'],
    skill: { id: 'warcry', name: '镇岳战吼', dmg: 30, cd: 20, desc: '强化【战意咆哮】：增益效果 +30%，冷却 -20%。' }
  },
  {
    id: 'taiyin', name: '太阴·玄冰珠', slot: 'offhand', cls: 'mage', ilvl: 42,
    lore: '珠中藏着一轮太阴，触之即寒。',
    stats: { mp: [110, 193], skillDmg: [33, 55], freezeChance: [14, 28] },
    traits: ['frostguard'],
    skill: { id: 'frostnova', name: '太阴霜爆', dmg: 45, radius: 20, desc: '强化【冰霜新星】：伤害 +45%，范围 +20%。' }
  },
  {
    id: 'bagua', name: '镇魂·八卦镜', slot: 'offhand', cls: 'taoist', ilvl: 42,
    lore: '镜照三魂，符安七魄。',
    stats: { mp: [97, 166], healBonus: [55, 97], allRes: [22, 39] },
    traits: ['groupheal'],
    skill: { id: 'heal', name: '普度回春', dmg: 50, cd: 15, desc: '强化【回春咒】：治疗量 +50%，冷却 -15%。' }
  },
  {
    id: 'zhenhai', name: '镇海·玄龟甲', slot: 'offhand', cls: 'warrior', ilvl: 56,
    lore: '玄龟负山三千年，背甲上刻着整片东海。',
    stats: { def: [130, 210], block: [20, 32], dmgReduce: [10, 18] },
    traits: ['stonewall'],
    skill: { id: 'shieldwall', name: '镇海壁垒', dmg: 40, cd: 20, desc: '强化【盾墙】：减伤 +40%，冷却 -20%。' }
  },
  {
    id: 'youquan', name: '幽泉·引魂珠', slot: 'offhand', cls: 'mage', ilvl: 56,
    lore: '珠里有一口井，井里有人在喊自己的名字。',
    stats: { mp: [120, 200], skillDmg: [40, 65], mpReg: [20, 35] },
    traits: ['manaweave'],
    skill: { id: '*', name: '幽泉引', dmg: 12, cost: 15, desc: '强化所有技能：伤害 +12%，消耗 -15%。' }
  },

  /* ---------- 头盔 · 40 / 46 / 52 / 60 ---------- */
  {
    id: 'jiuyou_veil', name: '九幽面纱', slot: 'helm', ilvl: 40,
    lore: '纱后没有面容，只有一双饮血的眼。',
    stats: { hp: [146, 267], crit: [10, 19], lifesteal: [7, 15] },
    traits: ['vampiric', 'executioner'],
    skill: { grant: 'poison', name: '幽冥蚀骨', desc: '九幽之下，血亦是毒。' }
  },
  {
    id: 'baigumian', name: '白骨冕', slot: 'helm', ilvl: 46,
    lore: '冕上每一颗珠子，都是一位没能走到终点的同行者。',
    stats: { hp: [200, 340], crit: [14, 24], executeDmg: [25, 45] },
    traits: ['soulgather'],
    skill: { id: '*', name: '白骨引', dmg: 10, cd: 6, desc: '强化所有技能：伤害 +10%，冷却 -6%。' }
  },
  {
    id: 'tianji_crown', name: '天机玉冠', slot: 'helm', ilvl: 52,
    lore: '冠上星纹缓缓流转，参得破一分天机。',
    stats: { int: [24, 39], cdr: [15, 24], mpPct: [24, 39] },
    traits: ['manaflow', 'echo'],
    skill: { id: '*', name: '天机通玄', dmg: 10, cd: 5, desc: '强化所有技能：伤害 +10%，冷却 -5%。' }
  },
  {
    id: 'jiuxiao_crown', name: '九霄冠', slot: 'helm', ilvl: 60,
    lore: '戴上它的人，能听见九重天外的风。',
    stats: { int: [32, 52], cdr: [18, 28], mpPct: [26, 42] },
    traits: ['ascend'],
    skill: { id: '*', name: '九霄通玄', dmg: 15, cd: 8, desc: '强化所有技能：伤害 +15%，冷却 -8%。' }
  },

  /* ---------- 战甲 · 40 / 48 / 50 / 60 ---------- */
  {
    id: 'xuanming_armor', name: '玄冥战衣', slot: 'chest', ilvl: 40,
    lore: '衣上棘刺无声生长，替主人记住每一次疼痛。',
    stats: { def: [152, 254], hp: [254, 457], thorns: [51, 89] },
    traits: ['thorns', 'bloodrush'],
    skill: { id: '*', name: '棘甲回响', dmg: 6, cd: 6, desc: '强化所有技能：伤害 +6%，冷却 -6%。' }
  },
  {
    id: 'xuantie_armor', name: '玄铁重铠', slot: 'chest', ilvl: 48,
    lore: '铁山被熔的那一夜，这副甲自己从炉里走了出来。',
    stats: { def: [220, 340], hp: [300, 520], hpPct: [16, 28] },
    traits: ['ironroot'],
    skill: { id: '*', name: '铁山', dmg: 8, cd: 8, desc: '强化所有技能：伤害 +8%，冷却 -8%。' }
  },
  {
    id: 'longlin_armor', name: '龙鳞战甲', slot: 'chest', ilvl: 50,
    lore: '逆鳞之下，是比山岳更沉的血脉。',
    stats: { def: [194, 316], hpPct: [19, 34], allRes: [19, 34] },
    traits: ['giant', 'huntmaster'],
    skill: { grant: 'whitetiger', name: '龙鳞召虎', desc: '龙鳞之下，虎啸相和。' }
  },
  {
    id: 'tianque_robe', name: '天阙羽衣', slot: 'chest', ilvl: 60,
    lore: '天阙断了，羽衣还在飞。',
    stats: { def: [260, 400], hpPct: [22, 36], allRes: [26, 42] },
    traits: ['warden'],
    skill: { id: '*', name: '天阙护', dmg: 10, cost: 12, dur: 15, desc: '强化所有技能：伤害 +10%，消耗 -12%，持续 +15%。' }
  },

  /* ---------- 护肩 · 41 / 47 / 51 ---------- */
  {
    id: 'zhenshan_pauldron', name: '镇山护肩', slot: 'shoulders', ilvl: 41,
    lore: '一肩挑起半座山，也挑起了身后的人。',
    stats: { def: [99, 174], block: [15, 25], dmgReduce: [7, 15] },
    traits: ['bulwark', 'firstblood'],
    skill: { grant: 'shieldwall', name: '镇山壁垒', desc: '山不会退，人也不退。' }
  },
  {
    id: 'yehuo_shoulder', name: '业火肩', slot: 'shoulders', ilvl: 47,
    lore: '肩上烧的不是火，是还没还完的债。',
    stats: { def: [120, 200], block: [16, 26], thorns: [60, 110] },
    traits: ['bloodpact'],
    skill: { id: '*', name: '业火焚身', dmg: 12, radius: 12, desc: '强化所有技能：伤害 +12%，范围 +12%。' }
  },
  {
    id: 'youying_pauldron', name: '幽影护肩', slot: 'shoulders', ilvl: 51,
    lore: '影随身动，声在人后。',
    stats: { dodge: [12, 22], moveSpd: [12, 22], ccResist: [24, 44] },
    traits: ['wind'],
    skill: { id: '*', name: '影随', cd: 8, cost: 8, desc: '强化所有技能：冷却 -8%，消耗 -8%。' }
  },

  /* ---------- 披风 · 40 / 49 / 60（[M6] 原来一件都没有，这次补 3 件） ---------- */
  {
    id: 'yexing_cloak', name: '夜行斗篷', slot: 'cloak', ilvl: 40,
    lore: '夜行的人不点灯，他怕照见自己的影子。',
    stats: { dodge: [12, 20], moveSpd: [14, 24], ccResist: [20, 34] },
    traits: ['gale'],
    skill: { grant: 'leap', name: '夜行纵', desc: '影里一步，已在十丈之外。' }
  },
  {
    id: 'xuanshuang_cloak', name: '玄霜氅', slot: 'cloak', ilvl: 49,
    lore: '氅角扫过的地方，草叶上都结着一层薄霜。',
    stats: { allRes: [24, 40], dmgReduce: [8, 14], hpPct: [12, 20] },
    traits: ['frostheart'],
    skill: { id: 'frostnova', name: '玄霜爆', dmg: 55, radius: 20, desc: '强化【冰霜新星】：伤害 +55%，范围 +20%。' }
  },
  {
    id: 'wuji_cloak', name: '无极天氅', slot: 'cloak', ilvl: 60,
    lore: '披上它，九霄的风也吹不动衣角。',
    stats: { dodge: [18, 30], allRes: [30, 50], dmgReduce: [12, 20] },
    traits: ['swiftdeath'],
    skill: { id: '*', name: '无极', cd: 12, cost: 12, desc: '强化所有技能：冷却 -12%，消耗 -12%。' }
  },

  /* ---------- 护手 · 43 / 52 / 54 ---------- */
  {
    id: 'xueshou', name: '血手·噬魂', slot: 'gloves', ilvl: 43,
    lore: '指尖残留的温度，不属于这双手的主人。',
    stats: { crit: [15, 25], critDmg: [50, 87], lifesteal: [7, 15] },
    traits: ['soulharvest', 'berserk'],
    skill: { grant: 'bloodrage', name: '噬魂血怒', desc: '手上的血，从来不是自己的。' }
  },
  {
    id: 'leiting_gloves', name: '雷霆护手', slot: 'gloves', ilvl: 52,
    lore: '握拳时，掌心有闷雷滚过。',
    stats: { aspd: [20, 36], crit: [13, 23], stunChance: [10, 20] },
    traits: ['critburst'],
    skill: { grant: 'chain', name: '掌心雷链', desc: '闷雷自掌心滚过。' }
  },
  {
    id: 'duanjin_gloves', name: '断筋手', slot: 'gloves', ilvl: 54,
    lore: '不杀你，只让你再也握不住刀。',
    stats: { aspd: [26, 42], crit: [16, 26], armorPen: [20, 34] },
    traits: ['piercer'],
    skill: { id: '*', name: '断筋', dmg: 14, cd: 8, desc: '强化所有技能：伤害 +14%，冷却 -8%。' }
  },

  /* ---------- 战靴 · 41 / 50 / 56 ---------- */
  {
    id: 'tayun_boots', name: '踏云履', slot: 'boots', ilvl: 41,
    lore: '云在脚下，路在身后。',
    stats: { moveSpd: [22, 38], dodge: [11, 22], pickupRadius: [5, 11] },
    traits: ['cloudstep'],
    skill: { grant: 'leap', name: '踏云纵', desc: '云在脚下，纵身即至。' }
  },
  {
    id: 'lingxu_boots', name: '凌虚履', slot: 'boots', ilvl: 50,
    lore: '一步凌虚，生死之间也能踏出半步。',
    stats: { moveSpd: [24, 39], dodge: [15, 24], ccResist: [29, 49] },
    traits: ['phoenix'],
    skill: { id: '*', name: '凌虚', radius: 10, dur: 20, desc: '强化所有技能：范围 +10%，持续时间 +20%。' }
  },
  {
    id: 'zhuifeng_boots', name: '追风履', slot: 'boots', ilvl: 56,
    lore: '追风的人从不回头，回头就追不上了。',
    stats: { moveSpd: [30, 48], dodge: [18, 30], ccResist: [30, 50] },
    traits: ['thunderlord'],
    skill: { id: '*', name: '追风', cd: 10, dur: 15, desc: '强化所有技能：冷却 -10%，持续 +15%。' }
  },

  /* ---------- 腰带 · 43 / 53 / 57 ---------- */
  {
    id: 'panlong_belt', name: '蟠龙带', slot: 'belt', ilvl: 43,
    lore: '龙蟠于腰，财气自聚。',
    stats: { hp: [199, 348], def: [75, 137], goldFind: [50, 87] },
    traits: ['fortune'],
    skill: { grant: 'summon', name: '蟠龙召灵', desc: '蟠龙在腰，灵兽自随。' }
  },
  {
    id: 'jiuyou_belt', name: '九幽腰带', slot: 'belt', ilvl: 53,
    lore: '束住的不只是衣衫，还有不肯散去的那口气。',
    stats: { hpPct: [21, 36], lifesteal: [10, 18], killHeal: [39, 78] },
    traits: ['undying'],
    skill: { grant: 'taiji', name: '九幽玄阵', desc: '那口气不散，阵便不破。' }
  },
  {
    id: 'suohun_belt', name: '锁魂带', slot: 'belt', ilvl: 57,
    lore: '扣上的那一刻，你听见有人替你叹了口气。',
    stats: { hp: [320, 540], lifesteal: [12, 20], killHeal: [45, 80] },
    traits: ['venomlord'],
    skill: { id: '*', name: '锁魂', dmg: 10, cost: 10, desc: '强化所有技能：伤害 +10%，消耗 -10%。' }
  },

  /* ---------- 项链 · 45 / 54 / 60 ---------- */
  {
    id: 'tianji_jade', name: '天机玉珏', slot: 'amulet', ilvl: 45,
    lore: '珏分两半，一半在人间，一半在天机。',
    stats: { magicFind: [62, 112], goldFind: [62, 112], expGain: [30, 55] },
    traits: ['seeker'],
    skill: { id: '*', name: '天机引', dmg: 5, cost: 10, dur: 10, desc: '强化所有技能：伤害 +5%，消耗 -10%，持续时间 +10%。' }
  },
  {
    id: 'hunyuan_seal', name: '混元玉印', slot: 'amulet', ilvl: 54,
    lore: '印上无字，盖下去才显出你的名字。',
    stats: { allRes: [28, 46], skillDmg: [30, 50], cdr: [14, 22] },
    traits: ['beastbond'],
    skill: { id: '*', name: '混元印', dmg: 12, radius: 15, desc: '强化所有技能：伤害 +12%，范围 +15%。' }
  },
  {
    id: 'shanhai_seal', name: '山海印', slot: 'amulet', ilvl: 60,
    lore: '山海图碎成三十片的那天，这方印落进了忘川。',
    stats: { magicFind: [70, 120], expGain: [40, 70], dropRate: [10, 20] },
    traits: ['fortuneflow'],
    skill: { id: '*', name: '山海引', dmg: 15, cost: 15, dur: 15, desc: '强化所有技能：伤害 +15%，消耗 -15%，持续 +15%。' }
  },

  /* ---------- 戒指 · 45 / 56 / 60 ---------- */
  {
    id: 'lunhui_ring', name: '轮回之戒', slot: 'ring', ilvl: 45,
    lore: '戴上它的人，都记不起上一世是怎么死的。',
    stats: { crit: [15, 25], critDmg: [62, 112], lifesteal: [10, 17] },
    traits: ['samsara'],
    skill: { grant: 'revive', name: '轮回', desc: '死过一次的人，才戴得住它。' }
  },
  {
    id: 'xuantian_ring', name: '玄天劫环', slot: 'ring', ilvl: 56,
    lore: '环上七道裂纹，每一道都是一次没能躲开的雷。',
    stats: { crit: [18, 30], critDmg: [70, 120], aspd: [16, 28] },
    traits: ['firstlight'],
    skill: { id: '*', name: '玄天劫', dmg: 12, cd: 10, desc: '强化所有技能：伤害 +12%，冷却 -10%。' }
  },
  {
    id: 'zhongyan_ring', name: '终焉·劫', slot: 'ring', ilvl: 60,
    lore: '走到天门底下的人，指上总要多一样东西。',
    stats: { critDmg: [85, 140], skillDmg: [35, 60], allRes: [24, 40] },
    traits: ['hunter'],
    skill: { id: '*', name: '终焉', dmg: 18, cd: 12, desc: '强化所有技能：伤害 +18%，冷却 -12%。' }
  }
];
