/** Public command catalogue shared by menus, ribbons, search and shortcut preferences. */
const group = (category, rows) => rows.map(([id, label, icon = 'settings', requirement = '', shortcut = '']) => ({ id, label, icon, category, requirement, shortcut }));
export const commands = [
    ...group('Workspace', [['detach-master','Detach master window','grid'],['detach-meters','Detach meters window','grid'],['detach-clips','Detach clips window','grid'],['detach-markers','Detach markers window','grid'],['detach-inspector','Detach inspector window','grid']]),
    ...group('Master', [['insert-rack','Ordered insert rack','settings','edit']]),
    ...group('Spectrum', [['mask-rectangle','Rectangle selection','range','clip'],['mask-polygon','Lasso selection','range','clip'],['mask-brush','Brush selection','spark','clip'],['mask-clear','Clear spectral mask','close'],['mask-undo','Undo mask','undo']]),
    ...group('Edit', [['montage-remove-time','Remove montage time','cut','selection-edit'],['montage-insert-time','Insert montage time','plus','edit']]),
    ...group('File', [['new', 'New session', 'file', '', 'Ctrl+N'], ['projects', 'Open saved project', 'folder', '', 'Ctrl+O'], ['import', 'Import audio', 'folder', 'edit', 'Ctrl+I'], ['save', 'Save', 'save', 'edit', 'Ctrl+S'], ['save-copy', 'Save a copy', 'copy'], ['rename', 'Rename session', 'file', 'edit'], ['import-project', 'Open project file', 'folder'], ['export-project', 'Export project file', 'save'], ['relink', 'Relink missing audio', 'folder', 'edit'], ['metadata', 'Metadata', 'file', 'edit'], ['versions', 'Saved versions', 'history', 'saved']]),
    ...group('Edit', [['undo', 'Undo', 'undo', 'undo', 'Ctrl+Z'], ['redo', 'Redo', 'redo', 'redo', 'Ctrl+Shift+Z'], ['cut', 'Cut', 'cut', 'clip-edit', 'Ctrl+X'], ['copy', 'Copy', 'copy', 'clip', 'Ctrl+C'], ['paste', 'Paste', 'copy', 'paste', 'Ctrl+V'], ['duplicate', 'Duplicate clip', 'copy', 'clip-edit', 'Ctrl+D'], ['delete', 'Delete', 'trash', 'clip-edit', 'Delete'], ['split', 'Split at cursor', 'cut', 'clip-edit', 'S'], ['select-all', 'Select entire clip', 'range', 'clip', 'Ctrl+A'], ['select-none', 'Clear selection', 'range', '', 'Escape'], ['selection-dialog', 'Time selection', 'range', 'clip'], ['clip-properties', 'Clip properties', 'settings', 'clip'], ['history-panel', 'Undo history', 'history']]),
    ...group('View', [['mode-audio', 'Audio Editor', 'wave'], ['mode-montage', 'Audio Montage', 'grid'], ['zoom-in', 'Zoom in', 'zoomIn', 'clip', '+'], ['zoom-out', 'Zoom out', 'zoomOut', 'clip', '-'], ['fit', 'Zoom to full extent', 'fit', '', 'F'], ['zoom-selection', 'Zoom to selection', 'range', 'selection'], ['zoom-sample', 'Zoom to samples', 'zoomIn', 'clip'], ['vertical-up', 'Vertical zoom in', 'zoomIn'], ['vertical-down', 'Vertical zoom out', 'zoomOut'], ['waveform-view', 'Waveform', 'wave', 'clip'], ['spectral-view', 'Spectrogram view', 'spark', 'clip'], ['toggle-follow', 'Follow playback cursor', 'cursor'], ['toggle-snap', 'Snap to markers and clip edges', 'marker'], ['layout', 'Workspace layout', 'grid'], ['command-search', 'Search commands', 'search', '', 'Ctrl+K'], ['preferences', 'Preferences & shortcuts', 'settings']]),
    ...group('Insert', [['add-track', 'Add stereo track', 'plus', 'edit'], ['add-marker', 'Add marker', 'marker', 'edit', 'M'], ['markers-panel', 'Marker list', 'marker'], ['insert-silence', 'Insert silence', 'plus', 'clip-edit'], ['record', 'Record / stop recording', 'record', 'edit'], ['add-to-track', 'Insert source on selected track', 'plus', 'clip-edit']]),
    ...group('Process', [['process-gain', 'Gain', 'settings', 'clip-edit'], ['process-normalize', 'Peak normalize', 'wave', 'clip-edit'], ['process-fadeIn', 'Fade in audio', 'wave', 'clip-edit'], ['process-fadeOut', 'Fade out audio', 'wave', 'clip-edit'], ['process-reverse', 'Reverse', 'undo', 'clip-edit'], ['process-invert', 'Invert polarity', 'wave', 'clip-edit'], ['process-silence', 'Silence selection', 'speaker', 'clip-edit'], ['process-dc', 'Remove DC offset', 'wave', 'clip-edit'], ['process-trim', 'Trim to selection', 'cut', 'selection-edit'], ['process-delete', 'Delete audio selection', 'trash', 'selection-edit'], ['restore-stretch', 'Time stretch', 'range', 'clip-edit'], ['restore-pitch', 'Pitch shift', 'wave', 'clip-edit'], ['native', 'Native plug-in processing', 'settings', 'clip-edit']]),
    ...group('Correction', [['restore-denoise', 'Noise reduction', 'spark', 'clip-edit'], ['capture-noise', 'Capture noise selection', 'range', 'selection'], ['restore-declick', 'Declick', 'spark', 'clip-edit'], ['restore-heal', 'Heal short gap', 'wave', 'selection-edit'], ['restore-repair', 'Spectral interpolation', 'spark', 'selection-edit'], ['restore-correct', 'Correct sustained note', 'wave', 'clip-edit'], ['detect-pitch', 'Pitch detection', 'search', 'clip']]),
    ...group('Spectrum', [['spectral-view', 'Spectrogram view', 'spark', 'clip'], ['spectral-selection', 'Frequency selection', 'range', 'clip'], ['restore-attenuate', 'Attenuate frequencies', 'wave', 'clip-edit'], ['restore-gate', 'Spectral gate', 'spark', 'clip-edit'], ['restore-repair', 'Spectral interpolation', 'spark', 'selection-edit'], ['capture-noise', 'Capture noise selection', 'range', 'selection'], ['restore-denoise', 'Noise reduction', 'spark', 'clip-edit']]),
    ...group('Clip', [['clips-panel', 'Clip list', 'grid'], ['clip-properties', 'Clip properties', 'settings', 'clip'], ['clip-mute', 'Mute selected clip', 'speaker', 'clip-edit'], ['duplicate', 'Duplicate clip', 'copy', 'clip-edit'], ['clip-start', 'Move clip to cursor', 'cursor', 'clip-edit'], ['nudge-left', 'Nudge left', 'back', 'clip-edit'], ['nudge-right', 'Nudge right', 'forward', 'clip-edit'], ['trim-nondestructive', 'Trim clip to selection', 'cut', 'selection-edit'], ['track-properties', 'Track settings', 'settings', 'clip-edit'], ['track-up', 'Move track up', 'back', 'clip-edit'], ['track-down', 'Move track down', 'forward', 'clip-edit'], ['remove-track', 'Remove empty track', 'trash', 'clip-edit']]),
    ...group('Fade', [['fade-panel', 'Fade editor', 'wave', 'clip'], ['clip-fade-in', 'Set fade in', 'wave', 'clip-edit'], ['clip-fade-out', 'Set fade out', 'wave', 'clip-edit'], ['reset-fades', 'Remove fades', 'close', 'clip-edit'], ['crossfade', 'Crossfade adjacent clips', 'wave', 'clip-edit']]),
    ...group('Envelope', [['envelope-panel', 'Volume envelope', 'wave', 'clip'], ['envelope-point', 'Add point at cursor', 'plus', 'clip-edit'], ['envelope-clear', 'Reset envelope', 'trash', 'clip-edit'], ['clip-properties', 'Numeric envelope points', 'settings', 'clip']]),
    ...group('Analyze', [['analysis', 'Global analysis', 'search', 'clip'], ['analyze-master', 'Analyze rendered master', 'spark', 'clip'], ['analyze-selection', 'Analyze selected audio', 'range', 'selection'], ['detect-pitch', 'Pitch detection', 'wave', 'clip'], ['analysis-report', 'Export analysis report', 'render', 'analysis'], ['meters-panel', 'Meters', 'speaker'], ['meter-reset', 'Reset peak hold', 'undo']]),
    ...group('Render', [['render', 'Render WAV', 'render', 'clip'], ['delivery', 'Loudness & true-peak delivery', 'check', 'clip'], ['render-selection', 'Render selection', 'range', 'selection'], ['render-stems', 'Render track stems', 'grid', 'clip'], ['batch', 'Batch processor', 'batch'], ['disc', 'CD / DDP authoring', 'render', 'clip'], ['adm', 'ADM object master', 'grid', 'clip']]),
    ...group('Master', [['bypass', 'Bypass master section', 'power', 'edit'], ['toggle-eq', 'Equalizer on / off', 'power', 'edit'], ['eq-details', 'Equalizer settings', 'wave', 'edit'], ['toggle-compressor', 'Compressor on / off', 'power', 'edit'], ['dynamics-details', 'Compressor settings', 'settings', 'edit'], ['toggle-limiter', 'Limiter on / off', 'power', 'edit'], ['limiter-details', 'Limiter settings', 'settings', 'edit'], ['save-preset', 'Export master preset', 'save'], ['load-preset', 'Import master preset', 'folder', 'edit']]),
    ...group('Transport', [['play', 'Play / pause', 'play', 'clip', 'Space'], ['stop', 'Stop', 'stop', '', 'Enter'], ['play-selection', 'Play selection', 'play', 'selection'], ['play-start', 'Play from start', 'play', 'clip'], ['home', 'Go to beginning', 'back', '', 'Home'], ['end', 'Go to end', 'forward', '', 'End'], ['previous-marker', 'Previous marker', 'back'], ['next-marker', 'Next marker', 'forward'], ['goto', 'Go to time', 'cursor'], ['loop', 'Loop selection', 'loop', '', 'L'], ['monitor', 'Audio output settings', 'headphones']]),
    ...group('Workspace', [['files-panel', 'File browser', 'folder'], ['inspector-panel', 'Inspector', 'settings'], ['tracks-panel', 'Track list', 'grid'], ['markers-panel', 'Markers', 'marker'], ['clips-panel', 'Clips', 'grid'], ['envelope-panel', 'Envelope', 'wave', 'clip'], ['history-panel', 'Undo history', 'history'], ['metadata', 'Metadata', 'file'], ['meters-panel', 'Meters', 'speaker'], ['toggle-left', 'Show / hide left panel', 'grid'], ['toggle-master', 'Show / hide master section', 'grid'], ['toggle-bottom', 'Show / hide tool window', 'grid'], ['layout', 'Workspace layouts', 'grid']]),
    ...group('Collaboration', [['share', 'Invite collaborators', 'share', 'saved'], ['notes-panel', 'Review comments', 'comment'], ['save', 'Save & merge', 'save', 'edit'], ['load-latest', 'Load latest revision', 'history', 'saved'], ['versions', 'Version history', 'history', 'saved'], ['join', 'Join project', 'share'], ['admin', 'Project administration', 'settings', 'owner']]),
    ...group('Help', [['help', 'Keyboard reference', 'info'], ['diagnostics', 'Engine & device diagnostics', 'settings'], ['preferences', 'Preferences & shortcuts', 'settings']])
];
export const commandMap = new Map();
for (const c of commands)
    if (!commandMap.has(c.id))
        commandMap.set(c.id, c);
