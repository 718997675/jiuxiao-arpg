/* ============================================================
 * [U8] 世界 Boss 预警层（独立，不塞进 BOSS_TWIST）
 *
 * 世界 Boss 6 只走 WBFight 另一套调度，不在 BOSS_KIT / BossCast 里，
 * U7 给 45 只守卫加的 BOSS_TWIST 变形层盖不到它们。这一层专门声明它们
 * 18 招的「判定形状 → 预警形状」映射，走 FX.zone({shape}) 画形状匹配的预警。
 *
 * 三条硬规矩（改这个文件前先读）：
 *   1. **只管预警，不管判定**。判定几何、伤害倍率、命中回调全在
 *      worldboss-fight.js 的 cast() 里，一格没动；这里只是「该画成什么形状」。
 *   2. **形状必须匹配判定**：line→rect、circle→circle、fan/cone→fan、
 *      ring→ring、scatter→lock（多个落点）、self→circle。画错的代价是
 *      玩家「以为能躲其实躲不掉」或反过来 —— 和 U7 修的是同一类硬伤。
 *   3. **新预警一律 FX.zone**，别手搓 FX.ring 当预警（test-bosspattern 的 B 线
 *      会判红 ring-fx）。本层只产出 FX.zone 的参数，不自己画。
 *
 * 数据键 = 技能 id；字段对齐 worldboss-fight.js cast() 里各 case 用的 sk 字段
 * （range / width / arc / count），避免两处各写一份尺寸漂移。
 * ============================================================ */
'use strict';

/* 元素色（与 WBFight.ELEM_COLOR 同键，预警染色用；判定不读色） */
const WBZ_COLOR = {
  fire: 0xff7a3c, ice: 0x9ae8ff, lightning: 0xffe066,
  poison: 0x7fbf5a, phys: 0xffb070, blood: 0xd94f6a, wind: 0xa8e0c0,
};

/* 形状映射表：sk.shape → zone 形状 + 参数来源。
 * 这里只声明「怎么画」；数值从 sk 读，不在本层复制第二个尺寸值。 */
const WBZ_SHAPE = {
  line:    { zone: 'rect',   note: '长条穿透 → 矩形带 + 方向箭头' },
  circle:  { zone: 'circle', note: '圆形范围 → 实心圆 + 收缩环' },
  fan:     { zone: 'fan',    note: '扇形横扫 → 真扇形 + 张角两边' },
  cone:    { zone: 'fan',    note: '锥形吸吐 → 真扇形（arc 张角）' },
  scatter: { zone: 'lock',   note: '多点散射 → 每点一个锁定圈' },
  ring:    { zone: 'ring',   note: '环带，内圈安全 → 空心环 + 扩张环' },
  self:    { zone: 'circle', note: '自身战吼 → 脚下圆（不判定玩家）' },
};

/* 每招的预警声明。`warn` 不写死 —— 从 sk.warn 读，和判定同一把尺子。
 * `sweep` 按语义给：砸向中心=in、向外炸开=out、不给=只脉动。 */
const WB_WARN = {
  /* 烛九阴 */
  wb_breath:     { shape: 'rect',   sweep: null, note: '龙息：朝面院长条' },
  wb_darktide:   { shape: 'circle', sweep: 'in', note: '暗潮：以身为心收拢' },
  wb_tailsweep:  { shape: 'fan',    sweep: 'in', note: '尾扫：近身扇形' },
  /* 相柳 */
  wb_poisonspit: { shape: 'fan',    sweep: 'in', note: '毒喷：多头扇形' },
  wb_ninehowl:   { shape: 'circle', sweep: 'out', note: '九吼：大范围外扩' },
  wb_tailwhip:   { shape: 'fan',    sweep: 'in', note: '尾鞭：近身扇形' },
  /* 鲲鹏 */
  wb_watercannon:{ shape: 'rect',   sweep: null, note: '水炮：长条穿透' },
  wb_windblade:  { shape: 'fan',    sweep: 'in', note: '风刃：扇形齐射' },
  wb_dive:       { shape: 'circle', sweep: 'in', note: '俯冲：落点圆' },
  /* 饕餮 */
  wb_swallow:    { shape: 'fan',    sweep: 'in', note: '巨口：锥形吸吐' },
  wb_regurgitate:{ shape: 'lock',   sweep: null, note: '反刍：多点散射落点' },
  wb_stomp:      { shape: 'circle', sweep: 'out', note: '践踏：外扩圆' },
  /* 刑天 */
  wb_axecleave:  { shape: 'fan',    sweep: 'in', note: '斧劈：扇形' },
  wb_shieldbash: { shape: 'rect',   sweep: null, note: '盾击：直线冲撞' },
  wb_warcry:     { shape: 'circle', sweep: null, note: '战吼：自身圆，不判定玩家' },
  /* 九尾狐 */
  wb_foxfire:    { shape: 'circle', sweep: 'in', note: '狐火：落点圆' },
  wb_tailbind:   { shape: 'ring',   sweep: 'out', note: '尾缚：环带，内圈安全' },
  wb_phantomdash:{ shape: 'rect',   sweep: null, note: '幻影突进：直线' },
};

