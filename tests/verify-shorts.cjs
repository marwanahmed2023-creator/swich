'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
class Element{
 constructor(){this.style={opacity:'1'};this.isConnected=true;this.parentElement=null;this.children=[];this.moves=[];this.clicks=0;this.clientHeight=720;this.scrollHeight=720;}
 appendChild(e){e.parentElement=e.parentNode=this;this.children.push(e);return e;}
 append(...nodes){nodes.forEach(n=>this.appendChild(n));}
 attachShadow(){return new Element();}
 getBoundingClientRect(){return {left:0,top:0,right:400,bottom:720,width:400,height:720};}
 checkVisibility(){return !this.hidden;}
 contains(el){return el===this||this.children.some(c=>c.contains(el));}
 closest(){for(let e=this;e;e=e.parentElement)if(e.disabled||e.ariaDisabled)return e;return null;}
 click(){this.clicks++;}
 scrollBy(options){this.moves.push(options.top);}
}
async function test(){
 let listener,clock=1000,ad=true,hasReel=true;
 const page=new Element(),root=new Element(),feed=new Element(),adPanel=new Element(),reel=new Element(),next=new Element(),previous=new Element(),hiddenNext=new Element(),nextWrapper=new Element();
 page.append(root,adPanel);root.append(feed,nextWrapper,previous,hiddenNext);feed.append(reel);nextWrapper.append(next);hiddenNext.hidden=true;
 feed.style.overflowY='hidden';feed.scrollHeight=8000;
 adPanel.style.overflowY='auto';adPanel.scrollHeight=3000;
 let buttons=true;
 root.querySelectorAll=q=>!buttons?[]:q.includes('navigation-button-down')?[hiddenNext,next]:q.includes('navigation-button-up')?[previous]:[];
 root.querySelector=q=>q==='#shorts-container'?feed:q.includes('is-active')&&hasReel?reel:null;
 const location={hostname:'www.youtube.com',pathname:'/shorts/one'};
 const document={documentElement:page,scrollingElement:page,elementFromPoint:()=>adPanel,createElement:()=>new Element(),
  querySelectorAll:q=>q==='ytd-shorts'?[root]:[],querySelector:q=>q==='.ad-showing'&&ad?{}:null};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tab-helper/media.js'),'utf8'),{location,document,innerWidth:1200,innerHeight:800,getComputedStyle:e=>e.style,
  chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}}},Date:{now:()=>clock},setTimeout:()=>1,clearTimeout(){},setInterval(){}});
 const send=(action,extra={})=>new Promise(resolve=>listener({type:'SWICH_VIDEO_COMMAND',controllerId:'7:camera',gestureId:'scroll',action,...extra},{id:'test'},resolve));
 assert.equal((await send('status')).state,null,'An iframe ad can leave no media in the top document');
 for(const direction of [1,-1,1])assert.equal((await send('scroll',{direction})).ok,true);
 assert.equal(next.clicks,2);assert.equal(previous.clicks,1);assert.equal(hiddenNext.clicks,0);
 assert.deepEqual(adPanel.moves,[],'An ad under the center cannot capture feed scrolling');assert.deepEqual(page.moves,[]);
 // Disabled controls stay disabled, including when the attribute is on a wrapper.
 nextWrapper.ariaDisabled=true;assert.equal((await send('scroll',{direction:1})).ok,false);assert.equal(next.clicks,2);assert.deepEqual(feed.moves,[]);
 nextWrapper.ariaDisabled=false;next.disabled=true;assert.equal((await send('scroll',{direction:1})).ok,false);next.disabled=false;
 // Hidden arrows and an ad without an active video still use the feed container.
 buttons=false;hasReel=false;
 await send('scroll',{direction:1});await send('scroll',{direction:-1});assert.deepEqual(feed.moves,[720,-720]);assert.deepEqual(adPanel.moves,[]);
 feed.scrollHeight=720;assert.equal((await send('scroll',{direction:1})).ok,false,'An unavailable feed reports failure instead of false success');feed.scrollHeight=8000;
 // DOM is rediscovered after SPA navigation, with no media-loaded prerequisite.
 buttons=true;location.pathname='/shorts/two';ad=false;
 assert.equal((await send('scroll',{direction:1})).ok,true);assert.equal(next.clicks,3);
 // Wire scroll ticks use the same navigation, bounded to one step per 600ms.
 await send('scrollStart');const start=next.clicks;
 for(let i=0;i<8;i++){await send('scrollMove',{delta:.4});clock+=100;}
 assert.equal(next.clicks-start,2);await send('scrollEnd');
 assert.equal((await send('scrollMove',{delta:.4})).ok,false);
 // A hidden SPA Shorts page must not hijack regular page scrolling.
 root.hidden=true;await send('scroll',{direction:1});assert.deepEqual(adPanel.moves,[520]);root.hidden=false;
 location.pathname='/watch';await send('scroll',{direction:-1});assert.deepEqual(adPanel.moves,[520,-520]);
 location.hostname='youtube.com.attacker.example';location.pathname='/shorts/one';await send('scroll',{direction:1});assert.deepEqual(adPanel.moves,[520,-520,520]);
 console.log('PASS: Shorts ads/iframes, native next/previous, hidden and disabled controls, feed fallback without a video, SPA navigation, wire holds and non-Shorts isolation.');
}
 test().catch(error=>{console.error(error);process.exitCode=1;});
