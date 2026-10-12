(function(root){
  'use strict';
  // ADCTouch on the existing A0 wire: idle ~445, contact >600.
  const TAP_GAP=300,MAX_GROUP=3000,HOLD_TIME=700,STALE_TIME=600;
  class WireEngine{
    constructor(emit,hint=()=>{}){this.emit=emit;this.hint=hint;this.serial=0;this.reset();}
    reset(){this.end(false);this.ready=false;this.quietAt=null;this.touch=false;this.edge=null;this.edgeAt=0;this.lastAt=null;this.count=0;this.burstAt=null;this.releaseAt=null;this.hold=null;this.pressAt=null;this.touchFrames=0;}
    end(commit){if(this.hold){this.emit({action:this.hold.kind+'End',gestureId:this.hold.id,commit});this.hold=null;}}
    finish(){
      const count=this.count;this.count=0;this.burstAt=null;this.releaseAt=null;
      const command=count===1?{action:'toggle'}:count===2?{action:'seek',seconds:-10}:count===3?{action:'seek',seconds:10}:count===4?{action:'shortcuts'}:null;
      if(command){this.hint(count+' tap'+(count===1?'':'s')+' · '+['','play / pause','back 10 seconds','forward 10 seconds','shortcuts'][count]);this.emit(command);}
    }
    finishIfReady(now){
      if(!this.touch&&this.count&&this.edge!==true&&(this.count===4||now-this.releaseAt>=TAP_GAP||now-this.burstAt>=MAX_GROUP))this.finish();
    }
    update(value,now){
      if(!Number.isFinite(value)||value<0||value>1023||!Number.isFinite(now))return;
      // A BLE notification can contain several readings with the same receipt time.
      // Equal timestamps are valid; only a backwards clock or stale stream resets.
      if(this.lastAt!==null&&(now-this.lastAt>STALE_TIME||now<this.lastAt))this.reset();
      this.lastAt=now;
      if(!this.ready){
        if(value<550){this.quietAt??=now;if(now-this.quietAt>=300){this.ready=true;this.hint('Wire ready · tap or hold');}}
        else this.quietAt=null;
        return;
      }
      const next=value>600?true:value<550?false:this.touch;
      if(next!==this.touch){
        if(this.edge!==next){this.edge=next;this.edgeAt=now;this.touchFrames=1;}else this.touchFrames++;
        // Two consecutive sensor readings reject a lone spike without adding a
        // minimum wall-clock press duration or losing a short, batched tap.
        if(this.touchFrames>=2){
          if(next){
            // Count the first contact time, not the later confirmation sample.
            if(this.count&&this.burstAt!==null&&(this.edgeAt-this.burstAt>=MAX_GROUP||this.edgeAt-this.releaseAt>=TAP_GAP))this.finish();
            this.burstAt??=this.edgeAt;this.count++;this.pressAt=this.edgeAt;
            if(this.count>4){this.reset();this.hint('Up to four touches · release to try again');return;}
            this.hint('Touch '+this.count+' · release for a tap, keep holding for '+(['','volume up','volume down','scroll down','scroll up'][this.count]));
          }else{
            if(this.hold){this.end(true);this.count=0;this.burstAt=null;this.hint('Released · ready');}
            else this.hint(this.count===4?'4 taps · opening shortcuts':this.count+' tap'+(this.count===1?'':'s')+' · tap again now, or wait for the action');
            this.releaseAt=this.edgeAt;this.pressAt=null;
          }
          this.touch=next;this.edge=null;
        }
      }else{this.edge=null;this.touchFrames=0;}
      // Holds begin after 0.7s. Every update requires a fresh sensor reading.
      if(this.touch&&this.edge!==false&&now-this.pressAt>=HOLD_TIME&&!this.hold){
        const kind=this.count<=2?'volume':'scroll',direction=[0,1,-1,1,-1][this.count];
        this.hold={kind,direction,id:'w'+(++this.serial),at:now,last:now,delta:0};
        this.emit({action:kind+'Start',gestureId:this.hold.id});
      }
      if(this.hold&&this.edge!==false&&now-this.hold.last>=120){
        const h=this.hold;h.delta=Math.min(1,h.delta+(now-h.last)/(h.kind==='volume'?5000:1800));h.last=now;
        this.emit({action:h.kind+'Move',gestureId:h.id,delta:h.delta*h.direction});
      }
      this.finishIfReady(now);
    }
    tick(now){
      if(this.lastAt!==null&&now-this.lastAt>STALE_TIME){this.reset();this.hint('Waiting for fresh wire readings…');return;}
      this.finishIfReady(now);
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={WireEngine};
  root.SwichWire={WireEngine};
})(typeof self!=='undefined'?self:globalThis);