for (const [id, label, requirement] of [['mute-track', 'Mute track', 'track-edit'], ['solo-track', 'Solo track', 'track-edit'], ['rename-track', 'Rename track', 'track-edit'], ['remove-marker', 'Remove marker', 'edit'], ['restore-version', 'Restore version', 'edit'], ['resolve-comment', 'Resolve comment', 'comment'], ['analyze-clip', 'Analyze clip & true peak', 'clip']])
    commandMap.set(id, { id, label, requirement, category: 'Context', icon: 'settings' });
for (const id of ['track-properties', 'track-up', 'track-down', 'remove-track'])
    commandMap.get(id).requirement = 'track-edit';
commandMap.get('metadata').requirement = '';
export function unavailable(c, s) {
    const r = c?.requirement || '';
    if (c?.id === 'record' && s.recording)
        return '';
    if (c?.id === 'add-track' && s.project.tracks?.length >= 64)
        return 'Maximum 64 tracks.';
    if (c?.id === 'add-marker' && s.project.markers?.length >= 1000)
        return 'Maximum 1000 markers.';
    if (s.busy && !['stop', 'play'].includes(c?.id))
        return 'Wait for the current operation.';
    if ((r === 'edit' || r.includes('edit') || r === 'paste' || r === 'undo' || r === 'redo') && !s.editable)
        return 'Editing requires owner or editor access.';
    if (r === 'comment' && s.role === 'viewer')
        return 'Commenter access is required.';
    if (r.includes('track') && !s.track)
        return 'Select a track.';
    if ((r.includes('clip') || r.includes('selection')) && (!s.clip || !s.asset))
        return 'Select an audio clip.';
    if (r.includes('selection') && !(s.selection[1] > s.selection[0]))
        return 'Select an audio range.';
    if (c?.id === 'split' && s.clip && !(s.project.clips || [s.clip]).some(x => (s.mode !== 'montage' ? x.id === s.clip.id : s.selectedIds?.includes(x.id)) && s.cursor > x.start + .001 && s.cursor < x.start + x.duration - .001))
        return 'Place the cursor inside the clip.';
    if (r === 'paste' && !s.clipboard)
        return 'Copy a clip first.';
    if (r === 'undo' && !s.undo)
        return 'No earlier edit.';
    if (r === 'redo' && !s.redo)
        return 'No edit to redo.';
    if (r === 'saved' && !s.project.id)
        return 'Save the project first.';
    if (r === 'owner' && (!s.project.id || s.role !== 'owner'))
        return 'Saved project owner access is required.';
    if (r === 'analysis' && !s.analysis)
        return 'Analyze audio first.';
    return '';
}
export function formatPosition(seconds, format = 'time', rate = 48000) {
    if (format === 'samples')
        return String(Math.round(seconds * rate));
    if (format === 'seconds')
        return seconds.toFixed(3);
    const ms = Math.max(0, Math.round(seconds * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`;
}
export function parsePosition(value, format = 'time', rate = 48000) {
    const s = String(value).trim();
    let n;
    if (format === 'samples') {
        if (!/^\d+$/.test(s))
            throw Error('Enter a whole sample position.');
        n = Number(s) / rate;
    }
    else if (s.includes(':')) {
        const p = s.split(':');
        if (p.length > 3 || p.some(x => !/^\d+(\.\d+)?$/.test(x)) || p.slice(1).some(x => Number(x) >= 60))
            throw Error('Use hours:minutes:seconds.milliseconds.');
        n = p.reduce((a, b) => a * 60 + Number(b), 0);
    }
    else
        n = Number(s);
    if (!s || !Number.isFinite(n) || n < 0 || n > 86400)
        throw Error('Time must be between 0 and 24 hours.');
    return n;
}
export function snapTime(value, points, threshold, enabled = true) { if (!enabled)
    return value; let best = value, d = threshold; for (const point of points) {
    const delta = Math.abs(point - value);
    if (delta < d) {
        d = delta;
        best = point;
    }
} return best; }
