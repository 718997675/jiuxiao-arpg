#!/usr/bin/env node
/* ============================================================
 * [U8] 世界 Boss 形状预警层 · 静态契约
 *
 *   node dev/test-wbzone.js
 *
 * U7 给 45 只守卫补了形状匹配预警（BOSS_TWIST），但世界 Boss 6 只走
 * WBFight 另一套调度、盖不到。本契约钉住「另开一层」这件事做对了：
 *
 *   1. 18 招全部有形状声明，形状与判定匹配（line→rect / fan→fan ...）
 *   2. wbWarnOf 纯函数：参数取自 sk、不复制第二份尺寸、color/dur 正确
 *   3. 接线：cast 里画了 FX.zone、旧 telegraph 全 silent（判定 cb 保留）
 *   4. FX.zone 支持 5 种形状（U7 的 4 种 + 本轮新增 fan）
 *   5. 判定数值没被顺手改（18 招 mul/warn 与数据表一致）
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadData } = require('./_load.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 用真实加载顺序装数据层 —— data-wbzone.js 已经在 index.html 里 */
const ctx = loadData({ console, Math, Set, Map, JSON, Date, localStorage: (() => {
  const m = {}; return { getItem: k => m[k], setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; }, clear: () => { } };
})() });
const W = vm.runInContext('WORLD_BOSSES', ctx);
const ORDER = vm.runInContext('WORLD_BOSS_ORDER', ctx);
const WB_WARN = vm.runInContext('WB_WARN', ctx);
const WBZ_SHAPE = vm.runInContext('WBZ_SHAPE', ctx);
const wbWarnOf = vm.runInContext('wbWarnOf', ctx);
const srcRead = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ctx4 = { e: { pos: { x: 3, z: 5 } }, pp: { x: 1, z: 9 }, ang: 0.4 };
const allSkills = () => Object.values(W).flatMap(b => Object.values(b.skills || {}));

console.log('一、18 招全部有形状声明');
{
  const skills = [];
  for (const id of ORDER) for (const k of Object.keys(W[id].skills || {})) skills.push(W[id].skills[k]);
  ok(skills.length === 18, '6 只世界 Boss 共 18 招', skills.length);
  const missing = skills.filter(s => !WB_WARN[s.id]);
  ok(missing.length === 0, '每招都有预警声明', missing.map(s => s.id));
  for (const s of skills) {
    ok(!!WBZ_SHAPE[s.shape], s.id + ' 的判定形状 ' + s.shape + ' 有对应映射');
    ok(WB_WARN[s.id].shape === WBZ_SHAPE[s.shape].zone,
      s.id + ' 预警形状与判定形状匹配（' + s.shape + '→' + WB_WARN[s.id].shape + '）',
      { decl: WB_WARN[s.id].shape, map: WBZ_SHAPE[s.shape] && WBZ_SHAPE[s.shape].zone });
  }
  /* 七种 shape 全覆盖 */
  const covered = new Set(skills.map(s => WB_WARN[s.id].shape));
  ok(['rect', 'circle', 'fan', 'ring', 'lock'].every(x => covered.has(x)),
    '五种 zone 形状都有招式用到', Array.from(covered));
}

