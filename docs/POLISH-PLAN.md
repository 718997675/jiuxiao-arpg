# 体验与平衡优化计划（17 项）

> 来源：用户 2026-10-28 一次性提的 17 条体验 / 平衡问题。
> 状态：**计划，未开工**。逐条落地时把状态改成 ✅ 并补提交号。
> 关联：`docs/ACT-EXPANSION-PLAN.md`（世界结构）、`docs/SKILL-REDESIGN-PLAN.md`（技能重构，另一条线）。

---

## 0. 怎么用这份文档

每条一个小节，固定四段：

| 段 | 写什么 |
|---|---|
| **现状** | 实测数字 + 代码位置（函数名，不写行号 —— 行号会漂） |
| **根因** | 为什么会出现用户看到的现象，一句话说清 |
| **改法** | 动哪个文件、哪个函数、改成什么数；有多个方案就列出来并给建议 |
| **验收** | 怎么算改完了（能量化的给数字，不能量化的给操作步骤） |

编号 `P01~P17` 与用户原话的顺序一一对应，方便对照。

---

## 1. 总览

| # | 问题 | 类型 | 优先级 | 主要文件 | 预估 |
|---|---|---|---|---|---|
| P01 | 任务怪数量少，要重进图才能刷满 | 数值 / 体验 | **P0** | `src/data/data-quests.js`、`src/game.js` | 0.5 天 |
| P02 | Boss 在远处（传送门）也放技能 | **真 bug** | **P0** | `src/game.js` `updateBossAI` | 0.5 天 |
| P03 | 小地图方向 / 箭头不对；不能放大 | 真 bug + 功能 | **P0** | `src/ui-minimap.js`、`index.html` | 1 天 |
| P04 | 自动拾取 + 品质筛选 | 新功能 | P2 | `src/game.js` `updateLoot`、`src/core/settings.js` | 1 天 |
| P05 | 每图怪种太多，图鉴集齐太快；怪物总数扩到 120 | 内容 / 数据 | P3 | `src/data/data-monsters.js`、`data-world.js` | 3~5 天 |
| P06 | 蓝耗太低，法师太强 | 数值 | **P1** | `src/data/data-core.js`、`data-skills.js` | 1 天 |
| P07 | 悬赏板样式粗糙，分不清条目 | UI | P2 | `src/ui.js` `renderBoardPanel`、`index.html` | 1 天 |
| P08 | 任务奖励看不到，要先交才知道 | UI | P2 | `src/ui.js` `openGiver` / 对话、`renderQuests` | 1 天 |
| P09 | 多 Boss 时血条显示错的那只 | **真 bug** | **P0** | `src/game.js` `updateEnemies`、`src/ui.js` `updateBoss` | 0.5 天 |
| P10 | 卡位远程打死 Boss；法师技能几乎全图 | 数值 + 机制 | **P1** | `src/data/data-skills.js`、`src/game.js` 施法校验 | 1.5 天 |
| P11 | 悬赏完成不知道交给谁，NPC 也没提示 | **真 bug** | **P0** | `src/quests.js`、`src/game.js` `openGiver` | 1 天 |
| P12 | 试炼升级太快，破坏平衡 | 数值 / 规则 | **P1** | `src/data/data-trial.js`、`src/trial.js` | 0.5 天 |
| P13 | 每章地图长得一样，没辨识度 | 内容 | P3 | `src/data/data-maps.js` `ZONE_ARCHETYPES` | 3~4 天 |
| P14 | 多只 Boss 挤在一个祭坛 | 内容 / 结构 | P2 | `src/data/data-maps.js` `bossPosOf`、`data-world.js` | 1.5 天 |
| P15 | Boss 战前没有剧情，代入感弱 | 内容 | P3 | `src/data/data-monsters.js`、`src/game.js` | 2 天 |
| P16 | 符文爆率太高，打造太容易 | 数值 | **P1** | `src/game.js` `runeChance` | 0.3 天 |
| P17 | 左下角日志一闪就没，看不到历史 | UI + 架构 | P2 | `src/ui.js` `log`、`index.html` `#log` | 1.5 天 |

**合计约 21~25 个工作日**（单人）。分 4 批：

| 批次 | 内容 | 理由 |
|---|---|---|
| **第 1 批**（3~4 天） | P02、P09、P11、P03、P16、P01、P12 | 前四条是真 bug（玩家以为游戏坏了），后三条是改一个数字就能见效的数值 |
| **第 2 批**（4~5 天） | P06、P10、P04、P07、P08、P17 | 战斗手感 + UI。P06/P10 必须一起做（都是战斗数值，分开调会互相打脸） |
| **第 3 批**（5~7 天） | P05、P14 | 数据量活。P05 要写 40 种怪，P14 要重排首领落点 |
| **第 4 批**（6~8 天） | P13、P15 | 内容创作，需要先出设计稿再写代码 |

---

## 2. 逐条方案

### P01 · 任务怪数量少，要开几次图才能刷满

**现状**

- 任务击杀需求最大 **80 只**（`QUESTS` 里 `killAny` 的 count 有 20/25/30/35/40/45/50/60/65/70/80 若干档）。
- 世界图一次刷 **40~46 只**（`MAPS[x].spawnCount`），副本图 12 只。
- 怪**死了不补刷**：`spawnEnemies` 只在 `loadMap` 时刷一次，`updateEnemies` 里没有补位逻辑。

所以「杀 80 只」的任务必然要出图再进图，最多三次。用户的原话是「要开地图几次才能刷满」。

