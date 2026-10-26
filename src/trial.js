/* ============================================================
 * 无尽试炼 · 运行时
 * ------------------------------------------------------------
 * 状态机：
 *   prep（读秒） → fight（战斗中） → 清场 → choose（三选一祝福）
 *        ↑                                        │
 *        └──────────────── nextWave ──────────────┘
 *
 * 设计要点（都是踩过的坑）：
 *  1. **不暂停游戏循环**。清场后场上没有敌人，翻牌时把面板盖上来就够了；
 *     真要暂停就得在 update 里到处加 early-return，风险远大于收益。
 *  2. **祝福走 stats 通道**（trialBonusStats 在 computePlayerStats 内部合并），
 *     所以 atkPct / hpPct 这类「乘区词条」能真正生效 —— 如果只在 recalc 之后
 *     往 stats 上叠，乘区类词条会被算完的 atk 直接吃掉，变成面板数字好看、实际没效果。
 *  3. **首领血量以本波小怪为锚点**，不用数据表里的绝对血量（见 data-trial.js）。
 *  4. 试炼里的**首领不重生**、**混沌天魔不触发通关结算**，这两处都在 game.js 里加了开关。
 * ============================================================ */

/* 场上还活着几只（含首领召唤物 / 分裂幼体） */
function trialAliveCount() {
  let n = 0;
  for (const e of Game.enemies) if (!e.dead) n++;
  return n;
}

