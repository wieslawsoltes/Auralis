# Auralis Studio

A modular stereo audio editor and mastering workstation, built with a plain HTML/CSS/JavaScript interface, Web Audio / AudioWorklet processing, WebGPU waveform rendering, and durable collaborative projects.

**Release: 0.4.0.** Adds an ordered 64-insert processing rack, native Linux CLAP/VST3 editor windows with saved state, multiselect/ripple montage editing, lasso/brush spectral masks, linked detachable panels and an optional Electron desktop launcher. The audio editor remains plain HTML/CSS/JavaScript. See [the workspace guide](docs/WORKSPACE.md), [capabilities](docs/CAPABILITIES.md) and [verification](docs/VERIFICATION.md). Physical hardware qualification, broad commercial plug-in compatibility and complete WaveLab equivalence are not established.

## GitHub Pages preview

The browser edition targets [wieslawsoltes.github.io/Auralis](https://wieslawsoltes.github.io/Auralis/) by the [Pages workflow](https://github.com/wieslawsoltes/Auralis/actions/workflows/pages.yml). It supports local import, editing, playback, analysis and export. Keep source audio alongside exported project JSON. Saved server projects, collaboration and native plug-ins require the standalone app or a server-backed deployment. See [GitHub Pages setup](docs/GITHUB_PAGES.md) for first-time activation, local preview and deployment details.

## Run the standalone app

Requires Node.js 24 (or a compatible Node 22 release with `node:sqlite`). No dependency installation is needed for the standalone server, tests, pure DSP, WAV codec, or controls.

```sh
node server/standalone.mjs
```

Open `http://127.0.0.1:4173`. The server stores project records in SQLite and audio files in `.auralis-data/`. It binds to loopback and provides a single local-owner identity. Do not expose this development identity server publicly. The hosted adapter uses authenticated platform identities, D1, and R2 for multi-user collaboration.

Set `AURALIS_PORT` to choose another local port. Microphone recording and AudioWorklet require a secure browser context; browsers generally treat loopback as secure. WebGPU is feature-detected, with an actual Canvas fallback.

## Start mastering

1. The initial session contains **clearly labeled synthesized sample audio**, generated locally. It contains no commercial music or externally sourced audio.
2. Import WAV or another format your browser can decode. The built-in PCM WAV codec preserves the original sample rate.
3. Drag in Audio Editor to select a range. Use Process for gain, normalization, fades, reverse, polarity, DC removal, silence, trim, and deletion.
4. In Audio Montage, choose the pointer to move clips or drag their edges to trim. Use S to split at the cursor. Track mute, solo, gain and balance are under Tracks.
5. Use Clip Properties for exact timeline position, nondestructive fades and gain automation (`seconds:dB` points).
6. Open the ordered insert rack to add, duplicate, bypass, reorder and configure up to 64 processors. Built-in playback and export share DSP; native chains use a rendered audition cache.
7. Render the montage, clip, selection or track stems as 16/24-bit PCM or 32-bit float WAV. Set sample rate and optional TPDF dither. Use Analysis → Analyze master for the processed output.
8. Save a project to persist its document and immutable audio sources. Independent concurrent edits merge automatically. Overlaps open a field-level review before any conflicting save commits.

## Workspace tools

Use the **Correction/Spectrum** ribbons for restoration, **Process** for time/pitch and native processing, **Render** for delivery and CD/DDP/ADM authoring, **Collaboration** for project administration, and **Help** for diagnostics. Ctrl/Cmd+K finds any command. Delivery reports explicitly distinguish a passed peak ceiling from an unmet loudness target.

Large WAV files use a random-access provider. Use **Delivery → Stream WAV to disk** for output over 128 MB in a supported secure browser. Long-file restoration is limited to a 96 MB working region; trim a nondestructive clip to the material to repair first.

Native companion setup and DDP encoder configuration are in [native/README.md](native/README.md). The cloud preview cannot load your installed native plug-ins. Linux CLAP/VST3 hosts are compiled/tested; macOS AUv 2 source is unqualified.

## Repository organization

| Path | Responsibility |
| --- | --- |
| `public/studio/` | Plain HTML, CSS and JavaScript workstation UI |
| `public/modules/audio/` | Standalone DSP, AudioWorklet engine, worker processing, analysis, WAV codec |
| `public/modules/renderer/` | Reusable WebGPU waveform renderer and Canvas fallback |
| `public/modules/controls/` | Native `audio-knob` custom element and spectrum control |
| `public/modules/session/` | Project model, shared validation, undo/redo, API client |
| `server/api.js` | Fetch-compatible persistence and collaboration API |
| `server/local-adapters.mjs` | SQLite and filesystem adapters |
| `server/standalone.mjs` | Loopback-only standalone app server |
| `app/api/[...path]/route.ts` | Hosted API adapter |
| `db/schema.ts`, `drizzle/` | Durable schema and migrations |
| `desktop/` | Optional Electron launcher with native windows and persistent local sessions |
| `native/` | Native hosts, pinned CLAP/VST3 interfaces, gain fixtures, build instructions |
| `tests/` | Numerical audio and SQLite-backed API regression checks |
| `examples/` | Independent DSP command-line and web component examples |

The hosted project retains its supplied deployment framework and dependency lockfile. The workstation itself does not use React; `app/page.tsx` redirects to the plain HTML app. The audio, controls, renderer, and local server do not require the hosted framework.

## Use the modules independently

Each of the audio, renderer and controls directories contains an npm package manifest, TypeScript declarations, README and MIT license. Packages are prepared for packaging, but have **not been published to npm**.

```sh
cd public/modules/audio
npm pack
```

Use relative ESM imports in a browser or install the generated tarball in another project. Preserve the audio module's neighboring `worklet.js`, `worker.js` and imported files when deploying. See [module API](docs/API.md).

```js
import { decodeWav, encodeWav } from './public/modules/audio/wav.js';
import { defaultEffects, processMaster } from './public/modules/audio/dsp.js';

const source = decodeWav(wavArrayBuffer);
const effects = defaultEffects();
effects.eq.low = 1.5;
effects.compressor.enabled = true;
const processed = processMaster(source.channels, source.sampleRate, effects);
const output = encodeWav(processed, source.sampleRate, {
  bits: 24, dither: true, metadata: { title: 'Master' }
});
```

Process an audio file without the web app:

```sh
node examples/standalone-audio.mjs input.wav output.wav
```

## Hosted deployment

The hosted adapter targets a Cloudflare-compatible Worker with logical `DB` and `BUCKET` bindings. The provided deployment integration provisions storage and applies `drizzle/` migrations. Identity must come from the trusted authenticated ingress; never expose `server/api.js` behind a proxy that accepts arbitrary client-supplied `oai-authenticated-*` headers.

```sh
pnpm install --frozen-lockfile
pnpm build
```

A new independent deployment must receive its own site/project identity. Do not reuse the source archive's `.openai/hosting.json` project ID for a different deployment. The source archive excludes deployment identity files; the repository retains the existing preview configuration.

## Verify

```sh
node --test tests/*.test.mjs
```

The regression suite covers DSP, project operations, persistence, native fixtures and Pages deployment paths. Prior engine qualification also includes 318 official EBU assertions, native fixture processing, reference ADM/DDP round trips, a 1.04 GB streaming-file probe and local concurrency checks were executed. See the report for the limits of this evidence.

## Project files and collaboration

Project JSON includes arrangement, effects, tracks, metadata and asset references. **JSON export does not embed audio**. Keep WAV sources or use the saved hosted/local session. Missing sources can be relinked after JSON import. Saved project versions retain audio object references; current and historical sources are fetched before replacing the active session.

Collaboration uses SSE revision notifications, 15-second cursor presence, server-authoritative three-way merging and owner/editor/commenter/viewer roles. An owner creates a single-use 24-hour invitation link. The recipient also needs access to the site. Independent saves merge; overlapping fields require explicit resolution. There is no simultaneous media streaming or character-level CRDT editing. Local standalone mode is single-user.

## Licensing and references

Original application code is MIT licensed. Retained framework dependencies keep their own licenses. No proprietary application binaries, artwork, music or commercial plug-ins are included. Official MIT CLAP/VST3 interfaces are vendored with their licenses; DDP encoders remain external dependencies. Public product documentation informed the workflow organization only. DSP references are listed in [capabilities](docs/CAPABILITIES.md).

## Source distribution

The hosted editor offers the complete source ZIP under **Help → Keyboard reference**. The ZIP contains this source tree, examples, tests, native companion source, documentation and independently installable npm tarballs for audio, renderer and controls. Generated download archives, installed dependencies, local databases and native build outputs are omitted from the ZIP itself.

## Native desktop windows

```sh
cd desktop
npm ci
npm start
```

Electron 42 is pinned by the desktop lockfile. The launcher starts its own local project service on port 47831 and stores sessions/window placement in the OS application-data directory. Set `AURALIS_DESKTOP_PORT` if that port is occupied; changing the port changes the browser preference origin. Renderer Node integration is disabled. The native shell was source-reviewed and syntax-checked here, but its packaged runtime was not exercised through the browser QA surface. No signed installers are included.

Use Workspace → Detach master/meters/clips/markers/inspector, then **Dock** in the detached window. In a browser these are linked popup windows; in Electron they are native application windows. Native plug-in editors additionally require the Linux X11 companion build described in [native/README.md](native/README.md).

## Rebuild the source distribution

`python3 scripts/package-source.py` writes the complete source ZIP and the independently usable audio/renderer/control package archives into `public/downloads/`. Build outputs, private local data, installed dependencies and previous archives are excluded. The source includes pinned native interface headers, tests, reproducible scripts and qualification reports.
