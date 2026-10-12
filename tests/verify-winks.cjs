'use strict';
const assert=require('assert/strict');
const {WinkEngine,describeFace}=require('../camera/wink-engine.js');
function result(left=.1,right=.1){
 const points=Array.from({length:478},()=>({x:.5,y:.5}));
 for(const [i,x] of [[33,.35],[133,.42],[263,.65],[362,.58]])points[i]={x,y:.4};
 return {faceLandmarks:[points],faceBlendshapes:[{categories:[{categoryName:'eyeBlinkRight',score:right},{categoryName:'eyeBlinkLeft',score:left}]}]};
}
function setup(dt=80){
 let now=-dt;const events=[],times=[],hints=[],engine=new WinkEngine(c=>{events.push(c);times.push(now);});
 const frame=(left=.1,right=.1,step=dt,extra={})=>{now+=step;hints.push(engine.update(left===null?null:{left,right,x:.5,y:.3,width:.3,...extra},now));};
 const open=(n=3)=>{for(let i=0;i<n;i++)frame();};
 const shut=(side,n=3)=>{for(let i=0;i<n;i++)frame(side==='left'?.85:.1,side==='right'?.85:.1);};
 open();return {events,times,hints,engine,frame,open,shut,now:()=>now};
}
// A short wink on either side emits once, only after reopening. Every tested
// cadence completes in under one second, without a long eye hold.
for(const dt of [33,66,80,120,200])for(const side of ['left','right']){
 const t=setup(dt),start=t.now()+dt,frames=Math.max(2,Math.ceil(180/dt));
 t.shut(side,frames);assert.deepEqual(t.events,[],'No action while shut');
 t.open(Math.ceil(60/dt)+1);assert.deepEqual(t.events,[{action:'scroll',direction:side==='left'?1:-1}]);
 assert.ok(t.times[0]-start<1000,'A quick wink must not need a one-second closure');
 t.open(8);assert.equal(t.events.length,1,'Holding eyes open cannot repeat');
 t.shut(side,frames);t.open(Math.ceil(60/dt)+1);assert.equal(t.events.length,2,'A second comfortable wink repeats scrolling');
}
for(const side of ['left','right']){
 const t=setup();t.shut(side,15);t.open();assert.deepEqual(t.events,[],'A long eye closure never fires on release or repeats');
 t.shut(side,3);t.open();assert.equal(t.events.length,1,'A brief wink works after a long closure');
}
// Simulate bilateral blinks with smooth closing/opening and slight left/right
// timing differences across camera frame rates and sampling phases.
let cases=0;
for(const dt of [33,66,80,120])for(const duration of [180,300,500])for(const offset of [-80,-40,0,40,80])for(const phase of [0,dt/2]){
 const t=setup(dt),blink=(time,start)=>time<start||time>start+duration?.1:.1+.8*Math.sin(Math.PI*(time-start)/duration);
 for(let time=phase;time<duration+400;time+=dt)t.frame(blink(time,100),blink(time,100+offset));
 t.open(4);assert.deepEqual(t.events,[],'Bilateral blink rejected: '+[dt,duration,offset,phase]);cases++;
}
let t=setup();t.frame(.85,.1);t.frame(.85,.85);t.frame(.1,.85);t.open();assert.deepEqual(t.events,[],'A staggered blink cannot become two opposite winks');
t=setup();t.shut('left',3);t.frame();t.frame(.1,.85);t.frame(.1,.85);t.open();assert.deepEqual(t.events,[],'A delayed second-eye closure during release cancels the wink');
t=setup();t.frame(.9,.1);t.open();assert.deepEqual(t.events,[],'A single noisy closed-eye sample is ignored');
t=setup();for(let i=0;i<50;i++)t.frame(.2+.08*Math.sin(i),.2+.08*Math.cos(i));assert.deepEqual(t.events,[],'Open-eye score jitter does not trigger');
t=setup();for(let i=0;i<10;i++)t.frame(.5,.45);t.open();assert.deepEqual(t.events,[],'Squinting both eyes is ignored');
t=setup();t.shut('left',2);t.frame(null);t.open();assert.deepEqual(t.events,[],'Losing the face cancels a pending wink');
t=setup();t.shut('left',2);t.frame(.1,.1,500);t.open();assert.deepEqual(t.events,[],'A dropped camera interval cannot complete an old wink');
t=setup();t.shut('left',2);t.frame(.1,.1,80,{x:.8});t.frame(.1,.1,80,{x:.8});assert.deepEqual(t.events,[],'A face jump cannot finish a wink');
t=setup();t.engine.reset();t.shut('right',3);t.open();assert.deepEqual(t.events,[],'Starting with an eye shut does not issue a command');t.shut('right',3);t.open();assert.equal(t.events.length,1);
t=setup();t.frame(.9,.1);t.frame(.9,.1,0);t.open();assert.deepEqual(t.events,[],'Repeated timestamps cannot invent samples');
const f=describeFace(result(.9,.1));assert.equal(f.left,.9);assert.equal(f.right,.1,'Eye names are anatomical, independent of category ordering');
assert.equal(describeFace({}),null);assert.equal(describeFace({...result(),faceLandmarks:[...result().faceLandmarks,...result().faceLandmarks]}),null,'Multiple faces disable winks');
for(const value of [NaN,Infinity,-1,2])assert.equal(describeFace(result(value,.1)),null);
const partial=result();partial.faceLandmarks[0][33].x=-.1;assert.equal(describeFace(partial),null,'Both eyes must be in view');
const turned=result();turned.faceLandmarks[0][133].x=.36;assert.equal(describeFace(turned),null,'An eye hidden by a strong head turn is rejected');
console.log('PASS: both wink directions below one second, '+cases+' blink timing cases, repeated winks, long holds, noise, tracking loss/gaps, reset, anatomical labels and face quality.');
module.exports={result};
