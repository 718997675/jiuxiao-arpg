/* ============================================================
 * 数据层 · 怪物
 * 12 种普通怪 + 12 个 Boss
 * （从 data.js 原样搬迁，数值未改）
 * ============================================================ */

/* ---------------- 怪物 ---------------- */
const MONSTERS = {
  halfork: { name: '半兽人战士', model: 'humanoid', hp: 62, atk: 9, spd: 3.3, scale: 1.0, color: 0x8e6a45, cloth: 0x5c4426, xp: 14, melee: true, range: 2.2, atkCd: 1.5 },
  skelarch: { name: '骷髅弓手', model: 'skeleton', hp: 46, atk: 11, spd: 2.6, scale: 0.95, color: 0xd8d2bd, cloth: 0x555555, xp: 16, ranged: true, range: 14, atkCd: 2.1, proj: { color: 0xd8e0ff, speed: 16 } },
  bat: { name: '血蝠', model: 'bat', hp: 34, atk: 7, spd: 5.2, scale: 0.8, color: 0x6b1f28, cloth: 0x3d1116, xp: 11, melee: true, range: 2.0, atkCd: 1.1, fly: true },
  spider: { name: '毒蛛', model: 'spider', hp: 70, atk: 10, spd: 3.0, scale: 1.0, color: 0x3f2f4f, cloth: 0x241a2e, xp: 18, melee: true, range: 2.4, atkCd: 1.7, poison: true },
  boar: { name: '獠牙猪卫', model: 'beast', hp: 96, atk: 13, spd: 3.6, scale: 1.15, color: 0x6d5340, cloth: 0x40301f, xp: 22, melee: true, range: 2.6, atkCd: 1.9, charge: true },
  ghost: { name: '幽魂道士', model: 'ghost', hp: 58, atk: 15, spd: 2.3, scale: 1.0, color: 0x7fd6c0, cloth: 0x2c4a45, xp: 24, ranged: true, range: 15, atkCd: 2.4, proj: { color: 0x8affd8, speed: 13 } },
  scorpion: { name: '赤尾蝎', model: 'spider', hp: 84, atk: 16, spd: 3.4, scale: 1.05, color: 0x8a3a2a, cloth: 0x4a1d14, xp: 26, melee: true, range: 2.4, atkCd: 1.6, poison: true },
  snake: { name: '蛇妖', model: 'snake', hp: 78, atk: 17, spd: 3.0, scale: 1.0, color: 0x2f7f5f, cloth: 0x1d4a38, xp: 28, ranged: true, range: 13, atkCd: 2.2, proj: { color: 0x9dff8a, speed: 15 }, poison: true },
  golem: { name: '石魔', model: 'golem', hp: 190, atk: 22, spd: 1.8, scale: 1.35, color: 0x77706a, cloth: 0x4c4741, xp: 40, melee: true, range: 3.0, atkCd: 2.4 },
  yaoguai: { name: '妖僧', model: 'humanoid', hp: 120, atk: 24, spd: 3.2, scale: 1.05, color: 0x8a5fb0, cloth: 0x4a2f66, xp: 44, melee: true, range: 2.4, atkCd: 1.5, lifesteal: true },
  ghostfire: { name: '鬼火', model: 'bat', hp: 66, atk: 26, spd: 4.6, scale: 0.85, color: 0x66ccff, cloth: 0x2a6b8a, xp: 42, ranged: true, range: 12, atkCd: 1.8, proj: { color: 0x88e0ff, speed: 14 } },
  bloodlord: { name: '血尸', model: 'humanoid', hp: 240, atk: 30, spd: 2.9, scale: 1.2, color: 0x992b2b, cloth: 0x5a1414, xp: 60, melee: true, range: 2.8, atkCd: 1.8 }
};

