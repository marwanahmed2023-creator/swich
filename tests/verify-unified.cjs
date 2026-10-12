'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {WireEngine}=require('../camera/wire-engine.js'),{GestureEngine,describe}=require('../camera/gesture-engine.js');
function wire(){
 const events=[];let now=0;const engine=new WireEngine(c=>events.push(c));
 const feed=(value,ms)=>{for(let t=0;t<ms;t+=20){now+=20;engine.update(value,now);}};
 feed(445,400);return {events,engine,feed,tap(){feed(951,120);feed(445,140);},gap(ms){now+=ms;engine.tick(now);}};
}
function wireTests(){
 for(let count=1;count<=4;count++){
  const w=wire();for(let i=0;i<count;i++)w.tap();assert.equal(w.events.length,0,'Wait to distinguish a group');w.feed(445,900);
  assert.equal(w.events.length,1);assert.equal(w.events[0].action,['','toggle','seek','seek','shortcuts'][count]);
  if(count===2||count===3)assert.equal(w.events[0].seconds,count===2?-10:10);
  w.feed(445,4000);assert.equal(w.events.length,1,'No duplicate action from an idle wire');
 }
 for(let count=1;count<=4;count++){
  const w=wire();for(let i=1;i<count;i++)w.tap();w.feed(951,2200);w.feed(445,1500);
  const kind=count<=2?'volume':'scroll',sign=count%2?1:-1;
  assert.equal(w.events[0].action,kind+'Start');assert.ok(w.events.some(e=>e.action===kind+'Move'&&Math.sign(e.delta)===sign));
  assert.equal(w.events.at(-1).action,kind+'End');assert.equal(w.events.at(-1).commit,true);
  assert.ok(w.events.every(e=>e.action.startsWith(kind)),'A hold never also executes the shorter tap action');
 }
 let w=wire();w.feed(950,20);w.feed(445,1200);assert.equal(w.events.length,0,'One spike does not become a tap');
 w=wire();w.feed(951,1200);w.gap(650);assert.equal(w.events.at(-1).commit,false);const n=w.events.length;w.feed(951,2000);assert.equal(w.events.length,n,'Stale data requires release');w.feed(445,400);w.tap();w.feed(445,900);assert.equal(w.events.at(-1).action,'toggle');
 w=wire();w.tap();w.gap(650);w.feed(445,1500);assert.equal(w.events.length,0,'Dropped Bluetooth burst cannot play late');
 w=wire();w.tap();w.feed(445,1000);w.tap();w.feed(445,1000);assert.deepEqual(w.events.map(e=>e.action),['toggle','toggle'],'Widely spaced taps form separate groups');
 w=wire();for(let i=0;i<4;i++){w.feed(951,160);w.feed(445,600);}w.feed(445,600);assert.equal(w.events[0]?.action,'shortcuts','Four deliberate taps within three seconds');
 console.log('PASS: wire 1–4 taps, all four holds, no tap after hold, noise, idle separation, stale stream cancellation and release recovery.');
}
function flickTests(){
 for(const direction of [-1,1]){
  const events=[],e=new GestureEngine(c=>events.push(c));const update=(t,x,y,pose='flick')=>e.update([{pose,label:'Right',x,y}],t);
  update(0,.5,.5);update(200,.5,.5);update(300,.54,.5+direction*.06);update(400,.58,.5+direction*.12);update(700,.58,.5+direction*.2);
  assert.deepEqual(events,[{action:'scroll',direction}],'A diagonal conductor flick scrolls once, without changing volume');
  update(800,.5,.5,'rest');update(1100,.5,.5,'rest');update(1200,.5,.5);update(1400,.5,.5);update(1500,.5,.5-direction*.06);
  assert.equal(events.length,2);assert.equal(events[1].direction,-direction);
 }
 let events=[],e=new GestureEngine(c=>events.push(c));for(let t=0;t<=5000;t+=100)e.update([{pose:'flick',label:'Right',x:.5,y:.5+t*.00004}],t);
 assert.equal(events.length,0,'Slow drift does not count as a flick');e.update([{pose:'flick',label:'Right',x:.5,y:.78}],5100);assert.equal(events[0]?.action,'scroll','Flick works after waiting, without a timing deadline');
 // Real landmark classification at a 35-degree slant and its mirror.
 const p=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.9};
 [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07;for(let j=0;j<4;j++)p[base+j]={x,y:[.65,.55,.65,.71][j]};});
 p[2]={x:.34,y:.75};p[3]={x:.3,y:.7};p[4]={x:.28,y:.75};
 for(let j=0;j<4;j++){const d=j*.1;p[5+j]={x:.4-d*.7,y:.65-d};}
 assert.equal(describe(p).pose,'flick');assert.equal(describe(p.map(a=>({x:1-a.x,y:a.y}))).pose,'flick');
 console.log('PASS: slanted landmarks in either hand, diagonal up/down flicks, one action per flick, deliberate rearming and slow drift rejection.');
}
async function routingTests(){
 let listener,active=2,holdProbe=null;const calls=[],saved={};
 const controller={id:7,url:'https://marwanahmed2023-creator.github.io/swich/camera.html',windowId:1,incognito:false};
 const tabs=[controller,{id:2,url:'https://example.org/watch',windowId:1,incognito:false},{id:3,url:'https://example.net/list',windowId:1,incognito:false},{id:4,url:'chrome://settings',windowId:1,incognito:false},{id:5,url:'https://example.net/private',windowId:2,incognito:true}];
 const sender={id:'test',frameId:0,url:controller.url,tab:controller};
 const chrome={runtime:{id:'test',onMessage:{addListener(f){listener=f;}}},windows:{},storage:{session:{async get(){return saved;},async set(v){Object.assign(saved,v);}}},tabs:{
  async get(id){return {...tabs.find(t=>t.id===id)};},async query(q){return q.active?[{...tabs.find(t=>t.id===active)}]:tabs;},
  async sendMessage(id,msg,options){calls.push({id,...msg,...options});return {ok:true};}
 },scripting:{async executeScript(req){if(req.files)return [];if(holdProbe){const f=holdProbe;holdProbe=null;await f();}return [{frameId:0,documentId:'main-'+req.target.tabId,result:{state:null}},{frameId:8,documentId:'embedded-'+req.target.tabId,result:{state:{paused:false,kind:'video'},rank:100}}];}}};
 vm.runInNewContext(read('tab-helper/background.js'),{chrome,URL,setTimeout,clearTimeout});
 const send=(action,extra={},tabId='active',source='camera')=>new Promise(resolve=>listener({type:'SWICH_MEDIA_COMMAND',tabId,source,command:{action,gestureId:'gesture',...extra}},sender,resolve));
 await send('pause');assert.equal(calls.at(-1).id,2);assert.equal(calls.at(-1).documentId,'embedded-2','Media routes to embedded player document');
 active=7;await send('pause');assert.equal(calls.at(-1).id,2,'Controller retains the last webpage');
 active=3;await send('scroll',{direction:1});assert.equal(calls.at(-1).documentId,'main-3','Scrolling targets the page rather than embedded media');
 await send('volumeStart',{},'active','wire');active=2;const before=calls.length;assert.equal((await send('volumeMove',{delta:.5},'active','wire')).ok,false);assert.equal(calls.slice(before).some(c=>c.action==='volumeMove'),false,'A held gesture never migrates to a newly selected tab');assert.equal(calls.at(-1).action,'cancel');assert.equal(calls.at(-1).id,3);
 active=4;assert.equal((await send('pause')).ok,false,'Protected browser pages are excluded');active=5;assert.equal((await send('pause')).ok,false,'Private mode stays separate');
 active=2;assert.equal((await send('pause',{},3)).ok,true);assert.equal(calls.at(-1).id,3,'Explicitly pinned target stays pinned');
 let release;holdProbe=()=>new Promise(r=>release=r);const changing=send('play');await new Promise(setImmediate);active=3;release();assert.equal((await changing).ok,false,'Switching tabs during frame discovery cancels the old action');
 console.log('PASS: automatic and pinned targeting, embedded document routing, scrolling the top page, private/protected restrictions, and tab-switch cancellation.');
}
wireTests();flickTests();routingTests().catch(e=>{console.error(e);process.exitCode=1;});
