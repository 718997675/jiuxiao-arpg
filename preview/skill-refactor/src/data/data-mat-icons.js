/* ============================================================
 * 数据层 · 材料 / 丹药 / 凭证图标（v1.6.0）
 *
 * 与 items.js 的 ITEM_ICONS、data-relic-icons.js 同一套规范：
 *   · viewBox="0 0 32 32"
 *   · fill="currentColor"，颜色由外层按材料品阶 / 丹药用途给
 *   · 内部结构靠**暗色开凿**（MAT_HOLE）分层，不用低透明度同色 ——
 *     行囊格子只有 30px 左右，同色叠加会糊成一个圆饼
 *
 * 为什么材料也要图标：
 *   四栏（装备 / 材料 / 丹药 / 任务物品）统一成「图标 + 数量角标」之后，
 *   眼睛扫的是形状而不是一行行文字，翻栏的速度会快很多；
 *   文字退到悬停提示里，格子里只留形状和数字。
 *
 * 键名约定：
 *   craft 匠材用 CRAFT_MATS[id].icon（与 id 同名）
 *   crystal1..4 对应 CRYSTAL_TIERS 的四阶
 *   potion_hp / potion_mp / potion_tp 对应丹药栏三件
 *   quest 任务凭证（所有委托共用一枚，靠名字区分）
 * ============================================================ */

const MAT_HOLE = '#0b0d10';

