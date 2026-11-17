# 主线 · 任务台账

- 分支：`main`（正式线，推 main 即上线）
- 线上：<https://718997675.github.io/jiuxiao-arpg/>
- 总计划：`V2-ROADMAP.md`（M1~M17）｜结构方案：`AGENTS.md`
- 更新：2026-10-27 16:40 · `76696f5`

> 当前：v1.13.1 已上线（角色位 10）· **P13 地图风貌差异化已收口 ✅** · U13 特效跟随已收口 ✅ · **P15 Boss 战前剧情进行中 🔄**（P15-1 数据层 ✅）。

## 一句话现状

v1.13.1 已推上线并验证通过：角色位 3 → 10 全链路（桌面建档 / 读回 / 越界夹取 / 老档不受影响 /
移动端布局 / 线上 live-slots）。main 上当前**没有进行中的任务**。

## 节点表

> 本表只跟踪「正在推进 / 刚做完」的节点。V2-ROADMAP 里 M1~M17 的完整清单以文档为准，
> 状态没逐个核对过的不在这里标，免得误导。

| # | 节点 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| M6 | 储物箱体系（跨角色共享仓库 + 材料仓 + 套装收藏柜） | ✅ | `src/core/stash.js`、仓管 NPC、`dev/stash-check.js` | `689abaa` |
| M6.1 | 储物箱线上校验 | ✅ | `dev/live-m6.js` | `b331c38` |
| — | 角色位 3 → 10（`SLOT_COUNT`、面板加宽、空位压扁） | ✅ | `src/core/save.js`、`dev/save-slots.js` | `d82b4e5` |
| — | 角色位移动端收口 + 线上校验 | ✅ | `dev/live-slots.js` | `0fa604c` `76696f5` |
| M7 | 建档 / 读档体系 2.0 | ⬜ | — | — |
| M8 | 用户账号体系 | ⬜ | — | — |

## 下一步（可直接开工）

按 `V2-ROADMAP.md` 的顺序，M7 紧接着 M6，具体做什么见该文档 §M7 一节。

开工前先确认两件事：

1. 读 `V2-ROADMAP.md` 的 §M7 全文，把范围切出来（它可能包含导入/导出、云同步、账号绑定，
   一晚上做不完，得再切一层）。
2. 和 `feat/skill-refactor` 的 P0 有没有交集 —— 若 M7 要动 `save.js` 的 schema，
   而技能重构也要动（技能点/元素字段），两边会撞 `normalizeDoc`，得先说好谁先落。

## 卡点 / 待定

- **M7 范围未切**：文档写的是「建档/读档体系 2.0」，粒度太粗，需要先拆成可验收的小节点。
- **与两条功能线的 schema 冲突**：`src/core/save.js` 是三方共用的热点文件
  （main 的 M7 / act 的 `world.act` / skill 的技能点与元素），谁先改谁定规矩。

## P13 · 每章地图风貌差异化（2026-11-17 开工 · ✅ 已收口）

> 当前：**P13-1~P13-5 全 ✅**，已 push 上线。用户 2026-11-17 拍板做第一层
> （地标 + 天气 + 主色），第二层骨架变体先不做、地标不加文字说明。
> 依据 `docs/P13-FENGMAO-DESIGN.md` + `docs/POLISH-PLAN.md` §P13。

### 节点表

| 节点 | 内容 | 状态 | 产物 | 验收 |
|---|---|---|---|---|
| P13-1 | 只读调查 + 路标 | ✅ | 本节 + `docs/P13-FENGMAO-DESIGN.md` | 不动生产代码 |
| P13-2 | 数据层：23 图加风貌字段 | ✅ | `data-maps.js` 的 `MAP_SPECS`（23 图 + landmark/weather）、`data-world.js` 的 `MAPS`（13 图调色） | test-p13 数据层 13/0 + zone-check 全绿 |
| P13-3 | world.js 地标 + 天气层 | ✅ | `world.js` 新增 `buildLandmark`（23 种）/ `buildWeather`（13 种），`buildMap` 接线 | test-p13 源码层 21/0 + smoke ERRORS none |
| P13-4 | 验收探针 + 截图 | ✅ | `dev/probe-p13.js`（10/0）、`dev/shot-p13.js`（10 张临时目录） | 逐图 mesh 3~7 / 粒子 100~300 / 坐标有限 / 同章四元组唯一 / 盲测出图 |
| P13-5 | 回归 + 台账收口 + 发布 | ✅ | 本台账 + `POLISH-PLAN.md` + 当日日志 + commit + push | 全套回归全绿（详见下）+ 上线验证 |

### 交付了什么

