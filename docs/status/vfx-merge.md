# 技能特效 · 统一收口与合入计划（人物 + BOSS）

- 分支：`feat/skill-refactor`
- 用户口径（2026-11-07）：**两边没做完的合并成一份计划，不要分开**；
  后面**依次**把「人物技能特效」→「BOSS 技能特效」都合进游戏（main / 正式站）。
- 本文件是**唯一待办清单**。`docs/SKILL-VFX-PLAN.md` / `docs/BOSS-VFX-PLAN.md`
  降级为设计参考（形色分离、判定形状对应预警、验收定义都还照它们读），
  但**不再往那两份里加待办、也不再按它们的 V0~V6 / P0~P2 编号排期**。
- 进度事实看这两份：`docs/status/skill-refactor.md`（人物主线）、
  `docs/status/boss-kits.md`（B 线 B1~B25）。本文件只管「还差什么、按什么顺序合」。
- 更新：2026-11-07；进度更新：2026-11-14（U6-1 / U6-2 / U6-3 ✅）

> 当前：**人物线欠账 U1~U6 全部收口 ✅**（U6 = U6-1 三档降级 / U6-2 音效三段 / U6-3 逐只演出构成 / U6-4 §13 清单 / U6-5 收口推送）。
> §13 十四条全部有结论（13 达标 + 第 12 条的移动端 fps 转 U11 真机前置），
> `status.sh` 读到 **11/17**。**下一步进 BOSS 线 U7**（老兜底 11 个手写 case 的公平性前摇），
> 之后 U8 / U9 / U10 → U11 人物先合 main → U12 BOSS 后合 main。
> 两条线的特效代码都已在 feat/skill-refactor 跑通，但 origin/main 一个特效文件都没有；
> 功能分支已推到 origin，合入进度仍是 **0%**。顺序不变：人物先合、BOSS 后合。

## 一句话现状

**代码写完了，没进正式线。** 人物侧地基 / 15 条剪影 / 45 套台阶 / 30 个接线 / 双演出层 /
可见度与预算全绿；BOSS 侧 B1~B25 全 ✅、88 招 0 空招 0 报错。
但 `git rev-list --count origin/main..HEAD` = **127**（2026-11-14 复核；2026-11-07 那次盘点是 100），
`src/fx-kit.js` / `vfx.js` / `sfx.js` / `fx2.js` / `boss-cast.js` 在 origin/main **一个都不存在**。
所以「合进游戏」不是继续写特效，是**补完欠账 → 按固定动作合 main → 推上线**。

## 完成度盘点（2026-11-07，按代码 + 台账实算，不按 PLAN 勾选）

| 线 | 完成度 | 已完成 | 未完成 |
|---|---|---|---|
| 人物技能特效 | **约 95%** | V0 地基（14 格图集 + 12 原语，全带 `FX.q` 降级）、配方 DSL v2（15 剪影 × 形/色/时 + `ELEM_PROFILE` 6 套）、P4 三职业 ⑤ 签名、P5 台阶 45/45、P5b ①~④ 位 30 个 case 接线、B20 玩家侧 37 只 `src/sfx.js`、V2/V3/V3b 可见度、双演出层适配（`abd20ad`）；15 位 × 4 档 ≤6 draw call、五连放 +3.7%；U1 双演出层口径 + 空招/偏淡收口；U2 HUD 增益条；U3 组合特效 7 条进游戏；U4 元素反应 10 组专属视觉；**U5 近战武器附魔 6 套常驻外观**（`ENCHANT_PROFILE` + `FXK.enchant` + `Game.updateEnchant`）；**U6-1 三档降级 / U6-2 音效三段 / U6-3 逐只演出构成 / U6-4 §13 十四条结论**（含 `leap` 抛物线）；契约 dsl 358 / kit 80 / p5 989 / p5b 116 / p4 60 / combo 76 / elemfx 74 / enchant 235 / sfaudio 61 / shape 160 / vfx13 48 | **U6-5 收口**（U6-1~U6-4 已 ✅）；移动端真机 ≥30fps 转 U11 硬前置 |
| BOSS 技能特效 | **约 85%** | B1~B25 全 ✅（B2 已推翻不计）：45 只 × 5 格 = 88 招、18 个原语进 `src/fx2.js`、`src/boss-cast.js` 接进 `bossPattern`（四拍 + 每第 5 轮压轴）、B22 地面暗底、B23 竖向兜底（43 招有高度）、B24/B25 变形层 180 条 / 10 种应对轴；真机 15/15、88 招 0 空招 0 报错 | U7~U10（见下表） |
| 合入 | **0%** | 无 | U11 / U12 |

> 口径：两份 PLAN 是 10-27 / 10-28 的旧方案，都还写着「待拍板 · 未动一行代码」，
> 实际工作走的是台账里的 V0/P4/P5/P5b/V2/V3 和 B1~B25，那条路已经把 PLAN 的主体做掉了。
> `SKILL-VFX-PLAN.md §13` 的 14 条验收清单**U6-4 已逐条给结论**（U2 先勾了第 7~11 条，
> 另加两条 U2 专属判据放在清单后的引用块，不占 14 条编号）：13 条达标，
> 第 12 条的「移动端 ≥30fps」如实转 U11 真机前置，没为绿灯硬勾。
> 「全绿 ≠ 做完」的口径不变（见 `skill-refactor.md` 2026-11-02 章）。

## 统一节点表

> 顺序即用户拍的板：**人物先，BOSS 后**。U1~U6 与 U7~U10 是各自补欠账，
> U11 / U12 是两次独立的合 main；U12 必须基于「已经含 U11 的 main」重对一遍。

