/* ============================================================
 * 技能音效 · 三段式配置（数据层，纯数据 + 纯函数）
 *
 *   方案 `docs/SKILL-VFX-PLAN.md` §5「时间轴：三段式」：
 *     · 起手 anticipation 60~150ms —— 光向落点收束、脚下微光、角色前摇
 *     · 命中 impact       40~80ms  —— 闪白 + 顿帧 + 冲击波 + 震屏
 *     · 余韵 aftermath    200~600ms —— 残留贴花、上升余烬、烟、边缘光衰减
 *
 *   **为什么以前只有一层**：`SFX.skill(sk)` 在 `castSkill` 里统一发一声起手音，
 *   命中音散在 `game.js` 的 40+ 处调用点（有的在施法瞬间、有的在命中点），
 *   余韵音**整个不存在**。散着放的后果：改一处必漏，且「音画错位」没人能查。
 *   （2026-11-10 真机测量 `dev/probe-sfx-align.js`：37 只技能里
 *   命中音与伤害结算同拍的只有 33 只，余韵音 0 只。）
 *
 *   **本表是唯一口径**：每只技能三段各一个键，键是 `src/fx.js` 里
 *   `SFX.*` 的方法名（外加三个新专用的余韵键）。缺哪一段就写 `null`，
 *   **不许在 game.js 里再直接调 SFX.xxx**（那是散落的根源）。
 *
 *   段与段的时序由 `src/sfx-audio.js` 统一排：
 *     · 起手 = 施法瞬间
 *     · 命中 = **伤害真正结算的那一刻**（不是施法瞬间）——
 *       所以投射物类的命中音会等到弹道飞到才响，这才是「打到了」的证据
 *     · 余韵 = 命中之后 `after` 段给的毫秒数
 *
 *   为什么命中音要等伤害结算：`castSkill` 一按就发的话，玩家先听到「咚」，
 *   0.9 秒后才看到陨石砸下来 —— 声音比画面早 = 感觉「没打中」。
 * ============================================================ */

/* 段内允许的键：SFX 门面的方法名 + 三个余韵专用。
 * 余韵专用（只在 `after` 段用）：
 *   tail   —— 低频衰减尾音（重击的「余」）
 *   rustle —— 细碎沙沙（元素残留 / 毒雾 / 火海的持续感）
 *   ring   —— 悠长余韵（法术 / 太极 / 召唤的余味） */
const SFX_AUDIO_KEYS = [
  'swing', 'hit', 'crit', 'cast', 'fire', 'ice', 'thunder', 'explode', 'heal', 'boss',
  'tail', 'rustle', 'ring'
];

/* 每只技能三段：
 *   cast   —— 起手（施法瞬间）
 *   impact —— 命中（伤害结算那一刻）
 *   after  —— 余韵（命中之后）
 *             `after` 段的键 + `ms`（余韵延迟毫秒，200~600 对齐 §5）
 *
 * `impactCrit` —— 暴击时改用这个键（可省略；省略就还用 impact 的音）。
 *   暴击是「更重的一下」，用同一个音就听不出区别。省略不是 bug ——
 *   有些技能的暴击与普通命中本来就该一个音（打击感来自数字与画面）。
 *
 * `afterGuard` —— 余韵兜底的**保护窗口**（可省略，默认 = `after.ms`）。
 *   给「命中来得很晚」的技能用：陨石前摇 0.9 秒才结算伤害，
 *   兜底若在 560ms 就补尾巴，声音会跑到命中**前面**。
 *   配了之后兜底延后到命中之后；正常路径（impact → after）仍优先，靠令牌互斥。
 *
 * `impactAt` —— **领域类自报落地**的毫秒数（可省略）。
 *   火墙 / 暴雪 / 雷云 / 剑阵的每跳伤害是 silent DoT，`damageEnemy` 不发音，
 *   但它们视觉上有「预警圈收束 / 光柱砸下」的落地瞬间 —— 那才是命中段。
 *   配了它，三段层在施法后这个时刻自己发一次 impact（并接上余韵）。
 *   **不要**反过来让 DoT 每跳都响：那会变成电钻。
 *
 * 键为 null = 这段故意不响（比如增益类技能没有「命中」）。
 * **不写 null 兜底成某个键** —— 那就是「每只技能听起来都差不多」。 */
