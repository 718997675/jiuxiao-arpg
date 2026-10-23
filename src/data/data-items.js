/* ============================================================
 * 数据层 · 装备
 * 槽位 / 护甲基底 / 武器基底 / 副手基底 / 随机词缀 / 套装
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

const SLOTS = {
  helm: { name: '头盔', glyph: '盔' },
  chest: { name: '战甲', glyph: '甲' },
  shoulders: { name: '护肩', glyph: '肩' },
  gloves: { name: '护手', glyph: '手' },
  boots: { name: '战靴', glyph: '靴' },
  belt: { name: '腰带', glyph: '带' },
  amulet: { name: '项链', glyph: '链' },
  ring: { name: '戒指', glyph: '戒' },
  weapon: { name: '武器', glyph: '武' },
  offhand: { name: '副手', glyph: '副' }
};
const SLOT_ORDER = ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];

/* ---------------- 装备基底 ----------------
 * V2 S1：76 → 210 件。
 *
 * 结构：BASES[槽][档位] = [变体, 变体, 变体]
 *       档位由 ilvl 决定（每 8 级一档，ilvl 1-40 → 5 档）
 *
 * 每档三个变体是三个流派，不是三个名字：
 *   A 均衡  —— 基准值，无固有
 *   B 重防  —— 防护更高，带防御类固有
 *   C 轻灵  —— 防护更低，带攻击/资源类固有
 * 固有属性写成 [名字, 护甲/伤害, 属性key, 属性值]，落地在 items.js 的 item.implicit。
 *
 * 护甲 8 槽 × 5 档 × 3 = 120
 * 武器 3 职业 × 5 档 × 3 = 45
 * 副手 3 职业 × 5 档 × 3 = 45
 *                        → 210
 */
const ARMOR_BASES = {
  helm: [
    [['布巾', 3], ['皮帽', 4, 'hp', 10], ['道巾', 2, 'mp', 8]],
    [['皮盔', 7], ['铁面', 9, 'def', 3], ['灵冠', 6, 'int', 2]],
    [['铁盔', 14], ['玄铁面', 18, 'def', 6], ['灵犀冠', 12, 'crit', 2]],
    [['镇山盔', 24], ['重铁面罩', 30, 'def', 10], ['幽影冠', 21, 'dodge', 3]],
    [['龙鳞盔', 38], ['太初玄盔', 47, 'def', 15], ['天机玉冠', 33, 'cdr', 4]]
  ],
  chest: [
    [['布衣', 5], ['硬皮甲', 7, 'hp', 14], ['道袍', 4, 'mp', 10]],
    [['皮甲', 11], ['钉皮甲', 14, 'def', 4], ['云纹袍', 10, 'int', 3]],
    [['锁子甲', 22], ['玄铁胸甲', 28, 'def', 8], ['灵蚕衣', 19, 'crit', 3]],
    [['玄铁重铠', 36], ['镇岳重铠', 45, 'def', 12], ['幽影战衣', 32, 'dodge', 4]],
    [['龙鳞战甲', 54], ['太初天铠', 66, 'def', 18], ['天机道袍', 49, 'cdr', 5]]
  ],
  shoulders: [
    [['布肩', 2], ['皮护肩', 3, 'hp', 6], ['素云肩', 2, 'mp', 5]],
    [['硬皮护肩', 5], ['铁肩', 6, 'def', 2], ['灵纹肩', 4, 'int', 1]],
    [['铁护肩', 10], ['玄铁肩', 13, 'def', 4], ['灵蚕肩', 9, 'crit', 1]],
    [['镇山护肩', 17], ['镇岳肩', 21, 'def', 6], ['幽影肩', 15, 'dodge', 2]],
    [['龙鳞护肩', 27], ['太初天肩', 33, 'def', 9], ['天机肩', 24, 'cdr', 2]]
  ],
  gloves: [
    [['布手', 2], ['皮护手', 3, 'hp', 5], ['素手', 2, 'mp', 4]],
    [['硬皮护手', 4], ['铁护手', 5, 'def', 2], ['灵纹手', 3, 'int', 1]],
    [['铁护手·精', 8], ['玄铁手', 10, 'def', 3], ['灵蚕手', 7, 'crit', 1]],
    [['镇山护手', 14], ['镇岳手', 17, 'def', 5], ['幽影手', 12, 'dodge', 2]],
    [['龙鳞护手', 22], ['太初天手', 27, 'def', 7], ['天机手', 19, 'cdr', 2]]
  ],
  boots: [
    [['草鞋', 2], ['皮靴', 3, 'moveSpdFlat', 1], ['布履', 2, 'mp', 3]],
    [['硬皮靴', 4], ['铁靴', 5, 'def', 2], ['疾风履', 3, 'moveSpd', 2]],
    [['铁战靴', 8], ['玄铁靴', 10, 'def', 3], ['踏风靴', 7, 'moveSpd', 3]],
    [['镇山战靴', 14], ['镇岳靴', 17, 'def', 5], ['踏云靴', 12, 'moveSpd', 4]],
    [['龙鳞战靴', 22], ['太初天靴', 27, 'def', 7], ['凌虚履', 19, 'moveSpd', 5]]
  ],
  belt: [
    [['布带', 1], ['皮束带', 2, 'hp', 8], ['素云带', 1, 'mp', 5]],
    [['皮带', 3], ['铁腰带', 4, 'def', 2], ['灵纹带', 3, 'int', 1]],
    [['铁腰带·精', 6], ['玄铁带', 8, 'def', 3], ['灵蚕带', 5, 'crit', 1]],
    [['镇山腰带', 10], ['镇岳带', 13, 'def', 4], ['幽影带', 9, 'dodge', 1]],
    [['蟠龙带', 16], ['太初天带', 20, 'def', 6], ['天机带', 14, 'cdr', 1]]
  ],
  amulet: [
    [['木牌', 0, 'hp', 12], ['骨珠', 0, 'mp', 10], ['铜铃', 0, 'atk', 2]],
    [['玉坠', 0, 'hp', 20], ['灵珠', 0, 'mp', 16], ['银铃', 0, 'atk', 4]],
    [['灵玉项链', 0, 'hp', 32], ['碧水珠', 0, 'mp', 26], ['玄铁铃', 0, 'atk', 7]],
    [['九幽魂链', 0, 'hp', 48], ['幽泉珠', 0, 'mp', 38], ['断魂铃', 0, 'atk', 10]],
    [['太初神链', 0, 'hp', 70], ['太初灵珠', 0, 'mp', 55], ['天机铃', 0, 'atk', 14]]
  ],
  ring: [
    [['铜戒', 0, 'atk', 2], ['木戒', 0, 'str', 1], ['石戒', 0, 'def', 2]],
    [['银戒', 0, 'atk', 3], ['铁戒', 0, 'str', 2], ['玉戒', 0, 'vit', 2]],
    [['灵玉戒', 0, 'crit', 2], ['玄铁戒', 0, 'atk', 5], ['咒纹戒', 0, 'skillDmg', 3]],
    [['九幽魔戒', 0, 'crit', 3], ['幽泉戒', 0, 'atk', 8], ['血咒戒', 0, 'lifesteal', 2]],
    [['太初神戒', 0, 'crit', 5], ['太初魔戒', 0, 'atk', 12], ['天机戒', 0, 'cdr', 3]]
  ]
};

