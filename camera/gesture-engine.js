(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  // Correct normalized image coordinates for the camera's 4:3 frame.
  const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*.75);
  const deadband=value=>Math.sign(value)*Math.max(0,Math.abs(value)-.02);
  const scrollPose=pose=>pose==='flick'||pose==='palm';
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
    const thumbsDown=count===0&&(points[4].y-points[2].y)*.75>width*.65&&(points[4].y-points[3].y)*.75>width*.12;
    const tilted=Math.abs(points[8].x-points[5].x)>Math.abs((points[8].y-points[5].y)*.75)*.45;
    const pose=thumbsUp?'like':thumbsDown?'dislike':count===4?'palm':fingers[0]&&count===1?(tilted?'flick':'one'):fingers[0]&&fingers[1]&&count===2?'two':'rest';
    const tip=pose==='two'?{x:(points[8].x+points[12].x)/2,y:(points[8].y+points[12].y)/2}:points[8];
    // Open-hand scrolling follows the palm, never the fingertips.
    const palm=[0,5,9,13,17].reduce((a,i)=>({x:a.x+points[i].x/5,y:a.y+points[i].y/5}),{x:0,y:0});
    const position=pose==='palm'?palm:tip;
    return {label,pose,count,x:1-position.x,y:position.y*.75};
  }
  class GestureEngine{
    constructor(emit){
      this.emit=emit;this.mode=null;this.serial=0;this.lastTime=null;this.warmUntil=0;
      this.blocked=false;this.restAt=null;this.restFrames=0;this.message='Thumbs-up plays · thumbs-down pauses';
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
    settleScroll(h,now){
      const m=this.mode;
      Object.assign(m,{phase:'settle',anchorX:h.x,anchorY:h.y,stableAt:now,stableFrames:1,
        sampleAt:now,sampleX:h.x,sampleY:h.y,x:h.x,y:h.y,stroke:null});
    }
    readyScroll(x,y){
      const m=this.mode;m.phase='ready';m.baseX=x;m.baseY=y;m.stroke=null;
    }
    scrollHint(){return this.mode.pose==='palm'?'Open hand · large, quick sweep up':'Slanted finger · short, slow stroke down';}
    updateScroll(h,now){
      const m=this.mode,up=m.pose==='palm',direction=up?-1:1;
      if(!m.phase){this.settleScroll(h,now);return this.message='Hold steady briefly · then '+(up?'sweep your open hand up':'move your slanted finger down');}
      const dt=now-m.sampleAt,stepX=h.x-m.sampleX,stepY=h.y-m.sampleY;
      m.sampleAt=now;m.sampleX=h.x;m.sampleY=h.y;
      // Lost frames, re-entry, and tracker jumps cannot supply a swipe's distance.
      if(dt>250||Math.hypot(stepX,stepY)>.12){this.settleScroll(h,now);return this.message='Repositioning · hold steady briefly';}
      if(m.phase==='settle'){
        if(Math.hypot(h.x-m.anchorX,h.y-m.anchorY)>.012){this.settleScroll(h,now);return this.message='Repositioning · hold steady briefly';}
        m.stableFrames++;
        if(now-m.stableAt>=220&&m.stableFrames>=3){m.x=h.x;m.y=h.y;this.readyScroll(h.x,h.y);return this.message=this.scrollHint();}
        return this.message='Hold steady briefly · your hand can stay in view';
      }
      const alpha=1-Math.exp(-Math.max(1,dt)/45);
      m.x+=(h.x-m.x)*alpha;m.y+=(h.y-m.y)*alpha;
      if(m.phase==='return'){
        // Continuing the same stroke never repeats. Its opposite return is inert.
        if(direction*(m.y-m.extreme)>0)m.extreme=m.y;
        if(direction*(m.extreme-m.y)>=(up?.055:.02))this.readyScroll(m.x,m.y);
        return this.message=m.phase==='ready'?this.scrollHint():'Bring '+(up?'your open hand down':'your finger back up')+' to repeat · keep it in view';
      }
      const dy=direction*(m.y-m.baseY),dx=m.x-m.baseX;
      if(dy<-.006){this.readyScroll(m.x,m.y);return this.message='Repositioning · '+(up?'downward return ignored':'upward return ignored');}
      if(!m.stroke){
        if(dy<.008){
          // Stationary waiting never contributes to the speed of a future swipe.
          if(Math.abs(dx)>.035)this.readyScroll(m.x,m.y);
          return this.message=this.scrollHint();
        }
        m.stroke={at:now-dt,frames:0};
      }
      const stroke=m.stroke,age=now-stroke.at,speed=dy/Math.max(1,age);stroke.frames++;
      const sideways=Math.abs(dx)>Math.max(up?.08:.04,dy*1.4);
      const tooLong=age>(up?500:1500),tooFast=!up&&speed>.00024;
      // Down is deliberately slow and short. Up must travel much farther, fast.
      if(sideways||tooLong||tooFast){m.phase='return';m.extreme=m.y;return this.message=up?'Reposition, then make a larger, quicker open-hand sweep':'Reposition, then make a short, slower finger stroke';}
      const enough=up?dy>=.16&&speed>=.00035&&stroke.frames>=2:dy>=.038&&age>=200&&speed>=.000025&&stroke.frames>=3;
      if(enough){
        this.emit({action:'scroll',direction});m.phase='return';m.extreme=m.y;
        return this.message='Scroll '+(up?'up':'down')+' · return your '+(up?'hand':'finger')+' to repeat';
      }
      return this.message=this.scrollHint();
    }
    update(hands,now){
      const elapsed=this.lastTime===null?100:now-this.lastTime;
      if(this.lastTime!==null&&(elapsed>1500||elapsed<=0)){
        this.cancel();this.blocked=true;this.clearRest();this.warmUntil=now+400;
      }
      this.lastTime=now;
      if(hands.length!==1){
        if(this.mode){this.cancel();this.blocked=true;this.clearRest();}
        if(!hands.length)this.rest(now);else{this.blocked=true;this.clearRest();}
        return this.message=hands.length?'Use just one hand':'Resting · thumbs-up plays · thumbs-down pauses';
      }
      const h=hands[0];
      if(now<this.warmUntil)return this.message='Getting ready · hold your hand steady';
      if(this.mode?.label&&h.label&&this.mode.label!==h.label){
        const scrolling=scrollPose(this.mode.pose)||scrollPose(h.pose);
        this.cancel();this.blocked=true;this.clearRest();return this.message=scrolling?'Hand changed · hold steady briefly':'Hand changed · relax your fingers first';
      }
      // Scrolling arms from a steady pose and rearms from a return stroke.
      // It never requires the generic lower-your-hand gate.
      if(scrollPose(h.pose)&&!this.mode){this.blocked=false;this.clearRest();}
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
          this.finish(true);this.blocked=!scrollPose(m.pose)&&!scrollPose(h.pose);this.clearRest();
          if(h.pose==='rest'){this.restAt=restAt;this.restFrames=restFrames;this.rest(now);}
          if(scrollPose(m.pose)||scrollPose(h.pose))return this.message='Gesture changed · hold steady briefly';
          return this.message='Finished · relax your fingers';
        }
        return this.message=scrollPose(m.pose)||scrollPose(h.pose)?'Repositioning · waiting for a steady gesture':'Relax your fingers to finish';
      }
      if(h.pose==='rest')return this.message='Ready · one/two fingers, thumbs-up or thumbs-down';
      if(!m){
        this.clearRest();
        this.mode={pose:h.pose,id:'g'+(++this.serial),label:h.label,at:now,frames:1,ready:false,started:false,kind:null,
          x:h.x,y:h.y,baseX:h.x,baseY:h.y,lastSent:0,lastValue:null,exitAt:null,exitFrames:0};
        if(scrollPose(h.pose))return this.updateScroll(h,now);
        return this.message=h.pose==='like'?'Thumbs-up · hold to play':h.pose==='dislike'?'Thumbs-down · hold to pause':h.pose==='one'?'One finger · hold briefly, then move':'Two fingers · hold briefly, then move sideways';
      }
      if(m.exitAt!==null&&scrollPose(m.pose))this.settleScroll(h,now);
      if(m.exitAt!==null&&(['like','dislike'].includes(m.pose)||!m.ready)){m.at=now;m.frames=0;}
      m.exitAt=null;m.exitFrames=0;m.frames++;
      if(scrollPose(m.pose))return this.updateScroll(h,now);
      if(m.pose==='like'||m.pose==='dislike'){
        const action=m.pose==='like'?'play':'pause';
        if(now-m.at>=600&&m.frames>=2){this.emit({action});this.mode=null;this.blocked=true;this.clearRest();return this.message=(action==='play'?'Play':'Pause')+' · relax your hand';}
        return this.message=m.pose==='like'?'Thumbs-up · hold to play':'Thumbs-down · hold to pause';
      }
      if(!m.ready){
        if(now-m.at>=180&&m.frames>=2){m.ready=true;m.baseX=m.x=h.x;m.baseY=m.y=h.y;}
        return this.message=m.pose==='one'?'One finger · left/right: 10 seconds · up/down: volume':'Two fingers · move left/right for the timeline';
      }
      const alpha=1-Math.exp(-Math.max(1,elapsed)/90);
      m.x+=(h.x-m.x)*alpha;m.y+=(h.y-m.y)*alpha;
      const dx=m.x-m.baseX,dy=m.y-m.baseY;
      if(!m.kind){
        const ax=Math.abs(dx),ay=Math.abs(dy);
        if(Math.max(ax,ay)<.045||Math.max(ax,ay)<Math.min(ax,ay)*1.35)return this.message='Ready · make a small sideways or up/down movement';
        const horizontal=ax>ay;
        if(m.pose==='two'&&!horizontal)return this.message='Two fingers · move sideways for the timeline';
        if(m.pose==='one'&&horizontal){
          const seconds=dx>0?10:-10;this.emit({action:'seek',seconds});this.mode=null;this.blocked=true;this.clearRest();
          return this.message=(seconds>0?'Forward':'Back')+' 10 seconds · relax your finger';
        }
        m.kind=m.pose==='one'?'volume':'seek';m.started=true;this.send(m.kind+'Start',now);
      }
      const value=m.kind==='volume'?clamp(-deadband(dy)*4,-1,1):clamp(deadband(dx),-1,1);
      if(m.lastValue===null||(now-m.lastSent>=120&&(Math.abs(value-m.lastValue)>.004||now-m.lastSent>=800))){
        this.send(m.kind+'Move',now,{delta:value});m.lastValue=value;
      }
      return this.message=m.kind==='volume'?'Volume · move up/down · lower your hand to finish':'Timeline · move left/right · bend your fingers to set';
    }
  }
  const api={GestureEngine,describe};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SwichGestures=api;
})(typeof self!=='undefined'?self:globalThis);
