(function(root){
  'use strict';
  // ADCTouch on the existing A0 wire: idle ~445, contact >600.
  class WireEngine{
    constructor(emit,hint=()=>{}){this.emit=emit;this.hint=hint;this.serial=0;this.reset();}
    reset(){this.end(false);this.ready=false;this.quietAt=null;this.touch=false;this.edge=null;this.edgeAt=0;this.lastAt=null;this.count=0;this.burstAt=null;this.releaseAt=null;this.hold=null;this.pressAt=null;this.touchFrames=0;}
    end(commit){if(this.hold){this.emit({action:this.hold.kind+'End',gestureId:this.hold.id,commit});this.hold=null;}}
    finish(){
      const count=this.count;this.count=0;this.burstAt=null;this.releaseAt=null;
      const command=count===1?{action:'toggle'}:count===2?{action:'seek',seconds:-10}:count===3?{action:'seek',seconds:10}:count===4?{action:'shortcuts'}:null;
      if(command)this.emit(command);
    }
    update(value,now){
      if(!Number.isFinite(value)||value<0||value>1023)return;
      if(this.lastAt!==null&&(now-this.lastAt>600||now<=this.lastAt))this.reset();
      this.lastAt=now;
      if(!this.ready){
        if(value<550){this.quietAt??=now;if(now-this.quietAt>=300){this.ready=true;this.hint('Wire ready · tap or hold');}}
        else this.quietAt=null;
        return;
      }
      const next=value>600?true:value<550?false:this.touch;
      if(next!==this.touch){
        if(this.edge!==next){this.edge=next;this.edgeAt=now;this.touchFrames=1;}else this.touchFrames++;
        if(now-this.edgeAt>=55&&this.touchFrames>=3){
          if(next){
            if(this.count&&this.burstAt!==null&&(now-this.burstAt>=3000||now-this.releaseAt>=800))this.finish();
            this.burstAt??=this.edgeAt;this.count++;this.pressAt=this.edgeAt;
            if(this.count>4){this.reset();this.hint('Up to four touches · release to try again');return;}
            this.hint('Touch '+this.count+' · release for a tap, keep holding for '+(['','volume up','volume down','scroll down','scroll up'][this.count]));
          }else{
            if(this.hold){this.end(true);this.count=0;this.burstAt=null;this.hint('Released · ready');}
            this.releaseAt=this.edgeAt;this.pressAt=null;
          }
          this.touch=next;this.edge=null;
        }
      }else{this.edge=null;this.touchFrames=0;}
      // Holds begin after 0.7s. Every update requires a fresh sensor reading.
      if(this.touch&&this.edge!==false&&now-this.pressAt>=700&&!this.hold){
        const kind=this.count<=2?'volume':'scroll',direction=[0,1,-1,1,-1][this.count];
        this.hold={kind,direction,id:'w'+(++this.serial),at:now,last:now,delta:0};
        this.emit({action:kind+'Start',gestureId:this.hold.id});
      }
      if(this.hold&&this.edge!==false&&now-this.hold.last>=120){
        const h=this.hold;h.delta=Math.min(1,h.delta+(now-h.last)/(h.kind==='volume'?5000:1800));h.last=now;
        this.emit({action:h.kind+'Move',gestureId:h.id,delta:h.delta*h.direction});
      }
      if(!this.touch&&this.count&&this.edge!==true&&(now-this.releaseAt>=800||now-this.burstAt>=3000))this.finish();
    }
    tick(now){if(this.lastAt!==null&&now-this.lastAt>600){this.reset();this.hint('Waiting for fresh wire readings…');}}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={WireEngine};
  root.SwichWire={WireEngine};
})(typeof self!=='undefined'?self:globalThis);
