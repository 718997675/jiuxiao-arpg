# 世界 Boss 系统 · 任务台账（M18）

- 分支：`feat/act-expansion`（与本线其它改动一起合入 main）
- 设计文档：`V2-ROADMAP.md` §18（六只设计表 / 刷新机制 / 骨架规范 / **§18.7 与八部天龙去重**）
- 更新：2026-10-28 17:10

> 当前：M18.1 ~ M18.7（含 M18.6 六套骨架、M18.7b 两个骨架键）完成并全绿，下一步 M18.8 掉落

## 一句话现状

6 只山海经巨兽，**30 分钟真实时间轮转**（无人打则到点消失、立刻换下一只；
被击杀则冷却一个周期），小地图四层组合星标（领域色 / 信标环 / 双层五角星 / 发光）
+ 场景领域光环 + 屏幕横幅 + 山海志常驻卡，**六种玩家侧领域压制**，
**三阶段战斗 + 18 个招牌技能 + 六套专属程序化骨架**，
必掉 1~3 件传世（M18.8 待接）。
数据层 / 运行时 / 通知面板 / 小地图与光环 / 领域机制 / 多阶段战斗 / 六套骨架已落地；
**只剩掉落与说明页**。

**与八部天龙（M7）已强制去重**：八部 = 一个 −60 洞 + 四条 +80 墙（猜元素，8 倍差）；
世界 Boss = 五项抗性同值（零缺口）、答案在领域与阶段里。见 §18.7 与本文「决策记录」。

## 节点表

| 编号 | 名称 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| M18.1 | 数据层：`WORLD_BOSSES` 6 条 + `WORLD_BOSS_CFG` + 掉落表 + 派生函数 | ✅ | 新建 `src/data/data-worldboss.js`、`dev/check-worldboss.js`；改 `index.html` | `0e5da4e` 之后的 wip |
| M18.2 | 运行时：`WorldBoss` 刷新状态机 + `state.worldBoss` 存档字段 | ✅ | 新建 `src/worldboss.js`、`dev/worldboss-run.js`、`dev/worldboss-live.js`；改 `src/core/save.js`、`src/game.js`、`index.html` | 本次提交 |
| M18.3 | 通知与面板：屏幕横幅 + 山海志常驻卡 + 追踪行 + 「前往」 | ✅ | `src/ui.js`（`showWorldBossBanner` / `renderWorldBoss` / `worldBossCard` / `gotoWorldBoss`）、`index.html`（`#wbBanner` / `#wbTrack`） | 本次提交 |
| M18.4 | 小地图组合星标 + 领域光环 | ✅ | `src/ui-minimap.js`（`drawWorldBoss` / `_starPath` / `_lift`）、`src/worldboss.js`（`makeAura` / `dropAura` / `anim`） | 本次提交 |
| M18.5 | 领域机制：6 种玩家侧效果 | ✅ | `src/worldboss.js`（`domainTick` / `domainState` / `_domainClear` / `_applySight` / `_restoreSight` / `dim` / `domainBuff`）、`src/game.js`、`src/ui.js`、`src/ui-minimap.js` | `dev/worldboss-live.js` G 段 20 项（六种效果 + 出圈归位） |
| M18.6 | 六套全新骨架 + 专属动画 | ✅ | 新建 `src/wbmodels.js`（约 900 行）、`dev/check-wbmodels.js`、`dev/wbmodels-shot.js`；改 `src/actors.js`（分派 + `noAutoScale`）、`src/game.js`（`body.radius` 夹碰撞）、`src/data/data-worldboss.js`（六只补 `radius`）、`index.html` | 本次提交 |
| M18.7a | 多阶段战斗：3 阶段切换 + 18 招牌技能（7 种 shape）+ `enter` 14 键落地 + 定身 / 格挡 / 场地 | ✅ | 新建 `src/worldboss-fight.js`、`dev/worldboss-fight.js`、`dev/worldboss-battle-live.js`；改 `src/game.js`、`src/worldboss.js`、`src/data/data-worldboss.js`、`index.html` | `611c45f` |
| M18.7b | 骨架相关 `enter`：`tails`（九尾展开）/ `revealVuln`（真身现身受伤 ×2） | ✅ | `src/wbmodels.js`（`setTails` / `setGhost`）、`src/worldboss-fight.js`（`_revealTick` / `_setRevealState`）、`src/game.js`（`wbVulnMul`） | 本次提交 |
| M18.8 | 掉落：必掉 1~3 传世 + 稀有材料 + 世界魂接入 | ⬜ | `src/game.js`、`src/items.js`、`src/data/data-craft.js` | — |
| M18.9 | 说明页 / 图鉴 / README 同步 | ⬜ | `src/ui.js`、`README.md` | — |

## M18.1 已交付明细

1. `src/data/data-worldboss.js`
   - `WORLD_BOSS_CFG`：`cycle` 30 分钟 / `minLevel` 40 / `sameTime` 1 / `level` 60 / `ilvl` 62 /
     `respawnGap` 0 / `bannerT` 3.2 / `domainFade` 1.5 / `uniqueMin-Max` 1-3 / `diffBonus`
   - `WORLD_BOSSES` 6 条：`zhulong` `xiangliu` `kunpeng` `taotie` `xingtian` `jiuweihu`
   - `WORLD_BOSS_ORDER` 固定顺序（刷新随机、图鉴排序、检查脚本遍历都用它，别用 `Object.keys`）
   - `WORLD_BOSS_MATERIALS.worldsoul`（世界魂，`pending: 'M18.8'`，**故意没进 `CRAFT_MATS`**）
   - 派生纯函数：`worldBossById` / `worldBossPhaseAt` / `worldBossSkillsOf` /
     `worldBossSkillsAt` / `worldBossDomain` / `worldBossUniqueCount` / `worldBossWeakOf` /
     `worldBossCounterOf`
