#!/usr/bin/env node
/* ============================================================
 * dev/build-skillvfx.js —— 从技能特效实验室抽出整套技能演出，生成 src/sfx.js
 *
 *   为什么是「生成」而不是手抄：
 *   这 37 只技能的手感（斧头必须同水平面、尾焰必须是水平扇形、蛛网单点放射…）
 *   全在 `docs/vfx-playground.html` 里调出来的，改一次要反复看两边。
 *   手抄一份进 src/ 之后两边必然走散 —— 这一轮就是这么走散的：
 *   实验室里旋风斩已经换成 spinBlades，游戏里还留着 `arc tilt:0.35` 的旧版，
 *   而且没人发现。
 *
 *   所以：**实验室是唯一的源**，`src/sfx.js` 是生成物。
 *   改特效的流程：改实验室 → 在实验室里看对了 → 跑本脚本 --write → 提交两个文件。
 *
 *   和另外两个生成器的分工：
 *     build-fx2.js       → src/fx2.js（怪物侧 BFX 17 原语）
 *     build-bosskits.js  → src/data/data-bosskits.js（Boss 88 招）
 *     build-skillvfx.js  → src/sfx.js（玩家侧 37 只技能的整套演出）← 本文件
 *
 * 用法：
 *   node dev/build-skillvfx.js            # 打印统计（默认，不写文件）
 *   node dev/build-skillvfx.js --check    # 只检查 src/sfx.js 是否过期（过期退出码 1）
 *   node dev/build-skillvfx.js --write    # 重写 src/sfx.js
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'vfx-playground.html');
const OUT = path.join(ROOT, 'src', 'sfx.js');

/* ---------------- 取实验室的逻辑脚本 ----------------
 * 页面里有两个 <script>：#0 是内联的 three.js，#1 才是实验室自己的代码。
 * 锚点取「第二个 script 标签」，不按行号 —— 页面里换个贴图函数就会全错。 */
function readPlayground() {
  const html = fs.readFileSync(SRC, 'utf8');
  const first = html.indexOf('</script>');
  if (first < 0) throw new Error('实验室里找不到 </script>');
  const a = html.indexOf('<script>', first);
  if (a < 0) throw new Error('实验室里找不到第二个 <script>');
  const b = html.indexOf('</script>', a);
  if (b < 0) throw new Error('第二个 <script> 没闭合');
  return html.slice(a + '<script>'.length, b);
}

/* ---------------- 锚点对齐 ----------------
 * 切片和抽取都只写「行内独有文字」，不写 ==== 那种分隔线 ——
 * 分隔线的等号个数是手写的，改一次数量就全挂。
 *
 * 找到文字之后要**向前对齐到最近的注释开头**，否则切出来的第一行是注释正文、
 * 结尾孤零零一个收尾符号，整段语法就废了。 */
function snapToCommentStart(src, i, lo) {
  const near = src.lastIndexOf('/*', i);
  if (near >= 0 && i - near < 400 && near >= (lo || 0)) return near;
  const nl = src.lastIndexOf('\n', i);
  return nl + 1;
}

/* ---------------- 切片表 ----------------
 * 刻意**不切**的段（理由统一写在这里）：
 *   「4. 场地 / 角色 / 木人桩」   → 游戏有自己的玩家与敌人
 *   「shake/hitstop/flashAt/hurtVignette/damageNumber」→ 接游戏本来那套
 *   「7. 命中判定 hitEnemy/hitArea/killEnemy」→ 伤害归 game.js，这里只画
 *   「模型台 STAGE」              → 实验室的审视镜头，游戏里没有这东西
 *   「9~13 旧实现 / Buff / 技能栏 / 面板 / 主循环」→ 全是实验室的演示外壳
 */
