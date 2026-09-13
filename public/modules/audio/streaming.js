import { MasterProcessor, mixMontage } from './dsp.js';
import { LoudnessMeter, spectrum } from './analysis.js';
import { encodeWav } from './wav.js';
export class MemoryPCMProvider {
    constructor(asset) { this.asset = asset; this.descriptor = { sampleRate: asset.sampleRate, channels: asset.channels.length, frames: asset.channels[0].length }; }
    async readFrames(start, count) { return this.asset.channels.map(c => c.slice(start, start + count)); }
}
/** A random-access RIFF PCM provider. Reads bounded byte ranges from Blob or authenticated HTTP. */
export class WavPCMProvider {
    constructor(source, descriptor) { this.source = source; this.descriptor = descriptor; }
    static async open(source) { const read = async (start, length) => { if (typeof source === 'string') {
        const r = await fetch(source, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
        if (r.status !== 206)
            throw Error('The audio server does not support ranged reads.');
        return r.arrayBuffer();
    } return source.slice(start, start + length).arrayBuffer(); }; const first = new DataView(await read(0, 12)), str = (v, o, n) => String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + o, n)); if (first.byteLength < 12 || str(first, 0, 4) !== 'RIFF' || str(first, 8, 4) !== 'WAVE')
        throw Error('Streaming import requires RIFF WAV PCM.'); let at = 12, fmt = null; for (let chunk = 0; chunk < 1000; chunk++) {
        const h = new DataView(await read(at, 8));
        if (h.byteLength < 8)
            break;
        const size = h.getUint32(4, true), tag = str(h, 0, 4);
        if (tag === 'fmt ') {
            const v = new DataView(await read(at + 8, Math.min(size, 40)));
            if (v.byteLength < 16)
                throw Error('Invalid WAV format.');
            let format = v.getUint16(0, true);
            if (format === 65534 && v.byteLength >= 40)
                format = v.getUint32(24, true);
            fmt = { format, channels: v.getUint16(2, true), sampleRate: v.getUint32(4, true), align: v.getUint16(12, true), bits: v.getUint16(14, true) };
        }
        if (tag === 'data') {
            if (!fmt || ![1, 3].includes(fmt.format) || ![1, 2].includes(fmt.channels) || ![16, 24, 32].includes(fmt.bits) || fmt.align !== fmt.channels * fmt.bits / 8 || (fmt.format === 3 && fmt.bits !== 32) || size % fmt.align || fmt.sampleRate < 8000 || fmt.sampleRate > 384000)
                throw Error('Unsupported streaming WAV format.');
            const provider = new WavPCMProvider(source, { ...fmt, frames: size / fmt.align, dataOffset: at + 8, dataBytes: size });
            provider.readBytes = read;
            return provider;
        }
        at += 8 + size + size % 2;
    } throw Error('WAV data chunk not found.'); }
    async readFrames(start, count) { const d = this.descriptor; start = Math.max(0, Math.floor(start)); count = Math.max(0, Math.min(Math.floor(count), d.frames - start)); if (count === 0)
        return Array.from({ length: d.channels }, () => new Float32Array(0)); if (count * d.align > 16 * 1024 * 1024)
        throw Error('PCM read exceeds the 16 MB block budget.'); const v = new DataView(await this.readBytes(d.dataOffset + start * d.align, count * d.align)); if (v.byteLength !== count * d.align)
        throw Error('Truncated audio range.'); const channels = Array.from({ length: d.channels }, () => new Float32Array(count)); for (let i = 0; i < count; i++)
        for (let c = 0; c < d.channels; c++) {
            const o = i * d.align + c * d.bits / 8;
            let x;
            if (d.format === 3)
                x = v.getFloat32(o, true);
            else if (d.bits === 16)
                x = v.getInt16(o, true) / 32768;
            else if (d.bits === 24) {
                let n = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16);
                if (n & 0x800000)
                    n -= 0x1000000;
                x = n / 8388608;
            }
            else
                x = v.getInt32(o, true) / 2147483648;
            channels[c][i] = Number.isFinite(x) ? x : 0;
        } return channels; }
    async index({ blockSize = 1024, onProgress, signal } = {}) { const d = this.descriptor, count = Math.ceil(d.frames / blockSize), views = Array.from({ length: d.channels }, () => ({ length: d.frames, byteLength: 0, peakBlock: blockSize, min: new Float32Array(count), max: new Float32Array(count) })); const meter = new LoudnessMeter(d.sampleRate, d.channels); let preview; for (let at = 0; at < d.frames; at += 65536) {
        signal?.throwIfAborted();
        const channels = await this.readFrames(at, Math.min(65536, d.frames - at));
        meter.push(channels);
        if (!preview)
            preview = channels;
        for (let c = 0; c < d.channels; c++)
            for (let i = 0; i < channels[c].length; i++) {
                const j = Math.floor((at + i) / blockSize), x = channels[c][i];
                views[c].min[j] = Math.min(views[c].min[j], x);
                views[c].max[j] = Math.max(views[c].max[j], x);
            }
        onProgress?.((at + channels[0].length) / d.frames);
        await new Promise(r => setTimeout(r, 0));
    } this.analysis = { ...meter.result(), spectrum: Array.from(spectrum(preview)) }; return views; }
}
export async function readAsset(asset, start, count) { if (!asset.provider)
    return asset.channels.map(c => c.slice(start, start + count)); if (count * asset.channels.length * 4 > 96 * 1024 * 1024)
    throw Error('PCM edit exceeds 96 MB. Trim the clip to a smaller region.'); const channels = asset.channels.map(() => new Float32Array(count)); for (let at = 0; at < count; at += 65536) {
    const part = await asset.provider.readFrames(start + at, Math.min(65536, count - at));
    part.forEach((c, i) => channels[i].set(c, at));
} return channels; }
/** Only clips intersecting this output block are read. Filter overlap is kept at both source edges. */
export async function mixBlock(project, assets, sampleRate, startFrame, frames) { const result = [new Float32Array(frames), new Float32Array(frames)], start = startFrame / sampleRate, end = (startFrame + frames) / sampleRate, solo = project.tracks.some(t => t.solo); for (const clip of project.clips) {
    const track = project.tracks.find(t => t.id === clip.trackId);
    if (!track || track.mute || clip.mute || (solo && !track.solo) || clip.start >= end || clip.start + clip.duration <= start)
        continue;
    const asset = assets.get(clip.assetId);
    if (!asset)
        throw Error('Missing audio: ' + clip.name);
    const from = Math.max(0, Math.floor((clip.offset + Math.max(0, start - clip.start)) * asset.sampleRate) - 32), to = Math.min(asset.channels[0].length, Math.ceil((clip.offset + Math.min(clip.duration, end - clip.start)) * asset.sampleRate) + 33), channels = await readAsset(asset, from, to - from), part = mixMontage({ ...project, clips: [clip] }, new Map([[clip.assetId, { ...asset, channels, startFrame: from }]]), sampleRate, start, end);
    for (let c = 0; c < 2; c++)
        for (let i = 0; i < frames; i++)
            result[c][i] += part[c][i];
} return result; }
/** Stateful master processing, latency trimmed once. Each yielded block is bounded. */
export async function* renderBlocks(project, assets, sampleRate, start, end, { blockSize = 8192, signal, onProgress } = {}) { const first = Math.round(start * sampleRate), length = Math.round(end * sampleRate) - first, processor = new MasterProcessor(sampleRate, 2, project.effects); if (length <= 0)
    throw Error('Empty render range.'); let skip = processor.delay; for (let at = 0; at < length + processor.delay; at += blockSize) {
    signal?.throwIfAborted();
    const count = Math.min(blockSize, length + processor.delay - at), valid = Math.min(count, Math.max(0, length - at)), input = [new Float32Array(count), new Float32Array(count)];
    if (valid) {
        const mixed = await mixBlock(project, assets, sampleRate, first + at, valid);
        input.forEach((c, i) => c.set(mixed[i]));
    }
    const output = input.map(() => new Float32Array(count));
    processor.process(input, output);
    const trim = Math.min(skip, count);
    skip -= trim;
    if (trim < count)
        yield output.map(c => c.subarray(trim));
    onProgress?.(Math.min(1, (at + count) / length));
} }
export function wavHeader(frames, sampleRate, channels = 2, bits = 24, float = false) { if (!Number.isSafeInteger(frames) || frames < 1 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000 || ![16, 24, 32].includes(bits) || (float && bits !== 32) || !Number.isInteger(channels) || channels < 1 || channels > 64)
    throw Error('Invalid WAV output format.'); const bytes = frames * channels * bits / 8; if (bytes > 0xffffffff - 36)
    throw Error('RIFF WAV exceeds 4 GiB. Split the render into regions.'); const b = new ArrayBuffer(44), v = new DataView(b), write = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0))); write(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); write(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * bits / 8, true); v.setUint16(32, channels * bits / 8, true); v.setUint16(34, bits, true); write(36, 'data'); v.setUint32(40, bytes, true); return b; }
