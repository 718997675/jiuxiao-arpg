/* ============================================================
 * 移动端层：虚拟摇杆 / 技能轮盘 / 触屏相机 / 触屏交互
 * 仅在「触摸设备 + 小屏」时初始化；PC 上不创建任何节点，
 * 走原来的键鼠逻辑，互不影响。
 * ============================================================ */

const IS_TOUCH = (() => {
  try {
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const coarse = window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) <= 1024;
    return touch && coarse && small;
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
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 260));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetJoy();
    });
    const tipEl = document.getElementById('startTips');
    if (tipEl) tipEl.innerHTML = '<b>左摇杆</b> 移动 · <b>右侧按钮</b> 普攻与技能 · <b>拖动画面</b> 转视角<br>'
      + '双击摇杆翻滚 · 拾取装备可穿戴，纸娃娃实时变化';
    setTimeout(() => UI.toast('摇杆移动 · 按钮攻击 · 拖动转视角'), 2200);
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
    wrap.innerHTML = SKILL_ORDER[Game.state.cls].map(id => {
      const sk = SKILLS[id];
      return `<div class="mskill" data-skill="${id}"><span class="g">${sk.glyph}</span><div class="cd"></div></div>`;
    }).join('');
    wrap.querySelectorAll('.mskill').forEach(el => {
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        SFX.init();
        Game.castSkill(el.dataset.skill);
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), 130);
      });
    });
    this.layout();
  },

  /* ---------------- 布局 ---------------- */
  layout() {
    if (!this.on) return;
    const W = window.innerWidth, H = window.innerHeight;
    const portrait = H > W;
    // 竖屏屏幕窄、底部还要留安全区，按钮比例调大一档、留白加宽
    const u = this.u = CLAMP(Math.min(W, H) / (portrait ? 410 : 430), 0.7, 1.6);
    const ins = safeInsets();
    const pad = (portrait ? 18 : 14) * u;

    const atkR = 45 * u, skS = 48 * u, smS = 38 * u, joyR = 60 * u;
    const gap = 6 * u;
    const ax = W - ins.r - pad - atkR;
    const ay = H - ins.b - pad - atkR;
    this.joyR = joyR;

    // 摇杆
    const jx = ins.l + pad + joyR, jy = H - ins.b - pad - joyR;
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

    // 技能：3 列 × 2 行宫格，紧贴普攻左上
    const cols = 3;
    const gw = cols * skS + (cols - 1) * gap;
    const gRight = ax - atkR - 9 * u;
    const gBottom = ay + atkR;
    const gLeft = gRight - gw;
    const gTop = gBottom - (2 * skS + gap);
    document.querySelectorAll('#mSkills .mskill').forEach((el, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      el.style.width = el.style.height = skS + 'px';
      el.style.left = gLeft + c * (skS + gap) + 'px';
      el.style.top = gTop + r * (skS + gap) + 'px';
      el.style.fontSize = 15 * u + 'px';
    });

    // 功能键：技能格上方一行，右对齐
    const util = document.querySelectorAll('#mUtil .mbtn');
    const uGap = 8 * u;
    const uw = util.length * smS + (util.length - 1) * uGap;
    const uRight = gRight;
    const uy = gTop - 9 * u - smS;
    util.forEach((el, i) => {
      const x = uRight - uw + i * (smS + uGap);
      el.style.width = el.style.height = smS + 'px';
      el.style.left = x + 'px';
      el.style.top = uy + 'px';
      el.style.fontSize = 13 * u + 'px';
    });
  },

  /* ---------------- 摇杆 ---------------- */
  bindJoy() {
    const joy = document.getElementById('mJoy');
    const knob = joy.querySelector('.knob');

    const move = (x, y) => {
      let dx = x - this.joyC.x, dy = y - this.joyC.y;
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

    window.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x;
        Game.camYaw -= dx * 0.0042;
      }
      p.x = e.clientX; p.y = e.clientY;

      if (pts.size === 2) {
        const d = this.pinch();
        if (this.pinchDist > 0 && d > 0) {
          Game.camDist = CLAMP(Game.camDist * (this.pinchDist / d), 11.6, 32);
          Game.camHeight = 12.2 + (Game.camDist - 11.6) * 0.42;
        }
        this.pinchDist = d;
      }
    }, { passive: true });

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
