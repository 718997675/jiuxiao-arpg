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
- 部署目录：`dist/`（`.gitignore` 忽略，由 `cp index.html dist/` + `cp -R src dist/src` 生成）。
- 部署方式：`workbuddy_sites_deploy`，`directory=/Users/niekai/Documents/ai-game/jiuxiao-arpg/dist`，
  `language: "static"`，`appName: 九霄山海录`，`domainPrefix: jiuxiao-arpg`。
- 域名：`https://jiuxiao-arpg-46579.apps.workbuddy.host/`，**必须带 `?sharecode=` 才能访问**。
- 部署前必须先同步 dist，否则上传的是旧代码。

## 设计决策（用户拍板，勿再改回去）
- **技能条 8 格 × 2 套**：PC 键 1-8，手机 4×2 宫格，反引号换栏，手动配置不变。
  （中途试过 5 格，用户要求按 V2 计划回到 8 格。）
- **不做「技能书」升级**：技能等级靠等级解锁 + 技能点，不加技能书道具/掉落。

## 代码结构要点
- 数据层：`src/data/data-items.js`（槽位/基底/词缀/套装/符文）、`data-skills.js`、`data-talents.js`、`data-monsters.js`、`data-elites.js`
- 结算：`src/items.js`（aggregate / computePlayerStats / 基底阶）、`src/game.js`（战斗与系统）、`src/ui.js`、`src/ui-forge.js`
- 回归：`dev/test-*.js`（浏览器驱动，puppeteer-core + 本机 Chrome）；
  M1–M4 专项 `dev/test-m1m4.js`（A–H 八节，支持 warrior/mage/taoist 三职业参数）
- 本机 `grep` 是 ripgrep：**交替要用 `|` 不要用 `\|`**，否则静默无匹配。
