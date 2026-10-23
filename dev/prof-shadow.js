/* v1.0.6 硬指标：阴影通道 draw call 数（确定性），不靠计时 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8909;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1600));

await pg.evaluate(()=>{
  Game.tickPerf=()=>{};
  Game.perf.level=0;Game.perf.warm=99;
  const R=Game.renderer, info=R.info;
  window.__sh=0;
  const sm=R.shadowMap, osm=sm.render.bind(sm);
  sm.render=(l,s,c)=>{const b0=info.render.calls;osm(l,s,c);window.__sh=info.render.calls-b0;};
});

const measure=async(half,radius,label)=>{
  const r=await pg.evaluate(async(half,radius,label)=>{
    Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
    Game.mobTimer=-1e9;
    const c=Game.sun.shadow.camera;
    c.left=-half;c.right=half;c.top=half;c.bottom=-half;c.updateProjectionMatrix();
    const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
    for(let i=0;i<36;i++){
      const a=(i/36)*6.2832, rr=radius*(0.55+0.45*((i%5)/4));
      const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*rr,Math.sin(a)*rr,false,8);
      if(e){e.aggro=false;e.spd=0;}
    }
    await new Promise(r=>setTimeout(r,900));
    const sh=window.__sh, main=window.__main;
    const tot=Game.renderer.info.render.calls;
    return {label,shadow:sh,total:tot,main:tot-sh,alive:Game.enemies.filter(e=>!e.dead).length};
  },half,radius,label);
  console.log(' '+label.padEnd(20), 'shadow='+String(r.shadow).padStart(4), ' main='+String(r.main).padStart(4), ' 合计='+String(r.total).padStart(4), ' 存活='+r.alive);
};

console.log('\n=== 36 只怪全在玩家 8 格内（阴影框应当全包含）===');
await measure(42,8,'视锥±42 · r8');
await measure(26,8,'视锥±26 · r8');
await measure(18,8,'视锥±18 · r8');

console.log('\n=== 36 只怪铺到 40 格（远处怪应被阴影剔除）===');
await measure(42,40,'视锥±42 · r40');
await measure(26,40,'视锥±26 · r40');
await measure(18,40,'视锥±18 · r40');

console.log('\n=== 无怪基准 ===');
await pg.evaluate(()=>{Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];});
await measure(26,0.001,'无怪 · ±26');

await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
