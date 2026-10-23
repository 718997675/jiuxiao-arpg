/* 设置面板：渲染 / 交互 / 生效 / 持久化 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8920;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});

const results=[];
const ok=m=>{results.push(1);console.log('  [PASS] '+m);};
const bad=m=>{results.push(0);console.log('  [FAIL] '+m);};
const chk=(c,m)=>(c?ok(m):bad(m));

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});
const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=测`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));

/* ---------- 1. 模块与默认值 ---------- */
console.log('\n[1] 模块加载与默认值');
const s1=await pg.evaluate(()=>({
  hasSettings: typeof Settings==='object',
  d: Settings.d,
  rows: UI.SET_ROWS.length,
  hasOpen: typeof UI.openSettings==='function',
  hasSetFps: typeof UI.setFps==='function',
  applyInit: typeof Game.applyPerfLevel==='function'
}));
chk(s1.hasSettings && s1.d, 'Settings 已加载');
chk(s1.d.preset==='auto' && s1.d.scale==='auto' && s1.d.shadow==='auto', '默认是「自动」档');
chk(s1.rows===6, `设置项 6 组（实测 ${s1.rows}）`);

/* ---------- 2. 面板能打开、按钮齐全 ---------- */
console.log('\n[2] 面板渲染');
const s2=await pg.evaluate(()=>{
  UI.openSettings();
  const p=document.getElementById('setPanel');
  const rows=[...p.querySelectorAll('.setrow')];
  const btns=[...p.querySelectorAll('.sbtn')];
  const on=p.querySelectorAll('.sbtn.on').length;
  return {open:p.classList.contains('open'),rows:rows.length,btns:btns.length,
    onCount:on,labels:rows.map(r=>r.querySelector('.setlab').textContent.trim())};
});
chk(s2.open, '面板打开');
chk(s2.rows===6, `6 行设置（实测 ${s2.rows}）`);
chk(s2.onCount===6, `每组各有一个高亮项（实测 ${s2.onCount}）`);
chk(s2.labels.join(',').includes('渲染倍率')&&s2.labels.join(',').includes('同屏怪数'),
  `设置项：${s2.labels.join(' / ')}`);

/* ---------- 3. 点「极低」档，全部生效 ---------- */
console.log('\n[3] 极低档生效');
const s3=await pg.evaluate(async()=>{
  const btn=[...document.querySelectorAll('#setBody .sbtn')].find(b=>b.dataset.k==='preset'&&b.dataset.v==='min');
  btn.click();
  await new Promise(r=>setTimeout(r,300));
  const c=Settings.resolve(Game.perf.level);
  return {
    d:Settings.d,
    dpr:Game.renderer.getPixelRatio(),
    expectDpr:c.dpr,
    shadow:Game.renderer.shadowMap.enabled,
    fx:FX.q,
    mobCap:Game.mobCap,
    presetOn:document.querySelector('#setBody .sbtn[data-k="preset"].on').dataset.v
  };
});
chk(s3.d.preset==='min', '档位切到 min');
chk(Math.abs(s3.dpr-s3.expectDpr)<0.01 && s3.dpr<=0.55, `渲染倍率真的降了（dpr=${s3.dpr.toFixed(2)}）`);
chk(s3.shadow===false, '实时阴影已关');
chk(Math.abs(s3.fx-0.5)<0.01, `粒子降到 0.5 倍（实测 ${s3.fx}）`);
chk(s3.mobCap===12, `同屏怪数上限 12（实测 ${s3.mobCap}）`);
chk(s3.presetOn==='min', '按钮高亮跟到 min');

/* ---------- 4. 怪数上限真的生效 ---------- */
console.log('\n[4] 同屏怪数上限');
const s4=await pg.evaluate(()=>{
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];
  const kinds=MAPS[Game.state.mapId].spawns.length?MAPS[Game.state.mapId].spawns:['halfork'];
  let n=0;
  for(let i=0;i<40;i++) if(Game.spawnEnemy(kinds[i%kinds.length],2+i*0.1,8,false,8)) n++;
  const alive=Game.enemies.length;
  Game.enemies.forEach(e=>disposeTree(e.actor.group));Game.enemies=[];
  return {spawned:n,alive,cap:Game.mobCap};
});
chk(s4.spawned===12 && s4.alive===12, `上限 12 时只生成 12 只（实测 ${s4.spawned}）`);

