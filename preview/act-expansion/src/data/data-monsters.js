/* ============================================================
 * 数据层 · 怪物
 * 80 种普通怪（6 族群）+ 37 个 Boss（32 世界首领 + 5 地下城守卫）
 * [M4] 36 只野外怪见 MONSTERS 末尾的分章段落；
 * [M5] 4 只地下城专属怪在最末（`dungeon` 字段标类型），5 个关卡守卫
 *      在 BOSSES 末尾（`dungeon: true`，不进任何 MAPS[*].bosses）。
 *
 * [S5] 40 怪的分工：
 *   · 原有 12 只全部保留 key（任务链 QUESTS 直接按 key 引用，不能改名）
 *   · 新增 28 只按区域铺开，每张图的怪池从 3~4 种加到 9~10 种
 *   · 其中 10 只走全新程序化模型（wolf / fox / lantern / zombie /
 *     drowned / brood / statue / scorpking / crane / headless），
 *     其余 18 只用既有模型换色 + 换数值 + 换族群，靠词缀和抗性区分
 *
 * 族群（family）决定抗性，抗性让「一套装备打天下」不成立：
 *   亡灵抗毒怕火、石魔抗物理怕雷、草木怕火、妖灵抗法术怕物理。
 *   正数 = 减伤 %，负数 = 增伤 %（弱点），结算见 game.js damageEnemy。
 * ============================================================ */

/* ---------------- 族群与抗性 ---------------- */
/* 抗性键与技能 elem 对齐：phys / fire / ice / lightning / poison
 * （物理走 opts.tag 里非元素的那一支，元素走技能自带的 elem） */
const MON_FAMILIES = {
  beast: {
    name: '兽', color: '#c08a4a',
    desc: '血肉之躯，皮糙肉厚，怕火。',
    resist: { phys: 10, fire: -15, ice: 0, lightning: 0, poison: 0 }
  },
  undead: {
    name: '亡灵', color: '#9aa8b8',
    desc: '尸骨不惧毒，遇火即焚。',
    resist: { phys: 0, fire: -20, ice: 10, lightning: 0, poison: 60 }
  },
  spirit: {
    name: '妖灵', color: '#b98cff',
    desc: '以术法为食，元素难伤，实体刀兵反而有效。',
    resist: { phys: -15, fire: 15, ice: 15, lightning: 15, poison: 15 }
  },
  stone: {
    name: '石魔', color: '#8a8a92',
    desc: '刀剑难入，雷法可裂其躯。',
    resist: { phys: 45, fire: 0, ice: 15, lightning: -25, poison: 30 }
  },
  plant: {
    name: '草木', color: '#6fae5a',
    desc: '扎根成精，见火则枯。',
    resist: { phys: 0, fire: -35, ice: 0, lightning: 0, poison: 25 }
  },
  humanoid: {
    name: '人形', color: '#d8c8a0',
    desc: '披甲持械，刀兵稍钝；终究是血肉，见毒即溃。',
    resist: { phys: 5, fire: 0, ice: 0, lightning: 0, poison: -10 }
  }
};

/* ---------------- 战斗 AI 原型（C2） ---------------- *
 * 每只怪有且只有一个「主行为」，由 cfg.ai 指定；不写则按 ranged 字段退化成
 * melee（贴脸砍）/ ranged（站桩射）。
 *
 * 为什么要分原型而不是给每只怪写一套脚本：
 *   40 只怪 × 各自实现 = 无法平衡、无法测试、以后加怪要重读一遍 AI。
 *   现在只有 8 种原型，怪之间靠「数值 + 抗性 + 词缀」区分，行为只表达战术意图：
 *   包夹逼你走位、风筝逼你追、自爆逼你后撤、治疗逼你先杀奶、召唤逼你清场、
 *   逃跑逼你补刀。玩家看到模型就该猜到打法，不用背 40 条规则。
 *
 * cd 是主动技能冷却（healer / summoner 用），t 是当前状态的计时器。
 */
const MOB_AI_KINDS = {
  melee: {
    name: '近战', color: '#c08a4a',
    desc: '直线逼近，进入触及距离就抬手。最基础的打法，靠数量和数值压人。'
  },
  ranged: {
    name: '远程', color: '#7fb8e0',
    desc: '维持射程站桩输出，被贴近就后退。不会绕，绕后打它。'
  },
  flank: {
    name: '包夹', color: '#e07a5a',
    desc: '不排队走直线 —— 每只狼分到一个自己的方位，从你身后、侧面同时压上来。站着不动就会被围死，必须边走边打。'
  },
  kite: {
    name: '风筝', color: '#9a8ae0',
    desc: '一边横向绕圈一边射。你追它就跑、你停它就打，走直线几乎打不到它，得用位移技或把它逼到墙边。'
  },
  bomber: {
    name: '自爆', color: '#ff6a3a',
    desc: '加速冲到你身边，引信亮起一秒后炸开，范围伤害极高。看到它亮起来就后撤 —— 打死它也会炸，只是威力小些。'
  },
  healer: {
    name: '治疗', color: '#66d08a',
    desc: '每隔几秒给附近受伤的同伴回血，自己被压到半血以下会先治自己。放着不管，前面的怪永远打不死。'
  },
  summoner: {
    name: '召唤', color: '#c08ad8',
    desc: '定期在身周唤出小怪。本身不追人，但场上数量会一直涨，必须优先点掉。'
  },
  coward: {
    name: '逃逸', color: '#d8c060',
    desc: '血量跌破三成就会拉开距离并持续回血，回起来之后再来一轮。赢不了你，但能耗死你 —— 得留技能补掉它。'
  }
};

/* 各原型需要的调参，集中在这里，方便一起调平衡 */
const MOB_AI_TUNE = {
  flank: { slotR: 0.86, arrive: 1.6, lateral: 0.55 },
  /* 风筝的距离带刻意压近（射程的 50%~72%）：原来 55%~90% 等于在 12 米外绕圈，
   * 半径太大、切向速度被摊薄，2 秒才转 0.4 弧度，看起来像在飘而不是在绕。
   * 压到 9 米以内 + 绕行全速，转一圈约 8 秒，玩家才有「被缠住」的感觉。 */
  kite: { near: 0.5, far: 0.72, orbit: 0.9, pause: 0.36 },
  bomber: { rushMul: 1.35, fuse: 1.0, radius: 3.6, dmgMul: 2.6, deathDmgMul: 0.7, breakAway: 4.6 },
  healer: { cd: 6.5, radius: 13, healPct: 12, selfAt: 0.45, cast: 0.5 },
  summoner: { cd: 9.5, near: 15, count: 2, cast: 0.8, levelDrop: 2 },
  coward: { at: 0.3, back: 0.55, fleeT: 4.0, regenPct: 4.5, cd: 12, spdMul: 1.2 }
};

/* ---------------- 怪物 ---------------- */
/* 字段说明
 *   ai      战斗 AI 原型（见 MOB_AI_KINDS），不写则按 ranged 退化成 melee / ranged
 *   model   程序化模型分支（actors.js buildMonster）
 *   family  族群（决定抗性）
 *   hp/atk  基础值，实际按地图等级放大（hp ×(1+lvl×0.48)、atk ×(1+lvl×0.18)）
 *   spd     移速；range 攻击距离；atkCd 攻击间隔
 *   lore    图鉴传说（一行）
 */