const WEAPON_BASES = {
  warrior: [
    [
      { name: '铁剑', shape: 'sword', dmg: [7, 12], speed: 1.0 },
      { name: '单刀', shape: 'saber', dmg: [6, 11], speed: 1.1 },
      { name: '手斧', shape: 'axe', dmg: [9, 15], speed: 0.88 }
    ],
    [
      { name: '斩马刀', shape: 'saber', dmg: [11, 18], speed: 0.95 },
      { name: '精铁剑', shape: 'sword', dmg: [10, 16], speed: 1.05 },
      { name: '开山斧', shape: 'axe', dmg: [14, 22], speed: 0.85 }
    ],
    [
      { name: '开山巨斧', shape: 'axe', dmg: [16, 26], speed: 0.82 },
      { name: '偃月刀', shape: 'glaive', dmg: [15, 24], speed: 0.9 },
      { name: '玄铁重剑', shape: 'sword', dmg: [14, 23], speed: 0.95 }
    ],
    [
      { name: '破军斧', shape: 'axe', dmg: [24, 37], speed: 0.8 },
      { name: '偃月刀·精', shape: 'glaive', dmg: [22, 34], speed: 0.88 },
      { name: '龙渊剑', shape: 'sword', dmg: [20, 31], speed: 1.0 }
    ],
    [
      { name: '龙纹战刃', shape: 'glaive', dmg: [30, 46], speed: 0.92 },
      { name: '太初斩斧', shape: 'axe', dmg: [33, 50], speed: 0.85 },
      { name: '天罡神剑', shape: 'sword', dmg: [28, 43], speed: 1.05 }
    ]
  ],
  mage: [
    [
      { name: '桃木杖', shape: 'staff', dmg: [6, 10], speed: 1.0 },
      { name: '竹节杖', shape: 'staff', dmg: [5, 9], speed: 1.08 },
      { name: '石心杖', shape: 'staff', dmg: [7, 11], speed: 0.95 }
    ],
    [
      { name: '青玉法杖', shape: 'staff', dmg: [10, 16], speed: 1.0 },
      { name: '灵藤杖', shape: 'staff', dmg: [9, 14], speed: 1.06 },
      { name: '玄石杖', shape: 'staff', dmg: [11, 17], speed: 0.96 }
    ],
    [
      { name: '玄冰法杖', shape: 'staff', dmg: [15, 24], speed: 1.0 },
      { name: '雷纹杖', shape: 'staff', dmg: [14, 22], speed: 1.05 },
      { name: '焚心杖', shape: 'staff', dmg: [16, 25], speed: 0.95 }
    ],
    [
      { name: '焚天杖', shape: 'staff', dmg: [22, 33], speed: 1.0 },
      { name: '太阴杖', shape: 'staff', dmg: [21, 31], speed: 1.04 },
      { name: '九幽杖', shape: 'staff', dmg: [23, 35], speed: 0.96 }
    ],
    [
      { name: '太初法杖', shape: 'staff', dmg: [30, 45], speed: 1.05 },
      { name: '天机神杖', shape: 'staff', dmg: [29, 43], speed: 1.08 },
      { name: '混沌杖', shape: 'staff', dmg: [32, 48], speed: 0.98 }
    ]
  ],
  taoist: [
    [
      { name: '桃木剑', shape: 'taojian', dmg: [6, 11], speed: 1.05 },
      { name: '铜钱剑', shape: 'sword', dmg: [5, 10], speed: 1.12 },
      { name: '铁符剑', shape: 'sword', dmg: [7, 12], speed: 0.98 }
    ],
    [
      { name: '符文剑', shape: 'sword', dmg: [10, 17], speed: 1.05 },
      { name: '雷击剑', shape: 'sword', dmg: [9, 15], speed: 1.1 },
      { name: '铜环剑', shape: 'sword', dmg: [11, 18], speed: 0.98 }
    ],
    [
      { name: '七星剑', shape: 'sword', dmg: [15, 25], speed: 1.05 },
      { name: '紫电剑', shape: 'sword', dmg: [14, 23], speed: 1.09 },
      { name: '玄铁符剑', shape: 'sword', dmg: [16, 26], speed: 0.97 }
    ],
    [
      { name: '雷符剑', shape: 'sword', dmg: [22, 34], speed: 1.05 },
      { name: '上清剑', shape: 'sword', dmg: [21, 32], speed: 1.08 },
      { name: '镇魂剑', shape: 'sword', dmg: [23, 36], speed: 0.98 }
    ],
    [
      { name: '天罡剑', shape: 'sword', dmg: [30, 46], speed: 1.1 },
      { name: '太初神剑', shape: 'sword', dmg: [29, 44], speed: 1.12 },
      { name: '混沌道剑', shape: 'sword', dmg: [32, 48], speed: 1.0 }
    ]
  ]
};