| 编号 | 节点（前缀 = 归属） | 状态 | 落点 / 产物 | 验收 |
|---|---|---|---|---|
| U1 | 人物 · **SKFX 真实链路收口**：空招 `blizzard` / `antidote`；偏淡 7 只 heal 270 · bloodrage 303 · avatar 1330 · talisman 1034 · talismanarrow 1060 · whitetiger 1357 · whirl 2400；给 SKFX 定自己的面积下界；定「配方层 / SKFX 谁为准」 | ✅ | `docs/vfx-playground.html`（源）→ `node dev/build-skillvfx.js --write` → `src/sfx.js`；`dev/vfx-skill-vis.js --live` | `--live` **113/0**（零空招 / 零异常 / 每只 ≥ 同一把下界）；默认配方层 39/0；口径与下界结论写进下节 |
| U2 | 人物 · **V1 HUD 增益条整块改造已收口**：`#buffbar` 全清、`#buffrow` 落在血条正下方、17 枚符号图标出图可读、`renderBuffs` 改 `Map<key,el>` 增量 diff（零 `innerHTML`）、叠层结构化 `×N`、稳定 `st:*` key + `ord` 排序、`#trialHud` 靠 `--buff-h` 避让、到期 200ms 淡出 | ✅ | `index.html` / `src/ui.js` / `src/game.js` / `src/skill-beh.js` / `src/mobile.js` / `src/worldboss.js` / `src/domain.js` / `src/data/data-buff-icons.js` / `dev/probe-buffrow.js` / `dev/probe-buff-icons.js` | `probe-buffrow` **29/0**、`probe-buff-icons` **11/0**、PLAN §13 第 7~11 条逐条有判据、`mobile-layout` 6 视口全绿、`smoke` ERRORS none；U1 尺子回归 `--live` **113/0** |
| U3 | 人物 · **V5 组合特效进游戏**：`comboApply` 只在试验台（`docs/vfx-playground.html` 2 处，`src/` 0 处）。技能内组合 4 组（freeze / burn / exec / gather）+ 职业核心连携 3 条（刃势巨刀 / 法相手掌光点 / 符毒绿符钉）全还只是演示。**接线口径已改**：挂 `castSkill` 尾部 + `damageEnemy` 命中口（不挂 `VFX.playFor`，SKFX 命中即 return），新建独立 `src/combo-fx.js`，判据读游戏真实状态 | ✅ | `src/combo-fx.js`（新，非生成物）+ `index.html` 插脚本 + `src/game.js` 三处挂点 + `src/skill-beh.js` 的 `strike` 带 `skill:id` + `dev/probe-combo.js` | 真机探针逐条看到 7 条组合成立、零报错；`smoke` / `mobile-layout` / 四个 `--check` 全绿 |
| U4 | 人物 · **元素反应 10 组专属视觉**：机制 P3a 已 10/10 落地（走 `damageEnemy` 一个口），但 §9.2 的蒸汽 / 等离子 / 绿火 / 晶体爬弧 / 霜面腐蚀 / 链式绿弧 / 金火等视觉语言没落进游戏 | ✅ | `src/elem-fx.js`（新，非生成物）+ `index.html` 插脚本 + `src/game.js` 的 `applyElemReaction` 一处挂点（旧 `FX.*` 全换掉、`chainReaction` 走 `ElemFX.link`、`explodeAt` 加 `noFx`）+ `dev/test-elemfx.js` + `dev/probe-elemfx.js` | 静态契约 **74/0**、真机探针 **94/0**：10 组逐条触发 + **10 组原语序列两两不同**（不是只换颜色）+ 坐标全有限 + 反应期间旧 `FX.*` 零调用；`smoke` / `mobile-layout` / 技能契约十份 / 四个 `--check` 全绿 |
| U5 | 人物 · **V4 近战武器附魔**：`enchant` 原语在 `fx-kit.js` / `vfx.js` / `data-vfx.js` 全是 0 处；Lv10「常驻光效」原本只有刀身发烫脉冲，不是真附魔 | ✅ | `src/data/data-vfx.js`（`ENCHANT_PROFILE` 6 套 + 15 个 Lv10 `enchant: true` 声明）+ `src/fx-kit.js`（`FXK.enchant` 常驻层）+ `src/game.js`（`enchantState` / `updateEnchant` 每帧同步）+ `dev/test-enchant.js` + `dev/probe-enchant.js` | **6 元素各一套，三维度两两不同**（贴图格 / accent 几何 / 粒子运动）；真机 draw call +4（副元素 +5、低画质 +2）≤6；`test-enchant` **235/0**、`probe-enchant` **60/0**；`smoke` ERRORS none、`mobile-layout` 全绿 |
| U6 | 人物 · **V6 打磨 + 把验收清单勾完**：音效三段对齐（台账 0 处提及）、低画质降级逐项核验、录屏对比；`SKILL-VFX-PLAN.md §13` 14 条逐条给判据，含「同职业 5 招灰度后认出 ≥4」的人眼结论；逐条配方「该几颗 / 什么色」未逐个调（V3b 只重配了三条 ④ 位） | ✅ | `src/sfx-audio.js` / `src/fx-kit.js` / `dev/vfx-shot-live.js` / `dev/test-vfx13.js` / `docs/SKILL-VFX-PLAN.md §13` | U6-1~U6-5 全 ✅；§13 十四条全部有结论（13 达标 + 1 转 U11 真机）；全套 node 契约 38 绿 / 2 已知环境红，`smoke` + `mobile-layout` 全绿 |
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

## U6 子节点表（2026-11-10 开工）

> U6 原本是一大块（音效三段 + 低画质核验 + 录屏 + §13 十四条 + 逐条配方），
> 一次做完没法定位是谁的问题。拆成 5 个能独立验收的子节点，逐个 commit。

