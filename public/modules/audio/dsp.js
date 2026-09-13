import {validateChain, processingLatency} from './chain-config.js';
/** Auralis DSP — dependency-free, planar Float32 PCM, sample-rate explicit. */
export const dbToGain = db => 10 ** (db / 20);
export const gainToDb = gain => 20 * Math.log10(Math.max(1e-12, gain));
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const defaultEffects = () => ({ bypass: false, eq: { enabled: true, low: 0, mid: 0, high: 0, frequency: 1200, q: 0.7 }, compressor: { enabled: false, threshold: -18, ratio: 3, attack: 10, release: 120, makeup: 0 }, limiter: { enabled: true, ceiling: -1, release: 80 }, output: 0 });
export function coefficients(type, hz, gain, q, sampleRate) {
    const w = 2 * Math.PI * clamp(hz, 10, sampleRate * .49) / sampleRate, c = Math.cos(w), s = Math.sin(w), A = 10 ** (gain / 40), alpha = s / (2 * Math.max(.05, q)), b = 2 * Math.sqrt(A) * alpha;
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowshelf') {
        b0 = A * ((A + 1) - (A - 1) * c + b);
        b1 = 2 * A * ((A - 1) - (A + 1) * c);
        b2 = A * ((A + 1) - (A - 1) * c - b);
        a0 = (A + 1) + (A - 1) * c + b;
        a1 = -2 * ((A - 1) + (A + 1) * c);
        a2 = (A + 1) + (A - 1) * c - b;
    }
    else if (type === 'highshelf') {
        b0 = A * ((A + 1) + (A - 1) * c + b);
        b1 = -2 * A * ((A - 1) + (A + 1) * c);
        b2 = A * ((A + 1) + (A - 1) * c - b);
        a0 = (A + 1) - (A - 1) * c + b;
        a1 = 2 * ((A - 1) - (A + 1) * c);
        a2 = (A + 1) - (A - 1) * c - b;
    }
    else if (type === 'lowpass') {
        b0=(1-c)/2;b1=1-c;b2=(1-c)/2;a0=1+alpha;a1=-2*c;a2=1-alpha;
    }
    else if (type === 'highpass') {
        b0 = (1 + c) / 2;
        b1 = -(1 + c);
        b2 = (1 + c) / 2;
        a0 = 1 + alpha;
        a1 = -2 * c;
        a2 = 1 - alpha;
    }
    else {
        b0 = 1 + alpha * A;
        b1 = -2 * c;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * c;
        a2 = 1 - alpha / A;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export class Biquad {
    constructor(coeff) { this.c = coeff; this.z1 = 0; this.z2 = 0; }
    tick(x) { const [b0, b1, b2, a1, a2] = this.c; const y = b0 * x + this.z1; this.z1 = b1 * x - a1 * y + this.z2; this.z2 = b2 * x - a2 * y; return y; }
}
/** Linked-channel streaming processor. Limiter has fixed 5 ms lookahead. */
export class LegacyMasterProcessor {
    constructor(sampleRate, channels = 2, config = defaultEffects(), lookahead = true) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.delay = lookahead ? Math.max(1, Math.ceil(sampleRate * .005)) : 0;
        this.ring = Array.from({ length: channels }, () => new Float64Array(this.delay + 1));
        this.index = 0;
        this.envelope = 0;
        this.limitGain = 1;
        this.queueValues = new Float64Array(this.delay + 2);
        this.queueIndices = new Float64Array(this.delay + 2);
        this.qStart = 0;
        this.qEnd = 0;
        this.values = new Float64Array(channels);
        this.setConfig(config);
    }
    setConfig(config) {
        const previous = this.config;
        this.config = { ...config, eq: { ...config.eq }, compressor: { ...config.compressor }, limiter: { ...config.limiter } };
        if (this.filters && JSON.stringify(previous.eq) === JSON.stringify(config.eq))
            return;
        const old = this.filters;
        const e = config.eq;
        this.filters = Array.from({ length: this.channels }, () => [new Biquad(coefficients('lowshelf', 120, e.low, .707, this.sampleRate)), new Biquad(coefficients('peak', e.frequency, e.mid, e.q, this.sampleRate)), new Biquad(coefficients('highshelf', 8000, e.high, .707, this.sampleRate))]);
        if (old)
            for (let ch = 0; ch < this.channels; ch++)
                for (let j = 0; j < 3; j++) {
                    this.filters[ch][j].z1 = old[ch][j].z1;
                    this.filters[ch][j].z2 = old[ch][j].z2;
                }
    }
    process(input, output) {
        const cfg = this.config, comp = cfg.compressor, lim = cfg.limiter;
        const ca = Math.exp(-1 / (Math.max(.1, comp.attack) * .001 * this.sampleRate)), cr = Math.exp(-1 / (Math.max(5, comp.release) * .001 * this.sampleRate)), lr = Math.exp(-1 / (Math.max(5, lim.release) * .001 * this.sampleRate));
        const outGain = dbToGain(cfg.output), ceil = dbToGain(lim.ceiling);
        const vals = this.values;
        for (let i = 0; i < output[0].length; i++) {
            let p = 0;
            for (let ch = 0; ch < this.channels; ch++) {
                let x = input[ch]?.[i] ?? input[0]?.[i] ?? 0;
                if (!Number.isFinite(x))
                    x = 0;
                if (!cfg.bypass && cfg.eq.enabled)
                    for (const f of this.filters[ch])
                        x = f.tick(x);
                vals[ch] = x;
                p = Math.max(p, Math.abs(x));
            }
            const coef = p > this.envelope ? ca : cr;
            this.envelope = coef * this.envelope + (1 - coef) * p;
            const over = Math.max(0, gainToDb(this.envelope) - comp.threshold);
            const cg = !cfg.bypass && comp.enabled ? dbToGain(-over * (1 - 1 / Math.max(1, comp.ratio)) + comp.makeup) : 1;
            p = 0;
            for (let ch = 0; ch < this.channels; ch++) {
                vals[ch] *= cg * (cfg.bypass ? 1 : outGain);
                p = Math.max(p, Math.abs(vals[ch]));
                this.ring[ch][this.index % (this.delay + 1)] = vals[ch];
            }
            const qn = this.queueValues.length;
            while (this.qEnd > this.qStart && this.queueValues[(this.qEnd - 1) % qn] <= p)
                this.qEnd--;
            this.queueValues[this.qEnd % qn] = p;
            this.queueIndices[this.qEnd % qn] = this.index;
            this.qEnd++;
            while (this.qEnd > this.qStart && this.queueIndices[this.qStart % qn] < this.index - this.delay)
                this.qStart++;
            const target = !cfg.bypass && lim.enabled ? Math.min(1, ceil / Math.max(1e-12, this.queueValues[this.qStart % qn])) : 1;
            this.limitGain = cfg.bypass || !lim.enabled ? 1 : target < this.limitGain ? target : lr * this.limitGain + (1 - lr) * target;
            for (let ch = 0; ch < this.channels; ch++)
                output[ch][i] = this.index >= this.delay ? this.ring[ch][(this.index - this.delay) % (this.delay + 1)] * this.limitGain : 0;
            this.index++;
        }
    }
}
/** Ordered inserts with independent states and latency-aligned dry/wet paths. */
export class MasterProcessor {
 constructor(sampleRate,channels=2,config=defaultEffects()){this.sampleRate=sampleRate;this.channels=channels;this.stages=[];this.setConfig(config);}
 setConfig(config){
  if(!Array.isArray(config.chain)){this.stages=[];if(!this.legacy)this.legacy=new LegacyMasterProcessor(this.sampleRate,this.channels,config);else this.legacy.setConfig(config);this.delay=this.legacy.delay;this.config=config;return;}
  validateChain(config.chain);if(config.chain.some(n=>n.type==='native'&&n.enabled&&n.wet>0)&&!config.bypass)throw Error('Native inserts require the standalone companion render/audition path.');this.legacy=null;this.config=config;const old=new Map(this.stages.map(s=>[s.node.id,s]));
  this.stages=config.chain.map(node=>{const prior=old.get(node.id),s=prior?.node.type===node.type?prior:{node:null,index:0};s.node={...node,params:{...node.params}};s.bypass=config.bypass||!node.enabled;s.delay=node.type==='limiter'?Math.max(1,Math.ceil(this.sampleRate*.005)):0;
   if(node.type==='native'&&!s.bypass&&node.wet>0)throw Error('Native inserts require the standalone companion render/audition path.');
   if(['eq','compressor','limiter','gain'].includes(node.type)){const cfg=defaultEffects();cfg.eq.enabled=false;cfg.compressor.enabled=false;cfg.limiter.enabled=false;cfg.output=0;cfg.bypass=s.bypass;if(node.type==='gain')cfg.output=node.params.gain;else cfg[node.type]={...node.params,enabled:true};if(s.processor)s.processor.setConfig(cfg);else s.processor=new LegacyMasterProcessor(this.sampleRate,this.channels,cfg,node.type==='limiter');}
   if(['highpass','lowpass'].includes(node.type)){const coeff=coefficients(node.type,node.params.frequency,0,node.params.q,this.sampleRate);if(s.filters)s.filters.forEach(f=>f.c=coeff);else s.filters=Array.from({length:this.channels},()=>new Biquad(coeff));}
   if(s.delay&&!s.dry)s.dry=Array.from({length:this.channels},()=>new Float64Array(s.delay+1));return s;});this.delay=processingLatency(config,this.sampleRate);
 }
 process(input,output){if(this.legacy){this.legacy.process(input,output);return;}const n=output[0].length;
  if(this.capacity!==n){this.capacity=n;this.buffers=[0,1].map(()=>Array.from({length:this.channels},()=>new Float32Array(n)));}
  let current=input;
  for(let j=0;j<this.stages.length;j++){const s=this.stages[j],node=s.node,next=this.buffers[j%2],wet=s.bypass?0:node.wet;
   if(s.processor)s.processor.process(current,next);
   else for(let i=0;i<n;i++){const l=current[0]?.[i]||0,r=current[1]?.[i]??l;for(let ch=0;ch<this.channels;ch++){let v=current[ch]?.[i]??l;v=Number.isFinite(v)?v:0;if(s.filters&&!s.bypass)v=s.filters[ch].tick(v);if(node.type==='stereo'&&!s.bypass&&this.channels===2){const mid=(l+r)/2,side=(l-r)/2*node.params.width;v=(ch===0?mid+side:mid-side)*(ch===0?Math.min(1,1-node.params.balance):Math.min(1,1+node.params.balance));}next[ch][i]=v;}}
   for(let i=0;i<n;i++){for(let ch=0;ch<this.channels;ch++){let dry=current[ch]?.[i]??current[0]?.[i]??0;dry=Number.isFinite(dry)?dry:0;if(s.delay){s.dry[ch][s.index%(s.delay+1)]=dry;dry=s.index>=s.delay?s.dry[ch][(s.index-s.delay)%(s.delay+1)]:0;}next[ch][i]=dry+(next[ch][i]-dry)*wet;}s.index++;}current=next;
  }
  for(let ch=0;ch<this.channels;ch++)for(let i=0;i<n;i++)output[ch][i]=Number.isFinite(current[ch]?.[i]??current[0]?.[i])?(current[ch]?.[i]??current[0][i]):0;
 }
}
export function processMaster(channels, sampleRate, config) { const p = new MasterProcessor(sampleRate, channels.length, config), n = channels[0].length; const out = channels.map(() => new Float32Array(n + p.delay)); const input = channels.map(c => { const a = new Float32Array(n + p.delay); a.set(c); return a; }); p.process(input, out); return out.map(c => c.slice(p.delay)); }
export function editPCM(channels, start, end, action, amount = 0) {
    const n = channels[0].length;
    start = clamp(Math.floor(start), 0, n);
    end = clamp(Math.floor(end), start, n);
    if (end <= start)
        throw Error('Select an audio range first.');
    return channels.map(ch => {
        if (action === 'trim')
            return ch.slice(start, end);
        if (action === 'delete') {
            const out = new Float32Array(n - (end - start));
            out.set(ch.subarray(0, start));
            out.set(ch.subarray(end), start);
            return out;
        }
        const out = ch.slice();
        const len = end - start;
        let peak = 0, sum = 0;
        if (action === 'normalize')
            for (let i = start; i < end; i++)
                peak = Math.max(peak, Math.abs(ch[i]));
        if (action === 'dc')
            for (let i = start; i < end; i++)
                sum += ch[i];
        for (let i = start; i < end; i++) {
            const t = len > 1 ? (i - start) / (len - 1) : 1;
            if (action === 'silence')
                out[i] = 0;
            else if (action === 'reverse')
                out[i] = ch[end - 1 - (i - start)];
            else if (action === 'invert')
                out[i] = -ch[i];
            else if (action === 'gain')
                out[i] = ch[i] * dbToGain(amount);
            else if (action === 'normalize')
                out[i] = ch[i] * dbToGain(amount) / Math.max(peak, 1e-12);
            else if (action === 'fadeIn')
                out[i] = ch[i] * t;
            else if (action === 'fadeOut')
                out[i] = ch[i] * (1 - t);
            else if (action === 'dc')
                out[i] = ch[i] - sum / len;
            else
                throw Error('Unsupported PCM operation.');
        }
        return out;
    });
}
export function linkedNormalize(channels, target = -1) {
    let peak = 0;
    for (const c of channels)
        for (const x of c)
            peak = Math.max(peak, Math.abs(x));
    return channels.map(c => c.map(x => x * dbToGain(target) / Math.max(peak, 1e-12)));
}
export function mixMontage(project, assets, sampleRate = 48000, start = 0, end = null) {
    const audible = project.tracks.filter(t => !t.mute && (!project.tracks.some(s => s.solo) || t.solo));
    const duration = end ?? Math.max(1, ...project.clips.map(c => c.start + c.duration));
    const startFrame = Math.round(start * sampleRate), endFrame = Math.round(duration * sampleRate);
    const length = Math.max(1, endFrame - startFrame);
    if (length > sampleRate * 60 * 30)
        throw Error('Render range is limited to 30 minutes.');
    const out = [new Float32Array(length), new Float32Array(length)];
    for (const clip of project.clips) {
        const track = audible.find(t => t.id === clip.trackId);
        if (!track || clip.mute)
            continue;
        const a = assets.get(clip.assetId);
        if (!a)
            throw Error('Missing audio: ' + clip.name);
        const gain = dbToGain((clip.gain || 0) + (track.gain || 0)), pan = clamp(track.pan || 0, -1, 1);
        const clipStartFrame = Math.round(clip.start * sampleRate), clipEndFrame = Math.round((clip.start + clip.duration) * sampleRate);
        const from = Math.max(0, clipStartFrame - startFrame), to = Math.min(length, clipEndFrame - startFrame);
        for (let i = from; i < to; i++) {
            const local = (i + startFrame - clipStartFrame) / sampleRate, pos = (clip.offset + local) * a.sampleRate, ix = Math.floor(pos) - (a.startFrame || 0), f = pos - Math.floor(pos);
            let env = 1;
            const fade=clip.fadeSource||clip,fadeLocal=local+(clip.fadeSource?.offset||0);
            if(fade.fadeIn>0)env*=clamp(fadeLocal/fade.fadeIn,0,1);
            if(fade.fadeOut>0)env*=clamp((fade.duration-fadeLocal)/fade.fadeOut,0,1);
            if (clip.automation?.length) {
                const points = clip.automation;
                let v = points[0].value;
                for (let j = 1; j < points.length; j++) {
                    if (local <= points[j].time) {
                        const u = clamp((local - points[j - 1].time) / Math.max(1e-12, points[j].time - points[j - 1].time), 0, 1);
                        v = points[j - 1].value + (points[j].value - points[j - 1].value) * u;
                        break;
                    }
                    v = points[j].value;
                }
                env *= dbToGain(v);
            }
            const sample = ch => { if (a.sampleRate === sampleRate)
                return (ch[ix] || 0) * (1 - f) + (ch[ix + 1] || 0) * f; const cutoff = Math.min(1, sampleRate / a.sampleRate) * .96; let value = 0, weight = 0; for (let k = -15; k <= 16; k++) {
                const d = f - k, arg = Math.PI * d * cutoff, w = Math.abs(d) <= 16 ? .5 + .5 * Math.cos(Math.PI * d / 16) : 0, h = (Math.abs(arg) < 1e-12 ? cutoff : Math.sin(arg) / (Math.PI * d)) * w;
                value += (ch[ix + k] || 0) * h;
                weight += h;
            } return weight ? value / weight : 0; };
            const l = sample(a.channels[0]), r = a.channels.length > 1 ? sample(a.channels[1]) : l;
            const g = gain * env;
            if (a.channels.length === 1) {
                const theta = (pan + 1) * Math.PI / 4;
                out[0][i] += l * Math.cos(theta) * g;
                out[1][i] += l * Math.sin(theta) * g;
            }
            else if (pan <= 0) {
                const theta = (pan + 1) * Math.PI / 2;
                out[0][i] += (l + r * Math.cos(theta)) * g;
                out[1][i] += r * Math.sin(theta) * g;
            }
            else {
                const theta = pan * Math.PI / 2;
                out[0][i] += l * Math.cos(theta) * g;
                out[1][i] += (r + l * Math.sin(theta)) * g;
            }
        }
    }
    return out;
}

/** Bake clip fades/envelope before a destructive edit changes its time coordinate. */
export function bakeClipModifiers(channels,clip,sampleRate){
 const fade=clip.fadeSource||clip,points=clip.automation||[];let j=0;
 for(let i=0;i<channels[0].length;i++){const time=i/sampleRate,local=time+(clip.fadeSource?.offset||0);let gain=1;if(fade.fadeIn>0)gain*=clamp(local/fade.fadeIn,0,1);if(fade.fadeOut>0)gain*=clamp((fade.duration-local)/fade.fadeOut,0,1);
 if(points.length){while(j+1<points.length&&points[j+1].time<time)j++;let value=points[j].value;if(j+1<points.length){const next=points[j+1];value+=(next.value-value)*clamp((time-points[j].time)/Math.max(1e-12,next.time-points[j].time),0,1);}gain*=dbToGain(value);}for(const ch of channels)ch[i]*=gain;}
 return channels;
}
