/* ============================================================
 * 技能 P5 契约：45 套形态进化表现（node 直跑，不开浏览器）
 *
 *   node dev/test-skill-p5.js
 *
 * 台账那一行写的是「5 槽 × 3 职业 × 3 段 = 45 套」。这一份钉的就是那个 45：
 *
 *   1. **45 套齐全**：15 个功能位 × 3 段（Lv5 进化 Ⅰ / Lv9 进化 Ⅱ / Lv10 终极），
 *      每段都是一个**非空**的 patch，且等级与 `SKILL_TIER_EVO` 的形态台阶逐档对齐
 *   2. **每段都「可指认」**：段与段之间的差异必须是**结构**（指令类型 / 贴图 /
 *      刀数 / 圈数 / 排数 / `at` 延迟），不能只是把半径和时长改大一点 ——
 *      纯数值的「进化」玩家看不出来，等于没做
 *   3. **全等级 ≤ 6 draw call**（方案 §2 硬指标），用 `vfxCost` 那把唯一的尺子
 *   4. **按功能位解析**：37 只技能全部能取到剪影（否则「放出去什么都不播」）
 *   5. **`at` 真的会延迟**：拿桩跑一遍 `VFX.play`，数「立刻发的」与「延迟发的」
 *   6. **源码接线**：`playSkillVfx` → `VFX.playFor` → `vfxRecipe` → `vfxSlotKey`
 *
 * 第 2 节的判据是这一份里最容易被写歪的地方，所以先说清「什么不算结构」：
 * `r` / `dur` / `spr.n`（粒子颗数）改大**不算** —— 它们不改剪影，
 * 只让同一块形状更亮更久。真机截图上看，那就是同一个技能。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* ---------------- 装载 ----------------
 * `data-vfx.js` 是纯数据 + 纯函数，但它会 `typeof SKILLS` 去查功能位 ——
 * 所以 data-skills.js 必须先装载（浏览器里也是这个顺序，见 index.html 3086 → 3091）。 */
const ctx = { console, setTimeout, clearTimeout };
vm.createContext(ctx);
const load = (f, tail) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;' + tail, ctx);

load('src/data/data-skills.js',
  'globalThis.__sk = { SKILLS, SKILL_ARCHETYPE, SKILL_TIER_EVO, skillArchSlotOf, skillArchList };');
load('src/data/data-vfx.js',
  'globalThis.__vfx = { SKILL_VFX, VFX_SLOT_KEY, VFX_KEYS, VFX_OPS, ELEM_PROFILE,'
  + ' vfxRecipe, vfxSlotKey, vfxBudget, vfxCost, vfxOpCost, vfxMissing };');

const { SKILLS, SKILL_ARCHETYPE, SKILL_TIER_EVO, skillArchSlotOf, skillArchList } = ctx.__sk;
const V = ctx.__vfx;
const { SKILL_VFX, VFX_SLOT_KEY, vfxRecipe, vfxSlotKey, vfxCost, vfxOpCost } = V;

const KEYS = Object.keys(SKILL_VFX);           // 15 条剪影的键
const TIER_LV = [5, 9, 10];                    // 三段：进化 Ⅰ / 进化 Ⅱ / 终极
const CLS = ['warrior', 'mage', 'taoist'];
const SLOT_NAME = ['①', '②', '③', '④', '⑤'];

/* ============================================================
 * 结构签名：只认「改剪影」的那几个参数
 *
 * 为什么不是 JSON.stringify 整条：那样 `r: 0.55 → 0.6` 也算「进化」，
 * 而实测在 51° 俯角的截图里，0.55 米和 0.6 米的环一模一样。
 * 为什么不是只比 `t`：`arc n:2 → n:3`（三道刀气）是真的多画一次、多一道弧，
 * 那必须算；同理 `vortex helix` 与 `cone/decal line`。
 * ============================================================ */
