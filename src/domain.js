/* ============================================================
 * 领域乘区（B16.6）—— 一块**会改玩家数值**的圈
 *
 * 45 只章节 Boss 里有十几只要「站在这里就难受」：毒沼扣血、水天减速、
 * 吞噬领域把你往里吸、幻域压掉小地图。世界 Boss 早就有一份实现
 * （`WorldBoss.domainTick`），但那份**绑死在「地图上只有一个世界 Boss」**上：
 * 圈心取自 `WorldBoss.rec()`，半径取自 `cfg.domain`，一辈子只有一块。
 * 章节 Boss 是战中被放出来的、可以同时有好几块、Boss 死了要跟着消失。
 *
 * 所以这里不重写那套数值逻辑，只补**「多块、有主、会消失」**这层壳：
 *
 *   ① 世界 Boss 的领域仍然归 `WorldBoss` 管（一个图一块、跟地点走）——
 *      这段代码一行没动，`domSlow` / `domAspd` / `_dim` 还是它写。
 *   ② 这里的圈写**另外两个字段** `fieldSlow` / `fieldAspd`，
 *      在两个消费点（移速公式、攻速公式）相加。
 *      **为什么要分开**：并进同一字段的话，世界 Boss 每帧归位会把它抹掉，
 *      而这里出圈时也要归位 —— 两个系统共用一个坑，谁后写谁说了算。
 *   ③ 视野是唯一的例外，见 `_sight()` 上的注。
 *
 * ---------------- 五条用真 bug 换来的规矩 ----------------
 *
 * 1. **单帧步长夹 0.1 秒**。切后台回来 `dt` 可能是 3 秒：不夹的话
 *    「吸力」会把人一次拉进模型里，「毒」会一次结算 3 跳。
 * 2. **持续伤害必须 `pierce: true`**。数据里写的是「每秒扣 0.6% 最大生命」，
 *    走普通通道就成了「扣 0.6% 再减护甲」—— 堆防御的人等于免疫领域，
 *    那这个机制对他不存在。
 * 3. **计时用 `while` + 1e-6 浮点补偿**。0.1 累加 10 次是 0.9999999999999999，
 *    严格比 1 小，会白等一帧才结算；秒级节拍上这一帧的抖动看得出来。
 * 4. **吸力 1.2 米以内不拉**。再拉就把人塞进 Boss 模型里，玩家会以为卡住了。
 * 5. **`ttl` 按帧递减，不用 `setTimeout`**。切图 / 死亡时 `setTimeout`
 *    不会取消 —— 回城之后毒圈还在读秒，然后炸你一次。
 * ============================================================ */

/* 预设：数据侧只写名字，数值留在这里。
 * 十二块领域一共六种效果，抄十二遍数字只会得到十二份各自漂移的版本。 */
const DOMAIN_PRESETS = {
  /* 毒沼：每秒 0.6% 最大生命。1% 太快（满血 100 秒死），0.3% 又感觉不到 */
  poison: { name: '毒沼', color: '#8fc24a', icon: '毒', player: { dotPct: 0.6, dotInterval: 1 } },
  /* 水天：移速 −30%。到 50% 就走不动了，30% 是「明显变慢但还能绕」 */
  tide: { name: '水天', color: '#5aa8d8', icon: '水', player: { slow: 30 } },
  /* 吞噬：每秒被拉近 2 米。3 米以上玩家按着反方向也走不掉 */
  devour: { name: '吞噬', color: '#c07a3a', icon: '噬', player: { pull: 2 } },
  /* 战意：攻速 −15%。和世界 Boss 刑天同档，别调 */
  warcry: { name: '战意', color: '#d85a4a', icon: '战', player: { aspd: -15 } },
  /* 幻域：小地图压暗 60% */
  illusion: { name: '幻域', color: '#9a7ad0', icon: '幻', player: { minimapDim: 0.6 } },
  /* 闭眼：视野压到 9 米 */
  daynight: { name: '闭眼', color: '#3a4a6a', icon: '夜', player: { sight: 9 } }
};

