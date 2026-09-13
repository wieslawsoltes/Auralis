import {qualificationDialog} from './qualification.js';
import {WorkspaceWindows} from './window-manager.js';
import {hasNativeInserts,legacyChain,createInsert,processingLatency} from '../modules/audio/chain-config.js';
import {AdvancedEditing} from './advanced-editing.js';
import { coefficients, bakeClipModifiers } from '../modules/audio/dsp.js';
import { WorkstationUI } from './workstation.js';
import { commands, commandMap, unavailable, formatPosition, parsePosition, snapTime } from './commands.js';
import { AudioEngine, createDemo, encodeWav, decodeWav, editPCM, dbToGain, clamp, spectrum, WavPCMProvider, readAsset, renderToSink, readSpectrogramWindows } from '../modules/audio/index.js';
import { WaveformRenderer } from '../modules/renderer/index.js';
import { drawSpectrum } from '../modules/controls/index.js';
import { createProject, History, uid, durationOf, splitClip, validateProject } from '../modules/session/model.js';
import { SessionClient, isStaticDeployment, apiURL, apiFetch } from '../modules/session/client.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = { wave: 'M2 12h2l2-8 3 16 3-13 3 10 3-14 2 9h2', folder: 'M3 6h6l2 2h10v12H3z M3 6V4h6l2 2', save: 'M4 3h14l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8', share: 'M12 16V3m-4 4 4-4 4 4 M5 12v8h14v-8', render: 'M12 3v12m-4-4 4 4 4-4 M4 16v5h16v-5', chevron: 'm8 10 4 4 4-4', undo: 'm8 5-5 5 5 5 M3 10h11a6 6 0 0 1 0 12', redo: 'm16 5 5 5-5 5 M21 10H10a6 6 0 0 0 0 12', cut: 'M4 4 20 20 M4 20 20 4 M3 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0 M3 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0', cursor: 'm5 3 14 9-7 2-3 7z', range: 'M5 4v16M19 4v16M2 4h6M16 4h6M2 20h6M16 20h6 M9 12h6', zoomIn: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12 M15 15l6 6 M7 10h6 M10 7v6', zoomOut: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12 M15 15l6 6 M7 10h6', fit: 'M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4', play: 'm8 5 11 7-11 7z', pause: 'M8 5v14M16 5v14', stop: 'M6 6h12v12H6z', record: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', back: 'M5 5v14M19 5 7 12l12 7z', forward: 'M19 5v14M5 5l12 7-12 7z', loop: 'M4 8a4 4 0 0 1 4-4h10l3 3-3 3 M20 16a4 4 0 0 1-4 4H6l-3-3 3-3', marker: 'M6 21V3h12l-3 5 3 5H6', plus: 'M12 5v14M5 12h14', power: 'M12 3v9 M7 5a8 8 0 1 0 10 0', settings: 'M4 7h16M4 17h16 M8 4v6M16 14v6', search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12 M15 15l6 6', close: 'm6 6 12 12 M6 18 18 6', headphones: 'M4 14v-2a8 8 0 0 1 16 0v2 M4 12H2v8h5v-8z M20 12h2v8h-5v-8z', check: 'm5 12 4 4L20 5', history: 'M4 5v6h6 M4 11a8 8 0 1 1 1 7 M12 7v6l4 2', grid: 'M3 4h18v6H3z M3 14h18v6H3z M7 4v6M15 14v6', spark: 'm12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2z', batch: 'M3 4h14v4H3z M5 11h14v4H5z M7 18h14v4H7z', trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7M14 10v7', copy: 'M8 8h12v13H8z M16 8V3H3v13h5', comment: 'M3 4h18v13H9l-6 4z', menu: 'M4 6h16M4 12h16M4 18h16', info: 'M12 11v6M12 7v1 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', file: 'M5 3h9l5 5v13H5z M14 3v5h5', speaker: 'M3 9h4l5-5v16l-5-5H3z M16 8a5 5 0 0 1 0 8 M19 5a9 9 0 0 1 0 14' };
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.wave}"/></svg>`;
const button = (action, title, ico, classes = 'icon-btn', extra = '') => `<button class="${classes}" data-action="${action}" title="${esc(title)}" aria-label="${esc(title)}" ${extra}>${icon(ico)}</button>`;
const time = t => { t = Math.max(0, t || 0); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor(t % 1 * 1000)).padStart(3, '0')}`; };
const num = (v, n = 1) => Number.isFinite(v) ? v.toFixed(n) : '—';
const engine = new AudioEngine(), client = new SessionClient(), history = new History();
let project = createProject(), projectGeneration=0;
engine.addAsset(createDemo());
let selectedId = 'clip-demo', mode = 'audio', leftTab = 'files', viewStart = 0, viewDuration = 48, cursor = 0, selection = [0, 0], tool = 'range', loop = false, analysis = null, dirty = true, saving = false, changeSerial = 0, role = 'owner', user = null, comments = [], members = [], clipboard = null, renderer = null, spectral = false, recording = false, filter = '', operation = false, conflict = false;
let lastMeter = 0, loading = false, recordPending = false;
let workstation = null, selectedTrackId = null, noiseProfile = null, frequencySelection = null, spectralKey = '', spectralToken = 0;
let nativeAudition=null, workspaceWindows=null;
let advanced = null, previewProject = null;
let effectGesture = null, trackOffset = 0;
const noteDrafts = new Map();
const selected = () => project.clips.find(c => c.id === selectedId) || project.clips[0];
const activeAsset = () => engine.assets.get(selected()?.assetId);
const isEditor = () => ['owner', 'editor'].includes(role);
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = 'visible' + (error ? ' error' : ''); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', error ? 8500 : 4200); }
function editable() {
    if (saving || loading)
        throw Error('Wait for the project operation to finish.');
    if (!isEditor())
        throw Error('This project is read-only. Save a copy to edit it.');
}
function snapshot(label) { editable(); history.push(project, label); dirty = true; changeSerial++; conflict = false; }
function markChanged() { dirty = true; changeSerial++; updateStatus(); }
function updateStatus() {
    const s = $('#save-state');
    if (s)
        s.innerHTML = icon(saving ? 'history' : dirty ? 'file' : 'check') + (saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved');
    if ($('#project-name'))
        $('#project-name').textContent = project.name;
    if ($('#undo'))
        $('#undo').disabled = !history.past.length;
    if ($('#redo'))
        $('#redo').disabled = !history.future.length;
    if ($('#status-project'))
        $('#status-project').textContent = project.id ? 'Version ' + project.revision + ' · ' + role : 'Unsaved project';
}
function shell() {
    document.title = 'Auralis Studio · ' + project.name;
    $('#app').innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><img src="../favicon.svg" alt="">auralis<small>STUDIO</small></div><nav class="topnav" aria-label="Application"><button data-action="file-menu">File</button><button data-action="edit-menu">Edit</button><button data-action="process-menu">Process</button><button data-action="analysis">Analysis</button><button data-action="professional">Studio tools</button><button data-action="help">Help</button></nav><div class="spacer"></div>${button('undo', 'Undo · Ctrl Z', 'undo', 'icon-btn', 'id="undo"')}${button('redo', 'Redo · Ctrl Shift Z', 'redo', 'icon-btn', 'id="redo"')}<span class="separator"></span><button class="btn share-label" data-action="share">${icon('share')} Collaborate</button><button class="btn primary" data-action="render">${icon('render')} Render</button></header><div class="projectbar">${button('projects', 'Open project', 'folder')}<button class="project-name" data-action="rename"><span id="project-name">${esc(project.name)}</span>${icon('chevron')}</button><span class="document-tag">MASTERING SESSION</span><span class="spacer"></span><span id="save-state" class="save-state"></span>${button('save', 'Save project · Ctrl S', 'save')}<span id="presence"><span class="avatar" title="You">YO</span></span></div><nav class="workspace-tabs" aria-label="Workspace"><button data-action="mode-audio" class="active">${icon('wave')} Audio Editor</button><button data-action="mode-montage">${icon('grid')} Audio Montage</button><button data-action="batch">${icon('batch')} Batch Processor</button><button data-action="analysis">${icon('spark')} Analysis</button><span class="workspace-hint">PRECISION IN EVERY DETAIL</span><button class="mobile-menu" data-action="professional" title="Studio tools">${icon('spark')}</button><button class="mobile-menu" data-action="toggle-rack" title="Master section">${icon('settings')}</button></nav><div class="workspace"><aside class="left-panel" id="left-panel"></aside><main class="center"><div class="edit-toolbar"><span class="mobile-tabs">${button('toggle-files', 'Files and tracks', 'folder')}</span>${button('tool-cursor', 'Move clips / place cursor', 'cursor', 'icon-btn tool')}${button('tool-range', 'Select audio range', 'range', 'icon-btn tool active')}<span class="separator"></span>${button('split', 'Split clip at cursor · S', 'cut')}${button('delete', 'Delete selection · Delete', 'trash')}${button('fadeIn', 'Fade in', 'wave', 'icon-btn optional')}${button('fadeOut', 'Fade out', 'wave', 'icon-btn optional')}<span class="separator"></span>${button('add-marker', 'Add marker · M', 'marker')}<button class="btn small optional" data-action="process-menu">Process ${icon('chevron')}</button><span class="spacer"></span>${button('zoom-out', 'Zoom out · −', 'zoomOut')}<span id="zoom-label" class="zoom-label">1.0×</span>${button('zoom-in', 'Zoom in · +', 'zoomIn')}${button('fit', 'Fit audio · F', 'fit')}</div><div class="canvas-title"><span class="file-dot"></span><span id="clip-title"></span><span id="clip-spec" class="file-spec"></span>${button('clip-properties', 'Clip properties', 'settings', 'icon-btn')}</div><div id="wave-host" class="wave-host" tabindex="0" role="application" aria-label="Audio waveform. Drag to select audio, use space to play, S to split and M to add marker."></div><div class="wave-footer"><span>START <b id="sel-start">00:00.000</b></span><span>END <b id="sel-end">00:00.000</b></span><span>LENGTH <b id="sel-length">00:00.000</b></span><span class="spacer"></span><span class="optional">AMPLITUDE 2×</span></div><div class="overview" data-action="fit" title="Click to fit the session"><canvas id="overview"></canvas><div class="overview-window"></div></div><section class="analysis-area"><div class="analyzer"><div class="analyzer-head">Frequency spectrum <span id="fft-state">SOURCE · FFT 2048</span></div><canvas class="spectrum" id="spectrum"></canvas><div class="frequency-labels"><span>20 Hz</span><span>100</span><span>500</span><span>1k</span><span>5k</span><span>20k</span></div></div><div class="analyzer"><div class="analyzer-head">Loudness overview <button data-action="analysis" title="Analyze audio">${icon('settings')}</button></div><div class="loudness-grid"><div class="loudness-stat"><span class="value" id="integrated">—</span><span class="unit">LUFS</span><span class="label">Integrated · gated</span></div><div class="loudness-stat"><span class="value" id="peak">—</span><span class="unit">dBFS</span><span class="label">Sample peak</span></div><div class="loudness-stat"><span class="value" id="rms">—</span><span class="unit">dBFS</span><span class="label">RMS level</span></div><div class="loudness-stat"><span class="value" id="correlation">—</span><span class="unit"></span><span class="label">Stereo correlation</span></div></div><div class="loudness-note" id="analysis-caption">Analyzing original source audio…</div></div></section></main><aside class="right-panel" id="right-panel"></aside></div><footer class="transport"><div class="transport-controls">${button('home', 'Go to beginning · Home', 'back', 'optional')}${button('stop', 'Stop · Enter', 'stop')}${button('play', 'Play or pause · Space', 'play', 'play', 'id="play"')}${button('end', 'Go to end · End', 'forward', 'optional')}${button('record', 'Record microphone', 'record', 'record', 'id="record"')}${button('loop', 'Loop selected range · L', 'loop', '', 'id="loop"')}</div><div class="time-display"><small>CURSOR POSITION</small><span id="time">00:00.000</span></div><div class="transport-region"><span class="label">Selection</span><span id="transport-selection">—</span><span class="label">Session</span><span id="transport-duration">00:48.000</span></div><div class="transport-end"><select id="rate-select" aria-label="Session render sample rate"><option value="44100">44.1 kHz</option><option value="48000" selected>48 kHz</option><option value="96000">96 kHz</option></select>${button('monitor', 'Audio output settings', 'headphones')}<span class="sample-tag">STEREO</span></div></footer><div class="statusbar"><span class="ready" id="engine-status">Ready</span><span id="renderer-status">Canvas 2D</span><span class="optional">FLOAT32 PCM</span><span class="optional" id="status-project">Unsaved project</span><span class="status-right" id="status-detail">Auralis Studio 0.4</span></div></div>`;
    renderer = new WaveformRenderer($('#wave-host'));
    renderer.addEventListener('ready', () => $('#renderer-status').textContent = renderer.mode);
    renderLeft();
    renderRack();
    refresh();
    bindWave();
    updateStatus();
    workstation = new WorkstationUI({ state: workspaceState, icon, dispatch: a => run(() => applyAction(a)), selectClip: (id) => run(() => selectClip(id)), modal, refresh, resize: () => renderer.render(), markerDialog: id => run(() => markerDialog(id)), historyJump: count => run(async () => { editable(); if (operation || saving || loading)
            throw Error('Wait for the current operation.'); for (let i = 0; i < count; i++)
            await applyAction('undo'); }), removeEnvelopePoint: i => editProject('Remove envelope point', p => p.clips.find(c => c.id === selectedId).automation.splice(i, 1)), bindEnvelope, redrawMeters: () => { if (analysis)
            drawSpectrum($('#spectrum'), analysis.spectrum, { color: '#80b9f1' }); const a = activeAsset(); if (a && !a.provider)
            drawPhase(a.channels.map(c => c.subarray(0, 2048))); } });
    renderLeft();
    renderRack();
    refresh();
    advanced = new AdvancedEditing({state:workspaceState,serial:()=>changeSerial,frequencySelection:()=>frequencySelection,selectionChanged:()=>{renderLeft();analyzeSource();},renderer,run,toast,modal,showMaster:()=>{workstation.prefs.showMaster=true;workstation.applyLayout();},refreshRack:renderRack,edit:editProject,input:inputModal,dispatch:applyAction,pause:()=>engine.pause(),refresh,view:()=>({start:viewStart,duration:viewDuration,tool}),snap:snapPosition,nudge:()=>workstation.prefs.nudge,preview:p=>previewProject=p,set:values=>{if('selectedId' in values)selectedId=values.selectedId;if('selectedTrackId' in values)selectedTrackId=values.selectedTrackId;if('cursor' in values){cursor=values.cursor;engine.position=cursor;}if('selection' in values)selection=values.selection;if('frequencySelection' in values)frequencySelection=values.frequencySelection;if('clipboard' in values)clipboard=values.clipboard;},nativeInsert:()=>nativeInsertDialog(),nativeEditor:id=>nativeEditorDialog(id)});
    workspaceWindows=new WorkspaceWindows({state:workspaceState,serial:()=>changeSerial,levels:()=>{const bins=engine.analyser?new Float32Array(engine.analyser.frequencyBinCount):null;if(bins&&engine.playing)engine.analyser.getFloatFrequencyData(bins);return {peaks:[$('#peak-hold-l'),$('#peak-hold-r')].map(e=>Number(e?.textContent)||-60),bins:engine.playing?bins:analysis?.spectrum};},prepare:kind=>{if(kind==='clips'||kind==='markers')applyAction(kind+'-panel');if(kind==='inspector')showLeftTab('inspector');},restore:kind=>{if(kind==='master'){workstation.prefs.showMaster=true;workstation.applyLayout();}refresh();},command:async(action,id)=>{if(!commandMap.has(action)&&action!=='seek-marker')throw Error('Command unavailable in detached window.');await applyAction(action,{dataset:{id}});},insert:(action,id)=>advanced.insertAction(action,id),parameters:(id,values)=>advanced.changeInsert(id,n=>{for(const [key,value]of Object.entries(values)){if(key==='wet')n.wet=value;else if(Object.hasOwn(n.params,key))n.params[key]=value;else throw Error('Unknown parameter.');}}),parameter:(id,key,value)=>advanced.changeInsert(id,n=>{if(key==='wet')n.wet=value;else if(Object.hasOwn(n.params,key))n.params[key]=value;else throw Error('Unknown parameter.');}),effect:(key,value)=>editProject('Detached master control',p=>{const parts=key.split('.');if(parts.length===1&&key==='output')p.effects.output=value;else if(parts.length===2&&['eq','compressor','limiter'].includes(parts[0])&&Object.hasOwn(p.effects[parts[0]],parts[1]))p.effects[parts[0]][parts[1]]=value;else throw Error('Unknown master control.');}),select:id=>selectClip(id,false),form:(values,id)=>editProject('Detached clip properties',p=>{const c=p.clips.find(c=>c.id===id);if(!c)throw Error('Clip no longer exists.');for(const k of ['start','offset','duration','gain','fadeIn','fadeOut'])c[k]=Number(values[k]);c.name=String(values.name);c.trackId=String(values.trackId);c.mute=values.mute==='on';})});
    renderRack();refresh();
    bindOverview();
    requestAnimationFrame(tick);
}
function renderLeft() {
    const draft = $('#comment-text');
    if (draft)
        noteDrafts.set(draft.dataset.projectid || '', draft.value);
    const items = project.assets.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
    $('#left-panel').innerHTML = `<div class="panel-heading"><span>Project workspace</span>${button('import', 'Import audio', 'plus')}</div><div class="mini-tabs"><button class="${leftTab === 'files' ? 'active' : ''}" data-action="left-files">Files</button><button class="${leftTab === 'inspector' ? 'active' : ''}" data-action="left-inspector">Inspector</button><button class="${leftTab === 'tracks' ? 'active' : ''}" data-action="left-tracks">Tracks</button><button class="${leftTab === 'notes' ? 'active' : ''}" data-action="left-notes">Notes</button></div>${leftTab === 'inspector' ? inspectorHTML() : leftTab === 'files' ? `<div class="search">${icon('search')}<input id="asset-search" placeholder="Find an audio file" value="${esc(filter)}" aria-label="Find an audio file"></div><div>${items.map(a => `<button class="asset ${a.id === selected()?.assetId ? 'active' : ''}" data-action="select-asset" data-id="${esc(a.id)}"><span class="asset-top">${icon('wave')}<span class="asset-name">${esc(a.name)}</span></span><span class="asset-meta">${num(a.sampleRate / 1000, 1)} kHz · ${time(a.duration)} ${a.demo ? '· SAMPLE' : ''}</span><canvas class="miniwave" data-asset-wave="${esc(a.id)}"></canvas></button>`).join('')}</div><div class="import-area">Drop audio into your session<br><button data-action="import">Browse files ${icon('plus')}</button></div><div class="panel-heading"><span class="eyebrow">MARKERS</span>${button('add-marker', 'Add marker', 'plus')}</div>${project.markers.map(m => `<div class="marker-row"><button data-action="seek-marker" data-id="${esc(m.id)}"><span class="time">${time(m.time)}</span> ${esc(m.name)}</button>${button('remove-marker', 'Remove marker', 'close', 'icon-btn', `data-id="${esc(m.id)}"`)}</div>`).join('')}` : leftTab === 'tracks' ? `<div class="panel-heading"><span class="eyebrow">${project.tracks.length} TRACKS</span>${button('add-track', 'Add track', 'plus')}</div>${project.tracks.map(t => `<div class="track-row"><div class="track-row-header"><span style="color:${/^#[a-f0-9]{6}$/i.test(t.color) ? t.color : '#d7ec94'}">▰</span><button data-action="rename-track" data-id="${esc(t.id)}" style="border:0;width:auto;flex:1;justify-content:flex-start;font:12px inherit">${esc(t.name)}</button><button data-action="mute-track" data-id="${esc(t.id)}" class="${t.mute ? 'active' : ''}">M</button><button data-action="solo-track" data-id="${esc(t.id)}" class="${t.solo ? 'active' : ''}">S</button></div><input type="range" min="-60" max="12" step=".1" value="${t.gain}" data-track-gain="${esc(t.id)}" aria-label="${esc(t.name)} gain"><div class="effect-line"><span>${num(t.gain)} dB</span><button data-action="track-properties" data-id="${esc(t.id)}">${icon('settings')}</button></div></div>`).join('')}` : `<div class="panel-heading"><span class="eyebrow">TIME-STAMPED COMMENTS</span>${button('refresh-notes', 'Refresh comments', 'history')}</div>${!project.id ? '<div class="empty">Save this project to add notes<br>and collaborate with your team.</div>' : comments.length ? comments.map(c => `<div class="comment ${c.resolved ? 'resolved' : ''}"><div class="comment-head"><span>${esc(c.name)}</span><button data-action="comment-seek" data-time="${c.time}">${time(c.time)}</button></div><p>${esc(c.body)}</p><button class="btn small" data-action="resolve-comment" data-id="${esc(c.id)}" data-resolved="${c.resolved ? 0 : 1}">${c.resolved ? 'Reopen' : 'Resolve'}</button></div>`).join('') : '<div class="empty">No comments yet.<br>Add a note at the cursor position.</div>'}<form id="comment-form" class="comment-form"><textarea id="comment-text" data-projectid="${esc(project.id || '')}" placeholder="Leave a note at ${time(cursor)}…" rows="3" aria-label="Comment">${esc(noteDrafts.get(project.id || '') || '')}</textarea><button class="btn small" style="margin-top:9px" type="submit">${icon('comment')} Add note</button></form>`}<div class="left-footer"><div class="label">SESSION FORMAT</div><p>${project.sampleRate / 1000} kHz <span style="color:#73837c">/</span> Stereo <span style="color:#73837c">/</span> Float32</p></div>`;
    drawMiniwaves();
}
function knob(path, label, value, min = -12, max = 12, unit = 'dB') { return `<audio-knob data-effect="${path}" label="${label}" value="${value}" min="${min}" max="${max}" unit="${unit}"></audio-knob>`; }
function renderRack() { renderLegacyRack(); advanced?.rack(); const h=$('#right-panel .rack-header');if(h)h.insertAdjacentHTML('beforeend','<button data-action="detach-master" title="Detach master window" aria-label="Detach master window">▣</button>'); }
function renderLegacyRack() { const e = project.effects; $('#right-panel').innerHTML = `<div class="rack-header">Master section ${button('bypass', 'Bypass all processing', 'power', 'power ' + (e.bypass ? 'off' : ''))}</div><div class="preset-row"><select id="master-preset" aria-label="Mastering preset"><option value="custom" disabled selected>${esc(e.preset || 'Default · Clean master')}</option><option value="clean">Clean master</option><option value="warm">Warm & balanced</option><option value="punch">Punch & presence</option><option value="broadcast">Gentle dynamics</option></select>${button('save-preset', 'Save effects preset', 'save')}</div><div class="effect-card"><div class="effect-title"><span class="effect-num">01</span>${icon('wave')}<span class="effect-label">Studio Equalizer</span>${button('toggle-eq', 'Enable / bypass equalizer', 'power', 'power ' + (!e.eq.enabled ? 'off' : ''))}</div><div class="effect-curve"><svg viewBox="0 0 230 52" preserveAspectRatio="none"><path id="eq-response-path" d="${eqResponsePath()}" fill="none" stroke="#c5df87" stroke-width="1.5"/><circle cx="35" cy="${26 - e.eq.low}" r="3" fill="#d7ec94"/><circle cx="112" cy="${26 - e.eq.mid}" r="3" fill="#d7ec94"/><circle cx="200" cy="${26 - e.eq.high}" r="3" fill="#d7ec94"/></svg></div><div class="knobs">${knob('eq.low', 'Low', e.eq.low)}${knob('eq.mid', 'Mid', e.eq.mid)}${knob('eq.high', 'High', e.eq.high)}</div><div class="effect-line"><span>120 Hz</span><button data-action="eq-details" class="effect-value">${e.eq.frequency} Hz · Q ${e.eq.q}</button><span>8 kHz</span></div></div><div class="effect-card"><div class="effect-title"><span class="effect-num">02</span>${icon('settings')}<span class="effect-label">Studio Compressor</span>${button('toggle-compressor', 'Enable / bypass compressor', 'power', 'power ' + (!e.compressor.enabled ? 'off' : ''))}</div><div class="knobs">${knob('compressor.threshold', 'Threshold', e.compressor.threshold, -48, 0)}${knob('compressor.ratio', 'Ratio', e.compressor.ratio, 1, 12, ':1')}${knob('compressor.makeup', 'Makeup', e.compressor.makeup, 0, 12)}</div><div class="effect-line"><button data-action="dynamics-details">Attack ${e.compressor.attack} ms</button><button data-action="dynamics-details">Release ${e.compressor.release} ms</button></div></div><div class="effect-card"><div class="effect-title"><span class="effect-num">03</span>${icon('speaker')}<span class="effect-label">Peak Limiter</span>${button('toggle-limiter', 'Enable / bypass limiter', 'power', 'power ' + (!e.limiter.enabled ? 'off' : ''))}</div><div class="effect-line"><span>Output ceiling</span><input type="range" aria-label="Limiter output ceiling" data-effect="limiter.ceiling" min="-12" max="0" step=".1" value="${e.limiter.ceiling}"><span class="effect-value" id="ceiling-value">${num(e.limiter.ceiling)} dB</span></div><div class="effect-line"><span>5 ms lookahead</span><button data-action="limiter-details">Release ${e.limiter.release} ms</button></div></div><button class="add-effect" data-action="effects-info">${icon('plus')} Processing options</button><div class="output-head"><span>Master output</span><span class="effect-value" id="output-value">${num(e.output)} dB</span></div><div class="output-content"><div class="meter-bank"><div class="meter-line">L <div class="meter-track"><div class="meter-fill" id="meter-l"></div></div></div><div class="meter-line">R <div class="meter-track"><div class="meter-fill" id="meter-r"></div></div></div><div class="meter-scale"><span>−60</span><span>−24</span><span>−12</span><span>0</span></div></div><input class="master-fader" type="range" data-effect="output" value="${e.output}" min="-24" max="12" step=".1" aria-label="Master output gain"></div><div class="rack-meter-values"><span>L <b id="peak-hold-l">−∞</b> dBFS</span><span>R <b id="peak-hold-r">−∞</b> dBFS</span></div><div class="rack-tools"><button data-action="limiter-details">Limiter settings</button><button data-action="native">Native processing</button><button data-action="delivery">Delivery</button><button data-action="monitor">Monitoring</button></div>`; }
function refresh() { document.title = project.name + ' — Auralis Studio'; const c = selected(), a = activeAsset(); if (spectral && (mode !== 'audio' || !c || !a)) {
    spectral = false;
    frequencySelection = null;
    clearSpectral();
} $('#clip-title').textContent = c?.name || 'Empty session'; $('#clip-spec').textContent = a ? `${a.channels.length === 2 ? 'STEREO' : 'MONO'} · ${a.sampleRate / 1000} kHz · ${a.channels[0].length.toLocaleString()} SAMPLES` : 'Import an audio file to begin'; renderer.setScene({ project: previewProject || project, selectedIds: advanced?.selectedIds(), assets: engine.assets, selectedId, viewStart, viewDuration, mode, selection, amplitude: workstation?.prefs.amplitude || 1, spectral, frequencySelection: advanced?.processingMask() ? null : frequencySelection, trackOffset, cursor: mode === 'audio' ? cursor - (c?.start || 0) : cursor }); $('#sel-start').textContent = time(selection[0]); $('#sel-end').textContent = time(selection[1]); $('#sel-length').textContent = time(selection[1] - selection[0]); $('#transport-selection').textContent = selection[1] > selection[0] ? time(selection[1] - selection[0]) : '—'; $('#transport-duration').textContent = time(durationOf(project)); $('#zoom-label').textContent = (Math.max(1, mode === 'audio' ? (c?.duration || 1) : durationOf(project)) / viewDuration).toFixed(1) + '×'; $('#rate-select').value = project.sampleRate; $$('.workspace-tabs button[data-action^="mode"]').forEach(b => b.classList.toggle('active', b.dataset.action === 'mode-' + mode)); $$('.tool').forEach(b => b.classList.toggle('active', b.dataset.action === 'tool-' + tool)); updateStatus(); drawOverview(); workstation?.update(); advanced?.refresh(); if (spectral)
    renderSpectral().catch(e => toast(e.message, true)); }