const OFFHAND_BASES = {
  warrior: [
    [['木盾', 4], ['藤盾', 5, 'def', 1], ['轻盾', 3, 'block', 2]],
    [['铁盾', 9], ['镶钉盾', 11, 'def', 2], ['疾风盾', 8, 'block', 3]],
    [['灵木盾', 16], ['玄铁盾', 20, 'def', 4], ['流光盾', 14, 'block', 4]],
    [['玄铁塔盾', 26], ['镇岳塔盾', 33, 'def', 6], ['幽影盾', 23, 'block', 5]],
    [['龙鳞盾', 40], ['太初天盾', 50, 'def', 9], ['天机盾', 36, 'block', 6]]
  ],
  mage: [
    [['木珠', 2, 'mp', 6], ['石珠', 3, 'hp', 8], ['灵珠·碎', 1, 'mpReg', 1]],
    [['凝灵珠', 6, 'mp', 12], ['玉珠', 8, 'hp', 14], ['碧珠', 5, 'skillDmg', 2]],
    [['碧波珠', 11, 'mp', 20], ['玄冰珠', 14, 'hp', 22], ['焚天珠·碎', 9, 'skillDmg', 3]],
    [['焚天珠', 18, 'mp', 30], ['玄冥珠', 22, 'hp', 34], ['太阴珠', 15, 'skillDmg', 4]],
    [['太初珠', 28, 'mp', 44], ['太初冥珠', 34, 'hp', 48], ['天机珠', 24, 'skillDmg', 6]]
  ],
  taoist: [
    [['纸符', 2, 'mp', 5], ['桃符', 3, 'hp', 6], ['铜镜', 1, 'mpReg', 1]],
    [['桃符·精', 6, 'mp', 10], ['八卦镜', 8, 'hp', 12], ['铜铎', 5, 'skillDmg', 2]],
    [['八卦镜·精', 11, 'mp', 16], ['镇魂铃', 14, 'hp', 18], ['雷符', 9, 'skillDmg', 3]],
    [['镇魂铃·精', 18, 'mp', 24], ['太阴镜', 22, 'hp', 28], ['紫符', 15, 'skillDmg', 4]],
    [['太初令', 28, 'mp', 36], ['太初天镜', 34, 'hp', 40], ['天机符', 24, 'skillDmg', 6]]
  ]
};

/* ---------------- 词缀池 ----------------
 * V2 S1：24 → 64 条。key 必须唯一（makeAffix 按 key 去重），
 * 且每个 key 都要在 data-core.js 的 STATS 里、并在战斗里有生效点。
 *
 * tier: 1 常见（0.62 概率）2 强化（0.28）3 稀有（0.10）
 * val  = RND(min,max) × (1 + ilvl × 0.055)
 */