const Domains = {
  /* 场上所有领域。`add` 追加、`tick` 回收 —— 遍历一律倒着走，
   * 边遍历边 splice 是这类数组最经典的漏项。 */
  list: [],
  _dim: 0,
  _sightOn: false,

  /* ---------------- 挂一块领域 ----------------
   * `spec`：
   *   id / name / color / icon   显示用（缺省从 preset 补）
   *   preset                     'poison' | 'tide' | ...（补 player 与名字）
   *   x, z, r                    圆心与半径（米）
   *   follow()                   移动领域：每帧问一次圆心（返回 {x,z}）
   *   ttl                        存活秒数，0 / 不传 = 常驻到 `kill()`
   *   owner                      放出它的敌人；它死了这块领域跟着消失
   *   player                     { slow, aspd, dotPct, dotInterval, pull, sight, minimapDim }
   *   onTick(zone, dt, inside)   每个领域自己的额外结算（比如领域里再放冷箭）
   *   onEnter(zone) / onLeave(zone)
   *
   * 返回句柄 `{ zone, kill() }`。**谁创建谁收** —— 没人收的领域会一直挂在
   * `list` 里，直到换图。 */
  add(spec) {
    const s = spec || {};
    const pre = DOMAIN_PRESETS[s.preset] || {};
    const zone = {
      id: s.id || s.preset || 'domain',
      name: s.name || pre.name || '领域',
      color: s.color || pre.color || '#e0895a',
      icon: s.icon || pre.icon || '域',
      desc: s.desc || '',
      x: s.x || 0, z: s.z || 0,
      r: Math.max(0.6, s.r || 4),
      follow: s.follow || null,
      ttl: Math.max(0, s.ttl || 0),
      life: Math.max(0, s.ttl || 0),
      owner: s.owner || null,
      player: Object.assign({}, pre.player || {}, s.player || {}),
      onTick: s.onTick || null,
      onEnter: s.onEnter || null,
      onLeave: s.onLeave || null,
      _dotT: 0,
      _in: false,
      _seen: false,
      dead: false,
      /* 视觉：地面法阵与判定同半径（圈画多大就判多大） */
      mesh: null
    };
    /* 有柱子边界的阵型（毒沼 / 水天这类「场地」）；`follow` 的领域
     * 用法阵，因为它得跟着走，带柱子的东西满地图飘很怪。 */
    if (typeof FX !== 'undefined' && FX.field && !s.noVisual) {
      zone.mesh = FX.field(new THREE.Vector3(zone.x, 0, zone.z), {
        r: zone.r, life: zone.ttl > 0 ? zone.ttl : 9999,
        color: parseInt(String(zone.color).replace('#', ''), 16) || 0xe0895a,
        kind: s.kind || 'sigil', opacity: 0.55, spin: 0.18,
        follow: zone.follow
      });
    }
    this.list.push(zone);
    return {
      zone,
      kill: () => this.remove(zone)
    };
  },

  remove(zone) {
    if (!zone || zone.dead) return;
    zone.dead = true;
    /* 出圈提示要先补一次：玩家站在圈里的时候圈没了，buff 条得跟着走 */
    if (zone._in && zone.onLeave) { try { zone.onLeave(zone); } catch (e) {} }
    zone._in = false;
    const i = this.list.indexOf(zone);
    /* `slice` 之后再 splice 也行，但 `tick` 里也是倒着走的，
     * 这里直接按引用删，两条路径都只动一个元素。 */
    if (i >= 0) this.list.splice(i, 1);
  },

  /* 换图 / 死亡 / 回城：**一律**从这一条走。
   * 领域是场景的一部分，换图之后还留着就会出现「村里站在毒圈上」。 */
  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(this.list[i]);
    this.list.length = 0;
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (g) { g.fieldSlow = 0; g.fieldAspd = 0; }
    this._dim = 0;
    if (this._sightOn) this._sight(0);
  },

  /* ---------------- 每帧结算 ----------------
   * `Game.update` 里放在 `WorldBoss.domainTick` **之后**：
   * 那个函数每帧都会把 `domSlow/domAspd` 归位，我们写的是**另外两个字段**，
   * 顺序其实无关；但视野是共享的槽位（见 `_sight`），必须后写。 */
  tick(dt) {
    const g = (typeof Game !== 'undefined') ? Game : null;
    if (!g || !g.state || !g.playerGroup) return;
    const p = g.playerGroup.position;
    const quiet = g.dead || (g.state.hp || 0) <= 0;
    /* 单帧步长夹 0.1 秒，理由见文件头第 1 条 */
    const step = Math.max(0, Math.min(0.1, dt || 0));

    let slow = 0, aspd = 0, dim = 0, sight = 0;
    let seenZone = null;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      /* 主人没了 → 领域跟着散。Boss 死了毒圈还在毒你，是最冤的死法 */
      if (z.owner && (z.owner.dead || z.owner.gone)) {
        this.remove(z);
        continue;
      }
      if (z.ttl > 0) {
        z.ttl -= step;
        /* `1e-6` 而不是 `<= 0`：0.5 减 5 次 0.1 得到 1.39e-17，
         * 严格大于 0 —— 于是「0.5 秒的卵囊」会多活一帧，而玩家已经
         * 站在一个**看不见**的圈里挨了第 6 跳。和 DoT 那行是同一个浮点账。 */
        if (z.ttl <= 1e-6) { this.remove(z); continue; }
      }
      /* 移动领域：圆心每帧重新问一次。传快照的话「阵留在了原地」 */
      let cx = z.x, cz = z.z;
      if (z.follow) {
        const c = z.follow();
        if (c) { cx = c.x; cz = c.z; z.x = cx; z.z = cz; }
      }
      const inside = !quiet && Math.hypot(p.x - cx, p.z - cz) <= z.r;
      z._seen = true;

      if (inside !== z._in) {
        z._in = inside;
        if (inside && z.onEnter) { try { z.onEnter(z); } catch (e) {} }
        if (!inside && z.onLeave) { try { z.onLeave(z); } catch (e) {} }
      }
      if (z.onTick) { try { z.onTick(z, step, inside); } catch (e) {} }
      if (!inside) continue;

      seenZone = seenZone || z;
      const pl = z.player || {};

      /* ---- 移速 / 攻速：取最强的那个，不叠加 ----
       * 两块毒沼叠在一起不会变成两倍减速，但两块不同的领域会同时生效
       * （一块减速一块扣血）—— 那是玩家该读懂的东西，不是 bug。 */
      if (typeof pl.slow === 'number' && pl.slow > 0) slow = Math.max(slow, Math.min(0.8, pl.slow / 100));
      if (typeof pl.aspd === 'number') {
        /* 按**绝对值**取最强，符号照抄 —— 先 max 再乘符号的话，
         * 两块 −15% 会被算成 +15%（`Math.max(-15,-15)` 是 −15，
         * 但写成先取绝对值就翻成正的了，这一行踩过）。 */
        const a = Math.max(-60, Math.min(60, pl.aspd));
        if (Math.abs(a) > Math.abs(aspd)) aspd = a;
      }
      if (typeof pl.minimapDim === 'number') dim = Math.max(dim, Math.min(0.75, pl.minimapDim));
      /* 视野取**最紧**的那一档（压得最狠的说了算） */
      if (typeof pl.sight === 'number' && pl.sight > 0) sight = sight ? Math.min(sight, pl.sight) : pl.sight;

      /* ---- 持续伤害：每块领域自己记自己的账 ----
       * 共享一个计时器的话，走出 A 圈进 B 圈会「白嫖半跳」。 */
      if (typeof pl.dotPct === 'number' && pl.dotPct > 0) {
        const iv = Math.max(0.25, pl.dotInterval || 1);
        z._dotT += step;
        let guard = 0;
        while (z._dotT + 1e-6 >= iv && guard++ < 4) {
          z._dotT -= iv;
          const dmg = Math.max(1, (g.state.stats.hpMax || 100) * pl.dotPct / 100);
          /* pierce：见文件头第 2 条 */
          g.damagePlayer(dmg, null, { pierce: true });
          if (typeof FX !== 'undefined') {
            FX.text(new THREE.Vector3(p.x, 2.3, p.z), z.name, 'player', { life: 0.7 });
          }
        }
      }

      /* ---- 吸力：把人往圈心拉 ----
       * 1.2 米以内不拉（文件头第 4 条）；速度 6 m/s 封顶，
       * 再快就不是「被吸」而是「被瞬移」。 */
      if (typeof pl.pull === 'number' && pl.pull > 0) {
        const dx = cx - p.x, dz = cz - p.z;
        const len = Math.hypot(dx, dz);
        if (len > 1.2) {
          const v = Math.min(6, pl.pull) * step;
          const ux = dx / len, uz = dz / len;
          p.x += ux * v; p.z += uz * v;
          if (g.collideWorld) g.collideWorld(p, 0.55, { x: ux, z: uz });
        }
      }
    }

    g.fieldSlow = slow;
    g.fieldAspd = aspd;
    this._dim = dim;
    this._sight(sight);
    this._seenZone = seenZone;
  },

  /* ---------------- 视野 ----------------
   * 唯一的例外：**不复刻**雾色 / 天空 / 光照那套夜色算法，直接借用
   * `WorldBoss._applySight`。理由很实在 —— 那 40 行是拿真机调出来的
   * （「只压 far 不压雾色 = 屏幕一片亮白，玩家以为贴图没加载」），
   * 抄一份过来就等着两边走散。
   *
   * 代价是**一个槽位**：同一时刻只能有一块领域压视野。章节图与世界 Boss
   * 不同图，实际撞不上；真撞上时以世界 Boss 为准（这里直接跳过）。 */
  _sight(sight) {
    if (typeof WorldBoss === 'undefined' || !WorldBoss._applySight) return;
    /* 世界 Boss 领域正在生效 → 视野归它管，别去抢同一个 `_fogBase` */
    const wb = (typeof WorldBoss.domainState === 'function') ? WorldBoss.domainState() : null;
    if (wb && wb.inside) return;
    if (!(sight > 0)) {
      if (this._sightOn) { WorldBoss._restoreSight(); this._sightOn = false; }
      return;
    }
    WorldBoss._applySight(sight);
    this._sightOn = true;
  },

  /* 小地图压暗：和世界 Boss 那个取**较大的**（谁压得更狠听谁的） */
  dim() {
    const wb = (typeof WorldBoss !== 'undefined' && WorldBoss.dim) ? WorldBoss.dim() : 0;
    return Math.max(wb, this._dim || 0);
  },

  /* buff 条那一条。没站在圈里返回 null。
   * `noTimer` —— 领域没有「剩余秒数」（出去就没了），硬写 0.0s
   * 会让人以为快结束了。有 ttl 的（比如 6 秒卵囊）反过来要显示倒计时，
   * 那是玩家该抢的时间。 */
  buff() {
    const z = this._seenZone;
    if (!z) return null;
    return {
      name: z.name,
      dur: z.ttl > 0 ? z.ttl : 0,
      noTimer: !(z.ttl > 0),
      type: 'debuff',
      color: z.color,
      icon: z.icon,
      desc: z.desc || this._descOf(z)
    };
  },

  /* 一句人话：把 `player` 里那几个数翻成「每秒失去 0.6% 最大生命」这种。
   * 不写死文案 —— 改数值时文案跟着变，不然后人只能靠读代码。 */
  _descOf(z) {
    const pl = z.player || {}, out = [];
    if (pl.slow) out.push('移动速度 −' + pl.slow + '%');
    if (pl.aspd) out.push('攻击速度 ' + (pl.aspd > 0 ? '+' : '') + pl.aspd + '%');
    if (pl.dotPct) out.push('每秒失去 ' + pl.dotPct + '% 最大生命');
    if (pl.pull) out.push('每秒被拉近 ' + pl.pull + ' 米');
    if (pl.sight) out.push('视野压缩到 ' + pl.sight + ' 米');
    if (pl.minimapDim) out.push('小地图被迷雾遮蔽');
    return out.join('；');
  }
};