const MAT_ICONS = {
  /* ---------------- 匠材 · 九种 ---------------- */
  /* 玄铁锭：三面体铁锭，顶面高光、前面实、侧面暗 */
  ore: `<path d="M6.8 14.4 20.4 11.2 26.6 15.2 13 18.6Z" opacity=".72"/>
    <path d="M13 18.6 26.6 15.2 26.6 24.2 13 27.6Z" opacity=".96"/>
    <path d="M6.8 14.4 13 18.6 13 27.6 6.8 23.6Z" opacity=".5"/>
    <path d="M15.6 21.6 23.4 20.2 23.4 22.2 15.6 23.6Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M9 17.4 11.6 16.8 11.6 19.2 9 19.8Z" fill="${MAT_HOLE}" opacity=".4"/>`,

  /* 妖兽皮：整张摊开的生皮，四角有腿位，中间两道褶 */
  hide: `<path d="M9.2 4.6C13.4 2.8 18.6 2.8 22.8 4.6 21.6 7.8 22 10.6 23.8 13.2 25.6 15.8 26.4 19.6 25.2 22.8 24.2 25.4 21.8 27.2 18.8 28.2 15 29.4 10.6 28.4 8 25.8 6 23.8 5.2 21 5.8 18.4 6.4 15.4 5.8 10.8 4.6 7.8 5.4 6 6.8 5 9.2 4.6Z" opacity=".95"/>
    <path d="M10.6 9.8C13.8 8.6 18.4 8.6 21.6 9.8" fill="none" stroke="${MAT_HOLE}" stroke-width="1.3" opacity=".5"/>
    <path d="M9.8 17.4C13.2 15.6 18.8 15.6 22.2 17.4" fill="none" stroke="${MAT_HOLE}" stroke-width="1.4" opacity=".45"/>
    <path d="M16 10.6 16 25.4" fill="none" stroke="${MAT_HOLE}" stroke-width="1" opacity=".3"/>`,

  /* 妖骨：一根獠牙，根部粗、尖部弯 */
  bone: `<path d="M20.8 4.2C24.6 8.4 24.8 16.2 20.6 22.4 17.8 26.8 13.6 29.6 10.2 28.6 12.8 24.4 14.2 20.2 13.8 15.4 13.4 11 11.6 7.2 9.4 4.6 12.6 2.8 17.8 2.2 20.8 4.2Z" opacity=".95"/>
    <path d="M16.2 9.2C16.8 14.8 15.4 20.4 13.2 25.2" fill="none" stroke="${MAT_HOLE}" stroke-width="1.5" opacity=".45"/>
    <path d="M19.2 8.6C19.6 13.4 18.6 18.4 16.6 22.6" fill="none" stroke="${MAT_HOLE}" stroke-width="1" opacity=".28"/>`,

  /* 灵蚕丝：一枚线轴，缠三道丝 */
  silk: `<path d="M9.4 5.2H22.6V8.4H9.4Z" opacity=".95"/>
    <path d="M9.4 23.6H22.6V26.8H9.4Z" opacity=".95"/>
    <path d="M12.2 8.4H19.8V23.6H12.2Z" opacity=".62"/>
    <path d="M12.2 11.6C15.6 13.6 17 15.2 17 16.4 17 17.6 15.6 19.2 12.2 21.2" fill="none" stroke="currentColor" stroke-width="1.9" opacity=".95"/>
    <path d="M19.8 11.6C16.4 13.6 15 15.2 15 16.4 15 17.6 16.4 19.2 19.8 21.2" fill="none" stroke="${MAT_HOLE}" stroke-width="1.1" opacity=".45"/>`,

  /* 赤炎砂：一座砂堆，上面浮三簇火 */
  ember: `<path d="M4.4 25.6C7.2 19.6 11 15.4 16 15.4 21 15.4 24.8 19.6 27.6 25.6Z" opacity=".95"/>
    <path d="M16 3.6C18.8 8 19 11.4 16 14.6 13 11.4 13.2 8 16 3.6Z" opacity=".85"/>
    <path d="M9 8.6C10.6 10.8 10.8 12.6 9 14.6 7.2 12.6 7.4 10.8 9 8.6Z" opacity=".55"/>
    <path d="M23 8.6C24.6 10.8 24.8 12.6 23 14.6 21.2 12.6 21.4 10.8 23 8.6Z" opacity=".55"/>
    <path d="M11.4 20.4 14.2 20.4 14.2 22 11.4 22Z" fill="${MAT_HOLE}" opacity=".5"/>
    <path d="M18.2 21.8 20.6 21.8 20.6 23.4 18.2 23.4Z" fill="${MAT_HOLE}" opacity=".4"/>`,

  /* 寒玉髓：一支六棱冰晶，左半暗、棱线开凿 */
  frost: `<path d="M16 3.2 22.6 11.2 22.6 24.4 16 29.2 9.4 24.4 9.4 11.2Z" opacity=".93"/>
    <path d="M16 3.2 16 29.2 9.4 24.4 9.4 11.2Z" opacity=".48"/>
    <path d="M16 7.4 19.8 12.6 19.8 22.8 16 25.6Z" fill="${MAT_HOLE}" opacity=".38"/>
    <path d="M12.2 12.4 12.2 21.6" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/>`,

  /* 玄鳞：一片扇形逆鳞，底缘带齿 */
  scale: `<path d="M16 29.4C7.4 29.4 3 22.4 4 12.8 8.2 15.2 13 15.8 16 12.8 19 15.8 23.8 15.2 28 12.8 29 22.4 24.6 29.4 16 29.4Z" opacity=".95"/>
    <path d="M16 25.2C10.8 25.2 7.4 20.8 7.2 16.2" fill="none" stroke="${MAT_HOLE}" stroke-width="1.5" opacity=".45"/>
    <path d="M16 25.2C21.2 25.2 24.6 20.8 24.8 16.2" fill="none" stroke="${MAT_HOLE}" stroke-width="1.5" opacity=".45"/>
    <path d="M16 13.4 16 23.4" fill="none" stroke="${MAT_HOLE}" stroke-width="1.2" opacity=".3"/>`,

  /* 陨星铁：一块带尾焰的陨石，砸出两处凹坑 */
  meteor: `<path d="M6.2 12.4 15.6 5.6 21.4 13 17 20.6 8 18.8Z" opacity=".95"/>
    <path d="M21.4 13C25 9.8 27.4 11.2 29.6 15 26.4 14.6 24.2 15.6 22.8 17.8Z" opacity=".6"/>
    <path d="M23.2 22.2C25.6 20.6 27.4 21.4 28.8 23.8 26.6 23.8 25.2 24.6 24.2 26.2Z" opacity=".42"/>
    <path d="M10.6 11.4 14.2 10.4 14.8 13 11.2 14Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M13.4 16.6 16.4 16 16.8 18 13.8 18.6Z" fill="${MAT_HOLE}" opacity=".45"/>`,

  /* 妖丹：一枚内丹，外环、内圈、丹心三层 */
  soul: `<path d="M16 4.2A11.6 11.6 0 1 0 16 27.4A11.6 11.6 0 1 0 16 4.2Z" opacity=".9"/>
    <path d="M16 8.6A7.2 7.2 0 1 0 16 23A7.2 7.2 0 1 0 16 8.6Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M16 12.2A3.6 3.6 0 1 0 16 19.4A3.6 3.6 0 1 0 16 12.2Z" opacity=".98"/>
    <path d="M16 1.8 17.4 5.2 14.6 5.2Z" opacity=".7"/>
    <path d="M16 30.2 14.6 26.8 17.4 26.8Z" opacity=".7"/>`,

  /* ---------------- 玄晶 · 四阶 ---------------- */
  /* 一阶：孤晶 */
  crystal1: `<path d="M16 6 22.2 13 22.2 24 16 28.8 9.8 24 9.8 13Z" opacity=".92"/>
    <path d="M16 6 16 28.8 9.8 24 9.8 13Z" opacity=".5"/>
    <path d="M16 11.4 19 15.4 19 22.4 16 24.6Z" fill="${MAT_HOLE}" opacity=".32"/>`,
  /* 二阶：主晶 + 侧晶 */
  crystal2: `<path d="M15.6 5.4 21 11.4 21 22.6 15.6 27 10.2 22.6 10.2 11.4Z" opacity=".95"/>
    <path d="M15.6 5.4 15.6 27 10.2 22.6 10.2 11.4Z" opacity=".5"/>
    <path d="M23.8 14.4 28.2 19.4 28.2 25.4 23.8 28.2 21.4 24.4 21.4 18.4Z" opacity=".72"/>
    <path d="M8 15.6 4.4 19.6 4.4 25 8 27.4 10.2 24 10.2 19Z" opacity=".62"/>`,
  /* 三阶：三晶 + 灵环 */
  crystal3: `<path d="M16 3.4 22.4 10.6 22.4 22.8 16 27.8 9.6 22.8 9.6 10.6Z" opacity=".96"/>
    <path d="M16 3.4 16 27.8 9.6 22.8 9.6 10.6Z" opacity=".5"/>
    <path d="M25 12.2 29.4 17.4 29.4 24 25 26.8 22.4 23.2 22.4 16.4Z" opacity=".74"/>
    <path d="M7 12.2 2.6 17.4 2.6 24 7 26.8 9.6 23.2 9.6 16.4Z" opacity=".66"/>
    <path d="M16 10.2 19.4 14.6 19.4 21.8 16 24.4Z" fill="${MAT_HOLE}" opacity=".34"/>`,
  /* 四阶：晶簇 + 四芒 */
  crystal4: `<path d="M16 2.6 23.2 10.4 23.2 23.2 16 28.6 8.8 23.2 8.8 10.4Z" opacity=".97"/>
    <path d="M16 2.6 16 28.6 8.8 23.2 8.8 10.4Z" opacity=".5"/>
    <path d="M26.2 10.4 30.6 15.6 30.6 22.4 26.2 25.4 23.2 21.6 23.2 14.6Z" opacity=".78"/>
    <path d="M5.8 10.4 1.4 15.6 1.4 22.4 5.8 25.4 8.8 21.6 8.8 14.6Z" opacity=".7"/>
    <path d="M16 9.6 20 14.4 20 22.2 16 25.2Z" fill="${MAT_HOLE}" opacity=".36"/>
    <path d="M16 0.6 17.2 3.6 14.8 3.6Z" opacity=".8"/>
    <path d="M16 31.4 14.8 28.4 17.2 28.4Z" opacity=".8"/>`,

  /* ---------------- 丹药 · 三件 ---------------- */
  /* 回春丹：一枚朱红丹丸，云纹开凿 + 一点高光 */
  potion_hp: `<path d="M16 5.2A10.8 10.8 0 1 0 16 26.8A10.8 10.8 0 1 0 16 5.2Z" opacity=".95"/>
    <path d="M10.6 16.8C12.6 13.8 15.4 12.6 16.8 14.4 13.8 15.4 12.6 17.4 11.6 19.8Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M21.4 16.8C19.4 13.8 16.6 12.6 15.2 14.4 18.2 15.4 19.4 17.4 20.4 19.8Z" fill="${MAT_HOLE}" opacity=".4"/>
    <path d="M11.8 9.6A5 5 0 0 1 15.8 7.4 5.6 5.6 0 0 0 10.4 11Z" fill="#fff" opacity=".32"/>`,
  /* 凝露：细颈玉瓶，液面一线 */
  potion_mp: `<path d="M13.2 4.2H18.8V9.4L22.6 16.4C24.8 20.4 24 24.8 20.6 26.8 16.8 29 12.6 27.4 10.6 23.8 8.8 20.6 9.4 17 11.6 14.4L13.2 10.6Z" opacity=".95"/>
    <path d="M11.4 20.4C14.6 18.8 20 18.8 23.2 20.6 23 24.6 20.4 27 16 27 11.8 27 11.4 24 11.4 20.4Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M12.6 3.2H19.4V5.2H12.6Z" opacity=".8"/>
    <path d="M13.4 7.6H18.6V9.2H13.4Z" fill="${MAT_HOLE}" opacity=".4"/>
    <path d="M12.8 12.6C12 15.4 11.6 17.6 11.6 19.4" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".65"/>`,
  /* 传送阵石：一枚阵盘，正反三角交叠 */
  potion_tp: `<path d="M16 2.8A13.2 13.2 0 1 0 16 29.2A13.2 13.2 0 1 0 16 2.8Z" opacity=".34"/>
    <path d="M16 6.6 25.4 23 6.6 23Z" opacity=".86"/>
    <path d="M16 25.4 6.6 9 25.4 9Z" fill="${MAT_HOLE}" opacity=".5"/>
    <path d="M16 12.6A3.4 3.4 0 1 0 16 19.4A3.4 3.4 0 1 0 16 12.6Z" opacity=".95"/>
    <path d="M16 0.8 17.2 3.6 14.8 3.6Z" opacity=".7"/>
    <path d="M16 31.2 14.8 28.4 17.2 28.4Z" opacity=".7"/>`,

  /* ---------------- 任务凭证 ---------------- */
  /* 一轴卷起的委托文书，末尾压一枚封蜡 */
  quest: `<path d="M8.6 4.2H23.4V25.8H8.6Z" opacity=".95"/>
    <path d="M6.4 3.2C6.4 2.2 7.2 1.6 8.6 1.6V4.2Z" opacity=".7"/>
    <path d="M6.4 26.8C6.4 27.8 7.2 28.4 8.6 28.4V25.8Z" opacity=".7"/>
    <path d="M11.4 8.2H20.6V9.8H11.4Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M11.4 12.2H20.6V13.8H11.4Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M11.4 16.2H17.4V17.8H11.4Z" fill="${MAT_HOLE}" opacity=".55"/>
    <path d="M19.4 20.6A3.4 3.4 0 1 0 19.4 27.4A3.4 3.4 0 1 0 19.4 20.6Z" opacity=".98"/>
    <path d="M19.4 23.2 20.2 24.6 18.6 24.6Z" fill="${MAT_HOLE}" opacity=".6"/>`
};

/* 材料格里的图标统一从这里取；key 不存在时回落成「玄铁锭」，
 * 免得新增材料忘了画图就整格空白。 */
function matIcon(key, opts) {
  opts = opts || {};
  const d = MAT_ICONS[key] || MAT_ICONS.ore;
  const size = opts.size || 28;
  const cls = opts.cls ? ' ' + opts.cls : '';
  const color = opts.color || 'currentColor';
  const glow = opts.glow ? `;filter:drop-shadow(0 0 3px ${color}bb)` : '';
  return `<svg class="mat-ico${cls}" viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor"
    style="color:${color}${glow}" aria-hidden="true">${d}</svg>`;
}
