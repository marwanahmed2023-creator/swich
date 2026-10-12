'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
function face(left=.1,right=.1){
 const p=Array.from({length:478},()=>({x:.5,y:.5}));
 for(const [i,x] of [[33,.35],[133,.42],[263,.65],[362,.58]])p[i]={x,y:.4};
 return {faceLandmarks:[p],faceBlendshapes:[{categories:[{categoryName:'eyeBlinkLeft',score:left},{categoryName:'eyeBlinkRight',score:right}]}]};
}
async function test(){
 let now=0,closedFrames=0,closedBitmaps=0,faceClosed=0,handClosed=0,handRuns=0,faceRuns=0,workerClosed=false;
 const messages=[],config={},rawFrames=[],context=vm.createContext({console,performance:{now:()=>now},
  OffscreenCanvas:class{},MediaStreamTrackProcessor:class{},
  postMessage:m=>messages.push(m),close:()=>{workerClosed=true;},
  createImageBitmap:async(...args)=>{assert.equal(args.length,1,'Inference input must not be mirrored');const [frame]=args;rawFrames.push(frame);return {...frame,close(){closedBitmaps++;}};}
 });
 context.self=context;
 context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,'camera',file.split('?')[0]),'utf8'),context));
 const vision=new vm.SyntheticModule(['FilesetResolver','HandLandmarker','FaceLandmarker'],function(){
  this.setExport('FilesetResolver',{forVisionTasks:async url=>({url})});
  this.setExport('FaceLandmarker',{createFromOptions:async(files,options)=>{config.face=options;return {detectForVideo:(image,time)=>{assert.equal(time,now);faceRuns++;return image.face;},close(){faceClosed++;}};}});
  this.setExport('HandLandmarker',{createFromOptions:async(files,options)=>{config.hand=options;return {detectForVideo:()=>{handRuns++;return {landmarks:[]};},close(){handClosed++;}};}});
 },{context});
 await vision.link(()=>{});await vision.evaluate();
 vm.runInContext(fs.readFileSync(path.join(root,'camera/tracker-worker.js'),'utf8'),context,{importModuleDynamically:async url=>{assert.match(url,/@mediapipe\/tasks-vision@0\.10\.35/);return vision;}});
 const send=data=>context.self.onmessage({data});
 await send({type:'init'});assert.equal(messages.at(-1).type,'ready');assert.equal(config.face.outputFaceBlendshapes,true);assert.equal(config.face.numFaces,2);
 assert.equal(config.face.runningMode,'VIDEO');assert.match(config.face.baseOptions.modelAssetPath,/face_landmarker.*float16\/1/);
 await send({type:'enabled',enabled:true,session:11});
 const frame=async(left=.1,right=.1,step=80)=>{now+=step;await send({type:'frame',frame:{face:face(left,right),close(){closedFrames++;}}});};
 const open=async()=>{await frame();await frame();await frame();};
 const wink=async side=>{for(let i=0;i<3;i++)await frame(side==='left'?.85:.1,side==='right'?.85:.1);await open();};
 for(let i=0;i<10;i++)await frame();await wink('left');await wink('right');
 let commands=messages.filter(m=>m.type==='command');assert.deepEqual(commands.map(m=>m.command.direction),[1,-1]);assert.ok(commands.every(m=>m.session===11&&m.command.action==='scroll'));
 for(let i=0;i<3;i++)await frame(.85,.85);await open();assert.equal(messages.filter(m=>m.type==='command').length,2,'Blinks cannot reach the controller');
 await frame(.85,.1);await frame(.85,.1);
 await send({type:'enabled',enabled:false,session:12});for(let i=0;i<10;i++)await frame();await wink('left');
 assert.equal(messages.filter(m=>m.type==='command').length,2,'Disabled tracking never sends a late wink');
 await send({type:'enabled',enabled:true,session:13});await open();await wink('right');
 commands=messages.filter(m=>m.type==='command');assert.equal(commands.length,3);assert.equal(commands.at(-1).session,13);
 assert.ok(messages.some(m=>m.type==='tracking'&&m.faceReady&&m.winkHint.includes('Face ready')),'The preview reports face readiness without a hand');
 assert.equal(closedFrames,rawFrames.length);assert.equal(closedBitmaps,rawFrames.length,'All processed camera frames and bitmaps are released');
 assert.ok(handRuns<faceRuns/3,'Face-only use avoids most hand inference calls');
 await send({type:'stop'});assert.equal(faceClosed,1);assert.equal(handClosed,1);assert.equal(workerClosed,true);assert.equal(messages.at(-1).type,'stopped');
 console.log('PASS: actual tracker worker with simulated models: face configuration, unmirrored input, wink scroll messages, blink rejection, enable/reset sessions, status and resource cleanup.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
