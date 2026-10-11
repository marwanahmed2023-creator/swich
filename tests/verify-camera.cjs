'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync(path.join(__dirname,'camera'))?__dirname:path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {GestureEngine,describe}=require(path.join(root,'camera/gesture-engine.js'));
const hand=extra=>({label:'Right',pose:'rest',count:0,x:.5,y:.5,...extra});
function engine(){const events=[];return {events,engine:new GestureEngine(e=>events.push(e))};}
function feed(test,frames){for(const [time,features] of frames)test.engine.update(features===null?[]:Array.isArray(features)?features:[hand(features)],time);}
function actions(test){return test.events.map(e=>e.action);}
function landmarks(raised=[],thumb=false){
 const p=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.9};
 [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07,up=raised.includes(i);p[base]={x,y:.65};p[base+1]={x,y:up?.47:.55};p[base+2]={x,y:up?.36:.65};p[base+3]={x,y:up?.27:.71};});
 p[1]={x:.38,y:.82};p[2]={x:.34,y:.75};p[3]={x:.30,y:thumb?.56:.70};p[4]={x:.28,y:thumb?.40:.75};return p;
}
function testGestures(){
 let t=engine();feed(t,[[0,{pose:'like'}],[300,{pose:'like'}],[650,{pose:'like'}],[1000,{pose:'like'}],[1500,{pose:'like'}]]);assert.deepEqual(actions(t),['play'],'Held thumbs-up acts once');
 feed(t,[[1600,{}],[1900,{}],[2000,{pose:'like'}],[2650,{pose:'like'}]]);assert.deepEqual(actions(t),['play','play'],'Relaxing rearms playback');
 t=engine();feed(t,[[0,{pose:'like'}],[100,{pose:'like'}],[200,null]]);assert.deepEqual(actions(t),[],'Brief thumbs-up or lost hand never toggles');
 t=engine();feed(t,[[0,{pose:'like'}],[400,{}],[650,{pose:'like'}]]);assert.deepEqual(actions(t),[],'Separate brief thumbs-up poses do not combine into a hold');
 t=engine();feed(t,[[0,{pose:'like'}],[600,{pose:'like'}]]);assert.deepEqual(actions(t),['play'],'Slow camera frames still recognize thumbs-up');
 for(const direction of [-1,1]){
  t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',x:.5+direction*.065}],[600,{pose:'one',x:.5+direction*.15}],[900,{pose:'one',x:.5+direction*.2}]]);
  assert.deepEqual(actions(t),['seek']);assert.equal(t.events[0].seconds,direction*10,'Small one-finger motion seeks in mirrored direction once');
 }
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',x:.51,y:.51}],[600,{pose:'one',x:.49,y:.49}]]);assert.deepEqual(actions(t),[],'Resting jitter is ignored');
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',x:.6,y:.6}]]);assert.deepEqual(actions(t),[],'Ambiguous diagonal does not choose an action');
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',y:.435}],[600,{pose:'one',y:.4,x:.7}],[800,{}],[1000,{}]]);
 assert.deepEqual(actions(t),['volumeStart','volumeMove','volumeMove','volumeEnd']);assert.ok(t.events[1].delta>0);assert.equal(t.events.at(-1).commit,true);assert.equal(actions(t).includes('seek'),false,'First direction locks volume even if hand drifts sideways');
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',y:.565}]]);assert.ok(t.events[1].delta<0,'Moving down lowers volume');
 t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',x:.565}],[600,{pose:'two',x:.6}],[800,{}],[1000,{}]]);
 assert.deepEqual(actions(t),['seekStart','seekMove','seekMove','seekEnd']);assert.ok(t.events[1].delta>0);assert.equal(t.events.at(-1).commit,true,'Bending two fingers commits timeline');
 t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',x:.435}],[500,null]]);assert.ok(t.events[1].delta<0);assert.equal(t.events.at(-1).action,'seekEnd');assert.equal(t.events.at(-1).commit,false,'Lost hand cancels timeline');
 t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',x:.565}],[500,{pose:'one'}],[600,{pose:'two',x:.565}]]);assert.equal(actions(t).includes('seekEnd'),false,'One finger-count error does not finish a drag');
 feed(t,[[2300,{pose:'two',x:.565}]]);assert.equal(t.events.at(-1).commit,false,'A stale stream cancels a drag');
 for(const direction of [-1,1]){
  t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',y:.5+direction*.065}],[600,{}],[800,{}]]);
  assert.deepEqual(actions(t),[],'Two-finger vertical motion no longer sends commands');
 }
 t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',x:.565}],[600,{pose:'two',label:'Left'}]]);assert.equal(t.events.at(-1).commit,false,'Switching tracked hands cancels');
 t=engine();feed(t,[[0,{pose:'two'}],[200,{pose:'two'}],[400,{pose:'two',x:.565}],[600,[hand({pose:'two'}),hand({pose:'two',label:'Left'})]]]);assert.equal(t.events.at(-1).commit,false,'A second hand cancels instead of selecting another action');
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',y:.435}],[1400,{pose:'one',y:.435}]]);assert.equal(t.events.at(-1).action,'volumeMove','Stationary continuous gestures refresh their video transaction');
 t=engine();feed(t,[[0,{pose:'one'}],[200,{pose:'one'}],[400,{pose:'one',x:.565}],[500,null],[600,{pose:'one'}],[800,{pose:'one',x:.6}]]);assert.deepEqual(actions(t),['seek'],'One missing frame cannot rearm a held action');
 t=engine();feed(t,[[0,{pose:'dislike'}],[650,{pose:'dislike'}],[1000,{pose:'dislike'}]]);assert.deepEqual(actions(t),['pause'],'Thumbs-down pauses once without toggling');
 assert.equal(describe([]),null);assert.equal(describe(Array.from({length:21},()=>({x:NaN,y:0}))),null);
 for(const [raised,thumb,pose] of [[[],false,'rest'],[[],true,'like'],[[0],false,'one'],[[0,1],false,'two'],[[0,1,2,3],false,'rest'],[[1],false,'rest']]){
  const points=landmarks(raised,thumb);assert.equal(describe(points).pose,pose,'Landmark classifier: '+pose);
  assert.equal(describe(points.map(p=>({x:1-p.x,y:p.y})),'Left').pose,pose,'Both hands classify the same');
 }
 const points=landmarks([0]);points[8].x+=.04;const feature=describe(points);assert.equal(feature.pose,'one');assert.ok(Math.abs(feature.x-.56)<1e-9,'Position follows index fingertip, not palm');
 assert.equal(describe(landmarks([],true).map(p=>({x:p.x,y:1-p.y}))).pose,'dislike','Thumbs-down is recognized separately');
 console.log('PASS: actual landmark finger counts, mirrored fingertips, thumbs-up debounce, small one/two-finger motions, axis lock, jitter rejection, drag commit/cancel, rest rearming and slow frames.');
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
 await send('pause');await send('pause');assert.equal(v.paused,true,'Repeated pause never plays');await send('play');await send('play');assert.equal(v.paused,false,'Repeated play never pauses');
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
 let listener;
 const calls=[],tabs=[{id:2,url:'https://www.youtube.com/watch?v=a',title:'Chosen video',incognito:false,windowId:10,active:false},{id:3,url:'https://www.youtube.com/watch?v=b',incognito:true},{id:4,url:'https://example.com/',incognito:false}];
 const sender={id:'test',frameId:0,url:'https://marwanahmed2023-creator.github.io/swich/camera.html',tab:{id:7,windowId:1,incognito:false}};
 const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},tabs:{async query(){return tabs;},async get(id){return tabs.find(t=>t.id===id)||{};},async sendMessage(id,msg){calls.push({id,...msg});return {ok:true,state:{paused:false}};},async update(id,opt){calls.push({id,...opt});}},windows:{async update(id,opt){calls.push({window:id,...opt});}}};
 vm.runInNewContext(read('tab-helper/background.js'),{URL,chrome,setTimeout,clearTimeout});
 const send=(request,who=sender)=>new Promise(resolve=>listener(request,who,resolve));
 const command=(action,extra={},tabId=2)=>send({type:'SWICH_MEDIA_COMMAND',tabId,command:{action,gestureId:'g1',...extra}});
 assert.deepEqual(JSON.parse(JSON.stringify((await send({type:'SWICH_PING'})).capabilities)),['camera-media','direct-playback','bounded-requests']);
 assert.deepEqual(JSON.parse(JSON.stringify((await send({type:'SWICH_MEDIA_LIST'})).tabs.map(t=>t.id))),[2]);
 await command('toggle');assert.equal(calls.at(-1).id,2,'Command targets chosen tab even when inactive');assert.equal(calls.at(-1).controllerId,7);
 for(const bad of [{action:'seek',seconds:20},{action:'volumeMove',delta:NaN},{action:'seekMove',delta:2},{action:'zoomMove',scale:99},{action:'unknown'}])assert.equal((await command(bad.action,bad)).ok,false);
 assert.equal((await command('toggle',{},3)).ok,false);assert.equal((await command('toggle',{},4)).ok,false);
 assert.equal((await send({type:'SWICH_MEDIA_LIST'},{...sender,url:'https://other.example/'})).ok,false);
 for(const action of ['zoomStart','zoomMove','zoomEnd'])assert.equal((await command(action,{scale:1})).ok,false,'Removed commands fail promptly');
 await command('play');assert.equal(calls.at(-1).action,'play');await command('pause');assert.equal(calls.at(-1).action,'pause');await command('cancel');
 await command('focus');assert.equal(calls.at(-2).active,true);assert.equal(calls.at(-1).focused,true);
 let bridgeListener;const posted=[],origin='https://marwanahmed2023-creator.github.io';
 const win={addEventListener(type,fn){bridgeListener=fn;},postMessage(data){posted.push(data);}};win.top=win;
 vm.runInNewContext(read('tab-helper/bridge.js'),{setTimeout,clearTimeout,window:win,location:{origin,pathname:'/swich/camera.html'},chrome:{runtime:{sendMessage(req,reply){listener(req,sender,reply);}}}});
 const page=(type,id,extra={})=>bridgeListener({source:win,origin,data:{channel:'swich-tab-helper-v1',from:'page',type,id,...extra}});
 page('ping');assert.ok(posted.at(-1).capabilities.includes('camera-media'));
 const count=calls.length;page('media-command','once',{tabId:2,command:{action:'toggle'}});page('media-command','once',{tabId:2,command:{action:'toggle'}});await new Promise(setImmediate);
 assert.equal(calls.length,count+1,'Duplicate pending command executes once');page('media-command','once',{tabId:2,command:{action:'toggle'}});await new Promise(setImmediate);assert.equal(calls.length,count+1);
 console.log('PASS: actual extension background/bridge with simulated Chrome APIs: selected-tab routing, sender checks, validation, normal/private separation, removed-command rejection and direct play/pause, focus and duplicate rejection.');
}
function staticChecks(){
 const html=read('camera.html'),app=read('camera/app.js'),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(match[1]),'Missing element '+match[1]);
 for(const file of ['camera.html','camera-setup.html'])for(const match of read(file).matchAll(/(?:src|href)="([^"#]+)"/g)){
  const link=match[1].split('?')[0];if(!/^https?:/.test(link)&&link!=='./')assert.ok(fs.existsSync(path.join(root,link)),'Missing asset '+link);
 }
 const manifest=JSON.parse(read('tab-helper/manifest.json'));assert.equal(manifest.version,'1.2.0');assert.deepEqual(manifest.host_permissions,['https://www.youtube.com/*','https://m.youtube.com/*']);
 for(const script of manifest.content_scripts.flatMap(s=>s.js))assert.ok(fs.existsSync(path.join(root,'tab-helper',script)));
 console.log('PASS: camera HTML controls, local asset links and extension package references.');
}
async function testCameraPage(){
 const html=read('camera.html'),origin='https://marwanahmed2023-creator.github.io';
 const flush=()=>new Promise(setImmediate);
 class Node extends EventTarget{
  constructor(){super();Object.assign(this,{style:{},children:[],classList:{toggle(){}},textContent:'',value:'',disabled:false,hidden:false});}
  appendChild(e){this.children.push(e);return e;}replaceChildren(){this.children=[];}
  getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
 }
 const nodes=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Node()]));nodes.cameraVideo.play=async()=>{};
 const document=Object.assign(new EventTarget(),{hidden:false,getElementById:id=>nodes[id],createElement:()=>new Node()});
 const win=new EventTarget();win.top=win;
 win.postMessage=data=>queueMicrotask(()=>{const e=new Event('message');Object.assign(e,{data,source:win,origin});win.dispatchEvent(e);});
 let reachable=true,cameraRequests=0,paused=false,videoTime=100,worker,listener,clock=0,holdMove=false,releaseMove;
 const commands=[],sender={id:'test',frameId:0,url:origin+'/swich/camera.html',tab:{id:7,incognito:false}};
 const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},tabs:{
  async query(){return [{id:2,url:'https://www.youtube.com/watch?v=chosen',title:'Selected video',incognito:false}];},
  async get(id){return {id,url:'https://www.youtube.com/watch?v=chosen',incognito:false};},
  async sendMessage(id,msg){
   if(!reachable)throw Error('Receiving end does not exist');commands.push({id,...msg});
   if(msg.action==='toggle')paused=!paused;if(msg.action==='play')paused=false;if(msg.action==='pause')paused=true;if(msg.action==='seek')videoTime+=msg.seconds;
   const result={ok:true,state:{paused,time:videoTime,duration:600,volume:.5,muted:false}};
   if(holdMove&&msg.action==='volumeMove'){holdMove=false;return new Promise(resolve=>{releaseMove=()=>resolve(result);});}
   return result;
  }
 }};
 vm.runInNewContext(read('tab-helper/background.js'),{URL,chrome,setTimeout,clearTimeout});
 vm.runInNewContext(read('tab-helper/bridge.js'),{setTimeout,clearTimeout,window:win,location:{origin,pathname:'/swich/camera.html'},chrome:{runtime:{sendMessage(req,reply){listener(req,sender,reply);}}}});
 class Worker{
  constructor(){worker=this;this.enabled=false;this.engine=new GestureEngine(command=>{if(this.enabled)this.onmessage?.({data:{type:'command',command,session:this.session}});});}
  postMessage(msg){
   if(msg.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready',trackProcessor:false}}));
   if(msg.type==='enabled'){this.engine.reset(clock);this.enabled=msg.enabled;this.session=msg.session;}
  }
  feed(t,features){clock=t;if(this.enabled)this.engine.update([hand(features)],t);}
  terminate(){}
 }
 const track=Object.assign(new EventTarget(),{stop(){}}),stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const ctx=vm.createContext({window:win,document,location:{origin},console,URL,Worker,Date,
  navigator:{mediaDevices:{async getUserMedia(){cameraRequests++;return stream;}}},
  MediaStreamTrackProcessor:class{constructor(){this.readable={};}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 vm.runInContext(read('camera/app.js'),ctx);await flush();
 assert.equal(nodes.videoConnection.textContent,'Video connected');
 await vm.runInContext("manualCommand({action:'toggle'})",ctx);assert.equal(paused,true);assert.equal(nodes.status.textContent,'YouTube paused.');
 await vm.runInContext("manualCommand({action:'seek',seconds:10})",ctx);assert.equal(videoTime,110);
 reachable=false;await vm.runInContext('startCamera()',ctx);assert.equal(cameraRequests,0,'Cannot start tracking when YouTube is unreachable');assert.match(nodes.videoConnection.textContent,/Refresh your YouTube/);
 reachable=true;await vm.runInContext('startCamera()',ctx);assert.equal(cameraRequests,1);assert.equal(worker.enabled,true);
 assert.equal(nodes.cameraButton.textContent,'Pause controls');
 worker.feed(600,{pose:'like'});worker.feed(1200,{pose:'like'});worker.feed(1800,{});await flush();
 assert.equal(paused,false,'Real gesture engine reaches selected video through page, bridge and background');assert.equal(commands.filter(x=>x.action==='play').length,1);
 assert.equal(nodes.status.textContent,'YouTube playing.');
 // A stale worker message must not execute after pause or on another target.
 const previousSession=worker.session;await vm.runInContext('startCamera()',ctx);assert.equal(worker.enabled,false);
 worker.onmessage({data:{type:'command',session:previousSession,command:{action:'toggle'}}});await flush();assert.equal(paused,false);
 reachable=false;await vm.runInContext('startCamera()',ctx);assert.equal(worker.enabled,false,'Resume checks connection too');
 reachable=true;await vm.runInContext('startCamera()',ctx);assert.equal(worker.enabled,true);
 await vm.runInContext("manualCommand({action:'toggle'})",ctx);assert.equal(paused,true);assert.equal(worker.enabled,true,'Manual controls reset then resume gestures');
 const command=command=>worker.onmessage({data:{type:'command',session:worker.session,command:{gestureId:'coalesce',...command}}});
 command({action:'volumeStart'});await flush();holdMove=true;command({action:'volumeMove',delta:.01});await flush();
 for(let i=1;i<=40;i++)command({action:'volumeMove',delta:i/40});
 command({action:'volumeEnd',commit:true});releaseMove();await flush();
 const motion=commands.filter(c=>c.gestureId==='coalesce');
 assert.deepEqual(motion.map(c=>c.action),['volumeStart','volumeMove','volumeMove','volumeEnd'],'Rapid motion updates are coalesced without losing start/end');
 assert.equal(motion[2].delta,1,'Only the latest queued movement is sent');
 vm.runInContext('stopCamera()',ctx);
 console.log('PASS: actual camera page + bridge + background with simulated browser/worker: manual playback, visible connection failure, start/resume preflight, slow-frame gesture delivery and stale-session rejection.');
}
(async()=>{testGestures();await testMedia();await testBackgroundAndBridge();await testCameraPage();staticChecks();})().catch(error=>{console.error(error);process.exitCode=1;});
