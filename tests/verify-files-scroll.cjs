'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
class Element extends EventTarget{
 constructor(){super();this.style={};this.children=[];this.parentNode=null;this.parentElement=null;this.hidden=false;this.classList={toggle(){}};}
 appendChild(e){e.parentNode=this;this.children.push(e);return e;}append(...es){es.forEach(e=>this.appendChild(e));}replaceChildren(){this.children=[];}attachShadow(){return new Element();}setAttribute(){}removeAttribute(key){delete this[key];}load(){}pause(){this.paused=true;}
}
async function scrollingAudio(){
 let listener;const moves=[],rootNode=new Element(),nested=new Element();rootNode.scrollBy=o=>moves.push(['page',o.top]);nested.scrollBy=o=>moves.push(['nested',o.top]);nested.style.overflowY='auto';nested.scrollHeight=2000;nested.clientHeight=400;
 const audio={tagName:'AUDIO',isConnected:true,readyState:4,currentSrc:'audio',volume:.5,muted:false,currentTime:20,duration:100,paused:false,getBoundingClientRect:()=>({width:0,height:0}),pause(){this.paused=true;},async play(){this.paused=false;}};
 let audios=[audio],center=nested;
 const document={querySelectorAll:q=>q==='audio'?audios:[],querySelector:()=>null,elementFromPoint:()=>center,scrollingElement:rootNode,documentElement:rootNode,createElement:()=>new Element()};
 vm.runInNewContext(read('tab-helper/media.js'),{document,innerWidth:1200,innerHeight:800,getComputedStyle:e=>e.style,chrome:{runtime:{id:'test',onMessage:{addListener(f){listener=f;}}}},setInterval(){},setTimeout:()=>1,clearTimeout(){}});
 const send=(action,extra={})=>new Promise(resolve=>listener({type:'SWICH_VIDEO_COMMAND',action,gestureId:'g',controllerId:'7:wire',...extra},{id:'test'},resolve));
 assert.equal((await send('status')).state.kind,'audio');await send('pause');assert.equal(audio.paused,true);await send('play');assert.equal(audio.paused,false);
 await send('seek',{seconds:10});assert.equal(audio.currentTime,30);await send('volumeStart');await send('volumeMove',{delta:-.25});await send('volumeEnd');assert.equal(audio.volume,.25);
 audios=[];assert.equal((await send('status')).page,true);await send('scroll',{direction:1});assert.deepEqual(moves.at(-1),['nested',360]);center=rootNode;await send('scroll',{direction:-1});assert.deepEqual(moves.at(-1),['page',-360]);
 await send('scrollStart');await send('scrollMove',{delta:.5});assert.deepEqual(moves.at(-1),['page',60]);const n=moves.length;await send('scrollEnd');assert.equal((await send('scrollMove',{delta:.5})).ok,false);assert.equal(moves.length,n,'Release stops continuous scrolling');
 audios=[audio];await send('volumeStart');await send('cancel',{controllerId:'7:camera'});assert.equal((await send('volumeMove',{delta:.1})).ok,true,'Other input cancellation must not cancel this input');await send('cancel');
 console.log('PASS: audio playback/seek/volume, plain-page and nested scrolling, release stops scrolling, independent input cancellation.');
}
function player(){
 const html=read('player.html'),nodes=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()])),urls=[],revoked=[];
 const context={document:{getElementById:id=>nodes[id],createElement:()=>new Element()},window:new EventTarget(),URL:{createObjectURL:file=>{const u='blob:'+file.name;urls.push(u);return u;},revokeObjectURL:u=>revoked.push(u)}};
 vm.runInNewContext(read('player/player.js'),context);
 const pick=(id,files)=>{nodes[id].files=files;nodes[id].dispatchEvent(new Event('change'));};
 pick('chooseFolder',[{name:'10.mp4',type:'video/mp4',webkitRelativePath:'movies/10.mp4'},{name:'2.mp3',type:'audio/mpeg',webkitRelativePath:'movies/2.mp3'},{name:'readme.txt',type:'text/plain'}]);
 assert.equal(nodes.fileList.children.length,2);assert.equal(nodes.fileTitle.textContent,'2.mp3');assert.equal(nodes.localAudio.hidden,false);assert.equal(nodes.localVideo.hidden,true);
 nodes.nextFile.dispatchEvent(new Event('click'));assert.equal(nodes.fileTitle.textContent,'10.mp4');assert.equal(nodes.localAudio.hidden,true);assert.equal(nodes.localVideo.hidden,false);assert.deepEqual(revoked,['blob:2.mp3']);
 pick('chooseFile',[{name:'readme.txt',type:'text/plain'}]);assert.equal(nodes.localVideo.hidden,true);assert.equal(nodes.nextFile.disabled,true);assert.equal(nodes.previousFile.disabled,true);assert.equal(revoked.length,2);
 console.log('PASS: local folder filtering/natural sorting, audio/video selection, object URL cleanup, and empty selection.');
}
async function bluetooth(){
 let now=0;const commands=[],nodes={wireConnect:new Element(),wireStatus:new Element()},wire=new EventTarget(),device=new EventTarget();let cancelCount=0;
 wire.startNotifications=async()=>{};device.gatt={connected:false,async connect(){this.connected=true;return {async getPrimaryService(){return {async getCharacteristic(){return wire;}};}};},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
 const win=new EventTarget();win.SwichControls={ready:()=>true,sendWire:c=>commands.push(c),cancelWire:()=>cancelCount++};
 const context={window:win,document:{getElementById:id=>nodes[id]},navigator:{bluetooth:{requestDevice:async()=>device}},performance:{now:()=>now},TextDecoder,SwichWire:require('../camera/wire-engine.js'),setInterval(){}};
 vm.runInNewContext(read('camera/wire.js'),context);nodes.wireConnect.dispatchEvent(new Event('click'));await new Promise(setImmediate);assert.equal(win.SwichWireDevice.connected(),true);
 const emit=text=>{const bytes=new TextEncoder().encode(text),e=new Event('characteristicvaluechanged');wire.value=new DataView(bytes.buffer);wire.dispatchEvent(e);};
 const feed=(value,ms)=>{for(let t=0;t<ms;t+=20){now+=20;emit('A:'+value+',B:0\n');}};
 feed(445,400);emit('A:');emit('9999,B:0\nbad\n');feed(951,120);feed(445,1100);assert.deepEqual(commands,[{action:'toggle'}]);
 feed(951,1000);device.gatt.disconnect();assert.equal(win.SwichWireDevice.connected(),false);assert.equal(commands.at(-1).action,'volumeEnd');assert.equal(commands.at(-1).commit,false);assert.ok(cancelCount);
 console.log('PASS: actual BLE event parsing, automatic activation, tap delivery and disconnect cancellation with simulated HM-10.');
}
(async()=>{await scrollingAudio();player();await bluetooth();})().catch(e=>{console.error(e);process.exitCode=1;});
