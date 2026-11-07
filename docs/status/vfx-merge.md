# 技能特效 · 统一收口与合入计划（人物 + BOSS）

- 分支：`feat/skill-refactor`
- 用户口径（2026-11-07）：**两边没做完的合并成一份计划，不要分开**；
  后面**依次**把「人物技能特效」→「BOSS 技能特效」都合进游戏（main / 正式站）。
- 本文件是**唯一待办清单**。`docs/SKILL-VFX-PLAN.md` / `docs/BOSS-VFX-PLAN.md`
  降级为设计参考（形色分离、判定形状对应预警、验收定义都还照它们读），
  但**不再往那两份里加待办、也不再按它们的 V0~V6 / P0~P2 编号排期**。
- 进度事实看这两份：`docs/status/skill-refactor.md`（人物主线）、
  `docs/status/boss-kits.md`（B 线 B1~B25）。本文件只管「还差什么、按什么顺序合」。
- 更新：2026-11-07

> 当前：两条线的特效代码都已在 feat/skill-refactor 跑通，但 origin/main 一个特效文件都没有；统一计划已建立，按 U1 → U12 依次收口，人物先合、BOSS 后合。

## 一句话现状

**代码写完了，没进正式线。** 人物侧地基 / 15 条剪影 / 45 套台阶 / 30 个接线 / 双演出层 /
可见度与预算全绿；BOSS 侧 B1~B25 全 ✅、88 招 0 空招 0 报错。
但 `git rev-list --count origin/main..HEAD` = **100**，
`src/fx-kit.js` / `vfx.js` / `sfx.js` / `fx2.js` / `boss-cast.js` 在 origin/main **一个都不存在**。
所以「合进游戏」不是继续写特效，是**补完欠账 → 按固定动作合 main → 推上线**。

## 完成度盘点（2026-11-07，按代码 + 台账实算，不按 PLAN 勾选）

| 线 | 完成度 | 已完成 | 未完成 |
|---|---|---|---|
| 人物技能特效 | **约 80%** | V0 地基（14 格图集 + 12 原语，全带 `FX.q` 降级）、配方 DSL v2（15 剪影 × 形/色/时 + `ELEM_PROFILE` 6 套）、P4 三职业 ⑤ 签名、P5 台阶 45/45、P5b ①~④ 位 30 个 case 接线、B20 玩家侧 37 只 `src/sfx.js`、V2/V3/V3b 可见度、双演出层适配（`abd20ad`）；15 位 × 4 档 ≤6 draw call、五连放 +3.6%；契约 dsl 343 / kit 58 / p5 974 / p5b 116 / p4 60 | U1~U6（见下表） |
| BOSS 技能特效 | **约 85%** | B1~B25 全 ✅（B2 已推翻不计）：45 只 × 5 格 = 88 招、18 个原语进 `src/fx2.js`、`src/boss-cast.js` 接进 `bossPattern`（四拍 + 每第 5 轮压轴）、B22 地面暗底、B23 竖向兜底（43 招有高度）、B24/B25 变形层 180 条 / 10 种应对轴；真机 15/15、88 招 0 空招 0 报错 | U7~U10（见下表） |
| 合入 | **0%** | 无 | U11 / U12 |

> 口径：两份 PLAN 是 10-27 / 10-28 的旧方案，都还写着「待拍板 · 未动一行代码」，
> 实际工作走的是台账里的 V0/P4/P5/P5b/V2/V3 和 B1~B25，那条路已经把 PLAN 的主体做掉了。
> `SKILL-VFX-PLAN.md §13` 的 14 条验收清单至今**一条没勾**（全 `[ ]`），
> 有实测数据但没有逐条判据结论 —— 这是「全绿 ≠ 做完」的同一个坑（见 `skill-refactor.md` 2026-11-02 章）。

## 统一节点表

> 顺序即用户拍的板：**人物先，BOSS 后**。U1~U6 与 U7~U10 是各自补欠账，
> U11 / U12 是两次独立的合 main；U12 必须基于「已经含 U11 的 main」重对一遍。

