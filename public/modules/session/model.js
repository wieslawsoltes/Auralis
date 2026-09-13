import {splitSelected} from './montage.js';
import { randomId } from '../audio/ids.js';
import { defaultEffects, clamp } from '../audio/dsp.js';
export const uid = () => randomId();
export function createProject() { return { id: null, name: 'Nocturne · Final masters', sampleRate: 48000, revision: 0, tracks: [{ id: 'track-1', name: 'Stereo master', gain: 0, pan: 0, mute: false, solo: false, color: '#d7ec94' }, { id: 'track-2', name: 'Alternates', gain: 0, pan: 0, mute: false, solo: false, color: '#a49beb' }], clips: [{ id: 'clip-demo', trackId: 'track-1', assetId: 'demo-nocturne', name: 'Nocturne — original mix', start: 0, offset: 0, duration: 48, gain: 0, fadeIn: .25, fadeOut: 2, automation: [] }], markers: [{ id: 'm1', time: 0, name: '01 · Nocturne', color: '#d7ec94' }, { id: 'm2', time: 24, name: 'Second movement', color: '#a49beb' }, { id: 'm3', time: 46, name: 'Tail', color: '#8fcdd8' }], effects: defaultEffects(), assets: [{ id: 'demo-nocturne', name: 'Nocturne — original mix.wav', sampleRate: 32000, duration: 48, demo: true }], metadata: { title: 'Nocturne', artist: '', comment: '' } }; }
export const durationOf = p => Math.max(1, ...p.clips.map(c => c.start + c.duration));
export class History {
    constructor(limit = 40) { this.past = []; this.future = []; this.limit = limit; }
    push(project, label) {
        this.past.push({ state: structuredClone(project), label });
        if (this.past.length > this.limit)
            this.past.shift();
        this.future = [];
    }
    undo(current) {
        const v = this.past.pop();
        if (!v)
            return null;
        this.future.push({ state: structuredClone(current), label: v.label });
        return v;
    }
    redo(current) {
        const v = this.future.pop();
        if (!v)
            return null;
        this.past.push({ state: structuredClone(current), label: v.label });
        return v;
    }
}
export function splitClip(project,id,time){const ids=splitSelected(project,[id],time);if(!ids.length)throw Error('Place the cursor inside the selected clip.');return project.clips.find(c=>c.id===ids[0]);}
export { validateProject } from './validation.js';
