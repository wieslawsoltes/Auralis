/** Serializable insert-chain model shared by DSP, UI and server validation. */
export const INSERTS = {
 eq:{name:'Studio Equalizer',params:{low:[0,-24,24,.1],mid:[0,-24,24,.1],high:[0,-24,24,.1],frequency:[1200,20,20000,1],q:[.7,.05,20,.05]}},
 compressor:{name:'Studio Compressor',params:{threshold:[-18,-96,0,.1],ratio:[3,1,40,.1],attack:[10,.1,500,.1],release:[120,5,5000,1],makeup:[0,-24,24,.1]}},
 limiter:{name:'Peak Limiter',params:{ceiling:[-1,-30,0,.1],release:[80,5,5000,1]}},
 gain:{name:'Gain',params:{gain:[0,-60,24,.1]}},
 highpass:{name:'High-pass Filter',params:{frequency:[80,20,20000,1],q:[.707,.05,20,.01]}},
 lowpass:{name:'Low-pass Filter',params:{frequency:[16000,20,20000,1],q:[.707,.05,20,.01]}},
 stereo:{name:'Stereo Width',params:{width:[1,0,2,.01],balance:[0,-1,1,.01]}},
 native:{name:'Native Plug-in',params:{}}
};
export function createInsert(type,id){if(typeof type!=='string'||!Object.hasOwn(INSERTS,type))throw Error('Unknown insert type.');return {id,type,enabled:true,wet:1,params:Object.fromEntries(Object.entries(INSERTS[type].params).map(([k,v])=>[k,v[0]]))};}
export function legacyChain(e){return [{id:'legacy-eq',type:'eq',enabled:e.eq.enabled,wet:1,params:{...e.eq}},{id:'legacy-compressor',type:'compressor',enabled:e.compressor.enabled,wet:1,params:{...e.compressor}},{id:'legacy-output',type:'gain',enabled:true,wet:1,params:{gain:e.output}},{id:'legacy-limiter',type:'limiter',enabled:e.limiter.enabled,wet:1,params:{...e.limiter}}];}
export function validateChain(chain){
 if(!Array.isArray(chain)||chain.length>64)throw Error('A processing chain supports up to 64 inserts.');const ids=new Set();
 for(const node of chain){if(!node||typeof node.id!=='string'||!/^[\w-]{1,100}$/.test(node.id)||ids.has(node.id)||(typeof node.type!=='string'||!Object.hasOwn(INSERTS,node.type))||typeof node.enabled!=='boolean'||!Number.isFinite(node.wet)||node.wet<0||node.wet>1||!node.params||typeof node.params!=='object'||Array.isArray(node.params))throw Error('Invalid processing insert.');ids.add(node.id);
  for(const [key,[,min,max]] of Object.entries(INSERTS[node.type].params))if(!Number.isFinite(node.params[key])||node.params[key]<min||node.params[key]>max)throw Error('Invalid '+node.type+' '+key+'.');
  if(node.type==='native'){const p=node.params;if(typeof p.pluginId!=='string'||!/^[\w-]{1,100}$/.test(p.pluginId))throw Error('Choose a configured native plug-in.');if(p.state!=null&&(typeof p.state!=='string'||p.state.length>262144||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.state)))throw Error('Invalid native state.');if(p.parameters!=null&&(!Array.isArray(p.parameters)||p.parameters.length>256||p.parameters.some(v=>typeof v!=='string'||!/^\d+=[-+\d.eE]+$/.test(v)||!Number.isFinite(Number(v.split('=')[1])))))throw Error('Invalid native parameters.');}
 }
 return chain;
}
export const hasNativeInserts=e=>Array.isArray(e?.chain)&&!e.bypass&&e.chain.some(n=>n.type==='native'&&n.enabled&&n.wet>0);
export function processingLatency(e,rate){return Array.isArray(e?.chain)?e.chain.reduce((n,s)=>n+(s.type==='limiter'?Math.max(1,Math.ceil(rate*.005)):0),0):Math.max(1,Math.ceil(rate*.005));}