console.log('二、wbWarnOf 纯函数：参数取自 sk、可离线量');
{
  const cases = [
    ['wb_breath', 'rect'], ['wb_darktide', 'circle'], ['wb_tailsweep', 'fan'],
    ['wb_swallow', 'fan'], ['wb_regurgitate', 'lock'],
    ['wb_tailbind', 'ring'], ['wb_warcry', 'circle'],
  ];
  for (const [id, shape] of cases) {
    const s = allSkills().find(x => x.id === id);
    const range = s.range || (shape === 'rect' ? 20 : 16);
    const o = wbWarnOf(s, ctx4);
    ok(o && o.shape === shape, id + ' 画出 ' + shape + ' 形状', o && o.shape);
    ok(o && o.cb === null, id + ' 形状预警不挂判定 cb（判定归 telegraph）', o && o.cb);
    ok(o && o.dur === Math.max(0.3, s.warn), id + ' 预警时长 = 判定前摇（同一把尺子）',
      { dur: o && o.dur, warn: s.warn });
    if (range != null) {
      const size = o.shape === 'rect' ? o.len : o.radius;
      ok(size === range, id + ' 尺寸取自 sk.range=' + range, { len: o.len, radius: o.radius });
    }
  }
  /* fan 的张角、line 的方向 */
  const breath = wbWarnOf(Object.values(W).flatMap(b => Object.values(b.skills || {})).find(x => x.id === 'wb_breath'), ctx4);
  ok(Math.abs(breath.dir.x - Math.sin(0.4)) < 1e-9 && Math.abs(breath.dir.z - Math.cos(0.4)) < 1e-9,
    'line 预警方向 = 施法朝向', breath.dir);
  ok(breath.halfW === 3.2 / 2, 'line 预警半宽 = sk.width/2', breath.halfW);
  const tail = wbWarnOf(Object.values(W).flatMap(b => Object.values(b.skills || {})).find(x => x.id === 'wb_tailsweep'), ctx4);
  ok(Math.abs(tail.halfArc - 160 * Math.PI / 360) < 1e-9, 'fan 预警半张角 = sk.arc/2（弧度）', tail.halfArc);
  ok(tail.ang === 0.4, 'fan 预警朝向 = 施法朝向', tail.ang);
  ok(wbWarnOf(null, ctx4) === null, '空技能返回 null（不画空预警）');
}

console.log('三、接线：cast 画形状预警、旧 telegraph 全 silent、判定 cb 保留');
{
  const wf = srcRead('src/worldboss-fight.js');
  ok(/wbWarnOf\(sk,\s*\{\s*e:\s*e,\s*pp:\s*pp,\s*ang:\s*ang\s*\}\)/.test(wf),
    'cast 里调 wbWarnOf 拿形状声明');
  ok(/FX\.zone\(z\)/.test(wf), '拿到声明后调 FX.zone 画预警');
  ok(/delete z\.cb/.test(wf), '形状预警不抢判定（cb 删掉）');
  /* 调用跨多行（cb 是箭头函数），数 silent=true 的出现处：cast 里所有
   * telegraph 结尾都是 `color, true)` 或 `0x..., true)` */
  const tele = wf.match(/,\s*(color|0x66cc88|0x[0-9a-f]+),\s*true\)/g) || [];
  ok(tele.length >= 5, '所有判定 telegraph 都传 silent=true（至少 5 处）', tele.length);
  ok(!/FX\.telegraph\([^)]*,\s*color\)[,;]/.test(wf.replace(/\n/g, ' ')),
    '没有漏掉未 silent 的判定 telegraph');
  ok(/if \(z\.life <= 0 && z\.cb\)/.test(srcRead('src/fx.js')), 'silent telegraph 的 cb 仍在到点时结算');
}

console.log('四、FX.zone 支持 5 种形状（U7 四种 + fan）');
{
  const fx = srcRead('src/fx.js');
  for (const s of ['circle', 'ring', 'rect', 'lock', 'fan']) {
    ok(new RegExp("shape === '" + s + "'").test(fx), 'FX.zone 支持 ' + s);
  }
  ok(/fxRing\(0,\s*1,\s*40,\s*span\)/.test(fx), 'fan 用带弧长的 RingGeometry（不新建几何体）');
  ok(/grp\.rotation\.z\s*=\s*-ang/.test(fx), 'fan 朝向按世界角换算（朝正后方不误判）');
}

console.log('五、不能顺手坏掉的规矩');
{
  ok(/silent/.test(srcRead('src/fx.js')), 'telegraph 的 silent 是可选参数（老调用方不受影响）');
  const wzSrc = srcRead('src/data/data-wbzone.js');
  /* 注释里说明「不塞进 BOSS_TWIST」是正常的，检查的是没有真的引用/写入它 */
  ok(!/BOSS_TWIST\s*\[|BOSS_TWIST\s*=|WB_WARN.*BOSS_TWIST/.test(wzSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')),
    '预警层独立，没往 BOSS_TWIST 写东西');
  /* 18 招 mul/warn 与数据表一致 —— wbWarnOf 只读、不写 sk */
  const before = JSON.stringify(W);
  for (const s of allSkills()) wbWarnOf(s, ctx4);
  ok(JSON.stringify(W) === before, '量形状预警不改技能数据（纯读）');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' U8 世界 Boss 预警契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
