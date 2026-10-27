/* ============================================================
 * 数据层 · 怪物
 * 40 种普通怪（6 族群）+ 12 个 Boss
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
    id: 'golemking', name: '石甲巨魔', title: '玄铁山的守望者', map: 'swamp', level: 15, scale: 2.5,
    hp: 6200, atk: 40, spd: 2.0, color: 0x6f675f, cloth: 0x3f3a34, model: 'golem', scale: 1.9,
    melee: true, range: 5.0, atkCd: 2.6, armorHigh: true, family: 'stone',
    patterns: ['slam', 'rocks', 'quake'],
    lines: ['石头……不会痛。', '你也会变成石头。']
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
  firegeneral: {
    id: 'firegeneral', name: '赤炎魔将', title: '焚天军先锋', map: 'mine', level: 23, scale: 2.3,
    hp: 9600, atk: 54, spd: 3.4, color: 0xa82c20, cloth: 0x551008, model: 'brute', scale: 1.9,
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
  ferryman: {
    id: 'ferryman', name: '冥河渡者', title: '忘川摆渡人', map: 'abyss', level: 30, scale: 2.3,
    hp: 15500, atk: 70, spd: 2.8, color: 0x5b6b8a, cloth: 0x2a3244, model: 'golem', scale: 1.95,
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
    patterns: ['slam', 'fireline', 'meteor', 'summon'],
    lines: ['焚天不是我的名号，是我的活。', '天要烧，我就替它烧。', '你烧不起来的，我教你。']
  },
  chaos: {
    id: 'chaos', name: '混沌·无相天魔', title: '九霄终焉', map: 'heaven', level: 38, scale: 3.0,
    hp: 42000, atk: 105, spd: 3.4, color: 0x5a2478, cloth: 0x220c30, model: 'demon', scale: 2.1, skin: 0x6a3a7a,
    melee: true, range: 5.6, atkCd: 1.9, all: true, family: 'spirit',
    patterns: ['slam', 'ringshot', 'charge', 'meteor', 'summon', 'curse'],
    lines: ['九霄之上，本无神佛。', '你不过是又一个妄念。', '来吧，让我看看你的道。']
  }
};

/* ---------------- 图鉴分组（异兽志按区域翻页） ---------------- */
/* bonus 是「集齐本区全部条目」的永久加成，写进 state.codex.regions，
 * computePlayerStats 里汇总，所以它必须是真的属性键（见 data-core STATS） */
const CODEX_REGIONS = [
  { id: 'forest', name: '幽篁林', level: 4, bonus: { eliteDmg: 4 }, bonusDesc: '对精英与首领伤害 +4%' },
  { id: 'swamp', name: '血月沼泽', level: 12, bonus: { poisonRes: 6 }, bonusDesc: '毒抗 +6%' },
  { id: 'mine', name: '玄铁矿洞', level: 20, bonus: { armorPen: 5 }, bonusDesc: '护甲穿透 +5%' },
  { id: 'abyss', name: '九幽地宫', level: 28, bonus: { dmgReduce: 3 }, bonusDesc: '伤害减免 +3%' },
  { id: 'heaven', name: '天阙残境', level: 35, bonus: { skillDmg: 4 }, bonusDesc: '技能伤害 +4%' }
];
