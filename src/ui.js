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
      const el = e.target.closest('[data-ref]');
      if (el) { this.tooltipEl.style.display = 'none'; this.hoverRef = null; }
    });
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-ref]');
      if (!el) {
        if (IS_TOUCH && this.tooltipEl.style.display === 'block') this.hideTooltip();
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

    // 快捷键
    window.addEventListener('keydown', e => {
      if (document.activeElement && document.activeElement.id === 'nameInput') return;
      const k = e.key.toLowerCase();
      if (k === 'i') { this.toggleInv(); e.preventDefault(); }
      else if (k === 't') { this.toggleTalent(); e.preventDefault(); }
      else if (k === 'k') { this.toggleSkill(); e.preventDefault(); }
      else if (k === 'c') { this.toggleStat(); e.preventDefault(); }
      else if (k === 'l') { this.toggleQuest(); e.preventDefault(); }
      else if (k === 'r') { this.toggleForge(); e.preventDefault(); }
      else if (k === 'o') { this.openSettings(); e.preventDefault(); }
      else if (k === 'escape') { this.closeAll(); }
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
    const p = document.getElementById('setPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this.renderSettings();
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
    /* [S4] 技能条 5 格手动配置：空位是虚线占位，点它打开术法面板（K） */
    const slots = Game.skillBar();
    let h = slots.map((id, i) => {
      if (!id) {
        return `<div class="skill empty" data-slot="${i}" title="技能条 ${i + 1}：空位——打开术法面板（K）把技能放上来">
          <span class="k">${i + 1}</span><div class="g">＋</div></div>`;
      }
      const sk = SKILLS[id];
      const castLabel = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
      const rangeLabel = sk.castRange ? ` · ${sk.castRange} 码` : '';
      return `<div class="skill" data-skill="${id}" title="${sk.name} · ${castLabel}${rangeLabel}">
        <span class="k">${i + 1}</span><div class="g">${skillIconSvg(id, 26)}</div>
        <span class="cost">${Game.skillCost(sk)}</span><div class="cd"></div></div>`;
    }).join('') +
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
      const locked = s.level < sk.unlock;
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

  /* ---------------- 背包 ---------------- */
  invJunkOpen: false,      // 一键分解确认条是否展开
  invJunkMagic: false,     // 一键分解是否连带法器
  invTab: 'equip',         // 行囊当前栏：equip / mat / pill / quest
  invUpOpen: false,        // 行囊扩容条是否展开（v1.4.0）
  toggleInv() { const p = document.getElementById('invPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderInventory(); },
  toggleStat() { const p = document.getElementById('statPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderStats(); },
  toggleQuest() { const p = document.getElementById('questPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderQuests(); },
  closeAll(except) {
    /* 关面板时把商店倒计时停掉，否则每秒还在跑一个 setInterval */
    if (this.shopTimer) { clearInterval(this.shopTimer); this.shopTimer = null; }
    document.querySelectorAll('.panel').forEach(p => { if (p !== except) p.classList.remove('open'); });
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
        mat: '玄晶用于炼器与洗练 · 符文用于镶嵌',
        pill: '点一行即服用 · 战斗中亦可',
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
   * 最底一条长格放兵器。具体落位由 CSS 的 grid-template-areas 决定。 */
  renderDoll() {
    const s = Game.state;
    const eq = s.equipment;
    /* 法器（relic）落在右上角，与护肩左右对称（v1.3.0） */
    const order = ['helm', 'shoulders', 'chest', 'relic', 'gloves', 'amulet', 'ring1', 'belt', 'ring2', 'boots', 'weapon', 'offhand'];
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

  /* 材料 / 丹药 / 任务物品：三栏共用一套「图标 + 名称 + 数量」行 */
  renderMatTab(tab) {
    const s = Game.state;
    const el = document.getElementById('invMats');
    if (!el) return;
    const RUNE_COLOR = { 1: '#a0a0a0', 2: '#67a9ff', 3: '#c084ff', 4: '#ffd166' };
    let rows = [];
    if (tab === 'mat') {
      CRYSTAL_TIERS.forEach((t, i) => rows.push({
        color: t.color, glyph: t.label, name: t.name + '（' + (i + 1) + ' 阶）',
        sub: '分解装备获得，炼器与洗练的通货', n: Game.crystalTierCount(i + 1)
      }));
      for (const id in RUNES) {
        const n = Game.runeCount(id);
        if (n > 0) rows.push({
          color: RUNE_COLOR[RUNES[id].tier] || '#c9a86a', glyph: '符', name: RUNES[id].name + '符文',
          sub: RUNES[id].tier + ' 阶 · ' + statLine(RUNES[id].stats), n
        });
      }
      document.getElementById('invCap').textContent = `材料 ${rows.length} 种`;
    } else if (tab === 'pill') {
      const p = s.potions || { hp: 0, mp: 0 };
      rows.push({ color: '#e05a4a', glyph: '丹', name: '回春丹', sub: '立即回复生命', n: p.hp || 0, use: 'hp', key: 'Z' });
      rows.push({ color: '#67a9ff', glyph: '露', name: '凝露', sub: '立即回复灵力', n: p.mp || 0, use: 'mp', key: 'X' });
      rows.push({ color: '#9a9aff', glyph: '阵', name: '传送阵石', sub: '就地开启归途阵', n: s.teleportStones || 0, use: 'tp', key: '9' });
      document.getElementById('invCap').textContent = `丹药 ${rows.reduce((a, r) => a + r.n, 0)} 枚`;
    } else {
      /* 任务物品：已完成的委托留下一枚凭证，纯陈列，不占行囊、不可交易 */
      const done = (s.quests && s.quests.done) || [];
      rows = done.map(id => {
        const q = QUESTS[id];
        if (!q) return null;
        return { color: '#d8b25a', glyph: '凭', name: q.name + '·凭证', sub: q.brief ? q.brief.slice(0, 22) + '…' : '委托完结的凭证', n: 1, fixed: true };
      }).filter(Boolean);
      document.getElementById('invCap').textContent = `任务物品 ${rows.length} 枚`;
      if (!rows.length) {
        el.innerHTML = '<div class="mat-empty">尚无任务物品<br><span>完成一份委托后，凭证会陈列在这里</span></div>';
        return;
      }
    }
    el.innerHTML = rows.map(r => `
      <div class="matrow${r.n ? '' : ' off'}" ${r.use ? `data-use="${r.use}"` : ''} style="--mc:${r.color}">
        <span class="mg">${r.glyph}</span>
        <span class="mn"><b>${r.name}</b><i>${r.sub}</i></span>
        <span class="mt">×${r.n}</span>
        ${r.use ? `<span class="mk">${r.key}</span>` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-use]').forEach(row => {
      row.addEventListener('click', () => {
        const k = row.dataset.use;
        if (k === 'tp') Game.useTeleportStone(); else Game.usePotion(k);
        this.renderInventory();
      });
    });
  },

  renderTabBadges() {
    const s = Game.state;
    if (!s) return;
    const matN = CRYSTAL_TIERS.filter((t, i) => Game.crystalTierCount(i + 1) > 0).length +
      Object.keys(RUNES).filter(id => Game.runeCount(id) > 0).length;
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

  toggleTalent() {
    if (!Game.state) return;
    const p = document.getElementById('talentPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.toggle('open');
    if (p.classList.contains('open')) this.renderTalentPanel();
  },

  openTalent() {
    if (!Game.state) return;
    const p = document.getElementById('talentPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this.renderTalentPanel();
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
    this.drawTalentCanvas();
    this.bindTalentCanvas();
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

  /* 画布只绑一次监听，重绘时复用 */
  bindTalentCanvas() {
    const cv = document.getElementById('tlCanvas');
    if (!cv || cv._tlBound) return;
    cv._tlBound = true;

    /* 高分屏适配：物理像素放大，逻辑坐标仍是 660×440 */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr > 1) {
      cv.width = 660 * dpr; cv.height = 440 * dpr;
      cv.style.width = '660px'; cv.style.height = '440px';
      cv.getContext('2d').scale(dpr, dpr);
    }

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
          if (e2 && Game.state.level < (e2.unlock || 1)) this.toast('需 ' + e2.unlock + ' 级解锁');
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
  },

  talentTipHtml(id) {
    const e = Game.talentNodeOf(id);
    if (!e) return '';
    const n = e.node;
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
    return `<div class="tt-n" style="color:${e.color}">${n.name}</div>
      <div class="tt-r">${e.treeName} · ${tierTxt}${lvTxt}${reqTxt}${n.max > 1 ? ' · 上限 ' + n.max + ' 级' : ''}</div>
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
    if (!uni) {
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
  toggleSkill() {
    if (!Game.state) return;
    const p = document.getElementById('skillPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.toggle('open');
    if (p.classList.contains('open')) this.renderSkillPanel();
  },

  openSkill() {
    if (!Game.state) return;
    const p = document.getElementById('skillPanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this.renderSkillPanel();
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
    const barSlots = Game.skillBar();          // 技能条 5 格当前配置
    document.getElementById('skPtsTxt').innerHTML = `可用技能点 <b>${pts}</b>`;
    if (!this.skSel || !order.includes(this.skSel)) this.skSel = order[0];

    /* 按系分组：SKILL_ORDER 是解锁顺序（动作条用），面板里要聚在一起 */
    const byTree = {};
    for (const id of order) {
      const t = SKILLS[id].tree;
      (byTree[t] = byTree[t] || []).push(id);
    }

    /* 左：图标网格 */
    let h = '<div class="sk-body"><div class="sk-left">';
    for (const t in byTree) {
      h += `<div class="sk-tree">${t}<span class="sk-tn">${byTree[t].length} 式</span></div><div class="sk-tiles">`;
      for (const id of byTree[t]) {
        const sk = SKILLS[id];
        const locked = s.level < sk.unlock;
        const lv = Game.skillLevel(id);
        const onBar = barSlots.indexOf(id);     // 在技能条第几格（-1 = 不在）
        h += `<div class="sk-row sk-tile ${locked ? 'locked' : ''} ${id === this.skSel ? 'sel' : ''}" data-skpick="${id}">
          <span class="sk-ico">${skillIconSvg(id, 26)}</span>
          ${onBar >= 0 ? `<span class="sk-onslot">${onBar + 1}</span>` : ''}
          ${locked ? `<span class="sk-lk">${sk.unlock} 级</span>` : `<span class="sk-badge">${lv}</span>`}
        </div>`;
      }
      h += '</div>';
    }
    h += '</div>';

    /* 右：详情卡 */
    const id = this.skSel, sk = SKILLS[id];
    const locked = s.level < sk.unlock;
    const lv = Game.skillLevel(id);
    const v = Game.skillVariant(id);
    /* 预览伤害：攻击力 × 倍率 ×（变体 + 等级） */
    const smod = mergeSkillMods(Game.skillMod(id), variantMods(sk, v));
    const lvMul = 1 + SKILL_LV_STEP * (lv - 1);
    const spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * lvMul;
    const dmgTxt = Math.round(s.stats.atk * sk.mult * spow);
    const desc = (sk.desc || '').replace(/\{dmg\}/g, '<b style="color:#ffe9a8">' + dmgTxt + '</b>');
    const castTxt = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
    const vars = (sk.variants || []).map((vr, i) =>
      `<button class="sk-vbtn ${i === v ? 'on' : ''}" data-skv="${id}:${i}" title="${vr.desc}">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</button>`
    ).join('');
    const pips = Array.from({ length: SKILL_LV_MAX }, (_, i) => `<span class="sk-pip ${i < lv ? 'on' : ''}"></span>`).join('');
    /* 技能条 5 格：点数字把当前技能放上去（已在条上会从原位移走） */
    const slotBtns = barSlots.map((bid, i) => {
      const occ = bid ? SKILLS[bid] : null;
      const on = bid === id;
      return `<button class="sk-bslot ${on ? 'on' : ''}" data-skbar="${i}" ${locked ? 'disabled' : ''}
        title="${occ ? (on ? '当前技能就在这一格' : '放到 ' + (i + 1) + '（替换「' + occ.name + '」）') : '空位 ' + (i + 1)}">${i + 1}</button>`;
    }).join('');
    h += `<div class="sk-right">
      <div class="sd-head"><span class="sd-ico">${skillIconSvg(id, 30)}</span>
        <div><div class="sd-name">${sk.name}${locked ? `<span class="sk-lock">${sk.unlock} 级领悟</span>` : ''}</div>
        <div class="sd-sub">${sk.tree} · ${locked ? '未领悟' : '等阶 ' + lv}</div></div></div>
      <div class="sd-desc">${desc}</div>
      <div class="sd-meta">消耗 ${Game.skillCost(sk)} · 冷却 ${Game.skillCd(sk).toFixed(1)}s · ${castTxt}${sk.castRange ? ' · ' + sk.castRange + ' 码' : ''}</div>
      <div class="sd-lv"><div class="sk-pips">${pips}</div>
        <span class="sk-lvt"><b>${lv}</b>/${SKILL_LV_MAX}</span>
        <button class="sk-lvb" data-sklv="${id}" ${locked || lv >= SKILL_LV_MAX || pts <= 0 ? 'disabled' : ''}>升级</button></div>
      <div class="sd-vars">${vars}</div>
      <div class="sd-vname">${sk.variants[v].name}：${sk.variants[v].desc}</div>
      <div class="sd-bar"><span class="sd-barlab">技能条</span>
        <span class="sd-barslots">${slotBtns}</span>
        <span class="sd-barhint">${locked ? '领悟后可放上技能条' : '点数字放上技能条（键 1-5 施放）'}</span></div>
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
    /* 放技能上条：点详情卡里的 1-5 */
    list.querySelectorAll('[data-skbar]').forEach(b => b.addEventListener('click', () => {
      const r = Game.assignSkillBar(parseInt(b.dataset.skbar), this.skSel);
      if (r.ok) SFX.ui();
      else this.toast(r.msg, 'bad');
    }));
    /* 图标悬停浮层 */
    const tip = document.getElementById('skTip');
    if (tip) {
      const body = list.closest('.pb');
      list.querySelectorAll('[data-skpick]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          const sk2 = SKILLS[el.dataset.skpick];
          const lk = s.level < sk2.unlock;
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
    const order = ['weapon', 'helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'offhand'];
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

  setHelp(html) { document.getElementById('help').innerHTML = html; },

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
