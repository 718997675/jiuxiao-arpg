# PINOC 动作 → 九霄山海录

把 PINOC MCP 生成的 3D 动作接进游戏里的这套工具。

## 为什么需要转接

| | PINOC 输出 | 游戏里的角色 |
|---|---|---|
| 骨骼 | 441 骨 MetaHuman / Mixamo 骨架 | 6 个 Group（legL / legR / torso / headG / armL / armR） |
| 网格 | 无（纯骨骼动画） | BoxGeometry 拼的盒子 |
| 动画 | GLB / FBX clip | `ATK_KEYS` 关键帧表 + `updateActorAnim()` |

两者骨架结构完全不同，GLB **不能**直接丢进 `dist/`。`bake-motion.mjs` 的做法是：
解析 GLB，逐帧算出「上臂→前臂」「大腿→小腿」这些骨骼连线的方向向量，
再换算成盒子的欧拉角曲线，抽稀成 `[[进度, 弧度], ...]` 关键帧表——
正好是 `ATK_KEYS` 已有的格式，所以**游戏引擎一行都不用改**。

## 三步

```bash
# 1) 从 PINOC 拿到 GLB，丢进 dev/motion/clips/
#    get_asset 会返回带签名的下载链接，直接 curl 下来（download_asset 只能本地连接用）

# 2) 烘焙。先 --dump-bones 确认骨架命名认得出
node dev/motion/bake-motion.mjs dev/motion/clips/warrior_cleave.glb --dump-bones
node dev/motion/bake-motion.mjs dev/motion/clips/warrior_cleave.glb \
     --name=warrior_cleave --out=dev/motion/clips/warrior_cleave.js

# 3) 粘进 src/actors.js 的 ATK_KEYS 里（脚本会打印现成的代码块）
```

## 接进游戏

粘进 `ATK_KEYS` 之后，在技能施放入口把 `atkType` 换成新键名：

```js
// src/game.js 里原本是：
this.actor.atkAnim = 1; this.actor.atkType = 'swing'; this.actor.atkSpeed = 2.5;
// 换成：
this.actor.atkAnim = 1; this.actor.atkType = 'warrior_cleave'; this.actor.atkSpeed = 0.33;
```

`atkSpeed` 要设成 **1 / 动作时长**，烘焙脚本在输出注释里已经算好了，
不设的话动作会被基础节奏拖着走，看着发飘。

`atkAnim` 从 1 倒数到 0，`p = 1 - atkAnim` 就是播放进度，
所以这张表和 `swing`/`cast`/`slam` 是同一套逻辑，叠加在行走摆臂之上。
角色静止时基础摆臂只有 ±0.06，基本看不出来。

## 校准（第一次跑必须看一眼）

烘焙脚本会自动判定左右镜像（比较左右上臂骨骼的静止 X 坐标），但方向符号
在你自己的角色上不一定对。用预览台看一眼最稳妥：

```bash
open dev/motion/preview.html      # 三个职业同屏，粘关键帧表进去点「应用」
```

也可以在真实游戏里验：`dev/` 下已经有现成的 puppeteer 脚本可以照抄。

| 症状 | 原因 | 修法 |
|---|---|---|
| 动作完全左右反了 | 镜像判定错 | 加 `--no-mirror-x` 重烘 |
| 手臂是反着抬的 | 前后符号反 | 手工把 `armRx` / `armLx` 的值取负 |
| 动作前后颠倒 | 模型朝向是 -Z | 预览台里 `a.group.rotation.y = Math.PI` 对照，或把 `tPosZ` 取负 |
| 动作幅度过大/过小 | 单位尺度差 | `--eps` 只影响抽稀，幅度要调 `tPosY` / `tPosZ` 的 `posScale` |
| 首尾抽一下 | 首尾没归零 | 脚本已经对齐首帧并回零，若仍有说明 clip 不是循环动作，属正常 |

## 抓动作的 prompt 模板

PINOC 的 `generate_motion` 一次给 4 个样本、1 积分/秒，**3 秒的动作 = 3 积分**。
免费动作库（`list_motion_library` / `take_library_motions`，一次最多 25 个）
已经有走、跑、待机、欢呼这类基础位移，别花积分去做。

三个职业各一个招牌技能（约 9 积分）：

**战士 · 大刀横斩**
```
A powerful horizontal cleave with a heavy dao: plant the feet, wind the torso
back over the right shoulder, then whip the whole body around and slash across
the body to the left, ending in a low follow-through. 3 seconds, grounded and
weighty, both feet stay planted.
```

**法师 · 聚火球前推**
```
An arcane casting motion: draw both hands back toward the chest while leaning
back slightly to gather energy, hold for a beat, then thrust both palms forward
and release, the torso following through. 3 seconds, feet planted, no walking.
```

**道士 · 掐诀甩符**
```
A daoist talisman throw: snap the right hand through two quick mudra gestures in
front of the chest, then flick the arm outward and release a talisman forward
while the left hand holds a seal at the chest. 3 seconds, rooted stance, calm and
precise.
```

## 脚本参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--name` | 文件名 | 输出表里的键名，同时是 `atkType` 的值 |
| `--clip` | 0 | GLB 里有多条 clip 时选第几条（`--dump-bones` 会列出来） |
| `--fps` | 30 | 采样帧率，30 足够，60 只是关键帧更多 |
| `--eps` | 0.02 | 抽稀阈值（弧度）。调大关键帧更少更省，但细节会丢 |
| `--out` | 打印到 stdout | 写文件 |
| `--dump-bones` | — | 只列骨架和 clip，不烘焙。**第一次跑先来这个** |
| `--no-mirror-x` | — | 关掉自动左右镜像 |
