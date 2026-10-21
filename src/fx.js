/* ============================================================
 * 表现层：粒子 / 投射物 / 地面预警 / 伤害数字 / 屏幕震动 / 合成音效
 * ============================================================ */

const SFX = {
  ctx: null, on: true, master: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.0;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.on = false; }
  },
  tone(freq, dur, type = 'sine', gain = 0.2, slideTo) {
    if (!this.on) return; this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur = 0.15, gain = 0.2, freq = 1200, q = 1) {
    if (!this.on) return; this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur);
  },
  swing() { this.noise(0.13, 0.16, 2600, 1.6); this.tone(420, 0.09, 'triangle', 0.05, 180); },
  hit() { this.noise(0.1, 0.26, 700, 0.9); this.tone(120, 0.12, 'square', 0.12, 60); },
  crit() { this.noise(0.16, 0.32, 900, 0.7); this.tone(220, 0.16, 'sawtooth', 0.13, 60); this.tone(880, 0.12, 'triangle', 0.08, 300); },
  cast() { this.tone(520, 0.28, 'sine', 0.09, 880); this.noise(0.2, 0.05, 3000, 2); },
  fire() { this.noise(0.25, 0.14, 500, 0.6); this.tone(180, 0.3, 'sawtooth', 0.08, 70); },
  ice() { this.tone(1200, 0.3, 'sine', 0.07, 600); this.noise(0.25, 0.08, 4200, 3); },
  thunder() { this.noise(0.3, 0.3, 2200, 0.5); this.tone(90, 0.25, 'square', 0.1, 40); },
  explode() { this.noise(0.45, 0.4, 320, 0.5); this.tone(70, 0.5, 'sine', 0.2, 30); },
  coin() { this.tone(980, 0.08, 'square', 0.06); setTimeout(() => this.tone(1460, 0.1, 'square', 0.05), 60); },
  heal() { this.tone(660, 0.2, 'sine', 0.1, 990); this.tone(990, 0.3, 'sine', 0.06, 1320); },
  levelup() {[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.12), i * 90)); },
  die() { this.tone(200, 0.4, 'sawtooth', 0.08, 50); this.noise(0.4, 0.15, 400, 0.6); },
  ui() { this.tone(760, 0.05, 'square', 0.03); },
  boss() { this.tone(60, 1.4, 'sawtooth', 0.18, 42); this.noise(1.2, 0.12, 220, 0.4); },
  loot(r) { if (r === 'legendary' || r === 'set') {[784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.1), i * 100)); } }
};

/* ---------------- 怪物血条 ---------------- */
let _hpBarTex = null;
function hpBarTexture() {
  if (_hpBarTex) return _hpBarTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 20;
  const g = c.getContext('2d');
  const r = 9, w = c.width, h = c.height;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r);
  g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
  g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r);
  g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
  g.closePath(); g.fill();
  _hpBarTex = new THREE.CanvasTexture(c);
  _hpBarTex.minFilter = THREE.LinearFilter;
  _hpBarTex.generateMipmaps = false;
  return _hpBarTex;
}

const HPBAR_W = 1.2, HPBAR_H = 0.19;

/**
 * 模型静止姿态的顶端高度（取包围盒，武器/翅膀摆动不做修正）
 */
function modelTopY(host) {
  host.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(host);
  return bb.max.y;
}

/**
 * 在怪物集团下挂一条血条（两张 Sprite：底槽 + 填充）
 * @param {THREE.Group} host 目标模型 group（会被读取缩放）
 */
function makeHpBar(host, opts = {}) {
  const s = host.scale.x || 1;
  const topLocal = modelTopY(host) / s;

  const g = new THREE.Group();
  g.scale.setScalar(1 / s);
  g.position.y = topLocal + (opts.gap || 0.36) / s;
  g.renderOrder = 20;

  const tex = hpBarTexture();
  const bgMat = new THREE.SpriteMaterial({
    map: tex, color: 0x0a0809, transparent: true, opacity: 0.82,
    depthTest: false, depthWrite: false
  });
  const bg = new THREE.Sprite(bgMat);
  bg.scale.set(HPBAR_W + 0.06, HPBAR_H + 0.06, 1);
  bg.renderOrder = 20;
  g.add(bg);

  const fillMat = new THREE.SpriteMaterial({
    map: tex, color: 0x46c651, transparent: true, opacity: 0.96,
    depthTest: false, depthWrite: false
  });
  const fill = new THREE.Sprite(fillMat);
  fill.center.set(0, 0.5);
  fill.scale.set(HPBAR_W, HPBAR_H, 1);
  fill.position.x = -HPBAR_W / 2;
  fill.renderOrder = 21;
  g.add(fill);

  // 精英：底槽换成暗金边
  if (opts.elite) bgMat.color.setHex(0x2a1c08);

  host.add(g);
  return { group: g, fill, bg, w: HPBAR_W, s };
}

