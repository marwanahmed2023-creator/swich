'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const flush=()=>new Promise(setImmediate);
class Element extends EventTarget{
 constructor(){super();Object.assign(this,{children:[],style:{},classList:{add(){},toggle(){}},isConnected:true,hidden:false,disabled:false,value:'',textContent:'',paused:true,readyState:0,volume:.5,muted:false,currentTime:0,duration:120});}
 appendChild(e){e.parentNode=this;this.children.push(e);return e;}append(...es){es.forEach(e=>this.appendChild(e));}replaceChildren(){this.children=[];}
 attachShadow(){return new Element();}setAttribute(){}removeAttribute(key){delete this[key];}focus(){}scrollIntoView(){}
 load(){this.currentSrc=this.src||'';this.readyState=this.src?4:0;this.currentTime=0;}
 pause(){this.paused=true;}async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 getBoundingClientRect(){return {width:400,height:225,top:0,left:0,right:400,bottom:225};}
 getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
}
async function scenario(search){
 const html=read('camera.html'),nodes=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 nodes.nativeScrollAction.value='files';nodes.localVideo.tagName='VIDEO';nodes.localAudio.tagName='AUDIO';nodes.nativePlayer.hidden=true;
 const scrolled=[],revoked=[],posted=[],opened=[],timers=[],body=new Element(),rootNode=new Element(),intro=new Element();
 rootNode.scrollBy=({top})=>scrolled.push(top);
 const document=Object.assign(new EventTarget(),{hidden:false,body,documentElement:rootNode,scrollingElement:rootNode,
  getElementById:id=>nodes[id],createElement:()=>new Element(),querySelector:q=>q==='.intro'?intro:null,querySelectorAll:()=>[],elementFromPoint:()=>rootNode});
 let worker,cameraRequests=0;
 class Worker{
  constructor(){worker=this;}
  postMessage(m){if(m.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready',trackProcessor:false}}));if(m.type==='enabled'){this.enabled=m.enabled;this.session=m.session;}if(m.type==='calibrateWinks')this.relearned=true;}
  terminate(){}
 }
 class MediaURL extends URL{}MediaURL.createObjectURL=f=>'blob:'+f.name;MediaURL.revokeObjectURL=u=>revoked.push(u);
 const track=Object.assign(new EventTarget(),{stop(){}}),stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const win=new EventTarget();win.postMessage=m=>posted.push(m);win.open=(...args)=>opened.push(args);
 const context=vm.createContext(Object.assign(win,{window:win,document,Worker,URL:MediaURL,URLSearchParams,console,Date,innerWidth:390,innerHeight:844,
  location:{search,origin:'https://marwanahmed2023-creator.github.io',hostname:'marwanahmed2023-creator.github.io',pathname:'/swich/camera.html'},
  navigator:{mediaDevices:{async getUserMedia(){cameraRequests++;return stream;}}},getComputedStyle:e=>e.style,
  localStorage:{getItem:()=>null,setItem(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},createImageBitmap:async()=>({close(){}})}));
 // The real browser scripts run together, with no chrome API or extension bridge.
 for(const file of ['tab-helper/media.js','player/player.js','camera/native.js','camera/app.js'])vm.runInContext(read(file),context,{filename:file});
 if(!search){assert.equal(nodes.nativePlayer.hidden,true);timers.find(t=>t.ms===2000).fn();}
 await flush();assert.equal(nodes.nativePlayer.hidden,false);assert.equal(nodes.desktopTarget.hidden,true);assert.equal(nodes.cameraButton.disabled,false);assert.equal(nodes.wireConnect.hidden,true);
 const initialMessages=posted.length;
 await vm.runInContext('startCamera()',context);assert.equal(cameraRequests,1);assert.equal(worker.enabled,true,'Camera starts without an extension');
 nodes.relearnWinks.dispatchEvent(new Event('click'));assert.equal(worker.relearned,true);
 const command=command=>vm.runInContext('dispatchCommand('+JSON.stringify({session:worker.session,command})+')',context);
 await command({action:'play'});assert.match(nodes.status.textContent,/Choose a video or audio file/,'Missing media has a useful error');
 nodes.chooseFile.files=[{name:'1.mp4',type:'video/mp4'},{name:'2.mp3',type:'audio/mpeg'}];nodes.chooseFile.dispatchEvent(new Event('change'));
 await nodes.localVideo.play();await command({action:'pause'});assert.equal(nodes.localVideo.paused,true);
 await command({action:'play'});assert.equal(nodes.localVideo.paused,false);
 await command({action:'seek',seconds:10});assert.equal(nodes.localVideo.currentTime,10);
 await command({action:'volumeStart',gestureId:'v'});await command({action:'volumeMove',gestureId:'v',delta:.2});await command({action:'volumeEnd',gestureId:'v'});assert.equal(nodes.localVideo.volume,.7);
 await command({action:'scroll',direction:1});assert.equal(nodes.fileTitle.textContent,'2.mp3');assert.equal(nodes.localAudio.paused,false,'Advancing continues playback');assert.equal(nodes.localVideo.hidden,true);assert.match(nodes.status.textContent,/Next: 2.mp3/);
 await command({action:'scroll',direction:1});assert.match(nodes.status.textContent,/Last file reached/);assert.equal(scrolled.length,0,'File boundaries never scroll the page');
 await command({action:'scroll',direction:-1});assert.equal(nodes.fileTitle.textContent,'1.mp4');assert.equal(revoked.length,2);
 nodes.nativeScrollAction.value='page';await command({action:'scroll',direction:1});assert.deepEqual(scrolled,[844*.65]);
 nodes.mediaUrl.value='https://example.com/song.mp3';nodes.openMediaUrl.dispatchEvent(new Event('click'));assert.equal(nodes.localAudio.src,'https://example.com/song.mp3');assert.equal(nodes.fileList.children.length,0);
 nodes.mediaUrl.value='javascript:alert(1)';nodes.openMediaUrl.dispatchEvent(new Event('click'));assert.match(nodes.playerStatus.textContent,/HTTPS/);assert.equal(nodes.localAudio.src,'https://example.com/song.mp3','Invalid links cannot replace media');
 const originalVolume=nodes.localAudio.volume;Object.defineProperty(nodes.localAudio,'volume',{get:()=>originalVolume,set(){},configurable:true});
 await command({action:'volumeStart',gestureId:'locked'});await command({action:'volumeMove',gestureId:'locked',delta:.2});assert.match(nodes.status.textContent,/phone’s volume buttons/,'Fixed-volume browsers report their limitation');
 await win.SwichNative.request('open',{url:'https://example.com/'});assert.equal(opened.length,1);
 assert.equal(posted.length,initialMessages,'Native commands never post to an extension');
 // A late extension announcement must not switch the explicitly selected player.
 const event=new Event('message');Object.assign(event,{source:win,origin:win.location.origin,data:{channel:'swich-tab-helper-v1',from:'extension',type:'ready',available:true,capabilities:['shorts-navigation'],version:'1.5.0'}});win.dispatchEvent(event);assert.equal(nodes.desktopTarget.hidden,true);
 const previousSession=worker.session;vm.runInContext('stopCamera()',context);assert.equal(worker.enabled,false);
 nodes.localAudio.paused=true;await vm.runInContext('dispatchCommand('+JSON.stringify({session:previousSession,command:{action:'play'}})+')',context);assert.equal(nodes.localAudio.paused,true);
 assert.equal(posted.length,initialMessages);
}
(async()=>{await scenario('?mode=phone');await scenario('');console.log('PASS: native camera + player without Chrome APIs, automatic fallback, playback/seek/volume, file navigation, URL validation, page scrolling, calibration, fixed-volume feedback and stale-session rejection.');})().catch(e=>{console.error(e);process.exitCode=1;});
