# 技能特效 · 统一收口与合入计划（人物 + BOSS）

- 分支：`feat/skill-refactor`
- 用户口径（2026-11-07）：**两边没做完的合并成一份计划，不要分开**；
  后面**依次**把「人物技能特效」→「BOSS 技能特效」都合进游戏（main / 正式站）。
- 本文件是**唯一待办清单**。`docs/SKILL-VFX-PLAN.md` / `docs/BOSS-VFX-PLAN.md`
  降级为设计参考（形色分离、判定形状对应预警、验收定义都还照它们读），
  但**不再往那两份里加待办、也不再按它们的 V0~V6 / P0~P2 编号排期**。
- 进度事实看这两份：`docs/status/skill-refactor.md`（人物主线）、
  `docs/status/boss-kits.md`（B 线 B1~B25）。本文件只管「还差什么、按什么顺序合」。
- 更新：2026-11-07；进度更新：2026-11-09（U2 收口）

> 当前：**U1 / U2 已收口**（U1 `--live` 113/0、默认 39/0；U2 `probe-buffrow` 29/0 + `probe-buff-icons` 11/0）；两条线的特效代码都已在 feat/skill-refactor 跑通，但 origin/main 一个特效文件都没有。下一步 **U3**，仍按人物先合、BOSS 后合的顺序走。

## 一句话现状

**代码写完了，没进正式线。** 人物侧地基 / 15 条剪影 / 45 套台阶 / 30 个接线 / 双演出层 /
可见度与预算全绿；BOSS 侧 B1~B25 全 ✅、88 招 0 空招 0 报错。
但 `git rev-list --count origin/main..HEAD` = **100**，
`src/fx-kit.js` / `vfx.js` / `sfx.js` / `fx2.js` / `boss-cast.js` 在 origin/main **一个都不存在**。
所以「合进游戏」不是继续写特效，是**补完欠账 → 按固定动作合 main → 推上线**。

## 完成度盘点（2026-11-07，按代码 + 台账实算，不按 PLAN 勾选）

| 线 | 完成度 | 已完成 | 未完成 |
|---|---|---|---|
| 人物技能特效 | **约 80%** | V0 地基（14 格图集 + 12 原语，全带 `FX.q` 降级）、配方 DSL v2（15 剪影 × 形/色/时 + `ELEM_PROFILE` 6 套）、P4 三职业 ⑤ 签名、P5 台阶 45/45、P5b ①~④ 位 30 个 case 接线、B20 玩家侧 37 只 `src/sfx.js`、V2/V3/V3b 可见度、双演出层适配（`abd20ad`）；15 位 × 4 档 ≤6 draw call、五连放 +3.5%；U1 双演出层口径 + 空招/偏淡收口；契约 dsl 343 / kit 58 / p5 974 / p5b 116 / p4 60 | U3~U6（U1 / U2 已 ✅） |
| BOSS 技能特效 | **约 85%** | B1~B25 全 ✅（B2 已推翻不计）：45 只 × 5 格 = 88 招、18 个原语进 `src/fx2.js`、`src/boss-cast.js` 接进 `bossPattern`（四拍 + 每第 5 轮压轴）、B22 地面暗底、B23 竖向兜底（43 招有高度）、B24/B25 变形层 180 条 / 10 种应对轴；真机 15/15、88 招 0 空招 0 报错 | U7~U10（见下表） |
| 合入 | **0%** | 无 | U11 / U12 |

> 口径：两份 PLAN 是 10-27 / 10-28 的旧方案，都还写着「待拍板 · 未动一行代码」，
> 实际工作走的是台账里的 V0/P4/P5/P5b/V2/V3 和 B1~B25，那条路已经把 PLAN 的主体做掉了。
> `SKILL-VFX-PLAN.md §13` 的 14 条验收清单**已勾 6 条**（U2 的第 7~11 条，每条都写了探针判据），
> 另加两条 U2 专属判据（图标出图 / 稳定 key）作为清单后的引用块，不占 14 条编号。
> 其余 8 条仍等 U6 逐条给人眼 / 性能结论 —— 「全绿 ≠ 做完」的口径不变（见 `skill-refactor.md` 2026-11-02 章）。

## 统一节点表

> 顺序即用户拍的板：**人物先，BOSS 后**。U1~U6 与 U7~U10 是各自补欠账，
> U11 / U12 是两次独立的合 main；U12 必须基于「已经含 U11 的 main」重对一遍。

