# Boss 技能重做 · 专题台账

- 分支：`feat/skill-refactor`（专题台账，同分支；做完后并进分支台账再删这份）
- 设计文档：`docs/BOSS-KITS.md`（§7 = 45 只本命技；§7.7 = 活物原语）
- 实验场：`docs/boss-vfx-playground.html`（单文件，内联 three.js，`file://` 直接开）
- 更新：2026-11-07 · **B24 每只首领自己的四拍（8 只主线）**

> 当前：**88 招真的在游戏里打出来了**。`src/boss-cast.js`（B21）+ `data-bosskits.js`
> （B17.1）接进 `game.js` 的 `bossPattern`：四拍轮转、每第 5 轮压轴出本命；
> `settle` 接 `Game.damagePlayer`、`moveDummy` 接 `Game.dragPlayer`。
> 同时玩家侧 37 只技能的整套画法进了 `src/sfx.js`（B20）。
> 真机探针 15/15（五格逐格点放全部 `got === id`），88 招全量试放 **88 有产出 / 0 空招 / 0 报错**。
> 2026-11-05 补 B22 + B23：预警形状加**地面暗底**（加法清边在亮地形上只剩一条线，
> 这就是「游戏里都是彩色圆环」的直接原因）；再补**竖向体积兜底** `BFX.lift` ——
> 静态统计出 **63/88 招一根竖的东西都没有**，按判定形状长柱子之后，
> 43 招在 46° 俯角下第一次有了高度（自带竖向的 45 招按 `vert:true` 跳过）。
> 2026-11-07 补 B24：**共享招还是那 31 段代码，但这一只放它的时候会变成自己的招**。
> 8 只主线首领 × 4 格 = 32 条自己的叫法 + 应对提示 + 命中拍的额外机制；
> 出招播报落在动作条上方。第 5 格（本命）不包 —— 它本来就是每只一个独立函数。

## 一句话现状

旧的病是「换 Boss 只是换颜色」：13 种共享技撑 39 个技能位。三步都走完了 ——
**机制各自不同**（§7.2 判据：这一招逼玩家做的动作，和别的 44 只都不一样）、
**演出各自是"活物"**（留在场上、自己会动，不是画一下就没）、
**进游戏了**（B21 `src/boss-cast.js`：四拍轮转 + 每第 5 轮压轴，
真机 15/15、88 招全量试放 0 空招 0 报错）。
再往后两级：**看不看得清**（B22 暗底 / B23 竖向兜底）、
**同一招放在不同 Boss 身上是不是同一招**（B24：8 只主线的四拍各自改名、各自加一层应对机制）。
剩下的只有「另外 37 只也照这个格式补」，不是结构上的缺口。

## 节点表

