/* ============================================================
 * 数据层 · 图标（M11 规范）
 *
 * 硬性规范：
 *   · viewBox="0 0 32 32"，纯 path（不用 circle/rect，Path2D 只吃 d）
 *   · fill="currentColor"，图标本身不含颜色，由外层 CSS / Canvas 上色
 *   · 层次靠负空间镂空：同一 d 里拼多条子路径 + fill-rule="evenodd"
 *   · 命名：rune_<id> / skill_<id> / talent_<tree>_<tier> / mount_<id>
 *
 * S2 只做符文：24 个符文 = 6 种外形 × 4 种内纹，
 * 实际独立绘制 10 条 path（6 + 4），不是 24 张图。
 * ============================================================ */

/* 6 种外形：符石 / 菱形 / 圆 / 三角 / 方 / 碑 */
const RUNE_ICON_SHAPES = [
  'M16 2.5 27.4 8.9 27.4 23.1 16 29.5 4.6 23.1 4.6 8.9Z',
  'M16 2.5 28 10 24.5 24.5 16 30 7.5 24.5 4 10Z',
  'M16 2.5A13.5 13.5 0 1 0 16 29.5A13.5 13.5 0 1 0 16 2.5Z',
  'M16 2.8 29 27.2 3 27.2Z',
  'M5.5 4.5H26.5A2.5 2.5 0 0 1 29 7V25A2.5 2.5 0 0 1 26.5 27.5H5.5A2.5 2.5 0 0 1 3 25V7A2.5 2.5 0 0 1 5.5 4.5Z',
  'M6 3.5H26A2 2 0 0 1 28 5.5V22C28 26.5 22.6 29.5 16 29.5C9.4 29.5 4 26.5 4 22V5.5A2 2 0 0 1 6 3.5Z'
];

/* 4 种内纹（作为负空间挖空） */
const RUNE_ICON_MARKS = [
  'M14.6 9H17.4V15.6L20 13 21.8 14.8 17.4 19.2V23H14.6V19.2L10.2 14.8 12 13 14.6 15.6Z',
  'M14.4 9H17.6V14.4H23V17.6H17.6V23H14.4V17.6H9V14.4H14.4Z',
  'M9 11 16 18 23 11V15L16 22 9 15Z',
  'M10 10H22V13H10Z M10 19H22V22H10Z M14 14.5H18V17.5H14Z'
];

/* 符文 id 顺序必须与 data-items.js 的 RUNES 一致（测试会校验） */
const RUNE_ICON_ORDER = [
  'el', 'eld', 'tir', 'nef', 'eth', 'ith',
  'tal', 'ral', 'ort', 'thul', 'amn', 'sol',
  'shael', 'dol', 'hel', 'io', 'lum', 'ko',
  'fal', 'lem', 'pul', 'um', 'mal', 'ist'
];

const ICON_PATHS = {};
RUNE_ICON_ORDER.forEach((id, i) => {
  ICON_PATHS['rune_' + id] = RUNE_ICON_SHAPES[i % 6] + RUNE_ICON_MARKS[(Math.floor(i / 6)) % 4];
});

/* DOM 通道：拼 <svg>；Canvas 通道请自行缓存 Path2D（见 M11） */
function iconSvg(key, opts = {}) {
  const d = ICON_PATHS[key];
  if (!d) return '';
  const size = opts.size || 30;
  return `<svg class="m11-ico${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" fill-rule="evenodd" aria-hidden="true"${opts.style ? ` style="${opts.style}"` : ''}><path d="${d}"/></svg>`;
}
