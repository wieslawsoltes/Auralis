import {prepareSpectralMask,spectralMaskColumn,spectralMaskWeight} from './spectral-mask.js';
import { fft } from './analysis.js';
import { clamp } from './dsp.js';
function inverse(r, i) { for (let k = 0; k < i.length; k++)
    i[k] = -i[k]; fft(r, i); for (let k = 0; k < r.length; k++)
    r[k] /= r.length; return r; }
const hann = n => Float64Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));
export function spectralProcess(channels, sampleRate, { operation = 'denoise', fftSize = 2048, noiseStart = 0, noiseEnd = .25, reduction = 12, threshold = -55, start = 0, end = Infinity, lowHz = 0, highHz = Infinity, amount = -18, mask = null } = {}) {
    if (operation === 'repair')
        return spectralInterpolate(channels, sampleRate, { start, end, lowHz, highHz, fftSize, mask });
    if (!Number.isInteger(fftSize) || fftSize < 256 || fftSize > 8192 || (fftSize & (fftSize - 1)))
        throw Error('FFT size must be a power of two from 256 to 8192.');
    const n = channels[0].length, hop = fftSize / 4, window = hann(fftSize), first = Math.max(0, Math.floor(start * sampleRate)), last = Math.min(n, Math.ceil(end * sampleRate)), floor = 10 ** (-Math.abs(reduction) / 20), noise = channels.map(() => new Float64Array(fftSize / 2 + 1));
    if (operation === 'denoise') {
        let count = 0;
        for (let at = Math.max(0, Math.floor(noiseStart * sampleRate)); at + fftSize <= Math.min(n, Math.floor(noiseEnd * sampleRate)); at += hop) {
            for (let c = 0; c < channels.length; c++) {
                const r = Float64Array.from({ length: fftSize }, (_, i) => (channels[c][at + i] || 0) * window[i]), z = fft(r);
                for (let k = 0; k <= fftSize / 2; k++)
                    noise[c][k] += z.real[k] ** 2 + z.imag[k] ** 2;
            }
            count++;
        }
        if (!count)
            throw Error('Noise profile must contain at least one FFT window.');
        for (const ch of noise)
            for (let k = 0; k < ch.length; k++)
                ch[k] /= count;
    }
    const prepared = mask ? prepareSpectralMask(mask) : null;
    const outputs = channels.map(() => new Float64Array(n)), norm = new Float64Array(n);
    let previous = channels.map(() => new Float64Array(fftSize / 2 + 1).fill(1));
    for (let at = -fftSize + hop; at < n; at += hop) {
        const column = prepared ? spectralMaskColumn(prepared, (at + fftSize / 2) / sampleRate) : null;
        for (let c = 0; c < channels.length; c++) {
            const r = Float64Array.from({ length: fftSize }, (_, i) => (channels[c][at + i] || 0) * window[i]), imag = new Float64Array(fftSize);
            fft(r, imag);
            for (let k = 0; k <= fftSize / 2; k++) {
                const hz = k * sampleRate / fftSize, power = r[k] * r[k] + imag[k] * imag[k], within = at + fftSize / 2 >= first && at + fftSize / 2 < last && hz >= lowHz && hz <= highHz;
                let gain = 1;
                if (within) {
                    if (operation === 'denoise') {
                        gain = Math.max(floor, Math.sqrt(Math.max(0, 1 - noise[c][k] * 1.3 / Math.max(1e-30, power))));
                        gain = .65 * gain + .35 * previous[c][k];
                    }
                    else if (operation === 'gate')
                        gain = 20 * Math.log10(Math.sqrt(power) / (fftSize / 4) + 1e-15) < threshold ? floor : 1;
                    else if (operation === 'attenuate')
                        gain = 10 ** (amount / 20);
                    else if (operation === 'repair') {
                        const left = Math.max(0, k - 3), right = Math.min(fftSize / 2, k + 3), target = (Math.hypot(r[left], imag[left]) + Math.hypot(r[right], imag[right])) / 2;
                        gain = Math.min(1, target / Math.max(1e-15, Math.sqrt(power)));
                    }
                    else
                        throw Error('Unknown spectral operation.');
                }
                previous[c][k] = gain;
                if (column) gain = 1 + spectralMaskWeight(column, hz, prepared.nyquist) * (gain - 1);
                r[k] *= gain;
                imag[k] *= gain;
                if (k > 0 && k < fftSize / 2) {
                    r[fftSize - k] *= gain;
                    imag[fftSize - k] *= gain;
                }
            }
            inverse(r, imag);
            for (let i = 0; i < fftSize; i++) {
                const pos = at + i;
                if (pos >= 0 && pos < n)
                    outputs[c][pos] += r[i] * window[i];
            }
        }
        for (let i = 0; i < fftSize; i++) {
            const pos = at + i;
            if (pos >= 0 && pos < n)
                norm[pos] += window[i] ** 2;
        }
    }
    return outputs.map((ch, c) => Float32Array.from(ch, (v, i) => i < first || i >= last ? channels[c][i] : norm[i] > 1e-12 ? v / norm[i] : channels[c][i]));
}
export function deClick(channels, sampleRate, { threshold = 6, maxWidthMs = 2, start = 0, end = Infinity } = {}) { const width = Math.max(1, Math.round(sampleRate * maxWidthMs / 1000)), radius = Math.max(width * 3, Math.round(sampleRate * .006)), begin = Math.max(radius, Math.round(start * sampleRate)), finish = Math.min(channels[0].length - radius, Math.round(end * sampleRate)); return channels.map(input => { const out = input.slice(); let i = begin; while (i < finish) {
    let sum = 0, count = 0;
    for (let j = i - radius; j < i - width; j += 4) {
        sum += Math.abs(input[j]);
        count++;
    }
    for (let j = i + width; j < i + radius; j += 4) {
        sum += Math.abs(input[j]);
        count++;
    }
    const scale = Math.max(.003, sum / Math.max(1, count)), limit = scale * threshold;
    if (Math.abs(input[i]) < limit) {
        i++;
        continue;
    }
    let stop = i + 1;
    while (stop < finish && Math.abs(input[stop]) >= limit)
        stop++;
    if (stop - i <= width) {
        const a = input[i - 1], b = input[stop];
        for (let j = i; j < stop; j++)
            out[j] = a + (b - a) * (j - i + 1) / (stop - i + 1);
    }
    i = stop;
} return out; }); }
function predict(context, count) { const n = context.length, order = Math.min(32, Math.floor(n / 4)), r = new Float64Array(order + 1); for (let k = 0; k <= order; k++)
    for (let i = k; i < n; i++)
        r[k] += context[i] * context[i - k]; r[0] += Math.max(1e-12, r[0] * 1e-6); const a = new Float64Array(order + 1); a[0] = 1; let error = r[0]; for (let k = 1; k <= order; k++) {
    let v = r[k];
    for (let j = 1; j < k; j++)
        v += a[j] * r[k - j];
    const reflection = clamp(-v / Math.max(error, 1e-20), -.999, .999), prev = a.slice();
    a[k] = reflection;
    for (let j = 1; j < k; j++)
        a[j] = prev[j] + reflection * prev[k - j];
    error *= 1 - reflection * reflection;
} const data = new Float64Array(n + count); data.set(context); let bound = .001; for (const x of context)
    bound = Math.max(bound, Math.abs(x) * 1.5); for (let i = n; i < data.length; i++) {
    let x = 0;
    for (let j = 1; j <= order; j++)
        x -= a[j] * data[i - j];
    data[i] = clamp(x, -bound, bound);
} return data.subarray(n); }
/** Forward/backward regularized linear prediction for gaps up to 200 ms. */
export function healSelection(channels, sampleRate, { start, end, contextMs = 40 } = {}) { const from = Math.round(start * sampleRate), to = Math.round(end * sampleRate); if (from < 32 || to > channels[0].length - 32 || to <= from)
    throw Error('Healing needs at least 32 samples before and after the selection.'); if (to - from > sampleRate * .2)
    throw Error('Prediction healing is limited to 200 ms.'); return channels.map(ch => { const out = ch.slice(), len = to - from, context = Math.max(128, Math.round(contextMs * sampleRate / 1000)), forward = predict(ch.slice(Math.max(0, from - context), from), len), back = predict(ch.slice(to, Math.min(ch.length, to + context)).reverse(), len); for (let i = 0; i < len; i++) {
    const mix = .5 - .5 * Math.cos(Math.PI * (i + 1) / (len + 1));
    out[from + i] = forward[i] * (1 - mix) + back[len - 1 - i] * mix;
} return out; }); }
/** Phase-aware interpolation between clean STFT boundary frames. */
export function spectralInterpolate(channels, sampleRate, { start, end, lowHz = 0, highHz = sampleRate / 2, fftSize = 2048, mask = null } = {}) { if (!(end > start) || start <= 0 || end >= channels[0].length / sampleRate || end - start > .5)
    throw Error('Select an internal region up to 500 ms for spectral interpolation.'); if (fftSize < 256 || fftSize > 8192 || (fftSize & (fftSize - 1)))
    throw Error('Invalid FFT size.'); const prepared = mask ? prepareSpectralMask(mask) : null; const first = Math.round(start * sampleRate), last = Math.round(end * sampleRate), N = fftSize, H = N / 4, w = hann(N), left = first - N, right = last, span = right - left; const wrap = x => x - 2 * Math.PI * Math.round(x / (2 * Math.PI)); return channels.map(ch => { const frame = at => fft(Float64Array.from({ length: N }, (_, j) => (ch[at + j] || 0) * w[j])); const l = frame(left), r = frame(right), pre = frame(left - H), post = frame(right + H), out = new Float64Array(ch.length), norm = new Float64Array(ch.length); for (let at = -N + H; at < ch.length; at += H) {
    const f = frame(at), u = clamp((at - left) / span, 0, 1), column = prepared ? spectralMaskColumn(prepared, (at + N / 2) / sampleRate) : null;
    if (at > left && at < right) {
        for (let k = 1; k < N / 2; k++) {
            const hz = k * sampleRate / N;
            if (hz < lowHz || hz > highHz)
                continue;
            const lm = Math.hypot(l.real[k], l.imag[k]), rm = Math.hypot(r.real[k], r.imag[k]), lp = Math.atan2(l.imag[k], l.real[k]), rp = Math.atan2(r.imag[k], r.real[k]), omega = 2 * Math.PI * k / N, omegaL = omega + wrap(lp - Math.atan2(pre.imag[k], pre.real[k]) - omega * H) / H, omegaR = omega + wrap(Math.atan2(post.imag[k], post.real[k]) - rp - omega * H) / H, expected = .5 * (omegaL + omegaR) * span, advance = expected + wrap(rp - lp - expected), phase = lp + u * advance, mag = Math.exp(Math.log(lm + 1e-15) * (1 - u) + Math.log(rm + 1e-15) * u);
            const weight = column ? spectralMaskWeight(column, hz, prepared.nyquist) : 1;
            f.real[k] += weight * (mag * Math.cos(phase) - f.real[k]);
            f.imag[k] += weight * (mag * Math.sin(phase) - f.imag[k]);
            f.real[N - k] = f.real[k];
            f.imag[N - k] = -f.imag[k];
        }
    }
    inverse(f.real, f.imag);
    for (let j = 0; j < N; j++) {
        const i = at + j;
        if (i >= 0 && i < ch.length) {
            out[i] += f.real[j] * w[j];
            norm[i] += w[j] * w[j];
        }
    }
} const feather = Math.min(H, Math.floor((last - first) / 4)); return Float32Array.from(ch, (x, i) => { if (i < first || i >= last)
    return x; const wet = norm[i] > 1e-12 ? out[i] / norm[i] : x, mix = 1; return x * (1 - mix) + wet * mix; }); }); }