2. `dev/check-worldboss.js`：11 节 **1152 项**

## M18.2 已交付明细（运行时）

1. **`src/worldboss.js`（新建）**，全局 `WorldBoss`，五段职责：
   - **一、存档记录**：`rec()` 只读不修补；`_valid()` 把「id 不存在 / 图被删 / 坐标 NaN /
     时间戳非数」一律判成「没有记录」
   - **二、状态推进**：`ensure()` 是唯一出口 —— 缺记录 / 到点 / 冷却结束都归它，
     返回「此刻该有哪一只」；`rollNext()` 三条规则（不取上一只 / 优先已解锁的 `homeMaps` /
     落点走 `bossPosOf`）
   - **三、实体同步**：`sync()` 幂等（该有就刷、不该有就清）、`spawn()` 走 `Game.spawnEnemy`、
     `despawn()` 只清 `e.wb`
   - **四、领域光环**：`makeAura` / `dropAura` / `anim(dt)`
   - **五、心跳**：`tick(dt)` 1 秒节流，只做「到点换人 + 刷文字」；`onMapEnter()` 进图对齐
   - **六、纯查询**：`remaining` / `timeText` / `cur` / `alive` / `statusText`
2. **`src/core/save.js`**
   - `_worldBossRec()` 整形器：id / mapId 必须是非空字符串，坐标与时间戳必须有限，
     **时间戳必须落在 2001~2100 年之间**（秒级时间戳会被拦掉），`until ≥ spawnAt`
   - `normalizeDoc` 的 `world` 段补 `w.worldBoss`（老档补 `null`，不写迁移函数）
   - `pack` / `unpack` 带上 `world.worldBoss`
3. **`src/game.js`** 四处
   - `spawnEnemy`：`const cfg = bossId ? (BOSSES[bossId] || WORLD_BOSSES[bossId]) : MONSTERS[kind]`
   - `spawnEnemy` 的 `e` 字面量补 `armorMul: cfg.armorMul || 1`
   - `update()` 里 `Dungeon.update` 之后加 `WorldBoss.tick(dt)` 与 `WorldBoss.anim(dt)`
   - `onKill` 的 `if (e.boss)` 分支里**最先**分流 `if (e.wb) WorldBoss.onKill(e)` ——
     否则会走进 `BOSSES[bid].level` / `BOSS_POS[bid]`，直接抛异常
   - `loadMap` 末尾 `WorldBoss.onMapEnter()`
4. **`index.html`**：`<script src="src/worldboss.js">`（`dungeon.js` 之后、`game.js` 之前）

## M18.3 已交付明细（通知与面板）

- `#wbBanner`：屏幕上方 26% 横贯一条，3.2 秒，底色 = `domain.color`；
  重播走「摘 show → 强制回流 → 挂 show」
- `#wbTrack`：`#topright` 里独立一块（**不塞进 `#questTrack`**：任务三行是「你接了的事」，
  世界 Boss 是「世界正在发生的事」）；每秒只改倒计时文本，**不重建 DOM**
  （重建会让「点一下前往」在手指按下与抬起之间失效）
- 山海志 `#questList` 顶部常驻卡（`UI.worldBossCard()`），倒计时与追踪行同一份
- 「前往」= `Game.travelTo(rec.mapId)`，门禁全交给 `travelTo`（没抵达 / 境界不足 / 印门）

## M18.4 已交付明细（小地图星标 + 领域光环）

**星标是四层组合标记，不是「金色五角星」一个形状。** 用户三次强调
「小地图标记不能和其他 Boss 相同，要特殊、要带颜色」，所以设计目标是
**任何单层都不与已有标记撞**（红点首领 / 橙点精英 / 黄点 NPC / 蓝钻路标石 / 绿三角章出口）：

| 层 | 画法 | 说什么 |
|---|---|---|
| ① 领域虚线圆 | `domain.radius × scale`，1.6px 虚线，alpha .5 | 「范围」——与场景那圈地面光环同半径 |
| ② 信标环 + 公转刻度 | 实线细环 22.5px（alpha .32）+ 4 个刻度反向公转 0.7 rad/s | 「这是信标，不是一只怪」 |
| ③ 双层五角星 | 外径 17.5 / 内径 7.7；墨色底 → 领域色填充（`_lift` 往白混 18%）→ 2px 墨色描边 | 「这是谁」——六只各一色 |
| ④ 外发光 + 呼吸 | `shadowBlur 14`；`1 ± 0.12 × sin(t·2.4)` | 在满屏 zone 框里跳出来 |

- 颜色 = `domain.color`，与横幅 / 追踪行 / 山海志卡同一色
- **实体本身不画红点**：`Minimap.draw` 敌人循环加 `if (e.wb) continue` ——
  Boss 追人时会离开领域中心，不跳过的话星标旁边会多一颗红点
- **星标画在敌人 / 掉落之后**：它是全图唯一事件级目标，被一只路过的小怪盖住就白做了
- 位置读 `WorldBoss.rec()` 而不是 `Game.enemies` 里那只（实体被击退后会移动，
  星标要标的是**领域中心**）
- **跨图不画边缘箭头**：每张图坐标系各自独立（size 140~300），跨图算出来的方向是假的；
  「它在哪张图」交给追踪行
- 尺寸：canvas 336 内部，CSS 显示 168（触屏 98 / 82）。星标外廓实测 64×64 canvas px
  ≈ 32 CSS px，是首领红点（12 canvas px ≈ 6 CSS px）的 5 倍多；缩到 82px 面板仍有 15 CSS px
