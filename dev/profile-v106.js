/* 性能剖析：draw call 构成 / 粒子开销 / 阴影开销 / JS 每帧耗时 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8907;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1600));

// 埋点：分别统计 update / render 的耗时与 calls
await pg.evaluate(()=>{
  window.__prof={updateMs:0,renderMs:0,frames:0,calls:0};
  const r=Game.renderer, orig=r.render.bind(r);
  r.render=(s,c)=>{
    const t=performance.now(); orig(s,c);
    __prof.renderMs+=performance.now()-t;
    __prof.calls=r.info.render.calls;
    __prof.frames++;
  };
  const u=Game.update, ou=u.bind(Game);
  Game.update=(dt,raw)=>{const t=performance.now();ou(dt,raw);__prof.updateMs+=performance.now()-t;};
});
const sample=async(ms=1500)=>pg.evaluate(async(ms)=>{
  __prof.updateMs=0;__prof.renderMs=0;__prof.frames=0;
  await new Promise(r=>setTimeout(r,ms));
  const f=Math.max(1,__prof.frames);
  return {frames:f,upd:+(__prof.updateMs/f).toFixed(2),ren:+(__prof.renderMs/f).toFixed(2),calls:__prof.calls};
},ms);

const clearMobs=()=>pg.evaluate(()=>{Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];FX.clear();});
const setMobs=(n)=>pg.evaluate((n)=>{
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  for(let i=0;i<n;i++){const a=Math.random()*6.28,r=6+Math.random()*10;
    const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*r,Math.sin(a)*r,false,8);if(e)e.aggro=true;}
},n);

console.log('\n=== 场景：怪物数量 ===');
await clearMobs(); await new Promise(r=>setTimeout(r,300));
console.log(' 0 只 ', JSON.stringify(await sample()));
await clearMobs(); await setMobs(12); await new Promise(r=>setTimeout(r,300));
console.log('12 只 ', JSON.stringify(await sample()));
await clearMobs(); await setMobs(24); await new Promise(r=>setTimeout(r,300));
console.log('24 只 ', JSON.stringify(await sample()));
await clearMobs(); await setMobs(36); await new Promise(r=>setTimeout(r,300));
console.log('36 只 ', JSON.stringify(await sample()));

console.log('\n=== 场景：粒子 ===');
await clearMobs(); await new Promise(r=>setTimeout(r,300));
const burst=async(n,per)=>pg.evaluate(async(n,per)=>{
  // 持续 1.5 秒不停喷粒子，模拟 Boss 战
  const t0=performance.now();
  const iv=setInterval(()=>{
    for(let i=0;i<n;i++){
      const a=Math.random()*6.28,r=Math.random()*8;
      FX.burst(new THREE.Vector3(Game.playerGroup.position.x+Math.cos(a)*r,1,Game.playerGroup.position.z+Math.sin(a)*r),0xff8844,per,{speed:4,size:0.12,life:0.8,additive:true});
    }
  },60);
  await new Promise(r=>setTimeout(r,1500));
  clearInterval(iv);
  await new Promise(r=>setTimeout(r,900));
},n,per);
const s0=await sample(200); // 清场后基准
await burst(4,12);
console.log(' 喷完 4x12/60ms 后残留', JSON.stringify(await sample(1200)));

console.log('\n=== 场景：阴影开关 ===');
await clearMobs(); await setMobs(30); await new Promise(r=>setTimeout(r,400));
console.log('阴影 开', JSON.stringify(await sample()));
await pg.evaluate(()=>{Game.renderer.shadowMap.enabled=false;Game.dirtyShadows();});
await new Promise(r=>setTimeout(r,500));
console.log('阴影 关', JSON.stringify(await sample()));

console.log('\n=== 怪物单只成本 ===');
const unit=await pg.evaluate(()=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];
  Game.renderer.shadowMap.enabled=true;Game.dirtyShadows();
  const e=Game.spawnEnemy('halfork',0,6,false,8);
  let meshes=0,mats=new Set();
  e.actor.group.traverse(o=>{if(o.isMesh){meshes++;mats.add(o.material);}});
  return {meshes,mats:mats.size};
});
console.log(' halfork: meshes='+unit.meshes+' 独立材质='+unit.mats);

await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