/** WSOLA overlap-add; stretch ratio > 1 lengthens without intentionally changing pitch. */
export function timeStretch(channels, sampleRate, ratio = 1, { windowMs = 40, searchMs = 8 } = {}) {
    if (!Number.isFinite(ratio) || ratio < .25 || ratio > 4)
        throw Error('Stretch ratio must be between 0.25 and 4.');
    if (ratio === 1)
        return channels.map(c => c.slice());
    const n = channels[0].length, outLength = Math.max(1, Math.round(n * ratio)), win = Math.max(64, Math.round(sampleRate * windowMs / 1000)), hop = Math.floor(win / 4), search = Math.round(sampleRate * searchMs / 1000), window = hann(win), outputs = channels.map(() => new Float64Array(outLength + win)), weight = new Float64Array(outLength + win);
    let lastSource = 0, lastDest = 0;
    const terminal = Math.max(0, outLength - win), destinations = [];
    for (let d = 0; d < terminal; d += hop)
        destinations.push(d);
    destinations.push(terminal);
    for (let step = 0; step < destinations.length; step++) {
        const dest = destinations[step];
        const expected = Math.round(dest / ratio);
        let best = expected;
        if (step > 0) {
            let score = -Infinity;
            const overlap = win - hop, previous = lastSource + hop;
            for (let candidate = Math.max(0, expected - search); candidate <= Math.min(n - win, expected + search); candidate += 4) {
                let dot = 0, a2 = 0, b2 = 0;
                for (let i = 0; i < overlap; i += 4) {
                    for (const c of channels) {
                        const a = c[previous + i] || 0, b = c[candidate + i] || 0;
                        dot += a * b;
                        a2 += a * a;
                        b2 += b * b;
                    }
                }
                const corr = dot / Math.max(1e-20, Math.sqrt(a2 * b2));
                if (corr > score) {
                    score = corr;
                    best = candidate;
                }
            }
        }
        best = dest === terminal ? Math.max(0, n - win) : Math.max(0, Math.min(Math.max(0, n - win), best));
        for (let i = 0; i < win && dest + i < outLength; i++) {
            const v = window[i];
            weight[dest + i] += v;
            for (let c = 0; c < channels.length; c++)
                outputs[c][dest + i] += (channels[c][best + i] || 0) * v;
        }
        lastSource = best;
        lastDest = dest;
    }
    return outputs.map((a, c) => Float32Array.from(a.subarray(0, outLength), (v, i) => weight[i] > 1e-12 ? v / weight[i] : (channels[c][Math.min(n - 1, Math.round(i / ratio))] || 0)));
}
export function sincResample(channels, length, taps = 32) { const inputLength = channels[0].length, ratio = inputLength / length, cutoff = Math.min(1, 1 / ratio) * .96, half = taps / 2; return channels.map(ch => { const out = new Float32Array(length); for (let i = 0; i < length; i++) {
    const at = i * ratio, center = Math.floor(at);
    let total = 0, weight = 0;
    for (let j = center - half + 1; j <= center + half; j++) {
        const d = at - j, window = .5 + .5 * Math.cos(Math.PI * d / half), arg = Math.PI * d * cutoff, k = (Math.abs(arg) < 1e-10 ? cutoff : Math.sin(arg) / (Math.PI * d)) * Math.max(0, window);
        if (j >= 0 && j < inputLength) {
            total += ch[j] * k;
            weight += k;
        }
    }
    out[i] = weight ? total / weight : 0;
} return out; }); }
export function pitchShift(channels, sampleRate, semitones) { if (!Number.isFinite(semitones) || Math.abs(semitones) > 24)
    throw Error('Pitch shift is limited to ±24 semitones.'); if (Math.abs(semitones) < 1e-9)
    return channels.map(c => c.slice()); const factor = 2 ** (semitones / 12), stretched = timeStretch(channels, sampleRate, factor); return sincResample(stretched, channels[0].length); }