| 编号 | 名称 | 状态 | 产物 | 提交 |
|---|---|---|---|---|
| B1 | 45 只四格技能组 + 六只世界 Boss 进台 | ✅ | `docs/boss-vfx-playground.html`（名册 51）、`src/wbmodels.js` 六骨架移植 | `b7decd9` 前后 |
| B2 | 本命技 v1：8 个「动作语法」+ 45 行参数 | ❌ 已推翻 | —— | `3045864`（回滚对象） |
| B3 | 本命技 v2：`NR` 45 个独立函数，一只一个 | ✅ | `NR`（45 键）、`KIT` 第 5 格 `nt_<id>`、§7 整章 | `32786aa` |
| B4 | 三处「画了但看不见」：石台 / 判词光柱 / 尸潮第一波 | ✅ | `dgb_gaol` / `yellowspring` / `dgb_tomb` | `4496abc` |
| B5 | 交付图：六种动作不是六种颜色 | ✅ | `docs/screenshots/native-45-six-kinds.png` | `c0e7188` |
| B6 | **活物原语**：`trail` / `entity` / `pool` / `beam` / `wall` + 45 招全部改用它 | ✅ | playground `BFX` 6.9；§7.7 | 本次提交 |
| B7 | 回归脚本：契约 / 可见 / 残留 三段 | ✅ | 新建 `dev/probe-playground.js`、`dev/boss-kits-export.js` | 本次提交 |
| B8 | 残留清零：`trail` 的 updater、`pool.dead`、`wall.kill`、手搓 mesh、飘字 | ✅ | 5 处原语 + 4 处调用点；45/45 归零 | 本次提交 |
| B9 | 两只「读不出来」：堕天者的龙卷、阿修罗的三个头 | ✅ | 龙卷 = 四层旋转弧带（不是八层环、也不是螺旋 trail）；三面 = 亮边 + 淡填充 + 三颗浮眼 | 本次提交 |
| B10 | 文档与代码不再走散：§7.3 由脚本导出 | ✅ | `dev/boss-kits-export.js --write`（文档里埋 `EXPORT:NR` 标记） | 本次提交 |
| B11 | 重名 / 效果重复审计：`dev/dup-audit.js`（静态查重 + 运行时原语指纹）+ 51×5 人工矩阵 | ✅ | 新建 `dev/dup-audit.js`；§8 整章；对比图 `docs/screenshots/dup-audit.png` | 本次提交 |
| B12 | 4 组重名：尸潮 / 水位 / 风压（同 Boss 两格）、落石（跨系统） | ✅ | 本命改 骨浪 / 没顶 / 游龙；套路改 石雨 | 本次提交 |
| B13 | 焚天斩 = 三排火柱（和火墙、火线同一件事） | ✅ | 改成一刀 + 斩痕（`trail` 画）；火系三只去掉 `火线` | 本次提交 |
| B14 | 诅咒 vs 万魂缚：四只同时带着两招、画面一样 | ✅ | 诅咒改脚下紫钉（2.2 可躲），万魂缚保留 9 米必中 | 本次提交 |
| B15 | 导出器把扇面角度写成 `NaN°`（天门转） | ✅ | `hitText` 补 `span` 分支 | 本次提交 |
| B16.1 | **`src/fx2.js`**：17 个原语搬进游戏，**生成物**（源还是特效台） | ✅ | 新建 `src/fx2.js`、`dev/build-fx2.js`、`dev/test-fx2.js`、`dev/probe-fx2.js`；`index.html` / `fx.js` / `game.js` 四处接线；§9 整章 | 本次提交 |
| B16.2 | **玩家「被拖拽」状态位**：`Game.dragPlayer(x,z,dur)`，与定身分开 | ✅ | `game.js`（`pull` / `updatePlayer` 入口 / `statusBuffs`）、`dev/probe-drag.js` | 本次提交 |
| B16.3 | 可破坏目标：图腾 / 卵囊的血量与仇恨 | ✅ | `game.js`（`spawnDestructible` / `_buildDestructibleModel` / `destroyDestructible`、四处放行）、`dev/test-destructible.js`、`dev/probe-destructible.js`；`BOSS-KITS.md` §10 | 本次提交 |
| B16.4 | 减伤朝向：`e.guardFront {arc,mul,turn}`，`stonearmor` 用它 | ✅ | `game.js`（`FRONT_GUARD_DEFAULT` / `frontGuardOf` / `setGuardFront` / `damageEnemy` / 转身插值）、`dev/test-frontguard.js`、`dev/probe-frontguard.js`；`BOSS-KITS.md` §11 | 本次提交 |
| B16.5 | 限时 / 读条：可破坏目标的读秒 | ✅ | 同 B16.3（`d.ttl` 按帧递减 + `onExpire`）；Boss 自己的读条等状态机 | 本次提交 |
| B16.6 | 领域乘区：`Domains.add({preset,x,z,r,ttl,owner})` | ✅ | 新建 `src/domain.js`（6 预设 / `fieldSlow`+`fieldAspd` 独立字段 / 视野借 `WorldBoss._applySight`）、`dev/test-domain.js`、`dev/probe-domain.js`；`game.js` / `ui-minimap.js` / `index.html` 接线；`BOSS-KITS.md` §12 | 本次提交 |
| B17 | 两只之间撞招：剑族 3 只、镜族 3 只、石族 2 只各 4 格完全相同；摆渡人 == 黄泉 | ✅ | 只改 `KIT` 表，把「家族语言」从 4 格压到 ≤2 格；§8.5 整章 | 本次提交 |
| B18 | 指纹工具的 bug：`burst(pos,30,opts)` 只取第一个对象参数 → **数量全丢**，31 发和 1 发判成同一招 | ✅ | `describe` 合并全部对象参数 + 位置裸数字；次数进指纹（`×N` 分档） | 本次提交 |
| B17.1 | **技能表出得来**：`src/data/data-bosskits.js`（生成物，88 招 / 45×5） | ✅ | 新建 `dev/build-bosskits.js`（`--write` / `--check`）、`src/data/data-bosskits.js`、`dev/test-bosskits.js`；`index.html` 引入；特效台「遗忘」改成 `markForgotten()`；`BOSS-KITS.md` §13 | 本次提交 |
| B17.2a | **技能表补结算字段**：`mul` 88/88、`hitR` 25、`native`/`dmg`/`answer` 45 —— 第四道闸门 | ✅ | `dev/build-bosskits.js`（`META_FIELDS`/`EMIT_ORDER`/自检）、重新生成 `data-bosskits.js`（2649 行 / 97 KB）、`dev/test-bosskits.js` 第八节；`BOSS-KITS.md` §13.4 | 本次提交 |
| B19 | §2 五格总表也是手抄的（剑帝还写着旧配招） | ✅ | 加 `EXPORT:KIT` 标记，`boss-kits-export.js --write` 一起生成（45 只） | 本次提交 |
| B20 | **玩家侧技能演出层**：37 只技能的整套画法进游戏 | ✅ | 新建 `src/sfx.js`（生成物）、`dev/build-skillvfx.js`、`dev/probe-sfx.js`；`game.js` 的 `playSkillVfx` 改成「sfx 优先、配方兜底」；源 = `docs/vfx-playground.html` | `74d8025` |
| B21 | **施法运行时**：88 招真的在游戏里打出来 | ✅ | 新建 `src/boss-cast.js`（生成物）、`dev/build-bosscast.js`、`dev/test-bosscast.js`、`dev/probe-bosscast.js`；`game.js` 的 `bossPattern` 先问 BossCast、老 switch 兜底；CD 按出招结果设定；`fx.js` reset 里 `BossCast.clear()` | `74d8025` |
| B22 | 预警形状加**地面暗底**（亮地形上只剩一条线的真因） | ✅ | 特效台 `groundShade()` + `BFX.zone` 六个形状分支；重新生成 `src/fx2.js` | 本次提交 |
| B23 | **竖向体积兜底**：88 招里 63 招一根竖的都没有 → 按判定形状长柱子 | ✅ | 新原语 `BFX.lift`（第 18 个，特效台 6.10）；`BossCast._lift()` 在命中拍调用；`data-bosskits` 新增 `vert` 字段（生成器按源码算，45 自带 / 43 靠兜底） | 本次提交 |
| B24 | **每只首领自己的四拍**（先做 8 只主线 × 4 格 = 32 条） | ✅ | `src/data/data-bosstwist.js`（数据表）+ `src/boss-twist.js`（变形层，7 种 op）；`BossCast.tryCast` 在 run 后调 `BossTwist.apply`；`index.html` 新增 `#castbar` 出招播报、`UI.castBanner`；`dev/test-bosstwist.js` 24 项 / `dev/probe-bosstwist.js` 19 项 | 本次提交 |

