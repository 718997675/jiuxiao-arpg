/* ============================================================
 * 首领技能表 —— 45 只的五格配招 + 88 个技能的判定与演出
 *
 *   ⚠️ **本文件是生成物**，别直接改：改完下次一生成就没了。
 *   源 = `docs/boss-vfx-playground.html`（那边能一只一只真放出来看）
 *   重新生成：`node dev/build-bosskits.js --write`；只检查：`--check`
 *
 * `run()` / `hit()` 是从特效台**原样搬过来**的源码，它们引用的是
 * 特效台那套脚手架（`BFX` / `N` / `R` / `WM` / `aimAngle` / `settle` …）。
 * 游戏侧由 `src/boss-cast.js` 提供同名全局 —— 少一个就是**运行时**才炸的
 * ReferenceError，所以 `dev/test-bosskits.js` 会把用到的那套名字全列出来核对。
 *
 * 世界 Boss 的 24 个技能**不在**这里：它们的实现是 `worldboss-fight.js`
 * 的三阶段状态机，特效台里那份只是演示，导进来就是第二份实现。
 * ============================================================ */
'use strict';

/* 45 只 × 5 格：机制 / 套路 / 套路 / 签名 / 本命（`nt_` 前缀） */
const BOSS_KIT = {
  treeking: ['sporecloud', 'slam', 'roots', 'bamboo', 'nt_treeking'],
  batking: ['drainchain', 'ringshot', 'charge', 'blooddive', 'nt_batking'],
  chief: ['totem', 'slam', 'charge', 'warstomp', 'nt_chief'],
  golemking: ['stonearmor', 'slam', 'rocks', 'stonespear', 'nt_golemking'],
  snakequeen: ['petrify', 'poisonnova', 'ringshot', 'venomfang', 'nt_snakequeen'],
  ghostlord: ['soulpull', 'ringshot', 'curse', 'soulchain', 'nt_ghostlord'],
  firegeneral: ['firewall', 'slam', 'summon', 'flamecleave', 'nt_firegeneral'],
  icequeen: ['freeze', 'frostnova', 'ringshot', 'glacial', 'nt_icequeen'],
  spidermother: ['eggs', 'summon', 'poisonnova', 'web', 'nt_spidermother'],
  ferryman: ['ferry', 'slam', 'ringshot', 'tide', 'nt_ferryman'],
  swordlord: ['bladedomain', 'charge', 'swordrain', 'bladering', 'nt_swordlord'],
  magmalord: ['rockfall', 'slam', 'fireline', 'stonespear', 'nt_magmalord'],
  ashwarden: ['firewall', 'quake', 'rocks', 'stonespear', 'nt_ashwarden'],
  flamewraith: ['sporecloud', 'ringshot', 'curse', 'flamecleave', 'nt_flamewraith'],
  flameemperor: ['rockfall', 'meteor', 'quake', 'flamecleave', 'nt_flameemperor'],
  boneabbot: ['eggs', 'curse', 'summon', 'soulchain', 'nt_boneabbot'],
  marrowlord: ['stonearmor', 'quake', 'drainchain', 'eggs', 'nt_marrowlord'],
  riverwraith: ['soulpull', 'venomfang', 'curse', 'tide', 'nt_riverwraith'],
  abysswyrm: ['drainchain', 'charge', 'slam', 'venomfang', 'nt_abysswyrm'],
  yellowspring: ['flood', 'ringshot', 'soulpull', 'tide', 'nt_yellowspring'],
  swordguardian: ['bladedomain', 'roots', 'quake', 'swordrain', 'nt_swordguardian'],
  bladelord: ['mirror', 'swordrain', 'ringshot', 'bladering', 'nt_bladelord'],
  swordemperor: ['bladedomain', 'summon', 'ringshot', 'bladering', 'nt_swordemperor'],
  cloudwarden: ['windpress', 'ringshot', 'stonespear', 'charge', 'nt_cloudwarden'],
  heavenguard: ['wardrum', 'stonespear', 'warstomp', 'slam', 'nt_heavenguard'],
  jadeemperor: ['totem', 'slam', 'ringshot', 'bladering', 'nt_jadeemperor'],
  starlord: ['petrify', 'meteor', 'charge', 'ringshot', 'nt_starlord'],
  mirrordemon: ['mirror', 'slam', 'ringshot', 'formless', 'nt_mirrordemon'],
  mirrorlord: ['mirror', 'soulpull', 'charge', 'formless', 'nt_mirrorlord'],
  nineheaven: ['bladedomain', 'quake', 'charge', 'warstomp', 'nt_nineheaven'],
  chaosavatar: ['mirror', 'quake', 'meteor', 'formless', 'nt_chaosavatar'],
  bafo_deva: ['staggerbreak', 'slam', 'ringshot', 'warstomp', 'nt_bafo_deva'],
  bafo_naga: ['staggerbreak', 'venomfang', 'ringshot', 'flood', 'nt_bafo_naga'],
  bafo_yaksa: ['staggerbreak', 'slam', 'quake', 'stonespear', 'nt_bafo_yaksa'],
  bafo_gandharva: ['staggerbreak', 'warstomp', 'curse', 'soulchain', 'nt_bafo_gandharva'],
  bafo_asura: ['staggerbreak', 'slam', 'charge', 'flamecleave', 'nt_bafo_asura'],
  bafo_garuda: ['staggerbreak', 'charge', 'warstomp', 'blooddive', 'nt_bafo_garuda'],
  bafo_kimnara: ['staggerbreak', 'ringshot', 'roots', 'soulchain', 'nt_bafo_kimnara'],
  bafo_mahoraga: ['staggerbreak', 'slam', 'roots', 'venomfang', 'nt_bafo_mahoraga'],
  chaos: ['mirror', 'frostnova', 'fireline', 'formless', 'nt_chaos'],
  dgb_tomb: ['corpsetide', 'slam', 'quake', 'soulchain', 'nt_dgb_tomb'],
  dgb_well: ['rockfall', 'flood', 'corpsetide', 'quake', 'nt_dgb_well'],
  dgb_den: ['wardrum', 'charge', 'venomfang', 'summon', 'nt_dgb_den'],
  dgb_gaol: ['flood', 'ringshot', 'curse', 'corpsetide', 'nt_dgb_gaol'],
  dgb_fall: ['windpress', 'slam', 'stonespear', 'formless', 'nt_dgb_fall'],
};

/* 45 个本命技的本体。`BOSS_SKILLS` 里那 45 条 `nt_*` 只是包装：
 * 它们的 run/hit 显式转到这里（原来写的是闭包变量 `o`，搬出来之后
 * `o` 不存在 —— 45 只的第 5 格会全部 ReferenceError）。 */
