'use strict';
const $=id=>document.getElementById(id),CHANNEL='swich-tab-helper-v1';
let nativeMode=window.SwichNative?.requested===true;
let helper=false,selectedTab='active',worker=null,stream=null,workerReady=null,cameraOn=false,controlsOn=false,starting=false,manualBusy=false,session=0,wireSession=0,cameraGeneration=0,requestSerial=0,fallbackTimer=null,fallbackBusy=false,transport='';
const pending=new Map(),edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const queues={camera:[],wire:[]},sending={camera:false,wire:false};
const canvas=$('landmarks'),context=canvas.getContext('2d');
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function updateControls(){
 $('refreshTabs').disabled=!helper;$('videoTab').disabled=!helper||starting;
 $('showVideo').disabled=!helper;$('cameraButton').disabled=starting||!helper;
 for(const id of ['backVideo','toggleVideo','forwardVideo'])$(id).disabled=manualBusy||!helper;
 $('cameraButton').textContent=starting?'Starting camera…':'Start camera';$('cameraButton').hidden=cameraOn;
 $('stopCamera').hidden=!cameraOn&&!starting;$('trackingDot').classList.toggle('on',cameraOn&&controlsOn);
 if($('relearnWinks'))$('relearnWinks').disabled=!cameraOn;
 window.SwichWireDevice?.render();
}
function ping(){if(nativeMode)return;window.postMessage({channel:CHANNEL,from:'page',type:'ping'},location.origin);}
function rpc(type,extra={}){
 if(nativeMode)return window.SwichNative.request(type,extra);
 if(!helper)return Promise.reject(new Error('Update the Swich helper and refresh this page first.'));
 const id=Date.now().toString(36)+'-'+(++requestSerial);
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Helper timed out. Reload it in chrome://extensions, then refresh this page.'));},8000);
  pending.set(id,{resolve,reject,timeout});window.postMessage({channel:CHANNEL,from:'page',type,id,...extra},location.origin);
 });
}
window.addEventListener('message',event=>{
 if(nativeMode)return;
 if(event.source!==window||event.origin!==location.origin)return;
 const data=event.data;if(data?.channel!==CHANNEL||data.from!=='extension')return;
 if(data.type==='ready'){
  const ready=data.available===true&&data.capabilities?.includes('shorts-navigation'),becameReady=!helper&&ready;
  helper=Boolean(ready);$('setupNotice').hidden=helper;
  $('extensionBadge').textContent=helper?'Helper connected · v'+data.version:'Helper update needed';$('extensionBadge').className='badge'+(helper?' ready':'');
  if(!helper){setControls(false);cancelWire();window.SwichWireDevice?.reset();status('Update Swich Tab Helper to version 1.5, then refresh this page.');}
  else if(becameReady){setControls(cameraOn);status('Ready. Start the camera or connect your wire. Controls follow the tab you use.');loadTabs();}
  updateControls();return;
 }
 if(data.type!=='result'||!pending.has(data.id))return;
 const task=pending.get(data.id);pending.delete(data.id);clearTimeout(task.timeout);
 if(data.ok)task.resolve(data);else task.reject(new Error(data.error||'The command could not be completed.'));
});
async function loadTabs(){
 if(nativeMode){await refreshState();updateControls();return;}
 try{
  const result=await rpc('media-list'),tabs=result.tabs||[];
  $('videoTab').replaceChildren();
  const automatic=document.createElement('option');automatic.value='active';automatic.textContent='Follow the tab I use';$('videoTab').appendChild(automatic);
  for(const tab of tabs){const option=document.createElement('option');option.value=tab.id;option.textContent=tab.title;$('videoTab').appendChild(option);}
  const target=selectedTab==='active'||!tabs.some(t=>t.id===selectedTab)?'active':selectedTab;
  $('videoTab').value=String(target);await chooseTab(target);
 }catch(error){status(error.message,true);}finally{updateControls();}
}
async function chooseTab(id){
 if(id!==selectedTab){setControls(false);window.SwichWireDevice?.reset();cancelWire();selectedTab=id;setControls(cameraOn);}
 updateControls();await refreshState();
}
function displayState(state){
 if(!state){$('playbackState').textContent='Page ready for scrolling';$('videoTime').textContent='—';$('videoVolume').textContent='Scroll controls ready';return;}
 const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 $('playbackState').textContent=(state.kind==='audio'?'Audio · ':'')+(state.paused?'Paused':'Playing');
 $('videoTime').textContent=time(state.time)+(state.duration?' / '+time(state.duration):' · live');
 $('videoVolume').textContent='Volume '+Math.round((state.muted?0:state.volume)*100)+'%';
}
function connection(ok,message){$('videoConnection').textContent=message||(ok?'Connected':'Visit the page you want to control.');$('videoConnection').className='connection'+(ok?' connected':'');}
function showResult(result){displayState(result.state);connection(true,result.target?.title?'Connected · '+result.target.title:'Connected');}
async function refreshState(){
 if(!helper)return false;const id=selectedTab;
 try{const result=await rpc('media-command',{tabId:id,command:{action:'status'}});if(selectedTab!==id)return false;showResult(result);return true;}
 catch(error){if(selectedTab===id)connection(false,error.message);return false;}
}
function cancelSource(source){queues[source]=[];if(helper)rpc('media-command',{tabId:selectedTab,source,command:{action:'cancel'}}).catch(()=>{});}
function cancelWire(){wireSession++;cancelSource('wire');}
function setControls(on){
 controlsOn=Boolean(on&&cameraOn&&helper);session++;cancelSource('camera');
 worker?.postMessage({type:'enabled',enabled:controlsOn,session});updateControls();
}
async function manualCommand(command){
 if(manualBusy||!helper)return;manualBusy=true;setControls(false);window.SwichWireDevice?.reset();cancelWire();updateControls();
 try{const result=await rpc('media-command',{tabId:selectedTab,source:'camera',command});showResult(result);status('Command sent.');}
 catch(error){status(error.message,true);}finally{manualBusy=false;setControls(cameraOn);}
}
function valid(source,generation){return helper&&(source==='wire'?generation===wireSession:controlsOn&&generation===session);}
async function enqueue(source,command,generation){
 if(!valid(source,generation))return;
 if(command.action==='shortcuts'){showShortcuts();return;}
 const item={command,generation},last=queues[source].at(-1);
 if(command.action.endsWith('Move')&&last?.generation===generation&&last.command.action===command.action&&last.command.gestureId===command.gestureId)queues[source][queues[source].length-1]=item;
 else queues[source].push(item);
 if(sending[source])return;sending[source]=true;
 try{while(queues[source].length){
  const data=queues[source].shift();if(!valid(source,data.generation))continue;
  try{
   const result=await rpc('media-command',{tabId:selectedTab,source,command:data.command});
   if(!valid(source,data.generation))continue;showResult(result);
   const labels={play:'Playing.',pause:'Paused.',toggle:result.state?.paused?'Paused.':'Playing.',seek:data.command.seconds>0?'Forward 10 seconds.':'Back 10 seconds.',scroll:data.command.direction>0?'Scroll down.':'Scroll up.',seekEnd:'Timeline set.',volumeEnd:'Volume set.',scrollEnd:'Scrolling stopped.'};
   if(result.message||labels[data.command.action])status(result.message||labels[data.command.action]);
  }catch(error){
   if(!valid(source,data.generation))continue;
   if(source==='wire'){cancelWire();window.SwichWireDevice?.reset();}else setControls(cameraOn);
   status(error.message+(source==='wire'?' Release your wire, then try again.':' Try a fresh gesture.'),true);
  }
 }}finally{sending[source]=false;}
}
function dispatchCommand(data){return enqueue('camera',data.command,data.session);}
window.SwichControls={ready:()=>helper,sendWire:command=>enqueue('wire',command,wireSession),cancelWire};
function draw(landmarks){
  if(document.hidden)return;
  context.clearRect(0,0,canvas.width,canvas.height);
  context.lineWidth=2.3;context.strokeStyle='#72e5d0';context.fillStyle='#d9fff8';
  for(const hand of landmarks){
    context.beginPath();for(const [a,b] of edges){context.moveTo((1-hand[a].x)*640,hand[a].y*480);context.lineTo((1-hand[b].x)*640,hand[b].y*480);}context.stroke();
    for(const p of hand){context.beginPath();context.arc((1-p.x)*640,p.y*480,3,0,Math.PI*2);context.fill();}
  }
}
async function startCamera(){
  if(starting)return;
  if(cameraOn){stopCamera();return;}
  if(!helper)return;
  if(!navigator.mediaDevices?.getUserMedia){status('Camera access needs a supported browser and the live HTTPS website.',true);return;}
  starting=true;updateControls();status('Starting camera…');
  const generation=++cameraGeneration;
  let acquired=null;
  try{
    status('Allow camera access when your browser asks…');
    acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;$('cameraVideo').srcObject=stream;await $('cameraVideo').play();
    if(generation!==cameraGeneration)return;
    status('Loading wink and hand tracking. The first load can take a moment…');
    worker=new Worker('camera/tracker-worker.js?v=12');
    const initialized=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Face and hand tracking could not load. Check your internet connection and try again.')),60000);
      workerReady={resolve:data=>{clearTimeout(timer);resolve(data);},reject:error=>{clearTimeout(timer);reject(error);}};
    });
    worker.onmessage=event=>{
      const data=event.data;
      if(data.type==='ready'){workerReady?.resolve(data);workerReady=null;}
      else if(data.type==='command')dispatchCommand(data);
      else if(data.type==='tracking'){
        $('trackingHint').textContent=data.hint;
        const hint=data.winkHint||'Look toward the camera with both eyes open';
        if($('winkHint').textContent!==hint)$('winkHint').textContent=hint;
        draw(data.landmarks);
      }
      else if(data.type==='frameDone')fallbackBusy=false;
      else if(data.type==='stopped'){worker?.terminate();worker=null;}
      else if(data.type==='ended'){stopCamera();status('The camera stream ended. Start the camera to reconnect.',true);}
      else if(data.type==='error'){const error=new Error(data.message);if(workerReady)workerReady.reject(error);else{stopCamera();status('Camera tracking stopped: '+error.message,true);}}
    };
    worker.onerror=event=>{const error=new Error(event.message||'The camera worker could not start.');if(workerReady)workerReady.reject(error);else{stopCamera();status(error.message,true);}};
    worker.postMessage({type:'init'});const ready=await initialized;
    if(generation!==cameraGeneration)return;
    const track=stream.getVideoTracks()[0];
    track.addEventListener('ended',()=>{if(cameraOn){stopCamera();status('Camera disconnected. Start the camera to reconnect.',true);}});
    if(typeof MediaStreamTrackProcessor!=='undefined'){
      try{
        const processor=new MediaStreamTrackProcessor({track,maxBufferSize:1});worker.postMessage({type:'stream',stream:processor.readable},[processor.readable]);transport='stream';
      }catch{startFallback();}
    }else if(ready.trackProcessor){
      const copy=track.clone();try{worker.postMessage({type:'track',track:copy},[copy]);transport='track';}catch{copy.stop();startFallback();}
    }else startFallback();
    starting=false;cameraOn=true;$('cameraPlaceholder').hidden=true;$('liveBadge').hidden=false;
    setControls(true);status('Look normally at the camera for a moment to learn your relaxed eyes. Then briefly wink your left eye for down / next, or right eye for up / previous.');
  }catch(error){
    if(generation!==cameraGeneration)return;
    stopCamera();status(error.name==='NotAllowedError'?'Camera permission was denied. Allow Camera for this site, then try again.':error.name==='NotFoundError'?'No camera was found. Check your device camera.':'Could not start the camera: '+error.message,true);
  }finally{if(generation===cameraGeneration)starting=false;updateControls();}
}
function startFallback(){
  transport='visible';if(!nativeMode)$('backgroundNote').textContent='This browser needs the camera panel visible. Keep it alongside your video in a separate window, or update Chrome for background control.';
  fallbackTimer=setInterval(async()=>{
    if(fallbackBusy||document.hidden||!worker||!cameraOn)return;
    fallbackBusy=true;
    try{const frame=await createImageBitmap($('cameraVideo'));if(worker)worker.postMessage({type:'frame',frame},[frame]);else frame.close();}
    catch{fallbackBusy=false;}
  },80);
}
function stopCamera(){
  setControls(false);session++;cameraGeneration++;cameraOn=false;starting=false;clearInterval(fallbackTimer);fallbackTimer=null;fallbackBusy=false;
  workerReady?.reject(new Error('Camera start cancelled.'));workerReady=null;
  const old=worker;worker=null;
  if(old){old.onmessage=event=>{if(event.data.type==='stopped')old.terminate();};try{old.postMessage({type:'stop'});}catch{}setTimeout(()=>old.terminate(),1000);}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  $('cameraVideo').srcObject=null;context.clearRect(0,0,640,480);$('cameraPlaceholder').hidden=false;$('liveBadge').hidden=true;
  $('trackingHint').textContent='Camera off';$('winkHint').textContent='Wink scrolling starts with the camera';status('Camera off.');updateControls();
}

