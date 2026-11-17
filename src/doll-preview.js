/* ============================================================
 * [P5] 试衣间 · 离屏预览
 *
 * 角色面板里嵌一张 288×360 的 2D canvas。角色**不进主场景**，
 * 由同一个 Game.renderer 渲进一张 WebGLRenderTarget，再 readRenderTargetPixels
 * → ImageData → putImageData 到那张 2D canvas。
 *
 * **为什么不新建 WebGLRenderer**：手机上第二个 GL context 会挤掉第一个
 * （Chrome 上限 16 个，但移动端驱动常常只有 2~4 个），一开背包就把主画面
 * 弄黑。共用 renderer 是唯一安全的做法。
 *
 * **为什么不用 clone(Game.actor)**：clone 出来的 mesh 没有 `actor.__doll` 账本，
 * 再 dress 一次就是两件叠在一起、旧的还永远 release 不掉。走 Game.previewLook
 * 造一具独立角色，试穿不改真装备。
 *
 * 只在「面板可见 + 装备签名变了」时渲一次，不在每帧里跑。
 * ============================================================ */
(function (global) {
  'use strict';

  const W = 288, H = 360;
  /* 只有这些槽能穿上身。行囊里还有材料 / 丹药 / 凭证，它们也带 data-ref，
   * 不做这道过滤就会「悬停一张药方也去重渲一次人」。 */
  const EQ_SLOTS = {
    helm: 1, chest: 1, shoulders: 1, cloak: 1, gloves: 1, boots: 1, belt: 1,
    amulet: 1, relic: 1, fate: 1, weapon: 1, offhand: 1, ring1: 1, ring2: 1, ring: 1
  };
  let rt = null, buf = null, scene = null, cam = null;
  let sig = '', open = false, bound = false, checksum = 0, renders = 0;

  const canvas = () => document.getElementById('dpCanvas');
  const visible = () => {
    const c = canvas();
    /* offsetParent 为 null = display:none 的祖先链里藏着（面板关着 / 预览收起） */
    return !!(c && c.offsetParent !== null);
  };

  function ensure() {
    if (rt) return true;
    if (typeof THREE === 'undefined' || typeof Game === 'undefined' || !Game.renderer) return false;
    rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
    });
    buf = new Uint8Array(W * H * 4);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e131b);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x40382c, 1.15));
    const key = new THREE.DirectionalLight(0xffe9c4, 1.25);
    key.position.set(2.6, 4.2, 4.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x86a8ff, 0.55);
    rim.position.set(-3, 2.4, -2.6);
    scene.add(rim);
    cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 20);
    cam.position.set(0, 1.18, 4.7);
    cam.lookAt(0, 1.03, 0);
    return true;
  }

  function signature(eq, cls) {
    const out = [cls || '-'];
    for (const k of Object.keys(eq || {}).sort()) {
      const it = eq[k];
      out.push(k + ':' + (it ? (it.uid || it.uniqueId || it.relicId || it.name || 'x') : '-'));
    }
    return out.join('|');
  }

  /* 把独立角色换到预览场景（换职业时骨架会重建，得换掉旧的） */
  function mountLook(actor) {
    if (actor.group.parent === scene) return;
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const ch = scene.children[i];
      if (!ch.isLight) scene.remove(ch);
    }
    scene.add(actor.group);
  }

  function refresh(opt) {
    opt = opt || {};
    bind();
    const c = canvas();
    if (!c || !visible() || !Game.state) return false;
    if (!ensure()) return false;

    const eq = opt.equipment || Game.state.equipment || {};
    const cls = Game.state.cls;
    const s = signature(eq, cls) + (opt.peek ? '#peek' : '');
    if (!opt.force && s === sig) return false;       // 换装没变就不重画，省一次 GPU 同步
    sig = s;

    const actor = Game.previewLook(eq, cls);
    if (!actor || !actor.group) return false;
    mountLook(actor);

    const r = Game.renderer;
    const prevTarget = r.getRenderTarget();
    const prevScissor = r.getScissorTest();
    try {
      /* 主循环可能在 UI 事件之外给 renderer 设了 scissor（分屏 / 截图探针），
       * 这里必须还原，否则之后的主画面只剩一小条。 */
      if (prevScissor) r.setScissorTest(false);
      r.setRenderTarget(rt);
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    } finally {
      r.setRenderTarget(prevTarget);
      if (prevScissor) r.setScissorTest(true);
    }

    /* RT 读回来是**自下而上**的，直接 putImageData 会得到倒立的人 */
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    let sum = 0;
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      img.data.set(buf.subarray(src, src + W * 4), y * W * 4);
    }
    for (let i = 0; i < buf.length; i += 397) sum = (sum + buf[i]) % 1000000007;
    checksum = sum;
    renders++;
    ctx.putImageData(img, 0, 0);

    const cap = document.getElementById('dpCap');
    if (cap) {
      const worn = Object.keys(eq).filter(k => eq[k]).length;
      cap.textContent = opt.peek
        ? '试穿中 · 点一下就换上'
        : `已穿戴 ${worn} 件 · 悬停行囊里的装备可试穿`;
    }
    return true;
  }

  /* 悬停试穿：造一份「当前装备 + 这一件」的副本交给 previewLook，
   * 不写 Game.state.equipment —— 看一眼不等于穿上。 */
  function peek(item) {
    if (!item || !Game.state || !EQ_SLOTS[item.slot]) return false;
    const eq = Object.assign({}, Game.state.equipment);
    /* 物品槽只有 `ring`，装备栏却是 ring1 / ring2 —— 试穿先放左手那只，
     * 不然戒指悬停半天预览一点变化都没有。 */
    const slot = item.slot === 'ring' ? 'ring1' : item.slot;
    eq[slot] = item;
    return refresh({ equipment: eq, peek: true, force: true });
  }

  function restore() { return refresh({ force: true }); }

  function setOpen(v) {
    open = !!v;
    const body = document.getElementById('dpBody');
    const head = document.getElementById('dpHead');
    if (body) body.style.display = open ? '' : 'none';
    if (head) {
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      const fold = head.querySelector('.fold');
      if (fold) fold.style.transform = open ? '' : 'rotate(-90deg)';
    }
    if (open) refresh({ force: true });
  }

  function bind() {
    if (bound) return;
    bound = true;
    /* 桌面默认展开（左列有空间），触屏默认收起（竖屏一展开就把行囊顶出屏幕）。
     * 这里只摆 DOM 状态，不调 refresh —— 调用方那次 refresh 才是第一帧，
     * 在 bind 里再渲一次就是同一套装备渲两遍。 */
    open = (typeof IS_TOUCH === 'undefined') ? true : !IS_TOUCH;
    const body = document.getElementById('dpBody');
    const head = document.getElementById('dpHead');
    if (body) body.style.display = open ? '' : 'none';
    if (head) {
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      const f = head.querySelector('.fold');
      if (f) f.style.transform = open ? '' : 'rotate(-90deg)';
    }
    if (head) {
      const toggle = () => setOpen(!open);
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    }
    /* 事件委托：行囊格子是 renderEquipGrid 重画出来的，逐个绑定必然漏 */
    document.addEventListener('mouseover', e => {
      if (!open || !Game.state || e.target.closest === undefined) return;
      const el = e.target.closest('[data-ref^="inv:"]');
      if (!el) return;
      const uid = Number(el.dataset.ref.slice(4));
      const it = (Game.state.inventory || []).find(x => x.uid === uid);
      if (!it || !EQ_SLOTS[it.slot]) return;
      peek(it);
    });
    document.addEventListener('mouseout', e => {
      if (!open || e.target.closest === undefined) return;
      const from = e.target.closest('[data-ref^="inv:"]');
      if (!from) return;
      const to = e.relatedTarget;
      if (to && to.closest && to.closest('[data-ref^="inv:"]')) return;
      if (to && from.contains(to)) return;
      restore();
    });
  }

  global.DollPreview = {
    refresh, bind, peek, restore, setOpen,
    isOpen: () => open,
    /* 探针用：渲染次数 + 像素校验和（证明不是一张空图） */
    stats: () => ({ renders, checksum, w: W, h: H, hasRT: !!rt, open })
  };
})(typeof window !== 'undefined' ? window : globalThis);
