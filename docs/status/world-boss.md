# 世界 Boss 系统 · 任务台账（M18）

- 分支：`feat/act-expansion`（与本线其它改动一起合入 main）
- 设计文档：`V2-ROADMAP.md` §18（六只设计表 / 刷新机制 / 骨架规范 / **§18.7 与八部天龙去重**）
- 更新：2026-10-28 14:48

> 当前：M18.1 ~ M18.4 全部完成并全绿（含小地图星标与其他 Boss 强制区分），下一步 M18.5 领域机制

## 一句话现状

6 只山海经巨兽，**30 分钟真实时间轮转**（无人打则到点消失、立刻换下一只；
被击杀则冷却一个周期），小地图四层组合星标（领域色 / 信标环 / 双层五角星 / 发光）
+ 场景领域光环 + 屏幕横幅 + 山海志常驻卡，**必掉 1~3 件传世**（M18.8 待接）。
数据层 / 运行时 / 通知面板 / 小地图与光环已落地；领域效果、多阶段战斗、六套骨架、掉落还没做。

**与八部天龙（M7）已强制去重**：八部 = 一个 −60 洞 + 四条 +80 墙（猜元素，8 倍差）；
世界 Boss = 五项抗性同值（零缺口）、答案在领域与阶段里。见 §18.7 与本文「决策记录」。

## 节点表

| 编号 | 名称 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| M18.1 | 数据层：`WORLD_BOSSES` 6 条 + `WORLD_BOSS_CFG` + 掉落表 + 派生函数 | ✅ | 新建 `src/data/data-worldboss.js`、`dev/check-worldboss.js`；改 `index.html` | `0e5da4e` 之后的 wip |
| M18.2 | 运行时：`WorldBoss` 刷新状态机 + `state.worldBoss` 存档字段 | ✅ | 新建 `src/worldboss.js`、`dev/worldboss-run.js`、`dev/worldboss-live.js`；改 `src/core/save.js`、`src/game.js`、`index.html` | 本次提交 |
| M18.3 | 通知与面板：屏幕横幅 + 山海志常驻卡 + 追踪行 + 「前往」 | ✅ | `src/ui.js`（`showWorldBossBanner` / `renderWorldBoss` / `worldBossCard` / `gotoWorldBoss`）、`index.html`（`#wbBanner` / `#wbTrack`） | 本次提交 |
| M18.4 | 小地图组合星标 + 领域光环 | ✅ | `src/ui-minimap.js`（`drawWorldBoss` / `_starPath` / `_lift`）、`src/worldboss.js`（`makeAura` / `dropAura` / `anim`） | 本次提交 |
| M18.5 | 领域机制：6 种玩家侧效果 | ⬜ | `src/game.js` | — |
| M18.6 | 六套全新骨架 + 专属动画 | ⬜ | `src/actors.js`、`src/fx.js` | — |
| M18.7 | 多阶段战斗：3 阶段 + 18 个招牌技能 + `enter` 分派 | ⬜ | `src/game.js`、`src/data/data-worldboss.js` | — |
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

## 下一步（M18.5，具体到行）

**领域机制：6 种玩家侧效果。** 数据已经在 `domain.player` 里写好了（M18.1 就落了），
M18.5 只做「读它并生效」：

| 领域 | `domain.player` | 生效点 |
|---|---|---|
| 昼夜（烛九阴） | `sightDay: 26, sightNight: 8` | `Game.fog` / 相机远裁，随阶段 `enter.sight` 切换 |
| 毒沼（相柳） | `dotPct: 0.6, dotInterval: 1` | 每秒扣 `maxHp × 0.6%`，走出圈就停（复用 `poisonT` 那套） |
| 水天（鲲鹏） | `slow: 20` | `playerSlow` / `playerSlowT`（已有字段） |
| 吞噬（饕餮） | `pull: 2.2` | 每帧朝 boss 位移 `pull × dt`，`pullMul` 由阶段倍率 |
| 战意（刑天） | `aspd: -15` | 攻速乘区，和 `buffs` 里的减速分开算（它不该被驱散） |
| 幻域（九尾狐） | `minimapDim: 0.35` | `Minimap.draw` 里压 `globalAlpha`，**五角星仍显示** |

三条硬规矩：

1. **判定「在不在领域内」用 `WorldBoss.rec()` 的 (x,z) 与 `domain.radius`**，
   不要用实体坐标 —— 实体被击退后圈会跟着飘，玩家会觉得「圈是假的」。
2. **离开领域必须完全恢复**：视野 / 移速 / 攻速都要在 `sync()` 或换图时归位，
   否则会出现「打完 Boss 移速永远慢 20%」。
3. **`minimapDim` 不做成「小地图失效」**（决策记录第 9 条）。

## 卡点

- **无阻塞**。三个待定项按合理默认先做，等实测再调：
  1. 刷新门槛 40 级（传世掉落线）
  2. 周期 30 分钟真实时间；太稀降到 20 分钟，**不要**改成游戏内时间
  3. 九尾狐「幻域」先做成「变暗但五角星仍显示」

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
