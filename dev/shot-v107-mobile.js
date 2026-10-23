/* 触屏下设置面板 / 帧数面板 / 按钮排布 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8921;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const shots=[
  {name:'shot-v107-m-settings.png', w:390, h:844, touch:true},
  {name:'shot-v107-m-land.png',     w:844, h:390, touch:true}
];
for(const s of shots){
  const pg=await b.newPage();
  await pg.setViewport({width:s.w,height:s.h,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await pg.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
  await pg.goto(`http://127.0.0.1:${PORT}/?cls=taoist&name=测`,{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,1900));
  const info=await pg.evaluate(()=>{
    Settings.d.fps=true; Settings.apply();
    UI.openSettings();
    const p=document.getElementById('setPanel');
    const r=p.getBoundingClientRect();
    const btns=[...document.querySelectorAll('#openBtns .btn')].map(x=>{
      const b=x.getBoundingClientRect();
      return {t:x.textContent.trim().slice(0,2),x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width)};
    });
    return {touch:IS_TOUCH,panel:{w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)},
      vh:window.innerHeight,btns,overflow:btns.some(x=>x.x<0||x.x+x.w>window.innerWidth)};
  });
  console.log('\n['+s.w+'x'+s.h+'] '+JSON.stringify(info));
  await new Promise(r=>setTimeout(r,500));
  await pg.screenshot({path:path.join(__dirname,s.name)});
  await pg.close();
}
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1);});
