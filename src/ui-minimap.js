/* ============================================================
 * ui-minimap.js —— 小地图（M3 · §5.5「必须做，不是可选」）
 *
 * 为什么必须做：M3 把 size 从 130 拉到 290~300，而角色视野半径只有 13 米。
 * 没有小地图，玩家在一张 17,000㎡ 的图上只能看到身边 13 米，
 * 「往哪走」全靠撞墙 —— 这不是难度，是信息缺失。
 *
 * 原来的实现（ui.js 的 UI.drawMinimap）只显示身边 30~52 米：
 * 在 130 的图上够用，在 290 的图上等于把 17,000㎡ 裁成 1/12 的一块，
 * 玩家永远看不到「整张图长什么样」。所以这里改成**整图俯视**：
 * span 按 zone 包围盒自适应，不设上限，12 个区能一眼看全。
 *
 * 画什么（§5.5 清单）：
 *   zone 轮廓（rect / circle，直接读 mapZones()）
 *   玩家箭头（朝向 = playerFace）
 *   任务区高亮（QuestSys.activeZones —— M2 已经算好了，直接读）
 *   路标石（world.waystone，M1）
 *   章出口（world.gate，M1）
 *   传送阵 / NPC / 敌人 / 掉落
 *
 * 地脉裂隙（§8 的地下城入口）还没做 —— dungeon.js 属于后续里程碑，
 * 这里留了 drawRifts() 的调用点，等 dungeon 落地时补数据源即可。
 *
 * 纯绘制，不改状态。每帧调用一次（UI.drawMinimap 转发到这里）。
 * ============================================================ */

