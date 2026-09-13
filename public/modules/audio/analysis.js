import { Biquad, gainToDb } from './dsp.js';
export function fft(real, imag = new Float64Array(real.length)) {
    const n = real.length;
    if (n < 2 || (n & (n - 1)))
        throw Error('FFT size must be a power of two.');
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const a = -2 * Math.PI / len;
        for (let i = 0; i < n; i += len) {
            for (let j = 0; j < len / 2; j++) {
                const c = Math.cos(a * j), s = Math.sin(a * j), k = i + j + len / 2, tr = real[k] * c - imag[k] * s, ti = real[k] * s + imag[k] * c;
                real[k] = real[i + j] - tr;
                imag[k] = imag[i + j] - ti;
                real[i + j] += tr;
                imag[i + j] += ti;
            }
        }
    }
    return { real, imag };
}
export function spectrum(channels, start = 0, size = 2048) {
    const powers = new Float64Array(size / 2 + 1);
    for (const ch of channels) {
        const r = new Float64Array(size);
        for (let i = 0; i < size; i++)
            r[i] = (ch[start + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / size));
        const f = fft(r);
        for (let i = 0; i < powers.length; i++)
            powers[i] += (f.real[i] ** 2 + f.imag[i] ** 2) / channels.length;
    }
    return Float32Array.from(powers, (p, i) => gainToDb(Math.sqrt(p) * (i === 0 || i === size / 2 ? 1 : 2) / (size / 2)));
}
export function weighting(fs) { let k = Math.tan(Math.PI * 1681.974450955533 / fs), q = .7071752369554196, vh = 10 ** (3.999843853973347 / 20), vb = vh ** .4996667741545416, d = 1 + k / q + k * k; const a = [(vh + vb * k / q + k * k) / d, 2 * (k * k - vh) / d, (vh - vb * k / q + k * k) / d, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d]; k = Math.tan(Math.PI * 38.13547087602444 / fs); q = .5003270373238773; d = 1 + k / q + k * k; return [new Biquad(a), new Biquad([1, -2, 1, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d])]; }
const loud = e => e > 0 ? -.691 + 10 * Math.log10(e) : -Infinity;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const percentile = (a, q) => { const x = (a.length - 1) * q, i = Math.floor(x); return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (x - i); };
/** Bounded-memory BS.1770 K-weighting/gating. channelWeights exclude LFE and weight surrounds. */
export class LoudnessMeter {
    constructor(sampleRate, channelCount = 2, { channelWeights } = {}) { this.sampleRate = sampleRate; this.count = channelCount; this.weights = channelWeights || Array(channelCount).fill(1); if (this.weights.length !== channelCount)
        throw Error('Channel weight count mismatch.'); this.filters = Array.from({ length: channelCount }, () => weighting(sampleRate)); this.shortSize = Math.round(sampleRate * 3); this.momentSize = Math.round(sampleRate * .4); this.hop = Math.round(sampleRate * .1); this.ring = new Float64Array(this.shortSize); this.frames = 0; this.moment = 0; this.short = 0; this.blocks = []; this.shortBlocks = []; this.maxM = 0; this.maxS = 0; this.peak = 0; this.sum = 0; this.dc = 0; this.clipped = 0; this.lr = 0; this.ll = 0; this.rr = 0; }
    push(channels) { if (channels.length !== this.count || channels.some(c => c.length !== channels[0].length))
        throw Error('PCM channel mismatch.'); for (let i = 0; i < channels[0].length; i++) {
        let energy = 0;
        for (let c = 0; c < this.count; c++) {
            const x = channels[c][i];
            if (!Number.isFinite(x))
                throw Error('Non-finite PCM sample.');
            const f = this.filters[c], y = f[1].tick(f[0].tick(x));
            energy += y * y * this.weights[c];
            this.peak = Math.max(this.peak, Math.abs(x));
            this.sum += x * x;
            this.dc += x;
            if (Math.abs(x) >= 1)
                this.clipped++;
        }
        if (this.count >= 2) {
            const l = channels[0][i], r = channels[1][i];
            this.lr += l * r;
            this.ll += l * l;
            this.rr += r * r;
        }
        const t = this.frames, slot = t % this.shortSize;
        this.short += energy - this.ring[slot];
        this.moment += energy - (t >= this.momentSize ? this.ring[(t - this.momentSize) % this.shortSize] : 0);
        this.ring[slot] = energy;
        this.frames++;
        if (this.frames >= this.momentSize) {
            const p = Math.max(0, this.moment / this.momentSize);
            this.maxM = Math.max(this.maxM, p);
            if ((this.frames - this.momentSize) % this.hop === 0)
                this.blocks.push(p);
        }
        if (this.frames >= this.shortSize) {
            const p = Math.max(0, this.short / this.shortSize);
            this.maxS = Math.max(this.maxS, p);
            if ((this.frames - this.shortSize) % this.hop === 0)
                this.shortBlocks.push(p);
        }
    } return this; }
    result() { const abs = this.blocks.filter(e => loud(e) > -70), relative = loud(mean(abs)) - 10, gated = abs.filter(e => loud(e) > relative), shortAbs = this.shortBlocks.filter(e => loud(e) > -70), shortGate = loud(mean(shortAbs)) - 20, lra = shortAbs.filter(e => loud(e) > shortGate).map(loud).sort((a, b) => a - b); return { integrated: gated.length ? loud(mean(gated)) : null, momentaryMax: this.maxM ? loud(this.maxM) : null, shortTermMax: this.maxS ? loud(this.maxS) : null, loudnessRange: lra.length ? percentile(lra, .95) - percentile(lra, .1) : null, samplePeak: gainToDb(this.peak), rms: gainToDb(Math.sqrt(this.sum / Math.max(1, this.frames * this.count))), dc: this.dc / Math.max(1, this.frames * this.count), clipped: this.clipped, correlation: this.count >= 2 ? this.lr / Math.max(1e-20, Math.sqrt(this.ll * this.rr)) : 1, frames: this.frames, duration: this.frames / this.sampleRate, sampleRate: this.sampleRate, channels: this.count, loudnessHistory: this.blocks.map(loud) }; }
}
const RADIUS = 32;
const phases = Array.from({ length: 7 }, (_, phase) => { const taps = []; let sum = 0; for (let k = -RADIUS; k <= RADIUS; k++) {
    const u = (phase + 1) / 8 - k, a = Math.PI * u, h = Math.abs(u) > RADIUS ? 0 : (Math.abs(a) < 1e-14 ? 1 : Math.sin(a) / a) * (.42 + .5 * Math.cos(Math.PI * u / RADIUS) + .08 * Math.cos(2 * Math.PI * u / RADIUS));
    taps.push(h);
    sum += h;
} return Float64Array.from(taps, h => h / sum); });
/** Eight-phase, 65-tap/phase Blackman sinc interpolator with zero-padded boundaries. */
export class TruePeakMeter {
    constructor(channelCount = 2) { this.count = channelCount; this.tail = Array.from({ length: channelCount }, () => new Float32Array(RADIUS * 2)); this.peak = 0; this.finished = false; }
    push(channels, final = false) { if (this.finished)
        throw Error('True-peak meter already finished.'); for (let c = 0; c < this.count; c++) {
        const previous = this.tail[c], input = channels[c], data = new Float32Array(previous.length + input.length + (final ? RADIUS * 2 : 0));
        data.set(previous);
        data.set(input, previous.length);
        for (const x of input)
            this.peak = Math.max(this.peak, Math.abs(x));
        const stop = data.length - RADIUS;
        for (let n = RADIUS; n < stop; n++) {
            for (const h of phases) {
                let y = 0;
                for (let k = 0; k < h.length; k++)
                    y += (data[n + k - RADIUS] || 0) * h[k];
                this.peak = Math.max(this.peak, Math.abs(y));
            }
        }
        this.tail[c] = data.slice(Math.max(0, stop - RADIUS));
    } if (final)
        this.finished = true; return this; }
    finish() { if (!this.finished)
        this.push(Array.from({ length: this.count }, () => new Float32Array(0)), true); return gainToDb(this.peak); }
}
export function truePeak(channels) { return new TruePeakMeter(channels.length).push(channels).finish(); }
export function analyze(channels, sampleRate, { measureTruePeak = false, channelWeights } = {}) { const result = new LoudnessMeter(sampleRate, channels.length, { channelWeights }).push(channels).result(); result.spectrum = Array.from(spectrum(channels, Math.max(0, Math.floor(channels[0].length * .35)))); if (measureTruePeak)
    result.truePeak = truePeak(channels); return result; }
/** Two-pass linked gain, followed by post-encoding verification in the render worker. */
export function prepareDelivery(channels, sampleRate, { target = -14, ceiling = -1 } = {}) { if (!Number.isFinite(target) || target < -36 || target > -5 || !Number.isFinite(ceiling) || ceiling < -12 || ceiling > 0)
    throw Error('Invalid delivery target.'); const before = analyze(channels, sampleRate, { measureTruePeak: true }); const requested = before.integrated === null ? 0 : target - before.integrated, applied = Math.min(requested, ceiling - before.truePeak - .01), gain = 10 ** (applied / 20); return { channels: channels.map(c => Float32Array.from(c, x => x * gain)), report: { target, ceiling, gainDb: applied, peakLimited: applied < requested - .001, before } }; }
