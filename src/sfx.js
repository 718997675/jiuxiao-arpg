/* ============================================================
 * SFX —— 玩家侧技能演出（37 只技能的整套画法）
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = `docs/vfx-playground.html`（那边 37 只技能可以一只一只真放一遍看）
 *   重新生成：`node dev/build-skillvfx.js --write`；只检查是否过期：`--check`
 *
 * ---------------- 为什么是生成物 ----------------
 * 这一轮「技能重构特效没替换」的根因就是：实验室里调好的效果，和游戏里跑的是
 * 两份互不相干的代码（实验室自绘一套 FX，游戏读 data-vfx 的配方）。
 * 手抄一份进 src/ 一定还会走散，所以：**实验室是唯一的源**。
 *
 * ---------------- 和配方层（data-vfx / vfx.js）的分工 ----------------
 *   data-vfx.js + vfx.js —— 「形色时分离」的 15 条剪影 × 6 元素，覆盖 15 个功能位
 *   sfx.js（本文件）     —— 37 只技能的**逐只手搓实现**，能表达配方表达不了的东西
 *                          （斧头同水平面、尾焰是水平扇形、蛛网单点放射…）
 * 接线口径在 game.js 的 playSkillVfx：**sfx 有就播 sfx，没有才回落到配方**。
 * 这样 37 只全部走新实现，而秘技 / 没有手搓实现的技能仍然有配方兜底。
 *
 * ---------------- 宿主怎么接（只有四件事） ----------------
 *   SKFX.bind(scene, camera, renderer)      开局一次
 *   SKFX.sync(playerPos, face, enemies, playerBody, playerRing)  每帧
 *   SKFX.update(dt)                         每帧（dt 是**秒**）
 *   SKFX.play(key, ctx)                     放一招；ctx = { x, z, aim, dir, tx, tz }
 *   SKFX.clear()                            换图 / 重开
 *
 * ---------------- 三条纪律（跟 fx2.js 同源） ----------------
 * 1. 不逐帧 new：颜色 / 向量有缓存，粒子池创建时分配好。
 * 2. 材质按需建、随 mesh 释放；共享几何体打 userData.shared 不释放。
 * 3. 所有 mesh 挂在 SFX 自己的 Group 下 —— clear() 才可能真清干净。
 * ============================================================ */
'use strict';

const SKFX = (function () {
  /* ---------------- 宿主 ---------------- */
  let REN = null;
  let CAM = null;
  const ROOT = new THREE.Group();
  ROOT.name = 'sfx';

  /* 抽出来的代码写的是 ROOT.add(...)，但 clear() 还得知道都加了什么，
   * 否则只能清 updater，mesh 会永远留在场上（fx2 踩过一次）。 */
  const _live = [];
  const _rootAdd = ROOT.add.bind(ROOT);
  const _rootRemove = ROOT.remove.bind(ROOT);
  ROOT.add = function (o) { _rootAdd(o); if (!o.userData.shared && _live.indexOf(o) < 0) _live.push(o); return o; };
  ROOT.remove = function (o) { _rootRemove(o); const i = _live.indexOf(o); if (i >= 0) _live.splice(i, 1); return o; };

  /* 每帧由 sync() 填。实验室里这三样是模块级全局，游戏里必须由外面喂进来。 */
  const ACT = {
    player: { pos: new THREE.Vector3(), face: 0, moving: 0, target: new THREE.Vector3() },
    playerBody: null,
    playerRing: null,
    enemies: []
  };

  /* 实验室的 now（秒，单调递增）。技能实现里有几处用它算相位。 */
  let now = 0;

  /* 实验室的几样「演示状态」。技能代码会读它们：
   *   tierOn(n)          —— 台阶：「到了这一级才画」
   *   playerHP / avatarOn —— 回血与法相窗口
   * 游戏里这些状态都有自己的出处（Game.skillLevel / Game.hp / 法相窗口计时），
   * 每发 play() 时同步进来，**不在这里记账**。
   * （curElem / curElem2 由下面的「元素语言」段自带声明，不在这里重复） */
  let playerHP = 1000;      /* 只在实验室里真回血；游戏里回血由 game.js 结算 */
  let avatarOn = false;     /* 法相窗口开着没有 */
  let _curLv = 1;           /* 本发技能的等级（tierOn 读它） */
  let stanceIdx = 0;        /* 刀式（0 斩锋 / 1 镇岳 / 2 摧城），由 Game.bladeStance() 同步 */
/* ===== 程序化贴图 ===== */
/* =====================================================================
   1. 程序化贴图（不引入任何素材文件）
   ===================================================================== */
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

// 柔光
TEX.soft = cv(128,128,(g,w,h)=>{ radial(g,w,h,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.72)'],[.55,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]); });

// 四芒星火花
TEX.spark = cv(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const c=w/2;
  const lg=g.createLinearGradient(0,c,w,c);
  lg.addColorStop(0,'rgba(255,255,255,0)');lg.addColorStop(.5,'rgba(255,255,255,1)');lg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=lg; g.fillRect(0,c-2.2,w,4.4);
  const lg2=g.createLinearGradient(c,0,c,h);
  lg2.addColorStop(0,'rgba(255,255,255,0)');lg2.addColorStop(.5,'rgba(255,255,255,1)');lg2.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=lg2; g.fillRect(c-2.2,0,4.4,h);
  radial(g,w,h,[[0,'rgba(255,255,255,.95)'],[.18,'rgba(255,255,255,.45)'],[1,'rgba(255,255,255,0)']]);
});

// 火星 / 余烬
TEX.ember = cv(64,64,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  radial(g,w,h,[[0,'rgba(255,255,255,1)'],[.3,'rgba(255,236,190,.9)'],[.62,'rgba(255,180,90,.28)'],[1,'rgba(255,120,40,0)']]);
});

// 烟团
TEX.smoke = cv(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<16;i++){
    const a=Math.random()*Math.PI*2, d=Math.random()*w*0.22;
    const x=w/2+Math.cos(a)*d, y=h/2+Math.sin(a)*d;
    const r=w*(0.16+Math.random()*0.2);
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,'rgba(255,255,255,.16)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
  radial(g,w,h,[[.3,'rgba(255,255,255,.22)'],[1,'rgba(255,255,255,0)']]);
});

// 冰晶碎片
TEX.shard = cv(96,96,(g,w,h)=>{
  g.clearRect(0,0,w,h); const c=w/2;
  g.translate(c,c);
  g.beginPath();
  for(let i=0;i<6;i++){ const a=-Math.PI/2+i*Math.PI/3, r=i%2?w*0.3:w*0.44;
    i?g.lineTo(Math.cos(a)*r,Math.sin(a)*r):g.moveTo(Math.cos(a)*r,Math.sin(a)*r); }
  g.closePath();
  const gr=g.createLinearGradient(0,-c,0,c);
  gr.addColorStop(0,'rgba(255,255,255,.98)'); gr.addColorStop(.5,'rgba(220,250,255,.5)'); gr.addColorStop(1,'rgba(160,230,255,.05)');
  g.fillStyle=gr; g.fill();
  g.strokeStyle='rgba(255,255,255,.9)'; g.lineWidth=2; g.stroke();
});

// 细环（扩散用）
TEX.ring = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h); const c=w/2;
  g.translate(c,c);
  for(let i=0;i<3;i++){
    g.beginPath(); g.arc(0,0,c*0.80+i*2.0,0,7);
    g.strokeStyle='rgba(255,255,255,'+(0.75-i*0.22)+')';
    g.lineWidth=(9-i*2.4); g.filter='blur(2px)'; g.stroke();
  }
});

// 冲击波（硬内沿 + 外扩模糊）
TEX.shock = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h); const c=w/2; g.translate(c,c);
  const gr=g.createRadialGradient(0,0,c*0.62,0,0,c*0.98);
  gr.addColorStop(0,'rgba(255,255,255,0)');
  gr.addColorStop(.55,'rgba(255,255,255,.55)');
  gr.addColorStop(.82,'rgba(255,255,255,.95)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(0,0,c*0.98,0,7); g.fill();
});

// 刀光弧（u 沿弧长，v 沿宽度；两端渐隐）
TEX.slash = cv(256,64,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const gr=g.createLinearGradient(0,0,0,h);
  gr.addColorStop(0,'rgba(255,255,255,0)');
  gr.addColorStop(.42,'rgba(255,255,255,.35)');
  gr.addColorStop(.72,'rgba(255,255,255,1)');
  gr.addColorStop(1,'rgba(255,255,255,.85)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  g.globalCompositeOperation='destination-in';
  const gm=g.createLinearGradient(0,0,w,0);
  gm.addColorStop(0,'rgba(0,0,0,0)'); gm.addColorStop(.18,'rgba(0,0,0,1)');
  gm.addColorStop(.82,'rgba(0,0,0,1)'); gm.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gm; g.fillRect(0,0,w,h);
});

// 符文（单个）
TEX.rune = cv(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.strokeStyle='rgba(255,255,255,.95)'; g.lineWidth=6; g.lineCap='round';
  g.beginPath(); g.moveTo(44,22); g.lineTo(44,104); g.moveTo(44,60); g.lineTo(86,22);
  g.moveTo(44,60); g.lineTo(86,100); g.stroke();
  g.beginPath(); g.arc(64,64,52,0,7); g.strokeStyle='rgba(255,255,255,.28)'; g.lineWidth=3; g.stroke();
});

// 领域法阵（带符文的双环）
TEX.sigil = cv(512,512,(g,w,h)=>{
  const c=w/2; g.translate(c,c); g.clearRect(-c,-c,w,h);
  g.strokeStyle='rgba(255,255,255,.9)';
  g.lineWidth=3; g.beginPath(); g.arc(0,0,c*0.94,0,7); g.stroke();
  g.lineWidth=1.6; g.beginPath(); g.arc(0,0,c*0.86,0,7); g.stroke();
  g.beginPath(); g.arc(0,0,c*0.52,0,7); g.stroke();
  g.lineWidth=2.2;
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2;
    g.save(); g.rotate(a); g.translate(0,-c*0.72);
    if(i%2===0){ g.beginPath(); g.moveTo(-7,0); g.lineTo(0,-11); g.lineTo(7,0); g.stroke(); }
    else { g.beginPath(); g.arc(0,0,3.4,0,7); g.stroke(); }
    g.restore();
  }
  g.lineWidth=2.6;
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2, b=(i+2)/6*Math.PI*2;
    g.beginPath(); g.moveTo(Math.cos(a)*c*0.52,Math.sin(a)*c*0.52);
    g.lineTo(Math.cos(b)*c*0.52,Math.sin(b)*c*0.52); g.stroke();
  }
  radial(g,w,h,[[.4,'rgba(255,255,255,.10)'],[.92,'rgba(255,255,255,.03)'],[1,'rgba(255,255,255,0)']]);
});

// 太极双鱼
TEX.taiji = cv(512,512,(g,w,h)=>{
  const c = w*0.5, R = c*0.86;
  g.clearRect(0,0,w,h);
  g.translate(c,c);

  /* 暗鱼身打底（低亮度 = 染色后呈深色） */
  g.fillStyle = 'rgba(255,255,255,.17)';
  g.beginPath(); g.arc(0,0,R,0,Math.PI*2); g.fill();

  /* 亮鱼身：外圆左半 → 下方小圆左半 → 上方小圆右半
     这三段拼起来正好是标准太极的 S 分界线，左右各占一半面积 */
  g.beginPath();
  g.arc(0, 0, R, -Math.PI*0.5, Math.PI*0.5, true);                 // (0,-R) → 左 → (0,R)
  g.arc(0, R*0.5, R*0.5, Math.PI*0.5, -Math.PI*0.5, false);         // (0,R) → 右 → (0,0)
  g.arc(0, -R*0.5, R*0.5, Math.PI*0.5, -Math.PI*0.5, true);         // (0,0) → 左 → (0,-R)
  g.closePath();
  const lg = g.createLinearGradient(-R, -R*0.45, R*0.6, R*0.6);
  lg.addColorStop(0,   'rgba(255,255,255,.96)');
  lg.addColorStop(.55, 'rgba(255,255,255,.86)');
  lg.addColorStop(1,   'rgba(255,255,255,.70)');
  g.fillStyle = lg; g.fill();

  /* 暗鱼眼：先挖洞，再补一层极暗实心，保证在亮鱼身上清清楚楚 */
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(0, -R*0.5, R*0.145, 0, Math.PI*2); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.beginPath(); g.arc(0, -R*0.5, R*0.105, 0, Math.PI*2); g.fill();

  /* 亮鱼眼：画在暗鱼身的小圆中心 */
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.arc(0, R*0.5, R*0.13, 0, Math.PI*2); g.fill();

  /* 外圈双线 + 卦位节点 */
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3.4;
  g.beginPath(); g.arc(0,0,R,0,Math.PI*2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(0,0,R*0.955,0,Math.PI*2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.8;
  for(let i=0;i<8;i++){
    const a = i/8*Math.PI*2 + Math.PI/8;
    const px = Math.cos(a)*R*0.985, py = Math.sin(a)*R*0.985;
    g.beginPath(); g.arc(px, py, 5.5, 0, Math.PI*2); g.stroke();
    g.beginPath(); g.moveTo(Math.cos(a)*R*0.90, Math.sin(a)*R*0.90);
    g.lineTo(px - Math.cos(a)*9, py - Math.sin(a)*9); g.stroke();
  }
});




// 佛光光环：放射光线 + 两圈环，中心留空（要套在角色身上，不能糊住人）
TEX.halo = cv(512,512,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const c = w*0.5, R = c*0.96;
  const n = 34;
  for(let i=0;i<n;i++){
    const a = i/n*Math.PI*2;
    const r0 = c*0.40, r1 = R*(i%2 ? 0.84 : 0.98);
    const lg = g.createLinearGradient(
      c+Math.cos(a)*r0, c+Math.sin(a)*r0,
      c+Math.cos(a)*r1, c+Math.sin(a)*r1);
    lg.addColorStop(0,   'rgba(255,255,255,0)');
    lg.addColorStop(0.32,'rgba(255,255,255,.42)');
    lg.addColorStop(0.78,'rgba(255,255,255,.16)');
    lg.addColorStop(1,   'rgba(255,255,255,0)');
    g.strokeStyle = lg;
    g.lineWidth = w*(i%2 ? 0.005 : 0.010);
    g.beginPath();
    g.moveTo(c+Math.cos(a)*r0, c+Math.sin(a)*r0);
    g.lineTo(c+Math.cos(a)*r1, c+Math.sin(a)*r1);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = w*0.013;
  g.beginPath(); g.arc(c,c,c*0.395,0,7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.26)'; g.lineWidth = w*0.006;
  g.beginPath(); g.arc(c,c,c*0.445,0,7); g.stroke();
  const rg = g.createRadialGradient(c,c,c*0.05,c,c,c*0.40);
  rg.addColorStop(0,  'rgba(255,255,255,.06)');
  rg.addColorStop(0.7,'rgba(255,255,255,.13)');
  rg.addColorStop(1,  'rgba(255,255,255,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(c,c,c*0.40,0,7); g.fill();
});

// 云团：多个不等大的圆叠出起伏轮廓。
// 原来的 TEX.smoke 是十几个极淡的圆，压扁后只是一片雾；
// 深色实心云必须用 NormalBlending + 这种"实"的贴图才立得住。
TEX.cloudpuff = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const cx = w*0.5, cy = h*0.52;
  for(let i=0;i<18;i++){
    const a = Math.random()*Math.PI*2;
    const d = Math.pow(Math.random(),0.6) * w*0.20;
    const x = cx + Math.cos(a)*d;
    const y = cy + Math.sin(a)*d*0.62;
    const r = w*(0.13 + Math.random()*0.13);
    const gr = g.createRadialGradient(x, y, r*0.15, x, y, r);
    gr.addColorStop(0,   'rgba(255,255,255,0.96)');
    gr.addColorStop(0.55,'rgba(255,255,255,0.74)');
    gr.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
});

// 闪电横截面：横向中亮、两边透明。
// 原来复用的是 beam（沿高度渐变的柱状贴图），映射到闪电横截面上
// 就变成"一边亮一边透明"，整条雷发灰。
TEX.boltline = cv(16,64,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const gr = g.createLinearGradient(0,0,w,0);
  gr.addColorStop(0,   'rgba(255,255,255,0)');
  gr.addColorStop(0.30,'rgba(255,255,255,0.45)');
  gr.addColorStop(0.50,'rgba(255,255,255,1)');
  gr.addColorStop(0.70,'rgba(255,255,255,0.45)');
  gr.addColorStop(1,   'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,w,h);
});
// 竖直渐变（光柱 / 领域墙）
TEX.beam = cv(32,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const gr=g.createLinearGradient(0,h,0,0);
  gr.addColorStop(0,'rgba(255,255,255,0)');
  gr.addColorStop(.12,'rgba(255,255,255,.85)');
  gr.addColorStop(.55,'rgba(255,255,255,.35)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  const gh=g.createLinearGradient(0,0,w,0);
  gh.addColorStop(0,'rgba(0,0,0,0)'); gh.addColorStop(.5,'rgba(0,0,0,1)'); gh.addColorStop(1,'rgba(0,0,0,0)');
  g.globalCompositeOperation='destination-in'; g.fillStyle=gh; g.fillRect(0,0,w,h);
});

// 火焰：底部连成一片、向上收尖的多条舌，中间高两侧低
TEX.flame = cv(256,320,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const cx = w*0.5, baseY = h*0.995;
  const TOP = h*0.94;                    // 最高火舌离底部的距离

  /* ---------- 1) 整体轮廓：一条连续的火带，顶部用多频起伏 ----------
     一根根"细长尖塔"拼不出火：真实墙火是一整片火体，
     顶部边界不规则、有高有低，再被暗缝切成几股。 */
  const ph = [Math.random()*6.283, Math.random()*6.283, Math.random()*6.283];
  const N = 96, pts = [];
  for(let i=0;i<=N;i++){
    const u = i/N, x = u*w;
    const mid = Math.sin(u*Math.PI);                    // 中间略高，只作轻微起伏
    // 起伏要碎、不要大：中低频振幅一大就成山峰轮廓，不像火
    let n = 0.745 + 0.055*mid
          + 0.062*Math.sin(u*Math.PI*3.3 + ph[0])
          + 0.052*Math.sin(u*Math.PI*7.7 + ph[1])
          + 0.048*Math.sin(u*Math.PI*17.3 + ph[2])
          + 0.030*Math.sin(u*Math.PI*31.0 + ph[0]*1.7);
    n = Math.max(0.52, n);
    pts.push([x, baseY - TOP*n]);
  }
  g.beginPath();
  g.moveTo(0, baseY);
  pts.forEach(p => g.lineTo(p[0], p[1]));
  g.lineTo(w, baseY); g.closePath();

  const grd = g.createLinearGradient(0, baseY, 0, baseY - TOP);
  grd.addColorStop(0,    'rgba(255,253,246,1)');
  grd.addColorStop(0.09, 'rgba(255,247,216,1)');
  grd.addColorStop(0.26, 'rgba(255,208,112,0.97)');
  grd.addColorStop(0.50, 'rgba(255,154,54,0.92)');
  grd.addColorStop(0.76, 'rgba(255,104,32,0.78)');
  grd.addColorStop(1,    'rgba(255,72,20,0.40)');
  g.fillStyle = grd; g.fill();

  /* ---------- 2) 暗缝：把火带切成几股火舌 ----------
     destination-out 是"擦除"，没填到的像素保持原样，所以局部填充是安全的。
     注意若要改用 destination-in，必须每层都 fillRect 覆盖整张图。 */
  g.globalCompositeOperation = 'destination-out';
  for(let i=0;i<6;i++){
    const u = 0.12 + i*0.152 + (Math.random()-0.5)*0.040;
    const x = u*w;
    const sway = (Math.random()-0.5)*w*0.06;
    const cutH = TOP * (0.34 + Math.random()*0.26);
    const cutW = w * (0.024 + Math.random()*0.020);
    const cg = g.createLinearGradient(0, baseY - cutH, 0, baseY);
    cg.addColorStop(0,   'rgba(0,0,0,0.95)');
    cg.addColorStop(0.60,'rgba(0,0,0,0.40)');
    cg.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(x - cutW, baseY);
    g.quadraticCurveTo(x - cutW*0.85, baseY - cutH*0.55, x + sway, baseY - cutH);
    g.quadraticCurveTo(x + cutW*0.85, baseY - cutH*0.55, x + cutW, baseY);
    g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  /* ---------- 3) 白热核心：底部中央一团 ---------- */
  const core = g.createRadialGradient(cx, baseY - TOP*0.07, 0, cx, baseY - TOP*0.07, w*0.46);
  core.addColorStop(0,   'rgba(255,255,252,1)');
  core.addColorStop(0.28,'rgba(255,246,198,0.88)');
  core.addColorStop(0.60,'rgba(255,200,112,0.42)');
  core.addColorStop(1,   'rgba(255,152,64,0)');
  g.fillStyle = core;
  g.beginPath();
  g.ellipse(cx, baseY - TOP*0.06, w*0.47, TOP*0.19, 0, 0, Math.PI*2);
  g.fill();

  /* ---------- 3.5) 顶部细碎火苗 ----------
     主轮廓是一条连起来的折线，边缘像山脊剪影。
     撒一圈很细的半透明火焰上去，把这条硬边打碎。 */
  for(let i=0;i<28;i++){
    const x = Math.random()*w;
    const hh = TOP*(0.09 + Math.random()*0.26);
    const bw = w*(0.007 + Math.random()*0.013);
    const sway = (Math.random()-0.5)*w*0.05;
    const topY = baseY - TOP*(0.62 + Math.random()*0.34);
    const botY = topY + hh;
    const fg = g.createLinearGradient(0, botY, 0, topY);
    fg.addColorStop(0,   'rgba(255,176,86,0.50)');
    fg.addColorStop(0.6, 'rgba(255,120,40,0.26)');
    fg.addColorStop(1,   'rgba(255,86,26,0)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(x - bw, botY);
    g.quadraticCurveTo(x - bw*0.55, botY - hh*0.55, x + sway, topY);
    g.quadraticCurveTo(x + bw*0.55, botY - hh*0.55, x + bw, botY);
    g.closePath(); g.fill();
  }

  /* ---------- 4) 四边羽化：每层遮罩都必须覆盖整张图 ---------- */
  g.globalCompositeOperation = 'destination-in';
  const mh = g.createLinearGradient(0,0,w,0);
  mh.addColorStop(0,    'rgba(0,0,0,0)');
  mh.addColorStop(0.055,'rgba(0,0,0,1)');
  mh.addColorStop(0.945,'rgba(0,0,0,1)');
  mh.addColorStop(1,    'rgba(0,0,0,0)');
  g.fillStyle = mh; g.fillRect(0, 0, w, h);
  const mv = g.createLinearGradient(0, 0, 0, h);
  mv.addColorStop(0,    'rgba(0,0,0,0.22)');
  mv.addColorStop(0.055,'rgba(0,0,0,1)');
  mv.addColorStop(0.90, 'rgba(0,0,0,1)');
  mv.addColorStop(1,    'rgba(0,0,0,0)');
  g.fillStyle = mv; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
});
// 剑影
TEX.blade = cv(64,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const x=w/2;
  const gr=g.createLinearGradient(0,0,0,h);
  gr.addColorStop(0,'rgba(255,255,255,.15)');
  gr.addColorStop(.55,'rgba(255,255,255,.85)');
  gr.addColorStop(.9,'rgba(255,255,255,1)');
  gr.addColorStop(1,'rgba(255,255,255,.2)');
  g.fillStyle=gr;
  g.beginPath(); g.moveTo(x,6); g.lineTo(x+7,h*0.86); g.lineTo(x,h*0.94); g.lineTo(x-7,h*0.86); g.closePath(); g.fill();
  g.fillStyle='rgba(255,255,255,.95)'; g.fillRect(x-15,h*0.86,30,7);
  g.fillRect(x-4,h*0.9,8,h*0.1);
});


/* 斧（旋风斩用）：画布上缘 = 半径外侧（axon 贴图 +Y 朝外），画布左右 = 切向。
   单边斧：柄沿半径朝内，月牙刃甩向切向，刃口落在最外侧那条弧上。
   加法混合下"暗"等于不存在，所以层次只能靠 alpha：柄 .45 / 刃身 .52 /
   刃口 1.0 三档 —— 只有拉开这三档，转起来才看得出来是哪一边在切，
   否则整体糊成一块亮板（第一版就是这样，像几把锅铲）。 */
TEX.axe = cv(128,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const cx = w*0.60;

  // 柄：越靠刃座越细，柄首一头略粗
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath();
  g.moveTo(cx-8, h*0.94);
  g.lineTo(cx+8, h*0.94);
  g.lineTo(cx+5, h*0.30);
  g.lineTo(cx-5, h*0.30);
  g.closePath(); g.fill();
  // 缠绳：三道凹槽（destination-out 挖掉，加法混合里读作暗纹）
  g.globalCompositeOperation = 'destination-out';
  for(let i=0;i<3;i++) g.fillRect(cx-9, h*(0.52+i*0.11), 18, h*0.024);
  g.globalCompositeOperation = 'source-over';
  // 柄首配重
  g.fillStyle = 'rgba(255,255,255,.62)';
  g.beginPath(); g.arc(cx, h*0.925, 9, 0, 6.284); g.fill();

  // 刃身（月牙，单边）
  g.fillStyle = 'rgba(255,255,255,.52)';
  g.beginPath();
  g.moveTo(cx-3, h*0.315);
  g.quadraticCurveTo(cx-42, h*0.44, cx-57, h*0.265);   // 下缘：从刃座甩到远端
  g.quadraticCurveTo(cx-68, h*0.145, cx-44, h*0.055);  // 刃口弧：最外侧一条
  g.quadraticCurveTo(cx-24, h*0.085, cx-3, h*0.145);   // 上缘：收回刃座
  g.closePath(); g.fill();

  // 刃口高光：只描最外那条弧，宽而亮 —— 这是"在切"的唯一线索
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx-57, h*0.265);
  g.quadraticCurveTo(cx-68, h*0.145, cx-44, h*0.055);
  g.stroke();
  // 刃背一小段冷光，勾出斧头厚度
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(cx-3, h*0.315);
  g.quadraticCurveTo(cx-42, h*0.44, cx-57, h*0.265);
  g.stroke();

  // 刃座套箍
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(cx-9, h*0.275, 18, h*0.05);
  // 反侧小勾刃（让剪影不是一个光秃秃的月牙）
  g.fillStyle = 'rgba(255,255,255,.38)';
  g.beginPath();
  g.moveTo(cx+5, h*0.145);
  g.quadraticCurveTo(cx+26, h*0.10, cx+22, h*0.215);
  g.quadraticCurveTo(cx+16, h*0.29, cx+5, h*0.27);
  g.closePath(); g.fill();
});

// 符纸
TEX.paper = cv(96,192,(g,w,h)=>{
  g.fillStyle='rgba(255,240,205,.9)'; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(190,40,30,.95)'; g.lineWidth=4; g.lineCap='round';
  g.beginPath(); g.moveTo(48,26); g.lineTo(48,168); g.stroke();
  g.beginPath(); g.moveTo(30,58); g.quadraticCurveTo(48,80,66,58);
  g.moveTo(30,96); g.lineTo(66,96); g.moveTo(34,128); g.lineTo(62,128); g.stroke();
  g.strokeStyle='rgba(160,30,20,.55)'; g.lineWidth=2;
  g.strokeRect(6,6,w-12,h-12);
});

// 焦痕
TEX.scorch = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  radial(g,w,h,[[0,'rgba(0,0,0,.92)'],[.45,'rgba(12,8,6,.72)'],[.75,'rgba(20,14,10,.25)'],[1,'rgba(0,0,0,0)']]);
  g.globalCompositeOperation='destination-out';
  for(let i=0;i<26;i++){
    const a=Math.random()*7, d=Math.random()*w*0.42;
    const r=w*(0.03+Math.random()*0.07);
    g.beginPath(); g.arc(w/2+Math.cos(a)*d, h/2+Math.sin(a)*d, r,0,7); g.fill();
  }
});

// 裂纹
TEX.crack = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h); const c=w/2;
  g.strokeStyle='rgba(255,255,255,.95)'; g.lineCap='round';
  for(let i=0;i<11;i++){
    let a=i/11*7+Math.random()*0.3, x=c, y=c, len=w*0.42;
    g.beginPath(); g.moveTo(x,y);
    g.lineWidth=3.4;
    for(let s=0;s<7;s++){
      const step=len/7;
      x+=Math.cos(a)*step; y+=Math.sin(a)*step;
      a+=(Math.random()-0.5)*0.75;
      g.lineWidth*=0.78; g.lineTo(x,y);
    }
    g.stroke();
  }
});