- **每图一个地标**：23 种低模造型（活物 / 熔铸 / 渡葬 / 兵刃 / 天象五族，3~7 mesh），
  放在「入口 → 首领」必经的 hall/path 区中心，不带碰撞（玩家穿过不卡）。
- **每图一种天气**：13 种粒子（雪 / 雨 / 灰 / 火星 / 落叶 / 萤火 / 剑气 / 星屑 / 虚空尘…），
  一个 Points = 一次 draw call，逐帧只写 y（≤300 粒），换图随 world 销毁。
- **主色拉开**：13 张图调 sky/fog，卷五 5-1 四张 void 从「暗紫四胞胎」变成
  玉青 / 星蓝 / 紫 / 墨绿四色（真机截图盲测可分）。
- **同章四元组唯一**：骨架 + 地貌 + 地标 + 天气，任意两张图不重复（不靠换 ground）。

### 回归读数（2026-11-17）

| 检查 | 读数 |
|---|---|
| zone-check / test-p13 | 全绿（16 提醒）/ **21-0** |
| probe-p13（真机 23 图） | **10-0** |
| 技能契约十份 | p0 250 / p1 52 / p1c 363 / p2 41 / p2b 924 / p2c 99 / p3 106 / p4 60 / p5 989 / p5b 116 / p6 97，全 0 失败 |
| test-combo / elemfx / poison / elem-dual / holy / affix | 76 / 74 / 32 / 40 / 50 / 60，全 0 失败 |
| smoke / mobile-layout | ERRORS none / 全绿 |
| 生成物一致性 | skillvfx / fx2 / bosskits 全绿；**bosscast 假红（见卡点）** |

### P13 新踩的坑

1. **puppeteer 的 `evaluate` 不能返回 THREE 对象**：探针里把 THREE.Group 数组直接塞进返回值，
   puppeteer 序列化失败 → 整个返回值变 `undefined`，表现为「所有图都探针未返回」。
   修法：只返回自己构造的普通对象（mesh 数 / 有限性 / 类型），不返回场景对象本体。
2. **取景必须挪玩家，不能改相机**：游戏每帧把相机拉回玩家，`camera.lookAt` 设了也会被覆盖。
   截图脚本要把玩家传送到地标旁（p.z+13），等相机 lerp 跟上再截。
3. **静态契约数不出循环生成的 mesh**：`boneCol` / `swordForest` / `lanternRow` 用 `for` 循环建模，
   源码里 `L(` 只出现 2 次但实际出 5~7 个 mesh。静态契约只验「非空壳」，精确 mesh 数交给真机探针。
4. **lanternRow 曾有 9 个 mesh**：4 灯 ×2 + 底座超了设计稿的 3~6 上限，改成 3 灯 ×2 + 底座 = 7。

### 下一步

P13 已收口。按 `docs/POLISH-PLAN.md` 四批顺序，第 4 批只剩 **P15（Boss 战前剧情）**——
已拍板「只播一次 + 可跳过」，可直接开工。开工前先确认是否要在做 P15 前把本轮 P13 合入验证。

### 代码地图（P13-1 调查结论，动手必读）

| 关注点 | 位置 | 结论 |
|---|---|---|
| 骨架图清单 | `data-maps.js:488 MAP_SPECS` | 23 张手写图；加 `MAP_ZONES` 老图 + 5-2 副本共 31 张。设计稿 §四只给 22 张逐图方案 |
| 骨架拓扑 | `data-maps.js:275 ZONE_ARCHETYPES` | **不可动**；`variant` 是第二层，本次不做 |
| 地图配色 | `data-world.js:8 MAPS` | 每张已有 `ground/sky/fog/ambient/sun/props`；主色调整改这里的 `sky/fog` |
| buildMap | `world.js:711` | 返回 `{root,colliders,anims,occluders,portal,...}`；地标/天气在这里读 `cfg` 接线 |
| 天气更新入口 | `game.js:10769` | `for (const fn of this.world.anims) fn(this.time)` —— 天气层挂 `anims` 即可逐帧更新 |
| 低模 helper | `actors.js:56 M()` / `:67 mesh()` | `M(color,{rough,metal,emissive,ei,...})`、`mesh(geo,mat,x,y,z,parent)`；`cylGeo/boxGeo/sphGeo` 是全局 |
| 天气粒子模板 | `world.js:1236 void 星屑` | `BufferGeometry + PointsMaterial({map:dotTexture(),size,blending})`，一个 Points = 一次 draw call |
| 必经 zone | `data-maps.js:928 mapZones()` / `:932 mapEntryZone()` | 地标放 `kind==='hall'` 或 `'path'` 的 zone 中心；`zoneById` 按 id 取 |

### 调查预判的坑（动手时已验证）

