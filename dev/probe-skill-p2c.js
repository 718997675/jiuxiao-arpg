#!/usr/bin/env node
/* ============================================================
 * 技能 P2c 真机探针：精通层（11~20）在面板上真的看得见
 *
 *   NODE_PATH=<node_modules> node dev/probe-skill-p2c.js
 *
 * 要证的四件事（都是「只改数据不改面板」时会失败的）：
 *   1. 有效等级 ≤ 10 时**没有**精进轨道（渐进披露：不到 10 级不摊开）
 *   2. 有效等级 13（投入 10 + 装备 3）时出现轨道，亮 3 格，读数「精进 13/20」，
 *      而上面那行仍然写「投入 10/10」—— 两笔账不许混
 *   3. 有效等级 20 时 10 格全亮，最后一格带 cap 样式（上限是事实，不是质变）
 *   4. 面板的伤害预览与 castSkill 同口径（skillLvMul(有效等级)），
 *      而且手机 390px 上这一行不撑破卡片
 *
 * 注意：这里**不改装备**，直接 stub `Game.skillLevel` —— 探针量的是
 * 「有效等级变了面板怎么画」，装备词缀怎么算进有效等级是另一条线（M1 已测）。
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

  /* 40 级、投入 whirl 10 级（点满基础段）、打开术法面板 */
  await p.evaluate(() => {
    Game.state.level = 40;
    Game.state.skills = { whirl: { lv: 10 } };
    Game.state.passives = {};
    Game.recalc();
    document.getElementById('skillPanel').classList.add('open');
    UI.skSel = 'whirl';
    UI.renderSkillPanel();
  });
  await wait(400);

  /* 有效等级由这里控制（stub skillLevel，不动装备） */
  const setLv = async (n) => {
    await p.evaluate((v) => {
      if (!Game.__origSkillLevel) Game.__origSkillLevel = Game.skillLevel.bind(Game);
      Game.skillLevel = () => v;
      UI.renderSkillPanel();
    }, n);
    await wait(250);
    return p.evaluate(() => {
      const right = document.querySelector('#skList .sk-right');
      const rows = Array.from(right.querySelectorAll('.sd-lv'));
      const mst = right.querySelector('.sd-lv.mst');
      const mstPips = mst ? Array.from(mst.querySelectorAll('.sk-pip')) : [];
      const lvt = rows.map(r => (r.querySelector('.sk-lvt') || {}).textContent || '');
      const desc = right.querySelector('.sd-desc');
      const bold = desc ? desc.querySelector('b') : null;
      return {
        rows: rows.length,
        hasMst: !!mst,
        pips: mstPips.length,
        on: mstPips.filter(e => e.classList.contains('on')).length,
        cap: mstPips.filter(e => e.classList.contains('cap')).length,
        capOn: mstPips.filter(e => e.classList.contains('cap') && e.classList.contains('on')).length,
        txt: lvt,
        dmg: bold ? parseInt(bold.textContent, 10) : null,
        over: right.scrollWidth - right.clientWidth
      };
    });
  };

  console.log('一、有效等级 ≤ 10：不摊开');
  {
    const r = await setLv(10);
    ok(r.rows === 1, '只有「投入 x/10」那一行，没有精进轨道', r);
    ok(r.hasMst === false, '10 级（词缀 +0）看不到精进层 —— 渐进披露', r);
    ok(/投入\s*10\/10/.test(r.txt[0] || ''), '读数写「投入 10/10」', r.txt);
  }

  console.log('二、有效等级 13（投入 10 + 加成 3）');
  {
    const r = await setLv(13);
    ok(r.rows === 2 && r.hasMst === true, '精进轨道出现了', r);
    ok(r.pips === 10, '轨道 10 格（11~20）', r.pips);
    ok(r.on === 3, '亮 3 格（13 − 10）', r.on);
    ok(/精进\s*13\/20/.test(r.txt[1] || ''), '读数写「精进 13/20」', r.txt);
    ok(/投入\s*10\/10/.test(r.txt[0] || ''), '上面那行仍是「投入 10/10」—— 两笔账没混', r.txt);
    ok(r.cap === 1 && r.capOn === 0, '20 级那格有 cap 标记但还没点亮', r);
    ok(r.over <= 0, '卡片没有横向溢出', r.over);
  }

  console.log('三、有效等级 20（词缀满）');
  {
    const r = await setLv(20);
    ok(r.on === 10, '10 格全亮', r.on);
    ok(r.cap === 1 && r.capOn === 1, '最后一格（20 级上限）点亮且是 cap 样式', r);
    ok(/精进\s*20\/20/.test(r.txt[1] || ''), '读数写「精进 20/20」', r.txt);
  }

  console.log('四、伤害预览与战斗同口径');
  {
    /* 先把等级拨回 13 再比 —— 上一节停在 20，直接读会把 20 级的数字
     * 拿去对 13 级的期望值（第一版就是这么红的） */
    const r13 = await setLv(13);
    const chk = await p.evaluate(() => {
      const id = 'whirl';
      const sk = SKILLS[id];
      const smod = Game.effSkillMods(id);
      const lvMul = skillLvMul(Game.skillLevel(id));
      const want = Math.round(Game.state.stats.atk * sk.mult * (1 + (smod ? (smod.dmg || 0) : 0) / 100) * lvMul);
      const right = document.querySelector('#skList .sk-right');
      const bold = right.querySelector('.sd-desc b');
      return { want: want, got: bold ? parseInt(bold.textContent, 10) : null,
        lv: Game.skillLevel(id), lvMul: lvMul, mul10: skillLvMul(10), mul20: skillLvMul(20) };
    });
    ok(chk.lv === 13 && chk.want > 0 && chk.got === chk.want,
      '13 级的预览伤害 = atk × 倍率 × skillLvMul(13)（与 castSkill 同一个函数）',
      { want: chk.want, got: chk.got, lv: chk.lv });
    ok(chk.mul20 > chk.mul10 && chk.mul20 < 2.1,
      '20 级倍率 2.02 > 10 级 1.72，且没回到 2.52', chk);
    ok(r13.dmg > 0, '面板上真的印出了数字', r13.dmg);
  }

  console.log('五、手机 390px');
  {
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await setLv(13);
    await wait(300);
    const r = await p.evaluate(() => {
      const right = document.querySelector('#skList .sk-right');
      const mst = right.querySelector('.sd-lv.mst');
      const pips = mst ? mst.querySelector('.sk-pips') : null;
      const box = right.getBoundingClientRect();
      const pr = pips ? pips.getBoundingClientRect() : null;
      return {
        over: right.scrollWidth - right.clientWidth,
        boxW: Math.round(box.width),
        pipW: pr ? Math.round(pr.width) : -1,
        inside: pr ? (pr.right <= box.right + 1) : false
      };
    });
    ok(r.over <= 0, '手机上卡片不横向溢出', r);
    ok(r.inside, '精进轨道没有顶出卡片右边', r);
  }

  console.log('六、精通三选一（Lv15）');
  {
    /* 上一节把视口压到 390 了，这一节要读卡上的三行按钮 —— 先回到桌面宽度，
     * 免得量到手机分页签那一套布局 */
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await wait(300);
    /* 10 级：连块都不该有 */
    const r10 = await setLv(10);
    const none = await p.evaluate(() => !document.querySelector('#skList .sb-mlist'));
    ok(none, '10 级看不到精通块（渐进披露）', r10);

    /* 14 级：块在，但三条点不动 */
    await setLv(14);
    const r14 = await p.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#skList .sb-mlist [data-mset]'));
      return {
        n: btns.length,
        dis: btns.filter(b => b.disabled).length,
        tip: btns[0] ? btns[0].getAttribute('title') : '',
        hint: (document.querySelector('#skList .sb-mlist') || {}).parentElement
          ? document.querySelector('#skList .sb-mlist').parentElement.querySelector('.sb-vhint').textContent : ''
      };
    });
    ok(r14.n === 3, '14 级已经能看到三条（不是藏到 15 级才出现）', r14);
    ok(r14.dis === 3, '14 级三条全部点不动', r14);
    ok(/还差\s*1\s*级/.test(r14.tip), '提示写清还差 1 级', r14.tip);
    ok(/15\s*级开启/.test(r14.hint), '说明行写「15 级开启」', r14.hint);

    /* 15 级：三条可点，默认「烈」 */
    await setLv(15);
    const r15 = await p.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#skList .sb-mlist [data-mset]'));
      return {
        n: btns.length,
        dis: btns.filter(b => b.disabled).length,
        on: btns.filter(b => b.classList.contains('on')).map(b => (b.querySelector('b') || {}).textContent || ''),
        names: btns.map(b => (b.querySelector('b') || {}).textContent || '')
      };
    });
    ok(r15.n === 3 && r15.dis === 0, '15 级三条都能点', r15);
    ok(r15.on.join(',') === '烈', '默认选中的是第 0 条「烈」', r15);
    ok(r15.names.join('/') === '烈/疾/省', '三条名字与数据层一致', r15.names);

    /* 切到「疾」：**真的放一次**，量冷却。skillCd() 只是基础冷却 ——
     * 冷却修正是在 castSkill 里乘的（`skillCd(sk) * (1 - cd/100)`），
     * 所以只能读 cooldowns[id]，读 skillCd 会得到「没变」的假结论。 */
    const cdChk = await p.evaluate(async () => {
      const id = 'whirl';
      const castOnce = async (i) => {
        document.querySelectorAll('#skList .sb-mlist [data-mset]')[i].click();
        await new Promise(r => setTimeout(r, 150));
        Game.cooldowns = {};
        Game.state.mp = Math.floor(Game.state.stats.mpMax * 0.6);
        const mp0 = Game.state.mp;
        Game.castSkill(id);
        return { cd: Game.cooldowns[id], spent: mp0 - Game.state.mp,
          mods: Game.effSkillMods(id), picked: Game.skillMastery(id),
          stored: (Game.skillState()[id] || {}).m };
      };
      const a = await castOnce(0);   // 烈
      const b = await castOnce(1);   // 疾
      return { lie: a, ji: b };
    });
    ok((cdChk.ji.mods.cd || 0) - (cdChk.lie.mods.cd || 0) === 18,
      '「疾」真的进了 effSkillMods（cd +18）', cdChk.ji.mods);
    ok(cdChk.ji.cd < cdChk.lie.cd, '放出来的冷却真的变短了', { 烈: cdChk.lie.cd, 疾: cdChk.ji.cd });
    ok(cdChk.ji.picked === 1 && cdChk.ji.stored === 1,
      '选择落在 state.skills[id].m（存档字段）', cdChk.ji);

    /* 切到「省」：同样放一次，量真的扣了多少灵力 */
    const rest = await p.evaluate(async () => {
      const id = 'whirl';
      const castOnce = async (i) => {
        document.querySelectorAll('#skList .sb-mlist [data-mset]')[i].click();
        await new Promise(r => setTimeout(r, 150));
        Game.cooldowns = {};
        Game.state.mp = Math.floor(Game.state.stats.mpMax * 0.6);
        const mp0 = Game.state.mp;
        Game.castSkill(id);
        return { spent: mp0 - Game.state.mp, mods: Game.effSkillMods(id), picked: Game.skillMastery(id) };
      };
      const lie = await castOnce(0);
      const sheng = await castOnce(2);
      const back = await castOnce(0);
      return { lie: lie, sheng: sheng, back: back };
    });
    ok(rest.sheng.spent < rest.lie.spent, '「省」放出来的消耗真的变低',
      { 烈: rest.lie.spent, 省: rest.sheng.spent });
    ok(rest.lie.mods.dmg - rest.sheng.mods.dmg === 22,
      '「烈」比「省」多 22 点伤害修正（两条不会同时生效）',
      { 烈: rest.lie.mods.dmg, 省: rest.sheng.mods.dmg });
    ok(rest.back.spent === rest.lie.spent, '换回「烈」后消耗回到原值（切换是干净的）', rest.back);
    ok(rest.back.picked === 0, '换回来真的写回 0', rest.back.picked);

    /* 召唤位：_summonMods 也是从 effSkillMods 折的，所以「烈」对灵兽同样生效 */
    const sum = await p.evaluate(async () => {
      Game.state.skills = { summon: { lv: 10, m: 0 } };
      Game.skillLevel = () => 15;
      Game.recalc();
      const on = Game._summonMods('summon');
      Game.state.skills.summon.m = 1;   // 疾：没有 dmg
      Game.recalc();
      const off = Game._summonMods('summon');
      return { on: on.dmgMul, off: off.dmgMul };
    });
    ok(sum.on > sum.off, '「烈」对召唤位同样生效（dmgMul 真的变高）', sum);
  }

  console.log('七、控制台');
  ok(errs.length === 0, '全程零控制台报错', errs.slice(0, 3));

  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P2c 探针：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
