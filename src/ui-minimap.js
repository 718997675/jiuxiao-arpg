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

  /* ---------------- 整图适配 ----------------
   * 固定圆心（所有 zone 的包围盒中心）+ 半径 = 包围盒半宽/半高较大者 ×1.08。
   *
   * 第一版是「以玩家为圆心 + 整图 span」，实测在焚天祭坛上一出生就能把
   * 北边的首领场挤出圆框 —— 圆心跟着玩家跑、半径按整图算，两者不匹配。
   * 固定圆心保证任何一张图的任何角落都完整可见。代价是玩家箭头会变小，
   * 但小地图在 M3 之后的主要职责是「我在整张图的哪个区」，
   * 而不是「我身边三米有什么」—— 后者交给主画面。
   *
   * 下限 45 米：桃源村这种单圆小图别过度放大，否则满屏空白。
   * 抽成独立函数是因为大图（P03 的 #mapBig）要用同一套适配做基准缩放。 */
  _fit(s, map) {
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
    return { cx, cz, span: Math.max(45, span) };
  },

  /* HUD 小地图：圆形裁剪，固定整图视角 */
  draw(s) {
    if (!s) return;
    const cv = document.getElementById('minimap');
    if (!cv) return;
    this._bindMini();
    const map = (typeof MAPS !== 'undefined') ? MAPS[s.mapId] : null;
    if (!map) return;
    const W = cv.width, H = cv.height;
    const fit = this._fit(s, map);
    this.paint(cv.getContext('2d'), W, H, s, {
      cx: fit.cx, cz: fit.cz, scale: (W / 2) / fit.span, clip: 'circle'
    });
    /* 大图开着的时候顺带重画一帧 —— 让缩放 / 拖动 / 动画跟主循环同频，
     * 不另起一个 requestAnimationFrame（两套循环迟早不同步）。 */
    if (this.big.open) this.drawBig(s);
  },

  /* 统一绘制。
   *
   * `view` = { cx, cz, scale, clip, grid }
   *   cx / cz  世界坐标里的视图中心（不是屏幕像素）
   *   scale    世界米 → 画布像素
   *   clip     'circle'（HUD）| 'rect'（大图）
   *   grid     大图放大后画坐标格 + 区域名
   *
   * 拆成「view 由调用方给」的好处：HUD 和大图走的是同一段绘制代码，
   * 标记尺寸、配色、图层顺序永远一致 —— 两套代码迟早出现
   * 「小地图上首领是红点、大图上是橙点」这类问题。 */
  paint(g, W, H, s, view) {
    if (!s || !view) return;
    const R = W / 2;
    const map = (typeof MAPS !== 'undefined') ? MAPS[s.mapId] : null;
    if (!map) return;
    const zs = (typeof mapZones === 'function') ? mapZones(s.mapId) : null;
    const cx = view.cx, cz = view.cz;
    const scale = view.scale;

    g.clearRect(0, 0, W, H);
    g.save();
    if (view.clip === 'rect') {
      g.beginPath(); g.rect(1, 1, W - 2, H - 2); g.clip();
    } else {
      g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.clip();
    }

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

    /* ---------- 坐标格（P03：只有大图放大后才画） ----------
     * 小地图 168px 上画格线会糊成一片噪点；大图放大到 2× 以上时，
     * 一格 25 米刚好能让人判断「这个房间大概 50 米长」。
     * 放在 zone 填充**之前**，不然格线会压在房间上面像划痕。 */
    if (view.grid) {
      const step = 25 * scale;                 // 25 米一格
      if (step >= 18) {                        // 太密就不画（缩到 0.5× 时 step≈9px）
        g.save();
        g.strokeStyle = 'rgba(216,178,90,.10)';
        g.lineWidth = 1;
        const x0 = tx(Math.floor((cx - R / scale) / 25) * 25);
        const z0 = tz(Math.floor((cz - R / scale) / 25) * 25);
        for (let x = x0; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let z = z0; z < H; z += step) { g.beginPath(); g.moveTo(0, z); g.lineTo(W, z); g.stroke(); }
        g.restore();
      }
    }

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

    /* ---------- 区域名（P03：只有大图才标） ----------
     * 小地图上标 12 个区名会糊成一片（168px 装不下），
     * 大图放大后每块区域有几十像素，标出来才「知道自己在哪个区」。
     * 字号不随缩放变（canvas 里 11px 是设备像素，放大后仍然清晰），
     * 但位置跟着 zone 中心走。 */
    if (view.grid && zs && zs.length) {
      g.save();
      g.font = '11px "STKaiti","KaiTi",serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const z of zs) {
        if (z.kind === 'link') continue;       // 走廊太窄，标了会溢出到相邻区
        const zx = tx(z.x), zz = tz(z.z);
        if (zx < -40 || zx > W + 40 || zz < -20 || zz > H + 20) continue;
        g.fillStyle = qMap[z.id] ? 'rgba(255,224,150,.92)' : 'rgba(190,178,150,.62)';
        g.fillText(z.name || z.id, zx, zz);
      }
      g.restore();
    }

    /* ---------- 视野扇形 ----------
     * [P03] 角度基准修正，见 _faceAngle() 的说明。
     * 扇形是以 **+x 方向**（canvas 的 0 弧度）为中线画的，所以直接用 faceAng。 */
    {
      const fa = this._faceAngle();
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

    /* ---------- NPC ----------
     * [P11] 可复命的 NPC 打一个金色「!」—— 用户报的是「悬赏完成了，
     * 不知道交给谁，NPC 也没提示」。地图上直接点名比追踪条更直接：
     * 追踪条说「交给 录事·闻书」，地图上那个位置就亮一个「!」。
     * 判定复用 QuestSys.readyOf（它已经按交付人匹配，含悬赏）。 */
    if (map.npcs) {
      for (const id of map.npcs) {
        const n = Game.npcs[id];
        if (!n) continue;
        const nx = tx(n.pos.x), nz = tz(n.pos.z);
        let ready = false;
        if (typeof QuestSys !== 'undefined' && QuestSys.readyOf && typeof giverOfNpc === 'function') {
          ready = QuestSys.readyOf(giverOfNpc(id)).length > 0;
        }
        if (ready) {
          /* 金色「!」：底色块 + 深色描边，缩到 82px 的面板上仍然认得出 */
          g.save();
          g.font = 'bold 15px "STKaiti","KaiTi",serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 3; g.strokeStyle = 'rgba(20,12,4,.9)';
          g.strokeText('!', nx, nz);
          g.fillStyle = '#ffd166';
          g.fillText('!', nx, nz);
          g.restore();
        } else {
          g.fillStyle = '#ffd166';
          g.beginPath(); g.arc(nx, nz, 4, 0, 7); g.fill();
        }
      }
    }

    /* ---------- 敌人 ---------- */
    for (const e of Game.enemies) {
      if (e.dead) continue;
      /* [M18.4] 世界 Boss 不画这个红点 —— 它有自己的星标（`drawWorldBoss`）。
       * 不跳过的话星标底下会压着一颗 6px 的红点，
       * 玩家看到的就是「一个带红底的金星」，和常驻首领的标记分不开。 */
      if (e.wb) continue;
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

    /* ---------- 幻域压暗（M18.5 · 九尾狐）----------
     * 铺在敌人 / 掉落**之后**、世界 Boss 星标**之前**：
     * 压暗的是「地形与杂兵」，星标和玩家箭头必须留着 ——
     * 玩家连自己在哪都看不见就不叫「幻域」，叫「小地图坏了」。 */
    const dimA = (typeof WorldBoss !== 'undefined' && WorldBoss.dim) ? WorldBoss.dim() : 0;
    if (dimA > 0) {
      g.save();
      g.globalAlpha = Math.min(0.75, dimA);
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    /* ---------- 世界 Boss 星标（M18.4）----------
     * 放在敌人 / 掉落**之后**画：它是全图唯一的事件级目标，
     * 被一只路过的小怪红点盖住就白做了。 */
    this.drawWorldBoss(g, tx, tz, scale);

    /* ---------- 玩家箭头 ----------
     * [P03] 箭头形状是「朝上」画的（moveTo(0,-9) 在 canvas 里是 -y = 屏幕上方），
     * 而 _faceAngle 给的是「朝 +x」的角度，两者差 90° —— 所以这里 +π/2。
     * 不补这 90° 的话，玩家朝北走箭头指东，正是用户报的「箭头不对」。 */
    const ang = this._faceAngle() + Math.PI / 2;
    g.save();
    g.translate(ppx, ppz); g.rotate(ang);
    g.fillStyle = '#f0e0b8';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3.5); g.lineTo(-6, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.restore();

    /* ---------- 边框 ---------- */
    if (view.clip === 'rect') {
      g.strokeStyle = 'rgba(216,178,90,.30)'; g.lineWidth = 2;
      g.strokeRect(1, 1, W - 2, H - 2);
    } else {
      g.strokeStyle = 'rgba(216,178,90,.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(R, R, R - 3, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1;
      g.beginPath(); g.arc(R, R, R - 6, 0, 7); g.stroke();
    }
  },

  /* [P03] 玩家朝向 → canvas 角度（以 +x 为 0，顺时针为正）。
   *
   * 这里踩过两个坑，写清楚免得下次又「看着不对就加个 90°」：
   *
   *   ① 世界 → 屏幕：`tz = R + (z - cz) * scale`，也就是 **+z 在画布上是向下**。
   *      所以世界朝向 (fx, fz) 映射到画布是 (fx, fz)，画布角度 = atan2(fz, fx)。
   *
   *   ② 旧代码写的是 `atan2(fx, fz)` —— 分子分母反了。它在 ±x 方向恰好对
   *      （atan2(±1,0) = ±π/2），在 ±z 方向整整差 180°：玩家朝北走，箭头朝南。
   *      这也是为什么「有时候看着对、有时候完全反」—— 玩家在城里转两圈就发现不对。
   *
   * 调用方注意：扇形以 +x 为中线，直接用这个角度；箭头是朝上画的，
   * 要自己 +π/2（见 paint 里玩家箭头那一段）。 */
  _faceAngle() {
    const f = (typeof Game !== 'undefined' && Game.playerFace) ? Game.playerFace : { x: 0, z: 1 };
    return Math.atan2(f.z, f.x);
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

  /* ============================================================
   * 世界 Boss 星标（M18.4）
   *
   * 为什么必须和别的标记长得不一样：小地图上已经有红点（首领）、
   * 橙点（精英）、黄点（NPC）、蓝钻（路标石）、绿三角（章出口）。
   * 世界 Boss 是全图唯一的事件级目标，用「又一个红点」表达，
   * 玩家会把它和常驻首领当成同一类东西，找不到也记不住。
   *
   * 所以它是一套**组合标记**，四层叠起来，任何单层都不与已有标记撞：
   *   ① 领域虚线圆 —— 和场景里那圈地面光环同半径，说「范围」
   *   ② 旋转刻度环 —— 实线细环 + 4 个缓慢公转的刻度，说「这是信标」
   *   ③ 双层五角星 —— 领域色实心 + 深色描边 + 白色高光心，说「这是谁」
   *   ④ 外发光 —— 颜色就是 ③ 的颜色，让它在满屏 zone 框里跳出来
   *
   * 颜色取 `cfg.domain.color`：六只各一色（金 / 绿 / 蓝 / 褐 / 红 / 紫），
   * 所以玩家在追踪行看到「毒沼领域」再打开地图，颜色是对得上的。
   *
   * 只画在**它当前所在的那张图**上。跨图不画边缘箭头 ——
   * 每张图的坐标系是各自独立的（size 140~300），跨图算出来的方向
   * 是假的，指错方向比不指更糟。「它在哪张图」交给追踪行说。
   *
   * 位置直接读 `WorldBoss.rec()` 的 (x,z)，与实体落点同源 ——
   * 不要读 `Game.enemies` 里那只的位置：它被吸引/击退后会移动，
   * 而星标要标的是「领域中心」。
   *
   * 尺寸说明：canvas 内部分辨率 336，CSS 显示 168（触屏 98 / 82）。
   * 所以这里的 1px 在手机上只有 0.24 CSS px —— 星标半径给到 15，
   * 缩到 82px 面板上还有 3.7 CSS px，比 6px 的红点（1.5 CSS px）大得多。
   * ============================================================ */

  /* 五角星路径：10 个顶点交替外/内半径。抽出来是因为要画两层
   * （外层领域色 + 内层高光），两次必须严格同形，否则会出现毛边。 */
  _starPath(g, x, z, rOut, rIn) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = (i % 2 === 0) ? rOut : rIn;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, pz); else g.lineTo(px, pz);
    }
    g.closePath();
  },

  /* 把 #rrggbb 往白色混 t（0~1）。
   * 只给星标填充用 —— 领域色是给横幅、光环、图鉴用的，
   * 那些地方面积大、看得清；星标只有 17px，饕餮的 #c07a3a
   * 压在小地图深褐底色上会糊成一团。提亮 18% 就够，不要改成另一个颜色。 */
  _lift(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(v => Math.round(v + (255 - v) * t));
    return 'rgb(' + ch.join(',') + ')';
  },

  drawWorldBoss(g, tx, tz, scale) {
    if (typeof WorldBoss === 'undefined' || !WorldBoss.rec) return;
    const r = WorldBoss.rec();
    if (!r) return;
    if (!Game.state || Game.state.mapId !== r.mapId) return;
    const cfg = (typeof worldBossById === 'function') ? worldBossById(r.id) : null;
    if (!cfg) return;
    if (r.killed) return;                // 已讨伐：地图上不该再有标记

    const dom = cfg.domain || {};
    const col = dom.color || '#ffd166';
    const x = tx(r.x), z = tz(r.z);

    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    /* 呼吸：0.88~1.12 倍，2.6 秒一个来回。
     * 静态五角星在满屏 zone 框里很容易被当成装饰，动起来才是「事件」。 */
    const k = 1 + Math.sin(now / 1000 * 2.4) * 0.12;

    /* ① 领域圈：和场景里那圈地面光环同一个半径，
     * 让「小地图上踩进去了」和「屏幕上踩进去了」是同一件事 */
    if (dom.radius) {
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      g.setLineDash([7, 6]);
      g.beginPath(); g.arc(x, z, dom.radius * scale, 0, 7); g.stroke();
      g.restore();
    }

    /* ② 信标环 + 公转刻度
     * 环是实线（虚线已经给了领域圈，两个都虚线就分不出层次）。
     * 环压到 alpha .32：它是「底座」，不能比星标抢眼 ——
     * 第一版环太亮、刻度太长，缩到 82px 的面板上看着像罗盘不像标记。 */
    g.save();
    g.globalAlpha = 0.32;
    g.strokeStyle = col;
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, z, 22.5 * k, 0, 7); g.stroke();
    g.globalAlpha = 0.8;
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    const spin = -now / 1000 * 0.7;
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 24.5 * k, z + Math.sin(a) * 24.5 * k);
      g.lineTo(x + Math.cos(a) * 28 * k, z + Math.sin(a) * 28 * k);
      g.stroke();
    }
    g.restore();

    /* ③ 双层五角星
     * 外层先铺一圈深色底再填领域色：小地图底色是深褐/深绿/深蓝，
     * 单靠填充色在「褐色地面 + 褐色领域」时（饕餮 · #c07a3a）会糊掉，
     * 加一圈墨色描边就永远有轮廓。
     * 尺寸 17.5 / 7.7（比值 0.44）：比值越小星角越细，
     * 0.38 的「标准五角星」填起来像一堆细刺，0.44 才像一枚徽章。 */
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 14;
    this._starPath(g, x, z, 17.5 * k, 7.7 * k);
    g.fillStyle = '#120a06';
    g.fill();
    g.restore();

    this._starPath(g, x, z, 17.5 * k, 7.7 * k);
    g.fillStyle = this._lift(col, 0.18);
    g.fill();
    g.strokeStyle = 'rgba(18,10,6,.92)';
    g.lineWidth = 2;
    g.stroke();

    /* 内层高光心：同形缩到 48%，暖白色半透明。
     * 作用是「这颗星有芯」—— 纯色块看起来像图标，有芯看起来像光源。 */
    g.save();
    g.globalAlpha = 0.45;
    this._starPath(g, x, z, 8.4 * k, 3.7 * k);
    g.fillStyle = '#fff6e2';
    g.fill();
    g.restore();
  },

  /* ============================================================
   * 大图（P03）
   *
   * 用户的原话是「小地图方向不对；不能放大」。方向那条见 _faceAngle()，
   * 这里做放大：点小地图 → 全屏大图 → 滚轮 / 双指缩放 → 拖动平移。
   *
   * 为什么不是「把 #miniWrap 直接放大」：
   *   ① 168px 的画布放大到 80vh 只是把马赛克吹大，看不清任何东西；
   *   ② 小地图要一直待在右上角报「我在哪个区」，不能被占掉。
   * 所以另开一张 720×720 的画布，用同一套 paint() 重画 —— 标记尺寸、
   * 图层顺序与 HUD 完全一致，只有视图（中心 + 缩放）不同。
   *
   * 缩放锚点必须是**鼠标位置**而不是画布中心：放大时想看的那一点要停在
   * 指针下面，否则每滚一格都要重新找位置（这也是用户说的「放大后想看的地方跑掉」）。
   *
   * 坐标约定：zoom 是相对「整图适配」的倍率，1.0 = 整张图刚好铺满；
   * 0.5 是缩出去看更大的范围（会留黑边，但有信息量），4.0 是 1/4 张图铺满屏幕。
   * ============================================================ */
  big: { open: false, zoom: 1, cx: 0, cz: 0, fit: null, base: 1, W: 720, H: 720, drag: null, pinch: 0 },

  openBig() {
    const s = (typeof Game !== 'undefined') ? Game.state : null;
    if (!s) return;
    const map = (typeof MAPS !== 'undefined') ? MAPS[s.mapId] : null;
    if (!map) return;
    const el = document.getElementById('mapBig');
    const cv = document.getElementById('mapBigCv');
    if (!el || !cv) return;
    const fit = this._fit(s, map);
    this.big.open = true;
    this.big.zoom = 1;
    this.big.cx = fit.cx; this.big.cz = fit.cz;
    this.big.fit = fit;
    this.big.W = cv.width; this.big.H = cv.height;
    this.big.base = (this.big.W / 2) / fit.span;
    this.big.drag = null; this.big.pinch = 0;
    el.classList.add('open');
    this._bindBig();
    this._syncZoomLabel();
    if (typeof SFX !== 'undefined') { try { SFX.ui(); } catch (e) { } }
  },

  closeBig() {
    const el = document.getElementById('mapBig');
    if (el) el.classList.remove('open');
    this.big.open = false;
    this.big.drag = null;
    this.big.pinch = 0;
  },

  _syncZoomLabel() {
    const el = document.getElementById('mapBigZoom');
    if (el) el.textContent = this.big.zoom.toFixed(1) + '×';
  },

  /* 平移范围：以整图中心为原点、±0.9 个 span 为界。
   * 不夹的话可以一直拖到「地图外面全是黑」，玩家会以为图坏了。 */
  _clampPan() {
    const b = this.big;
    if (!b.fit) return;
    const lim = b.fit.span * 0.9;
    b.cx = Math.min(b.fit.cx + lim, Math.max(b.fit.cx - lim, b.cx));
    b.cz = Math.min(b.fit.cz + lim, Math.max(b.fit.cz - lim, b.cz));
  },

  /* 以画布坐标 (mx,my) 为锚点缩放：该点下的世界坐标在缩放前后保持不动 */
  _zoomAt(mx, my, factor) {
    const b = this.big;
    if (!b.open) return;
    const R = b.W / 2;
    const z1 = Math.min(4, Math.max(0.5, b.zoom * factor));
    if (Math.abs(z1 - b.zoom) < 1e-4) return;
    const s0 = b.base * b.zoom;
    const wx = b.cx + (mx - R) / s0;
    const wz = b.cz + (my - R) / s0;
    b.zoom = z1;
    const s1 = b.base * z1;
    b.cx = wx - (mx - R) / s1;
    b.cz = wz - (my - R) / s1;
    this._clampPan();
    this._syncZoomLabel();
  },

  /* 屏幕坐标 → 画布内部坐标（画布 CSS 尺寸和 width 属性不是一回事） */
  _toCanvas(cv, clientX, clientY) {
    const r = cv.getBoundingClientRect();
    return {
      x: (clientX - r.left) / (r.width || 1) * cv.width,
      y: (clientY - r.top) / (r.height || 1) * cv.height,
      r: r
    };
  },

  _bindBig() {
    const el = document.getElementById('mapBig');
    const cv = document.getElementById('mapBigCv');
    if (!el || !cv || cv._bound) return;
    cv._bound = true;

    document.getElementById('mapBigClose').addEventListener('click', () => this.closeBig());
    /* 点遮罩（不是画布）也关 —— 大图是全屏层，玩家第一反应是点旁边退出 */
    el.addEventListener('click', ev => { if (ev.target === el) this.closeBig(); });

    cv.addEventListener('wheel', ev => {
      ev.preventDefault();
      const p = this._toCanvas(cv, ev.clientX, ev.clientY);
      this._zoomAt(p.x, p.y, ev.deltaY < 0 ? 1.16 : 1 / 1.16);
    }, { passive: false });

    /* 拖动平移。用 pointer 事件统一鼠标 / 单指；双指走下面的 touch 分支，
     * 所以 pointerdown 时若已有第二根手指就放弃拖动（否则会一边缩一边飘）。 */
    cv.addEventListener('pointerdown', ev => {
      if (this.big.pinch) return;
      cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
      this.big.drag = { x: ev.clientX, y: ev.clientY, cx: this.big.cx, cz: this.big.cz };
    });
    cv.addEventListener('pointermove', ev => {
      const d = this.big.drag;
      if (!d || this.big.pinch) return;
      const r = cv.getBoundingClientRect();
      const s = this.big.base * this.big.zoom;
      /* 屏幕位移 → 世界位移。除以 scale 是因为放大后同样的手指位移
       * 对应的世界距离更短（拖起来才「跟手」）。 */
      this.big.cx = d.cx - (ev.clientX - d.x) / (r.width || 1) * cv.width / s;
      this.big.cz = d.cz - (ev.clientY - d.y) / (r.height || 1) * cv.height / s;
      this._clampPan();
    });
    const endDrag = () => { this.big.drag = null; };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);

    /* 双指捏合：与 mobile.js 的摇杆互不影响 —— 这里只挂在大图画布上，
     * 而且 touch-action:none 已经写在 CSS 里，页面不会跟着缩放。 */
    cv.addEventListener('touchstart', ev => {
      if (ev.touches.length === 2) {
        this.big.drag = null;
        this.big.pinch = Math.hypot(
          ev.touches[0].clientX - ev.touches[1].clientX,
          ev.touches[0].clientY - ev.touches[1].clientY) || 1;
      }
    }, { passive: true });
    cv.addEventListener('touchmove', ev => {
      if (ev.touches.length !== 2 || !this.big.pinch) return;
      ev.preventDefault();
      const d = Math.hypot(
        ev.touches[0].clientX - ev.touches[1].clientX,
        ev.touches[0].clientY - ev.touches[1].clientY) || 1;
      const mx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
      const my = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
      const p = this._toCanvas(cv, mx, my);
      this._zoomAt(p.x, p.y, d / this.big.pinch);
      this.big.pinch = d;
    }, { passive: false });
    const endPinch = () => { this.big.pinch = 0; };
    cv.addEventListener('touchend', endPinch);
    cv.addEventListener('touchcancel', endPinch);
  },

  drawBig(s) {
    const cv = document.getElementById('mapBigCv');
    const b = this.big;
    if (!cv || !b.open) return;
    this.paint(cv.getContext('2d'), b.W, b.H, s, {
      cx: b.cx, cz: b.cz, scale: b.base * b.zoom, clip: 'rect',
      /* 1.25× 以上才画格线和区名：1.0× 时整图铺满，格线只会变成噪点 */
      grid: b.zoom > 1.25
    });
  },

  /* 点小地图开大图。只绑一次（draw 每帧都跑，不能每帧 addEventListener）。 */
  _bindMini() {
    const wrap = document.getElementById('miniWrap');
    if (!wrap || wrap._bound) return;
    wrap._bound = true;
    wrap.style.cursor = 'pointer';
    wrap.title = '点击放大地图';
    wrap.addEventListener('click', () => this.openBig());
  },
};
