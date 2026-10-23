/* v1.0.6 A/B：阴影视锥范围 / 粒子批处理 各自贡献多少 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8908;
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
  window.__p={ren:0,fr:0,calls:0,shCalls:0};
  const r=Game.renderer, orig=r.render.bind(r);
  r.render=(s,c)=>{const t=performance.now();orig(s,c);__p.ren+=performance.now()-t;__p.calls=r.info.render.calls;__p.fr++;};
  /* 关键：钉死画质自适应。否则 tickPerf 会在测量途中改 dpr / 关阴影，
   * 一改就触发 dirtyShadows 全材质重编译，测出来的都是编译尖峰。 */
  Game.tickPerf=()=>{};
  Game.perf.level=0; Game.perf.warm=99;
  Game.renderer.setPixelRatio(1);
  Game.renderer.setSize(window.innerWidth,window.innerHeight);
});
const sample=async(ms=1400)=>{
  await pg.evaluate(async(ms)=>{__p.ren=0;__p.fr=0;await new Promise(r=>setTimeout(r,ms));},ms);
  return pg.evaluate(async(ms)=>{
    __p.ren=0;__p.fr=0;
    await new Promise(r=>setTimeout(r,ms));
    const f=Math.max(1,__p.fr);
    return {ren:+(__p.ren/f).toFixed(2),calls:__p.calls};
  },ms);
};

const clearMobs=()=>pg.evaluate(()=>{Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();});
const setMobs=(n)=>pg.evaluate((n)=>{
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  for(let i=0;i<n;i++){const a=Math.random()*6.28,r=5+Math.random()*12;
    const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*r,Math.sin(a)*r,false,8);if(e)e.aggro=false;}
},n);
const setFrustum=(half)=>pg.evaluate((half)=>{
  const c=Game.sun.shadow.camera;
  c.left=-half;c.right=half;c.top=half;c.bottom=-half;c.updateProjectionMatrix();
},half);

console.log('\n=== A/B：36 只怪 · 阴影视锥范围 ===');
await clearMobs(); await setMobs(36); await new Promise(r=>setTimeout(r,500));
await setFrustum(42); await new Promise(r=>setTimeout(r,1200));
console.log(' 视锥 ±42 (旧)  ', JSON.stringify(await sample()));
await setFrustum(26); await new Promise(r=>setTimeout(r,1200));
console.log(' 视锥 ±26 (新)  ', JSON.stringify(await sample()));
await setFrustum(18); await new Promise(r=>setTimeout(r,1200));
console.log(' 视锥 ±18       ', JSON.stringify(await sample()));
await setFrustum(26); await new Promise(r=>setTimeout(r,400));
await pg.evaluate(()=>{Game.renderer.shadowMap.enabled=false;Game.dirtyShadows();});
await new Promise(r=>setTimeout(r,1200));
console.log(' 阴影全关 (下限)', JSON.stringify(await sample()));
await pg.evaluate(()=>{Game.renderer.shadowMap.enabled=true;Game.dirtyShadows();});
await new Promise(r=>setTimeout(r,1200));

console.log('\n=== 粒子：喷射过程中取样（不再等它消失）===');
await clearMobs(); await new Promise(r=>setTimeout(r,400));
const live=async(groups,per,ms=1400)=>{
  await pg.evaluate((g,p)=>{
    window.__iv=setInterval(()=>{
      for(let i=0;i<g;i++){
        const a=Math.random()*6.28,r=Math.random()*8;
        FX.burst(new THREE.Vector3(Game.playerGroup.position.x+Math.cos(a)*r,1,Game.playerGroup.position.z+Math.sin(a)*r),0xff8844,p,{speed:4,size:0.12,life:1.6,additive:true});
      }
    },60);
  },groups,per);
  const s=await sample(ms);
  const info=await pg.evaluate(()=>{
    clearInterval(window.__iv);
    let pts=0,mesh=0;for(const p of FX.parts){p.obj.isPoints?pts++:mesh++;}
    return {groups:FX.parts.length,points:pts,meshes:mesh,particles:FX.parts.reduce((a,p)=>a+(p.n||0),0)};
  });
  return {s,info};
};
let r0=await live(0,0,600);
console.log(' 基准          ', JSON.stringify(r0.s));
let r1=await live(2,10);
console.log(' 2组×10/60ms   ', JSON.stringify(r1.s), JSON.stringify(r1.info));
await pg.evaluate(()=>FX.clear()); await new Promise(r=>setTimeout(r,500));
let r2=await live(6,14);
console.log(' 6组×14/60ms   ', JSON.stringify(r2.s), JSON.stringify(r2.info));
await pg.evaluate(()=>FX.clear()); await new Promise(r=>setTimeout(r,500));

console.log('\n=== 单只怪 draw call 归属 ===');
const unit=await pg.evaluate(()=>{
  const e=Game.spawnEnemy('halfork',0,6,false,8);
  let meshes=0,mats=new Set(),shadow=0;
  e.actor.group.traverse(o=>{if(o.isMesh){meshes++;mats.add(o.material);if(o.castShadow)shadow++;}});
  const before=Game.renderer.info.render.calls;
  return {meshes,mats:mats.size,casters:shadow};
});
console.log(' halfork: mesh='+unit.meshes+' 材质='+unit.mats+' 投影='+unit.casters);

await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
