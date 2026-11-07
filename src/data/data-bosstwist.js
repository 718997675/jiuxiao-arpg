'use strict';
/* ============================================================
 * BOSS_TWIST —— 每只首领自己的四拍
 * ------------------------------------------------------------
 * 病根：五格里第 1~4 格从**共享池**取（31 招撑 180 个格位）。于是
 * 树王的「砸地」和石王的「砸地」是同一段代码、同一个名字、同一个答案。
 * 玩家打第三只的时候已经知道怎么躲了 —— 这就是「换汤不换药」。
 *
 * 这里不改共享招本身（它还是那 31 段代码，别处也在用），改的是
 * **这一只放它的时候，它变成什么**：
 *   n  这一只自己的叫法（面板 / 播报读它）
 *   a  这一招逼你做什么（一句，越短越好；播报只显示这一行）
 *   ops 命中那一拍额外发生的事（见 boss-twist.js 的 OPS）
 *
 * 写的时候守两条：
 *   1. **四个格子的答案要不一样**。四格全写「往旁边闪」等于没写 ——
 *      这一只的四拍必须覆盖四种不同的动作（走开 / 挣脱 / 别贴边 /
 *      追着炸 / 绕背）。
 *   2. **第 5 格（nt_*）不许写**。那 45 条已经是每只一个独立函数，
 *      是「本命」，再包一层就把它自己的意思盖掉了。测试会拦。
 *
 * 没写进来的首领不是坏了，是还没轮到 —— 播报会退回共享招的原名，
 * 变形层不生效，行为和老版本一模一样。
 * ============================================================ */
