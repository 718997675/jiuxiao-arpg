# AGENTS.md — 九霄·山海录 交接文档

> 给 AI 助手 / 新加入的开发者看。读完这一份就能接着干。
> 更细的逐日开发日志在 `.workbuddy-ai/memory/YYYY-MM-DD.md`（**不进 git**，见文末）。

---

## 1. 项目速览

纯静态 3D 中式暗黑 ARPG。**无构建、无依赖、无后端、无素材** —— 贴图是 Canvas 程序化生成，
角色是几何体拼的，音效是 WebAudio 现场合成。`file://` 双击能玩。

- 入口：`index.html`（所有 CSS 内联在 `<style>`，脚本用 `<script src>` 顺序加载）
- 源码：`src/` 约 2.3 万行，29 个 JS 文件
- 第三方：`lib/three.min.js`（r128，唯一依赖）

## 2. 部署（用户明确指定，不要改）

**唯一正式地址：<https://718997675.github.io/jiuxiao-arpg/>**

- GitHub Pages 从 `main` 分支**根目录**发布，**推 main 即上线**，30~60 秒生效。
- 仓库没有 `dist/`，根目录就是站点根目录。**`.nojekyll` 必须保留**（否则 `_` 开头的文件会被吞）。
- 发布：`./push.sh "提交信息"` → 语法检查 → `git add -A` → commit → `git push origin HEAD`
- 旧的 `*.app.workbuddy.host/?sharecode=...` **已废弃**，不要再往里发。
- Pages 有 CDN 缓存。脚本里都加了 `?t=<时间戳>` 绕缓存；人工验证没效果先强刷。

### 2.1 分支预览（不影响正式站）

**做法：`main` 的 `preview/<slug>/` 子目录。** 正式站根目录一个字节都不动。

```bash
./dev/publish-preview.sh                        # 当前分支 → preview/<分支名>/
./dev/publish-preview.sh feat/act-expansion     # 指定分支
./dev/publish-preview.sh --list                 # 看已有预览
./dev/publish-preview.sh --rm act-expansion     # 下线
./dev/publish-preview.sh feat/act-expansion --dry   # 只在本地生成，不提交
node dev/preview-check.js --url <预览地址>       # 回归：能开局 + 资源不越界 + 存档隔离
```

- 地址形如 `https://718997675.github.io/jiuxiao-arpg/preview/act-expansion/`
- **为什么是子目录而不是「分支自动发布」**：Pages 项目站点**只有一个发布源**（main 根），
  没有任何设置能让分支 X 发布到子路径。子目录是唯一能做到「同域名、不同 path、不碰正式站」的办法。
- **代价几乎为零**：副本与根目录文件内容相同，git 按 blob 去重，仓库不会真多 8MB。
- **存档必须隔离**：预览站和正式站**同源**，不隔离的话在预览站玩一局会覆盖正式站进度。
  `dev/preview-inject.js` 给副本的 `index.html` 注入 `localStorage` 前缀 `__pv:`，
  并把 `<title>` 改成 `[预览] ...`。**别删这段注入**，也别忘了它只作用于副本。
- 预览目录内容由脚本生成，**不要手改**；改了分支重新跑一遍脚本即可。

### 2.2 多分支并行（换机器 / 换账号后怎么接着干）

一条线一个分支，`main` 是正式线。**用户只要说「继续做 act 那条」就够了**，
助手照下面的流程走，不用用户记命令。

```bash
./dev/branch.sh              # 看全貌：当前分支 / 每条线落后 main 多少 / 有没有预览站
./dev/branch.sh act          # 切到名字含 act 的分支（模糊匹配，唯一命中才切）
./dev/branch.sh main         # 切回正式线
./dev/branch.sh --sync       # 把 main 合并进当前分支（分支放久了补工具/补修复）
./dev/branch.sh --new fix/x  # 从当前分支拉一条新线
```

**切分支的硬规则**

1. **先提交再切**。工作区有未提交改动时 `branch.sh` 会直接拦住 —— 否则改动会被带到另一条线上，
   下次提交就混进错误的提交里。拦住了就 `./push.sh "…"` 或 `git stash`。
2. **`preview/` 目录只属于 main**。切到别的分支时它会消失，这是正常的：预览站是 main 上的静态副本，
   跟你在哪个分支无关。
3. **分支要定期 `--sync`**。分支放久了会缺 main 上新加的东西（比如新脚本、数值修复），
   表现就是「这条线上跑 `./dev/publish-preview.sh` 提示找不到文件」。
