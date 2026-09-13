import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { encodeWav, decodeWav } from '../public/modules/audio/wav.js';
const root = path.resolve(new URL('..', import.meta.url).pathname);
let built = true;
try {
    await access(path.join(root, 'native/build/auralis-vst3'));
}
catch {
    built = false;
}
for (const [format, extension] of [['clap', 'clap'], ['vst3', 'so']])
    test(`Native ${format} processes parameter events and preserves non-block-aligned stereo PCM`, { skip: !built }, async () => { const directory = await mkdtemp(path.join(tmpdir(), 'auralis-test-')); try {
        const x = Float32Array.from({ length: 48017 }, (_, i) => .4 * Math.sin(i * .03)), y = Float32Array.from(x, v => -v), input = path.join(directory, 'input.wav'), output = path.join(directory, 'output.wav');
        await writeFile(input, new Uint8Array(encodeWav([x, y], 48000, { bits: 32, float: true })));
        const r = spawnSync(path.join(root, 'native/build/auralis-' + format), [path.join(root, 'native/build/gain-fixture.' + extension), input, output, '0=0.25'], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        const data = await readFile(output), decoded = decodeWav(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        assert.equal(decoded.channels[0].length, x.length);
        for (let i = 0; i < x.length; i++) {
            assert.equal(decoded.channels[0][i], x[i] * .25);
            assert.equal(decoded.channels[1][i], y[i] * .25);
        }
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    } });