| 编号 | 节点（前缀 = 归属） | 状态 | 落点 / 产物 | 验收 |
|---|---|---|---|---|
| U1 | 人物 · **SKFX 真实链路收口**：空招 `blizzard` / `antidote`；偏淡 7 只 heal 270 · bloodrage 303 · avatar 1330 · talisman 1034 · talismanarrow 1060 · whitetiger 1357 · whirl 2400；给 SKFX 定自己的面积下界；定「配方层 / SKFX 谁为准」 | ✅ | `docs/vfx-playground.html`（源）→ `node dev/build-skillvfx.js --write` → `src/sfx.js`；`dev/vfx-skill-vis.js --live` | `--live` **113/0**（零空招 / 零异常 / 每只 ≥ 同一把下界）；默认配方层 39/0；口径与下界结论写进下节 |
| U2 | 人物 · **V1 HUD 增益条整块改造已收口**：`#buffbar` 全清、`#buffrow` 落在血条正下方、17 枚符号图标出图可读、`renderBuffs` 改 `Map<key,el>` 增量 diff（零 `innerHTML`）、叠层结构化 `×N`、稳定 `st:*` key + `ord` 排序、`#trialHud` 靠 `--buff-h` 避让、到期 200ms 淡出 | ✅ | `index.html` / `src/ui.js` / `src/game.js` / `src/skill-beh.js` / `src/mobile.js` / `src/worldboss.js` / `src/domain.js` / `src/data/data-buff-icons.js` / `dev/probe-buffrow.js` / `dev/probe-buff-icons.js` | `probe-buffrow` **29/0**、`probe-buff-icons` **11/0**、PLAN §13 第 7~11 条逐条有判据、`mobile-layout` 6 视口全绿、`smoke` ERRORS none；U1 尺子回归 `--live` **113/0** |
| U3 | 人物 · **V5 组合特效进游戏**：`comboApply` 只在试验台（`docs/vfx-playground.html` 2 处，`src/` 0 处）。技能内组合 4 组（freeze / burn / exec / gather）+ 职业核心连携 3 条（刃势巨刀 / 法相手掌光点 / 符毒绿符钉）全还只是演示 | ⬜ | `src/vfx.js` 或新解释器分支 + `src/game.js` 的 `playSkillVfx` | 真机探针逐条看到组合成立，零报错 |
| U4 | 人物 · **元素反应 10 组专属视觉**：机制 P3a 已 10/10 落地（走 `damageEnemy` 一个口），但 §9.2 的蒸汽 / 等离子 / 绿火 / 晶体爬弧 / 霜面腐蚀 / 链式绿弧 / 金火等视觉语言没落进游戏 | ⬜ | `src/game.js` 的 `applyElemReaction` + `src/fx-kit.js` 现有原语 | 每组一条灰度截图，互不重样；复用 0.5s / 2s ICD |
| U5 | 人物 · **V4 近战武器附魔**：`enchant` 原语在 `fx-kit.js` / `vfx.js` / `data-vfx.js` 全是 0 处；Lv10「常驻光效」目前只有刀身发烫脉冲，不是真附魔 | ⬜ | `src/fx-kit.js` + `data-vfx.js` 的 Lv10 patch | 6 元素近战各一套剑身外观，≤6 draw call |
| U6 | 人物 · **V6 打磨 + 把验收清单勾完**：音效三段对齐（台账 0 处提及）、低画质降级逐项核验、录屏对比；`SKILL-VFX-PLAN.md §13` 14 条逐条给判据，含「同职业 5 招灰度后认出 ≥4」的人眼结论；逐条配方「该几颗 / 什么色」未逐个调（V3b 只重配了三条 ④ 位） | ⬜ | `audio/` / `dev/vfx-shot.js` / `docs/SKILL-VFX-PLAN.md §13` | 14 条全部有结论；`smoke` + `mobile-layout` 全绿 |
| U7 | BOSS · **老兜底 11 个手写 case 一行没动**：`src/game.js:8579+` 的 `quake` / `frostnova` / `curse` 仍**当帧结算零前摇**（公平性），`fireline` 仍是 6 个圆串、`charge` 预警刷在自己脚下、主视觉全贴地圆。`BOSS-VFX-PLAN.md` 的 P0 四条（补 0.7~1.1s 前摇 + 形状匹配预警）没做 | ⬜ | `src/game.js` 的 `bossPattern` 老 switch 兜底段 | 静态扫描前摇覆盖率；>1.0× 伤害的招全部 ≥0.7s 且形状匹配 |
| U8 | BOSS · **世界 Boss 6 只不在 `BOSS_KIT`**，走 `WorldBoss` 另一套调度（`game.js:8425` 注释自承），B24/B25 变形层不覆盖。要给它们「自己的四拍」得**另开一层**，别塞进 `BOSS_TWIST` | ⬜ | 新数据层 + `src/world-boss.js` 接线 | 6 只全量试放零空招；真机探针 |
| U9 | BOSS · **P2 整块**：小怪 8 形态（近战普攻 40 只零特效、healer 无治疗光束、bomber 借受击闪白当警戒灯、coward 只有 `+` 飘字）；12 条精英词缀里 7 条零视觉（`frost`/`venom`/`vampiric`/`swift`/`thorns`/`warded`/`split`，代码里只有数值逻辑）；Boss 出场零表现 / 死亡无碎片与掉落光柱 | ⬜ | `src/game.js` AI 段 + 词缀生效点 + `spawnBosses` / `onEnemyDeath` | 常驻微标识（不是每次触发炸一朵花）；40 只同屏不炸屏 |
| U10 | BOSS · **逐只精修 + 兜底层局限**：同形状两招拿到的柱子排布相同（变形层只改应对动作）、环形暗底偏薄（内圈不暗，语义是「环内安全」，要补先改判定）、共享池只有 31 招导致 45 只必有 2 格重合（92 对）、移动中判定表达不了（只有 6 种静态形状）、实体暗场是「亮团」需低模、活物没厚度（trail 是贴地 ribbon） | ⬜ | `docs/boss-vfx-playground.html` → `node dev/build-fx2.js --write`；`src/boss-cast.js` | `dev/dup-audit.js` + 逐只截图 |
| U11 | 合入 · **人物技能特效合进游戏**：补完 U1~U6 → 固定动作 → 合 main → 推上线 | ⬜ | `./dev/branch.sh --sync` → `node dev/smoke.js` + `node dev/mobile-layout.js` → `./dev/publish-preview.sh feat/skill-refactor` 看预览站 → 合 main → `./push.sh` | 正式站能开局、`ERRORS none`、存档隔离生效 |
| U12 | 合入 · **BOSS 技能特效合进游戏**：补完 U7~U10 → 同上固定动作 → 合 main；**必须基于「已含 U11 的 main」重新对一遍**，不能拿老 main 当基准 | ⬜ | 同 U11 | 88 招正式站真机全量试放 0 空招 0 报错 |

