# @auralis/audio

Version 0.3.0. ESM module; no runtime dependencies. MIT licensed.

Pack independently with `npm pack` in this directory. See `index.d.ts` for the public API. The complete Auralis Studio repository includes examples, numerical tests, and a capability/validation report.

The pure DSP, WAV and analysis subpaths run in Node and browsers. AudioEngine uses AudioContext and Worker; AudioWorklet is preferred on secure origins, with a main-thread fallback on legacy/insecure origins. Serve worklet.js and worker.js alongside the module. Export uses Float32 planar PCM and a sample-peak limiter, not a certified true-peak limiter.

Version 0.2 adds restoration, WSOLA/pitch processing, streaming PCM providers/render sinks, ADM/CD authoring, streaming loudness/true-peak measurement, and delivery preparation. The master rack retains its sample-peak limiter. Delivery separately applies linked constant gain constrained by measured true peak, then remeasures encoded output and reports peak/loudness target results. EBU fixture passes do not constitute external certification. See the source repository capability matrix for format, memory and qualification limits.

## Ordered processing and spectral masks

```js
import {defaultEffects, createInsert, processMaster} from './index.js';
const highpass = createInsert('highpass', 'hp-1');
highpass.params.frequency = 35;
const gain = createInsert('gain', 'gain-1');
gain.params.gain = -3;
const effects = {...defaultEffects(), chain: [highpass, gain, createInsert('limiter', 'limiter-1')]};
const output = processMaster(stereoPCM, 48000, effects);
```

The 64-insert limit is validated. Repeated processors hold independent state. Live built-in playback, offline render and streamed output share MasterProcessor. Native inserts deliberately require the standalone companion; the pure JavaScript processor rejects active native inserts instead of silently bypassing them.

Spectral restoration accepts `mask: {nyquist, shapes}` with rectangle/polygon/brush shapes and add/subtract operations. `spectral-mask.js` validates and prepares them. Coordinates are seconds and Hz; brush radii use seconds and normalized square-root frequency. Clip `fadeSource` preserves original fade coordinates across nondestructive slices. `bakeClipModifiers()` applies those fades and volume envelopes before destructive timing edits.