const Minimap = {
  /* 地面色：按 ground 取，而不是按 mapId ——
   * 新图有 25 张，按 id 列一张表会漏；ground 只有 12 种。 */
  GROUND_COL: {
    dirt: ['#3a3424', '#14120c'],
    bamboo: ['#2c3d24', '#0e140c'],
    swamp: ['#35251f', '#120c0a'],
    rock: ['#2c2c34', '#0d0d11'],
    abyss: ['#241a30', '#0b0810'],
    heaven: ['#3a4658', '#101620'],
    ice: ['#2a3c4c', '#0c141c'],
    ash: ['#332a24', '#120d0a'],
    trial: ['#2a2440', '#0b0814']
  },

  ZONE_FILL: { entry: '#3f3a2a', path: '#413c2c', hall: '#4a442f', wing: '#45402f', link: '#332f24', boss: '#3d2a2a' },
  ZONE_STROKE: { entry: 'rgba(216,178,90,.30)', link: 'rgba(216,178,90,.16)', boss: 'rgba(255,90,70,.55)' },

  draw(s) {
    if (!s) return;
    const cv = document.getElementById('minimap');
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, R = W / 2;
    const map = (typeof MAPS !== 'undefined') ? MAPS[s.mapId] : null;
    if (!map) return;

    /* ---------- 视野范围 ----------
     * 固定整图视角，**不跟随玩家**。
     *
     * 第一版沿用老实现（以玩家为圆心 + 整图 span），实测在焚天祭坛上
     * 一出生的位置就能把北边的首领场挤出圆框 —— 因为圆心跟着玩家跑，
     * 半径又是按「整图最远点」算的，两者不匹配。
     *
     * 改成固定圆心（所有 zone 的包围盒中心）+ 半径 = 到最远点的距离 ×1.08，
     * 保证任何一张图的任何角落都完整可见。代价是玩家箭头会变小，
     * 但小地图在 M3 之后的主要职责是「我在整张图的哪个区」，
     * 而不是「我身边三米有什么」—— 后者交给主画面。
     *
     * 下限 45 米：桃源村这种单圆小图别过度放大，否则满屏空白。 */
    const zs = (typeof mapZones === 'function') ? mapZones(s.mapId) : null;
    let cx = 0, cz = 0, span = map.size * 0.5;
    if (zs && zs.length) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const z of zs) {
        const hw = z.type === 'circle' ? z.r : z.w / 2;
        const hh = z.type === 'circle' ? z.r : z.h / 2;
        x0 = Math.min(x0, z.x - hw); x1 = Math.max(x1, z.x + hw);
        z0 = Math.min(z0, z.z - hh); z1 = Math.max(z1, z.z + hh);
      }
      cx = (x0 + x1) / 2;
      cz = (z0 + z1) / 2;
      /* 半径取「包围盒半宽 / 半高」的较大者，再留 8% 边距。
       * 用包围盒而不是「到最远点的距离」—— 后者会被对角方向的单个
       * 尖角撑大，导致另一侧留出大片空白。 */
      span = Math.max(x1 - cx, z1 - cz) * 1.08;
    }
    span = Math.max(45, span);
    const scale = R / span;

    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.clip();

    /* ---------- 底 ----------
     * 底色**故意压到最暗一档**，让 zone 填充（#3f3a2a~#4a442f）反衬出来。
     * 第一版用的是径向渐变（中心亮 col[0] → 边缘暗 col[1]），
     * 结果中心亮度刚好和 zone 填充撞色，玩家分不清「哪块是能走的房间、
     * 哪块是墙外」—— 小地图上最重要的信息就是这个。
     * 现在改成：平铺最暗色 + 边缘压暗（vignette），
     * col[0] 只用来给中心加一点点地面色偏，不参与明度。 */
    const col = this.GROUND_COL[map.ground] || ['#2a2a24', '#0a0a0a'];
    g.fillStyle = col[1]; g.fillRect(0, 0, W, H);
    const grd = g.createRadialGradient(R, R, 10, R, R, R);
    grd.addColorStop(0, col[0]);
    grd.addColorStop(0.55, col[1]);
    grd.addColorStop(1, '#000');
    g.globalAlpha = 0.55;
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    const px = s.playerPos.x, pz = s.playerPos.z;
    /* 固定视角：以整图包围盒中心为圆心，玩家在其中移动 */
    const tx = x => R + (x - cx) * scale;
    const tz = z => R + (z - cz) * scale;
    /* 玩家箭头位置（和 tx/tz 同一套变换，但单独算一遍便于读） */
    const ppx = tx(px), ppz = tz(pz);

    /* ---------- 任务区高亮 ----------
     * 放在 zone 轮廓之前画，作为「底色」；轮廓再压上去，边界才清楚。
     * QuestSys.activeZones 返回当前图上生效的任务区（最多 1 主线 + 2 支线），
     * 复命/放弃后立刻消失，所以这里不需要自己维护状态。 */
    const qZones = (typeof QuestSys !== 'undefined' && QuestSys.activeZones)
      ? QuestSys.activeZones(s.mapId) : [];
    const qMap = {};
    for (const q of qZones) qMap[q.zone] = q;

    /* ---------- zone 轮廓 ---------- */
    if (zs && zs.length) {
      for (const z of zs) {
        g.beginPath();
        if (z.type === 'circle') g.arc(tx(z.x), tz(z.z), z.r * scale, 0, 7);
        else g.rect(tx(z.x - z.w / 2), tz(z.z - z.h / 2), z.w * scale, z.h * scale);
        g.fillStyle = this.ZONE_FILL[z.kind] || '#3a3628';
        g.fill();
      }
      /* 任务区：金色半透明填充 + 虚线描边，压在普通区上面 */
      for (const zid in qMap) {
        const z = zs.find(o => o.id === zid);
        if (!z) continue;
        const main = qMap[zid].main;
        g.beginPath();
        if (z.type === 'circle') g.arc(tx(z.x), tz(z.z), z.r * scale, 0, 7);
        else g.rect(tx(z.x - z.w / 2), tz(z.z - z.h / 2), z.w * scale, z.h * scale);
        g.fillStyle = main ? 'rgba(255,206,84,.20)' : 'rgba(120,220,255,.14)';
        g.fill();
      }
      /* 描边单独一遍：先普通区、再任务区，保证任务区的框不会被盖住 */
      for (const z of zs) {
        g.beginPath();
        if (z.type === 'circle') g.arc(tx(z.x), tz(z.z), z.r * scale, 0, 7);
        else g.rect(tx(z.x - z.w / 2), tz(z.z - z.h / 2), z.w * scale, z.h * scale);
        g.strokeStyle = this.ZONE_STROKE[z.kind] || 'rgba(216,178,90,.38)';
        g.lineWidth = z.kind === 'link' ? 1 : 1.4;
        g.stroke();
      }
      for (const zid in qMap) {
        const z = zs.find(o => o.id === zid);
        if (!z) continue;
        g.save();
        g.setLineDash([5, 4]);
        g.strokeStyle = qMap[zid].main ? 'rgba(255,206,84,.95)' : 'rgba(120,220,255,.85)';
        g.lineWidth = 2.4;
        g.beginPath();
        if (z.type === 'circle') g.arc(tx(z.x), tz(z.z), z.r * scale, 0, 7);
        else g.rect(tx(z.x - z.w / 2), tz(z.z - z.h / 2), z.w * scale, z.h * scale);
        g.stroke();
        g.restore();
      }

      /* 区域名（HUD 上的小字） */
      const el = document.getElementById('zoneName');
      if (el && typeof UI !== 'undefined' && UI.zoneLabel) {
        const txt = UI.zoneLabel(s);
        if (el.textContent !== txt) el.textContent = txt;
      }
    } else {
      /* 没有区域配置的图（试炼擂台）：退回网格 */
      g.strokeStyle = 'rgba(216,178,90,.06)'; g.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        g.beginPath(); g.moveTo(R + i * 40, 0); g.lineTo(R + i * 40, H); g.stroke();
        g.beginPath(); g.moveTo(0, R + i * 40); g.lineTo(W, R + i * 40); g.stroke();
      }
    }

    /* ---------- 视野扇形 ---------- */
    {
      const fa = Math.atan2(Game.playerFace.x, Game.playerFace.z);
      g.save();
      g.translate(ppx, ppz); g.rotate(fa);
      const fan = g.createRadialGradient(0, 0, 4, 0, 0, R * 0.62);
      fan.addColorStop(0, 'rgba(240,224,184,.20)');
      fan.addColorStop(1, 'rgba(240,224,184,0)');
      g.fillStyle = fan;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.62, -0.61, 0.61); g.closePath(); g.fill();
      g.restore();
    }

    /* ---------- 传送阵（去哪都行的面板入口） ---------- */
    if (map.portal) {
      g.strokeStyle = '#6aa8ff'; g.lineWidth = 2;
      g.beginPath(); g.arc(tx(map.portal.x), tz(map.portal.z), 7, 0, 7); g.stroke();
    }

    /* ---------- 路标石（M1：野图里「先回家」的快捷键） ---------- */
    const ws = (Game.world && Game.world.waystone) ? Game.world.waystone : null;
    if (ws) {
      const x = tx(ws.x), z = tz(ws.z);
      g.fillStyle = '#8fd0ff';
      g.beginPath();
      g.moveTo(x, z - 6); g.lineTo(x + 5, z); g.lineTo(x, z + 6); g.lineTo(x - 5, z);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(20,30,40,.8)'; g.lineWidth = 1; g.stroke();
    }

    /* ---------- 章出口门（M1：通往下一章的出口） ---------- */
    const gate = (Game.world && Game.world.gate) ? Game.world.gate : null;
    if (gate) {
      const x = tx(gate.x), z = tz(gate.z);
      g.fillStyle = '#9ae08a';
      g.beginPath();
      g.moveTo(x, z - 7); g.lineTo(x + 6, z + 5); g.lineTo(x - 6, z + 5);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(20,40,20,.8)'; g.lineWidth = 1; g.stroke();
    }

    /* ---------- 地脉裂隙（§8 地下城入口）----------
     * dungeon.js 属于后续里程碑，现在还没有数据源。
     * 留这个函数是为了把「小地图要画裂隙」这件事钉在代码里，
     * 等 dungeon 落地时只需要补 Game.world.rifts 的数据。 */
    this.drawRifts(g, tx, tz);

    /* ---------- NPC ---------- */
    if (map.npcs) {
      for (const id of map.npcs) {
        const n = Game.npcs[id];
        if (!n) continue;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(tx(n.pos.x), tz(n.pos.z), 4, 0, 7); g.fill();
      }
    }

    /* ---------- 敌人 ---------- */
    for (const e of Game.enemies) {
      if (e.dead) continue;
      g.fillStyle = e.boss ? '#ff4a3a' : (e.elite ? '#ff9a3c' : '#c85a4a');
      const r = e.boss ? 6 : 2.6;
      g.beginPath(); g.arc(tx(e.pos.x), tz(e.pos.z), r, 0, 7); g.fill();
    }

    /* ---------- 掉落 ---------- */
    for (const l of Game.loot) {
      if (l.taken) continue;
      g.fillStyle = (l.item && typeof RARITY !== 'undefined') ? RARITY[l.item.rarity].color : '#e8c878';
      g.fillRect(tx(l.pos.x) - 1.5, tz(l.pos.z) - 1.5, 3, 3);
    }

    /* ---------- 玩家箭头 ---------- */
    const ang = Math.atan2(Game.playerFace.x, Game.playerFace.z);
    g.save();
    g.translate(ppx, ppz); g.rotate(ang);
    g.fillStyle = '#f0e0b8';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3.5); g.lineTo(-6, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.restore();

    /* ---------- 边框 ---------- */
    g.strokeStyle = 'rgba(216,178,90,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1;
    g.beginPath(); g.arc(R, R, R - 6, 0, 7); g.stroke();
  },

  /* 地脉裂隙：数据源还没做，占位函数。
   * 一旦 dungeon.js 有了 Game.world.rifts（[{x,z,name}]），这里直接开画。 */
  drawRifts(g, tx, tz) {
    const rifts = (Game.world && Game.world.rifts) ? Game.world.rifts : null;
    if (!rifts || !rifts.length) return;
    for (const r of rifts) {
      const x = tx(r.x), z = tz(r.z);
      g.strokeStyle = '#c060ff'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 5, z - 5); g.lineTo(x + 2, z - 1); g.lineTo(x - 2, z + 2); g.lineTo(x + 5, z + 5);
      g.stroke();
    }
  },
};
