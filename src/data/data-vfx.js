/* ============================================================
 * 特效配方（V0 · 配方 DSL v2）
 *
 *   docs/SKILL-VFX-PLAN.md §3「形 / 色 / 时 三层分离」的数据层。
 *
 * ---------------- 为什么要有这一层 ----------------
 * 「6 元素 × 5 槽 × 3 职业 = 90 种画面」如果一条条手写就是 90 套，改一次全崩。
 * 拆成三层之后：
 *   形 —— `SKILL_VFX[id].cast/loop/impact`（15 条剪影，招式长什么样）
 *   色 —— `ELEM_PROFILE[elem]`（6 份材质：贴图 / 残留 / 重力方向）
 *   时 —— 三段式数组本身就是时间轴（起手 → 循环 → 命中）
 * 播放时由 `src/vfx.js` 的 `VFX.play(recipe, ctx)` 合成，**元素不参与剪影**，
 * 只换贴图与颜色 —— 所以手写量是 15 + 6，不是 90。
 *
 * ---------------- 两条硬规矩 ----------------
 * 1. **本文件不许碰 THREE**（纯数据 + 纯函数）。这样 node 侧能直接跑契约，
 *    也不用为了测一条配方去开浏览器。
 * 2. **台阶用 patch 不用 copy**（§3）：`tiers[n]` 只写差异，整段覆盖。
 *    写整条会变成「5 级之后 1~4 级的改动全部失效」，而且改一处要改六份。
 *
 * ---------------- 数值口径 ----------------
 * 所有 `r` / `dist` 是**米**，和判定半径同一把尺子。特效画多大就该打多大 ——
 * 这里的数不是美术随意填的，`ctx.radius` 通常直接来自 `SKILLS[id].radius`。
 * ============================================================ */
'use strict';

/* ---------------- 元素材质（6 套） ----------------
 * 三件东西：贴图格（形）、色值（色）、残留贴花（世界被打过的证据）。
 * 另外三个数字决定**运动方向**，这是 §13 验收里明写的一条：
 * 「火的粒子上升、冰的粒子直线硬停、毒的粒子下沉翻滚 —— 三者运动方向可辨」。
 *   up    垂直初速（正 = 向上）
 *   grav  重力（正 = 下坠；负 = 上飘）
 *   drag  阻尼（越大停得越快 → 冰就是靠这个「硬停」）
 */
const ELEM_PROFILE = {
  phys: {
    tex: 'spark', decal: 'crack', color: 0xffe0c0,
    up: 0.6, grav: 9, drag: 2.0, scatter: 1.0, size: 0.22
  },
  fire: {
    tex: 'ember', decal: 'scorch', color: 0xff7a30,
    /* 火往上走：负重力 + 正向初速。drag 小一点，让它飘得久 */
    up: 1.8, grav: -2.4, drag: 0.9, scatter: 1.15, size: 0.26
  },
  ice: {
    tex: 'shard', decal: 'frost', color: 0x8ad8ff,
    /* 冰「直线硬停」：初速有，但 drag 很大 + 重力大，甩出去就掉地上不动了 */
    up: 0.4, grav: 10, drag: 4.2, scatter: 0.75, size: 0.2
  },
  lightning: {
    tex: 'spark', decal: 'crack', color: 0x9ad8ff,
    /* 雷是瞬时的：散射最散、阻尼最小，靠 bolt 的折线撑形状 */
    up: 0.5, grav: 6, drag: 0.7, scatter: 1.7, size: 0.2
  },
  poison: {
    tex: 'smoke', decal: 'acid', color: 0x9adf60,
    /* 毒往下沉、翻滚：负初速 + 负重力 + 低阻尼（一直往下漂） */
    up: -0.8, grav: -1.2, drag: 1.2, scatter: 0.9, size: 0.3
  },
  sigil: {
    tex: 'rune', decal: 'frost', color: 0xfff2b0,
    up: 1.0, grav: 2.2, drag: 1.6, scatter: 0.85, size: 0.24
  }
};

/* ---------------- 解释器认得的指令 ----------------
 * 每个 `t` 对应 `src/vfx.js` 里的一个处理函数。**这里列全**是刻意的：
 * 契约测试会拿这张表去校验每一条配方 —— 打错一个字（`shcok`）在游戏里
 * 表现是「这个技能没特效」，但不会报错，最难查。所以宁可在这里多写一行。
 */
const VFX_OPS = {
  spr: '贴图粒子（贴图 / 色 / 重力由元素材质给）',
  trail: '带状拖尾（刀光余影 / 弹道残影）',
  bolt: '折线闪电（带分叉）',
  shock: '冲击波（地面环 + 竖直气浪 + 尘环）',
  decal: '地面贴花（焦痕 / 霜 / 酸斑 / 裂痕）',
  arc: '立体刀光（倾斜扇面 × n）',
  vortex: '螺旋上升气流（旋风斩的「转」）',
  cone: '扇形喷射（火 / 毒 / 冰的「喷」）',
  geyser: '地面喷发柱（落雷 / 火柱 / 冰刺）',
  ring: '外扩光环（瞬发一圈）',
  beam: '竖直光柱（陨石的前摇火线 / 召唤的光束）',
  flash: '局部闪白（**只许在落点半径内**，禁止全屏）'
};

/* 配方里允许出现的顶层键。tier patch 也只许写这些 —— 写别的键等于写了个
 * 永远不会生效的东西，契约会拦。 */
const VFX_KEYS = ['sil', 'elem', 'color', 'tex', 'decal', 'cast', 'loop', 'impact', 'tiers'];

/* ---------------- 指令上的 `at`：相对施法瞬间的延迟（秒） ----------------
 * 这不是第 12 个原语，是**任何**指令都能带的一个修饰键（P5 加的）。
 *
 * 为什么值得为它改解释器：「余震 / 二次崩塌 / 收尾爆燃 / 收窗新星」这四类
 * 台阶要的是**同一套几何晚一点再播一次**，而不是一个新形状。没有 `at` 的话
 * 只能靠「再加一条 shock」—— 那是 3 次绘制，而预算早就满了（见 §2 的 6 次）。
 * 有了 `at`，进化只花时间轴，不花绘制预算。
 *
 * 口径：`at` 从**施法那一帧**算起，与 `impact` 的 `ctx.delay` 无关；
 * 换图时由 `VFX._later` 的 `mapGen` 一起作废。 */