- `WorldBoss.makeAura()`：三层（边界环 / 符文环 / 地面染色），
  **挂在 `Game.scene` 上而不是 `boss.group` 下** —— boss 的 `group.scale` 是 4.6~5.6，
  挂进去 30 米的领域会变成 160 米
- 淡入 1.5 秒 + 内环反向慢转（0.12 rad/s，一圈 52 秒），由 `anim(dt)` 每帧驱动

## 验收都查了什么

### `node dev/check-worldboss.js`（1152 项，数据层）

| 节 | 查什么 |
|---|---|
| 一 | 6 只 / ORDER 覆盖 / `cycle` 30 分钟 |
| 二 | `spawnEnemy` 要读的 10 个字段齐全 + `model` 用 `wb_` 前缀 |
| 二·b/c | 有效血量 = 混沌真身的 3.0~4.2 倍；六只硬度差 ≤ 1.35 倍 |
| 三 | 6 个 `model` / 6 个 `animKind` 互不相同 |
| 四 | **五项抗性完全同值、零缺口、`weak` 恒 null、`counter = 'domain'`** |
| 五 | 6 种领域互不相同；半径 24~34；半径 ≥ 最大技能范围一半 |
| 六 | 3 阶段 `at` = 1.00/0.66/0.33；技能引用都存在；P3 ⊇ P1 |
| 六·b | `enter` 17 键词表；每只至少一个「改规则」的效果 |
| 七 | 18 个技能；倍率/范围逐条比对文档；`warn ≥ 0.5` |
| 八 | `homeMaps` 2~3 张，非安全区 / 非副本 / 非竞技场，已开放 |
| 九 | 材料键在 `stash.mats` 命名空间；必掉件数永不 < 1 |
| **十一** | **与八部天龙互斥**：无负数抗性、无 `stagger`、无 `patterns`、有 `domain`、有 3 阶段、骨架键不撞、招式文案不借用「俯冲 / 破绽 / 后摇」；反过来八部不许有 `domain` / `phases` |

### `node dev/worldboss-run.js`（76 项，运行时，时间打桩）

`Date.now()` 换成可控时钟，把 6 小时压成毫秒：
到点换人（30:00 还是同一只 / 30:01 换了一只）、连滚 60 次不连续重复、击杀冷却、
跨会话（JSON 往返后 `until` 不变）、存档往返（`pack → normalizeDoc → unpack`）、
等级门禁（39 不刷 / 40 立刻刷 / 掉到 39 清记录）、5 种脏档兜底、秒级时间戳拦截。

### `node dev/worldboss-live.js [--shot]`（浏览器）

横幅 / 追踪行 / 山海志卡三处有字且颜色取自领域色、实体落点 = 记录坐标、
`armorHigh` 与 `armorMul` 真的进了实体、光环挂在 scene 上且三层、
**真浏览器里时间快进 31 分钟会换人**、
真实伤害路径打死之后 `killed` 生效且光环撤掉、零 pageerror。

G 段（领域机制，20 项）逐个量六种效果与出圈归位，见上文「M18.5 已交付明细」。

C 段（小地图星标）用「画 / 不画」两张图的差异把星标**单独抠出来**再量：

| 断言 | 实测 |
|---|---|
| 星标落笔像素 > 400 | 1700~2100 px |
| 星标外廓 ≥ 40×40（必须远大于首领红点 12×12） | 48~65 px |
| 宽高差 ≤ 8（是五角星不是被裁的块） | 1 px |
| 领域色像素 > 100 | 140~373 px |
| 领域虚线圆存在 | 300~460 px |
| **反证：把实体挪开 9 米、摘掉 `wb` 标记，才会多出一颗 r=6 红点** | 118 px / 13×13 |

两条测量纪律（踩过坑）：

1. **必须冻结 `performance.now`**。星标有呼吸缩放 + 刻度公转，两次绘制之间只要时间
   往前走一点，边缘像素就整体错位 —— 第一版没冻结，量出来的「红点差异」有 4940 px，
   全是星标自己抖出来的。
2. **必须按半径切开「星标本体」与「领域圈」**。混在一起量会把领域圈直径（106px）
   当成星标尺寸。以差异像素的质心为圆心，34px 内算星标本体、以外算领域圈。
3. **反证必须把实体挪开**。实体正好在领域中心时，红点被不透明的星标完全盖住，
   差异恒为 0，测不出「跳过 wb」这道闸到底在不在。

## M18.5 已交付明细（领域机制）

`WorldBoss` 新增 7 个方法（`src/worldboss.js` 第六节，全文 200 行注释在代码里）：

| 方法 | 职责 |
|---|---|
| `domainState()` | 判定「此刻玩家在不在领域里」，返回 `{ r, cfg, dom, dist, inside }` |
| `domainTick(dt)` | 每帧结算。`Game.update` 里在 `WorldBoss.anim` 之后、`hp<=0 → die()` 之前 |
| `_domainClear()` | 归位。离开 / 死亡 / 换图 / 讨伐 / 实体被清 全走这里，**幂等** |
| `_applySight(sight)` | 压视野：雾距 + 雾色 + 天空 + 环境光 |
| `_restoreSight()` | 把上面四项写回进圈前的值 |
| `dim()` | 小地图压暗系数，给 `Minimap.draw` 读 |
| `domainBuff()` | buff 条那一条（`noTimer: true`，显示「常驻」而不是秒数） |

六种效果与生效点：

