#!/usr/bin/env node
/* ============================================================
 * [U2 / V1] 增益行真机验收 —— SKILL-VFX-PLAN §13 第 7~11 条
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-buffrow.js
 *
 * 量的是「玩家真的会不会看到闪」：
 *   7  #buffbar 没了 / #buffrow 在血条正下方且宽度对齐
 *   8  连放 8 个 buff，节点复用、#buffrow 子树零 innerHTML 写入
 *   9  60 帧推进后没有任何一次新的入场动画（不闪烁）
 *   10 同 key 叠 3 层 = 1 个格子 + ×3（不是 3 个独立条目）
 *   11 到期先 .out 淡出再移除 / #trialHud 不被遮挡
 *   12 稳定 key（同名不同物不揉成一条）+ ord 排序不随 dur 抖动（U2-5）
 *
 * 坑：CSS animationstart 是**异步**派发的，创建完同一段 evaluate 里读
 *     一定是 0 —— 必须先等一帧再读，否则「不闪烁」会假绿。
 *     innerHTML 的 hook 只统计 #buffrow 子树，别把角色板 / 动作条的
 *     正常重绘算到增益行头上。
 * ============================================================ */
'use strict';
const puppeteer = require('./_pptr');
const path = require('path');
const fs = require('fs');
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
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1600);

  console.log('\n【7】位置与旧节点');
  const geo = await p.evaluate(() => {
    const row = document.getElementById('buffrow');
    const plate = document.getElementById('charplate');
    const bars = document.querySelector('#charplate .bars');
    const r = row.getBoundingClientRect(), br = bars.getBoundingClientRect();
    return {
      old: !!document.getElementById('buffbar'),
      inPlate: plate.contains(row),
      align: Math.abs(r.left - br.left),
      below: r.top >= br.bottom - 1,
      rowW: Math.round(r.width), barsW: Math.round(br.width),
      wrap: getComputedStyle(plate).flexWrap
    };
  });
  ok(!geo.old, '#buffbar 已从 DOM 中移除');
  ok(geo.inPlate && geo.wrap === 'wrap', '#buffrow 在 #charplate 内且换行', geo);
  ok(geo.align <= 2 && geo.below, '血条正下方、宽度与血条对齐', geo);

  console.log('\n【8 / 9】节点复用 · 零 innerHTML · 60 帧不重播动画');
  const t1 = await p.evaluate(() => {
    const row = document.getElementById('buffrow');
    window.__ih = { n: 0, on: false };
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) {
        if (window.__ih.on && (this === row || row.contains(this))) window.__ih.n++;
        return d.set.call(this, v);
      }
    });
    window.__starts = 0;
    row.addEventListener('animationstart', e => {
      if (e.target.classList && e.target.classList.contains('buff')) window.__starts++;
    });
    Game.buffs.length = 0;
    UI.renderBuffs();
    /* 必须用**真实 buff key**：BUFF_ICON_OF 是 key→图标的映射表，
     * 编一个 't:0' 出来查不到，8 格会全走汉字兜底，图标数自然 0（假红）。 */
    const UKEYS = ['skill:bloodrage', 'skill:shieldwall', 'beh:锐意', 'beh:疾行',
      'beh:急攻', 'beh:回春', 'st:poison', 'st:root'];
    window.__ih.on = true;
    for (let i = 0; i < UKEYS.length; i++) {
      Game.addBuff('测试增益' + i, { dur: 12 + i }, 0xffd166,
        { key: UKEYS[i], type: i < 5 ? 'buff' : 'debuff' });
    }
    window.__ih.on = false;
    window.__els = [...row.querySelectorAll('.buff')].filter(e => UKEYS.indexOf(e.dataset.k) >= 0);
    window.__els.forEach((e, i) => { e.dataset.mark = 'M' + i; });
    return { n: window.__els.length, ih: window.__ih.n };
  });
  ok(t1.n === 8, '8 个不同 buff 全部显示', t1.n);
  ok(t1.ih === 0, '#buffrow 子树零 innerHTML 写入', t1.ih);
  await wait(320);   // animationstart 是异步派发的，这里必须等一帧

  const t2 = await p.evaluate(() => {
    const row = document.getElementById('buffrow');
    const s0 = window.__starts;
    window.__ih.on = true;
    for (let f = 0; f < 60; f++) {
      for (const bf of Game.buffs) bf.dur = Math.max(0, bf.dur - 0.05);
      UI.renderBuffs();
    }
    window.__ih.on = false;
    const after = [...row.querySelectorAll('.buff[data-mark]')];
    return {
      n: after.length,
      reused: after.every(e => !!e.dataset.mark),
      sameOrder: after.length === window.__els.length && after.every((e, i) => e === window.__els[i]),
      starts0: s0, starts1: window.__starts,
      ih: window.__ih.n,
      icons: row.querySelectorAll('.buff[data-mark] svg').length,
      dash: row.querySelectorAll('.buff[data-mark].debuff').length
    };
  });
  ok(t2.n === 8 && t2.reused && t2.sameOrder, '节点身份与顺序都不变（DOM 不增长）', t2);
  ok(t2.starts1 === t2.starts0, '60 帧里没有重播入场动画（不闪烁）', t2);
  ok(t2.ih === 0, '时长推进不触发 innerHTML 重建', t2.ih);
  ok(t2.icons === 8, '8 格全是符号图标（svg path），不是汉字占位', t2.icons);
  ok(t2.dash === 3, '3 个 debuff 走虚线 + 缺角样式', t2.dash);

  console.log('\n【10】结构化叠层 ×3');
  await p.evaluate(() => { Game.buffs.length = 0; UI.renderBuffs(); });
  await wait(260);   // 等上一批 .out 收完
  const t3 = await p.evaluate(() => {
    for (let n = 1; n <= 3; n++) {
      const cur = Game.buffs.find(x => x.key === 't:stack');
      if (cur) { Object.assign(cur, { dur: 8, stacks: n, maxStacks: 5 }); Game.recalc(); }
      else Game.addBuff('战意', { dmgAll: 10 * n, dur: 8 }, 0xffd166,
        { key: 't:stack', stacks: n, maxStacks: 5 });
    }
    UI.renderBuffs();
    const cells = [...document.querySelectorAll('#buffrow .buff[data-k="t:stack"]')];
    return {
      cells: cells.length,
      bx: cells.map(e => e.querySelector('.bx').textContent),
      name: cells.map(e => e.querySelector('.bn').textContent),
      full: cells.map(e => e.classList.contains('full'))
    };
  });
  ok(t3.cells === 1, '同 key 只占一个格子', t3);
  ok(t3.bx.join('') === '×3', '右下角显示 ×3', t3.bx);
  ok(t3.name.join('') === '战意', '名字恒为「战意」，不再把层数写进名字', t3.name);
  ok(t3.full.every(v => !v), '3/5 层还没满，不加金边', t3.full);

  console.log('\n【11】到期淡出 + #trialHud 避让');
  const t4a = await p.evaluate(() => {
    Game.buffs.length = 0;
    UI.renderBuffs();
    const row = document.getElementById('buffrow');
    return { out: row.querySelectorAll('.buff.out').length, total: row.querySelectorAll('.buff').length };
  });
  ok(t4a.out > 0 && t4a.total > 0, '到期先加 .out，节点没有瞬间消失', t4a);
  await wait(100);
  const t4b = await p.evaluate(() => document.querySelectorAll('#buffrow .buff').length);
  ok(t4b > 0, '淡出 100ms 时节点还在', t4b);
  await wait(220);
  const t4c = await p.evaluate(() => document.querySelectorAll('#buffrow .buff').length);
  ok(t4c === 0, '淡出 200ms 后节点才移除', t4c);

  const t5 = await p.evaluate(() => {
    for (let i = 0; i < 3; i++) Game.addBuff('避让' + i, { dur: 12 }, 0xffd166, { key: 'z:' + i });
    UI.renderBuffs();
    const th = document.getElementById('trialHud');
    th.classList.add('on');
    const r = document.getElementById('buffrow').getBoundingClientRect();
    const t = th.getBoundingClientRect();
    return {
      top: Math.round(t.top), bottom: Math.round(r.bottom),
      buffH: getComputedStyle(document.body).getPropertyValue('--buff-h').trim()
    };
  });
  ok(t5.top >= t5.bottom - 1, '#trialHud 不压在增益行上', t5);
  ok(t5.buffH && t5.buffH !== '0px', '--buff-h 由增益行高度写出来了', t5.buffH);

  console.log('\n【12 / U2-5】稳定 key 与稳定排序');
  await wait(260);   // 等上一批 .out 收完，别让残留节点混进格子统计
  const t6 = await p.evaluate(() => {
    const S = {};
    for (const k of ['rootT', 'poisonT', 'playerSlowT', 'shield', 'shieldT', 'pull', 'reviveT']) S[k] = Game[k];
    const oldWB = WorldBoss.domainBuff, oldDom = Domains.buff;
    let out;
    try {
      Game.buffs.length = 0;
      Game.rootT = 3; Game.poisonT = 2; Game.playerSlowT = 1;
      Game.shield = 10; Game.shieldT = 4; Game.pull = null;
      /* stub 两条外部领域：statusBuffs 必须给它们也补上固定身份 */
      WorldBoss.domainBuff = () => ({ name: '昼夜', dur: 0, noTimer: true, type: 'debuff', color: '#fff' });
      Domains.buff = () => ({ name: '毒沼', dur: 0, noTimer: true, type: 'debuff', color: '#0f0' });
      const a = Game.statusBuffs();
      Game.rootT = 0.2; Game.poisonT = 0.1; Game.playerSlowT = 0.1; Game.shieldT = 1.1;
      const b = Game.statusBuffs();
      const stable = a.length === b.length && a.every((x, i) => x.key === b[i].key && x.ord === b[i].ord);
      const identity = {
        n: a.length,
        allKey: a.every(x => /^st:/.test(x.key || '')),
        allOrd: a.every(x => Number.isFinite(x.ord)),
        uniq: new Set(a.map(x => x.key)).size === a.length,
        stable,
        domKeys: a.filter(x => x.name === '昼夜' || x.name === '毒沼').map(x => x.key).sort(),
        iconKeys: [BUFF_ICON_OF['sto:bloodrush'], BUFF_ICON_OF['sto:berserk']]
      };

      /* 同名不同物：statusBuffs 的「定身」是 debuff，beh:定身 是 buff。
       * 按名字做 diff key 会把这两条揉成一个格子 —— 这里必须看到两个。 */
      Game.rootT = 3;
      Game.addBuff('定身', { dur: 6 }, 0xff8866, { key: 'beh:定身', type: 'buff' });
      UI.renderBuffs();
      const row = document.getElementById('buffrow');
      const both = {
        a: !!row.querySelector('.buff[data-k="beh:定身"]'),
        b: !!row.querySelector('.buff[data-k="st:root"]'),
        names: [...row.querySelectorAll('.buff[data-k="beh:定身"] .bn, .buff[data-k="st:root"] .bn')]
          .map(e => e.textContent)
      };

      /* 排序不随 dur 抖动：甲先创建但只剩 2s，乙后创建有 12s。
       * 旧口径（dur 大的在前）会让乙在前；把甲刷新到 20s、乙降到 1s 后
       * 旧口径必然交换两格 —— ord 口径必须一格都不动。 */
      Object.assign(Game, S);
      WorldBoss.domainBuff = oldWB; Domains.buff = oldDom;
      Game.buffs.length = 0;
      UI.renderBuffs();
      Game.addBuff('甲', { dur: 2 }, 0xffd166, { key: 'ord:a' });
      Game.addBuff('乙', { dur: 12 }, 0x9ae0ff, { key: 'ord:b' });
      UI.renderBuffs();
      const q = () => {
        const x = row.querySelector('.buff[data-k="ord:a"]');
        const y = row.querySelector('.buff[data-k="ord:b"]');
        return x && y ? [Number(x.style.order), Number(y.style.order)] : null;
      };
      const o0 = q();
      const ordBefore = Game.buffs.find(x => x.key === 'ord:a').ord;
      Game.addBuff('甲', { dur: 20 }, 0xffd166, { key: 'ord:a', refresh: true });
      Game.buffs.find(x => x.key === 'ord:b').dur = 1;
      const ordAfter = Game.buffs.find(x => x.key === 'ord:a').ord;
      for (let f = 0; f < 60; f++) {
        for (const bf of Game.buffs) bf.dur = Math.max(0, bf.dur - 0.01);
        UI.renderBuffs();
      }
      const o1 = q();
      out = {
        identity, both, o0, o1, ordBefore, ordAfter,
        noFlip: !!o0 && !!o1 && o0[0] < o0[1] && o0[0] === o1[0] && o0[1] === o1[1]
      };
    } finally {
      Object.assign(Game, S);
      WorldBoss.domainBuff = oldWB; Domains.buff = oldDom;
    }
    return out;
  });
  ok(t6.identity.n >= 6 && t6.identity.allKey && t6.identity.allOrd && t6.identity.uniq,
    'statusBuffs 每条都有唯一 st:* key + 有限 ord', t6.identity);
  ok(t6.identity.stable, '倒计时递减后 key / ord 逐条不变', t6.identity);
  ok(t6.identity.domKeys.join(',') === 'st:domain,st:zone',
    '世界 Boss / 章节领域都补了固定身份', t6.identity.domKeys);
  ok(t6.identity.iconKeys.join(',') === 'atk_up,aspd_up',
    '血怒 / 狂战的新 key 有图标映射', t6.identity.iconKeys);
  ok(t6.both.a && t6.both.b && t6.both.names.length === 2,
    '两个同名「定身」各占一格，没有被揉成一条', t6.both);
  ok(t6.ordBefore === t6.ordAfter, 'refresh 沿用原 ord，不重新分配', [t6.ordBefore, t6.ordAfter]);
  ok(t6.noFlip, '甲刷新到 20s、乙降到 1s、再推 60 帧：两格顺序一格没动', [t6.o0, t6.o1]);

  const srcGame = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'game.js'), 'utf8');
  ok(/'sto:bloodrush'/.test(srcGame) && /'sto:berserk'/.test(srcGame),
    '血怒 / 狂战源码已改用稳定 key（名字只留给老档兜底）');
  const srcWB = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'worldboss.js'), 'utf8');
  const srcDom = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'domain.js'), 'utf8');
  ok(/key: 'st:domain', ord: -103/.test(srcWB) && /key: 'st:zone', ord: -102/.test(srcDom),
    '两套领域 buff 自带固定身份与固定序');

  console.log('\n【错误】');
  ok(errs.length === 0, '全程无 console.error / pageerror', errs.slice(0, 3));

  await b.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