/* ============================================================
 * 15 条剪影：一职业 5 个功能位
 *
 * 每条只描述「招式长什么样」，不写死颜色与贴图 —— 那两样由 `elem:'elem'`
 * 从元素材质里取。唯一例外是刀客的兵形（`elem:'phys'`）：它是刀，不是元素。
 *
 * `ctx.radius` 决定尺寸；配方里的 `r` 是**半径倍率**而不是绝对值，
 * 这样同一个配方套到 3 码 / 9 码的技能上都不会画错。
 * ============================================================ */
const SKILL_VFX = {
  /* ==================== 刀客 ==================== */
  /* ① 连斩 / 旋风斩：**旋转** —— 两到四道倾斜刀气在绕圈 + 脚下螺旋气流 */
  whirl: {
    sil: 'spin', elem: 'phys', color: 'elem', tex: 'elem', decal: 'elem',
    cast: [{ t: 'arc', n: 2, tilt: 0.35 }],
    loop: [{ t: 'vortex', r: 0.52, dur: 0.6, helix: 1 }],
    /* [P5·预算] 命中段从 `shock`（3 次绘制）换成 `ring`（1 次）：
     * 这个位的进化要「刀气从 2 道加到 3 道」（+1）和「9 级留焦痕」（+1），
     * 基础段占满 6 次的话两级进化必然撞墙（实测 5 级 7 次 / 9 级 9 次）。
     * 冲击的「砸地感」由 ring + 后续的焦痕一起给，不是只有 shock 能表达。 */
    impact: [{ t: 'ring', r: 0.3 }],
    tiers: {
      /* 进化 Ⅰ「横扫后原地余震 2 秒」：螺旋加到 2 圈（转得更明显）+ 命中环拖到 1.8 秒。
       * 余震**不另加一条 shock** —— 那是 3 次绘制，5 级会直接到 7（预算 6）。 */
      5: {
        loop: [{ t: 'vortex', r: 0.66, dur: 0.6, helix: 2 }],
        impact: [{ t: 'ring', r: 0.4, dur: 1.8 }]
      },
      /* 进化 Ⅱ「撕裂」：第三道刀气 + 地面焦痕（打过的痕迹） */
      9: { cast: [{ t: 'arc', n: 3, tilt: 0.35 }], decal: 'scorch', impact: [{ t: 'decal', r: 0.55 }] },
      /* 终极「可常驻」：loop 换成「一道闭合刀轨 + 单圈螺旋」（同价换形，不是加量），
       * 焦痕留 8 秒 —— 「常驻」读的是地上那圈痕迹一直在，不是再炸一次。 */
      10: {
        cast: [{ t: 'arc', n: 3, tilt: 0.35 }],
        loop: [
          { t: 'trail', r: 0.62, n: 16, h: 1.0, dur: 0.7 },
          { t: 'vortex', r: 0.66, dur: 0.6, helix: 1 }
        ],
        impact: [{ t: 'decal', r: 0.55, dur: 8 }]
      }
    }
  },
  /* ② 裂地震击：**纵向塌陷** —— 裂纹预警 + 地面向下塌 + 垂直尘柱
   *
   * [P5·预算] 基础段的尘柱（`geyser`）挪到 5 级「余震」去：
   * 三段进化每段都要多一层，基础段就得先让出一次绘制。让出来的是
   * **最后才被玩家注意到的那一层**（尘），而不是预警圈与冲击波。 */
  quake: {
    sil: 'sink', elem: 'phys', color: 'elem', tex: 'dust', decal: 'crack',
    cast: [{ t: 'ring', r: 0.9, dur: 0.35 }, { t: 'decal', tex: 'crack', r: 0.7 }],
    loop: [],
    impact: [{ t: 'shock', r: 0.55, dust: 2 }],
    tiers: {
      /* 进化 Ⅰ「余震钉住敌人」：补上垂直尘柱（地面往上翻的那一下） */
      5: {
        impact: [
          { t: 'shock', r: 0.62, dust: 2 },
          { t: 'geyser', r: 0.3, n: 16, dir: 'up', shock: false }
        ]
      },
      /* 进化 Ⅱ「地裂范围扩大」：预警裂纹撑到 0.95，冲击与尘柱一起放大；
       * 尘柱晚 0.08 秒起 —— 先塌、再扬尘，两件事不再挤在同一帧 */
      9: {
        cast: [{ t: 'ring', r: 1.05, dur: 0.35 }, { t: 'decal', tex: 'crack', r: 0.95 }],
        impact: [
          { t: 'shock', r: 0.8, dust: 2 },
          { t: 'geyser', r: 0.4, n: 20, dir: 'up', shock: false, at: 0.08 }
        ]
      },
      /* 终极「地裂二次崩塌」：0.3 秒后的第二圈塌陷环（`at`）——
       * 「二次」是**时间轴**上的事，不是再加一条 shock（那要 3 次绘制，会到 7）。 */
      10: {
        cast: [{ t: 'decal', tex: 'crack', r: 1.1 }],
        impact: [
          { t: 'shock', r: 0.9, dust: 2 },
          { t: 'geyser', r: 0.5, n: 24, dir: 'up', shock: false },
          { t: 'ring', r: 0.45, at: 0.3, dur: 0.9 }
        ]
      }
    }
  },
  /* ③ 剑阵：**环绕轨道** —— 剑影沿椭圆绕身 + 每把带短拖尾（有高度、有轨道） */
  swordarray: {
    sil: 'orbit', elem: 'phys', color: 'elem', tex: 'spark', decal: null,
    cast: [{ t: 'trail', r: 0.8, n: 12, h: 1.4, dur: 0.5 }],
    loop: [{ t: 'spr', n: 8, tex: 'spark', r: 0.85, h: 1.2, dur: 1.2 }],
    impact: [{ t: 'ring', r: 0.95, dur: 0.4 }],
    tiers: {
      /* 进化 Ⅰ「剑阵内敌人减速」：第二圈剑轨（高 1.9 米，读作「阵」不是「一圈光」） */
      5: {
        cast: [
          { t: 'trail', r: 0.8, n: 12, h: 1.4, dur: 0.5 },
          { t: 'trail', r: 1.05, n: 12, h: 1.9, dur: 0.5 }
        ]
      },
      /* 进化 Ⅱ「剑阵内减伤」：脚下多一层护罩环（1.2 秒慢扩，和剑轨分得开） */
      9: {
        loop: [
          { t: 'spr', n: 8, tex: 'spark', r: 0.85, h: 1.2, dur: 1.2 },
          { t: 'ring', r: 0.95, dur: 1.2 }
        ]
      },
      /* 终极「剑阵内自动反击」：命中段补一道贴地横斩（剑自己出手） */
      10: {
        impact: [
          { t: 'ring', r: 0.95, dur: 0.4 },
          { t: 'arc', n: 1, tilt: 0.15 }
        ]
      }
    }
  },
  /* ④ 血怒：**从脚下冒** —— 不是包在外面的壳（那是 ④ 护盾的语义） */
  bloodrage: {
    sil: 'riser', elem: 'phys', color: 'elem', tex: 'ember', decal: null,
    cast: [{ t: 'spr', n: 14, tex: 'ember', r: 0.5, dir: 'up', dur: 0.8 }],
    loop: [{ t: 'ring', r: 0.6, dur: 0.5 }],
    impact: [],
    tiers: {
      /* 进化 Ⅰ「增益期间吸血」：脚下一圈血雾向外摊开（往回收的读法） */
      5: {
        loop: [
          { t: 'ring', r: 0.6, dur: 0.5 },
          { t: 'spr', n: 8, tex: 'ember', r: 0.35, dir: 'out', dur: 0.6 }
        ]
      },
      /* 进化 Ⅱ「击杀延长」：0.2 秒后的心跳式脉冲环（不是和起手同一帧出） */
      9: { impact: [{ t: 'ring', r: 0.75, at: 0.2, dur: 0.6 }] },
      /* 终极「增益期间免疫控制」：身上多一道护体血轨（绕身一圈，有高度） */
      10: {
        impact: [
          { t: 'ring', r: 0.75, at: 0.2, dur: 0.6 },
          { t: 'trail', r: 0.5, n: 14, h: 1.5, dur: 0.9 }
        ]
      }
    }
  },
  /* ⑤ 兵形：**切换姿态** —— 脚下金环 + 一圈短刀光，轻、快、不占屏 */
  avatar: {
    sil: 'stance', elem: 'phys', color: 0xffd166, tex: 'spark', decal: null,
    cast: [{ t: 'ring', r: 0.55, dur: 0.3, color: 0xffd166 }],
    loop: [],
    impact: [{ t: 'arc', n: 1, tilt: 0.2, color: 0xffd166 }],
    tiers: {
      /* 进化 Ⅰ「刃势满层 · 断岳斩」：第二道**立起来**的刀气（tilt 0.5 = 半圆护体） */
      5: {
        impact: [
          { t: 'arc', n: 1, tilt: 0.2, color: 0xffd166 },
          { t: 'arc', n: 1, tilt: 0.5, color: 0xffe6a8 }
        ]
      },
      /* 进化 Ⅱ「切换刀式保留刃势」：地上留一块刀痕（换式不再「什么都没留下」） */
      9: {
        impact: [
          { t: 'arc', n: 1, tilt: 0.2, color: 0xffd166 },
          { t: 'arc', n: 1, tilt: 0.5, color: 0xffe6a8 },
          { t: 'decal', r: 0.4 }
        ]
      },
      /* 终极「剑神降世」：起手开窗（金环 + 光柱），刀气变双道 + 2 秒长环。
       * 起手段换掉基础那一圈单环 —— 同一个动作不画两个同心圆。 */
      10: {
        cast: [
          { t: 'ring', r: 0.7, dur: 0.5, color: 0xffd166 },
          { t: 'geyser', r: 0.25, n: 14, dir: 'up', dur: 0.7, shock: false, color: 0xffd166 }
        ],
        impact: [
          { t: 'arc', n: 2, tilt: 0.18, color: 0xffd166 },
          { t: 'ring', r: 0.6, dur: 2.0, color: 0xffd166 }
        ]
      }
    }
  },

  /* ==================== 法师 ==================== */
  /* ① 火球：**飞行体** —— 核心白 + 外晕元素色的光球，带拖尾 */
  fireball: {
    sil: 'boltfly', elem: 'elem', color: 'elem', tex: 'elem', decal: 'elem',
    cast: [{ t: 'spr', n: 6, tex: 'soft', r: 0.2, dir: 'fwd' }],
    loop: [{ t: 'trail', r: 0.15, n: 8, dur: 0.3 }],
    impact: [{ t: 'flash', r: 0.5 }, { t: 'spr', n: 12, r: 0.35 }, { t: 'decal', r: 0.45 }],
    tiers: {
      /* 进化 Ⅰ「爆炸范围 +50%，爆炸处留火海」：爆点放大 + 焦痕 6 秒 +
       * 0.1 秒后一圈慢扩环（「火海铺开」是**后到**的，不是和闪光同一帧） */
      5: {
        impact: [
          { t: 'flash', r: 0.75 },
          { t: 'spr', n: 16, r: 0.5 },
          { t: 'decal', r: 0.6, dur: 6, at: 0.15 },
          { t: 'ring', r: 0.35, at: 0.1 }
        ]
      },
      /* 进化 Ⅱ「环绕火球」：飞行段变成**绕身一圈**（0.55 米椭圆轨）+ 三颗伴飞光点。
       * 这一级改的是 loop，不是 impact —— 环绕是「飞的时候」的事。
       * 命中段的慢扩环让位给这一圈轨（预算 6 次，两者只能留一个）。 */
      9: {
        loop: [
          { t: 'trail', r: 0.55, n: 12, h: 0.9, dur: 0.9 },
          { t: 'spr', n: 4, r: 0.4, h: 1.0, dur: 1.2 }
        ],
        impact: [
          { t: 'flash', r: 0.75 },
          { t: 'spr', n: 16, r: 0.5 },
          { t: 'decal', r: 0.6, dur: 6, at: 0.15 }
        ]
      },
      /* 终极「飞弹自动索敌」：命中后 0.12 秒补一圈追索环 + 火海 8 秒。
       * loop 收回单条轨（预算让给命中段的第 4 条指令）。 */
      10: {
        loop: [{ t: 'trail', r: 0.55, n: 12, h: 0.9, dur: 0.9 }],
        impact: [
          { t: 'flash', r: 0.9 },
          { t: 'spr', n: 20, r: 0.6 },
          { t: 'decal', r: 0.7, dur: 8, at: 0.15 },
          { t: 'ring', r: 0.5, at: 0.12 }
        ]
      }
    }
  },
  /* ② 陨石：**从天而降** —— 高空垂直火线 + 落点收缩预警 + 蘑菇状冲击
   *
   * [V0·预算] 命中段**不用 `shock`**，拆成「冲击环 + 向下碎屑柱」：
   * `shock` 是环 + 竖直气浪 + 尘环三件套 = 3 次绘制，而这里的碎屑柱
   * （`geyser` 26 颗，`dir:'down'`）已经把「尘」和「高度」都说完了 ——
   * 再叠一套就是同一个意思画两遍。原来 8 次绘制（超预算 2），现在 6 次。
   * 起手段的圈 + 火线必须留着：0.9 秒的前摇里，玩家要靠它们知道砸哪儿、砸多大。
   *
   * [P5·预算] 基础段只留冲击环（1 次），碎屑柱与焦痕都下放到 5 / 9 级：
   * 三段进化每段各加一层，基础段必须先空出两次绘制。 */
  meteor: {
    sil: 'fall', elem: 'elem', color: 'elem', tex: 'ember', decal: 'elem',
    cast: [{ t: 'ring', r: 0.8, dur: 0.9 }, { t: 'beam', r: 0.1, h: 14, dur: 0.9 }],
    loop: [],
    impact: [{ t: 'ring', r: 1.0, dur: 0.45 }],
    tiers: {
      /* 进化 Ⅰ「溅射」：补上倒挂尘柱 —— 蘑菇状的「伞」是这一级才有的 */
      5: {
        impact: [
          { t: 'ring', r: 1.05, dur: 0.5 },
          { t: 'geyser', r: 0.45, n: 20, dir: 'down', shock: false }
        ]
      },
      /* 进化 Ⅱ「落点留下 4 秒火海」：补上焦痕残留 */
      9: {
        impact: [
          { t: 'ring', r: 1.05, dur: 0.5 },
          { t: 'geyser', r: 0.5, n: 24, dir: 'down', shock: false },
          { t: 'decal', r: 0.85, dur: 4 }
        ]
      },
      /* 终极「火海持续 8 秒」：焦痕 8 秒 + 尘柱比冲击环晚 0.08 秒（蘑菇更明显） */
      10: {
        impact: [
          { t: 'ring', r: 1.15, dur: 0.55 },
          { t: 'geyser', r: 0.55, n: 28, dir: 'down', shock: false, at: 0.08 },
          { t: 'decal', r: 0.95, dur: 8 }
        ]
      }
    }
  },
  /* ③ 火墙：**一排竖直火舌** —— 沿一条线排开，不是水平圆片 */
  firewall: {
    sil: 'wall', elem: 'elem', color: 'elem', tex: 'ember', decal: 'elem',
    cast: [{ t: 'cone', n: 18, r: 0.3, h: 1.6, line: 3 }],
    loop: [{ t: 'cone', n: 10, r: 0.28, h: 1.4, line: 1, dur: 1 }],
    impact: [{ t: 'decal', r: 0.5, line: 1 }],
    tiers: {
      /* 进化 Ⅰ「命中附加 3 秒持续伤害」：持续段从一排铺成两排（墙变厚，不是变长） */
      5: { loop: [{ t: 'cone', n: 10, r: 0.28, h: 1.4, line: 2, dur: 1 }] },
      /* 进化 Ⅱ「场内敌人受伤 +12%」：焦带从一条变两条（`line:2`）+ 留 6 秒。
       * 持续段退回一排 —— Lv5 铺开的第二排在这里让位给第二条焦带（预算 6 次）。 */
      9: {
        loop: [{ t: 'cone', n: 10, r: 0.28, h: 1.4, line: 1, dur: 1 }],
        impact: [{ t: 'decal', r: 0.55, line: 2, dur: 6 }]
      },
      /* 终极「收尾爆燃」：0.55 秒后整条墙一起炸开（`spr` 各向四散）。
       * 起手收窄一排、持续段收回一排 —— 两次绘制的额度全让给这一下爆燃。 */
      10: {
        cast: [{ t: 'cone', n: 18, r: 0.3, h: 1.6, line: 2 }],
        loop: [{ t: 'cone', n: 10, r: 0.28, h: 1.4, line: 1, dur: 1 }],
        impact: [
          { t: 'decal', r: 0.55, line: 2, dur: 6 },
          { t: 'spr', n: 18, r: 0.5, dir: 'out', at: 0.55 }
        ]
      }
    }
  },
  /* ④ 护盾：**包裹体** —— 六边形冰晶壳贴合轮廓，受击局部裂纹，破盾炸成冰锥 */
  iceshield: {
    sil: 'shell', elem: 'ice', color: 'elem', tex: 'shard', decal: 'frost',
    cast: [{ t: 'ring', r: 0.5, dur: 0.3 }],
    loop: [{ t: 'spr', n: 4, tex: 'shard', r: 0.6, h: 1.0, dur: 1.5 }],
    impact: [{ t: 'spr', n: 18, tex: 'shard', r: 0.4, dir: 'out' }],
    tiers: {
      /* 进化 Ⅰ「护甲 +30%」：起手补一簇贴合轮廓的冰晶（壳开始「长出来」） */
      5: { cast: [{ t: 'ring', r: 0.5, dur: 0.3 }, { t: 'spr', n: 10, tex: 'shard', r: 0.55 }] },
      /* 进化 Ⅱ「暴击 +15%」：壳外面多一圈 1.4 秒慢扩的护罩环 */
      9: {
        loop: [
          { t: 'spr', n: 4, tex: 'shard', r: 0.6, h: 1.0, dur: 1.5 },
          { t: 'ring', r: 0.62, dur: 1.4 }
        ]
      },
      /* 终极「破碎 / 爆发时对周围敌人造成伤害并定身」：破盾多留一块 5 秒霜痕
       * （地上的证据）+ 冰锥从 18 颗加到 22 颗 */
      10: { impact: [{ t: 'spr', n: 22, tex: 'shard', r: 0.5, dir: 'out' }, { t: 'decal', r: 0.45, dur: 5 }] }
    }
  },
  /* ⑤ 元素法相：**窗口** —— 开窗是立起的法阵 + 上升光柱；换相是脚下换色一圈 */
  elementavatar: {
    sil: 'aura', elem: 'elem', color: 'elem', tex: 'rune', decal: null,
    cast: [{ t: 'ring', r: 0.9, dur: 0.5 }, { t: 'geyser', r: 0.25, n: 18, dir: 'up', dur: 0.7, shock: false }],
    loop: [{ t: 'spr', n: 5, tex: 'rune', r: 0.7, h: 1.6, dur: 1.6 }],
    impact: [{ t: 'flash', r: 0.8 }],
    tiers: {
      /* 进化 Ⅰ「法相期间全技能附带主元素」：起手多一圈符文（窗口的「内圈」） */
      5: {
        cast: [
          { t: 'ring', r: 0.9, dur: 0.5 },
          { t: 'geyser', r: 0.25, n: 18, dir: 'up', dur: 0.7, shock: false },
          { t: 'spr', n: 8, tex: 'rune', r: 0.85, h: 1.8, dur: 1.5 }
        ]
      },
      /* 进化 Ⅱ「法相结束时爆发新星」：收窗补一圈外扩环。
       * [P5·预算] 这里原本是 `shock`（3 次）→ 7 次超预算；新星要的是
       * 「一圈干净的外扩」，`ring` 比 shock 的「环 + 气浪 + 尘」更准。 */
      9: { impact: [{ t: 'flash', r: 1.2 }, { t: 'ring', r: 0.85, dur: 0.7 }] },
      /* 终极「法相期间免疫控制」：新星延后 0.12 秒 —— 先收窗、再爆，
       * 「窗口关了才炸」这一拍就是免控的读法。 */
      10: { impact: [{ t: 'flash', r: 1.3 }, { t: 'ring', r: 1.0, at: 0.12, dur: 1.0 }] }
    }
  },

  /* ==================== 道士 ==================== */
  /* ① 符箓：**竖长纸片** —— 符纸旋转飞行（本体是 mesh，这里补命中炸开的朱砂字） */
  talisman: {
    sil: 'talis', elem: 'sigil', color: 'elem', tex: 'rune', decal: null,
    cast: [{ t: 'spr', n: 4, tex: 'rune', r: 0.18 }],
    loop: [],
    impact: [{ t: 'bolt', r: 0.0 }, { t: 'spr', n: 10, tex: 'rune', r: 0.3 }],
    tiers: {
      /* 进化 Ⅰ「雷符连锁」：起手多一簇符字（两张符一起飞出去） */
      5: { cast: [{ t: 'spr', n: 4, tex: 'rune', r: 0.18 }, { t: 'spr', n: 6, tex: 'rune', r: 0.28 }] },
      /* 进化 Ⅱ「雷符阵」：命中处留一圈 1 秒的阵环。
       * [P5·预算] 起手退回单簇，把这一次绘制让给阵环（`bolt` 一个人就 3 次）。 */
      9: {
        cast: [{ t: 'spr', n: 4, tex: 'rune', r: 0.18 }],
        impact: [{ t: 'bolt', r: 0.0 }, { t: 'spr', n: 10, tex: 'rune', r: 0.3 }, { t: 'ring', r: 0.55, dur: 1.0 }]
      },
      /* 终极「雷符自动追踪」：朱砂字晚 0.1 秒才炸（追上去再爆），阵环留着 */
      10: {
        cast: [{ t: 'spr', n: 4, tex: 'rune', r: 0.18 }],
        impact: [
          { t: 'bolt', r: 0.0 },
          { t: 'ring', r: 0.55, dur: 1.0 },
          { t: 'spr', n: 12, tex: 'rune', r: 0.3, at: 0.1 }
        ]
      }
    }
  },
  /* ② 万剑归宗 / 毒雾：**从天而降的剑** —— 多把剑斜插地面，每把留一根短剑影 */
  swordrain: {
    sil: 'rain', elem: 'sigil', color: 'elem', tex: 'shard', decal: 'crack',
    cast: [{ t: 'ring', r: 0.9, dur: 0.5 }],
    /* [V0·预算] `shock: false` 是**修 bug 顺手省 3 次绘制**：剑雨是连绵落下的，
     * 每一拍都砸一圈地面冲击波既不合物理、也把预算打穿（原来 9 次）。
     * 冲击波只该在**最后一下**（impact）出现一次。
     *
     * [P5·预算] 最后那一下的 `shock` 下放到 9 级 —— 三段进化每段各加一层，
     * 基础段只留剑痕（1 次），否则 9 级一加就是 7。 */
    loop: [{ t: 'geyser', r: 0.15, n: 6, dir: 'down', spread: 0.9, dur: 1, shock: false }],
    impact: [{ t: 'decal', r: 0.7 }],
    tiers: {
      /* 进化 Ⅰ「毒雾蔓延」：落地补一圈 0.7 秒的余波环（雾从落点往外摊） */
      5: { impact: [{ t: 'decal', r: 0.7 }, { t: 'ring', r: 0.6, at: 0.15, dur: 0.7 }] },
      /* 进化 Ⅱ「雾内敌人减速」：补回最后一下的地面冲击波（原来写在基础段里） */
      9: { impact: [{ t: 'shock', r: 0.5 }, { t: 'decal', r: 0.7 }] },
      /* 终极「雾内敌人死亡爆毒」：冲击晚 0.12 秒（毒先爆、再震地）+ 剑痕 0.85 / 6 秒 */
      10: { impact: [{ t: 'shock', r: 0.55, at: 0.12 }, { t: 'decal', r: 0.85, dur: 6 }] }
    }
  },
  /* ③ 太极玄阵：**圆形领域** —— 地面纹 + 边界 + 脉冲（field 原语已有，这里补边缘） */
  taiji: {
    sil: 'circle', elem: 'sigil', color: 'elem', tex: 'soft', decal: null,
    cast: [{ t: 'ring', r: 0.95, dur: 0.6 }, { t: 'spr', n: 12, tex: 'soft', r: 0.9 }],
    loop: [{ t: 'ring', r: 0.8, dur: 1.2 }],
    impact: [],
    tiers: {
      /* 进化 Ⅰ「阵内敌人减速 40%」：阵内飘起一圈贴地的雾粒子（领域有「内容物」了） */
      5: {
        loop: [
          { t: 'ring', r: 0.8, dur: 1.2 },
          { t: 'spr', n: 8, tex: 'soft', r: 0.7, h: 0.6, dur: 1.2 }
        ]
      },
      /* 进化 Ⅱ「施法后 4 秒受伤 -12%」：0.2 秒后的一次脉冲环（阵在「跳」） */
      9: { impact: [{ t: 'ring', r: 0.75, at: 0.2, dur: 1.4 }] },
      /* 终极「定住周围敌人 2 秒」：脉冲之后从阵心升起一束定身光柱 */
      10: {
        impact: [
          { t: 'ring', r: 0.75, at: 0.2, dur: 1.4 },
          { t: 'geyser', r: 0.3, n: 12, dir: 'up', dur: 0.8, shock: false }
        ]
      }
    }
  },
  /* ④ 回春：**向上生长** —— 从脚下往上冒的光点，不是炸开 */
  heal: {
    sil: 'grow', elem: 'sigil', color: 'elem', tex: 'soft', decal: null,
    cast: [{ t: 'ring', r: 0.45, dur: 0.4 }, { t: 'spr', n: 14, tex: 'soft', r: 0.4, dir: 'up', dur: 0.9 }],
    loop: [{ t: 'spr', n: 6, tex: 'soft', r: 0.35, dir: 'up', dur: 1.2 }],
    impact: [],
    tiers: {
      /* 进化 Ⅰ「施法后每秒回复 2% 生命」：持续段加一圈慢扩的暖环（HoT 的读法） */
      5: {
        loop: [
          { t: 'spr', n: 6, tex: 'soft', r: 0.35, dir: 'up', dur: 1.2 },
          { t: 'ring', r: 0.55, dur: 0.8 }
        ]
      },
      /* 进化 Ⅱ「瞬间驱散并 1.5 秒无敌」：0.15 秒后一次护体环 */
      9: { impact: [{ t: 'ring', r: 0.6, at: 0.15, dur: 0.9 }] },
      /* 终极「生命低于 30% 时自动施放」：护体环之后再升起一簇星芒（自动触发的那一下） */
      10: {
        impact: [
          { t: 'ring', r: 0.6, at: 0.15, dur: 0.9 },
          { t: 'spr', n: 10, tex: 'star', r: 0.5, dir: 'up', dur: 1.0, at: 0.1 }
        ]
      }
    }
  },
  /* ⑤ 召灵兽：**召唤阵** —— 脚下法阵 + 中心一束光，灵兽从光里出来 */
  summon: {
    sil: 'call', elem: 'sigil', color: 'elem', tex: 'rune', decal: null,
    /* [V0·预算] 起手段的 `geyser` 关掉自带冲击波（`shock: false`）：
     * 同一段里已经有一个 `ring` 了，两个环叠在一起是同一句话，
     * 而 `shock` 一次就是 3 次绘制（环 + 竖直气浪 + 尘环）。7 → 4。 */
    cast: [{ t: 'ring', r: 0.7, dur: 0.6 }, { t: 'geyser', r: 0.2, n: 14, dir: 'up', dur: 0.8, shock: false }],
    loop: [{ t: 'spr', n: 6, tex: 'rune', r: 0.45, h: 1.2, dur: 1.4 }],
    impact: [{ t: 'flash', r: 0.6 }],
    tiers: {
      /* 进化 Ⅰ「灵兽攻击附带范围伤害」：登场瞬间炸开一簇符文（阵的「第二层」） */
      5: { impact: [{ t: 'flash', r: 0.7 }, { t: 'spr', n: 8, tex: 'rune', r: 0.6 }] },
      /* 进化 Ⅱ「灵兽在场时自身受伤 -10%」：持续段加一圈护体环（阵在护着人） */
      9: {
        loop: [
          { t: 'spr', n: 6, tex: 'rune', r: 0.45, h: 1.2, dur: 1.4 },
          { t: 'ring', r: 0.6, dur: 1.2 }
        ]
      },
      /* 终极「一次召出三种灵兽（四象同场）」：阵撑到 0.9 米、护体环 1.6 秒，
       * 符文迸发晚 0.12 秒 —— 三只不是同一帧出来的。 */
      10: {
        cast: [
          { t: 'ring', r: 0.9, dur: 0.6 },
          { t: 'geyser', r: 0.25, n: 18, dir: 'up', dur: 0.8, shock: false }
        ],
        loop: [
          { t: 'spr', n: 6, tex: 'rune', r: 0.45, h: 1.2, dur: 1.4 },
          { t: 'ring', r: 0.75, dur: 1.6 }
        ],
        impact: [{ t: 'flash', r: 0.85 }, { t: 'spr', n: 8, tex: 'rune', r: 0.7, at: 0.12 }]
      }
    }
  }
};