## 下一步（按顺序，别跳）

**B16 六件已全部完成**（细节见 `BOSS-KITS.md` §9 / §10 / §11 / §12）：

- B16.1 `src/fx2.js` —— 17 个原语进游戏，**生成物**，改特效台后跑
  `node dev/build-fx2.js --write`。四处接线：`FX.init` 里 `bind`、
  `FX.update` 里 `update`、`FX.clear` 里 `clear`、`Game.syncFx2Actors()` 每帧同步锚点。
- B16.2 拖拽 —— `Game.dragPlayer(x, z, dur)`，和定身分开两个字段（理由见 §4 的注）。
- B16.3 / B16.5 可破坏目标 —— `Game.spawnDestructible({x,z,hp,ttl,onExpire,onDeath})`。
  复用 `enemies`，四处显式放行（同屏上限 / AI 段 / 击杀结算 / 读秒环回收）；
  读秒按帧递减，**不许 `setTimeout`**。
- B16.4 正面格挡 —— `e.guardFront = { arc, mul, turn }` + `setGuardFront()`。
  `arc` 是总张角（半角只在 `π·arc/360` 一处换算）；`turn` 接进了转身插值，
  所以「转身 1.2 秒」是真的。默认值 = 刑天那三个数，世界 Boss 的数值一个没变。
- B16.6 领域乘区 —— `Domains.add({ preset, x, z, r, ttl, owner })` → `{ zone, kill }`。
  写**另外两个字段** `fieldSlow` / `fieldAspd`（世界 Boss 每帧归位 `domSlow`，
  共用一个字段迟早互相抹掉）；视野**借** `WorldBoss._applySight`、不抄一份夜色算法。

**B21 施法运行时已完成**（`src/boss-cast.js`，生成物，源还是特效台）：

- 选招：`_pick(e)` —— 四拍（机制 / 套路A / 套路B / 签名）固定轮转，
  每第 5 轮出第 5 格（本命）。**两个计数器不能合成一个**：`_castN` 判压轴、
  `_round` 判四拍里第几拍；合成一个会把四拍整体推移一位（测试抓出来的）。
- 三道闸 `canCast`：没死 / 上一招没演完（`_castUntil`）/ 玩家在交战半径内。
- **CD 必须按出招结果设定**：先设满 4.5~7.5 秒再出招，一旦 `tryCast` 拒绝
  （上一招没演完）整轮就白等 —— 实测 25 秒只出 2 招。现在是
  `e.patternCd = casted ? RND(4.5,7.5)*(1-phase*0.12) : 0.8`。
