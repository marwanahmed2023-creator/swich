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
const mediaQueues=new Map(),zoomSessions=new Map();
function youtube(url){try{const u=new URL(url);return u.protocol==='https:'&&['www.youtube.com','m.youtube.com'].includes(u.hostname);}catch{return false;}}
async function listVideos(sender){
  const tabs=await chrome.tabs.query({url:['https://www.youtube.com/*','https://m.youtube.com/*']});
  return {ok:true,tabs:tabs.filter(t=>Boolean(t.incognito)===Boolean(sender.tab.incognito)&&youtube(t.url)).map(t=>({id:t.id,title:t.title||'YouTube',active:t.active}))};
}
function validatedCommand(value){
  if(!value||typeof value!=='object')throw new Error('Invalid media command.');
  const result={action:value.action};
  if(!['status','toggle','seek','seekStart','seekMove','seekEnd','volumeStart','volumeMove','volumeEnd','zoomStart','zoomMove','zoomEnd','cancel','focus'].includes(result.action))throw new Error('Unknown media command.');
  if(result.action==='seek'){if(![-10,10].includes(value.seconds))throw new Error('Invalid seek.');result.seconds=value.seconds;}
  if(/^(seek|volume|zoom)(Start|Move|End)$/.test(result.action)){
    if(typeof value.gestureId!=='string'||value.gestureId.length>100)throw new Error('Invalid gesture.');result.gestureId=value.gestureId;
  }
  if(['seekMove','volumeMove'].includes(result.action)){
    if(!Number.isFinite(value.delta)||Math.abs(value.delta)>1)throw new Error('Invalid movement.');result.delta=value.delta;
  }
  if(result.action==='zoomMove'){
    if(!Number.isFinite(value.scale)||value.scale<.4||value.scale>2.5)throw new Error('Invalid zoom.');result.scale=value.scale;
  }
  if(result.action.endsWith('End'))result.commit=value.commit===true;
  return result;
}
async function mediaCommand(request,sender){
  if(!Number.isInteger(request.tabId))throw new Error('Choose a YouTube tab first.');
  const tab=await chrome.tabs.get(request.tabId);
  if(!youtube(tab.url)||Boolean(tab.incognito)!==Boolean(sender.tab.incognito))throw new Error('The selected tab is no longer a YouTube page.');
  const command=validatedCommand(request.command),key=sender.tab.id+':'+tab.id;
  if(command.action==='focus'){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};}
  if(command.action==='zoomStart'){
    await chrome.tabs.setZoomSettings(tab.id,{mode:'automatic',scope:'per-tab'});
    zoomSessions.set(key,{id:command.gestureId,base:await chrome.tabs.getZoom(tab.id),at:Date.now()});return {ok:true};
  }
  if(command.action==='zoomMove'){
    const z=zoomSessions.get(key);
    if(!z||z.id!==command.gestureId||Date.now()-z.at>3000)throw new Error('Start a new zoom gesture.');
    z.at=Date.now();const zoom=Math.max(.5,Math.min(3,z.base*command.scale));await chrome.tabs.setZoom(tab.id,zoom);
    try{await chrome.tabs.sendMessage(tab.id,{type:'SWICH_VIDEO_COMMAND',action:'feedback',text:'Page zoom '+Math.round(zoom*100)+'%'});}catch{}
    return {ok:true,zoom};
  }
  if(command.action==='zoomEnd'){zoomSessions.delete(key);return {ok:true};}
  if(command.action==='cancel')zoomSessions.delete(key);
  try{return await chrome.tabs.sendMessage(tab.id,{type:'SWICH_VIDEO_COMMAND',...command,controllerId:sender.tab.id});}
  catch{throw new Error('Refresh your YouTube tab once after updating the extension, then try again.');}
}
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
  if(!allowedSender(sender)){reply({ok:false,error:'This helper only accepts requests from your Swich controller.'});return false;}
  if(request?.type==='SWICH_PING'){reply({ok:true,version:'1.1.0',capabilities:['camera-media']});return false;}
  if(request?.type==='SWICH_MEDIA_LIST'){
    listVideos(sender).then(reply).catch(()=>reply({ok:false,error:'Could not list YouTube tabs. Check the extension’s YouTube site access.'}));return true;
  }
  if(request?.type==='SWICH_MEDIA_COMMAND'){
    const key=sender.tab.id;
    const job=(mediaQueues.get(key)||Promise.resolve()).then(()=>mediaCommand(request,sender));
    const settled=job.then(reply).catch(error=>reply({ok:false,error:error.message}));mediaQueues.set(key,settled);
    settled.finally(()=>{if(mediaQueues.get(key)===settled)mediaQueues.delete(key);});return true;
  }
  if(request?.type!=='SWICH_OPEN'){reply({ok:false,error:'Unknown request.'});return false;}
  openActiveTab(request.url,sender).then(reply).catch(()=>reply({ok:false,error:'Chrome could not open the link. Try the gesture again.'}));
  return true;
});
