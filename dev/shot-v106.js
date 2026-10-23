/* v1.0.6 画面回归：近处怪阴影 / 远处怪无阴影 / 粒子爆发 / 道士符 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8912;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
pg.on('pageerror',e=>console.log('  [pageerror]',e.message));
await pg.goto(`http://127.0.0.1:${PORT}/?cls=taoist&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));
await pg.evaluate(()=>{Game.tickPerf=()=>{};Game.perf.level=0;Game.perf.warm=99;});

// 近处三只 + 远处一圈
await pg.evaluate(()=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
  Game.mobTimer=-1e9;
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  for(let i=0;i<3;i++){
    const e=Game.spawnEnemy(kinds[i%kinds.length],-2.6+i*2.6,3.6,false,8);
    if(e){e.aggro=false;e.spd=0;e.actor.group.rotation.y=Math.PI;}
  }
  for(let i=0;i<14;i++){
    const a=(i/14)*6.2832,r=24+i%5;
    const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*r,Math.sin(a)*r,false,8);
    if(e){e.aggro=false;e.spd=0;}
  }
});
await new Promise(r=>setTimeout(r,1500));
await pg.screenshot({path:path.join(__dirname,'shot-v106-mobs.png')});
console.log(' 写出 shot-v106-mobs.png');

// 粒子爆发
await pg.evaluate(()=>{
  const p=Game.playerGroup.position;
  for(let i=0;i<8;i++){
    const a=Math.random()*6.28,r=Math.random()*6;
    FX.burst(new THREE.Vector3(p.x+Math.cos(a)*r,1.1,p.z+Math.sin(a)*r),0xffb04a,26,{speed:5,size:0.16,life:2.2,additive:true});
  }
});
await new Promise(r=>setTimeout(r,450));
await pg.screenshot({path:path.join(__dirname,'shot-v106-fx.png')});
console.log(' 写出 shot-v106-fx.png');
const st=await pg.evaluate(()=>{
  let pts=0,mesh=0,n=0;for(const p of FX.parts){p.obj.isPoints?pts++:mesh++;n+=p.n||0;}
  return {组:FX.parts.length,points:pts,普通mesh:mesh,粒子数:n,calls:Game.renderer.info.render.calls};
});
console.log(' 粒子状态', JSON.stringify(st));

// 符咒
await pg.evaluate(()=>{FX.clear();Game.cooldowns={};Game.castSkill&&Game.castSkill('talisman');});
await new Promise(r=>setTimeout(r,260));
await pg.screenshot({path:path.join(__dirname,'shot-v106-talisman.png')});
console.log(' 写出 shot-v106-talisman.png');

await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