/* ============================================================
 * 配方按「功能位」解析（P5）
 *
 * 上面 15 条剪影是**15 个功能位**的，不是 15 只技能的。一个位里有好几只技能
 * （刀客 ② = 裂地 / 跃击 / 突刺 / 处决 / 天崩），它们共用同一条剪影 ——
 * 这正是 §3「15 + 6 而不是 15 × 6」省下来的那部分。
 *
 * 但 `VFX.playFor(id)` 拿到的是**技能 id**：`poison`、`leap`、`frostnova` 这些
 * 在 `SKILL_VFX` 里根本没有键。不解析的话，15 个位里只有 6 个位的技能有特效，
 * 其余 9 个位**一声不响地什么都不播**（`vfxRecipe` 返回 null，解释器直接 return 0）。
 *
 * 所以这里补一张「位 → 代表配方」的表。**不按 `inherit[0]` 推**：
 * 道士 ② 的 `inherit` 是 `talismanarrow, swordrain, poison`，首项是符箭，
 * 而剪影（万剑归宗 / 毒雾）的代表键是 `swordrain` —— 按首项推会错位。
 * 写死这张表虽然多 15 行，但它和 `SKILL_ARCHETYPE` 的对应关系是**可以逐行核对**的。
 * ============================================================ */
const VFX_SLOT_KEY = {
  warrior: ['whirl', 'quake', 'swordarray', 'bloodrage', 'avatar'],
  mage: ['fireball', 'meteor', 'firewall', 'iceshield', 'elementavatar'],
  taoist: ['talisman', 'swordrain', 'taiji', 'heal', 'summon']
};