const CUTS = [
  {
    name: '程序化贴图',
    from: '   1. 程序化贴图（不引入任何素材文件）',
    to: '   2. 粒子池（单贴图 = 单材质 = 一批 draw call）',
  },
  {
    name: '粒子池',
    from: '   2. 粒子池（单贴图 = 单材质 = 一批 draw call）',
    to: '   3. 时间 / 更新队列 / 屏幕反馈',
  },
  {
    /* 只到 shake 之前：shake / hitstop / flashAt / hurtVignette / damageNumber
     * 在实验室里直接操作 DOM（flashEl / vigEl / floatsEl），游戏里对应的是
     * Game.shake / FX.text / 受伤红晕那套 —— 由桥接层重新实现。 */
    name: '时间与更新队列',
    from: '   3. 时间 / 更新队列 / 屏幕反馈',
    to: 'function shake(amp, dur = 0.3){',
  },
  {
    name: '元素语言',
    from: '   5. 元素语言（只管色 + 贴图 + 重力，不管形）',
    to: '   6. FXKit v2',
  },
  {
    /* 16 个原语 + 斧头几何 + 元素反应表 + 领域剪影。
     * 这一段末尾定义着 Q()（画质档），所以终点落在「7. 命中判定」之前。 */
    name: '原语层',
    from: 'const FX = {};',
    to: '   7. 命中判定 / 木人桩反应',
  },
  {
    /* 弹道原语在「7. 命中判定」那一段的**中间**（命中判定函数与灵兽模型之间），
     * 单独切一刀。火球 / 冰锥 / 符箓都靠它飞出去，漏了就是
     * 「FX.projectile is not a function」—— 而那 4 只是法师最常用的。 */
    name: '投射物原语',
    from: 'FX.projectile = function(',
    to: 'const ctxOf = (aim)',
  },
  {
    /* 召唤技能要真模型（灵兽 / 白虎 / 青龙）。终点停在「模型台」之前。 */
    name: '灵兽模型库',
    from: 'const BEAST_KINDS = {',
    to: '   模型台：把三种召唤物摆到台面上「近距审视」',
  },
  {
    name: '火柱原语',
    from: 'function fxFlameColumn(',
    to: 'function spinPlayer(',
  },
];

/* ---------------- 技能表：三块，加起来 37 只 ----------------
 * 主表 15 只（重构后的 15 个功能位）+ BATCH1 追加 15 只（刀客其余 7 + 法师其余 8）
 * + BATCH2 追加 7 只（道士其余 7）。后两块是同一个对象的续写，各扫一遍。 */
const SKILL_BLOCKS = [
  { name: '主表', from: 'const SKILLS = {', to: '   9. 旧实现' },
  { name: 'BATCH1', from: 'BATCH1_MARK', to: 'BATCH2_MARK' },
  { name: 'BATCH2', from: 'BATCH2_MARK', to: 'SLOT_FORMS' },
];

/* ---------------- 实验室名 → 游戏技能 id ----------------
 * 37 只里有 33 只同名，剩下 4 只实验室用的是**功能位的口语名**，
 * 游戏用的是 data-skills.js 里的正式 id。不映射的后果不是报错，是**静默不播**
 * （play() 找不到 key 就返回 false）—— 又是最难查的那种。
 *
 * 判据不是名字像不像，是「职业 + 功能位」对得上：
 *   swords  blade③ 剑阵      → swordarray
 *   stance  blade⑤ 兵形      → avatar        （游戏的 avatar 就是刀客⑤）
 *   avatar  mage ⑤ 元素法相  → elementavatar （游戏的元素法相是另一个 id）
 *   missile mage ① 元素飞弹  → fireball
 *   rain    tao  ② 万剑归宗  → swordrain
 */
const ALIAS = {
  swords: 'swordarray',
  stance: 'avatar',
  avatar: 'elementavatar',
  missile: 'fireball',
  rain: 'swordrain',
};

/* ---------------- 大括号配对 ----------------
 * 要跳过字符串 / 模板串 / 注释，否则 note 里的一个右花括号就会让配对提前结束。
 * 实验室的 note 里确实有花括号说明，必须跳过。 */
