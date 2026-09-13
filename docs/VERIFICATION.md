# Verification — Auralis Studio 0.3.0

## Workspace release verification

The complete Node regression suite passed **54/54 tests, zero skipped**, including the compiled native fixture tests, after the workspace changes. New checks cover timecode/sample conversion, command availability, recording-stop gating, canonical shortcuts and snapping. Public module declarations also passed TypeScript without skipping declaration checks.

The cloud Chrome browser exercised the running plain HTML app through its real controls:

- Exact 1–2 second selection and PCM copy/paste; a full-clip replacement with one second of audio produced 32,000 frames and clamped the former two-second fade-out to one second.
- Numeric equalizer gain set to +3 dB and a single undo history entry; envelope point insertion; clip timeline start preserved as 12.34567 seconds.
- Marker name/time editing; contextual Audio Editor/Montage ribbons; history controls.
- Dragged spectral range of approximately 9.505–13.343 seconds and 5026.2747–12476.8470 Hz, followed by actual attenuation. Processing created a derived source and controls became available again. Spectral gate was also applied in another test tab.
- Switching to Montage removed the spectral overlay. Copying a derived montage clip, undoing its processing and pasting succeeded with both source records available.
- Floating/docking the tool window, keyboard panel resize, editing/mastering layout presets, command search and a custom Add marker shortcut. Visual inspection caught and corrected grid placement when panels were hidden; both layouts were rechecked.
- Playback/Stop and the mastering workspace were exercised using the Canvas fallback. No app-origin console error was returned for the final layout/shortcut test tab.

These are executed browser interaction checks, not a committed unattended cross-browser end-to-end suite. The test origin is HTTP; physical WebGPU/AudioWorklet hardware qualification, microphone loopback and multi-account collaboration were not added by this UI release. See [workspace coverage](WORKSPACE.md).

## Previous engine qualification (0.2)

The evidence below was established during the preceding engine release. Its detailed fixture reports retain their original release and source hashes. The UI release does not reclassify that evidence as independent certification.


Tests establish the specific behavior described here, not full commercial-workstation parity.

## Executed

- 51 automated tests on Node 24.19.0 after compiling the native companions. They cover WAV precision; exact DSP bypass/latency; master/limiter behavior; restoration identities/bounds; pitch correction; terminal transients; stateful block equivalence; encoded streaming measurements; cancellation cleanup; ADM/ZIP/CD structures; native CLAP/VST3 parameter processing; API authorization, revision transactions, automatic merging, coupled-field conflicts, track order, idempotency races, explicit restoration/resolution retries, quotas, archive, revocation during upload, byte ranges, chunk completion and rollback.
- 318 official EBU v5 assertions passed across 68 supported files: 66 scalar assertions plus 252 sampled streaming assertions. Integrated loudness, maximum momentary/short-term loudness, LRA and nine true-peak cases are covered. Two multichannel fixtures are explicitly unsupported. The runner and result JSON are included; restricted technical-test audio is not distributed.
- Official EBU EAR 2.1.0 parsed and strictly rendered three generated ADM fixtures: 12 objects/48,017 frames at 48 kHz in both RIFF and BW64, and one object/96,011 frames at 96 kHz. Unicode/XML-sensitive names and IDs past 1009 were included. No ADM warnings or overloads. RIFF/BW64 stereo render output bytes matched exactly.
- External ddptools 1.1 created a real DDP 2.0/CD-Text fileset from deterministic 5-second stereo PCM. ddpinfo passed CRC32/MD5 verification and recovered byte-identical PCM. The 2-second pregap was present in IMAGE.DAT and removed on WAV extraction. These are two tools from the same author, not independent-vendor certification.
- Linux CLAP/VST3 companions compiled with C++17 and processed 48,017 stereo frames through their actual shared-library gain fixtures. Parameter events set gain 0.25; every output sample matched the expected value.
- Local SQLite concurrency probe: 128 operations, 8 workers; 131 markers retained, revision 129, 128 receipts and 128 audit events. Recorded run:~157 operations/s, p95~45 ms, ~90 MB peak RSS. This is a small local database test, not a production capacity claim.
- Large-file probe opened a sparse 1,036,800,044-byte WAV representing 3 hours, read the terminal range, and rendered its last 10 seconds with continuous DSP. Peak RSS~63 MB; final impulse/frame preserved. This tests bounded file access, not 3 hours of uninterrupted playback.
- Standalone native API exercised through standard Request objects and real subprocesses: CLAP/VST3 default and parameterized gain gave zero sample error across 220,500 stereo frames; DDP binary request returned a fileset with verified CRC/MD5 and exact PCM recovery; cross-origin requests returned 403.
- Public module declarations checked by TypeScript; hosted production build passed.

## Browser execution

Chrome cloud browser interacted with the actual local preview UI:

