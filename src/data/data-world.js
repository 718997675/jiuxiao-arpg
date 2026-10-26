/* ============================================================
 * 数据层 · 世界
 * 地图 / NPC / 任务链
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

/* ---------------- 地图 ---------------- */
const MAPS = {
  village: {
    id: 'village', name: '桃源村', safe: true, level: 1,
    ground: 'dirt', sky: 0x9fc7d9, fog: 0xa8c8d8, fogNear: 45, fogFar: 120,
    size: 70, ambient: 0xbfd9e6, sun: 0xffe6b8, sunI: 1.05, props: 'village',
    npcs: ['elder', 'smith', 'herbalist', 'monk', 'alchemist', 'warden'],
    spawns: [], bosses: [], portal: { x: 0, z: -18 }, music: 'calm'
  },
  forest: {
    id: 'forest', name: '幽篁林', safe: false, level: 4,
    ground: 'bamboo', sky: 0x7fae8f, fog: 0x93b89c, fogNear: 30, fogFar: 95,
    size: 90, ambient: 0xa8d0b0, sun: 0xd8f0c0, sunI: 0.95, props: 'bamboo',
    spawns: ['halfork', 'bat', 'skelarch', 'wolf', 'hornet', 'fox', 'lantern', 'bamboo', 'shigandang'], spawnCount: 14, bosses: ['treeking', 'batking'],
    portal: { x: 0, z: 34 }, unlock: 1
  },
  swamp: {
    id: 'swamp', name: '血月沼泽', safe: false, level: 12,
    ground: 'swamp', sky: 0x5a3a3a, fog: 0x6b3f3f, fogNear: 28, fogFar: 90,
    size: 96, ambient: 0x8a6a6a, sun: 0xff9a7a, sunI: 0.8, props: 'swamp',
    spawns: ['spider', 'boar', 'snake', 'scorpion', 'zombie', 'drowned', 'brood', 'wasp', 'toad', 'bogwitch'], spawnCount: 16,
    bosses: ['chief', 'golemking', 'snakequeen'], portal: { x: 0, z: 38 }, unlock: 8
  },
  mine: {
    id: 'mine', name: '玄铁矿洞', safe: false, level: 20,
    ground: 'rock', sky: 0x2a2a33, fog: 0x2e2a2a, fogNear: 22, fogFar: 75,
    size: 90, ambient: 0x6a6a78, sun: 0xffbb66, sunI: 0.7, props: 'mine',
    spawns: ['golem', 'ghost', 'yaoguai', 'ghostfire', 'statue', 'scorpking', 'minerghost', 'magma', 'ironbeetle', 'runesmith'], spawnCount: 16,
    bosses: ['ghostlord', 'firegeneral', 'icequeen'], portal: { x: 0, z: 36 }, unlock: 16
  },
  abyss: {
    id: 'abyss', name: '九幽地宫', safe: false, level: 28,
    ground: 'abyss', sky: 0x1a1420, fog: 0x1e1626, fogNear: 20, fogFar: 70,
    size: 92, ambient: 0x6a5a7a, sun: 0x9a6aff, sunI: 0.65, props: 'abyss',
    spawns: ['ghostfire', 'bloodlord', 'yaoguai', 'golem', 'headless', 'crane', 'bonewright', 'shade', 'ironmaiden'], spawnCount: 17,
    bosses: ['spidermother', 'ferryman', 'swordlord'], portal: { x: 0, z: 37 }, unlock: 24
  },
  heaven: {
    id: 'heaven', name: '天阙残境', safe: false, level: 35,
    ground: 'heaven', sky: 0x2a3a5a, fog: 0x40527a, fogNear: 26, fogFar: 85,
    size: 92, ambient: 0x9ab0e0, sun: 0xffe0a0, sunI: 0.95, props: 'heaven',
    spawns: ['bloodlord', 'ghostfire', 'golem', 'yaoguai', 'fallen', 'voidbeast', 'swordwraith', 'thunderbird', 'jadeguard'], spawnCount: 18,
    bosses: ['chaos'], portal: { x: 0, z: 37 }, unlock: 32
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
