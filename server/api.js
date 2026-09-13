import { assetResponse, uploadRoute } from './streaming-assets.js';
import { commitProject, resolveProposal } from './collaboration.js';
import { validateProject } from '../public/modules/session/validation.js';
/** Portable fetch API. Adapter requires D1-compatible DB and R2-compatible BUCKET. */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const clean = (s, n = 120) => String(s ?? '').trim().slice(0, n);
const uuid = () => crypto.randomUUID();
const hash = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
export function validateDocument(p) {
    try {
        return validateProject(p);
    }
    catch (e) {
        fail(e.message);
    }
}
function inspectWav(buffer) {
    const v = new DataView(buffer), str = (o, n) => String.fromCharCode(...new Uint8Array(buffer, o, n));
    if (v.byteLength < 44 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE')
        fail('Upload must be a valid WAV.');
    let fmt = null, data = -1;
    for (let o = 12; o + 8 <= v.byteLength;) {
        const size = v.getUint32(o + 4, true);
        if (o + 8 + size > v.byteLength)
            fail('Truncated WAV.');
        const id = str(o, 4);
        if (id === 'fmt ') {
            if (size < 16)
                fail('Invalid WAV format.');
            let tag = v.getUint16(o + 8, true);
            if (tag === 65534) {
                if (size < 40)
                    fail('Invalid WAV format.');
                tag = v.getUint32(o + 32, true);
            }
            fmt = { tag, nc: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), align: v.getUint16(o + 20, true), bits: v.getUint16(o + 22, true) };
        }
        if (id === 'data')
            data = size;
        o += 8 + size + size % 2;
    }
    if (!fmt || data <= 0 || ![1, 3].includes(fmt.tag) || ![1, 2].includes(fmt.nc) || ![16, 24, 32].includes(fmt.bits) || (fmt.tag === 3 && fmt.bits !== 32) || fmt.align !== fmt.nc * fmt.bits / 8 || data % fmt.align || fmt.rate < 8000 || fmt.rate > 384000)
        fail('Unsupported or malformed WAV.');
}
export async function handleApi(request, env) {
    try {
        const u = new URL(request.url), path = u.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = request.method, db = env.DB, bucket = env.BUCKET;
        if (!db)
            fail('Project service is unavailable. Your local edits are preserved.', 503);
        if (method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== u.origin)
            fail('Cross-origin write rejected.', 403);
        const userId = request.headers.get('oai-authenticated-user-id');
        if (!userId)
            fail('Sign in to save and collaborate.', 401);
        const email = clean(request.headers.get('oai-authenticated-user-email'), 254);
        let name = request.headers.get('oai-authenticated-user-full-name') || email.split('@')[0] || 'Studio member';
        if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8')
            try {
                name = decodeURIComponent(name);
            }
            catch { }
        name = clean(name, 100);
        const body = async () => {
            const text = await request.text();
            if (text.length > 1100000)
                fail('Request too large.', 413);
            try {
                return JSON.parse(text);
            }
            catch {
                fail('Invalid JSON.');
            }
        };
        if (path[0] === 'me') {
            await db.prepare('INSERT INTO users (id,name,email) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email').bind(userId, name, email).run();
            return json({ id: userId, name, email });
        }
        if (path[0] === 'join' && method === 'POST') {
            const b = await body();
            if (typeof b.token !== 'string' || b.token.length > 100)
                fail('Invalid invitation.');
            const token = await hash(b.token), inv = await db.prepare('SELECT * FROM invitations WHERE token=? AND expires>?').bind(token, Date.now()).first();
            if (!inv)
                fail('Invitation expired or already used.', 404);
            const already = await db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').bind(inv.project_id, userId).first();
            if (already)
                fail('You already belong to this project. Your existing role is unchanged.', 409);
            const r = await db.batch([db.prepare('INSERT OR IGNORE INTO members (id,project_id,user_id,role) SELECT ?,project_id,?,role FROM invitations WHERE token=? AND expires>?').bind(inv.project_id + ':' + userId, userId, token, Date.now()), db.prepare('DELETE FROM invitations WHERE token=? AND changes()=1').bind(token)]);
            if (!r[0].meta.changes)
                fail('Invitation expired or already used.', 409);
            return json({ projectId: inv.project_id });
        }
        if (path[0] !== 'projects')
            fail('Not found.', 404);
        if (path.length === 1) {
            if (method === 'GET') {
                const r = await db.prepare('SELECT p.id,p.name,p.revision,p.updated,m.role FROM projects p JOIN members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.updated DESC').bind(userId).all();
                return json(r.results);
            }
            if (method === 'POST') {
                const b = await body(), p = validateDocument(b.project), id = uuid(), now = Date.now();
                p.id = id;
                p.revision = 1;
                const doc = JSON.stringify(p);
                await db.batch([db.prepare('INSERT INTO projects (id,owner,name,document,revision,updated) VALUES (?,?,?,?,1,?)').bind(id, userId, p.name, doc, now), db.prepare('INSERT INTO members (id,project_id,user_id,role) VALUES (?,?,?,?)').bind(id + ':' + userId, id, userId, 'owner'), db.prepare('INSERT INTO versions (id,project_id,revision,document,author,created) VALUES (?,?,1,?,?,?)').bind(id + ':1', id, doc, name, now)]);
                return json({ project: p, role: 'owner' }, 201);
            }
            fail('Method not allowed.', 405);
        }
        const id = path[1];
        const member = await db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').bind(id, userId).first();
        if (!member)
            fail('Project not found or access denied.', 404);
        const editor = () => {
            if (!['owner', 'editor'].includes(member.role))
                fail('This project is read-only for your role.', 403);
        };
        if (path.length === 2) {
            if (method === 'GET') {
                const p = await db.prepare('SELECT document,revision FROM projects WHERE id=?').bind(id).first();
                return json({ project: JSON.parse(p.document), role: member.role });
            }
            if (method === 'PUT') {
                editor();
                const b = await body();
                validateDocument(b.project);
                if (b.baseRevision === undefined) {
                    const current = await db.prepare('SELECT revision FROM projects WHERE id=?').bind(id).first();
                    if (current.revision !== b.revision)
                        fail('A newer revision is available.', 409);
                    b.baseRevision = b.revision;
                    b.operationId = uuid();
                }
                const result = await commitProject(db, id, userId, name, b);
                return json({ ...result, role: member.role });
            }
            fail('Method not allowed.', 405);
        }
        const owner = () => { if (member.role !== 'owner')
            fail('Project owner access required.', 403); };
        const audit = async (action, detail = {}) => db.prepare('INSERT INTO audit_events (id,project_id,actor,action,detail,created) VALUES (?,?,?,?,?,?)').bind(uuid(), id, userId, action, JSON.stringify(detail), Date.now()).run();
        if (path[2] === 'conflicts' && path[3] && path[4] === 'resolve' && method === 'POST') {
            editor();
            return json({ ...await resolveProposal(db, id, userId, name, path[3], await body()), role: member.role });
        }
        if (path[2] === 'admin') {
            owner();
            if (method === 'GET') {
                const settings = await db.prepare('SELECT archived,storage_quota,permission_epoch FROM projects WHERE id=?').bind(id).first(), members = (await db.prepare('SELECT m.user_id,m.role,u.name,u.email FROM members m LEFT JOIN users u ON m.user_id=u.id WHERE m.project_id=?').bind(id).all()).results, storage = await db.prepare('SELECT COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM assets WHERE project_id=?').bind(id).first(), events = (await db.prepare('SELECT * FROM audit_events WHERE project_id=? ORDER BY created DESC LIMIT 200').bind(id).all()).results;
                return json({ settings, members, storage, events });
            }
            if (method === 'PATCH') {
                const b = await body();
                const statements = [];
                const now = Date.now();
                let detail;
                if (b.userId) {
                    if (typeof b.userId !== 'string' || b.userId === userId || !['editor', 'commenter', 'viewer', 'revoke'].includes(b.role))
                        fail('Choose another member and a valid role.');
                    const target = await db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').bind(id, b.userId).first();
                    if (!target || target.role === 'owner')
                        fail('Cannot alter the owner or an unknown member.');
                    statements.push(b.role === 'revoke' ? db.prepare('DELETE FROM members WHERE project_id=? AND user_id=?').bind(id, b.userId) : db.prepare('UPDATE members SET role=? WHERE project_id=? AND user_id=?').bind(b.role, id, b.userId));
                    detail = { userId: b.userId, role: b.role };
                }
                else if (typeof b.archived === 'boolean') {
                    statements.push(db.prepare('UPDATE projects SET archived=? WHERE id=?').bind(b.archived ? 1 : 0, id));
                    detail = { archived: b.archived };
                }
                else if (Number.isSafeInteger(b.storageQuota) && b.storageQuota >= 1048576 && b.storageQuota <= 21474836480) {
                    statements.push(db.prepare('UPDATE projects SET storage_quota=? WHERE id=?').bind(b.storageQuota, id));
                    detail = { storageQuota: b.storageQuota };
                }
                else
                    fail('Invalid administration change.');
                statements.push(db.prepare('UPDATE projects SET permission_epoch=permission_epoch+1 WHERE id=?').bind(id), db.prepare('INSERT INTO audit_events (id,project_id,actor,action,detail,created) VALUES (?,?,?,?,?,?)').bind(uuid(), id, userId, 'admin.change', JSON.stringify(detail), now));
                await db.batch(statements);
                return json({ ok: true });
            }
        }
        if (path[2] === 'invite' && method === 'DELETE') {
            owner();
            await db.batch([db.prepare('DELETE FROM invitations WHERE project_id=?').bind(id), db.prepare('INSERT INTO audit_events (id,project_id,actor,action,detail,created) VALUES (?,?,?,?,?,?)').bind(uuid(), id, userId, 'invitations.revoke', '{}', Date.now())]);
            return json({ ok: true });
        }
        if (path[2] === 'events' && method === 'GET') {
            const encoder = new TextEncoder();
            let timer, closed = false;
            let previous = '';
            let rounds = 0;
            const stream = new ReadableStream({ start(controller) { const tick = async () => { if (closed)
                    return; try {
                    const access = await db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').bind(id, userId).first();
                    if (!access) {
                        controller.enqueue(encoder.encode('event: revoked\ndata: {}\n\n'));
                        closed = true;
                        controller.close();
                        return;
                    }
                    const row = await db.prepare('SELECT revision,permission_epoch,archived FROM projects WHERE id=?').bind(id).first();
                    const comments = await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(resolved),0) AS resolved FROM comments WHERE project_id=?').bind(id).first();
                    const data = JSON.stringify({ ...row, ...comments });
                    if (data !== previous) {
                        controller.enqueue(encoder.encode('event: session\ndata: ' + data + '\n\n'));
                        previous = data;
                    }
                    else
                        controller.enqueue(encoder.encode(': keepalive\n\n'));
                    if (++rounds >= 25) {
                        closed = true;
                        controller.close();
                    }
                    else
                        timer = setTimeout(tick, 1000);
                }
                catch {
                    closed = true;
                    try {
                        controller.close();
                    }
                    catch { }
                } }; tick(); }, cancel() { closed = true; clearTimeout(timer); } });
            return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-store', 'connection': 'keep-alive' } });
        }
        if (method !== 'GET' && path[2] !== 'presence') {
            const state = await db.prepare('SELECT archived FROM projects WHERE id=?').bind(id).first();
            if (state.archived)
                fail('Project is archived. An owner can reopen it in Administration.', 403);
        }
        if (path[2] === 'assets') {
            const assetId = path[3];
            if (!assetId || assetId.length > 100 || !/^[\w-]+$/.test(assetId))
                fail('Invalid asset id.');
            if (!bucket)
                fail('Audio storage is unavailable.', 503);
            if (path[4] === 'upload') {
                editor();
                return json(await uploadRoute(request, db, bucket, id, userId, assetId, path, body));
            }
            if (method === 'GET') {
                const a = await db.prepare('SELECT * FROM assets WHERE project_id=? AND asset_id=?').bind(id, assetId).first();
                if (!a)
                    fail('Audio file not found.', 404);
                return assetResponse(request, bucket, a);
            }
            if (method === 'PUT') {
                editor();
                const limit = 48 * 1024 * 1024;
                if (Number(request.headers.get('content-length') || 0) > limit)
                    fail('Audio upload exceeds 48 MB.', 413);
                const reader = request.body?.getReader();
                if (!reader)
                    fail('Missing audio data.');
                let chunks = [], size = 0;
                while (true) {
                    const r = await reader.read();
                    if (r.done)
                        break;
                    size += r.value.byteLength;
                    if (size > limit) {
                        await reader.cancel();
                        fail('Audio upload exceeds 48 MB.', 413);
                    }
                    chunks.push(r.value);
                }
                const data = new Uint8Array(size);
                let at = 0;
                for (const c of chunks) {
                    data.set(c, at);
                    at += c.length;
                }
                chunks = [];
                inspectWav(data.buffer);
                const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(b => b.toString(16).padStart(2, '0')).join('');
                const existing = await db.prepare('SELECT key,hash FROM assets WHERE project_id=? AND asset_id=?').bind(id, assetId).first();
                if (existing) {
                    if (existing.hash !== digest)
                        fail('This asset id already contains different audio. Import it as a new source.', 409);
                    return json({ assetId, stored: true });
                }
                let filename = request.headers.get('x-file-name') || 'Audio.wav';
                try {
                    filename = decodeURIComponent(filename);
                }
                catch { }
                const key = id + '/' + assetId + '/' + digest + '.wav';
                await bucket.put(key, data, { httpMetadata: { contentType: 'audio/wav' } });
                const inserted = await db.prepare("INSERT OR IGNORE INTO assets (id,project_id,asset_id,name,size,key,hash) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM assets WHERE project_id=?)<200 AND (SELECT COALESCE(SUM(size),0) FROM assets WHERE project_id=?)+?<=(SELECT storage_quota FROM projects WHERE id=?) AND EXISTS (SELECT 1 FROM members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner','editor') AND p.archived=0)").bind(id + ':' + assetId, id, assetId, clean(filename, 240), size, key, digest, id, id, size, id, id, userId).run();
                if (!inserted.meta.changes) {
                    const winner = await db.prepare('SELECT key,hash FROM assets WHERE project_id=? AND asset_id=?').bind(id, assetId).first();
                    if (winner?.key !== key)
                        await bucket.delete(key);
                    if (winner?.hash !== digest)
                        fail(winner ? 'Asset identity conflict. Import as a new source.' : 'Project audio quota reached.', 409);
                }
                return json({ assetId, stored: true });
            }
        }
        if (path[2] === 'comments') {
            if (method === 'GET') {
                const r = await db.prepare('SELECT * FROM comments WHERE project_id=? ORDER BY created').bind(id).all();
                return json(r.results);
            }
            if (method === 'POST') {
                if (member.role === 'viewer')
                    fail('Comment access required.', 403);
                const b = await body(), text = clean(b.text, 4000);
                if (!text || !Number.isFinite(b.time) || b.time < 0 || b.time > 86400)
                    fail('Enter a comment and valid time.');
                const cid = uuid();
                const inserted = await db.prepare("INSERT INTO comments (id,project_id,author,name,body,time,resolved,created) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS (SELECT 1 FROM members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner','editor','commenter') AND p.archived=0)").bind(cid, id, userId, name, text, b.time, Date.now(), id, userId).run();
                if (!inserted.meta.changes)
                    fail('Comment permission changed.', 403);
                return json({ id: cid }, 201);
            }
            if (method === 'PATCH') {
                const b = await body();
                const c = await db.prepare('SELECT author FROM comments WHERE id=? AND project_id=?').bind(b.id, id).first();
                if (!c || (c.author !== userId && member.role !== 'owner'))
                    fail('Only the comment author or project owner can resolve it.', 403);
                await db.prepare('UPDATE comments SET resolved=? WHERE id=? AND project_id=?').bind(b.resolved ? 1 : 0, b.id, id).run();
                return json({ ok: true });
            }
        }
        if (path[2] === 'presence' && method === 'POST') {
            const b = await body();
            const pos = Number.isFinite(b.position) ? Math.max(0, Math.min(86400, b.position)) : 0;
            await db.prepare('INSERT INTO presence (id,project_id,user_id,name,position,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,updated=excluded.updated').bind(id + ':' + userId, id, userId, name, pos, Date.now()).run();
            const rows = await db.prepare('SELECT user_id,name,position FROM presence WHERE project_id=? AND updated>?').bind(id, Date.now() - 20000).all();
            const p = await db.prepare('SELECT revision FROM projects WHERE id=?').bind(id).first();
            return json({ members: rows.results, revision: p.revision });
        }
        if (path[2] === 'invite' && method === 'POST') {
            if (member.role !== 'owner')
                fail('Only the owner can create invitations.', 403);
            const b = await body();
            if (!['editor', 'commenter', 'viewer'].includes(b.role))
                fail('Invalid role.');
            const token = uuid() + uuid();
            await db.prepare('INSERT INTO invitations (token,project_id,role,expires) VALUES (?,?,?,?)').bind(await hash(token), id, b.role, Date.now() + 24 * 3600000).run();
            await audit('invitation.create', { role: b.role, expiresInHours: 24 });
            return json({ token, expiresInHours: 24 });
        }
        if (path[2] === 'versions' && method === 'GET') {
            if (path[3]) {
                const v = await db.prepare('SELECT document FROM versions WHERE project_id=? AND revision=?').bind(id, Number(path[3])).first();
                if (!v)
                    fail('Version not found.', 404);
                return json({ project: JSON.parse(v.document) });
            }
            const r = await db.prepare('SELECT revision,author,created FROM versions WHERE project_id=? ORDER BY revision DESC LIMIT 100').bind(id).all();
            return json(r.results);
        }
        fail('Not found.', 404);
    }
    catch (e) {
        if (!e.status)
            console.error('Auralis API', e);
        return json({ error: e.status ? e.message : 'The project service could not complete this request. Your edits are preserved.', ...(e.status ? { code: e.code, proposalId: e.proposalId, headRevision: e.headRevision, conflicts: e.conflicts } : {}) }, e.status || 500);
    }
}
