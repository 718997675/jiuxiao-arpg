/* ============================================================
 * 数据层 · 变体专属特效（P4）
 *
 * 为什么不是「108 条变体各写一套特效」：
 *   108 套手写特效 = 108 段没人维护的魔法数字，而且玩家根本分不清
 *   「血旋的粒子比裂魂多三颗」这种差别。真正会被感知到的是
 *   **这一条变体改的是哪一类打法** —— 烧、冻、追击、聚怪、吸血、守、召。
 *   所以特效按「打法风格」归成 11 类，一条变体属于哪类由它的 beh 键推出，
 *   数据里可以写 fx 覆盖（见下）。
 *
 * 三种写法（写在 SKILL_TREE.branches[id].form[i] 的效果对象里）：
 *   fx: 'frost'                 → 直接指定风格
 *   fx: { key: 'frost', color: 0x88ddff }   → 换个色，形状不变
 *   （不写）                     → 由 beh 键按 FORM_FX_RULES 推；推不出就不出特效
 *
 * 特效只在**施法瞬间**画一次（castFormFx），不改任何数值、不改命中判定 ——
 * 这是纯表现层，关掉也不影响打出来的伤害。玩家能靠这一眼认出
 * 「我现在装的是哪一条」，而不是只有在面板里才看得见。
 * ============================================================ */

/* 风格表。
 *   name  面板上的一个字标签（技能卡 / 树上都用它）
 *   color 主色
 *   cast  施法瞬间的粒子配方，由 castFormFx 逐条解释：
 *           t     ring 扩散环 / flash 地面闪光 / burst 迸射 / blood 溅血 /
 *                 beam 天降光柱 / area 地面区域
 *           at    skill = 技能落点（自身技能就是脚下）/ self = 恒定玩家脚下
 *           y     世界高度（默认 0.9）
 *           r     半径倍率（× 技能半径，ring/flash/area 用）
 *           n/sp/size/life  粒子数 / 速度 / 尺寸 / 存活（burst/blood 用）
 *           dur/th          持续秒数 / 环的粗细（ring/flash/area 用）
 *           add   是否加法混合（默认按原语定）
 */