const AFFIXES = [
  /* ---------- tier 1 · 基础属性 ---------- */
  { key: 'atk', pre: ['锋锐的', '嗜血的', '裂石的'], suf: ['· 锋刃', '· 破军'], min: 3, max: 9, tier: 1 },
  { key: 'str', pre: ['蛮力的', '巨力的'], suf: ['· 蛮力', '· 山岳'], min: 2, max: 7, tier: 1 },
  { key: 'agi', pre: ['迅捷的', '轻灵的'], suf: ['· 疾风', '· 流云'], min: 2, max: 7, tier: 1 },
  { key: 'vit', pre: ['坚韧的', '厚土的'], suf: ['· 磐石', '· 长生'], min: 2, max: 8, tier: 1 },
  { key: 'int', pre: ['通灵的', '悟道的'], suf: ['· 灵台', '· 玄机'], min: 2, max: 8, tier: 1 },
  { key: 'hp', pre: ['壮硕的', '不息的'], suf: ['· 命血', '· 生息'], min: 12, max: 34, tier: 1 },
  { key: 'mp', pre: ['灵泉的', '盈溢的'], suf: ['· 灵泉', '· 潮生'], min: 8, max: 22, tier: 1 },
  { key: 'def', pre: ['坚固的', '厚重的'], suf: ['· 铁壁', '· 金刚'], min: 3, max: 10, tier: 1 },
  { key: 'mpReg', pre: ['凝神的', '静心的'], suf: ['· 凝神', '· 静心'], min: 1, max: 3, tier: 1 },
  { key: 'goldFind', pre: ['富贵的', '聚宝的'], suf: ['· 聚宝', '· 财源'], min: 6, max: 18, tier: 1 },
  { key: 'thorns', pre: ['棘刺的', '反噬的'], suf: ['· 棘刺', '· 反噬'], min: 3, max: 10, tier: 1 },
  { key: 'moveSpdFlat', pre: ['轻快的', '疾行的'], suf: ['· 疾行', '· 迅足'], min: 1, max: 3, tier: 1 },
  { key: 'hpRegen', pre: ['生养的', '回春的'], suf: ['· 回春', '· 生机'], min: 1, max: 4, tier: 1 },
  { key: 'minDmg', pre: ['沉稳的', '笃实的'], suf: ['· 沉稳', '· 笃实'], min: 3, max: 8, tier: 1 },
  { key: 'pickupRadius', pre: ['善缘的', '结缘的'], suf: ['· 善缘', '· 广纳'], min: 1, max: 2, tier: 1 },

  /* ---------- tier 2 · 百分比强化 ---------- */
  { key: 'atkPct', pre: ['狂暴的', '无双的'], suf: ['· 战意', '· 屠戮'], min: 4, max: 12, tier: 2 },
  { key: 'hpPct', pre: ['不朽的', '万寿的'], suf: ['· 不朽', '· 玄龟'], min: 5, max: 12, tier: 2 },
  { key: 'crit', pre: ['精准的', '夺命的'], suf: ['· 洞察', '· 断魂'], min: 2, max: 6, tier: 2 },
  { key: 'critDmg', pre: ['残虐的', '灭杀的'], suf: ['· 戮心', '· 裂魂'], min: 8, max: 24, tier: 2 },
  { key: 'aspd', pre: ['疾风的', '疾影的'], suf: ['· 疾影', '· 迅雷'], min: 3, max: 8, tier: 2 },
  { key: 'moveSpd', pre: ['踏云的', '逐日的'], suf: ['· 踏云', '· 追风'], min: 3, max: 7, tier: 2 },
  { key: 'skillDmg', pre: ['通玄的', '奥妙的'], suf: ['· 通玄', '· 法界'], min: 5, max: 14, tier: 2 },
  { key: 'magicFind', pre: ['奇遇的', '天缘的'], suf: ['· 奇遇', '· 天缘'], min: 5, max: 15, tier: 2 },
  { key: 'allRes', pre: ['避劫的', '五行不侵的'], suf: ['· 五行', '· 避劫'], min: 3, max: 9, tier: 2 },
  { key: 'dmgAll', pre: ['破军的', '天罚的'], suf: ['· 破军', '· 天罚'], min: 4, max: 11, tier: 2 },
  { key: 'meleeDmg', pre: ['缠斗的', '白刃的'], suf: ['· 缠斗', '· 血刃'], min: 6, max: 16, tier: 2 },
  { key: 'projDmg', pre: ['贯日的', '流星的'], suf: ['· 贯日', '· 流星'], min: 6, max: 16, tier: 2 },
  { key: 'aoeDmg', pre: ['荡涤的', '席卷的'], suf: ['· 荡涤', '· 席卷'], min: 5, max: 14, tier: 2 },
  { key: 'dotDmg', pre: ['侵蚀的', '销骨的'], suf: ['· 侵蚀', '· 销骨'], min: 6, max: 18, tier: 2 },
  { key: 'eliteDmg', pre: ['猎妖的', '斩将的'], suf: ['· 猎妖', '· 斩将'], min: 8, max: 20, tier: 2 },
  { key: 'bossDmg', pre: ['屠龙的', '诛邪的'], suf: ['· 屠龙', '· 诛邪'], min: 8, max: 22, tier: 2 },
  { key: 'executeDmg', pre: ['收魂的', '索命的'], suf: ['· 收魂', '· 索命'], min: 10, max: 28, tier: 2 },
  { key: 'firstStrike', pre: ['先发的', '破晓的'], suf: ['· 先发', '· 破晓'], min: 8, max: 20, tier: 2 },
  { key: 'armorPen', pre: ['穿甲的', '破甲的'], suf: ['· 穿甲', '· 破甲'], min: 4, max: 12, tier: 2 },
  { key: 'armorPct', pre: ['磐固的', '金汤的'], suf: ['· 磐固', '· 金汤'], min: 6, max: 16, tier: 2 },
  { key: 'dmgReduce', pre: ['卸力的', '御守的'], suf: ['· 御守', '· 卸力'], min: 2, max: 6, tier: 2 },
  { key: 'healBonus', pre: ['回天的', '生息的'], suf: ['· 回天', '· 生息'], min: 8, max: 20, tier: 2 },
  { key: 'shieldBonus', pre: ['护法的', '凝罡的'], suf: ['· 护法', '· 凝罡'], min: 10, max: 24, tier: 2 },
  { key: 'expGain', pre: ['敏悟的', '宿慧的'], suf: ['· 敏悟', '· 宿慧'], min: 5, max: 15, tier: 2 },
  { key: 'dropRate', pre: ['多宝的', '聚珍的'], suf: ['· 多宝', '· 聚珍'], min: 4, max: 10, tier: 2 },
  { key: 'costReduce', pre: ['省力的', '养气的'], suf: ['· 省力', '· 养气'], min: 4, max: 12, tier: 2 },
  { key: 'mpPct', pre: ['灵海的', '纳川的'], suf: ['· 灵海', '· 纳川'], min: 6, max: 16, tier: 2 },
  { key: 'physRes', pre: ['铁骨的', '铜筋的'], suf: ['· 铁骨', '· 铜筋'], min: 5, max: 12, tier: 2 },
  { key: 'fireRes', pre: ['避火的', '蹈火的'], suf: ['· 避火', '· 蹈火'], min: 5, max: 12, tier: 2 },
  { key: 'iceRes', pre: ['御寒的', '暖玉的'], suf: ['· 御寒', '· 温玉'], min: 5, max: 12, tier: 2 },
  { key: 'poisonRes', pre: ['解毒的', '百毒的'], suf: ['· 解毒', '· 百毒'], min: 5, max: 12, tier: 2 },

  /* ---------- tier 3 · 稀有特效 ---------- */
  { key: 'lifesteal', pre: ['饮血的', '噬魂的'], suf: ['· 饮血', '· 噬魂'], min: 1, max: 4, tier: 3 },
  { key: 'cdr', pre: ['流转的', '天机的'], suf: ['· 流转', '· 天机'], min: 3, max: 8, tier: 2, weight: 3 },
  { key: 'killHeal', pre: ['贪婪的', '嗜杀的'], suf: ['· 汲取', '· 归元'], min: 4, max: 14, tier: 3 },
  { key: 'summonDmg', pre: ['御兽的', '妖契的'], suf: ['· 御兽', '· 妖契'], min: 6, max: 16, tier: 3 },
  { key: 'dodge', pre: ['幻身的', '无相的'], suf: ['· 幻身', '· 无迹'], min: 2, max: 6, tier: 3 },
  { key: 'block', pre: ['横练的', '拒马的'], suf: ['· 横练', '· 拒马'], min: 3, max: 8, tier: 3 },
  { key: 'ccResist', pre: ['定心的', '道心的'], suf: ['· 定心', '· 不动'], min: 5, max: 14, tier: 3 },
  { key: 'stunChance', pre: ['震慑的', '镇魂的'], suf: ['· 震慑', '· 镇魂'], min: 2, max: 6, tier: 3 },
  { key: 'slowChance', pre: ['迟滞的', '凝霜的'], suf: ['· 迟滞', '· 凝霜'], min: 4, max: 10, tier: 3 },
  { key: 'freezeChance', pre: ['冰封的', '寒魄的'], suf: ['· 冰封', '· 寒魄'], min: 2, max: 5, tier: 3 },
  { key: 'burnChance', pre: ['燃魂的', '业火的'], suf: ['· 燃魂', '· 业火'], min: 3, max: 8, tier: 3 },
  { key: 'knockback', pre: ['崩山的', '裂岳的'], suf: ['· 崩山', '· 裂岳'], min: 1, max: 3, tier: 3 },
  { key: 'mpOnHit', pre: ['引泉的', '汲灵的'], suf: ['· 引泉', '· 汲灵'], min: 1, max: 3, tier: 3 },
  { key: 'hpOnHit', pre: ['饮露的', '沾血的'], suf: ['· 饮露', '· 沾血'], min: 2, max: 6, tier: 3 },
  { key: 'mpOnKill', pre: ['纳魂的', '收灵的'], suf: ['· 纳魂', '· 收灵'], min: 3, max: 9, tier: 3 },
  { key: 'overkillShield', pre: ['余威的', '不竭的'], suf: ['· 余威', '· 不竭'], min: 6, max: 18, tier: 3 },
  { key: 'aspdOnCrit', pre: ['疾击的', '连斩的'], suf: ['· 疾击', '· 连斩'], min: 5, max: 15, tier: 3 },
  { key: 'cdrFlat', pre: ['顿悟的', '无碍的'], suf: ['· 顿悟', '· 无碍'], min: 1, max: 2, tier: 3 }
];

