const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8908;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1600));
const out=await pg.evaluate(()=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();
  const base=Game.renderer.info.render.calls;
  // 模拟 Boss 战：40 组 × 40 颗
  for(let i=0;i<40;i++){
    const a=Math.random()*6.28,r=Math.random()*6;
    FX.burst(new THREE.Vector3(Game.playerGroup.position.x+Math.cos(a)*r,1,Game.playerGroup.position.z+Math.sin(a)*r),0xff8844,40,{speed:4,size:0.1,life:3,additive:true});
  }
  const objs=new Set();let pts=0,mesh=0;
  FX.parts.forEach(p=>{objs.add(p.obj);pts++;p.obj.traverse(o=>{if(o.isMesh)mesh++;});});
  return {base,groups:FX.parts.length,sceneObjs:objs.size,extraMesh:mesh,
    particles:FX.parts.reduce((s,p)=>s+p.n,0),
    points:FX.parts.filter(p=>p.obj.isPoints).length};
});
console.log(JSON.stringify(out));
await new Promise(r=>setTimeout(r,300));
const calls=await pg.evaluate(()=>Game.renderer.info.render.calls);
console.log('粒子全开时 draw calls =',calls,'（基线',out.base,'）');
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
