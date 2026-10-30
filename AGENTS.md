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
- **用 Python / 脚本批量改文件时必须 `newline=''`**。默认文本模式会把 `\r\n` 读成 `\n`、
  写回时再按 `os.linesep` 变成 CRLF —— 整个文件的行尾被静默翻掉，
  表现就是 `dev/test-skill-*` 里按 `\n` 写的正则大面积假红（实测 p2b 893/4，
  报的全是「case 块没读 sextra」这种八竿子打不着的条目）。修法：
  `io.open(p,'r',newline='')` 读、`io.open(p,'w',newline='')` 写，改完 `git diff --stat` 一眼能看出。
- 部分探针会把截图写到 `/tmp/xxx.png`，在 Windows 上解析成 `D:\tmp`，先 `mkdir -p /d/tmp`。

## 4. 改动入口速查

| 要改什么 | 动哪里 |
|---|---|
| 数值平衡（伤害/经验/掉落/移速…） | `src/data/data-core.js` 的 `BALANCE` |
| 属性封顶（暴击率、冷却缩减 = 100%） | `src/items.js` 的 `STAT_CAPS` |
| 主菜单 / 行囊 / 天赋 / 设置 UI | `src/ui.js` |
| 术法（技能树、变体） | `src/ui-skills.js` |
| 技能实际行为 / 被动 | `src/skill-beh.js` / `src/skill-passive.js` |
| 元素定义 / 元素反应 | `src/data/data-elem.js`（表）+ `src/game.js` 的 `tryElemReaction` / `applyElemReaction`。**反应挂在 `damageEnemy` 一个口上**，别去各技能 case 里加。圣系靠**圣印** `e.sigilT` 判状态（`SIGIL_MARK`，`sigil` 命中盖 6 秒、`opts.react` 不盖）；**`ELEM_STATUS` 的键序就是优先级，圣必须排最后**（道士符箓全是 `sigil`，排前面会把火+冰整组吃掉） |
| 元素注入（技能位注火/冰/雷/毒，单 / 双元素） | `src/data/data-elem.js` 的 `SKILL_INJECT`（`at` 单元素门槛 / `subAt` 混搭门槛 / `split` 70-30）/ `skillInjectSplit` / `skillCanInject` + `src/game.js` 的 `skillInjectPack`（注入包）与 `injectSegs`（拆段）。**`castSkill` 只开窗口，投射物靠 `FX.projectile` 的 `inj` 自己带** |
| 技能光效 / 领域（剑阵·太极·毒雾·符阵） | `src/fx.js`（`FX.field` 四剪影 + `fieldTexture` 五张贴图；`FX.amp` 只许乘亮度，**不许乘半径**） |
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
node dev/test-vfx-field.js   # 领域四剪影：源码契约（半径不听亮度 / 贴图缓存 / 逐帧不 new）
node dev/probe-vfx-field.js  # 领域四剪影：真机部件构成 + 回收 + 4 张截图
node dev/audit-tiers.js      # 面板欠账审计：三个职业还剩几档「待」
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
  **P3a 已落地（10/10）**：元素反应 **6 组元素互碰**（蒸汽爆裂 / 等离子 / 焚毒 /
  感电冻结 / 腐霜 / 腐蚀链）+ **4 组圣系**（净化烈焰 / 圣霜 / 天罚 / 解毒雾）。
  触发口径是「**目标身上已有 A 元素状态 + 这一下带 B 元素**」，不依赖元素注入；
  表在 `src/data/data-elem.js`，结算在 `damageEnemy` 一个口，三道闸门
  （`silent` / `react` / `_reacting`）+ 双层 ICD（0.5s 全局 · 2s 同目标）。
  圣系的前提是 **圣印**（`e.sigilT`，`sigil` 命中盖 6 秒印记，只刷新不叠加，
  `opts.react` 的伤害不盖印）。**圣在 `ELEM_STATUS` 里排最后** —— 顺序即优先级，
  道士的符箓系全是 `sigil`，圣印是常驻底色，排前面会把「火 + 冰」整组吃掉。
  圣系收益落在**玩家身上**（回血 / 护盾 / 对亡灵与首领增伤），全部当场结算，
  **不开窗口 buff** —— 面板看不见的增益等于没做。
  **P3b 单元素注入已落地**：①②③⑤ 位可注火 / 冰 / 雷 / 毒（④ 增益槽不给注），
  门槛**角色 20 级**，附加比例跟**技能有效等级**走（10 级 30% → 20 级 50%）。
  口径是「**附加不转换**」：原伤害 100% + 附加 X%，两段各过自己的抗性与元素词缀。
  三级取值 `opts.inj → _proj.inj → _elem`；**延迟落点 / dot / 召唤物不注入**（已拍板）。
  注入元素可当反应源（`elemReactReady` 的 `altElem`，命中元素优先）。
  **P3b 本身没有欠账**：当初这一项尾巴上挂着「双元素 + 词缀统一」两块，
  后来拆成 P3c / P3d 各自收口了 —— 看到 P3b 就只看单元素注入，别再去找剩余。
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
  **P3 到此收口**（反应表 10/10 + 单/双元素注入 + 词缀统一）。
  **P2b 补收尾（2026-10-30）**：面板上最后 6 档「待」清零 —— 刀客 ② 的 Lv3「溅射」
  走 `mods.radius`（范围技的溅射只能是半径变大）、Lv7「三连震」走**本体台阶**
  `SKILL_TIER_BODY`（天崩本来就震三次，不该硬塞进 `SKILL_TIER_EVO` 给 quake 加行为）；
  剑阵 3/7「双圈 / 三圈」走**同心多层剑气环**（`SKILL_RING_STEP` 42% 外扩，
  内 100 / 中 85 / 外 72%，一只怪只吃它所在那一层）。逃生口
  `SKILL_TIER_BODY` 有四道闸门（位号 / 文案 / 可见档 / evo 与发数都表达不了），
  契约钉住 —— **别把没做的档往里一塞就完事**。
  面板卡区说明改成读「待」的存量：零欠账时说「全部已接入」，不再挂欠账期的话术。
  **特效移植已开工（2026-10-30）**：`FX.field` 四剪影（法阵 / 太极 / 雾 / 剑阵）进游戏，
  接入剑阵、天师符阵、蚀骨毒雾、太极玄阵 4 处。**半径一律由调用方按判定半径传**，
  `FX.amp` 只乘亮度不乘半径（契约里 `R * this.amp` 一处都不许有）。
  其余原语（`spr` / `trail` / `bolt` / `shock` / `decal`）**仍是 0** ——
  下一步按 `SKILL-VFX-PLAN §12` 走 V0（图集 + 五个原语），再谈签名特效。
