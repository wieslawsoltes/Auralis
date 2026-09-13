import {processingLatency,hasNativeInserts} from './chain-config.js';
export * from './chain-config.js';
export * from './spectral-mask.js';
import { WavPCMProvider, mixBlock } from './streaming.js';
import { randomId } from './ids.js';
import { decodeWav } from './wav.js';
import { dbToGain, clamp, MasterProcessor } from './dsp.js';
export * from './dsp.js';
export * from './wav.js';
export * from './analysis.js';
export * from './restoration.js';
export * from './streaming.js';
export * from './authoring.js';
export class AudioEngine extends EventTarget {
    constructor() {
        super();
        this.assets = new Map();
        this.bufferCache = new WeakMap();
        this.nodes = [];
        this.position = 0;
        this.playing = false;
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.pending = new Map();
        this.worker.onmessage = ({ data }) => {
            const p = this.pending.get(data.id);
            if (p) {
                data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
                this.pending.delete(data.id);
            }
        };
        this.worker.onerror = e => {
            for (const p of this.pending.values())
                p.reject(Error(e.message || 'Audio worker failed'));
            this.pending.clear();
        };
    }
    async init() { if (!this.initPromise)
        this.initPromise = (async () => { const ctx = this.context = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 }); this.workletAvailable = !!ctx.audioWorklet; if (this.workletAvailable)
            await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url)); this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = .8; this.split = ctx.createChannelSplitter(2); this.meters = [ctx.createAnalyser(), ctx.createAnalyser()]; this.meters.forEach(m => m.fftSize = 1024); })(); await this.initPromise; await this.context.resume(); }
    async import(file) {
        if (file.size > 32 * 1024 * 1024 && /\.wav$/i.test(file.name)) {
            const provider = await WavPCMProvider.open(file), d = provider.descriptor;
            if (d.frames / d.sampleRate > 86400)
                throw Error('Source exceeds 24 hours.');
            const channels = await provider.index();
            return this.addAsset({ id: randomId(), name: file.name, provider, channels, sampleRate: d.sampleRate, duration: d.frames / d.sampleRate, file });
        }
        if (file.size > 100 * 1024 * 1024)
            throw Error('Individual imports are limited to 100 MB.');
        const buffer = await file.arrayBuffer();
        let audio;
        try {
            audio = decodeWav(buffer);
        }
        catch {
            await this.init();
            const decoded = await this.context.decodeAudioData(buffer.slice(0));
            if (decoded.numberOfChannels > 2)
                throw Error('Import supports mono or stereo audio.');
            audio = { sampleRate: decoded.sampleRate, channels: Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c).slice()), duration: decoded.duration };
        }
        if (audio.duration > 1800)
            throw Error('Sources are limited to 30 minutes.');
        const total = [...this.assets.values()].reduce((s, a) => s + a.channels.reduce((n, c) => n + c.byteLength, 0), 0) + audio.channels.reduce((n, c) => n + c.byteLength, 0);
        if (total > 384 * 1024 * 1024)
            throw Error('Session decoded-audio limit is 384 MB.');
        const id = randomId();
        this.assets.set(id, { ...audio, id, name: file.name });
        return this.assets.get(id);
    }
    addAsset(asset) { this.assets.set(asset.id, asset); return asset; }
    job(action, args) { return new Promise((resolve, reject) => { const id = randomId(); this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, action, args }); }); }
    getPosition() {
        if (!this.playing)
            return this.position;
        const elapsed = Math.max(0, this.context.currentTime - this.startedAt - (this.latencySeconds||0));
        if (this.loopInfo)
            return this.loopInfo.start + elapsed % this.loopInfo.duration;
        return Math.min(this.finish, this.position + elapsed);
    }
    async play(project, position = this.position, { end, loop = false } = {}) {
        await this.init();
        this.pause();
        if (project.clips.some(c => this.assets.get(c.assetId)?.provider))
            return this.playStream(project, position, { end, loop });
        const ctx = this.context, finish = end ?? Math.max(0, ...project.clips.map(c => c.start + c.duration));
        position = Math.max(0, Math.min(position, finish));
        const duration = finish - position;
        if (duration <= 0)
            throw Error('No audio in the playback range.');
        if (loop && duration < .05)
            throw Error('Loop selection must be at least 50 ms.');
        this.position = position;
        this.finish = finish;
        this.topology=JSON.stringify(project.effects.chain?.map(n=>[n.id,n.type])||'legacy');this.latencySeconds=processingLatency(project.effects,ctx.sampleRate)/ctx.sampleRate;
        this.startedAt = ctx.currentTime + .025;
        this.loopInfo = loop ? { start: position, duration } : null;
        this.master = this.workletAvailable ? new AudioWorkletNode(ctx, 'auralis-master', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { config: project.effects } }) : this.createLegacyMaster(project.effects);
        this.master.connect(this.analyser);
        this.analyser.connect(ctx.destination);
        this.master.connect(this.split);
        this.meters.forEach((m, i) => this.split.connect(m, i));
        this.nodes.push(this.master);
        const solo = project.tracks.some(t => t.solo);
        const schedule = atStart => {
            for (const c of project.clips) {
                const t = project.tracks.find(t => t.id === c.trackId), a = this.assets.get(c.assetId);
                if (!t || !a || t.mute || c.mute || (solo && !t.solo) || c.start + c.duration <= position || c.start >= finish)
                    continue;
                const source = ctx.createBufferSource();
                let buf = this.bufferCache.get(a);
                if (!buf) {
                    buf = ctx.createBuffer(a.channels.length, a.channels[0].length, a.sampleRate);
                    a.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
                    this.bufferCache.set(a, buf);
                }
                source.buffer = buf;
                const gain = ctx.createGain(), fadeIn = ctx.createGain(), fadeOut = ctx.createGain(), automation = ctx.createGain(), panner = ctx.createStereoPanner();
                panner.pan.value = clamp(t.pan || 0, -1, 1);
                gain.gain.value = dbToGain((c.gain || 0) + (t.gain || 0));
                const skip = Math.max(0, position - c.start), at = atStart + Math.max(0, c.start - position), dur = Math.min(c.duration - skip, finish - Math.max(position, c.start));
                if (dur <= 0)
                    continue;
                const fades=c.fadeSource||c,fs=skip+(c.fadeSource?.offset||0);
                fadeIn.gain.setValueAtTime(fades.fadeIn?Math.min(1,fs/fades.fadeIn):1,at);
                if(fades.fadeIn>fs)fadeIn.gain.linearRampToValueAtTime(Math.min(1,(fs+dur)/fades.fadeIn),at+Math.min(dur,fades.fadeIn-fs));
                fadeOut.gain.setValueAtTime(fades.fadeOut?Math.min(1,(fades.duration-fs)/fades.fadeOut):1,at);
                if(fades.fadeOut){const tail=fades.duration-fades.fadeOut;if(tail>fs&&tail<fs+dur)fadeOut.gain.setValueAtTime(1,at+tail-fs);if(fs+dur>tail)fadeOut.gain.linearRampToValueAtTime(Math.max(0,(fades.duration-fs-dur)/fades.fadeOut),at+dur);}
                const points = c.automation || [];
                const atLocal = local => {
                    if (!points.length)
                        return 0;
                    let v = points[0].value;
                    for (let i = 1; i < points.length; i++) {
                        if (local <= points[i].time) {
                            const u = clamp((local - points[i - 1].time) / Math.max(.00001, points[i].time - points[i - 1].time), 0, 1);
                            return points[i - 1].value + (points[i].value - points[i - 1].value) * u;
                        }
                        v = points[i].value;
                    }
                    return v;
                };
                automation.gain.setValueAtTime(dbToGain(atLocal(skip)), at);
                for (const p of points)
                    if (p.time > skip && p.time < skip + dur)
                        automation.gain.exponentialRampToValueAtTime(dbToGain(p.value), at + p.time - skip);
                automation.gain.exponentialRampToValueAtTime(dbToGain(atLocal(skip + dur)), at + dur);
                source.connect(gain).connect(fadeIn).connect(fadeOut).connect(automation).connect(panner).connect(this.master);
                source.start(at, c.offset + skip, dur);
                const nodes = [source, gain, fadeIn, fadeOut, automation, panner];
                this.nodes.push(...nodes);
                source.onended = () => {
                    for (const node of nodes) {
                        try {
                            node.disconnect();
                        }
                        catch { }
                    }
                    this.nodes = this.nodes.filter(n => !nodes.includes(n));
                };
            }
        };
        this.playing = true;
        schedule(this.startedAt);
        if (loop) {
            let iteration = 1;
            const lookahead = () => {
                while (this.startedAt + iteration * duration < ctx.currentTime + .6) {
                    schedule(this.startedAt + iteration * duration);
                    iteration++;
                }
            };
            lookahead();
            this.loopTimer = setInterval(lookahead, 100);
        }
        else
            this.timer = setTimeout(() => { this.pause(); this.position = finish; this.dispatchEvent(new Event('ended')); }, Math.max(0, (finish - position + .025 + this.latencySeconds + .003) * 1000));
    }
    async playStream(project, position, { end, loop = false } = {}) { const ctx = this.context, finish = end ?? Math.max(...project.clips.map(c => c.start + c.duration)), length = finish - position; if (length <= 0)
        throw Error('Empty playback range.'); this.position = position; this.finish = finish; this.topology=JSON.stringify(project.effects.chain?.map(n=>[n.id,n.type])||'legacy');this.latencySeconds=processingLatency(project.effects,ctx.sampleRate)/ctx.sampleRate; this.startedAt = ctx.currentTime + .15; this.loopInfo = loop ? { start: position, duration: length } : null; const generation = this.streamGeneration = (this.streamGeneration || 0) + 1; this.master = this.workletAvailable ? new AudioWorkletNode(ctx, 'auralis-master', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { config: project.effects } }) : this.createLegacyMaster(project.effects); this.master.connect(this.analyser); this.analyser.connect(ctx.destination); this.master.connect(this.split); this.meters.forEach((m, i) => this.split.connect(m, i)); this.nodes.push(this.master); this.playing = true; let frame = Math.round(position * ctx.sampleRate), lastFrame = Math.round(finish * ctx.sampleRate), scheduled = this.startedAt, busy = false; const pump = async () => { if (busy || !this.playing || generation !== this.streamGeneration)
        return; busy = true; try {
        while (scheduled < ctx.currentTime + 1.5 && this.playing && generation === this.streamGeneration) {
            if (frame >= lastFrame) {
                if (loop)
                    frame = Math.round(position * ctx.sampleRate);
                else {
                    clearInterval(this.loopTimer);
                    this.timer = setTimeout(() => { if (generation !== this.streamGeneration)
                        return; this.pause(); this.position = finish; this.dispatchEvent(new Event('ended')); }, Math.max(0, (scheduled - ctx.currentTime + this.latencySeconds + .015) * 1000));
                    break;
                }
            }
            const count = Math.min(8192, lastFrame - frame), channels = await mixBlock(project, this.assets, ctx.sampleRate, frame, count);
            if (!this.playing || generation !== this.streamGeneration)
                return;
            if (scheduled < ctx.currentTime + .01) {
                this.dispatchEvent(new CustomEvent('buffering', { detail: { seconds: ctx.currentTime + .08 - scheduled } }));
                const gap = ctx.currentTime + .08 - scheduled;
                this.startedAt += gap;
                scheduled += gap;
            }
            const b = ctx.createBuffer(2, count, ctx.sampleRate);
            channels.forEach((c, i) => b.copyToChannel(c, i));
            const node = ctx.createBufferSource();
            node.buffer = b;
            node.connect(this.master);
            this.nodes.push(node);
            node.start(scheduled);
            node.onended = () => { node.disconnect(); this.nodes = this.nodes.filter(n => n !== node); };
            scheduled += count / ctx.sampleRate;
            frame += count;
        }
    }
    catch (error) {
        this.pause();
        this.dispatchEvent(new CustomEvent('error', { detail: error.message }));
    }
    finally {
        busy = false;
    } }; await pump(); if (this.playing && frame < lastFrame || loop)
        this.loopTimer = setInterval(pump, 60); }
    createLegacyMaster(config) { const node = this.context.createScriptProcessor(2048, 2, 2), dsp = new MasterProcessor(this.context.sampleRate, 2, config); node.onaudioprocess = e => dsp.process([e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1)], [e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1)]); node.port = { postMessage: msg => dsp.setConfig(msg.config) }; return node; }
    updateEffects(config) { if(hasNativeInserts(config)){this.pause();return;}if(this.playing&&(processingLatency(config,this.context.sampleRate)/this.context.sampleRate!==this.latencySeconds||JSON.stringify(config.chain?.map(n=>[n.id,n.type])||'legacy')!==this.topology)){this.pause();return;}this.master?.port.postMessage({ config }); }
    pause() {
        this.streamGeneration = (this.streamGeneration || 0) + 1;
        if (this.playing)
            this.position = Math.max(0, this.getPosition());
        this.playing = false;
        clearTimeout(this.timer);
        clearInterval(this.loopTimer);
        this.loopInfo = null;
        for (const node of this.nodes) {
            try {
                node.stop?.();
                node.disconnect();
            }
            catch { }
        }
        this.nodes = [];
        this.analyser?.disconnect();
        this.split?.disconnect();
    }
    stop() { this.pause(); this.position = 0; }
    async record() {
        await this.init();
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
        const chunks = [];
        this.recorder = new MediaRecorder(this.stream);
        this.recorded = new Promise((resolve, reject) => {
            this.recorder.ondataavailable = e => {
                if (e.data.size)
                    chunks.push(e.data);
            };
            this.recorder.onerror = e => reject(e.error || Error('Recording failed'));
            this.recorder.onstop = () => { this.stream.getTracks().forEach(t => t.stop()); resolve(new File(chunks, 'Recording ' + new Date().toISOString().replaceAll(':', '-') + '.webm', { type: this.recorder.mimeType })); };
        });
        this.recorder.start();
    }
    async stopRecording() { this.recorder.stop(); return this.recorded; }
    async dispose() { this.pause(); this.stream?.getTracks().forEach(t => t.stop()); this.worker.terminate(); await this.context?.close(); }
}
export function createDemo() {
    const sr = 32000, duration = 48, n = sr * duration;
    let seed = 391;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    const channels = [new Float32Array(n), new Float32Array(n)];
    const chords = [[130.81, 164.81, 196, 261.63], [110, 130.81, 164.81, 220], [87.31, 110, 130.81, 174.61], [98, 123.47, 146.83, 196]];
    for (let i = 0; i < n; i++) {
        const t = i / sr, beat = t % (60 / 92), chord = chords[Math.floor(t / 6) % 4], env = Math.min(1, t / 2, (duration - t) / 3), section = .55 + .2 * Math.sin(t * .25) ** 2;
        let pad = 0;
        for (const f of chord)
            pad += (Math.sin(2 * Math.PI * f * t) + .2 * Math.sin(4 * Math.PI * f * t)) * .038;
        const kick = Math.sin(2 * Math.PI * (45 * beat + 3 * (1 - Math.exp(-beat * 40)))) * Math.exp(-beat * 17) * .37;
        const hh = rand() * Math.exp(-(t % (30 / 92)) * 85) * .07;
        const bass = Math.sin(2 * Math.PI * chord[0] / 2 * t) * .12;
        channels[0][i] = (pad + kick + hh + bass) * env * section;
        channels[1][i] = (pad * .95 + kick + hh * .85 + bass + Math.sin(2 * Math.PI * chord[2] * 1.001 * t) * .018) * env * section;
    }
    return { id: 'demo-nocturne', name: 'Nocturne — original mix.wav', sampleRate: sr, channels, duration, demo: true };
}
