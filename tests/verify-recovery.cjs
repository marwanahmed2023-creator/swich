'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync(path.join(__dirname,'tab-helper'))?__dirname:path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const flush=()=>new Promise(setImmediate);
function fakeClock(){
 let now=1000,serial=0;const timers=new Map();
 return {Date:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);},
  async tick(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();}};
}
async function backgroundRecovery(){
 const clock=fakeClock(),calls=[];let listener,mode='hang',lateReply,lateGet;
 const tab={id:2,url:'https://www.youtube.com/watch?v=a',incognito:false};
 const chrome={runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},tabs:{
  get(){if(mode==='get')return new Promise(resolve=>lateGet=()=>resolve(tab));return Promise.resolve(tab);},
  sendMessage(id,msg){calls.push(msg);if(mode==='hang'&&msg.action!=='status')return new Promise(resolve=>lateReply=()=>resolve({ok:true}));return Promise.resolve({ok:true,state:{paused:false}});}
 }};
 vm.runInNewContext(read('tab-helper/background.js'),{URL,chrome,...clock});
 const sender={id:'test',frameId:0,url:'https://marwanahmed2023-creator.github.io/swich/camera.html',tab:{id:7,incognito:false}};
 const send=action=>new Promise(resolve=>listener({type:'SWICH_MEDIA_COMMAND',tabId:2,command:{action,seconds:10}},sender,resolve));
 const stuck=send('play');await flush();const queued=send('pause');
 assert.equal((await send('status')).ok,true,'Status is not blocked by an unresponsive command');
 await clock.tick(3501);
 assert.match((await stuck).error,/did not respond/);assert.match((await queued).error,/expired/);
 assert.equal(calls.filter(c=>c.action==='pause').length,0,'Queued commands are discarded after their deadline');
 mode='ok';assert.equal((await send('pause')).ok,true,'Later commands recover without reloading');
 lateReply();await flush();assert.equal(calls.filter(c=>c.action==='play').length,1,'No automatic replay of a timed-out command');
 mode='get';const pendingGet=send('seek');await flush();await clock.tick(3501);assert.equal((await pendingGet).ok,false);
 const before=calls.length;lateGet();await flush();assert.equal(calls.length,before,'Late tab lookup cannot dispatch an expired command');
 console.log('PASS: hanging Chrome messages time out, status stays responsive, queues recover, and expired requests never replay.');
}
async function bridgeRecovery(){
 const clock=fakeClock(),posted=[];let listener,callback,calls=0;
 const origin='https://marwanahmed2023-creator.github.io';
 const win={addEventListener(type,fn){listener=fn;},postMessage(data){posted.push(data);}};win.top=win;
 const runtime={sendMessage(req,reply){calls++;callback=reply;}};
 vm.runInNewContext(read('tab-helper/bridge.js'),{window:win,location:{origin,pathname:'/swich/camera.html'},chrome:{runtime},...clock});
 const send=id=>listener({source:win,origin,data:{channel:'swich-tab-helper-v1',from:'page',type:'media-command',id,tabId:2,command:{action:'pause'}}});
 send('first');send('first');assert.equal(calls,1);
 await clock.tick(6001);assert.equal(posted.length,1);assert.equal(posted[0].ok,false);assert.match(posted[0].error,/timed out/);
 callback({ok:true});assert.equal(posted.length,1,'Late extension reply cannot replace timeout result');
 runtime.sendMessage=(req,reply)=>reply({ok:true});send('next');assert.equal(posted.at(-1).ok,true);
 console.log('PASS: bridge watchdog replies once and accepts a new request after a missing callback.');
}
class Element{
 constructor(){this.style={};this.parentNode=null;}appendChild(e){e.parentNode=this;return e;}append(...items){items.forEach(e=>this.appendChild(e));}attachShadow(){return new Element();}
}
async function playbackRecovery(){
 const clock=fakeClock();let listener,stuck=true,plays=0;
 const video={isConnected:true,readyState:4,currentSrc:'a',currentTime:100,duration:500,volume:.5,muted:false,paused:true,
  getBoundingClientRect:()=>({width:640,height:480}),pause(){this.paused=true;},play(){plays++;if(stuck)return new Promise(()=>{});this.paused=false;return Promise.resolve();}};
 const document={querySelectorAll:()=>[video],querySelector:()=>null,createElement:()=>new Element(),documentElement:new Element()};
 vm.runInNewContext(read('tab-helper/media.js'),{document,chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},...clock,setInterval(){}});
 const send=(action,extra={})=>new Promise(resolve=>listener({type:'SWICH_VIDEO_COMMAND',action,gestureId:'g',controllerId:7,...extra},{id:'test'},resolve));
 const pending=send('play');await flush();assert.equal((await send('status')).ok,true);
 await clock.tick(1801);assert.match((await pending).error,/Click Play/);assert.equal(video.paused,true);
 assert.equal((await send('pause')).ok,true,'A hanging play promise cannot block later pause');
 stuck=false;await send('play');assert.equal(video.paused,false);await send('play');assert.equal(video.paused,false);
 await send('pause');await send('pause');assert.equal(video.paused,true);
 const time=video.currentTime;assert.equal((await send('seek',{seconds:10,expiresAt:clock.Date.now()-1})).ok,false);assert.equal(video.currentTime,time,'Late-delivered content commands do not execute');
 await send('play');await send('seekStart');const previousPlays=plays;await send('pause');assert.equal(plays,previousPlays,'Thumbs-down cancels a drag without briefly resuming playback');assert.equal(video.paused,true);
 console.log('PASS: pending video.play expires; playback queue recovers; direct play/pause are idempotent; expired seeks do nothing.');
}
(async()=>{await backgroundRecovery();await bridgeRecovery();await playbackRecovery();})().catch(error=>{console.error(error);process.exitCode=1;});
