import test from 'node:test';
import assert from 'node:assert/strict';
import { MasterProcessor, defaultEffects, processMaster, editPCM, coefficients, Biquad, mixMontage, dbToGain } from '../public/modules/audio/dsp.js';
import { encodeWav, decodeWav } from '../public/modules/audio/wav.js';
import { analyze, spectrum } from '../public/modules/audio/analysis.js';
import { WaveformRenderer } from '../public/modules/renderer/index.js';
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
for (const bits of [16, 24, 32])
    test('PCM ' + bits + ' RIFF round trip preserves channel order and precision', () => { const a = [new Float32Array([0, -1, .125, .8]), new Float32Array([.5, .9, -.3, 0])]; const wav = encodeWav(a, 48000, { bits, dither: false, metadata: { title: 'Odd title' } }), b = decodeWav(wav); assert.equal(b.sampleRate, 48000); assert.equal(b.channels[0].length, 4); for (let c = 0; c < 2; c++)
        for (let i = 0; i < 4; i++)
            close(a[c][i], b.channels[c][i], 1 / (2 ** (bits - 1))); });
test('Float WAV preserves headroom and odd PCM chunk padding', () => { const a = [Float32Array.of(-2, 0, .125, 1.5)]; assert.deepEqual(decodeWav(encodeWav(a, 44100, { bits: 32, float: true })).channels, a); assert.equal(decodeWav(encodeWav([Float32Array.of(.2)], 48000, { bits: 24 })).channels[0].length, 1); });
test('Truncated WAV fails explicitly', () => { const b = encodeWav([new Float32Array(100)], 48000); assert.throws(() => decodeWav(b.slice(0, -2)), /Truncated/); });
test('Bypass preserves samples and final impulse exactly', () => { const config = defaultEffects(); config.bypass = true; const input = [Float32Array.of(.1, -.3, 0, 1), Float32Array.of(-.4, .5, 0, -1)]; assert.deepEqual(processMaster(input, 48000, config), input); });
test('Lookahead limiter ceiling is enforced with stereo linking', () => { const a = [new Float32Array(48000), new Float32Array(48000)]; for (let i = 0; i < 48000; i++) {
    a[0][i] = i % 197 === 0 ? 4 : Math.sin(i) * .8;
    a[1][i] = a[0][i] * .5;
} const out = processMaster(a, 48000, defaultEffects()); let peak = 0; for (let i = 0; i < 48000; i++) {
    peak = Math.max(peak, Math.abs(out[0][i]));
    close(out[1][i], out[0][i] * .5);
} assert.ok(peak <= dbToGain(-1) + 1e-6); });
test('Switching bypass clears historical limiter attenuation', () => { const p = new MasterProcessor(48000, 2, defaultEffects()), a = [new Float32Array(1000).fill(2), new Float32Array(1000).fill(2)], out = a.map(x => new Float32Array(x.length)); p.process(a, out); const c = defaultEffects(); c.bypass = true; p.setConfig(c); a.forEach(x => x.fill(.5)); p.process(a, out); close(out[0][999], .5); });
test('EQ gain matches peaking gain at band center', () => { const f = new Biquad(coefficients('peak', 1000, 6, .707, 48000)); let pin = 0, pout = 0; for (let i = 0; i < 48000; i++) {
    const x = Math.sin(2 * Math.PI * 1000 * i / 48000), y = f.tick(x);
    if (i > 12000) {
        pin += x * x;
        pout += y * y;
    }
} close(10 * Math.log10(pout / pin), 6, .01); });
test('Fades have exact endpoints and edit inputs remain untouched', () => { const a = Float32Array.of(1, 1, 1, 1); assert.deepEqual([...editPCM([a], 0, 4, 'fadeIn')[0]], [0, Math.fround(1 / 3), Math.fround(2 / 3), 1]); assert.deepEqual([...editPCM([a], 0, 4, 'reverse')[0]], [1, 1, 1, 1]); assert.deepEqual([...a], [1, 1, 1, 1]); assert.throws(() => editPCM([a], 2, 2, 'gain')); });
const montage = (channels, pan = 0, start = 0, duration = .2) => ({ p: { tracks: [{ id: 't', gain: 0, pan }], clips: [{ trackId: 't', assetId: 'a', start, duration, offset: 0, gain: 0, fadeIn: 0, fadeOut: 0 }] }, assets: new Map([['a', { channels, sampleRate: 48000 }]]) });
test('Montage mono center uses equal-power pan law', () => { const { p, assets } = montage([new Float32Array(9600).fill(1)]); const out = mixMontage(p, assets); close(out[0][0], Math.SQRT1_2); close(out[1][0], Math.SQRT1_2); });
test('Montage stereo hard-left preserves right-channel material', () => { const { p, assets } = montage([new Float32Array(9600), new Float32Array(9600).fill(.5)], -1); const out = mixMontage(p, assets); close(out[0][0], .5); close(out[1][0], 0); });
test('Render boundaries are integer-frame stable', () => { const { p, assets } = montage([new Float32Array(20000).fill(.2)], 0, .1, .2); assert.equal(mixMontage(p, assets, 48000, 0, .1 + .2)[0].length, 14400); });
test('K-weighted loudness 997 Hz mono and stereo reference', () => { const a = new Float32Array(480000); for (let i = 0; i < a.length; i++)
    a[i] = .1 * Math.sin(2 * Math.PI * 997 * i / 48000); close(analyze([a], 48000).integrated, -23.01, .03); close(analyze([a, a], 48000).integrated, -20, .03); assert.equal(analyze([new Float32Array(48000)], 48000).integrated, null); });
test('FFT calibration and antiphase stereo do not cancel', () => { const a = new Float32Array(2048); for (let i = 0; i < a.length; i++)
    a[i] = Math.sin(2 * Math.PI * 64 * i / a.length); const r = spectrum([a, a.map(x => -x)]); close(r[64], 0, .001); });
test('Cached waveform bounds exclude adjacent impulses', () => { const a = new Float32Array(4096); a[900] = .9; a[2000] = 1; const fake = { cache: new WeakMap() }; assert.deepEqual(WaveformRenderer.prototype.peaks.call(fake, a, 1000, 2000), [0, 0]); });