| 编号 | 节点 | 状态 | 落点 / 产物 | 验收 |
|---|---|---|---|---|
| U6-1 | **低画质降级逐项核验**：§11 降级表五格（粒子数 / 拖尾 / 贴花 / 假 bloom / bolt 分叉）逐格对齐。此前实现是二档（`q<1` / `q<0.75`），中档 0.7 被误判成低档砍掉拖尾、低档却还留着 6 块贴花，与 §11 全对不上 | ✅ | `src/fx-kit.js`（`FXK_TIER` 三档表 + 五个原语只读档位 + `bolt` 递归层数分档） | `test-vfx-kit` **80/0**、`probe-vfx-kit` **52/0**（三档逐项）；`smoke` ERRORS none、`mobile-layout` 全绿 |
| U6-2 | **音效三段对齐**：§5 的三段式（起手 / 命中 / 余韵）在音频侧只落了「起手」一层（`SFX.skill`），命中与余韵散在 40+ 处调用点、无统一时序。**开工前先量**：余韵 0/37、起手音按元素猜、AOE 命中叠声 | ✅ | `src/data/data-sfaudio.js`（新，37×三段）+ `src/sfx-audio.js`（新，唯一出口 + 施放令牌 + 余韵兜底 + `oldestPending`）+ `src/fx.js`（余韵三音）+ `src/game.js`（起手 / 命中 / explodeAt / reset）+ `dev/test-sfaudio.js` + `dev/probe-sfx-align.js` | 静态契约 **61/0**；Safari 真机 `probe-sfx-align` **10/0**（音画同拍 / 无双响 / 37 只都有余韵 / 余韵 200~600ms / 零控制台报错）；全套 node 契约无回归、`smoke` ERRORS none、`mobile-layout` 全绿 |
| U6-3 | **逐条配方打磨**：37 只技能的「该几颗 / 什么色」逐个复核（V3b 只重配了三条 ④ 位） | ✅ | `dev/skillvfx-shape.js`（解析底座）+ `dev/audit-skillvfx.js`（审计表）+ `dev/test-skillvfx-shape.js`（契约）+ `docs/vfx-playground.html` 的 `chain` 三段 → `src/sfx.js` | 37 只逐条有结论（`audit-skillvfx` **13/0**）、契约 **160/0**、`build-skillvfx --check` 一致；`--live` **113/0**、`chain` 面积余量 1.25× → 2.79× |
| U6-4 | **§13 十四条验收清单勾完**：已勾 6 条（U2 的第 7~11 条），剩 8 条逐条给人眼 / 性能结论 | ✅ | `dev/vfx-shot-live.js`（真实链路出图尺子）+ `dev/test-vfx13.js`（静态契约）+ `docs/vfx-playground.html` 的 `leap` 抛物线 → `src/sfx.js` + `docs/SKILL-VFX-PLAN.md §13` | **14 条全部有结论**（13 条达标、第 12 条的移动端 fps 转 U11 真机前置）；`test-vfx13` **48/0**、`vfx-shot-live` **76/0**；真实链路 3 职业各 5 招灰度 **5/5 认得出**；`quake/leap` 剪影距离 **25 → 122** |
| U6-5 | **收口**：三份台账 + 当日日志 + commit + push | ✅ | 三份台账 + `dev/_pptr.js`（补 `page.keyboard`） | 全套 40 份 node 契约 38 绿（另 2 支为已知环境红，见收口记录）；`smoke` ERRORS none、`mobile-layout` 6 视口全绿；`status.sh` 11/17；功能分支已推 |

## U6-1 收口记录 · 低画质三档降级（2026-11-10 · ✅）

**口径**：`settings.resolve` 只给 `1 / 0.7 / 0.5` 三个 `FX.q` 值 = 高 / 中 / 低三档。
但原语层各写各的阈值（`q < 1` 砍粒子、`q < 0.75` 砍拖尾、`q < 1 ? 6 : 16` 定贴花池），
**两套阈值把三档压成了二档**：中档 0.7 被拖尾当成低档砍掉带子，低档 0.5 却还留着
6 块贴花 —— 和 §11「低档贴花 0、拖尾关」正好反过来。
现在收成 `FXK_TIER` 一张表，五个原语只读 `FXK.tier`，不各自判阈值。

**§11 降级表逐格对齐结果**：

| 格 | §11 写的 | 之前的实现 | 现在 |
|---|---|---|---|
| 粒子数 | 100% / 60% / 35% | `max(0.3, q)` → 100% / 70% / 50% | ✅ 100 / 60 / 35 |
| 拖尾 | 开 / 开 / 关 | `q < 0.75` → 开 / **关** / 关（中档被误砍） | ✅ 开 / 开 / 关 |
| 贴花 | 16 / 8 / 0 | `q < 1 ? 6 : 16` → 16 / 6 / **6**（低档仍有 6 块） | ✅ 16 / 8 / 0 |
| 假 bloom | 3 / 2 / 1 | shock 三件套（环 / 气浪 / 尘环）无档位差 | ✅ 高 3 件 / 中 2 件 / 低 1 件 |
| bolt 分叉 | 2 层递归 / 1 层 / 无 | **只有 1 层**（分叉自己不再生子分叉） | ✅ 高 2 层 / 中 1 层 / 低 0 |

**两个容易漏的坑**：

1. **切档时旧的贴花不会自己消失** —— 池是常驻的，从高档切到中 / 低后，
   第 9~16 块会一直亮到自然过期，看上去像降级没生效。
   `decal()` 现在每次进来先**收起超编的旧贴花**（`d.on = false` + `visible = false`），
   再按新档位转 `cap` 个槽。池**不拆**（拆了重建更贵），只转槽数。
2. **bolt 的递归用队列不用递归** —— 递归会顺着一条分叉一路钻到底，
   出来像「一根须」；队列让每层机会均等，出来像「一朵电弧」。
   子分叉长度只有父分叉的一半、概率再减半，避免两层就炸成毛刺。

**记进播放账的东西**（都是为了「能逐道判」，不用靠截图猜）：
`bolt` 现在带 `branches`（分叉条数）+ `maxLayer`（最深递归层数），
`FXK.stats()` 带 `tier`。§13 第 3 条「雷电 bolt 有分叉」从此有机器判据。

**验证**：`test-vfx-kit` **80/0**（三档粒子 40/24/14、贴花 16/8/0、
高档 20 道 ≥18 道有分叉且 ≥15 道长出第 2 层、中档 40 道零递归、低档零分叉）·
`probe-vfx-kit` **52/0**（真机三档逐项）· `smoke` ERRORS none · `mobile-layout` ✅ 全部通过。

**交给 U6-2 起的口径**：`FXK.tier` 是降级的**唯一**入口。
以后加原语只读这张表，别再写 `q < x`；写第二套阈值就是两套降级打架。

## U6-2 收口记录 · 音效三段对齐（2026-11-14 · ✅）

**先量后改**：`dev/probe-sfx-align.js` 逐只施放 37 技能，记「音效调用 / 伤害结算 /
命中反馈」三条时间线。量出余韵 **0/37**、起手音按 `type+elem` 猜（36 技共用七八种）、
命中音散在 40+ 处且 AOE 叠声。代码收口后静态契约 47/0，但**真机探针一直没跑** ——
本机 Chrome 被卸载（常驻占内存），用户指定走 Safari，第一次用要在 Safari 里开
「允许远程自动化」。

**开关打开后真机一跑，又量出 4 个静态契约照不出的真 bug**：

