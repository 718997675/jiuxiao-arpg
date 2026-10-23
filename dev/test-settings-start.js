/* 标题界面也能进设置（低配机器要在开局前调好画质） */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8922;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
const out=[];const ok=m=>{out.push(1);console.log('  [PASS] '+m);};const bad=m=>{out.push(0);console.log('  [FAIL] '+m);};const chk=(c,m)=>(c?ok(m):bad(m));
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
await pg.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));

const s=await pg.evaluate(()=>{
  const start=document.getElementById('start');
  const inMenu=start && getComputedStyle(start).display!=='none';
  const btn=[...start.querySelectorAll('.bottom .btn')].find(b=>b.textContent.includes('设'));
  if(!btn) return {inMenu,hasBtn:false};
  btn.click();
  const p=document.getElementById('setPanel');
  const z=parseInt(getComputedStyle(p).zIndex,10);
  const zs=parseInt(getComputedStyle(start).zIndex,10);
  /* 面板中心点命中的是不是它自己（能点到才叫真在上面） */
  const r=p.getBoundingClientRect();
  const hit=document.elementFromPoint(r.left+r.width/2,r.top+12);
  return {inMenu,hasBtn:true,open:p.classList.contains('open'),z,zs,
    onTop:!!(hit&&p.contains(hit)),rows:p.querySelectorAll('.setrow').length};
});
chk(s.inMenu,'停在标题界面');
chk(s.hasBtn,'标题界面有「设置」按钮');
chk(s.open,'点开后设置面板已展开');
chk(s.z>s.zs,`面板层级 ${s.z} > 标题界面 ${s.zs}`);
chk(s.onTop,'面板没有被标题界面挡住（可点击）');
chk(s.rows===6,`设置项 6 组（实测 ${s.rows}）`);

await new Promise(r=>setTimeout(r,500));
await pg.screenshot({path:path.join(__dirname,'shot-v107-start.png')});
console.log('\n 写出 shot-v107-start.png');
chk(errs.length===0,'无 JS 报错'+(errs.length?'：'+errs[0]:''));
await b.close();server.close();
const pass=out.filter(Boolean).length,fail=out.filter(x=>!x).length;
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
