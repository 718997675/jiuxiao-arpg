#!/usr/bin/env node
/* ============================================================
 * dev/build-bosscast.js —— 从特效台抽出「技能脚手架」，生成 src/boss-cast.js
 *
 *   node dev/build-bosscast.js            # 打到屏幕（只看统计）
 *   node dev/build-bosscast.js --check    # 只检查 src/boss-cast.js 是否过期（过期退出码 1）
 *   node dev/build-bosscast.js --write    # 重写 src/boss-cast.js
 *
 * ---------------- 这个文件补的是哪一段 ----------------
 * `data-bosskits.js` 里有 88 个 run()/hit()，它们引用的是特效台那套脚手架：
 *   BOSS / DUMMY / R / WM / aimAngle / inHit / settle / markOnPlayer / swingArm ……
 * 这些在特效台里是**全局**（同一个 <script> 里），搬进 src/ 之后一个都不存在 ——
 * 少一个就是运行时 ReferenceError，而且只在真打起来那一刻才炸。
 *
 * 所以这里把那段脚手架原样切出来，跟 build-fx2.js 同一个套路（锚点切片，
 * 找不到就直接退出，绝不生成半截文件）。**特效台是唯一的源。**
 *
 * ---------------- 三处「不是原样搬」的地方 ----------------
 * 切出来之后有 3 处必须改语义，否则搬过去是错的（都写在替换函数里，有断言）：
 *
 *  1. `M(...)` → `MK(...)`
 *     特效台的材质工厂参数是 {r,m,e,flat,t,o}；`src/actors.js` 已经有一个
 *     同名同签名的 `M`，参数口径不同、且 flatShading 恒 true。顶层同名会
 *     覆盖掉角色建模那一整套。改名，不动 actors.js。
 *
 *  2. `settle(hit, label)` → 真判定 + 真扣血
 *     特效台里它只飘字（给调特效的人看「打中没有」）。游戏里这是**唯一**
 *     的结算口：88 招里 31 处调它。改成 Game.damagePlayer，整套技能的伤害
 *     就自动接上了，而判定用的还是同一个 inHit + 同一份 hit()。
 *
 *  3. `moveDummy(...)` → Game.dragPlayer(...)
 *     特效台里假人站着不动，所以「把假人挪过去」是演示手段；游戏里玩家的
 *     位置由玩家决定。只有 4.5 米内的目标点才当成真拖拽，更远的一律忽略
 *     （那是复位演示）。
 *
 * ---------------- 用法 ----------------
 *   改脚手架 → 在特效台里看对了 → node dev/build-bosscast.js --write
 *   `dev/test-bosscast.js` 的「源头一致」一条跑 --check。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'boss-vfx-playground.html');
const OUT = path.join(ROOT, 'src', 'boss-cast.js');

/* ---------------- 切片表 ---------------- */
const CUTS = [
  {
    name: '实体工具（MK / G / P）',
    from: 'function M(color, o = {}){',
    to: '/* ---------- 7.1 巨木妖王',
  },
  {
    name: '技能脚手架（R / aimAngle / inHit / settle …）',
    from: '/* 阶段口径：只影响"量"，不改判定形状 */',
    to: '/* =====================================================================\n   9. 共享技能 13 种',
  },
];

function slice(src, cut) {
  const i = src.indexOf(cut.from);
  if (i < 0) throw new Error('找不到起点锚点（' + cut.name + '）：' + cut.from.split('\n')[0]);
  const j = src.indexOf(cut.to, i);
  if (j < 0) throw new Error('找不到终点锚点（' + cut.name + '）：' + cut.to.split('\n')[0]);
  return src.slice(i, j).replace(/\s+$/, '');
}

