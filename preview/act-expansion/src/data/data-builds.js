/* ============================================================
 * 数据层 · BD 推荐（P4）
 *
 * 这里放的是「流派模板」，不是「最优解」。一套 BD 说三件事：
 *   1. 玩哪个技能（skill）+ 选哪条取向（pick）+ 装哪条变体（form）
 *   2. 配套点哪几个被动（passives）
 *   3. 这套流派吃什么属性 / 什么标签（stats / tags）—— 用来算「你离它有多近」
 *
 * 为什么是「契合度」而不是「强度排名」：
 *   强度排名需要真实 DPS 模拟，而本作的变量（词缀、传世、词条、随机倍率）
 *   多到一个静态数字不可能诚实。契合度只回答一个问题：
 *   **按你现在的存档，哪三套流派最省事**（已经点了的在前面）。
 *   所以它一定会随你的加点和装备变，不是写死的顺序。
 *
 * 评分口径（满分 100，全部来自现有系统，没有新增隐藏系数）：
 *   45  分支：核心技能等级 15 + 取向对上 12 + 变体对上 18
 *   15  被动：声明的被动点了几成
 *   20  属性：声明属性的达成率（暴击 / 火伤 / 召唤伤…）
 *   20  标签：你已投点的技能里，有多少吃这套流派的标签
 * ============================================================ */

const BUILDS = [
  /* ==================== 刀客 ==================== */
  {
    id: 'w-whirl-bleed', cls: 'warrior', name: '血旋',
    tagline: '旋风斩转圈叠流血，靠多段命中把流血刷满',
    skill: 'whirl', pick: 1, form: 0,
    passives: ['w_fero', 'w_bloodlust'],
    stats: { crit: 25, critDmg: 60 },
    tags: ['phys', 'melee', 'bleed'],
    why: '「疾风」将单次施法拆为四段，每段均可触发「饮血」的流血；流血目标死亡时引爆其剩余伤害。',
    steps: ['旋风斩点到 5 级（精研「回流」自动生效）', '取向选「饮血」', '变体切「疾风」', '被动点满「狂怒」']
  },
  {
    id: 'w-quake-stun', cls: 'warrior', name: '崩山',
    tagline: '三连震逐段眩晕，靠「陷地」的易伤吃掉整段',
    skill: 'quake', pick: 1, form: 0,
    passives: ['w_heavy', 'w_ruin'],
    stats: { atkPct: 40, crit: 15 },
    tags: ['phys', 'aoe', 'stun'],
    why: '「三连震」三段均享受「陷地」的击晕延长与 15% 易伤；控制链成立后可稳定输出。',
    steps: ['震地术点到 5 级', '取向选「陷地」', '变体切「三连震」', '被动点「重击」']
  },
  {
    id: 'w-guard-wall', cls: 'warrior', name: '铁壁',
    tagline: '不动如山：站着挨打，靠反震与减伤把伤害喂回去',
    skill: 'shieldwall', pick: 0, form: 0,
    passives: ['w_iron', 'w_bastion'],
    stats: { def: 300, dmgReduce: 20 },
    tags: ['phys', 'shield', 'buff'],
    why: '「不动」固定原地以换取 80% 护甲，反震按受击次数结算，被围攻时收益最高。',
    steps: ['盾墙点到 5 级', '取向选「反震」', '变体切「不动」', '被动点「铁骨」与关键被动「不动如山」']
  },

  /* ==================== 术士 ==================== */
  {
    id: 'm-fire-burn', cls: 'mage', name: '燎原',
    tagline: '火墙满地铺，靠爆燃在墙尽头再炸一次',
    skill: 'firewall', pick: 1, form: 2,
    passives: ['m_ember', 'm_focus'],
    stats: { fireDmg: 40, atkPct: 30 },
    tags: ['fire', 'aoe', 'burn'],
    why: '「爆燃」使火墙结束时再结算一次爆炸，同一次施法两次结算燃烧；燃烧伤害受「燃烬」加成。',
    steps: ['火墙点到 5 级', '取向选「烈墙」', '变体切「爆燃」', '被动点「燃烬」']
  },
  {
    id: 'm-frost-lock', cls: 'mage', name: '冰封',
    tagline: '暴雪周期冻结，绝对零度把冻结目标按死',
    skill: 'blizzard', pick: 0, form: 1,
    passives: ['m_chill', 'm_absolute'],
    stats: { iceDmg: 40, crit: 15 },
    tags: ['ice', 'aoe', 'freeze'],
    why: '「冰封」使暴雪每 3 秒冻结一次；关键被动「绝对零度」对冻结目标额外 +35% 伤害。',
    steps: ['暴雪点到 5 级', '取向选「广域」', '变体切「冰封」', '关键被动「绝对零度」']
  },
  {
    id: 'm-storm-chain', cls: 'mage', name: '雷网',
    tagline: '连锁闪电铺成网，靠导电与雷神收尾',
    skill: 'chain', pick: 0, form: 0,
    passives: ['m_volt', 'm_stormlord'],
    stats: { lightningDmg: 40, critDmg: 40 },
    tags: ['thunder', 'ranged', 'chain'],
    why: '「雷网」额外弹射两次，每次弹射均受「导电」加成；雷神每 6 秒落雷一次，用于填补冷却空档。',
    steps: ['连锁闪电点到 5 级', '取向选「多链」', '变体切「雷网」', '被动「高压」+ 关键被动「雷神」']
  },

  /* ==================== 符师 ==================== */
  {
    id: 't-summon-beast', cls: 'taoist', name: '兽群',
    tagline: '兽王体型翻倍，双龙双虎一起压上去',
    skill: 'summon', pick: 0, form: 1,
    passives: ['t_bond', 't_beast'],
    stats: { summonDmg: 50 },
    tags: ['summon', 'phys'],
    why: '「兽王」同时提升灵狼体型与伤害，「兽契」额外提升灵兽上限。灵兽无生命值，收益集中于输出时长。',
    steps: ['召灵兽点到 5 级', '取向选「凶兽」', '变体切「兽王」', '被动「通灵」+ 关键被动「兽契」']
  },
  {
    id: 't-poison-sea', cls: 'taoist', name: '毒海',
    tagline: '毒雾铺地，尸毒把每一具尸体变成地雷',
    skill: 'poison', pick: 1, form: 0,
    passives: ['t_toxin', 't_merid'],
    stats: { poisonDmg: 40 },
    tags: ['poison', 'aoe', 'dot'],
    why: '「毒海」将毒雾半径提升至上限，「尸毒」使敌人在雾中死亡后再爆一次；群体清理依赖连锁死亡。',
    steps: ['毒雾点到 5 级', '取向选「毒海」', '变体切「尸毒」', '被动点「毒经」']
  },
  {
    id: 't-holy-mend', cls: 'taoist', name: '丹道',
    tagline: '回春诀拉着跑，续命靠治疗而不是护甲',
    skill: 'heal', pick: 1, form: 2,
    passives: ['t_merid', 't_elixir'],
    stats: { healBonus: 30, hpMax: 600 },
    tags: ['holy', 'heal', 'buff'],
    why: '「回春诀」将单次治疗改为持续回复，治疗量受「脉络」加成；关键被动「九转还丹」用于应急续命。',
    steps: ['回春术点到 5 级', '取向选「厚生」', '变体切「回春诀」', '关键被动「九转还丹」']
  }
];

