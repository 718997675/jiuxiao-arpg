# 推广方案 · 九霄·山海录

> 面向一个现实：这是个**没有美术、没有发行、没有预算**的个人项目。
> 所以推广的唯一杠杆是「**不用安装就能玩 + 一眼看出是自己写的**」。

---

## 一、先看清现状

| 项 | 现在 | 影响 |
|---|---|---|
| 仓库 | 刚建，0 star / 0 fork | 没有社会证明，点进来的人会立刻离开 |
| README | 有 6 张截图 + 1 段战斗动图 | ✅ 已达到「能看」的门槛 |
| About / Topics | **空** | 搜不到，GitHub 站内流量为 0 |
| Release | **无** | 没有版本概念，别人不知道该看哪个提交 |
| 可玩入口 | 已切到 `https://718997675.github.io/jiuxiao-arpg/` | 有固定域名，可直接转发；旧的 `workbuddy.host` 分享链接已废弃 |
| 外部曝光 | 0 | 没有任何入口带来流量 |

**结论：现在缺的不是代码，是「入口」和「门面」。** 下面按性价比排序。

---

## 二、第 0 步：仓库门面（30 分钟，收益最大）

### 1. About 描述

仓库首页右上角 ⚙️ → Description 填：

```
用 three.js 从零手写的 3D 中式暗黑 ARPG · 无构建 / 无素材 / 双击即玩 / 手机可玩
```

Website 填你的可玩地址。

### 2. Topics（决定 GitHub 站内能不能被搜到）

⚙️ 里逐个添加，GitHub 的搜索和「Explore」都吃这些标签：

```
threejs  arpg  webgl  game  javascript  action-rpg  diablo-like
hacktoberfest  browser-game  low-poly  procedural-generation  chinese-mythology
```

> `threejs` 和 `browser-game` 是最关键的两个——前者有稳定的探索流量，后者是英文用户的主要搜索词。

### 3. Social Preview

Settings → Social preview → Upload image，传 `docs/social-preview.png`（已生成，1280×640）。
**这一步影响所有社交平台分享时的缩略图**，没设的话分享出去是一块灰底。

### 4. 发一个 Release

Releases → Draft a new release：

- Tag: `v1.0.0`
- Title: `九霄·山海录 v1.0.0 —— 首个可玩版本`
- 正文：直接把 README 的「内容规模」段贴过去，再加一张动图

Release 的价值：**别人 star 的时候会顺手点 Watch**，而且以后每次更新都能再触发一次首页曝光。

### 5. 加 LICENSE

已加（MIT）。没有协议的仓库，很多人不敢 star——怕用了有法律风险。

---

## 三、第 1 步：给一个「点开就能玩」的入口（半天）

### itch.io 上架（强烈建议，优先级高于 GitHub Pages）

理由：itch.io 是**游戏玩家的聚集地**，来这里的人真的会玩；GitHub 来的多是看代码的。
而且 itch 支持「在浏览器里运行」，不用下载，转化率极高。

步骤：

1. 注册 https://itch.io → Dashboard → **Create new project**
2. Title: `九霄 · 山海录 / Jiuxiao Shanhailu`
3. Kind of project: **HTML**
4. 上传一个 zip（把 `index.html` + `src/` + `lib/` 打包，`index.html` 放根目录）
5. 勾选 **This file will be played in the browser**
6. Embed 尺寸填 `1280 × 720`，勾选 **Fullscreen button**
7. Tags: `action-rpg`, `hack-and-slash`, `threejs`, `low-poly`, `chinese`
8. Pricing: **No payments**（先免费积累口碑）
9. 封面图（Cover image）用 `docs/social-preview.png`

> 打包命令：
> ```bash
> cd /Users/niekai/WorkBuddy/2026-10-21-21-52-37
> zip -r jiuxiao-itch.zip index.html src lib -x "*.DS_Store"
> ```

**上架后把 itch 链接放到 GitHub 的 About 里**——itch 的域名比 `github.io` 更「像个游戏」。

### GitHub Pages（已启用，正式入口）

线上地址：<https://718997675.github.io/jiuxiao-arpg/>

