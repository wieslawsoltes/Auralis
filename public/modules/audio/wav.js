/** RIFF/WAVE codec; mono/stereo PCM 16/24/32 and IEEE float32. */
export function encodeWav(channels, sampleRate, { bits = 24, float = false, dither = true, metadata = {} } = {}) {
    if (!channels.length || channels.length > 2)
        throw Error('WAV export supports mono or stereo.');
    if (![16, 24, 32].includes(bits) || float && bits !== 32)
        throw Error('Invalid WAV format.');
    const n = channels[0].length, nc = channels.length, bps = bits / 8;
    if (channels.some(c => c.length !== n))
        throw Error('Channel lengths differ.');
    const enc = new TextEncoder();
    let info = [];
    for (const [id, value] of Object.entries({ INAM: metadata.title, IART: metadata.artist, ICMT: metadata.comment })) {
        if (!value)
            continue;
        const bytes = enc.encode(String(value).slice(0, 1024) + '\0');
        info.push({ id, bytes });
    }
    const infoSize = info.length ? 4 + info.reduce((s, x) => s + 8 + x.bytes.length + (x.bytes.length % 2), 0) : 0;
    const extensible = bits > 16 && !float, fmt = extensible ? 40 : float ? 18 : 16, fact = float ? 12 : 0, dataSize = n * nc * bps, pad = dataSize % 2, total = 12 + 8 + fmt + fact + 8 + dataSize + pad + (infoSize ? 8 + infoSize : 0);
    if (total > 0xffffffff)
        throw Error('WAV exceeds RIFF 4 GB size limit.');
    const buffer = new ArrayBuffer(total), v = new DataView(buffer);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, total - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, fmt, true);
    v.setUint16(20, extensible ? 65534 : float ? 3 : 1, true);
    v.setUint16(22, nc, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * nc * bps, true);
    v.setUint16(32, nc * bps, true);
    v.setUint16(34, bits, true);
    if (extensible) {
        v.setUint16(36, 22, true);
        v.setUint16(38, bits, true);
        v.setUint32(40, nc === 1 ? 4 : 3, true);
        v.setUint32(44, 1, true);
        v.setUint16(48, 0, true);
        v.setUint16(50, 16, true);
        [128, 0, 0, 170, 0, 56, 155, 113].forEach((b, i) => v.setUint8(52 + i, b));
    }
    else if (float)
        v.setUint16(36, 0, true);
    let o = 20 + fmt;
    if (float) {
        str(o, 'fact');
        v.setUint32(o + 4, 4, true);
        v.setUint32(o + 8, n, true);
        o += 12;
    }
    str(o, 'data');
    v.setUint32(o + 4, dataSize, true);
    o += 8;
    for (let i = 0; i < n; i++)
        for (let ch = 0; ch < nc; ch++) {
            let x = Number.isFinite(channels[ch][i]) ? channels[ch][i] : 0;
            if (float)
                v.setFloat32(o, x, true);
            else {
                const scale = 2 ** (bits - 1);
                x = Math.max(-1, Math.min(1, x + (dither ? (Math.random() - Math.random()) / scale : 0)));
                const q = Math.max(-scale, Math.min(scale - 1, Math.round(x * scale)));
                if (bits === 16)
                    v.setInt16(o, q, true);
                else if (bits === 24) {
                    v.setUint8(o, q & 255);
                    v.setUint8(o + 1, (q >> 8) & 255);
                    v.setUint8(o + 2, (q >> 16) & 255);
                }
                else
                    v.setInt32(o, q, true);
            }
            o += bps;
        }
    o += pad;
    if (infoSize) {
        str(o, 'LIST');
        v.setUint32(o + 4, infoSize, true);
        str(o + 8, 'INFO');
        o += 12;
        for (const { id, bytes } of info) {
            str(o, id);
            v.setUint32(o + 4, bytes.length, true);
            new Uint8Array(buffer, o + 8, bytes.length).set(bytes);
            o += 8 + bytes.length + bytes.length % 2;
        }
    }
    return buffer;
}
export function decodeWav(buffer) {
    const v = new DataView(buffer), str = (o, n) => String.fromCharCode(...new Uint8Array(buffer, o, n));
    if (buffer.byteLength < 12 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE')
        throw Error('Not a RIFF WAVE file.');
    let fmt, offset, length;
    for (let o = 12; o + 8 <= v.byteLength;) {
        const id = str(o, 4), size = v.getUint32(o + 4, true);
        if (o + 8 + size > v.byteLength)
            throw Error('Truncated WAV chunk.');
        if (id === 'fmt ') {
            if (size < 16)
                throw Error('Invalid WAV format.');
            let tag = v.getUint16(o + 8, true);
            if (tag === 65534) {
                if (size < 40)
                    throw Error('Invalid extensible format.');
                tag = v.getUint32(o + 32, true);
            }
            fmt = { tag, nc: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), align: v.getUint16(o + 20, true), bits: v.getUint16(o + 22, true) };
        }
        if (id === 'data') {
            offset = o + 8;
            length = size;
        }
        o += 8 + size + size % 2;
    }
    if (!fmt || offset === undefined)
        throw Error('WAV format or audio chunk missing.');
    const { tag, nc, sampleRate, bits, align } = fmt;
    if (![1, 3].includes(tag) || nc < 1 || nc > 2 || ![16, 24, 32].includes(bits) || (tag === 3 && bits !== 32) || align !== nc * bits / 8 || sampleRate < 8000 || sampleRate > 384000)
        throw Error('WAV encoding unsupported by built-in codec.');
    if (length % align)
        throw Error('Incomplete WAV frame.');
    const n = length / align, channels = Array.from({ length: nc }, () => new Float32Array(n));
    let o = offset;
    for (let i = 0; i < n; i++)
        for (let c = 0; c < nc; c++) {
            let x;
            if (tag === 3)
                x = v.getFloat32(o, true);
            else if (bits === 16)
                x = v.getInt16(o, true) / 32768;
            else if (bits === 24) {
                let q = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16);
                if (q & 0x800000)
                    q |= 0xff000000;
                x = q / 8388608;
            }
            else
                x = v.getInt32(o, true) / 2147483648;
            channels[c][i] = Number.isFinite(x) ? x : 0;
            o += bits / 8;
        }
    return { channels, sampleRate, duration: n / sampleRate };
}
