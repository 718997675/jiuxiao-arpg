/* ============================================================
 * S4 术法图标（v1.2.0）
 *
 * 每个技能一枚 24×24 的线性 SVG 图标（stroke=currentColor，
 * 颜色继承容器，金色/亮色由 CSS 决定），替代原来的单字 glyph。
 * 用法：skillIconSvg('fireball', 26) → <svg …>…</svg>
 *
 * 新增技能时往 SKILL_ICONS 里加一枚即可；漏掉的技能按 type
 * 走 SKILL_ICONS['_'+type] 兜底，再不行用 _default。
 * ============================================================ */
const SKILL_ICONS = {
  /* ---------------- 战士 ---------------- */
  /* 旋风斩：回旋气刃 */
  whirl: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3v5h-5"/><path d="M12 9.5a2.5 2.5 0 1 0 2.5 2.5"/>',
  /* 烈焰突刺：冲锋长枪 + 速度线 */
  thrust: '<path d="M3.5 20.5L13 11"/><path d="M13 3.5l7.5 7.5-7 .8z" fill="currentColor" stroke="none"/><path d="M6 17l-2.5 2.5"/><path d="M9 14l-2.5 2.5"/>',
  /* 战吼咆哮：号角 + 音波 */
  warcry: '<path d="M3 10c5-5 11-4 15 2"/><path d="M18 12c2.5 1.5 3.5 4.5 2 7-2 3.5-7.5 4-11 1.5"/><path d="M3 10v4"/><path d="M20 5.5l1.5-1.5"/><path d="M16.5 7.5L18 6"/>',
  /* 裂地：地面裂纹 */
  quake: '<path d="M3 21.5h18"/><path d="M12 2.5v6"/><path d="M12 9.5l-5.5 4.5 3 1.5-2 6"/><path d="M12 9.5l5.5 4.5-3 1.5 2 6"/>',
  /* 跃击：起跳箭头 + 落脚烟尘 */
  leap: '<path d="M12 21V7"/><path d="M7.5 11.5L12 7l4.5 4.5"/><path d="M5 21l2.5-2.5"/><path d="M19 21l-2.5-2.5"/><path d="M4 14.5l1.5 1.5"/><path d="M20 14.5l-1.5 1.5"/>',
  /* 盾墙：塔盾 */
  shieldwall: '<path d="M12 3l7 2.5v6c0 4.6-3 7.6-7 9.6-4-2-7-5-7-9.6v-6z"/><path d="M9 11.5l2.2 2.2L15.5 9.5"/>',
  /* 嗜血：血滴 + 牙痕 */
  bloodrage: '<path d="M12 3s6 6.6 6 10.6a6 6 0 1 1-12 0C6 9.6 12 3 12 3z"/><path d="M9.5 13.5L12 19l2.5-5.5"/>',
  /* 斩杀：十字斩击 */
  execute: '<path d="M4 4l8 8"/><path d="M20 4l-8 8"/><path d="M12 12l-3 8.5"/><path d="M12 12l3 8.5"/>',
  /* 剑神：星辰圣剑 */
  avatar: '<path d="M12 2.5l1.9 4.4 4.6.4-3.5 3 1.1 4.5-4.1-2.4-4.1 2.4 1.1-4.5-3.5-3 4.6-.4z"/><path d="M12 13.5V19"/><path d="M9 21h6"/>',
  /* 反击：双短刃交错 */
  riposte: '<path d="M5 3.5l9 9"/><path d="M19 3.5l-9 9"/><path d="M5 3.5L3.5 2"/><path d="M19 3.5L20.5 2"/><path d="M3 18.5l2 2"/><path d="M21 18.5l-2 2"/>',
  /* 万剑阵：环剑围心 */
  swordarray: '<circle cx="12" cy="12" r="2.6"/><path d="M12 2.5v3.5"/><path d="M12 18v3.5"/><path d="M2.5 12h3.5"/><path d="M18 12h3.5"/><path d="M5 5l2.5 2.5"/><path d="M16.5 16.5L19 19"/><path d="M19 5l-2.5 2.5"/><path d="M7.5 16.5L5 19"/>',
  /* 天崩：坠星 */
  skysfall: '<circle cx="14.5" cy="9" r="3.5"/><path d="M3.5 20.5l5.5-5.5"/><path d="M7 16.5l-3 3"/><path d="M9.5 19l-2.5 2.5"/>',

  /* ---------------- 法师 ---------------- */
  /* 火球术：火苗 */
  fireball: '<path d="M12 2c1.5 3.2 4.5 4.8 4.5 8.4a4.5 4.5 0 1 1-9 0C7.5 6.8 10.5 5.2 12 2z"/><path d="M12 9c.8 1.6 1.8 2.3 1.8 3.4a1.8 1.8 0 1 1-3.6 0c0-1.1 1-1.8 1.8-3.4z" fill="currentColor" stroke="none"/>',
  /* 冰霜新星：雪花 */
  frostnova: '<path d="M12 2.5v19"/><path d="M2.5 12h19"/><path d="M5 5l14 14"/><path d="M19 5L5 19"/><path d="M9.5 4.5L12 7l2.5-2.5"/><path d="M9.5 19.5L12 17l2.5 2.5"/><path d="M4.5 9.5L7 12 4.5 14.5"/><path d="M19.5 9.5L17 12l2.5 2.5"/>',
  /* 雷电链：主闪 + 分叉 */
  chain: '<path d="M13.5 2.5L5.5 13.5h4.7l-2.2 8 9-11.5h-4.6z"/><path d="M19.5 5.5l-1.5 3.5h2.8l-1.8 3.8"/>',
  /* 炎爆术：陨石拖尾 */
  meteor: '<circle cx="14.5" cy="9.5" r="4"/><path d="M3.5 20.5l5-5"/><path d="M6.5 17.5l-2.5 2.5"/><path d="M9.5 20.5L7 23"/>',
  /* 冰锥：三枚冰晶 */
  iceshard: '<path d="M12 2.5L9.5 9h5z"/><path d="M5 11L2.8 19h5.4z"/><path d="M19 11l2.2 8h-5.4z"/>',
  /* 火墙：三簇火舌 */
  firewall: '<path d="M2.5 21h19"/><path d="M12 4.5c1.2 2.6 3.5 3.6 3.5 6.2a3.5 3.5 0 1 1-7 0c0-2.6 2.3-3.6 3.5-6.2z"/><path d="M6.5 8.5c.9 2 2.6 2.7 2.6 4.6a2.6 2.6 0 1 1-5.2 0c0-1.9 1.7-2.6 2.6-4.6z"/><path d="M17.5 8.5c.9 2 2.6 2.7 2.6 4.6a2.6 2.6 0 1 1-5.2 0c0-1.9 1.7-2.6 2.6-4.6z"/>',
  /* 寒冰护盾：冰盾 */
  iceshield: '<path d="M12 3l7 2.5v6c0 4.6-3 7.6-7 9.6-4-2-7-5-7-9.6v-6z"/><path d="M12 7.5v9"/><path d="M7.5 12h9"/>',
  /* 暴雪：雪云飘雪 */
  blizzard: '<path d="M7.5 14a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 7a3.6 3.6 0 0 1 .1 7z"/><path d="M9 17v3.5"/><path d="M7.5 18.7h3"/><path d="M15 17v3.5"/><path d="M13.5 18.7h3"/>',
  /* 星雨：三星齐落 */
  starfall: '<path d="M12 2.5l1.6 4.4L18 8.5l-4.4 1.6L12 14.5l-1.6-4.4L6 8.5l4.4-1.6z"/><path d="M4.5 13.5l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z"/><path d="M19.5 12.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/>',
  /* 雷云：乌云落雷 */
  thundercloud: '<path d="M7.5 13.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 6.5a3.6 3.6 0 0 1 .1 7z"/><path d="M12.5 15.5L10 20h2.8l-1.8 3.5"/>',
  /* 焚天：烈焰喷发 */
  pyroclasm: '<path d="M12 2.5c1.3 2.8 4 4.2 4 7.2a4 4 0 1 1-8 0c0-3 2.7-4.4 4-7.2z"/><path d="M4.5 8L3 6.5"/><path d="M19.5 8L21 6.5"/><path d="M6 16l-2.5.5"/><path d="M18 16l2.5.5"/>',
  /* 天雷裁决：神剑贯地 */
  judgement: '<path d="M12 2v13"/><path d="M9 5.5h6"/><path d="M12 15v3.5"/><path d="M6.5 21.5L12 18.5l5.5 3"/>',

  /* ---------------- 道士 ---------------- */
  /* 五雷符：黄纸符 + 落雷 */
  talisman: '<rect x="5.5" y="2.5" width="13" height="13" rx="1.5"/><path d="M8 6.5l4 2.5 4-2.5"/><path d="M8 10.5l4 2.5 4-2.5"/><path d="M18.5 16l-2 4h2.2l-1.2 3.5"/>',
  /* 灵狼：狼首 */
  summon: '<path d="M8.5 6L4.5 3l3.5 3.5z" fill="currentColor" stroke="none"/><path d="M15.5 6L19.5 3 16 6.5z" fill="currentColor" stroke="none"/><path d="M8.5 6c-2 0-3.5 1.5-3.5 3.5 0 4 3 8 7 8s7-4 7-8c0-2-1.5-3.5-3.5-3.5"/><path d="M8.5 6h7"/><path d="M9.5 12h.01"/><path d="M14.5 12h.01"/><path d="M10.5 15.5h3"/>',
  /* 回春咒：新芽 */
  heal: '<path d="M12 21v-8"/><path d="M12 13C12 9 9 6 5 6c0 4 3 7 7 7z"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
  /* 毒雾：瘴气泡泡 */
  poison: '<path d="M7.5 14a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 7a3.6 3.6 0 0 1 .1 7z"/><circle cx="9" cy="18.5" r="1.7"/><circle cx="13.5" cy="20.3" r="1.2"/><circle cx="16.8" cy="18" r="1"/>',
  /* 符箭：符纸镖 */
  talismanarrow: '<path d="M3.5 20.5L20.5 3.5"/><path d="M14 3.5h6.5V10"/><path d="M7 12.5l3 3-3 3-3-3z"/>',
  /* 清心咒：草叶 */
  antidote: '<path d="M5 19.5C5 10 11.5 4.5 20 4.5c0 8.5-6 15-15 15z"/><path d="M5 19.5c4-4.5 8-8 12-10"/>',
  /* 太极势：阴阳鱼 */
  taiji: '<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="16.5" r="1.3" fill="currentColor" stroke="none"/>',
  /* 白虎：虎首 */
  whitetiger: '<circle cx="12" cy="12.5" r="6.5"/><path d="M7.5 7L5.5 3.5 9.5 5.5"/><path d="M16.5 7l2-3.5L14.5 5.5"/><path d="M9.5 8.5l1 1.8"/><path d="M14.5 8.5l-1 1.8"/><path d="M9.5 11h.01"/><path d="M14.5 11h.01"/><path d="M12 13v1.8"/><path d="M10 15h4"/>',
  /* 万剑归宗：剑雨 */
  swordrain: '<path d="M6.5 2.5L5 12"/><path d="M3 9.5h5.5"/><path d="M12 2.5V12"/><path d="M9 9.5h6"/><path d="M17.5 2.5L19 12"/><path d="M15.5 9.5H21"/>',
  /* 天师印：法印 */
  mastersigil: '<rect x="5" y="4.5" width="14" height="15" rx="2"/><path d="M12 8l-2.2 4.5H12l-1.5 4.5"/>',
  /* 青龙：龙首 + 犄角 + 龙须 */
  azuredragon: '<path d="M8 7L6 3"/><path d="M16 7l2-4"/><path d="M8 7c-2.5 0-4 2-4 4.5 0 4 3.5 7.5 8 7.5s8-3.5 8-7.5c0-2.5-1.5-4.5-4-4.5"/><path d="M4.5 13c-2 .5-3 1.5-3.5 3.5"/><path d="M19.5 13c2 .5 3 1.5 3.5 3.5"/><path d="M9.5 11h.01"/><path d="M14.5 11h.01"/><path d="M10 15.5h4"/>',
  /* 还魂：魂归 */
  revive: '<path d="M12 21c-4.4 0-8-3.1-8-7s3.6-7 8-7 8 3.1 8 7-3.6 7-8 7z"/><path d="M12 16V8.5"/><path d="M9.5 11L12 8.5 14.5 11"/>',

  /* ---------------- 按 type 兜底 ---------------- */
  _melee: '<path d="M4 4l8 8"/><path d="M20 4l-8 8"/><path d="M12 12l-3 8.5"/><path d="M12 12l3 8.5"/>',
  _dash: '<path d="M3.5 20.5L14 10"/><path d="M14 3.5l6.5 6.5-6 .8z" fill="currentColor" stroke="none"/>',
  _aoe: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2 2"/><path d="M16.4 16.4l2 2"/><path d="M18.4 5.6l-2 2"/><path d="M7.6 16.4l-2 2"/>',
  _buff: '<path d="M12 21V7"/><path d="M6.5 12.5L12 7l5.5 5.5"/>',
  _nova: '<circle cx="12" cy="12" r="2.5"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M5 5l3 3"/><path d="M16 16l3 3"/><path d="M19 5l-3 3"/><path d="M8 16l-3 3"/>',
  _chain: '<path d="M13.5 2.5L5.5 13.5h4.7l-2.2 8 9-11.5h-4.6z"/>',
  _bolt: '<path d="M13.5 2.5L5.5 13.5h4.7l-2.2 8 9-11.5h-4.6z"/>',
  _meteor: '<circle cx="14.5" cy="9.5" r="4"/><path d="M3.5 20.5l5-5"/><path d="M6.5 17.5l-2.5 2.5"/>',
  _zone: '<ellipse cx="12" cy="14" rx="8" ry="4.5"/><ellipse cx="12" cy="14" rx="3.5" ry="1.8"/>',
  _shield: '<path d="M12 3l7 2.5v6c0 4.6-3 7.6-7 9.6-4-2-7-5-7-9.6v-6z"/>',
  _rain: '<path d="M7 4v4"/><path d="M12 2.5V8"/><path d="M17 4v4"/><path d="M7 13v4"/><path d="M12 12v4"/><path d="M17 13v4"/>',
  _proj: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  _summon: '<ellipse cx="12" cy="16.5" rx="4" ry="3.2"/><circle cx="6.5" cy="10.5" r="2"/><circle cx="17.5" cy="10.5" r="2"/><circle cx="9.5" cy="6.5" r="2"/><circle cx="14.5" cy="6.5" r="2"/>',
  _heal: '<path d="M12 21v-8"/><path d="M12 13C12 9 9 6 5 6c0 4 3 7 7 7z"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
  _swordrain: '<path d="M6.5 2.5L5 12"/><path d="M3 9.5h5.5"/><path d="M12 2.5V12"/><path d="M9 9.5h6"/><path d="M17.5 2.5L19 12"/><path d="M15.5 9.5H21"/>',
  _ultimate: '<path d="M12 2.5l2 5.2 5.5.5-4.2 3.6 1.2 5.4-4.5-2.8-4.5 2.8 1.2-5.4L4.5 8.2l5.5-.5z"/>',
  _default: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>'
};

/* 生成技能图标的 SVG 字符串；size 为像素边长 */
function skillIconSvg(id, size) {
  let body = SKILL_ICONS[id];
  if (!body) {
    let type = 'melee';
    try { if (typeof SKILLS !== 'undefined' && SKILLS[id]) type = SKILLS[id].type; } catch (e) { /* 数据未就绪 */ }
    body = SKILL_ICONS['_' + type] || SKILL_ICONS._default;
  }
  return '<svg class="skicon" viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
    '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body + '</svg>';
}