| 领域 | 数据 | 落点 |
|---|---|---|
| 昼夜（烛九阴） | `sightDay: 26, sightNight: 8` | `_applySight`；阶段 `enter.sight` 覆盖，所以打到 P2 自动入夜 |
| 毒沼（相柳） | `dotPct: 0.6, dotInterval: 1` | `damagePlayer(dmg, null, { pierce: true })` |
| 水天（鲲鹏） | `slow: 20` | `Game.domSlow` → `update()` 的移动乘区（与 `playerSlow` 相加后夹 85%） |
| 吞噬（饕餮） | `pull: 2.2` | 直接改 `playerGroup.position` + `collideWorld`；1.2 米内停手 |
| 战意（刑天） | `aspd: -15` | `Game.domAspd` → `doBasicAttack` 的 `aspdK`（下限 0.4 倍） |
| 幻域（九尾狐） | `minimapDim: 0.35` | `Minimap.draw` 在敌人/掉落之后、星标之前铺一层暗色 |

配套改动：

- `Game.damagePlayer(amount, source, opts)` 新增 `opts.pierce`：无视护甲 / 格挡 / 抗性 /
  难度 / 被动减伤，只保留护盾吸收与免死（还魂 / 替身 / 涅槃）。
  **理由**：「每秒 0.6% 最大生命」是对玩家的一句承诺；走常规结算的话满装只剩 0.19%，
  堆防御就等于免疫领域，机制等于不存在。常规伤害该吃护甲，环境伤害不该。
- `Game.update` 的移动乘区改成 `1 - min(0.85, playerSlow + domSlow)`。
- `Game.loadMap` 重置玩家状态时一并清 `domSlow / domAspd`（「进图 = 干净状态」口径）。
- `Game.statusBuffs()` 追加领域那一条；`UI.renderBuffs` 支持 `noTimer`（显示「常驻」）。
- `WorldBoss.onMapEnter` / `despawn` / `onKill` 都主动归位一次。

**验收**：`dev/worldboss-live.js` G 段 20 项，逐个量：

```
视野 昼 26m → 夜 8m → 出圈还原 196m（原 196m）；雾色亮度 544 → 154 → 544
毒沼 1 秒掉 18.77 血（应 18.77），buff 条：毒沼领域 / 毒毒沼领域常驻
水天减速 20% · 吞噬每秒拉近 2.2m · 战意攻速 -15%（cd 0.685s vs 0.582s）
幻域压暗 0.35，压暗后星标仍有 2071 px
```

## M18.7a 已交付明细（多阶段战斗）

**新文件 `src/worldboss-fight.js`（全局 `WBFight`，约 560 行）**，只做三件事：
阶段 / 出手 / 场地。**不塞进 `worldboss.js`** —— 那个文件是刷新·存档·通知·领域，
一处都不需要 THREE 几何与 FX；混在一起会让「状态机」和「满屏特效」互相打岔。

| 段 | 职责 | 关键决定 |
|---|---|---|
| 一、`tick(dt)` | 场地效果（毒沼 / 狐火）持续区域伤害 | 走 `damagePlayer(..., {pierce:true})`，与领域 DoT 同口径 |
| 二、`phaseOf` / `_enterPhase` / `_applyEnter` / `_resetCombat` / `_syncAtkCd` | 三阶段切换 + `enter` 分派 | 进阶段先把「随阶段变」的字段**打回基线**再重算，否则 P3 会带着 P2 的盾 |
| 三、`ai(e, dt, pp)` | 每技能独立 cd + 距离门槛 + 夜间限定，挑一个能打的 | 共用一个大会导致「cd 短的永远抢不到出手」 |
| 四、`cast(e, sk, pp)` | 7 种 shape：`line / circle / fan / cone / scatter / ring / self` | 全部走 `FX.telegraph` 预警，**不新写判定框架** |
| 五、`clear()` | 换图 / 击杀 / 到点换人 全走它 | 场地是 `life: 999` 铺的，FX 不会自己回收，必须手动摘 |

三条判定口径（改之前先读 `src/worldboss-fight.js` 文件头）：

1. **预警画在哪，判定就按哪。** 几何在**施放瞬间**锁死，结算时只拿玩家的**当时**位置去测。
   如果结算时还追着玩家重算几何，预警就变成装饰了。
2. **所有判定留 0.7 米宽容**（玩家碰撞半径 0.55）。
3. **伤害 = `e.dmg × sk.mul`**，`e.dmg` 里已经含阶段加成，这里不再乘一次。

`enter` 16 个键的落地情况：

| 键 | 落点 |
|---|---|
| `sight` | `worldboss.js` 的 `domainTick`（M18.5 已接） |
| `dayNightCycle` | `ai()` 每 N 毫秒翻 `e.wbNight`；`nightOf()` 是唯一读口 |
| `heads` | 技能齐射轮数 `volley()`（3 头 = 1 轮 / 9 头 = 3 轮） |
| `mire` / `foxfireField` | `_addHazard` 铺一次，`e.wbSpawned` 记账防叠层 |
| `morph` | `WBModels.setMorph`（M18.6 接上真模型）+ `spd` ×0.8/1.5 与 `reach` 代偿 |
| `pullMul` | `worldboss.js` 的吸力（M18.5 已接） |
| `aspdMul` / `dmgMul` / `stance` | `_syncAtkCd` 与 `e.dmg`，`_resetCombat` 每阶段重算 |
| `blockFront` | `Game.damageEnemy` 读 `e.wbBlockFront`：正面 ±75° 内伤害 ×0.4 |
| `clones` | `Game.spawnEnemy(..., e.wbId)` 生分身，逐项拆掉 `boss/wb/active` |
| `rootOnHit` | 普攻命中写 `Game.rootT`（连普攻都定身） |
| `regurgitate` | **不需要落字段**：P2 的主题就是技能表多了 `wb_regurgitate` |
| `tails` | `WBModels.setTails(actor, 1)`：九条尾绕 Y 反向展开 0.55 rad + 抬 0.16 rad（M18.7b） |
| `revealVuln` | `_revealTick` 每 9 秒翻一次「现身 5 秒」；`e.wbVulnMul` 0.6 ↔ 2.0，`WBModels.setGhost` 同步半透明（M18.7b） |

