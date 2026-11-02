# 装备模组化 · 专题台账

- 分支：`feat/skill-refactor`（与技能重构并行；只共用 `ui.js` 说明页一处）
- 方案文档：`docs/EQUIP-DOLL-PLAN.md`（15 节）
- 工作台：`docs/equip-doll-playground.html`（**生成物**，源是 `dev/doll-playground.src.html`）
- 更新：2026-11-02 · P0 落地（装配器 + 33 族全量零件表 + 工作台 + 契约/探针）

> 当前：**地基与零件表完成，游戏侧一行未接**。`Doll.mount()` 已经能把一件装备拼成
> ≤3 个 draw 的 mesh，但 `actors.js:applyPaperDoll` 还在用老的五个手写几何体，
> 骨架上也还没有那 14 个标准挂点。所以**玩家现在看不到任何变化**。

## 一句话现状

装备外观的「身份」目前只存在于图标和数字里 —— 模型上只有头盔 / 护肩 / 披风 / 武器 / 副手五件几何，
而且这五件**不看装备**（只看职业和颜色）。方案要把外观改成「槽位 × 造型族 × 阶」的模组装配，
33 个造型族 + 一张数据表，渲染代码不再随内容增长。

## 节点表

> 阶段划分来自 `docs/EQUIP-DOLL-PLAN.md` §10。

| # | 节点 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| D0 | 方案 + 现状核查（6 个病灶逐条落到代码行）+ 6 项拍板清单 | ✅ | `docs/EQUIP-DOLL-PLAN.md` | 本次提交 |
| P0 | 地基：装配器（build / mergeGeos / 缓存 / dispose）+ **33 族全量零件表** + 工作台 + 契约 | ✅ | `src/doll.js`、`src/data/data-doll.js`、`dev/test-doll.js`、`dev/probe-doll.js`、`dev/doll-playground.src.html` + `dev/build-doll-playground.js` | 本次提交 |
| P1 | 换掉现有 5 槽（helm / shoulders / cloak / gloves / boots），15 族 | 🟡 **数据就位，接线未做** | `data-doll.js` ✅；`actors.js:applyPaperDoll` ⬜、骨架挂点 ⬜ | — |
| P2 | 战甲（含下摆）+ 腰带，6 族（最大一块，涉及动画契约） | 🟡 **同上** | `data-doll.js` ✅（含 `skirtG` 挂点值）；`charforge.js` 下摆挂点 ⬜ | — |
| P3 | 首饰与法器（amulet / ring / relic / fate），12 族（含 6 个光效族） | 🟡 **同上** | `data-doll.js` ✅（含 `relicG`）；「relic 跟人走」⬜ | — |
| P4 | 品质 accent 规则 + 传世 40 件签名件 + 8 阶材质细化 | ⬜ | `data-doll.js`（`DOLL_SIG`）、`items.js`（图标键） | — |
| P5 | 试衣间（离屏 RT + 2D blit，不新建 GL context）+ 33 张族级图标 + 说明页 | ⬜ | `ui.js`、`items.js`、`index.html` | — |
| P6 | 回归：老档穷举 / 移动端 / 泄漏 / `smoke` + `mobile-layout` | ⬜ | `dev/test-doll.js`、`dev/probe-doll.js` | — |

## 2026-11-02 · P0 落地

### 做完了什么

| 件 | 数字 | 口径 |
|---|---|---|
| 造型族 | **33** | 11 建模槽 × 3 族（9 实件 + 2 光效：`fate` / `relic` 走加色） |
| 零件条目 | **202** | 基础 129 + LOD 增量 73 |
| 标准挂点 | **14** | `helmG` `shoulderL/R` `armL/R` `capeG` `torsoG` `skirtG` `elbowL/R` `kneeL/R` `relicG` `footG` |
| 武器骨架 | 9 形状 × 3 族 + 5 装饰件 | `saber sword taojian staff glaive axe shield orb charm` |
| 基底穷举 | **384 件** | `dollKeyOf` 全过，0 失败 |

