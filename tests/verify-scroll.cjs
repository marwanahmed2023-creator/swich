'use strict';
const assert=require('assert/strict');
const {GestureEngine,describe}=require('../camera/gesture-engine.js');
function scenario(pose,y=.55){
 const events=[],hints=[],engine=new GestureEngine(c=>events.push(c));let now=-80;
 const frame=(yy=y,extra={},step=80)=>{now+=step;y=yy;hints.push(engine.update([{label:'Right',pose,x:.5,y,...extra}],now));};
 const move=(to,frames)=>{const from=y;for(let i=1;i<=frames;i++)frame(from+(to-from)*i/frames);};
 const hold=(frames=4)=>{for(let i=0;i<frames;i++)frame();};
 const lost=(frames=1)=>{for(let i=0;i<frames;i++){now+=80;hints.push(engine.update([],now));}};
 hold();return {events,hints,engine,frame,move,hold,lost};
}
let t=scenario('flick');t.move(.61,6);assert.deepEqual(t.events,[{action:'scroll',direction:1}],'Short slow finger stroke scrolls down');
t.move(.69,8);t.hold(8);assert.equal(t.events.length,1,'Continuing or holding at the end cannot repeat');
t.move(.55,5);assert.equal(t.events.length,1,'Lifting the same finger back never scrolls up');t.move(.61,6);assert.deepEqual(t.events,[{action:'scroll',direction:1},{action:'scroll',direction:1}]);assert.equal(t.hints.some(h=>/relax|lower/i.test(h)),false,'Repeat scrolling never asks for a relaxed/lowered hand');
t=scenario('palm',.65);t.move(.43,4);assert.deepEqual(t.events,[{action:'scroll',direction:-1}],'Large fast open-hand sweep scrolls up');t.move(.32,2);t.hold(4);assert.equal(t.events.length,1);t.move(.65,6);assert.equal(t.events.length,1,'Moving the palm down to return cannot scroll down');t.move(.43,4);assert.equal(t.events.length,2,'Repeated up sweeps need no rest pose');
for(const [pose,from,to,n,reason] of [
 ['flick',.55,.32,4,'An upward finger swipe cannot scroll up'],
 ['flick',.55,.61,1,'A fast finger flick cannot masquerade as slow down'],
 ['flick',.55,.575,8,'Tiny downward drift is ignored'],
 ['palm',.65,.57,3,'Small upward palm movement is ignored'],
 ['palm',.65,.43,15,'Slow large upward movement is ignored'],
 ['palm',.43,.65,4,'Downward palm movement is only repositioning']
]){t=scenario(pose,from);t.move(to,n);t.hold(6);assert.deepEqual(t.events,[],reason);}
// Coming into view already moving never supplies the distance for a swipe.
for(const pose of ['flick','palm']){
 t=scenario(pose);t.lost();t.move(pose==='flick'?.62:.32,5);assert.deepEqual(t.events,[],'Re-entry motion is ignored');
 t.hold();t.move(pose==='flick'?.68:.10,pose==='flick'?6:4);assert.equal(t.events.length,1,'A fresh intentional stroke works after re-entry settles');
}
t=scenario('palm',.65);t.frame(.43);t.hold();assert.equal(t.events.length,0,'A tracking position jump is not a fast sweep');t.move(.21,4);assert.equal(t.events.length,1,'Tracking jump recovery stays usable');
t=scenario('palm',.65);t.frame(.59);t.frame(.53,{},400);t.hold();assert.equal(t.events.length,0,'Dropped frames cannot complete a fast sweep');
t=scenario('palm',.65);t.frame(.54,{},200);t.frame(.43,{},200);assert.deepEqual(t.events,[{action:'scroll',direction:-1}],'A slower camera can recognize a large sweep across two real motion samples');
t=scenario('flick');t.frame(.56,{pose:'one'});t.frame(.59);t.hold();assert.equal(t.events.length,0,'A brief finger classification error discards interrupted movement');t.move(.65,6);assert.equal(t.events.length,1);
t=scenario('flick');t.frame(.56,{label:'Left'});t.frame(.60,{label:'Left'});t.hold();assert.equal(t.events.length,0,'Switching hands cannot carry a swipe across identities');
t=scenario('flick');t.frame(.57,{x:.62});t.hold();assert.equal(t.events.length,0,'Sideways repositioning is ignored');
// Replacing an already completed playback gesture with a scroll pose needs no rest gesture.
t=scenario('like');t.hold(6);assert.equal(t.events[0].action,'play');for(let i=0;i<4;i++)t.frame(.55,{pose:'flick'});for(let i=1;i<=6;i++)t.frame(.55+.01*i,{pose:'flick'});assert.equal(t.events.at(-1).action,'scroll');
function landmarks(open=true){
 const p=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.9};
 [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07;for(let j=0;j<4;j++)p[base+j]={x,y:(open?[.65,.47,.36,.27]:[.65,.55,.65,.71])[j]};});
 p[2]={x:.34,y:.75};p[3]={x:.3,y:.7};p[4]={x:.28,y:.75};return p;
}
const palm=landmarks(),feature=describe(palm);assert.equal(feature.pose,'palm');assert.equal(describe(palm.map(p=>({x:1-p.x,y:p.y}))).pose,'palm');
const movedTips=palm.map((p,i)=>({x:p.x,y:[7,8,11,12,15,16,19,20].includes(i)?p.y-.05:p.y}));assert.equal(describe(movedTips).y,feature.y,'Opening fingertips farther cannot fake palm travel');
assert.ok(Math.abs(describe(palm.map(p=>({x:p.x,y:p.y-.22}))).y-(feature.y-.165))<1e-10,'Whole-hand translation is measured from palm landmarks');
const finger=landmarks(false);for(let j=0;j<4;j++)finger[5+j]={x:.4-j*.07,y:.65-j*.1};assert.equal(describe(finger).pose,'flick');assert.equal(describe(finger.map(p=>({x:1-p.x,y:p.y}))).pose,'flick');
console.log('PASS: repeat down/up without lowering, inert return strokes, direction/pose/speed/distance separation, re-entry, jitter, frame loss, palm tracking and recovery.');
