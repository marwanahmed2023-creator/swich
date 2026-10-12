'use strict';
importScripts('gesture-engine.js?v=11','wink-engine.js?v=11');
const VERSION='0.10.35';
const CDN='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/';
const MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let model=null,faceModel=null,reader=null,processingTrack=null,stopped=false,enabled=false,busy=false,lastFrame=-1,lastPreview=0,lastScroll=-Infinity,session=0;
function emit(command){
  if(!enabled)return;
  if(command.action==='scroll'){
    const now=performance.now();if(now-lastScroll<280)return;lastScroll=now;
  }
  postMessage({type:'command',command,session});
}
const engine=new SwichGestures.GestureEngine(emit),winks=new SwichWinks.WinkEngine(emit);
function closeModels(){model?.close();model=null;faceModel?.close();faceModel=null;}
async function init(){
  // A classic worker supports the WASM loader's importScripts, while the
  // vision library itself is loaded as an ES module.
  const {FilesetResolver,HandLandmarker,FaceLandmarker}=await import(CDN+'vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(CDN+'wasm');
  faceModel=await FaceLandmarker.createFromOptions(files,{
    canvas:new OffscreenCanvas(640,480),baseOptions:{modelAssetPath:FACE_MODEL,delegate:'CPU'},
    runningMode:'VIDEO',numFaces:2,outputFaceBlendshapes:true,
    minFaceDetectionConfidence:.65,minFacePresenceConfidence:.65,minTrackingConfidence:.65
  });
  if(stopped){closeModels();return;}
  model=await HandLandmarker.createFromOptions(files,{
    canvas:new OffscreenCanvas(640,480),baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65
  });
  if(stopped){closeModels();return;}
  postMessage({type:'ready',trackProcessor:typeof MediaStreamTrackProcessor!=='undefined'});
}
async function processFrame(frame){
  let bitmap;
  try{
    const now=performance.now();
    if(now-lastFrame<65)return;
    lastFrame=now;
    bitmap=await createImageBitmap(frame);
    const faceResult=faceModel.detectForVideo(bitmap,now);
    const face=SwichWinks.describeFace(faceResult);
    const winkHint=enabled?winks.update(face,now):'Gestures paused';
    const result=model.detectForVideo(bitmap,now);
    const hands=(result.landmarks||[]).map((points,i)=>SwichGestures.describe(points,result.handedness?.[i]?.[0]?.categoryName||'')).filter(Boolean);
    const handHint=enabled?engine.update(hands,now):'Gestures paused';
    const hint=hands.length?handHint:'Hands optional · wink to scroll';
    // Preview is small and throttled; inference keeps consuming frames
    // in the worker even when the controller tab is in the background.
    if(now-lastPreview>120){postMessage({type:'tracking',landmarks:result.landmarks||[],hint,winkHint,faceReady:Boolean(face),hands:hands.length});lastPreview=now;}
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
    if(data.type==='enabled'){engine.reset(performance.now());winks.reset();lastScroll=-Infinity;session=data.session;enabled=data.enabled===true;return;}
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
      engine.cancel();winks.reset();enabled=false;stopped=true;processingTrack?.stop();
      try{await reader?.cancel();}catch{}
      closeModels();postMessage({type:'stopped'});close();
    }
  }catch(error){postMessage({type:'error',message:error.message});}
};
