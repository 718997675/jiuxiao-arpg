/* ============================================================
 * 数据层 · 世界
 * 地图 / NPC / 任务链
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

/* ---------------- 地图 ---------------- */
const MAPS = {
  village: {
    id: 'village', name: '桃源村', safe: true, level: 1, camp: 'campA',
    ground: 'dirt', sky: 0x9fc7d9, fog: 0xa8c8d8, fogNear: 45, fogFar: 120,
    size: 70, ambient: 0xbfd9e6, sun: 0xffe6b8, sunI: 1.05, props: 'village',
    npcs: ['elder', 'smith', 'herbalist', 'monk', 'alchemist', 'warden', 'steward', 'campA_side'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }, music: 'calm'
  },
  forest: {
    id: 'forest', name: '幽篁林', safe: false, level: 4,
    ground: 'bamboo', sky: 0x7fae8f, fog: 0x93b89c, fogNear: 42, fogFar: 132,
    size: 130, ambient: 0xa8d0b0, sun: 0xd8f0c0, sunI: 0.95, props: 'bamboo',
    spawns: ['halfork', 'bat', 'skelarch', 'wolf', 'hornet', 'fox', 'lantern', 'bamboo', 'shigandang'], spawnCount: 10, bosses: ['treeking', 'batking'],
    portal: { x: 0, z: 49.3 }, unlock: 1
  },
  swamp: {
    id: 'swamp', name: '血月沼泽', safe: false, level: 12,
    ground: 'swamp', sky: 0x5a3a3a, fog: 0x6b3f3f, fogNear: 39, fogFar: 126,
    size: 140, ambient: 0x8a6a6a, sun: 0xff9a7a, sunI: 0.8, props: 'swamp',
    spawns: ['spider', 'boar', 'snake', 'scorpion', 'zombie', 'drowned', 'brood', 'wasp', 'toad', 'bogwitch'], spawnCount: 11,
    bosses: ['chief', 'golemking', 'snakequeen'], portal: { x: 0, z: 55.1 }, unlock: 8
  },
  mine: {
    id: 'mine', name: '玄铁矿洞', safe: false, level: 20,
    ground: 'rock', sky: 0x2a2a33, fog: 0x2e2a2a, fogNear: 31, fogFar: 105,
    size: 130, ambient: 0x6a6a78, sun: 0xffbb66, sunI: 0.7, props: 'mine',
    spawns: ['golem', 'ghost', 'yaoguai', 'ghostfire', 'statue', 'scorpking', 'minerghost', 'magma', 'ironbeetle', 'runesmith'], spawnCount: 11,
    bosses: ['ghostlord', 'firegeneral', 'icequeen'], portal: { x: 0, z: 52.2 }, unlock: 16
  },
  abyss: {
    id: 'abyss', name: '九幽地宫', safe: false, level: 28,
    ground: 'abyss', sky: 0x1a1420, fog: 0x1e1626, fogNear: 28, fogFar: 98,
    size: 134, ambient: 0x6a5a7a, sun: 0x9a6aff, sunI: 0.65, props: 'abyss',
    spawns: ['ghostfire', 'bloodlord', 'yaoguai', 'golem', 'headless', 'crane', 'bonewright', 'shade', 'ironmaiden'], spawnCount: 12,
    bosses: ['spidermother', 'ferryman', 'swordlord'], portal: { x: 0, z: 53.7 }, unlock: 24
  },
  heaven: {
    id: 'heaven', name: '天阙残境', safe: false, level: 35,
    ground: 'heaven', sky: 0x2a3a5a, fog: 0x40527a, fogNear: 36, fogFar: 119,
    size: 134, ambient: 0x9ab0e0, sun: 0xffe0a0, sunI: 0.95, props: 'heaven',
    spawns: ['bloodlord', 'ghostfire', 'golem', 'yaoguai', 'fallen', 'voidbeast', 'swordwraith', 'thunderbird', 'jadeguard'], spawnCount: 12,
    bosses: ['chaos'], portal: { x: 0, z: 53.7 }, unlock: 32
  },
  /* ---------------- 卷二 · 血月焚天（M2 前置） ----------------
   * M1 收尾时卷二整卷 6 个图位全是 id: null —— 任务链写出来无处可落，
   * 测试只能靠改等级硬跳，验不出真问题。所以 M2 开工前先把 2-1 的两张补上。
   *
   * 只做「新地貌 + 换皮」：8 区拓扑照抄九幽地宫，专属场景与骨架留给 M3。
   * ground: 'ice' 是本次新增的地貌（world.js makeGroundTexture），
   * 让卷二一眼看出「这是另一个世界」，而不是又一张玄铁矿洞。 */
  frost: {
    id: 'frost', name: '寒潭水牢', safe: false, level: 20,
    ground: 'ice', sky: 0x2a3e52, fog: 0x3a5468, fogNear: 33, fogFar: 108,
    size: 130, ambient: 0x8aa8c0, sun: 0xbcdcff, sunI: 0.75, props: 'mine',
    spawns: ['drowned', 'bogwitch', 'toad', 'ghost', 'snake', 'zombie'], spawnCount: 12,
    bosses: ['icequeen'], portal: { x: 0, z: 52.2 }, unlock: 19
  },
  icelake: {
    id: 'icelake', name: '冰魄湖', safe: false, level: 22,
    ground: 'ice', sky: 0x3a5570, fog: 0x4a6a88, fogNear: 38, fogFar: 120,
    size: 140, ambient: 0x9ac0d8, sun: 0xd8f0ff, sunI: 0.85, props: 'swamp',
    spawns: ['drowned', 'toad', 'bogwitch', 'brood', 'spider', 'wasp'], spawnCount: 12,
    bosses: ['spidermother'], portal: { x: 0, z: 55.1 }, unlock: 21
  },
  /* ---------------- 卷二 · 血月焚天 2-2 / 2-3（M3 第一批） ----------------
   * 这 4 张是骨架系统（data-maps.js 的 ZONE_ARCHETYPES）的第一批使用者：
   * 这里只声明「用哪种骨架 + 多大」，zone 坐标、刷怪分配、首领落点全部自动展开。
   *
   * 几个数字的来由，改之前先看 data-maps.js 的注释：
   *   size 290~300 —— 低于 285 时 §5.1 的「可走面积 ≥16000㎡」与
   *                   「密度 380~450㎡/只」在数学上无法同时成立
   *   spawnCount   —— 与 buildZones 推导出的数量一致（zone-check 会核对），
   *                   只作为 UI/调试的显示值，实际刷怪走 zone
   *   fogFar       —— §5.1 要求 170~210；地图大了雾距不跟上的话，
   *                   玩家会看到远处是一片纯色背景
   *   portal       —— 必须落在入口 zone 内（zone-check 逐张校验） */
  magmagully: {
    id: 'magmagully', name: '熔脉深沟', safe: false, level: 24,
    ground: 'rock', sky: 0x2e1a14, fog: 0x3a2018, fogNear: 52, fogFar: 178,
    size: 290, ambient: 0x9a6a58, sun: 0xff8a4a, sunI: 0.8, props: 'mine',
    spawns: ['magma', 'ironbeetle', 'golem', 'runesmith', 'ghostfire'], spawnCount: 40,
    bosses: ['magmalord'], portal: { x: 0, z: 75 }, unlock: 23
  },
  ashfield: {
    id: 'ashfield', name: '灰烬荒原', safe: false, level: 26,
    ground: 'ash', sky: 0x3a2e26, fog: 0x46362a, fogNear: 56, fogFar: 186,
    size: 295, ambient: 0xa8846a, sun: 0xffb070, sunI: 0.86, props: 'mine',
    spawns: ['magma', 'ghostfire', 'ironbeetle', 'runesmith', 'golem'], spawnCount: 42,
    bosses: ['ashwarden'], portal: { x: 0, z: 77.6 }, unlock: 25
  },
  flamecanyon: {
    id: 'flamecanyon', name: '赤炎峡谷', safe: false, level: 28,
    ground: 'ash', sky: 0x40180e, fog: 0x4e2010, fogNear: 58, fogFar: 194,
    size: 300, ambient: 0xb06a4a, sun: 0xff9a50, sunI: 0.9, props: 'mine',
    spawns: ['magma', 'ghostfire', 'runesmith', 'golem', 'statue'], spawnCount: 43,
    bosses: ['flamewraith'], portal: { x: 0, z: 79 }, unlock: 27
  },
  flamealtar: {
    id: 'flamealtar', name: '焚天祭坛', safe: false, level: 30,
    ground: 'ash', sky: 0x50140a, fog: 0x5e1c0c, fogNear: 60, fogFar: 190,
    size: 295, ambient: 0xc07a52, sun: 0xffb060, sunI: 0.95, props: 'heaven',
    spawns: ['magma', 'ghostfire', 'statue', 'runesmith', 'golem'], spawnCount: 42,
    bosses: ['flameemperor'], portal: { x: 0, z: 58.2 }, unlock: 29
  },
  /* ---------------- 营地 B~E（M1） ----------------
   * 复用村的布局（props: 'village'），只换地面纹理与色调 ——
   * M1 的验收口径是「进得去、出得来、传得动」，专属场景留给 M3。
   * camp: 'campB' 让 world.js 认出「这是营地」，走换皮而不是原始村配色。
   *
   * 为什么先不放 elder：现有 q1~q11 整条链都挂在桃源村村长身上，
   * 营地里再摆一个 elder 会让任务对话指向错误的地方。等 M2 重做任务系统、
   * 每卷配自己的任务发布者时再加。 */
  campB: {
    id: 'campB', name: '玄铁关', safe: true, level: 19, camp: 'campB',
    ground: 'rock', sky: 0x4a3230, fog: 0x5a3a34, fogNear: 40, fogFar: 118,
    size: 78, ambient: 0xa87a68, sun: 0xff9a6a, sunI: 0.85, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward', 'campB_main', 'campB_side'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campC: {
    id: 'campC', name: '忘川渡', safe: true, level: 31, camp: 'campC',
    ground: 'abyss', sky: 0x1e2438, fog: 0x28304a, fogNear: 38, fogFar: 112,
    size: 76, ambient: 0x7a86b8, sun: 0x9ab0ff, sunI: 0.7, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward', 'campC_main', 'campC_side'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campD: {
    id: 'campD', name: '南天关', safe: true, level: 41, camp: 'campD',
    ground: 'heaven', sky: 0x3a4a6a, fog: 0x50628a, fogNear: 42, fogFar: 126,
    size: 80, ambient: 0xa8bcd8, sun: 0xfff0c8, sunI: 1.0, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward', 'campD_main', 'campD_side'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campE: {
    id: 'campE', name: '九霄台', safe: true, level: 51, camp: 'campE',
    ground: 'trial', sky: 0x2a1e3e, fog: 0x38264e, fogNear: 40, fogFar: 120,
    size: 78, ambient: 0xb8a4dc, sun: 0xffd890, sunI: 1.05, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward', 'campE_main', 'campE_side'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  /* ---------------- 无尽试炼场（v2.0） ----------------
   * 特殊地图：spawns / bosses 都为空 —— 刷怪完全由 src/trial.js 接管
   * （updateSpawner 看到 spawns 为空会直接 return，不会往里塞野生怪）。
   * trial: true 用于各处「这是试炼场」的判断，免得靠 id 字符串比较。 */
  trial: {
    id: 'trial', name: '九霄试炼场', safe: false, level: 1,
    ground: 'trial', sky: 0x1a1426, fog: 0x2c2038, fogNear: 40, fogFar: 118,
    size: 78, ambient: 0xb4a4dc, sun: 0xffe0b8, sunI: 1.02, props: 'trial',
    spawns: [], spawnCount: 0, bosses: [], portal: { x: 0, z: 30 }, unlock: 6, trial: true
  }
};

/* ---------------- NPC ---------------- */
const NPCS = {
  elder: { id: 'elder', name: '桃源村长', glyph: '村', color: 0xd8c8a0, role: 'quest', lines: ['九霄震动，妖气冲天。年轻人，你来得正是时候。', '村外的幽篁林，已经不太平了。'] },
  smith: { id: 'smith', name: '铁匠·石九', glyph: '铁', color: 0x9a7a5a, role: 'shop', lines: ['好钢要千锤百炼，人也一样。', '看看这些家什，都是好货。'] },
  herbalist: { id: 'herbalist', name: '药师·青娘', glyph: '药', color: 0x7fb08a, role: 'potion', lines: ['伤药苦口，但能救命。', '血月一出，草药都染了邪气。'] },
  monk: { id: 'monk', name: '云游道人', glyph: '道', color: 0xc0b090, role: 'travel', lines: ['天地为炉，众生为薪。', '想去何处？贫道为你开一道口子。'] },
  alchemist: { id: 'alchemist', name: '炼金师·丹朱', glyph: '炼', color: 0xc08060, role: 'decompose', lines: ['万物皆可炼，废铁也能出玄晶。', '想提升装备品质？得先准备足够的材料。'] },
  /* 试炼使者：无尽试炼的入口。放在村里而不是菜单里 —— 玩家是「走过去、说话、
   * 上台」，这条动线本身就在讲故事，比一个面板按钮有分量。 */
  warden: {
    id: 'warden', name: '试炼使者·无咎', glyph: '试', color: 0xa88ad8, role: 'trial',
    lines: ['台上无岁月，只有一波接一波。', '试炼场不问你从哪来，只问你能站到第几波。', '死了不丢东西，丢的是那一口不甘心。']
  },
  /* [M6] 仓管：储物箱的入口。和试炼使者同理 —— 仓库放在村里而不是菜单里，
   * 玩家是「走过去、把东西交给他」，存取本身就有了一趟路的分量；
   * 也顺手给村庄多一个可去的地方，而不是全靠快捷键开面板。 */
  steward: {
    id: 'steward', name: '仓管·玄贮', glyph: '贮', color: 0x7a9aa8, role: 'stash',
    lines: ['东西交给我，丢不了。三个身份共用一间库房，你换个人来也认得出。',
      '库里空着的时候最安静，满了就要收拾了。']
  },

  /* ---------------- [M2] 营地任务发布者 ----------------
   * 一营一个「掌事」（发主线）+ 一个「录事」（发支线）。
   * 桃源村的掌事仍然是老村长（campA_main = elder 的别名），
   * 这样老档里 q1~q11 那条链的对话人不变，玩家的记忆不断。
   *
   * 为什么每营都要有自己的发布者：卷一的主线全挂在村长身上，
   * 玩家到了卷二营地还是得跑回桃源村接任务 —— 一条动线跑三卷，
   * 这不是「史诗感」，是「跑腿」。 */
  campB_main: {
    id: 'campB_main', name: '关隘掌事·铁成', glyph: '掌', color: 0xc09868, role: 'quest',
    lines: ['铁关之外，血月照了三十年。', '你从桃源来？那一路的妖气，我隔着关墙都闻得到。']
  },
  campC_main: {
    id: 'campC_main', name: '忘川掌事·渡厄', glyph: '掌', color: 0x8a9ac8, role: 'quest',
    lines: ['忘川无渡，白骨为舟。', '生者至此，皆须留名 —— 你的名字，我记下了。']
  },
  campD_main: {
    id: 'campD_main', name: '南天掌事·守阙', glyph: '掌', color: 0xb0bcd8, role: 'quest',
    lines: ['万剑归冢，天阙断阙。', '这里的每一块砖，都压着一个不肯走的剑魂。']
  },
  campE_main: {
    id: 'campE_main', name: '九霄掌事·观澜', glyph: '掌', color: 0xd8b86a, role: 'quest',
    lines: ['走到九霄台的人，前面就没有路了。', '不是没有路，是路要自己踏出来。']
  },
  campA_side: {
    id: 'campA_side', name: '录事·青简', glyph: '录', color: 0x9aa87a, role: 'quest',
    lines: ['村里的大小事，我都记在简上。', '有些事不算大事，但总得有人去。']
  },
  campB_side: {
    id: 'campB_side', name: '录事·墨关', glyph: '录', color: 0xa89a7a, role: 'quest',
    lines: ['关里的账，一半是粮，一半是命。', '帮个忙？不白帮。']
  },
  campC_side: {
    id: 'campC_side', name: '录事·纸灯', glyph: '录', color: 0x8a9ab8, role: 'quest',
    lines: ['黄泉路上也要点灯，不然找不到回来的道。', '我这灯，缺个提灯的人。']
  },
  campD_side: {
    id: 'campD_side', name: '录事·拾遗', glyph: '录', color: 0xa8b0c0, role: 'quest',
    lines: ['剑冢里的东西，捡回来都算遗物。', '遗物要归位，不然夜里会响。']
  },
  campE_side: {
    id: 'campE_side', name: '录事·末页', glyph: '录', color: 0xc8b078, role: 'quest',
    lines: ['这本册子只剩最后一页了。', '写完这一页，就没有下一页了。']
  }
};

/* 桃源村的掌事就是老村长 —— 别名，不新建 NPC。
 * 任务数据里统一写 campA_main，读的时候经 NPC_ALIAS 落到 elder 身上。 */
const NPC_ALIAS = { campA_main: 'elder' };

/* 反查表：elder → campA_main。挂任务标记、开对话都要用。
 * 单向别名会让「谁是这个 NPC 对应的发布者」没法算，所以两张表都留着。 */
const NPC_GIVER = {};
for (const k in NPC_ALIAS) NPC_GIVER[NPC_ALIAS[k]] = k;

/** NPC id → 任务发布者 id（elder → campA_main；其余原样返回） */
function giverOfNpc(npcId) { return NPC_GIVER[npcId] || npcId; }

/** 发布者 id → 属于第几卷（campB_main → 2；任务板按卷分） */
function partOfGiver(giverId) {
  const m = /^camp([A-E])_/.exec(giverId || '');
  if (m) return 'ABCDE'.indexOf(m[1]) + 1;
  return 1;
}

/* ---------------- 任务链 ----------------
 * [M2] 已迁到 src/data/data-quests.js（任务与地图解耦）。
 * 这里只留一行说明，避免以后有人以为任务数据还在本文件里找。 */

/* ============================================================
 * 世界结构 · M0 地基
 *
 *   卷（Part，5）  —— 世界的大阶段：1 座营地 + 1 道大传送门 + 1 阶钥匙
 *   章（Act，12）  —— 剧情单元：若干张区域图 + 章节首领
 *   图（Map，30）  —— 实际能进的地图（zone / 任务区 / 地下城）
 *
 * ⚠ M0 只搭骨架，不改地图本身：
 *   - 30 个图位里只有 6 个有真实地图（`id` 非空），其余 `id: null` = 未开放，M3 再补
 *   - 图的 `lv` 是**方案目标等级**（docs/ACT-EXPANSION-PLAN.md §3.3），
 *     和 `MAPS[x].level`（现有玩法等级）暂时可以不一致，M3 统一重定级时才对齐
 *   - 卷的等级段（from/to）用于 UI 显示与门禁，不参与经验计算
 * ============================================================ */

const PARTS = {
  1: {
    id: 1, name: '桃源残照', from: 1, to: 18, tone: '#8fa87a',
    camp: 'campA', portal: 'portalA', portalName: '桃源古道',
    keyName: '一阶 · 朽骨钥', brief: '竹影婆娑，妖气初生。这是山海崩落的第一道裂缝。'
  },
  2: {
    id: 2, name: '血月焚天', from: 19, to: 30, tone: '#c0705a',
    camp: 'campB', portal: 'portalB', portalName: '铁关隘口',
    keyName: '二阶 · 青铜钥', brief: '血月当空，铁山被熔，关隘之外再无归途。'
  },
  3: {
    id: 3, name: '幽冥黄泉', from: 31, to: 40, tone: '#7a7ac0',
    camp: 'campC', portal: 'portalC', portalName: '忘川渡口',
    keyName: '三阶 · 玄铁钥', brief: '忘川无渡，白骨为舟。生者至此，皆须留名。'
  },
  4: {
    id: 4, name: '剑冢天阙', from: 41, to: 50, tone: '#b0b8d0',
    camp: 'campD', portal: 'portalD', portalName: '南天残门',
    keyName: '四阶 · 赤金钥', brief: '万剑归冢，天阙断阙。剑意未散，仙骨已寒。'
  },
  5: {
    id: 5, name: '九霄终焉', from: 51, to: 60, tone: '#d8b25a',
    camp: 'campE', portal: 'portalE', portalName: '九霄天门',
    keyName: '五阶 · 九霄钥', brief: '镜渊无相，天门将闭。走到这里的，只剩你一个。'
  }
};

/* 章节：maps 里的每一项 { id, name, lv }
 *   id 非空 → 有真实地图，可以前往（目前只有 6 张）
 *   id 为空 → 图位已规划、地图未做，UI 显示「未开放」 */
const ACTS = {
  '1-1': {
    id: '1-1', part: 1, no: 1, name: '竹林妖氛', from: 1, to: 6,
    maps: [{ id: 'forest', name: '幽篁林', lv: 3 }, { id: null, name: '落霞坡', lv: 6 }],
    boss: 'treeking', sub: 'batking'
  },
  '1-2': {
    id: '1-2', part: 1, no: 2, name: '血月压境', from: 7, to: 12,
    maps: [{ id: 'swamp', name: '血月沼泽', lv: 8 }, { id: null, name: '沉骨滩', lv: 11 }],
    boss: 'chief', sub: 'snakequeen'
  },
  '1-3': {
    id: '1-3', part: 1, no: 3, name: '铁山无声', from: 13, to: 18,
    maps: [{ id: null, name: '骨塔祭场', lv: 13 }, { id: 'mine', name: '玄铁矿洞', lv: 16 }, { id: null, name: '铁山绝顶', lv: 18 }],
    boss: 'golemking', sub: 'ghostlord'
  },
  '2-1': {
    id: '2-1', part: 2, no: 1, name: '寒潭照骨', from: 19, to: 22,
    maps: [{ id: 'frost', name: '寒潭水牢', lv: 20 }, { id: 'icelake', name: '冰魄湖', lv: 22 }],
    boss: 'icequeen', sub: 'spidermother'
  },
  '2-2': {
    id: '2-2', part: 2, no: 2, name: '熔脉深处', from: 23, to: 26,
    maps: [{ id: 'magmagully', name: '熔脉深沟', lv: 24 }, { id: 'ashfield', name: '灰烬荒原', lv: 26 }],
    boss: 'magmalord', sub: 'ashwarden'
  },
  '2-3': {
    id: '2-3', part: 2, no: 3, name: '焚天焦土', from: 27, to: 30,
    maps: [{ id: 'flamecanyon', name: '赤炎峡谷', lv: 28 }, { id: 'flamealtar', name: '焚天祭坛', lv: 30 }],
    boss: 'flamewraith', sub: 'flameemperor'
  },
  '3-1': {
    id: '3-1', part: 3, no: 1, name: '九幽地宫', from: 31, to: 35,
    maps: [{ id: 'abyss', name: '九幽地宫', lv: 32 }, { id: null, name: '白骨长廊', lv: 34 }, { id: null, name: '忘川河滩', lv: 35 }],
    boss: null, sub: null
  },
  '3-2': {
    id: '3-2', part: 3, no: 2, name: '黄泉无渡', from: 36, to: 40,
    maps: [{ id: null, name: '九幽深渊', lv: 37 }, { id: null, name: '黄泉渡', lv: 40 }],
    boss: 'ferryman', sub: null
  },
  '4-1': {
    id: '4-1', part: 4, no: 1, name: '万剑归冢', from: 41, to: 45,
    maps: [{ id: null, name: '天罡剑冢', lv: 42 }, { id: null, name: '万剑坑', lv: 44 }, { id: null, name: '剑冢绝巅', lv: 45 }],
    boss: 'swordlord', sub: null
  },
  '4-2': {
    id: '4-2', part: 4, no: 2, name: '云海断阙', from: 46, to: 50,
    maps: [{ id: 'heaven', name: '天阙残境', lv: 47 }, { id: null, name: '云海断桥', lv: 49 }, { id: null, name: '南天残门', lv: 50 }],
    boss: null, sub: null
  },
  '5-1': {
    id: '5-1', part: 5, no: 1, name: '无相镜渊', from: 51, to: 58,
    maps: [
      { id: null, name: '玉京废墟', lv: 52 }, { id: null, name: '星陨台', lv: 54 },
      { id: null, name: '无相幻境', lv: 56 }, { id: null, name: '镜渊', lv: 57 },
      { id: null, name: '九霄之巅', lv: 58 }
    ],
    boss: null, sub: null
  },
  '5-2': {
    id: '5-2', part: 5, no: 2, name: '终焉之门', from: 59, to: 60,
    maps: [{ id: null, name: '混沌海', lv: 60 }],
    boss: 'chaos', sub: null
  }
};

/* 营地：一卷一座。M1 起 mapId 全部就位（campB~E 复用村布局换皮） */
const CAMPS = {
  campA: { id: 'campA', part: 1, name: '桃源村', mapId: 'village', portal: 'portalA' },
  campB: { id: 'campB', part: 2, name: '玄铁关', mapId: 'campB', portal: 'portalB' },
  campC: { id: 'campC', part: 3, name: '忘川渡', mapId: 'campC', portal: 'portalC' },
  campD: { id: 'campD', part: 4, name: '南天关', mapId: 'campD', portal: 'portalD' },
  campE: { id: 'campE', part: 5, name: '九霄台', mapId: 'campE', portal: 'portalE' }
};

/* ---------------- 查询辅助（纯函数，不改数据） ---------------- */

/** 这张图属于哪一章 → '1-1' / null */
function actOfMap(mapId) {
  if (!mapId) return null;
  for (const k in ACTS) {
    const a = ACTS[k];
    for (const m of a.maps) if (m.id === mapId) return k;
  }
  return null;
}

/** 这张图属于哪一卷 → 1~5 / null */
function partOfMap(mapId) {
  const a = actOfMap(mapId);
  return a ? ACTS[a].part : null;
}

/** 一章里第一张「有真实地图」的图（用于「前往本章」） */
function firstMapOfAct(actId) {
  const a = ACTS[actId];
  if (!a) return null;
  for (const m of a.maps) if (m.id) return m;
  return null;
}

/** 某卷下的章列表（按 no 排序） */
function actsOfPart(part) {
  const out = [];
  for (const k in ACTS) if (ACTS[k].part === part) out.push(ACTS[k]);
  out.sort((x, y) => x.no - y.no);
  return out;
}

/** 某卷下的图总数 / 已开放数 */
function mapCountOfPart(part) {
  let all = 0, open = 0;
  for (const k in ACTS) {
    if (ACTS[k].part !== part) continue;
    for (const m of ACTS[k].maps) { all++; if (m.id) open++; }
  }
  return { all: all, open: open };
}

/** 这张图是哪座营地 → 'campA' / null（野图返回 null） */
function campOfMap(mapId) {
  const m = MAPS[mapId];
  return (m && m.camp) ? m.camp : null;
}

/** 某卷的营地 id → 'campB'（卷号越界时退回 campA） */
function campOfPart(part) {
  const pt = PARTS[part];
  return (pt && pt.camp) ? pt.camp : 'campA';
}

/** 某卷营地的地图 id → 'village' / 'campB'（M1 起全部有图） */
function campMapOfPart(part) {
  const c = CAMPS[campOfPart(part)];
  return (c && c.mapId) ? c.mapId : 'village';
}

/** 抵达第 N 卷时应解锁的营地 → ['campA','campB','campC']
 *  和 save.js 的 normalizeDoc 同一口径（按卷累积）：抵达卷三说明前两卷的关口都过过了。
 *  不这么写的话，「等级够直接跳卷三」会让 campB 永远解锁不了，而重开档后又突然出现。 */
function campsUpToPart(part) {
  const SEQ = ['A', 'B', 'C', 'D', 'E'];
  const n = Math.max(1, Math.min(SEQ.length, Number(part) || 1));
  const out = [];
  for (let i = 0; i < n; i++) out.push('camp' + SEQ[i]);
  return out;
}

/** 这张图是不是「本章最后一张已开放的图」→ 章间出口门挂在这里
 *  注意是「已开放」而不是「图位最后一个」：落霞坡这类 id 为 null 的图位
 *  没有真实地图，门要是挂在它身上就永远不出现。 */
function isChapterTail(mapId) {
  const a = actOfMap(mapId);
  if (!a) return false;
  let last = null;
  for (const m of ACTS[a].maps) if (m.id) last = m.id;
  return last === mapId;
}

/** 下一章第一张已开放的图 → 'swamp' / null（章间出口门的目标）
 *  没有下一章（卷末）、或下一章一张图都没做出来时返回 null。 */
function nextChapterMap(mapId) {
  const a = actOfMap(mapId);
  if (!a) return null;
  const list = actsOfPart(ACTS[a].part);
  let i = -1;
  for (let k = 0; k < list.length; k++) if (list[k].id === a) i = k;
  if (i < 0 || i + 1 >= list.length) return null;
  const nx = firstMapOfAct(list[i + 1].id);
  return nx ? nx.id : null;
}

