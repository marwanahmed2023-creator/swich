'use strict';
const assert=require('assert/strict');
const {GestureEngine,describe}=require('../camera/gesture-engine.js');
function scenario(pose,y=.55){
 const events=[],times=[],hints=[],engine=new GestureEngine(c=>{events.push(c);times.push(now);});let now=-80;
 const frame=(yy=y,extra={},step=80)=>{now+=step;y=yy;hints.push(engine.update([{label:'Right',pose,x:.5,y,...extra}],now));};
 const move=(to,frames)=>{const from=y;for(let i=1;i<=frames;i++)frame(from+(to-from)*i/frames);};
 const hold=(frames=4)=>{for(let i=0;i<frames;i++)frame();};
 const lost=(frames=1)=>{for(let i=0;i<frames;i++){now+=80;hints.push(engine.update([],now));}};
 frame();return {events,times,hints,engine,frame,move,hold,lost};
}
let t=scenario('flick');t.move(.61,6);assert.deepEqual(t.events,[{action:'scroll',direction:1}],'Down stroke starts immediately without first holding still');
t.hold(8);assert.equal(t.events.length,1,'Holding a pose cannot repeat');t.move(.67,6);assert.equal(t.events.length,2,'Another downward stroke works without a return movement');
assert.equal(t.hints.some(h=>/steady|reposition|relax|lower|return/i.test(h)),false,'Scroll feedback does not request stillness or repositioning');
t=scenario('palm',.65);t.move(.43,4);assert.deepEqual(t.events,[{action:'scroll',direction:-1}],'Large fast up sweep starts without a stillness timer');t.hold(8);t.move(.21,4);assert.equal(t.events.length,2,'Another up sweep needs no return gate');
t=scenario('flick');t.move(.61,6);t.move(.55,5);assert.equal(t.events.length,1,'An upward finger movement never scrolls up');t.move(.61,6);assert.equal(t.events.length,2,'Normal repeated down strokes still work');
t=scenario('palm',.65);t.move(.43,4);t.move(.65,6);assert.equal(t.events.length,1,'Downward palm movement never scrolls down');t.move(.43,4);assert.equal(t.events.length,2);
for(const [pose,from,to,n,reason] of [
 ['flick',.55,.32,4,'An upward finger swipe cannot scroll up'],
 ['flick',.55,.61,1,'A fast finger flick cannot masquerade as slow down'],
 ['flick',.55,.575,8,'Tiny downward drift is ignored'],
 ['palm',.65,.57,3,'Small upward palm movement is ignored'],
 ['palm',.65,.43,15,'Slow large upward movement is ignored'],
 ['palm',.43,.65,4,'Downward palm movement has no assigned action']
]){t=scenario(pose,from);t.move(to,n);t.hold(6);assert.deepEqual(t.events,[],reason);}
// Continuous shake was resetting the old stillness timer. Vary its phase and
// the frame rate, then add a swipe without ever making the hand stationary.
for(const pose of ['flick','palm'])for(const dt of [66,80,120])for(const phase of [0,.7,1.4,2.1]){
 const events=[],e=new GestureEngine(c=>events.push(c));let i=0,now=0;
 const sample=base=>{e.update([{label:'Right',pose,x:.5+.012*Math.sin(i*1.9+phase),y:base+.014*Math.sin(i*2.2+phase)}],now);i++;now+=dt;};
 for(let j=0;j<32;j++)sample(.6);
 assert.deepEqual(events,[],'Natural shake alone must not scroll');
 const frames=pose==='flick'?8:Math.max(3,Math.round(360/dt));
 for(let j=1;j<=frames;j++)sample(.6+(pose==='flick'?.065:-.24)*j/frames);
 assert.equal(events.length,1,'A swipe through continuous shake should register: '+[pose,dt,phase]);
 assert.equal(events[0].direction,pose==='flick'?1:-1);
}
// Cooldown prevents rapid duplicates and expires automatically even in motion.
t=scenario('flick');for(let i=1;i<=40;i++)t.frame(.55+.007*i);assert.ok(t.events.length>1);assert.ok(t.times.slice(1).every((n,i)=>n-t.times[i]>=450),'Scrolling is rate limited without a reposition gate');
// Re-entry starts at the first fresh point. No distance comes from a missing hand.
for(const pose of ['flick','palm']){
 t=scenario(pose);t.lost();t.frame(pose==='flick'?.55:.65);assert.equal(t.events.length,0);
 t.move(pose==='flick'?.61:.43,pose==='flick'?6:4);assert.equal(t.events.length,1,'A fresh stroke after re-entry needs no stillness');
}
t=scenario('palm',.65);t.frame(.43);assert.equal(t.events.length,0,'One tracking jump cannot supply a swipe');t.move(.21,4);assert.equal(t.events.length,1,'Tracking continues immediately after a jump');
t=scenario('palm',.65);t.frame(.59);t.frame(.53,{},400);t.hold();assert.equal(t.events.length,0,'Missing frames cannot supply swipe distance');
t=scenario('palm',.65);t.frame(.54,{},200);t.frame(.43,{},200);assert.deepEqual(t.events,[{action:'scroll',direction:-1}],'A slower camera can recognize two real motion samples');
t=scenario('flick');t.frame(.56,{pose:'one'});t.frame(.59);t.hold();assert.equal(t.events.length,0,'A pose error discards interrupted movement');t.move(.65,6);assert.equal(t.events.length,1);
t=scenario('flick');t.frame(.56,{label:'Left'});t.frame(.60,{label:'Left'});t.hold();assert.equal(t.events.length,0,'Switching hands cannot carry a swipe across identities');
t=scenario('flick');t.frame(.57,{x:.62});t.hold();assert.equal(t.events.length,0,'Sideways travel is not a downward swipe');
t=scenario('like');t.hold(9);assert.equal(t.events[0].action,'play');t.frame(.55,{pose:'flick'});for(let i=1;i<=6;i++)t.frame(.55+.01*i,{pose:'flick'});assert.equal(t.events.at(-1).action,'scroll','No rest pose needed after a completed playback gesture');
function landmarks(open=true){
 const p=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.9};
 [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07;for(let j=0;j<4;j++)p[base+j]={x,y:(open?[.65,.47,.36,.27]:[.65,.55,.65,.71])[j]};});
 p[2]={x:.34,y:.75};p[3]={x:.3,y:.7};p[4]={x:.28,y:.75};return p;
}
const palm=landmarks(),feature=describe(palm);assert.equal(feature.pose,'palm');assert.equal(describe(palm.map(p=>({x:1-p.x,y:p.y}))).pose,'palm');
const movedTips=palm.map((p,i)=>({x:p.x,y:[7,8,11,12,15,16,19,20].includes(i)?p.y-.05:p.y}));assert.equal(describe(movedTips).y,feature.y,'Opening fingertips farther cannot fake palm travel');
assert.ok(Math.abs(describe(palm.map(p=>({x:p.x,y:p.y-.22}))).y-(feature.y-.165))<1e-10,'Whole-hand translation is measured from palm landmarks');
const finger=landmarks(false);for(let j=0;j<4;j++)finger[5+j]={x:.4-j*.07,y:.65-j*.1};assert.equal(describe(finger).pose,'flick');assert.equal(describe(finger.map(p=>({x:1-p.x,y:p.y}))).pose,'flick');
console.log('PASS: immediate scrolling, 24 continuous-shake scenarios, automatic cooldown, no stillness/return gate, separate directions, tracking recovery and palm landmarks.');