/* ---------------- 词条的职业 / 部位适配（v1.1.7） ----------------
 * 同一部位、不同职业的装备，词条池不同 —— 战士的胸甲不会洗出「灵力」，
 * 法师的胸甲不会洗出「力量」，武器不出纯防御，首饰不出近战专精。
 * 词条内容因此不通用，且贴合各职业定位。
 *
 * 用**排除法**而非白名单：新增词条默认对所有职业 / 部位开放，只有明确不合用的
 * 才登记进来。白名单漏登记会让新词条永远不出现，排除法漏登记只是宽松一点。
 *
 * cls 为 null（通用装备）时不做职业过滤，保持万金油定位。
 * slot 不在 AFFIX_SLOT_GROUP 里时不做部位过滤。
 */
const AFFIX_CLS_DENY = {
  /* 战士：力量 / 近战 / 暴击 / 护甲 / 反伤。灵力、法术、召唤、持续伤害与冷却类一概不出 */
  warrior: [
    'int', 'mp', 'mpPct', 'mpReg', 'mpOnHit', 'mpOnKill',
    'skillDmg', 'summonDmg', 'projDmg', 'aoeDmg', 'dotDmg',
    'cdr', 'cdrFlat', 'costReduce', 'healBonus', 'shieldBonus',
    'freezeChance', 'burnChance', 'slowChance'
  ],
  /* 法师：灵力 / 雷火范围 / 冷却 / 护盾。力量、近战、格挡、吸血一概不出 */
  mage: [
    'str', 'meleeDmg', 'thorns', 'block', 'knockback', 'armorPen',
    'firstStrike', 'aspdOnCrit', 'overkillShield',
    'lifesteal', 'hpOnHit', 'killHeal', 'summonDmg', 'dotDmg', 'healBonus'
  ],
  /* 道士：灵力 / 毒雾持续 / 召唤 / 自愈。力量、近战、格挡、纯爆发范围一概不出 */
  taoist: [
    'str', 'meleeDmg', 'thorns', 'block', 'knockback', 'armorPen',
    'firstStrike', 'aspdOnCrit', 'overkillShield',
    'aoeDmg', 'freezeChance', 'burnChance', 'shieldBonus'
  ]
};

const AFFIX_SLOT_GROUP = {
  weapon: 'weapon', offhand: 'weapon',
  helm: 'armor', chest: 'armor', shoulders: 'armor',
  gloves: 'armor', boots: 'armor', belt: 'armor',
  amulet: 'jewel', ring: 'jewel'
};

const AFFIX_SLOT_DENY = {
  /* 武器 / 副手：出伤害与命中，不出纯防御与回复 */
  weapon: [
    'def', 'armorPct', 'dmgReduce', 'block', 'dodge', 'thorns',
    'hpPct', 'hpRegen', 'ccResist', 'shieldBonus', 'overkillShield',
    'physRes', 'fireRes', 'iceRes', 'poisonRes', 'allRes'
  ],
  /* 六件防具：出防御与生存，不出武器专精（穿甲 / 暴伤 / 斩杀 / 吸血） */
  armor: [
    'armorPen', 'critDmg', 'executeDmg', 'firstStrike', 'aspdOnCrit',
    'lifesteal', 'killHeal', 'minDmg'
  ],
  /* 项链 / 戒指：出稀有属性，不出大面积伤害与防御 */
  jewel: [
    'def', 'armorPct', 'dmgReduce', 'block', 'thorns', 'hpPct',
    'meleeDmg', 'projDmg', 'aoeDmg', 'dotDmg', 'summonDmg',
    'armorPen', 'shieldBonus', 'overkillShield'
  ]
};

/* 过滤后少于这个数就放弃过滤：宁可宽松，也不让某个职业/部位的池子枯竭 */
const AFFIX_POOL_MIN = 10;

/* 通用装备（基底不绑职业，cls 为 null）用三职业的**排除并集**：
 * 只出人人都能用的中性词条（生命 / 防御 / 抗性 / 暴击 / 通用增伤）。
 * 否则通用胸甲可能掉出「力量」，法师穿着就是废词条。 */
const AFFIX_UNIVERSAL_DENY = (function () {
  const s = new Set();
  for (const c in AFFIX_CLS_DENY) for (const k of AFFIX_CLS_DENY[c]) s.add(k);
  return Array.from(s);
})();

function affixSlotGroup(slot) {
  return AFFIX_SLOT_GROUP[slot] || null;
}