// 霜痕
TEX.frost = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h); const c=w/2;
  radial(g,w,h,[[0,'rgba(255,255,255,.18)'],[.55,'rgba(200,240,255,.10)'],[1,'rgba(180,230,255,0)']]);
  g.strokeStyle='rgba(255,255,255,.7)'; g.lineWidth=2;
  for(let i=0;i<14;i++){
    let a=i/14*7, x=c,y=c; g.beginPath(); g.moveTo(x,y);
    for(let s=0;s<5;s++){ const st=w*0.08; x+=Math.cos(a)*st; y+=Math.sin(a)*st; a+=(Math.random()-0.5)*0.9;
      g.lineTo(x,y); g.moveTo(x,y); g.lineTo(x+Math.cos(a+1.1)*st*0.5,y+Math.sin(a+1.1)*st*0.5); g.moveTo(x,y); }
    g.stroke();
  }
});

/* 腐蚀斑（毒）：以前 `ELEMS.poison.decal = 'acid'` 是个**空指针** ——
   TEX.acid 根本没定义，`FX.decal` 里 `TEX[texName] || TEX.scorch` 一直兜底成焦痕，
   所以中毒的地面看起来跟被火烧过一样。这里补上：
   主体是叠圆形成的不规则暗斑（不能用正圆，正圆会被读成"光环"），
   中心压暗表示蚀穿，边缘一圈小亮点表示还在冒泡。 */
TEX.acid = cv(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const c = w/2;
  g.fillStyle = 'rgba(120,180,90,.30)';
  for(let i=0;i<9;i++){
    const a = Math.random()*7, r = Math.random()*w*0.16;
    g.beginPath();
    g.arc(c + Math.cos(a)*r, c + Math.sin(a)*r, w*(0.10 + Math.random()*0.11), 0, 7);
    g.fill();
  }
  radial(g,w,h,[[0,'rgba(26,44,18,.55)'],[.5,'rgba(60,110,50,.28)'],[1,'rgba(90,160,80,0)']]);
  for(let i=0;i<26;i++){
    const a = Math.random()*7, r = w*(0.20 + Math.random()*0.24);
    g.fillStyle = 'rgba(200,255,150,' + (0.25 + Math.random()*0.45).toFixed(2) + ')';
    g.beginPath(); g.arc(c + Math.cos(a)*r, c + Math.sin(a)*r, 1.5 + Math.random()*2.6, 0, 7); g.fill();
  }
});

// 巨影（法相 / 灵兽共用，silhouette）
function silhouette(draw){
  return cv(256,512,(g,w,h)=>{ g.clearRect(0,0,w,h); draw(g,w,h); });
}
TEX.avatar = silhouette((g,w,h)=>{
  g.fillStyle='rgba(255,255,255,.95)';
  g.beginPath(); g.arc(w*0.5, h*0.115, w*0.055, 0, 7); g.fill();
  g.beginPath(); g.arc(w*0.5, h*0.185, w*0.085, 0, 7); g.fill();
  g.beginPath();
  g.moveTo(w*0.42, h*0.235);
  g.quadraticCurveTo(w*0.27, h*0.27, w*0.245, h*0.375);
  g.quadraticCurveTo(w*0.225, h*0.49, w*0.30, h*0.555);
  g.quadraticCurveTo(w*0.255, h*0.75, w*0.175, h*0.93);
  g.quadraticCurveTo(w*0.33, h*0.975, w*0.5, h*0.975);
  g.quadraticCurveTo(w*0.67, h*0.975, w*0.825, h*0.93);
  g.quadraticCurveTo(w*0.745, h*0.75, w*0.70, h*0.555);
  g.quadraticCurveTo(w*0.775, h*0.49, w*0.755, h*0.375);
  g.quadraticCurveTo(w*0.73, h*0.27, w*0.58, h*0.235);
  g.closePath(); g.fill();
  g.globalCompositeOperation='destination-out';
  g.fillRect(w*0.40, h*0.40, w*0.20, h*0.012);
  g.globalCompositeOperation='source-over';
});
TEX.beast = silhouette((g,w,h)=>{
  g.fillStyle='rgba(255,255,255,.95)';
  g.beginPath();
  g.moveTo(w*0.16,h*0.72); g.quadraticCurveTo(w*0.2,h*0.44,w*0.42,h*0.42);
  g.quadraticCurveTo(w*0.6,h*0.4,w*0.72,h*0.5);
  g.lineTo(w*0.82,h*0.42); g.lineTo(w*0.88,h*0.5); g.lineTo(w*0.78,h*0.56);
  g.quadraticCurveTo(w*0.72,h*0.72,w*0.62,h*0.74);
  g.lineTo(w*0.58,h*0.9); g.lineTo(w*0.48,h*0.9); g.lineTo(w*0.5,h*0.72);
  g.lineTo(w*0.34,h*0.9); g.lineTo(w*0.24,h*0.9); g.lineTo(w*0.3,h*0.72);
  g.quadraticCurveTo(w*0.22,h*0.72,w*0.16,h*0.72);
  g.closePath(); g.fill();
  g.beginPath(); g.arc(w*0.36,h*0.38,w*0.05,0,7); g.fill();  // 耳
  g.beginPath(); g.arc(w*0.56,h*0.36,w*0.045,0,7); g.fill();
});

/* ===== 粒子池 ===== */
/* =====================================================================
   2. 粒子池（单贴图 = 单材质 = 一批 draw call）
   ===================================================================== */
const U = { scale: { value: 400 } };
function updatePointScale(){
  U.scale.value = (REN && REN.domElement ? REN.domElement.height : 800) * 0.5;
}

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

const _c = new THREE.Color();
class Pool {
  constructor(tex, max = 900){
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
    /* 粒子 Points 是**常驻池**，不是一次性特效：生成物里 clear() 会把
     * 「非 shared 的 mesh」逐个从 ROOT 摘掉并 dispose 材质。以前没打这个标记，
     * 换图 / 重开调一次 clear() 之后，粒子虽然在池里还活着（stats 数得到），
     * 但 Points 已经不在场景树上 —— 表现为「此后所有技能只剩环和柱，粒子全没了」。 */
    this.pts.userData.shared = true;
    ROOT.add(this.pts);
    this.p = [];  // 粒子对象池
    for(let i=0;i<max;i++) this.p.push({ live:false, x:0,y:0,z:0, vx:0,vy:0,vz:0, t:0, life:1,
      s0:1, s1:1, a0:1, grav:0, drag:0, rot:0, rotV:0, cx:0,cy:0,cz:0, spin:0 });
  }
  spawn(o){
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.live = true; p.t = 0;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx||0; p.vy = o.vy||0; p.vz = o.vz||0;
    p.life = o.life || 0.6;
    p.s0 = o.s0 != null ? o.s0 : 0.4;
    p.s1 = o.s1 != null ? o.s1 : p.s0 * 0.2;
    p.a0 = o.a0 != null ? o.a0 : 1;
    p.grav = o.grav || 0; p.drag = o.drag || 0;
    p.rot = o.rot || 0; p.rotV = o.rotV || 0;
    p.cx = o.r != null ? o.r : 1; p.cy = o.g != null ? o.g : 1; p.cz = o.b != null ? o.b : 1;
    p.wob = o.wob || 0;
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
      if(p.drag) { const d = Math.max(0, 1 - p.drag*dt); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.rotV * dt;
      const e = 1 - Math.pow(1-k, 2.2);              // 缓出
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
  if(!POOLS[name]) POOLS[name] = new Pool(TEX[name] || TEX.soft, 1100);
  return POOLS[name];
}
function totalParticles(){
  let n = 0; for(const k in POOLS) n += POOLS[k].alive; return n;
}

/* ===== 时间与更新队列 ===== */
/* =====================================================================
   3. 时间 / 更新队列 / 屏幕反馈
   ===================================================================== */
const TIME = { t: 0, dt: 0, raw: 0, scale: 1, pause: false, stop: 0 };
const updaters = [];
function addUpdate(o){ updaters.push(o); return o; }

// 简易时间轴：seq([[delay, fn], ...])
function seq(steps){
  let i = 0, acc = 0;
  const list = steps.slice().sort((a,b)=>a[0]-b[0]);
  return addUpdate({
    dead: false,
    update(dt){
      if(this.dead) return;
      acc += dt;
      while(i < list.length && acc >= list[i][0]){
        const fn = list[i][1]; i++;
        if(typeof fn === 'function') fn();
      }
      if(i >= list.length){ this.dead = true; }
    }
  });
}
function delay(sec, fn){ return seq([[sec, fn]]); }

// 一次性贴地平面（环 / 冲击 / 贴花）
const _plane = new THREE.PlaneGeometry(1, 1);
function flatMesh(tex, color = 0xffffff, blending = THREE.AdditiveBlending, opacity = 1, shared = false){
  const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending, side: THREE.DoubleSide, fog: false,
    /* 贴地网格和地面 / 广场共面，不给深度偏移会被按深度吃掉一大半：
     * 表现是「起手环时有时无、只在某些角度看得到」，白天亮地面上尤其明显。
     * 抬 y 只能治标（镜头一压又穿回去），polygonOffset 才是正解。 */
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }));
  m.rotation.x = -Math.PI/2;
  m.renderOrder = 4;
  /* 必须在 add **之前**打：生成物里 ROOT.add 会按这个标记决定要不要记进
   * _live（一次性清单）。打晚了池子已经被记进去，下一次 clear() 照样摘掉。 */
  m.userData.shared = shared;
  ROOT.add(m);
  return m;
}
// 面向相机的竖直平面
const billboards = [];
function billMesh(tex, color = 0xffffff, opacity = 1, blending = THREE.AdditiveBlending){
  const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending, fog: false, side: THREE.DoubleSide
  }));
  m.renderOrder = 5;
  ROOT.add(m);
  billboards.push(m);
  return m;
}
function killAfter(mesh, sec){
  delay(sec, ()=>{ ROOT.remove(mesh); if(mesh.material.map === TEX.ring) {} });
}

// 震屏
const shakeState = { amp: 0, t: 0, dur: 0 };

/* ===== 元素语言 ===== */
/* =====================================================================
   5. 元素语言（只管色 + 贴图 + 重力，不管形）
   ===================================================================== */
const ELEMS = {
  phys:    { name:'物理', core:0xfff6e2, glow:0xffd8a0, tex:'spark', decal:null,     grav:  2.2 },
  fire:    { name:'火',   core:0xfff0c0, glow:0xff7a3c, tex:'ember', decal:'scorch', grav: -1.8 },
  ice:     { name:'冰',   core:0xe8fbff, glow:0x9ae8ff, tex:'shard', decal:'frost',  grav:  1.2 },
  thunder: { name:'雷',   core:0xffffff, glow:0xffe066, tex:'spark', decal:'crack',  grav:  0.4 },
  poison:  { name:'毒',   core:0xd8ffb0, glow:0x7fbf5a, tex:'smoke', decal:'acid',   grav: -0.9 },
  holy:    { name:'圣',   core:0xfffbe0, glow:0xfff2b0, tex:'spark', decal:null,     grav: -1.2 }
};
const _cc = {};
function C(hex){ if(!_cc[hex]) _cc[hex] = new THREE.Color(hex); return _cc[hex]; }
let curElem = 'phys';
/* 副元素：主元素负责色阶与贴图，副元素只按 30% 强度叠一层。
   与方案 §8 的「主 70% / 副 30%」一致 —— 玩法上是附加，不是转换；
   表现上因此不能是"两套特效各画一遍"，只能是"同一套配方换一部分材质"。 */
let curElem2 = null;
function E(){ return ELEMS[curElem] || ELEMS.phys; }
function E2(){
  if(!curElem2 || curElem2 === curElem) return null;
  return ELEMS[curElem2] || null;
}
const MIX = { count: 0.34, alpha: 0.30 };   // 副元素占多少粒子 / 叠多亮

/* ===== 原语层 ===== */
/* =====================================================================
   6. FXKit v2 —— 本次方案里的 11 个原语
   ===================================================================== */
const FX = {};
const _camDir = new THREE.Vector3();
const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3();

// ---- spr / burst ----
FX.spr = function(x, y, z, o = {}){
  const e = E();
  const p = pool(o.tex || e.tex);
  p.spawn({
    x, y, z,
    vx: o.vx||0, vy: o.vy||0, vz: o.vz||0,
    life: o.life || 0.6, s0: o.s0 != null ? o.s0 : 0.35, s1: o.s1 != null ? o.s1 : 0.05,
    a0: o.a0 != null ? o.a0 : 1, grav: o.grav != null ? o.grav : e.grav,
    drag: o.drag || 0, rot: Math.random()*7, rotV: o.rotV != null ? o.rotV : (Math.random()-.5)*3,
    r: o.r != null ? o.r : C(e.core).r, g: o.g != null ? o.g : C(e.core).g, b: o.b != null ? o.b : C(e.core).b
  });
};

FX.burst = function(pos, o = {}){
  const e = E();
  const e2 = E2();
  const n = Math.round((o.n || 14) * Q());
  const tex = o.tex || e.tex;
  const sp = o.speed || 4, up = o.up || 1.2, size = o.size || 0.3, life = o.life || 0.6;
  const core = C(o.coreHex || e.core), glow = C(o.glowHex || e.glow);
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2, k = Math.random();
    const v = sp * (0.35 + k*0.9);
    const useGlow = Math.random() < 0.45;
    /* 混元素：约 1/3 的粒子换成副元素的贴图与颜色。
       不是"再画一簇"—— 两簇各飞各的会变成两层互不相干的烟花；
       同一簇里换掉一部分，才读成"这团火里裹着雷"。 */
    const mix2 = e2 && Math.random() < MIX.count;
    const src = mix2 ? e2 : e;
    const useGlow2 = mix2 ? (Math.random() < 0.35) : useGlow;
    const cc = useGlow2 ? C(src.glow) : C(src.core);
    FX.spr(pos.x + Math.cos(a)*0.1, pos.y + Math.random()*0.35, pos.z + Math.sin(a)*0.1, {
      tex: mix2 ? src.tex : (o.tex || src.tex), life: life*(0.6+Math.random()*0.8),
      vx: Math.cos(a)*v, vy: (Math.random()*0.9+0.15)*up*v*0.5, vz: Math.sin(a)*v,
      s0: size*(0.5+Math.random()*0.9), s1: 0.02, grav: o.grav != null ? o.grav : src.grav,
      drag: o.drag != null ? o.drag : 1.4,
      r: cc.r, g: cc.g, b: cc.b,
      rotV: (Math.random()-.5)*8
    });
  }
};

// ---- 贴花（16 个 quad 固定池） ----
const DECAL = { list:[], i:0, max:18 };
for(let i=0;i<DECAL.max;i++){
  /* 同 Pool：贴花是预分配的常驻 mesh，clear() 只该把它们藏起来 + 归零寿命，
   * 不该从场景摘掉。摘掉之后 FX.decal 设的 visible=true 是对着一个
   * 「不在场景树里」的 mesh 喊，永远画不出来。 */
  const m = flatMesh(TEX.scorch, 0xffffff, THREE.NormalBlending, 0, true);
  m.visible = false; m.renderOrder = 2;
  DECAL.list.push({ m, life:0, max:1 });
}
FX.decal = function(pos, texName, size = 2, life = 4, tint = 0xffffff){
  const d = DECAL.list[DECAL.i++ % DECAL.max];
  const m = d.m;
  /* 混元素：三成的残留贴花换成**副元素的贴图**，颜色再往副色偏 35%。
     不是"再贴一张"—— 贴花池只有 18 个位，多贴一张会挤掉别的残留；
     而且地上同时烧黑又结霜，读起来是"两个技能打在了同一点"，
     换成副色才读得出"这一发是火里带冰的"。 */
  const e2 = E2();
  const use2 = e2 && e2.decal && Math.random() < MIX.count;
  m.material.map = TEX[use2 ? e2.decal : texName] || TEX.scorch;
  m.material.color.set(tint);
  if(use2) m.material.color.lerp(C(e2.glow), 0.35);
  m.material.needsUpdate = true;
  m.position.set(pos.x, 0.015 + Math.random()*0.004, pos.z);
  m.rotation.z = Math.random()*7;
  m.scale.setScalar(size * (0.85 + Math.random()*0.3));
  m.visible = true;
  d.life = 0; d.max = life;
  d.m.material.opacity = 0.9;
};

// ---- 冲击波 ----
FX.shock = function(pos, r = 3, o = {}){
  const e = E();
  const col = o.color || e.glow;
  const dur = o.dur || 0.42;
  // 地面环
  const ring = flatMesh(TEX.shock, col, THREE.AdditiveBlending, 0);
  ring.position.set(pos.x, 0.03, pos.z);
  addUpdate({ t:0, update(dt){
    this.t += dt; const k = this.t/dur;
    ring.scale.setScalar(0.2 + k * r * 2);
    ring.material.opacity = (1-k) * 0.85;
    if(k >= 1){ ROOT.remove(ring); this.dead = true; }
  }});
  /* 混元素：主环外面再套一圈**更小**的副色环。
     为什么小一圈：同尺寸两环叠在一起会被加法混合加成第三种颜色（橙 + 青 = 白），
     小一圈才是"外圈主色、内圈副色"这个能看懂的结构。 */
  const _e2s = E2();
  if(_e2s){
    const ring2 = flatMesh(TEX.shock, C(_e2s.glow), THREE.AdditiveBlending, 0);
    ring2.position.set(pos.x, 0.031, pos.z);
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = this.t/dur;
      ring2.scale.setScalar(0.2 + k * r * 1.42);
      ring2.material.opacity = (1-k) * MIX.alpha;
      if(k >= 1){ ROOT.remove(ring2); this.dead = true; }
    }});
  }
  // 竖直气浪
  if(Q() > 0.6){
    const geo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
    const mat = new THREE.MeshBasicMaterial({ map: TEX.beam, color: col, transparent: true,
      opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.set(pos.x, 0.35, pos.z);
    ROOT.add(shell);
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = this.t/(dur*1.5);
      shell.scale.set(r*(0.3+k), 0.9*(1-k*0.4), r*(0.3+k));
      mat.opacity = (1-k)*0.45;
      if(k >= 1){ ROOT.remove(shell); geo.dispose(); mat.dispose(); this.dead = true; }
    }});
  }
  // 尘环
  const n = Math.round(16 * Q());
  for(let i=0;i<n;i++){
    const a = i/n*Math.PI*2;
    FX.spr(pos.x + Math.cos(a)*0.4, 0.1, pos.z + Math.sin(a)*0.4, {
      tex:'smoke', life: 0.7 + Math.random()*0.4,
      vx: Math.cos(a)*r*1.5, vy: 0.6+Math.random(), vz: Math.sin(a)*r*1.5,
      s0: 0.5, s1: 1.3, a0: .28, grav: 1.6, drag: 2.4,
      r: .7, g: .68, b: .62
    });
  }
};