1. **门面没解包 `{ value: ... }`**（W3C WebDriver 所有响应都包这一层）。
   `evaluate` 返回 `{value:3}`、`screenshot` 拿到 `[object Object]`、视口校正直接 break、
   `goto` 每次白等 30 秒、报错收集器静默失效。统一在 `_pptr._cmd()` 解包后：
   返回 `3`、视口精确 1280×800、截图是真 PNG、goto 1.8 秒。
2. **8/37 只技能完全没有余韵**。根因不是「没配」，是余韵挂在 `impact()` 上，
   而领域（火墙 / 暴雪 / 雷云 / 剑阵）的每跳伤害是 `opts.silent` 的 DoT、
   换式 / 护盾 / 增益根本不结算伤害 —— `impact()` 永远不来。
   → `cast()` 给**所有**施放挂余韵兜底（`_guardAfter`：到点没补过就自己补，
   延迟仍是 `after.ms`，不二次叠加），令牌 `seq` 保证不双尾巴。
   领域另配 `impactAt` 自报「落地」那一拍 —— 视觉上有预警圈收束 / 光柱砸下，
   那才是它们的命中；**不许**让 DoT 每跳都响（会变电钻）。
3. **延迟伤害认错施法者**（最隐蔽）。真机日志里陨石 `dmg@890` 跟的是 `sfx:hit`，
   而配置里它的命中音是 `explode`；诊断脚本抓到 `_sfxCastId === 'riposte'` ——
   陨石前摇 0.9 秒，飞行期间**自动施放**把「最近一次施放」覆盖了。
   突刺 / 天罚同理掉进 fallback。→ `SfxAudio.oldestPending()`：
   取「最早还没结算命中的那一发」，`damageEnemy` 兜底链统一问它
   （与投射物自带 `sfxId` 同思路，让**伤害源自己带 id**）。
   增益类（无 impact 段）不进这个队列，否则 2 秒前一发会把 id 错给当前爆炸。
4. **同帧 / 近帧双响**：`pyroclasm` 的 `cast2` 与 `impact` 都是 `explode`；
   `chain` 的 `cast` 与 `impact` 都是 `thunder`；白虎召唤物 + 自动施放 51ms 内连出两声 `hit`。
   → 配置表校验钉住「起手段不撞命中段」；`impact()` 加**跨技能**同音色 120ms 短窗口去重
   （按技能分槽的令牌相互独立，谁都吞不掉对方）。

**慢命中的尾巴会跑到命中前面**：陨石命中 ~890ms / 星陨 ~1000ms，
而余韵兜底在 520~560ms → 配 `afterGuard`（1000 / 1600）把兜底延后，
正常路径（impact → after）仍优先。

**判据口径**（同样用真 bug 换的）：三段层是唯一出口，所以验证也只验出口 ——
`SfxAudio._play` 发出的音打 `seg=1`，假怪 AI 的攻击音 / 跨技能残留定时器 / UI 音
一律不算；分段键从**配置表**反查（全局音色清单会把起手算成命中）；
双响判「同一发 impact 段任意两声间隔 <120ms」，≥120ms 是多段技本来就该一下一下；
余韵基准取**第一声 impact 音**而不是第一笔 dmg（领域落地比首跳 DoT 早 400ms）。

**读数**：`test-sfaudio` **61/0**、`probe-sfx-align` **10/0**（37 只逐只真机）、
全套 node 契约无回归、`test-quest` 57 项、`test-s1`、`test-save` 79/0、
`test-items` 21/0、`smoke` ERRORS none、`mobile-layout` 全绿。
**唯一红**：`test-bosskits` —— 见「卡点」，与本次改动无关。

**没做的**：37 只配方「好不好看」、§13 剩 8 条人眼 / 性能结论 —— 归 U6-3 / U6-4。

## U6-3 收口记录 · 逐条配方打磨（2026-11-14 · ✅）

**先量后改**。台账只写「逐条配方未逐个调」，不量就只能凭感觉挑几只改。
新建解析底座 `dev/skillvfx-shape.js`：从**实验室**（唯一源）按 `^id: {` 锚点切出
37 只 `v2(c)`，逐只量「视觉构件 / 发数 / 颜色 / 时序骨架 / 剪影 / 职业槽位」，
`dev/audit-skillvfx.js` 出人读的 37 行表 + 判据，`dev/test-skillvfx-shape.js`
把不能退化的部分钉成 160 条契约。量生成物没用 —— 改了源头没 `--write` 时
读数还是旧的（U1 踩过：实验室换 `spinBlades`、游戏里还是 `arc`）。

**尺子返工三轮，两轮是假红**（和 V2 / B20 / U1 那几次同一类：先确认量的是谁）：

| 轮 | 报的红 | 真因 |
|---|---|---|
| 1 | 只数 `FX.*` → heal / riposte 判成「只有一个圈」 | 实验室大量演出是手工 `flatMesh` / `billMesh` / `addUpdate` 拼的，不算构件就是漏抓 |
| 1 | 16 只判「没写发数」 | 只认 `n:`，漏了 `for` 循环逐颗放、字面量数组、`Math.random()<dt*26` 按速率发射、固定 mesh 数四种写法 |
| 1 | missile / chain 判「一帧放完」 | 只认数字字面量 `delay(0.34,`，漏了 `delay(i*0.055)` / `delay(d)` 和飞行体整段写在 `onHit` 里 |
| 2 | 18 只判「时序骨架 <2 种」 | 凭空加的严格条件，没有方案依据 —— 领域本来就用 `addUpdate` 逐帧演，改回「有没有非瞬时骨架」 |
| 3 | **`chain` 只剩 1 条真红** | 6 只贴地板技能里唯一构件 <3 类的，确实是欠账 |

最终 `audit-skillvfx` **13/0**，观察项照旧打印：时序骨架覆盖
`delay 16 / seq 10 / onHit 1 / addUpdate 33`，数量写法
`n: 21 / for 21 / 数组 4 / dt速率 15 / 固定mesh 5`。