/* 取某职业某部位的可用词条池；cls 为 null 时按通用中性池 */
function affixPool(cls, slot) {
  const dc = cls ? (AFFIX_CLS_DENY[cls] || []) : AFFIX_UNIVERSAL_DENY;
  const dg = AFFIX_SLOT_DENY[affixSlotGroup(slot)] || [];
  if (!dc.length && !dg.length) return AFFIXES;
  const out = AFFIXES.filter(a => dc.indexOf(a.key) < 0 && dg.indexOf(a.key) < 0);
  return out.length >= AFFIX_POOL_MIN ? out : AFFIXES;
}

/* ---------------- 套装 ---------------- */
const SETS = {
  qinglong: {
    id: 'qinglong', name: '青龙偃月', cls: 'warrior', color: '#5ce08a',
    pieces: ['青龙盔', '青龙战甲', '青龙护肩', '青龙护手', '青龙战靴'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '攻击力 +15%', stats: { atkPct: 15 } },
      { need: 3, text: '攻速 +12%，生命偷取 +4%', stats: { aspd: 12, lifesteal: 4 } },
      { need: 5, text: '旋风斩伤害 +120%，攻击附带雷霆', stats: { skillDmg: 20 }, flag: 'thunder' }
    ]
  },
  zhuque: {
    id: 'zhuque', name: '朱雀焚天', cls: 'mage', color: '#ff8a5c',
    pieces: ['朱雀冠', '朱雀法袍', '朱雀云肩', '朱雀手衣', '朱雀云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '技能伤害 +20%', stats: { skillDmg: 20 } },
      { need: 3, text: '冷却缩减 +15%，灵力上限 +15%', stats: { cdr: 15 } },
      { need: 5, text: '火球爆炸范围 +60%，并留下火海', stats: { atkPct: 10 }, flag: 'firetrail' }
    ]
  },
  xuanwu: {
    id: 'xuanwu', name: '玄武镇魂', cls: 'taoist', color: '#7ec8ff',
    pieces: ['玄武巾', '玄武道袍', '玄武云肩', '玄武手衣', '玄武云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '生命上限 +25%', stats: { hpPct: 25 } },
      { need: 3, text: '召唤物伤害 +60%，护甲 +30', stats: { summonDmg: 60, def: 30 } },
      { need: 5, text: '回春咒变为群体治疗并附加护盾', stats: { skillDmg: 15 }, flag: 'groupheal' }
    ]
  },
  jiuyou: {
    id: 'jiuyou', name: '九幽', cls: null, color: '#b98cff',
    pieces: ['九幽锁魂链', '九幽噬魂戒', '九幽腰带', '九幽令'],
    slots: ['amulet', 'ring', 'belt', 'offhand'],
    bonuses: [
      { need: 2, text: '移动速度 +10%', stats: { moveSpd: 10 } },
      { need: 3, text: '暴击伤害 +30%，击杀回复 +15', stats: { critDmg: 30, killHeal: 15 } },
      { need: 4, text: '全属性 +15，暴击率 +10%', stats: { str: 15, agi: 15, vit: 15, int: 15, crit: 10 } }
    ]
  },
  tiangang: {
    id: 'tiangang', name: '天罡', cls: null, color: '#ffd166',
    pieces: ['天罡战盔', '天罡战甲', '天罡护肩', '天罡战靴', '天罡之刃'],
    slots: ['helm', 'chest', 'shoulders', 'boots', 'weapon'],
    bonuses: [
      { need: 2, text: '攻击力 +20%，暴击率 +8%', stats: { atkPct: 20, crit: 8 } },
      { need: 3, text: '技能伤害 +30%，冷却缩减 +12%', stats: { skillDmg: 30, cdr: 12 } },
      { need: 5, text: '对首领伤害 +40%，全属性 +25', stats: { str: 25, agi: 25, vit: 25, int: 25 }, flag: 'bossSlayer' }
    ]
  },

  /* ---------------- S2 新增 7 套：每职业 3 套（低/中/高）+ 通用 3 套 ---------------- */
  chixiao: {
    id: 'chixiao', name: '赤霄战魂', cls: 'warrior', color: '#ff6b4a',
    pieces: ['赤霄战盔', '赤霄战甲', '赤霄护肩', '赤霄护手', '赤霄战靴'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '攻击力 +18%', stats: { atkPct: 18 } },
      { need: 3, text: '攻速 +15%，暴击伤害 +20%', stats: { aspd: 15, critDmg: 20 } },
      { need: 5, text: '击杀后进入血怒：攻速与移速提升 4 秒', stats: { atkPct: 15 }, flag: 'bloodRush' }
    ]
  },
  jiuli: {
    id: 'jiuli', name: '九黎战铠', cls: 'warrior', color: '#c86a3a',
    pieces: ['九黎战盔', '九黎战甲', '九黎护肩', '九黎护手', '九黎战靴', '九黎战刃'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'weapon'],
    bonuses: [
      { need: 2, text: '护甲穿透 +15%，攻击力 +10%', stats: { armorPen: 15, atkPct: 10 } },
      { need: 3, text: '生命上限 +15%，护甲 +40', stats: { hpPct: 15, def: 40 } },
      { need: 5, text: '对首领伤害 +40%，首领伤害 +20%', stats: { bossDmg: 20 }, flag: 'bossSlayer' }
    ]
  },
  xuanbing: {
    id: 'xuanbing', name: '玄冰', cls: 'mage', color: '#8ad8ff',
    pieces: ['玄冰冠', '玄冰法袍', '玄冰云肩', '玄冰手衣', '玄冰云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '冰霜抗性 +20%，技能伤害 +10%', stats: { iceRes: 20, skillDmg: 10 } },
      { need: 3, text: '冷却缩减 +10%，冻结几率 +8%', stats: { cdr: 10, freezeChance: 8 } },
      { need: 5, text: '受击时释放玄冰冰环，冻结周围敌人', stats: { skillDmg: 25 }, flag: 'frostBurst' }
    ]
  },
  tianlei: {
    id: 'tianlei', name: '天雷', cls: 'mage', color: '#b98cff',
    pieces: ['天雷冠', '天雷法袍', '天雷云肩', '天雷手衣', '天雷云履', '天雷杖'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'weapon'],
    bonuses: [
      { need: 2, text: '暴击率 +10%，技能伤害 +15%', stats: { crit: 10, skillDmg: 15 } },
      { need: 3, text: '冷却缩减 +15%，伤害加成 +10%', stats: { cdr: 15, dmgAll: 10 } },
      { need: 5, text: '普攻附带天雷，技能伤害 +20%', stats: { skillDmg: 20 }, flag: 'thunder' }
    ]
  },
  qingmu: {
    id: 'qingmu', name: '青木', cls: 'taoist', color: '#7ee0a0',
    pieces: ['青木冠', '青木道袍', '青木云肩', '青木手衣', '青木云履'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots'],
    bonuses: [
      { need: 2, text: '生命上限 +15%，治疗效果 +20%', stats: { hpPct: 15, healBonus: 20 } },
      { need: 3, text: '召唤物伤害 +40%，灵力上限 +10%', stats: { summonDmg: 40, mpPct: 10 } },
      { need: 5, text: '回春咒变为群体治疗并附加护盾', stats: { healBonus: 20 }, flag: 'groupheal' }
    ]
  },
  zifu: {
    id: 'zifu', name: '紫府', cls: 'taoist', color: '#c8a0ff',
    pieces: ['紫府冠', '紫府道袍', '紫府云肩', '紫府手衣', '紫府云履', '紫府符剑'],
    slots: ['helm', 'chest', 'shoulders', 'gloves', 'boots', 'weapon'],
    bonuses: [
      { need: 2, text: '召唤物伤害 +25%，技能伤害 +12%', stats: { summonDmg: 25, skillDmg: 12 } },
      { need: 3, text: '持续伤害 +30%，灵力回复 +6/秒', stats: { dotDmg: 30, mpReg: 6 } },
      { need: 5, text: '技能有 15% 概率不进入冷却', stats: { skillDmg: 20 }, flag: 'echo' }
    ]
  },
  shanhai: {
    id: 'shanhai', name: '山海', cls: null, color: '#6ad8c0',
    pieces: ['山海盔', '山海战甲', '山海护肩', '山海战靴', '山海护符', '山海令'],
    slots: ['helm', 'chest', 'shoulders', 'boots', 'amulet', 'offhand'],
    bonuses: [
      { need: 2, text: '奇遇机缘 +20%，金币获取 +20%', stats: { magicFind: 20, goldFind: 20 } },
      { need: 3, text: '经验获取 +15%，掉落数量 +10%', stats: { expGain: 15, dropRate: 10 } },
      { need: 5, text: '全元素抗性 +15%，玄晶掉落提升，拾取范围扩大', stats: { allRes: 15, hpPct: 10, pickupRadius: 2 }, flag: 'seeker' }
    ]
  }
};