// ---- 刀气弧（父级绕 Y 转 / 子级只管倾斜） ----
const arcGeos = {};
function arcGeometry(inner, outer, span, seg = 44){
  const k = inner.toFixed(2)+'_'+outer.toFixed(2)+'_'+span.toFixed(2);
  if(arcGeos[k]) return arcGeos[k];
  const pos = [], uv = [], idx = [];
  for(let i=0;i<=seg;i++){
    const t = i/seg, a = -span/2 + span*t, ca = Math.cos(a), sa = Math.sin(a);
    pos.push(ca*inner, sa*inner, 0); uv.push(t, 0);
    pos.push(ca*outer, sa*outer, 0); uv.push(t, 1);
  }
  for(let i=0;i<seg;i++){ const b = i*2; idx.push(b, b+1, b+2, b+1, b+3, b+2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  arcGeos[k] = g;
  return g;
}
function arcMaterial(color, opacity = 1){
  return new THREE.MeshBasicMaterial({ map: TEX.slash, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

/**
 * 刀气弧
 * opt: { r, inner, span, tilt, y, spin, sweep, life, color, from, to }
 *  spin  每秒绕 Y 旋转弧度；sweep 在平面内扫过的弧度（用于定向挥砍）
 */
FX.arc = function(center, opt = {}){
  const r = opt.r || 1.7;
  const inner = opt.inner != null ? opt.inner : r * 0.62;
  const span = opt.span || 2.1;
  const tilt = opt.tilt != null ? opt.tilt : 0.62;
  const life = opt.life || 0.36;
  const col = opt.color != null ? opt.color : C(E().glow);

  const spinG = new THREE.Group();
  spinG.position.set(center.x, opt.y != null ? opt.y : 0.95, center.z);
  spinG.rotation.y = opt.yaw || 0;
  ROOT.add(spinG);

  const tiltG = new THREE.Group();
  tiltG.rotation.x = -Math.PI/2 + tilt;
  spinG.add(tiltG);

  const geo = arcGeometry(inner, r, span);
  const mkArc = (matInner, matOuter, op) => {
    const m1 = new THREE.Mesh(geo, matOuter);
    const m2 = new THREE.Mesh(arcGeometry(inner*1.02, r*0.82, span*0.96), matInner);
    m2.position.z = 0.012;
    tiltG.add(m1); tiltG.add(m2);
    return [m1, m2];
  };
  const outerMat = arcMaterial(col, opt.opacity || 0.95);
  const innerMat = arcMaterial(C(E().core), 0.9);
  const [mOut, mIn] = mkArc(innerMat, outerMat);

  /* 混元素：主弧外面再套一层更宽、更淡的副色弧。
     为什么不是"一道弧里一半火一半雷"—— 弧是一个完整图形，
     劈成两半会读成"做坏了"；外面裹一圈副色，才是"火焰外缘有雷弧"。 */
  const e2 = E2();
  let mixMat = null, mMix = null;
  if(e2){
    mixMat = arcMaterial(C(e2.glow), MIX.alpha);
    mMix = new THREE.Mesh(arcGeometry(inner*0.98, r*1.08, span*1.02), mixMat);
    mMix.position.z = -0.008;
    tiltG.add(mMix);
  }

  const sweepFrom = opt.from != null ? opt.from : 0;
  const sweepTo = opt.to != null ? opt.to : 0;
  const spin = opt.spin || 0;

  addUpdate({ t:0, update(dt){
    this.t += dt;
    const k = Math.min(1, this.t/life);
    spinG.rotation.y += spin * dt;
    if(sweepTo !== sweepFrom){
      const e = 1 - Math.pow(1-k, 3);
      mOut.rotation.z = mIn.rotation.z = sweepFrom + (sweepTo - sweepFrom) * e;
    }
    const fade = 1 - Math.pow(k, 1.6);
    outerMat.opacity = fade * (opt.opacity || 0.95);
    innerMat.opacity = fade * 0.85;
    if(mixMat) mixMat.opacity = fade * MIX.alpha;
    // 前 80% 时间轻微外扩
    const sc = 1 + k*0.12;
    tiltG.scale.setScalar(sc);
    if(k >= 1){
      ROOT.remove(spinG);
      outerMat.dispose(); innerMat.dispose();
      if(mixMat) mixMat.dispose();
      this.dead = true;
    }
  }});

  // 拖尾余影：沿弧外沿撒粒子
  if(Q() > 0.55){
    for(let i=0;i<8;i++){
      const a = -span/2 + Math.random()*span;
      FX.spr(center.x + Math.cos(a)*r*0.9, (opt.y||0.95) + Math.sin(a)*tilt*0.3, center.z + Math.sin(a)*r*0.9, {
        tex:'spark', life: .25 + Math.random()*.2, s0: .16, s1: 0,
        vx: 0, vy: .5, vz: 0, a0: .8, grav: 0,
        r: C(E().core).r, g: C(E().core).g, b: C(E().core).b
      });
    }
  }
  return spinG;
};

// ---- 折线闪电（带分叉，宽面带子，不是 1px Line） ----
class Bolt {
  constructor(a, b, o = {}){
    this.a = a.clone(); this.b = b.clone();
    this.color = o.color != null ? o.color : C(E().glow);
    this.width = o.width || 0.09;
    this.seg = o.seg || 16;
    this.chaos = o.chaos != null ? o.chaos : 0.55;
    this.life = o.life || 0.18;
    this.t = 0; this.flick = 0;
    this.follow = o.follow || null;     // 跟随某条雷的路径（白芯用）
    this.maxOp = o.maxOp != null ? o.maxOp : 1;
    const n = this.seg;
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(n*2*3);
    this.alphaArr = new Float32Array(n*2);
    const uvArr = new Float32Array(n*2*2);
    const idx = [];
    for(let i=0;i<n;i++){
      uvArr[i*4] = i/(n-1); uvArr[i*4+1] = 0;
      uvArr[i*4+2] = i/(n-1); uvArr[i*4+3] = 1;
    }
    for(let i=0;i<n-1;i++){ const q = i*2; idx.push(q, q+1, q+2, q+1, q+3, q+2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alphaArr, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms:{ uColor:{ value: new THREE.Color(this.color) }, uTex:{ value: TEX.boltline }, uOp:{ value: 1 } },
      vertexShader:`attribute float aA; varying float vA; varying vec2 vUv;
        void main(){ vA=aA; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`uniform vec3 uColor; uniform sampler2D uTex; uniform float uOp;
        varying float vA; varying vec2 vUv;
        void main(){ vec4 t=texture2D(uTex,vUv); float a=t.a*vA*uOp;
          if(a<0.01) discard;
          gl_FragColor=vec4(uColor, a); }`,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    ROOT.add(this.mesh);
    this.regen();
    /* points 必须留着：白芯 / 外辉 / 回击都要 build(main.points) 贴同一条路径，
       这里置 null 会让它们直接抛错、只剩一条主干。 */
  }
  makePts(){
    const n = this.seg, pts = [];
    const dir = _tmpA.copy(this.b).sub(this.a);
    const len = dir.length();
    dir.normalize();
    const perp1 = new THREE.Vector3(0,1,0);
    if(Math.abs(dir.y) > 0.9) perp1.set(1,0,0);
    const p1 = perp1.cross(dir).normalize();
    const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
    /* 真折线：每段自己拐一次，不是靠累积偏移画平滑波浪。
       之前 ox = ox*0.6 + 随机 的写法有"方向记忆"，累积出来是 S 形长波，
       所以看着像一根弯绳。这里改为逐段旋转行进方向。 */
    const segLen = len/(n-1);
    const p = this.a.clone();
    const d = dir.clone();
    for(let i=0;i<n;i++){
      pts.push(p.clone());
      if(i === n-1) break;
      const damp = Math.pow(1 - i/(n-1), 0.45);        // 越接近落点越收
      const kick = 0.85 * this.chaos * damp;           // 每段可偏转的角度量
      const nd = dir.clone()
        .addScaledVector(p1, (Math.random()-0.5) * kick * 2)
        .addScaledVector(p2, (Math.random()-0.5) * kick * 2)
        .normalize();
      d.copy(nd);
      p.addScaledVector(d, segLen);
    }
    // 末端拉回目标点（最后几段按比例回收，避免突然折一下）
    for(let i=Math.max(0, n-3);i<n;i++){
      const k = (i - (n-3) + 1) / 3;
      pts[i].lerp(this.b, k*k*0.9);
    }
    pts[0].copy(this.a);
    pts[n-1].copy(this.b);
    return pts;
  }
  regen(){ this.build(this.makePts()); }
  /* 用给定路径重建：白热芯必须和主干走同一条道，
     否则两层各画一根，看起来就是两根闪电错开 */
  build(pts){
    this.points = pts;
    CAM.getWorldDirection(_camDir);
    const n = this.seg, pa = this.posArr, aa = this.alphaArr, m = pts.length;
    for(let i=0;i<n;i++){
      const t = n > 1 ? i/(n-1) : 0;
      /* 按比例在路径上采样：跟随层（白芯 / 外辉）的 seg 可能与主干不同，
         若直接用 pts[i] 会把路径截断，看起来就是两条错开的雷。 */
      const idx = t*(m-1);
      const i0 = Math.min(m-1, Math.floor(idx)), i1 = Math.min(m-1, i0+1), fr = idx-i0;
      const x = pts[i0].x + (pts[i1].x - pts[i0].x)*fr;
      const y = pts[i0].y + (pts[i1].y - pts[i0].y)*fr;
      const z = pts[i0].z + (pts[i1].z - pts[i0].z)*fr;
      const ia = Math.max(0, i0-1), ib = Math.min(m-1, i1+1);
      let tx = pts[ib].x - pts[ia].x, ty = pts[ib].y - pts[ia].y, tz = pts[ib].z - pts[ia].z;
      const tl = Math.hypot(tx,ty,tz) || 1; tx/=tl; ty/=tl; tz/=tl;
      // side = tan × camDir
      let sx = ty*_camDir.z - tz*_camDir.y;
      let sy = tz*_camDir.x - tx*_camDir.z;
      let sz = tx*_camDir.y - ty*_camDir.x;
      const sl = Math.hypot(sx,sy,sz) || 1;
      // 粗细：两端收尖、中段接近等宽（原来用 sin 鼓成梭形，像根纺锤）
      const k = this.width * (0.28 + 0.85 * Math.pow(Math.sin(t*Math.PI), 0.22)) / sl;
      sx *= k; sy *= k; sz *= k;
      pa[i*6]   = x + sx; pa[i*6+1] = y + sy; pa[i*6+2] = z + sz;
      pa[i*6+3] = x - sx; pa[i*6+4] = y - sy; pa[i*6+5] = z - sz;
      // 亮度：起点（云里）最亮，靠近落点略暗
      const fade = 0.52 + 0.48 * (1 - t);
      aa[i*2] = fade; aa[i*2+1] = fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
  }
  update(dt){
    this.t += dt; this.flick -= dt;
    if(this.follow && this.follow.points){
      // 跟随层：主干每次抖动后立刻重画到同一路径上，
      // 否则它会自己 regen 出新路径、和白芯错开成两根
      this.build(this.follow.points);
    } else if(this.flick <= 0 && this.t < this.life*0.72){
      this.flick = 0.035; this.regen();
    }
    this.mat.uniforms.uOp.value = this.maxOp * Math.max(0, 1 - Math.pow(this.t/this.life, 1.5));
    if(this.t >= this.life){ this.dispose(); return false; }
    return true;
  }
  dispose(){ ROOT.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
/* ---- 斧头实体几何（旋风斩专用，模块级缓存，三把共用一个） ----
 * 为什么不用贴图：第一版是 128×256 的程序化斧头贴图，加法混合 + 51° 俯角下
 * 月牙被采样糊成一坨，读起来是"几块圆的亮片"—— 剪影交给位图采样永远不可靠
 * （分辨率、过滤、缩放、混合模式任何一个都会把它糊掉）。
 * 这里改成 THREE.Shape 挤出实体：轮廓由顶点决定，怎么转都是斧头。
 *
 * 局部坐标系（躺平之前）：
 *   +Y = 半径外侧（刀刃所在的一端，柄尾在 -Y）
 *   +X = 切向（转动的前进方向，刀刃向这一侧甩）
 *   +Z = 厚度（放平后朝上）
 * 单刃斧的关键是**不对称**：右侧一条大弧刃口，左侧一条近似直线的窄斧背。
 * 左右对称的月牙不管怎么调都会读成"月亮/圆盘"，这是剪影问题不是参数问题。
 */
let _axeHeadGeo = null, _axeHaftGeo = null;
function _polyShape(pts){
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
/* 斧头：**全直线，一个弧都不许有**。
 * 三条边必须是正的直线（斧背 / 顶边 / 底边），右边接一个梯形刃 ——
 * 刃口是"一小段直面 + 上下两个尖角"，那才是"刃"；
 * 之前用 quadraticCurveTo 绕一圈，四条边没有一条是直的，
 * 所以不管怎么调都读成"锅铲/圆片"。曲线换直线，形状立刻就硬了。
 *
 * 比例也是硬要求：**头要"高"不要"宽"**。
 * 斧头躺平后，径向（+Y，也就是柄的方向）在 51° 俯角下会被压掉约 22%，
 * 所以竖向必须事先做高 —— 头 0.70 高 / 0.41 深，压完还剩 1.3:1，
 * 才不会被看成一块方的纸片（第一版 0.55×0.68 压完基本就是正方形）。 */
/* 斧头：**全直线 + 扇形（斧背窄、刃口张开）**。
 * 三条边必须是正的直线（斧背 / 上下缘），右边接一个外凸的刃：
 * 刃口是"一小段直面 + 上下两个尖角"，那才是"刃"。
 *
 * 两条都是硬要求，违反任何一条就变回"锅铲"：
 *  1. **不对称**：斧背几乎贴着柄（x=-0.06），刃口甩到 x=0.46 ——
 *     头在柄的一侧，不是在柄中间。居中装就一定是铲子。
 *  2. **扇形**：斧背那头只有 0.34 高，刃口那头张到 0.78 高。
 *     等宽的长方形不管加多少尖角都还是一块板。
 * 另外竖向要预先做高：躺平后径向在 51° 俯角下被压掉约 22%。 */
/* ── 斧头轮廓（唯一旋钮，改这里就能调形） ────────────────────────
 * 局部坐标：+Y = 半径外侧（刃口一端）、+X = 切向、+Z = 厚度（躺平后朝上）。
 * 三条经验，都是试错换来的，别再犯：
 *  1. **必须有台阶**：斧眼（+ 0.045 那段）窄、刃口那一段突然跳宽。
 *     平滑外张的扇形 = 锅铲；左右对称的扇面 = 蘑菇锤。那个"突然变宽"
 *     才是斧头卡在柄上的样子。
 *  2. **方角**：斧踵 heel / 斧趾 toe 要真尖，中间那条竖边接近直线。
 *     全用 quadraticCurveTo 绕一圈，四条边没一条是直的，怎么调都是圆的。
 *  3. **竖向预先做高**：躺平后径向在 51° 俯角下会被压掉约 22%。 */
const AXE_HEAD = [
  [-0.075, -0.100],  // 斧背底角
  [ 0.045, -0.100],  // 斧眼底边（窄矩形段）
  [ 0.045, -0.270],  // ★台阶：向下突然跳出去
  [ 0.230, -0.320],  // 斧踵 heel（刃口下端尖角）
  [ 0.270, -0.130],  // 刃口下段
  [ 0.280,  0.060],  // 刃口中段（直面 = 真正的刃）
  [ 0.270,  0.250],  // 刃口上段
  [ 0.230,  0.380],  // 斧趾 toe（刃口上端尖角）
  [ 0.045,  0.330],  // ★台阶：向上收回
  [ 0.045,  0.100],  // 斧眼顶边（窄矩形段）
  [-0.075,  0.100]   // 斧背顶角
];
const AXE_HAFT = [
  [-0.062, -1.150],  // 柄首配重（比柄粗一圈，方块）
  [ 0.062, -1.150],
  [ 0.062, -1.080],
  [ 0.040, -1.060],
  [ 0.040, -0.060],  // 伸进斧眼里，交代"柄是穿过去的"
  [-0.040, -0.060],
  [-0.040, -1.060],
  [-0.062, -1.080]
];
function axeHeadGeo(){
  if(_axeHeadGeo) return _axeHeadGeo;
  const g = new THREE.ExtrudeGeometry(_polyShape(AXE_HEAD), {
    depth: 0.085, bevelEnabled: false
  });
  g.translate(0, 0, -0.0425);
  _axeHeadGeo = g;
  return g;
}
/* 柄单独挤出、比斧头薄一半：俯角下能看见"斧头厚、柄细"这个落差，
 * 一块等厚的板无论轮廓多准都还是板。 */
function axeHaftGeo(){
  if(_axeHaftGeo) return _axeHaftGeo;
  const g = new THREE.ExtrudeGeometry(_polyShape(AXE_HAFT), {
    depth: 0.060, bevelEnabled: false
  });
  g.translate(0, 0, -0.030);
  _axeHaftGeo = g;
  return g;
}
/* 斧颊：把整块轮廓朝形心缩 0.62 得到的"内面"。
 * 斧头躺平时我们看到的是它那个又大又平的**颊面**，一整块同色就必然读成纸板；
 * 缩一圈压暗盖上去，就有了"外圈亮边 → 中间浅边 → 中心暗面"的层次，
 * 眼睛会把它读成一块中间鼓、边上薄下去的钢。 */
let _axeCheekGeo = null;
function axeCheekGeo(){
  if(_axeCheekGeo) return _axeCheekGeo;
  const cx = 0.11, cy = 0.02, k = 0.62;
  const pts = AXE_HEAD.map(p=>[cx+(p[0]-cx)*k, cy+(p[1]-cy)*k]);
  const g = new THREE.ShapeGeometry(_polyShape(pts));
  g.translate(0, 0, 0.0435);
  _axeCheekGeo = g;
  return g;
}

/* 刃口亮带：沿刃口那条折线（踵 → 下段 → 上段 → 趾）取点，
 * 每点朝形心内缩一条宽度，缝成一个多边形。
 * 用折线而不是重采样贝塞尔 —— 刃口本身已经是直的了，重采样只会把它
 * 又磨圆回去。加法混合里"亮"是唯一读得出的信息，刃口必须比斧身更白更实。 */
let _axeEdgeGeo = null;
function axeEdgeGeo(){
  if(_axeEdgeGeo) return _axeEdgeGeo;
  const pts = [AXE_HEAD[3], AXE_HEAD[4], AXE_HEAD[5], AXE_HEAD[6], AXE_HEAD[7]];
  const cx = 0.13, cy = 0.02, wid = 0.062;   // 形心 + 带子宽度
  const out = [], inn = [];
  pts.forEach(p=>{
    out.push(p);
    const dx = cx-p[0], dy = cy-p[1], L = Math.hypot(dx,dy) || 1;
    inn.push([p[0]+dx/L*wid, p[1]+dy/L*wid]);
  });
  const s = new THREE.Shape();
  s.moveTo(out[0][0], out[0][1]);
  for(let i=1;i<out.length;i++) s.lineTo(out[i][0], out[i][1]);
  for(let i=inn.length-1;i>=0;i--) s.lineTo(inn[i][0], inn[i][1]);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.translate(0, 0, 0.050);                  // 贴在斧头朝上的那一面
  _axeEdgeGeo = g;
  return g;
}

/* ---- 平转的斧头（暗黑三旋风斩那种） ----
 * 旧版画的是三道"倾斜 35° 的刀气弧"：弧本身躺在地上、又各自斜着抬起来，
 * 读起来是"地上有三片斜光"，完全不像"武器在平着转"。
 * 现在真的把武器放上去转：N 把斧头在**同一个水平面**上绕人转圈，
 * 每把后面拖一条水平尾焰，脚下再给一圈旋转气流。
 *
 * 三条硬规矩：
 *   1. 所有东西都在同一高度（y≈1.0），一个都不许倾斜 —— 一旦给了 inclination，
 *      立刻变回"斜着转"；
 *   2. 绕 Y 的旋转一律交给**父级 Group**，斧头的朝向只用一个轴（rotation.y），
 *      尾焰的"放平 + 平面内转"用**祖-孙两级**（flat 负责放平、mesh 负责转），
 *      同一个 mesh 上既 rotation.x 又 rotation.z 会互相干扰（欧拉角顺序）；
 *   3. 尾焰是**水平扇形**（arcGeometry 放平），不是 Ribbon —— Ribbon 的宽边
 *      永远朝相机，转起来会变成一条竖直飘带，反而看不出"平"。
 */
FX.spinBlades = function(center, o = {}){
  const R = o.r || 1.85;
  const life = o.life || 0.95;
  const n = o.n || 3;
  const y = o.y != null ? o.y : 1.0;
  const spd = o.spin || 13;
  const col = o.color != null ? o.color : C(E().glow);
  const core = C(E().core);

  const grp = new THREE.Group();
  grp.position.set(center.x, y, center.z);
  ROOT.add(grp);

  const mats = [], parts = [];
  for(let i=0;i<n;i++){
    const piv = new THREE.Group();
    piv.rotation.y = i/n * Math.PI * 2;
    grp.add(piv);

    /* 斧头**躺平**：刀面与地面平行，刃朝外（径向），柄朝内。
       holder 这一级只干一件事：把"面朝上"这个姿态一次性定死
       （欧拉 XYZ：先 Rz 把局部 +Y 转到 +X，再 Rx 整片放平），
       之后斧身、刃口亮带都挂在 holder 下、自己不再带任何倾角。 */
    /* 材质这一层是"像不像武器"的另一半。
       加法混合的斧头不管轮廓多准，最终都是一个发光色块 —— 光晕会把
       形状糊圆（第一版就是这个毛病）。所以斧身改成**不透明金属**：
       加法混合只留给刃口和尾焰，实体剪影才是"真家伙"的观感。 */
    const steel = C(col).clone().lerp(new THREE.Color(0xa9a293), 0.62);
    // 配色策略：**面压到很暗、侧壁给到很亮**。
    // 俯角下只能看见远侧那条侧壁，它正好是沿斧头轮廓的一整圈亮边；
    // 暗面 + 亮边 = 一块有厚度的黑钢，形状靠对比度读出来。
    // 反过来（面亮、边黑）就得到一块发白、没有厚度的纸片 —— 前两版都死在这。
    const am = new THREE.MeshBasicMaterial({ color: steel.clone().multiplyScalar(0.62),
      transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.NormalBlending,
      side: THREE.DoubleSide, fog: false });
    const amS = new THREE.MeshBasicMaterial({ color: steel.clone().multiplyScalar(1.30),
      transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.NormalBlending,
      side: THREE.DoubleSide, fog: false });
    const cm = new THREE.MeshBasicMaterial({ color: steel.clone().multiplyScalar(0.30),
      transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.NormalBlending,
      side: THREE.DoubleSide, fog: false });
    // 柄比斧头暗一档：木柄 vs 钢刃，靠明度差分开，侧壁同样给亮（体积感）
    const hm = new THREE.MeshBasicMaterial({ color: steel.clone().multiplyScalar(0.30),
      transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.NormalBlending,
      side: THREE.DoubleSide, fog: false });
    const hmS = new THREE.MeshBasicMaterial({ color: steel.clone().multiplyScalar(0.95),
      transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.NormalBlending,
      side: THREE.DoubleSide, fog: false });
    const em = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false });

    const holder = new THREE.Group();
    holder.rotation.set(-Math.PI/2, 0, -Math.PI/2);
    holder.position.set(R, 0, 0);
    piv.add(holder);

    // ExtrudeGeometry 自带两个 group：0 = 正反大面，1 = 侧壁。
    // 大面亮、侧壁压很暗 —— 侧壁从 51° 俯角看正好是斧头的一圈轮廓边，
    // 压暗之后剪影变成"亮面 + 黑边框"，比任何贴图高光都更像一块有厚度的钢。
    const ax = new THREE.Mesh(axeHeadGeo(), [am, amS]);
    ax.renderOrder = 5;
    holder.add(ax);

    const cheek = new THREE.Mesh(axeCheekGeo(), cm);
    cheek.renderOrder = 5;
    holder.add(cheek);

    const haft = new THREE.Mesh(axeHaftGeo(), [hm, hmS]);
    haft.renderOrder = 5;
    holder.add(haft);

    const edge = new THREE.Mesh(axeEdgeGeo(), em);
    edge.renderOrder = 6;
    holder.add(edge);
    mats.push(am, amS, cm, hm, hmS, em);

    /* 尾焰：水平扇形。祖级放平（rotation.x=-90°），子级在平面内转 */
    const span = 1.35;
    const tm = arcMaterial(col, 0.5);
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI/2;
    piv.add(flat);
    const tr = new THREE.Mesh(arcGeometry(R*0.66, R*1.18, span, 26), tm);
    tr.rotation.z = -span*0.5;          // 让扇形的前缘正好落在斧头脚下
    flat.add(tr); mats.push(tm);

    /* 混元素：尾焰外面再裹一层更宽的副色扇形。
       斧头本体不混（它是"武器"，颜色跟着材质走就好），
       混的是它扫出来的那道风 —— 那才是元素效果该出现的地方。 */
    const mixE2 = E2();
    let tm2 = null, tr2 = null;
    if(mixE2){
      tm2 = arcMaterial(C(mixE2.glow), MIX.alpha);
      tr2 = new THREE.Mesh(arcGeometry(R*0.60, R*1.30, span*1.06, 26), tm2);
      tr2.rotation.z = -span*0.5;
      flat.add(tr2); mats.push(tm2);
    }

    parts.push({ piv, holder, ax, cheek, haft, am, amS, cm, hm, hmS, em, tr, tm, tr2, tm2 });
  }

  /* 脚下气流盘：一圈很淡的旋转环，给"转"一个底盘（否则斧头像悬空） */
  const dm = new THREE.MeshBasicMaterial({ map: TEX.ring, color: col, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const disc = new THREE.Mesh(_plane, dm);
  disc.rotation.x = -Math.PI/2;
  disc.position.y = -y + 0.05;
  disc.scale.setScalar(R*2.5);
  grp.add(disc); mats.push(dm);

  let t = 0;
  const startRot = Math.random()*7;
  grp.rotation.y = startRot;

  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/life);
    const inK = Math.min(1, t/0.08);
    const outK = k > 0.62 ? Math.max(0, 1-(k-0.62)/0.38) : 1;

    /* 起转要"甩"起来：前 80ms 慢，之后全速。匀速转像风扇，没有重量 */
    grp.rotation.y += dt * spd * (0.35 + 0.65*inK);

    parts.forEach((p, i)=>{
      const ph = Math.sin(t*24 + i*2.1);
      // 斧身几乎不闪（一块金属不会自己呼吸），只做结尾淡出；
      // 闪烁全部交给刃口和尾焰 —— 亮的东西才闪，实体只负责"在"。
      p.am.opacity  = 0.97 * outK;
      p.amS.opacity = 0.97 * outK;
      p.cm.opacity  = 0.97 * outK;
      p.hm.opacity  = 0.97 * outK;
      p.hmS.opacity = 0.97 * outK;
      p.em.opacity  = (0.55 + 0.45*ph) * outK;
      p.tm.opacity = (0.50 + 0.16*ph) * outK * inK;
      if(p.tm2) p.tm2.opacity = (MIX.alpha + 0.10*ph) * outK * inK;
      // 躺平之后只剩一点点高度浮动，避免三把斧头像贴在同一个玻璃板上。
      // holder 的世界 +Y 就是"上"，所以浮动写在 y 上，不要去碰 ax 的局部轴。
      p.holder.position.y = Math.sin(t*9 + i*2.1) * 0.05;
    });
    dm.opacity = 0.16 * outK * inK;

    /* 刃尖火星：沿圆周甩出去，方向跟着转速走 */
    if(Math.random() < dt*55*Q()){
      const a = grp.rotation.y + Math.random()*Math.PI*2;
      const tx = center.x + Math.cos(a)*R, tz = center.z + Math.sin(a)*R;
      FX.spr(tx, y + (Math.random()-0.5)*1.3, tz, {
        tex: 'spark', life: 0.28 + Math.random()*0.2, s0: 0.20, s1: 0,
        a0: 0.85 * outK,
        vx: -Math.sin(a)*spd*0.12, vy: 0.4 + Math.random()*0.6, vz: Math.cos(a)*spd*0.12,
        grav: 2.2, drag: 0.6,
        r: core.r, g: core.g, b: core.b
      });
    }

    if(k >= 1){
      ROOT.remove(grp);
      mats.forEach(m=>m.dispose());
      this.dead = true;
    }
  }});
  return grp;
};

/* ---------- 元素反应（混元素的"事件"，不是持续混色） ----------
 * 混色只解决"这团火里有没有雷"，解决不了"两种元素碰到一起会怎样"。
 * 反应必须是一次性的画面事件，而且不能都用"一圈粒子"——
 * 蒸汽是白汽团、等离子是电弧球、感电是冰壳爬电、焚毒是绿火包橙芯，
 * 四种形状互不相同，玩家才记得住。
 * 只在四种组合上做：其余的混就只是混色，硬凑反而分不清。
 */
const REACT_FX = {
  'fire|ice': { name: '蒸汽爆裂', run(p){
    FX.shock(p, 3.2, { color: 0xdfefff, dur: 0.5 });
    for(let i=0;i<Math.round(34*Q());i++){
      const a = Math.random()*7, r = Math.random()*1.6;
      FX.spr(p.x+Math.cos(a)*r, 0.2+Math.random()*1.2, p.z+Math.sin(a)*r, {
        tex: 'smoke', life: 0.9+Math.random()*0.6, s0: 0.40, s1: 1.7, a0: 0.35,
        vy: 1.1+Math.random(), grav: -0.8, drag: 0.7, r: .90, g: .94, b: 1
      });
    }
  } },
  'fire|thunder': { name: '等离子', run(p){
    const c = new THREE.Vector3(p.x, 1.1, p.z);
    // 六条电弧从外圈跳进球心：球是"结果"，弧是"过程"
    for(let i=0;i<6;i++){
      const a = i/6*Math.PI*2;
      FX.bolt(new THREE.Vector3(c.x+Math.cos(a)*1.0, c.y+Math.sin(a*2)*0.65, c.z+Math.sin(a)*1.0), c,
        { color: 0xc8a8ff, core: 0xffffff, branch: 1, width: 0.06, life: 0.24, seg: 10, chaos: 0.7 });
    }
    FX.shock(p, 2.4, { color: 0xc8a8ff, dur: 0.35 });
    FX.burst(c, { n: 24, speed: 5, life: .5, size: .30, coreHex: 0xe8d8ff, glowHex: 0xa878ff });
  } },
  'ice|thunder': { name: '感电冻结', run(p){
    for(let i=0;i<Math.round(20*Q());i++){
      const a = Math.random()*7;
      FX.spr(p.x+Math.cos(a)*1.2, 0.3+Math.random()*1.6, p.z+Math.sin(a)*1.2, {
        tex: 'shard', life: .7, s0: .30, s1: .05, a0: .9,
        vx: Math.cos(a)*1.2, vy: .6, vz: Math.sin(a)*1.2, grav: 1.4, rotV: 3,
        r: .86, g: .96, b: 1
      });
    }
    const c = new THREE.Vector3(p.x, 1.0, p.z);
    for(let i=0;i<4;i++){
      const a = Math.random()*7;
      FX.bolt(new THREE.Vector3(c.x+Math.cos(a)*1.6, c.y+0.8, c.z+Math.sin(a)*1.6), c,
        { color: 0x9ae8ff, core: 0xffffff, branch: 2, width: 0.07, life: 0.20, seg: 10, chaos: 0.9 });
    }
  } },
  'fire|poison': { name: '焚毒', run(p){
    FX.geyser(p, { h: 2.8, life: .8, tex: 'flame', color: 0x7fbf5a, noMix: true });
    for(let i=0;i<Math.round(30*Q());i++){
      const a = Math.random()*7, r = Math.random()*0.7;
      const green = i % 2 === 0;
      FX.spr(p.x+Math.cos(a)*r, 0.2, p.z+Math.sin(a)*r, {
        tex: 'flame', life: 1.0, s0: .80, s1: .20, a0: .8,
        vy: 2.0+Math.random()*1.4, grav: -1.6, drag: .5,
        r: green ? .3 : 1, g: green ? 1 : .5, b: green ? .15 : .1
      });
    }
  } },

  /* ---- 冰 + 毒：腐霜 ---- 白霜上晕开绿斑，雾**贴地爬**而不是上升 */
  'ice|poison': { name: '腐霜', run(p){
    FX.decal(p, 'frost', 3.6, 5, 0xdfefff);
    FX.decal(p, 'acid', 2.6, 5, 0x9fe07a);
    FX.shock(p, 2.6, { color: 0xbfe8c0, dur: 0.45 });
    for(let i=0;i<Math.round(22*Q());i++){
      const a = Math.random()*7, r = 0.4 + Math.random()*1.8;
      FX.spr(p.x+Math.cos(a)*r, 0.15+Math.random()*0.5, p.z+Math.sin(a)*r, {
        tex: 'smoke', life: 1.2, s0: .30, s1: 1.1, a0: .28,
        vx: Math.cos(a)*0.6, vy: 0.15, vz: Math.sin(a)*0.6, grav: 0.35, drag: 1.2,
        r: .62, g: .90, b: .60
      });
    }
  } },

  /* ---- 雷 + 毒：腐蚀链 ---- 电弧是**绿的**（不是紫的），每个落点炸一小团毒沫。
     紫色雷谁都认得出是雷，这里要的是"这条链是毒的"，所以连白芯都偏黄绿。 */
  'poison|thunder': { name: '腐蚀链', run(p){
    const pts = [];
    for(let i=0;i<3;i++){
      const a = Math.random()*7, r = 1.2 + Math.random()*1.6;
      pts.push(new THREE.Vector3(p.x+Math.cos(a)*r, 0.5+Math.random()*0.9, p.z+Math.sin(a)*r));
    }
    let from = new THREE.Vector3(p.x, 1.2, p.z);
    pts.forEach(q=>{
      FX.bolt(from, q, { color: 0x9fe07a, core: 0xeaffd8, glow: 0x4f8a3a,
        branch: 1, width: 0.06, life: 0.26, seg: 10, chaos: 0.9 });
      from = q;
    });
    pts.forEach(q=>{
      FX.spr(q.x, q.y, q.z, { tex:'smoke', life:.7, s0:.28, s1:1.0, a0:.4,
        grav: -0.4, drag: 1.4, r:.55, g:.85, b:.45 });
    });
    FX.shock(p, 2.0, { color: 0x9fe07a, dur: 0.32 });
  } },

  /* ---- 火 + 圣：净化烈焰 ---- 金色火柱，火舌透白，落点留金色光**
     （和"焚毒"的区别：焚毒是绿火包橙芯、矮而散；这个是金火柱、高而直。） */
  'fire|holy': { name: '净化烈焰', run(p){
    FX.geyser(p, { h: 3.8, w: 1.15, opacity: .9, life: .95, tex: 'flame', color: 0xffe9a0, noMix: true });
    FX.shock(p, 2.9, { color: 0xfff2b0, dur: 0.5 });
    for(let i=0;i<Math.round(18*Q());i++){
      const a = Math.random()*7, r = Math.random()*0.9;
      FX.spr(p.x+Math.cos(a)*r, 0.2, p.z+Math.sin(a)*r, {
        tex: 'spark', life: 1.1, s0: .22, s1: .02, a0: .9,
        vy: 3.2+Math.random()*1.8, grav: -1.2, drag: .4,
        r: 1, g: .95, b: .70
      });
    }
  } },

  /* ---- 冰 + 圣：圣霜 ---- 金色光环 + 冰晶镀金边（shard 走金色而不是青色） */
  'holy|ice': { name: '圣霜', run(p){
    FX.shock(p, 2.8, { color: 0xfff2b0, dur: 0.5 });
    FX.decal(p, 'frost', 3.0, 4.5, 0xfff6d8);
    for(let i=0;i<Math.round(24*Q());i++){
      const a = Math.random()*7;
      FX.spr(p.x+Math.cos(a)*1.1, 0.3+Math.random()*1.2, p.z+Math.sin(a)*1.1, {
        tex: 'shard', life: .8, s0: .30, s1: .04, a0: .9,
        vx: Math.cos(a)*1.5, vy: .9, vz: Math.sin(a)*1.5, grav: 1.1, rotV: 2.5,
        r: 1, g: .97, b: .82
      });
    }
  } },

  /* ---- 雷 + 圣：天罚 ---- 一根**金色粗雷柱从天上贯到地面**，地上留裂纹。
     天罚的辨识点是"自上而下的一根"，不是"围着中心炸一圈"，所以 bolt 必须从 y=7 起。 */
  'holy|thunder': { name: '天罚', run(p){
    const top = new THREE.Vector3(p.x, 7.2, p.z);
    const bot = new THREE.Vector3(p.x, 0.05, p.z);
    FX.bolt(top, bot, { color: 0xffe066, core: 0xffffff, glow: 0xfff2b0,
      branch: 3, width: 0.16, life: 0.42, seg: 14, chaos: 0.55 });
    FX.geyser(p, { h: 3.0, w: .8, opacity: .55, life: .7, tex: 'beam', color: 0xffe066, noMix: true });
    FX.shock(p, 3.4, { color: 0xfff2b0, dur: 0.55 });
    FX.decal(p, 'crack', 3.2, 5, 0xffe9a0);
  } },

  /* ---- 毒 + 圣：解毒雾 ---- 毒雾被**抽走**：绿粒子向内收、金光升起。
     方向是关键：其它反应都是往外炸，只有这个是"往里收"，眼睛一眼能分出"净化"。 */
  'holy|poison': { name: '解毒雾', run(p){
    FX.shock(p, 2.4, { color: 0xfff2b0, dur: 0.4 });
    for(let i=0;i<Math.round(26*Q());i++){
      const a = Math.random()*7, r = 2.0 + Math.random()*0.8;
      const sp = 1.6 + Math.random()*1.0;
      FX.spr(p.x+Math.cos(a)*r, 0.3+Math.random()*1.4, p.z+Math.sin(a)*r, {
        tex: 'smoke', life: .65, s0: .45, s1: .05, a0: .5,
        vx: -Math.cos(a)*sp, vy: .25, vz: -Math.sin(a)*sp, grav: -0.3, drag: .2,
        r: .55, g: .82, b: .48
      });
    }
    for(let i=0;i<Math.round(12*Q());i++){
      const a = Math.random()*7, r = Math.random()*0.8;
      FX.spr(p.x+Math.cos(a)*r, 0.2, p.z+Math.sin(a)*r, {
        tex: 'spark', life: 1.0, s0: .18, s1: .02, a0: .85,
        vy: 2.4+Math.random()*1.2, grav: -1.0, drag: .5, r: 1, g: .96, b: .72
      });
    }
    FX.decal(p, 'acid', 2.2, 3.5, 0x8fd06a);
  } }
};

/* 反应表按"两个元素名排序后拼接"索引 —— 火+冰 与 冰+火 必须是同一条，
   所以要排序，不能按调用顺序。返回名字（没配上返回 null，调用方不必判断）。
   注意：这里只画表现、不改任何数值，命中判定与本函数无关。 */
FX.react = function(pos, a, b){
  if(!a || !b || a === b) return null;
  const k = [a, b].sort().join('|');
  const r = REACT_FX[k];
  if(!r) return null;
  toast('元素反应 · ' + r.name);
  r.run(new THREE.Vector3(pos.x, 0, pos.z));
  return r.name;
};

FX.bolt = function(a, b, o = {}){
  const life = o.life || 0.18;
  const w0 = o.width || 0.09;
  const main = new Bolt(a, b, Object.assign({ maxOp: .72 }, o));
  const list = [main];

  // 白热核心层：与主干共用同一条路径的一层细亮线。
  // 真实雷电是"白芯 + 彩色外晕"，只有一层彩色永远像根霓虹管。
  const core = new Bolt(a, b, Object.assign({}, o, {
    color: o.core != null ? o.core : 0xffffff,
    width: w0 * 0.52,
    life: life * 0.9,
    follow: main
  }));
  core.build(main.points);
  list.push(core);

  // 外层柔光：一闪而过的淡色光晕。没有这层，闪电就是一根"灰电线"
  const glow = new Bolt(a, b, Object.assign({}, o, {
    color: o.glow != null ? o.glow : 0xffa733,
    width: w0 * 2.6,
    life: life * 0.95,
    maxOp: 0.20,
    follow: main
  }));
  glow.build(main.points);
  list.push(glow);

  // 分叉：从头干上半段斜甩出去，越靠落点越短
  const extra = o.branch != null ? o.branch : 2;
  if(Q() > 0.3){
    for(let i=0;i<extra;i++){
      const t = 0.25 + Math.random()*0.45;
      const from = main.points[Math.max(1, Math.floor(main.seg*t))].clone();
      const off = new THREE.Vector3((Math.random()-.5)*2.4, -Math.random()*1.2, (Math.random()-.5)*2.4);
      const br = new Bolt(from, from.clone()
        .addScaledVector(b.clone().sub(a).normalize(), 0.4 + Math.random()*1.0).add(off),
        { color: o.color, width: w0*0.5, seg: 9, chaos: 0.9, life: life*0.7 });
      list.push(br);
    }
  }

  addUpdate({ update(dt){
    // 正序更新：主干必须先动，跟随层（白芯 / 柔光）才能在同一帧贴上去。
    // 倒序会让跟随层用上一帧的路径，画面上就是两根错开的雷。
    for(let i=0;i<list.length;i++){
      if(!list[i].update(dt)){ list.splice(i,1); i--; }
    }
    if(!list.length) this.dead = true;
  }});

  // 回击：雷电落地后会沿同一条通路再闪 1~2 次。
  // 复用主干的路径（重新走形会看起来像两根不同的雷）。
  if(o.restrike !== false){
    const times = 1 + Math.floor(Math.random()*2);
    for(let k=0;k<times;k++){
      delay(0.055 + k*0.05 + Math.random()*0.03, ()=>{
        // 回击必须钉在主雷的路径上：它自己 regen 就会闪出第二根形状不同的雷
        const r = new Bolt(a, b, Object.assign({}, o, { width: w0*0.8, life: life*0.55, follow: main }));
        r.build(main.points);
        addUpdate({ update(dt){ if(!r.update(dt)) this.dead = true; }});
      });
    }
  }
  return main;
};

// ---- 螺旋气流（龙卷） ----
FX.vortex = function(pos, o = {}){
  const life = o.life || 1.2;
  const R = o.r || 1.5;
  const h = o.h || 2.4;
  const col = C(o.color != null ? o.color : E().glow);
  const dirSign = o.dir || 1;
  let t = 0, acc = 0;
  addUpdate({ update(dt){
    t += dt; acc += dt;
    const k = Math.min(1, t/life);
    const rate = 0.016;
    while(acc > rate){
      acc -= rate;
      const ang = t * 11 * dirSign + Math.random()*0.5;
      const kk = Math.random();
      const rr = R * (0.35 + kk*0.75);
      FX.spr(pos.x + Math.cos(ang)*rr, kk*h*0.35, pos.z + Math.sin(ang)*rr, {
        tex:'spark', life: 0.45 + Math.random()*0.35,
        vx: -Math.sin(ang)*2.2*dirSign, vy: 2.2 + Math.random()*1.6, vz: Math.cos(ang)*2.2*dirSign,
        s0: 0.22, s1: 0.02, a0: 0.85, grav: 0.5, drag: 0.6,
        r: col.r, g: col.g, b: col.b
      });
    }
    if(t >= life){ this.dead = true; }
  }});
};

/* ---- 吸怪场（横扫吸怪 / 变体聚怪） ----
 * 旧版只有一个"往外扩"的 ring：环在变大、怪在靠近，两个方向相反，
 * 眼睛读不出"吸"。真实感来自三件事，缺一件都像位置瞬移：
 *   1. 外圈粒子沿螺旋收进中心（角度在转、半径在减），不是一条条径向直线；
 *   2. 每只被吸的怪身上持续抽出一条气射向中心 —— 怪在动，气跟着动，
 *      这才读得出"是被拽着走"；
 *   3. 中心的涡核 + 内缩环，给一个"吸到哪儿去了"的落点。
 * 只画表现：位移仍由技能自己改 e.pos，这个函数一个坐标都不改。
 */
FX.suck = function(center, o = {}){
  const R = o.r || 4;
  const dur = o.dur || 2;
  const col = o.color != null ? o.color : C(E().glow);
  const core = C(E().core);
  const c = new THREE.Vector3(center.x, 0, center.z);
  const targets = o.targets || (typeof ACT.enemies !== 'undefined' ? ACT.enemies : []);
  let t = 0, acc = 0, strawAcc = 0;

  /* 内缩环：环要往里收。外扩环在"吸"这个语义下是错的 —— 那是冲击波 */
  const ring = flatMesh(TEX.ring, col, THREE.AdditiveBlending, 0);
  ring.position.set(c.x, 0.04, c.z);

  /* 涡核：一小片翻卷的雾，原地自转。没有它，粒子飞进中心就凭空消失了 */
  const eye = billMesh(TEX.smoke, core, 0);
  eye.position.set(c.x, 0.55, c.z);
  eye.scale.setScalar(R*0.55);
  eye.userData.noBB = true;

  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/dur);
    const inK = Math.min(1, t/0.25);
    const outK = k > 0.85 ? Math.max(0, 1-(k-0.85)/0.15) : 1;
    const e = 1 - Math.pow(1-inK, 3);

    /* 1) 外圈螺旋吸入：切向速度负责"旋"，径向速度负责"吸" */
    acc += dt;
    /* 慢一点、密一点：内速 5 的话粒子 0.4 秒就飞完，眨一下眼什么都没了；
       2.6 + 切向 2.2 才会"绕着往里走"，螺旋才看得出来 */
    const rate = 0.005 / Math.max(0.4, Q());
    while(acc > rate){
      acc -= rate;
      /* 角度不能纯随机 —— 随机撒点只会得到"一圈乱飞的光点"，
         看不出在"转"。四条臂 + 全局相位，粒子落在四条一起旋转的射线上，
         整簇才读成漩涡。 */
      const phase = t * 1.9;
      const arm = Math.floor(Math.random()*4) * (Math.PI/2);
      const a = phase + arm + (Math.random()-0.5)*0.20;
      const rr = R*(0.82 + Math.random()*0.26);
      const inSp = 2.6 + Math.random()*1.2, tanSp = 2.2;
      FX.spr(c.x + Math.cos(a)*rr, 0.15 + Math.random()*1.5, c.z + Math.sin(a)*rr, {
        tex: 'soft', life: 0.85 + Math.random()*0.35,
        s0: 0.62, s1: 0.10, a0: 0.7 * e * outK,
        vx: -Math.cos(a)*inSp - Math.sin(a)*tanSp,
        vz: -Math.sin(a)*inSp + Math.cos(a)*tanSp,
        vy: 0.15, grav: 0.2, drag: 0,
        r: core.r, g: core.g, b: core.b
      });
    }

    /* 2) 每只被吸的怪：从身上抽一条气射向中心。怪走一步、气跟一步 */
    strawAcc += dt;
    if(strawAcc > 0.09){
      strawAcc = 0;
      targets.forEach(en=>{
        if(!en || en.deadT > 0) return;
        const d = Math.hypot(en.pos.x - c.x, en.pos.z - c.z);
        if(d > R*1.05 || d < 0.35) return;      // 太远没吸到、太近已经撞脸
        const n = Q() > 0.5 ? 2 : 1;
        for(let i=0;i<n;i++){
          const sx = en.pos.x + (Math.random()-0.5)*0.5;
          const sz = en.pos.z + (Math.random()-0.5)*0.5;
          const ux = (c.x - sx)/d, uz = (c.z - sz)/d;
          const sp = 4.0 + Math.random()*1.6;
          FX.spr(sx, 0.45 + Math.random()*1.0, sz, {
            tex: 'soft', life: 0.55 + Math.random()*0.2,
            s0: 0.34, s1: 0.06, a0: 0.8 * outK,
            vx: ux*sp, vy: 0.2 + Math.random()*0.5, vz: uz*sp, grav: 0.1, drag: 0,
            r: core.r, g: core.g, b: core.b
          });
        }
      });
    }

    /* 3) 涡核 + 内缩环 */
    const rk = Math.min(1, t/0.55);
    ring.scale.setScalar(R*1.05 * (1 - rk*0.9));
    ring.material.opacity = 0.7 * (1-rk) * outK;
    eye.quaternion.copy(CAM.quaternion);
    eye.rotateZ(-t*3.4);
    eye.scale.setScalar(R*0.55 * (1 + Math.sin(t*6)*0.06));
    eye.material.opacity = 0.32 * e * outK;

    if(k >= 1){
      ROOT.remove(ring); ROOT.remove(eye);
      this.dead = true;
    }
  }});
};

/* ---- 领域：四种剪影，不是四种颜色 ----
 *
 * 旧版所有领域共用同一副骨架（地面圆盘 + 圆柱 + 环墙），只换颜色与贴图 ——
 * 灰度截图里太极 / 毒雾 / 剑阵 / 法阵读起来是同一个东西。
 * 现在按 kind 分开：
 *
 *   sigil   法阵：地纹 + 中央光柱 + 环墙 + 脉冲      （天师符 / 召唤阵）
 *   taiji   太极：双鱼地纹 + 两股反向螺旋气旋，没有柱  （太极玄阵）
 *   mist    雾  ：没有边界、没有柱，只有翻滚的雾团     （蚀骨毒雾）
 *   blades  剑阵：淡地纹 + 环绕剑影 + 拖尾            （剑阵）
 *
 * 外轮廓分别是「圆 + 柱」「双螺旋」「不规则的团」「轨道」，遮住颜色也分得开。
 * 地纹亮度一律压到 0.85 以下：太极原稿白得压过整个场景，纹路反而看不见。
 */
FX.field = function(pos, o = {}){
  const kind = o.kind || 'sigil';
  const R = o.r || 3.2;
  const life = o.life || 4.5;
  const col = o.color != null ? o.color : C(E().glow);
  const colCore = C(E().core);
  const mixE = E2();
  const sigMax = o.opacity != null ? o.opacity : 0.85;
  const spin = o.spin != null ? o.spin : 0.22;

  const grp = new THREE.Group();
  grp.position.set(pos.x, 0, pos.z);
  ROOT.add(grp);

  const mats = [];        // 统一回收的材质
  const geos = [];

  /* 地纹：雾不画 —— 带着一圈清晰圆边的"雾"，读起来是一张绿饼 */
  let sig = null;
  if(kind !== 'mist'){
    const texName = o.tex || (kind === 'taiji' ? 'taiji' : 'sigil');
    const base = kind === 'taiji'  ? sigMax * 0.46
               : kind === 'blades' ? sigMax * 0.26
               : sigMax;
    const mat = new THREE.MeshBasicMaterial({ map: TEX[texName], color: col,
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    sig = new THREE.Mesh(_plane, mat);
    sig.rotation.x = -Math.PI/2; sig.position.y = 0.02;
    sig.scale.setScalar(R*2);
    sig.userData.base = base;
    grp.add(sig); mats.push(mat);
  }

  /* 柱与环墙只属于法阵。太极换成气旋，雾什么都不长 */
  let colMesh = null, walls = [];
  if(kind === 'sigil'){
    const colGeo = new THREE.CylinderGeometry(R*0.92, R*0.92, 2.6, 32, 1, true);
    const colMat = new THREE.MeshBasicMaterial({ map: TEX.beam, color: col, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    colMesh = new THREE.Mesh(colGeo, colMat);
    colMesh.position.y = 1.3; colMesh.rotation.y = Math.PI/2;
    grp.add(colMesh);
    mats.push(colMat); geos.push(colGeo);

    const wallGeo = new THREE.CylinderGeometry(R, R, 1.5, 40, 1, true);
    geos.push(wallGeo);
    [1,-1].forEach(sgn=>{
      const wm = new THREE.MeshBasicMaterial({ map: TEX.beam, color: col, transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(wallGeo, wm);
      m.position.y = 0.55; m.rotation.y = Math.PI/2;
      m.userData.s = sgn;
      grp.add(m); walls.push(m); mats.push(wm);
    });
  }

  /* 太极的体积感：两根气旋柱，长在两个鱼眼上、跟着双鱼一起转。
     单靠撒粒子做螺旋，在 51° 俯角下会投影成中心一坨白雾 —— 粒子太细，
     而"两根柱"是实打实的竖直物体，俯视时最占屏幕的正是竖直方向。 */
  let taijiCols = [];
  if(kind === 'taiji'){
    for(let i=0;i<2;i++){
      const geo = new THREE.CylinderGeometry(R*0.30, R*0.18, 2.9, 18, 1, true);
      const mat = new THREE.MeshBasicMaterial({ map: TEX.beam, color: i ? col : colCore,
        transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 1.45;
      grp.add(m); taijiCols.push(m); mats.push(mat); geos.push(geo);
    }
  }

  /* 雾片：NormalBlending。加色混合的雾会变成一团荧光绿，反而更像光效 */
  const puffs = [];
  if(kind === 'mist'){
    const n = Q() > 0.5 ? 9 : 5;
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const rr = Math.sqrt(Math.random()) * R * 0.82;
      const s0 = R * (0.55 + Math.random()*0.55);
      const m = billMesh(TEX.smoke, col, 0, THREE.NormalBlending);
      m.position.set(pos.x + Math.cos(a)*rr, 0.15 + Math.random()*0.3, pos.z + Math.sin(a)*rr);
      m.scale.set(s0, s0*0.78, 1);
      m.renderOrder = 6;
      m.userData = { s0, ph: Math.random()*7, ox: Math.cos(a)*rr, oz: Math.sin(a)*rr,
                     noBB: true, ry: Math.random()*7 };
      puffs.push(m); mats.push(m.material);
    }
  }

  /* 剑影：剑得是"立着的剑"，不是贴地的弧 —— 贴地弧就是刀气，会跟旋风斩撞 */
  const swords = [];
  if(kind === 'blades'){
    const n = Q() > 0.55 ? 4 : 2;
    for(let i=0;i<n;i++){
      const mat = new THREE.MeshBasicMaterial({ map: TEX.blade, color: col, transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(_plane, mat);
      m.userData.noBB = true;
      m.renderOrder = 5;
      ROOT.add(m); mats.push(mat);
      swords.push({ m, a: i/n*Math.PI*2, r: R*0.74 + (i%2)*0.3,
                    rib: new Ribbon({ width: 0.5, color: colCore, life: 0.34, segs: 12 }) });
    }
  }

  let t = 0, pulseT = 0, spiralAcc = 0, bubbleAcc = 0;
  const camQ = CAM.quaternion;

  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/life);
    const inK = Math.min(1, t/0.35);
    const e = 1 - Math.pow(1-inK, 3);                       // 入场缓出
    const outK = k > 0.85 ? Math.max(0, 1 - (k-0.85)/0.15) : 1;

    if(sig){
      sig.material.opacity = sig.userData.base * e * outK;
      sig.scale.setScalar(R*2 * (0.55 + e*0.45));
      sig.rotation.z += dt * spin;
    }
    if(colMesh){
      colMesh.material.opacity = 0.06 * e * outK * (0.8 + 0.2*Math.sin(t*3));
      colMesh.rotation.y += dt * 0.35;
    }
    const wallMax = o.wall != null ? o.wall : 0.2;
    walls.forEach(w=>{
      w.material.opacity = wallMax * e * outK * (0.75 + 0.25*Math.sin(t*5 + w.userData.s));
      w.rotation.y += dt * 0.55 * w.userData.s;
    });

    /* 太极：两根气旋柱长在鱼眼上，跟双鱼图同速公转（sig 的 spin 就是它）。
       柱里再撒细粒子，让气流是"活的"而不是两根玻璃管。 */
    if(kind === 'taiji'){
      const eyeA = sig ? sig.rotation.z : t*spin;
      taijiCols.forEach((m, i)=>{
        const a = eyeA + i*Math.PI;
        m.position.x = Math.cos(a) * R * 0.50;
        m.position.z = Math.sin(a) * R * 0.50;
        m.rotation.y += dt * (i ? -2.2 : 2.2);
        m.material.opacity = (i ? 0.26 : 0.34) * e * outK * (0.8 + 0.2*Math.sin(t*4 + i*2));
      });
      spiralAcc += dt;
      const rate = 0.016 / Math.max(0.4, Q());
      while(spiralAcc > rate){
        spiralAcc -= rate;
        for(let i=0;i<2;i++){
          const a = eyeA + i*Math.PI + (Math.random()-0.5)*0.9;
          const rr = R * 0.50 + (Math.random()-0.5)*R*0.36;
          const y = 0.1 + Math.random()*2.8;
          const c = i ? col : colCore;
          FX.spr(pos.x + Math.cos(a)*rr, y, pos.z + Math.sin(a)*rr, {
            tex: i ? 'smoke' : 'soft', life: 0.6 + Math.random()*0.4,
            s0: 0.22 + Math.random()*0.2, s1: 0.04, a0: (i ? 0.30 : 0.45) * outK,
            vx: -Math.sin(a)*(i?-1:1)*0.9, vy: 1.4 + Math.random()*0.7,
            vz: Math.cos(a)*(i?-1:1)*0.9, grav: -0.3, drag: 0.5,
            r: c.r, g: c.g, b: c.b
          });
        }
      }
    }

    /* 雾：只在原地翻滚 + 缓慢鼓泡。没有边界线、没有柱，所以它是一团"气" */
    if(kind === 'mist'){
      puffs.forEach((m, i)=>{
        const ud = m.userData;
        ud.ry += dt * 0.3;
        m.quaternion.copy(camQ);
        m.rotateZ(ud.ry);
        const br = 1 + Math.sin(t*0.9 + ud.ph)*0.10;
        m.scale.set(ud.s0*br, ud.s0*0.78*br, 1);
        m.position.x = pos.x + ud.ox + Math.sin(t*0.5 + ud.ph)*0.22;
        m.position.z = pos.z + ud.oz + Math.cos(t*0.43 + ud.ph)*0.22;
        m.position.y = 0.16 + Math.sin(t*0.6 + ud.ph)*0.10;
        m.material.opacity = 0.30 * e * outK * (0.72 + 0.28*Math.sin(t*1.3 + ud.ph));
      });
      bubbleAcc += dt;
      while(bubbleAcc > 0.07){
        bubbleAcc -= 0.07;
        const a = Math.random()*Math.PI*2, rr = Math.sqrt(Math.random())*R*0.78;
        FX.spr(pos.x + Math.cos(a)*rr, 0.1, pos.z + Math.sin(a)*rr, {
          tex: 'smoke', life: 0.9 + Math.random()*0.6, s0: 0.28, s1: 0.95, a0: 0.2,
          vy: 0.32 + Math.random()*0.22, grav: -0.22, drag: 0.85,
          r: col.r, g: col.g, b: col.b
        });
      }
    }

    /* 剑阵：椭圆轨道，剑身朝切线方向立起来 */
    if(kind === 'blades'){
      swords.forEach((s, i)=>{
        s.a += dt * 2.2;
        const x = pos.x + Math.cos(s.a) * s.r;
        const z = pos.z + Math.sin(s.a) * s.r * 0.78;
        const y = 0.95 + Math.sin(s.a*2 + i) * 0.22;
        s.m.position.set(x, y, z);
        s.m.quaternion.copy(camQ);
        s.m.rotateZ(-s.a + Math.PI/2);
        s.m.scale.set(0.55, 1.55, 1);
        s.m.material.opacity = 0.85 * outK;
        s.rib.push(_tmpA.set(x, y + 0.5, z));
        s.rib.update(dt);
        if(Math.random() < dt*6){
          FX.spr(x, y+0.7, z, { tex:'spark', life:.25, s0:.13, s1:0, a0:.7, grav:0,
            r: colCore.r, g: colCore.g, b: colCore.b });
        }
      });
    }

    /* 边界升起的气流：法阵与太极有，雾没有（雾的边界不该被画出来） */
    if(kind !== 'mist' && kind !== 'blades' && Math.random() < dt*36*Q()){
      const a = Math.random()*Math.PI*2;
      /* 边界气流也吃混色：整圈都同色的话，副元素只在地面纹路上才看得见 */
      const mixed = mixE && Math.random() < MIX.count;
      const mc = mixed ? C(mixE.glow) : col;
      FX.spr(pos.x + Math.cos(a)*R, 0.05, pos.z + Math.sin(a)*R, {
        tex: mixed ? mixE.tex : 'spark', life: 0.9, s0: 0.15, s1: 0, vy: 1.4, a0: 0.75, grav: -0.4,
        r: mc.r, g: mc.g, b: mc.b
      });
    }

    /* 脉冲：雾不画环（一团雾冒出个圆环就露馅了），只让雾整体鼓一下 */
    pulseT += dt;
    if(pulseT > (o.pulse || 1.6)){
      pulseT = 0;
      if(kind === 'mist'){
        FX.spr(pos.x, 0.4, pos.z, { tex:'smoke', life:.8, s0:.5, s1:1.6, a0:.2,
          grav:-.2, r: col.r, g: col.g, b: col.b });
      } else {
        FX.shock(pos, R*1.02, { color: col, dur: 0.55 });
      }
      if(o.onPulse) o.onPulse();
    }

    if(k >= 1){
      ROOT.remove(grp);
      mats.forEach(m=>m.dispose());
      geos.forEach(g=>g.dispose());
      puffs.forEach(m=>ROOT.remove(m));
      swords.forEach(s=>{ ROOT.remove(s.m); s.rib.destroy(); });
      this.dead = true;
    }
  }});
  return grp;
};

// ---- 地裂 / 落雷 / 火柱：竖直喷发柱 ----
FX.geyser = function(pos, o = {}){
  const h = o.h || 3.2;
  const wScale = o.w || 1;
  const maxOp = o.opacity != null ? o.opacity : 0.95;
  const life = o.life || 0.6;
  const col = o.color != null ? C(o.color) : C(E().glow);
  const texName = o.tex || 'beam';
  const grp = new THREE.Group();
  grp.position.set(pos.x, 0, pos.z);
  ROOT.add(grp);
  const planes = [];
  const N = Q() > 0.55 ? 3 : 1;
  for(let i=0;i<N;i++){
    const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX[texName], color: col, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.position.y = h*0.5;
    m.rotation.y = i * Math.PI / N;
    grp.add(m); planes.push(m);
  }
  const flash = flatMesh(TEX.soft, col, THREE.AdditiveBlending, 0);
  flash.position.set(pos.x, 0.04, pos.z);
  flash.scale.setScalar(2.2);

  /* 混元素：柱子里再插一片**副色细柱**（更窄、转 45°，30% 强度）。
     不放进 `planes` 数组 —— 那一组的 opacity 每帧被 maxOp * fade 覆写，
     副色要按 MIX.alpha 单独算，混在一起就分不开了。
     `o.noMix` 给元素反应自己用：反应已经是"两种元素调好的配色"，
     再叠一层副色会把金火柱调脏。 */
  const e2 = E2();
  let mixP = null;
  if(e2 && !o.noMix){
    mixP = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX[texName], color: C(e2.glow), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mixP.position.y = h*0.5;
    mixP.rotation.y = Math.PI/4;
    grp.add(mixP);
  }

  let t = 0;
  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/life);
    const grow = 1 - Math.pow(1 - Math.min(1, t/0.12), 3);
    const fade = 1 - Math.pow(k, 2.2);
    planes.forEach(p=>{
      p.scale.set((0.9 + k*0.7) * wScale, h*grow, 1);
      p.position.y = h*grow*0.5;
      p.material.opacity = maxOp * fade;
    });
    if(mixP){
      mixP.scale.set((0.9 + k*0.7) * wScale * 0.66, h*grow, 1);
      mixP.position.y = h*grow*0.5;
      mixP.material.opacity = MIX.alpha * fade;
    }
    flash.material.opacity = 0.85 * (1-k);
    flash.scale.setScalar(2.2 + k*1.6);
    if(k >= 1){ ROOT.remove(grp); ROOT.remove(flash); this.dead = true; }
  }});
  return grp;
};

// ---- 锥形喷射（火焰 / 毒雾 / 回春上升） ----
FX.cone = function(pos, dir, o = {}){
  const e = E();
  const n = Math.round((o.n || 22) * Q());
  const len = o.len || 3, spread = o.spread || 0.7;
  const up = o.up || 0.4;
  const core = C(e.core), glow = C(e.glow);
  const src = o.tex || e.tex;
  for(let i=0;i<n;i++){
    const a = (Math.random()-0.5) * spread;
    const sp = len * (0.5 + Math.random()*1.2);
    const g = Math.random() < 0.5 ? core : glow;
    FX.spr(pos.x + (Math.random()-.5)*0.3, pos.y + Math.random()*0.3, pos.z + (Math.random()-.5)*0.3, {
      tex: src, life: (o.life || 0.7) * (0.6 + Math.random()*0.8),
      vx: Math.cos(dir + a) * sp, vy: up*sp*0.5 + Math.random()*1.2, vz: Math.sin(dir + a) * sp,
      s0: (o.size||0.4) * (0.6+Math.random()*0.7), s1: (o.size||0.4)*0.2,
      a0: 0.9, grav: e.grav, drag: 1.6,
      r: g.r, g: g.g, b: g.b, rotV: (Math.random()-.5)*6
    });
  }
};

// ---- 拖尾丝带 ----
class Ribbon {
  constructor(o = {}){
    this.n = o.segs || 18;
    this.width = o.width || 0.35;
    this.color = new THREE.Color(o.color != null ? o.color : E().glow);
    this.tex = o.tex || TEX.slash;
    this.life = o.life || 0.45;
    this.hist = [];
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.n*2*3);
    this.alphaArr = new Float32Array(this.n*2);
    const uvArr = new Float32Array(this.n*2*2);
    for(let i=0;i<this.n;i++){ uvArr[i*4]=i/(this.n-1); uvArr[i*4+1]=0; uvArr[i*4+2]=i/(this.n-1); uvArr[i*4+3]=1; }
    const idx = [];
    for(let i=0;i<this.n-1;i++){ const q=i*2; idx.push(q,q+1,q+2,q+1,q+3,q+2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alphaArr, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms:{ uColor:{ value: this.color }, uTex:{ value: this.tex }, uOp:{ value: 1 } },
      vertexShader:`attribute float aA; varying float vA; varying vec2 vUv;
        void main(){ vA=aA; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`uniform vec3 uColor; uniform sampler2D uTex; uniform float uOp;
        varying float vA; varying vec2 vUv;
        void main(){ vec4 t=texture2D(uTex,vUv); float a=t.a*vA*uOp;
          if(a<0.01) discard; gl_FragColor=vec4(uColor, a); }`,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    ROOT.add(this.mesh);
  }
  push(p){ this.hist.unshift(p.clone()); if(this.hist.length > this.n) this.hist.pop(); }
  update(dt, head){
    this.t = (this.t||0) + dt;
    if(head) this.push(head);
    CAM.getWorldDirection(_camDir);
    const H = this.hist, n = this.n, pa = this.posArr, aa = this.alphaArr;
    for(let i=0;i<n;i++){
      const p = H[Math.min(i, H.length-1)];
      const prev = H[Math.min(Math.max(0,i-1), H.length-1)];
      const next = H[Math.min(i+1, H.length-1)];
      if(!p){ pa.fill(0); aa.fill(0); continue; }
      const tan = _tmpA.copy(next).sub(prev);
      if(tan.lengthSq() < 1e-6) tan.set(0,0,1);
      tan.normalize();
      const side = _tmpB.crossVectors(tan, _camDir).normalize().multiplyScalar(this.width * (1 - i/n) * 0.5);
      pa[i*6]=p.x+side.x; pa[i*6+1]=p.y+side.y; pa[i*6+2]=p.z+side.z;
      pa[i*6+3]=p.x-side.x; pa[i*6+4]=p.y-side.y; pa[i*6+5]=p.z-side.z;
      const a = (1 - i/n) * (i < H.length ? 1 : 0);
      aa[i*2]=a; aa[i*2+1]=a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
    this.mat.uniforms.uOp.value = Math.max(0, 1 - this.t/this.life);
    if(this.t >= this.life){ this.destroy(); return false; }
    return true;
  }
  destroy(){ ROOT.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
FX.ribbon = function(o){ 
  const r = new Ribbon(o);
  addUpdate({ update(dt){
    if(o.follow) o.follow(dt, r);
    if(!r.update(dt, o.head ? o.head(dt) : null)) this.dead = true;
  }});
  return r;
};

// ---- 武器附魔 ----
let enchantMesh = null, enchantT = 0;
FX.enchant = function(on, color){
  if(enchantMesh){ ACT.playerBody.remove(enchantMesh); enchantMesh = null; }
  if(!on) return;
  enchantMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.2),
    new THREE.MeshBasicMaterial({ map: TEX.slash, color: color != null ? color : C(E().glow),
      transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  enchantMesh.position.set(0, 0.35, 0.1);
  enchantMesh.rotation.z = -0.36;
  (ACT.playerBody.userData.armPivot || ACT.playerBody).add(enchantMesh);
};

/* 低画质降级系数 */
let quality = 1;
function Q(){ return quality; }

/* ===== 投射物原语 ===== */
FX.projectile = function(o){
  const from = o.from.clone(), to = o.to.clone();
  const core = billMesh(o.tex || TEX.soft, o.color != null ? o.color : C(E().core), 1);
  core.scale.setScalar(o.size || 0.9);
  const glow = billMesh(TEX.soft, o.glow != null ? o.glow : C(E().glow), .55);
  glow.scale.setScalar((o.size || 0.9) * 2.1);
  /* 混元素：飞行体里再套一层**更小**的副色光晕。
     夹在主光晕里面（不是外面）—— 外面那圈要留给主元素，否则整个球会被副色吃掉。 */
  const _e2p = E2();
  let glow2 = null;
  if(_e2p){
    glow2 = billMesh(TEX.soft, C(_e2p.glow), MIX.alpha);
    glow2.scale.setScalar((o.size || 0.9) * 1.5);
  }
  const pts = [];
  const rib = new Ribbon({ width: o.trailWidth || 0.55, color: o.color != null ? o.color : C(E().core), life: 0.5, segs: 16 });
  let t = 0;
  const speed = o.speed || 16;
  const dist = from.distanceTo(to);
  const dur = Math.max(0.08, dist / speed);
  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/dur);
    const p = _tmpA.copy(from).lerp(to, k);
    p.y += Math.sin(k*Math.PI) * (o.arc || 0.9);
    core.position.copy(p); glow.position.copy(p);
    if(glow2) glow2.position.copy(p);
    core.scale.setScalar((o.size||0.9) * (1 + Math.sin(t*30)*0.08));
    rib.push(p);
    rib.update(dt);
    // 沿路撒火星
    if(Math.random() < dt*50){
      FX.spr(p.x, p.y, p.z, { tex: E().tex, life: .4, s0: .22, s1: 0, a0: .8,
        vx: (Math.random()-.5)*1.2, vy: (Math.random()-.5)*1.2, vz: (Math.random()-.5)*1.2, grav: E().grav });
    }
    if(k >= 1){
      ROOT.remove(core); ROOT.remove(glow);
      if(glow2) ROOT.remove(glow2);
      rib.destroy();
      if(o.onHit) o.onHit(to);
      this.dead = true;
    }
  }});
};

/* ===== 灵兽模型库 ===== */
const BEAST_KINDS = {
  spirit: {
    name:'灵兽', body:0xd8b078, glow:0xff9a3a, rough:.62, em:.24,
    shape:{ size:1, legK:1, lenK:1, bulk:1, headK:1,
            muzzle:.24, ear:.22, mane:5, tailSegs:4, fangs:false, tailLift:-.20 }
  },
  tiger: {
    name:'白虎', body:0xf4f8ff, glow:0xa8d4ff, rough:.5, em:.26,
    shape:{ size:1.12, legK:.86, lenK:1.20, bulk:1.18, headK:1.32,
            muzzle:.11, ear:.11, mane:0, tailSegs:5, fangs:true, tailLift:.30, stripes:true }
  },
  dragon: {
    name:'青龙', body:0x6fd3e8, glow:0x2f9fd6, rough:.34, em:.50, segs:16, shape:{}
  }
};

/* ---------- 骨架小工具：两点之间连一根圆柱 ---------- */
/* 颈、腿这类"从 A 连到 B"的部件，用 bone 定向比手调 rotation 稳；
   改一处尺寸，两端自动跟着走。 */
const _bUp = new THREE.Vector3(0,1,0), _bDir = new THREE.Vector3();
function bone(parent, from, to, rTo, rFrom, mat){
  _bDir.subVectors(to, from);
  const len = _bDir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTo, rFrom, len, 8), mat);
  m.position.copy(from).addScaledVector(_bDir, 0.5);
  m.quaternion.setFromUnitVectors(_bUp, _bDir.clone().normalize());
  parent.add(m);
  return m;
}

/* ---------- 白虎的虎斑 ----------
   纯白模型和灵兽只差"胖瘦"，远看分不出。虎斑是白虎最快的识别符，
   所以用一张程序化贴图（白底 + 深色弯带）当 map 乘上去：
   球体的 u 方向是绕身一圈，竖带正好落在两侧肋部，就是虎纹的走向。 */
let _stripeTex = null;
function stripeTex(){
  if(_stripeTex) return _stripeTex;
  _stripeTex = cv(256, 128, (g,w,h)=>{
    g.fillStyle = '#ffffff'; g.fillRect(0,0,w,h);
    g.strokeStyle = 'rgba(24,32,48,.86)'; g.lineCap = 'round';
    // 粗、疏、歪：虎斑不是均匀条纹，均匀了就成斑马
    for(let i=0;i<9;i++){
      const x = (i + 0.5)/9*w + (Math.random()-.5)*10;
      const wdt = 5 + Math.random()*8;
      g.globalAlpha = 0.45 + Math.random()*0.5;
      g.lineWidth = wdt;
      g.beginPath();
      g.moveTo(x, -4);
      g.bezierCurveTo(x+14, h*0.28, x-16, h*0.68, x+6, h+4);
      g.stroke();
      // 一半的条纹分个叉，读起来像毛不是布
      if(i % 2 === 0){
        g.lineWidth = wdt*0.55;
        g.beginPath();
        g.moveTo(x + 2, h*0.42);
        g.quadraticCurveTo(x + wdt*1.4, h*0.55, x + wdt*1.8, h*0.78);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
  _stripeTex.wrapS = _stripeTex.wrapT = THREE.RepeatWrapping;
  return _stripeTex;
}

/* ---------- 四足兽 ---------- */
function makeQuad(o){
  o = o || {};
  const D = Object.assign({
    size:1, legK:1, lenK:1, bulk:1, headK:1,
    muzzle:.26, ear:.22, earSpread:.58, mane:5, tailSegs:3,
    fangs:false, tailLift:.05, stripes:false
  }, o.shape || {});

  const g = new THREE.Group();
  const bodyCol = o.body != null ? o.body : 0xd8b078;
  const glowCol = o.glow != null ? o.glow : 0xff9a3a;
  const mat = new THREE.MeshStandardMaterial({
    color: bodyCol, emissive: glowCol, emissiveIntensity: o.em != null ? o.em : .24,
    roughness: o.rough != null ? o.rough : .62, metalness: .14,
    map: D.stripes ? stripeTex() : null,
    transparent: true, opacity: .96, fog: false
  });
  /* 头单独一份材质：不贴虎斑 —— 小球面上条纹会挤成"一顶帽子"，
     虎斑只留身上，脸靠鼻头 / 獠牙 / 耳形认。 */
  const headMat = mat.clone();
  headMat.map = null;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xa8f6ff, fog: false });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161c26, emissive: glowCol, emissiveIntensity: .10,
    roughness: .55, metalness: .3, transparent: true, opacity: .92, fog: false
  });

  const s = D.size, bulk = D.bulk, hk = D.headK;
  /* 骨架：先定「髋高 / 腹线 / 背线」三条线，躯干、颈、头全部从这三条线算。
     上一版把躯干和头当两个独立球各调各的，结果头陷进胸腔、腿悬在半空。 */
  const hip   = 0.80 * s * D.legK;        // 髋关节高 = 腿长，脚必须落在 y=0
  const belly = hip * 0.78;               // 腹线
  const back  = belly + 0.33 * s;         // 背线
  const tY    = (belly + back) * 0.5;     // 躯干中心
  const tR    = (back - belly) * 0.5;     // 躯干竖直半径
  const tLen  = 0.55 * s * D.lenK;        // 躯干半长
  const headR = 0.145 * s * hk;
  const headY = back + headR*0.62;        // 头心略高于背线
  const headZ = tLen*0.86 + 0.08*s;       // 头在胸前方
  const hw    = 0.20 * s * bulk;          // 躯干半宽

  // 躯干
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
  torso.scale.set(hw, tR, tLen);
  torso.position.set(0, tY, -0.02*s);
  g.add(torso);

  // 胸腔：把前胸垫厚，形成"抬头挺胸"的兽姿
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
  chest.scale.set(hw*1.05, tR*1.16, 0.22*s*D.lenK);
  chest.position.set(0, tY + 0.03*s, tLen*0.60);
  g.add(chest);

  // 后臀
  const rump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
  rump.scale.set(hw*0.96, tR*1.06, 0.20*s*D.lenK);
  rump.position.set(0, tY + 0.01*s, -tLen*0.64);
  g.add(rump);

  // 颈：从胸口上缘斜着头根，两端由骨架算
  bone(g, new THREE.Vector3(0, back - 0.05*s, tLen*0.70),
          new THREE.Vector3(0, headY - headR*0.30, headZ - headR*0.60),
          0.085*s*hk, 0.130*s*hk, mat);

  /* 头单独一个枢轴：点头 / 转头绕颈根转，而不是自己的球心原地拧 */
  const headPivot = new THREE.Group();
  headPivot.position.set(0, headY, headZ);
  g.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), headMat);
  head.scale.set(0.94, 0.88, 1.06);
  headPivot.add(head);

  /* 吻：一个压扁的球，不是接上去的圆柱。
     圆柱会在脸中间留一道硬缝，近看像戴了个喇叭口；球面自然过渡到颊。
     长度由 D.muzzle 拉 z 缩放控制 —— 短吻 = 猫科，长吻 = 犬科。 */
  const muzzleR = headR*0.52;
  const muzzleL = 1.0 + D.muzzle*1.7;
  const snout = new THREE.Mesh(new THREE.SphereGeometry(muzzleR, 12, 10), headMat);
  snout.scale.set(0.92, 0.80, muzzleL);
  snout.position.set(0, -0.22*headR, headR*0.62);
  headPivot.add(snout);
  const snoutTipZ = headR*0.62 + muzzleR*muzzleL*0.92;

  // 鼻头：让脸有正反面，近看才不是"光头"
  const nose = new THREE.Mesh(new THREE.SphereGeometry(headR*0.22, 8, 6), darkMat);
  nose.scale.set(1.15, 0.85, 0.9);
  nose.position.set(0, -0.16*headR, snoutTipZ - headR*0.04);
  headPivot.add(nose);

  if(D.fangs){
    [-1,1].forEach(sd=>{
      const f = new THREE.Mesh(new THREE.ConeGeometry(headR*0.10, headR*0.62, 5), darkMat);
      f.position.set(sd*0.22*headR, -0.46*headR, snoutTipZ - headR*0.22);
      f.rotation.x = Math.PI;
      headPivot.add(f);
      // 颊毛：猫科的脸宽在腮上，只加大头球会变成一只白狗
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(headR*0.50, 10, 8), headMat);
      cheek.scale.set(0.88, 1.0, 0.72);
      cheek.position.set(sd*0.66*headR, -0.20*headR, 0.06*headR);
      headPivot.add(cheek);
    });
  }

  // 耳 / 眼：白虎耳朵短而圆，灵兽长而尖
  [-1,1].forEach(sd=>{
    const ear = new THREE.Mesh(new THREE.ConeGeometry(headR*0.40, D.ear*s, 6), headMat);
    ear.position.set(sd*D.earSpread*headR, headR*0.72, 0.02);
    ear.rotation.x = -0.14;
    ear.rotation.z = sd*0.20;
    headPivot.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR*0.19, 8, 6), eyeMat);
    eye.position.set(sd*0.56*headR, 0.14*headR, 0.66*headR);
    headPivot.add(eye);
  });

  // 颈背鬃毛：灵兽才有；白虎靠体量与虎斑，不需要毛
  for(let i=0;i<D.mane;i++){
    const k = D.mane > 1 ? i/(D.mane-1) : 0;
    const mane = new THREE.Mesh(new THREE.ConeGeometry(0.018*s, (0.09 + (1-k)*0.05)*s, 5), mat);
    mane.position.set((k%2 ? 1 : -1)*0.035*s, back + 0.02*s - k*0.10*s,
                      tLen*0.72 - k*tLen*0.78);
    mane.rotation.set(-1.15 - k*0.15, 0, (k%2 ? -1 : 1)*0.30);
    g.add(mane);
  }

  // 四腿：每腿一个枢轴，走路才摆得起来
  const legs = [];
  const th = 0.072*s*bulk;
  const up = hip*0.55, lo = hip*0.45;
  [[-0.15, 0.60],[0.15, 0.60],[-0.16, -0.60],[0.16, -0.60]].forEach(([lx,lz])=>{
    const pivot = new THREE.Group();
    pivot.position.set(lx*s*bulk*1.35, hip, lz*tLen);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(th, th*0.80, up, 8), headMat);
    upper.position.y = -up*0.5; pivot.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(th*0.76, th*0.60, lo, 8), headMat);
    lower.position.y = -up - lo*0.5; pivot.add(lower);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(th*0.98, 10, 8), headMat);
    paw.scale.set(1.05, 0.62, 1.55);
    paw.position.set(0, -hip + th*0.62, th*0.35);
    pivot.add(paw);
    // 肩 / 胯的肉：随腿摆，遮住腿和躯干的接缝
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.085*s*bulk, 10, 8), mat);
    joint.scale.set(0.95, 1.10, 1.0);
    pivot.add(joint);
    g.add(pivot); legs.push(pivot);
  });

  /* 尾巴：一段关节链（不是一根斜棍）—— 摆动时是行波，不是整体硬转 */
  const tail = new THREE.Group();
  tail.position.set(0, tY + tR*0.80, -tLen*0.94);
  const tailJoints = [];
  const tn = Math.max(2, D.tailSegs);
  let parent = tail, lenPrev = 0;
  for(let i=0;i<tn;i++){
    const k = i/(tn-1);
    const r = 0.052*s - 0.020*s*k;
    const len = 0.22*s - 0.02*s*k;
    const joint = new THREE.Group();
    joint.position.z = -lenPrev;
    joint.rotation.x = -D.tailLift;          // 略上翘，别拖地
    parent.add(joint);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r*0.82, r, len, 7), mat);
    seg.rotation.x = Math.PI/2;
    seg.position.z = -len/2;
    joint.add(seg);
    tailJoints.push(joint);
    parent = joint; lenPrev = len;
  }
  g.add(tail);

  g.userData = { kind:'quad', legs, tail, tailJoints, headPivot, head, mat, headMat, darkMat,
                 eyeMat, mats:[mat, headMat], opacity:.96,
                 hip, tY, tR, tLen, bodyTop:back, headY, def:D };
  return g;
}

