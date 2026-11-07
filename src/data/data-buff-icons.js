/* ============================================================
 * 数据层 · 增益图标（M11 规范）
 *
 * 硬性规范（照抄 src/data/data-icons.js）：
 *   · viewBox="0 0 32 32"，纯 path（不用 circle/rect）
 *   · fill="currentColor"，颜色由外层 CSS 上色
 *   · 层次靠负空间镂空：同一 d 里拼多条子路径 + fill-rule
 *
 * 【关键约束】增益图标必须是**符号**（箭头 / 盾 / 心 / 滴），
 * 不能画成技能图标（符纸 / 剑 / 火球）。技能图标是具象物，
 * 增益图标要是具象物，玩家会以为那是技能位。
 * ============================================================ */

/* 每枚图标 = 一条 d。孔洞靠子路径 + fill-rule：
 *   evenodd → 内部子路径挖空（心 + 十字、火焰 + 内焰）
 *   nonzero → 多段实心（刺环的尖刺与圆环、撕裂的三道斜线）
 * 挖空类图标默认 evenodd，实心叠加类默认 nonzero。 */
const BUFF_ICON_PATHS = {
  /* ---- 增益 ---- */
  /* 攻击提升：实心上箭头 */
  atk_up: 'M16 3 L26 14 H21 V26 H11 V14 H6 Z',
  /* 攻速提升：上下双箭头（转得快） */
  aspd_up: 'M16 3 L23 11 H18.5 V15.5 H13.5 V11 H9 Z M16 29 L9 21 H13.5 V16.5 H18.5 V21 H23 Z',
  /* 移速提升：右向箭头 + 两条速度线 */
  spd_up: 'M2 9 H12 V12 H2 Z M2 15 H12 V18 H2 Z M15 6.5 L27 14 L15 21.5 Z',
  /* 暴击提升：四角星爆点 */
  crit_up: 'M16 2 L19.2 12.8 L30 16 L19.2 19.2 L16 30 L12.8 19.2 L2 16 L12.8 12.8 Z',
  /* 减伤提升：盾牌 + 向上箭头（箭头是洞） */
  dr_up: 'M16 3 L27 7 V16 C27 22.5 22 27 16 29 C10 27 5 22.5 5 16 V7 Z M16 9.5 L11.2 15.4 H14.2 V20.4 H17.8 V15.4 H20.8 Z',
  /* 护盾：盾牌环 */
  shield: 'M16 3 L27 7 V16 C27 22.5 22 27 16 29 C10 27 5 22.5 5 16 V7 Z M16 8 L10 10.4 V16 C10 20.2 12.6 23.4 16 25 C19.4 23.4 22 20.2 22 16 V10.4 Z',
  /* 回血：心 + 十字（十字是洞） */
  regen: 'M16 27.5 C13 24.6 4 18.6 4 12.6 C4 8.7 6.9 5.6 10.2 5.6 C12.6 5.6 14.8 6.9 16 9 C17.2 6.9 19.4 5.6 21.8 5.6 C25.1 5.6 28 8.7 28 12.6 C28 18.6 19 24.6 16 27.5 Z M14.4 9.6 H17.6 V13 H21 V16.2 H17.6 V19.6 H14.4 V16.2 H11 V13 H14.4 Z',
  /* 无敌 / 免疫：拱形光罩（内壁是洞） */
  invuln: 'M16 3 C23 3 28.5 8.6 28.5 15.6 V27 H3.5 V15.6 C3.5 8.6 9 3 16 3 Z M16 8.5 C11.7 8.5 8.2 11.7 8.2 15.6 H23.8 C23.8 11.7 20.3 8.5 16 8.5 Z',
  /* 反震：中心圆 + 四根刺 */
  thorns: 'M16 9 a7 7 0 1 0 0 14 a7 7 0 1 0 0 -14 Z M16 1 L19.4 8 H12.6 Z M31 16 L24 19.4 V12.6 Z M16 31 L12.6 24 H19.4 Z M1 16 L8 12.6 V19.4 Z',
  /* 冷却缩减：沙漏 */
  cdr: 'M8 4 H24 V7.5 L17.6 16 L24 24.5 V28 H8 V24.5 L14.4 16 L8 7.5 Z',
  /* 减速：下箭头 + 两条递减线 */
  slow: 'M16 29 L9 21.5 H13.5 V12 H18.5 V21.5 H23 Z M2 9 H9 V12 H2 Z M2 15 H7 V18 H2 Z',
  /* 冻结：六边形 + 雪花（雪花是洞） */
  freeze: 'M16 2 L28 9 V23 L16 30 L4 23 V9 Z M14.6 8 H17.4 V13.2 L22 10.4 L23.4 12.6 L18.8 15.4 L23.4 18.2 L22 20.4 L17.4 17.6 V23 H14.6 V17.6 L10 20.4 L8.6 18.2 L13.2 15.4 L8.6 12.6 L10 10.4 L14.6 13.2 Z',
  /* 中毒：泪滴 + 一滴小孔（孔是洞） */
  poison: 'M16 2 C16 2 24.5 11 24.5 18.5 a8.5 8.5 0 0 1 -17 0 C7.5 11 16 2 16 2 Z M16 13.5 a3.4 3.4 0 1 0 0 6.8 a3.4 3.4 0 1 0 0 -6.8 Z',
  /* 燃烧：火焰 + 内焰（内焰是洞） */
  burn: 'M16 2 C16 2 26.5 10.5 26.5 18.5 a10.5 10.5 0 0 1 -21 0 C5.5 14 8.4 11.2 10.2 8.2 C10.8 11 12.2 12.4 13.8 12.4 C14.4 9 15.2 5.6 16 2 Z M16 13.5 a5.4 5.4 0 1 0 0 10.8 a5.4 5.4 0 1 0 0 -10.8 Z',
  /* 易伤：盾牌 + 裂纹（裂纹是洞） */
  vuln: 'M16 3 L27 7 V16 C27 22.5 22 27 16 29 C10 27 5 22.5 5 16 V7 Z M18 6 L12.5 14 L16.5 15 L10.5 25 L20.5 15.5 L16.5 14.5 L21.5 5.5 Z',
  /* 破甲 / 削减：三道斜线 */
  shred: 'M4 11 L8 6.5 L18 20 L14 24.5 Z M11 13 L15 8.5 L25 22 L21 26.5 Z M18 15 L22 10.5 L28 18 L24 22.5 Z',
  /* 无法治疗：被劈开的心（两半，中间留缝） */
  noheal: 'M15.2 27.4 C12.3 24.5 3.5 18.5 3.5 12.6 C3.5 8.7 6.4 5.6 9.7 5.6 C12.1 5.6 14.3 6.9 15.2 9 Z M16.8 27.4 C19.7 24.5 28.5 18.5 28.5 12.6 C28.5 8.7 25.6 5.6 22.3 5.6 C19.9 5.6 17.7 6.9 16.8 9 Z'
};