const BOSS_TWIST = {

  /* ---------------- 巨木妖王（幽篁林 · 木 / 瘴） ----------------
   * 主题：地面归它管。四拍分别对应「别踩 / 别贴边 / 被缠住 / 别停」。 */
  treeking: {
    c: 0x8fd05a,
    s: {
      sporecloud: { n: '腐叶瘴', a: '别站在瘴气里', ops: [['domain', { preset: 'poison', r: 3.4, ttl: 6, at: 'player' }]] },
      slam:       { n: '裂根震', a: '砸完别贴边',   ops: [['spikes', { n: 9, r: 4.6, mul: 0.6 }]] },
      roots:      { n: '缠根陷', a: '被缠住就往后撤', ops: [['domain', { preset: 'tide', r: 3.2, ttl: 4, at: 'player' }]] },
      bamboo:     { n: '竹刺追', a: '一直跑，别停', ops: [['volley', { n: 3, gap: 0.42, r: 2.0, mul: 0.45 }]] }
    }
  },

  /* ---------------- 血蝠魔君（幽篁林 · 血 / 扑） ----------------
   * 主题：把人拽回来再咬。四拍 = 拖拽 / 追炸 / 余震 / 血池。 */
  batking: {
    c: 0xd8586a,
    s: {
      drainchain: { n: '血锁', a: '被拽住就冲刺挣脱', ops: [['pull', { frac: 0.5, dur: 0.5 }],
                                                         ['domain', { preset: 'poison', r: 2.6, ttl: 3, at: 'boss' }]] },
      ringshot:   { n: '血羽环', a: '绕着跑，别走直线', ops: [['volley', { n: 2, gap: 0.5, r: 2.2, mul: 0.45 }]] },
      charge:     { n: '扑咬', a: '冲完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.55, r: 3.4 }]] },
      blooddive:  { n: '血浴', a: '落点会留一摊血', ops: [['domain', { preset: 'poison', r: 3.8, ttl: 5, at: 'hit' }]] }
    }
  },

  /* ---------------- 半兽人酋长·碎骨（沼泽 · 蛮力 / 战鼓） ----------------
   * 主题：拆图腾的压力 + 硬推。四拍 = 领域削弱 / 别贴边 / 拖拽 / 连续震。 */
  chief: {
    c: 0xc06a3a,
    s: {
      totem:    { n: '战鼓图腾', a: '鼓声里攻速变慢，先拆图腾', ops: [['domain', { preset: 'warcry', r: 4.0, ttl: 8, at: 'boss' }]] },
      slam:     { n: '碎骨砸', a: '砸完别贴边', ops: [['spikes', { n: 8, r: 4.2, mul: 0.6 }]] },
      charge:   { n: '蛮冲', a: '撞过来之前先侧闪', ops: [['pull', { frac: 0.45, dur: 0.45 }]] },
      warstomp: { n: '踏地裂', a: '震完还有两下', ops: [['echo', { n: 2, gap: 0.4, mul: 0.5, r: 4.8 }]] }
    }
  },

  /* ---------------- 骨塔主持（骨塔 · 骨 / 咒） ----------------
   * 主题：场上是它的东西。四拍 = 毒地 / 必中标记 / 召唤点骨刺 / 锁链。 */
  boneabbot: {
    c: 0xcfd3c4,
    s: {
      eggs:      { n: '腐卵', a: '别站在卵囊旁边', ops: [['domain', { preset: 'poison', r: 3.0, ttl: 6, at: 'boss' }]] },
      curse:     { n: '蚀骨咒', a: '脚下亮起来就动', ops: [['mark', { r: 1.8, dur: 1.3, mul: 1.0 }]] },
      summon:    { n: '唤骨', a: '召唤点会先冒骨刺', ops: [['spikes', { n: 6, r: 3.0, mul: 0.5, at: 'boss' }]] },
      soulchain: { n: '锁魂链', a: '被锁住要挣脱', ops: [['pull', { frac: 0.55, dur: 0.5 }],
                                                       ['domain', { preset: 'tide', r: 2.8, ttl: 3, at: 'player' }]] }
    }
  },

  /* ---------------- 蛇姬·青鳞（沼泽 · 毒 / 石化） ----------------
   * 主题：站着就输。四拍 = 必中 / 毒潮 / 追炸 / 追咬。 */
  snakequeen: {
    c: 0x5fbf6a,
    s: {
      petrify:    { n: '石化凝视', a: '别站着看它', ops: [['mark', { r: 2.0, dur: 1.1, mul: 0.9 }]] },
      poisonnova: { n: '毒潮', a: '离开毒潮', ops: [['domain', { preset: 'poison', r: 4.2, ttl: 6, at: 'boss' }]] },
      ringshot:   { n: '蛇牙环', a: '边跑边绕，别直线', ops: [['volley', { n: 3, gap: 0.4, r: 1.9, mul: 0.4 }]] },
      venomfang:  { n: '毒牙', a: '咬完还有一口', ops: [['echo', { n: 1, gap: 0.35, mul: 0.6, r: 3.0 }]] }
    }
  },

  /* ---------------- 石甲巨魔（铁峰 · 岩 / 甲） ----------------
   * 主题：正面打不动。四拍 = **绕背** / 别贴边 / 滚石 / 钉住。 */
  golemking: {
    c: 0x9aa0a8,
    s: {
      stonearmor: { n: '岩甲', a: '别正面打 —— 绕到背后', ops: [['guard', { arc: 120, mul: 0.2, turn: 1.2, dur: 4 }]] },
      slam:       { n: '碎岩拳', a: '砸完别贴边', ops: [['spikes', { n: 10, r: 4.6, mul: 0.65 }]] },
      rocks:      { n: '滚石', a: '滚石追着你，横着让', ops: [['volley', { n: 2, gap: 0.6, r: 2.6, mul: 0.55 }]] },
      stonespear: { n: '石矛', a: '被钉住就冲刺', ops: [['pull', { frac: 0.5, dur: 0.6 }]] }
    }
  },

  /* ---------------- 幽魂道尊（矿洞 · 魂 / 咒） ----------------
   * 主题：拖着你走。四拍 = 持续拖拽 / 追炸 / 蚀魂地 / 必中。 */
  ghostlord: {
    c: 0x7a86c8,
    s: {
      soulpull:  { n: '摄魂', a: '被拽就冲刺', ops: [['pull', { frac: 0.55, dur: 0.7 }]] },
      ringshot:  { n: '幽火环', a: '绕着跑', ops: [['volley', { n: 2, gap: 0.55, r: 2.1, mul: 0.45 }]] },
      curse:     { n: '蚀魂', a: '别停在原地', ops: [['domain', { preset: 'poison', r: 3.0, ttl: 5, at: 'player' }]] },
      soulchain: { n: '锁魂链', a: '别在圈里停 —— 它一直在拽', ops: [['domain', { preset: 'devour', r: 4.2, ttl: 4, at: 'player' }]] }
    }
  },

  /* ---------------- 赤炎魔将（霜原 · 火） ----------------
   * 主题：地上一直有火。四拍 = 余烬地 / 别贴边 / 连爆 / 必中。 */
  firegeneral: {
    c: 0xff6a3c,
    s: {
      firewall:    { n: '焚道', a: '火墙后面还留着火', ops: [['domain', { preset: 'poison', r: 3.6, ttl: 4, at: 'player' }]] },
      slam:        { n: '炎爆', a: '爆完别贴边', ops: [['spikes', { n: 8, r: 4.4, mul: 0.65 }]] },
      summon:      { n: '火灵', a: '火灵落地会连爆', ops: [['echo', { n: 2, gap: 0.5, mul: 0.45, r: 3.0 }]] },
      flamecleave: { n: '裂炎斩', a: '看到扇形就往侧面走', ops: [['mark', { r: 2.0, dur: 0.9, mul: 0.7 }]] }
    }
  },

  /* ================================================================
   * B25：剩下 37 只。按族分，族内**动作轴故意错开** ——
   * 冰/水偏「推离 + 看不见」，毒/虫偏「转火打掉」，剑偏「追炸 / 别回原位」，
   * 火/岩偏「留地 / 别贴边」，天界偏「限时目标 / 绕背」，镜/混沌偏「幻域」，
   * 八部共用一个 staggerbreak 格，那一格**八只各给一种不同的变形**。
   * 判据不只看同一只四拍不同，也看「同一个共享招跨只不许长一个样」（契约第六节）。
   * ================================================================ */

  /* ---------------- 卷二 · 冰 / 水 ---------------- */
  icequeen: {
    c: 0x86bcdc,
    s: {
      freeze:    { n: '寒潭封脉', a: '被冻住立刻连点挣脱', ops: [['mark', { r: 1.9, dur: 1.0, mul: 0.85 }]] },
      frostnova: { n: '霜华漫地', a: '冰面上移速变慢，别恋战', ops: [['domain', { preset: 'tide', r: 4.4, ttl: 6, at: 'boss' }]] },
      ringshot:  { n: '冰魄环', a: '冰雾里看不清，记住它的位置', ops: [['shroud', { preset: 'illusion', r: 7.5, ttl: 4, at: 'player' }]] },
      glacial:   { n: '玄冰棱', a: '冰环外沿会炸，往里站', ops: [['spikes', { n: 10, r: 4.2, mul: 0.6 }]] }
    }
  },
  riverwraith: {
    c: 0x6a96b8,
    s: {
      soulpull: { n: '忘川牵魂', a: '被拽住就冲刺挣脱', ops: [['pull', { frac: 0.55, dur: 0.65 }]] },
      venomfang:{ n: '腐水噬', a: '咬完还有一口，别停', ops: [['echo', { n: 1, gap: 0.42, mul: 0.55, r: 3.2 }]] },
      curse:    { n: '沉河咒', a: '脚下亮起来就动', ops: [['mark', { r: 2.1, dur: 1.2, mul: 0.8 }]] },
      tide:     { n: '回潮', a: '水把你往外推，逆着走回来', ops: [['push', { dist: 4.2, dur: 0.7 }]] }
    }
  },
  yellowspring: {
    c: 0x7a9e8a,
    s: {
      flood:    { n: '黄泉涨', a: '水一直涨，逆着往前打', ops: [['push', { dist: 5.0, dur: 0.75 }]] },
      ringshot: { n: '渡口铃', a: '铃声里看不清路，贴着它打', ops: [['shroud', { preset: 'daynight', r: 8, ttl: 5, at: 'player' }]] },
      soulpull: { n: '不渡之索', a: '被拽住就冲刺', ops: [['pull', { frac: 0.6, dur: 0.7 }]] },
      tide:     { n: '忘川回流', a: '原地会再涨一次，别回', ops: [['echo', { n: 2, gap: 0.5, mul: 0.5, r: 4.0 }]] }
    }
  },
  ferryman: {
    c: 0x88a0a8,
    s: {
      ferry:    { n: '摆渡', a: '落地后立刻再走一步', ops: [['push', { dist: 4.6, dur: 0.55 }]] },
      slam:     { n: '篙击', a: '击完别贴边', ops: [['spikes', { n: 8, r: 4.0, mul: 0.6 }]] },
      ringshot: { n: '橹影环', a: '影子里认不出真身', ops: [['shroud', { preset: 'illusion', r: 7, ttl: 4, at: 'boss' }]] },
      tide:     { n: '船底暗涌', a: '水底一直拽着你', ops: [['domain', { preset: 'devour', r: 4.2, ttl: 5, at: 'player' }]] }
    }
  },

  /* ---------------- 卷二 · 毒 / 虫 ---------------- */
  spidermother: {
    c: 0x8fc25a,
    s: {
      eggs:       { n: '百子卵囊', a: '六秒内先打掉卵囊', ops: [['totem', { kind: 'sac', hp: 90, ttl: 6, r: 2.8, mul: 0.8, at: 'hit' }]] },
      summon:     { n: '引丝', a: '召唤点会先冒一圈刺', ops: [['spikes', { n: 7, r: 3.2, mul: 0.5, at: 'boss' }]] },
      poisonnova: { n: '毒潮涌', a: '离开毒潮，别站在里面', ops: [['domain', { preset: 'poison', r: 4.4, ttl: 6, at: 'boss' }]] },
      web:        { n: '缚网', a: '被网住就冲刺挣脱', ops: [['pull', { frac: 0.5, dur: 0.55 }]] }
    }
  },
  abysswyrm: {
    c: 0x5e8a62,
    s: {
      drainchain:{ n: '渊吸', a: '拉开距离才断链', ops: [['pull', { frac: 0.6, dur: 0.7 }]] },
      charge:    { n: '古蟒撞', a: '撞完别急着回原位', ops: [['echo', { n: 1, gap: 0.5, mul: 0.6, r: 3.6 }]] },
      slam:      { n: '尾砸', a: '砸完别贴边', ops: [['spikes', { n: 9, r: 4.8, mul: 0.65 }]] },
      venomfang: { n: '腐牙', a: '毒雾里看不清它', ops: [['shroud', { preset: 'illusion', r: 7, ttl: 4, at: 'player' }]] }
    }
  },

  /* ---------------- 卷二 · 熔 / 灰 / 焚 ---------------- */
  magmalord: {
    c: 0xe07038,
    s: {
      rockfall:   { n: '熔岩落', a: '落点之间有缝，走缝别乱跑', ops: [['volley', { n: 3, gap: 0.5, r: 2.2, mul: 0.45 }]] },
      slam:       { n: '赤髓拳', a: '拳落之后外圈还会翻', ops: [['spikes', { n: 9, r: 4.5, mul: 0.65 }]] },
      fireline:   { n: '熔脉裂', a: '裂缝上一直有火', ops: [['domain', { preset: 'poison', r: 3.4, ttl: 5, at: 'hit' }]] },
      stonespear: { n: '熔钉', a: '被钉住就冲刺', ops: [['pull', { frac: 0.45, dur: 0.5 }]] }
    }
  },
  ashwarden: {
    c: 0x9a8a70,
    s: {
      firewall:   { n: '灰墙', a: '别被夹在两道墙中间', ops: [['push', { dist: 4.0, dur: 0.6 }]] },
      quake:      { n: '守望者踏地', a: '震完还有两下', ops: [['echo', { n: 2, gap: 0.45, mul: 0.5, r: 4.2 }]] },
      rocks:      { n: '灰烬滚石', a: '滚石追着你，横着让', ops: [['volley', { n: 2, gap: 0.6, r: 2.6, mul: 0.5 }]] },
      stonespear: { n: '残像石矛', a: '像里看不清哪一支是真的', ops: [['shroud', { preset: 'illusion', r: 6.5, ttl: 4, at: 'boss' }]] }
    }
  },
  flamewraith: {
    c: 0xf08a4a,
    s: {
      sporecloud: { n: '焚风余烬', a: '别站在余烬里', ops: [['domain', { preset: 'poison', r: 3.6, ttl: 5, at: 'player' }]] },
      ringshot:   { n: '怨火环', a: '一直跑，别停', ops: [['volley', { n: 3, gap: 0.38, r: 2.0, mul: 0.4 }]] },
      curse:      { n: '不散之咒', a: '脚下亮起来就动', ops: [['mark', { r: 1.8, dur: 1.1, mul: 0.8 }]] },
      flamecleave:{ n: '焚风斩', a: '正面打不动，绕到背后', ops: [['guard', { arc: 110, mul: 0.25, turn: 1.0, dur: 3 }]] }
    }
  },
  flameemperor: {
    c: 0xff5a2c,
    s: {
      rockfall:   { n: '炎帝落星', a: '落点之间有缝，走缝', ops: [['volley', { n: 3, gap: 0.42, r: 2.4, mul: 0.5 }]] },
      meteor:     { n: '焚天陨', a: '落点亮起来就走开', ops: [['mark', { r: 2.4, dur: 1.3, mul: 1.0 }]] },
      quake:      { n: '帝踏', a: '震完连着还有两下', ops: [['echo', { n: 2, gap: 0.4, mul: 0.55, r: 4.8 }]] },
      flamecleave:{ n: '裂天炎', a: '扇形里留着一层火', ops: [['domain', { preset: 'poison', r: 4.0, ttl: 4, at: 'hit' }]] }
    }
  },

  /* ---------------- 卷三 · 骨 / 幽 ---------------- */
  marrowlord: {
    c: 0xd0d2c6,
    s: {
      stonearmor: { n: '骨甲', a: '别正面打 —— 绕到背后', ops: [['guard', { arc: 130, mul: 0.2, turn: 1.3, dur: 4 }]] },
      quake:      { n: '长廊震', a: '震完别急着回原位', ops: [['echo', { n: 2, gap: 0.45, mul: 0.5, r: 4.4 }]] },
      drainchain: { n: '吸髓', a: '被拽住就冲刺挣脱', ops: [['pull', { frac: 0.55, dur: 0.6 }]] },
      eggs:       { n: '骨髓囊', a: '限时打掉骨囊，别拖', ops: [['totem', { kind: 'sac', hp: 110, ttl: 5, r: 3.0, mul: 0.85, at: 'boss' }]] }
    }
  },
  swordguardian: {
    c: 0xb8c6d4,
    s: {
      bladedomain:{ n: '守灵剑域', a: '剑域里每息都在挨剑气', ops: [['domain', { preset: 'warcry', r: 4.2, ttl: 6, at: 'boss' }]] },
      roots:      { n: '冢藤', a: '被缠住就往后撤', ops: [['pull', { frac: 0.4, dur: 0.5 }]] },
      quake:      { n: '万剑震', a: '震完外圈还会立剑', ops: [['spikes', { n: 10, r: 4.6, mul: 0.6 }]] },
      swordrain:  { n: '守冢剑雨', a: '一直跑，剑雨追着落', ops: [['volley', { n: 3, gap: 0.4, r: 2.1, mul: 0.45 }]] }
    }
  },

  /* ---------------- 卷三 · 剑 ---------------- */
  swordlord: {
    c: 0xc6d2e0,
    s: {
      bladedomain:{ n: '天罡剑域', a: '圈里每息吃剑气，出去', ops: [['domain', { preset: 'warcry', r: 4.5, ttl: 7, at: 'boss' }]] },
      charge:     { n: '万剑突', a: '冲完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.6, r: 3.6 }]] },
      swordrain:  { n: '剑落如雨', a: '一直跑，别停', ops: [['volley', { n: 4, gap: 0.35, r: 1.9, mul: 0.4 }]] },
      bladering:  { n: '环刃', a: '环外沿会炸，往里站', ops: [['spikes', { n: 12, r: 4.4, mul: 0.6 }]] }
    }
  },
  bladelord: {
    c: 0xd8cfb0,
    s: {
      mirror:    { n: '辨真·三影', a: '看胸口有核的那个，别打分身', ops: [['shroud', { preset: 'illusion', r: 7.5, ttl: 4, at: 'boss' }]] },
      swordrain: { n: '坑底剑雨', a: '剑雨追着落，一直跑', ops: [['volley', { n: 3, gap: 0.38, r: 2.0, mul: 0.45 }]] },
      ringshot:  { n: '剑气环', a: '环落完原地还有一下', ops: [['echo', { n: 1, gap: 0.5, mul: 0.5, r: 3.4 }]] },
      bladering: { n: '无柄之环', a: '环外沿立剑，往里站', ops: [['spikes', { n: 11, r: 4.2, mul: 0.6 }]] }
    }
  },
  swordemperor: {
    c: 0xe4dcc0,
    s: {
      bladedomain:{ n: '剑帝之域', a: '域里攻速被压，别硬站', ops: [['domain', { preset: 'warcry', r: 5.0, ttl: 7, at: 'boss' }]] },
      summon:     { n: '剑冢残念', a: '限时打掉阵眼，别拖', ops: [['totem', { hp: 150, ttl: 6, r: 3.4, mul: 0.9, at: 'boss' }]] },
      ringshot:   { n: '帝剑环', a: '一直绕着跑，别走直线', ops: [['volley', { n: 3, gap: 0.4, r: 2.2, mul: 0.45 }]] },
      bladering:  { n: '绝巅环', a: '正面挡得住，绕到背后', ops: [['guard', { arc: 100, mul: 0.2, turn: 1.4, dur: 4 }]] }
    }
  },

  /* ---------------- 卷四 / 卷五 · 天界 ---------------- */
  cloudwarden: {
    c: 0xa8c2d8,
    s: {
      windpress:  { n: '断桥罡风', a: '逆着风走回来，别被吹下去', ops: [['push', { dist: 5.2, dur: 0.8 }]] },
      ringshot:   { n: '云海箭', a: '云里看不清落点，记住方位', ops: [['shroud', { preset: 'daynight', r: 8.5, ttl: 5, at: 'player' }]] },
      stonespear: { n: '桥钉', a: '脚下亮起来就动', ops: [['mark', { r: 1.9, dur: 1.0, mul: 0.8 }]] },
      charge:     { n: '云中撞', a: '撞完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.55, r: 3.4 }]] }
    }
  },
  heavenguard: {
    c: 0xd8b878,
    s: {
      wardrum:    { n: '南天战鼓', a: '先砸鼓，别让它一直叫人', ops: [['totem', { hp: 160, ttl: 7, r: 3.6, mul: 0.85, at: 'boss' }]] },
      stonespear: { n: '门柱钉', a: '被钉住就冲刺', ops: [['pull', { frac: 0.5, dur: 0.55 }]] },
      warstomp:   { n: '守门踏', a: '踏完连着还有两下', ops: [['echo', { n: 2, gap: 0.42, mul: 0.5, r: 4.6 }]] },
      slam:       { n: '门塌', a: '塌完外圈还会翻起石刺', ops: [['spikes', { n: 10, r: 4.8, mul: 0.65 }]] }
    }
  },
  jadeemperor: {
    c: 0xc8d0b0,
    s: {
      totem:     { n: '残朝图腾', a: '限时打掉图腾，别拖', ops: [['totem', { hp: 130, ttl: 6, r: 3.2, mul: 0.85, at: 'boss' }]] },
      slam:      { n: '玉阶震', a: '阶下会一直渗寒气', ops: [['domain', { preset: 'tide', r: 4.0, ttl: 5, at: 'hit' }]] },
      ringshot:  { n: '废都环', a: '一直跑，别停', ops: [['volley', { n: 3, gap: 0.4, r: 2.1, mul: 0.45 }]] },
      bladering: { n: '玉阙环', a: '正面挡得住，绕到背后', ops: [['guard', { arc: 110, mul: 0.22, turn: 1.2, dur: 4 }]] }
    }
  },
  starlord: {
    c: 0xb0a0e0,
    s: {
      petrify:  { n: '陨石视线', a: '别站在视线里，绕到背后', ops: [['shroud', { preset: 'daynight', r: 8, ttl: 4, at: 'boss' }]] },
      meteor:   { n: '拽星', a: '落点亮起来就走开', ops: [['mark', { r: 2.6, dur: 1.2, mul: 1.0 }]] },
      charge:   { n: '坠星撞', a: '撞完外圈还有一圈碎石', ops: [['spikes', { n: 9, r: 4.2, mul: 0.6 }]] },
      ringshot: { n: '星屑环', a: '一直横着跑，别走直线', ops: [['volley', { n: 3, gap: 0.36, r: 2.0, mul: 0.42 }]] }
    }
  },

  /* ---------------- 卷五 · 镜 / 混沌 ---------------- */
  mirrordemon: {
    c: 0xa88ad8,
    s: {
      mirror:   { n: '辨真·三影', a: '看胸口有核的那个，别打分身', ops: [['shroud', { preset: 'illusion', r: 8, ttl: 5, at: 'boss' }]] },
      slam:     { n: '幻影砸', a: '砸完别回原位', ops: [['echo', { n: 1, gap: 0.5, mul: 0.55, r: 3.6 }]] },
      ringshot: { n: '镜中环', a: '脚下亮起来就动', ops: [['mark', { r: 2.0, dur: 1.0, mul: 0.8 }]] },
      formless: { n: '无相', a: '相里看不清，贴着它打', ops: [['domain', { preset: 'devour', r: 4.0, ttl: 4, at: 'player' }]] }
    }
  },
  mirrorlord: {
    c: 0x8f78c8,
    s: {
      mirror:   { n: '镜渊辨真', a: '视野只剩九米，贴近打', ops: [['shroud', { preset: 'daynight', r: 8.5, ttl: 5, at: 'boss' }]] },
      soulpull: { n: '渊底牵影', a: '被拽住就冲刺挣脱', ops: [['pull', { frac: 0.6, dur: 0.7 }]] },
      charge:   { n: '镜面突', a: '镜面把你往外推，逆着走', ops: [['push', { dist: 4.4, dur: 0.65 }]] },
      formless: { n: '渊无相', a: '相散了还在追，一直跑', ops: [['volley', { n: 3, gap: 0.4, r: 2.2, mul: 0.45 }]] }
    }
  },
  nineheaven: {
    c: 0xe0c890,
    s: {
      bladedomain:{ n: '九霄剑域', a: '域里攻速被压，别硬站', ops: [['domain', { preset: 'warcry', r: 5.2, ttl: 7, at: 'boss' }]] },
      quake:      { n: '层天震', a: '震完外圈立起天柱', ops: [['spikes', { n: 12, r: 5.0, mul: 0.6 }]] },
      charge:     { n: '神将突', a: '冲完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.6, r: 3.8 }]] },
      warstomp:   { n: '天门鼓', a: '限时打掉鼓，别拖', ops: [['totem', { hp: 170, ttl: 7, r: 3.8, mul: 0.9, at: 'boss' }]] }
    }
  },
  chaosavatar: {
    c: 0x9a6ad0,
    s: {
      mirror: { n: '真身辨真', a: '小地图花了，记住它的位置', ops: [['shroud', { preset: 'illusion', r: 9, ttl: 6, at: 'boss' }]] },
      quake:  { n: '终焉震', a: '震完连着还有两下', ops: [['echo', { n: 2, gap: 0.38, mul: 0.6, r: 5.0 }]] },
      meteor: { n: '混沌陨', a: '落点留着残骸，限时打掉', ops: [['totem', { hp: 180, ttl: 6, r: 3.6, mul: 1.0, at: 'hit' }]] },
      formless:{ n: '万物无相', a: '相把你往外推，逆着走', ops: [['push', { dist: 5.4, dur: 0.8 }]] }
    }
  },
  chaos: {
    c: 0x8660c0,
    s: {
      mirror:    { n: '终焉辨真', a: '看胸口有核的那个', ops: [['shroud', { preset: 'illusion', r: 8.5, ttl: 5, at: 'boss' }]] },
      frostnova: { n: '寒寂漫地', a: '冰面上移速变慢，别恋战', ops: [['domain', { preset: 'tide', r: 5.0, ttl: 6, at: 'boss' }]] },
      fireline:  { n: '焚界线', a: '界上一直有火，别踩', ops: [['push', { dist: 4.8, dur: 0.7 }]] },
      formless:  { n: '终焉无相', a: '脚下亮起来就动', ops: [['mark', { r: 2.4, dur: 1.1, mul: 0.9 }]] }
    }
  },

  /* ---------------- 八部众 ----------------
   * 八只的第 1 格都是 `staggerbreak`（同一段共享代码）。这一格如果八只
   * 都给同一个变形，就等于「八部共用一张脸」—— 所以**八只各给一种不同的 op**，
   * 让「读招破绽」这一拍在八只身上逼出八种不同的动作。契约第六节会拦。 */
  bafo_deva: {
    c: 0xe8c070,
    s: {
      staggerbreak: { n: '天主后摇', a: '破绽只有几秒，先打掉杵', ops: [['totem', { hp: 140, ttl: 4, r: 3.0, mul: 0.7, at: 'boss' }]] },
      slam:         { n: '持杵击', a: '击完别贴边', ops: [['spikes', { n: 9, r: 4.4, mul: 0.6 }]] },
      ringshot:     { n: '天光环', a: '一直跑，别停', ops: [['volley', { n: 3, gap: 0.38, r: 2.0, mul: 0.42 }]] },
      warstomp:     { n: '天踏', a: '踏完连着还有两下', ops: [['echo', { n: 2, gap: 0.42, mul: 0.5, r: 4.4 }]] }
    }
  },
  bafo_naga: {
    c: 0x5aa0c8,
    s: {
      staggerbreak: { n: '盘渊破绽', a: '破绽时它把你往外顶，逆着走', ops: [['push', { dist: 4.6, dur: 0.7 }]] },
      venomfang:    { n: '龙毒牙', a: '咬完还有一口', ops: [['echo', { n: 1, gap: 0.4, mul: 0.6, r: 3.2 }]] },
      ringshot:     { n: '盘渊环', a: '水里看不清落点', ops: [['shroud', { preset: 'daynight', r: 8, ttl: 4, at: 'player' }]] },
      flood:        { n: '渊潮', a: '潮里一直被往里吸', ops: [['domain', { preset: 'devour', r: 4.4, ttl: 5, at: 'player' }]] }
    }
  },
  bafo_yaksa: {
    c: 0xd06858,
    s: {
      staggerbreak: { n: '四臂破绽', a: '破绽时小地图花了，记住方位', ops: [['shroud', { preset: 'illusion', r: 8, ttl: 4, at: 'boss' }]] },
      slam:         { n: '鬼将砸', a: '砸完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.6, r: 4.0 }]] },
      quake:        { n: '四臂震', a: '震完外圈立起石刺', ops: [['spikes', { n: 11, r: 4.8, mul: 0.65 }]] },
      stonespear:   { n: '鬼钉', a: '被钉住就冲刺', ops: [['pull', { frac: 0.5, dur: 0.55 }]] }
    }
  },
  bafo_gandharva: {
    c: 0xc8a8e0,
    s: {
      staggerbreak: { n: '弦歌破绽', a: '破绽时别正面打，绕背', ops: [['guard', { arc: 120, mul: 0.25, turn: 1.1, dur: 3 }]] },
      warstomp:     { n: '乐神踏', a: '踏完原地还有一下', ops: [['echo', { n: 1, gap: 0.5, mul: 0.55, r: 4.2 }]] },
      curse:        { n: '迷魂弦', a: '脚下亮起来就动', ops: [['mark', { r: 2.0, dur: 1.0, mul: 0.8 }]] },
      soulchain:    { n: '弦锁', a: '被锁住就冲刺挣脱', ops: [['pull', { frac: 0.55, dur: 0.6 }]] }
    }
  },
  bafo_asura: {
    c: 0xe06a48,
    s: {
      staggerbreak: { n: '三头破绽', a: '破绽时脚下留火，别站', ops: [['domain', { preset: 'poison', r: 3.6, ttl: 4, at: 'player' }]] },
      slam:         { n: '阿修罗砸', a: '砸完外圈还会翻', ops: [['spikes', { n: 10, r: 4.8, mul: 0.65 }]] },
      charge:       { n: '三头撞', a: '撞完别急着回原位', ops: [['echo', { n: 1, gap: 0.42, mul: 0.6, r: 3.8 }]] },
      flamecleave:  { n: '修罗裂炎', a: '落点亮起来就走开', ops: [['mark', { r: 2.2, dur: 0.9, mul: 0.8 }]] }
    }
  },
  bafo_garuda: {
    c: 0xf0b050,
    s: {
      staggerbreak: { n: '金翅破绽', a: '破绽时被拽住就冲刺', ops: [['pull', { frac: 0.6, dur: 0.6 }]] },
      charge:       { n: '迦楼罗扑', a: '扑完别回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.6, r: 3.6 }]] },
      warstomp:     { n: '金翅踏', a: '踏完外圈翻起羽刃', ops: [['spikes', { n: 12, r: 4.6, mul: 0.6 }]] },
      blooddive:    { n: '血羽坠', a: '落点会留一摊血', ops: [['domain', { preset: 'poison', r: 4.0, ttl: 5, at: 'hit' }]] }
    }
  },
  bafo_kimnara: {
    c: 0xa8d090,
    s: {
      staggerbreak: { n: '鹿鸣破绽', a: '破绽时脚下亮起来就动', ops: [['mark', { r: 2.0, dur: 1.0, mul: 0.75 }]] },
      ringshot:     { n: '鹿鸣环', a: '一直横着跑，别走直线', ops: [['volley', { n: 3, gap: 0.36, r: 2.0, mul: 0.42 }]] },
      roots:        { n: '林藤', a: '被缠住就往后撤', ops: [['pull', { frac: 0.42, dur: 0.5 }]] },
      soulchain:    { n: '鸣锁', a: '林里看不清，贴着它打', ops: [['shroud', { preset: 'illusion', r: 7, ttl: 4, at: 'player' }]] }
    }
  },
  bafo_mahoraga: {
    c: 0x6e9a70,
    s: {
      staggerbreak: { n: '大蟒破绽', a: '破绽时外圈会立刺，往里站', ops: [['spikes', { n: 9, r: 4.4, mul: 0.6 }]] },
      slam:         { n: '蟒腹砸', a: '砸完别急着回原位', ops: [['echo', { n: 1, gap: 0.48, mul: 0.58, r: 4.0 }]] },
      roots:        { n: '地蟒藤', a: '藤里一直有毒', ops: [['domain', { preset: 'poison', r: 3.4, ttl: 5, at: 'hit' }]] },
      venomfang:    { n: '腹毒牙', a: '脚下亮起来就动', ops: [['mark', { r: 1.9, dur: 1.0, mul: 0.8 }]] }
    }
  },

  /* ---------------- 地宫五类 ---------------- */
  dgb_tomb: {
    c: 0x8a7a62,
    s: {
      corpsetide: { n: '墓道尸潮', a: '限时打掉棺眼，别拖', ops: [['totem', { hp: 150, ttl: 6, r: 3.4, mul: 0.9, at: 'boss' }]] },
      slam:       { n: '石棺砸', a: '砸完别贴边', ops: [['spikes', { n: 9, r: 4.4, mul: 0.62 }]] },
      quake:      { n: '墓室震', a: '震完连着还有两下', ops: [['echo', { n: 2, gap: 0.44, mul: 0.52, r: 4.6 }]] },
      soulchain:  { n: '棺锁', a: '被锁住就冲刺挣脱', ops: [['pull', { frac: 0.55, dur: 0.6 }]] }
    }
  },
  dgb_well: {
    c: 0x6a8a92,
    s: {
      rockfall:  { n: '井壁落石', a: '落点之间有缝，走缝', ops: [['volley', { n: 3, gap: 0.44, r: 2.2, mul: 0.45 }]] },
      flood:     { n: '井涌', a: '水一直把你往外推', ops: [['push', { dist: 4.8, dur: 0.75 }]] },
      corpsetide:{ n: '井底尸潮', a: '井里看不清，记住路', ops: [['shroud', { preset: 'daynight', r: 8, ttl: 5, at: 'player' }]] },
      quake:     { n: '井壁震', a: '震完外圈翻起碎石', ops: [['spikes', { n: 10, r: 4.6, mul: 0.6 }]] }
    }
  },
  dgb_den: {
    c: 0x9a7a58,
    s: {
      wardrum:   { n: '穴中战鼓', a: '先砸鼓，别让它一直叫', ops: [['totem', { hp: 140, ttl: 6, r: 3.2, mul: 0.85, at: 'boss' }]] },
      charge:    { n: '兽穴撞', a: '撞完别急着回原位', ops: [['echo', { n: 1, gap: 0.45, mul: 0.6, r: 3.6 }]] },
      venomfang: { n: '穴毒牙', a: '咬完还有一口', ops: [['mark', { r: 2.0, dur: 0.9, mul: 0.8 }]] },
      summon:    { n: '唤兽', a: '召唤点会先冒刺', ops: [['spikes', { n: 7, r: 3.2, mul: 0.5, at: 'boss' }]] }
    }
  },
  dgb_gaol: {
    c: 0x7a7a90,
    s: {
      flood:      { n: '牢中涨水', a: '水里一直被往里吸', ops: [['domain', { preset: 'devour', r: 4.2, ttl: 5, at: 'player' }]] },
      ringshot:   { n: '狱卒环', a: '一直跑，别停', ops: [['volley', { n: 3, gap: 0.38, r: 2.0, mul: 0.42 }]] },
      curse:      { n: '枷咒', a: '脚下亮起来就动', ops: [['mark', { r: 1.8, dur: 1.1, mul: 0.8 }]] },
      corpsetide: { n: '牢底尸潮', a: '限时打掉闸眼，别拖', ops: [['totem', { hp: 145, ttl: 6, r: 3.2, mul: 0.9, at: 'hit' }]] }
    }
  },
  dgb_fall: {
    c: 0x8a8298,
    s: {
      windpress:  { n: '坠道罡风', a: '逆着风走回来，别被吹下去', ops: [['push', { dist: 5.4, dur: 0.8 }]] },
      slam:       { n: '坠石砸', a: '砸完别贴边', ops: [['spikes', { n: 9, r: 4.6, mul: 0.62 }]] },
      stonespear: { n: '渊钉', a: '被钉住就冲刺', ops: [['pull', { frac: 0.5, dur: 0.55 }]] },
      formless:   { n: '渊底无相', a: '相里看不清，贴着它打', ops: [['shroud', { preset: 'illusion', r: 7.5, ttl: 4, at: 'boss' }]] }
    }
  }

};

/* 供工具与测试读：这一只写了几个格子 */
if (typeof window !== 'undefined') window.BOSS_TWIST = BOSS_TWIST;
