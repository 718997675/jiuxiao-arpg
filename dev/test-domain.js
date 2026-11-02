/* ============================================================
 * [B16.6] 领域乘区的契约 —— node 直跑，不开浏览器
 *
 *   node dev/test-domain.js
 *
 * 这一层不测「画得好不好看」（那是 probe-domain 的事），只测**数值账**：
 * 踩进去扣多少、出来有没有归位、两块圈叠加听谁的、主人死了圈散不散、
 * 切后台回来会不会一次结算三跳。
 *
 * 装法：把 `src/domain.js` 灌进 vm，配一份最小 Game / FX 桩。
 * `const Domains` 不挂 global，得用 `vm.runInContext('Domains')` 取。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./_load');

const SRC = fs.readFileSync(path.join(ROOT, 'src/domain.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

/* 一份可复位的桩：每节测试都换新的，避免上一节留下的 player 位置影响下一节 */
function rig(opts) {
  const o = opts || {};
  const hit = [];
  const ctx = vm.createContext({
    console, Math, JSON,
    THREE: { Vector3: function (x, y, z) { this.x = x; this.y = y; this.z = z; } },
    FX: { field: () => ({ fake: true }), text: () => {} },
    Game: {
      state: { hp: 100, stats: { hpMax: 1000 } },
      playerGroup: { position: { x: 0, y: 0, z: 0 } },
      dead: false,
      fieldSlow: 0, fieldAspd: 0,
      damagePlayer(dmg, from, extra) { hit.push({ dmg, pierce: !!(extra && extra.pierce) }); },
      collideWorld: () => {}
    }
  });
  if (o.worldboss) ctx.WorldBoss = o.worldboss;
  vm.runInContext(SRC, ctx, { filename: 'src/domain.js' });
  const Domains = vm.runInContext('Domains', ctx);
  const G = ctx.Game;
  /* 推 n 帧，每帧 step 秒 */
  const run = (n, step) => { for (let i = 0; i < n; i++) Domains.tick(step); };
  return { ctx, Domains, G, hit, run };
}

console.log('一、挂一块圈：预设补数值，不写死文案');
{
  const { Domains, G, run } = rig();
  const h = Domains.add({ preset: 'poison', x: 0, z: 0, r: 5 });
  ok(Domains.list.length === 1, '进 list');
  ok(h.zone.name === '毒沼', '名字从预设补', h.zone.name);
  ok(h.zone.player.dotPct === 0.6, 'dotPct 0.6', h.zone.player.dotPct);
  ok(!!(h.zone.mesh && h.zone.mesh.fake), '视觉走 FX.field（判定半径 = 画出来的半径）');
  /* 玩家站在原点 = 圈心 */
  run(1, 0.1);
  ok(G.fieldSlow === 0, '毒沼不改移速', G.fieldSlow);
  ok(/每秒失去 0\.6% 最大生命/.test(Domains._descOf(h.zone)), '文案从数值生成', Domains._descOf(h.zone));
}

console.log('二、持续伤害：每 1 秒一跳，走 pierce');
{
  const { Domains, G, hit, run } = rig();
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 5 });
  run(9, 0.1);
  ok(hit.length === 0, '0.9 秒还没到，一跳都不该有（浮点补偿那一行在这里生效）', hit.length);
  run(1, 0.1);
  ok(hit.length === 1, '1.0 秒整结算第 1 跳', hit.length);
  ok(Math.abs(hit[0].dmg - 6) < 1e-9, '0.6% × 1000 = 6 点', hit[0].dmg);
  ok(hit[0].pierce === true, 'pierce —— 否则堆防御等于免疫领域');
  run(30, 0.1);
  ok(hit.length === 4, '3 秒后又 3 跳（共 4 跳）', hit.length);
}

console.log('三、单帧步长夹 0.1 秒：切后台回来不会一次结算三跳 / 不会瞬移');
{
  const { Domains, hit, run } = rig();
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 5 });
  Domains.add({ preset: 'devour', x: 30, z: 0, r: 5 });
  run(1, 3);
  ok(hit.length === 0, 'dt=3 秒只当 0.1 秒（不会一次结算 3 跳）', hit.length);
  run(9, 0.1);
  ok(hit.length === 1, '累计 1.0 秒才结算第 1 跳', hit.length);
}

console.log('四、减速 / 攻速：各取最强，符号照抄');
{
  const { Domains, G, run } = rig();
  Domains.add({ preset: 'tide', x: 0, z: 0, r: 5 });             // slow 30
  Domains.add({ preset: 'tide', x: 0, z: 0, r: 5, player: { slow: 50 } });
  run(1, 0.1);
  ok(Math.abs(G.fieldSlow - 0.5) < 1e-9, '两块水天取最强 50%（不是 80%）', G.fieldSlow);

  const b = rig();
  b.Domains.add({ preset: 'warcry', x: 0, z: 0, r: 5, player: { aspd: -15 } });
  b.Domains.add({ preset: 'warcry', x: 0, z: 0, r: 5, player: { aspd: -15 } });
  b.run(1, 0.1);
  ok(b.G.fieldAspd === -15, '两块 −15% 是 −15%，**不是 +15%**（先取绝对值再乘符号就会翻）', b.G.fieldAspd);
}

