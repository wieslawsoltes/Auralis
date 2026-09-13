# Auralis Studio 0.4 workspace

The plain HTML/CSS/JavaScript workstation now has a compact desktop menu, contextual command ribbons, open-document tabs, resizable side panels, a docked or floating tool window, and persistent transport. The layout follows the editing hierarchy in the WaveLab Pro 13 manual while using Auralis names, icons, styling and independently implemented code. This is a functional subset, not complete UI or feature parity.

## Finding the controls

| Workspace area | Available workflows |
|---|---|
| Audio Editor | View, Edit, Insert, Process, Correction, Spectrum, Analyze and Render ribbons |
| Audio Montage | View, Edit, Insert, Process, Clip, Fade, Envelope, Analyze and Render ribbons |
| Left panel | File search/import, numeric clip inspector, track mute/solo/gain/pan/color, timed comments |
| Right master section | Equalizer with computed response curve, compressor, limiter release/ceiling, output gain, bypass, presets, native processing, delivery and monitoring |
| Tool window | Meters, editable markers, clip list, fades, interactive volume envelope, undo history, metadata, delivery and collaboration |
| Command search | Ctrl/Cmd+K; search by action, category or workflow; unavailable commands explain their prerequisites |
| Workspace menu | Editing, mastering, montage and restoration layouts; panel visibility; preferences and keyboard shortcuts |
| Transport | Play/pause, Stop, record/finish recording, previous marker, beginning/end, selection playback, loop, numeric cursor position, render rate and position format |

Layout and keyboard preferences persist on this device. Divider handles support pointer dragging and arrow keys. The tool window can float within the browser viewport, move by its header and resize from its edge. Layout presets dock it again. Document tabs represent clips in one project; closing a tab hides it without removing its audio. Selecting its file reopens it.

## Editing

Audio Editor copies actual selected PCM, or the entire clip when no range is selected. Paste replaces the selected range or inserts at the cursor, resamples the clipboard to the destination sample rate, adapts mono/stereo channels and creates an immutable derived source. Montage Copy/Paste duplicates clip references. Original sources remain available, including when a copied derived clip is pasted after Undo.

The clip inspector exposes name, track, timeline position, source offset, duration, gain, fades and mute. Exact values accept sample-precise fractions. Clip Properties also exposes numeric volume-envelope points. In the Envelope tool, click to add, drag to move and right-click to remove points. The keyboard alternative is Add point at cursor plus numeric properties. Fades and crossfades are linear.

Selections can be entered as timecode, seconds or samples. Dragging supports snapping to markers and clip boundaries, with Alt bypass. Horizontal zoom, sample zoom, amplitude zoom, overview panning and cursor follow are separate controls. Montage track scrolling keeps track heights usable. Audio Editor auditions the selected source clip; Montage auditions the arrangement. Export dialogs expose their own scope.

Numeric knob entry, keyboard adjustment, dial dragging and range sliders drive real engine parameters. Dial gestures create one undo step; double-click resets to the configured default. Changes to master settings mark previous output measurements as stale.

## Spectral and analysis tools

Spectrum opens a worker-generated spectrogram with rectangular time/frequency selection. Drag a rectangle, then choose attenuation, gate or interpolation; fractional frequency bounds are preserved. Correction exposes noise-profile capture, denoising, declicking, predictive healing, pitch detection and sustained-note correction. Processing dialogs show only parameters relevant to the selected operation.

The spectrogram covers up to 30 seconds of the visible source region; zoom and scroll to inspect other regions. Spectrogram generation is CPU FFT work in an audio worker. The independent WebGPU renderer draws waveform primitives and selection overlays; it does not generate the spectral image itself.

Peak meters, spectrum and phasescope update during playback. Integrated loudness and delivery measurements come from analysis passes, with the measured source/clip/range/output identified in the UI. Analyze selection, Analyze clip, Analyze master and verified delivery have distinct scopes.

## Ordered master inserts

Open **＋ Open ordered insert rack** in the Master section. The existing EQ, compressor, gain and limiter settings convert without changing their order. Add any number up to 64 of EQ, compressor, limiter, gain, high-pass, low-pass, stereo width/balance and configured native plug-ins. Expand an insert to edit numeric parameters and wet mix; **Apply settings** commits the fields. Bypass, duplicate, move up/down and remove are real history transactions. Repeated limiters retain independent state and align their dry paths with lookahead latency. A topology or latency change stops playback before rebuilding the processing path.