1. **`ground` 色是查表硬编码**（`world.js:725 baseColor` / `:783 BORDER_COL`）：设计稿的 `palette` 若只是改 `sky/fog`，别去动 `ground` 查表 —— 那会让可走区过曝或糊成一片。
2. **地标 must 落在可走区内**：取 `hall` zone 中心（本次就是这么做的），否则会摆进墙里；真机探针逐图验了 `zonesContain`。
3. **天气粒子数要控**：设计稿 100~300 粒/图，一个 Points 一次 draw call；别用 mesh。
4. **`zone-check.js` 不许因为加字段而红**：只加数据字段，不改 `ZONE_ARCHETYPES`/拓扑。

### 卡点

- **`build-bosscast.js --check` 假红**：报 `src/boss-cast.js 与特效台不一致`。本轮 P13 只改了 7 个文件，
  **完全没碰 bosscast 生成链**；本地还有一个 `stash@{0}: U13 sfx-follow WIP`（别人的 WIP），
  特效台可能在那里被改过。按 AGENTS.md 硬规矩，**绝不在本机跑 `build-bosscast --write`**
  （会把生成物洗成 Safari 顺序污染 BOSS 线）。要验这条请在有 Chromium 的机器上跑。

### 下一步

P13 已收口。按 `docs/POLISH-PLAN.md` 四批顺序，第 4 批只剩 **P15（Boss 战前剧情）**——
已拍板「只播一次 + 可跳过」，可直接开工。

---

## P15 · Boss 战前剧情演绎（2026-11-17 开工 · 🔄 进行中）

> 当前：**P15 全节点 ✅ 已收口并 push 上线**（intro+UI+game 契约 29/0，存档 21/0，真机 17/0，全套回归绿）。
> **POLISH-PLAN 17 项打磨计划至此全部完成。**
> 依据 `docs/POLISH-PLAN.md` §P15 + §3 拍板第 5 条：只播一次（落盘）、设置可跳过。
> main 上直接做，不单开分支。

### 节点表

| 节点 | 内容 | 状态 | 产物 | 验收 |
|---|---|---|---|---|
| P15-1 | 数据层：45 只 Boss 的 intro | ✅ | `data-monsters.js` 的 `BOSSES[*].intro`（卷末 5 句 / 普通 3 句，{who,text}） | `dev/test-boss-intro.js` 9/0 |
| P15-2 | 存档 + 设置字段 | ✅ | `bossIntro` 落盘四处 + 兜底模板、`skipBossIntro` 设置项 + 重播动作行 | `dev/test-boss-intro-save.js` 21/0 + test-save 79/0 |
| P15-3 | UI 演出层（黑边 + 字幕） | ✅ | `index.html` #bossIntro（z-index 58、黑边+三类字幕+跳过提示）、`ui.js` open/line/close 三接口 | `test-boss-intro` 15/0（DOM+接口） |
| P15-4 | `playBossIntro` + 激活接线 | ✅ | `game.js` `maybeBossIntro/startBossIntro/tickBossIntro/skipBossIntro/finishBossIntro/replayBossIntros`、update 冻结闸门、updateCamera 推镜、keydown/click 跳过、换图清场 | `test-boss-intro` 29/0 + smoke ERRORS none |
| P15-5 | 验收探针 + 截图 | ✅ | `dev/probe-boss-intro.js`（17/0）、`dev/shot-boss-intro.js`（5 张临时目录） | 首播/二次不播/定格/逐句/跳过/跳过设置/重播/换图 + 零报错 + 截图肉眼验收 |
| P15-6 | 回归 + 台账 + push | ✅ | 本台账 + POLISH-PLAN + 当日日志 + commit + push | 全套回归全绿（见上）+ 上线验证 |

### 回归读数（2026-11-18）

| 检查 | 读数 |
|---|---|
| test-boss-intro / test-boss-intro-save | **29/0** / **21/0** |
| probe-boss-intro（真机） | **17/0** |
| smoke / test-save / check-seals | ERRORS none / 79/0 / 111/0 |
| test-quest / quest-ref / zone-check / zone-density | 全绿 |
| test-vfx-kit / vfx-dsl / elemfx / combo / p13 / sfx-follow | 全绿 |
| mobile-layout | 全绿（6 视口） |
| 截图 | `/tmp/p15-shot/s1~s5.png`，黑边 / 三类字幕配色 / 跳过提示肉眼到位 |

### P15 踩的坑（真机才暴露）

1. **演出计时不能用夹过的 `raw`**：软件渲染只有 ~5fps 时 `raw = min(real,0.06)` 每帧只走 60ms，
   2.4s 的演出被拖成 10 秒。改从 `tickFrame` 传真实墙钟 `_realDt`（夹 0.25s 防切后台跳变）。
   `real` 不在 `update()` 作用域，必须先存到 `this._realDt`。
