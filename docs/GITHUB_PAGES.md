# GitHub Pages

The browser edition deployment target is `https://wieslawsoltes.github.io/Auralis/`.
The `.github/workflows/pages.yml` workflow builds and tests the app, uploads
`out/pages`, then deploys it through GitHub's official Pages actions.

## First-time activation

In [Settings → Pages](https://github.com/wieslawsoltes/Auralis/settings/pages),
set **Build and deployment → Source → GitHub Actions**. The repository's first
deployment needs this setting enabled by an administrator. If a deployment
already failed before activation, rerun its failed jobs from the Actions tab.
Later pushes to `main` deploy automatically. The workflow also supports a manual
**Run workflow** action.

The deployment job uses only `contents: read`, `pages: write` and `id-token: write`.
No additional repository secrets are required. It runs in the `github-pages`
environment, so any environment protection rules must allow the deployment.

## What runs on Pages

Local file import, the Audio Editor, montage editing, built-in processing,
spectral tools, Web Audio playback, waveform rendering, analysis, browser device
checks, detached browser panels and audio export run in the browser. WebGPU and
recording depend on the browser and connected hardware. Canvas rendering is the
fallback when WebGPU is unavailable.

GitHub Pages serves static files. It cannot run the SQLite/server API, authenticate
collaborators, synchronize projects or load native plug-ins. The build marks the
browser edition explicitly: it skips background account/presence requests and
explains how to keep work when Save is selected. Server-only commands report
that they require the companion or hosted server. Exported project JSON contains
audio references, not embedded audio; retain source files and relink them on
reopening. Render audio separately to keep a playable result.

Run `node server/standalone.mjs` for durable local projects and native companion
integration. See the main README for the authenticated collaboration adapter.

## Build and preview locally

Use Node.js 24. No dependency installation is needed for this build.

```sh
npm run build:pages
python3 -m http.server 8080 --directory out/pages
```

Open `http://localhost:8080/`. The build copies `public/`, adds a static deployment
marker to the workstation HTML entry points, and creates `.nojekyll`. The source
HTML remains suitable for the standalone and hosted servers. Relative asset URLs
also support a GitHub project path such as `/Auralis/`. The regression suite tests
the generated app at that path, including the audio workers and detached panels.

## Validation and downloads

```sh
bash native/build.sh
npm test
npm run build:pages
```

CI compiles the Linux hosts and fixture plug-ins before running the regression
suite. Physical GPU/audio-device, commercial plug-in and production-scale
qualification require separate environments; a green deployment does not certify
those capabilities.

The source archive is available from the editor's Help command and from
`public/downloads/AuralisStudio-0.4.0-source.zip` in the repository. Regenerate it
with `python3 scripts/package-source.py` after changing the source.
