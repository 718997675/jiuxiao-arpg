/* ============================================================
 * 技能音效 · 三段式解释层（唯一出口）
 *
 *   **为什么单独一层**：以前音效散在 `game.js` 的 40+ 处调用点，
 *   有的在施法瞬间响、有的在命中点响，改一处必漏，而且没人能查音画错位。
 *   现在三段各由**唯一**的出口负责，时序只有这一处说了算。
 *
 *   **三段的时序（方案 §5「时间轴：三段式」）**：
 *     · 起手 anticipation 60~150ms —— 施法瞬间
 *     · 命中 impact       40~80ms  —— **伤害真正结算的那一刻**
 *     · 余韵 aftermath    200~600ms —— 命中之后（贴花 / 余烬 / 烟的残留期）
 *
 *   **命中音为什么不能挂在施法瞬间**：投射物类（火球 / 冰锥 / 符）的
 *   弹道要飞 0.3~1.5 秒，陨石要等 0.9 秒。施法瞬间就响 = 玩家先听到「咚」，
 *   一秒后才看到东西砸下来 —— 声音比画面早 = 感觉「没打中」。
 *   所以命中音跟着**伤害结算**走。
 *
 *   **余韵音以前整个不存在**。§5 明写「没有余韵 = 特效消失得太干净，
 *   世界像没被打过」；实测（`dev/probe-sfx-align.js`）37 只技能里 0 只有余韵。
 *
 *   **与既有受击音的关系**：`damageEnemy` 里本来就有
 *   `SFX[crit ? 'crit' : 'hit']()` —— 那是**打在肉上**的实感。
 *   本层的 impact 段接管的正是这个位置：按**技能**选音色，
 *   并在一发技能内去重（AOE 打 5 只怪不该叠 5 声爆炸）。
 *   没配 impact 音的技能（增益 / 治疗）沿用原来的受击音，行为不变。
 *
 *   ---------------- 状态怎么管 ----------------
 *
 *   每次施放发一个**令牌**（token），命中 / 余韵都挂在令牌上。
 *   令牌不是「最近一次施放」这种全局单值 —— 因为**投射物的命中是异步的**：
 *   火球飞了 0.8 秒才落地，这期间玩家可能又放了别的招。
 *   用全局单值就会把 A 技能的余韵算到 B 技能头上（或者反过来漏掉）。
 *   所以这里用一个**按技能 id 分槽**的表：每个技能 id 记住自己最近一次施放的令牌。
 * ============================================================ */
'use strict';

/* 一发技能内的命中去重窗口（毫秒）。
 * 够挡住「同一帧多个目标」的连响，又不会吃掉「多段技」本来就要的
 * 「一下一下」（那些间隔都 > 120ms）。 */
const IMPACT_WINDOW = 120;

/* 一次施放「还在等命中」的最长时间（毫秒）。
 * 最慢的技能是陨石（前摇 0.9 秒）+ 弹道飞行，2500ms 够覆盖。 */
const CAST_WINDOW = 2500;

