/* 探针：BOSS 的逻辑坐标 e.pos 与模型 a.group.position 会不会分离 */
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PORT=8930;
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const pg=await b.newPage();await pg.setViewport({width:1024,height:700});
const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,150)));
await pg.goto(`http://127.0.0.1:${PORT}/?cls=warrior&name=p`,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1700));

const out=await pg.evaluate(async()=>{
  Game.tickPerf=()=>{};
  Game.running=true; Game.dead=false;
  const s=Game.state;
  s.hp=s.stats.hpMax; s.mp=s.stats.mpMax;
  const res=[];

  const trial=(bossId,label,isBoss)=>{
    Game.enemies.forEach(e=>disposeTree(e.actor.group)); Game.enemies=[];
    Game.mobTimer=-1e9;
    const pos=isBoss===false?[0,10]:(BOSS_POS[bossId]||[0,10]);
    // 玩家站在怪身边，确保激活
    Game.playerGroup.position.set(pos[0]+3,0,pos[1]+3);
    Game.actor.group.position.copy(Game.playerGroup.position);
    const e=Game.spawnEnemy(bossId,pos[0],pos[1],false,8,isBoss===false?null:bossId);
    if(!e) return {label,err:'spawn failed'};
    e.active=true; if(isBoss!==false) Game.boss=e;
    let maxGap=0, maxPos=0, gapAt=null, outOfBounds=0, firstGap=null;
    const mapSize=(MAPS[Game.state.mapId]||{}).size||90;
    const half=mapSize/2;
    for(let i=0;i<1800;i++){
      // 每 300 帧拉近一次玩家，逼 Boss 用冲锋/位移技
      if(i%300===0){ Game.playerGroup.position.set(e.pos.x+2.5,0,e.pos.z+2.5); }
      if(i%120===0) e.patternCd=0;              // 频繁放技能
      try{ Game.updateEnemies(1/60); }catch(err){ return {label,err:String(err).slice(0,120)}; }
      const g=e.actor.group.position;
      const gap=Math.hypot(e.pos.x-g.x, e.pos.z-g.z);
      if(gap>0.05 && !firstGap){ firstGap={i,pos:[+e.pos.x.toFixed(2),+e.pos.z.toFixed(2)],grp:[+g.x.toFixed(2),+g.z.toFixed(2)]}; }
      if(gap>maxGap){ maxGap=gap; gapAt={i,pos:[+e.pos.x.toFixed(2),+e.pos.z.toFixed(2)],grp:[+g.x.toFixed(2),+g.z.toFixed(2)]}; }
      const r=Math.hypot(e.pos.x,e.pos.z);
      if(r>maxPos) maxPos=r;
      if(Math.abs(e.pos.x)>half||Math.abs(e.pos.z)>half) outOfBounds++;
      if(e.dead) break;
    }
    const g=e.actor.group.position;
    return {label, model:e.model, maxGap:+maxGap.toFixed(3), firstGap, gapAt, maxRadius:+maxPos.toFixed(1),
      torsoIsRoot: e.actor.parts.torso === e.actor.group,
      halfMap:half, outOfBounds, finalPos:[+e.pos.x.toFixed(1),+e.pos.z.toFixed(1)],
      finalGrp:[+g.x.toFixed(1),+g.z.toFixed(1)], visible:e.actor.group.visible,
      culled:!!e.culled, hp:Math.round(e.hp)};
  };

  for(const id of Object.keys(BOSSES)){
    res.push(trial(id,'BOSS:'+id,true));
  }
  for(const id of Object.keys(MONSTERS)){
    res.push(trial(id,'MOB:'+id,false));
  }
  return res;
});
const bad=out.filter(r=>r.err||r.maxGap>0.05);
console.log(JSON.stringify(out,null,1));
console.log('pageerrors:',errs.length?errs.slice(0,3):'none');
console.log(bad.length?'FAIL: '+bad.map(r=>r.label+'='+(r.err||r.maxGap)).join(', '):'PASS: '+out.length+' 个模型逻辑坐标与模型坐标完全同步');
await b.close();server.close();
if(bad.length||errs.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
