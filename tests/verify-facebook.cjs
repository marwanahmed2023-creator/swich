'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
class Element{
  constructor(){this.style={};this.parentNode=null;}
  appendChild(e){e.parentNode=this;return e;}
  append(...items){items.forEach(e=>this.appendChild(e));}
  attachShadow(){return new Element();}
}
function makeVideo(name,left,top,width,height){
  return {isConnected:true,readyState:4,currentSrc:name,currentTime:30,duration:120,volume:.5,muted:false,paused:false,plays:0,
    rect:{left,top,right:left+width,bottom:top+height,width,height},style:{opacity:'1'},
    getBoundingClientRect(){return this.rect;},checkVisibility(){return !this.hiddenAncestor;},
    pause(){this.paused=true;},async play(){this.paused=false;this.plays++;}};
}
async function feedSelection(){
  let listener;
  const offscreen=makeVideo('old-feed-video',0,-2000,1000,900),main=makeVideo('current-post',100,40,640,480),small=makeVideo('next-post',800,300,200,150),hidden=makeVideo('hidden-preload',0,0,1100,700);
  hidden.hiddenAncestor=true;
  let videos=[offscreen,small,hidden,main];
  const document={querySelectorAll:selector=>selector==='video'?videos:[],querySelector:()=>null,createElement:()=>new Element(),documentElement:new Element()};
  vm.runInNewContext(read('tab-helper/media.js'),{document,innerWidth:1280,innerHeight:720,getComputedStyle:v=>v.style,
    chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},setTimeout:()=>1,clearTimeout(){},setInterval(){}});
  const send=(action,extra={})=>new Promise(resolve=>listener({type:'SWICH_VIDEO_COMMAND',controllerId:7,gestureId:'drag',action,...extra},{id:'test'},resolve));
  assert.equal((await send('pause')).ok,true);assert.equal(main.paused,true);assert.equal(offscreen.paused,false);assert.equal(small.paused,false);assert.equal(hidden.paused,false);
  await send('play');assert.equal(main.paused,false,'Resume stays on the main visible video even with another playing video');
  await send('seek',{seconds:10});assert.equal(main.currentTime,40);await send('seek',{seconds:-10});assert.equal(main.currentTime,30);
  main.muted=true;await send('volumeStart');await send('volumeMove',{delta:.3});await send('volumeEnd');assert.equal(main.volume,.3);assert.equal(main.muted,false);assert.equal(offscreen.volume,.5);
  await send('seekStart');await send('seekMove',{delta:.25});await send('seekEnd',{commit:true});assert.equal(main.currentTime,60);assert.equal(main.paused,false);
  await send('seekStart');await send('seekMove',{delta:.25});
  const next=makeVideo('new-reel',200,0,400,700);videos=[offscreen,next];
  assert.equal((await send('seekEnd',{commit:true})).ok,false,'Scrolling to a new Reel cannot apply an old timeline drag');
  await send('cancel');assert.equal(main.currentTime,60);assert.equal(main.paused,true);assert.equal(next.currentTime,30);
  await send('pause');assert.equal(next.paused,true,'New videos are discovered without refreshing the page');
  // Source changes on reused Facebook video elements also cancel the drag.
  await send('seekStart');next.currentSrc='another-reel';assert.equal((await send('seekMove',{delta:.5})).ok,false);await send('cancel');assert.equal(next.currentTime,30);
  videos=[main,small];document.fullscreenElement={contains:v=>v===small,appendChild:Element.prototype.appendChild};
  await send('pause');assert.equal(small.paused,true,'Fullscreen video takes precedence over a larger background video');
  document.fullscreenElement=null;document.pictureInPictureElement=offscreen;videos.push(offscreen);await send('pause');assert.equal(offscreen.paused,true,'Picture-in-picture can be controlled offscreen');
  document.pictureInPictureElement=null;main.style.opacity='0';small.hiddenAncestor=true;assert.equal((await send('status')).state,null,'No action targets an invisible video');
  videos=[next];next.duration=Infinity;assert.equal((await send('seek',{seconds:10})).ok,false,'Unseekable live video reports an error');assert.equal((await send('play')).ok,true,'Live playback still works');
  console.log('PASS: Facebook feed/Reel simulations: visible-video targeting, play/pause, seek, volume, scrolling, reused sources, fullscreen, PiP and live limits.');
}
async function facebookRouting(){
  let listener,patterns;
  const hosts=['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com'];
  const tabs=hosts.map((host,i)=>({id:i+10,url:'https://'+host+'/reel/123',title:'Reel',incognito:false}));
  tabs.push({id:20,url:'https://www.facebook.com/watch/',incognito:true},{id:21,url:'https://www.facebook.com.attacker.example/',incognito:false},{id:22,url:'http://www.facebook.com/',incognito:false});
  const calls=[],sender={id:'test',frameId:0,url:'https://marwanahmed2023-creator.github.io/swich/camera.html',tab:{id:7,incognito:false}};
  const chrome={windows:{},storage:{session:{async get(){return {};},async set(){}}},scripting:{async executeScript(req){return req.files?[]:[{frameId:0,documentId:'doc',result:{state:{paused:false},rank:1}}];}},runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},tabs:{
    async query(query){patterns=query.url;return tabs;},async get(id){return tabs.find(t=>t.id===id);},async sendMessage(id,msg){calls.push({id,...msg});return {ok:true};}
  }};
  vm.runInNewContext(read('tab-helper/background.js'),{URL,chrome,setTimeout,clearTimeout});
  const send=(request,who=sender)=>new Promise(resolve=>listener(request,who,resolve));
  const listed=await send({type:'SWICH_MEDIA_LIST'});assert.deepEqual(Array.from(listed.tabs,t=>t.id),[10,11,12,13,21,22]);
  for(const id of [10,11,12,13,21,22]){assert.equal((await send({type:'SWICH_MEDIA_COMMAND',tabId:id,command:{action:'pause'}})).ok,true);assert.equal(calls.at(-1).id,id);}
  for(const id of [20])assert.equal((await send({type:'SWICH_MEDIA_COMMAND',tabId:id,command:{action:'pause'}})).ok,false);
  assert.equal((await send({type:'SWICH_MEDIA_LIST'},{...sender,url:'https://www.facebook.com/'})).ok,false,'Facebook cannot issue controller requests');
  const manifest=JSON.parse(read('tab-helper/manifest.json'));
  assert.deepEqual(Array.from(patterns),manifest.host_permissions);
  assert.equal(manifest.content_scripts.some(s=>s.js.includes('media.js')),false,'Media injection happens on demand');
  assert.deepEqual(manifest.permissions,['storage','scripting']);
  console.log('PASS: Facebook tab discovery, webpage routing, selected-tab delivery, private-window separation and controller-only requests.');
}
(async()=>{await feedSelection();await facebookRouting();})().catch(error=>{console.error(error);process.exitCode=1;});
