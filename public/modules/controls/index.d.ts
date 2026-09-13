export interface AudioKnobEventMap {
 valuechange:CustomEvent<{value:number}>;
 gesturestart:CustomEvent<void>;
 gestureend:CustomEvent<void>;
}
export class AudioKnob extends HTMLElement {
 value:number;disabled:boolean;readonly min:number;readonly max:number;
 addEventListener<K extends keyof AudioKnobEventMap>(type:K,listener:(this:AudioKnob,event:AudioKnobEventMap[K])=>unknown,options?:boolean|AddEventListenerOptions):void;
 addEventListener<K extends keyof HTMLElementEventMap>(type:K,listener:(this:HTMLElement,event:HTMLElementEventMap[K])=>unknown,options?:boolean|AddEventListenerOptions):void;
 addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions):void;
}
export function drawSpectrum(canvas:HTMLCanvasElement,values:Float32Array|number[],options?:{floor?:number;color?:string}):void;