**实质打磨只动了一只 `chain`（雷弧链）**：U1 留的 6 只贴地板里最薄的一只，
`--live` 面积余量 1.25×，原本只有 `bolt + spr` 两类构件 —— 中间一根折线，
按键当帧没有回执、电流跳完地面干干净净。按 U1 修偏淡 7 只的同一套
`flatMesh(TEX.ring)` 口径（自带 `polygonOffset(-4,-4)`）补前后两段：
脚下 0.3 秒收缩的蓄势环 + 每个跳点随该跳 `delay` 出现的 0.28 秒落地环
（最多 4 个短寿命 mesh，不另起定时器）。
改 `docs/vfx-playground.html` → `build-skillvfx --write` → `--check`，
`src/sfx.js` 由生成器更新，**没有手改**。
结果：构件 2 → 4 类、时序骨架 1 → 2 种，`--live` 面积余量 **1.25× → 2.79×**，
`113/0` 保持。

**顺带结掉两桩老账**（都是切 Safari 门面后暴露的既有问题，对照实验证明与 U6-3 改动无关）：

1. **`dev/vfx-vis.js` 的 `ring` 在 Safari 下 `diff=0`，其余 12 原语全绿**。
   不是冷启动假红，也不是阈值问题：真机量到连 `Δ≥1` 的像素都是 **0**，
   而 mesh 一切正常（visible / opacity 0.78 / 66 顶点 / draw call +1）。
   四路对照：配方层 `VFX.play` 走 `FX.ring` → 0 像素；直接 `FX.ring` 给 y=0.08 →
   **7522 像素**；把配方层那一发 mesh 抬 0.08 → **7525 像素**。
   根因是**细贴地环被地面深度整个吃掉**，`polygonOffset(-4,-4)` 在 Chrome /
   SwiftShader 够用、Safari 不够。`src/fx.js` 的 `FX.ring` y 偏移 `+0.08 → +0.16`
   给共面留余量，polygonOffset 保留双保险；**不改半径、不改判据**
   （P2c 口径：环画多大就是这一发真的能打到多大）。`vfx-vis` 连跑两次恢复 **14/0**。
   HEAD 版本跑同一支探针同样 13/1，证明非本轮引入。
2. **`dev/_pptr.js` 的字符串 `evaluate` 不支持多语句块**。`probe-enchant` 的
   `TOOLS`（`const` + 若干 `window.__xxx = function`）被塞进 `return (...)`，
   Safari 报 `Unexpected keyword 'const'`，U5 那支 60/0 的尺子在 Safari 下根本跑不起来。
   门面补第五个语义：先按原样求值，只有撞上**语法类**错误才回退成 IIFE；
   业务异常照常抛出，单表达式路径（`waitForFunction('typeof NR === ...')`）
   一个字节没变。验证：`1+1 → 2`、`typeof Game → object`、
   `const a=7; return a*6; → 42`，`probe-enchant` 恢复 **60/0**。

**验证**：`audit-skillvfx` 13/0 · `test-skillvfx-shape` **160/0** ·
21 份 node 契约全绿（dsl 358 / kit 80 / field 35 / enchant 235 / sfaudio 61 /
p5 989 / p5b 116 / combo 76 / elemfx 74 …）· 三个 `--check` 一致 ·
`vfx-vis` **14/0** · `vfx-skill-vis` 默认 **39/0** + `--live` **113/0** ·
`vfx-bench` **186/0**（5 连放 +3.6%）· 真机 `probe-vfx-kit` 52/0 ·
`probe-vfx-field` 19/0 · `probe-sfx` 12/0 · `probe-enchant` 60/0 ·
`probe-sfx-align` 10/0 · `probe-skill-p5b` 13/0 ·
`smoke` ERRORS none · `mobile-layout` 全绿。
（`probe-sfx-align` 串跑 9/1、单跑 10/0；按口径批量串跑只粗筛，失败项单跑复核。）

**交给 U6-4 的两条**：
1. **§13 第 1 条的尺子量错层**：`dev/vfx-shot.js` 拍的是 `VFX.playFor`（配方层），
   但 U1 已定 SKFX 为准、37 只技能在正常游戏里**一次配方层都不播**。
   「同职业 5 招灰度后认出 ≥4」若拿现有截图勾，量的是回落路径而不是玩家眼睛收到的东西。
   U6-4 出图前先把尺子对准真实链路（或明确标注两层分别的结论）。
2. `--live` 现在最贴地板的是 **bloodrage 1.26×**（U1 清单里的 1.29×），
   其余 5 只已被前几轮推到 2.4× 以上。bloodrage 构件 4 类、发数 10、时序 2 种，
   结构不薄，只是面积小；人眼 / 录屏结论归 U6-4，别为它单独放大半径硬撑。

## U5 收口记录（2026-11-09）

**口径**：U1 定了 SKFX 为准、37 只技能在正常游戏里**一次配方层都不播**。
所以 U5 最关键的一条是「不能把附魔写成配方原语」——`data-vfx.js` 的 Lv10
`enchant: true` 只是声明，真正上场的是 `Game.updateEnchant()` 每帧按
「有效等级 + 注入包 + 真实武器挂点」同步 `FXK.enchant` 常驻层。
漏掉这条会写成「契约全绿但游戏里一个像素都没有」。

**落地**：`ENCHANT_PROFILE` 6 套（键与 `ELEM_PROFILE` 一致，元素走
`skillInjectPack` 主/副，不另建分支表）；三维度两两不同（剑身贴图格 /
accent 几何种类 / 粒子运动方向），不是换色；自建材质 + clone 贴图，
`_dropEnchant` 只 dispose 自己这一组，`update` 不 new 对象；低画质只留发光。

**验证**：`test-enchant` 235/0、`probe-enchant` 60/0（6 套差异像素 969~1098、
draw call +4 / 副元素 +5 / 低画质 +2、关闭与 clear 零残留）；
`vfx-skill-vis` 默认 39/0 + `--live` 113/0、`vfx-bench` 186/0、
`probe-skill-p5b` 13/0（连跑 4 次）、`smoke` ERRORS none、
`mobile-layout` 全绿、四个 `--check` 一致。详见 `skill-refactor.md` U5 收口章。

**顺带结掉一桩老账**：`probe-skill-p5b` 的 `11/2` 不是随机抖动，是
`iceshard` 的命中段写在飞弹 `onHit` 里、而 29 连放序列跑到中段时
SwiftShader 只有 6~8 fps（1200ms 内 `FX.update` 仅 8 次），450ms 观察窗不够；
HEAD 版本跑同一序列反而 8/5，证明非 U5 回归。给 `WAIT` 表补
`iceshard: 1700`（与 `starfall` 同性质），**判据一个字没改**，连跑 4 次 13/0。
试过每发前 `FX.clear()`，属换图级重操作、更不稳，已回退。

