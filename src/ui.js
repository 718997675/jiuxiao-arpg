/* ============================================================
 * UI 层：HUD / 背包纸娃娃 / 提示框 / 任务 / 对话 / 商店 / 传送 / 小地图
 * ============================================================ */

/* [v1.8.5] 根基 → 进阶属性的显示名与格式。
 * 百分比类属性每点只有零点几，必须带 % 和小数，否则会显示成「+0」。 */
const DERIV_NAME = {
  atk: '攻击力', hpMax: '生命上限', mpMax: '灵力上限', def: '护甲',
  crit: '暴击率', critDmg: '暴击伤害', aspd: '攻击速度', moveSpd: '移速',
  cdr: '冷却缩减', mpReg: '回灵/秒', hpRegen: '回血/秒'
};
const DERIV_PCT = { crit: 1, critDmg: 1, aspd: 1, cdr: 1 };
/* 攻击力按职业叫法：刀客「攻击力」、术士 / 符师「术法攻击」 */
function dName(k) {
  if (k === 'atk' && typeof Game !== 'undefined' && Game.state) {
    const c = CLASSES[Game.state.cls];
    if (c && c.atkName) return c.atkName;
  }
  return DERIV_NAME[k] || k;
}
function dFmt(k, v) {
  if (!isFinite(v)) return '0';
  if (DERIV_PCT[k]) return (Math.round(v * 100) / 100) + '%';
  /* 移速每点只有 0.015：按两位小数会显示成「+0.02」，看着像随手写的数 */
  const dp = Math.abs(v) < 0.1 ? 3 : 2;
  return (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toString();
}

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

    /* ---------- [M6] 仓库（储物箱） ----------
     * 静态按钮只绑一次（容器不随渲染重建），动态列表一律事件委托。
     * 物品格子本身不在这里绑：走全局的 [data-ref] 那条路，
     * 前缀 sbag: / stash: 各自分流到存入 / 取回。 */
    const stSort = document.getElementById('stashSortBtn');
    if (stSort) stSort.addEventListener('click', () => {
      const r = Game.stashSort();
      SFX.ui();
      if (r && r.ok) this.toast(`整理完毕，共 ${r.count} 件`);
      this.renderStash();
    });
    const stUp = document.getElementById('stashUpBtn');
    if (stUp) stUp.addEventListener('click', () => {
      this.stashUpOpen = !this.stashUpOpen;
      SFX.ui();
      this.renderStash();
    });
    const stPutAll = document.getElementById('stashPutAllBtn');
    if (stPutAll) stPutAll.addEventListener('click', () => {
      const s = Game.state;
      if (!s || !s.inventory.length) { this.toast('行囊里没有可存的东西'); return; }
      if (Game.stashFree() <= 0) { this.toast(`仓库已满（${Game.stashCap()} 格），先扩容`); return; }
      /* 从后往前存：splice 会改变下标，正序存会漏掉后面的。
       * 只存到仓库满为止，不静默丢弃。 */
      let n = 0;
      for (let i = s.inventory.length - 1; i >= 0 && Game.stashFree() > 0; i--) {
        if (Game.stashPut(i).ok) n++;
      }
      SFX.ui();
      this.toast(n ? `${n} 件已存入仓库` : '仓库已满，一件也没存进去');
      this.renderStash();
    });
    const stCats = document.getElementById('stashCats');
    if (stCats) stCats.addEventListener('click', e => {
      const b = e.target.closest('[data-scat]');
      if (!b) return;
      this.stashFilter.cat = b.dataset.scat;
      SFX.ui();
      this.renderStash();
    });
    const stFit = document.getElementById('stashOnlyFit');
    if (stFit) stFit.addEventListener('click', () => {
      this.stashFilter.fit = !this.stashFilter.fit;
      SFX.ui();
      this.renderStash();
    });
    const stSearch = document.getElementById('stashSearch');
    if (stSearch) stSearch.addEventListener('input', () => {
      this.stashFilter.q = stSearch.value || '';
      this.renderStash();
      /* 重绘会把焦点留在原 input 上（容器没换），但光标位置会回到末尾，
       * 打字时感觉不到差异；不重新 focus 是为了避免手机上弹出键盘又收起。 */
    });
    const stUpBar = document.getElementById('stashUpBar');
    if (stUpBar) stUpBar.addEventListener('click', e => {
      if (!e.target.closest('[data-stashupgo]')) return;
      const r = Game.upgradeStash();
      if (r.ok) { SFX.ui(); this.stashUpOpen = false; this.toast(r.msg); }
      else this.toast(r.msg || '扩容失败');
      this.renderStash();
    });
    const stSets = document.getElementById('stashSets');
    if (stSets) stSets.addEventListener('click', e => {
      const inB = e.target.closest('[data-setin]');
      const outB = e.target.closest('[data-setout]');
      if (inB) {
        const r = Game.setRegister(inB.dataset.setin);
        if (r.ok) SFX.ui();
        this.toast(r.msg || (r.ok ? '已登记' : '登记失败'));
        this.renderStash();
      } else if (outB) {
        const r = Game.setWithdraw(outB.dataset.setout);
        if (r.ok) SFX.ui();
        this.toast(r.msg || (r.ok ? '已取出' : '取出失败'));
        this.renderStash();
      }
    });

    /* 一键分解（v1.1.4）：展开确认条 → 预估产出 → 确认/取消 */
    const dj = document.getElementById('invDecomposeBtn');
    if (dj) dj.addEventListener('click', () => {
      this.invJunkOpen = !this.invJunkOpen;
      SFX.ui();
      this.renderInventory();
    });
    const jb = document.getElementById('invJunkBar');
    if (jb) jb.addEventListener('click', e => {
      const t = e.target.closest('[data-junktier]');
      if (t) {
        this.invJunkTier = t.dataset.junktier;
        SFX.ui();
        this.renderInventory();
        return;
      }
      if (e.target.closest('[data-junkok]')) {
        const r = Game.decomposeJunk(this.invJunkTier);
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
      /* [v1.8.5] 根基属性：悬停看「每点加什么 / 当前贡献多少」 */
      const at = e.target.closest('[data-attr]');
      if (at) { this.showAttrTip(at, e); return; }
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
      /* 背包里的物品才做「与已穿装备对比」；已穿的那件自己跟自己比没有意义。
       * [M6] 仓库里的也对比 —— 从仓库取回之前正是最该看差值的时候。 */
      const kind = el.dataset.ref.split(':')[0];
      const isInv = kind === 'inv';
      let hint;
      if (kind === 'sbag') hint = '左键存入仓库';
      else if (kind === 'stash') hint = '左键取回行囊';
      else hint = isInv ? '左键装备 / Shift+左键出售' : '左键卸下';
      this.tooltipEl.innerHTML = itemTooltip(item, {
        hint,
        compareTo: (isInv || kind === 'sbag' || kind === 'stash') ? this.equippedFor(item) : null
      });
      this.tooltipEl.style.display = 'block';
      this.moveTooltip(e);
    });
    document.addEventListener('mousemove', e => { if (!IS_TOUCH && this.tooltipEl.style.display === 'block') this.moveTooltip(e); });
    document.addEventListener('mouseout', e => {
      if (IS_TOUCH) return;
      const el = e.target.closest('[data-ref],[data-mti],[data-attr]');
      if (el) { this.tooltipEl.style.display = 'none'; this.hoverRef = null; }
    });
    document.addEventListener('click', e => {
      /* 草稿的确认 / 取消 */
      const dc = e.target.closest('[data-dcommit]');
      if (dc) {
        e.preventDefault();
        const kind = dc.dataset.dcommit;
        this.snapCommit(kind);
        this.repaintDraft(kind);
        return;
      }
      const dk = e.target.closest('[data-dclear]');
      if (dk) {
        e.preventDefault();
        const kind = dk.dataset.dclear;
        const had = this.snapDirty(kind);
        this.snapRevert(kind);
        this.repaintDraft(kind);
        if (had) this.toast('已取消，回到改动前');
        return;
      }
      /* 加点按钮（PC 与触屏同一条路）：改动立即反映到面板，但要「确认」才写存档 */
      const ab = e.target.closest('[data-alloc]');
      if (ab) {
        e.preventDefault();
        const key = ab.dataset.alloc;
        const n = parseInt(ab.dataset.n || '1', 10) || 1;
        if (n > 0 && Game.attrPoints() <= 0) { this.toast('没有可分配的根基点了'); return; }
        if (n <= 0 && !(Game.attrState()[key] > 0)) return;
        this.snapTake('attr');
        const ok = n > 0 ? Game.allocAttr(key, n, true) : Game.refundAttr(key, 1, true);
        if (!ok) { if (!this.snapDiff('attr').length) delete this.snaps.attr; return; }
        SFX.ui();
        this.repaintDraft('attr');
        return;
      }
      const rs = e.target.closest('[data-respec]');
      if (rs) {
        e.preventDefault();
        /* 洗点前先把草稿清掉：否则洗完点一确认，草稿又把它加回去了 */
        this.draftClear('attr');
        const cost = Game.attrRespecFee(), got = Game.state.gold;
        this.showDialog('洗点', `洗去全部根基加点，退还所有点数，收 ${cost} 金（现有 ${got} 金）。洗点不会影响身上已穿的装备——穿戴需求只在穿戴那一刻校验。`, [
          { label: '洗 点', primary: true, action: () => { Game.resetAttrs(); this.closeAll(); this.openMenu('stat'); } },
          { label: '再想想', action: () => this.closeAll() }
        ]);
        return;
      }
      const el = e.target.closest('[data-ref]');
      if (!el) {
        /* 触屏：点根基看说明（PC 是悬停） */
        const at = e.target.closest('[data-attr]');
        if (at && IS_TOUCH) { e.preventDefault(); this.showAttrTip(at); return; }
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
      } else if (ref.startsWith('sbag:')) {
        /* 仓库面板左列：站着仓库前，点一下想的是「收起来」而不是「穿上」 */
        const r = Game.stashPut(parseInt(ref.split(':')[1]));
        if (!r.ok) this.toast(r.msg);
        else SFX.ui();
        this.renderStash();
      } else if (ref.startsWith('stash:')) {
        const r = Game.stashTake(parseInt(ref.split(':')[1]));
        if (!r.ok) this.toast(r.msg);
        else SFX.ui();
        this.renderStash();
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
        const sp = document.getElementById('skillPanel');
        if (sp && sp.classList.contains('open')) this.closeSkill();
        else if (mp && mp.classList.contains('open')) this.closeMenu();
        else this.closeAll();
      }
    });

    /* 主菜单页签 */
    const mTabs = document.getElementById('menuTabs');
    if (mTabs) mTabs.addEventListener('click', e => {
      const b = e.target.closest('[data-mtab]');
      if (!b || b.dataset.mtab === this.menuTab) return;
      /* 术法树是整屏层，没有可嵌进菜单的 DOM：收起菜单直接开。
       * 记住是从哪一页点进来的 —— 术法里的 ✕ 要能回到那一页，
       * 而不是把整个山海录一起关掉（玩家的实际抱怨）。 */
      if (b.dataset.mtab === 'skill') {
        const back = this.menuTab || 'bag';
        this.closeMenu();
        this.openSkill(back);
        try { SFX.ui(); } catch (err) { }
        return;
      }
      this.menuTab = b.dataset.mtab;
      this.menuMount(this.menuTab);
      try { SFX.ui(); } catch (err) { }
    });

    /* 设置面板：按钮是动态生成的，用事件委托，避免每次重绘都重新挂监听 */
    const setBody = document.getElementById('setBody');
    if (setBody) setBody.addEventListener('click', e => this.onSettingsClick(e));
    /* 音频滑杆：input 事件（拖动过程中就要出声，等 change 太迟）。
     * 只更新数值与增益，不重绘整个面板 —— 重绘会把正在拖的滑杆从手指下抽走。 */
    if (setBody) setBody.addEventListener('input', e => this.onSettingsSlide(e));
  },

  /* ---------------- 设置面板 ---------------- */

  SET_ROWS: [
    { head: '画面' },
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
      opts: [['0', '关'], ['1', '开']] },
    /* 全屏不是「存下来的设置」——它由浏览器掌握（Esc / 手势都能退出），
     * 所以只做动作行：点「开」请求全屏，高亮读 document.fullscreenElement。 */
    { k: 'fullscreen', label: '全屏', act: 'fs',
      opts: [['0', '关'], ['1', '开']] },
    /* 镜头分区（v2.x）：视角预设决定机位高度/俯角/FOV/是否第一人称，
     * 震动决定打击震屏的倍率。两项都与画质档位无关，互不干扰。 */
    { head: '镜头' },
    { k: 'view', label: '视角',
      opts: [['torch', '火炬之光'], ['classic', '默认俯视'], ['diablo', '暗黑4'], ['fp', '第一人称']] },
    { k: 'shake', label: '镜头震动',
      opts: [['off', '关'], ['weak', '弱'], ['std', '标准'], ['strong', '强']] },
    /* 音频分区：四条滑杆 + 静音。mute 用 bool 标记，值是 Boolean 而不是字符串 */
    { head: '音频' },
    { k: 'mute', label: '静音', bool: true,
      opts: [['0', '关'], ['1', '开']] },
    { k: 'volMaster', label: '主音量', type: 'range' },
    { k: 'volSfx', label: '音效', type: 'range' },
    { k: 'volAmb', label: '环境', type: 'range' },
    { k: 'volMusic', label: '音乐', type: 'range' }
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
    /* [P3] 变体全部走 form 通道（36 技能 × 3 条）。计数按数据表来：
     * varN = 变体总数；mechN = 其中有 beh（改打法）的条数 ——
     * 旧 variants 那一层已经不再参与结算，说明页不能再按它数 */
    let varN = 0, mechN = 0;
    if (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.branches) {
      for (const sid in SKILL_TREE.branches) {
        const b = (typeof skillBranches === 'function') ? skillBranches(sid) : null;
        if (!b) continue;
        varN += b.form.length;
        b.form.forEach(o => { if (o.beh && Object.keys(o.beh).length) mechN++; });
      }
    } else {
      varN = skillIds.reduce((n, id) => n + len(SKILLS[id].variants), 0);
    }
    const talentN = cnt(TALENT_NODES);
    const synN = (typeof TALENTS !== 'undefined' && TALENTS.synergy) ? len(TALENTS.synergy[0].nodes) : 0;
    const eliteN = cnt(ELITE_AFFIXES);
    const mobN = cnt(MONSTERS);
    const runeWordN = len(RUNE_WORDS);
    const tierN = len(BASE_TIER_NAME);
    const rarList = Object.keys(RARITY).map(k => RARITY[k]);
    const diffList = Object.keys(DIFFS).map(d => DIFFS[d]);
    /* [v1.10.0] 平衡旋钮：掉落池 / 暴击起点 / 经验曲线全部现读 BALANCE，
     * 调完那张表，说明页这一节自己跟着变 */
    const BAL = (typeof BALANCE !== 'undefined') ? BALANCE : null;
    const poolTxt = pool => {
      const t = pool.reduce((s, p) => s + p[1], 0);
      return pool.filter(p => p[1] > 0)
        .map(p => `${(RARITY[p[0]] || {}).name || p[0]} ${Math.round(p[1] / t * 100)}%`)
        .join(' / ');
    };
    const pctOf = v => Math.round((v || 0) * 100) + '%';
    const barSlots = (typeof SKILL_BAR_SLOTS === 'number') ? SKILL_BAR_SLOTS : 5;
    const barKeys = (typeof SKILL_BAR_KEYS !== 'undefined') ? SKILL_BAR_KEYS : ['左键', '1', '2', '3', '4'];
    /* 动作条键位：① 号位是左键，②~⑤ 是 1~4（[P1] 从 8 格收敛而来） */
    const barKeyText = barKeys.slice(1).join(' / ');
    const barSets = (typeof SKILL_BAR_SETS === 'number') ? SKILL_BAR_SETS : 2;
    const lvMax = (typeof SKILL_LV_MAX === 'number') ? SKILL_LV_MAX : 10;

    /* 每一节先按原样拼成 html，末尾再从 <h4> 里反解出「短名」给左侧页签用
     * —— 这样新增一节只要写一次 sec(...)，不用再维护一份页签名列表。 */
    const H = [];

    /* ---------------- 1. 操作 ---------------- */
    H.push(sec('一 · 怎么玩', '键位全在这里，游戏画面上不再贴提示', [
      row('移动 / 视角', kcs([['WASD', '移动'], ['鼠标', '瞄准'], ['Q / E', '转视角'], ['滚轮', '缩放'], ['空格', '翻滚']])),
      row('视角', `设置（${K('O')}）→ 镜头 → <b>视角</b>可切四档：<b>火炬之光</b>（默认，机位更高更远、跟随更硬、出手不推镜）、` +
        `<b>默认俯视</b>（老版机位）、<b>暗黑4</b>（接近俯视）、<b>第一人称</b>（点画面锁鼠标、移动鼠标转身、Esc 解锁）。` +
        `同一页的<b>镜头震动</b>可关掉打击震屏，关掉后画面完全不晃`),
      row('战斗', kcs([['左键', '① 号位（基础攻击，按住连发）'], [barKeyText, '②③④⑤ 号位'], [SKILL_BAR_SET_LABEL, '切换快捷栏'], ['Z', '红药'], ['X', '蓝药'], ['9', '传送石']])),
      row('交互', kcs([['F', '交互 / 拾取'], ['Tab', '开关菜单'], ['Esc', '关闭面板']])),
      row('面板', kcs([['I', '行囊'], ['C', '道途'], ['T', '天赋'], ['K', '术法'], ['L', '山海志'], ['B', '异兽志'], ['R', '炼器台'], ['P', '存档'], ['O', '设置'], ['H', '说明']])),
      row('手机', kcs([['左半屏', '拖动 = 摇杆'], ['右下宫格', `②~⑤ 四个技能键`], ['空白处', '拖动转视角'], ['双指', '捏合缩放']])),
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
    /* 根基表：按职业把 weights 翻成一句话。攻击力用各职业自己的叫法
     * （刀客「攻击力」/ 术法系「术法攻击」），所以这里不能直接用 dName。 */
    const dn = (c, dk) => dk === 'atk' ? (c.atkName || '攻击力') : (DERIV_NAME[dk] || dk);
    const attrLine = k => {
      const c = CLASSES[k];
      return ATTR_KEYS.map(ak => {
        const w = c.weights[ak] || {};
        const eff = Object.keys(w).map(dk => `${dn(c, dk)} +${dFmt(dk, w[dk])}`).join('、');
        return `<b style="color:#e8d8b0">${ATTR_NAME[ak]}</b> ${eff || '无'}`;
      }).join('　');
    };
    H.push(sec('二 · 角色属性', '装备 / 天赋 / 加点最终都汇到这一张面板', [
      row('根基', `四项：${ATTR_KEYS.map(k => ATTR_NAME[k]).join(' / ')}。来源共四条线：职业基础 + 等级成长 + 装备词条 + <b>手动加点</b>；面板上的数值是四条线之和`),
      row('加点', `每升 1 级得 <b>${ATTR_POINTS_PER_LEVEL} 点</b>（1 级另给 ${ATTR_START_POINTS} 点），按 ${K('C')} 打开「道途」点 +1 / +5。加的点和天赋、技能一样先进「<b>未确认</b>」条，点<b>确认</b>才真正生效，不消耗金币`),
      row('改动未确认', `根基 / 天赋 / 技能三处共用同一套确认规则：改动当场在面板上生效（数值、伤害预览、点数余额同步变化），但<b>不写入存档</b>，关闭页面即作废。加错可按 <b>−1</b> 撤回单次加点，按<b>取消</b>整批回到修改前。洗点 / 重置天赋会将未确认的草稿一并作废`),
      row('每点收益', `同一个字在不同职业身上不是一回事 —— 刀客的力量加攻击，术士的力量只撑甲，术士的灵力才是攻击。每点具体加什么：`),
      /* 职业行按注册表生成：加新职业后说明页自动多出一行 */
      ...((typeof classPackIds === 'function') ? classPackIds() : ['warrior', 'mage', 'taoist'])
        .filter(k => CLASSES[k] && CLASSES[k].weights)
        .map(k => row(CLASSES[k].title || CLASSES[k].name || k, attrLine(k))),
      row('洗点', `随时可洗，价 ${attrRespecCost(1)} 金起（随境界上涨，约为境界 ×60）。<b>洗点不会让身上的装备脱落</b>：穿戴需求只在穿戴那一刻校验`),
      row('伤害乘区', `攻击力（决定所有伤害基数）× 暴击率 × 暴击伤害 × 攻速 × 元素增伤 × 技能增伤 × 对精英/首领增伤 —— 各乘区独立相乘，堆单一乘区收益会衰减`),
      /* [v1.10.0] 暴击起点与经验曲线都是 BALANCE 里的旋钮，别再写死 */
      row('暴击起点', BAL
        ? `裸装 Lv1 为 <b>暴击率 ${BAL.crit.base}% / 暴击伤害 ${BAL.crit.dmg}%</b>` +
          `（暴击率上限 <b>100%</b>，暴击伤害不设上限）。往上靠三处：敏捷（暴击率）、力量（刀客爆伤）、装备词条与天赋`
        : '裸装 Lv1 的暴击率与暴击伤害都很低，主要靠装备与加点堆'),
      row('上限口径', `只有两项封顶：<b>暴击率 100%</b>、<b>冷却缩减 100%</b>` +
        `（满冷却时技能仍有 0.5 秒硬下限）。闪避、减伤、各类增伤、爆伤、吸血等一律不设上限`),
      row('境界经验', BAL && typeof xpToNext === 'function'
        ? `升到下一级需要 <b>${BAL.xp.base} × 等级^${BAL.xp.pow}</b> 经验（Lv1 → ${xpToNext(1)}，`
          + `Lv20 → ${xpToNext(20)}，Lv38 → ${xpToNext(38)}）。怪物经验按自身等级成长，`
          + `越级打高级图的怪，升级明显更快 —— 但也更容易死`
        : '升级所需经验随等级快速上升，越级打怪收益更高'),
      row('防御', `护甲、闪避、格挡、伤害减免、各元素抗性（上限 75%）、濒死免疫（致死时留 1 血，60 秒冷却）。护甲主要来自体质与装备`),
      row('资源', `${((typeof classPackList === 'function') ? classPackList() : [])
        .map(p => (p.meta.title || p.meta.name) + ' 用' + p.meta.res).join('、')}；消耗降低 / 回复速度 / 击杀回蓝都会影响技能循环。灵力上限与回灵来自灵力`),
      row('看来源', `悬停（手机点一下）任意一项根基，会列出「每 1 点加什么 / 这一项当前带来多少 / 基础·装备·加点各占多少」`)
    ]));

    /* ---------------- 3. 装备 ---------------- */
    /* 一键分解的档位文案从数据链算：Game.JUNK_TIERS 改动后这一页自己跟着变 */
    const junkTierTxt = ((typeof Game !== 'undefined' && Array.isArray(Game.JUNK_TIERS)) ? Game.JUNK_TIERS : [])
      .map(k => (RARITY[k] || {}).name || k).join(' → ') || '凡品 → 灵品 → 玄品 → 神品';
    H.push(sec('三 · 装备', `${slotN} 个槽位`, [
      row('槽位', `${slotN} 个：${slotNames.join(' / ')}`),
      row('基底阶', `${tierN} 阶：${BASE_TIER_NAME.join(' → ')}。同名字的装备阶数越高，基础数值越高。传世不在八阶体系内（见第六节）`),
      row('物品等级', `每件装备有 ilvl，越高则词缀数值上限越高。怪物等级决定掉落 ilvl，首领额外 +2`),
      row('穿戴需求', `两处门槛：<b>境界等级</b> + <b>根基属性</b>（例：需力量 85 / 体质 75）。需求按<b>职业</b>成长曲线折算 —— 同一件胸甲，刀客为「体质 55」、术士为「体质 43」；武器与饰品额外要求主属性。品质越高要求越严：凡品几乎无门槛，神品最严；<b>传世与神品基本持平</b>，仅多一条敏捷印记，该值低于自然成长上限，不额外占用加点`),
      row('穿不上', `行囊里不满足需求的格子会压暗、左上角盖一枚「需」章；悬停可看差在哪一项、当前差多少。补上加点或换掉就恢复常色`),
      row('校验时机', `只在<b>穿戴那一刻</b>校验。已经穿在身上的装备，之后洗点或换装备导致属性下降也不会脱落 —— 免得洗一次点把全身扒光`),
      row('双手 / 双持', `武器分单手与双手：双手占用副手格；副手只能是盾、副手武器或法器`),
      row('行囊与一键分解', `行囊按格收纳，容量可在行囊页顶部「扩容」逐级提升；装不下时格子区自行滚动。一键分解<b>按品质阈值</b>选档（${junkTierTxt}），选到哪一档就把该档及以下的装备一起分，玄晶产出随选档实时预估。<b>身上穿着的、套装、传世一律不参与</b>；带镶嵌的装备会先自动卸下符文并全额返还`),
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
      row('三条线', `<b>基底阶</b>（${tierN} 阶，决定基础数值，见第三节）· <b>品质</b>（决定词条条数与边框颜色）· <b>类型</b>（普通 / 套装 / 传世）为三个独立维度。一件装备同时具备一个阶、一个品质、一个类型 —— 例：同为「${BASE_TIER_NAME[1]}」基底的长剑，可为凡品（0 词条），也可为玄品（${RARITY.rare.affixes + RARITY.rare.fixed} 词条）。阶决定数值，品质决定词条`),
      row('品质（可升品）', `<div class="hp-tags kcs">${qualityChain.map(r =>
        `<span class="hp-tag q" style="color:${r.color};border-color:${r.color}55" title="掉落权重 ${r.weight}">${r.name}<i>${r.affixes + r.fixed} 词条</i></span>`).join('')}</div>`),
      /* [v1.10.0] 掉落按层级分池：小怪的池里根本没有神品以上，
       * 「小怪掉橙」从机制上不可能，不是靠低概率碰运气 */
      row('掉落来源', BAL
        ? `<b>按怪物层级分池，低层级池里没有高档品质</b>：<br>`
          + `小怪（掉率 ${pctOf(BAL.drop.normal.chance)}）：${poolTxt(BAL.drop.normal.pool)}<br>`
          + `精英（掉率 ${pctOf(BAL.drop.elite.chance)}）：${poolTxt(BAL.drop.elite.pool)}<br>`
          + `首领（必掉 ${BAL.drop.boss.count} 件）：${poolTxt(BAL.drop.boss.pool)}<br>`
          + `<span class="hp-n">传世只出在首领身上；「掉落数量」词条只在池内加权，不会把池外品质抽出来</span>`
        : '小怪不掉神品以上，传世只出在首领身上'),
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
      row('特性唯一', `${traitN} 条特性，每条仅属于一件传世，<b>全表不重复</b>。强化某件装备只为其新增专属特性，不复用其他装备的特性`),
      row('属性类特性', `直接进面板，看到多少就是多少：饮血、金刚、巨灵、疾风这类`),      row('触发类特性', `满足条件自动触发：霜噬减速、焚烬爆炸、雷罚连锁、回响不进冷却、血怒击杀加速`),
      row('机制类特性', `独立实现的一次性机制：涅槃复活、收魂回血、狂战、裂魂暴击爆炸`),
      row('技能效果', `每件都带一条，二选一：<b>授予新技能</b>（${grantN} 件，跨职业秘技，术法面板里单独一组「秘技」，脱下即失去）或<b>强化已有技能</b>（${upN} 件，指定技能 +伤害 / -冷却 / +范围，'通玄' 则是全部技能）`),
      row('与套装区别', `套装按装备件数逐级激活，单件收益较低；传世单件即为完整形态，不计入套装件数，也不触发套装效果`),
      row('穿戴', `比同等级神品只多一格（约 0~10 点），另加一条敏捷印记 —— 它低于自然成长，所以永远显示为已满足，不额外吃加点`),
      row('怎么来', `只在<b>首领</b>身上掉（小怪与精英的掉落池里没有传世），且首领等级达到该件的 ilvl 后才会进入池子；同一件可以重复掉落，每次数值重新 roll`),
      tags(uniList.map(u => `${u.name}${u.cls ? '（' + CLASSES[u.cls].name + '）' : ''}`), 'uni')
    ]));

    /* ---------------- 7. 术法与变体 ---------------- */
    /* [P2] 被动 / 关键被动：条数与关键数实时统计（数据表说话） */
    const pasN = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.passives) ? Object.keys(SKILL_TREE.passives).length : 0;
    const pasKeyN = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.passives)
      ? Object.keys(SKILL_TREE.passives).filter(k => SKILL_TREE.passives[k].key).length : 0;
    /* [P1c] 关键被动的软前置阈值：从数据表取，别在文案里写死 5 */
    const softPts = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.lineMeta
      && SKILL_TREE.lineMeta.softNeedPts) || 5;
    /* 三线并行的线名也按数据取（当前职业优先，没开局就看刀客的） */
    const lineNames = (() => {
      if (typeof SKILL_TREE === 'undefined' || !SKILL_TREE.layout) return [];
      const cls = (typeof Game !== 'undefined' && Game.state && Game.state.cls) || 'warrior';
      const lay = SKILL_TREE.layout[cls] || SKILL_TREE.layout.warrior || [];
      return lay.map(t => t.name);
    })();
    /* 普通被动的投点上限取数据表里的最大值（关键被动固定 1 点） */
    let pasMax = 1;
    if (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.passives) {
      for (const pid in SKILL_TREE.passives) {
        const p = SKILL_TREE.passives[pid];
        if (!p.key && (p.max || 0) > pasMax) pasMax = p.max;
      }
    }
    /* [P2b·兽群] 上限按平台分档（桌面 8 / 手机 6），有兽契再 +1 ——
     * 说明页直接读运行时的 allyCap()，别在这里留一个和代码对不上的数字 */
    const allyCapBase = (typeof Game !== 'undefined' && Game && typeof Game.allyCap === 'function')
      ? Game.allyCap()
      : ((typeof ALLY_CAP_BASE === 'number') ? ALLY_CAP_BASE : 8);
    /* [P4] 变体特效与 BD 推荐：条数从数据表算，别在这里写「11 种」「9 套」 */
    const fxStat = (typeof formFxStats === 'function') ? formFxStats() : { styled: 0, total: 0, byKey: {} };
    const fxKinds = Object.keys(fxStat.byKey || {}).filter(k => k !== 'plain' && fxStat.byKey[k] > 0).length;
    const fxNames = Object.keys(fxStat.byKey || {})
      .filter(k => k !== 'plain' && fxStat.byKey[k] > 0 && typeof FORM_FX !== 'undefined' && FORM_FX[k])
      .map(k => FORM_FX[k].name + '（' + fxStat.byKey[k] + '）');
    const bdN = (typeof buildList === 'function') ? buildList().length : 0;
    const bdPerCls = bdN ? Math.round(bdN / Math.max(1, (typeof classPackIds === 'function' ? classPackIds().length : 3))) : 0;
    const respecFeesTxt = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.respecFees)
      ? SKILL_TREE.respecFees.join(' → ') : '800 → 2400 → 6000 → 15000 → 35000';
    /* [P2] 精研 / 取向条数 + 待接清单：全部从数据表算，改了数据页签跟着变 */
    let coreN = 0, pickN = 0, behPendNames = [], pasPendNames = [];
    if (typeof SKILL_TREE !== 'undefined') {
      for (const sid in (SKILL_TREE.branches || {})) {
        const b = (typeof skillBranches === 'function') ? skillBranches(sid) : null;
        if (!b) continue;
        if (b.core) coreN++;
        pickN += b.pick.length;
        if (typeof skillBranchPendingBeh === 'function') {
          if (skillBranchPendingBeh(b.core).length) behPendNames.push(b.core.name);
          b.pick.forEach(o => { if (skillBranchPendingBeh(o).length) behPendNames.push(o.name); });
        }
      }
      for (const pid in (SKILL_TREE.passives || {})) {
        if (typeof Game !== 'undefined' && Game.passiveImplemented && !Game.passiveImplemented(pid)) {
          pasPendNames.push(SKILL_TREE.passives[pid].name);
        }
      }
    }
    const pendAll = behPendNames.concat(pasPendNames);
    /* [P2] 技能位与等级台阶都已接线：文案全部现读 SKILL_ARCHETYPE / SKILL_TIERS，
     * 面板里那份预览用的是同一批数据 —— 改表两处一起变，不用维护第二份清单。 */
    const ARCH = (typeof SKILL_ARCHETYPE !== 'undefined') ? SKILL_ARCHETYPE : null;
    const TIERS = (typeof SKILL_TIERS !== 'undefined') ? SKILL_TIERS : null;
    const archHTML = ARCH ? Object.keys(ARCH.classes).map(ck => {
      const pack = ARCH.classes[ck];
      const tags = pack.slots.map(sl => `<span class="hp-tag kc">${sl.no} ${sl.title}</span>`).join('');
      return `<div class="hp-tags kcs"><b style="color:#e8d8b0;margin-right:4px">${pack.name}</b>${tags}</div>`;
    }).join('') : '';
    const slotLine = ARCH ? ARCH.slots.map(m => `${m.keybind}·${m.name}`).join(' / ') : '';
    const tierLine = TIERS ? TIERS.steps
      .filter(s => TIERS.visible.indexOf(s.lv) >= 0)
      .map(s => `<b>Lv${s.lv}</b> ${s.name}`).join(' · ') : '';
    const tierMul = (typeof skillLvMul === 'function' && TIERS) ? skillLvMul(TIERS.cap) : 2.02;
    /* [P2b] 数量台阶读数：系数与上限都现读数据表，别写死「1.85 倍 / 上限 8」 */
    const cntDec = (typeof SKILL_COUNT_DECAY === 'number') ? SKILL_COUNT_DECAY : 0.85;
    const cntCap = (typeof skillCountCap === 'function') ? skillCountCap() : 8;
    const cnt3 = (1 + cntDec).toFixed(2);
    const cnt7 = (1 + cntDec + cntDec * cntDec).toFixed(2);
    const cntSkills = (typeof SKILL_COUNT_BASE === 'object') ? Object.keys(SKILL_COUNT_BASE).length : 9;
    const pointPool = (typeof skillPointPool === 'function') ? skillPointPool(40) : 60;
    /* [P2b·第二批] 进化台阶读数：已接条目直接从 SKILL_TIER_EVO 现算 ——
     * 写死「旋风斩 / 火球」迟早变成假话（下一批一接就过时）。 */
    const EVO = (typeof SKILL_TIER_EVO === 'object' && SKILL_TIER_EVO) ? SKILL_TIER_EVO : {};
    const evoIds = Object.keys(EVO);
    const evoN = evoIds.reduce((a, id) => a + Object.keys(EVO[id]).length, 0);
    const evoText = evoIds.map(id => {
      const nm = (typeof SKILLS !== 'undefined' && SKILLS[id]) ? SKILLS[id].name : id;
      const lvs = Object.keys(EVO[id]).map(Number).sort((x, y) => x - y).map(l => 'Lv' + l).join('/');
      return `<b>${nm}</b> ${lvs}`;
    }).join(' · ');
    /* 曲线读数兜底：数据表缺失时说明页不许整块崩（宁可按旧数字写） */
    const CV = (TIERS && TIERS.curve) || [{ pct: 8 }, { pct: 4 }, { pct: 2 }];
    const archRows = (ARCH && TIERS) ? [
      row('技能位', `从 12 技能平铺收敛到 <b>5 个功能位</b>（${slotLine}）：点数集中，每个技能才养得起来。` +
        `三职业内容各自独立，⑤ 号位不可互换 —— 刀客兵形（三种刀式 + 断岳斩，全程不产生任何独立单位）、` +
        `法师元素法相（只强化主元素）、道士召灵兽（有独立生命值的技能产物，不是宠物）。` +
        `<b>动作条 ${barSlots} 格：左键 = ①，${barKeyText} = ②~⑤</b>；` +
        `每格只能放本位技能（越位会被打回）。${archHTML}`),
      row('等级台阶', `1→${TIERS.baseMax} 级为圆满：${tierLine}；11→${TIERS.cap} 为精进层（来自装备词缀，不占技能点）。` +
        `伤害曲线分段：1~10 每级 ${CV[0].pct}%、11~15 每级 ${CV[1].pct}%、` +
        `16~20 每级 ${CV[2].pct}%，20 级合计约 <b>${tierMul} 倍</b>` +
        `（若全程按 8% 算会到 2.52 倍，再乘数量轴 DPS 会爆）。` +
        `技能等级上限 <b>${lvMax}</b>，点满一个技能 ${lvMax - 1} 点；40 级共 <b>${pointPool}</b> 点技能点`),
      row('数量台阶', `Lv3 / Lv7 各 <b>+1 发</b>，<b>已接进战斗</b>：目前 ${cntSkills} 个技能吃这条通道` +
        `（连发 / 多片 / 多落点 / 多数符 / 多段横扫）。多发不是白给 —— 第 n 发 ×${cntDec}，` +
        `所以 1→2→3 发的总伤是 <b>${cnt3} / ${cnt7} 倍</b>，不是 2 / 3 倍；` +
        `额外发数上限 <b>${cntCap}</b>（台阶 + 装备 + 天赋 + 变体相加后截断）。` +
        `Lv5 / Lv9 / Lv10 的进化台阶<b>逐技能接</b>：面板台阶上带「待」字的，就是本段只有文案、战斗还没接的部分`),
      row('进化台阶', `Lv5 / Lv9 / Lv10 各改一个「形态」，不新增按键。目前已接 <b>${evoN}</b> 条：` +
        `${evoText || '（暂无）'}。` +
        `接法是把形态写成行为键（旋转 / 吸怪 / 灼烧 / 环绕 / 索敌…），走与变体同一套结算 —— ` +
        `所以「等级送的形态」和「点数选的变体」不会各算一套；同名键由变体覆盖台阶（花点的选择优先）。` +
        `剩下的位仍是文案，面板上带「待」角标，<b>不点也能看懂，点了不生效</b>`)
    ] : [];
    H.push(sec('七 · 术法与变体', `${skillIds.length} 个技能 · ${coreN} 条精研 · ${pickN} 条取向 · ${varN} 个变体 · ${pasN} 条被动 · ${bdN} 套流派`, [
      row('技能', `三职业各 ${Math.round(skillIds.length / 3)} 个，按等级领悟。技能点 = 角色等级 × 1.5（40 级 ${pointPool} 点），升级 1 级花 1 点；技能等级上限 ${lvMax}，伤害按分段曲线走（1~10 每级 ${CV[0].pct}%、11~15 ${CV[1].pct}%、16~20 ${CV[2].pct}%）。详情卡的「升级」与「−1」同样先进入「未确认」条，确认后写入存档`),
      ...archRows,
      row('精研', `每技能一条，等级达到 ${SKILL_TREE.pickAt} 后自动生效，不消耗技能点，效果随等级提升。改写对象为战斗行为：斩杀线、攻击段数、作用范围、附带的持续伤害`),
      row('取向', `技能等级达到 ${SKILL_TREE.pickAt} 后解锁，二选一，消耗 ${SKILL_TREE.branchCost.pick} 点。已选项可单独取消并返还点数，更换取向无需重置技能树`),
      row('变体', `每技能 3 条（Ⅰ / Ⅱ / Ⅲ），可随时切换，不消耗技能点。树上技能名下方的文字为当前变体名，<b>点击切换至下一条</b>（自动跳过不可用或前提不满足的条目）；说明书卡内三条条目亦可直接点选`),
      row('变体形态', `共 ${mechN} / ${varN} 条改写战斗行为（聚怪、跟随、连跃、化龙、引导、灵兽同享等），其余为纯数值：范围 +70%、伤害 +130% 一类`),
      row('变体特效', `${fxStat.total} 条变体中有 ${fxStat.styled} 条附带专属特效，按行为归为 ${fxKinds} 类风格：${fxNames.join(' / ')}。施法时绘制一次专属光效，颜色与卡片风格标签、树上变体名一致。纯数值变体不附加光效`),
      row('推荐流派', `${bdN} 套模板（每职业 ${bdPerCls} 套）。术法面板顶部「推荐流派」按<b>当前存档</b>计算契合度最高的三套：核心技能等级 / 取向 / 变体 / 被动 / 属性 / 标签六项加权求和即契合度。该值表示与模板的接近程度，不作强度排名（未接入伤害模拟）。卡片内仅支持一键切换变体，技能点与被动需逐项分配`),
      row('技能条', `${barSlots} 格 × ${barSets} 套（左键 + ${barKeyText}）。格位 = 功能位：① 基础攻击 / ② 中程爆发 / ③ 护身清场 / ④ 自身增益 / ⑤ 职业核心，**每格只能放本位的技能**。在术法面板详情卡底部点格位配置；按 ${K(SKILL_BAR_SET_LABEL)} 切换栏位（同一格换不同技能，首领 / 刷图各一套）`),
      row('秘技', `传世授予的技能（可跨职业）在面板内单独分组，带青色「秘」角标；卸下装备后失效，不占用技能点`),
      row('被动与关键被动', `主动对面的圆纹为被动（上限 ${pasMax} 级），六角纹为关键被动（限 1 点），共 ${pasN} 条（关键 ${pasKeyN} 条）。每个被动与同岔口的主动共享解锁等级；<b>关键被动另有软前置</b>：该线已投入 ≥ ${softPts} 点（点哪个节点都算，不指定某个节点）。每级消耗 1 技能点：左键 +1 · 右键 −1，同样经过「未确认」条。已分配点数时边框点亮`),
      row('被动生效', `数值型直接计入面板属性（狂怒暴伤 / 铁骨护甲 / 破甲穿透 / 摧枯处决伤…）；条件型在战斗中结算（血性依据自身生命值、绝对零度依据目标冻结状态、剑魄依据本图累计消耗资源）；关键被动各自带触发（战意不灭 90 秒 / 涅槃 120 秒 / 雷神 6 秒落雷 / 天师护身符 / 九转还丹 60 秒 / 兽契提升灵兽上限，并使阵亡的灵兽有 30% 概率立即重新召唤）`),
      row('符法', `符箓系四术（五雷符 / 符箭 / 万剑归宗 / 天师符）的伤害统一为「符法」，不再吃雷伤加成；被动「符力」每级 +9% 符法伤害`),
      row('灵兽上限', `场上最多 ${allyCapBase} 只（关键被动「兽契」+1）。<b>已达上限时新召唤不会生效</b>，场上的灵兽不会因新召唤而消失。灵兽有<b>独立生命值</b>（按角色最大生命的 30%~55% 折算，灵狼最少、青龙最多），会被敌人打死；关键被动「兽契」使阵亡的灵兽有 30% 概率立刻按原样重新召唤。伤害继承角色全部攻击属性：暴击率 / 暴击伤害 / 技能伤害 / 对首领伤害 / 属性增伤，召唤后换装备立刻生效`),
      row('灵兽继承', `灵兽出手走与角色相同的伤害管线，因此「召唤物伤害」词条是与其它增伤并列的独立乘区，不会重复计算。灵兽不继承角色的护甲与抗性，只吃自己的生命值`),
      row('灵兽状态', `灵狼精研「同心」每 8 秒嘲讽一次：6 码内敌人改以灵兽为目标，其间角色不受该类攻击（首领免疫）。白虎精研「虎啸」每次出手有 25% 概率使目标逃离 1 秒。暴雪精研「深寒」额外降低 20% 攻击速度，敌人出手间隔随之延长`),
      row('技能树投资', `三线并行${lineNames.length ? '（' + lineNames.join(' / ') + '）' : ''}：三条线同时开放，<b>没有必点主干，也不再有主动与被动二选一</b>。每个节点只看两道门 —— ① <b>角色等级</b>：到级才亮，未到显示等级角标；② <b>本线已投入点数</b>：只有关键被动要求该线 ≥ ${softPts} 点。同一个岔口的主动与被动可以都点，取舍只在于技能点怎么分，而不是「选哪条线」`),
      row('技能树布局', `面板上<b>一条线一列</b>（共 ${lineNames.length || 3} 列），列内从上往下按<b>等级门槛</b>递增：方块是主动，旁边小一圈的圆纹 / 六角纹是它这一行的被动 —— 主动点亮、被动跟随，不再分左右两栏「选一个」。竖着的那根淡线只表示「这是同一条线」，不是前置关系；手机上改成分页签，一页一条线，同样自上而下`),
      row('洗点', `面板顶部「洗点」重置全部技能等级、取向与被动（变体不消耗技能点，予以保留；装备不受影响）。费用按阶梯递增 ${respecFeesTxt} 金，3.5 万封顶。树上右键可单点减级，不收取费用`),
      row('未实现项', pendAll.length
        ? `行为层 / 被动层尚未实现的选项不可选择：按钮标注「未开放」并提示缺少的钩子，接口层同样返回拒绝。当前剩余 ${pendAll.length} 条（${pendAll.join(' / ')}），其实现依赖怪物 AI 与队友系统`
        : '精研、取向与被动已全部接通'),
      row('四种状态', kcs([['图标灰', '未领悟'], ['环形遮罩', '冷却中'], ['暗红', '灵力不足'], ['Ⅰ/Ⅱ/Ⅲ', '当前变体']]))
    ]));

    /* ---------------- 7. 天赋与协同 ---------------- */
    H.push(sec('八 · 天赋与协同', `${talentN} 个节点`, [
      row('天赋点', `每级 1 点，另加任务奖励 10 点，满级共 70 点`),
      row('页签', `三职业系各 10 节点 + 通用「通达」+ 协同「星位」，共 5 页`),
      row('节点层级', `小节点可投 5 级 · 中节点 1 级（需本系先投 5 点）· 大节点是质变（需本系 5 点且等级达标）`),
      row('加点方式', `左键加点 · <b>Shift + 左键</b> 退 1 级（触屏用底部的「退 1 点」，退的是最后点过的那个节点；后置节点还点着时不给退，先退它们）。改动先进「未确认」条，确认才写存档`),
      row('协同', `${synN} 枚隐藏星位，默认在星盘上不显形。把装备穿对（套装件数 / 符文之语 / 词条达标）后自动亮起，之后就能像普通节点一样投点`),
      row('协同操作', `切到「协同」页签，画布下方会列出每一枚的激活条件与当前是否已显形`),
      row('预设 / 洗点', `3 套预设一键切换；洗点费用递增（1k / 5k / 20k / 50k 铜钱）`)
    ]));

    /* ---------------- 8. 敌人 ---------------- */
    /* [C2] 行为原型：文案与「哪些怪是这个行为」全部从数据表算出来，
     * 以后加怪 / 换行为，这里自动跟着变，不用维护第二份清单 */
    const aiKindOf = m => m.ai || (m.ranged ? 'ranged' : 'melee');
    const aiWho = kind => Object.keys(MONSTERS)
      .filter(k => aiKindOf(MONSTERS[k]) === kind)
      .map(k => MONSTERS[k].name);
    H.push(sec('九 · 敌人', `${mobN} 种怪物 · ${Object.keys(MOB_AI_KINDS).length} 种行为 · ${eliteN} 条精英词缀`, [
      row('普通怪', `按族群分布在不同地图，各有元素抗性与弱点。打对元素伤害会明显更快`),
      row('精英', `带 ${eliteN} 条精英词缀（迅捷 / 护盾 / 召唤 / 分裂 / 荆棘…），名字会标出词缀，掉落更好`),
      row('首领', `独立血条、多段技能、阶段切换。对首领增伤 / 首领减伤是独立乘区`),
      row('行为原型', `<div class="hp-tags kcs">${Object.keys(MOB_AI_KINDS).map(k => {
        const d = MOB_AI_KINDS[k];
        return `<span class="hp-tag q" style="color:${d.color};border-color:${d.color}55">${d.name}</span>`;
      }).join('')}</div>`),
      ...['flank', 'kite', 'bomber', 'healer', 'summoner', 'coward'].map(kind => {
        const d = MOB_AI_KINDS[kind];
        const who = aiWho(kind);
        return row(`<span style="color:${d.color}">${d.name}</span>`,
          `${d.desc}<br><span class="hp-n">${who.join('、') || '（暂无）'}${who.length > 6 ? ` 等 ${who.length} 种` : ''}</span>`);
      }),
      row('读招', `自爆型敌人闪红为引信点燃信号，应立即拉开距离；治疗型敌人脚下出现绿圈时优先集火；<br>召唤型敌人的召唤物持续累积，场上数量异常时优先清除卵体。以上均无文字提示，通过模型与特效判断`),
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

    /* ---------------- 11. 声音（S16） ---------------- */
    /* 全节按数据表生成：加族 / 加图 / 调预算，这一页自己跟着变。
     * 没有音频文件这一条也要写明 —— 玩家会去翻目录找 mp3。 */
    const tones = (typeof FAMILY_TONES !== 'undefined') ? FAMILY_TONES : {};
    const events = (typeof VOICE_EVENTS !== 'undefined') ? VOICE_EVENTS : {};
    const amb = (typeof MAP_AMB !== 'undefined') ? MAP_AMB : {};
    const bgmModes = (typeof BGM_MODES !== 'undefined') ? BGM_MODES : {};
    const clipTab = (typeof AUDIO_CLIPS !== 'undefined') ? AUDIO_CLIPS : {};
    const clipList = Object.keys(clipTab).filter(k => clipTab[k]);
    const bgmTab = (typeof AUDIO_BGM !== 'undefined') ? AUDIO_BGM : {};
    const bgmList = Object.keys(bgmTab).filter(k => bgmTab[k])
      .map(k => ({ explore: '探索', combat: '战斗', boss: '首领' })[k] || k);
    const usedFam = {};
    [MONSTERS, (typeof BOSSES !== 'undefined' ? BOSSES : {})].forEach(tab => {
      for (const k in (tab || {})) usedFam[tab[k].family || 'humanoid'] = 1;
    });
    const famKeys = Object.keys(tones);
    const famLive = famKeys.filter(f => usedFam[f]);
    const L = (typeof AudioSys !== 'undefined') ? AudioSys.LIMITS : null;
    const EV_LABEL = { attack: '出手', hurt: '受击', idle: '闲态', aggro: '察觉',
      death: '死亡', elite: '精英死亡', bossPhase: '首领阶段' };
    const evList = Object.keys(events).map(e => `${EV_LABEL[e] || e}（${events[e].dur}s）`);
    const ambList = Object.keys(amb);
    const volumes = ['volMaster', 'volSfx', 'volAmb', 'volMusic']
      .filter(k => typeof Settings !== 'undefined' && Settings.DEFAULTS && k in Settings.DEFAULTS)
      .map(k => `${({ volMaster: '主音量', volSfx: '音效', volAmb: '环境', volMusic: '音乐' })[k]} ${Settings.DEFAULTS[k]}`);

    H.push(sec('十二 · 声音', `${famKeys.length} 族音色 · ${Object.keys(events).length} 种事件`, [
      row('怎么发声', `两套并存：<b>怪物声与环境音由浏览器实时合成</b>（振荡器 + 噪声 + 滤波），`
        + `而<b>技能 / 界面音效与三层底乐是录音素材</b>（${clipList.length} 条音效 + ${bgmList.length} 首曲子）。`
        + `素材缺失、还没加载完或解码失败时，每一条都<b>自动回退合成</b> —— 删掉整个 audio 目录游戏照样有声`),
      row('音效素材', clipList.length
        ? `${clipList.length} 条，接管：${clipList.join('、')}。素材清单在数据表 <b>AUDIO_CLIPS</b>，换真录音只改那张表`
        : '<span class="hp-n">清单为空，全部实时合成（数据表 AUDIO_CLIPS）</span>'),
      row('底乐素材', bgmList.length
        ? `${bgmList.length} 首成品曲：${bgmList.join(' / ')}。素材是<b>固定曲目、不跟地图调式走</b> —— 六张图的探索曲是同一首。想恢复「按图变调」就把 AUDIO_BGM 清空`
        : '<span class="hp-n">清空 AUDIO_BGM，底乐回到按图调式实时演奏</span>'),
      row('族音色', `共 ${famKeys.length} 族，其中 ${famLive.length} 族已有怪物在用：`),
      ...famKeys.map(f => {
        const t = tones[f];
        const live = usedFam[f] ? '' : '<span class="hp-n">（暂无怪物使用，扩族谱时接入）</span>';
        return row(`<span style="color:#c9a86a">${t.name}</span>`, `${t.desc}${live}<br><span class="hp-n">基频 ${t.base}Hz · 时长 ${t.dur}s · 体型越大音高越低</span>`);
      }),
      row('事件', `${Object.keys(events).length} 种，同一族换事件改的是音高、时长、亮度与滑向：${evList.join('、')}`),
      row('空间', L ? `HRTF 双耳定位，可听出左右与前后；超出 ${L.far} 米不发声，闲态叫声只给 ${L.idleFar} 米内。听者跟随相机，转视角时声像随之移动` : '按相机位置与朝向做双耳定位'),
      row('同时发声', L ? `最多 ${L.voices} 路怪声；同族同事件 ${Math.round(L.dedupe * 1000)}ms 内只发一次（狼群齐咬听起来是一声）；闲态每只 ${L.idleMin}~${L.idleMax} 秒一次。首领与阶段转换不受此限` : '同时发声数量有上限，同族同事件会去重'),
      row('环境音', `${ambList.length} 张图各有底噪与随机点缀：${ambList.map(k => `${MAPS[k] ? MAPS[k].name : k}（${amb[k].kind}）`).join(' / ')}。底噪由噪声层加慢速起伏合成，换图交叉淡出，不会硬切`),
      row('底乐', `三层：${Object.keys(bgmModes).map(k => ({ explore: '探索', combat: '战斗', boss: '首领' })[k] || k).join(' / ')}，`
        + `${bgmList.length ? '成品曲交叉淡入（同一层切回来 8 秒内接着放，不从头）' : '按调式实时演奏、交叉淡入'}。`
        + `16 米内有已仇恨的敌人进战斗层，脱战 4 秒后淡回探索层；首领战强制首领层`),
      row('音量', `设置（${K('O')}）里四条滑杆${volumes.length ? '：' + volumes.join(' / ') : ''}，另有一键静音。拖动即时生效，与画质档位分开存（换角色不重设）；切到后台自动暂停，回到页面继续`),
      row('没有声音', `浏览器要求先有用户操作才允许播放：在页面上<b>点一下</b>（或按键）即可解锁。若仍无声，检查是否静音、主音量是否为 0，以及浏览器标签页是否被静音`)
    ]));

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
      /* 分区标题：不是可点的行，只是把「画面」和「音频」隔开 ——
       * 音效滑杆挤在画质按钮下面，会让人以为它们也受画质档位管 */
      if (r.head) return `<div class="sethead">${r.head}</div>`;
      if (r.type === 'range') {
        const v = Math.max(0, Math.min(100, Math.round(Number(d[r.k]) || 0)));
        return `<div class="setrow"><span class="setlab">${r.label}</span><div class="setseg setrange-wrap">`
          + `<input type="range" class="setrange" min="0" max="100" step="5" data-rk="${r.k}" value="${v}">`
          + `<b class="setval" data-rv="${r.k}">${v}</b></div></div>`;
      }
      /* fps 存的是布尔值，选项却是 '0'/'1'，直接 String() 会永远对不上高亮；
       * 静音也是布尔，同一套处理。全屏同理 —— 但它读的是浏览器状态，不是设置值 */
      const cur = r.act === 'fs'
        ? ((typeof Game !== 'undefined' && Game.isFullscreen && Game.isFullscreen()) ? '1' : '0')
        : (r.bool ? (d[r.k] ? '1' : '0') : (r.k === 'fps' ? (d.fps ? '1' : '0') : String(d[r.k])));
      return `<div class="setrow"><span class="setlab">${r.label}</span><div class="setseg">`
        + r.opts.map(([v, t]) =>
          `<button class="sbtn${cur === v ? ' on' : ''}" data-k="${r.k}" data-v="${v}">${t}</button>`).join('')
        + `</div></div>`;
    }).join('');
    if (hint) {
      const perf = d.preset === 'custom'
        ? '当前为<b>自定义</b>，自动降画质已关闭。想让它按帧率自动调，把「画质档位」选回<b>自动</b>。'
        : '当前为<b>自动</b>：帧率低于 42 会自动降一档，稳定高于 57 再升回来。';
      hint.innerHTML = perf
        + '<br>卡的时候优先降<b>渲染倍率</b>——0.65x 只损失一点锐度，像素量却少了 58%。'
        + '<br>镜头：<b>火炬之光</b>机位更远更高、跟随更硬、出手不推镜，长时间刷图最省眼睛；'
        + '<b>暗黑4</b>接近俯视；<b>第一人称</b>点一下画面锁定鼠标、移动鼠标转身，Esc 解锁。'
        + '滚轮随时拉近拉远。'
        + '<br>镜头震动<b>关</b>之后只剩受击的方向反馈，完全不会晃。'
        + '<br>全屏：安卓 Chrome / 桌面浏览器可直接全屏；<b>iPhone 的 Safari 不支持网页全屏</b>，'
        + '请点「分享 → 添加到主屏幕」，从图标启动就没有地址栏，效果等同全屏。'
        + '<br>音频：<b>音效</b>管技能与打击，<b>环境</b>管风声虫鸣，<b>音乐</b>是随战斗切换的三层底乐。'
        + '若整局无声，先在页面任意处点一下（浏览器要求先有交互才允许播放）。';
    }
  },

  /* 滑杆：拖动即时生效。只改增益与数字，不重绘面板 —— 重绘会把滑杆从手指下抽走 */
  onSettingsSlide(e) {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.rk || typeof Settings === 'undefined') return;
    const k = el.dataset.rk;
    const v = Math.max(0, Math.min(100, Math.round(Number(el.value) || 0)));
    Settings.set(k, v);
    const lab = document.querySelector(`#setBody [data-rv="${k}"]`);
    if (lab) lab.textContent = String(v);
  },

  onSettingsClick(e) {
    const b = e.target.closest('[data-k]');
    if (!b || typeof Settings === 'undefined') return;
    const k = b.dataset.k;
    let v = b.dataset.v;
    /* 全屏是动作而不是设置项：不进 Settings，直接调浏览器 API，再按真实状态重绘高亮 */
    if (k === 'fullscreen') {
      if (typeof Game !== 'undefined' && Game.toggleFullscreen) Game.toggleFullscreen();
      setTimeout(() => this.renderSettings(), 260);
      return;
    }
    const row = this.SET_ROWS.filter(r => r.k === k)[0];
    if (row && row.bool) v = (v === '1');
    else if (k === 'fps') v = (v === '1');
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
    const kind = ref.split(':')[0];
    const isInv = kind === 'inv';
    /* [M6] 仓库面板里点格子 = 存入 / 取回，不出「穿戴 / 出售」——
     * 站在仓库前的动作是搬东西，不是换装。 */
    let acts;
    if (kind === 'sbag') acts = '<button class="btn primary" data-act="put">存 入 仓 库</button>';
    else if (kind === 'stash') acts = '<button class="btn primary" data-act="take">取 回 行 囊</button>';
    else if (isInv) acts = '<button class="btn primary" data-act="equip">穿 戴</button><button class="btn" data-act="sell">出 售</button>';
    else acts = '<button class="btn primary" data-act="unequip">卸 下</button>';
    this.tooltipEl.innerHTML = itemTooltip(item, {
      hint: '',
      compareTo: (isInv || kind === 'sbag' || kind === 'stash') ? this.equippedFor(item) : null
    }) + `<div class="tt-act">${acts}</div>`;
    this.tooltipEl.style.display = 'block';

    this.tooltipEl.querySelectorAll('.tt-act .btn').forEach(b => {
      b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const act = b.dataset.act;
        const idx = parseInt(ref.split(':')[1]);
        if (act === 'equip') Game.equipFromInv(idx);
        else if (act === 'unequip') Game.unequip(ref.split(':')[1]);
        else if (act === 'sell') Game.sellItem(idx);
        else if (act === 'put') { const r = Game.stashPut(idx); if (!r.ok) this.toast(r.msg); }
        else if (act === 'take') { const r = Game.stashTake(idx); if (!r.ok) this.toast(r.msg); }
        this.hideTooltip();
        if (act === 'put' || act === 'take') this.renderStash();
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
    /* [M6] 仓库面板两列各自一套前缀：
     *   sbag:  面板左列的行囊格（点了是「存入」，不是「穿戴」）
     *   stash: 面板右列的仓库格（点了是「取回」）
     * 不复用 inv: 是因为同一个 ref 在背包面板和仓库面板的语义相反，
     * 靠「当前开的是哪个面板」来分流太脆 —— 面板搬 DOM 时容易判错。 */
    if (kind === 'sbag') return Game.state.inventory[parseInt(val)] || null;
    if (kind === 'stash') return (Game.stashItems() || [])[parseInt(val)] || null;
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
    document.getElementById('hpText').textContent = `${Math.ceil(Math.max(0, s.hp))} / ${Math.round(st.hpMax)}`;
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
    document.getElementById('zoneName').textContent = this.zoneLabel(s);
    document.getElementById('vignette').style.opacity = hpP < 35 ? (1 - hpP / 35) * 0.9 : 0;
    this.updateQuestTrack();
    if (typeof Mobile !== 'undefined' && Mobile.on) Mobile.syncHud();
  },

  buildActionBar() {
    const s = Game.state;
    const bar = document.getElementById('actionbar');
    /* [P1] 技能条 5 格 × 2 套：第 0 格 = ① 号位（左键），1~4 = ②③④⑤。 */
    const slots = Game.skillBar();
    const setIdx = Game.barSet();
    const keyOf = i => (typeof SKILL_BAR_KEYS !== 'undefined' && SKILL_BAR_KEYS[i]) || String(i + 1);
    const slotMeta = i => skillArchSlot(s.cls, i + 1) || {};
    let h = slots.map((id, i) => {
      if (!id) {
        const sm = slotMeta(i);
        return `<div class="skill empty" data-slot="${i}" title="技能条 ${keyOf(i)}（${sm.glyph || i + 1} 号位 · ${sm.name || '空位'}）：空位——打开术法面板（K）把本位技能放上来">
          <span class="k">${keyOf(i)}</span><div class="g">＋</div></div>`;
      }
      const sk = SKILLS[id];
      const castLabel = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
      const rangeLabel = sk.castRange ? ` · ${sk.castRange} 码` : '';
      /* [M1] 变体角标：三个改造共用一张图标，靠右上角 Ⅰ/Ⅱ/Ⅲ 区分，
       * 不然在技能条上看不出当前装的是哪一版。v=0 时角标隐藏。 */
      const vv = Game.skillVariant(id);
      const vName = (typeof skillFormName === 'function') ? skillFormName(id, vv) : '';
      const vBadge = `<span class="vb" style="${vv > 0 ? '' : 'display:none'}">${['Ⅰ', 'Ⅱ', 'Ⅲ'][vv] || ''}</span>`;
      return `<div class="skill" data-skill="${id}" title="${sk.name}${vName ? ' · ' + vName : ''} · ${castLabel}${rangeLabel}">
        <span class="k">${keyOf(i)}</span>${vBadge}<div class="g">${skillIconSvg(id, 26)}</div>
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
    /* [M6] 仓库不在菜单里：它在村里的「仓管·玄贮」身上。
     * 存东西要跑一趟，这是设计的一部分 —— 见 Game.openNPC 的 steward 分支。 */
    { id: 'stat', name: '道 途', key: 'C', panel: 'statPanel', render: 'renderStats' },
    { id: 'talent', name: '天 赋', key: 'T', panel: 'talentPanel', render: 'renderTalentPanel' },
    /* 术法（技能树）已独立成整屏层：树要满宽才看得全，见 openSkill() */
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
    /* 术法不在菜单里了（整屏层）：老调用点照旧传 'skill'，在这里转一道。
     * 菜单开着的时候转过去，要记住来源页，关术法时退回来。 */
    if (tab === 'skill') {
      const mp0 = document.getElementById('menuPanel');
      const back = (mp0 && mp0.classList.contains('open')) ? (this.menuTab || 'bag') : null;
      this.openSkill(back);
      return;
    }
    const p = document.getElementById('menuPanel');
    if (!p) return;
    const id = tab || this.menuTab || 'bag';
    this.menuTab = id;
    /* 先合上其它浮层（对话框 / 商店 / 图鉴），菜单自己除外 */
    this.closeAll(p);
    /* 第一人称下鼠标是锁定的（光标不可见），不释放的话点不到面板上的任何按钮 */
    if (typeof Game !== 'undefined' && Game.exitLook) Game.exitLook();
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
  invJunkTier: 'common',   // 一键分解的品质阈值（凡 → 灵 → 玄 → 神，分到这一档为止）
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

  /* 「角色属性」折叠开关（手机专用诉求）：
   * 行囊页左列 = 装备栏 + 常驻属性，属性有 20 多行，展开时会把右边的行囊
   * 整个顶到屏幕外，玩家以为「行囊没了」。手机上默认收起，点标题行展开。
   * 类挂在 .doll 上（renderDoll 只重画 #dollGrid，不会把类冲掉）。 */
  bindDollFold() {
    const head = document.getElementById('dollHead');
    const doll = document.querySelector('#invPanel .doll');
    if (!head || !doll || head._foldBound) return;
    head._foldBound = true;
    if (typeof IS_TOUCH !== 'undefined' && IS_TOUCH && !doll._foldInit) {
      doll._foldInit = true;
      doll.classList.add('fold');
    }
    const sync = () => head.setAttribute('aria-expanded', doll.classList.contains('fold') ? 'false' : 'true');
    const toggle = () => {
      doll.classList.toggle('fold');
      sync();
      try { SFX.ui(); } catch (e) { }
    };
    sync();
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  },

  renderInventory() {
    const s = Game.state;
    if (!s) return;
    this.bindDollFold();
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
   * 两列排布；超出左列可用高度时由 CSS 的 overflow-y 接管滚动。
   * [v1.8.5] 根基四项带 data-attr：悬停 / 点按能看「这一点到底加什么」。 */
  renderDollStats() {
    const el = document.getElementById('invStats');
    if (!el) return;
    el.innerHTML = this.statGroups().map(([title, list]) =>
      `<div class="st-grp">${title}</div>` +
      list.map(r => `<div${r[2] ? ` data-attr="${r[2]}"` : ''}><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
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
        /* [v1.8.5] 穿戴需求不满足 → 格子压暗（悬停提示里写清差哪一项）。
         * 用 meetsReq 做静默判断：不能因为背包里翻一下就刷屏日志。 */
        const miss = !Game.meetsReq(it);
        html += `<div class="islot ${sz ? 'sz-' + sz : ''} r-${it.rarity}${miss ? ' req-miss' : ''}" ${it.slot ? `data-size="${sz}"` : ''} data-ref="inv:${i}">
          <span class="ico">${itemIcon(it)}</span>${sb}${hand}<span class="slot-tag">${tag.slice(0, 1)}</span>${miss ? '<span class="req-dot">需</span>' : ''}</div>`;
      } else {
        html += `<div class="islot"></div>`;
      }
    }
    ig.innerHTML = html;

    /* 一键分解确认条（v1.9.2）：品质阈值选到哪档分到哪档，产出实时更新。
     * 默认只分凡品 —— 阈值越高越危险，别默认替玩家做决定。 */
    const jb = document.getElementById('invJunkBar');
    if (jb) {
      if (this.invJunkOpen) {
        const pv = Game.previewDecomposeJunk(this.invJunkTier);
        jb.style.display = '';
        const chips = pv.tiers.map(t => {
          const on = t.key === pv.tier;
          const n = (pv.bagByRarity || {})[t.key] || 0;
          return `<button class="jtier${on ? ' on' : ''}${n ? '' : ' zero'}" data-junktier="${t.key}"
            title="${t.name}档：行囊里 ${n} 件（选到这一档会一并分解，该档以上保留）">${t.name}<i>${n}</i></button>`;
        }).join('');
        jb.innerHTML = `<span class="jl">一键分解</span>
          <span class="jt">将分解 <b style="color:#e8d8b0">${pv.count}</b> 件「${pv.tierName}及以下」装备，预计获得 <b style="color:#c9b8ff">${pv.text}</b></span>
          <span class="jtierwrap"><i>分解到</i>${chips}</span>
          <button class="btn primary" data-junkok ${pv.count ? '' : 'disabled'}>确认分解</button>
          <button class="btn" data-junkcancel>取消</button>
          <span class="jnote">身上装备 · 套装 · 传世 不参与</span>`;
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
          <span>一键分解 按品质阈值</span><span>扩容永久生效</span></div>`;
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
    /* 收集全部已拥有的套装件（装备 + 行囊 + 仓库 + 收藏柜） */
    const owned = {};
    const pool = [];
    for (const slot in s.equipment) if (s.equipment[slot]) pool.push(s.equipment[slot]);
    (s.inventory || []).forEach(it => { if (it) pool.push(it); });
    /* [M6] 仓库搬到 StashStore 了，且收藏柜里登记的也算「已拥有」 */
    (Game.stashItems() || []).forEach(it => { if (it) pool.push(it); });
    const reg = Game.stashData().sets || {};
    for (const id in reg) (reg[id].pieces || []).forEach(it => { if (it) pool.push(it); });
    for (const it of pool) {
      if (!it.setId) continue;
      (owned[it.setId] = owned[it.setId] || []).push(it);
    }

    let totalOwned = 0, totalPieces = 0;
    const all = Object.values(SETS);
    /* v1.2.2：按职业分组展示，方便对着 BD 找套装
     * 职业顺序读注册表：加新职业后套装图鉴会自动多出一组，不用改这里 */
    const groups = [];
    const CLS_ORDER = (typeof classPackIds === 'function') ? classPackIds() : ['warrior', 'mage', 'taoist'];
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
  tlLast: null,        // 最后点过的节点：「退 1 点」按钮的作用对象（触屏没有 Shift）

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
    /* [C3] 未确认的改动条：确认后才写存档，取消则整批回滚 */
    const dft = document.getElementById('tlDraft');
    if (dft) dft.innerHTML = this.draftBarHTML('talent');
    this.renderTalentPresets();
    this.renderSynergyNote();
    /* 手机上换「横向树 + 说明书卡」，轮盘整个收起来（见 renderTalentTree）。
     * 顺序要紧：先定画布位图尺寸（改 width/height 会清空画布），再画。
     * v1.6.0 起天赋页被搬进菜单，首帧只渲染这一次，反着来就会是一片空白。 */
    const domMode = (typeof MTREE !== 'undefined') && MTREE.isMobile();
    p.classList.toggle('tree-dom', domMode);
    if (domMode) {
      this.renderTalentTree();
    } else {
      this.bindTalentCanvas();
      this.drawTalentCanvas();
    }
  },

  /* ---------------- 天赋：手机上的横向树 ----------------
   * 轮盘在触屏上三条都踩坑：节点说明靠 mousemove 悬停（触屏没有）、
   * 节点直径 30px 点不准、整张 canvas 又不能滚。改成
   * 「列 = 依赖深度、从左往右长」的横向树，横向滚动，点一下选中，
   * 下方卡片里 ＋1 / −1（仍走草稿确认，不直接落盘）。 */
  renderTalentTree() {
    const host = document.getElementById('tlTree');
    if (!host || !Game.state) return;
    const trees = talentTrees(Game.state.cls);
    const tree = trees.find(t => t.id === this.tlTree) || trees[0];
    const sp = Game.talentState().spent;
    const nodes = tree.nodes.map(n => ({ id: n.id, req: n.req || [], tier: n.tier }));
    /* 选中的节点必须属于当前系：换系之后不能还挂着上一系的卡片 */
    if (this.tlSel && !tree.nodes.some(n => n.id === this.tlSel)) this.tlSel = null;

    MTREE.render(host, {
      nodes,
      sel: this.tlSel,
      resetScroll: this._tlTreeShown !== tree.id,
      cls: n => {
        const e = Game.talentNodeOf(n.id);
        const rank = sp[n.id] || 0;
        const max = e ? (e.node.max || 1) : 1;
        const out = [];
        if (e && Game.state.level < (e.unlock || 1)) out.push('locked');
        if (n.tier === 3) out.push('t3');
        if (n.tier === 2) out.push('t2');
        if (rank >= max) out.push('max');
        else if (rank > 0) out.push('own');
        return out.join(' ');
      },
      tile: n => {
        const e = Game.talentNodeOf(n.id);
        const node = (e && e.node) || {};
        const rank = sp[n.id] || 0;
        const max = node.max || 1;
        const hidden = node.cond && !Game.synergyUnlocked(n.id);
        const nm = hidden ? '？' : (node.name || '');
        const lv = hidden ? '' : (max > 1 ? rank + '/' + max : (rank ? '✓' : ''));
        const pct = max > 1 ? Math.round(rank / max * 100) : (rank ? 100 : 0);
        return `<b class="mt-nm">${nm}</b><span class="mt-lv">${lv}</span>`
          + (max > 1 ? `<span class="mt-bar"><i style="width:${pct}%"></i></span>` : '');
      },
      onPick: id => { this.tlSel = id; SFX.ui(); this.renderTalentTree(); }
    });
    this._tlTreeShown = tree.id;
    this.renderTalentCard();
  },

  /* 横向树下面那张说明书卡：复用 PC 的 talentTipHtml（口径只有一份），
   * 再加一对大按钮。手机上没有 Shift，退点也只能靠按钮。 */
  renderTalentCard() {
    const el = document.getElementById('tlCard');
    if (!el) return;
    const id = this.tlSel;
    /* 点「＋1 级」会把整张卡重画，滚动位置要还回去 ——
     * 不还的话每加一点卡片就弹回顶部，看长说明的节点得反复往下翻。
     * 换到另一个节点才回到顶部。 */
    const keepY = (this._tlCardId === id) ? el.scrollTop : 0;
    const put = () => { if (el.scrollTop !== keepY) el.scrollTop = keepY; };
    this._tlCardId = id || null;
    if (!id) {
      el.innerHTML = '<div class="tl-empty">点上面任意一个节点，这里会显示它的说明与加减按钮<br>'
        + '<span style="color:#5e594e">金边 = 已投入 · 青边 = 已点满 · 灰 = 等级未到</span></div>';
      return;
    }
    const e = Game.talentNodeOf(id);
    if (!e) { el.innerHTML = ''; return; }
    const n = e.node;
    const rank = Game.talentState().spent[id] || 0;
    const max = n.max || 1;
    const locked = Game.state.level < (e.unlock || 1);
    const hidden = n.cond && !Game.synergyUnlocked(id);
    const canUp = !hidden && !locked && rank < max && Game.canAllocTalent(id);
    const canDown = rank > 0;
    el.innerHTML = this.talentTipHtml(id)
      + `<div class="tl-acts">
        <button class="btn" data-tlstep="1"${canUp ? '' : ' disabled'}>＋ 1 级</button>
        <button class="btn" data-tlstep="-1"${canDown ? '' : ' disabled'}>− 1 级</button>
      </div>`;
    put();
    requestAnimationFrame(put);
    el.querySelectorAll('[data-tlstep]').forEach(b => b.addEventListener('click', () => {
      const up = b.dataset.tlstep === '1';
      if (this.talentStep(id, up)) this.renderTalentTree();
    }));
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
        /* 重置会清空已投的点，未确认的改动就没意义了（否则确认后又被加回去） */
        if (this.snaps) delete this.snaps.talent;
        this.tlLast = null;
        this.toast(r.msg, r.ok ? '' : 'bad');
        this.renderTalentPanel();
      };
    }
    /* [C3] 手机上没有 Shift，「退 1 点」按钮退最后点过的那个节点 ——
     * 正好对应用户说的「刚加过的点可以动态调回去」。 */
    const mi = document.getElementById('tlMinus');
    if (mi) {
      const spent = Game.talentState().spent;
      mi.disabled = !(this.tlLast && spent[this.tlLast] > 0);
      mi.onclick = () => {
        if (!this.tlLast) { this.toast('先在画布上点一个节点'); return; }
        this.talentStep(this.tlLast, false);
      };
    }
  },

  /* 天赋加 / 退 1 级：画布点击与「退 1 点」按钮共用。
   * 失败要把刚拍的快照丢掉 —— 否则会留下一个空草稿，
   * 「取消」按钮莫名亮着，按下去什么也不会变。 */
  talentStep(id, up) {
    if (!Game.state || !id) return false;
    if (!up && !(Game.talentState().spent[id] > 0)) { this.toast('该节点没有可退的点'); return false; }
    const had = this.snapDirty('talent');
    this.snapTake('talent');
    const ok = up ? Game.allocTalent(id) : Game.refundTalent(id);
    if (!ok) {
      if (!had && this.snaps) delete this.snaps.talent;
      if (!up) { this.toast('后置节点还点着，先退它们'); return false; }
      const e2 = Game.talentNodeOf(id);
      const n = e2 && e2.node;
      const rank = (Game.talentState().spent[id] || 0);
      if (n && n.cond && !Game.synergyUnlocked(id)) this.toast('未显形：需 ' + ((typeof synergyCondText === 'function') ? synergyCondText(n) : '装备条件'));
      else if (e2 && Game.state.level < (e2.unlock || 1)) this.toast('需 ' + e2.unlock + ' 级解锁');
      else if (n && rank >= n.max) this.toast('已点满');
      else if (n && n.reqPts && Game.talentTreePoints(e2.tree) < n.reqPts) this.toast('需要本系先投入 ' + n.reqPts + ' 点');
      else if (n && (n.req || []).some(r => !(Game.talentState().spent[r] > 0))) this.toast('前置节点未点亮');
      else this.toast('天赋点不足');
      return false;
    }
    this.tlLast = id;
    SFX.ui();
    this.repaintDraft('talent');
    return true;
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
      /* [C3] 改动立即反映在画布上，但要「确认」才写存档 —— 逻辑在 talentStep 里 */
      this.talentStep(id, !e.shiftKey);
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
    /* 手机上卡片里就是按钮，别提「左键」；PC 上才需要点明操作方式 */
    const touchUI = (typeof MTREE !== 'undefined') && MTREE.isMobile();
    let status, ok = true;
    if (rank >= n.max) status = '已点满 ' + rank + '/' + n.max;
    else if (Game.canAllocTalent(id)) status = (touchUI ? '可点 · 当前 ' : '可点（左键）· 当前 ') + rank + '/' + n.max;
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
  toggleSkill() { this.openSkill(); },

  /* P1：技能页从「山海录」里独立出来，做成整屏层。
   * 原因很具体：菜单内容宽 842，扣掉右侧卡只剩 544，而三系并排的树要 752，
   * 只能缩到 70%。整屏之后按 100% 显示，再加滚轮缩放 + 拖拽平移兜住更大的屏。
   * backTab：从菜单的「术法」页签点进来时传入来源页；关窗时回到那一页。
   * 传 null / 不传 = 独立打开，关窗就是全关。 */
  openSkill(backTab) {
    if (!Game.state) return;
    const p = document.getElementById('skillPanel');
    if (!p) { this.openMenu('talent'); return; }
    this.skBackTab = (typeof backTab === 'string' && backTab) ? backTab : null;
    /* 保险：万一它曾被搬进菜单容器 / 原籍隐藏区，先送回 body，否则 open 了也看不见 */
    if (p.parentElement && (p.parentElement.id === 'menuBody' || p.parentElement.id === 'panelHome')) {
      p.classList.remove('embed');
      document.body.appendChild(p);
    }
    this.closeAll(p);
    if (typeof Game !== 'undefined' && Game.exitLook) Game.exitLook();
    p.classList.add('open');
    this.renderSkillPanel();
    try { SFX.ui(); } catch (e) { }
  },

  /* 关术法：从山海录点进来的 → 回到来源页；否则关掉一切。
   * 之前这里直接 closeAll()，玩家从菜单进术法、点 ✕ 会把整个菜单也带走。 */
  closeSkill() {
    const p = document.getElementById('skillPanel');
    const back = this.skBackTab;
    this.skBackTab = null;
    if (p) p.classList.remove('open');
    if (back) this.openMenu(back);
    else this.closeAll();
  },

  /* 属性分组（v1.3.0 抽出）：属性面板与背包「详细属性」共用同一份口径，
   * 免得两处各写一遍、加新词条时漏改一处。 */
  statGroups() {
    const s = Game.state, st = s.stats, c = CLASSES[s.cls];
    const n = k => st[k] || 0;                 // 旧档/异常值兜底
    const P = k => Math.round(n(k)) + '%';
    const G = [];

    /* 根基：永远显示。第三项是根基 key —— 有 key 的行才带悬停说明（v1.8.5） */
    const base = [
      ['职业', c.name + ' · ' + c.title], ['境界', s.level + ' 级'],
      [c.atkName || '攻击力', Math.round(st.atk)], ['护甲', Math.round(st.def)],
      ['生命上限', Math.round(st.hpMax)], ['灵力上限', Math.round(st.mpMax)],
      ['力量', Math.round(st.str), 'str'], ['敏捷', Math.round(st.agi), 'agi'],
      ['体质', Math.round(st.vit), 'vit'], ['灵力', Math.round(st.int), 'int']
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

  /* ---------------- 道途：根基加点（v1.8.5 / C3 加确认） ----------------
   * 四项根基各一行：名称 / 当前值（含手动加点数）/ 每点收益 / +1 +5 −1。
   * PC 悬停行、手机点行 → 同一份说明浮层（attrTipHTML）。
   * [C3] 加减立即反映在面板上，但要「确认」才写存档；未确认的行会标出净变化。 */
  renderAttrAlloc() {
    const box = document.getElementById('attrBox');
    if (!box || !Game.state) return;
    const s = Game.state, c = CLASSES[s.cls], st = s.stats;
    const pts = Game.attrPoints();
    const alloc = Game.attrState();
    const changed = {};
    for (const d of this.snapDiff('attr')) changed[d.id] = d.delta;
    const gainTxt = k => {
      const w = c.weights[k] || {};
      const list = Object.keys(w).map(dk => `${dName(dk)} +${dFmt(dk, w[dk])}`);
      return list.length ? list.join(' · ') : '无增益';
    };
    box.innerHTML = `
      <div class="ah">
        <b>根 基</b>
        <i>可分配 <em class="${pts ? 'has' : ''}">${pts}</em> 点</i>
        <span class="ah-hint">${IS_TOUCH ? '点属性看收益' : '悬停属性看收益'} · 加完点要确认</span>
        <button class="respec" data-respec ${Game.attrSpent() ? '' : 'disabled'}>洗 点 ${Game.attrRespecFee()} 金</button>
      </div>
      <div class="alist">
        ${ATTR_KEYS.map(k => {
          const mine = alloc[k] || 0;
          const d = changed[k] || 0;
          const main = c.mainStat === k;
          return `<div class="arow${main ? ' main' : ''}${d ? ' dz' : ''}" data-attr="${k}">
            <span class="an">${ATTR_NAME[k]}${main ? '<i class="tag">主</i>' : ''}</span>
            <span class="av">${Math.round(st[k])}${mine ? `<i>+${mine}</i>` : ''}${d ? `<u class="${d > 0 ? 'up' : 'dn'}" title="未确认 ${d > 0 ? '+' : ''}${d} 点">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</u>` : ''}</span>
            <span class="ag">${gainTxt(k)}</span>
            <span class="ab">
              <button data-alloc="${k}" ${pts ? '' : 'disabled'}>+1</button>
              <button data-alloc="${k}" data-n="5" ${pts >= 5 ? '' : 'disabled'}>+5</button>
              <button class="minus" data-alloc="${k}" data-n="-1" ${mine > 0 ? '' : 'disabled'}>−1</button>
            </span>
          </div>`;
        }).join('')}
      </div>
      ${this.draftBarHTML('attr')}`;
  },

  /* 根基说明浮层：来源 / 每点 / 当前贡献，三段讲清「加了会怎样」 */
  attrTipHTML(key) {
    const s = Game.state, c = CLASSES[s.cls], st = s.stats;
    const w = c.weights[key] || {};
    const lv = s.level, total = Number(st[key]) || 0;
    const baseV = (c.base[key] || 0) + (c.growth[key] || 0) * (lv - 1);
    const gearV = (st.raw && st.raw[key]) || 0;
    const allocV = Game.attrState()[key] || 0;
    const main = c.mainStat === key;
    const lines = Object.keys(w).map(dk =>
      `<div class="at-r"><span>${dName(dk)}</span><b>+${dFmt(dk, w[dk] * total)}</b></div>`).join('');
    return `<div class="tt at-tip">
      <div class="tt-n">${ATTR_NAME[key]} <em>${Math.round(total)}</em>
        <i class="at-tag${main ? ' on' : ''}">${main ? '主属性' : '副属性'}</i></div>
      <div class="at-sub">${c.title} · 每 1 点</div>
      <div class="at-rows">${Object.keys(w).map(dk =>
      `<div class="at-r"><span>${dName(dk)}</span><b>+${dFmt(dk, w[dk])}</b></div>`).join('')}
      </div>
      <div class="at-sub">当前这一项带来</div>
      <div class="at-rows strong">${lines}</div>
      <div class="at-src">基础 ${Math.round(baseV)} · 装备 ${Math.round(gearV)} · 加点 <b>${allocV}</b></div>
      <div class="at-foot">剩余 ${Game.attrPoints()} 点可分配${IS_TOUCH ? '（道途面板里点 +1）' : '（道途面板 C）'}</div>
    </div>`;
  },

  showAttrTip(el, e) {
    if (!Game.state) return;
    this.tooltipEl.innerHTML = this.attrTipHTML(el.dataset.attr);
    this.tooltipEl.style.display = 'block';
    if (e && e.clientX !== undefined && !IS_TOUCH) { this.moveTooltip(e); return; }
    const r = el.getBoundingClientRect();
    const tw = this.tooltipEl.offsetWidth, th = this.tooltipEl.offsetHeight;
    const x = CLAMP(r.left + r.width / 2 - tw / 2, 8, window.innerWidth - tw - 8);
    let y = r.bottom + 8;
    if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    this.tooltipEl.style.left = x + 'px';
    this.tooltipEl.style.top = y + 'px';
  },

  /* 加点之后：属性面板、行囊左列、格子灰显、HUD 一次性刷新 */
  refreshAfterAttr() {
    try { this.renderStats(); } catch (e) { }
    try { this.renderDollStats(); } catch (e) { }
    try { this.renderInventory(); } catch (e) { }
    try { this.renderHUD(); } catch (e) { }
    this.tooltipEl.style.display = 'none';
  },

  /* ============================================================
   * 加点的「草稿 → 确认」（根基 / 天赋 / 技能三处共用）
   *
   * 以前的痛点：加点是不可逆的一次性决策，点错只能洗点（花钱）或者
   * 靠 Shift 退款（只有天赋支持）。现在统一成「先摆好 → 再确认」。
   *
   * 实现方式是**快照**而不是「另存一份草稿值」：
   *   第一次改动时把当前已投的点位拍一份快照，之后照常调加 / 退接口
   *   （silent，不写存档）；「确认」= 存档 + 丢掉快照，
   *   「取消」= 把快照写回去。
   *
   * 为什么不用净值草稿：天赋加点有前置节点 / 本系投入门槛 / 协同显形
   * 三重校验，全都读「已投入」，另存一份草稿就得把这三处校验全部重写一遍，
   * 还容易和真实状态算出两套结果。快照方案下所有校验天然正确 ——
   * 因为它看到的就是真实状态，只是还没落盘。
   * ============================================================ */
  snaps: null,

  /* 拍快照。已有快照就不覆盖：否则取消只能退回「上一次点击」，而不是本次会话起点 */
  snapTake(kind) {
    if (!this.snaps) this.snaps = {};
    if (this.snaps[kind]) return;
    const copy = o => JSON.parse(JSON.stringify(o || {}));
    if (kind === 'attr') this.snaps[kind] = copy(Game.attrState());
    else if (kind === 'talent') this.snaps[kind] = copy(Game.talentState().spent);
    else if (kind === 'skill') this.snaps[kind] = copy(Game.skillState());
  },
  snapDirty(kind) { return !!(this.snaps && this.snaps[kind]); },

  /* 给存档层用：把当前挂起的草稿交出去（没有就返回 null）。
   * 存在的意义见 Game.save 里的注释 —— 草稿绝不能进存档。 */
  snapHold() {
    if (!this.snaps) return null;
    const h = {};
    for (const k of ['attr', 'talent', 'skill']) if (this.snaps[k]) h[k] = this.snaps[k];
    return Object.keys(h).length ? h : null;
  },

  /* 静默丢弃快照：用于「外部动作已经把整份加点状态翻篇了」的场合
   * （根基洗点 / 天赋重置）。这时回滚没有意义，直接丢掉；
   * 否则洗完点一按「确认」，草稿又会把刚洗掉的点加回去。 */
  draftClear(kind) {
    if (this.snaps) delete this.snaps[kind];
  },

  /* 和快照的差异：面板上要写清「你改了哪几项」 */
  snapDiff(kind) {
    if (!this.snapDirty(kind)) return [];
    const snap = this.snaps[kind] || {};
    let cur, label;
    if (kind === 'attr') { cur = Game.attrState(); label = id => ATTR_NAME[id] || id; }
    else if (kind === 'talent') { cur = Game.talentState().spent; label = id => { const e = Game.talentNodeOf(id); return (e && e.node && e.node.name) || id; }; }
    else { cur = Game.skillState(); label = id => (SKILLS[id] && SKILLS[id].name) || id; }
    const out = [];
    const add = (id, d) => { if (d) out.push({ id, name: label(id), delta: d }); };
    if (kind === 'skill') {
      const ids = new Set([...Object.keys(snap), ...Object.keys(cur)]);
      for (const id of ids) {
        const c = cur[id] || {}, sn = snap[id] || {};
        const dl = (c.lv || 1) - (sn.lv || 1);
        /* [P2] 取向也占点：账本要一起算，否则选了取向草稿条不出现 */
        const pc = (typeof skillBranchPickValid === 'function' && skillBranchPickValid(c.lv || 1, c.p)) ? 1 : 0;
        const ps = (typeof skillBranchPickValid === 'function' && skillBranchPickValid(sn.lv || 1, sn.p)) ? 1 : 0;
        const d = dl + (pc - ps);
        /* 换向不花点（点数差为 0），但确实是一处未确认改动 ——
         * 用 delta 0 表示「改了，但点数没变」，草稿条上写「改向」。 */
        if (d) add(id, d);
        else if (pc && ps && c.p !== sn.p) out.push({ id, name: label(id), delta: 0 });
      }
    } else {
      const ids = new Set([...Object.keys(snap || {}), ...Object.keys(cur || {})]);
      for (const id of ids) add(id, (cur[id] || 0) - (snap[id] || 0));
    }
    return out;
  },

  snapCommit(kind) {
    if (!this.snapDirty(kind)) return false;
    const diff = this.snapDiff(kind);
    delete this.snaps[kind];
    try { Game.save(); } catch (e) { }
    if (diff.length) this.toast('已生效（' + diff.length + ' 项）');
    return true;
  },

  snapRevert(kind) {
    if (!this.snapDirty(kind)) return false;
    const snap = this.snaps[kind];
    delete this.snaps[kind];
    if (kind === 'attr') {
      Game.state.attrAlloc = snap || {};
    } else if (kind === 'talent') {
      /* 只换 spent，presets / respecCount 要留着 */
      Game.talentState().spent = snap || {};
    } else if (kind === 'skill') {
      Game.state.skills = snap || {};
    }
    try { Game.recalc(); } catch (e) { }
    try { Game.save(); } catch (e) { }
    return true;
  },

  /* 重绘受影响的界面（确认 / 取消 / 单次改动后） */
  repaintDraft(kind) {
    if (kind === 'attr') {
      try { this.renderAttrAlloc(); } catch (e) { }
      this.refreshAfterAttr();
    } else if (kind === 'talent') {
      try { this.renderTalentPanel(); } catch (e) { }
      try { this.drawTalentCanvas(); } catch (e) { }
    } else if (kind === 'skill') {
      try { this.renderSkillPanel(); } catch (e) { }
    }
  },

  /* 面板底部那条：只在有未确认改动时出现 */
  draftBarHTML(kind) {
    if (!this.snapDirty(kind)) return '';
    const diff = this.snapDiff(kind);
    if (!diff.length) return '';
    const total = diff.reduce((a, x) => a + x.delta, 0);
    const items = diff.map(x => x.delta === 0
      ? `<span class="db-it">${x.name} 改向</span>`
      : `<span class="db-it ${x.delta > 0 ? 'p' : 'm'}">${x.name} ${x.delta > 0 ? '+' : ''}${x.delta}</span>`
    ).join('');
    return `<div class="dbar">
      <span class="db-lab">未确认<span class="db-sum">${total > 0 ? '+' : ''}${total}</span></span>
      <span class="db-list">${items}</span>
      <span class="db-btns">
        <button class="db-ok" data-dcommit="${kind}">确 认</button>
        <button class="db-no" data-dclear="${kind}">取 消</button>
      </span>
    </div>`;
  },


  renderStats() {
    const s = Game.state, st = s.stats;
    const G = this.statGroups();
    this.renderAttrAlloc();
    document.getElementById('statList').innerHTML = G.map(([title, list]) =>
      `<div class="st-grp">${title}</div>` +
      list.map(r => `<div${r[2] ? ` data-attr="${r[2]}"` : ''}><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
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
      el.innerHTML = `<span class="sr-time">下次换货 <b>--:--</b></span>
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
  /* [M6] 仓库面板：**独立浮层**，不进主菜单。
   * 入口只有一个 —— 村里的仓管·玄贮。所以这里不注册进 MENU_TABS，
   * 也不给快捷键：给个 G 键就等于把 NPC 又绕过去了。 */
  openStash() {
    if (!Game.state) return;
    const p = document.getElementById('stashPanel');
    if (!p) return;
    this.closeAll(p);
    /* 如果这个面板之前被 menuMount 搬进过 #menuBody，先送回来 ——
     * 否则菜单关着的时候给它加 .open，它会挂在隐藏的容器里，看不见。 */
    this.menuUnmount();
    if (typeof Game !== 'undefined' && Game.exitLook) Game.exitLook();
    p.classList.add('open');
    this.renderStash();
    try { SFX.ui(); } catch (e) { }
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

  /* ======================================================= */
  /* [M6] 仓库（储物箱）                                        */
  /* ======================================================= */
  /* 面板状态放在 UI 上而不是 Game 里：筛选条件属于「这次看的方式」，
   * 不该跟着存档走。换角色回来还是全部 / 无搜索。 */
  stashFilter: { cat: 'all', q: '', fit: false },
  stashUpOpen: false,

  /* 搜索用的一行文本：名称 + 基底 + 品质 + 部位 + 词缀属性名。
   * 不做缓存 —— 挂在物品上的缓存字段会被 JSON 一起写进存档，
   * 每件装备多一个 _sm 字段，仓库 200 件就是白占几十 KB。
   * 每次现拼也就几个字符串，200 件量级完全够快。 */
  stashMatchText(it) {
    if (!it) return '';
    const parts = [it.name, it.baseName, (RARITY[it.rarity] || {}).name, (SLOTS[it.slot] || {}).name];
    const push = (a) => {
      if (!a) return;
      const s = STATS[a.key];
      if (s && s.label) parts.push(s.label);
    };
    if (Array.isArray(it.affixes)) it.affixes.forEach(push);
    if (Array.isArray(it.fixed)) it.fixed.forEach(push);
    if (it.implicit) push(it.implicit);
    return parts.filter(Boolean).join(' ').toLowerCase();
  },

  renderStash() {
    const p = document.getElementById('stashPanel');
    if (!p || !Game.state || typeof Game.stashItems !== 'function') return;
    const s = Game.state;
    const inv = s.inventory || [];
    const bagCap = Game.bagCap();
    const cap = Game.stashCap();
    const all = Game.stashItems();

    /* ---------- 左列：行囊 ---------- */
    const bc = document.getElementById('stashBagCap');
    if (bc) bc.textContent = `${inv.length} / ${bagCap}`;
    const bg = document.getElementById('stashBagGrid');
    if (bg) {
      let h = '';
      for (let i = 0; i < bagCap; i++) {
        const it = inv[i];
        if (!it) { h += '<div class="islot"></div>'; continue; }
        const tag = (SLOTS[it.slot] || {}).name || '';
        const sz = it.slot ? slotSize(it.slot) : '';
        const miss = !Game.meetsReq(it);
        const sb = it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
        h += `<div class="islot ${sz ? 'sz-' + sz : ''} r-${it.rarity}${miss ? ' req-miss' : ''}"
          ${it.slot ? `data-size="${sz}"` : ''} data-ref="sbag:${i}">
          <span class="ico">${itemIcon(it)}</span>${sb}<span class="slot-tag">${tag.slice(0, 1)}</span></div>`;
      }
      bg.innerHTML = h;
    }

    /* ---------- 右列：仓库 ---------- */
    const cEl = document.getElementById('stashCap');
    if (cEl) cEl.textContent = `${all.length} / ${cap}`;
    const upBtn = document.getElementById('stashUpBtn');
    if (upBtn) {
      const info = Game.stashUpgradeInfo();
      upBtn.classList.toggle('full', !info.next);
      upBtn.textContent = info.next ? '扩 容' : '已 满';
      upBtn.title = info.next ? `扩容仓库（当前 ${cap} 格）` : `仓库已扩至极限 ${cap} 格`;
    }

    const cats = document.getElementById('stashCats');
    if (cats) {
      cats.innerHTML = STASH_CATS.filter(c => c.id !== 'set').map(c =>
        `<button class="sbtn${this.stashFilter.cat === c.id ? ' on' : ''}" data-scat="${c.id}">${c.name}</button>`
      ).join('');
    }
    const se = document.getElementById('stashSearch');
    if (se && se.value !== this.stashFilter.q) se.value = this.stashFilter.q;
    const fb = document.getElementById('stashOnlyFit');
    if (fb) fb.classList.toggle('on', !!this.stashFilter.fit);

    const q = (this.stashFilter.q || '').trim().toLowerCase();
    const rows = [];
    all.forEach((it, i) => {
      if (!it) return;
      if (this.stashFilter.cat !== 'all' && stashCatOf(it) !== this.stashFilter.cat) return;
      if (this.stashFilter.fit && !Game.meetsReq(it)) return;
      if (q && this.stashMatchText(it).indexOf(q) < 0) return;
      rows.push({ it, i });
    });

    const grid = document.getElementById('stashGrid');
    if (grid) {
      let h = '';
      for (const row of rows) {
        const it = row.it;
        const tag = (SLOTS[it.slot] || {}).name || '';
        const sz = it.slot ? slotSize(it.slot) : '';
        const miss = !Game.meetsReq(it);
        const sb = it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
        /* ref 用**真实下标**，不是筛选后的序号 —— 视图顺序和数组顺序不一致时，
         * 用序号点格子会取错物品（背包那边踩过这个坑，注释在第 152 行）。 */
        h += `<div class="islot ${sz ? 'sz-' + sz : ''} r-${it.rarity}${miss ? ' req-miss' : ''}"
          ${it.slot ? `data-size="${sz}"` : ''} data-ref="stash:${row.i}">
          <span class="ico">${itemIcon(it)}</span>${sb}<span class="slot-tag">${tag.slice(0, 1)}</span></div>`;
      }
      /* 只在没筛选时补空格：筛出 3 件却铺满 60 个空格会让人以为东西丢了 */
      if (rows.length === all.length) {
        for (let i = rows.length; i < cap; i++) h += '<div class="islot"></div>';
      }
      grid.innerHTML = h;
    }

    const foot = document.getElementById('stashFoot');
    if (foot) {
      const free = Math.max(0, cap - all.length);
      const extra = rows.length !== all.length ? ` · 筛出 <b>${rows.length}</b> 件` : '';
      foot.innerHTML = `<b>仓库跨角色共享</b>，所有角色位读同一份，换号不丢东西 · 剩 <b>${free}</b> 格${extra}<br>
        左键行囊物品＝存入 · 左键仓库物品＝取回 · 「整理」按 部位 → 品质 → 等级 排序`;
    }

    /* 左列底部的概览：品质分布 + 占用条，顺便把行囊下方那片空白填掉 */
    const sumEl = document.getElementById('stashSum');
    if (sumEl) {
      const rk = Object.keys(RARITY);
      const cnt = {};
      all.forEach(it => { if (it) cnt[it.rarity] = (cnt[it.rarity] || 0) + 1; });
      const q = rk.filter(k => cnt[k]).map(k =>
        `<span style="color:${RARITY[k].color}">${RARITY[k].name} ${cnt[k]}</span>`).join('　');
      const pct = cap ? Math.min(100, Math.round(all.length / cap * 100)) : 0;
      sumEl.innerHTML = `<div class="ss-h"><b>仓 库 概 览</b><i>${all.length} / ${cap} 格</i></div>
        <div class="ss-bar"><i style="width:${pct}%"></i></div>
        <div class="ss-q">${q || '<span style="color:#5e594e">库房空空，先把不用的收起来</span>'}</div>`;
    }

    this.renderStashUpBar();
    this.renderStashMats();
    this.renderStashSets();
  },

  /* 扩容条：结构与行囊那条一致（.upbar / .urow / .ucap / .udots），
   * 只是计价单位从「玄晶 + 铜钱」换成纯铜钱。 */
  renderStashUpBar() {
    const bar = document.getElementById('stashUpBar');
    if (!bar) return;
    if (!this.stashUpOpen) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    const info = Game.stashUpgradeInfo();
    const gold = Math.max(0, Math.round(Game.state.gold || 0));
    const dots = [];
    for (let i = 0; i < info.maxTier; i++) {
      dots.push(`<span class="${i < info.tier ? 'done' : (i === info.tier && info.next ? 'now' : '')}"></span>`);
    }
    let h;
    if (info.next) {
      h = `<div class="urow">
          <span class="utitle">储物箱</span>
          <span class="ucap"><b>${info.cap}</b><em>→</em><b class="nx">${info.next.cap}</b>格</span>
          <span class="udots">${dots.join('')}</span>
          <span class="utier">第 ${info.tier + 1}/${info.maxTier} 次</span>
        </div>
        <div class="urow">
          <span class="ucosts"><span class="cst"><span class="nm" style="color:#e0c070">铜钱</span>
            <span class="hv ${gold >= info.next.gold ? '' : 'bad'}"><b>${gold}</b><u>/${info.next.gold}</u></span></span></span>
          <button class="ugo" data-stashupgo ${info.can ? '' : 'disabled'}>扩 容</button>
        </div>
        <div class="uhint">仓库跨角色共享，扩容一次三个角色都受益。${info.can ? '' : '还差：' + info.lack.join('、') + '。'}</div>`;
    } else {
      h = `<div class="urow">
          <span class="utitle">储物箱</span>
          <span class="ucap"><b class="nx">${info.cap}</b>格</span>
          <span class="udots">${dots.join('')}</span>
          <span class="utier">已达上限 · 共 ${info.maxTier} 次</span>
        </div>
        <div class="uhint">仓库已扩至 ${info.cap} 格，再多就撑破了。</div>`;
    }
    bar.style.display = '';
    bar.innerHTML = h;
  },

  /* 材料仓：玄晶 / 匠材 / 符文。与背包「材料」页同一套格子与提示，
   * 但这里只列材料（不含丹药与任务物品 —— 那两样是随身消耗品）。 */
  renderStashMats() {
    const el = document.getElementById('stashMats');
    if (!el) return;
    const RUNE_COLOR = { 1: '#a0a0a0', 2: '#67a9ff', 3: '#c084ff', 4: '#ffd166' };
    const cells = [];
    CRYSTAL_TIERS.forEach((t, i) => cells.push({
      icon: matIcon('crystal' + (i + 1), { size: 30, color: t.color, glow: i >= 2 }),
      color: t.color, name: t.name + '（' + (i + 1) + ' 阶）',
      sub: '炼器 / 洗练 / 扩容的通货', desc: '分解装备所得，凡 → 灵 → 玄 → 神 逐阶精纯。',
      qty: Game.crystalTierCount(i + 1)
    }));
    for (const id of CRAFT_MAT_ORDER) {
      const d = CRAFT_MATS[id];
      cells.push({
        icon: matIcon(d.icon, { size: 30, color: d.color, glow: d.tier >= 3 }),
        color: d.color, name: d.name,
        sub: CRAFT_TIER_NAME[d.tier] + ' · 来自' + d.from,
        desc: d.desc, qty: Game.craftMatCount(id)
      });
    }
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
    /* 与背包共用 _matTips / [data-mti] 那条悬停通道。
     * 两个面板不会同时渲染（menuMount 只挂一个），互相覆盖不会串。 */
    this._matTips = cells;
    el.innerHTML = '<div class="mgrid">' + cells.map((c, i) => `
      <div class="mgcell${c.qty ? '' : ' off'}" data-mti="${i}" style="--mc:${c.color}">
        <span class="mg-ico">${c.icon}</span>
        <span class="mg-qty">${c.qty > 999 ? '999+' : c.qty}</span>
      </div>`).join('') + '</div>';
    if (IS_TOUCH) {
      el.querySelectorAll('[data-mti]').forEach(row => {
        row.addEventListener('click', e => {
          const c = this._matTips[+row.dataset.mti];
          if (c) this.showMatTip(c, e);
        });
      });
    }
  },

  /* 套装收藏柜：只列「已登记」「已集齐」「差 1 件」三种，
   * 三十多套全铺出来会变成一面墙，反而找不到能点的那几行。 */
  renderStashSets() {
    const el = document.getElementById('stashSets');
    if (!el) return;
    const reg = Game.stashData().sets || {};
    const list = (typeof Game.setCollectList === 'function') ? Game.setCollectList() : [];
    const rows = [];
    let rest = 0;
    for (const info of list) {
      if (reg[info.setId]) { rows.push({ info, mode: 'reg' }); continue; }
      if (info.ok) { rows.push({ info, mode: 'ok' }); continue; }
      if (info.miss.length <= 1) { rows.push({ info, mode: 'near' }); continue; }
      rest++;
    }
    if (!rows.length) {
      el.innerHTML = `<div class="ft-empty">还没有集齐的套装。集齐一整套后可以在这里<b>登记收藏</b>——
        登记后不占仓库格子，随时原样取回（词缀、孔位、符文都保留）。${rest ? `另有 ${rest} 套尚未集齐。` : ''}</div>`;
      return;
    }
    el.innerHTML = rows.map(({ info, mode }) => {
      const set = SETS[info.setId];
      /* 已登记的套装，实物在收藏柜里而不在行囊/仓库，setCollectInfo 会算成 0 件。
       * 这里直接读收藏柜的件数，否则会出现「【血怒】0/3 已收藏」这种自相矛盾的显示。 */
      const got = (mode === 'reg')
        ? ((reg[info.setId] && reg[info.setId].pieces) || []).length
        : (info.total - info.miss.length);
      let btn, sub;
      if (mode === 'reg') {
        sub = '已收藏';
        btn = `<button class="sbtn" data-setout="${info.setId}">取 出</button>`;
      } else if (mode === 'ok') {
        sub = '可登记';
        btn = `<button class="sbtn on" data-setin="${info.setId}">登 记</button>`;
      } else {
        sub = '差 ' + info.miss.map(sl => (SLOTS[sl] || {}).name || sl).join('、');
        btn = `<button class="sbtn" disabled>差 ${info.miss.length}</button>`;
      }
      return `<div class="setrow ${mode === 'reg' ? 'reg' : (mode === 'ok' ? 'done' : '')}">
        <span class="sn" style="color:${set ? set.color : '#c9a86a'}">【${set ? set.name : info.setId}】${got}/${info.total}</span>
        <span class="sp">${sub}</span>${btn}</div>`;
    }).join('') + (rest ? `<div class="sp" style="padding:4px 2px;color:#5e594e">另有 ${rest} 套尚未集齐</div>` : '');
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
  /* [M12] 小地图下面那行字：地图名 · 当前区域名。
   * 只写地图名的话，「区域 + 走廊」这个结构在 UI 上完全看不见；
   * 单区地图（桃源村）和试炼场不加后缀。 */
  zoneLabel(s) {
    const base = MAPS[s.mapId].name;
    if (typeof zoneAt !== 'function' || typeof mapZones !== 'function') return base;
    const zs = mapZones(s.mapId);
    if (!zs || zs.length < 2) return base;
    const z = zoneAt(s.mapId, s.playerPos.x, s.playerPos.z);
    return z ? base + ' · ' + z.name : base;
  },

  drawMinimap() {
    const s = Game.state;
    if (!s) return;
    const cv = document.getElementById('minimap');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, R = W / 2;
    const map = MAPS[s.mapId];
    /* [v1.12.1] 小地图显示半径不能直接挂 map.size —— 区域放大后 size 跟着涨，
     * 挂 size 会让小地图一次显示整张图，区域轮廓糊成一团小方块。
     * 改成按 zone 包围盒算，再夹在 30~58 米之间：
     * 桃源村（半径 31）刚好能看全，战斗图固定显示身边 ~58 米的局部。 */
    const zs = (typeof mapZones === 'function') ? mapZones(s.mapId) : null;
    let span = map.size * 0.5;
    if (zs) {
      let mr = 0;
      for (const z of zs) {
        const hw = z.type === 'circle' ? z.r : z.w / 2;
        const hh = z.type === 'circle' ? z.r : z.h / 2;
        mr = Math.max(mr, Math.hypot(Math.abs(z.x) + hw, Math.abs(z.z) + hh));
      }
      span = mr * 1.12;
    }
    span = Math.max(30, Math.min(span, 52));
    const scale = R / span;
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

    /* [M12] 区域轮廓：矩形房间 / 圆形场地 / 走廊各画一遍。
     * 走廊用暗一档的填充，房间带描边 —— 玩家能一眼看出「哪是路、哪是屋子」，
     * 而不是原来那种「一片圆 + 几个点」。 */
    if (zs) {
      if (zs.length > 1) {
        const el = document.getElementById('zoneName');
        const txt = this.zoneLabel(s);
        if (el && el.textContent !== txt) el.textContent = txt;
      }
      for (const z of zs) {
        g.beginPath();
        if (z.type === 'circle') g.arc(tx(z.x), tz(z.z), z.r * scale, 0, 7);
        else g.rect(tx(z.x - z.w / 2), tz(z.z - z.h / 2), z.w * scale, z.h * scale);
        const isLink = z.kind === 'link';
        const isBoss = z.kind === 'boss';
        g.fillStyle = isLink ? '#332f24' : (isBoss ? '#3d2a2a' : '#45402f');
        g.fill();
        g.strokeStyle = isBoss ? 'rgba(255,90,70,.5)' : (isLink ? 'rgba(216,178,90,.16)' : 'rgba(216,178,90,.38)');
        g.lineWidth = isLink ? 1 : 1.4;
        g.stroke();
      }
    } else {
      // 网格（没有区域配置的图，例如试炼擂台）
      g.strokeStyle = 'rgba(216,178,90,.06)'; g.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        g.beginPath(); g.moveTo(R + i * 40, 0); g.lineTo(R + i * 40, H); g.stroke();
        g.beginPath(); g.moveTo(0, R + i * 40); g.lineTo(W, R + i * 40); g.stroke();
      }
    }

    /* 视野扇形：朝向前方 70°，压在区域上面，用来指示朝向 */
    {
      const fa = Math.atan2(Game.playerFace.x, Game.playerFace.z);
      g.save();
      g.translate(R, R); g.rotate(fa);
      const fan = g.createRadialGradient(0, 0, 4, 0, 0, R * 0.62);
      fan.addColorStop(0, 'rgba(240,224,184,.20)');
      fan.addColorStop(1, 'rgba(240,224,184,0)');
      g.fillStyle = fan;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.62, -0.61, 0.61); g.closePath(); g.fill();
      g.restore();
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
  },

  /* ============================================================
   * 无尽试炼（v2.0）
   * 入口面板 / 左上角战况 / 开场大字 / 三选一 / 结算
   * 状态与数值全部在 src/trial.js，这里只管「怎么显示」。
   * ============================================================ */

  /* ---------------- 入口面板 ---------------- */
  openTrialPanel() {
    if (!Game.state) return;
    const s = Game.state;
    const rec = s.trial || { best: 0, runs: 0, bestAt: 0 };
    const need = TRIAL_CFG.unlockLevel;
    const lock = s.level < need;
    const body = document.getElementById('trialPanelBody');
    if (!body) return;
    const bestTxt = rec.best > 0
      ? `<div class="tp-rec"><div><div class="k">最高纪录</div><div class="v">${rec.best}<small>波</small></div></div>
         <div><div class="k">挑战次数</div><div class="v">${rec.runs}<small>次</small></div></div></div>`
      : `<div class="tp-rec"><div><div class="k">最高纪录</div><div class="v">—</div></div>
         <div><div class="k">挑战次数</div><div class="v">${rec.runs || 0}<small>次</small></div></div></div>`;
    body.innerHTML = `
      <div class="tp-hero">
        <h4>无限波数 · 每波三选一 · 越战越强</h4>
        <p>擂台之上，妖潮无穷。每清一波，可从三项祝福里择一强化自身；每五波一位首领，
           每十波一位试炼之主。台上没有终点，只有你站到第几波。</p>
        <div class="tp-rules">
          <div class="tp-rule"><b>祝福</b>：基础数值 / 装备效果 / 技能效果，三类随机</div>
          <div class="tp-rule"><b>首领</b>：每 5 波一位，每 10 波大首领带精英护卫</div>
          <div class="tp-rule"><b>掉落</b>：每 3 波必出装备，首领波必出 2~3 件</div>
          <div class="tp-rule"><b>规则</b>：死亡即终止，本轮所得全部保留</div>
        </div>
        ${bestTxt}
        ${lock ? `<div class="tp-lock">需境界 ${need} 级方可入场（当前 ${s.level} 级）</div>` : ''}
      </div>
      <div class="tp-acts">
        <button class="btn" onclick="UI.closeAll()">再等等</button>
        <button class="btn primary" id="trialGo" ${lock ? 'disabled' : ''}>踏 上 擂 台</button>
      </div>`;
    const go = document.getElementById('trialGo');
    if (go && !lock) go.addEventListener('click', () => {
      SFX.ui();
      this.closeAll();
      Trial.start();
    });
    this.closeAll(document.getElementById('trialPanel'));
    document.getElementById('trialPanel').classList.add('open');
  },

  /* ---------------- 左上角战况 ---------------- */
  _thT: 0,
  renderTrialHud(show) {
    const el = document.getElementById('trialHud');
    if (!el) return;
    if (show === false) { el.classList.remove('on'); return; }
    if (!(typeof Trial !== 'undefined' && Trial.run)) { el.classList.remove('on'); return; }
    el.classList.add('on');
    this.trialHudTick(true);
  },

  /* 每帧会被 Trial.tick 调一次，内部按 0.1 秒节流：
   * 战况文字不需要 60fps，反复写 DOM 反而会挤掉战斗帧。 */
  trialHudTick(force) {
    if (!(typeof Trial !== 'undefined' && Trial.run)) return;
    const now = performance.now();
    if (!force && now - this._thT < 100) return;
    this._thT = now;
    const i = Trial.info();
    if (!i) return;
    const wEl = document.getElementById('thWave');
    const sEl = document.getElementById('thState');
    const aEl = document.getElementById('thAlive');
    const bEl = document.getElementById('thBoss');
    const cEl = document.getElementById('thBless');
    const bar = document.getElementById('thBar');
    if (wEl) wEl.textContent = i.wave;
    if (sEl) {
      if (i.phase === 'prep') sEl.textContent = '妖潮将至 · ' + i.prep.toFixed(1) + 's';
      else if (i.phase === 'choose') sEl.textContent = '清场 · 择祝福';
      else sEl.textContent = '交战中';
    }
    if (aEl) aEl.textContent = i.phase === 'fight' ? ('剩余 ' + i.alive + ' / ' + i.spawned) : '—';
    if (bEl) {
      bEl.textContent = i.isBoss ? (i.isBig ? '试炼之主降临' : '首领战') : (i.nextBoss + ' 波后');
      bEl.style.color = i.isBoss ? '#ff7a5a' : '#ffd479';
    }
    if (cEl) cEl.textContent = i.blessCount;
    if (bar) {
      /* 进度条：战斗中 = 已清比例；读秒 = 读秒进度；翻牌 = 满 */
      let pctv = 100;
      if (i.phase === 'fight') pctv = i.spawned > 0 ? (i.spawned - i.alive) / i.spawned * 100 : 0;
      else if (i.phase === 'prep') pctv = CLAMP(100 - i.prep / Math.max(0.1, TRIAL_CFG.prepTime) * 100, 0, 100);
      bar.style.width = CLAMP(pctv, 0, 100) + '%';
    }
  },

  /* ---------------- 开场大字 ---------------- */
  trialBanner(wave, kind) {
    const el = document.getElementById('trialBanner');
    if (!el) return;
    const sub = document.getElementById('tbSub');
    const main = document.getElementById('tbMain');
    el.classList.remove('show', 'boss', 'big');
    if (kind === 'boss' || kind === 'big') {
      el.classList.add(kind);
      if (sub) sub.textContent = kind === 'big' ? '试 炼 之 主' : '首 领 来 袭';
      if (main) main.innerHTML = '<em>' + wave + '</em> 波';
    } else {
      if (sub) sub.textContent = '第';
      if (main) main.innerHTML = '<em>' + wave + '</em> 波';
    }
    /* 重启动画：先清 class，强制一次回流再挂上，否则同一帧内改 class 不重播 */
    void el.offsetWidth;
    el.classList.add('show');
  },

  /* ---------------- 三选一 ---------------- */
  _trialOffers: [],

  /* 词条明细：把这条祝福要加的 key 摊成「当前 → 选择后」两列。
   * 直接读 stats.raw（已含装备 + 图鉴 + 被动 + 试炼祝福），所以数字是真实生效值，
   * 不是「基础值」——玩家看到的和面板上的一致。 */
  _trialStatRows(b) {
    if (!b.stats) return '';
    const st = (Game.state && Game.state.stats) || {};
    const raw = st.raw || {};
    const keys = Object.keys(b.stats).slice(0, 2);
    const rows = keys.map(k => {
      const meta = (typeof STATS !== 'undefined' && STATS[k]) || null;
      const label = meta ? meta.label : k;
      const isPct = !!(meta && meta.pct);
      const unit = isPct ? '%' : '';
      /* 乘区类（atkPct 等）不在最终面板里，读 raw 的「装备+祝福」小计；
       * crit / aspd / def 这类派生量读最终值，跟角色面板对得上。 */
      const tracked = (k in st) || (k in raw);
      const curV = tracked ? Math.round(Number(k in st ? st[k] : raw[k]) || 0) : 0;
      const addV = Number(b.stats[k]) || 0;
      const addTxt = (addV > 0 ? '+' : '') + addV + unit;
      /* 有底子 → 「当前 → 选后总值」，一眼看出这条值不值；
       * 完全没这属性（点燃几率这类词条）→ 只给增量，别摆出 0 → 7% 的假总账。 */
      const right = (tracked && curV !== 0)
        ? `<i>${curV}${unit}</i><s>→</s><em>${curV + addV}${unit}</em>`
        : `<i>—</i><s>→</s><em>${addTxt}</em>`;
      return `<div class="tc-stat"><span>${label}</span>${right}</div>`;
    }).join('');
    return rows ? `<div class="tc-stats">${rows}</div>` : '';
  },
  openTrialBless(offers, wave) {
    const box = document.getElementById('blCards');
    const root = document.getElementById('trialBless');
    if (!box || !root) return;
    this._trialOffers = offers.slice();
    const kick = document.getElementById('blKicker');
    if (kick) kick.textContent = '第 ' + wave + ' 波 · 清场';
    box.innerHTML = offers.map((b, i) => {
      const col = TRIAL_CAT_COLOR[b.cat] || '#d8b25a';
      const owned = (Trial.run && Trial.run.bless[b.id]) || 0;
      const tierName = ['', '常', '稀', '传'][b.tier] || '';
      const cur = owned > 0
        ? `已叠 <b>${owned}</b> 层 · 上限 ${b.max}`
        : `未持有 · 最多叠 ${b.max} 层`;
      return `<div class="tcard t${b.tier}" data-bid="${b.id}" data-idx="${i}">
        <div class="tc-tier">${tierName}</div>
        <div class="tc-top">
          <div class="tc-icon" style="color:${col}">${b.icon || '祝'}</div>
          <div>
            <div class="tc-name">${b.name}</div>
            <div class="tc-cat" style="color:${col}">${TRIAL_CAT_NAME[b.cat] || ''}</div>
          </div>
        </div>
        <div class="tc-body">
          <div class="tc-desc">${b.desc}</div>
          ${this._trialStatRows(b)}
          <div class="tc-cur">${cur}</div>
        </div>
        <div class="tc-key">${i + 1}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('.tcard').forEach(el => {
      el.addEventListener('click', () => Trial.pickBlessing(el.dataset.bid));
    });
    root.classList.add('open');
    SFX.ui();
  },

  pickTrialByIndex(i) {
    const id = this._trialOffers[i];
    if (id) Trial.pickBlessing(id);
  },

  closeTrialBless() {
    const root = document.getElementById('trialBless');
    if (root) root.classList.remove('open');
    this._trialOffers = [];
  },

  /* ---------------- 结算 ---------------- */
  showTrialEnd(sum) {
    const root = document.getElementById('trialEnd');
    if (!root) return;
    document.getElementById('teWave').textContent = sum.wave;
    const bestEl = document.getElementById('teBest');
    if (bestEl) {
      bestEl.textContent = sum.isBest ? '★ 新 纪 录 ★' : '历史最高 ' + sum.best + ' 波';
      bestEl.style.color = sum.isBest ? '#ffd479' : '#b08a72';
    }
    document.getElementById('teKills').textContent = sum.kills;
    document.getElementById('teItems').textContent = sum.items;
    document.getElementById('teGold').textContent = fmt(sum.gold || 0);
    document.getElementById('teLevel').textContent = sum.levelFrom === sum.levelTo
      ? 'Lv ' + sum.levelTo
      : 'Lv ' + sum.levelFrom + ' → ' + sum.levelTo;
    const hint = document.getElementById('teHint');
    if (hint) {
      const m = Math.floor((sum.seconds || 0) / 60), sec = (sum.seconds || 0) % 60;
      hint.textContent = '本轮用时 ' + m + ' 分 ' + sec + ' 秒 · 所得已全部入袋，死亡不损失装备';
    }
    root.classList.add('open');
  },

  hideTrialEnd() {
    const root = document.getElementById('trialEnd');
    if (root) root.classList.remove('open');
  }
};
