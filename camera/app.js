'use strict';
const $=id=>document.getElementById(id),CHANNEL='swich-tab-helper-v1';
let helper=false,selectedTab=null,worker=null,stream=null,workerReady=null,cameraOn=false,controlsOn=false,starting=false,manualBusy=false,session=0,cameraGeneration=0,requestSerial=0,fallbackTimer=null,fallbackBusy=false,transport='';
const pending=new Map(),edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
let gestureQueue=[],gestureSending=false;
const canvas=$('landmarks'),context=canvas.getContext('2d');
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function updateControls(){
  $('refreshTabs').disabled=!helper;$('videoTab').disabled=!helper||starting;
  $('showVideo').disabled=!helper||selectedTab===null;
  $('cameraButton').disabled=starting||manualBusy||!helper||selectedTab===null;
  for(const id of ['backVideo','toggleVideo','forwardVideo'])$(id).disabled=starting||manualBusy||!helper||selectedTab===null;
  $('cameraButton').textContent=starting?'Starting camera…':!cameraOn?'Enable camera':controlsOn?'Pause controls':'Resume controls';
  $('stopCamera').hidden=!cameraOn&&!starting;
  $('trackingDot').classList.toggle('on',cameraOn&&controlsOn);
}
function ping(){window.postMessage({channel:CHANNEL,from:'page',type:'ping'},location.origin);}
function rpc(type,extra={}){
  if(!helper)return Promise.reject(new Error('Update the Swich helper and refresh this page first.'));
  const id=Date.now().toString(36)+'-'+(++requestSerial);
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('The extension connection timed out. Reload Swich Tab Helper in chrome://extensions, then refresh both tabs.'));},8000);
    pending.set(id,{resolve,reject,timeout});window.postMessage({channel:CHANNEL,from:'page',type,id,...extra},location.origin);
  });
}
window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  const data=event.data;if(data?.channel!==CHANNEL||data.from!=='extension')return;
  if(data.type==='ready'){
    const ready=data.available===true&&['camera-media','direct-playback','bounded-requests'].every(c=>data.capabilities?.includes(c)),becameReady=!helper&&ready;
    helper=Boolean(ready);$('setupNotice').hidden=helper;
    $('extensionBadge').textContent=helper?'Helper connected · v'+data.version:'Helper update needed';$('extensionBadge').className='badge'+(helper?' ready':'');
    if(!helper){setControls(false);status('Update Swich Tab Helper to version 1.2 for separate play/pause and the connection fix.');}
    else if(becameReady){status('Open a YouTube video, then choose it below.');loadTabs();}
    updateControls();return;
  }
  if(data.type!=='result'||!pending.has(data.id))return;
  const task=pending.get(data.id);pending.delete(data.id);clearTimeout(task.timeout);
  if(data.ok)task.resolve(data);else task.reject(new Error(data.error||'The command could not be completed.'));
});
async function loadTabs(){
  try{
    const result=await rpc('media-list'),tabs=result.tabs||[];
    const previous=selectedTab;
    $('videoTab').replaceChildren();
    if(!tabs.length){const option=document.createElement('option');option.value='';option.textContent='Open a YouTube video first';$('videoTab').appendChild(option);await chooseTab(null);status('Open a YouTube video, press Play once, then click the refresh button.');return;}
    for(const tab of tabs){const option=document.createElement('option');option.value=tab.id;option.textContent=tab.title;$('videoTab').appendChild(option);}
    const target=tabs.find(t=>t.id===previous)||tabs.find(t=>t.active)||tabs[0];
    $('videoTab').value=String(target.id);await chooseTab(target.id);
  }catch(error){status(error.message,true);}finally{updateControls();}
}
async function chooseTab(id){
  if(id!==selectedTab){
    const old=selectedTab;setControls(false);selectedTab=id;
    connection(false,id===null?'Choose a video to connect.':'Connecting to the selected video…');
    if(old!==null&&helper)rpc('media-command',{tabId:old,command:{action:'cancel'}}).catch(()=>{});
    if(cameraOn&&id!==null)status('Video changed. Click Resume controls when ready.');
  }
  updateControls();if(id!==null)await refreshState();
}
function displayState(state){
  if(!state)return;
  const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  $('playbackState').textContent=state.paused?'Paused':'Playing';
  $('videoTime').textContent=time(state.time)+(state.duration?' / '+time(state.duration):' · live');
  $('videoVolume').textContent=state.muted?'Muted':'Volume '+Math.round(state.volume*100)+'%';
}
async function refreshState(){
  if(!helper||selectedTab===null)return false;
  const id=selectedTab;
  try{
    const result=await rpc('media-command',{tabId:id,command:{action:'status'}});
    if(selectedTab!==id)return false;
    if(!result.state)throw new Error('No video reply. Refresh the selected YouTube tab.');
    displayState(result.state);connection(true);return true;
  }catch(error){if(selectedTab===id){connection(false,error.message);if(controlsOn)setControls(false);status(error.message,true);}return false;}
}
function connection(ok,message){
  $('videoConnection').textContent=ok?'Video connected':message||'YouTube is not connected. Refresh its tab and try again.';
  $('videoConnection').className='connection'+(ok?' connected':'');
  if(!ok){$('playbackState').textContent='Video not connected';$('videoTime').textContent='—';$('videoVolume').textContent='Volume —';}
}
async function manualCommand(command){
  if(manualBusy||!helper||selectedTab===null)return;
  const tabId=selectedTab,resume=controlsOn;
  setControls(false);const currentSession=session;manualBusy=true;updateControls();
  try{
    const result=await rpc('media-command',{tabId,command});
    if(currentSession!==session||selectedTab!==tabId)return;
    displayState(result.state);connection(true);
    status(command.action==='toggle'?(result.state?.paused?'YouTube paused.':'YouTube playing.'):(command.seconds>0?'Forward 10 seconds.':'Back 10 seconds.'));
    if(resume)setControls(true);
  }catch(error){if(currentSession===session){connection(false,error.message);status(error.message,true);}}
  finally{manualBusy=false;updateControls();}
}
function setControls(on){
  gestureQueue=[];
  const old=controlsOn;controlsOn=Boolean(on&&cameraOn&&helper&&selectedTab!==null);session++;
  worker?.postMessage({type:'enabled',enabled:controlsOn,session});
  if(old&&!controlsOn&&selectedTab!==null&&helper)rpc('media-command',{tabId:selectedTab,command:{action:'cancel'}}).catch(()=>{});
  updateControls();
}
function draw(landmarks){
  if(document.hidden)return;
  context.clearRect(0,0,canvas.width,canvas.height);
  context.lineWidth=2.3;context.strokeStyle='#72e5d0';context.fillStyle='#d9fff8';
  for(const hand of landmarks){
    context.beginPath();for(const [a,b] of edges){context.moveTo((1-hand[a].x)*640,hand[a].y*480);context.lineTo((1-hand[b].x)*640,hand[b].y*480);}context.stroke();
    for(const p of hand){context.beginPath();context.arc((1-p.x)*640,p.y*480,3,0,Math.PI*2);context.fill();}
  }
}
async function dispatchCommand(data){
  if(!controlsOn||data.session!==session||selectedTab===null)return;
  const last=gestureQueue.at(-1);
  if(data.command.action.endsWith('Move')&&last?.session===data.session&&last.command.action===data.command.action&&last.command.gestureId===data.command.gestureId)gestureQueue[gestureQueue.length-1]=data;
  else gestureQueue.push(data);
  if(gestureSending)return;
  gestureSending=true;
  try{while(gestureQueue.length)await sendGesture(gestureQueue.shift());}finally{gestureSending=false;}
}
async function sendGesture(data){
  if(!controlsOn||data.session!==session||selectedTab===null)return;
  const tabId=selectedTab,currentSession=session;
  try{
    const result=await rpc('media-command',{tabId,command:data.command});
    if(currentSession!==session)return;
    displayState(result.state);connection(true);
    const labels={play:'YouTube playing.',pause:'YouTube paused.',toggle:result.state?.paused?'YouTube paused.':'YouTube playing.',seek:data.command.seconds>0?'Forward 10 seconds.':'Back 10 seconds.',seekEnd:'Timeline released.',volumeEnd:'Volume set.'};
    if(labels[data.command.action])status(labels[data.command.action]);
  }catch(error){if(currentSession===session){setControls(false);status(error.message+' Click Resume controls to try again.',true);}}
}
async function startCamera(){
  if(starting)return;
  if(cameraOn&&controlsOn){setControls(false);status('Controls paused. Your camera preview stays on.');return;}
  if(!navigator.mediaDevices?.getUserMedia){status('Camera access needs Chrome and the live HTTPS website.',true);return;}
  starting=true;updateControls();status('Checking the selected YouTube video…');
  const startSession=++session,generation=++cameraGeneration;
  let acquired=null;
  try{
    if(!await refreshState()||generation!==cameraGeneration)return;
    if(cameraOn){setControls(true);status('Controls active. Show a relaxed hand first.');return;}
    status('Allow camera access when Chrome asks…');
    acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;$('cameraVideo').srcObject=stream;await $('cameraVideo').play();
    if(generation!==cameraGeneration)return;
    status('Loading hand tracking. The first load can take a moment…');
    worker=new Worker('camera/tracker-worker.js?v=4');
    const initialized=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Hand tracking could not load. Check your internet connection and try again.')),60000);
      workerReady={resolve:data=>{clearTimeout(timer);resolve(data);},reject:error=>{clearTimeout(timer);reject(error);}};
    });
    worker.onmessage=event=>{
      const data=event.data;
      if(data.type==='ready'){workerReady?.resolve(data);workerReady=null;}
      else if(data.type==='command')dispatchCommand(data);
      else if(data.type==='tracking'){$('trackingHint').textContent=data.hint;draw(data.landmarks);}
      else if(data.type==='frameDone')fallbackBusy=false;
      else if(data.type==='stopped'){worker?.terminate();worker=null;}
      else if(data.type==='ended'){stopCamera();status('The camera stream ended. Enable the camera to reconnect.',true);}
      else if(data.type==='error'){const error=new Error(data.message);if(workerReady)workerReady.reject(error);else{stopCamera();status('Hand tracking stopped: '+error.message,true);}}
    };
    worker.onerror=event=>{const error=new Error(event.message||'The camera worker could not start.');if(workerReady)workerReady.reject(error);else{stopCamera();status(error.message,true);}};
    worker.postMessage({type:'init'});const ready=await initialized;
    if(generation!==cameraGeneration)return;
    if(startSession!==session){stopCamera();return;}
    const track=stream.getVideoTracks()[0];
    track.addEventListener('ended',()=>{if(cameraOn){stopCamera();status('Camera disconnected. Enable the camera to reconnect.',true);}});
    if(typeof MediaStreamTrackProcessor!=='undefined'){
      try{
        const processor=new MediaStreamTrackProcessor({track,maxBufferSize:1});worker.postMessage({type:'stream',stream:processor.readable},[processor.readable]);transport='stream';
      }catch{startFallback();}
    }else if(ready.trackProcessor){
      const copy=track.clone();try{worker.postMessage({type:'track',track:copy},[copy]);transport='track';}catch{copy.stop();startFallback();}
    }else startFallback();
    starting=false;cameraOn=true;$('cameraPlaceholder').hidden=true;$('liveBadge').hidden=false;
    setControls(true);status('Controls active. Thumbs-up plays; thumbs-down pauses. Use one finger for skips/volume and two fingers for the timeline.');
  }catch(error){
    if(generation!==cameraGeneration)return;
    stopCamera();status(error.name==='NotAllowedError'?'Camera permission was denied. Allow Camera for this site, then try again.':error.name==='NotFoundError'?'No camera was found. Check your Chromebook camera.':'Could not start the camera: '+error.message,true);
  }finally{if(generation===cameraGeneration)starting=false;updateControls();}
}
function startFallback(){
  transport='visible';$('backgroundNote').textContent='This Chrome version needs the camera panel visible. Keep it alongside YouTube in a separate window, or update Chrome for background control.';
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
  $('trackingHint').textContent='Camera off';status('Camera off.');updateControls();
}
$('cameraButton').addEventListener('click',startCamera);$('stopCamera').addEventListener('click',stopCamera);
$('refreshTabs').addEventListener('click',loadTabs);
$('toggleVideo').addEventListener('click',()=>manualCommand({action:'toggle'}));
$('backVideo').addEventListener('click',()=>manualCommand({action:'seek',seconds:-10}));
$('forwardVideo').addEventListener('click',()=>manualCommand({action:'seek',seconds:10}));
$('videoTab').addEventListener('change',()=>chooseTab($('videoTab').value===''?null:Number($('videoTab').value)));
$('showVideo').addEventListener('click',async()=>{try{await rpc('media-command',{tabId:selectedTab,command:{action:'focus'}});}catch(error){status(error.message,true);}});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&transport==='visible'&&cameraOn){setControls(false);status('Camera panel hidden. Bring it back and click Resume controls.',true);}
  if(!document.hidden){ping();refreshState();}
});
window.addEventListener('pagehide',stopCamera);
setInterval(()=>{if(cameraOn&&!document.hidden)refreshState();},4000);
ping();updateControls();setTimeout(()=>{if(!helper){$('setupNotice').hidden=false;$('extensionBadge').textContent='Helper update needed';status('Update the Swich helper to version 1.2, then refresh this page and YouTube.');}},2000);