Settings → Pages → Source: `Deploy from a branch` → `main` / `/ (root)`，仓库根目录即站点根目录（`.nojekyll` 已包含）。本地 `./push.sh` 推 main 即上线，30~60 秒生效。
得 `https://718997675.github.io/jiuxiao-arpg/`。

好处：所有 GitHub 访客都能「点一下就玩」，不用去 itch。缺点：国内访问慢。

---

## 四、第 2 步：首发（选 2 个渠道，不要全发）

**核心原则：第一次只发 2 个渠道。** 发 10 个的结果是每条都没人回复，然后全部沉底。

| 渠道 | 受众 | 该讲什么 | 优先级 |
|---|---|---|---|
| **V2EX · 分享创造** | 中文开发者，转化最好 | 技术实现 + 在线试玩 | ★★★ 必发 |
| **Reddit r/threejs** | 英文 three.js 用户，最精准 | 纯技术，讲怎么用 three.js 做的 | ★★★ 必发 |
| 掘金 | 中文前端 | 技术长文（可拆 3 篇） | ★★ 第二天发 |
| 小红书 | 泛用户，看画面 | 视觉 + 「一个人做的游戏」 | ★★ 有视频再发 |
| B站 | 玩家 | 30 秒实机 + 解说 | ★★ 需要录视频 |
| Show HN | 英文技术圈 | 技术亮点，风险高回报高 | ★ 谨慎 |
| indienova | 独立游戏圈 | 开发日志 | ★ 长期 |
| 知乎 | 搜索流量 | 「用 three.js 做 ARPG 有多难」 | ★ 长期 |
| NGA / 贴吧 | 玩家 | 容易被当广告删 | ✗ 不建议 |

### 首发文案（V2EX 版，可直接复制）

> **标题**：用 three.js 从零写了一个中式暗黑 ARPG，无素材无构建，点开就能玩
>
> **正文**：
>
> 花了些时间做了个浏览器 ARPG，纯前端，没有任何图片、音频、模型文件——地面是 Canvas 生成的纹理，角色是代码拼的几何体，音效是 WebAudio 现场合成的。
>
> 在线试玩（手机也能玩）：<链接>
> 源码：https://github.com/718997675/jiuxiao-arpg
>
> 几个自己比较满意的点：
>
> 1. **打击感**：命中瞬间有 40ms 顿帧 + 屏幕震动 + 白闪 + 击退，暴击会弹数字。挥砍动作是手写的关键帧插值，横向扫 130°，连击会左右交替。
> 2. **怪物血条**：按屏幕像素恒定高度渲染（`h = px/H * dist`），所以不管怪多远，血条在屏幕上都是同样粗细，不会近大远小。
> 3. **纸娃娃**：装备一穿，模型上的头盔/护甲/护肩会实时替换，用的是几何体拼装不是贴图。
> 4. **存档**：localStorage 在 iframe/隐私模式会抛异常，所以做了内存兜底 + 错误遮罩，至少不会白屏。
>
> 三职业、12 个 Boss、6 张地图、24 条随机词缀。
>
> 欢迎拍砖，尤其是手感和数值部分。

### 首发文案（Reddit r/threejs 版）

> **Title**: I built a Diablo-like ARPG in the browser with three.js — no textures, no models, everything is procedural
>
> **Body**:
>
> Every visual is generated in code: the ground is a canvas texture, characters are box/sphere/cone composites with flat shading, and all SFX are synthesized with WebAudio (no audio files at all).
>
> Play (works on mobile too): <link>
> Source: https://github.com/718997675/jiuxiao-arpg
>
> Technical bits that might interest this sub:
>
> - **~170 draw calls** at 60fps with 16 enemies on screen. Geometry is cached and shared (`boxGeo`, `sphGeo`, `cylGeo`), and materials are reused per-palette.
> - **Hit feedback**: 40ms hitstop (time scale → 0), camera shake, white flash on the enemy material, knockback impulse.
> - **Attack animation** is not baked — I wrote a keyframe table (`ATK_KEYS`) with smoothstep interpolation, applied as offsets on top of the walk cycle. Combo attacks mirror the pose on even hits.
> - **Health bars** are sprites scaled so their on-screen height stays constant regardless of distance: `h = px / viewportH * 0.849 * dist`.
> - Rendering uses `NoToneMapping` + linear output so hand-picked colors look exactly as authored.
>
> Happy to answer anything about the approach.

