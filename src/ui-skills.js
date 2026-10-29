/* ============================================================
 * 技能面板（P1 · 从 ui.js 拆出来的）
 *
 * 为什么单独一个文件：
 *   重构期间 dev-v3 与 feat/skill-refactor 两条线并行。技能面板马上要整个
 *   换成树形画布，而 dev-v3 上仍可能修这里的小 bug。只要它还在 ui.js 里，
 *   两条线就会撞同一段代码 —— 那是语义冲突，不是'选一边'能解决的。
 *   文件级隔离之后，冲突最多是'这个文件谁改'，合并时选一边即可。
 *
 * 怎么挂上去：
 *   下面用 Object.assign(UI, {...}) 把方法挂回同一个 UI 对象，
 *   调用方（Game.onSkillChanged 等）完全不用改。加载顺序必须在 ui.js 之后。
 *
 * 面板结构（P1 第二步 · 操作全部并入树）：
 *   ┌ 标题 / 可用点数 / 缩放百分比 ────────────────┐
 *   │  树（左键加点 · 右键退点 · 滚轮缩放 · 拖拽平移）  说明卡（只读数，不放按钮）
 *   ├ 未确认条（加了点才出现）─────────────────────┤
 *   └ 技能条 5 格 · 甲乙两栏 ──────────────────────┘
 *   右侧卡从「操作面板」降级成「说明书」：数值、描述、机制、分支，全是只读。
 * ============================================================ */

/* 技能树几何常量（[P1d] 三列纵向版）。
 *
 * 一条线 = 一列。之前是「3 组 × 2 子列」：主动一列、被动一列并排，
 * 视觉上像是「二选一」；二选一在 P1c 已经删了，所以这里把被动收进列内、
 * 小一圈挂在主动右边（它是这条线的附属，不是并列选项）。
 *
 * 数字怎么定的（2026-10-27 真机量出来的，别随手改）：
 *   · 主动节点实测 85px 高（46 框 + 名称 + 变体名 + 三个分支记号），
 *     所以 rowH 不能低于 ~100，否则变体名会压到下一行节点的框上；
 *   · 破军那条线是最长的（9 个节点 / 5 行），H=530、W=576；
 *     面板可视区 936×663 → 自适应缩放 1.2（顶格），没有缩字。 */
const SKG = {
  node: 46,        // 主动节点边长
  pasNode: 38,     // 被动 / 关键被动边长（小一圈）
  rowH: 104,       // 行距（一行 = 一个岔口：主动 + 它的被动）
  pasDx: 74,       // 主动左边 → 被动左边（留 8px 给主动的名称溢出）
  colGap: 196,     // 列与列（主动左边 → 主动左边）
  padX: 8,
  padY: 34,
  popW: 236        // 分支浮层宽度
};

