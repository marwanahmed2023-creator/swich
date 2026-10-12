'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 window.SwichNative={
  requested:new URLSearchParams(location.search).get('mode')==='phone',
  activate(){
   document.querySelector('.intro').textContent='Wink to switch files. Use your hands to play, pause, seek, and adjust supported players. Keep Swich open while you watch.';
   $('nativeCameraActions').hidden=false;$('nativeCameraActions').append($('cameraButton'),$('stopCamera'));
   $('nativePlayer').hidden=false;$('desktopTarget').hidden=true;$('setupNotice').hidden=true;
   document.body.classList.add('native-mode');
   $('extensionBadge').textContent='This player · no extension';$('extensionBadge').className='badge ready';
   $('backgroundNote').textContent='Keep Swich visible and unlocked. Gestures control this page and its player. Other websites and apps stay separate.';
   $('wireConnect').hidden=!navigator.bluetooth;
   if(!navigator.bluetooth)$('wireStatus').textContent='Camera controls work without Bluetooth.';
   window.SwichMedia.setTarget(()=>window.SwichPlayer.current());
   window.SwichMedia.setNavigation(direction=>$('nativeScrollAction').value==='files'?window.SwichPlayer.step(direction):false);
  },
  async request(type,extra={}){
   if(type==='media-list')return {ok:true,tabs:[]};
   if(type==='focus-controller')return {ok:true};
   if(type==='open'){
    const link=new URL(extra.url);
    if(!['http:','https:'].includes(link.protocol)||link.username||link.password)throw new Error('Use a normal website address.');
    window.open(link.href,'_blank','noopener');return {ok:true};
   }
   if(type!=='media-command')throw new Error('That action needs the desktop helper.');
   if(extra.command.action==='focus'){$('nativePlayer').scrollIntoView({behavior:'smooth'});return {ok:true};}
   const result=await window.SwichMedia.command({...extra.command,controllerId:'local:'+(extra.source||'camera')});
   if(!result.ok)throw new Error(result.error);
   return {...result,target:{title:'Swich player'}};
  }
 };
 $('openMediaUrl').addEventListener('click',()=>{
  try{window.SwichPlayer.openURL($('mediaUrl').value.trim());}catch(error){$('playerStatus').textContent=error.message;}
 });
})();