/* 技能 id → 配方键。已经是配方键的原样返回；查不到就原样返回（交给上层返回 null）。 */
function vfxSlotKey(id) {
  if (SKILL_VFX[id]) return id;
  if (typeof SKILLS === 'undefined' || typeof skillArchSlotOf !== 'function') return id;
  const sk = SKILLS[id];
  if (!sk || !sk.cls) return id;
  const no = skillArchSlotOf(sk.cls, id);
  const row = VFX_SLOT_KEY[sk.cls];
  return (row && no >= 1 && no <= 5) ? (row[no - 1] || id) : id;
}

/* ============================================================
 * 兵形 · 三种刀式的刀气（P4）
 *
 * 方案 §7.1 那一行：「切刀式瞬间，刀气形状改变：斩锋=细长弧、镇岳=半圆盾弧、
 * 摧城=短粗裂弧」。**形在 `tilt`，不在 `n`** ——
 *   tilt 小 = 弧压得平 = 又长又细（斩锋）
 *   tilt 大 = 弧立起来 = 半圆护体（镇岳）
 *   n 多 + tilt 最小 = 三道短粗的裂口（摧城）
 * 所以三式共用 `arc` 一条指令，只换参数 —— 这也是 §3「形色时分离」的本意：
 * 加第四种刀式时不用再写一套几何。
 *
 * 这张表**只写「命中段」**（刀气本体）。起手那一圈沿用 `SKILL_VFX.avatar`
 * 的 cast —— 换式是同一个动作，差别只在刀气形状，没必要抄第二份。
 * ============================================================ */