function opSig(op) {
  if (!op || !op.t) return '?';
  let s = op.t;
  if (op.tex) s += '/' + op.tex;
  if (op.t === 'arc') s += 'x' + (op.n || 1);
  if (op.t === 'vortex') s += 'h' + (op.helix || 1);
  if (op.t === 'cone' || op.t === 'decal') s += 'l' + (op.line || 1);
  if (op.at) s += '@';
  return s;
}
function sigOf(rec) {
  if (!rec) return 'null';
  const seg = k => (rec[k] || []).map(opSig).join(',');
  return [rec.decal || '-', seg('cast'), seg('loop'), seg('impact')].join('|');
}

/* ============================================================
 * 一、45 套齐全，等级与机制表对齐
 * ============================================================ */
console.log('一、45 套：15 位 × 3 段，一个都不少');
{
  let total = 0;
  for (const cls of CLS) {
    for (let no = 1; no <= 5; no++) {
      const key = VFX_SLOT_KEY[cls][no - 1];
      const rec = SKILL_VFX[key];
      ok(!!rec, cls + ' ' + SLOT_NAME[no - 1] + ' 号位有剪影（' + key + '）');
      if (!rec) continue;
      const tiers = rec.tiers || {};
      const got = Object.keys(tiers).map(Number).sort((a, b) => a - b);
      ok(JSON.stringify(got) === JSON.stringify(TIER_LV),
        cls + ' ' + SLOT_NAME[no - 1] + ' 的台阶正好是 5 / 9 / 10（三段，不多不少）', got);
      for (const lv of TIER_LV) {
        const p = tiers[lv];
        ok(!!p && typeof p === 'object', key + ' Lv' + lv + ' 有 patch');
        ok(!!p && Object.keys(p).length > 0, key + ' Lv' + lv + ' 的 patch 不是空的（空 patch = 白写一档）');
        if (p) for (const k of Object.keys(p)) ok(V.VFX_KEYS.indexOf(k) >= 0 && k !== 'tiers',
          key + ' Lv' + lv + ' patch 只写允许的键（' + k + '）');
        total++;
      }
    }
  }
  ok(total === 45, '一共 45 套台阶 patch', total);

  /* 与机制表对齐：`SKILL_TIER_EVO` 在 5 / 9 / 10 登记了形态台阶的位，
   * 特效也必须在这三级有变化 —— 「机制解锁了但画面没变」等于没做。
   *
   * 期望值**现算**，不写死 45：法师 ② 的 Lv5 是「双陨」（数量台阶，见
   * `SKILL_COUNT_TIER`），机制表里本来就没有形态台阶 —— 它的 5 级特效
   * 照样有（补倒挂尘柱），只是不该被算进「机制 → 特效」的对账里。 */
  let aligned = 0, expect = 0;
  for (const cls of CLS) {
    for (let no = 1; no <= 5; no++) {
      const key = VFX_SLOT_KEY[cls][no - 1];
      const slot = skillArchList(cls).find(s => s.no === no);
      let evo = null, hit = null;
      for (const id of (slot.inherit || [])) {
        if (SKILL_TIER_EVO[id]) { evo = SKILL_TIER_EVO[id]; hit = id; break; }
      }
      if (!evo) continue;
      for (const lv of TIER_LV) {
        if (!evo[lv]) continue;
        expect++;
        const has = !!(SKILL_VFX[key].tiers || {})[lv];
        if (has) aligned++;
        ok(has, '机制有 Lv' + lv + '（' + hit + '「' + (evo[lv].label || '') + '」），特效也有 Lv' + lv);
      }
    }
  }
  ok(aligned === expect, '机制表里登记的 ' + expect + ' 条形态台阶，特效一条不漏', [aligned, expect]);
  ok(expect >= 44, '至少 44 条（法师 ② 的 5 级是数量台阶，不在形态表里）', expect);
}

/* ============================================================
 * 二、每段都是「可指认的差异」
 * ============================================================ */