function fit() { viewStart = 0; viewDuration = mode === 'audio' ? (selected()?.duration || 48) : durationOf(project) * 1.04; refresh(); }
function drawMiniwaves() {
    for (const canvas of $$('[data-asset-wave]')) {
        const a = engine.assets.get(canvas.dataset.assetWave);
        if (!a)
            continue;
        const w = canvas.clientWidth || 160, h = 20;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#d2e395';
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const [lo, hi] = renderer?.peaks(a.channels[0], x / w * a.channels[0].length, (x + 1) / w * a.channels[0].length) || [0, 0];
            ctx.moveTo(x, h / 2 + lo * h);
            ctx.lineTo(x, h / 2 + hi * h);
        }
        ctx.stroke();
    }
}
function drawOverview() { const canvas = $('#overview'); if (!canvas)
    return; const w = canvas.clientWidth, h = canvas.clientHeight; canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'), total = mode === 'audio' ? (selected()?.duration || 1) : durationOf(project), clips = mode === 'audio' ? (selected() ? [selected()] : []) : project.clips; ctx.clearRect(0, 0, w, h); for (const clip of clips) {
    const a = engine.assets.get(clip.assetId);
    if (!a)
        continue;
    const start = mode === 'audio' ? 0 : clip.start, end = start + clip.duration;
    ctx.strokeStyle = mode === 'audio' ? '#b8b784' : project.tracks.find(t => t.id === clip.trackId)?.color || '#8eb9d8';
    ctx.beginPath();
    for (let x = Math.max(0, Math.floor(start / total * w)); x < Math.min(w, end / total * w); x += 1.5) {
        const local = x / w * total - start;
        const [lo, hi] = renderer.peaks(a.channels[0], (clip.offset + local) * a.sampleRate, Math.min(clip.offset + clip.duration, clip.offset + local + total / w * 1.5) * a.sampleRate);
        ctx.moveTo(x, h / 2 + lo * h * .45);
        ctx.lineTo(x, h / 2 + hi * h * .45);
    }
    ctx.stroke();
} const box = $('.overview-window'); box.style.left = (viewStart / total * 100) + '%'; box.style.width = Math.min(100, viewDuration / total * 100) + '%'; box.style.right = 'auto'; }
function bindOverview() { const el = $('.overview'); let drag; el.onpointerdown = e => { if (e.button !== 0)
    return; const r = el.getBoundingClientRect(), total = mode === 'audio' ? (selected()?.duration || 1) : durationOf(project), t = (e.clientX - r.left) / r.width * total; if (t < viewStart || t > viewStart + viewDuration)
    viewStart = clamp(t - viewDuration / 2, 0, Math.max(0, total - viewDuration)); drag = { x: e.clientX, start: viewStart, total }; el.setPointerCapture(e.pointerId); refresh(); }; el.onpointermove = e => { if (!drag)
    return; viewStart = clamp(drag.start + (e.clientX - drag.x) / el.clientWidth * drag.total, 0, Math.max(0, drag.total - viewDuration)); refresh(); }; el.onpointerup = el.onpointercancel = () => drag = null; }
async function analyzeSource() {
    const a = activeAsset();
    if (!a) {
        analysis = null;
        updateAnalysis({});
        $('#analysis-caption').textContent = 'No source selected';
        return;
    }
    const id = a.id;
    $('#analysis-caption').textContent = 'Analyzing original source audio…';
    try {
        const result = a.provider?.analysis || await engine.job('analyze', { channels: a.channels, sampleRate: a.sampleRate });
        if (activeAsset()?.id !== id)
            return;
        analysis = result;
        updateAnalysis(result);
        $('#analysis-caption').textContent = 'Original source · before master processing';
        if (!engine.playing)
            drawSpectrum($('#spectrum'), result.spectrum);
    }
    catch (e) {
        toast(e.message, true);
    }
}
function updateAnalysis(a) {
    for (const [selector, key] of [['#integrated', 'integrated'], ['#peak', 'samplePeak'], ['#rms', 'rms'], ['#correlation', 'correlation']])
        $(selector).textContent = num(a[key], key === 'correlation' ? 2 : 1);
}
function tick(now) {
    const pos = engine.playing ? engine.getPosition() : cursor;
    if (engine.playing) {
        cursor = pos;
        renderer.drawCursor(mode === 'audio' ? cursor - (selected()?.start || 0) : cursor);
    }
    $('#time').textContent = formatPosition(pos, workstation?.prefs.format || 'time', project.sampleRate);
    if (engine.playing && workstation?.prefs.follow) {
        const local = mode === 'audio' ? cursor - (selected()?.start || 0) : cursor;
        if (local > viewStart + viewDuration * .95 || local < viewStart) {
            viewStart = Math.max(0, local - viewDuration * .15);
            refresh();
        }
    }
    if (now - lastMeter > 65) {
        lastMeter = now;
        if (engine.playing && engine.analyser) {
            const bins = new Float32Array(engine.analyser.frequencyBinCount);
            engine.analyser.getFloatFrequencyData(bins);
            drawSpectrum($('#spectrum'), bins);
            $('#fft-state').textContent = 'LIVE · FFT 4096';
            const phaseChannels = [];
            engine.meters.forEach((m, i) => {
                const data = new Float32Array(m.fftSize);
                m.getFloatTimeDomainData(data);
                phaseChannels.push(data);
                let peak = 0;
                for (const x of data)
                    peak = Math.max(peak, Math.abs(x));
                const db = 20 * Math.log10(Math.max(1e-6, peak));
                if (workstation) {
                    workstation.peakHold[i] = Math.max(workstation.peakHold[i], db);
                    const hold = $(i ? '#peak-hold-r' : '#peak-hold-l');
                    if (hold)
                        hold.textContent = num(workstation.peakHold[i]);
                }
                const el = $(i ? '#meter-r' : '#meter-l');
                if (el)
                    el.style.width = clamp((db + 60) / 60 * 100, 0, 100) + '%';
            });
            drawPhase(phaseChannels);
            if ($('#phase-scope-label'))
                $('#phase-scope-label').textContent = 'LIVE';
        }
        else {
            for (const s of ['#meter-l', '#meter-r'])
                if ($(s))
                    $(s).style.width = '0%';
            $('#fft-state').textContent = 'SOURCE · FFT 2048';
        }
    }
    requestAnimationFrame(tick);
}
function playbackProject() { if (mode !== 'audio')
    return project; const c = selected(); return { ...project, clips: c ? [{ ...c, mute: false }] : [], tracks: project.tracks.map(t => ({ ...t, mute: false, solo: false })) }; }
