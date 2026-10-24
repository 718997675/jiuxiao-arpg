# 九霄·山海录 · 项目长期约定

## 协作方式（用户明确要求）
- **每完成一个节点（功能项）就要报告一次**：说明改了什么、回归结果、下一步。
- **每个节点完成后要提交并推送到 GitHub，tag 同步**（分支 `dev-v3`）。
- 推送用 SSH：`git push git@github.com:718997675/jiuxiao-arpg.git dev-v3` + `git push ... <tag>`。
  remote 配的是 https，直接 push 会因为没有凭据失败；SSH 密钥已配好，直接指定 SSH URL 即可。
- 发版节奏：`feat(vX.Y.Z): ...` 单提交 + 同名 annotated tag（当前 v1.8.0）。
- **每个节点完成后必须部署线上地址给用户测试**，且要给出**完整可访问链接**
  （含 `?sharecode=` 参数，只给域名用户打不开）。
- **记忆文件放在项目内**（`.workbuddy-ai/memory/`），随 git 提交，换账号/换机器可直接续做。

## 线上部署
- 部署目录：源站 `dist/`（`.gitignore` 忽略，由 `cp index.html dist/` + `cp -R src dist/src` 生成），
  **实际上传目录改为 `/Users/niekai/Documents/ai-game/jiuxiao-web`**（静态纯净副本，无 marker 文件）。
- 发布流程：`rsync -a --delete dist/ ../jiuxiao-web/` 之后调 `workbuddy_sites_deploy`，
  `directory=/Users/niekai/Documents/ai-game/jiuxiao-web`，`language: "static"`，
  `appName: 九霄山海录`，`domainPrefix: jiuxiao-arpg`，`entryHtml: "index.html"`。
- 现用域名：`https://jiuxiao-arpg-64461.app.workbuddy.host/?sharecode=XFVN5DMO54`
  （**必须带 `?sharecode=` 才能访问**）。appId `wbapp_xeMSWXU4vKsBNrmrFjb7i1`。
- 旧域名 `jiuxiao-arpg-46579` 属于**另一个账号**发布的应用：本账号查不到该 app，
  发布时会报 `SITES_APP_NOT_FOUND`，且旧的 `.wbapp_*.genie` / `.workbuddy/applications.yaml`
  会让工具一直去找那个不存在的 app —— 换账号后必须清掉这两个文件再发（备份思路见当日日志）。
- 部署前必须先同步 dist → jiuxiao-web，否则上传的是旧代码。

## 设计决策（用户拍板，勿再改回去）
- **技能条 8 格 × 2 套**：PC 键 1-8，手机 4×2 宫格，**Shift 换栏**（备用 ` / V），手动配置不变。
  （中途试过 5 格，用户要求按 V2 计划回到 8 格；换栏键从反引号改 Shift 是用户 2026-10-25 拍板。）
- **不做「技能书」升级**：技能等级靠等级解锁 + 技能点，不加技能书道具/掉落。

## 装备体系的三条正交线（务必分清，说明页第四节按这个口径写）
- **基底阶**：8 阶 `凡兵→精铁→玄铁→地煞→天罡→仙品→神兵→太初`，管基础数值、可在炼器台升阶。
- **品质（rarity）**：升品链只有 4 档 `凡品 0 / 灵品 3 / 玄品 5 / 神兵 7 词条`，
  套装（绿，5 词条）与传世（红，8 词条）是**类型**，两者都不走升品链。
- **类型**：普通 / 套装（12 套）/ 传世（20 件）。
- 遗留命名冲突（**未改，等用户拍板**）：品质里的「神兵」与八阶里的「仙品 / 神兵」撞名，
  品质「玄品」与八阶也不用同一套字。候选改法：品质末档改「神品」，或阶名改「仙阶 / 神阶」。

## 代码结构要点
- 数据层：`src/data/data-items.js`（槽位/基底/词缀/套装/符文）、`data-skills.js`、`data-talents.js`、`data-monsters.js`、`data-elites.js`
- 结算：`src/items.js`（aggregate / computePlayerStats / 基底阶）、`src/game.js`（战斗与系统）、`src/ui.js`、`src/ui-forge.js`
- 回归：`dev/test-*.js`（浏览器驱动，puppeteer-core + 本机 Chrome）；
  M1–M4 专项 `dev/test-m1m4.js`（A–H 八节，支持 warrior/mage/taoist 三职业参数）
- 本机 `grep` 是 ripgrep：**交替要用 `|` 不要用 `\|`**，否则静默无匹配。