/* ---------- 蛇形龙 ---------- */
function makeDragon(o){
  o = o || {};
  const N = (o.shape && o.shape.segs) || o.segs || 16;
  const bodyCol = o.body != null ? o.body : 0x6fd3e8;
  const glowCol = o.glow != null ? o.glow : 0x2f9fd6;
  const g = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color: bodyCol, emissive: glowCol, emissiveIntensity: o.em != null ? o.em : .5,
    roughness: o.rough != null ? o.rough : .34, metalness: .38,
    transparent: true, opacity: .96, fog: false
  });
  // 鳍要双面、半透 —— 单面的话从背后看会整片消失
  const finMat = new THREE.MeshStandardMaterial({
    color: bodyCol, emissive: glowCol, emissiveIntensity: .62,
    roughness: .5, metalness: .1, transparent: true, opacity: .5,
    side: THREE.DoubleSide, fog: false
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false });

  const segs = [];
  for(let i=0;i<N;i++){
    const k = i/(N-1);
    const r = 0.155*(1 - 0.72*k);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    m.scale.set(1, 0.94, 1.95);         // 沿行进方向拉长，节与节才连得上（1.5 会看出一颗颗珠子）
    g.add(m); segs.push(m);
    if(i > 0 && i < N-3){
      // 背鳍：薄刀片、密排成一条连续脊 —— 稀疏的高刺会变成"剑背鱼"
      const fin = new THREE.Mesh(new THREE.ConeGeometry(r*0.85, r*(i%2 ? 1.5 : 2.0), 3), finMat);
      // y 乘 1/1.95：体节沿行进方向被拉长 1.95 倍，鳍长也会跟着拉成一片帆，这里抵消掉
      fin.scale.set(0.26, 0.51, 1);
      fin.position.set(0, r*0.92, 0);
      fin.rotation.x = -0.72;
      m.add(fin);
    }
  }

  /* 颈鬃：头后一丛后掠的长毛，这是"龙"和"蛇"在剪影上的分界 */
  for(let i=0;i<7;i++){
    const k = i/6;
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.030, (0.34 - k*0.12)*0.51, 4), finMat);
    coat.position.set((i%2 ? 1 : -1)*0.06, 0.06 + Math.sin(k*Math.PI)*0.10, -0.10 - k*0.06);
    coat.rotation.set(-1.35 - k*0.2, (i%2 ? 1 : -1)*0.35, 0);
    segs[1].add(coat);
  }

  // 爪：挂在两处体节上，朝下后方，给"龙"而不是"蛇"的读法
  [3, 7].forEach(si=>{
    if(si >= N) return;
    [-1,1].forEach(sd=>{
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 5), mat);
      claw.scale.set(1, 0.51, 1);          // 同上：抵消体节拉伸
      claw.position.set(sd*0.12, -0.14, 0.02);
      claw.rotation.set(1.0, 0, sd*0.55);
      segs[si].add(claw);
    });
  });

  // 尾鳍：压扁的锥，尖朝后
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.30, 3), finMat);
  tailFin.scale.set(0.24, 0.51, 1);
  tailFin.rotation.x = -Math.PI/2;
  tailFin.position.z = -0.14;
  segs[N-1].add(tailFin);

  /* 头单独一个组：位置由 poseDragon 摆，不挂在体节上（否则会吃到体节的拉伸） */
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 12), mat);
  skull.scale.set(1.0, 0.84, 1.20);
  skull.position.z = 0.04;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.56, 9), mat);
  snout.rotation.x = Math.PI/2;
  snout.position.set(0, -0.045, 0.46);
  head.add(snout);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.080, 0.36, 6), mat);
  jaw.rotation.x = Math.PI/2;
  jaw.position.set(0, -0.135, 0.34);
  head.add(jaw);
  [-1,1].forEach(sd=>{
    // 角：鹿角式后掠
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.62, 6), finMat);
    horn.position.set(sd*0.10, 0.17, -0.12);
    horn.rotation.set(-0.95, 0, sd*0.30);
    head.add(horn);
    // 龙须
    const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.020, 0.70, 4), finMat);
    whisker.position.set(sd*0.12, -0.06, 0.50);
    whisker.rotation.set(1.36, 0, sd*0.32);
    head.add(whisker);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.040, 8, 6), eyeMat);
    eye.position.set(sd*0.118, 0.06, 0.24);
    head.add(eye);
  });
  g.add(head);

  g.userData = { kind:'dragon', segs, head, mat, finMat, eyeMat, N,
                 mats:[mat, finMat], opacity: .96 };
  return g;
}

