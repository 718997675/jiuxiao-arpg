# 装备模组化 · 专题台账

- 分支：`feat/skill-refactor`（与技能重构并行；只共用 `ui.js` 说明页一处）
- 方案文档：`docs/EQUIP-DOLL-PLAN.md`（15 节）
- 工作台：`docs/equip-doll-playground.html`（**生成物**，源是 `dev/doll-playground.src.html`）
- 更新：2026-11-17 · **P2 完成**（战甲 + 下摆 + 腰带，最大一块落地）
- 下一动：**P3 首饰与法器**（amulet / ring / relic / fate，12 族含 6 光效族）

> 当前：**P0 地基 + P0.5 武器骨架 + P1 五槽 + P2 战甲/下摆/腰带全部完成**。
> 7 个槽位（helm / shoulders / cloak / gloves / boots / chest / belt）走模组装配，
> 21 个造型族在游戏里真的出得来。剩下 P3 的四槽（amulet / ring / relic / fate）
> 仍无表现，P4 的品质 accent 与传世签名件未动。

## 一句话现状

装备外观的「身份」过去只存在于图标和数字里。P1 让五个配件槽有了造型，
P2 让**最大的一块**——战甲——也换成了模组：穿札甲是宽箱体带护心镜，
穿轻裘是贴身斜挂带配腰包，下摆跟着走路摆。这两件在同一具纸娃娃上，
**一眼能分出是重甲还是轻裘**（像素差 15%+，探针第四节量）。

## 节点表

> 阶段划分来自 `docs/EQUIP-DOLL-PLAN.md` §10。

| # | 节点 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| D0 | 方案 + 现状核查（6 个病灶逐条落到代码行）+ 6 项拍板清单 | ✅ | `docs/EQUIP-DOLL-PLAN.md` | 本次提交 |
| P0 | 地基：装配器（build / mergeGeos / 缓存 / dispose）+ **33 族全量零件表** + 工作台 + 契约 | ✅ | `src/doll.js`、`src/data/data-doll.js`、`dev/test-doll.js`、`dev/probe-doll.js`、`dev/doll-playground.src.html` + `dev/build-doll-playground.js` | 本次提交 |
| P1 | 换掉现有 5 槽（helm / shoulders / cloak / gloves / boots），15 族 | ✅ | `index.html` 加载链、`charforge.js` 四个装备空槽、`doll.js:dress`、`actors.js:applyPaperDoll`；`dev/probe-doll-p1.js` | 本次提交 |
| **P0.5** | **武器模具骨架**（9 形状 × 3 形制族 + 5 装饰件，长度锁死只改宽厚） | ✅ | `data-doll.js` 的 `DOLL_WEAPON_RIG` / `DOLL_WEAPON_TRIM`；`doll.js:buildWeapon` | 本次提交 |
| P2 | 战甲（含下摆）+ 腰带，6 族（最大一块，涉及动画契约） | ✅ | `charforge.js` 三组自带件 + 三个空槽、`data-doll.js` 袖子去重与 B 族加厚、`actors.js:applyPaperDoll`、`dev/probe-doll-p2.js` | 本次提交 |
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
| 武器骨架 | 9 形状 × 3 族 | 长度 `len` 是契约（不改），`w`/`t` 只改宽厚 |

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

**④ 成对挂点必须由装配器镜像，数据只写一份。**
护肩/护手/靴/戒指在数据里只写 `shoulderL` 一份（写两份会出现「右肩照抄左肩坐标」的重复代码），
镜像归 `doll.js` 管。第一版漏了这步 → **右肩完全没有几何**，截图里像被砍了一只肩。
判据不是「代码跑通」，是「左右两侧挂点 children 都 > 0」——探针第一节现在逐格报 mesh 数，
`shoulders:2 gloves:2 boots:2` 才是对的。