**根因**：任务需求量是按「这张图的总怪数 × 倍率」估的，但估的时候没考虑「玩家不会把图清空」——
实际清场成本很高（跑图 + 找怪），而且清完就没了。

**改法**（建议 A，两条一起做）

- **A1 地图内补刷**（`src/game.js`）：`updateEnemies` 里加一个低频补位器 ——
  每 6 秒检查一次，若「本图存活怪数 < `spawnCount × 0.6`」且「当前 zone 离玩家 > 25 米」，
  就在该 zone 补 1~2 只（上限不超过 `spawnCount`）。
  只在**野图**生效（`MAPS[id].raid` / `safe` / 地下城 / 试炼全部跳过）。
  这和「同屏上限 PC 36 / 触屏 28」不冲突：补位只补到 `spawnCount`，超出的照旧被 cap 截断。
- **A2 任务量对齐**（`src/data/data-quests.js`）：把 `killAny` 的 count 统一压到
  **≤ 本图一轮能杀完的数量**（`spawnCount × 0.8`，即 32~36）。现存的 45/50/60/65/70/80
  逐条改小，并把「多杀」的爽感转成「多刷几只精英」——即这些任务改成 `killElite` 或 `killAny` 但 count 降档。
- 备选 B：只做 A2（不改刷怪）。优点是零风险，缺点是「图清空了要等重进」的体验还在。
  **建议 A1+A2 都做**，A1 是玩家真正想要的东西。

**验收**

- 接一条 80 只的主线（改完后应为 ≤36），在图里**不出图**杀满，`dev/quest-progress.js` 记录不重进图。
- 清空一张图后再等 30 秒，图上怪数回到 `spawnCount × 0.6` 以上。
- `node dev/zone-density.js` 仍然全绿（补位不改静态分配，只补运行时数量，密度校验读的是静态值 —— 要确认这一点没被破坏）。

---

### P02 · Boss 在传送门那边也放技能

**现状**（`src/game.js` `updateBossAI`）

```js
if (e.patternCd <= 0) {
  e.patternCd = RND(4.5, 7.5) * (1 - e.phase * 0.12);
  this.bossPattern(e, pp);      // ← 没有任何距离判定
}
```

**根因**：技能 CD 到点就放，不看玩家在多远。Boss 一旦被激活（`d < 17` 那一瞬间 `e.active = true`），
哪怕玩家跑回入口，它照样每 4.5~7.5 秒放一次 `ringshot`（12 发弹幕，`life: 3s × speed: 12` = 36 米射程）、
`slam`（在**玩家脚下**生成 4.6 米预警圈）。`slam` 尤其离谱 —— 它把落点直接钉在玩家坐标上，
所以玩家站在 98 米外的传送阵旁，脚下照样亮红圈。

**改法**

1. **技能距离闸**：`bossPattern` 入口加判定
   ```js
   const d = DIST2D(e.pos, pp);
   if (d > BOSS_SKILL_RANGE) { e.patternCd = 1.2; return; }   // 短 CD 重试，不消耗整轮
   ```
   `BOSS_SKILL_RANGE` 建议 **18 米**（略大于激活半径 17，让「刚激活就能放」）。
   写进 `BALANCE.boss.skillRange`，按难度可调。
2. **脱战**：`updateBossAI` 里加
   ```js
   if (d > BALANCE.boss.leash) { /* 玩家跑出 32 米 → 回位、清 debuff、回满血、active=false */ }
   ```
   回位时 `this.boss = null; UI.updateBoss(null)`。**这是标准 ARPG 的 leash 机制**，
   顺带解决 P10 的「卡位远程打死」——玩家跑远，Boss 回满血，卡位就没意义了。
3. **`slam` / `roots` 的落点不要钉在玩家身上**：改成「以 Boss 为圆心、朝向玩家的扇形/圆形」，
   或「玩家当前位置 + 0.5 秒预判」。现在的写法等于全图追踪，玩家跑多远都躲不掉（只是看不见）。

**验收**

- 站在入口传送阵不动，Boss 区 98 米外的 Boss 60 秒内**不放任何技能**（`dev/probe-boss.js` 打点统计）。
- 走进 18 米内，技能正常释放。
- 打一半跑出 32 米，Boss 回位 + 血条消失 + 回满血。

---

### P03 · 小地图方向 / 箭头不对；要能点击放大 + 滚轮缩放

**现状**（`src/ui-minimap.js`）

- 第 184/277 行有两处 `g.rotate(Math.atan2(Game.playerFace.x, Game.playerFace.z))`。
- 地图本身是「整图俯视」，`tx = R + (x - cx) * scale`、`tz = R + (z - cz) * scale`，**不做旋转**。
- 面板固定尺寸（`R` 由 canvas 尺寸算），没有缩放状态。

**根因**（待实测确认，两个可能）

1. **箭头方向错**：`atan2(x, z)` 得到的是「以 +z 为 0、顺时针」的角度，而 canvas 的 `rotate()`
   是「以 +x 为 0、顺时针」。两者差 90°，所以箭头会整体偏一个直角。修法是 `atan2(x, z)` → `atan2(x, z)` 后再 `- Math.PI/2`，
   或者画箭头时把三角形朝向画在 +x。
2. **地图与箭头不一致**：地图是「北在上」的固定朝向，如果箭头按玩家朝向转、地图不转，
   玩家会觉得「箭头指的方向和地图上的路对不上」。两种做法二选一：
   - **A 北固定**（推荐，暗黑 2 式）：地图不转，箭头按「玩家朝向相对北的角度」转。
   - **B 玩家朝上**：整张地图随玩家旋转（`g.rotate(-faceAngle)`），箭头永远朝上。
     B 更像手游，但小地图是「整图俯视」不是「局部视野」，转起来容易晕。