async function playback() {
    if (engine.playing) {
        engine.pause();
        cursor = engine.position;
        $('#play').innerHTML = icon('play');
        return;
    }
    const c = selected();
    if (!c)
        throw Error('Import audio before playing.');
    let start = cursor, end;
    if (loop && selection[1] > selection[0]) {
        start = selection[0] + (mode === 'audio' ? c.start : 0);
        end = selection[1] + (mode === 'audio' ? c.start : 0);
    }
    else if (start >= durationOf(project) - .02)
        start = 0;
    if (mode === 'audio') {
        start = clamp(start, c.start, c.start + c.duration);
        if (start >= c.start + c.duration - .001)
            start = c.start;
        end = end ?? c.start + c.duration;
    }
    if(hasNativeInserts(project.effects)){
        const finish=end??durationOf(project),key=JSON.stringify([projectGeneration,changeSerial,mode,selectedId,start,finish,project.sampleRate]);let cached=nativeAudition;
        if(cached?.key!==key){operation=true;workstation.update();try{toast('Rendering native chain for audition…');const r=await renderJob(playbackProject(),project.sampleRate,start,finish,{bits:32,float:true});const audio=decodeWav(r.buffer);const id='native-audition';engine.addAsset({id,name:'Native chain audition',...audio,duration:audio.channels[0].length/audio.sampleRate});cached=nativeAudition={key,id,duration:audio.channels[0].length/audio.sampleRate};}finally{operation=false;workstation.update();}}
        const p=structuredClone(project);p.effects.chain=[];p.clips=[{id:cached.id,assetId:cached.id,trackId:p.tracks[0].id,name:'Native audition',start,offset:0,duration:cached.duration,gain:0,fadeIn:0,fadeOut:0,automation:[]}];p.tracks=[{...p.tracks[0],gain:0,pan:0,mute:false,solo:false}];await engine.play(p,start,{end:finish,loop});
    }else await engine.play(playbackProject(), start, { end, loop });
    $('#play').innerHTML = icon('pause');
    $('#engine-status').textContent = 'Playing';
}
function stop() { engine.stop(); cursor = 0; $('#play').innerHTML = icon('play'); $('#engine-status').textContent = 'Ready'; refresh(); }
engine.addEventListener('ended', () => { $('#play').innerHTML = icon('play'); $('#engine-status').textContent = 'Ready'; cursor = engine.position; });
function bindWave() {
    const host = $('#wave-host');
    host.addEventListener('contextmenu', e => { e.preventDefault(); workstation.openMenu('Edit', { getBoundingClientRect: () => ({ left: e.clientX, bottom: e.clientY }), focus: () => host.focus() }, mode === 'audio' ? ['copy', 'cut', 'paste', 'select-all', 'selection-dialog', 'process-gain', 'process-normalize', 'restore-attenuate', 'analysis', 'render-selection'] : ['clip-properties', 'copy', 'duplicate', 'split', 'clip-mute', 'fade-panel', 'envelope-panel', 'delete']); });
    let drag = null;
    host.addEventListener('pointerdown', e => {
        if (e.button !== 0)
            return;
        if (saving || operation || loading || recording || recordPending)
            return;
        const rect = host.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, t = clamp(renderer.timeAt(x), 0, mode === 'audio' ? (selected()?.duration || 0) : 86400), g = renderer.geometry();
        if (x < g.left && mode === 'montage') {
            selectedTrackId = project.tracks[Math.max(0, Math.floor((y - g.top) / g.trackHeight) + g.trackOffset)]?.id;
            leftTab = 'tracks';
            renderLeft();
            return;
        }
        engine.pause();
        $('#play').innerHTML = icon('play');
        if (mode === 'montage') {
            const ti = Math.floor((y - g.top) / g.trackHeight) + g.trackOffset;
            const c = [...project.clips].reverse().find(c => c.trackId === project.tracks[ti]?.id && t >= c.start && t <= c.start + c.duration);
            if (c) {
                selectedId = c.id;
                selectedTrackId = c.trackId;
                if (tool === 'cursor' && isEditor()) {
                    snapshot('Move or trim clip');
                    const px = (t - c.start) / viewDuration * (g.w - g.left), right = (c.start + c.duration - t) / viewDuration * (g.w - g.left);
                    drag = { type: px < 9 ? 'trim-start' : right < 9 ? 'trim-end' : 'move', t, c: structuredClone(c), y };
                }
            }
        }
        cursor = t + (mode === 'audio' ? (selected()?.start || 0) : 0);
        engine.position = cursor;
        if (!drag) {
            selection = [t, t];
            drag = { type: 'range', t };
        }
        if (spectral && drag.type === 'range') {
            drag.frequency = spectralFrequency(y);
            frequencySelection = [drag.frequency, drag.frequency];
        }
        host.setPointerCapture(e.pointerId);
        refresh();
    });
    host.addEventListener('pointermove', e => {
        if (!drag)
            return;
        const rect = host.getBoundingClientRect(), raw = clamp(renderer.timeAt(e.clientX - rect.left), 0, mode === 'audio' ? (selected()?.duration || 0) : 86400), t = mode === 'montage' ? snapPosition(raw, e.altKey) : raw;
        if (spectral && drag.frequency != null) {
            const hz = spectralFrequency(e.clientY - rect.top);
            frequencySelection = [Math.min(hz, drag.frequency), Math.max(hz, drag.frequency)];
        }
        if (drag.type === 'range')
            selection = [Math.min(drag.t, t), Math.max(drag.t, t)];
        else {
            const c = selected(), delta = t - drag.t, a = engine.assets.get(c.assetId);
            if (drag.type === 'move') {
                c.start = Math.max(0, snapPosition(drag.c.start + delta, e.altKey));
                const g = renderer.geometry(), ti = clamp(Math.floor((e.clientY - rect.top - g.top) / g.trackHeight) + g.trackOffset, 0, project.tracks.length - 1);
                c.trackId = project.tracks[ti].id;
            }
            if (drag.type === 'trim-start') {
                const d = clamp(delta, -Math.min(drag.c.start, drag.c.offset), drag.c.duration - .01);
                c.start = drag.c.start + d;
                c.offset = drag.c.offset + d;
                c.duration = drag.c.duration - d;
                c.automation = [];
        delete c.fadeSource;
            }
            if (drag.type === 'trim-end') {
                c.duration = clamp(drag.c.duration + delta, .01, a.duration - drag.c.offset);
                c.automation = [];
        delete c.fadeSource;
            }
            c.fadeIn = Math.min(c.fadeIn, c.duration);
            c.fadeOut = Math.min(c.fadeOut, c.duration);
        }
        refresh();
    });
    const end = () => {
        if (drag && mode === 'montage')
            analyzeSource();
        if (drag && drag.type !== 'range') {
            renderLeft();
            markChanged();
        }
        drag = null;
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener('dblclick', () => {
        const c = selected();
        if (c) {
            selection = mode === 'audio' ? [0, c.duration] : [c.start, c.start + c.duration];
            refresh();
        }
    });
    host.addEventListener('wheel', e => {
        if (mode === 'montage' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            trackOffset = clamp(trackOffset + Math.sign(e.deltaY), 0, Math.max(0, project.tracks.length - 1));
            refresh();
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom(e.deltaY > 0 ? .8 : 1.25);
        }
        else if (e.shiftKey) {
            e.preventDefault();
            viewStart = Math.max(0, viewStart + e.deltaY / 100 * viewDuration * .1);
            refresh();
        }
    }, { passive: false });
    host.addEventListener('dragover', e => { e.preventDefault(); host.classList.add('dragover'); });
    host.addEventListener('dragleave', () => host.classList.remove('dragover'));
    host.addEventListener('drop', e => { e.preventDefault(); host.classList.remove('dragover'); run(() => importFiles(e.dataTransfer.files)); });
}
function zoom(factor) { const center = selection[1] > selection[0] ? (selection[0] + selection[1]) / 2 : cursor - (mode === 'audio' ? (selected()?.start || 0) : 0); viewDuration = clamp(viewDuration / factor, .025, Math.max(durationOf(project), selected()?.duration || 1) * 1.1); viewStart = Math.max(0, center - viewDuration / 2); refresh(); }
function modal(title, body, setup) {
    const d = $('#dialog');
    d.innerHTML = `<div class="dialog-header"><h2>${esc(title)}</h2>${button('close-dialog', 'Close', 'close')}</div><div class="dialog-body">${body}</div>`;
    if (!d.open)
        d.showModal();
    setup?.(d);
    d.querySelector('input,select,textarea,button')?.focus();
}
const actions = (label = 'Apply') => `<div class="dialog-actions"><button type="button" class="btn" data-action="close-dialog">Cancel</button><button type="submit" class="btn primary">${label}</button></div>`;
function inputModal(title, label, value, callback, { type = 'text', min = '', max = '', step = 'any' } = {}) { modal(title, `<form id="input-form"><label class="field">${esc(label)}<input id="input-value" type="${type}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" required></label>${actions()}</form>`, d => { d.querySelector('form').onsubmit = e => { e.preventDefault(); run(async () => { const val = type === 'number' ? Number($('#input-value').value) : $('#input-value').value; d.close(); await callback(val); }); }; }); }
async function run(fn) {
    try {
        const result = await fn();
        return result;
    }
    catch (e) {
        toast(e.message || String(e), true);
        console.error(e);
    }
    finally {
        workstation?.update();
    }
}
async function importFiles(files) {
    editable();
    if (operation)
        throw Error('Wait for the current audio operation to finish.');
    operation = true;
    try {
        for (const file of files) {
            toast('Importing ' + file.name + '…');
            const a = await engine.import(file);
            snapshot('Import ' + file.name);
            project.assets.push({ id: a.id, name: a.name, sampleRate: a.sampleRate, duration: a.duration });
            const clip = { id: uid(), trackId: project.tracks[0]?.id || 'track-1', assetId: a.id, name: a.name.replace(/\.[^.]+$/, ''), start: project.clips.length ? durationOf(project) : 0, offset: 0, duration: a.duration, gain: 0, fadeIn: 0, fadeOut: 0, automation: [] };
            if (!project.tracks.length)
                project.tracks.push({ id: 'track-1', name: 'Stereo master', gain: 0, pan: 0, mute: false, solo: false, color: '#d7ec94' });
            project.clips.push(clip);
            selectedId = clip.id;
            cursor = clip.start;
            selection = [0, 0];
        }
        mode = 'audio';
        fit();
        renderLeft();
        await analyzeSource();
        toast('Audio imported. Save the project to sync your sources.');
    }
    finally {
        operation = false;
        workstation?.update();
    }
}
async function saveProject(asCopy = false) {
    if(isStaticDeployment){modal('Save a browser session', `<p>Keep your work by downloading the project JSON and rendered audio. Project JSON references your source files; keep those files so you can relink them when reopening.</p><p>Use the standalone app for database-backed project saving and native processing, or the server-backed edition for collaboration.</p><div class="dialog-actions"><button class="btn" data-action="export-project">Download project JSON</button><button class="btn primary" data-action="render">Render audio</button></div>`);return;}

    if (saving)
        return;
    if (operation || loading || recording || recordPending)
        throw Error('Finish the current operation before saving.');
    if (!asCopy)
        editable();
    saving = true;
    updateStatus();
    const serial = changeSerial, original = project;
    try {
        const snapshot = structuredClone(project);
        if (asCopy) {
            snapshot.id = null;
            snapshot.revision = 0;
            snapshot.name += ' · Copy';
        }
        let result;
        if (!snapshot.id) {
            result = await client.create(snapshot);
            snapshot.id = result.project.id;
            snapshot.revision = result.project.revision;
            if (!asCopy) {
                project.id = snapshot.id;
                project.revision = snapshot.revision;
            }
        }
        for (const meta of snapshot.assets) {
            if (meta.demo)
                continue;
            const a = engine.assets.get(meta.id);
            if (!a)
                throw Error('Missing source ' + meta.name + '. Relink it before saving.');
            if (a.remoteProjectId === snapshot.id)
                continue;
            if (a.provider) {
                const file = a.file || await client.audio(a.remoteProjectId, meta.id);
                await client.uploadFile(snapshot.id, meta, file);
                continue;
            }
            const bytes = encodeWav(a.channels, a.sampleRate, { bits: 32, float: true, dither: false });
            await client.upload(snapshot.id, meta, bytes);
        }
        result = await client.save(snapshot);
        if (project !== original)
            throw Error('The session changed during saving. The saved version is available under Your projects.');
        if (asCopy) {
            project = result.project;
            role = 'owner';
            dirty = false;
            changeSerial++;
        }
        else {
            if (result.merged) {
                const hydrated = await hydrateSources(result.project, result.project.id);
                for (const [id, a] of hydrated)
                    engine.assets.set(id, a);
                history.past = [];
                toast('Independent edits merged automatically.');
            }
            project = result.project;
            dirty = changeSerial !== serial;
            renderLeft();
            renderRack();
            refresh();
        }
        conflict = false;
        watchProject();
        history.future = [];
        localStorage.setItem('auralis-last-project', project.id);
        toast(asCopy ? 'Project copy saved.' : 'Project and audio sources saved.');
    }
    catch (e) {
        dirty = true;
        if (e.status === 409) {
            conflict = true;
            if (e.body?.code === 'MERGE_CONFLICT') {
                conflictDialog(e.body);
                return;
            }
            modal('A newer version is available', `<p>Your edits are still here. Save them as a new project, or load the latest saved version.</p><div class="dialog-actions"><button class="btn" data-action="load-latest">Load latest</button><button class="btn primary" data-action="save-copy">Save my copy</button></div>`);
        }
        else
            throw e;
    }
    finally {
        saving = false;
        updateStatus();
    }
}
async function hydrateSources(next, id) {
    const assets = new Map();
    for (const meta of next.assets) {
        let asset = engine.assets.get(meta.id);
        if (asset && (meta.demo || asset.remoteProjectId === id || project.id === id)) {
            assets.set(meta.id, asset);
            continue;
        }
        if (meta.demo)
            asset = createDemo();
        else {
            const provider = await WavPCMProvider.open(apiURL('projects/' + id + '/assets/' + meta.id)), channels = await provider.index();
            asset = { id: meta.id, name: meta.name, provider, channels, sampleRate: provider.descriptor.sampleRate, duration: provider.descriptor.frames / provider.descriptor.sampleRate, remoteProjectId: id };
        }
        assets.set(meta.id, asset);
    }
    return assets;
}
async function loadProject(id) {
    if (loading || operation || saving || recording || recordPending)
        throw Error('Finish the current operation before opening a project.');
    loading = true;
    try {
        if (engine.playing)
            stop();
        toast('Loading project and audio…');
        const result = await client.load(id), next = validateProject(result.project), assets = await hydrateSources(next, id);
        project = next; projectGeneration++;
        engine.assets = assets;
        watchProject();
        role = result.role;
        selectedId = project.clips[0]?.id;
        history.past = [];
        history.future = [];
        clipboard = null;
        comments = [];
        members = [];
        cursor = 0;
        selection = [0, 0];
        dirty = false;
        changeSerial++;
        conflict = false;
        fit();
        renderLeft();
        renderRack();
        await analyzeSource();
        localStorage.setItem('auralis-last-project', id);
        toast('Project loaded.');
        $('#dialog').close();
    }
    finally {
        loading = false;
        workstation?.update();
    }
}
function guardUnsaved(next) {
    if (saving || operation || loading || recording || recordPending)
        throw Error('Finish the current operation before switching sessions.');
    if (!dirty)
        return next();
    modal('Keep your current edits?', `<p>This project has unsaved changes. Save a project copy to keep them before opening another session.</p><div class="dialog-actions"><button class="btn" id="discard-continue">Continue without saving</button><button class="btn primary" id="save-continue">Save and continue</button></div>`, d => {
        d.querySelector('#discard-continue').onclick = () => run(next);
        d.querySelector('#save-continue').onclick = () => run(async () => {
            await saveProject();
            if (!dirty)
                await next();
        });
    });
}
async function projectDialog() { modal('Your projects', '<p>Loading saved sessions…</p>'); const projects = await client.list(); modal('Your projects', `${projects.length ? projects.map(p => `<div class="list-item">${icon('folder')}<div class="detail">${esc(p.name)}<small>Version ${p.revision} · ${esc(p.role)} · ${new Date(p.updated).toLocaleDateString()}</small></div><button class="btn small" data-action="open-project" data-id="${esc(p.id)}">Open</button></div>`).join('') : '<p>No saved projects yet. Save your current session to get started.</p>'}<div class="dialog-actions"><button class="btn" data-action="join">Join with invitation</button><button class="btn primary" data-action="new">New project</button></div>`); }
function commitProcessedClip(action,c,a,channels,sr,baked=false){
 if(!Array.isArray(channels)||channels.length!==a.channels.length||!channels[0]?.length||channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length))throw Error('Processor returned invalid audio.');
 const id=uid(),name=(c.name+' · '+action).slice(0,230),duration=channels[0].length/sr,next=structuredClone(project),clip=next.clips.find(x=>x.id===c.id);
 if(!clip)throw Error('Processing destination no longer exists.');next.assets.push({id,name:name+'.wav',sampleRate:sr,duration});Object.assign(clip,{assetId:id,name,offset:0,duration,fadeIn:Math.min(c.fadeIn,duration),fadeOut:Math.min(c.fadeOut,duration)});if(baked){clip.automation=[];clip.fadeIn=0;clip.fadeOut=0;delete clip.fadeSource;}validateProject(next);
 snapshot(action);engine.addAsset({id,name:name+'.wav',sampleRate:sr,channels,duration});project=next;
}
async function processClip(action, amount = 0) {
    editable();
    if (operation)
        throw Error('An audio operation is already running.');
    const c = selected(), a = activeAsset(), destination=project, serial=changeSerial;
    if (!a || !c)
        throw Error('Select an audio clip.');
    const n = Math.round(c.duration * a.sampleRate), offset = Math.round(c.offset * a.sampleRate);
    if (n * a.channels.length * 4 > 96 * 1024 * 1024)
        throw Error('For a large source, trim a clip to the repair region before destructive processing.');
    let start = 0, end = n;
    if (selection[1] > selection[0]) {
        start = Math.round((selection[0] - (mode === 'montage' ? c.start : 0)) * a.sampleRate);
        end = Math.round((selection[1] - (mode === 'montage' ? c.start : 0)) * a.sampleRate);
        start = clamp(start, 0, n);
        end = clamp(end, start, n);
    }
    if (start === end)
        throw Error('The selection does not overlap this clip.');
    if (action === 'delete' && start === 0 && end === n) {
        snapshot('Delete entire clip');
        project.clips = project.clips.filter(x => x.id !== c.id);
        selectedId = project.clips[0]?.id;
        selection = [0, 0];
        renderLeft();
        fit();
        return;
    }
    operation = true;
    try {
        const source=await readAsset(a,offset,n);
        if(project!==destination||changeSerial!==serial||selected()?.id!==c.id)throw Error('The selection changed while loading audio.');
        const baked=['trim','delete'].includes(action);if(baked)bakeClipModifiers(source,c,a.sampleRate);
        engine.pause();
        $('#play').innerHTML = icon('play');
        toast('Processing ' + action + '…');
        let actual = action, value = amount;
        if (action === 'normalize') {
            let peak = 0;
            for (const ch of source)
                for (let i = start; i < end; i++)
                    peak = Math.max(peak, Math.abs(ch[i]));
            actual = 'gain';
            value = amount - 20 * Math.log10(Math.max(1e-12, peak));
        }
        const channels = await engine.job('edit', { channels: source, start, end, action: actual, amount: value });
        if(project!==destination||changeSerial!==serial||!isEditor())throw Error('The session changed during processing; result was not applied.');
        commitProcessedClip(action,c,a,channels,a.sampleRate,baked);
        selection = [0, 0];
        fit();
        renderLeft();
        await analyzeSource();
        toast('Applied ' + action + '. Undo is available.');
    }
    finally {
        operation = false;
        workstation?.update();
    }
}
function clipDialog() { const c = selected(); if (!c)
    throw Error('Select a clip.'); modal('Clip properties', inspectorHTML() + `<label class="field">Volume envelope (seconds:dB)<input id="numeric-envelope" value="${esc((c.automation || []).map(p => p.time + ':' + p.value).join(', '))}" placeholder="0:0, 5:-3, 10:0"></label><button id="apply-envelope" class="btn">Apply envelope points</button>`, d => { const form = d.querySelector('form'); form.onsubmit = e => { e.preventDefault(); e.stopPropagation(); run(() => { const f = new FormData(form); editProject('Clip properties', p => { const v = p.clips.find(v => v.id === c.id); v.name = String(f.get('name')); v.trackId = String(f.get('trackId')); v.mute = f.has('mute'); for (const k of ['start', 'offset', 'duration', 'gain', 'fadeIn', 'fadeOut'])
    v[k] = Number(f.get(k)); v.automation = (v.automation || []).filter(pt => pt.time <= v.duration); }); d.close(); }); }; $('#apply-envelope').onclick = () => run(() => { const text = $('#numeric-envelope').value, points = text.trim() ? text.split(',').map(v => { const [time, value] = v.trim().split(':').map(Number); return { time, value }; }).sort((a, b) => a.time - b.time) : []; editProject('Set volume envelope', p => p.clips.find(v => v.id === c.id).automation = points); d.close(); }); }); }