const BLADE_FORM_VFX = {
  0: {
    sil: 'slash', color: 0xffd166, tex: 'slash', decal: null,
    impact: [{ t: 'arc', n: 1, tilt: 0.16, color: 0xffd166 }]
  },
  1: {
    sil: 'guard', color: 0xffe6a8, tex: 'slash', decal: null,
    impact: [{ t: 'arc', n: 2, tilt: 0.5, color: 0xffe6a8 }]
  },
  2: {
    sil: 'ruin', color: 0xffb060, tex: 'slash', decal: 'crack',
    /* 裂弧要留痕：摧城式的身份是「砸开」，地上没有裂口就只是换了颜色 */
    impact: [{ t: 'arc', n: 3, tilt: 0.1, color: 0xffb060 }, { t: 'decal', r: 0.5 }]
  }
};

/* 复制一段指令数组 —— **连指令对象一起复制**。
 * 只 `slice()` 数组是不够的：数组里的 `{t:'arc', n:2}` 还是同一份引用，
 * 调用方（比如元素混搭要改某一条的色）一改就把数据表污染了，
 * 而且下一次取配方会拿到被改过的值 —— 这种 bug 只在连放两个技能后才显形。 */
function _vfxCloneOps(arr) {
  if (!Array.isArray(arr)) return [];
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const op = arr[i];
    out[i] = op ? Object.assign({}, op) : op;
  }
  return out;
}