---

## 五、第 3 步：让更新本身成为曝光

单次首发只能带来一波流量。**持续曝光靠的是「版本节奏」。**

每次发布新版本时：

1. 打 tag（`v1.1.0`）+ 写 Release notes（列出新增内容，配 1-2 张图）
2. 在原帖下面回一条：「更新了 XX，加了坐骑系统」——**回自己的老帖比发新帖更安全，也更容易被老读者看到**
3. 发一条短动态（X / 即刻 / 掘金沸点），只放一张动图 + 一句话

节奏建议（和你 V2 的 Sprint 对齐）：

| 时间 | 版本 | 对外说的一句话 |
|---|---|---|
| 现在 | v1.0.0 | 首个可玩版本 |
| 装备扩容后 | v1.1.0 | 装备从 70 件扩到 210 件，加了符文之语 |
| 天赋树后 | v1.2.0 | 加了 120 个节点的天赋树 |
| 坐骑后 | v1.3.0 | 能骑马打仗了 |
| 剧情后 | v1.4.0 | 补了 5 章主线 |

**每次只讲一个新东西。** 一次说完，下次就没得说了。

---

## 六、把项目拆成内容（长期最有效的做法）

你手上其实有 6-8 篇能独立成文的技术点，每篇都能单独带来流量：

1. 怎么在纯 three.js 里做出「打击感」（顿帧 / 震屏 / 刀光 / 白闪的完整实现）
2. 手写关键帧动画系统：不用 GLTF，怎么用矩阵做人物动作
3. 程序化生成全部美术资源：Canvas 纹理 + 几何体拼装
4. 用 WebAudio 合成 18 种游戏音效（不加载任何音频文件）
5. 怪物血条为什么不能简单缩放（屏幕像素恒定高度的推导）
6. localStorage 的坑：iframe / 隐私模式下怎么不白屏
7. 手机端适配：虚拟摇杆 + 自动瞄准 + 竖屏布局
8. 一个 1.3 万行前端项目怎么组织（无构建、无框架）

**每篇文末放 GitHub 链接。** 技术文章的转化率远高于「我的游戏做好了」这种帖子——因为读者是先认可你的方法，再去看你的作品。

---

## 七、不要做的事

- ❌ **刷 star / 买 star**：GitHub 会掉，而且有经验的用户一眼看得出（star 数和 fork/watch 数不成比例）
- ❌ **第一次就发 10 个平台**：你没精力回复，帖子会沉
- ❌ **只丢链接**：几乎所有社区都会当广告删。必须写「我做了什么 + 遇到什么问题 + 怎么解决的」
- ❌ **在技术社区讲「我的游戏多好玩」**：那里的人关心「你怎么做的」
- ❌ **承诺时间表**：「下个月上线坐骑」这种话说出去做不到会掉信任
- ❌ **忽略评论**：前 2 小时的回复速度决定帖子能不能上热门

---

## 八、该看什么数据

| 指标 | 在哪看 | 什么算好 |
|---|---|---|
| GitHub star / clone | 仓库 Insights → Traffic | 单次发布 20-50 star 是正常水平 |
| 试玩转化 | itch.io 后台 / 自建埋点 | 从帖子点击到开始游戏 > 30% 算健康 |
| 平均游戏时长 | itch 后台有统计 | 单次 > 3 分钟说明留存可以 |
| 帖子回复数 | 各平台 | V2EX 有 5 条以上回复算成功 |

> 如果试玩转化很低（<10%），问题在**首屏**：可能是加载慢、要注册、或者手机上按钮点不到。
> 如果时长很低（<1 分钟），问题在**前 3 分钟**：玩家不知道该干什么，需要更明确的新手引导。

---

## 九、一句话总结

**先把 itch.io 挂上，让「点开就能玩」成立；再把 About/Topics/Release 补上，让搜得到；然后只发 V2EX 和 r/threejs 两个地方，认真回帖；之后每做完一个 Sprint 就打一个 tag、说一句新话。**

不要指望一次爆发。这类项目的 star 曲线通常是阶梯状——每次发布抬一个台阶。
