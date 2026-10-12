'use strict';
const ORIGIN='https://marwanahmed2023-creator.github.io';
const PATHS=new Set(['/swich/','/swich/index.html','/swich/index.htm','/swich/gestures.html','/swich/camera.html']);
const VERSION='1.4.0',mediaQueues=new Map(),locks=new Map(),lastTargets=new Map();
const WEB=['http://*/*','https://*/*'];
function controller(url){try{const u=new URL(url);return u.origin===ORIGIN&&PATHS.has(u.pathname);}catch{return false;}}
function web(url){try{return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}}
function allowedSender(s){return s.id===chrome.runtime.id&&s.frameId===0&&Number.isInteger(s.tab?.id)&&controller(s.url);}
function destination(value){
 if(typeof value!=='string'||value.length>8192)throw Error('Invalid link.');
 const u=new URL(value);if(!web(u.href)||!u.hostname||u.username||u.password)throw Error('Use a normal website link.');return u.href;
}
function fresh(at){if(Date.now()>=at)throw Error('That request expired. Try a new gesture.');}
function within(promise,at){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('The page did not respond. Open it and try again.')),Math.max(1,at-Date.now()));Promise.resolve(promise).then(x=>{clearTimeout(timer);resolve(x);},e=>{clearTimeout(timer);reject(e);});});}
async function remember(tab){
 if(!tab||!Number.isInteger(tab.id)||!web(tab.url)||controller(tab.url))return;
 const key=String(Boolean(tab.incognito));lastTargets.set(key,tab.id);
 await chrome.storage.session.set({['lastTarget:'+key]:tab.id});
}
chrome.tabs.onActivated?.addListener(info=>chrome.tabs.get(info.tabId).then(remember).catch(()=>{}));
chrome.tabs.onUpdated?.addListener((id,change,tab)=>{if(tab.active&&(change.url||change.status==='complete'))remember(tab).catch(()=>{});});
chrome.windows.onFocusChanged?.addListener(id=>{if(id>=0)chrome.tabs.query({active:true,windowId:id}).then(t=>remember(t[0])).catch(()=>{});});
async function activeTarget(sender){
 const [active]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
 if(!active||Boolean(active.incognito)!==Boolean(sender.tab.incognito))throw Error('Open a webpage in the same browsing mode as your controller.');
 if(!controller(active.url)){
  if(!web(active.url))throw Error('Open a webpage, or open local media in the Swich file player.');
  await remember(active);return active;
 }
 const key=String(Boolean(sender.tab.incognito));
 const saved=lastTargets.get(key)??(await chrome.storage.session.get('lastTarget:'+key))['lastTarget:'+key];
 if(!Number.isInteger(saved))throw Error('Visit the page you want to control first. The controller will follow it automatically.');
 const tab=await chrome.tabs.get(saved);
 if(!web(tab.url)||controller(tab.url)||Boolean(tab.incognito)!==Boolean(sender.tab.incognito))throw Error('Visit the page you want to control again.');
 return tab;
}
async function target(request,sender){
 const tab=request.tabId==='active'?await activeTarget(sender):Number.isInteger(request.tabId)?await chrome.tabs.get(request.tabId):null;
 if(!tab||!web(tab.url)||controller(tab.url)||Boolean(tab.incognito)!==Boolean(sender.tab.incognito))throw Error('Choose a normal webpage or the Swich file player.');
 return tab;
}
async function focus(tab){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};}
async function openActiveTab(value,sender){
 const url=destination(value);let win=await chrome.windows.getLastFocused({windowTypes:['normal']});
 if(Boolean(win.incognito)!==Boolean(sender.tab.incognito))win=await chrome.windows.get(sender.tab.windowId);
 const tab=await chrome.tabs.create({windowId:win.id,url,active:true});
 try{if(win.state==='minimized')await chrome.windows.update(win.id,{state:'normal'});await chrome.windows.update(win.id,{focused:true});return {ok:true,focused:true,tabId:tab.id};}
 catch{return {ok:true,focused:false,error:'The link opened, but Chrome could not bring its window forward.'};}
}
async function listVideos(sender){
 const tabs=await chrome.tabs.query({url:WEB});
 return {ok:true,tabs:tabs.filter(t=>web(t.url)&&!controller(t.url)&&Boolean(t.incognito)===Boolean(sender.tab.incognito)).map(t=>({id:t.id,title:t.title||new URL(t.url).hostname,active:t.active}))};
}
function validatedCommand(value){
 if(!value||typeof value!=='object')throw Error('Invalid command.');
 const r={action:value.action};
 if(!['status','toggle','play','pause','seek','seekStart','seekMove','seekEnd','volumeStart','volumeMove','volumeEnd','scroll','scrollStart','scrollMove','scrollEnd','cancel','focus'].includes(r.action))throw Error('Unknown command.');
 if(r.action==='seek'){if(![-10,10].includes(value.seconds))throw Error('Invalid seek.');r.seconds=value.seconds;}
 if(r.action==='scroll'){if(![-1,1].includes(value.direction))throw Error('Invalid scroll.');r.direction=value.direction;}
 if(/^(seek|volume|scroll)(Start|Move|End)$/.test(r.action)){
  if(typeof value.gestureId!=='string'||value.gestureId.length>100)throw Error('Invalid gesture.');r.gestureId=value.gestureId;
 }
 if(r.action.endsWith('Move')){if(!Number.isFinite(value.delta)||Math.abs(value.delta)>1)throw Error('Invalid movement.');r.delta=value.delta;}
 if(r.action.endsWith('End'))r.commit=value.commit===true;
 return r;
}
async function frames(tab,at){
 // Install only when the controller requests an action. Repeat injection is guarded.
 await within(chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['media.js']}),at);fresh(at);
 return within(chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>globalThis.__swichMediaProbe?.()||null}),at);
}
async function sendTo(tabId,frame,command,sender,source,at){
 fresh(at);
 return within(chrome.tabs.sendMessage(tabId,{type:'SWICH_VIDEO_COMMAND',...command,controllerId:sender.tab.id+':'+source,expiresAt:at},frame.documentId?{documentId:frame.documentId}:{frameId:frame.frameId||0}),at);
}
async function cancelLock(key,sender,source){
 const lock=locks.get(key);locks.delete(key);
 if(lock)try{await sendTo(lock.tabId,lock,{action:'cancel'},sender,source,Date.now()+1000);}catch{}
}
async function mediaCommand(request,sender,at,prepared){
 fresh(at);const c=validatedCommand(request.command),source=request.source==='wire'?'wire':'camera',key=sender.tab.id+':'+source;
 if(c.action==='cancel'){await cancelLock(key,sender,source);return {ok:true};}
 const tab=await prepared;fresh(at);
 if(request.tabId==='active'){
  const current=await activeTarget(sender);fresh(at);
  if(current.id!==tab.id||current.url!==tab.url){await cancelLock(key,sender,source);return {ok:false,code:'TARGET_CHANGED',error:'Tab changed. Start a new gesture.'};}
 }
 if(c.action==='focus')return focus(tab);
 let frame;
 const moving=c.action.endsWith('Move')||c.action.endsWith('End');
 if(moving){
  const lock=locks.get(key);
  if(!lock||lock.gestureId!==c.gestureId)throw Error('Start a new gesture.');
  if(lock.tabId!==tab.id||lock.url!==tab.url){await cancelLock(key,sender,source);return {ok:false,code:'TARGET_CHANGED',error:'Tab changed. Start a new gesture.'};}
  frame=lock;
 }else{
  if(c.action!=='status')await cancelLock(key,sender,source);
  const choices=await frames(tab,at);fresh(at);
  const top=choices.find(f=>f.frameId===0),media=choices.filter(f=>f.result?.state).sort((a,b)=>(b.frameId===0?1:0)-(a.frameId===0?1:0)||(b.result.rank||0)-(a.result.rank||0));
  frame=c.action.startsWith('scroll')?top:(media[0]||top);
  if(!frame)throw Error('Chrome does not allow control of this page. Try opening the media directly or use the file player.');
  if(c.action==='status')return {ok:true,page:true,state:media[0]?.result.state||null,target:{id:tab.id,title:tab.title||'Current tab'},embedded:media[0]?.frameId!==0};
  if(c.action.endsWith('Start'))locks.set(key,{tabId:tab.id,url:tab.url,frameId:frame.frameId,documentId:frame.documentId,gestureId:c.gestureId});
 }
 // Discovery can await multiple frame injections; verify focus again before acting.
 if(request.tabId==='active'){
  const current=await activeTarget(sender);fresh(at);
  if(current.id!==tab.id||current.url!==tab.url){await cancelLock(key,sender,source);return {ok:false,code:'TARGET_CHANGED',error:'Tab changed. Start a new gesture.'};}
 }
 const result=await sendTo(tab.id,frame,c,sender,source,at);
 if(c.action.endsWith('End')||!result?.ok)locks.delete(key);
 return {...result,target:{id:tab.id,title:tab.title||'Current tab'}};
}
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
 if(!allowedSender(sender)){reply({ok:false,error:'This helper only accepts requests from your Swich controller.'});return false;}
 if(request?.type==='SWICH_PING'){reply({ok:true,version:VERSION,capabilities:['camera-media','direct-playback','bounded-requests','facebook-media','unified-controls']});return false;}
 if(request?.type==='SWICH_FOCUS_CONTROLLER'){focus(sender.tab).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;}
 if(request?.type==='SWICH_MEDIA_LIST'){within(listVideos(sender),Date.now()+3500).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;}
 if(request?.type==='SWICH_MEDIA_COMMAND'){
  const key=sender.tab.id+':'+(request.source==='wire'?'wire':'camera'),at=Date.now()+3500;
  // Capture the intended target now; a queued request must never jump to another tab.
  const prepared=request.command?.action==='cancel'?Promise.resolve(null):target(request,sender);prepared.catch(()=>{});
  const run=()=>within(mediaCommand(request,sender,at,prepared),at);
  if(request.command?.action==='status'){run().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;}
  const job=(mediaQueues.get(key)||Promise.resolve()).then(run);
  const settled=job.then(reply).catch(e=>reply({ok:false,error:e.message}));mediaQueues.set(key,settled);
  settled.finally(()=>{if(mediaQueues.get(key)===settled)mediaQueues.delete(key);});return true;
 }
 if(request?.type==='SWICH_OPEN'){openActiveTab(request.url,sender).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;}
 reply({ok:false,error:'Unknown request.'});return false;
});