/* ============================================================
 * 取配方：基础 + 台阶 patch
 *
 * **整段覆盖，不做拼接**（§3「台阶用 patch，不用 copy」的反面）：
 * 5 级要「四刀」就写 `cast:[...4 刀]`，不是「在原来 2 刀后面再加 2 刀」——
 * 拼接会让 9 级叠 5 级再叠基础，最后没人说得清一共几刀。
 *
 * 返回的是**新对象**（数组与指令都复制），调用方可以随便改颜色而不污染数据表。
 * ============================================================ */
function vfxRecipe(id, lv) {
  /* [P5] 先按功能位解析：`poison` / `leap` / `frostnova` 这些 id 不在表里，
   * 但它们所在的位有剪影。已经是配方键的 id 原样返回，行为不变。 */
  const key = vfxSlotKey(id);
  const base = SKILL_VFX[key];
  if (!base) return null;
  const out = {};
  for (const k of VFX_KEYS) {
    if (k === 'tiers') continue;
    const v = base[k];
    if (Array.isArray(v)) out[k] = _vfxCloneOps(v);
    else if (v !== undefined) out[k] = v;
  }
  const tiers = base.tiers || {};
  const n = Math.max(0, Math.round(Number(lv) || 1));
  /* 从低到高逐档叠：9 级时 5 级那条也该在（台阶是累加的，
   * 只是「写差异」——5 级写的那一刀，9 级不重写就还留着） */
  const applied = [];
  for (const key of Object.keys(tiers).map(Number).sort((a, b) => a - b)) {
    if (key > n) continue;
    applied.push(key);
    const patch = tiers[key] || {};
    for (const k in patch) {
      const v = patch[k];
      out[k] = Array.isArray(v) ? _vfxCloneOps(v) : v;
    }
  }
  out.lv = n;
  out.tier = applied.length ? applied[applied.length - 1] : 0;
  out.applied = applied;
  /* [P5] 配方键与技能 id 都记着：探针要能说清「poison 用的是 swordrain 那条剪影」，
   * 面板也能据此显示「本位剪影：万剑归宗」。 */
  out.key = key;
  out.id = id;
  return out;
}

