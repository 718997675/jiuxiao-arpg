/* ============================================================
 * FX2 —— 怪物侧演出原语层（BFX 17 个）
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = `docs/boss-vfx-playground.html`（那边有 51 只 Boss 可以真放一遍看效果）
 *   重新生成：`node dev/build-fx2.js --write`；只检查是否过期：`--check`
 *
 * ---------------- 为什么单独一个文件，不并进 fx.js / fx-kit.js ----------------
 * 三层各管一件事，混在一起改一处炸两处：
 *   fx.js      —— 玩家的「一次性」效果（环 / 闪 / 爆点 / 投射物 / 伤害数字）
 *   fx-kit.js  —— 玩家的「成片」效果（贴图粒子 / 拖尾 / 闪电 / 冲击波 / 贴花）
 *   fx2.js     —— **怪物侧**的「读得出形状」效果：形状即判定，
 *                 并且有 5 个「活物」原语（trail / entity / pool / beam / wall），
 *                 会走路、会追人、会被打断 —— 前两层都没有生命周期语义。
 *
 * ---------------- 宿主怎么接（只有四件事） ----------------
 *   FX2.bind(scene, camera, renderer)   开局一次
 *   FX2.update(dt)                      每帧（dt 是**秒**，内部夹到 0.05）
 *   FX2.clear()                         换图 / 重开
 *   FX2.actors.boss.pos / .player.pos   每帧同步两只的位置（beam / entity 的默认目标）
 *   FX2.shake = (amp, dur) => {}        可选：把屏幕震动接给 Game.shake
 *
 * ---------------- 三条纪律（跟 fx-kit.js 同源） ----------------
 * 1. 不逐帧 new：颜色 / 向量有缓存，粒子池创建时分配好。
 * 2. 材质按需建、随 mesh 释放；共享几何体打 `userData.shared` 不释放。
 * 3. 所有 mesh 挂在 FX2 自己的 Group 下 —— `clear()` 才可能真清干净
 *    （只清 updater 不清场景，换图后旧图的东西会挂在新图坐标上）。
 * ============================================================ */
'use strict';

