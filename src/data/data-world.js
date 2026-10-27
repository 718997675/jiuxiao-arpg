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
    npcs: ['elder', 'smith', 'herbalist', 'monk', 'alchemist', 'warden', 'steward'],
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
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campC: {
    id: 'campC', name: '忘川渡', safe: true, level: 31, camp: 'campC',
    ground: 'abyss', sky: 0x1e2438, fog: 0x28304a, fogNear: 38, fogFar: 112,
    size: 76, ambient: 0x7a86b8, sun: 0x9ab0ff, sunI: 0.7, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campD: {
    id: 'campD', name: '南天关', safe: true, level: 41, camp: 'campD',
    ground: 'heaven', sky: 0x3a4a6a, fog: 0x50628a, fogNear: 42, fogFar: 126,
    size: 80, ambient: 0xa8bcd8, sun: 0xfff0c8, sunI: 1.0, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }
  },
  campE: {
    id: 'campE', name: '九霄台', safe: true, level: 51, camp: 'campE',
    ground: 'trial', sky: 0x2a1e3e, fog: 0x38264e, fogNear: 40, fogFar: 120,
    size: 78, ambient: 0xb8a4dc, sun: 0xffd890, sunI: 1.05, props: 'village',
    npcs: ['smith', 'herbalist', 'monk', 'alchemist', 'steward'],
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
  }
};