## U2 收口注记（2026-11-09）

- 验收落在 `dev/probe-buffrow.js`（29/0）与 `dev/probe-buff-icons.js`（11/0，出图 `dev/_shots/buff-icons-sheet.png`）；
  PLAN §13 第 7~11 条逐条写了判据，另两条 U2 专属判据（图标出图 / 稳定 key）放在清单后的引用块，不占 14 条编号。
- 「`#buffbar` 已从代码与 DOM 中移除」指的是**项目根 `index.html` / `src/` 主链路**。
  `preview/skill-refactor/` 是历史分支的静态预览快照（已入库、不跑游戏），里面仍带旧 `#buffbar` ——
  别拿它当回归证据，也别顺手改它。
- 排序口径已从「剩余时间」改成 `ord`（PLAN §6.6 同步更正），`statusBuffs()` 每条固定 `st:*` key；
  血怒 / 狂战改 `sto:*` key，两套领域自带 `st:domain` / `st:zone`。详见 `skill-refactor.md` U2 章。

## 双演出层口径（U1 定 · 长期有效）

> 这条不定下来，U1 改完的空招 / 偏淡会和 U6 的「逐条配方打磨」打架：
> 两边都以为自己是那只技能的正主。2026-11-07 U1 收口时按代码事实定死如下。

**谁为准：`SKFX` 为准，配方层不是并列的第二套演出。**

`Game.playSkillVfx(id, opts)`（`src/game.js:3909`）的判断顺序是
`SKFX.has(id)` → 有就整只播 `SKFX.play` 并**立刻 return**，压根不碰 `VFX.playFor`。
37 只技能在 `src/sfx.js` 里全有手搓实现，所以**正常游戏里配方层一次都不会为它们播**。
同时播两套只会得到重影 + 双倍 draw call。配方层的真实职责只剩三个：

1. **回落路径**：以后新增技能、还没写手搓实现时兜底；
2. **数据层**：15 位剪影 / 45 档台阶 patch / 元素染色仍由 `data-vfx.js` + `vfx.js` 定义，
   `VFX.playFor` 是这些数据的解释器（U5 武器附魔、U6 逐条配方仍改这里）；
3. **尺子**：`dev/vfx-skill-vis.js` 默认模式绕过 SKFX 直接量配方层，保住 V2/V3 的历史读数。

**以后改哪（按「改的是什么」分，不按「哪层好看」分）：**