/* ---------------- 三处语义替换 ---------------- */
function renameMat(body) {
  const n = body.split(/\bM\(/).length - 1;
  if (n !== 1) throw new Error('实体工具段里 M( 出现 ' + n + ' 次，预期正好 1 次（定义那处）');
  return body.replace(/\bfunction M\(/, 'function MK(');
}

const OLD_SETTLE = `function settle(hit, label){
  const inside = inHit(hit, DUMMY.pos.x, DUMMY.pos.z);
  if(inside){
    floatText(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), label || '命中', '#ff9a6a');
    hurtVignette();
  }else{
    floatText(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '闪开', '#8fd05a');
  }
  return inside;
}`;

const NEW_SETTLE = `/* ⚠️ **这一处不是原样搬的** —— 它是整套接入的结算口。
 *
 * 特效台里 settle 只负责「飘个字给调特效的人看打中没有」，因为那边没有血条。
 * 游戏里它必须真的扣血：88 招里有 31 处调它，全部走这一个口，
 * 判定仍然用同一个 inHit + 同一份 hit()，所以「预警画在哪、判定算在哪」不变。
 *
 * 伤害 = 怪的当前攻击(e.dmg，已含狂怒阶段加成) × 这一招的 mul。
 * mul 从 e._cast.sk 读 —— 同一个怪同一时刻只有一招在结算。
 * 没有 e._cast（比如调试时直接调 settle）就按 1 倍算，不静默吞掉。 */
function settle(hit, label){
  const inside = inHit(hit, DUMMY.pos.x, DUMMY.pos.z);
  if(inside){
    const e = CUR, sk = e && e._cast && e._cast.sk;
    const mul = (sk && sk.mul != null) ? sk.mul : 1;
    if(CTX.game && e && !e.dead){
      try { CTX.game.damagePlayer((e.dmg || 1) * mul, e); }
      catch (err) { console.error('[BossCast] damagePlayer 失败', err); }
    }
    hurtVignette();
  }
  return inside;
}`;

function patchSettle(body) {
  if (body.indexOf(OLD_SETTLE) < 0) {
    throw new Error('settle 的函数体变了（特效台里改过？）—— 先看一眼再更新这里的 OLD_SETTLE');
  }
  return body.replace(OLD_SETTLE, NEW_SETTLE);
}

function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const parts = CUTS.map(c => {
    let body = slice(src, c);
    if (c.name.indexOf('实体工具') === 0) body = renameMat(body);
    else body = patchSettle(body);
    return '  /* ---------- ' + c.name + ' ---------- */\n' +
      body.split('\n').map(l => (l ? '  ' + l : l)).join('\n');
  });
  return HEAD + parts.join('\n\n') + '\n\n' + FOOT;
}

/* ============================================================
 * HEAD —— 手写：宿主、上下文、替身对象、被改写的那两个
 * ============================================================ */
const HEAD = `/* ============================================================
 * BOSSCAST —— 45 只守卫的招式，在游戏里真的打出来
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = \`docs/boss-vfx-playground.html\`（那边 51 只 Boss 可以一只一只真放）
 *   重新生成：\`node dev/build-bosscast.js --write\`；只检查：\`--check\`
 *
 * ---------------- 它解决的是哪件事 ----------------
 * 技能试验场（特效台）里 88 招都调好了，但游戏里的首领还在跑
 * \`game.js\` 的 \`bossPattern()\` —— 11 个手写 case，用的是 FX.telegraph /
 * FX.burst 那套老特效。也就是说：**试验场里看到的和游戏里打出来的，是两套东西**。
 *
 * 这个文件把中间那段补上：
 *   data-bosskits.js  88 招的 run()/hit()（生成物，从特效台原样搬）
 *   boss-cast.js      本文件：那些 run() 引用的全部脚手架 + 选招 + 结算
 *   game.js           updateBossAI 到点就调 BossCast.tryCast()
 *
 * ---------------- 为什么脚手架是「切」出来的而不是「抄」的 ----------------
 * 抄一份进去，两边一定会走散（改了一边、另一边还是老样子，而且没人会发现）。
 * 所以锚点切片 + \`--check\` 进契约，跟 fx2.js / data-bosskits.js 同一个规矩。
 * 只有三处改了语义（MK 改名 / settle 接伤害 / moveDummy 接拖拽），
 * 都在 dev/build-bosscast.js 里写明并带断言。
 *
 * ---------------- 宿主怎么接（四件事） ----------------
 *   BossCast.bind(Game)          开局一次（Game 要有 scene / playerGroup / damagePlayer）
 *   BossCast.tryCast(e, pp)      该出招时调一次；内部判 CD、选招、跑 run()
 *   BossCast.update(dt)          每帧（同步玩家位置与施法占用）
 *   BossCast.clear()             换图 / 脱战 / 重开
 * ============================================================ */
'use strict';

/* ---------------- fx2 的件桥到顶层 ----------------
 * 88 招的 run() 是**逐字**从特效台搬过来的，它们写的是 flatMesh / TEX / V3
 * 这些裸名字。fx2 把这些收在 FX2.tools 里（不污染顶层），这里摊平一次。
 * 加新件时要同步 dev/build-fx2.js 的 tools。 */
const { flatMesh, billMesh, vplane, disposeMesh, lightPulse,
  V3, col, pool, TEX, TEX_BAND } = FX2.tools;
/* 技能体里会直接 \`scene.add(mesh)\`（图腾的木桩、岩甲的石板都是这么加的）。
 * 走 FX2.scene 这个跟踪器才可能被 clear() 收掉 —— 别换成 Game.scene。 */
const scene = FX2.scene;

/* 88 招写的全是 \`BFX.zone(...)\` / \`BFX.burst(...)\` / \`BFX.spikes(...)\`。
 * fx2 的导出对象就是 \`Object.assign(BFX, {...})\` —— 也就是说 FX2 本身
 * 就是那个 BFX。这里只是给它挂回原来的名字，不是第二份实现。 */
const BFX = FX2;

/* ---------------- 上下文 ---------------- */
const CTX = {
  game: null,          /* Game（bind 时给） */
  gen: 0,              /* 换图代号：delay 回调靠它判「这一发还算不算」 */
};

const _ZERO = new THREE.Vector3();
/* 当前正在施法的那只怪。
 *
 * **为什么是一个全局而不是参数**：88 招写的是 \`BOSS.pos\` / \`aimAngle()\`，
 * 没有一处收「我是谁」。要让它们原样跑，只能由外面把 BOSS 指向它。
 *
 * \`__own\` 机制保证异步回调里也对：BossCast.addUpdate 会给每个 updater 打上
 * 归属，fx2 每帧推进前回调 stepHook 把 CUR 切回去（否则两只怪同时在放招时，
 * 后放的那只会把前一只的 settle 算到自己头上）。 */
let CUR = null;

/* 特效台的 BOSS 是个带 g / home / phase 的对象。游戏里这些全在 e 上，
 * 用 getter 转一道 —— run() 里 \`BOSS.pos.clone()\` 这种写法一个字都不用改。 */
const BOSS = {
  get pos() { return (CUR && CUR.pos) ? CUR.pos : _ZERO; },
  get g() { return (CUR && CUR.actor && CUR.actor.group) ? CUR.actor.group : null; },
  /* 游戏里 phase 是 0/1/2，特效台是 1/2。ph() 写的是 \`BOSS.phase || 1\`，
   * 所以 0 要被当成 1 —— 直接 +1，别让它掉到 0 把 \`|| 1\` 的兜底吃掉。 */
  get phase() { return CUR ? (CUR.phase || 0) + 1 : 1; },
  get home() {
    if (CUR && CUR.anchor) { _ZERO.set(CUR.anchor.x, 0, CUR.anchor.z); return _ZERO; }
    return (CUR && CUR.pos) ? CUR.pos : _ZERO;
  },
  get cfg() { return CUR ? CUR.cfg : null; },
};

/* 玩家。位置每帧由 Game.playerGroup 喂，**不在这里记账** ——
 * 玩家的位置只有一个源头，记第二份一定对不上。 */
const DUMMY = {
  get pos() { const g = CTX.game && CTX.game.playerGroup; return g ? g.position : _ZERO; },
  get g() { const c = CTX.game; return c ? c.playerGroup : null; },
  face: { x: 0, z: 1 },
};

/* ---------------- 帧驱动（带归属） ----------------
 * fx2 的 addUpdate / delay 不带「这是谁的」，而 88 招的回调里要读 BOSS。
 * 包一层：创建时记下 CUR，fx2 推进前通过 stepHook 切回来。 */
function addUpdate(u) {
  if (CUR && !u.__own) u.__own = CUR;
  u.__gen = CTX.gen;
  return FX2.tools.addUpdate(u);
}
/* 特效台口径是 delay(秒, 回调)。fx2 的 seq/delay 里没有「换图作废」，
 * 这里补上：换图之后还在跑的 delay 一律不再执行（否则新图里会突然
 * 冒出上一张图没打完的那一招）。 */
function delay(sec, fn) {
  let left = Math.max(0, sec);
  const u = { update(dt) {
    left -= dt;
    if (left > 0) return;
    this.dead = true;
    if (this.__gen !== CTX.gen) return;
    try { fn(); } catch (e) { console.error('[BossCast] delay 回调', e); }
  } };
  return addUpdate(u);
}
function seq(steps) {
  const list = steps.slice().sort((a, b) => a[0] - b[0]);
  let i = 0, acc = 0;
  const u = { update(dt) {
    acc += dt;
    while (i < list.length && acc >= list[i][0]) {
      const fn = list[i++][1];
      if (typeof fn !== 'function') continue;
      if (u.__gen !== CTX.gen) { i = list.length; break; }
      try { fn(); } catch (e) { console.error('[BossCast] seq 回调', e); }
    }
    if (i >= list.length) this.dead = true;
  } };
  return addUpdate(u);
}

/* ---------------- 舞台件（游戏里有自己的出处） ---------------- */
/* 震屏：游戏已经有 \`Game.shake\` 这套（设置面板里可关）。
 * 特效台的 shake(amp,dur) 直接转过去，dur 不用 —— Game 自己衰减。 */
function shake(amp, dur) {
  if (!CTX.game) return;
  CTX.game.shake = Math.max(CTX.game.shake || 0, amp || 0.3);
}
/* 飘字：特效台那 19 处 floatText 写的是给调特效的人看的话
 * （「闪开」「命中 ×0.6」「被拖拽」）。**这些不是给玩家看的** ——
 * 玩家该看到的伤害数字由 damagePlayer 自己出。所以这里空实现。
 * 别把它接成 UI.log：一场仗打下来会刷出几十条演示文案。 */
function floatText() {}
/* 屏幕闪红：游戏在 damagePlayer 里已经有受击反馈，这里不再叠一层
 * （叠了就是「挨一下闪两下」）。 */
function flashScreen() {}
function hurtVignette() {}
/* 3D 浮标（「破绽 2.1s」「尸潮 ×8」）：特效台是 DOM + 每帧投影。
 *
 * **第一版这里是空壳**（返回 {el:null}），理由是「血条已经表达了这些信息」——
 * 那是错的：破防窗口（stagger 那 8 只八部的第 1 格）**唯一的读法就是这个
 * 倒计时**，玩家看不见就只剩「它突然开始抖」；更糟的是技能自己会写
 * bar.el.textContent = ...，空壳的 el 是 null → 每帧抛
 * Cannot set properties of null，被 boot 层吞成一句「帧异常」。
 *
 * 现在复用 FX 已经有的那套（FX.text / FX.cam / FX.layer）：同一个 DOM 层、
 * 同一次投影，只是位置每帧跟着取（posFn），文字由技能自己改。 */
const labels = [];
function label3d(text, color, _y, posFn) {
  const el = document.createElement('div');
  el.className = 'dmg-text boss-tag';
  el.textContent = text || '';
  if (color) el.style.color = color;
  const put = (k, v) => { el.style[k] = v; };
  put('position', 'absolute'); put('left', '0'); put('top', '0');
  put('pointerEvents', 'none'); put('whiteSpace', 'nowrap');
  put('font', '12px/1 system-ui'); put('letterSpacing', '.1em');
  put('textShadow', '0 1px 3px #000'); put('transform', 'translate(-50%,-50%)');
  const layer = (typeof FX !== 'undefined' && FX && FX.layer) ? FX.layer : null;
  if (layer) layer.appendChild(el);
  /* 兜底回收：技能自己 remove() 是主路径，但它要是提前 return 了，
   * 这个元素会永远挂在屏幕上 —— 12 秒后无条件收掉。 */
  let t = 0;
  addUpdate({ update(dt) {
    t += dt;
    if (t > 12 || !el.parentNode) { this.dead = true; return; }
    const cam = CTX.game && CTX.game.camera;
    const p = (typeof posFn === 'function') ? posFn() : null;
    if (!cam || !p) return;
    const v = p.clone().project(cam);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const sx = (v.x * .5 + .5) * window.innerWidth;
    const sy = (-v.y * .5 + .5) * window.innerHeight;
    el.style.transform = 'translate(-50%,-50%) translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
  } });
  return { el, remove() { if (el.parentNode) el.remove(); } };
}
function bossLabelY() {
  const g = BOSS.g;
  if (!g) return 3.2;
  const box = new THREE.Box3().setFromObject(g);
  return Math.max(2.6, box.max.y + 0.4);
}

/* ---------------- 剩下那几个脚手架（88 招里零散用到） ---------------- */
/* 时间：技能体用 \`TIME.t\` 算相位、也给 nSay 做节流。
 * fx2 内部有一份自己的 TIME，导出成 FX2.time；这里同形状接出来，
 * t 是 getter —— **不要抄一份自己累加**，两边的 dt 夹取规则必须一样。 */
const TIME = {
  get t() { return FX2.time; },
  dt: 0, scale: 1, pause: false
};
function hexs(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
/* 一句话节流（特效台原样）：一拍最多一句，否则连爆会把屏幕刷满。
 * 它调的是 floatText —— 而 floatText 在游戏里是空实现（演示文案不进游戏），
 * 所以这里实际什么也不做。保留结构是为了将来真要接 UI.log 时改一处。 */
function nSay() {
  let last = -9;
  return (pos, txt, hex) => {
    if (TIME.t - last < .34) return;
    last = TIME.t;
    floatText(pos.clone(), txt, hex || '#ff9a6a');
  };
}
/* 「遗忘」那一招要往 UI 的技能槽上挂一个 .off 标记（特效台的做法）。
 * 游戏里技能条不长那样，而且这是首领在放招、不是玩家按技能 —— 空实现。 */
function markForgotten() {}

/* 破防窗口（staggerbreak）读的是「**这只**首领的破绽」。特效台里 curBoss
 * 就是舞台上那条怪的数据：{ stagger: 秒数, weak: 'ice', staggerSkill: 'slam' }。
 * 游戏里对应的是 cfg.stagger = { skill, dur, mul, label } 配上 cfg.weak——
 * **形状不一样**（一个是数字、一个是对象），所以这里用 getter 转一道。
 *
 * 不能写成函数：技能源码写的是 curBoss.stagger（读属性），不是调用；
 * 也不能写成快照：一只在放的时候另一只可能在放别的（三首领同场的地图），
 * 值必须每次读的时候才取 CUR。 */
const curBoss = {
  get stagger() {
    const st = CUR && CUR.cfg && CUR.cfg.stagger;
    if (typeof st === 'number') return st;
    return (st && st.dur) || 3;
  },
  get staggerSkill() {
    const st = CUR && CUR.cfg && CUR.cfg.stagger;
    return (st && st.skill) || 'slam';
  },
  /* 属性洞（−60 的那个元素）。八部 8 只都有；别的首领没有就返回 null，
   * 技能里 if(!weak) return 会自己跳过，不算错。 */
  get weak() { return (CUR && CUR.cfg && CUR.cfg.weak) || null; },
  get mul() {
    const st = CUR && CUR.cfg && CUR.cfg.stagger;
    return (st && st.mul) || 1.5;
  },
};
/* SHARED[...] 在 staggerbreak 里用来取「招牌招」的 hit。
 * 游戏里那张表就是 BOSS_SKILLS（本文件晚于 data-bosskits.js 加载），
 * 不是第二份拷贝 —— 拷贝一份必然会跟生成物走散。 */
const SHARED = BOSS_SKILLS;
/* 玩家最近 3 秒的轨迹。预判类机制（混沌真身·因果 / 无相天魔·镜我）
 * 要读它才知道「你正在往哪去」。由 BossCast.update 每帧填。 */
const S_HIST = [];

/* ---------------- 演示假人的位移 → 真拖拽 ----------------
 * 特效台里假人站着不动，「把假人挪过去」是让画面读出机制的手段。
 * 游戏里玩家的位置由玩家决定，**只有首领的拉拽类机制能移动玩家**。
 *
 * 判据：目标点离玩家 4.5 米以内 = 真的是拽（魂锁、摆渡、吞咽都在 2~3 米）；
 * 更远的一律当成「复位演示」，忽略 —— 那几处写的是 moveDummy(V3(0,0,0))，
 * 照办就是把玩家瞬移回地图中心。 */
function moveDummy(target, dur) {
  const g = CTX.game;
  if (!g || !g.playerGroup || !target) return;
  const p = g.playerGroup.position;
  const d = Math.hypot(target.x - p.x, target.z - p.z);
  if (d < 0.15 || d > 4.5) return;
  g.dragPlayer(target.x, target.z, Math.max(0.2, dur || 0.5));
}
`;

/* ============================================================
 * FOOT —— 手写：选招、施放、生命周期
 * ============================================================ */
const FOOT = `/* ============================================================
 * 选招与施放
 * ------------------------------------------------------------
 * 五格是**功能位**：机制 / 套路 / 套路 / 签名 / 本命。
 * 不随机抽 —— 随机抽就退化成「一堆技能轮流放」，玩家记不住节奏，
 * 也读不出「这只和那只不一样」。规则只有两条：
 *
 *   1. 平时在 机制/套路A/套路B/签名 四格里轮转（顺序固定）；
 *   2. 每第 5 轮出**本命**（第 5 格）。
 *
 * 于是每只 Boss 的节奏都是「四拍 + 一拍压轴」，而四拍的内容
 * 和压轴的内容每只都不同 —— 这正是那一格存在的意义。
 * ============================================================ */
const BossCast = {
  /* 本命每几轮出一次 */
  NATIVE_EVERY: 5,

  bind(Game) {
    CTX.game = Game || null;
    CTX.gen = 0;
    /* fx2 每帧推进 updater 之前把 CUR 切回它自己的主人。
     * 不装这个钩子，两只怪同时在放招时，后放的那只会把前一只的
     * settle 算到自己头上（伤害倍率取错、甚至算到已死的怪身上）。 */
    FX2.stepHook = (own) => { if (own) CUR = own; };
    return this;
  },

  /* 换图 / 脱战 / 重开 */
  clear() {
    CTX.gen++;
    CUR = null;
    if (CTX.game) {
      for (const e of (CTX.game.enemies || [])) {
        if (e._cast) { e._cast = null; e._castUntil = 0; }
      }
    }
  },

  /* ---------------- 每帧 ---------------- */
  update(dt) {
    const g = CTX.game;
    if (!g) return;
    /* 玩家轨迹（预判类机制要读）。采样 20Hz，留 3 秒 —— 跟特效台同一个口径
     * （那边是每 0.05 秒一条、最多 60 条）。 */
    const pg = g.playerGroup;
    if (pg) {
      const last = S_HIST[S_HIST.length - 1];
      if (!last || Math.abs(pg.position.x - last.x) > 0.02 || Math.abs(pg.position.z - last.z) > 0.02) {
        S_HIST.push({ x: pg.position.x, z: pg.position.z });
        if (S_HIST.length > 60) S_HIST.shift();
      }
    }
    /* 施法占用逐帧递减：run() 里的 delay 是异步的，而 BossCast 得知道
     * 「这一招还没放完」—— 不然 CD 一到就会在后面叠第二招，
     * 两只手的动作糊在一起，玩家看到的是「一坨光」。 */
    for (const e of (g.enemies || [])) {
      if (e._castUntil > 0) {
        e._castUntil -= dt;
        if (e._castUntil <= 0) { e._castUntil = 0; e._cast = null; }
      }
    }
  },

  /* ---------------- 这一招要占多久 ----------------
   * data-bosskits 里只有 warm（前摇），没有「总时长」。用前摇 + 一个
   * 跟倍率挂钩的尾巴估：重招（mul ≥ 1）留 2.2 秒，轻招 1.4 秒。
   * 估短的后果是叠招，估长的后果是首领站着发呆 —— 宁可发呆。 */
  _span(sk) {
    const m = (sk && sk.mul != null) ? sk.mul : 1;
    return (sk && sk.warm ? sk.warm : 0.7) + (m >= 1 ? 2.2 : 1.4);
  },

  /* ---------------- 选招 ---------------- */
  _pick(e) {
    const kit = (typeof BOSS_KIT !== 'undefined') ? BOSS_KIT[e.cfg && e.cfg.id] : null;
    if (!kit || !kit.length) return null;
    /* 两个计数器，**不能合成一个**：
     *   _castN  总轮数 —— 只用来判「这一轮是不是压轴」
     *   _round  四拍里的第几拍 —— 只在本命轮之外前进
     * 合成一个的话（第 6 轮 = (6-1)%4 = 1 → 第二拍），本命插进来会把四拍
     * 整体推移一位，玩家记不住、每 5 轮错开一次。这个是测试抓出来的。 */
    const n = (e._castN = (e._castN || 0) + 1);
    if (kit.length >= 5 && n % this.NATIVE_EVERY === 0) return kit[4];
    const pool = kit.length >= 5 ? kit.slice(0, 4) : kit.slice();
    const i = (e._round || 0) % pool.length;
    e._round = (i + 1) % pool.length;
    return pool[i];
  },

  /* ---------------- 能不能出招 ----------------
   * 三道闸：没死 / 没在放 / 玩家在交战半径内。
   * 距离闸在这里再判一次，是因为 game.js 那边判的是「该不该进这个分支」，
   * 而这里判的是「这一发放下去玩家看不看得见」—— 打不到人的技能没有意义。 */
  canCast(e, pp) {
    if (!CTX.game || !e || e.dead || e.wb) return false;
    if (e._castUntil > 0) return false;
    const R = (typeof BALANCE !== 'undefined' && BALANCE.boss && BALANCE.boss.skillRange) || 18;
    if (pp && Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z) > R) return false;
    return true;
  },

  /* ---------------- 出招 ----------------
   * 返回 true 表示「这一发真的放出去了」（game.js 据此决定要不要走老兜底）。 */
  tryCast(e, pp) {
    if (!this.canCast(e, pp)) return false;
    if (typeof BOSS_SKILLS === 'undefined') return false;
    const id = this._pick(e);
    const sk = id ? BOSS_SKILLS[id] : null;
    if (!sk || typeof sk.run !== 'function') {
      console.warn('[BossCast] 查不到这一招：' + id + '（' + (e.cfg && e.cfg.id) + '）');
      return false;
    }
    CUR = e;
    e._cast = { id: id, sk: sk };
    e._castUntil = this._span(sk);
    try {
      sk.run();
    } catch (err) {
      /* 一招炸了不能让整场缺席：记下来、清掉占用，下一轮换别的。
       * 特效台里这招是能跑的，所以这里报错基本等于「脚手架缺件」。 */
      console.error('[BossCast] ' + id + ' 施放失败', err);
      e._castUntil = 0;
      e._cast = null;
      return false;
    }
    /* ---------------- 这一只自己的变形（B24） ----------------
     * 共享池只有 31 招、要撑 180 个格位，所以「树王的砸地」和「石王的砸地」
     * 本来是同一段代码。变形层（src/data/data-bosstwist.js + src/boss-twist.js）
     * 不改共享招本身，改的是**这一只放它的时候多发生什么**。
     * 没写数据的首领这里什么都不做 —— 变形层是可选层，删掉游戏照样跑。
     * 顺序放在 _lift 之前：变形层要按**原始** hit 取落点。 */
    if (typeof BossTwist !== 'undefined' && BossTwist && typeof BossTwist.apply === 'function') {
      try { BossTwist.apply(e, sk, id); } catch (err) { console.warn('[BossCast] 变形层失败 ' + id, err); }
    }
    /* ---------------- 竖向体积兜底 ----------------
     * 2026-11-05 静态统计：88 招里 **63 招一根竖的东西都没有**，
     * 只用 zone / shock / burst / spr / decal —— 46° 俯角下它们全长一样，
     * 都是"一圈不同颜色的圈"。这一层在**命中那一拍**按 hit() 的形状
     * 长出柱子（圆 → 环柱、矩形 → 两侧柱列、扇形 → 前沿柱林、散射 → 每点一根）。
     *
     * 两条例外：
     *   1. 标了 vert 的 25 招自己已经有 column / spikes / boulder / … —— 再长一层是叠，
     *      而且会盖掉它们各自的意思（生成器按源码算这个位，见 build-bosskits）。
     *   2. self 形状没有落点，lift 里本来就不处理。 */
    this._lift(e, sk, id);
    return true;
  },

  /* 竖向体积：单独一个方法，出了事只丢这一层，不影响已经放出去的招 */
  _lift(e, sk, id) {
    if (!(typeof BFX !== 'undefined' && BFX && typeof BFX.lift === 'function')) return;
    if (sk.vert || typeof sk.hit !== 'function') return;
    const warm = sk.warm != null ? sk.warm : .7;
    const glow = (e.cfg && e.cfg.glow) || 0xff8a4c;
    delay(warm, () => {
      try {
        BFX.lift(sk.hit(), { glow, dur: 1.5 });
      } catch (err) {
        console.warn('[BossCast] ' + id + ' 的竖向层没长出来', err);
      }
    });
  },

  /* 调试用：这一轮会放哪一招（面板 / 探针读） */
  peek(e) { return this._pick(e); },
};

/* 给 fx2 的 stepHook 兜底：bind 之前就被调用也不会炸 */
if (typeof FX2 !== 'undefined' && FX2 && !FX2.stepHook) FX2.stepHook = null;
`;

const out = build();
const mode = process.argv[2] || '';

if (mode === '--check') {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('✗ src/boss-cast.js 与特效台不一致（特效台改过但没重新生成）');
    console.error('  修：node dev/build-bosscast.js --write');
    process.exit(1);
  }
  console.log('✓ src/boss-cast.js 与特效台一致（' + out.split('\n').length + ' 行）');
} else if (mode === '--write') {
  fs.writeFileSync(OUT, out);
  console.log('✓ 已重写 src/boss-cast.js（' + out.split('\n').length + ' 行 / ' +
    (out.length / 1024).toFixed(1) + ' KB）');
} else {
  process.stdout.write(out);
}
