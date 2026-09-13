# @auralis/controls

Version 0.3.0. ESM module; no runtime dependencies. MIT licensed.

Pack independently with `npm pack` in this directory. See `index.d.ts` for the public API. The complete Auralis Studio repository includes examples, numerical tests, and a capability/validation report.

Import registers the audio-knob custom element. Configure label, value, min, max, step and unit attributes; listen for the bubbling valuechange event. drawSpectrum() accepts dB amplitude bins and draws a logarithmic-frequency curve.

The `disabled` property/attribute gates every interaction. Drag the dial vertically (Shift for fine movement), use arrow/Page/Home/End keys, move its slider, or enter a number. Double-click resets to the `default` attribute, or zero. Values clamp to min/max and quantize to step.

`valuechange` is a composed, bubbling CustomEvent with `{value:number}` in `detail`. `gesturestart` and `gestureend` are composed, bubbling CustomEvents for undo grouping. Setting `.value` updates the UI without dispatching a user-change event. CSS custom properties `--knob-surface`, `--knob-border`, `--accent`, `--muted`, `--text` and `--bg`, plus the `dial` and `label` shadow parts, support integration.
