/* ============================================================
 * P3d 真机探针：双元素混搭（注入包 / 伤害分段 / 反应源 / 面板 / 火星）
 *
 *   node dev/probe-elem-dual.js
 *
 * 契约（dev/test-elem-dual.js）验的是表与源码接线；这里验真打：
 *   1. 39 级副元素不生效，40 级生效；
 *   2. 注入包 = 主 35% + 副 15%（有效等级 20，总量 50% 不变）；
 *   3. 伤害 = 1 + 0.35 + 0.15 = 1.5 倍（三段相加，不是把整发换成元素色）；
 *   4. 主副同色被拒；摘主元素时副元素一起走；
 *   5. 与命中元素相同的那一段被剔掉（不白送伤害）；
 *   6. 副元素也能当反应源（主元素跟命中元素同色时由副元素兜底）；
 *   7. 面板「混搭」一行的点击真的写进 state.skills[id].el2；
 *   8. 火星按主 70% / 副 30% 的粒子数分两簇。
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m, d === undefined ? '' : JSON.stringify(d)); }
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: require('./_chrome'),
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--window-size=1440,900']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.setViewport({ width: 1440, height: 900 });

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await p.goto(url, { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);

  await p.evaluate(() => {
    /* 帧异常兜底会把 Error 当 console.error 的第二个参数丢出来，
     * puppeteer 只看到 `JSHandle@error`。这里先接管一次，把堆栈抓成字符串，
     * 真红的时候能看到是哪一行 —— 否则只能靠猜。 */
    window.__errs = [];
    const oe = console.error;
    console.error = function () {
      try {
        window.__errs.push(Array.prototype.map.call(arguments,
          a => (a && a.stack) ? a.stack : String(a)).join(' || '));
      } catch (e) { /* 抓不到就算了，不影响被测逻辑 */ }
      return oe.apply(console, arguments);
    };
    Game.state.cls = 'warrior';
    Game.state.level = 40;
    Game.dead = false;
    Game.running = true;
    Game.state.skills = { whirl: { lv: 10 } };
    Game.recalc();
    Game.rollDamage = (base) => ({ dmg: base, crit: false });
    window.__reacts = [];
    if (!Game.__origApply) {
      Game.__origApply = Game.applyElemReaction.bind(Game);
      Game.applyElemReaction = function (r, e2, f) {
        window.__reacts.push(r.key);
        return Game.__origApply(r, e2, f);
      };
    }
    window.__mkFoe = (x, z, over) => Object.assign({
      pos: new THREE.Vector3(x, 0, z), radius: 0.5, dead: false, hp: 1e9, maxHp: 1e9,
      level: 10, cfg: {}, resist: {}, boss: false, elite: false,
      /* 假怪要能被帧循环和音效摸一遍：`updateEnemies` 读 `actor.group.traverse`（阴影裁剪）
       * 和 `actor.group.position / rotation`（每帧同步位置），`SFX.mob` 读 `group.scale.x`
       * （按体型选音高）。缺一个就是「帧异常」—— 那是假数据的问题，不是产品的问题。
       * 空壳 group 补齐这三样，再配合每个用例收尾清场，探针就不会把假怪喂进帧循环。 */
      actor: {
        flash: 0, flashWas: false,
        group: {
          visible: true, scale: { x: 1 }, traverse() { },
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }
        }
      },
      anim: { time: 0 }, spd: 0, atkCd: 999,
      slow: 0, slowT: 0, stun: 0, vuln: 0, vulnT: 0, shred: 0, shredT: 0,
      dotT: 0, dotDmg: 0, dotElem: null, poisonT: 0, poisonDmg: 0, shield: 0
    }, over || {});
    window.__clean = (foes) => {
      Game.enemies = foes;
      Game._reactCd = {};
      window.__reacts = [];
      for (const f of foes) f._reactAt = {};
      return foes;
    };
  });

  /* ---------------- 一、门槛 ---------------- */
  console.log('一、门槛');
  const gate = await p.evaluate(() => {
    Game.state.skills.whirl = { lv: 10, el: 'fire', el2: 'ice' };
    Game.state.level = 39;
    const at39 = { main: Game.skillInject('whirl'), sub: Game.skillInject2('whirl') };
    Game.state.level = 40;
    const at40 = { main: Game.skillInject('whirl'), sub: Game.skillInject2('whirl') };
    /* 主副同色 */
    Game.state.skills.whirl = { lv: 10, el: 'fire', el2: 'fire' };
    const same = Game.skillInject2('whirl');
    const refused = Game.setSkillInject2('whirl', 'fire');
    /* 没有主元素就没有副元素 */
    Game.state.skills.whirl = { lv: 10, el2: 'ice' };
    const orphan = { main: Game.skillInject('whirl'), sub: Game.skillInject2('whirl') };
    return { at39, at40, same, refused, orphan };
  });
  ok(gate.at39.main === 'fire' && gate.at39.sub === null, '39 级：主元素在、副元素不生效', gate.at39);
  ok(gate.at40.main === 'fire' && gate.at40.sub === 'ice', '40 级：主副都生效', gate.at40);
  ok(gate.same === null, '主副同色 = 没有副元素', gate.same);
  ok(gate.refused === false, 'setSkillInject2 拒绝主副同色', gate.refused);
  ok(gate.orphan.main === null && gate.orphan.sub === null, '没有主元素时副元素也不成立', gate.orphan);

  /* ---------------- 二、注入包与拆分 ---------------- */
  console.log('二、注入包');
  const pack = await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.skills.whirl = { lv: 10, el: 'fire', el2: 'ice' };
    /* 临时把有效等级钉在 20（总量 50%），用完必须还原 ——
     * 覆盖了不还，后面的施法 / 面板渲染全按 20 级算，会连带报出莫名其妙的帧异常。 */
    const origLv = Game.skillLevel.bind(Game);
    Game.skillLevel = () => 20;
    const dual = Game.skillInjectPack('whirl');
    Game.state.skills.whirl = { lv: 10, el: 'fire' }; // 单元素
    const single = Game.skillInjectPack('whirl');
    Game.state.skills.whirl = { lv: 10 };             // 不注入
    const none = Game.skillInjectPack('whirl');
    Game.skillLevel = origLv;
    return { dual, single, none };
  });
  ok(pack.dual && pack.dual.key === 'fire' && pack.dual.sub === 'ice', '双元素包带主副两段',
    pack.dual && { key: pack.dual.key, sub: pack.dual.sub });
  ok(Math.abs(pack.dual.amt - 0.35) < 1e-9 && Math.abs(pack.dual.subAmt - 0.15) < 1e-9,
    '总量 50% 拆成 35% + 15%（不是 50% + 15%）', { amt: pack.dual.amt, subAmt: pack.dual.subAmt });
  ok(Math.abs(pack.single.amt - 0.5) < 1e-9 && pack.single.sub === null,
    '单元素还是 50%，sub 为 null', { amt: pack.single.amt, sub: pack.single.sub });
  ok(pack.none === null, '不注入时返回 null');
  ok(Math.abs((pack.dual.amt + pack.dual.subAmt) - pack.single.amt) < 1e-9,
    '双元素总量 = 单元素总量（混搭不额外送伤害）',
    { 双: pack.dual.amt + pack.dual.subAmt, 单: pack.single.amt });

  /* ---------------- 三、伤害分段 ---------------- */
  console.log('三、伤害分段');
  const dmg = await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const hit = (injObj, elem, over) => {
      const e = window.__clean([window.__mkFoe(pg.x + 0.6, pg.z, over || {})])[0];
      const before = e.hp;
      Game._proj = null;
      Game._elem = injObj;
      Game.damageEnemy(e, 100, false, { elem: elem });
      Game._elem = null;
      return before - e.hp;
    };
    const base = hit(null, 'phys');
    const single = hit({ key: 'fire', amt: 0.5, sub: null, subAmt: 0 }, 'phys');
    const dual = hit({ key: 'fire', amt: 0.35, sub: 'ice', subAmt: 0.15 }, 'phys');
    /* 主元素与命中元素相同 → 那一段要剔掉，只剩副段 */
    const sameMain = hit({ key: 'phys', amt: 0.35, sub: 'ice', subAmt: 0.15 }, 'phys');
    /* 主副都和命中元素相同 → 整包作废，走原路径 */
    const allSame = hit({ key: 'phys', amt: 0.35, sub: 'phys', subAmt: 0.15 }, 'phys');
    Game.enemies = [];      // 别把假怪喂进帧循环（见 __mkFoe 的注释）
    return { base, single, dual, sameMain, allSame };
  });
  ok(Math.abs(dmg.single / dmg.base - 1.5) < 0.005, '单元素 50%：1.50 倍', +(dmg.single / dmg.base).toFixed(3));
  ok(Math.abs(dmg.dual / dmg.base - 1.5) < 0.005, '双元素 35+15：还是 1.50 倍（三段相加）',
    +(dmg.dual / dmg.base).toFixed(3));
  ok(Math.abs(dmg.sameMain / dmg.base - 1.15) < 0.005,
    '主元素与命中元素相同 → 主段被剔掉，只剩副段 15%',
    +(dmg.sameMain / dmg.base).toFixed(3));
  ok(Math.abs(dmg.allSame / dmg.base - 1) < 1e-9, '主副都和命中元素相同 → 整包作废（不白送 50%）',
    +(dmg.allSame / dmg.base).toFixed(3));

  /* 抗性按段结算：目标抗冰 50%，副段只剩一半 */
  const res = await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const hit = (over) => {
      const e = window.__clean([window.__mkFoe(pg.x + 0.6, pg.z, over)])[0];
      const before = e.hp;
      Game._proj = null;
      Game._elem = { key: 'fire', amt: 0.35, sub: 'ice', subAmt: 0.15 };
      Game.damageEnemy(e, 100, false, { elem: 'phys' });
      Game._elem = null;
      return before - e.hp;
    };
    const out = { plain: hit({}), iceRes: hit({ resist: { ice: 50 } }) };
    Game.enemies = [];
    return out;
  });
  /* 1 + 0.35 + 0.15×0.5 = 1.425 */
  ok(Math.abs(res.iceRes / res.plain - 1.425 / 1.5) < 0.006,
    '抗性按段结算（目标冰抗 50% 只削副段，不削主段）',
    { 无抗: +(res.iceRes / res.plain).toFixed(4), 期望: +(1.425 / 1.5).toFixed(4) });
  await p.evaluate(() => { Game.enemies = []; Game.mapGen = (Game.mapGen || 0) + 1; });
  await wait(150);

  /* ---------------- 四、副元素当反应源 ---------------- */
  console.log('四、副元素当反应源');
  const react = await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    /* 燃烧目标（火状态）；命中带火（同元素不反应）；主火（同元素不反应）；副冰 → 蒸汽爆裂 */
    const e = window.__clean([window.__mkFoe(pg.x + 0.6, pg.z, { dotT: 3, dotDmg: 40, dotElem: 'fire' })])[0];
    Game._proj = null;
    Game._elem = { key: 'fire', amt: 0.35, sub: 'ice', subAmt: 0.15 };
    Game.damageEnemy(e, 100, false, { elem: 'fire' });
    Game._elem = null;
    const bySub = window.__reacts.slice();

    /* 主元素能反应时，主元素优先（主冰 + 副雷，燃烧目标 → 蒸汽，不是等离子） */
    const e2 = window.__clean([window.__mkFoe(pg.x + 0.6, pg.z, { dotT: 3, dotDmg: 40, dotElem: 'fire' })])[0];
    Game._proj = null;
    Game._elem = { key: 'ice', amt: 0.35, sub: 'lightning', subAmt: 0.15 };
    Game.damageEnemy(e2, 100, false, { elem: 'phys' });
    Game._elem = null;
    const mainFirst = window.__reacts.slice();
    Game.enemies = [];
    return { bySub, mainFirst };
  });
  ok(react.bySub.indexOf('steam') >= 0, '主火副冰打燃烧目标 → 副元素的冰兜底触发蒸汽爆裂', react.bySub);
  ok(react.mainFirst.indexOf('steam') >= 0 && react.mainFirst.indexOf('plasma') < 0,
    '主元素能反应时主元素优先（主冰副雷 → 蒸汽，不是等离子）', react.mainFirst);

  /* 假怪只在伤害用例里活着。帧循环一直在跑，留着它们进 updateEnemies
   * 就会抛「帧异常」（缺 cfg / actor 字段）—— 那不是产品报错，是探针自己的假数据。
   * probe-skill-p3 里每节收尾都清一次，这里也一样。 */
  await p.evaluate(() => { Game.enemies = []; Game.mapGen = (Game.mapGen || 0) + 1; });
  await wait(150);

  /* ---------------- 五、面板 ---------------- */
  console.log('五、面板');
  const panel = await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.cls = 'warrior';
    Game.state.skills = { whirl: { lv: 10 } };
    Game.recalc();
    document.getElementById('skillPanel').classList.add('open');
    UI.skSel = 'whirl';
    UI.renderSkillPanel();
    const q = sel => document.querySelector('#skList ' + sel);
    const rows = () => Array.from(document.querySelectorAll('#skList .sb-i2list [data-inj2]'));
    const before = rows().length;                 // 主元素没选 → 混搭行不出现
    const fire = document.querySelector('#skList .sb-ilist [data-inj="whirl:fire"]');
    if (fire) fire.click();
    const afterMain = rows().map(b => b.dataset.inj2);
    const ice = rows().find(b => b.dataset.inj2 === 'whirl:ice');
    if (ice) ice.click();
    const picked = { el: Game.state.skills.whirl.el, el2: Game.state.skills.whirl.el2 };
    const onList = rows().filter(b => b.classList.contains('on')).map(b => b.dataset.inj2);
    /* 换成主冰 → 副冰应当被摘掉 */
    const iceMain = document.querySelector('#skList .sb-ilist [data-inj="whirl:ice"]');
    if (iceMain) iceMain.click();
    const afterSwap = { el: Game.state.skills.whirl.el, el2: Game.state.skills.whirl.el2 };
    /* 摘掉主元素 → 副元素一起走 */
    const back = document.querySelector('#skList .sb-ilist [data-inj="whirl:"]');
    if (back) back.click();
    const afterClear = { el: Game.state.skills.whirl.el, el2: Game.state.skills.whirl.el2 };
    return { before, afterMain, picked, onList, afterSwap, afterClear };
  });
  ok(panel.before === 0, '没选主元素时不显示「混搭」行（不存在只注副的状态）', panel.before);
  ok(panel.afterMain.length === 4 && panel.afterMain.indexOf('whirl:fire') < 0,
    '选了主火之后混搭行有 4 项，且剔掉了主元素本身', panel.afterMain);
  ok(panel.picked.el === 'fire' && panel.picked.el2 === 'ice', '点「冰」真的写进 el2', panel.picked);
  ok(panel.onList.join(',') === 'whirl:ice', '只有被选中的那个亮着', panel.onList);
  ok(panel.afterSwap.el === 'ice' && panel.afterSwap.el2 === undefined,
    '主元素换成冰 → 副元素自动摘掉（不会出现「主冰副冰」）', panel.afterSwap);
  ok(panel.afterClear.el === undefined && panel.afterClear.el2 === undefined,
    '摘掉主元素 → 副元素一起走', panel.afterClear);

  /* 不到 40 级：混搭行不出现 */
  const locked = await p.evaluate(() => {
    Game.state.level = 39;
    Game.state.skills = { whirl: { lv: 10, el: 'fire' } };
    Game.recalc();
    UI.renderSkillPanel();
    return document.querySelectorAll('#skList .sb-i2list [data-inj2]').length;
  });
  ok(locked === 0, '39 级：混搭行整行不出现', locked);

  /* ---------------- 六、火星 70/30 ---------------- */
  console.log('六、火星');
  /* 直接截 `FX.burst` 的参数，不去数 `FX.parts`：
   * ① 同一次施法还有技能自己的火星，数数分不清哪簇是注入的；
   * ② 低画质时 `FX.q < 1` 会按倍率砍粒子数，8 颗会被砍成 4 颗（假红）。
   * 截参数量的是**调用意图**，正好是「主 70% / 副 30%」这条口径本身。 */
  const spark = await p.evaluate(() => {
    FX.clear();
    Game.state.level = 40;
    Game.state.cls = 'warrior';
    Game.state.skills = { whirl: { lv: 10, el: 'fire', el2: 'ice' } };
    Game.recalc();
    Game.cooldowns = {};
    Game.state.mp = Math.floor(Game.state.stats.mpMax * 0.6);
    const calls = [];
    const origBurst = FX.burst;
    FX.burst = function (pos, color, count, opts) { calls.push({ color: color, n: count }); };
    Game.castSkill('whirl');
    FX.burst = origBurst;
    return { first: calls.slice(0, 2), all: calls.length };
  });
  ok(spark.first.length === 2, '一次施法先喷两簇注入火星（主 + 副）', spark.first);
  ok(spark.first[0] && spark.first[0].n === 8 && spark.first[1] && spark.first[1].n === 4,
    '双元素：12 颗按 8 + 4 分（70% / 30%）', spark.first.map(c => c.n));
  ok(spark.first[0] && spark.first[0].color === 0xff7a30 && spark.first[1] && spark.first[1].color === 0x8ad8ff,
    '第一簇是火色、第二簇是冰色（颜色取自 ELEM_DEFS，不写死）', spark.first.map(c => c.color));
  const spark2 = await p.evaluate(() => {
    FX.clear();
    Game.state.skills = { whirl: { lv: 10, el: 'fire' } };
    Game.recalc();
    Game.cooldowns = {};
    Game.state.mp = Math.floor(Game.state.stats.mpMax * 0.6);
    const calls = [];
    const origBurst = FX.burst;
    FX.burst = function (pos, color, count, opts) { calls.push({ color: color, n: count }); };
    Game.castSkill('whirl');
    FX.burst = origBurst;
    return { first: calls.slice(0, 1), all: calls.length };
  });
  ok(spark2.first.length === 1 && spark2.first[0].n === 12,
    '单元素：只有一簇 12 颗（全给主色）', spark2.first);
  const spark0 = await p.evaluate(() => {
    FX.clear();
    Game.state.skills = { whirl: { lv: 10 } };
    Game.recalc();
    Game.cooldowns = {};
    Game.state.mp = Math.floor(Game.state.stats.mpMax * 0.6);
    /* 这一条要数的是**注入火星**，所以直接截 elemSpark ——
     * 截 burst 会把技能自己的火星（旋风斩那几圈）一起数进来。 */
    let calls = 0;
    const origSpark = FX.elemSpark;
    FX.elemSpark = function () { calls++; };
    Game.castSkill('whirl');
    FX.elemSpark = origSpark;
    return { injected: calls };
  });
  ok(spark0.injected === 0, '不注入时一颗火星都不喷（不给没注入的技能加装饰）', spark0);

  /* ---------------- 七、控制台 ---------------- */
  await p.evaluate(() => {
    Game.enemies = [];
    Game.mapGen = (Game.mapGen || 0) + 1;
    Game._elem = null; Game._proj = null;
    if (Game.__origApply) { Game.applyElemReaction = Game.__origApply; Game.__origApply = null; }
  });
  console.log('七、控制台');
  const errDetail = await p.evaluate(() => (window.__errs || []).slice(0, 2));
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3).concat(errDetail));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P3d 双元素探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