function matchBrace(src, open) {
  let depth = 0;
  let i = open;
  let mode = null;
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (mode === 'line') { if (ch === '\n') mode = null; i++; continue; }
    if (mode === 'block') { if (ch === '*' && nx === '/') { mode = null; i += 2; continue; } i++; continue; }
    if (mode === 'str') {
      if (ch === '\\') { i += 2; continue; }
      if (ch === mode) mode = null;
      i++; continue;
    }
    if (ch === '/' && nx === '/') { mode = 'line'; i += 2; continue; }
    if (ch === '/' && nx === '*') { mode = 'block'; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { mode = ch; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/* 从技能块里抽出每只的 v2(c){ ... }。
 *
 * 只抽函数体，不抽 note / name —— 那些是实验室面板的文案，游戏里技能名与说明
 * 另有出处（data-skills.js），抄过来就变成第二份真相。
 *
 * 判据是「条目开头 200 字内有 cls:」而不是缩进：实验室里技能条目写在**行首**
 * （零缩进），而条目内部的对象字面量是缩进的，靠缩进分不开。 */
function extractSkills(src, block) {
  const out = {};
  const start = src.indexOf(block.from);
  if (start < 0) throw new Error('找不到技能块起点：' + block.name);
  const end = src.indexOf(block.to, start + block.from.length);
  if (end < 0) throw new Error('找不到技能块终点：' + block.name);
  const body = src.slice(start, end);

  const entryRe = /(?:^|\n)[ \t]*([a-z][\w]*)[ \t]*:[ \t]*\{/g;
  let m;
  while ((m = entryRe.exec(body))) {
    const key = m[1];
    const open = body.indexOf('{', m.index + m[0].length - 1);
    if (open < 0) continue;
    const close = matchBrace(body, open);
    if (close < 0) throw new Error('技能 ' + key + ' 的大括号没配上');
    const entry = body.slice(open, close + 1);
    /* 不是技能条目（缺 cls）就跳过，同时把扫描位置推到条目之后，
     * 免得继续匹配到它内部的字面量 */
    if (!/\bcls\s*:/.test(entry.slice(0, 200))) {
      entryRe.lastIndex = m.index + m[0].length;
      continue;
    }

    const v2 = /\bv2\s*\(\s*([\w$]+)\s*\)\s*\{/.exec(entry);
    if (!v2) { entryRe.lastIndex = close; continue; }
    const fOpen = entry.indexOf('{', v2.index + v2[0].length - 1);
    const fClose = matchBrace(entry, fOpen);
    if (fClose < 0) throw new Error('技能 ' + key + ' 的 v2 括号没配上');
    out[key] = 'function(' + v2[1] + ') {' + rewrite(entry.slice(fOpen + 1, fClose)) + '\n    }';
    entryRe.lastIndex = close;
  }
  return out;
}

/* ---------------- 宿主符号改写 ----------------
 * 切过来的代码原样引用实验室的全局：scene / camera / renderer / playerBody /
 * playerRing / P / enemies。这些在游戏里分别对应别的对象，一律改写成桥接层
 * 暴露的 ROOT / CAM / REN / ACT.*。
 *
 * 用「词边界 + 前面不能是点」替换：直接 string.replace 会让 P. 撞 POINT_VS、
 * scene 撞 SCENE_XXX 之类的名字。 */
function rewrite(code) {
  return code
    .replace(/(?<![\w.$])scene(?![\w$])/g, 'ROOT')
    .replace(/(?<![\w.$])camera(?![\w$])/g, 'CAM')
    .replace(/(?<![\w.$])renderer(?![\w$])/g, 'REN')
    .replace(/(?<![\w.$])playerBody(?![\w$])/g, 'ACT.playerBody')
    .replace(/(?<![\w.$])playerRing(?![\w$])/g, 'ACT.playerRing')
    .replace(/(?<![\w.$])enemies(?![\w$])/g, 'ACT.enemies')
    .replace(/(?<![\w.$])P\./g, 'ACT.player.')
    .replace(
      'ACT.playerBody.userData.armPivot.add(enchantMesh)',
      '(ACT.playerBody.userData.armPivot || ACT.playerBody).add(enchantMesh)'
    )
    .replace(
      'U.scale.value = REN.domElement.height * 0.5;',
      'U.scale.value = (REN && REN.domElement ? REN.domElement.height : 800) * 0.5;'
    );
}

function sliceCut(src, cut) {
  const i = src.indexOf(cut.from);
  if (i < 0) throw new Error('找不到起点锚点（' + cut.name + '）：' + cut.from);
  const j = src.indexOf(cut.to, i + cut.from.length);
  if (j < 0) throw new Error('找不到终点锚点（' + cut.name + '）：' + cut.to);
  const a = snapToCommentStart(src, i, 0);
  const b = snapToCommentStart(src, j, a);
  if (b <= a) throw new Error('切片为空：' + cut.name);
  return rewrite(src.slice(a, b).replace(/\s+$/, ''));
}

/* ============================================================
 * 桥接层（手写，不来自实验室）
 * 只做三件事：换宿主对象 / 喂玩家与敌人 / 把碰 DOM 与碰伤害的函数改写掉
 * ============================================================ */
const HEAD = `/* ============================================================
 * SFX —— 玩家侧技能演出（37 只技能的整套画法）
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = \`docs/vfx-playground.html\`（那边 37 只技能可以一只一只真放一遍看）
 *   重新生成：\`node dev/build-skillvfx.js --write\`；只检查是否过期：\`--check\`
 *
 * ---------------- 为什么是生成物 ----------------
 * 这一轮「技能重构特效没替换」的根因就是：实验室里调好的效果，和游戏里跑的是
 * 两份互不相干的代码（实验室自绘一套 FX，游戏读 data-vfx 的配方）。
 * 手抄一份进 src/ 一定还会走散，所以：**实验室是唯一的源**。
 *
 * ---------------- 和配方层（data-vfx / vfx.js）的分工 ----------------
 *   data-vfx.js + vfx.js —— 「形色时分离」的 15 条剪影 × 6 元素，覆盖 15 个功能位
 *   sfx.js（本文件）     —— 37 只技能的**逐只手搓实现**，能表达配方表达不了的东西
 *                          （斧头同水平面、尾焰是水平扇形、蛛网单点放射…）
 * 接线口径在 game.js 的 playSkillVfx：**sfx 有就播 sfx，没有才回落到配方**。
 * 这样 37 只全部走新实现，而秘技 / 没有手搓实现的技能仍然有配方兜底。
 *
 * ---------------- 宿主怎么接（只有四件事） ----------------
 *   SKFX.bind(scene, camera, renderer)      开局一次
 *   SKFX.sync(playerPos, face, enemies, playerBody, playerRing)  每帧
 *   SKFX.update(dt)                         每帧（dt 是**秒**）
 *   SKFX.play(key, ctx)                     放一招；ctx = { x, z, aim, dir, tx, tz }
 *   SKFX.clear()                            换图 / 重开
 *
 * ---------------- 三条纪律（跟 fx2.js 同源） ----------------
 * 1. 不逐帧 new：颜色 / 向量有缓存，粒子池创建时分配好。
 * 2. 材质按需建、随 mesh 释放；共享几何体打 userData.shared 不释放。
 * 3. 所有 mesh 挂在 SFX 自己的 Group 下 —— clear() 才可能真清干净。
 * ============================================================ */
'use strict';

const SKFX = (function () {
  /* ---------------- 宿主 ---------------- */
  let REN = null;
  let CAM = null;
  const ROOT = new THREE.Group();
  ROOT.name = 'sfx';

  /* 抽出来的代码写的是 ROOT.add(...)，但 clear() 还得知道都加了什么，
   * 否则只能清 updater，mesh 会永远留在场上（fx2 踩过一次）。 */
  const _live = [];
  const _rootAdd = ROOT.add.bind(ROOT);
  const _rootRemove = ROOT.remove.bind(ROOT);
  ROOT.add = function (o) { _rootAdd(o); if (!o.userData.shared && _live.indexOf(o) < 0) _live.push(o); return o; };
  ROOT.remove = function (o) { _rootRemove(o); const i = _live.indexOf(o); if (i >= 0) _live.splice(i, 1); return o; };

  /* 每帧由 sync() 填。实验室里这三样是模块级全局，游戏里必须由外面喂进来。 */
  const ACT = {
    player: { pos: new THREE.Vector3(), face: 0, moving: 0, target: new THREE.Vector3() },
    playerBody: null,
    playerRing: null,
    enemies: []
  };

  /* 实验室的 now（秒，单调递增）。技能实现里有几处用它算相位。 */
  let now = 0;

  /* 实验室的几样「演示状态」。技能代码会读它们：
   *   tierOn(n)          —— 台阶：「到了这一级才画」
   *   playerHP / avatarOn —— 回血与法相窗口
   * 游戏里这些状态都有自己的出处（Game.skillLevel / Game.hp / 法相窗口计时），
   * 每发 play() 时同步进来，**不在这里记账**。
   * （curElem / curElem2 由下面的「元素语言」段自带声明，不在这里重复） */
  let playerHP = 1000;      /* 只在实验室里真回血；游戏里回血由 game.js 结算 */
  let avatarOn = false;     /* 法相窗口开着没有 */
  let _curLv = 1;           /* 本发技能的等级（tierOn 读它） */
  let stanceIdx = 0;        /* 刀式（0 斩锋 / 1 镇岳 / 2 摧城），由 Game.bladeStance() 同步 */
`;

const BRIDGE = `/* ============================================================
 * 桥接：实验室里「碰 DOM / 碰伤害」的那几个函数
 *
 * 切过来的技能代码会调它们，而它们的定义都在被跳过的段里。语义按游戏走：
 *   伤害一律**不在这里算** —— 判定与扣血是 game.js 的事，
 *   这里只负责「打中的那一下看起来像打中了」。
 * ============================================================ */

function shake(amp, dur) {
  const G = (typeof Game !== 'undefined') ? Game : null;
  if (G && typeof G.shake === 'number') G.shake = Math.max(G.shake, amp || 0.2);
}
/* 顿帧由游戏主循环自己管；这里再动 TIME.scale 会互相打架 */
function hitstop(sec) {}
/* 全屏闪光：游戏侧明令禁止（见 vfx.js 第 5 节），不另起一层 */
function flashAt(worldPos, radius, color, peak) {}
function hurtVignette() {}
/* 飘字走游戏自己的 FX.text（数字样式已统一） */
function damageNumber(pos, value, color, crit) {
  if (typeof FX !== 'undefined' && FX && typeof FX.text === 'function' && pos) {
    FX.text(new THREE.Vector3(pos.x, (pos.y || 0) + 2.2, pos.z),
      Math.round(value), color || '#fff', !!crit);
  }
}
/* 命中判定：**不做伤害**。实验室里这两个会扣木人桩的血并打飞字，
 * 游戏里由 game.js 的 rollDamage / damageEnemy 负责。
 * 留成返回 0 的空实现，是为了让切过来的代码原样跑（它只是想在命中点补几颗粒子）。 */
function hitArea(pos, radius, dmg, o) { return 0; }
function hitEnemy(e, dmg, o) { return 0; }
function killEnemy(e) {}

/* 画质档：游戏有 FX.q（低画质时原语自己降级），保持一致 */
function Q() {
  return (typeof FX !== 'undefined' && FX && FX.q) ? FX.q : 1;
}

/* 提示条：游戏有自己的 toast 节流与样式，特效层不抢这个口 */
function toast(msg) {}
/* Buff 图标行：游戏用 statusBuffs 那套，特效层只负责画，不记账 */
function addBuff(key, dur, stacks) {}
function removeBuff(key) {}

/* 台阶：实验室里是「面板上选到第几档」，游戏里就是**这一发技能的等级**。
 * 两处用法语义一致（whirl 的 Lv9 吸怪、poison 的 Lv5 范围）：
 * 到了这一级才画。不读 Game 直接读 _curLv，是为了数组里 37 只共用一份。 */
function tierOn(n) { return _curLv >= (n | 0); }

/* 实验室的三个「演示动作」：转圈 / 挥臂 / 前冲。
 * 游戏里玩家有真实的动作与物理位移，这三样**绝不能**由特效层代劳 ——
 * 转圈会把玩家朝向改掉（P.face），前冲会把位置改掉（lerp 到别处），
 * 挥臂要改模型关节而游戏的角色是 charforge 拼的、没有那个 pivot。
 * 所以一律空实现：动作交给游戏，特效只画。 */
function spinPlayer(dur, speed) {}
function swingArm() {}
function lunge(dist) {}
`;

const TAIL = `
  /* ============================================================
   * 技能表：37 只 —— 与实验室 SKILLS[key].v2(c) 一一对应
   * 生成自 docs/vfx-playground.html，**别手改**
   * ============================================================ */
  const SKILL_FX = {`;

const AFTER = `  };

  /* ============================================================
   * 每帧推进：更新队列 + 粒子池 + 贴花淡出
   *
   * 和实验室 simulate() 里那三段的写法一致，但去掉了玩家移动 / 木人桩反应 /
   * 镜头跟随 —— 那些是游戏主循环的事。
   * ============================================================ */
  function update(raw) {
    const dt = Math.min(0.05, Math.max(0, Number(raw) || 0));
    now += dt;
    const stopping = TIME.stop > 0;
    if (stopping) TIME.stop -= dt;
    const step = TIME.pause ? 0 : (stopping ? 0 : dt * TIME.scale);

    for (let i = updaters.length - 1; i >= 0; i--) {
      const u = updaters[i];
      if (u.dead) { updaters.splice(i, 1); continue; }
      u.update(step);
      if (u.dead) updaters.splice(i, 1);
    }
    for (const k in POOLS) POOLS[k].update(step);

    const list = (typeof DECAL !== 'undefined' && DECAL.list) ? DECAL.list : [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d && d.life >= 0 && d.m && d.m.visible) {
        d.life += step;
        const k = d.life / d.max;
        if (k >= 1) d.m.visible = false;
        else d.m.material.opacity = Math.min(1, (1 - k) * 1.6) * 0.92 * Math.min(1, d.life * 6);
      }
    }
  }

  /* 每帧同步：玩家位置 / 朝向 / 敌人列表。
   * 敌人**只读**（技能要「吸怪」「连锁」时找最近的几只），不写。 */
  function sync(playerPos, face, enemies, playerBody, playerRing) {
    if (playerPos) {
      ACT.player.pos.copy(playerPos);
      ACT.player.target.copy(playerPos);
    }
    if (typeof face === 'number') ACT.player.face = face;
    ACT.enemies = Array.isArray(enemies) ? enemies : [];
    if (playerBody) ACT.playerBody = playerBody;
    if (playerRing) ACT.playerRing = playerRing;
  }

  function bind(scene, camera, renderer) {
    REN = renderer || null;
    CAM = camera || new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    if (scene && ROOT.parent !== scene) scene.add(ROOT);
    if (REN && REN.domElement) U.scale.value = REN.domElement.height * 0.5;
  }

  /* 放一招：实验室 playSkill(key, ctx) 的等价物。
   * 只放**本体**，不叠台阶 / 连携 —— 那两样游戏有自己的体系
   * （台阶走 effSkillMods / SKILL_TIER_EVO，连携走职业核心机制），
   * 在这里再叠一遍就是双播。 */
  function play(key, ctx) {
    const fn = SKILL_FX[key];
    if (typeof fn !== 'function') return false;
    /* 发前同步两样状态：
     *   等级 —— 台阶（tierOn）认「这一发是几级」，用游戏的有效等级
     *   元素 —— 染色认「这一发注了什么」，用游戏的注入包（key / sub）
     * 都是**读**，不改游戏状态。 */
    const G = (typeof Game !== 'undefined') ? Game : null;
    _curLv = (G && typeof G.skillLevel === 'function') ? (Number(G.skillLevel(key)) || 1) : 1;
    const em = (G && G._elem) ? G._elem : null;
    curElem = (em && em.key) || 'phys';
    curElem2 = (em && em.sub) || '';
    stanceIdx = (G && typeof G.bladeStance === 'function') ? (Number(G.bladeStance()) || 0) : 0;
    try {
      fn(ctx || {});
      return true;
    } catch (e) {
      /* 特效不该把主循环带崩 —— 但也不能静默：留一条日志，探针能抓到 */
      console.error('[SFX] ' + key + ' 播放失败: ' + (e && (e.stack || e.message)));
      return false;
    }
  }

  function clear() {
    for (let i = 0; i < _live.length; i++) {
      const m = _live[i];
      if (m.parent) _rootRemove(m);
      if (m.geometry && !m.userData.shared && m.geometry.dispose) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(x => x && x.dispose && x.dispose());
        else if (m.material.dispose) m.material.dispose();
      }
    }
    _live.length = 0;
    updaters.length = 0;
    for (const k in POOLS) POOLS[k].update(999);
    /* 贴花是**预分配的 18 个 mesh 的池**，不是"用过的列表" ——
     * 把数组清空会让下一次 FX.decal 拿到 undefined（实测崩在这里）。
     * 只能把每个位藏起来 + 归零寿命，池子本身留着。 */
    if (typeof DECAL !== 'undefined' && DECAL.list) {
      for (let i = 0; i < DECAL.list.length; i++) {
        const d = DECAL.list[i];
        if (d && d.m) d.m.visible = false;
        if (d) d.life = 0;
      }
      DECAL.i = 0;
    }
    TIME.stop = 0;
    now = 0;
  }

  function keys() { return Object.keys(SKILL_FX); }

  /* 这只技能有没有手搓实现。game.js 的 playSkillVfx 靠它决定走新层还是回落配方，
   * 所以必须是**同步、无副作用**的判断（探针也会调它）。 */
  function has(key) { return typeof SKILL_FX[key] === 'function'; }

  /* 探针读数。数**真活着**的，不数缓存：Pool.alive 是上一帧算的，
   * 刚 spawn 完读它永远是 0，会让人以为「放了但没出」。 */
  function stats() {
    let n = 0, u = 0;
    for (const k in POOLS) {
      const p = POOLS[k].p;
      for (let i = 0; i < p.length; i++) if (p[i].live) n++;
    }
    for (let i = 0; i < updaters.length; i++) if (!updaters[i].dead) u++;
    return { particles: n, updaters: u, meshes: _live.length };
  }

  return {
    bind, update, sync, play, clear, keys, has, stats,
    get scene() { return ROOT; },
    get active() { return _live.length; },
    get updaters() { return updaters.length; }
  };
})();
`;

/* ---------------- 组装 ---------------- */
function build() {
  const src = readPlayground();
  const parts = [];
  for (const cut of CUTS) parts.push('/* ===== ' + cut.name + ' ===== */\n' + sliceCut(src, cut));

  const skills = {};
  const order = [];
  for (const blk of SKILL_BLOCKS) {
    const got = extractSkills(src, blk);
    for (const k of Object.keys(got)) {
      const id = ALIAS[k] || k;
      if (skills[id]) continue;
      skills[id] = got[k];
      order.push(id);
    }
  }

  const skillCode = order
    .map(k => '\n    ' + JSON.stringify(k) + ': ' + skills[k] + ',')
    .join('');

  return {
    code: HEAD + parts.join('\n\n') + '\n\n' + BRIDGE + TAIL + skillCode + '\n' + AFTER,
    order,
    bytes: parts.reduce((a, p) => a + p.length, 0)
  };
}

/* ---------------- 入口 ---------------- */
function main() {
  const argv = process.argv.slice(2);
  const { code, order, bytes } = build();

  if (argv.includes('--check')) {
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (old !== code) {
      console.error('✗ src/sfx.js 与实验室不一致（改过实验室没跑 --write，或改过生成物）');
      process.exit(1);
    }
    console.log('✓ src/sfx.js 是最新的（' + order.length + ' 只技能）');
    return;
  }

  if (argv.includes('--write')) {
    fs.writeFileSync(OUT, code, 'utf8');
    console.log('✓ 写入 src/sfx.js  ' + Math.round(code.length / 1024) + ' KB（切片 ' + Math.round(bytes / 1024) + ' KB）');
    console.log('  技能 ' + order.length + ' 只：' + order.join(' '));
    return;
  }

  console.log('技能 ' + order.length + ' 只：');
  console.log('  ' + order.join(' '));
  console.log('切片 ' + Math.round(bytes / 1024) + ' KB → 成品 ' + Math.round(code.length / 1024) + ' KB（未写入）');
}

main();
