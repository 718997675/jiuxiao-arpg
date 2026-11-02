# Boss 技能重做 · 专题台账

- 分支：`feat/skill-refactor`（专题台账，同分支；做完后并进分支台账再删这份）
- 设计文档：`docs/BOSS-KITS.md`（§7 = 45 只本命技；§7.7 = 活物原语）
- 实验场：`docs/boss-vfx-playground.html`（单文件，内联 three.js，`file://` 直接开）
- 更新：2026-11-02 22:40

> 当前：**51 只全部进特效台；演出层（BFX 17 个原语）已经搬进游戏（`src/fx2.js`），
> 玩家的「被拖拽」状态位、可破坏目标（图腾 / 卵囊，带读秒）、正面格挡（岩甲 / 盾）都补上了**。
> 还差的是「谁在什么时候放招」—— 施法运行时一行没写，
> 所以玩家在游戏里仍然见不到这 45 只的技能。
> 回归：特效台 `probe-playground` 102 项、新层 `probe-fx2` 23 项、`probe-drag` 11 项、
> `probe-destructible` 28 项、`probe-frontguard` 16 项，契约 `test-fx2` 24 项 / `test-destructible` 29 项 /
> `test-frontguard` 23 项 —— 全绿；
> 重名 / 效果重复两轮清零（§8）。

## 一句话现状

旧的病是「换 Boss 只是换颜色」：13 种共享技撑 39 个技能位。现在三步走完了前两步 ——
**机制各自不同**（§7.2 判据：这一招逼玩家做的动作，和别的 44 只都不一样）、
**演出各自是"活物"**（留在场上、自己会动，不是画一下就没）。
第三步（进游戏）走到一半：演出层 + 拖拽状态位 + 可破坏目标（带读秒）都在了；
但**施法运行时一行没写** —— 谁在什么时候放哪一招、命中谁、扣多少，
这套还全在特效台的假人身上。领域乘区那一件也还在等。

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
| B19 | §2 五格总表也是手抄的（剑帝还写着旧配招） | ✅ | 加 `EXPORT:KIT` 标记，`boss-kits-export.js --write` 一起生成（45 只） | 本次提交 |

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

**接着要做的 —— 只剩一件**：**施法运行时**（最大的一块）。表已经有了
（B17.1：`BOSS_KIT` 45 只 / `BOSS_SKILLS` 88 招，全是生成物），差的是**垫片 + 调度**：
一层把「这一招什么时候放、命中谁、扣多少」接起来的代码。落点 `src/boss-cast.js`：
   `pickSkill(boss, dist)` → `castBossSkill(boss, id)` → 前摇 telegraph →
   结算（复用 `inHit` 的四种形状）→ `settle`。
   **判定与预警必须读同一组数字**，否则「圈画在这里、打到那里」。
   **垫片清单**（少一个 = 运行时 ReferenceError，特效台里发现不了）：
   `BOSS`/`DUMMY`、`N`/`R`/`WM`/`ph`、`aimAngle`/`aimDist`、`inHit`/`settle`、
   `floatText`/`nSay`/`hurtVignette`/`flashScreen`/`hitstop`、
   `moveDummy`/`markOnPlayer`/`bossGlide`/`bossLean`/`bossReset`/`bossLabelY`/
   `swingArm`/`speedSmear`/`label3d`/`labels`/`markForgotten`、
   `G`/`M`/`dot`/`limb`（几何与材质工厂，建议并进 `fx2.js` 的切片表）。
   `BFX`/`TEX`/`addUpdate`/`delay`/`seq`/`P`/`shake` 已经在 `fx2.js` 里。

## 卡点 / 已知短板

- **共享招只有 31 个，45 只摊下来必然有 2 格重合**（92 对）—— 这是池子决定的，
  不是漏查。判据已落到「最多 2 格」，别再往上加共享格。
- **特效台里那 45 只还没有任何一只进游戏**。搬完的是「怎么画」（`fx2.js`）
  与「踩上去会发生什么」（可破坏目标 / 正面格挡 / 领域乘区），
  **没搬「什么时候画」**—— 施法运行时一行没写。别看到 `src/fx2.js`
  就以为 Boss 战能打了。
- **机制位的文案是共享的**：`counter` 写在机制技上，换一只怪不会换措辞。
  实测把「魂锁拖拽」放到剑魂身上时，面板会说「脚下落腐蚀圈」—— 配表时要连带读文案，
  搭不上就换机制位，别只看形状。

- **移动中的判定表达不了**：只有六种静态形状。"扫到一半停下""墙慢慢推过来"
  只能把整段会挨到的范围一次画出来。要等 `zone` 支持带时间的扫掠形状。
- **实体在暗场里只能是"亮团"**：狼群 / 鹿群 现在像发光水母，读的是排布不是形。
  要有形得给 `entity` 低模（三角楔子 + 眼睛），属于建模层。
- **活物没有厚度**：trail 是贴地 ribbon、弧带是竖直单面片。给 trail 加截面
  （三角 / 四边形）是另一个量级的活。
- 特效台**暂不发预览站**（用户 2026-10-27 口径：本地验证即可）。
  要给人看只能本地开 `file://` 或截图（`dev/probe-playground.js --shots all`）。