4. **预览站永远从 main 发**：`./dev/publish-preview.sh <分支>` 内部会切到 main 提交，然后切回来。

**换机器 / 换账号后的第一步**

```bash
git clone https://github.com/718997675/jiuxiao-arpg.git && cd jiuxiao-arpg
git fetch origin                 # 分支都在远程，clone 完就全能看到
./dev/branch.sh                  # 一眼看清有哪几条线、各自状态
./dev/branch.sh act              # 切过去继续
```

**唯一不跟着走的是 `.workbuddy-ai/memory/`**：它在 `.git/info/exclude` 里，不进 git
（仓库是公开的 Pages 站点，日志不能公开）。换机器后日志不会自动出现，所以：
- 跨机器必须保留的信息，写进本文档（`AGENTS.md`），不要只写在日志里；
- 新机器上照常往 `.workbuddy-ai/memory/YYYY-MM-DD.md` 追加，本地日志从当天开始即可。

### 2.3 三条线：main / act-expansion / skill-refactor

| 分支 | 定位 | 优先级 | 合并方向 |
|---|---|---|---|
| `main` | 正式线，线上地址就是它 | — | 只接收合并 |
| `feat/act-expansion` | 大型扩展：5 卷 12 章 30 图 + 营地任务网 + 地下城 | **高** | → `main` |
| `feat/skill-refactor` | 技能重构：三职业独立体系 + 元素混搭 + 20 级成长 | 低 | → `main` |

**四条硬规矩**

1. **两条功能线各自从 `main` 同步，绝不互相 merge。**
   交叉合并会把另一条线没做完的东西带进来，出问题极难定位是哪儿来的。
2. **合并顺序按优先级**：`act` 先合，`skill` 后合。
   `skill` 合的时候必须基于「已经包含 act 的 main」重新对一遍，不能拿老 main 当基准。
3. **合 main 前的固定动作**：`./dev/branch.sh --sync` → `node dev/smoke.js` + `node dev/mobile-layout.js`
   → `./dev/publish-preview.sh <分支>` 看预览站 → 才合。
4. **一次只在一个分支上改。** 切分支前工作区必须干净（`branch.sh` 会拦），
   否则未提交的改动会被带到另一条线上，下次提交就混进错误的提交里。

> 历史分支（`dev-v2` / `dev-v3` / `feat/art-modeling` / `feat/skill-refactor`(旧) / `fix/hpbar-and-difficulty`
> / `fix/mobile-input-bugs`，共 6 条，2026-10-27 清理）已全部删除。它们都是 v1.0.x 时代的旧线，
> 与现在的代码差了 20+ 个提交，没有合并价值。

### 2.4 任务台账（**每完成一个小节点就必须写**，用户 2026-10-28 明确要求）

> 「每次完成一个小节点要记录下来，我换账号要继续做。」

**进度必须落在仓库里。** 用户会换机器 / 换账号接着干，聊天记录和本地日志都跟不过去。

```bash
./dev/status.sh                              # 不切分支，直接看三条线各自到哪了
cat docs/status/act-expansion.md             # 细看这条线的节点表 / 下一步 / 卡点
```

| 文件 | 管什么 |
|---|---|
| `docs/status/<分支slug>.md` | 分支台账，一分支一份：`main.md` / `act-expansion.md` / `skill-refactor.md` |
| `docs/status/<专题>.md` | 插单大块活另开一份：`world-boss.md`（M18 世界 Boss，同分支） |
| `docs/status/README.md` | 格式约定与「换账号怎么接上」的完整说明 |

**硬规矩**

1. **每完成一个能跑的小节点，当场写台账 + commit**，别攒。攒着写一定漏掉「当时为什么这么选」。
   小节点 = 一张图 / 一个机制 / 一个 bug 修复 / 一份计划文档，都算。
2. **必填四段**：`> 当前：xxx` 一行（纯文本，不要 `**` 粗体）+ 节点表 + 下一步 + 卡点。
   缺一段就等于没交接。状态符号只认 `✅ 🔄 ⬜ ⏸ ❌`。
3. **分工别搞混**：台账写「**做到哪了**」（进 git，跨账号可见）；
   `.workbuddy-ai/memory/` 写「**踩了什么坑**」（不进 git，本机）。两者不重复。
4. **commit 管「代码到哪了」，台账管「计划到哪了」**。只 commit 不写台账 = 下个账号看到一堆
   提交但不知道哪些是计划内的、下一步该干嘛。

## 3. 开发环境