const MONSTERS = {
  /* ===== 幽篁林 · 4 级 ===== */
  halfork: {
    name: '半兽人战士', model: 'humanoid', family: 'humanoid',
    hp: 62, atk: 9, spd: 3.3, scale: 1.0, color: 0x8e6a45, cloth: 0x5c4426,
    xp: 14, melee: true, range: 2.2, atkCd: 1.5,
    lore: '血月之后才下山的部族，刀口上还沾着村人的血。'
  },
  skelarch: {
    name: '骷髅弓手', model: 'skeleton', family: 'undead',
    hp: 46, atk: 11, spd: 2.6, scale: 0.95, color: 0xd8d2bd, cloth: 0x555555,
    xp: 16, ranged: true, range: 14, atkCd: 2.1, proj: { color: 0xd8e0ff, speed: 16 },
    lore: '死前是猎户，死后仍记得怎么拉弓。'
  },
  bat: {
    name: '血蝠', model: 'bat', family: 'beast',
    hp: 34, atk: 7, spd: 5.2, scale: 0.8, color: 0x6b1f28, cloth: 0x3d1116,
    xp: 11, melee: true, range: 2.0, atkCd: 1.1, fly: true,
    ai: 'flank', lore: '吸饱了血的蝠，翼膜透出暗红的光。'
  },
  wolf: {
    name: '灰背狼', model: 'wolf', family: 'beast',
    hp: 58, atk: 11, spd: 4.6, scale: 1.0, color: 0x6a6a72, cloth: 0x3a3a42,
    xp: 15, melee: true, range: 2.2, atkCd: 1.3, charge: true,
    ai: 'flank', lore: '成群结队，先咬脚筋，再咬喉咙。'
  },
  hornet: {
    name: '竹蜂', model: 'bat', family: 'beast',
    hp: 40, atk: 9, spd: 4.8, scale: 0.72, color: 0xb8a03a, cloth: 0x5a4a12,
    xp: 13, melee: true, range: 2.0, atkCd: 1.2, fly: true, poison: true,
    ai: 'flank', lore: '竹节里筑巢，一针下去半边身子都麻。'
  },
  fox: {
    name: '狐妖', model: 'fox', family: 'spirit',
    hp: 66, atk: 12, spd: 3.8, scale: 1.0, color: 0xd88a5a, cloth: 0xe8d8c0,
    xp: 19, ranged: true, range: 13, atkCd: 2.0, proj: { color: 0xffb080, speed: 15 },
    ai: 'kite', lore: '尾巴越多，幻术越真。它记得每个进林的人。'
  },
  lantern: {
    name: '灯灵', model: 'lantern', family: 'spirit',
    hp: 50, atk: 13, spd: 2.4, scale: 1.0, color: 0x8ad8ff, cloth: 0x2a4a5a,
    xp: 18, ranged: true, range: 12, atkCd: 2.3, proj: { color: 0xa8e8ff, speed: 12 }, fly: true,
    ai: 'kite', lore: '迷路的人看见的那盏灯，是它挂出来的。'
  },
  bamboo: {
    name: '竹精', model: 'treant', family: 'plant',
    hp: 110, atk: 10, spd: 2.2, scale: 0.9, color: 0x4a7a3a, cloth: 0x2f5428,
    xp: 20, melee: true, range: 2.8, atkCd: 2.0,
    lore: '竹根盘了百年，吸足了埋在林下的血。'
  },
  shigandang: {
    name: '石敢当', model: 'statue', family: 'stone',
    hp: 175, atk: 14, spd: 1.5, scale: 1.05, color: 0x7d7a70, cloth: 0x4a4842,
    xp: 30, melee: true, range: 3.0, atkCd: 2.4,
    lore: '立在林道岔口的镇邪石，香火断了百年，如今只认得活人。'
  },

  /* ===== 血月沼泽 · 12 级 ===== */
  spider: {
    name: '毒蛛', model: 'spider', family: 'beast',
    hp: 70, atk: 10, spd: 3.0, scale: 1.0, color: 0x3f2f4f, cloth: 0x241a2e,
    xp: 18, melee: true, range: 2.4, atkCd: 1.7, poison: true,
    lore: '结网在水面之上，专等低头喝水的人。'
  },
  boar: {
    name: '獠牙猪卫', model: 'beast', family: 'beast',
    hp: 96, atk: 13, spd: 3.6, scale: 1.15, color: 0x6d5340, cloth: 0x40301f,
    xp: 22, melee: true, range: 2.6, atkCd: 1.9, charge: true,
    lore: '沼泽里的獠牙能拱穿木栅，也能拱穿人腹。'
  },
  snake: {
    name: '蛇妖', model: 'snake', family: 'beast',
    hp: 78, atk: 17, spd: 3.0, scale: 1.0, color: 0x2f7f5f, cloth: 0x1d4a38,
    xp: 28, ranged: true, range: 13, atkCd: 2.2, proj: { color: 0x9dff8a, speed: 15 }, poison: true,
    ai: 'kite', lore: '半身为人，半身为蛇，说话时舌头是分叉的。'
  },
  scorpion: {
    name: '赤尾蝎', model: 'spider', family: 'beast',
    hp: 84, atk: 16, spd: 3.4, scale: 1.05, color: 0x8a3a2a, cloth: 0x4a1d14,
    xp: 26, melee: true, range: 2.4, atkCd: 1.6, poison: true,
    ai: 'flank', lore: '尾针上的毒，是从血月里炼出来的。'
  },
  zombie: {
    name: '沼泽僵尸', model: 'zombie', family: 'undead',
    hp: 120, atk: 15, spd: 2.0, scale: 1.05, color: 0x5a6a4a, cloth: 0x3a2a20,
    xp: 25, melee: true, range: 2.4, atkCd: 2.2,
    lore: '陷在泥里的尸首，被血月叫了起来。'
  },
  drowned: {
    name: '水鬼', model: 'drowned', family: 'undead',
    hp: 100, atk: 17, spd: 3.2, scale: 1.0, color: 0x4a7a8a, cloth: 0x2a4a52,
    xp: 27, ranged: true, range: 12, atkCd: 2.2, proj: { color: 0x8ad8d0, speed: 14 }, poison: true,
    ai: 'kite', lore: '拉人下水的手，永远比水面低半尺。'
  },
  brood: {
    name: '蛛巢', model: 'brood', family: 'plant',
    hp: 150, atk: 8, spd: 1.2, scale: 1.0, color: 0x5a3a6a, cloth: 0x2e1a35,
    xp: 30, melee: true, range: 2.6, atkCd: 2.4,
    ai: 'summoner', lore: '不会追人，但会一直生。放着不管，半炷香就铺满整片沼泽。'
  },
  wasp: {
    name: '血翅蜂', model: 'bat', family: 'beast',
    hp: 70, atk: 18, spd: 5.0, scale: 0.78, color: 0x8a2a3a, cloth: 0x4a1020,
    xp: 24, melee: true, range: 2.0, atkCd: 1.1, fly: true, poison: true,
    ai: 'flank', lore: '翅上带血纹，飞起来像一团会响的红雾。'
  },
  toad: {
    name: '沼蟾', model: 'beast', family: 'beast',
    hp: 140, atk: 16, spd: 2.4, scale: 1.25, color: 0x4a5a2a, cloth: 0x2a3418,
    xp: 26, melee: true, range: 2.8, atkCd: 2.0, poison: true,
    ai: 'bomber', lore: '鼓起的喉囊里存着沼气，一鼓就喷。'
  },
  bogwitch: {
    name: '沼泽巫婆', model: 'humanoid', family: 'humanoid',
    hp: 90, atk: 20, spd: 2.8, scale: 0.95, color: 0x7a5a8a, cloth: 0x3a2a44,
    xp: 29, ranged: true, range: 14, atkCd: 2.4, proj: { color: 0xc08aff, speed: 13 },
    ai: 'healer', lore: '用活人的名字下咒，叫一声，你就少一年。'
  },

  /* ===== 玄铁矿洞 · 20 级 ===== */
  golem: {
    name: '石魔', model: 'golem', family: 'stone',
    hp: 190, atk: 22, spd: 1.8, scale: 1.35, color: 0x77706a, cloth: 0x4c4741,
    xp: 40, melee: true, range: 3.0, atkCd: 2.4,
    lore: '矿脉深处的石头自己站了起来，胸口还嵌着未凿完的玄铁。'
  },
  ghost: {
    name: '幽魂道士', model: 'ghost', family: 'spirit',
    hp: 58, atk: 15, spd: 2.3, scale: 1.0, color: 0x7fd6c0, cloth: 0x2c4a45,
    xp: 24, ranged: true, range: 15, atkCd: 2.4, proj: { color: 0x8affd8, speed: 13 },
    ai: 'healer', lore: '生前在洞里炼丹，丹成了，人没了。'
  },
  yaoguai: {
    name: '妖僧', model: 'humanoid', family: 'humanoid',
    hp: 120, atk: 24, spd: 3.2, scale: 1.05, color: 0x8a5fb0, cloth: 0x4a2f66,
    xp: 44, melee: true, range: 2.4, atkCd: 1.5, lifesteal: true,
    ai: 'coward', lore: '嘴里念的是超度，手上做的是索取。'
  },
  ghostfire: {
    name: '鬼火', model: 'bat', family: 'spirit',
    hp: 66, atk: 26, spd: 4.6, scale: 0.85, color: 0x66ccff, cloth: 0x2a6b8a,
    /* 本来是远程法球，改成近战自爆：鬼火本来就该「扑上来烧你」，飞着放法术反而不像火 */
    xp: 42, melee: true, range: 2.2, atkCd: 1.8,
    ai: 'bomber', lore: '矿工头灯里那点光，死后还亮着。'
  },
  statue: {
    name: '石像守卫', model: 'statue', family: 'stone',
    hp: 260, atk: 24, spd: 1.6, scale: 1.2, color: 0x8a8a90, cloth: 0x4a4a52,
    xp: 46, melee: true, range: 3.2, atkCd: 2.6, armorHigh: true,
    lore: '守着洞口的旧石像，谁凿开山门，它便醒。'
  },
  scorpking: {
    name: '蝎王', model: 'scorpking', family: 'beast',
    hp: 210, atk: 28, spd: 3.2, scale: 1.15, color: 0x9a4a2a, cloth: 0x4a1d14,
    xp: 48, melee: true, range: 3.0, atkCd: 1.8, poison: true,
    lore: '赤尾蝎活过百年，尾针会长成一把弯刀。'
  },
  minerghost: {
    name: '矿工怨魂', model: 'ghost', family: 'undead',
    hp: 95, atk: 26, spd: 2.6, scale: 0.95, color: 0x9ab8c0, cloth: 0x3a4a52,
    xp: 43, ranged: true, range: 13, atkCd: 2.2, proj: { color: 0xa8d8e8, speed: 14 },
    ai: 'kite', lore: '塌方那夜他没爬出来，从此在坑道里数自己的骨头。'
  },
  magma: {
    name: '熔岩兽', model: 'golem', family: 'stone',
    hp: 240, atk: 30, spd: 1.9, scale: 1.3, color: 0x8a3a20, cloth: 0x5a1a0a,
    xp: 50, melee: true, range: 3.0, atkCd: 2.3, fire: true,
    lore: '地火凝成的躯壳，裂开的地方是红的。'
  },
  ironbeetle: {
    name: '铁甲虫', model: 'spider', family: 'beast',
    hp: 180, atk: 22, spd: 3.6, scale: 1.1, color: 0x4a4a3a, cloth: 0x2a2a20,
    xp: 41, melee: true, range: 2.6, atkCd: 1.7,
    lore: '甲壳硬得能崩刀，是矿工最恨的东西。'
  },
  runesmith: {
    name: '符匠', model: 'humanoid', family: 'humanoid',
    hp: 150, atk: 27, spd: 3.0, scale: 1.0, color: 0xc0a050, cloth: 0x5a4a20,
    xp: 47, ranged: true, range: 12, atkCd: 2.1, proj: { color: 0xffd166, speed: 16 },
    lore: '替人刻符的手艺人，刻到最后把自己也刻进去了。'
  },

  /* ===== 九幽地宫 · 28 级 ===== */
  bloodlord: {
    name: '血尸', model: 'humanoid', family: 'undead',
    hp: 240, atk: 30, spd: 2.9, scale: 1.2, color: 0x992b2b, cloth: 0x5a1414,
    /* 血尸胀到极限就炸成一团血雾 —— 28 级区需要一只让人「看到就得跑」的怪 */
    xp: 60, melee: true, range: 2.8, atkCd: 1.8,
    ai: 'bomber', lore: '血月泡透的尸首，走一步地上留一个红印。'
  },
  headless: {
    name: '无头骑士', model: 'headless', family: 'undead',
    hp: 320, atk: 38, spd: 3.6, scale: 1.25, color: 0x5a5a6a, cloth: 0x2a2a34,
    xp: 72, melee: true, range: 3.2, atkCd: 1.6, charge: true, armorHigh: true,
    lore: '头颅留在了战场上，于是他一直在找，一直找。'
  },
  crane: {
    name: '鹤妖', model: 'crane', family: 'spirit',
    hp: 160, atk: 40, spd: 3.4, scale: 1.1, color: 0xe8e8e0, cloth: 0xc04a4a,
    xp: 70, ranged: true, range: 15, atkCd: 2.0, proj: { color: 0xffe8c0, speed: 18 }, fly: true,
    ai: 'healer', lore: '仙门的坐骑，主人死了，它还守着那道门。'
  },
  bonewright: {
    name: '骨匠', model: 'skeleton', family: 'undead',
    hp: 140, atk: 36, spd: 2.6, scale: 1.0, color: 0xd8d2bd, cloth: 0x4a4a44,
    xp: 66, ranged: true, range: 14, atkCd: 2.0, proj: { color: 0xe8e0c8, speed: 16 },
    ai: 'summoner', lore: '把死人的骨头拆下来，重新拼成更听话的东西。'
  },
  shade: {
    name: '影魅', model: 'ghost', family: 'spirit',
    hp: 130, atk: 42, spd: 4.0, scale: 0.95, color: 0x4a3a6a, cloth: 0x1a1426,
    xp: 68, ranged: true, range: 12, atkCd: 1.8, proj: { color: 0x8a6aff, speed: 16 },
    ai: 'kite', lore: '灯灭之后，影子里多出来的那个。'
  },
  ironmaiden: {
    name: '铁处女', model: 'statue', family: 'stone',
    hp: 300, atk: 34, spd: 1.5, scale: 1.15, color: 0x6a5a5a, cloth: 0x3a2a2a,
    xp: 74, melee: true, range: 3.0, atkCd: 2.4, armorHigh: true,
    lore: '合上时像一口棺，打开时像一张嘴。'
  },

  /* ===== 天阙残境 · 35 级 ===== */
  fallen: {
    name: '堕仙', model: 'humanoid', family: 'spirit',
    hp: 280, atk: 48, spd: 3.4, scale: 1.1, color: 0xc0c8e0, cloth: 0x4a4a7a,
    xp: 88, ranged: true, range: 15, atkCd: 2.0, proj: { color: 0xd0e0ff, speed: 17 },
    ai: 'kite', lore: '仙骨还在，仙心已经烂了。'
  },
  voidbeast: {
    name: '虚空兽', model: 'beast', family: 'spirit',
    hp: 340, atk: 46, spd: 4.2, scale: 1.3, color: 0x3a2a5a, cloth: 0x1a1226,
    xp: 86, melee: true, range: 3.0, atkCd: 1.5, charge: true,
    ai: 'flank', lore: '从九霄的裂缝里爬出来，身上没有影子。'
  },
  swordwraith: {
    name: '剑冢怨灵', model: 'ghost', family: 'undead',
    hp: 200, atk: 52, spd: 3.0, scale: 1.05, color: 0x9aa8c8, cloth: 0x2a3448,
    xp: 84, ranged: true, range: 14, atkCd: 1.9, proj: { color: 0xb8d0ff, speed: 18 },
    ai: 'kite', lore: '埋在剑冢里的人，死时手里还攥着剑。'
  },
  thunderbird: {
    name: '雷鹏', model: 'crane', family: 'beast',
    hp: 260, atk: 54, spd: 4.6, scale: 1.35, color: 0x5a7ac0, cloth: 0x2a3a6a,
    xp: 90, ranged: true, range: 16, atkCd: 1.8, proj: { color: 0x9ad8ff, speed: 22 }, fly: true,
    /* 远程 + 自爆是矛盾的（远程怪不会自己贴上来），改包夹：从侧面俯冲下来射 */
    ai: 'flank', lore: '一展翼，云里就滚雷。'
  },
  jadeguard: {
    name: '玉傀', model: 'statue', family: 'stone',
    hp: 380, atk: 44, spd: 1.8, scale: 1.2, color: 0x7aa88a, cloth: 0x3a5a4a,
    xp: 92, melee: true, range: 3.2, atkCd: 2.2, armorHigh: true,
    ai: 'coward', lore: '仙门用整块玉雕的守卫，碎了也会自己长回去。'
  },

  /* ============================================================
   * [M4] 新增 36 只野外怪（计划书 §6.2 全量，地下城专属 4 只留给 M5）
   *
   * 分工（§6.1）：0 新模型 —— 全部复用既有 22 个程序化骨架，
   * 只换色 / 换比例 / 换族群 / 换 AI。行为差异全部来自 8 种 AI 原型
   * × 族群抗性的组合，不写任何新 AI。
   *
   * 数值口径：以「所在章现有怪池的均值」为锚（血量 / 攻击的都是
   * 放大前的基准值，实际按地图等级放大），同 AI 的怪拉不开倍率；
   * 石魔系血厚攻慢、兽系血薄速快、妖灵系血薄攻高，与老怪一致。
   * key / 名 / 模型 / 族群 / AI 一律照计划书 §6.2 的表，不另起名。
   * ============================================================ */

  /* ---------------- 卷一 1-1 幽篁林 / 落霞坡 ---------------- */
  foxfire: {
    name: '狐火', model: 'lantern', family: 'spirit',
    hp: 48, atk: 12, spd: 2.6, scale: 0.9, color: 0xff9a5a, cloth: 0x8a3a1a,
    xp: 16, ranged: true, range: 12, atkCd: 2.1, proj: { color: 0xffb080, speed: 14 }, fly: true,
    ai: 'kite', lore: '尾巴上的火不烫，烫的是它看你的眼神。'
  },
  cliffram: {
    name: '崖羊', model: 'beast', family: 'beast',
    hp: 72, atk: 11, spd: 4.4, scale: 1.05, color: 0x9a8468, cloth: 0x5a4a34,
    xp: 17, melee: true, range: 2.2, atkCd: 1.3, charge: true,
    ai: 'flank', lore: '从崖上直冲下来，撞上就是骨断。'
  },
  stonecrow: {
    name: '石鸦', model: 'bat', family: 'stone',
    hp: 55, atk: 12, spd: 4.4, scale: 0.85, color: 0x6a6a70, cloth: 0x3a3a40,
    xp: 15, melee: true, range: 2.0, atkCd: 1.2, fly: true,
    lore: '落在石碑上的鸦，本身就是碑。'
  },

  /* ---------------- 卷一 1-2 血月沼泽 / 沉骨滩 ---------------- */
  mirehorror: {
    name: '泥煞', model: 'drowned', family: 'undead',
    hp: 118, atk: 16, spd: 2.6, scale: 1.05, color: 0x5a5a3a, cloth: 0x33331f,
    xp: 27, melee: true, range: 2.4, atkCd: 2.0,
    lore: '泥里伸出的手，抓谁是谁。'
  },
  leechqueen: {
    name: '蛭母', model: 'spider', family: 'beast',
    hp: 135, atk: 12, spd: 2.2, scale: 1.1, color: 0x6a3a4a, cloth: 0x3a1a26,
    xp: 30, melee: true, range: 2.6, atkCd: 2.2, poison: true,
    ai: 'summoner', lore: '一直在产卵，一直在爬。'
  },
  bonefisher: {
    name: '骨钓翁', model: 'humanoid', family: 'undead',
    hp: 92, atk: 18, spd: 2.6, scale: 1.0, color: 0xc8c0a8, cloth: 0x4a4436,
    xp: 28, ranged: true, range: 14, atkCd: 2.2, proj: { color: 0xd8d2b8, speed: 15 },
    lore: '钓的不是鱼，是过路人的魂。'
  },

  /* ---------------- 卷一 1-3 骨塔祭场 / 玄铁矿洞 / 铁山绝顶 ---------------- */
  ironmaw: {
    name: '铁颚虫', model: 'spider', family: 'beast',
    hp: 175, atk: 24, spd: 3.2, scale: 1.1, color: 0x4a4a42, cloth: 0x26261f,
    xp: 50, melee: true, range: 2.6, atkCd: 1.6,
    lore: '颚能咬断铁镐，也咬断腿。'
  },
  cinderhand: {
    name: '灰手', model: 'golem', family: 'stone',
    hp: 200, atk: 26, spd: 2.4, scale: 1.2, color: 0x5a5248, cloth: 0x2e2a22,
    xp: 52, melee: true, range: 2.8, atkCd: 2.2, fire: true,
    ai: 'bomber', lore: '碰它一下，它就烧起来。'
  },
  forgemaster: {
    name: '铸魂匠', model: 'humanoid', family: 'humanoid',
    hp: 160, atk: 24, spd: 2.8, scale: 1.05, color: 0xb07a3a, cloth: 0x503014,
    xp: 54, ranged: true, range: 13, atkCd: 2.3, proj: { color: 0xffb060, speed: 15 },
    ai: 'healer', lore: '把活人烧成铁，再给铁安魂。'
  },

  /* ---------------- 卷二 2-1 寒潭水牢 / 冰魄湖 ---------------- */
  frostwraith: {
    name: '霜怨', model: 'ghost', family: 'undead',
    hp: 95, atk: 22, spd: 3.6, scale: 0.95, color: 0xaad8e8, cloth: 0x3a5a6a,
    xp: 62, ranged: true, range: 13, atkCd: 2.0, proj: { color: 0xbfe8ff, speed: 16 },
    ai: 'kite', lore: '死在水里，冷到现在。'
  },
  iceveil: {
    name: '冰帷', model: 'ghost', family: 'spirit',
    hp: 85, atk: 24, spd: 2.4, scale: 1.0, color: 0x8ac8e0, cloth: 0x2a4a5e,
    xp: 64, ranged: true, range: 15, atkCd: 2.4, proj: { color: 0xa8e0ff, speed: 14 },
    lore: '一层薄冰后面，有张脸。'
  },
  frozenwidow: {
    name: '冰寡妇', model: 'spider', family: 'beast',
    hp: 150, atk: 22, spd: 3.0, scale: 1.05, color: 0x4a6a8a, cloth: 0x1e3448,
    xp: 63, melee: true, range: 2.4, atkCd: 1.7, poison: true,
    lore: '结的网冻成冰棱。'
  },

  /* ---------------- 卷二 2-2 熔脉深沟 / 灰烬荒原 ---------------- */
  ashhound: {
    name: '灰烬犬', model: 'wolf', family: 'beast',
    hp: 150, atk: 28, spd: 4.6, scale: 1.0, color: 0x6a5a50, cloth: 0x33291f,
    xp: 78, melee: true, range: 2.2, atkCd: 1.3, charge: true, fire: true,
    ai: 'flank', lore: '从火场里跑出来的，毛还在烧。'
  },
  flamepriest: {
    name: '拜火祭司', model: 'humanoid', family: 'humanoid',
    hp: 165, atk: 27, spd: 2.8, scale: 1.0, color: 0xc06a2a, cloth: 0x5e2610,
    xp: 80, ranged: true, range: 13, atkCd: 2.3, proj: { color: 0xffa050, speed: 15 },
    ai: 'healer', lore: '一边烧人，一边替人祈祷。'
  },
  magmaworm: {
    name: '熔脉虫', model: 'snake', family: 'stone',
    hp: 215, atk: 26, spd: 2.8, scale: 1.1, color: 0x8a3a1a, cloth: 0x4a1608,
    xp: 79, melee: true, range: 2.8, atkCd: 2.0, fire: true,
    lore: '钻在地脉里，出来时带着岩浆。'
  },

  /* ---------------- 卷二 2-3 赤炎峡谷 / 焚天祭坛 ---------------- */
  sootwraith: {
    name: '焦魂', model: 'ghost', family: 'undead',
    hp: 150, atk: 32, spd: 4.2, scale: 0.95, color: 0x4a4038, cloth: 0x221c16,
    xp: 92, melee: true, range: 2.2, atkCd: 1.8, fire: true,
    ai: 'bomber', lore: '烧死的人，最后都成了火星。'
  },
  emberhound: {
    name: '炽鬃犬', model: 'wolf', family: 'beast',
    hp: 165, atk: 33, spd: 4.7, scale: 1.05, color: 0x8a3a18, cloth: 0x4a1608,
    xp: 94, melee: true, range: 2.2, atkCd: 1.3, charge: true, fire: true,
    ai: 'flank', lore: '鬃毛是火，跑起来像一道地火。'
  },
  cinderlord: {
    name: '烬主', model: 'brute', family: 'humanoid',
    hp: 250, atk: 31, spd: 3.0, scale: 1.25, color: 0x5a4438, cloth: 0x2c2018,
    xp: 96, melee: true, range: 3.0, atkCd: 2.0, fire: true, armorHigh: true,
    lore: '焚天军里烧得最久的那一个。'
  },

  /* ---------------- 卷三 3-1 九幽地宫 / 白骨长廊 / 忘川河滩 ---------------- */
  soulgaoler: {
    name: '引魂卒', model: 'headless', family: 'undead',
    hp: 280, atk: 38, spd: 3.2, scale: 1.2, color: 0x4a4a56, cloth: 0x22222a,
    xp: 108, melee: true, range: 3.0, atkCd: 1.7, charge: true, armorHigh: true,
    lore: '押着魂走，也顺手押你。'
  },
  papereffigy: {
    name: '纸人', model: 'humanoid', family: 'spirit',
    hp: 190, atk: 36, spd: 2.6, scale: 0.95, color: 0xe8e0d0, cloth: 0xb0a890,
    xp: 106, ranged: true, range: 12, atkCd: 2.4, proj: { color: 0xf0e8d0, speed: 13 },
    ai: 'summoner', lore: '烧给死人的，自己活了。'
  },
  wantern: {
    name: '忘灯', model: 'lantern', family: 'spirit',
    hp: 130, atk: 40, spd: 2.6, scale: 1.0, color: 0x8affd8, cloth: 0x1e4a3a,
    xp: 110, ranged: true, range: 12, atkCd: 2.2, proj: { color: 0xa8ffd8, speed: 13 }, fly: true,
    ai: 'kite', lore: '照亮的是忘川，不是路。'
  },

  /* ---------------- 卷三 3-2 九幽深渊 / 黄泉渡 ---------------- */
  tidewretch: {
    name: '潮尸', model: 'drowned', family: 'undead',
    hp: 260, atk: 42, spd: 2.6, scale: 1.05, color: 0x3a5a5a, cloth: 0x1c302f,
    xp: 124, melee: true, range: 2.4, atkCd: 2.0, poison: true,
    lore: '泡了三百年，还在往岸上爬。'
  },
  scalekeeper: {
    name: '业秤', model: 'statue', family: 'stone',
    hp: 330, atk: 40, spd: 1.6, scale: 1.2, color: 0x8a7a4a, cloth: 0x403520,
    xp: 126, ranged: true, range: 15, atkCd: 2.5, proj: { color: 0xd8c070, speed: 15 }, armorHigh: true,
    lore: '称你的业，称完就动手。'
  },
  wraithlord: {
    name: '怨主', model: 'ghost', family: 'spirit',
    hp: 220, atk: 44, spd: 2.8, scale: 1.1, color: 0x5a4a7a, cloth: 0x241c3a,
    xp: 128, ranged: true, range: 13, atkCd: 2.2, proj: { color: 0x9a7aff, speed: 15 },
    ai: 'summoner', lore: '一个怨念，召一群怨念。'
  },

  /* ---------------- 卷四 4-1 天罡剑冢 / 万剑坑 / 剑冢绝巅 ---------------- */
  swordhusk: {
    name: '剑壳', model: 'statue', family: 'stone',
    hp: 380, atk: 46, spd: 1.8, scale: 1.2, color: 0x8a8474, cloth: 0x403c30,
    xp: 140, melee: true, range: 3.0, atkCd: 2.3, armorHigh: true,
    lore: '剑冢里长出来的石头，会挥剑。'
  },
  bladewisp: {
    name: '剑魄', model: 'ghost', family: 'spirit',
    hp: 240, atk: 50, spd: 4.2, scale: 0.9, color: 0xb8c8e0, cloth: 0x3a4a66,
    xp: 142, melee: true, range: 2.2, atkCd: 1.4,
    ai: 'flank', lore: '剑断了，剑意没断。'
  },
  duelist: {
    name: '剑奴', model: 'humanoid', family: 'humanoid',
    hp: 300, atk: 48, spd: 3.6, scale: 1.05, color: 0xb0a080, cloth: 0x4c422a,
    xp: 145, melee: true, range: 2.6, atkCd: 1.3,
    ai: 'coward', lore: '打不过就跑，跑完回来再打。'
  },

  /* ---------------- 卷四 4-2 天阙残境 / 云海断桥 / 南天残门 ---------------- */
  cloudserpent: {
    name: '云蛟', model: 'snake', family: 'spirit',
    hp: 300, atk: 52, spd: 4.0, scale: 1.15, color: 0x9ac8e8, cloth: 0x3a5a7a,
    xp: 158, melee: true, range: 3.0, atkCd: 1.7, fly: true, charge: true,
    ai: 'flank', lore: '在云里游，落下就是雨。'
  },
  thunderdrum: {
    name: '雷鼓卫', model: 'golem', family: 'stone',
    hp: 400, atk: 50, spd: 1.9, scale: 1.3, color: 0x6a7288, cloth: 0x303648,
    xp: 156, melee: true, range: 3.2, atkCd: 2.4, armorHigh: true,
    lore: '擂鼓的手，也是砸人的手。'
  },
  feathered: {
    name: '羽化仙', model: 'crane', family: 'spirit',
    hp: 260, atk: 54, spd: 3.6, scale: 1.1, color: 0xf0e8f8, cloth: 0x8a6ac0,
    xp: 160, ranged: true, range: 15, atkCd: 2.0, proj: { color: 0xe8d8ff, speed: 18 }, fly: true,
    ai: 'kite', lore: '羽化了，仙没成。'
  },

  /* ---------------- 卷五 5-1 玉京废墟 / 星陨台 / 无相幻境 / 镜渊 ---------------- */
  jadepuppet: {
    name: '玉偶', model: 'statue', family: 'stone',
    hp: 430, atk: 56, spd: 1.9, scale: 1.15, color: 0x7aa88a, cloth: 0x365446,
    xp: 182, melee: true, range: 2.8, atkCd: 2.1, armorHigh: true,
    lore: '玉做的，碎了会自己长。'
  },
  starfaller: {
    name: '星陨者', model: 'humanoid', family: 'spirit',
    hp: 300, atk: 60, spd: 3.2, scale: 1.05, color: 0x8a7ab8, cloth: 0x33305a,
    xp: 185, ranged: true, range: 15, atkCd: 2.0, proj: { color: 0xb0a0ff, speed: 17 },
    lore: '从星上掉下来的，还在往下掉。'
  },
  silkweaver: {
    name: '织星蛛', model: 'spider', family: 'beast',
    hp: 360, atk: 54, spd: 2.8, scale: 1.15, color: 0x5a5a8a, cloth: 0x262646,
    xp: 188, melee: true, range: 2.6, atkCd: 2.0,
    ai: 'summoner', lore: '用星光结网。'
  },

  /* ---------------- 卷五 5-2 混沌海 ---------------- */
  mirrortwin: {
    name: '镜影', model: 'humanoid', family: 'spirit',
    hp: 420, atk: 62, spd: 4.2, scale: 1.0, color: 0xa8b8d8, cloth: 0x4a5a7a,
    xp: 205, melee: true, range: 2.4, atkCd: 1.4,
    ai: 'flank', lore: '镜子里那个，先动的手。'
  },
  maskweaver: {
    name: '画皮', model: 'fox', family: 'spirit',
    hp: 400, atk: 64, spd: 3.8, scale: 1.0, color: 0xd8a8b8, cloth: 0x6a3a4a,
    xp: 208, ranged: true, range: 12, atkCd: 2.0, proj: { color: 0xffc0d8, speed: 15 },
    ai: 'coward', lore: '披着别人的脸，笑着退。'
  },
  voidmoth: {
    name: '虚空蛾', model: 'bat', family: 'spirit',
    hp: 380, atk: 62, spd: 4.6, scale: 0.95, color: 0x6a5a9a, cloth: 0x2a2044,
    xp: 210, melee: true, range: 2.2, atkCd: 1.6, fly: true,
    ai: 'bomber', lore: '扑向光，也扑向你。'
  },

  /* ============================================================
   * [M5] 地下城专属怪（4 只，图鉴 76 → 80）
   *
   * 分工（§8.2）：每类地下城在现有怪池之外再挂 1 只「只在这类里出现」的，
   * 让「进的是哪个地宫」有实感。第 5 类「坠天」不挂新的 —— 妖灵池本来就有
   * 10 只（虚蛾 / 镜身 / 陨星使…），再加一只只是凑数。
   *
   * 它们**不进任何野外图池**（`MAPS[*].spawns` 里没有），只在 dungeon.js
   * 按类型现拼的怪池里出现；图鉴归区靠 `dungeon` 字段直接判「秘境」，
   * 不参与「出场最多的卷」那套统计。数值贴同类地下城怪的中位。
   * ============================================================ */

  shrouded: {
    name: '裹尸', model: 'zombie', family: 'undead', dungeon: 'tomb',
    hp: 210, atk: 30, spd: 2.0, scale: 1.1, color: 0x8a8470, cloth: 0x4a4432,
    xp: 78, melee: true, range: 3.0, atkCd: 2.4, armorHigh: true,
    ai: 'coward', lore: '一层层裹上去的，不知道最里面还是不是人。'
  },
  pitworm: {
    name: '坑虫', model: 'snake', family: 'beast', dungeon: 'well',
    hp: 165, atk: 32, spd: 4.0, scale: 1.0, color: 0x9a7a52, cloth: 0x5a4428,
    xp: 74, melee: true, range: 3.2, atkCd: 1.5, charge: true,
    ai: 'flank', lore: '塌方之后才有的东西，只认土里的震动。'
  },
  broodmatron: {
    name: '巢母', model: 'brood', family: 'plant', dungeon: 'den',
    hp: 295, atk: 26, spd: 1.6, scale: 1.35, color: 0x7a5a3a, cloth: 0x3a2a1a,
    xp: 96, melee: true, range: 3.6, atkCd: 2.6,
    ai: 'summoner', lore: '她自己不动，但整个窟里的东西都听她的。'
  },
  chainbound: {
    name: '镣魂', model: 'ghost', family: 'undead', dungeon: 'gaol',
    hp: 178, atk: 34, spd: 2.8, scale: 1.05, color: 0x7a8a9a, cloth: 0x33404e,
    xp: 82, ranged: true, range: 21, atkCd: 2.1, proj: { color: 0x9ac8e0, speed: 19 },
    ai: 'kite', lore: '镣铐还挂在腕上，链子另一头早就没人了。'
  }
};

