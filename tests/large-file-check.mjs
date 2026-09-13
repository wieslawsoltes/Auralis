import { open, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { WavPCMProvider, wavHeader, renderToSink } from '../public/modules/audio/streaming.js';
import { createProject } from '../public/modules/session/model.js';
const directory = await mkdtemp(path.join(tmpdir(), 'auralis-large-')), file = path.join(directory, 'three-hours.wav'), rate = 48000, frames = rate * 10800, bytes = 44 + frames * 2;
try {
    const handle = await open(file, 'w');
    await handle.write(new Uint8Array(wavHeader(frames, rate, 1, 16, false)));
    await handle.truncate(bytes);
    const impulse = Buffer.alloc(2);
    impulse.writeInt16LE(26214);
    await handle.write(impulse, 0, 2, 44 + (frames - 1) * 2);
    await handle.close();
    const started = performance.now(), provider = await WavPCMProvider.open(await openAsBlob(file)), asset = { id: 'large', name: 'Three-hour fixture', sampleRate: rate, duration: 10800, channels: [{ length: frames }], provider };
    const end = await provider.readFrames(frames - 128, 128);
    if (end[0][127] !== 26214 / 32768)
        throw Error('End range mismatch');
    const p = createProject();
    p.effects.bypass = true;
    p.clips = [{ ...p.clips[0], assetId: 'large', duration: 10800, fadeIn: 0, fadeOut: 0 }];
    let outputBytes = 0, last;
    const report = await renderToSink(p, new Map([['large', asset]]), rate, 10790, 10800, { async write(data) { outputBytes += data.byteLength; last = data; }, async close() { } }, { bits: 32, float: true });
    if (outputBytes !== 44 + rate * 10 * 8)
        throw Error('Incorrect streamed output size');
    const v = new DataView(last), lastSample = v.getFloat32(last.byteLength - 4, true);
    if (Math.abs(lastSample - (26214 / 32768) * Math.SQRT1_2) > 1e-6)
        throw Error('Final frame lost');
    const result = { source: 'sparse PCM WAV with verified terminal impulse', inputBytes: bytes, inputDurationSeconds: 10800, outputSeconds: 10, outputBytes, peakRSS: process.resourceUsage().maxRSS * 1024, elapsedMs: performance.now() - started, finalSample: lastSample, report, qualification: 'bounded large-file path, not a continuous three-hour playback soak' };
    console.log(JSON.stringify({ ...result, report: undefined }, null, 2));
    if (process.argv[2])
        await writeFile(process.argv[2], JSON.stringify(result, null, 2));
}
finally {
    await rm(directory, { recursive: true, force: true });
}
