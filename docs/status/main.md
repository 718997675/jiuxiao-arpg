# 主线 · 任务台账

- 分支：`main`（正式线，推 main 即上线）
- 线上：<https://718997675.github.io/jiuxiao-arpg/>
- 总计划：`V2-ROADMAP.md`（M1~M17）｜结构方案：`AGENTS.md`
- 更新：2026-10-27 16:40 · `76696f5`

> 当前：v1.13.1 已上线（角色位 10）· **P13 地图风貌差异化进行中**（P13-1 调查 ✅，见下）。

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

## P13 · 每章地图风貌差异化（2026-11-17 开工 · 进行中）

> 当前：**P13-1 只读调查 + 路标 ✅**；生产代码一行未改。
> 用户 2026-11-17 拍板：**做第一层**（地标 + 天气 + 主色调整），
> 第二层骨架变体先不做、地标不加文字说明。依据 `docs/P13-FENGMAO-DESIGN.md` + `docs/POLISH-PLAN.md` §P13。

### 节点表

| 节点 | 内容 | 状态 | 产物 | 验收 |
|---|---|---|---|---|
| P13-1 | 只读调查 + 路标 | ✅ | 本节 + `docs/P13-FENGMAO-DESIGN.md` | 不动生产代码 |
| P13-2 | 数据层：31 图加风貌字段 | ⬜ | `data-maps.js` 的 `MAP_SPECS`、`data-world.js` 的 `MAPS` | 字段齐全 + 同章四元组唯一 + 静态契约 |
| P13-3 | world.js 地标 + 天气层 | ⬜ | `world.js` 新增 `buildLandmark` / `buildWeather`，`buildMap` 接线 | 不改 zone 拓扑，zone-check 全绿 |
| P13-4 | 验收探针 + 截图 | ⬜ | `dev/probe-p13.js`、`dev/shot-p13.js` | 地标 mesh>0 / 天气粒子 range / 盲测截图 |
| P13-5 | 回归 + 台账收口 + 发布 | ⬜ | 三份台账 + 日志 + commit + push | 全套回归全绿 + 上线验证 |

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

### 关键坑（调查预判，动手时验证）

1. **`ground` 色是查表硬编码**（`world.js:725 baseColor` / `:783 BORDER_COL`）：设计稿的 `palette` 若只是改 `sky/fog`，别去动 `ground` 查表 —— 那会让可走区过曝或糊成一片。
2. **地标 must 落在可走区内**：`pickSpotInZones(mapId, pad)`（`world.js:632`）已在可走区撒点用；地标位置要复用它或取 `hall` zone 中心，否则会摆进墙里。
3. **天气粒子数要控**：设计稿 100~300 粒/图，一个 Points 一次 draw call；别用 mesh。
4. **`zone-check.js` 不许因为加字段而红**：只加数据字段，不改 `ZONE_ARCHETYPES`/拓扑。

### 下一步

按 P13-2 → P13-5 顺序做，**每完成一个能跑的小节点写台账 + commit + push**，别攒着写。

---

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-10-27 | 角色位扩展属于**主线功能**，直接在 main 上做，不单独开分支 | 它和两条功能线都不重叠；开分支反而要来回合并 |
| 2026-10-27 | 三条线单向合并到 main：`act` 优先，`skill` 次之 | 见 `AGENTS.md` §2.3 |
| 2026-10-27 | 历史分支 6 条全删（dev-v2 / dev-v3 / art-modeling / 旧 skill-refactor / 两个 fix） | 都是 v1.0.x 旧线，落后 main 22 个提交，无合并价值 |
