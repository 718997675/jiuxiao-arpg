#!/usr/bin/env node
/* ============================================================
 * 技能 P4 真机探针：三个 ⑤ 号位的表现真的播出来了
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p4.js
 *
 * 契约（test-skill-p4）只能证明「数据对、代码在」，证明不了「按下去有画面」。
 * 这一份量的是四件事：
 *
 *   1. 刀客换式：VFX.played 真的涨了（配方被调用，不是只写在数据表里），
 *      而且三式取到的刀气参数互不相同
 *   2. 刃势满层：每 0.6 秒真的有一次脉冲（包 FX.ring 数次数）；
 *      没满层时一次都不许有（否则「满了」这个信号就废了）
 *   3. 法师法相：开窗后背后法身真的在场景里、有透明度、颜色跟主元素；
 *      换相当场换色；收窗 0.3 秒内淡出并摘掉（不留空壳）
 *   4. 道士召唤：脚下真的开了召唤阵（FX.zones 里的 sigil 域），
 *      灵兽有登场动作（先小后大、从地下升起，0.5 秒后归位）
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); return; }
  fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d));
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* 干净的施法环境（与 probe-skill-p2b 同一套） */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.running = true;
    Game.dead = false;
    window.__clean = () => {
      Game.state.mp = 99999;
      Game.cooldowns = {};
      Game._autoCast = false;
      Game._drainOn = null;
      Game._recharge = null;
      Game.state.stats.skillMods = {};
    };
    window.__cls = (cls, skills) => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      Game.state.cls = cls;
      Game.state.skills = skills || {};
      Game.buffs = []; Game.cooldowns = {}; Game.enemies = []; Game.allies = [];
      window.__clean();
      Game.recalc();
      Game.state.hp = Game.state.stats.hpMax;
      if (typeof Game._dropFormAura === 'function') Game._dropFormAura();
      Game.elemAura = { t: 0, elem: 0, mul: 1, rider: false };
      Game.bladeState().i = 0; Game.bladeState().mask = 0;
    };
    /* 等到条件成立（上限 6 秒）。
     * **不能写死毫秒**：headless 的 rAF 只有 ~10fps，而游戏内计时用的是 dt
     * （每帧固定 16ms 量级），于是「0.3 秒的游戏时间」在墙上要走两秒左右。
     * 这正是台账 §7.3 那条教训：读「某一瞬间的副作用」要轮询到出现，别数时间。 */
    window.__until = async (fn, ms) => {
      const t0 = Date.now();
      const lim = ms || 6000;
      while (Date.now() - t0 < lim) {
        if (fn()) return true;
        await new Promise(r => setTimeout(r, 50));
      }
      return !!fn();
    };
  });

  /* ---------------- 1. 刀客：换式的刀气真的播了，三式形状不同 ---------------- */
  console.log('一、刀客 ⑤ 兵形：换式有刀气，且三式形状不同');
  const blade = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__cls('warrior', { avatar: { lv: 7 } });
    Game.castSkill('avatar');            // 0 → 1（顺手把「起手那一下」走掉）
    await wait(80);
    const shapes = [];
    for (let i = 0; i < 3; i++) {
      const r = vfxBladeForm(i);
      const arc = (r.impact || []).find(o => o.t === 'arc');
      shapes.push({ sil: r.sil, n: arc ? arc.n : 0, tilt: arc ? arc.tilt : 0,
        decal: r.decal || null });
    }
    /* VFX.played 是解释器自己的账本：涨了 = 配方真被调用了 */
    window.__clean();
    const before = VFX.played;
    const stBefore = Game.bladeStance();
    Game.castSkill('avatar');            // 换式
    await wait(80);
    return { shapes, played: VFX.played - before, before: stBefore, stance: Game.bladeStance() };
  });
  ok(blade.played > 0, '换式真的播了配方（VFX.played 涨了）', blade.played);
  ok(new Set(blade.shapes.map(s => s.sil)).size === 3, '三式剪影标签互不相同',
    blade.shapes.map(s => s.sil));
  ok(new Set(blade.shapes.map(s => s.n + '/' + s.tilt)).size === 3, '三式刀气参数互不相同',
    blade.shapes.map(s => s.n + '/' + s.tilt));
  ok(blade.shapes[2].decal === 'crack', '摧城带裂痕', blade.shapes[2].decal);
  ok(blade.stance !== blade.before, '换式真的换了（' + blade.before + ' → ' + blade.stance + '）',
    blade);

  /* ---------------- 2. 刃势满层：脉冲只在满层时出现 ---------------- */
  console.log('二、刃势满层才有「刀身发烫」的脉冲');
  const edge = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__cls('warrior', { avatar: { lv: 5 } });
    const count = async (ms) => {
      const orig = FX.ring;
      let n = 0;
      FX.ring = function () { n++; return orig.apply(this, arguments); };
      await wait(ms);
      FX.ring = orig;
      return n;
    };
    Game.bladeState().mask = 0;                       // 空刃势
    const empty = await count(1400);
    Game.bladeState().mask = 0b1111;                  // 满 4 层
    const full = await count(1400);
    return { empty, full, edge: Game.bladeEdge(), max: Game.bladeEdgeMax() };
  });
  ok(edge.max === 4 && edge.edge === 4, '刃势上限 4 层（探针把 4 格全点亮）', edge);
  ok(edge.empty === 0, '没满层时一次脉冲都没有', edge.empty);
  ok(edge.full >= 2, '满层时 1.4 秒内至少两跳（0.6 秒一次）', edge.full);

  /* ---------------- 3. 法师：法身建 / 换色 / 收窗 ---------------- */
  console.log('三、法师 ⑤ 元素法相：背后法身');
  const aura = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__cls('mage', { elementavatar: { lv: 10 } });
    const out = {};
    out.before = !!Game._formAura;
    Game.castSkill('elementavatar');       // 开窗
    await wait(200);
    const f = Game._formAura;
    out.open = !!f;
    out.inScene = !!(f && Game.scene.children.indexOf(f.sp) >= 0);
    out.opacity = f ? Math.round(f.mat.opacity * 1000) / 1000 : 0;
    out.color = f ? f.mat.color.getHex() : 0;
    out.kind = Game.elemAuraKind().color;
    out.kindName = Game.elemAuraKind().name;
    out.t = Math.round(Game.elemAuraState().t);
    /* 站到身后：法身与玩家的水平距离应当 > 0.8（不是穿在身上） */
    out.dist = f ? Math.round(Math.hypot(f.sp.position.x - Game.playerGroup.position.x,
      f.sp.position.z - Game.playerGroup.position.z) * 100) / 100 : 0;
    out.scaleY = f ? Math.round(f.sp.scale.y * 100) / 100 : 0;

    /* 换相：颜色必须当场变 */
    window.__clean();
    Game.castSkill('elementavatar');
    await wait(150);
    out.swapped = Game._formAura ? Game._formAura.mat.color.getHex() : 0;
    out.swappedKind = Game.elemAuraKind().color;
    out.swappedName = Game.elemAuraKind().name;

    /* 收窗：t 归零后淡出并摘掉（0.3 秒游戏时间 → 轮询，不数墙上时间） */
    Game.elemAuraState().t = 0.01;
    out.closed = await window.__until(() => !Game._formAura, 6000);
    out.leftInScene = !!(f && Game.scene.children.indexOf(f.sp) >= 0);
    return out;
  });
  ok(!aura.before, '开窗前没有法身', aura.before);
  ok(aura.open && aura.inScene, '开窗后法身真的进了场景', aura);
  ok(aura.opacity > 0.1, '法身有可见的透明度（不是 0）', aura.opacity);
  ok(aura.color === aura.kind, '法身颜色 = 主元素色（' + aura.kindName + '）',
    { 法身: aura.color, 元素: aura.kind });
  ok(aura.t >= 9, '窗口真的开了 10 秒量级', aura.t);
  ok(aura.dist > 0.8, '法身站在身后（不是穿在身上）', aura.dist);
  ok(aura.scaleY > 4, '法身是「巨像」尺寸（> 4 米）', aura.scaleY);
  ok(aura.swapped === aura.swappedKind && aura.swapped !== aura.color,
    '换相后法身当场换色（' + aura.kindName + ' → ' + aura.swappedName + '）',
    { 前: aura.color, 后: aura.swapped, 应为: aura.swappedKind });
  ok(aura.closed, '收窗后法身被摘掉（不留空壳）', aura.closed);
  ok(!aura.leftInScene, '而且真的从场景里移除了', aura.leftInScene);

  /* ---------------- 4. 道士：召唤阵 + 灵兽登场 ---------------- */
  console.log('四、道士 ⑤ 召灵兽：召唤阵 + 从阵里升起来');
  const call = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__cls('taoist', { summon: { lv: 1 } });
    const out = {};
    out.mods = Game._summonMods('summon');
    Game.castSkill('summon');
    out.made = Game.allies.length;
    out.kinds = Game.allies.map(a => a.kind);
    const al = Game.allies[0];
    out.baseScale = al ? al.baseScale : 0;
    /* 召唤阵：FX.zones 里应当有一个 sigil 域，且离玩家很近 */
    const z = (FX.zones || []).filter(o => o && o.type === 'field' && o.kind === 'sigil');
    out.zones = z.length;
    const pp = Game.playerGroup.position;
    out.gateDist = z.length ? Math.round(Math.hypot(z[0].mesh.position.x - pp.x,
      z[0].mesh.position.z - pp.z) * 100) / 100 : -1;
    /* 登场动作：等一帧跑过（spawnT 开始往下走）再读，否则读到的是召唤前的原样 */
    await window.__until(() => al && al.spawnT < 0.42, 3000);
    out.spawnT = al ? Math.round(al.spawnT * 100) / 100 : 0;
    out.scale0 = al ? Math.round(al.actor.group.scale.x * 100) / 100 : 0;
    out.y0 = al ? Math.round(al.actor.group.position.y * 100) / 100 : 0;
    out.done = await window.__until(() => al && al.spawnT === 0, 6000);
    out.scale1 = al ? Math.round(al.actor.group.scale.x * 100) / 100 : 0;
    out.y1 = al ? Math.round(al.actor.group.position.y * 100) / 100 : 0;
    return out;
  });
  ok(call.made >= 1, '灵狼召出来了', { made: call.made, kinds: call.kinds, mods: call.mods });
  ok(call.zones >= 1, '脚下开了召唤阵（FX.zones 里有 sigil 域）', call.zones);
  ok(call.gateDist >= 0 && call.gateDist < 2.5, '召唤阵就在脚下（不是丢在别处）', call.gateDist);
  ok(call.spawnT > 0 && call.spawnT < 0.42, '灵兽带登场计时（已经在走）', call.spawnT);
  ok(call.scale0 < call.baseScale, '登场中是缩小状态（不是「啪」地出现）',
    { 当前: call.scale0, 基准: call.baseScale });
  ok(call.y0 < 0, '登场时从地面以下升起来', call.y0);
  ok(call.done, '登场动作会结束（spawnT 归零）', call.spawnT);
  ok(Math.abs(call.scale1 - call.baseScale) < 0.01, '尺寸归位到基准缩放',
    { 现在: call.scale1, 基准: call.baseScale });
  ok(Math.abs(call.y1) < 0.01, '高度归位到地面', call.y1);

  /* ---------------- 5. 收尾：别把表现层留成垃圾 ---------------- */
  console.log('五、收尾');
  const clean = await p.evaluate(async () => {
    window.__cls('mage', { elementavatar: { lv: 10 } });
    Game.castSkill('elementavatar');
    await window.__until(() => !!Game._formAura, 3000);
    const had = !!Game._formAura;
    Game.loadMap('village');            // 换图：法身必须被摘掉
    const gone = await window.__until(() => !Game._formAura, 3000);
    return { had, gone, after: !!Game._formAura };
  });
  ok(clean.had && clean.gone && !clean.after, '换图后法身被摘掉（不会跟着旧场景泄漏）', clean);

  console.log('六、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('');
  console.log((fail === 0 ? '✓' : '✗') + ' P4 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
