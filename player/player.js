'use strict';
(()=>{
 const $=id=>document.getElementById(id),video=$('localVideo'),audio=$('localAudio');
 let files=[],selected=-1,url=null,current=null;
 const supported=f=>/^(audio|video)\//.test(f.type)||/\.(mp4|webm|og[gvga]|mp3|m4a|wav|aac|flac|mov|mkv)$/i.test(f.name);
 function stop(){for(const p of [video,audio]){p.pause();p.removeAttribute('src');p.load();p.hidden=true;}if(url)URL.revokeObjectURL(url);url=null;current=null;}
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
  if(files.length)choose(0);else{stop();selected=-1;current=null;$('previousFile').disabled=true;$('nextFile').disabled=true;$('fileTitle').textContent='No media files found';$('playerStatus').textContent='Choose a video or audio file that this browser can play.';}
 }
 $('chooseFile').addEventListener('change',e=>load(e.target.files));$('chooseFolder')?.addEventListener('change',e=>load(e.target.files));
 $('previousFile').addEventListener('click',()=>choose(selected-1));$('nextFile').addEventListener('click',()=>choose(selected+1));
 for(const p of [video,audio]){
  p.addEventListener('error',()=>$('playerStatus').textContent='This browser cannot play this file or address. Try a supported MP4 or MP3. Website links such as Facebook are not direct media files.');
  p.addEventListener('play',()=>$('playerStatus').textContent='Ready for camera and wire controls. Keep Swich open.');
 }
 window.SwichPlayer={current:()=>current,async step(direction){
  const next=selected+direction;
  if(!files.length)return 'Choose several files to use next and previous.';
  if(!files[next])return direction>0?'Last file reached':'First file reached';
  const playing=current&&!current.paused;choose(next);
  if(playing){
   const target=current;let timer;
   try{await Promise.race([target.play(),new Promise((_,reject)=>{timer=setTimeout(()=>{target.pause();reject(new Error('Playback timed out'));},1800);})]);}
   catch{$('playerStatus').textContent='Tap Play to start this file.';}
   finally{clearTimeout(timer);}
  }
  return (direction>0?'Next: ':'Previous: ')+files[next].name;
 },openURL(value){
  const link=new URL(value);
  if(link.protocol!=='https:'||link.username||link.password)throw new Error('Use a direct HTTPS video or audio address.');
  stop();files=[];selected=-1;$('fileList').replaceChildren();$('previousFile').disabled=$('nextFile').disabled=true;
  current=/\.(mp3|m4a|wav|aac|flac|oga)(?:$|\?)/i.test(link.href)?audio:video;
  current.hidden=false;current.src=link.href;current.load();$('fileTitle').textContent=link.pathname.split('/').pop()||'Online media';
  $('playerStatus').textContent='Tap Play once. The source must allow playback in this browser.';
 }};
 window.addEventListener('pagehide',stop);
})();
