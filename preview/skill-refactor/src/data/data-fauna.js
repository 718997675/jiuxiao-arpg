/* ============================================================
 * 数据层 · 生态（S16 音效 / M15 会在此扩族群行为）
 *
 * 这里只放「族」与「图」的**声音参数**，不含任何逻辑。
 * 一个族键（family）同时贯穿抗性 / 图鉴 / 任务 / 掉落 / 音色 ——
 * 加一个族只改这张表，音效层不需要动代码。
 *
 * 音色不存音频文件：AudioSys 按参数实时合成（振荡器 + 滤波 + 噪声）。
 * 若以后有真录音，放 audio/sfx/<family>_<event>.mp3 即会被优先使用，
 * 调用方一行不改（见 audio.js 的 _sample，清单在下面的 AUDIO_SFX）。
 * ============================================================ */

/* ---------------- 族音色 ----------------
 * osc      主振荡器波形（sine 纯、triangle 木、sawtooth 粗、square 硬）
 * base     体型 1.0 时的基频（Hz）。体型越大 → 合成时自动按 1/size^0.55 降调
 * osc2     可选的第二层（次谐波或泛音），mul 是相对基频的倍率
 * vib      颤音（兽的喉音、虫的嗡鸣靠它）：rate 速率 Hz / depth 频率摆幅 Hz
 * noise    气声层：bandpass 的中心频率与 Q，gain 相对主音
 * filter   主低通（决定「闷」还是「亮」）
 * dur      基础时长（秒），事件表再乘系数
 * gain     基础音量（0~1），会再乘体型/距离/声部预算
 */
const FAMILY_TONES = {
  humanoid: {
    name: '人形', desc: '短促气声，带胸腔共鸣。',
    osc: 'triangle', base: 190,
    osc2: { type: 'sine', mul: 0.5, gain: 0.3 },
    vib: { rate: 9, depth: 4 },
    noise: { freq: 1100, q: 1.6, gain: 0.35 },
    filter: { type: 'lowpass', freq: 2400, q: 0.8 },
    dur: 0.2, gain: 0.16
  },
  beast: {
    name: '兽', desc: '喉音，锯齿波加快速颤音。',
    osc: 'sawtooth', base: 132,
    osc2: { type: 'square', mul: 0.5, gain: 0.28 },
    vib: { rate: 22, depth: 16 },
    noise: { freq: 560, q: 1.2, gain: 0.5 },
    filter: { type: 'lowpass', freq: 1500, q: 1.0 },
    dur: 0.26, gain: 0.2
  },
  undead: {
    name: '亡灵', desc: '低频气声，噪声为主、音高极弱。',
    osc: 'sine', base: 96,
    osc2: null,
    vib: { rate: 4.5, depth: 7 },
    noise: { freq: 420, q: 0.7, gain: 0.9 },
    filter: { type: 'lowpass', freq: 900, q: 0.6 },
    dur: 0.34, gain: 0.17
  },
  spirit: {
    name: '妖灵', desc: '正弦簇，长衰减，飘。',
    osc: 'sine', base: 640,
    osc2: { type: 'sine', mul: 1.5, gain: 0.22 },
    vib: { rate: 5.5, depth: 9 },
    noise: { freq: 3200, q: 2.6, gain: 0.22 },
    filter: { type: 'lowpass', freq: 5200, q: 0.7 },
    dur: 0.3, gain: 0.14
  },
  stone: {
    name: '石魔', desc: '低频撞击，加金属泛音。',
    osc: 'square', base: 62,
    osc2: { type: 'triangle', mul: 3.1, gain: 0.16 },
    vib: null,
    noise: { freq: 190, q: 0.8, gain: 0.7 },
    filter: { type: 'lowpass', freq: 760, q: 0.9 },
    dur: 0.24, gain: 0.22
  },
  plant: {
    name: '草木', desc: '摩擦噪声，木质感。',
    osc: 'sawtooth', base: 108,
    osc2: null,
    vib: { rate: 13, depth: 6 },
    noise: { freq: 1900, q: 0.9, gain: 0.6 },
    filter: { type: 'lowpass', freq: 2600, q: 0.7 },
    dur: 0.22, gain: 0.15
  },
  /* 以下三族现有怪物还没用上（M15 扩族谱时接），先把音色定下来，
   * 免得到时候再回来改 audio.js 的合成分支。 */
  dragon: {
    name: '龙属', desc: '次低频轰鸣，长混响。',
    osc: 'sawtooth', base: 54,
    osc2: { type: 'sine', mul: 0.5, gain: 0.4 },
    vib: { rate: 7, depth: 5 },
    noise: { freq: 300, q: 0.6, gain: 0.55 },
    filter: { type: 'lowpass', freq: 1100, q: 1.1 },
    dur: 0.42, gain: 0.24
  },
  aquatic: {
    name: '水属', desc: '气泡上滑，湿。',
    osc: 'sine', base: 300,
    osc2: null,
    vib: { rate: 11, depth: 12 },
    noise: { freq: 900, q: 2.0, gain: 0.5 },
    filter: { type: 'lowpass', freq: 2000, q: 0.8 },
    dur: 0.2, gain: 0.15,
    rise: 2.4      // 气泡式上滑倍率（缺省时由事件表决定方向）
  },
  insect: {
    name: '虫群', desc: '高频颤音，密集短脉冲。',
    osc: 'square', base: 2300,
    osc2: null,
    vib: { rate: 42, depth: 90 },
    noise: { freq: 4200, q: 1.8, gain: 0.35 },
    filter: { type: 'highpass', freq: 1400, q: 0.8 },
    dur: 0.14, gain: 0.1
  }
};