| 要改的东西 | 唯一源 | 流程 |
|---|---|---|
| 某只技能的**演出本身**（形状 / 时序 / 起手回执 / 面积） | `docs/vfx-playground.html` 里那只的 `v2(c)` | 改 → 实验室看 → `node dev/build-skillvfx.js --write` → `--check` |
| **台阶 patch / 元素染色 / 功能位剪影 / 回落兜底** | `src/data/data-vfx.js`、`src/vfx.js`、`src/fx-kit.js` | 常规改 + `vfx-skill-vis` 默认模式复量 |
| `src/sfx.js` | **不许手改**，它是生成物 | 一律走上一行 |

**别名映射坑（U1 实际踩过一次）**：实验室里的技能名不全是游戏 id，
`dev/build-skillvfx.js` 的 `ALIAS` 有 5 条：
`swords→swordarray`、`stance→avatar`、`avatar→elementavatar`、`missile→fireball`、`rain→swordrain`。
按游戏 id 去实验室里找同名条目会**改到另一只技能**，而且「读数几乎没动」很难让人想到是改错对象。
改之前先查 `ALIAS`；`src/sfx.js` 里的键才是游戏 id。

**分段调用**：`segments` 只对配方层有意义。SKFX 的 `v2` 是整只一次播完（自带 delay / seq），
所以 `segments:['cast']` 播、`segments:['impact' | 'loop']` 直接返回不做事，避免命中段双播。
已知局限：`leap` 这类「起手在一处、命中在另一处」的技能，落地那一段不会再单独画在落点——
U6 逐条配方复核时一并确认，别当成新回归。

**尺子**：`dev/vfx-skill-vis.js` 默认（配方层，60/250ms 两帧）与 `--live`（真实链路，多一帧 600ms
补 SKFX 的迟起 seq）分开量，但**共用同一把绝对下界** `900 / 1500 / 2500`。
U1 逐只比对过 37 组 `SKFX / 配方` 读数：0.166 ~ 6.514、中位 1.003、15 只 <0.6 且 14 只 >1.5，
不存在可套的「手搓层更收敛、打折 60%」这回事；同一块视口、同一机位，看得见就是看得见。
多采一帧是补演出层起步时差，不是给面积放水。

## U1 收口记录（2026-11-07）

**判据结论：不给 SKFX 单设下界。** 中途试过 `SFX_MIN_* = MIN_* × 60%`，逐只比对 37 组
「SKFX / 配方」读数后推翻：0.166 ~ 6.514、中位 1.003、15 只 <0.6 且 14 只 >1.5，
根本没有一个可套的同档比例；两层渲染的是同一块 1000×660 视口、同一机位，
按层打折等于把尺子绑在被量对象上。`--live` 从「只观察推进」升级为**判据**，
与配方层共用 `900 / 1500 / 2500`，零空招 / 零异常 / 每只 ≥ 下界。

**改了什么（全部走生成器，没手改 `src/sfx.js`）**

| 类 | 内容 |
|---|---|
| 两个地基 bug | `clear()` 把常驻池（粒子 `Points` / 18 个贴花 quad）当一次性 mesh 摘掉并 dispose 材质 → 池子还在写、场景树里已没有承载，玩家一个像素都收不到；`_plane` 是所有贴地网格共用的几何，按「一次性」dispose 等于拆掉整个贴地层。分别用 `userData.shared`（必须在 `ROOT.add` **之前**打）和 `!== _plane` 修掉 |
| 贴地可见度 | `flatMesh` 加 `polygonOffset(-4,-4)`。贴地环与地面共面，抬 y 只能治标，镜头一压又穿回去 |
| 空招 2 只 | `blizzard` 补起手范围环 + 冰晶下落高度 7.5→5.0；`antidote` 起手环从 opacity 0 改成 0.85、贴地 0.05→0.09、半径 4.2→5.0，再补一圈 `shock` |
| 偏淡 7 只 | `heal`（用 `TEX.shock` 而非三条细描边的 `TEX.ring`，后者只 +28 像素）、`bloodrage`、`avatar`→实际是 `elementavatar`、`talisman`、`talismanarrow`、`whitetiger`、`whirl` 各补与自身剪影语义一致的起手回执 / 范围环 |
| 尺子 | `--live` 加面积判据、`--dbg` 播放明细、离下界最近 6 只观察清单；`grab()` 先 `gl.finish()`，并在计量前用首只技能暖机一遍。单做任一个都还会偶发 `iceshard` 1401~1460 假红，两个一起才稳定 1604~1607 |

**验证（提交前最后一次复跑）**

