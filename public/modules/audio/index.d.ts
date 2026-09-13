export interface PCMAsset {id:string;name:string;channels:Float32Array[];sampleRate:number;duration:number;demo?:boolean;}
export interface Effects {chain?:ProcessingInsert[];bypass:boolean;output:number;preset?:string;eq:{enabled:boolean;low:number;mid:number;high:number;frequency:number;q:number};compressor:{enabled:boolean;threshold:number;ratio:number;attack:number;release:number;makeup:number};limiter:{enabled:boolean;ceiling:number;release:number};}
export interface Track {id:string;name:string;gain:number;pan:number;mute:boolean;solo:boolean;color?:string;}
export interface Clip {id:string;name:string;trackId:string;assetId:string;start:number;offset:number;duration:number;gain:number;fadeIn:number;fadeOut:number;mute?:boolean;fadeSource?:{offset:number;duration:number;fadeIn:number;fadeOut:number};automation?:Array<{time:number;value:number}>;}
export interface AudioProject {tracks:Track[];clips:Clip[];effects:Effects;}
export interface Analysis {samplePeak:number;truePeak?:number;momentaryMax?:number|null;shortTermMax?:number|null;loudnessRange?:number|null;rms:number;integrated:number|null;dc:number;clipped:number;correlation:number;duration:number;frames:number;channels:number;sampleRate:number;loudnessHistory:number[];spectrum:number[];}
export interface WavOptions {bits?:16|24|32;float?:boolean;dither?:boolean;metadata?:{title?:string;artist?:string;comment?:string};}
export function defaultEffects():Effects;
export function dbToGain(db:number):number;
export function gainToDb(gain:number):number;
export function clamp(x:number,min:number,max:number):number;
export function coefficients(type:'peak'|'lowshelf'|'highshelf'|'highpass'|'lowpass',hz:number,gain:number,q:number,sampleRate:number):number[];
export class Biquad {constructor(coefficients:number[]);c:number[];z1:number;z2:number;tick(sample:number):number;}
export class MasterProcessor {constructor(sampleRate:number,channels?:number,config?:Effects);readonly delay:number;setConfig(config:Effects):void;process(input:Float32Array[],output:Float32Array[]):void;}
export function processMaster(channels:Float32Array[],sampleRate:number,config:Effects):Float32Array[];
export function editPCM(channels:Float32Array[],startFrame:number,endFrame:number,action:'trim'|'delete'|'silence'|'reverse'|'invert'|'gain'|'normalize'|'fadeIn'|'fadeOut'|'dc',amount?:number):Float32Array[];
export function linkedNormalize(channels:Float32Array[],targetDb?:number):Float32Array[];
export function mixMontage(project:AudioProject,assets:Map<string,PCMAsset>,sampleRate?:number,start?:number,end?:number|null):Float32Array[];
export function encodeWav(channels:Float32Array[],sampleRate:number,options?:WavOptions):ArrayBuffer;
export function decodeWav(buffer:ArrayBuffer):Pick<PCMAsset,'channels'|'sampleRate'|'duration'>;
export function analyze(channels:Float32Array[],sampleRate:number,options?:{measureTruePeak?:boolean;channelWeights?:number[]}):Analysis;
export function spectrum(channels:Float32Array[],start?:number,size?:number):Float32Array;
export function fft(real:Float64Array,imag?:Float64Array):{real:Float64Array;imag:Float64Array};
export function createDemo():PCMAsset;
export class AudioEngine extends EventTarget {constructor();assets:Map<string,PCMAsset|StreamedAsset>;context?:AudioContext;position:number;playing:boolean;init():Promise<void>;import(file:File):Promise<PCMAsset|StreamedAsset>;addAsset<T extends PCMAsset|StreamedAsset>(asset:T):T;job(action:string,args:unknown):Promise<any>;getPosition():number;play(project:AudioProject,position?:number,options?:{end?:number;loop?:boolean}):Promise<void>;updateEffects(config:Effects):void;pause():void;stop():void;record():Promise<void>;stopRecording():Promise<File>;dispose():Promise<void>;}