console.log('二、每段进化都改得出来（不是只把半径调大）');
{
  for (const key of KEYS) {
    const s1 = sigOf(vfxRecipe(key, 1));
    const s5 = sigOf(vfxRecipe(key, 5));
    const s9 = sigOf(vfxRecipe(key, 9));
    const s10 = sigOf(vfxRecipe(key, 10));
    ok(s5 !== s1, key + '：Lv5 与基础段的剪影不同', [s1, s5]);
    ok(s9 !== s5, key + '：Lv9 与 Lv5 的剪影不同', [s5, s9]);
    ok(s10 !== s9, key + '：Lv10 与 Lv9 的剪影不同', [s9, s10]);
    ok(s10 !== s1 && s9 !== s1, key + '：三段都与基础段不同');
  }
  /* 反面样本：把 `r` 改大**不该**算进化 —— 钉住判据本身，防止以后有人
   * 把 sigOf 改成 JSON.stringify 让这条测试变得毫无意义。 */
  const bump = { decal: null, cast: [], loop: [], impact: [{ t: 'ring', r: 0.3 }] };
  const bump2 = { decal: null, cast: [], loop: [], impact: [{ t: 'ring', r: 0.9, dur: 9 }] };
  ok(sigOf(bump) === sigOf(bump2), '判据自检：只把 r / dur 改大不算进化', [sigOf(bump), sigOf(bump2)]);
  const more = { decal: null, cast: [], loop: [], impact: [{ t: 'arc', n: 3 }] };
  const less = { decal: null, cast: [], loop: [], impact: [{ t: 'arc', n: 2 }] };
  ok(sigOf(more) !== sigOf(less), '判据自检：刀数 2 → 3 算进化（多画一道弧）');
}

/* ============================================================
 * 三、全等级 ≤ 6 draw call
 * ============================================================ */
console.log('三、预算：Lv1~20 每一级都 ≤ 6 draw call（§2 硬指标）');
{
  let worst = { key: '', lv: 0, n: 0 };
  for (const key of KEYS) {
    for (let lv = 1; lv <= 20; lv++) {
      const n = vfxCost(vfxRecipe(key, lv));
      if (n > worst.n) worst = { key, lv, n };
      ok(n <= 6, key + ' Lv' + lv + ' 绘制 ≤ 6', n);
      ok(n >= 2, key + ' Lv' + lv + ' 绘制 ≥ 2（低于 2 读不出剪影）', n);
    }
  }
  console.log('   最重的一发：', worst.key, 'Lv' + worst.lv, worst.n, '次绘制');
  /* 台阶是**累加**的：Lv10 一定 ≥ Lv1。这条能抓住「10 级 patch 把 5 级的东西吃掉」
   * 那种隐性退化 —— 数值上合法，玩起来是「升到 10 级反而变素了」。 */
  for (const key of KEYS) {
    const c = lv => vfxCost(vfxRecipe(key, lv));
    ok(c(5) >= c(1) && c(9) >= c(5) && c(10) >= c(9),
      key + '：绘制随等级单调不减（台阶不会被下一档吃掉）', [c(1), c(5), c(9), c(10)]);
  }
  /* 成本函数本身也要对：这是「腾预算」时唯一的那把尺子 */
  ok(vfxOpCost({ t: 'shock' }) === 3, 'shock = 3 次（环 + 竖直气浪 + 尘环）');
  ok(vfxOpCost({ t: 'geyser' }) === 4 && vfxOpCost({ t: 'geyser', shock: false }) === 1,
    'geyser：默认 4 次，关掉自带冲击波后 1 次', [vfxOpCost({ t: 'geyser' }), vfxOpCost({ t: 'geyser', shock: false })]);
  ok(vfxOpCost({ t: 'arc', n: 3 }) === 3, 'arc 按刀数算');
  ok(vfxOpCost({ t: 'cone', line: 3, n: 30 }) === 3, 'cone 按排数算（不是粒子数）');
  ok(vfxOpCost({ t: 'vortex', helix: 2 }) === 2, 'vortex 按圈数算');
  ok(vfxOpCost({ t: 'decal', line: 2 }) === 2, 'decal 按排数算');
  ok(vfxCost(null) === 0, '空配方成本 0（不炸）');
}

