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
    next: 'm1_1_5', require: 'm1_1_3'
  },
  /* [M3b] 落霞坡。插在 q4 与 q5 之间 —— 主线是单链（同时只能接 1 条），
   * 新图只能「插进链里」，不能另起一条并行的线。
   * 插进来只改 require 链，不动任何 legacy 任务的 objectives，
   * 老档迁移照旧（migrate 只认 objectives 结构）。 */
  m1_1_5: {
    id: 'm1_1_5', part: 1, act: '1-1', kind: 'main',
    name: '晚照之坡', giver: 'campA_main', map: 'sunset', zone: 't3',
    brief: '落霞坡的晚霞红得不对劲。村民说那是妖血染的 —— 三层坡地，越往上越红。',
    objectives: [{ type: 'killAny', count: 14, label: '肃清落霞坡的妖物' }],
    rewards: { xp: 900, gold: 480, ilvl: 8, rarity: 'magic' },
    next: null, require: 'm1_1_4'
  },

  /* ---------------- 1-2 血月压境（血月沼泽 lv8） ---------------- */
  m1_2_1: {
    id: 'm1_2_1', legacyId: 'q5', part: 1, act: '1-2', kind: 'main',
    name: '沼泽的骨堆', giver: 'campA_main', map: 'swamp', zone: 'hall',
    brief: '血月沼泽的半兽人部族正在堆骨为塔。去沼泽斩杀 12 只怪物，遏止它们的血祭。',
    objectives: [{ type: 'killAny', count: 12, label: '肃清血月沼泽的妖物' }],
    rewards: { xp: 1600, gold: 800, ilvl: 13, rarity: 'rare', talent: 2 },
    next: 'm1_2_2', require: 'm1_1_5'
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
    next: 'm1_2_4', require: 'm1_2_2'
  },
  /* [M3b] 沉骨滩：1-2 的图位补上了真实地图。骨滩是「岛 + 窄桥」结构，
   * 目标写成 killAny 而不是指定怪 —— 桥窄，玩家在桥上打什么都算数。 */
  m1_2_4: {
    id: 'm1_2_4', part: 1, act: '1-2', kind: 'main',
    name: '沉骨滩', giver: 'campA_main', map: 'bonestrand', zone: 'isleN',
    brief: '沼泽往北是一片骨滩，骨头堆成了岛。踩上去会响 —— 不是踩碎的声音，是挪动的声音。',
    objectives: [{ type: 'killAny', count: 15, label: '肃清沉骨滩的妖物' }],
    rewards: { xp: 3600, gold: 1500, ilvl: 18, rarity: 'rare' },
    next: null, require: 'm1_2_3'
  },

  /* ---------------- 1-3 铁山无声（骨塔祭场 lv13 / 玄铁矿洞 lv16） ---------------- */
  /* [M3b] 骨塔祭场：1-3 的第一张图，所以插在 q7 之前。 */
  m1_3_0: {
    id: 'm1_3_0', part: 1, act: '1-3', kind: 'main',
    name: '骨塔', giver: 'campA_main', map: 'bonetower', zone: 'sanctum',
    brief: '一座用骨头垒起来的塔，塔里有人在念经。念的是往生咒，可塔下的骨头一件都没少。',
    objectives: [{ type: 'boss', target: 'boneabbot', count: 1, label: '击败骨塔主持' }],
    rewards: { xp: 4200, gold: 1700, ilvl: 19, rarity: 'rare', skill: 'poison' },
    next: null, require: 'm1_2_4'
  },
  m1_3_1: {
    id: 'm1_3_1', legacyId: 'q7', part: 1, act: '1-3', kind: 'main',
    name: '石甲与毒鳞', giver: 'campA_main', map: 'swamp', zone: 'sanctum',
    brief: '石甲巨魔与蛇姬·青鳞盘踞沼泽深处，二者皆除，方解此患。',
    objectives: [
      { type: 'boss', target: 'golemking', count: 1, label: '击败石甲巨魔' },
      { type: 'boss', target: 'snakequeen', count: 1, label: '击败蛇姬·青鳞' }
    ],
    rewards: { xp: 3600, gold: 1500, ilvl: 17, rarity: 'set', skill: 'summon' },
    next: 'm1_3_2', require: 'm1_3_0'
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
    /* [M3b] 原来叫「铁山绝顶」，但玩的还是玄铁矿洞 —— 现在真有铁山绝顶这张图了，
     * 名字必须让出来，否则追踪条上会出现两条同名任务。 */
    name: '矿洞尽头的门', giver: 'campA_main', map: 'mine', zone: 'hall',
    brief: '矿洞最深处还有一道门，门后是卷二的第一口冷气。把这里的矿工魂送走，再往北走。',
    objectives: [
      { type: 'kill', target: 'minerghost', count: 8, label: '超度矿工亡魂' },
      { type: 'reach', zone: 'sanctum', count: 1, label: '抵达幽魂祭坛' }
    ],
    rewards: { xp: 6800, gold: 2600, ilvl: 23, rarity: 'rare', talent: 2 },
    next: 'm1_3_4', require: 'm1_3_2'
  },
  /* [M3b] 铁山绝顶：卷一真正的收尾（计划书 §3 的 1-3 卷末首领就是石甲巨魔）。
   * 首任用 golemking —— 老档里 q7 已经在沼泽打过一次，但首领是按图刷新的，
   * 在铁山绝顶再打一次是「追到它的老巢」，叙事上反而更顺。 */
  m1_3_4: {
    id: 'm1_3_4', part: 1, act: '1-3', kind: 'main',
    name: '铁山绝顶', giver: 'campA_main', map: 'ironpeak', zone: 'sanctum',
    brief: '雪线以上没有路，只有踩出来的坑。石甲巨魔就蹲在最高处，等了很多年。',
    objectives: [{ type: 'boss', target: 'golemking', count: 1, label: '击败石甲巨魔' }],
    rewards: { xp: 8600, gold: 3200, ilvl: 25, rarity: 'legendary', skill: 'avatar', talent: 2 },
    next: null, require: 'm1_3_3'
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
    next: 'm2_1_2', require: 'm1_3_4'
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
    next: 'm2_2_1', require: 'm2_1_2'
  },

  /* ---------------- 2-2 熔脉深处（熔脉深沟 lv24 / 灰烬荒原 lv26） ----------------
   * [M3] 这一段是「补图之后任务立刻可接」的验证样本：
   * 地图 4 张一落地，这 5 条主线不需要改任何框架代码就自动出现在玄铁关掌事手上，
   * 因为 questMapOpen() 只判断「目标图存不存在」。 */
  m2_2_1: {
    id: 'm2_2_1', part: 2, act: '2-2', kind: 'main',
    name: '井底的呼吸', giver: 'campB_main', map: 'magmagully', zone: 'hub',
    brief: '熔脉深沟的井底有东西在呼吸，一下一下，和地火一个节奏。先下去看看是什么。',
    objectives: [{ type: 'kill', target: 'magma', count: 14, label: '清掉井底大厅的熔岩怪' }],
    rewards: { xp: 12800, gold: 4200, ilvl: 31, rarity: 'rare' },
    next: 'm2_2_2', require: 'm2_1_3'
  },
  m2_2_2: {
    id: 'm2_2_2', part: 2, act: '2-2', kind: 'main',
    name: '灰烬上的脚印', giver: 'campB_main', map: 'ashfield', zone: 'c4',
    brief: '荒原上只有一个人的脚印，绕了一圈又一圈，最后停在谷底。那东西还在走。',
    objectives: [{ type: 'boss', target: 'ashwarden', count: 1, label: '击败灰烬守望者' }],
    rewards: { xp: 14600, gold: 4800, ilvl: 33, rarity: 'legendary', talent: 1 },
    next: 'm2_2_3', require: 'm2_2_1'
  },
  m2_2_3: {
    id: 'm2_2_3', part: 2, act: '2-2', kind: 'main',
    name: '熔心', giver: 'campB_main', map: 'magmagully', zone: 'sanctum',
    brief: '深井尽头是一颗还在跳的心。熔脉之主守着它，三百年没让它凉过。',
    objectives: [{ type: 'boss', target: 'magmalord', count: 1, label: '击败熔脉之主·赤髓' }],
    rewards: { xp: 16400, gold: 5400, ilvl: 35, rarity: 'legendary', skill: 'pyroclasm' },
    next: 'm2_3_1', require: 'm2_2_2'
  },

  /* ---------------- 2-3 焚天焦土（赤炎峡谷 lv28 / 焚天祭坛 lv30） ---------------- */
  m2_3_1: {
    id: 'm2_3_1', part: 2, act: '2-3', kind: 'main',
    name: '峡谷里的火不肯散', giver: 'campB_main', map: 'flamecanyon', zone: 'sanctum',
    brief: '赤炎峡谷的风是烫的，火却烧不起来 —— 因为烧的不是柴，是不肯走的怨。',
    objectives: [{ type: 'boss', target: 'flamewraith', count: 1, label: '击败焚风怨灵' }],
    rewards: { xp: 18200, gold: 6000, ilvl: 37, rarity: 'legendary' },
    next: 'm2_3_2', require: 'm2_2_3'
  },
  m2_3_2: {
    id: 'm2_3_2', part: 2, act: '2-3', kind: 'main',
    name: '焚天', giver: 'campB_main', map: 'flamealtar', zone: 'sanctum',
    brief: '祭坛上那个人说，焚天不是名号，是他的活。你若拦他，就连你一起烧。',
    objectives: [{ type: 'boss', target: 'flameemperor', count: 1, label: '击败焚天炎帝' }],
    rewards: { xp: 21000, gold: 7200, ilvl: 40, rarity: 'legendary', skill: 'avatar', talent: 2 },
    next: null, require: 'm2_3_1'
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
    next: 'm3_1_2', require: 'm2_3_2'
  },
  /* ---------------- [M3b] 卷三后半 + 卷四 + 卷五：19 张新图的主线 ----------------
   * 主线是单链（同时只能接 1 条），所以新图只能「插进链里」。
   * 每张图一条，首领图的 objective 是 boss，普通图是 killAny ——
   * killAny 而不是指定怪：这些图每张 5 种怪，指定某一种会让玩家在一张
   * 16000㎡ 的图上找那 8 只，体验很差（M2 的 2-2/2-3 已经踩过这个坑）。 */
  m3_1_2: {
    id: 'm3_1_2', part: 3, act: '3-1', kind: 'main',
    name: '白骨长廊', giver: 'campC_main', map: 'bonehall', zone: 'sanctum',
    brief: '长廊是环形的。你走了很久，回到大殿的时候，柱子上的骨头多了一具。',
    objectives: [{ type: 'boss', target: 'marrowlord', count: 1, label: '击败髓主' }],
    rewards: { xp: 13000, gold: 4600, ilvl: 31, rarity: 'legendary', talent: 2 },
    next: 'm3_1_3', require: 'm3_1_1'
  },
  m3_1_3: {
    id: 'm3_1_3', part: 3, act: '3-1', kind: 'main',
    name: '忘川河滩', giver: 'campC_main', map: 'forgetshore', zone: 'nave',
    brief: '河水很浅，只到脚踝。可走过去的人，没有一个回头看。',
    objectives: [{ type: 'boss', target: 'riverwraith', count: 1, label: '击败忘川怨魂' }],
    rewards: { xp: 13500, gold: 4800, ilvl: 32, rarity: 'legendary', skill: 'revive' },
    next: 'm3_2_1', require: 'm3_1_2'
  },
  m3_2_1: {
    id: 'm3_2_1', part: 3, act: '3-2', kind: 'main',
    name: '九幽深渊', giver: 'campC_main', map: 'abyssdeep', zone: 'sanctum',
    brief: '深渊没有底。你往下看的时候，深渊也在数你有几根骨头。',
    objectives: [{ type: 'boss', target: 'abysswyrm', count: 1, label: '击败深渊古蟒' }],
    rewards: { xp: 14500, gold: 5100, ilvl: 34, rarity: 'legendary', talent: 2 },
    next: 'm3_2_2', require: 'm3_1_3'
  },
  m3_2_2: {
    id: 'm3_2_2', part: 3, act: '3-2', kind: 'main',
    name: '黄泉渡', giver: 'campC_main', map: 'yellowferry', zone: 'sanctum',
    brief: '渡口没有船，只有一块碑，上面写着「不渡」。',
    objectives: [{ type: 'boss', target: 'yellowspring', count: 1, label: '击败黄泉主宰' }],
    rewards: { xp: 16000, gold: 5600, ilvl: 37, rarity: 'legendary', skill: 'avatar', talent: 3 },
    next: 'm4_1_1', require: 'm3_2_1'
  },

  /* ==========================================================
   * 卷四 · 剑冢天阙（41–50）
   * ========================================================== */
  m4_1_1: {
    id: 'm4_1_1', part: 4, act: '4-1', kind: 'main',
    name: '天罡剑冢', giver: 'campD_main', map: 'swordtomb', zone: 'sanctum',
    brief: '冢里埋的不是人，是剑。守灵替它们记着名字，一个都没忘。',
    objectives: [{ type: 'boss', target: 'swordguardian', count: 1, label: '击败剑冢守灵' }],
    rewards: { xp: 17200, gold: 6000, ilvl: 38, rarity: 'legendary', talent: 2 },
    next: 'm4_1_2', require: 'm3_2_2'
  },
  m4_1_2: {
    id: 'm4_1_2', part: 4, act: '4-1', kind: 'main',
    name: '万剑坑', giver: 'campD_main', map: 'swordpit', zone: 'sanctum',
    brief: '坑是被剑砸出来的。坑底插着一柄，没人拔得出来 —— 也没人拔得动。',
    objectives: [{ type: 'boss', target: 'bladelord', count: 1, label: '击败万剑之君' }],
    rewards: { xp: 18400, gold: 6400, ilvl: 40, rarity: 'legendary', skill: 'swordrain' },
    next: 'm4_1_3', require: 'm4_1_1'
  },
  m4_1_3: {
    id: 'm4_1_3', part: 4, act: '4-1', kind: 'main',
    name: '剑冢绝巅', giver: 'campD_main', map: 'swordapex', zone: 'sanctum',
    brief: '雪线之上站着一个人。他没拔剑，你就已经输了半招。',
    objectives: [{ type: 'boss', target: 'swordemperor', count: 1, label: '击败剑帝' }],
    rewards: { xp: 19000, gold: 6600, ilvl: 40, rarity: 'legendary', talent: 3 },
    next: 'm4_2_1', require: 'm4_1_2'
  },
  m4_2_1: {
    id: 'm4_2_1', part: 4, act: '4-2', kind: 'main',
    name: '云海断桥', giver: 'campD_main', map: 'cloudbridge', zone: 'sanctum',
    brief: '两座云台之间只剩半截桥。桥是对面那个人拆的，他还在那头站着。',
    objectives: [{ type: 'boss', target: 'cloudwarden', count: 1, label: '击败云海守将' }],
    rewards: { xp: 21000, gold: 7300, ilvl: 43, rarity: 'legendary', skill: 'judgement' },
    next: 'm4_2_2', require: 'm4_1_3'
  },
  m4_2_2: {
    id: 'm4_2_2', part: 4, act: '4-2', kind: 'main',
    name: '南天残门', giver: 'campD_main', map: 'southgate', zone: 'sanctum',
    brief: '门塌了一半，守门神还站在原地。他说南天不开，就真的不开。',
    objectives: [{ type: 'boss', target: 'heavenguard', count: 1, label: '击败南天守门神' }],
    rewards: { xp: 21500, gold: 7500, ilvl: 44, rarity: 'legendary', skill: 'avatar', talent: 3 },
    next: 'm5_1_1', require: 'm4_2_1'
  },

  /* ==========================================================
   * 卷五 · 无相镜渊（51–60）
   * ========================================================== */
  m5_1_1: {
    id: 'm5_1_1', part: 5, act: '5-1', kind: 'main',
    name: '玉京废墟', giver: 'campE_main', map: 'jadecapital', zone: 'sanctum',
    brief: '玉京塌了，可大殿上还坐着一位。他坐得很端正，像是怕你看出什么。',
    objectives: [{ type: 'boss', target: 'jadeemperor', count: 1, label: '击败玉京残帝' }],
    rewards: { xp: 23000, gold: 8100, ilvl: 45, rarity: 'legendary', talent: 2 },
    next: 'm5_1_2', require: 'm4_2_2'
  },
  m5_1_2: {
    id: 'm5_1_2', part: 5, act: '5-1', kind: 'main',
    name: '星陨台', giver: 'campE_main', map: 'starfall', zone: 'sanctum',
    brief: '台上的坑一个比一个大。最大的那个坑里，站着一个抬头看天的人。',
    objectives: [{ type: 'boss', target: 'starlord', count: 1, label: '击败陨星之主' }],
    rewards: { xp: 24500, gold: 8600, ilvl: 46, rarity: 'legendary', skill: 'meteor' },
    next: 'm5_1_3', require: 'm5_1_1'
  },
  m5_1_3: {
    id: 'm5_1_3', part: 5, act: '5-1', kind: 'main',
    name: '无相幻境', giver: 'campE_main', map: 'mirrorrealm', zone: 'sanctum',
    brief: '幻境里什么都是熟的：这条路你走过，这间厅你站过，对面那个人 —— 也是你。',
    objectives: [{ type: 'boss', target: 'mirrordemon', count: 1, label: '击败无相天魔' }],
    rewards: { xp: 26000, gold: 9100, ilvl: 47, rarity: 'legendary', talent: 3 },
    next: 'm5_1_4', require: 'm5_1_2'
  },
  m5_1_4: {
    id: 'm5_1_4', part: 5, act: '5-1', kind: 'main',
    name: '镜渊', giver: 'campE_main', map: 'mirrorabyss', zone: 'sanctum',
    brief: '渊底是一面镜子。你往下看，镜子里的人抬头看你 —— 他比你早到一步。',
    objectives: [{ type: 'boss', target: 'mirrorlord', count: 1, label: '击败镜渊之主' }],
    rewards: { xp: 27000, gold: 9500, ilvl: 48, rarity: 'legendary', skill: 'thundercloud' },
    next: 'm5_1_5', require: 'm5_1_3'
  },
  m5_1_5: {
    id: 'm5_1_5', part: 5, act: '5-1', kind: 'main',
    name: '九霄之巅', giver: 'campE_main', map: 'nineapex', zone: 'sanctum',
    brief: '再往上就没有天了。神将站在最后一级台阶上，替天守着最后一道门。',
    objectives: [{ type: 'boss', target: 'nineheaven', count: 1, label: '击败九霄神将' }],
    rewards: { xp: 28000, gold: 9800, ilvl: 48, rarity: 'legendary', skill: 'pyroclasm', talent: 3 },
    next: null, require: 'm5_1_4'
  },

  /* ==========================================================
   * 卷五 · 终焉之门（59–60）
   * m5_2_1 是 q11（老档要认 legacyId），所以它的 objectives 一个字都不能动 ——
   * 它在天阙残境打的是「无相天魔伸出来的那只手」，真身在混沌海，就是 m5_2_2。
   * 这样既保住了老档，又给了终局一个「追进去」的落点。
   * ========================================================== */
  m5_2_1: {
    id: 'm5_2_1', legacyId: 'q11', part: 5, act: '5-2', kind: 'main',
    name: '九霄终焉', giver: 'campE_main', map: 'heaven', zone: 'sanctum',
    brief: '混沌无相天魔吞尽九霄灵气，天阙已残。此战，为苍生，也为你自己。',
    objectives: [{ type: 'boss', target: 'chaos', count: 1, label: '击败混沌·无相天魔' }],
    rewards: { xp: 30000, gold: 12000, ilvl: 40, rarity: 'legendary', skill: 'avatar', talent: 3 },
    next: 'm5_2_2', require: 'm5_1_5'
  },
  /* [M3b] 混沌海：全作最后一张图，也是最后一个任务。
   * 击败的是 chaosavatar（真身），不是天阙里那具分身。 */
  m5_2_2: {
    id: 'm5_2_2', part: 5, act: '5-2', kind: 'main',
    name: '混沌海', giver: 'campE_main', map: 'chaossea', zone: 'nave',
    brief: '天阙那一具，只是他伸出去的手。手断了，他还在。海面上一块一块的岛，都是他吞下去的东西。',
    objectives: [{ type: 'boss', target: 'chaosavatar', count: 1, label: '击败混沌·无相天魔（真身）' }],
    rewards: { xp: 40000, gold: 18000, ilvl: 52, rarity: 'legendary', skill: 'avatar', talent: 5 },
    next: null, require: 'm5_2_1'
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

  /* ---------------- [M3b] 新图支线：一卷一条 ----------------
   * require 全部写 null 而不是串成链 —— 支线同时只能接 2 条，
   * 串成链会让「接了 s1_1_2 就接不了别的」，玩家反而更受限制。
   * 能不能接由「图开没开」决定（questMapOpen），等级门槛已经在图上了。 */
  s1_1_2: {
    id: 's1_1_2', part: 1, act: '1-1', kind: 'side',
    name: '坡上的灯', giver: 'campA_side', map: 'sunset', zone: 't3',
    brief: '落霞坡顶上有盏灯，天一黑就亮。录事说那是引路的，可坡上根本没有路。',
    objectives: [{ type: 'kill', target: 'lantern', count: 10, label: '熄灭坡上的引路灯' }],
    rewards: { xp: 800, gold: 420, ilvl: 8, rarity: 'magic' },
    repeat: false, require: null
  },
  s3_1_2: {
    id: 's3_1_2', part: 3, act: '3-1', kind: 'side',
    name: '忘川的鞋', giver: 'campC_side', map: 'forgetshore', zone: 'isleN',
    brief: '河滩上摆着一双鞋，鞋尖朝着来路。录事说，那是他自己很多年前脱下的。',
    objectives: [
      { type: 'reach', zone: 'isleN', count: 1, label: '走到忘川北滩' },
      { type: 'kill', target: 'drowned', count: 8, label: '送走河里的溺者' }
    ],
    rewards: { xp: 13000, gold: 4600, ilvl: 32, rarity: 'rare' },
    repeat: false, require: null
  },
  s4_1_2: {
    id: 's4_1_2', part: 4, act: '4-1', kind: 'side',
    name: '剑冢的名单', giver: 'campD_side', map: 'swordtomb', zone: 'hub',
    brief: '守灵手里有一卷名单，写满了名字。最后一行是空的 —— 他说那是留给你的。',
    objectives: [{ type: 'kill', target: 'swordwraith', count: 10, label: '收走游荡的剑魂' }],
    rewards: { xp: 17000, gold: 5900, ilvl: 38, rarity: 'rare' },
    repeat: false, require: null
  },
  s5_1_1: {
    id: 's5_1_1', part: 5, act: '5-1', kind: 'side',
    name: '镜子里的人', giver: 'campE_side', map: 'mirrorrealm', zone: 'hall',
    brief: '幻境里有个和你一模一样的人，他也在打怪，也在找路。你们迟早要碰面。',
    objectives: [{ type: 'killAny', count: 15, label: '清掉幻境里的影子' }],
    rewards: { xp: 25000, gold: 8800, ilvl: 46, rarity: 'rare' },
    repeat: false, require: null
  },

  /* ==========================================================
   * 悬赏（任务板发，可重复）
   * giver 统一写 'board'，按 part 分组；8 分钟刷新一次。
   * map: 'any' = 任意图都能推进（只统计 killAny）。
   *
   * [M6] 每卷第 4 条是「地脉悬赏」—— objectives 走 dungeon 类型，
   * 由 Dungeon.finish() 通关时 _bump（此前 QuestSys.onDungeon 从没被调用过）。
   * 为什么加它：计划书 §10.2 写死了「卷五 40% 的经验靠地下城与悬赏补，
   * 不靠再加两张图」，而在此之前地脉和任务是两条永不相交的线 ——
   * 花一把钥匙进去出来，任务板一点不动。
   * 不给 dtype：KEY_TIERS 的钥匙不带类型，5 类是门口自选的，
   * 写死某一类会让「手上只有这一类能打」的玩家接了做不了。
   *
   * [P01-A2] 击杀量上限 = 单图一轮能打完的数量（spawnCount × 0.8 ≈ 32~36）。
   *
   * 原来最大的三条是 60 / 70 / 80 —— 而一张图只刷 40~56 只、死了不补，
   * 于是「杀 80 只」必然要出图重进三次（用户原话「要开地图几次才能刷满」）。
   * 现在野图有了补位器（game.js 的 updateRespawn），理论上 80 只也能一张图打完，
   * 但那要原地磨六七分钟 —— 悬赏是「顺手接的零活」，不该变成单图刷怪场。
   *
   * **奖励同步按比例缩了**：任务量砍到 45% 而奖励不动，等于 XP/金币 单价翻倍，
   * 会把悬赏变成最划算的刷钱途径（P16 刚把符文砍下来，不能这边又开一个口子）。
   * 缩放口径：`新奖励 = 旧奖励 × 新数量 / 旧数量`，xp 取整到百、gold 取整到五十。
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
    objectives: [{ type: 'killAny', count: 34, label: '斩杀任意妖物' }],
    rewards: { xp: 1600, gold: 1200 }, repeat: true, require: null
  },
  b1_4: {
    id: 'b1_4', part: 1, kind: 'board', name: '悬赏·裂隙',
    giver: 'board', map: 'any', zone: null,
    brief: '地脉守最近不太爱说话。帮他走一趟，别问里面是什么。',
    objectives: [{ type: 'dungeon', tier: 1, count: 1, label: '通关一次一阶地脉（任一类）' }],
    rewards: { xp: 4000, gold: 2700 }, repeat: true, require: null
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
    objectives: [{ type: 'killAny', count: 32, label: '斩杀任意妖物' }],
    rewards: { xp: 3000, gold: 1900 }, repeat: true, require: null
  },
  b2_3: {
    id: 'b2_3', part: 2, kind: 'board', name: '悬赏·关外',
    giver: 'board', map: 'any', zone: null, brief: '关外三十里，见者皆敌。不必带回证据，回来就算。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 3100, gold: 2050 }, repeat: true, require: null
  },
  b2_4: {
    id: 'b2_4', part: 2, kind: 'board', name: '悬赏·裂隙',
    giver: 'board', map: 'any', zone: null,
    brief: '关外的裂缝越撑越大。填不上，就下去把那头的口子堵了。',
    objectives: [{ type: 'dungeon', tier: 2, count: 1, label: '通关一次二阶地脉（任一类）' }],
    rewards: { xp: 9600, gold: 5100 }, repeat: true, require: null
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
    objectives: [{ type: 'killAny', count: 34, label: '斩杀任意妖物' }],
    rewards: { xp: 6200, gold: 3650 }, repeat: true, require: null
  },
  b3_3: {
    id: 'b3_3', part: 3, kind: 'board', name: '悬赏·无名',
    giver: 'board', map: 'any', zone: null, brief: '这一条没有署名，也没有理由。接了就别问。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 6100, gold: 3550 }, repeat: true, require: null
  },
  b3_4: {
    id: 'b3_4', part: 3, kind: 'board', name: '悬赏·裂隙',
    giver: 'board', map: 'any', zone: null,
    brief: '黄泉的水位在涨。涨的不是水。',
    objectives: [{ type: 'dungeon', tier: 3, count: 1, label: '通关一次三阶地脉（任一类）' }],
    rewards: { xp: 21000, gold: 9600 }, repeat: true, require: null
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
    objectives: [{ type: 'killAny', count: 35, label: '斩杀任意妖物' }],
    rewards: { xp: 11200, gold: 6000 }, repeat: true, require: null
  },
  b4_3: {
    id: 'b4_3', part: 4, kind: 'board', name: '悬赏·拾遗',
    giver: 'board', map: 'any', zone: null, brief: '遗物归位之前，先清场。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 10800, gold: 5650 }, repeat: true, require: null
  },
  b4_4: {
    id: 'b4_4', part: 4, kind: 'board', name: '悬赏·裂隙',
    giver: 'board', map: 'any', zone: null,
    brief: '断桥底下压着的东西在动。它每动一次，桥就短一寸。',
    objectives: [{ type: 'dungeon', tier: 4, count: 1, label: '通关一次四阶地脉（任一类）' }],
    rewards: { xp: 40000, gold: 16500 }, repeat: true, require: null
  },
  b5_1: {
    id: 'b5_1', part: 5, kind: 'board', name: '悬赏·九霄',
    giver: 'board', map: 'any', zone: null, brief: '最后一页册子上，只写了一个字：杀。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 21600, gold: 10800 }, repeat: true, require: null
  },
  b5_2: {
    id: 'b5_2', part: 5, kind: 'board', name: '悬赏·终焉',
    giver: 'board', map: 'any', zone: null, brief: '走到这里的人不需要理由了。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 19200, gold: 9600 }, repeat: true, require: null
  },
  b5_3: {
    id: 'b5_3', part: 5, kind: 'board', name: '悬赏·无相',
    giver: 'board', map: 'any', zone: null, brief: '镜渊照不出人影了。照不出，就都清掉。',
    objectives: [{ type: 'killAny', count: 36, label: '斩杀任意妖物' }],
    rewards: { xp: 18900, gold: 9450 }, repeat: true, require: null
  },
  b5_4: {
    id: 'b5_4', part: 5, kind: 'board', name: '悬赏·裂隙',
    giver: 'board', map: 'any', zone: null,
    brief: '走到这一步的人，没有谁是被派去的。',
    objectives: [{ type: 'dungeon', tier: 5, count: 1, label: '通关一次五阶地脉（任一类）' }],
    rewards: { xp: 82000, gold: 31500 }, repeat: true, require: null
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

/* ---------------- 交付人（P11） ----------------
 *
 * 为什么需要单独一张「交付人」而不是直接用 `giver`：
 *
 *   主线 / 支线：谁发的交给谁，`giver` 就够了。
 *   **悬赏：`giver` 写的是 `'board'`** —— 任务板不是 NPC，`npcIdOfGiver('board')`
 *   还是 `'board'`，而 `QuestSys.readyOf()` 是按 `q.giver === giverId` 过滤的，
 *   于是「录事手上可复命的悬赏」永远是空数组。
 *
 * 这一条就是 P11 的根因，而且比用户描述的更严重：不只是「没提示交给谁」，
 * 是**根本交不掉** —— 悬赏完成后没有任何 NPC 认这条账，玩家只能放弃重接。
 *
 * 悬赏是「卷」级的（`part: 1~5`），录事也是「卷」级的（`campA_side`~`campE_side`），
 * 两者天然一一对应，所以默认交付人 = 本卷录事。真需要特例时在任务上写 `turnIn` 覆盖。
 */
function turnInOf(q) {
  if (!q) return null;
  if (q.turnIn) return q.turnIn;
  if (q.kind === 'board') {
    const letter = 'ABCDE'[Math.max(0, Math.min(4, (q.part || 1) - 1))];
    return 'camp' + letter + '_side';
  }
  return q.giver || null;
}

/** 交付人 → 真正的 NPC id（campA_main → elder） */
function turnInNpcOf(q) { return npcIdOfGiver(turnInOf(q)); }

/** 交付人显示名。追踪条 / 对话 / 面板三处共用，避免三处各写一套。 */
function turnInNameOf(q) {
  const id = turnInNpcOf(q);
  return (typeof NPCS !== 'undefined' && NPCS[id]) ? NPCS[id].name : '掌事';
}