/* 取刀式配方（P4）：**在 `SKILL_VFX.avatar` 的基础段上打「刀式补丁」**。
 *
 * 不另写一份完整配方，是为了「起手那圈」只有一个来源 ——
 * 以后调兵形的起手手感，改 `SKILL_VFX.avatar` 一处，三式全跟。
 *
 * **刻意不吃台阶**（固定按 1 级取）：换式是 1.2 秒一次的小动作，
 * 5 级的冲击 + 10 级的星火属于「断岳斩 / 剑神降世」那两个瞬间。
 * 让换式跟着满级播，等于每两秒炸一次，而且绘制预算直接翻倍（实测 9 次）。
 *
 * **只替换 `arc` 那一条**，其余指令原样保留 —— 整段覆盖会把基础段里的
 * 别的东西一起吃掉，以后加指令的人会莫名其妙地发现自己的指令不生效。
 * 越界的 stance 一律落回斩锋式：面板点错、存档脏值都不该崩。 */
function vfxBladeForm(stance) {
  const out = vfxRecipe('avatar', 1);
  if (!out) return null;
  const f = BLADE_FORM_VFX[stance | 0] || BLADE_FORM_VFX[0];
  out.sil = f.sil;
  out.color = f.color;
  out.tex = f.tex;
  out.decal = f.decal;
  const kept = [];
  let put = false;
  for (const op of (out.impact || [])) {
    if (op && op.t === 'arc') {
      if (!put) { for (const s of f.impact) kept.push(Object.assign({}, s)); put = true; }
      continue;
    }
    kept.push(op);
  }
  if (!put) for (const s of f.impact) kept.push(Object.assign({}, s));
  out.impact = kept;
  return out;
}

