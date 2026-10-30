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
    impact: [{ t: 'shock', r: 0.28 }],
    tiers: {
      5: { loop: [{ t: 'vortex', r: 0.66, dur: 0.6, helix: 2 }] },
      9: { cast: [{ t: 'arc', n: 4, tilt: 0.35 }], decal: 'scorch' }
    }
  },
  /* ② 裂地震击：**纵向塌陷** —— 裂纹预警 + 地面向下塌 + 垂直尘柱 */
  quake: {
    sil: 'sink', elem: 'phys', color: 'elem', tex: 'dust', decal: 'crack',
    cast: [{ t: 'ring', r: 0.9, dur: 0.35 }, { t: 'decal', tex: 'crack', r: 0.7 }],
    loop: [],
    impact: [{ t: 'shock', r: 0.55, dust: 2 }, { t: 'geyser', r: 0.3, n: 16, dir: 'up', shock: false }],
    tiers: {
      7: { impact: [{ t: 'shock', r: 0.8, dust: 2 }, { t: 'geyser', r: 0.4, n: 20, dir: 'up', shock: false }] }
    }
  },
  /* ③ 剑阵：**环绕轨道** —— 剑影沿椭圆绕身 + 每把带短拖尾（有高度、有轨道） */
  swordarray: {
    sil: 'orbit', elem: 'phys', color: 'elem', tex: 'spark', decal: null,
    cast: [{ t: 'trail', r: 0.8, n: 12, h: 1.4, dur: 0.5 }],
    loop: [{ t: 'spr', n: 8, tex: 'spark', r: 0.85, h: 1.2, dur: 1.2 }],
    impact: [{ t: 'ring', r: 0.95, dur: 0.4 }],
    tiers: {
      7: { cast: [{ t: 'trail', r: 0.8, n: 12, h: 1.4, dur: 0.5 }, { t: 'trail', r: 1.05, n: 12, h: 1.9, dur: 0.5 }] }
    }
  },
  /* ④ 血怒：**从脚下冒** —— 不是包在外面的壳（那是 ④ 护盾的语义） */
  bloodrage: {
    sil: 'riser', elem: 'phys', color: 'elem', tex: 'ember', decal: null,
    cast: [{ t: 'spr', n: 14, tex: 'ember', r: 0.5, dir: 'up', dur: 0.8 }],
    loop: [{ t: 'ring', r: 0.6, dur: 0.5 }],
    impact: [],
    tiers: {
      10: { loop: [{ t: 'ring', r: 0.6, dur: 0.5 }, { t: 'spr', n: 10, tex: 'ember', r: 0.4, dir: 'up', dur: 0.8 }] }
    }
  },
  /* ⑤ 兵形：**切换姿态** —— 脚下金环 + 一圈短刀光，轻、快、不占屏 */
  avatar: {
    sil: 'stance', elem: 'phys', color: 0xffd166, tex: 'spark', decal: null,
    cast: [{ t: 'ring', r: 0.55, dur: 0.3, color: 0xffd166 }],
    loop: [],
    impact: [{ t: 'arc', n: 1, tilt: 0.2, color: 0xffd166 }],
    tiers: {
      5: { impact: [{ t: 'arc', n: 1, tilt: 0.2, color: 0xffd166 }, { t: 'shock', r: 0.45, color: 0xffd166 }] },
      10: { cast: [{ t: 'ring', r: 0.7, dur: 0.4, color: 0xffd166 }, { t: 'spr', n: 16, tex: 'star', r: 0.6, dir: 'up', color: 0xffd166 }] }
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
      5: { impact: [{ t: 'flash', r: 0.7 }, { t: 'spr', n: 16, r: 0.5 }, { t: 'decal', r: 0.6 }] }
    }
  },
  /* ② 陨石：**从天而降** —— 高空垂直火线 + 落点收缩预警 + 蘑菇状冲击
   *
   * [V0·预算] 命中段**不用 `shock`**，拆成「冲击环 + 向下碎屑柱」：
   * `shock` 是环 + 竖直气浪 + 尘环三件套 = 3 次绘制，而这里的碎屑柱
   * （`geyser` 26 颗，`dir:'down'`）已经把「尘」和「高度」都说完了 ——
   * 再叠一套就是同一个意思画两遍。原来 8 次绘制（超预算 2），现在 6 次。
   * 起手段的圈 + 火线必须留着：0.9 秒的前摇里，玩家要靠它们知道砸哪儿、砸多大。 */
  meteor: {
    sil: 'fall', elem: 'elem', color: 'elem', tex: 'ember', decal: 'elem',
    cast: [{ t: 'ring', r: 0.8, dur: 0.9 }, { t: 'beam', r: 0.1, h: 14, dur: 0.9 }],
    loop: [],
    impact: [{ t: 'ring', r: 1.0, dur: 0.45 }, { t: 'geyser', r: 0.45, n: 20, dir: 'down', shock: false }, { t: 'decal', r: 0.8 }],
    tiers: {
      7: { impact: [{ t: 'ring', r: 1.15, dur: 0.5 }, { t: 'geyser', r: 0.55, n: 26, dir: 'down', shock: false }, { t: 'decal', r: 1.0 }] }
    }
  },
  /* ③ 火墙：**一排竖直火舌** —— 沿一条线排开，不是水平圆片 */
  firewall: {
    sil: 'wall', elem: 'elem', color: 'elem', tex: 'ember', decal: 'elem',
    cast: [{ t: 'cone', n: 18, r: 0.3, h: 1.6, line: 3 }],
    loop: [{ t: 'cone', n: 10, r: 0.28, h: 1.4, line: 1, dur: 1 }],
    impact: [{ t: 'decal', r: 0.5, line: 2 }],
    tiers: {
      3: { cast: [{ t: 'cone', n: 30, r: 0.34, h: 1.6, line: 3 }], impact: [{ t: 'decal', r: 0.5, line: 3 }] }
    }
  },
  /* ④ 护盾：**包裹体** —— 六边形冰晶壳贴合轮廓，受击局部裂纹，破盾炸成冰锥 */
  iceshield: {
    sil: 'shell', elem: 'ice', color: 'elem', tex: 'shard', decal: 'frost',
    cast: [{ t: 'ring', r: 0.5, dur: 0.3 }, { t: 'spr', n: 10, tex: 'shard', r: 0.55 }],
    loop: [{ t: 'spr', n: 4, tex: 'shard', r: 0.6, h: 1.0, dur: 1.5 }],
    impact: [{ t: 'spr', n: 18, tex: 'shard', r: 0.4, dir: 'out' }, { t: 'decal', r: 0.4 }],
    tiers: {}
  },
  /* ⑤ 元素法相：**窗口** —— 开窗是立起的法阵 + 上升光柱；换相是脚下换色一圈 */
  elementavatar: {
    sil: 'aura', elem: 'elem', color: 'elem', tex: 'rune', decal: null,
    cast: [{ t: 'ring', r: 0.9, dur: 0.5 }, { t: 'geyser', r: 0.25, n: 18, dir: 'up', dur: 0.7, shock: false }],
    loop: [{ t: 'spr', n: 5, tex: 'rune', r: 0.7, h: 1.6, dur: 1.6 }],
    impact: [{ t: 'flash', r: 0.8 }],
    tiers: {
      9: { impact: [{ t: 'flash', r: 1.2 }, { t: 'shock', r: 0.8 }] }
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
      10: { impact: [{ t: 'bolt', r: 0.0 }, { t: 'spr', n: 10, tex: 'rune', r: 0.3 }, { t: 'bolt', r: 0.4 }] }
    }
  },
  /* ② 万剑归宗 / 毒雾：**从天而降的剑** —— 多把剑斜插地面，每把留一根短剑影 */
  swordrain: {
    sil: 'rain', elem: 'sigil', color: 'elem', tex: 'shard', decal: 'crack',
    cast: [{ t: 'ring', r: 0.9, dur: 0.5 }],
    /* [V0·预算] `shock: false` 是**修 bug 顺手省 3 次绘制**：剑雨是连绵落下的，
     * 每一拍都砸一圈地面冲击波既不合物理、也把预算打穿（原来 9 次）。
     * 冲击波只该在**最后一下**（impact）出现一次。 */
    loop: [{ t: 'geyser', r: 0.15, n: 6, dir: 'down', spread: 0.9, dur: 1, shock: false }],
    impact: [{ t: 'shock', r: 0.5 }, { t: 'decal', r: 0.7 }],
    tiers: {}
  },
  /* ③ 太极玄阵：**圆形领域** —— 地面纹 + 边界 + 脉冲（field 原语已有，这里补边缘） */
  taiji: {
    sil: 'circle', elem: 'sigil', color: 'elem', tex: 'soft', decal: null,
    cast: [{ t: 'ring', r: 0.95, dur: 0.6 }, { t: 'spr', n: 12, tex: 'soft', r: 0.9 }],
    loop: [{ t: 'ring', r: 0.8, dur: 1.2 }],
    impact: [],
    tiers: {}
  },
  /* ④ 回春：**向上生长** —— 从脚下往上冒的光点，不是炸开 */
  heal: {
    sil: 'grow', elem: 'sigil', color: 'elem', tex: 'soft', decal: null,
    cast: [{ t: 'ring', r: 0.45, dur: 0.4 }, { t: 'spr', n: 14, tex: 'soft', r: 0.4, dir: 'up', dur: 0.9 }],
    loop: [{ t: 'spr', n: 6, tex: 'soft', r: 0.35, dir: 'up', dur: 1.2 }],
    impact: [],
    tiers: {}
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
    tiers: {}
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
  const base = SKILL_VFX[id];
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
  return out;
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

/* 缺配方的技能：面板与探针都靠它报欠账（和 P2b 的「待」角标同一个套路） */
function vfxMissing(ids) {
  const out = [];
  for (const id of ids || []) if (!SKILL_VFX[id]) out.push(id);
  return out;
}
