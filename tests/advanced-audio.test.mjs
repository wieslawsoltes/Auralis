import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, truePeak, TruePeakMeter } from '../public/modules/audio/analysis.js';
import { spectralProcess, healSelection, deClick, timeStretch, pitchCorrect, detectPitch } from '../public/modules/audio/restoration.js';
import { WavPCMProvider, renderBlocks, renderToSink } from '../public/modules/audio/streaming.js';
import { encodeWav, decodeWav } from '../public/modules/audio/wav.js';
import { processMaster, mixMontage } from '../public/modules/audio/dsp.js';
import { createProject } from '../public/modules/session/model.js';
import { encodeADM, makeCue, zipFiles } from '../public/modules/audio/authoring.js';
const sr = 16000, tone = (hz = 440, n = sr * 2) => Float32Array.from({ length: n }, (_, i) => .2 * Math.sin(2 * Math.PI * hz * i / sr)), max = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0), err = (a, b) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);
test('True peak preserves chunk boundaries and detects intersample headroom', () => { const c = Float32Array.of(0, .9, .9, -.9, -.9, .9, .9, 0), whole = truePeak([c]); const meter = new TruePeakMeter(1); for (let i = 0; i < c.length; i++)
    meter.push([c.subarray(i, i + 1)]); assert.equal(meter.finish(), whole); assert.ok(whole > 20 * Math.log10(.9)); });
test('STFT identity and selected operations leave unselected PCM exact', () => { const x = tone(), identity = spectralProcess([x], sr, { operation: 'attenuate', amount: 0 })[0]; assert.ok(err(x, identity) < 1e-6); const y = spectralProcess([x], sr, { operation: 'attenuate', amount: -18, start: .5, end: .6 })[0]; assert.equal(err(x.subarray(0, 8000), y.subarray(0, 8000)), 0); assert.equal(err(x.subarray(9600), y.subarray(9600)), 0); });
test('Spectral interpolation restores an off-bin sustained tone dropout', () => { const clean = tone(), bad = clean.slice(); bad.fill(0, 8000, 9600); const repaired = spectralProcess([bad], sr, { operation: 'repair', start: .5, end: .6, lowHz: 0, highHz: 8000 })[0]; let mse = 0; for (let i = 8000; i < 9600; i++)
    mse += (repaired[i] - clean[i]) ** 2; assert.ok(Math.sqrt(mse / 1600) < .01); assert.equal(err(clean.subarray(0, 8000), repaired.subarray(0, 8000)), 0); });
