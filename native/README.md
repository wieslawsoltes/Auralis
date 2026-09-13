# Auralis native companion

The browser cannot load VST3, CLAP or AU binaries directly. These offline companions process WAV audio in separate OS processes. They are original host implementations using pinned official interfaces. The Linux CLAP/VST3 hosts additionally embed X11 editor windows and persist plug-in state. They remain bounded mono/stereo effect hosts.

## Linux

Requires a C++17 compiler. No CMake or external package installation is required.

```sh
bash native/build.sh
native/build/auralis-clap /absolute/path/effect.clap input.wav output.wav 0=0.5
native/build/auralis-vst3 /absolute/path/Effect.vst3/Contents/x86_64-linux/Effect.so input.wav output.wav 0=0.5
node --test tests/native.test.mjs
```

CLAP parameter values use the plug-in's native parameter range. VST3 values are normalized 0…1. IDs must come from the selected plug-in's parameter documentation. The first effect is selected unless the allowlist entry supplies descriptorId (CLAP descriptor string or 32-digit VST3 class hex). Main input/output topology must match the mono/stereo WAV. Processing is Float32,512-frame blocks with a variable final block. Latency is compensated once; the file retains its original length. Add silence to capture reverb/delay tails. Output is 32-bit float WAV.

To connect the standalone UI, create an explicit allowlist file:

```json
[
  {"id":"master-eq","name":"My mastering EQ","format":"clap","path":"/absolute/path/effect.clap"}
]
```

```sh
AURALIS_PLUGIN_CONFIG=/absolute/path/auralis-plugins.json node server/standalone.mjs
```

Use **Studio tools → Native plug-in companion**. Only IDs in the server's configuration are accepted; the browser cannot supply a library path or executable. The process has a 180-second timeout. The standalone service is loopback-only, validates Host/Origin, and rejects concurrent native jobs. Native plug-ins still execute with your OS account's permissions; process separation is not a malicious-code sandbox. Only load plug-ins you trust.

## macOS AUv 2

```sh
mkdir -p native/build
c++ -std=c++17 -O2 native/au-host.cpp -framework AudioToolbox -framework CoreFoundation -o native/build/auralis-au
native/build/auralis-au SUBT MANU input.wav output.wav
```

Replace SUBT/MANU with the registered four-character subtype/manufacturer. Configure a UI entry with `format:"au"`, `subtype` and `manufacturer`. This source uses synchronous AUv 2 effects. It was not compiled or tested on macOS here. AUv 3, plug-in editors and parameter UI are not implemented.

## DDP 2.0

Obtain cue2ddp and ddpinfo from [their author](http://ddp.andreasruge.de/). The binaries are external dependencies and are not redistributed here.

```sh
AURALIS_CUE2DDP=/absolute/path/cue2ddp \
AURALIS_DDPINFO=/absolute/path/ddpinfo \
node server/standalone.mjs
```

Use **Studio tools → CD / DDP authoring → DDP 2.0**. The server creates a real fileset, verifies it, then returns a ZIP containing the encoder output and verification log. It passes generated CUE and WAV files using fixed names and argument arrays, without a shell. This encoder's CD-Text uses Latin 1. A CUE/WAV ZIP by itself is labeled a CD master, never DDP.

## Licenses and pinned interfaces

- CLAP1.2.10: MIT, Alexandre BIQUE and contributors; upstream commit `a 47f 6badb 49d 948fd 009998f 28309cdab 78979c 9`.
- VST3 pluginterfaces: MIT, Steinberg Media Technologies; upstream commit `4f 547e 8e 102b 47de 4a 8b 8aaf 343c 73b 700786372`.
- Original Auralis host/fixture code: repository MIT license.

Each vendored interface directory retains its own license and upstream commit record. No commercial plug-ins or third-party DDP executables are bundled.

## Linux native editor build and state

Install a C++17 compiler and X11 development headers/library, then:

```sh
AURALIS_X11=1 bash native/build.sh
native/build/auralis-clap /absolute/path/effect.clap --edit --state-out preset.bin
native/build/auralis-vst3 /absolute/path/effect.so --edit --state-out preset.bin
```

The current DISPLAY must refer to your desktop session. Type `save` or `cancel` on standard input; normal window close saves. `--state-in preset.bin` restores state for either editing or rendering. State envelopes are versioned, bounded and bound to the selected format/plug-in identity. VST3 stores processor and controller chunks separately; CLAP uses its state extension. State support is required to save an editor. A saved GUI state includes nonparameter state; the fixtures check this path.

In the UI open the ordered insert rack, add a configured Native insert, then Open native editor. At most four editor sessions are open concurrently. The standalone API bounds request/state sizes, expires editor sessions, uses private temporary directories and cancels child processes on shutdown. Saving applies only if the target insert still matches the one opened. The native API supports arbitrary ordering with built-in processors and native dry/wet mixing. The cloud preview shows the workflow but cannot launch installed desktop plug-ins.

X11/XEmbed focus and plug-in-requested sizes are handled; VST3 exposes host messages/attributes and a Linux run loop; CLAP dispatches timer/FD callbacks and queues cross-thread GUI requests. MIDI/instruments, sidechain and dynamic topology changes are unsupported. Native audition is cached offline rendering, not real-time ASIO/CoreAudio processing. No macOS AU editor or Windows host is supplied.

## Editor regression tests

With `Xvfb`, `xdotool`, X11 headers/libraries and an X authority file installed, run `AURALIS_TEST_DISPLAY=localhost:98 node tests/native-gui-check.mjs`. Override `AURALIS_XVFB`, `AURALIS_XDOTOOL` and `AURALIS_XKB_DIR` for nonstandard locations. The runner starts a private virtual display and executes real embedded fixture-window gestures, resize, state save/reopen and render comparisons. This is virtual GUI coverage, not physical GPU or commercial plug-in qualification.
