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
      // Measure straightness from the knuckle, not distance from the wrist:
      // a straight finger pointing down can legitimately end near the wrist.
      return lengths>0&&(a.x*b.x+a.y*b.y)/lengths<-.65&&distance(points[tip],points[base])>distance(points[joint],points[base])*1.5;
    }
    const fingers=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(f=>extended(...f));
    const count=fingers.filter(Boolean).length;
    const thumbsUp=count===0&&(points[2].y-points[4].y)*.75>width*.65&&(points[3].y-points[4].y)*.75>width*.12;
    const thumbsDown=count===0&&(points[4].y-points[2].y)*.75>width*.65&&(points[4].y-points[3].y)*.75>width*.12;
    const tilted=Math.abs(points[8].x-points[5].x)>Math.abs((points[8].y-points[5].y)*.75)*.45;
    // Fingers held together can obscure the little finger. Three visible
    // straight fingers are enough; two still belong to the timeline gesture.
    const pose=thumbsUp?'like':thumbsDown?'dislike':count>=3&&fingers[0]&&fingers[1]?'palm':fingers[0]&&count===1?(tilted?'flick':'one'):fingers[0]&&fingers[1]&&count===2?'two':'rest';
    const flickAngle=Math.atan2((points[8].y-points[5].y)*.75,Math.abs(points[8].x-points[5].x))*180/Math.PI;
    const tip=pose==='two'?{x:(points[8].x+points[12].x)/2,y:(points[8].y+points[12].y)/2}:points[8];
    // Open-hand scrolling follows the palm, never the fingertips.
    const palm=[0,5,9,13,17].reduce((a,i)=>({x:a.x+points[i].x/5,y:a.y+points[i].y/5}),{x:0,y:0});
    const position=pose==='palm'?palm:tip;
    return {label,pose,count,x:1-position.x,y:position.y*.75,flickAngle};
  }
  class GestureEngine{
    constructor(emit){
      this.emit=emit;this.mode=null;this.serial=0;this.lastTime=null;this.warmUntil=0;
      this.blocked=false;this.restAt=null;this.restFrames=0;this.message='Thumbs-up plays · thumbs-down pauses';
    }
    reset(now=0){this.cancel();this.lastTime=null;this.warmUntil=now+400;this.scrollCooldownUntil=0;this.blocked=false;this.clearRest();}
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
    beginScroll(h,now){
      const m=this.mode;
      Object.assign(m,{scrollReady:true,sampleAt:now,sampleX:h.x,sampleY:h.y,x:h.x,y:h.y,
        trail:[{at:now,x:h.x,y:h.y,angle:h.flickAngle}]});
    }
    scrollHint(){return this.mode.pose==='palm'?'Fingers together · small swipe up':'Index finger sideways · flick to 45° down';}
    updateScroll(h,now){
      const m=this.mode,up=m.pose==='palm';
      if(!m.scrollReady){this.beginScroll(h,now);return this.message=this.scrollHint();}
      const dt=now-m.sampleAt,stepX=h.x-m.sampleX,stepY=h.y-m.sampleY;
      m.sampleAt=now;m.sampleX=h.x;m.sampleY=h.y;
      // A missing frame or a tracker jump cannot supply swipe distance. Tracking
      // continues immediately from the new reading; there is no stillness gate.
      if(dt>250||Math.hypot(stepX,stepY)>.12){this.beginScroll(h,now);return this.message=this.scrollHint();}
      // Smooth small oscillations before measuring net travel, rather than
      // classifying each shake as a return/repositioning movement.
      const alpha=1-Math.exp(-Math.max(1,dt)/45);
      m.x+=(h.x-m.x)*alpha;m.y+=(h.y-m.y)*alpha;
      if(now<(this.scrollCooldownUntil||0)){
        m.trail=[{at:now,x:m.x,y:m.y,angle:h.flickAngle}];
        return this.message=this.scrollHint();
      }
      m.trail.push({at:now,x:m.x,y:m.y,angle:h.flickAngle});
      m.trail=m.trail.filter(p=>now-p.at<=(up?550:450));
      let swept=false;
      if(up){
        // A small upward palm motion is enough. The moving window tolerates
        // natural shake without a hold-still, return, or large-sweep gate.
        swept=m.trail.slice(0,-2).some(p=>{
          const travel=p.y-m.y,age=now-p.at;
          return age>=60&&travel>=.055&&travel/age>=.00010&&Math.abs(m.x-p.x)<=Math.max(.05,travel*1.5);
        });
      }else if(Number.isFinite(h.flickAngle)&&h.flickAngle>=28&&h.flickAngle<=70){
        // Track the index finger's angle: horizontal -> diagonally down.
        // Position alone cannot fire on a hand return or a sideways movement.
        swept=m.trail.slice(0,-2).some(p=>now-p.at>=60&&Number.isFinite(p.angle)&&p.angle>=-25&&p.angle<=20&&h.flickAngle-p.angle>=28);
      }
      if(swept){
        this.emit({action:'scroll',direction:up?-1:1});this.scrollCooldownUntil=now+280;this.beginScroll(h,now);
        return this.message='Scroll '+(up?'up':'down')+' · ready for another swipe';
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
      if(now<this.warmUntil)return this.message='Getting ready · show one hand';
      if(this.mode?.label&&h.label&&this.mode.label!==h.label){
        const scrolling=scrollPose(this.mode.pose)||scrollPose(h.pose);
        this.cancel();this.blocked=true;this.clearRest();return this.message=scrolling?'Hand changed · start a new swipe':'Hand changed · relax your fingers first';
      }
      // Scrolling needs neither a stillness check nor a return stroke.
      // It never requires the generic lower-your-hand gate.
      if(scrollPose(h.pose)&&!this.mode){this.blocked=false;this.clearRest();}
      if(this.blocked){
        if(h.pose==='rest')this.rest(now);else this.clearRest();
        return this.message=this.blocked?'Relax your fingers before the next gesture':'Ready for your next gesture';
      }
      let m=this.mode;
      if(m&&scrollPose(m.pose)&&scrollPose(h.pose)&&h.pose!==m.pose){this.finish(true);m=null;}
      if(m&&h.pose!==m.pose){
        if(m.exitAt===null){m.exitAt=now;m.exitFrames=0;}
        m.exitFrames++;
        // One noisy frame must not finish a timeline drag or switch its action.
        if(now-m.exitAt>=180&&m.exitFrames>=2){
          const restAt=m.exitAt,restFrames=m.exitFrames;
          this.finish(true);this.blocked=!scrollPose(m.pose)&&!scrollPose(h.pose);this.clearRest();
          if(h.pose==='rest'){this.restAt=restAt;this.restFrames=restFrames;this.rest(now);}
          if(scrollPose(m.pose)||scrollPose(h.pose))return this.message='Gesture changed · start your next swipe';
          return this.message='Finished · relax your fingers';
        }
        return this.message=scrollPose(m.pose)||scrollPose(h.pose)?'Reading your hand shape…':'Relax your fingers to finish';
      }
      if(h.pose==='rest')return this.message='Ready · one/two fingers, thumbs-up or thumbs-down';
      if(!m){
        this.clearRest();
        this.mode={pose:h.pose,id:'g'+(++this.serial),label:h.label,at:now,frames:1,ready:false,started:false,kind:null,
          x:h.x,y:h.y,baseX:h.x,baseY:h.y,lastSent:0,lastValue:null,exitAt:null,exitFrames:0};
        if(scrollPose(h.pose))return this.updateScroll(h,now);
        return this.message=h.pose==='like'?'Thumbs-up · hold to play':h.pose==='dislike'?'Thumbs-down · hold to pause':h.pose==='one'?'One finger · hold briefly, then move':'Two fingers · hold briefly, then move sideways';
      }
      if(m.exitAt!==null&&scrollPose(m.pose))this.beginScroll(h,now);
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