**⑤ 「三族剪影 IoU」必须只渲染该槽位的零件。**
第一版渲染整个角色来算，头盔三族的差异只占头顶几十像素 → IoU 0.98 的**假高分**，
所有槽位都「通过」了。正确做法：按 `wrap.userData.slot` 筛，只留当前格。
修完真实数字落到 0.14~0.75，和 node 近似模型同向。

**⑥ 缓存淘汰时只删 Map 引用 = 泄漏。**
`renderer.info.memory.geometries` 只认 `geometry.dispose()`，GC 清不掉。
50 轮换装实测 77 → 869。修法是**引用计数**：`build` +1、调用方 `Doll.release()` −1、
淘汰时打 `dead` 标记，refs 归零那一刻才真 dispose。同时 `rebuild` 要把**每个** actor
都 `clearEquip`（只放掉主角色的话，对比模式那两个的引用永远不归零）。

**⑦ 探针测法比实现更容易错。**
「每轮换新阶新族」→ 每次都是缓存未命中，geometry 当然涨。那是**填充**不是泄漏。
先预热三套、取基线、再切 50 轮，才是方案 §11 第 5 条的本意。

### 工作台怎么用

`docs/equip-doll-playground.html` 双击即开（711 KB，self-contained）。

| 操作 | 做什么 |
|---|---|
| 左侧 14 格 | 选槽位；绿点 = 已装，紫/蓝字 = 光效槽/建模槽 |
| 右侧族/阶/品质 | 改哪一个，画面立刻变；「件数」跟着 LOD 段涨 |
| 底栏「剪影」 | 纯黑剪影 + 浅底，看轮廓差异（空格键同效） |
| 底栏「三族对比」 | 三个纸娃娃并排，只有当前格的族不同 |
| 底栏「算 IoU」 | GPU 读像素算**真实**剪影 IoU，< 0.85 才算可辨 |
| 底栏「随机一套」 | 随机 14 格，用来撞出「两族撞脸」的组合 |
| 底栏「导出」 | 当前装配 + 预算 + IoU 表，可直接贴回台账 |

它引的是 `src/` 下的真实文件，**不是复制品** —— 改 `doll.js` / `data-doll.js`，
台子自动跟着变（`--check` 会拦住「源改了产物没跟上」）。

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
| 全装 | 87 | 89 | +6765 |

> 这张表改过两次，原因值得记：第一版 84 mesh / +5754 是**只生成了左肩**时量的
> （成对挂点没镜像，见下面「④」）。补齐右侧后变成 87 / +6765。**预算按后者算**。

换装 50 轮（同一批 3 套来回切）`geometries` 159 → 159，不涨 —— 「几何缓存命中、显存不涨」成立。

### 生成物的两条规矩

`docs/equip-doll-playground.html`（710 KB）是 `dev/doll-playground.src.html` 内联出来的，
和 `src/fx2.js`、`src/data/data-bosskits.js` 同一条规矩：**改源、跑生成器、别手改产物**。
`--check` 已经接进流程（这次收口时它先红了一次，说明源改过产物没跟上）。

## 2026-11-17 · P1 落地

### 一句话