function exportDialog(scope = 'montage') {
    const c = selected();
    if (!c)
        throw Error('Import audio before rendering.');
    modal('Render audio', `<form id="render-form"><label class="field">File name<input name="filename" value="${esc(project.metadata?.title || project.name)} — master" required maxlength="120"></label><div class="form-grid"><label>Source<select name="source"><option value="session">Full montage</option><option value="clip">Selected clip</option><option value="selection" ${selection[1] > selection[0] ? '' : 'disabled'}>Time selection</option><option value="stems">Individual track stems</option></select></label><label>Sample rate<select name="rate"><option value="44100" ${project.sampleRate === 44100 ? 'selected' : ''}>44,100 Hz</option><option value="48000" ${project.sampleRate === 48000 ? 'selected' : ''}>48,000 Hz</option><option value="96000" ${project.sampleRate === 96000 ? 'selected' : ''}>96,000 Hz</option></select></label><label>WAV encoding<select name="encoding"><option value="24">24-bit PCM</option><option value="16">16-bit PCM</option><option value="float">32-bit floating point</option></select></label><label>Dither<select name="dither"><option value="tpdf">TPDF · integer PCM</option><option value="none">None</option></select></label><label>Artist<input name="artist" value="${esc(project.metadata?.artist || '')}"></label><label>Title<input name="title" value="${esc(project.metadata?.title || '')}"></label></div><p class="help">The enabled master chain is included. The limiter sets a sample-peak ceiling. Audio is rendered locally; WAV files download to your device.</p><div id="render-progress"></div>${actions('Render WAV')}</form>`, d => {
        d.querySelector('[name=source]').value = ['selection', 'stems', 'clip'].includes(scope) ? scope : 'session';
        d.querySelector('form').onsubmit = e => {
            e.preventDefault();
            run(async () => {
                if (operation)
                    throw Error('Wait for the current audio operation.');
                operation = true;
                const data = new FormData(e.target), button = e.target.querySelector('[type=submit]');
                button.disabled = true;
                $('#render-progress').innerHTML = '<progress></progress><p class="help">Rendering audio and analyzing the result…</p>';
                try {
                    const p = structuredClone(project), source = data.get('source'), rate = Number(data.get('rate')), encoding = data.get('encoding');
                    let start = 0, end = durationOf(p);
                    if (source === 'clip') {
                        p.clips = [structuredClone(c)];
                        start = c.start;
                        end = c.start + c.duration;
                    }
                    if (source === 'selection') {
                        start = selection[0] + (mode === 'audio' ? c.start : 0);
                        end = selection[1] + (mode === 'audio' ? c.start : 0);
                    }
                    const options = { bits: encoding === 'float' ? 32 : Number(encoding), float: encoding === 'float', dither: data.get('dither') === 'tpdf', metadata: { title: data.get('title'), artist: data.get('artist'), comment: project.metadata?.comment || '' } };
                    const jobs = source === 'stems' ? p.tracks.map(t => ({ p: { ...p, tracks: p.tracks.map(v => ({ ...v, mute: v.id !== t.id, solo: false })) }, suffix: ' — ' + t.name })) : [{ p, suffix: '' }];
                    for (const job of jobs) {
                        const result = await renderJob(job.p, rate, start, end, options);
                        download(result.buffer, String(data.get('filename')) + job.suffix + '.wav', 'audio/wav');
                        analysis = result.analysis;
                        updateAnalysis(analysis);
                        $('#analysis-caption').textContent = 'Last rendered output · master processing included';
                    }
                    $('#render-progress').innerHTML = '<p style="color:var(--accent)">Render complete. ' + jobs.length + ' WAV ' + (jobs.length === 1 ? 'file' : 'files') + ' downloaded.</p>';
                    toast('Render complete. Your WAV is ready.');
                }
                finally {
                    operation = false;
                    button.disabled = false;
                }
            });
        };
    });
}
async function renderJob(p, rate, start, end, options) {
    if(hasNativeInserts(p.effects)){
        if((end-start)*rate*8>88*1024*1024)throw Error('Native chain handoff is limited to 88 MB of stereo PCM. Render a shorter region.');
        const dry=structuredClone(p);dry.effects={...dry.effects,chain:[]};const source=await renderJob(dry,rate,start,end,{bits:32,float:true,dither:false});const header=new TextEncoder().encode(JSON.stringify({effects:p.effects})),prefix=new ArrayBuffer(4);new DataView(prefix).setUint32(0,header.length,true);const response=await apiFetch('/api/native/render-chain',{method:'POST',headers:{'content-type':'application/vnd.auralis.chain'},body:new Blob([prefix,header,source.buffer])});if(!response.ok)throw Error(await nativeResponseError(response));const audio=decodeWav(await response.arrayBuffer());return engine.job('finalize',{channels:audio.channels,sampleRate:rate,options});
    }
    if (p.clips.some(c => engine.assets.get(c.assetId)?.provider)) {
        const bytes = (Math.round(end * rate) - Math.round(start * rate)) * 2 * (options.bits || 24) / 8;
        if (bytes > 128 * 1024 * 1024) {
            throw Error('Use Studio tools → Delivery → Stream WAV to disk for exports over 128 MB.');
        }
        const parts = [];
        const analysis = await renderToSink(p, engine.assets, rate, start, end, { async write(b) { parts.push(b); }, async close() { } }, options);
        return { buffer: new Blob(parts, { type: 'audio/wav' }), analysis };
    }
    const assetIds = new Set(p.clips.map(c => c.assetId));
    const assets = [];
    for (const id of assetIds) {
        const a = engine.assets.get(id);
        if (!a)
            throw Error('Relink missing audio before rendering.');
        if (a.sampleRate === rate) {
            assets.push([id, a]);
            continue;
        }
        const n = Math.round(a.duration * rate);
        const offline = new OfflineAudioContext(a.channels.length, n, rate), buffer = offline.createBuffer(a.channels.length, a.channels[0].length, a.sampleRate);
        a.channels.forEach((c, i) => buffer.copyToChannel(c, i));
        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.connect(offline.destination);
        source.start();
        const result = await offline.startRendering();
        assets.push([id, { ...a, sampleRate: rate, channels: Array.from({ length: a.channels.length }, (_, i) => result.getChannelData(i)) }]);
    }
    return engine.job('render', { project: p, assets, sampleRate: rate, start, end, options });
}
function download(data, name, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name.replace(/[<>:"/\\|?*]/g, '-'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function processMenu() { modal('Process selected audio', `<button class="btn primary" data-action="restoration">Restoration, time & pitch</button><p>Choose an operation. It applies to the selected range, or the entire clip when no range is selected.</p><div class="form-grid">${[['gain', 'Gain…'], ['normalize', 'Peak normalize…'], ['fadeIn', 'Fade in'], ['fadeOut', 'Fade out'], ['reverse', 'Reverse'], ['invert', 'Invert polarity'], ['silence', 'Silence'], ['dc', 'Remove DC offset'], ['trim', 'Trim to selection'], ['delete', 'Delete selection']].map(([a, label]) => `<button class="btn" data-action="process-${a}">${label}</button>`).join('')}</div><p class="help">Processing creates a new source and preserves the original. Undo restores the previous clip.</p>`); }
async function shareDialog() {
    if (!project.id) {
        await saveProject();
        if (!project.id)
            return;
    }
    modal('Collaborate on this project', `<p>Invite someone to review, comment on, or edit this session. They will also need access to this private site.</p><label class="field">Invitation role<select id="invite-role"><option value="editor">Editor · edit, save, and comment</option><option value="commenter">Commenter · listen and leave notes</option><option value="viewer">Viewer · listen and inspect</option></select></label><div class="dialog-actions"><button class="btn" data-action="join">Join another project</button><button class="btn primary" id="create-invite">Create invitation</button></div><div id="invite-result"></div><p class="help">Saved projects merge independent edits automatically. Session changes arrive over an event stream; overlapping changes open a field review. Presence refreshes every 15 seconds. Invitations expire after 24 hours.</p><button class="btn" data-action="admin">Project administration</button>`, d => { $('#create-invite').onclick = () => run(async () => { const result = await client.invite(project.id, $('#invite-role').value), url = new URL(location.href); url.hash = 'join=' + result.token; $('#invite-result').innerHTML = `<label class="field" style="margin-top:15px">Invitation link<input id="invite-link" readonly value="${esc(url.href)}"></label><button class="btn small" id="copy-invite">Copy link</button>`; $('#copy-invite').onclick = () => run(async () => { await navigator.clipboard.writeText(url.href); toast('Invitation link copied.'); }); }); });
}
async function refreshNotes() {
    if (!project.id)
        return;
    const id = project.id, result = await client.comments(id);
    if (project.id !== id)
        return;
    comments = result;
    if (leftTab === 'notes' && document.activeElement?.id !== 'comment-text')
        renderLeft();
}
function joinDialog(token = '') { inputModal('Join a project', 'Paste an invitation link or code', token, async (v) => { const code = v.includes('#join=') ? v.split('#join=')[1] : v; const r = await client.join(code.trim()); await guardUnsaved(() => loadProject(r.projectId)); }); }
async function versionsDialog() {
    if (!project.id)
        throw Error('Save the project to create version history.');
    modal('Project versions', '<p>Loading versions…</p>');
    const versions = await client.versions(project.id);
    modal('Project versions', versions.map(v => `<div class="list-item">${icon('history')}<div class="detail">Version ${v.revision}<small>${esc(v.author)} · ${new Date(v.created).toLocaleString()}</small></div><button class="btn small" data-action="restore-version" data-revision="${v.revision}">Restore</button></div>`).join('') + '<p class="help">Restoring keeps the current version in history. Save the restored session to create a new version.</p>');
}
async function showAnalysis() {
    if (!analysis)
        await analyzeSource();
    const a = analysis;
    if (!a)
        throw Error('No audio to analyze.');
    modal('Audio analysis', `<p>${esc($('#analysis-caption').textContent.startsWith('Original') ? activeAsset()?.name : project.name + ' · processed output')}</p><div class="form-grid">${[['Integrated loudness', num(a.integrated) + ' LUFS'], ['True peak', Number.isFinite(a.truePeak) ? num(a.truePeak) + ' dBTP' : 'Not measured'], ['Maximum momentary', num(a.momentaryMax) + ' LUFS'], ['Maximum short-term', num(a.shortTermMax) + ' LUFS'], ['Loudness range', num(a.loudnessRange) + ' LU'], ['Sample peak', num(a.samplePeak) + ' dBFS'], ['RMS level', num(a.rms) + ' dBFS'], ['Stereo correlation', num(a.correlation, 3)], ['DC offset', num(a.dc, 7)], ['Samples at / above full scale', a.clipped.toLocaleString()], ['Duration', time(a.duration)], ['Sample frames', a.frames.toLocaleString()]].map(([k, v]) => `<div class="field">${k}<strong style="color:var(--text);font-size:17px;font-weight:500">${v}</strong></div>`).join('')}</div><p class="help">K-weighted, gated loudness with continuous momentary and short-term maxima. The meter passes the tested mono/stereo EBU v5 cases; this is conformance evidence, not external certification. Use Delivery to measure true peak and verify the encoded output.</p><div class="dialog-actions"><button class="btn" data-action="analyze-clip">Measure clip & true peak</button><button class="btn" data-action="analysis-report">Download report</button><button class="btn" data-action="spectrogram">Spectrogram</button><button class="btn primary" data-action="analyze-master">Analyze master</button></div>`);
}
async function analyzeMaster() {
    if (operation)
        throw Error('Wait for the current audio operation.');
    operation = true;
    toast('Analyzing the processed montage…');
    try {
        const result = await renderJob(project, project.sampleRate, 0, durationOf(project), { bits: 32, float: true, dither: false });
        analysis = result.analysis;
        updateAnalysis(analysis);
        $('#analysis-caption').textContent = 'Rendered montage · master processing included';
        await showAnalysis();
    }
    finally {
        operation = false;
        workstation?.update();
    }
}
async function showSpectrogram() { $('#dialog').close(); await handleWorkspaceAction('spectral-view', { dataset: {} }); }
function batchDialog() {
    modal('Batch processor', `<p>Process multiple files through the current master chain. Every source produces its own WAV download.</p><label class="field">Audio files<input id="batch-files" type="file" accept="audio/*,.wav,.flac,.mp3,.aiff" multiple></label><div class="form-grid"><label class="field">Encoding<select id="batch-bits"><option value="24">24-bit PCM WAV</option><option value="16">16-bit PCM WAV</option><option value="32">32-bit float WAV</option></select></label><label class="field">Sample rate<select id="batch-rate"><option value="48000">48 kHz</option><option value="44100">44.1 kHz</option><option value="96000">96 kHz</option></select></label></div><div id="batch-list"></div><div class="dialog-actions"><button class="btn primary" id="run-batch">Process files</button></div>`, d => {
        $('#run-batch').onclick = () => run(async () => {
            const files = [...$('#batch-files').files];
            if (!files.length)
                throw Error('Choose audio files first.');
            if (operation)
                throw Error('Wait for the current operation.');
            operation = true;
            $('#run-batch').disabled = true;
            const bits = Number($('#batch-bits').value), rate = Number($('#batch-rate').value);
            try {
                for (const f of files) {
                    const row = document.createElement('div');
                    row.className = 'batch-item';
                    row.textContent = f.name + ' · Processing…';
                    $('#batch-list').append(row);
                    let asset;
                    try {
                        asset = await engine.import(f);
                        const p = structuredClone(project);
                        p.tracks = [{ id: 'batch', name: 'Batch', gain: 0, pan: 0, mute: false, solo: false }];
                        p.clips = [{ id: 'batch-clip', trackId: 'batch', assetId: asset.id, name: f.name, start: 0, offset: 0, duration: asset.duration, gain: 0, fadeIn: 0, fadeOut: 0, automation: [] }];
                        const r = await renderJob(p, rate, 0, asset.duration, { bits, float: bits === 32, dither: bits !== 32 });
                        download(r.buffer, f.name.replace(/\.[^.]+$/, '') + ' — processed.wav', 'audio/wav');
                        row.textContent = f.name + ' · Complete';
                        row.style.color = 'var(--accent)';
                    }
                    catch (e) {
                        row.textContent = f.name + ' · ' + e.message;
                        row.style.color = 'var(--red)';
                    }
                    finally {
                        if (asset)
                            engine.assets.delete(asset.id);
                    }
                }
            }
            finally {
                operation = false;
                if ($('#run-batch'))
                    $('#run-batch').disabled = false;
            }
        });
    });
}
function fileMenu() { modal('File', `<div class="form-grid">${[['load-preset', 'Import master preset'], ['new', 'New session'], ['projects', 'Open saved project'], ['save', 'Save project'], ['save-copy', 'Save a copy'], ['import', 'Import audio'], ['relink', 'Relink source'], ['export-project', 'Download project JSON'], ['import-project', 'Open project JSON'], ['versions', 'Version history'], ['render', 'Render audio']].map(([a, s]) => `<button class="btn" data-action="${a}">${s}</button>`).join('')}</div>`); }
function helpDialog() { modal('Auralis Studio 0.4', `<p>A stereo audio editor and mastering workstation with independent audio, rendering, control, and session modules.</p><p><a class="btn primary" href="../downloads/AuralisStudio-0.4.0-source.zip" download>Download complete source package</a></p><div class="keyboard-list">${[...commandMap.values()].filter(c=>workstation.prefs.shortcuts[c.id]||c.shortcut).map(c=>`<span>${esc(c.label)}</span><kbd>${esc(workstation.prefs.shortcuts[c.id]||c.shortcut)}</kbd>`).join('')}</div><p class="help">Audio Editor copies PCM selections. Audio Montage copies clips; its pointer moves clips and trims their edges. Range mode selects time. Double-click a waveform to select its full duration.</p><p class="help">Correction and Spectrum expose restoration. Process contains time, pitch and native processing. Render includes delivery verification, disc authoring and ADM export. Workspace contains layout and tool-window controls. Ctrl/Cmd+K finds commands. The source package includes the workspace guide, capability matrix and verification results.</p>`); }
function eqDetails() { const e = project.effects.eq; modal('Equalizer settings', `<form id="eq-form"><div class="form-grid"><label class="field">Mid-band frequency (Hz)<input name="frequency" type="number" min="20" max="20000" value="${e.frequency}" required></label><label class="field">Mid-band Q<input name="q" type="number" min=".05" max="20" step=".05" value="${e.q}" required></label></div>${actions()}</form>`, d => { d.querySelector('form').onsubmit = ev => { ev.preventDefault(); run(() => { snapshot('Equalizer settings'); const f = new FormData(ev.target); e.frequency = Number(f.get('frequency')); e.q = Number(f.get('q')); engine.updateEffects(project.effects); renderRack(); updateStatus(); d.close(); }); }; }); }
function dynamicsDetails() { const c = project.effects.compressor; modal('Compressor timing', `<form><div class="form-grid"><label class="field">Attack (ms)<input name="attack" type="number" min=".1" max="500" step=".1" value="${c.attack}"></label><label class="field">Release (ms)<input name="release" type="number" min="5" max="5000" step="1" value="${c.release}"></label></div><p class="help">Linked stereo peak detection. Timing values are exponential envelope time constants.</p>${actions()}</form>`, d => { d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { snapshot('Compressor timing'); const data = new FormData(e.target); c.attack = Number(data.get('attack')); c.release = Number(data.get('release')); engine.updateEffects(project.effects); renderRack(); updateStatus(); d.close(); }); }; }); }
async function applyAction(action, b = { dataset: {} }) {
    workstation?.closeMenu();
    if (action === 'stop' && recording)
        return applyAction('record');
    const reason = unavailable(commandMap.get(action), workspaceState());
    if (reason)
        throw Error(reason);
    if ($('#command-query'))
        $('#dialog').close();
    if ((saving || loading || operation || recordPending) && !['stop', 'play'].includes(action))
        throw Error('Please wait for the current operation to finish.');
    if (recording && !['record', 'play', 'stop'].includes(action))
        throw Error('Stop recording before changing the session.');
    if(action.startsWith('detach-')){workspaceWindows.open(action.slice(7));return;}
    if (advanced && await advanced.handle(action,b)) return;
    if (workstation && await handleWorkspaceAction(action, b))
        return;
    if (action.startsWith('process-')) {
        $('#dialog').close();
        const op = action.slice(8);
        if (op === 'gain' || op === 'normalize') {
            inputModal(op === 'gain' ? 'Adjust gain' : 'Peak normalize', op === 'gain' ? 'Gain change (dB)' : 'Target sample peak (dBFS)', op === 'gain' ? 0 : -1, v => processClip(op, v), { type: 'number', min: op === 'gain' ? -60 : -60, max: op === 'gain' ? 24 : 0 });
            return;
        }
        return processClip(op);
    }
    if (action.startsWith('mode-')) {
        mode = action.slice(5);
        selection = [0, 0];
        fit();
        return;
    }
    if (action.startsWith('left-')) {
        leftTab = action.slice(5);
        renderLeft();
        if (leftTab === 'notes')
            await refreshNotes();
        return;
    }
    if (action.startsWith('tool-')) {
        tool = action.slice(5);
        refresh();
        return;
    }
    if (action.startsWith('toggle-') && ['eq', 'compressor', 'limiter'].includes(action.slice(7))) {
        snapshot('Toggle ' + action.slice(7));
        const e = project.effects[action.slice(7)];
        e.enabled = !e.enabled;
        engine.updateEffects(project.effects);
        renderRack();
        updateStatus();
        return;
    }
    switch (action) {
        case 'diagnostics': return diagnosticsDialog();
        case 'professional': return professionalDialog();
        case 'restoration': return restorationDialog();
        case 'delivery': return deliveryDialog();
        case 'admin': return adminDialog();
        case 'disc': return discDialog();
        case 'native': return nativeDialog();
        case 'adm': return admDialog();
        case 'close-dialog':
            $('#dialog').close();
            break;
        case 'file-menu':
            fileMenu();
            break;
        case 'edit-menu':
            modal('Edit', `<div class="form-grid">${[['undo', 'Undo'], ['redo', 'Redo'], ['copy', 'Copy clip'], ['paste', 'Paste clip'], ['split', 'Split clip'], ['clip-properties', 'Clip properties']].map(([a, s]) => `<button class="btn" data-action="${a}">${s}</button>`).join('')}</div>`);
            break;
        case 'help':
            helpDialog();
            break;
        case 'effects-info':
            modal('Processing options', `<p>The master rack contains a three-band parametric equalizer, linked stereo compressor, and a 5 ms lookahead sample-peak limiter.</p><div class="form-grid"><button class="btn" data-action="eq-details">Equalizer frequency & Q</button><button class="btn" data-action="dynamics-details">Compressor timing</button><button class="btn" data-action="process-menu">Offline audio processing</button><button class="btn" data-action="batch">Batch processing</button></div><p class="help">The modules share the same DSP implementation for playback and WAV export. Use Process → Native plug-in processing in standalone mode to render with configured native effects.</p>`);
            break;
        case 'process-menu':
            processMenu();
            break;
        case 'eq-details':
            eqDetails();
            break;
        case 'dynamics-details':
            dynamicsDetails();
            break;
        case 'import':
            $('#dialog').close();
            $('#audio-input').value = '';
            $('#audio-input').click();
            break;
        case 'play':
            await playback();
            break;
        case 'stop':
            stop();
            break;
        case 'home':
            await seek(0);
            break;
        case 'end':
            await seek(durationOf(project));
            break;
        case 'loop':
            loop = !loop;
            $('#loop').classList.toggle('looping', loop);
            toast(loop ? 'Loop on · drag to select a range' : 'Loop off');
            break;
        case 'record':
            editable();
            if (recording) {
                recording = false;
                $('#record').classList.remove('recording');
                recordPending = true;
                let file;
                try {
                    file = await engine.stopRecording();
                }
                finally {
                    recordPending = false;
                }
                try {
                    await importFiles([file]);
                }
                catch (e) {
                    download(file, file.name, file.type);
                    throw Error('Recording downloaded for recovery: ' + e.message);
                }
            }
            else {
                recordPending = true;
                try {
                    await engine.record();
                    recording = true;
                }
                finally {
                    recordPending = false;
                }
                $('#record').classList.add('recording');
                toast('Recording microphone. Press Record again to stop.');
            }
            break;
        case 'save':
            await saveProject();
            break;
        case 'save-copy':
            $('#dialog').close();
            await saveProject(true);
            renderLeft();
            break;
        case 'rename':
            inputModal('Rename project', 'Project name', project.name, v => { snapshot('Rename project'); project.name = v.slice(0, 120); refresh(); });
            break;
        case 'projects':
            await projectDialog();
            break;
        case 'open-project':
            await guardUnsaved(() => loadProject(b.dataset.id));
            break;
        case 'load-latest':
            if (project.id)
                await loadProject(project.id);
            break;
        case 'new':
            guardUnsaved(() => { stop(); project = createProject(); projectGeneration++; project.name = 'Untitled mastering session'; project.clips = []; project.assets = []; project.markers = []; selectedId = null; dirty = true; role = 'owner'; history.past = []; history.future = []; clipboard = null; analysis = null; updateAnalysis({}); renderLeft(); renderRack(); fit(); $('#dialog').close(); });
            break;
        case 'select-asset': {
            const id = b.dataset.id, c = project.clips.find(c => c.assetId === id);
            if (c) {
                selectedId = c.id;
                workstation?.hiddenDocs.delete(c.id);
                mode = 'audio';
                cursor = c.start;
                selection = [0, 0];
                fit();
                renderLeft();
                analyzeSource();
            }
            else {
                editable();
                snapshot('Add source to montage');
                const a = engine.assets.get(id);
                if (!a)
                    throw Error('Relink this source first.');
                const c = { id: uid(), trackId: project.tracks[0].id, assetId: id, name: a.name, start: cursor, offset: 0, duration: a.duration, gain: 0, fadeIn: 0, fadeOut: 0, automation: [] };
                project.clips.push(c);
                selectedId = c.id;
                fit();
                renderLeft();
                analyzeSource();
            }
            break;
        }
        case 'undo':
        case 'redo': {
            editable();
            const restored = history[action](project);
            if (restored) {
                engine.pause();
                const { id, revision } = project;
                project = restored.state;
                project.id = id;
                project.revision = revision;
                selectedId = project.clips.some(c => c.id === selectedId) ? selectedId : project.clips[0]?.id;
                markChanged();
                renderRack();
                renderLeft();
                fit();
                analyzeSource();
                toast(action + ': ' + restored.label);
            }
            break;
        }
        case 'split':
            editable();
            if (project.clips.length >= 2000)
                throw Error('Maximum 2000 clips.');
            {
                const c = selected();
                if (!c || cursor <= c.start + .001 || cursor >= c.start + c.duration - .001)
                    throw Error('Place the cursor inside the selected clip.');
            }
            snapshot('Split clip');
            selectedId = splitClip(project, selectedId, cursor).id;
            selection = [0, 0];
            refresh();
            renderLeft();
            break;
        case 'copy':
            clipboard = selected() ? structuredClone(selected()) : null;
            toast(clipboard ? 'Clip copied.' : 'No clip selected.');
            break;
        case 'paste':
            if (!clipboard)
                throw Error('Copy a clip first.');
            {
                const a = engine.assets.get(clipboard.assetId);
                if (!a)
                    throw Error('The copied source is missing. Relink it before pasting.');
                const id = uid();
                editProject('Paste clip', p => { if (!p.assets.some(v => v.id === a.id))
                    p.assets.push({ id: a.id, name: a.name, sampleRate: a.sampleRate, duration: a.duration, ...(a.demo ? { demo: true } : {}) }); const track = p.tracks.find(t => t.id === selectedTrackId) || p.tracks.find(t => t.id === clipboard.trackId) || p.tracks[0]; if (!track)
                    throw Error('Add a destination track.'); p.clips.push({ ...structuredClone(clipboard), id, trackId: track.id, start: cursor }); });
                selectedId = id;
                mode = 'montage';
                selection = [0, 0];
                renderLeft();
                fit();
            }
            break;
        case 'delete':
            if (selection[1] > selection[0])
                await processClip('delete');
            else {
                if (!selected())
                    return;
                snapshot('Remove clip');
                project.clips = project.clips.filter(c => c.id !== selectedId);
                selectedId = project.clips[0]?.id;
                refresh();
                renderLeft();
            }
            break;
        case 'fadeIn':
        case 'fadeOut':
            await processClip(action);
            break;
        case 'clip-properties':
            clipDialog();
            break;
        case 'fit':
            fit();
            break;
        case 'zoom-in':
            zoom(1.5);
            break;
        case 'zoom-out':
            zoom(1 / 1.5);
            break;
        case 'add-marker':
            inputModal('Add marker', 'Marker name', 'Marker ' + (project.markers.length + 1), name => { snapshot('Add marker'); project.markers.push({ id: uid(), time: Math.min(86400, cursor), name: name.slice(0, 200), color: '#d7ec94' }); project.markers.sort((a, b) => a.time - b.time); renderLeft(); refresh(); });
            break;
        case 'seek-marker':
            await seek(project.markers.find(m => m.id === b.dataset.id)?.time || 0);
            break;
        case 'remove-marker':
            snapshot('Remove marker');
            project.markers = project.markers.filter(m => m.id !== b.dataset.id);
            renderLeft();
            refresh();
            break;
        case 'add-track':
            if (project.tracks.length >= 64)
                throw Error('Maximum 64 tracks.');
            snapshot('Add track');
            project.tracks.push({ id: uid(), name: 'Track ' + (project.tracks.length + 1), gain: 0, pan: 0, mute: false, solo: false, color: ['#a49beb', '#8fcdd8', '#d7ec94'][project.tracks.length % 3] });
            mode = 'montage';
            renderLeft();
            refresh();
            break;
        case 'rename-track': {
            const t = project.tracks.find(t => t.id === b.dataset.id);
            inputModal('Rename track', 'Track name', t.name, v => { snapshot('Rename track'); t.name = v.slice(0, 80); renderLeft(); refresh(); });
            break;
        }
        case 'track-properties': {
            trackDialog(b.dataset.id);
            break;
            const t = project.tracks.find(t => t.id === b.dataset.id);
            inputModal('Track balance', 'Balance · −1 left / +1 right', t.pan, v => { snapshot('Track balance'); t.pan = clamp(v, -1, 1); renderLeft(); refresh(); }, { type: 'number', min: -1, max: 1, step: .01 });
            break;
        }
        case 'mute-track':
        case 'solo-track':
            snapshot(action);
            {
                const t = project.tracks.find(t => t.id === b.dataset.id), key = action === 'mute-track' ? 'mute' : 'solo';
                t[key] = !t[key];
                if (engine.playing) {
                    engine.pause();
                    $('#play').innerHTML = icon('play');
                }
                renderLeft();
                refresh();
            }
            break;
        case 'bypass':
            snapshot('Master bypass');
            project.effects.bypass = !project.effects.bypass;
            engine.updateEffects(project.effects);
            renderRack();
            updateStatus();
            break;
        case 'render':
            exportDialog();
            break;
        case 'analysis':
            await showAnalysis();
            break;
        case 'analyze-master':
            await analyzeMaster();
            break;
        case 'analysis-report':
            download(JSON.stringify({ project: project.name, measuredAt: new Date().toISOString(), scope: $('#analysis-caption').textContent, measurementNotes: 'K-weighted integrated loudness estimate; sample peak is not true peak.', ...analysis }, null, 2), 'Auralis-analysis.json', 'application/json');
            break;
        case 'spectrogram':
            await showSpectrogram();
            break;
        case 'batch':
            batchDialog();
            break;
        case 'share':
            await shareDialog();
            break;
        case 'join':
            joinDialog();
            break;
        case 'refresh-notes':
            await refreshNotes();
            break;
        case 'comment-seek':
            await seek(Number(b.dataset.time));
            break;
        case 'resolve-comment':
            await client.resolve(project.id, b.dataset.id, b.dataset.resolved === '1');
            await refreshNotes();
            break;
        case 'versions':
            await versionsDialog();
            break;
        case 'restore-version': {
            const v = await client.version(project.id, Number(b.dataset.revision));
            validateProject(v.project);
            loading = true;
            let restoredAssets;
            try {
                restoredAssets = await hydrateSources(v.project, project.id);
            }
            finally {
                loading = false;
            }
            snapshot('Restore version ' + b.dataset.revision);
            const { id, revision } = project;
            project = validateProject(v.project); projectGeneration++;
            engine.assets = restoredAssets;
            project.id = id;
            project.revision = revision;
            selectedId = project.clips[0]?.id;
            renderLeft();
            renderRack();
            fit();
            $('#dialog').close();
            toast('Version restored locally. Save to create a new version.');
            break;
        }
        case 'export-project':
            download(JSON.stringify({ format: 'auralis-project', version: 1, project }, null, 2), project.name + '.auralis', 'application/json');
            toast('Project JSON downloaded. It references audio sources; it does not embed audio.');
            break;
        case 'import-project':
            $('#project-input').value = '';
            $('#project-input').click();
            break;
        case 'relink': {
            const missing = project.assets.filter(a => !engine.assets.has(a.id));
            if (!missing.length)
                throw Error('All sources are available.');
            modal('Relink missing audio', missing.map(a => `<label class="field">${esc(a.name)}<input type="file" accept="audio/*,.wav" data-relink="${esc(a.id)}"></label>`).join(''));
            break;
        }
        case 'load-preset':
            $('#preset-input').value = '';
            $('#preset-input').click();
            break;
        case 'save-preset':
            download(JSON.stringify(project.effects, null, 2), 'Auralis-master-preset.json', 'application/json');
            toast('Master preset downloaded.');
            break;
        case 'monitor':
            await engine.init();
            modal('Audio output', `<p>Output is connected to your browser’s selected playback device.</p><div class="form-grid"><div class="field">Hardware sample rate<strong>${engine.context.sampleRate.toLocaleString()} Hz</strong></div><div class="field">Reported base latency<strong>${num(engine.context.baseLatency * 1000, 2)} ms</strong></div><div class="field">Master lookahead<strong>${(processingLatency(project.effects,engine.context.sampleRate)/engine.context.sampleRate*1000).toFixed(1)} ms</strong></div><div class="field">Playback state<strong>${engine.context.state}</strong></div></div><p class="help">Choose the playback device in your operating system or browser settings. Recording requests microphone access only when you press Record.</p>`);
            break;
        case 'toggle-files':
            $('.workspace').classList.toggle('files-visible');
            break;
        case 'toggle-rack':
            $('.workspace').classList.toggle('rack-visible');
            break;
    }
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (b)
        run(() => applyAction(b.dataset.action, b));
});
document.addEventListener('submit', e => {
    if (['metadata-form', 'fades-form', 'inspector-form'].includes(e.target.id)) {
        e.preventDefault();
        run(() => {
            const f = new FormData(e.target), id = e.target.dataset.clipId;
            if(e.target.id!=='metadata-form'&&(!id||id!==selected()?.id))throw Error('The clip selection changed. Reopen its properties.');
            if (e.target.id === 'metadata-form')
                editProject('Edit metadata', p => p.metadata = { title: String(f.get('title')), artist: String(f.get('artist')), comment: String(f.get('comment')) });
            if (e.target.id === 'fades-form')
                editProject('Edit clip fades', p => { const c = p.clips.find(c => c.id === id); c.fadeIn = Number(f.get('fadeIn')); c.fadeOut = Number(f.get('fadeOut')); });
            if (e.target.id === 'inspector-form')
                editProject('Edit clip properties', p => { const c = p.clips.find(c => c.id === id); c.name = String(f.get('name')); c.trackId = String(f.get('trackId')); c.mute = f.has('mute'); for (const k of ['start', 'offset', 'duration', 'gain', 'fadeIn', 'fadeOut'])
                    c[k] = Number(f.get(k)); c.automation = (c.automation || []).filter(pt => pt.time <= c.duration); });
            toast('Properties applied.');
        });
        return;
    }
    if (e.target.id === 'comment-form') {
        e.preventDefault();
        run(async () => {
            if (!project.id)
                throw Error('Save the project before adding comments.');
            const text = $('#comment-text').value.trim();
            if (!text)
                return;
            await client.comment(project.id, text, cursor);
            noteDrafts.set(project.id, '');
            $('#comment-text').value = '';
            await refreshNotes();
            toast('Comment added.');
        });
    }
});
function setEffect(path, value) {
    if (operation || recording || recordPending)
        throw Error('Wait for the current audio operation.');
    editable();
    if (!Number.isFinite(value))
        return;
    if (effectGesture !== path) {
        snapshot('Adjust ' + path);
        effectGesture = path;
    }
    const keys = path.split('.');
    if (keys.length === 1)
        project.effects[keys[0]] = value;
    else
        project.effects[keys[0]][keys[1]] = value;
    project.effects.preset = 'Custom master';
    const presetSelect = $('#master-preset');
    if (presetSelect) {
        let custom = presetSelect.querySelector('option[value=custom]');
        if (!custom) {
            custom = new Option('Custom master', 'custom');
            custom.disabled = true;
            presetSelect.prepend(custom);
        }
        custom.textContent = 'Custom master';
        presetSelect.value = 'custom';
    }
    if ($('#analysis-caption').textContent.includes('master') || $('#analysis-caption').textContent.includes('Delivery'))
        $('#analysis-caption').textContent = 'Master settings changed · reanalyze output';
    engine.updateEffects(project.effects);
    if ($('#eq-response-path'))
        $('#eq-response-path').setAttribute('d', eqResponsePath());
    if ($('#ceiling-value'))
        $('#ceiling-value').textContent = num(project.effects.limiter.ceiling) + ' dB';
    if ($('#output-value'))
        $('#output-value').textContent = num(project.effects.output) + ' dB';
    updateStatus();
}
document.addEventListener('valuechange', e => run(() => setEffect(e.target.dataset.effect, e.detail.value)));
document.addEventListener('input', e => {
    if (e.target.matches('input[data-effect]'))
        run(() => setEffect(e.target.dataset.effect, Number(e.target.value)));
    if (e.target.id === 'asset-search') {
        filter = e.target.value;
        const pos = e.target.selectionStart;
        renderLeft();
        $('#asset-search').focus();
        $('#asset-search').setSelectionRange(pos, pos);
    }
});
document.addEventListener('change', e => run(async () => {
    if (saving || loading || operation || recordPending)
        throw Error('Wait for the current operation.');
    if (e.target.id === 'preset-input') {
        const file = e.target.files[0];
        if (!file)
            return;
        if (file.size > 16000)
            throw Error('Preset is too large.');
        const fx = JSON.parse(await file.text());
        validateProject({ ...project, effects: fx });
        snapshot('Import master preset');
        project.effects = fx;
        renderRack();
        engine.updateEffects(fx);
        updateStatus();
        $('#dialog').close();
    }
    if (e.target.id === 'audio-input')
        await importFiles(e.target.files);
    if (e.target.dataset.trackGain) {
        snapshot('Track gain');
        project.tracks.find(t => t.id === e.target.dataset.trackGain).gain = Number(e.target.value);
        if (engine.playing) {
            engine.pause();
            $('#play').innerHTML = icon('play');
        }
        renderLeft();
        refresh();
    }
    if (e.target.id === 'rate-select') {
        snapshot('Session sample rate');
        project.sampleRate = Number(e.target.value);
        renderLeft();
        updateStatus();
    }
    if (e.target.id === 'master-preset') {
        snapshot('Master preset');
        const value = e.target.value, effect = project.effects;
        if (value === 'custom')
            return;
        effect.bypass = false;
        effect.eq.enabled = true;
        effect.eq.low = value === 'warm' ? 1.8 : value === 'punch' ? 1 : 0;
        effect.eq.mid = value === 'warm' ? -.8 : value === 'punch' ? 1.2 : 0;
        effect.eq.high = value === 'warm' ? -.5 : value === 'punch' ? 1.5 : 0;
        effect.compressor.enabled = value !== 'clean';
        effect.compressor.threshold = value === 'broadcast' ? -24 : -18;
        effect.compressor.ratio = value === 'punch' ? 4 : 2;
        effect.compressor.makeup = value === 'clean' ? 0 : 2;
        effect.limiter.enabled = true;
        effect.preset = { warm: 'Warm & balanced', punch: 'Punch & presence', broadcast: 'Gentle dynamics', clean: 'Clean master' }[value] || 'Custom master';
        engine.updateEffects(effect);
        renderRack();
        updateStatus();
    }
    if (e.target.id === 'project-input') {
        const file = e.target.files[0];
        if (!file)
            return;
        if (file.size > 2e6)
            throw Error('Project JSON exceeds 2 MB.');
        const parsed = JSON.parse(await file.text()), p = validateProject(parsed.project);
        guardUnsaved(() => { clipboard = null; comments = []; project = p; projectGeneration++; project.id = null; project.revision = 0; dirty = true; role = 'owner'; selectedId = p.clips[0]?.id; history.past = []; history.future = []; renderLeft(); renderRack(); fit(); $('#dialog').close(); toast('Project imported. Relink missing sources from the File menu.'); });
    }
    if (e.target.dataset.relink) {
        const a = await engine.import(e.target.files[0]), id = e.target.dataset.relink, meta = project.assets.find(a => a.id === id);
        if (Math.abs(a.duration - meta.duration) > .01) {
            engine.assets.delete(a.id);
            throw Error('Source duration does not match the missing file.');
        }
        snapshot('Relink source');
        engine.assets.delete(a.id);
        engine.assets.set(id, { ...a, id, name: meta.name });
        renderLeft();
        refresh();
        e.target.disabled = true;
        toast('Source relinked.');
    }
}));
document.addEventListener('keydown', e => {
    if (e.defaultPrevented)
        return;
    const target = e.composedPath()[0];
    if (target?.closest?.('.time-display') && ['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        run(() => applyAction('goto'));
        return;
    }
    if (target?.matches?.('input,textarea,select') || target?.isContentEditable)
        return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        run(() => applyAction('command-search'));
        return;
    }
    if ($('#dialog').open || !$('#desktop-popup')?.hidden)
        return;
    const key = shortcutKey(e).toLowerCase(), cmd = [...commandMap.values()].find(c => (workstation?.prefs.shortcuts[c.id] || c.shortcut || '').toLowerCase() === key);
    const action = cmd?.id || ({ Backspace: 'delete', '=': 'zoom-in' }[e.key]);
    if (action) {
        e.preventDefault();
        run(() => applyAction(action));
    }
});
document.addEventListener('pointerup', () => effectGesture = null);
document.addEventListener('gesturestart', () => effectGesture = null);
document.addEventListener('gestureend', () => effectGesture = null);
document.addEventListener('keyup', e => { if (e.composedPath()[0]?.type !== 'number')
    effectGesture = null; });