/* ---------------- 任务链 ---------------- */
const QUESTS = {
  q1: {
    id: 'q1', name: '竹林异动', giver: 'elder', map: 'village',
    brief: '村外幽篁林妖气渐浓，半兽人已经下山掠村。去幽篁林斩杀 8 只半兽人。',
    objectives: [{ type: 'kill', target: 'halfork', count: 8, label: '斩杀半兽人战士' }],
    rewards: { xp: 260, gold: 180, ilvl: 5, rarity: 'magic' }, next: 'q2'
  },
  q2: {
    id: 'q2', name: '血翼之夜', giver: 'elder', map: 'village',
    brief: '血蝠成群，夜里连牲口都被吸干了血。去幽篁林讨伐 10 只血蝠。',
    objectives: [{ type: 'kill', target: 'bat', count: 10, label: '猎杀血蝠' }],
    rewards: { xp: 420, gold: 260, ilvl: 7, rarity: 'magic' }, next: 'q3'
  },
  q3: {
    id: 'q3', name: '巨木妖王', giver: 'elder', map: 'village',
    brief: '幽篁林深处，千年妖木已成王。斩了它，竹林才能安息。',
    objectives: [{ type: 'boss', target: 'treeking', count: 1, label: '击败巨木妖王' }],
    rewards: { xp: 900, gold: 500, ilvl: 9, rarity: 'rare', skill: 'thrust', talent: 2 }, next: 'q4'
  },
  q4: {
    id: 'q4', name: '嗜血长翼', giver: 'elder', map: 'village',
    brief: '血蝠魔君以人血养翼，若不除之，血月将临。',
    objectives: [{ type: 'boss', target: 'batking', count: 1, label: '击败血蝠魔君' }],
    rewards: { xp: 1200, gold: 650, ilvl: 11, rarity: 'rare', skill: 'frostnova' }, next: 'q5'
  },
  q5: {
    id: 'q5', name: '沼泽的骨堆', giver: 'elder', map: 'village',
    brief: '血月沼泽的半兽人部族正在堆骨为塔。去沼泽斩杀 12 只怪物，遏止它们的血祭。',
    objectives: [{ type: 'killAny', count: 12, label: '肃清血月沼泽的妖物' }],
    rewards: { xp: 1600, gold: 800, ilvl: 13, rarity: 'rare', talent: 2 }, next: 'q6'
  },
  q6: {
    id: 'q6', name: '碎骨酋长', giver: 'elder', map: 'village',
    brief: '半兽人酋长·碎骨以活人祭旗，此獠不除，沼泽永无宁日。',
    objectives: [{ type: 'boss', target: 'chief', count: 1, label: '击败半兽人酋长·碎骨' }],
    rewards: { xp: 2400, gold: 1100, ilvl: 15, rarity: 'set', skill: 'warcry' }, next: 'q7'
  },
  q7: {
    id: 'q7', name: '石甲与毒鳞', giver: 'elder', map: 'village',
    brief: '石甲巨魔与蛇姬·青鳞盘踞沼泽深处，二者皆除，方解此患。',
    objectives: [
      { type: 'boss', target: 'golemking', count: 1, label: '击败石甲巨魔' },
      { type: 'boss', target: 'snakequeen', count: 1, label: '击败蛇姬·青鳞' }
    ],
    rewards: { xp: 3600, gold: 1500, ilvl: 17, rarity: 'set', skill: 'summon' }, next: 'q8'
  },
  q8: {
    id: 'q8', name: '矿洞的低语', giver: 'elder', map: 'village',
    brief: '玄铁矿洞传出诵经声，幽魂道尊正在收割矿工的魂魄。',
    objectives: [{ type: 'boss', target: 'ghostlord', count: 1, label: '击败幽魂道尊' }],
    rewards: { xp: 5200, gold: 2000, ilvl: 21, rarity: 'set', skill: 'heal', talent: 3 }, next: 'q9'
  },
  q9: {
    id: 'q9', name: '冰火双魔', giver: 'elder', map: 'village',
    brief: '赤炎魔将与冰魄妖后同源于一处天火，一焚一冻。斩其一，另一必至。',
    objectives: [
      { type: 'boss', target: 'firegeneral', count: 1, label: '击败赤炎魔将' },
      { type: 'boss', target: 'icequeen', count: 1, label: '击败冰魄妖后' }
    ],
    rewards: { xp: 7600, gold: 2800, ilvl: 25, rarity: 'legendary', skill: 'chain' }, next: 'q10'
  },
  q10: {
    id: 'q10', name: '九幽之门', giver: 'elder', map: 'village',
    brief: '九幽地宫的门开了。蛛母、渡者、剑魂，都在门的另一侧等你。',
    objectives: [
      { type: 'boss', target: 'spidermother', count: 1, label: '击败万毒蛛母' },
      { type: 'boss', target: 'ferryman', count: 1, label: '击败冥河渡者' },
      { type: 'boss', target: 'swordlord', count: 1, label: '击败天罡剑魂' }
    ],
    rewards: { xp: 12000, gold: 4200, ilvl: 30, rarity: 'legendary', skill: 'iceshield' }, next: 'q11'
  },
  q11: {
    id: 'q11', name: '九霄终焉', giver: 'elder', map: 'village',
    brief: '混沌无相天魔吞尽九霄灵气，天阙已残。此战，为苍生，也为你自己。',
    objectives: [{ type: 'boss', target: 'chaos', count: 1, label: '击败混沌·无相天魔' }],
    rewards: { xp: 30000, gold: 12000, ilvl: 40, rarity: 'legendary', skill: 'avatar', talent: 3 }, next: null
  }
};

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
    maps: [{ id: null, name: '寒潭水牢', lv: 20 }, { id: null, name: '冰魄湖', lv: 22 }],
    boss: 'icequeen', sub: 'spidermother'
  },
  '2-2': {
    id: '2-2', part: 2, no: 2, name: '熔脉深处', from: 23, to: 26,
    maps: [{ id: null, name: '熔脉深沟', lv: 24 }, { id: null, name: '灰烬荒原', lv: 26 }],
    boss: null, sub: null
  },
  '2-3': {
    id: '2-3', part: 2, no: 3, name: '焚天焦土', from: 27, to: 30,
    maps: [{ id: null, name: '赤炎峡谷', lv: 28 }, { id: null, name: '焚天祭坛', lv: 30 }],
    boss: 'firegeneral', sub: null
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

