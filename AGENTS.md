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
| 世界结构（卷/章/图/营地/门禁） | `src/data/data-world.js`（`PARTS`/`ACTS`/`CAMPS` + `campOfMap`/`campsUpToPart`/`isChapterTail`/`nextChapterMap`） |
| 任务数据（主线/支线/悬赏） | `src/data/data-quests.js`（`QUESTS` + `questMapOpen`/`questsOfPart`/`questByLegacyId`/`giverOfNpc`/`partOfGiver`） |
| 任务运行时（接取/进度/复命/任务区域/迁移） | `src/quests.js`（`QuestSys`）。`game.js` 里的 `acceptQuest`/`questReady`/`turnInQuest`/`onKill` 只是转发，别再往里写业务 |
| 营地场景 / 路标石 / 章间出口门 | `src/world.js`（`buildMap` 末尾建 `waystone`/`gate`）+ `src/game.js`（`travelTo` 门禁、`updateInteract`/`interact`） |
| 山河图（传送面板） | `src/ui.js` 的 `openTravel`/`renderWorldMap` + `index.html` 的 `.wm-*` |

## 5. 回归脚本（改完必跑）

```bash
node dev/smoke.js            # 三职业开局冒烟，零 pageerror 才算过
node dev/test-quest.js       # 任务系统：接取/进度/复命/任务区域/悬赏板/老档迁移/UI 接线（44 项）
node dev/zone-check.js       # 区域数据：越界/连通/重叠/落点/刷怪（纯 node，不启浏览器）
node dev/mobile-layout.js    # 6 视口 × 10 页签：键位重叠/出屏/裁切/可滚性
node dev/live-check.js       # 线上能否开局（推完 30~60s 后跑）
node dev/mobile-layout.js --live   # 线上版布局回归
node dev/preview-check.js --url <预览地址>   # 预览站：能开局 + 资源不越界 + 存档隔离
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
- **章间出口门挂「本章最后一张已开放图」**（`isChapterTail`），不是图位最后一个 ——
  落霞坡这类 `id: null` 的图位没有实体地图，门挂上去永远不出现。
- **营地按卷累积解锁**（`campsUpToPart`），和 `save.js` 的 `normalizeDoc` 同一口径。
  只 push 当前卷的话，「等级跳卷三」会让 campB 永远解锁不了，而重开档后又突然冒出来。
- 营地**故意没有 elder**：q1~q11 整条链挂在桃源村村长身上，营地再摆一个 elder 会让任务对话指错地方。
  M2 起改成「一营一个掌事 + 一个录事」，桃源村掌事仍是老村长（`NPC_ALIAS` 别名）。

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

## 7. 当前状态

- 线上版本：见 `git log -1`。
- **进行中**：大地图扩展 `feat/act-expansion` —— M0（三层结构 + schema v3）、M1（5 营地 + 路标石 +
  章间出口门）、M2（任务系统：35 条任务 + 任务区域 + 悬赏板 + 老档迁移）已完成，
  下一步 M3 地图扩容。进度与卡点看 `docs/status/act-expansion.md`。
  方案在 `docs/ACT-EXPANSION-PLAN.md`；§14 的 7~10 项仍未拍板，但都不挡 M3。
- **暂停中**：技能系统重构（12 技能 → 4~5 个功能位 + 元素混搭 + 发射数量成长）。
  完整方案在 `docs/SKILL-REDESIGN-PLAN.md`，用户已拍板 10 项决策，**等他说开工**。
  不要主动实施；排期在大型扩展合入 main 之后。

## 8. 记忆与日志

- 详细逐日开发日志：`.workbuddy-ai/memory/YYYY-MM-DD.md`（append-only）。
- 长期项目约定：`.workbuddy-ai/memory/MEMORY.md`。
- **这个目录在 `.git/info/exclude` 里，不进 git**（仓库是公开的 Pages 站点）。
  换电脑 / 重新 clone 后日志不会跟过来 —— 本文档（`AGENTS.md`）就是精简版兜底，
  保持它的时效性。如果日志里出现了必须跨机器保留的东西，搬到本文档里。