console.log('五、出圈必须归位（幂等）');
{
  const { Domains, G, run } = rig();
  Domains.add({ preset: 'tide', x: 0, z: 0, r: 5 });
  run(1, 0.1);
  ok(G.fieldSlow > 0, '先在圈里');
  G.playerGroup.position.x = 50;
  run(1, 0.1);
  ok(G.fieldSlow === 0, '走出去一帧就归位', G.fieldSlow);
  run(5, 0.1);
  ok(G.fieldSlow === 0, '再走五帧还是 0（归位幂等）', G.fieldSlow);
}

console.log('六、吸力：1.2 米以内不拉，6 m/s 封顶');
{
  const { Domains, G, run } = rig();
  Domains.add({ preset: 'devour', x: 0, z: 0, r: 20, player: { pull: 2 } });
  G.playerGroup.position.x = 10;
  run(1, 0.1);
  ok(Math.abs(G.playerGroup.position.x - 9.8) < 1e-6, '10 米处一帧拉 0.2 米（2 m/s × 0.1s）', G.playerGroup.position.x);
  Domains.list[0].player.pull = 99;
  const x0 = G.playerGroup.position.x;
  run(1, 0.1);
  ok(Math.abs((x0 - G.playerGroup.position.x) - 0.6) < 1e-6, 'pull 99 也被 6 m/s 封顶（0.6 米/帧）', x0 - G.playerGroup.position.x);
  G.playerGroup.position.x = 1.0;
  run(1, 0.1);
  ok(Math.abs(G.playerGroup.position.x - 1.0) < 1e-9, '1 米以内不拉（再拉就塞进模型里了）', G.playerGroup.position.x);
}

console.log('七、读秒：按帧递减，到点自己散，并补一次 onLeave');
{
  const { Domains, run } = rig();
  let left = 0;
  const h = Domains.add({ preset: 'poison', x: 0, z: 0, r: 5, ttl: 0.5, onLeave: () => left++ });
  run(4, 0.1);
  ok(Domains.list.length === 1, '0.4 秒还在', Domains.list.length);
  ok(Math.abs(h.zone.ttl - 0.1) < 1e-6, 'ttl 按帧扣', h.zone.ttl);
  run(1, 0.1);
  ok(Domains.list.length === 0, '0.5 秒到点散掉', Domains.list.length);
  ok(left === 1, '散的时候补了一次 onLeave（buff 条要跟着走）', left);
  run(3, 0.1);
  ok(left === 1, 'onLeave 只补一次（不是每帧都补）', left);
}

console.log('八、主人死了，圈跟着散');
{
  const { Domains, run } = rig();
  const owner = { dead: false };
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 5, owner });
  run(1, 0.1);
  ok(Domains.list.length === 1, '主人在，圈在');
  owner.dead = true;
  run(1, 0.1);
  ok(Domains.list.length === 0, '主人一死圈就散（Boss 死了毒圈还毒你，是最冤的死法）', Domains.list.length);
}

console.log('九、移动领域：圆心每帧重新问，不是快照');
{
  const { Domains, G, run } = rig();
  let cx = 0;
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 3, follow: () => ({ x: cx, z: 0 }) });
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 3, noVisual: true });
  run(1, 0.1);
  ok(Domains.list[0]._in === true, '第一帧在圈里');
  cx = 40;
  run(1, 0.1);
  ok(Domains.list[0]._in === false, '圆心走了 40 米 → 不在了（快照的话永远在）');
  ok(Domains.list[0].x === 40, 'zone.x 跟着圆心走（视觉要能跟上）', Domains.list[0].x);
}

console.log('十、kill / clear：谁创建谁收');
{
  const { Domains, G, run } = rig();
  const h = Domains.add({ preset: 'tide', x: 0, z: 0, r: 5 });
  run(1, 0.1);
  ok(G.fieldSlow > 0, '先踩在圈里');
  h.kill();
  ok(Domains.list.length === 0, 'kill 之后 list 清空');
  h.kill();
  ok(Domains.list.length === 0, 'kill 两次不炸（幂等）');
  run(1, 0.1);
  ok(G.fieldSlow === 0, 'kill 之后数值归位', G.fieldSlow);

  const b = rig();
  b.Domains.add({ preset: 'tide', x: 0, z: 0, r: 5 });
  b.Domains.add({ preset: 'illusion', x: 0, z: 0, r: 5 });
  b.run(1, 0.1);
  ok(b.Domains.dim() > 0, '幻域压小地图');
  b.Domains.clear();
  ok(b.Domains.list.length === 0, 'clear 清空');
  ok(b.G.fieldSlow === 0 && b.G.fieldAspd === 0, 'clear 之后两个字段归位', [b.G.fieldSlow, b.G.fieldAspd]);
  ok(b.Domains.dim() === 0, 'clear 之后小地图恢复', b.Domains.dim());
}

