import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {transformAsync} from '@babel/core';
import preset from '@babel/preset-env';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'android/app/src/main/assets/generated');await fs.mkdir(out,{recursive:true});
let code=await fs.readFile(path.join(root,'android/tools/runtime.js'),'utf8');
for(const file of ['wink-engine.js','gesture-engine.js','wire-engine.js']){
 const original=await fs.readFile(path.join(root,'camera',file),'utf8');
 // Native camera frames can be portrait: preserve the browser engine's physical
 // geometry by supplying the actual height/width, not assuming a 4:3 image.
 code+='\n'+original.replace(/\.375\b/g,'(SWICH_ASPECT/2)').replace(/\.75\b/g,'SWICH_ASPECT');
}
code+='\n'+await fs.readFile(path.join(root,'android/tools/bridge.js'),'utf8');
const compiled=await transformAsync(code,{presets:[[preset,{targets:{ie:'11'},loose:true,modules:false}]],comments:true,sourceType:'script'});
await fs.writeFile(path.join(out,'engines.js'),compiled.code);
const tests=path.join(root,'android/app/src/test/resources/generated');await fs.mkdir(tests,{recursive:true});
const shim=`var console={log:function(){}};var module={exports:{}};
var assert={equal:function(a,b,m){if(a!==b)throw new Error(m||('Expected '+a+' to equal '+b));},deepEqual:function(a,b,m){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(m||('Values differ: '+JSON.stringify(a)+' / '+JSON.stringify(b)));},ok:function(v,m){if(!v)throw new Error(m||'Assertion failed');}};
var require=function(name){if(name==='assert/strict')return assert;if(name.indexOf('wink-engine')>=0)return SwichWinks;if(name.indexOf('gesture-engine')>=0)return SwichGestures;throw new Error('Unexpected test import '+name);};`;
for(const name of ['verify-winks','verify-scroll']){
 const testSource=shim+'\n'+await fs.readFile(path.join(root,'tests',name+'.cjs'),'utf8');
 const test=await transformAsync(testSource,{presets:[[preset,{targets:{ie:'11'},loose:true,modules:false}]],sourceType:'script'});
 await fs.writeFile(path.join(tests,name+'.js'),test.code);
}
if(!process.argv.includes('--scripts-only')){
 const models={face_landmarker:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',hand_landmarker:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'};
 const manifest={};
 for(const [name,url] of Object.entries(models)){
  const response=await fetch(url);if(!response.ok)throw new Error('Model download failed: '+response.status);
  const data=Buffer.from(await response.arrayBuffer());if(data.length<1000000)throw new Error('Incomplete model: '+name);
  await fs.writeFile(path.join(out,name+'.task'),data);manifest[name]={url,sha256:createHash('sha256').update(data).digest('hex')};
 }
 await fs.writeFile(path.join(out,'models.json'),JSON.stringify(manifest,null,2));
}
console.log('Prepared Android gesture engines and model assets');
