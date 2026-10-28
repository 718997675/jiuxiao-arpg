/* ============================================================
 * 数据层 · 世界 Boss（M18.1）
 *
 * 为什么单独一张表，不塞进 BOSSES：
 *   BOSSES 里 40 只是「章节守卫」，它们的存在意义是**卡住主线**，
 *   所以字段只够描述「血量 / 攻击 / 三五个技能模式」。
 *   世界 Boss 要的是另一套东西：领域、三阶段、刷新生命周期、
 *   必掉传世、骨架 id。硬塞进 BOSSES 会让那张表多出 6×12 个
 *   只有 6 行用得上的字段，而 40 只守卫一个都不读。
 *
 * 但**结构必须兼容 BOSSES**：`spawnEnemy(kind, x, z, elite, lv, bossId)`
 * 里那一串 `cfg.hp / cfg.atk / cfg.scale / cfg.model / cfg.family /
 * cfg.resist / cfg.name / cfg.ranged / cfg.range / cfg.atkCd` 必须全部可读，
 * 否则 M18.2 就得复制一份 spawnEnemy。所以下面每条都先写全
 * 「BOSSES 字段」，再往后追加 `wb*` 专属字段。
 *
 * M18.2 要补的三处（这里先记着，换账号时不用再翻计划书）：
 *   1. `game.js spawnEnemy`：`const cfg = bossId ? (BOSSES[bossId] || WORLD_BOSSES[bossId]) : MONSTERS[kind]`
 *   2. `game.js spawnEnemy` 的 `e` 字面量里补 `armorMul: cfg.armorMul || 1`
 *      （`damageEnemy` 已经在读 `e.armorMul`，但只有地下城词缀会写它）
 *   3. `game.js` 别把世界 Boss 记进 `MAPS[mapId].bosses` —— 它是临时挂的，
 *      写进图数据会在读档时被当成常驻首领反复重生
 *
 * 数值口径见 V2-ROADMAP.md §18.1。这里补两句最容易被改坏的：
 *
 *   1. `hp` 是 **cfg 血量**，进 spawnEnemy 后还要 × `BALANCE.boss.hpMul`（4.5），
 *      所以写 300000 实际是 1.35M。改数值请改 cfg，别去改 hpMul（那是全首领共用的）。
 *
 *   2. **`armorMul` 必须留在 1.0，不要再往上乘。** 这是 2026-10-28 算错一次的地方：
 *      护甲是双曲减伤 `100/(100+A)`，不是线性减伤。60 级 `armorHigh` 首领
 *      A = 540 → 吃 15.6% 伤害；无 armorHigh 的混沌真身 A = 180 → 吃 35.7%。
 *      也就是说 **armorHigh 本身已经把硬度抬了 2.3 倍**，再乘 armorMul 2.4
 *      （A = 1296 → 吃 7.2%）就是 5 倍，叠上血量与抗性后总硬度 11.8 倍 ——
 *      混沌真身真实 TTK 约 81 秒，11.8 倍就是 16 分钟，没人打得过。
 *      现在的硬度由三层给：`armorHigh`（3 倍护甲）+ 血量 1.4~1.7 倍 + 领域压力。
 *      校验脚本 dev/check-worldboss.js 用「相对混沌真身的有效血量」把这条钉死了。
 *
 * ------------------------------------------------------------
 * 【2026-10-28 第二版 · 与「八部天龙」强制去重】
 *
 * 用户要求：世界 Boss 的设计不能和八部天龙重复。逐条比对后，
 * 撞的不是造型，是**谜题**：
 *
 *   | | 八部天龙（M7，同分支并存） | 世界 Boss（本表） |
 *   |---|---|---|
 *   | 抗性结构 | 一个 −60 洞 + 四条 +80 墙，**8 倍差** | **全元素同一个数**，差 1.00 倍 |
 *   | 玩家的答案 | 换武器（猜元素） | 换站位 / 背阶段（读领域） |
 *   | 破绽 | `stagger` 技能后摇 ×1.5 | 无 `stagger` 字段，窗口由阶段给 |
 *   | 招式 | `patterns` 共用池（slam/charge/…） | `skills` 每只 3 个专属形状 |
 *   | 段数 | 单段 | 三阶段 + `enter` 改规则 |
 *   | 领域 | 无 | 6 种，是这套系统的**唯一**识别符号 |
 *
 * 所以本表把抗性**压平成一条水平线**（`resist` 五项同值，`weak` 全 null），
 * 并且**不许出现 `stagger` / `patterns` 字段** —— 那两个是八部的语言。
 * `counter: 'domain'` 是显式声明：「这只的答案在领域里」，
 * 图鉴（M18.9）会照着它写提示，check-worldboss 第十节把它和八部钉成互斥。
 *
 * 代价说清楚：抗性平坦之后「打对元素」的 1.6 倍加成没了，
 * 同样血量会**变硬 2.3 倍**，所以 `hp` 从 280k~340k 降到 175k~235k。
 * 数字看着小了，但有效血量（对混沌真身 3.3~3.9 倍）和 TTK 都没变 ——
 * **有效血量才是口径，`hp` 只是喂给 spawnEnemy 的原料。**
 * ============================================================ */

