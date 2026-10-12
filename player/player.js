'use strict';
(()=>{
 const $=id=>document.getElementById(id),video=$('localVideo'),audio=$('localAudio');
 let files=[],selected=-1,url=null,current=null;
 const supported=f=>/^(audio|video)\//.test(f.type)||/\.(mp4|webm|og[gvga]|mp3|m4a|wav|aac|flac|mov|mkv)$/i.test(f.name);
 function stop(){for(const p of [video,audio]){p.pause();p.removeAttribute('src');p.load();p.hidden=true;}if(url)URL.revokeObjectURL(url);url=null;}
 function choose(i){
  if(!files[i])return;stop();selected=i;const file=files[i];url=URL.createObjectURL(file);
  current=file.type.startsWith('audio/')||/\.(mp3|m4a|wav|aac|flac|oga)$/i.test(file.name)?audio:video;
  current.hidden=false;current.src=url;current.load();$('fileTitle').textContent=file.name;
  $('playerStatus').textContent='Press Play once, then use your camera or wire controls.';
  $('previousFile').disabled=i===0;$('nextFile').disabled=i===files.length-1;
  [...$('fileList').children].forEach((b,j)=>{b.classList.toggle('selected',i===j);b.setAttribute('aria-current',i===j?'true':'false');});
 }
 function load(list){
  files=[...list].filter(supported).sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name,undefined,{numeric:true}));
  $('fileList').replaceChildren();
  files.forEach((f,i)=>{const b=document.createElement('button');b.textContent=f.webkitRelativePath||f.name;b.addEventListener('click',()=>choose(i));$('fileList').appendChild(b);});
  if(files.length)choose(0);else{stop();selected=-1;current=null;$('previousFile').disabled=true;$('nextFile').disabled=true;$('fileTitle').textContent='No media files found';$('playerStatus').textContent='Choose a video or audio file that Chrome can play.';}
 }
 $('chooseFile').addEventListener('change',e=>load(e.target.files));$('chooseFolder').addEventListener('change',e=>load(e.target.files));
 $('previousFile').addEventListener('click',()=>choose(selected-1));$('nextFile').addEventListener('click',()=>choose(selected+1));
 for(const p of [video,audio]){
  p.addEventListener('error',()=>$('playerStatus').textContent='Chrome cannot play this file or codec. Try another file, such as an MP4 or MP3.');
  p.addEventListener('play',()=>$('playerStatus').textContent='Ready for camera and wire controls. Keep the controller tab open.');
 }
 window.addEventListener('pagehide',stop);
})();
