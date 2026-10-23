/* v1.0.5 → v1.0.6 同场景 A/B：每帧 draw call（主通道 / 阴影通道分开记） */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8918;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));
await pg.evaluate(()=>{
  Game.tickPerf=()=>{};Game.perf.level=0;Game.perf.warm=99;
  const R=Game.renderer;
  /* info.render.calls 在 r128 里会被中途 reset，读数不可信。
   * 直接 hook 最底层 renderBufferDirect，按「当前是否在离屏 renderTarget」分账：
   * 本项目唯一的离屏 pass 就是 shadow map，所以 rt!=null 即阴影通道。 */
  window.__sh=0;window.__main=0;window.__f=0;
  const orig=R.renderBufferDirect.bind(R);
  R.renderBufferDirect=(camera,scene,geometry,material,object,group)=>{
    if(R.getRenderTarget()) window.__sh++; else window.__main++;
    return orig(camera,scene,geometry,material,object,group);
  };
  const oren=R.render.bind(R);
  R.render=(s,c)=>{window.__f++;oren(s,c);};
  window.__realUpdateEnemies=Game.updateEnemies;
});

const scenario=async(n,radius,mode)=>{
  return pg.evaluate(async(n,radius,mode)=>{
    Game.updateEnemies=window.__realUpdateEnemies;
    Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
    Game.mobTimer=-1e9;
    const c=Game.sun.shadow.camera;
    const h=mode==='old'?42:26;
    c.left=-h;c.right=h;c.top=h;c.bottom=-h;c.updateProjectionMatrix();
    const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
    for(let i=0;i<n;i++){
      const a=(i/Math.max(1,n))*6.2832, rr=radius*(0.45+0.55*((i%7)/6));
      const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*rr,Math.sin(a)*rr,false,8);
      if(e){e.aggro=false;e.spd=0;}
    }
    await new Promise(r=>setTimeout(r,1400));
    if(mode==='old'){
      /* 模拟 v1.0.5：所有怪一律投影，且不随距离开关 */
      Game.updateEnemies=()=>{};
      Game.enemies.forEach(e=>{e.shadowOn=true;e.actor.group.traverse(o=>{if(o.isMesh)o.castShadow=true;});});
      await new Promise(r=>setTimeout(r,800));
    }
    window.__sh=0;window.__main=0;window.__f=0;
    await new Promise(r=>setTimeout(r,1200));
    const f=Math.max(1,window.__f);
    return {n,frames:f,main:Math.round(window.__main/f),shadow:Math.round(window.__sh/f),alive:Game.enemies.length};
  },n,radius,mode);
};

const line=(r,tag)=>{
  const tot=r.main+r.shadow;
  console.log('  '+(r.n+' 只').padStart(6)+'  '+tag.padEnd(8)+'  合计 '+String(tot).padStart(5)+'   主 '+String(r.main).padStart(4)+'   影 '+String(r.shadow).padStart(4)+'   ('+r.frames+' 帧采样)');
  return tot;
};

for(const [label,radius] of [['场景 A：怪物散布 6~40 格（战斗常态）',40],['场景 B：怪物全挤在 8 格内（Boss 战杂兵）',8]]){
  console.log('\n=== '+label+' ===');
  for(const n of [0,12,24,36]){
    const a=await scenario(n,radius,'old'); const ta=line(a,'v1.0.5');
    const b2=await scenario(n,radius,'new'); const tb=line(b2,'v1.0.6');
    if(ta>0) console.log('          → 每帧 '+(ta-tb)+' 个 draw call 省掉（'+((tb/ta-1)*100).toFixed(0)+'%）');
  }
}
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
