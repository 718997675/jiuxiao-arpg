#!/usr/bin/env node
/* ============================================================================
 * 重名 / 效果重复 审计（真机，跑 docs/boss-vfx-playground.html）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/dup-audit.js
 *   NODE_PATH=/Users/niekai/node_modules node dev/dup-audit.js --rt   （跳过静态段）
 *
 * 为什么不能只看源码：上一版 45 个 `NR` 函数两两不同，但 9 只「砸」打出来
 * 是同一件事。**源码不同 ≠ 效果不同**。所以这里分两层：
 *
 *   静态   名字查重（112 个键、跨 5 个系统）、run() 源码查重
 *   运行时 把 17 个 `BFX` 原语全包一层，记录「这一招到底画了什么、画了几个、
 *          多大、多久」—— 几何 / 数量 / 时长进指纹，**颜色和坐标不进**
 *          （换皮就是只换颜色）。再两两比相似度，并单独看「同一只 5 格内部」。
 *
 * 纯位置差异（摆在哪）不算重复；纯颜色差异算重复 —— 那正是要抓的东西。
 * ==========================================================================*/
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXE = require('./_chrome');

const URL = 'file://' + path.resolve(__dirname, '..', 'docs', 'boss-vfx-playground.html');
const GROUP_CN = { mech: '机制', shared: '套路', sign: '签名', native: '本命', wb: '世界' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const onlyRt = process.argv.includes('--rt');
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await browser.newPage();
  await p.setViewport({ width: 1100, height: 720 });
  const pageErrs = [];
  p.on('pageerror', e => pageErrs.push(e.message));
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof SKILL_INDEX === "object" && Object.keys(SKILL_INDEX).length > 50');
  await wait(600);

  /* 关掉开场遮罩 + 停掉 rAF 推帧（跟 probe-playground 同一套） */
  await p.evaluate(() => {
    const b = document.getElementById('startBtn'); if (b) b.click();
    const it = document.getElementById('intro'); if (it) it.style.display = 'none';
  });
  await p.evaluate(() => { FROZEN = true; });

  const meta = await p.evaluate(() => {
    const rows = Object.keys(SKILL_INDEX).map(k => {
      const s = SKILL_INDEX[k];
      let h = null;
      try { h = s.hit ? s.hit() : null; } catch (e) { h = { err: e.message }; }
      return {
        k, g: s.group, name: s.name || '', kind: s.kind || '',
        rule: s.counter || s.rule || '',
        hit: h ? Object.keys(h).sort().map(kk => kk + '=' + (typeof h[kk] === 'number' ? Math.round(h[kk] * 10) / 10 : h[kk])).join(',') : '',
        runSrc: s.run ? s.run.toString() : ''
      };
    });
    return { rows, kits: KIT, defs: BOSSES_DEF.map(b => ({ id: b.id, name: b.name, wb: !!b.wb })) };
  });

  const byKey = {};
  meta.rows.forEach(r => byKey[r.k] = r);
  const bossName = {};
  meta.defs.forEach(d => bossName[d.id] = d.name);
  const users = {};
  Object.keys(meta.kits).forEach(id => meta.kits[id].forEach((k, slot) => {
    (users[k] = users[k] || []).push(id + '#' + (slot + 1));
  }));
  const line = n => console.log('\n' + '─'.repeat(78) + '\n' + n);

  if (!onlyRt) {
    const cnt = {};
    meta.rows.forEach(r => cnt[r.g] = (cnt[r.g] || 0) + 1);
    console.log('名录：' + meta.rows.length + ' 个技能键 ｜ ' +
      Object.keys(cnt).map(g => (GROUP_CN[g] || g) + ' ' + cnt[g]).join(' · '));

    line('一、重名：不同 key 用了同一个 name');
    const byName = {};
    meta.rows.forEach(r => { if (r.name) (byName[r.name] = byName[r.name] || []).push(r); });
    let n1 = 0;
    Object.keys(byName).forEach(n => {
      if (byName[n].length < 2) return;
      n1++;
      console.log('  ✗ 「' + n + '」 ×' + byName[n].length);
      byName[n].forEach(r => console.log('      ' + r.k.padEnd(16) + '[' + (GROUP_CN[r.g] || r.g) + '] ← ' + (users[r.k] || ['（没人用）']).join(', ')));
    });
    console.log(n1 ? '  小计 ' + n1 + ' 组' : '  ✓ 无');

    line('二、源码同形：两个不同 key 的 run() 一字不差');
    const byRun = {};
    meta.rows.forEach(r => { const h = norm(r.runSrc); if (h.length > 60) (byRun[h] = byRun[h] || []).push(r); });
    let n2 = 0;
    Object.keys(byRun).forEach(h => {
      if (byRun[h].length < 2) return;
      n2++;
      console.log('  ✗ ' + byRun[h].map(r => r.k + '「' + r.name + '」').join('  ==  '));
    });
    console.log(n2 ? '  小计 ' + n2 + ' 组' : '  ✓ 无');
  }

  /* ---------------- 运行时指纹 ---------------- */
  line('三、运行时指纹（颜色 / 坐标不进；几何 · 数量 · 时长进）');
  const rts = await p.evaluate(() => {
    let seed = 20261101;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const realRandom = Math.random;
    Math.random = rnd;

    const PRIMS = ['spr', 'burst', 'shock', 'zone', 'column', 'spikes', 'ribbon', 'decal', 'wave',
      'arcSlash', 'blade', 'boulder', 'trail', 'entity', 'pool', 'beam', 'wall'];
    const POS = new Set(['x', 'z', 'y', 'pos', 'a', 'b', 'from', 'to', 'at', 'angle', 'yaw', 'tiltX', 'tiltZ', 'rot', 'rotY',
      /* 单颗粒的速度/方向：几百颗粒子各记一条，纯噪声 */
      'vx', 'vy', 'vz', 'drag']);
    const COLORISH = new Set(['color', 'core', 'c', 'c0', 'c1', 'glow', 'tint']);
    const saved = {};
    let LOG = [];
    const describe = (o) => {
      const out = [];
      if (!o || typeof o !== 'object') return out;
      Object.keys(o).sort().forEach(k => {
        const v = o[k];
        if (POS.has(k) || COLORISH.has(k)) return;
        if (typeof v === 'number') {
          if (!isFinite(v) || Math.abs(v) > 65535) return;   /* 颜色值都是大整数 */
          out.push(k + '=' + (Math.round(v * 10) / 10));
        } else if (typeof v === 'string' || typeof v === 'boolean') out.push(k + '=' + v);
      });
      return out;
    };
    PRIMS.forEach(n => {
      const f = BFX[n];
      if (typeof f !== 'function') return;
      saved[n] = f;
      BFX[n] = function (...args) {
        let o = args[0];
        if (n === 'spr') return saved[n].apply(this, args);
        if (!o || typeof o !== 'object') o = args.find(a => a && typeof a === 'object' && !a.isObject3D) || {};
        LOG.push(n + '|' + describe(o).join(','));
        return saved[n].apply(this, args);
      };
    });

    const out = {};
    for (const id of Object.keys(SKILL_INDEX)) {
      const sk = SKILL_INDEX[id];
      seed = 20261101;
      clearStage();
      LOG = [];
      try { if (sk.hit) sk.hit(); sk.run(); } catch (e) { out[id] = { err: e.message, calls: [] }; continue; }
      for (let i = 0; i < Math.round(6.5 * 60); i++) simulate(1 / 60);
      out[id] = { calls: LOG.slice() };
      clearStage();
    }
    Math.random = realRandom;
    PRIMS.forEach(n => { if (saved[n]) BFX[n] = saved[n]; });
    return out;
  });
  const rtErr = Object.keys(rts).filter(k => rts[k].err);
  if (rtErr.length) console.log('  ⚠ 运行时抛错：' + rtErr.map(k => k + '(' + rts[k].err + ')').join(', '));

  /* 指纹：数字量化到粗档（同一个"量级"就算同一件事），再比 Jaccard */
  const Q = v => v <= .3 ? 0 : v <= 1 ? 1 : v <= 2 ? 2 : v <= 4 ? 3 : v <= 6 ? 4 : v <= 9 ? 5 : v <= 12 ? 6 : 7;
  const fp = {};
  Object.keys(rts).forEach(id => {
    const set = new Set();
    (rts[id].calls || []).forEach(c => {
      const [prim, rest] = [c.split('|')[0], c.split('|').slice(1).join('|')];
      const norm2 = rest.split(',').filter(Boolean).map(kv => {
        const m = kv.split('=');
        const num = parseFloat(m[1]);
        return m[0] + (isFinite(num) && String(num) === m[1] ? '=q' + Q(num) : '=' + m[1]);
      }).sort().join(',');
      set.add(prim + '|' + norm2);
    });
    fp[id] = { set, n: (rts[id].calls || []).length };
  });
  const sim = (a, b) => {
    const A = fp[a].set, B = fp[b].set;
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  };

  /* --show a,b,c ：直接把这几招的调用日志打出来，人工比对用 */
  const showArg = process.argv.find(a => a.startsWith('--show='));
  if (showArg) {
    showArg.slice(7).split(',').forEach(id => {
      const c = (rts[id] && rts[id].calls) || [];
      const agg = {};
      c.forEach(x => agg[x] = (agg[x] || 0) + 1);
      console.log('\n### ' + id + '「' + (byKey[id] || {}).name + '」 ' + c.length + ' 次调用');
      Object.keys(agg).sort().forEach(k => console.log('   ×' + String(agg[k]).padStart(2) + '  ' + k));
    });
    await browser.close();
    return;
  }

  const ids = meta.rows.map(r => r.k);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const s = sim(ids[i], ids[j]);
    if (s >= (onlyRt ? 0.42 : 0.6)) pairs.push([ids[i], ids[j], s]);
  }
  pairs.sort((a, b) => b[2] - a[2]);
  console.log('  近重复：' + pairs.length + ' 对（阈值 ' + (onlyRt ? '0.42' : '0.60') + '）');
  pairs.slice(0, 60).forEach(([a, b, s]) => {
    const shared = Object.keys(meta.kits).filter(id => meta.kits[id].indexOf(a) >= 0 && meta.kits[id].indexOf(b) >= 0);
    console.log('    ' + (s * 100).toFixed(0).padStart(3) + '%  ' +
      (a + '「' + byKey[a].name + '」').padEnd(30) + ' ~ ' + (b + '「' + byKey[b].name + '」').padEnd(30) +
      (shared.length ? '  ← 同一只：' + shared.join(',') : ''));
  });

  line('四、同一只 Boss 的 5 格里，哪两格在做同一件事');
  let n4 = 0;
  Object.keys(meta.kits).forEach(id => {
    const kit = meta.kits[id];
    for (let i = 0; i < kit.length; i++) for (let j = i + 1; j < kit.length; j++) {
      const a = kit[i], b = kit[j], A = byKey[a], B = byKey[b];
      if (!A || !B) continue;
      const why = [];
      if (A.name && A.name === B.name) why.push('同名');
      if (norm(A.runSrc).length > 60 && norm(A.runSrc) === norm(B.runSrc)) why.push('同源码');
      const s = sim(a, b);
      if (s >= 0.45) why.push('指纹 ' + (s * 100).toFixed(0) + '%');
      if (!why.length) continue;
      n4++;
      console.log('  ✗ ' + (bossName[id] || id).padEnd(12) + ' 第' + (i + 1) + '/' + (j + 1) + '格  ' +
        a + '「' + A.name + '」 ↔ ' + b + '「' + B.name + '」  →  ' + why.join(' + '));
    }
  });
  console.log(n4 ? '  小计 ' + n4 + ' 处' : '  ✓ 无');

  if (pageErrs.length) console.log('\n页面异常：\n  ' + pageErrs.join('\n  '));
  await browser.close();
})();