/* ---------------- 真录音清单（可选） ----------------
 * 默认留空 = 全部实时合成，零资产、零请求。
 * 有录音之后在这里加一行即可接管那条声音，**调用方与事件表一行不改**：
 *
 *   const AUDIO_SFX = {
 *     'beast_attack': 'audio/sfx/beast_attack.mp3',
 *     'undead_death': 'audio/sfx/undead_death.mp3'
 *   };
 *
 * 键 = <族>_<事件>，事件见下面的 VOICE_EVENTS；没登记的键继续合成。
 * 用显式清单而不是「按路径猜文件在不在」，是因为缺文件时浏览器会刷 404，
 * 而 404 会被真机探针当成页面报错 —— 装饰性的回退不应该污染错误日志。
 * 素材解码失败也会静默回退合成，所以删掉整个 audio/sfx/ 目录游戏照样有声。
 */
const AUDIO_SFX = {};

/* ---------------- 玩家 / UI 音效素材 ----------------
 * 和 AUDIO_SFX（怪物族声音）是两套清单，因为它们的调用入口不同：
 * 怪物声走 AudioSys.mob() → voice() → _sample()，键是「族_事件」；
 * 这里的键是 **SFX 门面里的方法名**，由 AudioSys.clip() 直接取。
 *
 * 值为空字符串或删掉这一行 = 该条继续实时合成。整体删掉 audio/ 目录也能跑，
 * 只是每一次 clip() 会先失败一次再回退（_sampleTried 保证只试一次）。
 *
 * 注意 sfx-loot 只接管「普通拾取」：稀有掉落的五音上行是**听觉上的稀有度反馈**，
 * 用同一段素材顶掉会让人分不清掉了什么，所以 loot(r) 的 rare 分支仍走合成。
 */
const AUDIO_CLIPS = {
  ui:       'audio/sfx/sfx-click.wav',
  levelup:  'audio/sfx/sfx-levelup.wav',
  cast:     'audio/sfx/sfx-powerup.wav',
  explode:  'audio/sfx/sfx-explosion.wav',
  swing:    'audio/sfx/sfx-whoosh.wav',
  hit:      'audio/sfx/sfx-hit.wav',
  coin:     'audio/sfx/sfx-coin.wav',
  loot:     'audio/sfx/sfx-pickup.wav',
  heal:     'audio/sfx/sfx-shield.wav'
  /* 已生成但**还没有接入点**的三条，别加进来（加了也只是永远不生效）：
   *   sfx-footstep —— 本作没有跳跃、也没有脚步系统，要接得先在主循环里做
   *                   「按移动距离累积触发」，那是新功能不是接线
   *   sfx-land     —— 同上（无跳跃，落地只在传送/复活时发生）
   *   sfx-blip     —— 项目里没有对话/提示文字的弹出音，暂时没有调用点 */
};

/* ---------------- 背景音乐素材 ----------------
 * 三层各一首（古风，羽调）。**素材是成品曲，不跟着地图调式走** ——
 * 六张图的探索曲会是同一首。这是当前的取舍：有真曲子比「每图不同但都是合成器」好听。
 * 想恢复「按图变调」就把这里清空（写成 {}），BGM 会自动回到 _musicTick 的实时合成。
 *
 * 播放用 HTMLAudioElement + MediaElementSource 接进 bus.music，
 * 这样四条音量滑杆与静音照旧生效；不用 decodeAudioData 是因为
 * 53 秒立体声解码后约 18MB/首，三首同时驻留要 55MB，太贵。
 */
const AUDIO_BGM = {
  explore: 'audio/bgm/guofeng-explore.m4a',
  combat:  'audio/bgm/guofeng-combat.m4a',
  boss:    'audio/bgm/guofeng-boss.m4a'
};