export interface PeakChannel {length:number;byteLength:0;peakBlock:number;min:Float32Array;max:Float32Array;}
export interface PCMDescriptor {sampleRate:number;channels:number;frames:number;dataOffset?:number;dataBytes?:number;}
export interface PCMProvider {descriptor:PCMDescriptor;readFrames(start:number,count:number):Promise<Float32Array[]>;}
export interface StreamedAsset {id:string;name:string;sampleRate:number;duration:number;channels:PeakChannel[];provider:WavPCMProvider;file?:Blob;remoteProjectId?:string;}
export class MemoryPCMProvider implements PCMProvider {constructor(asset:PCMAsset);descriptor:PCMDescriptor;readFrames(start:number,count:number):Promise<Float32Array[]>;}
export class WavPCMProvider implements PCMProvider {static open(source:Blob|string):Promise<WavPCMProvider>;descriptor:PCMDescriptor;analysis?:Analysis;readFrames(start:number,count:number):Promise<Float32Array[]>;index(options?:{blockSize?:number;onProgress?:(fraction:number)=>void;signal?:AbortSignal}):Promise<PeakChannel[]>;}
export class LoudnessMeter {constructor(rate:number,channels?:number,options?:{channelWeights?:number[]});push(channels:Float32Array[]):this;result():Omit<Analysis,'spectrum'>;}
export class TruePeakMeter {constructor(channels?:number);push(channels:Float32Array[],final?:boolean):this;finish():number;}
export function truePeak(channels:Float32Array[]):number;
export interface DeliveryReport {target:number;ceiling:number;gainDb:number;peakLimited:boolean;before:Analysis;}
export function prepareDelivery(channels:Float32Array[],sampleRate:number,options?:{target?:number;ceiling?:number}):{channels:Float32Array[];report:DeliveryReport};
export function spectralProcess(channels:Float32Array[],sampleRate:number,options?:{mask?:SpectralMask|null;operation?:'denoise'|'gate'|'attenuate'|'repair';fftSize?:number;noiseStart?:number;noiseEnd?:number;reduction?:number;threshold?:number;start?:number;end?:number;lowHz?:number;highHz?:number;amount?:number}):Float32Array[];
export function spectralInterpolate(channels:Float32Array[],sampleRate:number,options:{mask?:SpectralMask|null;start:number;end:number;lowHz?:number;highHz?:number;fftSize?:number}):Float32Array[];
export function deClick(channels:Float32Array[],sampleRate:number,options?:{threshold?:number;maxWidthMs?:number;start?:number;end?:number}):Float32Array[];
export function healSelection(channels:Float32Array[],sampleRate:number,options:{start:number;end:number;contextMs?:number}):Float32Array[];
export function timeStretch(channels:Float32Array[],sampleRate:number,ratio?:number,options?:{windowMs?:number;searchMs?:number}):Float32Array[];
export function sincResample(channels:Float32Array[],length:number,taps?:number):Float32Array[];
export function pitchShift(channels:Float32Array[],sampleRate:number,semitones:number):Float32Array[];
export interface PitchEstimate {frequency:number;midi:number;nearestMidi:number;cents:number;confidence:number;}
export function detectPitch(channels:Float32Array[],sampleRate:number,options?:{minHz?:number;maxHz?:number;start?:number;windowMs?:number}):PitchEstimate|null;
export function pitchCorrect(channels:Float32Array[],sampleRate:number,options?:{targetMidi?:number;strength?:number}):{channels:Float32Array[];detected:PitchEstimate;targetMidi:number};
export function readAsset(asset:PCMAsset|StreamedAsset,start:number,count:number):Promise<Float32Array[]>;
export function mixBlock(project:AudioProject,assets:Map<string,PCMAsset|StreamedAsset>,rate:number,startFrame:number,frames:number):Promise<Float32Array[]>;
export interface StreamingOptions extends WavOptions {blockSize?:number;signal?:AbortSignal;onProgress?:(fraction:number)=>void;seed?:number;}
export function renderBlocks(project:AudioProject,assets:Map<string,PCMAsset|StreamedAsset>,rate:number,start:number,end:number,options?:StreamingOptions):AsyncGenerator<Float32Array[]>;
export function wavHeader(frames:number,rate:number,channels?:number,bits?:16|24|32,float?:boolean):ArrayBuffer;
export function renderToSink(project:AudioProject,assets:Map<string,PCMAsset|StreamedAsset>,rate:number,start:number,end:number,sink:{write(data:ArrayBuffer):Promise<void>;close():Promise<void>;abort?(error?:unknown):Promise<void>},options?:StreamingOptions):Promise<Omit<Analysis,'spectrum'>>;
export function crc32(bytes:Uint8Array):number;
export function zipFiles(files:Array<[string,string|ArrayBuffer|Uint8Array]>):Uint8Array;
export function makeCue(options:{title?:string;artist?:string;tracks:Array<{time:number;name?:string;isrc?:string}>;duration:number;filename?:string;catalog?:string}):{cue:string;tracks:Array<{time:number;name?:string;isrc?:string;sector:number;actualTime:number;roundingSeconds:number}>;sectors:number};
export function encodeADM(channels:Float32Array[],sampleRate:number,objects:Array<{name?:string;azimuth?:number;elevation?:number;distance?:number}>,options?:{title?:string;bw64?:boolean}):{buffer:ArrayBuffer;xml:string;objects:number;frames:number};

export type InsertType='eq'|'compressor'|'limiter'|'gain'|'highpass'|'lowpass'|'stereo'|'native';
export interface ProcessingInsert {id:string;type:InsertType;enabled:boolean;wet:number;params:Record<string,number|string|string[]>;}
export const INSERTS:Record<InsertType,{name:string;params:Record<string,[number,number,number,number]>}>;
export function createInsert(type:InsertType,id:string):ProcessingInsert;
export function legacyChain(effects:Effects):ProcessingInsert[];
export function validateChain(chain:unknown):ProcessingInsert[];
export function hasNativeInserts(effects:Effects):boolean;
export function processingLatency(effects:Effects,rate:number):number;
export function bakeClipModifiers(channels:Float32Array[],clip:Clip,sampleRate:number):Float32Array[];
export interface SpectralPoint {time:number;hz:number;}
export interface SpectralMask {nyquist:number;shapes:Array<{type:'rectangle'|'polygon'|'brush';operation:'add'|'subtract';points:SpectralPoint[];radiusTime?:number;radiusFrequency?:number}>;}
export function spectralMaskBounds(mask:SpectralMask|null):{start:number;end:number;lowHz:number;highHz:number}|null;
export function validateSpectralMask(mask:unknown):SpectralMask;
export function prepareSpectralMask(mask:SpectralMask):unknown;
export function spectralMaskColumn(prepared:unknown,time:number):unknown;
export function spectralMaskWeight(column:unknown,hz:number,nyquist:number):number;

export function readSpectrogramWindows(asset:PCMAsset|StreamedAsset,startFrame:number,frameCount:number,width:number,options?:{windowSize?:1024;isCanceled?:()=>boolean}):Promise<{channels:Float32Array[];windowSize:number}>;