const FORM_FX = {
  /* 没有 beh（纯改数字）的变体：不出专属特效。
   * 这不是偷懒 —— 给纯数值变体硬加光效，等于骗玩家「我换了打法」。 */
  plain: { name: '素', color: 0xd8d0c0, cast: null },

  burn: {
    name: '焰', color: 0xff7a3c,
    cast: [
      { t: 'ring', r: 1.05, dur: 0.45, th: 0.2 },
      { t: 'burst', n: 16, sp: 6.5, size: 0.11, life: 0.5, add: true, y: 0.8 },
      { t: 'flash', r: 0.85, dur: 0.28 }
    ]
  },
  frost: {
    name: '霜', color: 0x9ae8ff,
    cast: [
      { t: 'flash', r: 0.95, dur: 0.32 },
      { t: 'burst', n: 12, sp: 4.2, size: 0.09, life: 0.55, add: true, y: 0.6, gravity: 4 },
      { t: 'ring', r: 1.15, dur: 0.5, th: 0.12 }
    ]
  },
  storm: {
    name: '雷', color: 0xffe066,
    cast: [
      { t: 'beam', dur: 0.18, width: 1.2 },
      { t: 'ring', r: 0.9, dur: 0.3, th: 0.24 },
      { t: 'burst', n: 10, sp: 7, size: 0.08, life: 0.35, add: true, y: 1.2 }
    ]
  },
  wind: {
    name: '疾', color: 0x9cffd0,
    cast: [
      { t: 'ring', r: 1.25, dur: 0.32, th: 0.08 },
      { t: 'ring', r: 0.7, dur: 0.42, th: 0.06 },
      { t: 'burst', n: 9, sp: 9, size: 0.07, life: 0.3, add: true, y: 0.7 }
    ]
  },
  pull: {
    name: '聚', color: 0xc8a0ff,
    cast: [
      { t: 'ring', r: 1.35, dur: 0.55, th: 0.22 },
      { t: 'flash', r: 0.75, dur: 0.45 },
      { t: 'burst', n: 10, sp: 2.4, size: 0.08, life: 0.6, add: true, y: 0.5, gravity: 2 }
    ]
  },
  flow: {
    name: '汲', color: 0x7fe0a0,
    cast: [
      { t: 'area', r: 1.1, dur: 0.9, opacity: 0.12 },
      { t: 'ring', r: 1.1, dur: 0.7, th: 0.1 },
      { t: 'burst', n: 8, sp: 2, size: 0.07, life: 0.7, add: true, y: 0.4, gravity: -3 }
    ]
  },
  guard: {
    name: '守', color: 0xa8c8ff,
    cast: [
      { t: 'ring', r: 1.0, dur: 0.6, th: 0.3 },
      { t: 'flash', r: 1.0, dur: 0.5 },
      { t: 'burst', n: 8, sp: 3, size: 0.08, life: 0.5, add: true, y: 0.5 }
    ]
  },
  beast: {
    name: '兽', color: 0xffd8a0,
    cast: [
      { t: 'ring', r: 1.4, dur: 0.5, th: 0.26 },
      { t: 'burst', n: 14, sp: 5, size: 0.1, life: 0.6, add: true, y: 0.4, gravity: 8 }
    ]
  },
  heavy: {
    name: '重', color: 0xffb060,
    cast: [
      { t: 'ring', r: 1.5, dur: 0.55, th: 0.32 },
      { t: 'flash', r: 1.2, dur: 0.45 },
      { t: 'burst', n: 18, sp: 4, size: 0.13, life: 0.65, y: 0.3, gravity: 20 }
    ]
  },
  blood: {
    name: '血', color: 0xff5a6a,
    cast: [
      { t: 'ring', r: 1.0, dur: 0.4, th: 0.18 },
      { t: 'blood', n: 14, sp: 6, size: 0.1, life: 0.55, y: 1.0 }
    ]
  },
  holy: {
    name: '圣', color: 0xfff2b0,
    cast: [
      { t: 'beam', dur: 0.22, width: 0.9 },
      { t: 'ring', r: 1.1, dur: 0.6, th: 0.16 },
      { t: 'burst', n: 10, sp: 3.5, size: 0.09, life: 0.6, add: true, y: 1.4, gravity: -2 }
    ]
  }
};

/* beh 键 → 风格，**按顺序取第一个命中的**。
 * 顺序是有讲究的：
 *   1. 先看「改了什么形态」（变身 / 引导 / 化龙）—— 这类变体整发技能的样子都变了
 *   2. 再看状态类（点燃 / 冻结 / 眩晕 / 流血）
 *   3. 最后看资源与位移（吸血 / 聚怪 / 位移向）
 * 换顺序会让「炎爆」被判成「疾」（它同时有 knock 与 burnPct），
 * 玩家看到的就是「这个火系变体喷绿光」。
 */