## U6-4 开工路标（2026-11-14 · 🔄）

**第一件事是换尺子，不是勾清单。** U6-3 交接条第 1 条：`dev/vfx-shot.js` 拍的是
`VFX.playFor`（配方层），而 U1 已定 SKFX 为准、正常游戏里 37 只技能一次配方层都不播。
拿它出图去勾 §13 第 1 条，勾的是回落路径。本轮定法：

1. **不删 `dev/vfx-shot.js`**，保留它当配方层（15 位剪影 / 回落路径）的历史尺子，
   只补一行说明「它量的不是玩家真实链路」。判据、取样时刻、下界一个字不动。
2. **新建 `dev/vfx-shot-live.js`** 作为 §13 出图的正尺子：走 `Game.playSkillVfx(id, ctx)`
   → `SKFX.play`，与 `vfx-skill-vis --live` 同一套量法（停主循环、清两层、
   `FX.update` 拆 ≤0.04 小步、`gl.finish()` 读完整帧、随机数按配方键派生）。
   取 60 / 250 / 600ms 三帧里**差异像素最大**的一帧当「高光截图」。
3. **本机没有 Chromium，`_pptr` 落 Safari WebDriver**。门面的 `$()` 返回对象没有
   `screenshot()`，`vfx-shot.js` 那种 `canvas.screenshot({path})` 在这台机器根本跑不起来。
   新尺子不依赖元素截图：页面里 `drawImage(gl)` 到 2D canvas → `toDataURL()` →
   Node 侧写 PNG；**灰度图 / 拼版也在页面 2D canvas 里做**（无 node 图像库、无 PIL），
   这样 Chromium / Safari 两条路出图口径一致。
4. **§13 第 4 条的名称与实现对不上**：PLAN 写「太极 / 火墙 / 毒雾 / 雷云」，
   实际四个持续领域是 `firewall / blizzard / thundercloud / swordarray`（U6-2 真机口径），
   `taiji` 是 `cast:'self'` 的自身增益、`poison` 是 DoT。U6-4 两组都量，
   结论里写明「按实现的四只为准 + PLAN 字面两只的归属」，不假装名字一一对应。
5. **人眼结论必须真看**：灰度 5 连拼版由 `ViewImage` 逐张读，认出几只写几只；
   机器判据（差异像素 / 剪影两两距离 / 旋转角增量）只作旁证，不代替人眼。
   `bloodrage 1.26×` 归人眼 / 录屏结论，**不为它单独放大半径硬撑**（U6-3 交接条第 2 条）。

## U6-4 收口记录 · §13 十四条验收清单（2026-11-14 · ✅）

**第一件事是换尺子，勾清单是第二件事**（开工路标第 1 条）。
`dev/vfx-shot.js` 拍 `VFX.playFor`，本机又跑不起来 —— 它没有 Chromium 时落 Safari
WebDriver，而门面的 `$()` 没有 `screenshot()`。新建 `dev/vfx-shot-live.js`：
`Game.playSkillVfx` → 页面内 2D canvas `toDataURL` 出 PNG，灰度 / 净剪影 / 拼版
全在页面里做（项目无 node 图像库、无 PIL），Chromium 与 Safari 同口径。
**老尺子不删、判据不动**，只在头注释挂「量的是配方层」告警；两层结论在 §13 分开写。

**尺子返工两轮，两次都是尺子的锅**：

| 轮 | 报出来的现象 | 真因 / 修法 |
|---|---|---|
| 1 | 20×14 二值描述子把 `whirl / warcry` 判成距离 **0**，而人眼一个横条一个圆弧 | 宽机位下小特效只占几格 → 改成从**放大净剪影**取 40×26。修完三职业最近一对 51 / 41 / 61，全部 ≥30 |
| 2 | 静态契约 45/3：`swordarray` 说没有演出、`q<0.75` 说还在、`vfx-shot-live` 说用了 `VFX.playFor` | ① 实验室里剑阵叫 `swords`（ALIAS 坑，从生成器读映射）；② 两条都只出现在**注释**里（历史说明），判「源码里没有」要先剥注释。修完 **48/0** |

**唯一实质演出改动：`leap`（跃击）补抛物线**。人眼在战士 5 连拼版里发现
`quake / leap` 是同一张「钟形尘柱 + 地环」（放大净剪影距离 25，其余职业最近 41~61）。
根因不是「画得不够」，是 `leap` 的 `sil:'抛物线落点'` **根本没画**：只写了
`P.pos.lerpVectors(...)`，而游戏里 `P.pos` 每帧被 `SKFX.sync` 从
`Game.playerGroup` 覆盖，实验室看到的位移在真实链路里一个像素都没有；
60 / 250ms 两帧差异像素只有 59 / 28，等于按键当帧毫无回执。
按它自己的语义补起跳回执环 + 14 颗随飞行逐颗点亮的弧线光点（落地后留 0.35s
余韵，600ms 高光帧里弧与落点同时可读）。走 `docs/vfx-playground.html` →
`build-skillvfx --write` → `--check`，`src/sfx.js` 由生成器更新，**没有手改**。
结果：`quake/leap` **25 → 122**、三职业灰度 **5/5 / 5/5 / 5/5** 认得出、
`vfx-skill-vis --live` **113/0** 无回归。

**14 条结论口径**（逐条证据写在 `docs/SKILL-VFX-PLAN.md §13`）：