- 用户在 **Windows** 上开发。仓库早期在 macOS 写的，部分 `dev/*.js` 仍硬编码 macOS Chrome 路径。
- **新增脚本用 `require('./_chrome')`** 取浏览器路径（`dev/_chrome.js` 跨平台探测）。
- 跑 puppeteer 脚本必须带环境变量：
  ```
  NODE_PATH=C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace/node_modules
  ```
- headless 启动参数固定：`--no-sandbox --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`
- 本地临时起 HTTP 服务（测 http 语义时用）：`python -m http.server 8765 --bind 127.0.0.1`

## 4. 改动入口速查

| 要改什么 | 动哪里 |
|---|---|
| 数值平衡（伤害/经验/掉落/移速…） | `src/data/data-core.js` 的 `BALANCE` |
| 属性封顶（暴击率、冷却缩减 = 100%） | `src/items.js` 的 `STAT_CAPS` |
| 主菜单 / 行囊 / 天赋 / 设置 UI | `src/ui.js` |
| 术法（技能树、变体） | `src/ui-skills.js` |
| 技能实际行为 / 被动 | `src/skill-beh.js` / `src/skill-passive.js` |
| 手机端摇杆、键位、面板滚动 | `src/mobile.js` + `index.html` 的 `@media` |
| 手机横向树排版 | `src/ui-mtree.js` |
| 存档 / 设置持久化 | `src/core/save.js` / `src/core/settings.js` |
| 仓库（储物箱）/ 材料仓 / 套装收藏柜 | `src/core/stash.js`（存储）+ `src/game.js` 的 `stashXxx` / `setXxx`（业务）+ `src/ui.js` 的 `renderStash`（面板）。**入口是村里的仓管 NPC，不是菜单** |
| 崩溃兜底、错误页 | `src/core/boot.js` |
| 角色纸娃娃建模 | `src/charforge.js` / `src/skel.js` |
| 地图生成 | `src/world.js` |
| 试炼模式 | `src/trial.js` |
| 世界结构（卷/章/图/营地/门禁） | `src/data/data-world.js`（`PARTS`/`ACTS`/`CAMPS` + `campOfMap`/`campsUpToPart`/`isChapterTail`/`nextChapterMap`/`nextMapInWorld`） |
| 任务数据（主线/支线/悬赏） | `src/data/data-quests.js`（`QUESTS` + `questMapOpen`/`questsOfPart`/`questByLegacyId`/`giverOfNpc`/`partOfGiver`） |
| 任务运行时（接取/进度/复命/任务区域/迁移） | `src/quests.js`（`QuestSys`）。`game.js` 里的 `acceptQuest`/`questReady`/`turnInQuest`/`onKill` 只是转发，别再往里写业务 |
| 营地场景 / 路标石 / 图间出口门 | `src/world.js`（`buildMap` 末尾建 `waystone`/`gate`）+ `src/game.js`（`travelTo` 门禁、`updateInteract`/`interact`） |
| 山河图（传送面板） | `src/ui.js` 的 `openTravel`/`renderWorldMap` + `index.html` 的 `.wm-*` |
| 小地图 | `src/ui-minimap.js`（`Minimap.draw`）。`ui.js` 的 `drawMinimap` 只是转发，别再往那边写 |
| zone 拓扑 / 骨架 / 刷怪分配 | `src/data/data-maps.js` 的 `ZONE_ARCHETYPES` + `MAP_SPECS` + `buildZones`/`suggestSpawnTotal` |
| 地貌（地表贴图 + 道具撒点） | `src/world.js`：`_makeGroundTexture` 的 `conf` 表 + 裂缝/雪粒/水纹分支；`buildMap` 里 `cfg.props` 的 `else if` 链 |
| 首领落点 | `src/data/data-maps.js` 的 `bossPosOf(mapId, bossId, idx)`。**不要再往 `MAP_BOSS_POS` 里加坐标**，那是老图的表 |
| 出口门落点 / 开门时机 | 落点 `src/data/data-maps.js` 的 `gatePosOf(mapId)`（boss 区最深处）；时机 `src/game.js` 的 `mapCleared`/`markCleared` + `src/world.js` 的 `makeExitGate` |
| 世界 Boss 骨架（六套程序化巨兽 + 动画 + morph） | `src/wbmodels.js`（`WBModels`：`build`/`anim`/`setMorph`/`setTails`/`setGhost`）。三条硬约定：①按**真实米数**建、`group.scale===1`、返回 `noAutoScale`（数据里的 `scale:4.6~5.6` 是给 2 米人形的旧口径，再乘一次就是 238 米的蛇）②`parts.torso` 必须是**内层 group**（`updateActorAnim` 无条件写它，指根节点会抹掉世界坐标）③碰撞半径由 `body.radius` 夹住 `measureFootR`。材质 `metalness` 一律 ≤ 0.45（没有环境贴图，高了渲成黑块） |
| 世界 Boss 战斗（三阶段 / 18 招牌技能 / 场地 / 定身 / 格挡 / 现身） | `src/worldboss-fight.js`（`WBFight`：`ai`/`cast`/`_enterPhase`/`_applyEnter`/`_revealTick`/`tick`/`clear`）。**不走 `bossPattern()` 的 patterns 池**（那是八部天龙共用的招式池，撞上就等于「又一只八部」）；阶段字段先进 `_resetCombat` 打回基线再重算，否则 P3 会带着 P2 的盾。`enter` 加新键必须先写进 `dev/check-worldboss.js` 的 `ENTER_KEYS`，否则脚本会红。现身节奏（`REVEAL_EVERY/DUR/HIDE_MUL`）是常量，**别写成无敌** |
| 世界 Boss（数据 / 刷新 / 通知 / 星标 / 领域 / 掉落） | 数据 `src/data/data-worldboss.js`（`WORLD_BOSSES` 6 只 + `WORLD_BOSS_CFG`）；运行时 `src/worldboss.js`（`WorldBoss`：`ensure`/`rollNext`/`sync`/`tick`/`onKill`/`grantLoot`/`makeAura`/`domainTick`）。**不要把世界 Boss 写进 `MAPS[mapId].bosses`** —— 那张表是常驻首领，读档会被 `spawnBosses` 反复重生。领域压制写**独立字段**（`Game.domSlow`/`domAspd`），别并进 `playerSlow`/`poisonT`，否则出圈算不清该清多少。掉落走 `Game.spawnLoot`（别直接写背包），传世用 `opts.rarity='unique'`（用 `pool` 会被法器/命格那两个 2% 入口截胡），落点推到 `body.radius+1.5` 米外（否则埋在 44 米的模型里捡不到） |
| 八部天龙（8 魔将 + 八印 + 终门） | 数据 `src/data/data-monsters.js` 的 `bafo_*`（`resist` 一个 −60 洞 + `stagger` + `patterns`）+ `dev/check-bafo.js`。**与世界 Boss 是互斥的两套语言**，见 `V2-ROADMAP.md` §18.7 |