/* ============================================================
 * 四、按功能位解析
 * ============================================================ */
console.log('四、按功能位解析：37 只技能全部取得到剪影');
{
  const ids = Object.keys(SKILLS);
  ok(ids.length >= 37, '技能表里有 ' + ids.length + ' 只技能', ids.length);
  const bad = [];
  for (const id of ids) {
    const sk = SKILLS[id];
    const no = skillArchSlotOf(sk.cls, id);
    const want = VFX_SLOT_KEY[sk.cls][no - 1];
    const got = vfxSlotKey(id);
    if (got !== want) bad.push([id, sk.cls, no, want, got]);
    ok(!!vfxRecipe(id, 1), id + ' 取得到配方');
  }
  ok(bad.length === 0, '每只技能都解析到**本职业本位**那条剪影', bad);
  /* 兄弟技能共用剪影是**设计**，不是漏做：刀客 ② 的五只技能都是「纵向塌陷」 */
  const quakeIds = skillArchList('warrior').find(s => s.no === 2).inherit;
  ok(quakeIds.length >= 5, '刀客 ② 位有 ' + quakeIds.length + ' 只技能共用一条剪影', quakeIds);
  ok(quakeIds.every(id => vfxSlotKey(id) === 'quake'), '它们全部解析到 quake');
  ok(quakeIds.every(id => sigOf(vfxRecipe(id, 9)) === sigOf(vfxRecipe('quake', 9))),
    '同位的技能在 9 级拿到的是同一套台阶');
  /* 越界与孤儿 */
  ok(vfxRecipe('__nope__', 1) === null, '不存在的技能返回 null');
  ok(vfxRecipe('whirl', 0).applied.length === 0, 'Lv0 不吃任何台阶（当成 1 级）');
  ok(vfxRecipe('whirl', 99).tier === 10, '超过 10 级不会越界（最高只到终极档）');
  /* 解析出来的 key 要能被反查（探针 / 面板要靠它显示「本位剪影」） */
  const rec = vfxRecipe('poison', 5);
  ok(rec.key === 'swordrain' && rec.id === 'poison', '配方上记着「哪条剪影、哪只技能」', [rec.key, rec.id]);
}

/* ============================================================
 * 五、`at`：延迟真的会延迟（桩跑 VFX.play）
 * ============================================================ */
