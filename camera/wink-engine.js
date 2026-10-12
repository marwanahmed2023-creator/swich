(function(root){
  'use strict';
  const OPEN=.30,CLOSED=.60,MIN_WINK=120,MAX_WINK=800,OPEN_CONFIRM=60,MAX_GAP=250;
  const ready='Face ready · your left wink: down · your right wink: up';
  function describeFace(result){
    if(result?.faceLandmarks?.length!==1||result.faceBlendshapes?.length!==1)return null;
    const p=result.faceLandmarks[0],scores=result.faceBlendshapes[0].categories;
    if(!Array.isArray(scores))return null;
    // Model labels refer to the person's own eyes. Inference receives the
    // original camera image; only the on-page preview is mirrored.
    const left=scores.find(s=>s.categoryName==='eyeBlinkLeft')?.score;
    const right=scores.find(s=>s.categoryName==='eyeBlinkRight')?.score;
    if(![left,right].every(v=>Number.isFinite(v)&&v>=0&&v<=1))return null;
    const eyes=[33,133,263,362].map(i=>p[i]);
    if(eyes.some(v=>!v||![v.x,v.y].every(Number.isFinite)||v.x<.02||v.x>.98||v.y<.02||v.y>.98))return null;
    const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*.75);
    const width=distance(eyes[0],eyes[2]),a=distance(eyes[0],eyes[1]),b=distance(eyes[2],eyes[3]);
    if(width<.06||a<.012||b<.012||a/b<.45||a/b>2.2)return null;
    return {left,right,x:(eyes[0].x+eyes[2].x)/2,y:(eyes[0].y+eyes[2].y)*.375,width};
  }
  class WinkEngine{
    constructor(emit){this.emit=emit;this.reset();}
    reset(){this.lastTime=null;this.lastFace=null;this.clear();this.message='Look toward the camera with both eyes open';}
    clear(){this.armed=false;this.candidate=null;this.openAt=null;this.openFrames=0;}
    update(face,now){
      const previousTime=this.lastTime,gap=previousTime===null?0:now-previousTime;
      const moved=face&&this.lastFace&&Math.hypot(face.x-this.lastFace.x,face.y-this.lastFace.y)>.12;
      this.lastTime=now;this.lastFace=face;
      if(!face||gap>MAX_GAP||(previousTime!==null&&gap<=0)||moved){
        this.clear();return this.message=!face?'Show one face with both eyes visible':gap>MAX_GAP?'Camera catching up · open both eyes and try again':'Face moved · open both eyes';
      }
      const {left,right}=face,bothOpen=left<=OPEN&&right<=OPEN;
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
          return this.message=ready;
        }
        return this.message=this.candidate?'Wink read · checking both eyes are open':'Open both eyes briefly';
      }
      // A second closure during release confirmation cancels the whole wink.
      if(this.candidate&&this.openAt!==null){this.clear();return this.message='Blink ignored · open both eyes';}
      this.openAt=null;this.openFrames=0;
      const c=this.candidate;
      if(c){
        const other=c.side==='left'?right:left,closed=c.side==='left'?left:right;
        // Opposite-eye movement also vetoes staggered/asymmetric blinks.
        if(other>OPEN||now-c.at>MAX_WINK){this.clear();return this.message='Open both eyes · use a brief wink';}
        if(closed>=CLOSED)c.frames++;
        return this.message=(c.side==='left'?'Left':'Right')+' wink · reopen to scroll '+(c.side==='left'?'down':'up');
      }
      if(left>OPEN&&right>OPEN){this.clear();return this.message='Blink ignored · open both eyes';}
      if(!this.armed)return this.message='Open both eyes before the next wink';
      const side=left>=CLOSED&&right<=OPEN&&left-right>=.35?'left':right>=CLOSED&&left<=OPEN&&right-left>=.35?'right':null;
      if(side){this.candidate={side,at:now,frames:1};this.armed=false;return this.message=(side==='left'?'Left':'Right')+' wink · reopen to scroll '+(side==='left'?'down':'up');}
      return this.message=ready;
    }
  }
  const api={WinkEngine,describeFace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SwichWinks=api;
})(typeof self!=='undefined'?self:globalThis);
