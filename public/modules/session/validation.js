import {validateChain} from '../audio/chain-config.js';
/** Shared validation for untrusted project files and API requests. */
export function validateProject(p) {
    const bad = s => { throw Error(s); };
    const finite = (x, a, b) => typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b;
    const text = (x, n) => typeof x === 'string' && x.length > 0 && x.length <= n;
    const ids = (arr, label) => {
        const seen = new Set();
        for (const x of arr) {
            if (!x || !text(x.id, 100) || !/^[\w-]+$/.test(x.id) || seen.has(x.id))
                bad('Invalid or duplicate ' + label + ' id.');
            seen.add(x.id);
        }
    };
    if (!p || !text(p.name, 120) || !p.name.trim() || ![44100, 48000, 96000].includes(p.sampleRate))
        bad('Invalid project name or sample rate.');
    for (const [key, max] of [['tracks', 64], ['clips', 2000], ['assets', 200], ['markers', 1000]]) {
        if (!Array.isArray(p[key]) || p[key].length > max)
            bad('Invalid ' + key + ' list.');
        ids(p[key], key);
    }
    for (const t of p.tracks) {
        if (!text(t.name, 120) || !finite(t.gain, -96, 24) || !finite(t.pan, -1, 1) || typeof t.mute !== 'boolean' || typeof t.solo !== 'boolean' || !/^#[a-f0-9]{6}$/i.test(t.color))
            bad('Invalid track.');
    }
    for (const a of p.assets) {
        if (!text(a.name, 240) || !finite(a.duration, .000001, 86400) || !Number.isInteger(a.sampleRate) || !finite(a.sampleRate, 8000, 384000))
            bad('Invalid audio source.');
        if (a.demo && (a.id !== 'demo-nocturne' || a.duration !== 48 || a.sampleRate !== 32000))
            bad('Unknown sample audio.');
    }
    for (const c of p.clips) {
        const a = p.assets.find(a => a.id === c.assetId);
        if (!text(c.name, 240) || !p.tracks.some(t => t.id === c.trackId) || !a)
            bad('Invalid clip source or track.');
        for (const k of ['start', 'offset', 'duration', 'fadeIn', 'fadeOut'])
            if (!finite(c[k], 0, 86400))
                bad('Invalid clip ' + k);
        if (!c.duration || c.start + c.duration > 86400.000001 || c.offset + c.duration > a.duration + .0001 || c.fadeIn > c.duration || c.fadeOut > c.duration || !finite(c.gain, -96, 24))
            bad('Clip exceeds supported bounds.');
        if(c.fadeSource){const f=c.fadeSource;if(!finite(f.offset,0,86400)||!finite(f.duration,.000001,86400)||!finite(f.fadeIn,0,f.duration)||!finite(f.fadeOut,0,f.duration)||f.offset+c.duration>f.duration+.0001)bad('Invalid source fade envelope.');}
        if (c.automation) {
            if (!Array.isArray(c.automation) || c.automation.length > 128)
                bad('Invalid automation.');
            let last = -1;
            for (const a of c.automation) {
                if (!finite(a.time, 0, c.duration) || !finite(a.value, -96, 24) || a.time < last)
                    bad('Invalid automation point.');
                last = a.time;
            }
        }
    }
    for (const m of p.markers)
        if (!finite(m.time, 0, 86400) || !text(m.name, 200) || !/^#[a-f0-9]{6}$/i.test(m.color))
            bad('Invalid marker.');
    const e = p.effects;
    if(e?.chain!==undefined)validateChain(e.chain);
    if (!e?.eq || !e.compressor || !e.limiter || !finite(e.output, -60, 24) || typeof e.bypass !== 'boolean')
        bad('Invalid master effects.');
    for (const fx of [e.eq, e.compressor, e.limiter])
        if (typeof fx.enabled !== 'boolean')
            bad('Invalid effect state.');
    for (const k of ['low', 'mid', 'high'])
        if (!finite(e.eq[k], -24, 24))
            bad('Invalid EQ.');
    if (!finite(e.eq.frequency, 20, 20000) || !finite(e.eq.q, .05, 20))
        bad('Invalid EQ frequency.');
    if (e.preset != null && (typeof e.preset !== 'string' || e.preset.length > 120))
        bad('Invalid preset label.');
    const c = e.compressor;
    if (!finite(c.threshold, -96, 0) || !finite(c.ratio, 1, 40) || !finite(c.attack, .1, 500) || !finite(c.release, 5, 5000) || !finite(c.makeup, -24, 24) || !finite(e.limiter.ceiling, -30, 0) || !finite(e.limiter.release, 5, 5000))
        bad('Invalid dynamics.');
    if (p.metadata) {
        for (const k of ['title', 'artist', 'comment'])
            if (p.metadata[k] != null && (typeof p.metadata[k] !== 'string' || p.metadata[k].length > 4000))
                bad('Invalid metadata.');
    }
    if (JSON.stringify(p).length > 1000000)
        bad('Project is too large.');
    return p;
}
