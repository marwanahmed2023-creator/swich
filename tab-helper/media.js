'use strict';
(()=>{
  if(globalThis.__swichMediaInstalled)return;
  globalThis.__swichMediaInstalled=true;
  let transaction=null,hideTimer=null,hud=null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const time=n=>{n=Math.max(0,Math.round(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  function video(){
    const videos=[...document.querySelectorAll('video')].filter(v=>v.isConnected&&v.readyState>0);
    if(videos.includes(document.pictureInPictureElement))return document.pictureInPictureElement;
    const full=document.fullscreenElement;
    const candidates=videos.map(v=>{
      const rect=v.getBoundingClientRect(),style=getComputedStyle(v);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return null;
      if(v.checkVisibility&&!v.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
      if(full&&full!==v&&!full.contains(v))return null;
      // A feed can keep large, loaded videos far above/below the current post.
      // Rank by the area actually in view; playback state must not change the target.
      const width=Math.max(0,Math.min(rect.right,innerWidth)-Math.max(rect.left,0));
      const height=Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0));
      const area=width*height;
      return area>0?{video:v,area,center:Math.abs((rect.top+rect.bottom)/2-innerHeight/2)}:null;
    }).filter(Boolean).sort((a,b)=>b.area-a.area||a.center-b.center);
    if(!candidates.length)throw new Error('Bring a video into view and press Play once first. On Facebook, open the video or Reel you want to control.');
    return candidates[0].video;
  }
  function bounds(v){
    if(document.querySelector('.ad-showing'))throw new Error('Wait for the advertisement to finish before seeking.');
    if(v.seekable?.length)return [v.seekable.start(0),v.seekable.end(v.seekable.length-1)];
    if(Number.isFinite(v.duration)&&v.duration>0)return [0,v.duration];
    throw new Error('This video does not have a seekable timeline yet.');
  }
  function feedback(text,fraction){
    if(!hud){
      hud=document.createElement('div');hud.id='swich-camera-feedback';
      hud.style.cssText='position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
      const shadow=hud.attachShadow({mode:'closed'});
      const box=document.createElement('div');box.style.cssText='background:rgba(15,23,42,.94);border:1px solid #ffffff25;border-radius:14px;padding:15px 22px;color:#fff;font:600 16px/1.4 system-ui,sans-serif;box-shadow:0 10px 50px #0006;min-width:220px;text-align:center';
      const label=document.createElement('div'),bar=document.createElement('div'),fill=document.createElement('div');
      bar.style.cssText='height:5px;margin-top:10px;background:#ffffff25;border-radius:8px;overflow:hidden';fill.style.cssText='height:100%;background:#7dd3fc;border-radius:8px';
      bar.appendChild(fill);box.append(label,bar);shadow.appendChild(box);hud._parts={label,bar,fill};
    }
    const parent=document.fullscreenElement||document.documentElement;
    if(hud.parentNode!==parent)parent.appendChild(hud);
    hud._parts.label.textContent=text;hud._parts.bar.style.display=Number.isFinite(fraction)?'block':'none';
    hud._parts.fill.style.width=(clamp(fraction||0,0,1)*100)+'%';hud.style.display='block';
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>hud.style.display='none',1800);
  }
  function state(v){return {paused:v.paused,time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,volume:v.volume,muted:v.muted};}
  function fresh(request){if(Number.isFinite(request.expiresAt)&&Date.now()>=request.expiresAt)throw new Error('That request expired. Relax your hand and try again.');}
  async function play(v,expiresAt=Date.now()+1800){
    let timer;
    try{
      fresh({expiresAt});
      await Promise.race([v.play(),new Promise((_,reject)=>{timer=setTimeout(()=>{v.pause();reject(new Error('Playback timed out.'));},Math.max(1,Math.min(1800,expiresAt-Date.now())));})]);
    }catch{throw new Error('Click Play in the video tab once, then try the gesture again.');}
    finally{clearTimeout(timer);}
  }
  async function end(commit,expiresAt){
    const t=transaction;transaction=null;if(!t)return;
    let current=null;try{current=video();}catch{}
    if(t.kind==='seek'&&t.video===current&&t.video.isConnected&&t.video.currentSrc===t.src){
      if(commit)t.video.currentTime=t.target;
      if(t.wasPlaying)await play(t.video,expiresAt);
      feedback(commit?'Seek to '+time(t.target):'Timeline released');
    }
  }
  function active(request,kind){
    const t=transaction;
    if(!t||t.key!==request.controllerId+':'+request.gestureId||t.kind!==kind)throw new Error('Start a new gesture.');
    if(t.video!==video()||!t.video.isConnected||t.video.currentSrc!==t.src)throw new Error('The video changed. Start a new gesture.');
    t.deadline=Date.now()+2500;return t;
  }
  async function command(request){
    fresh(request);
    const action=request.action;
    if(action==='cancel'){await end(false,request.expiresAt);return {ok:true};}
    const v=video();
    if(action==='status')return {ok:true,state:state(v)};
    if(['toggle','play','pause'].includes(action)){
      // An explicit pause also cancels a timeline transaction without resuming it.
      if(action==='pause'&&transaction?.kind==='seek')transaction.wasPlaying=false;
      await end(false,request.expiresAt);fresh(request);
      const shouldPlay=action==='play'||(action==='toggle'&&v.paused);
      if(shouldPlay){if(v.paused)await play(v,request.expiresAt);feedback('Playing');}else{v.pause();feedback('Paused');}
    }else if(action==='seek'){
      await end(false,request.expiresAt);fresh(request);const [low,high]=bounds(v);v.currentTime=clamp(v.currentTime+request.seconds,low,high);
      feedback((request.seconds>0?'Forward':'Back')+' 10 seconds');
    }else if(action==='seekStart'){
      await end(false,request.expiresAt);fresh(request);const [low,high]=bounds(v);
      transaction={kind:'seek',key:request.controllerId+':'+request.gestureId,video:v,src:v.currentSrc,base:v.currentTime,target:v.currentTime,low,high,wasPlaying:!v.paused,deadline:Date.now()+2500};
      v.pause();feedback('Drag timeline · '+time(v.currentTime),(v.currentTime-low)/(high-low));
    }else if(action==='seekMove'){
      const t=active(request,'seek');t.target=clamp(t.base+request.delta*(t.high-t.low),t.low,t.high);
      feedback('Seek to '+time(t.target),(t.target-t.low)/(t.high-t.low));
    }else if(action==='seekEnd'){
      active(request,'seek');await end(request.commit===true,request.expiresAt);
    }else if(action==='volumeStart'){
      await end(false,request.expiresAt);fresh(request);transaction={kind:'volume',key:request.controllerId+':'+request.gestureId,video:v,src:v.currentSrc,base:v.muted?0:v.volume,deadline:Date.now()+2500};
      feedback('Volume '+Math.round(transaction.base*100)+'%',transaction.base);
    }else if(action==='volumeMove'){
      const t=active(request,'volume');v.volume=clamp(t.base+request.delta,0,1);v.muted=false;
      feedback('Volume '+Math.round(v.volume*100)+'%',v.volume);
    }else if(action==='volumeEnd'){
      active(request,'volume');transaction=null;
    }else throw new Error('Unknown media command.');
    return {ok:true,state:state(v)};
  }
  let queue=Promise.resolve();
  chrome.runtime.onMessage.addListener((request,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||request?.type!=='SWICH_VIDEO_COMMAND')return false;
    request={...request,expiresAt:Number.isFinite(request.expiresAt)?request.expiresAt:Date.now()+3500};
    if(request.action==='status'){command(request).then(reply).catch(error=>reply({ok:false,error:error.message}));return true;}
    queue=queue.then(()=>command(request)).then(reply).catch(error=>reply({ok:false,error:error.message}));
    return true;
  });
  setInterval(()=>{if(transaction&&Date.now()>transaction.deadline)queue=queue.then(()=>end(false)).catch(()=>{});},500);
})();