const Trial = {
  run: null,
  _thunderT: 0,
  _blT: 0,

  get active() { return !!this.run; },

  /* ---------------- 进入 / 退出 ---------------- */

  start() {
    const G = Game, s = G && G.state;
    if (!s) return false;
    if (this.run) return false;
    if (G.dead) return false;
    if (s.level < TRIAL_CFG.unlockLevel) {
      UI.log('境界不足 ' + TRIAL_CFG.unlockLevel + ' 级，试炼场的门还闭着。', 'bad');
      UI.toast('需 ' + TRIAL_CFG.unlockLevel + ' 级', 'bad');
      return false;
    }
    UI.closeAll();
    if (!s.trial || typeof s.trial !== 'object') s.trial = { best: 0, runs: 0, bestAt: 0 };
    this.run = {
      wave: 0, phase: 'prep', prep: TRIAL_CFG.firstPrep, clearT: 0,
      bless: {}, offers: [], kills: 0, gold: 0, items: 0,
      startedAt: Date.now(), startLevel: s.level,
      mapBack: (s.mapId === 'trial' || !MAPS[s.mapId]) ? 'village' : s.mapId,
      bestBefore: s.trial.best || 0,
      spawned: 0, bossWave: false
    };
    this._thunderT = 0; this._blT = 0;
    G.loadMap('trial');
    /* loadMap 会把 mapId 写成 trial；读档时若发现 mapId=trial 但试炼没在跑，
     * 会在 loadSlot 里把玩家送回村（见 game.js） */
    G.recalc();
    UI.renderTrialHud(true);
    UI.log('【无尽试炼】踏上台来，便无退路。', 'good');
    UI.toast('无 尽 试 炼', 'lv');
    SFX.boss();
    this.nextWave();
    return true;
  },

  /* 主动退出（玩家点「退出试炼」） */
  quit() {
    if (!this.run) return;
    const w = this.run.wave;
    UI.showDialog('试炼', `当前第 ${w} 波。\n\n现在退出，本轮挑战就此作废（已入袋的装备与金币不会丢）。`, [
      { label: '继续挑战', primary: true, action: () => UI.closeAll() },
      { label: '退出试炼', action: () => { UI.closeAll(); this.end('quit'); } }
    ]);
  },

  /* 收尾：写记录、清祝福、回原图 */
  end(reason) {
    const r = this.run;
    if (!r) return;
    const s = Game.state;
    this.run = null;
    this._thunderT = 0; this._blT = 0;
    /* 清掉试炼临时 buff（嗜血狂潮） */
    if (Game.buffs && Game.buffs.length) {
      Game.buffs = Game.buffs.filter(b => b.key !== 'trial:bloodlust');
    }
    let isBest = false;
    if (s) {
      if (!s.trial || typeof s.trial !== 'object') s.trial = { best: 0, runs: 0, bestAt: 0 };
      s.trial.runs = (s.trial.runs || 0) + 1;
      if (r.wave > (s.trial.best || 0)) {
        s.trial.best = r.wave;
        s.trial.bestAt = Date.now();
        isBest = true;
      }
    }
    Game.recalc();
    UI.closeTrialBless();
    UI.renderTrialHud(false);
    const back = (MAPS[r.mapBack] && r.mapBack !== 'trial') ? r.mapBack : 'village';
    if (!Game.dead) Game.loadMap(back);
    if (isBest && r.wave > 0) {
      UI.toast('新纪录 · 第 ' + r.wave + ' 波', 'lv');
      UI.log('【试炼】新纪录：第 ' + r.wave + ' 波。', 'good');
    }
    if (reason === 'death') {
      UI.log('【试炼】止步第 ' + r.wave + ' 波。', 'bad');
    } else if (reason === 'quit' && r.wave > 0) {
      UI.log('【试炼】退出于第 ' + r.wave + ' 波。', '');
    }
    Game.save();
    return { wave: r.wave, isBest, kills: r.kills, items: r.items, gold: r.gold, reason };
  },

  /* 死亡：先亮结算面板，玩家点「回到桃源村」才真正结束 */
  onPlayerDeath() {
    const r = this.run;
    if (!r) return;
    const s = Game.state;
    const best = (s.trial && s.trial.best) || 0;
    UI.showTrialEnd({
      wave: r.wave,
      isBest: r.wave > best,
      best: Math.max(best, r.wave),
      kills: r.kills,
      items: r.items,
      gold: r.gold,
      levelFrom: r.startLevel,
      levelTo: s.level,
      seconds: Math.round((Date.now() - r.startedAt) / 1000)
    });
  },

  /* 结算面板的「回村」按钮 */
  finishDeath() {
    UI.hideTrialEnd();
    this.end('death');
    Game.respawn();
  },

  /* ---------------- 波次 ---------------- */

  nextWave(shortPrep) {
    const r = this.run;
    if (!r) return;
    r.wave++;
    r.phase = 'prep';
    r.prep = (r.wave === 1) ? TRIAL_CFG.firstPrep
      : (shortPrep ? TRIAL_CFG.nextDelay : TRIAL_CFG.prepTime);
    r.clearT = 0;
    r.spawned = 0;
    r.alive = 0;
    r.bossWave = trialIsBossWave(r.wave);
    UI.renderTrialHud(true);
    UI.trialBanner(r.wave, r.bossWave ? (trialIsBigBossWave(r.wave) ? 'big' : 'boss') : 'normal');
    if (r.bossWave) SFX.boss();
  },

  spawnWave() {
    const r = this.run, G = Game, s = G.state;
    if (!r) return;
    const w = r.wave;
    const lvl = trialEnemyLevel(w, s.level);
    const hpMul = trialHpMul(w);
    const dmgMul = trialDmgMul(w);
    const isBoss = trialIsBossWave(w);
    const isBig = trialIsBigBossWave(w);
    const eliteChance = trialEliteChance(w);

    r.phase = 'fight';
    r.spawned = 0;
    this._gen = G.mapGen;

    const pp = G.playerGroup.position;
    /* 环形成阵：怪物从外圈围上来，玩家有反应时间，也方便判断「从哪边来」 */
    const trash = isBoss ? Math.max(3, Math.round(trialWaveCount(w) * 0.55)) : trialWaveCount(w);
    const pool = trialMobPool(w);
    const spawned = [];

    for (let i = 0; i < trash; i++) {
      const ang = (i / Math.max(1, trash)) * Math.PI * 2 + RND(-0.22, 0.22);
      /* 半径 11~18：默认镜头（camDist 11.6 / FOV 46）能看到的范围大约就是
       * 12~14 米，怪刷在 15~24 会全部落在屏幕外 —— 玩家只会听到「有东西来了」
       * 却看不见，完全失去「一波压上来」的压迫感。 */
      const rad = RND(11, 18);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const kind = PICK(pool);
      const e = G.spawnEnemy(kind, x, z, CHANCE(eliteChance), lvl);
      if (!e) continue;
      e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * hpMul));
      e.dmg *= dmgMul;
      e.trialWave = w;
      e.aggro = true;
      spawned.push(e);
      FX.flashCircle(e.pos, 1.25, 0x9a66ff, 0.45);
      const p0 = e.pos.clone();
      setTimeout(() => {
        if (!Game.state || Game.mapGen !== this._gen) return;
        FX.ring(p0, 1.1, 0xb08aff, 0.5, 0.22);
      }, 40 + i * 18);
    }

    /* ---- 首领 ---- */
    if (isBoss) {
      const bossId = trialBossFor(w);
      const bcfg = BOSSES[bossId];
      const bx = 0, bz = -15;
      const b = G.spawnEnemy(null, bx, bz, false, lvl, bossId);
      if (b) {
        /* 锚点：本波小怪的平均血量/攻击。首领的强度来自「多少只小怪的量」，
         * 而不是数据表里的绝对数字 —— 这样第 5 波和第 45 波的首领战长度一致。 */
        let avgHp = 0, avgAtk = 0, n = 0;
        for (const e of spawned) { avgHp += e.maxHp; avgAtk += e.dmg; n++; }
        if (!n) {
          const prof = poolProfileOf(pool, lvl, hpMul, dmgMul);
          avgHp = prof.hp; avgAtk = prof.atk;
        } else { avgHp /= n; avgAtk /= n; }

        const hpEq = trialBossEquiv(w, isBig);
        const atkEq = isBig ? TRIAL_CFG.bossBigAtkEquiv : TRIAL_CFG.bossAtkEquiv;
        b.hp = b.maxHp = Math.max(1, Math.round(avgHp * hpEq));
        b.dmg = avgAtk * atkEq;
        b.trialWave = w;
        b.aggro = true;
        b.trialBoss = true;
        b.name = bcfg.name;
        r.spawned++;
        FX.flashCircle(b.pos, 4, 0xff5522, 0.9);
        FX.ring(b.pos, 6, 0xff5522, 0.7, 0.35);
        G.shake = Math.max(G.shake, 0.6);
        UI.log('【' + (isBig ? '试炼之主' : '试炼首领') + '】' + bcfg.name + ' 降临。', 'bad');
        UI.toast(bcfg.name, 'lv');

        /* 大首领带护卫：精英，血量按同一锚点 */
        if (isBig && TRIAL_CFG.bossGuardElite > 0) {
          for (let i = 0; i < TRIAL_CFG.bossGuardElite; i++) {
            const ang = -Math.PI / 2 + (i === 0 ? -0.7 : 0.7);
            const gx = bx + Math.cos(ang) * 5, gz = bz + Math.sin(ang) * 5;
            const ge = G.spawnEnemy(PICK(pool), gx, gz, true, lvl);
            if (!ge) continue;
            ge.hp = ge.maxHp = Math.max(1, Math.round(ge.maxHp * hpMul));
            ge.dmg *= dmgMul;
            ge.trialWave = w;
            ge.aggro = true;
            spawned.push(ge);
            r.spawned++;
          }
        }
      }
    }

    r.spawned += spawned.length;
    if (r.spawned <= 0) {
      /* 一只都没刷出来（极少见：怪数上限被设置压到极低）。
       * 不能卡在这，直接算清场，让流程往下走。 */
      r.phase = 'fight';
      r.clearT = 999;
    }
    UI.renderTrialHud(true);
  },

  /* ---------------- 每帧 ---------------- */

  tick(dt) {
    const r = this.run;
    if (!r) return;
    if (r.phase === 'prep') {
      r.prep -= dt;
      if (r.prep <= 0) this.spawnWave();
      UI.trialHudTick();
      return;
    }
    if (r.phase !== 'fight') return;

    this.tickThunder(dt);
    this.tickBloodlust(dt);

    /* 清场判定：场上再无活着的敌人（含首领召唤物、分裂幼体） */
    let alive = 0;
    for (const e of Game.enemies) if (!e.dead) { alive = 1; break; }
    r.alive = alive;
    if (!alive) {
      r.clearT += dt;
      if (r.clearT >= TRIAL_CFG.clearDelay) this.onWaveCleared();
    } else {
      r.clearT = 0;
    }
    UI.trialHudTick();
  },

  /* 天雷引：每 5 秒劈最近的敌人 */
  tickThunder(dt) {
    const r = this.run;
    const n = (r.bless && r.bless.thunder) || 0;
    if (!n) return;
    this._thunderT -= dt;
    if (this._thunderT > 0) return;
    this._thunderT = 5;
    const target = Game.nearestEnemy(Game.playerGroup.position, 26);
    if (!target) return;
    const pp = Game.playerGroup.position;
    const from = new THREE.Vector3(target.pos.x, 9, target.pos.z);
    FX.beam(from, new THREE.Vector3(target.pos.x, 0.6, target.pos.z), 0x9ad8ff, 0.26);
    FX.ring(target.pos, 2.4, 0x9ad8ff, 0.45, 0.24);
    Game.shake = Math.max(Game.shake, 0.18);
    const hits = n;
    for (let i = 0; i < hits; i++) {
      const { dmg, crit } = Game.rollDamage(Game.state.stats.atk * 2.6);
      Game.damageEnemy(target, dmg, crit, { silent: true, tag: 'skill', elem: 'lightning' });
    }
  },

  /* 嗜血狂潮：生命低于 40% 时挂一个持续刷新的攻击增益 */
  tickBloodlust(dt) {
    const r = this.run, s = Game.state;
    const n = (r.bless && r.bless.bloodlust) || 0;
    if (!n || !s) return;
    this._blT -= dt;
    if (this._blT > 0) return;
    this._blT = 0.5;
    const low = s.hp / Math.max(1, s.stats.hpMax) < 0.4;
    const has = Game.buffs.some(b => b.key === 'trial:bloodlust');
    if (low) {
      Game.addBuff('嗜血狂潮', { atkPct: 25 * n, dur: 1.4 }, '#ff4a4a',
        { key: 'trial:bloodlust', refresh: true, icon: '嗜', desc: '生命低于 40%，攻击力提升' });
    } else if (has) {
      Game.buffs = Game.buffs.filter(b => b.key !== 'trial:bloodlust');
      Game.recalc();
      UI.renderBuffs();
    }
  },

  /* ---------------- 清场结算 ---------------- */

  onWaveCleared() {
    const r = this.run, G = Game, s = G.state;
    if (!r || r.phase === 'choose') return;
    r.phase = 'choose';
    const w = r.wave;
    const isBoss = trialIsBossWave(w);
    const isBig = trialIsBigBossWave(w);
    const pp = G.playerGroup.position.clone();
    const sto = s.stats;
    const D = G.diff();

    /* ---- 经验：按「当前升级所需」的比例给，自动适配任何等级 ----
     * 固定数值经验在高等级会变成零头、低等级会直接连升，比例制没有这个问题。 */
    let ratio = TRIAL_CFG.xpWaveRatio;
    if (isBig) ratio = TRIAL_CFG.xpWaveRatioBig;
    else if (isBoss) ratio = TRIAL_CFG.xpWaveRatioBoss;
    const xp = Math.max(1, Math.round((s.xpNext || 100) * ratio));
    G.gainXp(xp);

    /* ---- 金币 ---- */
    const gold = Math.round(TRIAL_CFG.dropGoldBase * w * (1 + (sto.goldFind || 0) / 100) * D.gold * RND(0.85, 1.15));
    s.gold += gold;
    r.gold += gold;
    G.spawnLoot(pp, null, gold);

    /* ---- 装备 ----
     * 掉落等级 = 玩家等级 + 1，保证 reqLv 够得着（reqLv = ilvl - 1）；
     * 「天赐机缘」每层再 +2 级并多掉一件。 */
    const fortune = (r.bless && r.bless.fortune) || 0;
    const ilvl = trialDropIlvl(s.level, fortune);
    const pool = isBoss ? BALANCE.drop.boss.pool : BALANCE.drop.elite.pool;
    let drops = isBig ? 3 : (isBoss ? 2 : (w % 3 === 0 ? 1 : 0));
    if (isBoss) drops += fortune;
    for (let i = 0; i < drops; i++) {
      const it = rollItem(ilvl, {
        cls: CHANCE(0.8) ? s.cls : PICK((typeof classPackIds === 'function' ? classPackIds() : ['warrior', 'mage', 'taoist'])),
        magicFind: sto.magicFind,
        pool
      });
      if (it) {
        G.spawnLoot(pp, it, 0);
        r.items++;
      }
    }
    /* 首领波额外给符文 / 玄晶 */
    if (isBoss) {
      const runeN = isBig ? 2 : 1;
      for (let i = 0; i < runeN; i++) G.spawnLoot(pp, null, 0, { rune: rollRune(ilvl) });
      G.spawnLoot(pp, null, 0, { crystal: Math.round((isBig ? 10 : 6) * (1 + w * 0.03)) });
    }

    /* ---- 回气：清场给一小口，让长局有呼吸（大头还是靠祝福与药） ---- */
    const heal = sto.hpMax * 0.06;
    G.healPlayer(heal, true);
    s.mp = Math.min(sto.mpMax, s.mp + sto.mpMax * 0.05);
    /* 血泉祝福 */
    const wh = (r.bless && r.bless.waveheal) || 0;
    if (wh) {
      G.healPlayer(sto.hpMax * 0.18 * wh, true);
      FX.ring(pp, 4.5, 0xff6a7a, 0.6, 0.3);
    }
    /* 首领波补给：2 红 1 蓝 */
    if (isBoss) {
      s.potions.hp = Math.min(9, (s.potions.hp || 0) + (isBig ? 3 : 2));
      s.potions.mp = Math.min(9, (s.potions.mp || 0) + (isBig ? 2 : 1));
      UI.toast('药囊补充', 'lv');
    }

    UI.log('第 ' + w + ' 波 · 清场' + (isBig ? '（试炼之主陨落）' : isBoss ? '（首领伏诛）' : ''), 'good');
    SFX.levelup();
    UI.renderHUD();

    /* ---- 三选一 ---- */
    const offers = trialRollBlessings(TRIAL_CFG.blessCards, w, r.bless);
    if (!offers.length) {
      /* 全部祝福都叠满了（极后期）：不再翻牌，直接下一波 */
      UI.toast('万法归一', 'lv');
      this.nextWave();
      return;
    }
    r.offers = offers.map(b => b.id);
    UI.openTrialBless(offers, w);
  },

  pickBlessing(id) {
    const r = this.run;
    if (!r || r.phase !== 'choose') return;
    const def = TRIAL_BLESS_BY_ID[id];
    if (!def) return;
    r.bless[id] = (r.bless[id] || 0) + 1;
    r.picks = (r.picks || 0) + 1;
    r.offers = [];
    UI.closeTrialBless();
    Game.recalc();
    UI.renderTrialHud(true);
    SFX.loot(def.tier >= 3 ? 'legendary' : 'magic');
    UI.toast(def.name + (def.tier >= 3 ? ' · 传说' : ''), 'lv');
    UI.log('【祝福】' + def.name + '（' + (TRIAL_CAT_NAME[def.cat] || '') + '）', 'good');
    /* 给一小段喘息再开下一波（1 秒读秒，不让人干等） */
    this.nextWave(true);
  },

  /* ---------------- 给 UI / 存档用的查询 ---------------- */

  info() {
    const r = this.run;
    if (!r) return null;
    const s = Game.state;
    const rem = r.wave % TRIAL_CFG.bossEvery;
    return {
      wave: r.wave,
      phase: r.phase,
      prep: Math.max(0, r.prep || 0),
      alive: trialAliveCount(),
      spawned: r.spawned || 0,
      picks: r.picks || 0,
      blessCount: this.blessCount(),
      isBoss: trialIsBossWave(r.wave),
      isBig: trialIsBigBossWave(r.wave),
      nextBoss: rem === 0 ? TRIAL_CFG.bossEvery : TRIAL_CFG.bossEvery - rem,
      level: s ? s.level : 1
    };
  },

  blessCount() {
    const r = this.run;
    if (!r) return 0;
    let n = 0;
    for (const k in r.bless) n += r.bless[k] || 0;
    return n;
  },

  /* 祝福清单（面板用） */
  blessList() {
    const r = this.run;
    if (!r) return [];
    const out = [];
    for (const id in r.bless) {
      const d = TRIAL_BLESS_BY_ID[id];
      if (d) out.push({ def: d, n: r.bless[id] });
    }
    out.sort((a, b) => (b.def.tier - a.def.tier) || (a.def.cat < b.def.cat ? -1 : 1));
    return out;
  }
};

