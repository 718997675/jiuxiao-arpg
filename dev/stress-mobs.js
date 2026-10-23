/* 压力测试：怪物数量 vs 渲染开销 / 内存 / 报错 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8905;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--js-flags=--expose-gc']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=压测`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));
const snap=async(label)=>{
  const s=await pg.evaluate(()=>({
    enemies:Game.enemies.length,
    calls:Game.renderer.info.render.calls,
    tris:Game.renderer.info.render.triangles,
    geo:Game.renderer.info.memory.geometries,
    tex:Game.renderer.info.memory.textures,
    progs:Game.renderer.info.programs?Game.renderer.info.programs.length:-1,
    parts:FX.parts.length,projs:FX.projectiles.length,zones:FX.zones.length,
    loot:Game.loot.length,
    heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1,
    fps:Game.perf&&Game.perf.fps
  }));
  console.log(label, JSON.stringify(s));
  return s;
};
await snap('baseline ');
// 分档加压
for(const n of [30,60,100,160]){
  await pg.evaluate((n)=>{
    const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
    for(let i=Game.enemies.length;i<n;i++){
      const a=Math.random()*6.28,r=6+Math.random()*14;
      const e=Game.spawnEnemy(kinds[i%kinds.length],Math.cos(a)*r,Math.sin(a)*r,false,8);
      if(e)e.aggro=true;
    }
  },n);
  await new Promise(r=>setTimeout(r,2500));
  await snap('n='+String(n).padEnd(7));
}
console.log('errors:',errs.length,errs.slice(0,3));
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