配套改动：

- `Game.updateBossAI`：`e.wb` 分流到 `WBFight.ai`，**不再走** `bossPattern()` 的 patterns 池
  （那是八部天龙八只共用的语言）；「狂怒」那套 0.6/0.3 的阶段也跳过（世界 Boss 有自己
  的三阶段与阶段名）。
- `Game.update`：`WBFight.tick(dt)` 在 `WorldBoss.domainTick` 之后、`hp<=0 → die()` 之前。
- `Game.loadMap` / `WorldBoss.despawn` / `WorldBoss.onKill`：三处都调 `WBFight.clear()`。
- `Game.rootT`：定身。移动速度直接归零（**不复用 `slow`**，那个封顶 0.85 还能走 15%），
  冲刺一并作废，`die()` / `loadMap` 归零，buff 条单列一条「定身」。
- `Game.damageEnemy`：`e.wbBlockFront` 正面折减（见下「决策记录」）。
- `worldboss.js` 的视野：`dayNightCycle` 时白天回到 `sightDay`，**读 `WBFight.nightOf(e)`**，
  不另起计时器。

### 验收（三层，全绿）

| 脚本 | 项数 | 查什么 |
|---|---|---|
| `node dev/check-wbmodels.js` | **182** | 真 three（r128 UMD）在 vm 里跑：六套骨架建得出来 / `group.scale===1` / 尺寸贴 `body.len·height·wingspan` / 脚不陷地 / **剪影两两点距 > 0.10** / 面数 < 9000 / 材质全注册 / 120 帧动画不抛异常 / 鲲鹏三档 morph / `setTails` 展开后包围盒变宽 + 摆动不被覆盖 / `setGhost` 全材质一起变且能完整还原 |
| `node dev/worldboss-fight.js` | **252** | 离线（vm + THREE/FX/Game/WBModels 桩）：9 个血量点 × 6 只的阶段边界、cd / 夜间限定 / 距离门槛、7 种 shape 的命中与**不**命中、场地节拍与 `pierce`、定身两个来源、`enter` 每个键的消费点（**pending 已清零**）、`tails`/`revealVuln` 的调用与倍率、接线断言 |
| `node dev/worldboss-battle-live.js` | 浏览器 8 段 | 刑天三阶段真的按 1.00/0.66/0.33 切且播报阶段名、预警真的结算掉血、**正面 37.5 / 背后 93.75（2.5 倍）**、战吼 1s→0.667s→8 秒后回 1s、九尾狐 2 个分身（血 6% / 不带 boss·wb 标记 / 出生就追人）+ 尾缚定身 2.5 秒 + **P2 九尾展开 tailFlare=1**、相柳毒沼 2.6 秒掉 1754 血 + 出圈停手 + 换图清场、**P3 真身现身：藏 112.5 → 现身 375 伤害（×3.33），透明度 0.42 ↔ 1** |
| `node dev/worldboss-live.js` | 浏览器 | M18.2~M18.5 的老回归，本次改动后复跑仍全绿 |
| `node dev/wbmodels-shot.js` | 6 张 | 独立 canvas 渲六只特写 + 合影到 `shots/wbm-*.png`，人工肉眼验收剪影 |

离线脚本的两条纪律（写进文件头了）：

- `FX.telegraph` **不自动结算**，cb 存起来由测试挑着调 —— 否则「预警期间跑开」没法写。
- `Game.damagePlayer` 只记账不扣血 —— 把「伤害数值对不对」和「判定有没有命中」分开。

## M18.6 已交付明细（六套骨架）

1. **`src/wbmodels.js`（新建，约 900 行）**，全局 `WBModels`，按 `model` 名分派：

   | 模型 | 剪影特征 | 关键部件 |
   |---|---|---|
   | `wb_candle`（烛九阴） | 盘三圈的螺旋 + 直立颈 | 七节脊椎螺旋（半径 1.4→7.0）、颈三节、人面 + 长发 + 金色竖瞳 |
   | `wb_hydra`（相柳） | 贴地长身 + 九颈炸开 | 五节贴地躯干、3×3 九颈各四节、蛇头 + 毒牙 |
   | `wb_kunpeng`（鲲鹏） | 横躺巨鱼 ↔ 60 米翼展的鸟 | `parts.kun/peng/pengBody/wings/fins`，三档 morph |
   | `wb_maw`（饕餮） | 矮胖四足 + 占一半体长的大嘴 | 上下颚 + 两排牙 + 腋下双目 + 背六刺 |
   | `wb_headless`（刑天） | 直立无头巨人 + 斧盾 | 断颈口 + 残骨、双乳发光、脐为口、举斧 + 朝前圆盾 |
   | `wb_ninetail`（九尾狐） | 四足狐身 + 扇形九尾 | 颈立头高过背、九条五节弧线尾（毛量剖面 0.70→1.20→0.36）、三股炸开的白尾尖 |