- **待拍板**：大地图扩展（12 章 / 80 怪 / 24 首领 / 12 营地 + 任务网 / 5 类地下城 × 5 阶钥匙）。
  方案在 `docs/ACT-EXPANSION-PLAN.md`（2026-10-27 草案，**未动代码**）。
  §14 有 10 项待拍板，**拍板前不要开工**。

### 7.1 执行顺序（2026-10-30 拍板，**按序做，不要跳**）

| 序 | 做什么 | 状态 |
|---|---|---|
| 1 | **P6 回归**：平衡 + 洗点 + 老档兼容 | ✅ 收口（查出三个存档 bug，见 §7.2） |
| 2 | **合 main**（`feat/act-expansion` 的 5 个尾巴先合） | 进行中 |
| 3 | **V0 特效地基**：图集 + `spr`/`trail`/`bolt`/`shock`/`decal` | 待做 |
| 4 | **P4**：三职业 ⑤ 号位完整表现 | 待做 |
| 5 | **P5**：45 套形态进化表现（建在 V0 上） | 待做 |

**为什么不先做 P4/P5**：本线落后 main **72 个提交 / 184 个文件 / +7.4 万行**，
其中 `game.js`(+980)、`ui.js`(+548)、`items.js`(+70) 正是本线改得最凶的三个文件；
而 act 已经合进 main（只剩 5 个 polish 提交），「act 先合」的阻塞已解除 ——
**这是最好的合并窗口，越拖越贵**。P4/P5 主要动 `fx.js` / `charforge.js`，晚合不痛；
且 P5 必须建在 V0 上，否则 45 套全是「缩放 + 换色 + 撒粒子」，等于明码标价的返工。