/* ---------------- 符文 ----------------
 * S2：24 符文，tier 1-4。单个符文是「小属性」，真正的价值在符文之语。
 * 符文属性全部走 STATS 里已有的 key，不许出现假属性。
 */
const RUNE_TIERS = {
  1: { name: '凡纹', color: '#cfcfd6', weight: 100 },
  2: { name: '灵纹', color: '#67a9ff', weight: 45 },
  3: { name: '玄纹', color: '#b98cff', weight: 18 },
  4: { name: '神纹', color: '#ffc857', weight: 6 }
};

const RUNES = {
  el: { id: 'el', name: '艾尔', tier: 1, stats: { atk: 8 } },
  eld: { id: 'eld', name: '艾德', tier: 1, stats: { eliteDmg: 6 } },
  tir: { id: 'tir', name: '提尔', tier: 1, stats: { mp: 14 } },
  nef: { id: 'nef', name: '奈夫', tier: 1, stats: { def: 12 } },
  eth: { id: 'eth', name: '爱斯', tier: 1, stats: { armorPen: 5 } },
  ith: { id: 'ith', name: '伊司', tier: 1, stats: { critDmg: 14 } },
  tal: { id: 'tal', name: '塔尔', tier: 2, stats: { poisonRes: 8 } },
  ral: { id: 'ral', name: '拉尔', tier: 2, stats: { fireRes: 8 } },
  ort: { id: 'ort', name: '欧特', tier: 2, stats: { iceRes: 8 } },
  thul: { id: 'thul', name: '图尔', tier: 2, stats: { freezeChance: 3 } },
  amn: { id: 'amn', name: '安姆', tier: 2, stats: { lifesteal: 2 } },
  sol: { id: 'sol', name: '索尔', tier: 2, stats: { crit: 3 } },
  shael: { id: 'shael', name: '沙尔', tier: 3, stats: { aspd: 5 } },
  dol: { id: 'dol', name: '多尔', tier: 3, stats: { hpRegen: 3 } },
  hel: { id: 'hel', name: '海尔', tier: 3, stats: { hpPct: 4 } },
  io: { id: 'io', name: '埃欧', tier: 3, stats: { mpPct: 5 } },
  lum: { id: 'lum', name: '卢姆', tier: 3, stats: { mpReg: 2 } },
  ko: { id: 'ko', name: '科', tier: 3, stats: { cdrFlat: 1 } },
  fal: { id: 'fal', name: '法尔', tier: 4, stats: { moveSpd: 3 } },
  lem: { id: 'lem', name: '蓝姆', tier: 4, stats: { goldFind: 10 } },
  pul: { id: 'pul', name: '普尔', tier: 4, stats: { magicFind: 8 } },
  um: { id: 'um', name: '乌姆', tier: 4, stats: { allRes: 5 } },
  mal: { id: 'mal', name: '马尔', tier: 4, stats: { dmgReduce: 3 } },
  ist: { id: 'ist', name: '伊司特', tier: 4, stats: { skillDmg: 7 } }
};

/* ---------------- 符文之语 ----------------
 * 与暗黑 2 一致：孔数必须与序列长度相同、顺序一致、全部填满才成立。
 * 达成的符文之语会叠加在「每个符文本身」的属性之上。
 */