**改法**

1. **先修箭头**（`drawPlayerArrow`）：确认角度基准，加一条断言 —— 玩家朝 +z（`playerFace = {x:0,z:1}`）时，
   箭头必须指向屏幕下方（因为 +z 在 canvas 上是向下）。写进 `dev/minimap-check.js`。
2. **点击放大**：小地图加 `click` → 打开一个居中大面板（复用 `#minimapPanel` 的样式体系，
   新建 `#mapBig` 层），尺寸 `min(80vh, 80vw)`。
3. **滚轮缩放**：`#mapBig` 上绑 `wheel`，`scale` 范围 **0.5×~4×**，以鼠标位置为锚点缩放
   （不是以中心，否则放大后想看的地方跑掉）。同时支持双指捏合（`touchmove` 两指，复用 `mobile.js` 的判定）。
4. 放大后**显示坐标格 + 区域名**，并保留「玩家 / 任务区 / 首领 / 出口门」四个标记。

**验收**

- `dev/minimap-check.js`：玩家朝 +z / +x / -z / -x 四个方向，箭头像素方向分别朝下 / 右 / 上 / 左。
- 点小地图能开大图，滚轮缩放后鼠标指的那一点不动（误差 < 8px）。
- 移动端双指缩放可用，且不影响摇杆。

---

### P04 · 自动拾取 + 品质筛选

**现状**（`src/game.js` `updateLoot`）

- 掉落物有吸附圈（`pullR = 2.4 + pickupRadius × 0.55`）和拾取圈（`grabR = 1.3 + pickupRadius × 0.3`），
  但**装备必须走到 1.3 米内才捡**，且行囊满了会一直弹「行囊已满」。
- 没有设置项（`src/core/settings.js` 里没有拾取相关字段）。

**改法**

1. **设置项**（`src/core/settings.js`，`index.html` 设置页加一块「拾取」）：
   - `autoPickup`：开 / 关（默认**开**）
   - `pickupMinRarity`：`common` / `magic` / `rare` / `epic` / `legendary`（默认 `magic`）
     —— 低于此品质的装备**不自动捡**（仍留在地上，走近照旧能手动捡）
   - `pickupGold` / `pickupMat` / `pickupRune`：三类非装备掉落单独开关（默认全开）
2. **逻辑**：`updateLoot` 里装备分支加
   ```js
   if (SETTINGS.autoPickup && RARITY_ORDER[l.item.rarity] >= RARITY_ORDER[SETTINGS.pickupMinRarity]) { ... 自动捡 ... }
   ```
   自动捡时**不弹「行囊已满」**，改成「自动拾取暂停」的一条低频提示（10 秒去重），
   否则一波怪掉 8 件会刷 8 条红字。
3. **「留在地上」要看得见**：不自动捡的装备，名牌上标一个「未拾取」小角标，
   否则玩家会以为东西没掉。

**验收**

- 设置成 `rare`，杀一波掉 5 件（3 白 1 蓝 1 金）→ 只有金自动进包，白蓝留在地上。
- 关掉自动拾取 → 行为回到现在的「走近才捡」。
- 行囊满时自动拾取静默暂停，不刷屏。

---

### P05 · 每图怪种太多 → 图鉴集齐太快；怪物总数扩到 120

**现状**

- `MONSTERS` 共 **80** 条（humanoid 8 / undead 16 / beast 20 / spirit 20 / plant 3 / stone 13）。
- 每图 `spawns` 怪种数：老图 12~13（`forest` 12、`swamp` 13、`mine` 13、`abyss` 12、`heaven` 12），
  新图 8~9，副本 3~4。**平均 6.44**。
- 图鉴（`CODEX`）按「收进过图鉴的怪种」计数。

**根因**：一张图 12 种怪 → 清一轮就解锁 12 个图鉴条目，30 张图不到 10 小时就收满。
种类多本来是「生态感」，但**一次全给你**就变成了「图鉴没难度」。

**关于「扩充至 120 个」的理解**（**需要拍板**）

| 解读 | 后果 |
|---|---|
| **A 怪物种类 80 → 120**（建议） | 每图仍只分 6~8 种，图鉴收集周期拉长 1.5 倍；生态感靠「不同图不同组合」体现 |
| B 每图刷怪数 120 只 | 与 §5.1 的「380~450㎡/只」直接冲突（290 尺寸图 16000㎡ / 120 = 133㎡/只，密 3 倍），
且同屏上限 PC 36 / 触屏 28 会截断，等于只有 36 只在动 —— 白做 |

**建议 A**：种类扩到 120（+40 种），同时**每图降到 6~7 种**。

**改法**

1. **新增 40 种**（`src/data/data-monsters.js`）：按族系缺口分配 ——
   plant 只有 3 种（最缺），补 12；humanoid 补 6；其余按现有比例补 22。
   每种要有：`family` / `hp` / `atk` / `spd` / `color` / `model`（复用现有 9 个模型，换配色 + 缩放）/ `patterns`。
   **不新建模型**（`charforge` 的几何体拼装成本太高，先用「同模型换色 + 换缩放 + 换武器」撑住辨识度）。
2. **重排每图怪池**（`MAPS[x].spawns` + `MAP_SPECS[x].kinds`，**两处必须同步**，见 AGENTS.md）：
   每图 6~7 种，其中「本图专属 2 种 + 跨图通用 4~5 种」。
   专属种只在 1~2 张图出现，这样玩家到新图会看到「没见过的怪」。