1. Initial source loaded and analyzed; real Play/Stop advanced the transport.
2. Drag selection produced a 1.786-second range.
3. Pitch processing applied +5 semitones to that range and created a new source.
4. Undo restored the original clip; Redo restored the derived source.
5. Verified delivery rendered and downloaded 48 seconds of stereo 48 kHz 24-bit PCM (2,304,000 frames, 13,824,068 bytes).
6. Result: −16.0971 LUFS, −1.0099995 dBTP. Peak target passed; requested −14 LUFS did not. The UI reported the constrained target accurately.
7. Device diagnostics ran a real 48,000-frame offline browser render at 997 Hz; measured sample peak and loudness were both approximately −20 dB.
8. The finished editor was visually inspected. Source/transport/rack/analysis panels rendered, and the Canvas fallback was active.

The download-event watcher timed out, but the completed WAV and JSON report were independently found in the synchronized download directory and their headers, size, frame count and report were inspected. A tab containing unsaved state was preserved; tests used a separate session.

The preview origin was HTTP and lacked WebGPU/AudioWorklet secure-context support. Playback exercised the main-thread fallback. Hosted login was unavailable in that local preview, so database/auth/merge flows were exercised through the actual API in Node rather than a two-account browser session. Browser extension metadata errors appeared in console; no corresponding app exception was observed in the completed edit/export flow.

## Not established

Physical GPU rendering correctness, external audio-interface/microphone quality, ASIO/CoreAudio behavior, AU compilation/runtime, arbitrary third-party plug-ins, sustained multi-hour playback, browser-tab suspension recovery, mobile/accessibility certification, real multi-account hosted collaboration, production distributed load/durability, penetration testing, enterprise security certification, Dolby Atmos compliance and independent loudness certification remain unqualified.

## Reproduce

```sh
bash native/build.sh
node --test tests/*.test.mjs
node tests/load-check.mjs local-load.json
node tests/large-file-check.mjs large-file.json
node tests/ebu-conformance.mjs public/modules/audio /path/to/ebu-v5 ebu-results.json
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --lib ES2022,DOM \
  public/modules/audio/index.d.ts public/modules/renderer/index.d.ts public/modules/controls/index.d.ts
```

Native tests skip when the compiled companion is absent. The EBU runner rejects missing fixtures and returns nonzero for failed assertions. Machine-readable evidence is in `docs/verification/`.

## Release 0.4 verification

The release regression command completed **74 tests: 72 passed, 2 native-window tests skipped in the ordinary headless run, zero failures**. The separate Xvfb runner completed **four tests, all passed**, including both skipped native-window cases. The CLAP/VST3 fixture tests exercise actual editor mouse gestures, plug-in-requested resizing, saved state, reopen, identity rejection, parameter overrides and rendered PCM. Xvfb is a virtual display, not a physical GPU. No commercial plug-in compatibility matrix was run.

Browser QA on the managed preview exercised ordered-rack conversion, insert creation, numeric Apply settings, duplication preserving gain, linked master-window editing and docking, montage duplicate/inspector binding, selection of two clips, grouped pointer dragging and Undo, lasso and brush gestures, lasso attenuation, ordinary gain processing, playback and ordered-chain WAV export. The exported file contains **2,304,000 stereo frames at 48 kHz**, 13,824,098 bytes, with no nonfinite samples. An actual 48,000-frame OfflineAudioContext check passed at approximately −20 dBFS. WebGPU was unavailable on that HTTP preview; the Canvas fallback was used. These browser interactions were executed through the controlled browser surface; they are recorded observations, not a checked-in Playwright suite.

The local HTTP qualification used 8 projects, 32 concurrent workers, **512 unique commits and idempotent replays**, and 32 SSE observers that all saw updates. It verified incomplete-upload rejection, a 4,800,058-byte three-part WAV, byte ranges crossing part boundaries, SHA-256 identity, SIGKILL/restart persistence, receipts and SQLite integrity. A **60.011-second read soak completed 144,694 operations**; total requests across the run were 146,237, with 931 expected optimistic retries. Measured latency was p50 2.51 ms, p95 8.25 ms and p99 28.08 ms. Server RSS was unavailable in the isolated process namespace. This is a local single-server test with one local identity, not production-scale or distributed qualification.

The optional Electron launcher was source-reviewed and syntax-checked. Its runtime dependency was fetched from the pinned official package, but native Electron UI launch, platform installers/signing, microphone prompts and OS multi-monitor placement were not exercised here. CLAP/VST3 editors were exercised directly in native host fixtures, independently of Electron.

Evidence is under `reports/`: `regression-0.4.json`, `native-editors-0.4.json`, `http-qualification.json`, `browser-render-0.4.json` and `browser-qualification-0.4.json`. Previous `docs/verification/` reports refer to their documented earlier runs. The app's new GPU readback and five-second input checks are runnable on target devices; physical GPU, real microphones/interfaces, analog loopback, multi-hour playback, macOS AU runtime and production distributed/security qualification remain outstanding.

The final spectrogram fix samples FFT windows across the complete visible duration (including hour-long ranges), with at most four source reads in flight and a bounded 800×1024-sample stereo working set in the UI. The regression test verifies coverage, read count, concurrency and cancellation.
