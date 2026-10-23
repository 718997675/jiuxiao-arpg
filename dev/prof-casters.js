/* 直接数「谁在往 shadow map 里画」 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8911;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1600));
await pg.evaluate(()=>{Game.tickPerf=()=>{};Game.perf.level=0;Game.perf.warm=99;});

const probe=async(radius,label)=>pg.evaluate(async(radius,label)=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
  Game.mobTimer=-1e9;
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  for(let i=0;i<36;i++){
    const a=(i/36)*6.2832, rr=radius*(0.55+0.45*((i%5)/4));
    const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*rr,Math.sin(a)*rr,false,8);
    if(e){e.aggro=false;e.spd=0;}
  }
  await new Promise(r=>setTimeout(r,1200));
  // 统计整场景的 caster（不含视锥判断）
  let all=0, mobC=0, worldC=0, mobMesh=0;
  const inMob=new Set();
  for(const e of Game.enemies) if(!e.dead){inMob.add(e.actor.group);}
  Game.scene.traverse(o=>{
    if(!o.isMesh||!o.castShadow||!o.visible) return;
    let vis=true,p=o.parent;
    while(p){ if(!p.visible){vis=false;break;} p=p.parent; }
    if(!vis) return;
    all++;
    let isMob=false;
    for(const g of inMob){ if(g===o||g.getObjectById(o.id)){isMob=true;break;} }
    if(isMob) mobC++; else worldC++;
  });
  for(const e of Game.enemies){ if(!e.dead) e.actor.group.traverse(o=>{if(o.isMesh&&o.castShadow)mobMesh++;}); }
  return {label,alive:Game.enemies.length,shadowOn:Game.enemies.filter(e=>e.shadowOn).length,casterAll:all,mobCasters:mobC,worldCasters:worldC,mobMeshCasters:mobMesh};
},radius,label);

console.log('\n=== shadow map 里的投影体清点 ===');
for(const [r,l] of [[8,'r8'],[22,'r22'],[40,'r40']]) console.log(' '+JSON.stringify(await probe(r,l)));

const noMob=await pg.evaluate(async()=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];
  await new Promise(r=>setTimeout(r,600));
  let all=0;Game.scene.traverse(o=>{if(!o.isMesh||!o.castShadow||!o.visible)return;let v=true,p=o.parent;while(p){if(!p.visible){v=false;break;}p=p.parent;}if(v)all++;});
  return all;
});
console.log(' 纯世界投影体（无怪）= '+noMob);
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