## 5. 回归脚本（改完必跑）

```bash
node dev/smoke.js            # 三职业开局冒烟，零 pageerror 才算过
node dev/test-quest.js       # 任务系统：接取/进度/复命/任务区域/悬赏板/老档迁移/UI 接线（44 项）
node dev/quest-ref.js        # 任务表引用完整性：map/zone/boss/monster/skill/next/require + 主线链可走通
node dev/zone-check.js       # 区域数据：越界/连通/重叠/落点/刷怪（纯 node，不启浏览器）
node dev/zone-density.js     # 面积/密度：§5.1 的 16000~24000㎡、380~450㎡/只、40~56 只、max/min≤1.6
node dev/m3-check.js         # 全部骨架图的数据层 + 10 张抽样实测（落点/首领/小地图/37 只怪帧率）
node dev/mobile-layout.js    # 6 视口 × 10 页签：键位重叠/出屏/裁切/可滚性
node dev/live-check.js       # 线上能否开局（推完 30~60s 后跑）
node dev/mobile-layout.js --live   # 线上版布局回归
node dev/preview-check.js --url <预览地址>   # 预览站：能开局 + 资源不越界 + 存档隔离
node dev/check-worldboss.js  # 世界 Boss 数据层：抗性平坦 / 三阶段 / 领域 / 掉落 / **与八部去重**（1152 项）
node dev/worldboss-run.js    # 世界 Boss 运行时：30 分钟轮转（时间打桩）、击杀冷却、跨会话、存档往返（76 项）
node dev/worldboss-loot.js   # 世界 Boss 掉落：必掉件数 × 四难度 / 120 次大样本全传世 / 材料符文世界魂区间 / 落点在模型外 / 幂等 / onKill 接线（191 项）
node dev/worldboss-live.js   # 世界 Boss 浏览器实测：实体/光环/横幅/星标/真实击杀链路/六种领域效果（可加 --shot 截图）
node dev/worldboss-fight.js  # 世界 Boss 战斗层（离线）：阶段边界 / 7 种 shape 命中与否 / 场地 / 定身 / enter 消费点 / 接线断言（252 项）
node dev/worldboss-battle-live.js  # 世界 Boss 战斗层（浏览器）：阶段播报 / 预警结算 / 正面格挡 2.5 倍 / 战吼 8 秒归位 / 分身 / 定身 / 九尾展开 / 真身现身 3.3 倍 / 毒沼换图清场
node dev/check-wbmodels.js   # 世界 Boss 六套骨架（真 three，离线）：尺寸贴数据 / 剪影两两可分 / 面数与材质 / 120 帧动画 / morph / setTails / setGhost（182 项）
node dev/wbmodels-shot.js    # 六套骨架渲图到 shots/wbm-*.png，人工肉眼验收剪影
node dev/check-seals.js      # 魔将之印（离线 111 项）：八印表 / 印↔将↔图三向对齐 / 终门门槛 / 真装载 game.js 调 onBossKill / 老档与脏值 / 存档三段（导出·归一·unpack）/ README 殿名比对
node dev/seal-live.js        # 魔将之印（浏览器 19 项）：真 DOM 播报 / 真 localStorage / 刷新后 Game.loadSlot(n) 读回仍 8 枚
node dev/input-keys.js       # 键盘与输入框（浏览器 21 项）：三框 autocomplete=off / e.key===undefined 不崩 / 打字不点亮游戏按键 / 打字不触发热键
node dev/probe-boss.js       # 首领（浏览器 22 项）：技能距离闸 / 脱战回位 / 血条归属（打谁看谁）/ 招式落点夹取。P02 P09 必跑
node dev/minimap-check.js    # 小地图（离线 + 浏览器 23 项）：四方向箭头 / 缩放锚点 / 点开放大 / 拖动 / Esc 关闭。P03 必跑
node dev/respawn-check.js    # 地图内补位（浏览器 14 项）：清空后回填 / 上限 / 距离 / 只补野图 / 任务量对齐。P01 必跑
node dev/trial-check.js      # 试炼（离线 53 项）：等级乘区 / 经验衰减 / 传世掉落概率表 / 运行时接线。P12 必跑
```