const SfxAudio = {
  /* 每个技能 id 记住自己最近一次施放的令牌。
   * token = { id, seq, gen, at, impacted, aftered }
   * seq 是单调递增的施放序号 —— 同一技能连放两次时，靠它区分「哪一次」。 */
  _slots: {},

  /* 全局施放序号 */
  _seq: 0,

  /* 最近一次**命中音**的音色与时刻。跨技能的短窗口去重，见 impact()。 */
  _lastKey: '',
  _lastAt: -1e9,

  /* 统计：给探针 / 契约测试读 */
  stats: { cast: 0, impact: 0, after: 0, dedup: 0, fallback: 0 },

  /* ---------------- 起手段 ---------------- */

  /* 施法瞬间发一声起手音。
   *
   * 以前这里是 `SFX.skill(sk)`：按技能**类型 + 元素猜**一个音
   * （36 个技能共用七八种），按下键根本听不出放的是哪一招。
   * 现在按**技能 id**查 `data-sfaudio.js`，每只技能有自己的起手音。
   *
   * 查不到配置 → 返回 false（调用方决定兜底），**不兜底成某个通用音** ——
   * 兜底 = 所有技能听起来一样，而「加技能忘了配音效」本身是个该暴露的 bug。 */
  cast(id) {
    const a = skillAudio(id);
    if (!a) return false;
    const key = a.cast;
    if (!key) return false;            /* 配置为 null = 故意不响 */

    this._play(key);
    /* `cast2` = 第二个起手音，与 cast 叠成一个和弦。
     * 为什么需要它：召唤 / 终极技本来是两个音（`SFX.heal()` + `SFX.boss()`、
     * `SFX.cast()` + `SFX.boss()`）—— 低频轰鸣是它们的身份，收口时丢掉就是降级。
     * 单键表达不了和弦，所以留第二个槽。 */
    if (a.cast2) this._play(a.cast2);
    this.stats.cast++;

    /* 发一个令牌：这次施放的命中 / 余韵都挂在它身上 */
    this._seq++;
    this._slots[id] = { id: id, seq: this._seq, gen: mapGen(), at: nowMs(), impacted: false, aftered: false };

    /* **所有**施放都挂一个余韵兜底（不只是「没配 impact」的那些）。
     *
     * 为什么：「没配 impact」≠「impact 不会发生」。领域（火墙 / 暴雪 / 雷云 /
     * 剑阵 / 毒雾）的每跳伤害是 `opts.silent` 的，`damageEnemy` 不会调 impact；
     * 换式（兵形 / 法相）、护盾、增益根本不结算伤害 —— impact 永远不来，
     * 余韵挂在它上面就**整段消失**。真机实测 37 只里 8 只因此没有余韵。
     * §5 要的余韵是「这次施法的收尾」，不是「伤害的收尾」，打不打中都该有尾巴。
     *
     * 兜底在「本该有余韵」的时刻检查：这一发还没补过就立刻补一声，
     * 延迟仍是 `after.ms`（200~600ms），不会因为兜底被拖到窗口外。 */
    this._guardAfter(id, this._seq);

    /* **领域类自报落地**：火墙 / 暴雪 / 雷云 / 剑阵没有「伤害结算」那一拍
     * （每跳是 silent DoT，damageEnemy 明确不发音），但视觉上有预警圈收束、
     * 光柱砸下 —— 那才是它们的「命中」。配了 impactAt 就在这里补一声落地音，
     * 三段才齐。别改 DoT 的静默规则：让每跳都响会变成电钻。 */
    if (a.impactAt && a.impact) {
      const seq = this._seq, gen = mapGen();
      setTimeout(() => {
        if (mapGen() !== gen) return;
        const t = this._slots[id];
        if (!t || t.seq !== seq) return;
        this.impact(id, false, null);
      }, a.impactAt);
    }
    return true;
  },

  /* ---------------- 命中段 ---------------- */

  /* 伤害真正结算的那一刻。
   *
   * `crit` —— 这次是不是暴击（决定用 crit 音还是普通命中音）。
   * `fallback` —— 调用方在「本层管不了」时用它发原来的受击音。
   *
   * 返回 true = 本层已处理（调用方不要再发）；false = 没配置，交给调用方兜底。 */
  impact(id, crit, fallback) {
    const a = skillAudio(id);
    if (!a || !a.impact) {
      this.stats.fallback++;
      if (fallback) { try { fallback(); } catch (e) { } }
      return false;
    }

    /* 拿这个技能最近一次施放的令牌 */
    const tok = this._slots[id];
    const now = nowMs();

    /* 同一发技能、同一窗口内只响一声（AOE 打 5 只怪 = 5 声爆炸 = 噪音）。
     * 判据用**令牌**而不是全局时刻：令牌记着自己这次施放的命中时刻，
     * 上一发别的技能的命中不该把这一次吞掉。 */
    if (tok && tok.impacted && (now - tok.at) < IMPACT_WINDOW) {
      this.stats.dedup++;
      return true;                      /* 已处理：吞掉，但不再播 */
    }

    /* 暴击时用暴击音（更重的一下），普通命中用配置里的音 */
    const key = (crit && a.impactCrit) ? a.impactCrit : a.impact;

    /* **跨技能**的短窗口：同一音色 120ms 内只响一次。
     * 令牌是按技能分槽的，各自独立 —— 白虎召唤物 + 自动施放会在 51ms 内
     * 连出两声 hit（真机实测），两枚令牌谁都吞不掉对方，玩家听到的是噪音。
     * 同音色叠在一起本来就该合成一声；多段技间隔 ≥120ms 不受影响。 */
    if (this._lastKey === key && (now - this._lastAt) < IMPACT_WINDOW) {
      this.stats.dedup++;
      return true;
    }
    this._lastKey = key;
    this._lastAt = now;

    this._play(key);
    this.stats.impact++;

    if (tok) {
      tok.impacted = true;
      tok.at = now;
      /* 余韵跟着这一发技能的**第一次**命中走 */
      this.after(id);
    } else {
      /* 没有对应令牌（伤害不是从这次施放来的，比如装备特效）——
       * 照样发命中音，但不发余韵：余韵是「技能的收尾」，不是「伤害的收尾」。 */
    }
    return true;
  },

  /* ---------------- 余韵段 ---------------- */

  /* 尾音。延迟 `after.ms`（200~600ms，对齐 §5）。
   * 一发技能只补一次余韵 —— 余韵是「这一下的尾巴」，不是每个目标的。 */
  after(id) {
    const a = skillAudio(id);
    if (!a || !a.after) return false;
    const tok = this._slots[id];
    if (tok && tok.aftered) return false;
    if (tok) tok.aftered = true;
    this._emitAfter(a.after.key, a.after.ms);
    return true;
  },

  /* 余韵兜底（见 cast 里的长注释）。
   * `afterGuard` 给「命中来得很晚」的技能用：陨石前摇 0.9 秒，
   * 兜底若在 560ms 就发，尾巴会跑到命中**前面**。配了之后兜底延后到
   * 命中之后，而正常路径（impact → after）仍然优先，两者靠令牌互斥。 */
  _guardAfter(id, seq) {
    const a = skillAudio(id);
    if (!a || !a.after) return;
    const ms = Math.max(a.after.ms, a.afterGuard || 0, (a.impactAt || 0) + 50);
    const gen = mapGen();
    setTimeout(() => {
      if (mapGen() !== gen) return;             /* 换图了 */
      const t = this._slots[id];
      if (!t || t.seq !== seq || t.aftered) return;  /* 这一发已由 impact 补过 */
      t.aftered = true;
      this._emitAfter(a.after.key, 0);          /* 立刻发：总延迟 = ms，不二次叠加 */
    }, ms);
  },

  _emitAfter(key, ms) {
    const gen = mapGen();
    /* setTimeout 而不是每帧轮询：余韵是一次性的延迟音。 */
    setTimeout(() => {
      /* 换图了就不响 —— 上一张图的余韵飘到下一张图很难受 */
      if (mapGen() !== gen) return;
      this._play(key);
      this.stats.after++;
    }, ms);
  },

  /* 当前有没有一次**技能施放**正在等命中（用于爆炸音归属判断）。
   * 「这一发」的判定 = 该技能最近一次施放的令牌还没命中过、且没过时。 */
  ownsCast(id) {
    const tok = this._slots[id];
    if (!tok) return false;
    if (tok.impacted) return false;
    return (nowMs() - tok.at) < CAST_WINDOW;
  },

  /* **延迟爆炸的施法者**：取「最早还没命中过的那一发」。
   *
   * 陨石前摇 0.9 秒、雷雨连落十几颗，`explodeAt` 是 setTimeout 回调，
   * 触发时 `this._castSkill` 已清零；而裸 `_sfxCastId`（最近一次施放）
   * 会被飞行期间**自动施放**的其他技能覆盖 —— 真机实测陨石命中被认成
   * riposte，配置里的 explode 没响、发的是 riposte 的 hit。
   *
   * 取「最早未命中」而不是「最新」：先放的技能先结算，这正是延迟队列的
   * 顺序；一发命中后 `impacted=true` 自动退出，下一发补上。
   * 投射物不走这条 —— 它们身上自带 `sfxId`，优先级更高。 */
  oldestPending() {
    const now = nowMs();
    const gen = mapGen();
    let best = null;
    for (const id in this._slots) {
      const t = this._slots[id];
      if (t.impacted || t.gen !== gen) continue;
      /* 增益 / 治疗 / 召唤没有命中段，本来就不会有「延迟命中」——
       * 让它们留在队列里，会把 2 秒前那发的 id 错给当前这发爆炸。 */
      const a0 = skillAudio(id);
      if (!a0 || !a0.impact || t.aftered) continue;
      if ((now - t.at) >= CAST_WINDOW) continue;
      if (!best || t.seq < best.seq) best = t;
    }
    return best ? best.id : '';
  },

  /* ---------------- 内部 ---------------- */

  /* 实际发声。键 = `SFX.*` 的方法名。
   * `SFX` 不存在（测试环境）时静默返回 false，不抛。 */
  _play(key) {
    if (typeof SFX === 'undefined' || !SFX) return false;
    const fn = SFX[key];
    if (typeof fn !== 'function') return false;
    try { fn.call(SFX); } catch (e) { return false; }
    return true;
  },

  /* 换图 / 重开：清掉所有施放令牌。
   * 未发的余韵定时器用 mapGen 判等作废（setTimeout 的 id 浏览器不返回，
   * 拿不到就 cancel 不了 —— 回调里自己比 gen 就够了）。 */
  reset() {
    this._slots = {};
    this._seq = 0;
    this._lastKey = '';
    this._lastAt = -1e9;
  },

  /* 给探针读 */
  state() {
    return {
      cast: this.stats.cast, impact: this.stats.impact,
      after: this.stats.after, dedup: this.stats.dedup,
      fallback: this.stats.fallback,
      slots: Object.keys(this._slots).length
    };
  }
};

/* 当前地图代号：换图后作废未发的余韵 */
function mapGen() {
  return (typeof Game !== 'undefined' && Game) ? (Game.mapGen || 0) : 0;
}

/* 单调时钟：优先 performance.now（不受系统时间调整影响） */
function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

if (typeof window !== 'undefined') window.SfxAudio = SfxAudio;
