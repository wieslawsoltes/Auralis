# Module and service API

## Audio

`@auralis/audio` has no third-party runtime dependencies. Pure functions can run in Node or a Worker. Browser transport depends on Web Audio.

- `decodeWav(buffer)` returns `{ channels: Float32Array[], sampleRate, duration }`. It walks padded RIFF chunks, validates supported formats, and preserves finite float headroom.
- `encodeWav(channels, rate, options)` returns `ArrayBuffer`. Integer encodings clamp and quantize once, with optional TPDF. Float32 preserves finite headroom. INFO title/artist/comment metadata is optional.
- `MasterProcessor(rate, channels, config)` is a streaming processor. Call `process(input, output)` with equal planar frame lengths. Its fixed delay is `ceil(rate * .005)` frames, including bypass. Pure `processMaster` flushes and removes that delay to return the original length.
- `processMaster(channels, rate, config)` never changes input arrays. It runs EQ, compression, output gain and limiting in that order.
- `mixMontage(project, assets, rate, start, end)` renders clip timelines. It uses integer-rounded frame boundaries, Web Audio stereo-panner laws, linear fades and linearly interpolated dB automation. Resample assets to the target rate first for delivery quality; the UI uses OfflineAudioContext. Mixed-rate block playback uses a 32-tap windowed-sinc interpolation kernel with anti-alias cutoff.
- `editPCM` takes frame indices with an exclusive end. `linkedNormalize` preserves the stereo channel ratio. Direct `editPCM(..., 'normalize')` normalizes each channel independently; the workstation uses linked selection gain instead.
- `analyze` returns actual sample peak/RMS/correlation/DC and gated loudness. Silent/too-short audio has `integrated: null`.
- `AudioEngine` owns the decode cache, worker queue, AudioContext and recording stream. `dispose()` releases resources. `play` needs a user gesture where browsers require one. `record()` requests the microphone and `stopRecording()` returns a browser-encoded File.

Stored PCM uses Float32Array; JavaScript filter state is double precision. This does not make the signal path a native 64-bit float mastering engine. Realtime filter changes preserve filter state; parameter jumps can still click and need further smoothing qualification.

## Renderer

```js
import { WaveformRenderer } from './public/modules/renderer/index.js';
const renderer = new WaveformRenderer(document.querySelector('#waveform'));
renderer.setScene({ project, assets, selectedId, mode:'montage',
  viewStart:0, viewDuration:60, selection:[0,0], cursor:0 });
renderer.drawCursor(12.5);
// On disposal:
renderer.destroy();
```

Give the host an explicit nonzero height. Source envelope caches are keyed by Float32Array identity; replace arrays after edits. `peaks` treats bounds as `[from,to)`. `mode` reports `WebGPU` only after a device/pipeline exists, otherwise `Canvas 2D`. A lost device falls back to Canvas.

## Controls

```html
<audio-knob label="Gain" min="-24" max="12" value="0" unit="dB"></audio-knob>
<script type="module">
import './public/modules/controls/index.js';
document.querySelector('audio-knob').addEventListener('valuechange', e => {
  console.log(e.detail.value);
});
</script>
```

`drawSpectrum(canvas, values)` expects logarithmic amplitude values in dB; it does not calculate a spectrum itself. See type declarations for the full API.

## Fetch service

`handleApi(request, { DB, BUCKET })` is framework-independent. `DB` supplies D1-compatible prepared statements and transactional batch; `BUCKET` supplies `get`, `put`, `delete`. The included hosted route and local server are adapters.

| Method and route | Behavior |
| --- | --- |
| `GET /api/me` | Resolve/update trusted current identity |
| `GET /api/projects` | List the current member's projects |
| `POST /api/projects` | Create project plus owner membership and version 1 |
| `GET /api/projects/:id` | Read current document and current role |
| `PUT /api/projects/:id` | Validate document and merge/CAS-save `{project, baseRevision, operationId}` (legacy revision requests remain strict) |
| `GET/PUT /api/projects/:id/assets/:assetId` | Membership-scoped immutable PCM WAV object |
| `GET/POST/PATCH /api/projects/:id/comments` | List, create, or resolve timed comments |
| `POST /api/projects/:id/presence` | Refresh cursor presence and fetch peers/current revision |
| `POST /api/projects/:id/invite` | Owner creates single-use 24-hour role invitation |
| `POST /api/join` | Consume invitation and grant membership |
| `GET /api/projects/:id/versions` | Last 100 saved version summaries |
| `GET /api/projects/:id/versions/:revision` | Read historical document |