## 6. 踩过的坑（改之前先看一眼，能省几小时）

### 移动端

- **`touchmove` 无条件 `preventDefault()` 会让所有面板滚不动**。`mobile.js` 里按落点分流：
  `e.target.closest('.panel.open, #dialog, .dlg-box, #setCodexPanel.open')` 命中就放行，
  否则才拦（防页面整体橡皮筋）。双指时一律拦。
- **`flex-shrink` 必须是 0**：术法页左栏 `.sk-left{flex:0 0 auto;max-height:62%}`。
  写成 `flex:1 1 ...` 时，长说明书卡会反过来把技能树压成一条缝。
- **`scrollTop` 还原要放在树渲染之后**。先还原的话左栏还没被内容撑起来、容器是"满高"的，
  `scrollTop=150` 会被夹成 25。
- 手机 vs PC 的分流条件是 `MTREE.isMobile()`（触屏 或 `innerWidth < 900`）。
  走手机分支时给面板挂 `tree-dom` 类，PC 的轮盘 canvas 一行不动。
- `100vh` 在 iOS Safari 上不准（地址栏）。用 `--app-h/--app-oy/--app-ox` CSS 变量，
  由 `visualViewport` 写入。

### 布局 / CSS

- `.vb` 是**各容器内单独定义**的，全局没有。新按钮请用全局 `.btn`，否则退化成原生白按钮。
- sticky 按钮行要**实底背景**，渐变半透明会让背后文字透上来。

### 横向树（`src/ui-mtree.js`）

- 列 = 依赖深度，取**最长路径**（不是最短，否则支线会跟主干挤到同一列）。
- 超过 `maxCols`(6) 列就**蛇形折行**（奇数段反向）。不反向的话换行那根线会横穿整屏。
- 无依赖节点（协同系 8 枚隐藏星位）必须走网格密排，否则排成一条 90×664 的竖线。
- 坑：`Object.assign({}, G, cfg)` 会把 `G.tile`（数字 66）覆盖成 `tile` 回调 → 坐标全 NaN。
  只白名单拷贝 `tile/colW/rowH/paint/maxCols` 这几个数字字段。

### 错误兜底（`src/core/boot.js`）

- `Script error.`（无文件名无行号）= 跨域脚本错误。本站脚本全部同源（无 CDN/Worker/eval），
  这类错误只可能来自**浏览器自己注入的脚本** —— 典型是 iOS Safari 点「分享」按钮、
  生成「添加到主屏幕」快照。**只记控制台，不出错误页**（限定 http/https；
  `file://` 下照常报，免得本地调试被静默吞掉）。