console.log('五、`at`：延迟的指令晚一点才画（拿桩跑解释器）');
{
  /* vfx.js 顶层会 `new THREE.Vector3()`，所以要先把 THREE 摆上 */
  const calls = [];
  class V3 {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() { return this; }
  }
  ctx.THREE = { Vector3: V3, Color: class { constructor() { } multiplyScalar() { return this; } getHex() { return 0; } } };
  ctx.FXK = {
    spr: (p, o) => { calls.push(['spr', Date.now()]); return {}; },
    shock: () => { calls.push(['shock', Date.now()]); return {}; },
    decal: () => { calls.push(['decal', Date.now()]); return {}; },
    bolt: () => { calls.push(['bolt', Date.now()]); return {}; },
    trail: () => { calls.push(['trail', Date.now()]); return {}; }
  };
  ctx.FX = {
    ring: () => { calls.push(['ring', Date.now()]); },
    flashCircle: () => { calls.push(['flash', Date.now()]); },
    beam: () => { calls.push(['beam', Date.now()]); },
    slash: () => { calls.push(['arc', Date.now()]); }
  };
  ctx.Game = { mapGen: 1 };
  load('src/vfx.js', 'globalThis.__VFX = VFX;');
  const VFX = ctx.__VFX;

  const mk = () => ({
    sil: 'x', color: 0xffffff, tex: 'spark', decal: 'scorch',
    cast: [], loop: [],
    impact: [
      { t: 'ring', r: 0.4 },              // 立刻
      { t: 'ring', r: 0.6, at: 0.05 }     // 50ms 后
    ]
  });
  const run = (rec) => new Promise(res => {
    calls.length = 0;
    const t0 = Date.now();
    const n = VFX.play(rec, { pos: new V3(), aim: new V3(), radius: 3 });
    const atOnce = calls.length;
    setTimeout(() => res({ n, atOnce, later: calls.length, ms: Date.now() - t0 }), 140);
  });

  (async () => {
    const r = await run(mk());
    ok(r.atOnce === 1, '`at` 那条**没有**在施法同一帧画出来', r.atOnce);
    ok(r.later === 2, '50ms 后两条都画了（延迟的那条补上了）', r.later);
    ok(r.n === 2, '播放账算 2 条（延迟的也算「配方被消费了」）', r.n);
    ok(r.ms >= 100, '确实等到了延迟之后才数', r.ms);

    /* 没有 `at` 的配方行为和以前完全一样（回归保护） */
    const plain = mk();
    delete plain.impact[1].at;
    const r2 = await run(plain);
    ok(r2.atOnce === 2, '不带 `at` 的配方仍然同一帧全播（老行为不变）', r2.atOnce);

    /* 换图要作废：延迟的特效不许砸到新地图上 */
    const rec3 = { sil: 'x', cast: [], loop: [], impact: [{ t: 'ring', r: 0.5, at: 0.05 }] };
    calls.length = 0;
    VFX.play(rec3, { pos: new V3(), aim: new V3(), radius: 3 });
    ctx.Game.mapGen = 2;                     // 这一帧换图
    await new Promise(res => setTimeout(res, 140));
    ok(calls.length === 0, '换图后延迟的那条被作废（不砸到新地图上）', calls.length);

    /* 12 条真配方里带 `at` 的那几条：至少 8 条用上了（不是写完就没人用） */
    let withAt = 0;
    for (const key of KEYS) {
      for (const lv of [1, 5, 9, 10]) {
        const rec = vfxRecipe(key, lv);
        for (const k of ['cast', 'loop', 'impact']) {
          if ((rec[k] || []).some(op => op.at)) { withAt++; break; }
        }
      }
    }
    ok(withAt >= 8, '至少 8 条配方用上了 `at`（时间轴进化，不花绘制预算）', withAt);

    /* ---------------- 六、源码接线 ---------------- */
    console.log('六、源码接线：配方 → 解释器 → 游戏');
    const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const game = src('src/game.js'), vfxSrc = src('src/vfx.js'), dv = src('src/data/data-vfx.js');
    ok(/VFX\.playFor\(id,/.test(game), 'game.js：playSkillVfx 走 VFX.playFor（按技能 id 取配方）');
    ok(/_emit\(op, c\)/.test(vfxSrc), 'vfx.js：play 走 _emit（`at` 在这里统一处理）');
    ok(/_later\(\(\) => \{ this\._op\(op, c\); \}/.test(vfxSrc), 'vfx.js：延迟的指令仍走 _later（换图会作废）');
    ok(/function vfxSlotKey\(/.test(dv), 'data-vfx.js：有 vfxSlotKey（按位解析）');
    ok(/const key = vfxSlotKey\(id\);/.test(dv), 'data-vfx.js：vfxRecipe 先解析功能位');
    ok(/function vfxCost\(/.test(dv), 'data-vfx.js：成本表在数据层（测试与 bench 共用一把尺子）');
    ok(/const VFX_SLOT_KEY = \{/.test(dv), 'data-vfx.js：位 → 剪影的对照表写死在数据里');

    console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P5 契约：' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail === 0 ? 0 : 1);
  })();
}