/* ---------------- 读取 ---------------- */

function buildList(cls) {
  return cls ? BUILDS.filter(b => b.cls === cls) : BUILDS.slice();
}

function buildOf(id) {
  for (const b of BUILDS) if (b.id === id) return b;
  return null;
}

/* ---------------- 契合度 ----------------
 * ctx = {
 *   cls,                                    // 存档职业
 *   skills: { id: { lv, p, f } },           // Game.skillState()
 *   passives: { id: lv },                   // state.passives
 *   stats: { crit, critDmg, fireDmg, … },   // state.stats
 *   tagCount: { tag: 已投点技能数 }           // 由 Game.recommendBuilds 预先数好
 * }
 * 返回 { fit, parts[], missing[] }。纯函数：同一次存档永远同一个分数，
 * 所以测试可以把它钉死，玩家也不会看到「刷新一下分数变了」。 */
function buildFit(b, ctx) {
  const c = ctx || {};
  const skills = c.skills || {}, pas = c.passives || {}, stats = c.stats || {}, tagCount = c.tagCount || {};
  const lvMax = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.lvMax) || 5;
  const e = skills[b.skill] || {};
  const lv = Math.max(1, Math.min(lvMax, e.lv || 1));
  const parts = [], missing = [];

  /* 1) 核心技能等级（15） */
  const lvRatio = lvMax > 1 ? (lv - 1) / (lvMax - 1) : 1;
  parts.push({ key: 'lv', label: '核心等级', got: Math.round(lvRatio * 15), max: 15,
    text: lv + ' / ' + lvMax + ' 级' });
  if (lv < lvMax) missing.push('核心技能 ' + lv + '/' + lvMax + ' 级');

  /* 2) 取向（12）—— 只有真的选上了才算（点数不够 / 等级不够时 e.p 是摆设） */
  const pickOk = (typeof skillBranchPickValid === 'function')
    ? (skillBranchPickValid(lv, e.p) && e.p === b.pick)
    : (e.p === b.pick);
  parts.push({ key: 'pick', label: '取向', got: pickOk ? 12 : 0, max: 12,
    text: buildPickName(b) || '—' });
  if (!pickOk) missing.push('取向「' + (buildPickName(b) || '?') + '」');

  /* 3) 变体（18）—— 免费换，但没对上就是另一套打法 */
  const formIdx = (typeof skillFormIdx === 'function') ? skillFormIdx(skills, b.skill) : (e.f || 0);
  const formOk = formIdx === b.form;
  parts.push({ key: 'form', label: '变体', got: formOk ? 18 : 0, max: 18,
    text: buildFormName(b) || '—' });
  if (!formOk) missing.push('变体「' + (buildFormName(b) || '?') + '」');

  /* 4) 被动（15）—— 按「点了几成」算，1 点多的小被动没点满不算达成 */
  const pl = b.passives || [];
  let pHave = 0;
  for (const pid of pl) {
    const def = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.passives[pid]) || {};
    const max = def.max || 1;
    const have = Math.min(max, (pas[pid] || 0));
    pHave += have / max;
    if (have < max) {
      const nm = def.name || pid;
      missing.push('被动「' + nm + '」' + have + '/' + max);
    }
  }
  const pRatio = pl.length ? pHave / pl.length : 1;
  parts.push({ key: 'pas', label: '被动', got: Math.round(pRatio * 15), max: 15,
    text: pl.map(pid => ((SKILL_TREE.passives[pid] || {}).name || pid)).join(' / ') || '—' });

  /* 5) 属性（20）—— 每项按达成率，超额封顶 1（堆到 200% 不该双倍加分） */
  const sk = Object.keys(b.stats || {});
  let sSum = 0;
  for (const k of sk) {
    const want = b.stats[k] || 0;
    const have = stats[k] || 0;
    const r = want > 0 ? Math.max(0, Math.min(1, have / want)) : 1;
    sSum += r;
    if (r < 0.999) missing.push(statLabel(k) + ' ' + Math.round(have) + '/' + want);
  }
  const sRatio = sk.length ? sSum / sk.length : 1;
  parts.push({ key: 'stat', label: '属性', got: Math.round(sRatio * 20), max: 20,
    text: sk.map(k => statLabel(k)).join(' / ') || '—' });

  /* 6) 标签（20）—— 这套流派吃的标签，你已投点的技能里占几成 */
  const tg = b.tags || [];
  let tHit = 0;
  for (const t of tg) if ((tagCount[t] || 0) > 0) tHit++;
  const tRatio = tg.length ? tHit / tg.length : 1;
  parts.push({ key: 'tag', label: '标签', got: Math.round(tRatio * 20), max: 20,
    text: tg.map(t => ((SKILL_TREE.tagName || {})[t] || t)).join(' / ') || '—' });

  const fit = Math.max(0, Math.min(100,
    parts.reduce((n, p) => n + p.got, 0)));
  return { fit, parts, missing };
}

/* 属性键的中文名。只列 BD 里可能用到的那些 —— 没登记的直接显示键名，
 * 比编一个中文名出来更容易发现「数据里写错了」。 */
const BUILD_STAT_NAME = {
  crit: '暴击率', critDmg: '暴击伤害', atkPct: '攻击加成', atk: '攻击力',
  def: '护甲', hpMax: '生命上限', dmgReduce: '减伤', aspd: '攻速',
  fireDmg: '火伤', iceDmg: '冰伤', lightningDmg: '雷伤',
  poisonDmg: '毒伤', sigilDmg: '符法', summonDmg: '召唤伤',
  healBonus: '治疗量', magicFind: '魔 find'
};
function statLabel(k) { return BUILD_STAT_NAME[k] || k; }

/* 一套 BD 里那个技能的取向 / 变体叫什么（面板要显示「差的是哪一条」） */
function buildPickName(b) {
  const br = (typeof skillBranches === 'function') ? skillBranches(b.skill) : null;
  return (br && br.pick[b.pick]) ? br.pick[b.pick].name : '';
}
function buildFormName(b) {
  const br = (typeof skillBranches === 'function') ? skillBranches(b.skill) : null;
  return (br && br.form[b.form]) ? br.form[b.form].name : '';
}