document.addEventListener('focusout', () => effectGesture = null);
window.addEventListener('beforeunload', e => {
    if (dirty || saving || operation || recording || recordPending) {
        e.preventDefault();
        e.returnValue = '';
    }
});
async function sync() {
    if (!project.id || saving || loading || operation || recording || recordPending)
        return;
    const syncId = project.id;
    try {
        const r = await client.presence(project.id, cursor);
        if (project.id !== syncId)
            return;
        $('#status-detail').textContent = 'Auralis Studio 0.4';
        members = r.members;
        $('#presence').innerHTML = members.slice(0, 4).map(m => `<span class="avatar" title="${esc(m.name)} · ${time(m.position)}">${esc(m.name.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase())}</span>`).join('');
        if (r.revision > project.revision) {
            if (dirty) {
                if (!conflict) {
                    conflict = true;
                    toast('A teammate saved a newer version. Your unsaved changes are preserved.', true);
                }
            }
            else if (!engine.playing && !$('#dialog').open && !dirty)
                await loadProject(project.id);
        }
        if (leftTab === 'notes')
            await refreshNotes();
    }
    catch (e) {
        $('#status-detail').textContent = 'Sync unavailable · edits preserved';
    }
}
async function copyAudioSelection() { const c = selected(), a = activeAsset(); if (!c || !a)
    throw Error('Select audio first.'); const from = selection[1] > selection[0] ? selection[0] : 0, to = selection[1] > selection[0] ? selection[1] : c.duration; const channels = await readAsset(a, Math.round((c.offset + from) * a.sampleRate), Math.round((to - from) * a.sampleRate)); clipboard = { kind: 'audio', channels, sampleRate: a.sampleRate, name: c.name }; toast('Copied ' + time(to - from) + ' of audio.'); }
async function pasteAudioSelection() { editable(); const c = selected(), a = activeAsset(); if (!a || !c)
    throw Error('Select a destination audio clip.'); operation = true; try {
    const original = await readAsset(a, Math.round(c.offset * a.sampleRate), Math.round(c.duration * a.sampleRate));
    let insert = clipboard.channels;
    if (clipboard.sampleRate !== a.sampleRate)
        insert = await engine.job('resample', { channels: insert, length: Math.round(insert[0].length * a.sampleRate / clipboard.sampleRate) });
    if (original.length === 1 && insert.length === 2)
        insert = [Float32Array.from(insert[0], (v, i) => (v + insert[1][i]) / 2)];
    const from = Math.round((selection[1] > selection[0] ? clamp(selection[0] - (mode === 'montage' ? c.start : 0), 0, c.duration) : clamp(cursor - c.start, 0, c.duration)) * a.sampleRate), to = selection[1] > selection[0] ? Math.round(clamp(selection[1] - (mode === 'montage' ? c.start : 0), 0, c.duration) * a.sampleRate) : from, length = original[0].length - (to - from) + insert[0].length;
    if (length * original.length * 4 > 96 * 1024 * 1024)
        throw Error('Pasted audio exceeds the edit memory limit.');
    const channels = original.map((v, i) => { const out = new Float32Array(length); out.set(v.subarray(0, from)); out.set(insert[i] || insert[0], from); out.set(v.subarray(to), from + insert[0].length); return out; }), id = uid(), name = c.name + ' · paste';
    operation = false;
    editProject('Paste audio', p => { p.assets.push({ id, name, sampleRate: a.sampleRate, duration: length / a.sampleRate }); Object.assign(p.clips.find(x => x.id === c.id), { assetId: id, offset: 0, duration: length / a.sampleRate, fadeIn: Math.min(c.fadeIn, length / a.sampleRate), fadeOut: Math.min(c.fadeOut, length / a.sampleRate), automation: [] }); });
    engine.addAsset({ id, name, channels, sampleRate: a.sampleRate, duration: length / a.sampleRate });
    selection = [from / a.sampleRate + (mode === 'montage' ? c.start : 0), (from + insert[0].length) / a.sampleRate + (mode === 'montage' ? c.start : 0)];
    renderLeft();
    fit();
    await analyzeSource();
}
finally {
    operation = false;
    workstation?.update();
} }
function eqResponsePath() { const e = project.effects.eq, sr = engine.context?.sampleRate || project.sampleRate, cs = [coefficients('lowshelf', 120, e.low, .707, sr), coefficients('peak', e.frequency, e.mid, e.q, sr), coefficients('highshelf', 8000, e.high, .707, sr)]; let path = ''; for (let x = 0; x <= 230; x += 2) {
    const hz = 20 * (1000 ** (x / 230)), w = 2 * Math.PI * Math.min(hz, sr * .49) / sr;
    let gain = 1;
    for (const [b0, b1, b2, a1, a2] of cs) {
        const nr = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w), ni = -b1 * Math.sin(w) - b2 * Math.sin(2 * w), dr = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w), di = -a1 * Math.sin(w) - a2 * Math.sin(2 * w);
        gain *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
    }
    const y = 26 - clamp(20 * Math.log10(Math.max(1e-9, gain)), -24, 24);
    path += (x ? ' L' : 'M') + x + ' ' + y.toFixed(3);
} return path; }
function clearSpectral() { spectralToken++; spectralKey = ''; $('#spectral-editor')?.remove(); $$('.spectral-frequency-label').forEach(n => n.remove()); renderer.gpu.style.visibility = ''; }
async function renderSpectral() { if (!spectral || !renderer)
    return; const c = selected(), a = activeAsset(); if (!a || !c)
    return; const duration = Math.max(.001, Math.min(viewDuration, c.duration - Math.max(0, viewStart))), start = clamp(viewStart, 0, Math.max(0, c.duration - duration)), key = [a.id, c.offset, start, duration, renderer.host.clientWidth, renderer.host.clientHeight].join(':'); if (spectralKey === key)
    return; spectralKey = key; const token = ++spectralToken,width=Math.min(800,Math.max(200,Math.round(renderer.host.clientWidth))); let windows;try{windows=await readSpectrogramWindows(a,Math.round((c.offset+start)*a.sampleRate),Math.max(1,Math.round(duration*a.sampleRate)),width,{isCanceled:()=>token!==spectralToken||!spectral});}catch(error){if(error.name==='AbortError')return;spectralKey='';throw error;}const result=await engine.job('spectrogram',{...windows,sampleRate:a.sampleRate,width,height:220}); if (token !== spectralToken || !spectral)
    return; const g = renderer.geometry(); let canvas = $('#spectral-editor'); if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'spectral-editor';
    canvas.className = 'spectral-editor';
    renderer.host.insertBefore(canvas, renderer.overlay);
} canvas.width = result.width; canvas.height = result.height; canvas.style.cssText = `position:absolute;pointer-events:none;left:${g.left}px;top:${g.top}px;width:${(g.w - g.left) * duration / viewDuration}px;height:${g.h - g.top}px`; canvas.getContext('2d').putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0); renderer.gpu.style.visibility = 'hidden'; $$('.spectral-frequency-label').forEach(n => n.remove()); for (const fraction of [.1, .5, .9]) {
    const label = document.createElement('span');
    label.className = 'spectral-frequency-label';
    label.style.top = (g.top + fraction * (g.h - g.top)) + 'px';
    label.textContent = ((1 - fraction) ** 2 * a.sampleRate / 2000).toFixed(1) + 'k';
    renderer.host.append(label);
} $('#clip-spec').textContent = `SPECTRUM · ${time(start)}–${time(start + duration)} · FFT 1024`; renderer.drawCursor(cursor - (mode === 'audio' ? c.start : 0)); }
function spectralFrequency(y) { const g = renderer.geometry(); return (activeAsset()?.sampleRate || 48000) / 2 * (1 - clamp((y - g.top) / (g.h - g.top), 0, 1)) ** 2; }
function snapPosition(v, disabled = false) { const scale = viewDuration / Math.max(1, renderer.geometry().w - renderer.geometry().left); return snapTime(v, [0, ...project.markers.map(m => m.time), ...project.clips.filter(c => !advanced?.ids.has(c.id) && c.id !== selectedId).flatMap(c => [c.start, c.start + c.duration])], scale * 8, workstation?.prefs.snap && !disabled); }
function workspaceState() { return { project, projectGeneration, clip: selected(), asset: activeAsset(), mode, selection, cursor, editable: isEditor(), role, busy: saving || loading || operation || recording || recordPending || !!advanced?.drag, recording, undo: history.past.length, redo: history.future.length, history: history.past, clipboard, analysis, comments, spectral, selectedIds: advanced ? [...advanced.ids] : [selectedId], track: project.tracks.find(t => t.id === (selectedTrackId || selected()?.trackId)) || project.tracks[0] }; }
function editProject(label, change) { editable(); if (operation || recording || recordPending || advanced?.drag)
    throw Error('Wait for the current audio operation.'); const next = structuredClone(project); change(next); for(const c of next.clips){const old=project.clips.find(x=>x.id===c.id);if(c.fadeSource && old && (c.assetId!==old.assetId || (/properties|fades|Set clip fade|Crossfade|Paste audio|Insert silence/i.test(label)&&['fadeIn','fadeOut','offset','duration'].some(k=>c[k]!==old[k]))))delete c.fadeSource;} validateProject(next); snapshot(label); engine.pause(); $('#play').innerHTML = icon('play'); project = next; engine.updateEffects(project.effects); renderLeft(); renderRack(); refresh(); }
