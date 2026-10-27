/* ============================================================
 * 技能 P1b 真机探针：动作条 8 → 5（左键 + 1~4）
 *
 *   NODE_PATH=/Users/niekai/node_modules node dev/probe-bar5.js
 *
 * 检查：
 *   1. 动作条就是 5 格，格上标的是 左键/1/2/3/4
 *   2. 越位拦截真的会拦（② 的技能塞不进 ① 格），本位放得进
 *   3. 左键：① 号位能放就放技能、放不了（没蓝 / 冷却）退化普攻
 *   4. 键 1 打的是 bar[1]（② 号位），键 5 已经不再占位
 *   5. 老 8 格档：SaveManager 整形后是 5 格且每格都在本位；一次性全退生效
 *   6. 手机：宫格 4 个技能键 + 一枚「攻」，零重叠
 *   7. 零控制台报错
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(f => fs.existsSync(f));

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 180)));
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await wait(1400);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await p.reload({ waitUntil: 'load' });
  await wait(1200);
  await p.evaluate(() => document.getElementById('startBtn').click());
  await wait(1800);

  /* ---------------- 1. 动作条结构 ---------------- */
  const bar = await p.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('#actionbar .skill'));
    return {
      cls: Game.state.cls,
      slots: SKILL_BAR_SLOTS,
      bar: Game.skillBar(),
      len: Game.skillBar().length,
      cells: cells.length,
      keys: cells.map(e => (e.querySelector('.k') || {}).textContent || ''),
      ids: cells.map(e => e.dataset.skill || '')
    };
  });
  console.log('动作条:', JSON.stringify(bar));
  ok(bar.slots === 5 && bar.len === 5, '动作条数据必须是 5 格', bar.len);
  ok(bar.cells === 5, '界面上必须画出 5 格', bar.cells);
  ok(bar.keys.join(',') === '左键,1,2,3,4', '格上的键位必须是 左键 + 1~4', bar.keys.join(','));
  ok(bar.bar[0] && bar.bar.filter(Boolean).length >= 1, '① 号位默认要有技能', JSON.stringify(bar.bar));

  /* ---------------- 2. 越位拦截 ---------------- */
  const gate = await p.evaluate(() => {
    const cls = Game.state.cls;
    Game.state.level = 40;                    // 解锁全部技能，只测格位规则
    const order = SKILL_ORDER[cls] || [];
    const id2 = order.find(id => skillArchSlotOf(cls, id) === 2);
    const id1 = order.find(id => skillArchSlotOf(cls, id) === 1);
    const wrong = Game.assignSkillBar(0, id2);   // ② 塞进 ①
    const right = Game.assignSkillBar(1, id2);   // ② 进 1 键
    const right1 = Game.assignSkillBar(0, id1);  // ① 进左键格
    return {
      cls: cls, id1: id1, id2: id2,
      wrong: wrong, right: right, right1: right1,
      bar: Game.skillBar()
    };
  });
  console.log('格位规则:', JSON.stringify(gate.wrong), '|', JSON.stringify(gate.right));
  ok(gate.wrong.ok === false, '② 的技能不许塞进 ① 格', JSON.stringify(gate.wrong));
  ok(/号位/.test(gate.wrong.msg || ''), '拒绝理由要说清是几号位', gate.wrong.msg);
  ok(gate.right.ok === true && gate.bar[1] === gate.id2, '本位技能放得进', JSON.stringify(gate.bar));
  ok(gate.right1.ok === true && gate.bar[0] === gate.id1, '① 号位技能能回左键格', JSON.stringify(gate.bar));

  /* ---------------- 3. 左键 = ① 号位（能放就放，放不了退化普攻） ---------------- */
  const left = await p.evaluate(() => {
    Game.cooldowns = {}; Game.atkCd = 0; Game.state.mp = 9999;
    const id = Game.skillBar()[0];
    const canCast = Game.castable(id);
    Game.primaryAttack();
    const castedCd = Game.cooldowns[id] || 0;
    const atkAfterCast = Game.atkCd;
    /* 没蓝：清冷却后再按，应该掉回普攻（技能不进冷却，atkCd 被普攻设上） */
    Game.cooldowns = {}; Game.atkCd = 0; Game.state.mp = 0;
    const canCastNoMp = Game.castable(id);
    Game.primaryAttack();
    return {
      id: id, canCast: canCast, castedCd: castedCd, atkAfterCast: atkAfterCast,
      canCastNoMp: canCastNoMp,
      cdAfterNoMp: Game.cooldowns[id] || 0,
      atkAfterNoMp: Game.atkCd
    };
  });
  console.log('左键:', JSON.stringify(left));
  ok(left.canCast === true, '满蓝时 ① 号位应判定可放', JSON.stringify(left));
  ok(left.castedCd > 0, '左键必须真的把小技能放出去（进冷却）', left.castedCd);
  ok(left.canCastNoMp === false, '没蓝时必须判定放不了');
  ok(left.cdAfterNoMp === 0, '没蓝时不许偷偷放技能', left.cdAfterNoMp);
  ok(left.atkAfterNoMp > 0, '没蓝时必须退化普攻（atkCd 被设上）', left.atkAfterNoMp);

  /* ---------------- 4. 键 1 打 bar[1]，键 5 不占位 ---------------- */
  const keys = await p.evaluate(() => {
    Game.cooldowns = {}; Game.state.mp = 9999;
    const id1 = Game.skillBar()[1];
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    const cd1 = id1 ? (Game.cooldowns[id1] || 0) : -1;
    Game.cooldowns = {}; Game.state.mp = 9999;
    const before = Object.keys(Game.cooldowns).length;
    /* 键 5 在旧版是第 5 格；现在只有 4 个数字键，按 5 不该放任何技能 */
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }));
    const cd5 = Object.keys(Game.cooldowns).length;
    return { id1: id1, cd1: cd1, used5: cd5 - before };
  });
  console.log('数字键:', JSON.stringify(keys));
  ok(keys.id1 && keys.cd1 > 0, '键 1 必须施放 bar[1]（② 号位）', JSON.stringify(keys));
  ok(keys.used5 === 0, '键 5 已经不再占位（不施放任何技能）', keys.used5);

  /* ---------------- 5. 老 8 格档 → 5 格 + 一次性全退 ---------------- */
  const mig = await p.evaluate(() => {
    const cls = Game.state.cls;
    const old8 = (SKILL_ORDER[cls] || []).slice(0, 8);
    const shaped = SaveManager._bar(old8, cls);
    /* 完整读档整形：拿当前 state 造一份「老档」 */
    const doc = JSON.parse(JSON.stringify(Game.state));
    doc.skillbar = old8.slice();
    doc.skillbar2 = old8.slice();
    doc.skills = {};
    doc.skills[old8[0]] = { lv: 5, v: 2 };
    doc.passives = { iron: 3 };
    delete doc.skillReset;
    const out = SaveManager.normalizeDoc(doc, 1).doc;
    /* 运行期整形（含一次性全退） */
    Game.normalizeProgress(out);
    /* 每格都在本位（秘技除外：它们没有功能位） */
    const misplaced = out.skillbar.filter((id, i) => {
      if (!id) return false;
      const no = skillArchSlotOf(cls, id);
      return no && no !== i + 1;
    });
    return {
      misplaced: misplaced,
      cls: cls,
      old8: old8, shaped: shaped,
      bar: out.skillbar, bar2: out.skillbar2, len: out.skillbar.length,
      skills: out.skills, reset: out.skillReset, refund: out.skillResetRefund,
      passives: Object.keys(out.passives || {}).length
    };
  });
  console.log('迁移:', JSON.stringify({ len: mig.len, bar: mig.bar, reset: mig.reset, refund: mig.refund }));
  ok(mig.len === 5, '老 8 格档整形后必须是 5 格', mig.len);
  ok(mig.misplaced.length === 0, '每格都必须落在本位（越位的一个都不许有）', JSON.stringify(mig.misplaced));
  /* 40 级老档：5 个位都有已领悟技能，补位后不该留空格（否则玩家要自己去面板找） */
  ok(mig.bar.filter(Boolean).length === 5, '老档补位后 5 格应该都是满的', JSON.stringify(mig.bar));
  /* 40 级老档：5 个位都有已领悟技能，补位后不该留空格（否则玩家要自己去面板找） */
  ok(mig.bar.filter(Boolean).length === 5, '老档补位后 5 格应该都是满的', JSON.stringify(mig.bar));
  ok(mig.bar2 && mig.bar2.length === 5, '第二套栏也要收敛到 5 格', mig.bar2 && mig.bar2.length);
  ok(mig.reset === 1, '一次性迁移标记要写进文档', mig.reset);
  ok(mig.refund >= 4, '全退点数必须记下来（4 级 + 3 被动）', mig.refund);
  ok(mig.passives === 0, '被动必须清空');
  const kept = mig.skills[mig.old8[0]] || {};
  ok(kept.lv === 1, '技能等级必须归 1', JSON.stringify(kept));
  ok(kept.v === 2, '变体必须保留', JSON.stringify(kept));

  const errs2 = errs.filter(e => !/\.glb|ERR_FAILED|XMLHttpRequest/.test(e));
  console.log('控制台错误:', errs2.length ? errs2.slice(0, 4) : '无');
  ok(errs2.length === 0, '桌面段不许有控制台报错', errs2.slice(0, 2).join(' | '));

  /* ---------------- 6. 手机：4 个技能键 + 攻 ---------------- */
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await wait(900);
  await p.evaluate(() => {
    if (typeof Game === 'undefined' || !Game.state) {
      const btn = document.getElementById('startBtn');
      if (btn) btn.click();
    }
  });
  await wait(1800);
  const mob = await p.evaluate(() => {
    const wrap = document.getElementById('mSkills');
    const cells = wrap ? Array.from(wrap.querySelectorAll('.mskill')) : [];
    const rects = cells.map(c => c.getBoundingClientRect());
    let overlap = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], c = rects[j];
        if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlap++;
      }
    }
    const atk = document.getElementById('mAtk');
    return {
      cells: cells.length, overlap: overlap,
      hasAtk: !!atk, atkRect: atk ? atk.getBoundingClientRect().width : 0,
      minW: rects.length ? Math.round(Math.min(...rects.map(r => r.width))) : 0
    };
  });
  console.log('手机宫格:', JSON.stringify(mob));
  ok(mob.cells === 4, '手机宫格只有 4 个技能键（① 在「攻」键上）', mob.cells);
  ok(mob.overlap === 0, '手机宫格不许重叠', mob.overlap);
  ok(mob.hasAtk && mob.atkRect > 0, '「攻」键必须还在', JSON.stringify(mob));
  ok(mob.minW >= 34, '手机上每个技能键至少要能按（≥34px）', mob.minW);
  await p.screenshot({ path: '/tmp/bar5-mobile.png', clip: { x: 0, y: 0, width: 390, height: 844 } });

  await b.close();
  console.log('\n' + (fail === 0 ? '✓' : '✗') + ' P1b 真机探针：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