const FX2 = (function () {
  /* ---------------- 宿主 ---------------- */
  let renderer = null;
  let camera = null;
  const root = new THREE.Group();
  root.name = 'fx2';
  /* 所有原语都往 root 里加。抽出来的代码里写的是 `scene.add(...)`，
   * 那个 `scene` 就是这个跟踪器 —— 它顺手记一份清单，
   * 否则 `clear()` 只能清掉 updater，mesh 会永远留在场景里。 */
  const _live = [];
  const scene = {
    add(o) { root.add(o); _live.push(o); return o; },
    remove(o) {
      root.remove(o);
      const i = _live.indexOf(o);
      if (i >= 0) _live.splice(i, 1);
      return o;
    }
  };

  /* beam / entity 的默认目标。游戏里每帧同步成 Boss 与玩家的位置；
   * 不设也不会报错（默认原点），但「默认朝玩家」这条语义就没了。 */
  const ACT = { boss: { pos: new THREE.Vector3() }, player: { pos: new THREE.Vector3() } };

  /* 屏幕震动交给宿主：游戏里是 Game.shake，特效台里是自己的相机抖 */
  let _shake = null;

  /* ---------------- 时间 / 更新队列 ---------------- */
  /* seq / delay 靠的是「模拟时间」，不是 setTimeout ——
   * setTimeout 在切图 / 暂停 / 掉帧时都会错位，而技能演出必须跟着帧走。 */
  const TIME = { t: 0, dt: 0 };
  const updaters = [];
  function addUpdate(o) { o.dead = false; updaters.push(o); return o; }
  function pruneUpdates() {
    for (let i = updaters.length - 1; i >= 0; i--) if (updaters[i].dead) updaters.splice(i, 1);
  }
  function seq(steps) {
    let i = 0, acc = 0;
    const list = steps.slice().sort((a, b) => a[0] - b[0]);
    return addUpdate({
      update(dt) {
        acc += dt;
        while (i < list.length && acc >= list[i][0]) {
          const fn = list[i][1]; i++;
          if (typeof fn === 'function') fn();
        }
        if (i >= list.length) this.dead = true;
      }
    });
  }
  function delay(sec, fn) { return seq([[sec, fn]]); }

  /* 抽出来的原语里有一处 `shake(...)`（blade 的落点余震），
   * 这里做成直通，没接宿主就是一个空函数 —— 不写「假接口」，写「可选的接口」。 */
  function shake(amp, dur) { if (typeof _shake === 'function') _shake(amp, dur == null ? 0.3 : dur); }

  /* ---------- 贴图 ---------- */
  function cv(w, h, draw){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  function radial(g, w, h, stops, cx = w/2, cy = h/2, r = w/2){
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach(s => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }

  const TEX = {};

  TEX.soft = cv(128,128,(g,w,h)=>{
    radial(g,w,h,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.72)'],
                 [.55,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]);
  });

  TEX.ember = cv(64,64,(g,w,h)=>{
    radial(g,w,h,[[0,'rgba(255,255,255,1)'],[.35,'rgba(255,255,255,.85)'],
                 [.7,'rgba(255,255,255,.18)'],[1,'rgba(255,255,255,0)']]);
  });

  TEX.smoke = cv(128,128,(g,w,h)=>{
    radial(g,w,h,[[0,'rgba(255,255,255,.55)'],[.45,'rgba(255,255,255,.28)'],
                 [.78,'rgba(255,255,255,.08)'],[1,'rgba(255,255,255,0)']]);
    // 打几团不规则，避免读成一个圆盘
    for(let i=0;i<9;i++){
      const a = i/9*6.283, r = 22 + Math.random()*16;
      const cx = w/2 + Math.cos(a)*r, cy = h/2 + Math.sin(a)*r;
      const gr = g.createRadialGradient(cx,cy,0,cx,cy,26);
      gr.addColorStop(0,'rgba(255,255,255,.20)'); gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(cx-30,cy-30,60,60);
    }
  });

  TEX.spark = cv(128,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.translate(w/2,h/2);
    const gr = g.createRadialGradient(0,0,0,0,0,w*0.16);
    gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0,0,w*0.16,0,6.283); g.fill();
    for(let i=0;i<4;i++){
      g.save(); g.rotate(i*Math.PI/2);
      const lg = g.createLinearGradient(0,0,0,-w*0.5);
      lg.addColorStop(0,'rgba(255,255,255,.95)'); lg.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(-w*0.022,0); g.lineTo(0,-w*0.5); g.lineTo(w*0.022,0); g.closePath(); g.fill();
      g.restore();
    }
  });

  /* 冲击环：一圈亮环 + 内侧薄雾 */
  TEX.ring = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    const gr = g.createRadialGradient(c,c,0,c,c,c);
    gr.addColorStop(0,   'rgba(255,255,255,0)');
    gr.addColorStop(0.62,'rgba(255,255,255,0)');
    gr.addColorStop(0.80,'rgba(255,255,255,.22)');
    gr.addColorStop(0.93,'rgba(255,255,255,.95)');
    gr.addColorStop(0.985,'rgba(255,255,255,.55)');
    gr.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0,0,w,h);
  });

  /* 预警圆片：中心极淡、边沿一圈实线 + 细刻度（读得出"这是范围"，不是光斑） */
  TEX.tele = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    const gr = g.createRadialGradient(c,c,0,c,c,c);
    gr.addColorStop(0,'rgba(255,255,255,.10)');
    gr.addColorStop(0.72,'rgba(255,255,255,.14)');
    gr.addColorStop(0.95,'rgba(255,255,255,.30)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c,c,c-1,0,6.283); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 5;
    g.beginPath(); g.arc(c,c,c-4,0,6.283); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    for(let i=0;i<24;i++){
      const a = i/24*6.283;
      g.beginPath();
      g.moveTo(c+Math.cos(a)*(c-16), c+Math.sin(a)*(c-16));
      g.lineTo(c+Math.cos(a)*(c-5),  c+Math.sin(a)*(c-5));
      g.stroke();
    }
  });

  /* 裂纹：从中心放射的折线，越远越细；黑色 alpha（NormalBlending 贴地压暗） */
  TEX.crack = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    g.lineCap = 'round';
    for(let i=0;i<9;i++){
      let a = i/9*6.283 + Math.random()*0.5;
      let x = c, y = c, wd = 7;
      g.strokeStyle = 'rgba(0,0,0,.92)'; g.lineWidth = wd;
      g.beginPath(); g.moveTo(x,y);
      const seg = 5 + (i%3);
      for(let j=0;j<seg;j++){
        a += (Math.random()-0.5)*0.85;
        const len = (c/segsafe(seg)) * (0.75 + Math.random()*0.5);
        x += Math.cos(a)*len; y += Math.sin(a)*len;
        g.lineTo(x,y); g.lineWidth = Math.max(0.8, wd*(1-j/seg));
      }
      g.stroke();
    }
    function segsafe(n){ return n; }
  });

  /* 焦痕：黑褐色斑 + 边缘发灰 */
  TEX.scorch = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    const gr = g.createRadialGradient(c,c,0,c,c,c*0.96);
    gr.addColorStop(0,   'rgba(0,0,0,.90)');
    gr.addColorStop(0.52,'rgba(0,0,0,.70)');
    gr.addColorStop(0.82,'rgba(10,6,2,.34)');
    gr.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0,0,w,h);
    for(let i=0;i<26;i++){
      const a = Math.random()*6.283, r = c*(0.5+Math.random()*0.46);
      const rr = 4 + Math.random()*13;
      const g2 = g.createRadialGradient(c+Math.cos(a)*r, c+Math.sin(a)*r, 0,
                                        c+Math.cos(a)*r, c+Math.sin(a)*r, rr);
      g2.addColorStop(0,'rgba(0,0,0,.55)'); g2.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = g2; g.fillRect(0,0,w,h);
    }
  });

  /* 霜纹：六角雪花 + 放射霜线（加法混合，浅青） */
  TEX.frost = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineCap = 'round';
    for(let i=0;i<6;i++){
      g.save(); g.translate(c,c); g.rotate(i*Math.PI/3);
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(0,0); g.lineTo(0,-c*0.92); g.stroke();
      for(let j=1;j<=4;j++){
        const y = -c*0.92*j/4.4, len = c*0.20*(1-j/7);
        g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(0,y); g.lineTo(-len,y+len*0.72); g.stroke();
        g.beginPath(); g.moveTo(0,y); g.lineTo( len,y+len*0.72); g.stroke();
      }
      g.restore();
    }
    const gr = g.createRadialGradient(c,c,0,c,c,c*0.5);
    gr.addColorStop(0,'rgba(255,255,255,.30)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0,0,w,h);
  });

  /* 毒斑：三团叠加的不规则斑 + 小气泡 */
  TEX.poison = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    for(let i=0;i<7;i++){
      const a = Math.random()*6.283, r = c*0.52*Math.random();
      const x = c+Math.cos(a)*r, y = c+Math.sin(a)*r, rr = c*(0.30+Math.random()*0.30);
      const gr = g.createRadialGradient(x,y,0,x,y,rr);
      gr.addColorStop(0,'rgba(255,255,255,.42)'); gr.addColorStop(0.7,'rgba(255,255,255,.16)');
      gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x-rr,y-rr,rr*2,rr*2);
    }
    g.fillStyle = 'rgba(255,255,255,.75)';
    for(let i=0;i<14;i++){
      const a = Math.random()*6.283, r = c*0.86*Math.random();
      g.beginPath(); g.arc(c+Math.cos(a)*r, c+Math.sin(a)*r, 1.6+Math.random()*3.2, 0, 6.283); g.fill();
    }
  });

  /* 蛛网：八向辐条 + 同心弧 */
  TEX.web = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    g.strokeStyle = 'rgba(255,255,255,.72)'; g.lineWidth = 2.2;
    for(let i=0;i<8;i++){
      const a = i/8*6.283;
      g.beginPath(); g.moveTo(c,c);
      g.lineTo(c+Math.cos(a)*c*0.96, c+Math.sin(a)*c*0.96); g.stroke();
    }
    for(let k=1;k<=5;k++){
      const rr = c*0.96*k/5;
      g.lineWidth = 1.6;
      g.beginPath();
      for(let i=0;i<=8;i++){
        const a = i/8*6.283 + (k%2)*0.06;
        const x = c+Math.cos(a)*rr, y = c+Math.sin(a)*rr;
        i ? g.lineTo(x,y) : g.moveTo(x,y);
      }
      g.stroke();
    }
  });

  /* 法阵地纹：双环 + 内接三角 + 刻度（Boss 出场/召唤用） */
  TEX.rune = cv(256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const c = w/2;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(c,c,c-6,0,6.283); g.stroke();
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(c,c,c-26,0,6.283); g.stroke();
    g.beginPath(); g.arc(c,c,c*0.40,0,6.283); g.stroke();
    for(let t=0;t<2;t++){
      g.beginPath();
      for(let i=0;i<=3;i++){
        const a = i/3*6.283 + t*Math.PI/3 - Math.PI/2;
        const x = c+Math.cos(a)*(c-20), y = c+Math.sin(a)*(c-20);
        i ? g.lineTo(x,y) : g.moveTo(x,y);
      }
      g.stroke();
    }
    g.lineWidth = 2.2;
    for(let i=0;i<32;i++){
      const a = i/32*6.283;
      g.beginPath();
      g.moveTo(c+Math.cos(a)*(c-18), c+Math.sin(a)*(c-18));
      g.lineTo(c+Math.cos(a)*(c-8),  c+Math.sin(a)*(c-8));
      g.stroke();
    }
  });

  /* 竖柱：竖向亮 → 上端衰减；横向中间亮。两个渐变相乘（destination-in） */
  TEX.column = cv(128,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const lgV = g.createLinearGradient(0,h,0,0);   // 画布底 = 柱底
    lgV.addColorStop(0,   'rgba(255,255,255,1)');
    lgV.addColorStop(0.18,'rgba(255,255,255,.92)');
    lgV.addColorStop(0.55,'rgba(255,255,255,.42)');
    lgV.addColorStop(0.86,'rgba(255,255,255,.10)');
    lgV.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = lgV; g.fillRect(0,0,w,h);
    g.globalCompositeOperation = 'destination-in';
    const lgH = g.createLinearGradient(0,0,w,0);
    lgH.addColorStop(0,   'rgba(255,255,255,0)');
    lgH.addColorStop(0.24,'rgba(255,255,255,.55)');
    lgH.addColorStop(0.50,'rgba(255,255,255,1)');
    lgH.addColorStop(0.76,'rgba(255,255,255,.55)');
    lgH.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = lgH; g.fillRect(0,0,w,h);
    g.globalCompositeOperation = 'source-over';
  });

  /* 剑影：128×512，**剑尖朝下**。
     画布上边 = 世界 +Y，所以剑尖必须画在画布下缘（tipY > guardY）。
     加法混合下"暗"等于不存在，层次只能靠 alpha。 */
  TEX.blade = cv(128,512,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    const x = w*0.5;
    const guardY = h*0.145;
    const tipY   = h*0.985;
    const halfW  = w*0.098;

    const bladePath = ()=>{
      g.beginPath();
      g.moveTo(x - halfW, guardY);
      g.lineTo(x + halfW, guardY);
      g.lineTo(x + halfW*0.62, h*0.90);
      g.lineTo(x, tipY);
      g.lineTo(x - halfW*0.62, h*0.90);
      g.closePath();
    };
    bladePath();
    const gr = g.createLinearGradient(0, guardY, 0, tipY);
    gr.addColorStop(0,    'rgba(255,255,255,.62)');
    gr.addColorStop(0.40, 'rgba(255,255,255,.74)');
    gr.addColorStop(0.90, 'rgba(255,255,255,.96)');
    gr.addColorStop(1,    'rgba(255,255,255,.42)');
    g.fillStyle = gr; g.fill();

    g.beginPath();                                    // 中脊
    g.moveTo(x - w*0.016, guardY);
    g.lineTo(x + w*0.016, guardY);
    g.lineTo(x, h*0.93); g.closePath();
    g.fillStyle = 'rgba(255,255,255,1)'; g.fill();

    g.strokeStyle = 'rgba(255,255,255,.95)';          // 刃口
    g.lineWidth = w*0.012;
    bladePath(); g.stroke();

    g.fillStyle = 'rgba(255,255,255,.92)';            // 剑格
    g.beginPath();
    g.moveTo(x - w*0.30, guardY - h*0.014);
    g.quadraticCurveTo(x, guardY + h*0.012, x + w*0.30, guardY - h*0.014);
    g.lineTo(x + w*0.28, guardY + h*0.016);
    g.quadraticCurveTo(x, guardY + h*0.032, x - w*0.28, guardY + h*0.016);
    g.closePath(); g.fill();

    g.fillStyle = 'rgba(255,255,255,.52)';            // 握柄
    g.fillRect(x - w*0.038, h*0.026, w*0.076, guardY - h*0.030);
    g.fillStyle = 'rgba(255,255,255,.85)';
    for(let i=0;i<3;i++) g.fillRect(x - w*0.046, h*0.044 + i*h*0.032, w*0.092, h*0.009);

    g.fillStyle = 'rgba(255,255,255,.88)';            // 剑首
    g.beginPath();
    g.moveTo(x, h*0.004); g.lineTo(x + w*0.052, h*0.022);
    g.lineTo(x, h*0.040); g.lineTo(x - w*0.052, h*0.022);
    g.closePath(); g.fill();
  });

  /* 岩块面：给落石一点斑驳（Standard 材质用，白底灰斑） */
  TEX.rock = cv(128,128,(g,w,h)=>{
    g.fillStyle = '#9a948c'; g.fillRect(0,0,w,h);
    for(let i=0;i<90;i++){
      const x = Math.random()*w, y = Math.random()*h, r = 2+Math.random()*11;
      const v = 110 + Math.random()*80 | 0;
      g.fillStyle = 'rgba('+v+','+(v-4)+','+(v-10)+',.55)';
      g.beginPath(); g.arc(x,y,r,0,6.283); g.fill();
    }
  });

  /* ---------- 粒子池 ---------- */
  const U = { scale: { value: 400 } };
  function updatePointScale(){ U.scale.value = (renderer ? renderer.domElement.height : 800) * 0.5; }

  const POINT_VS = `
  uniform float uScale;
  attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aTint;
  varying float vA; varying float vR; varying vec3 vC;
  void main(){
    vA = aAlpha; vR = aRot; vC = aTint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

  const POINT_FS = `
  uniform sampler2D uTex; varying float vA; varying float vR; varying vec3 vC;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vR), s = sin(vR);
    uv = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c) + 0.5;
    vec4 t = texture2D(uTex, uv);
    gl_FragColor = vec4(vC * t.rgb, t.a * vA);
    if(gl_FragColor.a < 0.004) discard;
  }`;

  class Pool {
    constructor(tex, max = 700){
      this.max = max; this.cursor = 0; this.alive = 0;
      const g = new THREE.BufferGeometry();
      this.aPos = new Float32Array(max * 3);
      this.aSize = new Float32Array(max);
      this.aAlpha = new Float32Array(max);
      this.aRot = new Float32Array(max);
      this.aTint = new Float32Array(max * 3);
      g.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
      g.setAttribute('aRot', new THREE.BufferAttribute(this.aRot, 1));
      g.setAttribute('aTint', new THREE.BufferAttribute(this.aTint, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
      const m = new THREE.ShaderMaterial({
        uniforms:{ uTex:{ value: tex }, uScale: U.scale },
        vertexShader: POINT_VS, fragmentShader: POINT_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      this.pts = new THREE.Points(g, m);
      this.pts.frustumCulled = false;
      this.pts.renderOrder = 8;
      scene.add(this.pts);
      this.p = [];
      for(let i=0;i<max;i++) this.p.push({ live:false, x:0,y:0,z:0, vx:0,vy:0,vz:0, t:0, life:1,
        s0:1, s1:1, a0:1, grav:0, drag:0, rot:0, rotV:0, cx:1,cy:1,cz:1 });
    }
    spawn(o){
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.live = true; p.t = 0;
      p.x = o.x; p.y = o.y; p.z = o.z;
      p.vx = o.vx||0; p.vy = o.vy||0; p.vz = o.vz||0;
      p.life = o.life != null ? o.life : 0.6;
      p.s0 = o.s0 != null ? o.s0 : 0.4;
      p.s1 = o.s1 != null ? o.s1 : p.s0 * 0.2;
      p.a0 = o.a0 != null ? o.a0 : 1;
      p.grav = o.grav || 0; p.drag = o.drag || 0;
      p.rot = o.rot || 0; p.rotV = o.rotV || 0;
      p.cx = o.r != null ? o.r : 1; p.cy = o.g != null ? o.g : 1; p.cz = o.b != null ? o.b : 1;
      return p;
    }
    update(dt){
      const P = this.p, pos = this.aPos, sz = this.aSize, al = this.aAlpha, ro = this.aRot, ti = this.aTint;
      let n = 0;
      for(let i=0;i<this.max;i++){
        const p = P[i];
        if(!p.live){ sz[i] = 0; al[i] = 0; continue; }
        p.t += dt;
        const k = p.t / p.life;
        if(k >= 1){ p.live = false; sz[i] = 0; al[i] = 0; continue; }
        if(p.drag){ const d = Math.max(0, 1 - p.drag*dt); p.vx *= d; p.vy *= d; p.vz *= d; }
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += p.rotV * dt;
        const e = 1 - Math.pow(1-k, 2.2);
        const fadeIn = Math.min(1, k / 0.08);
        const fadeOut = 1 - Math.pow(k, 2.4);
        pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = p.z;
        sz[i] = (p.s0 + (p.s1 - p.s0) * e) * (0.85 + 0.15*Math.sin(p.rot*3));
        al[i] = p.a0 * fadeIn * fadeOut;
        ro[i] = p.rot;
        ti[i*3] = p.cx; ti[i*3+1] = p.cy; ti[i*3+2] = p.cz;
        n++;
      }
      this.alive = n;
      const g = this.pts.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aRot.needsUpdate = true;
      g.attributes.aTint.needsUpdate = true;
    }
  }

  const POOLS = {};
  function pool(name){
    if(!POOLS[name]) POOLS[name] = new Pool(TEX[name] || TEX.soft, 700);
    return POOLS[name];
  }
  function totalParticles(){ let n = 0; for(const k in POOLS) n += POOLS[k].alive; return n; }
  function clearParticles(){ for(const k in POOLS){ POOLS[k].p.forEach(p=>p.live=false); } }

  /* ---------- 贴片工具 ---------- */
  const _plane = new THREE.PlaneGeometry(1, 1);
  _plane.userData.shared = true;

  /* 贴地平面 */
  function flatMesh(tex, color = 0xffffff, blending = THREE.AdditiveBlending, opacity = 1){
    const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending, side: THREE.DoubleSide, fog: false
    }));
    m.rotation.x = -Math.PI/2;
    m.renderOrder = 4;
    scene.add(m);
    return m;
  }
  /* 竖直贴片：每帧朝相机（billboard） */
  function billMesh(tex, color = 0xffffff, opacity = 1, blending = THREE.AdditiveBlending){
    const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending, fog: false, side: THREE.DoubleSide
    }));
    m.renderOrder = 6;
    m.userData.bill = true;
    scene.add(m);
    return m;
  }
  /* 固定朝向的竖直贴片（不跟相机）：用于"插在地上的剑"这类应当有世界朝向的东西 */
  function vplane(tex, color = 0xffffff, opacity = 1, blending = THREE.AdditiveBlending){
    const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending, fog: false, side: THREE.DoubleSide
    }));
    m.renderOrder = 6;
    scene.add(m);
    return m;
  }
  function killAfter(mesh, sec){
    delay(sec, ()=>{ scene.remove(mesh); if(mesh.material) mesh.material.dispose(); });
    return mesh;
  }
  const _billList = [];
  function regBill(m){ _billList.push(m); return m; }

  /* ---------- BFX 原语 ---------- */
  const BFX = {};
  let ZONE_ON = true;          // 预警形状总开关（右侧面板）
  const V3 = (x,y,z)=> new THREE.Vector3(x,y,z);
  const _colCache = {};
  function col(hex){ if(!_colCache[hex]) _colCache[hex] = new THREE.Color(hex); return _colCache[hex]; }

  function disposeMesh(m){
    scene.remove(m);
    if(m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    if(m.material){
      if(Array.isArray(m.material)) m.material.forEach(x=>x.dispose());
      else if(!m.material.userData.shared) m.material.dispose();
    }
  }

  /* ---------- 6.0 粒子小工具 ---------- */
  BFX.spr = function(x, y, z, o = {}){
    return pool(o.tex || 'soft').spawn({
      x, y, z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life != null ? o.life : .7,
      s0: o.s0 != null ? o.s0 : .3,
      s1: o.s1 != null ? o.s1 : 0,
      a0: o.a0 != null ? o.a0 : .8,
      grav: o.grav || 0, drag: o.drag || 0,
      rot: o.rot || Math.random()*6.28, rotV: o.rotV || 0,
      r: (o.r != null ? o.r : 1) * 1, g: (o.g != null ? o.g : 1) * 1, b: (o.b != null ? o.b : 1) * 1
    });
  };
  /* 球面爆散 / 半球爆散（hemi=true 时只往上） */
  BFX.burst = function(pos, n, o = {}){
    const hemi = o.hemi !== false;
    for(let i=0;i<n;i++){
      const a = Math.random()*6.283;
      const up = hemi ? (0.25 + Math.random()*0.9) : (Math.random()*2-1);
      const sp = (o.sp != null ? o.sp : 3) * (0.5 + Math.random());
      const hr = Math.sqrt(Math.max(0.0001, 1 - Math.min(1, up*up)));
      BFX.spr(pos.x, pos.y, pos.z, {
        tex: o.tex || 'ember',
        vx: Math.cos(a)*hr*sp, vy: up*sp, vz: Math.sin(a)*hr*sp,
        life: (o.life || .8) * (0.7 + Math.random()*0.6),
        s0: (o.s0 || .34) * (0.7 + Math.random()*0.6),
        s1: o.s1 != null ? o.s1 : 0,
        a0: o.a0 != null ? o.a0 : .85,
        grav: o.grav != null ? o.grav : -3.2,
        drag: o.drag || 1.4,
        r: o.r != null ? o.r : 1, g: o.g != null ? o.g : 1, b: o.b != null ? o.b : 1
      });
    }
  };

  /* 瞬时点光：让 Boss 身/地面真的被照亮一下（纯加法贴片做不到这点） */
  const _lights = [];
  for(let i=0;i<3;i++){
    const L = new THREE.PointLight(0xffffff, 0, 14, 2);
    L.visible = false; scene.add(L);
    _lights.push({ L, t:0, dur:0, peak:0 });
  }
  function lightPulse(pos, hex, peak = 2.4, dur = .38){
    let slot = _lights.find(s=>s.dur <= 0) || _lights[0];
    slot.L.position.copy(pos);
    slot.L.color.set(hex);
    slot.L.visible = true;
    slot.t = 0; slot.dur = dur; slot.peak = peak;
  }

  /* ---------- 6.1 冲击环（贴地，扩张） ---------- */
  BFX.shock = function(pos, r, o = {}){
    const dur = o.dur || .55;
    const c = o.color != null ? o.color : 0xffd8a0;
    const m = flatMesh(TEX.ring, c, THREE.AdditiveBlending, o.a0 != null ? o.a0 : .9);
    m.position.set(pos.x, o.y != null ? o.y : .06, pos.z);
    m.renderOrder = 3;
    const thick = o.thick != null ? o.thick : 1;
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/dur);
      const e = 1 - Math.pow(1-k, 2.4);
      const s = 2*r*(0.12 + 0.88*e);
      m.scale.set(s, s*thick, 1);
      m.material.opacity = (o.a0 != null ? o.a0 : .9) * (1 - k)*(1 - k);
      if(k >= 1){ disposeMesh(m); this.dead = true; }
    }});
    return m;
  };

  /* ---------- 6.2 预警形状：circle / ring / rect / sector ----------
     o = { shape, x, z, r, r0, w, len, angle, span, color, dur, fill }
     **这里的 r/w/len 就是判定的尺寸**，不许再另写一套近似值。 */
  const TEX_BAND = cv(128,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0,0,w,h);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5;
    g.strokeRect(2.5,2.5,w-5,h-5);
    g.strokeStyle = 'rgba(255,255,255,.30)'; g.lineWidth = 3;
    for(let i=-h;i<w+h;i+=26){
      g.beginPath(); g.moveTo(i,0); g.lineTo(i+h,h); g.stroke();
    }
  });

  BFX.zone = function(o){
    if(!ZONE_ON) return { grp:null, dead:true, done:true, kill(){} };
    /* WB 口径归一：line→rect、fan/cone→sector。新技能写 WB 名，
       老技能写旧名，这里统一成 4 个基础形状再画。 */
    const shape = normShape({ shape: o.shape || 'circle' });
    const dur = o.dur != null ? o.dur : .8;
    const c = o.color != null ? o.color : 0xff6a3c;
    const x = o.x || 0, z = o.z || 0;
    const y = o.y != null ? o.y : .05;
    const grp = new THREE.Group();
    scene.add(grp);
    const meshes = [];

    if(shape === 'circle'){
      const m = flatMesh(TEX.tele, c, THREE.AdditiveBlending, .85);
      m.position.set(x, y, z); m.scale.setScalar(o.r*2); meshes.push(m); grp.add(m);
      // 内填：从中心涨到 r，读作"还有多久"
      const f = flatMesh(TEX.soft, c, THREE.AdditiveBlending, .22);
      f.position.set(x, y-.002, z); f.scale.setScalar(0.1); meshes.push(f); grp.add(f);
      f.userData.fill = { r:o.r };
    }
    else if(shape === 'ring'){
      const inner0 = o.r0 != null ? o.r0 : o.r*0.55;
      const geo = new THREE.RingGeometry(inner0, o.r, 80, 1);
      const mat = new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.16,
        blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI/2; m.position.set(x, y, z);
      m.renderOrder = 4; grp.add(m); meshes.push(m);
      // 内外沿各一条实线
      [inner0, o.r].forEach(rr=>{
        const g2 = new THREE.RingGeometry(rr-0.045, rr+0.045, 80, 1);
        const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color:c, transparent:true,
          opacity:.95, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
        m2.rotation.x = -Math.PI/2; m2.position.set(x, y+.002, z);
        m2.renderOrder = 4; grp.add(m2); meshes.push(m2);
      });
    }
    else if(shape === 'rect'){
      const len = o.len, wd = o.w;
      const m = flatMesh(TEX_BAND, c, THREE.AdditiveBlending, .8);
      m.rotation.x = -Math.PI/2; m.rotation.z = -(o.angle || 0);
      m.position.set(x + Math.sin(o.angle||0)*len/2, y, z + Math.cos(o.angle||0)*len/2);
      m.scale.set(wd, len, 1);
      meshes.push(m); grp.add(m);
      // 中轴箭头
      const ar = flatMesh(TEX.soft, c, THREE.AdditiveBlending, .3);
      ar.rotation.x = -Math.PI/2; ar.rotation.z = -(o.angle || 0);
      ar.position.copy(m.position);
      ar.scale.set(wd*0.32, len*0.94, 1);
      meshes.push(ar); grp.add(ar);
    }
    else if(shape === 'sector'){
      const span = o.span != null ? o.span : Math.PI*0.6;
      /* RingGeometry 的角度从 +X 起、逆时针；铺到地面后（rotation.x = -90°）
         几何 +X = 世界 +X、几何 +Y = 世界 −Z。而本页的角度口径是
         atan2(dx, dz)（0 = 世界 +Z），所以要减 90° 才是同一个朝向。 */
      const start = (o.angle || 0) - Math.PI/2 - span/2;
      const geo = new THREE.RingGeometry(0.06, o.r, 56, 1, start, span);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:c, transparent:true,
        opacity:.18, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2;
      m.position.set(x, y, z); m.renderOrder = 4;
      grp.add(m); meshes.push(m);
      const edge = new THREE.Mesh(new THREE.RingGeometry(o.r-0.05, o.r+0.05, 56, 1, start, span),
        new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.95,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      edge.rotation.x = -Math.PI/2; edge.position.set(x, y+.002, z);
      edge.renderOrder = 4; grp.add(edge); meshes.push(edge);
    }
    else if(shape === 'scatter'){
      /* 散射：N 颗各自独立的落点圆（饕餮反刍 / 相柳毒喷）。
         和 sector 的区别是**判定不是一个整体**，所以预警必须分开画 ——
         画一个包住所有落点的大圈，玩家会以为圈中心安全。 */
      const pts = o.pts || [];
      pts.forEach((p, i)=>{
        const m = flatMesh(TEX.tele, c, THREE.AdditiveBlending, .82);
        m.position.set(p.x, y, p.z); m.scale.setScalar(p.r*2);
        m.userData.born = i * 0.035;   /* 先后落，读得出"一串" */
        meshes.push(m); grp.add(m);
        const core = flatMesh(TEX.soft, c, THREE.AdditiveBlending, .26);
        core.position.set(p.x, y-.002, p.z); core.scale.setScalar(0.1);
        core.userData.fill = { r:p.r };
        meshes.push(core); grp.add(core);
      });
    }
    else if(shape === 'self'){
      /* 自身增益：没有落点，只有一圈往上收的光环（刑天战吼 / 狂化）。
         用 ring 而不是 circle —— 圆片在俯视角里会被读成"技能范围"。 */
      const geo = new THREE.RingGeometry(o.r*0.86, o.r, 72, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:c, transparent:true,
        opacity:.85, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2; m.position.set(x, y, z);
      m.renderOrder = 4; grp.add(m); meshes.push(m);
      m.userData.shrink = true;
    }

    const base = meshes.map(m=>({ m, a:m.material.opacity }));
    const handle = { grp, dead:false, done:false, kill(){ this.done = true; } };
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/dur);
      // 呼吸：读作"正在蓄力"，不是静态贴图
      const pulse = 0.72 + 0.28*Math.sin(this.t*13);
      base.forEach(b=>{
        /* scatter 的每颗弹是先后落下来的，按 born 偏移逐个亮起 */
        if(b.m.userData.born){
          const kk = Math.max(0, Math.min(1, (this.t - b.m.userData.born)/Math.max(.12, dur*.72)));
          b.m.material.opacity = b.a * kk * pulse;
          b.m.scale.setScalar(b.m.scale.x);
          return;
        }
        if(b.m.userData.shrink){
          /* 自身增益：ring 从大收到小，读作"气收回身上" */
          const s = 1 - 0.55*k;
          b.m.scale.setScalar(s);
          b.m.material.opacity = b.a * pulse * k;
          return;
        }
        if(b.m.userData.fill){
          const rr = b.m.userData.fill.r * (0.15 + 0.85*k);
          b.m.scale.setScalar(rr*2);
          b.m.material.opacity = b.a * (0.12 + 0.34*k);
        }else{
          b.m.material.opacity = b.a * pulse * (k > .88 ? (1-(k-.88)/.12) : 1);
        }
      });
      if(k >= 1 || handle.done){
        meshes.forEach(m=>{ grp.remove(m); m.geometry.dispose(); m.material.dispose(); });
        scene.remove(grp);
        this.dead = true;
      }
    }});
    return handle;
  };

  /* ---------- 6.3 竖柱（火柱 / 光柱 / 传送门） ----------
     o = { x, z, r, h, color, life, up, core, ember } */
  BFX.column = function(o){
    const x = o.x || 0, z = o.z || 0;
    const r = o.r != null ? o.r : 0.9;
    const hh = o.h != null ? o.h : 5;
    const life = o.life != null ? o.life : 1.3;
    const c = o.color != null ? o.color : 0xff7a3c;

    const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    geo.userData.shared = true;
    const mat = new THREE.MeshBasicMaterial({ map:TEX.column, color:c, transparent:true, opacity:.85,
      blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z);
    m.scale.set(r, 0.01, r);
    m.renderOrder = 6;
    scene.add(m);

    // 内芯：更亮更细，柱才有"热度"
    const coreMat = new THREE.MeshBasicMaterial({ color: o.core != null ? o.core : 0xfff2c8,
      transparent:true, opacity:.55, blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide, depthWrite:false, fog:false });
    const core = new THREE.Mesh(geo, coreMat);
    core.position.set(x, 0, z);
    core.scale.set(r*0.42, 0.01, r*0.42);
    core.renderOrder = 6;
    scene.add(core);

    const ring = flatMesh(TEX.tele, c, THREE.AdditiveBlending, .7);
    ring.position.set(x, .07, z); ring.scale.setScalar(r*2.6);
    const scorch = null;

    const up = o.up != null ? o.up : 0.16;
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = this.t/life;
      const grow = Math.min(1, this.t/Math.max(.05, up));
      const hNow = hh * (0.35 + 0.65*(1-Math.pow(1-grow,3)));
      m.scale.set(r*(0.6+0.4*grow), hNow, r*(0.6+0.4*grow));
      core.scale.set(r*0.42*(0.6+0.4*grow), hNow*0.86, r*0.42*(0.6+0.4*grow));
      m.position.y = hNow/2; core.position.y = hNow/2;
      const fade = k < .55 ? 1 : 1 - Math.pow((k-.55)/.45, 1.6);
      mat.opacity = .85*fade; coreMat.opacity = .55*fade;
      ring.material.opacity = .7*fade*(0.7+0.3*Math.sin(this.t*20));
      // 上升余烬
      if(Math.random() < dt*26){
        BFX.spr(x + (Math.random()-.5)*r*1.5, .1 + Math.random()*hNow*0.5, z + (Math.random()-.5)*r*1.5, {
          tex:'ember', vy: 1.6 + Math.random()*1.8, vx:(Math.random()-.5)*.5, vz:(Math.random()-.5)*.5,
          life: .7 + Math.random()*.6, s0:.16+Math.random()*.12, a0:.7, drag:.5,
          r:1, g:.62, b:.28
        });
      }
      if(k >= 1){ disposeMesh(m); scene.remove(core); disposeMesh(ring); this.dead = true; }
    }});
  };

  /* ---------- 6.4 地刺 / 藤蔓 / 冰棱（实体，从地里长出来） ----------
     o = { x, z, n, r, h, color, glow, dur, spread, tilt, kind } */
  const _spikeGeo = new THREE.ConeGeometry(1, 1, 5);
  _spikeGeo.userData.shared = true;
  BFX.spikes = function(o){
    const x = o.x || 0, z = o.z || 0;
    const n = Math.max(1, o.n || 7);
    const rad = o.r != null ? o.r : 1.5;
    const hh = o.h != null ? o.h : 1.8;
    const dur = o.dur != null ? o.dur : 1.5;
    const mat = new THREE.MeshStandardMaterial({
      color: o.color != null ? o.color : 0x2a241f,
      roughness: .82, metalness: .05, flatShading: true,
      emissive: new THREE.Color(o.glow != null ? o.glow : 0x000000),
      emissiveIntensity: .35
    });
    const group = new THREE.Group(); scene.add(group);
    const list = [];
    for(let i=0;i<n;i++){
      const a = (i/n)*6.283 + Math.random()*0.5;
      const rr = rad * (0.25 + Math.random()*0.8);
      const m = new THREE.Mesh(_spikeGeo, mat);
      const w = (0.13 + Math.random()*0.12) * (o.thick || 1);
      const hgt = hh * (0.55 + Math.random()*0.7);
      m.position.set(x + Math.cos(a)*rr, 0, z + Math.sin(a)*rr);
      m.scale.set(w, 0.01, w);
      // 向外倾一点，读作"破土刺出"，不是插在地里的钉子
      const tilt = o.tilt != null ? o.tilt : 0.30;
      m.rotation.set(Math.cos(a)*tilt, Math.random()*6.28, -Math.sin(a)*tilt);
      group.add(m);
      list.push({ m, hgt, delay: (i/n)*0.18 + Math.random()*0.06 });
    }
    addUpdate({ t:0, update(dt){
      this.t += dt;
      list.forEach(s=>{
        const k = Math.max(0, (this.t - s.delay));
        const grow = Math.min(1, k/0.14);
        const e = 1 - Math.pow(1-grow, 3);
        let sc = e;
        // 收尾：最后 0.35 秒缩回地里
        const tail = dur - 0.35;
        if(this.t > tail) sc = Math.max(0, 1 - (this.t-tail)/0.35);
        s.m.scale.set(0.13*(o.thick||1)*(0.6+0.4*e), s.hgt*sc, 0.13*(o.thick||1)*(0.6+0.4*e));
        s.m.position.y = s.hgt*sc*0.5;
      });
      if(this.t > dur){
        group.children.slice().forEach(c=>group.remove(c));
        mat.dispose();
        scene.remove(group);
        this.dead = true;
      }
    }});
    return group;
  };

  /* ---------- 6.5 落石 / 陨石（实体从天上掉） ----------
     o = { from, to, r, color, glow, fire, life, split } */
  const _rockGeo = new THREE.IcosahedronGeometry(1, 0);
  _rockGeo.userData.shared = true;
  BFX.boulder = function(o){
    const from = o.from.clone();
    const to = o.to.clone();
    const rad = o.r != null ? o.r : .8;
    const mat = new THREE.MeshStandardMaterial({
      map: TEX.rock,
      color: o.color != null ? o.color : 0x6b6560,
      roughness: .95, metalness: .04, flatShading: true
    });
    const m = new THREE.Mesh(_rockGeo, mat);
    m.scale.setScalar(rad);
    m.position.copy(from);
    m.rotation.set(Math.random()*6.28, Math.random()*6.28, Math.random()*6.28);
    scene.add(m);

    // 火光/元素光：加法壳
    let glow = null;
    if(o.fire !== false){
      glow = billMesh(TEX.soft, o.glow != null ? o.glow : 0xff8a3c, .7);
      glow.scale.setScalar(rad*5);
      glow.position.copy(from);
    }
    const spin = V3((Math.random()-.5)*4, (Math.random()-.5)*4, (Math.random()-.5)*4);
    const dur = o.fall != null ? o.fall : .62;

    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/dur);
      const e = k*k;                       // 重力加速
      m.position.lerpVectors(from, to, e);
      m.rotation.x += spin.x*dt; m.rotation.y += spin.y*dt; m.rotation.z += spin.z*dt;
      if(glow){
        glow.position.copy(m.position);
        glow.material.opacity = .7;
        if(Math.random() < dt*40){
          BFX.spr(m.position.x, m.position.y, m.position.z, {
            tex:'ember', vx:(Math.random()-.5)*2, vy: 1+Math.random()*2, vz:(Math.random()-.5)*2,
            life:.55, s0:.3, a0:.85, grav:-1.2, r:1, g:.6, b:.24
          });
        }
      }
      if(k >= 1){
        // 落地：实体碎成小块 + 烟 + 冲击环 + 焦痕
        scene.remove(m); if(glow) disposeMesh(glow);
        for(let i=0;i<(o.split != null ? o.split : 3);i++){
          const f = new THREE.Mesh(_rockGeo, mat);
          f.scale.setScalar(rad*(0.24+Math.random()*0.24));
          f.position.copy(to).setY(rad*0.3);
          scene.add(f);
          const vx = (Math.random()-.5)*4.5, vz = (Math.random()-.5)*4.5, vy = 2.2+Math.random()*2.4;
          const fy = f.position.y;
          let vy2 = vy, px = f.position.x, py = fy, pz = f.position.z;
          addUpdate({ t:0, update(dt2){
            this.t += dt2;
            vy2 -= 16*dt2;
            px += vx*dt2; py += vy2*dt2; pz += vz*dt2;
            if(py < 0.08){ py = 0.08; vy2 *= -0.3; }
            f.position.set(px, py, pz);
            f.rotation.x += dt2*5; f.rotation.z += dt2*4;
            if(this.t > 1.6){
              scene.remove(f); this.dead = true;
            }
          }});
        }
        BFX.shock(to, rad*3.2, { color: o.glow != null ? o.glow : 0xffb070, dur:.42, a0:.8 });
        BFX.burst(V3(to.x, .12, to.z), 14, { tex:'smoke', sp: 2.6, s0:.9, s1:1.5, a0:.5, grav:-1.2, drag:2.4, r:.6,g:.58,b:.55 });
        BFX.decal({ x: to.x, z: to.z, tex:'scorch', r: rad*2.6, life: 4.2 });
        shake(rad*0.5, .22);
        this.dead = true;
      }
    }});
  };

  /* ---------- 6.6 剑影（从天上落下、插地停留） ----------
     o = { from, to, s, color, life, stick, tilt } */
  BFX.blade = function(o){
    const from = o.from.clone();
    const to = o.to.clone();
    const s = o.s != null ? o.s : 1;
    const c = o.color != null ? o.color : 0xfff0c0;
    const m = vplane(TEX.blade, c, .95);
    m.scale.set(0.72*s, 2.0*s, 1);
    m.position.copy(from);
    // 朝向：绕 Y 转一个固定角，像一把真插在地上的剑，而不是永远正对相机
    const yaw = o.yaw != null ? o.yaw : (Math.random()*6.283);
    m.rotation.y = yaw;
    const dur = o.fall != null ? o.fall : .34;

    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/dur);
      const e = Math.pow(k, 2.2);
      m.position.y = from.y + (to.y - from.y)*e;
      m.material.opacity = .95 * Math.min(1, k*6);
      if(Math.random() < dt*30){
        BFX.spr(m.position.x, m.position.y + 0.7*s, m.position.z, {
          tex:'spark', vy:-1.2, life:.3, s0:.20*s, a0:.55, r:1,g:.92,b:.66
        });
      }
      if(k >= 1){
        if(o.stick !== false){
          const stuck = Math.max(.35, m.position.y + 1.0*s);   // 剑尖扎进地面
          m.position.y = stuck;
          const stick = o.stickS != null ? o.stickS : (o.stick === true ? 1.4 : o.stick);
          addUpdate({ t:0, update(dt2){
            this.t += dt2;
            if(this.t > stick){
              m.material.opacity = Math.max(0, .95*(1 - (this.t-stick)/0.28));
              if(this.t > stick + 0.28){ disposeMesh(m); this.dead = true; }
            }
          }});
        }else{
          disposeMesh(m);
        }
        BFX.shock(V3(to.x, 0, to.z), 0.9*s, { color:c, dur:.3, a0:.55 });
        BFX.burst(V3(to.x, .1, to.z), 5, { tex:'spark', sp:2.2, s0:.18*s, a0:.6, r:1,g:.94,b:.7 });
        this.dead = true;
      }
    }});
    return m;
  };

  /* ---------- 6.7 冲击墙（立起来的环，向外推） ----------
     o = { x, z, r0, r1, h, color, dur, thick } */
  const _shellGeo = new THREE.CylinderGeometry(1, 1, 1, 44, 1, true);
  _shellGeo.userData.shared = true;
  BFX.wave = function(o){
    const x = o.x || 0, z = o.z || 0;
    const r0 = o.r0 != null ? o.r0 : .6;
    const r1 = o.r1 != null ? o.r1 : 4;
    const hh = o.h != null ? o.h : 1.5;
    const dur = o.dur != null ? o.dur : .6;
    const c = o.color != null ? o.color : 0xffd8a0;
    const mat = new THREE.MeshBasicMaterial({ map:TEX.column, color:c, transparent:true, opacity:.9,
      blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false });
    const m = new THREE.Mesh(_shellGeo, mat);
    m.position.set(x, hh*0.42, z);
    m.renderOrder = 6;
    scene.add(m);
    const inner = new THREE.Mesh(_shellGeo, new THREE.MeshBasicMaterial({ color:0xffffff,
      transparent:true, opacity:.28, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
      depthWrite:false, fog:false }));
    inner.renderOrder = 6; inner.position.copy(m.position);
    scene.add(inner);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/dur);
      const e = 1 - Math.pow(1-k, 2.2);
      const r = r0 + (r1-r0)*e;
      m.scale.set(r, hh*(0.7+0.3*e), r);
      inner.scale.set(r*0.985, hh*0.9*(0.7+0.3*e), r*0.985);
      mat.opacity = .9*(1-k);
      inner.material.opacity = .28*(1-k);
      m.position.y = hh*0.42;
      if(k >= 1){ disposeMesh(m); disposeMesh(inner); this.dead = true; }
    }});
  };

  /* ---------- 6.8 贴花（焦痕 / 裂纹 / 霜 / 毒斑 / 蛛网 / 法阵） ---------- */
  const DECALS = [];
  const DECAL_MAX = 22;
  BFX.decal = function(o){
    const map = {
      crack: TEX.crack, scorch: TEX.scorch, frost: TEX.frost,
      poison: TEX.poison, web: TEX.web, rune: TEX.rune
    }[o.tex || 'crack'];
    const add = o.blend ? o.blend === 'add' : (o.tex === 'frost' || o.tex === 'poison' ||
                                              o.tex === 'web' || o.tex === 'rune');
    const life = o.life != null ? o.life : 4;
    const m = flatMesh(map, o.color != null ? o.color : 0xffffff,
      add ? THREE.AdditiveBlending : THREE.NormalBlending,
      o.a0 != null ? o.a0 : (add ? .55 : .9));
    m.position.set(o.x || 0, o.y != null ? o.y : .045, o.z || 0);
    m.scale.setScalar((o.r != null ? o.r : 2) * 2);
    if(o.rot) m.rotation.z = o.rot;
    m.renderOrder = 2;
    m.material.depthWrite = false;
    const item = { m, t:0, life };
    DECALS.push(item);
    while(DECALS.length > DECAL_MAX){
      const old = DECALS.shift();
      disposeMesh(old.m);
    }
    addUpdate({ update(dt){
      item.t += dt;
      const k = item.t/item.life;
      if(k > .7) m.material.opacity *= (1 - (k-.7)/.3);
      if(k >= 1){
        const i = DECALS.indexOf(item); if(i >= 0) DECALS.splice(i,1);
        disposeMesh(m); this.dead = true;
      }
    }});
    return m;
  };

  /* ---------- 6.9 魂丝 / 治疗链（有宽度的管，不是 1px 线） ---------- */
  BFX.ribbon = function(o){
    const from = o.from.clone(), to = o.to.clone();
    const c = o.color != null ? o.color : 0xb48cff;
    const thick = o.thick != null ? o.thick : .07;
    const life = o.life != null ? o.life : .8;
    const pts = [];
    const segs = 6;
    const sag = o.sag != null ? o.sag : .5;
    const wob = o.wobble != null ? o.wobble : .18;
    for(let i=0;i<=segs;i++){
      const k = i/segs;
      const p = from.clone().lerp(to, k);
      p.y += Math.sin(k*Math.PI) * sag;
      p.x += (Math.random()-.5)*wob;
      p.z += (Math.random()-.5)*wob;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 22, thick, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.95,
      blending:THREE.AdditiveBlending, depthWrite:false, fog:false });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 7;
    scene.add(m);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = this.t/life;
      mat.opacity = .95*Math.min(1, (1-k)*2.4);
      m.scale.setScalar(1 + k*0.06);
      // 沿丝流动的光点
      if(Math.random() < dt*24){
        const u = Math.random();
        const p = curve.getPoint(u);
        BFX.spr(p.x, p.y, p.z, { tex:'soft', life:.3, s0:.16, a0:.9, r:.8,g:.6,b:1 });
      }
      if(k >= 1){ disposeMesh(m); this.dead = true; }
    }});
    return m;
  };

  /* ---------- 6.10 立起来的弧刃（横斩 / 巨刀） ---------- */
  BFX.arcSlash = function(o){
    const x = o.x || 0, z = o.z || 0, y = o.y != null ? o.y : 1.2;
    const r = o.r != null ? o.r : 2.4;
    const span = o.span != null ? o.span : Math.PI*0.9;
    const c = o.color != null ? o.color : 0xfff0c0;
    const life = o.life != null ? o.life : .34;
    const sweep = o.sweep != null ? o.sweep : 1;
    const geo = new THREE.RingGeometry(r*0.55, r, 48, 1, -span/2, span);
    const mat = new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.92,
      blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = (o.yaw || 0);
    m.rotation.x = (o.tiltX || 0);
    m.renderOrder = 7;
    scene.add(m);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = this.t/life;
      m.rotation.z = -span/2*sweep + span*sweep*k;
      mat.opacity = .92*(1-k);
      m.scale.setScalar(1 + k*0.16);
      if(k >= 1){ disposeMesh(m); this.dead = true; }
    }});
    return m;
  };

  /* ---------- 6.9 「活物」原语 ----------
     上面 6.1~6.8 全是**一次性**的：画一下、爆一下、消失。45 招全靠那几样，
     画面上必然是同一个模子 —— 地上一个圈 → 等 → 爆一下 → 没了。
     这一组是另一类：**留在场上，而且自己会动。**

       trail   一根会生长的带子     藤蔓 / 骨线 / 剑气轨迹 / 裂纹 / 锁链
       entity  一个会走的实体       犬群 / 虫群 / 滚石 / 骨手 / 追命的东西
       pool    一块持续存在的地面   毒 / 火 / 水 / 镜面 / 骷髅地
       beam    两点之间的持续光带   引魂索 / 牵引线 / 雷链
       wall    一面朝一个方向推的墙 火墙 / 气墙 / 骨墙

     它们**不懂 Boss、也不知道伤害** —— 只负责"在场上、会动"。判定由各只
     自己的 onTouch / onTick 写。这是原语该有的样子：不认识使用者。 */

  /* 生长折线带：节点自己喂，几何每帧重建。 */
  BFX.trail = function(o){
    o = o || {};
    const MAXP = Math.max(2, o.max || 96);
    const c = o.color != null ? o.color : 0xffffff;
    const w0 = o.w != null ? o.w : .45;
    const y = o.y != null ? o.y : .08;
    const tex = o.tex || TEX.soft;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 6);
    const uvs = new Float32Array(MAXP * 4);
    const idx = [];
    for(let i=0;i<MAXP-1;i++){
      const a = i*2, b = i*2+1, cc = i*2+2, d = i*2+3;
      idx.push(a, b, cc, b, d, cc);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: c, transparent: true,
      opacity: o.opacity != null ? o.opacity : .95, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    scene.add(mesh);

    const pts = [];
    let dirty = true;
    function rebuild(){
      const n = pts.length;
      if(n < 2){ geo.setDrawRange(0, 0); return; }
      for(let i=0;i<n;i++){
        const p = pts[i];
        const prev = pts[Math.max(0, i-1)], next = pts[Math.min(n-1, i+1)];
        let dx = next.x - prev.x, dz = next.z - prev.z;
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        /* 宽度沿线收：尾巴细、头粗 —— 一眼看出"往哪长" */
        const k = i/(n-1);
        const w = w0 * (o.growTip === false ? 1 : (.25 + .75*k));
        const lx = -dz*w, lz = dx*w;
        const j = i*6;
        pos[j]   = p.x - lx; pos[j+1] = y + (p.y || 0); pos[j+2] = p.z - lz;
        pos[j+3] = p.x + lx; pos[j+4] = y + (p.y || 0); pos[j+5] = p.z + lz;
        uvs[i*4]   = 0; uvs[i*4+1] = k;
        uvs[i*4+2] = 1; uvs[i*4+3] = k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
      geo.setDrawRange(0, (n-1)*6);
    }

    const api = {
      mesh, mat, pts,
      /* 往后接一个节点（地面坐标） */
      push(x, z, yy){ pts.push({ x, z, y: yy || 0 }); if(pts.length > MAXP) pts.shift(); dirty = true; return api; },
      /* 从某点开始追目标，返回新的头 */
      head(){ return pts[pts.length-1]; },
      count(){ return pts.length; },
      clear(){ pts.length = 0; rebuild(); },
      setOpacity(v){ mat.opacity = v; },
      kill(){
        scene.remove(mesh); geo.dispose(); mat.dispose();
        /* 重建 updater 也必须一起死。第一版只删了 mesh —— 45 只里用过 trail 的
         * 每一只都漏一个 updater（实测 7 只），放十几招之后 `updaters` 只增不减。 */
        rebuildU.dead = true;
      },
      /* 淡出再删。藤蔓 / 裂缝 收场不该"啪"一下消失，也不该永远留着 */
      fade(sec){
        const s = sec != null ? sec : .9, o0 = o.opacity != null ? o.opacity : .95;
        const u = addUpdate({ t:0, update(dt){
          this.t += dt;
          const k = Math.min(1, this.t / s);
          mat.opacity = o0 * (1 - k);
          if(k >= 1){ api.kill(); this.dead = true; }
        }});
        return u;
      },
      /* 尾巴往回缩（"收回去"的藤蔓 / 退掉的裂纹） */
      retract(){
        const u = addUpdate({ t:0, update(dt){
          this.t += dt;
          if(this.t > .045){ this.t = 0; pts.shift(); dirty = true; }
          if(pts.length < 2){ api.kill(); this.dead = true; }
        }});
        return u;
      }
    };
    const rebuildU = addUpdate({ update(){ if(dirty){ rebuild(); dirty = false; } }});
    return api;
  };

  /* 会走的实体：每帧朝 target 走，贴到就 onTouch。 */
  BFX.entity = function(o){
    o = o || {};
    const size = o.size != null ? o.size : 1.1;
    const c = o.color != null ? o.color : 0xffd0a0;
    const speed = o.speed != null ? o.speed : 4.2;
    const life = o.life != null ? o.life : 6;
    const body = billMesh(o.tex || TEX.ember, c, o.opacity != null ? o.opacity : .96);
    body.position.set(o.x || 0, size * .55, o.z || 0);
    body.scale.setScalar(size);
    const sh = flatMesh(TEX.soft, c, THREE.AdditiveBlending, .5);
    sh.position.set(o.x || 0, .06, o.z || 0);
    sh.scale.setScalar(size * 1.5);
    const e = {
      x: o.x || 0, z: o.z || 0, dead: false,
      body, shadow: sh,
      target: o.target || (()=>ACT.player.pos),
      kill(){
        scene.remove(body); scene.remove(sh);
        body.material.dispose(); sh.material.dispose();
        e.dead = true;
      }
    };
    let t = 0, cd = 0, bob = Math.random() * 6;
    addUpdate({ update(dt){
      t += dt; bob += dt * 9;
      /* 外部 kill() 过就直接收 updater，别对着已经删掉的 mesh 继续写位置 */
      if(e.dead || t > life){ e.kill(); this.dead = true; return; }
      const tg = e.target();
      let dx = tg.x - e.x, dz = tg.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      /* 近了就减速，不要穿过玩家 */
      const step = Math.min(d, speed * dt);
      if(d > .05){ e.x += dx / d * step; e.z += dz / d * step; }
      body.position.set(e.x, size * .55 + Math.sin(bob) * .07, e.z);
      sh.position.set(e.x, .06, e.z);
      const fade = t > life - .5 ? Math.max(0, life - t) / .5 : 1;
      body.material.opacity = (o.opacity != null ? o.opacity : .96) * fade;
      sh.material.opacity = .5 * fade;
      cd -= dt;
      if(cd <= 0 && d < size * .75 + .55){
        cd = o.hitEvery != null ? o.hitEvery : .45;
        if(o.onTouch) o.onTouch(e);
      }
      if(o.onFrame) o.onFrame(e, dt);
    }});
    return e;
  };

  /* 持续存在的一块地面：会扩、会缩、会跟着人走。 */
  BFX.pool = function(o){
    o = o || {};
    const c = o.color != null ? o.color : 0x66cc88;
    const life = o.life != null ? o.life : 5;
    const R0 = o.r != null ? o.r : 3;
    const m = flatMesh(o.tex || TEX.poison, c, THREE.AdditiveBlending, o.opacity != null ? o.opacity : .55);
    const x0 = o.x || 0, z0 = o.z || 0;
    m.position.set(x0, .05, z0); m.scale.setScalar(R0 * 2); m.renderOrder = 2;
    /* 外部写 `pool.dead = true` 是**想让它收场**的意思，updater 必须认这个字段。
     * 第一版没认：调用方（水位）写了 `water.dead = true`，水面照样活满 8 秒 ——
     * 看起来像泄漏，其实是这个标志没人读。 */
    const st = { x: x0, z: z0, r: R0, dead: false, kill(){ st.dead = true; } };
    const every = o.tick != null ? o.tick : .5;
    let t = 0, acc = every;
    addUpdate({ update(dt){
      t += dt;
      if(st.dead || t > life){
        scene.remove(m); m.material.dispose();
        st.dead = true; this.dead = true; return;
      }
      const k = Math.min(1, t / life);
      st.r = o.grow ? o.grow(k, R0) : R0 * (k < .15 ? .2 + k / .15 * .8 : 1);
      if(o.follow){
        const p = o.follow();
        st.x = p.x; st.z = p.z;
      }
      m.position.set(st.x, .05 + (o.rise ? o.rise * k : 0), st.z);
      m.scale.setScalar(st.r * 2);
      const fin = Math.min(1, t / .35);
      const fout = k > .82 ? (1 - k) / .18 : 1;
      m.material.opacity = (o.opacity != null ? o.opacity : .55) * fin * fout;
      acc += dt;
      if(acc >= every){
        acc = 0;
        if(o.onTick) o.onTick(st, dt);
      }
    }});
    return st;
  };

  /* 两点之间的持续带子：A、B 都是函数，每帧重算 —— 所以能"跟着人"。 */
  BFX.beam = function(o){
    o = o || {};
    const c = o.color != null ? o.color : 0xffffff;
    const w = o.w != null ? o.w : .32;
    const life = o.life != null ? o.life : 1.6;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(4 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const uv = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mat = new THREE.MeshBasicMaterial({ map: o.tex || TEX.soft, color: c, transparent: true,
      opacity: o.opacity != null ? o.opacity : .9, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 6;
    scene.add(mesh);
    const A = o.a || (()=>ACT.boss.pos), B = o.b || (()=>ACT.player.pos);
    const y = o.y != null ? o.y : .8;
    let t = 0, gone = false;
    const cleanup = ()=>{ if(gone) return; gone = true; scene.remove(mesh); geo.dispose(); mat.dispose(); };
    const u = addUpdate({ update(dt){
      t += dt;
      if(gone || t > life){ cleanup(); this.dead = true; return; }
      const a = A(), b = B();
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1;
      const lx = -dz / L * w, lz = dx / L * w;
      pos[0] = a.x - lx; pos[1] = y; pos[2] = a.z - lz;
      pos[3] = a.x + lx; pos[4] = y; pos[5] = a.z + lz;
      pos[6] = b.x - lx; pos[7] = y; pos[8] = b.z - lz;
      pos[9] = b.x + lx; pos[10] = y; pos[11] = b.z + lz;
      geo.attributes.position.needsUpdate = true;
      /* 抖动：一条死直的线读不出"有力量在拉" */
      mat.opacity = (o.opacity != null ? o.opacity : .9) * (.78 + .22 * Math.sin(t * 26));
      if(o.onTick) o.onTick(t, dt, a, b);
    }});
    mesh.kill = ()=>{ cleanup(); u.dead = true; };
    return mesh;
  };

  /* 一面朝法线方向推的墙：整条线一起走，走到头才死。 */
  BFX.wall = function(o){
    o = o || {};
    const c = o.color != null ? o.color : 0xff7a3c;
    const len = o.len != null ? o.len : 22;
    const th = o.th != null ? o.th : .9;
    const ang = o.angle || 0;          // 墙的朝向（沿这条线）
    const from = o.from != null ? o.from : 14;
    const to = o.to != null ? o.to : -14;
    const speed = o.speed != null ? o.speed : 5;
    const x0 = o.x || 0, z0 = o.z || 0;
    const off = o.off || 0;            /* 沿墙线方向的横向偏移：用来留缺口 */
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: o.tex || TEX.soft, color: c, transparent: true,
      opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ang;
    m.renderOrder = 5;
    scene.add(m);
    /* 前沿亮线：墙体和"墙到哪了"分开画，否则一条渐变带读不出推进 */
    const edge = flatMesh(TEX.ring, c, THREE.AdditiveBlending, .9);
    edge.rotation.x = -Math.PI / 2;
    edge.rotation.z = ang;
    scene.add(edge);
    let d = from, t = 0, gone = false;
    const nx = Math.sin(ang), nz = Math.cos(ang);      // 墙法线（推进方向）
    const cleanup = ()=>{
      if(gone) return;
      gone = true;
      scene.remove(m); geo.dispose(); mat.dispose();
      scene.remove(edge); edge.material.dispose();
    };
    const u = addUpdate({ update(dt){
      t += dt;
      d -= speed * dt;
      if(gone || d < to || t > (o.life != null ? o.life : 8)){
        cleanup();
        this.dead = true; return;
      }
      const cx = x0 + nx * d + Math.cos(ang) * off, cz = z0 + nz * d - Math.sin(ang) * off;
      m.position.set(cx, .5, cz);
      m.scale.set(len, th, 1);
      edge.position.set(cx, .09, cz);
      edge.scale.set(len * 1.02, th * 2.6, 1);
      if(o.onTick) o.onTick(cx, cz, ang, len, th, dt);
    }});
    /* 之前这里是个**什么都不做**的 `kill()`（注释写着"由自身生命周期结束"）。
     * 调用方（剑气潮）真去 kill 的时候，墙还在往前推。假的接口比没有更坏。 */
    return { kill(){ cleanup(); u.dead = true; }, get pos(){ return { x: x0 + nx * d, z: z0 + nz * d }; } };
  };

  /* ---------- 形状归一 ---------- */
  function normShape(h){
    if(h.shape === 'line') return 'rect';
    if(h.shape === 'fan' || h.shape === 'cone') return 'sector';
    return h.shape;
  }

  /* ---------------- 生命周期 ---------------- */
  function bind(sc, cam, rd) {
    if (sc && root.parent !== sc) sc.add(root);
    if (cam) camera = cam;
    if (rd) { renderer = rd; updatePointScale(); }
    return FX2;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    /* 一帧最多推进 0.05 秒：切后台回来 / 卡一下的 dt 可能是好几秒，
     * 直接喂给 updater 会让「0.16 秒扫完的刀」一瞬间闪完，看不见。 */
    dt = Math.min(dt, 0.05);
    TIME.dt = dt;
    TIME.t += dt;
    for (const k in POOLS) POOLS[k].update(dt);
    for (let i = 0; i < updaters.length; i++) {
      const u = updaters[i];
      if (!u.dead) u.update(dt);
    }
    pruneUpdates();
    if (camera && _billList.length) {
      for (let i = _billList.length - 1; i >= 0; i--) {
        const m = _billList[i];
        if (!m.parent) { _billList.splice(i, 1); continue; }
        m.quaternion.copy(camera.quaternion);
      }
    }
  }

  function clear() {
    for (const u of updaters) {
      if (typeof u.kill === 'function') { try { u.kill(); } catch (e) { } }
      u.dead = true;
    }
    updaters.length = 0;
    for (const k in POOLS) {
      const P = POOLS[k];
      P.p.forEach(p => { p.live = false; });
      P.alive = 0;
      P.update(0.001);
    }
    /* 灯和粒子缓冲**不拆**：它们是长期槽位，拆了之后再也回不来 ——
     * 灯不在场景图里就不出光；Points 缓冲从场景移走后不再渲染，而 POOLS 是缓存的，
     * 谁也想不到要重建它。表现是「换一次图之后，所有粒子永久消失」。 */
    const keep = [];
    /* 必须遍历**副本**：disposeMesh 内部会调 scene.remove，
     * 而那个 remove 会把这一项从 _live 里 splice 掉 —— 一边遍历一边删，
     * 后面那几件就被跳过了（实测：4 件里只清掉 2 件，剩下的永远留在场上）。 */
    for (const m of _live.slice()) {
      if (m.isLight || m.isPoints) { keep.push(m); continue; }
      root.remove(m);
      disposeMesh(m);
    }
    _live.length = 0;
    for (const m of keep) _live.push(m);
    _billList.length = 0;
    DECALS.length = 0;
    TIME.t = 0;
  }

  function stats() {
    /* 数**真活着**的，不数缓存：Pool.alive 是上一帧算的，
     * 刚 spawn 完读它永远是 0，会让人以为「放了但没出」。同理 updaters 里
     * 还躺着已 dead 等 prune 的，直接读 length 会虚高。 */
    let n = 0;
    for (const k in POOLS) { const P = POOLS[k].p; for (let i = 0; i < P.length; i++) if (P[i].live) n++; }
    let u = 0;
    for (let i = 0; i < updaters.length; i++) if (!updaters[i].dead) u++;
    return { particles: n, updaters: u, meshes: _live.length, billboards: _billList.length };
  }

  /* ---------------- 导出 ---------------- */
  return Object.assign(BFX, {
    bind, update, clear, stats,
    actors: ACT,
    tex: TEX,
    get shake() { return _shake; },
    set shake(f) { _shake = f; },
    get zoneOn() { return ZONE_ON; },
    set zoneOn(v) { ZONE_ON = !!v; },
    get time() { return TIME.t; },
    delay, seq,
  });
})();
