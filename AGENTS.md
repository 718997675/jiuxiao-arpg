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
- **clone 完先 `git config core.autocrlf false`**：仓库里是 LF，Windows 默认把它转成 CRLF，
  而 `dev/test-skill-*.js` 里不少契约是**按 `\n` 写的正则**（切 case 块、抓 SKILL_BEH 登记），
  CRLF 下会莫名其妙假红（实测 p2b 739 条里红 4 条）。已经转了的话：
  `git rm -r --cached . -q && git reset --hard`。
- 跑 puppeteer 脚本必须带环境变量：
  ```
  NODE_PATH=C:/Users/Administrator/.workbuddy-ai/binaries/node/workspace/node_modules
  ```
- headless 启动参数固定：`--no-sandbox --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`
- 本地临时起 HTTP 服务（测 http 语义时用）：`python -m http.server 8765 --bind 127.0.0.1`
  （`dev/test-save-browser.js` 固定用 8123，起服务要用后台任务，不能用 `&` 挂——shell 退出会带走它）
- 部分探针会把截图写到 `/tmp/xxx.png`，在 Windows 上解析成 `D:\tmp`，先 `mkdir -p /d/tmp`。

## 4. 改动入口速查

| 要改什么 | 动哪里 |
|---|---|
| 数值平衡（伤害/经验/掉落/移速…） | `src/data/data-core.js` 的 `BALANCE` |
| 属性封顶（暴击率、冷却缩减 = 100%） | `src/items.js` 的 `STAT_CAPS` |
| 主菜单 / 行囊 / 天赋 / 设置 UI | `src/ui.js` |
| 术法（技能树、变体） | `src/ui-skills.js` |
| 技能实际行为 / 被动 | `src/skill-beh.js` / `src/skill-passive.js` |
| 元素定义 / 元素反应 | `src/data/data-elem.js`（表）+ `src/game.js` 的 `tryElemReaction` / `applyElemReaction`。**反应挂在 `damageEnemy` 一个口上**，别去各技能 case 里加 |
| 元素注入（技能位注火/冰/雷/毒，单 / 双元素） | `src/data/data-elem.js` 的 `SKILL_INJECT`（`at` 单元素门槛 / `subAt` 混搭门槛 / `split` 70-30）/ `skillInjectSplit` / `skillCanInject` + `src/game.js` 的 `skillInjectPack`（注入包）与 `injectSegs`（拆段）。**`castSkill` 只开窗口，投射物靠 `FX.projectile` 的 `inj` 自己带** |
| 元素增伤词缀（统一 / 专属两层） | `src/data/data-elem.js` 的 `ELEM_AFFIX`（通用 `elemDmg`）/ `ELEM_AFFIX_EX`（专属）/ **`elemAffixMul`（唯一出口）**。加新词条走 `data-items.js` 的 `AFFIXES`；**别再写第二处 `1 + st[键]/100`** |
| 手机端摇杆、键位、面板滚动 | `src/mobile.js` + `index.html` 的 `@media` |
| 手机横向树排版 | `src/ui-mtree.js` |
| 存档 / 设置持久化 | `src/core/save.js` / `src/core/settings.js` |
| 仓库（储物箱）/ 材料仓 / 套装收藏柜 | `src/core/stash.js`（存储）+ `src/game.js` 的 `stashXxx` / `setXxx`（业务）+ `src/ui.js` 的 `renderStash`（面板）。**入口是村里的仓管 NPC，不是菜单** |
| 崩溃兜底、错误页 | `src/core/boot.js` |
| 角色纸娃娃建模 | `src/charforge.js` / `src/skel.js` |
| 地图生成 | `src/world.js` |
| 试炼模式 | `src/trial.js` |

## 5. 回归脚本（改完必跑）

