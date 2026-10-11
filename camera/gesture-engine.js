(function(root){
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const PINCH=.35,RELEASE=.52,STALE_FRAME=1500;
  function describe(points,label=''){
    if(!Array.isArray(points)||points.length!==21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const width=distance(points[5],points[17]);
    if(width<.035)return null;
    const extended=(tip,joint)=>distance(points[tip],points[0])>distance(points[joint],points[0])*1.16;
    return {label,x:1-(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2,
      index:distance(points[4],points[8])/width,middle:distance(points[4],points[12])/width,
      my:(points[4].y+points[12].y)/2,
      vx:1-(points[8].x+points[12].x)/2,vy:(points[8].y+points[12].y)/2,
      victory:extended(8,6)&&extended(12,10)&&!extended(16,14)&&!extended(20,18)};
  }
  class GestureEngine{
    constructor(emit){this.emit=emit;this.mode=null;this.lastTime=null;this.cooldown=0;this.serial=0;this.warmUntil=0;this.message='Show a relaxed hand';}
    reset(now=0){this.cancel();this.lastTime=null;this.cooldown=now+350;this.warmUntil=now+500;this.message='Show a relaxed hand';}
    cancel(){
      if(this.mode?.started)this.emit({action:this.mode.type==='index'?'seekEnd':this.mode.type==='volume'?'volumeEnd':'zoomEnd',gestureId:this.mode.id,commit:false});
      this.mode=null;
    }
    start(type,h,now,span){this.mode={type,id:'g'+(++this.serial),at:now,x:h.x,y:h.y,label:h.label,span,frames:1,moved:0,started:false,lastSent:0};}
    send(action,now,extra={}){this.mode.lastSent=now;this.emit({action,gestureId:this.mode.id,...extra});}
    update(hands,now){
      if(this.lastTime!==null&&(now-this.lastTime>STALE_FRAME||now<=this.lastTime)){this.cancel();this.cooldown=now+400;this.warmUntil=now+400;}
      this.lastTime=now;
      if(!hands.length){this.cancel();this.message='Show your hand to control the video';return this.message;}
      if(now<this.warmUntil||now<this.cooldown){this.message='Ready for your next gesture';return this.message;}
      const two=hands.length>=2&&hands[0].index<.38&&hands[1].index<.38;
      if(two){
        const span=Math.hypot(hands[0].x-hands[1].x,hands[0].y-hands[1].y);
        if(span<.12){this.cancel();this.message='Move your hands farther apart';return this.message;}
        if(this.mode?.type!=='zoom'){this.cancel();this.start('zoom',hands[0],now,span);}
        const m=this.mode;m.frames++;
        if(!m.started&&now-m.at>=220&&m.frames>=3){m.started=true;this.send('zoomStart',now);}
        if(m.started&&now-m.lastSent>=160)this.send('zoomMove',now,{scale:clamp(span/m.span,.4,2.5)});
        this.message='Two-hand pinch · page zoom';return this.message;
      }
      if(this.mode?.type==='zoom'){this.send('zoomEnd',now,{commit:true});this.mode=null;this.cooldown=now+400;return this.message='Zoom set';}
      if(hands.length!==1){this.cancel();return this.message='Use one hand, or pinch with both to zoom';}
      const h=hands[0];
      if(this.mode?.label&&h.label&&this.mode.label!==h.label){this.cancel();this.cooldown=now+350;return this.message='Hand changed · release and try again';}
      const m=this.mode;
      if(m?.type==='index'){
        m.frames++;
        if(h.index>RELEASE){
          if(m.started)this.send('seekEnd',now,{commit:true});
          else if(now-m.at>=90&&now-m.at<=1400&&m.frames>=3&&m.moved<.075)this.emit({action:'toggle'});
          this.mode=null;this.cooldown=now+450;return this.message=m.started?'Timeline set':'Ready';
        }
        // Opening the fingers moves their midpoint. Only measure drag motion
        // while they are still pinched, so a normal release can toggle playback.
        if(h.index>PINCH)return this.message='Release your pinch to finish';
        m.moved=Math.max(m.moved,Math.hypot(h.x-m.x,h.y-m.y));
        if(!m.started&&now-m.at>=300&&Math.abs(h.x-m.x)>.045&&m.frames>=3){m.started=true;this.send('seekStart',now);}
        if(m.started&&now-m.lastSent>=100)this.send('seekMove',now,{delta:clamp(h.x-m.x,-1,1)});
        return this.message=m.started?'Drag sideways · release to seek':'Quick release: play/pause · hold and move: timeline';
      }
      if(m?.type==='volume'){
        m.frames++;
        if(h.middle>RELEASE){if(m.started)this.send('volumeEnd',now,{commit:true});this.mode=null;this.cooldown=now+300;return this.message='Volume set';}
        if(!m.started&&now-m.at>=180&&m.frames>=3){m.started=true;this.send('volumeStart',now);}
        if(m.started&&now-m.lastSent>=100)this.send('volumeMove',now,{delta:clamp((m.y-h.my)*1.8,-1,1)});
        return this.message='Middle-finger pinch · move up or down for volume';
      }
      if(m?.type==='swipe'){
        if(!h.victory){this.mode=null;return this.message='Ready';}
        m.frames++;
        if(!m.done&&now-m.at>=100&&now-m.at<=900&&m.frames>=3&&Math.abs(h.vx-m.x)>.17&&Math.abs(h.vy-m.y)<.16){
          const seconds=h.vx>m.x?10:-10;this.emit({action:'seek',seconds});m.done=true;
          return this.message=seconds>0?'Forward 10 seconds':'Back 10 seconds';
        }
        if(!m.done&&now-m.at>900){m.at=now;m.x=h.vx;m.y=h.vy;m.frames=1;}
        return this.message=m.done?'Lower your fingers before the next swipe':'Two fingers up · swipe left or right';
      }
      if(h.middle<PINCH&&h.middle<h.index*.8){this.start('volume',h,now);this.mode.y=h.my;return this.message='Volume gesture';}
      if(h.index<PINCH){this.start('index',h,now);return this.message='Pinch detected';}
      if(h.victory){this.start('swipe',h,now);this.mode.x=h.vx;this.mode.y=h.vy;return this.message='Swipe left or right';}
      return this.message='Ready · pinch, swipe, or use two hands';
    }
  }
  const api={GestureEngine,describe};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SwichGestures=api;
})(typeof self!=='undefined'?self:globalThis);