| 项 | 结果 |
|---|---|
| `vfx-skill-vis --live` | **113 / 0** · 零空招零异常 · 37 只全 ≥ 下界 |
| `vfx-skill-vis` 默认（配方层） | **39 / 0** · 连跑三次稳定（`iceshard` 1599~1607） |
| `vfx-vis` / `vfx-bench` | 14 / 0 · 186 / 0（15 位 × 4 档 ≤6 draw call，五连放 +3.5%） |
| 真机 / 布局 | `probe-sfx` 12/0 · `smoke` ERRORS none · `mobile-layout` 全绿 |
| 契约 / 生成物 | dsl 343 · kit 58 · p4 60 · p5 974 · p5b 116 · `build-skillvfx --check` 一致 · 三个改动 JS `node --check` 全过 |

**交给 U6 的清单**（过了下界只说明「收得到」，好不好看归逐条打磨）：
`--live` 离下界最近 6 只 = whitetiger 1.09× · iceshard 1.23× · chain 1.25× ·
bloodrage 1.29× · thrust 1.38× · heal 1.62×。配方层 `iceshard` 也只有 7% 余量，
仍是最贴地板的一只，别把「暖机后稳定过线」误读成「它够显眼」。

## 下一步（U1 / U2 已收口，从 U3 开始，别跳）

1. `U3` 人物 · **V5 组合特效进游戏**：`comboApply` 只在试验台（`docs/vfx-playground.html` 2 处，
   `src/` 0 处）。技能内组合 4 组（freeze / burn / exec / gather）+ 职业核心连携 3 条
   （刃势巨刀 / 法相手掌光点 / 符毒绿符钉）目前全只是演示。落点 `src/vfx.js` 或新解释器分支 +
   `src/game.js` 的 `playSkillVfx`；验收 = 真机探针逐条看到组合成立、零报错。
   U2 已收口（17 枚符号图标 / 增量 diff / 叠层 `×N` / 稳定 `ord` / `#trialHud` 避让 / 200ms 淡出），
   别回头重做。
2. 改 `src/sfx.js` **一律走生成器**：改 `docs/vfx-playground.html` →
   `node dev/build-skillvfx.js --write` → `node dev/build-skillvfx.js --check`。
   别手改生成物（`abd20ad` 修的 `hitArea` stub 就是这么来的）。
3. 每个 U 收口后立刻 `git status` + 写本表状态 + commit，再进下一个。台账别攒着写。
4. U11 / U12 之前先 `./dev/status.sh` 确认三条线各自到哪了。

## 卡点（等拍板 / 硬前置）

- **等用户拍板 2 件**：① 世界 Boss 是另开一层还是维持现状（U8）；
  ② `quake` 补前摇后倍率 ×1.6 → ×2.0 还是接受 Boss 变简单（`BOSS-VFX-PLAN.md §6-⑤`，U7）。
- **U1 已结清 2 件**（2026-11-07，代码事实 + 实测，不再等拍板）：双演出层以
  `SKFX` 为准（口径见上节）；SKFX **不另设**面积下界，`--live` 与配方层共用
  `900 / 1500 / 2500`，113/0 全绿。
- **合 main 的硬前置**：`act-expansion` 优先级更高、先合；`skill` 必须基于「已含 act 的 main」
  重新对一遍；**两条功能线绝不互相 merge**；切分支前工作区必须干净（`branch.sh` 会拦）。
- **预览站 ≠ 特效台**：`publish-preview.sh` 发的是 `main:preview/<slug>/` 分支副本，
  注入 `__pv:` 存档前缀，属于 U11/U12 的固定动作，别删注入；
  用户 2026-10-27 说的「暂不发预览站」指的是**特效台 HTML 不上线**，不冲突。
- **生成物清单**：`src/sfx.js`（人物演出）、`src/fx2.js`（BOSS 原语）、
  `src/boss-cast.js`（BOSS 施法）、`src/data/data-bosskits.js`（88 招表）——
  四个都是生成物，源文件在 `docs/*.html` 或 `dev/build-*.js`，改完必须 `--write` + `--check`。
- **判据会过期**：`vfx-skill-vis` 已因 B20 双演出层返工过一次（17/21 假红）；
  U1 又因 SwiftShader 冷启动读到半帧返工一次（`iceshard` 1401~1897 来回跳，
  靠「暖机 + `gl.finish()`」压到 1604~1607 稳定）。合 main 前若再动演出层，
  先确认尺子量的是谁、读的是不是完整一帧，再谈数字涨跌。
- `probe-skill-p5b` 串跑五个浏览器偶发 11/2、单跑连三次 13/0，属时序抖动，
  合 main 前单跑确认即可，别为此改判据。
