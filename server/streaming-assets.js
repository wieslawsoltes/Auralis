import { WavPCMProvider } from '../public/modules/audio/streaming.js';
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('');
const bytesOf = async (object) => new Uint8Array(await new Response(object.body).arrayBuffer());
export async function readAssetRange(bucket, asset, start, length) { if (!asset.manifest) {
    const object = await bucket.get(asset.key, { range: { offset: start, length } });
    if (!object)
        fail('Audio unavailable.', 404);
    const bytes = await bytesOf(object);
    return bytes.length === length ? bytes : bytes.slice(start, start + length);
} const parts = JSON.parse(asset.manifest), result = new Uint8Array(length); let offset = 0, write = 0; for (const part of parts) {
    const a = Math.max(start, offset), b = Math.min(start + length, offset + part.size);
    if (b > a) {
        const object = await bucket.get(part.key, { range: { offset: a - offset, length: b - a } });
        if (!object)
            fail('Audio chunk unavailable.', 404);
        const bytes = await bytesOf(object);
        result.set(bytes.length === b - a ? bytes : bytes.subarray(a - offset, b - offset), write);
        write += b - a;
    }
    offset += part.size;
    if (offset >= start + length)
        break;
} if (write !== length)
    fail('Incomplete audio manifest.', 500); return result; }
