/* ============================================================
 * quests.js —— 任务运行时（M2）
 *
 * 数据在 src/data/data-quests.js，这里只放「怎么算」。
 * 三条原则：
 *
 * 1. **任务与地图解耦**：能不能接，只看目标图做出来没有（questMapOpen）。
 *    M3 补一张图，对应任务自动出现在营地掌事手里，不用回来改代码。
 * 2. **老档一条进度不丢**：q1~q11 在数据里留着 legacyId，
 *    migrate() 认 legacyId 迁移，objectives 逐字一致的直接搬 progress 数组。
 * 3. **任务区域必须有回收**：接任务点亮、复命/放弃立刻熄灭。
 *    留着不清的话，刷完任务的人会看到一张怪多到离谱的图（见 §4.3 第 3 条）。
 *
 * 状态（state.quests）
 *   active:     [{ id, progress: [], at }]   progress[i] 对应 objectives[i]
 *   done:       [id]                         只记不可重复的任务
 *   announced:  { id: true }                 目标达成只播报一次
 *   board:      { cd: { id: 到期时间戳 }, count: { id: 完成次数 } }  悬赏
 *   next:       老字段，只为兼容旧存档保留，新逻辑不读
 * ============================================================ */

const QUEST_BOARD_CD = 8 * 60 * 1000;   /* 悬赏刷新：8 分钟（§4.1） */

/* ---------------- 迁移契约（冻结） ----------------
 * 老档的 q1~q11 早就不在 QUESTS 里了（它们变成了 m* 的 legacyId），
 * 所以「旧任务的目标长什么样」必须在迁移时有一份独立的记录 ——
 * 拿新任务跟自己比是永远相等的，那样这层保护等于没有。
 *
 * 这张表是 2026-10-27（v1.9.x）那一刻的 q1~q11 原样。
 * **不要改它**：它是历史事实，不是配置。改了，老档进度就会被误判成「结构变了」而清零。 */
const QUEST_LEGACY_OBJECTIVES = {
  q1: [{ type: 'kill', target: 'halfork', count: 8 }],
  q2: [{ type: 'kill', target: 'bat', count: 10 }],
  q3: [{ type: 'boss', target: 'treeking', count: 1 }],
  q4: [{ type: 'boss', target: 'batking', count: 1 }],
  q5: [{ type: 'killAny', count: 12 }],
  q6: [{ type: 'boss', target: 'chief', count: 1 }],
  q7: [{ type: 'boss', target: 'golemking', count: 1 }, { type: 'boss', target: 'snakequeen', count: 1 }],
  q8: [{ type: 'boss', target: 'ghostlord', count: 1 }],
  q9: [{ type: 'boss', target: 'firegeneral', count: 1 }, { type: 'boss', target: 'icequeen', count: 1 }],
  q10: [
    { type: 'boss', target: 'spidermother', count: 1 },
    { type: 'boss', target: 'ferryman', count: 1 },
    { type: 'boss', target: 'swordlord', count: 1 }
  ],
  q11: [{ type: 'boss', target: 'chaos', count: 1 }]
};