/** Writes directly to a FileSystemWritableFileStream or any async sink, never assembles whole PCM. */
export async function renderToSink(project, assets, sampleRate, start, end, sink, options = {}) { const bits = options.bits || 24, float = !!options.float, frames = Math.round(end * sampleRate) - Math.round(start * sampleRate); const meter = new LoudnessMeter(sampleRate, 2); try {
    options.signal?.throwIfAborted();
    await sink.write(wavHeader(frames, sampleRate, 2, bits, float));
    let seed = options.seed ?? 0x41555241;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for await (const block of renderBlocks(project, assets, sampleRate, start, end, options)) {
        const quantized = block.map(c => new Float32Array(c.length));
        const bytes = new ArrayBuffer(block[0].length * 2 * bits / 8), v = new DataView(bytes);
        let at = 0;
        for (let i = 0; i < block[0].length; i++)
            for (let c = 0; c < 2; c++) {
                let x = block[c][i];
                if (float) {
                    v.setFloat32(at, x, true);
                    quantized[c][i] = x;
                }
                else {
                    const scale = 2 ** (bits - 1);
                    if (options.dither)
                        x += (random() - random()) / scale;
                    const n = Math.max(-scale, Math.min(scale - 1, Math.round(x * scale)));
                    quantized[c][i] = n / scale;
                    if (bits === 16)
                        v.setInt16(at, n, true);
                    else if (bits === 24) {
                        v.setUint8(at, n & 255);
                        v.setUint8(at + 1, (n >> 8) & 255);
                        v.setUint8(at + 2, (n >> 16) & 255);
                    }
                    else
                        v.setInt32(at, n, true);
                }
                at += bits / 8;
            }
        meter.push(quantized);
        await sink.write(bytes);
    }
    await sink.close();
    return meter.result();
}
catch (e) {
    await sink.abort?.(e);
    throw e;
} }

/** Sample FFT windows across the whole viewport with at most four source reads in flight. */
export async function readSpectrogramWindows(asset,startFrame,frameCount,width,{windowSize=1024,isCanceled=()=>false}={}){
 if(!Number.isInteger(width)||width<1||width>1000||windowSize!==1024||!Number.isFinite(startFrame)||startFrame<0||!Number.isFinite(frameCount)||frameCount<1)throw Error('Invalid spectrogram viewport.');
 const channels=asset.channels.map(()=>new Float32Array(width*windowSize));
 for(let x=0;x<width;x+=4){if(isCanceled())throw new DOMException('Spectrogram superseded','AbortError');const columns=await Promise.all(Array.from({length:Math.min(4,width-x)},async(_,i)=>{const at=Math.floor((x+i)/width*Math.max(0,frameCount-windowSize));return readAsset(asset,Math.round(startFrame)+at,Math.min(windowSize,Math.max(1,Math.floor(frameCount-at))));}));columns.forEach((column,i)=>column.forEach((ch,n)=>channels[n].set(ch,(x+i)*windowSize)));}
 return {channels,windowSize};
}
