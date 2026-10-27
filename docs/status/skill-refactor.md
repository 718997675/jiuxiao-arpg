# 技能重构 · 任务台账

- 分支：`feat/skill-refactor`（优先级 **低**，排在大型扩展之后）
- 计划文档：`docs/SKILL-REDESIGN-PLAN.md`（16 节）
- 预览站：还没发（要发就 `./dev/publish-preview.sh feat/skill-refactor`）
- 更新：2026-10-27 21:35 · P0b 只读展示

> 当前：**P0 完成**（数据骨架 + 面板/说明页只读展示，260 条断言全绿）；
> 战斗、存档、键位、动作条仍是老逻辑 —— 这是有意的，P0 要能单独验证不影响手感。
> 下一步 P1：把动作条真正收敛到 5 格。

## 一句话现状

新版重构（5 个功能位、三线并行、1→10 台阶、元素自选）**数据已落地、面板与说明页已能看、玩法未切**。
老的一轮（36 技能 × 3 变体 / `SKILL_TREE.branches`）**跑得好好的，一点没动**，两套数据并存。
P1 起才动 `SKILL_BAR_SLOTS` 与面板的三列树。

## 节点表

> 阶段划分来自 `docs/SKILL-REDESIGN-PLAN.md` §10。

| # | 节点 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| D0 | 方案 + 10 项决策拍板 | ✅ | `docs/SKILL-REDESIGN-PLAN.md` | `c938dd7` |
| P0a | 纯数据骨架：`SKILL_ARCHETYPE`（5 槽 × 职业）、`SKILL_TIERS`（1→10 台阶 + 分段倍率）、`SKILL_TREE.lineMeta` + 三线并行读取（`reqLv` / `needPts`）、`dev/test-skill-p0.js` | ✅ | `data-skills.js`、`data-skill-tree.js`、`dev/test-skill-p0.js` | 见 git log |
| P0b | 面板/说明页只读展示新结构（既不动键位也不动战斗） | ✅ | `src/ui-skills.js`（`skArchHTML`）、`src/ui.js` 第七节 | 见 git log |
| P1 | 槽位收敛：8 → 5，键位改左键 + 1~4，老存档迁移；技能树面板从「串行树」改为「三列并行 + 等级锁」 | ⬜ | `SKILL_BAR_SLOTS`、`SKILL_TREE.layout`、save、mobile、UI | — |
| P2 | 等级台阶：5 → 10 级，数量/形态台阶接进 `castSkill`，点数供给同步 | ⬜ | `src/game.js`、`src/skill-beh.js` | — |
| P3 | 元素注入 + 反应表：伤害管线支持双元素、特效混色、词缀口径 | ⬜ | 战斗 + 词缀 + `src/fx.js` | — |
| P4 | 三职业独立 ⑤ 号位：刀客兵形/刃势、法师法相、道士召唤 | ⬜ | `src/fx.js`、`src/charforge.js` | — |
| P5 | 形态进化表现：5 槽 × 3 职业 × 3 段 = 45 套 | ⬜ | `src/fx.js`、模型 | — |
| P6 | 平衡、洗点、老档兼容回归 | ⬜ | — | — |

## 下一步（P1，危险面最大，先读三个卡点）

槽位真正收敛：**8 格 → 5 格**，键位改左键 + 1~4，老存档迁移。这一步会动到存档，别急：

1. **先对账**：`skillArchInherit(cls)` 已经列出每个职业 5 个位继承的全部现有技能；
   P1 要保证「没被任何位继承的现有技能」有明确处置（并入某位 / 降级为变体 / 删掉），
   不能留下「树上还在、动作条放不上」的孤儿。
2. `SKILL_BAR_SLOTS` 8 → 5，`bindInput` 的 1~8 改 1~4（左键已经是普攻）。
3. `src/core/save.js`：老档 8 格收敛到 5 格 —— **先看 act 的 schema 落地没**（卡点 2），
   并遵守拍板 #4：全退技能点 + 免费重投，已投点数一分不少。
4. 面板：`skillLines()` 换掉 `skillTreeNodes()`，三列并行 + `reqLv` 等级锁 + 关键被动
   `needPts` 软前置；`skillForkOf` 的二选一逻辑一并删掉（别留第二套真相）。
5. 验收：`node dev/test-skill-p0.js`、`dev/test-save.js`（老档迁移）、
   真机 `dev/probe-skill-arch.js` + 新增一条「8 格老档 → 5 格」的迁移探针。

## 卡点

1. **优先级**：`AGENTS.md` §2.3 规定 act 先合 main，skill 后合。用户 2026-10-27 明确
   「开始技能重构」，故本条线已开工，但**发版仍排 act 之后**。
2. **`src/core/save.js` 三方争用**：main 的 M7、act 的 `world.act`、本计划的技能点/元素字段
   都要改 `normalizeDoc`。P0 刻意不碰存档，P1 动 8→5 槽之前先看 act 的 schema 落没落地。