const QuestSys = {

  /* ---------------- 基础 ---------------- */

  s() { return (typeof Game !== 'undefined' && Game.state) ? Game.state.quests : null; },

  ensure() {
    const st = (typeof Game !== 'undefined') ? Game.state : null;
    if (!st) return null;
    const q = st.quests = st.quests || {};
    q.active = Array.isArray(q.active) ? q.active : [];
    q.done = Array.isArray(q.done) ? q.done : [];
    q.announced = q.announced || {};
    q.board = q.board || {};
    q.board.cd = q.board.cd || {};
    q.board.count = q.board.count || {};
    /* 老档的 active 可能是 { id, progress } 但缺 progress 字段 */
    for (const a of q.active) if (!Array.isArray(a.progress)) a.progress = [];
    return q;
  },

  isActive(id) {
    const q = this.s();
    return !!q && q.active.some(a => a.id === id);
  },

  isDone(id) {
    const q = this.s();
    if (!q || q.done.indexOf(id) < 0) return false;
    const d = QUESTS[id];
    /* 可重复任务（悬赏）不进 done；万一老档里混进去了也不当完成 */
    return !(d && d.repeat);
  },

  activeOf(id) {
    const q = this.s();
    return q ? (q.active.find(a => a.id === id) || null) : null;
  },

  /* ---------------- 老档迁移 ---------------- */

  /* 判断两份 objectives 是否「逐字一致」。一致才能把 progress 数组原样搬过去，
   * 否则进度会错位（比如旧任务 2 个目标、新任务 1 个，progress[0] 就指错东西了）。 */
  _sameObjectives(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (x.type !== y.type || x.count !== y.count) return false;
      if ((x.target || '') !== (y.target || '')) return false;
      if ((x.zone || '') !== (y.zone || '')) return false;
      if ((x.mat || '') !== (y.mat || '')) return false;
    }
    return true;
  },

  /* q1~q11 → m*。跑一次就够，之后 id 全是新的，不会再命中。 */
  migrate() {
    const q = this.ensure();
    if (!q) return false;
    let changed = false;
    const toNew = (id) => {
      if (!id || !/^q\d+$/.test(id)) return id;
      const nq = questByLegacyId(id);
      return nq ? nq.id : id;
    };

    /* done */
    const done = [];
    for (const id of q.done) {
      const nid = toNew(id);
      if (nid !== id) changed = true;
      if (done.indexOf(nid) < 0) done.push(nid);
    }
    q.done = done;

    /* active：保留进度，但要先确认 objectives 没变过 */
    for (const a of q.active) {
      const oldId = a.id;
      const nid = toNew(oldId);
      if (nid === oldId) continue;
      changed = true;
      const nq = QUESTS[nid];
      const oldObjs = QUEST_LEGACY_OBJECTIVES[oldId] || null;
      a.id = nid;
      if (nq && this._sameObjectives(oldObjs, nq.objectives)) {
        /* 结构没变 → 进度原样搬（这就是「一条进度不丢」的全部秘密） */
        a.progress = nq.objectives.map((o, i) => Math.min(a.progress[i] || 0, o.count));
      } else if (nq) {
        /* 结构变了 → 只能重做。宁可让玩家再打一遍，也不能把进度指到错的目标上。 */
        a.progress = nq.objectives.map(() => 0);
      }
    }

    /* next：新逻辑按 require 链推导，这里只把 id 换掉免得旧代码读到 q 号 */
    if (q.next) {
      const nid = toNew(q.next);
      if (nid !== q.next) { q.next = nid; changed = true; }
    }

    if (changed) {
      /* 迁移完把「已达成但没复命」的重新播报一遍，别让玩家回来找不到人 */
      q.announced = {};
    }
    return changed;
  },

  /* ---------------- 接取条件 ---------------- */

  /* 同一时刻的上限：主线 1 条、支线 2 条（§4.3 第 4 条）。
   * 不限的话，一次点亮七八个任务区域，整张图都会被标成任务区。 */
  capOf(kind) { return kind === 'main' ? 1 : 2; },

  canOffer(q) {
    if (!q) return false;
    if (!questMapOpen(q)) return false;
    if (this.isActive(q.id)) return false;
    const st = this.s();
    if (!st) return false;
    /* 悬赏：只看冷却，不看 done（可重复），也不占主线 / 支线的名额 */
    if (q.kind === 'board') {
      if (!q.repeat) return false;
      return Date.now() >= (st.board.cd[q.id] || 0);
    }
    if (this.isDone(q.id)) return false;
    if (q.require && !this.isDone(q.require)) return false;
    let n = 0;
    for (const a of st.active) {
      const aq = QUESTS[a.id];
      if (aq && aq.kind === q.kind) n++;
    }
    return n < this.capOf(q.kind);
  },

  /* 某发布者手上现在能接的任务（按卷、按 id 排序） */
  offersOf(giverId) {
    const out = [];
    for (const k in QUESTS) {
      const q = QUESTS[k];
      if (q.giver !== giverId) continue;
      if (this.canOffer(q)) out.push(q);
    }
    out.sort((a, b) => (a.part - b.part) || a.id.localeCompare(b.id));
    return out;
  },

  /* 该发布者名下「已达成待复命」的任务 */
  readyOf(giverId) {
    const st = this.s();
    if (!st) return [];
    return st.active.filter(a => {
      const q = QUESTS[a.id];
      return q && q.giver === giverId && this.ready(a);
    });
  },

  /* 该发布者名下正在进行的任务 */
  runningOf(giverId) {
    const st = this.s();
    if (!st) return [];
    return st.active.filter(a => {
      const q = QUESTS[a.id];
      return q && q.giver === giverId;
    });
  },

  /* 完成任务后的下一环（用于「复命 → 顺势接下一环」的对话） */
  nextOf(q) {
    if (!q) return null;
    if (q.next && QUESTS[q.next] && this.canOffer(QUESTS[q.next])) return QUESTS[q.next];
    const list = this.offersOf(q.giver).filter(x => x.require === q.id);
    return list[0] || null;
  },

  /* ---------------- 进度 ---------------- */

  ready(a) {
    const q = QUESTS[a.id];
    if (!q) return false;
    return q.objectives.every((o, i) => (a.progress[i] || 0) >= o.count);
  },

  _bump(a, i, n) {
    const q = QUESTS[a.id];
    const o = q.objectives[i];
    const before = a.progress[i] || 0;
    a.progress[i] = Math.min(o.count, before + n);
    return a.progress[i] !== before;
  },

  /* 击杀：e.tag 是怪物 key，e.kind 是首领 key（和旧 onKill 口径一致） */
  onKill(e) {
    const st = this.s();
    if (!st || !e) return false;
    let touched = false;
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === 'kill' && o.target === e.tag) touched = this._bump(a, i, 1) || touched;
        else if (o.type === 'killAny') touched = this._bump(a, i, 1) || touched;
        else if (o.type === 'boss' && o.target === e.kind) touched = this._bump(a, i, 1) || touched;
      });
      if (this.ready(a) && !st.announced[a.id]) {
        st.announced[a.id] = true;
        this._announce(a);
      }
    }
    return touched;
  },

  /* 进区域：reach 目标（每帧调，靠 zone 变化去重） */
  onZone(mapId, zoneId) {
    const st = this.s();
    if (!st || !zoneId) return false;
    let touched = false;
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q || q.map !== mapId) continue;
      q.objectives.forEach((o, i) => {
        if (o.type !== 'reach') return;
        if (o.zone && o.zone !== zoneId) return;
        touched = this._bump(a, i, 1) || touched;
      });
      if (this.ready(a) && !st.announced[a.id]) {
        st.announced[a.id] = true;
        this._announce(a);
      }
    }
    return touched;
  },

  /* 拾取：collect 目标（M2 还没有任务用到，接口先留好，M5 材料任务直接接） */
  onCollect(key, n) {
    const st = this.s();
    if (!st || !key) return false;
    let touched = false;
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === 'collect' && o.mat === key) touched = this._bump(a, i, n || 1) || touched;
      });
      if (this.ready(a) && !st.announced[a.id]) {
        st.announced[a.id] = true;
        this._announce(a);
      }
    }
    return touched;
  },

  /* 地下城结算：M5 接 */
  onDungeon(dtype, tier) {
    const st = this.s();
    if (!st) return false;
    let touched = false;
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (o.type !== 'dungeon') return;
        if (o.dtype && o.dtype !== dtype) return;
        if (o.tier && o.tier !== tier) return;
        touched = this._bump(a, i, 1) || touched;
      });
    }
    return touched;
  },

  _announce(a) {
    const q = QUESTS[a.id];
    if (typeof UI === 'undefined') return;
    const who = (typeof NPCS !== 'undefined' && NPCS[npcIdOfGiver(q.giver)]) ? NPCS[npcIdOfGiver(q.giver)].name : '掌事';
    UI.toast('委托目标达成 · 回营地复命', 'lv');
    UI.log('【委托】「' + q.name + '」目标已达成，回' + who + '处复命。', 'good');
  },

  /* ---------------- 接 / 复命 ---------------- */

  accept(id) {
    const q = QUESTS[id];
    if (!q) return false;
    const st = this.ensure();
    if (!st || !this.canOffer(q)) return false;
    st.active.push({ id, progress: q.objectives.map(() => 0), at: Date.now() });
    delete st.announced[id];
    if (typeof UI !== 'undefined') {
      UI.toast((q.kind === 'board' ? '悬赏' : '新委托') + ' · ' + q.name);
      UI.log('【委托】' + q.brief, 'good');
      UI.renderQuests(); UI.updateQuestTrack();
    }
    if (typeof SFX !== 'undefined') SFX.ui();
    if (typeof Game !== 'undefined') {
      Game.updateQuestMarker && Game.updateQuestMarker();
      Game.save && Game.save();
    }
    return true;
  },

  /* 复命：发奖 + 移除 + 记完成。返回该任务，调用方用它推「下一环」。 */
  turnIn(a) {
    const q = a ? QUESTS[a.id] : null;
    if (!q) return null;
    const st = this.ensure();
    if (!st) return null;
    const R = q.rewards || {};
    const G = (typeof Game !== 'undefined') ? Game : null;
    if (!G) return null;

    if (R.gold) G.state.gold += R.gold;
    if (R.xp) G.gainXp(R.xp);

    if (R.ilvl) {
      const it = rollItem(R.ilvl, {
        cls: G.state.cls, rarity: R.rarity || 'magic',
        magicFind: G.state.stats.magicFind
      });
      if (it && G.addItem(it) && typeof UI !== 'undefined') UI.log('获得 ' + it.name, 'good');
    }

    /* 技能书 */
    if (R.skill && typeof SKILLS !== 'undefined' && SKILLS[R.skill] && G.skillFlags && !G.skillFlags[R.skill]) {
      G.skillFlags[R.skill] = true;
      if (typeof UI !== 'undefined') UI.log('获得技能书《' + SKILLS[R.skill].name + '》，已领悟！', 'lv');
      if (typeof SFX !== 'undefined') SFX.levelup();
    }

    /* 天赋点 */
    if (R.talent) {
      G.state.talentBonus = (G.state.talentBonus || 0) + R.talent;
      if (typeof UI !== 'undefined') UI.log('获得天赋点 +' + R.talent, 'lv');
      if (typeof SFX !== 'undefined') SFX.levelup();
    }

    /* 地下城钥匙：M5 落地后接这里（数据里已留 key 字段位） */
    if (R.key && typeof Game !== 'undefined' && Game.addKey) Game.addKey(R.key.tier, R.key.n || 1);

    st.active = st.active.filter(x => x !== a);
    delete st.announced[q.id];

    if (q.repeat) {
      st.board.count[q.id] = (st.board.count[q.id] || 0) + 1;
      st.board.cd[q.id] = Date.now() + QUEST_BOARD_CD;
    } else if (st.done.indexOf(q.id) < 0) {
      st.done.push(q.id);
    }

    if (typeof UI !== 'undefined') {
      UI.toast((q.repeat ? '悬赏完成' : '委托完成') + ' · ' + q.name, 'lv');
      UI.log('【' + (q.repeat ? '悬赏完成' : '委托完成') + '】' + q.name + '　+' + (R.gold || 0) + ' 金', 'good');
      UI.renderQuests(); UI.updateQuestTrack();
    }
    if (typeof SFX !== 'undefined') SFX.levelup();
    G.updateQuestMarker && G.updateQuestMarker();
    G.save && G.save();
    return q;
  },

  /* 放弃（任务区域必须跟着熄灭，否则怪会一直多着） */
  abandon(id) {
    const st = this.ensure();
    if (!st) return false;
    const a = st.active.find(x => x.id === id);
    if (!a) return false;
    st.active = st.active.filter(x => x !== a);
    delete st.announced[id];
    if (typeof UI !== 'undefined') {
      const q = QUESTS[id];
      UI.toast('已放弃 · ' + (q ? q.name : id));
      UI.renderQuests(); UI.updateQuestTrack();
    }
    if (typeof Game !== 'undefined') {
      Game.updateQuestMarker && Game.updateQuestMarker();
      Game.save && Game.save();
    }
    return true;
  },

  /* ---------------- 悬赏板 ---------------- */

  boardList(part) {
    const st = this.ensure();
    if (!st) return [];
    const now = Date.now();
    return questsOfPart(part, 'board').filter(q => {
      if (this.isActive(q.id)) return false;
      const cd = st.board.cd[q.id] || 0;
      return now >= cd;
    });
  },

  /* 任务板一次列 3 条（§4.1「一次列 3~5 条」）。
   * [M6] 每卷现在是 4 条（3 killAny + 1 地脉）—— 若继续按对象顺序 slice(0,3)，
   * 第 4 条要等前三条同时冷却才会露面，等于没有。改成候选里随机挑 3 条，
   * 四条就会轮换起来，玩家每次开板看到的组合都不一样。 */
  boardTake(part) {
    const list = this.boardList(part).slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list.slice(0, 3);
  },

  /* ---------------- 任务区域 ---------------- */

  /* 这张图上生效的任务区域。
   * 返回 [{ zone, kinds, main }] —— spawnEnemies 用它加数量、加权怪种。 */
  activeZones(mapId) {
    const st = this.s();
    if (!st) return [];
    const out = [];
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q || q.map !== mapId || !q.zone) continue;
      if (this.ready(a)) continue;           /* 已达成的不再刷怪，免得玩家回来复命还被围 */
      const kinds = [];
      for (const o of q.objectives) {
        if ((o.type === 'kill' || o.type === 'killAny') && o.target) kinds.push(o.target);
      }
      out.push({ id: q.id, zone: q.zone, kinds: kinds, main: q.kind === 'main', name: q.name });
    }
    return out;
  },

  /* 某个 zone 的刷怪加成 → { mult, kinds } / null */
  zoneBoost(mapId, zoneId) {
    const zs = this.activeZones(mapId);
    for (const z of zs) {
      if (z.zone !== zoneId) continue;
      return { mult: 1.4, extra: 6, kinds: z.kinds, quest: z.name, main: z.main };
    }
    return null;
  },

  /* ---------------- 追踪三行 ---------------- */

  track() {
    const st = this.s();
    if (!st) return { main: null, sides: [], boards: [] };
    const main = [], sides = [], boards = [];
    for (const a of st.active) {
      const q = QUESTS[a.id];
      if (!q) continue;
      if (q.kind === 'main') main.push(a);
      else if (q.kind === 'side') sides.push(a);
      else boards.push(a);
    }
    return { main: main[0] || null, sides: sides.slice(0, 2), boards };
  },

  /* 给 UI 用：一条任务的进度文本行 */
  lines(a) {
    const q = a ? QUESTS[a.id] : null;
    if (!q) return [];
    return q.objectives.map((o, i) => {
      const cur = Math.min(a.progress[i] || 0, o.count);
      return { label: o.label, cur: cur, count: o.count, done: cur >= o.count };
    });
  }
};

if (typeof window !== 'undefined') window.QuestSys = QuestSys;
