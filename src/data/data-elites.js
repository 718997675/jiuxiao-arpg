/* ============================================================
 * 数据层 · 精英词缀（S5）
 *
 * 12 条词缀，每条都必须在 game.js 里有真实生效点，不许做面板摆设。
 * 生效点对照表（改这里之前先看一眼有没有地方在用它）：
 *
 *   berserk    updateEnemies      血量 <50% 时 dmg ×1.6、atkCd ×0.7
 *   frost      damagePlayer       命中后 playerSlow（移速 -35%）
 *   lightning  damagePlayer       命中后 30% 追加一道落雷（额外伤害）
 *   vampiric   damagePlayer       造成伤害的 40% 回血（不超过自身上限）
 *   summoner   damageEnemy        每掉 25% 血召唤 2 只同族
 *   split      onEnemyDeath       死亡时分裂 2 只 40% 血幼体
 *   shield     updateEnemies      每 8 秒补满 25% 最大生命的护盾
 *   swift      spawnEnemy/update  移速 +45%、攻速 +25%
 *   venom      damagePlayer       命中必定中毒
 *   thorns     damagePlayer       近战受击反弹 30% 伤害给玩家
 *   deathwish  onEnemyDeath       死亡时 4m 爆炸
 *   warded     damageEnemy        免疫一种元素（该元素伤害 -85%）
 *
 * 词缀数量按难度：新手 1 条、普通 1~2 条、困难 2 条、极难 2~3 条。
 * ============================================================ */

const ELITE_AFFIXES = {
  berserk: {
    name: '狂暴', color: '#ff4a3a',
    desc: '生命低于 50% 时，伤害 +60%、攻速 +30%',
    dmgMul: 1.6, cdMul: 0.7, hpLine: 0.5
  },
  frost: {
    name: '冰霜', color: '#5fc7ff',
    desc: '命中使目标移速 -35%，持续 3 秒',
    slow: 35, slowDur: 3
  },
  lightning: {
    name: '闪电', color: '#b98cff',
    desc: '命中时 30% 概率追加一道落雷',
    proc: 0.3, mult: 0.6
  },
  vampiric: {
    name: '吸血', color: '#e0424a',
    desc: '造成伤害的 40% 回复自身',
    leech: 40
  },
  summoner: {
    name: '召唤', color: '#7fd44a',
    desc: '生命每降 25%，召唤 2 只同族',
    step: 0.25, count: 2
  },
  split: {
    name: '分裂', color: '#d8b25a',
    desc: '死亡时分裂为 2 只 40% 生命的幼体',
    count: 2, hpPct: 0.4
  },
  shield: {
    name: '护盾', color: '#8fd0ff',
    desc: '每 8 秒获得相当于 25% 最大生命的护盾',
    cd: 8, pct: 25
  },
  swift: {
    name: '迅捷', color: '#8affd8',
    desc: '移速 +45%、攻速 +25%',
    spd: 45, aspd: 25
  },
  venom: {
    name: '剧毒', color: '#7fd44a',
    desc: '命中必定施加中毒',
    dpsPct: 12
  },
  thorns: {
    name: '荆棘', color: '#ffaa33',
    desc: '近战受击反弹 30% 伤害',
    pct: 30
  },
  deathwish: {
    name: '亡语', color: '#c08aff',
    desc: '死亡时爆炸，对 4 米内造成伤害',
    radius: 4, mult: 1.2
  },
  warded: {
    name: '元素免疫', color: '#ffd166',
    desc: '免疫一种元素（该元素伤害 -85%）',
    cut: 85
  }
};

const ELITE_AFFIX_ORDER = [
  'berserk', 'frost', 'lightning', 'vampiric', 'summoner', 'split',
  'shield', 'swift', 'venom', 'thorns', 'deathwish', 'warded'
];

/* 元素免疫只免疫这四种之一（物理不在其中，否则石魔 + 免疫物理会无解） */
const ELITE_WARD_ELEMS = ['fire', 'ice', 'lightning', 'poison'];

/* 抽词缀：n 条，不重复；warded 会带一个 wardElem 字段。
 * 返回的是 id 数组（存进 e.affixes），效果参数从 ELITE_AFFIXES 查。 */
function rollEliteAffixes(n) {
  const pool = ELITE_AFFIX_ORDER.slice();
  const out = [];
  const count = Math.max(1, Math.min(n | 0, pool.length));
  for (let i = 0; i < count; i++) {
    const k = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

/* 按难度给词缀条数：新手 1、普通 1~2、困难 2、极难 2~3 */
function eliteAffixCount(diffId) {
  switch (diffId) {
    case 'novice': return 1;
    case 'hard': return 2;
    case 'nightmare': return 2 + (Math.random() < 0.5 ? 1 : 0);
    default: return 1 + (Math.random() < 0.5 ? 1 : 0);
  }
}

/* 精英显示名：第一条词缀当前缀，其余用小标记（tooltip 里全列） */
function eliteDisplayName(baseName, affixes) {
  if (!affixes || !affixes.length) return baseName;
  const first = ELITE_AFFIXES[affixes[0]];
  return (first ? first.name : '') + '·' + baseName;
}
