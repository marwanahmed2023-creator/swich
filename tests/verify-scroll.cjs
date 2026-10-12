'use strict';
const assert=require('assert/strict');
const {GestureEngine,describe}=require('../camera/gesture-engine.js');
function scenario(pose='flick',dt=80){
 const events=[],times=[],hints=[];let now=-dt;
 const engine=new GestureEngine(c=>{events.push(c);times.push(now);});
 const frame=(extra={},step=dt)=>{now+=step;hints.push(engine.update(extra===null?[]:[{label:'Right',pose,x:.5,y:.6,flickAngle:0,...extra}],now));};
 const flick=()=>[0,15,30,45].forEach(flickAngle=>frame({flickAngle,y:.6+Math.sin(flickAngle*Math.PI/180)*.08}));
 const up=()=>[.60,.57,.54,.51].forEach(y=>frame({y}));
 return {events,times,hints,engine,frame,flick,up};
}
let t=scenario();t.flick();assert.deepEqual(t.events,[{action:'scroll',direction:1}]);assert.ok(t.times[0]<=240,'A fast flick must respond within the motion');
for(let i=0;i<10;i++)t.frame({flickAngle:45});assert.equal(t.events.length,1,'Holding the end angle cannot repeat');
for(const flickAngle of [30,15,0])t.frame({flickAngle});assert.equal(t.events.length,1,'Returning to horizontal never scrolls');
t.flick();assert.equal(t.events.length,2,'A second quick flick works without lowering the hand');
assert.equal(t.hints.some(h=>/steady|reposition|relax|lower|return/i.test(h)),false);
t=scenario('palm');t.up();assert.deepEqual(t.events,[{action:'scroll',direction:-1}],'A small comfortable up swipe is enough');
for(const y of [.54,.57,.60,.60])t.frame({y});assert.equal(t.events.length,1,'Returning the hand down never scrolls');
t.up();assert.equal(t.events.length,2,'An immediate repeated swipe needs no stillness');
for(const angles of [[45,30,15,0],[0,-15,-30,-45],[30,35,40,45]]){
 t=scenario();angles.forEach(flickAngle=>t.frame({flickAngle}));assert.deepEqual(t.events,[],'Only horizontal to down is a flick');
}
t=scenario();for(let angle=0;angle<=45;angle+=2)t.frame({flickAngle:angle});assert.deepEqual(t.events,[],'Slow rotation is not a quick flick');
t=scenario();for(const y of [.5,.54,.58,.62])t.frame({y,flickAngle:0});assert.deepEqual(t.events,[],'Translating a horizontal finger cannot fire');
t=scenario('palm');for(const y of [.5,.53,.56,.59])t.frame({y});assert.deepEqual(t.events,[],'A fingers-together downward movement cannot scroll down');
t=scenario('palm');for(let i=0;i<15;i++)t.frame({y:.6-i*.004});assert.deepEqual(t.events,[],'A slow drift cannot scroll');
// Shake alone stays below both thresholds; a gesture through shake still fires.
for(const pose of ['flick','palm'])for(const dt of [66,80,120])for(const phase of [0,.7,1.4,2.1]){
 t=scenario(pose,dt);let i=0;
 const sample=(y=.6,angle=0)=>{t.frame({x:.5+.012*Math.sin(i*1.9+phase),y:y+.014*Math.sin(i*2.2+phase),flickAngle:angle+6*Math.sin(i*1.7+phase)});i++;};
 for(let j=0;j<32;j++)sample();assert.deepEqual(t.events,[],'Continuous shake must not fire');
 for(let j=0;j<=3;j++)sample(pose==='palm'?.6-j*.035:.6,j*15);
 assert.equal(t.events.length,1,'Intentional gesture through shake: '+[pose,dt,phase]);
 assert.equal(t.events[0].direction,pose==='palm'?-1:1);
}
// Loss, wrong identity and gaps discard prior movement, without a return gate.
t=scenario();t.frame();t.frame({flickAngle:15});t.frame(null);t.frame({flickAngle:45});t.frame({flickAngle:45});assert.deepEqual(t.events,[]);t.flick();assert.equal(t.events.length,1);
t=scenario();t.frame();t.frame({flickAngle:15});t.frame({flickAngle:45},400);t.frame({flickAngle:45});assert.deepEqual(t.events,[]);
t=scenario();t.frame();t.frame({flickAngle:15,label:'Left'});t.frame({flickAngle:45,label:'Left'});t.frame({flickAngle:45,label:'Left'});assert.deepEqual(t.events,[]);
t=scenario('palm');t.frame();t.frame({y:.4});t.frame({y:.4});assert.deepEqual(t.events,[],'A tracker jump cannot supply motion');
t=scenario('palm',200);t.frame();t.frame({y:.56});t.frame({y:.52});assert.equal(t.events.length,1,'Two motion samples work on a slower camera');
t=scenario();t.flick();t.frame({pose:'palm',y:.6});t.frame({pose:'palm',y:.56});t.frame({pose:'palm',y:.52});assert.equal(t.events.length,1,'Changing pose cannot bypass duplicate suppression');
for(const y of [.52,.48,.44])t.frame({pose:'palm',y});assert.equal(t.events.at(-1).direction,-1,'Switching to up needs no extra pose hold');
assert.ok(t.times.slice(1).every((time,i)=>time-t.times[i]>=280));
function landmarks(raised=[0,1,2,3],angle=null){
 const p=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.9};
 [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07,up=raised.includes(i),tipX=.47+i*.02;
  for(let j=0;j<4;j++)p[base+j]={x:up?x+(tipX-x)*j/3:x,y:(up?[.65,.47,.36,.27]:[.65,.55,.65,.71])[j]};
 });
 if(angle!==null)for(let j=0;j<4;j++)p[5+j]={x:.4-j*.075*Math.cos(angle*Math.PI/180),y:.65+j*.075*Math.sin(angle*Math.PI/180)/.75};
 p[2]={x:.34,y:.75};p[3]={x:.3,y:.7};p[4]={x:.28,y:.75};return p;
}
// Exercise real landmark classification through the whole gesture, both hands.
for(const mirror of [false,true]){
 const events=[],engine=new GestureEngine(c=>events.push(c));
 [0,15,30,45].forEach((angle,i)=>{
  const p=landmarks([0],angle).map(p=>({x:mirror?1-p.x:p.x,y:p.y})),h=describe(p);
  assert.equal(h.pose,'flick');assert.ok(Math.abs(h.flickAngle-angle)<1e-8);engine.update([h],i*80);
 });
 assert.deepEqual(events,[{action:'scroll',direction:1}],'Horizontal-to-down landmarks work with either hand');
 for(const raised of [[0,1,2,3],[0,1,2]]){
  const events=[],engine=new GestureEngine(c=>events.push(c));
  for(let i=0;i<4;i++){
   const h=describe(landmarks(raised).map(p=>({x:mirror?1-p.x:p.x,y:p.y-i*.04})));
   assert.equal(h.pose,'palm');engine.update([h],i*80);
  }
  assert.deepEqual(events,[{action:'scroll',direction:-1}],'Together fingers work with a partly hidden little finger');
 }
}
const palm=landmarks(),feature=describe(palm);
const tips=palm.map((p,i)=>({x:p.x,y:[7,8,11,12,15,16,19,20].includes(i)?p.y-.05:p.y}));
assert.equal(describe(tips).y,feature.y,'Opening fingertips cannot fake palm travel');
console.log('PASS: fast angle flicks, small fingers-together swipes, repeated motion, 24 shake cases, cooldown, loss/gaps, both-hand landmarks and partial finger occlusion.');