2. **"任意键跳过"与"按移动键验冻结"冲突**：探针里派发 `keydown w` 想验输入冻结，
   结果那一下直接把演出跳过了。冻结的正确验法是「不按键时玩家坐标随时间不变」；
   「按键跳过」单独一条验。
3. **等字幕推进用轮询不要死等毫秒**：帧率不稳时 950ms 可能还在第 1 句。按 AGENTS.md §7.3
   用 `until(状态出现)` 带上限，读数稳定。
4. **截图脚本不能经过 Game 状态机**：主循环会继续 `tickBossIntro`，截图时句子已漂移。
   改直接调 `UI.bossIntroOpen/Line` 驱动视觉层，才能定格在指定句。
5. **新增进度字段会撞既有契约的死正则**：`check-seals` 断言 `/bossKilled: \{\}, seals: \{\}/`，
   插入 `bossIntro` 后红。属于契约过时，改成可选匹配（允许中间有 bossIntro、seals 仍必须在）。

### 设计口径（开工前拍板，必读）

1. **时长**：设计稿写「每句 1.2s × 3 句 = 3.6s」与验收线「2.5s 后开打」互斥。
   **取验收线** → 固定 **0.8s/句**（普通 3 句 = 2.4s，卷末 5 句 = 4.0s），任意键/点击可跳过。
2. **只播一次**：`state.bossIntro[bossId] = 1` 落盘（走 P13/P6 的四处铁律），重刷不重播。
3. **可跳过**：`skipBossIntro` 设置项默认关；跳过时按老逻辑（toast + log + SFX.boss），不冻结输入。
4. **剧情台词与战斗 lines 完全不重复**：intro 是全新场景/对白，lines 留给战斗时随机喊。
5. **叙事骨架**：首句旁白铺陈 → 中间 Boss 自白 → 末句「你」代入；卷末 5 句给终局四连 + 玩家收尾。

### 代码地图（P15-1 调查结论，动手必读）

| 关注点 | 位置 | 结论 |
|---|---|---|
| Boss 激活点 | `game.js:7990`（`updateEnemies` 内） | `d<17 && gateOpen` 时 `e.active=true` + toast + `SFX.boss()` + shake + log 一句。演出接这里 |
| 输入冻结 | `game.js:462 keydown` / `:3164 update` | 现有 `this.keys` 无全局 inputLock；演出用自己的 `this.bossIntro.active` 闸门 |
| 镜头 | `game.js:3046 updateCamera(raw)` | 每帧 LERP 到玩家 + `lookAt(player)`，演出推镜需在 lookAt 前插入 override |
| 血条 | `ui.js:1858 updateBoss(boss)` | `bar.style.display='block'`；演出时压住、结束再显示 |
| 存档四处 | `game.js:673` / `save.js:333` / `:519` / `:591` | 进度字段铁律（见 AGENTS.md §7.2）：新档 / normalize / pack / unpack 缺一不可 |
| 设置项 | `settings.js:25 DEFAULTS` + `:82 normalize` / `ui.js:491 SET_ROWS` | bool 键 `Settings.set` 已收 `'0'`→false，新增照 `autoPickup` 写 |
| 设置动作行 | `ui.js:1337 onSettingsClick` + `index.html:2066 .setrow` | 可做「重播」按钮（act 型，仿 fullscreen） |
| bossbar 让位 | `index.html:1903` | `body.in-menu` 会隐藏 bossbar；演出加自己的 body class |

---

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-10-27 | 角色位扩展属于**主线功能**，直接在 main 上做，不单独开分支 | 它和两条功能线都不重叠；开分支反而要来回合并 |
| 2026-10-27 | 三条线单向合并到 main：`act` 优先，`skill` 次之 | 见 `AGENTS.md` §2.3 |
| 2026-10-27 | 历史分支 6 条全删（dev-v2 / dev-v3 / art-modeling / 旧 skill-refactor / 两个 fix） | 都是 v1.0.x 旧线，落后 main 22 个提交，无合并价值 |
| 2026-11-17 | P13 只做第一层（地标+天气+主色），第二层骨架变体先不做 | 用户在设计稿拍板；先出可见收益，骨架变体留到验收通过后再评估 |
| 2026-11-18 | P15 字幕取 0.8s/句，不取设计稿的 1.2s/句 | 设计稿「1.2s × 3 句 = 3.6s」与验收线「2.5s 后开打」互斥；取验收线，普通 3 句 2.4s、卷末 5 句 4.0s，任意键跳过 |
| 2026-11-18 | P15 首遇落盘时，跳过也算"已看" | 避免"演出中跳过 → 下次又播"的尾巴；想重看走设置里的重播动作 |