/* 只取「刀气那一段」（断岳斩用）。
 * 终结技自己已经有动作与前摇，再播一遍换式的起手圈就是同一个动作画两遍；
 * 而且 5 / 10 级的冲击属于「换式」的规格，不该叠到终结技上把预算打穿。 */
function vfxBladeImpact(stance) {
  const f = BLADE_FORM_VFX[stance | 0] || BLADE_FORM_VFX[0];
  return {
    sil: f.sil, color: f.color, tex: f.tex, decal: f.decal,
    cast: [], loop: [], impact: _vfxCloneOps(f.impact),
    lv: 1, tier: 0, applied: []
  };
}

/* ============================================================
 * 染色：形 + 色 → 这一发真正要播的配方
 *
 * `color/tex/decal === 'elem'` 的三处从元素材质取。元素混搭（主 70 / 副 30）
 * 由调用方传两遍再合成 —— 这里只负责「一份元素材质怎么盖上去」，
 * 不去猜 70/30 该怎么分（那是 P3d 注入层的账）。
 * ============================================================ */
function vfxTint(recipe, elemKey) {
  if (!recipe) return null;
  const p = ELEM_PROFILE[elemKey] || ELEM_PROFILE.phys;
  const out = {};
  for (const k in recipe) out[k] = Array.isArray(recipe[k]) ? _vfxCloneOps(recipe[k]) : recipe[k];
  if (out.color === 'elem') out.color = p.color;
  if (out.tex === 'elem') out.tex = p.tex;
  if (out.decal === 'elem') out.decal = p.decal;
  out.elem = elemKey || 'phys';
  out.profile = p;
  return out;
}

/* 预算：这条配方一共要发多少条指令、按段分。
 * 用途有两个 —— `dev/vfx-bench.js` 拿它对账真机 draw call，
 * 面板 / 说明页也能据此说「这个技能用了几个原语」。 */
function vfxBudget(recipe) {
  const seg = { cast: 0, loop: 0, impact: 0 };
  const ops = {};
  if (!recipe) return { cast: 0, loop: 0, impact: 0, total: 0, ops };
  for (const k of ['cast', 'loop', 'impact']) {
    const arr = recipe[k] || [];
    seg[k] = arr.length;
    for (const op of arr) {
      if (!op || !op.t) continue;
      ops[op.t] = (ops[op.t] || 0) + 1;
    }
  }
  return {
    cast: seg.cast, loop: seg.loop, impact: seg.impact,
    total: seg.cast + seg.loop + seg.impact,
    ops
  };
}

/* ============================================================
 * 绘制成本：一条配方**这一发**要画几次
 *
 * `vfxBudget` 数的是「几条指令」，那是给人看的；这里是给性能看的 ——
 * 一条指令不等于一次绘制（`arc n:3` 画三次，`geyser` 自带一圈冲击波时
 * 一次变四次）。这张表是 `dev/vfx-bench.js` 真机读 `renderer.info` 对过的：
 *
 *   spr 1 · trail 1 · ring 1 · flash 1 · decal = line 排数
 *   beam 2 · bolt 3 · shock 3 · geyser = 4（默认）/ 1（shock:false）
 *   arc = n · vortex = helix 圈数 · cone = line 排数
 *
 * **为什么这条要放在数据层而不是测试里**：P5 的三段台阶全靠「先腾预算再进化」，
 * 腾的时候必须和验的时候用同一把尺子。测试里各写一份，改一处忘一处，
 * 最后就是「测试说 6 次、真机跑出 9 次」—— V0 真的踩过一次。
 * ============================================================ */
function vfxOpCost(op) {
  if (!op || !op.t) return 0;
  switch (op.t) {
    case 'spr': case 'trail': case 'ring': case 'flash': return 1;
    case 'decal': return Math.max(1, op.line || 1);
    case 'beam': return 2;
    case 'bolt': case 'shock': return 3;
    case 'geyser': return op.shock === false ? 1 : 4;
    case 'arc': return Math.max(1, op.n || 1);
    case 'vortex': return Math.max(1, op.helix || 1);
    case 'cone': return Math.max(1, op.line || 1);
    default: return 1;
  }
}

/* 整条配方的绘制成本（三段相加）。`at` 不影响它 ——
 * 延迟只是把同一次绘制挪到后面，峰值该算还得算（宁可保守）。 */
function vfxCost(recipe) {
  let n = 0;
  if (!recipe) return 0;
  for (const k of ['cast', 'loop', 'impact']) {
    for (const op of (recipe[k] || [])) n += vfxOpCost(op);
  }
  return n;
}

/* 缺配方的技能：面板与探针都靠它报欠账（和 P2b 的「待」角标同一个套路）。
 * [P5] 判据改成「这个 id 能不能解析到一条剪影」—— 走功能位之后，
 * 只有**孤儿技能**（不属于任何位）才会被报成缺配方。 */
function vfxMissing(ids) {
  const out = [];
  for (const id of ids || []) if (!SKILL_VFX[vfxSlotKey(id)]) out.push(id);
  return out;
}
