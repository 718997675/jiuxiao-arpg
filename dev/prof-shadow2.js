/* 验证 v1.0.6 阴影距离裁剪的效果（与 prof-shadow.js 同场景口径对比） */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8910;
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
  Game.tickPerf=()=>{};Game.perf.level=0;Game.perf.warm=99;
  const R=Game.renderer,info=R.info;
  window.__sh=0;window.__main=0;
  const sm=R.shadowMap,osm=sm.render.bind(sm);
  sm.render=(l,s,c)=>{const b0=info.render.calls;osm(l,s,c);window.__sh=info.render.calls-b0;};
  const oren=R.render.bind(R);
  R.render=(s,c)=>{const b0=info.render.calls;oren(s,c);window.__main=(info.render.calls-b0)-window.__sh;};
});
const run=async(radius,label)=>{
  const r=await pg.evaluate(async(radius,label)=>{
    Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
    Game.mobTimer=-1e9;
    const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
    for(let i=0;i<36;i++){
      const a=(i/36)*6.2832, rr=radius*(0.55+0.45*((i%5)/4));
      const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*rr,Math.sin(a)*rr,false,8);
      if(e){e.aggro=false;e.spd=0;}
    }
    await new Promise(r=>setTimeout(r,1500));
    const casting=Game.enemies.filter(e=>e.shadowOn).length;
    return {label,shadow:window.__sh,main:window.__main,casting,alive:Game.enemies.length};
  },radius,label);
  console.log(' '+r.label.padEnd(14),'shadow='+String(r.shadow).padStart(4),' main='+String(r.main).padStart(4),' 合计='+String(r.shadow+r.main).padStart(4),' 投影中='+r.casting+'/'+r.alive);
};
console.log('\n=== v1.0.6 阴影距离裁剪后（视锥 ±26，投影距离 20）===');
await run(8,'r8');
await run(22,'r22');
await run(40,'r40');
console.log('\n（对照 v1.0.5 口径：r8 shadow=1093 / r40 shadow=790）');
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