2. **三条硬约定**（写在文件头，违反任意一条都会「模型和逻辑分家」）：
   - `group.scale === 1`，按真实米数建；`build` 返回 `noAutoScale: true`，`buildMonster` 跳过 `setScalar`
   - `parts.torso` 必须是**内层 group**（`updateActorAnim` 无条件写它，指根节点会抹掉世界坐标）
   - 碰撞半径 ≠ 包围盒半径：`body.radius` 由 `game.js` 的 `[M18.6]` 段夹住 `measureFootR`
3. `src/actors.js`：`buildMonster` 开头分派 `WBModels.has(kind)`；`updateActorAnim` 开头分派 `WBModels.anim`。
4. `src/data/data-worldboss.js`：六只 `body` 补 `radius`（3.0~5.2）。
5. `dev/check-wbmodels.js`（182 项）+ `dev/wbmodels-shot.js`（渲图人工验收）。

## M18.7b 已交付明细（两个骨架键）

- `WBModels.setTails(actor, 0~1)`：只存 `a.tailFlare`，姿态在 `anim` 里**叠加**在摆动之上。
  `rotation.y` 必须**取负**（尾巴朝 −Z 长，绕 Y 正向转是往中间收）。
- `WBModels.setGhost(actor, on)`：所有材质 `transparent/opacity 0.42/depthWrite` 一起切，能完整还原。
- `WBFight._revealTick(e, dt)` + `_setRevealState(e, on)`：每 9 秒翻一次「现身 5 秒」；
  `e.wbVulnMul` 0.6（藏）↔ 2.0（现）；进 P3 当场就是「藏」的状态，所以立刻转半透明。
- `Game.damageEnemy`：`final *= e.wbVulnMul`（放在格挡之后、抗性之前）。
- `_resetCombat` 一并清 `wbTailsOut / wbReveal / wbVulnMul` 并调 `setTails(0)` / `setGhost(false)`。

## 下一步（只剩 M18.8 + M18.9）

**M18.8 掉落**

1. `WorldBoss.onKill` 现在只播报 + 记冷却，**没发奖**。接 `WORLD_BOSSES[*].loot`：
   `uniqueMin-Max` 必掉传世 1~3 件（`data-uniques.js` 里 ilvl ≥ 40 的池子）、
   `mats` 三种材料、`rune` 2~4 个。
2. 传世掉落池按 `ilvl` 过滤已经写好（40 级前为空），**不要加额外开关**。
3. `WORLD_BOSS_MATERIALS.worldsoul`（世界魂）`pending: 'M18.8'`，要进 `CRAFT_MATS`。
4. 掉落走已有的 `Game.dropLoot` 路径，别新写一套（自动拾取 P04 要统一读它）。

**M18.9 说明页 / 图鉴 / README**：六只的名字、领域、三阶段、掉落一句话，写进游戏内说明页与 README。

## 卡点

- **无阻塞**。待实测再调的五个数（都已有合理默认，不要因为「感觉太难」先动）：
  1. 刷新门槛 40 级（传世掉落线）
  2. 周期 30 分钟真实时间；太稀降到 20 分钟，**不要**改成游戏内时间
  3. 九尾狐「幻域」先做成「变暗但五角星仍显示」
  4. M18.7a 新引入的两个手感数：格挡折减 `0.4`（正面挨四成）、格挡窗口 `±75°`。
     实测如果「绕后绕不动」就把窗口收到 ±60°，如果「绕后没意义」就把折减提到 0.3。
     两个数都在 `Game.damageEnemy` 的 `[M18.7]` 段里，只改那里。
  5. M18.7b 的现身节奏 `REVEAL_EVERY 9s / REVEAL_DUR 5s / HIDE 0.6`。
     三个数都在 `WBFight` 顶部的常量区；嫌「等太久」就缩 every，嫌「太肉」就把 0.6 提到 0.8。
     注意 **0.6 不是无敌**：写成无敌会让 175000 血拖成十几分钟。

## 决策记录