/* ============================================================
 * 祝福 → 属性
 * 由 computePlayerStats 内部调用（items.js），所以乘区类词条
 * （atkPct / hpPct / armorPct / mpPct）能真正参与派生计算。
 * ============================================================ */
function trialBonusStats(p) {
  const out = {};
  const r = (typeof Trial !== 'undefined') ? Trial.run : null;
  if (!r || !r.bless) return out;
  for (const id in r.bless) {
    const def = TRIAL_BLESS_BY_ID[id];
    const n = r.bless[id] || 0;
    if (!def || !n || !def.stats) continue;
    for (const k in def.stats) out[k] = (out[k] || 0) + def.stats[k] * n;
  }
  return out;
}

/* 没有刷出小怪时的兜底：按数据表算本波的平均血量/攻击 */
function poolProfileOf(pool, lvl, hpMul, dmgMul) {
  let hp = 0, atk = 0, n = 0;
  for (const k of pool) {
    const m = MONSTERS[k];
    if (!m) continue;
    hp += (m.hp || 50) * (1 + lvl * 0.55 + lvl * lvl * 0.010) * hpMul;
    atk += (m.atk || 10) * (1 + lvl * 0.20) * dmgMul;
    n++;
  }
  if (!n) return { hp: 200, atk: 20 };
  return { hp: hp / n, atk: atk / n };
}
