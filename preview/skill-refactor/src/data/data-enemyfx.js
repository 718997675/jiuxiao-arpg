/* ============================================================
 * 数据层 · [U9] 小怪形态 / 精英词缀 / Boss 生命周期视觉
 *
 * 三条口径（改表前先读，别把这里写成又一套特效 DSL）：
 *
 *  1. **常驻微标识，不是每次触发炸一朵花。**
 *     八种 AI 形态各有一枚贴地小记号，12 条精英词缀各有一枚角标。
 *     它们跟着实体走，只在 `EnemyFX.sync` 里改实例矩阵；战斗结算不读它们。
 *  2. **40 只同屏不炸屏。**
 *     同一形态的所有怪共用一个 `InstancedMesh`，12 条词缀也各共用一个，
 *     绘制批次上限 = 8 + 12 = 20，与怪数无关。颜色 / 边数两两不同，
 *     靠「形状 + 颜色」读，不靠放大半径。
 *  3. **不改数值、不改判定。**
 *     本文件只声明视觉；血量 / 伤害 / 移速 / 命中半径全在 data-monsters /
 *     data-elites / game.js，这里一个都不碰。
 *
 * 颜色沿用 `MOB_AI_KINDS[k].color` 与 `ELITE_AFFIXES[id].color` 的语义，
 * 但写成数值便于 THREE.Color 直接使用；`test-enemyfx.js` 会钉住两者同源。
 * ============================================================ */

/* 每种形态最多同时画这么多枚；MOB_CAP_PC = 36，48 留一点召唤 / 分裂余量 */
const ENEMY_FX_MOB_CAP = 48;
/* 同一张图精英数远小于 12，12 个槽足够；每个词缀环各占一个实例网格 */
const ENEMY_FX_ELITE_CAP = 16;

/* seg / arc 让八种形态即使色盲也能靠轮廓分开：
 *   近战方、远程三角、包夹五边、风筝开口六边、
 *   自爆八边、治疗开口四边、召唤七边、逃逸开口三角。 */
const MOB_MARK = {
  melee: {
    name: '近战', color: 0xc08a4a, inner: 0.62, outer: 1.0,
    seg: 4, arc: Math.PI * 2, note: '四棱贴地短环 · 贴脸砍'
  },
  ranged: {
    name: '远程', color: 0x7fb8e0, inner: 0.62, outer: 1.0,
    seg: 3, arc: Math.PI * 2, note: '三角贴地环 · 站桩射'
  },
  flank: {
    name: '包夹', color: 0xe07a5a, inner: 0.66, outer: 1.0,
    seg: 5, arc: Math.PI * 2, note: '五边环 · 从侧后方合拢'
  },
  kite: {
    name: '风筝', color: 0x9a8ae0, inner: 0.62, outer: 1.0,
    seg: 6, arc: Math.PI * 1.45, note: '开口六边 · 绕圈走位'
  },
  bomber: {
    name: '自爆', color: 0xff6a3a, inner: 0.58, outer: 1.0,
    seg: 8, arc: Math.PI * 2, note: '八边环 · 引信期放大闪烁'
  },
  healer: {
    name: '治疗', color: 0x66d08a, inner: 0.62, outer: 1.0,
    seg: 4, arc: Math.PI * 1.5, note: '开口四边 · 施法时连治疗光束'
  },
  summoner: {
    name: '召唤', color: 0xc08ad8, inner: 0.66, outer: 1.0,
    seg: 7, arc: Math.PI * 2, note: '七边环 · 施法时亮起'
  },
  coward: {
    name: '逃逸', color: 0xd8c060, inner: 0.6, outer: 1.0,
    seg: 3, arc: Math.PI * 1.2, note: '开口三角 · 逃跑期放大闪烁'
  }
};

/* 与 MOB_AI_KINDS 的键一一对应，顺序固定 —— 探针按这个顺序数网格 */
const MOB_MARK_ORDER = [
  'melee', 'ranged', 'flank', 'kite', 'bomber', 'healer', 'summoner', 'coward'
];

/* 12 条词缀的常驻角标。颜色取自 ELITE_AFFIXES，形状 / 边数再补一维：
 * venom 与 summoner 同色（#7fd44a），只靠颜色分不出来；边数不同才读得出。 */
const ELITE_MARK = {
  berserk: { color: 0xff4a3a, seg: 3, name: '狂暴' },
  frost: { color: 0x5fc7ff, seg: 6, name: '冰霜' },
  lightning: { color: 0xb98cff, seg: 4, name: '闪电' },
  vampiric: { color: 0xe0424a, seg: 5, name: '吸血' },
  summoner: { color: 0x7fd44a, seg: 7, name: '召唤' },
  split: { color: 0xd8b25a, seg: 8, name: '分裂' },
  shield: { color: 0x8fd0ff, seg: 10, name: '护盾' },
  swift: { color: 0x8affd8, seg: 3, name: '迅捷' },
  venom: { color: 0x7fd44a, seg: 9, name: '剧毒' },
  thorns: { color: 0xffaa33, seg: 6, name: '荆棘' },
  deathwish: { color: 0xc08aff, seg: 5, name: '亡语' },
  warded: { color: 0xffd166, seg: 4, name: '元素免疫' }
};

/* 生命周期：只是一次性演出，不写回任何实体字段。
 * arrive 的环收束 + 光柱 = 「它来了」；death 的碎片 + 光柱 = 「它倒了」。 */
const BOSS_FX = {
  arrive: {
    ringDur: 0.9, ringColor: 0xff6644, beamDur: 0.85, beamColor: 0xffb070,
    beamWidth: 3, height: 7, shards: 16
  },
  death: {
    ringDur: 1.1, ringColor: 0xffaa44, beamDur: 1.2, beamColor: 0xffd890,
    beamWidth: 4, height: 9, shards: 26
  }
};