- 游戏已在跑（`Game.running && Game.state`）时出错 → 只弹 toast（同一条 5 秒去重），继续玩。
  只有还没开局才出全屏错误页。
- `webglcontextlost` **不要立刻判死刑**。Safari 弹分享面板 / 切 App 经常丢一次上下文，
  关掉后自己就回来。给 4 秒宽限，`webglcontextrestored` 到达就收起错误页。

### 世界结构 / 营地（M1 之后）

- **`spawnNPCs()` 必须读 `MAPS[mapId].npcs`**。曾经写死 `MAPS.village.npcs` + `loadMap` 里
  `if (mapId === 'village')`，结果 campB~E 的 `cfg.npcs` 写了等于没写（实测营地里 0 个 NPC）。
- **野图门禁不能严格「仅限已抵达」**。25 个图位是 `id: null`、卷二整卷没图，
  野图一旦只允许去已抵达的卷，玩家打完玄铁矿洞就无路可走。所以只有**营地**这一层严格收口
  （`travelTo` 里看 `state.camps`），野图仍是「等级够 或 去过」。M3 补完图再收紧。
- **图间出口门挂「顺着走的下一张图」**（`nextMapInWorld`）：先看**本章内**的下一张
  （幽篁林 → 落霞坡），本章走完才跨到下一章首图（落霞坡 → 血月沼泽）。
  M1 那版只给章尾挂门（`isChapterTail`），结果一章里第 2 张起的图 —— 落霞坡 / 沉骨滩 /
  玄铁矿洞 / 万剑坑 …… 在游戏里**根本没有入口**，上一张图走不过去，只能翻山河图。
  计划书 §3.6 的原话是「章的边界是门，不是按钮」。
- 门的三条边界：**卷末章不出门**（回营地走大传送门）、**终章 `linear:false` 不出门**
  （混沌海是枢纽，8 张副本走坛上的 8 道门 + 8 印开终门）、`id: null` 的图位跳过。
- **出口门立在首领区最深处**（`gatePosOf`，`data-maps.js`）：boss 区圆心以北 0.62×可用半径，
  离区界留 4.2 米。**不要放回入口旁** —— 入口已经有传送阵 + 路标石，再挤一扇门玩家分不清；
  而且一进图就能穿门跳过整张地图。骨架的约定是「入口在南（+z），首领场在北（−z）」。
- **门要等本图首领第一次倒地才出现**（`Game.markCleared` + `state.mapCleared[mapId]`）：
  进图时没打过就只记落点（`world.gatePending`），首领倒地那一瞬间由 `makeExitGate`
  当场立在 boss 区（带闪光 + 日志）；之后永久存在，存档里记 `world.mapCleared`，
  重进图 / 重开页面都还在。`world.js` 的两个出生时机必须共用 `makeExitGate`。
  老档由 `save.js:normalizeDoc` 用 `bossKilled` 反推（偏差方向是「多给门」，可接受）。
- 门和传送阵只差 0.72 缩放、长得几乎一样 → **门上必须挂名牌**（`→ 目标图名`）。
- **`ui.js:renderQuests` 的 `wbCard` 必须在「无任务」分支之前取**。`const` 写在分支后面时，
  任务全交完再打开山海志会读到 TDZ 直接抛 `Cannot access 'wbCard' before initialization`。
- **营地按卷累积解锁**（`campsUpToPart`），和 `save.js` 的 `normalizeDoc` 同一口径。
  只 push 当前卷的话，「等级跳卷三」会让 campB 永远解锁不了，而重开档后又突然冒出来。
- 营地**故意没有 elder**：q1~q11 整条链挂在桃源村村长身上，营地再摆一个 elder 会让任务对话指错地方。
  M2 起改成「一营一个掌事 + 一个录事」，桃源村掌事仍是老村长（`NPC_ALIAS` 别名）。

### 地图骨架（M3 之后）

- **新图不要手写 zone 坐标**。在 `MAP_SPECS` 里写 `{ archetype, size, ground, kinds, names }` 一行即可，
  坐标由 `buildZones` 按 `R = size × 0.47` 展开。手写 12 个区 = 手写 40 个数字，25 张就是 1000 个。
- **骨架坐标一律用 R 为单位**，不要写米。写米的话换 size 就有一半区越界。
- **相邻区必须「有面积地重叠」**，不能相切。这一批 8 个骨架里有 4 个（canyon/terrace/twin/ring）
  第一版全部踩了相切：矩形边对边摆，探针立刻报「不可达」。经验值：重叠 ≥ 0.05R 才安全。
