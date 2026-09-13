import { commands, commandMap, unavailable, formatPosition } from './commands.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const defaults = { left: 224, right: 276, bottom: 206, showLeft: true, showMaster: true, showBottom: true, ribbon: 'Edit', bottomTab: 'meters', format: 'time', snap: true, follow: true, amplitude: 1, nudge: .01, theme: 'dark', floating: false, toolX: 300, toolY: 360, shortcuts: {} };
export class WorkstationUI {
    constructor(api) { this.api = api; this.hiddenDocs = new Set(); this.peakHold = [-Infinity, -Infinity]; try {
        this.prefs = { ...defaults, ...JSON.parse(localStorage.getItem('auralis.workspace.v3') || '{}') };
    }
    catch {
        this.prefs = { ...defaults };
    } this.prefs.shortcuts = this.prefs.shortcuts && typeof this.prefs.shortcuts === 'object' ? this.prefs.shortcuts : {}; for (const k of ['left', 'right', 'bottom', 'amplitude', 'nudge'])
        if (!Number.isFinite(this.prefs[k]))
            this.prefs[k] = defaults[k]; if (!['time', 'samples', 'seconds'].includes(this.prefs.format))
        this.prefs.format = 'time'; if (innerWidth <= 680)
        this.prefs.showLeft = false; this.mount(); }
    save() { try {
        localStorage.setItem('auralis.workspace.v3', JSON.stringify(this.prefs));
    }
    catch { } }
    command(id, large = false) { const c = commandMap.get(id); if (!c)
        return ''; const why = unavailable(c, this.api.state()); return `<button class="ribbon-command ${large ? 'large' : ''}" data-action="${id}" title="${E(why || c.label + (c.shortcut ? ' · ' + c.shortcut : ''))}" ${why ? 'disabled' : ''}>${this.api.icon(c.icon)}<span>${E(c.label)}</span></button>`; }
    mount() {
        const icon = this.api.icon;
        $('.topbar').innerHTML = `<div class="brand"><img src="../favicon.svg" alt=""><span>Auralis <b>Pro</b></span></div><nav class="desktop-menu" aria-label="Main menu">${['File', 'Edit', 'View', 'Insert', 'Process', 'Master', 'Transport', 'Workspace', 'Collaboration', 'Help'].map(n => `<button data-ui="menu" data-menu="${n}" aria-haspopup="menu" aria-expanded="false">${n}</button>`).join('')}</nav><button class="command-launch" data-action="command-search">${icon('search')}<span>Search commands</span><kbd>Ctrl K</kbd></button>`;
        const previous = $('.workspace-tabs');
        previous.innerHTML = `<div role="tablist" aria-label="Editing environment"><button role="tab" data-action="mode-audio">${icon('wave')} Audio Editor</button><button role="tab" data-action="mode-montage">${icon('grid')} Audio Montage</button><button data-action="batch">${icon('batch')} Batch Processor</button></div><span class="spacer"></span><button data-action="layout">${icon('grid')} Workspace</button><button data-action="share">${icon('share')} Collaborate</button><button class="render-accent" data-action="render">${icon('render')} Render</button>`;
        const projectbar = $('.projectbar');
        projectbar.replaceWith(previous);
        const ribbon = document.createElement('section');
        ribbon.className = 'command-ribbon';
        ribbon.innerHTML = '<nav class="ribbon-tabs" role="tablist" aria-label="Command ribbon"></nav><div class="ribbon-content" role="tabpanel"></div>';
        previous.after(ribbon);
        const docs = document.createElement('div');
        docs.className = 'document-tabs';
        docs.setAttribute('aria-label', 'Open documents');
        $('.center').prepend(docs);
        const title = $('.canvas-title');
        title.innerHTML = `<span id="clip-title"></span><span id="clip-spec" class="file-spec"></span><button class="icon-btn" data-action="clip-properties" title="Clip inspector">${icon('settings')}</button>`;
        $('.edit-toolbar').innerHTML = `<button class="icon-btn tool" data-action="tool-cursor" title="Move and trim clips">${icon('cursor')}</button><button class="icon-btn tool" data-action="tool-range" title="Select time range">${icon('range')}</button><button class="small-toggle" data-action="toggle-snap">${icon('marker')} Snap</button><span class="separator"></span><button class="small-toggle" data-action="waveform-view">Waveform</button><button class="small-toggle" data-action="spectral-view">Spectrogram</button><span class="spacer"></span><button class="icon-btn" data-action="zoom-out" title="Zoom out">${icon('zoomOut')}</button><button class="icon-btn track-scroll" data-action="scroll-tracks-up" title="Scroll tracks up">↑</button><button class="icon-btn track-scroll" data-action="scroll-tracks-down" title="Scroll tracks down">↓</button><span id="zoom-label"></span><button class="icon-btn" data-action="zoom-in" title="Zoom in">${icon('zoomIn')}</button><button class="icon-btn" data-action="fit" title="Full extent">${icon('fit')}</button>`;
        title.after($('.overview'));
        $('.overview').removeAttribute('data-action');
        $('.overview').title = 'Drag to scroll the visible range';
        $('.wave-footer').innerHTML = `<button data-action="selection-dialog" title="Edit exact selection"><span>START</span> <b id="sel-start"></b></button><button data-action="selection-dialog"><span>END</span> <b id="sel-end"></b></button><button data-action="selection-dialog"><span>LENGTH</span> <b id="sel-length"></b></button><span class="spacer"></span><span id="amplitude-label">1.0×</span><button class="icon-btn" data-action="vertical-down" title="Decrease amplitude zoom">−</button><button class="icon-btn" data-action="vertical-up" title="Increase amplitude zoom">+</button>`;
        const dock = document.createElement('section');
        dock.className = 'tool-dock';
        dock.innerHTML = '<div class="resize-bar horizontal" data-resize="bottom" role="separator" tabindex="0" aria-label="Resize tool window" aria-orientation="horizontal"></div><nav class="dock-tabs" role="tablist" aria-label="Tool windows"></nav><div class="dock-pages"><div class="dock-page" data-page="meters"></div><div class="dock-page" data-page="dynamic"></div></div>';
        $('.center').append(dock);
        dock.querySelector('[data-page="meters"]').append($('.analysis-area'));
        $('.analysis-area').insertAdjacentHTML('beforeend', `<div class="analyzer phase-panel"><div class="analyzer-head">Phasescope <span id="phase-scope-label">SOURCE</span></div><canvas id="phase-scope" aria-label="Stereo phase scope"></canvas></div>`);
        $('.transport').insertAdjacentHTML('afterbegin', `<button class="icon-btn" data-action="previous-marker" title="Previous marker">${icon('back')}</button>`);
        $('.transport-controls').insertAdjacentHTML('beforeend', `<button class="icon-btn" data-action="play-selection" title="Play selection">${icon('range')}</button>`);
        $('.time-display').setAttribute('data-action', 'goto');
        $('.time-display').setAttribute('role', 'button');
        $('.time-display').tabIndex = 0;
        $('.time-display').title = 'Go to time';
        $('.transport-end').insertAdjacentHTML('beforeend', `<select id="time-format" aria-label="Time display format"><option value="time">Timecode</option><option value="seconds">Seconds</option><option value="samples">Samples</option></select>`);
        $('.statusbar').innerHTML = `<span class="ready" id="engine-status">Ready</span><span id="renderer-status">Canvas 2D</span><span id="status-project">Unsaved project</span><span id="save-state"></span><span id="presence"></span><span class="status-right" id="status-detail">Auralis Studio 0.3</span>`;
        for (const [side, anchor] of [['left', $('#left-panel')], ['right', $('#right-panel')]]) {
            const bar = document.createElement('div');
            bar.className = 'resize-bar vertical ' + side;
            bar.dataset.resize = side;
            bar.tabIndex = 0;
            bar.setAttribute('role', 'separator');
            bar.setAttribute('aria-label', 'Resize ' + side + ' panel');
            bar.setAttribute('aria-orientation', 'vertical');
            side === 'left' ? anchor.after(bar) : anchor.before(bar);
        }
        const menu = document.createElement('div');
        menu.id = 'desktop-popup';
        menu.className = 'desktop-popup';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        document.body.append(menu);
        document.addEventListener('click', e => { const b = e.target.closest('[data-ui]'); if (b) {
            e.preventDefault();
            this.event(b);
        }
        else
            this.closeMenu(); });
        document.addEventListener('keydown', e => this.keydown(e));
        document.addEventListener('pointerdown', e => { const bar = e.target.closest('[data-resize]'); if (bar)
            this.resize(e, bar);
        else if (this.prefs.floating && e.target.closest('.dock-tabs') && !e.target.closest('button')) {
            e.preventDefault();
            const header = e.target.closest('.dock-tabs'), x = e.clientX, y = e.clientY, sx = this.prefs.toolX || 300, sy = this.prefs.toolY || 360;
            header.setPointerCapture(e.pointerId);
            header.onpointermove = ev => { this.prefs.toolX = sx + ev.clientX - x; this.prefs.toolY = sy + ev.clientY - y; this.applyLayout(); };
            header.onpointerup = () => { header.onpointermove = null; this.save(); };
        } });
        document.addEventListener('change', e => { if (e.target.id === 'time-format') {
            this.prefs.format = e.target.value;
            this.save();
            this.api.refresh();
        } });
        this.applyLayout();
        this.renderRibbon();
        this.renderDock();
        this.update();
    }
    closeMenu() { const el = $('#desktop-popup'); if (el)
        el.hidden = true; $$('[data-menu]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
    openMenu(name, anchor, ids) { this.menuAnchor = anchor; const popup = $('#desktop-popup'), s = this.api.state(); popup.innerHTML = (ids ? ids.map(id => commandMap.get(id)) : commands.filter(c => c.category === name)).filter(Boolean).map(c => { const why = unavailable(c, s); return `<button role="menuitem" data-action="${c.id}" ${why ? 'disabled' : ''} title="${E(why || c.label)}">${this.api.icon(c.icon)}<span>${E(c.label)}</span><kbd>${E(this.prefs.shortcuts[c.id] || c.shortcut)}</kbd></button>`; }).join(''); popup.hidden = false; const r = anchor.getBoundingClientRect(); popup.style.left = Math.max(4, Math.min(r.left, innerWidth - 310)) + 'px'; popup.style.top = Math.min(r.bottom, innerHeight - popup.offsetHeight - 8) + 'px'; anchor.setAttribute?.('aria-expanded', 'true'); popup.querySelector('button:not(:disabled)')?.focus(); }
    event(b) { const act = b.dataset.ui; if (act === 'float-dock') {
        this.prefs.floating = !this.prefs.floating;
        this.applyLayout();
        this.save();
        this.renderDock();
        return;
    } if (act === 'menu') {
        this.openMenu(b.dataset.menu, b);
        return;
    } if (act === 'ribbon') {
        this.prefs.ribbon = b.dataset.tab;
        this.renderRibbon();
        this.save();
    } if (act === 'dock') {
        this.prefs.bottomTab = b.dataset.tab;
        this.prefs.showBottom = true;
        this.applyLayout();
        this.renderDock();
        this.save();
    } if (act === 'doc') {
        this.api.selectClip(b.dataset.id);
        this.update();
    } if (act === 'close-doc') {
        this.hiddenDocs.add(b.dataset.id);
        if (this.api.state().clip?.id === b.dataset.id)
            this.api.dispatch('mode-montage');
        this.update();
    } if (act === 'layout-preset') {
        const p = b.dataset.preset;
        Object.assign(this.prefs, { showLeft: true, showMaster: true, showBottom: true, left: 224, right: 276, bottom: 206, floating: false });
        if (p === 'editing') {
            this.prefs.showMaster = false;
            this.prefs.bottomTab = 'markers';
        }
        if (p === 'mastering') {
            this.prefs.showLeft = false;
            this.prefs.bottomTab = 'meters';
        }
        if (p === 'montage') {
            this.api.dispatch('mode-montage');
            this.prefs.bottomTab = 'clips';
        }
        if (p === 'restoration') {
            this.prefs.showMaster = false;
            this.prefs.ribbon = 'Spectrum';
            this.api.dispatch('spectral-view');
        }
        this.applyLayout();
        this.renderRibbon();
        this.renderDock();
        this.save();
        $('#dialog').close();
    } if (act === 'select-row') {
        this.api.selectClip(b.dataset.id);
        this.api.refresh();
    } if (act === 'edit-marker')
        this.api.markerDialog(b.dataset.id); if (act === 'history-jump')
        this.api.historyJump(Number(b.dataset.count)); if (act === 'envelope-remove')
        this.api.removeEnvelopePoint(Number(b.dataset.index)); }
    renderRibbon() {
        const s = this.api.state(), tabs = s.mode === 'montage' ? ['View', 'Edit', 'Insert', 'Process', 'Clip', 'Fade', 'Envelope', 'Analyze', 'Render'] : ['View', 'Edit', 'Insert', 'Process', 'Correction', 'Spectrum', 'Analyze', 'Render'];
        if (!tabs.includes(this.prefs.ribbon))
            this.prefs.ribbon = 'Edit';
        $('.ribbon-tabs').innerHTML = tabs.map(t => `<button data-ui="ribbon" data-tab="${t}" role="tab" tabindex="${this.prefs.ribbon === t ? 0 : -1}" aria-selected="${this.prefs.ribbon === t}" class="${this.prefs.ribbon === t ? 'active' : ''}">${t}</button>`).join('') + `<span class="spacer"></span><button data-action="command-search" title="Find any command">${this.api.icon('search')}</button>`;
        const groups = { View: [['Navigation', ['fit', 'zoom-selection', 'zoom-sample']], ['Amplitude', ['vertical-up', 'vertical-down']], ['Display', ['waveform-view', 'spectral-view', 'toggle-follow']], ['Tool windows', ['files-panel', 'inspector-panel', 'meters-panel']], ['Workspace', ['layout', 'preferences']]], Edit: [['Clipboard', ['cut', 'copy', 'paste']], ['History', ['undo', 'redo', 'history-panel']], ['Selection', ['select-all', 'select-none', 'selection-dialog']], ['Editing', ['split', 'delete', 'duplicate']], ['Clip', ['clip-properties', 'trim-nondestructive']]], Insert: [['Audio', ['import', 'record', 'insert-silence']], ['Montage', ['add-track', 'add-to-track']], ['Markers', ['add-marker', 'markers-panel']], ['Project', ['metadata', 'notes-panel']]], Process: [['Level', ['process-gain', 'process-normalize', 'process-dc']], ['Time & pitch', ['restore-stretch', 'restore-pitch']], ['Audio', ['process-reverse', 'process-invert', 'process-silence']], ['Selection', ['process-trim', 'process-delete']], ['External processing', ['native']]], Correction: [['Noise', ['capture-noise', 'restore-denoise']], ['Repair', ['restore-declick', 'restore-heal', 'restore-repair']], ['Pitch', ['detect-pitch', 'restore-correct']], ['View', ['spectral-view']]], Spectrum: [['Display', ['spectral-view', 'waveform-view', 'spectral-selection']], ['Spectral processing', ['restore-attenuate', 'restore-gate', 'restore-repair']], ['Noise profile', ['capture-noise', 'restore-denoise']]], Clip: [['Clip', ['clips-panel', 'clip-properties', 'clip-mute']], ['Placement', ['clip-start', 'nudge-left', 'nudge-right']], ['Editing', ['duplicate', 'split', 'trim-nondestructive']], ['Track', ['track-properties', 'track-up', 'track-down', 'remove-track']]], Fade: [['Fade editor', ['fade-panel']], ['Nondestructive fades', ['clip-fade-in', 'clip-fade-out', 'reset-fades']], ['Transitions', ['crossfade']], ['Process audio', ['process-fadeIn', 'process-fadeOut']]], Envelope: [['Volume envelope', ['envelope-panel', 'envelope-point', 'envelope-clear']], ['Precision', ['clip-properties']]], Analyze: [['Measurement', ['analysis', 'analyze-master', 'analyze-selection']], ['Pitch', ['detect-pitch']], ['Meters', ['meters-panel', 'meter-reset']], ['Reports', ['analysis-report']]], Render: [['Audio output', ['render', 'render-selection', 'render-stems']], ['Delivery', ['delivery', 'batch']], ['Authoring', ['disc', 'adm']], ['Session', ['save', 'export-project']]] };
        $('.ribbon-content').innerHTML = (groups[this.prefs.ribbon] || []).map(([name, ids]) => `<section class="ribbon-group"><div class="ribbon-group-controls">${ids.map((id, i) => this.command(id, ids.length === 1 || i === 0 && ['Clipboard', 'Audio output', 'Measurement', 'Spectral processing'].includes(name))).join('')}</div><div class="ribbon-group-label">${name}</div></section>`).join('');
        this.lastMode = s.mode;
    }
    update() {
        const s = this.api.state();
        if (!$('.document-tabs'))
            return;
        $$('.workspace-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.action === 'mode-' + s.mode)));
        if (this.lastMode !== s.mode)
            this.renderRibbon();
        $('.document-tabs').innerHTML = `<button class="document-tab ${s.mode === 'montage' ? 'active' : ''}" data-action="mode-montage">${this.api.icon('grid')}<span>${E(s.project.name)}</span></button>` + s.project.clips.filter(c => !this.hiddenDocs.has(c.id)).map(c => `<div class="document-tab ${c.id === s.clip?.id && s.mode === 'audio' ? 'active' : ''}"><button data-ui="doc" data-id="${E(c.id)}">${this.api.icon('wave')}<span>${E(c.name)}</span></button><button data-ui="close-doc" data-id="${E(c.id)}" title="Close document tab; retain clip in project">×</button></div>`).join('') + `<button class="document-add" data-action="import" title="Open audio">+</button>`;
        $$('[data-action]').forEach(b => { const c = commandMap.get(b.dataset.action); if (c) {
            const why = unavailable(c, s);
            b.disabled = !!why;
            b.setAttribute('aria-label', c.label);
            if (why)
                b.title = why;
            else
                b.title = c.label + (c.shortcut ? ' · ' + c.shortcut : '');
        } });
        $$('audio-knob').forEach(k => k.disabled = !s.editable || s.busy);
        $$('input[data-effect],input[data-track-gain]').forEach(k => k.disabled = !s.editable || s.busy);
        $$('[data-action="toggle-snap"]').forEach(b => b.classList.toggle('active', this.prefs.snap));
        $$('[data-action="toggle-follow"]').forEach(b => b.classList.toggle('active', this.prefs.follow));
        $$('[data-action="waveform-view"]').forEach(b => b.classList.toggle('active', !s.spectral));
        $$('[data-action="spectral-view"]').forEach(b => b.classList.toggle('active', s.spectral));
        $$('.track-scroll').forEach(b => b.hidden = s.mode !== 'montage');
        $('#amplitude-label').textContent = this.prefs.amplitude.toFixed(1) + '×';
        $('#time-format').value = this.prefs.format;
        const rate = s.mode === 'audio' ? (s.asset?.sampleRate || s.project.sampleRate) : s.project.sampleRate;
        for (const [id, v] of [['sel-start', s.selection[0]], ['sel-end', s.selection[1]], ['sel-length', s.selection[1] - s.selection[0]]])
            $('#' + id).textContent = formatPosition(v, this.prefs.format, rate);
        if (!$('.dock-pages').contains(document.activeElement))
            this.renderDynamic();
        $$('.dock-form input,.dock-form button[type=submit],#fades-form button,#metadata-form button').forEach(el => el.disabled = !s.editable || s.busy);
    }
    applyLayout() { const p = this.prefs, root = $('.app-shell'); for (const k of ['left', 'right', 'bottom'])
        root.style.setProperty('--' + k + '-size', Math.max(k === 'bottom' ? 130 : 180, Math.min(k === 'bottom' ? 400 : 460, Number(p[k]) || defaults[k])) + 'px'); root.classList.toggle('hide-left', !p.showLeft); root.classList.toggle('hide-master', !p.showMaster); root.classList.toggle('hide-bottom', !p.showBottom); root.classList.toggle('floating-tools', !!p.floating); root.style.setProperty('--tool-x', Math.max(0, Math.min(innerWidth - 300, p.toolX || 300)) + 'px'); root.style.setProperty('--tool-y', Math.max(35, Math.min(innerHeight - 180, p.toolY || 360)) + 'px'); document.documentElement.dataset.theme = p.theme; this.api.resize?.(); }
    resize(e, bar) { if (e.button !== 0)
        return; e.preventDefault(); const key = bar.dataset.resize, start = key === 'bottom' ? e.clientY : e.clientX, initial = this.prefs[key]; bar.setPointerCapture(e.pointerId); bar.onpointermove = ev => { const delta = (key === 'bottom' ? ev.clientY : ev.clientX) - start; this.prefs[key] = Math.max(key === 'bottom' ? 130 : 180, Math.min(key === 'bottom' ? 400 : 460, initial + delta * (key === 'left' ? 1 : -1))); this.applyLayout(); }; bar.onpointerup = () => { bar.onpointermove = null; bar.onpointerup = null; this.save(); this.api.refresh(); }; bar.onpointercancel = () => { bar.onpointermove = null; this.save(); }; }
    renderDock() { const tabs = [['meters', 'Meters'], ['markers', 'Markers'], ['clips', 'Clips'], ['fades', 'Fades'], ['envelope', 'Envelope'], ['history', 'Undo history'], ['metadata', 'Metadata'], ['delivery', 'Delivery'], ['collaboration', 'Collaboration']]; $('.dock-tabs').innerHTML = tabs.map(([id, label]) => `<button role="tab" tabindex="${this.prefs.bottomTab === id ? 0 : -1}" data-ui="dock" data-tab="${id}" aria-selected="${this.prefs.bottomTab === id}" class="${this.prefs.bottomTab === id ? 'active' : ''}">${label}</button>`).join('') + '<span class="spacer"></span><button data-ui="float-dock" title="Float or dock tool window" aria-label="Float or dock tool window">▣</button><button data-action="toggle-bottom" title="Hide tool window">×</button>'; $('.dock-page[data-page="meters"]').hidden = this.prefs.bottomTab !== 'meters'; $('.dock-page[data-page="dynamic"]').hidden = this.prefs.bottomTab === 'meters'; this.renderDynamic(); if (this.prefs.bottomTab === 'meters')
        this.api.redrawMeters?.(); }
    renderDynamic() {
        const el = $('.dock-page[data-page="dynamic"]'), s = this.api.state(), p = s.project, c = s.clip, t = this.prefs.bottomTab;
        if (!el || t === 'meters')
            return;
        const key = JSON.stringify([t, p.markers, p.clips, p.tracks, p.metadata, s.undo, s.redo, s.clip?.id, s.project.revision, s.role, s.comments, s.analysis, s.busy, s.editable, s.selection, this.prefs.format, s.history.map(h => h.label)]);
        if (key === this.dynamicKey)
            return;
        this.dynamicKey = key;
        if (t === 'markers')
            el.innerHTML = `<div class="dock-toolbar">${this.command('add-marker')}${this.command('previous-marker')}${this.command('next-marker')}<span class="spacer"></span><span>${p.markers.length} markers</span></div><div class="table-scroll"><table><thead><tr><th>#</th><th>Name</th><th>Position</th><th>Color</th><th></th></tr></thead><tbody>${p.markers.map((m, i) => `<tr><td>${i + 1}</td><td><button data-ui="edit-marker" data-id="${E(m.id)}">${E(m.name)}</button></td><td><button data-action="seek-marker" data-id="${E(m.id)}">${formatPosition(m.time)}</button></td><td><span class="color-swatch" style="background:${m.color}"></span></td><td><button data-ui="edit-marker" data-id="${E(m.id)}">Edit</button><button data-action="remove-marker" data-id="${E(m.id)}" title="Remove marker">×</button></td></tr>`).join('')}</tbody></table>${!p.markers.length ? '<p class="empty">Add a marker at the edit cursor.</p>' : ''}</div>`;
        else if (t === 'clips')
            el.innerHTML = `<div class="dock-toolbar">${this.command('clip-properties')}${this.command('duplicate')}${this.command('clip-mute')}<span class="spacer"></span>${p.clips.length} clips</div><div class="table-scroll"><table><thead><tr><th>Clip</th><th>Track</th><th>Start</th><th>Length</th><th>Gain</th><th>State</th></tr></thead><tbody>${p.clips.map(v => `<tr class="${c?.id === v.id ? 'selected' : ''}"><td><button data-ui="select-row" data-id="${E(v.id)}">${E(v.name)}</button></td><td>${E(p.tracks.find(t => t.id === v.trackId)?.name)}</td><td>${formatPosition(v.start)}</td><td>${formatPosition(v.duration)}</td><td>${v.gain.toFixed(1)} dB</td><td>${v.mute ? 'Muted' : 'Active'}</td></tr>`).join('')}</tbody></table></div>`;
        else if (t === 'history')
            el.innerHTML = `<div class="dock-toolbar">${this.command('undo')}${this.command('redo')}<span class="spacer"></span>Current session · ${s.undo} undo steps</div><div class="history-list">${s.history.map((h, i) => `<button data-ui="history-jump" data-count="${s.history.length - i}"><span>${i + 1}</span>${E(h.label)}<small>Undo to before this change</small></button>`).reverse().join('') || '<p class="empty">Edits appear here. Original audio is retained.</p>'}</div>`;
        else if (t === 'metadata')
            el.innerHTML = `<form id="metadata-form" class="dock-form"><label>Title<input name="title" value="${E(p.metadata?.title || '')}" maxlength="4000"></label><label>Artist<input name="artist" value="${E(p.metadata?.artist || '')}" maxlength="4000"></label><label class="grow">Comment<input name="comment" value="${E(p.metadata?.comment || '')}" maxlength="4000"></label><button class="btn primary" type="submit" ${s.editable ? '' : 'disabled'}>Apply metadata</button></form>`;
        else if (t === 'delivery')
            el.innerHTML = `<div class="delivery-choices">${['render', 'render-selection', 'render-stems', 'delivery', 'batch', 'disc', 'adm'].map(id => this.command(id, true)).join('')}</div><p class="dock-note">Render through the master section. Delivery verifies the encoded WAV against loudness and true-peak targets.</p>`;
        else if (t === 'collaboration')
            el.innerHTML = `<div class="dock-toolbar">${['share', 'notes-panel', 'versions', 'admin', 'save', 'load-latest'].map(id => this.command(id)).join('')}</div><div class="collab-status"><strong>${p.id ? 'Revision ' + p.revision + ' · ' + s.role : 'Local unsaved session'}</strong><p>${p.id ? 'Independent edits merge on save. Overlapping changes open a review before committing.' : 'Save this session to enable invitations, comments and version history.'}</p></div>`;
        else if (t === 'fades')
            el.innerHTML = c ? `<div class="dock-toolbar">${['clip-fade-in', 'clip-fade-out', 'crossfade', 'reset-fades'].map(id => this.command(id)).join('')}</div><form id="fades-form" data-clip-id="${E(c.id)}" class="dock-form"><label>Fade in (seconds)<input name="fadeIn" type="number" min="0" max="${c.duration}" step=".001" value="${c.fadeIn}"></label><div class="fade-preview"><svg viewBox="0 0 320 70"><path d="M5 60 L${5 + Math.min(.45, c.fadeIn / c.duration) * 310} 10 H${315 - Math.min(.45, c.fadeOut / c.duration) * 310} L315 60"/></svg></div><label>Fade out (seconds)<input name="fadeOut" type="number" min="0" max="${c.duration}" step=".001" value="${c.fadeOut}"></label><button class="btn primary" ${s.editable ? '' : 'disabled'}>Apply fades</button></form><p class="dock-note">Linear nondestructive clip fades · ${E(c.name)}</p>` : '<p class="empty">Select a clip to edit its fades.</p>';
        else if (t === 'envelope')
            el.innerHTML = c ? `<div class="dock-toolbar">${['envelope-point', 'envelope-clear', 'clip-properties'].map(id => this.command(id)).join('')}<span class="spacer"></span>Click to add · drag to move · right-click to remove</div><canvas id="envelope-canvas" aria-label="Clip volume envelope. Use Add point and Numeric envelope points for keyboard editing."></canvas>` : '<p class="empty">Select a clip to edit its volume envelope.</p>';
        if (t === 'envelope' && c)
            this.api.bindEnvelope($('#envelope-canvas'));
    }
    showDock(tab) { this.prefs.bottomTab = tab; this.prefs.showBottom = true; this.dynamicKey = ''; this.applyLayout(); this.renderDock(); this.save(); }
    layoutDialog() { this.api.modal('Workspace layouts', `<div class="layout-options">${[['editing', 'Audio editing'], ['mastering', 'Mastering'], ['montage', 'Audio montage'], ['restoration', 'Spectral restoration']].map(([id, label]) => `<button class="layout-card" data-ui="layout-preset" data-preset="${id}"><span class="layout-diagram ${id}"><i></i><i></i><i></i></span>${label}</button>`).join('')}</div><p class="help">Drag the panel dividers to resize your workspace. Layout, visibility, time format and keyboard preferences are remembered on this device.</p><div class="form-grid">${['toggle-left', 'toggle-master', 'toggle-bottom'].map(id => this.command(id)).join('')}</div>`); }
    search() { this.api.modal('Search commands', `<input id="command-query" class="command-query" aria-label="Search commands" placeholder="Type a command, tool or workflow…" autocomplete="off"><div id="command-results" role="list"></div>`, d => { const input = d.querySelector('input'); const render = () => { const q = input.value.toLowerCase().trim(), seen = new Set(), found = commands.filter(c => { if (seen.has(c.id))
        return false; seen.add(c.id); return (c.label + ' ' + c.category + ' ' + c.id).toLowerCase().includes(q); }); $('#command-results').innerHTML = found.slice(0, 80).map(c => { const why = unavailable(c, this.api.state()); return `<button data-action="${c.id}" class="search-result" ${why ? 'disabled' : ''} title="${E(why)}">${this.api.icon(c.icon)}<span>${E(c.label)}<small>${E(c.category)}${why ? ' · ' + E(why) : ''}</small></span><kbd>${E(this.prefs.shortcuts[c.id] || c.shortcut)}</kbd></button>`; }).join('') || '<p class="empty">No matching commands.</p>'; }; input.oninput = render; input.onkeydown = e => { if (e.key === 'ArrowDown') {
        $('#command-results button:not(:disabled)')?.focus();
        e.preventDefault();
    } if (e.key === 'Enter') {
        $('#command-results button:not(:disabled)')?.click();
        e.preventDefault();
    } }; render(); requestAnimationFrame(() => input.focus()); }); }
    keydown(e) {
        if (e.defaultPrevented)
            return;
        const tab = e.target.closest?.('[role=tab]');
        if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            const list = tab.closest('[role=tablist]'), items = [...list.querySelectorAll('[role=tab]')], i = items.indexOf(tab), next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length, id = items[next].dataset.tab, act = items[next].dataset.action;
            items[next].click();
            queueMicrotask(() => { const selector = id ? '[data-tab="' + id + '"]' : '[data-action="' + act + '"]'; document.querySelector(selector)?.focus(); });
            return;
        }
        const bar = e.target.closest?.('[data-resize]');
        if (bar && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            const sign = (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1) * (bar.dataset.resize === 'right' ? -1 : 1);
            this.prefs[bar.dataset.resize] += sign * 12;
            this.applyLayout();
            this.save();
            return;
        }
        const popup = $('#desktop-popup');
        if (!popup?.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(e.key)) {
            e.preventDefault();
            if (e.key === 'Escape') {
                this.closeMenu();
                this.menuAnchor?.focus();
                return;
            }
            const items = [...popup.querySelectorAll('button:not(:disabled)')], i = items.indexOf(document.activeElement), n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[n]?.focus();
        }
    }
}