/* ---------- 5. 单改一项 → 变自定义、自动降档停手 ---------- */
console.log('\n[5] 单项覆盖');
const s5=await pg.evaluate(async()=>{
  const btn=[...document.querySelectorAll('#setBody .sbtn')].find(b=>b.dataset.k==='shadow'&&b.dataset.v==='on');
  btn.click();
  await new Promise(r=>setTimeout(r,300));
  return {preset:Settings.d.preset,shadow:Game.renderer.shadowMap.enabled,
    auto:Settings.autoAdjust(),hint:document.getElementById('setHint').textContent.slice(0,20)};
});
chk(s5.preset==='custom', '改单项后档位变 custom');
chk(s5.shadow===true, '阴影被单独打开');
chk(s5.auto===false, '自定义档下自动降画质停手');

/* ---------- 6. 帧数面板 ---------- */
console.log('\n[6] 帧数面板');
const s6=await pg.evaluate(async()=>{
  const btn=[...document.querySelectorAll('#setBody .sbtn')].find(b=>b.dataset.k==='fps'&&b.dataset.v==='1');
  btn.click();
  await new Promise(r=>setTimeout(r,1500));
  const el=document.getElementById('fpsHud');
  return {shown:getComputedStyle(el).display!=='none',html:el.textContent.trim(),d:Settings.d.fps};
});
chk(s6.d===true, '设置里打开帧数');
chk(s6.shown, '帧数面板可见');
chk(/FPS/.test(s6.html)&&/draw/.test(s6.html), `面板内容：${s6.html}`);

/* ---------- 7. 持久化（刷新后仍在） ---------- */
console.log('\n[7] 刷新后保持');
await pg.reload({waitUntil:'load'});
await new Promise(r=>setTimeout(r,1800));
const s7=await pg.evaluate(()=>({
  d:Settings.d,
  dpr:Game.renderer.getPixelRatio(),
  shadow:Game.renderer.shadowMap.enabled,
  fpsShown:getComputedStyle(document.getElementById('fpsHud')).display!=='none',
  mobCap:Game.mobCap
}));
chk(s7.d.fps===true && s7.d.preset==='custom', '刷新后设置仍在');
chk(s7.shadow===true, '刷新后阴影状态保持');
chk(s7.fpsShown, '刷新后帧数面板自动出现');
chk(Math.abs(s7.dpr-0.5)<0.01, `刷新后分辨率仍是 0.5x（dpr=${s7.dpr.toFixed(2)}）`);

/* ---------- 8. 恢复默认 ---------- */
console.log('\n[8] 恢复默认');
const s8=await pg.evaluate(async()=>{
  Settings.reset();
  await new Promise(r=>setTimeout(r,300));
  return {d:Settings.d,dpr:Game.renderer.getPixelRatio(),shadow:Game.renderer.shadowMap.enabled,
    fx:FX.q,fpsShown:getComputedStyle(document.getElementById('fpsHud')).display!=='none'};
});
chk(s8.d.preset==='auto'&&s8.d.fps===false, '恢复成默认值');
chk(s8.shadow===true&&s8.dpr>0.9, `画质回到自动（dpr=${s8.dpr.toFixed(2)}）`);
chk(!s8.fpsShown, '帧数面板随之隐藏');

/* ---------- 9. 脏数据不炸 ---------- */
console.log('\n[9] 脏数据容错');
const s9=await pg.evaluate(()=>{
  const cases=[
    '{"preset":"不存在","scale":999,"shadow":"???","fx":null,"mobCap":"abc","fps":"yes"}',
    'null','[]','not json at all','{"scale":-5,"mobCap":99999}'
  ];
  const out=[];
  for(const c of cases){
    let o=null; try{o=JSON.parse(c);}catch(e){o=null;}
    const d=Settings.normalize(o);
    out.push({dpr:Settings.resolve(0).dpr,cap:Settings.resolve(0).mobCap,
      ok:typeof d.scale!=='undefined'&&typeof d.preset==='string'});
  }
  return out;
});
chk(s9.every(x=>x.ok), '五组脏数据都能 normalize 出合法值');
chk(s9.every(x=>x.dpr>=0.4&&x.dpr<=2), `分辨率被夹在 0.4~2（${s9.map(x=>x.dpr).join(' / ')}）`);
chk(s9.every(x=>x.cap>=12&&x.cap<=48), `怪数被夹在 12~48（${s9.map(x=>x.cap).join(' / ')}）`);

/* ---------- 10. 截图 ---------- */
await pg.evaluate(()=>{ Settings.reset(); UI.openSettings(); });
await new Promise(r=>setTimeout(r,600));
await pg.screenshot({path:path.join(__dirname,'shot-v107-settings.png')});
console.log('\n 写出 shot-v107-settings.png');

chk(errs.length===0,'无 JS 报错'+(errs.length?'：'+errs.slice(0,2).join(' | '):''));

await b.close();server.close();
const pass=results.filter(Boolean).length,fail=results.filter(x=>!x).length;
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