export function detectPitch(channels, sampleRate, { minHz = 65, maxHz = 1000, start = 0, windowMs = 80 } = {}) { const n = Math.min(Math.round(sampleRate * windowMs / 1000), channels[0].length - Math.round(start * sampleRate)), at = Math.round(start * sampleRate); if (n < 64)
    return null; let strongest = channels[0], bestEnergy = -1; for (const ch of channels) {
    let e = 0;
    for (let i = 0; i < n; i++)
        e += (ch[at + i] || 0) ** 2;
    if (e > bestEnergy) {
        bestEnergy = e;
        strongest = ch;
    }
} const mono = Float64Array.from({ length: n }, (_, i) => strongest[at + i] || 0); let rms = 0; for (const x of mono)
    rms += x * x; if (Math.sqrt(rms / n) < .003)
    return null; const min = Math.floor(sampleRate / maxHz), max = Math.min(Math.ceil(sampleRate / minHz), Math.floor(n / 2)), diff = new Float64Array(max + 1); let cumulative = 0, tau = 0; for (let lag = 1; lag <= max; lag++) {
    let d = 0;
    for (let i = 0; i < n - max; i++)
        d += (mono[i] - mono[i + lag]) ** 2;
    cumulative += d;
    diff[lag] = cumulative ? d * lag / cumulative : 1;
    if (lag >= min && diff[lag] < .15 && diff[lag - 1] > diff[lag])
        tau = lag;
    if (tau && lag > tau && diff[lag] > diff[tau])
        break;
} if (!tau) {
    let best = min;
    for (let i = min; i <= max; i++)
        if (diff[i] < diff[best])
            best = i;
    if (diff[best] > .4)
        return null;
    tau = best;
} const y0 = diff[Math.max(1, tau - 1)], y1 = diff[tau], y2 = diff[Math.min(max, tau + 1)], den = y0 - 2 * y1 + y2, refined = tau + (Math.abs(den) > 1e-12 ? clamp(.5 * (y0 - y2) / den, -.5, .5) : 0); const frequency = sampleRate / refined, midi = 69 + 12 * Math.log2(frequency / 440); return { frequency, midi, nearestMidi: Math.round(midi), cents: (midi - Math.round(midi)) * 100, confidence: 1 - diff[tau] }; }
export function pitchCorrect(channels, sampleRate, { targetMidi, strength = 1 } = {}) { const pitch = detectPitch(channels, sampleRate); if (!pitch)
    throw Error('No stable monophonic pitch detected. Select a sustained note.'); const target = Number.isFinite(targetMidi) ? targetMidi : pitch.nearestMidi; return { channels: pitchShift(channels, sampleRate, (target - pitch.midi) * clamp(strength, 0, 1)), detected: pitch, targetMidi: target }; }
