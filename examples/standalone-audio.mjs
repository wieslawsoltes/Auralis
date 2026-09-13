// Run: node examples/standalone-audio.mjs input.wav output.wav
import { readFile, writeFile } from 'node:fs/promises';
import { decodeWav, encodeWav } from '../public/modules/audio/wav.js';
import { defaultEffects, processMaster } from '../public/modules/audio/dsp.js';
import { analyze } from '../public/modules/audio/analysis.js';
const [input, output] = process.argv.slice(2);
if (!input || !output)
    throw Error('Usage: node examples/standalone-audio.mjs input.wav output.wav');
const bytes = await readFile(input), audio = decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const effects = defaultEffects();
effects.eq.low = 1;
effects.compressor.enabled = true;
const master = processMaster(audio.channels, audio.sampleRate, effects);
await writeFile(output, new Uint8Array(encodeWav(master, audio.sampleRate, { bits: 24, dither: true })));
console.log(JSON.stringify(analyze(master, audio.sampleRate), null, 2));
