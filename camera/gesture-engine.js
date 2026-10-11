(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  // Correct normalized image coordinates for the camera's 4:3 frame.
  const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*.75);
  const deadband=value=>Math.sign(value)*Math.max(0,Math.abs(value)-.02);
  function describe(points,label=''){
    if(!Array.isArray(points)||points.length!==21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const width=distance(points[5],points[17]);
    if(width<.025)return null;
    function extended(base,joint,tip){
      const a={x:points[base].x-points[joint].x,y:(points[base].y-points[joint].y)*.75};
      const b={x:points[tip].x-points[joint].x,y:(points[tip].y-points[joint].y)*.75};
      const lengths=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
      return lengths>0&&(a.x*b.x+a.y*b.y)/lengths<-.65&&distance(points[tip],points[0])>distance(points[joint],points[0])*1.06;
    }
    const fingers=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(f=>extended(...f));
    const count=fingers.filter(Boolean).length;
    const thumbsUp=count===0&&(points[2].y-points[4].y)*.75>width*.65&&(points[3].y-points[4].y)*.75>width*.12;
    const pose=thumbsUp?'like':fingers[0]&&count===1?'one':fingers[0]&&fingers[1]&&count===2?'two':'rest';
    const tip=pose==='two'?{x:(points[8].x+points[12].x)/2,y:(points[8].y+points[12].y)/2}:points[8];
    return {label,pose,count,x:1-tip.x,y:tip.y*.75};
  }
  class GestureEngine{
    constructor(emit){
      this.emit=emit;this.mode=null;this.serial=0;this.lastTime=null;this.warmUntil=0;
      this.blocked=false;this.restAt=null;this.restFrames=0;this.message='Show one finger, two fingers, or a thumbs-up';
    }
    reset(now=0){this.cancel();this.lastTime=null;this.warmUntil=now+400;this.blocked=false;this.clearRest();}
    clearRest(){this.restAt=null;this.restFrames=0;}
    rest(now){
      if(this.restAt===null)this.restAt=now;
      this.restFrames++;
      if(now-this.restAt>=250&&this.restFrames>=2){this.blocked=false;this.clearRest();}
    }
    finish(commit){
      const m=this.mode;this.mode=null;
      if(m?.started)this.emit({action:m.kind+'End',gestureId:m.id,commit});
    }
    cancel(){this.finish(false);}
    send(action,now,extra={}){this.mode.lastSent=now;this.emit({action,gestureId:this.mode.id,...extra});}
    update(hands,now){
      const elapsed=this.lastTime===null?100:now-this.lastTime;
      if(this.lastTime!==null&&(elapsed>1500||elapsed<=0)){
        this.cancel();this.blocked=true;this.clearRest();this.warmUntil=now+400;
      }
      this.lastTime=now;
      if(hands.length!==1){
        if(this.mode){this.cancel();this.blocked=true;this.clearRest();}
        if(!hands.length)this.rest(now);else{this.blocked=true;this.clearRest();}
        return this.message=hands.length?'Use just one hand':'Resting · show one finger, two fingers, or a thumbs-up';
      }
      const h=hands[0];
      if(now<this.warmUntil)return this.message='Getting ready · keep your hand relaxed';
      if(this.mode?.label&&h.label&&this.mode.label!==h.label){
        this.cancel();this.blocked=true;this.clearRest();return this.message='Hand changed · relax your fingers first';
      }
      if(this.blocked){
        if(h.pose==='rest')this.rest(now);else this.clearRest();
        return this.message=this.blocked?'Relax your fingers before the next gesture':'Ready for your next gesture';
      }
      let m=this.mode;
      if(m&&h.pose!==m.pose){
        if(m.exitAt===null){m.exitAt=now;m.exitFrames=0;}
        m.exitFrames++;
        // One noisy frame must not finish a timeline drag or switch its action.
        if(now-m.exitAt>=180&&m.exitFrames>=2){
          const restAt=m.exitAt,restFrames=m.exitFrames;
          this.finish(true);this.blocked=true;this.clearRest();
          if(h.pose==='rest'){this.restAt=restAt;this.restFrames=restFrames;this.rest(now);}
          return this.message='Finished · relax your fingers';
        }
        return this.message='Relax your fingers to finish';
      }
      if(h.pose==='rest')return this.message='Ready · one finger, two fingers, or thumbs-up';
      if(!m){
        this.clearRest();
        this.mode={pose:h.pose,id:'g'+(++this.serial),label:h.label,at:now,frames:1,ready:false,started:false,kind:null,
          x:h.x,y:h.y,baseX:h.x,baseY:h.y,lastSent:0,lastValue:null,exitAt:null,exitFrames:0};
        return this.message=h.pose==='like'?'Thumbs-up · hold briefly':h.pose==='one'?'One finger · hold briefly, then move':'Two fingers · hold briefly, then move';
      }
      if(m.exitAt!==null&&(m.pose==='like'||!m.ready)){m.at=now;m.frames=0;}
      m.exitAt=null;m.exitFrames=0;m.frames++;
      if(m.pose==='like'){
        if(now-m.at>=600&&m.frames>=2){this.emit({action:'toggle'});this.mode=null;this.blocked=true;this.clearRest();return this.message='Play / pause · lower your thumb';}
        return this.message='Thumbs-up · hold briefly';
      }
      if(!m.ready){
        if(now-m.at>=180&&m.frames>=2){m.ready=true;m.baseX=m.x=h.x;m.baseY=m.y=h.y;}
        return this.message=m.pose==='one'?'One finger · left/right: 10 seconds · up/down: volume':'Two fingers · left/right: timeline · up/down: zoom';
      }
      const alpha=1-Math.exp(-Math.max(1,elapsed)/90);
      m.x+=(h.x-m.x)*alpha;m.y+=(h.y-m.y)*alpha;
      const dx=m.x-m.baseX,dy=m.y-m.baseY;
      if(!m.kind){
        const ax=Math.abs(dx),ay=Math.abs(dy);
        if(Math.max(ax,ay)<.045||Math.max(ax,ay)<Math.min(ax,ay)*1.35)return this.message='Ready · make a small sideways or up/down movement';
        const horizontal=ax>ay;
        if(m.pose==='one'&&horizontal){
          const seconds=dx>0?10:-10;this.emit({action:'seek',seconds});this.mode=null;this.blocked=true;this.clearRest();
          return this.message=(seconds>0?'Forward':'Back')+' 10 seconds · relax your finger';
        }
        m.kind=m.pose==='one'?'volume':horizontal?'seek':'zoom';m.started=true;this.send(m.kind+'Start',now);
      }
      const value=m.kind==='volume'?clamp(-deadband(dy)*4,-1,1):m.kind==='seek'?clamp(deadband(dx),-1,1):clamp(2**(-deadband(dy)*5),.4,2.5);
      if(m.lastValue===null||(now-m.lastSent>=120&&(Math.abs(value-m.lastValue)>.004||now-m.lastSent>=800))){
        this.send(m.kind+'Move',now,m.kind==='zoom'?{scale:value}:{delta:value});m.lastValue=value;
      }
      return this.message=m.kind==='volume'?'Volume · move up/down · relax to finish':m.kind==='seek'?'Timeline · move left/right · bend your fingers to set':'Zoom · move up/down · relax to finish';
    }
  }
  const api={GestureEngine,describe};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SwichGestures=api;
})(typeof self!=='undefined'?self:globalThis);
