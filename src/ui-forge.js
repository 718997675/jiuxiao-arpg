/* ============================================================
 * 炼器台 UI（S2）
 * · 符文页：选装备 → 选孔位 → 点符文镶嵌；点已镶符文可取回
 * · 洗练页：选装备 → 选一条词缀重 roll（消耗玄晶，稀有度不变）
 * 只做展示与交互，数值结算全部走 Game.socketRune / unsocketRune / reforgeItem
 * ============================================================ */

Object.assign(UI, {
  forgeTab: 'rune',
  forgeRef: null,
  forgeSocket: -1,
  forgeTarget: null,          // 定向洗炼 { index, key, pick }：pick=false 升级单条 / pick=true 换指定词条
  _forgeBound: false,

  toggleForge() {
    const p = document.getElementById('forgePanel');
    if (!p) return;
    if (p.classList.contains('open')) { this.closeAll(); return; }
    this.openForge();
  },

  openForge(ref) {
    if (!Game.state) return;
    if (ref && this.itemFromRef(ref)) { this.forgeRef = ref; this.forgeSocket = -1; }
    const p = document.getElementById('forgePanel');
    if (!p) return;
    this.closeAll(p);
    p.classList.add('open');
    this._bindForge();
    if (!this.forgeRef || !this.itemFromRef(this.forgeRef)) this.forgeRef = this.firstForgeRef();
    this.renderForge();
  },

  _bindForge() {
    if (this._forgeBound) return;
    this._forgeBound = true;
    const p = document.getElementById('forgePanel');
    p.querySelectorAll('.ftab').forEach(b => b.addEventListener('click', () => {
      if (this.forgeTab === b.dataset.ftab) return;
      this.forgeTab = b.dataset.ftab;
      this.forgeSocket = -1;
      this.forgeTarget = null;
      const list = this.forgeItemList();
      if (!list.some(x => x.ref === this.forgeRef)) this.forgeRef = list.length ? list[0].ref : null;
      SFX.ui();
      this.renderForge();
    }));

    document.getElementById('forgeList').addEventListener('click', e => {
      const row = e.target.closest('[data-fref]');
      if (!row || row.dataset.fref === this.forgeRef) return;
      this.forgeRef = row.dataset.fref;
      this.forgeSocket = -1;
      this.forgeTarget = null;
      SFX.ui();
      this.renderForge();
    });

    document.getElementById('forgeMain').addEventListener('click', e => {
      const item = this.itemFromRef(this.forgeRef);
      if (!item) return;

      const sockEl = e.target.closest('[data-fsock]');
      if (sockEl) {
        const i = parseInt(sockEl.dataset.fsock, 10);
        if (item.runes && item.runes[i]) {
          const r = Game.unsocketRune(item, i);
          if (r.ok) { this.forgeSocket = -1; this.renderForge(); }
        } else {
          this.forgeSocket = i;
          SFX.ui();
          this.renderForge();
        }
        return;
      }

      const runeEl = e.target.closest('[data-frune]');
      if (runeEl) {
        const id = runeEl.dataset.frune;
        if (Game.runeCount(id) <= 0) return;
        const rs = itemRunes(item);
        let idx = this.forgeSocket;
        if (idx < 0 || idx >= rs.length || rs[idx]) idx = rs.findIndex(x => !x);
        if (idx < 0) { UI.log('没有空孔了，先取下一枚符文。', 'bad'); SFX.ui(); return; }
        const r = Game.socketRune(item, idx, id);
        if (r.ok) { this.forgeSocket = -1; this.renderForge(); }
        else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }

      const enhEl = e.target.closest('[data-fenhance]');
      if (enhEl) {
        const r = Game.enhanceItem(item);
        if (r.ok) this.renderForge();
        else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }

      const drillEl = e.target.closest('[data-fdrill]');
      if (drillEl) {
        const r = Game.drillSocketItem(item);
        if (r.ok) this.renderForge();
        else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }

      const rfEl = e.target.closest('[data-freforge]');
      if (rfEl) {
        const idx = parseInt(rfEl.dataset.freforge, 10);
        const r = Game.reforgeItem(item, idx);
        if (r.ok) this.renderForge();
        else if (r.msg) UI.log(r.msg, 'bad');
        return;
      }

      /* ---- 定向洗炼：开面板 / 升级单条 / 切换成指定词条 / 取消 ---- */
      const tEl = e.target.closest('[data-ftarget]');
      if (tEl) {
        const idx = parseInt(tEl.dataset.ftarget, 10);
        const same = this.forgeTarget && this.forgeTarget.index === idx;
        this.forgeTarget = same ? null : { index: idx, key: null, pick: false };
        SFX.ui();
        this.renderForge();
        return;
      }
      /* 升级选中的那一条（数值只升不降） */
      const uEl = e.target.closest('[data-fupgrade]');
      if (uEl) {
        if (!this.forgeTarget) return;
        const r = Game.upgradeAffixItem(item, this.forgeTarget.index);
        if (r.ok) {
          SFX.levelup();
          UI.toast((STATS[item.affixes[this.forgeTarget.index].key] || {}).label + ' +' + r.gain, 'lv');
        } else if (r.msg) UI.log(r.msg, 'bad');
        this.renderForge();
        return;
      }
      /* 切到「换成指定词条」面板 */
      if (e.target.closest('[data-fpickmode]')) {
        if (!this.forgeTarget) return;
        this.forgeTarget = Object.assign({}, this.forgeTarget, { key: null, pick: true });
        SFX.ui();
        this.renderForge();
        return;
      }
      /* 从候选面板退回「升级单条」 */
      if (e.target.closest('[data-fback]')) {
        if (!this.forgeTarget) return;
        this.forgeTarget = Object.assign({}, this.forgeTarget, { key: null, pick: false });
        SFX.ui();
        this.renderForge();
        return;
      }
      const pEl = e.target.closest('[data-fpick]');
      if (pEl) {
        if (!this.forgeTarget) return;
        this.forgeTarget = Object.assign({}, this.forgeTarget, { key: pEl.dataset.fpick, pick: true });
        SFX.ui();
        this.renderForge();
        return;
      }
      if (e.target.closest('[data-fcanceltarget]')) {
        this.forgeTarget = null;
        SFX.ui();
        this.renderForge();
        return;
      }
      const aEl = e.target.closest('[data-fauto]');
      if (aEl) {
        if (!this.forgeTarget || !this.forgeTarget.key) return;
        const r = Game.targetedReforge(item, this.forgeTarget.index, this.forgeTarget.key);
        if (r.ok) this.forgeTarget = null;
        this.renderForge();
        return;
      }
    });
  },

  firstForgeRef(tab) {
    const list = this.forgeItemList(tab || this.forgeTab);
    return list.length ? list[0].ref : null;
  },

  /* 装备栏 + 背包里符合当前页签的物品；ref 与 tooltip 的 eq:/inv: 一致 */
  forgeItemList(tab) {
    const s = Game.state;
    if (!s) return [];
    const want = tab || this.forgeTab;
    const ok = it => {
      if (!it) return false;
      if (want === 'rune') return socketCount(it) > 0 || canDrill(it);
      if (want === 'enhance') {
        const maxBase = RARITY[it.rarity].affixes || 0;
        return (it.affixes && it.affixes.length > 0) && (it.affixes.length - maxBase) < FORGE.enhanceMax;
      }
      return it.affixes && it.affixes.length > 0;
    };
    const out = [];
    const order = ['weapon', 'helm', 'chest', 'shoulders', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'offhand'];
    for (const slot of order) {
      if (ok(s.equipment[slot])) out.push({ ref: 'eq:' + slot, item: s.equipment[slot], where: '已装备' });
    }
    s.inventory.forEach((it, i) => {
      if (ok(it)) out.push({ ref: 'inv:' + i, item: it, where: '行囊' });
    });
    return out;
  },

  runeBagCount() {
    let n = 0;
    for (const id of RUNE_ICON_ORDER) n += Game.runeCount(id);
    return n;
  },

  renderForge() {
    const p = document.getElementById('forgePanel');
    if (!p || !Game.state) return;
    const s = Game.state;
    document.getElementById('forgeMat').innerHTML =
      `玄晶 <b>${Game.crystalCount()}</b>　符文袋 <b>${this.runeBagCount()}</b>`;
    p.querySelectorAll('.ftab').forEach(b => b.classList.toggle('on', b.dataset.ftab === this.forgeTab));

    const list = this.forgeItemList();
    if (!list.some(x => x.ref === this.forgeRef)) this.forgeRef = list.length ? list[0].ref : null;
    const listEl = document.getElementById('forgeList');
    listEl.innerHTML = list.length ? list.map(x => {
      const it = x.item, r = RARITY[it.rarity];
      const maxBase = RARITY[it.rarity].affixes || 0;
      const extra = it.affixes.length - maxBase;
      const fixedN = (it.fixed || []).length;
      const fixedTxt = fixedN ? ' · ' + fixedN + ' 条固定' : '';
      const sub = this.forgeTab === 'rune'
        ? `孔 ${(it.runes || []).filter(Boolean).length}/${it.sockets}`
        : (this.forgeTab === 'enhance'
          ? `${it.affixes.length} 条可洗${fixedTxt}${extra > 0 ? ' · 已强化 ' + extra : ''}`
          : `${it.affixes.length} 条可洗${fixedTxt}${it.reforges ? ' · 洗 ' + it.reforges + ' 次' : ''}`);
      return `<div class="fitem ${x.ref === this.forgeRef ? 'sel' : ''}" data-fref="${x.ref}">
        <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(it)}</span>
        <div style="min-width:0;flex:1">
          <div class="fn" style="color:${r.color}">${it.name}</div>
          <div class="fs">${sub} · ${x.where}</div>
        </div></div>`;
    }).join('') : `<div class="fempty">${this.forgeTab === 'rune'
      ? '没有可打孔或镶嵌的装备。<br>精英与首领会掉更多带孔装备；任何装备（戒指/项链除外）都可消耗玄晶自行打孔。'
      : '没有可洗练的装备。'}</div>`;

    const item = this.itemFromRef(this.forgeRef);
    const main = document.getElementById('forgeMain');
    if (!item) {
      main.innerHTML = `<div class="fempty">从左侧选一件装备。</div>`;
      return;
    }
    main.innerHTML = this.forgeTab === 'rune' ? this.forgeRuneView(item)
      : (this.forgeTab === 'enhance' ? this.forgeEnhanceView(item) : this.forgeReforgeView(item));
  },

  forgeRuneView(item) {
    const r = RARITY[item.rarity];
    let h = `<div class="fhead">
      <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(item)}</span>
      <div style="min-width:0">
        <div class="fname" style="color:${r.color}">${item.name}</div>
        <div class="fsub">${r.name} · ${SLOT_NAME[item.slot] || item.kind} · ${item.sockets} 孔</div>
      </div></div>`;

    const rs = itemRunes(item);
    h += `<div class="frune-label">孔 位 · 点空孔选中，点已镶符文取下</div><div class="fsocks">`;
    for (let i = 0; i < item.sockets; i++) {
      const rid = rs[i];
      h += `<div class="fsock ${rid ? 'on' : ''} ${this.forgeSocket === i ? 'sel' : ''}" data-fsock="${i}"
        title="${rid ? RUNES[rid].name + '（点击取下）' : '空孔 ' + (i + 1)}">
        ${rid ? runeIcon(rid, 28) : '◇'}<span class="fn2">${i + 1}</span></div>`;
    }
    h += `</div>`;

    /* 打孔区：0 孔装备也能进来打；到上限或首饰不给打 */
    const drillable = canDrill(item);
    const dCost = drillCost(item);
    const dHave = Game.crystalCount();
    if (item.slot === 'ring' || item.slot === 'amulet') {
      h += `<div class="hintline" style="margin-top:10px">戒指与项链不可打孔。</div>`;
    } else if (drillable) {
      h += `<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="fsub">孔数 ${item.sockets}/${FORGE.drillMax}</span>
        <button class="btn primary" data-fdrill="1" ${dHave < dCost ? 'disabled' : ''}
          title="消耗 ${dCost} 玄晶，为装备增加 1 个孔位（上限 ${FORGE.drillMax}）">打 孔 · ${dCost} 玄晶</button>
      </div>`;
    } else {
      h += `<div class="hintline" style="margin-top:10px;color:#ffd166">该装备已达到孔数上限（${FORGE.drillMax} 孔）。</div>`;
    }

    const cands = runeWordCandidates(item).slice(0, 4);
    if (cands.length) {
      const formed = runeWordOf(item);
      h += `<div class="frune-label">可成的符文之语</div>`;
      for (const w of cands) {
        const on = formed && formed.id === w.id;
        h += `<div class="fword" style="border-color:${w.color}44">
          <div class="fwn" style="color:${w.color}">${w.name}${on ? ' · 已成形' : ''}</div>
          <div class="fwr">${w.runes.map((rid, k) => {
          const cur = rs[k];
          return `<span class="${cur === rid ? '' : 'miss'}" title="${RUNES[rid].name}">${runeIcon(rid, 17)}</span>`;
        }).join('<span class="arw">▸</span>')}</div>
          <div class="fws">${runeWordStatsText(w)}</div>
          <div class="fwd">${w.desc}</div></div>`;
      }
    }

    h += `<div class="frune-label" style="margin-top:12px">符文袋 · 点击镶入${this.forgeSocket >= 0 ? '孔 ' + (this.forgeSocket + 1) : '第一个空孔'}</div><div class="frunes">`;
    for (const id of RUNE_ICON_ORDER) {
      const rd = RUNES[id], tier = RUNE_TIERS[rd.tier], n = Game.runeCount(id);
      h += `<div class="frune t${rd.tier} ${n ? '' : 'off'}" data-frune="${id}"
        title="${rd.name}（${tier.name}）${runeStatsText(rd)}">
        <span class="frc">${n}</span>${runeIcon(id, 22)}<span class="frn">${rd.name}</span></div>`;
    }
    h += `</div>`;
    if (!this.runeBagCount()) {
      h += `<div class="hintline">符文袋是空的。击杀精英与首领会掉落符文。</div>`;
    }
    return h;
  },

  forgeReforgeView(item) {
    const r = RARITY[item.rarity];
    const cost = reforgeCost(item);
    const have = Game.crystalCount();
    let h = `<div class="fhead">
      <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(item)}</span>
      <div style="min-width:0">
        <div class="fname" style="color:${r.color}">${item.name}</div>
        <div class="fsub">${r.name} · ${SLOT_NAME[item.slot] || item.kind} · 已洗练 ${item.reforges || 0} 次</div>
      </div></div>`;
    h += `<div class="frune-label">词 缀 · 固定词条锁定不动，洗练只作用于下方可洗练词条</div>`;
    if (item.implicit) {
      const s = STATS[item.implicit.key];
      h += `<div class="faff-row"><span class="fa" style="color:#c9b8ff">固有 · +${item.implicit.val}${s.pct ? '%' : ''} ${s.label}</span>
        <span class="fsub">不可洗练</span></div>`;
    }
    /* 固定初始词条：品质自带，洗练 / 强化都碰不到 */
    for (const a of (item.fixed || [])) {
      h += `<div class="faff-row faff-fixed">
        <span class="fa"><span class="faff-tag">固定</span>${affixText(a)}</span>
        <span class="fsub">不可洗练</span></div>`;
    }
    for (let i = 0; i < item.affixes.length; i++) {
      const targeting = this.forgeTarget && this.forgeTarget.index === i;
      h += `<div class="faff-row">
        <span class="fa">${affixText(item.affixes[i])}</span>
        <span style="display:flex;gap:6px;flex:none">
          <button class="btn" data-freforge="${i}" ${have < cost ? 'disabled' : ''}>洗练 · ${cost} 玄晶</button>
          <button class="btn ${targeting ? 'primary' : ''}" data-ftarget="${i}">${targeting ? '收起定向' : '定向'}</button>
        </span></div>`;
    }

    /* ---- 定向洗炼面板 ---- */
    const tg = this.forgeTarget;
    if (tg && tg.index >= 0 && tg.index < item.affixes.length) {
      const cur = item.affixes[tg.index];
      h += `<div class="ftarget-box">`;
      if (!tg.pick) {
        /* —— 升级单条：key 不变，数值只升不降 —— */
        const def = AFFIXES.find(a => a.key === cur.key) || {};
        const s = STATS[cur.key] || { label: cur.key, pct: false };
        const cap = affixValueCap(def, item.ilvl || 1);
        const val = Math.round(Number(cur.val) || 0);
        const maxed = val >= cap;
        const pct = cap > 0 ? Math.max(2, Math.min(100, Math.round(val / cap * 100))) : 0;
        const can = !maxed && have >= cost;
        h += `<div class="frune-label">定向洗炼 · 第 ${tg.index + 1} 条词缀 · 锁定这一条，数值只升不降</div>
          <div class="faff-row" style="margin-top:8px">
            <span class="fa">${affixText(cur)}</span>
            <span style="display:flex;gap:6px;flex:none">
              <button class="btn" data-fpickmode="1">改为指定词条</button>
              <button class="btn primary" data-fupgrade="1" ${can ? '' : 'disabled'}>${maxed ? '已封顶' : '升级此条 · ' + cost + ' 玄晶'}</button>
            </span></div>
          <div class="fup-bar"><i style="width:${pct}%"></i></div>
          <div class="hintline">当前 <b style="color:#e8d8ff">+${val}${s.pct ? '%' : ''}</b> · 本装备等级上限 <b style="color:#e8d8ff">+${cap}${s.pct ? '%' : ''}</b>。每次升级必定高于洗练前数值，绝不下降；封顶后不再消耗玄晶（换更高装备等级的底子可继续升）。</div>`;
      } else if (!tg.key) {
        const cands = reforgeTargets(item, tg.index);
        h += `<div class="frune-label">定向洗炼 · 第 ${tg.index + 1} 条词缀 · 改为指定词条（洗到即停）</div>
        <div class="faff-row" style="margin-top:8px">
          <span class="fa">选一个目标词条</span>
          <span style="display:flex;gap:6px;flex:none">
            <button class="btn" data-fback="1">返回升级</button>
            <button class="btn" data-fcanceltarget="1">收起</button>
          </span></div>
        <div class="fpicks">`;
        for (const a of cands) {
          const s = STATS[a.key];
          const f = 1 + (item.ilvl || 1) * 0.055;
          const lo = Math.max(1, Math.round(a.min * f)), hi = Math.max(lo, Math.round(a.max * f));
          h += `<div class="fpick" data-fpick="${a.key}" style="border-color:${AFFIX_TIER_COLOR[a.tier]}66"
            title="${AFFIX_TIER_NAME[a.tier]}词条 · 数值随 ilvl 与品质浮动">
            <span style="color:${AFFIX_TIER_COLOR[a.tier]}">${s.label}</span>
            <span class="fpick-v">+${lo}~${hi}${s.pct ? '%' : ''}</span></div>`;
        }
        h += `</div>
        <div class="hintline">点一个词条设为目标。同一装备不会出重复词条，所以其他词缀位已占用的不会出现在这里。</div>`;
      } else {
        const def = AFFIXES.find(a => a.key === tg.key);
        const s = STATS[tg.key];
        const est = estimateTargetedReforge(item, tg.index, def);
        const can = have >= cost;
        h += `<div class="frune-label">定向洗炼 · 第 ${tg.index + 1} 条词缀 · 改为指定词条（洗到即停）</div>
        <div class="faff-row" style="margin-top:8px">
          <span class="fa" style="color:${AFFIX_TIER_COLOR[def.tier]}">目标：${s.label} +${Math.max(1, Math.round(def.min * (1 + (item.ilvl || 1) * 0.055)))}~${Math.max(1, Math.round(def.max * (1 + (item.ilvl || 1) * 0.055)))}${s.pct ? '%' : ''}（${AFFIX_TIER_NAME[def.tier]}）</span>
          <span style="display:flex;gap:6px;flex:none">
            <button class="btn" data-fpickmode="1">换个目标</button>
            <button class="btn primary" data-fauto="1" ${can ? '' : 'disabled'}>开始定向洗炼</button>
          </span></div>
        <div class="hintline">预计约 <b style="color:#e8d8ff">${est.attempts}</b> 次、约 <b style="color:#e8d8ff">${est.cost}</b> 玄晶（每次费用 +${Math.round(FORGE.reforgeStep * 100)}%，越洗越贵）；玄晶不足会自动中断，已洗的次数不浪费。</div>`;
      }
      h += `</div>`;
    }

    h += `<div class="hintline">持有玄晶 ${have} 枚。每次洗练后费用 +${Math.round(FORGE.reforgeStep * 100)}%。</div>`;
    return h;
  },

  forgeEnhanceView(item) {
    const r = RARITY[item.rarity];
    const maxBase = RARITY[item.rarity].affixes || 0;
    const extra = item.affixes.length - maxBase;
    const cost = enhanceCost(item);
    const have = Game.crystalCount();
    let h = `<div class="fhead">
      <span class="fi" style="color:${r.color};border-color:${r.color}44">${itemIcon(item)}</span>
      <div style="min-width:0">
        <div class="fname" style="color:${r.color}">${item.name}</div>
        <div class="fsub">${r.name} · ${SLOT_NAME[item.slot] || item.kind} · 已强化 ${extra}/${FORGE.enhanceMax}</div>
      </div></div>`;
    h += `<div class="frune-label">当前词缀（蓝色 = 强化附加，固定词条不参与强化）</div>`;
    if (item.implicit) {
      const s = STATS[item.implicit.key];
      h += `<div class="faff-row"><span class="fa" style="color:#c9b8ff">固有 · +${item.implicit.val}${s.pct ? '%' : ''} ${s.label}</span></div>`;
    }
    for (const a of (item.fixed || [])) {
      h += `<div class="faff-row faff-fixed">
        <span class="fa"><span class="faff-tag">固定</span>${affixText(a)}</span></div>`;
    }
    for (let i = 0; i < item.affixes.length; i++) {
      const isExtra = i >= maxBase;
      h += `<div class="faff-row">
        <span class="fa" style="${isExtra ? 'color:#67a9ff' : ''}">${isExtra ? '【强化】' : ''}${affixText(item.affixes[i])}</span></div>`;
    }
    if (extra < FORGE.enhanceMax) {
      h += `<div style="margin-top:12px">
        <button class="btn primary" data-fenhance="1" ${have < cost ? 'disabled' : ''}>扩充词缀 · ${cost} 玄晶</button>
      </div>`;
    } else {
      h += `<div class="hintline" style="color:#ffd166">该装备已达到强化上限（+${FORGE.enhanceMax} 条额外词缀）。</div>`;
    }
    h += `<div class="hintline">持有玄晶 ${have} 枚。每次强化后费用 +${Math.round(FORGE.enhanceStep * 100)}%。</div>`;
    return h;
  }
});