const SKILL_AUDIO = {
  /* ---------------- 刀客 ---------------- */
  whirl:    { cast: 'swing',   impact: 'hit',     impactCrit: 'crit', after: { key: 'rustle', ms: 260 } },
  thrust:   { cast: 'swing',   impact: 'explode', after: { key: 'tail',   ms: 320 } },
  warcry:   { cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 240 } },
  quake:    { cast: 'cast',    impact: 'explode', after: { key: 'tail',   ms: 420 } },
  leap:     { cast: 'swing',   impact: 'explode', after: { key: 'tail',   ms: 340 } },
  shieldwall:{cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 280 } },
  bloodrage:{ cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 300 } },
  execute:  { cast: 'swing',   impact: 'hit',     impactCrit: 'crit', after: { key: 'tail',   ms: 280 } },
  avatar:   { cast: 'cast',    impact: 'explode', after: { key: 'tail',   ms: 460 } },
  riposte:  { cast: 'cast',    impact: 'hit',     after: { key: 'rustle', ms: 240 } },
  swordarray:{cast: 'cast',    cast2: 'thunder', impact: 'swing', impactAt: 260, after: { key: 'ring', ms: 320 } },
  skysfall: { cast: 'cast',    impact: 'explode', after: { key: 'tail',   ms: 520 } },

  /* ---------------- 法师 ---------------- */
  fireball: { cast: 'fire',    impact: 'explode', after: { key: 'rustle', ms: 300 } },
  frostnova:{ cast: 'ice',     impact: 'hit',     impactCrit: 'crit', after: { key: 'rustle', ms: 340 } },
  /* 连锁闪电的起手不该和命中同为 thunder —— 同帧两声一样的雷，
   * 玩家听不出「起手 → 命中」两段（真机实测 gap=0 被判成双响）。
   * 起手改法术蓄势，命中留霹雳。 */
  chain:    { cast: 'cast',    impact: 'thunder', after: { key: 'rustle', ms: 220 } },
  meteor:   { cast: 'cast',    impact: 'explode', after: { key: 'tail',   ms: 560 }, afterGuard: 1000 },
  iceshard: { cast: 'ice',     impact: 'hit',     impactCrit: 'crit', after: { key: 'rustle', ms: 200 } },
  firewall: { cast: 'fire',    impact: 'explode', impactAt: 300, after: { key: 'rustle', ms: 420 } },
  iceshield:{ cast: 'ice',     impact: null,      after: { key: 'ring',   ms: 300 } },
  blizzard: { cast: 'ice',     impact: 'explode', impactAt: 320, after: { key: 'rustle', ms: 460 } },
  starfall: { cast: 'cast',    cast2: 'boss',    impact: 'explode', after: { key: 'tail', ms: 520 }, afterGuard: 1600 },
  thundercloud:{cast:'thunder',impact: 'explode', impactAt: 300, after: { key: 'rustle', ms: 440 } },
  /* pyroclasm 是「施法即命中」的即时 AOE：原来那声 explode 是命中音，
   * 现在由 impact 段接管，不能再留一份当起手和弦（同帧两个 explode = 双响）。 */
  pyroclasm:{ cast: 'fire',    impact: 'explode', after: { key: 'tail', ms: 500 } },
  elementavatar:{cast:'cast',  impact: null,      after: { key: 'ring',   ms: 380 } },
  judgement:{ cast: 'thunder', cast2: 'boss',    impact: 'explode', after: { key: 'tail', ms: 560 } },

  /* ---------------- 道士 ---------------- */
  talisman: { cast: 'cast',    impact: 'thunder', after: { key: 'rustle', ms: 240 } },
  summon:   { cast: 'heal',    cast2: 'boss',    impact: null,      after: { key: 'ring', ms: 320 } },
  heal:     { cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 300 } },
  poison:   { cast: 'cast',    impact: null,      after: { key: 'rustle', ms: 380 } },
  talismanarrow:{cast:'cast',  impact: 'thunder', after: { key: 'rustle', ms: 220 } },
  antidote: { cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 260 } },
  taiji:    { cast: 'cast',    impact: null,      after: { key: 'ring',   ms: 340 } },
  whitetiger:{cast: 'heal',    cast2: 'boss',    impact: 'hit',     after: { key: 'ring', ms: 360 } },
  swordrain:{ cast: 'thunder', impact: 'swing',   after: { key: 'rustle', ms: 380 } },
  mastersigil:{cast:'cast',    impact: 'explode', after: { key: 'ring',   ms: 320 } },
  azuredragon:{cast:'heal',    cast2: 'boss',    impact: 'hit',     after: { key: 'ring', ms: 360 } },
  revive:   { cast: 'cast',    cast2: 'heal',    impact: null,      after: { key: 'ring', ms: 280 } }
};

/* 取一只技能的三段配置。查不到返回 null —— **不兜底**。
 * 兜底成「随便给一段」就是「所有技能听起来一样」的根源，
 * 而查不到本身是个该修的 bug（加技能忘了配音效）。 */
function skillAudio(id) {
  if (!id || !SKILL_AUDIO) return null;
  const a = SKILL_AUDIO[id];
  return a || null;
}

/* 三段是否齐全（契约测试用）：段键在允许表里 + 余韵有合法延迟。 */
function skillAudioOk(id) {
  const a = skillAudio(id);
  if (!a) return false;
  for (const s of ['cast', 'cast2', 'impact', 'impactCrit']) {
    const k = a[s];
    if (k === null || k === undefined) continue;   /* 故意不响 = 合法 */
    if (SFX_AUDIO_KEYS.indexOf(k) < 0) return false;
  }
  const af = a.after;
  if (af) {
    if (!af.key || SFX_AUDIO_KEYS.indexOf(af.key) < 0) return false;
    /* §5：余韵 200~600ms */
    if (!(af.ms >= 200 && af.ms <= 600)) return false;
    if (a.afterGuard !== undefined && !(a.afterGuard > af.ms && a.afterGuard <= 2500)) return false;
  }
  /* 起手段（cast / cast2）不能和命中段撞键 —— 同帧两个同音就是双响，
   * 而且玩家听不出「起手 → 命中」两段。
   * 踩过两次：pyroclasm 曾 cast2:explode + impact:explode；
   * chain 曾 cast:thunder + impact:thunder（真机判据 gap=0）。 */
  if (a.cast && (a.cast === a.impact || a.cast === a.impactCrit)) return false;
  if (a.cast2 && (a.cast2 === a.impact || a.cast2 === a.impactCrit)) return false;
  /* 有 impact 段的技能必须有 after（命中之后要有余韵）；
   * 没有 impact 段的技能也要有 after（施法之后的收尾）。 */
  if (!af) return false;
  return true;
}