/**
 * 刷新血条：长度按血量比例，尺寸按屏幕像素恒定（手机上也看得清）
 * @param {object} bar makeHpBar 的返回值
 * @param {number} ratio 剩余血量比例
 * @param {number} [dist] 血条到相机的距离，传入则同步尺寸
 */
function updateHpBar(bar, ratio, dist) {
  const r = CLAMP(ratio, 0, 1);
  bar.fill.scale.x = Math.max(0.001, bar.w * r);
  bar.fill.visible = r > 0.002;
  const col = r > 0.6 ? 0x46c651 : (r > 0.28 ? 0xd8b13a : 0xd2402f);
  if (bar.fill.material.color.getHex() !== col) bar.fill.material.color.setHex(col);
  // 屏幕上高度恒定：大屏 9px、小屏 7px，远近一致
  if (dist > 0.1) {
    const H = window.innerHeight || 900;
    const px = H >= 600 ? 9 : 7;
    // fov 46° → 全屏高度对应 2·d·tan23° ≈ 0.849d
    const h = CLAMP(px / H * 0.849 * dist, 0.08, 0.85);
    bar.group.scale.setScalar(h / HPBAR_H / bar.s);
  }
}

/* ---------------- 粒子 ---------------- */
const FX = {
  scene: null, cam: null, layer: null,
  parts: [], projectiles: [], zones: [], texts: [], beams: [],
  maxTexts: 60,

  init(scene, cam, layer) { this.scene = scene; this.cam = cam; this.layer = layer; },

  burst(pos, color, count = 10, opts = {}) {
    const speed = opts.speed || 6;
    const size = opts.size || 0.1;
    const life = opts.life || 0.5;
    const geo = boxGeo(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const group = new THREE.Group();
    group.position.copy(pos);
    this.scene.add(group);
    const list = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(RND(-0.2, 0.2), RND(-0.1, 0.3), RND(-0.2, 0.2));
      group.add(m);
      const ang = Math.random() * Math.PI * 2, el = RND(0.1, 0.9);
      list.push({
        m, v: new THREE.Vector3(Math.cos(ang) * speed * RND(0.4, 1), el * speed * RND(0.5, 1.1), Math.sin(ang) * speed * RND(0.4, 1))
      });
    }
    this.parts.push({ group, mat, list, life, max: life, gravity: opts.gravity !== undefined ? opts.gravity : 14, drag: opts.drag || 2.6 });
  },

  spark(pos, color = 0xffe0a0, count = 8) { this.burst(pos, color, count, { speed: 8, size: 0.07, life: 0.28, additive: true, gravity: 6 }); },

  blood(pos, color = 0xcc2222, count = 10) { this.burst(pos, color, count, { speed: 6, size: 0.09, life: 0.5, gravity: 18 }); },

  ring(pos, radius, color = 0xffffff, dur = 0.45, thickness = 0.16) {
    const geo = new THREE.RingGeometry(0.9, 1.0, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.08, pos.z);
    m.scale.setScalar(radius * 0.25);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'ring', radius, t: 0 });
  },

  flashCircle(pos, radius, color = 0xffffff, dur = 0.4) {
    const geo = new THREE.CircleGeometry(1, 28);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.07, pos.z);
    m.scale.setScalar(radius);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'flash' });
  },

  /* 地面预警（Boss 技能） */
  telegraph(pos, radius, dur, cb, color = 0xff3333) {
    const geo = new THREE.CircleGeometry(1, 40);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.06, pos.z); m.scale.setScalar(radius);
    this.scene.add(m);
    const ringGeo = new THREE.RingGeometry(0.94, 1, 40);
    const rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    rm.rotation.x = -Math.PI / 2; rm.position.y = 0.01; m.add(rm);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'tele', cb, radius });
  },

  /* 持续区域（毒雾/火海） */
  area(pos, radius, color, dur, opts = {}) {
    const geo = new THREE.CircleGeometry(1, 32);
    // 亮色技能降低不透明度，避免在亮地面上糊成一块
    const cc = new THREE.Color(color);
    const lum = 0.299 * cc.r + 0.587 * cc.g + 0.114 * cc.b;
    const baseOp = opts.opacity || Math.max(0.07, 0.3 - lum * 0.22);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: baseOp, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.05, pos.z); m.scale.setScalar(radius);
    this.scene.add(m);
    // 边沿亮圈，避免大色块显得扁平
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(0.7, baseOp + 0.32), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.012; m.add(rim);
    this.zones.push({ mesh: m, mat, life: dur, max: dur, type: 'area', radius, color, baseOp });
    return m;
  },

  beam(a, b, color = 0x88ddff, dur = 0.16, width = 1) {
    const pts = [];
    const seg = 8;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < seg) { p.x += RND(-0.35, 0.35); p.z += RND(-0.35, 0.35); p.y += RND(-0.2, 0.2); }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, linewidth: width }));
    this.scene.add(line);
    this.beams.push({ line, life: dur, max: dur });
    this.burst(b, color, 8, { speed: 5, size: 0.08, life: 0.3, additive: true, gravity: 0 });
  },

  /* 剑光 */
  slash(pos, angle, color = 0xffffff, radius = 2.2, arc = 2.2) {
    const geo = new THREE.RingGeometry(radius * 0.55, radius, 24, 1, angle - arc / 2, arc);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.6, pos.z);
    this.scene.add(m);
    this.zones.push({ mesh: m, mat, life: 0.2, max: 0.2, type: 'slash' });
  },

  projectile(opts) {
    const r = opts.radius || 0.3;
    const geo = sphGeo(r, 7);
    const mat = new THREE.MeshBasicMaterial({ color: opts.color || 0xffaa44, transparent: true, opacity: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(opts.pos);
    const halo = new THREE.Mesh(sphGeo(r * 1.9, 6), new THREE.MeshBasicMaterial({ color: opts.color || 0xffaa44, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(halo);
    if (opts.scale) m.scale.setScalar(opts.scale);
    this.scene.add(m);
    const light = opts.light !== false ? new THREE.PointLight(opts.color || 0xffaa44, 0.9, 8) : null;
    if (light) m.add(light);
    const p = {
      mesh: m, mat, pos: m.position, vel: opts.dir.clone().multiplyScalar(opts.speed || 18),
      radius: r, life: opts.life || 2.4, team: opts.team || 'player',
      dmg: opts.dmg || 10, onHit: opts.onHit, pierce: opts.pierce || false,
      trail: opts.trail !== false, color: opts.color || 0xffaa44, elem: opts.elem,
      knock: opts.knock || 0
    };
    this.projectiles.push(p);
    return p;
  },

  text(pos, str, cls = 'dmg', opts = {}) {
    if (!this.layer) return;
    if (this.texts.length > this.maxTexts) { const old = this.texts.shift(); if (old.el.parentNode) old.el.remove(); }
    const el = document.createElement('div');
    el.className = 'dmg-text ' + cls;
    el.textContent = str;
    if (opts.color) el.style.color = opts.color;
    el.style.left = '0px'; el.style.top = '0px';
    this.layer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), life: opts.life || 1.0, max: opts.life || 1.0, vy: opts.vy || 1.2, vx: RND(-0.35, 0.35) });
  },

  update(dt) {
    // 粒子
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.mat.opacity = Math.max(0, p.life / p.max);
      for (const q of p.list) {
        q.v.y -= p.gravity * dt;
        q.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        q.m.position.addScaledVector(q.v, dt);
      }
      if (p.life <= 0) {
        this.scene.remove(p.group);
        p.mat.dispose();
        this.parts.splice(i, 1);
      }
    }
    // 区域类
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      const k = 1 - z.life / z.max;
      if (z.type === 'ring') {
        z.mesh.scale.setScalar(z.radius * (0.25 + k * 0.9));
        z.mat.opacity = Math.max(0, 0.9 * (1 - k));
      } else if (z.type === 'flash') {
        z.mat.opacity = Math.max(0, 0.55 * (1 - k));
        z.mesh.scale.setScalar(z.mesh.scale.x * (1 + dt * 0.6));
      } else if (z.type === 'tele') {
        z.mat.opacity = 0.18 + Math.sin(k * 26) * 0.12 + k * 0.25;
        if (z.life <= 0 && z.cb) { z.cb(); z.cb = null; }
      } else if (z.type === 'area') {
        z.mat.opacity = Math.max(0, (z.baseOp || 0.18) * (0.85 + Math.sin(k * 14) * 0.2)) * Math.min(1, z.life * 2);
        z.mesh.scale.setScalar(z.radius * (0.94 + Math.sin(k * 6) * 0.03));
      } else if (z.type === 'slash') {
        z.mat.opacity = Math.max(0, 0.85 * (1 - k));
        z.mesh.rotation.z += dt * 2;
      }
      if (z.life <= 0) { this.scene.remove(z.mesh); z.mat.dispose(); this.zones.splice(i, 1); }
    }
    // 光束
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.beams.splice(i, 1); }
    }
    // 文字
    Object.assign(this, {});
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.pos.y += t.vy * dt;
      t.pos.x += t.vx * dt;
      t.vy = Math.max(0.1, t.vy - dt * 2.2);
      if (t.life <= 0) { t.el.remove(); this.texts.splice(i, 1); continue; }
      const v = t.pos.clone().project(this.cam);
      if (v.z > 1) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'block';
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      t.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${1 + Math.max(0, 0.3 - (t.max - t.life)) * 0.9})`;
      t.el.style.opacity = Math.min(1, t.life * 2.5);
    }
    // 投射物（仅视觉推进，碰撞在 Game 中）
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.trail && Math.random() < 0.7) {
        this.burst(p.pos, p.color, 1, { speed: 0.6, size: 0.09, life: 0.22, gravity: 0, additive: true });
      }
      if (p.life <= 0) { this.removeProjectile(i); }
    }
  },

  removeProjectile(i) {
    const p = this.projectiles[i];
    if (!p) return;
    this.scene.remove(p.mesh);
    p.mat.dispose();
    this.projectiles.splice(i, 1);
  }
};