function selectClip(id, changeMode = true) { if (saving || loading || operation || recording || recordPending)
    throw Error('Wait for the current operation.'); const c = project.clips.find(c => c.id === id); if (!c)
    return; engine.pause(); selectedId = id; selectedTrackId = c.trackId; cursor = c.start; selection = [0, 0]; if (changeMode)
    mode = 'audio'; workstation?.hiddenDocs.delete(id); renderLeft(); fit(); analyzeSource(); }
function showLeftTab(tab) { leftTab = tab; workstation.prefs.showLeft = true; workstation.prefs.showMaster = innerWidth > 960 ? workstation.prefs.showMaster : false; workstation.applyLayout(); workstation.save(); renderLeft(); if (tab === 'notes')
    return refreshNotes(); }
function inspectorHTML() { const c = selected(), a = activeAsset(); if (!c)
    return '<div class="empty">Select an audio clip to edit its properties.</div>'; return `<form id="inspector-form" data-clip-id="${esc(c.id)}" class="inspector-form"><div class="inspector-subheading">CLIP · ${esc(c.name)}</div><label>Name<input name="name" value="${esc(c.name)}" maxlength="240" required></label><label>Track<select name="trackId">${project.tracks.map(t => `<option value="${esc(t.id)}" ${t.id === c.trackId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><div class="two-col">${[['start', 'Timeline start', 0, 86400], ['offset', 'Source offset', 0, a?.duration || 86400], ['duration', 'Duration', .0001, a?.duration || 86400], ['gain', 'Gain (dB)', -96, 24], ['fadeIn', 'Fade in', 0, c.duration], ['fadeOut', 'Fade out', 0, c.duration]].map(([k, l, min, max]) => `<label>${l}<input type="number" name="${k}" min="${min}" max="${max}" step="any" value="${c[k]}" required></label>`).join('')}</div><label class="check"><input type="checkbox" name="mute" ${c.mute ? 'checked' : ''}>Mute this clip</label><button class="btn primary" type="submit" ${isEditor() ? '' : 'disabled'}>Apply clip properties</button><div class="inspector-subheading">SOURCE</div><div class="help">${esc(a?.name || 'Source missing')}<br>${a ? num(a.sampleRate / 1000) + ' kHz · ' + a.channels.length + ' channels · ' + time(a.duration) : 'Relink the audio file to play or process.'}</div><button type="button" class="btn" data-action="envelope-panel">Edit volume envelope</button><button type="button" class="btn" data-action="clip-properties">All numeric properties</button></form>`; }
function markerDialog(id) { const m = project.markers.find(m => m.id === id); if (!m)
    return; modal('Marker properties', `<form id="marker-edit-form"><label class="field">Name<input name="name" value="${esc(m.name)}" maxlength="200" required></label><div class="form-grid"><label class="field">Position (seconds)<input name="time" type="number" min="0" max="86400" step="any" value="${m.time}" required></label><label class="field">Color<input name="color" type="color" value="${m.color}"></label></div>${actions('Update marker')}</form>`, d => { d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target); editProject('Edit marker', p => { const x = p.markers.find(v => v.id === id); x.name = String(f.get('name')); x.time = Number(f.get('time')); x.color = String(f.get('color')); p.markers.sort((a, b) => a.time - b.time); }); d.close(); }); }; }); }
function trackDialog(id) { const t = project.tracks.find(t => t.id === (id || selectedTrackId || selected()?.trackId)) || project.tracks[0]; if (!t)
    throw Error('Add a track first.'); selectedTrackId = t.id; modal('Track properties', `<form><label class="field">Track name<input name="name" value="${esc(t.name)}" maxlength="120" required></label><div class="form-grid"><label class="field">Gain (dB)<input name="gain" type="number" min="-96" max="24" step=".1" value="${t.gain}"></label><label class="field">Balance (−1 left / +1 right)<input name="pan" type="number" min="-1" max="1" step=".01" value="${t.pan}"></label><label class="field">Track color<input name="color" type="color" value="${t.color}"></label><label><input name="mute" type="checkbox" ${t.mute ? 'checked' : ''}> Mute</label><label><input name="solo" type="checkbox" ${t.solo ? 'checked' : ''}> Solo</label></div>${actions('Apply track settings')}</form>`, d => { d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target); editProject('Track properties', p => Object.assign(p.tracks.find(x => x.id === t.id), { name: String(f.get('name')), gain: Number(f.get('gain')), pan: Number(f.get('pan')), color: String(f.get('color')), mute: f.has('mute'), solo: f.has('solo') })); d.close(); }); }; }); }
function selectionDialog() { const format = workstation.prefs.format, rate = mode === 'audio' ? activeAsset()?.sampleRate || project.sampleRate : project.sampleRate; modal('Time selection', `<form><p>Positions use ${format === 'samples' ? 'sample frames at ' + rate + ' Hz' : format === 'seconds' ? 'seconds' : 'hours:minutes:seconds.milliseconds'} in the ${mode === 'audio' ? 'selected clip' : 'montage'}.</p><div class="form-grid"><label class="field">Selection start<input name="start" value="${formatPosition(selection[0], format, rate)}" required></label><label class="field">Selection end<input name="end" value="${formatPosition(selection[1], format, rate)}" required></label></div>${actions('Set selection')}</form>`, d => { d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target), a = parsePosition(f.get('start'), format, rate), b = parsePosition(f.get('end'), format, rate), max = mode === 'audio' ? selected().duration : durationOf(project); if (b < a || b > max + .00001)
    throw Error('Selection must be ordered and remain inside the current audio.'); selection = [a, b]; cursor = a + (mode === 'audio' ? selected().start : 0); refresh(); d.close(); }); }; }); }
function preferencesDialog() { const p = workstation.prefs; modal('Preferences & keyboard shortcuts', `<form id="preferences-form"><div class="form-grid"><label class="field">Appearance<select name="theme"><option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Dark workstation</option><option value="light" ${p.theme === 'light' ? 'selected' : ''}>Light controls / dark waveform</option></select></label><label class="field">Time display<select name="format">${['time', 'seconds', 'samples'].map(x => `<option value="${x}" ${p.format === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="field">Clip nudge (seconds)<input name="nudge" type="number" min=".00001" max="10" step="any" value="${p.nudge}" required></label><label><input type="checkbox" name="snap" ${p.snap ? 'checked' : ''}> Snap to markers and clip boundaries</label><label><input type="checkbox" name="follow" ${p.follow ? 'checked' : ''}> Follow playback cursor</label></div><p>Keyboard shortcuts use Ctrl on Windows/Linux and Command on macOS. Click a field and press the desired combination.</p><div class="shortcut-list"><table><tbody>${[...commandMap.values()].filter(c => c.shortcut).map(c => `<tr><td>${esc(c.label)}</td><td><input data-shortcut="${c.id}" aria-label="Shortcut for ${esc(c.label)}" value="${esc(p.shortcuts[c.id] || c.shortcut)}" readonly></td></tr>`).join('')}</tbody></table></div><div class="dialog-actions"><button type="button" class="btn" id="reset-shortcuts">Reset shortcuts</button><button class="btn primary">Save preferences</button></div></form>`, d => { d.querySelectorAll('[data-shortcut]').forEach(el => el.onkeydown = e => { e.preventDefault(); e.stopPropagation(); if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key))
    return; el.value = shortcutKey(e); }); $('#reset-shortcuts').onclick = () => d.querySelectorAll('[data-shortcut]').forEach(el => el.value = commandMap.get(el.dataset.shortcut).shortcut); d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target), shortcuts = {}, seen = new Set(); d.querySelectorAll('[data-shortcut]').forEach(el => { if (seen.has(el.value.toLowerCase()))
    throw Error('Each shortcut must be unique: ' + el.value); seen.add(el.value.toLowerCase()); shortcuts[el.dataset.shortcut] = el.value; }); Object.assign(p, { theme: f.get('theme'), format: f.get('format'), nudge: Number(f.get('nudge')), snap: f.has('snap'), follow: f.has('follow'), shortcuts }); workstation.save(); workstation.applyLayout(); refresh(); d.close(); }); }; }); }
