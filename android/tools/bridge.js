var output=function(command){emitNative(JSON.stringify(command));};
var winkEngine=new SwichWinks.WinkEngine(output);
var handEngine=new SwichGestures.GestureEngine(output);
var wireEngine=new SwichWire.WireEngine(function(command,trigger){command.trigger=trigger;output(command);},function(hint){
 if(hint.indexOf('Touch ')===0)hint=hint.split(' · ')[0]+' · release for a tap, keep holding for a hold';
 else if(hint.indexOf('tap')>=0&&hint.indexOf(' · ')>=0)hint=hint.split(' · ')[0]+' · input read';
 hintNative(hint);
});
function wireSample(value,now){wireEngine.update(value,now);}
function wireTick(now){wireEngine.tick(now);}
function wireReset(){wireEngine.reset();}
function calibrate(){winkEngine.reset(true);}
function cameraReset(now){winkEngine.reset();handEngine.reset(now);}
function frame(json,now){
 var data=JSON.parse(json);SWICH_ASPECT=data.aspect;
 var hint=winkEngine.update(SwichWinks.describeFace(data),now);
 if(data.hands!==null){var hands=data.hands.map(function(h){return SwichGestures.describe(h.points,h.label);}).filter(Boolean);handEngine.update(hands,now);}
 hintNative(hint);
 return winkEngine.candidate!==null;
}
