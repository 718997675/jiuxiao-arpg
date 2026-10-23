/* ============================================================
 * UI 层：HUD / 背包纸娃娃 / 提示框 / 任务 / 对话 / 商店 / 传送 / 小地图
 * ============================================================ */

const UI = {
  selectedCls: 'warrior',
  tooltipEl: null,
  hoverRef: null,

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
    const order = SKILL_ORDER[s.cls];
    const bar = document.getElementById('actionbar');
    bar.innerHTML = order.map((id, i) => {
      const sk = SKILLS[id];
      const castLabel = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
      const rangeLabel = sk.castRange ? ` · ${sk.castRange} 码` : '';
      return `<div class="skill" data-skill="${id}" title="${sk.name} · ${castLabel}${rangeLabel}">
        <span class="k">${i + 1}</span><div class="g">${sk.glyph}</div>
        <span class="cost">${Game.skillCost(sk)}</span><div class="cd"></div></div>`;
    }).join('') +
      `<div class="potion" data-potion="hp"><span class="k">7</span><div class="g">丹</div><div class="n">红药</div></div>
       <div class="potion blue" data-potion="mp"><span class="k">8</span><div class="g">露</div><div class="n">蓝药</div></div>
       <div class="potion" data-tp="1" style="background:rgba(120,160,255,.22);border-color:rgba(120,160,255,.45)"><span class="k">9</span><div class="g">阵</div><div class="n">传送</div></div>`;

    bar.querySelectorAll('.skill').forEach(el => {
      el.addEventListener('click', () => Game.castSkill(el.dataset.skill));
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
      const id = el.dataset.skill, sk = SKILLS[id];
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
    const eq = s.equipment;
    const order = ['helm', 'shoulders', 'amulet', 'chest', 'gloves', 'belt', 'boots', 'ring1', 'ring2', 'weapon', 'offhand'];
    const grid = document.getElementById('dollGrid');
    grid.innerHTML = order.map(slot => {
      const it = eq[slot];
      const r = it ? RARITY[it.rarity] : null;
      const sb = it && it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
      return `<div class="eslot ${it ? 'filled' : 'empty'}" ${it ? `data-ref="eq:${slot}"` : ''} style="${it ? `border-color:${r.color}55;box-shadow:inset 0 0 12px ${r.color}22` : ''}">
        <span class="lbl">${SLOT_NAME[slot]}</span>
        ${sb}
        ${it ? `<span class="ico">${itemIcon(it)}</span>` : `<span class="ico empty"></span>`}
      </div>`;
    }).join('');

    const inv = s.inventory;
    document.getElementById('invCap').textContent = `${inv.length} / ${s.maxInv}`;
    const ig = document.getElementById('invGrid');
    let html = '';
    for (let i = 0; i < s.maxInv; i++) {
      const it = inv[i];
      if (it) {
        const tag = (SLOTS[it.slot] || {}).name || it.kind || '';
        const sb = it.sockets ? `<span class="sockbadge">◆${(it.runes || []).filter(Boolean).length}/${it.sockets}</span>` : '';
        html += `<div class="islot r-${it.rarity}" data-ref="inv:${i}">
          <span class="ico">${itemIcon(it)}</span>${sb}<span class="slot-tag">${tag.slice(0, 1)}</span></div>`;
      } else {
        html += `<div class="islot"></div>`;
      }
    }
    ig.innerHTML = html;

    const st = s.stats;
    document.getElementById('statBox').innerHTML = `
      <div>攻击 <b>${Math.round(st.atk)}</b></div><div>护甲 <b>${Math.round(st.def)}</b></div>
      <div>生命 <b>${Math.round(st.hpMax)}</b></div><div>灵力 <b>${Math.round(st.mpMax)}</b></div>
      <div>暴击 <b>${st.crit.toFixed(1)}%</b></div><div>爆伤 <b>${Math.round(st.critDmg)}%</b></div>`;

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

    const sets = Object.keys(st.setCount).filter(k => st.setCount[k] >= 2);
    const line = document.getElementById('setLine');
    if (sets.length) {
      line.innerHTML = sets.map(id => {
        const set = SETS[id], n = st.setCount[id];
        const active = set.bonuses.filter(b => n >= b.need).map(b => b.text).join('；');
        return `<div style="color:${set.color}">【${set.name}】${n}/${set.pieces.length}　<span style="color:#9ad0a8">${active}</span></div>`;
      }).join('');
    } else line.innerHTML = '<span style="color:#6a6458">集齐套装可获得额外之力（绿色边框为套装部件）</span>';
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
    const sets = Object.values(SETS);
    let h = '';
    for (const set of sets) {
      const mine = owned[set.id] || [];
      totalOwned += mine.length;
      totalPieces += set.pieces.length;
      const clsTxt = set.cls ? '限 ' + CLASSES[set.cls].name : '全职业';
      h += `<div class="cx-set" style="border-color:${set.color}33">
        <div class="cx-head">
          <span class="cx-name" style="color:${set.color}">${set.name}</span>
          <span class="cx-sub">${clsTxt} · 已集 <b style="color:${set.color}">${mine.length}</b> / ${set.pieces.length}</span>
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
    document.getElementById('setCodexList').innerHTML = h;
    document.getElementById('setCodexSum').innerHTML =
      `共 <b>${sets.length}</b> 套 · <b>${totalPieces}</b> 件部件 · 已收集 <b style="color:#ffd166">${totalOwned}</b> 件`;
  },

  renderStats() {
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

  /* [S3] 筛选出售 */
  openSellFilter() {
    const rarities = ['common', 'magic', 'rare'];
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