function shortcutKey(e) { return [(e.ctrlKey || e.metaKey) ? 'Ctrl' : null, e.altKey ? 'Alt' : null, e.shiftKey ? 'Shift' : null, e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+'); }
async function analyzeRegion(whole = false) { const a = activeAsset(), c = selected(); if (!a || !c)
    throw Error('Select an audio clip.'); const start = whole ? 0 : clamp(selection[0] - (mode === 'montage' ? c.start : 0), 0, c.duration), end = whole ? c.duration : clamp(selection[1] - (mode === 'montage' ? c.start : 0), start, c.duration); if (end <= start)
    throw Error('Select audio inside this clip.'); operation = true; workstation.update(); try {
    const channels = await readAsset(a, Math.round((c.offset + start) * a.sampleRate), Math.round((end - start) * a.sampleRate));
    analysis = await engine.job('analyze', { channels, sampleRate: a.sampleRate, options: { measureTruePeak: true } });
    updateAnalysis(analysis);
    $('#analysis-caption').textContent = `${whole ? 'Selected clip' : 'Selected audio'} · ${time(start)}–${time(end)} · before master`;
    await showAnalysis();
}
finally {
    operation = false;
    workstation.update();
} }
async function detectSelectedPitch() { const c = selected(), a = activeAsset(); if (!a)
    throw Error('Select an audio clip.'); const at = selection[1] > selection[0] ? clamp(selection[0] - (mode === 'montage' ? c.start : 0), 0, c.duration) : clamp(cursor - c.start, 0, Math.max(0, c.duration - .1)); const channels = await readAsset(a, Math.round((c.offset + at) * a.sampleRate), Math.min(Math.round(.2 * a.sampleRate), Math.round((c.duration - at) * a.sampleRate))); const r = await engine.job('detect-pitch', { channels, sampleRate: a.sampleRate }); if (!r)
    throw Error('No stable monophonic pitch was detected. Select a sustained note.'); const note = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][Math.round(r.midi) % 12] + (Math.floor(Math.round(r.midi) / 12) - 1); modal('Pitch analysis', `<div class="pitch-result"><strong style="font-size:34px">${note}</strong><p>${num(r.frequency, 2)} Hz · ${num(r.cents, 2)} cents · ${num(r.confidence * 100)}% confidence</p><p>Measured at ${time(at)} in ${esc(c.name)}.</p></div><button class="btn primary" data-action="restore-correct">Correct sustained note</button>`); }
function bindEnvelope(canvas) { if (!canvas)
    return; const c = selected(), dpr = Math.min(2, devicePixelRatio || 1); let dragIndex = -1, working = null; const bounds = () => canvas.getBoundingClientRect(); const draw = () => { const r = bounds(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); const w = r.width, h = r.height, pts = working || c.automation || []; ctx.fillStyle = '#18212d'; ctx.fillRect(0, 0, w, h); ctx.font = '10px monospace'; ctx.strokeStyle = '#39485b'; ctx.fillStyle = '#94aac5'; for (const db of [-48, -24, -12, 0, 12, 24]) {
    const y = 8 + (24 - db) / 72 * (h - 20);
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(db + ' dB', 4, y + 3);
} const x = t => 42 + t / c.duration * (w - 52), y = v => 8 + (24 - v) / 72 * (h - 20); ctx.strokeStyle = '#83bcf2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]?.value || 0)); for (const p of pts)
    ctx.lineTo(x(p.time), y(p.value)); ctx.lineTo(x(c.duration), y(pts.at(-1)?.value || 0)); ctx.stroke(); for (const p of pts) {
    ctx.beginPath();
    ctx.arc(x(p.time), y(p.value), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e3edff';
    ctx.fill();
} }; const point = e => { const r = bounds(); return { time: clamp((e.clientX - r.left - 42) / (r.width - 52) * c.duration, 0, c.duration), value: clamp(24 - (e.clientY - r.top - 8) / (r.height - 20) * 72, -48, 24) }; }; canvas.onpointerdown = e => run(() => { editable(); if (operation || saving || loading)
    throw Error('Wait for the current operation.'); if (e.button !== 0)
    return; e.preventDefault(); const p = point(e), r = bounds(); working = structuredClone(c.automation || []); dragIndex = working.findIndex(v => Math.abs(v.time - p.time) / c.duration * (r.width - 52) < 10 && Math.abs(v.value - p.value) / 72 * (r.height - 20) < 12); if (dragIndex < 0) {
    if (working.length >= 128)
        throw Error('Maximum 128 envelope points.');
    working.push(p);
    dragIndex = working.length - 1;
} canvas.setPointerCapture(e.pointerId); draw(); }); canvas.onpointermove = e => { if (dragIndex < 0)
    return; working[dragIndex] = point(e); draw(); }; canvas.onpointerup = () => { if (dragIndex < 0)
    return; const pts = working.sort((a, b) => a.time - b.time); dragIndex = -1; working = null; run(() => editProject('Edit volume envelope', p => p.clips.find(x => x.id === c.id).automation = pts)); }; canvas.onpointercancel = () => { dragIndex = -1; working = null; draw(); }; canvas.oncontextmenu = e => { e.preventDefault(); run(() => { editable(); const p = point(e), pts = c.automation || [], i = pts.reduce((best, v, j) => Math.abs(v.time - p.time) < Math.abs((pts[best]?.time ?? Infinity) - p.time) ? j : best, 0); if (pts.length)
    editProject('Remove envelope point', p => p.clips.find(x => x.id === c.id).automation.splice(i, 1)); }); }; requestAnimationFrame(draw); }
function drawPhase(channels) { const canvas = $('#phase-scope'); if (!canvas || canvas.clientWidth === 0)
    return; const r = canvas.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; const ctx = canvas.getContext('2d'), w = r.width, h = r.height; ctx.fillStyle = '#151c27'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#37475c'; ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w / 2, h - 4); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 4, h / 2); ctx.lineTo(w / 2, h - 4); ctx.lineTo(4, h / 2); ctx.closePath(); ctx.stroke(); if (!channels?.length)
    return; ctx.strokeStyle = '#6cdbc2'; ctx.globalAlpha = .65; ctx.beginPath(); const a = channels[0], b = channels[1] || a, step = Math.max(1, Math.floor(a.length / 1400)); for (let i = 0; i < a.length; i += step) {
    const x = w / 2 + (a[i] - b[i]) * w * .32, y = h / 2 - (a[i] + b[i]) * h * .32;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
} ctx.stroke(); }
async function handleWorkspaceAction(action, b) {
    const c = selected(), p = workstation.prefs;
    const dockMap = { 'markers-panel': 'markers', 'clips-panel': 'clips', 'fade-panel': 'fades', 'envelope-panel': 'envelope', 'history-panel': 'history', 'metadata': 'metadata', 'meters-panel': 'meters' };
    if (dockMap[action]) {
        workstation.showDock(dockMap[action]);
        return true;
    }
    if (action.startsWith('restore-')) {
        restorationDialog(action.slice(8));
        return true;
    }
    switch (action) {
        case 'command-search':
            workstation.search();
            break;
        case 'preferences':
            preferencesDialog();
            break;
        case 'layout':
            workstation.layoutDialog();
            break;
        case 'toggle-left':
            p.showLeft = !p.showLeft;
            if (innerWidth <= 960 && p.showLeft)
                p.showMaster = false;
            workstation.applyLayout();
            workstation.save();
            break;
        case 'toggle-master':
            p.showMaster = !p.showMaster;
            $('.app-shell').classList.toggle('mobile-master', p.showMaster);
            if (innerWidth <= 680)
                p.showLeft = false;
            workstation.applyLayout();
            workstation.save();
            break;
        case 'toggle-bottom':
            p.showBottom = !p.showBottom;
            workstation.applyLayout();
            workstation.save();
            break;
        case 'files-panel':
            await showLeftTab('files');
            break;
        case 'inspector-panel':
            await showLeftTab('inspector');
            break;
        case 'tracks-panel':
            await showLeftTab('tracks');
            break;
        case 'notes-panel':
            await showLeftTab('notes');
            workstation.showDock('collaboration');
            break;
        case 'toggle-snap':
            p.snap = !p.snap;
            workstation.save();
            refresh();
            break;
        case 'toggle-follow':
            p.follow = !p.follow;
            workstation.save();
            refresh();
            break;
        case 'vertical-up':
            p.amplitude = clamp(p.amplitude * 1.5, .25, 16);
            workstation.save();
            refresh();
            break;
        case 'vertical-down':
            p.amplitude = clamp(p.amplitude / 1.5, .25, 16);
            workstation.save();
            refresh();
            break;
        case 'zoom-sample':
            viewDuration = 200 / (activeAsset()?.sampleRate || 48000);
            viewStart = Math.max(0, cursor - (mode === 'audio' ? c.start : 0) - viewDuration / 2);
            refresh();
            break;
        case 'zoom-selection':
            viewStart = selection[0];
            viewDuration = Math.max(1 / (activeAsset()?.sampleRate || 48000), selection[1] - selection[0]);
            refresh();
            break;
        case 'select-all':
            selection = mode === 'audio' ? [0, c.duration] : [c.start, c.start + c.duration];
            refresh();
            break;
        case 'select-none':
            selection = [0, 0];
            refresh();
            break;
        case 'selection-dialog':
            selectionDialog();
            break;
        case 'goto':
            inputModal('Go to position', 'Timecode, seconds or sample frames in ' + p.format, formatPosition(cursor, p.format, project.sampleRate), v => seek(parsePosition(v, p.format, project.sampleRate)));
            break;
        case 'previous-marker':
            await seek([...project.markers].sort((a, b) => b.time - a.time).find(m => m.time < cursor - .001)?.time || 0);
            break;
        case 'next-marker':
            await seek([...project.markers].sort((a, b) => a.time - b.time).find(m => m.time > cursor + .001)?.time || durationOf(project));
            break;
        case 'play-start':
            await seek(0);
            if (!engine.playing)
                await playback();
            break;
        case 'play-selection': {
            const offset = mode === 'audio' ? c.start : 0;
            await engine.play(playbackProject(), selection[0] + offset, { end: selection[1] + offset, loop });
            $('#play').innerHTML = icon('pause');
            $('#engine-status').textContent = 'Playing selection';
            break;
        }
        case 'duplicate':
            editProject('Duplicate clip', p => { const v = { ...structuredClone(c), id: uid(), start: c.start + c.duration }; p.clips.push(v); selectedId = v.id; });
            mode = 'montage';
            fit();
            break;
        case 'copy':
            if (mode === 'audio') {
                await copyAudioSelection();
                break;
            }
            return false;
        case 'paste':
            if (clipboard?.kind === 'audio') {
                await pasteAudioSelection();
                break;
            }
            return false;
        case 'cut':
            if (mode === 'audio') {
                await copyAudioSelection();
                await processClip('delete');
                break;
            }
            clipboard = structuredClone(c);
            editProject('Cut clip', p => p.clips = p.clips.filter(x => x.id !== c.id));
            selectedId = project.clips[0]?.id;
            refresh();
            break;
        case 'clip-mute':
            editProject('Mute clip', p => { const x = p.clips.find(x => x.id === c.id); x.mute = !x.mute; });
            break;
        case 'clip-start':
            editProject('Move clip to cursor', p => p.clips.find(x => x.id === c.id).start = cursor);
            break;
        case 'nudge-left':
        case 'nudge-right':
            editProject('Nudge clip', q => q.clips.find(x => x.id === c.id).start = Math.max(0, c.start + p.nudge * (action === 'nudge-left' ? -1 : 1)));
            break;
        case 'trim-nondestructive': {
            const offset = mode === 'audio' ? 0 : c.start, start = clamp(selection[0] - offset, 0, c.duration), end = clamp(selection[1] - offset, start, c.duration);
            if (end <= start)
                throw Error('Select audio inside this clip.');
            editProject('Trim clip to selection', p => { const x = p.clips.find(x => x.id === c.id); x.start += start; x.offset += start; x.duration = end - start; x.fadeIn = Math.min(x.fadeIn, x.duration); x.fadeOut = Math.min(x.fadeOut, x.duration); x.automation = []; });
            selection = [0, 0];
            fit();
            break;
        }
        case 'clip-fade-in':
        case 'clip-fade-out': {
            const key = action === 'clip-fade-in' ? 'fadeIn' : 'fadeOut';
            inputModal('Clip ' + (key === 'fadeIn' ? 'fade in' : 'fade out'), 'Fade duration (seconds)', c[key] || .5, v => editProject('Set clip fade', p => p.clips.find(x => x.id === c.id)[key] = v), { type: 'number', min: 0, max: c.duration, step: .001 });
            break;
        }
        case 'reset-fades':
            editProject('Remove clip fades', p => Object.assign(p.clips.find(x => x.id === c.id), { fadeIn: 0, fadeOut: 0 }));
            break;
        case 'crossfade': {
            const other = project.clips.filter(x => x.id !== c.id && x.trackId === c.trackId && x.start >= c.start && x.start < c.start + c.duration).sort((a, b) => a.start - b.start)[0];
            if (!other)
                throw Error('Overlap the selected clip with a following clip on the same track.');
            const overlap = Math.min(c.start + c.duration, other.start + other.duration) - other.start;
            editProject('Crossfade overlapping clips', p => { p.clips.find(x => x.id === c.id).fadeOut = overlap; p.clips.find(x => x.id === other.id).fadeIn = overlap; });
            workstation.showDock('fades');
            break;
        }
        case 'envelope-point':
            inputModal('Add volume envelope point', 'Gain at cursor (dB)', 0, v => editProject('Add volume envelope point', p => { const x = p.clips.find(x => x.id === c.id); x.automation = [...(x.automation || []), { time: clamp(cursor - c.start, 0, c.duration), value: v }].sort((a, b) => a.time - b.time); }), { type: 'number', min: -96, max: 24, step: .1 });
            break;
        case 'envelope-clear':
            editProject('Reset volume envelope', p => p.clips.find(x => x.id === c.id).automation = []);
            break;
        case 'track-up':
        case 'track-down': {
            const t = workspaceState().track;
            editProject('Reorder track', p => { const i = p.tracks.findIndex(x => x.id === t.id), j = clamp(i + (action === 'track-up' ? -1 : 1), 0, p.tracks.length - 1); [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]]; });
            break;
        }
        case 'remove-track': {
            const t = workspaceState().track;
            if (project.clips.some(c => c.trackId === t.id))
                throw Error('Move or remove the clips on this track first.');
            if (project.tracks.length < 2)
                throw Error('Keep at least one track.');
            editProject('Remove empty track', p => p.tracks = p.tracks.filter(x => x.id !== t.id));
            selectedTrackId = null;
            break;
        }
        case 'add-to-track': {
            const track = workspaceState().track;
            editProject('Insert source at cursor', p => { const x = { ...structuredClone(c), id: uid(), trackId: track.id, start: cursor }; p.clips.push(x); selectedId = x.id; });
            mode = 'montage';
            fit();
            break;
        }
        case 'insert-silence':
            inputModal('Insert silence', 'Duration at cursor (seconds)', 1, async (value) => {
                editable();
                const destination = project, clipId = c.id, a = activeAsset(), at = Math.round(clamp(cursor - c.start, 0, c.duration) * a.sampleRate), len = Math.round(value * a.sampleRate);
                operation = true;
                workstation.update();
                try {
                    const source = await readAsset(a, Math.round(c.offset * a.sampleRate), Math.round(c.duration * a.sampleRate));
                    if (project !== destination || !project.clips.some(x => x.id === clipId))
                        throw Error('The destination changed. Try again.');
                    if ((source[0].length + len) * source.length * 4 > 96 * 1024 * 1024)
                        throw Error('Silence insertion exceeds the edit memory limit.');
                    const channels = source.map(ch => { const out = new Float32Array(ch.length + len); out.set(ch.subarray(0, at)); out.set(ch.subarray(at), at + len); return out; }), id = uid(), name = c.name + ' · silence';
                    engine.addAsset({ id, name, channels, sampleRate: a.sampleRate, duration: channels[0].length / a.sampleRate });
                    operation = false;
                    editProject('Insert silence', p => { p.assets.push({ id, name, sampleRate: a.sampleRate, duration: channels[0].length / a.sampleRate }); Object.assign(p.clips.find(x => x.id === clipId), { assetId: id, offset: 0, duration: channels[0].length / a.sampleRate, automation: [] }); });
                    fit();
                    await analyzeSource();
                }
                finally {
                    operation = false;
                    workstation.update();
                }
            }, { type: 'number', min: .001, max: 600, step: .001 });
            break;
        case 'capture-noise':
            noiseProfile = { assetId: c.assetId, start: clamp(selection[0] - (mode === 'montage' ? c.start : 0), 0, c.duration), end: clamp(selection[1] - (mode === 'montage' ? c.start : 0), 0, c.duration) };
            if (noiseProfile.end <= noiseProfile.start) {
                noiseProfile = null;
                throw Error('Select noise inside the active clip.');
            }
            toast('Noise profile selection captured. Open Noise reduction to apply.');
            break;
        case 'detect-pitch':
            await detectSelectedPitch();
            break;
        case 'analyze-selection':
            await analyzeRegion();
            break;
        case 'analyze-clip':
            await analyzeRegion(true);
            break;
        case 'limiter-details':
            modal('Peak limiter settings', `<form><div class="form-grid"><label class="field">Ceiling (dBFS)<input name="ceiling" type="number" min="-30" max="0" step=".1" value="${project.effects.limiter.ceiling}"></label><label class="field">Release (ms)<input name="release" type="number" min="5" max="5000" step="1" value="${project.effects.limiter.release}"></label></div><p class="help">Linked stereo sample-peak limiter with 5 ms lookahead. Use Delivery for encoded true-peak verification.</p>${actions()}</form>`, d => d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target); editProject('Limiter settings', p => { p.effects.limiter.ceiling = Number(f.get('ceiling')); p.effects.limiter.release = Number(f.get('release')); }); d.close(); }); });
            break;
        case 'scroll-tracks-up':
            trackOffset = Math.max(0, trackOffset - 1);
            refresh();
            break;
        case 'scroll-tracks-down':
            trackOffset = Math.min(project.tracks.length - 1, trackOffset + 1);
            refresh();
            break;
        case 'meter-reset':
            workstation.peakHold = [-Infinity, -Infinity];
            for (const id of ['peak-hold-l', 'peak-hold-r'])
                if ($('#' + id))
                    $('#' + id).textContent = '−∞';
            break;
        case 'render-selection':
        case 'render-stems':
            exportDialog(action === 'render-selection' ? 'selection' : 'stems');
            break;
        case 'waveform-view':
            spectral = false;
            clearSpectral();
            refresh();
            break;
        case 'spectral-view':
            if (mode !== 'audio') {
                mode = 'audio';
                viewStart = 0;
                viewDuration = c.duration;
            }
            spectral = true;
            await renderSpectral();
            refresh();
            break;
        case 'spectral-selection':
            modal('Frequency selection', `<form><div class="form-grid"><label class="field">Low frequency (Hz)<input name="low" type="number" step="any" min="0" max="${activeAsset().sampleRate / 2}" value="${frequencySelection?.[0] || 0}"></label><label class="field">High frequency (Hz)<input name="high" type="number" step="any" min="1" max="${activeAsset().sampleRate / 2}" value="${frequencySelection?.[1] || activeAsset().sampleRate / 2}"></label></div><p class="help">In Spectrogram view, drag a rectangle to select time and frequency together.</p>${actions('Set frequency range')}</form>`, d => d.querySelector('form').onsubmit = e => { e.preventDefault(); run(() => { const f = new FormData(e.target), lo = Number(f.get('low')), hi = Number(f.get('high')); if (hi <= lo)
                throw Error('High frequency must exceed low frequency.'); frequencySelection = [lo, hi]; d.close(); refresh(); }); });
            break;
        default: return false;
    }
    return true;
}
shell();
analyzeSource();
if(isStaticDeployment){$('#status-detail').textContent='Browser session · Download project JSON and audio to keep your work';}else{setInterval(sync, 15000);
client.me().then(u => { user = u; $('#presence').innerHTML = `<span class="avatar" title="${esc(u.name)}">${esc(u.name.slice(0, 2).toUpperCase())}</span>`; }).catch(() => { $('#status-detail').textContent = 'Sign in to save and collaborate'; });}
if (location.hash.startsWith('#join='))
    joinDialog(location.hash.slice(6));
