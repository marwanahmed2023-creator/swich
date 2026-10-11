'use strict';
importScripts('gesture-engine.js?v=2');
const VERSION='0.10.35';
const CDN='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/';
const MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let model=null,reader=null,processingTrack=null,stopped=false,enabled=false,busy=false,lastFrame=-1,lastPreview=0,session=0;
const engine=new SwichGestures.GestureEngine(command=>{if(enabled)postMessage({type:'command',command,session});});
async function init(){
  // A classic worker supports the WASM loader's importScripts, while the
  // vision library itself is loaded as an ES module.
  const {FilesetResolver,HandLandmarker}=await import(CDN+'vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(CDN+'wasm');
  model=await HandLandmarker.createFromOptions(files,{
    canvas:new OffscreenCanvas(640,480),baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65
  });
  postMessage({type:'ready',trackProcessor:typeof MediaStreamTrackProcessor!=='undefined'});
}
async function processFrame(frame){
  let bitmap;
  try{
    const now=performance.now();
    if(now-lastFrame<65)return;
    lastFrame=now;
    bitmap=await createImageBitmap(frame);
    const result=model.detectForVideo(bitmap,now);
    const hands=(result.landmarks||[]).map((points,i)=>SwichGestures.describe(points,result.handedness?.[i]?.[0]?.categoryName||'')).filter(Boolean);
    const hint=enabled?engine.update(hands,now):'Gestures paused';
    // Preview is small and throttled; inference keeps consuming frames
    // in the worker even when the controller tab is in the background.
    if(now-lastPreview>120){postMessage({type:'tracking',landmarks:result.landmarks||[],hint,hands:hands.length});lastPreview=now;}
  }finally{bitmap?.close();frame.close?.();}
}
async function consume(stream){
  reader=stream.getReader();
  try{
    while(!stopped){const item=await reader.read();if(item.done)break;await processFrame(item.value);}
    if(!stopped)postMessage({type:'ended'});
  }catch(error){if(!stopped)postMessage({type:'error',message:'Camera processing stopped: '+error.message});}
  finally{try{reader.releaseLock();}catch{}reader=null;}
}
self.onmessage=async event=>{
  const data=event.data;
  try{
    if(data.type==='init'){await init();return;}
    if(data.type==='enabled'){engine.reset(performance.now());session=data.session;enabled=data.enabled===true;return;}
    if(data.type==='stream'){consume(data.stream);return;}
    if(data.type==='track'){
      processingTrack=data.track;
      const processor=new MediaStreamTrackProcessor({track:processingTrack,maxBufferSize:1});consume(processor.readable);return;
    }
    if(data.type==='frame'){
      if(busy||stopped){data.frame.close();return;}
      busy=true;try{await processFrame(data.frame);}finally{busy=false;postMessage({type:'frameDone'});}return;
    }
    if(data.type==='stop'){
      engine.cancel();enabled=false;stopped=true;processingTrack?.stop();
      try{await reader?.cancel();}catch{}
      model?.close();postMessage({type:'stopped'});close();
    }
  }catch(error){postMessage({type:'error',message:error.message});}
};