/* ---------------- 全局配置 ---------------- */
const WORLD_BOSS_CFG = {
  /* 30 分钟真实时间。**不要**换成游戏内时间：世界 Boss 的意义是
   * 「每半小时上线看一眼」，用游戏内时间等于「谁挂机久谁见得多」。 */
  cycle: 30 * 60 * 1000,
  /* 玩家等级门槛。40 是传世掉落线（UNIQUE_ITEMS 最低 ilvl 40），
   * 低于这个等级遇到它只有死，而且死了也捡不到能用的东西。 */
  minLevel: 40,
  /* 同一时刻只有一只。注意力只有一份，同时刷三只的结果是三只都没人打。 */
  sameTime: 1,
  /* 世界 Boss 固定 60 级：掉落 ilvl = 60 + 2（首领加成）= 62，
   * 正好覆盖全部 40 件传世（最高 ilvl 60）。跟着玩家等级走会让
   * 「30 分钟后回来它变强了」，这不是刷子游戏该有的手感。 */
  level: 60,
  ilvl: 62,
  /* 无人击杀时的空窗。0 = 「消失」和「下一只出现」是同一条 tick 的两半，
   * 玩家永远有得打；写 5000 会让人盯着空地图等。 */
  respawnGap: 0,
  /* 横幅停留秒数（M18.3） */
  bannerT: 3.2,
  /* 领域光环淡入秒数（M18.4） */
  domainFade: 1.5,
  /* 掉落：必掉传世件数区间。困难 +1 下限、极难 +1 下限（M18.8 读）。 */
  uniqueMin: 1,
  uniqueMax: 3,
  diffBonus: { normal: 0, hard: 1, nightmare: 1, hell: 2 }
};

/* 元素键与 MON_FAMILIES / damageEnemy 完全一致，别自创 */
const WB_ELEMS = ['phys', 'fire', 'ice', 'lightning', 'poison'];
const WB_ELEM_CN = { phys: '物理', fire: '火', ice: '冰', lightning: '雷', poison: '毒' };

/* 技能形状。M18.7 的施法层按 shape 分派，不按技能 id 分派 ——
 * 18 个技能如果各写一套命中判定，加第 19 个就要重读一遍代码。 */
const WB_SHAPES = {
  line: '直线穿透',      // 起点在 boss 面前，长 range、宽 3
  fan: '扇形',           // 朝向 ±arc/2
  circle: '自身圆形',    // 以 boss 为圆心
  ring: '环形',          // 以 boss 为圆心、内圈空（躲近身）
  cone: '锥形',          // 窄而远，用来抓「正面站着」
  scatter: '散射',       // N 颗投射物
  self: '自身增益'       // 不造成伤害
};

/* ---------------- 世界魂（世界 Boss 专属素材） ----------------
 * 为什么现在只写数据、不接进 CRAFT_MATS：
 *   它的用途是「把传世炼到 +5 以上」，而 +5 以上的强化系统还不存在。
 *   先塞进 CRAFT_MATS 会让背包多出一格永远为 0 的材料，
 *   玩家会以为是自己没刷到。等 M18.8 落强化时再一起接。
 *
 * 键名沿用 `craft_` 前缀：`state.stash.mats` 是自由对象，存档不需要迁移。 */
const WORLD_BOSS_MATERIALS = {
  worldsoul: {
    id: 'worldsoul', name: '世界魂', key: 'craft_worldsoul',
    color: '#e0c8ff', icon: 'soul', glow: true,
    from: '世界 Boss · 必掉',
    desc: '巨兽散于天地间的那口气，凝而不散。传世之器再往上炼，只认这个。'
    /* [M18.8] 已接：`CRAFT_MATS.worldsoul` 就位，六只的 `loot.mats` 各加一条
     * `craft_worldsoul 1~2`，由 `WorldBoss.grantLoot` 发放。
     * **不要**再给它加 `pending` —— 那个字段只表示「数据先行、代码未接」。 */
  }
};