/* 世界 Boss 6 只的 id（与 data-worldboss.js 的 WORLD_BOSS_ORDER 对齐，
 * 这里复制一份是为了让本层可被单独 require、不依赖那个文件的加载顺序） */
const WBZ_ORDER = ['zhulong', 'xiangliu', 'kunpeng', 'taotie', 'xingtian', 'jiuweihu'];

/* 把一招的 sk + 施法者位置/朝向翻译成 FX.zone 的画法参数。
 * 不产生副作用、不调 FX —— 纯函数，离线契约可直接量参数。
 * @param sk   世界 Boss 技能数据（shape/range/width/arc/count/elem/at）
 * @param ctx  { e:{pos}, pp, ang }  e.pos=施法者坐标，pp=玩家坐标，ang=朝向
 */
function wbWarnOf(sk, ctx) {
  if (!sk) return null;
  const decl = WB_WARN[sk.id];
  if (!decl) return null;
  const map = WBZ_SHAPE[sk.shape];
  if (!map) return null;
  const e = ctx && ctx.e, pp = ctx && ctx.pp;
  const ep = e && e.pos ? e.pos : { x: 0, z: 0 };
  const ang = ctx && ctx.ang != null ? ctx.ang : 0;
  const color = WBZ_COLOR[sk.elem] || WBZ_COLOR.phys;
  const warn = Math.max(0.3, sk.warn || 0.8);
  const base = { shape: decl.shape, color, dur: warn, sweep: decl.sweep, cb: null };

  if (decl.shape === 'rect') {
    return Object.assign(base, {
      pos: { x: ep.x, z: ep.z },
      dir: { x: Math.sin(ang), z: Math.cos(ang) },
      len: sk.range || 20,
      halfW: Math.max(1, (sk.width || 3) / 2),
    });
  }
  if (decl.shape === 'fan') {
    return Object.assign(base, {
      pos: { x: ep.x, z: ep.z },
      radius: sk.range || 14,
      ang: ang,
      halfArc: (sk.arc || 120) * Math.PI / 360,
    });
  }
  if (decl.shape === 'ring') {
    return Object.assign(base, {
      pos: { x: ep.x, z: ep.z },
      radius: sk.range || 20,
    });
  }
  if (decl.shape === 'lock') {
    /* 散射：落点中心在玩家脚下，radius 取散布半径；真正的一颗颗落点由
     * cast 里原来的 telegraph 逐个判定，这里只画「这一片会下雨」的范围。 */
    return Object.assign(base, {
      pos: pp ? { x: pp.x, z: pp.z } : { x: ep.x, z: ep.z },
      radius: sk.range || 16,
    });
  }
  /* circle：self 招挂在自己脚下，其它以玩家落点或以身为心由 sk.at 决定 */
  const atSelf = decl.shape === 'circle' && sk.shape === 'circle' ? sk.at !== 'target' : true;
  return Object.assign(base, {
    pos: atSelf ? { x: ep.x, z: ep.z } : (pp ? { x: pp.x, z: pp.z } : { x: ep.x, z: ep.z }),
    radius: sk.range || 16,
  });
}

/* 全局导出（浏览器 script 直挂；node 契约用 vm 读） */
if (typeof window !== 'undefined') {
  window.WBZ_COLOR = WBZ_COLOR;
  window.WBZ_SHAPE = WBZ_SHAPE;
  window.WB_WARN = WB_WARN;
  window.WBZ_ORDER = WBZ_ORDER;
  window.wbWarnOf = wbWarnOf;
}
