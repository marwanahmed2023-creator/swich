'use strict';
const ORIGIN='https://marwanahmed2023-creator.github.io';
const PATHS=new Set(['/swich/','/swich/index.html','/swich/index.htm','/swich/gestures.html','/swich/camera.html']);
function allowedSender(sender){
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id))return false;
  try{const page=new URL(sender.url);return page.origin===ORIGIN&&PATHS.has(page.pathname);}catch{return false;}
}
function destination(value){
  if(typeof value!=='string'||value.length>8192)throw new Error('Invalid link.');
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Use a normal website link.');
  return url.href;
}
async function openActiveTab(value,sender){
  const url=destination(value);
  let target=await chrome.windows.getLastFocused({windowTypes:['normal']});
  // Keep normal and private browsing separate.
  if(Boolean(target.incognito)!==Boolean(sender.tab.incognito))target=await chrome.windows.get(sender.tab.windowId);
  const tab=await chrome.tabs.create({windowId:target.id,url,active:true});
  try{
    if(target.state==='minimized')await chrome.windows.update(tab.windowId,{state:'normal'});
    await chrome.windows.update(tab.windowId,{focused:true});
    return {ok:true,focused:true};
  }catch{
    // The tab already exists. Never create a second tab if focusing fails.
    return {ok:true,focused:false,error:'The link opened, but Chrome could not bring its window forward.'};
  }
}
const mediaQueues=new Map();
const VIDEO_SITES=new Map([
  ['www.youtube.com','YouTube'],['m.youtube.com','YouTube'],
  ['facebook.com','Facebook'],['www.facebook.com','Facebook'],['m.facebook.com','Facebook'],['web.facebook.com','Facebook']
]);
const VIDEO_PATTERNS=[...VIDEO_SITES.keys()].map(host=>'https://'+host+'/*');
function fresh(expiresAt){if(Date.now()>=expiresAt)throw new Error('That request expired. Relax your hand and try again.');}
function within(promise,expiresAt){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The video tab did not respond. Open it and try again.')),Math.max(1,expiresAt-Date.now()));
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
function videoSite(url){try{const u=new URL(url);return u.protocol==='https:'?VIDEO_SITES.get(u.hostname):undefined;}catch{return undefined;}}
async function listVideos(sender){
  const tabs=await chrome.tabs.query({url:VIDEO_PATTERNS});
  return {ok:true,tabs:tabs.filter(t=>Boolean(t.incognito)===Boolean(sender.tab.incognito)&&videoSite(t.url)).map(t=>({id:t.id,title:videoSite(t.url)+' · '+(t.title||'Video'),active:t.active}))};
}
function validatedCommand(value){
  if(!value||typeof value!=='object')throw new Error('Invalid media command.');
  const result={action:value.action};
  if(!['status','toggle','play','pause','seek','seekStart','seekMove','seekEnd','volumeStart','volumeMove','volumeEnd','cancel','focus'].includes(result.action))throw new Error('Unknown media command.');
  if(result.action==='seek'){if(![-10,10].includes(value.seconds))throw new Error('Invalid seek.');result.seconds=value.seconds;}
  if(/^(seek|volume)(Start|Move|End)$/.test(result.action)){
    if(typeof value.gestureId!=='string'||value.gestureId.length>100)throw new Error('Invalid gesture.');result.gestureId=value.gestureId;
  }
  if(['seekMove','volumeMove'].includes(result.action)){
    if(!Number.isFinite(value.delta)||Math.abs(value.delta)>1)throw new Error('Invalid movement.');result.delta=value.delta;
  }
  if(result.action.endsWith('End'))result.commit=value.commit===true;
  return result;
}
async function mediaCommand(request,sender,expiresAt){
  fresh(expiresAt);
  if(!Number.isInteger(request.tabId))throw new Error('Choose a YouTube or Facebook tab first.');
  const command=validatedCommand(request.command);
  const tab=await chrome.tabs.get(request.tabId);
  fresh(expiresAt);
  if(!videoSite(tab.url)||Boolean(tab.incognito)!==Boolean(sender.tab.incognito))throw new Error('The selected tab is no longer a supported YouTube or Facebook page.');
  if(command.action==='focus'){await chrome.tabs.update(tab.id,{active:true});fresh(expiresAt);await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};}
  try{return await chrome.tabs.sendMessage(tab.id,{type:'SWICH_VIDEO_COMMAND',...command,controllerId:sender.tab.id,expiresAt});}
  catch{throw new Error('Refresh your video tab once after updating the extension, then try again.');}
}
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
  if(!allowedSender(sender)){reply({ok:false,error:'This helper only accepts requests from your Swich controller.'});return false;}
  if(request?.type==='SWICH_PING'){reply({ok:true,version:'1.3.0',capabilities:['camera-media','direct-playback','bounded-requests','facebook-media']});return false;}
  if(request?.type==='SWICH_MEDIA_LIST'){
    within(listVideos(sender),Date.now()+3500).then(reply).catch(()=>reply({ok:false,error:'Could not list video tabs. Check the extension’s YouTube and Facebook site access.'}));return true;
  }
  if(request?.type==='SWICH_MEDIA_COMMAND'){
    const key=sender.tab.id,expiresAt=Date.now()+3500;
    const run=()=>{fresh(expiresAt);return within(mediaCommand(request,sender,expiresAt),expiresAt);};
    // Read-only status must not wait behind a stalled playback request.
    if(request.command?.action==='status'){Promise.resolve().then(run).then(reply).catch(error=>reply({ok:false,error:error.message}));return true;}
    const job=(mediaQueues.get(key)||Promise.resolve()).then(run);
    const settled=job.then(reply).catch(error=>reply({ok:false,error:error.message}));mediaQueues.set(key,settled);
    settled.finally(()=>{if(mediaQueues.get(key)===settled)mediaQueues.delete(key);});return true;
  }
  if(request?.type!=='SWICH_OPEN'){reply({ok:false,error:'Unknown request.'});return false;}
  openActiveTab(request.url,sender).then(reply).catch(()=>reply({ok:false,error:'Chrome could not open the link. Try the gesture again.'}));
  return true;
});