3. **图鉴分档**：`CODEX` 里每卷的条目数从「本卷全部」改成「本卷专属 + 已见过的通用」，
   并在 UI 上标「本卷 24 / 40」，让玩家知道还有多少没见。

**验收**

- `MONSTERS` 条目数 = 120；`dev/quest-ref.js` 的「monster 引用完整」仍然全绿。
- 每图 `spawns.length` ∈ [6, 7]；`node dev/zone-check.js` 全绿（刷怪数不变，只换种类）。
- 图鉴收满所需时间：按「每图 7 种 × 39 图」估算 ≈ 273 个图鉴位，比现在（80 种全解锁）拉长 3 倍以上。

---

### P06 · 蓝耗太低，法师太强

**现状**

- 技能消耗（`src/data/data-skills.js`）：战士 12~40（均 23.1）、法师 10~50（均 28.5）、道士 8~45（均 26.5）。
- 灵力上限靠 `int` 成长（`data-core.js` 职业成长表 `int: { mpMax: 5~6 }`）+ 装备词缀，
  **没有上限曲线约束**，中后期 mpMax 会到 400~600，而技能还是那几十点。
- `mpReg`（回灵/秒）同样吃 `int` 成长 + 装备，**没有「持续施法会掉蓝」的压力**。

**根因**：消耗是**固定值**，蓝量是**线性成长**。等级越高，「蓝/消耗」比值越大，
到 40 级以后基本等于无限蓝。法师技能 CD 短（火球 1.4s / 冰锥 3.2s），无限蓝 = 无限输出。

**改法**（三步，缺一不可）

1. **消耗随技能等级成长**：`cost` 改成基础值 + 每级增幅
   ```js
   skillCost(sk) = sk.cost * (1 + 0.06 * (sk.lv - 1))   // 10 级技能 = 1.54×
   ```
   现成的 `Game.skillCost(sk)` 里加这一项即可（`ui-skills.js` / `ui.js` 的显示自动跟着变）。
2. **压回灵**：`mpReg` 的收益减半（`int` 成长 0.06 → 0.03，装备词缀同比例）。
   目标：**满蓝连放同 CD 技能，可持续 15~20 秒**（现在实测 >60 秒）。
3. **法师单体再收一点**：火球 `cost 10 → 14`、冰锥 `14 → 18`。
   不改伤害 —— 用户说的是「不费蓝」，不是「伤害高」。先动消耗，看 TTK 再决定要不要动伤害。

**验收**（写进 `dev/balance-report.js`）

- 60 级法师、无 buff、对木桩：满蓝连续施法（按 CD 卡点）**持续 15~20 秒后蓝空**。
- 战士 / 道士同样测试，持续 25~35 秒（战士本来就该更耐久）。
- 打一场普通图（40 只怪）需要**主动喝 1~2 次蓝药**，而不是全程满蓝。

---

### P07 · 悬赏板样式粗糙，分不清条目

**现状**（`src/ui.js`）

- 悬赏板是 `showDialog` 里的一串按钮（「接下 · 悬赏名」），没有列表结构、没有奖励预览、
  没有「剩余时间 / 已完成次数」。
- 数据侧 `QuestSys.boardList(part)` 已经带 `cd`（到期时间戳）和 `count`（完成次数），**UI 没用上**。

**改法**

新建 `#boardPanel`（独立浮层，参照 `#alchemistPanel` 的骨架）：

