import test from 'node:test';
import assert from 'node:assert/strict';
import {commandMap,unavailable,formatPosition,parsePosition,snapTime} from '../public/studio/commands.js';
const state={project:{id:'p'},clip:{start:3,duration:10},asset:{sampleRate:48000},track:{id:'t'},cursor:4,selection:[0,1],editable:true,role:'owner',busy:false,undo:1,redo:1,clipboard:{},analysis:{}};
test('Timecode round trips at minute/hour boundaries and sample positions',()=>{
 for(const t of [0,59.9999,60,3599.9999,3600,86399.999,86400])assert.ok(Math.abs(parsePosition(formatPosition(t))-t)<=.00051);
 assert.equal(formatPosition(59.9999),'00:01:00.000');
 for(const t of [0,1/48000,1.2345,3599.111])assert.ok(Math.abs(parsePosition(formatPosition(t,'samples',48000),'samples',48000)-t)<=1/48000);
 for(const t of ['00:60:00','-2','Infinity','x','90000',''])assert.throws(()=>parsePosition(t));
});
test('Commands preserve canonical shortcuts and enforce missing media, access and busy state',()=>{
 assert.equal(commandMap.get('save').shortcut,'Ctrl+S');assert.equal(commandMap.get('duplicate').shortcut,'Ctrl+D');
 for(const id of ['undo','paste','clip-mute','remove-marker','track-up'])assert.match(unavailable(commandMap.get(id),{...state,editable:false,role:'viewer'}),/requires/);
 assert.match(unavailable(commandMap.get('play'),{...state,asset:null}),/clip/);
 assert.match(unavailable(commandMap.get('split'),{...state,cursor:3}),/inside/);
 assert.equal(unavailable(commandMap.get('stop'),{...state,busy:true}),'');
 assert.equal(unavailable(commandMap.get('record'),{...state,busy:true,recording:true,editable:false}),'');
 assert.match(unavailable(commandMap.get('save'),{...state,busy:true}),/Wait/);
 assert.match(unavailable(commandMap.get('admin'),{...state,role:'editor'}),/owner/);
 assert.equal(unavailable(commandMap.get('track-up'),{...state,clip:null,asset:null}),'');
});
test('Snapping chooses nearest eligible boundary and respects bypass',()=>{
 assert.equal(snapTime(2.99,[0,2.9,3,4],.1),3);assert.equal(snapTime(2.5,[0,3],.1),2.5);assert.equal(snapTime(2.99,[3],.1,false),2.99);
});