```bash
node dev/smoke.js            # 三职业开局冒烟，零 pageerror 才算过
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

## 7. 当前状态

- 线上版本：见 `git log -1`。
- **进行中**：技能系统重构（12 技能 → 5 个功能位 + 元素混搭 + 1→10 台阶）。
  方案在 `docs/SKILL-REDESIGN-PLAN.md`，进度台账在 `docs/status/skill-refactor.md`
  （**开工前先读台账，那里有逐位进度与 60 条踩坑**）。
  当前：P0 / P1a-d / P2a 完成，**P2b 已收口（15/15 位、45/45 条）**——
  三个 ⑤ 位各自是「一只技能 + 一整套状态机」（刀客兵形 / 法师法相 / 道士灵兽）。
  **P2c 已收口**：精进轨道（11~20 十格 + 「精进 x/20」+ 渐进披露）、
  **Lv15 精通三选一（烈 / 疾 / 省）**、**Lv20 最终精通「归一」（三条各 60% 叠加）**、
  **光效随等级变亮（10 级 ×1.00 → 20 级 ×1.22）** 四件全部落地。
  前三层全走 `effSkillMods` 的 mods 通道，**零新 beh 键**；光效那层走
  `skillFxAmp()` → `FX.setAmp()`，**只乘亮度 / 不透明度 / 粒子数，不乘半径** ——
  光效圈是判定的视觉契约，画大了就是谎报范围（契约里有正反两条断言钉着）。
  **别顺手加新机制**，那会把 P2c 变成第二个 P2b。
  **P3a 已落地**：元素反应 **6/10**（蒸汽爆裂 / 等离子 / 焚毒 / 感电冻结 / 腐霜 / 腐蚀链）。
  触发口径是「**目标身上已有 A 元素状态 + 这一下带 B 元素**」，不依赖元素注入；
  表在 `src/data/data-elem.js`，结算在 `damageEnemy` 一个口，三道闸门
  （`silent` / `react` / `_reacting`）+ 双层 ICD（0.5s 全局 · 2s 同目标）。
  **圣系 4 组没做**（引擎里 `sigil` 只是伤害类型，没有状态位，面板上明说）。
  **P3b 单元素注入已落地**：①②③⑤ 位可注火 / 冰 / 雷 / 毒（④ 增益槽不给注），
  门槛**角色 20 级**，附加比例跟**技能有效等级**走（10 级 30% → 20 级 50%）。
  口径是「**附加不转换**」：原伤害 100% + 附加 X%，两段各过自己的抗性与元素词缀。
  三级取值 `opts.inj → _proj.inj → _elem`；**延迟落点 / dot / 召唤物不注入**（已拍板）。
  注入元素可当反应源（`elemReactReady` 的 `altElem`，命中元素优先）。
  **P3c 元素词缀统一已落地**：随机词缀 12 条（火/冰/雷/毒各 3 阶）并成
  「**元素伤害 +X%**」3 条，全元素通用（含符法）；老档按 **1:1 相加**折算
  （火 20 + 冰 10 → 元素 30，只增不减）。另留**元素专属**通道
  （被动 高压/毒经/符力、符文之语 雷引/炎心、命格固有），两层**叠乘**。
  道途面板补上元素增伤 6 行。**折算只能跑在 `normalizeItem` 的 `STATS[key]` 过滤之前**，
  否则就是静默删玩家词缀（契约有源码顺序断言钉着）。
  **P3d 双元素混搭已落地**：境界 **40 级**解锁第二元素（不能与主元素相同，
  摘主元素时副元素一起走）。**总量不变**，按主 70% / 副 30% 拆两段
  （50% → 35% + 15%），两段各过自己的抗性与元素增伤；与命中元素相同的段
  自动剔除。反应按「命中元素 → 主 → 副」顺序试（`elemReactReady` 的 `altElem`
  收数组）。视觉只加一簇注入元素色火星（8 + 4 颗），**技能本体光效不换色** ——
  FX 是全局的，换色会连敌人技能和血一起染，而且会让玩家以为元素被转换了。
  **P3 到此收口**（反应表 6/10 + 单/双元素注入 + 词缀统一）。
- **待拍板**：大地图扩展（12 章 / 80 怪 / 24 首领 / 12 营地 + 任务网 / 5 类地下城 × 5 阶钥匙）。
  方案在 `docs/ACT-EXPANSION-PLAN.md`（2026-10-27 草案，**未动代码**）。
  §14 有 10 项待拍板，**拍板前不要开工**。

## 8. 记忆与日志

- 详细逐日开发日志：`.workbuddy-ai/memory/YYYY-MM-DD.md`（append-only）。
- 长期项目约定：`.workbuddy-ai/memory/MEMORY.md`。
- **这个目录在 `.git/info/exclude` 里，不进 git**（仓库是公开的 Pages 站点）。
  换电脑 / 重新 clone 后日志不会跟过来 —— 本文档（`AGENTS.md`）就是精简版兜底，
  保持它的时效性。如果日志里出现了必须跨机器保留的东西，搬到本文档里。