/* ============================================================
 * 六只世界 Boss
 *
 * 选角原则（用户 2026-10-28 定义）：六只都出自《山海经》/《庄子》原文，
 * 且**身体结构互不相同** —— 蛇 / 九颈 / 双形态 / 巨口四足 / 无头人形 / 九尾。
 * 「不同骨架」不是美术口味，是玩法要求：体型决定玩家绕后还是拉远，
 * 骨骼决定技能从哪出来。
 *
 * 共同设计语言（六只都遵守，改一只时要想想另外五只）：
 *   · `resist` 里恰好一个元素 −60（吃 160%），其余 +55~+85（吃 15%~45%）。
 *     −60 是 damageEnemy 的夹取下限，1−(−60)/100 = 1.6 是唯一解。
 *     唯一例外是烛九阴：它**没有元素缺口**，counter 是物理 + 阶段窗口。
 *   · `armorHigh: true` 是六只的共同底色（重甲），但 `armorMul` 一律 1.0 ——
 *     原因见文件头第 2 条，乘上去会变成 16 分钟的血牛。
 *   · `phases` 三段的 `at` 一律 1.00 / 0.66 / 0.33，按**当前血量比例**取，
 *     不按时间取 —— 打得快的队伍不该跳过阶段，打得慢的也不该卡在 P1。
 *   · 每段还有 `enter`：进入这一段时一次性生效的效果（变身 / 招分身 / 攻速）。
 *     为什么不写成技能：技能有冷却和预警，而这些是「阶段本身就是这个状态」。
 *     写成技能会出现「九尾狐 P1 忘了放分身」这种只能靠运气解释的局面。
 *   · `model` 是 M18.6 的新骨架键（`wb_*`）。骨架没做之前
 *     `buildMonster` 会静默回退成人形，所以数据可以先于模型落地。
 * ============================================================ */