五个槽从「手写三个 if 分支」换成「读零件表装配」。玩家换一顶头盔，头顶的轮廓会变；
换一件护手，前臂会变；脱掉披风，背后就空了。

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.html` | 加载 `src/data/data-doll.js`（数据区）+ `src/doll.js`（`charforge.js` 之后）。**这两个文件之前根本没进页面** —— 不是「没接线」，是零件连浏览器都没加载过 |
| `charforge.js` | 腿段开 `bootBaseL/R`（自带靴筒/靴底/铜扣，可整组隐藏）+ `bootL/R`（装备空槽）；臂段同理开 `wristBaseL/R` + `gloveL/R` |
| `data-doll.js` | `gloves` 三族 anchor `elbowL` → `gloveL`；`boots` 三族 anchor `kneeL` → `bootL`；`DOLL_ANCHORS` 补两行映射 |
| `doll.js` | 新增 `dress(actor, slot, item, cls)` / `undress(actor)`：记住上次装的是哪几个 mesh，**先摘后挂**；挂上时把材质注册进 `actor.mats`（去重） |
| `actors.js` | `applyPaperDoll` 五槽改走 `Doll.dress`；新增 `dollReady(a)` 判据与 `hideBaseGear()`；**披风改读 `eq.cloak`**；护手/靴不再染 `handMat` / `bootMat` |
| `game.js` | `buildPlayer` 重建角色前先 `Doll.undress(oldActor)`，否则引用计数永远停在 1 |

### 四个「踩过才知道」

**① `dev/_load.js` 是解析 `index.html` 拿脚本清单的。**
加了 `<script src="src/data/data-doll.js">` 之后，`test-doll.js` 里那行手动 `runInContext`
立刻炸 `Identifier 'DOLL_FAM_NAME' has already been declared`。
修法是**删掉测试里的手动加载**（清单已经来自 index.html）。
这条反过来是好事：以后新增数据文件只要进了页面，所有离线测试自动带上它。

**② 护手/靴不能直接挂 `elbowL` / `kneeL`。**
数据里那两条的 `anchor` 原本就写的是关节名，坐标也是相对关节写的（手套 `p:[0,-0.30,0.044]`
正好是手的位置）—— 看着天经地义。但关节组里装着**前臂/小腿的几何**，
「换装前先清空挂点」这个动作一到关节上，玩家的手和腿就没了。
所以 charforge 在关节原点各开一个空子组（位置等价），装备只挂空槽。
判据不是「能装上」，是「装上之后 `elbowL.children` 里那根前臂还在」。

**③ 装备靴会和自带靴叠成两双。**
`charforge` 的腿段本来就带靴筒/靴底/铜扣（`mBoot`）。第一版只挂不藏，
截图里小腿粗了一圈 —— 两层靴筒套在一起。
修法是给自带件单独成组、装装备时 `visible = false`、脱掉立刻还回来。
**「换装」的本质是「新的上、旧的让位」，不是「往上加」。**

**④ `renderer.info.render.calls` 在游戏里不可信。**
装备前后都是 281 —— shadow map pass 也计入 calls，装备的 color draw 和自带件的 shadow draw
刚好互相抵消。改用 `triangles`：裸身 14812 → 五槽全装 15826（+1014）。
同理 `actor.group` 的 mesh 总数涨 8、**可见 mesh 数不变**（新增 8 件装备、藏掉 8 件自带），
这一条一开始被当成「装备没画出来」，查了半天才发现它恰好是 `hideBaseGear` 在工作的证据。

### 顺手修的旧 bug

**披风一直读的是 `eq.chest`。**
`applyPaperDoll` 里 `const capeItem = eq.chest;` —— 于是「换了胸甲，披风跟着换颜色」，
而 14 槽里那个真正的 `cloak` 槽**从来没有任何表现**。P1 改成 `eq.cloak`，
探针第四节钉死：只装胸甲时 `capeG.children.length` 必须还是 0。

**护手一直染的是手。**
`P.handMat.color.setHex(c.base)` 染的是 `mHand`（手的肤色材质），
表现是「戴上手套，整只手变成金属色；脱掉之后手还是那个色」（因为没恢复分支）。
P1 之后护手是前臂上的一层几何，`handMat` 从头到尾不动 —— 探针第五节比对装前/装后/脱后三个色值。

### 验收怎么量的

```bash
node dev/test-doll.js         # 127 项契约（数据自洽 / 剪影 IoU / 八阶材质一致）
node dev/probe-doll-p1.js     # 69 项真机（五槽装配 / 三族可辨 / 换装不叠 / 不泄漏）
```

真机九节：① 五槽逐槽装上 ② 同槽三族几何不同 ③ 换装 10 次不叠加 ④ 披风读 `eq.cloak`
⑤ 护手不染手 ⑥ 自带靴/护腕让位 ⑦ 换装 200 次不泄漏 ⑧ 几何预算 ⑨ 零报错。

### 截图人工过

`dev/_shots/p1-*.png`（不入库）。看下来的结论：

- **三族轮廓真的不同**：A 低矮巾帻 + 宽披风 / B 双角盔 + 层叠肩甲 / C 高冠 + 细长纱氅。
- **已知待调（记进 P4，不在 P1 改）**：护肩偏宽（族 A 尤其明显，横向超出上臂一截）；
  重氅（B）从背后看是一块大平面，背光时近乎全黑 —— 这需要 P4 的 accent 亮边来救，
  不是装配层能解决的。两件都是**零件表的 `s` / `sc` 参数**，改数据不改代码。

## 2026-11-17 · P2 落地

### 一句话

穿札甲是宽箱体 + 护心镜，穿轻裘是贴身斜挂带 + 腰包，下摆跟着走路摆。
这是整个方案里最大的一块 —— 战甲是玩家全程都在看的那个面。

### 一件装备占四个挂点

`chest` 的零件表跨了 `torsoG` / `skirtG` / `sleeveL` / `sleeveR` 四处：
胸板在身上、下摆挂在裙摆组（借用现成的摆动曲线）、袖子在两条上臂上。
所以 `Doll.dress(a, 'chest', ...)` 一次要往四个空槽里挂东西，探针第一节逐槽验。

`belt` 和 `chest` **共用 `torsoG`**。dress 按 `slot` 记录而不是按 anchor 记录，
所以换腰带不会把胸甲一起摘掉 —— 第二节钉死这条（换完之后 `torsoG` 必须还是 2 个 mesh）。

### 三组自带件要让位

| 组 | 装什么 | 什么时候隐藏 |
|---|---|---|
| `torsoBase` | 腹 / 胸 / 交领 | 穿战甲 |
| `waistBase` | 腰封 + 玉扣 | 戴腰带 |
| `skirtBase` | 自带下摆（robe 两套分支都在里面） | 穿战甲（战甲自带下摆） |

**不藏就是 Z-fighting**，不是「多一层更保险」：A 族胸甲半径 0.232，自带是
0.222 × w(1.06) = 0.235 —— 两层几乎完全重合，画面上一闪一闪。
腰带同理（0.214 vs 0.212）。

### 三个「踩过才知道」

**① 袖子数据写了两份，每侧会收到两份。**
`chest` 的 A / C 族各有 `slvL`（`a:'armL'`）和 `slvR`（`a:'armR'`）两条，
看着是「左右各一条」。但 `doll.js:targetsOf` 会把 `armL` **镜像成 armL + armR**，
于是每侧收到「自己的 + 对方镜像的」两份**完全重叠**的几何 → Z-fighting。
修法是删掉 R 那份、只留 `a:'sleeveL'`，镜像归装配器管（和护肩/护手/靴同一套规矩）。
零件数 202 → 199。

**② 「剪影像素差」这个判据，按轮廓算不成立。**
计划书 §10 写「穿重甲 / 轻裘，剪影像素差 ≥ 15%」。先按 IoU 口径量，
三族只有 **3%** —— 因为三族都是**贴身甲**，身体挡住了外形，真正的差异在
甲片横纹 / 交领 V 字 / 斜挂带这些**表面**上，轮廓法根本看不见。
改成「角色区域内颜色不同的像素占比」后：A vs B 21.5%、A vs C 17.1%、B vs C 11.6%。
（test-doll 第 6 节算的是**单件**剪影，那是 40%~55% —— 两个口径不能混。）

**③ B vs C 只有 11.6%，这是真问题，不是测试太严。**
「重甲 vs 轻裘」是本槽点名的对比，一眼分不出就是没做到。
处理方式是**加厚重甲**而不是降低判据：`plate` 0.520×0.345×0.315 → 0.560×0.365×0.355，
甲片横纹和护心镜同步外推。**只动宽度和厚度、不动高度** —— 高度一变角色总高就跟着变，
那是 §10 第 3 条（总高 ≤ 2%）的验收线。加厚后 B vs C 过 15%，总宽仍在 8% 内。

### 验收怎么量的

```bash
node dev/test-doll.js         # 127 项契约（数据自洽 / 剪影 IoU / 八阶材质一致）
node dev/probe-doll-p2.js     # 33 项真机（四挂点 / 共用挂点隔离 / 让位 / 像素差 / 体量 / 摆动）
```

真机八节：① chest 一件占四个挂点（含左右袖镜像同形）② 腰带与胸甲共用 `torsoG` 互不覆盖
③ 三组自带件让位与归还 ④ 像素差 ≥ 15% ⑤ 总高 ≤ 2% / 总宽 ≤ 8%
⑥ 裙摆 20 帧跟着 skirt 摆动且无 NaN ⑦ 换装 10 次不叠加 / 120 次不泄漏 ⑧ 零报错。

> ⑥ 有个坑：**不能量 mesh 的 `worldPosition`**。合并后的 mesh 局部原点就在
> `skirt` 的旋转轴上，绕轴怎么转原点都不动 —— 第一版量出「20 帧只有 1 个位置」，
> 差点当成「裙摆不跟」。要量包围盒中心。

### 截图人工过

`dev/_shots/p2-*.png`（不入库）。结论：

- **重甲 vs 轻裘一眼可辨**：B 是从肩到腰的宽箱体、带三排甲片和护心镜；
  C 是贴身薄甲 + 斜挂带 + 腰侧小包。A 在中间（交领战袍 + 宽下摆）。
- **已知待调（记进 P4）**：B 的背面板是一整块（背光时偏暗、缺细节），
  和 P1 记的重氅同一个问题，需要 P4 的 accent 亮边；
  C 的腰侧 `pouch` 用 sub 通道，颜色偏亮，在深色甲上有点跳。

## 下一步

**P3：首饰与法器（amulet / ring / relic / fate），12 族（含 6 个光效族）。**

1. 骨架补 `relicG`（`DOLL_ANCHORS` 写的是 `torso`）与 `footG`（写的是 `root`）两个空槽。
2. `amulet` 挂 `torsoG` —— 和 chest / belt 三槽共用，靠 dress 的按-slot 记录隔离，
   P2 已经把这条路走通了，照抄。
3. `ring` 现在挂 `elbowL`（关节本体）。按 P1/P2 的教训应该收成 `ringL/R` 空槽，
   否则换戒指会把前臂几何清掉。
4. 「relic 跟人走」：法器是目录固定件，要确认它不参与随机掉落之外的槽位逻辑。
5. 光效族（`fate` / `relic` 的加色通道）走 `glowMat`，**单独成 mesh** ——
   `emissive` 是材质级的，P0 已经踩过。

验收：14/14 槽有表现；法器/命格有各自的静态或缓慢动画，不增 update 开销 > 0.2ms。

## 卡点

- **6 项拍板仍未定**（`EQUIP-DOLL-PLAN.md` §12；重点是 #1 重甲改不改体量、#2 品质色还染不染主色）。
  数据已经按方案写完了，如果拍板结果不同（比如重甲要更厚），改的是零件表的 `s` / `sc`，
  不是代码 —— 但这仍是**要返工的量**，越早定越省。
- **P2 已经动过一次 B 族的体量**（札甲加厚）。如果 §12 第 1 条最终决定「重甲不改体量」，
  这次改动要回退 —— 但那样 B vs C 的 15% 就过不去，得换别的办法拉开差距。
- 护肩偏宽 / 重氅与札甲背光过暗 / C 族腰包偏亮，三条美术问题记在 P4。
- 说明页那一节会与技能重构抢 `ui.js` 的同一个位置，**后落地的那个 rebase**。