const RUNE_WORDS = [
  {
    id: 'thunder', name: '雷霆之语', runes: ['el', 'sol', 'tal'], color: '#88ddff',
    stats: { atkPct: 10, crit: 5 }, flag: 'thunder',
    desc: '普攻有 18% 概率召下连锁天雷。'
  },
  {
    id: 'inferno', name: '炎狱之语', runes: ['ral', 'ort', 'thul'], color: '#ff7a30',
    stats: { fireRes: 12, burnChance: 8 }, flag: 'explode',
    desc: '击杀敌人时引发一次火焰爆炸。'
  },
  {
    id: 'bloodthirst', name: '饮血之语', runes: ['amn', 'nef'], color: '#e0424a',
    stats: { lifesteal: 5, killHeal: 10 },
    desc: '攻击吸取生命，击杀后回复生命。'
  },
  {
    id: 'frost', name: '玄冰之语', runes: ['ort', 'thul', 'shael'], color: '#8ad8ff',
    stats: { iceRes: 12, freezeChance: 5 }, flag: 'frostBurst',
    desc: '受击时释放冰环，冻结周围敌人（4 秒冷却）。'
  },
  {
    id: 'gale', name: '疾风之语', runes: ['shael', 'eth', 'fal'], color: '#9ae0b0',
    stats: { aspd: 8, moveSpd: 6, dodge: 4 },
    desc: '攻速、移速与闪避同时提升。'
  },
  {
    id: 'bulwark', name: '磐石之语', runes: ['nef', 'eth', 'tir'], color: '#b8b0a0',
    stats: { def: 30, block: 4, dmgReduce: 4 },
    desc: '护甲、格挡与固定减伤同时提升。'
  },
  {
    id: 'hunter', name: '猎杀之语', runes: ['eld', 'ith', 'sol'], color: '#ffc857',
    stats: { eliteDmg: 15, bossDmg: 15, executeDmg: 10 },
    desc: '对精英、首领与残血目标造成额外伤害。'
  },
  {
    id: 'mystic', name: '通玄之语', runes: ['tir', 'io', 'lum'], color: '#b98cff',
    stats: { mp: 40, mpPct: 8, skillDmg: 8, cdr: 4 },
    desc: '灵力、技能伤害与冷却缩减全面提升。'
  },
  {
    id: 'rage', name: '血怒之语', runes: ['amn', 'ith', 'mal'], color: '#ff4a4a',
    stats: { lifesteal: 8, crit: 5, critDmg: 20 }, flag: 'bloodRush',
    desc: '击杀后回复生命，并进入 4 秒血怒。'
  },
  {
    id: 'echo', name: '回响之语', runes: ['ko', 'ist'], color: '#6ad8c0',
    stats: { cdr: 6, cdrFlat: 1 }, flag: 'echo',
    desc: '技能有 15% 概率不进入冷却。'
  },
  {
    id: 'fortune', name: '聚宝之语', runes: ['lem', 'pul', 'fal'], color: '#ffd166',
    stats: { goldFind: 30, magicFind: 20, dropRate: 8 },
    desc: '金币、奇遇机缘与掉落数量提升。'
  },
  {
    id: 'guardian', name: '护法之语', runes: ['um', 'mal', 'hel'], color: '#7ec8ff',
    stats: { allRes: 10, hpPct: 8, dmgReduce: 4, shieldBonus: 15 },
    desc: '全抗、生命与护盾强度提升，受到伤害降低。'
  }
];

/* ---------------- 玄晶分级（S3） ---------------- */
const CRYSTAL_TIERS = [
  { id: 1, name: '凡晶', color: '#b8b8b8', label: '凡' },
  { id: 2, name: '灵晶', color: '#67a9ff', label: '灵' },
  { id: 3, name: '玄晶', color: '#c084ff', label: '玄' },
  { id: 4, name: '神晶', color: '#ffd166', label: '神' }
];

/* 词缀品质色（与玄晶等级对应） */
const AFFIX_QUALITY_COLOR = {
  1: '#a0a0a0',   // 普通
  2: '#67a9ff',   // 优秀
  3: '#c084ff',   // 精良
  4: '#ffd166'    // 史诗
};

/* 词缀池档位色（Ⅰ 常规 / Ⅱ 进阶 / Ⅲ 稀有特效） */
const AFFIX_TIER_COLOR = { 1: '#b8b8a8', 2: '#8fd0a0', 3: '#e0a8ff' };
const AFFIX_TIER_NAME = { 1: '常规', 2: '进阶', 3: '特效' };

/* ---------------- 炼器台 ---------------- */
const FORGE = {
  matName: '玄晶',
  reforgeCost: { common: 8, magic: 14, rare: 24, legendary: 40, set: 32 },
  reforgeStep: 0.35,          // 同一件装备每洗一次，成本 +35%
  socketRuneReturn: true,     // 卸下符文全额返还
  enhanceMax: 3,              // 强化上限：最多扩充 3 条额外词缀
  enhanceCostBase: { common: 12, magic: 20, rare: 35, legendary: 55, set: 45 },
  enhanceStep: 0.45,          // 每强化一次费用 +45%
  drillMax: 5,                // 打孔上限：一件装备最多 5 孔（自然掉落最多 4 孔）
  drillCost: [14, 20, 28, 38, 50],  // 打出第 N+1 个孔的玄晶价（索引 = 当前孔数）
  /* 套装打造：把属性满意的装备打造成指定套装的对应件。
   * crystal 按「凡/灵/玄/神」四级索引；金币随 ilvl 上浮。 */
  setCraft: { crystal: [0, 0, 10, 4], goldBase: 3000, goldPerIlvl: 250 },
  /* v1.1.8：任何品质掉落时额外附加一条 tier 3 稀有词条的概率 */
  rareAffixChance: 0.12,
  /* 固定初始词条：品质决定条数（见 RARITY[x].fixed），数值按此系数打折。
   * 它们洗不动，等于装备的「底子」，所以数值压到可洗词条的 6 折，
   * 免得高品质装备一掉出来就顶掉玩家辛苦洗出来的属性。 */
  fixedMul: 0.6
};
