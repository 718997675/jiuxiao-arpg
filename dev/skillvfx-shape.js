/* ============================================================
 * 逐只技能演出构成解析（U6-3 共用底座，纯 node，不启浏览器）
 *
 *   const { parseSkills } = require('./skillvfx-shape');
 *
 * 为什么从**实验室**解析而不是从 src/sfx.js：
 *   `docs/vfx-playground.html` 是唯一源，`src/sfx.js` 是生成物；
 *   量生成物等于量「上一次 --write 的产物」，改了源头却没重新生成时
 *   读数还是旧的。U1 踩过这个（实验室换了 spinBlades，游戏里还是 arc）。
 *
 * 解析口径（刻意不依赖括号配对）：
 *   按 `^id: {` + 后续 400 字内有 `cls:'` 切分技能，用**下一个技能起点**
 *   当边界。实验室的注释 / 模板字符串里到处是 `{`、`}`，括号配对会被
 *   注释里的半个大括号带偏；按锚点切分则完全不受影响。
 *   实测 37 个 `^id: {` 与 37 个 `v2(c){` 一一对应（含两个
 *   `Object.assign(SKILLS, {...})` 批次）。
 *
 * 每只量五件事，对应 SKILL-VFX-PLAN §13 与 U6-3 的「该几颗 / 什么色」：
 *   prims   FX.* 原语种类（剪影的物理构成）
 *   counts  n: 发数（该几颗）
 *   colors  C(E().xxx) 元素字段 + 0x 显式色（什么色）
 *   stages  delay / seq / addUpdate 的时间点（三段式）
 *   sil/cls/slot 剪影文案 / 职业 / 槽位（同职业 5 招能不能分开）
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLAYGROUND = path.join(ROOT, 'docs', 'vfx-playground.html');

/** 去掉块注释与行注释，避免注释里的示例代码被算进调用账。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 抓 v2(c){ ... } 的函数体：到 legacy(c){ 为止，没 legacy 就到技能块末尾。 */
function v2Body(block) {
  const a = block.indexOf('v2(c){');
  if (a < 0) return '';
  const l = block.indexOf('legacy(c){', a);
  return block.slice(a + 'v2(c){'.length, l > a ? l : block.length);
}