- **刷怪数不手填**。`suggestSpawnTotal()` 从 `ARCHETYPE_COVERAGE` 反推，因为每种骨架的可走覆盖率
  差很多（cross 23.5% / twin 19.6%），同一张 size 下差 3000㎡；手填同一个数必然一半偏密一半偏稀。
- **`size` 不要低于 285**。§5.1 的「面积 ≥16000㎡」和「密度 380~450㎡/只」在更小的尺寸下数学上互斥
  （骨架只覆盖 21%）。`node dev/zone-density.js --advise` 会给每种骨架算出合法区间。
- **刷怪要轮转，不能按区顺序刷**。同屏上限 PC 36 / 触屏 28，而一张图 40~56 只 ——
  按区顺序刷会把截断全落在最后几个区（后殿 + 首领场），北半边变空图。
- **62 米外的怪 AI 每 3 帧才走一次**（`updateEnemies` 里的 `aiSkip`）。加这个分支时**不要动 `dt`**，
  它是形参，改了会污染下一只怪；debuff 计时器在插入点之前就已结算，不需要补帧。
- **`isles` 是唯一一个首领区不叫 `sanctum` 的骨架**（它叫 `nave` / 祭岛）。任务、传送、调试里
  按 id 找首领区在 isles 图上会静默失效 —— 一律用 `zones.find(z => z.kind === 'boss')`。
- **改了骨架的区数/形状，必须重测 `ARCHETYPE_COVERAGE`**。它直接决定 `suggestSpawnTotal` 的推导值；
  M3b 给 twin 补了两个区（10 → 12），覆盖率从 0.1963 涨到 0.2128，忘了改的话新 twin 图会稀 8%。
- **`MAPS[id].portal` 必须落在入口 zone 内**，而 `twin` 的 `gate` 偏在 `x = −0.26R` ——
  所以 `cloudbridge` 的 `portal.x` 是 `−37` 而不是 0。`zone-check` 会逐张校验这一条。
- **回归脚本里的等级要给够**。卷四/卷五的图 `unlock` 是 48~59，脚本写 `level = 40` 时
  `travelTo` 会**静默失败**（玩家留在上一张图，不抛异常），后面的断言全部拿错图的数据去比，
  报出来是「出生点不在任何 zone 内」这种看不懂的错。`m3-check` 现在有一条 `mapId === mid` 的总闸。
- **地貌道具是 `cfg.props` 上的一条 `else if` 链**（`village`/`bamboo`/`swamp`/`mine`/`abyss`/
  `heaven`/`snow`/`bone`/`void`/`flood`/`trial`）。加新地貌 = `_makeGroundTexture` 的 `conf` 表一行 +
  `BORDER_COL` 一行 + 这里一条分支，**不要新开贴图生成函数**（缓存按 type 做，已经够用）。
- **道具几何优先用「固定尺寸 + `scale`」**。`boxGeo/sphGeo/coneGeo/cylGeo` 都按参数做缓存键，
  写成 `sphGeo(RND(0.9,1.3), 6)` 会让缓存无限增长；`scale.set(...)` 不占缓存。

### 任务系统（M2 之后）

- **任务只记「目标图 + 区域」**，图没做出来就由 `questMapOpen` 过滤掉。M3 补图不用回来改任务表。
- **老档迁移认 `legacyId`**（`QUESTS.m*` 上的 `legacyId: 'q1'`）。`QUEST_LEGACY_OBJECTIVES` 是
  v1.9.x 那一刻 q1~q11 的目标快照，**不要改它** —— 改了老档进度会被判成「结构变了」而清零。
- **任务区域倍率必须回收**。`QuestSys.activeZones` 只返回「进行中且未达成」的任务，
  复命 / 放弃之后自然不再返回；别在别处缓存这个结果，缓存了就会留下永远多怪的图。
- **`spawnNPCs` 的坐标表要加新 id**。发布者共用老村长那一对坐标（-7,2 / -14,6），
  同一张图上不会同时出现两个营地的发布者，所以共用不会打架。
- **`travelTo` 的 `loadMap` 在 120ms 之后**。写回归脚本时 `Object.keys(Game.npcs)` 必须等这个延迟，
  紧跟 `travelTo` 取到的是上一张图的 NPC（空数组）。

### 进度类字段（印 / 星标 / 已通关）

