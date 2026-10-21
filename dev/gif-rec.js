/* 用 CDP screencast 录一段战斗动画，输出 docs/screenshots/demo.webp（主）+ demo.gif（兼容） */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const TMP = '/tmp/jx-frames';
const PY = '/Users/niekai/.workbuddy/binaries/python/envs/default/bin/python';
const TARGET = 32;

const PYSRC = `
import glob, os
from PIL import Image

files = sorted(glob.glob('${TMP}/*.jpg'))
frames = [Image.open(f).convert('RGB') for f in files]
w, h = frames[0].size

def rs(im, nw):
    return im.resize((nw, int(h * nw / w)), Image.LANCZOS)

big = [rs(f, 880) for f in frames]
wp = '${ROOT}/docs/screenshots/demo.webp'
big[0].save(wp, save_all=True, append_images=big[1:], duration=110, loop=0, quality=74, method=5)

small = [rs(f, 620).convert('P', palette=Image.ADAPTIVE, colors=200) for f in frames]
gp = '${ROOT}/docs/screenshots/demo.gif'
small[0].save(gp, save_all=True, append_images=small[1:], duration=110, loop=0, optimize=True, disposal=2)

for p in (wp, gp):
    print(os.path.basename(p), round(os.path.getsize(p) / 1024), 'KB')
`;

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 880, height: 495, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1500);

  await p.evaluate(() => {
    Game.startNew('warrior', '刀');
    const eq = Game.state.equipment;
    const plan = { helm: 'legendary', chest: 'set', shoulders: 'legendary', gloves: 'rare', boots: 'legendary', belt: 'rare', amulet: 'legendary', ring: 'rare', offhand: 'rare' };
    for (const sl of Object.keys(plan)) {
      try { const it = rollItem(32, { slot: sl, rarity: plan[sl], cls: 'warrior' }); it.reqLv = 1; if (sl === 'ring') eq.ring1 = it; else eq[sl] = it; } catch (e) {}
    }
    Game.state.level = 24; Game.recalc(); Game.applyDoll();
    Game.travelTo('swamp');
  });
  await wait(2600);

  // 三只怪，扇形摆在角色前方
  await p.evaluate(() => {
    const pg = Game.playerGroup.position;
    const alive = (Game.enemies || []).filter(e => !e.dead);
    alive.slice(0, 3).forEach((e, i) => {
      const ang = -0.62 + i * 0.62;
      const r = 3.9 + (i % 2) * 0.8;
      const nx = pg.x + Math.sin(ang) * r, nz = pg.z - Math.cos(ang) * r;
      e.pos.set(nx, 0, nz);
      if (e.actor) { e.actor.group.position.set(nx, 0, nz); e.actor.pos = e.pos; }
      e.hp = e.maxHp * (0.5 + 0.12 * i);
    });
    // 血量留够，别在录制中被打死
    Game.state.hp = Game.state.stats.hpMax;
    Game.state.mp = Game.state.stats.mpMax;
  });
  await wait(600);

  const client = await p.createCDPSession();
  const frames = [];
  client.on('Page.screencastFrame', async f => {
    frames.push(f.data);
    try { await client.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 84, maxWidth: 880, maxHeight: 495, everyNthFrame: 3
  });

  const t0 = Date.now();
  while (Date.now() - t0 < 3400) {
    await p.evaluate(() => {
      try {
        Game.atkCd = 0;
        Game.doBasicAttack();
        Game.state.hp = Game.state.stats.hpMax;      // 保持满血，画面干净
        (Game.enemies || []).forEach(e => {
          if (e.dead) return;
          e.hp = Math.max(e.maxHp * 0.3, Math.min(e.maxHp, e.hp + e.maxHp * 0.015));
        });
      } catch (e) {}
    }).catch(() => {});
    await wait(230);
  }

  try { await client.send('Page.stopScreencast'); } catch (e) {}
  await wait(300);
  await b.close();

  console.log('captured:', frames.length);
  if (frames.length < 10) { console.error('帧数太少'); process.exit(1); }

  const step = Math.max(1, Math.floor(frames.length / TARGET));
  const picked = [];
  for (let i = 0; i < frames.length && picked.length < TARGET; i += step) picked.push(frames[i]);
  picked.forEach((d, i) => fs.writeFileSync(path.join(TMP, `${String(i).padStart(3, '0')}.jpg`), Buffer.from(d, 'base64')));
  console.log('picked:', picked.length);

  console.log(execFileSync(PY, ['-c', PYSRC], { encoding: 'utf8' }));
})();
