/* ============================================================
 * data-quests.js —— 任务数据（M2）
 *
 * 从 data-world.js 迁出来，任务与地图解耦：任务只记「目标在哪张图哪个区」，
 * 不关心那张图做没做出来 —— 图没做出来的任务由运行时过滤掉（questMapOpen），
 * 所以 M3 补一张图，对应的任务立刻就能接，不用回来改任务表。
 *
 * 三类任务（见 docs/ACT-EXPANSION-PLAN.md §4.1）
 *   main   主线：营地主线掌事发，推进章/卷，不可重复
 *   side   支线：营地录事发，引出任务区域，不可重复
 *   board  悬赏：营地任务板发，可重复（8 分钟刷新），给「刷」的出口
 *
 * 目标类型（6 种，都能校验）
 *   kill     target=怪物 key，count=数量
 *   killAny  count=任意怪数量
 *   boss     target=首领 key
 *   reach    zone=区域 id（进到该区即达成，count 固定 1）
 *   collect  mat=材料 key，count=数量
 *   dungeon  dtype=地下城类型，tier=阶（M5 接入，先留接口）
 *
 * ⚠ legacyId：老档里 q1~q11 的 id 原样保留在这里。
 *   迁移不按 id 猜、不重算进度，而是**认 legacyId** —— 老档的 done/active/next
 *   拿 q 号直接对到新任务上，objectives 结构与顺序必须与旧版逐字一致，
 *   这样 a.progress 数组可以原样搬过去，一条进度都不丢。
 *   改动 legacy 任务的 objectives 会让老档进度错位，**改之前先看 src/quests.js 的 migrate()**。
 * ============================================================ */