/* 填充规则：默认 nonzero（实心叠加），挖空类用 evenodd */
const BUFF_ICON_EVENODD = {
  dr_up: 1, shield: 1, regen: 1, invuln: 1,
  freeze: 1, poison: 1, burn: 1, vuln: 1
};

/* buff key → 图标 key。key 口径与游戏里的 buff key 完全一致：
 *   skill:<技能id> / beh:<被动名> / passive:<被动id> / trial:<id> / st:<状态名>
 * 查不到就退回名字映射，再查不到才用「取名字首字」的兜底。 */
const BUFF_ICON_OF = {
  /* 技能增益 */
  'skill:bloodrage': 'atk_up',
  'skill:warcry': 'atk_up',
  'skill:shieldwall': 'dr_up',
  'skill:riposte': 'thorns',
  'skill:avatar': 'atk_up',
  'skill:elementavatar': 'invuln',
  'skill:taiji': 'dr_up',
  'skill:antidote': 'regen',
  'skill:revive': 'invuln',
  /* 被动（beh:<名>） */
  'beh:威压': 'atk_up',
  'beh:锐意': 'crit_up',
  'beh:锋锐': 'crit_up',
  'beh:疾行': 'spd_up',
  'beh:急攻': 'aspd_up',
  'beh:回春': 'regen',
  'beh:减伤': 'dr_up',
  'beh:坚壁': 'dr_up',
  'beh:反震': 'thorns',
  'beh:灵台': 'cdr',
  'beh:逆命': 'invuln',
  'beh:冰封': 'freeze',
  'beh:定身': 'freeze',
  'beh:战意': 'atk_up',
  /* 被动（passive / trial） */
  'passive:w_undying': 'invuln',
  'trial:bloodlust': 'atk_up',
  /* 状态条 */
  'st:revive': 'invuln',
  'st:slow': 'slow',
  'st:root': 'freeze',
  'st:pull': 'slow',
  'st:poison': 'poison',
  'st:shield': 'shield',
  'st:domain': 'vuln',
  'st:zone': 'vuln'
};

/* 名字 → 图标 key（没有 key 的状态条 / 老 buff 走这条） */
const BUFF_ICON_BY_NAME = {
  '战意': 'atk_up', '威压': 'atk_up', '血怒': 'atk_up', '狂战': 'aspd_up',
  '嗜血狂潮': 'atk_up', '战意不灭': 'invuln', '坚魂': 'invuln',
  '锐意': 'crit_up', '锋锐': 'crit_up', '疾行': 'spd_up', '急攻': 'aspd_up',
  '回春': 'regen', '减伤': 'dr_up', '坚壁': 'dr_up', '反震': 'thorns',
  '灵台': 'cdr', '逆命': 'invuln', '冰封': 'freeze', '定身': 'freeze',
  '还魂': 'invuln', '护盾': 'shield', '中毒': 'poison', '迟滞': 'slow',
  '被拖拽': 'slow', '战意咆哮': 'atk_up', '盾墙': 'dr_up', '反击': 'thorns',
  '剑神降世': 'atk_up', '元素法相': 'invuln', '太极玄阵': 'dr_up',
  '解毒': 'regen', '逆命·反噬': 'vuln'
};

/* 图标查表：key → 名字 → 都没有返回 null（由 UI 退回汉字首字） */
function buffIconKey(key, name) {
  if (key && BUFF_ICON_OF[key]) return BUFF_ICON_OF[key];
  if (name && BUFF_ICON_BY_NAME[name]) return BUFF_ICON_BY_NAME[name];
  return null;
}

/* DOM 通道：拼 <svg>。Canvas 通道请自行缓存 Path2D（见 M11）。 */
function buffIconSvg(key, opts = {}) {
  const d = BUFF_ICON_PATHS[key];
  if (!d) return '';
  const size = opts.size || 16;
  const rule = BUFF_ICON_EVENODD[key] ? 'evenodd' : 'nonzero';
  return '<svg class="m11-ico" viewBox="0 0 32 32" width="' + size + '" height="' + size +
    '" fill="currentColor" fill-rule="' + rule + '" aria-hidden="true"><path d="' + d + '"/></svg>';
}