| 条 | 结论 | 证据 |
|---|---|---|
| 1 灰度认 5 招 | ✅ 三职业各 5/5（要求 ≥4） | `sheet-{warrior,mage,taoist}.png` 人眼 + 40×26 描述子 |
| 2 旋风斩旋转 | ✅ 10/11 帧 ≥2 道，累计 9.69 rad ≈1.54 圈 | `vfx-shot-live` 11 帧采样 |
| 3 bolt 分叉 / 命中回执 | ✅，但「40~80ms 全屏闪白」与实现口径不同，如实记 | `probe-vfx-kit` 52/0 + `test-vfx13`【2】 |
| 4 领域四剪影 | ✅ 最小两两距离 150；PLAN 字面「太极/毒雾」不属领域，两组都拍 | `sheet-fields.png` + `probe-vfx-field` 19/0 |
| 5 火升 / 冰停 / 毒沉 | ✅ `ELEM_PROFILE` 三元组两两不同且 `vfx.js` 真读 | `test-vfx13`【1】 |
| 7~11 HUD | ✅ U2 已收口 | `probe-buffrow` 29/0 等 |
| 12 draw call | ✅ +3.7%（≤+25%）；**移动端 ≥30fps 转 U11 真机前置** | `vfx-bench` 186/0 + 该脚本头注释 |
| 13 低画质 | ✅ `low.decal 0 / trail false / branch 0`，零 pageerror | `probe-vfx-kit` 52/0 + `test-vfx13`【4】 |
| 14 smoke / 布局 | ✅ `ERRORS none` / 6 视口全绿 | 收口复跑 |

**另两条交接内容也给了结论**：6 套附魔近景拼版 `sheet-enchant.png` 人眼可两两分辨
（白直刃 / 橙流火 / 青霜枝 / 白绿电弧 / 绿蚀痕 / 金光栅），剑身贴图差异被角色遮挡、
几何三维度以 `probe-enchant` **60/0** 为准；`bloodrage` 本轮 `--live` 离下界最近
（1.59×，U6-3 记的是 1.26×，属浏览器进程状态浮动），构件 4 类结构不薄，
**不为它单独放大半径硬撑**（U6-3 交接条第 2 条）。

**给 U11 的新硬前置**：移动端真机 ≥30fps。本机 SwiftShader 软件渲染空场景就只有
个位数帧、Safari WebDriver 不能模拟 DPR / isMobile / hasTouch，量不出意义；
`vfx-bench.js` 头注释早就写明「帧时只报数不判红」。合 main 前必须拿真机补这一格。

## U6-5 收口记录 · 人物侧全量回归 + 推送（2026-11-14 · ✅）

**全套 40 份 node 静态契约**：38 绿 / 2 红，两支红都是环境口径，不是回归：

| 红 | 真因 | 处理 |
|---|---|---|
| `test-bosskits` 35/1「生成物与特效台不一致」 | 台账早就记过：只有 Safari 的机器上 `build-bosskits.js` 靠 `toString()` + 键顺序切源码，与 Chrome 基线差 3898 行 | **别跑 `--write`**；本轮没动任何 BOSS 侧文件，`data-bosskits.js` 最后一次改动仍是 B23（`4d48bf3`）。要在有 Chromium 的机器上验 |
| `test-save-browser` 首跑直接崩 `page.keyboardundefined` | ① 头注释写明「前提：本地起静态服务 `127.0.0.1:8123`」，没起服务 → `Game` undefined；② 门面没有 `page.keyboard`（WebDriver 无此接口） | 起服务 + 给 `_pptr` 补第六个语义（页面内合成 `KeyboardEvent`，如实标注 `isTrusted=false`）后能跑完：71/9 |

`test-save-browser` 剩的 9 条全在手机横 / 竖屏段落（「走触屏布局」判的是
`document.body.classList.contains('touch')`），是 Safari WebDriver **不能模拟
isMobile / hasTouch / DPR** 的硬限制；U6 没碰任何存档 / 布局代码，
权威的 `dev/mobile-layout.js` 6 视口仍 ✅ 全部通过。
**不为这 9 条改判据、也不改产品 CSS 去凑 Safari 桌面窗口的读数**。

**U6-4 收口那轮已跑过、本轮复核无回归的真机读数**：
`vfx-shot-live` 76/0 · `vfx-skill-vis --live` 113/0 · 默认 39/0 · `vfx-vis` 14/0 ·
`vfx-bench` 186/0（5 连放 +3.7%）· `probe-vfx-kit` 52/0 · `probe-vfx-field` 19/0 ·
`probe-enchant` 60/0 · `smoke` ERRORS none · `mobile-layout` ✅ 全部通过 ·
`build-skillvfx --check` 一致。

**推送口径**：`./push.sh` 是 **U11 合 main** 的固定动作（推 main、同步 dist），
U6-5 只做 `git push origin feat/skill-refactor` 快进推功能分支。
`origin/main` 依然一个特效文件都没有 —— **合入进度仍是 0%**，别把「推了分支」
写成「合进游戏」。

**`status.sh`**：`vfx-merge` 从 8/17 → 9/17（U6-4）→ **11/17**（U6 父节点 + U6-5）。
余下 6 个 = U7 / U8 / U9 / U10 / U11 / U12，全是 BOSS 线与合入线。

## 下一步（人物 U1~U6 全 ✅，进 BOSS 线，别跳）

1. `U7` BOSS · **老兜底 11 个手写 case 补公平性前摇**：`src/game.js:8579+` 的
   `quake / frostnova / curse` 仍当帧结算零前摇，`fireline` 还是 6 个圆串、
   `charge` 预警刷在自己脚下。开工前先量静态前摇覆盖率。
   **卡点里有一件等用户拍板**（`quake` 补前摇后倍率怎么定），先问过再动数值。
2. 之后依次 `U8` 世界 Boss 另开一层（也等拍板）、`U9` P2 小怪 / 词缀 / 生命周期、
   `U10` 逐只精修 + 兜底层局限；再 `U11` 人物合 main、`U12` BOSS 合 main。
3. 出图口径别退回去：§13 第 1 条只认 `dev/vfx-shot-live.js`（`Game.playSkillVfx`
   → SKFX 真实链路）；`dev/vfx-shot.js` 是配方层 / 回落路径尺子，判据不动。
   人眼结论看 `shots/vfx-live/sheet-*.png` 的灰度行，放大净剪影只是形状辅助。
4. 三条口径别踩：① Lv10 的 `enchant` 是**数据声明**不是播放指令，
   别去 `src/vfx.js` 补 case；② 常驻附魔走 FXK、技能演出走 SKFX，
   `vfx-skill-vis`（默认 / `--live`）都不量附魔，附魔有自己那支 `probe-enchant`；
   ③ 逐只演出构成看 `dev/audit-skillvfx.js`，改实验室后跑 `test-skillvfx-shape`。