const BOSS_NATIVE = {
  treeking: {
    n: '绞根',
    tag: '藤蔓一路追着你爬',
    warm: 1,
    mul: 0.5,
    rule: '藤蔓从它脚下长出来，**一直朝你爬**。绑住的时间越长越疼 —— 停一下就输',
    kind: '藤蔓（会生长的带子）',
    dmg: 'ramp · 绑得越久越疼',
    answer: '一直跑，不能停',
    hit: function(){ return { shape:'self', note:'藤蔓持续追踪' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 两根：主藤追人，侧藤从另一头绕 —— 只追一根的话，直线跑就完事了 */
    const vine = BFX.trail({ color:0x7dbb52, w:.62, max:150, opacity:.95 });
    const side = BFX.trail({ color:0x4a7a30, w:.4, max:120, opacity:.8 });
    vine.push(P.x, P.z);
    const a0 = aimAngle() + 1.5, sx = P.x + Math.sin(a0)*3.4, sz = P.z + Math.cos(a0)*3.4;
    side.push(sx, sz);
    let t = 0, segA = 0, segB = 0, bound = 0, hurtAcc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 9.5){
        vine.retract(); side.retract();
        this.dead = true; return;
      }
      segA += dt; segB += dt;
      if(segA > .055){
        segA = 0;
        const h = vine.head();
        const dx = DUMMY.pos.x - h.x, dz = DUMMY.pos.z - h.z, d = Math.hypot(dx, dz) || 1;
        const step = Math.min(1.15, d);
        vine.push(h.x + dx/d*step, h.z + dz/d*step);
        if(Math.random() < .5)
          BFX.burst(V3(h.x, .18, h.z), 1, { tex:'ember', sp:.6, s0:.34, a0:.55,
            color:0x9be060, grav:-.6 });
      }
      /* 侧藤：先横着包过去，包到人附近再收 —— 逼你往"侧面空着的那边"跑 */
      if(segB > .06 && t > .8){
        segB = 0;
        const h = side.head();
        const aim = aimAngle() + Math.PI*.5;
        const tx = P.x + Math.sin(aim)*5.2, tz = P.z + Math.cos(aim)*5.2;
        const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1;
        side.push(h.x + dx/d*1.1, h.z + dz/d*1.1);
      }
      const hd = Math.hypot(DUMMY.pos.x - vine.head().x, DUMMY.pos.z - vine.head().z);
      if(hd < 1.15){
        if(bound === 0) floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), '被缠住', '#d8ff9a');
        bound += dt;
        hurtAcc += dt;
        if(hurtAcc > .55){
          hurtAcc = 0;
          /* 越久越疼：0.55s 起，每秒加深，封顶 3 倍 */
          const k = Math.min(3, 1 + bound * .45);
          say(V3(DUMMY.pos.x, 1.25, DUMMY.pos.z), '缠绕 ×' + k.toFixed(2), '#c8ee7a');
          hurtVignette();
        }
      }else bound = Math.max(0, bound - dt * 1.6);
    }});
    /* 演示：不往正后方跑（那里藤蔓正对着），先侧切再拉开 */
    const A = aimAngle() + Math.PI*.5;
    delay(.5, ()=>moveDummy(V3(P.x + Math.sin(A)*5.6, 0, P.z + Math.cos(A)*5.6), .55));
    delay(1.35, ()=>moveDummy(V3(P.x + Math.sin(A)*4.0, 0, P.z + Math.cos(A)*2.6), .5));
    delay(2.4, ()=>moveDummy(V3(P.x + Math.sin(A - .7)*6.6, 0, P.z + Math.cos(A - .7)*6.6), .6));
    delay(.4, ()=>floatText(V3(P.x, 3.0, P.z), '藤蔓跟着脚长 · 别停', '#9be060'));
  }
  },
  batking: {
    n: '回声',
    tag: '三只绕着你飞',
    warm: 0.9,
    mul: 0.35,
    rule: '三只蝙蝠绕着你飞，撞一下叠一层**回声** —— 叠到 5 层一起炸。挨一下不要紧，接着挨才要命',
    kind: '飞行的实体 ×3（会绕圈）',
    dmg: 'thresh · 撞满 5 层引爆',
    answer: '被撞了先退开，等层数掉',
    hit: function(){ return { shape:'self', note:'三只实体持续绕飞' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    let stack = 0, stT = 0;
    const ring = flatMesh(TEX.ring, 0xb45cff, THREE.AdditiveBlending, .0);
    ring.rotation.x = -Math.PI/2; ring.renderOrder = 6;
    /* 层数环：挂在玩家脚下，一眼看出"几层了" */
    const mark = flatMesh(TEX.ring, 0xd08cff, THREE.AdditiveBlending, .0);
    mark.rotation.x = -Math.PI/2; mark.renderOrder = 6;
    const fbs = [];
    for(let i=0;i<3;i++){
      const a0 = Math.PI*2*i/3;
      const fb = BFX.entity({
        x: P.x + Math.sin(a0)*7, z: P.z + Math.cos(a0)*7,
        tex: TEX.ember, color:0xb45cff, size:.85, speed:5.4, life:8.5, hitEvery:.5,
        /* 不是直线追：绕着一个半径 6~9 的圈转，所以永远从侧面来 */
        target: ()=>{ const a = TIME.t*.9 + a0; const rr = 6 + Math.sin(TIME.t*.7 + a0)*2.4;
          return V3(DUMMY.pos.x + Math.sin(a)*rr, 0, DUMMY.pos.z + Math.cos(a)*rr); },
        onTouch(e){
          stack = Math.min(5, stack + 1);
          stT = 0;
          BFX.burst(V3(DUMMY.pos.x, 1.0, DUMMY.pos.z), 6,
            { tex:'ember', sp:2.2, s0:.4, a0:.8, color:0xb45cff, grav:-1 });
          if(stack >= 5){
            stack = 0;
            BFX.shock(V3(DUMMY.pos.x, 0, DUMMY.pos.z), 4.4, { color:0xd08cff, dur:.5, thi:.7 });
            flashScreen(.35, .2); shake(.9, .3); hurtVignette();
            say(V3(DUMMY.pos.x, 1.5, DUMMY.pos.z), '回声炸开 ×' + (S.mul*5).toFixed(2), '#e0aaff');
          }else{
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '回声 ' + stack + '/5', '#c8a0ff');
          }
        }
      });
      fbs.push(fb);
    }
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(stack > 0){ stT += dt; if(stT > 4.2){ stack = 0; } }   /* 4 秒不挨就掉光 */
      const k = stack / 5;
      mark.position.set(DUMMY.pos.x, .09, DUMMY.pos.z);
      mark.scale.setScalar(2.2 + k*2.2);
      mark.material.opacity = stack ? (.25 + k*.6) * (.85 + .15*Math.sin(t*14)) : 0;
      ring.position.set(DUMMY.pos.x, .08, DUMMY.pos.z);
      ring.scale.setScalar(6.2 + Math.sin(t*1.6)*.5);
      ring.material.opacity = .10;
      if(t > 8.6){ disposeMesh(ring); disposeMesh(mark); this.dead = true; }
    }});
    /* 演示：被撞之后往侧面退 —— 层数才会掉 */
    const A = aimAngle() + Math.PI*.5;
    delay(1.2, ()=>moveDummy(V3(P.x + Math.sin(A)*5.0, 0, P.z + Math.cos(A)*5.0), .6));
    delay(3.4, ()=>moveDummy(V3(P.x + Math.sin(A + 1.5)*5.4, 0, P.z + Math.cos(A + 1.5)*5.4), .6));
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '挨一下叠一层 · 5 层炸', '#c8a0ff'));
  }
  },
  chief: {
    n: '两翼',
    tag: '左右包夹',
    warm: 1,
    mul: 0.7,
    rule: '两路狼从**左右两翼**包过来 —— 站在正中间是被夹死的那个位置',
    kind: '两路实体（从两翼切进来）',
    dmg: 'crush · 越靠正中夹得越狠',
    answer: '往一侧冲出去',
    hit: function(){ return { shape:'self', note:'两路实体从两翼收拢' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const A = aimAngle();
    const dmgAt = (px, pz)=>{
      /* 夹击度：把玩家投影到"两翼连线"上，越靠中间越疼 */
      const nx = Math.sin(A), nz = Math.cos(A);       /* 前后轴 */
      const lx = Math.cos(A), lz = -Math.sin(A);      /* 左右轴 */
      const side = (px - P.x)*lx + (pz - P.z)*lz;
      const fwd = (px - P.x)*nx + (pz - P.z)*nz;
      if(fwd < -.5) return 0;
      return Math.max(0, 1 - Math.abs(side) / 4.6);
    };
    const pack = [];
    [-1, 1].forEach(sgn=>{
      const e = BFX.entity({
        x: P.x + Math.cos(A)*4.6*sgn, z: P.z - Math.sin(A)*4.6*sgn,
        tex: TEX.smoke, color:0xd8b070, size:1.5, speed:3.4, life:5.2, hitEvery:.4,
        target: ()=>DUMMY.pos, opacity:.85,
        onFrame(e2){
          /* 身后拖一条尘带 —— 两路走出来的痕迹是**两道**，一眼看出被夹 */
          if(Math.random() < .3)
            BFX.burst(V3(e2.x, .2, e2.z), 1, { tex:'smoke', sp:.5, s0:.55, a0:.35,
              color:0x8a7050, grav:-.2 });
        },
        onTouch(e2){
          const k = dmgAt(e2.x, e2.z);
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '夹击 ×' + (S.mul*(0.5 + k)).toFixed(2),
            k > .6 ? '#ff7a5a' : '#e0c090');
          if(k > .6) hurtVignette();
        }
      });
      pack.push(e);
    });
    /* Boss 自己堵在后面：往后退撞它 */
    const back = BFX.entity({ x:P.x, z:P.z, tex:TEX.smoke, color:0x9a5a3a, size:2.2,
      speed:1.5, life:5.2, hitEvery:.6, target: ()=>DUMMY.pos,
      onTouch(){ say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '后面是它 · 只能往侧边冲', '#ff9a6a'); } });
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 5.3){ pack.forEach(p=>p.kill()); back.kill(); this.dead = true; }
    }});
    /* 演示：往一侧冲出去，不是往后 */
    const lx = Math.cos(A), lz = -Math.sin(A);
    delay(.55, ()=>moveDummy(V3(P.x + lx*6.4, 0, P.z + lz*6.4), .7));
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '两翼包夹 · 往一侧冲', '#e0c090'));
  }
  },
  golemking: {
    n: '落石掩体',
    tag: '石头挡冲撞',
    warm: 1,
    mul: 0.85,
    rule: '三块巨石砸下来留在场上，**它们是掩体** —— 它冲过来时，站在石头后面',
    kind: '落下的巨石（变成掩体）',
    dmg: 'burst · 冲撞撞上就是满伤',
    answer: '躲到石头后面',
    hit: function(){ return { shape:'line', x:BOSS.pos.x, z:BOSS.pos.z, angle:aimAngle(), w:R(4.2), len:R(26) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const rocks = [];
    const A0 = aimAngle() + Math.PI;
    for(let i=0;i<3;i++){
      const a = A0 + (i-1)*.55, d = 5.4 + i*.6;
      const px = P.x + Math.sin(a)*d, pz = P.z + Math.cos(a)*d;
      delay(i*.22, ()=>{
        BFX.burst(V3(px, 4.5, pz), 10, { tex:'rock', sp:1.2, s0:.7, a0:.8, color:0x6a6050, grav:-7 });
        delay(.45, ()=>{
          const g = new THREE.CylinderGeometry(R(1.5), R(1.9), 2.0, 7);
          const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color:0x6d6250, roughness:.95, flatShading:true }));
          m.position.set(px, 1.0, pz); scene.add(m);
          BFX.decal({ x:px, z:pz, tex:'crack', r:R(2.2), life:6, color:0x8a7f68, a0:.55 });
          rocks.push({ x:px, z:pz, r:R(1.9), g, m });
          shake(.5, .18);
        });
      });
    }
    /* 冲撞：一条线扫过去，石头后面是唯一的死角 */
    delay(1.5, ()=>{
      floatText(V3(P.x, 3.2, P.z), '它冲过来了 · 站石头后', '#e8c890');
      const A = aimAngle();
      const wall = BFX.wall({ x:P.x, z:P.z, angle:A, len:R(9), th:R(3.2),
        from:R(3), to:-R(24), speed:11, color:0xff8a4a, tex:TEX.smoke });
      let wt = 0;
      addUpdate({ update(dt){
        const w = wall.pos;
        /* 墙从 +3 推到 −24、速度 11 —— 2.45 秒就走完了。这条判定通道必须跟着收：
         * 第一版没有出口，它永远在每帧读一个已经死掉的墙（实测残留 1 个 updater）。 */
        wt += dt;
        if(wt > 3.0){ this.dead = true; return; }
        /* 只有"正前方这条带子"里的人才算挨撞；石头挡住 = 不挨 */
        const nx = Math.sin(A), nz = Math.cos(A);
        const along = (DUMMY.pos.x - w.x)*nx + (DUMMY.pos.z - w.z)*nz;
        if(Math.abs(along) < R(1.4)){
          const covered = rocks.some(rk=>{
            /* 石头在玩家和冲撞线之间？用"玩家到冲撞中心的方向"上有没有石头 */
            const dx = DUMMY.pos.x - rk.x, dz = DUMMY.pos.z - rk.z;
            return Math.hypot(dx, dz) < rk.r + 1.1;
          });
          if(!covered){
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被撞飞 ×' + S.mul, '#ff8a4a');
            hurtVignette(); flashScreen(.3, .18);
          }
        }
      }});
      /* 演示：跑到最近那块石头后面 */
      const near = rocks.slice().sort((a,b)=>
        Math.hypot(a.x-DUMMY.pos.x, a.z-DUMMY.pos.z) - Math.hypot(b.x-DUMMY.pos.x, b.z-DUMMY.pos.z))[0];
      if(near) moveDummy(V3(near.x - Math.sin(A)*2.4, 0, near.z - Math.cos(A)*2.4), .55);
    });
    delay(6.6, ()=>{ rocks.forEach(rk=>{ scene.remove(rk.m); rk.g.dispose(); rk.m.material.dispose(); }); });
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '石头是掩体 · 别站空地', '#e8c890'));
  }
  },
  snakequeen: {
    n: '蜕皮',
    tag: '壳留在原地',
    warm: 1.5,
    mul: 1.1,
    rule: '蛇皮留在原地继续喷毒，**本体在你背后** —— 背对它，伤害翻倍',
    kind: '假目标（一个和本体一样的壳）',
    dmg: 'true · 背面吃满、正面减半',
    answer: '转身',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(3.2) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 壳：一片立着的半透明蛇形贴片，位置不动 */
    const shell = billMesh(TEX.smoke, 0x8fd0a0, .85);
    shell.position.set(P.x, 1.5, P.z); shell.scale.set(2.2, 3.4, 1);
    const husk = BFX.pool({ x:P.x, z:P.z, r:R(3.0), life:6.2, color:0x5aa06a, tick:.6,
      onTick(st){ BFX.burst(V3(st.x + (Math.random()-.5)*3, .4, st.z + (Math.random()-.5)*3), 2,
        { tex:'smoke', sp:1.0, s0:.6, a0:.5, color:0x7ac07a, grav:1.2 }); } });
    /* 本体：挪到玩家侧后方 */
    delay(1.15, ()=>{
      const A = aimAngle() + Math.PI + 1.15;
      const nx = DUMMY.pos.x + Math.sin(A)*3.2, nz = DUMMY.pos.z + Math.cos(A)*3.2;
      BOSS.pos.set(nx, 0, nz);
      if(BOSS.g) BOSS.g.position.copy(BOSS.pos);
      BFX.burst(V3(nx, 1.0, nz), 12, { tex:'smoke', sp:2.4, s0:.7, a0:.7, color:0x8fd0a0, grav:-.6 });
      flashScreen(.22, .2);
    });
    /* 结算：正对它有减伤，背对它满伤 */
    delay(3.4, ()=>{
      const toBossX = BOSS.pos.x - DUMMY.pos.x, toBossZ = BOSS.pos.z - DUMMY.pos.z;
      const d = Math.hypot(toBossX, toBossZ) || 1;
      /* 假人的"朝向"用它的移动方向代替；站着不动 = 面朝 Boss 之外的方向 */
      const fx = DUMMY.face ? DUMMY.face.x : 0, fz = DUMMY.face ? DUMMY.face.z : 1;
      const dot = (toBossX/d)*fx + (toBossZ/d)*fz;
      const back = dot < .1;
      BFX.arcSlash({ x:BOSS.pos.x, z:BOSS.pos.z, r:R(6.4), span:Math.PI*1.1,
        color:0x7ac07a, life:.45, y:.6, yaw:Math.atan2(DUMMY.pos.x-BOSS.pos.x, DUMMY.pos.z-BOSS.pos.z) });
      say(V3(DUMMY.pos.x, 1.35, DUMMY.pos.z),
        back ? '背后中招 ×' + S.mul : '正面 · 只吃一半', back ? '#ff7a6a' : '#8fd05a');
      if(back) hurtVignette();
    });
    delay(6.4, ()=>{ scene.remove(shell); shell.material.dispose(); });
    /* 演示：转身面对它 */
    delay(2.0, ()=>{ const A2 = Math.atan2(BOSS.pos.x-DUMMY.pos.x, BOSS.pos.z-DUMMY.pos.z);
      moveDummy(V3(BOSS.pos.x - Math.sin(A2)*5.4, 0, BOSS.pos.z - Math.cos(A2)*5.4), .6); });
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '壳在这儿 · 本体在你背后', '#8fd0a0'));
  }
  },
  boneabbot: {
    n: '诵经',
    tag: '三面幡连着它',
    warm: 3.5,
    mul: 1,
    rule: '三面经幡同时念，四条光带连到它身上 —— **不拆掉就穿盾**，躲是躲不掉的',
    kind: '三面可拆的经幡 + 三条光带',
    dmg: 'true · 不拆就穿盾',
    answer: '先去拆幡',
    hit: function(){ return { shape:'self', note:'经幡未拆 → 全场真伤' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const wards = [];
    for(let i=0;i<3;i++){
      const a = Math.PI*2*i/3 + .5, d = R(6.4);
      const px = P.x + Math.sin(a)*d, pz = P.z + Math.cos(a)*d;
      const flap = vplane(TEX.soft, 0xd8c090, .9);
      flap.position.set(px, 1.6, pz); flap.scale.set(1.3, 2.6, 1);
      const base = flatMesh(TEX.ring, 0xd8c090, THREE.AdditiveBlending, .55);
      base.position.set(px, .07, pz); base.scale.setScalar(2.0);
      const w = { x:px, z:pz, hp:1, flap, base };
      wards.push(w);
      BFX.beam({ a: ()=>V3(px, .7, pz), b: ()=>V3(BOSS.pos.x, 2.0, BOSS.pos.z),
        w:.20, color:0xffd8a0, life:5.2, opacity:.8,
        onTick(t2){
          flap.material.opacity = .55 + .35*Math.sin(t2*7 + i);
        } });
    }
    let broken = 0;
    const say2 = nSay();
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      wards.forEach(w=>{
        if(w.hp <= 0) return;
        /* 假人碰上去 = 拆幡（演示用；游戏里是"打它"） */
        if(Math.hypot(DUMMY.pos.x - w.x, DUMMY.pos.z - w.z) < 1.6){
          w.hp = 0; broken++;
          scene.remove(w.flap); w.flap.material.dispose();
          disposeMesh(w.base);
          BFX.burst(V3(w.x, 1.6, w.z), 12, { tex:'ember', sp:2.6, s0:.6, a0:.9, color:0xffd8a0, grav:-2 });
          say2(V3(w.x, 2.2, w.z), '幡断 ' + broken + '/3', '#ffd8a0');
        }
      });
      /* 剩几面就在拉，越少越弱 */
      if(broken >= 3){ this.dead = true; }
      if(t > 5.0){ this.dead = true; }
    }});
    delay(4.2, ()=>{
      if(broken >= 3){
        floatText(V3(P.x, 3.2, P.z), '三面全断 · 经断了', '#8fd05a');
        return;
      }
      const k = (3 - broken) / 3;
      flashScreen(.3*k, .3); shake(1.4*k, .4);
      BFX.shock(V3(P.x, 0, P.z), R(16), { color:0xffe0a0, dur:.7, thi:1.0 });
      floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
        '穿盾真伤 ×' + (S.mul*k).toFixed(2) + '（剩 ' + (3-broken) + ' 面）', '#ffd24a');
      hurtVignette();
      /* 没拆完，剩下的幡继续亮着 —— 但这一轮已经结算了 */
    });
    /* 演示：跑去拆最近的一面 */
    delay(.4, ()=>{
      const w = wards.slice().sort((a,b)=>Math.hypot(a.x-DUMMY.pos.x,a.z-DUMMY.pos.z)-Math.hypot(b.x-DUMMY.pos.x,b.z-DUMMY.pos.z))[0];
      moveDummy(V3(w.x, 0, w.z), .8);
    });
    delay(1.5, ()=>{
      const w = wards.filter(w=>w.hp>0)[0];
      if(w) moveDummy(V3(w.x, 0, w.z), .8);
    });
    delay(2.6, ()=>{
      const w = wards.filter(w=>w.hp>0)[0];
      if(w) moveDummy(V3(w.x, 0, w.z), .8);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '先拆幡 · 不拆穿盾', '#ffd8a0'));
  }
  },
  ghostlord: {
    n: '附影',
    tag: '影子踩着你的脚',
    warm: 0.9,
    mul: 0.9,
    rule: '影子贴在你脚下跟着走 —— 躲不开。**走到光斑上**才会被钉住',
    kind: '跟着你的影子（attach）',
    dmg: 'exec · 重叠越久，按已损血结算',
    answer: '踩到光里甩掉它',
    hit: function(){ return { shape:'self', note:'影子持续跟随' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const sh = flatMesh(TEX.smoke, 0x2a1a3a, THREE.NormalBlending, .85);
    sh.rotation.x = -Math.PI/2; sh.renderOrder = 3;
    /* 场上三块光斑：唯一的解 */
    const lights = [];
    for(let i=0;i<3;i++){
      const a = Math.PI*2*i/3 + .9, d = R(6.6);
      const lx = P.x + Math.sin(a)*d, lz = P.z + Math.cos(a)*d;
      const m = flatMesh(TEX.soft, 0xfff0c0, THREE.AdditiveBlending, .5);
      m.rotation.x = -Math.PI/2; m.position.set(lx, .06, lz);
      m.scale.setScalar(3.6); m.renderOrder = 2;
      lights.push({ x:lx, z:lz, r:1.9, m });
    }
    let t = 0, bind = 0, acc = 0, pinned = false;
    addUpdate({ update(dt){
      t += dt;
      if(t > 7.2){ disposeMesh(sh); lights.forEach(l=>disposeMesh(l.m)); this.dead = true; return; }
      /* 影子在玩家身后 0.4 米的方向"拖"，不是正好叠着 —— 叠着看不见 */
      const A = aimAngle();
      const sx = DUMMY.pos.x + Math.sin(A)*.7, sz = DUMMY.pos.z + Math.cos(A)*.7;
      sh.position.set(sx, .055, sz);
      sh.scale.setScalar(2.9 + Math.sin(t*4)*.12);
      /* 光斑里 = 钉住 */
      const inLight = lights.some(l=>Math.hypot(DUMMY.pos.x-l.x, DUMMY.pos.z-l.z) < l.r);
      pinned = inLight;
      if(inLight){
        bind = Math.max(0, bind - dt*2.2);
        sh.material.opacity = .25;
        lights.forEach(l=>{ if(Math.hypot(DUMMY.pos.x-l.x,DUMMY.pos.z-l.z)<l.r) l.m.material.opacity = .95; });
      }else{
        bind += dt;
        sh.material.opacity = .85;
        lights.forEach(l=>l.m.material.opacity = .5);
      }
      acc += dt;
      if(acc > .6){
        acc = 0;
        if(bind > 1.2){
          /* 已损血越高越疼：exec */
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
            '影子啃噬 ×' + (S.mul*(1 + bind*.25)).toFixed(2), '#b47aff');
          hurtVignette();
        }else if(!pinned){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '影子还跟着 · 找光', '#8a7aa0');
        }
      }
    }});
    /* 演示：跑到最近的光斑里 */
    delay(.9, ()=>{
      const l = lights.slice().sort((a,b)=>Math.hypot(a.x-DUMMY.pos.x,a.z-DUMMY.pos.z)-Math.hypot(b.x-DUMMY.pos.x,b.z-DUMMY.pos.z))[0];
      moveDummy(V3(l.x, 0, l.z), .7);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '影子跟着你 · 走到光里', '#b47aff'));
  }
  },
  firegeneral: {
    n: '三叠墙',
    tag: '三道墙，缺口错开',
    warm: 1,
    mul: 0.45,
    rule: '三道火墙从远到近依次推来，**缺口一个比一个偏** —— 走 Z 字',
    kind: '推进的墙 ×3（带缺口）',
    dmg: 'multi · 每撞一道再加一档',
    answer: '走 Z 字穿三道缺口',
    hit: function(){ return { shape:'self', note:'三道墙依次推进' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const A = aimAngle() + Math.PI;      /* 墙从玩家背后往 Boss 方向推 */
    const lx = Math.cos(A), lz = -Math.sin(A);   /* 墙的横向轴 */
    let hits = 0;
    for(let i=0;i<3;i++){
      delay(i*.95, ()=>{
        const gap = -3.4 + i*3.4;                  /* 缺口位置：左 → 中 → 右 */
        const full = R(24), gw = R(4.4);
        const from = R(13), spd = R(4.2);
        const mk = (off, len)=>BFX.wall({ x:P.x, z:P.z, angle:A, off, len, th:R(1.0),
          from, to:-from, speed:spd, color:0xff7a3c, tex:TEX.smoke, life:7 });
        /* 一条墙画成两段：中间那段留空 —— 缺口是**看得见的**，不是靠文字说 */
        const leftLen = (full/2 + gap - gw/2);
        const rightLen = (full/2 - gap - gw/2);
        if(leftLen > 1)  mk(-(full/2 - leftLen/2), leftLen);
        if(rightLen > 1) mk(+(full/2 - rightLen/2), rightLen);
        let t2 = 0, tagged = false;
        const up = addUpdate({ update(dt){
          t2 += dt;
          if(t2 > 6.6){ this.dead = true; return; }
          /* 墙推进到的位置（和 BFX.wall 用同一组数） */
          const d = from - spd * t2;
          const wx = P.x + Math.sin(A)*d, wz = P.z + Math.cos(A)*d;
          const nx = Math.sin(A), nz = Math.cos(A);
          const along = (DUMMY.pos.x - wx)*nx + (DUMMY.pos.z - wz)*nz;
          const side = (DUMMY.pos.x - wx)*lx + (DUMMY.pos.z - wz)*lz;
          const inWall = Math.abs(along) < R(1.1) && Math.abs(side - gap) > gw/2;
          if(inWall && !tagged){
            tagged = true; hits++;
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
              '撞墙 ×' + (S.mul*(1 + hits*.35)).toFixed(2) + '（第 ' + (i+1) + ' 道）', '#ff9a5a');
            hurtVignette(); flashScreen(.25, .16);
          }
          if(!inWall) tagged = false;
        }});
      });
    }
    /* 演示：走 Z 字 —— 每道墙都往缺口赶 */
    delay(.45, ()=>moveDummy(V3(P.x + lx*-3.4, 0, P.z + lz*-3.4), .5));
    delay(1.4, ()=>moveDummy(V3(P.x + lx*0, 0, P.z + lz*0), .5));
    delay(2.4, ()=>moveDummy(V3(P.x + lx*3.4, 0, P.z + lz*3.4), .5));
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '三道墙 · 缺口错开 · 走 Z', '#ff9a5a'));
  }
  },
  icequeen: {
    n: '霜华',
    tag: '沿脚印炸回来',
    warm: 0.9,
    mul: 0.3,
    rule: '冰晶结在**你走过的路上**，0.9 秒后沿这串一路炸回来 —— 直线跑必中，拐弯就断',
    kind: '一串结冰的脚印（trail）',
    dmg: 'multi · 串上踩了几个就挨几段',
    answer: '拐弯',
    hit: function(){ return { shape:'self', note:'沿过去 0.9 秒的路径回溯' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const TR = BFX.trail({ color:0x8fd8ff, w:.38, max:90, opacity:.9, growTip:false });
    const path = [];
    let t = 0, last = -1;
    /* 先记 0.9 秒的足迹 */
    delay(.1, ()=>{
      const rec = addUpdate({ update(dt){
        t += dt;
        if(t - last > .075){
          last = t; path.push({ x:DUMMY.pos.x, z:DUMMY.pos.z });
          if(path.length > 46) path.shift();
        }
        if(t > 1.9){ rec.dead = true; }
      }});
    });
    /* 0.9 秒后：从最新的一格往回逐个结冰 + 炸 */
    delay(1.0, ()=>{
      floatText(V3(DUMMY.pos.x, 3.0, DUMMY.pos.z), '霜沿着你走过的路结', '#8fd8ff');
      const pts = path.slice();
      pts.forEach((p, i)=>{
        delay(i*.045, ()=>{
          TR.push(p.x, p.z);
          if(i % 3 === 0)
            BFX.burst(V3(p.x, .2, p.z), 2, { tex:'ember', sp:.8, s0:.3, a0:.7, color:0x8fd8ff, grav:-.8 });
        });
      });
      /* 炸：从最老的一格往回烧，站在串上就挨 */
      pts.forEach((p, i)=>{
        delay(1.2 + i*.07, ()=>{
          BFX.spikes({ x:p.x, z:p.z, n:3, r:R(.7), h:1.5, color:0x2a4a5a,
            glow:0x8fd8ff, dur:.8 });
          BFX.shock(V3(p.x, 0, p.z), R(1.3), { color:0x8fd8ff, dur:.3, thi:.35 });
          if(Math.hypot(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z) < R(1.2)){
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '冰刺 ×' + S.mul, '#aae8ff');
          }
        });
      });
      delay(1.2 + pts.length*.07 + .3, ()=>{ TR.setOpacity(.0); delay(.4, ()=>TR.kill()); });
    });
    /* 演示：拐一个弯，让脚印串折开 */
    const A = aimAngle() + Math.PI;
    moveDummy(V3(P.x + Math.sin(A)*4.4, 0, P.z + Math.cos(A)*4.4), .55);
    delay(.6, ()=>moveDummy(V3(P.x + Math.sin(A + 1.1)*5.2, 0, P.z + Math.cos(A + 1.1)*5.2), .6));
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '沿着你的脚印炸 · 拐弯', '#8fd8ff'));
  }
  },
  spidermother: {
    n: '织网',
    tag: '六条丝在转',
    warm: 1,
    mul: 0.25,
    rule: '六条丝从中心射出去，**慢慢转** —— 这里停住才是对的：跟着丝跑一定蹭上',
    kind: '旋转的丝（beam ×6）',
    dmg: 'dot · 蹭到就中毒，一直掉',
    answer: '站住，卡在两根丝中间',
    hit: function(){ return { shape:'self', note:'六条丝持续旋转' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const N6 = 6, beams = [];
    for(let i=0;i<N6;i++){
      beams.push(BFX.beam({
        a: ()=>V3(P.x, .5, P.z),
        b: ()=>{ const a = TIME.t*.42 + i*Math.PI*2/N6;
          return V3(P.x + Math.sin(a)*R(11), 0, P.z + Math.cos(a)*R(11)); },
        w:.16, color:0x9be060, life:8, opacity:.8,
        onTick(t2, dt, a, b){
          /* 点到线段距离：站在丝上就中毒 */
          const vx = b.x - a.x, vz = b.z - a.z;
          const L2 = vx*vx + vz*vz || 1;
          let u = ((DUMMY.pos.x-a.x)*vx + (DUMMY.pos.z-a.z)*vz) / L2;
          u = Math.max(0, Math.min(1, u));
          const px = a.x + vx*u, pz = a.z + vz*u;
          if(Math.hypot(DUMMY.pos.x-px, DUMMY.pos.z-pz) < .85){
            if(Math.random() < .1)
              BFX.burst(V3(px, .5, pz), 2, { tex:'ember', sp:.8, s0:.3, a0:.7, color:0x9be060 });
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '中毒 · 每秒掉', '#9be060');
            hurtVignette();
          }
        }
      }));
    }
    /* 中心那颗毒囊，才是"你该站的地方"的反例 —— 站正中会被吸 */
    const core = BFX.pool({ x:P.x, z:P.z, r:R(2.0), life:8, color:0x6a9a3a, opacity:.5, tick:.7,
      onTick(st){
        if(Math.hypot(DUMMY.pos.x-st.x, DUMMY.pos.z-st.z) < st.r)
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '毒囊 · 别站正中间', '#7ac050');
      } });
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '丝在转 · 站着别动', '#9be060'));
    /* 演示：不动（这里"不动"就是答案，所以只做一次微调站位） */
    const A = aimAngle();
    delay(.2, ()=>moveDummy(V3(P.x + Math.sin(A + .52)*5.5, 0, P.z + Math.cos(A + .52)*5.5), .6));
  }
  },
  magmalord: {
    n: '裂脉',
    tag: '裂缝会分叉',
    warm: 1.2,
    mul: 0.6,
    rule: '裂缝从它脚下长出来，**会分叉、一直在延长** —— 站上去就一直加伤',
    kind: '分叉的裂缝（trail，留在场上）',
    dmg: 'ramp · 站在裂缝上持续加深',
    answer: '离裂缝远一点',
    hit: function(){ return { shape:'self', note:'裂缝持续分叉延长' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const veins = [BFX.trail({ color:0xff5a2a, w:.5, max:110, opacity:.95 })];
    veins[0].push(P.x, P.z);
    const dirs = [aimAngle() + Math.PI*.5, aimAngle() - Math.PI*.5];
    let t = 0, forkT = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 7.4){
        /* 收场要**淡出再删**。第一版这里直接 `this.dead = true` —— 6 条裂缝
         * 永远留在场上：放十次之后地面全是红线，6 个 updater 也不回收。 */
        veins.forEach(v=>v.fade(1.1));
        this.dead = true; return;
      }
      const need = Math.floor(t * 14);
      while(veins.reduce((a,v)=>a+v.count(),0) < need){
        veins.forEach(v=>{
          const h = v.head(); if(!h) return;
          const a = Math.atan2(h.x - P.x, h.z - P.z) + Math.sin(t*2.2 + h.x)*.5;
          v.push(h.x + Math.sin(a)*.85, h.z + Math.cos(a)*.85);
        });
      }
      /* 分叉：每 1.4 秒从最长的两根里各分出去一条 */
      forkT += dt;
      if(forkT > 1.4 && veins.length < 6){
        forkT = 0;
        const src = veins[Math.floor(Math.random()*veins.length)];
        const h = src.head();
        if(h){
          const nv = BFX.trail({ color:0xff3a1a, w:.34, max:70, opacity:.85 });
          nv.push(h.x, h.z);
          veins.push(nv);
          BFX.burst(V3(h.x, .2, h.z), 6, { tex:'ember', sp:1.6, s0:.4, a0:.8, color:0xff5a2a, grav:-1.4 });
        }
      }
      acc += dt;
      if(acc > .5){
        acc = 0;
        let on = false;
        veins.forEach(v=>{ const h = v.head();
          if(h && Math.hypot(DUMMY.pos.x-h.x, DUMMY.pos.z-h.z) < 1.3) on = true; });
        if(on){
          say( V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '站在裂缝上 ×' + (S.mul*(1+t*.12)).toFixed(2), '#ff7a4a');
          hurtVignette();
        }
      }
    }});
    /* 演示：往裂缝稀疏的那一侧退 */
    const away = aimAngle();
    delay(.5, ()=>moveDummy(V3(P.x + Math.sin(away)*6.4, 0, P.z + Math.cos(away)*6.4), .7));
    delay(2.6, ()=>moveDummy(V3(P.x + Math.sin(away + .8)*6.8, 0, P.z + Math.cos(away + .8)*6.8), .6));
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '裂缝会分叉 · 站上去就一直疼', '#ff7a4a'));
  }
  },
  ashwarden: {
    n: '灰暴',
    tag: '看不远，还被风推',
    warm: 1,
    mul: 0.05,
    rule: '全场起灰，**视野只剩 10 米**，风一直把你往一侧推 —— 得逆着风走',
    kind: '视野压制 + 持续推力（无落点）',
    dmg: 'dot · 每 0.6 秒一点，不致命但一直掉',
    answer: '逆着风走',
    hit: function(){ return { shape:'self', note:'视野压制 + 定向推力' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 风不是"一面墙"，是整场横着流的灰 —— 用七道错相位横带 */
    const flows = [];
    for(let i=0;i<7;i++){
      const m = flatMesh(TEX.smoke, 0x9aa0a8, THREE.AdditiveBlending, .22);
      m.rotation.x = -Math.PI/2;
      m.scale.set(9, 3.2, 1);
      flows.push({ m, y: .2 + i*.05, off: Math.random() });
    }
    const push = { x: Math.sin(aimAngle() + Math.PI*.55), z: Math.cos(aimAngle() + Math.PI*.55) };
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 7.5){
        flows.forEach(f=>disposeMesh(f.m));
        this.dead = true; return;
      }
      /* 风把人往一侧推：直接改 DUMMY.pos（游戏里是每帧加速度） */
      DUMMY.pos.x += push.x * dt * 2.6;
      DUMMY.pos.z += push.z * dt * 2.6;
      if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
      flows.forEach((f, i)=>{
        const u = ((t * (1.6 + i * .2) + f.off) % 1);
        f.m.position.set(P.x + (u - .5) * 26 - push.x * 6, .12, P.z + (u - .5) * 26 - push.z * 6);
        f.m.material.opacity = .18 * Math.sin(u * Math.PI);
      });
      acc += dt;
      if(acc > .6){
        acc = 0;
        say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '灰 · 视野 10 米 · 逆风走', '#b0b8c0');
      }
    }});
    /* 演示：逆着风走（每帧被推，就得一直往反方向挪） */
    let dm = 0;
    addUpdate({ update(dt){
      dm += dt;
      if(dm < 6.4){
        DUMMY.pos.x -= push.x * dt * 2.6;
        DUMMY.pos.z -= push.z * dt * 2.6;
        if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
        if(dm > 5.4) this.dead = true;
      }else this.dead = true;
    }});
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '起灰了 · 逆着风', '#b0b8c0'));
  }
  },
  flamewraith: {
    n: '附身',
    tag: '躲在小的里面',
    warm: 2.2,
    mul: 1,
    rule: '它钻进四只里的一只 —— **那只才是本体**，打别的是反噬',
    kind: '假目标 ×4（其中一个是它）',
    dmg: 'reflect · 打错目标反噬',
    answer: '只打变红的那只',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<4;i++){
      const a = Math.PI*2*i/4 + aimAngle(), d = R(5.6);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(1.4) });
    }
    return out; })() };
  },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const pts = this.hit().pts;
    const which = Math.floor(Math.random()*4);
    const mins = pts.map((p, i)=>{
      const m = billMesh(TEX.smoke, 0x6a7a6a, .9);
      m.position.set(p.x, 1.0, p.z); m.scale.setScalar(1.5);
      const sh = flatMesh(TEX.soft, 0x556a55, THREE.AdditiveBlending, .4);
      sh.rotation.x = -Math.PI/2; sh.position.set(p.x, .06, p.z); sh.scale.setScalar(2.2);
      return { p, m, sh, host:false };
    });
    /* 附身：第 which 只变红变大 */
    delay(1.6, ()=>{
      const t2 = mins[which];
      t2.host = true;
      t2.m.material.color.set(0xff4a2a); t2.m.scale.setScalar(2.3);
      t2.sh.material.color.set(0xff4a2a); t2.sh.scale.setScalar(3.2);
      BFX.burst(V3(t2.p.x, 1.2, t2.p.z), 16, { tex:'ember', sp:2.6, s0:.6, a0:.9, color:0xff5a2a, grav:-2 });
      floatText(V3(t2.p.x, 2.6, t2.p.z), '它是本体', '#ff5a2a');
    });
    /* 结算：离哪只最近就打哪只 —— 打错就是反噬 */
    delay(3.6, ()=>{
      let best = 0, bd = 1e9;
      mins.forEach((m, i)=>{
        const d = Math.hypot(DUMMY.pos.x - m.p.x, DUMMY.pos.z - m.p.z);
        if(d < bd){ bd = d; best = i; }
      });
      const right = best === which;
      BFX.shock(V3(mins[best].p.x, 0, mins[best].p.z), R(3.0), { color: right ? 0xff8a4a : 0x8ad0ff, dur:.5 });
      say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
        right ? '打对了 ×' + S.mul : '打错 · 反噬 ×' + (S.mul*1.8).toFixed(2),
        right ? '#ff9a5a' : '#8ad0ff');
      if(!right) hurtVignette();
      mins.forEach((m, i)=>{
        if(i === which) return;
        scene.remove(m.sh); m.sh.material.dispose();
      });
    });
    delay(5.4, ()=>mins.forEach(m=>{ scene.remove(m.m); scene.remove(m.sh);
      m.m.material.dispose(); m.sh.material.dispose(); }));
    /* 演示：跑到红色那只旁边 */
    delay(2.0, ()=>{ const t2 = mins[which]; moveDummy(V3(t2.p.x, 0, t2.p.z - 2.0), .7); });
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '四只里有一个是它', '#ff7a5a'));
  }
  },
  flameemperor: {
    n: '天火轮',
    tag: '两圈反向转',
    warm: 1,
    mul: 0.28,
    rule: '两圈天火**反向**旋转，第二圈错开半格 —— 跟着转才卡得住缝',
    kind: '两圈环绕的火球（orbit）',
    dmg: 'burst · 每次擦到一下',
    answer: '跟着转，卡在两道之间',
    hit: function(){ return { shape:'self', note:'两圈环绕火球反向旋转' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const orbsA = [], orbsB = [];
    const NA = 8, NB = 8;
    for(let i=0;i<NA;i++){
      const m = billMesh(TEX.ember, 0xff7a3c, .95);
      m.scale.setScalar(1.5); scene.add(m); orbsA.push(m);
    }
    for(let i=0;i<NB;i++){
      const m = billMesh(TEX.ember, 0xffb04a, .95);
      m.scale.setScalar(1.3); scene.add(m); orbsB.push(m);
    }
    let t = 0, cool = 0;
    addUpdate({ update(dt){
      t += dt; cool -= dt;
      if(t > 8){ orbsA.concat(orbsB).forEach(m=>{ scene.remove(m); m.material.dispose(); });
        this.dead = true; return; }
      const rA = R(6.2), rB = R(4.0);
      const aA = t * .85, aB = -t * 1.25 + Math.PI/NA;   /* 反向 + 错开半格 */
      orbsA.forEach((m, i)=>{
        const a = aA + i*Math.PI*2/NA;
        m.position.set(P.x + Math.sin(a)*rA, 1.0 + Math.sin(t*3+i)*.12, P.z + Math.cos(a)*rA);
      });
      orbsB.forEach((m, i)=>{
        const a = aB + i*Math.PI*2/NB;
        m.position.set(P.x + Math.sin(a)*rB, .7, P.z + Math.cos(a)*rB);
      });
      /* 判定：离任何一颗火球 < 1.1 就擦到 */
      const all = orbsA.concat(orbsB);
      for(const m of all){
        if(Math.hypot(DUMMY.pos.x-m.position.x, DUMMY.pos.z-m.position.z) < 1.15){
          if(cool <= 0){
            cool = .5;
            BFX.burst(V3(DUMMY.pos.x, 1.0, DUMMY.pos.z), 5,
              { tex:'ember', sp:2.0, s0:.4, a0:.8, color:0xffa04a, grav:-1 });
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '擦到 ×' + S.mul, '#ffb04a');
            hurtVignette();
          }
          break;
        }
      }
    }});
    /* 演示：站在两圈之间的"环带"上，跟着转一小段 */
    const rMid = (R(6.2) + R(4.0)) / 2;
    for(let k=0;k<5;k++){
      delay(.6 + k*.85, ()=>{
        const ang = (k * .85) * .85 + k * .55;
        moveDummy(V3(P.x + Math.sin(ang)*rMid, 0, P.z + Math.cos(ang)*rMid), .5);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '两圈反向转 · 跟着转', '#ffb04a'));
  }
  },
  ferryman: {
    n: '引渡',
    tag: '绳索一直在拽',
    warm: 1,
    mul: 0.55,
    rule: '一条引魂索连着你，**一直在往它那边拽** —— 一停下来就被拖过去',
    kind: '锁链（beam，跟着你）',
    dmg: 'drain · 拖到身边就吸你的血',
    answer: '一直往外走',
    hit: function(){ return { shape:'self', note:'持续牵引（位移由敌人决定）' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    BFX.beam({ a: ()=>V3(P.x, 1.2, P.z), b: ()=>V3(DUMMY.pos.x, .9, DUMMY.pos.z),
      w:.30, color:0x8a9ac0, life:8, opacity:.9,
      onTick(t2, dt, a, b){
        const L = Math.hypot(b.x-a.x, b.z-a.z) || 1;
        /* 拽：每秒 2.2 米（离得越远拉力越小，但一直有） */
        const pull = Math.min(2.4, L * .45);
        DUMMY.pos.x += (a.x-b.x)/L * pull * dt;
        DUMMY.pos.z += (a.z-b.z)/L * pull * dt;
        if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
        if(L < 2.4){
          if(Math.random() < .06)
            BFX.burst(V3(b.x, 1.0, b.z), 4, { tex:'smoke', sp:1.6, s0:.5, a0:.7, color:0xc0a0d0, grav:-1 });
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被吸 ×' + S.mul, '#c0a0ff');
          hurtVignette();
        }
      }});
    /* 演示：每帧往外走，抵消拉力 */
    let dm = 0;
    const away = aimAngle();
    addUpdate({ update(dt){
      dm += dt;
      if(dm > 7.4){ this.dead = true; return; }
      DUMMY.pos.x += Math.sin(away) * dt * 2.7;
      DUMMY.pos.z += Math.cos(away) * dt * 2.7;
      if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
    }});
    /* 场边那圈"过不去的界"：走到边就被顶回来 */
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '被拽住了 · 一直往外走', '#aab8e0'));
  }
  },
  swordlord: {
    n: '万剑',
    tag: '十六柄从外面飞进来',
    warm: 1,
    mul: 0.35,
    rule: '十六柄剑从场地边缘**飞进来** —— 往外跑正好撞上，要往缝里钻',
    kind: '飞行的剑 ×16（实体，带轨迹）',
    dmg: 'burst · 撞上一柄算一柄',
    answer: '往缝里钻，别往外跑',
    hit: function(){ return { shape:'self', note:'十六柄剑由外向内飞' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const NB = 16, blades = [];
    const rot = Math.random()*6.283;
    for(let i=0;i<NB;i++){
      const a = rot + i*Math.PI*2/NB;
      const d0 = R(12.5);
      blades.push(BFX.entity({
        x: P.x + Math.sin(a)*d0, z: P.z + Math.cos(a)*d0,
        tex: TEX.ember, color:0xbfe0ff, size:.9, speed:R(7.4), life:3.2, hitEvery:.9,
        target: ()=>V3(P.x, 0, P.z),
        onFrame(e, dt){
          /* 尾迹：一道短白线，看得出"从哪来" */
          if(Math.random() < .55)
            BFX.burst(V3(e.x, .9, e.z), 1, { tex:'ember', sp:.4, s0:.42, a0:.55,
              color:0x9fd0ff, grav:0 });
          void dt;
        },
        onTouch(){ say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被剑穿 ×' + S.mul, '#bfe0ff');
          hurtVignette(); }
      }));
    }
    /* Boss 自己也在射剑：中心那一圈是唯一"密"的地方 */
    BFX.shock(V3(P.x, 0, P.z), R(2.2), { color:0x9fd0ff, dur:.4, thi:.6 });
    /* 演示：往两柄剑的中间钻（不是往外跑） */
    const mid = rot + Math.PI/NB;
    delay(.35, ()=>moveDummy(V3(P.x + Math.sin(mid)*3.6, 0, P.z + Math.cos(mid)*3.6), .55));
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '剑从外面来 · 往里钻', '#bfe0ff'));
  }
  },
  marrowlord: {
    n: '抽髓',
    tag: '骨线连着，绕柱断',
    warm: 1,
    mul: 0.04,
    rule: '一条骨线连着你，**每半秒抽一次当前生命** —— 绕到石柱后面，线才会断',
    kind: '骨线（trail，跟到你脚下）',
    dmg: 'pct · 每 0.5 秒抽当前生命 4%',
    answer: '绕到石柱后面',
    hit: function(){ return { shape:'self', note:'骨线持续抽取（按当前生命 %）' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const line = BFX.trail({ color:0xd8c8b0, w:.30, max:40, opacity:.95, growTip:false });
    const pillars = [];
    for(let i=0;i<4;i++){
      const a = Math.PI*2*i/4 + .6, d = R(6.2);
      const px = P.x + Math.sin(a)*d, pz = P.z + Math.cos(a)*d;
      const g = new THREE.CylinderGeometry(R(.7), R(.9), 2.6, 8);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color:0x7a7060, roughness:.95, flatShading:true }));
      m.position.set(px, 1.3, pz); scene.add(m);
      pillars.push({ x:px, z:pz, r:R(1.0), g, m });
    }
    let t = 0, acc = 0, cut = false;
    addUpdate({ update(dt){
      t += dt;
      if(t > 7.6){
        line.kill(); pillars.forEach(p=>{ scene.remove(p.m); p.g.dispose(); p.m.material.dispose(); });
        this.dead = true; return;
      }
      /* 每帧重画这条线：从它身上，绕到你脚下 */
      line.clear();
      line.push(P.x, P.z);
      const steps = 9;
      for(let i=1;i<=steps;i++){
        const u = i/steps;
        const sag = Math.sin(u*Math.PI) * .9;
        line.push(P.x + (DUMMY.pos.x-P.x)*u + Math.sin(u*7+t*2)*sag,
                  P.z + (DUMMY.pos.z-P.z)*u + Math.cos(u*7+t*2)*sag);
      }
      /* 线经过柱子后面 = 断（用线段到点距离判） */
      cut = false;
      for(const p of pillars){
        for(let i=0;i<line.pts.length-1;i++){
          const a = line.pts[i], b = line.pts[i+1];
          const vx = b.x-a.x, vz = b.z-a.z, L2 = vx*vx+vz*vz || 1;
          let u = ((p.x-a.x)*vx + (p.z-a.z)*vz)/L2; u = Math.max(0, Math.min(1, u));
          if(Math.hypot(p.x-(a.x+vx*u), p.z-(a.z+vz*u)) < p.r) cut = true;
        }
      }
      acc += dt;
      if(acc > .5){
        acc = 0;
        if(cut){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '线被石柱挡住了', '#8fd05a');
        }else{
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '抽髓 · 当前生命 4%', '#e8d8c0');
          hurtVignette();
        }
      }
      line.setOpacity(cut ? .25 : .95);
    }});
    /* 演示：绕到最近那根柱子后面 */
    delay(.5, ()=>{
      const p = pillars.slice().sort((a,b)=>
        Math.hypot(DUMMY.pos.x-a.x, DUMMY.pos.z-a.z) - Math.hypot(DUMMY.pos.x-b.x, DUMMY.pos.z-b.z))[0];
      const A2 = Math.atan2(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z);
      moveDummy(V3(p.x + Math.sin(A2)*1.9, 0, p.z + Math.cos(A2)*1.9), .7);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '骨线连着 · 绕柱断', '#e8d8c0'));
  }
  },
  riverwraith: {
    n: '遗忘',
    tag: '被贴上就灰技能',
    warm: 0.9,
    mul: 0,
    rule: '被它贴上，**随机一个技能灰掉 4 秒** —— 这一招不疼，但会让你少一格',
    kind: '贴身的暗环（attach）',
    dmg: 'disable · 随机一格技能灰 4 秒',
    answer: '别让它贴身',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(3.4) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const halo = flatMesh(TEX.ring, 0x6a4a8a, THREE.AdditiveBlending, .0);
    halo.rotation.x = -Math.PI/2; halo.renderOrder = 7;
    /* 它自己慢慢贴过来 —— 贴着走，不是瞬移 */
    const ghost = BFX.entity({ x:P.x + Math.sin(aimAngle())*6, z:P.z + Math.cos(aimAngle())*6,
      tex:TEX.smoke, color:0x8a6aa0, size:1.9, speed:2.1, life:7.6, hitEvery:99,
      target: ()=>DUMMY.pos, opacity:.7,
      onFrame(e){
        if(Math.hypot(e.x-DUMMY.pos.x, e.z-DUMMY.pos.z) < 2.0){
          const g = e;
          halo.position.set(DUMMY.pos.x, .09, DUMMY.pos.z);
          halo.scale.setScalar(2.6 + Math.sin(TIME.t*9)*.18);
          halo.material.opacity = .8;
          if(!g._said){ g._said = true;
            BFX.burst(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), 10,
              { tex:'smoke', sp:2.0, s0:.6, a0:.8, color:0x8a6aa0, grav:-.6 });
            flashScreen(.2, .2);
            /* "灰掉一格"：从这一只的技能组里随机挑一个不重复的 */
            const kit = (KIT[BOSS.id] || []).filter(k=>k !== 'nt_' + BOSS.id);
            const pick = kit[Math.floor(Math.random()*kit.length)];
            const nm = SKILL_INDEX[pick] ? SKILL_INDEX[pick].name : '一格';
            say(V3(DUMMY.pos.x, 1.5, DUMMY.pos.z), '遗忘：' + nm + ' 灰 4 秒', '#b48cd0');
            /* 灰掉一格是**这套 UI 的事**，不是这一招的事。
             * 直接写 document.querySelector + setTimeout 的话，这一招搬进游戏就
             * 会摸一个不存在的按钮、并且用真实时间（切图不会取消）——
             * 所以交回宿主：特效台里灰格子，游戏里由 BossCast 决定怎么表现。 */
            markForgotten(pick);
          }
        }else{
          halo.material.opacity *= .92;
        }
      } });
    void ghost;
    /* halo 是手搓的 mesh：**谁 scene.add 谁负责收**。entity 自己会到点就死，
     * 但它不知道这块贴地环的存在 —— 不管它，放完这一招地上就永远多一个暗环。 */
    addUpdate({ update(){
      if(ghost.dead){ scene.remove(halo); halo.material.dispose(); this.dead = true; }
    }});
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '它贴过来了 · 别贴身', '#b48cd0'));
    /* 演示：往反方向拉开 */
    const A = aimAngle();
    delay(.6, ()=>moveDummy(V3(P.x + Math.sin(A)*6.4, 0, P.z + Math.cos(A)*6.4), .6));
    delay(2.6, ()=>moveDummy(V3(P.x + Math.sin(A + .9)*6.8, 0, P.z + Math.cos(A + .9)*6.8), .6));
  }
  },
  abysswyrm: {
    n: '盘踞',
    tag: '一圈蟒身往里收',
    warm: 1,
    mul: 0.7,
    rule: '蟒身沿场边盘成一圈，**慢慢收紧** —— 可站的地方越来越小，越靠外越疼',
    kind: '盘成一圈的蟒身（trail 闭环）',
    dmg: 'crush · 越靠外越疼',
    answer: '往里站',
    hit: function(){ return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(12.0), r0:R(5.0) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const body = BFX.trail({ color:0x4a6a8a, w:.95, max:120, opacity:.95 });
    const NPT = 56;
    let t = 0, acc = 0, rad = R(12.0);
    /* 先把整圈铺出来（0.8 秒），再收紧 */
    for(let i=0;i<NPT;i++){
      const a = Math.PI*2*i/NPT;
      delay(i*.014, ()=>body.push(P.x + Math.sin(a)*rad, P.z + Math.cos(a)*rad));
    }
    addUpdate({ update(dt){
      t += dt;
      if(t > 9){ body.retract(); this.dead = true; return; }
      if(t > 1.0){
        /* 收紧：12 → 5，每秒 1.1 米 */
        rad = Math.max(R(5.0), R(12.0) - (t - 1.0) * 1.15);
        body.clear();
        for(let i=0;i<NPT;i++){
          const a = Math.PI*2*i/NPT + Math.sin(t*.7)*.02;
          const wob = Math.sin(a*5 + t*2) * .35;
          body.push(P.x + Math.sin(a)*(rad + wob), P.z + Math.cos(a)*(rad + wob));
        }
      }
      acc += dt;
      if(acc > .5){
        acc = 0;
        const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        if(d > rad - .6){
          const k = Math.min(1, (d - (rad - .6)) / 3);
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
            '被蟒身挤 ×' + (S.mul*(.4 + k)).toFixed(2), '#8aa8c8');
          hurtVignette();
        }
      }
    }});
    /* 演示：往里退 */
    delay(.9, ()=>moveDummy(V3(P.x, 0, P.z + R(3.2)), .9));
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '蟒身盘成一圈 · 往里', '#8aa8c8'));
  }
  },
  yellowspring: {
    n: '判词',
    tag: '站进圈里才活',
    warm: 3.2,
    mul: 1,
    rule: '地上写一道判词，**站在圈里的是活人** —— 别的招都教你躲，这一招教你走进去',
    kind: '反向判定圈（只在圈内安全）',
    dmg: 'exec · 圈外按已损血处决',
    answer: '主动走进去',
    mk: function(){
    const A = aimAngle() + Math.PI*.55, d = R(6.2);
    return { x:BOSS.pos.x + Math.sin(A)*d, z:BOSS.pos.z + Math.cos(A)*d, r:R(2.9) };
  },
    hit: function(){ const m = this.mk(); return { shape:'circle', x:m.x, z:m.z, r:m.r, invert:true }; },
    run: function(){
    const S = this;
    const say = nSay(), m = this.mk();
    BFX.zone({ shape:'circle', x:m.x, z:m.z, r:m.r, dur:3.2, color:0xffd24a });
    BFX.decal({ x:m.x, z:m.z, tex:'rune', r:m.r*1.1, life:3.2, color:0xffd24a, a0:.45 });
    const halo = flatMesh(TEX.ring, 0xffd24a, THREE.AdditiveBlending, .9);
    halo.rotation.x = -Math.PI/2;
    halo.position.set(m.x, .09, m.z); halo.scale.setScalar(m.r*2.4); halo.renderOrder = 7;
    addUpdate({ t:0, update(dt){
      this.t += dt;
      halo.material.opacity = .5 * (.6 + .4*Math.sin(this.t*5));
      if(this.t > 3.2){ disposeMesh(halo); this.dead = true; }
    }});
    delay(.6, ()=>floatText(V3(m.x, 2.4, m.z), '判词 · 站进来', '#ffd24a'));
    /* 演示：主动走进去 —— 和所有别的招相反 */
    delay(.7, ()=>moveDummy(V3(m.x, 0, m.z), 1.1));
    delay(3.2, ()=>{
      const inside = Math.hypot(DUMMY.pos.x - m.x, DUMMY.pos.z - m.z) <= m.r;
      BFX.shock(V3(m.x, 0, m.z), m.r*3.2, { color:0xffffff, dur:.5, thi:.9 });
      BFX.decal({ x:m.x, z:m.z, tex:'rune', r:m.r*1.02, life:1.6, color:0xfff0b0, a0:.9 });
      BFX.shock(V3(m.x, 0, m.z), m.r*2.0, { color:0xffd24a, dur:.85, thi:.45 });
      shake(1.2, .35);
      say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
        inside ? '判：生' : '判：死（圈外全灭）', inside ? '#8fd05a' : '#ff5a5a');
      if(!inside) hurtVignette();
    });
  }
  },
  chaos: {
    n: '无相',
    tag: '三种形态轮换',
    warm: 1.1,
    mul: 0.9,
    rule: '每 3 秒换一个形态（环 / 扇 / 散）—— **认错了就躲错方向**',
    kind: '形态轮换（环 / 扇 / 散）',
    dmg: 'burst · 按当前形态结算',
    answer: '先认形态，再决定方向',
    hit: function(){ return { shape:'self', note:'形态决定形状' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 它身上那层"相"：换形态时整只换色 + 抖一下 */
    const shell = flatMesh(TEX.ring, 0xb48cff, THREE.AdditiveBlending, .0);
    shell.rotation.x = -Math.PI/2; shell.position.set(P.x, .09, P.z);
    let form = 0;
    const forms = [
      { k:'环', c:0xb48cff, ans:'站中间' },
      { k:'扇', c:0xff6ad0, ans:'绕到它背后' },
      { k:'散', c:0x6ad0ff, ans:'站进缝里' }
    ];
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const f = Math.floor(this.t / 1.1) % 3;
      if(f !== form){
        form = f;
        const F = forms[form];
        floatText(V3(P.x, 3.5, P.z), F.k + ' · ' + F.ans, hexs(F.c));
        BFX.burst(V3(P.x, 1.2, P.z), 12, { tex:'smoke', sp:2.4, s0:.7, a0:.7, color:F.c, grav:0 });
        shell.material.color.set(F.c);
        shell.material.opacity = .9;
        shell.scale.setScalar(2.4);
        /* 换相 = 换判定：这里把"现在该怎么躲"直接摆在场地上 */
        if(form === 0){
          BFX.zone({ shape:'ring', x:P.x, z:P.z, r:R(9.5), r0:R(3.4), dur:.85, color:F.c });
        }else if(form === 1){
          const A = aimAngle();
          BFX.zone({ shape:'fan', x:P.x, z:P.z, angle:A, span:Math.PI*.85, r:R(11), dur:.85, color:F.c });
        }else{
          const pts = [];
          for(let i=0;i<8;i++){
            const a = Math.PI*2*i/8 + .3, d = R(4.4 + (i%3)*3.2);
            pts.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(1.9) });
          }
          pts.forEach(p=>BFX.zone({ shape:'circle', x:p.x, z:p.z, r:p.r, dur:.85, color:F.c }));
        }
        delay(.85, ()=>S.check && S.check());
      }
      shell.material.opacity *= .93;
      if(this.t > 7.4){ disposeMesh(shell); this.dead = true; }
    }});
    /* 结算：按当前形态判 */
    S.check = ()=>{
      const F = forms[form];
      let inside = false;
      if(form === 0){
        const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        inside = d > R(3.4) && d < R(9.5);
      }else if(form === 1){
        const A = aimAngle();
        inside = inHit({ shape:'fan', x:P.x, z:P.z, angle:A, span:Math.PI*.85, r:R(11) },
          DUMMY.pos.x, DUMMY.pos.z);
      }else{
        for(let i=0;i<8;i++){
          const a = Math.PI*2*i/8 + .3, d = R(4.4 + (i%3)*3.2);
          if(Math.hypot(DUMMY.pos.x-(P.x+Math.sin(a)*d), DUMMY.pos.z-(P.z+Math.cos(a)*d)) < R(1.9)) inside = true;
        }
      }
      say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
        F.k + (inside ? ' · 中了 ×' + S.mul : ' · 躲开'), inside ? '#ff8a8a' : '#8fd05a');
      if(inside) hurtVignette();
    };
    /* 演示：三种形态各走一次 */
    const A = aimAngle();
    delay(.9, ()=>moveDummy(V3(P.x, 0, P.z + R(1.6)), .5));                     /* 环 → 中间 */
    delay(2.0, ()=>moveDummy(V3(P.x + Math.sin(A+Math.PI)*R(8), 0, P.z + Math.cos(A+Math.PI)*R(8)), .6)); /* 扇 → 背后 */
    delay(3.1, ()=>moveDummy(V3(P.x + Math.sin(A+.2)*R(2.2), 0, P.z + Math.cos(A+.2)*R(2.2)), .5));      /* 散 → 缝里 */
  }
  },
  swordguardian: {
    n: '剑围',
    tag: '缺口每 0.9 秒换位',
    warm: 1,
    mul: 0.6,
    rule: '一圈剑插在四周，只有一处缺口 —— **缺口每 0.9 秒换一个位置**',
    kind: '一圈剑（缺口在转）',
    dmg: 'burst · 撞到剑刃',
    answer: '跟着缺口转',
    hit: function(){ return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(8.2), r0:R(4.2) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const NB = 12, swords = [];
    const geo = new THREE.ConeGeometry(R(.28), R(2.6), 4);
    const mat = new THREE.MeshStandardMaterial({ color:0x3a4a5a, roughness:.35,
      metalness:.8, emissive:new THREE.Color(0x8fd8ff), emissiveIntensity:.5, flatShading:true });
    for(let i=0;i<NB;i++){
      const m = new THREE.Mesh(geo, mat);
      m.position.set(P.x, 1.3, P.z); scene.add(m); swords.push(m);
    }
    let t = 0, acc = 0, gapIdx = 0;
    addUpdate({ update(dt){
      t += dt;
      const rad = R(8.2);
      gapIdx = Math.floor(t / .9) % NB;
      swords.forEach((m, i)=>{
        const a = Math.PI*2*i/NB + t*.12;
        const isGap = i === gapIdx;
        m.visible = !isGap;
        m.position.set(P.x + Math.sin(a)*rad, isGap ? -9 : 1.3, P.z + Math.cos(a)*rad);
        m.rotation.z = Math.sin(a)*.12;
      });
      acc += dt;
      if(acc > .45){
        acc = 0;
        const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        if(d > R(4.2) && d < rad + .8)
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '剑围里 ×' + S.mul, '#8fd8ff');
        if(d < R(4.2)) say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '圈里是空的 · 待着', '#8fd05a');
      }
      if(t > 7.4){ swords.forEach(m=>{ scene.remove(m); }); geo.dispose(); mat.dispose();
        this.dead = true; }
    }});
    /* 演示：跟着缺口一格一格挪 */
    for(let k=1;k<=5;k++){
      delay(k*.9, ()=>{
        const a = Math.PI*2*((Math.floor((k*.9)/.9)) % NB)/NB + (k*.9)*.12;
        moveDummy(V3(P.x + Math.sin(a)*R(3.0), 0, P.z + Math.cos(a)*R(3.0)), .45);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '缺口在转 · 跟着转', '#8fd8ff'));
  }
  },
  bladelord: {
    n: '剑气潮',
    tag: '整面墙，一个洞',
    warm: 1,
    mul: 0.5,
    rule: '一整面剑气墙从一侧推到另一侧，**墙上只有一个洞** —— 而洞在动',
    kind: '一面推进的墙（洞在动）',
    dmg: 'multi · 每被扫一次加一档',
    answer: '追着那个洞跑',
    hit: function(){ return { shape:'self', note:'整面墙推进（洞的位置随时间变）' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const A = aimAngle() + Math.PI;
    const full = R(26), gw = R(3.6);
    const from = R(14), spd = R(3.6);
    /* 墙画成两段，中间留洞 —— 洞跟着时间横移 */
    let segs = [];
    const rebuild = (hole)=>{
      segs.forEach(w=>w.kill && w.kill());
      segs = [];
      const leftLen = (full/2 + hole - gw/2), rightLen = (full/2 - hole - gw/2);
      const mk = (off, len)=>segs.push(BFX.wall({ x:P.x, z:P.z, angle:A, off, len, th:R(1.2),
        from, to:-from, speed:spd, color:0x9fd8ff, tex:TEX.smoke, life:7 }));
      if(leftLen > 1) mk(-(full/2 - leftLen/2), leftLen);
      if(rightLen > 1) mk(+(full/2 - rightLen/2), rightLen);
    };
    let hole = Math.sin(0) * R(7);
    rebuild(hole);
    let t = 0, acc = 0, tag = false;
    const lx = Math.cos(A), lz = -Math.sin(A);
    addUpdate({ update(dt){
      t += dt;
      if(t > 7){ this.dead = true; return; }
      /* 洞横移：每 0.5 秒重建一次墙体，看得出"洞在跑" */
      if(Math.floor(t*2) !== Math.floor((t-dt)*2)){
        hole = Math.sin(t * 1.35) * R(7.2);
        rebuild(hole);
      }
      const d = from - spd * t;
      const wx = P.x + Math.sin(A)*d, wz = P.z + Math.cos(A)*d;
      const along = (DUMMY.pos.x - wx)*Math.sin(A) + (DUMMY.pos.z - wz)*Math.cos(A);
      const side = (DUMMY.pos.x - wx)*lx + (DUMMY.pos.z - wz)*lz;
      const hit = Math.abs(along) < R(1.3) && Math.abs(side - hole) > gw/2;
      if(hit && !tag){ tag = true;
        say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被剑气扫到 ×' + S.mul, '#9fd8ff');
        hurtVignette(); flashScreen(.3, .16); }
      if(!hit) tag = false;
      acc += dt;
      if(acc > .7){ acc = 0; }
    }});
    /* 演示：追着洞跑（洞在动，人也得动） */
    for(let k=0;k<6;k++){
      delay(.5 + k*.55, ()=>{
        const tt = .5 + k*.55;
        const h = Math.sin(tt * 1.35) * R(7.2);
        moveDummy(V3(P.x + lx*h, 0, P.z + lz*h), .45);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '墙上的洞在动 · 追着它', '#9fd8ff'));
  }
  },
  swordemperor: {
    n: '一剑',
    tag: '一条线，三秒',
    warm: 3,
    mul: 1.6,
    rule: '蓄力三秒，地上只有**一条头发丝粗的红线** —— 找不到它，就躲不掉',
    kind: '一条极细的线（beam 蓄力）',
    dmg: 'true · 穿盾满伤',
    answer: '看见线就离开它一米',
    hit: function(){ return { shape:'line', x:BOSS.pos.x, z:BOSS.pos.z,
    angle:this._a != null ? this._a : aimAngle(), w:.9, len:R(30) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    let A = aimAngle();
    S._a = A;
    /* 线：一条很窄的 beam，从它脚下一路铺到场地另一头 */
    const line = BFX.trail({ color:0xff2a3a, w:.06, max:6, opacity:1, growTip:false });
    line.push(P.x, P.z);
    line.push(P.x + Math.sin(A)*R(15), P.z + Math.cos(A)*R(15));
    /* 线上偶尔跳一下，提示"这里有一条线" */
    let t = 0, fired = false;
    addUpdate({ update(dt){
      t += dt;
      if(!fired && Math.random() < .12)
        BFX.burst(V3(P.x + Math.sin(A)*(Math.random()*14), .1, P.z + Math.cos(A)*(Math.random()*14)),
          1, { tex:'ember', sp:.2, s0:.2, a0:.8, color:0xff2a3a, grav:0 });
      /* 两秒半之后，线条跟着玩家转一点点 —— 假动作 */
      if(!fired && t > 2.3 && Math.abs(A - aimAngle()) > .02){
        A += (aimAngle() - A) * Math.min(1, dt * 4.5);
        S._a = A;
        line.clear();
        line.push(P.x, P.z);
        line.push(P.x + Math.sin(A)*R(15), P.z + Math.cos(A)*R(15));
        line.setOpacity(.8 + .2*Math.sin(t*30));
      }
      if(!fired && t >= 3.0){
        fired = true;
        /* 斩：一条又白又直的细线瞬间贯穿 */
        const sl = flatMesh(TEX.soft, 0xffffff, THREE.AdditiveBlending, .95);
        sl.rotation.x = -Math.PI/2; sl.rotation.z = A;
        sl.position.set(P.x + Math.sin(A)*R(7), .12, P.z + Math.cos(A)*R(7));
        sl.scale.set(.5, R(30), 1); sl.renderOrder = 8;
        delay(.5, ()=>disposeMesh(sl));
        shake(2.0, .5); flashScreen(.5, .25);
        line.setOpacity(0); delay(.3, ()=>line.kill());
        /* 判定：到这条直线的距离 */
        const dx = DUMMY.pos.x - P.x, dz = DUMMY.pos.z - P.z;
        const perp = Math.abs(dx * Math.cos(A) - dz * Math.sin(A));
        const fwd = dx * Math.sin(A) + dz * Math.cos(A);
        const on = perp < .95 && fwd > 0 && fwd < R(15);
        say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
          on ? '被斩 ×' + S.mul : '离线一米 · 斩空', on ? '#ff5a5a' : '#8fd05a');
        if(on){ hurtVignette(); flashScreen(.4, .3); }
        this.dead = true;
      }
      if(t > 4.2){ line.kill(); this.dead = true; }
    }});
    /* 演示：站到线的一侧去 */
    delay(1.2, ()=>{
      const px = P.x + Math.cos(A)*1.9, pz = P.z - Math.sin(A)*1.9;
      moveDummy(V3(px, 0, pz), .8);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '地上有一条红线 · 找到它', '#ff3a4a'));
  }
  },
  cloudwarden: {
    n: '断桥',
    tag: '云一块块塌',
    warm: 1,
    mul: 1,
    rule: '九块云**一块块塌掉，塌过的永远不能站** —— 可站的面只会越来越小',
    kind: '会消失的地块（pool 逐个塌）',
    dmg: 'fall · 站上去直接掉下去',
    answer: '记住哪几块还在',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<9;i++){
      const a = Math.PI*2*i/9 + .2, d = i===0?0:R(6.4);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(2.2) });
    }
    return out; })() }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const pts = S.hit().pts;
    const tiles = pts.map((p, i)=>{
      const m = flatMesh(TEX.smoke, 0xb8d8e8, THREE.AdditiveBlending, .34);
      m.rotation.x = -Math.PI/2; m.position.set(p.x, .05, p.z);
      m.scale.setScalar(p.r*2); m.renderOrder = 2;
      const ring = flatMesh(TEX.ring, 0x9fd8ff, THREE.AdditiveBlending, .5);
      ring.rotation.x = -Math.PI/2; ring.position.set(p.x, .07, p.z);
      ring.scale.setScalar(p.r*2.1);
      return { p, m, ring, gone:false, i };
    });
    /* 随机顺序塌：每 0.55 秒塌一块，塌的时候有明显的下坠 */
    const order = tiles.map(t=>t.i).sort(()=> Math.random() - .5);
    order.forEach((idx, k)=>{
      delay(1.4 + k*.55, ()=>{
        const tl = tiles[idx];
        tl.gone = true;
        let g = 0;
        const up = addUpdate({ update(dt){
          g += dt;
          const u = Math.min(1, g/.4);
          tl.m.position.y = .05 - u*1.6;
          tl.ring.position.y = .07 - u*1.6;
          tl.m.material.opacity = .34 * (1-u);
          tl.ring.material.opacity = .5 * (1-u);
          if(u >= 1){ disposeMesh(tl.m); disposeMesh(tl.ring); this.dead = true; }
        }});
        void up;
      });
    });
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.4){ tiles.forEach(tl=>{ if(!tl.gone){ disposeMesh(tl.m); disposeMesh(tl.ring); } });
        this.dead = true; return; }
      acc += dt;
      if(acc > .4){
        acc = 0;
        const on = tiles.find(tl=>!tl.gone &&
          Math.hypot(DUMMY.pos.x-tl.p.x, DUMMY.pos.z-tl.p.z) < tl.p.r);
        if(!on){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '踩空 · 掉下去了', '#ff7a8a');
          hurtVignette(); shake(.8, .3);
          /* 被"捞回来"放到最近的活块上 —— 演示里不能真掉出去 */
          const alive = tiles.filter(tl=>!tl.gone)
            .sort((a,b)=>Math.hypot(a.p.x-DUMMY.pos.x,a.p.z-DUMMY.pos.z)
                        -Math.hypot(b.p.x-DUMMY.pos.x,b.p.z-DUMMY.pos.z))[0];
          if(alive) moveDummy(V3(alive.p.x, 0, alive.p.z), .35);
        }
      }
    }});
    /* 演示：一块一块挪到还活着的云上 */
    for(let k=0;k<5;k++){
      delay(1.7 + k*.6, ()=>{
        const alive = tiles.filter(tl=>!tl.gone)
          .sort((a,b)=>Math.hypot(a.p.x-DUMMY.pos.x,a.p.z-DUMMY.pos.z)
                      -Math.hypot(b.p.x-DUMMY.pos.x,b.p.z-DUMMY.pos.z))[0];
        if(alive) moveDummy(V3(alive.p.x, 0, alive.p.z), .3);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '云会一块块塌 · 记着哪块还在', '#9fd8ff'));
  }
  },
  heavenguard: {
    n: '天门转',
    tag: '扇形光柱绕场转',
    warm: 1,
    mul: 0.35,
    rule: '一道扇面光柱绕场旋转，**扫到就一直烧** —— 跟在它背面走',
    kind: '旋转的扇面光柱',
    dmg: 'burn · 扫到持续烧',
    answer: '跟在它背面走',
    hit: function(){ return { shape:'fan', x:BOSS.pos.x, z:BOSS.pos.z,
    angle:this._a != null ? this._a : 0, span:Math.PI*.62, r:R(13) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 口径照抄 BFX.zone 的 sector：几何角度固定，靠 rotation.z 转朝向。
       几何 +X 是 0°，本页角度是 atan2(dx,dz)，所以起点要减 90°。 */
    const SPAN = Math.PI*.62;
    const cone = new THREE.Mesh(
      new THREE.CircleGeometry(R(13), 40, -Math.PI/2 - SPAN/2, SPAN),
      new THREE.MeshBasicMaterial({ color:0xffe0a0, transparent:true, opacity:.22,
        blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
    cone.rotation.x = -Math.PI/2; cone.position.set(P.x, .08, P.z);
    scene.add(cone);
    const edge = flatMesh(TEX.ring, 0xfff0c0, THREE.AdditiveBlending, .8);
    edge.rotation.x = -Math.PI/2; edge.position.set(P.x, .1, P.z);
    edge.scale.setScalar(R(13)*2);
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.4){ disposeMesh(cone); disposeMesh(edge); this.dead = true; return; }
      const A = t * .95;
      S._a = A;
      cone.rotation.z = A;          /* 和 zone 的 sector 同一个口径 */
      edge.material.opacity = .28;
      acc += dt;
      if(acc > .45){
        acc = 0;
        const inside = inHit({ shape:'fan', x:P.x, z:P.z, angle:A,
          span:SPAN, r:R(13) }, DUMMY.pos.x, DUMMY.pos.z);
        if(inside){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被烧 ×' + S.mul, '#ffc06a');
          hurtVignette();
        }
      }
    }});
    /* 演示：绕到扇面背面（和它反向走） */
    for(let k=0;k<7;k++){
      delay(.5 + k*.9, ()=>{
        const A = (TIME.t) * .95 + Math.PI;
        moveDummy(V3(P.x + Math.sin(A)*R(9), 0, P.z + Math.cos(A)*R(9)), .55);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '扇面在转 · 走它背面', '#ffe0a0'));
  }
  },
  jadeemperor: {
    n: '玉玺',
    tag: '砸下来变柱子',
    warm: 1.3,
    mul: 0.8,
    rule: '玉玺砸下来会**留在场上变成柱子** —— 让它撞上去，它就破防三秒',
    kind: '落下的玉玺（留成石柱）',
    dmg: 'burst · 砸中 + 撞柱破防',
    answer: '把柱子留在它冲锋的路上',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<3;i++){
      const a = aimAngle() + Math.PI*i, d = R(4.6 + i*2.2);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(2.0) });
    }
    return out; })() }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const pts = S.hit().pts, pillars = [];
    pts.forEach((p, i)=>{
      delay(i*.3, ()=>{
        BFX.burst(V3(p.x, 5.2, p.z), 10, { tex:'rock', sp:1.0, s0:.7, a0:.8, color:0xd8c890, grav:-8 });
        delay(.5, ()=>{
          const g = new THREE.BoxGeometry(R(1.5), 2.6, R(1.5));
          const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color:0x8a7f5a, roughness:.7, metalness:.15, flatShading:true,
            emissive:new THREE.Color(0xffd24a), emissiveIntensity:.15 }));
          m.position.set(p.x, 1.3, p.z); scene.add(m);
          pillars.push({ x:p.x, z:p.z, r:R(1.2), g, m });
          BFX.shock(V3(p.x, 0, p.z), R(3.0), { color:0xffd24a, dur:.4, thi:.5 });
          if(Math.hypot(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z) < p.r){
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被玉玺砸中 ×' + S.mul, '#ffd24a');
            hurtVignette();
          }
        });
      });
    });
    /* 冲锋：撞上柱子 = 破防三秒（这就是它给你的窗口） */
    delay(2.0, ()=>{
      floatText(V3(P.x, 3.2, P.z), '它冲了 · 引它撞柱子', '#ffd24a');
      const A = aimAngle();
      let tt = 0;
      const up = addUpdate({ update(dt){
        tt += dt;
        if(tt > 3.4){ this.dead = true; return; }
        const nx = P.x + Math.sin(A) * tt * R(6.0);
        const nz = P.z + Math.cos(A) * tt * R(6.0);
        BFX.burst(V3(nx, .3, nz), 2, { tex:'smoke', sp:.8, s0:.7, a0:.4, color:0x8a7f5a, grav:-.4 });
        for(const pl of pillars){
          if(Math.hypot(nx-pl.x, nz-pl.z) < pl.r + .8){
            pl.m.material.emissiveIntensity = 1.6;
            BFX.burst(V3(pl.x, 1.6, pl.z), 14, { tex:'rock', sp:2.6, s0:.7, a0:.9, color:0xd8c890, grav:-3 });
            shake(1.8, .4); flashScreen(.35, .25);
            floatText(V3(pl.x, 3.0, pl.z), '撞柱 · 破防 3 秒', '#8fd05a');
            this.dead = true; return;
          }
        }
        if(Math.hypot(DUMMY.pos.x-nx, DUMMY.pos.z-nz) < R(2.4))
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被撞 ×' + S.mul, '#ffb04a');
      }});
    });
    delay(8.5, ()=>pillars.forEach(pl=>{ scene.remove(pl.m); pl.g.dispose(); pl.m.material.dispose(); }));
    /* 演示：把柱子留在它和自己之间 —— 人走到柱子后面 */
    delay(1.6, ()=>{
      const pl = pillars[0];
      if(pl){
        const A = Math.atan2(pl.x-P.x, pl.z-P.z);
        moveDummy(V3(pl.x + Math.sin(A)*2.6, 0, pl.z + Math.cos(A)*2.6), .6);
      }
    });
  }
  },
  starlord: {
    n: '陨星',
    tag: '看轨迹，不是看地面',
    warm: 1,
    mul: 1.1,
    rule: '陨星拖着一条**看得见的轨迹**划过天，轨迹的终点才是落点 —— 抬头读它，别低头找圈',
    kind: '划天的陨星（实体，带轨迹）',
    dmg: 'burst · 落点满伤 + 冲击波',
    answer: '读天上的轨迹',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<4;i++){
      const a = Math.PI*2*i/4 + .4, d = R(4.2 + (i%2)*3.6);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(2.4) });
    }
    return out; })() }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const pts = S.hit().pts;
    pts.forEach((p, i)=>{
      delay(i*.42, ()=>{
        /* 从画面外斜着飞进来：起点在落点的反方向、很高的地方 */
        const A = Math.atan2(p.x - P.x, p.z - P.z);
        const sx = p.x - Math.sin(A)*R(14), sz = p.z - Math.cos(A)*R(14);
        const body = billMesh(TEX.ember, 0xffb04a, 1);
        body.scale.setScalar(1.6); scene.add(body);
        const tail = BFX.trail({ color:0xff8a3a, w:.5, max:24, opacity:.9, y:.1 });
        let t = 0;
        const up = addUpdate({ update(dt){
          t += dt;
          const u = Math.min(1, t/1.1);
          body.position.set(sx + (p.x-sx)*u, 9.5 * (1-u) + .8, sz + (p.z-sz)*u);
          /* 尾迹跟着走，但**只留在地上**——这样"轨迹"和"落点"是同一条线 */
          if(Math.random() < .8){
            const u2 = Math.max(0, u - .18);
            tail.push(sx + (p.x-sx)*u2, sz + (p.z-sz)*u2);
          }
          if(u >= 1){
            scene.remove(body); body.material.dispose();
            BFX.spikes({ x:p.x, z:p.z, n:7, r:p.r*.85, h:1.8, color:0x4a3a2a, glow:0xffb04a, dur:1.4 });
            BFX.shock(V3(p.x, 0, p.z), p.r*2.6, { color:0xffb04a, dur:.5, thi:.6 });
            shake(1.2, .3);
            if(Math.hypot(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z) < p.r){
              say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被砸中 ×' + S.mul, '#ffb04a');
              hurtVignette();
            }
            delay(1.2, ()=>tail.kill());
            this.dead = true;
          }
        }});
        void up;
      });
    });
    /* 演示：站到两条轨迹之间 */
    delay(.5, ()=>{
      const a = Math.PI*2*0/4 + .4 + Math.PI/4;
      moveDummy(V3(P.x + Math.sin(a)*R(7.4), 0, P.z + Math.cos(a)*R(7.4)), .8);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.6, P.z), '看天上的轨迹 · 不是地上的圈', '#ffb04a'));
  }
  },
  mirrordemon: {
    n: '镜我',
    tag: '它会学你走',
    warm: 1,
    mul: 0.9,
    rule: '它复制出一个"你"，**模仿你 0.6 秒前的走位** —— 你走直线，它就压在你身上',
    kind: '模仿你的分身（split）',
    dmg: 'reflect · 站它旁边就被反噬',
    answer: '故意乱走，让它学歪',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(2.6) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const dbl = billMesh(TEX.smoke, 0x2a1a3a, .95);
    dbl.position.set(P.x + 2.6, 1.0, P.z); dbl.scale.setScalar(1.5); scene.add(dbl);
    const dsh = flatMesh(TEX.ring, 0x6a4a8a, THREE.AdditiveBlending, .6);
    dsh.rotation.x = -Math.PI/2; dsh.scale.setScalar(3.0); scene.add(dsh);
    const hist = [];
    let t = 0, last = -1, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8){ scene.remove(dbl); scene.remove(dsh);
        dbl.material.dispose(); dsh.material.dispose(); this.dead = true; return; }
      if(t - last > .05){ last = t; hist.push({ x:DUMMY.pos.x, z:DUMMY.pos.z }); if(hist.length > 40) hist.shift(); }
      /* 0.6 秒前的位置 */
      const j = Math.max(0, hist.length - Math.round(.6/.05));
      const h = hist[j] || hist[0] || DUMMY.pos;
      dbl.position.set(h.x, 1.0, h.z);
      dsh.position.set(h.x, .07, h.z);
      acc += dt;
      if(acc > .45){
        acc = 0;
        const d = Math.hypot(DUMMY.pos.x-h.x, DUMMY.pos.z-h.z);
        if(d < 1.5){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '和它重合 · 反噬 ×' + S.mul, '#b48cff');
          hurtVignette();
        }
      }
    }});
    /* 演示：突然变向 —— 分身还在走直线，两人就分开了 */
    delay(.7, ()=>{
      const A = aimAngle() + Math.PI;
      /* 先直走 1 秒（分身会学） */
      let k = 0;
      const up = addUpdate({ update(dt){
        k += dt;
        if(k < 1.1){
          DUMMY.pos.x += Math.sin(A)*dt*3.4; DUMMY.pos.z += Math.cos(A)*dt*3.4;
        }else if(k < 1.5){
          DUMMY.pos.x += Math.sin(A+1.6)*dt*5.2; DUMMY.pos.z += Math.cos(A+1.6)*dt*5.2;
        }else this.dead = true;
        if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
      }});
      void up;
    });
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '它会学你 · 突然变向', '#b48cff'));
  }
  },
  mirrorlord: {
    n: '镜面',
    tag: '半边场地不能用',
    warm: 1,
    mul: 0,
    rule: '场地**整整半边**变成镜面，站上去出招=打自己 —— 换半边',
    kind: '半场镜面（pool 覆盖）',
    dmg: 'reflect · 你在上面出多少伤就吃多少',
    answer: '换到没镜子的那半边',
    mk: function(){ return { a: (Math.floor(Math.random()*2) ? 0 : Math.PI) }; },
    hit: function(){ const m = this.mk();
    return { shape:'fan', x:BOSS.pos.x, z:BOSS.pos.z, angle:m.a, span:Math.PI, r:R(14) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const A0 = S.mk().a;
    /* 镜子：一个半圆形的平面，带格纹 */
    const geo = new THREE.CircleGeometry(R(14), 44, -Math.PI/2, Math.PI);
    const mat = new THREE.MeshBasicMaterial({ map:TEX.ring, color:0xc8e0f0, transparent:true,
      opacity:.35, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
      depthWrite:false, fog:false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI/2; m.rotation.z = -A0 + Math.PI/2;
    m.position.set(P.x, .06, P.z); m.renderOrder = 3;
    scene.add(m);
    /* 分界的那条线要亮：不然玩家看不出"哪半边是镜子" */
    const divider = flatMesh(TEX.soft, 0xe8f4ff, THREE.AdditiveBlending, .9);
    divider.rotation.x = -Math.PI/2; divider.rotation.z = -A0;
    divider.position.set(P.x, .09, P.z); divider.scale.set(.22, R(28), 1);
    scene.add(divider);
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.4){ disposeMesh(m); disposeMesh(divider); this.dead = true; return; }
      mat.opacity = .30 + .06*Math.sin(t*3);
      acc += dt;
      if(acc > .5){
        acc = 0;
        const inMirror = inHit({ shape:'fan', x:P.x, z:P.z, angle:A0, span:Math.PI, r:R(14) },
          DUMMY.pos.x, DUMMY.pos.z);
        if(inMirror) say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '镜面上 · 伤害反弹', '#c8e0f0');
      }
    }});
    /* 演示：走到另一半 */
    delay(.6, ()=>{
      const A2 = A0 + Math.PI + Math.PI/2;
      moveDummy(V3(P.x + Math.sin(A2)*R(6.4), 0, P.z + Math.cos(A2)*R(6.4)), .9);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '半边是镜子 · 换边', '#c8e0f0'));
  }
  },
  nineheaven: {
    n: '雷链',
    tag: '雷柱之间拉电',
    warm: 1,
    mul: 0.75,
    rule: '五根雷柱落定后，**相邻两根之间拉出一道电链** —— 站在链的两端外面，柱间空地不能站',
    kind: '雷柱 + 柱间的链（beam）',
    dmg: 'true · 链上穿盾',
    answer: '站到链的端点外面',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<5;i++){
      const a = Math.PI*2*i/5 + .35, d = R(5.2);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(1.5) });
    }
    return out; })() }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const pts = S.hit().pts;
    /* 先落雷柱 */
    pts.forEach((p, i)=>{
      delay(i*.18, ()=>{
        BFX.burst(V3(p.x, 6.0, p.z), 8, { tex:'ember', sp:1.4, s0:.5, a0:.9, color:0x9ad8ff, grav:-10 });
        delay(.3, ()=>{
          BFX.column({ x:p.x, z:p.z, r:.5, h:4.2, life:1.4, color:0x9ad8ff });
          BFX.shock(V3(p.x, 0, p.z), R(2.4), { color:0x9ad8ff, dur:.4, thi:.5 });
        });
      });
    });
    /* 再拉链：p[i] → p[i+1]，链本身有判定 */
    delay(1.1, ()=>{
      floatText(V3(P.x, 3.6, P.z), '雷链 · 别碰链', '#9ad8ff');
      for(let i=0;i<pts.length;i++){
        const a = pts[i], b = pts[(i+1)%pts.length];
        let on = 0;
        BFX.beam({ a: ()=>V3(a.x, .9, a.z), b: ()=>V3(b.x, .9, b.z),
          w:.13, color:0xd0f0ff, life:4.4, opacity:.95,
          onTick(t2, dt){
            on += dt;
            if(on > .4){ on = 0;
              const vx = b.x-a.x, vz = b.z-a.z, L2 = vx*vx+vz*vz || 1;
              let u = ((DUMMY.pos.x-a.x)*vx + (DUMMY.pos.z-a.z)*vz)/L2;
              u = Math.max(0, Math.min(1, u));
              if(Math.hypot(DUMMY.pos.x-(a.x+vx*u), DUMMY.pos.z-(a.z+vz*u)) < .9){
                say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '电链 ×' + S.mul, '#d0f0ff');
                hurtVignette(); flashScreen(.2, .12);
              }
            }
          } });
      }
    });
    /* 演示：走到链圈的中心 —— 链都在外圈，中间是空的 */
    delay(1.4, ()=>moveDummy(V3(P.x, 0, P.z), .8));
    delay(.3, ()=>floatText(V3(P.x, 3.0, P.z), '五根柱子互相连 · 中间是空的', '#9ad8ff'));
  }
  },
  chaosavatar: {
    n: '因果',
    tag: '压在你正在去的方向',
    warm: 1,
    mul: 1.15,
    rule: '落点压在你**正在去的方向**上 —— 直线跑必中，得突然变向',
    kind: '预判落点（按你的速度外推）',
    dmg: 'exec · 按已损失血加伤',
    answer: '突然变向',
    mk: function(){
    /* 用最近 0.4 秒的位移外推 0.9 秒 —— 这就是"因果" */
    const h = S_HIST.slice(-8);
    let vx = 0, vz = 0;
    if(h.length > 1){
      const a = h[0], b = h[h.length-1];
      vx = (b.x - a.x) / Math.max(.01, (h.length-1)*.05);
      vz = (b.z - a.z) / Math.max(.01, (h.length-1)*.05);
    }
    return { x: DUMMY.pos.x + vx*.9, z: DUMMY.pos.z + vz*.9, r:R(3.0) };
  },
    hit: function(){ const m = this.mk(); return { shape:'circle', x:m.x, z:m.z, r:m.r }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 这一只自己维护历史，因为 mk() 要在施放前就能读到 */
    let t = 0, last = -1;
    const m = S.mk();
    const zone = flatMesh(TEX.ring, 0xb48cff, THREE.AdditiveBlending, .85);
    zone.rotation.x = -Math.PI/2; zone.position.set(m.x, .09, m.z);
    zone.scale.setScalar(m.r*2.4); zone.renderOrder = 6;
    scene.add(zone);
    BFX.decal({ x:m.x, z:m.z, tex:'rune', r:m.r*1.05, life:1.4, color:0xb48cff, a0:.5 });
    addUpdate({ update(dt){
      t += dt;
      if(t - last > .05){ last = t; S_HIST.push({ x:DUMMY.pos.x, z:DUMMY.pos.z });
        if(S_HIST.length > 40) S_HIST.shift(); }
      zone.material.opacity = .55 + .3*Math.sin(t*11);
      if(t >= 1.2){
        BFX.spikes({ x:m.x, z:m.z, n:11, r:m.r*.9, h:2.0, color:0x3a2a4a, glow:0xb48cff, dur:1.3 });
        BFX.shock(V3(m.x, 0, m.z), m.r*2.4, { color:0xb48cff, dur:.5, thi:.6 });
        const on = Math.hypot(DUMMY.pos.x-m.x, DUMMY.pos.z-m.z) < m.r;
        /* 已损血越高越疼 */
        const lost = 1 + Math.min(1, t*.05);
        say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
          on ? '因果 ×' + (S.mul*lost).toFixed(2) : '变向了 · 落空', on ? '#c8a0ff' : '#8fd05a');
        if(on) hurtVignette();
        disposeMesh(zone);
        this.dead = true;
      }
    }});
    /* 演示：在落点压下去之前突然变向 */
    const A = aimAngle() + Math.PI;
    delay(.15, ()=>{
      let k = 0;
      const up = addUpdate({ update(dt){
        k += dt;
        if(k < .6){ DUMMY.pos.x += Math.sin(A)*dt*4.2; DUMMY.pos.z += Math.cos(A)*dt*4.2; }
        else if(k < .75){ DUMMY.pos.x += Math.sin(A+1.7)*dt*7.0; DUMMY.pos.z += Math.cos(A+1.7)*dt*7.0; }
        else this.dead = true;
        if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
      }});
      void up;
    });
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '它压在你前面 · 变向', '#b48cff'));
  }
  },
  bafo_deva: {
    n: '雷鼓',
    tag: '四拍，第四拍最重',
    warm: 1,
    mul: 0.3,
    rule: '雷鼓四拍：**前三拍轻，第四拍翻倍** —— 数着拍子，只在第四拍走位',
    kind: '节奏（四拍，落点跟着鼓点变）',
    dmg: 'multi · 四拍递增，第四拍翻倍',
    answer: '数拍子，第四拍才走',
    hit: function(){ return { shape:'self', note:'四拍节奏（第 4 拍最重）' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const drum = BFX.pool({ x:P.x, z:P.z, r:R(4.2), life:6.4, color:0xffd24a, opacity:.16, tick:9 });
    for(let i=0;i<4;i++){
      delay(i*.85, ()=>{
        const heavy = i === 3;
        /* 前三拍落在它周围，第四拍落在**你脚下** */
        const a = Math.PI*2*i/3 + .4, d = R(6.4);
        const x = heavy ? DUMMY.pos.x : P.x + Math.sin(a)*d;
        const z = heavy ? DUMMY.pos.z : P.z + Math.cos(a)*d;
        const rr = heavy ? R(3.4) : R(2.2);
        BFX.zone({ shape:'circle', x, z, r:rr, dur:.5, color: heavy ? 0xff6a3a : 0xffd24a });
        delay(.5, ()=>{
          BFX.column({ x, z, r:rr*.55, h:heavy ? 5.2 : 2.6, life:.7,
            color: heavy ? 0xff6a3a : 0xffd24a });
          BFX.shock(V3(x, 0, z), rr*2.2, { color: heavy ? 0xff8a5a : 0xffe0a0,
            dur:.35, thi: heavy ? .7 : .35 });
          shake(heavy ? 1.2 : .35, .2);
          if(Math.hypot(DUMMY.pos.x-x, DUMMY.pos.z-z) < rr)
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z),
              (heavy ? '第四拍 ×' : '第 ' + (i+1) + ' 拍 ×') +
              (heavy ? S.mul*2 : S.mul*.6).toFixed(2), heavy ? '#ff7a5a' : '#ffd24a');
          if(heavy) hurtVignette();
        });
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '四拍 · 第四拍才走', '#ffd24a'));
    /* 演示：前三拍站着，第四拍才侧闪 */
    delay(2.6, ()=>{
      const A = aimAngle() + Math.PI*.5;
      moveDummy(V3(DUMMY.pos.x + Math.sin(A)*4.4, 0, DUMMY.pos.z + Math.cos(A)*4.4), .35);
    });
    delay(6.3, ()=>{ if(drum) void 0; });
  }
  },
  bafo_naga: {
    n: '毒海',
    tag: '从中心漫出来',
    warm: 1,
    mul: 0.22,
    rule: '毒从中心**一直往外漫**，站在里面每秒叠一层 —— 退到还没被淹的那一圈',
    kind: '不断扩张的毒面（pool）',
    dmg: 'dot · 叠层，站得越久越疼',
    answer: '退到还没被淹的那一圈',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(9.5) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const sea = BFX.pool({ x:P.x, z:P.z, r:R(1.2), life:9, color:0x6ac04a, opacity:.5, tick:.5,
      grow(k){ return R(1.2) + k * R(13); },
      onTick(st){
        const d = Math.hypot(DUMMY.pos.x-st.x, DUMMY.pos.z-st.z);
        if(d < st.r) say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '泡在毒里 ×' + S.mul, '#8ae060');
        else say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '外面还没淹到', '#8fd05a');
      } });
    /* 毒面上冒泡：让它读起来是"液体"，不是一块绿色的圆 */
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt; acc += dt;
      if(acc > .09){ acc = 0;
        const a = Math.random()*6.283, rr = Math.random()*sea.r;
        BFX.burst(V3(P.x + Math.sin(a)*rr, .3, P.z + Math.cos(a)*rr), 1,
          { tex:'smoke', sp:.5, s0:.5, a0:.35, color:0x7ad04a, grav:-.8 });
      }
      if(t > 9){ this.dead = true; }
    }});
    /* 演示：一路往外退 */
    const A = aimAngle();
    for(let k=0;k<4;k++){
      delay(.9 + k*1.0, ()=>{
        const d = 4.4 + k*2.2;
        moveDummy(V3(P.x + Math.sin(A)*d, 0, P.z + Math.cos(A)*d), .45);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '毒在漫 · 往外退', '#8ae060'));
  }
  },
  bafo_yaksa: {
    n: '疾冲',
    tag: '它自己撞过来',
    warm: 1,
    mul: 1,
    rule: '它顿一下，然后**整只撞过来** —— 撞在线上是满伤，垂直侧闪就只擦到',
    kind: 'Boss 本体冲撞（带冲锋线）',
    dmg: 'crush · 正对撞上满伤，擦边减半',
    answer: '垂直于冲锋线侧闪',
    hit: function(){ return { shape:'line', x:BOSS.pos.x, z:BOSS.pos.z,
    angle:this._a != null ? this._a : aimAngle(), w:R(3.0), len:R(22) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    let A = aimAngle();
    S._a = A;
    /* 冲锋线：先画出来，让玩家有时间横过来 */
    BFX.zone({ shape:'line', x:P.x, z:P.z, angle:A, w:R(3.0), len:R(22), dur:1.0, color:0xff5a3a });
    floatText(V3(P.x, 3.2, P.z), '它要冲了 · 横过来', '#ff7a4a');
    let t = 0, fired = false;
    addUpdate({ update(dt){
      t += dt;
      if(!fired && t > 1.0){
        fired = true;
        /* 本体沿 A 冲出去 16 米 */
        const from = BOSS.pos.clone();
        let k = 0;
        addUpdate({ update(dt2){
          k += dt2;
          const u = Math.min(1, k / .55);
          BOSS.pos.set(from.x + Math.sin(A)*R(16)*u, 0, from.z + Math.cos(A)*R(16)*u);
          if(BOSS.g) BOSS.g.position.copy(BOSS.pos);
          if(Math.random() < .7)
            BFX.burst(V3(BOSS.pos.x, .4, BOSS.pos.z), 2,
              { tex:'smoke', sp:1.4, s0:.7, a0:.5, color:0xd8a070, grav:-.4 });
          if(u >= 1){
            shake(1.6, .35);
            /* 侧向偏移：垂直于冲锋线的距离 */
            const dx = DUMMY.pos.x - from.x, dz = DUMMY.pos.z - from.z;
            const fwd = dx*Math.sin(A) + dz*Math.cos(A);
            const perp = Math.abs(dx*Math.cos(A) - dz*Math.sin(A));
            if(fwd > 0 && fwd < R(16)){
              const k2 = Math.max(0, 1 - perp / R(3.0));
              say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
                '被撞 ×' + (S.mul*(0.4 + k2*.6)).toFixed(2), k2 > .5 ? '#ff5a3a' : '#ffb04a');
              if(k2 > .5) hurtVignette();
            }else{
              say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '它冲空了', '#8fd05a');
            }
            this.dead = true;
          }
        }});
      }
      if(t > 3.4){ this.dead = true; }
    }});
    /* 演示：垂直于冲锋线侧闪 */
    delay(.8, ()=>{
      const px = DUMMY.pos.x + Math.cos(A)*4.6, pz = DUMMY.pos.z - Math.sin(A)*4.6;
      moveDummy(V3(px, 0, pz), .35);
    });
  }
  },
  bafo_gandharva: {
    n: '弦歌',
    tag: '三圈波同时扩',
    warm: 1,
    mul: 0.35,
    rule: '三圈音波**同时往外扩**，中间有两条缝 —— 缝会变宽变窄，卡住时机',
    kind: '扩散的环 ×3（wave）',
    dmg: 'burst · 被任一圈扫到',
    answer: '卡在两道波之间',
    hit: function(){ return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(11), r0:R(2) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const rings = [];
    for(let i=0;i<3;i++){
      const m = flatMesh(TEX.ring, 0x8fe0d0, THREE.AdditiveBlending, .8);
      m.rotation.x = -Math.PI/2; m.position.set(P.x, .14, P.z);
      m.scale.setScalar(.4); m.renderOrder = 5;
      rings.push({ m, t:-i*.28, hit:false });
    }
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 7.6){ rings.forEach(r=>disposeMesh(r.m)); this.dead = true; return; }
      rings.forEach(r=>{
        r.t += dt;
        if(r.t < 0){ r.m.scale.setScalar(.4); r.m.material.opacity = 0; return; }
        const u = r.t / 2.4;
        if(u > 1){ r.m.material.opacity = 0; return; }
        const rad = R(.8) + u * R(11);
        r.m.scale.setScalar(rad * 2);
        r.m.material.opacity = .85 * (1 - u * .65);
        r.rr = rad;
      });
      acc += dt;
      if(acc > .2){
        acc = 0;
        const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        rings.forEach(r=>{
          if(r.rr && Math.abs(d - r.rr) < .75){
            say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被音波扫 ×' + S.mul, '#8fe0d0');
            hurtVignette();
          }
        });
      }
    }});
    /* 演示：站在两道波中间那段 —— 波从里往外推，中间那段一直在变 */
    delay(.4, ()=>moveDummy(V3(P.x + Math.sin(aimAngle())*R(2.6), 0, P.z + Math.cos(aimAngle())*R(2.6)), .5));
    delay(1.3, ()=>moveDummy(V3(P.x + Math.sin(aimAngle())*R(6.2), 0, P.z + Math.cos(aimAngle())*R(6.2)), .45));
    delay(2.4, ()=>moveDummy(V3(P.x + Math.sin(aimAngle())*R(9.6), 0, P.z + Math.cos(aimAngle())*R(9.6)), .45));
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '三圈波 · 卡在两道之间', '#8fe0d0'));
  }
  },
  bafo_asura: {
    n: '三面',
    tag: '每次只有一个头睁眼',
    warm: 1,
    mul: 0.4,
    rule: '三个头轮流睁眼，**只有睁眼那一面会打** —— 换到闭着眼的那一面',
    kind: '三个方向的扇面（轮流睁眼）',
    dmg: 'multi · 睁眼的那一面满伤',
    answer: '换到闭眼那一面',
    hit: function(){ return { shape:'self', note:'三个扇面轮流亮（一次只亮一面）' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const fans = [0,1,2].map(i=>{
      const m = new THREE.Mesh(new THREE.RingGeometry(.06, R(10), 30, 1,
        -Math.PI/2 - Math.PI*.28, Math.PI*.56),
        new THREE.MeshBasicMaterial({ color:0xff6a4a, transparent:true, opacity:0,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2; m.rotation.z = Math.PI*2*i/3;
      m.position.set(P.x, .1, P.z); m.renderOrder = 4;
      scene.add(m);
      return { i, m };
    });
    /* 三个"头"。第一版只有地上的三块扇形，读得出"哪边危险"，读不出
     * "这三个方向是从哪来的" —— 上一轮验收的原话是"像三簇火星"。
     * 所以把三个头画成 Boss 身周 120° 上的三颗眼：睁眼的那一颗亮起来，
     * 扇面同时亮。玩家看的不再是"地上三块扇形"，而是"哪一个头在盯着我"。 */
    const eyes = [0,1,2].map(i=>{
      const m = billMesh(TEX.soft, 0xffc0a0, 0);
      m.scale.setScalar(1.25);
      return { i, m };
    });
    /* 扇面本身是**实心饼**，太像 UI 图表。危险区该有的读法是"亮边 + 淡填充"，
     * 所以再给每一面加一道外沿弧：睁眼时沿也亮，闭眼时和填充一起灭。 */
    const rims = fans.map(f=>{
      const m = new THREE.Mesh(new THREE.RingGeometry(R(9.6), R(10), 30, 1,
        -Math.PI/2 - Math.PI*.28, Math.PI*.56),
        new THREE.MeshBasicMaterial({ color:0xffb090, transparent:true, opacity:0,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2; m.rotation.z = Math.PI*2*f.i/3;
      m.position.set(P.x, .12, P.z); m.renderOrder = 5;
      scene.add(m);
      return { i: f.i, m };
    });
    let t = 0, acc = 0, cur = -1;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.2){
        fans.forEach(f=>disposeMesh(f.m));
        rims.forEach(r=>disposeMesh(r.m));
        eyes.forEach(e=>disposeMesh(e.m));
        this.dead = true; return;
      }
      const open = Math.floor(t / 1.2) % 3;
      if(open !== cur){ cur = open;
        fans.forEach(f=>{ f.m.material.opacity = f.i === open ? .13 : .0; });
      rims.forEach(r=>{ r.m.material.opacity = r.i === open ? .85 : .0; });
        BFX.burst(V3(P.x + Math.sin(Math.PI*2*open/3)*3.6, 2.2,
          P.z + Math.cos(Math.PI*2*open/3)*3.6), 8,
          { tex:'ember', sp:1.4, s0:.5, a0:.8, color:0xff6a4a, grav:-.6 });
      }
      fans.forEach(f=>{ if(f.i === open) f.m.material.opacity = .11 + .05*Math.sin(t*8); });
      rims.forEach(r=>{ if(r.i === open) r.m.material.opacity = .7 + .25*Math.sin(t*8); });
      /* 眼的位置就在它自己那个扇面的中轴上，离 Boss 1.6 米、高 2.6 米 */
      eyes.forEach(e=>{
        const a = Math.PI*2*e.i/3;
        /* 放在身外 3 米、高 3.4 米：贴太近会被模型本身吃掉（第一版摆在胸口，
         * 读作"它身上长了个球"）。三颗眼睛要像**浮在它周围的三个头**。 */
        e.m.position.set(P.x + Math.sin(a)*R(3.0), 3.4, P.z + Math.cos(a)*R(3.0));
        const lit = e.i === open;
        e.m.material.opacity = lit ? .85 + .15*Math.sin(t*9) : .08;
        e.m.scale.setScalar(lit ? 1.9 : 1.0);
      });
      acc += dt;
      if(acc > .45){
        acc = 0;
        const pa = Math.atan2(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
        const oa = Math.PI*2*open/3;
        let diff = Math.abs(((pa - oa + Math.PI*3) % (Math.PI*2)) - Math.PI);
        if(d < R(10) && diff < Math.PI*.28){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '睁眼那一面 ×' + S.mul, '#ff7a5a');
          hurtVignette();
        }
      }
    }});
    /* 演示：眼睛一睁就换到对面 */
    for(let k=0;k<6;k++){
      delay(.6 + k*1.2, ()=>{
        const open = Math.floor((.6 + k*1.2) / 1.2) % 3;
        const safe = Math.PI*2*((open + 1) % 3)/3;
        moveDummy(V3(P.x + Math.sin(safe)*R(6.2), 0, P.z + Math.cos(safe)*R(6.2)), .5);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.6, P.z), '三个头轮流睁眼 · 站背面', '#ff7a5a'));
  }
  },
  bafo_garuda: {
    n: '金翅',
    tag: '贴上去才活',
    warm: 1,
    mul: 1.4,
    rule: '金翅一振，**外圈整片炸开，中心是空的** —— 跑得越远越死，贴上去才活',
    kind: '环状冲击（中心留空）',
    dmg: 'true · 圈内全免，圈外穿盾',
    answer: '贴身站住',
    hit: function(){ return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(12), r0:R(3.2) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    BFX.zone({ shape:'ring', x:P.x, z:P.z, r:R(12), r0:R(3.2), dur:1.0, color:0xffd24a });
    /* 翅膀：两片巨大的半透明扇，往外扇 */
    const wings = [0,1].map(i=>{
      const m = new THREE.Mesh(new THREE.RingGeometry(R(1.6), R(11.5), 30, 1,
        -Math.PI/2 - Math.PI*.42, Math.PI*.84),
        new THREE.MeshBasicMaterial({ color:0xffe0a0, transparent:true, opacity:.0,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2; m.rotation.z = i * Math.PI;
      m.position.set(P.x, .12, P.z); m.renderOrder = 6;
      scene.add(m); return m;
    });
    delay(1.0, ()=>{
      wings.forEach(w=>{ w.material.opacity = .55; });
      shake(1.6, .4);
      BFX.shock(V3(P.x, 0, P.z), R(12), { color:0xffe0a0, dur:.6, thi:1.2 });
      const d = Math.hypot(DUMMY.pos.x-P.x, DUMMY.pos.z-P.z);
      const inside = d <= R(3.2);
      say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z),
        inside ? '贴在怀里 · 没事' : '被金翅扫中 ×' + S.mul, inside ? '#8fd05a' : '#ffd24a');
      if(!inside) hurtVignette();
      /* 演示：往前贴 —— 和所有"跑远点"的招相反 */
      moveDummy(V3(P.x + Math.sin(aimAngle())*R(2.2), 0, P.z + Math.cos(aimAngle())*R(2.2)), .5);
      delay(.8, ()=>wings.forEach(w=>{ w.material.opacity = 0; }));
    });
    delay(2.4, ()=>wings.forEach(w=>disposeMesh(w)));
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '外圈全炸 · 贴上去', '#ffd24a'));
  }
  },
  bafo_kimnara: {
    n: '鹿群',
    tag: '一群鹿四散跑',
    warm: 1,
    mul: 0.6,
    rule: '鹿群从中间**四散跑开** —— 它们跑的方向是随机的，但起步前会先低头',
    kind: '四散的鹿群（实体 ×10）',
    dmg: 'burst · 撞到一只算一只',
    answer: '别站在它们要跑的方向上',
    hit: function(){ return { shape:'self', note:'鹿群四散奔逃' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const herd = [];
    const N = 10;
    for(let i=0;i<N;i++){
      const a = Math.PI*2*i/N + .3, d = R(2.6);
      herd.push({ a, x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d });
    }
    /* 先低头（预警 0.8 秒）：每只鹿脚下亮点 */
    herd.forEach(h=>{
      const m = flatMesh(TEX.soft, 0xe0c090, THREE.AdditiveBlending, .5);
      m.rotation.x = -Math.PI/2; m.position.set(h.x, .06, h.z); m.scale.setScalar(1.6);
      h.pre = m;
    });
    delay(.9, ()=>{
      herd.forEach(h=>{ disposeMesh(h.pre); });
      /* 跑：每只从中心朝外冲，速度略不同 */
      herd.forEach((h, i)=>{
        const e = BFX.entity({ x:h.x, z:h.z, tex:TEX.ember, color:0xe0c090, size:.85,
          speed:R(7.5 + (i%3)), life:2.4, hitEvery:.6, opacity:.9,
          target: ()=>V3(P.x + Math.sin(h.a)*R(16), 0, P.z + Math.cos(h.a)*R(16)),
          onFrame(e2){
            if(Math.random() < .25)
              BFX.burst(V3(e2.x, .2, e2.z), 1, { tex:'smoke', sp:.4, s0:.4, a0:.3,
                color:0xb0a080, grav:-.2 });
          },
          onTouch(){ say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被鹿撞 ×' + S.mul, '#e0c090');
            hurtVignette(); } });
        h.e = e;
      });
    });
    /* 演示：站到两条鹿之间的空档（不是正中间 —— 中间是被踩的地方） */
    delay(.5, ()=>{
      const a = Math.PI*2*.5/N + .3 + (Math.PI/N);
      moveDummy(V3(P.x + Math.sin(a)*R(5.2), 0, P.z + Math.cos(a)*R(5.2)), .7);
    });
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '鹿会四散跑 · 站空档', '#e0c090'));
  }
  },
  bafo_mahoraga: {
    n: '毒牙',
    tag: '两排牙合拢',
    warm: 1,
    mul: 0.5,
    rule: '上下两排毒牙从两侧**合拢**，中间只剩一条缝 —— 缝在横移，而且越来越窄',
    kind: '两排合拢的牙（wall 对咬）',
    dmg: 'pct · 咬住按当前生命 % 掉',
    answer: '挤进那条缝',
    hit: function(){ return { shape:'self', note:'两排牙自两侧合拢' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const A = aimAngle() + Math.PI*.5;      /* 牙排的方向（横向） */
    const lx = Math.cos(A), lz = -Math.sin(A);
    /* 上下两排牙：用 BFX.wall 从两侧对推，缺口分别在上/下 */
    const up = BFX.wall({ x:P.x, z:P.z, angle:A, off:-R(4.2), len:R(20), th:R(2.2),
      from:R(9), to:-R(9), speed:R(2.6), color:0xc07a8a, tex:TEX.smoke, life:8 });
    const dn = BFX.wall({ x:P.x, z:P.z, angle:A, off:R(4.2), len:R(20), th:R(2.2),
      from:-R(9), to:R(9), speed:R(2.6), color:0xc07a8a, tex:TEX.smoke, life:8 });
    let t = 0, acc = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.4){ this.dead = true; return; }
      const wu = up.pos, wd = dn.pos;
      acc += dt;
      if(acc > .45){
        acc = 0;
        /* 缝：上下两排之间的那条带子，横移 */
        const mid = (Math.sin(A)*0 + 0);
        void mid;
        const gapC = Math.sin(t * 1.6) * R(4.4);
        const dx = DUMMY.pos.x - P.x, dz = DUMMY.pos.z - P.z;
        const side = dx*lx + dz*lz;
        const along = dx*Math.sin(A) + dz*Math.cos(A);
        const inGap = Math.abs(side - gapC) < R(1.9);
        if(!inGap && Math.abs(along) < R(9)){
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被牙咬住 · 当前生命 %', '#e09aaa');
          hurtVignette();
        }
        void wu; void wd;
      }
    }});
    /* 演示：追着那条缝横移 */
    for(let k=0;k<5;k++){
      delay(.7 + k*.9, ()=>{
        const tt = .7 + k*.9;
        const gapC = Math.sin(tt * 1.6) * R(4.4);
        moveDummy(V3(P.x + lx*gapC, 0, P.z + lz*gapC), .5);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '两排牙合拢 · 钻进缝里', '#e09aaa'));
  }
  },
  dgb_tomb: {
    n: '骨浪',
    tag: '骨手一波波爬进来',
    warm: 1,
    mul: 0.2,
    rule: '骨手从**场边一波波往里爬**，一波比一波深 —— 得往中间退',
    kind: '爬行的骨手（实体 ×N，一波波）',
    dmg: 'dot · 被抓住持续掉',
    answer: '往中间收',
    hit: function(){ return { shape:'self', note:'骨手一波波从边缘爬入' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    for(let w=0; w<3; w++){
      delay(w*.9, ()=>{
        const NN = 12;
        for(let i=0;i<NN;i++){
          const a = Math.PI*2*i/NN + w*.3;
          const from = R(11 - w*2.6);
          const to = R(7.4 - w*2.6);
          delay(i*.03, ()=>{
            BFX.entity({ x:P.x + Math.sin(a)*from, z:P.z + Math.cos(a)*from,
              tex:TEX.smoke, color:0xa8a08a, size:.9, speed:R(2.6), life:3.0, hitEvery:.7,
              opacity:.9,
              target: ()=>V3(P.x + Math.sin(a)*to, 0, P.z + Math.cos(a)*to),
              onFrame(e){
                if(Math.random() < .12)
                  BFX.burst(V3(e.x, .15, e.z), 1, { tex:'rock', sp:.4, s0:.3, a0:.4,
                    color:0x8a8578, grav:-.6 });
              },
              onTouch(){ say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被抓住 ×' + S.mul, '#c8c0a8');
                hurtVignette(); } });
          });
        }
      });
    }
    /* 演示：一波一波往里退 */
    for(let k=0;k<3;k++){
      delay(1.3 + k*.9, ()=>{
        const d = R(6.6 - k*2.2);
        const a = aimAngle();
        moveDummy(V3(P.x + Math.sin(a)*Math.max(1.4, d), 0, P.z + Math.cos(a)*Math.max(1.4, d)), .5);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '骨手一波波往里 · 退中间', '#c8c0a8'));
  }
  },
  dgb_well: {
    n: '塌方',
    tag: '只有影子没有圈',
    warm: 1.2,
    mul: 1,
    rule: '头顶落石**只在地上投一个影子**，影子越大越近 —— 没有红圈可躲',
    kind: '头顶落石（只在地上有影）',
    dmg: 'burst · 砸中即满伤',
    answer: '看影子有多大',
    hit: function(){ return { shape:'scatter', pts:(()=>{
    const P = BOSS.pos, out = [];
    for(let i=0;i<5;i++){
      const a = Math.PI*2*i/5 + .4, d = R(4 + (i%3)*4.6);
      out.push({ x:P.x + Math.sin(a)*d, z:P.z + Math.cos(a)*d, r:R(2.3) });
    }
    return out; })() }; },
    run: function(){
    const S = this;
    const say = nSay();
    const pts = S.hit().pts;
    pts.forEach((p, i)=>{
      delay(i*.2, ()=>{
        /* 影子：从一个小点长到 r —— 这就是全部的预警 */
        const sh = flatMesh(TEX.soft, 0x000000, THREE.NormalBlending, .6);
        sh.rotation.x = -Math.PI/2; sh.position.set(p.x, .07, p.z);
        sh.renderOrder = 7;
        let t = 0;
        addUpdate({ update(dt){
          t += dt;
          const k = Math.min(1, t/1.2);
          sh.scale.setScalar(p.r * 2.2 * k);
          sh.material.opacity = .62 * k;
          if(k >= 1){ disposeMesh(sh); this.dead = true; }
        }});
        delay(1.2, ()=>{
          BFX.burst(V3(p.x, 3.4, p.z), 14, { tex:'rock', sp:1.4, s0:.85, a0:.9,
            color:0x5a5448, grav:-9 });
          delay(.12, ()=>{
            BFX.spikes({ x:p.x, z:p.z, n:6, r:p.r*.85, h:1.9, color:0x4a4238,
              glow:0xb8a890, dur:1.4 });
            BFX.shock(V3(p.x, 0, p.z), p.r*1.9, { color:0xb8a890, dur:.35 });
            shake(.9, .2);
            if(Math.hypot(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z) < p.r){
              say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '砸中 ×' + S.mul, '#e8c890');
              hurtVignette();
            }
          });
        });
      });
    });
    /* 演示：影子小的时候不动，最大的那一块才是真落点 */
    delay(.4, ()=>{
      const big = pts.slice().sort((a,b)=>b.r-a.r)[0];
      moveDummy(V3(big.x + big.r*2.4, 0, big.z), .8);
    });
    delay(.3, ()=>floatText(V3(BOSS.pos.x, 3.4, BOSS.pos.z), '没有圈 · 看影子', '#e8c890'));
  }
  },
  dgb_den: {
    n: '兽群',
    tag: '一圈狼，只有一个缺口',
    warm: 1,
    mul: 0.9,
    rule: '狼群围成一整圈同时冲进来，**只有一个方向是空的** —— 冲出去，不是往里躲',
    kind: '一整圈实体（有缺口）',
    dmg: 'burst · 撞到几只算几只',
    answer: '从缺口冲出去',
    mk: function(){ return { gap: Math.floor(Math.random()*8) }; },
    hit: function(){ const m = this.mk();
    return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(11.4), r0:R(2.6) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const NN = 8, gap = S.mk().gap;
    const wolves = [];
    for(let i=0;i<NN;i++){
      if(i === gap) continue;
      const a = Math.PI*2*i/NN;
      const e = BFX.entity({ x:P.x + Math.sin(a)*R(10.5), z:P.z + Math.cos(a)*R(10.5),
        tex:TEX.smoke, color:0xd8a070, size:1.3, speed:R(5.6), life:2.6, hitEvery:.8,
        target: ()=>V3(P.x + Math.sin(a)*R(2.4), 0, P.z + Math.cos(a)*R(2.4)),
        onTouch(){ say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '被狼扑 ×' + S.mul, '#ffb070');
          hurtVignette(); } });
      wolves.push(e);
    }
    /* 缺口处放一点光：让"唯一的路"看得出来 */
    const goA = Math.PI*2*gap/NN;
    const go = flatMesh(TEX.soft, 0x8fd05a, THREE.AdditiveBlending, .45);
    go.rotation.x = -Math.PI/2;
    go.position.set(P.x + Math.sin(goA)*R(9), .06, P.z + Math.cos(goA)*R(9));
    go.scale.setScalar(4.2); go.renderOrder = 2;
    addUpdate({ t:0, update(dt){ this.t += dt; go.material.opacity = .35 + .2*Math.sin(this.t*6);
      if(this.t > 3.4){ disposeMesh(go); this.dead = true; } }});
    /* 演示：往缺口冲出去 */
    delay(.35, ()=>moveDummy(V3(P.x + Math.sin(goA)*R(12.4), 0, P.z + Math.cos(goA)*R(12.4)), .9));
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '一圈狼 · 那个亮的方向是空的', '#ffb070'));
    void wolves;
  }
  },
  dgb_gaol: {
    n: '没顶',
    tag: '台子一块块沉下去',
    warm: 1,
    mul: 0.3,
    rule: '水从地面升起，**只有高台还在水面以上** —— 而高台会被淹，得换',
    kind: '上涨的水面（pool）+ 三块高台',
    dmg: 'dot · 泡在水里持续掉',
    answer: '站高台，淹了就换',
    hit: function(){ return { shape:'self', note:'水位持续上涨' }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    const plats = [], trash = [];
    const HPLAT = 1.5;
    const stMat = new THREE.MeshStandardMaterial({ color:0x6d6250, roughness:.95,
      metalness:.02, flatShading:true });
    for(let i=0;i<3;i++){
      const a = Math.PI*2*i/3 + .6, d = R(9);
      const px = P.x + Math.sin(a)*d, pz = P.z + Math.cos(a)*d, pr = R(2.5);
      /* 每块台子的**淹没时刻**不同：这才是"得换"的来源 */
      const drown = 3.4 + i * 1.3;
      const g = new THREE.CylinderGeometry(pr, pr*1.14, HPLAT, 14);
      const m = new THREE.Mesh(g, stMat);
      m.position.set(px, HPLAT/2, pz); scene.add(m);
      const rim = flatMesh(TEX.ring, 0x9ad8ff, THREE.AdditiveBlending, .5);
      rim.rotation.x = -Math.PI/2; rim.position.set(px, HPLAT+.06, pz);
      rim.scale.setScalar(pr*2.05); rim.renderOrder = 3;
      trash.push(g, m, rim);
      plats.push({ x:px, z:pz, r:pr*.95, drown, rim, top: HPLAT });
    }
    const water = BFX.pool({ x:P.x, z:P.z, r:R(13), life:8, color:0x2a5f8a, opacity:.5, tick:.6,
      rise:.0,
      onTick(st){
        const wet = st.yh != null ? st.yh : 0;
        const onPlat = plats.some(p=> Math.hypot(DUMMY.pos.x-p.x, DUMMY.pos.z-p.z) < p.r
          && wet < p.top - .25);
        if(wet > .55 && !onPlat)
          say(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), '泡在水里 ×' + S.mul, '#6ad0ff');
      } });
    let t = 0;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.2){
        water.dead = true;
        /* 三块高台是手搓的 mesh + 一个共享材质。不收就永远立在那儿 ——
         * 实测这一招放完场上残留 6 个对象（3 台 + 3 圈边光）。 */
        trash.forEach(o=>{
          if(!o) return;
          if(o.isObject3D) disposeMesh(o);
          else if(o.dispose) o.dispose();
        });
        stMat.dispose();
        this.dead = true; return;
      }
      const h = Math.min(1.5, t * .34);
      water.yh = h;
      /* 水面升到台顶就把台子吞掉 —— 视觉上把 rim 压到水面下 */
      plats.forEach(p=>{
        const drowned = h > p.top - .2;
        p.rim.material.opacity = drowned ? .12 : .5;
      });
    }});
    /* 演示：先站第一块，快淹了就换第二块 */
    delay(.4, ()=>{
      const p = plats[0];
      moveDummy(V3(p.x, 0, p.z), .6);
    });
    delay(3.2, ()=>{
      const p = plats[1];
      moveDummy(V3(p.x, 0, p.z), .5);
      floatText(V3(p.x, 2.6, p.z), '这块也要淹了', '#9ad8ff');
    });
    delay(.3, ()=>floatText(V3(P.x, 3.2, P.z), '水在涨 · 站高台，淹了就换', '#6ad0ff'));
  }
  },
  dgb_fall: {
    n: '游龙',
    tag: '龙卷绕着场转',
    warm: 1,
    mul: 0.65,
    rule: '龙卷绕着场转，**转速还是变的** —— 躲的是它下一秒的位置，不是现在这一格',
    kind: '绕场移动的龙卷（实体危险物）',
    dmg: 'crush · 卷进去持续疼',
    answer: '预判它下一秒在哪',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(3.6) }; },
    run: function(){
    const S = this;
    const say = nSay(), P = BOSS.pos.clone();
    /* 漏斗用**旋转的弧带**画，不用一摞完整的环。
     *
     * 上一版是 8 层 flat ring 叠上去、半径往上收。它每帧都在动，但读不出"在转" ——
     * **完整的环是中心对称的，转它看不出来**；45° 俯视下八层还正好叠成一坨同心椭圆，
     * 只有左右两条边亮，中间糊成一片。
     * 试过第二条路：三条螺旋 trail。位置是对的，但螺旋的高度是循环的，
     * **回卷那一下会拉出一条横跨整个漏斗的斜线**，看上去像几根飘带打结。
     * 最后落在最朴素的一条：**把环切成弧**。弧不是中心对称的，一旋就看得见；
     * 四层弧各自半径收、转速不同、有两层反向 —— 圆锥的形和"在转"同时成立。
     */
    const BASE = R(2.6), TOP = 5.0;
    const base = flatMesh(TEX.ring, 0x9ff0d0, THREE.AdditiveBlending, .55);
    base.rotation.x = -Math.PI/2; base.renderOrder = 3;
    const layers = [0,1,2,3].map(i=>{
      const u = i/3;
      const rad = BASE * (1 - u*.62);
      /* 弧长固定 100°，但半径越小同样的角度越短 —— 所以细的那几层不加粗，
       * 只把透明度提上去，否则上面几层在 45° 俯视里直接消失。 */
      const g = new THREE.RingGeometry(rad*.70, rad, 22, 1, 0, 1.75);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x7fd8b8 : 0xd8ffe8, transparent: true, opacity: .55,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI/2;
      m.position.set(P.x, .25 + u*(TOP - .4), P.z);
      m.renderOrder = 5;
      scene.add(m);
      return { u, rad, m, dir: i % 2 ? -1 : 1, spd: 4.6 + i*1.5 };
    });
    let t = 0, acc = 0, cx = P.x, cz = P.z;
    addUpdate({ update(dt){
      t += dt;
      if(t > 8.2){
        layers.forEach(L=>disposeMesh(L.m));
        disposeMesh(base);
        this.dead = true; return;
      }
      /* 角速度在变：不能靠"匀速推"预判 */
      const spd = .55 + .3*Math.sin(t*1.15);
      const a = t * spd;
      const d = R(5.4 + Math.sin(t*.85)*1.7);
      cx = P.x + Math.sin(a)*d; cz = P.z + Math.cos(a)*d;
      /* 四层弧各转各的：两层反向，转速跟"角速度在变"同一个源，
       * 所以它慢下来的时候，四层一起慢 —— 玩家看到的节奏和判定是同一个。 */
      layers.forEach(L=>{
        L.m.position.set(cx, .25 + L.u*(TOP - .4), cz);
        L.m.rotation.z = t * L.spd * L.dir * (spd / .55);
        L.m.material.opacity = .38 + .22*(1 - L.u) + .08*Math.sin(t*7 + L.u*3);
      });
      base.position.set(cx, .08, cz);
      base.scale.setScalar(BASE*2.05 + Math.sin(t*6)*.16);
      base.material.opacity = .34 + .12*Math.sin(t*6);
      if(Math.random() < .5)
        BFX.burst(V3(cx + (Math.random()-.5)*4, .3, cz + (Math.random()-.5)*4), 2,
          { tex:'smoke', sp:2.2, s0:.6, a0:.45, color:0x9ff0d0, grav:-1.6 });
      acc += dt;
      if(acc > .4){
        acc = 0;
        if(Math.hypot(DUMMY.pos.x-cx, DUMMY.pos.z-cz) < R(3.4))
          say(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '卷进去 ×' + S.mul, '#b0d8c0');
      }
    }});
    /* 演示：站在它"下一格"的反方向 —— 也就是跟着它转，但慢半拍 */
    for(let k=0;k<6;k++){
      delay(.7 + k*.8, ()=>{
        const tt = .7 + k*.8 + 1.1;            /* 提前 1.1 秒占位 */
        const spd = .55 + .3*Math.sin(tt*1.15);
        const a = tt * spd;
        const d = R(5.4 + Math.sin(tt*.85)*1.7);
        /* 站到龙卷的**对面**去 */
        moveDummy(V3(P.x - Math.sin(a)*d, 0, P.z - Math.cos(a)*d), .55);
      });
    }
    delay(.3, ()=>floatText(V3(P.x, 3.4, P.z), '龙卷在转 · 躲下一格', '#b0d8c0'));
  }
  },
};

