/* ============================================================
 * UI 层：HUD / 背包纸娃娃 / 提示框 / 任务 / 对话 / 商店 / 传送 / 小地图
 * ============================================================ */

const UI = {
  selectedCls: 'warrior',
  tooltipEl: null,
  hoverRef: null,
  skSel: null,       // [S4] 术法面板当前选中的技能（详情卡展示）

  init() {
    this.tooltipEl = document.getElementById('tooltip');
    this.buildClassCards();
    this.buildDiffCards();
    this.bindEvents();
    // 有任意角色位可读，就亮出「继续前世（含档位与等级）」
    try {
      if (typeof SaveManager !== 'undefined' && typeof SaveUI !== 'undefined') SaveUI.syncStart();
    } catch (e) {
      const has = Store.has();
      document.getElementById('continueBtn').style.display = has ? 'inline-block' : 'none';
    }
    if (IS_TOUCH) {
      const tip = document.getElementById('invTip');
      if (tip) tip.textContent = '点击物品查看 · 可穿戴 / 出售';
    }
    // 面板打开时收起虚拟按键（触屏）
    try {
      this.panelObs = new MutationObserver(() => this.syncPanels());
      document.querySelectorAll('.panel, #dialog').forEach(p =>
        this.panelObs.observe(p, { attributes: true, attributeFilter: ['class', 'style'] }));
      this.syncPanels();
    } catch (e) { }
  },

  syncPanels() {
    const dlg = document.getElementById('dialog');
    const open = !!document.querySelector('.panel.open') || (dlg && dlg.style.display === 'block');
    document.body.classList.toggle('ui-open', !!open);
  },

  buildClassCards() {
    const wrap = document.getElementById('classPick');
    wrap.innerHTML = Object.values(CLASSES).map(c => `
      <div class="cclass ${c.key === this.selectedCls ? 'sel' : ''}" data-cls="${c.key}">
        <div class="cg">${c.icon}</div>
        <div class="cn">${c.name}</div>
        <div class="ct">${c.title} · ${c.res}</div>
        <div class="cd">${c.desc}</div>
      </div>`).join('');
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.cclass');
      if (!el) return;
      this.selectedCls = el.dataset.cls;
      wrap.querySelectorAll('.cclass').forEach(x => x.classList.toggle('sel', x === el));
      SFX.ui();
    });
  },

  /* ---------------- 难度选择 ----------------
   * 四档难度在开档时确定，中途不可改。选中项存 UI.selectedDiff，
   * 点「踏入山海」时随 startNew 一起传进去。 */
  buildDiffCards() {
    const wrap = document.getElementById('diffPick');
    if (!wrap) return;
    if (!this.selectedDiff) this.selectedDiff = DEFAULT_DIFF;
    wrap.innerHTML = DIFF_ORDER.map(k => {
      const d = DIFFS[k];
      return `<div class="cdiff ${k === this.selectedDiff ? 'sel' : ''}" data-diff="${k}">
        <div class="dn" style="color:${d.color}">${d.name}</div>
        <div class="dt2" style="color:${d.color}">${d.tag}</div>
      </div>`;
    }).join('');
    this.renderDiffDesc();
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.cdiff');
      if (!el) return;
      this.selectedDiff = el.dataset.diff;
      wrap.querySelectorAll('.cdiff').forEach(x => x.classList.toggle('sel', x === el));
      this.renderDiffDesc();
      SFX.ui();
    });
  },

  renderDiffDesc() {
    const el = document.getElementById('diffDesc');
    if (!el) return;
    const d = getDiff(this.selectedDiff);
    el.innerHTML = d.desc;
    el.style.color = d.color;
    el.style.opacity = '.9';
  },

  bindEvents() {
    document.getElementById('startBtn').addEventListener('click', () => {
      const n = (document.getElementById('nameInput').value || '').trim() || '无名客';
      Game.startNew(this.selectedCls, n, 0, this.selectedDiff);
    });

    /* 调试直连：index.html?cls=warrior|mage|taoist 跳过标题页直接开局。
     * 不带参数时完全无影响，正式发布地址不受影响 */
    const q = new URLSearchParams(location.search);
    const auto = q.get('cls');
    if (auto && CLASSES[auto]) {
      this.selectedCls = auto;
      const wrap = document.getElementById('classPick');
      if (wrap) wrap.querySelectorAll('.cclass').forEach(x => x.classList.toggle('sel', x.dataset.cls === auto));
      const nm = (q.get('name') || '').trim() || '无名客';
      /* 支持 ?cls=warrior&diff=hard 直接按指定难度开局，方便测试四档数值 */
      const df = q.get('diff');
      if (df && DIFFS[df]) {
        this.selectedDiff = df;
        const dw = document.getElementById('diffPick');
        if (dw) dw.querySelectorAll('.cdiff').forEach(x => x.classList.toggle('sel', x.dataset.diff === df));
        this.renderDiffDesc();
      }
      setTimeout(() => Game.startNew(auto, nm, 0, this.selectedDiff), 80);
    }
    document.getElementById('continueBtn').addEventListener('click', e => {
      const slot = parseInt(e.currentTarget.dataset.slot, 10);
      Game.loadGame(slot || undefined);
    });
    const sm = document.getElementById('saveMgrBtn');
    if (sm) sm.addEventListener('click', () => SaveUI.open());

    /* 背包排序按钮（v1.0.4）：点一次就重排 state.inventory 并重绘。
     * 排序直接作用在真实数组上，不另做一份「显示用视图」——
     * 物品的 data-ref 是下标，一旦视图和数组顺序不一致，点错装备就成了常态 bug。 */
    const sortWrap = document.getElementById('invSort');
    if (sortWrap) {
      sortWrap.addEventListener('click', e => {
        const b = e.target.closest('[data-sort]');
        if (!b) return;
        this.sortMode = b.dataset.sort;
        sortWrap.querySelectorAll('[data-sort]').forEach(x => x.classList.toggle('on', x === b));
        Game.sortInventory(this.sortMode);
        SFX.ui();
      });
    }

    /* 行囊四栏切换（v1.3.0）：装备 / 材料 / 丹药 / 任务物品 */
    const tabs = document.getElementById('invTabs');
    if (tabs) {
      tabs.addEventListener('click', e => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        this.invTab = b.dataset.tab;
        SFX.ui();
        this.renderInventory();
      });
    }

    /* 一键分解（v1.1.4）：展开确认条 → 预估产出 → 确认/取消 */
    const dj = document.getElementById('invDecomposeBtn');
    if (dj) dj.addEventListener('click', () => {
      this.invJunkOpen = !this.invJunkOpen;
      SFX.ui();
      this.renderInventory();
    });
    const jb = document.getElementById('invJunkBar');
    if (jb) jb.addEventListener('click', e => {
      if (e.target.closest('[data-junkmagic]')) {
        this.invJunkMagic = !this.invJunkMagic;
        SFX.ui();
        this.renderInventory();
        return;
      }
      if (e.target.closest('[data-junkok]')) {
        const r = Game.decomposeJunk(this.invJunkMagic);
        this.invJunkOpen = false;
        if (!r.ok && r.msg) UI.log(r.msg, 'bad');
        this.renderInventory();
        return;
      }
      if (e.target.closest('[data-junkcancel]')) {
        this.invJunkOpen = false;
        SFX.ui();
        this.renderInventory();
      }
    });

    /* 套装图鉴 */
    const sc = document.getElementById('invCodexBtn');
    if (sc) sc.addEventListener('click', () => this.openSetCodex());

    /* 行囊扩容（v1.4.0）：点容量旁的「扩容」展开内联条，确认后容量与格子随即刷新 */
    const upBtn = document.getElementById('invUpBtn');
    if (upBtn) upBtn.addEventListener('click', () => {
      this.invUpOpen = !this.invUpOpen;
      SFX.ui();
      this.renderInventory();
    });
    const upBar = document.getElementById('invUpBar');
    if (upBar) upBar.addEventListener('click', e => {
      const go = e.target.closest('[data-upgo]');
      if (!go) return;
      const r = Game.upgradeBag();
      if (!r.ok && r.msg) UI.log(r.msg, 'bad');
      SFX.ui();
      this.renderInventory();
    });

    // 物品悬停 / 点击（事件委托）
    document.addEventListener('mouseover', e => {
      if (IS_TOUCH) return;   // 触屏改为一指点开、按钮操作
      /* 材料格：图标 + 角标之后格子里没有文字了，说明全靠这条提示 */
      const mc = e.target.closest('[data-mti]');
      if (mc && this._matTips) {
        const c = this._matTips[parseInt(mc.dataset.mti, 10)];
        if (c) { this.showMatTip(c, e); return; }
      }
      const el = e.target.closest('[data-ref]');
      if (!el) return;
      const item = this.itemFromRef(el.dataset.ref);
      if (!item) return;
      this.hoverRef = el.dataset.ref;
      /* 背包里的物品才做「与已穿装备对比」；已穿的那件自己跟自己比没有意义 */
      const isInv = el.dataset.ref.startsWith('inv:');
      this.tooltipEl.innerHTML = itemTooltip(item, {
        hint: isInv ? '左键装备 / Shift+左键出售' : '左键卸下',
        compareTo: isInv ? this.equippedFor(item) : null
      });
      this.tooltipEl.style.display = 'block';
      this.moveTooltip(e);
    });
    document.addEventListener('mousemove', e => { if (!IS_TOUCH && this.tooltipEl.style.display === 'block') this.moveTooltip(e); });
    document.addEventListener('mouseout', e => {
      if (IS_TOUCH) return;
      const el = e.target.closest('[data-ref],[data-mti]');
      if (el) { this.tooltipEl.style.display = 'none'; this.hoverRef = null; }
    });
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-ref]');
      if (!el) {
        /* 材料格在触屏下是「点一下看提示」，这一下不能顺手把提示关掉 */
        if (IS_TOUCH && this.tooltipEl.style.display === 'block' && !e.target.closest('[data-mti]')) this.hideTooltip();
        return;
      }
      const ref = el.dataset.ref;
      if (IS_TOUCH) { e.preventDefault(); this.showTouchItem(el); return; }
      if (ref.startsWith('inv:')) {
        const i = parseInt(ref.split(':')[1]);
        if (e.shiftKey) Game.sellItem(i);
        else Game.equipFromInv(i);
      } else if (ref.startsWith('eq:')) {
        Game.unequip(ref.split(':')[1]);
      }
      this.tooltipEl.style.display = 'none';
    });

    // 快捷键（v1.6.0：全部指向主菜单的对应页签）
    window.addEventListener('keydown', e => {
      if (document.activeElement && document.activeElement.id === 'nameInput') return;
      const k = e.key.toLowerCase();
      if (k === 'i') { this.openMenu('bag'); e.preventDefault(); }
      else if (k === 't') { this.openMenu('talent'); e.preventDefault(); }
      else if (k === 'k') { this.openMenu('skill'); e.preventDefault(); }
      else if (k === 'c') { this.openMenu('stat'); e.preventDefault(); }
      else if (k === 'l') { this.openMenu('quest'); e.preventDefault(); }
      else if (k === 'b') { this.openMenu('codex'); e.preventDefault(); }
      else if (k === 'r') { this.openMenu('forge'); e.preventDefault(); }
      else if (k === 'p') { this.openMenu('save'); e.preventDefault(); }
      else if (k === 'h' || k === '?') { this.openMenu('help'); e.preventDefault(); }
      else if (k === 'o') { this.openSettings(); e.preventDefault(); }
      else if (k === 'tab') { this.toggleMenu(); e.preventDefault(); }
      else if (k === 'escape') {
        const mp = document.getElementById('menuPanel');
        if (mp && mp.classList.contains('open')) this.closeMenu();
        else this.closeAll();
      }
    });

    /* 主菜单页签 */
    const mTabs = document.getElementById('menuTabs');
    if (mTabs) mTabs.addEventListener('click', e => {
      const b = e.target.closest('[data-mtab]');
      if (!b || b.dataset.mtab === this.menuTab) return;
      this.menuTab = b.dataset.mtab;
      this.menuMount(this.menuTab);
      try { SFX.ui(); } catch (err) { }
    });

    /* 设置面板：按钮是动态生成的，用事件委托，避免每次重绘都重新挂监听 */
    const setBody = document.getElementById('setBody');
    if (setBody) setBody.addEventListener('click', e => this.onSettingsClick(e));
  },

  /* ---------------- 设置面板 ---------------- */

  SET_ROWS: [
    { k: 'preset', label: '画质档位',
      opts: [['auto', '自动'], ['ultra', '极高'], ['high', '高'], ['mid', '中'], ['low', '低'], ['min', '极低']] },
    { k: 'scale', label: '渲染倍率',
      opts: [['auto', '自动'], ['1.25', '1.25x'], ['1', '1.0x'], ['0.8', '0.8x'], ['0.65', '0.65x'], ['0.5', '0.5x']] },
    { k: 'shadow', label: '实时阴影',
      opts: [['auto', '自动'], ['on', '开'], ['off', '关']] },
    { k: 'fx', label: '粒子效果',
      opts: [['auto', '自动'], ['high', '高'], ['mid', '中'], ['low', '低']] },
    { k: 'mobCap', label: '同屏怪数',
      opts: [['auto', '自动'], ['48', '多'], ['36', '标准'], ['28', '少'], ['20', '很少'], ['12', '极少']] },
    { k: 'fps', label: '显示帧数',
      opts: [['0', '关'], ['1', '开']] }
  ],

  openSettings() {
    /* 游戏内就是主菜单的一页；标题界面（还没有存档）仍然用独立弹窗 */
    if (typeof Game !== 'undefined' && Game.state && document.getElementById('menuPanel')) {
      this.openMenu('set');
      return;
    }
    const p = document.getElementById('setPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this.renderSettings();
  },

  /* ============================================================
   * 机制说明（H）
   *
   * 原则：**能读数据的绝不写死**。
   *   · 条数（槽位 / 词缀 / 套装 / 技能 / 变体 / 天赋 / 精英词缀 / 怪物）全部实时统计
   *   · 名字类（基底八阶、品质、机制名、难度）直接从数据表取
   *   · 只有「怎么用」这类叙述性文字是手写的
   * 这样以后加装备、加技能、调数值，这一页会自动跟着变，
   * 不会再出现「说明里写 64 条词缀、实际已经 80 条」这种对不上的情况。
   * ============================================================ */
  renderHelp() {
    const el = document.getElementById('helpBody');
    const nav = document.getElementById('hpNav');
    if (!el || !nav) return;
    const cnt = o => (o && typeof o === 'object') ? Object.keys(o).length : 0;
    const len = a => Array.isArray(a) ? a.length : 0;
    const K = k => `<span class="hp-key">${k}</span>`;
    const row = (k, v) => `<div class="hp-row"><b>${k}</b><span>${v}</span></div>`;
    const tags = (list, cls) => `<div class="hp-tags">${list.map(t => `<span class="hp-tag ${cls || ''}">${t}</span>`).join('')}</div>`;
    /* 键位小牌：一个键 + 一句功能，各占一块、自然换行。
     * 以前写成「A · B · C」这种一行串，换行时会把分隔符甩在行尾（v1.8.3 反馈）。 */
    const kc = (k, label) => `<span class="hp-tag kc">${K(k)}${label}</span>`;
    const kcs = list => `<div class="hp-tags kcs">${list.map(([k, l]) => kc(k, l)).join('')}</div>`;
    /* body 传的是数组，直接插值会被 Array.toString 拼成「行,行,行」——
     * 那个逗号在 flex 布局里会孤零零落在行首（用户反馈的「每行换行的逗号」就是它）。
     * 显式 join('')，数组与字符串两种入参都吃。 */
    const sec = (t, note, body) => `<div class="hp-sec"><h4>${t}${note ? `<span class="hp-n">${note}</span>` : ''}</h4>${Array.isArray(body) ? body.join('') : body}</div>`;

    /* ---------------- 数据快照 ---------------- */
    const slotN = len(SLOT_ORDER);
    const slotNames = [...new Set(SLOT_ORDER.map(s => SLOT_NAME[s] || s))];
    const affN = len(AFFIXES);
    const affTier = { 1: 0, 2: 0, 3: 0 };
    AFFIXES.forEach(a => { affTier[a.tier] = (affTier[a.tier] || 0) + 1; });
    const setIds = Object.keys(SETS);
    const setUniN = setIds.filter(id => SETS[id].cls === null).length;
    const skillIds = Object.keys(SKILLS);
    const varN = skillIds.reduce((n, id) => n + len(SKILLS[id].variants), 0);
    const mechN = (typeof specialVariantCount === 'function') ? specialVariantCount() : 0;
    const mechList = (typeof SKILL_SPECIALS === 'object')
      ? Object.keys(SKILL_SPECIALS).map(k => SKILL_SPECIALS[k].name) : [];
    const talentN = cnt(TALENT_NODES);
    const synN = (typeof TALENTS !== 'undefined' && TALENTS.synergy) ? len(TALENTS.synergy[0].nodes) : 0;
    const eliteN = cnt(ELITE_AFFIXES);
    const mobN = cnt(MONSTERS);
    const runeWordN = len(RUNE_WORDS);
    const tierN = len(BASE_TIER_NAME);
    const rarList = Object.keys(RARITY).map(k => RARITY[k]);
    const diffList = Object.keys(DIFFS).map(k => DIFFS[k]);
    const barSlots = (typeof SKILL_BAR_SLOTS === 'number') ? SKILL_BAR_SLOTS : 8;
    const barSets = (typeof SKILL_BAR_SETS === 'number') ? SKILL_BAR_SETS : 2;
    const lvStep = (typeof SKILL_LV_STEP === 'number') ? Math.round(SKILL_LV_STEP * 100) : 8;
    const lvMax = (typeof SKILL_LV_MAX === 'number') ? SKILL_LV_MAX : 10;

    /* 每一节先按原样拼成 html，末尾再从 <h4> 里反解出「短名」给左侧页签用
     * —— 这样新增一节只要写一次 sec(...)，不用再维护一份页签名列表。 */
    const H = [];

    /* ---------------- 1. 操作 ---------------- */
    H.push(sec('一 · 怎么玩', '键位全在这里，游戏画面上不再贴提示', [
      row('移动 / 视角', kcs([['WASD', '移动'], ['鼠标', '瞄准'], ['Q / E', '转视角'], ['滚轮', '缩放'], ['空格', '翻滚']])),
      row('战斗', kcs([['左键', '普攻（按住连击）'], [`1-${barSlots}`, '技能条'], [SKILL_BAR_SET_LABEL, '切换快捷栏'], ['Z', '红药'], ['X', '蓝药'], ['9', '传送石']])),
      row('交互', kcs([['F', '交互 / 拾取'], ['Tab', '开关菜单'], ['Esc', '关闭面板']])),
      row('面板', kcs([['I', '行囊'], ['C', '道途'], ['T', '天赋'], ['K', '术法'], ['L', '山海志'], ['B', '异兽志'], ['R', '炼器台'], ['P', '存档'], ['O', '设置'], ['H', '说明']])),
      row('手机', kcs([['左半屏', '拖动 = 摇杆'], ['右侧宫格', `技能条 4×2`], ['空白处', '拖动转视角'], ['双指', '捏合缩放']])),
      row('目标', `打怪 → 掉装备 → 换更强的 → 下更深的地图。角色不会掉等级，死亡只掉金币（新手难度不掉）。`),
      row('换栏', `技能条共 ${barSets} 套，按 ${K(SKILL_BAR_SET_LABEL)} 切一套（备用键 ${K('`')}${K('V')}）—— 一套打首领、一套刷图。动作条右端与术法面板底部都显示当前是哪一套，手机点技能宫格上方那枚小按钮`),
      /* 剑 / 盾两枚图标各占一块小牌：以前把图标直接塞进句子中间，换行时会把
       * 「输出栏 / 防守栏」拆到图标上下两行，读起来像是图标自己成了一段 */
      `<div class="hp-tags kcs">
        <span class="hp-tag kc">${barSetIcon(0, 14)}输出栏</span>
        <span class="hp-tag kc">${barSetIcon(1, 14)}防守栏</span>
      </div>`
    ]));

    /* ---------------- 2. 属性 ---------------- */
    H.push(sec('二 · 角色属性', '装备 / 天赋 / 药水最终都汇到这一张面板', [
      row('主属性', `攻击力（决定所有伤害基数）、护甲（减物理伤）、生命上限、灵力上限、灵力回复`),
      row('伤害乘区', `暴击率 × 暴击伤害 × 攻速 × 元素增伤 × 技能增伤 × 对精英/首领增伤 —— 各乘区独立相乘，堆单一乘区收益会衰减`),
      row('防御', `护甲、闪避、格挡、伤害减免、各元素抗性（上限 75%）、濒死免疫（致死时留 1 血，60 秒冷却）`),
      row('资源', `战士用怒气、法师道士用灵力；消耗降低 / 回复速度 / 击杀回蓝都会影响技能循环`),
      row('看来源', `悬停任意属性值会列出「哪件装备 / 哪条天赋贡献了多少」，方便判断该换什么`)
    ]));

    /* ---------------- 3. 装备 ---------------- */
    H.push(sec('三 · 装备', `${slotN} 个槽位`, [
      row('槽位', `${slotN} 个：${slotNames.join(' / ')}`),
      row('基底阶', `${tierN} 阶：${BASE_TIER_NAME.join(' → ')}。同名字的装备阶数越高，基础数值越高。传世不在八阶体系内（见第六节）`),
      row('物品等级', `每件装备有 ilvl，越高则词缀数值上限越高。怪物等级决定掉落 ilvl，首领额外 +2`),
      row('双手 / 双持', `武器分单手与双手：双手占用副手格；副手只能是盾、副手武器或法器`),
      row('升阶', `炼器台「升阶」页：把一件装备的基底提升一阶，保留品质 / 词缀 / 孔位 / 符文 / 强化等级，只换基底。需要同名装备 + 铜钱 + 玄晶`)
    ]));

    /* ---------------- 4. 品质与词缀 ----------------
     * 用户反馈：「品质说明是不是有问题，现在是八阶装备 + 套装 + 传世」。
     * 原来把 6 个 RARITY 平铺成一行「品质」，其中套装 / 传世其实是**类型**而不是
     * 品质档位（都不在升品链上），摆在「凡品→神品」旁边会让人以为可以一路升上去。
     * 现在先点明三条线，品质只列升品链上的四档，套装 / 传世各自单开一行并指路。 */
    const qualityChain = rarList.filter(r => r.key !== 'set' && r.key !== 'unique');
    /* 传世的数据快照提前到这里：第四节要引用件数，第六节也用同一份 */
    const uniList = (typeof UNIQUE_ITEMS !== 'undefined') ? UNIQUE_ITEMS : [];
    const uniN = len(uniList);
    const traitN = cnt(typeof UNIQUE_TRAITS !== 'undefined' ? UNIQUE_TRAITS : {});
    H.push(sec('四 · 品质与词缀', `${affN} 条词缀`, [
      row('三条线', `别混在一起看：<b>基底阶</b>（${tierN} 阶，决定基础数值，见第三节）· <b>品质</b>（决定词条条数与边框颜色）· <b>类型</b>（普通 / 套装 / 传世）。一件装备同时有一个阶、一个品质、一个类型 —— 例：同是「${BASE_TIER_NAME[1]}」基底的长剑，可以是凡品（0 词条）也可以是玄品（${RARITY.rare.affixes + RARITY.rare.fixed} 词条）；阶管数值，品管词条`),
      row('品质（可升品）', `<div class="hp-tags kcs">${qualityChain.map(r =>
        `<span class="hp-tag q" style="color:${r.color};border-color:${r.color}55" title="掉落权重 ${r.weight}">${r.name}<i>${r.affixes + r.fixed} 词条</i></span>`).join('')}</div>`),
      row('套装（类型）', `绿色边框，${setIds.length} 套。品质固定为「套装」（${RARITY.set.affixes + RARITY.set.fixed} 词条），靠穿够 2 / 3 / 4 / 5 件激活套装效果，不走升品链`),
      row('传世（类型）', `红色边框，${uniN} 件。固定词条 + 独有特性 + 技能效果，既不在升品链也不在八阶链 —— 详见第六节`),
      row('词缀池', `共 ${affN} 条：一阶 ${affTier[1]} 条 / 二阶 ${affTier[2]} 条 / 三阶 ${affTier[3]} 条。阶数越高数值越大，掉落权重越低`),
      row('词缀族', `元素伤害（火/冰/雷/毒）、单项与全抗、+N 技能等级、光环（周围减速/持续伤害）、资源、生存、掉落、暴击、攻速、移速`),
      row('洗练', `炼器台「品质」页可以重洗词条；同一条属性不会在一件装备上出现两次`)
    ]));

    /* ---------------- 5. 套装 / 符文 / 传世 ---------------- */
    H.push(sec('五 · 套装与符文', `${setIds.length} 套 · ${runeWordN} 条符文之语`, [
      row('套装', `共 ${setIds.length} 套（${setUniN} 套通用、${setIds.length - setUniN} 套职业专属）。穿 2 / 3 / 4 / 5 件逐级激活更强效果，绿色边框`),
      row('符文之语', `${runeWordN} 条。按顺序把符文镶进带孔装备，凑成指定组合才生效 —— 顺序错了不触发`),
      row('套装联动', `部分套装会激活天赋树里的隐藏「协同」星位，见第八节`)
    ]));

    /* ---------------- 6. 传世（唯一装备） ---------------- */
    /* uniList / uniN / traitN 在第四节已经取过，这里只补剩下的统计 */
    const grantN = uniList.filter(u => u.skill && u.skill.grant).length;
    const upN = uniList.filter(u => u.skill && !u.skill.grant).length;
    const clsUniN = uniList.filter(u => u.cls).length;
    H.push(sec('六 · 传世名器', `${uniN} 件 · ${traitN} 条独有特性`, [
      row('是什么', `红色边框的「传世」装备，共 ${uniN} 件（${clsUniN} 件职业专属、${uniN - clsUniN} 件三职业通用）。每件都有固定名字、固定词条区间、独有特性和专属技能效果`),
      row('不入八阶', `八阶（${BASE_TIER_NAME.join(' → ')}）讲的是「同一件东西被锻造到多好」；传世天生就是这个样子 —— <b>没有阶、不能升阶</b>，炼器台会直接拒绝并说明原因`),
      row('特性唯一', `${traitN} 条特性，每一条只属于一件传世，<b>全表不重复</b>。想要某件更强，就给它新写一条特性，不会去借别人的`),
      row('属性类特性', `直接进面板，看到多少就是多少：饮血、金刚、巨灵、疾风这类`),
      row('触发类特性', `满足条件自动触发：霜噬减速、焚烬爆炸、雷罚连锁、回响不进冷却、血怒击杀加速`),
      row('机制类特性', `独立实现的一次性机制：涅槃复活、收魂回血、狂战、裂魂暴击爆炸`),
      row('技能效果', `每件都带一条，二选一：<b>授予新技能</b>（${grantN} 件，跨职业秘技，术法面板里单独一组「秘技」，脱下即失去）或<b>强化已有技能</b>（${upN} 件，指定技能 +伤害 / -冷却 / +范围，'通玄' 则是全部技能）`),
      row('与套装区别', `套装靠「穿够几件」逐级激活，单件很弱；传世单件即完整，不占套装计数、也不会触发套装效果`),
      row('怎么来', `怪物等级达到该件的 ilvl 后进入掉落池，首领与高难度掉率更高；同一件可以重复掉落，每次数值重新 roll`),
      tags(uniList.map(u => `${u.name}${u.cls ? '（' + CLASSES[u.cls].name + '）' : ''}`), 'uni')
    ]));

    /* ---------------- 7. 术法与变体 ---------------- */
    H.push(sec('七 · 术法与变体', `${skillIds.length} 个技能 · ${varN} 个变体`, [
      row('技能', `三职业各 ${Math.round(skillIds.length / 3)} 个，按等级领悟。技能点每级 1 点，技能等级上限 ${lvMax}，每级 +${lvStep}% 伤害`),
      row('变体', `每个技能 3 个变体（Ⅰ / Ⅱ / Ⅲ），切换不花点数。Ⅰ / Ⅱ 多数是数值调整，Ⅲ 是机制改造`),
      row('机制变体', `青色 ◆ 角标 = 改打法而不是改数字，共 ${mechN} 条`),
      tags(mechList, 'mech'),
      row('技能条', `${barSlots} 格 × ${barSets} 套，在术法面板详情卡底部点数字自己配；按 ${K(SKILL_BAR_SET_LABEL)} 换栏（一套打首领、一套刷图）`),
      row('秘技', `传世授予的技能（可跨职业）在面板里单独一组，青色「秘」角标；脱下装备即失去，不占技能点`),
      row('四种状态', kcs([['图标灰', '未领悟'], ['环形遮罩', '冷却中'], ['暗红', '灵力不足'], ['Ⅰ/Ⅱ/Ⅲ', '当前变体']]))
    ]));

    /* ---------------- 7. 天赋与协同 ---------------- */
    H.push(sec('八 · 天赋与协同', `${talentN} 个节点`, [
      row('天赋点', `每级 1 点，另加任务奖励 10 点，满级共 70 点`),
      row('页签', `三职业系各 10 节点 + 通用「通达」+ 协同「星位」，共 5 页`),
      row('节点层级', `小节点可投 5 级 · 中节点 1 级（需本系先投 5 点）· 大节点是质变（需本系 5 点且等级达标）`),
      row('协同', `${synN} 枚隐藏星位，默认在星盘上不显形。把装备穿对（套装件数 / 符文之语 / 词条达标）后自动亮起，之后就能像普通节点一样投点`),
      row('协同操作', `切到「协同」页签，画布下方会列出每一枚的激活条件与当前是否已显形`),
      row('预设 / 洗点', `3 套预设一键切换；洗点费用递增（1k / 5k / 20k / 50k 铜钱）`)
    ]));

    /* ---------------- 8. 敌人 ---------------- */
    H.push(sec('九 · 敌人', `${mobN} 种怪物 · ${eliteN} 条精英词缀`, [
      row('普通怪', `按族群分布在不同地图，各有元素抗性与弱点。打对元素伤害会明显更快`),
      row('精英', `带 ${eliteN} 条精英词缀（迅捷 / 护盾 / 召唤 / 分裂 / 荆棘…），名字会标出词缀，掉落更好`),
      row('首领', `独立血条、多段技能、阶段切换。对首领增伤 / 首领减伤是独立乘区`),
      row('行为', `近战包夹、远程风筝绕圈、自爆冲锋、治疗友军、召唤小怪、低血逃跑回血 —— 不同族群有不同套路`),
      row('图鉴', `异兽志（${K('B')}）记录遇到过的怪物，含属性、技能、掉落与出没地图`)
    ]));

    /* ---------------- 9. 经济 ---------------- */
    H.push(sec('十 · 经济与消耗', '', [
      row('铜钱', `通用货币。来源：击杀、卖装备、任务。用途：修理、洗点、升阶、商店`),
      row('玄晶', `高阶材料。来源：分解玄品以上装备、首领掉落。用途：升阶、品质锻造`),
      row('匠材', `打造与强化用。来源：分解与采集`),
      row('药水', `${K('Z')} 生命药 · ${K('X')} 灵力药。药水有冷却，不是无脑喝`),
      row('死亡', `不掉等级、不掉装备。普通及以上难度损失部分金币，新手难度不掉`)
    ]));

    /* ---------------- 10. 难度 ---------------- */
    H.push(sec('十一 · 难度', '开局选择，中途不可改', diffList.map(d =>
      row(`<span style="color:${d.color}">${d.name}</span>`, `${d.desc}${d.deathPenalty ? `（死亡损失 ${Math.round(d.deathPenalty * 100)}% 金币）` : '（死亡不掉金币）'}`)
    ).join('') + `<div class="hp-note">难度影响怪物生命 / 伤害 / 速度、掉落与经验倍率、精英出现率、是否带元素伤害。</div>`));

    /* 反解短名：'一 · 怎么玩' → '怎么玩'，作为左侧页签文字 */
    const SECTIONS = H.map((html, i) => {
      const m = html.match(/<h4>([^<]*)/);
      const full = m ? m[1].trim() : ('第 ' + (i + 1) + ' 节');
      const name = full.replace(/^[一二三四五六七八九十]+\s*·\s*/, '').trim();
      return { name, html };
    });

    if (this.hpTab == null || this.hpTab >= SECTIONS.length) this.hpTab = 0;
    nav.innerHTML = SECTIONS.map((s, i) =>
      `<button class="hp-tab ${i === this.hpTab ? 'on' : ''}" data-hp="${i}"><span class="hp-tn">${i + 1}</span>${s.name}</button>`
    ).join('');
    nav.querySelectorAll('.hp-tab').forEach(bt => bt.addEventListener('click', () => {
      const i = parseInt(bt.dataset.hp, 10);
      if (i === this.hpTab) return;
      this.hpTab = i;
      this.renderHelp();
      try { SFX.ui(); } catch (e) { }
    }));

    const FOOT = `<div class="hp-note" style="text-align:center;padding:2px 0 4px">
      本页条数与名称读自当前版本的数据表，游戏更新后会自动同步。<br>
      发现说明与实际不符，就是数据或文案漏了 —— 记下来反馈即可。
    </div>`;
    el.innerHTML = SECTIONS[this.hpTab].html + FOOT;
    el.scrollTop = 0;
  },

  renderSettings() {
    const body = document.getElementById('setBody');
    const hint = document.getElementById('setHint');
    if (!body || typeof Settings === 'undefined' || !Settings.d) return;
    const d = Settings.d;
    body.innerHTML = this.SET_ROWS.map(r => {
      /* fps 存的是布尔值，选项却是 '0'/'1'，直接 String() 会永远对不上高亮 */
      const cur = r.k === 'fps' ? (d.fps ? '1' : '0') : String(d[r.k]);
      return `<div class="setrow"><span class="setlab">${r.label}</span><div class="setseg">`
        + r.opts.map(([v, t]) =>
          `<button class="sbtn${cur === v ? ' on' : ''}" data-k="${r.k}" data-v="${v}">${t}</button>`).join('')
        + `</div></div>`;
    }).join('');
    if (hint) {
      hint.innerHTML = d.preset === 'custom'
        ? '当前为<b>自定义</b>，自动降画质已关闭。想让它按帧率自动调，把「画质档位」选回<b>自动</b>。'
        : '当前为<b>自动</b>：帧率低于 42 会自动降一档，稳定高于 57 再升回来。'
        + '<br>卡的时候优先降<b>渲染倍率</b>——0.65x 只损失一点锐度，像素量却少了 58%。';
    }
  },

  onSettingsClick(e) {
    const b = e.target.closest('[data-k]');
    if (!b || typeof Settings === 'undefined') return;
    const k = b.dataset.k;
    let v = b.dataset.v;
    if (k === 'fps') v = (v === '1');
    else if (k === 'scale' || k === 'mobCap') v = (v === 'auto' ? 'auto' : Number(v));
    Settings.set(k, v);
    /* 改完立刻重绘，让高亮跟着走（Settings.apply 里也会调，但那条路可能被
     * 「面板没开」的守卫挡掉，这里显式再来一次最稳） */
    this.renderSettings();
  },

  /* 帧数面板：info 为 null 表示隐藏 */
  setFps(fps, info) {
    const el = document.getElementById('fpsHud');
    if (!el) return;
    if (!info) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const n = Math.round(fps) || 0;
    const cls = n >= 55 ? 'ok' : (n >= 35 ? 'mid' : 'low');
    el.innerHTML = `<b class="${cls}">${n}</b> FPS`
      + `<i>${info.calls} draw · ${info.dpr.toFixed(2)}x · 影${info.shadow ? '开' : '关'} · 怪≤${info.cap}</i>`;
  },

  /* 设置里刚开关帧数显示时，立刻同步一次，不用等下一秒的采样 */
  syncFps() {
    const el = document.getElementById('fpsHud');
    if (!el || typeof Settings === 'undefined' || !Settings.d) return;
    if (!Settings.d.fps) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!g || !g.renderer) return;
    this.setFps(g.perf ? g.perf.fps : 0, {
      calls: g._calls || 0,
      dpr: g.renderer.getPixelRatio(),
      shadow: g.renderer.shadowMap.enabled,
      cap: g.mobCap,
      level: g.perf ? g.perf.level : 0
    });
  },

  moveTooltip(e) {
    const t = this.tooltipEl;
    const w = 270, h = t.offsetHeight || 200;
    let x = e.clientX + 18, y = e.clientY + 14;
    if (x + w > window.innerWidth - 10) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 10) y = Math.max(10, e.clientY - h - 10);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  },

  hideTooltip() {
    this.tooltipEl.style.display = 'none';
    this.hoverRef = null;
  },

  /* 触屏：点一下装备/物品先出详情，再在浮层里选择穿戴或出售 */
  showTouchItem(el) {
    const ref = el.dataset.ref;
    const item = this.itemFromRef(ref);
    if (!item) return;
    const isInv = ref.startsWith('inv:');
    this.tooltipEl.innerHTML = itemTooltip(item, {
      hint: '',
      compareTo: isInv ? this.equippedFor(item) : null
    }) +
      `<div class="tt-act">
         <button class="btn primary" data-act="${isInv ? 'equip' : 'unequip'}">${isInv ? '穿 戴' : '卸 下'}</button>
         ${isInv ? '<button class="btn" data-act="sell">出 售</button>' : ''}
       </div>`;
    this.tooltipEl.style.display = 'block';

    this.tooltipEl.querySelectorAll('.tt-act .btn').forEach(b => {
      b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const act = b.dataset.act;
        if (act === 'equip') Game.equipFromInv(parseInt(ref.split(':')[1]));
        else if (act === 'unequip') Game.unequip(ref.split(':')[1]);
        else if (act === 'sell') Game.sellItem(parseInt(ref.split(':')[1]));
        this.hideTooltip();
      });
    });

    const r = el.getBoundingClientRect();
    const tw = this.tooltipEl.offsetWidth, th = this.tooltipEl.offsetHeight;
    let x = CLAMP(r.left + r.width / 2 - tw / 2, 8, window.innerWidth - tw - 8);
    let y = r.bottom + 8;
    if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    this.tooltipEl.style.left = x + 'px';
    this.tooltipEl.style.top = y + 'px';
  },

  itemFromRef(ref) {
    if (!ref || !Game.state) return null;
    const [kind, val] = ref.split(':');
    if (kind === 'inv') return Game.state.inventory[parseInt(val)] || null;
    if (kind === 'eq') return Game.state.equipment[val] || null;
    return null;
  },

  removeItemByRef(ref) {
    if (!ref || !Game.state) return;
    const [kind, val] = ref.split(':');
    if (kind === 'inv') {
      const idx = parseInt(val);
      if (idx >= 0) Game.state.inventory.splice(idx, 1);
    } else if (kind === 'eq') {
      Game.state.equipment[val] = null;
    }
  },

  /**
   * 找出「这件装备装上后会替换掉的那一件」。
   *
   * 戒指有两个孔，装备时的落位规则是 ring1 → ring2 → 顶掉 ring1，
   * 所以对比对象应该取两只里评分较低的那只（那才是真正会被换掉的），
   * 而不是无脑取 ring1——否则玩家会看到「明明戒指2很烂，却拿戒指1跟我比」。
   */
  equippedFor(item) {
    if (!item || !Game.state) return null;
    const eq = Game.state.equipment;
    if (!eq) return null;
    if (item.slot === 'ring') {
      const a = eq.ring1, b = eq.ring2;
      if (!a && !b) return null;
      if (!a) return b;
      if (!b) return a;
      return itemScore(a) <= itemScore(b) ? a : b;
    }
    return eq[item.slot] || null;
  },

  /* ---------------- HUD ---------------- */
  renderHUD() {
    const s = Game.state, st = s.stats;
    document.getElementById('pGlyph').textContent = CLASSES[s.cls].icon;
    document.getElementById('pLv').textContent = s.level;
    document.getElementById('pName').textContent = s.name;
    document.getElementById('pClass').textContent = CLASSES[s.cls].name + ' · ' + CLASSES[s.cls].title;
    /* [DIFF] 难度徽标：颜色跟难度走，一眼能看出这档有多硬 */
    const dEl = document.getElementById('pDiff');
    if (dEl) {
      const d = getDiff(s.difficulty);
      dEl.textContent = d.name;
      dEl.style.color = d.color;
    }
    const hpP = CLAMP(s.hp / st.hpMax * 100, 0, 100);
    document.getElementById('hpFill').style.width = hpP + '%';
    document.getElementById('hpText').textContent = `${Math.ceil(s.hp)} / ${Math.round(st.hpMax)}`;
    // 资源条（怒气 / 灵力 / 道力）随职业换色，文字带上简称
    const cc = CLASSES[s.cls];
    if (this._resCls !== s.cls) {
      this._resCls = s.cls;
      document.getElementById('charplate').style.setProperty('--res', cc.resColor);
    }
    document.getElementById('mpFill').style.width = CLAMP(s.mp / st.mpMax * 100, 0, 100) + '%';
    document.getElementById('mpText').textContent = `${cc.res[0]} ${Math.ceil(s.mp)} / ${Math.round(st.mpMax)}`;
    document.getElementById('xpFill').style.width = CLAMP(s.xp / s.xpNext * 100, 0, 100) + '%';
    document.getElementById('goldTxt').textContent = '金 ' + s.gold;
    document.getElementById('potionTxt').textContent = `红药 ${s.potions.hp} · 蓝药 ${s.potions.mp} · 传送石 ${s.teleportStones || 0}`;
    document.getElementById('zoneName').textContent = MAPS[s.mapId].name;
    document.getElementById('vignette').style.opacity = hpP < 35 ? (1 - hpP / 35) * 0.9 : 0;
    this.updateQuestTrack();
    if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.syncHud();
  },

  buildActionBar() {
    const s = Game.state;
    const bar = document.getElementById('actionbar');
    /* [S4][M1] 技能条 8 格 × 2 套手动配置：空位是虚线占位，点它打开术法面板（K） */
    const slots = Game.skillBar();
    const setIdx = Game.barSet();
    let h = slots.map((id, i) => {
      if (!id) {
        return `<div class="skill empty" data-slot="${i}" title="技能条 ${i + 1}：空位——打开术法面板（K）把技能放上来">
          <span class="k">${i + 1}</span><div class="g">＋</div></div>`;
      }
      const sk = SKILLS[id];
      const castLabel = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
      const rangeLabel = sk.castRange ? ` · ${sk.castRange} 码` : '';
      /* [M1] 变体角标：三个改造共用一张图标，靠右上角 Ⅰ/Ⅱ/Ⅲ 区分，
       * 不然在技能条上看不出当前装的是哪一版。v=0 时角标隐藏。 */
      const vv = Game.skillVariant(id);
      const vName = (sk.variants && sk.variants[vv]) ? sk.variants[vv].name : '';
      const vBadge = `<span class="vb" style="${vv > 0 ? '' : 'display:none'}">${['Ⅰ', 'Ⅱ', 'Ⅲ'][vv] || ''}</span>`;
      return `<div class="skill" data-skill="${id}" title="${sk.name}${vName ? ' · ' + vName : ''} · ${castLabel}${rangeLabel}">
        <span class="k">${i + 1}</span>${vBadge}<div class="g">${skillIconSvg(id, 26)}</div>
        <span class="cost">${Game.skillCost(sk)}</span><div class="cd"></div></div>`;
    }).join('') +
      `<div class="barset" data-barset="1" title="切换快捷栏（${SKILL_BAR_SET_LABEL}，或 ${SKILL_BAR_SET_KEY_ALT}）· 共 ${SKILL_BAR_SETS} 套 · 当前第 ${setIdx + 1} 套">${barSetIcon(setIdx, 16)}<span class="bs-n">${setIdx + 1}/${SKILL_BAR_SETS}</span></div>` +
      `<div class="potion" data-potion="hp"><span class="k">Z</span><div class="g">丹</div><div class="n">红药</div></div>
       <div class="potion blue" data-potion="mp"><span class="k">X</span><div class="g">露</div><div class="n">蓝药</div></div>
       <div class="potion" data-tp="1" style="background:rgba(120,160,255,.22);border-color:rgba(120,160,255,.45)"><span class="k">9</span><div class="g">阵</div><div class="n">传送</div></div>`;

    bar.innerHTML = h;
    bar.querySelectorAll('.skill[data-skill]').forEach(el => {
      el.addEventListener('click', () => Game.castSkill(el.dataset.skill));
    });
    /* 空位：点开术法面板去配置 */
    bar.querySelectorAll('.skill.empty').forEach(el => {
      el.addEventListener('click', () => { SFX.ui(); this.openSkill(); });
    });
    bar.querySelectorAll('.barset').forEach(el => {
      el.addEventListener('click', () => { SFX.ui(); Game.switchBarSet(); });
    });
    bar.querySelectorAll('.potion').forEach(el => {
      if (el.dataset.potion) el.addEventListener('click', () => Game.usePotion(el.dataset.potion));
      if (el.dataset.tp) el.addEventListener('click', () => Game.useTeleportStone());
    });
    if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.buildSkills();
  },

  updateSkillbar() {
    if (!Game.state) return;
    const s = Game.state;
    document.querySelectorAll('#actionbar .skill, #mSkills .mskill').forEach(el => {
      const id = el.dataset.skill;
      if (!id) return;                     // 空占位格：没有技能可更新
      const sk = SKILLS[id];
      if (!sk) return;
      /* [M1] 变体角标随切换实时更新（技能条不整体重建） */
      const vb = el.querySelector('.vb');
      if (vb) {
        const vv = Game.skillVariant(id);
        vb.textContent = ['Ⅰ', 'Ⅱ', 'Ⅲ'][vv] || '';
        vb.style.display = vv > 0 ? '' : 'none';
      }
      const locked = !Game.skillUnlocked(id);
      el.classList.toggle('locked', locked);
      const cd = Game.cooldowns[id] || 0;
      const cdEl = el.querySelector('.cd');
      const maxCd = Game.skillCd(sk);
      if (cd > 0.05) {
        cdEl.style.display = 'flex';
        cdEl.textContent = cd.toFixed(1);
        const deg = (cd / maxCd) * 360;
        cdEl.style.background = `conic-gradient(rgba(2,3,6,.86) ${deg}deg, rgba(2,3,6,.15) ${deg}deg)`;
      } else {
        cdEl.style.display = 'none';
      }
      const noMp = s.mp < Game.skillCost(sk);
      el.classList.toggle('ready', !locked && cd <= 0.05 && !noMp);
      el.style.filter = !locked && noMp ? 'saturate(.4) brightness(.75)' : '';
    });
    /* [M1] 快捷栏标识跟着切 */
    const bs = document.querySelector('#actionbar .barset');
    if (bs) {
      const i = Game.barSet();
      bs.innerHTML = barSetIcon(i, 16) + `<span class="bs-n">${i + 1}/${SKILL_BAR_SETS}</span>`;
      bs.title = `切换快捷栏（${SKILL_BAR_SET_LABEL}，或 ${SKILL_BAR_SET_KEY_ALT}）· 共 ${SKILL_BAR_SETS} 套 · 当前第 ${i + 1} 套`;
    }
  },

  /* 技能栏上方：增益 / 减益 / 护盾，按剩余时间倒序，减益置后 */
  renderBuffs() {
    const el = document.getElementById('buffbar');
    if (!el || !Game.state) return;
    const list = [];
    for (const b of Game.buffs) list.push({ name: b.name, dur: b.dur, color: b.color, type: b.type || 'buff', icon: b.icon, desc: b.desc });
    if (Game.statusBuffs) list.push(...Game.statusBuffs());
    list.sort((a, b) => (a.type === 'debuff' ? 1 : 0) - (b.type === 'debuff' ? 1 : 0) || b.dur - a.dur);
    const sig = list.map(b => `${b.name}|${b.type}|${Math.ceil((Number(b.dur) || 0) * 10)}|${b.color}`).join(';');
    if (sig === this._buffSig) return;
    this._buffSig = sig;
    if (!list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'flex';
    el.innerHTML = list.map(b => {
      const c = typeof b.color === 'number' ? '#' + b.color.toString(16).padStart(6, '0') : (b.color || '#d8b25a');
      const icon = b.icon || (b.name ? b.name.slice(0, 1) : '·');
      const desc = b.desc ? ` title="${b.desc}"` : '';
      return `<div class="buff ${b.type || 'buff'}" style="--c:${c}"${desc}><span class="bi">${icon}</span><span class="bn">${b.name}</span><span class="bt">${Math.max(0, Number(b.dur) || 0).toFixed(1)}s</span></div>`;
    }).join('');
  },

  updateBoss(boss) {
    const bar = document.getElementById('bossbar');
    if (!boss) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    document.getElementById('bossName').textContent = boss.cfg.name;
    document.getElementById('bossTitle').textContent = boss.cfg.title || '';
    document.getElementById('bossFill').style.width = CLAMP(boss.hp / boss.maxHp * 100, 0, 100) + '%';
    document.getElementById('bossText').textContent = `${Math.ceil(boss.hp)} / ${Math.round(boss.maxHp)}`;
    /* 阶段灯必须按「当前血量占比」算，不能拿 cfg.hp（基础血量）比。
     * 难度会把 maxHp 乘上 0.65~2.4，用基础值算的话血条显示三阶段已亮、
     * 实际 AI 还在一阶段（或反过来），玩家会觉得血条和 BOSS 行为对不上。
     * 阈值与 updateBossAI 保持一致：普通 60%/30%，困难以上提前到 75%/45%。 */
    const hr = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    const rush = (Game.diff && Game.diff().bossRush);
    const t1 = rush ? 0.75 : 0.6, t2 = rush ? 0.45 : 0.3;
    const ph = hr <= t2 ? 2 : (hr <= t1 ? 1 : 0);
    document.getElementById('bossPhase').innerHTML = '<i class="on"></i>' +
      `<i class="${ph >= 1 ? 'on' : ''}"></i><i class="${ph >= 2 ? 'on' : ''}"></i>`;
  },

  /* ---------------- 主菜单（v1.6.0） ----------------
   * 原来八个入口各自开一个浮层，右下角排一列，屏幕被切得零碎，
   * 而且「行囊开着、天赋开不了」这种互斥要用户自己体会。
   * 现在收成一个外壳：左侧一排页签，右侧只挂当前这一页 —— 这是 ARPG 的经典分层，
   * 也真的省地方（HUD 上只留「行囊」与「菜单」两个按钮）。
   *
   * 实现上是**搬 DOM**：把原本独立的面板元素 appendChild 进 #menuBody 并加 .embed，
   * 关菜单时再送回 #panelHome。这样各面板的 CSS、事件委托、探针选择器全部原样可用，
   * 不必为「嵌入模式」重写一遍渲染。 */
  MENU_TABS: [
    { id: 'bag', name: '行 囊', key: 'I', panel: 'invPanel', render: 'renderInventory' },
    { id: 'stat', name: '道 途', key: 'C', panel: 'statPanel', render: 'renderStats' },
    { id: 'talent', name: '天 赋', key: 'T', panel: 'talentPanel', render: 'renderTalentPanel' },
    { id: 'skill', name: '术 法', key: 'K', panel: 'skillPanel', render: 'renderSkillPanel' },
    { id: 'quest', name: '山 海 志', key: 'L', panel: 'questPanel', render: 'renderQuests' },
    { id: 'codex', name: '异 兽 志', key: 'B', panel: 'codexPanel', render: 'renderCodex' },
    { id: 'forge', name: '炼 器 台', key: 'R', panel: 'forgePanel', render: 'renderForge' },
    { id: 'save', name: '存 档', key: 'P', panel: 'savePanel', render: null },
    { id: 'help', name: '说 明', key: 'H', panel: 'helpPanel', render: 'renderHelp' },
    { id: 'set', name: '设 置', key: 'O', panel: 'setPanel', render: 'renderSettings' }
  ],
  menuTab: 'bag',

  openMenu(tab) {
    if (!Game.state) return;
    const p = document.getElementById('menuPanel');
    if (!p) return;
    const id = tab || this.menuTab || 'bag';
    this.menuTab = id;
    /* 先合上其它浮层（对话框 / 商店 / 图鉴），菜单自己除外 */
    this.closeAll(p);
    p.classList.add('open');
    this.menuMount(id);
    try { SFX.ui(); } catch (e) { }
  },

  toggleMenu() {
    const p = document.getElementById('menuPanel');
    if (p && p.classList.contains('open')) this.closeMenu();
    else this.openMenu(this.menuTab || 'bag');
  },

  closeMenu() {
    const p = document.getElementById('menuPanel');
    if (p) p.classList.remove('open');
    this.menuUnmount();
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  },

  /* 页签 → 面板：切换时先归位上一个，再挂新的 */
  menuMount(id) {
    const def = this.MENU_TABS.find(t => t.id === id) || this.MENU_TABS[0];
    const body = document.getElementById('menuBody');
    const home = document.getElementById('panelHome');
    const sub = document.getElementById(def.panel);
    if (!body || !home || !sub) return;
    this.menuUnmount();
    body.appendChild(sub);
    sub.classList.add('embed', 'open');
    document.querySelectorAll('#menuTabs .mtab').forEach(b => b.classList.toggle('on', b.dataset.mtab === def.id));
    /* 各页自己的首帧。存档面板的渲染函数叫 SaveUI.render，单独接一下。 */
    if (def.render && typeof this[def.render] === 'function') {
      try { this[def.render](); } catch (e) { console.warn('menu render', def.id, e); }
    }
    if (def.id === 'save' && typeof SaveUI !== 'undefined') {
      try {
        SaveUI.pendingDelete = 0;
        SaveUI.hint('存档存在于本机浏览器（localStorage）。换设备或清理浏览器数据前，请先导出备份。');
        SaveUI.render();
      } catch (e) { }
    }
  },

  /* 把菜单里的子面板全部送回原籍（不改它们的开合状态，由调用方决定） */
  menuUnmount() {
    const body = document.getElementById('menuBody');
    const home = document.getElementById('panelHome');
    if (!body || !home) return;
    body.querySelectorAll('.panel').forEach(el => {
      el.classList.remove('embed', 'open');
      home.appendChild(el);
    });
  },

  /* ============================================================
   * 异兽志（S5 怪物图鉴）
   * 按区域分页；击杀解锁；集齐一区给永久属性（走 Game.codexBonus）。
   * 未收录的条目只露「？」——留白比剧透更有收集欲。
   * ============================================================ */
  codexRegion: 'forest',

  renderCodex() {
    if (!Game.state) return;
    const grid = document.getElementById('codexGrid');
    const cap = document.getElementById('codexCap');
    const regs = document.getElementById('codexRegions');
    const foot = document.getElementById('codexFoot');
    if (!grid) return;
    const c = Game.codex();
    const all = Object.keys(MONSTERS);
    const got = all.filter(k => c.mon[k]).length;
    if (cap) cap.textContent = '已录 ' + got + ' / ' + all.length;

    /* 区域页签：只绑一次事件，重绘只换内容 */
    if (regs) {
      if (!regs._bound) {
        regs._bound = true;
        regs.addEventListener('click', e => {
          const b = e.target.closest('[data-creg]');
          if (!b || b.dataset.creg === this.codexRegion) return;
          this.codexRegion = b.dataset.creg;
          this.renderCodex();
          try { SFX.ui(); } catch (err) { }
        });
      }
      regs.innerHTML = CODEX_REGIONS.map(r => {
        const kinds = Game.codexRegionKinds(r.id);
        const n = kinds.filter(k => c.mon[k]).length;
        return `<button class="creg ${this.codexRegion === r.id ? 'on' : ''}" data-creg="${r.id}">`
          + `${r.name}<i>${n}/${kinds.length}</i></button>`;
      }).join('');
    }

    const region = CODEX_REGIONS.find(r => r.id === this.codexRegion) || CODEX_REGIONS[0];
    const kinds = Game.codexRegionKinds(region.id);
    const RES_NAME = { phys: '物理', fire: '火', ice: '冰', lightning: '雷', poison: '毒' };
    grid.innerHTML = kinds.map(k => {
      const m = MONSTERS[k];
      const e = c.mon[k];
      const fam = MON_FAMILIES[m.family] || MON_FAMILIES.humanoid;
      if (!e) {
        return `<div class="cx lock" style="--c:${fam.color}">
          <div class="cx-glyph">？</div>
          <div class="cx-main">
            <div class="cx-n">未录之兽<span class="lv">Lv.${region.level}+</span></div>
            <div class="cx-l">击败后收录。</div>
          </div></div>`;
      }
      const rs = Object.keys(fam.resist).filter(kk => fam.resist[kk]).map(kk => {
        const v = fam.resist[kk];
        return `<i class="${v > 0 ? 'up' : 'dn'}">${RES_NAME[kk]}${v > 0 ? '抗' : '弱'} ${Math.abs(v)}%</i>`;
      }).join('');
      return `<div class="cx" style="--c:${fam.color}">
        <div class="cx-glyph">${m.name.slice(0, 1)}</div>
        <div class="cx-main">
          <div class="cx-n">${m.name}<span class="fam">${fam.name}</span><span class="lv">击杀 ${e.kills}</span></div>
          <div class="cx-r">${rs}</div>
          <div class="cx-l">${m.lore || ''}</div>
          <div class="cx-d">掉落 ${Game.codexDrops(k, region.level)}</div>
        </div></div>`;
    }).join('');

    if (foot) {
      const n = kinds.filter(k => c.mon[k]).length;
      const done = !!c.regions[region.id];
      foot.innerHTML = `${region.name} · ${n}/${kinds.length} 收录　`
        + (done
          ? `<span style="color:#7fd44a">全录达成：${region.bonusDesc}</span>`
          : `<span style="color:#8a8474">集齐全录：${region.bonusDesc}</span>`);
    }
  },

  /* ---------------- 背包 ---------------- */
  invJunkOpen: false,      // 一键分解确认条是否展开
  invJunkMagic: false,     // 一键分解是否连带法器
  invTab: 'equip',         // 行囊当前栏：equip / mat / pill / quest
  invUpOpen: false,        // 行囊扩容条是否展开（v1.4.0）
  /* 旧入口全部重定向到菜单页签：快捷键、老按钮、探针都还能这么调 */
  toggleInv() { this.openMenu('bag'); },
  toggleStat() { this.openMenu('stat'); },
  toggleQuest() { this.openMenu('quest'); },
  closeAll(except) {
    /* 关面板时把商店倒计时停掉，否则每秒还在跑一个 setInterval */
    if (this.shopTimer) { clearInterval(this.shopTimer); this.shopTimer = null; }
    document.querySelectorAll('.panel').forEach(p => { if (p !== except) p.classList.remove('open'); });
    /* 菜单外壳若已被关掉，子面板必须归位，否则下次打开还嵌在上一次的容器里 */
    const mp = document.getElementById('menuPanel');
    if (mp && except !== mp && !mp.classList.contains('open')) this.menuUnmount();
    document.getElementById('dialog').style.display = 'none';
    this.tooltipEl.style.display = 'none';
  },

  renderInventory() {
    const s = Game.state;
    if (!s) return;
    this.renderDoll();
    const tab = this.invTab || 'equip';
    /* 排序 / 分解 / 图鉴 只对「装备」栏有意义，其余栏位收起 */
    const sortbar = document.getElementById('invSort');
    if (sortbar) sortbar.style.display = tab === 'equip' ? '' : 'none';
    const upBtn = document.getElementById('invUpBtn');
    if (upBtn) upBtn.style.display = tab === 'equip' ? '' : 'none';
    document.querySelectorAll('#invTabs .itab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    /* 提示行跟着栏位换口径：材料栏还写「左键装备」会让人误解 */
    const tip = document.getElementById('invTip');
    if (tip) {
      const TIPS = {
        equip: '左键装备 · Shift+左键出售 · 格子大小随部位',
        mat: '匠材锻造 · 玄晶洗练 · 符文镶嵌 · ' +
          (typeof Mobile !== 'undefined' && Mobile.on ? '点按看来源' : '悬停看来源'),
        pill: '点一格即服用 · 战斗中亦可',
        quest: '委托完成即生成凭证 · 不占行囊格位'
      };
      tip.textContent = TIPS[tab] || TIPS.equip;
    }
    const g = document.getElementById('invGrid');
    const mp = document.getElementById('invMats');
    const jb = document.getElementById('invJunkBar');
    const line = document.getElementById('setLine');
    if (g) g.style.display = tab === 'equip' ? '' : 'none';
    if (mp) mp.style.display = tab === 'equip' ? 'none' : '';
    if (line) line.style.display = tab === 'equip' ? '' : 'none';
    if (jb && tab !== 'equip') { jb.style.display = 'none'; jb.innerHTML = ''; }
    const ub = document.getElementById('invUpBar');
    if (ub && tab !== 'equip') { ub.style.display = 'none'; ub.innerHTML = ''; }
    /* 角色属性是左列常驻内容（v1.5.0）：切任何栏位都照旧显示，不跟着栏位收起 */
    this.renderDollStats();
    if (tab === 'equip') this.renderEquipGrid();
    else this.renderMatTab(tab);
    this.renderTabBadges();
  },

  /* 纸娃娃：按身体方向排（v1.3.0，参考暗黑 3）
   * 头在中上、肩在左上 / 右上、胸甲占中两行、手腰一排、战靴在下，
   * 最底一条长格放兵器。具体落位由 CSS 的 grid-template-areas 决定。
   * [M1] 14 格：披风在左上、法器在右上，命格在右下与护手对称。 */
  renderDoll() {
    const s = Game.state;
    const eq = s.equipment;
    const order = ['helm', 'cloak', 'chest', 'relic', 'shoulders', 'amulet', 'ring1', 'belt', 'ring2', 'gloves', 'boots', 'fate', 'weapon', 'offhand'];
    const grid = document.getElementById('dollGrid');
    if (!grid) return;
    grid.innerHTML = order.map(slot => {
      const it = eq[slot];
      const r = it ? RARITY[it.rarity] : null;
      const sb = it && it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
      /* 主手是双手兵器时，副手格画成「锁定」态，点上去也能看到原因 */
      const locked = slot === 'offhand' && Game.twoHanded();
      let inner;
      if (it) {
        inner = `<span class="ico">${itemIcon(it)}</span>`;
        /* 兵器长格：名字 + 握持 + DPS，横向一条读完 */
        if (slot === 'weapon' || slot === 'offhand') {
          const dps = it.baseDmg ? ((it.baseDmg[0] + it.baseDmg[1]) / 2 / (it.speed || 1)).toFixed(1) : '—';
          let sub;
          if (slot === 'weapon') sub = `${WEAPON_HAND_NAME[it.hand || 'one']} · DPS ${dps}`;
          else if (it.slot === 'weapon') sub = `副手双持 · DPS ${dps}`;
          else sub = `副手 · ${(SLOTS[it.slot] || {}).name || ''}`;
          inner += `<span class="wmeta"><b>${it.name}</b><i>${sub}</i></span>`;
        }
        /* 法器格：汉字字形 + 名号 + 附带术法（有则显示） */
        if (slot === 'relic') {
          const d = (it.relicId && RELICS[it.relicId]) || null;
          const g = d && d.grant && SKILLS[d.grant] ? `附带 · ${SKILLS[d.grant].name}` : '法器';
          inner += `<span class="rmeta"><b>${it.name}</b><i>${g}</i></span>`;
        }
      } else {
        inner = `<span class="ico empty">${locked ? '锁' : ''}</span>`;
      }
      return `<div class="eslot ${it ? 'filled' : 'empty'}${locked ? ' locked' : ''}" data-slot="${slot}" data-size="${slotSize(slot)}" ${it ? `data-ref="eq:${slot}"` : ''}${locked ? ' title="主手为双手兵器，副手位已被占用"' : ''} style="${it ? `border-color:${r.color}55;box-shadow:inset 0 0 12px ${r.color}22` : ''}">
        <span class="lbl">${SLOT_NAME[slot]}</span>
        ${sb}
        ${inner}
      </div>`;
    }).join('');
  },

  /* 左列下半：角色属性（v1.5.0 常驻）。与属性面板同源，分组照搬，
   * 两列排布；超出左列可用高度时由 CSS 的 overflow-y 接管滚动 */
  renderDollStats() {
    const el = document.getElementById('invStats');
    if (!el) return;
    el.innerHTML = this.statGroups().map(([title, list]) =>
      `<div class="st-grp">${title}</div>` +
      list.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
    ).join('');
  },

  /* 装备栏右侧：格子 + 一键分解条 + 套装行（属性在左列，不在这里） */
  renderEquipGrid() {
    const s = Game.state;
    const inv = s.inventory;
    const cap = Game.bagCap();
    document.getElementById('invCap').textContent = `${inv.length} / ${cap}`;
    const up = document.getElementById('invUpBtn');
    if (up) {
      const full = !bagNextUpgrade(cap);
      up.classList.toggle('full', full);
      up.textContent = full ? '已 满' : '扩 容';
      up.title = full ? `行囊已扩至极限 ${cap} 格` : `扩容行囊（当前 ${cap} 格）`;
    }
    const ig = document.getElementById('invGrid');
    /* 格子数 = 容量：行囊一眼就能读出「还能装多少」，也把右列铺满。
     * 之前只铺 16 格，右列下半截全空，看着像界面没做完（v1.5.0 改）。 */
    const need = cap;
    let html = '';
    for (let i = 0; i < need; i++) {
      const it = inv[i];
      if (it) {
        const tag = (SLOTS[it.slot] || {}).name || it.kind || '';
        const sb = it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
        /* 格子大小随部位：战甲/武器占满整格，饰品格只有六成 */
        const sz = it.slot ? slotSize(it.slot) : '';
        const hand = it.slot === 'weapon' ? `<span class="hand-tag h-${it.hand || 'one'}">${WEAPON_HAND_NAME[it.hand || 'one']}</span>` : '';
        html += `<div class="islot ${sz ? 'sz-' + sz : ''} r-${it.rarity}" ${it.slot ? `data-size="${sz}"` : ''} data-ref="inv:${i}">
          <span class="ico">${itemIcon(it)}</span>${sb}${hand}<span class="slot-tag">${tag.slice(0, 1)}</span></div>`;
      } else {
        html += `<div class="islot"></div>`;
      }
    }
    ig.innerHTML = html;

    /* 一键分解确认条：默认只分凡品，可勾选连带法器；预估产出实时更新 */
    const jb = document.getElementById('invJunkBar');
    if (jb) {
      if (this.invJunkOpen) {
        const pv = Game.previewDecomposeJunk(this.invJunkMagic);
        jb.style.display = '';
        jb.innerHTML = `<span class="jl">一键分解</span>
          <span class="jt">将分解 <b style="color:#e8d8b0">${pv.count}</b> 件${this.invJunkMagic ? '凡品/法器' : '凡品'}装备，预计获得 <b style="color:#c9b8ff">${pv.text}</b></span>
          <label class="jchk"><input type="checkbox" data-junkmagic ${this.invJunkMagic ? 'checked' : ''}>连带法器（${pv.magicCount} 件）</label>
          <button class="btn primary" data-junkok ${pv.count ? '' : 'disabled'}>确认分解</button>
          <button class="btn" data-junkcancel>取消</button>`;
      } else { jb.style.display = 'none'; jb.innerHTML = ''; }
    }

    this.renderBagUpgradeBar();

    /* 右列底部：行囊概览 + 套装卡（v1.5.0）
     * 格子数按容量铺，40 格时代只有 5 行，填不满右列；剩下的高度由这张卡吃掉，
     * 卡片自己带边框，看起来是「一块信息区」而不是面板没做完留的白。 */
    const st = s.stats;
    const sets = Object.keys(st.setCount).filter(k => st.setCount[k] >= 2);
    const line = document.getElementById('setLine');
    if (line) {
      const used = inv.length, pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
      /* 品质分布：只列手里真有的品质，按稀有度从低到高排 */
      const rk = Object.keys(RARITY);
      const cnt = {};
      inv.forEach(it => { cnt[it.rarity] = (cnt[it.rarity] || 0) + 1; });
      const q = rk.filter(k => cnt[k]).map(k =>
        `<span style="color:${RARITY[k].color}">${RARITY[k].name} ${cnt[k]}</span>`).join('');
      const setBody = sets.length
        ? sets.map(id => {
            const set = SETS[id], n = st.setCount[id];
            const active = set.bonuses.filter(b => n >= b.need).map(b => b.text).join('；');
            return `<div class="ft-set"><span class="ft-nm" style="color:${set.color}">【${set.name}】${n}/${set.pieces.length}</span>
              <div class="ft-on">${active || '再集一件可激活下一档'}</div></div>`;
          }).join('')
        : `<div class="ft-empty">集齐同套 2 件起生效，绿色边框的装备即为套装部件。</div>`;
      line.innerHTML = `
        <div class="ft-h"><b>行 囊 概 览</b><i>${used} / ${cap} 格</i></div>
        <div class="ft-bar"><i style="width:${pct}%"></i></div>
        <div class="ft-q">${q || '<span style="color:#5e594e">空无一物</span>'}</div>
        <div class="ft-sec"><b style="font-family:'STKaiti','KaiTi',serif;font-weight:500;font-size:11.5px;letter-spacing:3px;color:#c9a86a">套 装 之 力</b>
          <i style="font-style:normal;font-size:9.5px;color:#5e594e">${sets.length ? sets.length + ' 套生效中' : '尚未成势'}</i></div>
        ${setBody}
        <div class="ft-tips"><span>左键 穿戴 / 卸下</span><span>Shift+左键 出售</span>
          <span>一键分解 凡品→玄晶</span><span>扩容永久生效</span></div>`;
    }
  },

  /* 材料 / 丹药 / 任务物品：三栏统一成「图标 + 数量角标」（v1.6.0）
   * 以前一行一条（图标 + 名称 + 说明 + 数量），9 种匠材就把一屏吃满了；
   * 换成格子之后，形状替代文字，一屏能看全，文字退到悬停提示。
   * 提示内容存在 this._matTips 里，格子只带下标 —— 省掉一大堆属性转义。 */
  renderMatTab(tab) {
    const s = Game.state;
    const el = document.getElementById('invMats');
    if (!el) return;
    const RUNE_COLOR = { 1: '#a0a0a0', 2: '#67a9ff', 3: '#c084ff', 4: '#ffd166' };
    let cells = [];
    if (tab === 'mat') {
      /* 玄晶四阶 */
      CRYSTAL_TIERS.forEach((t, i) => cells.push({
        icon: matIcon('crystal' + (i + 1), { size: 30, color: t.color, glow: i >= 2 }),
        color: t.color, name: t.name + '（' + (i + 1) + ' 阶）',
        sub: '炼器 / 洗练 / 扩容的通货', desc: '分解装备所得，凡 → 灵 → 玄 → 神 逐阶精纯。',
        qty: Game.crystalTierCount(i + 1)
      }));
      /* 匠材九种：没有的也占一格（灰显），玩家才知道该去刷什么 */
      for (const id of CRAFT_MAT_ORDER) {
        const d = CRAFT_MATS[id];
        cells.push({
          icon: matIcon(d.icon, { size: 30, color: d.color, glow: d.tier >= 3 }),
          color: d.color, name: d.name,
          sub: CRAFT_TIER_NAME[d.tier] + ' · 来自' + d.from,
          desc: d.desc, qty: Game.craftMatCount(id)
        });
      }
      /* 符文：只列持有的，24 种全列会盖掉匠材 */
      for (const id of RUNE_ICON_ORDER) {
        const n = Game.runeCount(id);
        if (!n) continue;
        const rd = RUNES[id], tier = RUNE_TIERS[rd.tier];
        const col = RUNE_COLOR[rd.tier] || '#c9a86a';
        cells.push({
          icon: iconSvg('rune_' + id, { size: 28, style: 'color:' + col }),
          color: col, name: rd.name + '符文',
          sub: tier.name + ' · ' + statLine(rd.stats), desc: '镶进装备孔位，可组成符文之语。',
          qty: n
        });
      }
      const kinds = cells.filter(c => c.qty > 0).length;
      document.getElementById('invCap').textContent = `材料 ${kinds} / ${cells.length} 种`;
    } else if (tab === 'pill') {
      const p = s.potions || { hp: 0, mp: 0 };
      cells = [
        {
          icon: matIcon('potion_hp', { size: 30, color: '#e05a4a', glow: true }), color: '#e05a4a',
          name: '回春丹', sub: '立即回复生命 · 快捷键 Z', desc: '点格子即服用，战斗中亦可。',
          qty: p.hp || 0, use: 'hp'
        },
        {
          icon: matIcon('potion_mp', { size: 30, color: '#67a9ff', glow: true }), color: '#67a9ff',
          name: '凝露', sub: '立即回复灵力 · 快捷键 X', desc: '点格子即服用，战斗中亦可。',
          qty: p.mp || 0, use: 'mp'
        },
        {
          icon: matIcon('potion_tp', { size: 30, color: '#9a9aff', glow: true }), color: '#9a9aff',
          name: '传送阵石', sub: '就地开启归途阵 · 快捷键 9', desc: '脱战状态下使用，立刻返回桃源村。',
          qty: s.teleportStones || 0, use: 'tp'
        }
      ];
      document.getElementById('invCap').textContent = `丹药 ${cells.reduce((a, c) => a + c.qty, 0)} 枚`;
    } else {
      /* 任务物品：已完成的委托留下一枚凭证，纯陈列，不占行囊、不可交易 */
      const done = (s.quests && s.quests.done) || [];
      const cnt = {};
      done.forEach(id => { cnt[id] = (cnt[id] || 0) + 1; });
      cells = Object.keys(cnt).map(id => {
        const q = QUESTS[id];
        if (!q) return null;
        return {
          icon: matIcon('quest', { size: 30, color: '#d8b25a', glow: true }), color: '#d8b25a',
          name: q.name + '·凭证', sub: '委托完结的凭证', desc: q.brief || '',
          qty: cnt[id], idx: id.replace(/^q/, '')
        };
      }).filter(Boolean);
      document.getElementById('invCap').textContent = `任务物品 ${cells.length} 种`;
      if (!cells.length) {
        el.innerHTML = '<div class="mat-empty">尚无任务物品<br><span>完成一份委托后，凭证会陈列在这里</span></div>';
        return;
      }
    }

    this._matTips = cells;
    el.innerHTML = '<div class="mgrid">' + cells.map((c, i) => `
      <div class="mgcell${c.qty ? '' : ' off'}" data-mti="${i}" ${c.use ? `data-use="${c.use}"` : ''}
        style="--mc:${c.color}">
        <span class="mg-ico">${c.icon}</span>
        ${c.idx ? `<span class="mg-idx">${c.idx}</span>` : ''}
        <span class="mg-qty">${c.qty > 999 ? '999+' : c.qty}</span>
      </div>`).join('') + '</div>';

    el.querySelectorAll('[data-use]').forEach(row => {
      row.addEventListener('click', () => {
        const k = row.dataset.use;
        if (k === 'tp') Game.useTeleportStone(); else Game.usePotion(k);
        this.renderInventory();
      });
    });
    /* 触屏没有悬停：点一下直接在格子上方弹提示 */
    if (IS_TOUCH) {
      el.querySelectorAll('[data-mti]').forEach(row => {
        row.addEventListener('click', e => {
          if (row.dataset.use) return;
          const c = this._matTips[+row.dataset.mti];
          if (c) this.showMatTip(c, e);
        });
      });
    }
  },

  /* 材料 / 丹药 / 凭证的悬停提示。与装备提示共用 #tooltip 与定位逻辑。 */
  showMatTip(c, e) {
    if (!c) return;
    this.tooltipEl.innerHTML = `<div class="tt" style="--rc:${c.color}">
      <div class="tt-head"><div class="tt-ico" style="border-color:${c.color}44;background:radial-gradient(circle at 50% 35%,${c.color}22,rgba(0,0,0,.5))">${c.icon}</div>
        <div class="tt-htx">
          <div class="tt-name" style="color:${c.color}">${c.name}</div>
          <div class="tt-sub">${c.sub || ''}</div>
        </div></div>
      <div class="tt-main" style="color:#b8b0a0">持有 <b style="color:#f0e0b8">${c.qty}</b></div>
      ${c.desc ? `<div class="tt-lore" style="font-style:normal;color:#8a8474;font-size:10.5px;line-height:1.6">${c.desc}</div>` : ''}
    </div>`;
    this.tooltipEl.style.display = 'block';
    if (e) this.moveTooltip(e);
  },

  renderTabBadges() {
    const s = Game.state;
    if (!s) return;
    const matN = CRYSTAL_TIERS.filter((t, i) => Game.crystalTierCount(i + 1) > 0).length +
      Object.keys(RUNES).filter(id => Game.runeCount(id) > 0).length +
      CRAFT_MAT_ORDER.filter(id => Game.craftMatCount(id) > 0).length;
    const pillN = (s.potions ? (s.potions.hp || 0) + (s.potions.mp || 0) : 0) + (s.teleportStones || 0);
    const qN = ((s.quests && s.quests.done) || []).length;
    const set = (id, n) => {
      const b = document.querySelector(`#invTabs .itab[data-tab="${id}"] i`);
      if (b) b.textContent = n;
    };
    set('equip', s.inventory.length);
    set('mat', matN);
    set('pill', pillN);
    set('quest', qN);
  },

  /* ---------------- 套装图鉴（v1.1.4） ----------------
   * 汇总 12 套套装：每套显示部件清单（含已获得件数与 ilvl/品质）、
   * 各档加成与当前是否激活。已获得 = 已装备 + 行囊 + 账号仓库。 */
  openSetCodex() {
    if (!Game.state) return;
    const p = document.getElementById('setCodexPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this.renderSetCodex();
  },

  renderSetCodex() {
    const p = document.getElementById('setCodexPanel');
    if (!p || !Game.state) return;
    const s = Game.state;
    /* 收集全部已拥有的套装件（装备 + 行囊 + 仓库） */
    const owned = {};
    const pool = [];
    for (const slot in s.equipment) if (s.equipment[slot]) pool.push(s.equipment[slot]);
    (s.inventory || []).forEach(it => { if (it) pool.push(it); });
    if (s.stash && Array.isArray(s.stash.items)) s.stash.items.forEach(it => { if (it) pool.push(it); });
    for (const it of pool) {
      if (!it.setId) continue;
      (owned[it.setId] = owned[it.setId] || []).push(it);
    }

    let totalOwned = 0, totalPieces = 0;
    const all = Object.values(SETS);
    /* v1.2.2：按职业分组展示（3 职业 × 3 类型），方便对着 BD 找套装 */
    const groups = [];
    const CLS_ORDER = ['warrior', 'mage', 'taoist'];
    const seen = {};
    for (const cls of CLS_ORDER) {
      const list = all.filter(x => x.cls === cls);
      if (list.length) { groups.push({ cls, list }); list.forEach(x => { seen[x.id] = 1; }); }
    }
    const rest = all.filter(x => !seen[x.id]);
    if (rest.length) groups.push({ cls: null, list: rest });

    let h = '';
    for (const g of groups) {
      if (g.cls) {
        const cc = typeof CLASSES[g.cls].color === 'number'
          ? '#' + CLASSES[g.cls].color.toString(16).padStart(6, '0') : (CLASSES[g.cls].color || '#d8b25a');
        h += `<div class="cx-group">
          <span class="cx-gname" style="color:${cc}">${CLASSES[g.cls].name}</span>
          <span class="cx-gdesc">${(SET_TYPES[g.cls] || []).map(t => t.tag).join(' · ')}</span></div>`;
      } else {
        /* [M1] 通用套分组：不锁职业，任何角色都能凑 */
        h += `<div class="cx-group">
          <span class="cx-gname" style="color:#c8b88a">通用</span>
          <span class="cx-gdesc">${(SET_TYPES.universal || []).map(t => t.tag).join(' · ')}</span></div>`;
      }
      for (const set of g.list) {
        totalPieces += set.pieces.length;
        const mine = owned[set.id] || [];
        totalOwned += mine.length;
        const clsTxt = set.cls ? '限 ' + CLASSES[set.cls].name : '全职业';
        h += `<div class="cx-set" style="border-color:${set.color}33">
          <div class="cx-head">
            <span class="cx-name" style="color:${set.color}">${set.name}${set.tag ? `<em class="cx-tag">${set.tag}</em>` : ''}</span>
            <span class="cx-sub">${clsTxt} · ${set.pieces.length} 件套 · 已集 <b style="color:${set.color}">${Math.min(mine.length, set.pieces.length)}</b> / ${set.pieces.length}</span>
          </div>
          <div class="cx-pieces">`;
        for (let i = 0; i < set.slots.length; i++) {
          const sl = set.slots[i];
          const got = mine.find(it => it.name === set.pieces[i]) || null;
          const r = got ? RARITY[got.rarity] : null;
          h += `<div class="cx-piece ${got ? 'got' : ''}" ${got ? `style="border-color:${r.color}55"` : ''}
            title="${got ? got.name + ' · ilv' + got.ilvl + ' · ' + r.name : '未获得'}">
            <span class="cx-pslot">${SLOT_NAME[sl] || sl}</span>
            <span class="cx-pname" style="${got ? 'color:' + r.color : ''}">${got ? got.name : set.pieces[i]}</span>
            ${got ? `<span class="cx-pilv">ilv${got.ilvl}</span>` : ''}
          </div>`;
        }
        h += `</div><div class="cx-bonus">`;
        for (const b of set.bonuses) {
          const on = mine.length >= b.need;
          h += `<div class="cx-b ${on ? 'on' : ''}"><span class="cx-bn">${b.need}件</span>${b.text}</div>`;
        }
        h += `</div></div>`;
      }
    }
    document.getElementById('setCodexList').innerHTML = h;
    document.getElementById('setCodexSum').innerHTML =
      `共 <b>${all.length}</b> 套 · <b>${totalPieces}</b> 件部件 · 已收集 <b style="color:#ffd166">${totalOwned}</b> 件`;
  },

  /* ---------------- 天赋面板（S3 / v1.2.0） ----------------
   * 每职业 3 系 + 通用共 4 页签；Canvas 画轮盘：放射状环 + 节点圆 + 已点等级金弧。
   * 左键加点 / Shift+左键洗 1 级；悬停出浮层；预设左键读取、Shift+左键保存；
   * 重置二次确认（3 秒内再点一次）。 */
  tlTree: null,        // 当前查看的系 id
  _tlHit: [],          // 画布点击热区
  _tlRespecArm: false,

  /* v1.6.0：统一走主菜单页签；openTalent 保留给剧情/提示类调用 */
  toggleTalent() { this.openMenu('talent'); },

  openTalent() {
    if (!Game.state) return;
    this.openMenu('talent');
  },

  /* 天赋/技能/套装任何改动后刷新已开着的相关面板 */
  onTalentChanged() {
    const tp = document.getElementById('talentPanel');
    if (tp && tp.classList.contains('open')) this.renderTalentPanel();
    const sp = document.getElementById('statPanel');
    if (sp && sp.classList.contains('open')) this.renderStats();
    const ip = document.getElementById('invPanel');
    if (ip && ip.classList.contains('open')) this.renderInventory();
    if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.syncHud();
  },

  renderTalentPanel() {
    const p = document.getElementById('talentPanel');
    if (!p || !Game.state) return;
    const cls = Game.state.cls;
    const trees = talentTrees(cls);
    if (!this.tlTree || !trees.some(t => t.id === this.tlTree)) this.tlTree = trees[0].id;

    /* 页签：系名 + 本系已投入点数 */
    const sp = Game.talentState().spent;
    const tabs = document.getElementById('tlTrees');
    tabs.innerHTML = trees.map(t => {
      let n = 0;
      for (const id in sp) { const e = Game.talentNodeOf(id); if (e && e.tree === t.id) n += sp[id] || 0; }
      return `<button class="tl-tab ${t.id === this.tlTree ? 'on' : ''}" data-tree="${t.id}"
        style="${t.id === this.tlTree ? 'border-color:' + t.color + ';color:#1a1510;background:linear-gradient(180deg,' + t.color + 'cc,' + t.color + '88)' : 'color:' + t.color + ';border-color:' + t.color + '55'}">
        ${t.name}<span class="tl-tp">${n}</span></button>`;
    }).join('');
    tabs.querySelectorAll('.tl-tab').forEach(b => b.addEventListener('click', () => {
      this.tlTree = b.dataset.tree;
      this.renderTalentPanel();
    }));

    document.getElementById('tlPts').textContent = Game.talentPoints();
    this.renderTalentPresets();
    this.renderSynergyNote();
    /* 顺序要紧：先定画布位图尺寸（改 width/height 会清空画布），再画。
     * v1.6.0 起天赋页被搬进菜单，首帧只渲染这一次，反着来就会是一片空白。 */
    this.bindTalentCanvas();
    this.drawTalentCanvas();
  },

  /* [B4+] 协同页签的详细说明。
   * 隐藏星位是这个系统里最容易被玩家漏掉的一环：画布上只画一个「？+未显形」，
   * 玩家既不知道一共有几枚、也不知道差什么条件。所以在画布下面直接摊开一张清单：
   * 一共几枚、每枚要什么装备、现在显形了几枚。 */
  renderSynergyNote() {
    const el = document.getElementById('tlSyn');
    if (!el) return;
    if (this.tlTree !== 'synergy') { el.classList.remove('on'); el.innerHTML = ''; return; }
    const tree = (typeof TALENTS !== 'undefined' && TALENTS.synergy) ? TALENTS.synergy[0] : null;
    const list = (tree && tree.nodes) ? tree.nodes : [];
    if (!list.length) { el.classList.remove('on'); el.innerHTML = ''; return; }
    const condOf = n => (typeof synergyCondText === 'function') ? synergyCondText(n) : (n.condText || '');
    const opened = list.filter(n => { try { return Game.synergyUnlocked(n.id); } catch (e) { return false; } });
    const rows = list.map(n => {
      const ok = opened.indexOf(n) >= 0;
      return `<div class="sy-row">
        <span class="sy-dot" style="background:${ok ? '#8fd0ff' : '#3c444e'}"></span>
        <span class="sy-nm ${ok ? 'sy-ok' : 'sy-no'}">${n.name}</span>
        <span class="sy-cd" title="${condOf(n)}">${ok ? '已显形' : '未显形'} · ${condOf(n)}</span>
      </div>`;
    }).join('');
    el.innerHTML = `<h4>协 同 · 星盘上的 ${list.length} 枚隐藏星位</h4>
      <div class="sy-desc">这一环默认不显形。把装备穿对（套装件数 / 符文之语 / 词条达标），对应星位才会亮起；
        亮起之后就能像普通节点一样投点，效果与普通天赋一样常驻。卸下装备后星位会重新封印，已投的点数会退回。</div>
      <div class="sy-grid">${rows}</div>
      <div class="sy-sum">已显形 ${opened.length} / ${list.length}${opened.length ? ' · 可投点：' + opened.map(n => n.name).join('、') : ' · 换一套装备再来看看'}</div>`;
    el.classList.add('on');
  },

  renderTalentPresets() {
    const t = Game.talentState();
    const el = document.getElementById('tlPresets');
    if (!el) return;
    el.innerHTML = t.presets.map((pr, i) => {
      const n = pr ? Object.keys(pr).reduce((a, id) => a + (pr[id] || 0), 0) : 0;
      return `<button class="tl-pst ${pr ? 'filled' : ''}" data-pst="${i}"
        title="${pr ? '左键读取 · Shift+左键保存覆盖' : 'Shift+左键保存当前加点'}">预设 ${i + 1}${pr ? ' · ' + n + ' 点' : ''}</button>`;
    }).join('');
    el.querySelectorAll('.tl-pst').forEach(b => b.addEventListener('click', e => {
      const i = parseInt(b.dataset.pst);
      if (e.shiftKey) {
        if (Game.saveTalentPreset(i)) { this.toast('已保存到预设 ' + (i + 1)); this.renderTalentPanel(); }
      } else {
        const r = Game.loadTalentPreset(i);
        this.toast(r.msg);
      }
    }));
    const rs = document.getElementById('tlRespec');
    if (rs) {
      this._tlRespecArm = false;
      rs.textContent = '重置天赋';
      rs.classList.remove('primary');
      rs.onclick = () => {
        const spent = Game._spentTotal();
        if (!this._tlRespecArm) {
          if (!spent) { this.toast('尚未投入任何天赋点'); return; }
          this._tlRespecArm = true;
          rs.textContent = '确认扣除 ' + Game.respecCost() + ' 金？';
          rs.classList.add('primary');
          clearTimeout(this._tlRespecTimer);
          this._tlRespecTimer = setTimeout(() => {
            this._tlRespecArm = false; rs.textContent = '重置天赋'; rs.classList.remove('primary');
          }, 3000);
          return;
        }
        this._tlRespecArm = false;
        clearTimeout(this._tlRespecTimer);
        const r = Game.respecTalents();
        this.toast(r.msg, r.ok ? '' : 'bad');
        this.renderTalentPanel();
      };
    }
  },

  /* 高分屏适配：位图按 dpr 放大，逻辑坐标始终是 660×440。
   * 幂等——尺寸没变就什么都不做（改 width 会清空画布，白画一次）。 */
  sizeTalentCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(660 * dpr), h = Math.round(440 * dpr);
    cv.style.width = '660px'; cv.style.height = '440px';
    if (cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  /* 画布只绑一次监听，重绘时复用 */
  bindTalentCanvas() {
    const cv = document.getElementById('tlCanvas');
    if (!cv) return;
    this.sizeTalentCanvas(cv);
    if (cv._tlBound) return;
    cv._tlBound = true;

    const nodeAt = (mx, my) => {
      for (const h of this._tlHit) {
        if ((mx - h.x) * (mx - h.x) + (my - h.y) * (my - h.y) <= h.r * h.r) return h.id;
      }
      return null;
    };
    const localPos = e => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (660 / r.width), y: (e.clientY - r.top) * (440 / r.height) };
    };

    cv.addEventListener('click', e => {
      if (!Game.state) return;
      const { x, y } = localPos(e);
      const id = nodeAt(x, y);
      if (!id) return;
      if (e.shiftKey) {
        if (!Game.refundTalent(id)) {
          const sp = Game.talentState().spent;
          this.toast(sp[id] ? '后置节点还点着，先洗它们' : '该节点未加点');
        }
      } else {
        if (!Game.allocTalent(id)) {
          const e2 = Game.talentNodeOf(id);
          const n = e2 && e2.node;
          const rank = (Game.talentState().spent[id] || 0);
          if (n && n.cond && !Game.synergyUnlocked(id)) this.toast('未显形：需 ' + ((typeof synergyCondText === 'function') ? synergyCondText(n) : '装备条件'));
          else if (e2 && Game.state.level < (e2.unlock || 1)) this.toast('需 ' + e2.unlock + ' 级解锁');
          else if (n && rank >= n.max) this.toast('已点满');
          else if (n && n.reqPts && Game.talentTreePoints(e2.tree) < n.reqPts) this.toast('需要本系先投入 ' + n.reqPts + ' 点');
          else if (n && (n.req || []).some(r => !(Game.talentState().spent[r] > 0))) this.toast('前置节点未点亮');
          else this.toast('天赋点不足');
        }
      }
    });

    const tip = document.getElementById('tlTip');
    cv.addEventListener('mousemove', e => {
      if (!Game.state || !tip) return;
      const { x, y } = localPos(e);
      const id = nodeAt(x, y);
      if (!id) { tip.style.display = 'none'; return; }
      tip.innerHTML = this.talentTipHtml(id);
      tip.style.display = 'block';
      const main = cv.parentElement.getBoundingClientRect();
      const scale = main.width / 660;
      let tx = x * scale + 16, ty = y * scale - 10;
      tx = Math.max(4, Math.min(tx, main.width - tip.offsetWidth - 6));
      ty = Math.max(4, Math.min(ty, main.height - tip.offsetHeight - 6));
      tip.style.left = tx + 'px';
      tip.style.top = ty + 'px';
    });
    cv.addEventListener('mouseleave', () => { if (tip) tip.style.display = 'none'; });

    /* 换屏 / 缩放会让 dpr 变，位图得跟着重设，否则会糊或被裁 */
    window.addEventListener('resize', () => {
      const p = document.getElementById('talentPanel');
      if (!p || !p.classList.contains('open')) return;
      this.sizeTalentCanvas(cv);
      this.drawTalentCanvas();
    });
  },

  talentTipHtml(id) {
    const e = Game.talentNodeOf(id);
    if (!e) return '';
    const n = e.node;
    /* [B4] 未显形的协同节点：只说条件，不剧透效果 */
    if (n.cond && !Game.synergyUnlocked(id)) {
      const need = (typeof synergyCondText === 'function') ? synergyCondText(n) : '';
      return `<div class="tt-n" style="color:#8fd0ff">未显形的星位</div>
      <div class="tt-r">协同 · 需装备条件</div>
      <div class="tt-d">穿上「${need}」后，这一枚才会在星盘上亮起。</div>
      <div class="tt-c no">尚未显形</div>`;
    }
    const sp = Game.talentState().spent;
    const rank = sp[id] || 0;
    const tierTxt = n.tier === 3 ? '大节点 · 通玄' : n.tier === 2 ? '中节点 · 机变' : '小节点 · 常驻';
    let status, ok = true;
    if (rank >= n.max) status = '已点满 ' + rank + '/' + n.max;
    else if (Game.canAllocTalent(id)) status = '可点（左键）· 当前 ' + rank + '/' + n.max;
    else {
      ok = false;
      if (Game.state.level < (e.unlock || 1)) status = '需 ' + e.unlock + ' 级解锁（当前 ' + Game.state.level + ' 级）';
      else if (Game.talentPoints() <= 0) status = '天赋点不足（升级获得）';
      else if (n.reqPts && Game.talentTreePoints(e.tree) < n.reqPts) status = '需本系先投入 ' + n.reqPts + ' 点';
      else if ((n.req || []).some(r => !(sp[r] > 0))) {
        const miss = (n.req || []).filter(r => !(sp[r] > 0)).map(r => Game.talentNodeOf(r).node.name);
        status = '前置未点亮：' + miss.join('、');
      } else status = '暂不可点';
    }
    const reqTxt = n.reqPts ? ` · 需本系 ${n.reqPts} 点` : '';
    const lvTxt = ` · ${e.unlock || 1} 级解锁`;
    /* 已显形的协同节点：把「因为什么显形」写在卡面，构筑一眼可读 */
    const condTxt = (n.cond && Game.synergyUnlocked(id))
      ? ` · 协同：${(typeof synergyCondText === 'function') ? synergyCondText(n) : ''}`
      : '';
    return `<div class="tt-n" style="color:${e.color}">${n.name}</div>
      <div class="tt-r">${e.treeName} · ${tierTxt}${lvTxt}${reqTxt}${condTxt}${n.max > 1 ? ' · 上限 ' + n.max + ' 级' : ''}</div>
      <div class="tt-d">${n.desc}</div>
      <div class="tt-c ${ok ? '' : 'no'}">${status}</div>`;
  },

  /* ---------------- 天赋轮盘（S3 / v1.2.0） ----------------
   * 职业系（10 节点）：根节点居轮心的放射状轮盘——沿 req 链的深度 = 环半径，
   *   左右两支按角度张开，大节点压底（6 点钟）。节点外圈金弧 = 已投入等级/上限。
   * 通用系（30 节点长链）：单环轮盘，Req 沿环面成弧，中节点带系点门槛（虚线）。
   * 左键加点 / Shift+左键洗 1 级；悬停出浮层。 */
  drawTalentCanvas() {
    const cv = document.getElementById('tlCanvas');
    if (!cv || !Game.state) return;
    const g = cv.getContext('2d');
    const W = 660, H = 440;
    const trees = talentTrees(Game.state.cls);
    const tree = trees.find(t => t.id === this.tlTree) || trees[0];
    const sp = Game.talentState().spent;
    const pts = Game.talentPoints();
    const treePts = Game.talentTreePoints(tree.id);
    g.clearRect(0, 0, W, H);
    this._tlHit = [];

    const CX = 330;
    const uni = tree.nodes.length > 12;          // 通用系：单环长链
    const syn = tree.id === 'synergy';           // [B4] 协同系：外环八枚封印
    const CY = uni ? 215 : 196;
    const OUTER = uni ? 182 : 198;               // 外圈装饰环
    /* 极坐标：deg 从正上方起、顺时针为正 */
    const pol = (R, deg) => {
      const a = deg * Math.PI / 180;
      return { x: CX + R * Math.sin(a), y: CY - R * Math.cos(a) };
    };
    const byId = {};
    tree.nodes.forEach(n => { byId[n.id] = n; });

    /* ---------- 星盘底纹 ---------- */
    const bg = g.createRadialGradient(CX, CY, 8, CX, CY, OUTER);
    bg.addColorStop(0, 'rgba(216,178,90,.08)');
    bg.addColorStop(.55, 'rgba(216,178,90,.03)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(CX, CY, OUTER, 0, Math.PI * 2); g.fill();
    /* 外圈装饰环 + 刻度 */
    g.strokeStyle = 'rgba(216,178,90,.18)'; g.lineWidth = 1;
    g.beginPath(); g.arc(CX, CY, OUTER, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(216,178,90,.28)'; g.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180;
      const r1 = OUTER - (i % 3 === 0 ? 9 : 5), r2 = OUTER - 2;
      g.beginPath();
      g.moveTo(CX + Math.sin(a) * r1, CY - Math.cos(a) * r1);
      g.lineTo(CX + Math.sin(a) * r2, CY - Math.cos(a) * r2);
      g.stroke();
    }

    /* ---------- 标题 / 轮心 ---------- */
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (uni) {
      g.setLineDash([3, 5]);
      g.strokeStyle = 'rgba(216,178,90,.22)'; g.lineWidth = 1;
      g.beginPath(); g.arc(CX, CY, 52, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.font = '600 17px "STKaiti","KaiTi",serif';
      g.fillStyle = tree.color;
      g.fillText(tree.name, CX, CY - 11);
      g.font = '10px ui-sans-serif, system-ui, sans-serif';
      g.fillStyle = '#8a8474';
      g.fillText('已投 ' + treePts + ' · 可用 ' + pts + ' 点', CX, CY + 10);
    } else if (syn) {
      /* [FIX-SYN-TITLE] 协同环的半径是 148，环顶节点就在 y≈48 的位置，
       * 标题原来画在 y=28/45 —— 正好压在顶部那枚未显形的灰色封印上。
       * 协同环中心是一大片空地（半径 148 内没有任何节点），标题挪进圆心最稳。 */
      const open = Game.synergyOpen().length;
      g.font = '600 17px "STKaiti","KaiTi",serif';
      g.fillStyle = tree.color;
      g.fillText(tree.name, CX, CY - 18);
      g.font = '10px ui-sans-serif, system-ui, sans-serif';
      g.fillStyle = '#8a8474';
      g.fillText('已显形 ' + open + ' / ' + tree.nodes.length, CX, CY + 4);
      g.fillText('已投 ' + treePts + ' 点 · 可用 ' + pts + ' 点', CX, CY + 22);
    } else {
      g.font = '600 16px "STKaiti","KaiTi",serif';
      g.fillStyle = tree.color;
      g.fillText(tree.name, CX, 28);
      g.font = '10px ui-sans-serif, system-ui, sans-serif';
      g.fillStyle = '#8a8474';
      g.fillText('本系已投 ' + treePts + ' 点 · 可用 ' + pts + ' 点', CX, 45);
    }

    /* ---------- 节点坐标 ---------- */
    const POS = {};   // id → {x, y, deg, R}
    if (syn) {
      /* 协同系：八枚节点等分一圈，封印与已显形都占位（位置固定，显形时不会跳） */
      const R = 148, step = 360 / tree.nodes.length;
      tree.nodes.forEach((n, i) => {
        /* 偏半格起排：正上方留给标题，节点不会压到「协同」两个字 */
        const deg = step / 2 + i * step;
        const p = pol(R, deg);
        POS[n.id] = { x: p.x, y: p.y, deg, R };
      });
    } else if (!uni) {
      /* 深度 = 沿 req[0] 链上层数；大节点固定最外环底部 */
      const depthOf = id => {
        let d = 0, c = byId[id];
        while (c && c.req && c.req.length) { c = byId[c.req[0]]; d++; }
        return d;
      };
      let maxD = 0;
      for (const n of tree.nodes) if (n.tier < 3) maxD = Math.max(maxD, depthOf(n.id));
      const d1 = tree.nodes.filter(n => depthOf(n.id) === 1);
      const side = {};
      d1.forEach((n, i) => { side[n.id] = d1.length === 1 ? 0 : (i === 0 ? -1 : 1); });
      const sideOf = id => {
        if (side[id]) return side[id];
        const n = byId[id];
        return n.req && n.req.length ? sideOf(n.req[0]) : 0;
      };
      const RAD = [0, 60, 96, 130, 164, 168];
      const ANG = [0, 48, 72, 94, 112];
      for (const n of tree.nodes) {
        const d = n.tier === 3 ? maxD + 1 : depthOf(n.id);
        const deg = n.tier === 3 ? 180 : sideOf(n.id) * ANG[Math.min(d, 4)];
        const R = RAD[Math.min(d, 5)];
        const p = pol(R, deg);
        POS[n.id] = { x: p.x, y: p.y, deg, R };
      }
    } else {
      const R = 165, step = 360 / tree.nodes.length;
      tree.nodes.forEach((n, i) => {
        const p = pol(R, i * step);
        POS[n.id] = { x: p.x, y: p.y, deg: i * step, R };
      });
    }
    const nodeR = n => uni ? (n.tier === 2 ? 14 : 11) : (n.tier === 3 ? 20 : n.tier === 2 ? 17 : 15);

    /* ---------- 连线 ---------- */
    const curve = (a, b, bow) => {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(mx + (CX - mx) * bow, my + (CY - my) * bow, b.x, b.y);
      g.stroke();
    };
    if (!uni) {
      g.lineWidth = 2;
      for (const n of tree.nodes) {
        for (const r of (n.req || [])) {
          const a = POS[r], b = POS[n.id];
          if (!a || !b) continue;
          g.strokeStyle = sp[r] > 0 ? tree.color + 'b0' : 'rgba(255,255,255,.10)';
          curve(a, b, 0.16);
        }
      }
      /* 大节点没有显式前置（reqPts 门槛）：中节点 → 大节点 虚线，表示「投入 5 点解锁」 */
      g.save();
      g.setLineDash([4, 5]);
      g.lineWidth = 1.4;
      for (const n of tree.nodes) {
        if (n.tier !== 3) continue;
        for (const m of tree.nodes) {
          if (m.tier !== 2) continue;
          g.strokeStyle = treePts >= (n.reqPts || 5) ? tree.color + '55' : 'rgba(255,255,255,.08)';
          curve(POS[m.id], POS[n.id], 0.1);
        }
      }
      g.restore();
    } else {
      /* 长链：Req 沿环面成弧；系点门槛未达成时该弧改虚线 */
      const R = 165;
      for (const n of tree.nodes) {
        for (const r of (n.req || [])) {
          const a = POS[r], b = POS[n.id];
          if (!a || !b) continue;
          const lit = sp[r] > 0;
          const gate = n.reqPts && treePts < n.reqPts;
          g.lineWidth = 2;
          g.strokeStyle = lit ? (gate ? 'rgba(255,255,255,.16)' : tree.color + 'b0') : 'rgba(255,255,255,.10)';
          if (Math.abs(b.deg - a.deg) < 30) {
            const hwA = Math.asin((nodeR(byId[r]) + 2) / R) * 180 / Math.PI;
            const hwB = Math.asin((nodeR(n) + 2) / R) * 180 / Math.PI;
            g.save();
            if (gate) g.setLineDash([3, 4]);
            g.beginPath();
            g.arc(CX, CY, R, (a.deg + hwA - 90) * Math.PI / 180, (b.deg - hwB - 90) * Math.PI / 180);
            g.stroke();
            g.restore();
          } else {
            curve(a, b, 0.2);
          }
        }
      }
    }

    /* ---------- 节点 ---------- */
    for (const n of tree.nodes) {
      const P = POS[n.id];
      const rank = sp[n.id] || 0;
      const maxed = rank >= n.max;
      const can = Game.canAllocTalent(n.id);
      const lvOk = Game.state.level >= ((TALENT_NODES[n.id] || {}).unlock || 1);   // 等级解锁
      const reqOk = !(n.req || []).some(r => !(sp[r] > 0)) && (!n.reqPts || treePts >= n.reqPts) && lvOk;
      const r = nodeR(n);
      /* [B4] 协同节点未显形：只画一枚虚线封印，不露名称与效果 */
      if (n.cond && !Game.synergyUnlocked(n.id)) {
        g.save();
        g.setLineDash([3, 4]);
        g.lineWidth = 1.4;
        g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(10,12,16,.9)'; g.fill();
        g.strokeStyle = 'rgba(143,208,255,.28)'; g.stroke();
        g.setLineDash([]);
        g.font = '600 13px "STKaiti","KaiTi",serif';
        g.fillStyle = 'rgba(143,208,255,.4)';
        g.fillText('？', P.x, P.y + 0.5);
        g.font = '9px ui-sans-serif, system-ui, sans-serif';
        g.fillStyle = 'rgba(143,208,255,.34)';
        const lp0 = pol(P.R + r + 13, P.deg);
        g.fillText('未显形', lp0.x, lp0.y);
        g.restore();
        this._tlHit.push({ id: n.id, x: P.x, y: P.y, r: r + 6, sealed: true });
        continue;
      }
      /* 已投入等级：外圈金弧（0 级时画一圈暗轨） */
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(P.x, P.y, r + 4.5, 0, Math.PI * 2);
      if (rank > 0) {
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.stroke();
        g.beginPath();
        g.arc(P.x, P.y, r + 4.5, -Math.PI / 2, -Math.PI / 2 + (rank / n.max) * Math.PI * 2);
        g.strokeStyle = maxed ? '#ffd479' : tree.color;
        g.stroke();
      } else {
        g.strokeStyle = n.max > 1 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)';
        g.stroke();
      }
      /* 底圆 */
      g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2);
      if (maxed) { g.fillStyle = 'rgba(48,40,24,.95)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = tree.color; }
      else if (rank > 0) { g.fillStyle = 'rgba(26,22,15,.95)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = tree.color + 'aa'; }
      else if (reqOk && pts > 0) { g.fillStyle = 'rgba(30,27,20,.95)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(216,178,90,.55)'; }
      else { g.fillStyle = 'rgba(14,13,11,.95)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.13)'; }
      g.stroke();
      /* 可加点：外圈微光 */
      if (can) {
        g.beginPath(); g.arc(P.x, P.y, r + 8.5, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,212,121,.35)'; g.lineWidth = 1; g.stroke();
      }
      /* 中心字形 */
      g.font = (uni ? '600 10px' : n.tier === 3 ? '600 17px' : n.tier === 2 ? '600 15px' : '600 13px') + ' "STKaiti","KaiTi",serif';
      g.fillStyle = rank > 0 ? (maxed ? '#ffe9a8' : '#f0e6cc') : (reqOk && pts > 0 ? '#a8a090' : '#5a5448');
      g.fillText(n.name.slice(0, 1), P.x, P.y + 0.5);
      /* 名称 / 等级标签：沿半径向外 */
      if (!uni) {
        const lp = pol(P.R + r + (n.max > 1 ? 21 : 12), P.deg);
        g.font = '10px ui-sans-serif, system-ui, sans-serif';
        g.fillStyle = rank > 0 ? '#c8b8a0' : reqOk && pts > 0 ? '#8a8474' : '#5a5448';
        g.fillText(n.name, lp.x, lp.y);
        if (n.max > 1) {
          g.font = '8.5px ui-sans-serif, system-ui, sans-serif';
          g.fillStyle = rank > 0 ? '#d8b060' : '#6a6458';
          g.fillText(rank + '/' + n.max, lp.x, lp.y + 11);
        } else if (!lvOk) {
          g.font = '8.5px ui-sans-serif, system-ui, sans-serif';
          g.fillStyle = '#e05a5a';
          g.fillText('需 ' + (TALENT_NODES[n.id] || {}).unlock + ' 级', lp.x, lp.y + 11);
        } else if (n.tier === 3 && treePts < (n.reqPts || 5)) {
          g.font = '8.5px ui-sans-serif, system-ui, sans-serif';
          g.fillStyle = '#e05a5a';
          g.fillText('需本系 ' + (n.reqPts || 5) + ' 点', lp.x, lp.y + 11);
        }
      } else if (n.tier === 2) {
        const lp = pol(P.R + r + 12, P.deg);
        g.font = '10px ui-sans-serif, system-ui, sans-serif';
        g.fillStyle = rank > 0 ? '#c8b8a0' : '#7a7466';
        g.fillText(n.name, lp.x, lp.y);
      }
      this._tlHit.push({ id: n.id, x: P.x, y: P.y, r: r + 6 });
    }
  },

  /* ---------------- 技能面板（S4 / v1.2.0） ----------------
   * 暗黑风：左侧按系分组的图标网格（一个图标一个技能），点图标选中；
   * 右侧详情卡展示名称/描述/消耗冷却/等级/变体，升级与变体都在详情卡上操作。 */
  toggleSkill() { this.openMenu('skill'); },

  openSkill() {
    if (!Game.state) return;
    this.openMenu('skill');
  },

  onSkillChanged() {
    const p = document.getElementById('skillPanel');
    if (p && p.classList.contains('open')) this.renderSkillPanel();
    this.updateSkillbar();
  },

  /* 技能条配置变化（放技能 / 腾空）：动作条与术法面板一起重画 */
  onSkillBarChanged() {
    this.buildActionBar();
    const p = document.getElementById('skillPanel');
    if (p && p.classList.contains('open')) this.renderSkillPanel();
  },

  renderSkillPanel() {
    const p = document.getElementById('skillPanel');
    if (!p || !Game.state) return;
    const s = Game.state;
    const order = SKILL_ORDER[s.cls];
    const pts = Game.skillPoints();
    const barSlots = Game.skillBar();          // 当前快捷栏 8 格配置
    const setIdx = Game.barSet();
    document.getElementById('skPtsTxt').innerHTML = `可用技能点 <b>${pts}</b>`;
    /* [UNIQUE-3] 传世授予的秘技：不在本职业技能树里，单独列一组。
     * 它们是「装备给的技能」——脱下就没了，所以不占技能点、也不进 SKILL_ORDER。 */
    const gmap = (s.stats && s.stats.grantedSkills) || {};
    const grantedIds = Object.keys(gmap).filter(gid => SKILLS[gid] && order.indexOf(gid) < 0);
    if (!this.skSel || (!order.includes(this.skSel) && grantedIds.indexOf(this.skSel) < 0)) {
      this.skSel = order[0];
    }

    /* 按系分组：SKILL_ORDER 是解锁顺序（动作条用），面板里要聚在一起 */
    const byTree = {};
    for (const id of order) {
      const t = SKILLS[id].tree;
      (byTree[t] = byTree[t] || []).push(id);
    }

    /* 左：图标网格 */
    let h = '<div class="sk-body"><div class="sk-left">';
    /* 单个技能格子：技能树与「秘技」组共用同一份模板 */
    const tile = (id, isGrant) => {
      const sk = SKILLS[id];
      const locked = !Game.skillUnlocked(id);
      const lv = Game.skillLevel(id);
      const onBar = barSlots.indexOf(id);     // 在技能条第几格（-1 = 不在）
      return `<div class="sk-row sk-tile ${locked ? 'locked' : ''} ${id === this.skSel ? 'sel' : ''}" data-skpick="${id}">
        <span class="sk-ico">${skillIconSvg(id, 26)}</span>
        ${onBar >= 0 ? `<span class="sk-onslot">${onBar + 1}</span>` : ''}
        ${isGrant ? `<span class="sk-lk gr">秘</span>`
          : (locked ? `<span class="sk-lk">${sk.unlock} 级</span>` : `<span class="sk-badge">${lv}</span>`)}
      </div>`;
    };
    for (const t in byTree) {
      h += `<div class="sk-tree">${t}<span class="sk-tn">${byTree[t].length} 式</span></div><div class="sk-tiles">`;
      for (const id of byTree[t]) h += tile(id, false);
      h += '</div>';
    }
    if (grantedIds.length) {
      h += `<div class="sk-tree sk-tree-g">秘技<span class="sk-tn">传世授予 ${grantedIds.length} 式</span></div><div class="sk-tiles">`;
      for (const id of grantedIds) h += tile(id, true);
      h += '</div>';
    }
    h += '</div>';

    /* 右：详情卡 */
    const id = this.skSel, sk = SKILLS[id];
    const isGrant = grantedIds.indexOf(id) >= 0;
    const locked = !Game.skillUnlocked(id);
    const lv = Game.skillLevel(id);
    const v = Game.skillVariant(id);
    /* 预览伤害：攻击力 × 倍率 ×（变体 + 等级） */
    const smod = mergeSkillMods(Game.skillMod(id), variantMods(sk, v));
    const lvMul = 1 + SKILL_LV_STEP * (lv - 1);
    const spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * lvMul;
    const dmgTxt = Math.round(s.stats.atk * sk.mult * spow);
    const desc = (sk.desc || '').replace(/\{dmg\}/g, '<b style="color:#ffe9a8">' + dmgTxt + '</b>');
    const castTxt = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
    /* [C1] 机制型变体在按钮上单独描边：玩家要能一眼看出「这个变体改的是打法，不是数字」 */
    const vars = (sk.variants || []).map((vr, i) => {
      const mech = variantSpecial(sk, i);
      const tip = vr.desc + (mech ? ' · 机制：' + SKILL_SPECIALS[mech].name : '');
      return `<button class="sk-vbtn ${i === v ? 'on' : ''} ${mech ? 'mech' : ''}" data-skv="${id}:${i}" title="${tip}">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</button>`;
    }).join('');
    const curSp = variantSpecial(sk, v);
    const pips = Array.from({ length: SKILL_LV_MAX }, (_, i) => `<span class="sk-pip ${i < lv ? 'on' : ''}"></span>`).join('');
    /* 技能条 8 格（两套甲乙栏）：点数字把当前技能放上去（已在条上会从原位移走） */
    const slotBtns = barSlots.map((bid, i) => {
      const occ = bid ? SKILLS[bid] : null;
      const on = bid === id;
      return `<button class="sk-bslot ${on ? 'on' : ''}" data-skbar="${i}" ${locked ? 'disabled' : ''}
        title="${occ ? (on ? '当前技能就在这一格' : '放到 ' + (i + 1) + '（替换「' + occ.name + '」）') : '空位 ' + (i + 1)}">${i + 1}</button>`;
    }).join('');
    h += `<div class="sk-right">
      <div class="sd-head"><span class="sd-ico">${skillIconSvg(id, 30)}</span>
        <div><div class="sd-name">${sk.name}${isGrant ? '<span class="sk-lock gr">传世秘技</span>' : (locked ? `<span class="sk-lock">${sk.unlock} 级领悟</span>` : '')}</div>
        <div class="sd-sub">${sk.tree} · ${isGrant ? '传世授予（脱下即失去）' : (locked ? '未领悟' : '等阶 ' + lv)}</div></div></div>
      <div class="sd-desc">${desc}</div>
      <div class="sd-meta">消耗 ${Game.skillCost(sk)} · 冷却 ${Game.skillCd(sk).toFixed(1)}s · ${castTxt}${sk.castRange ? ' · ' + sk.castRange + ' 码' : ''}</div>
      <div class="sd-lv"><div class="sk-pips">${pips}</div>
        <span class="sk-lvt"><b>${lv}</b>/${SKILL_LV_MAX}</span>
        <button class="sk-lvb" data-sklv="${id}" ${locked || lv >= SKILL_LV_MAX || pts <= 0 ? 'disabled' : ''}>升级</button></div>
      <div class="sd-vars">${vars}</div>
      <div class="sd-vname">${sk.variants[v].name}：${sk.variants[v].desc}${curSp ? `<span class="sd-mech">机制 · ${SKILL_SPECIALS[curSp].name}</span>` : ''}</div>
      <div class="sd-bar"><span class="sd-barlab">技能条</span>
        <span class="sd-barslots">${slotBtns}</span>
        <span class="sk-sets">${SKILL_BAR_SET_NAME.map((nm, i) =>
          `<button class="sk-setbtn ${i === setIdx ? 'on' : ''}" data-skset="${i}" title="${nm}（${SKILL_BAR_SET_LABEL} / ${SKILL_BAR_SET_KEY_ALT} 切换）">${barSetIcon(i, 15)}</button>`).join('')}</span>
        <span class="sd-barhint">${locked ? '领悟后可放上技能条' : `点数字放上技能条（键 1-${SKILL_BAR_SLOTS} 施放 · ${SKILL_BAR_SET_LABEL} 换栏）`}</span></div>
    </div></div>`;

    const list = document.getElementById('skList');
    list.innerHTML = h;
    /* 点图标选中 */
    list.querySelectorAll('[data-skpick]').forEach(el => el.addEventListener('click', () => {
      this.skSel = el.dataset.skpick;
      SFX.ui();
      this.renderSkillPanel();
    }));
    list.querySelectorAll('[data-sklv]').forEach(b => b.addEventListener('click', () => {
      const r = Game.levelUpSkill(b.dataset.sklv);
      if (r.ok) { SFX.ui(); this.renderSkillPanel(); }
      else this.toast(r.msg);
    }));
    list.querySelectorAll('[data-skv]').forEach(b => b.addEventListener('click', () => {
      const [sid, vi] = b.dataset.skv.split(':');
      Game.setSkillVariant(sid, parseInt(vi));
      SFX.ui();
      this.renderSkillPanel();
    }));
    /* 放技能上条：点详情卡里的 1-8 */
    list.querySelectorAll('[data-skbar]').forEach(b => b.addEventListener('click', () => {
      const r = Game.assignSkillBar(parseInt(b.dataset.skbar), this.skSel);
      if (r.ok) SFX.ui();
      else this.toast(r.msg, 'bad');
    }));
    /* [M1] 切快捷栏（甲 / 乙） */
    list.querySelectorAll('[data-skset]').forEach(b => b.addEventListener('click', () => {
      Game.switchBarSet(parseInt(b.dataset.skset));
      SFX.ui();
    }));
    /* 图标悬停浮层 */
    const tip = document.getElementById('skTip');
    if (tip) {
      const body = list.closest('.pb');
      list.querySelectorAll('[data-skpick]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          const sk2 = SKILLS[el.dataset.skpick];
          const lk = !Game.skillUnlocked(sk2.id);
          tip.innerHTML = `<div class="tt-n"><span class="tt-ico">${skillIconSvg(sk2.id, 16)}</span>${sk2.name}</div>
            <div class="tt-r">${sk2.tree} · ${lk ? sk2.unlock + ' 级领悟' : '等阶 ' + Game.skillLevel(sk2.id)}</div>
            <div class="tt-d">${(sk2.desc || '').replace(/\{dmg\}/g, '<b style="color:#ffe9a8">' + Math.round(s.stats.atk * sk2.mult * (1 + SKILL_LV_STEP * (Game.skillLevel(sk2.id) - 1))) + '</b>')}</div>`;
          tip.style.display = 'block';
          const tr = el.getBoundingClientRect(), br = body.getBoundingClientRect();
          let tx = tr.right - br.left + 10;
          if (tx + tip.offsetWidth > br.width - 6) tx = tr.left - br.left - tip.offsetWidth - 10;
          tip.style.left = Math.max(4, tx) + 'px';
          tip.style.top = Math.max(4, tr.top - br.top - 6) + 'px';
        });
        el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      });
    }
  },

  /* 属性分组（v1.3.0 抽出）：属性面板与背包「详细属性」共用同一份口径，
   * 免得两处各写一遍、加新词条时漏改一处。 */
  statGroups() {
    const s = Game.state, st = s.stats, c = CLASSES[s.cls];
    const n = k => st[k] || 0;                 // 旧档/异常值兜底
    const P = k => Math.round(n(k)) + '%';
    const G = [];

    /* 根基：永远显示 */
    const base = [
      ['职业', c.name + ' · ' + c.title], ['境界', s.level + ' 级'],
      ['攻击力', Math.round(st.atk)], ['护甲', Math.round(st.def)],
      ['生命上限', Math.round(st.hpMax)], ['灵力上限', Math.round(st.mpMax)],
      ['力量', Math.round(st.str)], ['敏捷', Math.round(st.agi)],
      ['体质', Math.round(st.vit)], ['灵力', Math.round(st.int)]
    ];
    G.push(['根基', base]);

    /* 攻伐：数值为 0 的条目自动隐藏，面板不会长到 64 行 */
    const atk = [
      ['暴击率', st.crit.toFixed(1) + '%'],
      ['暴击伤害', Math.round(st.critDmg) + '%'],
      ['攻击速度', st.aspd.toFixed(2)]
    ];
    if (n('dmgAll')) atk.push(['伤害加成', P('dmgAll')]);
    if (n('skillDmg')) atk.push(['技能伤害', P('skillDmg')]);
    if (n('meleeDmg')) atk.push(['近战伤害', P('meleeDmg')]);
    if (n('projDmg')) atk.push(['投射物伤害', P('projDmg')]);
    if (n('aoeDmg')) atk.push(['范围伤害', P('aoeDmg')]);
    if (n('dotDmg')) atk.push(['持续伤害', P('dotDmg')]);
    if (n('eliteDmg')) atk.push(['对精英伤害', P('eliteDmg')]);
    if (n('bossDmg')) atk.push(['对首领伤害', P('bossDmg')]);
    if (n('executeDmg')) atk.push(['处决伤害', P('executeDmg')]);
    if (n('firstStrike')) atk.push(['先手伤害', P('firstStrike')]);
    if (n('armorPen')) atk.push(['护甲穿透', P('armorPen')]);
    if (n('summonDmg')) atk.push(['召唤物伤害', P('summonDmg')]);
    G.push(['攻伐', atk]);

    /* 守御 */
    const def = [];
    if (n('dodge')) def.push(['闪避率', P('dodge')]);
    if (n('block')) def.push(['格挡率', P('block')]);
    if (n('dmgReduce')) def.push(['伤害减免', P('dmgReduce')]);
    if (n('allRes')) def.push(['全元素抗性', P('allRes')]);
    if (n('physRes')) def.push(['物理抗性', P('physRes')]);
    if (n('fireRes')) def.push(['火焰抗性', P('fireRes')]);
    if (n('iceRes')) def.push(['冰霜抗性', P('iceRes')]);
    if (n('poisonRes')) def.push(['毒性抗性', P('poisonRes')]);
    if (n('ccResist')) def.push(['控制抗性', P('ccResist')]);
    if (n('thorns')) def.push(['伤害反弹', P('thorns')]);
    if (n('shieldBonus')) def.push(['护盾强度', P('shieldBonus')]);
    if (def.length) G.push(['守御', def]);

    /* 续航 */
    const sus = [];
    if (n('lifesteal')) sus.push(['生命偷取', st.lifesteal.toFixed(1) + '%']);
    if (n('hpRegen')) sus.push(['每秒回复', n('hpRegen').toFixed(1)]);
    if (n('hpOnHit')) sus.push(['命中回血', Math.round(n('hpOnHit'))]);
    if (n('killHeal')) sus.push(['击杀回复', Math.round(n('killHeal'))]);
    if (n('mpOnHit')) sus.push(['命中回灵', Math.round(n('mpOnHit'))]);
    if (n('mpOnKill')) sus.push(['击杀回灵', Math.round(n('mpOnKill'))]);
    if (n('mpReg') > 3) sus.push(['灵力回复', st.mpReg.toFixed(1) + '/s']);
    if (n('healBonus')) sus.push(['治疗效果', P('healBonus')]);
    if (n('overkillShield')) sus.push(['溢出转护盾', P('overkillShield')]);
    if (sus.length) G.push(['续航', sus]);

    /* 机能 */
    const util = [['移动速度', st.moveSpd.toFixed(1)]];
    if (n('cdr')) util.push(['冷却缩减', P('cdr')]);
    if (n('cdrFlat')) util.push(['冷却缩短', n('cdrFlat').toFixed(1) + 's']);
    if (n('costReduce')) util.push(['消耗降低', P('costReduce')]);
    if (n('aspdOnCrit')) util.push(['暴击后攻速', P('aspdOnCrit')]);
    if (n('expGain')) util.push(['经验获取', P('expGain')]);
    if (n('goldFind')) util.push(['金币获取', P('goldFind')]);
    if (n('magicFind')) util.push(['奇遇机缘', P('magicFind')]);
    if (n('dropRate')) util.push(['掉落数量', P('dropRate')]);
    if (n('pickupRadius')) util.push(['拾取范围', n('pickupRadius').toFixed(1)]);
    G.push(['机能', util]);
    return G;
  },

  renderStats() {
    const s = Game.state, st = s.stats;
    const G = this.statGroups();
    document.getElementById('statList').innerHTML = G.map(([title, list]) =>
      `<div class="st-grp">${title}</div>` +
      list.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
    ).join('');

    const active = st.setBonuses;
    document.getElementById('setShow').innerHTML = active.length
      ? '<div style="color:var(--gold);letter-spacing:2px;margin-bottom:4px">套装之力</div>' +
      active.map(b => `<div style="color:${SETS[b.setId].color}">${b.name}(${b.need})　${b.text}</div>`).join('')
      : '<span style="color:#6a6458">尚无激活的套装效果</span>';
  },

  /* ---------------- 任务 ---------------- */
  renderQuests() {
    const s = Game.state;
    const list = document.getElementById('questList');
    if (!s.quests.active.length) {
      list.innerHTML = `<div class="quest"><div class="qn">暂无委托</div>
        <div class="qb">回桃源村找村长，听听最近的怪事。</div></div>`;
      return;
    }
    list.innerHTML = s.quests.active.map(a => {
      const q = QUESTS[a.id];
      return `<div class="quest"><div class="qn">${q.name}</div>
        <div class="qb">${q.brief}</div>
        ${q.objectives.map((o, i) => {
        const cur = Math.min(a.progress[i] || 0, o.count);
        const done = cur >= o.count;
        return `<div class="qo ${done ? 'done' : ''}">· ${o.label}　${cur}/${o.count}</div>`;
      }).join('')}
        </div>`;
    }).join('');
  },

  updateQuestTrack() {
    const s = Game.state;
    const el = document.getElementById('questTrack');
    if (!s || !s.quests.active.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const a = s.quests.active[0];
    const q = QUESTS[a.id];
    let h = `<b>${q.name}</b>`;
    q.objectives.forEach((o, i) => {
      const cur = Math.min(a.progress[i] || 0, o.count);
      const done = cur >= o.count;
      h += `<div class="obj ${done ? 'done' : ''}">${o.label} ${cur}/${o.count}</div>`;
    });
    if (s.quests.active.length > 1) h += `<div class="obj" style="color:#7a7466">另有 ${s.quests.active.length - 1} 项委托</div>`;
    el.innerHTML = h;
  },

  /* ---------------- 对话 ---------------- */
  showDialog(name, text, options) {
    const d = document.getElementById('dialog');
    document.getElementById('dlgName').textContent = name;
    document.getElementById('dlgText').textContent = text;
    const btns = document.getElementById('dlgBtns');
    btns.innerHTML = '';
    options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'btn' + (o.primary ? ' primary' : '');
      b.textContent = o.label;
      b.onclick = () => { SFX.ui(); o.action(); };
      btns.appendChild(b);
    });
    d.style.display = 'block';
  },

  /* ---------------- 商店 ---------------- */
  openShop(items, title) {
    document.getElementById('shopTitle').textContent = title || '铁 匠 铺';
    const list = document.getElementById('shopList');
    list.innerHTML = items.map((it, i) => {
      const r = RARITY[it.item.rarity];
      return `<div class="shoprow" data-buy="${i}">
        <div class="ico" style="color:${r.color};border-color:${r.color}55">${itemIcon(it.item)}</div>
        <div class="si"><div class="sn" style="color:${r.color}">${it.item.name}</div>
          <div class="ss">${r.name} · ${SLOT_NAME[it.item.slot]} · 需 ${it.item.reqLv} 级</div></div>
        <div class="sp">${it.price} 金</div></div>`;
    }).join('') || '<div class="hintline" style="padding:14px 0;text-align:center">货架空了，等下一次进货吧。</div>';
    list.querySelectorAll('[data-buy]').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const it = items[parseInt(row.dataset.buy)].item;
        /* 商店里最需要对比：这件买下来到底比身上的强多少 */
        this.tooltipEl.innerHTML = itemTooltip(it, { compareTo: this.equippedFor(it) });
        this.tooltipEl.style.display = 'block';
      });
      row.addEventListener('mouseleave', () => { this.tooltipEl.style.display = 'none'; });
      row.addEventListener('click', () => Game.buyShopItem(parseInt(row.dataset.buy)));
    });
    document.getElementById('shopHint').textContent = `持有金币 ${Game.state.gold}`;
    this.closeAll(document.getElementById('shopPanel'));
    document.getElementById('shopPanel').classList.add('open');
    this.shopItems = items;
    this.renderShopRefresh();
    this.startShopTick();
  },

  /* 商店刷新条：免费倒计时 + 金币刷新。
   * 每秒只改文本、不重建 DOM —— 整块 innerHTML 重写会让「按住鼠标时按钮被换掉」，
   * 点击事件就丢了。 */
  renderShopRefresh() {
    const el = document.getElementById('shopRefresh');
    if (!el || !Game.state) return;
    let timeEl = el.querySelector('.sr-time b');
    let btn = el.querySelector('[data-shop-refresh]');
    if (!btn || !timeEl) {
      el.innerHTML = `<span class="sr-time">下次免费换货 <b>--:--</b></span>
        <button class="sr-btn" data-shop-refresh="1">金币刷新</button>`;
      timeEl = el.querySelector('.sr-time b');
      btn = el.querySelector('[data-shop-refresh]');
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const r = Game.refreshShopPaid();
        if (r.ok) this.openShop(Game.shopItems, document.getElementById('shopTitle').textContent);
        else this.renderShopRefresh();
      });
    }
    const ms = Game.shopRemainMs();
    const mm = Math.floor(ms / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    const cost = Game.shopRefreshCost();
    timeEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    btn.textContent = `金币刷新 · ${cost}`;
    btn.classList.toggle('dis', Game.state.gold < cost);
  },

  startShopTick() {
    if (this.shopTimer) { clearInterval(this.shopTimer); this.shopTimer = null; }
    this.shopTimer = setInterval(() => {
      const panel = document.getElementById('shopPanel');
      if (!panel || !panel.classList.contains('open')) {
        clearInterval(this.shopTimer); this.shopTimer = null; return;
      }
      if (Game.shopRemainMs() <= 0) {
        /* 到点自动换货：不重新进店也会换，玩家开着的面板同步刷新 */
        Game.ensureShop();
        this.openShop(Game.shopItems, document.getElementById('shopTitle').textContent);
        this.log('铁匠铺换了新货。', 'good');
        return;
      }
      this.renderShopRefresh();
    }, 1000);
  },

  /* ---------------- 传送 ---------------- */
  openTravel() {
    const s = Game.state;
    const list = document.getElementById('travelList');
    const ids = ['village', 'forest', 'swamp', 'mine', 'abyss', 'heaven'];
    list.innerHTML = ids.map(id => {
      const m = MAPS[id];
      const locked = s.level < (m.unlock || 1);
      return `<div class="trow ${locked ? 'locked' : ''}">
        <div><div class="tn">${m.name}</div>
        <div class="tl">推荐境界 ${m.level}${locked ? ' · 需 ' + m.unlock + ' 级' : ''}</div></div>
        ${locked ? '<span class="tl">未开启</span>' : `<button class="btn" data-go="${id}" style="padding:4px 14px;font-size:11px">前往</button>`}
      </div>`;
    }).join('');
    list.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      Game.travelTo(b.dataset.go); this.closeAll();
    }));
    this.closeAll(document.getElementById('travelPanel'));
    document.getElementById('travelPanel').classList.add('open');
  },

  /* ---------------- 炼金师（分解 / 升级 / 套装打造） ---------------- */
  alchemistTab: 'decompose',
  alchemistRef: null,
  alchemistSetId: null,
  _alchemistBound: false,

  openDecompose() {
    this.alchemistTab = 'decompose';
    this.openAlchemist();
  },
  openUpgradeQuality() {
    this.alchemistTab = 'upgrade';
    this.openAlchemist();
  },
  openSetCraft() {
    this.alchemistTab = 'setcraft';
    this.alchemistSetId = null;
    this.openAlchemist();
  },
  openAlchemist() {
    if (!Game.state) return;
    const p = document.getElementById('alchemistPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this._bindAlchemist();
    this.renderAlchemist();
  },
  _bindAlchemist() {
    if (this._alchemistBound) return;
    this._alchemistBound = true;
    const p = document.getElementById('alchemistPanel');
    p.querySelectorAll('.ftab').forEach(b => b.addEventListener('click', () => {
      if (this.alchemistTab === b.dataset.atab) return;
      this.alchemistTab = b.dataset.atab;
      this.alchemistRef = null;
      this.alchemistSetId = null;
      SFX.ui();
      this.renderAlchemist();
    }));
    document.getElementById('alchemistList').addEventListener('click', e => {
      const row = e.target.closest('[data-aref]');
      if (!row || row.dataset.aref === this.alchemistRef) return;
      this.alchemistRef = row.dataset.aref;
      SFX.ui();
      this.renderAlchemist();
    });
    document.getElementById('alchemistMain').addEventListener('click', e => {
      const item = this.itemFromRef(this.alchemistRef);
      if (!item) return;
      if (e.target.closest('[data-decompose]')) {
        const r = Game.decomposeItem(item);
        if (r.ok) {
          this.removeItemByRef(this.alchemistRef);
          this.alchemistRef = null;
          this.renderAlchemist();
        } else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }
      if (e.target.closest('[data-upgrade]')) {
        const r = Game.upgradeItemQuality(item);
        if (r.ok) this.renderAlchemist();
        else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }
      /* 套装打造：先点目标套装卡片选中，再点打造按钮 */
      const asetEl = e.target.closest('[data-aset]');
      if (asetEl) {
        this.alchemistSetId = asetEl.dataset.aset;
        SFX.ui();
        this.renderAlchemist();
        return;
      }
      if (e.target.closest('[data-setscraft]')) {
        const r = Game.craftSetItem(item, this.alchemistSetId);
        if (r.ok) { this.alchemistSetId = null; this.renderAlchemist(); }
        else if (r.msg) UI.log(r.msg, 'bad');
      }
    });
  },
  _alchemistItems() {
    const s = Game.state;
    if (!s) return [];
    const out = [];
    const order = ['weapon', 'helm', 'chest', 'shoulders', 'cloak', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'offhand', 'fate'];
    for (const slot of order) {
      const it = s.equipment[slot];
      if (it) out.push({ ref: 'eq:' + slot, item: it, where: '已装备' });
    }
    s.inventory.forEach((it, i) => { if (it) out.push({ ref: 'inv:' + i, item: it, where: '行囊' }); });
    return out;
  },
  renderAlchemist() {
    const p = document.getElementById('alchemistPanel');
    if (!p || !Game.state) return;
    const s = Game.state;
    const matTxt = CRYSTAL_TIERS.map((t, i) => `${t.name} <b>${Game.crystalTierCount(i + 1)}</b>`).join('　');
    document.getElementById('alchemistMat').innerHTML = matTxt;
    p.querySelectorAll('.ftab').forEach(b => b.classList.toggle('on', b.dataset.atab === this.alchemistTab));

    const all = this._alchemistItems();
    const list = this.alchemistTab === 'decompose' ? all : all.filter(x => {
      if (this.alchemistTab === 'setcraft') return setCraftTargets(x.item).length > 0;
      const r = x.item.rarity;
      return r === 'common' || r === 'magic' || r === 'rare';
    });
    if (!list.some(x => x.ref === this.alchemistRef)) this.alchemistRef = list.length ? list[0].ref : null;
    const listEl = document.getElementById('alchemistList');
    listEl.innerHTML = list.length ? list.map(x => {
      const it = x.item, r = RARITY[it.rarity];
      return `<div class="fitem ${x.ref === this.alchemistRef ? 'sel' : ''}" data-aref="${x.ref}">
        <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(it)}</span>
        <div style="min-width:0;flex:1">
          <div class="fn" style="color:${r.color}">${it.name}</div>
          <div class="fs">${r.name} · ilv${it.ilvl} · ${x.where}</div>
        </div></div>`;
    }).join('') : '<div class="fempty">没有符合条件的装备。</div>';

    const item = this.itemFromRef(this.alchemistRef);
    const main = document.getElementById('alchemistMain');
    if (!item) {
      main.innerHTML = '<div class="fempty">从左侧选一件装备。</div>';
      return;
    }
    const r = RARITY[item.rarity];
    let h = `<div class="fhead">
      <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(item)}</span>
      <div style="min-width:0">
        <div class="fname" style="color:${r.color}">${item.name}</div>
        <div class="fsub">${r.name} · ilv${item.ilvl} · ${SLOT_NAME[item.slot] || item.kind}</div>
      </div></div>`;
    if (this.alchemistTab === 'decompose') {
      const y = Game.previewDecompose(item);
      h += `<div class="hintline">分解后可获得：${y ? y.text : '无'}</div>`;
      h += `<div style="margin-top:10px"><button class="btn primary" data-decompose="1">确认分解</button></div>`;
    } else if (this.alchemistTab === 'setcraft') {
      const targets = setCraftTargets(item);
      if (!targets.length) {
        h += `<div class="hintline">这件装备无法打造成套装（传世装备与已有套装不行）。</div>`;
      } else {
        h += `<div class="frune-label">选择目标套装 · 部位自动对应该装备所在部位</div>`;
        for (const st of targets) {
          const owned = (Game.state.setCount && Game.state.setCount[st.id]) || 0;
          const on = this.alchemistSetId === st.id;
          h += `<div class="fword ${on ? 'sel' : ''}" data-aset="${st.id}"
            style="border-color:${on ? st.color : st.color + '44'};cursor:pointer;${on ? 'box-shadow:0 0 12px ' + st.color + '55' : ''}">
            <div class="fwn" style="color:${st.color}">${st.name}${on ? ' · 已选中' : ''}</div>
            <div class="fws">${st.bonuses.map(b => `${b.need}件：${b.text}`).join('；')}</div>
            <div class="fwd">${st.pieces[st.slots.indexOf(item.slot)] || ''} · 当前已集 ${owned} 件${st.cls ? ' · 限' + CLASSES[st.cls].name : ' · 全职业'}</div>
          </div>`;
        }
        const cost = setCraftCost(item);
        const costTxt = cost.crystal.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、');
        const can = this.alchemistSetId && cost.crystal.every((n, i) => Game.crystalTierCount(i + 1) >= n) && Game.state.gold >= cost.gold;
        h += `<div class="hintline" style="margin-top:10px">打造费用：${costTxt} + ${cost.gold} 金币</div>`;
        h += `<div class="hintline">原有词缀、孔位与已镶符文全部保留；基底按套装档位重算，词缀不足 3 条会自动补足。</div>`;
        h += `<div style="margin-top:10px"><button class="btn primary" data-setscraft="1" ${can ? '' : 'disabled'}>${this.alchemistSetId ? '打造为 ' + SETS[this.alchemistSetId].name + '「' + (SETS[this.alchemistSetId].pieces[SETS[this.alchemistSetId].slots.indexOf(item.slot)] || '') + '」' : '先选择目标套装'}</button></div>`;
      }
    } else {
      const chain = ['common', 'magic', 'rare', 'legendary'];
      const idx = chain.indexOf(item.rarity);
      if (idx >= 0 && idx < chain.length - 1) {
        const target = chain[idx + 1];
        const costs = { common: [10, 0, 0, 0], magic: [0, 15, 0, 0], rare: [0, 0, 25, 0] };
        const cost = costs[item.rarity];
        const can = cost.every((n, i) => Game.crystalTierCount(i + 1) >= n);
        const costTxt = cost.map((n, i) => n ? n + CRYSTAL_TIERS[i].name : '').filter(Boolean).join('、');
        h += `<div class="hintline">升级至 <b style="color:${RARITY[target].color}">${RARITY[target].name}</b> 需要：${costTxt}</div>`;
        h += `<div style="margin-top:10px"><button class="btn primary" data-upgrade="1" ${can ? '' : 'disabled'}>确认升级</button></div>`;
      } else {
        h += `<div class="hintline">该装备已是最高品质，无法继续升级。</div>`;
      }
    }
    main.innerHTML = h;
  },

  /* ---------------- 行囊扩容（v1.4.0） ----------------
   * 做成行囊内的内联条（同一键分解条），点上方的「扩容」展开、再点收起。
   * 容量、档位、消耗都从 Game.bagUpgradeInfo() 取，与 Game.upgradeBag() 同源。 */
  renderBagUpgradeBar() {
    const bar = document.getElementById('invUpBar');
    if (!bar) return;
    if (!this.invUpOpen) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    const info = Game.bagUpgradeInfo();
    const gold = Math.max(0, Math.round(Game.state.gold || 0));
    const dots = [];
    for (let i = 0; i < info.maxTier; i++) {
      dots.push(`<span class="${i < info.tier ? 'done' : (i === info.tier && info.next ? 'now' : '')}"></span>`);
    }
    let h;
    if (info.next) {
      const costs = info.cost.map(c => `<span class="cst"><span class="nm" style="color:${c.color}">${c.name}</span>
          <span class="hv ${c.have >= c.need ? '' : 'bad'}"><b>${c.have}</b><u>/${c.need}</u></span></span>`).join('');
      h = `<div class="urow">
          <span class="utitle">乾坤囊</span>
          <span class="ucap"><b>${info.cap}</b><em>→</em><b class="nx">${info.next.cap}</b>格</span>
          <span class="udots">${dots.join('')}</span>
          <span class="utier">第 ${info.tier + 1}/${info.maxTier} 次</span>
        </div>
        <div class="urow">
          <span class="ucosts">${costs}<span class="cst"><span class="nm" style="color:#e0c070">铜钱</span>
            <span class="hv ${gold >= info.next.gold ? '' : 'bad'}"><b>${gold}</b><u>/${info.next.gold}</u></span></span></span>
          <button class="ugo" data-upgo ${info.can ? '' : 'disabled'}>扩 容</button>
        </div>
        <div class="uhint">扩容永久生效、随存档保存；行囊格位不占负重。${info.can ? '' : '还差：' + info.lack.join('、') + '。'}</div>`;
    } else {
      h = `<div class="urow">
          <span class="utitle">乾坤囊</span>
          <span class="ucap"><b class="nx">${info.cap}</b>格</span>
          <span class="udots">${dots.join('')}</span>
          <span class="utier">已达上限 · 共 ${info.maxTier} 次</span>
        </div>
        <div class="uhint">行囊已扩至 ${info.cap} 格，再多就撑破了。</div>`;
    }
    bar.style.display = '';
    bar.innerHTML = h;
  },

  /* [S3] 筛选出售 */
  openSellFilter() {    const rarities = ['common', 'magic', 'rare'];
    const names = { common: '凡品', magic: '法器', rare: '珍宝' };
    const colors = { common: RARITY.common.color, magic: RARITY.magic.color, rare: RARITY.rare.color };
    UI.showDialog('铁匠·石九', '要出手哪些货色？带符文的装备会先取下符文再卖。', [
      ...rarities.map(r => ({
        label: `出售全部 ${names[r]}`,
        action: () => {
          Game.sellJunk([r]);
          UI.closeAll();
        }
      })),
      { label: '出售凡品+法器', action: () => { Game.sellJunk(['common', 'magic']); UI.closeAll(); } },
      { label: '取消', action: () => UI.closeAll() }
    ]);
  },

  /* ---------------- 消息 ---------------- */
  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.textContent = text;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .5s, transform .5s'; t.style.opacity = 0; t.style.transform = 'translateY(-8px)'; }, 1900);
    setTimeout(() => t.remove(), 2500);
  },

  log(text, cls = '') {
    const box = document.getElementById('log');
    const d = document.createElement('div');
    d.className = cls; d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.transition = 'opacity 1s'; d.style.opacity = 0; }, 6000);
    setTimeout(() => d.remove(), 7200);
  },

  /* 键位提示已收进「说明」页，这里保留接口但不再依赖 HUD 元素存在 */
  setHelp(html) {
    const el = document.getElementById('help');
    if (el) el.innerHTML = html;
  },

  /* 菜单是否开着：换栏键（Shift）要据此避让 Shift+左键出售 / 洗点 */
  menuIsOpen() {
    const p = document.getElementById('menuPanel');
    return !!(p && p.classList.contains('open'));
  },

  showDeath(tip) {
    document.getElementById('deathTip').textContent = tip || '你的道，还未走完。';
    document.getElementById('death').style.display = 'flex';
  },
  hideDeath() { document.getElementById('death').style.display = 'none'; },

  hideStart() { document.getElementById('start').style.display = 'none'; document.body.classList.remove('in-menu'); },

  /* ---------------- 小地图 ---------------- */
  drawMinimap() {
    const s = Game.state;
    if (!s) return;
    const cv = document.getElementById('minimap');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, R = W / 2;
    const map = MAPS[s.mapId];
    const scale = R / (map.size * 0.56);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.clip();
    // 底
    const mapCol = {
      village: ['#3a3424', '#14120c'], forest: ['#2c3d24', '#0e140c'],
      swamp: ['#35251f', '#120c0a'], mine: ['#2c2c34', '#0d0d11'],
      abyss: ['#241a30', '#0b0810'], heaven: ['#3a4658', '#101620']
    }[s.mapId] || ['#2a2a24', '#0a0a0a'];
    const grd = g.createRadialGradient(R, R, 10, R, R, R);
    grd.addColorStop(0, mapCol[0]);
    grd.addColorStop(1, mapCol[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    const px = s.playerPos.x, pz = s.playerPos.z;
    const tx = x => R + (x - px) * scale;
    const tz = z => R + (z - pz) * scale;

    // 网格
    g.strokeStyle = 'rgba(216,178,90,.06)'; g.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      g.beginPath(); g.moveTo(R + i * 40, 0); g.lineTo(R + i * 40, H); g.stroke();
      g.beginPath(); g.moveTo(0, R + i * 40); g.lineTo(W, R + i * 40); g.stroke();
    }

    // 传送阵
    const p = map.portal;
    if (p) {
      g.strokeStyle = '#6aa8ff'; g.lineWidth = 2;
      g.beginPath(); g.arc(tx(p.x), tz(p.z), 7, 0, 7); g.stroke();
    }
    // NPC
    if (map.npcs) {
      for (const id of map.npcs) {
        const n = Game.npcs[id];
        if (!n) continue;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(tx(n.pos.x), tz(n.pos.z), 4, 0, 7); g.fill();
      }
    }
    // 敌人
    for (const e of Game.enemies) {
      if (e.dead) continue;
      g.fillStyle = e.boss ? '#ff4a3a' : (e.elite ? '#ff9a3c' : '#c85a4a');
      const r = e.boss ? 6 : 2.6;
      g.beginPath(); g.arc(tx(e.pos.x), tz(e.pos.z), r, 0, 7); g.fill();
    }
    // 掉落
    for (const l of Game.loot) {
      if (l.taken) continue;
      g.fillStyle = l.item ? RARITY[l.item.rarity].color : '#e8c878';
      g.fillRect(tx(l.pos.x) - 1.5, tz(l.pos.z) - 1.5, 3, 3);
    }
    // 玩家
    const ang = Math.atan2(Game.playerFace.x, Game.playerFace.z);
    g.save();
    g.translate(R, R); g.rotate(ang);
    g.fillStyle = '#f0e0b8';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    g.restore();

    // 边框
    g.strokeStyle = 'rgba(216,178,90,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1;
    g.beginPath(); g.arc(R, R, R - 6, 0, 7); g.stroke();
  }
};