Object.assign(UI, {
  skTreeTab: null,     // 手机按系分页时当前是哪一系
  skZoom: 1,           // 缩放 0.45 ~ 2
  skZoomAuto: true,    // 没手动调过就按容器大小自动适配一档
  skPop: null,         // 展开了分支浮层的技能 id
  skBarOpen: false,    // 底部技能条是否展开（默认收起：它不是信息，是要用的时候才用的东西）

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

  /* ============================================================
   * [P0] 新版技能位预览（只展示）
   *
   * 技能系统正在从「12 技能平铺 + 8 格动作条」收敛到「5 个功能位（左键 + 1~4）」。
   * [P1b] 动作条**已经切到 5 格**（左键 + 1~4），这块预览现在与真实键位一致：
   *   · 每一格只能放本位继承的技能（skillArchSlotOf 校验）
   *   · 台阶数值仍只在展示层，战斗读级数的部分在 P2 接
   *
   * 文案全部来自 SKILL_ARCHETYPE / SKILL_TIERS，改数据表这里跟着变 ——
   * 面板里不许出现写死的技能名（本项目的固定规矩）。
   * ============================================================ */
  skArchHTML() {
    if (typeof SKILL_ARCHETYPE === 'undefined' || typeof skillArchList !== 'function') return '';
    const list = skillArchList(Game.state.cls);
    if (!list.length) return '';
    const T = SKILL_TIERS;
    const stepName = lv => (skillTierStep(lv) || {}).name || '';
    const cards = list.map(slot => {
      const steps = T.visible.map(lv => {
        const kind = (skillTierStep(lv) || {}).kind || 'num';
        const txt = slot.tiers[lv] || '';
        /* [P2b] 台阶实装状态：文案写了但战斗没接的，必须当场标出来 ——
         * 面板上写着「三连斩」实际只打一下，比不写更伤玩家。
         * 判据在读数据层（skillSlotTierDone），不是这张卡里手写名单。 */
        const done = (typeof skillSlotTierDone === 'function')
          ? skillSlotTierDone(slot.cls, slot.no, lv) : true;
        /* 卡窄，长文案会被省略号吃掉 —— 补 title 让悬停能看到全文 */
        const tip = `Lv${lv} ${stepName(lv)}：${txt}${done ? '' : '（本段尚未实装）'}`;
        return `<span class="sk-as k-${kind}${done ? '' : ' todo'}" title="${tip}">`
          + `<i>${lv}</i>${txt}${done ? '' : '<u>待</u>'}</span>`;
      }).join('');
      /* ⑤ 号位每种职业的“身份”写法不同：刀式 / 法相 / 召唤，全部从数据取 */
      let extra = '';
      if (slot.forms) extra = '刀式 ' + slot.forms.map(f => f.name).join(' / ');
      else if (slot.finisher) extra = slot.finisher.name;
      else if (slot.aura) extra = `主元素强化 ${slot.aura.durMin}~${slot.aura.durMax} 秒`;
      else if (slot.unit) extra = '限时召唤';
      const inherit = (slot.inherit || []).map(id => (SKILLS[id] || {}).name || id);
      const foot = (inherit.length ? '现继承 ' + inherit.join(' / ') : '新做') + (extra ? ' · ' + extra : '');
      return `<div class="sk-ac">
        <div class="sk-ac-hd"><b>${slot.no}</b><span class="sk-ac-key">${slot.keybind}</span>
          <span class="sk-ac-title">${slot.title}</span><span class="sk-ac-slot">${slot.name}</span></div>
        <div class="sk-ac-steps">${steps}</div>
        <div class="sk-ac-foot" title="${foot}">${foot}</div>
      </div>`;
    }).join('');
    const first = T.curve[0].pct;
    /* 数量台阶的读数全部现算：写死「1.85 倍」迟早在改系数后变成假话 */
    const DECAY = (typeof SKILL_COUNT_DECAY === 'number') ? SKILL_COUNT_DECAY : 0.85;
    const c3 = 1 + DECAY;
    const c7 = c3 + DECAY * DECAY;
    const dec = Math.round(DECAY * 100);
    return `<details class="sk-arch"><summary>技能位 · 5 格（左键 + 1~4，与当前动作条一致）</summary>
      <div class="sk-arch-grid">${cards}</div>
      <div class="sk-arch-tip">1→10 级：每级 +${first}%，Lv3 / Lv7 数量 +1（第 n 发 ×${dec}%，总伤
        ${c3.toFixed(2)} / ${c7.toFixed(2)} 倍，不是 2 / 3 倍），Lv5 / Lv9 进化，
        Lv10 终极形态；11→20 为精进层（来自装备词缀，不占技能点），共 ${skillLvMul(T.cap)} 倍。
        台阶名：${T.visible.map(lv => lv + ' ' + stepName(lv)).join(' · ')}。
        动作条 ${SKILL_BAR_SLOTS} 格：左键 = ①，1~4 = ②③④⑤。
        <b>带「待」的台阶目前只有文案，战斗尚未接入</b>（Lv3 / Lv7 数量已接，位内有连发 / 多片 / 多数符类技能才给；
        Lv5 / Lv9 / Lv10 形态逐技能接，已经接好的位不再带「待」）。</div>
    </details>`;
  },

  renderSkillPanel() {
    const p = document.getElementById('skillPanel');
    if (!p || !Game.state) return;
    /* 重画会换掉整个 #skList，手势状态跟着归零（否则漏掉的 pointerup 会让
     * 之后每次单指触摸都被当成捏合） */
    if (this._skPts) this._skPts.clear();
    const s = Game.state;
    const order = SKILL_ORDER[s.cls] || [];
    const pts = Game.skillPoints();
    /* [P2] 供给与三笔投入都要摊开写：上限抬到 10 级之后「点花在哪了」
     * 比之前更重要 —— 玩家看到「60 点 · 已投 47」才知道还能点几级 */
    const pool = (typeof skillPointPool === 'function') ? skillPointPool(s.level) : s.level;
    /* 已投账本：等级点数与分支点数分开写，玩家能看出「点花在哪了」 */
    const skState = Game.skillState();
    let lvSpent = 0;
    for (const sid in skState) lvSpent += Math.max(0, (skState[sid].lv || 1) - 1);
    const brSpent = (typeof Game.branchSpent === 'function') ? Game.branchSpent() : 0;
    const pasSpent = (typeof Game.passiveSpent === 'function') ? Game.passiveSpent() : 0;
    /* [C3] 未确认改动条 */
    const sdf = document.getElementById('skDraft');
    if (sdf) sdf.innerHTML = this.draftBarHTML('skill');
    /* [UNIQUE-3] 传世授予的秘技：不在本职业技能树里，树上也画不出，
     * 所以只在选中时给一句说明（它们没有加点，只有「在不在身上」） */
    const gmap = (s.stats && s.stats.grantedSkills) || {};
    const grantedIds = Object.keys(gmap).filter(gid => SKILLS[gid] && order.indexOf(gid) < 0);
    if (this.skPop && !SKILLS[this.skPop]) this.skPop = null;
    if (!this.skSel || (!order.includes(this.skSel) && grantedIds.indexOf(this.skSel) < 0)) {
      this.skSel = order[0];
    }
    /* 预览（skHover）可能是上一套树 / 上一个职业留下的 —— 换职业或换存档之后
     * 它指向的技能已经不在这棵树上了，留着会让右侧卡显示一个「树上找不到」的技能 */
    if (this.skHover && !SKILLS[this.skHover] && !(SKILL_TREE.passives || {})[this.skHover]) {
      this.skHover = null;
    }

    let h = `<div class="sk-top">
      <span id="skPtsTxt">可用技能点 <b>${pts}</b><i class="sk-pool">/${pool}</i></span>
      <span class="sk-spent" title="供给 = 角色等级 × 1.5；升级 1 级 1 点、每条取向 1 点、被动每级 1 点；精研与变体不消耗技能点">投入 等级 ${lvSpent} · 分支 ${brSpent} · 被动 ${pasSpent}</span>
      <span class="sk-respec"><button class="vb" id="skRespec" title="退光全部技能等级、取向与被动（阶梯收费，每洗一次涨一档）">洗点 ${Game.treeRespecFee ? Game.treeRespecFee() : '?'} 金</button></span>
      <span class="sk-bdbtn"><button class="vb${this.skBuilds ? ' on' : ''}" id="skBuilds" aria-pressed="${this.skBuilds ? 'true' : 'false'}"
        title="按当前存档算三套最省事的流派（契合度，不是强度榜）">推荐流派</button></span>
      <span class="sk-zoom"><button class="vb" data-sktz="-1" title="缩小">−</button>
        <span class="vhint skt-z">${Math.round((this.skZoom || 1) * 100)}%</span>
        <button class="vb" data-sktz="1" title="放大">＋</button></span>
      <span class="dim">滚轮缩放 · 按住拖动画布（四周留有余量）· 左键加 1 级 · 右键减 1 级 · 节点下方标记选择分支 · 节点可拖入技能条，条上格位可拖动换位</span>
    </div>`;

    h += this.skBuilds ? this.skBuildsHTML() : '';
    /* [P0] 新版技能位预览：只读，默认折叠，不接管任何点击 */
    h += this.skArchHTML();
    /* 手机：树上换成 DOM 纵向列（见 renderSkillTreeDOM），不再用缩放画布。
     * 外面的 .sk-body / .sk-left / .sk-right 结构不变，所以分栏 CSS 原样复用。
     * [P1d] 分页签必须在这里给：走 MTREE 的路径不经过 skTreeHTML，
     * 原来那套 `data-skttree` 按钮就永远画不出来 —— 手机上只能看到第一条线。 */
    const mt = (typeof MTREE !== 'undefined') && MTREE.isMobile();
    h += '<div class="sk-body"><div class="sk-left">'
      + (mt ? this.skTreeTabsHTML() + '<div class="sk-mt" id="skTree"></div>' : this.skTreeHTML()) + '</div>';
    h += this.skCardHTML(this.skShown()) + '</div>';
    h += this.skBarHTML();

    /* 重画会换掉整个 #skList，#skTree 是新元素 —— 横向滚动位置要手动接上，
     * 否则每点一个节点就弹回最左边，第三列之后根本没法看 */
    const oldTree = document.getElementById('skTree');
    if (oldTree) this._skTreeScroll = oldTree.scrollLeft;

    /* [KEEP-SCROLL] 说明书卡的滚动位置同理。换变体 / 选取向都在卡片中部，
     * 一点就整块重画，不还回去的话滚动条会跳回顶部 —— 玩家得重新往下翻，
     * 看起来像「点一下什么都没发生」。换到另一个技能时才该回到顶部。 */
    const cardId = this.skShown();
    const sameCard = (this._skCardId === cardId);
    const oldCard = document.querySelector('#skList .sk-right');
    const keepCardY = (sameCard && oldCard) ? oldCard.scrollTop : 0;

    const list = document.getElementById('skList');
    list.innerHTML = h;
    this._skCardId = cardId;
    if (mt) {
      this.renderSkillTreeDOM();
      const nt = document.getElementById('skTree');
      if (nt && this._skTreeScroll) nt.scrollLeft = this._skTreeScroll;
    }
    /* 卡片滚动必须等树渲染完再还原：.sk-left 的高度取决于树，
     * 树还没画出来时卡片是「满高」的，这时候设 scrollTop 会被夹成一个很小的值。
     * 再用一帧兜底，等字体/折行落定。 */
    if (sameCard && keepCardY) {
      const put = () => {
        const nc = list.querySelector('.sk-right');
        if (nc && nc.scrollTop !== keepCardY) nc.scrollTop = keepCardY;
      };
      put();
      requestAnimationFrame(put);
    }

    /* ---------------- BD 推荐：开关与「切变体」 ---------------- */
    const bdBtn = list.querySelector('#skBuilds');
    if (bdBtn) bdBtn.addEventListener('click', () => {
      this.skBuilds = !this.skBuilds;
      SFX.ui();
      this.renderSkillPanel();
    });
    const bdClose = list.querySelector('#skBdClose');
    if (bdClose) bdClose.addEventListener('click', () => {
      this.skBuilds = false;
      SFX.ui();
      this.renderSkillPanel();
    });
    /* 「切到「疾风」」= 只切变体。加点和被动不代劳 —— 花点是不可逆的，
     * 面板给出清单，让玩家自己决定要不要花。 */
    list.querySelectorAll('[data-bform]').forEach(el => {
      el.addEventListener('click', () => {
        const r = Game.applyBuildForm(el.dataset.bform);
        this.toast(r.msg, r.ok ? '' : 'bad');
        if (r.ok) { SFX.ui(); this.renderSkillPanel(); }
      });
    });

    /* ---------------- 树：指针 / 键盘操作 ---------------- */
    const touch = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
    list.querySelectorAll('.skt-nd').forEach(el => {
      const id = el.dataset.skpick;
      if (id) {
        /* PC：悬停预览（右侧卡跟着走，但只是预览 —— 见 hoverSkill）；
         * 点击 = 钉住这个技能 + 加 1 级。悬停走 document 上的 mouseover，
         * 这里不再逐个绑（重画一次就全丢，是上一版的老毛病）。 */
        el.addEventListener('click', () => {
          if (this._panMoved) return;              // 刚才是拖画布，不是点节点
          this.selectSkill(id);
          if (!Game.skillUnlocked(id)) {
            this.toast('「' + SKILLS[id].name + '」需 ' + SKILLS[id].unlock + ' 级领悟');
            return;
          }
          if (touch) return;                       // 触屏：点只选中，下方浮出 ＋ / −
          this.skillStep(id, true);
        });
        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (this._panMoved || !Game.skillUnlocked(id)) return;
          this.skillStep(id, false);
        });
      } else {
        /* [P2] 被动 / 关键被动：真投点（左 +1 / 右 −1，走草稿确认），
         * 门槛与「待接」双拦 —— 没实现的被动和没实现的取向一样不给花点 */
        const pid = el.dataset.sktpas;
        const nm = el.dataset.sktname || '被动';
        const pasStep = up => {
          if (this._panMoved) return;
          if (Game.passiveImplemented && !Game.passiveImplemented(pid)) {
            this.toast('「' + nm + '」的增益还没接入'); return;
          }
          if (up && !Game.passiveUnlocked(pid)) {
            this.toast('「' + nm + '」需 ' + Game.passiveUnlockLv(pid) + ' 级'); return;
          }
          const had = this.snapDirty('skill');
          this.snapTake('skill');
          const r = up ? Game.levelUpPassive(pid) : Game.levelDownPassive(pid);
          if (!r.ok) {
            if (!had && this.snaps) delete this.snaps.skill;
            this.toast(r.msg, up ? 'bad' : '');
            return;
          }
          SFX.ui();
          this.renderSkillPanel();
        };
        el.addEventListener('click', () => {
          this.selectSkill(pid);
          if (touch) return;                       // 触屏：点只选中看卡
          pasStep(true);
        });
        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          pasStep(false);
        });
      }
    });

    /* 节点下三个小记号 → 就地展开分支浮层（不跳右侧） */
    list.querySelectorAll('[data-mark]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (this._panMoved) return;
        const id = el.dataset.mark;
        this.skSel = id;
        this.skHover = null;          // 点开分支 = 明确指定这个技能，预览让位
        this.skPop = (this.skPop === id) ? null : id;
        SFX.ui();
        this.renderSkillPanel();
      });
    });
    /* 说明书卡上的三条变体（点哪条切哪条）走「委托」，见 bindTreeNav 里那段
     * 说明 —— 卡会被 selectSkill 整块换掉，逐个绑事件的写法活不过一次悬停。
     * 换变体的口径统一在 UI.applyVariantForm()。 */
    /* 节点下的变体名：点一下切到下一个「能用的」变体（免费、不用开浮层）。
     * form 通道里待接 / 前提不满足的条目会跳过，不会切到一个点不动的死条。 */
    list.querySelectorAll('[data-vnext]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (this._panMoved) return;
        const id = el.dataset.vnext;
        if (!SKILLS[id]) return;
        const view = this.skillFormView(id);
        if (!view) return;
        /* 往后找第一个「点得动」的变体：待接 / 前提不满足的跳过，
         * 三圈都不可用就停在原地（不硬切到一条没实现的） */
        let nx = view.idx;
        for (let k = 1; k <= 3; k++) {
          const i = (view.idx + k) % 3;
          const it = view.items[i];
          if (it && !(it.pending || []).length && it.condOk) { nx = i; break; }
        }
        if (this.applyVariantForm(id, nx)) this.renderSkillPanel();
      });
    });
    list.querySelectorAll('[data-popx]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        this.skPop = null;
        this.renderSkillPanel();
      });
    });
    /* 浮层里的变体三选一（新 form 通道或旧 variants，都能真生效） */
    list.querySelectorAll('[data-form]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const [sid, vi] = b.dataset.form.split(':');
        if (this.applyVariantForm(sid, parseInt(vi, 10))) this.renderSkillPanel();
      });
    });
    /* 浮层里的取向二选一：花 1 点，走草稿，确认才落盘。
     * 逻辑与卡片上的取向行共用 UI.skillPickBranch，别在这里再写一份。 */
    list.querySelectorAll('[data-pick]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const [sid, vi] = b.dataset.pick.split(':');
        this.skillPickBranch(sid, parseInt(vi, 10));
      });
    });

    /* 选中节点下方的 ＋ / −（触屏唯一路径；PC 上是个可点的显式入口）
     * —— 同时是 dev/probe-draft.js 的稳定选择器 */
    list.querySelectorAll('[data-sklv]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      this.skillStep(b.dataset.sklv, true);
    }));
    list.querySelectorAll('[data-sklvd]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      this.skillStep(b.dataset.sklvd, false);
    }));

    /* 手机按系分页 */
    list.querySelectorAll('[data-skttree]').forEach(b => b.addEventListener('click', () => {
      this.skTreeTab = b.dataset.skttree;
      SFX.ui();
      this.renderSkillPanel();
    }));

    /* 底部技能条：点格子把当前选中术法放上去；右键腾空 */
    list.querySelectorAll('[data-skbar]').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.skbar, 10);
      const cur = Game.skillBar()[i];
      const r = (cur && cur === this.skSel)
        ? Game.unassignSkillBar(i)
        : Game.assignSkillBar(i, this.skSel);
      if (r.ok) SFX.ui();
      else this.toast(r.msg, 'bad');
    }));
    list.querySelectorAll('[data-skbar]').forEach(b => b.addEventListener('contextmenu', e => {
      e.preventDefault();
      const r = Game.unassignSkillBar(parseInt(b.dataset.skbar, 10));
      if (r.ok) SFX.ui();
    }));
    /* 传世秘技：不在树上，只能从条边上那一排选 */
    list.querySelectorAll('.sb-grant [data-skpick]').forEach(b => b.addEventListener('click', () => {
      this.skSel = b.dataset.skpick;
      this.skHover = null;
      SFX.ui();
      this.renderSkillPanel();
    }));
    /* 技能条展开 / 收起 */
    list.querySelectorAll('[data-skbartog]').forEach(b => b.addEventListener('click', () => {
      this.skBarOpen = !this.skBarOpen;
      SFX.ui();
      this.renderSkillPanel();
    }));
    /* [M1] 切快捷栏（甲 / 乙） */
    list.querySelectorAll('[data-skset]').forEach(b => b.addEventListener('click', () => {
      Game.switchBarSet(parseInt(b.dataset.skset, 10));
      SFX.ui();
    }));

    /* 缩放按钮（滚轮之外的手动入口） */
    list.querySelectorAll('[data-sktz]').forEach(b => b.addEventListener('click', () => {
      const d = parseInt(b.dataset.sktz, 10) || 0;
      this.skZoomAuto = false;
      this.skZoom = this.clampZoom((this.skZoom || 1) + d * 0.1);
      this.renderSkillPanel();
    }));

    /* [P2] 技能树洗点：两段式确认（照天赋洗点的交互），洗后草稿作废 */
    const rb = document.getElementById('skRespec');
    if (rb) rb.addEventListener('click', () => {
      if (!this._skRespecArm) {
        this._skRespecArm = true;
        rb.textContent = '确认扣除 ' + Game.treeRespecFee() + ' 金？';
        rb.classList.add('danger');
        clearTimeout(this._skRespecTimer);
        this._skRespecTimer = setTimeout(() => {
          this._skRespecArm = false;
          this.renderSkillPanel();
        }, 3000);
        return;
      }
      this._skRespecArm = false;
      clearTimeout(this._skRespecTimer);
      const r = Game.respecTree();
      /* 洗点把已投的点全退了，未确认的草稿就没意义了（否则确认后又加回去） */
      if (this.snaps) delete this.snaps.skill;
      this.toast(r.msg, r.ok ? '' : 'bad');
      this.renderSkillPanel();
    });

    /* 树视图：插进 DOM 之后才量得到容器大小。
     * 同步先试一次（面板刚打开时尺寸已可量），rAF 再兜一次 ——
     * 只靠 rAF 在个别环境下会晚一帧，表现是「刚打开 100%，闪一下才缩」。 */
    try { this.fitSkillTree(); } catch (e) { }
    requestAnimationFrame(() => this.fitSkillTree());
  },

  /* ---------------- BD 推荐（P4） ----------------
   * 三张卡：契合度最高的三套流派。它回答的是「我现在这套离哪套最近」，
   * 不是「哪套最强」—— 没有 DPS 模拟就别假装有强度榜。
   * 卡片上只放一个能一键做的事：切变体（免费）。加点和被动留成清单，
   * 因为花技能点是不可逆的决定（洗点要收钱）。 */
  skBuildsHTML() {
    const list = (typeof Game.recommendBuilds === 'function') ? Game.recommendBuilds(3) : [];
    if (!list.length) {
      return '<div class="sk-bd"><div class="sk-bd-h">推荐流派<em>本职业还没有流派模板</em></div></div>';
    }
    const cards = list.map((it, rank) => {
      const b = it.build;
      const sk = SKILLS[b.skill] || {};
      const pk = (typeof buildPickName === 'function') ? buildPickName(b) : '';
      const fm = (typeof buildFormName === 'function') ? buildFormName(b) : '';
      const parts = (it.parts || []).map(p =>
        `<span title="${p.label}：${p.got}/${p.max}">${p.label} <b>${p.got}</b></span>`).join('');
      const miss = it.missing.length
        ? `<div class="bd-miss">还差：${it.missing.slice(0, 4).join(' · ')}${it.missing.length > 4 ? ' …' : ''}</div>`
        : '<div class="bd-miss ok">已经完全对上了，直接打就行</div>';
      /* 变体按钮：只有技能到 5 级才亮。没到就说明「差在哪」，
       * 而不是给一个点了报错的按钮。 */
      const canForm = (Game.skillLevel(b.skill) >= (SKILL_TREE.formAt || 5));
      const curForm = Game.skillVariant(b.skill);
      const formBtn = curForm === b.form
        ? '<button class="vb" disabled>已是「' + fm + '」</button>'
        : canForm
          ? `<button class="vb" data-bform="${b.id}">切到「${fm}」</button>`
          : `<button class="vb" disabled>${SKILL_TREE.formAt || 5} 级可切「${fm}」</button>`;
      return `<div class="bd-card${rank === 0 ? ' top' : ''}">
        <div class="bd-top"><b>${b.name}</b>
          <span class="bd-fit" title="${parts.replace(/<[^>]+>/g, ' ')}">${it.fit}<i>%</i></span></div>
        <div class="bd-bar"><i style="width:${it.fit}%"></i></div>
        <div class="bd-line">${sk.name || b.skill}${pk ? ' · ' + pk : ''}${fm ? ' · ' + fm : ''}</div>
        <div class="bd-why">${b.tagline}</div>
        ${miss}
        <div class="bd-act">${formBtn}
          <span class="bd-steps" title="${(b.steps || []).join(' → ')}">${(b.steps || []).length} 步打法</span></div>
      </div>`;
    }).join('');
    return `<div class="sk-bd">
      <div class="sk-bd-h">推荐流派 <em>按当前存档实时计算 · 契合度为接近程度而非强度排名 · 卡片内仅支持一键切换变体</em>
        <button class="vb" id="skBdClose">收起</button></div>
      <div class="sk-bd-list">${cards}</div></div>`;
  },

  /* ---------------- 换变体（三个入口共用一个口径） ----------------
   * 入口有三处：树上那行变体名（data-vnext）、节点浮层三条（data-form）、
   * 说明书卡三行（data-vset）。三处必须走同一段逻辑 —— 各写一份的话，
   * 「待接 / 前提不满足」这类校验迟早会在某一处漏掉。
   *
   * 为什么卡上那三行用「委托」而不是逐个 addEventListener：
   * selectSkill() 悬停换选中时把 .sk-right 整个 outerHTML 换掉，
   * 新卡上的按钮是全新元素，逐个绑的事件跟着旧节点一起没了。
   * 玩家看到的症状就是「变体有时候点不动」：先悬停碰过别的节点、
   * 或者重开面板时鼠标正好压在某个节点上（浏览器会给新挪过来的元素补一次
   * mouseenter），卡上那三行就再也点不亮 —— 而树上那行变体名还是好的，
   * 所以看起来像「时灵时不灵」。委托挂在一直不换的 #skList 上，换多少次卡都在。 */
  applyVariantForm(id, idx) {
    const view = this.skillFormView(id);
    if (!view) return false;
    if (view.idx === idx) return false;      // 点的是「当前」那条：什么都不做
    const r = Game.setSkillForm(id, idx);
    this.toast(r.msg, r.ok ? '' : 'bad');
    if (!r.ok) return false;
    SFX.ui();
    return true;
  },

  /* ---------------- 选取向（两个入口共用一个口径） ----------------
   * 入口：节点浮层两条（data-pick）、说明书卡两条（data-pset）。
   * 取向要花技能点，所以必须走「草稿 → 确认」，不能直接落盘。
   * 点已经选中的那一条 = 退掉（点数返还）。 PICK-ROW-CLICKABLE */
  skillPickBranch(id, idx) {
    const cur = Game.branchPick(id);
    const had = this.snapDirty('skill');
    this.snapTake('skill');
    const r = Game.setBranchPick(id, idx === cur ? -1 : idx);
    if (!r.ok) {
      if (!had && this.snaps) delete this.snaps.skill;
      this.toast(r.msg, 'bad');
      return false;
    }
    SFX.ui();
    this.toast(r.msg);
    this.renderSkillPanel();
    return true;
  },

  /* ---------------- 变体视图 ----------------
   * 只有一条通道：SKILL_TREE.branches[id].form（三层里的第三层）。
   * 旧 SKILLS[id].variants 在 P3 收尾后不再参与任何结算，所以这里也不再有
   * 「两套变体二选一」的判断 —— 一份数据、一个口径，面板与战斗不会脱节。
   * 返回 { kind, idx, items[] }，卡片和节点都读它，不各写一套。 */
  skillFormView(id) {
    const sk = SKILLS[id];
    if (!sk) return null;
    const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
    if (!br || !br.form.length) return { kind: 'form', idx: 0, items: [] };
    const idx = (typeof Game.skillForm === 'function') ? Game.skillForm(id) : 0;
    const st = Game.state && Game.state.stats;
    return {
      kind: 'form', idx,
      items: br.form.map((o, i) => ({
        i, name: o.name, desc: o.desc, on: i === idx,
        pending: (typeof skillFormPending === 'function') ? skillFormPending(o) : [],
        condOk: (typeof skillFormCondOk === 'function') ? skillFormCondOk(o, st) : true,
        cond: o.cond || null,
        /* 有 beh 就是「改打法」，只有 mods 是「改数字」—— 三层分支里
         * 这一栏要让人一眼分清，不然三条看起来都一样 */
        mechLabel: (o.beh && Object.keys(o.beh).length) ? '改打法' : null,
        /* [P4] 这条变体施法时是什么样子（风格字 + 主色）。
         * 纯数值变体返回plain，面板不显示 —— 不给它硬安光效。 */
        fx: (typeof skillFormFx === 'function') ? skillFormFx(id, i) : null
      }))
    };
  },

  /* ---------------- 右侧说明书 ----------------
   * 只读：数值 / 描述 / 机制 / 分支。操作全在树上，这里不放按钮。 */
  /* 手机上说明书卡里的 ＋1 / −1 大按钮。
   * 触屏没有右键，原来那对 ± 只有 26px 见方、还挂在树上节点下方 ——
   * 点十次中三次。PC 上不渲染（右键更顺手，也不占卡片高度）。
   * 沿用 data-sklv / data-sklvd，绑定逻辑与树上那对是同一份。 */
  skActsHTML(id, kind, lv, max, dis) {
    if (!(typeof MTREE !== 'undefined' && MTREE.isMobile())) return '';
    const canUp = !dis && lv < max && Game.skillPoints() > 0;
    const canDown = !dis && lv > (kind === 'active' ? 1 : 0);
    return `<div class="sd-acts">
      <button class="btn" data-sklv="${id}"${canUp ? '' : ' disabled'}>＋ 1 级</button>
      <button class="btn" data-sklvd="${id}"${canDown ? '' : ' disabled'}>− 1 级</button>
    </div>`;
  },

  skCardHTML(id) {
    const s = Game.state;
    const sk = SKILLS[id];
    /* [P2] 被动 / 关键被动有自己的说明书卡 */
    if (!sk && SKILL_TREE.passives && SKILL_TREE.passives[id]) return this.skPassiveCardHTML(id);
    if (!sk) return '<div class="sk-right"><div class="vhint">这个方向还没有术法</div></div>';
    /* 两个等级，别混：
     *   lv   等阶 —— 打起来是几级（已投 + 装备 / 命格 / 传世的「+技能等级」）
     *   inv  已投 —— 技能点花了几级，分支（精研 / 取向）的门槛只看这个
     * 只显示 lv 会出现玩家最常问的那句：「我技能都 3 级了，怎么还不让选取向」
     * —— 那 3 级里有一级是装备给的。所以两个都要写出来。 LEVEL-INVESTED-PATCH */
    const lv = Game.skillLevel(id);
    const inv = ((Game.skillState()[id] || {}).lv) || 1;
    const lvBonus = Math.max(0, lv - inv);
    const view = this.skillFormView(id);
    const locked = !Game.skillUnlocked(id);
    const isGrant = (SKILL_ORDER[s.cls] || []).indexOf(id) < 0;
    /* 预览伤害：攻击力 × 倍率 ×（变体 + 等级 + 分支 + 台阶）。
     * 必须与 Game.effSkillMods(id) 同口径 —— 卡上算一套、施法算另一套，
     * 玩家就会遇到「面板说 +30%，打出来没变」。
     * [P2b] 这里不再自己 merge 三份修正，直接调战斗那个函数：
     * 台阶修正加进 effSkillMods 之后，凡是「自己拼一遍」的写法都会漏一层。 */
    const smod = (typeof Game.effSkillMods === 'function') ? Game.effSkillMods(id) : null;
    /* [P2] 等级倍率必须与 castSkill 同口径（skillLvMul 分段曲线） */
    const lvMul = (typeof skillLvMul === 'function') ? skillLvMul(lv) : 1;
    const spow = (smod ? 1 + (smod.dmg || 0) / 100 : 1) * lvMul;
    const dmgTxt = Math.round(s.stats.atk * sk.mult * spow);
    const desc = (sk.desc || '').replace(/\{dmg\}/g, '<b style="color:#ffe9a8">' + dmgTxt + '</b>');
    const castTxt = sk.cast === 'ground' ? '指定位置' : sk.cast === 'dir' ? '指定方向' : sk.cast === 'enemy' ? '自动索敌' : '自身';
    const pips = Array.from({ length: SKILL_LV_MAX }, (_, i) => `<span class="sk-pip ${i < inv ? 'on' : ''}"></span>`).join('');

    /* [P2c] 精进轨道（11~20）。
     *
     * 有效等级超过 10 之后，玩家在卡上**看不到任何东西**：10 格全亮、数字变成
     * 「投入 10/10 · 装备 +3」，再加装备也只改那行小字。方案 §5.2 要求
     * 「1~10 显示圆满、11~20 显示精进」，并且**渐进披露**（精通层 10 级后才出现）——
     * 所以这一条只在 `lvBonus > 0` 时画，不到 10 级的玩家看不到它。
     *
     * 这里只标两个**已经兑现**的点：
     *   15 级 —— 精通层三选一（真做了，见下面的 mstBlock）
     *   20 级 —— 有效等级上限（事实，与「质变」无关）
     * 方案的 Lv20「最终精通（Capstone）」还没实装，所以轨道上不写那四个字 ——
     * 面板宣称一件不存在的事，正是本项目「文案与实装对齐」这条红线要拦的。
     */
    const T = (typeof SKILL_TIERS !== 'undefined') ? SKILL_TIERS
      : { baseMax: 10, cap: 20, masteryAt: 15, labels: { mastery: '精进' } };
    const mstSpan = Math.max(1, T.cap - T.baseMax);
    const mstN = Math.max(0, Math.min(T.cap, lv) - T.baseMax);
    const mstPips = Array.from({ length: mstSpan }, (_, i) => {
      const at = T.baseMax + i + 1;
      const cls = at === T.masteryAt ? ' ms' : (at === T.cap ? ' cap' : '');
      const tip = at === T.masteryAt ? at + ' 级 · 精通层：三选一（烈 / 疾 / 省）'
        : at === T.cap ? at + ' 级 · 有效等级上限（含装备 / 词缀加成）' : at + ' 级';
      return `<span class="sk-pip${i < mstN ? ' on' : ''}${cls}" title="${tip}"></span>`;
    }).join('');
    const mstRow = lvBonus > 0
      ? `<div class="sd-lv mst" title="1~${T.baseMax} 级为${T.labels.base}（投入技能点）；${T.baseMax + 1}~${T.cap} 级为${T.labels.mastery}层 —— ${T.labels.masteryTip}">
          <div class="sk-pips">${mstPips}</div>
          <span class="sk-lvt">${T.labels.mastery} <b>${lv}</b>/${T.cap}</span></div>`
      : '';

    /* 标签：装备词缀按这些标签生效，所以摆在卡上（BD 的另一半） */
    const tg = (typeof skillTags === 'function') ? skillTags(id) : [];
    const tags = tg.length
      ? `<div class="sd-tags">${tg.map(t => `<i class="tg ${skillTagKind(t) || ''}">${SKILL_TREE.tagName[t] || t}</i>`).join('')}</div>`
      : '';

    /* 三条分支：精研（自动）/ 取向（二选一 · 1 点）/ 变体（三选一 · 免费）。
     * 卡上写的是「你现在拥有什么、还能怎么换」，不是「以后会有什么」。
     * 变体这一格是可以直接点的（树上节点下的小记号是同一个入口）。 */
    const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
    const at = SKILL_TREE.pickAt || 3;      // inv 已在上面算过（已投等级）
    const coreOn = (typeof skillBranchCoreOn === 'function') && skillBranchCoreOn(inv);
    const pk = (typeof Game.branchPick === 'function') ? Game.branchPick(id) : -1;
    const rd = (typeof Game.branchReady === 'function') ? Game.branchReady(id) : { core: true, pick: [] };

    let rows = '';
    if (br) {
      const coreTxt = br.core
        ? `<b>${br.core.name}</b><em>${br.core.desc}</em>` +
          (coreOn ? (rd.core ? '<i class="sd-tag on">已生效</i>' : '<i class="sd-tag na">尚未实现</i>')
            : `<i class="sd-tag">${at} 级自动</i>`)
        : '—';
      rows += `<div><span class="sb-k">精研</span>${coreTxt}</div>`;
      /* 取向：二选一 · 1 点。卡上也必须能点。
       * 以前这里只有一行纯文字，入口全靠「树上节点下的小记号」——
       * 玩家最常干的事就是反复点节点（每点一次 +1 级），
       * 于是就会出现那句：「我技能都 4 级了，怎么还是选不了取向」。
       * 三条分支在卡上长得一样、点得一样，才不会再有这个误解。 PICK-ROW-CLICKABLE */
      if (br.pick.length) {
        const pCost = SKILL_TREE.branchCost.pick;
        const pPts = Game.skillPoints();
        const pItems = br.pick.map((o, i) => {
          const on = pk === i;
          const ready = !rd || !rd.pick || rd.pick[i];
          const notYet = !ready ? false : inv < at;
          const poor = ready && !on && pk < 0 && pPts < pCost;
          const dis = !ready || notYet || poor;
          let tail = '';
          if (!ready) {
            const pend = (rd && rd.pending && rd.pending[i]) || [];
            tail = `<i class="sd-tag na" title="尚未实现：${pend.join(' / ')}">未开放</i>`;
          } else if (notYet) {
            tail = `<i class="sd-tag">尚需 ${at - inv} 级</i>`;
          } else if (on) {
            tail = '<i class="sd-tag on">已选</i>';
          } else if (poor) {
            tail = '<i class="sd-tag na">技能点不足</i>';
          } else if (pk >= 0) {
            tail = `<i class="sd-tag">换向 · 不另计点</i>`;
          } else {
            tail = `<i class="sd-tag">${pCost} 点</i>`;
          }
          let tip = '';
          if (notYet) tip = `投入等级 ${inv}：需达到 ${at} 级方可选择（装备与命格的等级加成不计入投入等级${lvBonus ? '；当前等阶 ' + (inv + lvBonus) : ''}）`;
          else if (poor) tip = `技能点不足：选取取向需 ${pCost} 点，当前 ${pPts} 点`;
          else if (!ready) tip = '该条目尚未实现';
          else if (on) tip = '取消该取向并返还点数';
          else tip = '选择「' + o.name + '」（' + (pk >= 0 ? '换向不另计点' : '消耗 ' + pCost + ' 点，需确认') + '）';
          return `<button class="sb-v sb-p${on ? ' on' : ''}${dis ? ' na' : ''}" data-pset="${id}:${i}"
            aria-pressed="${on ? 'true' : 'false'}" title="${tip}" ${dis ? 'disabled' : ''}>
            <b>${o.name}</b><em>${o.desc}</em>${tail}</button>`;
        }).join('');
        rows += `<div class="sb-vwrap sb-pwrap"><span class="sb-k">取向</span>
          <div class="sb-vlist sb-plist">${pItems}</div>
          <em class="sb-vhint">二选一 · 消耗 ${pCost} 点 · 已选项可取消并返还点数</em></div>`;
      }
    }
    /* 变体：三选一、随时可换、不花点。三条描述全列出来 ——
     * 只摆三个名字，玩家还得挨个切过去才知道换的是什么。
     * 这三行本身就能点（切到那一条）；节点下的变体名是同一个入口的快捷方式。
     * form 通道里没接完的那条标「待接」且点不动 —— 不许「点了没反应」。 */
    const vItems = (view ? view.items : []).map(it => {
      const on = it.on;
      const na = it.pending && it.pending.length;
      const condNo = !na && it.condOk === false;
      const dis = locked || na || condNo;
      let tail = '';
      if (na) {
        tail = `<i class="sd-tag na" title="尚未实现：${it.pending.join(' / ')}">未开放</i>`;
      } else if (condNo) {
        const need = it.cond && it.cond.rageMax ? '怒气上限 ' + it.cond.rageMax : '前提不足';
        tail = `<i class="sd-tag na" title="${need}">需 ${need}</i>`;
      } else if (on) {
        tail = '<i class="sd-tag on">当前</i>';
      }
      if (on && it.mechLabel) tail += `<i class="sd-mech">机制 · ${it.mechLabel}</i>`;
      /* 这条变体的特效风格（施法时就是这个颜色）。摆名字旁边是为了让
       * 「我换的是打法不是数字」这件事在面板上也成立。 */
      const fxc = it.fx && it.fx.key !== 'plain'
        ? '#' + ('000000' + it.fx.color.toString(16)).slice(-6) : '';
      const fxChip = fxc ? `<i class="sd-fx" style="color:${fxc};border-color:${fxc}44">${it.fx.name}</i>` : '';
      return `<button class="sb-v${on ? ' on' : ''}${dis ? ' na' : ''}" data-vset="${id}:${it.i}"
        aria-pressed="${on ? 'true' : 'false'}"
        title="${na ? '尚未实现：' + it.pending.join(' / ') : condNo ? '前提不满足' : on ? '当前变体' : '切换至 ' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][it.i] + ' ' + it.name}"
        ${dis ? 'disabled' : ''}>
        <b>${['Ⅰ', 'Ⅱ', 'Ⅲ'][it.i]} ${it.name}</b><em>${it.desc}</em>${tail}${fxChip}</button>`;
    }).join('');
    rows += `<div class="sb-vwrap"><span class="sb-k">变体</span>
      <div class="sb-vlist">${vItems}</div>
      <em class="sb-vhint">${view && view.kind === 'form'
        ? '三选一 · 可随时切换 · 不消耗技能点'
        : '三选一 · 可随时切换 · 不消耗技能点'}</em></div>`;

    /* [P2c] 精通层三选一（Lv15 起）。
     *
     * 与「取向 / 变体」长得像，但门槛看的是**有效等级**（含装备 / 词缀），
     * 不是投入等级 —— 11~20 是词条层，玩家点不出来。
     *
     * 三条都走 mods（dmg / cd / cost），不新增 beh 键：精通层是「数值强化」，
     * 不是第二套机制（方案 §5.2 拍板「不再新增形态」）。
     *
     * 渐进披露与精进轨道同一条线：只在有效等级 > 10 时出现。
     * 未到 15 级时三条都在、但点不动并写明还差几级 —— 直接藏起来的话，
     * 玩家攒到 15 级才第一次知道有这么个东西。 */
    const mstOn = (typeof skillMasteryOn === 'function') && skillMasteryOn(lv);
    const mstIdx = (typeof Game.skillMastery === 'function') ? Game.skillMastery(id) : 0;
    const mstDefs = (typeof SKILL_TIERS !== 'undefined' && SKILL_TIERS.mastery) || [];
    const mstItems = mstDefs.map((o, i) => {
      const on = mstOn && i === mstIdx;
      const dis = locked || !mstOn;
      const tip = !mstOn
        ? '等阶 ' + lv + '：需 ' + T.masteryAt + ' 级方可精通（还差 ' + Math.max(0, T.masteryAt - lv) + ' 级）'
        : on ? '当前精通' : '切换至「' + o.name + '」（免费，随时可换）';
      return `<button class="sb-v${on ? ' on' : ''}${dis ? ' na' : ''}" data-mset="${id}:${i}"
        aria-pressed="${on ? 'true' : 'false'}" title="${tip}" ${dis ? 'disabled' : ''}>
        <b>${o.name}</b><em>${o.desc}</em>${on ? '<i class="sd-tag on">当前</i>'
          : (!mstOn ? `<i class="sd-tag">${T.masteryAt} 级</i>` : '')}</button>`;
    }).join('');
    const mstBlock = (lvBonus > 0 && mstItems)
      ? `<div class="sb-vwrap"><span class="sb-k">精通</span>
          <div class="sb-vlist sb-mlist">${mstItems}</div>
          <em class="sb-vhint">${mstOn
            ? '三选一 · 可随时切换 · 不消耗技能点'
            : '有效等级达到 ' + T.masteryAt + ' 级开启（11~20 级来自装备 / 词缀）'}</em></div>`
      : '';
    const branch = `<div class="sd-branch">${rows}${mstBlock}
        <div class="dim2">${inv < at
          ? '投入等级 ' + inv + ' · 达到 ' + at + ' 级自动获得精研并开放取向'
            + (lvBonus ? '（装备的 +' + lvBonus + ' 级不算门槛）' : '')
          : '取向与变体均可直接点选；节点下方标记为同一入口'}</div>
      </div>`;

    return `<div class="sk-right">
      <div class="sd-head"><span class="sd-ico">${skillIconSvg(id, 30)}</span>
        <div><div class="sd-name">${sk.name}${isGrant ? '<span class="sk-lock gr">传世秘技</span>' : (locked ? `<span class="sk-lock">${sk.unlock} 级领悟</span>` : '')}</div>
        <div class="sd-sub">${sk.tree} · ${isGrant ? '传世授予（脱下即失去）' : (locked ? '未领悟'
          : '等阶 ' + lv + (lvBonus ? '（投入 ' + inv + ' · 加成 +' + lvBonus + '）' : ''))}</div></div></div>
      ${tags}
      <div class="sd-desc">${desc}</div>
      <div class="sd-meta">消耗 ${Game.skillCost(sk)} · 冷却 ${Game.skillCd(sk).toFixed(1)}s · ${castTxt}${sk.castRange ? ' · ' + sk.castRange + ' 码' : ''}</div>
      <div class="sd-lv" title="1~${T.baseMax} 级为${T.labels.base}：投入技能点，每级 1 点">
        <div class="sk-pips">${pips}</div>
        <span class="sk-lvt">投入 <b>${inv}</b>/${SKILL_LV_MAX}${lvBonus ? ' · 装备 +' + lvBonus : ''}</span></div>
      ${mstRow}
      ${branch}
      <div class="sd-hintline">${locked ? '领悟后可分配技能点' : '左键加 1 级 · 右键减 1 级 · 节点标记选择分支'}${inv > 1 ? ' · 已分配 ' + (inv - 1) + ' 点' : ''}</div>
      ${this.skActsHTML(id, 'active', inv, SKILL_LV_MAX, locked)}
    </div>`;
  },

  /* [P2] 被动 / 关键被动的说明书卡：数值实时读，增益来源写清楚 */
  skPassiveCardHTML(id) {
    const def = SKILL_TREE.passives[id];
    const info = (typeof skillPassiveInfo === 'function') ? skillPassiveInfo(id) : null;
    const lv = Game.passiveLv(id);
    const locked = !Game.passiveUnlocked(id);
    const na = Game.passiveImplemented && !Game.passiveImplemented(id);
    const max = def.max || 1;
    const pips = Array.from({ length: max }, (_, i) => `<span class="sk-pip ${i < lv ? 'on' : ''}"></span>`).join('');
    const ico = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SKILL_TREE.icons[def.icon || (info && info.key ? 'key' : 'passive')] || ''}</svg>`;
    const stLine = locked
      ? `${info ? info.unlock : 1} 级解锁（与「${info && SKILLS[info.active] ? SKILLS[info.active].name : '同岔口主动'}」同门槛）`
      : na ? '增益尚未接入 · 暂不可分配' : `投入 ${lv} 级 · 每级 1 点`;
    return `<div class="sk-right">
      <div class="sd-head"><span class="sd-ico">${ico}</span>
        <div><div class="sd-name">${def.name}<span class="sk-lock ${info && info.key ? 'gr' : ''}">${info && info.key ? '关键被动 · 限 1 点' : '被动'}</span></div>
        <div class="sd-sub">${info ? info.tree + ' · ' : ''}与「${info && SKILLS[info.active] ? SKILLS[info.active].name : '同岔口主动'}」同一道岔口</div></div></div>
      <div class="sd-desc">${def.desc}</div>
      <div class="sd-lv"><div class="sk-pips">${pips}</div><span class="sk-lvt"><b>${lv}</b>/${max}</span></div>
      <div class="sd-meta">${stLine}</div>
      <div class="sd-hintline">${na ? '尚未实现 · 暂不可分配' : locked ? '解锁后左键加 1 级 · 右键减 1 级' : '左键加 1 级 · 右键减 1 级 · 经过「未确认」条'}</div>
      ${this.skActsHTML(id, 'passive', lv, max, locked || na)}
    </div>`;
  },

  /* ---------------- 选中：点击「钉住」+ 悬停「预览」 ----------------
   * 为什么要有两个状态（skSel / skHover）：
   * 右侧说明书卡就在树的右边，鼠标从节点移过去**必然扫过中间那一列节点**。
   * 早先的做法是「悬停 = 直接改选中」，于是：
   *   · 扫过被动节点时卡被换成一张小得多的被动卡 —— 看着像「面板消失了」；
   *   · 扫过别的主动时卡换成了别的技能，到了右边点变体，切的是那个技能的
   *     变体 —— 看着像「变体切换不了」（其实是切错了对象）。
   * 现在：点击钉住（skSel），悬停只是预览（skHover），指针离开树就回位。
   * 玩家点过谁，右边就一直是谁，中间飘过的节点只借来看一眼。 */

  /* 当前该展示谁：有预览就展示预览，否则展示钉住的那个 */
  skShown() {
    const h = this.skHover;
    if (h && (SKILLS[h] || (SKILL_TREE.passives || {})[h])) return h;
    return this.skSel;
  },

  /* 只重画高亮与说明书卡，不整块重建（否则鼠标一停下 hover 就丢） */
  paintSel() {
    const list = document.getElementById('skList');
    if (!list) return;
    const id = this.skShown();
    list.querySelectorAll('.skt-nd.sel').forEach(n => n.classList.remove('sel'));
    const el = list.querySelector('.skt-nd[data-sktpas="' + id + '"]')
      || list.querySelector('.skt-nd.act[data-skpick="' + id + '"]');
    if (el) el.classList.add('sel');
    const card = list.querySelector('.sk-right');
    /* 整块换掉卡。代价：新卡上的按钮没有绑定 —— 所以卡上的变体三行用
     * 委托（bindTreeNav），这里不需要也不应该再补绑。
     * 换的是同一张卡（换变体 / 选取向 / 重复点同一个节点）就保住滚动位置，
     * 换到别的技能才回到顶部。 */
    const sameCard = (this._skCardId === id);
    const keepY = (sameCard && card) ? card.scrollTop : 0;
    if (card) card.outerHTML = this.skCardHTML(id);
    if (sameCard && keepY) {
      const nc = list.querySelector('.sk-right');
      if (nc) nc.scrollTop = keepY;
    }
    this._skCardId = id;
    const hint = list.querySelector('.sb-hint');
    if (hint) hint.textContent = this.skBarHint();
  },

  /* 点击 = 钉住（同时清掉预览） */
  selectSkill(id) {
    this.killHoverTimer();
    const same = (this.skSel === id) && !this.skHover;
    this.skSel = id;
    this.skHover = null;
    if (!same) this.paintSel();
  },

  /* 悬停 = 预览。触摸设备不预览（没有「悬停」这回事，点了才算）。
   * 要「停住 260ms」才真的换卡：鼠标从节点移向右边说明书卡的这段路上
   * 必然扫过中间那一列节点（几百像素、好几个节点），掠过就换卡会让人以为
   * 「卡消失了 / 卡变了」。停住不动才预览 —— 想看一眼别的技能照样看得到。 */
  hoverSkill(id) {
    const touch = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
    if (touch) return;
    this.killHoverTimer();
    if (this.skSel === id) {            // 悬停回自己：撤掉预览，卡回到钉住的那个
      if (this.skHover) { this.skHover = null; this.paintSel(); }
      return;
    }
    if (this.skHover === id) return;
    this._skHoverT = setTimeout(() => {
      this._skHoverT = null;
      if (this.skSel === id) return;
      this.skHover = id;
      this.paintSel();
    }, 260);
  },

  killHoverTimer() {
    if (this._skHoverT) { clearTimeout(this._skHoverT); this._skHoverT = null; }
  },

  /* 指针离开树（去右边看卡 / 点变体）：预览作废，卡回到钉住的那个 */
  clearHover() {
    this.killHoverTimer();
    if (!this.skHover) return;
    this.skHover = null;
    this.paintSel();
  },

  skBarHint() {
    const id = this.skSel;
    if (!id) return '先点一个术法';
    if (!SKILLS[id]) {
      if (SKILL_TREE.passives && SKILL_TREE.passives[id]) return '被动不占技能条 · 左键加 / 右键减';
      return '先点一个术法';
    }
    if (!Game.skillUnlocked(id)) return '「' + SKILLS[id].name + '」领悟后可上条';
    return '点格子放「' + SKILLS[id].name + '」· 也可以直接把节点拖进格子 · 拖有东西的格子可换位 · 右键腾空';
  },

  /* ---------------- 底部技能条 ----------------
   * 默认收起：它不是一个「要一直看」的东西，是要配的时候才用的东西。
   * 点「技 能 条」或用鼠标把节点往下拖，才会展开 5 个格子。
   * [P1] 每格 = 一个功能位：格上标的是键位（左键 / 1~4），
   * 只能放本位继承的技能（Game.assignSkillBar 会把越位的打回来）。 */
  skBarHTML() {
    const bar = Game.skillBar();
    const setIdx = Game.barSet();
    const sel = this.skSel;
    const open = !!this.skBarOpen;
    const keyOf = i => (typeof SKILL_BAR_KEYS !== 'undefined' && SKILL_BAR_KEYS[i]) || String(i + 1);
    const slots = bar.map((bid, i) => {
      const sk = bid ? SKILLS[bid] : null;
      const meta = (typeof skillArchSlot === 'function') ? (skillArchSlot(Game.state.cls, i + 1) || {}) : {};
      return `<button class="sb-slot ${bid && bid === sel ? 'on' : ''} ${sk ? 'occ' : ''}" data-skbar="${i}"
        title="${sk ? sk.name + ' · ' + (meta.glyph || '') + ' 号位 · 右键腾空' : '空位 ' + keyOf(i) + '（' + (meta.glyph || i + 1) + ' 号位 · ' + (meta.name || '') + '）'}">
        ${sk ? skillIconSvg(bid, 22) : '<span class="sb-dot"></span>'}
        <span class="sb-k">${keyOf(i)}</span></button>`;
    }).join('');
    /* 收起状态的小预览：只表示「放了什么」，不可点 */
    const mini = bar.map(bid => `<i class="${bid ? 'on' : ''}">${bid ? skillIconSvg(bid, 13) : ''}</i>`).join('');
    /* 传世授予的秘技不在本职业树上（树上根本没这个节点），
     * 但它们是能上技能条的，所以展开时单独留一小排，点一下选中再点格子。 */
    const gmap = (Game.state.stats && Game.state.stats.grantedSkills) || {};
    const granted = Object.keys(gmap).filter(gid => SKILLS[gid] && (SKILL_ORDER[Game.state.cls] || []).indexOf(gid) < 0);
    const gHtml = granted.length
      ? `<span class="sb-grant"><span class="sb-glab">秘技</span>` + granted.map(gid =>
        `<button class="sb-slot gr ${gid === sel ? 'on' : ''} occ" data-skpick="${gid}"
          title="${SKILLS[gid].name} · 传世授予（脱下即失去）">${skillIconSvg(gid, 22)}<span class="sb-k">秘</span></button>`).join('') + '</span>'
      : '';
    return `<div class="sk-bar ${open ? 'open' : 'collapsed'}">
      <button class="sb-tog" data-skbartog="1" title="${open ? '收起技能条' : '展开技能条，把术法拖进格子'}">
        <span class="sb-lab">技 能 条</span>
        <span class="sb-mini">${mini}</span>
        <span class="sb-arrow">${open ? '收起 ▾' : '配置 ▴'}</span>
      </button>
      <span class="sb-body">
        <span class="sb-slots">${slots}</span>
        ${gHtml}
        <span class="sk-sets"><span class="sk-setslab">栏</span>${SKILL_BAR_SET_NAME.map((nm, i) =>
          `<button class="sk-setbtn ${i === setIdx ? 'on' : ''}" data-skset="${i}" title="${nm}（${SKILL_BAR_SET_LABEL} / ${SKILL_BAR_SET_KEY_ALT} 切换）">${['甲', '乙'][i] || (i + 1)}</button>`).join('')}</span>
        <span class="sb-hint">${this.skBarHint()}</span>
      </span>
    </div>`;
  },

  /* ---------------- 树形画布（[P1d] 三列纵向） ----------------
   * 一条线 = 一列；列内从上往下按「等级门槛」递增；主动在列的主轴上，
   * 被动小一圈挂在它右边（它是这条线的附属，不是与主动并列的选项）。
   * 连线只剩「同线竖向淡引导线」+「主动到自身被动的短线」。
   * 几何一律由 skTreeLayout 算，不手写；节点内容照旧。 */

  /* 手机：三条线的分页签（桌面不需要 —— 三列一起看才叫「并行」） */
  skTreeTabsHTML() {
    const cls = (typeof Game !== 'undefined' && Game.state) ? Game.state.cls : null;
    const lay = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.layout && SKILL_TREE.layout[cls]) || [];
    const trees = lay.map(t => t.name);
    if (!trees.length) return '';
    if (this.skTreeTab == null || trees.indexOf(this.skTreeTab) < 0) this.skTreeTab = trees[0];
    return '<div class="skt-tabs on">' + trees.map(t =>
      `<button class="${t === this.skTreeTab ? 'on' : ''}" data-skttree="${t}">${t}</button>`).join('') + '</div>';
  },

  /* 纯数据排布（不碰 DOM，所以探针可以直接断言顺序与是否重叠）
   * 返回 { cols:[{ name, ci, baseX, nodes:[nd] }], W, H, rows }
   * nd = { id, kind, name, max, unlock, line, ci, ri, reqLv, needPts, act, baseX, y } */
  skTreeLayout(cls, onlyName) {
    const lay = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.layout && SKILL_TREE.layout[cls]) || [];
    if (!lay.length) return { cols: [], W: 0, H: 0, rows: 0 };
    const base = {};
    skillTreeNodes(cls).forEach(n => { base[n.id] = n; });
    const lines = (typeof skillLines === 'function') ? skillLines(cls) : [];
    const cols = [];
    let maxRi = 0;

    lines.forEach(ln => {
      if (onlyName && ln.name !== onlyName) return;
      /* 列号 = 显示顺序（手机只显示一条线时从 0 起，不会留下空列） */
      const pos = cols.length;
      /* 行 = 岔口：同一岔口的主动与被动合成一行 —— 之前它们分居两列，
       * 看着像「二选一」。行序 = reqLv 升序（同级按原岔口序号，重画不跳）。 */
      const groups = {};
      ln.nodes.forEach(n => { (groups[n.row] = groups[n.row] || []).push(n); });
      const rows = Object.keys(groups).map(k => {
        const arr = groups[k];
        const act = arr.find(n => n.kind === 'active') || arr[0];
        return { row: Number(k), act: act, subs: arr.filter(n => n !== act), reqLv: act.reqLv || 1 };
      }).sort((a, b) => (a.reqLv - b.reqLv) || (a.row - b.row));

      const baseX = SKG.padX + pos * SKG.colGap;
      const nodes = [];
      rows.forEach((r, ri) => {
        if (ri > maxRi) maxRi = ri;
        const y = SKG.padY + ri * SKG.rowH;
        [r.act].concat(r.subs).forEach((x, si) => {
          const b = base[x.id] || {};
          nodes.push({
            id: x.id, kind: x.kind, name: x.name || b.name || x.id,
            max: x.max || b.max || 1, unlock: b.unlock || x.reqLv || 1,
            line: ln.name, ci: pos, ri: ri, reqLv: x.reqLv, needPts: x.needPts,
            act: si === 0, baseX: baseX, y: y
          });
        });
      });
      cols.push({ name: ln.name, ci: pos, baseX: baseX, nodes: nodes });
    });

    if (!cols.length) return { cols: [], W: 0, H: 0, rows: 0 };
    const W = SKG.padX * 2 + (cols.length - 1) * SKG.colGap + SKG.pasDx + SKG.pasNode + 56;
    const H = SKG.padY + maxRi * SKG.rowH + SKG.node + 34;
    return { cols: cols, W: W, H: H, rows: maxRi + 1 };
  },

  skTreeHTML() {
    const cls = Game.state.cls;
    const lay = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.layout && SKILL_TREE.layout[cls]) || [];
    if (!lay.length) return '<div class="skt-stage"><div class="vhint">这个职业还没有技能树</div></div>';

    const trees = lay.map(t => t.name);
    const mob = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
    if (this.skTreeTab == null || trees.indexOf(this.skTreeTab) < 0) this.skTreeTab = trees[0];
    const geo = this.skTreeLayout(cls, mob ? this.skTreeTab : null);
    const cols = geo.cols;
    const list = [];
    cols.forEach(c => c.nodes.forEach(n => list.push(n)));
    const W = geo.W, H = geo.H;
    const z = Math.max(0.45, Math.min(2, this.skZoom || 1));
    const xOf = n => n.baseX + (n.act ? 0 : SKG.pasDx);

    const byId = {};
    list.forEach(n => byId[n.id] = n);

    /* 连线：每条线一根竖向淡引导线（穿在主动节点背后，只表示「这一列是一条线」，
     * 不是「上一个解锁下一个」—— 三线并行里没有硬前置），
     * 再加一条「主动 → 自己那一行的被动」短线。跨列的虚线已经不画了：
     * 那种线原来表示「二选一」，同一行两边现在都能点，画了就是误导。 */
    let wire = `<svg class="skt-wire" width="${W}" height="${H}">`;
    for (const c of cols) {
      const acts = c.nodes.filter(n => n.act);
      if (!acts.length) continue;
      const railX = acts[0].baseX + SKG.node / 2;
      const y1 = acts[0].y + SKG.node / 2;
      const y2 = acts[acts.length - 1].y + SKG.node / 2;
      if (y2 > y1) {
        wire += `<path d="M${railX} ${y1}V${y2}" stroke="rgba(216,178,90,.16)" stroke-width="1.5" fill="none"/>`;
      }
      for (const n of c.nodes) {
        if (n.act) continue;
        const cy = n.y + SKG.pasNode / 2 + 5;
        wire += `<path d="M${n.baseX + SKG.node} ${cy}H${n.baseX + SKG.pasDx}" stroke="rgba(216,178,90,.2)" stroke-width="1" fill="none"/>`;
      }
    }
    wire += '</svg>';

    /* 被动 / 关键被动用的是 SKILL_TREE.icons 里的通用纹样，不走 skillIconSvg */
    const tIcon = (body, size) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body || ''}</svg>`;

    let h = '';
    if (mob) h += this.skTreeTabsHTML();
    /* 余量（skPad）直接烘进标记里：重排时不会先闪一帧「内容贴边」，
     * 探针在同一帧读到的大小也才是最终值 */
    const pad0 = this.skPad || 0;
    h += `<div class="skt-stage"><div class="skt-fit" style="width:${Math.round(W * z + pad0 * 2)}px;height:${Math.round(H * z + pad0 * 2)}px">
      <div class="skt-plate" data-w="${W}" data-h="${H}" style="width:${W}px;height:${H}px;left:${pad0}px;top:${pad0}px;transform:scale(${z})">`;
    h += wire;

    /* 列标题：一条线一列，标题居中压在列上（手机形态已有分页签，不再重复）。
     * 居中点取「主动中心」与「被动中心」的中点，不是节点宽度之和的一半 ——
     * 那样会把标题推到列右边去（真机上看出来的）。 */
    if (!mob) {
      cols.forEach(c => {
        const cx = c.baseX + (SKG.node / 2 + SKG.pasDx + SKG.pasNode / 2) / 2;
        h += `<div class="skt-cap" style="left:${cx}px;top:2px;transform:translateX(-50%)">${c.name}</div>`;
      });
    }

    const onBar = Game.skillBar();
    const touch = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
    for (const n of list) {
      const kind = n.kind === 'active' ? 'act' : (n.kind === 'key' ? 'key' : 'pas');
      /* [P2] 被动也走真投点：门槛 = 同岔口主动的领悟等级，账本在 s.passives */
      const isPas = n.kind !== 'active';
      /* [P1c] 三线并行：两种「点不了」分开显示 ——
       *   locked  等级不够（角标直接写要求等级）
       *   ptsLock 等级够了，但关键被动要「该线已投入 N 点」（软前置）
       * 不再有「岔口二选一」，同一岔口的主动与被动都能点。 */
      const gate = (typeof Game.skillGate === 'function') ? Game.skillGate(n.id) : null;
      const locked = gate ? !gate.levelOK
        : (isPas ? !(Game.passiveUnlocked && Game.passiveUnlocked(n.id)) : !Game.skillUnlocked(n.id));
      const ptsLock = !!(gate && gate.levelOK && !gate.ptsOK);
      const reqLv = gate ? gate.reqLv : n.unlock;
      const sel = n.id === this.skShown();
      const slot = n.kind === 'active' ? onBar.indexOf(n.id) : -1;
      const lv = n.kind === 'active' ? Game.skillLevel(n.id) : (Game.passiveLv ? Game.passiveLv(n.id) : 0);
      /* 已投等级：技能点花了几级。装备 / 命格给的「+技能等级」抬的是等阶（lv），
       * 不能拿来顶分支门槛，也不能拿来判「满了没」—— 否则身上带 +3 的装备，
       * 2 级的技能会显示成满级、＋ 按钮点不动，玩家还以为是 bug。
       * NODE-INVESTED-PATCH */
      const invLv = n.kind === 'active' ? (((Game.skillState()[n.id] || {}).lv) || 1) : lv;
      const full = isPas ? lv >= n.max : invLv >= SKILL_LV_MAX;
      const x = xOf(n), y = n.y;

      /* 三个小记号：精研（到 3 级自动）· 取向（3 级二选一 · 1 点）· 变体（当前 Ⅰ/Ⅱ/Ⅲ）。
       * 门槛与账本一律看「已投等级」invested，不看装备加成后的 skillLevel ——
       * 否则脱一件 +技能等级的装备，分支就凭空多出来 / 少回去。 */
      let marks = '', vnmDiv = '';
      if (n.kind === 'active') {
        const invested = invLv;
        const coreOn = invested >= (SKILL_TREE.pickAt || 3);
        const pk = Game.branchPick(n.id);
        const rd = (typeof Game.branchReady === 'function') ? Game.branchReady(n.id) : { core: true, pick: [] };
        const vv = this.skillFormView(n.id);
        const v = vv ? vv.idx : Game.skillVariant(n.id);
        const vn = (vv && vv.items[v]) ? vv.items[v].name : '';
        /* [P4] 变体专属特效：树上那行变体名染成这条变体的主色，
         * 战斗里放的也是同一种色。名字 + 颜色对上，玩家不用点开面板就知道装的哪条。 */
        const vfx = (typeof skillFormFx === 'function') ? skillFormFx(n.id, v) : null;
        const vfxCol = (vfx && vfx.key !== 'plain') ? '#' + ('000000' + vfx.color.toString(16)).slice(-6) : '';
        marks = `<div class="marks">
          <span class="mk core ${coreOn ? 'on' : ''} ${coreOn && rd && rd.core ? 'ready' : ''}" data-mark="${n.id}"
            title="精研 · ${coreOn ? (rd && rd.core ? '已生效' : '尚未实现') : '技能 ' + (SKILL_TREE.pickAt || 3) + ' 级自动'}"></span>
          <span class="mk dia pick ${pk >= 0 ? 'on' : ''} ${coreOn ? 'ready' : ''}" data-mark="${n.id}"
            title="取向 · ${pk >= 0 ? '已选（点开可换 / 退）' : coreOn ? '二选一 · ' + SKILL_TREE.branchCost.pick + ' 点' : '技能 ' + (SKILL_TREE.pickAt || 3) + ' 级解锁'}"></span>
          <span class="mk dia form v${v}" data-mark="${n.id}" title="变体 · ${{ 0: 'Ⅰ', 1: 'Ⅱ', 2: 'Ⅲ' }[v]} ${vn}"></span>
        </div>
        `;
        vnmDiv = `<div class="vnm v${v}" data-vnext="${n.id}"${vfxCol ? ` style="color:${vfxCol}"` : ''} title="当前变体 · ${vn}${vfx && vfx.key !== 'plain' ? '（' + vfx.name + '·' + vfx.key + '）' : ''}（点击切换至下一条）">${vn}</div>`;
      }

      const inner = n.kind === 'active'
        ? skillIconSvg(n.id, 26)
        : tIcon(SKILL_TREE.icons[n.kind === 'key' ? 'key' : 'passive'], n.kind === 'key' ? 24 : 25);
      const badge = n.kind === 'active'
        ? (locked ? reqLv + '级' : lv)
        : (locked ? reqLv + '级' : (lv > 0 ? lv : n.max));
      /* 等阶比已投高 = 身上有「+技能等级」的加成，角标说清楚，
       * 不然玩家会拿这个数字去对分支门槛（门槛看的是已投） */
      const badgeTip = full
        ? `已满级 ${isPas ? lv : invLv}/${n.max}`
        : (n.kind === 'active' && lv > invLv)
          ? `等阶 ${lv} = 投入 ${invLv} + 加成 ${lv - invLv}（分支门槛以投入等级 ${invLv} 计）` : '';
      const attr = n.kind === 'active'
        ? `data-skpick="${n.id}"`
        : `data-sktpas="${n.id}" data-sktname="${n.name}"`;

      /* [P1c] 软前置提示（关键被动专有）：只说「这条线还差几点」，
       * 不指向任何具体节点 —— 并行模型里没有「必须先点谁」这回事。 */
      const ptsTip = ptsLock
        ? `该线已投入 ${gate.linePts} / ${gate.needPts} 点（软前置：先把这条线练起来，点哪个节点都算）`
        : '';

      h += `<div class="skt-nd ${kind}${locked ? ' locked' : ''}${ptsLock ? ' pts' : ''}${sel ? ' sel' : ''}${full ? ' max' : ''}${isPas && lv > 0 ? ' own' : ''}" ${attr}${ptsTip ? ` title="${ptsTip}"` : ''}
        style="left:${x}px;top:${y}px">
        <div class="box">${inner}<span class="bg"${badgeTip ? ` title="${badgeTip}"` : ''}>${badge}</span>${slot >= 0 ? `<span class="skt-slot">${slot + 1}</span>` : ''}</div>
        <div class="nm">${n.name}</div>${vnmDiv}${marks}`;

      /* 选中节点的 ±：触屏唯一路径；PC 上也能点（键盘 / 无右键的场合） */
      if (sel && !locked && n.kind === 'active') {
        const canUp = invLv < SKILL_LV_MAX && Game.skillPoints() > 0;
        h += `<div class="skt-act">
          <button class="sa" data-sklv="${n.id}" ${canUp ? '' : 'disabled'} title="加 1 级（也只改草稿）">＋</button>
          <button class="sa" data-sklvd="${n.id}" ${invLv <= 1 ? 'disabled' : ''} title="退 1 级">−</button>
        </div>`;
      }
      h += '</div>';
    }

    /* [P1c] 「或 / 锁」标记整块删掉：三线并行后同一岔口的主动与被动
     * 可以都点，没有二选一可标。这里只在关键被动旁边标一个「软」，
     * 提示它要「这条线练够 N 点」（不指向任何具体节点）。 */
    for (const n of list) {
      if (n.kind !== 'key') continue;
      const g = (typeof Game.skillGate === 'function') ? Game.skillGate(n.id) : null;
      if (!g || g.ptsOK) continue;
      h += `<div class="skt-or soft" style="left:${xOf(n) + SKG.pasNode / 2 - 12}px;top:${n.y - 15}px" title="关键被动软前置：该线已投入 ${g.linePts} / ${g.needPts} 点"><i>线${g.linePts}/${g.needPts}</i></div>`;
    }

    /* 分支浮层：就地展开在节点旁，不跳右侧 */
    if (this.skPop && byId[this.skPop]) {
      const n = byId[this.skPop];
      const nx = xOf(n), ny = n.y;
      let px = nx + SKG.node + 10;
      if (px + SKG.popW > W) px = Math.max(2, nx - SKG.popW - 10);
      const py = Math.min(Math.max(2, ny - 8), Math.max(2, H - 210));
      h += this.skPopHTML(n.id, px, py);
    }

    h += '</div></div></div>';
    return h;
  },

  /* ---------------- 手机上的术法树：一条线一列、纵向排 ----------------
   * 原来的大画布要「双指捏合 + 单指平移」才看得全，节点下的 ＋/− 又只有 26px，
   * 玩家反馈「操作比较麻烦」。
   * [P1d] 之前这里是「脊 | 主动 | 被动」三列并排 —— 那是串行二选一的形状，
   * 三线并行后不再成立。现在改成：顶上三条线的分页签，每页只排一条线，
   * 从上往下按等级门槛递增（主动 + 它那一行的被动相邻）。一屏一列，点一下选中，
   * 加减在下方说明书卡里。列的顺序与桌面版同源（都走 skTreeLayout）。 */
  renderSkillTreeDOM() {
    const host = document.getElementById('skTree');
    if (!host || !Game.state) return;
    const cls = Game.state.cls;
    const lay = (typeof SKILL_TREE !== 'undefined' && SKILL_TREE.layout && SKILL_TREE.layout[cls]) || [];
    if (!lay.length) { host.innerHTML = '<div class="vhint">这个职业还没有技能树</div>'; return; }

    const trees = lay.map(t => t.name);
    if (this.skTreeTab == null || trees.indexOf(this.skTreeTab) < 0) this.skTreeTab = trees[0];
    const cur = lay.find(t => t.name === this.skTreeTab) || lay[0];
    const byId = {};
    skillTreeNodes(cls).forEach(n => { byId[n.id] = n; });

    /* 一条线一页：行序由 skTreeLayout 给（reqLv 升序，同岔口主动在前）。
     * req 只用来画那根竖引导线 —— 每行连上一行，视觉上就是「这一列是一条线」；
     * 结算里没有任何前置，这里的 req 只是画线用，别拿去做门槛判断。 */
    const geo = this.skTreeLayout(cls, cur.name);
    const one = geo.cols[0];
    const list = one ? one.nodes.map((n, i) => ({
      id: n.id, kind: n.kind, col: 0, row: i,
      req: i ? [one.nodes[i - 1].id] : []
    })) : [];

    const lvOf = n => n.kind === 'active'
      ? Game.skillLevel(n.id)
      : (Game.passiveLv ? Game.passiveLv(n.id) : 0);
    const invOf = n => n.kind === 'active' ? (((Game.skillState()[n.id] || {}).lv) || 1) : lvOf(n);
    const maxOf = n => n.kind === 'active' ? SKILL_LV_MAX
      : (((SKILL_TREE.passives || {})[n.id] || {}).max || 1);
    /* [P1c] 三线并行：锁定只看角色等级；关键被动的「该线 N 点」另算软前置 */
    const gateOf = n => (typeof Game.skillGate === 'function') ? Game.skillGate(n.id) : null;
    const lockOf = n => {
      const g = gateOf(n);
      if (g) return !g.levelOK;
      return n.kind === 'active'
        ? !Game.skillUnlocked(n.id)
        : !(Game.passiveUnlocked && Game.passiveUnlocked(n.id));
    };
    const ptsLockOf = n => {
      const g = gateOf(n);
      return !!(g && g.levelOK && !g.ptsOK);
    };
    const onBar = Game.skillBar();
    const tIcon = (body, size) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body || ''}</svg>`;

    MTREE.render(host, {
      nodes: list,
      sel: this.skShown(),
      resetScroll: this._skTreeShown !== cur.name,
      rowH: 74,
      cls: n => {
        const out = [];
        if (lockOf(n)) out.push('locked');
        if (ptsLockOf(n)) out.push('pts');
        const lv = invOf(n), max = maxOf(n);
        if (lv >= max) out.push('max');
        else if (lv > 0) out.push('own');
        if (n.kind !== 'active') out.push('pas');
        if (n.kind === 'active' && onBar.indexOf(n.id) >= 0) out.push('onbar');
        return out.join(' ');
      },
      tile: n => {
        const def = n.kind === 'active' ? (SKILLS[n.id] || {}) : ((SKILL_TREE.passives || {})[n.id] || {});
        const lv = invOf(n), max = maxOf(n);
        const ico = n.kind === 'active'
          ? (typeof skillIconSvg === 'function' ? skillIconSvg(n.id, 24) : '')
          : tIcon(SKILL_TREE.icons[n.kind === 'key' ? 'key' : 'passive'], 22);
        const g = gateOf(n);
        const badge = lockOf(n) ? ((g ? g.reqLv : def.unlock) || 1) + '级'
          : (n.kind === 'active' ? lv : (lv > 0 ? lv : max));
        return `<span class="mt-ico">${ico}</span>`
          + `<b class="mt-nm">${def.name || ''}</b>`
          + `<span class="mt-lv">${badge}</span>`;
      },
      /* [P1c] 主动 → 同岔口被动原来是虚线（表示「或」）；三线并行后两边都能点，
       * 边一律画成普通引导线，不再用线型暗示互斥。 */
      edgeCls: () => '',
      onPick: id => {
        this.skSel = id;
        this.skHover = null;
        try { SFX.ui(); } catch (e) { }
        this.renderSkillPanel();
      }
    });
    this._skTreeShown = cur.name;
  },

  /* 节点的分支浮层：精研 / 取向 / 变体三段。
   * 取向要花点，所以每一行都得说清「能不能点、点了扣几点」。 */
  skPopHTML(id, px, py) {
    const sk = SKILLS[id];
    if (!sk) return '';
    const br = (typeof skillBranches === 'function') ? skillBranches(id) : null;
    const rd = (typeof Game.branchReady === 'function') ? Game.branchReady(id) : null;
    const v = Game.skillVariant(id);
    const inv = ((Game.skillState()[id] || {}).lv) || 1;
    /* 等阶（含装备 / 命格 / 传世的 +技能等级）与已投分开 —— 门槛只看已投。
     * 浮层里必须写出来，否则玩家会拿角标上的「3」来质疑「为什么还不让选」。
     * POP-INVESTED-PATCH */
    const lvBonus = Math.max(0, Game.skillLevel(id) - inv);
    const at = SKILL_TREE.pickAt || 3;
    const coreOn = (typeof skillBranchCoreOn === 'function') && skillBranchCoreOn(inv);
    const pick = (typeof Game.branchPick === 'function') ? Game.branchPick(id) : -1;
    const cost = SKILL_TREE.branchCost.pick;
    const pts = Game.skillPoints();

    let h = `<div class="skt-pop" style="left:${px}px;top:${py}px;width:${SKG.popW}px">
      <div class="sp-hd"><b>${sk.name}</b><span>分支</span><i class="sp-x" data-popx="1">✕</i></div>`;

    /* ---- 精研：不选、不花点，等级到了自动生效 ---- */
    if (br && br.core) {
      const ready = !rd || rd.core;
      h += `<div class="sp-g"><div class="sp-l">精研
          <i>${coreOn ? (ready ? '已生效' : '等级已达 · 尚未实现')
            : '投入 ' + inv + ' 级 · 达到 ' + at + ' 级自动'}</i></div>
        <div class="sp-r ${coreOn && ready ? 'on' : ''} ${ready ? '' : 'na'}">
          <b>${br.core.name}<span class="sp-cost">不耗点</span></b><em>${br.core.desc}</em></div></div>`;
    }

    /* ---- 取向：二选一，1 点 ---- */
    if (br && br.pick.length) {
      h += `<div class="sp-g"><div class="sp-l">取向<i>二选一 · ${cost} 点${pick >= 0 ? ' · 再点一次退掉' : ''}</i></div>`;
      br.pick.forEach((o, i) => {
        const ready = !rd || rd.pick[i];
        const on = pick === i;
        let cls = 'ok', tail = `<span class="sp-cost">${cost} 点</span>`;
        if (!ready) {
          cls = 'na';
          const pend = (rd && rd.pending[i]) || [];
          tail = `<span class="sp-cost na" title="尚未实现：${pend.join(' / ')}">未开放</span>`;
        } else if (inv < at) {
          cls = 'lock';
          tail = `<span class="sp-cost">尚需 ${at - inv} 级</span>`;
        } else if (on) {
          cls = 'on';
          tail = `<span class="sp-cost on">已选</span>`;
        } else if (pick < 0 && pts < cost) {
          cls = 'lock';
          tail = `<span class="sp-cost">技能点不足</span>`;
        } else if (pick >= 0) {
          tail = `<span class="sp-cost">换向 · 不另计点</span>`;
        }
        let lockTip = '';
        if (cls === 'lock') {
          lockTip = (inv < at)
            ? `投入等级 ${inv}：需达到 ${at} 级方可选择（装备与命格的等级加成不计入投入等级${lvBonus ? '；当前等阶 ' + (inv + lvBonus) : ''}）`
            : `技能点不足：选取取向需 ${cost} 点，当前 ${pts} 点`;
        }
        h += `<button class="sp-r ${cls}" data-pick="${id}:${i}" ${cls === 'lock' ? 'disabled' : ''}${lockTip ? ` title="${lockTip}"` : ''}>
          <b>${o.name}${tail}</b><em>${o.desc}</em></button>`;
      });
      h += '</div>';
    }

    /* ---- 变体：三选一，改打法不花点（新 form 通道或旧 variants） ---- */
    const vview = this.skillFormView(id);
    h += `<div class="sp-g"><div class="sp-l">变体<i>三选一 · 改变战斗方式 · 不耗点</i></div>` +
      (vview ? vview.items : []).map(it => {
        const na = (it.pending || []).length > 0;
        const condNo = !na && it.condOk === false;
        const cls = it.on ? 'on' : na || condNo ? 'na' : '';
        let tail = '';
        if (na) tail = `<span class="sp-cost na" title="尚未实现：${it.pending.join(' / ')}">未开放</span>`;
        else if (condNo) {
          const need = it.cond && it.cond.rageMax ? '怒气上限 ' + it.cond.rageMax : '前提不足';
          tail = `<span class="sp-cost na">需 ${need}</span>`;
        } else if (it.on) tail = '<span class="sp-cost on">当前</span>';
        return `<button class="sp-r ${cls}" data-form="${id}:${it.i}" ${na || condNo ? 'disabled' : ''}>
          <b>${['Ⅰ', 'Ⅱ', 'Ⅲ'][it.i]} ${it.name}${tail}</b><em>${it.desc}</em></button>`;
      }).join('') + '</div>';

    /* 底注：只写「现在能做什么」，不写开发计划 */
    const tips = [];
    if (inv < at) {
      tips.push(`投入 ${inv} 级 · 达到 ${at} 级开放精研与取向`
        + (lvBonus ? `（装备提供的 +${lvBonus} 级不计入投入等级）` : ''));
    }
    if (br && br.pick.length && rd && rd.pick.some(x => !x)) tips.push('标注「未开放」的分支尚未实现，当前不可选');
    if (pick >= 0) tips.push('取向可取消，点数全额返还');
    h += `<div class="sp-ft">${tips.join(' · ') || '变体可随时切换，不消耗技能点'}</div></div>`;
    return h;
  },

  /* ---------------- 缩放与平移 ----------------
   * 树比容器大时：滚轮以光标为锚点缩放，按住拖动平移。
   * 事件挂在 document 上做委托 —— 面板每次重画都会换掉 DOM，
   * 直接绑在 .skt-stage 上必然漏绑。 */
  clampZoom(z) {
    return Math.max(0.45, Math.min(2, Math.round((z || 1) * 100) / 100));
  },

  bindTreeNav() {
    if (this._treeNavBound) return;
    this._treeNavBound = true;
    const stageOf = t => (t && t.closest) ? t.closest('#skList .skt-stage') : null;

    /* 说明书卡的变体三行 / 取向两条：委托在文档上、用 #skList 圈定范围。
     * 这张卡会被 selectSkill 反复整体替换（outerHTML），
     * 逐个绑事件的做法一换就失效 —— 见 UI.applyVariantForm 的注释。 */
    document.addEventListener('click', e => {
      const el = (e.target && e.target.closest) ? e.target.closest('#skList .sb-vlist [data-vset]') : null;
      if (!el || el.disabled) return;
      if (this._panMoved) return;
      const parts = el.dataset.vset.split(':');
      if (this.applyVariantForm(parts[0], parseInt(parts[1], 10))) this.renderSkillPanel();
    });

    /* 取向两条：花点数，所以走「草稿 → 确认」，与浮层里的 [data-pick] 同一套逻辑。
     * 点已选中的那条 = 退掉（点数返还）。 PICK-ROW-CLICKABLE */
    document.addEventListener('click', e => {
      const el = (e.target && e.target.closest) ? e.target.closest('#skList .sb-plist [data-pset]') : null;
      if (!el || el.disabled) return;
      if (this._panMoved) return;
      const parts = el.dataset.pset.split(':');
      this.skillPickBranch(parts[0], parseInt(parts[1], 10));
    });

    /* [P2c] 精通层三条：免费、随时可换，所以不需要「草稿 → 确认」。
     * 没到 15 级时按钮是 disabled，走不到这里；万一走到了（老档 / 并发改等级），
     * setSkillMastery 自己会返回原因，照原样 toast 出去，不静默吞掉。 */
    document.addEventListener('click', e => {
      const el = (e.target && e.target.closest) ? e.target.closest('#skList .sb-mlist [data-mset]') : null;
      if (!el || el.disabled) return;
      if (this._panMoved) return;
      const parts = el.dataset.mset.split(':');
      const r = Game.setSkillMastery(parts[0], parseInt(parts[1], 10));
      if (r && r.ok) this.renderSkillPanel();
      else if (r && r.msg) UI.toast(r.msg, 'bad');
    });

    /* 悬停预览 / 离开树回位：委托在 document 上（mouseover 会冒泡）。
     * 不用节点上的 mouseenter —— 每次重画都得重绑一次，漏一处就「时灵时不灵」。
     * 判定：压在节点上 → 预览它；压在树上空白 → 保持现状；
     * 压在树外（右侧卡 / 顶栏 / 技能条）→ 预览作废，回到钉住的那个。 */
    document.addEventListener('mouseover', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      const nd = t.closest('#skList .skt-nd');
      if (nd) {
        const id = nd.dataset.skpick || nd.dataset.sktpas;
        if (id) this.hoverSkill(id);
        return;
      }
      if (t.closest('#skList .skt-stage')) return;
      this.clearHover();
    });

    /* 滚轮缩放：以光标为锚点，缩放后手指底下还是同一处 */
    document.addEventListener('wheel', e => {
      const stage = stageOf(e.target);
      if (!stage) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const old = this.skZoom || 1;
      const next = this.clampZoom(old * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      if (next === old) return;
      /* 内容原点在 pad 处，换算时要减掉，否则放大时会往左上飘 */
      const pad = this.skPad || 0;
      const sx = (stage.scrollLeft + mx - pad) / old;
      const sy = (stage.scrollTop + my - pad) / old;
      this.skZoomAuto = false;
      this.skZoom = next;
      this.applyZoom();
      stage.scrollLeft = pad + sx * next - mx;
      stage.scrollTop = pad + sy * next - my;
    }, { passive: false });

    /* 拖拽：从节点拖 = 把技能放进技能条第几格；从空白拖 = 平移画布。
     * 两者都从 pointerdown 开始，靠起点是不是节点来分流，
     * 移动超过 5px 才当真（否则那是一次点击）。 */
    let pan = null, ndrag = null, sdrag = null, pinch = null;
    /* [PINCH] 触屏双指缩放：按 pointerId 记所有落在树上的手指。
     * 两指落下就切到 pinch 模式（单指平移 / 拖节点全部让位），
     * 抬起一指回到单指状态但不恢复平移 —— 否则松手瞬间画面会跳一下。 */
    const pts = new Map();
    this._skPts = pts;      // 面板重画时清一遍，防止漏掉的 pointerup 把状态卡在「双指」
    const stageRect = st => st.getBoundingClientRect();
    const startPinch = stage => {
      const [a, b] = [...pts.values()];
      if (!a || !b) return;
      const r = stageRect(stage);
      const pad = this.skPad || 0;
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const z0 = this.skZoom || 1;
      pinch = {
        stage, z0,
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        /* 捏合起点「手指中点底下压着的那块内容」的内容坐标，缩放时钉住它 */
        cx: (stage.scrollLeft + mx - pad) / z0,
        cy: (stage.scrollTop + my - pad) / z0
      };
      pan = null;
      if (ndrag && ndrag.el) { ndrag.el.remove(); ndrag = null; }
      if (sdrag && sdrag.el) { sdrag.el.remove(); sdrag = null; }
      clearDrop();
      this._panMoved = true;
      stage.classList.add('panning');
    };
    const dropOf = t => (t && t.closest) ? t.closest('#skList .sb-slot[data-skbar]') : null;
    const clearDrop = () => document.querySelectorAll('#skList .sb-slot.drop').forEach(x => x.classList.remove('drop'));
    const ghostOf = (id, x, y) => {
      const sk = SKILLS[id] || {};
      const g = document.createElement('div');
      g.className = 'sk-ghost';
      g.innerHTML = (typeof skillIconSvg === 'function' ? skillIconSvg(id, 26) : '') + `<b>${sk.name || ''}</b>`;
      g.style.left = (x + 10) + 'px';
      g.style.top = (y + 10) + 'px';
      document.body.appendChild(g);
      return g;
    };

    document.addEventListener('pointerdown', e => {
      if (e.button !== 0) { pan = ndrag = sdrag = null; return; }
      /* [PINCH] 触屏：先记手指。第二根手指落到树上 → 立刻切捏合，
       * 把这一轮的单指平移 / 拖节点全部作废（否则拖出半截 ghost 很难看） */
      if (e.pointerType === 'touch') {
        const st0 = stageOf(e.target);
        if (st0 && !(e.target.closest && e.target.closest('.skt-pop'))) {
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.size >= 2) { startPinch(st0); return; }
        }
      }
      /* 技能条上有东西的格子：拖它换位（空位不拖，留给 click 上技能） */
      const slotEl = dropOf(e.target);
      if (slotEl) {
        const si = parseInt(slotEl.dataset.skbar, 10);
        const sid = Game.skillBar()[si];
        pan = null; ndrag = null;
        sdrag = sid ? { from: si, id: sid, x: e.clientX, y: e.clientY, on: false } : null;
        return;
      }
      /* 树上的主动节点 / 条边上的传世秘技：拖到格子上等于「放上去」 */
      const node = (e.target.closest && e.target.closest('#skList .skt-nd.act, #skList .sb-grant [data-skpick]'));
      if (node && node.dataset.skpick) {
        ndrag = { id: node.dataset.skpick, x: e.clientX, y: e.clientY, on: false };
        pan = null; sdrag = null;
        return;
      }
      const stage = stageOf(e.target);
      if (!stage || (e.target.closest && e.target.closest('.skt-pop'))) { pan = null; return; }
      pan = { stage, x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
    });

    document.addEventListener('pointermove', e => {
      /* [PINCH] 双指缩放：优先于一切单指逻辑 */
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        if (pts.size < 2) return;
        const [a, b] = [...pts.values()];
        if (!a || !b) return;
        const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const next = this.clampZoom(pinch.z0 * (d / pinch.d0));
        const stage = pinch.stage;
        const r = stageRect(stage);
        const pad = this.skPad || 0;
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        if (next !== this.skZoom) {
          this.skZoomAuto = false;
          this.skZoom = next;
          this.applyZoom();
        }
        /* 两指一起平移也算：钉住起点手指中点下的那块内容 */
        stage.scrollLeft = pad + pinch.cx * next - mx;
        stage.scrollTop = pad + pinch.cy * next - my;
        return;
      }
      /* 技能条内换位：ghost 跟着手，底下格子高亮成落点 */
      if (sdrag) {
        if (!sdrag.on && Math.abs(e.clientX - sdrag.x) + Math.abs(e.clientY - sdrag.y) > 5) {
          sdrag.on = true;
          this._panMoved = true;
          sdrag.el = ghostOf(sdrag.id, e.clientX, e.clientY);
        }
        if (sdrag.on) {
          if (sdrag.el) {
            sdrag.el.style.left = (e.clientX + 10) + 'px';
            sdrag.el.style.top = (e.clientY + 10) + 'px';
          }
          /* 落点用坐标反查，不靠 e.target：ghost 在跟手，合成事件也没有真 target */
          const over = dropOf(document.elementFromPoint(e.clientX, e.clientY));
          document.querySelectorAll('#skList .sb-slot.drop').forEach(x => { if (x !== over) x.classList.remove('drop'); });
          if (over && parseInt(over.dataset.skbar, 10) !== sdrag.from) over.classList.add('drop');
        }
        return;
      }
      /* 节点拖动：起 ghost（fixed 定位、不吃指针），并把技能条展开好当靶子 */
      if (ndrag) {
        if (!ndrag.on && Math.abs(e.clientX - ndrag.x) + Math.abs(e.clientY - ndrag.y) > 5) {
          ndrag.on = true;
          this._panMoved = true;
          ndrag.el = ghostOf(ndrag.id, e.clientX, e.clientY);
          const barEl = document.querySelector('#skList .sk-bar');
          if (barEl) barEl.classList.remove('collapsed');
        }
        if (ndrag.on) {
          if (ndrag.el) {
            ndrag.el.style.left = (e.clientX + 10) + 'px';
            ndrag.el.style.top = (e.clientY + 10) + 'px';
          }
          const over = dropOf(document.elementFromPoint(e.clientX, e.clientY));
          document.querySelectorAll('#skList .sb-slot.drop').forEach(x => { if (x !== over) x.classList.remove('drop'); });
          if (over) over.classList.add('drop');
        }
        return;
      }
      if (!pan) return;
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        pan.moved = true;
        this._panMoved = true;
        pan.stage.classList.add('panning');
      }
      if (pan.moved) {
        pan.stage.scrollLeft = pan.sl - dx;
        pan.stage.scrollTop = pan.st - dy;
      }
    });

    const end = e => {
      /* [PINCH] 收手指：剩不到两指就结束捏合，并吃掉这一轮的点击 */
      if (pts.has(e.pointerId)) pts.delete(e.pointerId);
      if (pinch && pts.size < 2) {
        pinch.stage.classList.remove('panning');
        pinch = null;
        pan = null;
        setTimeout(() => { this._panMoved = false; }, 40);
        return;
      }
      /* 技能条内换位：落到别的格子上就交换，落到原格 / 外面就取消 */
      if (sdrag) {
        const d = sdrag;
        sdrag = null;
        if (d.on) {
          if (d.el) d.el.remove();
          const cell = dropOf(document.elementFromPoint(e.clientX, e.clientY));
          const to = cell ? parseInt(cell.dataset.skbar, 10) : -1;
          clearDrop();
          if (to >= 0 && to !== d.from) {
            const other = Game.skillBar()[to];
            const r = Game.assignSkillBar(to, d.id);
            if (r.ok && other) Game.assignSkillBar(d.from, other);   // 对方回填原格 = 交换
            this.skBarOpen = true;
            if (r.ok) {
              SFX.ui();
              this.toast(other ? `第 ${d.from + 1} 格 ⇄ 第 ${to + 1} 格` : `移到第 ${to + 1} 格`);
            } else this.toast(r.msg, 'bad');
            this.renderSkillPanel();
          }
          setTimeout(() => { this._panMoved = false; }, 40);
        }
        return;
      }
      /* 松手落在哪个格子上，就把技能放进哪一格 */
      if (ndrag) {
        const dragged = ndrag;
        ndrag = null;
        if (dragged.on) {
          if (dragged.el) dragged.el.remove();
          const cell = dropOf(document.elementFromPoint(e.clientX, e.clientY));
          clearDrop();
          if (cell) {
            const i = parseInt(cell.dataset.skbar, 10);
            const r = Game.assignSkillBar(i, dragged.id);
            this.skBarOpen = true;
            if (r.ok) { SFX.ui(); this.toast(r.msg); } else this.toast(r.msg, 'bad');
            this.renderSkillPanel();
          } else {
            /* 没落在格子上：条就保持展开（用户显然是想配，只是没放准） */
            this.skBarOpen = true;
            this.renderSkillPanel();
          }
          setTimeout(() => { this._panMoved = false; }, 40);
        }
        return;
      }
      if (!pan) return;
      if (pan.moved) pan.stage.classList.remove('panning');
      const moved = pan.moved;
      pan = null;
      if (moved) setTimeout(() => { this._panMoved = false; }, 40);
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  },

  /* 把当前 skZoom 写到 plate / fit / 百分比标签上。
   * 内容四周留 pad 的空白（skPad）：树拖到边还能再拉出去一截，
   * 不然「顶到边就拖不动」会让人觉得画布是死的。 */
  applyZoom(recenter) {
    const stage = document.querySelector('#skList .skt-stage');
    const plate = document.querySelector('#skList .skt-plate');
    const fit = document.querySelector('#skList .skt-fit');
    if (!plate || !fit) return;
    const W = parseFloat(plate.dataset.w) || 0;
    const H = parseFloat(plate.dataset.h) || 0;
    const z = this.clampZoom(this.skZoom || 1);
    const pad = this.skPad || 0;
    plate.style.transform = 'scale(' + z + ')';
    plate.style.left = pad + 'px';
    plate.style.top = pad + 'px';
    fit.style.width = Math.round(W * z + pad * 2) + 'px';
    fit.style.height = Math.round(H * z + pad * 2) + 'px';
    const lab = document.querySelector('#skList .skt-z');
    if (lab) lab.textContent = Math.round(z * 100) + '%';
    /* 重排后回到「内容居中、四周都是空白」的起始视角 */
    if (recenter && stage) {
      const cx = (W * z + pad * 2 - stage.clientWidth) / 2;
      const cy = (H * z + pad * 2 - stage.clientHeight) / 2;
      stage.scrollLeft = Math.max(0, cx);
      stage.scrollTop = Math.max(0, cy);
    }
  },

  /* 自适应：面板现在是独立的整屏层，宽高都够就该 100% 显示整棵树；
   * 塞不下才缩（宽、高取更紧的那一边）。用户手动缩放过就不再插手。 */
  fitSkillTree() {
    this.bindTreeNav();
    const stage = document.querySelector('#skList .skt-stage');
    const plate = document.querySelector('#skList .skt-plate');
    if (!stage || !plate) return;
    const W = parseFloat(plate.dataset.w) || 0;
    const H = parseFloat(plate.dataset.h) || 0;
    if (!W || !H) return;
    if (this.skZoomAuto) {
      const haveW = stage.clientWidth - 12;
      const haveH = stage.clientHeight - 12;
      const mob = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
      let z = 1;
      if (mob) {
        /* 手机上不为了「一屏塞下」把字缩没：最小 70%。
         * 宽高都要顾 —— 这棵树是竖着长的，只按宽度算会放大过头，
         * 一屏只剩两个节点（玩家的实际反馈），所以把高度也压进来。 */
        const zw = haveW > 40 ? haveW / W : 1;
        const zh = haveH > 40 ? haveH / H : 1;
        z = Math.max(0.7, Math.min(zw, zh));
      } else {
        /* 桌面：宽高都塞得下就放大到铺满（上限 1.2），整棵树始终完整可见 */
        z = Math.min(1.2, haveW / W, haveH / H);
      }
      this.skZoom = this.clampZoom(Math.floor(z * 100) / 100);
    }
    /* 可拖拽余量：按视口短边的一半算，四周都能拉出半屏空白；
     * 触屏上不铺这么宽（否则上下滚很久才见到树） */
    const mob2 = (typeof IS_TOUCH !== 'undefined' && IS_TOUCH) || window.innerWidth < 780;
    const base = Math.min(stage.clientWidth || 900, stage.clientHeight || 700);
    this.skPad = mob2 ? Math.round(Math.max(40, base * 0.12)) : Math.round(Math.max(120, base * 0.5));
    this.applyZoom(true);
  },

  /* 加点 / 退点：走草稿，确认才落库。
   * 走完要整块重画 —— 节点上的等级、点数、未确认条都得跟着变。 */
  skillStep(sid, up) {
    const had = this.snapDirty('skill');
    this.snapTake('skill');
    const r = up ? Game.levelUpSkill(sid) : Game.levelDownSkill(sid);
    if (!r.ok) {
      if (!had && this.snaps) delete this.snaps.skill;
      this.toast(r.msg);
      return;
    }
    SFX.ui();
    this.renderSkillPanel();
  },
});
