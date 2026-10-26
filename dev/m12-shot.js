/* M12 视觉抽查：站在主厅中间截一张，再单独截小地图。
 * 用法：node dev/m12-shot.js [mapId]
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(f => fs.existsSync(f));
const MID = process.argv[2] || 'forest';

(async () => {
  const b = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--use-angle=swiftshader', '--window-size=1440,900']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await wait(1600);
  await p.click('#startBtn').catch(() => {});
  await wait(400);
  await p.evaluate((mid) => {
    Game.startNew('warrior', '刀');
    Game.state.level = 30; Game.recalc();
    Game.travelTo(mid);
  }, MID);
  await wait(2200);

  /* 站到主厅靠后的位置，镜头朝 -z 看向祭坛方向，能同时看到主厅 + 走廊口 */
  await p.evaluate((mid) => {
    const hz = zoneById(mid, 'hall');
    Game.playerGroup.position.set(hz.x + 2, 0, hz.z + 9);
    Game.state.playerPos = { x: hz.x + 2, z: hz.z + 9 };
    Game.camYaw = 0; Game.camDist = 16; Game.camPitch = 0.5;
    for (const e of Game.enemies) e.aggro = false;
    Game.state.hp = Game.state.stats.hpMax;
  }, MID);
  await wait(1500);
  await p.screenshot({ path: path.join(__dirname, 'm12-' + MID + '.png') });

  const mm = await p.$('#miniWrap');
  if (mm) await mm.screenshot({ path: path.join(__dirname, 'm12-' + MID + '-minimap.png') });

  /* 顺便量一下：这一屏里能看到几个区域的地面 */
  const info = await p.evaluate((mid) => {
    let n = 0, meshes = 0;
    Game.world.root.traverse(o => { if (o.isMesh) meshes++; if (o.userData && o.userData.zoneFloor) n++; });
    return { zones: mapZones(mid).length, zoneFloors: n, meshes,
      walls: (Game.world.walls && Game.world.walls.count) || null,
      calls: Game.renderer.info.render.calls };
  }, MID);
  console.log(MID, JSON.stringify(info));
  await b.close();
})();