test('Predictive healing is bounded and preserves surrounding audio', () => { const clean = tone(), bad = clean.slice(); bad.fill(0, 8000, 11200); const y = healSelection([bad], sr, { start: .5, end: .7 })[0]; assert.ok(max(y) < .31); assert.equal(err(y.subarray(0, 8000), clean.subarray(0, 8000)), 0); });
test('Declick repairs complete short plateaus and preserves overlong runs', () => { for (const width of [1, 2, 4, 16, 32, 64]) {
    const x = new Float32Array(sr);
    x.fill(1, 8000, 8000 + width);
    const y = deClick([x], sr)[0];
    assert.equal(width <= 32 ? max(y) : err(x, y), 0);
} });
test('WSOLA preserves exact identity, stereo phase, length and terminal transient', () => { const x = tone(); assert.equal(err(timeStretch([x], sr, 1)[0], x), 0); for (const ratio of [.5, 1.25, 2]) {
    const impulse = new Float32Array(sr * 2);
    impulse[impulse.length - 20] = .8;
    const y = timeStretch([impulse], sr, ratio)[0];
    assert.equal(y.length, Math.round(impulse.length * ratio));
    assert.ok(max(y) > .79);
} const y = timeStretch([x, Float32Array.from(x, v => -v)], sr, 1.25); assert.ok(y[0].every((v, i) => Math.abs(v + y[1][i]) < 1e-7)); });
test('Fractional YIN estimates antiphase tone and correction retains duration', () => { const x = tone(450); const p = detectPitch([x, Float32Array.from(x, v => -v)], sr); assert.ok(Math.abs(p.frequency - 450) < .3); const y = pitchCorrect([x], sr, { targetMidi: 69 }).channels[0]; assert.equal(y.length, x.length); assert.ok(Math.abs(detectPitch([y], sr, { start: .5 }).frequency - 440) < 1); });
test('Random-access WAV reads and continuous block rendering equal whole-buffer DSP', async () => { const x = tone(440, 16003), a = { sampleRate: sr, channels: [x, x], duration: x.length / sr }, wav = encodeWav(a.channels, sr, { bits: 32, float: true }), provider = await WavPCMProvider.open(new Blob([wav])); assert.deepEqual(await provider.readFrames(511, 129), a.channels.map(c => c.slice(511, 640))); const p = createProject(); p.clips = [{ ...p.clips[0], duration: a.duration, fadeIn: 0, fadeOut: 0 }]; const assets = new Map([['demo-nocturne', a]]), reference = processMaster(mixMontage(p, assets, sr, 0, a.duration), sr, p.effects); for (const blockSize of [127, 4096]) {
    const blocks = [];
    for await (const b of renderBlocks(p, assets, sr, 0, a.duration, { blockSize }))
        blocks.push(b);
    const output = [new Float32Array(x.length), new Float32Array(x.length)];
    let at = 0;
    for (const b of blocks) {
        b.forEach((c, i) => output[i].set(c, at));
        at += b[0].length;
    }
    assert.equal(at, x.length);
    assert.ok(err(reference[0], output[0]) < 1e-7);
} });
test('Streaming export reports encoded PCM and aborts failed sinks', async () => { const p = createProject(), x = new Float32Array(16000).fill(2); p.clips = [{ ...p.clips[0], duration: 1, fadeIn: 0, fadeOut: 0 }]; p.effects.bypass = true; const assets = new Map([['demo-nocturne', { sampleRate: 16000, channels: [x, x] }]]), parts = []; const report = await renderToSink(p, assets, 16000, 0, 1, { async write(x) { parts.push(x); }, async close() { } }, { bits: 16 }); const decoded = decodeWav(await new Blob(parts).arrayBuffer()); assert.ok(Math.abs(report.samplePeak - analyze(decoded.channels, 16000).samplePeak) < 1e-9); let aborted = false, written = false; const signal = AbortSignal.abort(); await assert.rejects(renderToSink(p, assets, 16000, 0, 1, { write() { written = true; }, abort() { aborted = true; } }, { signal })); assert.equal(written, false); assert.equal(aborted, true); });
test('ADM retains independent PCM channels and writes BW64 size fields', () => { const x = Float32Array.of(.2, .3), y = Float32Array.of(-.1, .4), r = encodeADM([x, y], 48000, [{ name: 'Left', azimuth: 30 }, { name: 'Right', azimuth: -30 }], { bw64: true }), v = new DataView(r.buffer); assert.equal(new TextDecoder().decode(r.buffer.slice(0, 4)), 'BW64'); assert.equal(v.getBigUint64(36, true), 0n); assert.ok(r.xml.includes('ATU_00000002')); assert.ok(r.xml.includes('AC_00031002')); });
test('CD track rounding and ZIP CRC structures are valid', () => { const cue = makeCue({ tracks: [{ time: 0, name: 'One' }, { time: 5.006, name: 'Two' }], duration: 10 }); assert.equal(cue.tracks[1].sector, 375); assert.ok(cue.cue.includes('INDEX 01 00:05:00')); assert.throws(() => makeCue({ tracks: [{ time: 0 }, { time: 8 }], duration: 10 }), /4seconds/); const zip = zipFiles([['test.txt', 'hello']]); assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50); });