function parseSkills(html) {
  if (html === undefined) html = fs.readFileSync(PLAYGROUND, 'utf8');
  const start = html.indexOf('const SKILLS = {');
  if (start < 0) throw new Error('实验室里找不到 const SKILLS = {');
  const tail = html.slice(start);

  const re = /^([a-z][a-z0-9_]*):\s*\{\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(tail))) {
    if (/cls:\s*'/.test(tail.slice(m.index, m.index + 400))) {
      marks.push({ id: m[1], at: m.index });
    }
  }
  if (!marks.length) throw new Error('一个技能都没切出来（锚点或 cls 格式变了）');

  return marks.map((mk, i) => {
    const block = tail.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : tail.length);
    const head = block.slice(0, 400);
    const raw = v2Body(block);
    const code = stripComments(raw);

    /* 原语：只认 FX.<name>(，不把 THREE / Math / 局部变量算进去 */
    const prims = [...new Set(
      (code.match(/\bFX\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) || [])
        .map(x => x.replace(/^FX\./, '').replace(/\s*\($/, ''))
    )].sort();

    /* 非 FX 的视觉构件：实验室里大量演出是**手工拼 mesh + 自己的 updater**
     * 做出来的（heal 只有 FX.spr，但另有 flatMesh 地环 + 两个 addUpdate；
     * riposte 只有 FX.arc，但另有 billMesh 光晕 + addUpdate + 延迟第二刀）。
     * 只数 FX.* 会把这些判成「只有一个圈」—— U6-3 第一次跑就吃了这个假红。 */
    const builds = [...new Set(
      (code.match(/\b(flatMesh|billMesh|makeBeast|addUpdate)\s*\(/g) || [])
        .map(x => x.replace(/\s*\($/, ''))
    )].sort();
    const acting = [...new Set(
      (code.match(/\b(spinPlayer|lunge|swingArm|beastGait|beastFade)\s*\(/g) || [])
        .map(x => x.replace(/\s*\($/, ''))
    )].sort();
    const visualKinds = [...new Set([...prims, ...builds])].sort();

    /* 数量控制：n: 12 是最直白的一种，但实验室还有两种同样明确的写法 ——
     * `for(let i=0;i<10*Q();i++) FX.spr(...)` 逐颗放、
     * `[0,.18,.36].forEach(...)` 按字面量数组铺几段。
     * 只认 `n:` 会把 16 只判成「该几颗没写」，全是假红。 */
    const nNums = (code.match(/\bn:\s*(\d+)/g) || [])
      .map(x => parseInt(x.replace(/\D+/g, ''), 10));
    const nVars = (code.match(/\bn:\s*[A-Za-z_$][\w.$]*/g) || []).length;
    const loops = (code.match(/\bfor\s*\(/g) || []).length;
    const lits = (code.match(/\[\s*[-\d.,\s]+\]\s*\.\s*forEach/g) || []).length;
    /* 第四种：`if(Math.random() < dt*26)` 按速率发射（taiji / azuredragon /
     * whitetiger 的持续粒子）；第五种：手写固定个数的 `new THREE.Mesh`
     * （avatar 的三层佛光）。都算「数量有据」，只是不当判据 —— 见 audit 脚本。 */
    const rates = (code.match(/Math\.random\(\)\s*<\s*dt\s*\*/g) || []).length;
    const meshes = (code.match(/new THREE\.Mesh\s*\(/g) || []).length;
    const quantitySources = nNums.length + nVars + loops + lits + rates + meshes;

    /* 颜色：元素染色字段 C(E().glow) 之类 + 显式 0xRRGGBB。
     * hitArea 的 color:'#xxx' 是伤害数字的颜色，不算演出色，刻意不收。 */
    const elemFields = [...new Set(
      (code.match(/C\(\s*E\(\)\.([A-Za-z_][A-Za-z0-9_]*)\s*\)/g) || [])
        .map(x => x.replace(/^.*E\(\)\./, '').replace(/\s*\)$/, ''))
    )].sort();
    const hex = [...new Set(code.match(/0x[0-9a-fA-F]{6}/g) || [])].sort();

    /* 三段式时序：delay / seq / onHit / addUpdate 四种「第二段」骨架。
     * 不能只认 `delay(0.34,` 这种数字字面量 —— chain 写 `delay(i*0.055, ...)`、
     * heal 写 `delay(d, ...)`，变量延迟同样是分段；missile 的命中整段在
     * FX.projectile 的 onHit 回调里，飞行时间就是它的前摇。
     * 四种里出现 ≥2 种才算「不是一帧放完」。 */
    const delays = (code.match(/\bdelay\s*\(/g) || []).length;
    const seqs = (code.match(/\bseq\s*\(/g) || []).length;
    const onHits = (code.match(/\bonHit\s*\(/g) || []).length;
    const updaters = (code.match(/\baddUpdate\s*\(/g) || []).length;
    const times = (code.match(/\bdelay\(\s*([\d.]+)\s*,/g) || [])
      .map(x => parseFloat(x.match(/[\d.]+/)[0]))
      .concat((code.match(/\bseq\(\s*\[\s*\[\s*([\d.]+)\s*,/g) || [])
        .map(x => parseFloat(x.match(/[\d.]+/)[0])))
      .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const stageKinds = [delays > 0, seqs > 0, onHits > 0, updaters > 0].filter(Boolean).length;

    const str = (k) => {
      const mm = head.match(new RegExp(k + ":\\s*'([^']*)'"));
      return mm ? mm[1] : '';
    };
    return {
      id: mk.id,
      cls: str('cls'),
      slot: str('slot'),
      name: str('name'),
      sil: str('sil'),
      prims,
      builds,
      acting,
      visualKinds,
      nMax: nNums.length ? Math.max.apply(null, nNums) : 0,
      nCount: nNums.length,
      nVars,
      loops,
      lits,
      rates,
      meshes,
      quantitySources,
      elemFields,
      hex,
      times,
      delays,
      seqs,
      onHits,
      updaters,
      stageKinds,
      lines: raw.split('\n').length,
      raw: raw,
      code: code
    };
  });
}

module.exports = { parseSkills, PLAYGROUND, ROOT };