### 7.2 技能账本与存档：三条铁律

P6 一轮回归抓出三个「不报错、不崩、玩家的东西无声消失」的 bug，成因都是
**同一个东西在两处各写一遍**。下面三条是防复发的。

**① 技能账本只有两类字段，界线是「花不花技能点」**

| 类 | 字段 | 洗点 / 退还时 |
|---|---|---|
| 花点的 | `lv`（投入等级 1~10）、`p`（取向） | 清掉（`lv` 归 1） |
| 免费的 | `v`（旧变体）、`f`（新变体）、`m`（精通）、`el` / `el2`（元素注入） | **原样保留** |

洗点/退还的保留逻辑**只有一处**：`data-skill-tree.js` 的 `skillEntryKeep(e)`。
`skillRefundAll` 与 `skillTreeRespecApply` 都必须调它，不许各写一份 ——
分成两份就一定会各自漏字段（P2 加 `m`、P3 加 `el/el2` 时已经漏过）。

**② 一切「重建对象」都必须保留免费字段**

`game.js` 的 `keepPick(prev, next)` 是反向写法：`SKILL_ENTRY_KEEP` 名单里的键，
**`next` 没提到的一律从 `prev` 带过来**。以后加字段只要加进名单，不用回来改函数。
升级 / 降级 / 换变体三处都走它。反向断言：不许再出现「手写只保留 p」的写法。

**③ 存档 `pack` / `unpack` / `normalizeDoc` 三处必须同时认识一个字段**

漏 `pack` = 根本没存；漏 `unpack` = 存了读不回来。两者都是「重开就没了」。
更隐蔽的是**一次性迁移标记**（`barVer` / `skillReset`）：判据是「标记 ≠ 目标值」，
标记不落盘就等于**每次读档都是第一次** —— P6 抓到的最贵 bug 就是这个，
`skillRefundAll` 每读一次档把技能点退光一次。

所以：
- 加一个要跨存档的字段 → 三处一起改，**一处不落**；
- 加一个一次性迁移 → 标记也要落盘，且 `newState` 里**主动写「已迁移」**
  （只补落盘不补新档，「建号 → 投点 → 存档 → 读档」照样撞第一次）；
- `normalizeDoc` 里凡是「整块对象」的字段，都要**逐条整形**而不是只判 `_obj`
  （`_skillLedger` / `_passives` 是样板）：一条 `{x: null}` 就能让面板白掉，
  一个认不出的 id 就能白吃技能点（`skillPoints()` 对全表求和，不查 `SKILLS`）。

### 7.3 探针读「窗口内的副作用计数」的三条规矩

`probe-skill-p2b` 一轮红了三次，三次都是探针自己的假红。教训：

1. **按契约形状对号，不要数次数**。剑气环是等比阶梯
   （第 i 圈 = 第 0 圈 × (1 + `SKILL_RING_STEP`·i)），窗口里混进别的圈时
   `radii.length` 会飘；按阶梯逐级对号、数到第一处断档为止才稳。
2. **依赖准星的技能，`setup()` 里必须显式归位 `aimPoint` / `aimDir`**。
   上一个用例把准星丢在 9 码外，这个用例的阵心就落到那边去，读数全 0。
3. **等「定时器到点后才会发生」的效果，用轮询不要死等固定毫秒**。
   火墙 4 秒、雷云 6 秒，收尾是下一跳才触发，机器一慢就卡在边界外。
   轮询到出现为止（上限仍保留原时长），不期待该效果的用例走原路径。

## 8. 记忆与日志

- 详细逐日开发日志：`.workbuddy-ai/memory/YYYY-MM-DD.md`（append-only）。
- 长期项目约定：`.workbuddy-ai/memory/MEMORY.md`。
- **这个目录在 `.git/info/exclude` 里，不进 git**（仓库是公开的 Pages 站点）。
  换电脑 / 重新 clone 后日志不会跟过来 —— 本文档（`AGENTS.md`）就是精简版兜底，
  保持它的时效性。如果日志里出现了必须跨机器保留的东西，搬到本文档里。
