/* ============================================================
 * 移动端层：虚拟摇杆 / 技能轮盘 / 触屏相机 / 触屏交互
 * 仅在「触摸设备 + 小屏」时初始化；PC 上不创建任何节点，
 * 走原来的键鼠逻辑，互不影响。
 * ============================================================ */

/* [FIX-MOBILE-LANDSCAPE] 移动端判定曾经在 iPhone 横屏下失败，整页退回 PC 布局。
 * 原因是三重条件全都要满足，其中两个在真机上会骗人：
 *   · `matchMedia('(pointer: coarse)')` —— iOS 横屏、微信内置浏览器、
 *     以及开了「请求桌面网站」的 Safari 都可能把它报成 fine；
 *   · `innerWidth/innerHeight` —— 转屏瞬间是过渡值，拿它算短边不可靠。
 * 现在改成：手机 UA + 有触摸点 → 直接认定移动端，不再看 pointer 媒体查询；
 * 其余设备退回原来的「触摸 + 粗指针 + 短边」三重判定。
 * 另外支持 `?mobile=1` / `?mobile=0` 手动强制，方便出问题时自救。 */
const _ua = (() => { try { return navigator.userAgent || ''; } catch (e) { return ''; } })();
const _touchCap = (() => {
  try {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || ('onmsgesturechange' in window);
  } catch (e) { return false; }
})();
/* 手机（不是平板 / 桌面）UA：这些设备一定有触屏，直接按移动端处理 */
const _uaPhone = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini|HarmonyOS.*Mobile/i.test(_ua)
  || (() => { try { return !!(navigator.userAgentData && navigator.userAgentData.mobile); } catch (e) { return false; } })();
/* iPad / 安卓平板：屏幕短边 > 1024 的按 PC，否则也走移动端 */
const _uaTablet = /iPad|Android(?!.*Mobile)/i.test(_ua);

const IS_TOUCH = (() => {
  try {
    const q = location.search || '';
    if (/[?&]mobile=1/.test(q)) return true;
    if (/[?&]mobile=0/.test(q)) return false;
    if (!_touchCap) return false;
    if (_uaPhone) return true;
    /* 短边取 screen 而不是 innerWidth：转屏时 innerWidth/innerHeight 会互换，
     * screen 的短边才是设备物理短边 */
    const sw = screen.width || 9999, sh = screen.height || 9999;
    const shortSide = Math.min(sw, sh);
    if (_uaTablet) return shortSide <= 1024;
    const coarse = window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
      || window.matchMedia('(any-pointer: coarse)').matches;
    return coarse && shortSide <= 1024;
  } catch (e) { return false; }
})();