console.log('十一、buff 条：常驻的不写秒数，有读秒的写');
{
  const { Domains, run } = rig();
  Domains.add({ preset: 'poison', x: 0, z: 0, r: 5 });
  run(1, 0.1);
  const a = Domains.buff();
  ok(a && a.noTimer === true, '毒沼是「站在圈里就一直有」→ noTimer', a && a.noTimer);
  ok(a && a.name === '毒沼' && a.type === 'debuff', '名字与类型', a);

  const b = rig();
  b.Domains.add({ preset: 'poison', x: 0, z: 0, r: 5, ttl: 6 });
  b.run(1, 0.1);
  const c = b.Domains.buff();
  ok(c && c.noTimer === false, '6 秒卵囊反过来要显示倒计时', c && c.noTimer);
  ok(c && c.dur > 5.8 && c.dur < 6, 'dur 就是剩余秒数', c && c.dur);

  const d = rig();
  d.Domains.add({ preset: 'poison', x: 0, z: 0, r: 5 });
  d.G.playerGroup.position.x = 99;
  d.run(1, 0.1);
  ok(d.Domains.buff() === null, '没站在圈里 → 没有那条 buff', d.Domains.buff());
}

console.log('十二、视野：借世界 Boss 那套，不抢同一个槽位');
{
  /* 世界 Boss 领域正在生效 → 这里必须**让位**（同一个 `_fogBase` 槽位） */
  const calls = [];
  const wbBusy = {
    domainState: () => ({ inside: true }),
    _applySight: (s) => calls.push(['apply', s]),
    _restoreSight: () => calls.push(['restore']),
    dim: () => 0
  };
  const a = rig({ worldboss: wbBusy });
  a.Domains.add({ preset: 'daynight', x: 0, z: 0, r: 50 });
  a.run(1, 0.1);
  ok(calls.length === 0, '世界 Boss 领域生效时不接管视野（同一个槽位，抢了会互相还原）', calls);

  const c2 = [];
  const wbFree = {
    domainState: () => null,
    _applySight: (s) => c2.push(['apply', s]),
    _restoreSight: () => c2.push(['restore']),
    dim: () => 0
  };
  const b = rig({ worldboss: wbFree });
  b.Domains.add({ preset: 'daynight', x: 0, z: 0, r: 50 });
  b.run(1, 0.1);
  ok(c2.length && c2[c2.length - 1][0] === 'apply' && c2[c2.length - 1][1] === 9,
    '没人占槽位 → 压到 9 米', c2);
  b.Domains.clear();
  ok(c2[c2.length - 1][0] === 'restore', 'clear 之后还原', c2);
}

console.log('十三、压暗系数与世界 Boss 取 max');
{
  const wb = { dim: () => 0.7 };
  const { Domains, run } = rig({ worldboss: wb });
  Domains.add({ preset: 'illusion', x: 0, z: 0, r: 5, player: { minimapDim: 0.3 } });
  run(1, 0.1);
  ok(Math.abs(Domains.dim() - 0.7) < 1e-9, '两个来源取较大的（谁压得更狠听谁的）', Domains.dim());
  Domains.add({ preset: 'illusion', x: 0, z: 0, r: 5, player: { minimapDim: 0.75 } });
  run(1, 0.1);
  ok(Math.abs(Domains.dim() - 0.75) < 1e-9, '自己更狠时取自己', Domains.dim());
}

console.log('十四、接线：游戏侧真的每帧调、真的在换图时清');
{
  const gm = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  ok(/if \(typeof Domains !== 'undefined'\) Domains\.tick\(dt\);/.test(gm), 'Game.update 每帧调 Domains.tick');
  ok(/Domains\.tick\(dt\)[\s\S]{0,400}WorldBoss\.domainTick\(dt\)/.test(gm) === false,
    'Domains.tick 排在 domainTick **之后**（视野槽位要后写）');
  ok(gm.indexOf('Domains.tick(dt)') > gm.indexOf('WorldBoss.domainTick(dt)'), '顺序：domainTick → Domains.tick');
  ok(/\(this\.fieldSlow \|\| 0\)/.test(gm), '移速公式读 fieldSlow');
  ok(/\(this\.fieldAspd \|\| 0\)/.test(gm), '攻速公式读 fieldAspd');
  ok(/if \(typeof Domains !== 'undefined'\) Domains\.clear\(\);/.test(gm), '换图清领域');
  ok(/Domains\.buff\(\)/.test(gm) && /Domains\.dim\(\)/.test(
    fs.readFileSync(path.join(ROOT, 'src/ui-minimap.js'), 'utf8')), 'buff 条与小地图都接上了');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html.indexOf('src/domain.js') > html.indexOf('src/worldboss.js'), 'script 顺序：domain.js 在 worldboss.js 之后');
  ok(html.indexOf('src/domain.js') < html.indexOf('src/game.js'), 'script 顺序：domain.js 在 game.js 之前');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
