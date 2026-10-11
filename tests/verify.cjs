const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('gestures.html','utf8'),js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
let now=0;
const draw=new Proxy({},{get:(target,key)=>target[key]||(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
class Element extends EventTarget{
 constructor(){super();this.textContent='';this.value='';this.disabled=false;this.checked=false;this.dataset={};this.children=[];this.style={};this.classList={toggle(){}};}
 appendChild(e){this.children.push(e);}replaceChildren(){this.children=[];}remove(){}focus(){this.dispatchEvent(new Event('focus'));}blur(){this.dispatchEvent(new Event('blur'));}select(){}click(){}
 getBoundingClientRect(){return {width:800,height:220};}getContext(){return draw;}
}
const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
elements.waveUrl.value='https://wave.example/';elements.touchUrl.value='https://touch.example/';
elements.longHoldUrl.value='https://long.example/';
let savedLinks=JSON.stringify({wave:'https://wave.example/',touch:'https://touch.example/'});
const buttons=['Hand away','Waving','Holding','Release'].map(label=>{const e=new Element();e.dataset.label=label;return e;});
const characteristic=new EventTarget();characteristic.properties={notify:true};characteristic.startNotifications=async()=>characteristic;
const device=new EventTarget();device.name='Mock HM-10';device.gatt={connected:false,connect:async()=>{device.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect:()=>{device.gatt.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
const ctx=vm.createContext({console,TextDecoder,TextEncoder,URL,Blob,performance:{now:()=>now},setInterval:()=>1,setTimeout:()=>1,clearTimeout(){},
 document:Object.assign(new EventTarget(),{hidden:false,getElementById:id=>elements[id],querySelectorAll:()=>buttons,createElement:()=>new Element(),body:new Element()}),
 localStorage:{getItem(){return savedLinks;},setItem(key,value){savedLinks=value;}},navigator:{bluetooth:{requestDevice:async()=>device},clipboard:{writeText:async value=>{ctx.copied=value;}}},
 window:Object.assign(new EventTarget(),{isSecureContext:true,devicePixelRatio:1,location:{origin:'https://marwanahmed2023-creator.github.io'},postMessage(){}}),fakeDevice:device});
vm.runInContext(js,ctx);
const run=code=>vm.runInContext(code,ctx);
function emit(text){const bytes=new TextEncoder().encode(text);characteristic.value=new DataView(bytes.buffer);characteristic.dispatchEvent(new Event('characteristicvaluechanged'));}

(async()=>{
 run("var visits=[],openAttempts=[],openedTabs=[],focusCalls=0,blockPopups=false;window.open=(url,target)=>{openAttempts.push({url,target});if(blockPopups)return null;visits.push(url);const tab={opener:'controller',focus(){focusCalls++;},location:{set href(value){throw new Error('Old cross-origin tab must never be navigated');}}};openedTabs.push(tab);return tab;};");
 await run('connect()');assert.equal(run('connected'),true);
 assert.equal(run('running'),false,'Wait for sensor data before starting');
 assert.equal(run('openAttempts.length'),0,'Connect never opens a staging tab');
 emit('A:44');emit('5,B:0\r\nPASSWORD:ignored\nA:9999,B:0\n');
 assert.equal(elements.reading.textContent,445);
 assert.equal(run('running'),true,'Gestures activate automatically on fresh data');
 assert.equal(run('openAttempts.length'),0,'Receiving data never opens a staging tab');
 assert.equal(elements.longHoldUrl.disabled,false,'Links remain editable');
 run('saveLinks()');
 assert.deepEqual(JSON.parse(savedLinks),{wave:'https://wave.example/',touch:'https://touch.example/',longHold:'https://long.example/'},'Existing saved links survive and third link is saved');
 run('var testTime=0;function feed(value,count){for(let i=0;i<count;i++){detect(value,testTime);testTime+=31;}}function reset(){visits.length=0;detector=newDetector();testTime=0;feed(445,15);}function touchFor(duration){const begun=testTime;for(let t=0;t<duration;t+=30)detect(951,begun+t);detect(445,begun+duration);testTime=begun+duration+31;}');
 run('reset();feed(448,8);feed(452,8);');assert.equal(run('visits.length'),0,'Hover must wait for release');
 run('feed(445,60);');assert.equal(run('visits.join()'),'https://wave.example/');
 assert.equal(run('focusCalls'),1,'Destination receives a focus request');
 assert.equal(run('openedTabs[0].opener'),null,'Destination cannot navigate the controller');
 run('reset();feed(449,80);feed(951,10);');assert.equal(run('visits.length'),0,'Brief touch waits for release, excluding approach time');
 run('feed(450,80);feed(444,60);');assert.equal(run('visits.join()'),'https://touch.example/','Touch overrides approach and departure hover; departure time is excluded');
 run('reset();touchFor(1900);');assert.equal(run('visits.length'),0,'Release is debounced');
 run('feed(445,60);');assert.equal(run('visits.join()'),'https://touch.example/','Release debounce cannot turn 1.9 seconds into a long hold');
 run('reset();touchFor(2000);feed(445,60);');assert.equal(run('visits.join()'),'https://touch.example/','Exactly two seconds is a regular touch');
 run('reset();touchFor(2001);feed(445,60);');assert.equal(run('visits.join()'),'https://long.example/','Release just over two seconds is a long hold');
 run('reset();feed(449,10);feed(951,80);');assert.equal(run('visits.join()'),'https://long.example/','Long hold fires before release');
 run('feed(951,1000);feed(450,20);feed(444,60);');assert.equal(run('visits.join()'),'https://long.example/','Long hold fires once and release never opens touch or wave');
 run('feed(951,10);feed(445,60);');assert.equal(run('visits.join()'),'https://long.example/,https://touch.example/','A new gesture works after release and cooldown');
 run('reset();feed(600,15);feed(445,60);');assert.equal(run('visits.length'),0,'600 is below the requested above-600 threshold');
 run('reset();feed(601,15);feed(445,60);');assert.equal(run('visits.join()'),'https://touch.example/','601 is touch');
 run('reset();feed(453,15);feed(445,60);');assert.equal(run('visits.length'),0,'453 is outside wave range');
 run('reset();feed(447,30);feed(444,30);');assert.equal(run('visits.length'),0,'Idle drift should not trigger');
 run('reset();feed(932,1);feed(449,10);feed(445,60);');assert.equal(run('visits.length'),0,'Brief high spike must not create a touch or fallback wave');
 run('reset();feed(451,1);feed(445,60);');assert.equal(run('visits.length'),0,'Single wave-range sample should not trigger');
 run('links.wave=null;reset();feed(449,10);feed(445,60);');assert.equal(run('visits.length'),0,'Blank URL disables its action');
 run('links.longHold=null;reset();feed(951,100);feed(445,60);');assert.equal(run('visits.length'),0,'Blank long hold link never falls back to the touch link');
 elements.longHoldUrl.focus();assert.equal(run('running'),false,'Editing pauses detection');
 elements.waveUrl.value='';elements.touchUrl.value='';
 elements.longHoldUrl.blur();assert.equal(run('running'),true,'Leaving input resumes automatically');
 run('reset();feed(951,80);');assert.equal(run('visits.join()'),'https://long.example/','Third link can be used alone');
 run('reset();feed(951,50);');
 now=1500;run('checkConnection()');assert.equal(run('running'),false,'Stale stream pauses actions');
 emit('A:951,B:0\n');assert.equal(run('running'),true,'Fresh stream resumes automatically');
 run('feed(951,100);');assert.equal(run('visits.length'),0,'Interrupted hold is not resumed without releasing');
 device.gatt.disconnect();assert.equal(run('connected'),false);assert.equal(run('running'),false);
 await run('connect()');emit('A:451,B:0\n');assert.equal(elements.reading.textContent,451);
 assert.equal(run('running'),true,'Reconnect activates automatically');
 // Exercise real BLE notifications while the controller tab is hidden.
 elements.longHoldUrl.focus();elements.longHoldUrl.value='https://github.com/';
 elements.longHoldUrl.dispatchEvent(new Event('input'));
 ctx.document.hidden=true;ctx.document.dispatchEvent(new Event('visibilitychange'));
 assert.equal(run('running'),true,'Switching tabs commits edits and resumes gestures');
 assert.equal(JSON.parse(savedLinks).longHold,'https://github.com/');
 run('visits.length=0;');
 const send=(value,count)=>{for(let i=0;i<count;i++){now+=31;emit('A:'+value+',B:0\n');}};
 send(445,15);send(951,80);send(445,60);send(951,80);send(445,60);
 assert.equal(run('visits.join()'),'https://github.com/,https://github.com/','Two background long holds open GitHub directly without reusing a protected Location');
 assert.equal(run('openAttempts.every(x=>x.target==="_blank"&&x.url!=="about:blank")'),true);
 run('blockPopups=true;reset();feed(951,100);feed(445,60);');
 assert.equal(run('visits.length'),0);assert.match(elements.status.textContent,/Chrome blocked/,'Popup failure remains visible after long-hold release');
 assert.equal(run('running'),true,'Popup blocker does not break the Bluetooth detector');
 run('blockPopups=false;reset();feed(951,80);');assert.equal(run('visits.join()'),'https://github.com/','Next gesture retries after popup permission changes');
 elements.longHoldUrl.focus();elements.longHoldUrl.value='javascript:alert(1)';elements.longHoldUrl.blur();
 assert.equal(run('running'),false,'Invalid link stops activation');
 elements.longHoldUrl.focus();elements.longHoldUrl.value='';elements.longHoldUrl.blur();
 assert.equal(run('running'),false,'All blank links disable gestures');
 elements.touchUrl.focus();elements.touchUrl.value='example.com';elements.touchUrl.blur();
 assert.equal(run('running'),true,'Entering one valid link activates gestures');
 for(const url of ['javascript:alert(1)','data:text/plain,bad'])assert.throws(()=>run('safeUrl('+JSON.stringify(url)+')'));
 assert.equal(run("safeUrl('google.com')"),'https://google.com/');
 for(const removed of ['startBtn','canvas','captureStatus','waveThreshold','calibrateBtn','resultsBody'])assert.equal(html.includes('id="'+removed+'"'),false);
 assert.equal(html.includes('outputTab'),false);
 // Run the actual extension worker, content bridge, and controller together
 // against mocked Chrome APIs. No browser or physical Bluetooth is implied.
 const manifest=JSON.parse(fs.readFileSync('tab-helper/manifest.json','utf8'));
 assert.equal(manifest.manifest_version,3);assert.equal(manifest.permissions,undefined);
 assert.deepEqual(manifest.content_scripts[0].matches,['https://marwanahmed2023-creator.github.io/swich/*']);
 let workerListener,failFocus=false;
 const created=[],windowChanges=[],posted=[];
 const sender={id:'swich-test',frameId:0,url:'https://marwanahmed2023-creator.github.io/swich/?v=test',tab:{id:4,windowId:10,incognito:false}};
 const extensionChrome={
   runtime:{id:'swich-test',onMessage:{addListener(listener){workerListener=listener;}}},
   tabs:{async create(options){created.push({...options});return {id:created.length,windowId:options.windowId};}},
   windows:{async getLastFocused(){return {id:99,state:'minimized',incognito:false};},async get(id){return {id,state:'normal',incognito:false};},async update(id,options){windowChanges.push({id,...options});if(failFocus&&options.focused)throw new Error('Focus rejected');return {id};}}
 };
 vm.runInNewContext(fs.readFileSync('tab-helper/background.js','utf8'),{URL,chrome:extensionChrome,setTimeout,clearTimeout});
 const origin=ctx.window.location.origin;
 ctx.window.top=ctx.window;
 ctx.window.postMessage=(data,targetOrigin)=>{
   assert.equal(targetOrigin,origin);posted.push(data);
   queueMicrotask(()=>{const event=new Event('message');Object.assign(event,{source:ctx.window,origin,data});ctx.window.dispatchEvent(event);});
 };
 vm.runInNewContext(fs.readFileSync('tab-helper/bridge.js','utf8'),{
   setTimeout,clearTimeout,window:ctx.window,location:{origin,pathname:'/swich/'},
   chrome:{runtime:{sendMessage(request,reply){workerListener(request,sender,reply);}}}
 });
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 run('pingHelper()');await flush();
 assert.equal(run('helperReady'),true);assert.equal(elements.helperInstall.hidden,true);
 elements.waveUrl.value='https://wave.example/';elements.touchUrl.value='https://touch.example/';elements.longHoldUrl.value='https://github.com/';run('finishEditing();blockPopups=true;');
 const previousAttempts=run('openAttempts.length');
 run('reset();feed(449,10);feed(445,60);');await flush();
 run('reset();feed(951,10);feed(445,60);');await flush();
 run('reset();feed(951,100);feed(445,60);');await flush();
 assert.deepEqual(created.map(x=>x.url),['https://wave.example/','https://touch.example/','https://github.com/']);
 assert.equal(created.every(x=>x.active===true&&x.windowId===99),true,'Activate destinations in last-used window, not controller window');
 assert.equal(windowChanges.filter(x=>x.focused===true&&x.id===99).length,3,'Bring last-used Chrome window forward for every action');
 assert.equal(windowChanges[0].state,'normal','Restore minimized target before focusing');
 assert.equal(run('openAttempts.length'),previousAttempts,'Extension path never calls popup fallback');
 assert.match(elements.status.textContent,/active tab/);
 const lastRequest=posted.filter(x=>x.from==='page'&&x.type==='open').at(-1);
 ctx.window.postMessage(lastRequest,origin);await flush();
 assert.equal(created.length,3,'Replayed bridge message does not open a duplicate tab');
 const requestWorker=(request,who=sender)=>new Promise(resolve=>workerListener(request,who,resolve));
 for(const who of [{...sender,url:'https://example.com/'},{...sender,frameId:1},{...sender,id:'other-extension'},{...sender,url:origin+'/different-project/'}]){
   const response=await requestWorker({type:'SWICH_OPEN',url:'https://github.com/'},who);assert.equal(response.ok,false);
 }
 assert.equal((await requestWorker({type:'SWICH_OPEN',url:'javascript:alert(1)'})).ok,false);
 assert.equal(created.length,3,'Untrusted senders and unsafe URLs never open tabs');
 failFocus=true;
 run('reset();feed(951,100);feed(445,60);');await flush();
 assert.equal(created.length,4,'Focus failure still creates only one destination');
 assert.match(elements.status.textContent,/could not bring/);
 assert.equal(run('openAttempts.length'),previousAttempts,'No popup retry after a tab was already created');
 console.log('PASS: automatic connect/resume; no Start button or staging page; editable/saved links; two simulated BLE long-hold sequences in a hidden tab open GitHub directly; focus requested; popup blocking/retry; 1.9s/2s/2.001s boundaries; no duplicate actions; no protected Location writes; wave/touch thresholds and noise rejection; stale-stream recovery; URL validation.');
 console.log('PASS: actual extension worker + bridge + page integration with simulated Chrome APIs; all three gestures open active tabs in the last-used window; minimized window restoration and focus; no popup fallback; duplicate-message rejection; restricted origin/frame/extension identity; focus failure does not duplicate tabs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
