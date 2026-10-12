'use strict';
(()=>{
  if(globalThis.__swichMediaInstalled)return;
  globalThis.__swichMediaInstalled=true;
  let transaction=null,hideTimer=null,hud=null,lastAudio=null,localTarget=null,localNavigation=null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const time=n=>{n=Math.max(0,Math.round(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  function video(){
    if(localTarget){
      const chosen=localTarget();
      if(chosen?.isConnected&&chosen.readyState>0)return chosen;
      throw new Error('Choose a video or audio file here and tap Play once.');
    }
    const videos=[...document.querySelectorAll('video')].filter(v=>v.isConnected&&v.readyState>0&&v.id!=='cameraVideo');
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
    if(candidates.length)return candidates[0].video;
    const audio=[...document.querySelectorAll('audio')].filter(a=>a.isConnected&&a.readyState>0);
    const chosen=audio.find(a=>!a.paused&&!a.ended)||(audio.includes(lastAudio)?lastAudio:null)||audio[0];
    if(chosen){lastAudio=chosen;return chosen;}
    throw new Error('Open a video or audio track and press Play once. For local files, use the Swich file player.');
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
  function state(v){return {kind:v.tagName==='AUDIO'?'audio':'video',paused:v.paused,time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,volume:v.volume,muted:v.muted};}
  globalThis.__swichMediaProbe=()=>{
    try{const v=video(),r=v.getBoundingClientRect();return {state:state(v),rank:r.width*r.height};}catch{return {state:null};}
  };
  function scrollTarget(){
    let el=document.elementFromPoint?.(innerWidth/2,innerHeight/2);
    while(el&&el!==document.documentElement){
      const style=getComputedStyle(el);
      if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+2)return el;
      el=el.parentElement;
    }
    return document.scrollingElement||document.documentElement;
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&
      (!el.checkVisibility||el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))&&
      r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&r.width>0&&r.height>0;
  }
  function shortsRoot(){
    const url=globalThis.location;
    if(!url||!/(^|\.)youtube\.com$/.test(url.hostname)||!/^\/shorts(?:\/|$)/.test(url.pathname))return null;
    return [...document.querySelectorAll('ytd-shorts')].find(visible)||null;
  }
  function navigateShorts(direction,root){
    const id=direction>0?'navigation-button-down':'navigation-button-up';
    const buttons=[...root.querySelectorAll('#'+id+' button, button#'+id)].filter(visible);
    const button=buttons.find(b=>!b.disabled&&!b.closest('[disabled], [aria-disabled="true"]'));
    if(button){
      button.click();feedback(direction>0?'Next Short':'Previous Short');return;
    }
    // Respect a disabled native control instead of forcing navigation.
    if(buttons.length)throw new Error('That Shorts navigation button is unavailable. Try again in a moment.');
    // Some layouts hide the arrows. Scroll the feed itself, never the ad,
    // comments panel, or iframe under the middle of the screen.
    const containers=[root.querySelector('#shorts-container')];
    const reel=root.querySelector('ytd-reel-video-renderer[is-active]');
    let target=reel?.parentElement;
    while(target&&root.contains(target)){
      containers.push(target);target=target.parentElement;
    }
    containers.push(root);
    for(const target of new Set(containers.filter(Boolean))){
      if(visible(target)&&target.scrollHeight>target.clientHeight+2&&/auto|scroll|hidden/.test(getComputedStyle(target).overflowY)){
        target.scrollBy({top:direction*target.clientHeight,behavior:'instant'});
        feedback(direction>0?'Next Short':'Previous Short');return;
      }
    }
    throw new Error('Shorts navigation is not available yet. Let the feed load, then swipe again.');
  }
  function scrollPage(direction,target=scrollTarget(),amount=Math.max(200,innerHeight*.65)){
    target.scrollBy({top:direction*amount,behavior:'instant'});
    feedback(direction>0?'Scroll down':'Scroll up');
  }
  function fresh(request){if(Number.isFinite(request.expiresAt)&&Date.now()>=request.expiresAt)throw new Error('That request expired. Relax your hand and try again.');}
  async function play(v,expiresAt=Date.now()+1800){
    let timer;
    try{
      fresh({expiresAt});
      await Promise.race([v.play(),new Promise((_,reject)=>{timer=setTimeout(()=>{v.pause();reject(new Error('Playback timed out.'));},Math.max(1,Math.min(1800,expiresAt-Date.now())));})]);
    }catch{throw new Error(localTarget?'Tap Play on this player once, then try the gesture again.':'Click Play in the video tab once, then try the gesture again.');}
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
    if(t.kind!=='scroll'&&(t.video!==video()||!t.video.isConnected||t.video.currentSrc!==t.src))throw new Error('The video changed. Start a new gesture.');
    t.deadline=Date.now()+2500;return t;
  }
  async function command(request){
    fresh(request);
    const action=request.action;
    if(action==='cancel'){if(!transaction||transaction.owner===request.controllerId)await end(false,request.expiresAt);return {ok:true};}
    if(action==='status')return {ok:true,page:true,...globalThis.__swichMediaProbe()};
    if(transaction&&transaction.owner!==request.controllerId)throw new Error('Finish the other controller gesture first.');
    if(action==='scroll'){
      await end(false,request.expiresAt);fresh(request);
      const navigated=localNavigation&&await localNavigation(request.direction);
      if(navigated){feedback(navigated);return {ok:true,page:true,message:navigated,...globalThis.__swichMediaProbe()};}
      const root=shortsRoot();if(root)navigateShorts(request.direction,root);else scrollPage(request.direction);
      return {ok:true,page:true};
    }
    if(action==='scrollStart'){
      await end(false,request.expiresAt);fresh(request);
      transaction={kind:'scroll',owner:request.controllerId,key:request.controllerId+':'+request.gestureId,target:scrollTarget(),nextScrollAt:0,deadline:Date.now()+2500};return {ok:true,page:true};
    }
    if(action==='scrollMove'){
      const t=active(request,'scroll'),direction=Math.sign(request.delta),root=shortsRoot();
      if(direction&&localNavigation){
        if(Date.now()<t.nextScrollAt)return {ok:true,page:true};
        const navigated=await localNavigation(direction);
        if(navigated){t.nextScrollAt=Date.now()+600;feedback(navigated);return {ok:true,page:true,message:navigated};}
      }
      if(direction&&root){if(Date.now()>=t.nextScrollAt){navigateShorts(direction,root);t.nextScrollAt=Date.now()+600;}}
      else if(direction)scrollPage(direction,t.target,Math.abs(request.delta)*120);
      return {ok:true,page:true};
    }
    if(action==='scrollEnd'){active(request,'scroll');transaction=null;return {ok:true,page:true};}
    const v=video();
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
      transaction={kind:'seek',owner:request.controllerId,key:request.controllerId+':'+request.gestureId,video:v,src:v.currentSrc,base:v.currentTime,target:v.currentTime,low,high,wasPlaying:!v.paused,deadline:Date.now()+2500};
      v.pause();feedback('Drag timeline · '+time(v.currentTime),(v.currentTime-low)/(high-low));
    }else if(action==='seekMove'){
      const t=active(request,'seek');t.target=clamp(t.base+request.delta*(t.high-t.low),t.low,t.high);
      feedback('Seek to '+time(t.target),(t.target-t.low)/(t.high-t.low));
    }else if(action==='seekEnd'){
      active(request,'seek');await end(request.commit===true,request.expiresAt);
    }else if(action==='volumeStart'){
      await end(false,request.expiresAt);fresh(request);transaction={kind:'volume',owner:request.controllerId,key:request.controllerId+':'+request.gestureId,video:v,src:v.currentSrc,base:v.muted?0:v.volume,deadline:Date.now()+2500};
      feedback('Volume '+Math.round(transaction.base*100)+'%',transaction.base);
    }else if(action==='volumeMove'){
      const t=active(request,'volume');v.volume=clamp(t.base+request.delta,0,1);v.muted=false;
      if(localTarget&&Math.abs(v.volume-clamp(t.base+request.delta,0,1))>.02)throw new Error('This browser uses the phone’s volume buttons.');
      feedback('Volume '+Math.round(v.volume*100)+'%',v.volume);
    }else if(action==='volumeEnd'){
      active(request,'volume');transaction=null;
    }else throw new Error('Unknown media command.');
    return {ok:true,state:state(v)};
  }
  let queue=Promise.resolve();
  function execute(request){
    request={...request,expiresAt:Number.isFinite(request.expiresAt)?request.expiresAt:Date.now()+3500};
    if(request.action==='status')return command(request).catch(error=>({ok:false,error:error.message}));
    queue=queue.then(()=>command(request)).catch(error=>({ok:false,error:error.message}));return queue;
  }
  // This same media engine works on our own page without Chrome extension APIs.
  globalThis.SwichMedia={command:execute,setTarget(fn){localTarget=fn;},setNavigation(fn){localNavigation=fn;}};
  globalThis.chrome?.runtime?.onMessage?.addListener((request,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||request?.type!=='SWICH_VIDEO_COMMAND')return false;
    execute(request).then(reply);
    return true;
  });
  setInterval(()=>{if(transaction&&Date.now()>transaction.deadline)queue=queue.then(()=>end(false)).catch(()=>{});},500);
})();