const FORM_FX_RULES = [
  ['transform', 'storm'],
  ['channel', 'storm'],
  ['rain', 'storm'],
  ['breath', 'burn'],
  ['burnPct', 'burn'],
  ['burnDur', 'burn'],
  ['endBurst', 'burn'],
  ['freeze', 'frost'],
  ['freezeEvery', 'frost'],
  ['chill', 'frost'],
  ['vsFrozen', 'frost'],
  ['stun', 'heavy'],
  ['root', 'heavy'],
  ['repeat', 'heavy'],
  ['selfCast', 'heavy'],
  ['knock', 'heavy'],
  ['ring', 'heavy'],
  ['bleed', 'blood'],
  ['tagAdd', 'blood'],
  ['detonate', 'blood'],
  ['exec', 'blood'],
  ['hpCost', 'blood'],
  ['crit', 'blood'],
  ['gather', 'pull'],
  ['pull', 'pull'],
  ['taunt', 'beast'],
  ['summon', 'beast'],
  ['pairTiger', 'beast'],
  ['allyBuff', 'beast'],
  ['size', 'beast'],
  ['drain', 'flow'],
  ['cdCancel', 'flow'],
  ['ragePerHit', 'flow'],
  ['recharge', 'flow'],
  ['move', 'wind'],
  ['moveSpd', 'wind'],
  ['pierce', 'wind'],
  ['spread', 'wind'],
  ['armorPct', 'guard'],
  ['drPct', 'guard'],
  ['shieldMul', 'guard'],
  ['reflect', 'guard'],
  ['counter', 'guard'],
  ['immune', 'guard'],
  ['noDR', 'guard'],
  ['heal', 'holy'],
  ['hot', 'holy'],
  ['regen', 'holy'],
  ['cleanse', 'holy'],
  ['autoTrigger', 'holy'],

  /* 第二梯队：靠后的键。它们单独出现时才有决定权（上面的高优先键一命中就返回），
   * 放在这里是为了「有 beh、却因为键没登记而一条特效都没有」的变体清零。
   * 每加一个 beh 键，记得回来看看要不要给它一个风格 —— 否则新变体会静默变成 plain。 */
  ['freezeSelf', 'frost'],
  ['slow', 'frost'],
  ['slowDur', 'frost'],
  ['corpseBlast', 'burn'],
  ['mine', 'storm'],
  ['minePct', 'storm'],
  ['chain', 'storm'],
  ['chainPct', 'storm'],
  ['bash', 'heavy'],
  ['aftershock', 'heavy'],
  ['aftershockPct', 'heavy'],
  ['stack', 'blood'],
  ['stackMax', 'blood'],
  ['endHpCost', 'blood'],
  ['vsBoss', 'blood'],
  ['killHeal', 'blood'],
  ['aspd', 'wind'],
  ['follow', 'wind'],
  ['orbit', 'wind'],
  ['pin', 'pull'],
  ['zone', 'flow'],
  ['passive', 'flow'],
  ['cdr', 'flow'],
  ['afterBuff', 'holy'],
  ['afterDebuff', 'holy']
];

/* 一条变体属于哪种风格。
 * 优先级：数据里写死的 fx > 由 beh 键推 > plain（不出特效）。
 * 返回 { key, name, color, style } —— style 就是 FORM_FX 里的那一项。 */
function skillFormFx(id, idx) {
  const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
  const o = br && br.form[idx];
  const fxSpec = o && o.fx;
  let key = null, color = null;
  if (typeof fxSpec === 'string') key = fxSpec;
  else if (fxSpec && typeof fxSpec === 'object') {
    key = fxSpec.key || null;
    if (typeof fxSpec.color === 'number') color = fxSpec.color;
  }
  if (!key && o && o.beh) {
    for (let i = 0; i < FORM_FX_RULES.length; i++) {
      if (o.beh[FORM_FX_RULES[i][0]] !== undefined) { key = FORM_FX_RULES[i][1]; break; }
    }
  }
  const style = (key && FORM_FX[key]) || FORM_FX.plain;
  return {
    key: (key && FORM_FX[key]) ? key : 'plain',
    name: style.name,
    color: color !== null ? color : style.color,
    style
  };
}

/* 统计：多少条变体有专属特效、各风格几条。
 * 面板上用不到，但测试与「说明页」要用同一个口径，避免两处各算一遍。 */
function formFxStats() {
  const out = { total: 0, styled: 0, byKey: {}, modsOnly: [] };
  const brs = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.branches) ? SKILL_TREE.branches : {};
  for (const id in brs) {
    const form = brs[id].form || [];
    for (let i = 0; i < form.length; i++) {
      out.total++;
      const fx = skillFormFx(id, i);
      out.byKey[fx.key] = (out.byKey[fx.key] || 0) + 1;
      if (fx.key === 'plain') out.modsOnly.push(id + ':' + i);
      else out.styled++;
    }
  }
  return out;
}
