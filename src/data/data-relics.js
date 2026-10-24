/* ============================================================
 * 数据层 · 法器（v1.3.0）
 * ------------------------------------------------------------
 * 法器是「职业专属」的第 12 个装备位，戴在纸娃娃右上角。
 * 三职业各 10 件，共 30 件，每件都有：
 *   intro  —— 一句话介绍（提示框里紧跟名字）
 *   lore   —— 来历与历史（两三句，落款式的传闻）
 *   stats  —— 固定属性（走 sumItemStats，真实生效）
 *   skill  —— 对某门术法的修正（走 skillMods，与 36 术法 × 3 变体相辅相成）
 *   grant  —— 可选的「自带术法」：未领悟也能施放，卸下即失效
 * 数值刻意不做成纯数值堆：每件都指向一门具体术法，凑出流派。
 * ============================================================ */

const RELICS = {
  /* ---------------- 战士 · 10 ---------------- */
  w1: {
    id: 'w1', cls: 'warrior', name: '破军令', glyph: '令', ilvl: 8,
    intro: '军令一出，三军皆进，无退者。',
    lore: '北境边军的传令之物，铜铸为符，号为「破军」。凡遣死士突阵，必以此令为凭；令在人在，令失则斩。',
    stats: { atk: 8, crit: 3 }, skill: { id: 'thrust', dmg: 18 }
  },
  w2: {
    id: 'w2', cls: 'warrior', name: '玄铁重盾', glyph: '盾', ilvl: 12,
    intro: '盾在则阵在，阵在则人存。',
    lore: '取自玄铁矿脉最深处的整块铁心，锻打九百日方成一尺。旧时守关老兵说，盾后听得见同袍的呼吸，才敢往前顶。',
    stats: { def: 22, block: 4 }, skill: { id: 'shieldwall', dur: 2 }
  },
  w3: {
    id: 'w3', cls: 'warrior', name: '裂云战鼓', glyph: '鼓', ilvl: 16,
    intro: '鼓声裂云，血性自生。',
    lore: '蒙皮取自荒原巨犀，敲之如雷。古法战前必擂三通：一通聚众，二通壮胆，三通之后不留降者。',
    stats: { atk: 12, dmgAll: 4 }, skill: { id: 'warcry', dur: 3 }
  },
  w4: {
    id: 'w4', cls: 'warrior', name: '龙纹刀匣', glyph: '匣', ilvl: 20,
    intro: '刀出匣，则风雪俱断。',
    lore: '传说铸刀者将一条幼蛟封于匣中养刃，刃成而蛟死。此后每出鞘，匣内便起一阵腥风。',
    stats: { atk: 16, aspd: 4 }, skill: { id: 'whirl', dmg: 20, count: 1 }
  },
  w5: {
    id: 'w5', cls: 'warrior', name: '虎符', glyph: '符', ilvl: 24,
    intro: '半符在手，万军可调。',
    lore: '调兵之符剖为两半，将于君各执其一。此符缺口处有暗记，据说是某位不肯交符的将军咬出来的。',
    stats: { atk: 20, critDmg: 12 }, skill: { id: 'leap', dmg: 25 }
  },
  w6: {
    id: 'w6', cls: 'warrior', name: '血玉髓', glyph: '玉', ilvl: 28,
    intro: '玉中血纹，遇怒则活。',
    lore: '玉纹本如枯枝，戴久了竟顺着血脉长出细红纹。持玉者怒极时，玉会发烫，医官说那是玉在替他烧血。',
    stats: { atk: 24, lifesteal: 3 }, skill: { id: 'bloodrage', dmg: 18 }
  },
  w7: {
    id: 'w7', cls: 'warrior', name: '断罪尺', glyph: '尺', ilvl: 32,
    intro: '量罪之器，一尺斩一人。',
    lore: '刑堂旧物，铁尺边沿刻满罪由。行刑前要以尺量颈，罪重者尺贴皮肉自会发红——后来人们发现，红的是尺上的锈。',
    stats: { atk: 28, dmgAll: 6 }, skill: { id: 'execute', dmg: 22 }
  },
  w8: {
    id: 'w8', cls: 'warrior', name: '万刃剑匣', glyph: '匣', ilvl: 34,
    intro: '匣开如潮，刃自天来。',
    lore: '匠人一生只做匣，不做剑。他说剑会钝，匣里的剑永远锋利——因为他从没让人把剑取出来过。',
    stats: { atk: 30, aspd: 5 }, skill: { id: 'swordarray', count: 2, dmg: 10 }
  },
  w9: {
    id: 'w9', cls: 'warrior', name: '镇岳碑', glyph: '碑', ilvl: 36,
    intro: '碑落之处，山岳为平。',
    lore: '半截残碑，碑文早已磨尽。地方志载：某年地动，此碑自山中滚落，压住裂缝，一村得活。',
    stats: { def: 34, thorns: 8 }, skill: { id: 'quake', radius: 20, dmg: 12 }
  },
  w10: {
    id: 'w10', cls: 'warrior', name: '剑神幡', glyph: '幡', ilvl: 40,
    intro: '幡为剑魂所附，非大勇者不能举。',
    lore: '幡面空无一字，风起时却隐约有声，像千百人同时拔剑。举幡者若心怯，幡便重若千钧。',
    stats: { atk: 36, dmgAll: 8 }, skill: { id: 'avatar', dmg: 20 }, grant: 'avatar'
  },

  /* ---------------- 法师 · 10 ---------------- */
  m1: {
    id: 'm1', cls: 'mage', name: '星砂壶', glyph: '壶', ilvl: 8,
    intro: '壶中藏一捧坠地未熄的星砂。',
    lore: '观星者以此壶收殒星之烬，倾之则火如雨下。壶身内壁早已被烧成琉璃色。',
    stats: { skillDmg: 6, mp: 12 }, skill: { id: 'meteor', dmg: 18 }
  },
  m2: {
    id: 'm2', cls: 'mage', name: '冰魄瓶', glyph: '瓶', ilvl: 12,
    intro: '瓶中一魄，千年不化。',
    lore: '极北雪渊的旧物，据说封着一位冻毙女子的最后一口气。开瓶时不做寒，反倒有一股极淡的桂花香。',
    stats: { skillDmg: 8, mp: 16 }, skill: { id: 'blizzard', radius: 18 }
  },
  m3: {
    id: 'm3', cls: 'mage', name: '雷纹印', glyph: '印', ilvl: 16,
    intro: '印上雷纹，触之则分叉。',
    lore: '印材是雷击木的芯，纹路并非人所刻——是雷自己走出来的路。凡以印引雷，雷必沿旧路再来一次。',
    stats: { skillDmg: 10, cdr: 4 }, skill: { id: 'chain', count: 1 }
  },
  m4: {
    id: 'm4', cls: 'mage', name: '焚天羽', glyph: '羽', ilvl: 20,
    intro: '一片不烬的羽，落处成火墙。',
    lore: '取自传闻中的赤鸟，羽不燃而自热。有人把它埋进水缸，第二日整口缸烧成了陶。',
    stats: { skillDmg: 12, dmgAll: 4 }, skill: { id: 'firewall', dur: 3 }
  },
  m5: {
    id: 'm5', cls: 'mage', name: '寒玉镜', glyph: '镜', ilvl: 24,
    intro: '照人先照影，影冻则人僵。',
    lore: '镜背刻「勿照己身」。前代持有者不信，照了一次，此后十年没再说过一句完整的话。',
    stats: { skillDmg: 14, mp: 20 }, skill: { id: 'frostnova', radius: 15, dmg: 8 }
  },
  m6: {
    id: 'm6', cls: 'mage', name: '火枣核', glyph: '核', ilvl: 26,
    intro: '一枚果核，含之则口舌生火。',
    lore: '据说长在火山口的枣树，三百年只结一季。核落地即自燃，所以从没人见过那棵树的种子。',
    stats: { skillDmg: 16, crit: 4 }, skill: { id: 'fireball', dmg: 22 }
  },
  m7: {
    id: 'm7', cls: 'mage', name: '玄冰鉴', glyph: '鉴', ilvl: 30,
    intro: '鉴可映影，亦可为壁。',
    lore: '鉴面终年结霜，霜下似有人影走动。法师们说那是被冻住的时辰，不必细看。',
    stats: { skillDmg: 18, mp: 24 }, skill: { id: 'iceshield', dur: 3 }
  },
  m8: {
    id: 'm8', cls: 'mage', name: '天火罗盘', glyph: '盘', ilvl: 34,
    intro: '罗盘不指北，只指天上。',
    lore: '指针永远斜指苍穹某处，随星辰移转。有人循它找了半生，最后只带回一块烧黑的陨铁。',
    stats: { skillDmg: 20, dmgAll: 6 }, skill: { id: 'starfall', dmg: 18 }
  },
  m9: {
    id: 'm9', cls: 'mage', name: '雷云幡', glyph: '幡', ilvl: 36,
    intro: '幡起则云聚，云聚则雷落。',
    lore: '幡布是用雷雨夜晾在崖顶的麻布裁成，吸饱了雷电。每逢阴天，幡角会自己噼啪作响。',
    stats: { skillDmg: 22, cdr: 6 }, skill: { id: 'thundercloud', dur: 3 }
  },
  m10: {
    id: 'm10', cls: 'mage', name: '天罚朱笔', glyph: '笔', ilvl: 40,
    intro: '朱笔点名录，雷自笔尖生。',
    lore: '笔杆旧得发亮，笔毫却始终朱红。传说它只在「该罚的名字」上写得出字，其余皆作无色。',
    stats: { skillDmg: 26, critDmg: 20 }, skill: { id: 'judgement', dmg: 22 }, grant: 'judgement'
  },

  /* ---------------- 道士 · 10 ---------------- */
  t1: {
    id: 't1', cls: 'taoist', name: '桃符匣', glyph: '匣', ilvl: 8,
    intro: '匣中三符，皆出自同一株老桃。',
    lore: '老桃生于村口，雷劈过三次都没死。村民说它替全村挡了灾，所以削枝做符，符符带雷气。',
    stats: { skillDmg: 6, mp: 12 }, skill: { id: 'talisman', dmg: 20 }
  },
  t2: {
    id: 't2', cls: 'taoist', name: '兽骨铃', glyph: '铃', ilvl: 12,
    intro: '摇之则兽至，不问生死。',
    lore: '铃身是野牛的额骨，内里悬着一枚小石子。老道士说，这铃不是召兽，是唤那些「还没走远」的兽。',
    stats: { skillDmg: 8, summonDmg: 8 }, skill: { id: 'summon', count: 1 }
  },
  t3: {
    id: 't3', cls: 'taoist', name: '青囊卷', glyph: '卷', ilvl: 16,
    intro: '青囊所载，非病即命。',
    lore: '医者行囊中的手抄本，页边写满批注，字迹从工整到潦草，最后几页只剩几个药名。',
    stats: { healBonus: 10, mp: 16 }, skill: { id: 'heal', dmg: 20 }
  },
  t4: {
    id: 't4', cls: 'taoist', name: '蚀骨瓶', glyph: '瓶', ilvl: 20,
    intro: '瓶中绿雾，见骨方休。',
    lore: '封口用了七层蜡，仍有淡淡腥甜逸出。旧主人是位瘴医，最后把自己也封进了另一个瓶子里。',
    stats: { skillDmg: 10, dotDmg: 10 }, skill: { id: 'poison', dur: 3, radius: 12 }
  },
  t5: {
    id: 't5', cls: 'taoist', name: '符箭袋', glyph: '袋', ilvl: 24,
    intro: '箭出如符，符落如雨。',
    lore: '袋口缝着一枚旧年号钱，箭矢抽出时会带起细碎朱砂——那是前一位主人画符时落进去的。',
    stats: { skillDmg: 12, projDmg: 10 }, skill: { id: 'talismanarrow', count: 1 }
  },
  t6: {
    id: 't6', cls: 'taoist', name: '太极盘', glyph: '盘', ilvl: 28,
    intro: '盘转一周，生死各半。',
    lore: '盘心黑白双鱼，转动时永远不停在同一格。道门旧规：布阵先转盘，盘停处即为阵眼。',
    stats: { def: 18, skillDmg: 14 }, skill: { id: 'taiji', dur: 3, radius: 15 }
  },
  t7: {
    id: 't7', cls: 'taoist', name: '白虎牙', glyph: '牙', ilvl: 30,
    intro: '一牙镇山，百兽噤声。',
    lore: '牙主是只独行的白虎，死时无伤，只在雪地里睡着般伏着。取牙者说，他听见虎在梦里低吼了整夜。',
    stats: { summonDmg: 16, atk: 16 }, skill: { id: 'whitetiger', dmg: 20 }
  },
  t8: {
    id: 't8', cls: 'taoist', name: '万剑匣', glyph: '匣', ilvl: 34,
    intro: '匣非剑匣，乃一念之名。',
    lore: '匣内空无一物，闭目叩之却有金铁相击声。道士说：万剑不在匣里，在叩匣人的心里。',
    stats: { skillDmg: 20, dmgAll: 5 }, skill: { id: 'swordrain', count: 2, dmg: 12 }
  },
  t9: {
    id: 't9', cls: 'taoist', name: '天师印', glyph: '印', ilvl: 36,
    intro: '印落成符，符镇山河。',
    lore: '印面九字，据说是第一代天师以指血刻成。印泥从来只用朱砂拌露水，放久了也不干。',
    stats: { skillDmg: 22, dmgAll: 6 }, skill: { id: 'mastersigil', dmg: 18 }, grant: 'mastersigil'
  },
  t10: {
    id: 't10', cls: 'taoist', name: '青龙鳞', glyph: '鳞', ilvl: 40,
    intro: '一鳞之内，藏半条江。',
    lore: '鳞片在雨天会自己变凉，贴着耳朵能听见水声。有人说是河在鳞里流，也有人说那只是还剩一点魂。',
    stats: { summonDmg: 24, atk: 24 }, skill: { id: 'azuredragon', dmg: 20 }, grant: 'azuredragon'
  }
};

const RELIC_IDS = Object.keys(RELICS);
/* 该职业、不超过该等级段的法器（ilvl 不超过 cap + 6，留一点越级惊喜） */
function relicPool(cls, cap) {
  const lim = (cap || 40) + 6;
  const all = RELIC_IDS.filter(id => RELICS[id].cls === cls && RELICS[id].ilvl <= lim);
  return all.length ? all : RELIC_IDS.filter(id => RELICS[id].cls === cls);
}