Disjoint stale saves merge automatically from the trusted historical base. Overlapping edits return HTTP 409 with a durable proposal and field conflicts. The guarded UPDATE and history INSERT are a single transaction. Asset IDs cannot be reused for different bytes. Concurrent upload losers cannot overwrite a winning object's hash-addressed key. Audio reads have `Cache-Control: private, no-store`.

Never forward user-supplied identity headers to this service. The local server replaces them with one local identity and listens only on loopback. Hosted ingress must authenticate visitors and replace these headers. Application roles remain server-enforced independently of UI visibility.

## Added audio and authoring interfaces

- `LoudnessMeter.push(planarBlock)` maintains continuous filters/window state; `result()` returns gated integrated loudness, maxima and LRA. Provide explicit channel weights for layouts beyond stereo; LFE must have weight 0. Fixture qualification here covers mono/stereo only.
- `TruePeakMeter.push(block)` preserves 65-tap boundary context; `finish()` flushes zero-padded tails. `truePeak(channels)` is the whole-array convenience function.
- `spectralProcess`, `spectralInterpolate`, `deClick`, `healSelection`, `timeStretch`, `pitchShift`, `detectPitch` and `pitchCorrect` are pure functions. Times are seconds; output arrays are new. See declarations and capability bounds.
- `WavPCMProvider.open(blobOrAuthenticatedURL)` discovers format/data offsets; `readFrames` performs bounded reads. `index()` creates a compact peak representation and loudness analysis. Provider channel views are envelope descriptors, not PCM arrays.
- `renderBlocks` yields continuous processed stereo blocks and compensates master latency once. `renderToSink` writes a WAV incrementally, meters quantized samples, and aborts the sink on failure. A persistent seed controls streaming TPDF dither.
- `encodeADM` returns PCM+AXML+CHNA in RIFF/BW64. One PCM array per object is retained. `makeCue` validates and rounds CD tracks; `zipFiles` builds an uncompressed ZIP with CRC32.

## Added service routes

| Route | Behavior |
|---|---|
|`GET /projects/:id/events`|SSE revision/comment-count/permission notifications; 25-second connections; 1-second database watch|
|`POST /projects/:id/conflicts/:proposal/resolve`|Explicit choices with `headRevision` and `operationId`; atomic resolved marker with commit|
|`GET/PATCH /projects/:id/admin`|Owner member/settings/storage/audit view; role/revoke/archive/quota changes|
|`DELETE /projects/:id/invite`|Revoke unused invitations|
|`POST /projects/:id/assets/:asset/upload`|Reserve quota for `{size,name}` and obtain 2 MiB chunk plan|
|`PUT /projects/:id/assets/:asset/upload/:upload/:part`|Immutable hashed chunk|
|`POST /projects/:id/assets/:asset/upload/:upload/complete`|Validate complete WAV manifest and publish source identity|
|`GET /projects/:id/assets/:asset` with `Range`|Single bounded byte range; 206 and Content-Range; up to 16 MiB|
|`GET /native/plugins`|Standalone-only configured native effects and DDP availability|
|`POST /native/render`|Standalone-only raw WAV handoff using allowlisted plug-in ID and parameter list headers|
|`POST /native/ddp`|Standalone-only binary job: uint32LE CUE UTF8 byte count, CUE bytes, then WAV bytes; returns verified DDP ZIP|

All paths above have `/api` prefix. Native routes exist only in the loopback server. Hosted routes retain trusted platform identity. Administrative audit tables are not externally anchored or tamper-proof against direct database administrators.

## Ordered native chain and editor API (standalone only)

`POST /api/native/render-chain` takes a little-endian uint32 JSON-header length, a UTF-8 header `{effects}`, then float WAV bytes. The validated effects chain accepts the same built-in inserts as the browser plus configured native IDs. Contiguous built-in runs retain continuous DSP state. Native state is base64 in `insert.params.state`; parameter override strings are validated separately. The result is a latency-compensated float WAV. This endpoint is loopback/origin restricted, bounded to 96 MiB and one native render job at a time.

`POST /api/native/editors` accepts `{pluginId,state?}` and returns `{id,pluginId,status,error,state}`. `GET /api/native/editors/:id` reads status. `POST /api/native/editors/:id/save` saves and closes the plug-in; `DELETE /api/native/editors/:id` cancels it. Native editor state is bounded to 190,000 binary bytes. Up to four X11 CLAP/VST3 windows can run simultaneously. Clients must only apply the result to the matching unchanged insert. These endpoints are unavailable in the hosted worker.

The project effects document optionally contains an ordered `chain`, maximum 64 insert objects: `{id,type,enabled,wet,params}`. Existing projects without it retain the legacy chain. Three-way merging preserves ordinary saves' order, merges independent insert fields and preserves concurrent insertion runs; native identity/state/parameter overrides are coupled for conflict review.