/* ---------------- Boss ---------------- */
const BOSSES = {
  treeking: {
    id: 'treeking', name: '巨木妖王', title: '幽篁林之主', map: 'forest', level: 6, scale: 2.1,
    hp: 1800, atk: 20, spd: 2.6, color: 0x3f5a30, cloth: 0x2c3f22, model: 'treant', scale: 1.85,
    melee: true, range: 4.2, atkCd: 2.2, family: 'plant',
    patterns: ['slam', 'roots', 'summon'],
    lines: ['这片竹林……是我的坟场。', '凡人的血，最养竹。']
  },
  batking: {
    id: 'batking', name: '血蝠魔君', title: '嗜血长翼', map: 'forest', level: 8, scale: 1.9,
    hp: 2400, atk: 24, spd: 4.6, color: 0x7a1f2e, cloth: 0x3d0c13, model: 'batking', scale: 1.65,
    melee: true, range: 3.6, atkCd: 1.5, fly: true, family: 'beast',
    patterns: ['ringshot', 'charge', 'summon'],
    lines: ['血……都是我的血！', '你闻起来很香甜。']
  },
  chief: {
    id: 'chief', name: '半兽人酋长·碎骨', title: '血腥部族之首', map: 'swamp', level: 12, scale: 2.3,
    hp: 4200, atk: 34, spd: 3.2, color: 0x7a5a38, cloth: 0x4a2414, model: 'brute', scale: 1.85, skin: 0x9a7a5a,
    melee: true, range: 4.6, atkCd: 2.0, family: 'humanoid',
    patterns: ['slam', 'charge', 'summon'],
    lines: ['碎骨！我要把你碎成骨！', '部族的勇士，都死在你的手里？']
  },
  golemking: {
    id: 'golemking', name: '石甲巨魔', title: '卷一之终', map: 'ironpeak', level: 18, scale: 2.5,
    /* [M4] 卷末强化：15/6200/40 → 18/9000/50。
     * 血量按「老首领曲线外推 × 卷末 1.6」锚定（chief lv12 4200 → 每
     * 级约 +490 → lv18 章节首领 ≈ 7100，卷末 ×1.26 收在 9000，实战
     * ×4.5 后 ≈ 4 万，衔接 flameemperor 的 19000×4.5）；攻击走老曲线。
     * map 字段是显示口径；实际挂载在 MAPS.bosses（swamp 老巢 + ironpeak
     * 绝顶双驻扎，m1_3_1 / m1_3_4 两条主线各指一处，都不能拆）。 */
    hp: 9000, atk: 50, spd: 2.0, color: 0x6f675f, cloth: 0x3f3a34, model: 'golem', scale: 1.9,
    melee: true, range: 5.0, atkCd: 2.6, armorHigh: true, family: 'stone',
    actEnd: true, keyTier: 2,
    patterns: ['slam', 'rocks', 'quake'],
    lines: ['石头……不会痛。', '你也会变成石头。', '翻过这座山？先问过我的拳头。']
  },
  snakequeen: {
    id: 'snakequeen', name: '蛇姬·青鳞', title: '沼泽毒后', map: 'swamp', level: 16, scale: 2.0,
    hp: 5200, atk: 38, spd: 3.6, color: 0x2f7f5f, cloth: 0x1d3f30, model: 'snake',
    melee: false, ranged: true, range: 14, atkCd: 1.9, family: 'beast',
    patterns: ['poisonnova', 'ringshot', 'summon'],
    lines: ['来，让我看看你的骨头。', '毒会先吃掉你的眼睛。']
  },
  ghostlord: {
    id: 'ghostlord', name: '幽魂道尊', title: '九幽的引路人', map: 'mine', level: 20, scale: 2.2,
    hp: 7800, atk: 46, spd: 3.0, color: 0x7fd6c0, cloth: 0x1f3a38, model: 'ghost',
    melee: false, ranged: true, range: 16, atkCd: 2.0, family: 'spirit',
    patterns: ['ringshot', 'curse', 'summon'],
    lines: ['生者，为何踏入死地？', '你的魂魄，我收下了。']
  },
  /* [M4] 赤炎魔将挪回 2-1：主线 m2_1_1「冰火双魔」一直在寒潭水牢找它，
   * 但它挂在玄铁矿洞（lv16）的 bosses 里 —— 图与任务对不上。
   * 挪到 frost（lv20 图）并重定级 23→21，与冰魄妖后（24）组成同场双首领；
   * 血量按老首领曲线同步重算（原 9600 是按 lv23 给的）。 */
  firegeneral: {
    id: 'firegeneral', name: '赤炎魔将', title: '焚天军先锋', map: 'frost', level: 21, scale: 2.3,
    hp: 8400, atk: 50, spd: 3.4, color: 0xa82c20, cloth: 0x551008, model: 'brute', scale: 1.9,
    melee: true, range: 4.6, atkCd: 1.8, fire: true, family: 'humanoid',
    patterns: ['slam', 'fireline', 'charge'],
    lines: ['焚尽！焚尽一切！', '你的血肉，会为我燃起。']
  },
  icequeen: {
    id: 'icequeen', name: '冰魄妖后', title: '寒潭之底', map: 'mine', level: 24, scale: 2.1,
    hp: 8800, atk: 58, spd: 3.2, color: 0x7fb8e0, cloth: 0x2a4f6b, model: 'ghost', scale: 1.85,
    melee: false, ranged: true, range: 15, atkCd: 1.9, ice: true, family: 'spirit',
    patterns: ['frostnova', 'ringshot', 'summon'],
    lines: ['冷么？很快就感觉不到了。', '冰封，是最好的棺。']
  },
  spidermother: {
    id: 'spidermother', name: '万毒蛛母', title: '百子之巢', map: 'abyss', level: 28, scale: 2.6,
    hp: 13500, atk: 62, spd: 3.0, color: 0x6b4278, cloth: 0x2e1a35, model: 'spider', scale: 2.15,
    melee: true, range: 4.4, atkCd: 1.7, poison: true, family: 'beast',
    patterns: ['summon', 'poisonnova', 'charge'],
    lines: ['我的孩子们……饿了。', '别踩坏我的卵。']
  },
  /* [M4] 冥河渡者降级为 3-1 的驻场首领：卷末位让给黄泉主宰（yellowspring，
   * M3b 已按卷末血线立起）。重定级 30→32 对齐九幽地宫（lv32 图），
   * 血量按 19000+(lv−30)×2400 的同一条线重算（lv32 → 23800，收 21000
   * 留出与章节首领髓主 28600 的差距）。 */
  ferryman: {
    id: 'ferryman', name: '冥河渡者', title: '忘川摆渡人', map: 'abyss', level: 32, scale: 2.3,
    hp: 21000, atk: 88, spd: 2.8, color: 0x5b6b8a, cloth: 0x2a3244, model: 'golem', scale: 1.95,
    melee: true, range: 5.2, atkCd: 2.3, armorHigh: true, family: 'undead',
    patterns: ['quake', 'ringshot', 'curse'],
    lines: ['上船吧，船票是命。', '忘川水凉，别回头。']
  },
  swordlord: {
    id: 'swordlord', name: '天罡剑魂', title: '万剑之主', map: 'abyss', level: 32, scale: 2.2,
    hp: 18000, atk: 78, spd: 4.0, color: 0xb0a480, cloth: 0x50441f, model: 'humanoid',
    melee: true, range: 3.8, atkCd: 1.3, family: 'spirit',
    patterns: ['swordrain', 'charge', 'slam'],
    lines: ['剑，即是道。', '接我这一剑。']
  },
  /* ---------------- 卷二 · 血月焚天（M3） ----------------
   * 2-2 / 2-3 四张新图各自的首领。
   *
   * 模型全部复用既有骨架、只换色与技能组合 —— 这是 §5.3 定下的原则
   * 「新地貌不新模型」：造型工作留给美术，数据层先把「走进祭坛有人」跑通。
   * 等级严格对齐 ACTS：2-2 是 23~26，2-3 是 27~30。
   * 血量按「同等级老首领 × 1.15」给，因为新图的可走面积是老图的 3 倍，
   * 战斗场地更大、走位更久，血太薄会被直接跳过机制。 */
  magmalord: {
    id: 'magmalord', name: '熔脉之主·赤髓', title: '深井尽头的火', map: 'magmagully', level: 24, scale: 2.2,
    hp: 11200, atk: 60, spd: 2.8, color: 0xb03a18, cloth: 0x5a1408, model: 'golem', scale: 1.9,
    melee: true, range: 4.8, atkCd: 2.1, fire: true, family: 'stone',
    patterns: ['slam', 'fireline', 'meteor'],
    lines: ['这口井，烧了三百年。', '你也想变成炉渣吗？']
  },
  ashwarden: {
    id: 'ashwarden', name: '灰烬守望者', title: '荒原上最后一尊像', map: 'ashfield', level: 26, scale: 2.3,
    hp: 12800, atk: 66, spd: 2.4, color: 0x6a6058, cloth: 0x2e2a26, model: 'golem', scale: 1.95,
    melee: true, range: 5.0, atkCd: 2.4, armorHigh: true, family: 'stone',
    patterns: ['quake', 'rocks', 'slam'],
    lines: ['灰会记住每一个脚印。', '风停了，你也该停了。']
  },
  flamewraith: {
    id: 'flamewraith', name: '焚风怨灵', title: '峡谷里不肯散的火', map: 'flamecanyon', level: 28, scale: 2.1,
    hp: 14200, atk: 72, spd: 3.6, color: 0xd8622a, cloth: 0x6a2410, model: 'ghost', scale: 1.9,
    melee: false, ranged: true, range: 15, atkCd: 1.9, fire: true, family: 'spirit',
    patterns: ['ringshot', 'fireline', 'curse'],
    lines: ['烧过了，就不冷了。', '风带我走，火留我下来。']
  },
  flameemperor: {
    id: 'flameemperor', name: '焚天炎帝', title: '卷二之终', map: 'flamealtar', level: 30, scale: 2.7,
    hp: 19000, atk: 84, spd: 3.2, color: 0xe04a14, cloth: 0x6e1a06, model: 'brute', scale: 2.0, skin: 0xc05020,
    melee: true, range: 5.0, atkCd: 1.8, fire: true, family: 'humanoid',
    actEnd: true, keyTier: 3,
    patterns: ['slam', 'fireline', 'meteor', 'summon'],
    lines: ['焚天不是我的名号，是我的活。', '天要烧，我就替它烧。', '你烧不起来的，我教你。']
  },
  /* ---------------- 卷一 ~ 卷五 新图首领（M3b） ----------------
   * 19 张新图各自的首领。模型全部复用（§5.3「新地貌不新模型」），
   * 只换色、换技能组合、换台词 —— 造型工作留给美术，数据层先把
   * 「走进祭坛有人」跑通。
   *
   * 数值口径（三条线，改之前先对齐）：
   *   atk = 105 + (level − 38) × 2.6     以 chaos（lv38 / 105）为锚点
   *   hp  = 19000 + (level − 30) × 2400  以 flameemperor（lv30 / 19000）为锚点
   *         lv ≤ 20 的走老首领曲线（chief lv12 4200 / golemking lv15 6200）
   *   hp 随等级**线性**而不是指数：指数在 lv60 会到 63 万，玩家 60 级的
   *   DPS 撑不住；线性到 lv60 是 9.1 万，配合装备成长刚好打 40~70 秒。
   *
   * 为什么要新建而不是沿用老首领：`bossHpScale(lv)` 只按等级放大伤害，
   * 血量不跟着涨。lv57 的图里放一只 lv30 的冥河渡者，会被玩家一个技能秒掉，
   * 首领战直接不存在。 */
  boneabbot: {
    id: 'boneabbot', name: '骨塔主持', title: '把骨头念成经的人', map: 'bonetower', level: 13, scale: 2.0,
    hp: 5200, atk: 40, spd: 3.0, color: 0xb0a488, cloth: 0x4a4234, model: 'humanoid', scale: 1.9,
    melee: false, ranged: true, range: 14, atkCd: 2.1, family: 'undead',
    patterns: ['curse', 'summon', 'ringshot'],
    lines: ['这塔里的每一块骨头，都念过一遍经。', '你也留下来听吧。']
  },
  marrowlord: {
    id: 'marrowlord', name: '髓主', title: '白骨长廊的尽头', map: 'bonehall', level: 34, scale: 2.3,
    hp: 28600, atk: 95, spd: 2.6, color: 0xc8bca0, cloth: 0x3a3328, model: 'golem', scale: 1.95,
    melee: true, range: 5.0, atkCd: 2.4, armorHigh: true, family: 'undead',
    patterns: ['quake', 'slam', 'rocks'],
    lines: ['长廊很长，走到头就是我的骨髓。', '你的骨头，比上一批硬。']
  },
  riverwraith: {
    id: 'riverwraith', name: '忘川怨魂', title: '河滩上不肯走的人', map: 'forgetshore', level: 35, scale: 2.1,
    hp: 31000, atk: 97, spd: 3.4, color: 0x6a8a9a, cloth: 0x22303a, model: 'ghost', scale: 1.9,
    melee: false, ranged: true, range: 16, atkCd: 1.9, family: 'spirit',
    patterns: ['ringshot', 'curse', 'poisonnova'],
    lines: ['我还没喝那碗汤。', '你替我喝了吧。']
  },
  abysswyrm: {
    id: 'abysswyrm', name: '深渊古蟒', title: '九幽之下最老的东西', map: 'abyssdeep', level: 37, scale: 2.5,
    hp: 35800, atk: 102, spd: 3.8, color: 0x3a2a52, cloth: 0x1a1226, model: 'snake', scale: 2.3,
    melee: true, range: 5.4, atkCd: 1.8, poison: true, family: 'beast',
    patterns: ['charge', 'slam', 'poisonnova'],
    lines: ['深渊不是坑，是嘴。', '我在这里，比九幽还早。']
  },
  yellowspring: {
    id: 'yellowspring', name: '黄泉主宰', title: '渡口不渡人', map: 'yellowferry', level: 40, scale: 2.4,
    hp: 43000, atk: 110, spd: 2.8, color: 0x8a7a58, cloth: 0x3a3020, model: 'golem', scale: 2.1,
    melee: true, range: 5.2, atkCd: 2.2, armorHigh: true, family: 'undead',
    actEnd: true, keyTier: 4,
    patterns: ['quake', 'ringshot', 'curse', 'slam'],
    lines: ['船早就不在了，你们还在等。', '黄泉不收钱，只收人。']
  },
  swordguardian: {
    id: 'swordguardian', name: '剑冢守灵', title: '替万人守剑的人', map: 'swordtomb', level: 42, scale: 2.2,
    hp: 47800, atk: 115, spd: 3.8, color: 0xb8ac88, cloth: 0x50462a, model: 'humanoid', scale: 2.1,
    melee: true, range: 4.0, atkCd: 1.4, family: 'spirit',
    patterns: ['swordrain', 'charge', 'slam'],
    lines: ['这里的每一把剑，都有名字。', '你没有。']
  },
  bladelord: {
    id: 'bladelord', name: '万剑之君', title: '坑底那一柄没人拔得出的剑', map: 'swordpit', level: 44, scale: 2.3,
    hp: 52600, atk: 121, spd: 3.6, color: 0xa89a72, cloth: 0x443c22, model: 'humanoid', scale: 2.1,
    melee: true, range: 4.2, atkCd: 1.3, family: 'spirit',
    patterns: ['swordrain', 'ringshot', 'charge'],
    lines: ['万剑归我，我归坑。', '拔出来试试。']
  },
  swordemperor: {
    id: 'swordemperor', name: '剑帝', title: '剑冢绝巅的那道背影', map: 'swordapex', level: 45, scale: 2.6,
    hp: 55000, atk: 123, spd: 4.0, color: 0xd8c8a0, cloth: 0x6a5c30, model: 'humanoid', scale: 2.5,
    melee: true, range: 4.4, atkCd: 1.2, family: 'spirit',
    patterns: ['swordrain', 'charge', 'slam', 'summon'],
    lines: ['剑不是兵器，是墓志。', '你的墓志，我来写。']
  },
  cloudwarden: {
    id: 'cloudwarden', name: '云海守将', title: '断桥另一头的人', map: 'cloudbridge', level: 49, scale: 2.4,
    hp: 64600, atk: 134, spd: 3.2, color: 0x8a9ab8, cloth: 0x36425a, model: 'brute', scale: 2.2, skin: 0xa8b8d0,
    melee: true, range: 4.8, atkCd: 1.9, family: 'humanoid',
    patterns: ['slam', 'charge', 'ringshot'],
    lines: ['桥是我拆的。', '过不去的，就不该过去。']
  },
  heavenguard: {
    id: 'heavenguard', name: '南天守门神', title: '门塌了，人还在', map: 'southgate', level: 50, scale: 2.6,
    hp: 67000, atk: 136, spd: 2.4, color: 0x9aaccc, cloth: 0x3a4a66, model: 'golem', scale: 2.4,
    melee: true, range: 5.4, atkCd: 2.5, armorHigh: true, family: 'stone',
    actEnd: true, keyTier: 5,
    patterns: ['quake', 'slam', 'rocks', 'ringshot'],
    lines: ['门没了，守的还是门。', '南天不开。']
  },
  jadeemperor: {
    id: 'jadeemperor', name: '玉京残帝', title: '废墟里还坐得端端正正的那位', map: 'jadecapital', level: 52, scale: 2.5,
    hp: 71800, atk: 141, spd: 3.2, color: 0x6a9a8a, cloth: 0x1e3a34, model: 'demon', scale: 2.3,
    melee: true, range: 5.0, atkCd: 1.9, family: 'spirit',
    patterns: ['slam', 'ringshot', 'curse', 'summon'],
    lines: ['玉京塌了，朕还在。', '跪吧，跪着死体面些。']
  },
  starlord: {
    id: 'starlord', name: '陨星之主', title: '把星星拽下来的人', map: 'starfall', level: 54, scale: 2.5,
    hp: 76600, atk: 147, spd: 3.4, color: 0x7a6ab0, cloth: 0x2a2044, model: 'demon', scale: 2.4,
    melee: false, ranged: true, range: 17, atkCd: 1.8, family: 'spirit',
    patterns: ['meteor', 'ringshot', 'charge'],
    lines: ['台上那些坑，都是我砸的。', '天上还有的是。']
  },
  mirrordemon: {
    id: 'mirrordemon', name: '无相天魔', title: '幻境里的那个你', map: 'mirrorrealm', level: 56, scale: 2.6,
    hp: 81400, atk: 152, spd: 3.6, color: 0x8a7ac0, cloth: 0x2e2450, model: 'demon', scale: 2.5,
    melee: true, range: 5.2, atkCd: 1.8, family: 'spirit',
    patterns: ['slam', 'ringshot', 'curse', 'summon'],
    lines: ['我就是你，只是没输过。', '照照镜子吧。']
  },
  mirrorlord: {
    id: 'mirrorlord', name: '镜渊之主', title: '渊底那面镜子', map: 'mirrorabyss', level: 57, scale: 2.6,
    hp: 170000, atk: 154, spd: 3.4, color: 0x6a5aa8, cloth: 0x1e1840, model: 'demon', scale: 2.5,
    melee: false, ranged: true, range: 16, atkCd: 1.7, family: 'spirit',
    patterns: ['ringshot', 'charge', 'curse', 'meteor'],
    lines: ['往下看，看到的都是真的。', '镜子里那个，才是本尊。']
  },
  nineheaven: {
    id: 'nineheaven', name: '九霄神将', title: '最后一层天的人', map: 'nineapex', level: 58, scale: 2.7,
    hp: 175000, atk: 157, spd: 3.8, color: 0xd8c890, cloth: 0x6a5a2a, model: 'brute', scale: 2.6, skin: 0xe0c8a0,
    melee: true, range: 5.0, atkCd: 1.8, family: 'humanoid',
    patterns: ['slam', 'charge', 'meteor', 'summon'],
    lines: ['九霄之上，没有更高的地方了。', '上去，就得踩着神过。']
  },
  chaosavatar: {
    id: 'chaosavatar', name: '混沌·无相天魔（真身）', title: '九霄终焉 · 真', map: 'chaossea', level: 60, scale: 3.0,
    hp: 195000, atk: 162, spd: 3.4, color: 0x5a2478, cloth: 0x220c30, model: 'demon', scale: 2.1, skin: 0x6a3a7a,
    melee: true, range: 5.6, atkCd: 1.8, all: true, family: 'spirit',
    /* [M4] 终局：keyTier 仍是 5（没有六阶），final 把掉率抬到 15% */
    actEnd: true, keyTier: 5, final: true,
    patterns: ['slam', 'ringshot', 'charge', 'meteor', 'summon', 'curse'],
    lines: ['天阙那一具，只是我伸出去的手。', '现在，你见到我了。', '九霄本来就没有底，你以为你站在上面？']
  },
  chaos: {
    id: 'chaos', name: '混沌·无相天魔', title: '九霄终焉', map: 'heaven', level: 38, scale: 3.0,
    hp: 42000, atk: 105, spd: 3.4, color: 0x5a2478, cloth: 0x220c30, model: 'demon', scale: 2.1, skin: 0x6a3a7a,
    melee: true, range: 5.6, atkCd: 1.9, all: true, family: 'spirit',
    patterns: ['slam', 'ringshot', 'charge', 'meteor', 'summon', 'curse'],
    lines: ['九霄之上，本无神佛。', '你不过是又一个妄念。', '来吧，让我看看你的道。']
  },

  /* ============================================================
   * [M5] 地下城关卡守卫（5 只，**不属于世界首领**）
   *
   * 为什么不塞进「32 个世界首领」的口径（§8.2 的注）：
   * 它们是地下城第 3 层的守卫，同一只要在 5 个阶里各出现一次，
   * 而 `spawnEnemy` 的首领血量是「cfg.hp × 恒定 4.5」——写死绝对值
   * 就没法跟着阶走。所以这里的 hp / atk 只是**占位**：
   * dungeon.js 生成时会按「同阶小怪均血 × 14 / 均攻 × 3.2」反解后覆盖
   * （和 trial.js 里 `b.hp = b.maxHp = avgHp * hpEq` 同一套做法）。
   *
   * `level: 36` 只是个经验基数（`e.cfg.level × BALANCE.xp.bossLv`），
   * 不代表它固定 36 级 —— 实际等级由 `dungeonMobLevel()` 决定。
   * 它们也不进任何 `MAPS[*].bosses`，所以野外永远不会刷出来。
   * ============================================================ */

  dgb_tomb: {
    id: 'dgb_tomb', name: '骨将·白起', title: '尸冢 · 第三层', dungeon: true, level: 36,
    hp: 12000, atk: 68, spd: 3.2, family: 'undead', model: 'brute',
    scale: 2.05, color: 0xb8b0a0, cloth: 0x53504a, skin: 0xd8d0c0,
    melee: true, range: 4.8, atkCd: 2.0, armorHigh: true,
    patterns: ['slam', 'quake', 'ringshot'],
    lines: ['坑杀四十万，还嫌不够。', '死人不会喊疼，你也不必。']
  },
  dgb_well: {
    id: 'dgb_well', name: '矿主·塌', title: '塌井 · 第三层', dungeon: true, level: 36,
    hp: 13500, atk: 72, spd: 2.6, family: 'stone', model: 'golem',
    scale: 2.0, color: 0x7a6a58, cloth: 0x3a3028,
    melee: true, range: 5.0, atkCd: 2.4, armorHigh: true,
    patterns: ['quake', 'slam', 'rocks'],
    lines: ['这条脉是我的，你们挖不得。', '塌下来，一起埋着。']
  },
  dgb_den: {
    id: 'dgb_den', name: '獠王', title: '兽窟 · 第三层', dungeon: true, level: 36,
    hp: 11000, atk: 76, spd: 4.2, family: 'beast', model: 'beast',
    scale: 2.1, color: 0x8a5a3a, cloth: 0x3a2418,
    melee: true, range: 4.2, atkCd: 1.5, charge: true,
    patterns: ['charge', 'slam', 'summon'],
    lines: ['这窟里的，都听我的。', '你身上有血味。']
  },
  dgb_gaol: {
    id: 'dgb_gaol', name: '狱卒长·枷', title: '沉狱 · 第三层', dungeon: true, level: 36,
    hp: 12500, atk: 74, spd: 3.0, family: 'undead', model: 'drowned',
    scale: 2.0, color: 0x5a6a78, cloth: 0x28323c,
    melee: true, range: 4.6, atkCd: 2.0,
    patterns: ['ringshot', 'curse', 'slam'],
    lines: ['水涨到哪儿，人就关到哪儿。', '放你出去，我就得进去。']
  },
  dgb_fall: {
    id: 'dgb_fall', name: '堕天者', title: '坠天 · 第三层', dungeon: true, level: 36,
    hp: 13000, atk: 80, spd: 3.6, family: 'spirit', model: 'demon',
    scale: 2.0, color: 0x4a2a6a, cloth: 0x1e1030,
    melee: true, range: 5.2, atkCd: 1.9, all: true,
    patterns: ['slam', 'ringshot', 'meteor', 'charge'],
    lines: ['我从上面掉下来，才知道下面也有人在爬。', '风推着我，也推着你。']
  }
};