function makeBeast(kind, opt){
  const K = BEAST_KINDS[kind] || BEAST_KINDS.spirit;
  const o = Object.assign({}, K, opt || {});
  o.shape = Object.assign({}, K.shape || {}, (opt && opt.shape) || {});
  return kind === 'dragon' ? makeDragon(o) : makeQuad(o);
}

/* 旧名保留：外面只关心"给我一只灵兽" */
function makeSpiritBeast(o){ return makeBeast('spirit', o); }

/* ---------- 通用动作 ---------- */
/* amp = 步幅。走动 1、奔跑 1.6、站立 0.25（原地小幅踏步，模型不会僵成雕塑） */
function beastGait(ud, t, amp){
  if(!ud || ud.kind !== 'quad') return;
  const a = amp == null ? 1 : amp;
  ud.legs.forEach((pv, i)=>{
    const ph = (i === 0 || i === 3) ? 0 : Math.PI;   // 对角步：前左 + 后右
    pv.rotation.x = Math.sin(t*11 + ph) * 0.55 * a;
  });
  ud.tailJoints.forEach((j, i)=>{
    j.rotation.y = Math.sin(t*3.1 - i*0.85) * (0.10 + 0.10*a);
  });
  ud.headPivot.rotation.y = Math.sin(t*1.15) * 0.16;
  ud.headPivot.rotation.x = Math.sin(t*1.6) * 0.05 - 0.04*a;
}

/* 沿参数曲线摆蛇形龙：u 是"头"的参数，第 i 节落后 i*du */
const _poseDir = new THREE.Vector3(), _poseFwd = new THREE.Vector3(0,0,1);
const _pose = new THREE.Vector3(), _poseN = new THREE.Vector3();
function poseDragon(dg, path, u, du){
  const ud = dg.userData;
  if(!ud || ud.kind !== 'dragon') return;
  du = du || 0.06;
  const segs = ud.segs;
  for(let i=0;i<segs.length;i++){
    path(u - i*du, _pose);
    path(u - i*du + du*0.9, _poseN);
    segs[i].position.copy(_pose);
    _poseDir.subVectors(_poseN, _pose).normalize();
    segs[i].quaternion.setFromUnitVectors(_poseFwd, _poseDir);
  }
  path(u + du*0.9, _pose);
  path(u + du*2.0, _poseN);
  ud.head.position.copy(_pose);
  _poseDir.subVectors(_poseN, _pose).normalize();
  ud.head.quaternion.setFromUnitVectors(_poseFwd, _poseDir);
}

function beastFade(ud, k){
  if(!ud) return;
  const list = ud.mats || (ud.mat ? [ud.mat] : null);
  if(!list) return;
  const base = ud.opacity != null ? ud.opacity : .96;
  list.forEach(m=>{ m.opacity = base * k; });
}

/* ===== 火柱原语 ===== */
/* =====================================================================
   火柱原语：三片交叉的竖直火焰
   为什么不用 FX.geyser：geyser 是"把一张贴图沿 y 拉长"，火焰会被拉成
   细长条、且三片都朝相机、叠成一张虚影。火柱要的是有厚度的柱体，
   所以这里用固定朝向的交叉平面 + 保持贴图宽高比。
   ===================================================================== */
function fxFlameColumn(pos, o = {}){
  const h = o.h || 4.2;
  const life = o.life || 0.95;
  const col = o.color != null ? o.color : 0xffa050;
  const w = h * (o.ratio || 0.42);
  const grp = new THREE.Group();
  grp.position.set(pos.x, 0, pos.z);
  ROOT.add(grp);

  const planes = [];
  const N = 3;
  for(let i=0;i<N;i++){
    const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.flame, color: col, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    m.rotation.y = (o.rot || 0) + i * Math.PI / N;
    m.renderOrder = 6;
    grp.add(m); planes.push(m);
  }
  // 柱心白热
  const core = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
    map: TEX.flame, color: 0xfff4d0, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, fog: false }));
  core.rotation.y = (o.rot || 0) + 0.5;
  core.renderOrder = 7;
  grp.add(core);

  let t = 0, ember = 0;
  addUpdate({ update(dt){
    t += dt;
    const k = Math.min(1, t/life);
    const grow = 1 - Math.pow(1 - Math.min(1, t/0.18), 3);
    const fade = 1 - Math.pow(k, 2.6);
    planes.forEach((m, i)=>{
      const wob = 1 + Math.sin(t*13 + i*2.1)*0.06;
      m.scale.set(w*(0.8 + k*0.3), h*grow*wob, 1);
      m.position.y = h*grow*wob*0.5;
      m.material.opacity = 0.62 * fade;
    });
    core.scale.set(w*0.5*(0.8 + k*0.3), h*grow*0.92, 1);
    core.position.y = h*grow*0.92*0.5;
    core.material.opacity = 0.30 * fade * (0.8 + Math.sin(t*19)*0.2);

    // 柱身向上窜的火星
    ember += dt;
    if(ember > 0.022 && t < life*0.75){
      ember = 0;
      const a = Math.random()*7, r = Math.random()*w*0.42;
      FX.spr(pos.x + Math.cos(a)*r, 0.2 + Math.random()*h*0.5,
             pos.z + Math.sin(a)*r,
             { tex:'ember', life:.7, s0:.22, s1:0, a0:.85,
               vy: 2.4 + Math.random()*2.4, grav: -1.4, vx:(Math.random()-.5)*.6, vz:(Math.random()-.5)*.6,
               r:1, g:.62, b:.24 });
    }
    if(k >= 1){ ROOT.remove(grp); this.dead = true; }
  }});
}

/* ============================================================
 * 桥接：实验室里「碰 DOM / 碰伤害」的那几个函数
 *
 * 切过来的技能代码会调它们，而它们的定义都在被跳过的段里。语义按游戏走：
 *   伤害一律**不在这里算** —— 判定与扣血是 game.js 的事，
 *   这里只负责「打中的那一下看起来像打中了」。
 * ============================================================ */

function shake(amp, dur) {
  const G = (typeof Game !== 'undefined') ? Game : null;
  if (G && typeof G.shake === 'number') G.shake = Math.max(G.shake, amp || 0.2);
}
/* 顿帧由游戏主循环自己管；这里再动 TIME.scale 会互相打架 */
function hitstop(sec) {}
/* 全屏闪光：游戏侧明令禁止（见 vfx.js 第 5 节），不另起一层 */
function flashAt(worldPos, radius, color, peak) {}
function hurtVignette() {}
/* 飘字走游戏自己的 FX.text（数字样式已统一） */
function damageNumber(pos, value, color, crit) {
  if (typeof FX !== 'undefined' && FX && typeof FX.text === 'function' && pos) {
    FX.text(new THREE.Vector3(pos.x, (pos.y || 0) + 2.2, pos.z),
      Math.round(value), color || '#fff', !!crit);
  }
}
/* 命中判定：**不做伤害**。实验室里这两个会扣木人桩的血并打飞字，
 * 游戏里由 game.js 的 rollDamage / damageEnemy 负责。
 *
 * hitArea 必须返回**空数组**，不能返回 0：实验室的 hitArea 返回命中列表，
 * 技能里有 const hits = hitArea(...); hits.forEach(e => e.knock = ...) 这样的写法。
 * 返回 0 时这一行在**延迟 seq 里**（quake 约 0.35 秒后）抛 TypeError，
 * 而它跑在 FX.update → SKFX.update 的 updater 队列里，不在 SKFX.play
 * 的 try/catch 范围内 —— 会把整帧打断。probe-sfx 只数「有没有粒子上场」，
 * 推 3 帧就停，所以 12/12 全绿也没抓到。
 * 空数组让切过来的代码原样跑：没有敌人可 knock，但也不炸。 */
function hitArea(pos, radius, dmg, o) { return []; }
function hitEnemy(e, dmg, o) { return 0; }
function killEnemy(e) {}

/* 画质档：游戏有 FX.q（低画质时原语自己降级），保持一致 */
function Q() {
  return (typeof FX !== 'undefined' && FX && FX.q) ? FX.q : 1;
}