比原计划大的地方：原计划 P0 只填 `helm-A` 一族探路，实际**一次性把 33 族写完了**。
理由是零件表是纯数据、改起来便宜；而 `mergeGeos` 是唯一有技术风险的件，
不如拿真数据把它压到底（202 条零件、14 挂点、9 模具全走一遍），风险才暴露得出来。

### 三个「踩过才知道」

**① `lib/three.min.js` 里没有 `BufferGeometryUtils`。**
没有 `mergeBufferGeometries` → `mergeGeos()` 自己写非索引合并 + 顶点色。
引第三方不行（无构建、全局作用域、单文件加载）。

**② `emissive` 是材质级的，顶点色做不了。**
所以品质光**必须单独成 mesh**，不能混进主合并体 —— 否则要么整件发光、要么一点不光。

**③ 合并后的 mesh 材质必须注册进 `actor.mats`。**
`charforge.js:511` 挨打闪烁遍历的就是 `mats`；漏注册的表现是
「身体闪、装备不闪」，看起来像模型分层，很难联想到材质表。

### 验收怎么量的

```bash
node dev/test-doll.js                                          # 127 项契约（node 直跑）
NODE_PATH=<node_modules> node dev/probe-doll.js                # 23 项真机（工作台）
node dev/build-doll-playground.js --check                      # 生成物没走散
```

契约第 6 节是**近似投影**算的同槽三族剪影 IoU < 0.85（node 里没有 WebGL，只能粗筛）；
真机探针第四节是 GPU 读像素的真剪影，两套都过才算「三族真的不一样」。

探针量到的预算（`warrior`，14 格全装）：

| | mesh | draw | 顶点 |
|---|---|---|---|
| 裸身 | 57 | 59 | — |
| 全装 | 84 | 86 | +5754 |

换装 50 轮 `geometries` 148 → 148，不涨 —— P0 那条「几何缓存命中、显存不涨」成立。

### 生成物的两条规矩

`docs/equip-doll-playground.html`（710 KB）是 `dev/doll-playground.src.html` 内联出来的，
和 `src/fx2.js`、`src/data/data-bosskits.js` 同一条规矩：**改源、跑生成器、别手改产物**。
`--check` 已经接进流程（这次收口时它先红了一次，说明源改过产物没跟上）。

## 下一步

**P1：把挂点建进骨架，然后换掉 `applyPaperDoll` 的五个手写几何体。**

1. `actors.js` / `charforge.js` 里补 14 个标准挂点 Group（现在只有 `headG` / `armL/R` / `torso` 这些零散的）。
   **这一步是 P1/P2/P3 共同的前置**，卡在这儿三步都动不了。
2. `applyPaperDoll` 改成：`Doll.clear(actor)` → 逐槽 `Doll.mount(actor, item, cls)`。
   老的五个几何体删掉，别留两套并存（并存 = 以后不知道该改哪套）。
3. 顺手修 `clearGroup` 不 dispose 的泄漏（`actors.js:933`）—— 模组化之后这里是 10 倍泄漏。

验收：同一件装备建两次，`Doll.stats().hits` 涨、`misses` 不涨；换图后 `geometries` 回落。

## 卡点

- **6 项拍板仍未定**（`EQUIP-DOLL-PLAN.md` §12；重点是 #1 重甲改不改体量、#2 品质色还染不染主色）。
  数据已经按方案写完了，如果拍板结果不同（比如重甲要更厚），改的是零件表的 `s` / `sc`，
  不是代码 —— 但这仍是**要返工的量**，越早定越省。
- **14 个挂点在游戏侧还不存在**。工作台里它们是自己搭的，游戏骨架没有。
  P1 的第一件事就是补这个，别直接改 `applyPaperDoll`（会 `actor.parts[an]` 全 undefined，静默不装）。
- 说明页那一节会与技能重构抢 `ui.js` 的同一个位置，**后落地的那个 rebase**。