```
┌─ 悬赏板 · 卷二 ──────────────────── 今日 3/6 ─┐
│ ┌──────────────────────────────────────────┐ │
│ │ ● 肃清 · 血月沼泽            剩余 2:14:30 │ │
│ │   击杀 30 只沼泽生物                       │ │
│ │   奖励  1200 经验 · 480 金 · 稀有装备 ilv8 │ │
│ │   [ 接下 ]                                │ │
│ ├──────────────────────────────────────────┤ │
│ │ ✓ 采集 · 沉骨滩              已完成 3 次   │ │
│ │   冷却中 00:42:10                         │ │
│ └──────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- 每行：类型色点（击杀红 / 采集绿 / 护送蓝）+ 名称 + 目标 + **奖励预览**（复用 P08 的组件）+ 剩余时间 / 冷却。
- 已接的悬赏单独一栏（「进行中」），带进度条。
- 冷却中的置灰 + 倒计时（每秒刷新，只在面板打开时跑 `setInterval`）。

**验收**

- 打开悬赏板能一眼分出「可接 / 进行中 / 冷却中」三态。
- 剩余时间每秒跳动；关掉面板后 `interval` 必须清掉（`UI.closeAll` 里统一清）。

---

### P08 · 任务奖励提前可见

**现状**

- `QUESTS[x].rewards` 已经有完整数据：`{ xp, gold, ilvl, rarity, skill, talent }`
  （例：`{ xp: 900, gold: 500, ilvl: 9, rarity: 'rare', skill: 'thrust', talent: 2 }`）。
- 但**只在交任务时结算**，接取对话和山海志里都不显示。

**改法**

1. 抽一个 `UI.renderRewards(rewards)` → 返回一段 HTML（金币 / 经验 / 装备（品质色 + ilvl）/ 技能 / 天赋点）。
   三处复用：**接取对话**、**山海志任务卡**、**P07 的悬赏板**。
2. 接取对话的按钮上方加一行「奖励：…」。
3. 山海志的任务卡里，在 `brief` 下面加一行奖励。
4. 装备奖励显示成「稀有 · ilv9 装备（随机）」，并标「按交任务时的等级生成」——
   避免玩家以为能拿到固定那件。

**验收**

- 接任何一条任务，对话里能先看到全部奖励项，与交任务后实际到手的数值一致（`dev/test-quest.js` 加断言：
  对话里解析出的数字 === `QUESTS[id].rewards` 的字段值）。

---

### P09 · 多 Boss 时血条显示的是另一只

**现状**（`src/game.js` `updateEnemies` + `updateBossAI`）

```js
if (e.boss && !e.active) {
  if (d < 17) { e.active = true; this.boss = e; UI.updateBoss(e); ... }   // 谁先靠近谁抢到血条
}
...
if (this.boss === e) UI.updateBoss(e);    // 只有 this.boss 那只更新血条
```

**根因**：`this.boss` 是**单个引用**，先激活的 Boss 占住它。玩家走进第二只 Boss 的 17 米，
`this.boss` 被抢走 → 血条换成第二只；玩家回头打第一只，第一只在掉血，
但 `this.boss !== 第一只`，所以血条**不更新**。正是用户描述的「实际打的在掉血，血条不动」。

5 张老图有多只 Boss：`forest`(2) / `swamp`(3) / `mine`(2) / `abyss`(3) / `frost`(2)。

**改法**

`this.boss` 的语义从「谁先靠近」改成「**玩家最近攻击的那只**」：

1. `damageEnemy` 里，若目标是 boss → `this.boss = e`（打谁显示谁）。
2. `updateBossAI` 里 `if (this.boss === e)` 保留（只更新当前血条）。
3. 没有攻击行为时，`this.boss` 取「**离玩家最近的 active boss**」（每 0.5 秒重算一次，
   避免每帧遍历），并在切换时给血条一个淡入，让玩家知道换了。
4. 多 Boss 同时在场时，血条下方加一排小血条（每条 60px，显示另外几只），
   点小血条可切换主显示 —— 这是 ARPG 的标准做法（暗黑 3 的精英群血条）。

**验收**

- `swamp`（3 只 Boss）：打 A 时血条是 A 且在掉；走到 B 旁边不动手，血条仍是 A；
  打 B，血条切成 B；再回头打 A，血条切回 A 且数字连续。
- `dev/probe-boss.js` 加一条：任意时刻 `UI` 显示的血条 hp === `this.boss.hp`。

---

### P10 · 卡位远程打死 Boss；法师技能几乎全图

**现状**

- 玩家技能 `castRange`（`data-skills.js`）：法师多个技能没有 `castRange` 字段
  → `game.js` 的施法逻辑 `const range = sk.castRange || 0` 时**不做距离校验**，
  直接按 `sk.castRange || 6` 生成落点。等于「点哪打哪，无射程上限」。
- Boss 被激活后没有 leash（见 P02），所以玩家站在 30 米外的高台上能一直打，Boss 走不过来（地形卡位）。

**根因**：两条叠加 —— ① 玩家技能缺射程约束；② Boss 不会脱战。

**改法**

1. **每个主动技能必须有 `castRange`**（`data-skills.js`）：
   - 近战（旋风斩 / 斩杀）：`3.2~3.8`
   - 中程（火球 / 冰锥 / 突刺）：`10~14`
   - 远程大招（炎爆 / 焚天 / 冰霜新星）：`16~18`（**不是全图**）
   - 自身范围（火墙 / 护盾）：不填 `castRange`，但 `radius` 明确
2. **施法前校验**（`game.js` 的 `castSkill`）：
   ```js
   if (sk.castRange && DIST2D(pp, target) > sk.castRange) { UI.log('距离太远。', 'bad'); return; }
   ```
   注意：**自动瞄准**（按住技能键自动锁最近敌人）也要走这条校验，否则「自动锁到 40 米外的怪」照样能打。
3. **Boss leash**（与 P02 合并做）：玩家跑出 32 米 → Boss 回位 + 回满血。
   卡位流的核心不是「打得远」，是「Boss 不会回来」，所以 leash 是这条的真正解法。
4. **补一条数据校验**：`dev/skill-ref.js`（或现有 `dev/skill-*`）里断言
   「所有 `type` 为 `projectile` / `aoe` 且非 `self` 的技能都有 `castRange`」，防止以后再漏。

**验收**

- 站在 30 米外对 Boss 施法 → 提示「距离太远」，技能不进 CD、不扣蓝。
- 卡在石头上打 Boss，Boss 走不过来 → 8 秒后 Boss 回位并回满血（日志提示「XX 已退回祭坛」）。
- 法师所有技能面板上都能看到「XX 码」射程（`ui-skills.js` 已经会显示 `castRange`）。

---

### P11 · 悬赏完成不知道交给谁，NPC 也没提示

**现状**

- 悬赏（`kind: 'board'`）由**录事**发布（`giverOfNpc` / `partOfGiver`），
  但任务数据里 `giver` 字段对悬赏是「录事」，而交付提示只写「回营地复命」。
- `QuestSys.ready(a)` 为 true 时，`UI.updateQuestTrack` 只在追踪条上写「可交」，
  **没写交给谁**；录事头顶也没有「!」标记（只有可接任务才有「?」）。
- `openGiver` 里悬赏的对话文案是通用的一句，没有「你完成了 X，赏金在此」。

**改法**

1. **交付人写进任务数据**：`QUESTS[x].turnIn`（NPC id），悬赏 = 本卷录事，
   主线/支线 = 现有 `giver`。`QuestSys.track()` 返回里带上 `turnInName`。
2. **追踪条**：`可交 · 交给 录事·闻书`（带 NPC 名）。
3. **NPC 头顶标记**：`spawnNPCs` 里已有任务标记逻辑，加一条 ——
   若该 NPC 是某条 ready 任务的 `turnIn`，挂「!」金色标记（与可接的「?」区分）。
4. **对话**：`openGiver` 里若该 NPC 有 ready 任务，第一句就是
   「你回来了。X 的事，赏金在此。」+ 直接列出可交条目（不再让玩家去翻面板）。
5. **小地图**：可交任务的 NPC 位置在小地图上打一个金色「!」（复用任务区标记的画法）。

**验收**

- 完成悬赏后：追踪条写「交给 录事·闻书」；录事头顶出现「!」；走到录事面前按 F，
  第一句对话就是交付。
- `dev/test-quest.js` 加断言：每条 board 任务都有 `turnIn`，且该 NPC 在对应营地的 `npcs` 里。

---

### P12 · 试炼升级太快，改成 20 级试炼

**现状**（`src/data/data-trial.js` `TRIAL_CFG`）

- 怪物等级贴玩家（`lvOffset: 1`，`lvPerWave: 0.12`），波次无限，经验照给。
- 试炼里怪多（`countMax: 22`）+ 刷新快 → 单位时间经验远高于野图。
- 没有等级门槛，也没有「超过多少级收益衰减」。

**用户原话「改为 20 级试炼」**（**需要拍板**，两种理解）

| 方案 | 含义 | 效果 |
|---|---|---|
| **A 准入 20 级** | 20 级才能进试炼 | 反而**放大**问题 —— 20 级后正好是升级最快的阶段 |
| **B 试炼上限 20 级**（建议） | 只有 20 级以下能用；≥21 级进不去，或进去后经验为 0 | 试炼变成「新手追赶通道」，不破坏主线节奏 |

**建议 B**，并且加一条「收益递减」兜底：

1. **准入门槛**：`TRIAL_CFG.maxLevel = 20`，`> 20` 级在试炼使者对话里显示「你已不需此地淬炼」。
2. **经验衰减**：试炼内经验 × `0.5`（`TRIAL_CFG.xpScale = 0.5`），
   理由：试炼是「练手 + 掉装」的地方，不该是「升级最优解」。
3. **保留装备掉落**：不砍掉落，否则试炼就没人去了 —— 玩家要的是「刷装备」不是「刷经验」。
4. **给已超 20 级的老档一个交代**：进不去时提示「试炼只对 20 级以下开放」，
   不要静默失效（老玩家会以为坏了）。

**验收**

- 21 级角色点试炼使者 → 提示「你已不需此地淬炼」，不扣任何资源。
- 15 级角色打 10 波，经验总量 ≈ 现在的 50%。
- `dev/test-trial.js`（如无则新建）覆盖：准入判定 / 经验倍率 / 掉落照给。

---

### P13 · 每章地图风貌要各自不同

**现状**

- 8 种骨架（`ZONE_ARCHETYPES`）用了 31 次：`radial 6 / spiral 5 / canyon 5 / terrace 5 / isles 3 / ring 3 / twin 2 / cross 2`。
- **同章内会撞骨架**：`2-2` 是 `spiral,canyon`，`3-2` 也是 `spiral,canyon`；
  `4-1` 是 `radial,canyon,terrace`，`5-1` 里也有 `radial/terrace`。
- 地貌（`ground`）只有 8 种，且同章的图常常共用（卷一全是 `dirt/bamboo`）。

**根因**：骨架是「拓扑」，地貌是「皮肤」，两者都只有 8 种，31 张图必然重复。
玩家记住的是「这张图长什么样」，不是「这张图的 zone 怎么连」。

**改法**（分两层，先做便宜的那层）

1. **地貌参数化**（便宜，1~2 天）：给每张图加一组「风貌参数」，不改骨架也能拉开差异：
   - `palette`：地表色 / 雾色 / 天空色（现在每图已有，但同章太接近 —— 拉开色相）
   - `props`：道具密度 + 主道具（竹子 / 石柱 / 骨堆 / 冰晶 / 剑碑…）
   - `landmark`：每图一个**地标**（巨大的枯树 / 断裂的石桥 / 半埋的巨剑 / 悬空的祭坛），
     放在入口到首领的必经路上 —— 玩家靠地标记路
   - `weather`：粒子（雪 / 灰 / 雨 / 萤火 / 落叶）
   这四项都在 `buildMap` 的 `cfg` 里，加字段即可，不改 zone 拓扑。
2. **骨架分化**（贵，2~3 天）：给同章重复的骨架加**变体参数**（不改拓扑，改比例）：
   - `canyon` 的「窄 / 宽」、`radial` 的「环数」、`terrace` 的「台地层数」、`spiral` 的「旋向」
   - 例：`2-2` 的 canyon 用「窄峡谷（走廊宽 0.10R）」，`3-2` 用「宽谷 + 侧洞（0.18R + 2 个耳室）」
   实现上给 `ZONE_ARCHETYPES[x]` 加第二个参数 `variant`，同一种骨架出 2~3 套坐标表。
3. **每章一个「主题规则」**：卷一的图必须有一条「贯穿南北的主路」，卷三的图必须「绕一圈回到入口」…
   这条是设计约束，写进 `AGENTS.md` 供以后加图时遵守。

**验收**

- 同章内没有两张图用「相同骨架 + 相同地貌」。
- 盲测：给 10 张截图（去掉 UI），能靠地标 / 色调分出是哪一章的图。
- `dev/zone-check.js` 全绿（变体只改比例，不改连通性）。

---

### P14 · 多只 Boss 挤在一个祭坛

**现状**

- 5 张图有 2~3 只 Boss（`forest` 2 / `swamp` 3 / `mine` 2 / `abyss` 3 / `frost` 2）。
- `bossPosOf(mapId, bossId, idx)`：`idx = 0` 放圆心，其余沿 `0.5r` 圆环按 120° 散开 ——
  **三只 Boss 全在同一个 sanctum 里，相距 9~10 米**。
- 而且它们**同时激活**（各自 `d < 17` 判定），等于一次打三只。

**根因**：`bossPosOf` 只解决「坐标不重叠」，没解决「不该同场」。

**改法**（两个层次，建议都做）

1. **分场**（结构层，`data-maps.js` + `data-world.js`）：
   - 给多 Boss 图的每只 Boss 指定**自己的 zone**（`MAPS[x].bossZones = { bossId: zoneId }`）。
     现有骨架里每个都有 2~3 个「副区」（`wingL/wingR`、`sideA/sideB`、`ring` 的四个耳室），
     正好可以当「小首领场」。
   - `bossPosOf` 改成读 `bossZones`：有指定就用该 zone 的圆心，没有才回退到现在的圆环散开。
   - 副区的 Boss 血量 × 0.7（它现在独享一个区，不该和主 Boss 一样肉）。
2. **分批激活**（战斗层，`game.js`）：同图多 Boss 时，**主 Boss 死之前副 Boss 不激活**
   （或副 Boss 只在玩家踏入它的 zone 时激活）。这样一场战斗永远只有 1~2 只同时在打。
3. **数据校验**（`dev/zone-check.js`）：多 Boss 图里，任意两只 Boss 的落点距离 ≥ 18 米；
   且每只 Boss 的落点都在自己的 zone 内。

**验收**

- `swamp`（3 只）：三只分别在主祭坛 / 东耳室 / 西耳室，相距 > 25 米；
  打主 Boss 时另外两只不动（除非走进它们的区）。
- `zone-check` 新增两条断言全绿。

---

### P15 · Boss 战前有剧情演绎

**现状**

- Boss 首次激活时（`d < 17`）只有一句 `UI.toast(name + title)` + `UI.log(一句台词)` + `SFX.boss()`。
- 数据侧 `BOSSES[x].lines` 已经有 2~3 句台词，但只随机取一句打日志。

**改法**（先做「轻演出」，不做 CG）

1. **数据**：给每只 Boss 加 `intro`（3~5 句，`{ who, text }` 数组），写在 `data-monsters.js`。
   卷一 ~ 卷五各卷末 Boss 写满 5 句，普通 Boss 3 句。
2. **演出**（`game.js` 新增 `playBossIntro(e)`）：
   - 冻结玩家输入 **2.5 秒**（不是过场动画，是「镜头拉近 + 黑边 + 逐句字幕」）
   - 镜头从玩家侧后方推到 Boss 面前（复用 `Game.camera` 的 tween，`FX` 里已有缓动）
   - 字幕逐句淡入，每句 1.2 秒，可按键跳过
   - 结束时 `SFX.boss()` + 血条淡入 + 恢复输入
3. **只演一次**：`state.bossIntro = { bossId: 1 }` 落盘（复用 `mapCleared` 的写法），
   重刷不重复演 —— 否则刷子玩家每次都要看 2.5 秒。
4. **可跳过**：设置项 `skipBossIntro`（默认关），刷子玩家可以一键关掉。

**验收**

- 首次打 `treeking` 播 3 句字幕 + 镜头推近，2.5 秒后正常开打。
- 第二次打同只 Boss 不播。
- 演出期间玩家不能移动/施法，演出结束后输入立即恢复（不能有「卡住」感）。

---

### P16 · 符文爆率太高，打造太容易

**现状**（`src/game.js` 掉落段）

```js
const runeChance = e.boss ? 1 : (e.elite ? (seeker ? 0.3 : 0.18) : (seeker ? 0.05 : 0.025));
```

- 普通怪 **2.5%**、精英 **18%**、Boss **100%**（还会乘难度系数 `D.rune`）。
- 一张图 40 只怪 ≈ 期望掉 **1 个符文**（40 × 2.5%），清两张图就能凑够一次打造的符文。

**改法**（保守下调，先砍 60%）

| 来源 | 现在 | 改为 |
|---|---|---|
| 普通怪 | 2.5% | **0.8%** |
| 精英 | 18% | **8%** |
| Boss | 100% | **100%**（保留 —— 打 Boss 该有确定性回报） |
| 寻宝词缀（seeker）加成 | ×2 | ×1.6 |

一张图期望从 1 个降到 **0.32 个**，约 3 张图凑一次打造。
如果玩家反馈「太慢」，优先回调精英档（8% → 12%），别动普通怪 ——
普通怪是「意外之喜」，不该是主要来源。

**验收**

- `dev/balance-report.js` 里加「每图期望符文数」，改完后应为 0.3~0.4。
- 模拟 100 张图的掉落分布，符文总数落在 28~40 之间。

---

### P17 · 左下角日志改成可滚动的记录列表

**现状**（`src/ui.js` `log`）

```js
log(text, cls = '') {
  const d = document.createElement('div');
  box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);   // 只留 6 条
  setTimeout(() => { d.style.opacity = 0; }, 6000);
  setTimeout(() => d.remove(), 7200);                                // 7 秒后删掉
}
```

**根因**：日志是「一次性飘字」，只留 6 条、7 秒后自动删 —— 升级 / 接任务 / 掉落这些
「想回头确认」的信息根本来不及看。

**改法**（用户明确说是「为后面多人游戏做基础」，所以要按**消息流**设计，不是按「飘字」）

1. **数据层**：`UI.log` 改成写入环形缓冲 `UI.logs`（`{ t, text, cls, channel }`），
   保留最近 **200 条**（内存占用可忽略）。`channel` 预留 `system / combat / loot / quest / social`
   —— 多人游戏时 `social` 就是聊天频道，现在先只填 `system`。
2. **视图层**：`#log` 换成
   ```
   <div id="log"><div id="logList"></div><input id="logInput" readonly></div>
   ```
   - `#logList`：固定高度（160px）+ `overflow-y: auto`，新消息插到底部，**已滚上去看历史时不自动跳回底部**
     （`scrollTop + clientHeight >= scrollHeight - 8` 才自动跟随）
   - `#logInput`：底部输入框，现在 `readonly` + 占位文字「（多人模式开放后可用）」，
     按回车/`T` 聚焦 —— 结构先留好，功能等联机
   - 折叠：默认收起为 4 行，点一下展开到 160px（记忆状态）
