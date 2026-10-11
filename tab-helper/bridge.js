'use strict';
(()=>{
  const CHANNEL='swich-tab-helper-v1';
  const PATHS=new Set(['/swich/','/swich/index.html','/swich/index.htm','/swich/gestures.html','/swich/camera.html']);
  if(window!==window.top||!PATHS.has(location.pathname))return;
  const completed=new Map(),pending=new Set();
  const post=data=>window.postMessage({channel:CHANNEL,from:'extension',...data},location.origin);
  function send(request,done){
    let settled=false;
    const finish=response=>{if(settled)return;settled=true;clearTimeout(timer);done(response);};
    const timer=setTimeout(()=>finish({ok:false,unavailable:true,error:'The extension connection timed out. Reload Swich Tab Helper in chrome://extensions, then refresh both tabs.'}),6000);
    try{
      chrome.runtime.sendMessage(request,response=>{
        if(chrome.runtime.lastError){finish({ok:false,unavailable:true,error:'Refresh this controller page to reconnect the tab helper.'});return;}
        finish(response||{ok:false,error:'The tab helper did not reply.'});
      });
    }catch{finish({ok:false,unavailable:true,error:'Refresh this controller page to reconnect the tab helper.'});}
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const data=event.data;
    if(data?.channel!==CHANNEL||data.from!=='page')return;
    if(data.type==='ping'){
      send({type:'SWICH_PING'},response=>post({type:'ready',available:response.ok===true,version:response.version,capabilities:response.capabilities||[]}));return;
    }
    if(!['open','media-list','media-command'].includes(data.type)||typeof data.id!=='string'||data.id.length>100)return;
    if(completed.has(data.id)){post(completed.get(data.id));return;}
    if(pending.has(data.id))return;
    pending.add(data.id);
    const request=data.type==='open'?{type:'SWICH_OPEN',url:data.url}:data.type==='media-list'?{type:'SWICH_MEDIA_LIST'}:{type:'SWICH_MEDIA_COMMAND',tabId:data.tabId,command:data.command};
    send(request,response=>{
      pending.delete(data.id);
      const result={type:'result',id:data.id,...response};
      completed.set(data.id,result);
      if(completed.size>100)completed.delete(completed.keys().next().value);
      post(result);
    });
  });
})();
