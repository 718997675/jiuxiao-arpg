#!/usr/bin/env node
/* ============================================================
 * 技能 P5b 真机探针：配方在**真实施法路径**上真的被调到
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p5b.js
 *
 * 契约（test-skill-p5b）证明的是「源码里写了 playSkillVfx、旁边没有双播」；
 * 这一份证明的是**从 `castSkill` 按下去那一刻起，那一行真的被执行了**，
 * 而且参数是分开的（起手不含命中 / 命中落在弹道终点 / 三只灵兽三色）。
 *
 * 为什么不能只靠契约：`playSkillVfx` 可能被写在某个**永远走不到的分支**里
 * （变体 / 台阶 / 提前 return），源码 grep 一样是绿的。只有真按一次才知道。
 *
 * 量五件事：
 *   1. 29 只技能按下去都调到 playSkillVfx，且 id 传的是自己
 *   2. 火球的起手帧**不含命中段**（否则爆炸会出现在施法者脚下）
 *   3. 火球命中时，命中段落在**敌人身上**而不是施法点（端到端弹道）
 *   4. 三只灵兽的起手色互不相同（同一条剪影靠色区分）
 *   5. 全程零控制台报错
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
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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

  /* 施法环境：满资源 / 无冷却 / 已解锁 / 落点就在身前 4 码。
   *
   * `__wipe()` 是**每一发之前**必须做的隔离：上一发留下的 `setInterval`
   * （雷云 / 毒雾 / 剑雨 / 符雨）和还在飞的弹道，会在下一发的窗口里继续
   * 调 `playSkillVfx` —— 不隔离的话「这一发播了几次」全是别人的账。
   * 换图编号 +1 会让所有 `if (this.mapGen !== gen) return` 的循环自己退场。 */
  await p.evaluate(() => {
    window.__mkEnv = () => {
      Game.state.mp = 999999;
      Game.state.hp = Game.state.hpMax;
      Game.cooldowns = {};
      Game._autoCast = false; Game._freeCast = false;
      Game._drainOn = null; Game._recharge = null;
      Game.running = true; Game.dead = false;
      Game.attacking = 0;
      Game.mobCap = 200;
      /* 无敌：刷出来的怪会咬人，被咬会触发**反击**（`riposte`）——
       * 那是另一只技能在施法，会把它的 playSkillVfx 记到当前这一发头上。 */
      Game.invuln = 999;
      const pp = Game.playerGroup.position;
      Game.aimPoint = new THREE.Vector3(pp.x, 0, pp.z + 2.5);
      Game.aimDir = new THREE.Vector3(0, 0, 1);
      Game.lastMoveDir = { x: 0, z: 1 };
    };
    window.__wipe = () => {
      Game.mapGen = (Game.mapGen || 0) + 1;
      if (Game.enemies) Game.enemies.length = 0;
    };
    window.__spawn = (dz) => {
      const kind = Object.keys(MONSTERS)[0];
      const pp = Game.playerGroup.position;
      const e = Game.spawnEnemy(kind, pp.x, pp.z + (dz === undefined ? 2.2 : dz));
      return e;
    };
    window.__mkEnv();
  });

  /* ---------------- 一、29 只技能都调到 ---------------- */
  console.log('一、29 只技能在真实施法路径上都调到了 playSkillVfx');
  const CASES = [
    'whirl', 'thrust', 'execute', 'leap', 'swordarray', 'skysfall', 'quake',
    'elementavatar', 'fireball', 'frostnova', 'chain', 'meteor', 'iceshield', 'starfall',
    'iceshard', 'blizzard', 'firewall', 'pyroclasm', 'thundercloud', 'judgement',
    'talisman', 'talismanarrow', 'mastersigil', 'summon', 'whitetiger', 'azuredragon',
    'heal', 'poison', 'swordrain'
  ];
  /* 命中在 setTimeout / telegraph 里的几只，窗口要留够 —— 420ms 只够看起手 */
  const WAIT = { skysfall: 1600, meteor: 1500, starfall: 1700, judgement: 1200, leap: 650, thrust: 650 };
  {
    const rows = await p.evaluate(async (ids, waits) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const oldUnlock = Game.skillUnlocked;
      Game.skillUnlocked = () => true;      // 探针要的是「调没调到」，不是「解锁没有」
      const oldVfx = Game.playSkillVfx;
      const out = [];
      for (const id of ids) {
        window.__wipe();
        window.__mkEnv();
        const foe = window.__spawn(2.2);     // 处决 / 突刺要有个目标，否则走的是挥空分支
        const calls = [];
        Game.playSkillVfx = function (sid, opts) {
          calls.push({ sid: sid, seg: (opts && opts.segments) || null });
          return oldVfx.call(this, sid, opts);
        };
        Game.state.skills = {}; Game.state.skills[id] = { lv: 10 };
        try { Game.recalc(); } catch (e) { }
        window.__mkEnv();
        let err = null;
        try { Game.castSkill(id); } catch (e) { err = String(e && e.message || e); }
        await wait(waits[id] || 450);
        out.push({ id: id, n: calls.length, ids: calls.map(c => c.sid), err: err,
          segs: calls.map(c => c.seg) });
        if (foe) foe.dead = true;
      }
      Game.playSkillVfx = oldVfx;
      Game.skillUnlocked = oldUnlock;
      return out;
    }, CASES, WAIT);

    const silent = rows.filter(r => r.n === 0);
    ok(silent.length === 0, '没有「按下去一声不响」的技能', silent.map(r => r.id));
    /* 只要求「自己出现过一次」：弹道 / 领域类会在命中、每跳时再调几次，
     * 那些是**同一只技能**的后续，不该被当成张冠李戴。
     * 白虎 / 青龙是个例外：它们和召狼共用 ⑤ 号位的 `summon` 剪影（§3 形色分离），
     * 传的是位名而不是自己的 id —— 那正是「按功能位解析」要的样子。 */
    const ALIAS = { whitetiger: 'summon', azuredragon: 'summon' };
    const missed = rows.filter(r => {
      const want = ALIAS[r.id] || r.id;
      return r.ids.indexOf(want) < 0;
    });
    ok(missed.length === 0, '每一只都用自己（或本位的）id 调过一次', missed.map(r => [r.id, r.ids]));
    const boom = rows.filter(r => r.err);
    ok(boom.length === 0, '施法过程没有抛异常', boom.map(r => [r.id, r.err]));
    console.log('    （' + rows.reduce((a, r) => a + r.n, 0) + ' 次 playSkillVfx，覆盖 '
      + rows.filter(r => r.n > 0).length + '/' + rows.length + ' 只技能）');
  }

  /* ---------------- 二、起手帧不含命中段 ---------------- */
  console.log('二、火球：起手帧不含命中段');
  {
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      window.__wipe();
      window.__mkEnv();
      const oldVfx = Game.playSkillVfx;
      const calls = [];
      Game.playSkillVfx = function (sid, opts) {
        calls.push({ seg: (opts && opts.segments) || null, x: opts.pos.x, z: opts.pos.z });
        return oldVfx.call(this, sid, opts);
      };
      Game.state.skills = { fireball: { lv: 1 } };
      try { Game.recalc(); } catch (e) { }
      window.__mkEnv();
      const pp = Game.playerGroup.position;
      const p0 = { x: pp.x, z: pp.z };
      Game.castSkill('fireball');
      await wait(60);
      const atCast = calls.slice();
      Game.playSkillVfx = oldVfx;
      return { atCast: atCast, p0: p0 };
    });
    const first = r.atCast[0];
    ok(!!first, '施法那一帧调到了 playSkillVfx');
    ok(!!first && Array.isArray(first.seg) && first.seg.indexOf('impact') < 0,
      '起手那一发的 segments 里**没有** impact', first && first.seg);
    ok(!!first && first.seg && first.seg.indexOf('cast') >= 0,
      '起手那一发里有 cast', first && first.seg);
  }

  /* ---------------- 三、命中段落在敌人身上 ---------------- */
  console.log('三、火球：命中段落在弹道终点（不是施法者脚下）');
  {
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      window.__wipe();
      window.__mkEnv();
      const pp = Game.playerGroup.position;
      const target = new THREE.Vector3(pp.x, 0, pp.z + 4);
      /* 用**真的**怪（`spawnEnemy`）而不是手搓的假对象：假对象缺字段会让
       * 主循环每帧抛异常（`Cannot read properties of undefined (reading 'time')`），
       * 而抛异常的那一帧里弹道**根本不会推进** —— 于是「打不中」是假象。
       * 只把 `damageEnemy` 换成空函数，保证它挨了也不死。 */
      const oldHit = Game.damageEnemy;
      Game.damageEnemy = () => { };
      const foe = Game.spawnEnemy(Object.keys(MONSTERS)[0], target.x, target.z);
      const oldVfx = Game.playSkillVfx;
      const impacts = [];
      Game.playSkillVfx = function (sid, opts) {
        if (opts && opts.segments && opts.segments.indexOf('impact') >= 0) {
          impacts.push({ x: opts.pos.x, z: opts.pos.z });
        }
        return oldVfx.call(this, sid, opts);
      };
      Game.state.skills = { fireball: { lv: 1 } };
      try { Game.recalc(); } catch (e) { }
      window.__mkEnv();
      Game.castSkill('fireball');
      await wait(900);
      Game.playSkillVfx = oldVfx;
      Game.damageEnemy = oldHit;
      if (foe) foe.dead = true;
      return { impacts: impacts, pp: { x: pp.x, z: pp.z }, target: { x: target.x, z: target.z },
        foe: !!foe, foeR: foe ? (foe.radius || 0) : 0 };
    });
    ok(r.foe, '真的刷出了一只怪（弹道有东西可打）');
    ok(r.impacts.length >= 1, '弹道命中后补了命中段', r.impacts.length);
    const hit = r.impacts[0];
    const dToTarget = hit ? Math.hypot(hit.x - r.target.x, hit.z - r.target.z) : 999;
    const dToPlayer = hit ? Math.hypot(hit.x - r.pp.x, hit.z - r.pp.z) : 0;
    /* 判据是「打在怪的身上」而不是「打在怪的圆心」：弹道撞上的是**碰撞半径**，
     * 体型大的怪从表面就炸了 —— 离圆心 1.9 码对它来说正中靶心。
     * 拿 1.6 这种写死的数去卡，怪一大就假红。 */
    ok(hit && dToTarget <= r.foeR + 1.2,
      '命中段落在敌人身上（离圆心 ' + dToTarget.toFixed(2) + ' 码 / 半径 ' + r.foeR.toFixed(2) + '）', r);
    ok(hit && dToPlayer > 1.5, '没有落在施法者脚下（离自己 ' + dToPlayer.toFixed(2) + ' 码）', r);
  }

  /* ---------------- 四、三只灵兽三色 ---------------- */
  console.log('四、三只灵兽的起手色互不相同');
  {
    const r = await p.evaluate(async (ids) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const oldUnlock = Game.skillUnlocked;
      Game.skillUnlocked = () => true;
      const oldVfx = Game.playSkillVfx;
      const got = {};
      for (const id of ids) {
        window.__wipe();
        window.__mkEnv();
        let col = null;
        Game.playSkillVfx = function (sid, opts) {
          if (col === null && opts && opts.color !== undefined) col = opts.color;
          return oldVfx.call(this, sid, opts);
        };
        Game.state.skills = {}; Game.state.skills[id] = { lv: 10 };
        try { Game.recalc(); } catch (e) { }
        window.__mkEnv();
        try { Game.castSkill(id); } catch (e) { }
        await wait(200);
        got[id] = col;
      }
      Game.playSkillVfx = oldVfx;
      Game.skillUnlocked = oldUnlock;
      return got;
    }, ['summon', 'whitetiger', 'azuredragon']);
    const vals = Object.keys(r).map(k => r[k]);
    ok(vals.every(v => typeof v === 'number'), '三只都传了显式色（不是落回元素材质）', r);
    ok(new Set(vals).size === 3, '三种颜色互不相同（同一条剪影靠色区分）', r);
  }

  /* ---------------- 收尾 ---------------- */
  const bad = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(bad.length === 0, '全程零控制台报错', bad.slice(0, 3));

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P5b 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
