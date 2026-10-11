'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync(path.join(__dirname,'camera'))?__dirname:path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {GestureEngine,describe}=require(path.join(root,'camera/gesture-engine.js'));
const hand=extra=>({label:'Right',x:.5,y:.5,index:.8,middle:.8,my:.5,vx:.5,vy:.5,victory:false,...extra});
function engine(){const events=[];return {events,engine:new GestureEngine(e=>events.push(e))};}
function feed(test,frames){for(const [time,features] of frames)test.engine.update(features===null?[]:Array.isArray(features)?features:[hand(features)],time);}
function actions(test){return test.events.map(e=>e.action);}
function testGestures(){
 let t=engine();feed(t,[[0,{index:.1}],[100,{index:.1}],[200,{}],[300,{}],[400,{}]]);assert.deepEqual(actions(t),['toggle']);
 t=engine();feed(t,[[0,{index:.1}],[100,{index:.1}],[200,null],[300,{}]]);assert.deepEqual(actions(t),[],'Lost hand never acts as a click');
 t=engine();feed(t,[[0,{index:.1}],[100,{index:.1}],[300,{index:.1,x:.6}],[450,{index:.1,x:.7}],[550,{x:.7}]]);
 assert.deepEqual(actions(t),['seekStart','seekMove','seekEnd']);assert.equal(t.events[2].commit,true);assert.ok(Math.abs(t.events[1].delta-.2)<1e-9);
 t=engine();feed(t,[[0,{index:.1}],[100,{index:.1}],[300,{index:.1,x:.6}],[400,null]]);assert.deepEqual(actions(t),['seekStart','seekEnd']);assert.equal(t.events[1].commit,false);
 t=engine();feed(t,[[0,{index:.1}],[100,{index:.1}],[300,{index:.1,x:.6}],[900,{index:.1,x:.7}]]);assert.equal(t.events.at(-1).commit,false,'Frame stalls cancel drag');
 t=engine();feed(t,[[0,{index:.1}],[100,{index:.1,label:'Left'}],[200,{}]]);assert.deepEqual(actions(t),[],'Changing tracked hands never clicks');
 t=engine();feed(t,[[0,{middle:.1}],[100,{middle:.1}],[200,{middle:.1}],[310,{middle:.1,my:.3}],[420,{}]]);assert.deepEqual(actions(t),['volumeStart','volumeMove','volumeEnd']);assert.ok(Math.abs(t.events[1].delta-.36)<1e-9);
 for(const direction of [-1,1]){
  t=engine();feed(t,[[0,{victory:true}],[80,{victory:true,vx:.5+direction*.1}],[160,{victory:true,vx:.5+direction*.25}],[300,{victory:true,vx:.5+direction*.3}],[450,{}]]);
  assert.deepEqual(actions(t),['seek']);assert.equal(t.events[0].seconds,direction*10,'Swipe direction maps to mirrored camera');
 }
 t=engine();const pair=span=>[hand({index:.1,x:.5-span/2}),hand({index:.1,x:.5+span/2,label:'Left'})];
 feed(t,[[0,pair(.3)],[100,pair(.3)],[250,pair(.3)],[450,pair(.6)],[550,{}]]);
 assert.deepEqual(actions(t),['zoomStart','zoomMove','zoomEnd']);assert.ok(Math.abs(t.events[1].scale-2)<1e-9);
 t=engine();feed(t,[[0,{index:.1}],[100,pair(.3)],[200,pair(.3)],[350,pair(.3)],[550,pair(.6)],[650,null]]);assert.equal(actions(t).includes('toggle'),false);assert.equal(t.events.at(-1).commit,false);
 assert.equal(describe([]),null);assert.equal(describe(Array.from({length:21},()=>({x:NaN,y:0}))),null);
 const points=Array.from({length:21},()=>({x:.5,y:.5}));points[5]={x:.3,y:.6};points[17]={x:.7,y:.6};points[4]={x:.3,y:.2};points[8]={x:.34,y:.2};
 const feature=describe(points,'Right');assert.ok(Math.abs(feature.index-.1)<1e-9);assert.ok(Math.abs(feature.x-.68)<1e-9);
 console.log('PASS: deliberate clicks, timeline commit/cancel, lost hands/frame stalls, hand switching, volume, one-shot bidirectional swipes, two-hand zoom priority and landmark normalization.');
}
class Element{
 constructor(){this.style={};this.children=[];this.parentNode=null;this.textContent='';}
 appendChild(e){this.children.push(e);e.parentNode=this;return e;}append(...items){items.forEach(x=>this.appendChild(x));}attachShadow(){return new Element();}
}
async function testMedia(){
 let listener,clock=1000,watchdog,ad=false,failPlay=false;
 const v={isConnected:true,readyState:4,currentSrc:'video1',paused:false,currentTime:100,duration:600,volume:.5,muted:false,
  seekable:{length:1,start:()=>0,end:()=>600},getBoundingClientRect:()=>({width:640,height:480}),
  pauses:0,plays:0,pause(){this.paused=true;this.pauses++;},async play(){if(failPlay)throw Error('Autoplay');this.paused=false;this.plays++;}};
 let videos=[v];
 const ctx={document:{querySelectorAll:()=>videos,querySelector:()=>ad?{}:null,createElement:()=>new Element(),documentElement:new Element()},
  chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},Date:{now:()=>clock},setTimeout:()=>1,clearTimeout(){},setInterval(fn){watchdog=fn;}};
 vm.runInNewContext(read('tab-helper/media.js'),ctx);
 const send=(action,extra={})=>new Promise(resolve=>listener({type:'SWICH_VIDEO_COMMAND',controllerId:7,gestureId:'drag',action,...extra},{id:'test'},resolve));
 assert.equal((await send('toggle')).ok,true);assert.equal(v.paused,true);await send('toggle');assert.equal(v.paused,false);
 v.currentTime=595;await send('seek',{seconds:10});assert.equal(v.currentTime,600);v.currentTime=5;await send('seek',{seconds:-10});assert.equal(v.currentTime,0);
 v.currentTime=100;await send('seekStart');assert.equal(v.paused,true);await send('seekMove',{delta:.25});assert.equal(v.currentTime,100,'Drag is previewed until release');await send('seekEnd',{commit:true});assert.equal(v.currentTime,250);assert.equal(v.paused,false);
 await send('seekStart');await send('seekMove',{delta:.5});await send('cancel');assert.equal(v.currentTime,250);assert.equal(v.paused,false,'Cancelling resumes the previously playing video');
 v.pause();await send('seekStart');await send('seekMove',{delta:-1});await send('seekEnd',{commit:true});assert.equal(v.currentTime,0);assert.equal(v.paused,true,'Paused video remains paused after seeking');
 v.paused=false;await send('seekStart');clock+=3000;watchdog();await send('status');assert.equal(v.paused,false,'Lost controller releases timeline after timeout');
 await send('seekStart');v.currentSrc='video2';const oldPlays=v.plays;assert.equal((await send('seekMove',{delta:.3})).ok,false);await send('cancel');assert.equal(v.plays,oldPlays,'Never resume a different source');
 v.muted=true;await send('volumeStart');await send('volumeMove',{delta:.3});assert.equal(v.volume,.3);assert.equal(v.muted,false);await send('volumeEnd');
 v.volume=.9;await send('volumeStart');await send('volumeMove',{delta:1});assert.equal(v.volume,1);await send('volumeMove',{delta:-1});assert.equal(v.volume,0);await send('volumeEnd');
 assert.equal((await send('seekMove',{gestureId:'stale',delta:0})).ok,false,'Unmatched gesture cannot drag');
 ad=true;assert.equal((await send('seek',{seconds:10})).ok,false);ad=false;
 v.paused=true;failPlay=true;assert.match((await send('toggle')).error,/Click Play/);failPlay=false;
 videos=[];assert.equal((await send('status')).ok,false);assert.equal(listener({type:'SWICH_VIDEO_COMMAND'},{id:'other'},()=>assert.fail()),false);
 console.log('PASS: actual YouTube content script with simulated video/DOM: playback, bounded seeking, drag preview/release/cancel, watchdog, source changes, muted volume, ads and autoplay errors.');
}
async function testBackgroundAndBridge(){
 let listener,zoom=1.5;
 const calls=[],tabs=[{id:2,url:'https://www.youtube.com/watch?v=a',title:'Chosen video',incognito:false,windowId:10,active:false},{id:3,url:'https://www.youtube.com/watch?v=b',incognito:true},{id:4,url:'https://example.com/',incognito:false}];
 const sender={id:'test',frameId:0,url:'https://marwanahmed2023-creator.github.io/swich/camera.html',tab:{id:7,windowId:1,incognito:false}};
 const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},tabs:{async query(){return tabs;},async get(id){return tabs.find(t=>t.id===id)||{};},async sendMessage(id,msg){calls.push({id,...msg});return {ok:true,state:{paused:false}};},async getZoom(){return zoom;},async setZoomSettings(id,settings){calls.push({id,settings});},async setZoom(id,value){zoom=value;calls.push({id,zoom});},async update(id,opt){calls.push({id,...opt});}},windows:{async update(id,opt){calls.push({window:id,...opt});}}};
 vm.runInNewContext(read('tab-helper/background.js'),{URL,chrome});
 const send=(request,who=sender)=>new Promise(resolve=>listener(request,who,resolve));
 const command=(action,extra={},tabId=2)=>send({type:'SWICH_MEDIA_COMMAND',tabId,command:{action,gestureId:'g1',...extra}});
 assert.deepEqual(JSON.parse(JSON.stringify((await send({type:'SWICH_PING'})).capabilities)),['camera-media']);
 assert.deepEqual(JSON.parse(JSON.stringify((await send({type:'SWICH_MEDIA_LIST'})).tabs.map(t=>t.id))),[2]);
 await command('toggle');assert.equal(calls.at(-1).id,2,'Command targets chosen tab even when inactive');assert.equal(calls.at(-1).controllerId,7);
 for(const bad of [{action:'seek',seconds:20},{action:'volumeMove',delta:NaN},{action:'seekMove',delta:2},{action:'zoomMove',scale:99},{action:'unknown'}])assert.equal((await command(bad.action,bad)).ok,false);
 assert.equal((await command('toggle',{},3)).ok,false);assert.equal((await command('toggle',{},4)).ok,false);
 assert.equal((await send({type:'SWICH_MEDIA_LIST'},{...sender,url:'https://other.example/'})).ok,false);
 await command('zoomStart');await command('zoomMove',{scale:2.5});assert.equal(zoom,3);await command('zoomEnd');assert.equal((await command('zoomMove',{scale:1})).ok,false);
 zoom=.6;await command('zoomStart');await command('zoomMove',{scale:.4});assert.equal(zoom,.5);await command('cancel');
 await command('focus');assert.equal(calls.at(-2).active,true);assert.equal(calls.at(-1).focused,true);
 let bridgeListener;const posted=[],origin='https://marwanahmed2023-creator.github.io';
 const win={addEventListener(type,fn){bridgeListener=fn;},postMessage(data){posted.push(data);}};win.top=win;
 vm.runInNewContext(read('tab-helper/bridge.js'),{window:win,location:{origin,pathname:'/swich/camera.html'},chrome:{runtime:{sendMessage(req,reply){listener(req,sender,reply);}}}});
 const page=(type,id,extra={})=>bridgeListener({source:win,origin,data:{channel:'swich-tab-helper-v1',from:'page',type,id,...extra}});
 page('ping');assert.ok(posted.at(-1).capabilities.includes('camera-media'));
 const count=calls.length;page('media-command','once',{tabId:2,command:{action:'toggle'}});page('media-command','once',{tabId:2,command:{action:'toggle'}});await new Promise(setImmediate);
 assert.equal(calls.length,count+1,'Duplicate pending command executes once');page('media-command','once',{tabId:2,command:{action:'toggle'}});await new Promise(setImmediate);assert.equal(calls.length,count+1);
 console.log('PASS: actual extension background/bridge with simulated Chrome APIs: selected-tab routing, sender checks, validation, normal/private separation, per-tab zoom limits, focus and duplicate rejection.');
}
function staticChecks(){
 const html=read('camera.html'),app=read('camera/app.js'),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(match[1]),'Missing element '+match[1]);
 for(const file of ['camera.html','camera-setup.html'])for(const match of read(file).matchAll(/(?:src|href)="([^"#]+)"/g)){
  const link=match[1].split('?')[0];if(!/^https?:/.test(link)&&link!=='./')assert.ok(fs.existsSync(path.join(root,link)),'Missing asset '+link);
 }
 const manifest=JSON.parse(read('tab-helper/manifest.json'));assert.equal(manifest.version,'1.1.0');assert.deepEqual(manifest.host_permissions,['https://www.youtube.com/*','https://m.youtube.com/*']);
 for(const script of manifest.content_scripts.flatMap(s=>s.js))assert.ok(fs.existsSync(path.join(root,'tab-helper',script)));
 console.log('PASS: camera HTML controls, local asset links and extension package references.');
}
(async()=>{testGestures();await testMedia();await testBackgroundAndBridge();staticChecks();})().catch(error=>{console.error(error);process.exitCode=1;});