3. **降噪**：`combat` 频道的消息（伤害数字之类）**不进日志**，只进飘字；
   日志只收「系统 / 掉落 / 任务 / 升级」这类低频高价值信息。
4. **时间戳**：每条前面加 `[HH:MM:SS]`，方便回看。

**验收**

- 连升 5 级 + 接 3 个任务，日志里 8 条都在，能往上滚看到第一条。
- 新消息到达时，若玩家正在往上翻，视图**不跳**；回到底部后恢复跟随。
- 日志 200 条封顶，超出丢最旧的。
- 移动端不挡摇杆（`mobile-layout.js` 回归全绿）。

---

## 3. 需要拍板的问题

| # | 问题 | 我的建议 | 影响 |
|---|---|---|---|
| 1 | P05「小怪扩充至 120 个」是**种类**还是**每图数量**？ | 种类 80 → 120，每图降到 6~7 种 | 若是每图 120 只，与「380~450㎡/只」冲突，要重做密度模型 |
| 2 | P12「20 级试炼」是**准入 20 级**还是**上限 20 级**？ | 上限 20 级（≥21 级进不去） | 准入制会放大「升级太快」的问题 |
| 3 | P06 蓝耗调整要不要连带砍法师伤害？ | 先只动消耗，观察一周再决定 | 同时动两个变量，出问题分不清是哪个 |
| 4 | P14 副区 Boss 血量 × 0.7 是否接受？ | 接受（独享一个区，不该和主 Boss 一样肉） | 影响「多 Boss 图」的节奏 |
| 5 | P15 演出要不要「每次进图都播」？ | 只播一次（落盘），设置里可强制重播 | 刷子玩家会烦 |