const WORLD_BOSSES = {

  /* ------------------------------------------------------------
   * 1. 烛九阴 —— 《大荒北经》「钟山之神，名曰烛阴，视为昼，瞑为夜」
   *
   * 六只里抗性**最低**的一只（+30，其余五只 +40），但也是唯一的
   * 全平坦：连「哪个元素稍微好打」都没有。它的难度不靠抗性，
   * 靠「夜」把视野压到 8 米 —— 你看不见它，它看得见你。
   * 想打得快只有一条：背昼夜时间轴，趁睁眼的那几秒把输出打完。
   * ------------------------------------------------------------ */
  zhulong: {
    id: 'zhulong', wb: true,
    name: '烛九阴', title: '钟山之神 · 视为昼瞑为夜',
    lore: '钟山有神，人面蛇身而赤，身长千里。不食不寝不息，风雨是谒。',
    map: 'nineapex', homeMaps: ['nineapex', 'swordapex', 'starfall'],
    level: 60, scale: 5.4,
    body: { len: 44, height: 12, radius: 5.0, note: '人面蛇身无足，七节脊椎盘三圈，颈三节' },
    hp: 235000, atk: 236, spd: 2.6, atkCd: 2.6,
    color: 0xc0392b, cloth: 0x5a1410, skin: 0xe8b08a,
    model: 'wb_candle', animKind: 'wbCoil',
    melee: true, range: 7.2, family: 'spirit',
    armorHigh: true, armorMul: 1.0,
    /* 与八部天龙去重：全元素同值、weak 恒 null（见文件头第二版说明）。
     * 别再给任何一只写 −60 —— 那是八部的「猜元素」谜题，这里不许有答案。 */
    counter: 'domain',
    weak: null,
    resist: { phys: 30, fire: 30, ice: 30, lightning: 30, poison: 30 },
    domain: {
      id: 'daynight', name: '昼夜领域', radius: 30, kind: 'daynight',
      color: '#ffcf6a',
      desc: '睁眼为昼，闭眼为夜。领域内的光由它的眼决定。',
      player: { sightDay: 26, sightNight: 8 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '睁眼 · 昼', desc: '视野正常，直线龙息 + 尾扫。',
        enter: { sight: 26 },
        skills: ['wb_breath', 'wb_tailsweep'] },
      { at: 0.66, id: 'p2', name: '闭眼 · 夜', desc: '视野压到 8 米，只有它的眼是光源；暗潮可用。',
        enter: { sight: 8 },
        skills: ['wb_darktide', 'wb_tailsweep'] },
      { at: 0.33, id: 'p3', name: '昼夜交替', desc: '每 6 秒切一次，两套技能同时出。',
        enter: { dayNightCycle: 6000, sight: 8 },
        skills: ['wb_breath', 'wb_darktide', 'wb_tailsweep'] }
    ],
    skills: {
      wb_breath: { id: 'wb_breath', name: '龙息', mul: 2.2, shape: 'line', range: 30, width: 3.2,
        elem: 'fire', cd: 7, warn: 1.1, desc: '沿面朝方向喷出的长条火焰，穿透。' },
      wb_darktide: { id: 'wb_darktide', name: '暗潮', mul: 2.8, shape: 'circle', range: 22,
        elem: 'ice', cd: 9, warn: 1.6, nightOnly: true, desc: '以身为心的黑潮，只在夜间可用。' },
      wb_tailsweep: { id: 'wb_tailsweep', name: '尾扫', mul: 1.6, shape: 'fan', range: 16, arc: 160,
        elem: 'phys', cd: 5, warn: 0.7, desc: '七节脊椎甩过来的横扫，近身惩罚。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_meteor', min: 1, max: 3 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['睁眼是昼，闭眼是夜。你只活在一瞬之间。',
      '钟山之上，没有别的光。',
      '……你把灯带来了？']
  },

  /* ------------------------------------------------------------
   * 2. 相柳 —— 《海外北经》「共工之臣曰相柳氏，九首，以食于九山」
   *
   * 九个头各自独立：P1 只有三头主攻，剩下六头在观望；
   * P2 六头齐出，每头一种元素；P3 九头全开 + 场地化毒沼。
   * 「头」是它的资源条 —— 玩家数头就知道自己在第几阶段。
   * ------------------------------------------------------------ */
  xiangliu: {
    id: 'xiangliu', wb: true,
    name: '相柳', title: '共工之臣 · 九首食于九山',
    lore: '相柳氏九首，以食于九山。所抵厥为泽溪，其血腥臭，不可生谷。',
    map: 'yellowferry', homeMaps: ['yellowferry', 'abyssdeep', 'mirrorabyss'],
    level: 60, scale: 4.8,
    body: { len: 32, height: 14, radius: 4.6, note: '九条独立长颈（各四节）+ 五节躯干，贴地滑行无腿' },
    hp: 185000, atk: 224, spd: 2.9, atkCd: 2.2,
    color: 0x2f7f5f, cloth: 0x163a2a, skin: 0x6ab08a,
    model: 'wb_hydra', animKind: 'wbNecks',
    melee: true, range: 6.8, family: 'beast',
    armorHigh: true, armorMul: 1.0,
    counter: 'domain',
    weak: null,
    resist: { phys: 40, fire: 40, ice: 40, lightning: 40, poison: 40 },
    domain: {
      id: 'miasma', name: '毒沼领域', radius: 28, kind: 'poison',
      color: '#7ad06a',
      desc: '所抵为泽溪。领域内地面是活的，踩上去就在烂。',
      player: { dotPct: 0.6, dotInterval: 1 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '三头主攻', desc: '三头出手，六头观望。',
        enter: { heads: 3 },
        skills: ['wb_poisonspit', 'wb_tailwhip'] },
      { at: 0.66, id: 'p2', name: '六头齐出', desc: '六头各带一种元素，正面站不住。',
        enter: { heads: 6 },
        skills: ['wb_poisonspit', 'wb_ninehowl', 'wb_tailwhip'] },
      { at: 0.33, id: 'p3', name: '九头全开', desc: '九头同时出手，场地化为毒沼。',
        enter: { heads: 9, mire: true },
        skills: ['wb_poisonspit', 'wb_ninehowl', 'wb_tailwhip'] }
    ],
    skills: {
      wb_poisonspit: { id: 'wb_poisonspit', name: '毒喷', mul: 1.8, shape: 'fan', range: 12, arc: 70,
        elem: 'poison', cd: 4, warn: 0.6, desc: '三颗头轮流喷，扇形叠毒。' },
      wb_ninehowl: { id: 'wb_ninehowl', name: '九首齐啸', mul: 3.2, shape: 'circle', range: 28,
        elem: 'poison', cd: 14, warn: 3, desc: '全领域伤害，3 秒预警，必须跑出圈。' },
      wb_tailwhip: { id: 'wb_tailwhip', name: '毒尾鞭', mul: 1.4, shape: 'fan', range: 14, arc: 200,
        elem: 'phys', cd: 6, warn: 0.5, desc: '贴地扫尾，近身惩罚。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_scale', min: 2, max: 5 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['九张嘴，说同一句话：滚。', '共工撞倒的山，是我扶起来的。',
      '火……别拿火。']
  },

  /* ------------------------------------------------------------
   * 3. 鲲鹏 —— 《庄子·逍遥游》「北冥有鱼，其名为鲲……化而为鸟，其名为鹏」
   *
   * 唯一**双形态**：两套骨骼共享根节点，P2 变形时翼展 60 米。
   * 打鲲要贴水，打鹏要拉远 —— 阶段一变，站位要求整个反过来。
   *
   * 【与八部去重】八部的「金翅·迦楼罗王」也是会飞的，而且它的招牌是
   * **俯冲**（`charge` + 「飞行阶段只有雷 / 投掷能命中」）。所以这只
   * **不写俯冲**：P2 的核心是「水空分层」—— 飞起来以后近战够不到，
   * 必须换远程或跳斩，是把玩家**往外推**；迦楼罗是**往内撞**。
   * 同一个「会飞」的壳，两套完全相反的空间压力。
   * ------------------------------------------------------------ */
  kunpeng: {
    id: 'kunpeng', wb: true,
    name: '鲲鹏', title: '北冥之鱼 · 化而为鸟',
    lore: '北冥有鱼，其名为鲲。鲲之大，不知其几千里也。化而为鸟，其名为鹏。',
    map: 'cloudbridge', homeMaps: ['cloudbridge', 'mirrorrealm', 'southgate'],
    level: 60, scale: 5.0,
    body: { len: 38, height: 20, wingspan: 60, radius: 5.2, note: '鲲：鱼身双鳍尾鳍 / 鹏：双翼 + 鸟爪，共享根节点' },
    hp: 180000, atk: 214, spd: 3.6, atkCd: 1.9,
    color: 0x3a6a9a, cloth: 0x16304a, skin: 0x8ac0e0,
    model: 'wb_kunpeng', animKind: 'wbMorph',
    melee: true, range: 7.6, family: 'beast',
    armorHigh: true, armorMul: 1.0,
    counter: 'domain',
    weak: null,
    resist: { phys: 40, fire: 40, ice: 40, lightning: 40, poison: 40 },
    domain: {
      id: 'tiderealm', name: '水天领域', radius: 32, kind: 'tide',
      color: '#6ab0e0',
      desc: '北冥之水与九万里之高在同一片领域里。涉水者慢。',
      player: { slow: 20 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '鲲', desc: '潜行突进 + 水炮。贴水，笨重，但一拳很重。',
        enter: { morph: 'kun' },
        skills: ['wb_watercannon', 'wb_dive'] },
      { at: 0.66, id: 'p2', name: '化鹏', desc: '飞空后近战够不到，只能靠远程与跳斩；风刃从上方扫。',
        enter: { morph: 'peng' },
        skills: ['wb_windblade', 'wb_dive'] },
      { at: 0.33, id: 'p3', name: '鲲鹏同体', desc: '半空半水，两套技能轮换。',
        enter: { morph: 'both' },
        skills: ['wb_watercannon', 'wb_windblade', 'wb_dive'] }
    ],
    skills: {
      wb_watercannon: { id: 'wb_watercannon', name: '水炮', mul: 2.0, shape: 'line', range: 26, width: 3.6,
        elem: 'ice', cd: 6, warn: 0.9, desc: '高压水柱，穿透。' },
      wb_windblade: { id: 'wb_windblade', name: '风刃', mul: 2.4, shape: 'fan', range: 18, arc: 120,
        elem: 'phys', cd: 5, warn: 0.6, desc: '翼展扫出的风刃，穿透两层。' },
      wb_dive: { id: 'wb_dive', name: '潜渊', mul: 1.8, shape: 'circle', range: 20, at: 'target',
        elem: 'phys', cd: 8, warn: 1.4, desc: '沉进水里，再从落点砸上来。落点圆形，预警长。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_meteor', min: 1, max: 3 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['九万里，一息可至。', '你站的地方，是我的背。', '……雷从上面来。']
  },

  /* ------------------------------------------------------------
   * 4. 饕餮 —— 《北山经》「羊身人面，其目在腋下，虎齿人爪，其音如婴儿」
   *
   * P1 的吞噬会把玩家往嘴里拽 —— 这是六只里唯一「主动改变玩家站位」
   * 的领域，也是多人玩法的伏笔。抗性和其余五只一样是平的：
   * 它不考「带什么」，考「你敢不敢背对它跑」。
   * ------------------------------------------------------------ */
  taotie: {
    id: 'taotie', wb: true,
    name: '饕餮', title: '钩吾之山 · 食人无厌',
    lore: '钩吾之山有兽焉，其状如羊身人面，其目在腋下，虎齿人爪，其音如婴儿，是食人。',
    map: 'swordtomb', homeMaps: ['swordtomb', 'swordpit', 'jadecapital'],
    level: 60, scale: 5.2,
    body: { len: 30, height: 11, radius: 4.6, note: '四足短身巨口，口可开 120°，两排牙，腋下双目，背六刺' },
    hp: 195000, atk: 232, spd: 3.1, atkCd: 2.4,
    color: 0x6a5a3a, cloth: 0x2a2016, skin: 0xa89070,
    model: 'wb_maw', animKind: 'wbMaw',
    melee: true, range: 6.4, family: 'beast',
    armorHigh: true, armorMul: 1.0,
    counter: 'domain',
    weak: null,
    resist: { phys: 40, fire: 40, ice: 40, lightning: 40, poison: 40 },
    domain: {
      id: 'devour', name: '吞噬领域', radius: 26, kind: 'devour',
      color: '#c07a3a',
      desc: '它的饥饿是一块地。站在里面，脚会自己往前走。',
      player: { pull: 2.2 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '吞噬', desc: '吸气把玩家往嘴里拉，锥形巨口。',
        enter: { pullMul: 1 },
        skills: ['wb_swallow', 'wb_stomp'] },
      { at: 0.66, id: 'p2', name: '反刍', desc: '把吞下的东西吐回来当投射物。',
        enter: { regurgitate: true },
        skills: ['wb_regurgitate', 'wb_stomp'] },
      { at: 0.33, id: 'p3', name: '饥狂', desc: '全场吸力 + 攻速 +50%。',
        enter: { pullMul: 1.5, aspdMul: 1.5 },
        skills: ['wb_swallow', 'wb_regurgitate', 'wb_stomp'] }
    ],
    skills: {
      wb_swallow: { id: 'wb_swallow', name: '吞噬', mul: 3.0, shape: 'cone', range: 20, arc: 90,
        elem: 'phys', cd: 10, warn: 1.5, pull: 6, desc: '锥形巨口，命中后把玩家拽向自己。' },
      wb_regurgitate: { id: 'wb_regurgitate', name: '反刍', mul: 2.6, shape: 'scatter', range: 16, count: 12,
        elem: 'poison', cd: 8, warn: 0.9, desc: '吐回十二颗腐骨，散射。' },
      wb_stomp: { id: 'wb_stomp', name: '震地', mul: 1.8, shape: 'circle', range: 14,
        elem: 'phys', cd: 5, warn: 0.7, desc: '四足同时落地，近身惩罚。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_scale', min: 2, max: 5 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['饿。', '你闻起来像能吃的。', '不够……还不够。']
  },

  /* ------------------------------------------------------------
   * 5. 刑天 —— 《海外西经》「与帝至此争神，帝断其首……以乳为目，以脐为口」
   *
   * 唯一**无头人形**，也是六只里最高（16 米）。双乳是眼（发光）、
   * 脐是口（裂口）、右巨斧左巨盾。P2 盾牌格挡正面，必须绕后 ——
   * 这是六只里唯一「站位决定能不能打出伤害」的设计。
   * ------------------------------------------------------------ */
  xingtian: {
    id: 'xingtian', wb: true,
    name: '刑天', title: '常羊之山 · 以乳为目以脐为口',
    lore: '刑天与帝至此争神，帝断其首，葬之常羊之山。乃以乳为目，以脐为口，操干戚以舞。',
    map: 'southgate', homeMaps: ['southgate', 'swordapex', 'jadecapital'],
    level: 60, scale: 5.6,
    body: { len: 10, height: 16, radius: 3.0, note: '无头巨人，双乳为目（发光）、脐为口（裂口），右巨斧左巨盾' },
    hp: 190000, atk: 242, spd: 3.4, atkCd: 2.0,
    color: 0x8a6a4a, cloth: 0x3a2418, skin: 0xc0a078,
    model: 'wb_headless', animKind: 'wbHeadless',
    melee: true, range: 7.0, family: 'humanoid',
    armorHigh: true, armorMul: 1.0,
    counter: 'domain',
    weak: null,
    resist: { phys: 40, fire: 40, ice: 40, lightning: 40, poison: 40 },
    domain: {
      id: 'warcry', name: '战意领域', radius: 30, kind: 'warcry',
      color: '#e05a3a',
      desc: '死了还在打。这股气把周围所有人的手都压慢了。',
      player: { aspd: -15 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '斧', desc: '大开大合，慢而痛。1.2 秒抬手。',
        enter: { stance: 'axe' },
        skills: ['wb_axecleave'] },
      { at: 0.66, id: 'p2', name: '盾', desc: '格挡正面，必须绕后。',
        enter: { stance: 'shield', blockFront: true },
        skills: ['wb_axecleave', 'wb_shieldbash'] },
      /* 第三段**不给硬直窗口**。原来写的是 `staggerEvery: 8000 / staggerDur: 3000`
       * —— 那是八部天龙的「破绽」语言（找窗口站桩输出），与世界 Boss 的去重要求冲突。
       * 改成「弃守全攻」：攻速翻倍、伤害 +30%、但不再格挡正面。
       * 玩家的答案是**拉开距离 / 绕背走位**，不是「等它硬直」。
       * `check-worldboss.js` 第十一节会拦住任何带 stagger 字样的 enter 键。 */
      { at: 0.33, id: 'p3', name: '舞干戚', desc: '斧盾同用、攻速 ×2、伤害 +30%，但不再格挡 —— 这一阶段只能拉开打。',
        enter: { stance: 'both', aspdMul: 2, dmgMul: 1.3 },
        skills: ['wb_axecleave', 'wb_shieldbash', 'wb_warcry'] }
    ],
    skills: {
      wb_axecleave: { id: 'wb_axecleave', name: '斧劈', mul: 2.8, shape: 'fan', range: 10, arc: 100,
        elem: 'phys', cd: 6, warn: 1.2, desc: '举斧过顶再落下，抬手 1.2 秒，正面极痛。' },
      wb_shieldbash: { id: 'wb_shieldbash', name: '盾撞', mul: 2.2, shape: 'line', range: 14, width: 3.0,
        elem: 'phys', cd: 8, warn: 0.9, desc: '顶盾冲撞，沿直线推进 14 米。' },
      wb_warcry: { id: 'wb_warcry', name: '战吼', mul: 0, shape: 'self', range: 30,
        elem: 'phys', cd: 16, warn: 0.8, desc: '攻击速度 +50%，持续 8 秒。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_meteor', min: 1, max: 3 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['头没了，眼睛还在。', '再来。', '……再来。']
  },

  /* ------------------------------------------------------------
   * 6. 九尾狐 —— 《南山经》「青丘之山……有兽焉，其状如狐而九尾，其音如婴儿，能食人」
   *
   * 唯一**幻术**：P1 三个分身（1 真 2 假，假的一击碎）、
   * P3 真身现身时受伤 ×2。玩家要做的不是输出，是**认出哪只是它**。
   * 领域「幻域」让小地图变暗 —— 但五角星仍然显示（否则是迷路不是紧张）。
   * ------------------------------------------------------------ */
  jiuweihu: {
    id: 'jiuweihu', wb: true,
    name: '九尾狐', title: '青丘之山 · 九尾能食人',
    lore: '青丘之山有兽焉，其状如狐而九尾，其音如婴儿，能食人，食者不蛊。',
    map: 'mirrorrealm', homeMaps: ['mirrorrealm', 'starfall', 'mirrorabyss'],
    level: 60, scale: 4.6,
    body: { len: 26, height: 8, tails: 34, radius: 3.4, note: '四足狐身 + 九条独立尾（各五节），狐首双耳' },
    hp: 175000, atk: 218, spd: 3.8, atkCd: 1.7,
    color: 0xd88a5a, cloth: 0x5a2a18, skin: 0xf0d0a8,
    model: 'wb_ninetail', animKind: 'wbTails',
    melee: true, range: 6.0, family: 'spirit',
    armorHigh: true, armorMul: 1.0,
    counter: 'domain',
    weak: null,
    resist: { phys: 40, fire: 40, ice: 40, lightning: 40, poison: 40 },
    domain: {
      id: 'illusion', name: '幻域', radius: 28, kind: 'illusion',
      color: '#c08ae0',
      desc: '青丘的雾。地图会骗你，但天上的星不会。',
      player: { minimapDim: 0.35 }
    },
    phases: [
      { at: 1.00, id: 'p1', name: '幻影', desc: '三个分身，一真二假，假的一击碎。',
        enter: { clones: 2 },
        skills: ['wb_foxfire', 'wb_phantomdash'] },
      { at: 0.66, id: 'p2', name: '九尾缚', desc: '尾巴横扫 + 缠绕定身。',
        enter: { tails: 9, rootOnHit: 2.5 },
        skills: ['wb_tailbind', 'wb_foxfire'] },
      { at: 0.33, id: 'p3', name: '狐火焚天', desc: '全场狐火，真身现身时受伤 ×2。',
        enter: { foxfireField: true, revealVuln: 2.0 },
        skills: ['wb_foxfire', 'wb_tailbind', 'wb_phantomdash'] }
    ],
    skills: {
      wb_foxfire: { id: 'wb_foxfire', name: '狐火', mul: 2.4, shape: 'circle', range: 16, at: 'target',
        elem: 'fire', cd: 7, warn: 1.0, desc: '青白色的火，落点圆形，会留 3 秒余烬。' },
      wb_tailbind: { id: 'wb_tailbind', name: '尾缚', mul: 1.6, shape: 'ring', range: 20,
        elem: 'phys', cd: 9, warn: 1.3, root: 2.5, desc: '九尾环扫，命中定身 2.5 秒。伤害不高，但定住就完了。' },
      wb_phantomdash: { id: 'wb_phantomdash', name: '幻影突袭', mul: 2.0, shape: 'line', range: 18, width: 2.6,
        elem: 'ice', cd: 6, warn: 0.5, desc: '分身与本尊同时突进，只有本尊那条有伤害。' }
    },
    loot: {
      uniqueMin: 1, uniqueMax: 3,
      mats: [
        { key: 'xuanjing', min: 80, max: 160 },
        { key: 'craft_soul', min: 2, max: 4 },
        { key: 'craft_scale', min: 2, max: 5 },
        { key: 'craft_worldsoul', min: 1, max: 2 }
      ],
      rune: { min: 2, max: 4 }
    },
    lines: ['你看见的，是我让你看见的。', '九条尾巴，只有一条是真的。', '……冷。别用冰。']
  }
};

/* 固定顺序：刷新随机、图鉴排序、检查脚本遍历都用它。
 * 不要用 Object.keys —— 顺序在压缩/改写后不保证，图鉴会乱。 */
const WORLD_BOSS_ORDER = ['zhulong', 'xiangliu', 'kunpeng', 'taotie', 'xingtian', 'jiuweihu'];

/* ============================================================
 * 派生函数（纯函数，M18.2 / M18.7 / M18.9 共用）
 * ============================================================ */

/* 按 id 取。找不到返回 null，调用方自己判 —— 不要返回默认 boss，
 * 那会让「存档里的 id 拼错了」变成「每次刷新都是烛九阴」。 */
function worldBossById(id) {
  return WORLD_BOSSES[id] || null;
}

/* 当前血量比例 → 阶段下标（0/1/2）。
 * `phases[i].at` 是**该阶段开始的血量比例**，降序排列。
 * 取「最后一个 at >= pct 的下标」：pct=1.0 → 0；0.66 → 1；0.33 → 2。
 * 用 >= 而不是 >：正好打掉 34% 落在 0.66 上时应该已经进 P2。 */
function worldBossPhaseAt(cfg, pct) {
  const ph = (cfg && cfg.phases) || [];
  if (!ph.length) return 0;
  const p = Math.max(0, Math.min(1, pct));
  let idx = 0;
  for (let i = 0; i < ph.length; i++) if (p <= ph[i].at) idx = i;
  return idx;
}

/* 该 boss 的全部技能（三阶段合并、去重）。
 * M18.7 的施法层按「当前阶段可用」过滤，不按 id 过滤。 */
function worldBossSkillsOf(cfg) {
  const out = [];
  const seen = {};
  for (const ph of (cfg && cfg.phases) || []) {
    for (const id of (ph.skills || [])) {
      if (seen[id]) continue;
      seen[id] = 1;
      const sk = cfg.skills && cfg.skills[id];
      if (sk) out.push(sk);
    }
  }
  return out;
}

/* 某阶段可用的技能对象数组 */
function worldBossSkillsAt(cfg, phaseIdx) {
  const ph = ((cfg && cfg.phases) || [])[phaseIdx];
  if (!ph) return [];
  return (ph.skills || []).map(id => cfg.skills[id]).filter(Boolean);
}

/* 领域对象（没有就 null）。M18.4 / M18.5 都从这里读半径与颜色。 */
function worldBossDomain(cfg) {
  return (cfg && cfg.domain) || null;
}

/* 必掉传世件数：按难度抬下限，上限同步抬，绝不返回 0。
 * 为什么难度是抬下限而不是乘概率：这是全作唯一的稳定传世入口，
 * 「刷一次空手」是这个系统最不能有的结果（计划书 §18.4）。 */
function worldBossUniqueCount(cfg, diffKey) {
  const c = cfg || {};
  const lo = Math.max(1, c.loot ? c.loot.uniqueMin : WORLD_BOSS_CFG.uniqueMin);
  const hi = Math.max(lo, c.loot ? c.loot.uniqueMax : WORLD_BOSS_CFG.uniqueMax);
  const bonus = (WORLD_BOSS_CFG.diffBonus[diffKey] || 0);
  const min = lo + bonus;
  const max = hi + bonus;
  return { min: min, max: max };
}

/* 该 boss 的「元素缺口」。**本表里永远是 null** —— 这是 2026-10-28 与
 * 八部天龙去重后的结果，不是漏写。函数保留的原因：图鉴（M18.9）要统一
 * 显示「无元素偏好」这一行，而显示逻辑不该自己判 `resist` 里有没有负数。
 *
 * 想给某只加回 −60 之前先想清楚：八部的 8 只魔将每人一个缺口，
 * 玩家已经学过「找洞」这一课。世界 Boss 再教一遍同一个谜题，
 * 两套系统就会互相稀释成「又是换武器」。答案在领域里。 */
function worldBossWeakOf(cfg) {
  const r = (cfg && cfg.resist) || {};
  for (const k of WB_ELEMS) if ((r[k] || 0) < 0) return k;
  return null;
}

/* 这只 Boss 的「答案」在哪：固定返回 'domain'。
 * 存在的意义是**给未来的自己一个断言点** —— check-worldboss 第十节
 * 拿它和 BOSSES 里八部魔将的 `stagger` / `patterns` 钉成互斥，
 * 谁想把八部那套搬过来，会先在这里失败。 */
function worldBossCounterOf(cfg) {
  return (cfg && cfg.counter) || null;
}
