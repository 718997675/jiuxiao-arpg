/* ============================================================
 * [C1] 机制型技能变体 · 浏览器端验证（驱动真实 Game / SKILLS）
 *
 *   node dev/test-c1-specials.js [warrior|mage|taoist]
 *
 * 覆盖：
 *   A. 数据层：17 种机制全部登记、36 条变体 Ⅲ 全部改成机制型、
 *      没有「写了 special 但没登记」的脏数据
 *   B. 施法分支：applySkillSpecial / applySkillDot 真的挂在 Game 上
 *   C. 实战结算（每个职业挑 4 个机制，真放技能、真看敌人状态）：
 *      流血 DoT / 灼烧 / 定身 / 眩晕 / 击退 / 聚拢 /
 *      回响 / 终爆 / 领域 / 寒域 / 治疗波 / 兽群 / 净化 / 回春
 * ============================================================ */
const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLS = process.argv[2] || 'warrior';
if (!['warrior', 'mage', 'taoist'].includes(CLS)) {
  console.log('用法：node dev/test-c1-specials.js [warrior|mage|taoist]');
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

/* 每个职业挑 4 个技能实测：id → [机制, 等待毫秒, 断言名] */
const CASES = {
  warrior: [
    ['whirl', 'bleed', 320, '旋风斩·血旋 → 流血 DoT'],
    ['quake', 'endBurst', 1900, '裂地震击·裂地 → 1.5s 终爆'],
    ['warcry', 'shockwave', 320, '战意咆哮·战吼 → 击退'],
    ['leap', 'pull', 550, '跃击·坠地 → 聚拢']
  ],
  mage: [
    ['fireball', 'explode', 320, '火球术·炎爆 → 爆裂'],
    ['frostnova', 'freeze', 320, '冰霜新星·冰封 → 定身'],
    ['chain', 'echo', 700, '雷弧链·雷回 → 0.45s 回响'],
    ['thundercloud', 'stun', 320, '雷云·雷暴 → 麻痹']
  ],
  taoist: [
    ['talisman', 'explode', 320, '五雷符·引雷 → 爆裂'],
    ['heal', 'healBurst', 320, '回春咒·济世 → 治疗波伤害'],
    ['poison', 'slowField', 1300, '蚀骨毒雾·腐骨 → 寒域减速'],
    ['summon', 'extraSummon', 320, '召灵兽·兽群 → 额外灵狼']
  ]
};

(async () => {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle']
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?cls=' + CLS, { waitUntil: 'load' });
  await wait(2200);

  const boot = await p.evaluate(() => ({
    game: typeof Game,
    state: !!(typeof Game !== 'undefined' && Game.state),
    running: !!(typeof Game !== 'undefined' && Game.running)
  }));
  if (!(boot.game === 'object' && boot.state && boot.running)) {
    console.log('游戏未能启动：', JSON.stringify(boot));
    if (errs.length) console.log(errs.join('\n'));
    await b.close();
    process.exit(1);
  }

  /* ================= A. 数据层 ================= */
  console.log('\nA. 机制变体数据（' + CLS + '）');
  const A = await p.evaluate(() => {
    const R = {};
    R.specialCount = Object.keys(SKILL_SPECIALS).length;
    R.variantCount = specialVariantCount();
    R.skillTotal = Object.keys(SKILLS).length;
    /* 每个技能都必须有一条机制变体，否则「108 变体」还是纯数值 */
    R.noMech = [];
    R.badId = [];
    R.sameName = [];
    const used = {};
    for (const id in SKILLS) {
      const sk = SKILLS[id];
      let hit = -1;
      for (let i = 0; i < (sk.variants || []).length; i++) {
        const sp = sk.variants[i].special;
        if (!sp) continue;
        if (!SKILL_SPECIALS[sp]) R.badId.push(id + ':' + sp);
        hit = i; used[sp] = (used[sp] || 0) + 1;
      }
      if (hit < 0) R.noMech.push(id);
      /* 机制变体的 name/desc 必须被覆盖过（不能还是「省力 / 消耗 -25%」） */
      if (hit >= 0 && /消耗 -|冷却 -|伤害 \+/.test(sk.variants[hit].desc)) R.sameName.push(id);
    }
    R.used = used;
    R.unused = Object.keys(SKILL_SPECIALS).filter(k => !used[k]);
    /* 变体总数仍是 108，不能被改少 */
    R.totalVariants = Object.keys(SKILLS).reduce((n, id) => n + (SKILLS[id].variants || []).length, 0);
    R.fns = {
      special: typeof Game.applySkillSpecial,
      dot: typeof Game.applySkillDot,
      query: typeof variantSpecial
    };
    return R;
  });
  ok(A.specialCount === 17, '机制登记表 17 条', A.specialCount);
  ok(A.skillTotal === 36, '技能仍是 36 个', A.skillTotal);
  ok(A.variantCount === 36, '机制型变体 36 条（每技能 1 条）', A.variantCount);
  ok(A.totalVariants === 108, '变体总数仍为 108', A.totalVariants);
  ok(A.noMech.length === 0, '每个技能都有机制变体', A.noMech.join(','));
  ok(A.badId.length === 0, '没有未登记的 special id', A.badId.join(','));
  ok(A.sameName.length === 0, '机制变体的说明已重写（不再是纯数值文案）', A.sameName.join(','));
  ok(A.unused.length === 0, '17 种机制全部被用到', A.unused.join(','));
  ok(A.fns.special === 'function' && A.fns.dot === 'function' && A.fns.query === 'function',
    'applySkillSpecial / applySkillDot / variantSpecial 均已挂载', JSON.stringify(A.fns));

  /* ================= B. 实战结算 ================= */
  console.log('\nB. 机制实测（' + CLS + '）');
  for (const [id, mech, ms, label] of CASES[CLS]) {
    const r = await p.evaluate(async (id, ms, mech) => {
      const G = Game;
      /* 清场：上一轮的怪会干扰判定 */
      G.enemies.forEach(e => { e.dead = true; });
      G.enemies.length = 0;
      G.allies.length = 0;
      G.state.mp = 9999;
      G.state.hp = G.state.stats.hpMax;
      G.dead = false; G.running = true;
      G.skillFlags[id] = true;
      G.cooldowns[id] = 0;
      G.setSkillVariant(id, 2);
      const pp = G.playerGroup.position;
      /* 跃击是突进：落点在 10 码外，聚拢范围当然要以落点为圆心，
       * 所以这组用例得把敌人摆在落点周围，否则拉的是空气 */
      const ox = (mech === 'pull') ? 4.5 : 0;
      const kind = Object.keys(MONSTERS)[0];
      const mk = (dx, dz) => {
        const e = G.spawnEnemy(kind, pp.x + ox + dx, pp.z + dz, false, 1);
        e.hp = e.maxHp = 1e9;       // 别被一发打死，否则看不到 DoT
        /* 测聚拢时把 AI 冻住：怪物自己的追击 + 分离逻辑会把间距又推回去，
         * 那样测出来的是「AI 的移动」，不是「pull 的位移」 */
        if (mech === 'pull') e.stun = 5;
        return e;
      };
      const es = [mk(1.6, 0), mk(-1.6, 0.5), mk(0.2, 2.0)];
      const d0 = es.map(e => Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z));
      /* 敌人彼此的距离：击退 / 聚拢都按「相对中心的距离变化」判，
       * 但突进类技能会把玩家自己带走，所以还要留一份两两间距做交叉验证 */
      const gap0 = Math.hypot(es[0].pos.x - es[2].pos.x, es[0].pos.z - es[2].pos.z);
      const hp0 = es.map(e => e.hp);
      G.aimPoint.set(pp.x + 1.6, 0, pp.z);
      G.aimDir.set(1, 0, 0);
      const ally0 = G.allies.length;
      const buff0 = G.buffs.length;
      /* 聚拢要单独测：突进技能会把玩家自己带走，castSkill 的位移和 pull 混在一起
       * 就分不清是谁动的。这里直接调机制入口，玩家不动，位移只可能来自 pull。 */
      if (mech === 'pull') {
        G.applySkillSpecial(SKILLS[id], id, 'pull', {
          pp: new THREE.Vector3(pp.x, 0, pp.z),
          aim: new THREE.Vector3(pp.x + ox, 0, pp.z),
          spow: 1, srad: 1
        });
      } else {
        G.castSkill(id);
      }
      await new Promise(r => setTimeout(r, ms));
      return {
        hpDrop: es.map((e, i) => Math.round(hp0[i] - e.hp)),
        dotT: es.map(e => +(e.dotT || 0).toFixed(2)),
        stun: es.map(e => +(e.stun || 0).toFixed(2)),
        slow: es.map(e => +(e.slow || 0).toFixed(2)),
        d1: es.map(e => +Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z).toFixed(2)),
        d0: d0.map(v => +v.toFixed(2)),
        gap0: +gap0.toFixed(2),
        gap1: +Math.hypot(es[0].pos.x - es[2].pos.x, es[0].pos.z - es[2].pos.z).toFixed(2),
        allyAdd: G.allies.length - ally0,
        buffAdd: G.buffs.length - buff0
      };
    }, id, ms, mech);

    const anyHit = r.hpDrop.some(v => v > 0);
    if (mech === 'bleed') {
      ok(r.dotT.some(v => v > 0), label + '：敌人挂上流血', JSON.stringify(r.dotT));
    } else if (mech === 'endBurst') {
      ok(anyHit, label + '：延迟爆发真的掉血', JSON.stringify(r.hpDrop));
    } else if (mech === 'echo') {
      ok(anyHit, label + '：回响第二轮掉血', JSON.stringify(r.hpDrop));
    } else if (mech === 'explode') {
      ok(anyHit, label + '：爆裂追加伤害', JSON.stringify(r.hpDrop));
    } else if (mech === 'healBurst') {
      ok(anyHit, label + '：治疗波对敌人造成伤害', JSON.stringify(r.hpDrop));
    } else if (mech === 'freeze' || mech === 'stun') {
      ok(r.stun.some(v => v > 0), label + '：敌人被控住', JSON.stringify(r.stun));
    } else if (mech === 'slowField') {
      ok(r.slow.some(v => v > 0), label + '：敌人被减速', JSON.stringify(r.slow));
    } else if (mech === 'shockwave') {
      ok(r.d1.some((v, i) => v > r.d0[i] + 0.2), label + '：敌人被击退', r.d0 + ' → ' + r.d1);
      ok(anyHit, label + '：附带伤害', JSON.stringify(r.hpDrop));
    } else if (mech === 'pull') {
      /* 玩家不动、AI 冻住，位移只可能来自 pull。
       * 只要求「范围内那几只」被拉近 —— 半径外的怪本来就该原地不动。 */
      const pulled = r.d1.filter((v, i) => v < r.d0[i] - 0.3).length;
      ok(pulled >= 2, label + '：敌人被拉近', r.d0 + ' → ' + r.d1);
    } else if (mech === 'extraSummon') {
      ok(r.allyAdd >= 1, label + '：召唤物增加', r.allyAdd);
    }
  }

  /* ================= C. 特殊机制 ================= */
  console.log('\nC. 状态类机制（' + CLS + '）');
  const C = await p.evaluate(async () => {
    const G = Game;
    const R = {};
    /* 清场：上一节留的怪会在 2 秒里一直打玩家，把回血量抵消成负增长 */
    G.enemies.forEach(e => { e.dead = true; });
    G.enemies.length = 0;
    G.allies.length = 0;
    /* 净化：先把负面状态挂满，再放解毒（变体 Ⅲ） */
    G.dead = false; G.running = true;
    G.playerSlow = 0.5; G.playerSlowT = 5;
    G.poisonT = 5; G.poisonDps = 10;
    G.buffs.push({ name: '迟滞', stats: {}, dur: 5, color: '#6ab8ff', type: 'debuff', icon: '缓', desc: '' });
    G.buffs.push({ name: '血怒', stats: {}, dur: 5, color: '#ff4a4a', type: 'buff', icon: '血', desc: '' });
    G.state.mp = 9999;
    G.skillFlags.antidote = true;
    G.cooldowns.antidote = 0;
    G.setSkillVariant('antidote', 2);
    const hpBefore = G.state.hp = G.state.stats.hpMax * 0.5;
    G.castSkill('antidote');
    await new Promise(r => setTimeout(r, 200));
    R.slowT = G.playerSlowT;
    R.poisonT = G.poisonT;
    R.debuffLeft = G.buffs.filter(b => b.type === 'debuff').length;
    R.buffLeft = G.buffs.filter(b => b.type === 'buff').length;
    R.healed = G.state.hp > hpBefore;

    /* 回春：太极玄阵（变体 Ⅲ）6 秒内每秒回 2% */
    G.buffs.length = 0;
    G.state.hp = G.state.stats.hpMax * 0.3;
    const hp0 = G.state.hp;
    G.skillFlags.taiji = true;
    G.cooldowns.taiji = 0;
    G.setSkillVariant('taiji', 2);
    G.castSkill('taiji');
    await new Promise(r => setTimeout(r, 2300));
    R.regenGain = Math.round(G.state.hp - hp0);
    R.regenExpect = Math.round(G.state.stats.hpMax * 0.02 * 2);
    return R;
  });
  ok(C.slowT === 0 && C.poisonT === 0, '解毒·净化：减速与中毒被清除', JSON.stringify(C));
  ok(C.debuffLeft === 0, '解毒·净化：减益条目清空', C.debuffLeft);
  ok(C.buffLeft >= 1, '解毒·净化：增益条目保留', C.buffLeft);
  ok(C.healed, '解毒·净化：回复 10% 生命');
  ok(C.regenGain > 0, '太极·玄阵：持续回血生效', C.regenGain);
  ok(C.regenGain <= C.regenExpect + 30, '太极·玄阵：回血量按 2%/秒（不会失控）',
    C.regenGain + ' vs ' + C.regenExpect);

  /* ================= D. UI ================= */
  console.log('\nD. 术法面板标注');
  const D = await p.evaluate(() => {
    Game.setSkillVariant('whirl', 2);
    UI.openSkill && UI.openSkill();
    const btns = [...document.querySelectorAll('.sk-vbtn')];
    const mech = btns.filter(b => b.classList.contains('mech'));
    const tag = document.querySelector('.sd-mech');
    return { btns: btns.length, mech: mech.length, tag: tag ? tag.textContent.trim() : null };
  });
  ok(D.btns > 0, '术法面板渲染出变体按钮', D.btns);
  ok(D.mech >= 1, '机制变体按钮带 mech 标记', D.mech);
  ok(!!D.tag && /机制/.test(D.tag), '详情卡显示机制标签', D.tag);

  if (errs.length) {
    console.log('\n控制台错误：');
    errs.slice(0, 8).forEach(e => console.log('  · ' + e));
  }
  ok(errs.length === 0, '无页面报错', errs.length);

  console.log('\n' + (fail === 0 ? '✓ 全部通过' : '✗ 有失败项') + `  ${pass} pass / ${fail} fail`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