/* 88 个技能。`group`：mech 机制 / shared 套路 / sign 签名 */
const BOSS_SKILLS = {
  sporecloud: {
    id: 'sporecloud', group: 'mech',
    name: '孢子云',
    warm: 0.55,
    mul: 0.5,
    tag: '持续区',
    vert: false,
    counter: '三片云同时落下，只有中间那条缝能站',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(3.0) }; },
    run: function(){
    const base = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const offs = [[-3.0, -1.4], [3.0, -1.4], [0, 3.2]];
    const col = 0x6fae4a;
    offs.forEach(([ox, oz], i)=>{
      const p = V3(base.x + ox*R(1), 0, base.z + oz*R(1));
      const r = R(3.0);
      delay(i*0.18, ()=>{
        BFX.decal({ x:p.x, z:p.z, tex:'poison', r:r*0.9, life:6.5, color:col, a0:.55 });
        BFX.zone({ shape:'circle', x:p.x, z:p.z, r, dur:.55, color:col });
        BFX.burst(V3(p.x, .2, p.z), 12, { tex:'smoke', sp:2.2, s0:.7, s1:1.4, a0:.4, grav:-.6, r:.35,g:.55,b:.3 });
        // 持续冒泡 + 每 0.9s 跳一次
        for(let t=0;t<6;t++){
          delay(0.6 + t*0.9, ()=>{
            if(Math.random() < dt2()){}
            BFX.burst(V3(p.x, .15, p.z), 3, { tex:'ember', sp:1.2, s0:.2, a0:.5, grav:-1.4, r:.45,g:.85,b:.32 });
            if(inHit({ shape:'circle', x:p.x, z:p.z, r }, DUMMY.pos.x, DUMMY.pos.z)){
              floatText(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), '中毒 ×0.5', '#8fd05a');
            }
          });
        }
      });
    });
    function dt2(){ return .5; }
  }
  },
  drainchain: {
    id: 'drainchain', group: 'mech',
    name: '噬血链',
    warm: 0.5,
    mul: 0.45,
    tag: '持续吸血',
    vert: false,
    counter: '链子连着你每秒回血，拉开 7 码或绕到它背后才断',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:2.0 }; },
    run: function(){
    const col = 0xe0483c;
    const anchor = V3(BOSS.pos.x, 2.0, BOSS.pos.z);
    const link = BFX.ribbon({ from:anchor, to:V3(DUMMY.pos.x, 1.1, DUMMY.pos.z),
      color:col, life:3.0, thick:.055, sag:.25, wobble:.1 });
    let t = 0, tick = 0, broken = false;
    addUpdate({ update(dt){
      t += dt;
      const d = aimDist();
      if(d > 7 && !broken){
        broken = true;
        BFX.burst(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), 12, { tex:'spark', sp:3, s0:.18, a0:.8, r:.9,g:.2,b:.2 });
        floatText(V3(DUMMY.pos.x, 1.5, DUMMY.pos.z), '链断', '#8fd05a');
        this.dead = true; return;
      }
      if(t > tick*0.55 + 0.55){
        tick++;
        // 血从玩家飞向 Boss
        for(let i=0;i<4;i++){
          BFX.spr(DUMMY.pos.x + (Math.random()-.5), 1.0 + Math.random()*.4, DUMMY.pos.z + (Math.random()-.5),
            { tex:'ember', vx:(BOSS.pos.x-DUMMY.pos.x)*0.7, vz:(BOSS.pos.z-DUMMY.pos.z)*0.7,
              vy:.6, life:.55, s0:.18, a0:.85, r:.9,g:.15,b:.2, drag:.4 });
        }
        BOSS.g && lightPulse(V3(BOSS.pos.x, 1.6, BOSS.pos.z), col, 1.4, .25);
      }
      if(t > 3.0){ this.dead = true; }
    }});
    BFX.burst(anchor, 10, { tex:'ember', sp:3, s0:.2, a0:.8, r:.9,g:.2,b:.2 });
  }
  },
  totem: {
    id: 'totem', group: 'mech',
    name: '战图腾',
    warm: 0.8,
    mul: 1.2,
    tag: '可破坏',
    vert: true,
    counter: '图腾给周围回血、5 秒后炸开，优先打掉它（判定圈就是爆炸范围）',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(6) }; },
    run: function(){
    const a = Math.random()*6.283, rr = 3.2;
    const p = V3(BOSS.pos.x + Math.cos(a)*rr, 0, BOSS.pos.z + Math.sin(a)*rr);
    const col = 0xffb04a;
    // 图腾实体：木桩 + 兽骨 + 顶端火盆
    const g = new THREE.Group(); g.position.copy(p); scene.add(g);
    P(g, G.cyl(0.16, 0.22, 1.5, 6), M(0x4a3418, { r:.95, flat:true }), [0, .75, 0]);
    P(g, G.sph(0.22, 7), M(0xd8cbb0, { r:.8 }), [0, 1.58, 0], [1, .9, 1]);
    P(g, G.cone(0.10, 0.5, 4), M(0xd8cbb0, { r:.8 }), [-0.2, 1.62, 0], [1,1,1], [0,0,0.7]);
    P(g, G.cone(0.10, 0.5, 4), M(0xd8cbb0, { r:.8 }), [ 0.2, 1.62, 0], [1,1,1], [0,0,-0.7]);
    BFX.column({ x:p.x, z:p.z, r:.5, h:2.6, color:col, life:5.2, up:.2, core:0xffe0b0 });
    BFX.decal({ x:p.x, z:p.z, tex:'rune', r:1.4, life:5.2, color:col, a0:.6 });
    // 每 1s：给 Boss 回血的光 + 图腾脉动
    for(let i=0;i<4;i++){
      delay(1.0 + i*1.0, ()=>{
        BFX.ribbon({ from:V3(p.x, 1.6, p.z), to:V3(BOSS.pos.x, 1.8, BOSS.pos.z),
          color:col, life:.7, thick:.035, sag:.3, wobble:.1 });
        BFX.shock(V3(p.x,0,p.z), 1.4, { color:col, dur:.4, a0:.5 });
      });
    }
    // 5 秒后爆炸（判定圈）
    const hit = { shape:'circle', x:p.x, z:p.z, r:R(6) };
    delay(5.2, ()=>{
      BFX.zone({ shape:'circle', x:p.x, z:p.z, r:hit.r, dur:.6, color:0xff5522 });
    });
    delay(5.8, ()=>{
      BFX.shock(V3(p.x,0,p.z), hit.r*1.1, { color:0xff7744, dur:.6, a0:.95 });
      BFX.wave({ x:p.x, z:p.z, r0:.5, r1:hit.r, h:2.2, color:0xffa060, dur:.45 });
      BFX.burst(V3(p.x, .4, p.z), 26, { tex:'ember', sp:8, s0:.24, a0:.9, grav:6, r:1,g:.55,b:.28 });
      BFX.decal({ x:p.x, z:p.z, tex:'scorch', r:hit.r*0.5, life:4 });
      g.children.slice().forEach(c=>{ g.remove(c); if(c.material) c.material.dispose(); });
      scene.remove(g);
      shake(.6, .3);
      settle(hit, '图腾爆 ×1.2');
    });
    // 图腾抖动
    addUpdate({ t:0, update(dt){
      this.t += dt;
      if(g.parent) g.rotation.z = Math.sin(this.t*9)*0.03;
    }});
  }
  },
  stonearmor: {
    id: 'stonearmor', group: 'mech',
    name: '岩甲朝向',
    warm: 0.7,
    mul: 1,
    tag: '绕背',
    vert: false,
    counter: '正面 120° 伤害 −80%，转身要 1.2 秒 —— 贴身绕到背后打',
    hit: function(){ return { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:R(6.8), angle:aimAngle(), span:Math.PI*0.66 }; },
    run: function(){
    const warm = WM(.7);
    const a0 = aimAngle();
    // 岩石板从身上翻起来
    const plates = [];
    for(let i=0;i<5;i++){
      const m = new THREE.Mesh(G.box(0.34, 0.44, 0.10), M(0x6f675f, { r:.95, flat:true }));
      const aa = a0 - 0.5 + i*0.25;
      m.position.set(BOSS.pos.x + Math.sin(aa)*0.85, 1.5, BOSS.pos.z + Math.cos(aa)*0.85);
      m.rotation.y = aa; m.scale.setScalar(0.2);
      scene.add(m);
      plates.push({ m, aa, t0:i*0.05 });
    }
    const hit = this.hit();
    BFX.zone({ shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:hit.r, angle:a0, span:Math.PI*0.66, dur:warm + 2.6, color:0xc8a878 });
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      const fade = this.t > warm + 2.2 ? Math.max(0, 1-(this.t-warm-2.2)/0.4) : 1;
      plates.forEach((p, i)=>{
        const kk = Math.max(0, Math.min(1, (this.t - p.t0)/0.22));
        const e = 1 - Math.pow(1-kk, 3);
        p.m.scale.setScalar(e * fade);
        p.m.position.y = 1.5 + e*0.25;
        p.m.rotation.x = -0.5*e;
      });
      if(this.t > warm + 2.7){
        plates.forEach(p=>{ scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); });
        this.dead = true;
      }
    }});
    delay(warm, ()=>{
      // 判定：在正面扇区就是"被甲挡住"
      const front = inHit(hit, DUMMY.pos.x, DUMMY.pos.z);
      if(front){
        floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), '正面 · 伤害 −80%', '#8fb4d8');
        BFX.burst(V3(DUMMY.pos.x, 1.1, DUMMY.pos.z), 10, { tex:'spark', sp:2.4, s0:.18, a0:.7, r:.6,g:.7,b:.85 });
      }else{
        floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), '背后 · 破甲', '#ffd070');
        BFX.burst(V3(BOSS.pos.x, 1.5, BOSS.pos.z), 14, { tex:'spark', sp:3, s0:.2, a0:.9, r:1,g:.85,b:.5 });
        shake(.3, .2);
      }
      lightPulse(V3(BOSS.pos.x, 1.5, BOSS.pos.z), 0xc8a878, 2.0, .4);
    });
  }
  },
  petrify: {
    id: 'petrify', group: 'mech',
    name: '石化凝视',
    warm: 1.1,
    mul: 1.2,
    tag: '视线',
    vert: false,
    counter: '扇形视线扫过，被照到定身 2 秒 —— 绕到它身后或离开扇面',
    hit: function(){ return { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:R(9), angle:aimAngle(), span:Math.PI*0.5 }; },
    run: function(){
    const a = aimAngle(), r = R(9), warm = WM(1.1);
    const hit = { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r, angle:a, span:Math.PI*0.5 };
    BFX.zone({ shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r, angle:a, span:Math.PI*0.5, dur:warm, color:0x9fe0a0 });
    // 眼睛发光 + 视线
    lightPulse(V3(BOSS.pos.x, 2.4, BOSS.pos.z), 0x8fe0a0, 2.4, warm);
    delay(warm*0.5, ()=>{
      BFX.ribbon({ from:V3(BOSS.pos.x, 2.4, BOSS.pos.z), to:V3(BOSS.pos.x + Math.sin(a)*r*0.8, 2.2, BOSS.pos.z + Math.cos(a)*r*0.8),
        color:0xbfff9a, life:.5, thick:.10, sag:.05, wobble:.05 });
    });
    delay(warm, ()=>{
      BFX.arcSlash({ x:BOSS.pos.x, z:BOSS.pos.z, y:2.2, r, span:Math.PI*0.5, color:0xbfff9a, yaw:a, tiltX:0, life:.4 });
      const caught = inHit(hit, DUMMY.pos.x, DUMMY.pos.z);
      if(caught){
        // 石化：灰壳包住假人
        const shell = new THREE.Mesh(G.box(0.95, 1.9, 0.75), M(0x9a958a, { r:.95, flat:true, t:true, o:.85 }));
        shell.position.set(DUMMY.pos.x, .95, DUMMY.pos.z);
        shell.scale.setScalar(.2);
        scene.add(shell);
        addUpdate({ t:0, update(dt){
          this.t += dt;
          const k = Math.min(1, this.t/.25);
          shell.scale.setScalar(k);
          if(this.t > 2.2){
            shell.material.opacity = Math.max(0, .85*(1-(this.t-2.2)/0.4));
            if(this.t > 2.6){ scene.remove(shell); shell.geometry.dispose(); shell.material.dispose(); this.dead = true; }
          }
        }});
        // 定身：脚下石化圈
        BFX.decal({ x:DUMMY.pos.x, z:DUMMY.pos.z, tex:'crack', r:1.6, life:2.4, a0:.75 });
        floatText(V3(DUMMY.pos.x, 1.6, DUMMY.pos.z), '石化 · 定身 2s', '#c8c0a8');
        BFX.burst(V3(DUMMY.pos.x, .8, DUMMY.pos.z), 14, { tex:'smoke', sp:2.2, s0:.5, s1:.9, a0:.4, grav:-.4, r:.6,g:.6,b:.55 });
      }else{
        floatText(V3(DUMMY.pos.x, 1.6, DUMMY.pos.z), '避开视线', '#8fd05a');
      }
      settle(hit, '凝视 ×1.2');
    });
  }
  },
  soulpull: {
    id: 'soulpull', group: 'mech',
    name: '魂锁拖拽',
    warm: 0.7,
    mul: 0.6,
    tag: '位移',
    vert: true,
    counter: '锁链把你往 Boss 拖，同时脚下落腐蚀圈 —— 反向跑 + 别站在圈里',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(4.2) }; },
    run: function(){
    const warm = WM(.7);
    const col = 0xb48cff;
    // 三条锁链
    for(let i=0;i<3;i++){
      delay(i*0.08, ()=> BFX.ribbon({
        from:V3(BOSS.pos.x, 1.2 + i*0.5, BOSS.pos.z),
        to:V3(DUMMY.pos.x, 1.0 + i*0.2, DUMMY.pos.z),
        color:col, life:1.3, thick:.045, sag:.15, wobble:.06 }));
    }
    markOnPlayer(col, warm, 1.2);
    delay(warm, ()=>{
      // 拖拽：把玩家往 Boss 方向拉 2.5 码（模拟位移压力）
      const dir = V3(BOSS.pos.x - DUMMY.pos.x, 0, BOSS.pos.z - DUMMY.pos.z);
      const len = dir.length() || 1;
      const target = V3(DUMMY.pos.x + dir.x/len*2.6, 0, DUMMY.pos.z + dir.z/len*2.6);
      moveDummy(target, .55);
      floatText(V3(DUMMY.pos.x, 1.5, DUMMY.pos.z), '被拖拽', '#c9a0ff');
      // 落点腐蚀圈
      delay(.6, ()=>{
        const p = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
        BFX.decal({ x:p.x, z:p.z, tex:'poison', r:2.2, life:4, color:0x8a5ac0, a0:.55 });
        BFX.spikes({ x:p.x, z:p.z, n:5, r:1.2, h:1.3, color:0x2a1a3a, glow:col, dur:1.6, tilt:.5 });
        const hit = { shape:'circle', x:p.x, z:p.z, r:2.2 };
        settle(hit, '锁住 ×0.6');
        delay(4.5, ()=> moveDummy(V3(0,0,0), .8));
      });
    });
  }
  },
  firewall: {
    id: 'firewall', group: 'mech',
    name: '火墙',
    warm: 0.9,
    mul: 1.1,
    tag: '分割场地',
    vert: true,
    counter: '两道火墙横穿场地并停留 4 秒，只能从缺口绕 —— 别被夹在中间',
    hit: function(){ return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:20, w:R(1.8), angle:aimAngle() }; },
    run: function(){
    const warm = WM(.9);
    const a = aimAngle();
    // 与视线垂直的两道墙，在 Boss 前方 4 / 8 码
    const perp = a + Math.PI/2;
    [4.5, 8.5].forEach((d, i)=>{
      const cx = BOSS.pos.x + Math.sin(a)*d;
      const cz = BOSS.pos.z + Math.cos(a)*d;
      delay(warm*0.4 + i*0.2, ()=>{
        // 墙：一排火柱
        for(let k=-5;k<=5;k++){
          const px = cx + Math.sin(perp)*(k*1.7);
          const pz = cz + Math.cos(perp)*(k*1.7);
          delay(Math.abs(k)*0.02, ()=> BFX.column({ x:px, z:pz, r:.62, h:2.6 + Math.random()*.9,
            color:0xff4a18, life:1.0, up:.08, core:0xffd8a0 }));
        }
        BFX.decal({ x:cx, z:cz, tex:'scorch', r:4.4, life:6 });
        // 停留 4 秒的伤害带
        const hit = { shape:'rect', x:cx - Math.sin(perp)*9, z:cz - Math.cos(perp)*9, len:18, w:R(1.8), angle:perp };
        const m = flatMesh(TEX_BAND, 0xff4a18, THREE.AdditiveBlending, .55);
        m.rotation.x = -Math.PI/2; m.rotation.z = -perp;
        m.position.set(cx, .05, cz);
        m.scale.set(hit.w, 18, 1);
        addUpdate({ t:0, update(dt){
          this.t += dt;
          m.material.opacity = .55 * (this.t > 3.2 ? Math.max(0, 1-(this.t-3.2)/1.2) : (0.75+0.25*Math.sin(this.t*9)));
          if(Math.random() < dt*20){
            const u = (Math.random()-.5)*18;
            BFX.spr(cx + Math.sin(perp)*u, .1, cz + Math.cos(perp)*u,
              { tex:'ember', vy:1.6+Math.random()*2, life:.7, s0:.24, a0:.8, grav:-1.2, r:1,g:.5,b:.2 });
          }
          if(this.t > 4.4){ disposeMesh(m); this.dead = true; }
        }});
        delay(4.2, ()=> settle(hit, '烧穿 ×1.1'));
      });
    });
  }
  },
  freeze: {
    id: 'freeze', group: 'mech',
    name: '冰封',
    warm: 0.8,
    mul: 0.8,
    tag: '控场',
    vert: false,
    counter: '被冻住要立刻连点（模拟），2.5 秒内挣脱；解慢了下一次就是处决',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(3.4) }; },
    run: function(){
    const warm = WM(.8);
    const col = 0x9ae8ff;
    BFX.zone({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(3.4), dur:warm, color:col });
    BFX.decal({ x:DUMMY.pos.x, z:DUMMY.pos.z, tex:'frost', r:2.6, life:warm + 2.6, color:col, a0:.55 });
    delay(warm, ()=>{
      const hit = this.hit();
      if(!inHit(hit, DUMMY.pos.x, DUMMY.pos.z)){ floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), '闪开', '#8fd05a'); return; }
      // 冰壳
      const shell = new THREE.Mesh(G.sph(0.95, 10), M(0xaee8ff, { r:.15, m:.1, t:true, o:.5,
        e:0x6fd0ff, ei:.8 }));
      shell.position.set(DUMMY.pos.x, .95, DUMMY.pos.z);
      shell.scale.set(1, 1.1, 1);
      scene.add(shell);
      const shards = [];
      for(let i=0;i<7;i++){
        const a = i/7*6.283;
        const c = new THREE.Mesh(G.cone(0.10, 0.5, 4), M(0xbfe8ff, { r:.2, m:.05, t:true, o:.75 }));
        c.position.set(DUMMY.pos.x + Math.cos(a)*0.8, .4 + Math.random()*1.1, DUMMY.pos.z + Math.sin(a)*0.8);
        c.rotation.set(Math.random()*.6, a, (Math.random()-.5)*.8);
        scene.add(c); shards.push(c);
      }
      BFX.burst(V3(DUMMY.pos.x, 1, DUMMY.pos.z), 18, { tex:'spark', sp:3, s0:.2, a0:.85, r:.7,g:.94,b:1 });
      floatText(V3(DUMMY.pos.x, 1.9, DUMMY.pos.z), '冰封 2.5s · 连点挣脱', '#9ae8ff');
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = this.t/2.5;
        shell.material.opacity = .5*Math.max(0, 1-k*0.7);
        if(this.t > 2.2){
          const f = Math.max(0, 1-(this.t-2.2)/0.4);
          shards.forEach(s=>{ s.material.opacity = .75*f; });
          if(this.t > 2.6){
            scene.remove(shell); shell.geometry.dispose(); shell.material.dispose();
            shards.forEach(s=>{ scene.remove(s); s.geometry.dispose(); s.material.dispose(); });
            BFX.shock(V3(DUMMY.pos.x,0,DUMMY.pos.z), 2.4, { color:col, dur:.45, a0:.8 });
            this.dead = true;
          }
        }
      }});
      lightPulse(V3(DUMMY.pos.x, 1, DUMMY.pos.z), col, 2.4, .5);
    });
  }
  },
  eggs: {
    id: 'eggs', group: 'mech',
    name: '孵化卵囊',
    warm: 0.7,
    mul: 0,
    tag: '限时目标',
    vert: false,
    counter: '三个卵囊 6 秒后孵出小蛛，优先转火打掉（各有独立小圈）',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(2.4) }; },
    run: function(){
    const base = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const col = 0xa0e060;
    for(let i=0;i<3;i++){
      const a = i/3*6.283 + Math.random();
      const p = V3(base.x + Math.cos(a)*2.6, 0, base.z + Math.sin(a)*2.6);
      const egg = new THREE.Mesh(G.sph(0.42, 9), M(0x6b4278, { r:.55, t:true, o:.95, e:0x4a2a55, ei:.5 }));
      egg.position.set(p.x, .42, p.z); egg.scale.set(1, 1.2, 1);
      scene.add(egg);
      BFX.decal({ x:p.x, z:p.z, tex:'poison', r:1.3, life:6, color:col, a0:.5 });
      let born = false;
      addUpdate({ t:0, update(dt){
        this.t += dt;
        egg.scale.y = 1.2 + Math.sin(this.t*7)*0.06;
        if(this.t > 6 && !born){
          born = true;
          // 孵出小蛛（代理）
          const grp = new THREE.Group();
          P(grp, G.sph(0.24, 7), M(0x8a6f9a, { r:.8 }), [0, .24, 0], [1, .8, 1.2]);
          for(let k=0;k<8;k++){
            const aa = k/8*6.283;
            P(grp, G.cyl(0.02, 0.02, 0.4, 4), M(0x3a2240, { r:.9 }),
              [Math.cos(aa)*0.24, .14, Math.sin(aa)*0.24], [1,1,1], [0, 0, 1.2]);
          }
          grp.position.copy(p); scene.add(grp);
          BFX.burst(V3(p.x, .3, p.z), 12, { tex:'ember', sp:2.6, s0:.2, a0:.8, r:.6,g:.9,b:.36 });
          scene.remove(egg);
          delay(6, ()=>{
            const off = Math.random()*3;
            let tt = 0;
            addUpdate({ update(d){ tt += d;
              if(BOSS.g){}
              grp.position.x = p.x + Math.sin(tt*1.6 + off)*1.4;
              grp.position.z = p.z + Math.cos(tt*1.4 + off)*1.4;
              grp.rotation.y += d*1.2;
              if(tt > 8){ scene.remove(grp); this.dead = true; }
            }});
          });
          this.dead = true;   // 卵的更新结束，交给小蛛
        }
      }});
    }
  }
  },
  ferry: {
    id: 'ferry', group: 'mech',
    name: '摆渡',
    warm: 0.9,
    mul: 1.3,
    tag: '强制位移',
    vert: true,
    counter: '被传送到场地边缘，原位置留一个爆炸圈 —— 传送后立刻再走一步',
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(3.2) }; },
    run: function(){
    const warm = WM(.9);
    const src = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    BFX.zone({ shape:'circle', x:src.x, z:src.z, r:R(3.2), dur:warm, color:0x6f9fd8 });
    // 冥河：一条从 Boss 到玩家的水面
    BFX.ribbon({ from:V3(BOSS.pos.x, .3, BOSS.pos.z), to:V3(src.x, .2, src.z),
      color:0x6f9fd8, life:warm, thick:.35, sag:0, wobble:.4 });
    markOnPlayer(0x6f9fd8, warm, 1.4);
    delay(warm, ()=>{
      // 消失 → 出现在边缘
      const ang = Math.random()*6.283;
      const dest = V3(Math.cos(ang)*10.5, 0, Math.sin(ang)*10.5);
      BFX.burst(V3(src.x, .8, src.z), 16, { tex:'smoke', sp:3, s0:.7, s1:1.4, a0:.45, grav:-.2, r:.45,g:.58,b:.75 });
      moveDummy(dest, .35, false);
      BFX.column({ x:dest.x, z:dest.z, r:.9, h:3.4, color:0x6f9fd8, life:.8, up:.1, core:0xd8ecff });
      BFX.burst(V3(dest.x, .6, dest.z), 14, { tex:'spark', sp:3.2, s0:.2, a0:.8, r:.6,g:.8,b:1 });
      floatText(V3(dest.x, 1.6, dest.z), '被摆渡到边缘', '#8fc0ff');
      // 原位爆炸
      delay(.25, ()=>{
        BFX.shock(V3(src.x,0,src.z), 4.4, { color:0x6f9fd8, dur:.55, a0:.9 });
        BFX.wave({ x:src.x, z:src.z, r0:.5, r1:3.4, h:1.8, color:0x8fc0ff, dur:.45 });
        BFX.burst(V3(src.x, .5, src.z), 20, { tex:'ember', sp:6, s0:.22, a0:.85, grav:4, r:.5,g:.7,b:1 });
        BFX.decal({ x:src.x, z:src.z, tex:'scorch', r:2.6, life:5 });
        shake(.5, .3);
      });
      delay(6, ()=> moveDummy(V3(0,0,0), 1.0));
    });
  }
  },
  bladedomain: {
    id: 'bladedomain', group: 'mech',
    name: '剑域',
    warm: 0.9,
    mul: 1.4,
    tag: '领地',
    vert: true,
    counter: '十二把剑围成剑域，圈内每 0.8 秒吃剑气 —— 要么出去，要么贴边躲剑锋',
    hit: function(){ return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(7.5), r0:0.4 }; },
    run: function(){
    const c = V3(BOSS.pos.x, 0, BOSS.pos.z);
    const r = R(7.5), warm = WM(.9);
    const n = 12;
    BFX.zone({ shape:'ring', x:c.x, z:c.z, r, r0:r*0.92, dur:warm + 4.6, color:0xffe6a0 });
    for(let i=0;i<n;i++){
      const a = i/n*6.283;
      const px = c.x + Math.cos(a)*r, pz = c.z + Math.sin(a)*r;
      delay(warm*0.2 + i*0.03, ()=>{
        BFX.blade({ from:V3(px, 8, pz), to:V3(px, 0, pz), s:.9, color:0xffe6a8, fall:.3, stick:4.6 });
      });
    }
    // 圈内的持续剑气
    for(let k=0;k<6;k++){
      delay(warm + 0.4 + k*0.8, ()=>{
        if(!inHit({ shape:'circle', x:c.x, z:c.z, r }, DUMMY.pos.x, DUMMY.pos.z)) return;
        // 剑气从圆边扫向玩家
        const a = Math.atan2(DUMMY.pos.x - c.x, DUMMY.pos.z - c.z);
        const bx = c.x + Math.sin(a)*r, bz = c.z + Math.cos(a)*r;
        BFX.ribbon({ from:V3(bx, 1.0, bz), to:V3(DUMMY.pos.x, 1.0, DUMMY.pos.z),
          color:0xfff0c0, life:.28, thick:.05, sag:0, wobble:.05 });
        BFX.burst(V3(DUMMY.pos.x, 1.0, DUMMY.pos.z), 6, { tex:'spark', sp:2.4, s0:.16, a0:.8, r:1,g:.94,b:.7 });
        floatText(V3(DUMMY.pos.x, 1.3, DUMMY.pos.z), '剑气 ×1.4', '#ffe6a0');
      });
    }
    delay(warm + 0.5, ()=> lightPulse(V3(c.x, 1.4, c.z), 0xffe6a0, 2.6, .6));
  }
  },
  mirror: {
    id: 'mirror', group: 'mech',
    name: '无相分身',
    warm: 0.9,
    mul: 0.7,
    tag: '辨真',
    vert: true,
    counter: '三个分身放同样的小弹幕，真身胸口有核 —— 打分身只会浪费时间',
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(4.0) }; },
    run: function(){
    const col = 0xc060ff;
    const origin = BOSS.pos.clone();
    const spots = [140, 220, 320].map(deg=>{
      const a = deg*Math.PI/180;
      return V3(origin.x + Math.cos(a)*7, 0, origin.z + Math.sin(a)*7);
    });
    const clones = [];
    const cloneMats = [];   /* 只记我们 clone 出来的材质：几何是共享的，绝不能 dispose */
    /* 分身用本体克隆：共享几何、材质各自克隆一份压暗。
       手搭三根胶囊那种做法在俯视角里读不出"这是另一个我"。 */
    spots.forEach((p, i)=>{
      let g;
      if(BOSS.g){
        g = BOSS.g.clone(true);
        g.traverse(o=>{
          if(o.material && !Array.isArray(o.material)){
            o.material = o.material.clone();
            cloneMats.push(o.material);
            o.material.transparent = true;
            o.material.opacity = Math.min(o.material.opacity != null ? o.material.opacity : 1, .55);
            if(o.material.emissive) o.material.emissive.setHex(0x2a0a34);
            if(o.material.color) o.material.color.multiplyScalar(.55);
          }
        });
      }else{
        g = new THREE.Group();
        P(g, G.cyl(0.34, 0.26, 1.7, 8), M(0x1a0a22, { r:.9 }), [0, 1.2, 0]);
      }
      g.position.copy(p);
      g.rotation.y = Math.atan2(-p.x, -p.z);
      g.scale.setScalar(0.01);
      scene.add(g);
      clones.push({ g, p });
      // 真身：胸口核发亮（认核 = 解法）
      if(i === 0){
        const core = billMesh(TEX.soft, col, .95);
        core.scale.setScalar(1.2);
        core.position.y = 2.0;
        g.add(core);
      }
    });
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/.4);
      clones.forEach(c=>{
        const base = BOSS.g ? BOSS.g.scale.x : 1;
        c.g.scale.setScalar(k * base);
        c.g.position.y = Math.sin(this.t*2 + c.p.x)*0.06;
      });
      if(this.t > 3.4){ this.dead = true; }
    }});
    // 三个一起放小弹幕
    delay(1.4, ()=>{
      clones.forEach((c, i)=>{
        for(let k=0;k<3;k++){
          const a = Math.atan2(DUMMY.pos.x - c.p.x, DUMMY.pos.z - c.p.z) + (k-1)*0.25;
          for(let s=0;s<5;s++){
            delay(s*0.06, ()=>{
              const d = 1.0 + s*1.3;
              BFX.spr(c.p.x + Math.sin(a)*d, 1.2, c.p.z + Math.cos(a)*d,
                { tex:'ember', life:.5, s0:.26, a0:.8, r:.7,g:.35,b:1, drag:2 });
            });
          }
        }
        BFX.column({ x:c.p.x, z:c.p.z, r:.7, h:3.2, color:col, life:.7, up:.12, core:0xe0c0ff });
      });
      lightPulse(V3(origin.x, 1.4, origin.z), col, 3.0, .5);
    });
    // 收场：分身消散
    delay(3.6, ()=>{
      clones.forEach(c=>{
        BFX.burst(V3(c.p.x, 1.2, c.p.z), 16, { tex:'smoke', sp:2.6, s0:.7, s1:1.5, a0:.45, grav:-.6, r:.3,g:.1,b:.4 });
        scene.remove(c.g);
      });
      /* 连刷 20 次会攒 20 份材质 → 每次收场必须还回去 */
      cloneMats.forEach(m=> m.dispose());
      cloneMats.length = 0;
      BFX.shock(V3(origin.x,0,origin.z), 5, { color:col, dur:.6, a0:.8 });
      floatText(V3(DUMMY.pos.x, 1.6, DUMMY.pos.z), '真身 · 胸口有核', '#c9a0ff');
      settle(this.hit(), '无相 ×0.7');
    });
  }
  },
  staggerbreak: {
    id: 'staggerbreak', group: 'mech',
    name: '破防窗口',
    warm: 0.9,
    mul: 1,
    tag: '读招/克制',
    vert: false,
    counter: '它的招牌招有后摇，收招后 2.5~4 秒是破绽（伤害 ×1.5）；属性上有一个 −60 的洞，换对元素再打 ×1.6',
    hit: function(){
    /* 判定 = 那招本身的范围（拿它自己的 stagger.skill 当招牌招） */
    const sk = (curBoss && curBoss.staggerSkill) || 'slam';
    if(SHARED[sk] && SHARED[sk].hit) return SHARED[sk].hit();
    return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(5) };
  },
    run: function(){
    const dur = (curBoss && curBoss.stagger) || 3;
    const weak = (curBoss && curBoss.weak) || null;
    const col = 0xffd24a;
    const hit = this.hit();
    /* 招牌招先正常打一遍 */
    BFX.zone({ shape:hit.shape, x:hit.x, z:hit.z, r:hit.r, r0:hit.r0, len:hit.len, w:hit.w,
      span:hit.span, angle:hit.angle, dur:.7, color:0xff5522 });
    delay(.7, ()=> settle(hit, '招牌招'));

    /* 收招 → 破绽 */
    delay(dur * 0.45, ()=>{
      /* 金纹：沿躯干铺几道贴地裂纹 + 一圈收缩的环 */
      for(let i=0;i<5;i++){
        const a = i/5*6.283;
        BFX.decal({ x:BOSS.pos.x + Math.cos(a)*1.6, z:BOSS.pos.z + Math.sin(a)*1.6,
          tex:'crack', r:1.5, life:dur, color:col, a0:.85, rot:a });
      }
      BFX.shock(V3(BOSS.pos.x, 0, BOSS.pos.z), 4.2, { color:col, dur:.5, a0:.9 });
      /* 头顶读条：破防还剩多久 */
      const bar = label3d('破绽 ' + dur.toFixed(1) + 's', '#ffd24a', 0,
        ()=> V3(BOSS.pos.x, bossLabelY() + 0.9, BOSS.pos.z));
      labels.push(bar);
      floatText(V3(BOSS.pos.x, bossLabelY()*0.8, BOSS.pos.z), '破绽 · 伤害 ×1.5', '#ffd24a');
      let t = 0;
      addUpdate({ update(dt){
        t += dt;
        const left = Math.max(0, dur - t);
        bar.el.textContent = left > 0 ? '破绽 ' + left.toFixed(1) + 's' : '';
        /* Boss 在破绽里抖（站不稳） */
        if(BOSS.g) BOSS.g.rotation.z = Math.sin(t*22) * 0.045 * (left/dur);
        if(left <= 0){
          if(BOSS.g) BOSS.g.rotation.z = 0;
          const k = labels.indexOf(bar);
          if(k >= 0){ labels.splice(k,1); bar.el.remove(); }
          this.dead = true;
        }
      }});
    });

    /* 弱点：命中时额外提示 */
    delay(dur * 0.45 + 0.4, ()=>{
      if(!weak) return;
      const cn = { phys:'物理', fire:'火', ice:'冰', lightning:'雷', poison:'毒' }[weak] || weak;
      BFX.burst(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), 22,
        { tex:'spark', sp:5, s0:.18, a0:.95, r:.55,g:.85,b:1 });
      floatText(V3(DUMMY.pos.x, 1.9, DUMMY.pos.z), '弱点 · ' + cn + ' ×1.6', '#7fd6ff');
    });
  }
  },
  corpsetide: {
    id: 'corpsetide', group: 'mech',
    name: '尸潮',
    warm: 1,
    mul: 1,
    tag: '限时清场',
    vert: true,
    counter: '六个裂口同时开，爬出来的东西会一直变多 —— 拖不是策略',
    hit: function(){
    const n = N(6), rr = R(8.2), pts = [];
    for(let i=0;i<n;i++){
      const a = i/n*6.283 + .3;
      pts.push({ x:BOSS.pos.x + Math.cos(a)*rr, z:BOSS.pos.z + Math.sin(a)*rr, r:2.6 });
    }
    return { shape:'scatter', pts };
  },
    run: function(){
    const hit = this.hit();
    const col = 0x9aa8b8;
    /* 先铺垫地裂纹，再逐个开 */
    hit.pts.forEach((p, i)=>{
      delay(i*0.12, ()=>{
        BFX.decal({ x:p.x, z:p.z, tex:'crack', r:p.r, life:3.4, color:col, a0:.9, rot:i });
        BFX.zone({ shape:'circle', x:p.x, z:p.z, r:p.r, dur:1.5, color:0xa02020 });
        /* 手：从地里伸出来的细骨（**别用亮色**：加法混合下白会糊成一片冰晶） */
        for(let k=0;k<2;k++){
          const a = k/2*6.283 + i*1.7;
          BFX.spikes({ x:p.x + Math.cos(a)*0.6, z:p.z + Math.sin(a)*0.6, n:1,
            r:.30, h:1.35, color:0x8a7a60, glow:0x241c16, dur:1.7, tilt:.34, thick:1.35 });
        }
      });
      /* 爬起来：烟 + 骨屑 */
      delay(0.9 + i*0.12, ()=>{
        BFX.burst(V3(p.x, .2, p.z), 14, { tex:'smoke', sp:3.2, s0:.6, s1:1.1, a0:.5, grav:-1.2, r:.55,g:.58,b:.62 });
        BFX.burst(V3(p.x, .5, p.z), 8, { tex:'spark', sp:3, s0:.14, a0:.7, grav:4, r:.85,g:.8,b:.7 });
      });
    });
    /* 计数条：告诉玩家「这一波还剩几个」 */
    const tip = label3d('尸潮 ×' + hit.pts.length, '#9aa8b8', 0,
      ()=> V3(BOSS.pos.x, bossLabelY() + 0.9, BOSS.pos.z));
    labels.push(tip);
    delay(2.6, ()=>{
      const k = labels.indexOf(tip); if(k >= 0){ labels.splice(k,1); tip.el.remove(); }
      settle(hit, '尸潮 ×1.0');
    });
  }
  },
  rockfall: {
    id: 'rockfall', group: 'mech',
    name: '落石',
    warm: 1.2,
    mul: 1.4,
    tag: '连续落点',
    vert: true,
    counter: '七个落点铺满场地，中间有缝 —— 别跑，走缝',
    hit: function(){
    const n = N(7), pts = [];
    /* 以玩家为中心撒点，保证「脚下一定有一个」，逼他动 */
    pts.push({ x:DUMMY.pos.x, z:DUMMY.pos.z, r:2.2 });
    for(let i=1;i<n;i++){
      const a = i/n*6.283 + Math.random()*0.4;
      const rr = 3.5 + (i%3)*3.0;
      pts.push({ x:DUMMY.pos.x + Math.cos(a)*rr, z:DUMMY.pos.z + Math.sin(a)*rr, r:2.2 });
    }
    return { shape:'scatter', pts };
  },
    run: function(){
    const hit = this.hit();
    const col = 0x8a8a92;
    BFX.zone({ shape:'scatter', pts:hit.pts, dur:1.1, color:0xff7a3c });
    hit.pts.forEach((p, i)=>{
      delay(1.15 + i*0.05, ()=>{
        BFX.boulder({ from:V3(p.x + 2, 18, p.z - 2), to:V3(p.x, 0, p.z), r:p.r*0.62,
          color:0x6f675f, glow:col, fall:1.1, split:2 });
        BFX.decal({ x:p.x, z:p.z, tex:'crack', r:p.r*0.9, life:3.2 });
        BFX.shock(V3(p.x, 0, p.z), p.r*1.4, { color:0xc8a878, dur:.4, a0:.7 });
        shake(.25, .18);
      });
    });
    delay(1.5, ()=> settle(hit, '落石 ×1.4'));
  }
  },
  wardrum: {
    id: 'wardrum', group: 'mech',
    name: '兽鼓',
    warm: 0.9,
    mul: 1.1,
    tag: '可破坏',
    vert: false,
    counter: '场边那面鼓会一直叫兽群来 —— 先砸鼓（判定圈在鼓上，不在 Boss 上）',
    hit: function(){
    const a = Math.random()*6.283, rr = R(7.5);
    return { shape:'circle', x:BOSS.pos.x + Math.cos(a)*rr, z:BOSS.pos.z + Math.sin(a)*rr, r:R(4.5) };
  },
    run: function(){
    const hit = this.hit();
    const col = 0xff8a3c;
    const p = V3(hit.x, 0, hit.z);
    /* 鼓：立着的圆筒 + 木架 + 一圈兽牙 */
    const g = new THREE.Group(); g.position.copy(p); scene.add(g);
    P(g, G.cyl(0.85, 0.95, 1.5, 14), M(0x5a2418, { r:.9, flat:true }), [0, 1.0, 0]);
    P(g, G.cyl(0.9, 0.9, 0.12, 14), M(0xd8cbb0, { r:.7 }), [0, 1.78, 0]);
    P(g, G.cyl(0.9, 0.9, 0.12, 14), M(0xd8cbb0, { r:.7 }), [0, 0.24, 0]);
    for(const sx of [-1,1]){
      P(g, G.cyl(0.07, 0.09, 1.9, 5), M(0x3a2414, { r:.95 }), [sx*0.8, 1.0, 0], [1,1,1], [0,0,sx*0.16]);
    }
    for(let i=0;i<6;i++){
      const a = i/6*6.283;
      P(g, G.cone(0.09, 0.5, 4), M(0xe8e0c0, { r:.5 }), [Math.cos(a)*0.95, 1.85, Math.sin(a)*0.95],
        [1,1,1], [Math.PI/2*Math.cos(a+Math.PI/2), 0, 0]);
    }
    BFX.decal({ x:p.x, z:p.z, tex:'rune', r:2.0, life:6, color:col, a0:.55 });
    BFX.zone({ shape:'circle', x:p.x, z:p.z, r:hit.r, dur:1.0, color:0xff5522 });

    /* 鼓点：每 1.2 秒一声，每声从场边跑进来两只 */
    for(let i=0;i<4;i++){
      delay(1.2 + i*1.2, ()=>{
        BFX.shock(V3(p.x, 0, p.z), 3.6, { color:col, dur:.45, a0:.85 });
        BFX.wave({ x:p.x, z:p.z, r0:.4, r1:4.2, h:1.2, color:col, dur:.35 });
        shake(.3, .16);
        /* 兽群：从四个方向冲进来 */
        for(let k=0;k<2;k++){
          const a = Math.random()*6.283;
          const from = V3(p.x + Math.cos(a)*9, 0, p.z + Math.sin(a)*9);
          BFX.ribbon({ from:V3(from.x, .5, from.z), to:V3(p.x, .5, p.z), color:0xffb04a,
            life:.5, thick:.06, sag:.05, wobble:.15 });
          BFX.burst(V3(from.x, .5, from.z), 6, { tex:'smoke', sp:2.4, s0:.4, a0:.4, grav:-.4, r:.4,g:.3,b:.2 });
        }
      });
    }
    /* 5 秒后鼓自己炸（没砸掉的下场） */
    delay(5.6, ()=>{
      BFX.shock(V3(p.x, 0, p.z), hit.r*1.1, { color:0xff7744, dur:.6, a0:.95 });
      BFX.wave({ x:p.x, z:p.z, r0:.5, r1:hit.r, h:2.0, color:0xffa060, dur:.45 });
      BFX.burst(V3(p.x, 1.0, p.z), 22, { tex:'ember', sp:7, s0:.22, a0:.9, grav:5, r:1,g:.55,b:.28 });
      g.children.slice().forEach(c=>{ g.remove(c); if(c.material) c.material.dispose(); });
      scene.remove(g);
      settle(hit, '兽鼓爆 ×1.1');
    });
    addUpdate({ t:0, update(dt){ this.t += dt; if(g.parent) g.rotation.y = this.t*0.5; }});
  }
  },
  flood: {
    id: 'flood', group: 'mech',
    name: '水位',
    warm: 1.1,
    mul: 1.2,
    tag: '安全区收缩',
    vert: false,
    counter: '水每 20 秒涨一圈，安全区一直在缩 —— 泡在水里持续掉血，逼你往前打',
    hit: function(){
    const rOuter = R(13);
    const rSafe = Math.max(2.6, R(13) * 0.52);
    return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:rOuter, r0:rSafe };
  },
    run: function(){
    const col = 0x4a7fa8;
    const rOuter = R(13);
    let safe = rOuter;
    /* 水面 = **一圈立起来的水墙**，不是一张贴地的蓝片。
       贴地片有两个毛病：俯视角下只在上方露出一段弧（被相机裁掉），
       而且中心最亮的软贴图会把「安全区」画成最危险的地方。
       水墙用一个开口圆筒 + 逐帧改 scale.xz，任何机位都读得出「圈在收」。 */
    const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true);
    const wallMat = new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:.42,
      blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(BOSS.pos.x, 0, BOSS.pos.z);
    scene.add(wall);
    /* 墙里再垫一层贴地的浅水，让墙脚有落影 */
    const pool = flatMesh(TEX.tele, col, THREE.AdditiveBlending, .18);
    pool.rotation.x = -Math.PI/2;
    pool.position.set(BOSS.pos.x, .03, BOSS.pos.z);
    pool.scale.setScalar(rOuter*2.05);
    scene.add(pool);
    const water = [{ m:wall, lag:0 }, { m:pool, lag:0.1 }];
    /* 安全区边线 */
    const ringHandle = BFX.zone({ shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z,
      r:rOuter, r0:safe, dur:6.4, color:0x7fd6ff });

    const tip = label3d('水位 · 安全区', '#7fd6ff', 0, ()=> V3(BOSS.pos.x, bossLabelY() + 0.9, BOSS.pos.z));
    labels.push(tip);

    let t = 0, lastStep = 0;
    addUpdate({ update(dt){
      t += dt;
      const k = Math.min(1, t/6.0);
      safe = rOuter * (1 - 0.62*k);          /* 安全区 100% → 38% */
      const hgt = 0.5 + 1.5*k;                 /* 水位在涨：墙越来越高 */
      wall.scale.set(safe, hgt, safe);
      wall.position.y = hgt*0.5;
      wallMat.opacity = 0.30 + 0.22*k;
      pool.scale.setScalar(safe*2.05);
      pool.material.opacity = 0.10 + 0.10*k;
      /* 每 1.5 秒涨一次的视觉节点 */
      if(t - lastStep > 1.5){
        lastStep = t;
        BFX.shock(V3(BOSS.pos.x, 0, BOSS.pos.z), safe*1.02, { color:0x9fe0ff, dur:.5, a0:.55 });
        BFX.burst(V3(BOSS.pos.x + safe*0.7, .3, BOSS.pos.z), 8,
          { tex:'spark', sp:2.2, s0:.12, a0:.6, grav:2, r:.5,g:.8,b:1 });
      }
      tip.el.textContent = '安全区 ' + safe.toFixed(1) + ' 米';
      if(BOSS.g){
        /* Boss 站在水中央，水涨它就抬头 —— 读作「它也怕淹」是错的，
           这里只让它脚下有两圈涟漪 */
      }
      if(k >= 1){
        const j = labels.indexOf(tip); if(j >= 0){ labels.splice(j,1); tip.el.remove(); }
        scene.remove(wall); wallGeo.dispose(); wallMat.dispose();
        /* 只还材质：flatMesh 用的是共享 _plane 几何，dispose 掉会让后面所有贴片变白板 */
        scene.remove(pool); pool.material.dispose();
        this.dead = true;
      }
    }});
    delay(6.2, ()=>{
      settle(this.hit(), '淹没 ×1.2');
      BFX.zone({ shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:rOuter, r0:safe, dur:.4, color:0x4a7fa8 });
    });
    if(ringHandle) ringHandle.kill && delay(6.3, ()=> ringHandle.kill());
  }
  },
  windpress: {
    id: 'windpress', group: 'mech',
    name: '风压',
    warm: 0.7,
    mul: 1,
    tag: '推离',
    vert: false,
    counter: '风一直把人往外推，越站越远 —— 逆着风走位，别只顾躲招',
    hit: function(){
    /* 风的判定是「被推到边缘之外」：外圈刮伤 */
    return { shape:'ring', x:BOSS.pos.x, z:BOSS.pos.z, r:R(16), r0:R(10.5) };
  },
    run: function(){
    const col = 0xbcd8e8;
    const hit = this.hit();
    const homeX = DUMMY.pos.x, homeZ = DUMMY.pos.z;
    for(let i=0;i<3;i++){
      delay(0.6 + i*1.15, ()=>{
        /* 风带：三条横向的丝，从外往里扫（读作"风从那边来"） */
        const a = Math.random()*6.283;
        for(let k=0;k<7;k++){
          const off = (k-3)*1.5;
          const px = BOSS.pos.x + Math.cos(a+Math.PI/2)*off;
          const pz = BOSS.pos.z + Math.sin(a+Math.PI/2)*off;
          BFX.ribbon({ from:V3(px + Math.cos(a)*10, .5, pz + Math.sin(a)*10),
            to:V3(px + Math.cos(a)*1.5, .5, pz + Math.sin(a)*1.5),
            color:col, life:.45, thick:.05, sag:.02, wobble:.22 });
        }
        BFX.burst(V3(DUMMY.pos.x, .6, DUMMY.pos.z), 12,
          { tex:'smoke', sp:3.4, s0:.5, a0:.35, grav:-.2, r:.75,g:.85,b:.9 });
        /* 推：靶子被吹离 Boss 1.6 米 */
        const dx = DUMMY.pos.x - BOSS.pos.x, dz = DUMMY.pos.z - BOSS.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const push = 1.6;
        const tx = DUMMY.pos.x + dx/d*push, tz = DUMMY.pos.z + dz/d*push;
        const sx = DUMMY.pos.x, sz = DUMMY.pos.z;
        let t = 0;
        addUpdate({ update(dt){
          t += dt;
          const kk = Math.min(1, t/0.35);
          DUMMY.pos.x = sx + (tx-sx)*kk;
          DUMMY.pos.z = sz + (tz-sz)*kk;
          if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
          if(kk >= 1) this.dead = true;
        }});
        shake(.3, .2);
      });
    }
    delay(4.0, ()=>{
      const d = Math.hypot(DUMMY.pos.x - BOSS.pos.x, DUMMY.pos.z - BOSS.pos.z);
      floatText(V3(DUMMY.pos.x, 1.8, DUMMY.pos.z),
        '被推到 ' + d.toFixed(1) + ' 米' + (d > 10.5 ? ' · 出界' : ' · 还在内圈'),
        d > 10.5 ? '#ff9a6a' : '#8fd05a');
      settle(this.hit(), '风压 ×1.0');
      /* 演示完把靶子放回去，方便连续点第二次 */
      delay(1.2, ()=>{
        DUMMY.pos.set(homeX, 0, homeZ);
        if(DUMMY.g) DUMMY.g.position.copy(DUMMY.pos);
      });
    });
  }
  },
  slam: {
    id: 'slam', group: 'shared',
    name: '砸地',
    warm: 0.85,
    mul: 1.5,
    hitR: 4.6,
    vert: false,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(4.6) }),
    run: function(){
    const tgt = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const r = R(4.6), warm = WM(.85);
    const hit = this.hit();
    BFX.zone({ shape:'circle', x:tgt.x, z:tgt.z, r, dur:warm, color:0xff5522 });
    swingArm(0, -1.5, warm*1.5);
    seq([[warm*0.45, ()=>{ BFX.spr(tgt.x, .05, tgt.z, { tex:'smoke', life:.6, s0:.9, s1:1.6, a0:.3, r:.6,g:.55,b:.5 }); }],
         [warm, ()=>{
      BFX.shock(tgt, r*1.25, { color:0xff7744, dur:.55, a0:.95 });
      BFX.wave({ x:tgt.x, z:tgt.z, r0:.6, r1:r*1.05, h:1.6, color:0xffa060, dur:.42 });
      BFX.burst(V3(tgt.x, .4, tgt.z), 30, { tex:'ember', sp:8, s0:.24, a0:.9, grav:6, r:1, g:.55, b:.28 });
      BFX.burst(V3(tgt.x, .2, tgt.z), 16, { tex:'smoke', sp:4.2, s0:1.0, s1:2.2, a0:.45, grav:1.4, drag:2.2, r:.55,g:.5,b:.46 });
      BFX.decal({ x:tgt.x, z:tgt.z, tex:'crack', r:r*0.95, life:4.5 });
      BFX.decal({ x:tgt.x, z:tgt.z, tex:'scorch', r:r*0.62, life:3.4 });
      lightPulse(V3(tgt.x, 1.2, tgt.z), 0xff8844, 3.0, .35);
      shake(.55, .26);
      settle(hit, '命中 ×1.5');
    }]]);
  }
  },
  roots: {
    id: 'roots', group: 'shared',
    name: '藤蔓',
    warm: 0.7,
    mul: 1.1,
    hitR: 2.6,
    vert: true,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(2.6) }),
    run: function(){
    const n = 3;
    for(let i=0;i<n;i++){
      const t = V3(DUMMY.pos.x + (Math.random()-.5)*10, 0, DUMMY.pos.z + (Math.random()-.5)*10);
      const r = R(2.6), warm = WM(.7 + i*0.18);
      const hit = { shape:'circle', x:t.x, z:t.z, r };
      BFX.zone({ shape:'circle', x:t.x, z:t.z, r, dur:warm, color:0x66aa44 });
      delay(warm, ()=>{
        BFX.decal({ x:t.x, z:t.z, tex:'crack', r:r*0.8, life:3.2, a0:.7 });
        BFX.spikes({ x:t.x, z:t.z, n:7, r:r*0.8, h:1.9, color:0x2a3a20, glow:0x3a7a2a,
          dur:1.9, tilt:.34, thick:1 });
        BFX.burst(V3(t.x, .25, t.z), 20, { tex:'smoke', sp:3.4, s0:.7, s1:1.4, a0:.4, grav:-1.6, r:.4,g:.5,b:.3 });
        BFX.burst(V3(t.x, .3, t.z), 12, { tex:'ember', sp:4.2, s0:.16, a0:.8, grav:-3, r:.5,g:.9,b:.35 });
        shake(.18, .16);
        settle(hit, '缠住 ×1.1');
      });
    }
  }
  },
  ringshot: {
    id: 'ringshot', group: 'shared',
    name: '环射',
    warm: 0.35,
    mul: 0.8,
    hitR: 0.3,
    vert: false,
    hit: ()=>({ shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:1.5 }),
    run: function(){
    const n = N(12);
    const off = Math.random()*6.28;
    const col = BOSS.cfg.glowHex || 0xff6666;
    BFX.burst(V3(BOSS.pos.x, 1.5, BOSS.pos.z), 12, { tex:'soft', sp:3, s0:.3, a0:.7,
      r:((col>>16)&255)/255, g:((col>>8)&255)/255, b:(col&255)/255 });
    for(let i=0;i<n;i++){
      const a = off + i/n*6.283;
      const dir = V3(Math.cos(a), 0, Math.sin(a));
      const p = V3(BOSS.pos.x + dir.x*1.5, 1.5, BOSS.pos.z + dir.z*1.5);
      const orb = billMesh(TEX.soft, col, .95);
      orb.scale.setScalar(.62);
      orb.position.copy(p);
      const halo = billMesh(TEX.ember, col, .5);
      halo.scale.setScalar(1.5); halo.position.copy(p);
      let alive = 0;
      addUpdate({ update(dt){
        alive += dt;
        const sp = 12;
        p.x += dir.x*sp*dt; p.z += dir.z*sp*dt;
        orb.position.copy(p); halo.position.copy(p);
        if(Math.random() < dt*36){
          BFX.spr(p.x, p.y, p.z, { tex:'ember', life:.34, s0:.26, a0:.7,
            r:((col>>16)&255)/255, g:((col>>8)&255)/255, b:(col&255)/255, drag:1 });
        }
        // 打到玩家：距离判定（半径 0.3 + 假人 0.45）
        if(Math.hypot(p.x-DUMMY.pos.x, p.z-DUMMY.pos.z) < 0.75){
          floatText(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), '弹中 ×0.8', '#ff8a6a');
          BFX.burst(V3(p.x, p.y, p.z), 8, { tex:'spark', sp:3, s0:.2, a0:.8,
            r:((col>>16)&255)/255, g:((col>>8)&255)/255, b:(col&255)/255 });
          disposeMesh(orb); disposeMesh(halo); this.dead = true; return;
        }
        if(alive > 3){ disposeMesh(orb); disposeMesh(halo); this.dead = true; }
      }});
    }
    BFX.shock(V3(BOSS.pos.x,0,BOSS.pos.z), 2.4, { color:col, dur:.5, a0:.6 });
  }
  },
  charge: {
    id: 'charge', group: 'shared',
    name: '冲撞',
    warm: 0.55,
    mul: 1.3,
    hitR: 1.3,
    vert: false,
    hit: function(){
    const a = aimAngle();
    return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:aimDist()+3.2, w:R(1.3), angle:a };
  },
    run: function(){
    const a = aimAngle();
    const len = aimDist() + 3.2;
    const hit = this.hit();
    const warm = WM(.55);
    BFX.zone({ shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len, w:hit.w, angle:a, dur:warm, color:0xffaa44 });
    bossLean(0.22, warm*1.4);
    // 蓄力：脚下的尘往后卷 + 低吼光
    seq([[0, ()=>{ lightPulse(V3(BOSS.pos.x, 1.2, BOSS.pos.z), 0xffaa44, 1.6, warm); }],
         [warm*0.3, ()=>{ BFX.burst(V3(BOSS.pos.x, .2, BOSS.pos.z), 10, { tex:'smoke', sp:2.4, s0:.6, s1:1.2, a0:.35, grav:1.2, r:.6,g:.55,b:.5 }); }],
         [warm, ()=>{
      const target = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
      speedSmear(0xffaa44, .5);
      bossGlide(target, .34, false);
      shake(.4, .3);
      // 冲锋途中每 0.06s 留一道残影 + 尘
      for(let i=0;i<6;i++){
        delay(i*0.055, ()=>{
          speedSmear(0xffaa44, .3);
          BFX.spr(BOSS.pos.x, .2, BOSS.pos.z, { tex:'smoke', life:.7, s0:.7, s1:1.3, a0:.3, grav:.8, r:.55,g:.5,b:.46 });
        });
      }
      delay(.34, ()=>{
        BFX.wave({ x:BOSS.pos.x, z:BOSS.pos.z, r0:.4, r1:2.2, h:1.4, color:0xffc080, dur:.4 });
        BFX.decal({ x:BOSS.pos.x, z:BOSS.pos.z, tex:'crack', r:2.0, life:3.2, a0:.8 });
        shake(.5, .25);
        settle(hit, '撞飞 ×1.3');
        delay(.45, ()=> bossReset(.5));
      });
    }]]);
  }
  },
  summon: {
    id: 'summon', group: 'shared',
    name: '召唤',
    warm: 0.7,
    mul: 0,
    hitR: 1.6,
    vert: true,
    hit: ()=>({ shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:5 }),
    run: function(){
    const n = N(2) + 1;
    const col = 0xaa66ff;
    for(let i=0;i<n;i++){
      const a = Math.random()*6.283, rr = 3.2 + Math.random()*1.6;
      const p = V3(BOSS.pos.x + Math.cos(a)*rr, 0, BOSS.pos.z + Math.sin(a)*rr);
      BFX.decal({ x:p.x, z:p.z, tex:'rune', r:1.5, life:2.4, color:col, a0:.7 });
      BFX.zone({ shape:'circle', x:p.x, z:p.z, r:1.6, dur:.7, color:col });
      delay(.55 + i*0.12, ()=>{
        BFX.column({ x:p.x, z:p.z, r:.62, h:2.8, color:col, life:.9, up:.10, core:0xe0c8ff });
        BFX.spikes({ x:p.x, z:p.z, n:5, r:.9, h:1.1, color:0x2a1a34, glow:col, dur:1.1, tilt:.5 });
        BFX.burst(V3(p.x, .2, p.z), 14, { tex:'smoke', sp:2.6, s0:.6, s1:1.1, a0:.4, r:.5,g:.4,b:.6 });
        // 小小一只爬出来的代理（不参与判定，只是"确实出来了个东西"）
        const m = new THREE.Mesh(G.sph(0.26, 7), M(0x3a2a44, { r:.9 }));
        m.position.set(p.x, 0, p.z); m.scale.y = .8; scene.add(m);
        addUpdate({ t:0, update(dt){
          this.t += dt;
          const k = Math.min(1, this.t/.35);
          m.position.y = .26*k;
          m.rotation.y += dt*2;
          if(this.t > 2.6){ scene.remove(m); m.material.dispose(); this.dead = true; }
        }});
      });
    }
    BFX.shock(V3(BOSS.pos.x,0,BOSS.pos.z), 4.4, { color:col, dur:.8, a0:.5 });
  }
  },
  rocks: {
    id: 'rocks', group: 'shared',
    name: '石雨',
    warm: 0.9,
    mul: 1.2,
    hitR: 2.2,
    vert: true,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(2.2) }),
    run: function(){
    for(let i=0;i<5;i++){
      const t = V3(DUMMY.pos.x + (Math.random()-.5)*16, 0, DUMMY.pos.z + (Math.random()-.5)*16);
      const r = R(2.2), warm = WM(.9 + i*.12);
      const hit = { shape:'circle', x:t.x, z:t.z, r };
      BFX.zone({ shape:'circle', x:t.x, z:t.z, r, dur:warm, color:0xaa9977 });
      delay(warm, ()=>{
        BFX.boulder({ from:V3(t.x + (Math.random()-.5)*1.6, 9.5, t.z + (Math.random()-.5)*1.6),
          to:t.clone(), r:r*0.42, color:0x6b6560, fire:false, fall:.5, split:3 });
        delay(.52, ()=> settle(hit, '砸中 ×1.2'));
      });
    }
  }
  },
  quake: {
    id: 'quake', group: 'shared',
    name: '地震',
    warm: 0.9,
    mul: 1.6,
    hitR: 8.5,
    vert: false,
    hit: ()=>({ shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(8.5) }),
    run: function(){
    const c = V3(BOSS.pos.x, 0, BOSS.pos.z);
    const r = R(8.5), warm = WM(.9);
    const hit = this.hit();
    // 三层同心环由外向内收：读作"地在压过来"
    for(let i=0;i<3;i++){
      const rr0 = r * (1.15 - i*0.02);
      const m = flatMesh(TEX.ring, 0xffaa66, THREE.AdditiveBlending, .8);
      m.position.set(c.x, .06, c.z);
      const t0 = i*0.16;
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = Math.max(0, Math.min(1, (this.t - t0)/warm));
        const rad = rr0 * (1 - 0.86*k);
        m.scale.set(rad*2, rad*2, 1);
        m.material.opacity = .8 * (k>0 ? (1-Math.pow(k,3)) : 0);
        if(k >= 1){ disposeMesh(m); this.dead = true; }
      }});
    }
    // 预兆：地面细裂纹先亮，Boss 蹲下蓄力
    bossLean(0.10, warm*1.2);
    seq([[warm*0.35, ()=>{ BFX.decal({ x:c.x, z:c.z, tex:'crack', r:r*0.8, life:1.6, a0:.45 }); }],
         [warm, ()=>{
      BFX.shock(c, r*1.1, { color:0xffbb77, dur:.7, a0:1 });
      BFX.wave({ x:c.x, z:c.z, r0:.8, r1:r, h:2.4, color:0xffc080, dur:.55 });
      BFX.wave({ x:c.x, z:c.z, r0:.5, r1:r*0.7, h:1.4, color:0xffe0a0, dur:.4 });
      BFX.burst(V3(c.x, .3, c.z), 40, { tex:'ember', sp:11, s0:.26, a0:.9, grav:9, r:1, g:.62, b:.3 });
      BFX.burst(V3(c.x, .4, c.z), 22, { tex:'smoke', sp:6, s0:1.2, s1:2.6, a0:.45, grav:1.2, drag:1.8, r:.5,g:.46,b:.42 });
      // 放射地裂：6 条
      const yaw0 = Math.random()*6.283;
      for(let i=0;i<6;i++) BFX.decal({ x:c.x, z:c.z, tex:'crack', r:r*(0.55+Math.random()*0.35), life:5.5,
        rot: yaw0 + i/6*6.283 });
      lightPulse(V3(c.x, .8, c.z), 0xffaa55, 4.0, .5);
      shake(1.0, .45);
      settle(hit, '震伤 ×1.6');
    }]]);
  }
  },
  poisonnova: {
    id: 'poisonnova', group: 'shared',
    name: '毒新星',
    warm: 0.5,
    mul: 0.4,
    hitR: 9.2,
    vert: false,
    hit: ()=>({ shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(9.2) }),
    run: function(){
    const c = V3(BOSS.pos.x, 0, BOSS.pos.z);
    lightPulse(c.clone().setY(1), 0x3faa4c, 2.0, .8);
    for(let i=0;i<3;i++){
      const rOut = R(4 + i*2.6);
      const rIn  = R(i === 0 ? 0 : 4 + (i-1)*2.6);
      const dur = 1.05;
      const t0 = i*0.38;
      const m = new THREE.Mesh(new THREE.RingGeometry(rIn + 0.02, rOut, 72, 1),
        new THREE.MeshBasicMaterial({ color:0x4fbb52, transparent:true, opacity:.30,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      m.rotation.x = -Math.PI/2; m.position.set(c.x, .05, c.z); m.renderOrder = 4;
      scene.add(m);
      // 边沿亮线
      const edge = new THREE.Mesh(new THREE.RingGeometry(rOut-0.10, rOut+0.02, 72, 1),
        new THREE.MeshBasicMaterial({ color:0xaaff88, transparent:true, opacity:.85,
          blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, fog:false }));
      edge.rotation.x = -Math.PI/2; edge.position.set(c.x, .07, c.z); edge.renderOrder = 4;
      scene.add(edge);
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = Math.max(0, Math.min(1, (this.t - t0)/dur));
        if(this.t < t0) return;
        m.material.opacity = .30 * (1 - k*k);
        edge.material.opacity = .85 * (1 - k);
        edge.scale.setScalar(1 + k*0.06);
        // 毒泡沿边沿冒出来
        if(Math.random() < dt*30){
          const a = Math.random()*6.283;
          BFX.spr(c.x + Math.cos(a)*rOut*(1-k*0.1), .15, c.z + Math.sin(a)*rOut*(1-k*0.1), {
            tex:'ember', vy:.5+Math.random(), life:.8, s0:.28+Math.random()*.16, a0:.6,
            r:.42, g:.85, b:.32
          });
        }
        if(k >= 1){
          scene.remove(m); m.geometry.dispose(); m.material.dispose();
          scene.remove(edge); edge.geometry.dispose(); edge.material.dispose();
          this.dead = true;
        }
      }});
      // 每层落地时判定 + 留毒斑
      delay(t0 + dur*0.5, ()=>{
        const hit = { shape:'circle', x:c.x, z:c.z, r:rOut };
        if(inHit(hit, DUMMY.pos.x, DUMMY.pos.z)){
          floatText(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), '中毒 ×0.4', '#8fd05a');
        }
        for(let k=0;k<4;k++){
          const a = Math.random()*6.283, rr = rOut*(0.35 + Math.random()*0.6);
          BFX.decal({ x:c.x + Math.cos(a)*rr, z:c.z + Math.sin(a)*rr,
            tex:'poison', r:0.9 + Math.random()*0.9, life:5.5, color:0x6fc04a, a0:.5 });
        }
      });
    }
  }
  },
  frostnova: {
    id: 'frostnova', group: 'shared',
    name: '冰新星',
    warm: 0.8,
    mul: 1.1,
    hitR: 7,
    vert: true,
    hit: ()=>({ shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(7) }),
    run: function(){
    const c = V3(BOSS.pos.x, 0, BOSS.pos.z);
    const r = R(7), warm = WM(.8);
    const hit = this.hit();
    // 前摇：霜纹从脚下铺开 + 空心环涨到 r
    BFX.decal({ x:c.x, z:c.z, tex:'frost', r:r*0.9, life:warm + 1.2, color:0x9ae8ff, a0:.55 });
    const ring = flatMesh(TEX.ring, 0x9ae8ff, THREE.AdditiveBlending, .9);
    ring.position.set(c.x, .07, c.z);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      const rad = r * (0.06 + 0.94*k);
      ring.scale.set(rad*2, rad*2, 1);
      ring.material.opacity = .9 * (0.55 + .45*Math.sin(this.t*14));
      if(Math.random() < dt*26){
        const a = Math.random()*6.283;
        BFX.spr(c.x + Math.cos(a)*rad, .1, c.z + Math.sin(a)*rad, {
          tex:'spark', vy:.9+Math.random(), life:.6, s0:.2, a0:.6, r:.62,g:.92,b:1 });
      }
      if(k >= 1){ disposeMesh(ring); this.dead = true; }
    }});
    delay(warm, ()=>{
      BFX.shock(c, r*1.05, { color:0x9ae8ff, dur:.55, a0:1 });
      BFX.wave({ x:c.x, z:c.z, r0:.5, r1:r, h:2.0, color:0xbdf0ff, dur:.45 });
      // 冰棱：沿圆周一圈，朝外
      for(let i=0;i<10;i++){
        const a = i/10*6.283;
        BFX.spikes({ x:c.x + Math.cos(a)*r*0.72, z:c.z + Math.sin(a)*r*0.72, n:2, r:.5, h:1.5,
          color:0x4a7a96, glow:0x9ae8ff, dur:2.2, tilt:.2, thick:.8 });
      }
      BFX.spikes({ x:c.x, z:c.z, n:8, r:r*0.35, h:2.2, color:0x42708c, glow:0x9ae8ff, dur:2.6, tilt:.15 });
      BFX.burst(V3(c.x, .2, c.z), 26, { tex:'spark', sp:7, s0:.22, a0:.85, grav:3, r:.7,g:.94,b:1 });
      BFX.decal({ x:c.x, z:c.z, tex:'frost', r:r*0.95, life:6, color:0x9ae8ff, a0:.7 });
      lightPulse(V3(c.x, 1.2, c.z), 0x9ae8ff, 3.2, .45);
      shake(.6, .3);
      settle(hit, '冰封 ×1.1');
    });
  }
  },
  fireline: {
    id: 'fireline', group: 'shared',
    name: '火线',
    warm: 0.8,
    mul: 0.9,
    hitR: 2.2,
    vert: true,
    hit: function(){
    const a = aimAngle();
    return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:15, w:R(4.4), angle:a };
  },
    run: function(){
    const a = aimAngle();
    const len = 15, w = R(4.4), warm = WM(.8);
    const hit = this.hit();
    BFX.zone({ shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len, w, angle:a, dur:warm, color:0xff5522 });
    swingArm(0, -0.9, warm*1.4);
    for(let i=0;i<6;i++){
      const d = i*3;
      const p = V3(BOSS.pos.x + Math.sin(a)*d, 0, BOSS.pos.z + Math.cos(a)*d);
      delay(warm + i*0.09, ()=>{
        BFX.column({ x:p.x, z:p.z, r:1.5, h:3.6 + Math.random()*1.2, color:0xff5522, life:1.0, up:.10, core:0xffd8a0 });
        BFX.shock(p, 2.4, { color:0xff7722, dur:.45, a0:.8 });
        BFX.burst(V3(p.x, .3, p.z), 16, { tex:'ember', sp:5, s0:.24, a0:.85, grav:2, r:1, g:.5, b:.22 });
        BFX.decal({ x:p.x, z:p.z, tex:'scorch', r:2.0, life:4.5 });
        shake(.14, .12);
      });
      // 每一段单独判定（形状仍是带上的一个切片，宽度与带同宽）
      delay(warm + i*0.09 + 0.12, ()=>{
        const seg = { shape:'circle', x:p.x, z:p.z, r:w/2 };
        if(inHit(seg, DUMMY.pos.x, DUMMY.pos.z)) floatText(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), '烧灼 ×0.9', '#ff9a5a');
      });
    }
  }
  },
  curse: {
    id: 'curse', group: 'shared',
    name: '诅咒',
    warm: 0.7,
    mul: 0.6,
    hitR: 14,
    vert: true,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:2.2 }),
    run: function(){
    const warm = WM(.7);
    const hit = { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:2.2 };
    markOnPlayer(0xaa66ff, warm, 1.1);
    /* 预告钉：细、暗，刚好看得见它在哪 */
    BFX.spikes({ x:DUMMY.pos.x, z:DUMMY.pos.z, n:1, r:.3, h:2.6, color:0x2e1c40,
      glow:0xaa66ff, dur:warm + .5, thick:.9 });
    delay(warm*0.45, ()=> BFX.decal({ x:DUMMY.pos.x, z:DUMMY.pos.z, tex:'rune', r:1.9,
      life:warm + .7, color:0xaa66ff, a0:.45 }));
    delay(warm, ()=>{
      /* 真实的钉子扎下来：只在脚下这一小块，不跟人、不放光 */
      BFX.spikes({ x:DUMMY.pos.x, z:DUMMY.pos.z, n:1, r:.52, h:3.6, color:0x40265c,
        glow:0xc6a4ff, dur:1.2, thick:1.25 });
      BFX.shock(V3(DUMMY.pos.x, 0, DUMMY.pos.z), 2.6, { color:0xaa66ff, dur:.4, a0:.75 });
      BFX.burst(V3(DUMMY.pos.x, .4, DUMMY.pos.z), 14, { tex:'soft', sp:2.4, s0:.26, a0:.7, grav:1.6, r:.7,g:.45,b:1 });
      floatText(V3(DUMMY.pos.x, 1.4, DUMMY.pos.z), inHit(hit,DUMMY.pos.x,DUMMY.pos.z) ? '诅咒 ×0.6' : '闪开', '#c9a0ff');
      hurtVignette();
    });
  }
  },
  meteor: {
    id: 'meteor', group: 'shared',
    name: '陨石',
    warm: 1.1,
    mul: 1.4,
    hitR: 3.4,
    vert: true,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(3.4) }),
    run: function(){
    for(let i=0;i<4;i++){
      const t = V3(DUMMY.pos.x + (Math.random()-.5)*14, 0, DUMMY.pos.z + (Math.random()-.5)*14);
      const r = R(3.4), warm = WM(1.1);
      const hit = { shape:'circle', x:t.x, z:t.z, r };
      BFX.zone({ shape:'circle', x:t.x, z:t.z, r, dur:warm, color:0xff4422 });
      delay(warm, ()=>{
        BFX.boulder({ from:V3(t.x + 3.2, 12, t.z + 3.2), to:t.clone(), r:r*0.30,
          color:0x4a3028, glow:0xff6a2c, fire:true, fall:.55, split:3 });
        delay(.56, ()=>{
          BFX.column({ x:t.x, z:t.z, r:r*0.42, h:4.6, color:0xff5522, life:1.0, up:.1, core:0xffd8a0 });
          BFX.decal({ x:t.x, z:t.z, tex:'scorch', r:r*0.9, life:5 });
          shake(.35, .25);
          settle(hit, '陨击 ×1.4');
        });
      });
    }
  }
  },
  swordrain: {
    id: 'swordrain', group: 'shared',
    name: '剑雨',
    warm: 0.8,
    mul: 0.9,
    hitR: 2.4,
    vert: true,
    hit: ()=>({ shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(2.4) }),
    run: function(){
    for(let i=0;i<10;i++){
      const t = V3(DUMMY.pos.x + (Math.random()-.5)*20, 0, DUMMY.pos.z + (Math.random()-.5)*20);
      const r = R(2.4), warm = WM(.8 + i*.1);
      const hit = { shape:'circle', x:t.x, z:t.z, r };
      BFX.zone({ shape:'circle', x:t.x, z:t.z, r, dur:warm, color:0xffd166 });
      delay(warm, ()=>{
        BFX.blade({ from:V3(t.x + 1.6, 11, t.z + 1.6), to:V3(t.x, 0, t.z),
          s:0.9, color:0xffe6a8, fall:.30, stick:1.2 });
        delay(.32, ()=> settle(hit, '剑击 ×0.9'));
      });
    }
  }
  },
  bamboo: {
    id: 'bamboo', group: 'sign',
    name: '万竹穿心',
    warm: 1.1,
    mul: 1.7,
    hitR: 8,
    kind: 'sector',
    vert: true,
    hit: function(){ return { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:R(8), angle:aimAngle(), span:Math.PI*0.62 }; },
    run: function(){
    const a = aimAngle(), span = Math.PI*0.62, r = R(8), warm = WM(1.1);
    const hit = this.hit();
    BFX.zone({ shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r, angle:a, span, dur:warm, color:0x88c060 });
    bossLean(0.12, warm*1.6);
    // 三排竹子，由近及远依次破土
    for(let row=0; row<3; row++){
      const rr = r*(0.28 + row*0.34);
      delay(warm*0.45 + row*0.14, ()=>{
        const cnt = 7 + row*2;
        for(let i=0;i<cnt;i++){
          const aa = a - span/2 + span*(i/(cnt-1)) + (Math.random()-.5)*0.06;
          const px = BOSS.pos.x + Math.sin(aa)*rr, pz = BOSS.pos.z + Math.cos(aa)*rr;
          BFX.spikes({ x:px, z:pz, n:1, r:.2, h:2.6 + Math.random()*1.4, color:0x33481f,
            glow:0x5a8a2a, dur:2.4 - row*0.2, tilt:.36, thick:1.15 });
          BFX.burst(V3(px, .1, pz), 3, { tex:'smoke', sp:1.6, s0:.35, s1:.8, a0:.32, grav:-1.2, r:.35,g:.45,b:.28 });
        }
        shake(.2 + row*0.08, .18);
      });
    }
    delay(warm, ()=>{ BFX.decal({ x:BOSS.pos.x, z:BOSS.pos.z, tex:'crack', r:r*0.8, life:4, a0:.5 }); });
    delay(warm + 0.5, ()=> settle(hit, '穿心 ×1.7'));
  }
  },
  blooddive: {
    id: 'blooddive', group: 'sign',
    name: '血月俯冲',
    warm: 1.2,
    mul: 1.8,
    hitR: 2.2,
    kind: 'rect',
    vert: false,
    hit: function(){ const a = aimAngle(); return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:aimDist()+2.5, w:R(2.2), angle:a }; },
    run: function(){
    const a = aimAngle(), hit = this.hit(), warm = WM(1.2);
    // 起手：头上血月
    const moon = billMesh(TEX.soft, 0xa01828, .55);
    moon.scale.setScalar(4.2);
    moon.position.set(BOSS.pos.x, 5.2, BOSS.pos.z);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      moon.position.y = 5.2 + k*0.6;
      moon.material.opacity = .55 * (1 - Math.max(0, (k-.8)/.2));
      if(k >= 1){ disposeMesh(moon); this.dead = true; }
    }});
    lightPulse(V3(BOSS.pos.x, 3, BOSS.pos.z), 0xff2a3a, 2.4, warm);
    // 飞起
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      /* BOSS.g 必须**逐帧**取：这一招要飞 1.2 秒，首领可能在第 0.4 秒
       * 就被打死（actor.group 置空）→ 只在创建时判一次，后面这行就是
       * `null.position`。创建时守卫是假守卫。 */
      const g = BOSS.g;
      if(!g){ this.dead = true; return; }
      g.position.y = Math.sin(k*Math.PI*0.5) * 1.5;
      if(k >= 1) this.dead = true;
    }});
    // 地面阴影划过（矩形带预警）
    BFX.zone({ shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:hit.len, w:hit.w, angle:a, dur:warm, color:0xff2a3a });
    delay(warm*0.55, ()=>{
      // 血雨
      for(let i=0;i<18;i++){
        const d = Math.random()*hit.len;
        const px = BOSS.pos.x + Math.sin(a)*d + (Math.random()-.5)*hit.w;
        const pz = BOSS.pos.z + Math.cos(a)*d + (Math.random()-.5)*hit.w;
        BFX.spr(px, 6 + Math.random()*3, pz, { tex:'ember', vy:-7, life:.8, s0:.22, a0:.8, r:.85,g:.12,b:.18 });
      }
    });
    delay(warm, ()=>{
      const target = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
      speedSmear(0xff2a3a, .45);
      bossGlide(target, .26, false);
      if(BOSS.g) BOSS.g.position.y = 0;
      shake(.75, .35);
      BFX.shock(target, hit.w*2.2, { color:0xff3040, dur:.6, a0:1 });
      BFX.wave({ x:target.x, z:target.z, r0:.5, r1:hit.w*2.0, h:2.2, color:0xff4050, dur:.42 });
      BFX.burst(V3(target.x, .5, target.z), 36, { tex:'ember', sp:9, s0:.24, a0:.95, grav:7, r:.9,g:.14,b:.2 });
      BFX.decal({ x:target.x, z:target.z, tex:'crack', r:3.2, life:4.5 });
      BFX.decal({ x:target.x, z:target.z, tex:'poison', r:2.4, life:4, color:0x8a1020, a0:.5 });
      settle(hit, '撕咬 ×1.8');
      // 二次血蝠群
      delay(.3, ()=>{
        for(let i=0;i<10;i++){
          const ang = Math.random()*6.283, rr = 1 + Math.random()*3;
          BFX.spr(target.x + Math.cos(ang)*rr, .3, target.z + Math.sin(ang)*rr,
            { tex:'ember', vy:1.8, life:.9, s0:.3, a0:.7, r:.75,g:.1,b:.16, drag:1.2 });
        }
        delay(.5, ()=> bossReset(.55));
      });
    });
  }
  },
  warstomp: {
    id: 'warstomp', group: 'sign',
    name: '裂地战吼',
    warm: 0.9,
    mul: 1.5,
    hitR: 7.5,
    kind: 'sector',
    vert: false,
    hit: function(){ return { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:R(7.5), angle:aimAngle(), span:Math.PI*0.9 }; },
    run: function(){
    const a = aimAngle(), r = R(7.5), hit = this.hit(), warm = WM(.9);
    BFX.zone({ shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r, angle:a, span:Math.PI*0.9, dur:warm, color:0xffb04a });
    swingArm(0, -2.0, warm*1.5);
    swingArm(1, -2.0, warm*1.5);
    delay(warm*0.7, ()=> lightPulse(V3(BOSS.pos.x, 1.6, BOSS.pos.z), 0xffb04a, 3.2, .5));
    for(let i=0;i<3;i++){
      delay(warm + i*0.14, ()=>{
        BFX.arcSlash({ x:BOSS.pos.x, z:BOSS.pos.z, y:1.0 + i*0.35, r:r*(0.55 + i*0.22),
          span:Math.PI*0.9, color:0xffcf80, yaw:a, tiltX:Math.PI/2, life:.42 });
        BFX.wave({ x:BOSS.pos.x, z:BOSS.pos.z, r0:1.2, r1:r*(0.6+i*0.2), h:1.6 + i*0.5, color:0xffb04a, dur:.5 });
        // 扇形边缘的碎石
        for(let k=0;k<10;k++){
          const aa = a - 0.45 + Math.random()*0.9;
          const rr = r*(0.3 + Math.random()*0.65);
          BFX.spr(BOSS.pos.x + Math.sin(aa)*rr, .1, BOSS.pos.z + Math.cos(aa)*rr,
            { tex:'spark', vy: 2.4 + Math.random()*3, life:.7, s0:.18, a0:.7, grav:-9, r:.8,g:.7,b:.5 });
        }
        shake(.4 + i*0.12, .26);
      });
    }
    delay(warm + .5, ()=>{
      BFX.decal({ x:BOSS.pos.x, z:BOSS.pos.z, tex:'crack', r:r*0.8, life:4.5, a0:.6 });
      settle(hit, '震碎 ×1.5');
    });
  }
  },
  stonespear: {
    id: 'stonespear', group: 'sign',
    name: '岩枪天降',
    warm: 1.3,
    mul: 1.6,
    hitR: 6.5,
    kind: 'circle',
    vert: true,
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(6.5) }; },
    run: function(){
    const c = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const r = R(6.5), warm = WM(1.3), hit = this.hit();
    BFX.zone({ shape:'circle', x:c.x, z:c.z, r, dur:warm, color:0xbfae90 });
    BFX.decal({ x:c.x, z:c.z, tex:'crack', r:r*0.9, life:warm + 2.5, a0:.4 });
    const n = N(10);
    for(let i=0;i<n;i++){
      const ang = i/n*6.283 + Math.random()*0.3;
      const rr = r*(0.25 + Math.random()*0.72);
      const p = V3(c.x + Math.cos(ang)*rr, 0, c.z + Math.sin(ang)*rr);
      delay(warm*0.5 + i*0.05, ()=>{
        BFX.boulder({ from:V3(p.x, 12, p.z), to:p.clone(), r:.42 + Math.random()*.22,
          color:0x7a7068, fire:false, fall:.42, split:2 });
      });
      delay(warm*0.5 + i*0.05 + .44, ()=>{
        // 落点留下石笋
        BFX.spikes({ x:p.x, z:p.z, n:2, r:.35, h:1.5 + Math.random()*.7, color:0x5c554e,
          glow:0x000000, dur:2.6, tilt:.22, thick:1.2 });
      });
    }
    delay(warm*0.5 + n*0.05 + .5, ()=>{
      BFX.wave({ x:c.x, z:c.z, r0:1, r1:r, h:2.4, color:0xd8c8a8, dur:.5 });
      BFX.burst(V3(c.x, .2, c.z), 26, { tex:'smoke', sp:5, s0:1.0, s1:2.2, a0:.4, grav:.6, drag:2, r:.5,g:.47,b:.44 });
      shake(.7, .4);
      settle(hit, '岩枪 ×1.6');
    });
  }
  },
  venomfang: {
    id: 'venomfang', group: 'sign',
    name: '毒牙缠咬',
    warm: 1,
    mul: 1.4,
    hitR: 1.8,
    kind: 'rect',
    vert: true,
    hit: function(){ const a = aimAngle(); return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:aimDist()+3, w:R(3.6), angle:a }; },
    run: function(){
    const a = aimAngle(), hit = this.hit(), warm = WM(1.0);
    const w = R(3.6), len = aimDist() + 3;
    BFX.zone({ shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len, w, angle:a, dur:warm, color:0x6fd050 });
    // S 形：正弦偏移
    const pts = [];
    const steps = 9;
    for(let i=0;i<=steps;i++){
      const d = len * i/steps;
      const off = Math.sin(i/steps*Math.PI*2.2) * w*0.34;
      pts.push(V3(BOSS.pos.x + Math.sin(a)*d + Math.cos(a)*off, 0,
                  BOSS.pos.z + Math.cos(a)*d - Math.sin(a)*off));
    }
    for(let i=1;i<pts.length;i++){
      const p0 = pts[i-1], p1 = pts[i];
      delay(warm*0.35 + i*0.055, ()=>{
        // 毒迹贴花连成线
        BFX.decal({ x:p1.x, z:p1.z, tex:'poison', r:1.05, life:5, color:0x6fd050, a0:.55 });
        BFX.spikes({ x:p1.x, z:p1.z, n:3, r:.5, h:1.1 + Math.random()*.6, color:0x2c3a1e,
          glow:0x5aa02a, dur:2.0, tilt:.55, thick:.9 });
        for(let k=0;k<6;k++){
          BFX.spr(p1.x + (Math.random()-.5)*1.2, .1, p1.z + (Math.random()-.5)*1.2,
            { tex:'ember', vy:1.4 + Math.random()*1.6, life:.9, s0:.24, a0:.7, drag:1.2, r:.45,g:.85,b:.32 });
        }
        // 蛇头：一小截管状身体掠过
        if(i === pts.length-1){
          BFX.ribbon({ from:p0, to:p1, color:0x7fe060, life:.5, thick:.16, sag:.1, wobble:.1 });
        }
      });
    }
    delay(warm + 0.6, ()=>{
      BFX.burst(V3(DUMMY.pos.x, .3, DUMMY.pos.z), 22, { tex:'ember', sp:4, s0:.24, a0:.8, grav:2, r:.45,g:.9,b:.34 });
      lightPulse(V3(DUMMY.pos.x, 1, DUMMY.pos.z), 0x5acc4a, 2.0, .4);
      settle(hit, '毒牙 ×1.4');
    });
  }
  },
  soulchain: {
    id: 'soulchain', group: 'sign',
    name: '万魂缚',
    warm: 1,
    mul: 1.3,
    hitR: 9,
    kind: 'ring',
    vert: true,
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(9) }; },
    run: function(){
    const warm = WM(1.0);
    const hit = this.hit();
    markOnPlayer(0xb48cff, warm + .35, 1.6);
    // 三条魂丝，从 Boss 的三个不同高度连过来
    [1.2, 2.0, 2.7].forEach((y, i)=>{
      delay(i*0.12, ()=> BFX.ribbon({
        from:V3(BOSS.pos.x, y, BOSS.pos.z), to:V3(DUMMY.pos.x, 0.6 + i*0.35, DUMMY.pos.z),
        color:0xb48cff, life: warm + .4, thick:.05, sag:.5 + i*0.2, wobble:.3
      }));
    });
    // 收缩环：从 R9 收到 1，收到中心才结算
    const ring = flatMesh(TEX.ring, 0xb48cff, THREE.AdditiveBlending, .85);
    ring.position.set(DUMMY.pos.x, .08, DUMMY.pos.z);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      const rad = R(9) * (1 - 0.92*k);
      ring.scale.set(rad*2, rad*2, 1);
      ring.material.opacity = .85*(0.5 + .5*Math.sin(this.t*11));
      if(k >= 1){ disposeMesh(ring); this.dead = true; }
    }});
    // 魂环从脚下升起
    for(let i=0;i<4;i++){
      delay(warm*0.4 + i*0.1, ()=>{
        BFX.column({ x:DUMMY.pos.x + (Math.random()-.5)*1.6, z:DUMMY.pos.z + (Math.random()-.5)*1.6,
          r:.30, h:2.4, color:0xb48cff, life:.9, up:.2, core:0xe8d8ff });
      });
    }
    delay(warm, ()=>{
      BFX.burst(V3(DUMMY.pos.x, 1.0, DUMMY.pos.z), 30, { tex:'soft', sp:3.4, s0:.3, a0:.85, grav:1.2, r:.7,g:.5,b:1 });
      BFX.shock(V3(DUMMY.pos.x,0,DUMMY.pos.z), 4.5, { color:0xb48cff, dur:.6, a0:.9 });
      lightPulse(V3(DUMMY.pos.x, 1.2, DUMMY.pos.z), 0xb48cff, 3.0, .5);
      shake(.45, .3);
      settle(hit, '缚魂 ×1.3');
    });
  }
  },
  flamecleave: {
    id: 'flamecleave', group: 'sign',
    name: '焚天斩',
    warm: 1,
    mul: 1.9,
    hitR: 7.5,
    kind: 'sector',
    vert: false,
    hit: function(){ return { shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r:R(7.5), angle:aimAngle(), span:Math.PI*0.7 }; },
    run: function(){
    const a = aimAngle(), r = R(7.5), hit = this.hit(), warm = WM(1.0);
    const span = Math.PI*0.7;
    BFX.zone({ shape:'sector', x:BOSS.pos.x, z:BOSS.pos.z, r, angle:a, span, dur:warm, color:0xff4a18 });
    swingArm(0, -2.3, warm*1.6);
    // 刀刃蓄火：一条暗红的热线先在弧上亮起来（同一根线，斩的时候才亮到全白）
    delay(warm*0.6, ()=>{
      const R0 = r*0.97, A0 = V3(BOSS.pos.x + Math.sin(a - span/2)*R0, 1.15, BOSS.pos.z + Math.cos(a - span/2)*R0);
      const B0 = V3(BOSS.pos.x + Math.sin(a + span/2)*R0, 1.15, BOSS.pos.z + Math.cos(a + span/2)*R0);
      BFX.ribbon({ from:A0, to:B0, color:0xff8a44, life:.36, thick:.08, sag:0, wobble:0 });
      lightPulse(V3(BOSS.pos.x, 1.8, BOSS.pos.z), 0xff5a20, 4.0, .5);
      shake(.6, .3);
    });
    delay(warm, ()=>{
      /* 一刀：刀路**沿弧**划过去，不是一条直线拉过去。
       * 上一版用 `arcSlash`（竖着的月牙，弧心还偏 90°），再上一版用 9 根火柱，
       * 都读不出"斩"。这里把弧切成 14 段用 `ribbon` 拼，从一端依次点亮 ——
       * 一刀从左划到右，前后差 0.16 秒，看得见方向。 */
      const N = 16, R1 = r*0.97;
      const pts = [];
      for(let i=0;i<=N;i++){
        const aa = a - span/2 + span*(i/N);
        pts.push(V3(BOSS.pos.x + Math.sin(aa)*R1, 1.15, BOSS.pos.z + Math.cos(aa)*R1));
      }
      /* 用 `trail` 而不是 16 段 `ribbon`：ribbon 两头是圆帽，
       * 拼起来是一串香肠；trail 是一条连续的带子，宽度还能沿线收（尾巴细、头粗）。 */
      const tr = BFX.trail({ color:0xffc078, w:.62, y:1.15, opacity:.95, max:24, tex:TEX.soft });
      for(let i=0;i<=N;i++) delay(i*0.010, ()=> tr.push(pts[i].x, pts[i].z, 1.15));
      delay(N*0.010 + .03, ()=> tr.fade(.26));
      /* 斩痕：**地上那条还在发红的裂缝**。用第二条 trail 贴地画，慢慢冷掉。
       * 不用 `decal`：这张地面近黑，`crack` 贴图的暗部在加法混合下就是没画；
       * `scorch` 走 NormalBlending 又变成"地上一个洞"。发红的线只有 trail 画得出。 */
      const scar = BFX.trail({ color:0xff5a1e, w:.5, y:.05, opacity:.85, max:24, tex:TEX.soft });
      for(let i=0;i<=N;i++) scar.push(pts[i].x, pts[i].z, .05);
      scar.fade(3.6);
      /* 火星沿弧溅一下（只在四段上，够读） */
      for(let i=0;i<=N;i+=5){
        const p = pts[i];
        delay(i*0.010, ()=> BFX.burst(V3(p.x, .3, p.z), 8,
          { tex:'ember', sp:3.4, s0:.22, a0:.8, grav:3, r:1,g:.5,b:.2 }));
      }
      BFX.shock(V3(BOSS.pos.x, 0, BOSS.pos.z), r*0.5, { color:0xff8844, dur:.35, a0:.6 });
      shake(.9, .34);
      settle(hit, '斩 ×1.9');
    });
  }
  },
  glacial: {
    id: 'glacial', group: 'sign',
    name: '千里冰封',
    warm: 1.1,
    mul: 1.5,
    hitR: 8,
    kind: 'ring',
    vert: true,
    hit: function(){ return { shape:'circle', x:BOSS.pos.x, z:BOSS.pos.z, r:R(8) }; },
    run: function(){
    const c = V3(BOSS.pos.x, 0, BOSS.pos.z);
    const r = R(8), warm = WM(1.1), hit = this.hit();
    BFX.decal({ x:c.x, z:c.z, tex:'frost', r:r*0.55, life:warm + 3, color:0x9ae8ff, a0:.7 });
    lightPulse(c.clone().setY(1.4), 0x9ae8ff, 3.0, warm);
    // 六角大霜纹（贴花，六次旋转叠出来）
    for(let i=0;i<6;i++){
      delay(warm*0.2 + i*0.07, ()=>{
        BFX.decal({ x:c.x, z:c.z, tex:'frost', r:r*(0.35 + i*0.10), life:5.5,
          color:0x9ae8ff, a0:.35, rot: i*Math.PI/6 + Math.random()*0.1 });
      });
    }
    // 中心冰柱
    delay(warm*0.55, ()=>{
      BFX.spikes({ x:c.x, z:c.z, n:9, r:r*0.22, h:3.0, color:0x3f6c88, glow:0x9ae8ff, dur:3, tilt:.1, thick:1.3 });
    });
    delay(warm, ()=>{
      BFX.shock(c, r*1.05, { color:0xcdf2ff, dur:.7, a0:1 });
      BFX.wave({ x:c.x, z:c.z, r0:.6, r1:r, h:2.6, color:0xbdf0ff, dur:.55 });
      // 外圈冰棱，朝外
      const m = N(12);
      for(let i=0;i<m;i++){
        const a = i/m*6.283;
        const p = V3(c.x + Math.cos(a)*r*0.62, 0, c.z + Math.sin(a)*r*0.62);
        delay(i*0.03, ()=> BFX.spikes({ x:p.x, z:p.z, n:2, r:.5, h:2.0 + Math.random()*1.2,
          color:0x3f6c88, glow:0xaee8ff, dur:2.8, tilt:.18, thick:1 }));
      }
      BFX.burst(V3(c.x, .4, c.z), 34, { tex:'spark', sp:8, s0:.22, a0:.9, grav:3.2, r:.7,g:.94,b:1 });
      BFX.decal({ x:c.x, z:c.z, tex:'frost', r:r, life:7, color:0x9ae8ff, a0:.6 });
      shake(.75, .4);
      settle(hit, '冰封 ×1.5');
    });
  }
  },
  web: {
    id: 'web', group: 'sign',
    name: '蛛网天罗',
    warm: 1,
    mul: 1.3,
    hitR: 5,
    kind: 'circle',
    vert: true,
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(5) }; },
    run: function(){
    const c = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const r = R(5), warm = WM(1.0), hit = this.hit();
    BFX.zone({ shape:'circle', x:c.x, z:c.z, r, dur:warm, color:0xa0e060 });
    BFX.decal({ x:c.x, z:c.z, tex:'web', r:r*0.95, life:6, color:0xd8ffd0, a0:.45 });
    // 八条丝从 Boss 射到网上
    for(let i=0;i<8;i++){
      const a = i/8*6.283;
      delay(i*0.05, ()=>{
        BFX.ribbon({ from:V3(BOSS.pos.x, 1.4 + Math.random(), BOSS.pos.z),
          to:V3(c.x + Math.cos(a)*r*0.8, .15, c.z + Math.sin(a)*r*0.8),
          color:0xd8ffd0, life:.8, thick:.035, sag:.3, wobble:.15 });
      });
    }
    // 网收束
    delay(warm*0.6, ()=>{
      const web = flatMesh(TEX.web, 0xd8ffd0, THREE.AdditiveBlending, .75);
      web.position.set(c.x, .08, c.z); web.scale.setScalar(r*2);
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = Math.min(1, this.t/0.5);
        web.scale.setScalar(r*2*(1 - 0.55*k));
        web.rotation.z += dt*0.6;
        web.material.opacity = .75*(1-k*0.4);
        if(k >= 1){ disposeMesh(web); this.dead = true; }
      }});
    });
    delay(warm, ()=>{
      BFX.spikes({ x:c.x, z:c.z, n:6, r:1.1, h:1.4, color:0x3a2240, glow:0x9fd050, dur:2.2, tilt:.5, thick:.9 });
      BFX.burst(V3(c.x, .2, c.z), 26, { tex:'ember', sp:4.4, s0:.26, a0:.75, grav:1.6, r:.6,g:.9,b:.36 });
      lightPulse(V3(c.x, 1, c.z), 0x9fd050, 2.4, .45);
      shake(.4, .3);
      settle(hit, '缠绕 ×1.3');
      // 卵囊：三个小囊
      for(let i=0;i<3;i++){
        const a = i/3*6.283 + 0.5;
        const p = V3(c.x + Math.cos(a)*2.2, 0, c.z + Math.sin(a)*2.2);
        const egg = new THREE.Mesh(G.sph(0.34, 8), M(0x8a6f9a, { r:.75 }));
        egg.position.set(p.x, .3, p.z); egg.scale.set(1, 1.15, 1); scene.add(egg);
        addUpdate({ t:0, update(dt){
          this.t += dt;
          egg.position.y = .3 + Math.sin(this.t*3)*0.04;
          if(this.t > 3.2){ scene.remove(egg); egg.material.dispose(); this.dead = true; }
        }});
      }
    });
  }
  },
  tide: {
    id: 'tide', group: 'sign',
    name: '忘川潮',
    warm: 1.1,
    mul: 1.7,
    hitR: 8,
    kind: 'rect',
    vert: true,
    hit: function(){ const a = aimAngle(); return { shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:16, w:R(8.2), angle:a }; },
    run: function(){
    const a = aimAngle(), hit = this.hit(), warm = WM(1.1);
    BFX.zone({ shape:'rect', x:BOSS.pos.x, z:BOSS.pos.z, len:16, w:hit.w, angle:a, dur:warm, color:0x5f8ac0 });
    // 地面先湿（冥河）
    BFX.decal({ x:BOSS.pos.x + Math.sin(a)*2, z:BOSS.pos.z + Math.cos(a)*2, tex:'poison',
      r:3.6, life:6, color:0x3a5a8a, a0:.45 });
    const cast = (off, scale) => {
      const p = V3(BOSS.pos.x + Math.sin(a)*off, 0, BOSS.pos.z + Math.cos(a)*off);
      BFX.wave({ x:p.x, z:p.z, r0:.6, r1:1.6*scale, h:3.0*scale, color:0x8fc0ff, dur:.9, thick:1 });
      // 潮头：一排立起来的水柱
      for(let i=0;i<7;i++){
        const aa = a - 0.5 + i*0.166;
        const q = V3(p.x + Math.sin(aa)*2.4*scale, 0, p.z + Math.cos(aa)*2.4*scale);
        BFX.column({ x:q.x, z:q.z, r:.5, h:2.2*scale, color:0x6fa0d8, life:.75, up:.10, core:0xd8ecff });
      }
      BFX.burst(V3(p.x, .3, p.z), 20, { tex:'smoke', sp:4, s0:1.1, s1:2.0, a0:.4, grav:.8, drag:2, r:.5,g:.6,b:.75 });
      shake(.5, .35);
    };
    delay(warm, ()=> cast(1.5, 1.0));
    delay(warm + 0.75, ()=>{
      // 第二波推到玩家脚下
      const target = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
      bossGlide(target, .5, false);
      cast(1.0, 1.25);
      BFX.shock(target, 6.5, { color:0x8fc0ff, dur:.7, a0:.9 });
      lightPulse(V3(target.x, 1.2, target.z), 0x6f9fd8, 3.4, .5);
      delay(.15, ()=> settle(hit, '潮涌 ×1.7'));
      delay(.7, ()=> bossReset(.6));
    });
  }
  },
  bladering: {
    id: 'bladering', group: 'sign',
    name: '万剑归宗',
    warm: 1.2,
    mul: 2,
    hitR: 6,
    kind: 'ring',
    vert: true,
    hit: function(){ return { shape:'circle', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(6) }; },
    run: function(){
    const c = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const r = R(6), warm = WM(1.2), hit = this.hit();
    BFX.zone({ shape:'circle', x:c.x, z:c.z, r, dur:warm, color:0xffe6a0 });
    const n = N(18);
    // 先一圈剑影悬在头顶，剑尖朝下 —— 读作"剑阵已经布好"
    for(let i=0;i<n;i++){
      const a = i/n*6.283;
      const px = c.x + Math.cos(a)*r*0.92, pz = c.z + Math.sin(a)*r*0.92;
      delay(warm*0.25 + i*0.022, ()=>{
        BFX.blade({ from:V3(px, 9 + Math.random()*2, pz), to:V3(px, 0, pz), s:.72,
          color:0xffe6a8, fall:.34, stick:1.6 });
        BFX.burst(V3(px, .1, pz), 4, { tex:'spark', sp:1.8, s0:.16, a0:.6, r:1,g:.94,b:.7 });
      });
    }
    delay(warm, ()=>{
      // 中央剑气柱
      BFX.column({ x:c.x, z:c.z, r:1.5, h:7.5, color:0xfff0c0, life:1.4, up:.10, core:0xffffff });
      BFX.shock(c, r*1.15, { color:0xffe6a0, dur:.7, a0:1 });
      BFX.wave({ x:c.x, z:c.z, r0:.5, r1:r, h:2.4, color:0xfff0c0, dur:.5 });
      // 剑气外溢：一圈光的碎片
      for(let i=0;i<24;i++){
        const a = i/24*6.283;
        BFX.spr(c.x + Math.cos(a)*r*0.7, .2 + Math.random()*.6, c.z + Math.sin(a)*r*0.7,
          { tex:'spark', vy:1.2 + Math.random()*2.6, life:.9, s0:.2, a0:.8, grav:-2, r:1,g:.94,b:.72 });
      }
      lightPulse(V3(c.x, 2, c.z), 0xffe6a0, 4.2, .55);
      shake(.8, .4);
      settle(hit, '万剑 ×2.0');
      // 收束：剑影向中心倒
      delay(.35, ()=>{
        for(let i=0;i<10;i++){
          const a = i/10*6.283;
          BFX.ribbon({ from:V3(c.x + Math.cos(a)*r*0.85, .1, c.z + Math.sin(a)*r*0.85),
            to:V3(c.x, 1.2, c.z), color:0xfff0c0, life:.5, thick:.03, sag:.05, wobble:.05 });
        }
      });
    });
  }
  },
  formless: {
    id: 'formless', group: 'sign',
    name: '无相劫',
    warm: 1.4,
    mul: 2.2,
    hitR: 9.5,
    kind: 'ring',
    vert: true,
    hit: function(){ return { shape:'ring', x:DUMMY.pos.x, z:DUMMY.pos.z, r:R(9.5), r0:R(2.2) }; },
    run: function(){
    const c = V3(DUMMY.pos.x, 0, DUMMY.pos.z);
    const r = R(9.5), r0 = R(2.2), warm = WM(1.4), hit = this.hit();
    // 法阵：三层旋转的地纹
    for(let i=0;i<3;i++){
      const m = flatMesh(TEX.rune, i===1 ? 0xff3a5a : 0xb060ff, THREE.AdditiveBlending, .6);
      m.position.set(c.x, .05 + i*0.004, c.z);
      const s0 = r*2*(0.5 + i*0.25);
      m.scale.setScalar(s0*0.3);
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = Math.min(1, this.t/warm);
        m.scale.setScalar(s0*(0.3 + 0.7*k));
        m.rotation.z += dt*(i%2 ? -0.5 : 0.8);
        m.material.opacity = .6*k;
        if(k >= 1){ m.material.opacity = .6*Math.max(0, 1-(this.t-warm)/0.6);
          if(this.t > warm + 0.6){ disposeMesh(m); this.dead = true; } }
      }});
    }
    // 六根柱沿圆周升起
    for(let i=0;i<6;i++){
      const a = i/6*6.283 + 0.3;
      const p = V3(c.x + Math.cos(a)*r*0.72, 0, c.z + Math.sin(a)*r*0.72);
      delay(warm*0.3 + i*0.09, ()=>{
        BFX.column({ x:p.x, z:p.z, r:.85, h:6.5, color:0x8a2acc, life:1.2, up:.18, core:0xff6ab0 });
        BFX.spikes({ x:p.x, z:p.z, n:4, r:.7, h:1.8, color:0x1a0a22, glow:0xb060ff, dur:2.4, tilt:.2 });
      });
    }
    // 天象：头顶压下来的暗球
    const orb = billMesh(TEX.soft, 0x2a0a34, .8, THREE.NormalBlending);
    orb.scale.setScalar(9);
    orb.position.set(c.x, 9, c.z);
    addUpdate({ t:0, update(dt){
      this.t += dt;
      const k = Math.min(1, this.t/warm);
      orb.position.y = 9 - k*4;
      orb.material.opacity = .8*k;
      if(k >= 1){ orb.material.opacity = .8*Math.max(0, 1-(this.t-warm)/0.4);
        if(this.t > warm + 0.4){ disposeMesh(orb); this.dead = true; } }
    }});
    delay(warm, ()=>{
      // 塌缩：外环向内收，内环炸开
      const outer = flatMesh(TEX.ring, 0xff3a5a, THREE.AdditiveBlending, 1);
      outer.position.set(c.x, .07, c.z);
      const inner = flatMesh(TEX.ring, 0xffd0a0, THREE.AdditiveBlending, 1);
      inner.position.set(c.x, .08, c.z);
      addUpdate({ t:0, update(dt){
        this.t += dt;
        const k = Math.min(1, this.t/0.55);
        const ro = r*(1 - 0.75*k), ri = r0*(1 + 2.6*k);
        outer.scale.set(ro*2, ro*2, 1);
        inner.scale.set(ri*2, ri*2, 1);
        outer.material.opacity = 1-k; inner.material.opacity = 1-k;
        if(k >= 1){ disposeMesh(outer); disposeMesh(inner); this.dead = true; }
      }});
      BFX.wave({ x:c.x, z:c.z, r0:r0, r1:r, h:3.2, color:0xff3a5a, dur:.6 });
      BFX.burst(V3(c.x, 1.0, c.z), 60, { tex:'ember', sp:12, s0:.3, a0:.95, grav:5, r:.75,g:.25,b:.5 });
      BFX.burst(V3(c.x, .4, c.z), 30, { tex:'smoke', sp:6, s0:1.4, s1:3.2, a0:.5, grav:.8, drag:1.6, r:.3,g:.1,b:.4 });
      // 焦痕：一圈
      for(let i=0;i<8;i++){
        const a = i/8*6.283;
        BFX.decal({ x:c.x + Math.cos(a)*r*0.5, z:c.z + Math.sin(a)*r*0.5, tex:'scorch',
          r:2.4, life:6, a0:.85 });
      }
      flashScreen(.35, .5);
      lightPulse(V3(c.x, 1.6, c.z), 0xff3a5a, 5.0, .6);
      shake(1.1, .55);
      settle(hit, '无相 ×2.2');
    });
  }
  },
  nt_treeking: {
    id: 'nt_treeking', group: 'native',
    name: '绞根',
    warm: 1,
    mul: 0.5,
    tag: '本命 · 藤蔓一路追着你爬',
    kind: '藤蔓（会生长的带子）',
    native: 'treeking',
    vert: false,
    dmg: 'ramp · 绑得越久越疼',
    answer: '一直跑，不能停',
    counter: '藤蔓从它脚下长出来，**一直朝你爬**。绑住的时间越长越疼 —— 停一下就输',
    hit: function(){ return BOSS_NATIVE.treeking.hit(); },
    run: function(){ BOSS_NATIVE.treeking.run(); }
  },
  nt_batking: {
    id: 'nt_batking', group: 'native',
    name: '回声',
    warm: 0.9,
    mul: 0.35,
    tag: '本命 · 三只绕着你飞',
    kind: '飞行的实体 ×3（会绕圈）',
    native: 'batking',
    vert: true,
    dmg: 'thresh · 撞满 5 层引爆',
    answer: '被撞了先退开，等层数掉',
    counter: '三只蝙蝠绕着你飞，撞一下叠一层**回声** —— 叠到 5 层一起炸。挨一下不要紧，接着挨才要命',
    hit: function(){ return BOSS_NATIVE.batking.hit(); },
    run: function(){ BOSS_NATIVE.batking.run(); }
  },
  nt_chief: {
    id: 'nt_chief', group: 'native',
    name: '两翼',
    warm: 1,
    mul: 0.7,
    tag: '本命 · 左右包夹',
    kind: '两路实体（从两翼切进来）',
    native: 'chief',
    vert: true,
    dmg: 'crush · 越靠正中夹得越狠',
    answer: '往一侧冲出去',
    counter: '两路狼从**左右两翼**包过来 —— 站在正中间是被夹死的那个位置',
    hit: function(){ return BOSS_NATIVE.chief.hit(); },
    run: function(){ BOSS_NATIVE.chief.run(); }
  },
  nt_golemking: {
    id: 'nt_golemking', group: 'native',
    name: '落石掩体',
    warm: 1,
    mul: 0.85,
    tag: '本命 · 石头挡冲撞',
    kind: '落下的巨石（变成掩体）',
    native: 'golemking',
    vert: true,
    dmg: 'burst · 冲撞撞上就是满伤',
    answer: '躲到石头后面',
    counter: '三块巨石砸下来留在场上，**它们是掩体** —— 它冲过来时，站在石头后面',
    hit: function(){ return BOSS_NATIVE.golemking.hit(); },
    run: function(){ BOSS_NATIVE.golemking.run(); }
  },
  nt_snakequeen: {
    id: 'nt_snakequeen', group: 'native',
    name: '蜕皮',
    warm: 1.5,
    mul: 1.1,
    tag: '本命 · 壳留在原地',
    kind: '假目标（一个和本体一样的壳）',
    native: 'snakequeen',
    vert: false,
    dmg: 'true · 背面吃满、正面减半',
    answer: '转身',
    counter: '蛇皮留在原地继续喷毒，**本体在你背后** —— 背对它，伤害翻倍',
    hit: function(){ return BOSS_NATIVE.snakequeen.hit(); },
    run: function(){ BOSS_NATIVE.snakequeen.run(); }
  },
  nt_boneabbot: {
    id: 'nt_boneabbot', group: 'native',
    name: '诵经',
    warm: 3.5,
    mul: 1,
    tag: '本命 · 三面幡连着它',
    kind: '三面可拆的经幡 + 三条光带',
    native: 'boneabbot',
    vert: true,
    dmg: 'true · 不拆就穿盾',
    answer: '先去拆幡',
    counter: '三面经幡同时念，四条光带连到它身上 —— **不拆掉就穿盾**，躲是躲不掉的',
    hit: function(){ return BOSS_NATIVE.boneabbot.hit(); },
    run: function(){ BOSS_NATIVE.boneabbot.run(); }
  },
  nt_ghostlord: {
    id: 'nt_ghostlord', group: 'native',
    name: '附影',
    warm: 0.9,
    mul: 0.9,
    tag: '本命 · 影子踩着你的脚',
    kind: '跟着你的影子（attach）',
    native: 'ghostlord',
    vert: false,
    dmg: 'exec · 重叠越久，按已损血结算',
    answer: '踩到光里甩掉它',
    counter: '影子贴在你脚下跟着走 —— 躲不开。**走到光斑上**才会被钉住',
    hit: function(){ return BOSS_NATIVE.ghostlord.hit(); },
    run: function(){ BOSS_NATIVE.ghostlord.run(); }
  },
  nt_firegeneral: {
    id: 'nt_firegeneral', group: 'native',
    name: '三叠墙',
    warm: 1,
    mul: 0.45,
    tag: '本命 · 三道墙，缺口错开',
    kind: '推进的墙 ×3（带缺口）',
    native: 'firegeneral',
    vert: true,
    dmg: 'multi · 每撞一道再加一档',
    answer: '走 Z 字穿三道缺口',
    counter: '三道火墙从远到近依次推来，**缺口一个比一个偏** —— 走 Z 字',
    hit: function(){ return BOSS_NATIVE.firegeneral.hit(); },
    run: function(){ BOSS_NATIVE.firegeneral.run(); }
  },
  nt_icequeen: {
    id: 'nt_icequeen', group: 'native',
    name: '霜华',
    warm: 0.9,
    mul: 0.3,
    tag: '本命 · 沿脚印炸回来',
    kind: '一串结冰的脚印（trail）',
    native: 'icequeen',
    vert: true,
    dmg: 'multi · 串上踩了几个就挨几段',
    answer: '拐弯',
    counter: '冰晶结在**你走过的路上**，0.9 秒后沿这串一路炸回来 —— 直线跑必中，拐弯就断',
    hit: function(){ return BOSS_NATIVE.icequeen.hit(); },
    run: function(){ BOSS_NATIVE.icequeen.run(); }
  },
  nt_spidermother: {
    id: 'nt_spidermother', group: 'native',
    name: '织网',
    warm: 1,
    mul: 0.25,
    tag: '本命 · 六条丝在转',
    kind: '旋转的丝（beam ×6）',
    native: 'spidermother',
    vert: true,
    dmg: 'dot · 蹭到就中毒，一直掉',
    answer: '站住，卡在两根丝中间',
    counter: '六条丝从中心射出去，**慢慢转** —— 这里停住才是对的：跟着丝跑一定蹭上',
    hit: function(){ return BOSS_NATIVE.spidermother.hit(); },
    run: function(){ BOSS_NATIVE.spidermother.run(); }
  },
  nt_magmalord: {
    id: 'nt_magmalord', group: 'native',
    name: '裂脉',
    warm: 1.2,
    mul: 0.6,
    tag: '本命 · 裂缝会分叉',
    kind: '分叉的裂缝（trail，留在场上）',
    native: 'magmalord',
    vert: false,
    dmg: 'ramp · 站在裂缝上持续加深',
    answer: '离裂缝远一点',
    counter: '裂缝从它脚下长出来，**会分叉、一直在延长** —— 站上去就一直加伤',
    hit: function(){ return BOSS_NATIVE.magmalord.hit(); },
    run: function(){ BOSS_NATIVE.magmalord.run(); }
  },
  nt_ashwarden: {
    id: 'nt_ashwarden', group: 'native',
    name: '灰暴',
    warm: 1,
    mul: 0.05,
    tag: '本命 · 看不远，还被风推',
    kind: '视野压制 + 持续推力（无落点）',
    native: 'ashwarden',
    vert: false,
    dmg: 'dot · 每 0.6 秒一点，不致命但一直掉',
    answer: '逆着风走',
    counter: '全场起灰，**视野只剩 10 米**，风一直把你往一侧推 —— 得逆着风走',
    hit: function(){ return BOSS_NATIVE.ashwarden.hit(); },
    run: function(){ BOSS_NATIVE.ashwarden.run(); }
  },
  nt_flamewraith: {
    id: 'nt_flamewraith', group: 'native',
    name: '附身',
    warm: 2.2,
    mul: 1,
    tag: '本命 · 躲在小的里面',
    kind: '假目标 ×4（其中一个是它）',
    native: 'flamewraith',
    vert: false,
    dmg: 'reflect · 打错目标反噬',
    answer: '只打变红的那只',
    counter: '它钻进四只里的一只 —— **那只才是本体**，打别的是反噬',
    hit: function(){ return BOSS_NATIVE.flamewraith.hit(); },
    run: function(){ BOSS_NATIVE.flamewraith.run(); }
  },
  nt_flameemperor: {
    id: 'nt_flameemperor', group: 'native',
    name: '天火轮',
    warm: 1,
    mul: 0.28,
    tag: '本命 · 两圈反向转',
    kind: '两圈环绕的火球（orbit）',
    native: 'flameemperor',
    vert: false,
    dmg: 'burst · 每次擦到一下',
    answer: '跟着转，卡在两道之间',
    counter: '两圈天火**反向**旋转，第二圈错开半格 —— 跟着转才卡得住缝',
    hit: function(){ return BOSS_NATIVE.flameemperor.hit(); },
    run: function(){ BOSS_NATIVE.flameemperor.run(); }
  },
  nt_ferryman: {
    id: 'nt_ferryman', group: 'native',
    name: '引渡',
    warm: 1,
    mul: 0.55,
    tag: '本命 · 绳索一直在拽',
    kind: '锁链（beam，跟着你）',
    native: 'ferryman',
    vert: true,
    dmg: 'drain · 拖到身边就吸你的血',
    answer: '一直往外走',
    counter: '一条引魂索连着你，**一直在往它那边拽** —— 一停下来就被拖过去',
    hit: function(){ return BOSS_NATIVE.ferryman.hit(); },
    run: function(){ BOSS_NATIVE.ferryman.run(); }
  },
  nt_swordlord: {
    id: 'nt_swordlord', group: 'native',
    name: '万剑',
    warm: 1,
    mul: 0.35,
    tag: '本命 · 十六柄从外面飞进来',
    kind: '飞行的剑 ×16（实体，带轨迹）',
    native: 'swordlord',
    vert: true,
    dmg: 'burst · 撞上一柄算一柄',
    answer: '往缝里钻，别往外跑',
    counter: '十六柄剑从场地边缘**飞进来** —— 往外跑正好撞上，要往缝里钻',
    hit: function(){ return BOSS_NATIVE.swordlord.hit(); },
    run: function(){ BOSS_NATIVE.swordlord.run(); }
  },
  nt_marrowlord: {
    id: 'nt_marrowlord', group: 'native',
    name: '抽髓',
    warm: 1,
    mul: 0.04,
    tag: '本命 · 骨线连着，绕柱断',
    kind: '骨线（trail，跟到你脚下）',
    native: 'marrowlord',
    vert: false,
    dmg: 'pct · 每 0.5 秒抽当前生命 4%',
    answer: '绕到石柱后面',
    counter: '一条骨线连着你，**每半秒抽一次当前生命** —— 绕到石柱后面，线才会断',
    hit: function(){ return BOSS_NATIVE.marrowlord.hit(); },
    run: function(){ BOSS_NATIVE.marrowlord.run(); }
  },
  nt_riverwraith: {
    id: 'nt_riverwraith', group: 'native',
    name: '遗忘',
    warm: 0.9,
    mul: 0,
    tag: '本命 · 被贴上就灰技能',
    kind: '贴身的暗环（attach）',
    native: 'riverwraith',
    vert: true,
    dmg: 'disable · 随机一格技能灰 4 秒',
    answer: '别让它贴身',
    counter: '被它贴上，**随机一个技能灰掉 4 秒** —— 这一招不疼，但会让你少一格',
    hit: function(){ return BOSS_NATIVE.riverwraith.hit(); },
    run: function(){ BOSS_NATIVE.riverwraith.run(); }
  },
  nt_abysswyrm: {
    id: 'nt_abysswyrm', group: 'native',
    name: '盘踞',
    warm: 1,
    mul: 0.7,
    tag: '本命 · 一圈蟒身往里收',
    kind: '盘成一圈的蟒身（trail 闭环）',
    native: 'abysswyrm',
    vert: false,
    dmg: 'crush · 越靠外越疼',
    answer: '往里站',
    counter: '蟒身沿场边盘成一圈，**慢慢收紧** —— 可站的地方越来越小，越靠外越疼',
    hit: function(){ return BOSS_NATIVE.abysswyrm.hit(); },
    run: function(){ BOSS_NATIVE.abysswyrm.run(); }
  },
  nt_yellowspring: {
    id: 'nt_yellowspring', group: 'native',
    name: '判词',
    warm: 3.2,
    mul: 1,
    tag: '本命 · 站进圈里才活',
    kind: '反向判定圈（只在圈内安全）',
    native: 'yellowspring',
    vert: false,
    dmg: 'exec · 圈外按已损血处决',
    answer: '主动走进去',
    counter: '地上写一道判词，**站在圈里的是活人** —— 别的招都教你躲，这一招教你走进去',
    hit: function(){ return BOSS_NATIVE.yellowspring.hit(); },
    run: function(){ BOSS_NATIVE.yellowspring.run(); }
  },
  nt_chaos: {
    id: 'nt_chaos', group: 'native',
    name: '无相',
    warm: 1.1,
    mul: 0.9,
    tag: '本命 · 三种形态轮换',
    kind: '形态轮换（环 / 扇 / 散）',
    native: 'chaos',
    vert: false,
    dmg: 'burst · 按当前形态结算',
    answer: '先认形态，再决定方向',
    counter: '每 3 秒换一个形态（环 / 扇 / 散）—— **认错了就躲错方向**',
    hit: function(){ return BOSS_NATIVE.chaos.hit(); },
    run: function(){ BOSS_NATIVE.chaos.run(); }
  },
  nt_swordguardian: {
    id: 'nt_swordguardian', group: 'native',
    name: '剑围',
    warm: 1,
    mul: 0.6,
    tag: '本命 · 缺口每 0.9 秒换位',
    kind: '一圈剑（缺口在转）',
    native: 'swordguardian',
    vert: false,
    dmg: 'burst · 撞到剑刃',
    answer: '跟着缺口转',
    counter: '一圈剑插在四周，只有一处缺口 —— **缺口每 0.9 秒换一个位置**',
    hit: function(){ return BOSS_NATIVE.swordguardian.hit(); },
    run: function(){ BOSS_NATIVE.swordguardian.run(); }
  },
  nt_bladelord: {
    id: 'nt_bladelord', group: 'native',
    name: '剑气潮',
    warm: 1,
    mul: 0.5,
    tag: '本命 · 整面墙，一个洞',
    kind: '一面推进的墙（洞在动）',
    native: 'bladelord',
    vert: true,
    dmg: 'multi · 每被扫一次加一档',
    answer: '追着那个洞跑',
    counter: '一整面剑气墙从一侧推到另一侧，**墙上只有一个洞** —— 而洞在动',
    hit: function(){ return BOSS_NATIVE.bladelord.hit(); },
    run: function(){ BOSS_NATIVE.bladelord.run(); }
  },
  nt_swordemperor: {
    id: 'nt_swordemperor', group: 'native',
    name: '一剑',
    warm: 3,
    mul: 1.6,
    tag: '本命 · 一条线，三秒',
    kind: '一条极细的线（beam 蓄力）',
    native: 'swordemperor',
    vert: false,
    dmg: 'true · 穿盾满伤',
    answer: '看见线就离开它一米',
    counter: '蓄力三秒，地上只有**一条头发丝粗的红线** —— 找不到它，就躲不掉',
    hit: function(){ return BOSS_NATIVE.swordemperor.hit(); },
    run: function(){ BOSS_NATIVE.swordemperor.run(); }
  },
  nt_cloudwarden: {
    id: 'nt_cloudwarden', group: 'native',
    name: '断桥',
    warm: 1,
    mul: 1,
    tag: '本命 · 云一块块塌',
    kind: '会消失的地块（pool 逐个塌）',
    native: 'cloudwarden',
    vert: false,
    dmg: 'fall · 站上去直接掉下去',
    answer: '记住哪几块还在',
    counter: '九块云**一块块塌掉，塌过的永远不能站** —— 可站的面只会越来越小',
    hit: function(){ return BOSS_NATIVE.cloudwarden.hit(); },
    run: function(){ BOSS_NATIVE.cloudwarden.run(); }
  },
  nt_heavenguard: {
    id: 'nt_heavenguard', group: 'native',
    name: '天门转',
    warm: 1,
    mul: 0.35,
    tag: '本命 · 扇形光柱绕场转',
    kind: '旋转的扇面光柱',
    native: 'heavenguard',
    vert: false,
    dmg: 'burn · 扫到持续烧',
    answer: '跟在它背面走',
    counter: '一道扇面光柱绕场旋转，**扫到就一直烧** —— 跟在它背面走',
    hit: function(){ return BOSS_NATIVE.heavenguard.hit(); },
    run: function(){ BOSS_NATIVE.heavenguard.run(); }
  },
  nt_jadeemperor: {
    id: 'nt_jadeemperor', group: 'native',
    name: '玉玺',
    warm: 1.3,
    mul: 0.8,
    tag: '本命 · 砸下来变柱子',
    kind: '落下的玉玺（留成石柱）',
    native: 'jadeemperor',
    vert: false,
    dmg: 'burst · 砸中 + 撞柱破防',
    answer: '把柱子留在它冲锋的路上',
    counter: '玉玺砸下来会**留在场上变成柱子** —— 让它撞上去，它就破防三秒',
    hit: function(){ return BOSS_NATIVE.jadeemperor.hit(); },
    run: function(){ BOSS_NATIVE.jadeemperor.run(); }
  },
  nt_starlord: {
    id: 'nt_starlord', group: 'native',
    name: '陨星',
    warm: 1,
    mul: 1.1,
    tag: '本命 · 看轨迹，不是看地面',
    kind: '划天的陨星（实体，带轨迹）',
    native: 'starlord',
    vert: true,
    dmg: 'burst · 落点满伤 + 冲击波',
    answer: '读天上的轨迹',
    counter: '陨星拖着一条**看得见的轨迹**划过天，轨迹的终点才是落点 —— 抬头读它，别低头找圈',
    hit: function(){ return BOSS_NATIVE.starlord.hit(); },
    run: function(){ BOSS_NATIVE.starlord.run(); }
  },
  nt_mirrordemon: {
    id: 'nt_mirrordemon', group: 'native',
    name: '镜我',
    warm: 1,
    mul: 0.9,
    tag: '本命 · 它会学你走',
    kind: '模仿你的分身（split）',
    native: 'mirrordemon',
    vert: false,
    dmg: 'reflect · 站它旁边就被反噬',
    answer: '故意乱走，让它学歪',
    counter: '它复制出一个"你"，**模仿你 0.6 秒前的走位** —— 你走直线，它就压在你身上',
    hit: function(){ return BOSS_NATIVE.mirrordemon.hit(); },
    run: function(){ BOSS_NATIVE.mirrordemon.run(); }
  },
  nt_mirrorlord: {
    id: 'nt_mirrorlord', group: 'native',
    name: '镜面',
    warm: 1,
    mul: 0,
    tag: '本命 · 半边场地不能用',
    kind: '半场镜面（pool 覆盖）',
    native: 'mirrorlord',
    vert: false,
    dmg: 'reflect · 你在上面出多少伤就吃多少',
    answer: '换到没镜子的那半边',
    counter: '场地**整整半边**变成镜面，站上去出招=打自己 —— 换半边',
    hit: function(){ return BOSS_NATIVE.mirrorlord.hit(); },
    run: function(){ BOSS_NATIVE.mirrorlord.run(); }
  },
  nt_nineheaven: {
    id: 'nt_nineheaven', group: 'native',
    name: '雷链',
    warm: 1,
    mul: 0.75,
    tag: '本命 · 雷柱之间拉电',
    kind: '雷柱 + 柱间的链（beam）',
    native: 'nineheaven',
    vert: true,
    dmg: 'true · 链上穿盾',
    answer: '站到链的端点外面',
    counter: '五根雷柱落定后，**相邻两根之间拉出一道电链** —— 站在链的两端外面，柱间空地不能站',
    hit: function(){ return BOSS_NATIVE.nineheaven.hit(); },
    run: function(){ BOSS_NATIVE.nineheaven.run(); }
  },
  nt_chaosavatar: {
    id: 'nt_chaosavatar', group: 'native',
    name: '因果',
    warm: 1,
    mul: 1.15,
    tag: '本命 · 压在你正在去的方向',
    kind: '预判落点（按你的速度外推）',
    native: 'chaosavatar',
    vert: true,
    dmg: 'exec · 按已损失血加伤',
    answer: '突然变向',
    counter: '落点压在你**正在去的方向**上 —— 直线跑必中，得突然变向',
    hit: function(){ return BOSS_NATIVE.chaosavatar.hit(); },
    run: function(){ BOSS_NATIVE.chaosavatar.run(); }
  },
  nt_bafo_deva: {
    id: 'nt_bafo_deva', group: 'native',
    name: '雷鼓',
    warm: 1,
    mul: 0.3,
    tag: '本命 · 四拍，第四拍最重',
    kind: '节奏（四拍，落点跟着鼓点变）',
    native: 'bafo_deva',
    vert: true,
    dmg: 'multi · 四拍递增，第四拍翻倍',
    answer: '数拍子，第四拍才走',
    counter: '雷鼓四拍：**前三拍轻，第四拍翻倍** —— 数着拍子，只在第四拍走位',
    hit: function(){ return BOSS_NATIVE.bafo_deva.hit(); },
    run: function(){ BOSS_NATIVE.bafo_deva.run(); }
  },
  nt_bafo_naga: {
    id: 'nt_bafo_naga', group: 'native',
    name: '毒海',
    warm: 1,
    mul: 0.22,
    tag: '本命 · 从中心漫出来',
    kind: '不断扩张的毒面（pool）',
    native: 'bafo_naga',
    vert: false,
    dmg: 'dot · 叠层，站得越久越疼',
    answer: '退到还没被淹的那一圈',
    counter: '毒从中心**一直往外漫**，站在里面每秒叠一层 —— 退到还没被淹的那一圈',
    hit: function(){ return BOSS_NATIVE.bafo_naga.hit(); },
    run: function(){ BOSS_NATIVE.bafo_naga.run(); }
  },
  nt_bafo_yaksa: {
    id: 'nt_bafo_yaksa', group: 'native',
    name: '疾冲',
    warm: 1,
    mul: 1,
    tag: '本命 · 它自己撞过来',
    kind: 'Boss 本体冲撞（带冲锋线）',
    native: 'bafo_yaksa',
    vert: false,
    dmg: 'crush · 正对撞上满伤，擦边减半',
    answer: '垂直于冲锋线侧闪',
    counter: '它顿一下，然后**整只撞过来** —— 撞在线上是满伤，垂直侧闪就只擦到',
    hit: function(){ return BOSS_NATIVE.bafo_yaksa.hit(); },
    run: function(){ BOSS_NATIVE.bafo_yaksa.run(); }
  },
  nt_bafo_gandharva: {
    id: 'nt_bafo_gandharva', group: 'native',
    name: '弦歌',
    warm: 1,
    mul: 0.35,
    tag: '本命 · 三圈波同时扩',
    kind: '扩散的环 ×3（wave）',
    native: 'bafo_gandharva',
    vert: false,
    dmg: 'burst · 被任一圈扫到',
    answer: '卡在两道波之间',
    counter: '三圈音波**同时往外扩**，中间有两条缝 —— 缝会变宽变窄，卡住时机',
    hit: function(){ return BOSS_NATIVE.bafo_gandharva.hit(); },
    run: function(){ BOSS_NATIVE.bafo_gandharva.run(); }
  },
  nt_bafo_asura: {
    id: 'nt_bafo_asura', group: 'native',
    name: '三面',
    warm: 1,
    mul: 0.4,
    tag: '本命 · 每次只有一个头睁眼',
    kind: '三个方向的扇面（轮流睁眼）',
    native: 'bafo_asura',
    vert: false,
    dmg: 'multi · 睁眼的那一面满伤',
    answer: '换到闭眼那一面',
    counter: '三个头轮流睁眼，**只有睁眼那一面会打** —— 换到闭着眼的那一面',
    hit: function(){ return BOSS_NATIVE.bafo_asura.hit(); },
    run: function(){ BOSS_NATIVE.bafo_asura.run(); }
  },
  nt_bafo_garuda: {
    id: 'nt_bafo_garuda', group: 'native',
    name: '金翅',
    warm: 1,
    mul: 1.4,
    tag: '本命 · 贴上去才活',
    kind: '环状冲击（中心留空）',
    native: 'bafo_garuda',
    vert: false,
    dmg: 'true · 圈内全免，圈外穿盾',
    answer: '贴身站住',
    counter: '金翅一振，**外圈整片炸开，中心是空的** —— 跑得越远越死，贴上去才活',
    hit: function(){ return BOSS_NATIVE.bafo_garuda.hit(); },
    run: function(){ BOSS_NATIVE.bafo_garuda.run(); }
  },
  nt_bafo_kimnara: {
    id: 'nt_bafo_kimnara', group: 'native',
    name: '鹿群',
    warm: 1,
    mul: 0.6,
    tag: '本命 · 一群鹿四散跑',
    kind: '四散的鹿群（实体 ×10）',
    native: 'bafo_kimnara',
    vert: true,
    dmg: 'burst · 撞到一只算一只',
    answer: '别站在它们要跑的方向上',
    counter: '鹿群从中间**四散跑开** —— 它们跑的方向是随机的，但起步前会先低头',
    hit: function(){ return BOSS_NATIVE.bafo_kimnara.hit(); },
    run: function(){ BOSS_NATIVE.bafo_kimnara.run(); }
  },
  nt_bafo_mahoraga: {
    id: 'nt_bafo_mahoraga', group: 'native',
    name: '毒牙',
    warm: 1,
    mul: 0.5,
    tag: '本命 · 两排牙合拢',
    kind: '两排合拢的牙（wall 对咬）',
    native: 'bafo_mahoraga',
    vert: true,
    dmg: 'pct · 咬住按当前生命 % 掉',
    answer: '挤进那条缝',
    counter: '上下两排毒牙从两侧**合拢**，中间只剩一条缝 —— 缝在横移，而且越来越窄',
    hit: function(){ return BOSS_NATIVE.bafo_mahoraga.hit(); },
    run: function(){ BOSS_NATIVE.bafo_mahoraga.run(); }
  },
  nt_dgb_tomb: {
    id: 'nt_dgb_tomb', group: 'native',
    name: '骨浪',
    warm: 1,
    mul: 0.2,
    tag: '本命 · 骨手一波波爬进来',
    kind: '爬行的骨手（实体 ×N，一波波）',
    native: 'dgb_tomb',
    vert: true,
    dmg: 'dot · 被抓住持续掉',
    answer: '往中间收',
    counter: '骨手从**场边一波波往里爬**，一波比一波深 —— 得往中间退',
    hit: function(){ return BOSS_NATIVE.dgb_tomb.hit(); },
    run: function(){ BOSS_NATIVE.dgb_tomb.run(); }
  },
  nt_dgb_well: {
    id: 'nt_dgb_well', group: 'native',
    name: '塌方',
    warm: 1.2,
    mul: 1,
    tag: '本命 · 只有影子没有圈',
    kind: '头顶落石（只在地上有影）',
    native: 'dgb_well',
    vert: true,
    dmg: 'burst · 砸中即满伤',
    answer: '看影子有多大',
    counter: '头顶落石**只在地上投一个影子**，影子越大越近 —— 没有红圈可躲',
    hit: function(){ return BOSS_NATIVE.dgb_well.hit(); },
    run: function(){ BOSS_NATIVE.dgb_well.run(); }
  },
  nt_dgb_den: {
    id: 'nt_dgb_den', group: 'native',
    name: '兽群',
    warm: 1,
    mul: 0.9,
    tag: '本命 · 一圈狼，只有一个缺口',
    kind: '一整圈实体（有缺口）',
    native: 'dgb_den',
    vert: true,
    dmg: 'burst · 撞到几只算几只',
    answer: '从缺口冲出去',
    counter: '狼群围成一整圈同时冲进来，**只有一个方向是空的** —— 冲出去，不是往里躲',
    hit: function(){ return BOSS_NATIVE.dgb_den.hit(); },
    run: function(){ BOSS_NATIVE.dgb_den.run(); }
  },
  nt_dgb_gaol: {
    id: 'nt_dgb_gaol', group: 'native',
    name: '没顶',
    warm: 1,
    mul: 0.3,
    tag: '本命 · 台子一块块沉下去',
    kind: '上涨的水面（pool）+ 三块高台',
    native: 'dgb_gaol',
    vert: false,
    dmg: 'dot · 泡在水里持续掉',
    answer: '站高台，淹了就换',
    counter: '水从地面升起，**只有高台还在水面以上** —— 而高台会被淹，得换',
    hit: function(){ return BOSS_NATIVE.dgb_gaol.hit(); },
    run: function(){ BOSS_NATIVE.dgb_gaol.run(); }
  },
  nt_dgb_fall: {
    id: 'nt_dgb_fall', group: 'native',
    name: '游龙',
    warm: 1,
    mul: 0.65,
    tag: '本命 · 龙卷绕着场转',
    kind: '绕场移动的龙卷（实体危险物）',
    native: 'dgb_fall',
    vert: false,
    dmg: 'crush · 卷进去持续疼',
    answer: '预判它下一秒在哪',
    counter: '龙卷绕着场转，**转速还是变的** —— 躲的是它下一秒的位置，不是现在这一格',
    hit: function(){ return BOSS_NATIVE.dgb_fall.hit(); },
    run: function(){ BOSS_NATIVE.dgb_fall.run(); }
  },
};