---

## 4. 回归与验收

每条改完必须跑（见 `AGENTS.md` §5）：

```bash
node dev/smoke.js            # 三职业开局
node dev/act-check.js        # 世界结构 646 项
node dev/zone-check.js       # 区域数据
node dev/zone-density.js     # 密度（P01/P05 必跑）
node dev/test-quest.js       # 任务系统（P01/P08/P11 必跑）
node dev/quest-ref.js        # 任务引用完整性
node dev/mobile-layout.js    # 移动端布局（P03/P07/P17 必跑）
```

需要**新增**的脚本：

| 脚本 | 覆盖 | 用在 |
|---|---|---|
| `dev/minimap-check.js` | 四方向箭头 / 放大 / 缩放锚点 | P03 |
| `dev/probe-boss.js` | Boss 技能距离闸 / 脱战 / 血条归属 | P02、P09、P10 |
| `dev/skill-ref.js` | 所有主动技能都有 `castRange` | P10 |
| `dev/trial-check.js` | 试炼准入 / 经验倍率 / 掉落 | P12 |
| `dev/log-check.js` | 日志环形缓冲 / 滚动跟随 / 200 条上限 | P17 |

---

## 5. 文件改动清单（按批次）

**第 1 批**

```
src/game.js            updateBossAI（距离闸 + 脱战）、updateEnemies（boss 归属）、
                       damageEnemy（this.boss 跟着攻击目标走）、runeChance
src/ui.js              updateBoss（多 boss 小血条）、updateQuestTrack（交给谁）
src/quests.js          track() 返回 turnInName、board 交付口径
src/ui-minimap.js      箭头角度基准
src/data/data-quests.js killAny 的 count 降档、turnIn 字段
src/data/data-trial.js TRIAL_CFG.maxLevel / xpScale
src/data/data-core.js  BALANCE.boss.skillRange / leash
```

**第 2 批**

```
src/data/data-skills.js 全部主动技能补 castRange；法师火球/冰锥 cost 上调
src/game.js             skillCost 随技能等级成长、castSkill 距离校验、updateLoot 自动拾取
src/core/settings.js    autoPickup / pickupMinRarity / pickup* 开关
src/ui.js               renderRewards、renderBoardPanel、openGiver 交付对话
src/ui-skills.js        消耗显示（自动跟随 skillCost）
index.html              #boardPanel、设置页拾取块、#log 改结构
```

**第 3 批**

```
src/data/data-monsters.js  +40 种（plant 12 / humanoid 6 / 其余 22）
src/data/data-world.js     每图 spawns 降到 6~7 种、bossZones
src/data/data-maps.js      bossPosOf 读 bossZones、多 boss 落点分散
```

**第 4 批**

```
src/data/data-maps.js      ZONE_ARCHETYPES 加 variant、landmark / weather 字段
src/world.js               buildMap 读 landmark / weather / palette
src/data/data-monsters.js  每只 boss 的 intro 台词
src/game.js                playBossIntro、state.bossIntro 落盘
```

---

## 6. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-28 | 建档：17 条需求 → P01~P17，分 4 批，含 5 个待拍板问题 |
