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

  bindEvents() {
    document.getElementById('startBtn').addEventListener('click', () => {
      const n = (document.getElementById('nameInput').value || '').trim() || '无名客';
      Game.startNew(this.selectedCls, n);
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
      setTimeout(() => Game.startNew(auto, nm), 80);
    }
    document.getElementById('continueBtn').addEventListener('click', e => {
      const slot = parseInt(e.currentTarget.dataset.slot, 10);
      Game.loadGame(slot || undefined);
    });
    const sm = document.getElementById('saveMgrBtn');
    if (sm) sm.addEventListener('click', () => SaveUI.open());

    // 物品悬停 / 点击（事件委托）
    document.addEventListener('mouseover', e => {
      if (IS_TOUCH) return;   // 触屏改为一指点开、按钮操作
      const el = e.target.closest('[data-ref]');
      if (!el) return;
      const item = this.itemFromRef(el.dataset.ref);
      if (!item) return;
      this.hoverRef = el.dataset.ref;
      this.tooltipEl.innerHTML = itemTooltip(item, { hint: el.dataset.ref.startsWith('inv:') ? '左键装备 / Shift+左键出售' : '左键卸下' });
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
      else if (k === 'escape') { this.closeAll(); }
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
    this.tooltipEl.innerHTML = itemTooltip(item, { hint: '' }) +
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

  /* ---------------- HUD ---------------- */
  renderHUD() {
    const s = Game.state, st = s.stats;
    document.getElementById('pGlyph').textContent = CLASSES[s.cls].icon;
    document.getElementById('pLv').textContent = s.level;
    document.getElementById('pName').textContent = s.name;
    document.getElementById('pClass').textContent = CLASSES[s.cls].name + ' · ' + CLASSES[s.cls].title;
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
    document.getElementById('potionTxt').textContent = `红药 ${s.potions.hp} · 蓝药 ${s.potions.mp}`;
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
      return `<div class="skill" data-skill="${id}" title="${sk.name}">
        <span class="k">${i + 1}</span><div class="g">${sk.glyph}</div>
        <span class="cost">${Game.skillCost(sk)}</span><div class="cd"></div></div>`;
    }).join('') +
      `<div class="potion" data-potion="hp"><span class="k">7</span><div class="g">丹</div><div class="n">红药</div></div>
       <div class="potion blue" data-potion="mp"><span class="k">8</span><div class="g">露</div><div class="n">蓝药</div></div>`;

    bar.querySelectorAll('.skill').forEach(el => {
      el.addEventListener('click', () => Game.castSkill(el.dataset.skill));
    });
    bar.querySelectorAll('.potion').forEach(el => {
      el.addEventListener('click', () => Game.usePotion(el.dataset.potion));
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

  updateBoss(boss) {
    const bar = document.getElementById('bossbar');
    if (!boss) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    document.getElementById('bossName').textContent = boss.cfg.name;
    document.getElementById('bossTitle').textContent = boss.cfg.title || '';
    document.getElementById('bossFill').style.width = CLAMP(boss.hp / boss.maxHp * 100, 0, 100) + '%';
    document.getElementById('bossText').textContent = `${Math.ceil(boss.hp)} / ${Math.round(boss.maxHp)}`;
    const ph = boss.cfg.hp * 0.6 > boss.hp ? (boss.cfg.hp * 0.3 > boss.hp ? 2 : 1) : 0;
    document.getElementById('bossPhase').innerHTML = '<i class="on"></i>' +
      `<i class="${ph >= 1 ? 'on' : ''}"></i><i class="${ph >= 2 ? 'on' : ''}"></i>`;
  },

  /* ---------------- 背包 ---------------- */
  toggleInv() { const p = document.getElementById('invPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderInventory(); },
  toggleStat() { const p = document.getElementById('statPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderStats(); },
  toggleQuest() { const p = document.getElementById('questPanel'); this.closeAll(p); p.classList.toggle('open'); if (p.classList.contains('open')) this.renderQuests(); },
  closeAll(except) {
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
    }).join('');
    list.querySelectorAll('[data-buy]').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const it = items[parseInt(row.dataset.buy)].item;
        this.tooltipEl.innerHTML = itemTooltip(it);
        this.tooltipEl.style.display = 'block';
      });
      row.addEventListener('mouseleave', () => { this.tooltipEl.style.display = 'none'; });
      row.addEventListener('click', () => Game.buyShopItem(parseInt(row.dataset.buy)));
    });
    document.getElementById('shopHint').textContent = `持有金币 ${Game.state.gold}`;
    this.closeAll(document.getElementById('shopPanel'));
    document.getElementById('shopPanel').classList.add('open');
    this.shopItems = items;
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
