var self=this,globalThis=this,SWICH_ASPECT=.75;
if(!Number.isFinite)Number.isFinite=function(n){return typeof n==='number'&&isFinite(n);};
if(!Math.hypot)Math.hypot=function(){var s=0;for(var i=0;i<arguments.length;i++)s+=arguments[i]*arguments[i];return Math.sqrt(s);};
if(!Math.sign)Math.sign=function(n){return n===0?0:n>0?1:-1;};
if(!Array.prototype.find)Array.prototype.find=function(f){for(var i=0;i<this.length;i++)if(f(this[i],i,this))return this[i];};
if(!Array.prototype.includes)Array.prototype.includes=function(v){return this.indexOf(v)>=0;};
if(!Array.prototype.at)Array.prototype.at=function(i){return this[i<0?this.length+i:i];};
if(!Object.assign)Object.assign=function(target){for(var i=1;i<arguments.length;i++)for(var k in arguments[i])if(Object.prototype.hasOwnProperty.call(arguments[i],k))target[k]=arguments[i][k];return target;};
