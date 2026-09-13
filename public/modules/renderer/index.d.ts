/** Peak summary of a streamed channel; compatible with @auralis/audio. */
export interface PeakChannel {length:number;byteLength:0;peakBlock:number;min:Float32Array;max:Float32Array;}
export interface WaveformScene {
 project:{tracks:Array<{id:string;name:string;gain:number;mute?:boolean;solo?:boolean;color?:string}>;clips:Array<{id:string;name:string;trackId:string;assetId:string;start:number;offset:number;duration:number;gain:number;fadeIn:number;fadeOut:number}>;markers:Array<{time:number;name:string;color?:string}>};
 assets:Map<string,{channels:(Float32Array|PeakChannel)[];sampleRate:number}>;
 selectedId?:string;selectedIds?:string[];viewStart:number;viewDuration:number;mode:'audio'|'montage';selection?:[number,number];cursor?:number;
 amplitude?:number;trackOffset?:number;
 /** Enables rectangular frequency selection overlays; does not generate spectrogram pixels. */
 spectral?:boolean;frequencySelection?:[number,number]|null;
}
export class WaveformRenderer extends EventTarget {
 constructor(host:HTMLElement);
 readonly host:HTMLElement;readonly base:HTMLCanvasElement;readonly gpu:HTMLCanvasElement;readonly overlay:HTMLCanvasElement;
 mode:'Canvas 2D'|'WebGPU';setScene(scene:WaveformScene):void;render():void;drawCursor(time:number):void;timeAt(x:number):number;
 geometry():{w:number;h:number;left:number;top:number;trackHeight:number;trackOffset:number};
 peaks(channel:Float32Array|PeakChannel,from:number,to:number):[number,number];destroy():void;
}

export const waveformShader:string;