async function seek(position) {
    const wasPlaying = engine.playing;
    engine.pause();
    cursor = position;
    engine.position = position;
    $('#play').innerHTML = icon('play');
    refresh();
    if (wasPlaying && position < durationOf(project))
        await playback();
}
$('#dialog').addEventListener('cancel', e => {
    if (operation || saving || loading || recordPending)
        e.preventDefault();
});
if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    for (const spec of [{ name: 'read_audio_session', title: 'Read audio session', description: 'Read the current project, track list, clip list and cursor without changing audio.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ name: project.name, revision: project.revision, dirty, cursor, mode, tracks: project.tracks, clips: project.clips, analysis }) }, { name: 'set_audio_selection', title: 'Select audio range', description: 'Stage a time selection in the current audio view without editing or exporting audio.', inputSchema: { type: 'object', properties: { start: { type: 'number', minimum: 0 }, end: { type: 'number', minimum: 0 } }, required: ['start', 'end'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: input => {
                if (saving || operation || loading)
                    throw Error('Session is busy.');
                if (!Number.isFinite(input.start) || !Number.isFinite(input.end) || input.start < 0 || input.end <= input.start || input.end > (mode === 'audio' ? selected()?.duration : durationOf(project)))
                    throw Error('Range is outside the active audio.');
                selection = [input.start, input.end];
                refresh();
                return { selection };
            } }, { name: 'open_audio_render_dialog', title: 'Configure audio export', description: 'Open the WAV export dialog. This does not render, download, or save audio.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: () => { exportDialog(); return { dialog: 'Render audio', completed: false }; } }])
        Promise.resolve(document.modelContext.registerTool(spec, { signal: lifecycle.signal })).catch(e => console.warn('Tool registration unavailable', e));
}
let eventStream = null, watchedProject = null;
function watchProject() {
    if (watchedProject === project.id)
        return;
    eventStream?.close();
    watchedProject = project.id;
    if (!project.id)
        return;
    eventStream = client.watch(project.id, () => {
        if (!saving && !operation && !loading)
            sync();
    }, () => { role = 'viewer'; toast('Your project access changed. Local edits remain available as a copy.', true); });
}
engine.addEventListener('buffering', () => toast('Buffering audio from disk…'));
engine.addEventListener('error', e => toast(e.detail, true));
function professionalDialog() { modal('Studio tools', `<div class="form-grid">${[['diagnostics', 'Engine & device diagnostics'], ['restoration', 'Restoration, time & pitch'], ['delivery', 'Loudness & true-peak delivery'], ['disc', 'CD / DDP authoring'], ['adm', 'ADM object master'], ['native', 'Native plug-in companion'], ['admin', 'Project administration']].map(([a, t]) => `<button class="btn" data-action="${a}">${t}</button>`).join('')}</div><p class="help">Long WAV sources stream from disk or authenticated byte ranges. Processing, renderer and controls ship as separate modules.</p>`); }
function restorationDialog(initial = 'denoise') {
    const c = selected(), a = activeAsset();
    if (!c || !a)
        throw Error('Select an audio clip.');
    const labels = { denoise: 'Noise reduction', gate: 'Spectral gate', declick: 'Automatic declick', heal: 'Predictive gap healing', repair: 'Spectral interpolation', attenuate: 'Spectral attenuation', stretch: 'Time stretch', pitch: 'Pitch shift', correct: 'Sustained-note correction' };
    const descriptions = { denoise: 'Capture a noise-only selection, then select the material to reduce. The original source is retained.', gate: 'Attenuate spectral bins below the threshold within the selected frequency range.', declick: 'Detect short discontinuities and plateaus within the selected audio.', heal: 'Select an internal gap up to 200 ms, with clean audio on both sides.', repair: 'Select an internal region up to 500 ms with sustained material around it.', attenuate: 'Reduce energy inside the active spectral selection. Lasso and brush masks retain their drawn shape.', stretch: 'Change duration without intentionally changing pitch. Stereo WSOLA, 0.5–2×.', pitch: 'Shift pitch while retaining duration. Stereo resampling, ±12 semitones.', correct: 'Tune sustained monophonic material toward one MIDI note. Formants are not preserved.' };
    const profile = noiseProfile?.assetId === a.id ? noiseProfile : { start: 0, end: Math.min(.25, c.duration) };
    const fields = { reduction: ['Reduction (dB)', 12, 0, 48, .1], lowHz: ['Low frequency (Hz)', frequencySelection?.[0] || 0, 0, a.sampleRate / 2, 'any'], highHz: ['High frequency (Hz)', frequencySelection?.[1] || a.sampleRate / 2, 1, a.sampleRate / 2, 'any'], noiseStart: ['Noise profile start (clip seconds)', profile.start, 0, c.duration, 'any'], noiseEnd: ['Noise profile end (clip seconds)', profile.end, 0, c.duration, 'any'], threshold: ['Gate threshold (dBFS)', -55, -100, 0, 1], clickThreshold: ['Click threshold multiplier', 6, 2, 30, .1], maxWidthMs: ['Maximum click width (ms)', 2, .02, 2, .01], contextMs: ['Prediction context (ms)', 40, 5, 200, 1], ratio: ['Duration multiplier', 1.25, .5, 2, .01], semitones: ['Pitch shift (semitones)', 0, -12, 12, .01], targetMidi: ['Target MIDI note (69 = A4)', 69, 24, 96, 1], strength: ['Correction strength', 1, 0, 1, .01] };
    const visible = { denoise: ['noiseStart', 'noiseEnd', 'reduction', 'lowHz', 'highHz', 'fftSize'], gate: ['threshold', 'reduction', 'lowHz', 'highHz', 'fftSize'], declick: ['clickThreshold', 'maxWidthMs'], heal: ['contextMs'], repair: ['lowHz', 'highHz', 'fftSize'], attenuate: ['reduction', 'lowHz', 'highHz', 'fftSize'], stretch: ['ratio'], pitch: ['semitones'], correct: ['targetMidi', 'strength'] };
    modal(labels[initial] || 'Audio processing', `<form id="restore-form"><div class="restore-selection">${esc(c.name)} · ${selection[1] > selection[0] ? time(selection[0]) + '–' + time(selection[1]) : 'Entire clip · ' + time(c.duration)}</div><label class="field">Operation<select name="operation">${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === initial ? 'selected' : ''}>${v}</option>`).join('')}</select></label><p id="restore-description" class="parameter-help"></p><div class="form-grid">${Object.entries(fields).map(([k, [label, value, min, max, step]]) => `<label class="field" data-parameter="${k}">${label}<input name="${k}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`).join('')}<label class="field" data-parameter="fftSize">FFT size<select name="fftSize">${[256, 512, 1024, 2048, 4096, 8192].map(n => `<option value="${n}" ${n === 2048 ? 'selected' : ''}>${n} samples</option>`).join('')}</select></label></div><div id="restore-status" class="job-status" role="status"></div>${actions('Apply processing')}</form>`, d => { const select = d.querySelector('[name=operation]'); const update = () => { const op = select.value; $('#restore-description').textContent = descriptions[op]; d.querySelectorAll('[data-parameter]').forEach(el => { const show = visible[op].includes(el.dataset.parameter); el.hidden = !show; el.querySelector('input,select').disabled = !show; }); }; select.onchange = update; update(); d.querySelector('form').onsubmit = e => { e.preventDefault(); run(async () => { const f = new FormData(e.target), options = Object.fromEntries([...f].filter(([k]) => k !== 'operation').map(([k, v]) => [k, Number(v)])); if (options.clickThreshold !== undefined) {
        options.threshold = options.clickThreshold;
        delete options.clickThreshold;
    } if (options.highHz !== undefined && options.lowHz >= options.highHz)
        throw Error('High frequency must exceed low frequency.'); if (f.get('operation') === 'denoise' && options.noiseEnd <= options.noiseStart)
        throw Error('Noise profile end must exceed its start.'); await advancedProcess(f.get('operation'), options, d); }); }; });
}
async function advancedProcess(action, options, d) {
    editable();
    if (operation)
        throw Error('Wait for the current operation.');
    const c = selected(), a = activeAsset(), sr = a.sampleRate, n = Math.round(c.duration * sr), destination=project, serial=changeSerial, processingMask=advanced?.processingMask();
    if (n * a.channels.length * 4 > 96 * 1024 * 1024)
        throw Error('Trim a clip to the region to process; offline repair has a 96 MB working limit.');
    const start = selection[1] > selection[0] ? clamp(selection[0] - (mode === 'montage' ? c.start : 0), 0, c.duration) : 0, end = selection[1] > selection[0] ? clamp(selection[1] - (mode === 'montage' ? c.start : 0), start, c.duration) : c.duration;
    if (end <= start)
        throw Error('Select audio inside the clip.');
    operation = true;
    const submit = d.querySelector('[type=submit]');
    submit.disabled = true;
    $('#restore-status').textContent = 'Processing source audio…';
    try {
        stop();
        const source = await readAsset(a, Math.round(c.offset * sr), n);
        const baked=action==='stretch';if(baked)bakeClipModifiers(source,c,sr);
        let channels;
        if (['stretch', 'pitch', 'correct'].includes(action)) {
            const from = Math.round(start * sr), to = Math.round(end * sr), region = source.map(c => c.slice(from, to)), result = await engine.job(action, { channels: region, sampleRate: sr, ratio: options.ratio, semitones: options.semitones, options });
            const processed = result.channels || result;
            channels = source.map((ch, i) => { const out = new Float32Array(ch.length - (to - from) + processed[i].length); out.set(ch.subarray(0, from)); out.set(processed[i], from); out.set(ch.subarray(to), from + processed[i].length); return out; });
        }
        else {
            if (['denoise','gate','repair','attenuate'].includes(action)) options.mask=processingMask;
            channels = await engine.job('restore', { channels: source, sampleRate: sr, operation: action, options: { ...options, start, end, amount: -options.reduction } });
        }
        if(project!==destination||changeSerial!==serial||!isEditor()||selected()?.id!==c.id)throw Error('The session changed during processing; result was not applied.');
        commitProcessedClip(action,c,a,channels,sr,baked);
        selection = [0, 0];
        renderLeft();
        fit();
        await analyzeSource();
        d.close();
        toast('Processing applied. Original source retained; Undo available.');
    }
    finally {
        operation = false;
        submit.disabled = false;
    }
}
function deliveryDialog() {
    modal('Loudness & true-peak delivery', `<form id="delivery-form"><div class="form-grid"><label class="field">Integrated target (LUFS)<input name="target" type="number" value="-14" min="-36" max="-5" step=".1"></label><label class="field">True-peak ceiling (dBTP)<input name="ceiling" type="number" value="-1" min="-12" max="0" step=".1"></label></div><p class="help">Linked gain normalization is constrained by an 8-phase true-peak measurement. If dynamics prevent both targets being met, the report says so. The final 24-bit WAV is decoded and measured again. This is not a certification service.</p><div id="delivery-result"></div>${actions('Verify & render delivery')}</form><hr><button class="btn" id="stream-render">Stream WAV to disk</button><p class="help">Streaming export uses continuous master processing and bounded blocks. It requires the browser file-save API on a secure origin. The streaming path preserves the master sample-peak settings; use the verified delivery pass for a true-peak target.</p>`, d => {
        d.querySelector('form').onsubmit = e => {
            e.preventDefault();
            run(async () => {
                if (operation)
                    throw Error('Audio processing is busy.');
                if (project.clips.some(c => engine.assets.get(c.assetId)?.provider))
                    throw Error('Verified delivery currently needs resident PCM. Render a shorter region or use streaming export.');
                operation = true;
                const b = e.target.querySelector('[type=submit]');
                b.disabled = true;
                $('#delivery-result').textContent = 'Rendering and verifying encoded output…';
                try {
                    const f = new FormData(e.target), result = await renderJob(project, project.sampleRate, 0, durationOf(project), { bits: 24, dither: true, delivery: { target: Number(f.get('target')), ceiling: Number(f.get('ceiling')) } });
                    download(result.buffer, project.name + ' — delivery.wav', 'audio/wav');
                    download(JSON.stringify(result.delivery, null, 2), project.name + ' — delivery-report.json', 'application/json');
                    analysis = result.analysis;
                    updateAnalysis(analysis);
                    $('#analysis-caption').textContent = 'Delivery WAV · encoded output';
                    $('#delivery-result').textContent = `${num(analysis.integrated)} LUFS · ${num(analysis.truePeak)} dBTP. ${result.delivery.loudnessPass ? 'Both targets passed.' : 'True-peak ceiling passed; loudness target could not be reached without changing dynamics.'}`;
                }
                finally {
                    operation = false;
                    b.disabled = false;
                }
            });
        };
        $('#stream-render').onclick = () => run(async () => {
            if (!window.showSaveFilePicker)
                throw Error('Streaming file export needs a secure Chromium browser with the file-save API.');
            const handle = await showSaveFilePicker({ suggestedName: project.name + '.wav', types: [{ description: 'PCM WAV', accept: { 'audio/wav': ['.wav'] } }] }), sink = await handle.createWritable();
            operation = true;
            try {
                const report = await renderToSink(structuredClone(project), engine.assets, project.sampleRate, 0, durationOf(project), sink, { bits: 24, dither: true, onProgress: p => $('#delivery-result').textContent = 'Streaming ' + Math.round(p * 100) + '%' });
                $('#delivery-result').textContent = 'WAV saved. Integrated loudness ' + num(report.integrated) + ' LUFS.';
            }
            catch (e) {
                await sink.abort?.();
                throw e;
            }
            finally {
                operation = false;
            }
        });
    });
}
function conflictDialog(info) {
    modal('Review overlapping edits', `<p>Independent changes are retained. Choose a value for each overlap; no conflicting save has been committed.</p><div id="conflict-fields">${info.conflicts.map((c, i) => `<label class="field">${esc(c.path)} · ${esc(c.kind)}<small>Saved: ${esc(JSON.stringify(c.head).slice(0, 180))}<br>Your edit: ${esc(JSON.stringify(c.incoming).slice(0, 180))}</small><select data-conflict="${i}"><option value="head">Keep saved value</option><option value="incoming">Keep my value</option></select></label>`).join('')}</div><div class="dialog-actions"><button class="btn" data-action="save-copy">Save separate copy</button><button class="btn primary" id="resolve-conflicts">Commit reviewed merge</button></div>`, d => {
        $('#resolve-conflicts').onclick = () => run(async () => {
            const choices = {};
            d.querySelectorAll('[data-conflict]').forEach(el => choices[info.conflicts[Number(el.dataset.conflict)].path] = el.value);
            const result = await client.resolveConflict(project.id, info.proposalId, info.headRevision, choices), assets = await hydrateSources(result.project, project.id);
            for (const [id, a] of assets)
                engine.assets.set(id, a);
            project = result.project;
            dirty = false;
            conflict = false;
            history.past = [];
            history.future = [];
            renderLeft();
            renderRack();
            fit();
            d.close();
            toast('Reviewed merge saved.');
        });
    });
}
async function adminDialog() {
    if (!project.id)
        throw Error('Save this project first.');
    const a = await client.admin(project.id);
    modal('Project administration', `<p>${a.storage.files} sources · ${(a.storage.bytes / 1048576).toFixed(1)} MB stored. Permission revision ${a.settings.permission_epoch}.</p><div>${a.members.map(m => `<div class="list-item"><div class="detail">${esc(m.name || m.user_id)}<small>${esc(m.email || m.user_id)}</small></div>${m.role === 'owner' ? '<strong>Owner</strong>' : `<select data-member="${esc(m.user_id)}">${['editor', 'commenter', 'viewer', 'revoke'].map(r => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select><button class="btn small" data-update-member="${esc(m.user_id)}">Apply</button>`}</div>`).join('')}</div><div class="form-grid"><label class="field">Storage quota (MB)<input id="quota" type="number" min="1" max="20480" value="${a.settings.storage_quota / 1048576}"></label><button class="btn" id="save-quota">Update quota</button><button class="btn" id="archive-project">${a.settings.archived ? 'Reopen project' : 'Archive project'}</button><button class="btn" id="revoke-invites">Revoke unused invitations</button></div><p class="help">Archiving blocks writes and preserves audio/history. Member revocation closes the event stream and rejects subsequent access. Site sign-in controls remain managed by your hosting identity provider.</p><div class="dialog-actions"><button class="btn" id="audit-download">Download audit log</button></div><div style="max-height:180px;overflow:auto">${a.events.slice(0, 15).map(e => `<p class="help">${new Date(e.created).toLocaleString()} · ${esc(e.action)} · ${esc(e.actor)}</p>`).join('')}</div>`, d => { d.querySelectorAll('[data-update-member]').forEach(b => b.onclick = () => run(async () => { const select = [...d.querySelectorAll('[data-member]')].find(s => s.dataset.member === b.dataset.updateMember); await client.configure(project.id, { userId: b.dataset.updateMember, role: select.value }); await adminDialog(); })); $('#save-quota').onclick = () => run(async () => { await client.configure(project.id, { storageQuota: Math.round(Number($('#quota').value) * 1048576) }); toast('Quota updated.'); }); $('#archive-project').onclick = () => run(async () => { await client.configure(project.id, { archived: !a.settings.archived }); await adminDialog(); }); $('#revoke-invites').onclick = () => run(async () => { await client.revokeInvitations(project.id); toast('Unused invitations revoked.'); }); $('#audit-download').onclick = () => download(JSON.stringify(a.events, null, 2), 'auralis-audit.json', 'application/json'); });
}
async function discDialog() {
    const { makeCue, zipFiles } = await import('../modules/audio/authoring.js');
    modal('CD / DDP authoring', `<form id="disc-form"><div class="form-grid"><label class="field">Album title<input name="title" value="${esc(project.metadata?.title || project.name)}"></label><label class="field">Artist<input name="artist" value="${esc(project.metadata?.artist || '')}"></label><label class="field">UPC / EAN · optional<input name="catalog" maxlength="13"></label><label class="field">Output<select name="format"><option value="cue">CD master · WAV + CUE + report</option><option value="ddp">DDP 2.0 · configured native encoder</option></select></label></div><p>Select markers for CD track starts. Boundaries round to 1/75 second; the report records each adjustment.</p>${project.markers.map((m, i) => `<label class="field" style="display:flex;align-items:center;gap:8px"><input style="width:auto" type="checkbox" name="track" value="${i}" ${m.time <= durationOf(project) - 4 ? 'checked' : ''}>${time(m.time)} · ${esc(m.name)}<input aria-label="ISRC for ${esc(m.name)}" data-isrc="${i}" placeholder="ISRC · optional" maxlength="12"></label>`).join('')}<p class="help">The master is resampled to44.1kHz, dithered to16-bit stereo and padded to588-frame sectors. CD writing is handled by your disc-burning application. DDP requires the standalone companion configured with cue2ddp and ddpinfo; the exported fileset is verified before download.</p><div id="disc-result"></div>${actions('Author master')}</form>`, d => {
        d.querySelector('form').onsubmit = e => {
            e.preventDefault();
            run(async () => {
                if (operation)
                    throw Error('Audio processing is busy.');
                const f = new FormData(e.target), tracks = f.getAll('track').map(index => ({ ...project.markers[Number(index)], isrc: d.querySelector(`[data-isrc="${index}"]`).value.trim().toUpperCase() })).sort((a, b) => a.time - b.time), cue = makeCue({ title: f.get('title'), artist: f.get('artist'), catalog: f.get('catalog'), tracks, duration: durationOf(project) });
                operation = true;
                const button = e.target.querySelector('[type=submit]');
                button.disabled = true;
                $('#disc-result').textContent = 'Rendering CD programme…';
                try {
                    const result = await renderJob(project, 44100, 0, durationOf(project), { bits: 16, dither: true }), decoded = decodeWav(result.buffer instanceof Blob ? await result.buffer.arrayBuffer() : result.buffer), frames = Math.ceil(decoded.channels[0].length / 588) * 588, channels = decoded.channels.map(c => { const padded = new Float32Array(frames); padded.set(c); return padded; }), wav = encodeWav(channels, 44100, { bits: 16, dither: false });
                    if (f.get('format') === 'ddp') {
                        const cueBytes = new TextEncoder().encode(cue.cue), prefix = new ArrayBuffer(4);
                        new DataView(prefix).setUint32(0, cueBytes.length, true);
                        const response = await apiFetch('/api/native/ddp', { method: 'POST', headers: { 'content-type': 'application/vnd.auralis.ddp-job' }, body: new Blob([prefix, cueBytes, wav]) });
                        if (!response.ok)
                            throw Error((await response.json()).error || 'DDP is available in the configured standalone companion.');
                        download(await response.blob(), project.name + ' — DDP.zip', 'application/zip');
                    }
                    else
                        download(zipFiles([['album.wav', wav], ['album.cue', cue.cue], ['authoring-report.json', JSON.stringify({ ...cue, analysis: result.analysis, format: 'CD PCM16 stereo44100', ddp: false }, null, 2)]]), project.name + ' — CD master.zip', 'application/zip');
                    $('#disc-result').textContent = 'Master authored. ' + tracks.length + ' tracks; ' + frames / 588 + ' audio sectors.';
                }
                finally {
                    operation = false;
                    button.disabled = false;
                }
            });
        };
    });
}
async function admDialog() {
    modal('ADM object master', `<form id="adm-form"><p>Each unmuted track becomes two independent PCM objects. The object channels retain their audio for a downstream renderer.</p><div class="form-grid"><label class="field">Title<input name="title" value="${esc(project.name)}"></label><label class="field">Container<select name="container"><option value="riff">RIFF WAV + ADM XML / CHNA</option><option value="bw64">BW64 + ds64 / ADM / CHNA</option></select></label></div>${project.tracks.filter(t => !t.mute).map(t => `<div class="form-grid"><span>${esc(t.name)}</span><label class="field">Elevation (degrees)<input type="number" min="-90" max="90" value="0" data-elevation="${esc(t.id)}"></label></div>`).join('')}<p class="help">ITU-R BS.2076-2 Objects profile,24-bit PCM48kHz. Stereo objects use ±30° azimuth plus the selected elevation. This generic ADM export does not encode Dolby Atmos or include a Dolby renderer. Current export limit:16 objects and256MB PCM.</p><div id="adm-result"></div>${actions('Export ADM master')}</form>`, d => {
        d.querySelector('form').onsubmit = e => {
            e.preventDefault();
            run(async () => {
                if (operation)
                    throw Error('Audio processing is busy.');
                const tracks = project.tracks.filter(t => !t.mute && project.clips.some(c => c.trackId === t.id)), length = Math.round(durationOf(project) * 48000);
                if (tracks.length * 2 > 16 || tracks.length * 2 * length * 4 > 256 * 1024 * 1024)
                    throw Error('ADM export exceeds16 objects or256MB. Render a shorter programme.');
                operation = true;
                const button = e.target.querySelector('[type=submit]');
                button.disabled = true;
                $('#adm-result').textContent = 'Rendering independent object channels…';
                try {
                    const channels = [], objects = [];
                    for (const t of tracks) {
                        const p = structuredClone(project);
                        p.clips = p.clips.filter(c => c.trackId === t.id);
                        p.tracks = p.tracks.map(v => ({ ...v, solo: false, mute: v.id !== t.id }));
                        p.effects.bypass = true;
                        const r = await renderJob(p, 48000, 0, durationOf(project), { bits: 32, float: true, dither: false }), audio = decodeWav(r.buffer instanceof Blob ? await r.buffer.arrayBuffer() : r.buffer);
                        for (let i = 0; i < 2; i++) {
                            channels.push(audio.channels[i]);
                            objects.push({ name: t.name + (i ? ' · R' : ' · L'), azimuth: i ? -30 : 30, elevation: Number(d.querySelector(`[data-elevation="${t.id}"]`).value), distance: 1 });
                        }
                    }
                    const { encodeADM } = await import('../modules/audio/authoring.js'), f = new FormData(e.target), result = encodeADM(channels, 48000, objects, { title: f.get('title'), bw64: f.get('container') === 'bw64' });
                    download(result.buffer, project.name + ' — ADM.wav', 'audio/wav');
                    download(result.xml, project.name + ' — ADM.xml', 'application/xml');
                    $('#adm-result').textContent = result.objects + ' objects exported with independent PCM and channel assignments.';
                }
                finally {
                    operation = false;
                    button.disabled = false;
                }
            });
        };
    });
}
async function nativeDialog() {
    let capabilities;
    try {
        const response = await apiFetch('/api/native/plugins');
        if (response.ok)
            capabilities = await response.json();
    }
    catch { }
    const plugins = capabilities?.plugins || [];
    modal('Native plug-in companion', `<p>Offline native processing runs in a separate process in the standalone app. Import the rendered result as a new source with Undo.</p>${plugins.length ? `<label class="field">Configured plug-in<select id="native-plugin">${plugins.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.format.toUpperCase())}</option>`).join('')}</select></label><label class="field">Parameters · id=value, comma separated<input id="native-params" placeholder="0=0.5"></label><div class="dialog-actions"><button class="btn primary" id="native-process">Process selected clip</button></div>` : `<p class="help">Open the standalone version to use installed plug-ins. Its native companions support one mono/stereo bus for Linux CLAP and VST3 effects. AUv2 source is supplied for macOS. Plug-in editor windows, instruments, dynamic bus changes and arbitrary plug-in compatibility have not been qualified.</p><button class="btn" id="native-config">Download plug-in configuration example</button>`}<div id="native-result"></div>`, d => {
        if (!plugins.length) {
            $('#native-config').onclick = () => download(JSON.stringify([{ id: 'my-effect', name: 'My mastering effect', format: 'clap', path: '/absolute/path/to/effect.clap' }], null, 2), 'auralis-plugins.json', 'application/json');
            return;
        }
        $('#native-process').onclick = () => run(async () => {
            editable();
            if (operation)
                throw Error('Audio processing is busy.');
            const c = selected(), a = activeAsset();
            operation = true;
            $('#native-process').disabled = true;
            $('#native-result').textContent = 'Processing in native companion…';
            try {
                const channels = await readAsset(a, Math.round(c.offset * a.sampleRate), Math.round(c.duration * a.sampleRate)), params = $('#native-params').value.split(',').map(x => x.trim()).filter(Boolean), response = await apiFetch('/api/native/render', { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-plugin-id': $('#native-plugin').value, 'x-plugin-parameters': JSON.stringify(params) }, body: encodeWav(channels, a.sampleRate, { bits: 32, float: true }) });
                if (!response.ok)
                    throw Error((await response.json()).error);
                const decoded = decodeWav(await response.arrayBuffer());
                snapshot('Native plug-in render');
                const id = uid(), name = c.name + ' · native';
                engine.addAsset({ ...decoded, id, name });
                project.assets.push({ id, name, sampleRate: decoded.sampleRate, duration: decoded.duration });
                c.assetId = id;
                c.offset = 0;
                c.duration = decoded.duration;
                c.name = name;
                renderLeft();
                fit();
                await analyzeSource();
                d.close();
                toast('Native render applied.');
            }
            finally {
                operation = false;
                $('#native-process') && ($('#native-process').disabled = false);
            }
        });
    });
}
async function diagnosticsDialog(){return qualificationDialog({modal,run,download,offline:async()=>{const context=new OfflineAudioContext(2,48000,48000),osc=context.createOscillator(),gain=context.createGain();osc.frequency.value=997;gain.gain.value=.1;osc.connect(gain).connect(context.destination);osc.start();const buffer=await context.startRendering();const result=await engine.job('analyze',{channels:[buffer.getChannelData(0).slice(),buffer.getChannelData(1).slice()],sampleRate:48000});return {status:result.frames===48000&&Math.abs(result.samplePeak+20)<.02?'passed':'failed',frames:result.frames,sampleRate:result.sampleRate,channels:result.channels,samplePeak:result.samplePeak,rms:result.rms,integrated:result.integrated};}});}


async function nativeResponseError(response){try{return (await response.json()).error||'Native processing requires the configured standalone companion.';}catch{return 'Native processing requires the configured standalone companion.';}}
async function nativeInsertDialog(){const response=await apiFetch('/api/native/plugins');if(!response.ok)throw Error(await nativeResponseError(response));const {plugins}=await response.json();modal('Insert native plug-in',`<div class="insert-picker">${plugins.map(p=>`<button class="btn" data-native-id="${esc(p.id)}">${esc(p.name||p.id)} · ${esc(p.format.toUpperCase())}</button>`).join('')}</div>${plugins.length?'':'<p>No plug-ins configured. Add allowlisted plug-ins to AURALIS_PLUGIN_CONFIG in the standalone companion.</p>'}`,d=>d.querySelectorAll('[data-native-id]').forEach(b=>b.onclick=()=>run(()=>{const plugin=plugins.find(p=>p.id===b.dataset.nativeId),n=createInsert('native',uid());n.params={pluginId:plugin.id,name:plugin.name||plugin.id,parameters:[]};advanced.openInserts.add(n.id);editProject('Add native insert',p=>(p.effects.chain||=legacyChain(p.effects)).push(n));d.close();})));}
async function nativeEditorDialog(id){const n=project.effects.chain?.find(n=>n.id===id);if(!n)throw Error('Insert was removed.');const original=JSON.stringify(n.params),projectIdentity=projectGeneration;const response=await apiFetch('/api/native/editors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pluginId:n.params.pluginId,state:n.params.state})});if(!response.ok)throw Error(await nativeResponseError(response));const session=await response.json();let finished=false;modal('Native editor · '+(n.params.name||n.params.pluginId),`<p>The plug-in editor is open in its desktop window. Save to apply its state to this insert.</p><div id="native-editor-status" role="status"></div><div class="dialog-actions"><button class="btn" id="native-editor-cancel">Cancel edits</button><button class="btn primary" id="native-editor-save">Save editor state</button></div>`,d=>{const cancel=()=>{if(!finished){finished=true;apiFetch('/api/native/editors/'+session.id,{method:'DELETE'}).catch(()=>{});}};d.addEventListener('close',cancel,{once:true});d.querySelector('#native-editor-cancel').onclick=()=>{cancel();d.close();};d.querySelector('#native-editor-save').onclick=()=>run(async()=>{d.querySelector('#native-editor-save').disabled=true;try{const r=await apiFetch('/api/native/editors/'+session.id+'/save',{method:'POST'}),result=await r.json();if(result.status!=='saved')throw Error(result.error||'Native state could not be saved.');if(projectGeneration!==projectIdentity||JSON.stringify(project.effects.chain?.find(x=>x.id===id)?.params)!==original)throw Error('The insert changed while its editor was open. Reopen the editor from the current insert.');finished=true;advanced.changeInsert(id,n=>{n.params.state=result.state;n.params.parameters=[];});d.close();toast('Native editor state saved to the project.');}finally{d.querySelector('#native-editor-save').disabled=false;}});});}