/* 提示条：游戏有自己的 toast 节流与样式，特效层不抢这个口 */
function toast(msg) {}
/* Buff 图标行：游戏用 statusBuffs 那套，特效层只负责画，不记账 */
function addBuff(key, dur, stacks) {}
function removeBuff(key) {}

/* 台阶：实验室里是「面板上选到第几档」，游戏里就是**这一发技能的等级**。
 * 两处用法语义一致（whirl 的 Lv9 吸怪、poison 的 Lv5 范围）：
 * 到了这一级才画。不读 Game 直接读 _curLv，是为了数组里 37 只共用一份。 */
function tierOn(n) { return _curLv >= (n | 0); }

/* 实验室的三个「演示动作」：转圈 / 挥臂 / 前冲。
 * 游戏里玩家有真实的动作与物理位移，这三样**绝不能**由特效层代劳 ——
 * 转圈会把玩家朝向改掉（P.face），前冲会把位置改掉（lerp 到别处），
 * 挥臂要改模型关节而游戏的角色是 charforge 拼的、没有那个 pivot。
 * 所以一律空实现：动作交给游戏，特效只画。 */
function spinPlayer(dur, speed) {}
function swingArm() {}
function lunge(dist) {}

  /* ============================================================
   * 技能表：37 只 —— 与实验室 SKILLS[key].v2(c) 一一对应
   * 生成自 docs/vfx-playground.html，**别手改**
   * ============================================================ */
  const SKILL_FX = {
    "whirl": function(c) {
    spinPlayer(0.95, 14);
    swingArm();
    lunge(0.5);
    /* 暗黑三那种：几把斧头在**同一个水平面**上平着转。
       旧版是三道"倾斜 35° 的刀气弧" —— 弧躺在地上又各自斜着抬起来，
       看着像三片斜光，不像武器在转。 */
    FX.spinBlades(new THREE.Vector3(c.x,0,c.z), {
      r: 1.85, n: 3, life: 1.0, y: 1.0, spin: 13, color: C(E().glow)
    });
    // 半圈后的补刀：转速回落的一层残影，让"连续转"成立
    delay(0.34, ()=>{
      FX.spinBlades(new THREE.Vector3(ACT.player.pos.x,0,ACT.player.pos.z), {
        r: 2.1, n: 2, life: 0.6, y: 0.95, spin: 11, color: C(E().glow)
      });
    });
    FX.vortex(new THREE.Vector3(c.x,0,c.z), { life: 1.1, r: 1.9, h: 2.6, color: C(E().glow) });
    /* 地面气流圈按技能真实半径（4.2 码）铺开。原来只有 1.5 码，比三把斧头
     * 转出来的 1.85 码还小 —— 玩家看到的是「人在转、斧头在飞，脚下没东西」，
     * 尺子上整段峰值在 2400~2560 之间反复横跳，正好卡在 2500 下界上。
     * 扩到 3.4 码并给一点余量，剪影仍是「水平旋转 + 脚下气流」。 */
    FX.shock(new THREE.Vector3(c.x,0,c.z), 3.4, { color: C(E().glow), dur: 0.5 });

    /* 吸怪（Lv9 台阶）：持续 1.7 秒的抽气场，不是一个瞬间。
       旧实现是命中时每只怪撒 7 颗向心火星 —— 300ms 就没了，而怪是"啪"地
       出现在新位置，中间那段位移没有任何交代。
       FX.suck 画视觉（螺旋吸入 / 从怪身上抽气 / 内缩环），
       位移按 0.4 秒一拍地收，每一拍都有粒子跟着怪走。
       Lv9 以下整段不播 —— 这是台阶演示里最能一眼看出的差别。 */
    if(tierOn(9)){
      const C0 = new THREE.Vector3(c.x, 0, c.z);
      FX.suck(C0, { r: 4.2, dur: 1.7, color: C(E().glow) });
      for(let i=0;i<4;i++){
        delay(0.1 + i*0.4, ()=>{
          ACT.enemies.forEach(e=>{
            if(!e || e.deadT > 0) return;
            const d = Math.hypot(e.pos.x - C0.x, e.pos.z - C0.z);
            if(d > 4.2 || d < 1.1) return;
            const step = Math.min(d*0.34, d - 1.5);
            e.pos.x += (C0.x - e.pos.x)/d * step;
            e.pos.z += (C0.z - e.pos.z)/d * step;
          });
        });
      }
    }
    // 命中
    seq([[0.14, ()=>{
      hitArea(c.aim, 2.7, 26, { kb: 0.1, from: c.aim, color:'#ffe6b0' });
      hitstop(0.045); shake(0.14);
    }]]);
  
    },
    "quake": function(c) {
    lunge(0.8);
    const target = new THREE.Vector3(c.tx, 0, c.tz);
    // 预警：收缩环
    const warn = flatMesh(TEX.ring, C(E().glow), THREE.AdditiveBlending, 0);
    warn.position.set(target.x, 0.03, target.z);
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = Math.min(1, this.t/0.42);
      warn.scale.setScalar(5.6 * (1 - k) + 1.2);
      warn.material.opacity = 0.15 + k*0.7;
      if(k >= 1){ ROOT.remove(warn); this.dead = true; }
    }});
    seq([[0.44, ()=>{
      swingArm();
      // 塌陷：暗盘 + 裂纹
      FX.decal(target, 'crack', 3.2, 6, 0x2a1e14);
      FX.geyser(target, { h: 3.2, w: 2.4, opacity: 0.42, life: 0.75, tex: 'smoke', color: C(0x8a7458) });
      FX.shock(target, 3.2, { color: C(E().glow), dur: 0.5 });
      FX.burst(target, { n: 30, speed: 6.5, life: .8, size: .45, up: 1.9, grav: 5.5, tex:'smoke' });
      // 地面塌陷感：一块暗色圆盘压下
      const pit = flatMesh(TEX.soft, 0x000000, THREE.NormalBlending, 0);
      pit.position.set(target.x, 0.028, target.z); pit.scale.setScalar(3.4);
      addUpdate({ t:0, update(dt){ this.t += dt; const k = Math.min(1, this.t/0.25);
        pit.material.opacity = 0.75 * k; if(k>=1) this.dead = true; }});
      const hits = hitArea(target, 3.0, 46, { kb: 0.35, from: target, critChance: 0.3 });
      hits.forEach(e=>{ e.knock = 0.9; });
      flashAt(target, 2.4, '255,230,180', 0.42);
      hitstop(0.07); shake(0.34, 0.4);
      delay(0.05, ()=> shake(0.18, 0.25));
    }]]);
  
    },
    "swordarray": function(c) {
    /* 剑阵交给 FX.field(kind:'blades') 统一管：
       它自带淡地纹 + 椭圆轨道上的剑影 + 每把剑的拖尾，
       和太极（圆）、毒雾（团）、火墙（线）是同一套骨架的四种外形。
       旧版自己 new 四把剑、外面什么都不长，看起来是"四条白光在绕人"。 */
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const life = 2.6;
    FX.field(pos, { kind:'blades', r: 2.9, life, color: C(E().glow), pulse: 1.3,
      onPulse(){ hitArea(pos, 3.2, 9, { color:'#cfe6ff' }); } });
    /* 剑还会"割"—— 每 0.45 秒补一次小判定，跟剑绕圈的节奏对上，
       只有脉冲的话 1.3 秒才打一下，手感会变成"站着等" */
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t < life - 0.3 && Math.random() < dt*2.2){
        hitArea(pos, 3.4, 6, { color:'#cfe6ff' });
      }
    }});
    seq([[0.12, ()=>{
      FX.shock(pos, 2.2, { color: C(E().glow), dur: 0.4 });
      FX.burst(new THREE.Vector3(c.x,1.2,c.z), { n: 16, speed: 5, life: .5, size: .25 });
    }]]);
    addBuff('swordArray', 3);
  
    },
    "bloodrage": function(c) {
    // 上升血雾（持续 1.2s）
    let bt = 0;
    addUpdate({ update(dt){
      bt += dt;
      if(bt < 1.2){
        for(let i=0;i<Math.round(4*Q());i++){
          const a = Math.random()*7, r = Math.random()*0.85;
          FX.spr(c.x + Math.cos(a)*r, 0.03 + Math.random()*0.25, c.z + Math.sin(a)*r, {
            tex:'smoke', life: 1.2 + Math.random()*0.7, s0: .32, s1: 1.1, a0: .3,
            vx: (Math.random()-.5)*.5, vy: 1.5 + Math.random()*1.5, vz: (Math.random()-.5)*.5,
            grav: -1.3, drag: 0.55, r: .85, g: .1, b: .1, rotV: (Math.random()-.5)*2
          });
        }
        for(let i=0;i<2;i++){
          const a = Math.random()*7, r = .3 + Math.random()*.7;
          FX.spr(c.x + Math.cos(a)*r, 0.1, c.z + Math.sin(a)*r, {
            tex:'ember', life: .9, s0: .18, s1: 0, a0: .9, vy: 2.2, grav: -1.5, r:1, g:.2, b:.15 });
        }
      }
      if(bt > 2.2) this.dead = true;
    }});
    // 心跳双环
    [0, 0.34].forEach((d, i)=> delay(d, ()=>{
      const ring = flatMesh(TEX.shock, 0xff3b30, THREE.AdditiveBlending, 0);
      ring.position.set(c.x, 0.05, c.z);
      addUpdate({ t:0, update(dt){
        this.t += dt; const k = Math.min(1, this.t/0.55);
        /* 原来从 scale 0.4 起步，头 60ms 只有一小团（读数 382），
         * 「血怒开了」这件事要等血雾慢慢升上来才知道。改成起手就有一圈，
         * 后续仍然是向外扩散的心跳，方向不变。
         * 2.2 而不是 1.1：1.1 那版整段峰值只有 907（下界 900），贴着地板过线，
         * 判据会变成噪声敏感；心跳本来就该是一圈能看清的红环。 */
        ring.scale.setScalar((i ? 1.7 : 2.2) + k*1.4);
        ring.material.opacity = (1-k) * (i ? .55 : .9);
        if(k>=1){ ROOT.remove(ring); this.dead = true; }
      }});
      FX.burst(new THREE.Vector3(c.x, .5, c.z), { n: 10, speed: 4.2, life: .6, size: .3, grav:-2 });
      if(i===0){ hurtVignette(); shake(0.1, .3); }
    }));
    // 角色染红
    ACT.playerBody.traverse(o=>{ if(o.material && o.material.emissive) o.material.emissive.setHex(0x220000); });
    delay(1.6, ()=> ACT.playerBody.traverse(o=>{ if(o.material && o.material.emissive) o.material.emissive.setHex(0x000000); }));
    addBuff('bloodrage', 12);
  
    },
    "avatar": function(c) {
    const forms = [
      { n:'斩锋', r:2.6, inner:1.7, span:1.15, tilt:0.45, hud:0xfff0c0, note:'细长' },
      { n:'镇岳', r:1.5, inner:0.55, span:2.7, tilt:0.9,  hud:0xffd8a0, note:'半圆盾弧' },
      { n:'摧城', r:1.25, inner:0.95, span:1.05, tilt:0.3, hud:0xff9a5a, note:'短粗' }
    ];
    const f = forms[stanceIdx % 3]; stanceIdx++;
    /* ---------------- 剑神降世 · 开窗 ----------------
     * 生成器 ALIAS 把实验室 `stance` 映成游戏 `avatar`。P2b 之后这一位是
     * 状态机：**常态换刀式走 game.js 的 bladeFormVfx() → 配方层**，根本不
     * 经过 SKFX；只有 Lv10 终结技的「剑神降世开窗」调
     * `playSkillVfx(id, { radius:3.4, segments:['cast'] })`，才是这一条
     * SKFX 唯一被播到的时刻。
     *
     * 可实验室里它还是「换刀式小弧」，于是大招开窗收到的是一道 2.6 码刀气，
     * 尺子上 0.6 秒只量到 1338 像素。双演出层抢播放口之后没人回头对过口径，
     * 这一条补的就是 game.js 那句注释承诺的「金环 + 上升光柱」。
     * 下面三道刀气弧保留，它说的是「这一发跟着当前刀式走」。 */
    const win = new THREE.Vector3(c.x, 0, c.z);
    const ring = flatMesh(TEX.shock, 0xffd166, THREE.AdditiveBlending, 0.9);
    ring.position.set(win.x, 0.09, win.z); ring.scale.setScalar(4.2);
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.6);
      ring.scale.setScalar(4.2 + k*2.2);
      ring.material.opacity = 0.9 * (1-k);
      if(k>=1){ ROOT.remove(ring); this.dead = true; } }});
    FX.geyser(win, { h: 5.2, w: 1.0, opacity: .55, life: .9, tex:'beam', color: 0xffe9a8 });
    swingArm(); lunge(0.7);
    FX.arc(new THREE.Vector3(c.x,0,c.z), {
      r: f.r, inner: f.inner, span: f.span, tilt: f.tilt, y: 1.0,
      from: -0.9, to: 0.9, life: 0.28, color: C(f.hud), opacity: 1
    });
    FX.enchant(true, C(f.hud));
    FX.burst(new THREE.Vector3(c.tx, .9, c.tz), { n: 14, speed: 5, life: .4, size: .22 });
    if(f.n === '摧城'){
      FX.decal(new THREE.Vector3(c.tx,0,c.tz), 'crack', 1.8, 4, 0x33241a);
      hitstop(0.06); shake(0.22);
    } else { hitstop(0.03); shake(0.12); }
    hitArea(c.aim, 2.6, f.n==='镇岳'?24:34, { kb: 0.2, from: c.aim });
    toast(`兵形 · ${f.n}｜${f.note}`);
    addBuff('stance', 6);
  
    },
    "fireball": function(c) {
    const to = new THREE.Vector3(c.tx, 0.95, c.tz);
    FX.projectile({ from: new THREE.Vector3(c.x, 1.05, c.z), to, speed: 9.5, size: 0.8,
      onHit(p){
        FX.burst(p, { n: 18, speed: 4.5, life: .55, size: .3 });
        FX.shock(p, 1.0, { color: C(E().glow), dur: 0.25 });
        if(E().decal) FX.decal(p, E().decal, 1.2, 3.5, 0x555555);
        hitArea(p, 1.4, 20, { color:'#fff', critChance: 0.22 });
        flashAt(p, 1.2, '255,240,200', 0.28);
        hitstop(0.018);
      }});
    swingArm();
  
    },
    "meteor": function(c) {
    const target = new THREE.Vector3(c.tx, 0, c.tz);
    const warn = flatMesh(TEX.ring, 0xff7a3c, THREE.AdditiveBlending, 0);
    warn.position.set(target.x, 0.03, target.z);
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = Math.min(1, this.t/0.7);
      warn.scale.setScalar(6.4 * (1-k) + 2.0);
      warn.material.opacity = 0.2 + k*0.6;
      if(k>=1){ ROOT.remove(warn); this.dead = true; }
    }});
    // 陨石本体
    const rock = billMesh(TEX.soft, 0xffb060, 1);
    const trail = new Ribbon({ width: 1.4, color: 0xff7a3c, life: 0.55, segs: 20 });
    const start = target.clone().add(new THREE.Vector3(-1.6, 7.4, -2.8));
    let t = 0; const dur = 0.72;
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/dur);
      const e = k*k;
      const p = _tmpA.copy(start).lerp(new THREE.Vector3(target.x, 0.4, target.z), e);
      rock.position.copy(p);
      rock.scale.setScalar(2.6 - k*0.8);
      trail.push(p.clone());
      trail.update(dt);
      if(Math.random() < dt*60) FX.spr(p.x, p.y, p.z, { tex:'ember', life:.5, s0:.6, s1:.1, a0:.9, grav:-1, vx:(Math.random()-.5)*1.5, vy:2, vz:(Math.random()-.5)*1.5 });
      if(k >= 1){
        ROOT.remove(rock); trail.destroy();
        // 蘑菇冲击
        FX.shock(target, 5.0, { color: 0xffc070, dur: 0.7 });
        FX.geyser(target, { h: 5.0, life: 0.9, tex: 'flame', color: 0xffa050 });
        // 白色核心闪光
        const core = flatMesh(TEX.soft, 0xffffff, THREE.AdditiveBlending, 0);
        core.position.set(target.x, 0.06, target.z); core.scale.setScalar(2.0);
        addUpdate({ t:0, update(dt){ this.t += dt; const k = Math.min(1, this.t/0.22);
          core.scale.setScalar(2.0 + k*4.2); core.material.opacity = (1-k)*0.95;
          if(k>=1){ ROOT.remove(core); this.dead = true; } }});
        FX.decal(target, 'scorch', 4.2, 6, 0x2a2018);
        FX.burst(target, { n: 64, speed: 10, life: 1.3, size: .72, up: 1.4, grav: -0.3, tex:'ember' });
        FX.burst(target, { n: 34, speed: 6.5, life: 1.5, size: 1.1, up: .25, grav: 1.2, tex:'smoke' });
        FX.burst(target, { n: 18, speed: 12, life: .7, size: .3, up: 2.2, grav: 6, tex:'spark' });
        hitArea(target, 3.6, 86, { critChance: 0.3 });
        flashAt(target, 3.4, '255,190,130', 0.6);
        hitstop(0.09); shake(0.5, 0.55);
        this.dead = true;
      }
    }});
  
    },
    "firewall": function(c) {
    const perx = Math.cos(c.dir), perz = -Math.sin(c.dir);
    const cx = c.x + Math.sin(c.dir) * 2.1, cz = c.z + Math.cos(c.dir) * 2.1;
    const n = 7;
    const flames = [];
    for(let i=0;i<n;i++){
      const off = (i - (n-1)/2) * 1.02;
      const px = cx + perx * off, pz = cz + perz * off;
      // 高度差：中间略高、两端略低，再叠随机抖动，避免顶部排成一条直线
      const mid = 1 - Math.pow(Math.abs(i - (n-1)/2) / ((n-1)/2), 2) * 0.22;
      const hk = mid * (0.86 + Math.random()*0.28);
      const m = billMesh(TEX.flame, 0xffa052, 0.85);
      m.position.set(px, 0.05, pz);
      m.userData.phase = Math.random()*7;
      m.userData.hk = hk;
      m.userData.sw = 0.86 + Math.random()*0.40;
      m.userData.face = Math.random() < 0.5 ? -1 : 1;   // 一半镜像，规律感立刻消失
      m.userData.yo = (Math.random() - 0.5) * 0.18;      // 根部错开，避免热核叠成一条白线
      flames.push(m);
      FX.spr(px, 0.1, pz, { tex:'ember', life:.6, s0:.5, s1:.1, a0:.6, vy:1 });
      // 后排再插一片更矮更暗的，制造纵深，别让它像一排纸片
      if(i % 2 === 0){
        const b = billMesh(TEX.flame, 0xff7a3c, 0.55);
        b.position.set(px + perx*0.3 + Math.sin(c.dir)*0.35, 0.03, pz + perz*0.3 + Math.cos(c.dir)*0.35);
        b.userData.phase = Math.random()*7;
        b.userData.hk = hk * 0.62;
        b.userData.sw = 1.1;
        flames.push(b);
      }
    }
    // 地面光带 + 焦痕
    const strip = flatMesh(TEX.soft, 0xff8a3c, THREE.AdditiveBlending, 0);
    strip.position.set(cx, 0.04, cz);
    strip.rotation.z = -c.dir;
    strip.scale.set(6.6, 1.5, 1);
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.3);
      strip.material.opacity = 0.26 * k * (this.t > 2.6 ? Math.max(0, (3.1-this.t)/0.5) : 1);
      if(this.t > 3.1){ ROOT.remove(strip); this.dead = true; } }});
    FX.decal(new THREE.Vector3(cx, 0, cz), 'scorch', 3.6, 5, 0x241a12);
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      flames.forEach((m, i)=>{
        const g = 1 - Math.pow(1 - Math.min(1, t/0.22), 2);
        const fade = t > 2.6 ? Math.max(0, (3.1-t)/0.5) : 1;
        const sw = m.userData.sw || 1, hk2 = m.userData.hk || 1;
        const sx = (1.95*sw) + Math.sin(t*9 + m.userData.phase)*0.14;
        m.scale.set(sx * (m.userData.face || 1),
                    (3.15*hk2) * g * (0.94 + Math.sin(t*13 + i)*0.06), 1);
        m.material.opacity = 0.60 * fade * (0.86 + Math.sin(t*17 + i*2)*0.14);
        m.position.y = m.scale.y * 0.5 - 0.05 + (m.userData.yo || 0);
        if(Math.random() < dt*6) FX.spr(m.position.x + (Math.random()-.5)*1.4, 0.1 + Math.random()*1.2, m.position.z + (Math.random()-.5)*0.4,
          { tex:'ember', life:.7, s0:.22, s1:0, a0:.8, vy:1.8, grav:-1.2 });
      });
      if(t < 3.1 && Math.random() < dt*2.5){
        hitArea(new THREE.Vector3(cx, 0, cz), 4.2, 8, { color:'#ffb060' });
      }
      if(t >= 3.1){ flames.forEach(m=>ROOT.remove(m)); this.dead = true; }
    }});
    // 起手：地面热浪
    FX.shock(new THREE.Vector3(cx,0,cz), 2.4, { color: 0xff7a3c, dur: 0.35 });
    hitArea(new THREE.Vector3(cx, 0, cz), 3.0, 30, { color:'#ffb060' });
  
    },
    "iceshield": function(c) {
    const geo = new THREE.IcosahedronGeometry(1.05, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms:{ uOp:{ value: 0 }, uColor:{ value: new THREE.Color(0x9ae8ff) }, uTime:{ value: 0 } },
      vertexShader:`varying vec3 vN; varying vec3 vP;
        void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0);
          vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader:`uniform float uOp; uniform vec3 uColor; uniform float uTime;
        varying vec3 vN; varying vec3 vP;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 2.2);
          float bands = smoothstep(0.45, 0.5, abs(fract(vP.y*2.2 + uTime*0.15)-0.5));
          float a = (f*0.9 + bands*0.18) * uOp;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.y = 0.82;
    ROOT.add(shell);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.06, 1),
      new THREE.MeshBasicMaterial({ color: 0xd8f6ff, wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite:false }));
    wire.position.y = 0.82;
    ROOT.add(wire);
    let t = 0; const life = 6;
    let broken = false;
    function breakShield(){
      if(broken) return;
      broken = true;
      FX.burst(_tmpA.set(ACT.player.pos.x, .8, ACT.player.pos.z), { n: 34, speed: 7, life: .9, size: .38, tex:'shard', grav: 2.2, drag: 1.2 });
      FX.shock(_tmpA.set(ACT.player.pos.x, 0, ACT.player.pos.z), 2.2, { color: 0x9ae8ff, dur: 0.4 });
      ROOT.remove(shell); ROOT.remove(wire);
      geo.dispose(); mat.dispose();
      removeBuff('iceshield');
    }
    addUpdate({ update(dt){
      if(broken){ this.dead = true; return; }
      t += dt;
      const inK = Math.min(1, t/0.3);
      mat.uniforms.uOp.value = inK * (t > life-0.4 ? Math.max(0, (life-t)/0.4) : 1);
      wire.material.opacity = 0.12 * inK * (t > life-0.4 ? Math.max(0, (life-t)/0.4) : 1);
      mat.uniforms.uTime.value = t;
      shell.position.set(ACT.player.pos.x, 0.82 + Math.sin(t*1.6)*0.03, ACT.player.pos.z);
      wire.position.copy(shell.position);
      wire.rotation.y += dt*0.3; shell.rotation.y -= dt*0.2;
      if(t >= life) breakShield();
    }});
    addBuff('iceshield', 6);
    // 起手结晶
    for(let i=0;i<14;i++){
      const a = i/14*7;
      FX.spr(c.x + Math.cos(a)*1.2, 0.6 + Math.random()*0.9, c.z + Math.sin(a)*1.2, {
        tex:'shard', life:.6, s0:.3, s1:.05, a0:1, vx:-Math.cos(a)*2, vy:0, vz:-Math.sin(a)*2, grav:0.2, rotV:2
      });
    }
    FX.shock(new THREE.Vector3(c.x,0,c.z), 1.4, { color: 0x9ae8ff, dur: 0.3 });
  
    },
    "elementavatar": function(c) {
    const life = 8;
    const col = C(E().glow), coreCol = C(E().core);

    // 背后主光环（正对镜头的圆光，佛光的主体）
    const halo = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.halo, color: col, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    halo.renderOrder = 4;
    ROOT.add(halo);

    // 第二层光环：更大更淡，反向转，做出"佛光在转"的感觉
    const halo2 = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.halo, color: coreCol, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    halo2.renderOrder = 4;
    ROOT.add(halo2);

    // 人形光边：贴合角色体型的一层剪影，让"人形"是包在角色身上而不是另一个人
    const shape = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.avatar, color: coreCol, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    shape.renderOrder = 5;
    ROOT.add(shape);

    // 身上柔光
    const aura = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.soft, color: col, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    aura.renderOrder = 3;
    ROOT.add(aura);

    // 脚下光轮（平铺）+ 贴地光环
    const ring = flatMesh(TEX.ring, col, THREE.AdditiveBlending, 0);
    const ringGlow = flatMesh(TEX.halo, col, THREE.AdditiveBlending, 0);

    // 头后实心光晕：只有线条会像刺猬，要有一团"光量"才像佛光
    const disc = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
      map: TEX.soft, color: col, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false }));
    disc.renderOrder = 3;
    ROOT.add(disc);

    // 跟随角色的暖光：佛光要"照在人身上"，否则角色只是黑剪影，读不出人形
    const lamp = new THREE.PointLight(col.getHex ? col.getHex() : 0xffe9a8, 2.2, 6, 2);

    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      const inK = Math.min(1, t/0.45);
      const fade = t > life-0.7 ? Math.max(0, (life-t)/0.7) : 1;
      const pulse = 0.85 + Math.sin(t*2.2)*0.15;
      // 关键：每帧取角色当前位置，光环才不会"留在原地"
      const px = ACT.player.pos.x, py = ACT.player.pos.y, pz = ACT.player.pos.z;

      halo.quaternion.copy(CAM.quaternion);
      halo.rotateZ(t*0.35);
      // 圆心放在头部：佛光是"头后的圆光"，不是胸口的光斑
      halo.position.set(px, py + 1.30, pz);
      halo.scale.setScalar(3.05 * (0.82 + inK*0.18) * (1 + Math.sin(t*1.6)*0.02));
      halo.material.opacity = 0.46 * inK * fade * pulse;

      disc.quaternion.copy(CAM.quaternion);
      disc.position.set(px, py + 1.28, pz);
      disc.scale.setScalar(1.85);
      disc.material.opacity = 0.26 * inK * fade * pulse;

      halo2.quaternion.copy(CAM.quaternion);
      halo2.rotateZ(-t*0.22);
      halo2.position.set(px, py + 1.30, pz);
      halo2.scale.setScalar(1.95 * (0.86 + inK*0.14));
      halo2.material.opacity = 0.22 * inK * fade * pulse;

      shape.quaternion.copy(CAM.quaternion);
      shape.position.set(px, py + 0.84, pz);
      shape.scale.set(1.52, 1.98, 1);
      shape.material.opacity = 0.30 * inK * fade * pulse;

      aura.quaternion.copy(CAM.quaternion);
      aura.position.set(px, py + 0.92, pz);
      aura.scale.set(2.3, 2.8, 1);
      aura.material.opacity = 0.10 * inK * fade;

      ring.position.set(px, py + 0.03, pz);
      ring.scale.setScalar(1.75 + Math.sin(t*2)*0.07);
      ring.material.opacity = 0.5 * inK * fade;

      ringGlow.position.set(px, py + 0.02, pz);
      ringGlow.scale.setScalar(2.7);
      ringGlow.material.opacity = 0.16 * inK * fade * pulse;

      lamp.position.set(px, py + 1.15, pz);
      lamp.intensity = 2.2 * inK * fade * pulse;

      // 沿身体上浮的光点
      if(Math.random() < dt*30){
        const a = Math.random()*7, r = 0.25 + Math.random()*0.55;
        FX.spr(px + Math.cos(a)*r, py + Math.random()*1.4, pz + Math.sin(a)*r,
          { tex:'spark', life:1.1, s0:.18, s1:0, a0:.8, vy:1.5, grav:-0.4,
            vx: Math.cos(a)*0.25, vz: Math.sin(a)*0.25,
            r: coreCol.r, g: coreCol.g, b: coreCol.b });
      }

      if(t >= life){
        [halo, halo2, disc, shape, aura, ring, ringGlow, lamp].forEach(m=>ROOT.remove(m));
        this.dead = true;
      }
    }});

    /* 元素法相是 radius 8 的开窗大招，起手冲击原本只有 3 码，和「贴身佛光」
     * 这个主体剪影的规格差一档。扩到 5.5 码，佛光本体不动。
     *
     * ⚠ 生成器 ALIAS 的坑（U1 踩过一次）：实验室 `avatar` → 游戏 `elementavatar`，
     * 游戏 `avatar`（剑神降世）对应的是实验室 `stance`。按游戏技能 id 直接来
     * 这里改，会改到另一只技能上，而且读数「几乎没动」很难看出是改错了对象。 */
    FX.shock(new THREE.Vector3(c.x,0,c.z), 5.5, { color: col, dur: 0.6 });
    flashAt(new THREE.Vector3(c.x,1.2,c.z), 3.0, '255,240,200', 0.32);
    shake(0.16, 0.4);
    addBuff('avatar', 8);
    avatarOn = true;
    delay(life, ()=>{ avatarOn = false; });
    toast('法相 · 佛光附体 · 全场技能染' + ELEMS[curElem].name + '色');
  
    },
    "talisman": function(c) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.12),
      new THREE.MeshBasicMaterial({ map: TEX.paper, transparent: true, opacity: .95,
        side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ROOT.add(paper);
    const from = new THREE.Vector3(c.x, 1.1, c.z), to = new THREE.Vector3(c.tx, 1.0, c.tz);
    /* 出手回执：符纸竖片只有 0.56×1.12，飞行前 0.3 秒画面里就这一小片
     * 加一条 0.3 宽的飘带，白天亮地面上量到 1021 像素。补一圈朱砂色地面
     * 起手环，负责「我按下去了」；飞行体 / 命中朱砂字的剪影一点不动。 */
    FX.shock(from, 1.8, { color: 0xffd27a, dur: 0.34 });
    const rib = new Ribbon({ width: 0.3, color: 0xffd27a, life: 0.4, segs: 12 });
    let t = 0; const dur = Math.max(0.15, from.distanceTo(to) / 9);
    addUpdate({ update(dt){
      t += dt; const k = Math.min(1, t/dur);
      const p = _tmpA.copy(from).lerp(to, k); p.y += Math.sin(k*Math.PI)*0.5;
      paper.position.copy(p);
      paper.quaternion.copy(CAM.quaternion);
      paper.rotateZ(t * 11);
      rib.push(p); rib.update(dt);
      if(Math.random() < dt*40) FX.spr(p.x, p.y, p.z, { tex:'ember', life:.35, s0:.16, s1:0, a0:.8, grav:-1 });
      if(k>=1){
        ROOT.remove(paper); rib.destroy();
        // 朱砂字
        for(let i=0;i<9;i++){
          const a = i/9*7;
          FX.spr(to.x, to.y, to.z, { tex:'rune', life:.75, s0:.45, s1:.1, a0:1,
            vx: Math.cos(a)*3, vy: 1.4+Math.random()*1.5, vz: Math.sin(a)*3, grav:.6, drag:2,
            r:1, g:.35, b:.25, rotV:(Math.random()-.5)*4 });
        }
        FX.burst(to, { n: 12, speed: 4, life: .5, size: .26, coreHex: 0xffd27a, glowHex: 0xff5a3c });
        hitArea(to, 1.3, 22, { color:'#ffd8a0' });
        hitstop(0.02);
        this.dead = true;
      }
    }});
    swingArm();
  
    },
    "swordrain": function(c) {
    const n = 7;
    const center = new THREE.Vector3(c.tx, 0, c.tz);
    for(let i=0;i<n;i++){
      const off = new THREE.Vector3((Math.random()-.5)*5.2, 0, (Math.random()-.5)*5.2);
      const target = center.clone().add(off);
      seq([[i*0.055, ()=>{
        const blade = billMesh(TEX.blade, C(E().core), 0.95);
        blade.scale.set(0.7, 2.4, 1);
        blade.userData.noBB = true;
        const start = target.clone().add(new THREE.Vector3(off.x*0.8, 9, off.z*0.8 - 1.5));
        let t = 0; const dur = 0.28;
        addUpdate({ update(dt){
          t += dt; const k = Math.min(1, t/dur);
          const e = k*k;
          const p = _tmpA.copy(start).lerp(target, e); p.y += 1.0*(1-e);
          blade.position.copy(p);
          blade.quaternion.copy(CAM.quaternion);
          blade.rotateZ(0.35);
          if(k >= 1){
            ROOT.remove(blade);
            // 落地：剑影残留 + 火花
            const shadow = billMesh(TEX.blade, C(E().glow), 0.75);
            shadow.position.set(target.x, 0.9, target.z);
            shadow.scale.set(0.55, 1.7, 1);
            shadow.userData.noBB = true;
            shadow.quaternion.copy(CAM.quaternion);
            shadow.rotateZ(0.35);
            addUpdate({ t:0, update(ddt){ this.t += ddt;
              shadow.material.opacity = 0.75 * (1 - this.t/0.5);
              shadow.position.y = 0.9 - this.t*0.5;
              if(this.t >= .5){ ROOT.remove(shadow); this.dead = true; } }});
            FX.burst(target, { n: 10, speed: 4, life: .4, size: .22, tex:'spark' });
            FX.decal(target, 'crack', 1.0, 3, 0x3a3020);
            hitArea(target, 1.1, 16, {});
            hitstop(0.01);
            this.dead = true;
          }
        }});
      }]]);
    }
    seq([[0.42, ()=>{
      FX.shock(center, 4.0, { color: C(E().glow), dur: 0.5 });
      shake(0.3, 0.4);
      hitArea(center, 4.4, 30, { critChance: .25 });
    }]]);
  
    },
    "taiji": function(c) {
    const pos = new THREE.Vector3(c.tx, 0, c.tz);
    FX.field(pos, { kind:'taiji', r: 3.4, life: 6, color: C(0xbfe6ff), pulse: 1.6,
      opacity: 0.66, wall: 0.14, spin: 0.42,
      onPulse(){ hitArea(pos, 3.4, 12, { color:'#bfe6ff' }); } });
    // 额外一层阴阳升腾
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 6){ this.dead = true; return; }
      if(Math.random() < dt*26){
        const a = Math.random()*7, r = Math.random()*3.2;
        const yang = Math.cos(a) > 0;
        FX.spr(pos.x + Math.cos(a)*r, 0.08, pos.z + Math.sin(a)*r, {
          tex:'spark', life: 1.0, s0:.18, s1:0, a0:.65, vy: 1.3, grav:-.3,
          r: yang?1:.35, g: yang?.95:.75, b: yang?.8:1
        });
      }
    }});
    addBuff('taiji', 6);
  
    },
    "heal": function(c) {
    /* 起手回执：下面三圈上浮环靠 sin(kπ) 淡入，60ms 时只有 7% 亮度，
     * 玩家按下治疗键的头一瞬什么也看不到。补一圈立即亮、快速淡出的地面环，
     * 仍然是「由下而上」的金色，不改这一位的剪影语义。
     *
     * 用 TEX.shock 而不是 TEX.ring：后者是三条细描边（256 图上 9/6.6/4.2 px），
     * 在白天亮地面上只量到 +28 像素，等于没加。前者是填充渐变环，面积才够
     * 当「按下去了」的回执。 */
    const base = flatMesh(TEX.shock, 0xffe9a8, THREE.AdditiveBlending, 0.9);
    base.position.set(c.x, 0.09, c.z); base.scale.setScalar(3.2);
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.55);
      base.scale.setScalar(3.2 + k*1.4);
      base.material.opacity = 0.9 * (1-k);
      if(k>=1){ ROOT.remove(base); this.dead = true; } }});
    // 持续的上升光尘（不是一次性爆开）
    let ht = 0;
    addUpdate({ update(dt){
      ht += dt;
      if(ht < 1.5){
        const n = Math.round(3 * Q());
        for(let i=0;i<n;i++){
          const a = Math.random()*7, r = Math.random()*1.15;
          FX.spr(c.x + Math.cos(a)*r, 0.02 + Math.random()*0.25, c.z + Math.sin(a)*r, {
            tex:'spark', life: 1.3 + Math.random()*0.9, s0: .26 + Math.random()*.2, s1: 0,
            a0: .95, vy: 1.6 + Math.random()*1.5, vx: Math.cos(a)*0.25, vz: Math.sin(a)*0.25,
            grav: -0.7, drag: 0.35, r: 1, g: .84, b: .48
          });
        }
      }
      if(ht > 2.6) this.dead = true;
    }});
    // 三圈错峰上浮
    [0, .18, .36].forEach((d, i)=> delay(d, ()=>{
      const ring = flatMesh(TEX.ring, 0xffe9a8, THREE.AdditiveBlending, 0);
      ring.position.set(c.x, 0.05, c.z);
      addUpdate({ t:0, update(dt){
        this.t += dt; const k = Math.min(1, this.t/1.4);
        ring.position.y = 0.05 + k*2.0;
        ring.scale.setScalar(0.6 + Math.sin(k*Math.PI)*1.6);
        ring.material.opacity = Math.sin(k*Math.PI) * 0.55;
        if(k>=1){ ROOT.remove(ring); this.dead = true; }
      }});
    }));
    if(playerHP < 400){
      [0,.3].forEach((d,i)=> delay(d, ()=>{
        const ring = flatMesh(TEX.shock, 0xffe9a8, THREE.AdditiveBlending, 0);
        ring.position.set(c.x, 0.06, c.z);
        addUpdate({ t:0, update(dt){ this.t += dt; const k = Math.min(1, this.t/.5);
          ring.scale.setScalar(0.5+k*2); ring.material.opacity = (1-k)*.7;
          if(k>=1){ ROOT.remove(ring); this.dead = true; } }});
      }));
    }
    playerHP = Math.min(1000, playerHP + 260);
    addBuff('heal', 10);
    toast('回春 · 生命 +260');
  
    },
    "summon": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const col = C(0xffd27a);

    // 外层符阵（FX.field 自带脉冲与边界墙）
    FX.field(pos, { r: 2.0, life: 5.6, tex:'sigil', color: col, pulse: 2.2,
      opacity: .62, wall: .18, spin: .30,
      onPulse(){ hitArea(pos, 2.0, 8, { color:'#ffe0a0' }); } });

    // 内层反向旋转的光环
    const inner = flatMesh(TEX.halo, col, THREE.AdditiveBlending, 0);
    inner.position.set(pos.x, 0.035, pos.z);
    inner.scale.setScalar(2.6);

    FX.shock(pos, 2.6, { color: col, dur: .5 });

    delay(0.22, ()=>{
      FX.geyser(pos, { h: 4.4, w: 1.0, opacity: .62, life: .8, tex:'beam', color: 0xffe6b0 });
      flashAt(new THREE.Vector3(pos.x, 1.0, pos.z), 2.6, '255,232,180', .42);
      shake(0.2, .4);
    });

    // 灵兽登场
    delay(0.5, ()=>{
      const beast = makeSpiritBeast({ body: 0xd8b078, glow: 0xff9a3a });
      beast.position.set(pos.x, 0, pos.z);
      beast.rotation.y = ACT.player.face;
      ROOT.add(beast);

      const aura = billMesh(TEX.soft, col, 0);
      aura.userData.noBB = true;
      const bRing = flatMesh(TEX.ring, col, THREE.AdditiveBlending, 0);

      const dirX = Math.sin(ACT.player.face), dirZ = Math.cos(ACT.player.face);
      let t = 0;
      addUpdate({ update(dt){
        t += dt;
        const rise = Math.min(1, t/0.45);
        const walk = Math.max(0, Math.min(1, (t-0.45)/0.65));
        // 从阵心里升起来，再往前走两步
        beast.position.y = -0.55 + rise*0.55;
        beast.position.x = pos.x + dirX * walk * 1.8;
        beast.position.z = pos.z + dirZ * walk * 1.8;
        beast.rotation.y = ACT.player.face + Math.sin(t*1.6)*0.06;

        const ud = beast.userData;
        // 升起时只小步挪，落地后才是完整步幅
        beastGait(ud, t, 0.28 + walk*0.85);
        ud.headPivot.rotation.x = -0.06 - Math.sin(t*1.6)*0.05;

        const fade = t > 4.5 ? Math.max(0, (5.3-t)/0.8) : 1;
        const inK = Math.min(1, t/0.4);
        beastFade(ud, inK * fade);

        aura.quaternion.copy(CAM.quaternion);
        aura.position.set(beast.position.x, beast.position.y + 0.95, beast.position.z);
        aura.scale.set(2.6, 2.0, 1);
        aura.material.opacity = 0.20 * inK * fade;

        bRing.position.set(beast.position.x, 0.04, beast.position.z);
        bRing.scale.setScalar(1.5);
        bRing.material.opacity = 0.45 * inK * fade;

        // 走过的地面留下灵光
        if(Math.random() < dt*18){
          FX.spr(beast.position.x + (Math.random()-.5)*0.9, 0.08,
                 beast.position.z + (Math.random()-.5)*0.9,
                 { tex:'spark', life:.7, s0:.2, s1:0, a0:.8, vy:.8, grav:-.3, r:1, g:.86, b:.55 });
        }
        if(t > 5.3){
          ROOT.remove(beast); ROOT.remove(aura); ROOT.remove(bRing);
          this.dead = true;
        }
      }});

      // 内层光环：反向自转，随法阵一起消
      addUpdate({ t:0, update(dt){
        this.t += dt;
        inner.rotation.z += dt*0.9;
        inner.material.opacity = 0.24 * (1 - Math.min(1, this.t/5.6));
        if(this.t > 5.6){ ROOT.remove(inner); this.dead = true; }
      }});

      addBuff('summon', 7);
    });
    toast('灵兽 · 从阵中踏出');
  
    },
    "thrust": function(c) {
    const dir = c.dir;
    const dx = Math.sin(dir), dz = Math.cos(dir);
    const from = ACT.player.pos.clone();
    const to = new THREE.Vector3(from.x + dx*3.2, 0, from.z + dz*3.2);
    // 位移
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = Math.min(1, this.t/0.18);
      ACT.player.pos.lerpVectors(from, to, k);
      if(k>=1) this.dead = true;
    }});
    swingArm();
    // 沿路径的火线：连续撒火星 + 拉长焦痕
    let st = 0;
    addUpdate({ update(dt){
      st += dt;
      if(st < 0.26){
        for(let i=0;i<3;i++){
          const k = st/0.26;
          const px = from.x + dx*3.2*k + (Math.random()-.5)*0.5;
          const pz = from.z + dz*3.2*k + (Math.random()-.5)*0.5;
          FX.spr(px, 0.1 + Math.random()*0.7, pz, {
            tex:'ember', life:.45, s0:.34, s1:0, a0:.9, vy:1.4, grav:-1.4,
            r:1, g:.55, b:.2 });
        }
      } else this.dead = true;
    }});
    const mid = new THREE.Vector3((from.x+to.x)/2, 0, (from.z+to.z)/2);
    const sc = flatMesh(TEX.scorch, 0x3a2418, THREE.NormalBlending, .55);
    sc.position.set(mid.x, 0.02, mid.z);
    sc.rotation.z = -dir;
    sc.scale.set(1.1, 4.0, 1);
    addUpdate({ t:0, update(dt){ this.t += dt;
      sc.material.opacity = .55 * Math.max(0, 1 - this.t/2.5);
      if(this.t > 2.5){ ROOT.remove(sc); this.dead = true; } }});
    seq([[0.18, ()=>{
      FX.burst(new THREE.Vector3(to.x, .9, to.z), { n: 26, speed: 7, life: .55, size: .42, tex:'ember', up:.8 });
      FX.shock(new THREE.Vector3(to.x, 0, to.z), 2.2, { color: 0xff7a3c, dur: .35 });
      hitArea(to, 2.4, 34, { color:'#ffb060' });
      flashAt(to, 2.6, '255,170,110', .35);
      shake(0.18); hitstop(0.04);
    }]]);
  
    },
    "execute": function(c) {
    const t = new THREE.Vector3(c.tx, 0, c.tz);
    // 预警：脚下收缩的细环
    const warn = flatMesh(TEX.ring, C(0xe0483c), THREE.AdditiveBlending, 0);
    warn.position.set(t.x, 0.03, t.z); warn.scale.setScalar(3.2);
    addUpdate({ t:0, update(dt){ this.t += dt;
      warn.material.opacity = .5 * Math.min(1, this.t/0.28);
      warn.scale.setScalar(3.2 * (1 - this.t/0.55 * 0.55));
      if(this.t > 0.45){ ROOT.remove(warn); this.dead = true; } }});
    seq([[0.16, ()=>{
      // 竖直刀光：从 y=6 劈到地面
      const bl = billMesh(TEX.blade, C(E().core), 0);
      bl.scale.set(1.5, 6.4, 1);
      bl.position.set(t.x, 3.2, t.z);
      addUpdate({ t:0, update(dt){ this.t += dt;
        const k = Math.min(1, this.t/0.16);
        bl.position.y = 3.2 + (1-k)*3.0;
        bl.material.opacity = .95 * (this.t > .22 ? Math.max(0, 1-(this.t-.22)/.18) : k);
        if(this.t > .42){ ROOT.remove(bl); this.dead = true; } }});
      FX.decal(t, 'crack', 2.8, 5, 0x2a1414);
      FX.burst(t, { n: 30, speed: 6.5, life: .7, size: .34, tex:'shard', up:1.6, grav:2.4,
        coreHex: 0xffd8d0, glowHex: 0xc0342c });
      FX.shock(t, 2.6, { color: 0xe0483c, dur: .38 });
      hitArea(t, 2.6, 68, { critChance: .35, color:'#ff9a90' });
      flashAt(t, 1.8, '255,120,110', .28);
      shake(0.22); hitstop(0.05);
    }]]);
    swingArm();
  
    },
    "warcry": function(c) {
    const base = new THREE.Vector3(c.x, 0, c.z);
    // 三层同心环从下往上
    [0, 0.10, 0.20].forEach((d, i)=>{
      delay(d, ()=>{
        const ring = flatMesh(TEX.ring, 0xe0483c, THREE.AdditiveBlending, 0);
        ring.scale.setScalar(1.2);
        addUpdate({ t:0, update(dt){ this.t += dt;
          const k = Math.min(1, this.t/0.5);
          ring.position.set(base.x, 0.1 + k*1.9, base.z);
          ring.scale.setScalar(1.2 + k*4.2);
          ring.material.opacity = .55 * (1-k);
          if(k>=1){ ROOT.remove(ring); this.dead = true; } }});
      });
    });
    // 红色气浪向上
    let wt = 0;
    addUpdate({ update(dt){
      wt += dt;
      if(wt < 0.75){
        for(let i=0;i<Math.round(4*Q());i++){
          const a = Math.random()*7, r = Math.random()*1.0;
          FX.spr(base.x + Math.cos(a)*r, 0.05 + Math.random()*0.4, base.z + Math.sin(a)*r, {
            tex:'smoke', life: 1.1, s0:.32, s1:1.0, a0:.26,
            vx: Math.cos(a)*0.7, vy: 2.2, vz: Math.sin(a)*0.7, grav:-1.1, drag:.5,
            r:.85, g:.14, b:.12 });
        }
      } else this.dead = true;
    }});
    FX.shock(base, 3.4, { color: 0xe0483c, dur: .5 });
    swingArm();
    addBuff('bloodrage', 8);
    hitArea(base, 3.4, 18, { kb: 1.6 });
    setTimeout(()=>{ if(typeof hitArea === 'function') hitArea(base, 3.0, 1, {}); }, 0);
  
    },
    "shieldwall": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const grp = new THREE.Group(); grp.position.copy(pos); ROOT.add(grp);
    const faces = [];
    for(let i=0;i<3;i++){
      const m = billMesh(TEX.sigil, C(E().glow), 0);
      m.userData.noBB = true;
      m.scale.set(3.2, 3.2, 1);
      grp.add(m); faces.push(m);
    }
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/0.25);
      const fade = t > 1.8 ? Math.max(0, (2.3-t)/0.5) : 1;
      faces.forEach((m, i)=>{
        const a = c.dir + (i-1) * 0.55;
        m.position.set(Math.sin(a)*1.4, 1.0, Math.cos(a)*1.4);
        m.rotation.y = a;
        m.material.opacity = .30 * k * fade;
      });
      // 格挡火花
      if(Math.random() < dt * 8){
        const a = c.dir + (Math.random()-.5)*1.1;
        FX.spr(ACT.player.pos.x + Math.sin(a)*1.5, .5 + Math.random()*1.2, ACT.player.pos.z + Math.cos(a)*1.5, {
          tex:'spark', life:.35, s0:.2, s1:0, a0:.9, vy:.4, grav:1.2 });
      }
      if(t > 2.3){ grp.remove(...faces); ROOT.remove(grp); this.dead = true; }
    }});
    FX.shock(pos, 2.0, { color: C(E().glow), dur: .3 });
    addBuff('stance', 3);
  
    },
    "riposte": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    // 金身闪
    const aura = billMesh(TEX.soft, 0xffe066, 0);
    aura.userData.noBB = true;
    aura.position.set(pos.x, 1.0, pos.z); aura.scale.set(3.0, 3.4, 1);
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.3);
      aura.material.opacity = .5 * (1-k);
      if(k>=1){ ROOT.remove(aura); this.dead = true; } }});
    // 反向刀气
    FX.arc(pos, { r: 2.4, inner: 1.4, span: 1.9, tilt: .55, y: .95,
      spin: -16, yaw: c.dir + Math.PI, life: .55, color: C(0xffe066), opacity: .85 });
    delay(0.10, ()=>{
      FX.arc(pos, { r: 2.6, inner: 1.5, span: 1.6, tilt: .62, y: 1.15,
        spin: -14, yaw: c.dir + Math.PI + 1.2, life: .45, color: C(E().core), opacity: .7 });
    });
    swingArm();
    hitArea(pos, 2.8, 40, { color:'#ffe6b0' });
    addBuff('stance', 4);
    shake(0.12);
  
    },
    "leap": function(c) {
    const from = ACT.player.pos.clone();
    const to = new THREE.Vector3(c.tx, 0, c.tz);
    const dur = 0.42;
    // 起跳尘
    FX.burst(from, { n: 14, speed: 2.5, life: .5, size: .5, tex:'smoke', up:.3, grav:1.2 });
    addUpdate({ t:0, update(dt){
      this.t += dt; const k = Math.min(1, this.t/dur);
      ACT.player.pos.lerpVectors(from, to, k);
      ACT.player.pos.y = Math.sin(k*Math.PI) * 2.6;
      if(k>=1){ ACT.player.pos.y = 0;
        FX.shock(to, 3.6, { color: C(E().glow), dur: .5 });
        FX.geyser(to, { h: 3.0, w: 2.2, opacity: .4, life: .7, tex:'smoke', color: C(0x8a7458) });
        FX.burst(to, { n: 30, speed: 6, life: .8, size: .5, tex:'ember', up:1.2, grav:1.6 });
        FX.decal(to, 'crack', 2.6, 4, 0x2a1e14);
        hitArea(to, 3.2, 46, { kb: 1.4, color:'#ffe6b0' });
        flashAt(to, 2.4, '255,225,180', .3);
        shake(0.26); hitstop(0.05);
        this.dead = true;
      }
    }});
    spinPlayer(dur, 9);
  
    },
    "skysfall": function(c) {
    const t = new THREE.Vector3(c.tx, 0, c.tz);
    // 地面预警圈
    const warn = flatMesh(TEX.shock, 0xffd8a0, THREE.AdditiveBlending, 0);
    warn.position.set(t.x, 0.03, t.z); warn.scale.setScalar(7.0);
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.66);
      warn.material.opacity = .55 * k;
      if(k>=1){ ROOT.remove(warn); this.dead = true; } }});
    seq([[0.62, ()=>{
      // 巨剑下落
      const sw = billMesh(TEX.blade, C(E().core), 0);
      sw.scale.set(2.4, 11, 1);
      sw.position.set(t.x, 14, t.z);
      addUpdate({ t:0, update(dt){ this.t += dt;
        const k = Math.min(1, this.t/0.20);
        sw.position.y = 14 - k*11;
        sw.material.opacity = .95;
        if(k>=1){ ROOT.remove(sw); this.dead = true; } }});
      delay(0.19, ()=>{
        FX.decal(t, 'crack', 5.2, 6, 0x2a1e14);
        FX.shock(t, 6.2, { color: 0xffd8a0, dur: .7 });
        FX.geyser(t, { h: 5.5, w: 1.6, opacity: .55, life: .8, tex:'smoke', color: C(0x9a8468) });
        FX.burst(t, { n: 54, speed: 11, life: 1.2, size: .7, tex:'ember', up:1.6, grav:.8 });
        FX.burst(t, { n: 26, speed: 7, life: 1.0, size: .9, tex:'smoke', up:.3, grav:1.4 });
        hitArea(t, 5.6, 92, { kb: 2.2, critChance:.3 });
        flashAt(t, 5.0, '255,235,200', .6);
        shake(0.55, .6); hitstop(0.09);
      });
    }]]);
  
    },
    "pyroclasm": function(c) {
    const base = new THREE.Vector3(c.tx, 0, c.tz);
    FX.decal(base, 'scorch', 5.4, 6, 0x2a1c12);
    const n = 5;
    for(let i=0;i<n;i++){
      const a = i/n*Math.PI*2 + c.dir;
      const px = base.x + Math.cos(a)*2.45, pz = base.z + Math.sin(a)*2.45;
      const p = new THREE.Vector3(px, 0, pz);
      // 每根高度错开，柱顶不齐才像"一丛火柱"
      const hh = 3.5 + (i % 2 ? 0.9 : 0) + Math.random()*0.7;
      delay(i*0.07, ()=>{
        fxFlameColumn(p, { h: hh, life: .95, color: 0xffa050, rot: Math.random()*2 });
        FX.shock(p, 1.9, { color: 0xff7a3c, dur: .32 });
        FX.burst(p, { n: 14, speed: 4, life: .85, size: .38, tex:'ember', up: 3.0, grav: -.6 });
        hitArea(p, 2.2, 26, { color:'#ffb060' });
      });
    }
    // 中心柱最高，把五根串成一个整体
    delay(0.05, ()=>{
      fxFlameColumn(base, { h: 6.4, life: 1.15, color: 0xffc070, rot: .5 });
    });
    delay(0.2, ()=>{
      hitArea(base, 4.2, 40, { color:'#ffb060' });
      flashAt(base, 4.0, '255,190,130', .45);
      shake(0.3);
    });
    hitstop(0.06);
  
    },
    "frostnova": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    for(let i=0;i<3;i++){
      delay(i*0.09, ()=>{
        const r = 1.6 + i*0.9;
        FX.shock(pos, r, { color: 0x9ae8ff, dur: .5 + i*0.12 });
      });
    }
    // 冰刺
    for(let i=0;i<26*Q();i++){
      const a = Math.random()*7, r = 0.6 + Math.random()*3.4;
      FX.spr(pos.x + Math.cos(a)*r, 0.1, pos.z + Math.sin(a)*r, {
        tex:'shard', life:.8, s0:.3, s1:.05, a0:.9, vy: 2.4 + Math.random()*2,
        vx: Math.cos(a)*2.4, vz: Math.sin(a)*2.4, grav: 3.2, rot:.6,
        r:.75, g:.95, b:1 });
    }
    FX.decal(pos, 'frost', 5.4, 5, 0x9ae8ff);
    delay(0.12, ()=>{
      hitArea(pos, 4.2, 30, { kb: .8, color:'#bfe6ff' });
      flashAt(pos, 3.6, '160,230,255', .3);
    });
    shake(0.14);
  
    },
    "iceshard": function(c) {
    const from = new THREE.Vector3(c.x, 1.0, c.z);
    const to = new THREE.Vector3(c.tx, 1.0, c.tz);
    const dir = c.dir;
    const cone = billMesh(TEX.shard, C(0xe8fbff), .95);
    cone.userData.noBB = true;
    cone.scale.set(0.55, 1.9, 1);
    cone.position.copy(from);
    let t = 0;
    const dur = Math.max(0.18, from.distanceTo(to) / 16);
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/dur);
      cone.position.lerpVectors(from, to, k);
      cone.position.y = 1.0;
      cone.rotation.z = -dir;
      if(Math.random() < dt*26){
        FX.spr(cone.position.x, 1.0, cone.position.z, {
          tex:'shard', life:.35, s0:.22, s1:0, a0:.7, grav:.6, r:.8, g:.96, b:1 });
      }
      if(k >= 1){
        ROOT.remove(cone);
        FX.burst(to, { n: 22, speed: 6, life: .6, size: .32, tex:'shard', up:.8, grav:2.6 });
        FX.shock(to, 1.8, { color: 0x9ae8ff, dur: .3 });
        hitArea(to, 2.0, 44, { color:'#bfe6ff' });
        flashAt(to, 1.6, '170,235,255', .25);
        this.dead = true;
      }
    }});
    swingArm();
  
    },
    "blizzard": function(c) {
    const pos = new THREE.Vector3(c.tx, 0, c.tz);
    FX.decal(pos, 'frost', 6.0, 6, 0x9ae8ff);
    /* 起手先圈定暴雪范围。冰晶原本从 7.5 米高空往下砸，头半秒画面里
     * 只有一张淡贴花 —— 玩家按下去了却收不到回执，看起来像空招。
     * 这一环负责「我按下去了」，冰晶负责「雪在下」，分工不同。 */
    FX.shock(pos, 4.4, { color: 0x9ae8ff, dur: 0.5 });
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t < 2.4){
        for(let i=0;i<Math.round(3*Q());i++){
          const a = Math.random()*7, r = Math.random()*3.6;
          const px = pos.x + Math.cos(a)*r, pz = pos.z + Math.sin(a)*r;
          FX.spr(px, 5.0 + Math.random()*1.2, pz, {
            tex:'shard', life:.75, s0:.26, s1:.14, a0:.85,
            vy: -9, grav: 6, rot: 1.2, r:.82, g:.96, b:1 });
        }
      }
      if(t > 3.2) this.dead = true;
    }});
    seq([[0.5, ()=>{ hitArea(pos, 4.0, 22, { color:'#bfe6ff' }); }],
         [1.4, ()=>{ hitArea(pos, 4.0, 22, { color:'#bfe6ff' }); }],
         [2.2, ()=>{ hitArea(pos, 4.0, 22, { color:'#bfe6ff' });
                     FX.shock(pos, 4.4, { color: 0x9ae8ff, dur: .45 }); shake(0.16); }]]);
  
    },
    "chain": function(c) {
    const pts = [new THREE.Vector3(c.x, 1.0, c.z)];
    const pool = ACT.enemies.filter(e=>e.deadT<=0);
    let cur = new THREE.Vector3(c.x, 1.0, c.z);
    const used = new Set();
    for(let i=0;i<4;i++){
      let best=null, bd=1e9;
      pool.forEach(e=>{
        if(used.has(e)) return;
        const d = Math.hypot(e.pos.x-cur.x, e.pos.z-cur.z);
        if(d < bd && d < 7){ bd = d; best = e; }
      });
      if(!best) break;
      used.add(best);
      const p = new THREE.Vector3(best.pos.x, 0.9, best.pos.z);
      pts.push(p); cur = p;
    }
    if(pts.length < 2) pts.push(new THREE.Vector3(c.tx, .9, c.tz));
    for(let i=0;i<pts.length-1;i++){
      delay(i*0.055, ()=>{
        FX.bolt(pts[i], pts[i+1], { color: 0xffe066, branch: 2, width: .16, life: .2 });
        FX.spr(pts[i+1].x, pts[i+1].y, pts[i+1].z, { tex:'spark', life:.3, s0:.5, s1:0, a0:1,
          r:1, g:.95, b:.5 });
      });
    }
    pts.slice(1).forEach(p=>{
      hitArea(new THREE.Vector3(p.x, 0, p.z), 1.4, 34, { color:'#ffe066' });
      flashAt(p, 1.2, '255,240,150', .22);
    });
    shake(0.14);
  
    },
    "starfall": function(c) {
    const base = new THREE.Vector3(c.tx, 0, c.tz);
    for(let i=0;i<5;i++){
      delay(i*0.16, ()=>{
        const a = Math.random()*7, r = Math.random()*3.4;
        const t = new THREE.Vector3(base.x + Math.cos(a)*r, 0, base.z + Math.sin(a)*r);
        const from = t.clone().add(new THREE.Vector3(-1.4, 8.4, -1.8));
        const core = billMesh(TEX.soft, C(0xfff0c0), 1);
        core.scale.setScalar(1.1);
        core.position.copy(from);
        const dur = 0.34;
        addUpdate({ t:0, update(dt){
          this.t += dt; const k = Math.min(1, this.t/dur);
          core.position.lerpVectors(from, t.clone().setY(0.3), k);
          if(Math.random() < dt*30){
            FX.spr(core.position.x, core.position.y, core.position.z, {
              tex:'ember', life:.5, s0:.4, s1:0, a0:.9, vy:.6, grav:-.5, r:1, g:.6, b:.25 });
          }
          if(k>=1){
            ROOT.remove(core);
            FX.shock(t, 2.2, { color: 0xffb060, dur: .32 });
            FX.burst(t, { n: 20, speed: 6, life: .6, size: .4, tex:'ember', up:1.2, grav:.6 });
            FX.decal(t, 'scorch', 2.0, 4, 0x2a1e14);
            hitArea(t, 2.2, 28, { color:'#ffb060' });
            flashAt(t, 1.8, '255,180,120', .22);
            shake(0.1);
            this.dead = true;
          }
        }});
      });
    }
    hitstop(0.05);
  
    },
    "thundercloud": function(c) {
    const pos = new THREE.Vector3(c.tx, 0, c.tz);

    /* 云团：必须用 NormalBlending。
       additive 只能画"发光"，深色云在 additive 下等于看不见，
       之前那团淡紫雾就是这么来的。 */
    const puffs = [];
    for(let i=0;i<9;i++){
      const a = i/9*Math.PI*2 + Math.random()*0.5;
      const r = i === 0 ? 0 : 0.95 + Math.random()*0.95;
      const m = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
        map: TEX.cloudpuff, color: 0x241f30, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.NormalBlending,
        side: THREE.DoubleSide, fog: false }));
      // 大小拉开差距，云才有前后层次，不是一坨
      const s0 = i === 0 ? 4.2 : 1.9 + Math.random()*1.5;
      m.position.set(pos.x + Math.cos(a)*r, 4.15 + (Math.random()-0.5)*0.30,
                     pos.z + Math.sin(a)*r);
      m.scale.set(s0, s0*0.62, 1);
      m.renderOrder = 3;
      m.userData = { s0, ph: Math.random()*7, ox: m.position.x-pos.x, oz: m.position.z-pos.z };
      ROOT.add(m); billboards.push(m);
      puffs.push(m);
    }
    // 云心电光
    const coreGlow = billMesh(TEX.soft, 0xbfd4ff, 0);
    coreGlow.userData.noBB = true;
    coreGlow.position.set(pos.x, 4.15, pos.z);
    coreGlow.scale.set(5.6, 3.6, 1);

    let t = 0, next = 0.35, flash = 0;
    addUpdate({ update(dt){
      t += dt;
      const fade = Math.min(1, t/0.45) * (t > 3.6 ? Math.max(0, (4.3-t)/0.7) : 1);
      puffs.forEach((m, i)=>{
        m.material.opacity = 0.94 * fade;
        m.rotation.z = Math.sin(t*0.5 + m.userData.ph) * 0.07;
        // 缓慢呼吸 + 横向漂移，云才会"翻"起来
        const br = 1 + Math.sin(t*1.1 + m.userData.ph) * 0.035;
        m.scale.set(m.userData.s0*br, m.userData.s0*0.62*br, 1);
        m.position.x = pos.x + m.userData.ox + Math.sin(t*0.7 + m.userData.ph)*0.12;
      });
      flash = Math.max(0, flash - dt*3.6);
      coreGlow.material.opacity = (0.04 + flash*0.80) * fade;

      if(t > next && t < 3.6){
        next = t + 0.36 + Math.random()*0.30;
        flash = 1;
        const a = Math.random()*7, r = Math.random()*2.6;
        const p = new THREE.Vector3(pos.x + Math.cos(a)*r, 0, pos.z + Math.sin(a)*r);
        // 先亮云、再落雷：只落雷不亮云，会像凭空冒出来的
        delay(0.08, ()=>{
          FX.bolt(new THREE.Vector3(p.x + (Math.random()-0.5)*0.5, 3.95, p.z + (Math.random()-0.5)*0.5), p,
            { color: 0xffe066, core: 0xffffff, branch: 3, width: .095, life: .26, seg: 14, chaos: .8 });
          FX.shock(p, 1.8, { color: 0xffe066, dur: .28 });
          FX.decal(p, 'crack', 1.7, 3, 0x3a3020);
          hitArea(p, 1.8, 26, { color:'#ffe066' });
          FX.burst(p, { n: 12, speed: 4.2, life: .4, size: .2, tex:'spark', up: 2.2, grav: 2.4 });
          shake(0.08);
        });
      }
      if(t > 4.3){
        puffs.forEach(m=>ROOT.remove(m));
        ROOT.remove(coreGlow);
        this.dead = true;
      }
    }});
  
    },
    "judgement": function(c) {
    const t = new THREE.Vector3(c.tx, 0, c.tz);
    const warn = flatMesh(TEX.ring, 0xffe066, THREE.AdditiveBlending, 0);
    warn.position.set(t.x, 0.03, t.z); warn.scale.setScalar(4.6);
    addUpdate({ t:0, update(dt){ this.t += dt;
      warn.material.opacity = .6 * Math.min(1, this.t/0.4);
      if(this.t > 0.55){ ROOT.remove(warn); this.dead = true; } }});
    seq([[0.5, ()=>{
      // 雷柱：竖直光柱 + 折线
      // 光柱去掉：竖直渐变贴图拉高后会变成一条扭动的黄绿"蛇"，比闪电更抢眼。
      // 雷击的亮度交给闪电自己（白芯 + 外辉）+ 地面冲击辉光。
      FX.bolt(new THREE.Vector3(t.x, 12, t.z), t, { color: 0xffe066, core: 0xffffff,
        branch: 4, width: .115, life: .34, seg: 13, chaos: .85 });
      FX.shock(t, 4.4, { color: 0xffe066, dur: .55 });
      FX.decal(t, 'crack', 3.6, 6, 0x3a3020);
      FX.burst(t, { n: 34, speed: 9, life: .8, size: .38, tex:'spark', up:2.4, grav:2.2 });
      hitArea(t, 3.8, 110, { critChance: .2, color:'#ffe066' });
      flashAt(t, 4.2, '255,250,210', .7);
      shake(0.5, .55); hitstop(0.09);
    }]]);
  
    },
    "talismanarrow": function(c) {
    const from = new THREE.Vector3(c.x, 1.1, c.z);
    const to = new THREE.Vector3(c.tx, 1.1, c.tz);
    /* 符箭 0.2 秒就飞完，60ms 那一帧之后读数断崖式掉到 100 —— 命中爆点
     * 全是小火星，亮地面上根本收不到。两端各补一圈：出手环 + 命中环，
     * 中间那张「竖长纸片」的剪影保持不变。 */
    FX.shock(from, 1.5, { color: 0xffe0a0, dur: 0.3 });
    const arrow = billMesh(TEX.paper, C(0xffe0a0), .95);
    arrow.userData.noBB = true;
    arrow.scale.set(0.55, 1.5, 1);
    arrow.position.copy(from);
    let t = 0;
    const dur = Math.max(0.2, from.distanceTo(to) / 15);
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/dur);
      arrow.position.lerpVectors(from, to, k);
      arrow.rotation.z = -c.dir + Math.sin(t*18)*0.05;
      if(Math.random() < dt*30){
        FX.spr(arrow.position.x, 1.1, arrow.position.z, {
          tex:'spark', life:.3, s0:.16, s1:0, a0:.8, grav:-.4, r:1, g:.85, b:.5 });
      }
      if(k >= 1){
        ROOT.remove(arrow);
        FX.burst(to, { n: 16, speed: 5, life: .5, size: .26, tex:'spark', up:.6, grav:1.4 });
        FX.shock(to, 2.0, { color: 0xffe0a0, dur: 0.36 });
        hitArea(to, 1.6, 30, { color:'#ffe6b0' });
        this.dead = true;
      }
    }});
    swingArm();
  
    },
    "mastersigil": function(c) {
    const pos = new THREE.Vector3(c.tx, 0, c.tz);
    FX.field(pos, { r: 3.8, life: 5, tex: 'sigil', color: C(0xffe066), pulse: 1.2,
      opacity: 0.55, wall: 0.16, spin: 0.30,
      onPulse(){ hitArea(pos, 3.8, 18, { color:'#ffe066' }); } });
    // 中心光柱
    FX.geyser(pos, { h: 6.4, w: 1.1, opacity: .55, life: 1.4, tex:'beam', color: 0xfff2b0 });
    // 绕圈的符字
    const runes = [];
    for(let i=0;i<6;i++){
      const m = billMesh(TEX.rune, C(0xffe066), 0);
      m.userData.noBB = true; m.scale.setScalar(0.7);
      runes.push(m);
    }
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      const fade = t > 4.2 ? Math.max(0, (5-t)/0.8) : 1;
      runes.forEach((m, i)=>{
        const a = i/6*Math.PI*2 + t*0.9;
        m.position.set(pos.x + Math.cos(a)*2.9, 0.9 + Math.sin(t*1.6 + i)*0.25, pos.z + Math.sin(a)*2.9);
        m.rotation.y = -a;
        m.material.opacity = .8 * Math.min(1, t/0.4) * fade;
      });
      if(t > 5){ runes.forEach(m=>ROOT.remove(m)); this.dead = true; }
    }});
    addBuff('stance', 5);
  
    },
    "whitetiger": function(c) {
    const tiger = makeBeast('tiger');
    const ud = tiger.userData;
    const from = new THREE.Vector3(c.x - Math.sin(c.dir)*2.8, 0, c.z - Math.cos(c.dir)*2.8);
    const to = new THREE.Vector3(c.tx, 0, c.tz);
    tiger.position.copy(from);
    tiger.rotation.y = c.dir;
    ROOT.add(tiger);

    // 起步蹬地的尘
    for(let i=0;i<10*Q();i++){
      FX.spr(from.x + (Math.random()-.5)*0.9, 0.1, from.z + (Math.random()-.5)*0.9, {
        tex:'smoke', life:.5, s0:.3, s1:.9, a0:.20, vy:.5, grav:-.4, r:.9, g:.95, b:1 });
    }
    /* 白虎要 0.42 秒才扑到位，兽身还靠 beastFade 慢慢淡入 —— 头一瞬只有
     * 半透明的白烟，读数 460。补一圈蹬地冲击，把「起跳」这个瞬间钉住，
     * 不改「低伏猫科 + 落点三道爪痕」的主体剪影。 */
    FX.shock(from, 2.2, { color: 0xfff0d0, dur: 0.4 });

    let t = 0;
    const dur = 0.42;
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/dur);
      const e = k*k*(3-2*k);                       // 起步慢、末段扑
      tiger.position.lerpVectors(from, to, e);
      tiger.position.y = Math.sin(k*Math.PI) * 0.85;
      tiger.rotation.x = -Math.sin(k*Math.PI) * 0.26;   // 腰弓起来，头压低
      // 步幅跟着速度：起跳段最快
      beastGait(ud, t, 0.5 + Math.sin(k*Math.PI)*1.15);
      ud.headPivot.rotation.x = 0.22 - Math.sin(k*Math.PI)*0.30;
      beastFade(ud, Math.min(1, t*7) * (k > .90 ? (1-k)/.10 : 1));

      if(Math.random() < dt*26){
        FX.spr(tiger.position.x, 0.2 + Math.random()*0.4, tiger.position.z, {
          tex:'smoke', life:.45, s0:.35, s1:.95, a0:.16, grav:-.3, r:.95, g:.98, b:1 });
      }
      if(k >= 1){
        ROOT.remove(tiger);
        // 三道爪痕
        for(let i=0;i<3;i++){
          delay(i*0.05, ()=>{
            FX.arc(to, { r: 2.2, inner: 1.5, span: 0.7, tilt: .9, y: .8 + i*0.2,
              spin: -10, yaw: c.dir, life: .4, color: C(0xfff0d0), opacity: .85 });
          });
        }
        FX.decal(to, 'crack', 2.4, 5, 0x3a2a1a);
        hitArea(to, 2.8, 62, { kb: 1.2, color:'#fff0d0' });
        flashAt(to, 2.4, '255,240,210', .35);
        shake(0.24); hitstop(0.05);
        this.dead = true;
      }
    }});
  
    },
    "azuredragon": function(c) {
    const center = new THREE.Vector3(c.x, 0, c.z);
    const R = 3.2, life = 2.4;
    const dg = makeBeast('dragon');
    ROOT.add(dg);
    const ud = dg.userData;
    const path = (u, out)=> out.set(center.x + Math.cos(u)*R,
                                    1.15 + Math.sin(u*2)*0.5,
                                    center.z + Math.sin(u)*R);
    const headPos = new THREE.Vector3();
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      const k = t/life;
      poseDragon(dg, path, c.dir + k*Math.PI*2, 0.056);
      beastFade(ud, Math.min(1, t/0.22) * (k > .88 ? Math.max(0, (1-k)/.12) : 1));
      headPos.copy(ud.head.position);

      // 拖尾
      if(Math.random() < dt*40){
        FX.spr(headPos.x, headPos.y, headPos.z, {
          tex:'spark', life:.55, s0:.42, s1:0, a0:.8, grav:-.3, r:.6, g:.92, b:1 });
      }
      // 沿途雷击
      if(Math.random() < dt*4){
        const p = new THREE.Vector3(headPos.x, 0, headPos.z);
        FX.bolt(new THREE.Vector3(p.x, 0.9, p.z), p, { color: 0x9ae8ff, branch: 1, width: .12, life: .18 });
        FX.shock(p, 1.3, { color: 0x9ae8ff, dur: .25 });
        hitArea(p, 1.5, 24, { color:'#bfe6ff' });
      }
      if(t > life){ ROOT.remove(dg); this.dead = true; }
    }});
    addBuff('taiji', 3);
    shake(0.1);
  
    },
    "poison": function(c) {
    const pos = new THREE.Vector3(c.tx, 0, c.tz);
    /* Lv5「毒雾蔓延」是**半径**台阶：雾本来就长在地上，
       再叠一团会变成"两团雾"，而蔓延是"同一团铺得更开"。
       所以只能在本体里读档 —— 这是台阶演示里唯一"必须动本体"的两处之一
       （另一处是 whirl 的吸怪）。 */
    const R = 3.0 * (tierOn(5) ? 1.6 : 1);
    FX.field(pos, { kind:'mist', r: R, life: 4.5, color: C(0x7fbf5a), pulse: 1.0,
      opacity: 0.30, wall: 0.06, spin: 0.16,
      onPulse(){ hitArea(pos, R, 10, { color:'#7fbf5a' }); } });
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t < 4.2){
        for(let i=0;i<Math.round(3*Q());i++){
          const a = Math.random()*7, r = Math.random()*R*0.87;
          FX.spr(pos.x + Math.cos(a)*r, 0.05 + Math.random()*0.3, pos.z + Math.sin(a)*r, {
            tex:'smoke', life: 1.6, s0:.6, s1:1.6, a0:.16,
            vx: (Math.random()-.5)*.4, vy:.35, vz: (Math.random()-.5)*.4, grav:-.2, drag:.6,
            rotV: (Math.random()-.5)*0.8, r:.5, g:.85, b:.35 });
        }
        if(Math.random() < dt*6){
          const a = Math.random()*7, r = Math.random()*2.4;
          FX.spr(pos.x + Math.cos(a)*r, 0.1, pos.z + Math.sin(a)*r, {
            tex:'spark', life:.6, s0:.14, s1:0, a0:.7, vy:.7, grav:-.2, r:.7, g:1, b:.5 });
        }
      } else this.dead = true;
    }});
    hitArea(pos, 3.0, 12, { color:'#7fbf5a' });
  
    },
    "antidote": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    /* 这一整套只活 0.5 秒，慢热就等于没放：原来环的初始 opacity 是 0、
     * 贴地 0.05 米还会被地面深度吃掉一半，白天亮地面上量到 123 像素。
     * 改成起手就亮 + 抬高一点 + 放大一圈，方向仍然是「由外向内收」。 */
    const ring = flatMesh(TEX.ring, C(0x7fbf5a), THREE.AdditiveBlending, 0.85);
    ring.position.set(pos.x, 0.09, pos.z); ring.scale.setScalar(5.0);
    FX.shock(pos, 3.0, { color: 0x7fbf5a, dur: 0.42 });
    addUpdate({ t:0, update(dt){ this.t += dt;
      const k = Math.min(1, this.t/0.5);
      ring.scale.setScalar(5.0 * (1-k) + 0.6);
      ring.material.opacity = .9 * (1-k);
      if(k>=1){ ROOT.remove(ring); this.dead = true; } }});
    for(let i=0;i<40*Q();i++){
      const a = Math.random()*7, r = 2.6 + Math.random()*1.4;
      const sx = pos.x + Math.cos(a)*r, sz = pos.z + Math.sin(a)*r;
      FX.spr(sx, 0.2 + Math.random()*1.2, sz, {
        tex:'spark', life:.7, s0:.34, s1:0, a0:1,
        vx: (pos.x - sx)*3.4, vy: .8, vz: (pos.z - sz)*3.4, grav:-.6,
        r:.6, g:1, b:.55 });
    }
    addBuff('heal', 6);
  
    },
    "revive": function(c) {
    const pos = new THREE.Vector3(c.x, 0, c.z);
    FX.geyser(pos, { h: 7.0, w: 1.2, opacity: .7, life: 1.6, tex:'beam', color: 0xfff2b0 });
    FX.shock(pos, 4.2, { color: 0xffe066, dur: .6 });
    const spirit = billMesh(TEX.avatar, C(0xffe066), 0);
    spirit.userData.noBB = true;
    spirit.scale.set(1.6, 2.9, 1);
    spirit.position.set(pos.x, 0.9, pos.z);
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/1.8);
      spirit.position.y = 0.9 + k * 3.4;
      spirit.material.opacity = .7 * Math.min(1, t/0.35) * (1-k*0.85);
      if(Math.random() < dt*22){
        FX.spr(spirit.position.x + (Math.random()-.5)*1.2, spirit.position.y - 0.6,
               spirit.position.z + (Math.random()-.5)*0.6, {
          tex:'spark', life:1.0, s0:.22, s1:0, a0:.85, vy:1.4, grav:-.5, r:1, g:.9, b:.55 });
      }
      if(t > 1.9){ ROOT.remove(spirit); this.dead = true; }
    }});
    addBuff('heal', 10);
    flashAt(pos, 4.0, '255,240,190', .4);
  
    },
  };

  /* ============================================================
   * 每帧推进：更新队列 + 粒子池 + 贴花淡出
   *
   * 和实验室 simulate() 里那三段的写法一致，但去掉了玩家移动 / 木人桩反应 /
   * 镜头跟随 —— 那些是游戏主循环的事。
   * ============================================================ */
  function update(raw) {
    const dt = Math.min(0.05, Math.max(0, Number(raw) || 0));
    now += dt;
    const stopping = TIME.stop > 0;
    if (stopping) TIME.stop -= dt;
    const step = TIME.pause ? 0 : (stopping ? 0 : dt * TIME.scale);

    for (let i = updaters.length - 1; i >= 0; i--) {
      const u = updaters[i];
      if (u.dead) { updaters.splice(i, 1); continue; }
      u.update(step);
      if (u.dead) updaters.splice(i, 1);
    }
    for (const k in POOLS) POOLS[k].update(step);

    const list = (typeof DECAL !== 'undefined' && DECAL.list) ? DECAL.list : [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d && d.life >= 0 && d.m && d.m.visible) {
        d.life += step;
        const k = d.life / d.max;
        if (k >= 1) d.m.visible = false;
        else d.m.material.opacity = Math.min(1, (1 - k) * 1.6) * 0.92 * Math.min(1, d.life * 6);
      }
    }
  }

  /* 每帧同步：玩家位置 / 朝向 / 敌人列表。
   * 敌人**只读**（技能要「吸怪」「连锁」时找最近的几只），不写。 */
  function sync(playerPos, face, enemies, playerBody, playerRing) {
    if (playerPos) {
      ACT.player.pos.copy(playerPos);
      ACT.player.target.copy(playerPos);
    }
    if (typeof face === 'number') ACT.player.face = face;
    ACT.enemies = Array.isArray(enemies) ? enemies : [];
    if (playerBody) ACT.playerBody = playerBody;
    if (playerRing) ACT.playerRing = playerRing;
  }

  function bind(scene, camera, renderer) {
    REN = renderer || null;
    CAM = camera || new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    if (scene && ROOT.parent !== scene) scene.add(ROOT);
    if (REN && REN.domElement) U.scale.value = REN.domElement.height * 0.5;
  }

  /* 放一招：实验室 playSkill(key, ctx) 的等价物。
   * 只放**本体**，不叠台阶 / 连携 —— 那两样游戏有自己的体系
   * （台阶走 effSkillMods / SKILL_TIER_EVO，连携走职业核心机制），
   * 在这里再叠一遍就是双播。 */
  function play(key, ctx) {
    const fn = SKILL_FX[key];
    if (typeof fn !== 'function') return false;
    /* 发前同步两样状态：
     *   等级 —— 台阶（tierOn）认「这一发是几级」，用游戏的有效等级
     *   元素 —— 染色认「这一发注了什么」，用游戏的注入包（key / sub）
     * 都是**读**，不改游戏状态。 */
    const G = (typeof Game !== 'undefined') ? Game : null;
    _curLv = (G && typeof G.skillLevel === 'function') ? (Number(G.skillLevel(key)) || 1) : 1;
    const em = (G && G._elem) ? G._elem : null;
    curElem = (em && em.key) || 'phys';
    curElem2 = (em && em.sub) || '';
    stanceIdx = (G && typeof G.bladeStance === 'function') ? (Number(G.bladeStance()) || 0) : 0;
    try {
      fn(ctx || {});
      return true;
    } catch (e) {
      /* 特效不该把主循环带崩 —— 但也不能静默：留一条日志，探针能抓到 */
      console.error('[SFX] ' + key + ' 播放失败: ' + (e && (e.stack || e.message)));
      return false;
    }
  }

  function clear() {
    /* _live 只该装「一次性」mesh。常驻池（粒子 Points / 18 个贴花 quad）
     * 在实验室源里打了 userData.shared，ROOT.add 的包装会跳过它们。
     * 少了这个标记，clear() 会把池子整个从 ROOT 摘掉并 dispose 材质 ——
     * 之后 FX.spr / FX.decal 还在往池里写，stats() 也数得到粒子，
     * 但场景树里已经没有承载它们的 mesh，玩家一个像素都收不到。 */
    for (let i = 0; i < _live.length; i++) {
      const m = _live[i];
      if (m.parent) _rootRemove(m);
      /* _plane 是所有 flatMesh / billMesh 共用的几何，不能按「一次性」销毁：
       * dispose 掉之后下一发还要用它，等于把整个贴地层的地基拆了。
       * 材质是每次 new 的，照常释放。 */
      if (m.geometry && !m.userData.shared && m.geometry !== _plane && m.geometry.dispose) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(x => x && x.dispose && x.dispose());
        else if (m.material.dispose) m.material.dispose();
      }
    }
    _live.length = 0;
    updaters.length = 0;
    for (const k in POOLS) POOLS[k].update(999);
    /* 贴花是**预分配的 18 个 mesh 的池**，不是"用过的列表" ——
     * 把数组清空会让下一次 FX.decal 拿到 undefined（实测崩在这里）。
     * 只能把每个位藏起来 + 归零寿命，池子本身留着。 */
    if (typeof DECAL !== 'undefined' && DECAL.list) {
      for (let i = 0; i < DECAL.list.length; i++) {
        const d = DECAL.list[i];
        if (d && d.m) d.m.visible = false;
        if (d) d.life = 0;
      }
      DECAL.i = 0;
    }
    TIME.stop = 0;
    now = 0;
  }

  function keys() { return Object.keys(SKILL_FX); }

  /* 这只技能有没有手搓实现。game.js 的 playSkillVfx 靠它决定走新层还是回落配方，
   * 所以必须是**同步、无副作用**的判断（探针也会调它）。 */
  function has(key) { return typeof SKILL_FX[key] === 'function'; }

  /* 探针读数。数**真活着**的，不数缓存：Pool.alive 是上一帧算的，
   * 刚 spawn 完读它永远是 0，会让人以为「放了但没出」。 */
  function stats() {
    let n = 0, u = 0;
    for (const k in POOLS) {
      const p = POOLS[k].p;
      for (let i = 0; i < p.length; i++) if (p[i].live) n++;
    }
    for (let i = 0; i < updaters.length; i++) if (!updaters[i].dead) u++;
    return { particles: n, updaters: u, meshes: _live.length };
  }

  return {
    bind, update, sync, play, clear, keys, has, stats,
    get scene() { return ROOT; },
    get active() { return _live.length; },
    get updaters() { return updaters.length; }
  };
})();