const QUESTS = {
  /* ==========================================================
   * 卷一 · 桃源残照（1–18）
   * ========================================================== */

  /* ---------------- 1-1 竹林妖氛（幽篁林 lv3） ---------------- */
  m1_1_1: {
    id: 'm1_1_1', legacyId: 'q1', part: 1, act: '1-1', kind: 'main',
    name: '竹林异动', giver: 'campA_main', map: 'forest', zone: 'hall',
    brief: '村外幽篁林妖气渐浓，半兽人已经下山掠村。去幽篁林斩杀 8 只半兽人。',
    objectives: [{ type: 'kill', target: 'halfork', count: 8, label: '斩杀半兽人战士' }],
    rewards: { xp: 260, gold: 180, ilvl: 5, rarity: 'magic' },
    next: 'm1_1_2', require: null
  },
  m1_1_2: {
    id: 'm1_1_2', legacyId: 'q2', part: 1, act: '1-1', kind: 'main',
    name: '血翼之夜', giver: 'campA_main', map: 'forest', zone: 'path',
    brief: '血蝠成群，夜里连牲口都被吸干了血。去幽篁林讨伐 10 只血蝠。',
    objectives: [{ type: 'kill', target: 'bat', count: 10, label: '猎杀血蝠' }],
    rewards: { xp: 420, gold: 260, ilvl: 7, rarity: 'magic' },
    next: 'm1_1_3', require: 'm1_1_1'
  },
  m1_1_3: {
    id: 'm1_1_3', legacyId: 'q3', part: 1, act: '1-1', kind: 'main',
    name: '巨木妖王', giver: 'campA_main', map: 'forest', zone: 'sanctum',
    brief: '幽篁林深处，千年妖木已成王。斩了它，竹林才能安息。',
    objectives: [{ type: 'boss', target: 'treeking', count: 1, label: '击败巨木妖王' }],
    rewards: { xp: 900, gold: 500, ilvl: 9, rarity: 'rare', skill: 'thrust', talent: 2 },
    next: 'm1_1_4', require: 'm1_1_2'
  },
  m1_1_4: {
    id: 'm1_1_4', legacyId: 'q4', part: 1, act: '1-1', kind: 'main',
    name: '嗜血长翼', giver: 'campA_main', map: 'forest', zone: 'sanctum',
    brief: '血蝠魔君以人血养翼，若不除之，血月将临。',
    objectives: [{ type: 'boss', target: 'batking', count: 1, label: '击败血蝠魔君' }],
    rewards: { xp: 1200, gold: 650, ilvl: 11, rarity: 'rare', skill: 'frostnova' },
    next: null, require: 'm1_1_3'
  },

  /* ---------------- 1-2 血月压境（血月沼泽 lv8） ---------------- */
  m1_2_1: {
    id: 'm1_2_1', legacyId: 'q5', part: 1, act: '1-2', kind: 'main',
    name: '沼泽的骨堆', giver: 'campA_main', map: 'swamp', zone: 'hall',
    brief: '血月沼泽的半兽人部族正在堆骨为塔。去沼泽斩杀 12 只怪物，遏止它们的血祭。',
    objectives: [{ type: 'killAny', count: 12, label: '肃清血月沼泽的妖物' }],
    rewards: { xp: 1600, gold: 800, ilvl: 13, rarity: 'rare', talent: 2 },
    next: 'm1_2_2', require: 'm1_1_4'
  },
  m1_2_2: {
    id: 'm1_2_2', legacyId: 'q6', part: 1, act: '1-2', kind: 'main',
    name: '碎骨酋长', giver: 'campA_main', map: 'swamp', zone: 'sanctum',
    brief: '半兽人酋长·碎骨以活人祭旗，此獠不除，沼泽永无宁日。',
    objectives: [{ type: 'boss', target: 'chief', count: 1, label: '击败半兽人酋长·碎骨' }],
    rewards: { xp: 2400, gold: 1100, ilvl: 15, rarity: 'set', skill: 'warcry' },
    next: 'm1_2_3', require: 'm1_2_1'
  },
  m1_2_3: {
    id: 'm1_2_3', part: 1, act: '1-2', kind: 'main',
    name: '毒鳞入梦', giver: 'campA_main', map: 'swamp', zone: 'east',
    brief: '蛇姬·青鳞在毒潭东岸蜕皮，蜕一次，沼泽的毒就浓一分。趁它虚弱时动手。',
    objectives: [{ type: 'kill', target: 'scorpion', count: 10, label: '清剿毒潭的蝎群' }],
    rewards: { xp: 3000, gold: 1300, ilvl: 16, rarity: 'set' },
    next: null, require: 'm1_2_2'
  },

  /* ---------------- 1-3 铁山无声（玄铁矿洞 lv16） ---------------- */
  m1_3_1: {
    id: 'm1_3_1', legacyId: 'q7', part: 1, act: '1-3', kind: 'main',
    name: '石甲与毒鳞', giver: 'campA_main', map: 'swamp', zone: 'sanctum',
    brief: '石甲巨魔与蛇姬·青鳞盘踞沼泽深处，二者皆除，方解此患。',
    objectives: [
      { type: 'boss', target: 'golemking', count: 1, label: '击败石甲巨魔' },
      { type: 'boss', target: 'snakequeen', count: 1, label: '击败蛇姬·青鳞' }
    ],
    rewards: { xp: 3600, gold: 1500, ilvl: 17, rarity: 'set', skill: 'summon' },
    next: 'm1_3_2', require: 'm1_2_3'
  },
  m1_3_2: {
    id: 'm1_3_2', legacyId: 'q8', part: 1, act: '1-3', kind: 'main',
    name: '矿洞的低语', giver: 'campA_main', map: 'mine', zone: 'sanctum',
    brief: '玄铁矿洞传出诵经声，幽魂道尊正在收割矿工的魂魄。',
    objectives: [{ type: 'boss', target: 'ghostlord', count: 1, label: '击败幽魂道尊' }],
    rewards: { xp: 5200, gold: 2000, ilvl: 21, rarity: 'set', skill: 'heal', talent: 3 },
    next: 'm1_3_3', require: 'm1_3_1'
  },
  m1_3_3: {
    id: 'm1_3_3', part: 1, act: '1-3', kind: 'main',
    name: '铁山绝顶', giver: 'campA_main', map: 'mine', zone: 'hall',
    brief: '矿洞最深处还有一道门，门后是卷二的第一口冷气。把这里的矿工魂送走，再往北走。',
    objectives: [
      { type: 'kill', target: 'minerghost', count: 8, label: '超度矿工亡魂' },
      { type: 'reach', zone: 'sanctum', count: 1, label: '抵达幽魂祭坛' }
    ],
    rewards: { xp: 6800, gold: 2600, ilvl: 23, rarity: 'rare', talent: 2 },
    next: null, require: 'm1_3_2'
  },

  /* ==========================================================
   * 卷二 · 血月焚天（19–30）
   * ========================================================== */

  /* ---------------- 2-1 寒潭照骨（寒潭水牢 lv20 / 冰魄湖 lv22） ---------------- */
  m2_1_1: {
    id: 'm2_1_1', legacyId: 'q9', part: 2, act: '2-1', kind: 'main',
    name: '冰火双魔', giver: 'campB_main', map: 'frost', zone: 'sanctum',
    brief: '赤炎魔将与冰魄妖后同源于一处天火，一焚一冻。斩其一，另一必至。',
    objectives: [
      { type: 'boss', target: 'firegeneral', count: 1, label: '击败赤炎魔将' },
      { type: 'boss', target: 'icequeen', count: 1, label: '击败冰魄妖后' }
    ],
    rewards: { xp: 7600, gold: 2800, ilvl: 25, rarity: 'legendary', skill: 'chain' },
    next: 'm2_1_2', require: 'm1_3_3'
  },
  m2_1_2: {
    id: 'm2_1_2', part: 2, act: '2-1', kind: 'main',
    name: '沉骨囚廊', giver: 'campB_main', map: 'frost', zone: 'hall',
    brief: '水牢里的囚徒死了三百年还在走。他们不认得你，只认得活人的热气。',
    objectives: [{ type: 'kill', target: 'drowned', count: 12, label: '镇住水牢的溺魂' }],
    rewards: { xp: 9200, gold: 3200, ilvl: 27, rarity: 'rare' },
    next: 'm2_1_3', require: 'm2_1_1'
  },
  m2_1_3: {
    id: 'm2_1_3', part: 2, act: '2-1', kind: 'main',
    name: '冰下蛛巢', giver: 'campB_main', map: 'icelake', zone: 'sanctum',
    brief: '冰魄湖冻住了水面，却没冻住湖底的东西。万毒蛛母在冰下织了一张比湖还大的网。',
    objectives: [{ type: 'boss', target: 'spidermother', count: 1, label: '击败万毒蛛母' }],
    rewards: { xp: 11000, gold: 3800, ilvl: 29, rarity: 'legendary', talent: 2 },
    next: null, require: 'm2_1_2'
  },

  /* ==========================================================
   * 卷三 · 幽冥黄泉（31–40）
   * ========================================================== */
  m3_1_1: {
    id: 'm3_1_1', legacyId: 'q10', part: 3, act: '3-1', kind: 'main',
    name: '九幽之门', giver: 'campC_main', map: 'abyss', zone: 'sanctum',
    brief: '九幽地宫的门开了。蛛母、渡者、剑魂，都在门的另一侧等你。',
    objectives: [
      { type: 'boss', target: 'spidermother', count: 1, label: '击败万毒蛛母' },
      { type: 'boss', target: 'ferryman', count: 1, label: '击败冥河渡者' },
      { type: 'boss', target: 'swordlord', count: 1, label: '击败天罡剑魂' }
    ],
    rewards: { xp: 12000, gold: 4200, ilvl: 30, rarity: 'legendary', skill: 'iceshield' },
    next: null, require: 'm2_1_3'
  },

  /* ==========================================================
   * 卷五 · 九霄终焉（51–60）
   * ========================================================== */
  m5_2_1: {
    id: 'm5_2_1', legacyId: 'q11', part: 5, act: '5-2', kind: 'main',
    name: '九霄终焉', giver: 'campE_main', map: 'heaven', zone: 'sanctum',
    brief: '混沌无相天魔吞尽九霄灵气，天阙已残。此战，为苍生，也为你自己。',
    objectives: [{ type: 'boss', target: 'chaos', count: 1, label: '击败混沌·无相天魔' }],
    rewards: { xp: 30000, gold: 12000, ilvl: 40, rarity: 'legendary', skill: 'avatar', talent: 3 },
    next: null, require: 'm3_1_1'
  },

  /* ==========================================================
   * 支线（营地录事发）
   * 每条都带 zone —— 接了就点亮任务区域（刷怪加成 + 小地图高亮）
   * ========================================================== */
  s1_1_1: {
    id: 's1_1_1', part: 1, act: '1-1', kind: 'side',
    name: '崖上的灯', giver: 'campA_side', map: 'forest', zone: 'east',
    brief: '东坡的守林人在崖上点了盏灯，三天没灭。去看看 —— 灯还亮着，人未必还在。',
    objectives: [
      { type: 'reach', zone: 'east', count: 1, label: '抵达东坡崖顶' },
      { type: 'kill', target: 'fox', count: 6, label: '驱散崖下的狐火' }
    ],
    rewards: { xp: 520, gold: 300, ilvl: 6, rarity: 'magic' },
    repeat: false, require: null
  },
  s1_2_1: {
    id: 's1_2_1', part: 1, act: '1-2', kind: 'side',
    name: '泥沼的药引', giver: 'campA_side', map: 'swamp', zone: 'west',
    brief: '药师要一味药引，只有沼泽女巫的骨灰能配。她说这话时没抬头。',
    objectives: [{ type: 'kill', target: 'bogwitch', count: 6, label: '讨伐沼泽女巫' }],
    rewards: { xp: 1800, gold: 900, ilvl: 12, rarity: 'magic' },
    repeat: false, require: 's1_1_1'
  },
  s1_3_1: {
    id: 's1_3_1', part: 1, act: '1-3', kind: 'side',
    name: '矿工的遗物', giver: 'campA_side', map: 'mine', zone: 'west',
    brief: '废矿西坑埋着三十七个矿工，没人知道他们的名字。把他们的矿灯捡回来。',
    objectives: [{ type: 'kill', target: 'minerghost', count: 8, label: '安抚矿工亡魂' }],
    rewards: { xp: 4200, gold: 1600, ilvl: 18, rarity: 'rare' },
    repeat: false, require: 's1_2_1'
  },
  s2_1_1: {
    id: 's2_1_1', part: 2, act: '2-1', kind: 'side',
    name: '水牢的锁链', giver: 'campB_side', map: 'frost', zone: 'west',
    brief: '西侧水牢的铁链断了七根。不是锈断的 —— 是有人从里面掰断的。',
    objectives: [
      { type: 'reach', zone: 'west', count: 1, label: '深入西侧水牢' },
      { type: 'kill', target: 'ghost', count: 6, label: '送走掰锁的人' }
    ],
    rewards: { xp: 6400, gold: 2200, ilvl: 22, rarity: 'rare' },
    repeat: false, require: 's1_3_1'
  },
  s2_1_2: {
    id: 's2_1_2', part: 2, act: '2-1', kind: 'side',
    name: '冰下的呼吸', giver: 'campB_side', map: 'icelake', zone: 'hall',
    brief: '冰湖中心每隔一刻钟会冒一次泡。录事说那是湖在呼吸，我不信。',
    objectives: [{ type: 'kill', target: 'toad', count: 8, label: '清掉冰下的蟾群' }],
    rewards: { xp: 7000, gold: 2400, ilvl: 24, rarity: 'rare' },
    repeat: false, require: 's2_1_1'
  },

  /* ==========================================================
   * 悬赏（任务板发，可重复）
   * giver 统一写 'board'，按 part 分组；8 分钟刷新一次。
   * map: 'any' = 任意图都能推进（只统计 killAny）。
   * ========================================================== */
  b1_1: {
    id: 'b1_1', part: 1, kind: 'board', name: '悬赏·肃清',
    giver: 'board', map: 'any', zone: null, brief: '不限地域，凡妖物皆可。交二十具尸首，领赏。',
    objectives: [{ type: 'killAny', count: 20, label: '斩杀任意妖物' }],
    rewards: { xp: 900, gold: 600 }, repeat: true, require: null
  },
  b1_2: {
    id: 'b1_2', part: 1, kind: 'board', name: '悬赏·血债',
    giver: 'board', map: 'any', zone: null, brief: '村里死了三口人。谁的刀快，谁拿这笔钱。',
    objectives: [{ type: 'killAny', count: 35, label: '斩杀任意妖物' }],
    rewards: { xp: 1500, gold: 1100 }, repeat: true, require: null
  },
  b1_3: {
    id: 'b1_3', part: 1, kind: 'board', name: '悬赏·夜不收',
    giver: 'board', map: 'any', zone: null, brief: '夜里出关的，一个都别放回来。',
    objectives: [{ type: 'killAny', count: 50, label: '斩杀任意妖物' }],
    rewards: { xp: 2400, gold: 1800 }, repeat: true, require: null
  },
  b2_1: {
    id: 'b2_1', part: 2, kind: 'board', name: '悬赏·寒潭',
    giver: 'board', map: 'any', zone: null, brief: '铁关的粮道被堵了。清出一条路来，粮价就能落。',
    objectives: [{ type: 'killAny', count: 25, label: '斩杀任意妖物' }],
    rewards: { xp: 2600, gold: 1600 }, repeat: true, require: null
  },
  b2_2: {
    id: 'b2_2', part: 2, kind: 'board', name: '悬赏·冰下',
    giver: 'board', map: 'any', zone: null, brief: '冰湖上的渔户不敢下网了。谁让湖面安静下来，谁领钱。',
    objectives: [{ type: 'killAny', count: 40, label: '斩杀任意妖物' }],
    rewards: { xp: 3800, gold: 2400 }, repeat: true, require: null
  },
  b2_3: {
    id: 'b2_3', part: 2, kind: 'board', name: '悬赏·关外',
    giver: 'board', map: 'any', zone: null, brief: '关外三十里，见者皆敌。不必带回证据，回来就算。',
    objectives: [{ type: 'killAny', count: 60, label: '斩杀任意妖物' }],
    rewards: { xp: 5200, gold: 3400 }, repeat: true, require: null
  },
  b3_1: {
    id: 'b3_1', part: 3, kind: 'board', name: '悬赏·忘川',
    giver: 'board', map: 'any', zone: null, brief: '忘川的船夫说河里有东西拽船。拽一次，收一次。',
    objectives: [{ type: 'killAny', count: 30, label: '斩杀任意妖物' }],
    rewards: { xp: 6000, gold: 3600 }, repeat: true, require: null
  },
  b3_2: {
    id: 'b3_2', part: 3, kind: 'board', name: '悬赏·黄泉',
    giver: 'board', map: 'any', zone: null, brief: '黄泉路上不收活人的钱。收活人的命。',
    objectives: [{ type: 'killAny', count: 45, label: '斩杀任意妖物' }],
    rewards: { xp: 8200, gold: 4800 }, repeat: true, require: null
  },
  b3_3: {
    id: 'b3_3', part: 3, kind: 'board', name: '悬赏·无名',
    giver: 'board', map: 'any', zone: null, brief: '这一条没有署名，也没有理由。接了就别问。',
    objectives: [{ type: 'killAny', count: 65, label: '斩杀任意妖物' }],
    rewards: { xp: 11000, gold: 6400 }, repeat: true, require: null
  },
  b4_1: {
    id: 'b4_1', part: 4, kind: 'board', name: '悬赏·剑冢',
    giver: 'board', map: 'any', zone: null, brief: '剑冢的遗物要归位。挡路的，一并归位。',
    objectives: [{ type: 'killAny', count: 35, label: '斩杀任意妖物' }],
    rewards: { xp: 12000, gold: 6800 }, repeat: true, require: null
  },
  b4_2: {
    id: 'b4_2', part: 4, kind: 'board', name: '悬赏·断阙',
    giver: 'board', map: 'any', zone: null, brief: '南天的砖一块都不能少。少了，就有人替你补。',
    objectives: [{ type: 'killAny', count: 50, label: '斩杀任意妖物' }],
    rewards: { xp: 16000, gold: 8600 }, repeat: true, require: null
  },
  b4_3: {
    id: 'b4_3', part: 4, kind: 'board', name: '悬赏·拾遗',
    giver: 'board', map: 'any', zone: null, brief: '遗物归位之前，先清场。',
    objectives: [{ type: 'killAny', count: 70, label: '斩杀任意妖物' }],
    rewards: { xp: 21000, gold: 11000 }, repeat: true, require: null
  },
  b5_1: {
    id: 'b5_1', part: 5, kind: 'board', name: '悬赏·九霄',
    giver: 'board', map: 'any', zone: null, brief: '最后一页册子上，只写了一个字：杀。',
    objectives: [{ type: 'killAny', count: 40, label: '斩杀任意妖物' }],
    rewards: { xp: 24000, gold: 12000 }, repeat: true, require: null
  },
  b5_2: {
    id: 'b5_2', part: 5, kind: 'board', name: '悬赏·终焉',
    giver: 'board', map: 'any', zone: null, brief: '走到这里的人不需要理由了。',
    objectives: [{ type: 'killAny', count: 60, label: '斩杀任意妖物' }],
    rewards: { xp: 32000, gold: 16000 }, repeat: true, require: null
  },
  b5_3: {
    id: 'b5_3', part: 5, kind: 'board', name: '悬赏·无相',
    giver: 'board', map: 'any', zone: null, brief: '镜渊照不出人影了。照不出，就都清掉。',
    objectives: [{ type: 'killAny', count: 80, label: '斩杀任意妖物' }],
    rewards: { xp: 42000, gold: 21000 }, repeat: true, require: null
  }
};

/* ---------------- 查询辅助（纯函数，不改数据） ---------------- */

/** 任务的目标地图做出来没有 → 图没做出来的任务先不出现（M3 补图后自动可用） */
function questMapOpen(q) {
  if (!q || !q.map || q.map === 'any') return true;
  return typeof MAPS !== 'undefined' && !!MAPS[q.map];
}

/** 某类任务按卷取（UI 与任务板用） */
function questsOfPart(part, kind) {
  const out = [];
  for (const k in QUESTS) {
    const q = QUESTS[k];
    if (q.part !== part) continue;
    if (kind && q.kind !== kind) continue;
    out.push(q);
  }
  return out;
}

/** 老档 id → 新任务 id（迁移用，见 src/quests.js migrate()） */
function questByLegacyId(legacyId) {
  for (const k in QUESTS) if (QUESTS[k].legacyId === legacyId) return QUESTS[k];
  return null;
}

/** 发布者 id → 真正的 NPC id（campA_main 落到 elder 身上） */
function npcIdOfGiver(giverId) {
  if (typeof NPC_ALIAS !== 'undefined' && NPC_ALIAS[giverId]) return NPC_ALIAS[giverId];
  return giverId;
}
