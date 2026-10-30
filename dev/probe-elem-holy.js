#!/usr/bin/env node
/* ============================================================
 * 技能 P3a 真机探针：圣系 4 组反应真的在战斗里发生
 *
 *   NODE_PATH=<node_modules> node dev/probe-elem-holy.js
 *
 * 契约（test-elem-holy）只能证明「表长什么样、代码里有没有那几行」。
 * 这一支要证明的是**打出来真的不一样**：
 *   1. 圣符命中盖 6 秒圣印，只刷新不叠加，且本身不触发反应；
 *   2. 火打有圣印的目标 → 净化烈焰：目标多掉血、玩家回血；
 *   3. 亡灵吃到的追加伤害是 ×1.3（humanoid 打对照）；
 *   4. 冰打有圣印的目标 → 圣霜：玩家身上真的多了一层盾；
 *   5. 雷打**首领**的天罚比打普怪更疼（×1.15）；
 *   6. 毒打有圣印的目标 → 解毒雾：挂上计时器，跑完真的回血；
 *   7. 优先级：冻结 + 圣印时火出蒸汽爆裂，圣系不许抢；
 *   8. 反方向：圣符打燃烧目标也出净化烈焰（同一组，方向无关）。
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
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓', m); }
  else { fail++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d)); }
};

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
    Game.rollDamage = (base) => ({ dmg: base, crit: false });

    /* 假怪要能过帧循环：`actor.group.traverse` / `group.position` / `group.scale.x`
     * 三样缺一个就抛帧异常（P3d 那轮踩过）。 */
    window.__mkFoe = (x, z, over) => Object.assign({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false, hp: 1e9, maxHp: 1e9,
      level: 10, cfg: {}, resist: {}, boss: false, elite: false, family: 'humanoid',
      actor: {
        flash: 0, flashWas: false,
        group: {
          visible: true, position: new THREE.Vector3(x, 0, z), scale: { x: 1 },
          traverse() { }, rotation: { x: 0, y: 0, z: 0 }
        }
      },
      anim: { time: 0 }, spd: 0, atkCd: 999, bar: null,
      slow: 0, slowT: 0, stun: 0, vuln: 0, vulnT: 0, shred: 0, shredT: 0,
      dotT: 0, dotDmg: 0, dotElem: null, poisonT: 0, poisonDmg: 0, shield: 0,
      sigilT: 0
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
      window.__reacts = [];
      const before = e.hp;
      Game.damageEnemy(e, dmg === undefined ? 100 : dmg, false, { elem: elem });
      return { loss: before - e.hp, reacts: window.__reacts.slice() };
    };
    /* ICD 会拦住「同一秒内的第二发」，用例之间统一把时钟往前推 */
    window.__tick = (n) => { Game.time = (Game.time || 0) + (n || 10); };
  });

  const pp = await p.evaluate(() => ({ x: Game.playerGroup.position.x, z: Game.playerGroup.position.z }));

  /* ---------------- 一、圣印 ---------------- */
  console.log('一、圣印（sigil 命中盖印）');
  const mark = await p.evaluate((pp) => {
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, {})])[0];
    const r0 = window.__hit(e, 'sigil', 100);
    const t0 = e.sigilT;
    window.__tick();
    const r1 = window.__hit(e, 'sigil', 100);
    return { reacts0: r0.reacts, reacts1: r1.reacts, t0, t1: e.sigilT };
  }, pp);
  ok(mark.reacts0.length === 0, '圣符打白板目标不触发反应（只是盖印）', mark.reacts0);
  ok(mark.t0 > 5.5 && mark.t0 <= 6, '盖上了 6 秒圣印', mark.t0);
  ok(mark.t1 <= 6.01, '再打一发只刷新时长、不叠加（不是 12 秒）', mark.t1);

  /* 圣印会随帧递减 —— 这条必须用**真怪**：假怪没有 actor.parts，
   * 帧循环里 updateActorAnim 一读 `P.torso` 就抛（P3d 那轮踩过的老坑）。 */
  const decay = await p.evaluate((pp) => {
    Game.enemies = [];
    const e = Game.spawnEnemy('halfork', pp.x + 3, pp.z, false, 4);
    if (!e) return { err: 'spawn 失败' };
    e.sigilT = 6;
    const before = e.sigilT;
    /* 按 0.1 秒一帧推 2 秒 —— 一次性传 dt=2 会让眩晕 / 攻击冷却这些字段算飞 */
    for (let i = 0; i < 20; i++) Game.updateEnemies(0.1);
    const after = e.sigilT;
    Game.enemies = [];
    return { before, after };
  }, pp);
  ok(!decay.err && decay.after < decay.before - 1.5, '帧循环真的在扣圣印（2 秒后少了约 2）', decay);

  /* ---------------- 二、净化烈焰（火 + 圣印）---------------- */
  console.log('二、净化烈焰（火 + 圣印）');
  const purify = await p.evaluate((pp) => {
    const st = Game.state.stats;
    let e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, {})])[0];
    const base = window.__hit(e, 'fire', 100).loss;
    window.__tick();
    e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { sigilT: 6 })])[0];
    Game.state.hp = st.hpMax * 0.5;
    const hp0 = Game.state.hp;
    const r = window.__hit(e, 'fire', 100);
    return { base, loss: r.loss, reacts: r.reacts, healed: Game.state.hp - hp0 };
  }, pp);
  ok(purify.reacts.indexOf('purify') >= 0, '火打有圣印的目标触发「净化烈焰」', purify.reacts);
  ok(purify.loss > purify.base * 1.15, '追加了圣伤（这一下真的更疼）',
    { 基线: purify.base, 反应: purify.loss });
  ok(purify.healed > 0, '玩家当场回了血', purify.healed);

  /* 亡灵 ×1.3：用「有圣印 - 无圣印」的差值比，把护甲 / 抗性 / bossSlayer 全部约掉 */
  const undead = await p.evaluate((pp) => {
    const mk = window.__mkFoe;
    const d = (over) => {
      window.__tick();
      const a = window.__clean([mk(pp.x + 3, pp.z, over)])[0];
      const plain = window.__hit(a, 'fire', 100).loss;
      window.__tick();
      const b2 = window.__clean([mk(pp.x + 3, pp.z, Object.assign({}, over, { sigilT: 6 }))])[0];
      const holy = window.__hit(b2, 'fire', 100).loss;
      return holy - plain;
    };
    const human = d({});
    const und = d({ family: 'undead' });
    return { human, und, ratio: human > 0 ? und / human : 0 };
  }, pp);
  ok(undead.ratio > 1.25 && undead.ratio < 1.35,
    '亡灵吃到的追加伤害约 ×1.3（+30%）', undead);

  /* ---------------- 三、圣霜（冰 + 圣印）---------------- */
  console.log('三、圣霜（冰 + 圣印）');
  const frost = await p.evaluate((pp) => {
    Game.shield = 0; Game.shieldT = 0;
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { sigilT: 6 })])[0];
    const r = window.__hit(e, 'ice', 100);
    const st = Game.state.stats;
    const expect = st.hpMax * 0.08 * (1 + (st.shieldBonus || 0) / 100) * 1.25;
    return { reacts: r.reacts, shield: Game.shield, shieldT: Game.shieldT, expect };
  }, pp);
  ok(frost.reacts.indexOf('holyfrost') >= 0, '冰打有圣印的目标触发「圣霜」', frost.reacts);
  ok(Math.abs(frost.shield - frost.expect) < 1,
    '护盾量 = 最大生命 × 8% × 护盾强度 × 1.25（+25% 真的在）',
    { 实际: Math.round(frost.shield), 期望: Math.round(frost.expect) });
  ok(frost.shieldT > 0, '护盾有自己的持续时间', frost.shieldT);

  /* ---------------- 四、天罚（雷 + 圣印）---------------- */
  console.log('四、天罚（雷 + 圣印）');
  const judge = await p.evaluate((pp) => {
    const mk = window.__mkFoe;
    const d = (over) => {
      window.__tick();
      const a = window.__clean([mk(pp.x + 3, pp.z, over)])[0];
      const plain = window.__hit(a, 'lightning', 100).loss;
      window.__tick();
      const b2 = window.__clean([mk(pp.x + 3, pp.z, Object.assign({}, over, { sigilT: 6 }))])[0];
      const holy = window.__hit(b2, 'lightning', 100).loss;
      return holy - plain;
    };
    const normal = d({});
    const boss = d({ boss: true });
    return { normal, boss, ratio: normal > 0 ? boss / normal : 0 };
  }, pp);
  ok(judge.normal > 0, '普怪也能吃天罚（不是只对首领生效）', judge.normal);
  ok(judge.ratio > 1.1 && judge.ratio < 1.2,
    '首领吃到的天罚更疼（×1.15）', judge);

  /* ---------------- 五、解毒雾（毒 + 圣印）---------------- */
  console.log('五、解毒雾（毒 + 圣印）');
  const mist = await p.evaluate((pp) => {
    Game.healMist = null;
    const e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { sigilT: 6 })])[0];
    const r = window.__hit(e, 'poison', 100);
    const t0 = Game.healMist ? Game.healMist.t : 0;
    const st = Game.state.stats;
    Game.state.hp = st.hpMax * 0.4;
    const hp0 = Game.state.hp;
    /* 手动把计时器推到跳点，再推进 6 秒 —— 不必真等 6 秒 */
    for (let i = 0; i < 7; i++) {
      if (!Game.healMist) break;
      Game.healMist.tick = 0;
      Game.updateBuffs(1);
    }
    return { reacts: r.reacts, t0, healed: Game.state.hp - hp0, gone: !Game.healMist };
  }, pp);
  ok(mist.reacts.indexOf('cleansmist') >= 0, '毒打有圣印的目标触发「解毒雾」', mist.reacts);
  ok(mist.t0 > 4, '挂上了 5 秒的回血雾计时器', mist.t0);
  ok(mist.healed > 0, '雾里真的在回血', mist.healed);
  ok(mist.gone, '雾走完自己清掉了（不会永久回血）');

  /* ---------------- 六、优先级：圣印不许抢 ---------------- */
  console.log('六、优先级');
  const prio = await p.evaluate((pp) => {
    let e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { sigilT: 6, slow: 1, slowT: 2 })])[0];
    const a = window.__hit(e, 'fire', 100).reacts;
    window.__tick();
    e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { sigilT: 6, poisonT: 3 })])[0];
    const b2 = window.__hit(e, 'lightning', 100).reacts;
    return { frozenSigil: a, poisonSigil: b2 };
  }, pp);
  ok(prio.frozenSigil.indexOf('steam') >= 0 && prio.frozenSigil.indexOf('purify') < 0,
    '冻结 + 圣印时，火优先出蒸汽爆裂（圣印让位）', prio.frozenSigil);
  ok(prio.poisonSigil.indexOf('corrochain') >= 0 && prio.poisonSigil.indexOf('judgment') < 0,
    '中毒 + 圣印时，雷优先出腐蚀链（不是天罚）', prio.poisonSigil);

  /* ---------------- 七、反方向 + 闸门 ---------------- */
  console.log('七、反方向与闸门');
  const rev = await p.evaluate((pp) => {
    let e = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { dotT: 3, dotDmg: 50, dotElem: 'fire' })])[0];
    const a = window.__hit(e, 'sigil', 100);
    const markAfter = e.sigilT;
    /* 反应追加的圣伤不许再盖印：目标身上有火 dot，若反应伤害也盖印，
     * 就会变成每 0.5 秒一次的无限净化烈焰 */
    window.__tick();
    const e2 = window.__clean([window.__mkFoe(pp.x + 3, pp.z, { dotT: 3, dotDmg: 50, dotElem: 'fire', sigilT: 6 })])[0];
    const b2 = window.__hit(e2, 'sigil', 100);
    return { reacts: a.reacts, markAfter, again: b2.reacts };
  }, pp);
  ok(rev.reacts.indexOf('purify') >= 0, '圣符打燃烧目标也出净化烈焰（同一组，方向无关）', rev.reacts);
  ok(rev.markAfter > 0, '圣符命中顺手盖印（反应之后圣印还在，下一发还能接）', rev.markAfter);

  /* ---------------- 八、说明页：面板得能兑现 ---------------- */
  console.log('八、说明页');
  const doc = await p.evaluate(() => {
    /* 说明页是**分页签**渲染的（`el.innerHTML = SECTIONS[hpTab].html`），
     * 只调一次 renderHelp 只能读到第一页 —— 必须把每个页签都翻一遍再拼起来。 */
    const nav = document.getElementById('hpNav');
    const el = document.getElementById('helpBody');
    UI.hpTab = 0; UI.renderHelp();
    const ids = Array.from(nav.querySelectorAll('.hp-tab')).map(b => parseInt(b.dataset.hp, 10));
    let all = '';
    for (const i of ids) { UI.hpTab = i; UI.renderHelp(); all += el.textContent; }
    UI.hpTab = 0; UI.renderHelp();
    /* 面板里是「净化烈焰（火+圣：…）」这种拼串，中间没有空格 */
    const t = all.replace(/\s+/g, '');
    return {
      tabs: ids.length,
      hasSigil: t.indexOf('圣印') >= 0,
      names: ['净化烈焰', '圣霜', '天罚', '解毒雾'].filter(n => t.indexOf(n) >= 0),
      notDone: t.indexOf('圣系4组') >= 0 && t.indexOf('未做') >= 0,
      len: t.length
    };
  });
  ok(doc.tabs >= 7, '说明页至少 7 个页签（第七节是术法）', doc.tabs);
  ok(doc.hasSigil, '说明页讲了「圣印」（6 秒印记是圣系反应的前提）', doc);
  ok(doc.names.length === 4, '四组圣系反应名字都在说明页里', doc.names);
  ok(!doc.notDone, '说明页**不再**写「圣系 4 组未做」');

  /* ---------------- 九、页脚 ---------------- */
  await p.evaluate(() => { Game.enemies = []; Game.healMist = null; });
  ok(errs.length === 0, '整轮没有控制台报错', errs.slice(0, 4));

  console.log(`\n${fail ? '✗' : '✓'} 圣系反应探针：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
