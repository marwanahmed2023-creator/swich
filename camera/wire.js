'use strict';
(()=>{
 const $=id=>document.getElementById(id),SERVICE='0000ffe0-0000-1000-8000-00805f9b34fb',CHAR='0000ffe1-0000-1000-8000-00805f9b34fb';
 let device=null,characteristic=null,connected=false,busy=false,buffer='',decoder=new TextDecoder();
 const hint=text=>$('wireStatus').textContent=text;
 const engine=new SwichWire.WireEngine(command=>window.SwichControls.sendWire(command),hint);
 function render(){
  $('wireConnect').disabled=busy||!window.SwichControls.ready();$('wireConnect').textContent=connected?'Disconnect wire':'Connect Bluetooth';
 }
 function cleanup(){
  connected=false;engine.reset();window.SwichControls.cancelWire();
  characteristic?.removeEventListener('characteristicvaluechanged',receive);characteristic=null;
  device?.removeEventListener('gattserverdisconnected',cleanup);buffer='';decoder=new TextDecoder();render();hint('Wire disconnected.');
 }
 function receive(event){
  // One receipt time for the whole packet; the engine counts its sensor samples.
  const receivedAt=performance.now();
  buffer+=decoder.decode(event.target.value,{stream:true});let end;
  while((end=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);const m=/^A:(\d{1,4}),B:([01])$/.exec(line);
   if(m&&connected){if(window.SwichControls.ready())engine.update(Number(m[1]),receivedAt);else engine.reset();}
  }
  if(buffer.length>4096)buffer='';
 }
 async function connect(){
  if(busy)return;
  if(connected){device?.gatt?.disconnect();cleanup();return;}
  if(!navigator.bluetooth){hint('Bluetooth needs Chrome on a supported computer.');return;}
  busy=true;render();hint('Choose your HM-10…');
  try{
   device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}]});
   device.addEventListener('gattserverdisconnected',cleanup);
   const server=await device.gatt.connect(),service=await server.getPrimaryService(SERVICE);characteristic=await service.getCharacteristic(CHAR);
   engine.reset();buffer='';decoder=new TextDecoder();characteristic.addEventListener('characteristicvaluechanged',receive);
   await characteristic.startNotifications();if(!device.gatt.connected)throw Error('Bluetooth disconnected.');
   connected=true;hint('Connected · release the wire briefly, then tap or hold.');
  }catch(e){const old=device;cleanup();if(old?.gatt?.connected)old.gatt.disconnect();hint(e.name==='NotFoundError'?'No HM-10 selected.':'Bluetooth: '+e.message);}
  finally{busy=false;render();}
 }
 window.SwichWireDevice={reset(){engine.reset();},connected:()=>connected,render};
 $('wireConnect').addEventListener('click',connect);
 setInterval(()=>engine.tick(performance.now()),40);
 window.addEventListener('pagehide',()=>{engine.reset();if(device?.gatt?.connected)device.gatt.disconnect();});
 render();
})();