/* ---------------- Boss ---------------- */
const BOSSES = {
  treeking: {
    id: 'treeking', name: '巨木妖王', title: '幽篁林之主', map: 'forest', level: 6, scale: 2.1,
    hp: 1800, atk: 20, spd: 2.6, color: 0x3f5a30, cloth: 0x2c3f22, model: 'treant', scale: 1.85,
    melee: true, range: 4.2, atkCd: 2.2,
    patterns: ['slam', 'roots', 'summon'],
    lines: ['这片竹林……是我的坟场。', '凡人的血，最养竹。']
  },
  batking: {
    id: 'batking', name: '血蝠魔君', title: '嗜血长翼', map: 'forest', level: 8, scale: 1.9,
    hp: 2400, atk: 24, spd: 4.6, color: 0x7a1f2e, cloth: 0x3d0c13, model: 'batking', scale: 1.65,
    melee: true, range: 3.6, atkCd: 1.5, fly: true,
    patterns: ['ringshot', 'charge', 'summon'],
    lines: ['血……都是我的血！', '你闻起来很香甜。']
  },
  chief: {
    id: 'chief', name: '半兽人酋长·碎骨', title: '血腥部族之首', map: 'swamp', level: 12, scale: 2.3,
    hp: 4200, atk: 34, spd: 3.2, color: 0x7a5a38, cloth: 0x4a2414, model: 'brute', scale: 1.85, skin: 0x9a7a5a,
    melee: true, range: 4.6, atkCd: 2.0,
    patterns: ['slam', 'charge', 'summon'],
    lines: ['碎骨！我要把你碎成骨！', '部族的勇士，都死在你的手里？']
  },
  golemking: {
    id: 'golemking', name: '石甲巨魔', title: '玄铁山的守望者', map: 'swamp', level: 15, scale: 2.5,
    hp: 6200, atk: 40, spd: 2.0, color: 0x6f675f, cloth: 0x3f3a34, model: 'golem', scale: 1.9,
    melee: true, range: 5.0, atkCd: 2.6, armorHigh: true,
    patterns: ['slam', 'rocks', 'quake'],
    lines: ['石头……不会痛。', '你也会变成石头。']
  },
  snakequeen: {
    id: 'snakequeen', name: '蛇姬·青鳞', title: '沼泽毒后', map: 'swamp', level: 16, scale: 2.0,
    hp: 5200, atk: 38, spd: 3.6, color: 0x2f7f5f, cloth: 0x1d3f30, model: 'snake',
    melee: false, ranged: true, range: 14, atkCd: 1.9,
    patterns: ['poisonnova', 'ringshot', 'summon'],
    lines: ['来，让我看看你的骨头。', '毒会先吃掉你的眼睛。']
  },
  ghostlord: {
    id: 'ghostlord', name: '幽魂道尊', title: '九幽的引路人', map: 'mine', level: 20, scale: 2.2,
    hp: 7800, atk: 46, spd: 3.0, color: 0x7fd6c0, cloth: 0x1f3a38, model: 'ghost',
    melee: false, ranged: true, range: 16, atkCd: 2.0,
    patterns: ['ringshot', 'curse', 'summon'],
    lines: ['生者，为何踏入死地？', '你的魂魄，我收下了。']
  },
  firegeneral: {
    id: 'firegeneral', name: '赤炎魔将', title: '焚天军先锋', map: 'mine', level: 23, scale: 2.3,
    hp: 9600, atk: 54, spd: 3.4, color: 0xa82c20, cloth: 0x551008, model: 'brute', scale: 1.9,
    melee: true, range: 4.6, atkCd: 1.8, fire: true,
    patterns: ['slam', 'fireline', 'charge'],
    lines: ['焚尽！焚尽一切！', '你的血肉，会为我燃起。']
  },
  icequeen: {
    id: 'icequeen', name: '冰魄妖后', title: '寒潭之底', map: 'mine', level: 24, scale: 2.1,
    hp: 8800, atk: 58, spd: 3.2, color: 0x7fb8e0, cloth: 0x2a4f6b, model: 'ghost', scale: 1.85,
    melee: false, ranged: true, range: 15, atkCd: 1.9, ice: true,
    patterns: ['frostnova', 'ringshot', 'summon'],
    lines: ['冷么？很快就感觉不到了。', '冰封，是最好的棺。']
  },
  spidermother: {
    id: 'spidermother', name: '万毒蛛母', title: '百子之巢', map: 'abyss', level: 28, scale: 2.6,
    hp: 13500, atk: 62, spd: 3.0, color: 0x6b4278, cloth: 0x2e1a35, model: 'spider', scale: 2.15,
    melee: true, range: 4.4, atkCd: 1.7, poison: true,
    patterns: ['summon', 'poisonnova', 'charge'],
    lines: ['我的孩子们……饿了。', '别踩坏我的卵。']
  },
  ferryman: {
    id: 'ferryman', name: '冥河渡者', title: '忘川摆渡人', map: 'abyss', level: 30, scale: 2.3,
    hp: 15500, atk: 70, spd: 2.8, color: 0x5b6b8a, cloth: 0x2a3244, model: 'golem', scale: 1.95,
    melee: true, range: 5.2, atkCd: 2.3, armorHigh: true,
    patterns: ['quake', 'ringshot', 'curse'],
    lines: ['上船吧，船票是命。', '忘川水凉，别回头。']
  },
  swordlord: {
    id: 'swordlord', name: '天罡剑魂', title: '万剑之主', map: 'abyss', level: 32, scale: 2.2,
    hp: 18000, atk: 78, spd: 4.0, color: 0xb0a480, cloth: 0x50441f, model: 'humanoid',
    melee: true, range: 3.8, atkCd: 1.3,
    patterns: ['swordrain', 'charge', 'slam'],
    lines: ['剑，即是道。', '接我这一剑。']
  },
  chaos: {
    id: 'chaos', name: '混沌·无相天魔', title: '九霄终焉', map: 'heaven', level: 38, scale: 3.0,
    hp: 42000, atk: 105, spd: 3.4, color: 0x5a2478, cloth: 0x220c30, model: 'demon', scale: 2.1, skin: 0x6a3a7a,
    melee: true, range: 5.6, atkCd: 1.9, all: true,
    patterns: ['slam', 'ringshot', 'charge', 'meteor', 'summon', 'curse'],
    lines: ['九霄之上，本无神佛。', '你不过是又一个妄念。', '来吧，让我看看你的道。']
  }
};