async function showShortcuts(){
 $('shortcutsPanel').open=true;
 try{await rpc('focus-controller');$('link-wave').focus();}catch(error){status(error.message,true);}
}
const linkKeys=['wave','touch','longHold'];
try{const saved=JSON.parse(localStorage.getItem('wave-touch-links')||'{}');for(const key of linkKeys)$('link-'+key).value=typeof saved[key]==='string'?saved[key]:'';}catch{}
$('saveLinks').addEventListener('click',()=>{
 try{const saved={};for(const key of linkKeys){const raw=$('link-'+key).value.trim();if(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use full https:// website links.');saved[key]=u.href;}else saved[key]='';}localStorage.setItem('wave-touch-links',JSON.stringify(saved));status('Shortcuts saved on this device.');}catch(error){status(error.message,true);}
});
for(const key of linkKeys)$('open-'+key).addEventListener('click',async()=>{try{await rpc('open',{url:$('link-'+key).value.trim()});}catch(error){status(error.message,true);}});
$('relearnWinks')?.addEventListener('click',()=>{worker?.postMessage({type:'calibrateWinks'});status('Look normally at the camera for a moment. No need to widen your eyes.');});
$('cameraButton').addEventListener('click',startCamera);$('stopCamera').addEventListener('click',stopCamera);
$('refreshTabs').addEventListener('click',loadTabs);
$('toggleVideo').addEventListener('click',()=>manualCommand({action:'toggle'}));
$('backVideo').addEventListener('click',()=>manualCommand({action:'seek',seconds:-10}));
$('forwardVideo').addEventListener('click',()=>manualCommand({action:'seek',seconds:10}));
$('videoTab').addEventListener('change',()=>chooseTab($('videoTab').value==='active'?'active':Number($('videoTab').value)));
$('showVideo').addEventListener('click',async()=>{try{await rpc('media-command',{tabId:selectedTab,command:{action:'focus'}});}catch(error){status(error.message,true);}});
document.addEventListener('visibilitychange',()=>{
 if((nativeMode||transport==='visible')&&cameraOn){setControls(!document.hidden);if(document.hidden)status(nativeMode?'Keep Swich visible and unlocked for camera controls.':'Keep the camera panel visible beside your page on this browser.');}
 if(!document.hidden){ping();refreshState();}
});
window.addEventListener('pagehide',()=>{stopCamera();cancelWire();});
setInterval(()=>{if(!document.hidden&&(cameraOn||window.SwichWireDevice?.connected()))refreshState();},4000);
function activateNative(){
 nativeMode=true;helper=true;window.SwichNative.activate();updateControls();
 status('Ready without an extension. Choose a file, tap Play once, then start the camera.');refreshState();
}
if(nativeMode)activateNative();else{ping();updateControls();setTimeout(()=>{
 if(helper)return;
 if(window.SwichNative){activateNative();return;}
 $('setupNotice').hidden=false;$('extensionBadge').textContent='Helper update needed';status('Update Swich Tab Helper to version 1.5, then refresh this page.');
},2000);}
