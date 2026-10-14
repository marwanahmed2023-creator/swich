(function(root){
  'use strict';
  const OPEN_DELTA=.16,CLOSE_DELTA=.20,OTHER_LIMIT=.28,DOMINANCE=.16;
  const MIN_WINK=120,MAX_WINK=1500,OPEN_CONFIRM=60,MAX_GAP=350;
  const ready='Face ready · your left wink: down · your right wink: up';
  function describeFace(result){
    const compact=Array.isArray(result?.eyeLandmarks);
    if((compact?result.eyeLandmarks.length!==1:result?.faceLandmarks?.length!==1)||result.faceBlendshapes?.length!==1)return null;
    const p=compact?result.eyeLandmarks[0]:result.faceLandmarks[0],scores=result.faceBlendshapes[0].categories;
    if(!Array.isArray(scores))return null;
    // Model labels refer to the person's own eyes. Inference receives the
    // original camera image; only the on-page preview is mirrored.
    const left=scores.find(s=>s.categoryName==='eyeBlinkLeft')?.score;
    const right=scores.find(s=>s.categoryName==='eyeBlinkRight')?.score;
    if(![left,right].every(v=>Number.isFinite(v)&&v>=0&&v<=1))return null;
    const eyes=compact?p:[33,133,263,362].map(i=>p[i]);
    if(eyes.some(v=>!v||![v.x,v.y].every(Number.isFinite)||v.x<.02||v.x>.98||v.y<.02||v.y>.98))return null;
    const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*.75);
    const width=distance(eyes[0],eyes[2]),a=distance(eyes[0],eyes[1]),b=distance(eyes[2],eyes[3]);
    if(width<.06||a<.012||b<.012||a/b<.45||a/b>2.2)return null;
    return {left,right,x:(eyes[0].x+eyes[2].x)/2,y:(eyes[0].y+eyes[2].y)*.375,width};
  }
  class WinkEngine{
    constructor(emit){this.emit=emit;this.reset(true);}
    reset(relearn=false){
      if(relearn||!this.neutral){this.neutral=null;this.samples=[];}
      this.lastTime=null;this.lastFace=null;this.clear();this.message='Look normally at the screen';
    }
    clear(){this.armed=false;this.candidate=null;this.openAt=null;this.openFrames=0;}
    update(face,now){
      const previousTime=this.lastTime,gap=previousTime===null?0:now-previousTime;
      const moved=face&&this.lastFace&&Math.hypot(face.x-this.lastFace.x,face.y-this.lastFace.y)>.12;
      this.lastTime=now;this.lastFace=face;
      if(!face||gap>MAX_GAP||(previousTime!==null&&gap<=0)||moved){
        this.clear();return this.message=!face?'Show one face with both eyes visible':gap>MAX_GAP?'Camera catching up · open both eyes and try again':'Face moved · open both eyes';
      }
      const {left,right}=face;
      if(!this.neutral){
        // Learn each eye's resting score independently. The user's natural
        // eyelid shape must not require wide-open eyes to arm the controller.
        this.samples=this.samples.filter(s=>now-s.at<=1500);
        if(Math.max(left,right)<=.60&&Math.abs(left-right)<=.35)this.samples.push({left,right,at:now});
        if(this.samples.length<5||now-this.samples[0].at<320)return this.message='Learning relaxed eyes · look normally at the screen';
        const middle=key=>{const v=this.samples.map(s=>s[key]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
        this.neutral={left:middle('left'),right:middle('right')};this.samples=[];
      }
      const l=Math.max(0,left-this.neutral.left),r=Math.max(0,right-this.neutral.right);
      const bothOpen=l<=OPEN_DELTA&&r<=OPEN_DELTA;
      if(bothOpen){
        if(this.openAt===null){
          this.openAt=now;this.openFrames=0;
          const c=this.candidate;
          if(c){
            c.duration=now-c.at;
            if(c.frames<2||c.duration<MIN_WINK||c.duration>MAX_WINK)this.candidate=null;
          }
        }
        this.openFrames++;
        if(now-this.openAt>=OPEN_CONFIRM&&this.openFrames>=2){
          const c=this.candidate;this.candidate=null;this.armed=true;
          if(c){this.emit({action:'scroll',direction:c.side==='left'?1:-1});return this.message=c.side==='left'?'Left wink · scroll down':'Right wink · scroll up';}
          // Follow small resting changes slowly, only when no wink is active.
          for(const side of ['left','right'])this.neutral[side]+=(face[side]-this.neutral[side])*.015;
          return this.message=ready;
        }
        return this.message=this.candidate?'Wink read':'Let your eyes return to normal';
      }
      // A second closure during release confirmation cancels the whole wink.
      if(this.candidate&&this.openAt!==null){this.clear();return this.message='Blink ignored · open both eyes';}
      this.openAt=null;this.openFrames=0;
      const c=this.candidate;
      if(c){
        const other=c.side==='left'?r:l,closed=c.side==='left'?l:r;
        // Opposite-eye movement also vetoes staggered/asymmetric blinks.
        const bothClosing=l>=CLOSE_DELTA&&r>=CLOSE_DELTA&&Math.abs(l-r)<DOMINANCE;
        if(other>OTHER_LIMIT||bothClosing||now-c.at>MAX_WINK){this.clear();return this.message='Let your eyes return to normal';}
        if(closed>=CLOSE_DELTA)c.frames++;
        return this.message=(c.side==='left'?'Left':'Right')+' wink · reopen to scroll '+(c.side==='left'?'down':'up');
      }
      if(l>=CLOSE_DELTA&&r>=CLOSE_DELTA&&Math.abs(l-r)<DOMINANCE){this.clear();return this.message='Blink ignored';}
      if(!this.armed)return this.message='Let your eyes return to normal';
      // The other eye may narrow a little during a comfortable wink. It only
      // cancels when it closes substantially, or both eyes close together.
      const side=left>=.40&&l>=CLOSE_DELTA&&r<=OTHER_LIMIT&&l-r>=DOMINANCE?'left':right>=.40&&r>=CLOSE_DELTA&&l<=OTHER_LIMIT&&r-l>=DOMINANCE?'right':null;
      if(side){this.candidate={side,at:now,frames:1};this.armed=false;return this.message=(side==='left'?'Left':'Right')+' wink · reopen to scroll '+(side==='left'?'down':'up');}
      return this.message=ready;
    }
  }
  const api={WinkEngine,describeFace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SwichWinks=api;
})(typeof self!=='undefined'?self:globalThis);
