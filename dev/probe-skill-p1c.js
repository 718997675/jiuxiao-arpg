#!/usr/bin/env node
/* ============================================================
 * 技能 P1c 真机探针：三线并行（二选一已取消）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-skill-p1c.js
 *
 * 要证的四件事（都是旧模型下会失败的）：
 *   1. 同一岔口的主动与被动**可以都点** —— 旧模型第 3 个岔口起会互斥
 *   2. 关键被动要「该线已投入 ≥ N 点」：差一点就拦住，够了就放
 *   3. 面板上不再出现「锁」标记 / 互斥虚线，只有等级锁与软前置
 *   4. 全程零控制台报错
 * ============================================================ */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const wait = ms => new Promise(r => setTimeout(r, ms));
/* 浏览器路径走跨平台探测（AGENTS.md §3）：写死 macOS / Chrome 路径的话，
   Windows 上（常常只装了 Edge）这个探针连启动都起不来 */
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

  /* 升到 40 级、技能点管够 */
  await p.evaluate(() => {
    Game.state.level = 40;
    if (Game.recalc) Game.recalc();
  });

  /* ---------------- 1. 同岔口主动 + 被动都能点 ---------------- */
  console.log('一、同一岔口不再互斥');
  const pair = await p.evaluate(() => {
    const cls = Game.state.cls;
    const lines = skillLines(cls);
    for (const line of lines) {
      const byRow = {};
      for (const n of line.nodes) (byRow[n.row] = byRow[n.row] || []).push(n);
      for (const row in byRow) {
        const arr = byRow[row];
        const act = arr.find(n => n.kind === 'active');
        const pas = arr.find(n => n.kind !== 'active');
        if (!act || !pas) continue;
        if (pas.kind === 'key') continue;            // 关键被动另测
        /* 旧模型只在第 3 个岔口起互斥，优先挑那个 */
        if (Number(row) < 3) continue;
        return { cls: cls, line: line.name, row: Number(row), act: act.id, pas: pas.id, pasName: pas.name };
      }
    }
    return null;
  });
  ok(!!pair, '找到第 3 个岔口上的主动/被动对', pair);

  if (pair) {
    const both = await p.evaluate((pr) => {
      const r1 = Game.levelUpSkill(pr.act);
      const r2 = Game.levelUpPassive(pr.pas);
      return {
        act: r1, pas: r2,
        actLv: ((Game.skillState()[pr.act] || {}).lv) || 1,
        pasLv: Game.passiveLv(pr.pas)
      };
    }, pair);
    ok(both.act.ok === true, '主动侧能加点', both.act);
    ok(both.pas.ok === true, '同一岔口的被动侧也能加点（旧模型这里会拦）', both.pas);
    ok(both.pasLv > 0, '被动确实投进去了', both.pasLv);
  }

  /* ---------------- 2. 关键被动的软前置 ---------------- */
  console.log('二、关键被动的软前置');
  const keyInfo = await p.evaluate(() => {
    const cls = Game.state.cls;
    for (const line of skillLines(cls)) {
      const key = line.nodes.find(n => n.kind === 'key');
      if (key) return { cls: cls, line: line.name, id: key.id, name: key.name, needPts: key.needPts };
    }
    return null;
  });
  ok(!!keyInfo, '找到本职业的关键被动', keyInfo);

  if (keyInfo) {
    /* 场景 A：把该线的投入清空 → 必须拦住 */
    const blocked = await p.evaluate((ki) => {
      const line = skillLines(ki.cls).find(l => l.name === ki.line);
      /* 清掉本线所有节点的投入 */
      const sk = Game.skillState();
      for (const n of line.nodes) {
        if (n.kind === 'active') sk[n.id] = { lv: 1, v: sk[n.id] ? sk[n.id].v : 0 };
        else if (Game.state.passives) delete Game.state.passives[n.id];
      }
      Game.recalc();
      const before = Game.lineSpent(ki.line);
      const r = Game.levelUpPassive(ki.id);
      return { linePts: before, r: r };
    }, keyInfo);
    ok(blocked.linePts < keyInfo.needPts, '先把本线投入清到 ' + blocked.linePts + ' 点（<' + keyInfo.needPts + '）', blocked.linePts);
    ok(blocked.r.ok === false && /本线已投入/.test(blocked.r.msg || ''), '软前置不足时被拦住，且提示写清「本线已投入」', blocked.r);

    /* 场景 B：把本线投到刚好够 → 放行 */
    const allowed = await p.evaluate((ki) => {
      const line = skillLines(ki.cls).find(l => l.name === ki.line);
      const sk = Game.skillState();
      /* 把本线的主动全部拉满，直到线内投入 ≥ needPts */
      for (const n of line.nodes) {
        if (n.kind !== 'active') continue;
        if (Game.lineSpent(ki.line) >= ki.needPts) break;
        const cur = (sk[n.id] && sk[n.id].lv) || 1;
        sk[n.id] = { lv: SKILL_LV_MAX, v: (sk[n.id] && sk[n.id].v) || 0 };
        Game.recalc();
        if (cur >= SKILL_LV_MAX) continue;
      }
      Game.recalc();
      const before = Game.lineSpent(ki.line);
      const r = Game.levelUpPassive(ki.id);
      return { linePts: before, r: r, lv: Game.passiveLv(ki.id) };
    }, keyInfo);
    ok(allowed.linePts >= keyInfo.needPts, '本线投入到 ' + allowed.linePts + ' 点（≥' + keyInfo.needPts + '）', allowed.linePts);
    ok(allowed.r.ok === true, '软前置满足后关键被动能点', allowed.r);
  }

  /* ---------------- 3. 面板：没有互斥标记，有等级锁 ---------------- */
  console.log('三、面板表现');
  const dom = await p.evaluate(() => {
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const root = document.getElementById('skList');
    return {
      fklock: root.querySelectorAll('.skt-nd.fklock').length,
      lockMark: root.querySelectorAll('.skt-or.lock').length,
      dash: root.querySelectorAll('.fk-dash').length,
      pts: root.querySelectorAll('.skt-nd.pts').length,
      soft: root.querySelectorAll('.skt-or.soft').length,
      nodes: root.querySelectorAll('.skt-nd').length,
      canvas: !!root.querySelector('.skt-plate')
    };
  });
  ok(dom.canvas, '技能树画布渲染出来了');
  ok(dom.nodes > 0, '节点有 ' + dom.nodes + ' 个', dom.nodes);
  ok(dom.fklock === 0, '没有 .fklock（互斥红）', dom.fklock);
  ok(dom.lockMark === 0, '没有「锁」标记', dom.lockMark);
  ok(dom.dash === 0, '没有互斥虚线', dom.dash);
  /* 软前置标记与「被软锁的节点」必须一一对应：多一个就是误伤，少一个就是没提示 */
  ok(dom.soft === dom.pts, '软前置标记数 == 被软锁的节点数（' + dom.soft + '/' + dom.pts + '）',
    { soft: dom.soft, pts: dom.pts });

  /* 等级锁：新建档 1 级时应该有一堆 locked 节点 */
  const lvLock = await p.evaluate(() => {
    Game.state.level = 1;
    Game.recalc();
    document.getElementById('skillPanel').classList.add('open');
    UI.renderSkillPanel();
    const root = document.getElementById('skList');
    const locked = root.querySelectorAll('.skt-nd.locked').length;
    const badges = Array.from(root.querySelectorAll('.skt-nd.locked .bg')).map(e => e.textContent);
    return { locked: locked, sample: badges.slice(0, 4) };
  });
  ok(lvLock.locked > 0, '1 级时节点被等级锁住（' + lvLock.locked + ' 个）', lvLock.locked);
  ok(lvLock.sample.every(t => /级$/.test(t)), '被锁节点角标写的是等级要求', lvLock.sample);

  /* ---------------- 4. 说明页跟着数据变 ---------------- */
  console.log('四、说明页');
  const help = await p.evaluate(() => {
    document.getElementById('helpPanel').classList.add('open');
    UI.renderHelp();
    const tabs = Array.from(document.querySelectorAll('#hpNav .hp-tab'));
    const idx = tabs.findIndex(t => /术法/.test(t.textContent));
    if (idx >= 0) { UI.hpTab = idx; UI.renderHelp(); }
    const body = document.getElementById('helpBody');
    return { tab: idx, txt: body ? body.textContent : '' };
  });
  ok(help.tab >= 0, '找到「术法」页签', help.tab);
  ok(help.txt.indexOf('三线并行') >= 0, '说明页写了「三线并行」');
  ok(help.txt.indexOf('岔口锁') < 0, '旧的「岔口锁」段落已删掉');
  ok(help.txt.indexOf('软前置') >= 0, '说明页写了关键被动的软前置');
  ok(help.txt.indexOf('二选一') < 0 || help.txt.indexOf('不再有主动与被动二选一') >= 0,
    '没有残留「主动与被动二选一」的旧说法',
    (help.txt.match(/.{0,12}二选一.{0,12}/g) || []).slice(0, 3));

  /* ---------------- 5. 报错 ---------------- */
  const realErrs = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest|favicon/.test(e));
  ok(realErrs.length === 0, '无控制台报错', realErrs.slice(0, 3));

  await b.close();
  console.log('');
  if (fail) { console.log(`✗ P1c 探针：${pass} 通过 / ${fail} 失败`); process.exit(1); }
  console.log(`✓ P1c 探针：${pass} 通过 / 0 失败`);
})();
