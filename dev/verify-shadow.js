/* 阴影是否真的在画：同场景开/关各截一张，比像素差 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8913;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:900,height:600});
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));
await pg.evaluate(()=>{Game.tickPerf=()=>{};Game.perf.level=0;Game.perf.warm=99;Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];Game.mobTimer=-1e9;});

const snap=async()=>Buffer.from(await pg.evaluate(()=>{
  const c=Game.renderer.domElement;
  const g=document.createElement('canvas');g.width=c.width;g.height=c.height;
  g.getContext('2d').drawImage(c,0,0);
  return g.toDataURL('image/png').split(',')[1];
}),'base64');

await pg.evaluate(()=>{Game.renderer.shadowMap.enabled=true;Game.dirtyShadows();});
await new Promise(r=>setTimeout(r,1200));
const on=await snap();
await pg.evaluate(()=>{Game.renderer.shadowMap.enabled=false;Game.dirtyShadows();});
await new Promise(r=>setTimeout(r,1200));
const off=await snap();
fs.writeFileSync(path.join(__dirname,'shot-shadow-on.png'),on);
fs.writeFileSync(path.join(__dirname,'shot-shadow-off.png'),off);
// 粗略比字节差：PNG 压缩后大小差本身就能说明画面变了多少
console.log(' shadow on  png bytes =',on.length);
console.log(' shadow off png bytes =',off.length);
console.log(' 相同? ', on.equals(off));

// 近处怪 vs 远处怪的 castShadow 状态
const st=await pg.evaluate(async()=>{
  Game.renderer.shadowMap.enabled=true;Game.dirtyShadows();
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  const near=Game.spawnEnemy(kinds[0],0,6,false,8);
  const far=Game.spawnEnemy(kinds[0],0,34,false,8);
  near.aggro=false;far.aggro=false;
  await new Promise(r=>setTimeout(r,900));
  const cnt=g=>{let n=0;g.traverse(o=>{if(o.isMesh&&o.castShadow)n++;});return n;};
  return {nearShadow:near.shadowOn,nearCasters:cnt(near.actor.group),farShadow:far.shadowOn,farCasters:cnt(far.actor.group)};
});
console.log(' 近处怪', JSON.stringify({shadowOn:st.nearShadow,casters:st.nearCasters}), ' 远处怪', JSON.stringify({shadowOn:st.farShadow,casters:st.farCasters}));
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