3. **宠物系统不在本计划内**：仓库里没有任何宠物文件，本计划不创建它。
4. **两套数据并存**：`SKILL_TREE.layout` 的 `spine`/`forks` 与新的 `skillLines()` 同时存在。
   P0/P0b 期间面板仍读旧的；P1 切面板时**必须把旧读取口一起收掉**，别留成
   「改了没反应」的第二套真相（上一轮 `SKILL_SPECIALS` 就是这么烂掉的）。

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-10-27 | 5 个功能位替代 12 技能平铺，键位统一左键 + 1~4 | 8 格 × 2 套 = 16 格 > 12 技能，没有取舍；第 6 个之后按不到 |
| 2026-10-27 | 三职业各自独立内容，⑤ 号位不可互换 | 刀客近战 / 法师远程 / 道士持续伤害，机制本来就不同 |
| 2026-10-27 | 技能树改**三线并行**（暗黑 4 式），取消串行 + 二选一 | 串行点错一条线就锁死构筑 |
| 2026-10-27 | 等级 1→10 基础，词条推到 20；曲线分段 8% / 4% / 2% | 20 级 × 8% 会到 2.52 倍，再乘数量轴会爆 |
| 2026-10-27 | 元素为**附加**（原伤害保留 + 元素 30~50%），不是转换 | 转换会推翻所有现有词缀 |
| 2026-10-27 | ④ 增益槽不提供元素注入入口 | 增益槽注入元素没有语义 |
| 2026-10-27 | 刀客 ⑤ 改「兵形/刃势」，不产生独立单位 | 避免和道士召唤、将来的宠物系统撞车 |
| 2026-10-27 | 老档迁移：全退技能点 + 免费重投 + 一次免费元素重选 | 已投点数一分不少，避免老玩家吃亏 |
| 2026-10-27 | 方案 §3.2 里法师 ① 的 `talisman` **归道士** | 五雷符本来就是道士技能；一个技能不能同时占两个位，否则 P1 收敛有歧义 |

## 变更记录

### 2026-10-27 · P0a 数据骨架

- `src/data/data-skills.js` 尾部新增三块：
  - `SKILL_ARCHETYPE`：5 个功能位元数据（键位 / 冷却量级 / 元素开关）+ 三职业各 5 位内容
    （标题、`inherit` 现有技能、1/3/5/7/9/10 六段台阶文案）。刀客 ⑤ 带三种刀式 + 断岳斩 + 剑神降世；
    法师 ⑤ 是主元素法相（`mainElemOnly`）；道士 ⑤ 标注「技能产物，非宠物」。
  - `SKILL_TIERS`：10 级台阶表 + 分段曲线（8/4/2%）+ 圆满/精进标签。
  - `skillLvMul(lv)` / `skillTierStep(lv)` / `skillArchList(cls)` / `skillArchSlot(cls,no)` /
    `skillArchInherit(cls)`。
- `src/data/data-skill-tree.js`：
  - `SKILL_TREE.lineMeta = { softNeedPts: 5, reqLvFrom: 'skill.unlock' }`。
  - 三线并行读取：`skillLineNodes` / `skillLines` / `skillLineNodeInfo` / `skillLineSpent` / `skillNodeGate`。
    **`reqLv` 默认取主动技能的 `unlock`**（单一事实来源），需要特殊门槛才在 layout 条目上写 `reqLv` 覆盖。
  - 新接口故意不返回「上一个节点」，并行模型里不存在硬前置。
- `dev/test-skill-p0.js`：226 条契约。含反向断言「`skillLvMul` 不许出现在 game.js / ui-skills.js / save.js」，
  P2 接线时这条会主动变红提醒改注释。
- 未接线：`SKILL_LV_MAX` 仍 5、`SKILL_LV_STEP` 仍 0.08、`SKILL_BAR_SLOTS` 仍 8，战斗零改动。
- 验证：`node dev/test-skill-p0.js` 226/0 · `node dev/test-items.js` 17/0 ·
  `node dev/test-save.js` 79/0 · `node dev/smoke.js` 三职业各 265 次施法、`ERRORS none`。

### 2026-10-27 · P0b 只读展示

- `src/ui-skills.js` 加 `skArchHTML()`：术法面板顶部一块 **默认折叠** 的
  「新版技能位 · 5 格预览」。展开是 5 张卡（槽号 + 键位 + 标题 + 台阶 6 条 + 现继承/身份），
  不绑任何事件、不接管点击；文案全部读 `SKILL_ARCHETYPE` / `SKILL_TIERS`。
  卡窄，长文案补了 `title` 悬停看全文。
- `index.html`：`.sk-arch` 一套样式（折叠条 / 5 列网格 / 台阶按 kind 上色）；
  `max-width:820px` 下改两列 —— 手机实测 2 列、每张 163px、零重叠。
- `src/ui.js` 第七节「术法与变体」加两行：**技能位（新版预览）**
  （5 个键位 + 三职业各 5 位小牌）、**等级台阶（新版预览）**（六个台阶 + 分段曲线 + 20 级 2.02 倍）。
  两行都写明「本版只展示，动作条仍是 8 格」，避免玩家以为已经改了键位。
- `dev/probe-skill-arch.js`（新，29 条）：面板默认折叠 / 5 卡 6 台阶 / 键位左键+1~4 /
  桌面一行不重叠 / 三职业 ⑤ 分别是兵形·元素法相·召灵兽 / 说明页两行都在 /
  加点仍然生效 / 手机两列零重叠 / 零控制台报错。
- `dev/test-skill-p0.js` 的边界断言改成**分侧**：战斗与存档不许读 `SKILL_ARCHETYPE` /
  `skillLvMul`，但面板与说明页**必须**读（否则「说明页跟着数据变」只是空话）。230 条全绿。
- 踩坑：把 `probe` 的视口从桌面切到手机时页面会整页重载回标题页，`Game.state` 为空、
  `renderSkillPanel` 直接 return，于是量到「空的 #skList」。探针里补了「不在局内就点开始」。
- 验证：`test-skill-p0` 230/0 · `test-items` 17/0 · `test-save` 79/0 ·
  `smoke` ERRORS none · `probe-skill-arch` 29/0。