/* ---------------- 图鉴分组（异兽志按卷翻页，[M4] 改版） ---------------- */
/* [M4] 原来 5 区 = 5 张老图，30 张图 / 76 只怪之后老口径收录不进去。
 * 改成「按卷 5 大区」：一区 = 该卷全部图的怪池并集（归区逻辑见 game.js
 * codexRegionOf —— 按 ACTS 顺序取第一个刷它的图所在卷）。
 *
 * 老档兼容：旧档 regions 里的 forest/swamp/mine/abyss/heaven 五个 key
 * 按下表映射到新卷（game.js 载入时迁移），迁移后会对每卷重跑一次
 * checkCodexRegion —— 老玩家已录的怪不会白录，缺的怪补录后自动补发加成。
 *
 * 加成口径：卷一合并了原来幽篁林 / 血月沼泽 / 玄铁矿洞三区的加成
 * （对精英 +4% / 毒抗 +6% / 穿透 +5%）—— 一区的条目也变成了三倍多，
 * 难度与收益一起涨；卷三 / 卷四分别继承九幽 / 天阙的原加成；
 * 卷二 / 卷五是新补的档位。 */
const CODEX_REGIONS = [
  { id: 'part1', name: '卷一 · 桃源残照', level: 1, bonus: { eliteDmg: 4, poisonRes: 6, armorPen: 5 }, bonusDesc: '对精英与首领伤害 +4% · 毒抗 +6% · 护甲穿透 +5%' },
  { id: 'part2', name: '卷二 · 血月焚天', level: 19, bonus: { crit: 4 }, bonusDesc: '暴击率 +4%' },
  { id: 'part3', name: '卷三 · 幽冥黄泉', level: 31, bonus: { dmgReduce: 3 }, bonusDesc: '伤害减免 +3%' },
  { id: 'part4', name: '卷四 · 剑冢天阙', level: 41, bonus: { skillDmg: 4 }, bonusDesc: '技能伤害 +4%' },
  { id: 'part5', name: '卷五 · 九霄终焉', level: 51, bonus: { dmgAll: 5 }, bonusDesc: '所有伤害 +5%' },
  /* [M5] 第六区：地下城专属怪（4 只）。为什么不并进卷里 ——
   * 它们只在地脉裂隙里出现，玩家第一次见到它们是在地下城，
   * 归到任何一卷都会让那卷的「全录」变成「必须去打地下城」，
   * 而地下城本来有自己的 25 条进度（DUNGEON_CODEX），不该重复罚一次。 */
  { id: 'rift', name: '秘境 · 地脉裂隙', level: 20, bonus: { bossDmg: 6 }, bonusDesc: '对首领伤害 +6%' }
];

/* 旧区 key → 新卷 key（只用于老档迁移，别的地方不要引用） */
const CODEX_REGION_LEGACY = {
  forest: 'part1', swamp: 'part1', mine: 'part1',
  abyss: 'part3', heaven: 'part4'
};