- **新增一个「进度类」字段要同时改四处**：`Game.newState`（新档）→ `SaveManager.normalizeDoc`（补字段 + 夹脏值）
  → 导出白名单（`pack` 里的 `char` / `world` 段）→ **`unpack`（读档回 flat state）**。
  只改前三处时，**盘上明明有、刷新后读回来是空** —— M7.4 的 `seals` 就漏了 `unpack` 一行，
  离线脚本打桩全绿，浏览器里「打完八只魔将 → 刷新 → 印全没了 → 终门又锁死」。
  验读档一律用 `Game.loadSlot(n)`，**不要点标题页的 `#startBtn`** —— 那是「新建角色」，会占用下一个空槽。
- **进度物别塞进掉落表**。印这类「不能卖 / 不能丢 / 不能重复拿」的东西走 `state.seals` 布尔位，
  在 `Game.onBossKill` 里一次性写入；走掉落表反而要额外处理背包满 / 分解 / 重复。
- **门槛数字只能有一个来源**。终门写 `sealNeed: 8`，印表 `BAFO_SEALS.length` 也是 8 ——
  `check-seals` 里有硬断言把两者钉在一起，改印数忘了改门槛会红。

### 键盘 / 输入框

- **`e.key` 可能是 `undefined`**，必须 `(e.key || '').toLowerCase()`。Chrome 在输入框的
  「历史输入」下拉里点选、安卓软键盘、部分输入法都会发这种 keydown/keyup。
  直接 `.toLowerCase()` 抛 TypeError，被 `boot.js` 兜成「山海未开 · 运行出错」整页卡死
  （2026-10-28 用户报的就是这个：道号框点一下弹旧名字、再点一次就报错）。
- **所有文本输入框都要 `autocomplete="off"`**（+ `autocorrect="off" autocapitalize="off"
  spellcheck="false"`），否则浏览器会给道号框弹历史输入下拉 —— 玩家以为「游戏记住了我的名字」。
- **热键判断要在「有没有在打字」之后**，并且判断条件用
  `INPUT / TEXTAREA / contentEditable` 三者，别只认某个 id。只挡 `#nameInput` 时，
  在仓库搜索框里打 `h` 会弹说明页、在存档面板道号框里打 `i` 会切行囊。
- **`keys[k] = true` 必须写在输入框判断之后**。写在前面时，在道号框里打 `w` 会真的让角色往前走。

## 7. 当前状态

- 线上版本：见 `git log -1`。
- **大地图扩展已合入 `main`（2026-10-28）**：M0~M6 全完（三层世界结构 + 5 营地 + 任务系统 +
  8 种 zone 骨架 + 39 张图 + 60 级上限 + 5 阶地下城 + 传世 40 件 + 套装 18 套），
  M18 世界 Boss 九节全完（六只 / 三阶段 / 六套骨架 / 掉落 / 说明页）。
  **M7 终章重做进行中**：M7.1 结构 / M7.2 八魔将 / M7.4 魔将之印 已落地，
  剩 M7.3 破绽窗口 + M7.5~M7.9。进度与卡点看 `docs/status/act-expansion.md`，
  世界 Boss 看 `docs/status/world-boss.md`。`feat/act-expansion` 分支保留作续做线。
- **暂停中**：技能系统重构（12 技能 → 4~5 个功能位 + 元素混搭 + 发射数量成长）。
  完整方案在 `docs/SKILL-REDESIGN-PLAN.md`，用户已拍板 10 项决策，**等他说开工**。
  排期在大型扩展合入 main 之后 —— 现在这个条件已经满足。
- **打磨第 1 批已完成（2026-10-28）**：`docs/POLISH-PLAN.md` 的 P01 P02 P03 P09 P11 P12 P16 七项
  （补位刷怪 / 首领距离闸 + 脱战 / 小地图箭头 + 大图 / 血条归属 / 悬赏交付人 / 试炼等级难度 + 经验衰减 +
  传世挂高波 / 符文掉率）。新增 4 个验收脚本（`probe-boss` / `minimap-check` / `respawn-check` / `trial-check`）。
  **第 2 批（P06 P10 P04 P07 P08 P17）未开工** —— P06 与 P10 必须一起做（都是战斗数值）。

## 8. 记忆与日志

- 详细逐日开发日志：`.workbuddy-ai/memory/YYYY-MM-DD.md`（append-only）。
- 长期项目约定：`.workbuddy-ai/memory/MEMORY.md`。
- **这个目录在 `.git/info/exclude` 里，不进 git**（仓库是公开的 Pages 站点）。
  换电脑 / 重新 clone 后日志不会跟过来 —— 本文档（`AGENTS.md`）就是精简版兜底，
  保持它的时效性。如果日志里出现了必须跨机器保留的东西，搬到本文档里。