const Mobile = {
  on: IS_TOUCH,
  u: 1,                 // 缩放基准
  mx: 0, my: 0, mag: 0, // 摇杆输出（屏幕空间，y 向下为正）
  joyId: null,
  joyC: { x: 0, y: 0 },
  joyR: 0,
  lastTap: 0,
  camPts: new Map(),
  pinchDist: 0,
  el: null,

  init() {
    if (!this.on) return;
    document.body.classList.add('touch');
    this.build();
    this.layout();
    this.bindJoy();
    this.bindButtons();
    this.bindCamera();
    /* resize 在真机上会连着触发好几次（地址栏收放、转屏、软键盘），
     * 以前每次都立刻重排，很容易排在一个「过渡态」上——最坏的情况是按横屏宽度
     * 去排竖屏：摇杆被推到屏幕外（看起来就是「摇杆神秘消失」），
     * 右侧按钮又跟着 u 一起放大（看起来就是「菜单莫名变大」）。
     * 所以统一去抖，等尺寸稳定下来再排。 */
    window.addEventListener('resize', () => this.queueLayout());
    window.addEventListener('orientationchange', () => {
      this.queueLayout(220);
      setTimeout(() => this.layout(), 700);   // 有些机型 220ms 时还没转完
    });
    if (window.visualViewport) {
      // 页面被放大 / 软键盘顶起时，只有 visualViewport 会变，innerHeight 不变
      window.visualViewport.addEventListener('resize', () => this.queueLayout(60));
      window.visualViewport.addEventListener('scroll', () => this.queueLayout(60));
    }
    /* [FIX-BUG2] iOS Safari 从 10 起直接无视 user-scalable=no，捏合照样能把整页放大；
     * 放大后 position:fixed 的 HUD 会被推出可视区。
     * 除了 gesture 事件，还需要阻止 touchstart 上的多指默认行为，
     * 因为 Safari 某些版本的双指手势不经过 gesture 事件。
     * 同时阻止 dblclick 和 touchend 上的双击缩放。 */
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
      document.addEventListener(t, e => e.preventDefault(), { passive: false }));
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
    /* [FIX-BUG2] 额外阻止 Safari 的双指缩放：
     * Safari 某些版本在 touchstart 时就已经决定了是否缩放，
     * 如果只在 gesture 事件阻止就来不及。
     * 对 touches.length >= 2 的 touchstart 调用 preventDefault。 */
    document.addEventListener('touchstart', e => {
      if (e.touches.length >= 2) e.preventDefault();
    }, { passive: false });
    /* [FIX-BUG2] 阻止 Safari 的双击缩放（touchend 后 300ms 内的再次 touchstart） */
    let lastTouchEnd = 0;
    document.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    /* [FIX-BUG2] 阻止整页滚动/橡皮筋效果，iPhone Safari 上
     * 触摸时页面被拖动会导致 visualViewport 偏移、摇杆跑位 */
    document.addEventListener('touchmove', e => {
      if (e.touches.length >= 1) e.preventDefault();
    }, { passive: false });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetJoy();
      else this.queueLayout(120);   // 切回来可能已经转过屏 / 换过尺寸
    });
    /* [FIX-BUG2] 触控层强制保持可见：Safari 地址栏变化时
     * 有时会短暂移除 body.touch class，导致 #mtouch display:none。
     * 用 MutationObserver 监控 body class 变化，确保 touch 始终在。 */
    try {
      this._bodyObs = new MutationObserver(() => {
        if (this.on && !document.body.classList.contains('touch')) {
          document.body.classList.add('touch');
          this.queueLayout(60);
        }
      });
      this._bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { }
    const tipEl = document.getElementById('startTips');
    if (tipEl) tipEl.innerHTML = '<b>左摇杆</b> 移动 · <b>右侧按钮</b> 普攻与技能 · <b>拖动画面</b> 转视角<br>'
      + '双击摇杆翻滚 · 拾取装备可穿戴，纸娃娃实时变化';
    setTimeout(() => UI.toast('摇杆移动 · 按钮攻击 · 拖动转视角'), 2200);
  },

  /* 去抖重排：连续 resize 只排最后一次，避免排到中间态 */
  queueLayout(delay) {
    if (this._lt) clearTimeout(this._lt);
    this._lt = setTimeout(() => { this._lt = null; this.layout(); }, delay === undefined ? 120 : delay);
  },

  /* ---------------- DOM ---------------- */
  build() {
    const d = document.createElement('div');
    d.id = 'mtouch';
    d.innerHTML = `
      <div id="mJoy"><div class="ring"></div><div class="knob"></div></div>
      <div id="mSkills"></div>
      <div id="mAtk" class="mbtn atk"><span class="mi">攻</span></div>
      <div id="mUtil">
        <div class="mbtn sm set" id="mBarSet" title="切换快捷栏"><span class="mi"></span><i class="idx">1/2</i></div>
        <div class="mbtn sm" id="mUse"><span class="mi">交</span></div>
        <div class="mbtn sm" id="mDash"><span class="mi">闪</span></div>
        <div class="mbtn sm pot" data-potion="hp"><span class="mi">丹</span><i class="cnt">0</i></div>
        <div class="mbtn sm pot blue" data-potion="mp"><span class="mi">露</span><i class="cnt">0</i></div>
      </div>`;
    document.body.appendChild(d);
    this.el = d;
  },

  buildSkills() {
    if (!this.on || !Game.state) return;
    const wrap = document.getElementById('mSkills');
    if (!wrap) return;
    /* [S4] 技能条 8 格手动配置：宫格与 PC 动作条一致，空位是占位 */
    const slots = Game.skillBar();
    wrap.innerHTML = slots.map((id, i) => {
      if (!id) return `<div class="mskill empty" data-slot="${i}"><span class="g">＋</span></div>`;
      /* [M1] 与 PC 技能条一致：变体角标 Ⅰ/Ⅱ/Ⅲ */
      const vv = Game.skillVariant(id);
      const vb = `<span class="vb" style="${vv > 0 ? '' : 'display:none'}">${['Ⅰ', 'Ⅱ', 'Ⅲ'][vv] || ''}</span>`;
      return `<div class="mskill" data-skill="${id}">${vb}<span class="g">${skillIconSvg(id, 22)}</span><div class="cd"></div></div>`;
    }).join('');
    wrap.querySelectorAll('.mskill[data-skill]').forEach(el => {
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        SFX.init();
        Game.castSkill(el.dataset.skill);
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), 130);
      });
    });
    /* 空位：打开术法面板去配置 */
    wrap.querySelectorAll('.mskill.empty').forEach(el => {
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        SFX.init();
        if (typeof UI !== 'undefined' && UI.openSkill) UI.openSkill();
      });
    });
    /* [M1] 手机上也要能换栏：PC 是 Shift，触屏没有 Shift，给一枚小按钮。
     * [v1.8.3] 图标（剑 = 输出栏 / 盾 = 防守栏）+ 右下角「1 / 2」套数。
     * 只放图标会被当成攻击键，只放数字又看不出「有两套」，两个一起才说得清。 */
    const setBtn = document.getElementById('mBarSet');
    if (setBtn) {
      const si = Game.barSet();
      const mi = setBtn.querySelector('.mi');
      if (mi) mi.innerHTML = barSetIcon(si, 18);
      const idx = setBtn.querySelector('.idx');
      if (idx) idx.textContent = (si + 1) + '/' + SKILL_BAR_SETS;
      const label = '切换快捷栏（当前第 ' + (si + 1) + ' 套 · ' + (si === 0 ? '输出栏' : '防守栏') + '）';
      setBtn.title = label;
      setBtn.setAttribute('aria-label', label);
      if (!setBtn._bound) {
        setBtn._bound = true;
        setBtn.addEventListener('pointerdown', ev => {
          ev.preventDefault(); ev.stopPropagation();
          SFX.init();
          Game.switchBarSet();
          this.buildSkills();
        });
      }
    }
    this.layout();
  },

  /* ---------------- 布局 ---------------- */
  layout() {
    if (!this.on) return;

    /* [FIX-BUG2] 尺寸优先级：visualViewport > innerWidth/innerHeight。
     * 两个都是真机会骗人的地方：
     *  · 页面被放大（iOS 输入框聚焦会自动放大）时 innerWidth 还是 390，
     *    但真正看得见的只有 260 宽；
     *  · 转屏/收放地址栏的中间态，innerWidth 可能已经报成横屏宽度，高度还是竖屏的。
     * visualViewport 反映的是「此刻真正看得见的区域」，以它为准最稳。
     * [FIX] 额外检查 scale：如果页面被意外缩放（scale > 1.05），
     * 强制重置到 scale=1，否则 position:fixed 元素会偏移。 */
    const vv = window.visualViewport;
    const vvOk = !!(vv && vv.width > 120 && vv.height > 120);
    let W = Math.round((vvOk ? vv.width : 0) || window.innerWidth || 0);
    let H = Math.round((vvOk ? vv.height : 0) || window.innerHeight || 0);
    if (W < 120 || H < 120) return;          // 转屏/收放地址栏途中的 0 或极小值，直接不理

    /* [FIX-BUG2] 如果页面被缩放（Safari 上可能发生），尝试恢复 */
    if (vv && vv.scale > 1.05) {
      try {
        /* 通过设置 meta viewport 来尝试恢复缩放 */
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          /* 重新设置 viewport 可以在部分 Safari 版本上重置缩放 */
          meta.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
        }
        /* 用 visualViewport.scrollTo 回到原点 */
        if (vv.scrollTo) {
          vv.scrollTo(0, 0);
        }
      } catch (e) { }
      /* 缩放状态下用 innerWidth/innerHeight 更可靠 */
      W = Math.round(window.innerWidth || W);
      H = Math.round(window.innerHeight || H);
    }

    this.vp = { w: W, h: H, zoomed: !!(vv && vv.scale > 1.02) };

    /* 把「此刻真正看得见的区域」写成 CSS 变量给面板用。
     * iOS Safari 的 100vh 含地址栏那一条，面板按 vh 居中会整体偏下、底部被裁；
     * 用 visualViewport 的实时高度 + 偏移量，横竖屏切换 / 地址栏收放都能跟上。 */
    try {
      const de = document.documentElement.style;
      de.setProperty('--app-h', H + 'px');
      de.setProperty('--app-oy', ((vv ? vv.offsetTop : 0) || 0) + 'px');
      de.setProperty('--app-ox', ((vv ? vv.offsetLeft : 0) || 0) + 'px');
    } catch (e) { }

    // 自愈：ui-open 卡住会让整个触控层透明（看起来就是「摇杆不见了」）
    try {
      const dlg = document.getElementById('dialog');
      if (document.body.classList.contains('ui-open')
        && !document.querySelector('.panel.open')
        && !(dlg && dlg.style.display === 'block')) {
        document.body.classList.remove('ui-open');
      }
      if (!document.body.classList.contains('touch')) document.body.classList.add('touch');
    } catch (e) { }

    /* [FIX-BUG2] 触控层对齐到「当前可见的区域」。
     * 在 iPhone Safari 上，地址栏变化时 visualViewport.offsetTop 会跳动，
     * 导致触控层跟着跳动。用 requestAnimationFrame 在下一帧再次校正位置。 */
    if (this.el) {
      const ox = vv ? (vv.offsetLeft || 0) : 0;
      const oy = vv ? (vv.offsetTop || 0) : 0;
      this.off = { x: ox, y: oy };
      this.el.style.left = ox + 'px';
      this.el.style.top = oy + 'px';
      this.el.style.width = W + 'px';
      this.el.style.height = H + 'px';
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
      /* [FIX-BUG2] 确保 #mtouch 始终可见，不被推出屏幕 */
      this.el.style.display = 'block';
      this.el.style.opacity = '1';
      this.el.style.pointerEvents = 'none';  /* 容器不拦截，子元素各自 pointer-events:auto */
    }

    const portrait = H > W;
    // 竖屏屏幕窄、底部还要留安全区，按钮比例调大一档、留白加宽
    let u = CLAMP(Math.min(W, H) / (portrait ? 410 : 430), 0.7, 1.6);
    // 比例突变（>25%）几乎一定是尺寸还没稳定，沿用上一次的值，别让按钮忽然变大
    if (this.u && Math.abs(u - this.u) > this.u * 0.25) u = this.u;
    this.u = u;

    const ins = safeInsets();
    const pad = (portrait ? 18 : 14) * u;

    const atkR = 45 * u, skS = 48 * u, smS = 38 * u, joyR = 60 * u;
    const gap = 6 * u;
    // 兜底夹紧：不管算出来什么，都不许跑到屏幕外
    const fx = (x, w) => Math.min(Math.max(x, ins.l + 4), Math.max(ins.l + 4, W - ins.r - 4 - w));
    const fy = (y, h) => Math.min(Math.max(y, ins.t + 4), Math.max(ins.t + 4, H - ins.b - 4 - h));

    const ax = fx(W - ins.r - pad - atkR * 2, atkR * 2) + atkR;
    const ay = fy(H - ins.b - pad - atkR * 2, atkR * 2) + atkR;
    this.joyR = joyR;

    // 摇杆
    const jx = fx(ins.l + pad, joyR * 2) + joyR;
    const jy = fy(H - ins.b - pad - joyR * 2, joyR * 2) + joyR;
    this.joyC = { x: jx, y: jy };
    const joy = document.getElementById('mJoy');
    if (joy) {
      joy.style.width = joy.style.height = joyR * 2 + 'px';
      joy.style.left = jx - joyR + 'px';
      joy.style.top = jy - joyR + 'px';
      const knob = joy.querySelector('.knob');
      const kr = joyR * 0.5;
      knob.style.width = knob.style.height = kr * 2 + 'px';
      knob.style.left = joyR - kr + 'px';
      knob.style.top = joyR - kr + 'px';
    }

    // 普攻
    const atk = document.getElementById('mAtk');
    if (atk) {
      atk.style.width = atk.style.height = atkR * 2 + 'px';
      atk.style.left = ax - atkR + 'px';
      atk.style.top = ay - atkR + 'px';
      atk.style.fontSize = 17 * u + 'px';
    }

    // 技能：4 列 × 2 行宫格（8 格），紧贴普攻左上
    /* ---- 右手区：普攻 → 功能键 → 技能宫格 ----
     * 以前宫格是「贴底右对齐」直接摆的：窄屏上它的左缘会压到摇杆上
     * （390×844 实测重叠 46×46 像素，320 宽更糟），功能键那一行也会压到摇杆顶部。
     * 现在改成先算三块矩形，再按「谁碰到摇杆就整块抬到摇杆上方」排，
     * 列数随格数自动变（≤5 格一行排完，6 格 3×2，8 格 4×2），
     * 竖屏塞不下时先把格子缩到 34u，再不行才上移。 */
    const slots = Math.max(1, SKILL_BAR_SLOTS | 0);
    const cols = slots <= 5 ? slots : (slots <= 6 ? 3 : 4);
    const rows = Math.ceil(slots / cols);
    let cell = skS;
    const gRight = ax - atkR - 9 * u;
    const topLimit = ins.t + 46 * u;            // 顶部 HUD（角色板 / 首领条）预留
    const gwOf = c => cols * c + (cols - 1) * gap;
    const ghOf = c => rows * c + (rows - 1) * gap;
    /* 竖屏高度吃紧：整摞（宫格 + 功能行 + 普攻）装不下就缩格子。
     * 下限取「36px 与 34u 中的较大者」—— 跟着 u 一路缩到 24px 会按不准。 */
    if (portrait) {
      const cellMin = Math.max(36, 34 * u);
      let guard = 0;
      while (ay + atkR - (ghOf(cell) + 9 * u + smS + 8 * u) < topLimit && cell > cellMin && guard++ < 8) {
        cell -= 2 * u;
      }
    }
    const gw = gwOf(cell), gh = ghOf(cell);
    const gLeft0 = fx(gRight - gw, gw);
    const uGap = 8 * u;
    const util = document.querySelectorAll('#mUtil .mbtn');
    const uw = util.length * smS + (util.length - 1) * uGap;
    const uLeft0 = fx(gRight - uw, smS);

    /* 兜底：谁和摇杆的方框相交，就整块抬到摇杆上沿之上（横屏一般不会触发）。
     * 顺序很重要：功能行先定死，宫格再按「功能行的最终位置」往上叠 ——
     * 反过来做的话，功能行被抬高之后会撞进按旧位置算好的宫格里。 */
    const joyL = jx - joyR, joyRr = jx + joyR, joyT = jy - joyR, joyB = jy + joyR;
    const hitJoy = (l, t, w, h) => (l < joyRr + gap) && (t < joyB) && (l + w > joyL) && (t + h > joyT);
    let uy, gTop;
    if (portrait) {
      /* 竖屏：自下而上堆 —— 普攻在最下，功能行压在它上面，宫格再压在功能行上面 */
      uy = fy(ay - atkR - 8 * u - smS, smS);
      if (hitJoy(uLeft0, uy, uw, smS)) uy = fy(joyT - gap - smS, smS);
      gTop = fy(uy - 9 * u - gh, gh);
      if (hitJoy(gLeft0, gTop, gw, gh)) gTop = fy(joyT - gap - gh, gh);
    } else {
      /* 横屏：宽度够，宫格留在普攻左侧的底边，功能行压在宫格上面（原版排布） */
      gTop = fy(ay + atkR - gh, gh);
      if (hitJoy(gLeft0, gTop, gw, gh)) gTop = fy(joyT - gap - gh, gh);
      uy = fy(gTop - 9 * u - smS, smS);
      if (hitJoy(uLeft0, uy, uw, smS)) uy = fy(joyT - gap - smS, smS);
    }

    const gLeft = gLeft0;
    document.querySelectorAll('#mSkills .mskill').forEach((el, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      el.style.width = el.style.height = cell + 'px';
      el.style.left = fx(gLeft + c * (cell + gap), cell) + 'px';
      el.style.top = fy(gTop + r * (cell + gap), cell) + 'px';
      el.style.fontSize = (cell * 0.31) + 'px';
    });

    // 功能键：一行，右对齐（位置见上面 gTop / uy 的排布）
    util.forEach((el, i) => {
      el.style.width = el.style.height = smS + 'px';
      el.style.left = fx(uLeft0 + i * (smS + uGap), smS) + 'px';
      el.style.top = uy + 'px';
      el.style.fontSize = 13 * u + 'px';
    });

    /* 增益 / 减益栏：宫格上方，跟着 HUD 一起缩放 */
    const bb = document.getElementById('buffbar');
    if (bb) {
      bb.style.left = '50%';
      bb.style.top = Math.max(ins.t + 4, gTop - 26 * u) + 'px';
      bb.style.bottom = 'auto';
      bb.style.transform = 'translateX(-50%)';
      bb.style.maxWidth = Math.min(W - 20, 360 * u) + 'px';
    }
  },

  /* ---------------- 摇杆 ---------------- */
  bindJoy() {
    const joy = document.getElementById('mJoy');
    const knob = joy.querySelector('.knob');

    const move = (x, y) => {
      // 触控层可能被平移过（页面放大时对齐到可视区），clientX 是布局坐标，要减去这个偏移
      const ox = this.off ? this.off.x : 0, oy = this.off ? this.off.y : 0;
      let dx = x - ox - this.joyC.x, dy = y - oy - this.joyC.y;
      const max = this.joyR * 0.82;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.mx = dx / max;
      this.my = dy / max;
      this.mag = Math.min(1, Math.hypot(this.mx, this.my));
    };

    joy.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (this.joyId !== null) return;
      // 双击摇杆 = 翻滚
      const now = performance.now();
      if (now - this.lastTap < 320) Game.tryDash();
      this.lastTap = now;
      this.joyId = e.pointerId;
      try { joy.setPointerCapture(e.pointerId); } catch (err) { }
      joy.classList.add('active');
      move(e.clientX, e.clientY);
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    });
    const end = e => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      joy.classList.remove('active');
      knob.style.transform = 'translate(0,0)';
      this.mx = this.my = this.mag = 0;
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
    joy.addEventListener('lostpointercapture', end);
  },

  resetJoy() {
    this.joyId = null;
    this.mx = this.my = this.mag = 0;
    const knob = document.querySelector('#mJoy .knob');
    if (knob) knob.style.transform = 'translate(0,0)';
    const joy = document.getElementById('mJoy');
    if (joy) joy.classList.remove('active');
    Game.mouseDown = false;
  },

  /* ---------------- 按钮 ---------------- */
  bindButtons() {
    const atk = document.getElementById('mAtk');
    const press = (el, down, up) => {
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (err) { }
        el.classList.add('press');
        SFX.init();
        down && down();
      });
      const rel = e => {
        e.preventDefault();
        el.classList.remove('press');
        up && up();
      };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
      el.addEventListener('lostpointercapture', rel);
    };

    press(atk, () => { Game.mouseDown = true; }, () => { Game.mouseDown = false; });
    press(document.getElementById('mDash'), () => Game.tryDash());
    press(document.getElementById('mUse'), () => Game.interact());
    document.querySelectorAll('#mUtil .pot').forEach(el => {
      press(el, () => Game.usePotion(el.dataset.potion));
    });
  },

  /* ---------------- 触屏相机：单指拖动转视角，双指捏合缩放 ---------------- */
  bindCamera() {
    const cv = document.getElementById('gl');
    const pts = this.camPts;

    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) this.pinchDist = this.pinch();
    });

    /* [FIX-BUG2] 改为 passive: false 以便在需要时阻止默认行为，
     * 防止 Safari 上拖动画面时触发页面滚动/地址栏收起 */
    window.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x;
        Game.camYaw -= dx * 0.0042;
        /* [FIX-BUG2] 阻止默认行为，防止页面跟着滚动 */
        e.preventDefault();
      }
      p.x = e.clientX; p.y = e.clientY;

      if (pts.size === 2) {
        const d = this.pinch();
        if (this.pinchDist > 0 && d > 0) {
          /* 双指捏合改「倍率」而不是绝对距离：换视角预设后仍按该机位比例缩放 */
          Game.camZoom = CLAMP((Game.camZoom || 1) * (this.pinchDist / d), 0.7, 2.4);
        }
        this.pinchDist = d;
        e.preventDefault();
      }
    }, { passive: false });

    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) this.pinchDist = 0;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },

  pinch() {
    const it = [...this.camPts.values()];
    if (it.length < 2) return 0;
    return Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
  },

  /* ---------------- HUD 同步 ---------------- */
  syncHud() {
    if (!this.on || !Game.state) return;
    const s = Game.state;
    const hp = document.querySelector('#mUtil .pot[data-potion="hp"] .cnt');
    const mp = document.querySelector('#mUtil .pot[data-potion="mp"] .cnt');
    if (hp) hp.textContent = s.potions.hp;
    if (mp) mp.textContent = s.potions.mp;
    const use = document.getElementById('mUse');
    if (use) use.classList.toggle('on', !!Game.interactTarget);
  }
};

function safeInsets() {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  const r = {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0
  };
  d.remove();
  return r;
}
