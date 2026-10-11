'use strict';
const ORIGIN='https://marwanahmed2023-creator.github.io';
const PATHS=new Set(['/swich/','/swich/index.html','/swich/index.htm','/swich/gestures.html']);
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
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
  if(!allowedSender(sender)){reply({ok:false,error:'This helper only accepts requests from your Swich controller.'});return false;}
  if(request?.type==='SWICH_PING'){reply({ok:true,version:'1.0.0'});return false;}
  if(request?.type!=='SWICH_OPEN'){reply({ok:false,error:'Unknown request.'});return false;}
  openActiveTab(request.url,sender).then(reply).catch(()=>reply({ok:false,error:'Chrome could not open the link. Try the gesture again.'}));
  return true;
});
