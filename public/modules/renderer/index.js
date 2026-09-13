/** Reusable waveform view. GPU draws waveform primitives; Canvas renders labels and guides. */
const hex = c => { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255, 1]; };
export const waveformShader = `struct Bar { box:vec4f, color:vec4f }; @group(0) @binding(0) var<storage,read> bars:array<Bar>; struct Output { @builtin(position) position:vec4f, @location(0) color:vec4f }; @vertex fn vs(@builtin(vertex_index) i:u32,@builtin(instance_index) j:u32)->Output { let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1)); var o:Output;o.position=vec4f(bars[j].box.xy+corners[i]*bars[j].box.zw,0,1);o.color=bars[j].color;return o;} @fragment fn fs(i:Output)->@location(0) vec4f{return i.color;}`;
export class WaveformRenderer extends EventTarget {
    constructor(host) {
        super();
        this.host = host;
        host.style.position = 'relative';
        this.base = document.createElement('canvas');
        this.gpu = document.createElement('canvas');
        this.overlay = document.createElement('canvas');
        for (const canvas of [this.base, this.gpu, this.overlay]) {
            canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
            host.append(canvas);
        }
        this.ctx = this.base.getContext('2d');
        this.top = this.overlay.getContext('2d');
        this.cache = new WeakMap();
        this.mode = 'Canvas 2D';
        this.observer = new ResizeObserver(() => this.render());
        this.observer.observe(host);
        this.initGPU();
    }
    async initGPU() {
        try {
            if (!navigator.gpu)
                return;
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter)
                return;
            this.device = await adapter.requestDevice();
            this.gctx = this.gpu.getContext('webgpu');
            const format = navigator.gpu.getPreferredCanvasFormat();
            this.gctx.configure({ device: this.device, format, alphaMode: 'premultiplied' });
            const module = this.device.createShaderModule({ code: waveformShader });
            this.pipeline = this.device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
            this.device.lost.then(() => { this.device = null; this.gpu.style.display = 'none'; this.mode = 'Canvas 2D'; this.render(); });
            this.mode = 'WebGPU';
            this.dispatchEvent(new Event('ready'));
            this.render();
        }
        catch {
            this.device = null;
            this.mode = 'Canvas 2D';
        }
    }
    peaks(channel, from, to) {
        if (channel.peakBlock) {
            let lo = 0, hi = 0;
            const a = Math.max(0, Math.floor(from / channel.peakBlock)), b = Math.min(channel.min.length, Math.ceil(to / channel.peakBlock));
            for (let i = a; i < b; i++) {
                lo = Math.min(lo, channel.min[i]);
                hi = Math.max(hi, channel.max[i]);
            }
            return [lo, hi];
        }
        let cached = this.cache.get(channel);
        if (!cached) {
            const n = Math.ceil(channel.length / 256), min = new Float32Array(n), max = new Float32Array(n);
            for (let j = 0; j < n; j++) {
                let lo = 0, hi = 0;
                for (let i = j * 256; i < Math.min(channel.length, (j + 1) * 256); i++) {
                    lo = Math.min(lo, channel[i]);
                    hi = Math.max(hi, channel[i]);
                }
                min[j] = lo;
                max[j] = hi;
            }
            cached = { min, max };
            this.cache.set(channel, cached);
        }
        from = Math.max(0, Math.floor(from));
        to = Math.min(channel.length, Math.max(from + 1, Math.ceil(to)));
        let lo = 0, hi = 0;
        if (to - from > 512) {
            const first = Math.ceil(from / 256), last = Math.floor(to / 256);
            for (let i = from; i < Math.min(to, first * 256); i++) {
                lo = Math.min(lo, channel[i]);
                hi = Math.max(hi, channel[i]);
            }
            for (let i = first; i < last; i++) {
                lo = Math.min(lo, cached.min[i]);
                hi = Math.max(hi, cached.max[i]);
            }
            for (let i = Math.max(from, last * 256); i < to; i++) {
                lo = Math.min(lo, channel[i]);
                hi = Math.max(hi, channel[i]);
            }
        }
        else
            for (let i = from; i < to; i++) {
                lo = Math.min(lo, channel[i]);
                hi = Math.max(hi, channel[i]);
            }
        return [lo, hi];
    }
    setScene(scene) { this.scene = scene; this.render(); }
    geometry() { const w = this.host.clientWidth, h = this.host.clientHeight, montage = this.scene?.mode === 'montage', left = montage ? 146 : 40, tracks = montage ? Math.max(2, this.scene.project.tracks.length) : 2, trackHeight = montage ? Math.max(88, (h - 40) / Math.min(4, tracks)) : (h - 40) / tracks, trackOffset = montage ? Math.max(0, Math.min(this.scene.trackOffset || 0, Math.max(0, tracks - Math.floor((h - 40) / trackHeight)))) : 0; return { w, h, left, top: 40, trackHeight, trackOffset }; }
    timeAt(x) { const g = this.geometry(); return this.scene.viewStart + (x - g.left) / (g.w - g.left) * this.scene.viewDuration; }
    render() {
        if (!this.scene)
            return;
        const { project, assets, selectedId, viewStart, viewDuration, mode, selection } = this.scene;
        const g = this.geometry(), { w, h, left, top, trackHeight } = g;
        if (!w || !h)
            return;
        const dpr = Math.min(2, devicePixelRatio || 1);
        for (const c of [this.base, this.gpu, this.overlay]) {
            if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
                c.width = Math.round(w * dpr);
                c.height = Math.round(h * dpr);
            }
        }
        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#171d26';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#283443';
        ctx.fillRect(0, 0, w, top);
        ctx.font = '11px ui-monospace,monospace';
        ctx.textBaseline = 'middle';
        const x = t => left + (t - viewStart) / viewDuration * (w - left);
        const interval = viewDuration > 120 ? 30 : viewDuration > 60 ? 10 : viewDuration > 20 ? 5 : viewDuration > 5 ? 1 : .2;
        for (let t = Math.ceil(viewStart / interval) * interval; t < viewStart + viewDuration; t += interval) {
            const px = x(t);
            ctx.strokeStyle = '#2c343a';
            ctx.beginPath();
            ctx.moveTo(px, top);
            ctx.lineTo(px, h);
            ctx.stroke();
            ctx.fillStyle = '#899397';
            ctx.fillText(t >= 60 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : `${Math.round(t * 10) / 10}s`, px + 6, 15);
        }
        const bars = [];
        const rect = (rx, ry, rw, rh, color) => {
            if (rh < .5)
                rh = .5;
            if (this.device)
                bars.push(rx / w * 2 - 1, 1 - ry / h * 2, rw / w * 2, -rh / h * 2, ...hex(color));
            else {
                ctx.fillStyle = color;
                ctx.fillRect(rx, ry, rw, rh);
            }
        };
        const active = project.clips.find(c => c.id === selectedId) || project.clips[0];
        const clips = mode === 'montage' ? project.clips : active ? [active] : [];
        if (mode === 'montage') {
            project.tracks.forEach((t, i) => { const y = top + (i - g.trackOffset) * trackHeight; if (y + trackHeight <= top || y >= h)
                return; ctx.fillStyle = '#2c3949'; ctx.fillRect(0, y, left, trackHeight); ctx.fillStyle = t.color; ctx.fillRect(0, y, 3, trackHeight); ctx.fillStyle = '#e3e7e7'; ctx.font = '12px system-ui'; ctx.fillText(t.name.slice(0, 18), 15, y + 25); ctx.fillStyle = '#899397'; ctx.font = '11px ui-monospace'; ctx.fillText(`${t.gain.toFixed(1)} dB`, 15, y + 47); ctx.fillStyle = t.mute ? '#e8b376' : '#778387'; ctx.fillText(t.mute ? 'MUTED' : t.solo ? 'SOLO' : 'STEREO', 15, y + 68); ctx.strokeStyle = '#374046'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); });
        }
        for (const clip of clips) {
            const a = assets.get(clip.assetId);
            if (!a)
                continue;
            const ti = mode === 'montage' ? project.tracks.findIndex(t => t.id === clip.trackId) : 0, color = mode === 'montage' ? project.tracks[ti]?.color || '#74bfcc' : '#c6b06f';
            const start = mode === 'montage' ? clip.start : 0, end = start + clip.duration, cx = Math.max(left, x(start)), cw = Math.min(w, x(end)) - cx;
            if (cw <= 0)
                continue;
            const cy = top + (ti - g.trackOffset) * trackHeight, ch = mode === 'montage' ? trackHeight : h - top;
            if (cy + ch <= top || cy >= h)
                continue;
            if (mode === 'montage') {
                ctx.fillStyle = (this.scene.selectedIds ? this.scene.selectedIds.includes(clip.id) : clip.id === selectedId) ? '#30475b' : '#283943';
                ctx.fillRect(cx, cy + 7, cw, ch - 14);
                ctx.strokeStyle = (this.scene.selectedIds ? this.scene.selectedIds.includes(clip.id) : clip.id === selectedId) ? color : '#506057';
                ctx.strokeRect(cx + .5, cy + 7.5, cw - 1, ch - 15);
                ctx.fillStyle = color;
                ctx.font = '11px system-ui';
                ctx.save();
                ctx.beginPath();
                ctx.rect(cx, cy, cw, ch);
                ctx.clip();
                ctx.fillText(clip.name, cx + 10, cy + 23);
                ctx.restore();
            }
            const nch = mode === 'montage' ? 1 : a.channels.length;
            for (let c = 0; c < nch; c++) {
                const band = mode === 'montage' ? ch - 40 : ch / nch, mid = mode === 'montage' ? cy + 30 + band / 2 : top + c * band + band / 2;
                ctx.strokeStyle = '#394537';
                ctx.beginPath();
                ctx.moveTo(cx, mid);
                ctx.lineTo(cx + cw, mid);
                ctx.stroke();
                if (mode !== 'montage' && !this.scene.spectral) {
                    ctx.fillStyle = '#89978b';
                    ctx.font = '11px ui-monospace';
                    ctx.fillText(c === 0 ? 'L' : 'R', 14, mid);
                    for (const val of [-.5, .5]) {
                        ctx.fillStyle = '#657166';
                        ctx.fillText(String(val), 4, mid - val * band * .45);
                    }
                }
                for (let px = cx; px < cx + cw; px += 1.8) {
                    const local = viewStart + (px - left) / (w - left) * viewDuration - start;
                    const span = viewDuration / (w - left) * 1.8;
                    const [lo, hi] = this.peaks(a.channels[c], (clip.offset + local) * a.sampleRate, Math.min(clip.offset + clip.duration, clip.offset + local + span) * a.sampleRate);
                    let gain = 10 ** ((clip.gain || 0) / 20);
                    if (clip.fadeIn)
                        gain *= Math.min(1, Math.max(0, local / clip.fadeIn));
                    if (clip.fadeOut)
                        gain *= Math.min(1, Math.max(0, (clip.duration - local) / clip.fadeOut));
                    const scale = band * .45 * (this.scene.amplitude || 1);
                    const max = band * .45;
                    const y1 = mid - Math.min(max, hi * scale * gain), y2 = mid - Math.max(-max, lo * scale * gain);
                    rect(px, y1, 1.15, y2 - y1, color);
                }
            }
            if (mode === 'montage' && clip.id === selectedId) {
                ctx.strokeStyle = '#cbe797';
                ctx.beginPath();
                ctx.moveTo(x(start), cy + ch - 9);
                ctx.lineTo(x(start + clip.fadeIn), cy + 30);
                ctx.lineTo(x(end - clip.fadeOut), cy + 30);
                ctx.lineTo(x(end), cy + ch - 9);
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.fillRect(cx + 1, cy + ch / 2 - 7, 3, 14);
                ctx.fillRect(cx + cw - 4, cy + ch / 2 - 7, 3, 14);
            }
        }
        if (this.device) {
            const data = new Float32Array(bars.length ? bars : 8);
            if (!this.buffer || this.capacity < data.byteLength) {
                this.buffer?.destroy();
                this.capacity = Math.max(4096, data.byteLength * 2);
                this.buffer = this.device.createBuffer({ size: this.capacity, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                this.bind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.buffer } }] });
            }
            this.device.queue.writeBuffer(this.buffer, 0, data);
            const encoder = this.device.createCommandEncoder();
            const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.gctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bind);
            pass.draw(6, bars.length / 8);
            pass.end();
            this.device.queue.submit([encoder.finish()]);
        }
        this.drawCursor(this.scene.cursor || 0);
    }
    drawCursor(time) {
        if (!this.scene)
            return;
        const { w, h, left, top } = this.geometry(), dpr = Math.min(2, devicePixelRatio || 1), ctx = this.top;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const x = t => left + (t - this.scene.viewStart) / this.scene.viewDuration * (w - left);
        const sel = this.scene.selection;
        if (sel && sel[1] > sel[0]) {
            const hz = this.scene.frequencySelection, asset = this.scene.assets.get(this.scene.project.clips.find(c => c.id === this.scene.selectedId)?.assetId), nyquist = (asset?.sampleRate || 48000) / 2;
            const sy = this.scene.spectral && hz ? top + (1 - Math.sqrt(Math.min(nyquist, hz[1]) / nyquist)) * (h - top) : top, ey = this.scene.spectral && hz ? top + (1 - Math.sqrt(Math.max(0, hz[0]) / nyquist)) * (h - top) : h;
            ctx.fillStyle = 'rgba(130,180,238,.16)';
            ctx.fillRect(Math.max(left, x(sel[0])), sy, Math.min(w, x(sel[1])) - Math.max(left, x(sel[0])), ey - sy);
            ctx.strokeStyle = '#8bbaf0';
            if (this.scene.spectral)
                ctx.strokeRect(Math.max(left, x(sel[0])), sy, Math.min(w, x(sel[1])) - Math.max(left, x(sel[0])), ey - sy);
            for (const t of sel) {
                ctx.beginPath();
                ctx.moveTo(x(t), top);
                ctx.lineTo(x(t), h);
                ctx.stroke();
            }
        }
        for (const m of this.scene.project.markers) {
            const active = this.scene.project.clips.find(c => c.id === this.scene.selectedId);
            const px = x(m.time - (this.scene.mode === 'audio' ? (active?.start || 0) : 0));
            if (px < left || px > w)
                continue;
            ctx.fillStyle = m.color || '#d7ec94';
            ctx.fillRect(px, 24, 2, 16);
            ctx.font = '10px system-ui';
            ctx.fillText(m.name.slice(0, 20), px + 5, 33);
        }
        const px = x(time);
        if (px >= left && px <= w) {
            ctx.strokeStyle = '#f0eee6';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, top);
            ctx.lineTo(px, h);
            ctx.stroke();
            ctx.fillStyle = '#f0eee6';
            ctx.beginPath();
            ctx.moveTo(px - 5, top);
            ctx.lineTo(px + 5, top);
            ctx.lineTo(px, top + 6);
            ctx.fill();
        }
    }
    destroy() {
        this.observer.disconnect();
        this.buffer?.destroy();
        this.device?.destroy();
        for (const c of [this.base, this.gpu, this.overlay])
            c.remove();
    }
}