/* ---------------- 事件修饰 ----------------
 * dur     时长倍数        pitch  音高倍数（相对该族基频）
 * gain    音量倍数        bright 滤波器开合倍数（>1 更亮）
 * slide   音高终点倍率（<1 下滑、>1 上滑）
 * tail    加一条尾音（精英 / 首领用）
 * sub     加一层次低频（只有阶段转换这种大事件才给）
 * 事件顺序即「重要度」：贵的（死 / 阶段）允许挤掉便宜的。
 */
const VOICE_EVENTS = {
  attack:    { dur: 1.00, pitch: 1.00, gain: 1.00, bright: 1.00, slide: 0.86 },
  hurt:      { dur: 0.62, pitch: 1.12, gain: 0.82, bright: 1.15, slide: 0.94 },
  idle:      { dur: 1.15, pitch: 0.95, gain: 0.38, bright: 0.85, slide: 0.92 },
  aggro:     { dur: 1.45, pitch: 1.24, gain: 0.80, bright: 1.20, slide: 1.30 },
  death:     { dur: 2.20, pitch: 0.72, gain: 1.15, bright: 0.72, slide: 0.42 },
  elite:     { dur: 2.40, pitch: 1.15, gain: 1.05, bright: 1.10, slide: 0.60, tail: true },
  bossPhase: { dur: 3.00, pitch: 0.58, gain: 1.25, bright: 0.95, slide: 0.40, tail: true, sub: true }
};

/* ---------------- 环境音 ----------------
 * kind       底噪的合成方式（见 audio.js 的 ambient）
 * gain       底噪总音量
 * filter     底噪滤波
 * noiseGain  噪声层相对音量
 * lfo        缓慢起伏（风、水、地脉的呼吸感）
 * drone      可选持续低音（Hz），给地宫 / 天阙这种「有基调」的图
 * deco       随机点缀音（每 2~6 秒一次）
 * root/scale/bpm  音乐层用的调式：root 主音 Hz，scale 五声音阶的半音偏移
 */
const MAP_AMB = {
  village: {
    id: 'village', kind: 'wind', gain: 0.11,
    filter: { freq: 620, q: 0.7 }, noiseGain: 0.9,
    lfo: { rate: 0.07, depth: 0.35 },
    drone: null, deco: ['bird', 'bird', 'bell'],
    root: 220, scale: [0, 3, 5, 7, 10], bpm: 60
  },
  forest: {
    id: 'forest', kind: 'bamboo', gain: 0.13,
    filter: { freq: 1500, q: 0.9 }, noiseGain: 0.8,
    lfo: { rate: 0.11, depth: 0.4 },
    drone: null, deco: ['cricket', 'creak', 'bird'],
    root: 196, scale: [0, 3, 5, 7, 10], bpm: 64
  },
  swamp: {
    id: 'swamp', kind: 'swamp', gain: 0.14,
    filter: { freq: 380, q: 1.0 }, noiseGain: 1.0,
    lfo: { rate: 0.05, depth: 0.45 },
    drone: 55, deco: ['bubble', 'bubble', 'frog'],
    root: 174, scale: [0, 2, 3, 7, 10], bpm: 58
  },
  mine: {
    id: 'mine', kind: 'cave', gain: 0.12,
    filter: { freq: 260, q: 0.9 }, noiseGain: 1.0,
    lfo: { rate: 0.04, depth: 0.3 },
    drone: 49, deco: ['drip', 'drip', 'rock'],
    root: 146, scale: [0, 2, 5, 7, 9], bpm: 56
  },
  abyss: {
    id: 'abyss', kind: 'void', gain: 0.13,
    filter: { freq: 190, q: 0.8 }, noiseGain: 1.0,
    lfo: { rate: 0.03, depth: 0.5 },
    drone: 43, deco: ['whisper', 'chime'],
    root: 130, scale: [0, 1, 5, 6, 10], bpm: 52
  },
  heaven: {
    id: 'heaven', kind: 'aether', gain: 0.1,
    filter: { freq: 2600, q: 0.6 }, noiseGain: 0.7,
    lfo: { rate: 0.09, depth: 0.3 },
    drone: 87, deco: ['chime', 'bell'],
    root: 261, scale: [0, 2, 4, 7, 9], bpm: 66
  }
};

/* 音乐三层：探索 / 战斗 / 首领。战斗与首领不另起调式，
 * 只改节拍与和声走向 —— 换图时调式跟着 MAP_AMB 走，不会突变。 */
const BGM_MODES = {
  explore: { bpmMul: 1.00, gain: 0.55, arp: 0.5, perc: 0.00, drone: 0.00 },
  combat:  { bpmMul: 1.45, gain: 0.75, arp: 1.00, perc: 0.55, drone: 0.35 },
  boss:    { bpmMul: 1.15, gain: 0.85, arp: 0.85, perc: 0.85, drone: 1.00 }
};