- 归属：`FX2.stepHook` 每帧把 `CUR` 切回 updater 自己的主人，
  否则两只怪同时放招时，前一只的 `delay` 回调会把伤害算到后一只头上。
- 生成物的三个坑（都已修，别再踩）：① `toString()` 拿不到闭包，
  `nt_*` 包装层里的 `o.hit()` 生成后 `o` 不存在 → 45 只第 5 格全废，
  而契约测试只看 `typeof run === 'function'` 照样全绿；② `P` 不在 fx2 里，
  写进导出就是 ReferenceError，会在 IIFE 里炸掉整个文件；③ 创建时守卫是**假守卫**
  （`if(BOSS.g)` 判一次、1.2 秒后才用，首领中途死了就是 `null.position`）。

**接着要做的 —— B24 之后还剩什么**：

1. ✅ 地面暗底（`groundShade`）。幽篁林 `slam` 从「一条橙线」变成「暗盘 + 亮边」。
2. ✅ 竖向体积兜底（`BFX.lift`）：**63 招一根竖的都没有**是"全长一样"的根因。
   现在按判定形状长柱子 —— 圆 → 环柱、环 → 内外两圈、矩形 → 两侧柱列、
   扇形 → 前沿柱林、散射 → 每落点一根、self → 围自己一圈。
   已经有 `column/spikes/boulder/wall/blade/entity/beam` 的 45 招跳过（`vert:true`）。
3. ✅ **8 只主线首领的四拍**（B24）：每格一个自己的名字 + 一句应对 + 命中拍的额外机制。
   7 种 op：`domain`（留持续区）/ `pull`（拽，冲刺可挣脱）/ `spikes`（外圈长刺，**内圈安全**）/
   `volley`（追着炸，每发读实时位置）/ `echo`（同点再炸，别回原位）/ `mark`（脚下读秒）/
   `guard`（正面格挡，**绕背**）。判据是「同一只四拍覆盖四种不同的动作」，测试会拦。
4. ⬜ **剩下 37 只**（八部 / 地宫 / 支线 / 世界 Boss 侧）还没写 `BOSS_TWIST`。
   没写不是坏了 —— 变形层是可选层，播报退回共享招原名，行为与老版本一致。
   照 B24 的格式一只一只补，**先查它五格里哪几格是共享招**（第 5 格 `nt_*` 不许写）。
5. ⬜ **兜底层的局限**：同形状的两招拿到的柱子仍是同一套排布。
   B24 的变形层补上了"应对动作不同"，但柱子排布没变；要给某只换专属竖向件，
   在它的 ops 里直接调 `BFX.*`（`spikes` 就是这么做的）。
6. ⬜ **环形的暗底偏薄**：`ring` 的暗底就是环带本身，内圈不暗 ——
   语义上是"环内安全"，所以别急着补；要补就先改判定。

## 卡点 / 已知短板

- **共享招只有 31 个，45 只摊下来必然有 2 格重合**（92 对）—— 这是池子决定的，
  不是漏查。判据已落到「最多 2 格」，别再往上加共享格。
- ~~特效台里那 45 只还没有任何一只进游戏~~ —— **B21 已接**。
- ~~俯角下全长一样~~ —— **B23 的兜底层已经让 43 招有了高度**。
  剩下的短板是「同形状仍趋同」，见上第 3 条。
- ~~机制位的文案是共享的~~ —— **B24 的出招播报已经盖掉这一层**：播报读的是
  `BOSS_TWIST` 里「这一只自己的叫法 + 这一只逼你做什么」，不是共享招的 `counter`。
  但**没写进 `BOSS_TWIST` 的 37 只仍会退回共享文案**，补表时别只看形状，要连带读文案。

- **移动中的判定表达不了**：只有六种静态形状。"扫到一半停下""墙慢慢推过来"
  只能把整段会挨到的范围一次画出来。要等 `zone` 支持带时间的扫掠形状。
- **实体在暗场里只能是"亮团"**：狼群 / 鹿群 现在像发光水母，读的是排布不是形。
  要有形得给 `entity` 低模（三角楔子 + 眼睛），属于建模层。
- **活物没有厚度**：trail 是贴地 ribbon、弧带是竖直单面片。给 trail 加截面
  （三角 / 四边形）是另一个量级的活。
- 特效台**暂不发预览站**（用户 2026-10-27 口径：本地验证即可）。
  要给人看只能本地开 `file://` 或截图（`dev/probe-playground.js --shots all`）。