export async function assetResponse(request, bucket, asset) { const range = request.headers.get('range'); const headers = { 'content-type': 'audio/wav', 'cache-control': 'private, no-store', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' }; if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m)
        fail('Only a single explicit byte range is supported.', 416);
    const start = Number(m[1]), end = Math.min(asset.size - 1, m[2] ? Number(m[2]) : asset.size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.size || end - start + 1 > 16 * 1024 * 1024)
        fail('Invalid range or range exceeds 16 MB.', 416);
    return new Response(await readAssetRange(bucket, asset, start, end - start + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${asset.size}`, 'content-length': String(end - start + 1) } });
} if (!asset.manifest) {
    const object = await bucket.get(asset.key);
    if (!object)
        fail('Audio unavailable.', 404);
    return new Response(object.body, { headers: { ...headers, 'content-length': String(asset.size) } });
} let at = 0; const body = new ReadableStream({ async pull(controller) { try {
        if (at >= asset.size) {
            controller.close();
            return;
        }
        const length = Math.min(2 * 1024 * 1024, asset.size - at);
        controller.enqueue(await readAssetRange(bucket, asset, at, length));
        at += length;
    }
    catch (e) {
        controller.error(e);
    } } }); return new Response(body, { headers: { ...headers, 'content-length': String(asset.size) } }); }
export async function uploadRoute(request, db, bucket, projectId, actor, assetId, path, body) {
    const method = request.method;
    if (path[4] === 'upload' && path.length === 5 && method === 'POST') {
        const b = await body(), chunkSize = 2 * 1024 * 1024, size = Number(b.size);
        if (!Number.isSafeInteger(size) || size < 44 || size > 0xffffffff)
            fail('WAV must be between 44 bytes and 4 GiB.');
        const id = crypto.randomUUID(), now = Date.now();
        const r = await db.prepare("INSERT INTO asset_uploads (id,project_id,asset_id,actor,name,size,chunk_size,created,expires) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM assets WHERE project_id=?)+(SELECT COALESCE(SUM(size),0) FROM asset_uploads WHERE project_id=? AND complete=0 AND expires>?)+?<=(SELECT storage_quota FROM projects WHERE id=?)").bind(id, projectId, assetId, actor, String(b.name || 'Audio.wav').slice(0, 240), size, chunkSize, now, now + 86400000, projectId, projectId, now, size, projectId).run();
        if (!r.meta.changes)
            fail('Storage quota does not cover this upload.', 413);
        return { uploadId: id, chunkSize, parts: Math.ceil(size / chunkSize) };
    }
    const uploadId = path[5], u = await db.prepare('SELECT * FROM asset_uploads WHERE id=? AND project_id=? AND asset_id=? AND actor=?').bind(uploadId, projectId, assetId, actor).first();
    if (!u || u.expires < Date.now())
        fail('Upload not found or expired.', 404);
    if (u.complete)
        return { assetId, stored: true };
    if (path[6] === 'complete' && method === 'POST') {
        const parts = (await db.prepare('SELECT part,key,hash,size FROM upload_chunks WHERE upload_id=? ORDER BY part').bind(u.id).all()).results;
        if (parts.length !== Math.ceil(u.size / u.chunk_size) || parts.some((p, i) => p.part !== i) || parts.reduce((n, p) => n + p.size, 0) !== u.size)
            fail('Upload is incomplete.', 409);
        const manifest = JSON.stringify(parts), asset = { manifest, size: u.size };
        const fakeBlob = { slice(start, end) { return { async arrayBuffer() { return (await readAssetRange(bucket, asset, start, end - start)).buffer; } }; } };
        const provider = await WavPCMProvider.open(fakeBlob);
        if (provider.descriptor.dataOffset + provider.descriptor.dataBytes > u.size)
            fail('Truncated uploaded WAV.');
        const hash = await digest(new TextEncoder().encode(JSON.stringify(parts.map(p => [p.hash, p.size])))), existing = await db.prepare('SELECT hash FROM assets WHERE project_id=? AND asset_id=?').bind(projectId, assetId).first();
        if (existing && existing.hash !== hash)
            fail('Audio source identity already exists.', 409);
        const key = 'chunks/' + u.id;
        const r = await db.batch([db.prepare("INSERT OR IGNORE INTO assets (id,project_id,asset_id,name,size,key,hash,manifest) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM members WHERE project_id=? AND user_id=? AND role IN ('owner','editor')) AND EXISTS (SELECT 1 FROM projects WHERE id=? AND archived=0)").bind(projectId + ':' + assetId, projectId, assetId, u.name, u.size, key, hash, manifest, projectId, actor, projectId), db.prepare('UPDATE asset_uploads SET complete=1 WHERE id=? AND EXISTS (SELECT 1 FROM assets WHERE project_id=? AND asset_id=? AND hash=?)').bind(u.id, projectId, assetId, hash)]);
        if (!r[1].meta.changes)
            fail('Upload could not be committed.', 409);
        return { assetId, stored: true, descriptor: provider.descriptor };
    }
    if (method === 'PUT' && /^\d+$/.test(path[6] || '')) {
        const part = Number(path[6]), expected = Math.min(u.chunk_size, u.size - part * u.chunk_size);
        if (part < 0 || part >= Math.ceil(u.size / u.chunk_size))
            fail('Invalid part.');
        const reader = request.body?.getReader();
        if (!reader)
            fail('Missing chunk.');
        const data = new Uint8Array(expected);
        let at = 0;
        while (true) {
            const r = await reader.read();
            if (r.done)
                break;
            if (at + r.value.length > expected) {
                await reader.cancel();
                fail('Chunk too large.', 413);
            }
            data.set(r.value, at);
            at += r.value.length;
        }
        if (at !== expected)
            fail('Chunk length mismatch.');
        const hash = await digest(data), key = projectId + '/uploads/' + u.id + '/' + part + '/' + hash;
        await bucket.put(key, data);
        const inserted = await db.prepare("INSERT OR IGNORE INTO upload_chunks (upload_id,part,key,hash,size) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner','editor') AND p.archived=0)").bind(u.id, part, key, hash, at, projectId, actor).run();
        if (!inserted.meta.changes) {
            const winner = await db.prepare('SELECT key,hash FROM upload_chunks WHERE upload_id=? AND part=?').bind(u.id, part).first();
            if (winner?.key !== key)
                await bucket.delete(key);
            if (winner?.hash !== hash)
                fail('Chunk already contains different bytes.', 409);
        }
        return { part, stored: true };
    }
    fail('Unknown upload operation.', 404);
}