| 编号 | 节点（前缀 = 归属） | 状态 | 落点 / 产物 | 验收 |
|---|---|---|---|---|
| U1 | 人物 · **SKFX 真实链路收口**：空招 `blizzard` / `antidote`；偏淡 7 只 heal 270 · bloodrage 303 · avatar 1330 · talisman 1034 · talismanarrow 1060 · whitetiger 1357 · whirl 2400；给 SKFX 定自己的面积下界；定「配方层 / SKFX 谁为准」 | ⬜ | `docs/vfx-playground.html`（源）→ `node dev/build-skillvfx.js --write` → `src/sfx.js`；`dev/vfx-skill-vis.js --live` | `--live` 零空招、零异常；下界写进台账 |
| U2 | 人物 · **V1 HUD 增益条整块没动**：`#buffbar` 仍有 6 处、`buffrow` 0 处、`data-buff-icons.js` 无、`renderBuffs` 仍 `innerHTML` 全量重建（每 100ms 闪一次）。要搬到血条下、16 枚符号图标、增量 diff、叠层结构化 `×N`、`#trialHud` 避让、200ms 淡出 | ⬜ | `index.html` / `src/ui.js` / `src/mobile.js` / 新建 `src/data/data-buff-icons.js` | PLAN §13 第 7~11 条 + `node dev/mobile-layout.js` |
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

## 下一步（从 U1 开始，别跳）

1. `U1` 先定双演出层口径：**`Game.playSkillVfx` 现在是 SKFX 优先、有就不播配方**，
   配方层只在没手搓实现时兜底。要定的是「以后改技能特效，改 `docs/vfx-playground.html`
   还是改 `data-vfx.js`」——不定这条，U1 的空招 / 偏淡改完会和 U6 的逐条配方打架。
2. 改 `src/sfx.js` **一律走生成器**：改 `docs/vfx-playground.html` →
   `node dev/build-skillvfx.js --write` → `node dev/build-skillvfx.js --check`。
   别手改生成物（`abd20ad` 修的 `hitArea` stub 就是这么来的）。
3. U1 收口后立刻 `git status` + 写本表状态 + commit，再进 U2。台账四段别攒着写。
4. U11 / U12 之前先 `./dev/status.sh` 确认三条线各自到哪了。

## 卡点（等拍板 / 硬前置）

- **等用户拍板 4 件**：① 双演出层谁为准（U1）；② SKFX 的面积下界定多少（U1，
  本轮明确没替 B20 线定标准）；③ 世界 Boss 是另开一层还是维持现状（U8）；
  ④ `quake` 补前摇后倍率 ×1.6 → ×2.0 还是接受 Boss 变简单（`BOSS-VFX-PLAN.md §6-⑤`，U7）。
- **合 main 的硬前置**：`act-expansion` 优先级更高、先合；`skill` 必须基于「已含 act 的 main」
  重新对一遍；**两条功能线绝不互相 merge**；切分支前工作区必须干净（`branch.sh` 会拦）。
- **预览站 ≠ 特效台**：`publish-preview.sh` 发的是 `main:preview/<slug>/` 分支副本，
  注入 `__pv:` 存档前缀，属于 U11/U12 的固定动作，别删注入；
  用户 2026-10-27 说的「暂不发预览站」指的是**特效台 HTML 不上线**，不冲突。
- **生成物清单**：`src/sfx.js`（人物演出）、`src/fx2.js`（BOSS 原语）、
  `src/boss-cast.js`（BOSS 施法）、`src/data/data-bosskits.js`（88 招表）——
  四个都是生成物，源文件在 `docs/*.html` 或 `dev/build-*.js`，改完必须 `--write` + `--check`。
- **判据会过期**：`vfx-skill-vis` 已因 B20 双演出层返工过一次（17/21 假红）。
  合 main 前若再动演出层，先确认尺子量的是谁，再谈数字涨跌。
- `probe-skill-p5b` 串跑五个浏览器偶发 11/2、单跑连三次 13/0，属时序抖动，
  合 main 前单跑确认即可，别为此改判据。