On the standalone companion, Native inserts open their actual CLAP/VST3 editor. **Save editor state** stores processor/controller state in that insert and clears parameter overrides. The saved project and export use the same state. Native audition renders the chain first; it is not a live native audio-driver host. Native binaries never run in the cloud preview.

## Group and ripple montage editing

Ctrl/Cmd-click toggles clips; Shift-click adds. With the Move tool, drag empty track space for a marquee. Select all/Clear and the selection count are always visible in Montage. Group move preserves relative start times and track spacing, clamps the group at timeline/track boundaries, and commits one undo step. Copy/Paste/Duplicate preserve multiple track offsets and source metadata. Split acts on all selected clips crossing the cursor.

Ripple scope is Off, Selected tracks or All tracks + markers. Moving clips moves followers after each selected track's right boundary (or the group's final boundary for All). Delete closes the union of selected intervals once, retaining unselected overlapping clips. Trimming closes removed trailing intervals; leading-edge trimming stays anchored to source position. Edge dragging can reveal available source material again. Remove time cuts all intersecting clips and closes the range; Insert time splits crossing clips before inserting silence. Marker positions follow All scope and collapse to the start of removed intervals.

Split and trim preserve source fade coordinates and interpolate envelope endpoints. Duration-preserving DSP keeps those modifiers. Destructive trim/delete/stretch bake their fades and envelopes into the source before changing time, then reset the baked controls to avoid double processing. Original sources and Undo remain available.

## Spectral masks

In Audio Editor → Spectrogram choose Rectangle, Lasso or Brush. Lasso is a freehand polygon; Brush uses a radius in display pixels converted to time and square-root-frequency coordinates. Choose replace/add/subtract, or hold Shift to add and Alt to subtract. Masks support 128 shapes and 4,096 points, with Undo mask and Clear mask. Attenuation, gate, denoise and spectral interpolation use the actual mask in FFT processing. Shape boundaries are limited by FFT time/frequency resolution; there is no magic wand or spectral clipboard. Masks survive ordinary saves, clear when the selected source changes, and are temporary selections rather than saved project content.

## Detached panels and qualification

Workspace exposes separate master, meters, clips, markers and inspector windows. Their edits validate against the parent session revision. All audio, undo and project ownership stay in the main workspace; closing it closes the linked tools. **Dock** returns to the main workspace. The optional Electron shell gives those tools native application windows and remembers bounds. This is one project with linked panels, not a full independent-project window manager.

Help → Engine & device diagnostics runs an actual offline audio render, an optional WebGPU waveform-shader readback/timing check, and a five-second local audio-input check. The input check reports signal, clipping, invalid samples and frame discontinuities without saving or monitoring the microphone. Exported JSON explicitly distinguishes these checks from physical-device or analog-loopback qualification.

## Current parity boundaries

- One project with clip document tabs; no WaveLab workspace import, independent project-window groups, tab tearing or arbitrary pane docking trees. Electron runtime/installer behavior is not qualified here.
- Stereo main-bus inserts, with Linux X11 native CLAP/VST3 editors. No macOS AU editor, Windows native loader, instruments/MIDI, sidechains, dynamic native bus reconfiguration or third-party plug-in compatibility guarantee.
- No tempo map, musical time signatures, video timeline, surround monitor controller, formant-preserving/polyphonic tuning or full commercial spectral restoration equivalence.
- Streamed waveform peaks remain summaries at deep zoom. Numeric positions support samples; ruler labels remain seconds/minutes.
- WAV-centered rendering plus CD/CUE/configured DDP and generic ADM workflows; no new MP3/FLAC encoder, optical-disc burning or licensed Dolby Atmos tools.
- Collaboration merges saved changes and retains conflict review. It is not simultaneous gesture-level co-editing. Physical GPU/audio qualification, multi-hour real-device playback and production distributed/security qualification remain outstanding.

See [capabilities](CAPABILITIES.md) and [verification](VERIFICATION.md) for exact limits and evidence.

## Reference workflow documentation

- [WaveLab workspace](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/workspace_window/workspace_window_r.html)
- [Workspace layout](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/customizing/workspace_layout_c.html)
- [Audio Editor Edit tab](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/audio_files_editing/audio_file_editing_tab_edit_r.html)
- [Spectrum tab](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/audio_files_editing/tab_spectrum_r.html)
- [Audio Montage window](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/audio_montage/audio_montage_window_c.html)
- [Master Section](https://www.steinberg.help/r/wavelab-pro/13.0/en/wavelab/topics/master_section/master_section_window_r.html)