5. 改 `src/sfx.js` **一律走生成器**：改 `docs/vfx-playground.html` →
   `node dev/build-skillvfx.js --write` → `node dev/build-skillvfx.js --check`。
   别手改生成物（`abd20ad` 修的 `hitArea` stub 就是这么来的）；
   按游戏 id 去实验室找同名条目前先查 `ALIAS`（`swords→swordarray` 等 5 条）。
6. 每个 U 收口后立刻 `git status` + 写本表状态 + commit，再进下一个。台账别攒着写。
   **合 main 用 `./push.sh`（推 main）；推功能分支用 `git push origin feat/skill-refactor`，别混。**
7. U11 / U12 之前先 `./dev/status.sh` 确认三条线各自到哪了；
   **合 main 前必须补移动端真机 ≥30fps**（见「卡点」）。

## 卡点（等拍板 / 硬前置）

- **等用户拍板 2 件**：① 世界 Boss 是另开一层还是维持现状（U8）；
  ② `quake` 补前摇后倍率 ×1.6 → ×2.0 还是接受 Boss 变简单（`BOSS-VFX-PLAN.md §6-⑤`，U7）。
- **U1 已结清 2 件**（2026-11-07，代码事实 + 实测，不再等拍板）：双演出层以
  `SKFX` 为准（口径见上节）；SKFX **不另设**面积下界，`--live` 与配方层共用
  `900 / 1500 / 2500`，113/0 全绿。
- **合 main 的硬前置**：`act-expansion` 优先级更高、先合；`skill` 必须基于「已含 act 的 main」
  重新对一遍；**两条功能线绝不互相 merge**；切分支前工作区必须干净（`branch.sh` 会拦）。
- **移动端真机 ≥30fps 未量（U6-4 新转来）**：`SKILL-VFX-PLAN.md §13` 第 12 条的另一半。
  本机只有 Safari WebDriver + SwiftShader 软件渲染，空场景就个位数帧，且门面不能模拟
  DPR / isMobile / hasTouch；`dev/vfx-bench.js` 头注释明确「帧时只报数不判红」。
  draw call 那一半已达标（5 连放 +3.7% ≤ +25%，186/0）。**U11 合 main 前拿真机补这一格**，
  别在软件渲染上凑数、也别为凑绿灯把判据改成帧时比。
- **预览站 ≠ 特效台**：`publish-preview.sh` 发的是 `main:preview/<slug>/` 分支副本，
  注入 `__pv:` 存档前缀，属于 U11/U12 的固定动作，别删注入；
  用户 2026-10-27 说的「暂不发预览站」指的是**特效台 HTML 不上线**，不冲突。
- **生成物清单**：`src/sfx.js`（人物演出）、`src/fx2.js`（BOSS 原语）、
  `src/boss-cast.js`（BOSS 施法）、`src/data/data-bosskits.js`（88 招表）——
  四个都是生成物，源文件在 `docs/*.html` 或 `dev/build-*.js`，改完必须 `--write` + `--check`。
- **`test-bosskits` 在只有 Safari 的机器上是假红，别修**（2026-11-14 实测）：
  `build-bosskits.js` 靠 `Function.prototype.toString()` + 对象枚举顺序切源码，
  Safari 与 Chrome 基线不同 —— 同一份特效台生成出来的文本差 **3898 行**、
  连 `BOSS_NATIVE` 的键顺序都变了（`treeking` 开头 → `chaos` 开头）。
  **在这台机器上跑 `--write` 会把生成物洗成 Safari 顺序**，属于 U11/U12 的 BOSS 线，
  不是 U6 的事。要验这条请在有 Chromium 的机器上跑 `node dev/build-bosskits.js --check`。
  没动过 BOSS 侧的 `docs/boss-vfx-playground.html` / `fx2` / `boss-cast`，
  `data-bosskits.js` 最后一次改动是 B23（`4d48bf3`）。
  （人物侧 `docs/vfx-playground.html` 在 U6-3 / U6-4 都改过，那是另一个文件，别混。）
- **Safari 门面已补齐 6 个语义，别再当 bug 查**（2026-11-14）：
  `_cmd()` 解包 `{value:...}`、`evaluate` 支持字符串表达式、`page.close()`、
  进程退出收 driver + 会话配对重试（U6-2）；**多语句字符串块回退 IIFE**（U6-3，
  修好 `probe-enchant` 的 `TOOLS`）；**`page.keyboard` 页面内合成 KeyboardEvent**
  （U6-5，让 `test-save-browser` 能跑完而不是第四节 TypeError）。
  剩下的是硬限制：无控制台日志接口（靠 `__errbuf`，页面加载期收不到）、
  无无头模式、无 CDP、不能模拟 DPR / isMobile / hasTouch，
  合成按键 `isTrusted=false`（IME / 系统快捷键场景仍须 Chromium）。
  **`test-save-browser` 因此在本机 71/9，9 条全在触屏布局段** ——
  不是产品回归，`mobile-layout.js` 6 视口全绿；别改判据也别改 CSS 去凑。
  另外它**要求先起静态服务** `127.0.0.1:8123`（头注释写明），不起就 `Game undefined`。
  **串跑多个 Safari 会话会偶发假红**（`probe-sfx-align` 串跑 9/1、单跑 10/0），
  任何失败项必须单跑复核才算数。
  `vfx-vis` 的 ring 曾经在 Safari 下 0 像素，已由 `FX.ring` y `0.08→0.16` 修好
  （见 U6-3 收口记录），**不是**门面的锅，别回退那处改动。
- **判据会过期**：`vfx-skill-vis` 已因 B20 双演出层返工过一次（17/21 假红）；
  U1 又因 SwiftShader 冷启动读到半帧返工一次（`iceshard` 1401~1897 来回跳，
  靠「暖机 + `gl.finish()`」压到 1604~1607 稳定）。合 main 前若再动演出层，
  先确认尺子量的是谁、读的是不是完整一帧，再谈数字涨跌。
- `probe-skill-p5b` 的 11/2 **已结清**（2026-11-09）：不是时序抖动，是
  `iceshard` 飞弹 `onHit` 在低帧率序列里晚于 450ms 窗口；`WAIT.iceshard = 1700`
  后连跑 4 次 13/0，判据未改。另记一条**通用口径**：连着启五个浏览器时
  `vfx-skill-vis` 默认会跳 27/12 这类冷启动假红，单跑两次均 39/0 ——
  批量串跑只用来粗筛，任何失败项必须单跑复核后才算数。
