#!/usr/bin/env node
/* ============================================================
 * 技能 P3a 真机探针：元素反应真的在战斗里发生
 *
 *   NODE_PATH=<node_modules> node dev/probe-skill-p3.js
 *
 * 契约（test-skill-p3）只能证明「表长什么样、代码里有没有那几行」。
 * 这一支要证明的是**打出来真的不一样**：
 *   1. 火打冻结目标 → 蒸汽爆裂：伤害更高、目标被推开；
 *   2. 冰打燃烧目标 → 也是蒸汽爆裂（查表顺序无关）；
 *   3. 同元素 / 物理 不反应（不能「有状态就爆」）；
 *   4. 同目标 2 秒内不重复反应（ICD 真的在拦）；
 *   5. 焚毒把 dot 跳伤 ×1.5，而且**不叠乘**；
 *   6. 腐霜写的是 e.shred（5 秒减防 20%）；
 *   7. 腐蚀链真的连锁到旁边两只怪；感电冻结把减速时长 ×1.5；
 *   8. 等离子追加的那一发是暴击（读数与伤害都更高）。
 *
 * 全部直接调 `Game.damageEnemy`（它是所有伤害的唯一出口），假怪只带
 * damageEnemy 会读到的字段 —— 不跑技能，免得把技能自己的数值混进来。
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = require('./_chrome');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d)); } };

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
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

  /* 造怪 + 记录「这一下触发了哪个反应」 + 固定 rollDamage */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.dead = false;
    Game.running = true;
    window.__reacts = [];
    if (!Game.__origApply) {
      Game.__origApply = Game.applyElemReaction.bind(Game);
      Game.applyElemReaction = function (r, e2, f) {
        window.__reacts.push(r.key);
        return Game.__origApply(r, e2, f);
      };
    }
    /* rollDamage 固定成「不暴击、不吃随机」：反应追加的那一发是**必暴**，
     * 它走的是 damageEnemy(crit=true)，所以这里不用为它改 */
    Game.rollDamage = (base) => ({ dmg: base, crit: false });
    window.__mkFoe = (x, z, over) => Object.assign({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false, hp: 1e9, maxHp: 1e9,
      level: 10, cfg: {}, resist: {}, boss: false, elite: false,
      actor: { flash: 0, flashWas: false }, anim: { time: 0 }, spd: 0, atkCd: 999,
      slow: 0, slowT: 0, stun: 0, vuln: 0, vulnT: 0, shred: 0, shredT: 0,
      dotT: 0, dotDmg: 0, dotElem: null, poisonT: 0, poisonDmg: 0, shield: 0
    }, over || {});
    /* 每个用例都从「干净的反应状态」开始：ICD 用 Game.time 记绝对值，
     * 而探针里主角可能已经阵亡（tickFrame 不跑 → time 不动 → ICD 永不过期） */
    window.__clean = (foes) => {
      Game.enemies = foes;
      Game._reactCd = {};
      window.__reacts = [];
      for (const f of foes) f._reactAt = {};
      return foes;
    };
    window.__hit = (e, elem, dmg) => {
      /* 每次命中前清空记录 —— 否则 `reacts` 是**累积**的，第二发会读到第一发的
       * 记录，ICD 那条就会假红（明明拦住了，却看见上一发的 'steam'） */
      window.__reacts = [];
      const before = e.hp;
      Game.damageEnemy(e, dmg === undefined ? 100 : dmg, false, { elem: elem });
      return { loss: before - e.hp, reacts: window.__reacts.slice() };
    };
  });

  const pp = await p.evaluate(() => ({ x: Game.playerGroup.position.x, z: Game.playerGroup.position.z }));

  /* ---------------- 一、蒸汽爆裂 ---------------- */
  console.log('一、蒸汽爆裂（火 + 冰）');
  const steam = await p.evaluate((pp) => {
    const mk = window.__mkFoe;
    /* 基线：干净目标吃一发火 */
    let e = window.__clean([mk(pp.x + 3, pp.z, {})])[0];
    const base = window.__hit(e, 'fire');
    /* 冻结目标吃一发火 */
    e = window.__clean([mk(pp.x + 3, pp.z, { slow: 1, slowT: 1.2 })])[0];
    const d0 = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
    const hit = window.__hit(e, 'fire');
    const d1 = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
    return { base: base.loss, loss: hit.loss, reacts: hit.reacts, push: d1 - d0 };
  }, pp);
  ok(steam.reacts.indexOf('steam') >= 0, '火打冻结目标触发了「蒸汽爆裂」', steam.reacts);
  ok(steam.loss > steam.base * 1.2, '这一下真的更疼（爆炸溅射叠上去了）',
    { 基线: steam.base, 反应: steam.loss });
  ok(steam.push > 0.3, '目标被推开了（击退真的生效）', steam.push);

  const steamRev = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { dotT: 2, dotDmg: 40, dotElem: 'fire' })])[0];
    const r = window.__hit(e, 'ice');
    return r.reacts;
  }, pp);
  ok(steamRev.indexOf('steam') >= 0, '反过来：冰打燃烧目标也是「蒸汽爆裂」（查表顺序无关）', steamRev);

  /* ---------------- 二、不该反应的三种情况 ---------------- */
  console.log('二、不该反应的情况');
  const none = await p.evaluate((pp) => {
    const mk = window.__mkFoe;
    let e = window.__clean([mk(pp.x + 3, pp.z, { dotT: 2, dotDmg: 40, dotElem: 'fire' })])[0];
    const same = window.__hit(e, 'fire');
    e = window.__clean([mk(pp.x + 3, pp.z, { slow: 1, slowT: 1.2 })])[0];
    const phys = window.__hit(e, 'phys');
    e = window.__clean([mk(pp.x + 3, pp.z, {})])[0];
    const clean = window.__hit(e, 'fire');
    return { same: same.reacts, phys: phys.reacts, clean: clean.reacts };
  }, pp);
  ok(none.same.length === 0, '火打燃烧目标不反应（同元素）', none.same);
  ok(none.phys.length === 0, '物理打冻结目标不反应', none.phys);
  ok(none.clean.length === 0, '干净目标打什么都不反应', none.clean);

  /* ---------------- 三、同目标 ICD ---------------- */
  console.log('三、冷却（同目标 2 秒）');
  const icd = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { slow: 1, slowT: 9 })])[0];
    const a = window.__hit(e, 'fire');
    const c = window.__hit(e, 'fire');
    return { first: a.reacts, second: c.reacts };
  }, pp);
  ok(icd.first.indexOf('steam') >= 0, '第一发触发反应', icd.first);
  ok(icd.second.length === 0, '紧接着第二发被 ICD 拦住（不会每一下都炸）', icd.second);

  /* ---------------- 四、焚毒（火 + 毒）---------------- */
  console.log('四、焚毒（火 + 毒）');
  const burn = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { dotT: 3, dotDmg: 100, dotElem: 'fire' })])[0];
    const r = window.__hit(e, 'poison');
    const after = e.dotDmg;
    /* 再来一只新目标，同样的路径走第二遍 —— 加成不许叠乘 */
    const e2 = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { dotT: 3, dotDmg: 100, dotElem: 'fire' })])[0];
    window.__hit(e2, 'poison');
    const again = window.__hit(e2, 'poison');
    return { reacts: r.reacts, after, second: e2.dotDmg, again: again.reacts };
  }, pp);
  ok(burn.reacts.indexOf('burnpoison') >= 0, '毒打燃烧目标触发「焚毒」', burn.reacts);
  ok(burn.after === 150, 'dot 跳伤 ×1.5（100 → 150）', burn.after);
  ok(burn.second === 150, '同一只目标再触发也不会叠成 225（_reactDot 挡住）', burn.second);

  /* ---------------- 五、腐霜（冰 + 毒）---------------- */
  console.log('五、腐霜（冰 + 毒）');
  const rot = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { poisonT: 4 })])[0];
    const r = window.__hit(e, 'ice');
    return { reacts: r.reacts, shred: e.shred, shredT: e.shredT };
  }, pp);
  ok(rot.reacts.indexOf('frostrot') >= 0, '冰打中毒目标触发「腐霜」', rot.reacts);
  ok(rot.shred === 20, '减防 20 真的写进 e.shred（damageEnemy 本来就在读它）', rot.shred);
  ok(rot.shredT >= 4.9, '持续 5 秒', rot.shredT);

  /* ---------------- 六、腐蚀链（雷 + 毒）---------------- */
  console.log('六、腐蚀链（雷 + 毒）');
  const chain = await p.evaluate((pp) => {
    const foes = window.__clean([
      window.__mkFoe(pp.x + 3, pp.z, { poisonT: 4 }),
      window.__mkFoe(pp.x + 4.2, pp.z, {}),
      window.__mkFoe(pp.x + 5.4, pp.z, {})
    ]);
    const r = window.__hit(foes[0], 'lightning');
    return { reacts: r.reacts, loss: foes.map(f => 1e9 - f.hp) };
  }, pp);
  ok(chain.reacts.indexOf('corrochain') >= 0, '雷打中毒目标触发「腐蚀链」', chain.reacts);
  ok(chain.loss[1] > 0 && chain.loss[2] > 0, '旁边两只都挨了连锁', chain.loss);
  ok(chain.loss[0] > chain.loss[1], '被直接命中的那只掉得更多（连锁是 25%）', chain.loss);

  /* ---------------- 七、感电冻结（冰 + 雷）---------------- */
  console.log('七、感电冻结（冰 + 雷）');
  const frozele = await p.evaluate((pp) => {
    const foes = window.__clean([
      window.__mkFoe(pp.x + 3, pp.z, { slow: 0.6, slowT: 2 }),
      window.__mkFoe(pp.x + 4.2, pp.z, {})
    ]);
    const r = window.__hit(foes[0], 'lightning');
    return { reacts: r.reacts, slowT: foes[0].slowT, chained: 1e9 - foes[1].hp };
  }, pp);
  ok(frozele.reacts.indexOf('frozele') >= 0, '雷打减速目标触发「感电冻结」', frozele.reacts);
  ok(Math.abs(frozele.slowT - 3) < 0.001, '冻结 / 减速时长 ×1.5（2 → 3 秒）', frozele.slowT);
  ok(frozele.chained > 0, '连锁 1 个目标（旁边的怪也掉血）', frozele.chained);

  /* ---------------- 八、等离子（火 + 雷）---------------- */
  console.log('八、等离子（火 + 雷）');
  const plasma = await p.evaluate((pp) => {
    let e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, {})])[0];
    const base = window.__hit(e, 'fire');
    e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { stun: 1 })])[0];
    const hit = window.__hit(e, 'fire');
    return { base: base.loss, loss: hit.loss, reacts: hit.reacts };
  }, pp);
  ok(plasma.reacts.indexOf('plasma') >= 0, '火打麻痹目标触发「等离子」', plasma.reacts);
  /* 追加的那一发是**独立的一击**：它自己再过一遍护甲 / 抗性，所以账面 40% × 1.5 倍暴伤
   * 落到实际伤害上大约是 +39%（实测 76.9 → 107.2）。门槛按「明显更高」写 1.25，
   * 不按账面 1.6 写 —— 那会把「反应伤害也要过减伤」这条事实当成 bug。 */
  ok(plasma.loss > plasma.base * 1.25, '追加的那一发雷伤是「必暴」，总伤明显更高',
    { 基线: plasma.base, 反应: plasma.loss, 倍率: +(plasma.loss / plasma.base).toFixed(3) });

  /* ---------------- 九、静默伤害不触发 ---------------- */
  console.log('九、持续伤害不触发反应');
  const silent = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { slow: 1, slowT: 3 })])[0];
    const before = e.hp;
    Game.damageEnemy(e, 100, false, { elem: 'fire', silent: true });
    return { reacts: window.__reacts.slice(), loss: before - e.hp };
  }, pp);
  ok(silent.reacts.length === 0, 'silent（dot 跳伤）不触发反应 —— 否则会滚成无限反应', silent.reacts);
  ok(silent.loss > 0, '但它照样造成伤害', silent.loss);

  /* 收尾：清场，别让假怪进帧循环 */
  await p.evaluate(() => {
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game._reactCd = {};
    if (Game.__origApply) { Game.applyElemReaction = Game.__origApply; Game.__origApply = null; }
  });
  await wait(200);

  console.log('十、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3a 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
