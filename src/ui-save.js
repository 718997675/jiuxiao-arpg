/* ============================================================
 * 存档管理面板：3 角色位 / 新建 / 删除 / 导出 / 导入
 * 入口：开始界面「存档」按钮、游戏内右侧「存档」按钮、快捷键 P
 * ============================================================ */

const SaveUI = {
  selectedCls: 'warrior',
  slotForNew: 0,
  pendingDelete: 0,
  delTimer: null,
  built: false,

  init() {
    if (this.built) return;
    this.built = true;
    this.buildClsPick();
    this.bind();
  },

  $(id) { return document.getElementById(id); },

  buildClsPick() {
    const wrap = this.$('newClsPick');
    if (!wrap || typeof CLASSES === 'undefined') return;
    wrap.innerHTML = Object.values(CLASSES).map(c =>
      `<div class="cmini ${c.key === this.selectedCls ? 'sel' : ''}" data-cls="${c.key}">${c.icon} ${c.name}</div>`
    ).join('');
  },

  bind() {
    const wrap = this.$('newClsPick');
    if (wrap) {
      wrap.addEventListener('click', e => {
        const el = e.target.closest('.cmini');
        if (!el) return;
        this.selectedCls = el.dataset.cls;
        wrap.querySelectorAll('.cmini').forEach(x => x.classList.toggle('sel', x === el));
        try { SFX.ui(); } catch (err) { }
      });
    }

    const nb = this.$('newCharBtn');
    if (nb) nb.addEventListener('click', () => this.createChar());

    const slotList = this.$('slotList');
    if (slotList) {
      slotList.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const slot = parseInt(btn.dataset.slot, 10);
        const act = btn.dataset.act;
        if (act === 'load') this.loadSlot(slot);
        else if (act === 'export') this.exportSlot(slot);
        else if (act === 'del') this.askDelete(slot, btn);
        else if (act === 'neww') { this.slotForNew = slot; this.$('newName').focus(); }
      });
    }

    const eb = this.$('exportBtn');
    if (eb) eb.addEventListener('click', () => this.exportSlot(0));

    const ib = this.$('importBtn');
    const file = this.$('importFile');
    if (ib && file) {
      ib.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        const r = await SaveManager.importFile(f, this.targetSlot());
        this.afterImport(r, f.name);
      });
    }

    const pb = this.$('pasteBtn');
    const ta = this.$('importText');
    const tb = this.$('importTextBtn');
    if (pb && ta && tb) {
      pb.addEventListener('click', () => {
        const show = !ta.classList.contains('show');
        ta.classList.toggle('show', show);
        tb.style.display = show ? 'inline-block' : 'none';
        if (show) ta.focus();
      });
      tb.addEventListener('click', () => {
        const r = SaveManager.importText(ta.value, this.targetSlot());
        this.afterImport(r, '粘贴文本');
        if (r.ok) { ta.value = ''; ta.classList.remove('show'); tb.style.display = 'none'; }
      });
    }

    window.addEventListener('keydown', e => {
      if (e.key && e.key.toLowerCase() === 'p') {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
        this.toggle();
        e.preventDefault();
      }
    });
  },

  /* 目标是「当前角色位」；没在游戏里就用 activeSlot */
  targetSlot() {
    try { return SaveManager.activeSlot(); } catch (e) { return 1; }
  },

  afterImport(r, from) {
    if (!r.ok) { this.hint('导入失败：' + r.error, true); try { UI.toast('导入失败', 'bad'); } catch (e) { } return; }
    this.hint(`已从${from}导入到角色位 ${r.slot}。`);
    try { UI.toast('导入完成 · 位 ' + r.slot, 'lv'); } catch (e) { }
    const inGame = (typeof Game !== 'undefined' && Game.running && Game.state);
    if (inGame) Game.loadSlot(r.slot);
    else { this.render(); this.syncStart(); }
  },

  hint(text, bad) {
    const el = this.$('saveHint');
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? '#e08a7a' : '#9ae0b0';
  },

  /* ---------------- 打开 / 关闭 ---------------- */
  toggle() {
    const p = this.$('savePanel');
    if (!p) return;
    if (p.classList.contains('open')) this.close();
    else this.open();
  },

  open() {
    const p = this.$('savePanel');
    if (!p) return;
    // 进面板前先把手上进度落盘，避免面板显示的是旧数据
    try {
      if (typeof Game !== 'undefined' && Game.running && Game.state) Game.save();
    } catch (e) { }
    UI.closeAll(p);
    p.classList.add('open');
    this.pendingDelete = 0;
    this.hint('存档存在于本机浏览器（localStorage）。换设备或清理浏览器数据前，请先导出备份。');
    this.render();
    try { SFX.ui(); } catch (e) { }
  },

  close() {
    const p = this.$('savePanel');
    if (p) p.classList.remove('open');
    this.pendingDelete = 0;
    try { UI.closeAll(); } catch (e) { }
  },

  /* ---------------- 渲染 ---------------- */
  render() {
    const box = this.$('slotList');
    if (!box) return;
    const list = SaveManager.listSlots();
    const active = SaveManager.activeSlot();
    const inGame = (typeof Game !== 'undefined' && Game.running && Game.state);
    const CN = ['', '壹', '贰', '叁'];
    const MAPNAME = id => {
      try { return (MAPS[id] && MAPS[id].name) || id || '—'; } catch (e) { return id || '—'; }
    };

    box.innerHTML = list.map(s => {
      const m = s.meta;
      const isActive = s.slot === active;
      if (s.empty) {
        return `<div class="scard empty">
          <div class="sidx">${CN[s.slot]}</div>
          <div class="sinfo">
            <div class="sname">空 位</div>
            <div class="smeta">尚无角色 · 可在下方新建</div>
          </div>
          <div class="sacts"><button class="btn" data-act="neww" data-slot="${s.slot}">以此位新建</button></div>
        </div>`;
      }
      const lvTxt = `${s.clsName} · ${m.level} 级`;
      const meta = `金 ${s.gold} · ${MAPNAME(m.mapId)} · 时长 ${fmtDur(m.playTime)} · ${fmtDate(m.updatedAt)}`;
      return `<div class="scard ${isActive ? 'active' : ''}">
        <div class="sidx">${CN[s.slot]}</div>
        <div class="sinfo">
          <div class="sname">${esc(m.name)}<small>${lvTxt}${isActive ? ' · 当前' : ''}</small></div>
          <div class="smeta">${meta}</div>
        </div>
        <div class="sacts">
          <button class="btn ${isActive && inGame ? '' : 'primary'}" data-act="load" data-slot="${s.slot}">${isActive && inGame ? '重 载' : '进 入'}</button>
          <button class="btn" data-act="export" data-slot="${s.slot}">导出</button>
          <button class="btn danger" data-act="del" data-slot="${s.slot}">删除</button>
        </div>
      </div>`;
    }).join('');
  },

  /* 开始界面的「继续前世」按钮跟随存档状态 */
  syncStart() {
    try {
      const btn = document.getElementById('continueBtn');
      if (!btn) return;
      const list = SaveManager.listSlots().filter(s => !s.empty);
      if (!list.length) { btn.style.display = 'none'; return; }
      btn.style.display = 'inline-block';
      const a = SaveManager.activeSlot();
      const cur = list.find(s => s.slot === a) || list[0];
      btn.textContent = `继 续 · ${cur.meta.name} ${cur.meta.level}级`;
      btn.dataset.slot = cur.slot;
    } catch (e) { }
  },

  /* ---------------- 动作 ---------------- */
  createChar() {
    const nameEl = this.$('newName');
    const name = ((nameEl && nameEl.value) || '').trim() || '无名客';
    const slot = this.slotForNew || 0;
    const r = SaveManager.createCharacter(this.selectedCls, name, slot);
    if (!r.ok) { this.hint('建档失败：' + r.error, true); try { UI.toast(r.error, 'bad'); } catch (e) { } return; }
    this.slotForNew = 0;
    if (nameEl) nameEl.value = '';
    try { SFX.ui(); } catch (e) { }
    const started = (typeof Game !== 'undefined') && Game.startNew(this.selectedCls, name, r.slot);
    if (!started) { this.render(); this.syncStart(); }
    this.close();
  },

  loadSlot(slot) {
    if (typeof Game === 'undefined') return;
    const inGame = Game.running && Game.state;
    if (inGame && Game.savedSlot === slot) { this.close(); return; }  // 就是当前档，直接关掉
    if (inGame) Game.save();                                          // 先把当前档写盘
    this.close();
    const ok = Game.loadSlot(slot);
    if (!ok) { try { UI.toast('读取失败', 'bad'); } catch (e) { } }
  },

  exportSlot(slot) {
    const n = slot || SaveManager.activeSlot();
    const doc = SaveManager.readSlot(n);
    if (!doc) { this.hint('该角色位没有存档。', true); return; }
    // 导出前把运行中的进度写进去，保证导出的是「此刻」
    try { if (Game.running && Game.state && Game.savedSlot === n) Game.save(); } catch (e) { }
    const r = SaveManager.exportFile(n);
    if (!r.ok) {
      this.hint('导出失败：' + r.error, true);
      // 兜底：把 JSON 塞进文本框，让玩家手动复制
      const ta = this.$('importText');
      if (ta) {
        ta.classList.add('show');
        ta.value = SaveManager.exportText(n);
        const tb = this.$('importTextBtn');
        if (tb) tb.style.display = 'inline-block';
      }
      return;
    }
    this.hint(`已导出 ${r.name}（${(r.size / 1024).toFixed(1)} KB）`);
    try { UI.toast('存档已导出', 'lv'); } catch (e) { }
  },

  askDelete(slot, btn) {
    if (this.pendingDelete !== slot) {
      this.pendingDelete = slot;
      btn.textContent = '确认删除';
      btn.classList.add('danger');
      this.hint(`再次点击「确认删除」将永久删除角色位 ${slot}（建议先导出备份）。`, true);
      clearTimeout(this.delTimer);
      this.delTimer = setTimeout(() => { this.pendingDelete = 0; this.render(); }, 4000);
      return;
    }
    clearTimeout(this.delTimer);
    this.pendingDelete = 0;
    const wasActive = (Game.state && Game.savedSlot === slot);
    const ok = SaveManager.deleteSlot(slot);
    if (!ok) { this.hint('删除失败', true); return; }
    try { UI.toast('角色位 ' + slot + ' 已删除', 'bad'); } catch (e) { }
    this.hint('已删除角色位 ' + slot + '。');
    // 删的正是当前在玩的角色：退回标题界面
    if (wasActive && Game.running) {
      this.close();
      location.reload();
      return;
    }
    this.render();
    this.syncStart();
  }
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} 小时 ${m} 分` : `${m} 分`;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts), p = x => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 脚本在 body 末尾，DOM 已就绪，可直接初始化 */
try {
  SaveUI.init();
} catch (e) {
  console.error('[存档面板] 初始化失败', e);
}