| 日期 | 决定 | 理由 |
|---|---|---|
| 2026-10-28 | 世界 Boss **不复用任何现有骨架**，6 套全新 | 用户明确要求；现有骨架是给 2~3 米怪设计的，放大 2 倍后关节比例全错 |
| 2026-10-28 | 同一时刻**只有一只**，不做并行多只 | 注意力只有一份，同时刷三只的结果是三只都没人打 |
| 2026-10-28 | 存**时间戳**而不是倒计时 | 关页面 / 切后台 / 换设备后仍然正确，倒计时会漏 |
| 2026-10-28 | 选点用 `homeMaps`（每只 2~3 张主题图），不全世界随机 | 烛龙刷在竹径里只会显得随便 |
| 2026-10-28 | 传世掉落改成「必掉 1~3 件」而不是概率 | 这是全作唯一稳定产出传世的入口，章节首领负责抽奖，世界 Boss 负责打卡 |
| 2026-10-28 | 台账单独成文件（而非塞进 `act-expansion.md`） | 9 个节点 + 6 张设计表，塞进去会把 M1~M7 的进度淹掉 |
| 2026-10-28 | `armorMul` 从 2.4 收回 1.0 | 护甲是双曲减伤 `100/(100+A)`。armorHigh 已把 A 从 180 抬到 540（2.29 倍硬），再乘 2.4 → A=1296（4.99 倍硬），叠血量与抗性总硬度 11.8 倍 ≈ 16 分钟 |
| 2026-10-28 | **抗性五项压平成同值，取消全部元素缺口**（第二版） | 用户要求「世界 Boss 不能和八部天龙重复」。八部 8 只每人一个 −60 洞 + 四条 +80 墙（8 倍差），世界 Boss 若也这么写就是同一道题做两遍。压平后玩家不再做「换武器」实验，答案只剩领域与阶段 |
| 2026-10-28 | `hp` 从 280k~340k 降到 175k~235k | 抗性压平后「打对元素 ×1.6」没了，同血量会硬 2.3 倍。降血量把有效血量拉回 3.3~3.9 倍混沌（TTK 约 4.5~6 分钟） |
| 2026-10-28 | 新增 `counter: 'domain'` 字段 | 把「这只的答案在领域里」写成可断言的声明；`check-worldboss` 第十一节拿它和八部的 `stagger` / `patterns` 钉成互斥 |
| 2026-10-28 | 鲲鹏**去掉俯冲**，`wb_dive` 改名「潜渊」，P2 改成「水空分层」 | 俯冲是迦楼罗的招牌（`charge` + 飞行期只有雷/投掷能命中）。同一记动作做两遍最容易被玩家看出来 |
| 2026-10-28 | 烛九阴 / 相柳的造型**保留**，只改战斗核心 | 44m 无足蛇 vs 2.6m 人形龙众、九颈 vs 三头，轮廓本身不撞；撞的是「主题标签」。保留原典比换角色更值 |
| 2026-10-28 | 击杀后冷却**一整个周期**（从击杀时刻算），不是「立刻换下一只」 | 打完这一只，接下来半小时该去干别的。无人击杀时才是「到点立刻换」（不空窗） |
| 2026-10-28 | 世界 Boss 击杀**不进** `BOSSES[bid]` 的 75 秒重生路径 | 那条路径读 `BOSS_POS` / `BOSSES[bid].level`，世界 Boss 两样都没有；不分流会直接抛异常 |
| 2026-10-28 | 领域光环挂 `Game.scene`，不挂 `boss.group` | boss 的 `group.scale` 是 4.6~5.6，挂进去 30 米领域会变成 160 米 |
| 2026-10-28 | 小地图**跨图不画边缘箭头** | 每张图坐标系独立（size 140~300），跨图方向是假的，指错比不指更糟 |
| 2026-10-28 | 星标做成**四层组合标记**（领域圈 / 信标环 + 公转刻度 / 双层五角星 / 外发光），不是单色五角星 | 用户三次要求「不能和其他 Boss 相同、要特殊、要带颜色」。单换形状不够——红点首领的辨识度来自「红 + 圆」，星标必须同时在**形状、尺寸、颜色、动效**四个维度上不同，才不会被当成同一类东西 |
| 2026-10-28 | 星标填充把领域色**往白混 18%**（`Minimap._lift`），领域色本身不动 | 领域色是给大面积用的；星标只有 17px，饕餮 `#c07a3a` 压在小地图深褐底色上会糊成一团。只提亮星标本体，横幅 / 光环 / 图鉴仍用原色 |
| 2026-10-28 | 世界 Boss 的实体**不画红点**（`if (e.wb) continue`） | Boss 追人时会离开领域中心；不跳过的话星标旁边会多一颗红点，等于白做。星标画在敌人之后也是为了同一件事 |
| 2026-10-28 | 星标外径定 17.5、内径 7.7（比值 0.44） | 0.38 的「标准五角星」填起来像一堆细刺，缩到 82px 面板上完全看不出是星；0.44 才像一枚徽章 |
| 2026-10-28 | `remaining()` 封顶在 `cycle` | 系统时钟往回跳时会出现「61:20 后离去」这种明显不对的数字 |
| 2026-10-28 | 领域效果写**独立字段**（`domSlow` / `domAspd`），不并进 `playerSlow` / `poisonT` | 并进去的话出圈时「该减掉多少」算不清：减多了顺手抹掉敌人刚给的冰霜减速，减少了留下永久残留（「打完 Boss 移速永远慢 20%」） |
| 2026-10-28 | 领域 DoT 走 `damagePlayer` 的 `opts.pierce`，无视护甲 / 抗性 / 难度 | 数据写的是「每秒 0.6% 最大生命」，这是对玩家的一句承诺。走常规结算满装只剩 0.19%，堆防御就等于免疫领域。常规伤害该吃护甲，环境伤害不该 |
| 2026-10-28 | 夜阶段的雾**连颜色一起压暗**，且按**绝对距离**算夜色 | 只收 `fog.far` 不改色 → 屏幕一片亮白，看着像贴图没加载。按比例算 → 各图 `fogFar` 98~196，同一只 boss 在不同图上深浅不一。改成「18 米以上只是收窄，6 米才入夜」 |
| 2026-10-28 | 领域视野的**阶段覆盖**读 `phases[].enter.sight`，不等 M18.7 | 昼夜领域的「闭眼」本来就该随血量走；先按 `worldBossPhaseAt` 算阶段，M18.7 补真正的切换演出时不用改这里 |
| 2026-10-28 | buff 条给领域那一条加 `noTimer`，显示「常驻」 | 它没有剩余秒数（出去就没了），写 `0.0s` 会让人以为快结束 |
| 2026-10-28 | 战斗层单独一个文件 `src/worldboss-fight.js`，不塞进 `worldboss.js` | 后者是刷新·存档·通知·领域，一处都不需要 THREE 几何；混进去「状态机」和「满屏特效」会互相打岔，而且那个文件已经 600 行 |
| 2026-10-28 | 世界 Boss **不走 `bossPattern()`**，走自己的 18 条技能 | patterns 是八部天龙八只共用的招式池（slam / roots / ringshot / charge）。撞上就等于「又一只八部」，`check-worldboss` 第十一节会红 |
| 2026-10-28 | 阶段切换时**先把随阶段变的字段打回基线**再重算 | 不打回的话 P3 会带着 P2 的正面格挡，玩家绕到背后也打不动，而且找不到原因（数据里明明写了 P3 没有 `blockFront`） |
| 2026-10-28 | 刑天 P3 的 `staggerEvery/staggerDur` 改成 `dmgMul: 1.3` | 硬直窗口是八部天龙的「破绽」语言（等窗口站桩）。世界 Boss 的答案是**拉开距离 / 绕背**，不是等它硬直。`check-worldboss` 现在会拦住任何带 stagger 字样的 enter 键 |
| 2026-10-28 | `blockFront` 判**玩家站位角度**，不判「这一击从哪来」 | 本作伤害大多是范围 / 追踪，没有单一来向；站位是玩家唯一能控制的东西。窗口 ±75°、折减到 40%：再大等于永远格挡（谜题消失），再小转个身就躲掉（盾变装饰）；全免则 19 万血拖成十分钟 |
| 2026-10-28 | `blockFront` **不分元素** | 只挡物理的话换法术就绕过去了 —— 那又变成「猜元素」，与八部的去重直接冲突。这里的答案只有站位 |
| 2026-10-28 | 定身写 `Game.rootT`，**不复用 `playerSlow`** | 减速封顶 0.85，拉满还能走 15%，那不是「定住」。数据里 `root: 2.5` 承诺的是「动不了」 |
| 2026-10-28 | 定身同时作废 `dashT` | 不然被定住的瞬间按一下冲刺就跑了（冲刺那段位移不读移速），「定住」变成一句空话 |
| 2026-10-28 | 战吼加速走 `wbHaste/wbHasteT`，**不借 `aspdT/aspdMul`** | 那一对是**压制**通道（`atkCd -= dt*(1-aspdMul)`），写 0.34 是「慢 34%」，用来表达「快 50%」正好相反。而且它到期不清零，会把加速带到下一只 boss 身上 |
| 2026-10-28 | 场地效果的 `t` 初值给 `every`，不是 0 | 初值 0 会让进圈那一帧白挨一下。领域 DoT 的累加器也是「先等一个间隔」，同一场战斗里两套节拍必须一致，否则玩家觉得有一边是 bug |
| 2026-10-28 | 场地伤害走 `pierce`，与领域 DoT 同口径 | 「每秒扣多少」是对玩家的一句承诺，不该被护甲吃掉 |
| 2026-10-28 | 分身用 `spawnEnemy(..., e.wbId)` 生，再逐项拆掉 `boss/wb/active` | 分身和本尊**长得一模一样**才是谜题前提。代价是 spawnEnemy 会走 isBoss 分支（顶栏血条、`BOSSES[bid]` 查询），必须拆干净，否则 `onKill` 直接抛异常 |
| 2026-10-28 | 昼夜视野读 `WBFight.nightOf(e)`，不另起计时器 | 两套计时器一定漂，漂了的表现是「视野亮了但暗潮还放得出来」。谁维护 `e.wbNight` 就只让谁算 |
| 2026-10-28 | `enter.regurgitate` 不落字段 | P2 的「反刍」就是技能表多了 `wb_regurgitate`。写一个没人读的 `e.wbRegurgitate` 只会让以后的人以为有东西没接上 |
| 2026-10-28 | 六套骨架**单开 `src/wbmodels.js`**，不塞进 `actors.js` | `actors.js` 已经 1286 行、19 个 kind 分支，再塞 6 套「每套 150 行」的巨兽骨架就没人看得懂了。分派只加一行 `if (WBModels.has(kind)) return WBModels.build(kind, cfg)` |
| 2026-10-28 | 骨架按**真实米数**建，`group.scale = 1`，带 `noAutoScale` | 数据里 `scale: 4.6~5.6` 是给「2 米人形 × scale」的旧口径；44 米的蛇再乘 5.4 会变成 238 米直接穿出地图 |
| 2026-10-28 | `parts.torso` 必须是**内层 group** | `updateActorAnim` 无条件写 `P.torso.position`；指根节点等于每帧抹掉 `updateEnemies` 同步过来的世界坐标，表现是「逻辑走远了、模型钉在出生点」 |
| 2026-10-28 | 碰撞半径用数据里的 `body.radius` 夹住 `measureFootR` | 44 米盘蛇的水平包围有 14 米，拿它当碰撞半径玩家得站 14 米外，近战永远够不到 |
| 2026-10-28 | 剪影验收用 **(w/len, h/len) 平面点距 > 0.10**，不用三维尺寸向量 | 三维归一化会把「两只都是长条兽」的差异全吃掉（相柳 vs 饕餮只剩 0.038）。玩家看剪影看的是比例 |
| 2026-10-28 | 材质的 `metalness` 一律 ≤ 0.45 | 场景没有环境贴图，`metalness: 0.75` 直接渲成近黑 —— 第一版刑天的斧盾在截图里就是两块黑木板 |
| 2026-10-28 | 九尾展开的 `rotation.y` **取负** | 尾巴朝 −Z 长，绕 Y 正向转是把它往中间收：第一版「展开」反而把扇形从 24.3 米收到 18.2 米 |
| 2026-10-28 | 现身窗口用「藏 0.6 倍 / 现 2 倍」，**不做无敌** | 175000 血的 boss 如果只在 5 秒窗口里可打，一场要十几分钟，玩家会以为卡住了。「打得到但很亏」才会自己挑窗口爆发 |
| 2026-10-28 | 现身节奏放 `ai` 里每帧推进，不用 `setTimeout` | 换图 / 击杀 / 暂停时 setTimeout 还在跑，会把倍率带到下一只 boss 身上 |
| 2026-10-28 | `setGhost` 用**材质透明度**而不是 `visible=false` | 藏起来会让玩家以为 boss 消失了，还丢掉「打中的是影子」这层意思 |
